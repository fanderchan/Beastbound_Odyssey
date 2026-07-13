"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {cloneAuthorityRoot} = require("../src/auth/authority-root-clone");
const {createAuthService} = require("../src/auth-service");
const {
  canonicalDurableMutationReceipts,
  commitDurableMutationReceiptDelta,
  stageDurableMutationReceipt,
} = require("../src/auth/durable-mutation-state");
const mysqlStoreModule = require("../src/mysql-store");

const {
  createMysqlAuthStore,
  __buildMysqlSavePlanFromPersistentDataForTest,
} = mysqlStoreModule;

const ACCOUNT_ID = "acc_profile_conditional";
const PLAYER_ID = "player_profile_conditional";
const UPDATED_AT_1 = "2026-07-14T01:00:00.000Z";
const UPDATED_AT_2 = "2026-07-14T01:01:00.000Z";

function profileState(options = {}) {
  const revision = Number(options.revision ?? 1);
  const accountId = String(options.accountId || ACCOUNT_ID);
  const playerId = String(options.playerId || PLAYER_ID);
  const updatedAt = String(options.updatedAt || UPDATED_AT_1);
  return {
    schemaVersion: 1,
    accounts: {},
    sessions: {},
    profileBindings: {
      [accountId]: {
        accountId,
        playerId,
        profileRevision: revision,
        updatedAt,
      },
    },
    profiles: {
      [playerId]: {
        playerId,
        accountId,
        profileRevision: revision,
        updatedAt,
        profile: {
          displayName: String(options.displayName || "条件存档猎人"),
          stoneCoins: Number(options.stoneCoins ?? 100),
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

function nextProfileState(before, options = {}) {
  const after = cloneAuthorityRoot(before);
  const beforeBinding = before.profileBindings[ACCOUNT_ID];
  const beforeProfile = before.profiles[PLAYER_ID];
  const revision = Number(options.revision ?? (Number(beforeBinding.profileRevision) + 1));
  const updatedAt = String(options.updatedAt || UPDATED_AT_2);
  after.profileBindings[ACCOUNT_ID] = {
    ...beforeBinding,
    profileRevision: revision,
    updatedAt,
  };
  after.profiles[PLAYER_ID] = {
    ...beforeProfile,
    profileRevision: revision,
    updatedAt,
    profile: {
      ...beforeProfile.profile,
      stoneCoins: Number(options.stoneCoins ?? 90),
    },
  };
  if (options.receipt === true) {
    after.mutationReceipts = stageDurableMutationReceipt(
      after.mutationReceipts,
      mutationReceipt(options.operationId || "op_profile_conditional_0001"),
      {nowMs: Date.parse("2026-07-14T01:01:00.000Z")},
    );
  }
  return after;
}

function mutationReceipt(operationId) {
  return {
    schemaVersion: 1,
    operationId,
    requestHash: "a".repeat(64),
    actionId: "profile_action",
    accountId: ACCOUNT_ID,
    committedAt: "2026-07-14T01:01:00.000Z",
    expiresAt: "2026-07-17T01:01:00.000Z",
    response: {ok: true, operationId},
  };
}

function buildPlan(after, before) {
  assert.equal(
    typeof __buildMysqlSavePlanFromPersistentDataForTest,
    "function",
    "mysql-store must expose the pure P0.6d-2a planner test hook",
  );
  return __buildMysqlSavePlanFromPersistentDataForTest(after, before);
}

function operationResource(operation) {
  return String(operation && (operation.resource || operation.resourceType) || "");
}

function planOperations(plan, field) {
  return Array.isArray(plan && plan[field]) ? plan[field] : [];
}

test("planner selects the conditional path only for one existing bound profile r to r+1", () => {
  const before = profileState();
  const plan = buildPlan(nextProfileState(before), before);

  assert.equal(plan.kind, "profile_conditional_v1");
  assert.equal(plan.globalRevisionFence, true);
  assert.equal(plan.accountId, ACCOUNT_ID);
  assert.equal(plan.playerId, PLAYER_ID);
  assert.equal(plan.expectedProfileRevision, 1);
  assert.equal(plan.nextProfileRevision, 2);
  assert.deepEqual(
    planOperations(plan, "locks").map(operationResource),
    ["profile_binding", "profile"],
  );
  const writes = planOperations(plan, "writes");
  assert.deepEqual(writes.map(operationResource), ["profile_binding", "profile"]);
  assert.equal(writes.every((operation) => operation.expectedAffectedRows === 1), true);
  assert.match(String(writes[0].sql || ""), /^UPDATE profile_bindings\b/i);
  assert.match(String(writes[0].sql || ""), /WHERE[\s\S]+account_id[\s\S]+player_id[\s\S]+profile_revision/i);
  assert.match(String(writes[1].sql || ""), /^UPDATE profiles\b/i);
  assert.match(String(writes[1].sql || ""), /WHERE[\s\S]+player_id[\s\S]+account_id[\s\S]+profile_revision/i);
  assert.equal(writes.some((operation) => /ON DUPLICATE KEY/i.test(String(operation.sql || ""))), false);
});

test("planner permits exactly one new immutable receipt on the conditional profile path", () => {
  const before = profileState();
  const plan = buildPlan(nextProfileState(before, {receipt: true}), before);

  assert.equal(plan.kind, "profile_conditional_v1");
  assert.equal(plan.globalRevisionFence, true);
  const receiptWrites = planOperations(plan, "writes").filter((operation) => (
    operationResource(operation) === "mutation_receipt"
  ));
  assert.equal(receiptWrites.length, 1);
  assert.equal(receiptWrites[0].expectedAffectedRows, 1);
  assert.match(String(receiptWrites[0].sql || ""), /^INSERT INTO mutation_receipts\b/i);
  assert.doesNotMatch(String(receiptWrites[0].sql || ""), /ON DUPLICATE KEY UPDATE/i);
  assert.equal(
    [...planOperations(plan, "locks"), ...planOperations(plan, "writes")]
      .some((operation) => /\bserver_state\b/i.test(String(operation.sql || ""))),
    false,
    "receipt count metadata must not put a full server_state document on the conditional fast path",
  );
  assert.equal(Array.isArray(plan.statements), false);
});

test("real record_point_save produces the strict profile plus receipt conditional plan", async () => {
  let committedPersistentData = null;
  let latestPlan = null;
  const service = createAuthService({
    store: {
      load() {
        return committedPersistentData === null ? {} : cloneAuthorityRoot(committedPersistentData);
      },
      save(nextData) {
        if (committedPersistentData !== null) {
          latestPlan = buildPlan(nextData, committedPersistentData);
        }
        const committed = cloneAuthorityRoot(nextData);
        committed.mutationReceipts = commitDurableMutationReceiptDelta(
          canonicalDurableMutationReceipts(committed.mutationReceipts),
        );
        committedPersistentData = committed;
      },
    },
  });
  const registered = service.register({
    username: "conditionalrecord",
    password: "test1234",
    displayName: "条件记录点猎人",
  });
  assert.equal(registered.ok, true);
  const operationId = "op_record_point_conditional_0001";
  const saved = await service.invokeDurable("profileAction", [registered.session.token, {
    action: "record_point_save",
    payload: {
      recordPoint: {mapId: "firebud_training_yard", spawnName: "yard", label: "训练场"},
    },
  }], {
    operationId,
    actionId: "POST /profile/action",
    requestHash: "b".repeat(64),
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.profile.recordPoint.mapId, "firebud_training_yard");

  assert.equal(latestPlan.kind, "profile_conditional_v1");
  assert.deepEqual(
    latestPlan.writes.map(operationResource),
    ["profile_binding", "profile", "mutation_receipt"],
  );
  assert.equal(latestPlan.writes[2].key, operationId);
});

test("planner rejects unsafe or broader mutations to the legacy global-CAS path", async (t) => {
  const cases = [
    {
      name: "revision jump",
      mutate(before) {
        return nextProfileState(before, {revision: 3});
      },
    },
    {
      name: "binding and profile revision disagree",
      mutate(before) {
        const after = nextProfileState(before);
        after.profileBindings[ACCOUNT_ID] = {...after.profileBindings[ACCOUNT_ID], profileRevision: 3};
        return after;
      },
    },
    {
      name: "identity moves to another player",
      mutate(before) {
        const after = nextProfileState(before);
        after.profileBindings[ACCOUNT_ID] = {...after.profileBindings[ACCOUNT_ID], playerId: "player_moved"};
        return after;
      },
    },
    {
      name: "profile is newly created",
      mutate(before) {
        const after = nextProfileState(before);
        delete before.profiles[PLAYER_ID];
        return after;
      },
    },
    {
      name: "profile is deleted",
      mutate(before) {
        const after = nextProfileState(before);
        delete after.profiles[PLAYER_ID];
        return after;
      },
    },
    {
      name: "another persistent resource changes",
      mutate(before) {
        const after = nextProfileState(before);
        after.marketListings.listing_extra = {
          listingId: "listing_extra",
          sellerAccountId: ACCOUNT_ID,
          itemId: "item_extra",
          currency: "stone_coin",
          unitPrice: 1,
          count: 1,
          createdAt: UPDATED_AT_2,
        };
        return after;
      },
    },
    {
      name: "root schema version changes",
      mutate(before) {
        const after = nextProfileState(before);
        after.schemaVersion = Number(before.schemaVersion || 0) + 1;
        return after;
      },
    },
    {
      name: "market config changes",
      mutate(before) {
        const after = nextProfileState(before);
        after.marketConfig = {listingFeeRate: 0.03};
        return after;
      },
    },
    {
      name: "offline hang config changes",
      mutate(before) {
        const after = nextProfileState(before);
        after.offlineHangConfig = {rewardRate: 0.5};
        return after;
      },
    },
    {
      name: "service event sequence changes",
      mutate(before) {
        const after = nextProfileState(before);
        after.serviceEventSeq = 2;
        return after;
      },
    },
    {
      name: "service event journal changes",
      mutate(before) {
        const after = nextProfileState(before);
        after.serviceEventSeq = 1;
        after.serviceEvents = [{
          eventSeq: 1,
          eventId: "event_profile_conditional_fallback",
          type: "profile.changed",
          createdAt: UPDATED_AT_2,
          accountId: ACCOUNT_ID,
        }];
        return after;
      },
    },
    {
      name: "two receipts are inserted",
      mutate(before) {
        const after = nextProfileState(before, {receipt: true});
        after.mutationReceipts = stageDurableMutationReceipt(
          after.mutationReceipts,
          mutationReceipt("op_profile_conditional_0002"),
          {nowMs: Date.parse("2026-07-14T01:01:00.000Z")},
        );
        return after;
      },
    },
    {
      name: "expired receipt delete and same-key insert",
      mutate(before) {
        const operationId = "op_profile_conditional_expired";
        before.mutationReceipts = canonicalDurableMutationReceipts({
          [operationId]: {
            ...mutationReceipt(operationId),
            committedAt: "2026-07-01T00:00:00.000Z",
            expiresAt: "2026-07-04T00:00:00.000Z",
            response: {ok: true, generation: 1},
          },
        });
        const after = nextProfileState(before);
        after.mutationReceipts = stageDurableMutationReceipt(
          after.mutationReceipts,
          {
            ...mutationReceipt(operationId),
            requestHash: "b".repeat(64),
            response: {ok: true, generation: 2},
          },
          {nowMs: Date.parse("2026-07-14T01:01:00.000Z")},
        );
        return after;
      },
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, () => {
      const before = profileState();
      const after = fixture.mutate(before);
      const plan = buildPlan(after, before);
      assert.equal(plan.kind, "legacy_global_cas");
      assert.equal(plan.globalRevisionFence, true);
      assert.ok(Array.isArray(plan.statements) && plan.statements.length > 0);
    });
  }
});

function createLoaderFixture(tempDir, options = {}) {
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const revision = Number(options.revision ?? 0);
  const before = profileState();
  const rows = [
    ["server_state", "auth", JSON.stringify({schemaVersion: 2, storage: "mysql_entity_tables"})],
    ["store_revision", "auth", String(revision)],
    ["profile_bindings", ACCOUNT_ID, JSON.stringify(before.profileBindings[ACCOUNT_ID])],
    ["profiles", PLAYER_ID, JSON.stringify(before.profiles[PLAYER_ID])],
  ];
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  if (stdin.includes("information_schema.tables")) {
    process.stdout.write("1\\n");
    return;
  }
  if (stdin.includes("SELECT 'server_state'")) {
    const rows = ${JSON.stringify(rows)};
    process.stdout.write(rows.map((row) => row.join("\\t")).join("\\n") + "\\n");
  }
});
`, {mode: 0o755});
  return {fakeMysqlPath};
}

function createConditionalPool(options = {}) {
  const shared = {
    revision: Number(options.actualStoreRevision ?? 0),
    transactions: [],
  };
  return {
    shared,
    pool: {
      async getConnection() {
        const transaction = {
          begun: false,
          committed: false,
          rolledBack: false,
          released: false,
          queries: [],
        };
        shared.transactions.push(transaction);
        let pendingRevision = null;
        return {
          async beginTransaction() {
            transaction.begun = true;
          },
          async query(statement, params = []) {
            const sql = typeof statement === "string" ? statement : String(statement && statement.sql || "");
            transaction.queries.push({sql, params: Array.isArray(params) ? params.slice() : params});
            if (/SELECT\s+revision\s+AS\s+storeRevision\s+FROM\s+auth_store_revisions[\s\S]+FOR\s+UPDATE/i.test(sql)) {
              assert.deepEqual(params, []);
              return [[{storeRevision: shared.revision}], []];
            }
            if (/SELECT[\s\S]+FROM\s+profile_bindings[\s\S]+FOR\s+UPDATE/i.test(sql)) {
              assert.deepEqual(params, [ACCOUNT_ID]);
              return [[{
                account_id: ACCOUNT_ID,
                player_id: String(options.bindingPlayerId || PLAYER_ID),
                profile_revision: Number(options.bindingLockRevision ?? 1),
              }], []];
            }
            if (/SELECT[\s\S]+FROM\s+profiles[\s\S]+FOR\s+UPDATE/i.test(sql)) {
              assert.deepEqual(params, [PLAYER_ID]);
              return [[{
                player_id: PLAYER_ID,
                account_id: String(options.profileAccountId || ACCOUNT_ID),
                profile_revision: Number(options.profileLockRevision ?? 1),
              }], []];
            }
            if (/^UPDATE\s+profile_bindings\b/i.test(sql.trim())) {
              assert.equal(params.length, 7);
              assert.deepEqual(params.slice(0, 3), [PLAYER_ID, 2, UPDATED_AT_2]);
              assert.deepEqual(params.slice(4), [ACCOUNT_ID, PLAYER_ID, 1]);
              assert.equal(JSON.parse(params[3]).profileRevision, 2);
              return [{affectedRows: Number(options.bindingAffectedRows ?? 1)}, []];
            }
            if (/^UPDATE\s+profiles\b/i.test(sql.trim())) {
              assert.equal(params.length, 7);
              assert.deepEqual(params.slice(0, 3), [ACCOUNT_ID, 2, UPDATED_AT_2]);
              assert.deepEqual(params.slice(4), [PLAYER_ID, ACCOUNT_ID, 1]);
              assert.equal(typeof JSON.parse(params[3]), "object");
              return [{affectedRows: Number(options.profileAffectedRows ?? 1)}, []];
            }
            if (/^INSERT\s+INTO\s+mutation_receipts\b/i.test(sql.trim())) {
              assert.equal(params.length, 7);
              assert.equal(params[2], "profile_action");
              assert.equal(params[3], ACCOUNT_ID);
              assert.equal(JSON.parse(params[6]).operationId, params[0]);
              if (options.receiptDuplicate === true) {
                const error = new Error("Duplicate entry for operation_id");
                error.code = "ER_DUP_ENTRY";
                throw error;
              }
              return [{affectedRows: Number(options.receiptAffectedRows ?? 1)}, []];
            }
            if (/^UPDATE\s+auth_store_revisions\b/i.test(sql.trim())) {
              assert.deepEqual(params, []);
              const expected = Number((sql.match(/AND\s+revision\s*=\s*(\d+)/i) || [])[1] ?? params[0]);
              if (expected !== shared.revision) {
                return [{affectedRows: 0}, []];
              }
              pendingRevision = shared.revision + 1;
              return [{affectedRows: 1}, []];
            }
            const error = new Error(`conditional pool received unmodeled SQL: ${sql}`);
            error.code = "conditional_pool_unknown_sql";
            throw error;
          },
          async commit() {
            if (pendingRevision !== null) {
              shared.revision = pendingRevision;
            }
            transaction.committed = true;
          },
          async rollback() {
            pendingRevision = null;
            transaction.rolledBack = true;
          },
          release() {
            transaction.released = true;
          },
        };
      },
      async end() {},
    },
  };
}

test("conditional executor pool fails closed on unmodeled SQL", async () => {
  const fixture = createConditionalPool();
  const connection = await fixture.pool.getConnection();
  await connection.beginTransaction();
  await assert.rejects(
    connection.query("DELETE FROM profiles"),
    (error) => error && error.code === "conditional_pool_unknown_sql",
  );
  await connection.rollback();
  connection.release();
  await fixture.pool.end();
  assert.equal(fixture.shared.transactions[0].rolledBack, true);
  assert.equal(fixture.shared.transactions[0].released, true);
});

async function openConditionalStore(options = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-profile-conditional-"));
  const loader = createLoaderFixture(tempDir, {revision: options.loadedStoreRevision ?? 0});
  const harness = createConditionalPool(options);
  const store = createMysqlAuthStore({
    mysqlPath: loader.fakeMysqlPath,
    host: "127.0.0.1",
    port: 3306,
    user: "tester",
    password: "dummy",
    database: "beastbound_test",
    createDatabase: false,
    ensureSchema: false,
    usePool: true,
    poolFactory: () => harness.pool,
  });
  const loaded = store.load();
  const candidate = nextProfileState(loaded, {receipt: options.receipt === true});
  return {
    candidate,
    harness,
    store,
    async close() {
      await store.close();
      fs.rmSync(tempDir, {recursive: true, force: true});
    },
  };
}

function sqlIndex(transaction, pattern) {
  return transaction.queries.findIndex((entry) => pattern.test(entry.sql));
}

function isResourceRevisionConflict(error) {
  return Boolean(error && error.code === "mysql_resource_revision_conflict");
}

test("pool executor keeps the global fence, validates both locks, and conditionally updates both profile rows", async () => {
  const fixture = await openConditionalStore();
  try {
    await fixture.store.saveAsync(fixture.candidate);
    const transaction = fixture.harness.shared.transactions[0];
    const globalLock = sqlIndex(transaction, /SELECT\s+revision[\s\S]+auth_store_revisions[\s\S]+FOR\s+UPDATE/i);
    const bindingLock = sqlIndex(transaction, /SELECT[\s\S]+FROM\s+profile_bindings[\s\S]+FOR\s+UPDATE/i);
    const profileLock = sqlIndex(transaction, /SELECT[\s\S]+FROM\s+profiles[\s\S]+FOR\s+UPDATE/i);
    const bindingUpdate = sqlIndex(transaction, /^UPDATE\s+profile_bindings\b/i);
    const profileUpdate = sqlIndex(transaction, /^UPDATE\s+profiles\b/i);
    const globalUpdate = sqlIndex(transaction, /^UPDATE\s+auth_store_revisions\b/i);

    assert.ok(globalLock >= 0 && globalLock < bindingLock);
    assert.ok(bindingLock >= 0 && bindingLock < profileLock);
    assert.ok(profileLock >= 0 && profileLock < bindingUpdate);
    assert.ok(bindingUpdate >= 0 && bindingUpdate < profileUpdate);
    assert.ok(profileUpdate >= 0 && profileUpdate < globalUpdate);
    assert.equal(transaction.queries.some((entry) => /ON DUPLICATE KEY UPDATE/i.test(entry.sql) && /\bprofiles?\b/i.test(entry.sql)), false);
    assert.equal(transaction.committed, true);
    assert.equal(transaction.rolledBack, false);
    assert.equal(transaction.released, true);
    assert.equal(fixture.harness.shared.revision, 1);
  } finally {
    await fixture.close();
  }
});

test("pool executor rejects a mismatched locked profile row before any business write", async () => {
  const fixture = await openConditionalStore({bindingLockRevision: 99});
  try {
    await assert.rejects(fixture.store.saveAsync(fixture.candidate), isResourceRevisionConflict);
    const transaction = fixture.harness.shared.transactions[0];
    assert.equal(transaction.queries.some((entry) => /^UPDATE\s+(?:profile_bindings|profiles)\b/i.test(entry.sql)), false);
    assert.equal(transaction.committed, false);
    assert.equal(transaction.rolledBack, true);
    assert.equal(transaction.released, true);
    assert.equal(fixture.harness.shared.revision, 0);
  } finally {
    await fixture.close();
  }
});

for (const failure of [
  {name: "binding conditional update", options: {bindingAffectedRows: 0}},
  {name: "profile conditional update", options: {profileAffectedRows: 0}},
]) {
  test(`pool executor rolls the whole transaction back when ${failure.name} affects zero rows`, async () => {
    const fixture = await openConditionalStore(failure.options);
    try {
      await assert.rejects(fixture.store.saveAsync(fixture.candidate), isResourceRevisionConflict);
      const transaction = fixture.harness.shared.transactions[0];
      assert.equal(transaction.committed, false);
      assert.equal(transaction.rolledBack, true);
      assert.equal(transaction.released, true);
      assert.equal(fixture.harness.shared.revision, 0);
      assert.equal(sqlIndex(transaction, /^UPDATE\s+auth_store_revisions\b/i), -1);
    } finally {
      await fixture.close();
    }
  });
}

for (const failure of [
  {name: "duplicate key", options: {receiptDuplicate: true}},
  {name: "zero affected rows", options: {receiptAffectedRows: 0}},
]) {
  test(`receipt ${failure.name} rolls back both profile updates and the global revision`, async () => {
    const fixture = await openConditionalStore({receipt: true, ...failure.options});
    try {
      await assert.rejects(fixture.store.saveAsync(fixture.candidate), isResourceRevisionConflict);
      const transaction = fixture.harness.shared.transactions[0];
      assert.ok(sqlIndex(transaction, /^UPDATE\s+profile_bindings\b/i) >= 0);
      assert.ok(sqlIndex(transaction, /^UPDATE\s+profiles\b/i) >= 0);
      assert.ok(sqlIndex(transaction, /^INSERT\s+INTO\s+mutation_receipts\b/i) >= 0);
      assert.equal(transaction.committed, false);
      assert.equal(transaction.rolledBack, true);
      assert.equal(transaction.released, true);
      assert.equal(fixture.harness.shared.revision, 0);
    } finally {
      await fixture.close();
    }
  });
}

test("a stale global revision still rejects before profile locks or writes", async () => {
  const fixture = await openConditionalStore({loadedStoreRevision: 0, actualStoreRevision: 1});
  try {
    await assert.rejects(
      fixture.store.saveAsync(fixture.candidate),
      (error) => error && error.code === "mysql_store_revision_conflict",
    );
    const transaction = fixture.harness.shared.transactions[0];
    assert.equal(transaction.queries.length, 1);
    assert.match(transaction.queries[0].sql, /auth_store_revisions[\s\S]+FOR\s+UPDATE/i);
    assert.equal(transaction.committed, false);
    assert.equal(transaction.rolledBack, true);
    assert.equal(fixture.harness.shared.revision, 1);
  } finally {
    await fixture.close();
  }
});
