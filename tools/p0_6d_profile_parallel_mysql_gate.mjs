#!/usr/bin/env node

import assert from "node:assert/strict";
import {execFileSync, spawn} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mysql = require(path.join(ROOT, "server/node/node_modules/mysql2/promise"));
const {cloneAuthorityRoot} = require(path.join(ROOT, "server/node/src/auth/authority-root-clone"));
const {applySharedAssetReadView} = require(
  path.join(ROOT, "server/node/src/auth/shared-asset-read-model"),
);
const {
  DURABLE_RECEIPT_MAX_COUNT,
  durableMutationReceiptDeltaFrom,
  stageDurableMutationReceipt,
} = require(path.join(ROOT, "server/node/src/auth/durable-mutation-state"));
const {ensureConsumedEquipmentEnvelopeIds} = require(
  path.join(ROOT, "server/node/src/auth/equipment-envelope-consumed-ledger"),
);
const {
  MARKET_MAX_LISTINGS,
  MARKET_MAX_LISTINGS_PER_SELLER,
} = require(path.join(ROOT, "server/node/src/auth/market-listing-state"));
const {
  __runMysqlPoolSavePlanForTest,
  createMysqlAuthStore,
} = require(path.join(ROOT, "server/node/src/mysql-store"));
const {
  MUTATION_RECEIPT_CAPACITY_GUARD_KEY,
  MUTATION_RECEIPT_CAPACITY_UPDATE_SQL,
  MUTATION_RECEIPT_DELETE_SQL,
} = require(path.join(ROOT, "server/node/src/mysql-resource-acquisition-order"));
const {
  createAsyncWriteAuthStore,
  createAuthService,
} = require(path.join(ROOT, "server/node/src/auth-service"));

const ACTORS = Object.freeze({
  a: Object.freeze({accountId: "acc_real_parallel_a", playerId: "player_real_parallel_a"}),
  b: Object.freeze({accountId: "acc_real_parallel_b", playerId: "player_real_parallel_b"}),
  m: Object.freeze({accountId: "acc_real_market_cancel", playerId: "player_real_market_cancel"}),
});
const CROSS_ACCOUNT_ACTORS = Object.freeze({
  buy_first_buyer: Object.freeze({
    accountId: "acc_real_cross_10_buy_first_buyer",
    playerId: "player_real_cross_10_buy_first_buyer",
  }),
  buy_first_seller: Object.freeze({
    accountId: "acc_real_cross_11_buy_first_seller",
    playerId: "player_real_cross_11_buy_first_seller",
  }),
  cancel_first_buyer: Object.freeze({
    accountId: "acc_real_cross_20_cancel_first_buyer",
    playerId: "player_real_cross_20_cancel_first_buyer",
  }),
  cancel_first_seller: Object.freeze({
    accountId: "acc_real_cross_21_cancel_first_seller",
    playerId: "player_real_cross_21_cancel_first_seller",
  }),
  reciprocal_a: Object.freeze({
    accountId: "acc_real_cross_30_reciprocal_a",
    playerId: "player_real_cross_30_reciprocal_a",
  }),
  reciprocal_b: Object.freeze({
    accountId: "acc_real_cross_31_reciprocal_b",
    playerId: "player_real_cross_31_reciprocal_b",
  }),
});
const ALL_ACTORS = Object.freeze({...ACTORS, ...CROSS_ACCOUNT_ACTORS});
const BASE_TIME = "2026-07-14T04:00:00.000Z";
const CROSS_NODE_REPLAY_TOKEN = Buffer.alloc(32, 0x52).toString("base64url");
const CROSS_NODE_REPLAY_SESSION_ID = "sess_real_cross_node_replay_a";
const CROSS_NODE_REPLAY_NOW_MS = Date.parse("2026-07-15T00:00:00.000Z");
const MARKET_LISTING_IDS = Object.freeze({
  success: "listing_real_market_cancel_success",
  rollback: "listing_real_market_cancel_rollback",
  buyParallelA: "listing_real_market_buy_parallel_a",
  buyParallelB: "listing_real_market_buy_parallel_b",
  buyRace: "listing_real_market_buy_race",
  buyRollback: "listing_real_market_buy_rollback",
  buyFirstCancel: "listing_real_cross_buy_first_cancel",
  cancelFirstBuy: "listing_real_cross_cancel_first_buy",
  reciprocalSoldByA: "listing_real_cross_reciprocal_sold_by_a",
  reciprocalSoldByB: "listing_real_cross_reciprocal_sold_by_b",
  sellerClaimBuyFirst: "listing_real_seller_claim_buy_first",
  sellerClaimClaimFirst: "listing_real_seller_claim_claim_first",
  saleMailCollisionA: "listing_real_sale_mail_collision_a",
  saleMailCollisionB: "listing_real_sale_mail_collision_b",
  saleMailTimeoutA: "listing_real_sale_mail_timeout_a",
  saleMailTimeoutB: "listing_real_sale_mail_timeout_b",
});
const MAIL_CLAIM_IDS = Object.freeze({
  partial: "mail_real_claim_partial",
  full: "mail_real_claim_full",
  duplicateEnvelope: "mail_real_claim_duplicate_envelope",
  sellerClaimBuyFirst: "mail_real_seller_claim_buy_first",
  sellerClaimClaimFirst: "mail_real_seller_claim_claim_first",
});
const SALE_MAIL_COLLISION_ID = "mail_real_market_collision_shared";
const SALE_MAIL_COLLISION_RETRY_ID = "mail_real_market_collision_retry_b";
const SALE_MAIL_TIMEOUT_ID = "mail_real_market_timeout_shared";
const SALE_MAIL_TIMEOUT_RETRY_ID = "mail_real_market_timeout_retry_b";
const LEGACY_MAIL_COLLISION_RETRY_ID = "mail_real_legacy_collision_retry";
const LEGACY_MAIL_COLLISION_OPERATION_ID = "real_legacy_mail_collision_send";
const DUPLICATE_ENVELOPE_ID = "eqx_real_mail_duplicate_0001";
const MARKET_CREATE_ACTION_ID = "POST /market/list";
const MAIL_SEND_ACTION_ID = "POST /mail/send";
const MYSQL_MEMORY_BYTES = 128 * 1024 * 1024;
const RECEIPT_SEED_BATCH_SIZE = 500;
const WAIT_TIMEOUT_MS = 10000;
const MUTATION_RECEIPT_INSERT_SQL = `INSERT INTO mutation_receipts
  (operation_id, request_hash, action_id, account_id, committed_at, expires_at, document_json)
  VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON))`;

function actorForKey(actorKeyValue) {
  const actorKey = String(actorKeyValue || "");
  const actor = ALL_ACTORS[actorKey];
  assert.ok(actor, `未知真实 MySQL 门槛角色：${actorKey || "<empty>"}`);
  return actor;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolve = resolveValue;
    reject = rejectValue;
  });
  return {promise, resolve, reject};
}

function commitGate(label) {
  const entered = deferred();
  const released = deferred();
  void entered.promise.catch(() => {});
  let armed = true;
  let releasedValue = false;
  return Object.freeze({
    label,
    entered: entered.promise,
    async beforeCommit() {
      if (!armed) {
        return;
      }
      armed = false;
      entered.resolve();
      await released.promise;
    },
    release() {
      if (!releasedValue) {
        releasedValue = true;
        if (armed) {
          armed = false;
          entered.reject(new Error(`${label} 在进入前已取消。`));
        }
        released.resolve();
      }
    },
  });
}

function mysqlResourceLockObservation(queryArgs) {
  const first = queryArgs[0];
  const sql = String(typeof first === "string" ? first : first && first.sql || "")
    .replace(/\s+/g, " ")
    .trim();
  const params = Array.isArray(queryArgs[1])
    ? queryArgs[1]
    : first && Array.isArray(first.values)
      ? first.values
      : [];
  const mode = /\bFOR\s+UPDATE\s*$/i.test(sql)
    ? "exclusive"
    : /\bFOR\s+SHARE\s*$/i.test(sql)
      ? "shared"
      : "";
  if (mode === "") {
    return null;
  }
  const resource = /\bFROM\s+profile_bindings\s+WHERE\s+account_id\s*=\s*\?/i.test(sql)
    ? "profile_binding"
    : /\bFROM\s+profiles\s+WHERE\s+player_id\s*=\s*\?/i.test(sql)
      ? "profile"
      : /\bFROM\s+market_listings\s+WHERE\s+listing_id\s*=\s*\?/i.test(sql)
        ? "market_listing"
        : null;
  if (resource === null) {
    return null;
  }
  return Object.freeze({resource, key: String(params[0] || ""), mode});
}

function canonicalMarketBuyLockTrace(buyerKey, sellerKey, listingId) {
  const buyer = actorForKey(buyerKey);
  const seller = actorForKey(sellerKey);
  const canonical = (entries) => entries.sort((left, right) => {
    if (left.key === right.key) {
      return 0;
    }
    return left.key < right.key ? -1 : 1;
  });
  return [
    ...canonical([
      {resource: "profile_binding", key: buyer.accountId, mode: "exclusive"},
      {resource: "profile_binding", key: seller.accountId, mode: "shared"},
    ]),
    ...canonical([
      {resource: "profile", key: buyer.playerId, mode: "exclusive"},
      {resource: "profile", key: seller.playerId, mode: "shared"},
    ]),
    {resource: "market_listing", key: listingId, mode: "exclusive"},
  ];
}

function reciprocalBuyLockInterleaveGate(options) {
  const winnerTrace = options.winnerTrace;
  const contenderTrace = options.contenderTrace;
  assert.ok(Array.isArray(winnerTrace) && winnerTrace.length > 0);
  assert.ok(Array.isArray(contenderTrace) && contenderTrace.length > 0);
  assert.deepEqual(winnerTrace[0], {
    resource: "profile_binding",
    key: options.canonicalFirstAccountId,
    mode: "exclusive",
  });
  assert.deepEqual(contenderTrace[0], {
    resource: "profile_binding",
    key: options.canonicalFirstAccountId,
    mode: "shared",
  });

  const winnerFirstAcquired = deferred();
  const contenderFirstAttempted = deferred();
  const winnerRelease = deferred();
  const failure = deferred();
  void failure.promise.catch(() => {});
  const observations = {
    winner: {attempted: [], acquired: []},
    contender: {attempted: [], acquired: []},
  };
  let released = false;
  let failed = false;
  let lockWaitObserved = false;
  let contenderAcquiredBeforeRelease = false;

  function signalFailure(error) {
    if (!failed) {
      failed = true;
      failure.reject(error);
    }
  }

  function expectedTrace(participant) {
    return participant === "winner" ? winnerTrace : contenderTrace;
  }

  function gateFor(participant) {
    assert.ok(Object.hasOwn(observations, participant));
    return Object.freeze({
      async beforeQuery(queryArgs) {
        try {
          const lock = mysqlResourceLockObservation(queryArgs);
          if (lock === null) {
            return;
          }
          const participantObservations = observations[participant];
          const expected = expectedTrace(participant)[participantObservations.attempted.length];
          assert.ok(expected, `${participant} 发出了计划外的 MySQL 资源锁。`);
          assert.deepEqual(lock, expected, `${participant} 未按规范总序获取 MySQL 资源锁。`);
          participantObservations.attempted.push(lock);
          if (participant === "contender" && participantObservations.attempted.length === 1) {
            contenderFirstAttempted.resolve();
          }
        } catch (error) {
          signalFailure(error);
          throw error;
        }
      },
      async afterQuery(queryArgs) {
        try {
          const lock = mysqlResourceLockObservation(queryArgs);
          if (lock === null) {
            return;
          }
          const participantObservations = observations[participant];
          participantObservations.acquired.push(lock);
          if (participantObservations.acquired.length !== 1) {
            return;
          }
          if (participant === "winner") {
            winnerFirstAcquired.resolve();
            await winnerRelease.promise;
            return;
          }
          if (!released) {
            contenderAcquiredBeforeRelease = true;
            throw new Error("互买竞争方在规范首锁持有期间提前获得资源锁。");
          }
        } catch (error) {
          signalFailure(error);
          throw error;
        }
      },
    });
  }

  function waitFor(eventPromise) {
    return Promise.race([eventPromise, failure.promise]);
  }

  return Object.freeze({
    gateFor,
    waitForWinnerFirstAcquired() {
      return waitFor(winnerFirstAcquired.promise);
    },
    waitForContenderFirstAttempted() {
      return waitFor(contenderFirstAttempted.promise);
    },
    markLockWaitObserved() {
      lockWaitObserved = true;
    },
    release() {
      if (!released) {
        released = true;
        winnerRelease.resolve();
      }
    },
    assertVerified() {
      assert.equal(lockWaitObserved, true);
      assert.equal(contenderAcquiredBeforeRelease, false);
      assert.deepEqual(observations.winner.attempted, winnerTrace);
      assert.deepEqual(observations.winner.acquired, winnerTrace);
      assert.deepEqual(observations.contender.attempted, [contenderTrace[0]]);
      assert.deepEqual(observations.contender.acquired, [contenderTrace[0]]);
    },
  });
}

function gatedPool(basePool, gate) {
  return {
    async getConnection() {
      const connection = await basePool.getConnection();
      return new Proxy(connection, {
        get(target, property) {
          if (property === "commit" && gate && typeof gate.beforeCommit === "function") {
            return async () => {
              await gate.beforeCommit();
              return target.commit();
            };
          }
          if (property === "query" && gate
            && (typeof gate.beforeQuery === "function" || typeof gate.afterQuery === "function")) {
            return async (...args) => {
              if (typeof gate.beforeQuery === "function") {
                await gate.beforeQuery(args);
              }
              const result = await target.query(...args);
              if (typeof gate.afterQuery === "function") {
                await gate.afterQuery(args, result);
              }
              return result;
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
    query(...args) {
      return basePool.query(...args);
    },
    end() {
      return basePool.end();
    },
  };
}

async function reserveLoopbackPort() {
  const server = net.createServer();
  await settleWithin(new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  }), WAIT_TIMEOUT_MS, "一次性 MySQL 端口分配");
  const address = server.address();
  const port = Number(address && address.port);
  await settleWithin(
    new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    WAIT_TIMEOUT_MS,
    "一次性 MySQL 端口释放",
  );
  if (!Number.isInteger(port) || port <= 0 || port === 3306) {
    throw new Error("无法分配安全的一次性 MySQL 非 3306 端口。");
  }
  return port;
}

function mysqlBinaryDirectory() {
  const explicit = String(process.env.BEASTBOUND_ISOLATED_MYSQL_BIN_DIR || "").trim();
  const candidates = [
    explicit,
    "/Users/fander/.local/opt/mysql/mysql-9.7.0-er2/bin",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (["mysql", "mysqladmin", "mysqld"].every((name) => fs.existsSync(path.join(candidate, name)))) {
      return candidate;
    }
  }
  throw new Error("未找到隔离门槛需要的 MySQL 9.7 mysql/mysqladmin/mysqld 二进制。");
}

async function startIsolatedMysql() {
  const binDir = mysqlBinaryDirectory();
  const basedir = path.dirname(binDir);
  const port = await reserveLoopbackPort();
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-p0-6d2b-mysql-"));
  const datadir = path.join(runtimeDir, "data");
  const socketPath = path.join(runtimeDir, "mysql.sock");
  const pidPath = path.join(runtimeDir, "mysqld.pid");
  const errorLogPath = path.join(runtimeDir, "mysqld.log");
  const mysqlWrapperPath = path.join(runtimeDir, "mysql-no-defaults");
  const mysqldPath = path.join(binDir, "mysqld");

  const mysqlPath = path.join(binDir, "mysql");
  try {
    fs.writeFileSync(
      mysqlWrapperPath,
      `#!/usr/bin/env node
const {spawn} = require("node:child_process");
const env = {...process.env};
delete env.MYSQL_PWD;
const child = spawn(${JSON.stringify(mysqlPath)}, ["--no-defaults", "--no-login-paths", ...process.argv.slice(2)], {
  env,
  stdio: "inherit",
});
const timer = setTimeout(() => {
  child.kill("SIGKILL");
}, 8000);
child.once("error", () => {
  clearTimeout(timer);
  process.exitCode = 125;
});
child.once("exit", (code) => {
  clearTimeout(timer);
  process.exitCode = Number.isInteger(code) ? code : 124;
});
`,
      {mode: 0o700},
    );
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
      "--innodb-lock-wait-timeout=8",
      "--max-connections=50",
    ], {stdio: "ignore"});
  } catch (error) {
    fs.rmSync(runtimeDir, {recursive: true, force: true});
    throw error;
  }
  const exited = deferred();
  void exited.promise.catch(() => {});
  processHandle.once("exit", (code, signal) => exited.resolve({code, signal}));
  processHandle.once("error", exited.reject);

  const connectionOptions = {
    host: "127.0.0.1",
    port,
    user: "root",
    password: "",
    connectTimeout: 1000,
  };
  try {
    await waitUntil(async () => {
      if (childProcessExited(processHandle)) {
        const log = fs.existsSync(errorLogPath) ? fs.readFileSync(errorLogPath, "utf8").slice(-4000) : "";
        throw new Error(`一次性 mysqld 提前退出：${log}`);
      }
      let connection;
      try {
        connection = await mysql.createConnection(connectionOptions);
        await connection.query("SELECT 1");
        return true;
      } catch {
        return false;
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    }, WAIT_TIMEOUT_MS, "一次性 mysqld 启动");
  } catch (error) {
    await terminateChildProcess(processHandle, exited.promise);
    if (childProcessExited(processHandle)) {
      fs.rmSync(runtimeDir, {recursive: true, force: true});
    }
    throw error;
  }

  return {
    binDir,
    basedir,
    connectionOptions,
    datadir,
    errorLogPath,
    exited: exited.promise,
    mysqlPath: mysqlWrapperPath,
    mysqladminPath: path.join(binDir, "mysqladmin"),
    port,
    processHandle,
    runtimeDir,
  };
}

function childProcessExited(processHandle) {
  return !processHandle
    || !Number.isInteger(processHandle.pid)
    || processHandle.exitCode !== null
    || processHandle.signalCode !== null;
}

async function waitForChildProcessExit(processHandle, exitedPromise, timeoutMs) {
  if (childProcessExited(processHandle)) {
    return true;
  }
  await Promise.race([
    Promise.resolve(exitedPromise).catch(() => null),
    delay(timeoutMs),
  ]);
  return childProcessExited(processHandle);
}

async function terminateChildProcess(processHandle, exitedPromise) {
  if (childProcessExited(processHandle)) {
    return true;
  }
  processHandle.kill("SIGTERM");
  if (await waitForChildProcessExit(processHandle, exitedPromise, 5000)) {
    return true;
  }
  processHandle.kill("SIGKILL");
  return waitForChildProcessExit(processHandle, exitedPromise, 5000);
}

async function stopIsolatedMysql(runtime) {
  if (!runtime) {
    return;
  }
  let stopped = childProcessExited(runtime.processHandle);
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
        ], {
          stdio: "ignore",
          timeout: 5000,
          env: {...process.env, MYSQL_PWD: ""},
        });
      } catch {
        // The bounded signal fallback below owns final process cleanup.
      }
      stopped = await waitForChildProcessExit(runtime.processHandle, runtime.exited, 5000);
    }
    if (!stopped) {
      stopped = await terminateChildProcess(runtime.processHandle, runtime.exited);
    }
    if (!stopped) {
      throw new Error("一次性 mysqld 在 SIGKILL 后仍未确认退出，拒绝删除其 datadir。");
    }
  } finally {
    if (stopped) {
      fs.rmSync(runtime.runtimeDir, {recursive: true, force: true});
    }
  }
}

function storeOptions(runtime, database, gate = null) {
  return {
    mysqlPath: runtime.mysqlPath,
    host: "127.0.0.1",
    port: runtime.port,
    user: "root",
    password: "",
    database,
    createDatabase: true,
    ensureSchema: true,
    usePool: true,
    poolConnectionLimit: 2,
    poolFactory(options) {
      return gatedPool(mysql.createPool(options), gate);
    },
  };
}

function crossDatabaseStoreOptions(runtime, loaderDatabase, targetDatabase) {
  const options = storeOptions(runtime, loaderDatabase);
  return {
    ...options,
    poolFactory(poolOptions) {
      return mysql.createPool({...poolOptions, database: targetDatabase});
    },
  };
}

function seededAuthority(empty) {
  const data = cloneAuthorityRoot(empty);
  data.accounts = {};
  data.profileBindings = {};
  data.profiles = {};
  data.mutationReceipts = data.mutationReceipts || {};
  data.sessions = {
    ...(data.sessions || {}),
    [CROSS_NODE_REPLAY_SESSION_ID]: {
      sessionId: CROSS_NODE_REPLAY_SESSION_ID,
      accountId: ACTORS.a.accountId,
      tokenHash: crypto.createHash("sha256").update(CROSS_NODE_REPLAY_TOKEN).digest("hex"),
      createdAt: BASE_TIME,
      expiresAt: "2026-07-22T00:00:00.000Z",
      revokedAt: null,
      schemaVersion: 1,
    },
  };
  data.marketConfig = {taxRate: 0.05};
  for (const [key, actor] of Object.entries(ALL_ACTORS)) {
    const username = `real_mysql_${key}`;
    data.accounts[username] = {
      accountId: actor.accountId,
      username,
      displayName: `真实引擎猎人${key.toUpperCase()}`,
      role: "player",
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
      schemaVersion: 1,
    };
    data.profileBindings[actor.accountId] = {
      accountId: actor.accountId,
      playerId: actor.playerId,
      profileRevision: 1,
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
    };
    data.profiles[actor.playerId] = {
      playerId: actor.playerId,
      accountId: actor.accountId,
      profileRevision: 1,
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
      profile: {
        displayName: `真实引擎猎人${key.toUpperCase()}`,
        stoneCoins: key === "a" ? 100 : 200,
      },
    };
  }
  data.marketListings = {
    [MARKET_LISTING_IDS.success]: realMarketListing(MARKET_LISTING_IDS.success, 1),
    [MARKET_LISTING_IDS.rollback]: realMarketListing(MARKET_LISTING_IDS.rollback, 2),
    [MARKET_LISTING_IDS.buyParallelA]: realMarketListing(MARKET_LISTING_IDS.buyParallelA, 1),
    [MARKET_LISTING_IDS.buyParallelB]: realMarketListing(MARKET_LISTING_IDS.buyParallelB, 2),
    [MARKET_LISTING_IDS.buyRace]: realMarketListing(MARKET_LISTING_IDS.buyRace, 1),
    [MARKET_LISTING_IDS.buyRollback]: realMarketListing(MARKET_LISTING_IDS.buyRollback, 1),
    [MARKET_LISTING_IDS.buyFirstCancel]: realMarketListing(
      MARKET_LISTING_IDS.buyFirstCancel,
      1,
      {sellerKey: "buy_first_seller"},
    ),
    [MARKET_LISTING_IDS.cancelFirstBuy]: realMarketListing(
      MARKET_LISTING_IDS.cancelFirstBuy,
      2,
      {sellerKey: "cancel_first_seller"},
    ),
    [MARKET_LISTING_IDS.reciprocalSoldByA]: realMarketListing(
      MARKET_LISTING_IDS.reciprocalSoldByA,
      2,
      {sellerKey: "reciprocal_a"},
    ),
    [MARKET_LISTING_IDS.reciprocalSoldByB]: realMarketListing(
      MARKET_LISTING_IDS.reciprocalSoldByB,
      1,
      {sellerKey: "reciprocal_b"},
    ),
    [MARKET_LISTING_IDS.sellerClaimBuyFirst]: realMarketListing(
      MARKET_LISTING_IDS.sellerClaimBuyFirst,
      1,
    ),
    [MARKET_LISTING_IDS.sellerClaimClaimFirst]: realMarketListing(
      MARKET_LISTING_IDS.sellerClaimClaimFirst,
      1,
    ),
    [MARKET_LISTING_IDS.saleMailCollisionA]: realMarketListing(
      MARKET_LISTING_IDS.saleMailCollisionA,
      1,
    ),
    [MARKET_LISTING_IDS.saleMailCollisionB]: realMarketListing(
      MARKET_LISTING_IDS.saleMailCollisionB,
      2,
    ),
    [MARKET_LISTING_IDS.saleMailTimeoutA]: realMarketListing(
      MARKET_LISTING_IDS.saleMailTimeoutA,
      1,
    ),
    [MARKET_LISTING_IDS.saleMailTimeoutB]: realMarketListing(
      MARKET_LISTING_IDS.saleMailTimeoutB,
      2,
    ),
  };
  data.mailMessages = {
    ...(data.mailMessages || {}),
    [MAIL_CLAIM_IDS.partial]: realClaimMail(MAIL_CLAIM_IDS.partial, "m", {
      items: [{itemId: "item_meat_small", count: 2}],
    }),
    [MAIL_CLAIM_IDS.full]: realClaimMail(MAIL_CLAIM_IDS.full, "a", {
      currency: {stoneCoins: 7},
    }),
    [MAIL_CLAIM_IDS.duplicateEnvelope]: realClaimMail(MAIL_CLAIM_IDS.duplicateEnvelope, "b", {
      items: [{itemId: "weapon_wooden_club", count: 1}],
      equipmentEnvelopes: [{
        envelopeId: DUPLICATE_ENVELOPE_ID,
        itemId: "weapon_wooden_club",
        schemaVersion: 1,
      }],
    }),
    [MAIL_CLAIM_IDS.sellerClaimBuyFirst]: realClaimMail(
      MAIL_CLAIM_IDS.sellerClaimBuyFirst,
      "m",
      {currency: {stoneCoins: 5}},
    ),
    [MAIL_CLAIM_IDS.sellerClaimClaimFirst]: realClaimMail(
      MAIL_CLAIM_IDS.sellerClaimClaimFirst,
      "m",
      {currency: {stoneCoins: 6}},
    ),
  };
  return data;
}

