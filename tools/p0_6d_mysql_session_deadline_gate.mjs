#!/usr/bin/env node

import assert from "node:assert/strict";
import {execFileSync, spawn} from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mysql = require(path.join(ROOT, "server/node/node_modules/mysql2/promise"));
const {
  __runMysqlGuardedPoolTransactionForTest: runMysqlTransaction,
} = require(path.join(ROOT, "server/node/src/mysql-store"));

const WAIT_TIMEOUT_MS = 15000;
const MYSQL_MEMORY_BYTES = 128 * 1024 * 1024;
const DATABASE = "beastbound_session_deadline_gate";

async function main() {
  let runtime = null;
  let admin = null;
  let observer = null;
  let pool = null;
  const report = {
    schemaVersion: 1,
    isolatedMysql: true,
    sharedPlayerDatabaseTouched: false,
    sessionPolicy: null,
    globalsUnchanged: false,
    observerSessionUnchanged: false,
    poolAcquireTimeout: null,
    rowLockRollback: null,
    hardDeadlineRollback: null,
    residualTransactions: null,
    residualLockWaits: null,
    cleanupVerified: false,
  };
  try {
    runtime = await startIsolatedMysql();
    admin = await mysql.createConnection(runtime.connectionOptions);
    observer = await mysql.createConnection(runtime.connectionOptions);
    await admin.query(`DROP DATABASE IF EXISTS \`${DATABASE}\``);
    await admin.query(`CREATE DATABASE \`${DATABASE}\` CHARACTER SET utf8mb4`);
    await admin.query(`
      CREATE TABLE \`${DATABASE}\`.gate_rows (
        row_id INT PRIMARY KEY,
        value_int INT NOT NULL
      ) ENGINE=InnoDB
    `);
    await admin.query(`
      CREATE TABLE \`${DATABASE}\`.gate_receipts (
        receipt_id VARCHAR(80) PRIMARY KEY
      ) ENGINE=InnoDB
    `);
    await admin.query(`INSERT INTO \`${DATABASE}\`.gate_rows (row_id, value_int) VALUES (1, 10), (2, 20)`);

    const globalsBefore = await lockTimeoutValues(admin, "GLOBAL");
    const observerBefore = await lockTimeoutValues(observer, "SESSION");
    pool = mysql.createPool({
      ...runtime.connectionOptions,
      database: DATABASE,
      waitForConnections: true,
      connectionLimit: 2,
      queueLimit: 4,
    });

    // Simulate a reused physical connection carrying arbitrary prior Session
    // values. Production checkout must overwrite them before BEGIN.
    const reused = await pool.getConnection();
    await reused.query(
      "SET SESSION innodb_lock_wait_timeout = ?, SESSION lock_wait_timeout = ?",
      [17, 19],
    );
    reused.release();

    let beastboundSession = null;
    await runMysqlTransaction(pool, {}, async (connection) => {
      beastboundSession = queryLockTimeoutValues(await connection.query(
        "SELECT @@SESSION.innodb_lock_wait_timeout AS rowLockSeconds, @@SESSION.lock_wait_timeout AS metadataLockSeconds",
      ));
    });
    assert.deepEqual(beastboundSession, {rowLockSeconds: 3, metadataLockSeconds: 5});
    report.sessionPolicy = beastboundSession;

    const heldA = await pool.getConnection();
    const heldB = await pool.getConnection();
    let acquiredBusinessCalls = 0;
    const acquireFailure = await rejectedValue(runMysqlTransaction(
      pool,
      {transactionPolicy: {poolAcquireTimeoutMs: 100}},
      async () => { acquiredBusinessCalls += 1; },
    ));
    assert.equal(acquireFailure.code, "mysql_pool_acquire_timeout");
    assert.equal(acquireFailure.transactionPhase, "not_started");
    assert.equal(acquiredBusinessCalls, 0);
    heldA.release();
    await delay(50);
    heldB.release();
    const poolProbe = await settleWithin(pool.getConnection(), 1000, "acquire timeout 后连接池恢复");
    poolProbe.release();
    report.poolAcquireTimeout = {
      code: acquireFailure.code,
      businessCalls: acquiredBusinessCalls,
      lateConnectionReleased: true,
    };

    await admin.beginTransaction();
    await admin.query(`UPDATE \`${DATABASE}\`.gate_rows SET value_int = value_int + 1 WHERE row_id = 1`);
    const rowLockStartedAt = Date.now();
    const rowLockFailure = await rejectedValue(runMysqlTransaction(pool, {}, async (connection) => {
      await connection.query("UPDATE gate_rows SET value_int = value_int + 7 WHERE row_id = 2");
      await connection.query("INSERT INTO gate_receipts (receipt_id) VALUES (?)", ["row_lock_should_rollback"]);
      await connection.query("UPDATE gate_rows SET value_int = value_int + 7 WHERE row_id = 1");
    }));
    const rowLockElapsedMs = Date.now() - rowLockStartedAt;
    assert.equal(rowLockFailure.code, "mysql_transaction_rolled_back");
    assert.equal(rowLockFailure.mysqlCode, "ER_LOCK_WAIT_TIMEOUT");
    assert.equal(rowLockFailure.outcomeUnknown, false);
    assert.equal(rowLockFailure.rollbackConfirmed, true);
    assert.ok(rowLockElapsedMs >= 2500 && rowLockElapsedMs < 6000, `row lock elapsed ${rowLockElapsedMs}ms`);
    await admin.rollback();
    assert.equal(await rowValue(admin, 2), 20);
    assert.equal(await receiptExists(admin, "row_lock_should_rollback"), false);
    report.rowLockRollback = {
      code: rowLockFailure.code,
      mysqlCode: rowLockFailure.mysqlCode,
      elapsedMs: rowLockElapsedMs,
      rollbackConfirmed: rowLockFailure.rollbackConfirmed,
      priorWritesRolledBack: true,
    };

    await admin.beginTransaction();
    await admin.query(`UPDATE \`${DATABASE}\`.gate_rows SET value_int = value_int + 1 WHERE row_id = 1`);
    const hardDeadlineStartedAt = Date.now();
    const hardDeadlineFailure = await rejectedValue(runMysqlTransaction(
      pool,
      {
        transactionPolicy: {
          rowLockWaitTimeoutSeconds: 30,
          transactionTimeoutMs: 500,
        },
      },
      async (connection) => {
        await connection.query("INSERT INTO gate_receipts (receipt_id) VALUES (?)", ["deadline_should_rollback"]);
        await connection.query("UPDATE gate_rows SET value_int = value_int + 9 WHERE row_id = 1");
      },
    ));
    const hardDeadlineElapsedMs = Date.now() - hardDeadlineStartedAt;
    assert.equal(hardDeadlineFailure.code, "mysql_transaction_rolled_back");
    assert.equal(hardDeadlineFailure.timeout, true);
    assert.equal(hardDeadlineFailure.noCommitGuaranteed, true);
    assert.equal(hardDeadlineFailure.outcomeUnknown, false);
    assert.ok(hardDeadlineElapsedMs >= 350 && hardDeadlineElapsedMs < 2000, `deadline elapsed ${hardDeadlineElapsedMs}ms`);
    await admin.rollback();
    let activeTransactions = [];
    await waitUntil(async () => {
      activeTransactions = await activeTransactionRows(admin);
      return activeTransactions.length === 0;
    }, 5000, () => `hard deadline 回滚清理：${JSON.stringify(activeTransactions)}`);
    assert.equal(await receiptExists(admin, "deadline_should_rollback"), false);
    report.hardDeadlineRollback = {
      code: hardDeadlineFailure.code,
      elapsedMs: hardDeadlineElapsedMs,
      noCommitGuaranteed: hardDeadlineFailure.noCommitGuaranteed,
      priorWritesRolledBack: true,
    };

    const globalsAfter = await lockTimeoutValues(admin, "GLOBAL");
    const observerAfter = await lockTimeoutValues(observer, "SESSION");
    assert.deepEqual(globalsAfter, globalsBefore);
    assert.deepEqual(observerAfter, observerBefore);
    report.globalsUnchanged = true;
    report.observerSessionUnchanged = true;
    report.globalValues = globalsAfter;
    report.observerSessionValues = observerAfter;
    report.residualTransactions = await activeTransactionCount(admin);
    report.residualLockWaits = await lockWaitCount(admin);
    assert.equal(report.residualTransactions, 0);
    assert.equal(report.residualLockWaits, 0);
  } finally {
    if (pool) {
      await pool.end().catch(() => {});
    }
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS \`${DATABASE}\``).catch(() => {});
    }
    if (observer) {
      await observer.end().catch(() => {});
    }
    if (admin) {
      await admin.end().catch(() => {});
    }
    if (runtime) {
      await stopIsolatedMysql(runtime);
      report.cleanupVerified = !fs.existsSync(runtime.runtimeDir);
    }
  }
  assert.equal(report.cleanupVerified, true);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

