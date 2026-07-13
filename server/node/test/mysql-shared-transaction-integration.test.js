"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {cloneAuthorityRoot} = require("../src/auth/authority-root-clone");
const {stageDurableMutationReceipt} = require("../src/auth/durable-mutation-state");
const {createMysqlAuthStore} = require("../src/mysql-store");
const {
  createSharedMysqlTransactionHarness,
  sharedMysqlOperation,
} = require("../test-support/shared-mysql-transaction-harness");

const ACCOUNT_ID = "acc_shared_mysql";
const PLAYER_ID = "player_shared_mysql";
const UPDATED_AT_1 = "2026-07-14T02:00:00.000Z";
const UPDATED_AT_2 = "2026-07-14T02:01:00.000Z";
const UPDATED_AT_3 = "2026-07-14T02:02:00.000Z";

function baselineAuthority() {
  return {
    schemaVersion: 1,
    accounts: {},
    sessions: {},
    profileBindings: {
      [ACCOUNT_ID]: {
        accountId: ACCOUNT_ID,
        playerId: PLAYER_ID,
        profileRevision: 1,
        updatedAt: UPDATED_AT_1,
      },
    },
    profiles: {
      [PLAYER_ID]: {
        playerId: PLAYER_ID,
        accountId: ACCOUNT_ID,
        profileRevision: 1,
        updatedAt: UPDATED_AT_1,
        profile: {
          displayName: "共享事务猎人",
          stoneCoins: 100,
        },
      },
    },
    mutationReceipts: {},
    mailMessages: {},
    marketListings: {},
    consumedEquipmentEnvelopes: {},
    serviceEventSeq: 0,
    serviceEvents: [],
  };
}

function nextProfileAuthority(before, options = {}) {
  const after = cloneAuthorityRoot(before);
  const nextRevision = Number(before.profileBindings[ACCOUNT_ID].profileRevision) + 1;
  const updatedAt = String(options.updatedAt || UPDATED_AT_2);
  after.profileBindings[ACCOUNT_ID] = {
    ...before.profileBindings[ACCOUNT_ID],
    profileRevision: nextRevision,
    updatedAt,
  };
  after.profiles[PLAYER_ID] = {
    ...before.profiles[PLAYER_ID],
    profileRevision: nextRevision,
    updatedAt,
    profile: {
      ...before.profiles[PLAYER_ID].profile,
      stoneCoins: Number(options.stoneCoins ?? 90),
    },
  };
  if (options.operationId) {
    const operationId = String(options.operationId);
    after.mutationReceipts = stageDurableMutationReceipt(
      after.mutationReceipts,
      {
        schemaVersion: 1,
        operationId,
        requestHash: String(options.requestHash || "a".repeat(64)),
        actionId: "profile_action",
        accountId: ACCOUNT_ID,
        committedAt: updatedAt,
        expiresAt: "2026-07-17T02:01:00.000Z",
        response: {ok: true, operationId},
      },
      {nowMs: Date.parse(updatedAt)},
    );
  }
  return after;
}

function sqlSeed(options = {}) {
  const authority = baselineAuthority();
  return {
    auth_store_revisions: {
      auth: {scope_key: "auth", revision: 0},
    },
    profile_bindings: {
      [ACCOUNT_ID]: {
        account_id: ACCOUNT_ID,
        player_id: PLAYER_ID,
        profile_revision: 1,
        updated_at: UPDATED_AT_1,
        document_json: authority.profileBindings[ACCOUNT_ID],
      },
    },
    profiles: {
      [PLAYER_ID]: {
        player_id: PLAYER_ID,
        account_id: ACCOUNT_ID,
        profile_revision: 1,
        updated_at: UPDATED_AT_1,
        profile_json: authority.profiles[PLAYER_ID].profile,
      },
    },
    mutation_receipts: options.mutationReceipts || {},
  };
}

function normalizeSql(sql) {
  return String(sql || "").trim().replace(/\s+/g, " ");
}

function requiredParams(params, count, sql) {
  if (!Array.isArray(params) || params.length !== count) {
    const error = new Error(`unexpected parameter count for modeled SQL: ${normalizeSql(sql)}`);
    error.code = "shared_mysql_parameter_mismatch";
    throw error;
  }
  return params;
}

function jsonParameter(value, sql) {
  try {
    return JSON.parse(String(value));
  } catch {
    const error = new Error(`invalid JSON parameter for modeled SQL: ${normalizeSql(sql)}`);
    error.code = "shared_mysql_json_parameter_invalid";
    throw error;
  }
}

