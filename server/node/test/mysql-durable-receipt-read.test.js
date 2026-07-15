"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createAsyncWriteAuthStore,
} = require("../src/auth-service");
const {
  createMysqlAuthStore,
  __runMysqlDurableReceiptReadForTest,
  __runMysqlForTest,
} = require("../src/mysql-store");

const MYSQL_SESSION_POLICY_SQL =
  "SET SESSION innodb_lock_wait_timeout = ?, SESSION lock_wait_timeout = ?";
const OPERATION_ID = "op_mysql_exact_receipt_read_0001";

function receipt(overrides = {}) {
  return {
    schemaVersion: 1,
    operationId: OPERATION_ID,
    requestHash: "a".repeat(64),
    actionId: "POST /market/buy",
    accountId: "account_mysql_receipt_owner",
    committedAt: "2026-07-15T01:00:00.000Z",
    expiresAt: "2026-07-18T01:00:00.000Z",
    response: {ok: true, durableCommit: {operationId: OPERATION_ID}},
    ...overrides,
  };
}

function receiptRow(document = receipt(), overrides = {}) {
  return {
    store_revision: 7,
    operation_id: document.operationId,
    request_hash: document.requestHash,
    action_id: document.actionId,
    account_id: document.accountId || null,
    committed_at: document.committedAt,
    expires_at: document.expiresAt,
    document_json: document,
    ...overrides,
  };
}

function missingReceiptRow(overrides = {}) {
  return {
    store_revision: 7,
    operation_id: null,
    request_hash: null,
    action_id: null,
    account_id: null,
    committed_at: null,
    expires_at: null,
    document_json: null,
    ...overrides,
  };
}

function fakePool(rowsValue = [receiptRow()], options = {}) {
  const state = {
    begun: 0,
    committed: 0,
    destroyed: 0,
    events: [],
    queries: [],
    released: 0,
    rolledBack: 0,
  };
  const connection = {
    async beginTransaction() {
      state.begun += 1;
      state.events.push("begin");
    },
    async query(statement, params = []) {
      const rawSql = String(statement && statement.sql || statement).trim();
      const sql = rawSql.replace(/\s+/g, " ");
      if (rawSql === MYSQL_SESSION_POLICY_SQL) {
        assert.deepEqual(params, [3, 5]);
        state.events.push("session");
        if (options.sessionError) {
          throw options.sessionError;
        }
        return [{affectedRows: 0}, []];
      }
      assert.equal(/^SET\s+(?:GLOBAL|PERSIST|PERSIST_ONLY|SESSION)\b/i.test(sql), false, sql);
      state.events.push("query");
      state.queries.push({sql, params: structuredClone(params)});
      assert.match(sql, /FROM auth_store_revisions AS revision_row LEFT JOIN mutation_receipts AS receipt/i);
      assert.match(sql, /receipt\.operation_id = \?/i);
      assert.match(sql, /revision_row\.scope_key = \?$/i);
      return [structuredClone(rowsValue), []];
    },
    async commit() {
      state.committed += 1;
      state.events.push("commit");
      if (options.commitError) {
        throw options.commitError;
      }
    },
    async rollback() {
      state.rolledBack += 1;
      state.events.push("rollback");
    },
    release() {
      state.released += 1;
    },
    destroy() {
      state.destroyed += 1;
    },
  };
  return {
    pool: {
      async getConnection() { return connection; },
      async end() {},
    },
    state,
  };
}

test("exact receipt read uses one parameterized PK query behind the session policy", async () => {
  const fake = fakePool();
  const view = await __runMysqlDurableReceiptReadForTest(fake.pool, OPERATION_ID);
  assert.equal(view.schemaVersion, 1);
  assert.equal(view.operationId, OPERATION_ID);
  assert.equal(view.receipt.requestHash, "a".repeat(64));
  assert.deepEqual(fake.state.events, ["session", "begin", "query", "commit"]);
  assert.deepEqual(fake.state.queries, [{
    sql: "SELECT revision_row.revision AS store_revision, receipt.operation_id, receipt.request_hash, receipt.action_id, receipt.account_id, receipt.committed_at, receipt.expires_at, receipt.document_json FROM auth_store_revisions AS revision_row LEFT JOIN mutation_receipts AS receipt ON receipt.operation_id = ? WHERE revision_row.scope_key = ?",
    params: [OPERATION_ID, "auth"],
  }]);
  assert.equal(fake.state.committed, 1);
  assert.equal(fake.state.rolledBack, 0);
  assert.equal(fake.state.released, 1);
});

test("exact receipt read returns missing and expired rows without inventing active state", async () => {
  const missing = fakePool([missingReceiptRow()]);
  const missingView = await __runMysqlDurableReceiptReadForTest(missing.pool, OPERATION_ID);
  assert.equal(missingView.receipt, null);
  assert.equal(missing.state.committed, 1);

  const expiredDocument = receipt({expiresAt: "2026-07-15T02:00:00.000Z"});
  const expired = fakePool([receiptRow(expiredDocument)]);
  const expiredView = await __runMysqlDurableReceiptReadForTest(expired.pool, OPERATION_ID);
  assert.equal(expiredView.receipt.expiresAt, expiredDocument.expiresAt);
  assert.equal(expired.state.committed, 1);
});

