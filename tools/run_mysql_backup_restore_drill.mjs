import crypto from "node:crypto";
import {execFileSync, spawn} from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath, pathToFileURL} from "node:url";

import {
  isolatedMysqlRuntimeStopped,
  startIsolatedMysql,
  stopIsolatedMysql,
} from "./lib/isolated-mysql-runtime.mjs";

const require = createRequire(import.meta.url);
const {
  findLatestMysqlBackupArtifact,
  verifyMysqlBackupArtifact,
} = require("../server/node/src/mysql-backup-artifact");
const {
  createMysqlAuthStore,
  mysqlAuthStoreRootContract,
} = require("../server/node/src/mysql-store");
const {
  stableDigest,
} = require("../server/node/src/auth/profile-migrations");

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_ROOT = path.join(REPO_ROOT, "server/node");
const DEFAULT_BACKUP_DIRECTORY = path.join(SERVER_ROOT, ".local/backups");
const RESTORE_DATABASE = "beastbound_restore_drill";
const IMPORT_TIMEOUT_MS = 10 * 60 * 1000;
const SERVER_START_TIMEOUT_MS = 20_000;
const SERVER_STOP_TIMEOUT_MS = 20_000;
const CHILD_OUTPUT_MAX_BYTES = 1024 * 1024;

export function parseRestoreDrillArgs(argv = []) {
  const result = {backupPath: "", backupDirectory: DEFAULT_BACKUP_DIRECTORY};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = String(argv[index] || "");
    if (argument === "--backup") {
      result.backupPath = requiredArgumentValue(argv, ++index, argument);
    } else if (argument === "--backup-dir") {
      result.backupDirectory = requiredArgumentValue(argv, ++index, argument);
    } else {
      throw restoreDrillError("restore_drill_argument_invalid", "恢复演练参数无效。");
    }
  }
  if (result.backupPath !== "" && argv.includes("--backup-dir")) {
    throw restoreDrillError("restore_drill_argument_conflict", "恢复演练只能选择一个备份来源。");
  }
  return Object.freeze({
    backupPath: result.backupPath === "" ? "" : path.resolve(result.backupPath),
    backupDirectory: path.resolve(result.backupDirectory),
  });
}

