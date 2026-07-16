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
  durableMutationReceiptCount,
  stageDurableMutationReceipt,
} = require("../src/auth/durable-mutation-state");
const {
  mailAuthorityDiagnostics,
  readMailAuthorityState,
} = require("../src/auth/mail-authority-state");
const mysqlStoreModule = require("../src/mysql-store");
const {
  wrapFakeMysqlWithMailStorageAudit,
} = require("../test-support/mysql-mail-storage-fixture");

const {
  createMysqlAuthStore,
  __buildMysqlSavePlanFromPersistentDataForTest,
} = mysqlStoreModule;

const MYSQL_SESSION_POLICY_SQL =
  "SET SESSION innodb_lock_wait_timeout = ?, SESSION lock_wait_timeout = ?";

function isDefaultMysqlSessionPolicy(sql, params) {
  if (sql.trim() !== MYSQL_SESSION_POLICY_SQL) {
    return false;
  }
  assert.deepEqual(params, [3, 5]);
  return true;
}

const ACCOUNT_ID = "acc_profile_conditional";
const PLAYER_ID = "player_profile_conditional";
const ACCOUNT_ID_B = "acc_profile_conditional_b";
const PLAYER_ID_B = "player_profile_conditional_b";
const UPDATED_AT_1 = "2026-07-14T01:00:00.000Z";
const UPDATED_AT_2 = "2026-07-14T01:01:00.000Z";
const DEFAULT_OPERATION_ID = "op_profile_conditional_0001";

function profileState(options = {}) {
  const revision = Number(options.revision ?? 1);
  const accountId = String(options.accountId || ACCOUNT_ID);
  const playerId = String(options.playerId || PLAYER_ID);
  const updatedAt = String(options.updatedAt || UPDATED_AT_1);
  const state = {
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
  if (options.includeSecondProfile === true) {
    state.profileBindings[ACCOUNT_ID_B] = {
      accountId: ACCOUNT_ID_B,
      playerId: PLAYER_ID_B,
      profileRevision: revision,
      updatedAt,
    };
    state.profiles[PLAYER_ID_B] = {
      playerId: PLAYER_ID_B,
      accountId: ACCOUNT_ID_B,
      profileRevision: revision,
      updatedAt,
      profile: {
        displayName: "条件存档猎人乙",
        stoneCoins: 200,
      },
    };
  }
  return state;
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
      mutationReceipt(options.operationId || DEFAULT_OPERATION_ID),
      {nowMs: Date.parse("2026-07-14T01:01:00.000Z")},
    );
  }
  return after;
}

function mutationReceipt(operationId, overrides = {}) {
  return {
    schemaVersion: 1,
    operationId,
    requestHash: "a".repeat(64),
    actionId: "profile_action",
    accountId: ACCOUNT_ID,
    committedAt: "2026-07-14T01:01:00.000Z",
    expiresAt: "2026-07-17T01:01:00.000Z",
    response: {ok: true, operationId},
    ...overrides,
  };
}

function rowLocalProfileScope(operationId = DEFAULT_OPERATION_ID, overrides = {}) {
  return {
    kind: "row_local_profile_v1",
    accountId: ACCOUNT_ID,
    playerId: PLAYER_ID,
    operationId,
    requestHash: "a".repeat(64),
    actionId: "profile_action",
    ...overrides,
  };
}

function eligibleProfileState(before, options = {}) {
  return nextProfileState(before, {
    ...options,
    receipt: true,
    operationId: options.operationId || DEFAULT_OPERATION_ID,
  });
}

function buildPlan(after, before, consistencyScope = null) {
  assert.equal(
    typeof __buildMysqlSavePlanFromPersistentDataForTest,
    "function",
    "mysql-store must expose the pure P0.6d-2b planner test hook",
  );
  return __buildMysqlSavePlanFromPersistentDataForTest(after, before, {consistencyScope});
}

function operationResource(operation) {
  return String(operation && (operation.resource || operation.resourceType) || "");
}

function planOperations(plan, field) {
  return Array.isArray(plan && plan[field]) ? plan[field] : [];
}

