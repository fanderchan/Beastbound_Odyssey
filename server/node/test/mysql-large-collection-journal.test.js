"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {cloneAuthorityRoot} = require("../src/auth/authority-root-clone");
const {
  createAsyncWriteAuthStore,
  createAuthService,
} = require("../src/auth-service");
const {
  ensureConsumedEquipmentEnvelopeIds,
} = require("../src/auth/equipment-envelope-consumed-ledger");
const {
  canonicalDurableMutationReceipts,
  stageDurableMutationReceipt,
} = require("../src/auth/durable-mutation-state");
const {
  __buildMysqlSavePlanFromPersistentDataForTest,
  __runMysqlPoolSavePlanForTest,
  createMysqlAuthStore,
} = require("../src/mysql-store");
const {battleProfile} = require("../test-support/auth-service-test-context");
const {
  wrapFakeMysqlWithMailStorageAudit,
} = require("../test-support/mysql-mail-storage-fixture");

const MYSQL_SESSION_POLICY_SQL =
  "SET SESSION innodb_lock_wait_timeout = ?, SESSION lock_wait_timeout = ?";

function isDefaultMysqlSessionPolicy(statement, params) {
  const sql = typeof statement === "string"
    ? statement.trim()
    : String(statement && statement.sql || "").trim();
  if (sql !== MYSQL_SESSION_POLICY_SQL) {
    return false;
  }
  assert.deepEqual(params, [3, 5]);
  return true;
}

function rejectOtherMysqlSetStatement(statement) {
  const sql = typeof statement === "string"
    ? statement.trim()
    : String(statement && statement.sql || "").trim();
  if (!/^SET\b/i.test(sql)) {
    return;
  }
  const error = new Error(`journal test pool rejects non-default session SQL: ${sql}`);
  error.code = "journal_test_pool_unsafe_session_sql";
  throw error;
}