export async function runMysqlBackupRestoreDrill(options = {}) {
  const startedAt = Date.now();
  const artifact = options.backupPath
    ? verifyMysqlBackupArtifact(options.backupPath)
    : findLatestMysqlBackupArtifact(options.backupDirectory || DEFAULT_BACKUP_DIRECTORY);
  let runtime = null;
  let serverProcess = null;
  let serverPort = 0;
  let cleanupVerified = false;
  try {
    runtime = await startIsolatedMysql({
      runtimePrefix: "beastbound-backup-restore-drill",
      memoryBytes: 256 * 1024 * 1024,
      maxConnections: 24,
    });
    createRestoreDatabase(runtime, RESTORE_DATABASE);
    const importStartedAt = Date.now();
    await importBackup(runtime, RESTORE_DATABASE, artifact.backupPath);
    const importElapsedMs = Date.now() - importStartedAt;

    const beforeSchema = schemaSnapshot(runtime, RESTORE_DATABASE);
    const tableCheck = checkRestoredTables(runtime, RESTORE_DATABASE, beforeSchema.tableNames);
    const beforeAuthority = await loadAuthoritySnapshot(runtime, RESTORE_DATABASE);
    const beforePersistentDigest = persistentProjectionDigest(beforeAuthority);
    const beforeSummary = authoritySnapshotSummary(beforeAuthority);

    serverPort = await reserveLoopbackPort();
    const smoke = await startRestoredServerSmoke(runtime, RESTORE_DATABASE, serverPort);
    serverProcess = smoke.processHandle;
    await stopRestoredServer(serverProcess);
    serverProcess = null;
    await assertPortClosed(serverPort);

    const afterSchema = schemaSnapshot(runtime, RESTORE_DATABASE);
    const afterAuthority = await loadAuthoritySnapshot(runtime, RESTORE_DATABASE);
    const afterPersistentDigest = persistentProjectionDigest(afterAuthority);
    const afterSummary = authoritySnapshotSummary(afterAuthority);
    if (beforeSchema.digest !== afterSchema.digest) {
      throw restoreDrillError("restore_drill_schema_drift", "当前服务启动时修补了备份 schema，备份不是可直接恢复版本。");
    }
    if (beforePersistentDigest !== afterPersistentDigest) {
      throw restoreDrillError("restore_drill_authority_drift", "恢复后的服务启动改变了持久权威数据。");
    }
    if (stableDigest(beforeSummary) !== stableDigest(afterSummary)) {
      throw restoreDrillError("restore_drill_summary_drift", "恢复后的持久数据摘要发生变化。");
    }

    const mysqlVersion = mysqlScalar(runtime, "", "SELECT VERSION()");
    await stopIsolatedMysql(runtime);
    cleanupVerified = isolatedMysqlRuntimeStopped(runtime)
      && !fs.existsSync(runtime.runtimeDir);
    if (!cleanupVerified) {
      throw restoreDrillError("restore_drill_cleanup_failed", "一次性 MySQL 未完成清理。");
    }
    return Object.freeze({
      status: "PASS",
      kind: "beastbound_mysql_backup_restore_drill",
      schemaVersion: 1,
      backup: Object.freeze({
        database: artifact.manifest.database,
        dumpFile: artifact.manifest.dumpFile,
        bytes: artifact.manifest.bytes,
        sha256: artifact.manifest.sha256,
        consistency: artifact.manifest.consistency.contract,
      }),
      restore: Object.freeze({
        engine: "isolated_mysql_logical_restore_and_real_service_smoke",
        mysqlVersion,
        nonDefaultLoopbackPort: runtime.port !== 3306,
        tableCount: beforeSchema.tableNames.length,
        checkedTableCount: tableCheck.checkedTableCount,
        schemaDigest: beforeSchema.digest,
        persistentAuthorityDigest: beforePersistentDigest,
        authorityCounts: beforeSummary,
        importElapsedMs,
        totalElapsedMs: Date.now() - startedAt,
      }),
      application: Object.freeze({
        strictStoreLoadPassed: true,
        realHttpServerReadyPassed: true,
        schemaUnchangedAfterStartup: true,
        persistentAuthorityUnchangedAfterStartup: true,
      }),
      claims: Object.freeze({
        backupRestorableInIsolatedMysql: true,
        restoreDrillConnectedToSourceDatabase: false,
        sourceDatabaseWritten: false,
        productionRpoRtoProven: false,
      }),
      cleanup: Object.freeze({
        restoredServerStopped: true,
        temporaryMysqlStopped: true,
        temporaryStateRemoved: true,
        temporaryPortClosed: true,
      }),
    });
  } finally {
    if (serverProcess !== null) {
      await forceStopChild(serverProcess);
    }
    if (serverPort > 0) {
      await assertPortClosed(serverPort).catch(() => undefined);
    }
    if (runtime !== null && (!isolatedMysqlRuntimeStopped(runtime) || fs.existsSync(runtime.runtimeDir))) {
      await stopIsolatedMysql(runtime).catch(() => undefined);
    }
    if (cleanupVerified === false && runtime !== null && fs.existsSync(runtime.runtimeDir)) {
      // stopIsolatedMysql deliberately retains an unconfirmed live datadir.
      // Do not hide that safety failure by deleting it here.
    }
  }
}

export function authoritySnapshotSummary(snapshot) {
  const value = isRecord(snapshot) ? snapshot : {};
  return Object.freeze({
    accounts: recordSize(value.accounts),
    sessions: recordSize(value.sessions),
    profiles: recordSize(value.profiles),
    characterSlots: Object.values(isRecord(value.accountCharacterSlots) ? value.accountCharacterSlots : {})
      .reduce((total, slots) => total + (Array.isArray(slots) ? slots.filter(Boolean).length : 0), 0),
    mutationReceipts: recordSize(value.mutationReceipts),
    activeMail: recordSize(value.mailMessages),
    marketListings: recordSize(value.marketListings),
    consumedEquipmentEnvelopes: recordSize(value.consumedEquipmentEnvelopes),
    parties: recordSize(value.parties),
    families: recordSize(value.families),
    battleRecords: arraySize(value.battleRecords),
    serviceEvents: arraySize(value.serviceEvents),
    storeRevision: Number.isSafeInteger(Number(value.storeRevision)) ? Number(value.storeRevision) : 0,
  });
}

export function persistentProjectionDigest(snapshot) {
  const contract = mysqlAuthStoreRootContract();
  const projection = {};
  for (const field of contract.persistentFields) {
    projection[field] = snapshot && Object.hasOwn(snapshot, field) ? snapshot[field] : null;
  }
  if (snapshot && Object.hasOwn(snapshot, "storeRevision")) {
    projection.storeRevision = snapshot.storeRevision;
  }
  return stableDigest(projection);
}