test("planner selects v2 only for one scoped profile r to r+1 plus its matching receipt", () => {
  const before = profileState();
  const plan = buildPlan(eligibleProfileState(before), before, rowLocalProfileScope());

  assert.equal(plan.kind, "profile_conditional_v2");
  assert.equal(plan.globalRevisionFence, false);
  assert.equal(plan.globalCompatibilityBarrier, "shared");
  assert.equal(plan.accountId, ACCOUNT_ID);
  assert.equal(plan.playerId, PLAYER_ID);
  assert.equal(plan.expectedProfileRevision, 1);
  assert.equal(plan.nextProfileRevision, 2);
  assert.deepEqual(
    planOperations(plan, "locks").map(operationResource),
    ["profile_binding", "profile"],
  );
  const writes = planOperations(plan, "writes");
  assert.deepEqual(
    writes.map(operationResource),
    ["profile_binding", "profile", "mutation_receipt_capacity", "mutation_receipt"],
  );
  assert.equal(writes.every((operation) => operation.expectedAffectedRows === 1), true);
  assert.match(String(writes[0].sql || ""), /^UPDATE profile_bindings\b/i);
  assert.match(String(writes[0].sql || ""), /WHERE[\s\S]+account_id[\s\S]+player_id[\s\S]+profile_revision/i);
  assert.match(String(writes[1].sql || ""), /^UPDATE profiles\b/i);
  assert.match(String(writes[1].sql || ""), /WHERE[\s\S]+player_id[\s\S]+account_id[\s\S]+profile_revision/i);
  assert.match(String(writes[2].sql || ""), /^UPDATE auth_store_revisions\b/i);
  assert.deepEqual(writes[2].params, [1, 1]);
  assert.match(String(writes[3].sql || ""), /^INSERT INTO mutation_receipts\b/i);
  assert.equal(writes.some((operation) => /ON DUPLICATE KEY/i.test(String(operation.sql || ""))), false);
  assert.equal(
    [...planOperations(plan, "locks"), ...planOperations(plan, "writes")]
      .some((operation) => /\bserver_state\b/i.test(String(operation.sql || ""))),
    false,
    "receipt count metadata must not put a full server_state document on the conditional fast path",
  );
  assert.equal(Array.isArray(plan.statements), false);
});

test("profile planner does not enumerate an untouched canonical mailbox", () => {
  const before = profileState();
  const mailbox = {};
  for (let index = 0; index < 2000; index += 1) {
    const mailId = `mail_planner_untouched_${String(index).padStart(5, "0")}`;
    mailbox[mailId] = {
      mailId,
      senderAccountId: "system_capacity",
      recipientAccountId: `acc_mailbox_${index % 10}`,
      title: "容量邮件",
      body: "未触碰邮件不得进入 profile planner diff。",
      items: [],
      createdAt: UPDATED_AT_1,
      readAt: null,
      schemaVersion: 1,
    };
  }
  const canonical = readMailAuthorityState(mailbox);
  assert.equal(canonical.ok, true);
  before.mailMessages = canonical.messages;
  const beforeEnumerations = mailAuthorityDiagnostics(before.mailMessages).ownKeyEnumerations;

  const after = eligibleProfileState(before);
  const plan = buildPlan(after, before, rowLocalProfileScope());

  assert.equal(plan.kind, "profile_conditional_v2");
  assert.equal(after.mailMessages, before.mailMessages);
  assert.equal(
    mailAuthorityDiagnostics(before.mailMessages).ownKeyEnumerations,
    beforeEnumerations,
  );
});

