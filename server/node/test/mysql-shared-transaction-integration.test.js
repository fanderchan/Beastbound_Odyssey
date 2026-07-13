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
} = require("../test-support/shared-mysql-transaction-harness");

const ACTORS = Object.freeze({
  a: Object.freeze({accountId: "acc_shared_mysql_a", playerId: "player_shared_mysql_a", name: "并行猎人甲"}),
  b: Object.freeze({accountId: "acc_shared_mysql_b", playerId: "player_shared_mysql_b", name: "并行猎人乙"}),
});
const UPDATED_AT_1 = "2026-07-14T02:00:00.000Z";
const UPDATED_AT_2 = "2026-07-14T02:01:00.000Z";
const UPDATED_AT_3 = "2026-07-14T02:02:00.000Z";
const UPDATED_AT_4 = "2026-07-14T02:03:00.000Z";

function baselineAuthority() {
  const authority = {
    schemaVersion: 1,
    accounts: {},
    sessions: {},
    profileBindings: {},
    profiles: {},
    mutationReceipts: {},
    mailMessages: {},
    marketListings: {},
    consumedEquipmentEnvelopes: {},
    marketConfig: {taxRate: 0.05},
    serviceEventSeq: 0,
    serviceEvents: [],
  };
  for (const actor of Object.values(ACTORS)) {
    authority.profileBindings[actor.accountId] = {
      accountId: actor.accountId,
      playerId: actor.playerId,
      profileRevision: 1,
      updatedAt: UPDATED_AT_1,
    };
    authority.profiles[actor.playerId] = {
      playerId: actor.playerId,
      accountId: actor.accountId,
      profileRevision: 1,
      updatedAt: UPDATED_AT_1,
      profile: {
        displayName: actor.name,
        stoneCoins: actor === ACTORS.a ? 100 : 200,
      },
    };
  }
  return authority;
}

function nextProfileAuthority(before, actorKey, options = {}) {
  const actor = ACTORS[actorKey];
  const after = cloneAuthorityRoot(before);
  const nextRevision = Number(before.profileBindings[actor.accountId].profileRevision) + 1;
  const updatedAt = String(options.updatedAt || UPDATED_AT_2);
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
      ...before.profiles[actor.playerId].profile,
      stoneCoins: Number(options.stoneCoins),
    },
  };
  if (options.operationId) {
    const operationId = String(options.operationId);
    after.mutationReceipts = stageDurableMutationReceipt(
      after.mutationReceipts,
      {
        schemaVersion: 1,
        operationId,
        requestHash: String(options.requestHash),
        actionId: "record_point_save",
        accountId: actor.accountId,
        committedAt: updatedAt,
        expiresAt: "2026-07-17T02:10:00.000Z",
        response: {ok: true, operationId},
      },
      {nowMs: Date.parse(updatedAt)},
    );
  }
  return after;
}

function profileSaveOptions(actorKey, operationId, requestHash) {
  const actor = ACTORS[actorKey];
  return {
    consistencyScope: {
      kind: "row_local_profile_v1",
      accountId: actor.accountId,
      playerId: actor.playerId,
      operationId,
      requestHash,
      actionId: "record_point_save",
    },
  };
}

function stagedProfileSave(store, before, actorKey, options) {
  const after = nextProfileAuthority(before, actorKey, options);
  const saveOptions = profileSaveOptions(actorKey, options.operationId, options.requestHash);
  return {after, promise: store.saveAsync(after, saveOptions)};
}

function legacyMarketAuthority(before) {
  const after = cloneAuthorityRoot(before);
  after.marketConfig = {...before.marketConfig, taxRate: 0.07};
  return after;
}