export function restoreMysqlClientSafetyArguments() {
  return Object.freeze([
    "--commands=FALSE",
    "--disable-named-commands",
    "--system-command=FALSE",
    "--binary-mode",
  ]);
}

function createRestoreDatabase(runtime, database) {
  mysqlExec(runtime, "", `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`);
}

function importBackup(runtime, database, backupPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(mysqlBinary(runtime), mysqlArguments(runtime, database), {
      env: sanitizedChildEnvironment(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    const source = fs.createReadStream(backupPath);
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const stderr = [];
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      source.destroy();
      child.kill("SIGKILL");
      reject(restoreDrillError("restore_drill_import_timeout", "MySQL 备份导入超过安全时限。"));
    }, IMPORT_TIMEOUT_MS);
    timeout.unref?.();

    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > CHILD_OUTPUT_MAX_BYTES && !settled) {
        settled = true;
        clearTimeout(timeout);
        source.destroy();
        child.kill("SIGKILL");
        reject(restoreDrillError("restore_drill_import_output_limit", "MySQL 备份导入输出超过安全上限。"));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= CHILD_OUTPUT_MAX_BYTES) stderr.push(chunk);
      if (stderrBytes > CHILD_OUTPUT_MAX_BYTES && !settled) {
        settled = true;
        clearTimeout(timeout);
        source.destroy();
        child.kill("SIGKILL");
        reject(restoreDrillError("restore_drill_import_error_limit", "MySQL 备份导入错误输出超过安全上限。"));
      }
    });
    source.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill("SIGKILL");
      reject(restoreDrillError("restore_drill_backup_read_failed", "MySQL 备份读取失败。", error));
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      source.destroy();
      reject(restoreDrillError("restore_drill_mysql_spawn_failed", "无法启动隔离 MySQL 导入客户端。", error));
    });
    child.stdin.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      source.destroy();
      child.kill("SIGKILL");
      reject(restoreDrillError("restore_drill_import_pipe_failed", "MySQL 备份导入管道失败。", error));
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      source.destroy();
      if (code !== 0) {
        const detail = Buffer.concat(stderr).toString("utf8").trim();
        reject(restoreDrillError("restore_drill_import_failed", detail === ""
          ? "MySQL 备份无法导入隔离实例。"
          : "MySQL 备份导入失败，错误内容已隐藏。"));
        return;
      }
      resolve();
    });
    source.pipe(child.stdin);
  });
}

function schemaSnapshot(runtime, database) {
  const tableOutput = mysqlQuery(runtime, database, [
    "SELECT TABLE_NAME, ENGINE, COALESCE(TABLE_COLLATION, '')",
    "FROM information_schema.TABLES",
    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'",
    "ORDER BY TABLE_NAME;",
  ].join(" "));
  const tableRows = tableOutput.trim() === "" ? [] : tableOutput.trim().split(/\r?\n/).map((line) => line.split("\t"));
  const tableNames = tableRows.map((fields) => fields[0]);
  if (tableNames.length === 0 || tableNames.some((name) => !/^[A-Za-z0-9_]+$/.test(name))) {
    throw restoreDrillError("restore_drill_table_catalog_invalid", "恢复后的表目录无效。");
  }
  if (tableRows.some((fields) => fields.length < 3 || fields[1] !== "InnoDB")) {
    throw restoreDrillError("restore_drill_table_engine_invalid", "恢复后的业务表不是全量 InnoDB，单事务一致性不成立。");
  }
  const columnOutput = mysqlQuery(runtime, database, [
    "SELECT TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_TYPE, IS_NULLABLE,",
    "COALESCE(COLUMN_DEFAULT, '<NULL>'), EXTRA, COALESCE(COLLATION_NAME, '')",
    "FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()",
    "ORDER BY TABLE_NAME, ORDINAL_POSITION;",
  ].join(" "));
  const indexOutput = mysqlQuery(runtime, database, [
    "SELECT TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX, COALESCE(COLUMN_NAME, ''), NON_UNIQUE, INDEX_TYPE",
    "FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()",
    "ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;",
  ].join(" "));
  const createOutput = mysqlQuery(runtime, database, tableNames
    .map((name) => `SHOW CREATE TABLE \`${name}\`;`)
    .join("\n"));
  return Object.freeze({
    tableNames: Object.freeze(tableNames),
    digest: sha256Text([tableOutput, columnOutput, indexOutput, createOutput].join("\n--SECTION--\n")),
  });
}