async function lockTimeoutValues(connection, scope) {
  const [rows] = await connection.query(
    `SELECT @@${scope}.innodb_lock_wait_timeout AS rowLockSeconds, @@${scope}.lock_wait_timeout AS metadataLockSeconds`,
  );
  return normalizedLockTimeoutValues(rows[0]);
}

function queryLockTimeoutValues(result) {
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : [];
  return normalizedLockTimeoutValues(rows[0]);
}

function normalizedLockTimeoutValues(row) {
  return {
    rowLockSeconds: Number(row && row.rowLockSeconds),
    metadataLockSeconds: Number(row && row.metadataLockSeconds),
  };
}

async function rowValue(connection, rowId) {
  const [rows] = await connection.query(
    `SELECT value_int FROM \`${DATABASE}\`.gate_rows WHERE row_id = ?`,
    [rowId],
  );
  return Number(rows[0] && rows[0].value_int);
}

async function receiptExists(connection, receiptId) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS rowCount FROM \`${DATABASE}\`.gate_receipts WHERE receipt_id = ?`,
    [receiptId],
  );
  return Number(rows[0] && rows[0].rowCount) === 1;
}

async function activeTransactionCount(connection) {
  return (await activeTransactionRows(connection)).length;
}

async function activeTransactionRows(connection) {
  const [rows] = await connection.query(
    `SELECT trx_mysql_thread_id AS threadId, trx_state AS state, trx_query AS queryText
      FROM information_schema.innodb_trx WHERE trx_mysql_thread_id <> CONNECTION_ID()`,
  );
  return rows.map((row) => ({
    threadId: Number(row.threadId),
    state: String(row.state || ""),
    queryText: row.queryText === null ? null : String(row.queryText || ""),
  }));
}