function realClaimMail(mailId, actorKey, overrides = {}) {
  const actor = actorForKey(actorKey);
  return {
    mailId,
    senderAccountId: "system_mail",
    senderUsername: "system_mail",
    senderDisplayName: "系统邮件",
    recipientAccountId: actor.accountId,
    recipientUsername: `real_mail_${actorKey}`,
    recipientDisplayName: `真实邮件猎人${actorKey.toUpperCase()}`,
    title: "真实引擎邮件领取测试",
    body: "验证邮件与档案必须同事务结算。",
    items: overrides.items || [],
    equipmentEnvelopes: overrides.equipmentEnvelopes || [],
    currency: overrides.currency || {},
    createdAt: BASE_TIME,
    readAt: null,
    schemaVersion: 2,
  };
}

function realMarketListing(listingId, count, options = {}) {
  const seller = actorForKey(options.sellerKey || "m");
  return {
    listingId,
    sellerAccountId: seller.accountId,
    itemId: "item_meat_small",
    count,
    unitPrice: Number(options.unitPrice || 20),
    currency: "stoneCoins",
    createdAt: BASE_TIME,
    schemaVersion: 1,
  };
}

function realMarketCreateFillerListing(index) {
  const normalizedIndex = Number(index);
  return {
    listingId: `listing_real_market_create_capacity_${String(normalizedIndex).padStart(3, "0")}`,
    sellerAccountId: `acc_real_market_create_filler_${Math.floor(normalizedIndex / MARKET_MAX_LISTINGS_PER_SELLER)}`,
    itemId: "item_meat_small",
    count: 1,
    unitPrice: 10 + normalizedIndex,
    currency: "stoneCoins",
    createdAt: BASE_TIME,
    schemaVersion: 1,
  };
}

function marketCreateSeededAuthority(empty, totalListingCount) {
  assert.ok(Number.isSafeInteger(totalListingCount));
  assert.ok(totalListingCount >= 0 && totalListingCount <= MARKET_MAX_LISTINGS);
  const data = seededAuthority(empty);
  data.marketListings = {};
  for (let index = 0; index < totalListingCount; index += 1) {
    const listing = realMarketCreateFillerListing(index);
    data.marketListings[listing.listingId] = listing;
  }
  for (const actorKey of ["a", "b"]) {
    const actor = actorForKey(actorKey);
    data.profiles[actor.playerId].profile.backpackSlots = [{
      itemId: "item_meat_small",
      count: 2,
    }];
  }
  return data;
}

function marketCreateMutation(before, actorKey, options) {
  const actor = actorForKey(actorKey);
  const after = cloneAuthorityRoot(before);
  const nextRevision = Number(before.profileBindings[actor.accountId].profileRevision) + 1;
  const beforeProfile = before.profiles[actor.playerId].profile;
  const beforeSlots = Array.isArray(beforeProfile.backpackSlots) ? beforeProfile.backpackSlots : [];
  const beforeItemCount = beforeSlots
    .filter((slot) => slot && slot.itemId === "item_meat_small")
    .reduce((total, slot) => total + Number(slot.count || 0), 0);
  assert.ok(beforeItemCount >= 1, `${actorKey} 缺少真实市场挂单测试道具。`);
  after.profileBindings[actor.accountId] = {
    ...before.profileBindings[actor.accountId],
    profileRevision: nextRevision,
    updatedAt: options.updatedAt,
  };
  after.profiles[actor.playerId] = {
    ...before.profiles[actor.playerId],
    profileRevision: nextRevision,
    updatedAt: options.updatedAt,
    profile: {
      ...beforeProfile,
      backpackSlots: beforeItemCount > 1
        ? [{itemId: "item_meat_small", count: beforeItemCount - 1}]
        : [],
    },
  };
  const listing = {
    listingId: options.listingId,
    sellerAccountId: actor.accountId,
    itemId: "item_meat_small",
    count: 1,
    unitPrice: Number(options.unitPrice),
    currency: "stoneCoins",
    createdAt: options.updatedAt,
    schemaVersion: 1,
  };
  assert.equal(Object.hasOwn(before.marketListings, listing.listingId), false);
  after.marketListings[listing.listingId] = listing;
  after.mutationReceipts = stageDurableMutationReceipt(after.mutationReceipts, {
    schemaVersion: 1,
    operationId: options.operationId,
    requestHash: options.requestHash,
    actionId: MARKET_CREATE_ACTION_ID,
    accountId: actor.accountId,
    committedAt: options.updatedAt,
    expiresAt: "2026-07-18T05:00:00.000Z",
    response: {ok: true, listing, saleMail: null, operationId: options.operationId},
  }, {nowMs: Date.parse(options.updatedAt)});
  const beforeListings = Object.values(before.marketListings || {});
  return {
    after,
    consistencyScope: {
      kind: "row_local_market_create_v1",
      accountId: actor.accountId,
      playerId: actor.playerId,
      listingId: listing.listingId,
      observedTotalListingCount: beforeListings.length,
      observedSellerListingCount: beforeListings.filter((entry) => (
        entry.sellerAccountId === actor.accountId
      )).length,
      maxTotalListings: MARKET_MAX_LISTINGS,
      maxSellerListings: MARKET_MAX_LISTINGS_PER_SELLER,
      operationId: options.operationId,
      requestHash: options.requestHash,
      actionId: MARKET_CREATE_ACTION_ID,
    },
  };
}

function saveMarketCreate(store, before, actorKey, options) {
  const mutation = marketCreateMutation(before, actorKey, options);
  return {
    after: mutation.after,
    promise: options.legacy === true
      ? store.saveAsync(mutation.after)
      : store.saveAsync(mutation.after, {consistencyScope: mutation.consistencyScope}),
  };
}

function mailSendSeededAuthority(empty) {
  const data = seededAuthority(empty);
  data.marketListings = {};
  data.mailMessages = {};
  data.consumedEquipmentEnvelopes = {};
  for (const actorKey of ["a", "b"]) {
    const actor = actorForKey(actorKey);
    data.profiles[actor.playerId].profile.backpackSlots = [{
      itemId: "item_meat_small",
      count: 4,
    }];
    data.profiles[actor.playerId].profile.captureTools = {};
  }
  return data;
}

function mailSendMutation(before, actorKey, recipientKey, options) {
  const actor = actorForKey(actorKey);
  const recipient = actorForKey(recipientKey);
  const after = cloneAuthorityRoot(before);
  const mode = String(options.mode || "text");
  const updatedAt = String(options.updatedAt);
  const items = mode === "ordinary_items"
    ? [{itemId: "item_meat_small", count: 1}]
    : [];
  let playerId = "";
  if (mode === "ordinary_items") {
    playerId = actor.playerId;
    const nextRevision = Number(before.profileBindings[actor.accountId].profileRevision) + 1;
    const beforeProfile = before.profiles[actor.playerId].profile;
    const beforeCount = (Array.isArray(beforeProfile.backpackSlots)
      ? beforeProfile.backpackSlots
      : [])
      .filter((slot) => slot && slot.itemId === "item_meat_small")
      .reduce((total, slot) => total + Number(slot.count || 0), 0);
    assert.ok(beforeCount >= 1, `${actorKey} 缺少真实邮件附件测试道具。`);
    after.profileBindings[actor.accountId] = {
      ...before.profileBindings[actor.accountId],
      profileRevision: nextRevision,
      updatedAt,
    };
    after.profiles[actor.playerId] = {
      ...before.profiles[actor.playerId],
      profileRevision: nextRevision,
      updatedAt,
      profile: {
        ...beforeProfile,
        backpackSlots: beforeCount > 1
          ? [{itemId: "item_meat_small", count: beforeCount - 1}]
          : [],
      },
    };
  }
  const mail = {
    mailId: String(options.mailId),
    senderAccountId: actor.accountId,
    senderUsername: `real_mysql_${actorKey}`,
    senderDisplayName: `真实引擎猎人${actorKey.toUpperCase()}`,
    recipientAccountId: recipient.accountId,
    recipientUsername: `real_mysql_${recipientKey}`,
    recipientDisplayName: `真实引擎猎人${recipientKey.toUpperCase()}`,
    title: String(options.title || "真实 MySQL 普通发信"),
    body: "验证邮件、普通附件和 durable receipt 同事务提交。",
    items,
    equipmentEnvelopes: [],
    currency: {},
    createdAt: updatedAt,
    readAt: null,
    schemaVersion: 2,
  };
  if (mode === "text") {
    mail.settledAt = updatedAt;
  }
  assert.equal(Object.hasOwn(before.mailMessages, mail.mailId), false);
  after.mailMessages[mail.mailId] = mail;
  const operationId = String(options.operationId);
  const response = {
    ok: true,
    mail: {
      mailId: mail.mailId,
      mailKind: "",
      senderUsername: mail.senderUsername,
      senderDisplayName: mail.senderDisplayName,
      recipientUsername: mail.recipientUsername,
      recipientDisplayName: mail.recipientDisplayName,
      title: mail.title,
      body: mail.body,
      items: mail.items,
      currency: {},
      createdAt: mail.createdAt,
      readAt: null,
      settledAt: mode === "text" ? mail.createdAt : null,
      schemaVersion: 2,
      equipmentEnvelopes: [],
    },
    message: "邮件已发送。",
    durableCommit: {
      schemaVersion: 1,
      operationId,
      actionId: MAIL_SEND_ACTION_ID,
      committedAt: updatedAt,
      replayed: false,
    },
  };
  if (mode === "ordinary_items") {
    const binding = after.profileBindings[actor.accountId];
    const profile = after.profiles[actor.playerId];
    response.profileSummary = {
      accountId: actor.accountId,
      username: `real_mysql_${actorKey}`,
      displayName: `真实引擎猎人${actorKey.toUpperCase()}`,
      playerId: actor.playerId,
      profileRevision: binding.profileRevision,
      storageMode: "server_document",
      serverAuthority: "profile_document",
      hasProfile: true,
      updatedAt: binding.updatedAt,
      schemaVersion: 1,
    };
    response.profile = profile.profile;
  }
  after.mutationReceipts = stageDurableMutationReceipt(after.mutationReceipts, {
    schemaVersion: 1,
    operationId,
    requestHash: String(options.requestHash),
    actionId: MAIL_SEND_ACTION_ID,
    accountId: actor.accountId,
    committedAt: updatedAt,
    expiresAt: "2026-07-18T05:00:00.000Z",
    response,
  }, {nowMs: Date.parse(updatedAt)});
  return {
    after,
    consistencyScope: {
      kind: "row_local_mail_send_v1",
      mode,
      accountId: actor.accountId,
      playerId,
      recipientAccountId: recipient.accountId,
      recipientUsername: `real_mysql_${recipientKey}`,
      mailId: mail.mailId,
      operationId: String(options.operationId),
      requestHash: String(options.requestHash),
      actionId: MAIL_SEND_ACTION_ID,
    },
  };
}

function saveMailSend(store, before, actorKey, recipientKey, options) {
  const mutation = mailSendMutation(before, actorKey, recipientKey, options);
  return {
    after: mutation.after,
    promise: store.saveAsync(mutation.after, {consistencyScope: mutation.consistencyScope}),
  };
}

function nextProfileAuthority(before, actorKey, options) {
  const actor = ACTORS[actorKey];
  const after = cloneAuthorityRoot(before);
  const nextRevision = Number(before.profileBindings[actor.accountId].profileRevision) + 1;
  after.profileBindings[actor.accountId] = {
    ...before.profileBindings[actor.accountId],
    profileRevision: nextRevision,
    updatedAt: options.updatedAt,
  };
  after.profiles[actor.playerId] = {
    ...before.profiles[actor.playerId],
    profileRevision: nextRevision,
    updatedAt: options.updatedAt,
    profile: {
      ...before.profiles[actor.playerId].profile,
      stoneCoins: options.stoneCoins,
    },
  };
  after.mutationReceipts = stageDurableMutationReceipt(after.mutationReceipts, {
    schemaVersion: 1,
    operationId: options.operationId,
    requestHash: options.requestHash,
    actionId: "record_point_save",
    accountId: actor.accountId,
    committedAt: options.updatedAt,
    expiresAt: "2026-07-17T05:00:00.000Z",
    response: {ok: true, operationId: options.operationId},
  }, {nowMs: Date.parse(options.updatedAt)});
  return after;
}

function rowLocalOptions(actorKey, options) {
  const actor = ACTORS[actorKey];
  return {
    consistencyScope: {
      kind: "row_local_profile_v1",
      accountId: actor.accountId,
      playerId: actor.playerId,
      operationId: options.operationId,
      requestHash: options.requestHash,
      actionId: "record_point_save",
    },
  };
}

function saveProfile(store, before, actorKey, options) {
  const after = nextProfileAuthority(before, actorKey, options);
  return {after, promise: store.saveAsync(after, rowLocalOptions(actorKey, options))};
}

function saveMarketCancel(store, before, listingId, options) {
  const actorKey = String(options.actorKey || "m");
  const actor = actorForKey(actorKey);
  const listing = before.marketListings[listingId];
  assert.ok(listing, `撤单门槛缺少挂单：${listingId}`);
  assert.equal(listing.sellerAccountId, actor.accountId);
  const after = cloneAuthorityRoot(before);
  const nextRevision = Number(before.profileBindings[actor.accountId].profileRevision) + 1;
  after.profileBindings[actor.accountId] = {
    ...before.profileBindings[actor.accountId],
    profileRevision: nextRevision,
    updatedAt: options.updatedAt,
  };
  after.profiles[actor.playerId] = {
    ...before.profiles[actor.playerId],
    profileRevision: nextRevision,
    updatedAt: options.updatedAt,
    profile: {
      ...before.profiles[actor.playerId].profile,
      backpackSlots: [{itemId: listing.itemId, count: listing.count}],
    },
  };
  delete after.marketListings[listingId];
  after.mutationReceipts = stageDurableMutationReceipt(after.mutationReceipts, {
    schemaVersion: 1,
    operationId: options.operationId,
    requestHash: options.requestHash,
    actionId: "POST /market/cancel",
    accountId: actor.accountId,
    committedAt: options.updatedAt,
    expiresAt: "2026-07-17T05:00:00.000Z",
    response: {ok: true, operationId: options.operationId},
  }, {nowMs: Date.parse(options.updatedAt)});
  return {
    after,
    promise: store.saveAsync(after, {
      consistencyScope: {
        kind: "row_local_market_cancel_v1",
        accountId: actor.accountId,
        playerId: actor.playerId,
        listingId,
        operationId: options.operationId,
        requestHash: options.requestHash,
        actionId: "POST /market/cancel",
      },
    }),
  };
}

function saveMarketBuy(store, before, buyerKey, listingId, options) {
  const buyer = actorForKey(buyerKey);
  const listing = before.marketListings[listingId];
  const sellerKey = String(options.sellerKey || "m");
  const seller = actorForKey(sellerKey);
  assert.ok(listing, `购买门槛缺少挂单：${listingId}`);
  assert.equal(listing.sellerAccountId, seller.accountId);
  const after = cloneAuthorityRoot(before);
  const nextRevision = Number(before.profileBindings[buyer.accountId].profileRevision) + 1;
  const totalPrice = Number(listing.count) * Number(listing.unitPrice);
  const taxBps = Number(before.marketConfig.itemTaxBps[listing.itemId]
    ?? before.marketConfig.defaultTaxBps);
  const taxAmount = Math.min(totalPrice, Math.ceil(totalPrice * taxBps / 10000));
  const sellerReceives = totalPrice - taxAmount;
  after.profileBindings[buyer.accountId] = {
    ...before.profileBindings[buyer.accountId],
    profileRevision: nextRevision,
    updatedAt: options.updatedAt,
  };
  const beforeBuyerProfile = before.profiles[buyer.playerId].profile;
  after.profiles[buyer.playerId] = {
    ...before.profiles[buyer.playerId],
    profileRevision: nextRevision,
    updatedAt: options.updatedAt,
    profile: {
      ...beforeBuyerProfile,
      stoneCoins: Number(beforeBuyerProfile.stoneCoins) - totalPrice,
      backpackSlots: [
        ...(Array.isArray(beforeBuyerProfile.backpackSlots) ? beforeBuyerProfile.backpackSlots : []),
        {itemId: listing.itemId, count: listing.count},
      ],
    },
  };
  delete after.marketListings[listingId];
  after.mailMessages[options.saleMailId] = {
    mailId: options.saleMailId,
    senderAccountId: "system_market",
    senderUsername: "auction_house",
    senderDisplayName: "拍卖行",
    recipientAccountId: seller.accountId,
    recipientUsername: sellerKey === "m" ? "real_market_seller" : `real_mysql_${sellerKey}`,
    recipientDisplayName: sellerKey === "m"
      ? "真实市场卖家"
      : `真实引擎猎人${sellerKey.toUpperCase()}`,
    title: "拍卖行成交通知",
    body: "真实引擎市场成交测试",
    currency: {[listing.currency]: sellerReceives},
    items: [],
    createdAt: options.updatedAt,
    readAt: null,
    schemaVersion: 1,
  };
  after.marketConfig = {
    ...before.marketConfig,
    taxCollected: {
      ...before.marketConfig.taxCollected,
      [listing.currency]: Number(before.marketConfig.taxCollected[listing.currency]) + taxAmount,
    },
  };
  const receiptResponse = {
    ok: true,
    saleMail: after.mailMessages[options.saleMailId],
    receipt: {
      listingId,
      currency: listing.currency,
      tax: taxAmount,
      sellerReceives,
    },
    operationId: options.operationId,
  };
  after.mutationReceipts = stageDurableMutationReceipt(after.mutationReceipts, {
    schemaVersion: 1,
    operationId: options.operationId,
    requestHash: options.requestHash,
    actionId: "POST /market/buy",
    accountId: buyer.accountId,
    committedAt: options.updatedAt,
    expiresAt: "2026-07-17T05:00:00.000Z",
    response: receiptResponse,
  }, {nowMs: Date.parse(options.updatedAt)});
  return {
    after,
    promise: store.saveAsync(after, {
      consistencyScope: {
        kind: "row_local_market_buy_v1",
        accountId: buyer.accountId,
        playerId: buyer.playerId,
        sellerAccountId: seller.accountId,
        sellerPlayerId: seller.playerId,
        listingId,
        saleMailId: options.saleMailId,
        currency: listing.currency,
        taxAmount,
        operationId: options.operationId,
        requestHash: options.requestHash,
        actionId: "POST /market/buy",
      },
    }),
  };
}

function saveMailClaim(store, before, actorKey, mailId, options) {
  const actor = ACTORS[actorKey];
  const after = cloneAuthorityRoot(before);
  const nextRevision = Number(before.profileBindings[actor.accountId].profileRevision) + 1;
  after.profileBindings[actor.accountId] = {
    ...before.profileBindings[actor.accountId],
    profileRevision: nextRevision,
    updatedAt: options.updatedAt,
  };
  const beforeProfile = before.profiles[actor.playerId].profile;
  after.profiles[actor.playerId] = {
    ...before.profiles[actor.playerId],
    profileRevision: nextRevision,
    updatedAt: options.updatedAt,
    profile: {
      ...beforeProfile,
      stoneCoins: Number(beforeProfile.stoneCoins || 0) + Number(options.stoneCoinsAdded || 0),
      mailClaimCount: Number(beforeProfile.mailClaimCount || 0) + 1,
    },
  };
  const beforeMail = before.mailMessages[mailId];
  const finalClaim = !options.remainingMail;
  const nextMail = finalClaim
    ? {
      ...beforeMail,
      items: [],
      equipmentEnvelopes: [],
      currency: {},
      readAt: typeof beforeMail.readAt === "string" && beforeMail.readAt.trim() !== ""
        ? beforeMail.readAt
        : options.updatedAt,
      settledAt: options.updatedAt,
      schemaVersion: 2,
    }
    : structuredClone(options.remainingMail);
  if (!finalClaim) {
    delete nextMail.settledAt;
  }
  after.mailMessages[mailId] = nextMail;
  const claimedEnvelopeIds = [...(options.claimedEnvelopeIds || [])].sort();
  const consumed = ensureConsumedEquipmentEnvelopeIds(
    after.consumedEquipmentEnvelopes,
    claimedEnvelopeIds,
  );
  assert.equal(consumed.ok, true, JSON.stringify(consumed));
  after.consumedEquipmentEnvelopes = consumed.ledger;
  after.mutationReceipts = stageDurableMutationReceipt(after.mutationReceipts, {
    schemaVersion: 1,
    operationId: options.operationId,
    requestHash: options.requestHash,
    actionId: "POST /mail/claim",
    accountId: actor.accountId,
    committedAt: options.updatedAt,
    expiresAt: "2026-07-17T05:00:00.000Z",
    response: {
      ok: true,
      claim: {mailId},
      mail: {
        mailId: nextMail.mailId,
        mailKind: String(nextMail.mailKind || ""),
        senderUsername: nextMail.senderUsername,
        senderDisplayName: nextMail.senderDisplayName,
        recipientUsername: nextMail.recipientUsername,
        recipientDisplayName: nextMail.recipientDisplayName,
        title: nextMail.title,
        body: nextMail.body,
        items: structuredClone(nextMail.items || []),
        currency: structuredClone(nextMail.currency || {}),
        createdAt: nextMail.createdAt,
        readAt: nextMail.readAt || null,
        settledAt: typeof nextMail.settledAt === "string" && nextMail.settledAt !== ""
          ? nextMail.settledAt
          : null,
        schemaVersion: 2,
        equipmentEnvelopes: structuredClone(nextMail.equipmentEnvelopes || []),
      },
      operationId: options.operationId,
    },
  }, {nowMs: Date.parse(options.updatedAt)});
  return {
    after,
    promise: store.saveAsync(after, {
      consistencyScope: {
        kind: "row_local_mail_claim_v1",
        accountId: actor.accountId,
        playerId: actor.playerId,
        mailId,
        mailDisposition: "update",
        claimedEnvelopeIds,
        operationId: options.operationId,
        requestHash: options.requestHash,
        actionId: "POST /mail/claim",
      },
    }),
  };
}

function saveLegacyAttachmentMail(store, before, actorKey, mailId, options) {
  const actor = actorForKey(actorKey);
  const recipient = actorForKey(String(options.recipientKey || "b"));
  const after = cloneAuthorityRoot(before);
  const beforeProfileDocument = before.profiles[actor.playerId];
  const nextRevision = Number(before.profileBindings[actor.accountId].profileRevision) + 1;
  const slots = structuredClone(beforeProfileDocument.profile.backpackSlots || []);
  let consumed = false;
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    if (!consumed && slot && slot.itemId === "item_meat_small" && Number(slot.count) > 0) {
      const nextCount = Number(slot.count) - 1;
      slots[index] = nextCount > 0 ? {...slot, count: nextCount} : {};
      consumed = true;
    }
  }
  assert.equal(consumed, true, "legacy 附件碰撞门槛缺少可发送物品");
  after.profileBindings[actor.accountId] = {
    ...before.profileBindings[actor.accountId],
    profileRevision: nextRevision,
    updatedAt: options.updatedAt,
  };
  after.profiles[actor.playerId] = {
    ...beforeProfileDocument,
    profileRevision: nextRevision,
    updatedAt: options.updatedAt,
    profile: {
      ...beforeProfileDocument.profile,
      backpackSlots: slots,
    },
  };
  after.mailMessages[mailId] = {
    mailId,
    senderAccountId: actor.accountId,
    senderUsername: `real_mysql_${actorKey}`,
    senderDisplayName: `真实引擎猎人${String(actorKey).toUpperCase()}`,
    recipientAccountId: recipient.accountId,
    recipientUsername: `real_mysql_${String(options.recipientKey || "b")}`,
    recipientDisplayName: `真实引擎猎人${String(options.recipientKey || "b").toUpperCase()}`,
    title: "legacy 附件邮件碰撞测试",
    body: "数据库中已存在同 ID 邮件时必须整单回滚。",
    items: [{itemId: "item_meat_small", count: 1}],
    ordinaryItems: [{itemId: "item_meat_small", count: 1}],
    equipmentEnvelopes: [],
    currency: {},
    createdAt: options.updatedAt,
    readAt: null,
    schemaVersion: 2,
  };
  after.mutationReceipts = stageDurableMutationReceipt(after.mutationReceipts, {
    schemaVersion: 1,
    operationId: options.operationId,
    requestHash: options.requestHash,
    actionId: "POST /mail/send",
    accountId: actor.accountId,
    committedAt: options.updatedAt,
    expiresAt: "2026-07-17T05:00:00.000Z",
    response: {
      ok: true,
      mail: after.mailMessages[mailId],
      operationId: options.operationId,
    },
  }, {nowMs: Date.parse(options.updatedAt)});
  return {
    after,
    promise: store.saveAsync(after, {
      durableOperation: {
        operationId: options.operationId,
        requestHash: options.requestHash,
        actionId: "POST /mail/send",
      },
    }),
  };
}