function checkRestoredTables(runtime, database, tableNames) {
  const quoted = tableNames.map((name) => `\`${name}\``).join(", ");
  const output = mysqlQuery(runtime, database, `CHECK TABLE ${quoted};`);
  const okTables = new Set();
  for (const line of output.trim().split(/\r?\n/)) {
    const fields = line.split("\t");
    if (fields.length >= 4 && fields[2] === "status" && fields[3] === "OK") {
      okTables.add(String(fields[0] || "").split(".").pop());
    }
  }
  if (okTables.size !== tableNames.length || tableNames.some((name) => !okTables.has(name))) {
    throw restoreDrillError("restore_drill_table_check_failed", "恢复后的 MySQL 表完整性检查失败。");
  }
  return Object.freeze({checkedTableCount: okTables.size});
}

async function loadAuthoritySnapshot(runtime, database) {
  const store = createMysqlAuthStore({
    mysqlPath: runtime.mysqlPath,
    host: runtime.connectionOptions.host,
    port: runtime.connectionOptions.port,
    user: runtime.connectionOptions.user,
    password: runtime.connectionOptions.password,
    database,
    createDatabase: false,
    ensureSchema: false,
    readOnly: true,
    requireMailStorageSchemaAudit: true,
    strictRowIdentity: true,
    usePool: false,
  });
  try {
    return store.load();
  } finally {
    await store.close();
  }
}

async function startRestoredServerSmoke(runtime, database, port) {
  const processHandle = spawn(process.execPath, ["src/http-server.js"], {
    cwd: SERVER_ROOT,
    env: {
      ...sanitizedChildEnvironment(),
      BEASTBOUND_AUTH_STORE: "mysql",
      BEASTBOUND_AUTH_HOST: "127.0.0.1",
      BEASTBOUND_AUTH_PORT: String(port),
      BEASTBOUND_EDGE_MODE: "direct",
      BEASTBOUND_MYSQL_BIN: runtime.mysqlPath,
      BEASTBOUND_MYSQL_HOST: runtime.connectionOptions.host,
      BEASTBOUND_MYSQL_PORT: String(runtime.connectionOptions.port),
      BEASTBOUND_MYSQL_USER: runtime.connectionOptions.user,
      BEASTBOUND_MYSQL_PASSWORD: runtime.connectionOptions.password,
      BEASTBOUND_MYSQL_DATABASE: database,
      BEASTBOUND_MYSQL_CREATE_DATABASE: "0",
      BEASTBOUND_MYSQL_USE_POOL: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const outputGuard = boundedChildOutputGuard(processHandle);
  try {
    const ready = await waitForReady(processHandle, port, SERVER_START_TIMEOUT_MS);
    if (ready.statusCode !== 200 || !isRecord(ready.body) || ready.body.ok !== true) {
      throw restoreDrillError("restore_drill_server_not_ready", "恢复后的真实服务未进入 ready 状态。");
    }
    const live = await requestJson(port, "/health/live");
    if (live.statusCode !== 200 || !isRecord(live.body) || live.body.ok !== true) {
      throw restoreDrillError("restore_drill_server_not_live", "恢复后的真实服务存活检查失败。");
    }
    outputGuard.assertWithinLimit();
    return {processHandle};
  } catch (error) {
    await forceStopChild(processHandle);
    throw error;
  }
}

async function stopRestoredServer(processHandle) {
  if (childStopped(processHandle)) return;
  processHandle.kill("SIGTERM");
  const exit = await waitForChildExit(processHandle, SERVER_STOP_TIMEOUT_MS);
  if (!exit || exit.code !== 0) {
    await forceStopChild(processHandle);
    throw restoreDrillError("restore_drill_server_shutdown_failed", "恢复演练服务未能干净退出。");
  }
}

function boundedChildOutputGuard(child) {
  let bytes = 0;
  let exceeded = false;
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > CHILD_OUTPUT_MAX_BYTES) {
        exceeded = true;
        child.kill("SIGKILL");
      }
    });
  }
  return {
    assertWithinLimit() {
      if (exceeded) {
        throw restoreDrillError("restore_drill_server_output_limit", "恢复演练服务输出超过安全上限。");
      }
    },
  };
}

async function waitForReady(child, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (childStopped(child)) {
      throw restoreDrillError("restore_drill_server_exited", "恢复演练服务在 ready 前退出。");
    }
    try {
      const result = await requestJson(port, "/health/ready");
      if (result.statusCode === 200) return result;
    } catch {
      // Listener may still be starting.
    }
    await delay(50);
  }
  throw restoreDrillError("restore_drill_server_ready_timeout", "恢复演练服务启动超时。");
}