async function lockWaitCount(connection) {
  const [rows] = await connection.query("SELECT COUNT(*) AS rowCount FROM performance_schema.data_lock_waits");
  return Number(rows[0] && rows[0].rowCount);
}

async function rejectedValue(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("expected operation to reject");
}

async function reserveLoopbackPort() {
  const server = net.createServer();
  await settleWithin(new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  }), WAIT_TIMEOUT_MS, "分配隔离 MySQL 端口");
  const address = server.address();
  const port = Number(address && address.port);
  await settleWithin(new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }), WAIT_TIMEOUT_MS, "释放隔离 MySQL 端口");
  assert.ok(Number.isInteger(port) && port > 0 && port !== 3306);
  return port;
}

function mysqlBinaryDirectory() {
  const explicit = String(process.env.BEASTBOUND_ISOLATED_MYSQL_BIN_DIR || "").trim();
  const candidates = [
    explicit,
    "/Users/fander/.local/opt/mysql/mysql-9.7.0-er2/bin",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (["mysqladmin", "mysqld"].every((name) => fs.existsSync(path.join(candidate, name)))) {
      return candidate;
    }
  }
  throw new Error("未找到隔离门槛需要的 MySQL 9.7 mysqladmin/mysqld 二进制。");
}

async function startIsolatedMysql() {
  const binDir = mysqlBinaryDirectory();
  const basedir = path.dirname(binDir);
  const port = await reserveLoopbackPort();
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-session-deadline-mysql-"));
  const datadir = path.join(runtimeDir, "data");
  const socketPath = path.join(runtimeDir, "mysql.sock");
  const pidPath = path.join(runtimeDir, "mysqld.pid");
  const errorLogPath = path.join(runtimeDir, "mysqld.log");
  const mysqldPath = path.join(binDir, "mysqld");
  try {
    fs.mkdirSync(datadir, {recursive: true});
    execFileSync(mysqldPath, [
      "--no-defaults",
      `--basedir=${basedir}`,
      `--datadir=${datadir}`,
      "--initialize-insecure",
    ], {stdio: "ignore", timeout: 30000});
  } catch (error) {
    fs.rmSync(runtimeDir, {recursive: true, force: true});
    throw error;
  }

  let processHandle;
  try {
    processHandle = spawn(mysqldPath, [
      "--no-defaults",
      `--basedir=${basedir}`,
      `--datadir=${datadir}`,
      "--bind-address=127.0.0.1",
      `--port=${port}`,
      `--socket=${socketPath}`,
      `--pid-file=${pidPath}`,
      `--log-error=${errorLogPath}`,
      "--mysqlx=0",
      "--skip-log-bin",
      "--performance-schema=ON",
      `--innodb-buffer-pool-size=${MYSQL_MEMORY_BYTES}`,
      "--max-connections=30",
    ], {stdio: "ignore"});
  } catch (error) {
    fs.rmSync(runtimeDir, {recursive: true, force: true});
    throw error;
  }
  const exited = new Promise((resolve, reject) => {
    processHandle.once("exit", (code, signal) => resolve({code, signal}));
    processHandle.once("error", reject);
  });
  const connectionOptions = {
    host: "127.0.0.1",
    port,
    user: "root",
    password: "",
    connectTimeout: 1000,
  };
  try {
    await waitUntil(async () => {
      if (childExited(processHandle)) {
        const log = fs.existsSync(errorLogPath) ? fs.readFileSync(errorLogPath, "utf8").slice(-3000) : "";
        throw new Error(`一次性 mysqld 提前退出：${log}`);
      }
      let probe = null;
      try {
        probe = await mysql.createConnection(connectionOptions);
        await probe.query("SELECT 1");
        return true;
      } catch {
        return false;
      } finally {
        if (probe) {
          await probe.end().catch(() => {});
        }
      }
    }, WAIT_TIMEOUT_MS, "一次性 mysqld 启动");
  } catch (error) {
    await terminateProcess(processHandle, exited);
    if (childExited(processHandle)) {
      fs.rmSync(runtimeDir, {recursive: true, force: true});
    }
    throw error;
  }
  return {
    binDir,
    connectionOptions,
    errorLogPath,
    exited,
    mysqladminPath: path.join(binDir, "mysqladmin"),
    port,
    processHandle,
    runtimeDir,
  };
}