test("planner falls back when row-local scope is missing or does not match the receipt", async (t) => {
  const cases = [
    {name: "scope is missing", scope: null},
    {name: "scope kind is wrong", scope: rowLocalProfileScope(DEFAULT_OPERATION_ID, {kind: "global"})},
    {name: "scope account differs", scope: rowLocalProfileScope(DEFAULT_OPERATION_ID, {accountId: ACCOUNT_ID_B})},
    {name: "scope player differs", scope: rowLocalProfileScope(DEFAULT_OPERATION_ID, {playerId: PLAYER_ID_B})},
    {name: "scope operation differs", scope: rowLocalProfileScope("op_profile_conditional_other")},
    {name: "scope request hash differs", scope: rowLocalProfileScope(DEFAULT_OPERATION_ID, {requestHash: "b".repeat(64)})},
    {name: "scope action differs", scope: rowLocalProfileScope(DEFAULT_OPERATION_ID, {actionId: "other_action"})},
    {
      name: "receipt account differs",
      scope: rowLocalProfileScope(),
      mutate(after) {
        after.mutationReceipts = {
          ...after.mutationReceipts,
          [DEFAULT_OPERATION_ID]: {
            ...after.mutationReceipts[DEFAULT_OPERATION_ID],
            accountId: ACCOUNT_ID_B,
          },
        };
      },
    },
    {
      name: "receipt is absent",
      scope: rowLocalProfileScope(),
      after(before) {
        return nextProfileState(before);
      },
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, () => {
      const before = profileState();
      const after = typeof fixture.after === "function"
        ? fixture.after(before)
        : eligibleProfileState(before);
      if (typeof fixture.mutate === "function") {
        fixture.mutate(after);
      }
      const plan = buildPlan(after, before, fixture.scope);
      assert.equal(plan.kind, "legacy_global_cas");
      assert.equal(plan.globalRevisionFence, true);
      assert.deepEqual(
        planOperations(plan, "resourceLocks").map(operationResource),
        ["profile_binding_snapshot", "profile_snapshot"],
      );
    });
  }
});