function requestJson(port, requestPath) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port,
      path: requestPath,
      method: "GET",
      timeout: 1000,
    }, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes <= CHILD_OUTPUT_MAX_BYTES) chunks.push(chunk);
      });
      response.on("end", () => {
        if (bytes > CHILD_OUTPUT_MAX_BYTES) {
          reject(restoreDrillError("restore_drill_health_output_limit", "恢复演练健康响应过大。"));
          return;
        }
        try {
          resolve({statusCode: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8"))});
        } catch (error) {
          reject(restoreDrillError("restore_drill_health_parse_failed", "恢复演练健康响应无效。", error));
        }
      });
    });
    request.once("timeout", () => request.destroy(new Error("health timeout")));
    request.once("error", reject);
    request.end();
  });
}

function schemaMysqlArguments(runtime, database) {
  return [
    "--no-defaults",
    "--no-login-paths",
    "--protocol=TCP",
    `--host=${runtime.connectionOptions.host}`,
    `--port=${runtime.connectionOptions.port}`,
    `--user=${runtime.connectionOptions.user}`,
    ...restoreMysqlClientSafetyArguments(),
    "--batch",
    "--raw",
    "--skip-column-names",
    ...(database ? [database] : []),
  ];
}

function mysqlArguments(runtime, database) {
  return schemaMysqlArguments(runtime, database);
}

function mysqlExec(runtime, database, sql) {
  execFileSync(mysqlBinary(runtime), schemaMysqlArguments(runtime, database), {
    env: sanitizedChildEnvironment(),
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 20_000,
    maxBuffer: CHILD_OUTPUT_MAX_BYTES,
  });
}

function mysqlQuery(runtime, database, sql) {
  return execFileSync(mysqlBinary(runtime), schemaMysqlArguments(runtime, database), {
    env: sanitizedChildEnvironment(),
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 20_000,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function mysqlScalar(runtime, database, sql) {
  return String(mysqlQuery(runtime, database, `${sql};`)).trim().split(/\r?\n/)[0] || "";
}

function mysqlBinary(runtime) {
  return path.join(runtime.binDir, "mysql");
}

function sanitizedChildEnvironment() {
  const environment = {...process.env};
  for (const key of Object.keys(environment)) {
    if (key.startsWith("BEASTBOUND_") || key === "MYSQL_PWD" || key === "NODE_OPTIONS") {
      delete environment[key];
    }
  }
  return environment;
}

function requiredArgumentValue(argv, index, argument) {
  const value = String(argv[index] || "").trim();
  if (value === "" || value.startsWith("--")) {
    throw restoreDrillError("restore_drill_argument_value_missing", `${argument} 缺少参数。`);
  }
  return value;
}

function recordSize(value) {
  return isRecord(value) ? Object.keys(value).length : 0;
}

function arraySize(value) {
  return Array.isArray(value) ? value.length : 0;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function restoreDrillError(code, message, cause = undefined) {
  const error = new Error(message);
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  return error;
}

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = Number(address && typeof address === "object" ? address.port : 0);
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function assertPortClosed(port) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (!await canConnect(port)) return;
    await delay(50);
  }
  throw restoreDrillError("restore_drill_port_still_open", "恢复演练临时端口未关闭。");
}

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({host: "127.0.0.1", port});
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(200);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function childStopped(child) {
  return !child || child.exitCode !== null || child.signalCode !== null;
}

function waitForChildExit(child, timeoutMs) {
  if (childStopped(child)) return Promise.resolve({code: child.exitCode, signal: child.signalCode});
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener("exit", onExit);
      resolve(value);
    };
    const onExit = (code, signal) => finish({code, signal});
    const timer = setTimeout(() => finish(null), timeoutMs);
    child.once("exit", onExit);
  });
}

async function forceStopChild(child) {
  if (childStopped(child)) return;
  child.kill("SIGTERM");
  if (await waitForChildExit(child, 2000)) return;
  child.kill("SIGKILL");
  await waitForChildExit(child, 2000);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseRestoreDrillArgs(process.argv.slice(2));
  const report = await runMysqlBackupRestoreDrill(args);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      status: "FAIL",
      code: String(error && error.code || "restore_drill_failed"),
      message: String(error && error.message || "MySQL 备份恢复演练失败。"),
    }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