test("exact receipt read rejects SQL mirror drift and malformed documents", async () => {
  for (const rows of [
    [receiptRow(receipt(), {request_hash: "b".repeat(64)})],
    [receiptRow(receipt(), {account_id: "another_account"})],
    [receiptRow(receipt(), {expires_at: "2026-07-19T01:00:00.000Z"})],
    [receiptRow({...receipt(), requestHash: "invalid"})],
  ]) {
    const fake = fakePool(rows);
    await assert.rejects(
      __runMysqlDurableReceiptReadForTest(fake.pool, OPERATION_ID),
      (error) => error
        && (error.code === "mysql_durable_receipt_integrity_invalid"
          || error.cause && error.cause.code === "mysql_durable_receipt_integrity_invalid"),
    );
    assert.equal(fake.state.committed, 0);
    assert.equal(fake.state.rolledBack, 1);
    assert.equal(fake.state.released, 1);
  }
});

test("exact receipt read destroys an ambiguous COMMIT connection without rollback or release", async () => {
  const fake = fakePool([receiptRow()], {commitError: new Error("commit acknowledgement lost")});
  await assert.rejects(
    __runMysqlDurableReceiptReadForTest(fake.pool, OPERATION_ID),
    (error) => error && error.code === "mysql_commit_outcome_ambiguous"
      && error.outcomeUnknown === true,
  );
  assert.equal(fake.state.committed, 1);
  assert.equal(fake.state.rolledBack, 0);
  assert.equal(fake.state.released, 0);
  assert.equal(fake.state.destroyed, 1);
});

test("exact receipt validation fails before pool checkout for an invalid operation ID", async () => {
  let checkouts = 0;
  await assert.rejects(
    __runMysqlDurableReceiptReadForTest({
      async getConnection() {
        checkouts += 1;
        throw new Error("must not acquire");
      },
    }, "short"),
    (error) => error && error.code === "durable_receipt_read_operation_invalid",
  );
  assert.equal(checkouts, 0);
});

test("cold MySQL store validates before pool creation and avoids a full authority load", async () => {
  const fake = fakePool([missingReceiptRow()]);
  let poolCreations = 0;
  const store = createMysqlAuthStore({
    mysqlPath: "/must/not/run/mysql",
    host: "127.0.0.1",
    port: 3306,
    user: "tester",
    password: "dummy",
    database: "beastbound_test",
    createDatabase: false,
    ensureSchema: false,
    usePool: true,
    poolFactory() {
      poolCreations += 1;
      return fake.pool;
    },
  });

  await assert.rejects(
    store.readDurableMutationReceipt("short"),
    (error) => error && error.code === "durable_receipt_read_operation_invalid",
  );
  assert.equal(poolCreations, 0);

  const view = await store.readDurableMutationReceipt(OPERATION_ID);
  assert.equal(view.receipt, null);
  assert.equal(view.storeRevision, 7);
  assert.equal(view.authorityCurrent, false);
  assert.equal(poolCreations, 1);
  assert.deepEqual(fake.state.events, ["session", "begin", "query", "commit"]);
  await store.close();
});

test("authority CLI timeout kills only the Beastbound child process", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-timeout-"));
  const fakeMysql = path.join(tempDir, "mysql");
  fs.writeFileSync(fakeMysql, "#!/bin/sh\nsleep 2\n", {mode: 0o700});
  t.after(() => fs.rmSync(tempDir, {recursive: true, force: true}));
  assert.throws(
    () => __runMysqlForTest({
      mysqlPath: fakeMysql,
      host: "127.0.0.1",
      port: 3306,
      user: "tester",
      password: "dummy",
      outputMaxBufferBytes: 1024,
    }, "", "SELECT 1", {timeoutMs: 25}),
    (error) => error && error.code === "mysql_command_timeout",
  );
});

test("async receipt reads wait behind the Node-local write tail and do not poison save state", async () => {
  let releaseSave;
  const saveGate = new Promise((resolve) => {
    releaseSave = resolve;
  });
  let saveStarted = false;
  let readStarted = false;
  const store = createAsyncWriteAuthStore({
    mode: "receipt-fifo-test",
    load: () => ({}),
    async saveAsync() {
      saveStarted = true;
      await saveGate;
    },
    async readDurableMutationReceipt(operationId) {
      readStarted = true;
      return {schemaVersion: 1, operationId, authorityCurrent: true, receipt: null};
    },
  }, {onError() {}});

  const save = store.save({schemaVersion: 1});
  const read = store.readDurableMutationReceipt(OPERATION_ID);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(saveStarted, true);
  assert.equal(readStarted, false);
  releaseSave();
  await save;
  const view = await read;
  assert.equal(view.receipt, null);
  assert.equal(readStarted, true);
  assert.equal(store.lastSaveError(), null);
  assert.equal(store.metrics().durableReceiptReads, 1);

  const failingStore = createAsyncWriteAuthStore({
    mode: "receipt-read-failure-test",
    load: () => ({}),
    async readDurableMutationReceipt() {
      throw new Error("read failed");
    },
  }, {onError() {}});
  await assert.rejects(failingStore.readDurableMutationReceipt(OPERATION_ID));
  assert.equal(failingStore.lastSaveError(), null);
});