function canonicalMarketConfig() {
  return {
    defaultTaxBps: 500,
    itemTaxBps: {},
    taxCollected: {stoneCoins: 0, diamonds: 0},
    schemaVersion: 1,
  };
}

function nextMarketAuthority(before, taxRate) {
  const after = cloneAuthorityRoot(before);
  after.marketConfig = {...before.marketConfig, taxRate};
  return after;
}

function nextAuthEventAuthority(before) {
  const after = cloneAuthorityRoot(before);
  after.authEvents = [
    ...(Array.isArray(before.authEvents) ? before.authEvents : []),
    {
      eventId: "auth_shared_read_server_state_recovery",
      type: "shared_read_server_state_recovery",
      username: "system_gate",
      ok: true,
      message: "scoped read must preserve pending server-state initialization",
      createdAt: "2026-07-14T04:13:00.000Z",
      schemaVersion: 1,
    },
  ];
  return after;
}

async function waitUntil(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const remainingMs = Math.max(1, deadline - Date.now());
      if (await settleWithin(
        Promise.resolve().then(predicate),
        Math.min(1000, remainingMs),
        `${label}单次检查`,
      )) {
        return;
      }
    } catch (error) {
      lastError = error;
      if (/提前退出/.test(String(error && error.message || ""))) {
        throw error;
      }
    }
    await delay(25);
  }
  const error = new Error(`${label}超时。`);
  error.cause = lastError;
  throw error;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function settleWithin(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}超时。`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function adminQuery(admin, sql, params = [], label = "MySQL admin query") {
  return settleWithin(
    admin.query({sql, timeout: WAIT_TIMEOUT_MS}, params),
    WAIT_TIMEOUT_MS,
    label,
  );
}

async function lockWaitCount(admin) {
  const [rows] = await adminQuery(
    admin,
    "SELECT COUNT(*) AS wait_count FROM performance_schema.data_lock_waits",
    [],
    "MySQL lock-wait query",
  );
  return Number(rows[0] && rows[0].wait_count || 0);
}

async function waitForLockWait(admin, label) {
  await waitUntil(async () => await lockWaitCount(admin) > 0, WAIT_TIMEOUT_MS, label);
}

async function globalRevision(admin) {
  const [rows] = await adminQuery(
    admin,
    "SELECT revision FROM auth_store_revisions WHERE scope_key = 'auth'",
    [],
    "MySQL global revision query",
  );
  return Number(rows[0] && rows[0].revision);
}

async function serverStateRowCount(admin) {
  const [rows] = await adminQuery(
    admin,
    "SELECT COUNT(*) AS state_count FROM server_state WHERE state_key = 'auth'",
    [],
    "MySQL server-state row count query",
  );
  return Number(rows[0] && rows[0].state_count || 0);
}

async function profileRow(admin, actorKey) {
  const actor = actorForKey(actorKey);
  const [rows] = await adminQuery(
    admin,
    "SELECT profile_revision, CAST(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.stoneCoins')) AS SIGNED) AS stone_coins FROM profiles WHERE player_id = ?",
    [actor.playerId],
    "MySQL profile row query",
  );
  return {revision: Number(rows[0].profile_revision), stoneCoins: Number(rows[0].stone_coins)};
}

async function profileAssetRow(admin, actorKey, itemId = "item_meat_small") {
  const actor = actorForKey(actorKey);
  const [rows] = await adminQuery(
    admin,
    "SELECT profile_revision, CAST(profile_json AS CHAR) AS profile_json FROM profiles WHERE player_id = ?",
    [actor.playerId],
    "MySQL profile asset row query",
  );
  assert.ok(rows[0], `MySQL profile asset row 缺失：${actor.playerId}`);
  const profile = JSON.parse(String(rows[0].profile_json));
  const itemCount = (Array.isArray(profile.backpackSlots) ? profile.backpackSlots : [])
    .filter((slot) => slot && slot.itemId === itemId)
    .reduce((total, slot) => total + Number(slot.count || 0), 0);
  return {
    revision: Number(rows[0].profile_revision),
    stoneCoins: Number(profile.stoneCoins || 0),
    itemCount,
  };
}

async function deadlockCount(admin) {
  const [rows] = await adminQuery(
    admin,
    "SHOW GLOBAL STATUS LIKE 'Innodb_deadlocks'",
    [],
    "MySQL deadlock status query",
  );
  return Number(rows[0] && rows[0].Value || 0);
}

async function activeTransactionCount(admin) {
  const [rows] = await adminQuery(
    admin,
    "SELECT COUNT(*) AS trx_count FROM information_schema.innodb_trx",
    [],
    "MySQL active transaction query",
  );
  return Number(rows[0] && rows[0].trx_count || 0);
}

async function bindingRevision(admin, actorKey) {
  const actor = actorForKey(actorKey);
  const [rows] = await adminQuery(
    admin,
    "SELECT profile_revision FROM profile_bindings WHERE account_id = ?",
    [actor.accountId],
    "MySQL profile binding query",
  );
  return Number(rows[0] && rows[0].profile_revision);
}

async function marketTaxRate(admin) {
  const [rows] = await adminQuery(
    admin,
    "SELECT JSON_UNQUOTE(JSON_EXTRACT(document_json, '$.marketConfig.taxRate')) AS tax_rate FROM server_state WHERE state_key = 'auth'",
    [],
    "MySQL market tax query",
  );
  return Number(rows[0] && rows[0].tax_rate);
}

async function marketTaxCollected(admin, currency = "stoneCoins") {
  const pathByCurrency = {
    stoneCoins: "$.marketConfig.taxCollected.stoneCoins",
    diamonds: "$.marketConfig.taxCollected.diamonds",
  };
  const jsonPath = pathByCurrency[currency];
  assert.ok(jsonPath);
  const [rows] = await adminQuery(
    admin,
    `SELECT JSON_UNQUOTE(JSON_EXTRACT(document_json, '${jsonPath}')) AS tax_collected
      FROM server_state WHERE state_key = 'auth'`,
    [],
    "MySQL market tax collected query",
  );
  return Number(rows[0] && rows[0].tax_collected);
}

async function marketTaxJsonType(admin, currency = "stoneCoins") {
  const pathByCurrency = {
    stoneCoins: "$.marketConfig.taxCollected.stoneCoins",
    diamonds: "$.marketConfig.taxCollected.diamonds",
  };
  const jsonPath = pathByCurrency[currency];
  assert.ok(jsonPath);
  const [rows] = await adminQuery(
    admin,
    `SELECT JSON_TYPE(JSON_EXTRACT(document_json, '${jsonPath}')) AS tax_json_type
      FROM server_state WHERE state_key = 'auth'`,
    [],
    "MySQL market tax JSON type query",
  );
  return String(rows[0] && rows[0].tax_json_type || "");
}

async function probeMarketTaxIncrementSql(admin) {
  const connection = await admin.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      `UPDATE server_state
        SET document_json = JSON_SET(
          document_json,
          '$.marketConfig.taxCollected.stoneCoins',
          CAST(JSON_UNQUOTE(JSON_EXTRACT(document_json, '$.marketConfig.taxCollected.stoneCoins')) AS UNSIGNED) + ?
        )
        WHERE state_key = 'auth'
          AND JSON_TYPE(JSON_EXTRACT(document_json, '$.marketConfig.taxCollected.stoneCoins')) IN ('INTEGER', 'UNSIGNED INTEGER')
          AND CAST(JSON_UNQUOTE(JSON_EXTRACT(document_json, '$.marketConfig.taxCollected.stoneCoins')) AS UNSIGNED) <= ?`,
      [1, Number.MAX_SAFE_INTEGER - 1],
    );
    return Number(result && result.affectedRows);
  } finally {
    await connection.rollback();
    connection.release();
  }
}

async function marketListingExists(admin, listingId) {
  const [rows] = await adminQuery(
    admin,
    "SELECT COUNT(*) AS listing_count FROM market_listings WHERE listing_id = ?",
    [listingId],
    "MySQL market listing query",
  );
  return Number(rows[0] && rows[0].listing_count || 0) === 1;
}

async function marketListingCount(admin) {
  const [rows] = await adminQuery(
    admin,
    "SELECT COUNT(*) AS listing_count FROM market_listings",
    [],
    "MySQL market listing count query",
  );
  return Number(rows[0] && rows[0].listing_count || 0);
}

async function marketSellerListingCount(admin, actorKey) {
  const actor = actorForKey(actorKey);
  const [rows] = await adminQuery(
    admin,
    "SELECT COUNT(*) AS listing_count FROM market_listings WHERE seller_account_id = ?",
    [actor.accountId],
    "MySQL market seller listing count query",
  );
  return Number(rows[0] && rows[0].listing_count || 0);
}

async function marketCreateCapacityGuardRevision(admin) {
  const [rows] = await adminQuery(
    admin,
    "SELECT revision FROM auth_store_revisions WHERE scope_key = 'market_create_capacity'",
    [],
    "MySQL market create capacity guard revision query",
  );
  assert.ok(rows[0], "MySQL market create capacity guard row 缺失。");
  return Number(rows[0].revision);
}

async function marketSaleMailExists(admin, mailId) {
  const [rows] = await adminQuery(
    admin,
    "SELECT COUNT(*) AS mail_count FROM mail_messages WHERE mail_id = ?",
    [mailId],
    "MySQL market sale mail query",
  );
  return Number(rows[0] && rows[0].mail_count || 0) === 1;
}

async function mailDocument(admin, mailId) {
  const [rows] = await adminQuery(
    admin,
    "SELECT CAST(document_json AS CHAR) AS document_json FROM mail_messages WHERE mail_id = ?",
    [mailId],
    "MySQL mail document query",
  );
  return rows[0] ? JSON.parse(String(rows[0].document_json)) : null;
}

async function consumedEnvelopeExists(admin, envelopeId) {
  const [rows] = await adminQuery(
    admin,
    "SELECT COUNT(*) AS envelope_count FROM consumed_equipment_envelopes WHERE envelope_id = ?",
    [envelopeId],
    "MySQL consumed envelope query",
  );
  return Number(rows[0] && rows[0].envelope_count || 0) === 1;
}

async function mutationReceiptExists(admin, operationId) {
  const [rows] = await adminQuery(
    admin,
    "SELECT COUNT(*) AS receipt_count FROM mutation_receipts WHERE operation_id = ?",
    [operationId],
    "MySQL mutation receipt query",
  );
  return Number(rows[0] && rows[0].receipt_count || 0) === 1;
}

async function mutationReceiptCount(admin) {
  const [rows] = await adminQuery(
    admin,
    "SELECT COUNT(*) AS receipt_count FROM mutation_receipts",
    [],
    "MySQL mutation receipt count query",
  );
  return Number(rows[0] && rows[0].receipt_count || 0);
}

async function mutationReceiptCapacityRevision(admin) {
  const [rows] = await adminQuery(
    admin,
    "SELECT revision FROM auth_store_revisions WHERE scope_key = ?",
    [MUTATION_RECEIPT_CAPACITY_GUARD_KEY],
    "MySQL mutation receipt capacity query",
  );
  assert.ok(rows[0], "MySQL mutation receipt capacity row 缺失。");
  return Number(rows[0].revision);
}

function retentionReceipt(operationId, options = {}) {
  const committedAt = String(options.committedAt || "2026-06-01T00:00:00.000Z");
  const expiresAt = String(options.expiresAt || "2026-06-04T00:00:00.000Z");
  return {
    schemaVersion: 1,
    operationId: String(operationId),
    requestHash: crypto.createHash("sha256").update(String(operationId)).digest("hex"),
    actionId: "receipt.retention.gate",
    accountId: "",
    committedAt,
    expiresAt,
    response: {ok: true, fixture: "receipt_retention_gate"},
  };
}

function mutationReceiptWriteParams(receipt) {
  return [
    receipt.operationId,
    receipt.requestHash,
    receipt.actionId,
    receipt.accountId || null,
    receipt.committedAt,
    receipt.expiresAt,
    JSON.stringify(receipt),
  ];
}

function mutationReceiptInsertWrite(receipt) {
  return {
    kind: "insert",
    resource: "mutation_receipt",
    key: receipt.operationId,
    sql: MUTATION_RECEIPT_INSERT_SQL,
    params: mutationReceiptWriteParams(receipt),
    expectedAffectedRows: 1,
  };
}

function mutationReceiptDeleteWrite(receipt) {
  return {
    kind: "delete",
    resource: "mutation_receipt",
    key: receipt.operationId,
    sql: MUTATION_RECEIPT_DELETE_SQL,
    params: mutationReceiptWriteParams(receipt),
    expectedAffectedRows: 1,
  };
}

function mutationReceiptCapacityIncrementWrite() {
  return {
    kind: "update",
    resource: "mutation_receipt_capacity",
    key: MUTATION_RECEIPT_CAPACITY_GUARD_KEY,
    sql: MUTATION_RECEIPT_CAPACITY_UPDATE_SQL,
    params: [1, 1],
    expectedAffectedRows: 1,
  };
}

function receiptRetentionPlan(receipt, expiredVictim = null) {
  const receiptWrites = [
    ...(expiredVictim === null ? [] : [mutationReceiptDeleteWrite(expiredVictim)]),
    mutationReceiptInsertWrite(receipt),
  ].sort((left, right) => {
    if (left.key !== right.key) {
      return left.key < right.key ? -1 : 1;
    }
    return left.kind === right.kind ? 0 : left.kind === "delete" ? -1 : 1;
  });
  return {
    kind: "profile_conditional_v2",
    globalRevisionFence: false,
    globalCompatibilityBarrier: "shared",
    operationId: receipt.operationId,
    locks: [],
    writes: [
      ...(expiredVictim === null ? [mutationReceiptCapacityIncrementWrite()] : []),
      ...receiptWrites,
    ],
  };
}

async function seedExpiredMutationReceipts(admin, count) {
  assert.ok(Number.isSafeInteger(count) && count >= 0 && count <= DURABLE_RECEIPT_MAX_COUNT);
  for (let offset = 0; offset < count; offset += RECEIPT_SEED_BATCH_SIZE) {
    const batchCount = Math.min(RECEIPT_SEED_BATCH_SIZE, count - offset);
    const values = [];
    const params = [];
    for (let index = 0; index < batchCount; index += 1) {
      const receipt = retentionReceipt(
        `receipt_retention_seed_${String(offset + index).padStart(5, "0")}`,
      );
      values.push("(?, ?, ?, ?, ?, ?, CAST(? AS JSON))");
      params.push(...mutationReceiptWriteParams(receipt));
    }
    const [result] = await adminQuery(
      admin,
      `INSERT INTO mutation_receipts
        (operation_id, request_hash, action_id, account_id, committed_at, expires_at, document_json)
        VALUES ${values.join(", ")}`,
      params,
      `MySQL expired receipt seed ${offset}-${offset + batchCount - 1}`,
    );
    assert.equal(Number(result.affectedRows), batchCount);
  }
}

function isConflict(error, code) {
  return Boolean(error && error.code === code);
}

function isKnownLockWaitRollback(error) {
  return Boolean(
    error
    && error.code === "mysql_transaction_rolled_back"
    && error.mysqlCode === "ER_LOCK_WAIT_TIMEOUT"
    && error.outcomeUnknown === false
    && error.rollbackConfirmed === true,
  );
}

function isKnownDuplicateRollback(error) {
  return Boolean(
    error
    && error.code === "mysql_transaction_rolled_back"
    && error.mysqlCode === "ER_DUP_ENTRY"
    && error.outcomeUnknown === false
    && error.rollbackConfirmed === true,
  );
}

async function closeStores(stores, options = {}) {
  const closing = Promise.allSettled(stores.splice(0).map((store) => store.close()));
  if (options.bestEffort === true) {
    try {
      await settleWithin(closing, WAIT_TIMEOUT_MS, "MySQL store 关闭");
    } catch {
      return;
    }
    return;
  }
  const results = await settleWithin(closing, WAIT_TIMEOUT_MS, "MySQL store 关闭");
  const rejected = results.find((result) => result.status === "rejected");
  if (rejected) {
    throw rejected.reason;
  }
}

async function runRealMysqlGate(runtime) {
  const database = `beastbound_p0_6d2b_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const stores = [];
  const gates = [];
  const pendingWrites = [];
  let admin = null;
  function trackWrite(promise) {
    pendingWrites.push(promise);
    void promise.catch(() => {});
    return promise;
  }
  try {
    const bootstrap = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(bootstrap);
    const empty = bootstrap.load();
    const bootstrapWrite = trackWrite(bootstrap.saveAsync(seededAuthority(empty)));
    await settleWithin(bootstrapWrite, WAIT_TIMEOUT_MS, "bootstrap seed save");
    await closeStores(stores);

    admin = mysql.createPool({...runtime.connectionOptions, database, connectionLimit: 2});
    const [[serverIdentity]] = await adminQuery(
      admin,
      "SELECT VERSION() AS version, @@transaction_isolation AS isolation_level",
      [],
      "MySQL server identity query",
    );
    assert.match(String(serverIdentity.version), /^9\.7\.0/);
    assert.equal(String(serverIdentity.isolation_level).toUpperCase(), "REPEATABLE-READ");
    const deadlocksBefore = await deadlockCount(admin);
    assert.equal(await globalRevision(admin), 1);
    assert.equal(await marketTaxRate(admin), 0.05);

    const differentGate = commitGate("different_profile_a");
    gates.push(differentGate);
    const differentA = createMysqlAuthStore(storeOptions(runtime, database, differentGate));
    const differentB = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(differentA, differentB);
    const loadedDifferentA = differentA.load();
    const loadedDifferentB = differentB.load();
    const differentWriteA = saveProfile(differentA, loadedDifferentA, "a", {
      stoneCoins: 90,
      operationId: "real_parallel_a_001",
      requestHash: "a".repeat(64),
      updatedAt: "2026-07-14T04:01:00.000Z",
    });
    trackWrite(differentWriteA.promise);
    await settleWithin(differentGate.entered, WAIT_TIMEOUT_MS, "不同 profile 的 A COMMIT gate");
    const differentWriteB = saveProfile(differentB, loadedDifferentB, "b", {
      stoneCoins: 190,
      operationId: "real_parallel_b_001",
      requestHash: "b".repeat(64),
      updatedAt: "2026-07-14T04:01:00.000Z",
    });
    trackWrite(differentWriteB.promise);
    await waitForLockWait(admin, "不同 profile 净增长回执容量尾部等待");
    differentGate.release();
    const differentResults = await settleWithin(
      Promise.allSettled([differentWriteA.promise, differentWriteB.promise]),
      WAIT_TIMEOUT_MS,
      "不同 profile 净增长回执容量尾部提交",
    );
    assert.deepEqual(differentResults.map((result) => result.status), ["fulfilled", "fulfilled"]);
    assert.deepEqual(await profileRow(admin, "a"), {revision: 2, stoneCoins: 90});
    assert.deepEqual(await profileRow(admin, "b"), {revision: 2, stoneCoins: 190});
    assert.equal(await bindingRevision(admin, "a"), 2);
    assert.equal(await bindingRevision(admin, "b"), 2);
    assert.equal(await globalRevision(admin), 1);
    await closeStores(stores);

    const sameGate = commitGate("same_profile_winner");
    gates.push(sameGate);
    const sameA = createMysqlAuthStore(storeOptions(runtime, database, sameGate));
    const sameB = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(sameA, sameB);
    const loadedSameA = sameA.load();
    const loadedSameB = sameB.load();
    const sameWriteA = saveProfile(sameA, loadedSameA, "a", {
      stoneCoins: 80,
      operationId: "real_same_profile_a_001",
      requestHash: "c".repeat(64),
      updatedAt: "2026-07-14T04:02:00.000Z",
    });
    trackWrite(sameWriteA.promise);
    await settleWithin(sameGate.entered, WAIT_TIMEOUT_MS, "同 profile 赢家 COMMIT gate");
    const sameWriteB = saveProfile(sameB, loadedSameB, "a", {
      stoneCoins: 70,
      operationId: "real_same_profile_b_001",
      requestHash: "d".repeat(64),
      updatedAt: "2026-07-14T04:02:00.000Z",
    });
    trackWrite(sameWriteB.promise);
    await waitForLockWait(admin, "同 profile InnoDB 行锁等待");
    sameGate.release();
    const sameResults = await settleWithin(
      Promise.allSettled([sameWriteA.promise, sameWriteB.promise]),
      WAIT_TIMEOUT_MS,
      "同 profile 竞争提交",
    );
    assert.equal(sameResults[0].status, "fulfilled");
    assert.equal(sameResults[1].status, "rejected");
    assert.equal(isConflict(sameResults[1].reason, "mysql_resource_revision_conflict"), true);
    assert.deepEqual(await profileRow(admin, "a"), {revision: 3, stoneCoins: 80});
    assert.equal(await bindingRevision(admin, "a"), 3);
    assert.equal(await globalRevision(admin), 1);
    await closeStores(stores);

    const profileFirstGate = commitGate("profile_before_legacy");
    gates.push(profileFirstGate);
    const profileFirst = createMysqlAuthStore(storeOptions(runtime, database, profileFirstGate));
    const legacyAfter = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(profileFirst, legacyAfter);
    const loadedProfileFirst = profileFirst.load();
    const staleLegacy = legacyAfter.load();
    const profileFirstWrite = saveProfile(profileFirst, loadedProfileFirst, "b", {
      stoneCoins: 180,
      operationId: "real_profile_before_legacy",
      requestHash: "e".repeat(64),
      updatedAt: "2026-07-14T04:03:00.000Z",
    });
    trackWrite(profileFirstWrite.promise);
    await settleWithin(profileFirstGate.entered, WAIT_TIMEOUT_MS, "profile 先于 legacy 的 COMMIT gate");
    const staleLegacyWrite = trackWrite(legacyAfter.saveAsync(nextMarketAuthority(staleLegacy, 0.06)));
    await waitForLockWait(admin, "profile 先于 legacy 的全局屏障等待");
    profileFirstGate.release();
    const profileFirstResults = await settleWithin(
      Promise.allSettled([profileFirstWrite.promise, staleLegacyWrite]),
      WAIT_TIMEOUT_MS,
      "profile 先于 legacy 的竞争提交",
    );
    assert.equal(profileFirstResults[0].status, "fulfilled");
    assert.equal(profileFirstResults[1].status, "rejected");
    assert.equal(isConflict(profileFirstResults[1].reason, "mysql_resource_revision_conflict"), true);
    assert.deepEqual(await profileRow(admin, "b"), {revision: 3, stoneCoins: 180});
    assert.equal(await bindingRevision(admin, "b"), 3);
    assert.equal(await globalRevision(admin), 1);
    assert.equal(await marketTaxRate(admin), 0.05);
    await closeStores(stores);

    const legacyFirstGate = commitGate("legacy_before_profile");
    gates.push(legacyFirstGate);
    const legacyFirst = createMysqlAuthStore(storeOptions(runtime, database, legacyFirstGate));
    const profileAfter = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(legacyFirst, profileAfter);
    const loadedLegacyFirst = legacyFirst.load();
    const staleProfile = profileAfter.load();
    const legacyFirstWrite = trackWrite(legacyFirst.saveAsync(nextMarketAuthority(loadedLegacyFirst, 0.07)));
    await settleWithin(legacyFirstGate.entered, WAIT_TIMEOUT_MS, "legacy 先于 profile 的 COMMIT gate");
    const profileAfterWrite = saveProfile(profileAfter, staleProfile, "a", {
      stoneCoins: 60,
      operationId: "real_profile_after_legacy",
      requestHash: "f".repeat(64),
      updatedAt: "2026-07-14T04:04:00.000Z",
    });
    trackWrite(profileAfterWrite.promise);
    await waitForLockWait(admin, "legacy 先于 profile 的全局屏障等待");
    legacyFirstGate.release();
    const legacyFirstResults = await settleWithin(
      Promise.allSettled([legacyFirstWrite, profileAfterWrite.promise]),
      WAIT_TIMEOUT_MS,
      "legacy 先于 profile 的竞争提交",
    );
    assert.equal(legacyFirstResults[0].status, "fulfilled");
    assert.equal(legacyFirstResults[1].status, "rejected");
    assert.equal(isConflict(legacyFirstResults[1].reason, "mysql_store_revision_conflict"), true);
    assert.deepEqual(await profileRow(admin, "a"), {revision: 3, stoneCoins: 80});
    assert.equal(await bindingRevision(admin, "a"), 3);
    assert.equal(await globalRevision(admin), 2);
    assert.equal(await marketTaxRate(admin), 0.07);
    await closeStores(stores);

    const marketStore = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(marketStore);
    const loadedMarket = marketStore.load();
    const marketSuccess = saveMarketCancel(
      marketStore,
      loadedMarket,
      MARKET_LISTING_IDS.success,
      {
        operationId: "real_market_cancel_001",
        requestHash: "1".repeat(64),
        updatedAt: "2026-07-14T04:05:00.000Z",
      },
    );
    trackWrite(marketSuccess.promise);
    await settleWithin(marketSuccess.promise, WAIT_TIMEOUT_MS, "普通市场撤单真实引擎提交");
    assert.equal(await marketListingExists(admin, MARKET_LISTING_IDS.success), false);
    assert.equal(await marketListingExists(admin, MARKET_LISTING_IDS.rollback), true);
    assert.deepEqual(await profileRow(admin, "m"), {revision: 2, stoneCoins: 200});
    assert.equal(await globalRevision(admin), 2);
    await closeStores(stores);

    const marketRollbackStore = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(marketRollbackStore);
    const loadedMarketRollback = marketRollbackStore.load();
    const rollbackOperationId = "real_market_cancel_duplicate";
    const rollbackReceipt = {
      schemaVersion: 1,
      operationId: rollbackOperationId,
      requestHash: "2".repeat(64),
      actionId: "POST /market/cancel",
      accountId: ACTORS.m.accountId,
      committedAt: "2026-07-14T04:06:00.000Z",
      expiresAt: "2026-07-17T05:00:00.000Z",
      response: {ok: true, operationId: rollbackOperationId},
    };
    await adminQuery(
      admin,
      `INSERT INTO mutation_receipts
        (operation_id, request_hash, action_id, account_id, committed_at, expires_at, document_json)
        VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
      [
        rollbackOperationId,
        rollbackReceipt.requestHash,
        rollbackReceipt.actionId,
        rollbackReceipt.accountId,
        rollbackReceipt.committedAt,
        rollbackReceipt.expiresAt,
        JSON.stringify(rollbackReceipt),
      ],
      "MySQL duplicate market receipt seed",
    );
    const marketRollback = saveMarketCancel(
      marketRollbackStore,
      loadedMarketRollback,
      MARKET_LISTING_IDS.rollback,
      {
        operationId: rollbackOperationId,
        requestHash: "3".repeat(64),
        updatedAt: "2026-07-14T04:06:00.000Z",
      },
    );
    trackWrite(marketRollback.promise);
    await assert.rejects(
      settleWithin(marketRollback.promise, WAIT_TIMEOUT_MS, "普通市场撤单重复回执回滚"),
      (error) => isConflict(error, "mysql_resource_revision_conflict"),
    );
    assert.equal(await marketListingExists(admin, MARKET_LISTING_IDS.rollback), true);
    assert.deepEqual(await profileRow(admin, "m"), {revision: 2, stoneCoins: 200});
    assert.equal(await bindingRevision(admin, "m"), 2);
    assert.equal(await globalRevision(admin), 2);
    await adminQuery(
      admin,
      "DELETE FROM mutation_receipts WHERE operation_id = ?",
      [rollbackOperationId],
      "MySQL duplicate market receipt cleanup",
    );
    await closeStores(stores);

    const canonicalConfigStore = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(canonicalConfigStore);
    const canonicalConfigBefore = canonicalConfigStore.load();
    const canonicalConfigAfter = cloneAuthorityRoot(canonicalConfigBefore);
    canonicalConfigAfter.marketConfig = canonicalMarketConfig();
    const canonicalConfigWrite = trackWrite(canonicalConfigStore.saveAsync(canonicalConfigAfter));
    await settleWithin(canonicalConfigWrite, WAIT_TIMEOUT_MS, "市场税金配置规范化提交");
    assert.equal(await globalRevision(admin), 3);
    assert.equal(await marketTaxCollected(admin), 0);
    assert.equal(await marketTaxJsonType(admin), "INTEGER");
    assert.equal(await probeMarketTaxIncrementSql(admin), 1);
    await closeStores(stores);

    const parallelBuyGate = commitGate("different_market_buys_tax_tail");
    gates.push(parallelBuyGate);
    const parallelBuyA = createMysqlAuthStore(storeOptions(runtime, database, parallelBuyGate));
    const parallelBuyB = createMysqlAuthStore(storeOptions(runtime, database));
    const staleLegacyAfterBuy = createMysqlAuthStore(storeOptions(runtime, database));
    const replayMysqlStore = createMysqlAuthStore(storeOptions(runtime, database));
    let replayLoadCalls = 0;
    const replayStore = createAsyncWriteAuthStore({
      ...replayMysqlStore,
      load() {
        replayLoadCalls += 1;
        return replayMysqlStore.load();
      },
    }, {onError() {}});
    stores.push(parallelBuyA, parallelBuyB, staleLegacyAfterBuy, replayStore);
    const parallelBuyLoadedA = parallelBuyA.load();
    const parallelBuyLoadedB = parallelBuyB.load();
    const staleLegacyMarketState = staleLegacyAfterBuy.load();
    const replayInitialData = replayStore.load();
    const replayService = createAuthService({
      store: replayStore,
      initialData: replayInitialData,
      now: () => CROSS_NODE_REPLAY_NOW_MS,
    });
    const staleReplayProfile = replayService.getProfile(CROSS_NODE_REPLAY_TOKEN);
    assert.equal(staleReplayProfile.ok, true, JSON.stringify(staleReplayProfile));
    assert.equal(replayLoadCalls, 1);
    const replayGlobalRevision = await globalRevision(admin);
    const parallelMarketBuyA = saveMarketBuy(
      parallelBuyA,
      parallelBuyLoadedA,
      "a",
      MARKET_LISTING_IDS.buyParallelA,
      {
        saleMailId: "mail_real_market_buy_parallel_a",
        operationId: "real_market_buy_parallel_a",
        requestHash: "4".repeat(64),
        updatedAt: "2026-07-14T04:07:00.000Z",
      },
    );
    trackWrite(parallelMarketBuyA.promise);
    await settleWithin(parallelBuyGate.entered, WAIT_TIMEOUT_MS, "并行购买 A COMMIT gate");
    const parallelMarketBuyB = saveMarketBuy(
      parallelBuyB,
      parallelBuyLoadedB,
      "b",
      MARKET_LISTING_IDS.buyParallelB,
      {
        saleMailId: "mail_real_market_buy_parallel_b",
        operationId: "real_market_buy_parallel_b",
        requestHash: "5".repeat(64),
        updatedAt: "2026-07-14T04:07:00.000Z",
      },
    );
    trackWrite(parallelMarketBuyB.promise);
    await waitForLockWait(admin, "不同挂单购买的税金尾部行锁等待");
    parallelBuyGate.release();
    const parallelBuyResults = await settleWithin(
      Promise.allSettled([parallelMarketBuyA.promise, parallelMarketBuyB.promise]),
      WAIT_TIMEOUT_MS,
      "不同挂单购买提交",
    );
    if (parallelBuyResults[0].status === "rejected") {
      parallelBuyResults[0].reason.message = `并行购买A失败：${parallelBuyResults[0].reason.message}`;
      throw parallelBuyResults[0].reason;
    }
    if (parallelBuyResults[1].status === "rejected") {
      parallelBuyResults[1].reason.message = `并行购买B失败：${parallelBuyResults[1].reason.message}`;
      throw parallelBuyResults[1].reason;
    }
    assert.equal(parallelBuyResults[0].status, "fulfilled");
    assert.equal(parallelBuyResults[1].status, "fulfilled");
    assert.deepEqual(await profileRow(admin, "a"), {revision: 4, stoneCoins: 60});
    assert.deepEqual(await profileRow(admin, "b"), {revision: 4, stoneCoins: 140});
    assert.equal(await marketListingExists(admin, MARKET_LISTING_IDS.buyParallelA), false);
    assert.equal(await marketListingExists(admin, MARKET_LISTING_IDS.buyParallelB), false);
    assert.equal(await marketSaleMailExists(admin, "mail_real_market_buy_parallel_a"), true);
    assert.equal(await marketSaleMailExists(admin, "mail_real_market_buy_parallel_b"), true);
    assert.equal(await marketTaxCollected(admin), 3);
    assert.equal(await globalRevision(admin), 3);

    assert.equal(await globalRevision(admin), replayGlobalRevision);
    const staleExactReceiptView = await settleWithin(
      replayStore.readDurableMutationReceipt("real_market_buy_parallel_a"),
      WAIT_TIMEOUT_MS,
      "真实 MySQL 陈旧 Node 精确回执",
    );
    assert.equal(staleExactReceiptView.storeRevision, replayGlobalRevision);
    assert.equal(staleExactReceiptView.receipt.requestHash, "4".repeat(64));
    assert.equal(staleExactReceiptView.receipt.actionId, "POST /market/buy");
    assert.equal(staleExactReceiptView.receipt.accountId, ACTORS.a.accountId);
    assert.equal(staleExactReceiptView.authorityCurrent, false);
    assert.equal(replayLoadCalls, 1, "exact read 本身不能偷偷 full reload");

    const assetsBeforeReplay = await profileAssetRow(admin, "a");
    const taxBeforeReplay = await marketTaxCollected(admin);
    const crossNodeReplay = await settleWithin(
      replayService.invokeDurable(
        "buyMarketListing",
        [CROSS_NODE_REPLAY_TOKEN, {listingId: MARKET_LISTING_IDS.buyParallelA}],
        {
          operationId: "real_market_buy_parallel_a",
          requestHash: "4".repeat(64),
          actionId: "POST /market/buy",
        },
      ),
      WAIT_TIMEOUT_MS,
      "真实 MySQL 跨 Node service replay",
    );
    assert.equal(crossNodeReplay.ok, true, JSON.stringify(crossNodeReplay));
    assert.equal(crossNodeReplay.durableCommit.replayed, true);
    assert.equal(crossNodeReplay.durableCommit.operationId, "real_market_buy_parallel_a");
    assert.equal(crossNodeReplay.receipt.listingId, MARKET_LISTING_IDS.buyParallelA);
    assert.equal(replayLoadCalls, 2, "authorityCurrent=false 必须触发一次 full reload");

    const cachedReplayProfile = replayService.getProfile(CROSS_NODE_REPLAY_TOKEN);
    const cachedReplayItemCount = (cachedReplayProfile.profile.backpackSlots || [])
      .reduce((total, slot) => total + (
        slot && slot.itemId === "item_meat_small" ? Number(slot.count || 0) : 0
      ), 0);
    assert.deepEqual({
      revision: cachedReplayProfile.profileSummary.profileRevision,
      stoneCoins: cachedReplayProfile.profile.stoneCoins,
      itemCount: cachedReplayItemCount,
    }, assetsBeforeReplay);
    const replayRoot = replayService.snapshot();
    assert.equal(
      replayRoot.mutationReceipts.real_market_buy_parallel_a.requestHash,
      "4".repeat(64),
    );
    assert.equal(
      Object.hasOwn(replayRoot.marketListings, MARKET_LISTING_IDS.buyParallelA),
      false,
    );
    assert.deepEqual(await profileAssetRow(admin, "a"), assetsBeforeReplay);
    assert.equal(await marketTaxCollected(admin), taxBeforeReplay);
    assert.equal(await globalRevision(admin), replayGlobalRevision);
    assert.equal(await mutationReceiptExists(admin, "real_market_buy_parallel_a"), true);

    const currentExactReceiptView = await settleWithin(
      replayStore.readDurableMutationReceipt("real_market_buy_parallel_a"),
      WAIT_TIMEOUT_MS,
      "真实 MySQL reload 后精确回执基线",
    );
    assert.equal(currentExactReceiptView.authorityCurrent, true);
    assert.deepEqual({
      reads: replayStore.metrics().durableReceiptReads,
      hits: replayStore.metrics().durableReceiptReadHits,
    }, {reads: 3, hits: 3});
    await replayService.stopDurableAdmissionsAndDrain();

    const staleLegacyAfterBuyWrite = trackWrite(
      staleLegacyAfterBuy.saveAsync(nextMarketAuthority(staleLegacyMarketState, 0.08)),
    );
    await assert.rejects(
      settleWithin(staleLegacyAfterBuyWrite, WAIT_TIMEOUT_MS, "购买后旧 legacy 全局文档覆盖防护"),
      (error) => isConflict(error, "mysql_resource_revision_conflict"),
    );
    assert.equal(await marketTaxCollected(admin), 3);
    assert.equal(await globalRevision(admin), 3);
    await closeStores(stores);

    const buyRaceGate = commitGate("same_market_listing_buy_winner");
    gates.push(buyRaceGate);
    const buyRaceA = createMysqlAuthStore(storeOptions(runtime, database, buyRaceGate));
    const buyRaceB = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(buyRaceA, buyRaceB);
    const buyRaceLoadedA = buyRaceA.load();
    const buyRaceLoadedB = buyRaceB.load();
    const buyRaceWinner = saveMarketBuy(buyRaceA, buyRaceLoadedA, "a", MARKET_LISTING_IDS.buyRace, {
      saleMailId: "mail_real_market_buy_race_winner",
      operationId: "real_market_buy_race_winner",
      requestHash: "6".repeat(64),
      updatedAt: "2026-07-14T04:08:00.000Z",
    });
    trackWrite(buyRaceWinner.promise);
    await settleWithin(buyRaceGate.entered, WAIT_TIMEOUT_MS, "同挂单购买赢家 COMMIT gate");
    const buyRaceLoser = saveMarketBuy(buyRaceB, buyRaceLoadedB, "b", MARKET_LISTING_IDS.buyRace, {
      saleMailId: "mail_real_market_buy_race_loser",
      operationId: "real_market_buy_race_loser",
      requestHash: "7".repeat(64),
      updatedAt: "2026-07-14T04:08:00.000Z",
    });
    trackWrite(buyRaceLoser.promise);
    await waitForLockWait(admin, "同挂单购买 listing 行锁等待");
    buyRaceGate.release();
    const buyRaceResults = await settleWithin(
      Promise.allSettled([buyRaceWinner.promise, buyRaceLoser.promise]),
      WAIT_TIMEOUT_MS,
      "同挂单购买竞争提交",
    );
    if (buyRaceResults[0].status === "rejected") {
      buyRaceResults[0].reason.message = `同挂单购买赢家失败：${buyRaceResults[0].reason.message}`;
      throw buyRaceResults[0].reason;
    }
    assert.equal(buyRaceResults[0].status, "fulfilled");
    assert.equal(buyRaceResults[1].status, "rejected");
    assert.equal(isConflict(buyRaceResults[1].reason, "mysql_resource_revision_conflict"), true);
    assert.deepEqual(await profileRow(admin, "a"), {revision: 5, stoneCoins: 40});
    assert.deepEqual(await profileRow(admin, "b"), {revision: 4, stoneCoins: 140});
    assert.equal(await marketListingExists(admin, MARKET_LISTING_IDS.buyRace), false);
    assert.equal(await marketSaleMailExists(admin, "mail_real_market_buy_race_winner"), true);
    assert.equal(await marketSaleMailExists(admin, "mail_real_market_buy_race_loser"), false);
    assert.equal(await marketTaxCollected(admin), 4);
    assert.equal(await globalRevision(admin), 3);
    await closeStores(stores);

    const buyRollbackStore = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(buyRollbackStore);
    const buyRollbackBefore = buyRollbackStore.load();
    const buyRollbackOperationId = "real_market_buy_duplicate";
    const buyRollbackReceipt = {
      schemaVersion: 1,
      operationId: buyRollbackOperationId,
      requestHash: "8".repeat(64),
      actionId: "POST /market/buy",
      accountId: ACTORS.b.accountId,
      committedAt: "2026-07-14T04:09:00.000Z",
      expiresAt: "2026-07-17T05:00:00.000Z",
      response: {ok: true, operationId: buyRollbackOperationId},
    };
    await adminQuery(
      admin,
      `INSERT INTO mutation_receipts
        (operation_id, request_hash, action_id, account_id, committed_at, expires_at, document_json)
        VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
      [
        buyRollbackOperationId,
        buyRollbackReceipt.requestHash,
        buyRollbackReceipt.actionId,
        buyRollbackReceipt.accountId,
        buyRollbackReceipt.committedAt,
        buyRollbackReceipt.expiresAt,
        JSON.stringify(buyRollbackReceipt),
      ],
      "MySQL duplicate market buy receipt seed",
    );
    const buyRollback = saveMarketBuy(
      buyRollbackStore,
      buyRollbackBefore,
      "b",
      MARKET_LISTING_IDS.buyRollback,
      {
        saleMailId: "mail_real_market_buy_rollback",
        operationId: buyRollbackOperationId,
        requestHash: "9".repeat(64),
        updatedAt: "2026-07-14T04:09:00.000Z",
      },
    );
    trackWrite(buyRollback.promise);
    await assert.rejects(
      settleWithin(buyRollback.promise, WAIT_TIMEOUT_MS, "普通市场购买重复回执回滚"),
      (error) => isConflict(error, "mysql_resource_revision_conflict"),
    );
    assert.deepEqual(await profileRow(admin, "b"), {revision: 4, stoneCoins: 140});
    assert.equal(await marketListingExists(admin, MARKET_LISTING_IDS.buyRollback), true);
    assert.equal(await marketSaleMailExists(admin, "mail_real_market_buy_rollback"), false);
    assert.equal(await marketTaxCollected(admin), 4);
    assert.equal(await globalRevision(admin), 3);
    await adminQuery(
      admin,
      "DELETE FROM mutation_receipts WHERE operation_id = ?",
      [buyRollbackOperationId],
      "MySQL duplicate market buy receipt cleanup",
    );
    await closeStores(stores);

    const crossAccountGlobalRevision = await globalRevision(admin);
    const crossAccountTaxBaseline = await marketTaxCollected(admin);
    assert.equal(crossAccountGlobalRevision, 3);
    assert.equal(crossAccountTaxBaseline, 4);

    const buyFirstCancelGate = commitGate("buy_before_seller_cancel");
    gates.push(buyFirstCancelGate);
    const buyFirstStore = createMysqlAuthStore(
      storeOptions(runtime, database, buyFirstCancelGate),
    );
    const cancelAfterBuyStore = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(buyFirstStore, cancelAfterBuyStore);
    const buyFirstLoaded = buyFirstStore.load();
    const cancelAfterBuyLoaded = cancelAfterBuyStore.load();
    const buyFirstSaleMailId = "mail_real_cross_buy_first_cancel_buy";
    const buyFirstOperationId = "real_cross_buy_first_cancel_buy";
    const cancelAfterBuyOperationId = "real_cross_buy_first_cancel_loser_cancel";
    const buyFirstWrite = saveMarketBuy(
      buyFirstStore,
      buyFirstLoaded,
      "buy_first_buyer",
      MARKET_LISTING_IDS.buyFirstCancel,
      {
        sellerKey: "buy_first_seller",
        saleMailId: buyFirstSaleMailId,
        operationId: buyFirstOperationId,
        requestHash: "d".repeat(64),
        updatedAt: "2026-07-14T04:09:10.000Z",
      },
    );
    trackWrite(buyFirstWrite.promise);
    await settleWithin(
      buyFirstCancelGate.entered,
      WAIT_TIMEOUT_MS,
      "购买先于卖家撤单的 COMMIT gate",
    );
    const cancelAfterBuyWrite = saveMarketCancel(
      cancelAfterBuyStore,
      cancelAfterBuyLoaded,
      MARKET_LISTING_IDS.buyFirstCancel,
      {
        actorKey: "buy_first_seller",
        operationId: cancelAfterBuyOperationId,
        requestHash: "e".repeat(64),
        updatedAt: "2026-07-14T04:09:10.000Z",
      },
    );
    trackWrite(cancelAfterBuyWrite.promise);
    await waitForLockWait(admin, "购买先于卖家撤单的 seller 行锁等待");
    buyFirstCancelGate.release();
    const buyFirstCancelResults = await settleWithin(
      Promise.allSettled([buyFirstWrite.promise, cancelAfterBuyWrite.promise]),
      WAIT_TIMEOUT_MS,
      "购买先于卖家撤单竞争提交",
    );
    if (buyFirstCancelResults[0].status === "rejected") {
      buyFirstCancelResults[0].reason.message
        = `购买先于撤单的购买失败：${buyFirstCancelResults[0].reason.message}`;
      throw buyFirstCancelResults[0].reason;
    }
    assert.equal(buyFirstCancelResults[0].status, "fulfilled");
    assert.equal(buyFirstCancelResults[1].status, "rejected");
    assert.equal(
      isConflict(buyFirstCancelResults[1].reason, "mysql_resource_revision_conflict"),
      true,
    );
    const buyFirstBuyerAssets = await profileAssetRow(admin, "buy_first_buyer");
    const buyFirstSellerAssets = await profileAssetRow(admin, "buy_first_seller");
    assert.deepEqual(buyFirstBuyerAssets, {revision: 2, stoneCoins: 180, itemCount: 1});
    assert.deepEqual(buyFirstSellerAssets, {revision: 1, stoneCoins: 200, itemCount: 0});
    assert.equal(await bindingRevision(admin, "buy_first_buyer"), 2);
    assert.equal(await bindingRevision(admin, "buy_first_seller"), 1);
    assert.equal(await marketListingExists(admin, MARKET_LISTING_IDS.buyFirstCancel), false);
    const buyFirstSaleMail = await mailDocument(admin, buyFirstSaleMailId);
    assert.deepEqual({
      recipientAccountId: buyFirstSaleMail && buyFirstSaleMail.recipientAccountId,
      title: buyFirstSaleMail && buyFirstSaleMail.title,
      currency: buyFirstSaleMail && buyFirstSaleMail.currency,
      items: buyFirstSaleMail && buyFirstSaleMail.items,
    }, {
      recipientAccountId: actorForKey("buy_first_seller").accountId,
      title: "拍卖行成交通知",
      currency: {stoneCoins: 19},
      items: [],
    });
    const taxAfterBuyFirst = await marketTaxCollected(admin);
    assert.equal(taxAfterBuyFirst, crossAccountTaxBaseline + 1);
    assert.equal(
      200 - buyFirstBuyerAssets.stoneCoins,
      buyFirstSaleMail.currency.stoneCoins + taxAfterBuyFirst - crossAccountTaxBaseline,
    );
    assert.equal(await mutationReceiptExists(admin, buyFirstOperationId), true);
    assert.equal(await mutationReceiptExists(admin, cancelAfterBuyOperationId), false);
    assert.equal(await globalRevision(admin), crossAccountGlobalRevision);
    await closeStores(stores);

    const cancelFirstBuyGate = commitGate("seller_cancel_before_buy");
    gates.push(cancelFirstBuyGate);
    const cancelFirstStore = createMysqlAuthStore(
      storeOptions(runtime, database, cancelFirstBuyGate),
    );
    const buyAfterCancelStore = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(cancelFirstStore, buyAfterCancelStore);
    const cancelFirstLoaded = cancelFirstStore.load();
    const buyAfterCancelLoaded = buyAfterCancelStore.load();
    const cancelFirstOperationId = "real_cross_cancel_first_buy_cancel";
    const buyAfterCancelOperationId = "real_cross_cancel_first_buy_loser_buy";
    const buyAfterCancelSaleMailId = "mail_real_cross_cancel_first_buy_loser";
    const cancelFirstWrite = saveMarketCancel(
      cancelFirstStore,
      cancelFirstLoaded,
      MARKET_LISTING_IDS.cancelFirstBuy,
      {
        actorKey: "cancel_first_seller",
        operationId: cancelFirstOperationId,
        requestHash: "f".repeat(64),
        updatedAt: "2026-07-14T04:09:20.000Z",
      },
    );
    trackWrite(cancelFirstWrite.promise);
    await settleWithin(
      cancelFirstBuyGate.entered,
      WAIT_TIMEOUT_MS,
      "卖家撤单先于购买的 COMMIT gate",
    );
    const buyAfterCancelWrite = saveMarketBuy(
      buyAfterCancelStore,
      buyAfterCancelLoaded,
      "cancel_first_buyer",
      MARKET_LISTING_IDS.cancelFirstBuy,
      {
        sellerKey: "cancel_first_seller",
        saleMailId: buyAfterCancelSaleMailId,
        operationId: buyAfterCancelOperationId,
        requestHash: "0".repeat(64),
        updatedAt: "2026-07-14T04:09:20.000Z",
      },
    );
    trackWrite(buyAfterCancelWrite.promise);
    await waitForLockWait(admin, "卖家撤单先于购买的 seller 行锁等待");
    cancelFirstBuyGate.release();
    const cancelFirstBuyResults = await settleWithin(
      Promise.allSettled([cancelFirstWrite.promise, buyAfterCancelWrite.promise]),
      WAIT_TIMEOUT_MS,
      "卖家撤单先于购买竞争提交",
    );
    if (cancelFirstBuyResults[0].status === "rejected") {
      cancelFirstBuyResults[0].reason.message
        = `撤单先于购买的撤单失败：${cancelFirstBuyResults[0].reason.message}`;
      throw cancelFirstBuyResults[0].reason;
    }
    assert.equal(cancelFirstBuyResults[0].status, "fulfilled");
    assert.equal(cancelFirstBuyResults[1].status, "rejected");
    assert.equal(
      isConflict(cancelFirstBuyResults[1].reason, "mysql_resource_revision_conflict"),
      true,
    );
    assert.deepEqual(
      await profileAssetRow(admin, "cancel_first_buyer"),
      {revision: 1, stoneCoins: 200, itemCount: 0},
    );
    assert.deepEqual(
      await profileAssetRow(admin, "cancel_first_seller"),
      {revision: 2, stoneCoins: 200, itemCount: 2},
    );
    assert.equal(await bindingRevision(admin, "cancel_first_buyer"), 1);
    assert.equal(await bindingRevision(admin, "cancel_first_seller"), 2);
    assert.equal(await marketListingExists(admin, MARKET_LISTING_IDS.cancelFirstBuy), false);
    assert.equal(await marketSaleMailExists(admin, buyAfterCancelSaleMailId), false);
    assert.equal(await marketTaxCollected(admin), taxAfterBuyFirst);
    assert.equal(await mutationReceiptExists(admin, cancelFirstOperationId), true);
    assert.equal(await mutationReceiptExists(admin, buyAfterCancelOperationId), false);
    assert.equal(await globalRevision(admin), crossAccountGlobalRevision);
    await closeStores(stores);

    const reciprocalAExpectedLocks = canonicalMarketBuyLockTrace(
      "reciprocal_a",
      "reciprocal_b",
      MARKET_LISTING_IDS.reciprocalSoldByB,
    );
    const reciprocalBExpectedLocks = canonicalMarketBuyLockTrace(
      "reciprocal_b",
      "reciprocal_a",
      MARKET_LISTING_IDS.reciprocalSoldByA,
    );
    const reciprocalInterleave = reciprocalBuyLockInterleaveGate({
      canonicalFirstAccountId: actorForKey("reciprocal_a").accountId,
      winnerTrace: reciprocalAExpectedLocks,
      contenderTrace: reciprocalBExpectedLocks,
    });
    gates.push(reciprocalInterleave);
    const reciprocalAStore = createMysqlAuthStore(storeOptions(
      runtime,
      database,
      reciprocalInterleave.gateFor("winner"),
    ));
    const reciprocalBStaleStore = createMysqlAuthStore(storeOptions(
      runtime,
      database,
      reciprocalInterleave.gateFor("contender"),
    ));
    stores.push(reciprocalAStore, reciprocalBStaleStore);
    const reciprocalALoaded = reciprocalAStore.load();
    const reciprocalBStaleLoaded = reciprocalBStaleStore.load();
    const reciprocalAOperationId = "real_cross_reciprocal_a_buy";
    const reciprocalBStaleOperationId = "real_cross_reciprocal_b_stale";
    const reciprocalARemittanceMailId = "mail_real_cross_reciprocal_a_winner";
    const reciprocalBStaleMailId = "mail_real_cross_reciprocal_b_stale";
    const reciprocalAWrite = saveMarketBuy(
      reciprocalAStore,
      reciprocalALoaded,
      "reciprocal_a",
      MARKET_LISTING_IDS.reciprocalSoldByB,
      {
        sellerKey: "reciprocal_b",
        saleMailId: reciprocalARemittanceMailId,
        operationId: reciprocalAOperationId,
        requestHash: "1".repeat(64),
        updatedAt: "2026-07-14T04:09:30.000Z",
      },
    );
    trackWrite(reciprocalAWrite.promise);
    await settleWithin(
      reciprocalInterleave.waitForWinnerFirstAcquired(),
      WAIT_TIMEOUT_MS,
      "双向互买 A 获得 canonical 首个账号行锁",
    );
    const reciprocalBStaleWrite = saveMarketBuy(
      reciprocalBStaleStore,
      reciprocalBStaleLoaded,
      "reciprocal_b",
      MARKET_LISTING_IDS.reciprocalSoldByA,
      {
        sellerKey: "reciprocal_a",
        saleMailId: reciprocalBStaleMailId,
        operationId: reciprocalBStaleOperationId,
        requestHash: "2".repeat(64),
        updatedAt: "2026-07-14T04:09:30.000Z",
      },
    );
    trackWrite(reciprocalBStaleWrite.promise);
    await settleWithin(
      reciprocalInterleave.waitForContenderFirstAttempted(),
      WAIT_TIMEOUT_MS,
      "双向互买 B 以卖家角色请求同一 canonical 首锁",
    );
    await waitForLockWait(admin, "双向互买 canonical account 行锁等待");
    reciprocalInterleave.markLockWaitObserved();
    reciprocalInterleave.release();
    const reciprocalInitialResults = await settleWithin(
      Promise.allSettled([reciprocalAWrite.promise, reciprocalBStaleWrite.promise]),
      WAIT_TIMEOUT_MS,
      "双向互买首轮竞争提交",
    );
    if (reciprocalInitialResults[0].status === "rejected") {
      reciprocalInitialResults[0].reason.message
        = `双向互买 A 赢家失败：${reciprocalInitialResults[0].reason.message}`;
      throw reciprocalInitialResults[0].reason;
    }
    assert.equal(reciprocalInitialResults[0].status, "fulfilled");
    assert.equal(reciprocalInitialResults[1].status, "rejected");
    assert.equal(
      isConflict(reciprocalInitialResults[1].reason, "mysql_resource_revision_conflict"),
      true,
    );
    assert.deepEqual(
      await profileAssetRow(admin, "reciprocal_a"),
      {revision: 2, stoneCoins: 180, itemCount: 1},
    );
    assert.deepEqual(
      await profileAssetRow(admin, "reciprocal_b"),
      {revision: 1, stoneCoins: 200, itemCount: 0},
    );
    assert.equal(await bindingRevision(admin, "reciprocal_a"), 2);
    assert.equal(await bindingRevision(admin, "reciprocal_b"), 1);
    assert.equal(
      await marketListingExists(admin, MARKET_LISTING_IDS.reciprocalSoldByA),
      true,
    );
    assert.equal(
      await marketListingExists(admin, MARKET_LISTING_IDS.reciprocalSoldByB),
      false,
    );
    const reciprocalARemittanceMail = await mailDocument(admin, reciprocalARemittanceMailId);
    assert.deepEqual({
      recipientAccountId: reciprocalARemittanceMail
        && reciprocalARemittanceMail.recipientAccountId,
      currency: reciprocalARemittanceMail && reciprocalARemittanceMail.currency,
    }, {
      recipientAccountId: actorForKey("reciprocal_b").accountId,
      currency: {stoneCoins: 19},
    });
    assert.equal(await marketSaleMailExists(admin, reciprocalBStaleMailId), false);
    const taxAfterReciprocalFirst = await marketTaxCollected(admin);
    assert.equal(taxAfterReciprocalFirst, taxAfterBuyFirst + 1);
    assert.equal(await mutationReceiptExists(admin, reciprocalAOperationId), true);
    assert.equal(await mutationReceiptExists(admin, reciprocalBStaleOperationId), false);
    assert.equal(await globalRevision(admin), crossAccountGlobalRevision);
    reciprocalInterleave.assertVerified();
    await closeStores(stores);

    const reciprocalBRetryStore = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(reciprocalBRetryStore);
    const reciprocalBReloaded = reciprocalBRetryStore.load();
    const reciprocalBRetryOperationId = "real_cross_reciprocal_b_retry";
    const reciprocalBRetryMailId = "mail_real_cross_reciprocal_b_retry";
    const reciprocalBRetryWrite = saveMarketBuy(
      reciprocalBRetryStore,
      reciprocalBReloaded,
      "reciprocal_b",
      MARKET_LISTING_IDS.reciprocalSoldByA,
      {
        sellerKey: "reciprocal_a",
        saleMailId: reciprocalBRetryMailId,
        operationId: reciprocalBRetryOperationId,
        requestHash: "3".repeat(64),
        updatedAt: "2026-07-14T04:09:40.000Z",
      },
    );
    trackWrite(reciprocalBRetryWrite.promise);
    await settleWithin(
      reciprocalBRetryWrite.promise,
      WAIT_TIMEOUT_MS,
      "双向互买 loser reload 后重试",
    );
    const reciprocalAFinalAssets = await profileAssetRow(admin, "reciprocal_a");
    const reciprocalBFinalAssets = await profileAssetRow(admin, "reciprocal_b");
    assert.deepEqual(
      reciprocalAFinalAssets,
      {revision: 2, stoneCoins: 180, itemCount: 1},
    );
    assert.deepEqual(
      reciprocalBFinalAssets,
      {revision: 2, stoneCoins: 160, itemCount: 2},
    );
    assert.equal(await bindingRevision(admin, "reciprocal_a"), 2);
    assert.equal(await bindingRevision(admin, "reciprocal_b"), 2);
    assert.equal(
      await marketListingExists(admin, MARKET_LISTING_IDS.reciprocalSoldByA),
      false,
    );
    const [reciprocalAFinalRemittanceMail, reciprocalBRetryMail] = await Promise.all([
      mailDocument(admin, reciprocalARemittanceMailId),
      mailDocument(admin, reciprocalBRetryMailId),
    ]);
    assert.deepEqual({
      recipientAccountId: reciprocalAFinalRemittanceMail
        && reciprocalAFinalRemittanceMail.recipientAccountId,
      currency: reciprocalAFinalRemittanceMail && reciprocalAFinalRemittanceMail.currency,
    }, {
      recipientAccountId: actorForKey("reciprocal_b").accountId,
      currency: {stoneCoins: 19},
    });
    assert.deepEqual({
      recipientAccountId: reciprocalBRetryMail && reciprocalBRetryMail.recipientAccountId,
      currency: reciprocalBRetryMail && reciprocalBRetryMail.currency,
    }, {
      recipientAccountId: actorForKey("reciprocal_a").accountId,
      currency: {stoneCoins: 38},
    });
    const taxAfterReciprocalRetry = await marketTaxCollected(admin);
    assert.equal(taxAfterReciprocalRetry, taxAfterReciprocalFirst + 2);
    assert.equal(
      (200 - reciprocalAFinalAssets.stoneCoins) + (200 - reciprocalBFinalAssets.stoneCoins),
      reciprocalAFinalRemittanceMail.currency.stoneCoins
        + reciprocalBRetryMail.currency.stoneCoins
        + taxAfterReciprocalRetry - taxAfterBuyFirst,
    );
    assert.equal(reciprocalAFinalAssets.itemCount + reciprocalBFinalAssets.itemCount, 3);
    assert.equal(await mutationReceiptExists(admin, reciprocalBRetryOperationId), true);
    assert.equal(await mutationReceiptExists(admin, reciprocalBStaleOperationId), false);
    assert.equal(await globalRevision(admin), crossAccountGlobalRevision);
    await closeStores(stores);

    const partialMailStore = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(partialMailStore);
    const partialMailBefore = partialMailStore.load();
    const partialMail = partialMailBefore.mailMessages[MAIL_CLAIM_IDS.partial];
    const partialClaim = saveMailClaim(
      partialMailStore,
      partialMailBefore,
      "m",
      MAIL_CLAIM_IDS.partial,
      {
        remainingMail: {
          ...partialMail,
          items: [{itemId: "item_meat_small", count: 1}],
          equipmentEnvelopes: [],
          currency: {},
          schemaVersion: 2,
        },
        claimedEnvelopeIds: [],
        operationId: "real_mail_claim_partial",
        requestHash: "a".repeat(64),
        updatedAt: "2026-07-14T04:10:00.000Z",
      },
    );
    trackWrite(partialClaim.promise);
    await settleWithin(partialClaim.promise, WAIT_TIMEOUT_MS, "邮件部分领取真实 UPDATE 提交");
    const partialMailAfter = await mailDocument(admin, MAIL_CLAIM_IDS.partial);
    assert.deepEqual(partialMailAfter.items, [{itemId: "item_meat_small", count: 1}]);
    assert.deepEqual(await profileRow(admin, "m"), {revision: 3, stoneCoins: 200});
    assert.equal(await mutationReceiptExists(admin, "real_mail_claim_partial"), true);
    assert.equal(await globalRevision(admin), 3);
    await closeStores(stores);

    const fullMailStore = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(fullMailStore);
    const fullMailBefore = fullMailStore.load();
    const fullClaim = saveMailClaim(fullMailStore, fullMailBefore, "a", MAIL_CLAIM_IDS.full, {
      remainingMail: null,
      claimedEnvelopeIds: [],
      stoneCoinsAdded: 7,
      operationId: "real_mail_claim_full",
      requestHash: "b".repeat(64),
      updatedAt: "2026-07-14T04:11:00.000Z",
    });
    trackWrite(fullClaim.promise);
    await settleWithin(fullClaim.promise, WAIT_TIMEOUT_MS, "邮件完整领取真实结算 UPDATE 提交");
    assert.equal(await marketSaleMailExists(admin, MAIL_CLAIM_IDS.full), true);
    assert.deepEqual(await mailDocument(admin, MAIL_CLAIM_IDS.full), {
      ...fullMailBefore.mailMessages[MAIL_CLAIM_IDS.full],
      items: [],
      equipmentEnvelopes: [],
      currency: {},
      readAt: "2026-07-14T04:11:00.000Z",
      settledAt: "2026-07-14T04:11:00.000Z",
      schemaVersion: 2,
    });
    assert.deepEqual(await profileRow(admin, "a"), {revision: 6, stoneCoins: 47});
    assert.equal(await mutationReceiptExists(admin, "real_mail_claim_full"), true);
    assert.equal(await globalRevision(admin), 3);
    await closeStores(stores);

    const duplicateEnvelopeStore = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(duplicateEnvelopeStore);
    const duplicateEnvelopeBefore = duplicateEnvelopeStore.load();
    await adminQuery(
      admin,
      "INSERT INTO consumed_equipment_envelopes (envelope_id) VALUES (?)",
      [DUPLICATE_ENVELOPE_ID],
      "MySQL duplicate consumed envelope seed",
    );
    const duplicateEnvelopeClaim = saveMailClaim(
      duplicateEnvelopeStore,
      duplicateEnvelopeBefore,
      "b",
      MAIL_CLAIM_IDS.duplicateEnvelope,
      {
        remainingMail: null,
        claimedEnvelopeIds: [DUPLICATE_ENVELOPE_ID],
        operationId: "real_mail_claim_duplicate_envelope",
        requestHash: "c".repeat(64),
        updatedAt: "2026-07-14T04:12:00.000Z",
      },
    );
    trackWrite(duplicateEnvelopeClaim.promise);
    await assert.rejects(
      settleWithin(
        duplicateEnvelopeClaim.promise,
        WAIT_TIMEOUT_MS,
        "邮件重复装备墓碑整单回滚",
      ),
      (error) => isConflict(error, "mysql_resource_revision_conflict"),
    );
    assert.deepEqual(await profileRow(admin, "b"), {revision: 4, stoneCoins: 140});
    assert.equal(await marketSaleMailExists(admin, MAIL_CLAIM_IDS.duplicateEnvelope), true);
    assert.equal(await consumedEnvelopeExists(admin, DUPLICATE_ENVELOPE_ID), true);
    assert.equal(await mutationReceiptExists(admin, "real_mail_claim_duplicate_envelope"), false);
    assert.equal(await globalRevision(admin), 3);
    await closeStores(stores);

    const buyFirstClaimGate = commitGate("seller_claim_after_market_buy");
    gates.push(buyFirstClaimGate);
    const sellerBuyFirstStore = createMysqlAuthStore(storeOptions(runtime, database, buyFirstClaimGate));
    const claimAfterBuyStore = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(sellerBuyFirstStore, claimAfterBuyStore);
    const buyFirstBefore = sellerBuyFirstStore.load();
    const claimAfterBuyBefore = claimAfterBuyStore.load();
    const buyFirstBuyerBefore = await profileAssetRow(admin, "a");
    const buyFirstSellerBefore = await profileRow(admin, "m");
    const buyFirstTaxBefore = await marketTaxCollected(admin);
    const buyFirst = saveMarketBuy(
      sellerBuyFirstStore,
      buyFirstBefore,
      "a",
      MARKET_LISTING_IDS.sellerClaimBuyFirst,
      {
        saleMailId: "mail_real_seller_claim_buy_first_sale",
        operationId: "real_seller_claim_buy_first_buy",
        requestHash: "d".repeat(64),
        updatedAt: "2026-07-14T04:14:00.000Z",
      },
    );
    trackWrite(buyFirst.promise);
    await settleWithin(buyFirstClaimGate.entered, WAIT_TIMEOUT_MS, "购买先行 COMMIT gate");
    const claimAfterBuy = saveMailClaim(
      claimAfterBuyStore,
      claimAfterBuyBefore,
      "m",
      MAIL_CLAIM_IDS.sellerClaimBuyFirst,
      {
        remainingMail: null,
        claimedEnvelopeIds: [],
        stoneCoinsAdded: 5,
        operationId: "real_seller_claim_buy_first_claim",
        requestHash: "e".repeat(64),
        updatedAt: "2026-07-14T04:15:00.000Z",
      },
    );
    trackWrite(claimAfterBuy.promise);
    await waitForLockWait(admin, "购买先行时卖家领取等待 SHARE/X 闸门");
    buyFirstClaimGate.release();
    const buyFirstClaimResults = await settleWithin(
      Promise.allSettled([buyFirst.promise, claimAfterBuy.promise]),
      WAIT_TIMEOUT_MS,
      "购买先行与卖家领取并发结算",
    );
    for (const result of buyFirstClaimResults) {
      if (result.status === "rejected") {
        throw result.reason;
      }
    }
    assert.deepEqual(await profileAssetRow(admin, "a"), {
      revision: buyFirstBuyerBefore.revision + 1,
      stoneCoins: buyFirstBuyerBefore.stoneCoins - 20,
      itemCount: buyFirstBuyerBefore.itemCount + 1,
    });
    assert.deepEqual(await profileRow(admin, "m"), {
      revision: buyFirstSellerBefore.revision + 1,
      stoneCoins: buyFirstSellerBefore.stoneCoins + 5,
    });
    assert.equal(await marketListingExists(admin, MARKET_LISTING_IDS.sellerClaimBuyFirst), false);
    assert.equal(await marketSaleMailExists(admin, MAIL_CLAIM_IDS.sellerClaimBuyFirst), true);
    assert.equal(
      (await mailDocument(admin, MAIL_CLAIM_IDS.sellerClaimBuyFirst)).settledAt,
      "2026-07-14T04:15:00.000Z",
    );
    assert.equal(await marketSaleMailExists(admin, "mail_real_seller_claim_buy_first_sale"), true);
    assert.deepEqual(
      (await mailDocument(admin, "mail_real_seller_claim_buy_first_sale")).currency,
      {stoneCoins: 19},
    );
    assert.equal(await marketTaxCollected(admin), buyFirstTaxBefore + 1);
    assert.equal(await mutationReceiptExists(admin, "real_seller_claim_buy_first_buy"), true);
    assert.equal(await mutationReceiptExists(admin, "real_seller_claim_buy_first_claim"), true);
    await closeStores(stores);

    const claimFirstSeller = actorForKey("m");
    const claimFirstSaleMailId = "mail_real_seller_claim_claim_first_sale";
    const claimFirstInterleave = reciprocalBuyLockInterleaveGate({
      canonicalFirstAccountId: claimFirstSeller.accountId,
      winnerTrace: [
        {resource: "profile_binding", key: claimFirstSeller.accountId, mode: "exclusive"},
        {resource: "profile", key: claimFirstSeller.playerId, mode: "exclusive"},
      ],
      contenderTrace: canonicalMarketBuyLockTrace(
        "b",
        "m",
        MARKET_LISTING_IDS.sellerClaimClaimFirst,
      ),
    });
    gates.push(claimFirstInterleave);
    const claimFirstStore = createMysqlAuthStore(storeOptions(
      runtime,
      database,
      claimFirstInterleave.gateFor("winner"),
    ));
    const buyAfterClaimStore = createMysqlAuthStore(storeOptions(
      runtime,
      database,
      claimFirstInterleave.gateFor("contender"),
    ));
    stores.push(claimFirstStore, buyAfterClaimStore);
    const claimFirstBefore = claimFirstStore.load();
    const buyAfterClaimBefore = buyAfterClaimStore.load();
    const claimFirstBuyerBefore = await profileAssetRow(admin, "b");
    const claimFirstSellerBefore = await profileRow(admin, "m");
    const claimFirstTaxBefore = await marketTaxCollected(admin);
    const claimFirst = saveMailClaim(
      claimFirstStore,
      claimFirstBefore,
      "m",
      MAIL_CLAIM_IDS.sellerClaimClaimFirst,
      {
        remainingMail: null,
        claimedEnvelopeIds: [],
        stoneCoinsAdded: 6,
        operationId: "real_seller_claim_claim_first_claim",
        requestHash: "f".repeat(64),
        updatedAt: "2026-07-14T04:16:00.000Z",
      },
    );
    trackWrite(claimFirst.promise);
    await settleWithin(
      claimFirstInterleave.waitForWinnerFirstAcquired(),
      WAIT_TIMEOUT_MS,
      "领取先行取得卖家 exclusive binding 行锁",
    );
    const staleBuyAfterClaim = saveMarketBuy(
      buyAfterClaimStore,
      buyAfterClaimBefore,
      "b",
      MARKET_LISTING_IDS.sellerClaimClaimFirst,
      {
        saleMailId: claimFirstSaleMailId,
        operationId: "real_seller_claim_claim_first_buy",
        requestHash: "0".repeat(64),
        updatedAt: "2026-07-14T04:17:00.000Z",
      },
    );
    trackWrite(staleBuyAfterClaim.promise);
    await settleWithin(
      claimFirstInterleave.waitForContenderFirstAttempted(),
      WAIT_TIMEOUT_MS,
      "陈旧购买以 shared 模式请求同一卖家 binding 行锁",
    );
    await waitForLockWait(admin, "领取先行时陈旧购买等待 SHARE/X 闸门");
    claimFirstInterleave.markLockWaitObserved();
    claimFirstInterleave.release();
    await settleWithin(claimFirst.promise, WAIT_TIMEOUT_MS, "领取先行提交");
    await assert.rejects(
      settleWithin(staleBuyAfterClaim.promise, WAIT_TIMEOUT_MS, "领取后陈旧购买失败关闭"),
      (error) => isConflict(error, "mysql_resource_revision_conflict"),
    );
    assert.deepEqual(await profileAssetRow(admin, "b"), claimFirstBuyerBefore);
    assert.deepEqual(await profileRow(admin, "m"), {
      revision: claimFirstSellerBefore.revision + 1,
      stoneCoins: claimFirstSellerBefore.stoneCoins + 6,
    });
    assert.equal(await marketListingExists(admin, MARKET_LISTING_IDS.sellerClaimClaimFirst), true);
    assert.equal(await marketSaleMailExists(admin, MAIL_CLAIM_IDS.sellerClaimClaimFirst), true);
    assert.equal(
      (await mailDocument(admin, MAIL_CLAIM_IDS.sellerClaimClaimFirst)).settledAt,
      "2026-07-14T04:16:00.000Z",
    );
    assert.equal(await marketSaleMailExists(admin, claimFirstSaleMailId), false);
    assert.equal(await marketTaxCollected(admin), claimFirstTaxBefore);
    assert.equal(await mutationReceiptExists(admin, "real_seller_claim_claim_first_claim"), true);
    assert.equal(await mutationReceiptExists(admin, "real_seller_claim_claim_first_buy"), false);
    claimFirstInterleave.assertVerified();
    await closeStores(stores);

    const buyAfterClaimRetryStore = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(buyAfterClaimRetryStore);
    const buyAfterClaimReloaded = buyAfterClaimRetryStore.load();
    const buyAfterClaimRetry = saveMarketBuy(
      buyAfterClaimRetryStore,
      buyAfterClaimReloaded,
      "b",
      MARKET_LISTING_IDS.sellerClaimClaimFirst,
      {
        saleMailId: claimFirstSaleMailId,
        operationId: "real_seller_claim_claim_first_buy",
        requestHash: "0".repeat(64),
        updatedAt: "2026-07-14T04:18:00.000Z",
      },
    );
    trackWrite(buyAfterClaimRetry.promise);
    await settleWithin(buyAfterClaimRetry.promise, WAIT_TIMEOUT_MS, "领取后同 operation 购买重试");
    assert.deepEqual(await profileAssetRow(admin, "b"), {
      revision: claimFirstBuyerBefore.revision + 1,
      stoneCoins: claimFirstBuyerBefore.stoneCoins - 20,
      itemCount: claimFirstBuyerBefore.itemCount + 1,
    });
    assert.equal(await marketListingExists(admin, MARKET_LISTING_IDS.sellerClaimClaimFirst), false);
    assert.equal(await marketSaleMailExists(admin, claimFirstSaleMailId), true);
    assert.deepEqual(
      (await mailDocument(admin, claimFirstSaleMailId)).currency,
      {stoneCoins: 19},
    );
    assert.equal(await marketTaxCollected(admin), claimFirstTaxBefore + 1);
    assert.equal(await mutationReceiptExists(admin, "real_seller_claim_claim_first_buy"), true);
    await closeStores(stores);

    const collisionGate = commitGate("same_sale_mail_id_duplicate");
    gates.push(collisionGate);
    const collisionStoreA = createMysqlAuthStore(storeOptions(runtime, database, collisionGate));
    const collisionStoreB = createMysqlAuthStore(storeOptions(runtime, database));
    const legacyMailCollisionStore = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(collisionStoreA, collisionStoreB, legacyMailCollisionStore);
    const collisionBeforeA = collisionStoreA.load();
    const collisionBeforeB = collisionStoreB.load();
    const legacyMailCollisionBefore = legacyMailCollisionStore.load();
    const collisionBuyerBeforeA = await profileAssetRow(admin, "a");
    const collisionBuyerBeforeB = await profileAssetRow(admin, "b");
    const collisionTaxBefore = await marketTaxCollected(admin);
    const collisionBuyA = saveMarketBuy(
      collisionStoreA,
      collisionBeforeA,
      "a",
      MARKET_LISTING_IDS.saleMailCollisionA,
      {
        saleMailId: SALE_MAIL_COLLISION_ID,
        operationId: "real_sale_mail_collision_a_buy",
        requestHash: "1".repeat(64),
        updatedAt: "2026-07-14T04:19:00.000Z",
      },
    );
    trackWrite(collisionBuyA.promise);
    await settleWithin(collisionGate.entered, WAIT_TIMEOUT_MS, "同成交邮件 ID 赢家 COMMIT gate");
    const collisionBuyB = saveMarketBuy(
      collisionStoreB,
      collisionBeforeB,
      "b",
      MARKET_LISTING_IDS.saleMailCollisionB,
      {
        saleMailId: SALE_MAIL_COLLISION_ID,
        operationId: "real_sale_mail_collision_b_buy",
        requestHash: "2".repeat(64),
        updatedAt: "2026-07-14T04:19:00.000Z",
      },
    );
    trackWrite(collisionBuyB.promise);
    await waitForLockWait(admin, "同成交邮件 ID 唯一键等待");
    collisionGate.release();
    await settleWithin(collisionBuyA.promise, WAIT_TIMEOUT_MS, "同成交邮件 ID 赢家提交");
    await assert.rejects(
      settleWithin(collisionBuyB.promise, WAIT_TIMEOUT_MS, "同成交邮件 ID 输家整单回滚"),
      (error) => isConflict(error, "mysql_resource_revision_conflict"),
    );
    assert.deepEqual(await profileAssetRow(admin, "a"), {
      revision: collisionBuyerBeforeA.revision + 1,
      stoneCoins: collisionBuyerBeforeA.stoneCoins - 20,
      itemCount: collisionBuyerBeforeA.itemCount + 1,
    });
    assert.deepEqual(await profileAssetRow(admin, "b"), collisionBuyerBeforeB);
    assert.equal(await marketListingExists(admin, MARKET_LISTING_IDS.saleMailCollisionA), false);
    assert.equal(await marketListingExists(admin, MARKET_LISTING_IDS.saleMailCollisionB), true);
    assert.equal(await marketSaleMailExists(admin, SALE_MAIL_COLLISION_ID), true);
    assert.deepEqual((await mailDocument(admin, SALE_MAIL_COLLISION_ID)).currency, {stoneCoins: 19});
    assert.equal(await marketTaxCollected(admin), collisionTaxBefore + 1);
    assert.equal(await mutationReceiptExists(admin, "real_sale_mail_collision_a_buy"), true);
    assert.equal(await mutationReceiptExists(admin, "real_sale_mail_collision_b_buy"), false);

    const legacyMarketView = await settleWithin(
      legacyMailCollisionStore.readSharedAssetView({
        schemaVersion: 1,
        scope: "market_read",
        accountId: ACTORS.a.accountId,
        includeProfileMailPartitions: false,
      }, {adopt: true}),
      WAIT_TIMEOUT_MS,
      "legacy 旧 Node 只采纳市场与 profile、不采纳成交邮件",
    );
    assert.equal(legacyMarketView.mailPartitions.length, 0);
    const legacyMailCollisionAdopted = applySharedAssetReadView(
      legacyMailCollisionBefore,
      legacyMarketView,
    );
    assert.equal(
      Object.hasOwn(legacyMailCollisionAdopted.mailMessages, SALE_MAIL_COLLISION_ID),
      false,
    );
    const remoteSaleMailBeforeLegacyCollision = await mailDocument(admin, SALE_MAIL_COLLISION_ID);
    const legacyProfileBefore = await profileAssetRow(admin, "a");
    const legacyGlobalRevisionBefore = await globalRevision(admin);
    const legacyMailCollision = saveLegacyAttachmentMail(
      legacyMailCollisionStore,
      legacyMailCollisionAdopted,
      "a",
      SALE_MAIL_COLLISION_ID,
      {
        recipientKey: "b",
        operationId: LEGACY_MAIL_COLLISION_OPERATION_ID,
        requestHash: "5".repeat(64),
        updatedAt: "2026-07-14T04:19:30.000Z",
      },
    );
    trackWrite(legacyMailCollision.promise);
    await assert.rejects(
      settleWithin(
        legacyMailCollision.promise,
        WAIT_TIMEOUT_MS,
        "legacy 新邮件与不可见成交邮件 ID 碰撞整单回滚",
      ),
      isKnownDuplicateRollback,
    );
    assert.deepEqual(await profileAssetRow(admin, "a"), legacyProfileBefore);
    assert.deepEqual(await mailDocument(admin, SALE_MAIL_COLLISION_ID), remoteSaleMailBeforeLegacyCollision);
    assert.equal(await mutationReceiptExists(admin, LEGACY_MAIL_COLLISION_OPERATION_ID), false);
    assert.equal(await globalRevision(admin), legacyGlobalRevisionBefore);

    const legacyMailRetry = saveLegacyAttachmentMail(
      legacyMailCollisionStore,
      legacyMailCollisionAdopted,
      "a",
      LEGACY_MAIL_COLLISION_RETRY_ID,
      {
        recipientKey: "b",
        operationId: LEGACY_MAIL_COLLISION_OPERATION_ID,
        requestHash: "5".repeat(64),
        updatedAt: "2026-07-14T04:19:40.000Z",
      },
    );
    trackWrite(legacyMailRetry.promise);
    await settleWithin(
      legacyMailRetry.promise,
      WAIT_TIMEOUT_MS,
      "legacy 邮件碰撞后同 operation 新内部 ID 重试",
    );
    assert.deepEqual(await profileAssetRow(admin, "a"), {
      revision: legacyProfileBefore.revision + 1,
      stoneCoins: legacyProfileBefore.stoneCoins,
      itemCount: legacyProfileBefore.itemCount - 1,
    });
    assert.deepEqual(await mailDocument(admin, SALE_MAIL_COLLISION_ID), remoteSaleMailBeforeLegacyCollision);
    assert.deepEqual(
      (await mailDocument(admin, LEGACY_MAIL_COLLISION_RETRY_ID)).items,
      [{itemId: "item_meat_small", count: 1}],
    );
    assert.equal(await mutationReceiptExists(admin, LEGACY_MAIL_COLLISION_OPERATION_ID), true);
    assert.equal(await globalRevision(admin), legacyGlobalRevisionBefore + 1);

    const collisionRetryBefore = collisionStoreB.load();
    const collisionRetry = saveMarketBuy(
      collisionStoreB,
      collisionRetryBefore,
      "b",
      MARKET_LISTING_IDS.saleMailCollisionB,
      {
        saleMailId: SALE_MAIL_COLLISION_RETRY_ID,
        operationId: "real_sale_mail_collision_b_buy",
        requestHash: "2".repeat(64),
        updatedAt: "2026-07-14T04:20:00.000Z",
      },
    );
    trackWrite(collisionRetry.promise);
    await settleWithin(collisionRetry.promise, WAIT_TIMEOUT_MS, "同 operation 新邮件 ID 重试");
    assert.deepEqual(await profileAssetRow(admin, "b"), {
      revision: collisionBuyerBeforeB.revision + 1,
      stoneCoins: collisionBuyerBeforeB.stoneCoins - 40,
      itemCount: collisionBuyerBeforeB.itemCount + 2,
    });
    assert.equal(await marketListingExists(admin, MARKET_LISTING_IDS.saleMailCollisionB), false);
    assert.equal(await marketSaleMailExists(admin, SALE_MAIL_COLLISION_RETRY_ID), true);
    assert.deepEqual(
      (await mailDocument(admin, SALE_MAIL_COLLISION_RETRY_ID)).currency,
      {stoneCoins: 38},
    );
    assert.equal(await marketTaxCollected(admin), collisionTaxBefore + 3);
    assert.equal(await mutationReceiptExists(admin, "real_sale_mail_collision_b_buy"), true);
    await closeStores(stores);

    const timeoutCollisionGate = commitGate("same_sale_mail_id_timeout");
    gates.push(timeoutCollisionGate);
    const timeoutStoreA = createMysqlAuthStore(storeOptions(runtime, database, timeoutCollisionGate));
    const timeoutStoreB = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(timeoutStoreA, timeoutStoreB);
    const timeoutBeforeA = timeoutStoreA.load();
    const timeoutBeforeB = timeoutStoreB.load();
    const timeoutBuyerBeforeA = await profileAssetRow(admin, "a");
    const timeoutBuyerBeforeB = await profileAssetRow(admin, "b");
    const timeoutTaxBefore = await marketTaxCollected(admin);
    const timeoutBuyA = saveMarketBuy(
      timeoutStoreA,
      timeoutBeforeA,
      "a",
      MARKET_LISTING_IDS.saleMailTimeoutA,
      {
        saleMailId: SALE_MAIL_TIMEOUT_ID,
        operationId: "real_sale_mail_timeout_a_buy",
        requestHash: "3".repeat(64),
        updatedAt: "2026-07-14T04:21:00.000Z",
      },
    );
    trackWrite(timeoutBuyA.promise);
    await settleWithin(timeoutCollisionGate.entered, WAIT_TIMEOUT_MS, "成交邮件锁超时赢家 COMMIT gate");
    const timeoutBuyB = saveMarketBuy(
      timeoutStoreB,
      timeoutBeforeB,
      "b",
      MARKET_LISTING_IDS.saleMailTimeoutB,
      {
        saleMailId: SALE_MAIL_TIMEOUT_ID,
        operationId: "real_sale_mail_timeout_b_buy",
        requestHash: "4".repeat(64),
        updatedAt: "2026-07-14T04:21:00.000Z",
      },
    );
    trackWrite(timeoutBuyB.promise);
    await waitForLockWait(admin, "成交邮件唯一键 Session lock timeout 等待");
    await assert.rejects(
      settleWithin(timeoutBuyB.promise, WAIT_TIMEOUT_MS, "成交邮件唯一键 Session lock timeout"),
      isKnownLockWaitRollback,
    );
    assert.deepEqual(await profileAssetRow(admin, "b"), timeoutBuyerBeforeB);
    assert.equal(await marketListingExists(admin, MARKET_LISTING_IDS.saleMailTimeoutB), true);
    assert.equal(await marketSaleMailExists(admin, SALE_MAIL_TIMEOUT_ID), false);
    assert.equal(await mutationReceiptExists(admin, "real_sale_mail_timeout_b_buy"), false);
    assert.equal(await marketTaxCollected(admin), timeoutTaxBefore);
    timeoutCollisionGate.release();
    await settleWithin(timeoutBuyA.promise, WAIT_TIMEOUT_MS, "成交邮件锁超时赢家提交");
    assert.deepEqual(await profileAssetRow(admin, "a"), {
      revision: timeoutBuyerBeforeA.revision + 1,
      stoneCoins: timeoutBuyerBeforeA.stoneCoins - 20,
      itemCount: timeoutBuyerBeforeA.itemCount + 1,
    });
    assert.equal(await marketListingExists(admin, MARKET_LISTING_IDS.saleMailTimeoutA), false);
    assert.equal(await marketSaleMailExists(admin, SALE_MAIL_TIMEOUT_ID), true);
    assert.deepEqual((await mailDocument(admin, SALE_MAIL_TIMEOUT_ID)).currency, {stoneCoins: 19});
    assert.equal(await marketTaxCollected(admin), timeoutTaxBefore + 1);
    assert.equal(await mutationReceiptExists(admin, "real_sale_mail_timeout_a_buy"), true);

    const timeoutRetryBefore = timeoutStoreB.load();
    const timeoutRetry = saveMarketBuy(
      timeoutStoreB,
      timeoutRetryBefore,
      "b",
      MARKET_LISTING_IDS.saleMailTimeoutB,
      {
        saleMailId: SALE_MAIL_TIMEOUT_RETRY_ID,
        operationId: "real_sale_mail_timeout_b_buy",
        requestHash: "4".repeat(64),
        updatedAt: "2026-07-14T04:22:00.000Z",
      },
    );
    trackWrite(timeoutRetry.promise);
    await settleWithin(timeoutRetry.promise, WAIT_TIMEOUT_MS, "锁超时后同 operation 重试");
    assert.deepEqual(await profileAssetRow(admin, "b"), {
      revision: timeoutBuyerBeforeB.revision + 1,
      stoneCoins: timeoutBuyerBeforeB.stoneCoins - 40,
      itemCount: timeoutBuyerBeforeB.itemCount + 2,
    });
    assert.equal(await marketListingExists(admin, MARKET_LISTING_IDS.saleMailTimeoutB), false);
    assert.equal(await marketSaleMailExists(admin, SALE_MAIL_TIMEOUT_RETRY_ID), true);
    assert.deepEqual(
      (await mailDocument(admin, SALE_MAIL_TIMEOUT_RETRY_ID)).currency,
      {stoneCoins: 38},
    );
    assert.equal(await marketTaxCollected(admin), timeoutTaxBefore + 3);
    assert.equal(await mutationReceiptExists(admin, "real_sale_mail_timeout_b_buy"), true);
    await closeStores(stores);

    const sharedReadStore = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(sharedReadStore);
    sharedReadStore.load();
    const marketReadView = await settleWithin(sharedReadStore.readSharedAssetView({
      schemaVersion: 1,
      scope: "market_read",
      accountId: ACTORS.a.accountId,
      includeProfileMailPartitions: false,
    }), WAIT_TIMEOUT_MS, "真实 MySQL 市场 RR 读穿");
    assert.equal(
      Object.hasOwn(marketReadView.marketListings, MARKET_LISTING_IDS.rollback),
      true,
    );
    assert.equal(marketReadView.accounts.values[ACTORS.m.accountId].username, "real_mysql_m");

    const mailReadView = await settleWithin(sharedReadStore.readSharedAssetView({
      schemaVersion: 1,
      scope: "mail_mutation",
      accountId: ACTORS.b.accountId,
      mailId: MAIL_CLAIM_IDS.duplicateEnvelope,
      includeProfileMailPartitions: true,
    }, {adopt: true}), WAIT_TIMEOUT_MS, "真实 MySQL 邮箱 RR 读穿与墓碑采纳");
    assert.equal(
      Object.hasOwn(
        mailReadView.mailPartitions[0].messages,
        MAIL_CLAIM_IDS.duplicateEnvelope,
      ),
      true,
    );
    assert.deepEqual(mailReadView.consumedEquipmentEnvelopeIds, [DUPLICATE_ENVELOPE_ID]);

    const exactReceiptView = await settleWithin(
      sharedReadStore.readDurableMutationReceipt("real_market_buy_parallel_a"),
      WAIT_TIMEOUT_MS,
      "真实 MySQL 同基线精确回执读取",
    );
    assert.equal(exactReceiptView.operationId, "real_market_buy_parallel_a");
    assert.equal(exactReceiptView.receipt.requestHash, "4".repeat(64));
    assert.equal(exactReceiptView.receipt.actionId, "POST /market/buy");
    assert.equal(exactReceiptView.receipt.accountId, ACTORS.a.accountId);
    assert.equal(exactReceiptView.authorityCurrent, true);
    const missingReceiptView = await settleWithin(
      sharedReadStore.readDurableMutationReceipt("real_receipt_missing_probe_0001"),
      WAIT_TIMEOUT_MS,
      "真实 MySQL 缺失回执读取",
    );
    assert.equal(missingReceiptView.receipt, null);
    assert.equal(missingReceiptView.authorityCurrent, true);

    await adminQuery(
      admin,
      "UPDATE auth_store_revisions SET revision = revision + 1 WHERE scope_key = 'auth'",
      [],
      "MySQL shared read revision drift seed",
    );
    await assert.rejects(
      settleWithin(sharedReadStore.readSharedAssetView({
        schemaVersion: 1,
        scope: "market_read",
        accountId: ACTORS.a.accountId,
        includeProfileMailPartitions: false,
      }), WAIT_TIMEOUT_MS, "旧 Node revision 越界拒绝"),
      (error) => error
        && error.code === "mysql_shared_asset_full_reload_required"
        && error.expectedRevision === 4
        && error.actualRevision === 5,
    );
    sharedReadStore.load();
    const refreshedMarketRead = await settleWithin(sharedReadStore.readSharedAssetView({
      schemaVersion: 1,
      scope: "market_read",
      accountId: ACTORS.a.accountId,
      includeProfileMailPartitions: false,
    }), WAIT_TIMEOUT_MS, "完整 reload 后市场读穿重试");
    assert.equal(
      Object.hasOwn(refreshedMarketRead.marketListings, MARKET_LISTING_IDS.rollback),
      true,
    );
    assert.equal(await globalRevision(admin), 5);
    await closeStores(stores);

    await adminQuery(
      admin,
      "DELETE FROM server_state WHERE state_key = 'auth'",
      [],
      "MySQL missing server-state recovery seed",
    );
    assert.equal(await serverStateRowCount(admin), 0);
    const missingStateStore = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(missingStateStore);
    const missingStateBefore = missingStateStore.load();
    await settleWithin(missingStateStore.readSharedAssetView({
      schemaVersion: 1,
      scope: "mail_read",
      accountId: ACTORS.a.accountId,
      includeProfileMailPartitions: true,
    }, {adopt: true}), WAIT_TIMEOUT_MS, "缺失 server-state 后的邮箱读穿采纳");
    const recoveredStateWrite = trackWrite(missingStateStore.saveAsync(
      nextAuthEventAuthority(missingStateBefore),
    ));
    await settleWithin(recoveredStateWrite, WAIT_TIMEOUT_MS, "读穿后的 server-state 初始化提交");
    assert.equal(await serverStateRowCount(admin), 1);
    assert.equal(await globalRevision(admin), 6);
    await closeStores(stores);

    await waitUntil(async () => await activeTransactionCount(admin) === 0, WAIT_TIMEOUT_MS, "InnoDB 事务清理");
    const deadlocksAfter = await deadlockCount(admin);
    assert.equal(deadlocksAfter, deadlocksBefore);
    assert.equal(await lockWaitCount(admin), 0);

    const [receiptRows] = await adminQuery(
      admin,
      "SELECT operation_id FROM mutation_receipts ORDER BY operation_id",
      [],
      "MySQL receipt query",
    );
    const receiptIds = receiptRows.map((row) => String(row.operation_id));
    assert.deepEqual(receiptIds, [
      "real_cross_buy_first_cancel_buy",
      "real_cross_cancel_first_buy_cancel",
      "real_cross_reciprocal_a_buy",
      "real_cross_reciprocal_b_retry",
      "real_legacy_mail_collision_send",
      "real_mail_claim_full",
      "real_mail_claim_partial",
      "real_market_buy_parallel_a",
      "real_market_buy_parallel_b",
      "real_market_buy_race_winner",
      "real_market_cancel_001",
      "real_parallel_a_001",
      "real_parallel_b_001",
      "real_profile_before_legacy",
      "real_sale_mail_collision_a_buy",
      "real_sale_mail_collision_b_buy",
      "real_sale_mail_timeout_a_buy",
      "real_sale_mail_timeout_b_buy",
      "real_same_profile_a_001",
      "real_seller_claim_buy_first_buy",
      "real_seller_claim_buy_first_claim",
      "real_seller_claim_claim_first_buy",
      "real_seller_claim_claim_first_claim",
    ]);
    return {
      qualified: true,
      realMysql: true,
      serverVersion: String(serverIdentity.version),
      transactionIsolation: String(serverIdentity.isolation_level),
      disposableInstance: true,
      nonPlayerSchema: true,
      portIsNot3306: runtime.port !== 3306,
      externalMysqlCredentialsIgnored: true,
      bufferPoolMiB: MYSQL_MEMORY_BYTES / 1024 / 1024,
      differentProfilesCapacityTailWaitObserved: true,
      differentProfilesBothCommittedAfterCapacityTailRelease: true,
      sameProfileLockWaitObserved: true,
      sameProfileExactlyOneWinner: true,
      profileFirstLegacyRejected: true,
      legacyFirstProfileRejected: true,
      marketCancelJsonLockAndDeleteVerified: true,
      marketCancelDuplicateReceiptRolledBack: true,
      parallelMarketBuysTaxTailLockWaitObserved: true,
      parallelMarketBuysTaxSumVerified: true,
      sameListingBuyExactlyOneWinner: true,
      staleLegacyServerStateOverwriteRejected: true,
      marketBuyDuplicateReceiptRolledBack: true,
      buyFirstBeatsSellerCancel: true,
      cancelFirstBeatsStaleBuy: true,
      reciprocalBuyInitialExactlyOneWinner: true,
      reciprocalBuyCanonicalFirstLockWaitObserved: true,
      reciprocalBuyOppositeRoleInterleaveVerified: true,
      reciprocalBuyWinnerFullCanonicalLockOrderObserved: true,
      reciprocalBuyContenderCanonicalFirstLockObserved: true,
      reciprocalBuyLoserReloadSucceeded: true,
      crossAccountAssetConservationVerified: true,
      crossAccountAssetConservationUsesFinalMysqlMailReload: true,
      mailPartialUpdateVerified: true,
      mailFullSettledUpdateVerified: true,
      mailDuplicateEnvelopeRolledBack: true,
      sellerClaimPurchaseFirstVerified: true,
      sellerClaimClaimFirstRetryVerified: true,
      saleMailDuplicateRollbackVerified: true,
      saleMailLockTimeoutRollbackVerified: true,
      saleMailCollisionSameOperationRetryVerified: true,
      legacyPartialAdoptMailDuplicateRollbackVerified: true,
      legacyMailCollisionSameOperationRetryVerified: true,
      sharedMarketReadThroughVerified: true,
      sharedMailReadThroughVerified: true,
      sharedTombstoneDeltaVerified: true,
      exactDurableReceiptReadVerified: true,
      missingDurableReceiptReadVerified: true,
      crossNodeStaleReceiptBaselineVerified: true,
      crossNodeReceiptReplayCacheVerified: true,
      scopedReadRevisionReloadVerified: true,
      scopedReadPreservesServerStateInitialization: true,
      globalRevision: await globalRevision(admin),
      receiptCount: receiptIds.length,
      receiptIds,
      deadlockDelta: deadlocksAfter - deadlocksBefore,
      activeTransactions: await activeTransactionCount(admin),
      activeLockWaits: await lockWaitCount(admin),
    };
  } finally {
    for (const gate of gates) {
      gate.release();
    }
    try {
      await settleWithin(Promise.allSettled(pendingWrites), WAIT_TIMEOUT_MS, "待处理 MySQL 写入清理");
    } catch {
      // The isolated mysqld teardown remains the final bounded cleanup guard.
    }
    await closeStores(stores, {bestEffort: true});
    if (admin) {
      try {
        await settleWithin(admin.end(), WAIT_TIMEOUT_MS, "MySQL admin pool 关闭");
      } catch {
        // The isolated mysqld teardown remains the final bounded cleanup guard.
      }
    }
  }
}