function sqlSeed(options = {}) {
  const authority = baselineAuthority();
  const profileBindings = {};
  const profiles = {};
  for (const actor of Object.values(ACTORS)) {
    profileBindings[actor.accountId] = {
      account_id: actor.accountId,
      player_id: actor.playerId,
      profile_revision: 1,
      updated_at: UPDATED_AT_1,
      document_json: authority.profileBindings[actor.accountId],
    };
    profiles[actor.playerId] = {
      player_id: actor.playerId,
      account_id: actor.accountId,
      profile_revision: 1,
      updated_at: UPDATED_AT_1,
      profile_json: authority.profiles[actor.playerId].profile,
    };
  }
  return {
    auth_store_revisions: {
      auth: {scope_key: "auth", revision: 0},
    },
    server_state: {
      auth: {
        scope_key: "auth",
        document_json: {schemaVersion: 2, storage: "mysql_entity_tables", marketConfig: authority.marketConfig},
      },
    },
    profile_bindings: profileBindings,
    profiles,
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

    if (/^SELECT revision AS storeRevision FROM auth_store_revisions WHERE scope_key = 'auth' FOR SHARE$/i.test(normalized)) {
      requiredParams(params, 0, sql);
      return operation.selectForShare("auth_store_revisions", "auth");
    }
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

    if (/^SELECT account_id, player_id, profile_revision FROM profile_bindings ORDER BY account_id FOR UPDATE$/i.test(normalized)) {
      requiredParams(params, 0, sql);
      return operation.selectAllForUpdate("profile_bindings");
    }
    if (/^SELECT player_id, account_id, profile_revision FROM profiles ORDER BY player_id FOR UPDATE$/i.test(normalized)) {
      requiredParams(params, 0, sql);
      return operation.selectAllForUpdate("profiles");
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

    if (/^INSERT INTO server_state \(state_key, document_json\) VALUES \('auth', CAST\(.+ AS JSON\)\) ON DUPLICATE KEY UPDATE document_json = VALUES\(document_json\)$/i.test(normalized)) {
      requiredParams(params, 0, sql);
      return operation.update("server_state", "auth", {
        where: {scope_key: "auth"},
        set: {document_json: {schemaVersion: 2, storage: "mysql_entity_tables", marketConfig: {taxRate: 0.07}}},
      });
    }

    return null;
  };
}

function loaderRowsFromSqlSnapshot(snapshot) {
  const serverState = snapshot.server_state && snapshot.server_state.auth
    ? snapshot.server_state.auth.document_json
    : {schemaVersion: 2, storage: "mysql_entity_tables"};
  const rows = [
    ["server_state", "auth", JSON.stringify(serverState)],
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

function createSharedLoader(tempDir, initialSeed = sqlSeed()) {
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const statePath = path.join(tempDir, "loader-state.json");
  function writeSnapshot(snapshot) {
    const temporaryPath = `${statePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(loaderRowsFromSqlSnapshot(snapshot)));
    fs.renameSync(temporaryPath, statePath);
  }
  writeSnapshot(initialSeed);
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

function isResourceConflict(error) {
  return Boolean(error && error.code === "mysql_resource_revision_conflict");
}

function isGlobalConflict(error) {
  return Boolean(error && error.code === "mysql_store_revision_conflict");
}

test("different profiles truly overlap, retain both winners, and keep Node-local baselines row-local", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-different-"));
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
  void gateA.entered.catch(() => {});
  let saveA = null;

  try {
    const loadedA = storeA.load();
    const loadedB = storeB.load();
    const stagedA = stagedProfileSave(storeA, loadedA, "a", {
      stoneCoins: 90,
      operationId: "op_parallel_a_1_x",
      requestHash: "a".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    saveA = stagedA.promise;
    await gateA.entered;

    const stagedB = stagedProfileSave(storeB, loadedB, "b", {
      stoneCoins: 190,
      operationId: "op_parallel_b_1_x",
      requestHash: "b".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    await harness.waitForEvent({type: "commit_completed", writerId: "node_b"});
    await stagedB.promise;

    const whileABlocked = harness.snapshot();
    assert.equal(whileABlocked.profiles[ACTORS.a.playerId].profile_revision, 1);
    assert.equal(whileABlocked.profiles[ACTORS.b.playerId].profile_revision, 2);
    assert.equal(
      harness.events().some((event) => (
        event.type === "lock_wait"
        && event.writerId === "node_b"
        && event.table === "auth_store_revisions"
      )),
      false,
      "different profile writers must share the compatibility barrier",
    );

    gateA.release();
    await saveA;
    saveA = null;

    const committed = harness.snapshot();
    assert.equal(committed.auth_store_revisions.auth.revision, 0);
    assert.equal(committed.profiles[ACTORS.a.playerId].profile_revision, 2);
    assert.equal(committed.profiles[ACTORS.a.playerId].profile_json.stoneCoins, 90);
    assert.equal(committed.profiles[ACTORS.b.playerId].profile_revision, 2);
    assert.equal(committed.profiles[ACTORS.b.playerId].profile_json.stoneCoins, 190);
    assert.equal(committed.mutation_receipts.op_parallel_a_1_x.document_json.operationId, "op_parallel_a_1_x");
    assert.equal(committed.mutation_receipts.op_parallel_b_1_x.document_json.operationId, "op_parallel_b_1_x");

    const stagedA2 = stagedProfileSave(storeA, stagedA.after, "a", {
      stoneCoins: 80,
      operationId: "op_parallel_a_2_x",
      requestHash: "c".repeat(64),
      updatedAt: UPDATED_AT_3,
    });
    await stagedA2.promise;
    assert.equal(harness.snapshot().profiles[ACTORS.a.playerId].profile_revision, 3);

    const staleB = stagedProfileSave(storeA, stagedA2.after, "b", {
      stoneCoins: 180,
      operationId: "op_parallel_b_stale",
      requestHash: "d".repeat(64),
      updatedAt: UPDATED_AT_4,
    });
    await assert.rejects(staleB.promise, isResourceConflict);
    assert.equal(harness.snapshot().profiles[ACTORS.b.playerId].profile_json.stoneCoins, 190);

    const reloadedA = storeA.load();
    const retriedB = stagedProfileSave(storeA, reloadedA, "b", {
      stoneCoins: 180,
      operationId: "op_parallel_b_retry",
      requestHash: "e".repeat(64),
      updatedAt: UPDATED_AT_4,
    });
    await retriedB.promise;
    const retried = harness.snapshot();
    assert.equal(retried.profiles[ACTORS.a.playerId].profile_revision, 3);
    assert.equal(retried.profiles[ACTORS.b.playerId].profile_revision, 3);
    assert.equal(retried.profiles[ACTORS.b.playerId].profile_json.stoneCoins, 180);
  } finally {
    gateA.release();
    if (saveA !== null) {
      await Promise.allSettled([saveA]);
    }
    await Promise.allSettled([storeA.close(), storeB.close()]);
    fs.rmSync(tempDir, {recursive: true, force: true});
  }

  assert.equal(harness.assertIdle(), true);
});

test("same profile waits on its binding lock and exactly one conditional writer wins", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-same-"));
  const queryLog = [];
  const loader = createSharedLoader(tempDir);
  const harness = createSharedMysqlTransactionHarness({
    seed: sqlSeed(),
    statementHandler: createProductionSqlHandler(queryLog),
    onCommittedSnapshot(snapshot) {
      loader.writeSnapshot(snapshot);
    },
  });
  const storeA = createProductionStore(loader.fakeMysqlPath, harness.poolFor("same_a"));
  const storeB = createProductionStore(loader.fakeMysqlPath, harness.poolFor("same_b"));
  const gateA = harness.blockNext({writerId: "same_a", phase: "before_commit_apply"});
  void gateA.entered.catch(() => {});
  let settled = null;

  try {
    const loadedA = storeA.load();
    const loadedB = storeB.load();
    const first = stagedProfileSave(storeA, loadedA, "a", {
      stoneCoins: 91,
      operationId: "op_same_a_writer_x",
      requestHash: "1".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    await gateA.entered;
    const second = stagedProfileSave(storeB, loadedB, "a", {
      stoneCoins: 92,
      operationId: "op_same_b_writer_x",
      requestHash: "2".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    settled = Promise.allSettled([first.promise, second.promise]);
    await harness.waitForEvent({
      type: "lock_wait",
      writerId: "same_b",
      table: "profile_bindings",
      key: ACTORS.a.accountId,
    });
    gateA.release();

    const [firstResult, secondResult] = await settled;
    assert.equal(firstResult.status, "fulfilled");
    assert.equal(secondResult.status, "rejected");
    assert.equal(isResourceConflict(secondResult.reason), true);
    const committed = harness.snapshot();
    assert.equal(committed.auth_store_revisions.auth.revision, 0);
    assert.equal(committed.profiles[ACTORS.a.playerId].profile_revision, 2);
    assert.equal(committed.profiles[ACTORS.a.playerId].profile_json.stoneCoins, 91);
    assert.equal(Object.hasOwn(committed.mutation_receipts, "op_same_a_writer_x"), true);
    assert.equal(Object.hasOwn(committed.mutation_receipts, "op_same_b_writer_x"), false);
  } finally {
    gateA.release();
    if (settled !== null) {
      await settled;
    }
    await Promise.allSettled([storeA.close(), storeB.close()]);
    fs.rmSync(tempDir, {recursive: true, force: true});
  }

  assert.equal(harness.assertIdle(), true);
});

test("legacy fallback validates the full profile read-set even when it writes only another profile", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-legacy-readset-"));
  const queryLog = [];
  const loader = createSharedLoader(tempDir);
  const harness = createSharedMysqlTransactionHarness({
    seed: sqlSeed(),
    statementHandler: createProductionSqlHandler(queryLog),
    onCommittedSnapshot(snapshot) {
      loader.writeSnapshot(snapshot);
    },
  });
  const profileStore = createProductionStore(loader.fakeMysqlPath, harness.poolFor("profile_b"));
  const legacyStore = createProductionStore(loader.fakeMysqlPath, harness.poolFor("legacy_a"));

  try {
    const loadedProfile = profileStore.load();
    const staleLegacy = legacyStore.load();
    const profileWrite = stagedProfileSave(profileStore, loadedProfile, "b", {
      stoneCoins: 175,
      operationId: "op_readset_b_writer",
      requestHash: "3".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    await profileWrite.promise;

    const legacyCandidate = nextProfileAuthority(staleLegacy, "a", {
      stoneCoins: 75,
      operationId: "op_legacy_a_writer",
      requestHash: "4".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    await assert.rejects(legacyStore.saveAsync(legacyCandidate), isResourceConflict);

    const committed = harness.snapshot();
    assert.equal(committed.auth_store_revisions.auth.revision, 0);
    assert.equal(committed.profiles[ACTORS.a.playerId].profile_revision, 1);
    assert.equal(committed.profiles[ACTORS.b.playerId].profile_revision, 2);
    const legacyQueries = queryLog.filter((entry) => entry.writerId === "legacy_a");
    assert.match(legacyQueries[0].sql, /FOR UPDATE$/i);
    assert.match(legacyQueries[1].sql, /profile_bindings ORDER BY account_id FOR UPDATE$/i);
    assert.equal(
      legacyQueries.some((entry) => /^INSERT INTO profile_bindings\b/i.test(entry.sql)),
      false,
      "all guards must pass before any legacy business SQL executes",
    );
  } finally {
    await Promise.allSettled([profileStore.close(), legacyStore.close()]);
    fs.rmSync(tempDir, {recursive: true, force: true});
  }

  assert.equal(harness.assertIdle(), true);
});

test("legacy exclusive commit makes a waiting profile writer fail at the global barrier before row locks", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-legacy-first-"));
  const queryLog = [];
  const loader = createSharedLoader(tempDir);
  const harness = createSharedMysqlTransactionHarness({
    seed: sqlSeed(),
    statementHandler: createProductionSqlHandler(queryLog),
    onCommittedSnapshot(snapshot) {
      loader.writeSnapshot(snapshot);
    },
  });
  const legacyStore = createProductionStore(loader.fakeMysqlPath, harness.poolFor("legacy_first"));
  const profileStore = createProductionStore(loader.fakeMysqlPath, harness.poolFor("profile_waiter"));
  const legacyGate = harness.blockNext({writerId: "legacy_first", phase: "before_commit_apply"});
  void legacyGate.entered.catch(() => {});
  let settled = null;

  try {
    const legacyLoaded = legacyStore.load();
    const profileLoaded = profileStore.load();
    const legacySave = legacyStore.saveAsync(legacyMarketAuthority(legacyLoaded));
    await legacyGate.entered;
    const profileWrite = stagedProfileSave(profileStore, profileLoaded, "a", {
      stoneCoins: 70,
      operationId: "op_waits_for_legacy",
      requestHash: "5".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    settled = Promise.allSettled([legacySave, profileWrite.promise]);
    await harness.waitForEvent({
      type: "lock_wait",
      writerId: "profile_waiter",
      table: "auth_store_revisions",
      key: "auth",
    });
    legacyGate.release();

    const [legacyResult, profileResult] = await settled;
    assert.equal(legacyResult.status, "fulfilled");
    assert.equal(profileResult.status, "rejected");
    assert.equal(isGlobalConflict(profileResult.reason), true);
    const committed = harness.snapshot();
    assert.equal(committed.auth_store_revisions.auth.revision, 1);
    assert.equal(committed.profiles[ACTORS.a.playerId].profile_revision, 1);
    const profileQueries = queryLog.filter((entry) => entry.writerId === "profile_waiter");
    assert.equal(profileQueries.length, 1);
    assert.match(profileQueries[0].sql, /FOR SHARE$/i);
  } finally {
    legacyGate.release();
    if (settled !== null) {
      await settled;
    }
    await Promise.allSettled([legacyStore.close(), profileStore.close()]);
    fs.rmSync(tempDir, {recursive: true, force: true});
  }

  assert.equal(harness.assertIdle(), true);
});

test("duplicate receipt rolls conditional binding and profile writes back without advancing global revision", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-shared-duplicate-"));
  const operationId = "op_shared_duplicate";
  const duplicateReceipt = {
    schemaVersion: 1,
    operationId,
    requestHash: "6".repeat(64),
    actionId: "record_point_save",
    accountId: ACTORS.a.accountId,
    committedAt: UPDATED_AT_1,
    expiresAt: "2026-07-17T02:10:00.000Z",
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
  const loader = createSharedLoader(tempDir);
  const harness = createSharedMysqlTransactionHarness({
    seed,
    statementHandler: createProductionSqlHandler(queryLog),
  });
  const store = createProductionStore(loader.fakeMysqlPath, harness.poolFor("duplicate_node"));

  try {
    const loaded = store.load();
    const staged = stagedProfileSave(store, loaded, "a", {
      stoneCoins: 65,
      operationId,
      requestHash: "7".repeat(64),
      updatedAt: UPDATED_AT_2,
    });
    await assert.rejects(staged.promise, isResourceConflict);
    assert.deepEqual(harness.snapshot(), seed);
    assert.equal(
      harness.events().filter((event) => event.type === "write_staged" && event.writerId === "duplicate_node").length,
      2,
    );
    assert.equal(
      harness.events().some((event) => event.type === "rollback_applied" && event.writerId === "duplicate_node"),
      true,
    );
  } finally {
    await store.close();
    fs.rmSync(tempDir, {recursive: true, force: true});
  }

  assert.equal(harness.assertIdle(), true);
});