test("real record_point_save produces the strict profile plus receipt conditional plan", async () => {
  let committedPersistentData = null;
  let latestPlan = null;
  let latestSaveOptions = null;
  const service = createAuthService({
    store: {
      load() {
        return committedPersistentData === null ? {} : cloneAuthorityRoot(committedPersistentData);
      },
      save(nextData, saveOptions = {}) {
        if (committedPersistentData !== null) {
          latestSaveOptions = saveOptions;
          latestPlan = buildPlan(nextData, committedPersistentData, saveOptions.consistencyScope);
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

  assert.deepEqual(latestSaveOptions.consistencyScope, {
    kind: "row_local_profile_v1",
    accountId: registered.account.accountId,
    playerId: registered.profileBinding.playerId,
    operationId,
    requestHash: "b".repeat(64),
    actionId: "POST /profile/action",
  });
  assert.equal(latestPlan.kind, "profile_conditional_v2");
  assert.equal(latestPlan.globalRevisionFence, false);
  assert.equal(latestPlan.globalCompatibilityBarrier, "shared");
  assert.deepEqual(
    latestPlan.writes.map(operationResource),
    ["profile_binding", "profile", "mutation_receipt_capacity", "mutation_receipt"],
  );
  assert.equal(latestPlan.writes[3].key, operationId);
});

test("planner rejects unsafe or broader mutations to the legacy global-CAS path", async (t) => {
  const cases = [
    {
      name: "revision jump",
      mutate(before) {
        return eligibleProfileState(before, {revision: 3});
      },
    },
    {
      name: "binding and profile revision disagree",
      mutate(before) {
        const after = eligibleProfileState(before);
        after.profileBindings[ACCOUNT_ID] = {...after.profileBindings[ACCOUNT_ID], profileRevision: 3};
        return after;
      },
    },
    {
      name: "identity moves to another player",
      mutate(before) {
        const after = eligibleProfileState(before);
        after.profileBindings[ACCOUNT_ID] = {...after.profileBindings[ACCOUNT_ID], playerId: "player_moved"};
        return after;
      },
    },
    {
      name: "profile is newly created",
      mutate(before) {
        const after = eligibleProfileState(before);
        delete before.profiles[PLAYER_ID];
        return after;
      },
    },
    {
      name: "profile is deleted",
      mutate(before) {
        const after = eligibleProfileState(before);
        delete after.profiles[PLAYER_ID];
        return after;
      },
    },
    {
      name: "another persistent resource changes",
      guardsMarketCapacity: true,
      mutate(before) {
        const after = eligibleProfileState(before);
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
        const after = eligibleProfileState(before);
        after.schemaVersion = Number(before.schemaVersion || 0) + 1;
        return after;
      },
    },
    {
      name: "market config changes",
      writesServerState: true,
      mutate(before) {
        const after = eligibleProfileState(before);
        after.marketConfig = {listingFeeRate: 0.03};
        return after;
      },
    },
    {
      name: "offline hang config changes",
      writesServerState: true,
      mutate(before) {
        const after = eligibleProfileState(before);
        after.offlineHangConfig = {rewardRate: 0.5};
        return after;
      },
    },
    {
      name: "service event sequence changes",
      writesServerState: true,
      mutate(before) {
        const after = eligibleProfileState(before);
        after.serviceEventSeq = 2;
        return after;
      },
    },
    {
      name: "service event journal changes",
      writesServerState: true,
      mutate(before) {
        const after = eligibleProfileState(before);
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
        const after = eligibleProfileState(before);
        after.mutationReceipts = stageDurableMutationReceipt(
          after.mutationReceipts,
          mutationReceipt("op_profile_conditional_0002"),
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
      const plan = buildPlan(after, before, fixture.scope || rowLocalProfileScope());
      assert.equal(plan.kind, "legacy_global_cas");
      assert.equal(plan.globalRevisionFence, true);
      assert.ok(Array.isArray(plan.statements) && plan.statements.length > 0);
      assert.deepEqual(
        planOperations(plan, "resourceLocks").map(operationResource),
        [
          ...(fixture.writesServerState ? ["server_state"] : []),
          "profile_binding_snapshot",
          "profile_snapshot",
          ...(fixture.guardsMarketCapacity ? ["market_capacity"] : []),
        ],
      );
    });
  }
});

test("expired same-key receipt replacement stays row-local and deletes before insert", () => {
  const operationId = "op_profile_conditional_expired";
  const before = profileState();
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
  const plan = buildPlan(after, before, rowLocalProfileScope(operationId, {
    requestHash: "b".repeat(64),
  }));

  assert.equal(plan.kind, "profile_conditional_v2");
  assert.equal(plan.globalRevisionFence, false);
  assert.deepEqual(plan.writes.map(operationResource), [
    "profile_binding",
    "profile",
    "mutation_receipt",
    "mutation_receipt",
  ]);
  assert.equal(plan.writes[2].kind, "delete");
  assert.equal(plan.writes[3].kind, "insert");
  assert.equal(plan.writes[2].key, operationId);
  assert.equal(plan.writes[3].key, operationId);
  assert.match(plan.writes[2].sql, /request_hash[\s\S]+action_id[\s\S]+account_id[\s\S]+committed_at[\s\S]+expires_at[\s\S]+document_json/i);
});

test("19999 to 20000 to 20000 keeps expired receipt turnover row-local", () => {
  const firstNowMs = Date.parse("2040-01-01T00:00:00.000Z");
  const expiredOperationId = "operation_profile_steady_expired_00000000";
  const rawReceipts = {};
  for (let index = 0; index < 19999; index += 1) {
    const operationId = index === 0
      ? expiredOperationId
      : `operation_profile_steady_seed_${String(index).padStart(8, "0")}`;
    rawReceipts[operationId] = mutationReceipt(operationId, {
      committedAt: new Date(firstNowMs - 1000 + index).toISOString(),
      expiresAt: new Date(index === 0 ? firstNowMs + 1 : firstNowMs + 60_000 + index).toISOString(),
    });
  }
  const beforeFirst = profileState();
  beforeFirst.mutationReceipts = canonicalDurableMutationReceipts(rawReceipts);
  const firstOperationId = "operation_profile_steady_next_a";
  const afterFirst = nextProfileState(beforeFirst, {stoneCoins: 99});
  afterFirst.mutationReceipts = stageDurableMutationReceipt(
    afterFirst.mutationReceipts,
    mutationReceipt(firstOperationId, {
      committedAt: new Date(firstNowMs).toISOString(),
      expiresAt: new Date(firstNowMs + 120_000).toISOString(),
    }),
    {nowMs: firstNowMs},
  );
  const firstPlan = buildPlan(afterFirst, beforeFirst, rowLocalProfileScope(firstOperationId));
  assert.equal(firstPlan.kind, "profile_conditional_v2");
  assert.equal(durableMutationReceiptCount(afterFirst.mutationReceipts), 20000);
  assert.equal(firstPlan.writes.some((write) => write.resource === "mutation_receipt_capacity"), true);

  commitDurableMutationReceiptDelta(afterFirst.mutationReceipts);
  const secondNowMs = firstNowMs + 2;
  const secondOperationId = "operation_profile_steady_next_b";
  const afterSecond = nextProfileState(afterFirst, {
    revision: 3,
    stoneCoins: 98,
    updatedAt: new Date(secondNowMs).toISOString(),
  });
  afterSecond.mutationReceipts = stageDurableMutationReceipt(
    afterSecond.mutationReceipts,
    mutationReceipt(secondOperationId, {
      committedAt: new Date(secondNowMs).toISOString(),
      expiresAt: new Date(secondNowMs + 120_000).toISOString(),
    }),
    {nowMs: secondNowMs},
  );
  const secondPlan = buildPlan(afterSecond, afterFirst, rowLocalProfileScope(secondOperationId));
  assert.equal(secondPlan.kind, "profile_conditional_v2");
  assert.equal(secondPlan.globalRevisionFence, false);
  assert.equal(secondPlan.globalCompatibilityBarrier, "shared");
  assert.equal(durableMutationReceiptCount(afterSecond.mutationReceipts), 20000);
  assert.equal(secondPlan.writes.some((write) => write.resource === "mutation_receipt_capacity"), false);
  assert.deepEqual(
    secondPlan.writes.filter((write) => write.resource === "mutation_receipt")
      .map((write) => [write.kind, write.key]),
    [["delete", expiredOperationId], ["insert", secondOperationId]],
  );
});

test("legacy planner guards the complete profile snapshot even when only profile A is written", () => {
  const before = profileState({includeSecondProfile: true});
  const after = eligibleProfileState(before);
  after.marketListings.listing_extra = {
    listingId: "listing_extra",
    sellerAccountId: ACCOUNT_ID,
    itemId: "item_extra",
    currency: "stone_coin",
    unitPrice: 1,
    count: 1,
    createdAt: UPDATED_AT_2,
  };

  const plan = buildPlan(after, before, rowLocalProfileScope());
  assert.equal(plan.kind, "legacy_global_cas");
  const locks = planOperations(plan, "resourceLocks");
  assert.deepEqual(locks.map(operationResource), [
    "profile_binding_snapshot",
    "profile_snapshot",
    "market_capacity",
  ]);
  assert.deepEqual(locks[0].expectedRows, [
    {account_id: ACCOUNT_ID, player_id: PLAYER_ID, profile_revision: 1},
    {account_id: ACCOUNT_ID_B, player_id: PLAYER_ID_B, profile_revision: 1},
  ]);
  assert.deepEqual(locks[1].expectedRows, [
    {player_id: PLAYER_ID, account_id: ACCOUNT_ID, profile_revision: 1},
    {player_id: PLAYER_ID_B, account_id: ACCOUNT_ID_B, profile_revision: 1},
  ]);
});

function createLoaderFixture(tempDir, options = {}) {
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const revision = Number(options.revision ?? 0);
  const before = profileState({includeSecondProfile: options.includeSecondProfile === true});
  const rows = [
    ["server_state", "auth", JSON.stringify({schemaVersion: 2, storage: "mysql_entity_tables"})],
    ["store_revision", "auth", String(revision)],
    ["profile_bindings", ACCOUNT_ID, JSON.stringify(before.profileBindings[ACCOUNT_ID])],
    ["profiles", PLAYER_ID, JSON.stringify(before.profiles[PLAYER_ID])],
  ];
  if (options.includeSecondProfile === true) {
    rows.push(
      ["profile_bindings", ACCOUNT_ID_B, JSON.stringify(before.profileBindings[ACCOUNT_ID_B])],
      ["profiles", PLAYER_ID_B, JSON.stringify(before.profiles[PLAYER_ID_B])],
    );
  }
  for (const receipt of Object.values(options.mutationReceipts || {})) {
    rows.push(["mutation_receipts", receipt.operationId, JSON.stringify(receipt)]);
  }
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
    sessionPolicies: [],
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
          destroyed: false,
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
            if (isDefaultMysqlSessionPolicy(sql, params)) {
              shared.sessionPolicies.push(params.slice());
              return [{affectedRows: 0}, []];
            }
            if (/^SET\b/i.test(sql.trim())) {
              const error = new Error(`conditional pool rejects non-default session SQL: ${sql.trim()}`);
              error.code = "conditional_pool_unsafe_session_sql";
              throw error;
            }
            transaction.queries.push({sql, params: Array.isArray(params) ? params.slice() : params});
            if (/SELECT\s+revision\s+AS\s+storeRevision\s+FROM\s+auth_store_revisions[\s\S]+FOR\s+(?:SHARE|UPDATE)/i.test(sql)) {
              assert.deepEqual(params, []);
              return [[{storeRevision: shared.revision}], []];
            }
            if (/FROM\s+profile_bindings\s+ORDER\s+BY\s+account_id\s+FOR\s+UPDATE/i.test(sql)) {
              assert.deepEqual(params, []);
              const rows = [{
                account_id: ACCOUNT_ID,
                player_id: PLAYER_ID,
                profile_revision: Number(options.snapshotBindingRevisionA ?? 1),
              }];
              if (options.includeSecondProfile === true) {
                rows.push({
                  account_id: ACCOUNT_ID_B,
                  player_id: PLAYER_ID_B,
                  profile_revision: Number(options.snapshotBindingRevisionB ?? 1),
                });
              }
              return [rows, []];
            }
            if (/FROM\s+profiles\s+ORDER\s+BY\s+player_id\s+FOR\s+UPDATE/i.test(sql)) {
              assert.deepEqual(params, []);
              const rows = [{
                player_id: PLAYER_ID,
                account_id: ACCOUNT_ID,
                profile_revision: Number(options.snapshotProfileRevisionA ?? 1),
              }];
              if (options.includeSecondProfile === true) {
                rows.push({
                  player_id: PLAYER_ID_B,
                  account_id: ACCOUNT_ID_B,
                  profile_revision: Number(options.snapshotProfileRevisionB ?? 1),
                });
              }
              return [rows, []];
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
            if (/^DELETE\s+FROM\s+mutation_receipts\b/i.test(sql.trim())) {
              assert.equal(params.length, 7);
              assert.equal(params[0], JSON.parse(params[6]).operationId);
              return [{affectedRows: Number(options.receiptDeleteAffectedRows ?? 1)}, []];
            }
            if (/^UPDATE\s+auth_store_revisions\b/i.test(sql.trim())
              && /scope_key\s*=\s*'mutation_receipt_capacity'/i.test(sql)) {
              assert.deepEqual(params, [1, 1]);
              return [{affectedRows: Number(options.receiptCapacityAffectedRows ?? 1)}, []];
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
          destroy() {
            transaction.destroyed = true;
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
  const operationId = String(options.operationId || DEFAULT_OPERATION_ID);
  const expiredReceipt = options.expiredReceipt === true
    ? mutationReceipt(operationId, {
      committedAt: "2026-07-10T01:00:00.000Z",
      expiresAt: "2026-07-14T01:00:59.999Z",
      response: {ok: true, generation: 1},
    })
    : null;
  const loader = createLoaderFixture(tempDir, {
    revision: options.loadedStoreRevision ?? 0,
    includeSecondProfile: options.includeSecondProfile === true,
    mutationReceipts: expiredReceipt === null ? {} : {[operationId]: expiredReceipt},
  });
  const harness = createConditionalPool(options);
  const store = createMysqlAuthStore({
    mysqlPath: wrapFakeMysqlWithMailStorageAudit(loader.fakeMysqlPath),
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
  const candidate = eligibleProfileState(loaded, {operationId});
  const saveOptions = {
    consistencyScope: rowLocalProfileScope(operationId, options.scopeOverrides || {}),
  };
  return {
    candidate,
    harness,
    loaded,
    saveOptions,
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

test("pool executor takes a shared compatibility barrier and never advances the global revision", async () => {
  const fixture = await openConditionalStore();
  try {
    await fixture.store.saveAsync(fixture.candidate, fixture.saveOptions);
    const transaction = fixture.harness.shared.transactions[0];
    const globalLock = sqlIndex(transaction, /SELECT\s+revision[\s\S]+auth_store_revisions[\s\S]+FOR\s+SHARE/i);
    const bindingLock = sqlIndex(transaction, /SELECT[\s\S]+FROM\s+profile_bindings[\s\S]+FOR\s+UPDATE/i);
    const profileLock = sqlIndex(transaction, /SELECT[\s\S]+FROM\s+profiles[\s\S]+FOR\s+UPDATE/i);
    const bindingUpdate = sqlIndex(transaction, /^UPDATE\s+profile_bindings\b/i);
    const profileUpdate = sqlIndex(transaction, /^UPDATE\s+profiles\b/i);
    const receiptCapacityUpdate = sqlIndex(
      transaction,
      /^UPDATE\s+auth_store_revisions[\s\S]+mutation_receipt_capacity/i,
    );
    const receiptInsert = sqlIndex(transaction, /^INSERT\s+INTO\s+mutation_receipts\b/i);
    const globalUpdate = sqlIndex(
      transaction,
      /^UPDATE\s+auth_store_revisions[\s\S]+scope_key\s*=\s*'auth'/i,
    );

    assert.ok(globalLock >= 0 && globalLock < bindingLock);
    assert.ok(bindingLock >= 0 && bindingLock < profileLock);
    assert.ok(profileLock >= 0 && profileLock < bindingUpdate);
    assert.ok(bindingUpdate >= 0 && bindingUpdate < profileUpdate);
    assert.ok(profileUpdate >= 0 && profileUpdate < receiptCapacityUpdate);
    assert.ok(receiptCapacityUpdate >= 0 && receiptCapacityUpdate < receiptInsert);
    assert.equal(globalUpdate, -1);
    assert.equal(transaction.queries.some((entry) => /ON DUPLICATE KEY UPDATE/i.test(entry.sql) && /\bprofiles?\b/i.test(entry.sql)), false);
    assert.equal(transaction.committed, true);
    assert.equal(transaction.rolledBack, false);
    assert.equal(transaction.released, true);
    assert.equal(fixture.harness.shared.revision, 0);
  } finally {
    await fixture.close();
  }
});

test("pool executor rejects a mismatched locked profile row before any business write", async () => {
  const fixture = await openConditionalStore({bindingLockRevision: 99});
  try {
    await assert.rejects(
      fixture.store.saveAsync(fixture.candidate, fixture.saveOptions),
      isResourceRevisionConflict,
    );
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
      await assert.rejects(
        fixture.store.saveAsync(fixture.candidate, fixture.saveOptions),
        isResourceRevisionConflict,
      );
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
  test(`receipt ${failure.name} rolls back both profile updates without advancing the global revision`, async () => {
    const fixture = await openConditionalStore(failure.options);
    try {
      await assert.rejects(
        fixture.store.saveAsync(fixture.candidate, fixture.saveOptions),
        isResourceRevisionConflict,
      );
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

test("receipt capacity crossing conflict rolls back profile writes before receipt insert", async () => {
  const fixture = await openConditionalStore({receiptCapacityAffectedRows: 0});
  try {
    await assert.rejects(
      fixture.store.saveAsync(fixture.candidate, fixture.saveOptions),
      isResourceRevisionConflict,
    );
    const transaction = fixture.harness.shared.transactions[0];
    assert.ok(sqlIndex(transaction, /^UPDATE\s+profile_bindings\b/i) >= 0);
    assert.ok(sqlIndex(transaction, /^UPDATE\s+profiles\b/i) >= 0);
    assert.ok(sqlIndex(
      transaction,
      /^UPDATE\s+auth_store_revisions[\s\S]+mutation_receipt_capacity/i,
    ) >= 0);
    assert.equal(sqlIndex(transaction, /^INSERT\s+INTO\s+mutation_receipts\b/i), -1);
    assert.equal(transaction.committed, false);
    assert.equal(transaction.rolledBack, true);
    assert.equal(fixture.harness.shared.revision, 0);
  } finally {
    await fixture.close();
  }
});

test("stale expired receipt delete rolls back profile writes and replacement insert", async () => {
  const fixture = await openConditionalStore({
    expiredReceipt: true,
    receiptDeleteAffectedRows: 0,
  });
  try {
    const plan = buildPlan(fixture.candidate, fixture.loaded, fixture.saveOptions.consistencyScope);
    assert.equal(plan.kind, "profile_conditional_v2");
    assert.equal(
      plan.writes.filter((write) => write.resource === "mutation_receipt" && write.kind === "delete").length,
      1,
    );
    await assert.rejects(
      fixture.store.saveAsync(fixture.candidate, fixture.saveOptions),
      isResourceRevisionConflict,
    );
    const transaction = fixture.harness.shared.transactions[0];
    const deleteIndex = sqlIndex(transaction, /^DELETE\s+FROM\s+mutation_receipts\b/i);
    const insertIndex = sqlIndex(transaction, /^INSERT\s+INTO\s+mutation_receipts\b/i);
    assert.ok(deleteIndex >= 0);
    assert.equal(insertIndex, -1);
    assert.equal(transaction.committed, false);
    assert.equal(transaction.rolledBack, true);
    assert.equal(fixture.harness.shared.revision, 0);
  } finally {
    await fixture.close();
  }
});

test("legacy execution rejects a stale untouched profile B before writing profile A", async () => {
  const fixture = await openConditionalStore({
    includeSecondProfile: true,
    snapshotBindingRevisionB: 2,
    snapshotProfileRevisionB: 2,
  });
  fixture.candidate.marketListings.listing_extra = {
    listingId: "listing_extra",
    sellerAccountId: ACCOUNT_ID,
    itemId: "item_extra",
    currency: "stone_coin",
    unitPrice: 1,
    count: 1,
    createdAt: UPDATED_AT_2,
  };
  try {
    await assert.rejects(
      fixture.store.saveAsync(fixture.candidate, fixture.saveOptions),
      isResourceRevisionConflict,
    );
    const transaction = fixture.harness.shared.transactions[0];
    assert.equal(
      sqlIndex(transaction, /auth_store_revisions[\s\S]+FOR\s+UPDATE/i),
      0,
    );
    assert.equal(
      sqlIndex(transaction, /FROM\s+profile_bindings\s+ORDER\s+BY\s+account_id\s+FOR\s+UPDATE/i),
      1,
    );
    assert.equal(
      transaction.queries.some((entry) => /^(?:INSERT|UPDATE|DELETE)\b/i.test(entry.sql.trim())),
      false,
      "the complete legacy read-set must fail before any business SQL or global revision UPDATE",
    );
    assert.equal(transaction.committed, false);
    assert.equal(transaction.rolledBack, true);
    assert.equal(transaction.released, true);
    assert.equal(fixture.harness.shared.revision, 0);
  } finally {
    await fixture.close();
  }
});

test("a stale shared compatibility revision rejects before profile locks or writes", async () => {
  const fixture = await openConditionalStore({loadedStoreRevision: 0, actualStoreRevision: 1});
  try {
    await assert.rejects(
      fixture.store.saveAsync(fixture.candidate, fixture.saveOptions),
      (error) => error && error.code === "mysql_store_revision_conflict",
    );
    const transaction = fixture.harness.shared.transactions[0];
    assert.equal(transaction.queries.length, 1);
    assert.match(transaction.queries[0].sql, /auth_store_revisions[\s\S]+FOR\s+SHARE/i);
    assert.equal(transaction.committed, false);
    assert.equal(transaction.rolledBack, true);
    assert.equal(fixture.harness.shared.revision, 1);
  } finally {
    await fixture.close();
  }
});