async function runMarketCreateMysqlGate(runtime) {
  const database = `beastbound_p0_6d2c6_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const stores = [];
  const gates = [];
  const pendingWrites = [];
  let admin = null;
  function trackWrite(promise) {
    pendingWrites.push(promise);
    void promise.catch(() => {});
    return promise;
  }
  try {
    const bootstrap = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(bootstrap);
    const empty = bootstrap.load();
    await settleWithin(
      trackWrite(bootstrap.saveAsync(marketCreateSeededAuthority(empty, 118))),
      WAIT_TIMEOUT_MS,
      "market create bootstrap seed save",
    );
    await closeStores(stores);

    admin = mysql.createPool({...runtime.connectionOptions, database, connectionLimit: 2});
    const deadlocksBefore = await deadlockCount(admin);
    assert.equal(await globalRevision(admin), 1);
    assert.equal(await marketCreateCapacityGuardRevision(admin), 0);
    assert.equal(await marketListingCount(admin), 118);
    assert.deepEqual(await profileAssetRow(admin, "a"), {revision: 1, stoneCoins: 100, itemCount: 2});
    assert.deepEqual(await profileAssetRow(admin, "b"), {revision: 1, stoneCoins: 200, itemCount: 2});

    const capacity118Gate = commitGate("market_create_capacity_118_a");
    gates.push(capacity118Gate);
    const capacity118A = createMysqlAuthStore(storeOptions(runtime, database, capacity118Gate));
    const capacity118B = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(capacity118A, capacity118B);
    const loaded118A = capacity118A.load();
    const loaded118B = capacity118B.load();
    const create118A = saveMarketCreate(capacity118A, loaded118A, "a", {
      listingId: "listing_real_market_create_118_a",
      operationId: "real_market_create_118_a",
      requestHash: "8".repeat(64),
      unitPrice: 41,
      updatedAt: "2026-07-14T04:30:00.000Z",
    });
    trackWrite(create118A.promise);
    await settleWithin(capacity118Gate.entered, WAIT_TIMEOUT_MS, "118 market create A COMMIT gate");
    const create118B = saveMarketCreate(capacity118B, loaded118B, "b", {
      listingId: "listing_real_market_create_118_b",
      operationId: "real_market_create_118_b",
      requestHash: "9".repeat(64),
      unitPrice: 42,
      updatedAt: "2026-07-14T04:30:00.000Z",
    });
    trackWrite(create118B.promise);
    await waitForLockWait(admin, "118 market create capacity guard wait");
    capacity118Gate.release();
    const results118 = await settleWithin(
      Promise.allSettled([create118A.promise, create118B.promise]),
      WAIT_TIMEOUT_MS,
      "118 market create competing commits",
    );
    assert.deepEqual(results118.map((result) => result.status), ["fulfilled", "fulfilled"]);
    assert.equal(await marketListingCount(admin), MARKET_MAX_LISTINGS);
    assert.equal(await marketSellerListingCount(admin, "a"), 1);
    assert.equal(await marketSellerListingCount(admin, "b"), 1);
    assert.deepEqual(await profileAssetRow(admin, "a"), {revision: 2, stoneCoins: 100, itemCount: 1});
    assert.deepEqual(await profileAssetRow(admin, "b"), {revision: 2, stoneCoins: 200, itemCount: 1});
    assert.equal(await mutationReceiptExists(admin, "real_market_create_118_a"), true);
    assert.equal(await mutationReceiptExists(admin, "real_market_create_118_b"), true);
    assert.equal(await globalRevision(admin), 1);
    assert.equal(await marketCreateCapacityGuardRevision(admin), 0);
    await closeStores(stores);

    const removedFillerId = realMarketCreateFillerListing(0).listingId;
    const [removedFiller] = await adminQuery(
      admin,
      "DELETE FROM market_listings WHERE listing_id = ?",
      [removedFillerId],
      "prepare 119 market create boundary",
    );
    assert.equal(Number(removedFiller.affectedRows), 1);
    assert.equal(await marketListingCount(admin), 119);

    const capacity119Gate = commitGate("market_create_capacity_119_a");
    gates.push(capacity119Gate);
    const capacity119A = createMysqlAuthStore(storeOptions(runtime, database, capacity119Gate));
    const capacity119B = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(capacity119A, capacity119B);
    const loaded119A = capacity119A.load();
    const loaded119B = capacity119B.load();
    const create119A = saveMarketCreate(capacity119A, loaded119A, "a", {
      listingId: "listing_real_market_create_119_a",
      operationId: "real_market_create_119_a",
      requestHash: "a".repeat(64),
      unitPrice: 43,
      updatedAt: "2026-07-14T04:31:00.000Z",
    });
    trackWrite(create119A.promise);
    await settleWithin(capacity119Gate.entered, WAIT_TIMEOUT_MS, "119 market create A COMMIT gate");
    const create119B = saveMarketCreate(capacity119B, loaded119B, "b", {
      listingId: "listing_real_market_create_119_b",
      operationId: "real_market_create_119_b",
      requestHash: "b".repeat(64),
      unitPrice: 44,
      updatedAt: "2026-07-14T04:31:00.000Z",
    });
    trackWrite(create119B.promise);
    await waitForLockWait(admin, "119 market create capacity guard wait");
    capacity119Gate.release();
    const results119 = await settleWithin(
      Promise.allSettled([create119A.promise, create119B.promise]),
      WAIT_TIMEOUT_MS,
      "119 market create competing commits",
    );
    assert.equal(results119[0].status, "fulfilled");
    assert.equal(results119[1].status, "rejected");
    assert.equal(results119[1].reason.code, "market_full");
    assert.equal(results119[1].reason.outcomeUnknown, false);
    assert.equal(results119[1].reason.rollbackConfirmed, true);
    assert.equal(await marketListingCount(admin), MARKET_MAX_LISTINGS);
    assert.equal(await marketSellerListingCount(admin, "a"), 2);
    assert.equal(await marketSellerListingCount(admin, "b"), 1);
    assert.equal(await marketListingExists(admin, "listing_real_market_create_119_a"), true);
    assert.equal(await marketListingExists(admin, "listing_real_market_create_119_b"), false);
    assert.deepEqual(await profileAssetRow(admin, "a"), {revision: 3, stoneCoins: 100, itemCount: 0});
    assert.deepEqual(await profileAssetRow(admin, "b"), {revision: 2, stoneCoins: 200, itemCount: 1});
    assert.equal(await mutationReceiptExists(admin, "real_market_create_119_a"), true);
    assert.equal(await mutationReceiptExists(admin, "real_market_create_119_b"), false);
    assert.equal(await globalRevision(admin), 1);
    assert.equal(await marketCreateCapacityGuardRevision(admin), 0);
    await closeStores(stores);

    const mixedRemovedFillerId = realMarketCreateFillerListing(1).listingId;
    const [mixedRemovedFiller] = await adminQuery(
      admin,
      "DELETE FROM market_listings WHERE listing_id = ?",
      [mixedRemovedFillerId],
      "prepare mixed conditional legacy 119 boundary",
    );
    assert.equal(Number(mixedRemovedFiller.affectedRows), 1);
    for (const actorKey of ["a", "b"]) {
      const actor = actorForKey(actorKey);
      const [assetReset] = await adminQuery(
        admin,
        "UPDATE profiles SET profile_json = JSON_SET(profile_json, '$.backpackSlots', CAST(? AS JSON)) WHERE player_id = ?",
        [JSON.stringify([{itemId: "item_meat_small", count: 2}]), actor.playerId],
        `prepare mixed ${actorKey} market asset`,
      );
      assert.equal(Number(assetReset.affectedRows), 1);
    }
    assert.equal(await marketListingCount(admin), 119);

    const mixedGate = commitGate("market_create_mixed_conditional_b");
    gates.push(mixedGate);
    const mixedConditionalStore = createMysqlAuthStore(storeOptions(runtime, database, mixedGate));
    stores.push(mixedConditionalStore);
    const mixedConditionalLoaded = mixedConditionalStore.load();
    const mixedConditionalOptions = {
      listingId: "listing_real_market_create_mixed_conditional_b",
      operationId: "real_market_create_mixed_conditional_b",
      requestHash: "c".repeat(64),
      unitPrice: 45,
      updatedAt: "2026-07-14T04:32:00.000Z",
    };
    const mixedConditionalMutation = marketCreateMutation(
      mixedConditionalLoaded,
      "b",
      mixedConditionalOptions,
    );

    const loaderDatabase = `beastbound_p0_6d2c6_loader_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
    const loaderBootstrap = createMysqlAuthStore(storeOptions(runtime, loaderDatabase));
    stores.push(loaderBootstrap);
    loaderBootstrap.load();
    const loaderAuthority = cloneAuthorityRoot(mixedConditionalLoaded);
    const conditionalActor = actorForKey("b");
    loaderAuthority.profileBindings[conditionalActor.accountId] =
      mixedConditionalMutation.after.profileBindings[conditionalActor.accountId];
    loaderAuthority.profiles[conditionalActor.playerId] =
      mixedConditionalMutation.after.profiles[conditionalActor.playerId];
    await settleWithin(
      trackWrite(loaderBootstrap.saveAsync(loaderAuthority)),
      WAIT_TIMEOUT_MS,
      "mixed legacy future-profile loader seed",
    );
    await closeStores(stores);

    const mixedConditionalStore2 = createMysqlAuthStore(storeOptions(runtime, database, mixedGate));
    const mixedLegacyStore = createMysqlAuthStore(
      crossDatabaseStoreOptions(runtime, loaderDatabase, database),
    );
    stores.push(mixedConditionalStore2, mixedLegacyStore);
    const mixedConditionalLoaded2 = mixedConditionalStore2.load();
    const mixedLegacyLoaded = mixedLegacyStore.load();
    const mixedConditional = saveMarketCreate(
      mixedConditionalStore2,
      mixedConditionalLoaded2,
      "b",
      mixedConditionalOptions,
    );
    trackWrite(mixedConditional.promise);
    await settleWithin(mixedGate.entered, WAIT_TIMEOUT_MS, "mixed conditional COMMIT gate");
    const mixedLegacyOptions = {
      legacy: true,
      listingId: "listing_real_market_create_mixed_legacy_a",
      operationId: "real_market_create_mixed_legacy_a",
      requestHash: "d".repeat(64),
      unitPrice: 46,
      updatedAt: "2026-07-14T04:33:00.000Z",
    };
    const mixedLegacy = saveMarketCreate(
      mixedLegacyStore,
      mixedLegacyLoaded,
      "a",
      mixedLegacyOptions,
    );
    trackWrite(mixedLegacy.promise);
    await waitForLockWait(admin, "mixed legacy waits on auth EXCLUSIVE");
    mixedGate.release();
    const mixedResults = await settleWithin(
      Promise.allSettled([mixedConditional.promise, mixedLegacy.promise]),
      WAIT_TIMEOUT_MS,
      "mixed conditional first legacy capacity result",
    );
    assert.equal(mixedResults[0].status, "fulfilled");
    assert.equal(mixedResults[1].status, "rejected");
    assert.equal(mixedResults[1].reason.code, "market_full");
    assert.equal(mixedResults[1].reason.outcomeUnknown, false);
    assert.equal(mixedResults[1].reason.rollbackConfirmed, true);
    assert.equal(await marketListingCount(admin), MARKET_MAX_LISTINGS);
    assert.equal(await marketListingExists(admin, mixedConditionalOptions.listingId), true);
    assert.equal(await marketListingExists(admin, mixedLegacyOptions.listingId), false);
    assert.equal(await mutationReceiptExists(admin, mixedConditionalOptions.operationId), true);
    assert.equal(await mutationReceiptExists(admin, mixedLegacyOptions.operationId), false);
    assert.deepEqual(await profileAssetRow(admin, "a"), {revision: 3, stoneCoins: 100, itemCount: 2});
    assert.deepEqual(await profileAssetRow(admin, "b"), {revision: 3, stoneCoins: 200, itemCount: 1});
    assert.equal(await globalRevision(admin), 1);
    assert.equal(await marketCreateCapacityGuardRevision(admin), 0);
    await closeStores(stores);

    await waitUntil(async () => (
      await activeTransactionCount(admin) === 0 && await lockWaitCount(admin) === 0
    ), WAIT_TIMEOUT_MS, "market create transaction cleanup");
    const deadlocksAfter = await deadlockCount(admin);
    assert.equal(deadlocksAfter - deadlocksBefore, 0);
    return {
      marketCreateSeparateDatabase: database,
      marketCreate118BothCommitted: true,
      marketCreate119ExactlyOneWinner: true,
      marketCreateMixedLegacyKnownFullRollbackVerified: true,
      marketCreateMixedLegacyAuthWaitObserved: true,
      marketCreateCapacityGuardWaitObserved: true,
      marketCreateKnownFullRollbackVerified: true,
      marketCreateGlobalRevisionStable: true,
      marketCreateGuardRevisionStable: true,
      marketCreateDeadlockDelta: deadlocksAfter - deadlocksBefore,
      marketCreateActiveTransactions: await activeTransactionCount(admin),
      marketCreateActiveLockWaits: await lockWaitCount(admin),
    };
  } finally {
    for (const gate of gates) {
      gate.release();
    }
    try {
      await settleWithin(Promise.allSettled(pendingWrites), WAIT_TIMEOUT_MS, "market create pending writes cleanup");
    } catch {
      // The isolated mysqld teardown remains the final bounded cleanup guard.
    }
    await closeStores(stores, {bestEffort: true});
    if (admin) {
      try {
        await settleWithin(admin.end(), WAIT_TIMEOUT_MS, "market create admin pool close");
      } catch {
        // The isolated mysqld teardown remains the final bounded cleanup guard.
      }
    }
  }
}