async function stopIsolatedMysql(runtime) {
  let stopped = childExited(runtime.processHandle);
  try {
    if (!stopped) {
      try {
        execFileSync(runtime.mysqladminPath, [
          "--no-defaults",
          "--no-login-paths",
          "--protocol=TCP",
          "--host=127.0.0.1",
          `--port=${runtime.port}`,
          "--user=root",
          "shutdown",
        ], {stdio: "ignore", timeout: 5000});
      } catch {
        // Bounded signal cleanup below is authoritative.
      }
      stopped = await waitForExit(runtime.processHandle, runtime.exited, 5000);
    }
    if (!stopped) {
      stopped = await terminateProcess(runtime.processHandle, runtime.exited);
    }
    if (!stopped) {
      throw new Error("一次性 mysqld 未退出，拒绝删除其 datadir。");
    }
  } finally {
    if (stopped) {
      fs.rmSync(runtime.runtimeDir, {recursive: true, force: true});
    }
  }
}

function childExited(child) {
  return !child
    || !Number.isInteger(child.pid)
    || child.exitCode !== null
    || child.signalCode !== null;
}

async function waitForExit(child, exited, timeoutMs) {
  if (childExited(child)) {
    return true;
  }
  await Promise.race([Promise.resolve(exited).catch(() => null), delay(timeoutMs)]);
  return childExited(child);
}

async function terminateProcess(child, exited) {
  if (childExited(child)) {
    return true;
  }
  child.kill("SIGTERM");
  if (await waitForExit(child, exited, 3000)) {
    return true;
  }
  child.kill("SIGKILL");
  return waitForExit(child, exited, 3000);
}

async function waitUntil(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  const timeoutLabel = typeof label === "function" ? label() : label;
  throw lastError || new Error(`${timeoutLabel} 超时。`);
}

function settleWithin(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} 超时。`)), timeoutMs);
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function delay(timeoutMs) {
  return new Promise((resolve) => setTimeout(resolve, timeoutMs));
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