function createProductionSqlHandler(queryLog) {
  return ({sql, params, writerId, operation}) => {
    const normalized = normalizeSql(sql);
    queryLog.push({writerId, sql: normalized, params: Array.isArray(params) ? params.slice() : params});

    if (/^SELECT revision AS storeRevision FROM auth_store_revisions WHERE scope_key = 'auth' FOR UPDATE$/i.test(normalized)) {
      requiredParams(params, 0, sql);
      return operation.selectForUpdate("auth_store_revisions", "auth");
    }

    const revisionUpdate = normalized.match(
      /^UPDATE auth_store_revisions SET revision = revision \+ 1 WHERE scope_key = 'auth' AND revision = (\d+)$/i,
    );
    if (revisionUpdate) {
      requiredParams(params, 0, sql);
      const expectedRevision = Number(revisionUpdate[1]);
      return operation.update("auth_store_revisions", "auth", {
        where: {scope_key: "auth", revision: expectedRevision},
        set: {revision: expectedRevision + 1},
      });
    }

    if (/^SELECT account_id, player_id, profile_revision FROM profile_bindings WHERE account_id = \? FOR UPDATE$/i.test(normalized)) {
      const [accountId] = requiredParams(params, 1, sql);
      return operation.selectForUpdate("profile_bindings", String(accountId));
    }

    if (/^SELECT player_id, account_id, profile_revision FROM profiles WHERE player_id = \? FOR UPDATE$/i.test(normalized)) {
      const [playerId] = requiredParams(params, 1, sql);
      return operation.selectForUpdate("profiles", String(playerId));
    }

    if (/^UPDATE profile_bindings SET player_id = \?, profile_revision = \?, updated_at = \?, document_json = CAST\(\? AS JSON\) WHERE account_id = \? AND player_id = \? AND profile_revision = \?$/i.test(normalized)) {
      const [playerId, nextRevision, updatedAt, documentJson, accountId, expectedPlayerId, expectedRevision]
        = requiredParams(params, 7, sql);
      return operation.update("profile_bindings", String(accountId), {
        where: {
          account_id: String(accountId),
          player_id: String(expectedPlayerId),
          profile_revision: Number(expectedRevision),
        },
        set: {
          player_id: String(playerId),
          profile_revision: Number(nextRevision),
          updated_at: String(updatedAt),
          document_json: jsonParameter(documentJson, sql),
        },
      });
    }

    if (/^UPDATE profiles SET account_id = \?, profile_revision = \?, updated_at = \?, profile_json = CAST\(\? AS JSON\) WHERE player_id = \? AND account_id = \? AND profile_revision = \?$/i.test(normalized)) {
      const [accountId, nextRevision, updatedAt, profileJson, playerId, expectedAccountId, expectedRevision]
        = requiredParams(params, 7, sql);
      return operation.update("profiles", String(playerId), {
        where: {
          player_id: String(playerId),
          account_id: String(expectedAccountId),
          profile_revision: Number(expectedRevision),
        },
        set: {
          account_id: String(accountId),
          profile_revision: Number(nextRevision),
          updated_at: String(updatedAt),
          profile_json: jsonParameter(profileJson, sql),
        },
      });
    }

    if (/^INSERT INTO mutation_receipts \(operation_id, request_hash, action_id, account_id, committed_at, expires_at, document_json\) VALUES \(\?, \?, \?, \?, \?, \?, CAST\(\? AS JSON\)\)$/i.test(normalized)) {
      const [operationId, requestHash, actionId, accountId, committedAt, expiresAt, documentJson]
        = requiredParams(params, 7, sql);
      return operation.insert("mutation_receipts", String(operationId), {
        operation_id: String(operationId),
        request_hash: String(requestHash),
        action_id: String(actionId),
        account_id: accountId === null ? null : String(accountId),
        committed_at: String(committedAt),
        expires_at: String(expiresAt),
        document_json: jsonParameter(documentJson, sql),
      });
    }

    return null;
  };
}

function loaderRowsFromSqlSnapshot(snapshot) {
  const rows = [
    ["server_state", "auth", JSON.stringify({schemaVersion: 2, storage: "mysql_entity_tables"})],
    ["store_revision", "auth", String(snapshot.auth_store_revisions.auth.revision)],
  ];
  for (const [accountId, binding] of Object.entries(snapshot.profile_bindings || {})) {
    rows.push(["profile_bindings", accountId, JSON.stringify(binding.document_json)]);
  }
  for (const [playerId, profile] of Object.entries(snapshot.profiles || {})) {
    rows.push(["profiles", playerId, JSON.stringify({
      playerId: profile.player_id,
      accountId: profile.account_id,
      profileRevision: profile.profile_revision,
      updatedAt: profile.updated_at,
      profile: profile.profile_json,
    })]);
  }
  for (const [operationId, receipt] of Object.entries(snapshot.mutation_receipts || {})) {
    rows.push(["mutation_receipts", operationId, JSON.stringify(receipt.document_json)]);
  }
  return rows;
}

