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
const {stageDurableMutationReceipt} = require(path.join(ROOT, "server/node/src/auth/durable-mutation-state"));
const {createMysqlAuthStore} = require(path.join(ROOT, "server/node/src/mysql-store"));

const ACTORS = Object.freeze({
  a: Object.freeze({accountId: "acc_real_parallel_a", playerId: "player_real_parallel_a"}),
  b: Object.freeze({accountId: "acc_real_parallel_b", playerId: "player_real_parallel_b"}),
  m: Object.freeze({accountId: "acc_real_market_cancel", playerId: "player_real_market_cancel"}),
});
const BASE_TIME = "2026-07-14T04:00:00.000Z";
const MARKET_LISTING_IDS = Object.freeze({
  success: "listing_real_market_cancel_success",
  rollback: "listing_real_market_cancel_rollback",
  buyParallelA: "listing_real_market_buy_parallel_a",
  buyParallelB: "listing_real_market_buy_parallel_b",
  buyRace: "listing_real_market_buy_race",
  buyRollback: "listing_real_market_buy_rollback",
});
const MYSQL_MEMORY_BYTES = 128 * 1024 * 1024;
const WAIT_TIMEOUT_MS = 10000;

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

function gatedPool(basePool, gate) {
  return {
    async getConnection() {
      const connection = await basePool.getConnection();
      return new Proxy(connection, {
        get(target, property) {
          if (property === "commit" && gate) {
            return async () => {
              await gate.beforeCommit();
              return target.commit();
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

function seededAuthority(empty) {
  const data = cloneAuthorityRoot(empty);
  data.profileBindings = {};
  data.profiles = {};
  data.mutationReceipts = data.mutationReceipts || {};
  data.marketConfig = {taxRate: 0.05};
  for (const [key, actor] of Object.entries(ACTORS)) {
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
  };
  return data;
}

function realMarketListing(listingId, count) {
  return {
    listingId,
    sellerAccountId: ACTORS.m.accountId,
    itemId: "item_meat_small",
    count,
    unitPrice: 20,
    currency: "stoneCoins",
    createdAt: BASE_TIME,
    schemaVersion: 1,
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
  const actor = ACTORS.m;
  const listing = before.marketListings[listingId];
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
  const buyer = ACTORS[buyerKey];
  const listing = before.marketListings[listingId];
  const seller = ACTORS.m;
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
    recipientUsername: "real_market_seller",
    recipientDisplayName: "真实市场卖家",
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

async function profileRow(admin, actorKey) {
  const [rows] = await adminQuery(
    admin,
    "SELECT profile_revision, CAST(JSON_UNQUOTE(JSON_EXTRACT(profile_json, '$.stoneCoins')) AS SIGNED) AS stone_coins FROM profiles WHERE player_id = ?",
    [ACTORS[actorKey].playerId],
    "MySQL profile row query",
  );
  return {revision: Number(rows[0].profile_revision), stoneCoins: Number(rows[0].stone_coins)};
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
  const [rows] = await adminQuery(
    admin,
    "SELECT profile_revision FROM profile_bindings WHERE account_id = ?",
    [ACTORS[actorKey].accountId],
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

async function marketSaleMailExists(admin, mailId) {
  const [rows] = await adminQuery(
    admin,
    "SELECT COUNT(*) AS mail_count FROM mail_messages WHERE mail_id = ?",
    [mailId],
    "MySQL market sale mail query",
  );
  return Number(rows[0] && rows[0].mail_count || 0) === 1;
}

function isConflict(error, code) {
  return Boolean(error && error.code === code);
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
    try {
      await settleWithin(differentWriteB.promise, WAIT_TIMEOUT_MS, "不同 profile 的 B 提交");
    } finally {
      differentGate.release();
    }
    await settleWithin(differentWriteA.promise, WAIT_TIMEOUT_MS, "不同 profile 的 A 提交");
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
    stores.push(parallelBuyA, parallelBuyB, staleLegacyAfterBuy);
    const parallelBuyLoadedA = parallelBuyA.load();
    const parallelBuyLoadedB = parallelBuyB.load();
    const staleLegacyMarketState = staleLegacyAfterBuy.load();
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
      "real_market_buy_parallel_a",
      "real_market_buy_parallel_b",
      "real_market_buy_race_winner",
      "real_market_cancel_001",
      "real_parallel_a_001",
      "real_parallel_b_001",
      "real_profile_before_legacy",
      "real_same_profile_a_001",
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
      differentProfilesCommittedBeforeARelease: true,
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
    report = await runRealMysqlGate(runtime);
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