async function runMailSendMysqlGate(runtime) {
  const database = `beastbound_p0_6d2c7_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const stores = [];
  const gates = [];
  const pendingWrites = [];
  let admin = null;
  function trackWrite(promise) {
    pendingWrites.push(promise);
    void promise.catch(() => {});
    return promise;
  }
  try {
    const bootstrap = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(bootstrap);
    const empty = bootstrap.load();
    await settleWithin(
      trackWrite(bootstrap.saveAsync(mailSendSeededAuthority(empty))),
      WAIT_TIMEOUT_MS,
      "mail send bootstrap seed save",
    );
    await closeStores(stores);

    admin = mysql.createPool({...runtime.connectionOptions, database, connectionLimit: 4});
    const deadlocksBefore = await deadlockCount(admin);
    assert.equal(await globalRevision(admin), 1);
    assert.deepEqual(await profileAssetRow(admin, "a"), {revision: 1, stoneCoins: 100, itemCount: 4});
    assert.deepEqual(await profileAssetRow(admin, "b"), {revision: 1, stoneCoins: 200, itemCount: 4});

    const authorityReadStore = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(authorityReadStore);
    authorityReadStore.load();
    for (const includeActorProfile of [false, true]) {
      const view = await settleWithin(authorityReadStore.readSharedAssetView({
        schemaVersion: 1,
        scope: "mail_send",
        accountId: ACTORS.a.accountId,
        recipientUsername: "real_mysql_b",
        knownRecipientAccountId: ACTORS.b.accountId,
        includeActorProfile,
        includeProfileMailPartitions: false,
      }), WAIT_TIMEOUT_MS, "mail send authority read");
      assert.equal(view.recipientAccountId, ACTORS.b.accountId);
      assert.deepEqual(view.mailPartitions, []);
      assert.deepEqual(view.profileBindings.keys, includeActorProfile ? [ACTORS.a.accountId] : []);
      assert.deepEqual(view.profiles.keys, includeActorProfile ? [ACTORS.a.playerId] : []);
    }
    await closeStores(stores);

    const textGate = commitGate("mail_send_parallel_text_a");
    gates.push(textGate);
    const textStoreA = createMysqlAuthStore(storeOptions(runtime, database, textGate));
    const textStoreB = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(textStoreA, textStoreB);
    const textLoadedA = textStoreA.load();
    const textLoadedB = textStoreB.load();
    const textA = saveMailSend(textStoreA, textLoadedA, "a", "b", {
      mode: "text",
      mailId: "mail_real_send_text_a",
      operationId: "real_mail_send_text_a",
      requestHash: "1".repeat(64),
      updatedAt: "2026-07-14T04:40:00.000Z",
    });
    trackWrite(textA.promise);
    await settleWithin(textGate.entered, WAIT_TIMEOUT_MS, "text mail A COMMIT gate");
    const textB = saveMailSend(textStoreB, textLoadedB, "a", "b", {
      mode: "text",
      mailId: "mail_real_send_text_b",
      operationId: "real_mail_send_text_b",
      requestHash: "2".repeat(64),
      updatedAt: "2026-07-14T04:40:00.000Z",
    });
    trackWrite(textB.promise);
    await waitForLockWait(admin, "parallel text mail receipt capacity tail wait");
    assert.equal(await marketSaleMailExists(admin, "mail_real_send_text_a"), false);
    assert.equal(await marketSaleMailExists(admin, "mail_real_send_text_b"), false);
    textGate.release();
    const textResults = await settleWithin(
      Promise.allSettled([textA.promise, textB.promise]),
      WAIT_TIMEOUT_MS,
      "parallel text mail receipt capacity tail commits",
    );
    assert.deepEqual(textResults.map((result) => result.status), ["fulfilled", "fulfilled"]);
    assert.equal(await marketSaleMailExists(admin, "mail_real_send_text_a"), true);
    assert.equal(await marketSaleMailExists(admin, "mail_real_send_text_b"), true);
    assert.equal(await mutationReceiptExists(admin, "real_mail_send_text_a"), true);
    assert.equal(await mutationReceiptExists(admin, "real_mail_send_text_b"), true);
    assert.equal(await globalRevision(admin), 1);
    await closeStores(stores);

    const differentGate = commitGate("mail_send_different_profiles_a");
    gates.push(differentGate);
    const differentStoreA = createMysqlAuthStore(storeOptions(runtime, database, differentGate));
    const differentStoreB = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(differentStoreA, differentStoreB);
    const differentLoadedA = differentStoreA.load();
    const differentLoadedB = differentStoreB.load();
    const ordinaryA = saveMailSend(differentStoreA, differentLoadedA, "a", "b", {
      mode: "ordinary_items",
      mailId: "mail_real_send_items_a",
      operationId: "real_mail_send_items_a",
      requestHash: "3".repeat(64),
      updatedAt: "2026-07-14T04:41:00.000Z",
    });
    trackWrite(ordinaryA.promise);
    await settleWithin(differentGate.entered, WAIT_TIMEOUT_MS, "ordinary mail A COMMIT gate");
    const ordinaryB = saveMailSend(differentStoreB, differentLoadedB, "b", "a", {
      mode: "ordinary_items",
      mailId: "mail_real_send_items_b",
      operationId: "real_mail_send_items_b",
      requestHash: "4".repeat(64),
      updatedAt: "2026-07-14T04:41:00.000Z",
    });
    trackWrite(ordinaryB.promise);
    await waitForLockWait(admin, "different-profile ordinary mail receipt capacity tail wait");
    differentGate.release();
    const ordinaryResults = await settleWithin(
      Promise.allSettled([ordinaryA.promise, ordinaryB.promise]),
      WAIT_TIMEOUT_MS,
      "different-profile ordinary mail receipt capacity tail commits",
    );
    assert.deepEqual(ordinaryResults.map((result) => result.status), ["fulfilled", "fulfilled"]);
    assert.deepEqual(await profileAssetRow(admin, "a"), {revision: 2, stoneCoins: 100, itemCount: 3});
    assert.deepEqual(await profileAssetRow(admin, "b"), {revision: 2, stoneCoins: 200, itemCount: 3});
    assert.equal(await marketSaleMailExists(admin, "mail_real_send_items_a"), true);
    assert.equal(await marketSaleMailExists(admin, "mail_real_send_items_b"), true);
    assert.equal(await globalRevision(admin), 1);
    await closeStores(stores);

    const sameSenderGate = commitGate("mail_send_same_sender_winner");
    gates.push(sameSenderGate);
    const sameSenderStoreA = createMysqlAuthStore(storeOptions(runtime, database, sameSenderGate));
    const sameSenderStoreB = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(sameSenderStoreA, sameSenderStoreB);
    const sameSenderLoadedA = sameSenderStoreA.load();
    const sameSenderLoadedB = sameSenderStoreB.load();
    const sameSenderA = saveMailSend(sameSenderStoreA, sameSenderLoadedA, "a", "b", {
      mode: "ordinary_items",
      mailId: "mail_real_send_same_a",
      operationId: "real_mail_send_same_a",
      requestHash: "5".repeat(64),
      updatedAt: "2026-07-14T04:42:00.000Z",
    });
    trackWrite(sameSenderA.promise);
    await settleWithin(sameSenderGate.entered, WAIT_TIMEOUT_MS, "same sender A COMMIT gate");
    const sameSenderOptionsB = {
      mode: "ordinary_items",
      mailId: "mail_real_send_same_b",
      operationId: "real_mail_send_same_b",
      requestHash: "6".repeat(64),
      updatedAt: "2026-07-14T04:42:00.000Z",
    };
    const sameSenderB = saveMailSend(
      sameSenderStoreB,
      sameSenderLoadedB,
      "a",
      "b",
      sameSenderOptionsB,
    );
    trackWrite(sameSenderB.promise);
    await waitForLockWait(admin, "same sender ordinary mail profile wait");
    sameSenderGate.release();
    const sameResults = await settleWithin(
      Promise.allSettled([sameSenderA.promise, sameSenderB.promise]),
      WAIT_TIMEOUT_MS,
      "same sender ordinary mail race",
    );
    assert.equal(sameResults[0].status, "fulfilled");
    assert.equal(sameResults[1].status, "rejected");
    assert.equal(sameResults[1].reason.code, "mysql_resource_revision_conflict");
    assert.equal(sameResults[1].reason.outcomeUnknown, false);
    assert.equal(sameResults[1].reason.rollbackConfirmed, true);
    assert.deepEqual(await profileAssetRow(admin, "a"), {revision: 3, stoneCoins: 100, itemCount: 2});
    assert.equal(await marketSaleMailExists(admin, sameSenderOptionsB.mailId), false);
    assert.equal(await mutationReceiptExists(admin, sameSenderOptionsB.operationId), false);
    const sameSenderReloaded = sameSenderStoreB.load();
    const sameSenderRetry = saveMailSend(sameSenderStoreB, sameSenderReloaded, "a", "b", {
      ...sameSenderOptionsB,
      updatedAt: "2026-07-14T04:43:00.000Z",
    });
    trackWrite(sameSenderRetry.promise);
    await settleWithin(sameSenderRetry.promise, WAIT_TIMEOUT_MS, "same sender original operation retry");
    assert.deepEqual(await profileAssetRow(admin, "a"), {revision: 4, stoneCoins: 100, itemCount: 1});
    assert.equal(await marketSaleMailExists(admin, sameSenderOptionsB.mailId), true);
    assert.equal(await mutationReceiptExists(admin, sameSenderOptionsB.operationId), true);
    await closeStores(stores);

    const mailCollisionGate = commitGate("mail_send_duplicate_mail_id_a");
    gates.push(mailCollisionGate);
    const collisionStoreA = createMysqlAuthStore(storeOptions(runtime, database, mailCollisionGate));
    const collisionStoreB = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(collisionStoreA, collisionStoreB);
    const collisionLoadedA = collisionStoreA.load();
    const collisionLoadedB = collisionStoreB.load();
    const collisionMailId = "mail_real_send_collision_shared";
    const collisionA = saveMailSend(collisionStoreA, collisionLoadedA, "a", "b", {
      mode: "ordinary_items",
      mailId: collisionMailId,
      operationId: "real_mail_send_collision_a",
      requestHash: "7".repeat(64),
      updatedAt: "2026-07-14T04:44:00.000Z",
    });
    trackWrite(collisionA.promise);
    await settleWithin(mailCollisionGate.entered, WAIT_TIMEOUT_MS, "mail collision A COMMIT gate");
    const collisionB = saveMailSend(collisionStoreB, collisionLoadedB, "b", "a", {
      mode: "ordinary_items",
      mailId: collisionMailId,
      operationId: "real_mail_send_collision_b",
      requestHash: "8".repeat(64),
      updatedAt: "2026-07-14T04:44:00.000Z",
    });
    trackWrite(collisionB.promise);
    await waitForLockWait(admin, "ordinary mail duplicate ID wait");
    mailCollisionGate.release();
    const collisionResults = await settleWithin(
      Promise.allSettled([collisionA.promise, collisionB.promise]),
      WAIT_TIMEOUT_MS,
      "ordinary mail duplicate ID result",
    );
    assert.equal(collisionResults[0].status, "fulfilled");
    assert.equal(collisionResults[1].status, "rejected");
    assert.equal(collisionResults[1].reason.code, "mysql_resource_revision_conflict");
    assert.deepEqual(await profileAssetRow(admin, "a"), {revision: 5, stoneCoins: 100, itemCount: 0});
    assert.deepEqual(await profileAssetRow(admin, "b"), {revision: 2, stoneCoins: 200, itemCount: 3});
    assert.equal((await mailDocument(admin, collisionMailId)).senderAccountId, ACTORS.a.accountId);
    assert.equal(await mutationReceiptExists(admin, "real_mail_send_collision_a"), true);
    assert.equal(await mutationReceiptExists(admin, "real_mail_send_collision_b"), false);
    await closeStores(stores);

    const receiptCollisionGate = commitGate("mail_send_duplicate_receipt_a");
    gates.push(receiptCollisionGate);
    const receiptStoreA = createMysqlAuthStore(storeOptions(runtime, database, receiptCollisionGate));
    const receiptStoreB = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(receiptStoreA, receiptStoreB);
    const receiptLoadedA = receiptStoreA.load();
    const receiptLoadedB = receiptStoreB.load();
    const sharedOperationId = "real_mail_send_receipt_shared";
    const receiptA = saveMailSend(receiptStoreA, receiptLoadedA, "b", "a", {
      mode: "text",
      mailId: "mail_real_send_receipt_a",
      operationId: sharedOperationId,
      requestHash: "9".repeat(64),
      updatedAt: "2026-07-14T04:45:00.000Z",
    });
    trackWrite(receiptA.promise);
    await settleWithin(receiptCollisionGate.entered, WAIT_TIMEOUT_MS, "receipt collision A COMMIT gate");
    const receiptB = saveMailSend(receiptStoreB, receiptLoadedB, "b", "a", {
      mode: "text",
      mailId: "mail_real_send_receipt_b",
      operationId: sharedOperationId,
      requestHash: "9".repeat(64),
      updatedAt: "2026-07-14T04:45:00.000Z",
    });
    trackWrite(receiptB.promise);
    await waitForLockWait(admin, "text mail duplicate receipt wait");
    receiptCollisionGate.release();
    const receiptResults = await settleWithin(
      Promise.allSettled([receiptA.promise, receiptB.promise]),
      WAIT_TIMEOUT_MS,
      "text mail duplicate receipt result",
    );
    assert.equal(receiptResults[0].status, "fulfilled");
    assert.equal(receiptResults[1].status, "rejected");
    assert.equal(receiptResults[1].reason.code, "mysql_resource_revision_conflict");
    assert.equal(await marketSaleMailExists(admin, "mail_real_send_receipt_a"), true);
    assert.equal(await marketSaleMailExists(admin, "mail_real_send_receipt_b"), false);
    assert.equal(await mutationReceiptExists(admin, sharedOperationId), true);
    assert.equal(await globalRevision(admin), 1);
    await closeStores(stores);

    await waitUntil(async () => (
      await activeTransactionCount(admin) === 0 && await lockWaitCount(admin) === 0
    ), WAIT_TIMEOUT_MS, "mail send transaction cleanup");
    const deadlocksAfter = await deadlockCount(admin);
    assert.equal(deadlocksAfter - deadlocksBefore, 0);
    return {
      mailSendSeparateDatabase: database,
      mailSendAuthorityReadVerified: true,
      mailSendTextCapacityTailWaitObserved: true,
      mailSendDifferentProfilesCapacityTailWaitObserved: true,
      mailSendSameSenderLockWaitObserved: true,
      mailSendSameSenderExactlyOneInitialWinner: true,
      mailSendSameOperationRetryVerified: true,
      mailSendDuplicateMailRollbackVerified: true,
      mailSendDuplicateReceiptRollbackVerified: true,
      mailSendGlobalRevisionStable: true,
      mailSendDeadlockDelta: deadlocksAfter - deadlocksBefore,
      mailSendActiveTransactions: await activeTransactionCount(admin),
      mailSendActiveLockWaits: await lockWaitCount(admin),
    };
  } finally {
    for (const gate of gates) {
      gate.release();
    }
    try {
      await settleWithin(Promise.allSettled(pendingWrites), WAIT_TIMEOUT_MS, "mail send pending writes cleanup");
    } catch {
      // The isolated mysqld teardown remains the final bounded cleanup guard.
    }
    await closeStores(stores, {bestEffort: true});
    if (admin) {
      try {
        await settleWithin(admin.end(), WAIT_TIMEOUT_MS, "mail send admin pool close");
      } catch {
        // The isolated mysqld teardown remains the final bounded cleanup guard.
      }
    }
  }
}

async function runReceiptRetentionMysqlGate(runtime) {
  const database = `beastbound_p0_6d2c10_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const pools = [];
  const stores = [];
  const pendingWrites = [];
  const capacityRaceGate = commitGate("mutation_receipt_capacity_19999");
  const steadyStateGate = commitGate("mutation_receipt_steady_state_parallel_a");
  let admin = null;
  let bootstrap = null;
  function trackWrite(promise) {
    pendingWrites.push(promise);
    void promise.catch(() => {});
    return promise;
  }
  async function closePools() {
    const results = await settleWithin(
      Promise.allSettled(pools.splice(0).map((pool) => pool.end())),
      WAIT_TIMEOUT_MS,
      "receipt retention pool close",
    );
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected) {
      throw rejected.reason;
    }
  }
  try {
    bootstrap = createMysqlAuthStore(storeOptions(runtime, database));
    const empty = bootstrap.load();
    await settleWithin(
      trackWrite(bootstrap.saveAsync(mailSendSeededAuthority(empty))),
      WAIT_TIMEOUT_MS,
      "receipt retention authority bootstrap save",
    );
    await settleWithin(bootstrap.close(), WAIT_TIMEOUT_MS, "receipt retention schema bootstrap close");
    bootstrap = null;

    admin = mysql.createPool({...runtime.connectionOptions, database, connectionLimit: 4});
    const deadlocksBefore = await deadlockCount(admin);
    assert.equal(await globalRevision(admin), 1);
    const [revisionReset] = await adminQuery(
      admin,
      "UPDATE auth_store_revisions SET revision = 0 WHERE scope_key = 'auth' AND revision = 1",
      [],
      "MySQL receipt retention isolated auth revision reset",
    );
    assert.equal(Number(revisionReset.affectedRows), 1);
    assert.equal(await globalRevision(admin), 0);
    assert.equal(await mutationReceiptCapacityRevision(admin), 0);
    assert.equal(await mutationReceiptCount(admin), 0);

    await seedExpiredMutationReceipts(admin, DURABLE_RECEIPT_MAX_COUNT - 1);
    const [capacitySeed] = await adminQuery(
      admin,
      `UPDATE auth_store_revisions
        SET revision = ?
        WHERE scope_key = ? AND revision = 0`,
      [DURABLE_RECEIPT_MAX_COUNT - 1, MUTATION_RECEIPT_CAPACITY_GUARD_KEY],
      "MySQL mutation receipt capacity 19999 seed",
    );
    assert.equal(Number(capacitySeed.affectedRows), 1);
    assert.equal(await mutationReceiptCount(admin), DURABLE_RECEIPT_MAX_COUNT - 1);
    assert.equal(
      await mutationReceiptCapacityRevision(admin),
      DURABLE_RECEIPT_MAX_COUNT - 1,
    );

    const capacityReceiptA = retentionReceipt("receipt_retention_capacity_a", {
      committedAt: "2026-07-16T01:00:00.000Z",
      expiresAt: "2026-07-19T01:00:00.000Z",
    });
    const capacityReceiptB = retentionReceipt("receipt_retention_capacity_b", {
      committedAt: "2026-07-16T01:00:00.000Z",
      expiresAt: "2026-07-19T01:00:00.000Z",
    });
    const capacityPoolA = gatedPool(
      mysql.createPool({...runtime.connectionOptions, database, connectionLimit: 1}),
      capacityRaceGate,
    );
    const capacityPoolB = mysql.createPool({
      ...runtime.connectionOptions,
      database,
      connectionLimit: 1,
    });
    pools.push(capacityPoolA, capacityPoolB);
    const capacityWriteA = trackWrite(__runMysqlPoolSavePlanForTest(
      capacityPoolA,
      receiptRetentionPlan(capacityReceiptA),
      {expectedRevision: 0},
    ));
    await settleWithin(
      capacityRaceGate.entered,
      WAIT_TIMEOUT_MS,
      "mutation receipt capacity A COMMIT gate",
    );
    const capacityWriteB = trackWrite(__runMysqlPoolSavePlanForTest(
      capacityPoolB,
      receiptRetentionPlan(capacityReceiptB),
      {expectedRevision: 0},
    ));
    await waitForLockWait(admin, "mutation receipt capacity 19999 lock wait");
    capacityRaceGate.release();
    const capacityResults = await settleWithin(
      Promise.allSettled([capacityWriteA, capacityWriteB]),
      WAIT_TIMEOUT_MS,
      "mutation receipt capacity 19999 competing commits",
    );
    assert.equal(capacityResults[0].status, "fulfilled");
    assert.equal(capacityResults[1].status, "rejected");
    assert.equal(capacityResults[1].reason.code, "mysql_resource_revision_conflict");
    assert.equal(capacityResults[1].reason.resource, "mutation_receipt_capacity");
    assert.equal(
      capacityResults[1].reason.resourceKey,
      MUTATION_RECEIPT_CAPACITY_GUARD_KEY,
    );
    assert.equal(await mutationReceiptCount(admin), DURABLE_RECEIPT_MAX_COUNT);
    assert.equal(
      await mutationReceiptCapacityRevision(admin),
      DURABLE_RECEIPT_MAX_COUNT,
    );
    assert.equal(await mutationReceiptExists(admin, capacityReceiptA.operationId), true);
    assert.equal(await mutationReceiptExists(admin, capacityReceiptB.operationId), false);
    assert.equal(await globalRevision(admin), 0);
    await closePools();

    const conditionalReceiptStore = createMysqlAuthStore(storeOptions(runtime, database));
    const staleLegacyReceiptStore = createMysqlAuthStore(storeOptions(runtime, database));
    stores.push(conditionalReceiptStore, staleLegacyReceiptStore);
    const conditionalReceiptBefore = conditionalReceiptStore.load();
    const staleLegacyReceiptBefore = staleLegacyReceiptStore.load();
    const conditionalReceiptOptions = {
      mode: "text",
      mailId: "mail_receipt_retention_conditional_first",
      operationId: "receipt_retention_conditional_first",
      requestHash: crypto.createHash("sha256")
        .update("receipt-retention-conditional-first")
        .digest("hex"),
      updatedAt: "2026-07-16T01:00:30.000Z",
    };
    const conditionalReceiptMutation = mailSendMutation(
      conditionalReceiptBefore,
      "b",
      "a",
      conditionalReceiptOptions,
    );
    const conditionalReceiptDelta = durableMutationReceiptDeltaFrom(
      conditionalReceiptBefore.mutationReceipts,
      conditionalReceiptMutation.after.mutationReceipts,
    );
    assert.equal(conditionalReceiptDelta.ok, true);
    assert.equal(conditionalReceiptDelta.deletes.length, 1);
    assert.equal(conditionalReceiptDelta.upserts.length, 1);
    const staleLegacyVictim = conditionalReceiptDelta.deletes[0].expectedReceipt;

    let staleLegacyOptions = null;
    for (let attempt = 0; attempt < 4096; attempt += 1) {
      const operationId = `receipt_retention_stale_legacy_${String(attempt).padStart(4, "0")}`;
      const requestHash = crypto.createHash("sha256")
        .update(`receipt-retention-stale-legacy-${attempt}`)
        .digest("hex");
      const candidateReceipts = stageDurableMutationReceipt(
        staleLegacyReceiptBefore.mutationReceipts,
        {
          schemaVersion: 1,
          operationId,
          requestHash,
          actionId: MAIL_SEND_ACTION_ID,
          accountId: ACTORS.a.accountId,
          committedAt: conditionalReceiptOptions.updatedAt,
          expiresAt: "2026-07-18T05:00:00.000Z",
          response: {ok: true, fixture: "stale_legacy_receipt_victim_selection"},
        },
        {nowMs: Date.parse(conditionalReceiptOptions.updatedAt)},
      );
      const candidateDelta = durableMutationReceiptDeltaFrom(
        staleLegacyReceiptBefore.mutationReceipts,
        candidateReceipts,
      );
      assert.equal(candidateDelta.ok, true);
      assert.equal(candidateDelta.deletes.length, 1);
      assert.equal(candidateDelta.upserts.length, 1);
      if (candidateDelta.deletes[0].operationId === staleLegacyVictim.operationId) {
        staleLegacyOptions = {
          mode: "ordinary_items",
          mailId: "mail_receipt_retention_stale_legacy",
          operationId,
          requestHash,
          updatedAt: conditionalReceiptOptions.updatedAt,
        };
        break;
      }
    }
    assert.ok(staleLegacyOptions, "无法选择与条件事务相同的陈旧 legacy 回执 victim。");
    const staleLegacyMutation = mailSendMutation(
      staleLegacyReceiptBefore,
      "a",
      "b",
      staleLegacyOptions,
    );
    const staleLegacyDelta = durableMutationReceiptDeltaFrom(
      staleLegacyReceiptBefore.mutationReceipts,
      staleLegacyMutation.after.mutationReceipts,
    );
    assert.equal(staleLegacyDelta.ok, true);
    assert.equal(staleLegacyDelta.deletes.length, 1);
    assert.equal(staleLegacyDelta.deletes[0].operationId, staleLegacyVictim.operationId);
    assert.deepEqual(staleLegacyDelta.deletes[0].expectedReceipt, staleLegacyVictim);
    assert.equal(staleLegacyDelta.upserts.length, 1);
    const staleLegacyAssetBefore = await profileAssetRow(admin, "a");
    const staleLegacyBindingRevisionBefore = await bindingRevision(admin, "a");

    await settleWithin(
      trackWrite(conditionalReceiptStore.saveAsync(
        conditionalReceiptMutation.after,
        {consistencyScope: conditionalReceiptMutation.consistencyScope},
      )),
      WAIT_TIMEOUT_MS,
      "20k conditional receipt replacement commits before stale legacy",
    );
    assert.equal(await mutationReceiptExists(admin, staleLegacyVictim.operationId), false);
    assert.equal(
      await mutationReceiptExists(admin, conditionalReceiptOptions.operationId),
      true,
    );
    assert.equal(
      await marketSaleMailExists(admin, conditionalReceiptOptions.mailId),
      true,
    );
    assert.equal(await mutationReceiptCount(admin), DURABLE_RECEIPT_MAX_COUNT);
    assert.equal(
      await mutationReceiptCapacityRevision(admin),
      DURABLE_RECEIPT_MAX_COUNT,
    );
    assert.equal(await globalRevision(admin), 0);

    const staleLegacyWrite = trackWrite(staleLegacyReceiptStore.saveAsync(
      staleLegacyMutation.after,
      {
        durableOperation: {
          operationId: staleLegacyOptions.operationId,
          requestHash: staleLegacyOptions.requestHash,
          actionId: MAIL_SEND_ACTION_ID,
        },
      },
    ));
    const [staleLegacyResult] = await settleWithin(
      Promise.allSettled([staleLegacyWrite]),
      WAIT_TIMEOUT_MS,
      "stale legacy exact receipt delete affectedRows=0 rollback",
    );
    assert.equal(staleLegacyResult.status, "rejected");
    assert.equal(staleLegacyResult.reason.code, "mysql_resource_revision_conflict");
    assert.equal(staleLegacyResult.reason.resource, "mutation_receipt");
    assert.equal(staleLegacyResult.reason.resourceKey, staleLegacyVictim.operationId);
    assert.deepEqual(await profileAssetRow(admin, "a"), staleLegacyAssetBefore);
    assert.equal(await bindingRevision(admin, "a"), staleLegacyBindingRevisionBefore);
    assert.equal(await marketSaleMailExists(admin, staleLegacyOptions.mailId), false);
    assert.equal(await mutationReceiptExists(admin, staleLegacyOptions.operationId), false);
    assert.equal(await mutationReceiptCount(admin), DURABLE_RECEIPT_MAX_COUNT);
    assert.equal(
      await mutationReceiptCapacityRevision(admin),
      DURABLE_RECEIPT_MAX_COUNT,
    );
    assert.equal(await globalRevision(admin), 0);

    let observedCapacityWrites = 0;
    async function observeCapacityWrite(queryArgs) {
      const first = queryArgs[0];
      const sql = String(typeof first === "string" ? first : first && first.sql || "")
        .replace(/\s+/g, " ")
        .trim();
      if (
        /^UPDATE auth_store_revisions\b/i.test(sql)
        && sql.includes("scope_key = 'mutation_receipt_capacity'")
      ) {
        observedCapacityWrites += 1;
      }
    }
    const steadyStoreA = createMysqlAuthStore(storeOptions(runtime, database, {
      beforeCommit: () => steadyStateGate.beforeCommit(),
      beforeQuery: observeCapacityWrite,
    }));
    const steadyStoreB = createMysqlAuthStore(storeOptions(runtime, database, {
      beforeQuery: observeCapacityWrite,
    }));
    stores.push(steadyStoreA, steadyStoreB);
    const steadyLoadedA = steadyStoreA.load();
    const steadyLoadedB = steadyStoreB.load();
    const steadyOptionsA = {
      stoneCoins: 91,
      operationId: "receipt_retention_parallel_a",
      requestHash: "c".repeat(64),
      updatedAt: "2026-07-16T01:01:00.000Z",
    };
    const steadyAfterA = nextProfileAuthority(steadyLoadedA, "a", steadyOptionsA);
    const steadyDeltaA = durableMutationReceiptDeltaFrom(
      steadyLoadedA.mutationReceipts,
      steadyAfterA.mutationReceipts,
    );
    assert.equal(steadyDeltaA.ok, true);
    assert.equal(steadyDeltaA.deletes.length, 1);
    assert.equal(steadyDeltaA.upserts.length, 1);
    const victimA = steadyDeltaA.deletes[0].expectedReceipt;

    let steadyOptionsB = null;
    let steadyAfterB = null;
    let steadyDeltaB = null;
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const candidateOptions = {
        stoneCoins: 191,
        operationId: `receipt_retention_parallel_b_${String(attempt).padStart(2, "0")}`,
        requestHash: crypto.createHash("sha256").update(`steady-b-${attempt}`).digest("hex"),
        updatedAt: "2026-07-16T01:01:00.000Z",
      };
      const candidateAfter = nextProfileAuthority(steadyLoadedB, "b", candidateOptions);
      const candidateDelta = durableMutationReceiptDeltaFrom(
        steadyLoadedB.mutationReceipts,
        candidateAfter.mutationReceipts,
      );
      assert.equal(candidateDelta.ok, true);
      assert.equal(candidateDelta.deletes.length, 1);
      assert.equal(candidateDelta.upserts.length, 1);
      if (candidateDelta.deletes[0].operationId !== victimA.operationId) {
        steadyOptionsB = candidateOptions;
        steadyAfterB = candidateAfter;
        steadyDeltaB = candidateDelta;
        break;
      }
    }
    assert.ok(steadyOptionsB && steadyAfterB && steadyDeltaB, "无法选择不同的过期回执 victim。");
    const victimB = steadyDeltaB.deletes[0].expectedReceipt;
    assert.notEqual(victimA.operationId, steadyOptionsA.operationId);
    assert.notEqual(victimB.operationId, steadyOptionsB.operationId);
    assert.notEqual(victimA.operationId, victimB.operationId);
    assert.ok(Date.parse(victimA.expiresAt) <= Date.parse(steadyOptionsA.updatedAt));
    assert.ok(Date.parse(victimB.expiresAt) <= Date.parse(steadyOptionsB.updatedAt));

    const steadyWriteA = trackWrite(steadyStoreA.saveAsync(
      steadyAfterA,
      rowLocalOptions("a", steadyOptionsA),
    ));
    await settleWithin(
      steadyStateGate.entered,
      WAIT_TIMEOUT_MS,
      "20k steady-state different-account A COMMIT gate",
    );
    const steadyWriteB = trackWrite(steadyStoreB.saveAsync(
      steadyAfterB,
      rowLocalOptions("b", steadyOptionsB),
    ));
    await settleWithin(
      steadyWriteB,
      WAIT_TIMEOUT_MS,
      "20k steady-state different-account B commits before A release",
    );
    assert.deepEqual(await profileRow(admin, "a"), {revision: 1, stoneCoins: 100});
    assert.deepEqual(await profileRow(admin, "b"), {revision: 2, stoneCoins: 191});
    assert.equal(await mutationReceiptExists(admin, steadyOptionsA.operationId), false);
    assert.equal(await mutationReceiptExists(admin, steadyOptionsB.operationId), true);
    steadyStateGate.release();
    await settleWithin(
      steadyWriteA,
      WAIT_TIMEOUT_MS,
      "20k steady-state different-account A commit",
    );
    assert.deepEqual(await profileRow(admin, "a"), {revision: 2, stoneCoins: 91});
    assert.equal(await mutationReceiptExists(admin, victimA.operationId), false);
    assert.equal(await mutationReceiptExists(admin, victimB.operationId), false);
    assert.equal(await mutationReceiptExists(admin, steadyOptionsA.operationId), true);
    assert.equal(await mutationReceiptExists(admin, steadyOptionsB.operationId), true);
    assert.equal(observedCapacityWrites, 0);
    assert.equal(await mutationReceiptCount(admin), DURABLE_RECEIPT_MAX_COUNT);
    assert.equal(
      await mutationReceiptCapacityRevision(admin),
      DURABLE_RECEIPT_MAX_COUNT,
    );
    assert.equal(await globalRevision(admin), 0);
    await closeStores(stores);

    await waitUntil(async () => (
      await activeTransactionCount(admin) === 0 && await lockWaitCount(admin) === 0
    ), WAIT_TIMEOUT_MS, "receipt retention transaction cleanup");
    const deadlocksAfter = await deadlockCount(admin);
    assert.equal(deadlocksAfter - deadlocksBefore, 0);
    return {
      qualified: true,
      receiptRetentionSeparateDatabase: database,
      receiptRetentionSeedCount: DURABLE_RECEIPT_MAX_COUNT - 1,
      receiptCapacity19999ExactlyOneWinner: true,
      receiptCapacityFinalCount: await mutationReceiptCount(admin),
      receiptCapacityFinalRevision: await mutationReceiptCapacityRevision(admin),
      receiptCapacityLockWaitObserved: true,
      receiptCapacityLoserRolledBack: true,
      receiptStaleLegacyExactDeleteConflictVerified: true,
      receiptStaleLegacyMailAssetReceiptRevisionRolledBack: true,
      receiptDifferentExpiredVictimNetZeroVerified: true,
      receiptSteadyStateDifferentAccountsCommittedBeforeARelease: true,
      receiptSteadyStateVictimsWereDifferent: true,
      receiptNetZeroCapacityWritesObserved: observedCapacityWrites,
      receiptRetentionGlobalRevision: await globalRevision(admin),
      receiptRetentionDeadlockDelta: deadlocksAfter - deadlocksBefore,
      receiptRetentionActiveTransactions: await activeTransactionCount(admin),
      receiptRetentionActiveLockWaits: await lockWaitCount(admin),
    };
  } finally {
    capacityRaceGate.release();
    steadyStateGate.release();
    try {
      await settleWithin(
        Promise.allSettled(pendingWrites),
        WAIT_TIMEOUT_MS,
        "receipt retention pending writes cleanup",
      );
    } catch {
      // The isolated mysqld teardown remains the final bounded cleanup guard.
    }
    try {
      await closePools();
    } catch {
      // The isolated mysqld teardown remains the final bounded cleanup guard.
    }
    await closeStores(stores, {bestEffort: true});
    if (bootstrap) {
      try {
        await settleWithin(bootstrap.close(), WAIT_TIMEOUT_MS, "receipt retention bootstrap close");
      } catch {
        // The isolated mysqld teardown remains the final bounded cleanup guard.
      }
    }
    if (admin) {
      try {
        await settleWithin(admin.end(), WAIT_TIMEOUT_MS, "receipt retention admin pool close");
      } catch {
        // The isolated mysqld teardown remains the final bounded cleanup guard.
      }
    }
  }
}