function createSharedLoader(tempDir) {
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const statePath = path.join(tempDir, "loader-state.json");
  function writeSnapshot(snapshot) {
    const temporaryPath = `${statePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(loaderRowsFromSqlSnapshot(snapshot)));
    fs.renameSync(temporaryPath, statePath);
  }
  writeSnapshot(sqlSeed());
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  if (stdin.includes("information_schema.tables")) {
    process.stdout.write("1\\n");
    return;
  }
  if (stdin.includes("SELECT 'server_state'")) {
    const rows = JSON.parse(fs.readFileSync(${JSON.stringify(statePath)}, "utf8"));
    process.stdout.write(rows.map((row) => row.join("\\t")).join("\\n") + "\\n");
  }
});
`, {mode: 0o755});
  return {fakeMysqlPath, writeSnapshot};
}

function createProductionStore(fakeMysqlPath, pool) {
  return createMysqlAuthStore({
    mysqlPath: fakeMysqlPath,
    host: "127.0.0.1",
    port: 3306,
    user: "tester",
    password: "dummy",
    database: "beastbound_shared_transaction_test",
    createDatabase: false,
    ensureSchema: false,
    usePool: true,
    poolFactory: () => pool,
  });
}

function isGlobalRevisionConflict(error) {
  return Boolean(error && error.code === "mysql_store_revision_conflict");
}

test("two production stores overlap: the global fence commits A and rejects stale B before business SQL", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-store-"));
  const queryLog = [];
  const loader = createSharedLoader(tempDir);
  const harness = createSharedMysqlTransactionHarness({
    seed: sqlSeed(),
    statementHandler: createProductionSqlHandler(queryLog),
    onCommittedSnapshot(snapshot) {
      loader.writeSnapshot(snapshot);
    },
  });
  const storeA = createProductionStore(loader.fakeMysqlPath, harness.poolFor("node_a"));
  const storeB = createProductionStore(loader.fakeMysqlPath, harness.poolFor("node_b"));
  const gateA = harness.blockNext({writerId: "node_a", phase: "before_commit_apply"});
  let settledPromise = null;

  try {
    const loadedA = storeA.load();
    const loadedB = storeB.load();
    assert.deepEqual(loadedA.profileBindings, loadedB.profileBindings, "both stores must load one baseline");
    assert.deepEqual(loadedA.profiles, loadedB.profiles, "both stores must load one baseline");

    const saveA = storeA.saveAsync(nextProfileAuthority(loadedA, {
      stoneCoins: 90,
      operationId: "op_shared_node_a",
      requestHash: "a".repeat(64),
    }));
    await gateA.entered;

    const saveB = storeB.saveAsync(nextProfileAuthority(loadedB, {
      stoneCoins: 80,
      operationId: "op_shared_node_b",
      requestHash: "b".repeat(64),
    }));
    settledPromise = Promise.allSettled([saveA, saveB]);
    await harness.waitForEvent({
      type: "lock_wait",
      writerId: "node_b",
      table: "auth_store_revisions",
      key: "auth",
    });

    const bWhileWaiting = queryLog.filter((entry) => entry.writerId === "node_b");
    assert.equal(bWhileWaiting.length, 1);
    assert.match(bWhileWaiting[0].sql, /^SELECT revision AS storeRevision FROM auth_store_revisions/i);
    assert.equal(
      harness.events().some((event) => event.type === "write_staged" && event.writerId === "node_b"),
      false,
      "the stale store must not stage any profile or receipt write while waiting on the global fence",
    );

    gateA.release();
    const [resultA, resultB] = await settledPromise;
    assert.equal(resultA.status, "fulfilled");
    assert.equal(resultB.status, "rejected");
    assert.equal(isGlobalRevisionConflict(resultB.reason), true);

    const committed = harness.snapshot();
    assert.equal(committed.auth_store_revisions.auth.revision, 1);
    assert.equal(committed.profile_bindings[ACCOUNT_ID].profile_revision, 2);
    assert.equal(committed.profiles[PLAYER_ID].profile_revision, 2);
    assert.equal(committed.profiles[PLAYER_ID].profile_json.stoneCoins, 90);
    assert.equal(committed.mutation_receipts.op_shared_node_a.document_json.operationId, "op_shared_node_a");
    assert.equal(Object.hasOwn(committed.mutation_receipts, "op_shared_node_b"), false);
    assert.equal(queryLog.filter((entry) => entry.writerId === "node_b").length, 1);
    assert.equal(
      harness.events().some((event) => event.type === "rollback_applied" && event.writerId === "node_b"),
      true,
    );

    const reloadedB = storeB.load();
    assert.equal(reloadedB.profileBindings[ACCOUNT_ID].profileRevision, 2);
    assert.equal(reloadedB.profiles[PLAYER_ID].profileRevision, 2);
    assert.equal(reloadedB.profiles[PLAYER_ID].profile.stoneCoins, 90);
    assert.equal(reloadedB.mutationReceipts.op_shared_node_a.operationId, "op_shared_node_a");

    await storeB.saveAsync(nextProfileAuthority(reloadedB, {
      stoneCoins: 80,
      operationId: "op_shared_node_b",
      requestHash: "b".repeat(64),
      updatedAt: UPDATED_AT_3,
    }));
    const retried = harness.snapshot();
    assert.equal(retried.auth_store_revisions.auth.revision, 2);
    assert.equal(retried.profile_bindings[ACCOUNT_ID].profile_revision, 3);
    assert.equal(retried.profiles[PLAYER_ID].profile_revision, 3);
    assert.equal(retried.profiles[PLAYER_ID].profile_json.stoneCoins, 80);
    assert.equal(retried.mutation_receipts.op_shared_node_a.document_json.operationId, "op_shared_node_a");
    assert.equal(retried.mutation_receipts.op_shared_node_b.document_json.operationId, "op_shared_node_b");
  } finally {
    gateA.release();
    if (settledPromise !== null) {
      await settledPromise;
    }
    await Promise.allSettled([storeA.close(), storeB.close()]);
    fs.rmSync(tempDir, {recursive: true, force: true});
  }

  assert.equal(harness.assertIdle(), true);
});

