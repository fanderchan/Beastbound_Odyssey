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
  stageDurableMutationReceipt,
} = require("../src/auth/durable-mutation-state");
const {createMysqlAuthStore} = require("../src/mysql-store");
const {battleProfile} = require("../test-support/auth-service-test-context");

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
      ["mutation_receipts", ${JSON.stringify(oldOperationId)}, ${JSON.stringify(JSON.stringify(oldReceipt))}],
      ["consumed_equipment_envelopes", "eqx_mysql_journal_baseline_0001", "{}"],
    ];
    process.stdout.write(rows.map((row) => row.join("\\t")).join("\\n") + "\\n");
  }
});
`, {mode: 0o755});

  const transactions = [];
  let activeQueries = null;
  let failNextQuery = true;
  const connection = {
    async beginTransaction() {
      activeQueries = [];
      transactions.push(activeQueries);
    },
    async query(statement) {
      activeQueries.push(statement);
      if (failNextQuery) {
        failNextQuery = false;
        throw new Error("injected journal rollback");
      }
    },
    async commit() {},
    async rollback() {},
    release() {},
  };
  const pool = {
    async getConnection() {
      return connection;
    },
    async end() {},
  };

  try {
    const store = createMysqlAuthStore({
      mysqlPath: fakeMysqlPath,
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
    const successful = transactions[1];
    const receiptDeleteIndex = successful.findIndex((statement) => (
      statement.includes(`DELETE FROM mutation_receipts WHERE operation_id = '${oldOperationId}'`)
    ));
    const receiptInsertIndex = successful.findIndex((statement) => (
      statement.includes("INSERT INTO mutation_receipts") && statement.includes(oldOperationId)
    ));
    assert.ok(receiptDeleteIndex >= 0);
    assert.ok(receiptInsertIndex > receiptDeleteIndex);
    assert.equal(successful.filter((statement) => statement.includes(oldOperationId)).length, 2);
    assert.equal(successful.some((statement) => statement.includes("eqx_mysql_journal_append_0002")), true);
    assert.equal(successful.some((statement) => statement.includes("eqx_mysql_journal_baseline_0001")), false);
    await store.close();
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});
test("service replaces an expired receipt through the real mysql planner and then replays without SQL", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-service-mysql-journal-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const operationId = "operation_service_mysql_expired_0001";
  const token = "service_mysql_journal_token";
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
  let current = null;
  const connection = {
    async beginTransaction() {
      current = [];
      transactions.push(current);
    },
    async query(statement) {
      current.push(statement);
    },
    async commit() {},
    async rollback() {},
    release() {},
  };
  try {
    const mysqlStore = createMysqlAuthStore({
      mysqlPath: fakeMysqlPath,
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
    const deletion = transactions[0].findIndex((statement) => statement.startsWith("DELETE FROM mutation_receipts"));
    const insertion = transactions[0].findIndex((statement) => statement.startsWith("INSERT INTO mutation_receipts"));
    assert.ok(deletion >= 0 && insertion > deletion);
    assert.equal(transactions[0].some((statement) => statement.startsWith("INSERT INTO profiles")), true);

    const replay = await service.invokeDurable("bankDeposit", [token, {stoneCoins: 1}], operation);
    assert.equal(replay.ok, true);
    assert.equal(replay.durableCommit.replayed, true);
    assert.equal(transactions.length, 1);
    await service.stopDurableAdmissionsAndDrain();
    await mysqlStore.close();
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});