async function main() {
  // Explicit empty credentials must not fall through mysql-store's runtime
  // environment defaults. This process-local scrub never reads their values
  // and prevents player-server secrets from entering the disposable gate.
  process.env.BEASTBOUND_MYSQL_PASSWORD = "";
  process.env.MYSQL_PWD = "";
  let runtime = null;
  let report = null;
  try {
    runtime = await startIsolatedMysql();
    const receiptRetentionOnly = process.argv.slice(2).includes("--receipt-retention-only");
    if (receiptRetentionOnly) {
      report = await runReceiptRetentionMysqlGate(runtime);
    } else {
      const baseReport = await runRealMysqlGate(runtime);
      const marketCreateReport = await runMarketCreateMysqlGate(runtime);
      const mailSendReport = await runMailSendMysqlGate(runtime);
      const receiptRetentionReport = await runReceiptRetentionMysqlGate(runtime);
      report = {
        ...baseReport,
        ...marketCreateReport,
        ...mailSendReport,
        ...receiptRetentionReport,
      };
    }
  } finally {
    await stopIsolatedMysql(runtime);
  }
  report.cleanupVerified = runtime !== null
    && !fs.existsSync(runtime.runtimeDir)
    && childProcessExited(runtime.processHandle);
  assert.equal(report.cleanupVerified, true);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  const safe = {
    qualified: false,
    code: String(error && error.code || "p0_6d_real_mysql_gate_failed"),
    message: String(error && error.message || "隔离 MySQL 并发门槛失败。"),
    resource: String(error && error.resource || ""),
    resourceKey: String(error && error.resourceKey || ""),
    causeCode: String(error && error.cause && error.cause.code || ""),
    causeMessage: String(error && error.cause && error.cause.message || ""),
  };
  process.stderr.write(`${JSON.stringify(safe, null, 2)}\n`);
  process.exitCode = 1;
});