test("one production store persists the conditional profile update through the shared harness", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-store-single-"));
  const queryLog = [];
  const harness = createSharedMysqlTransactionHarness({
    seed: sqlSeed(),
    statementHandler: createProductionSqlHandler(queryLog),
  });
  const loader = createSharedLoader(tempDir);
  const store = createProductionStore(loader.fakeMysqlPath, harness.poolFor("single_node"));

  try {
    const loaded = store.load();
    await store.saveAsync(nextProfileAuthority(loaded, {stoneCoins: 91}));

    const committed = harness.snapshot();
    assert.equal(committed.auth_store_revisions.auth.revision, 1);
    assert.equal(committed.profile_bindings[ACCOUNT_ID].profile_revision, 2);
    assert.equal(committed.profiles[PLAYER_ID].profile_revision, 2);
    assert.equal(committed.profiles[PLAYER_ID].profile_json.stoneCoins, 91);
    assert.deepEqual(committed.mutation_receipts, {});
    assert.equal(
      queryLog.some((entry) => /^UPDATE profile_bindings\b/i.test(entry.sql)),
      true,
    );
    assert.equal(
      queryLog.some((entry) => /^UPDATE profiles\b/i.test(entry.sql)),
      true,
    );
  } finally {
    await store.close();
    fs.rmSync(tempDir, {recursive: true, force: true});
  }

  assert.equal(harness.assertIdle(), true);
});

test("duplicate receipt rolls staged binding and profile writes back in the shared committed snapshot", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-store-rollback-"));
  const operationId = "op_shared_duplicate";
  const duplicateReceipt = {
    schemaVersion: 1,
    operationId,
    requestHash: "d".repeat(64),
    actionId: "profile_action",
    accountId: ACCOUNT_ID,
    committedAt: UPDATED_AT_1,
    expiresAt: "2026-07-17T02:00:00.000Z",
    response: {ok: true, operationId},
  };
  const seed = sqlSeed({
    mutationReceipts: {
      [operationId]: {
        operation_id: operationId,
        request_hash: duplicateReceipt.requestHash,
        action_id: duplicateReceipt.actionId,
        account_id: duplicateReceipt.accountId,
        committed_at: duplicateReceipt.committedAt,
        expires_at: duplicateReceipt.expiresAt,
        document_json: duplicateReceipt,
      },
    },
  });
  const queryLog = [];
  const harness = createSharedMysqlTransactionHarness({
    seed,
    statementHandler: createProductionSqlHandler(queryLog),
  });
  const loader = createSharedLoader(tempDir);
  const store = createProductionStore(loader.fakeMysqlPath, harness.poolFor("rollback_node"));

  try {
    const loaded = store.load();
    await assert.rejects(
      store.saveAsync(nextProfileAuthority(loaded, {
        stoneCoins: 75,
        operationId,
        requestHash: "e".repeat(64),
      })),
      (error) => error && error.code === "mysql_resource_revision_conflict",
    );
    assert.deepEqual(harness.snapshot(), seed);
    assert.equal(
      harness.events().filter((event) => event.type === "write_staged" && event.writerId === "rollback_node").length,
      2,
      "binding and profile writes must be staged before the duplicate receipt fails",
    );
    assert.equal(
      harness.events().some((event) => event.type === "rollback_applied" && event.writerId === "rollback_node"),
      true,
    );
  } finally {
    await store.close();
    fs.rmSync(tempDir, {recursive: true, force: true});
  }

  assert.equal(harness.assertIdle(), true);
});