test("mysql journal retries rollback and orders expired same-key DELETE before INSERT", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-large-journal-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const oldOperationId = "operation_mysql_expired_reuse_0001";
  const oldReceipt = {
    schemaVersion: 1,
    operationId: oldOperationId,
    requestHash: "a".repeat(64),
    actionId: "bank.withdraw",
    accountId: "acc_mysql_journal",
    committedAt: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-07-04T00:00:00.000Z",
    response: {ok: true, generation: 1},
  };
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  if (stdin.includes("SELECT 'server_state'")) {
    const rows = [
      ["server_state", "auth", ${JSON.stringify(JSON.stringify({schemaVersion: 2, storage: "mysql_entity_tables"}))}],
      ["store_revision", "auth", "0"],
      ["mutation_receipts", ${JSON.stringify(oldOperationId)}, ${JSON.stringify(JSON.stringify(oldReceipt))}],
      ["consumed_equipment_envelopes", "eqx_mysql_journal_baseline_0001", "{}"],
    ];
    process.stdout.write(rows.map((row) => row.join("\\t")).join("\\n") + "\\n");
  }
});
`, {mode: 0o755});

  const transactions = [];
  const transactionQueries = [];
  const sessionPolicies = [];
  let activeQueries = null;
  let activeTransactionQueries = null;
  let failNextQuery = true;
  let storeRevision = 0;
  let pendingStoreRevision = null;
  const connection = {
    async beginTransaction() {
      activeQueries = [];
      activeTransactionQueries = [];
      transactions.push(activeQueries);
      transactionQueries.push(activeTransactionQueries);
    },
    async query(statement, params = []) {
      if (isDefaultMysqlSessionPolicy(statement, params)) {
        sessionPolicies.push(params.slice());
        return [{affectedRows: 0}, []];
      }
      rejectOtherMysqlSetStatement(statement);
      activeQueries.push(statement);
      activeTransactionQueries.push({
        sql: String(statement && statement.sql || statement).trim(),
        params: structuredClone(params),
      });
      if (failNextQuery) {
        failNextQuery = false;
        throw new Error("injected journal rollback");
      }
      if (/^SELECT revision AS storeRevision FROM auth_store_revisions[\s\S]+FOR (?:UPDATE|SHARE)$/i.test(String(statement).trim())) {
        return [[{storeRevision}], []];
      }
      if (/^SELECT account_id, player_id, profile_revision FROM profile_bindings WHERE account_id = \? FOR UPDATE$/i.test(String(statement).trim())) {
        return [[{
          account_id: accountId,
          player_id: playerId,
          profile_revision: binding.profileRevision,
        }], []];
      }
      if (/^SELECT player_id, account_id, profile_revision FROM profiles WHERE player_id = \? FOR UPDATE$/i.test(String(statement).trim())) {
        return [[{
          player_id: playerId,
          account_id: accountId,
          profile_revision: profileDocument.profileRevision,
        }], []];
      }
      if (/^SELECT account_id, player_id, profile_revision FROM profile_bindings ORDER BY account_id FOR UPDATE$/i.test(String(statement).trim())) {
        return [[], []];
      }
      if (/^SELECT player_id, account_id, profile_revision FROM profiles ORDER BY player_id FOR UPDATE$/i.test(String(statement).trim())) {
        return [[], []];
      }
      if (/^UPDATE auth_store_revisions SET revision = revision \+ 1[\s\S]+AND revision = \d+$/i.test(String(statement).trim())) {
        pendingStoreRevision = storeRevision + 1;
        return [{affectedRows: 1}, []];
      }
      return [{affectedRows: 1}, []];
    },
    async commit() {
      if (pendingStoreRevision !== null) storeRevision = pendingStoreRevision;
      pendingStoreRevision = null;
    },
    async rollback() {
      pendingStoreRevision = null;
    },
    release() {},
    destroy() {},
  };
  const pool = {
    async getConnection() {
      return connection;
    },
    async end() {},
  };

  try {
    const store = createMysqlAuthStore({
      mysqlPath: wrapFakeMysqlWithMailStorageAudit(fakeMysqlPath),
      host: "127.0.0.1",
      port: 3306,
      user: "tester",
      password: "secret",
      database: "beastbound_test",
      createDatabase: false,
      usePool: true,
      poolFactory: () => pool,
    });
    const loaded = store.load();
    const candidate = cloneAuthorityRoot(loaded);
    candidate.mutationReceipts = stageDurableMutationReceipt(candidate.mutationReceipts, {
      ...oldReceipt,
      requestHash: "b".repeat(64),
      committedAt: "2026-07-12T00:00:00.000Z",
      expiresAt: "2026-07-15T00:00:00.000Z",
      response: {ok: true, generation: 2},
    }, {nowMs: Date.parse("2026-07-12T00:00:00.000Z")});
    const appended = ensureConsumedEquipmentEnvelopeIds(
      candidate.consumedEquipmentEnvelopes,
      "eqx_mysql_journal_append_0002",
    );
    assert.equal(appended.ok, true);
    candidate.consumedEquipmentEnvelopes = appended.ledger;

    await assert.rejects(store.saveAsync(candidate), /MySQL 异步存档失败/);
    assert.equal(candidate.mutationReceipts[oldOperationId].requestHash, "b".repeat(64));
    await store.saveAsync(candidate);

    assert.equal(transactions.length, 2);
    assert.deepEqual(sessionPolicies, [[3, 5], [3, 5]]);
    const successful = transactions[1];
    const successfulQueries = transactionQueries[1];
    const globalLockIndex = successful.findIndex((statement) => (
      /^SELECT revision AS storeRevision FROM auth_store_revisions[\s\S]+FOR UPDATE$/i.test(String(statement).trim())
    ));
    const bindingSnapshotIndex = successful.findIndex((statement) => (
      /^SELECT account_id, player_id, profile_revision FROM profile_bindings ORDER BY account_id FOR UPDATE$/i.test(String(statement).trim())
    ));
    const profileSnapshotIndex = successful.findIndex((statement) => (
      /^SELECT player_id, account_id, profile_revision FROM profiles ORDER BY player_id FOR UPDATE$/i.test(String(statement).trim())
    ));
    const receiptDeleteIndex = successfulQueries.findIndex(({sql, params}) => (
      /^DELETE FROM mutation_receipts\b/i.test(sql) && params[0] === oldOperationId
    ));
    const receiptInsertIndex = successfulQueries.findIndex(({sql, params}) => (
      /^INSERT INTO mutation_receipts\b/i.test(sql) && params[0] === oldOperationId
    ));
    assert.ok(globalLockIndex >= 0);
    assert.ok(bindingSnapshotIndex > globalLockIndex);
    assert.ok(profileSnapshotIndex > bindingSnapshotIndex);
    assert.ok(receiptDeleteIndex > profileSnapshotIndex);
    assert.ok(receiptInsertIndex > receiptDeleteIndex);
    assert.deepEqual(successfulQueries[receiptDeleteIndex].params, [
      oldOperationId,
      oldReceipt.requestHash,
      oldReceipt.actionId,
      oldReceipt.accountId,
      oldReceipt.committedAt,
      oldReceipt.expiresAt,
      JSON.stringify(oldReceipt),
    ]);
    assert.equal(successfulQueries.filter(({params}) => params[0] === oldOperationId).length, 2);
    assert.equal(successful.some((statement) => statement.includes("eqx_mysql_journal_append_0002")), true);
    assert.equal(successful.some((statement) => statement.includes("eqx_mysql_journal_baseline_0001")), false);
    assert.equal(successful.some((statement) => (
      /^UPDATE auth_store_revisions SET revision = revision \+ 1/i.test(String(statement).trim())
    )), true);
    await store.close();
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});
test("service replaces an expired receipt through the real mysql planner and replays from the exact committed row", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-service-mysql-journal-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const operationId = "operation_service_mysql_expired_0001";
  const token = "s".repeat(43);
  const accountId = "acc_service_mysql_journal";
  const playerId = "player_service_mysql_journal";
  const nowIso = "2026-07-12T00:00:00.000Z";
  const account = {
    accountId,
    username: "mysqljournal",
    displayName: "MySQL回执",
    role: "player",
    passwordHash: "test-only-not-used",
    createdAt: nowIso,
    updatedAt: nowIso,
    schemaVersion: 1,
  };
  const session = {
    sessionId: "sess_service_mysql_journal",
    accountId,
    tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
    createdAt: nowIso,
    expiresAt: "2026-07-20T00:00:00.000Z",
    revokedAt: null,
    schemaVersion: 1,
  };
  const binding = {
    accountId,
    playerId,
    profileRevision: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    schemaVersion: 1,
  };
  const profile = battleProfile("mysqljournal", {level: 1, hp: 120, maxHp: 120}, null);
  profile.stoneCoins = 20;
  const profileDocument = {
    playerId,
    accountId,
    profileRevision: 1,
    updatedAt: nowIso,
    profile,
  };
  const oldReceipt = {
    schemaVersion: 1,
    operationId,
    requestHash: "1".repeat(64),
    actionId: "bank.deposit",
    accountId,
    committedAt: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-07-04T00:00:00.000Z",
    response: {ok: true, generation: 1},
  };
  const rows = [
    ["server_state", "auth", {schemaVersion: 2, storage: "mysql_entity_tables"}],
    ["store_revision", "auth", 0],
    ["accounts", accountId, account],
    ["sessions", session.sessionId, session],
    ["profile_bindings", accountId, binding],
    ["profiles", playerId, profileDocument],
    ["mutation_receipts", operationId, oldReceipt],
  ];
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  if (stdin.includes("SELECT 'server_state'")) {
    const rows = ${JSON.stringify(rows.map(([bucket, key, document]) => [bucket, key, JSON.stringify(document)]))};
    process.stdout.write(rows.map((row) => row.join("\\t")).join("\\n") + "\\n");
  }
});
`, {mode: 0o755});

  const transactions = [];
  const sessionPolicies = [];
  let current = null;
  let storeRevision = 0;
  let pendingStoreRevision = null;
  let committedReceipt = oldReceipt;
  const connection = {
    async beginTransaction() {
      current = [];
      transactions.push(current);
    },
    async query(statement, params = []) {
      if (isDefaultMysqlSessionPolicy(statement, params)) {
        sessionPolicies.push(params.slice());
        return [{affectedRows: 0}, []];
      }
      rejectOtherMysqlSetStatement(statement);
      current.push(statement);
      if (/FROM auth_store_revisions AS revision_row\s+LEFT JOIN mutation_receipts AS receipt/i.test(String(statement))) {
        assert.deepEqual(params, [operationId, "auth"]);
        return [[{
          store_revision: storeRevision,
          operation_id: committedReceipt.operationId,
          request_hash: committedReceipt.requestHash,
          action_id: committedReceipt.actionId,
          account_id: committedReceipt.accountId,
          committed_at: committedReceipt.committedAt,
          expires_at: committedReceipt.expiresAt,
          document_json: structuredClone(committedReceipt),
        }], []];
      }
      if (/^SELECT revision AS storeRevision FROM auth_store_revisions[\s\S]+FOR UPDATE$/i.test(String(statement).trim())) {
        return [[{storeRevision}], []];
      }
      if (/^SELECT account_id, player_id, profile_revision FROM profile_bindings ORDER BY account_id FOR UPDATE$/i.test(String(statement).trim())) {
        return [[{
          account_id: accountId,
          player_id: playerId,
          profile_revision: binding.profileRevision,
        }], []];
      }
      if (/^SELECT player_id, account_id, profile_revision FROM profiles ORDER BY player_id FOR UPDATE$/i.test(String(statement).trim())) {
        return [[{
          player_id: playerId,
          account_id: accountId,
          profile_revision: profileDocument.profileRevision,
        }], []];
      }
      if (/^UPDATE auth_store_revisions SET revision = revision \+ 1[\s\S]+AND revision = \d+$/i.test(String(statement).trim())) {
        pendingStoreRevision = storeRevision + 1;
        return [{affectedRows: 1}, []];
      }
      return [{affectedRows: 1}, []];
    },
    async commit() {
      if (pendingStoreRevision !== null) storeRevision = pendingStoreRevision;
      pendingStoreRevision = null;
    },
    async rollback() {
      pendingStoreRevision = null;
    },
    release() {},
    destroy() {},
  };
  try {
    const mysqlStore = createMysqlAuthStore({
      mysqlPath: wrapFakeMysqlWithMailStorageAudit(fakeMysqlPath),
      host: "127.0.0.1",
      port: 3306,
      user: "tester",
      password: "secret",
      database: "beastbound_test",
      createDatabase: false,
      usePool: true,
      poolFactory: () => ({
        async getConnection() {
          return connection;
        },
        async end() {},
      }),
    });
    const service = createAuthService({
      store: createAsyncWriteAuthStore(mysqlStore, {onError: () => {}}),
      now: () => Date.parse(nowIso),
    });
    const operation = {
      operationId,
      requestHash: "2".repeat(64),
      actionId: "bank.deposit",
    };
    const first = await service.invokeDurable("bankDeposit", [token, {stoneCoins: 1}], operation);
    assert.equal(first.ok, true);
    assert.equal(first.durableCommit.replayed, false);
    assert.equal(transactions.length, 1);
    assert.deepEqual(sessionPolicies, [[3, 5]]);
    const globalLock = transactions[0].findIndex((statement) => (
      /^SELECT revision AS storeRevision FROM auth_store_revisions[\s\S]+FOR UPDATE$/i.test(String(statement).trim())
    ));
    const bindingSnapshot = transactions[0].findIndex((statement) => (
      /^SELECT account_id, player_id, profile_revision FROM profile_bindings ORDER BY account_id FOR UPDATE$/i.test(String(statement).trim())
    ));
    const profileSnapshot = transactions[0].findIndex((statement) => (
      /^SELECT player_id, account_id, profile_revision FROM profiles ORDER BY player_id FOR UPDATE$/i.test(String(statement).trim())
    ));
    const deletion = transactions[0].findIndex((statement) => statement.startsWith("DELETE FROM mutation_receipts"));
    const insertion = transactions[0].findIndex((statement) => statement.startsWith("INSERT INTO mutation_receipts"));
    assert.ok(globalLock >= 0);
    assert.ok(bindingSnapshot > globalLock);
    assert.ok(profileSnapshot > bindingSnapshot);
    assert.ok(deletion > profileSnapshot && insertion > deletion);
    assert.equal(transactions[0].some((statement) => statement.startsWith("INSERT INTO profiles")), true);
    assert.equal(transactions[0].some((statement) => (
      /^UPDATE auth_store_revisions SET revision = revision \+ 1/i.test(String(statement).trim())
    )), true);

    committedReceipt = {
      schemaVersion: 1,
      operationId,
      requestHash: operation.requestHash,
      actionId: operation.actionId,
      accountId,
      committedAt: first.durableCommit.committedAt,
      expiresAt: "2026-07-15T00:00:00.000Z",
      response: structuredClone(first),
    };
    const currentSession = service.getSession(token);
    assert.equal(currentSession.ok, true, JSON.stringify(currentSession));
    const publishedReceipt = service.snapshot().mutationReceipts[operationId];
    assert.equal(publishedReceipt.requestHash, operation.requestHash);
    assert.equal(publishedReceipt.actionId, operation.actionId);
    assert.equal(publishedReceipt.expiresAt, "2026-07-15T00:00:00.000Z");
    assert.equal(publishedReceipt.response.ok, true);

    const replay = await service.invokeDurable("bankDeposit", [token, {stoneCoins: 1}], operation);
    assert.equal(replay.ok, true, JSON.stringify(replay));
    assert.equal(replay.durableCommit.replayed, true);
    assert.equal(transactions.length, 2);
    assert.deepEqual(sessionPolicies, [[3, 5], [3, 5]]);
    assert.equal(transactions[1].length, 1);
    assert.match(String(transactions[1][0]), /LEFT JOIN mutation_receipts AS receipt/i);
    assert.equal(transactions[1].some((statement) => (
      /^(?:INSERT|UPDATE|DELETE)\b/i.test(String(statement).trim())
    )), false);
    await service.stopDurableAdmissionsAndDrain();
    await mysqlStore.close();
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("stale legacy expired-receipt deletion rolls back before replacement or auth revision", async () => {
  const operationId = "operation_legacy_stale_delete_0001";
  const previousReceipt = {
    schemaVersion: 1,
    operationId,
    requestHash: "7".repeat(64),
    actionId: "bank.deposit",
    accountId: "acc_legacy_stale_receipt",
    committedAt: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-07-04T00:00:00.000Z",
    response: {ok: true, generation: 1},
  };
  const previous = {
    schemaVersion: 1,
    mutationReceipts: canonicalDurableMutationReceipts({
      [previousReceipt.operationId]: previousReceipt,
    }),
  };
  const next = {...previous};
  next.mutationReceipts = stageDurableMutationReceipt(previous.mutationReceipts, {
    schemaVersion: 1,
    operationId,
    requestHash: "8".repeat(64),
    actionId: "bank.deposit",
    accountId: "acc_legacy_stale_receipt",
    committedAt: "2026-07-12T00:00:00.000Z",
    expiresAt: "2026-07-15T00:00:00.000Z",
    response: {ok: true, generation: 2},
  }, {
    nowMs: Date.parse("2026-07-12T00:00:00.000Z"),
    reserveCount: 1,
  });
  const plan = __buildMysqlSavePlanFromPersistentDataForTest(next, previous);
  assert.equal(plan.kind, "legacy_global_cas");

  const state = {queries: [], committed: false, rolledBack: false};
  const connection = {
    async beginTransaction() {},
    async query(statement, params = []) {
      const sql = String(statement && statement.sql || statement).trim();
      if (isDefaultMysqlSessionPolicy(statement, params)) {
        return [{affectedRows: 0}, []];
      }
      rejectOtherMysqlSetStatement(statement);
      state.queries.push({sql, params: structuredClone(params)});
      if (/^SELECT revision AS storeRevision FROM auth_store_revisions[\s\S]+FOR UPDATE$/i.test(sql)) {
        return [[{storeRevision: 0}], []];
      }
      if (/^SELECT account_id, player_id, profile_revision FROM profile_bindings ORDER BY account_id FOR UPDATE$/i.test(sql)) {
        return [[], []];
      }
      if (/^SELECT player_id, account_id, profile_revision FROM profiles ORDER BY player_id FOR UPDATE$/i.test(sql)) {
        return [[], []];
      }
      if (/^DELETE FROM mutation_receipts\b/i.test(sql)) {
        return [{affectedRows: 0}, []];
      }
      if (/^UPDATE auth_store_revisions SET revision = revision \+ 1/i.test(sql)) {
        return [{affectedRows: 1}, []];
      }
      return [{affectedRows: 1}, []];
    },
    async commit() { state.committed = true; },
    async rollback() { state.rolledBack = true; },
    release() {},
    destroy() {},
  };
  const pool = {
    async getConnection() { return connection; },
    async end() {},
  };

  await assert.rejects(
    __runMysqlPoolSavePlanForTest(pool, plan, {
      expectedRevision: 0,
      revisionCasEnabled: true,
    }),
    (error) => error && error.code === "mysql_resource_revision_conflict",
  );
  const deleteQuery = state.queries.find(({sql}) => /^DELETE FROM mutation_receipts\b/i.test(sql));
  assert.ok(deleteQuery);
  assert.equal(deleteQuery.params.length, 7);
  assert.equal(
    state.queries.some(({sql}) => /^INSERT INTO mutation_receipts\b/i.test(sql)),
    false,
  );
  assert.equal(
    state.queries.some(({sql}) => /^UPDATE auth_store_revisions SET revision = revision \+ 1/i.test(sql)),
    false,
  );
  assert.equal(state.rolledBack, true);
  assert.equal(state.committed, false);
});

test("online mysql planner rejects an uncertified generic receipt snapshot deletion", () => {
  const receipt = {
    schemaVersion: 1,
    operationId: "operation_generic_receipt_delete_0001",
    requestHash: "9".repeat(64),
    actionId: "bank.withdraw",
    accountId: "acc_generic_receipt_delete",
    committedAt: "2026-07-16T01:00:00.000Z",
    expiresAt: "2026-07-19T01:00:00.000Z",
    response: {ok: true},
  };

  assert.throws(
    () => __buildMysqlSavePlanFromPersistentDataForTest(
      {schemaVersion: 1, mutationReceipts: {}},
      {schemaVersion: 1, mutationReceipts: {[receipt.operationId]: receipt}},
    ),
    (error) => error && error.code === "mysql_resource_precondition_invalid",
  );
});
