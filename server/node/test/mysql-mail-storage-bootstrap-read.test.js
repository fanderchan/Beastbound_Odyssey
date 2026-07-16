"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  readMysqlMailStorageBootstrapSnapshot,
} = require("../src/mysql-mail-storage-bootstrap-read");
const {createMysqlAuthStore} = require("../src/mysql-store");
const {
  buildMailStorageCanonicalContractOutputForTest,
} = require("../src/mysql-mail-storage-schema");
const {
  MYSQL_SESSION_POLICY_SQL,
  MYSQL_TRANSACTION_ROLLED_BACK,
} = require("../src/mysql-transaction-guard");

const CONTROL_ROW = Object.freeze([
  "mail_lifecycle",
  "1",
  "0",
  "uninitialized",
  "0",
  "0",
  "0",
  "",
  "0",
  "0",
  "0",
  "0",
  "",
  "",
]);

test("bootstrap reader uses one read-only consistent snapshot and returns strict projections", async () => {
  const fixture = fixtureRows({includeSidecars: true});
  const fake = fakeMysqlPool({rows: fixture});

  const snapshot = await readMysqlMailStorageBootstrapSnapshot(fake.pool, {
    database: "beastbound_odyssey",
    transactionPolicy: {
      rowLockWaitTimeoutSeconds: 2,
      metadataLockWaitTimeoutSeconds: 4,
    },
  });

  assert.equal(fake.state.acquires, 1);
  assert.equal(fake.state.releases, 1);
  assert.equal(fake.state.destroys, 0);
  assert.equal(snapshot.schemaContract.ok, true);
  assert.equal(snapshot.schemaContract.actualRowCount, snapshot.schemaContract.expectedRowCount);
  assert.deepEqual(snapshot.control, {
    scopeKey: "mail_lifecycle",
    schemaGeneration: 1,
    dataGeneration: 0,
    lifecycleState: "uninitialized",
    archiveEnabled: false,
    vaultClaimEnabled: false,
    activeLimitEnabled: false,
    bootstrapCursorMailId: "",
    bootstrapSourceCount: 0,
    bootstrapIdentityCount: 0,
    bootstrapRecipientCount: 0,
    bootstrapActiveCount: 0,
    sourceDigest: "",
    reconciledAt: "",
  });
  assert.deepEqual(snapshot.sourceRows, [{
    mail_id: "mail_1",
    sender_account_id: "sender_1",
    recipient_account_id: "recipient_1",
    title: "测试邮件",
    created_at: "2026-07-16T00:00:00.000Z",
    read_at: null,
    document_json: {mailId: "mail_1", nested: {count: 1}},
  }]);
  assert.deepEqual(snapshot.identityRows, [{
    mailId: "mail_1",
    senderAccountId: "sender_1",
    recipientAccountId: "recipient_1",
    location: "active",
    createdAt: "2026-07-16T00:00:00.000Z",
    settledAt: null,
    archivedAt: null,
    identityDigest: "a".repeat(64),
    documentDigest: "b".repeat(64),
    rewardId: null,
    dataGeneration: 1,
    revision: 0,
  }]);
  assert.deepEqual(snapshot.counterRows, [{
    recipientAccountId: "recipient_1",
    activeCount: 1,
    dataGeneration: 1,
    revision: 0,
  }]);
  assert.deepEqual(snapshot.archiveRows, [{mailId: "archive_1"}]);
  assert.deepEqual(snapshot.vaultRows, [{rewardId: "reward_1"}]);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.sourceRows[0].document_json.nested), true);

  const queries = fake.state.queries;
  assert.equal(queries[0].sql, MYSQL_SESSION_POLICY_SQL);
  assert.deepEqual(queries[0].params, [2, 4]);
  assert.equal(queries[1].sql, "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  assert.equal(queries[2].sql, "START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY");
  assert.match(queries[3].sql, /FROM information_schema\.tables/);
  assert.match(queries[4].sql, /FROM mail_storage_control/);
  assert.match(queries[5].sql, /FROM mail_messages/);
  assert.match(queries[6].sql, /FROM mail_identity_registry/);
  assert.match(queries[7].sql, /FROM mail_active_counters/);
  assert.match(queries[8].sql, /FROM mail_archive_messages/);
  assert.match(queries[9].sql, /FROM reward_vault_entries/);
  assert.equal(queries[10].sql, "ROLLBACK");
  assert.equal(queries.slice(3, 10).every((entry) => entry.rowsAsArray === true), true);

  for (const {sql} of queries) {
    assert.match(sql.trim(), /^(?:SET SESSION|SET TRANSACTION|START TRANSACTION|SELECT|ROLLBACK)\b/i);
    const executableSql = sqlWithoutStringLiterals(sql);
    assert.doesNotMatch(executableSql, /\b(?:COMMIT|INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|TRUNCATE|GLOBAL|PERSIST|PERSIST_ONLY)\b/i);
    assert.doesNotMatch(
      executableSql,
      /\bFOR\s+(?:UPDATE|SHARE)\b|\bLOCK\s+IN\s+SHARE\s+MODE\b/i,
    );
    assert.doesNotMatch(
      executableSql,
      /\bINTO\s+(?:OUTFILE|DUMPFILE)\b|\b(?:LOAD_FILE|GET_LOCK|RELEASE_LOCK|SLEEP|BENCHMARK)\s*\(/i,
    );
  }
});

test("schema drift fails closed, rolls back, and never reads player mail", async () => {
  const rows = fixtureRows();
  rows.contract = rows.contract.slice(1);
  const fake = fakeMysqlPool({rows});

  await assert.rejects(
    readMysqlMailStorageBootstrapSnapshot(fake.pool, {database: "beastbound_odyssey"}),
    (error) => error.code === "mysql_mail_storage_schema_contract_invalid",
  );

  assert.equal(fake.state.queries.some(({sql}) => /FROM mail_messages\b/.test(sql)), false);
  assert.equal(fake.state.queries.at(-1).sql, "ROLLBACK");
  assert.equal(fake.state.releases, 1);
  assert.equal(fake.state.destroys, 0);
});

test("control output must contain exactly one strict row", async () => {
  const rows = fixtureRows();
  rows.control = [CONTROL_ROW, CONTROL_ROW];
  const fake = fakeMysqlPool({rows});

  await assert.rejects(
    readMysqlMailStorageBootstrapSnapshot(fake.pool, {database: "beastbound_odyssey"}),
    (error) => error.code === "mysql_mail_storage_control_row_invalid" && error.rowCount === 2,
  );

  assert.equal(fake.state.queries.at(-1).sql, "ROLLBACK");
  assert.equal(fake.state.releases, 1);
});

test("unsafe integers and malformed JSON are rejected without a partial snapshot", async (t) => {
  await t.test("unsafe sidecar counter", async () => {
    const rows = fixtureRows({includeSidecars: true});
    rows.counter[0][1] = "9007199254740992";
    const fake = fakeMysqlPool({rows});

    await assert.rejects(
      readMysqlMailStorageBootstrapSnapshot(fake.pool, {database: "beastbound_odyssey"}),
      (error) => error.code === "mysql_mail_storage_bootstrap_value_invalid"
        && error.path === "counter[0].active_count",
    );
    assert.equal(fake.state.queries.at(-1).sql, "ROLLBACK");
    assert.equal(fake.state.releases, 1);
  });

  await t.test("malformed source document", async () => {
    const rows = fixtureRows();
    rows.source[0][6] = "{not-json";
    const fake = fakeMysqlPool({rows});

    await assert.rejects(
      readMysqlMailStorageBootstrapSnapshot(fake.pool, {database: "beastbound_odyssey"}),
      (error) => error.code === "mysql_mail_storage_bootstrap_json_invalid"
        && error.path === "source[0].document_json",
    );
    assert.equal(fake.state.queries.at(-1).sql, "ROLLBACK");
    assert.equal(fake.state.releases, 1);
  });
});

test("START and SELECT failures attempt ROLLBACK then release a known-clean connection", async (t) => {
  for (const failAt of ["start", "source"]) {
    await t.test(failAt, async () => {
      const driverError = Object.assign(new Error(`${failAt} failed`), {code: "ER_TEST_FAILURE"});
      const fake = fakeMysqlPool({
        rows: fixtureRows(),
        fail(sql) {
          if (
            (failAt === "start" && /^START TRANSACTION/.test(sql))
            || (failAt === "source" && /FROM mail_messages\b/.test(sql))
          ) {
            return driverError;
          }
          return null;
        },
      });

      await assert.rejects(
        readMysqlMailStorageBootstrapSnapshot(fake.pool, {database: "beastbound_odyssey"}),
        (error) => error.code === MYSQL_TRANSACTION_ROLLED_BACK
          && error.cause === driverError
          && error.rollbackConfirmed === true,
      );
      assert.equal(fake.state.queries.at(-1).sql, "ROLLBACK");
      assert.equal(fake.state.releases, 1);
      assert.equal(fake.state.destroys, 0);
    });
  }
});

test("ROLLBACK failure destroys the connection and never releases it", async () => {
  const rollbackCause = Object.assign(new Error("rollback lost"), {code: "ECONNRESET"});
  const fake = fakeMysqlPool({
    rows: fixtureRows(),
    fail(sql) {
      return sql === "ROLLBACK" ? rollbackCause : null;
    },
  });

  await assert.rejects(
    readMysqlMailStorageBootstrapSnapshot(fake.pool, {database: "beastbound_odyssey"}),
    (error) => error.code === "mysql_mail_storage_bootstrap_rollback_failed"
      && error.cause === rollbackCause,
  );
  assert.equal(fake.state.destroys, 1);
  assert.equal(fake.state.releases, 0);
});

test("hard deadline destroys a blocked snapshot connection without late ROLLBACK or release", async () => {
  const timers = fakeTimers();
  const blocked = deferred();
  const fake = fakeMysqlPool({
    rows: fixtureRows(),
    wait(sql) {
      return /FROM mail_messages\b/.test(sql) ? blocked.promise : null;
    },
  });

  const reading = readMysqlMailStorageBootstrapSnapshot(fake.pool, {
    database: "beastbound_odyssey",
    transactionPolicy: {transactionTimeoutMs: 1},
    transactionGuardOptions: {timers},
  });
  await waitUntil(() => fake.state.queries.some(({sql}) => /FROM mail_messages\b/.test(sql)));
  timers.fireNext();

  await assert.rejects(
    reading,
    (error) => error.code === MYSQL_TRANSACTION_ROLLED_BACK
      && error.timeout === true
      && error.noCommitGuaranteed === true,
  );
  assert.equal(fake.state.destroys, 1);
  assert.equal(fake.state.releases, 0);
  assert.equal(fake.state.queries.some(({sql}) => sql === "ROLLBACK"), false);
  blocked.resolve([[], []]);
  await flushMicrotasks();
});

test("mysql store exposes the reader only through a read-only pooled boundary", async () => {
  const fake = fakeMysqlPool({rows: fixtureRows()});
  const readStore = createMysqlAuthStore({
    readOnly: true,
    ensureSchema: false,
    usePool: true,
    database: "beastbound_odyssey",
    poolFactory: () => fake.pool,
  });

  const snapshot = await readStore.readMailStorageBootstrapSnapshot();
  await readStore.close();
  assert.equal(snapshot.control.lifecycleState, "uninitialized");
  assert.equal(fake.state.acquires, 1);
  assert.equal(fake.state.ends, 1);

  let writablePoolFactoryCalls = 0;
  const writeStore = createMysqlAuthStore({
    readOnly: false,
    ensureSchema: false,
    usePool: true,
    poolFactory() {
      writablePoolFactoryCalls += 1;
      return fake.pool;
    },
  });
  await assert.rejects(
    writeStore.readMailStorageBootstrapSnapshot(),
    (error) => error.code === "mysql_mail_storage_bootstrap_read_only_store_required",
  );
  assert.equal(writablePoolFactoryCalls, 0);
  await writeStore.close();
});

function fixtureRows(options = {}) {
  const includeSidecars = options.includeSidecars === true;
  return {
    contract: canonicalContractRows(),
    control: [CONTROL_ROW.slice()],
    source: [[
      "mail_1",
      "sender_1",
      "recipient_1",
      "测试邮件",
      "2026-07-16T00:00:00.000Z",
      null,
      {mailId: "mail_1", nested: {count: 1}},
    ]],
    identity: includeSidecars ? [[
      "mail_1",
      "sender_1",
      "recipient_1",
      "active",
      "2026-07-16T00:00:00.000Z",
      null,
      null,
      "a".repeat(64),
      "b".repeat(64),
      null,
      "1",
      "0",
    ]] : [],
    counter: includeSidecars ? [["recipient_1", "1", 1, 0n]] : [],
    archive: includeSidecars ? [["archive_1"]] : [],
    vault: includeSidecars ? [["reward_1"]] : [],
  };
}

function canonicalContractRows() {
  return buildMailStorageCanonicalContractOutputForTest()
    .trimEnd()
    .split("\n")
    .map((line) => line.split("\t"));
}

function fakeMysqlPool(options = {}) {
  const state = {acquires: 0, releases: 0, destroys: 0, ends: 0, queries: []};
  const rows = options.rows || fixtureRows();
  const connection = {
    query(sqlValue, params) {
      const sql = typeof sqlValue === "object" ? sqlValue.sql : sqlValue;
      state.queries.push({
        sql,
        params,
        rowsAsArray: Boolean(sqlValue && typeof sqlValue === "object" && sqlValue.rowsAsArray),
      });
      const failure = typeof options.fail === "function" ? options.fail(sql) : null;
      if (failure) {
        return Promise.reject(failure);
      }
      const pending = typeof options.wait === "function" ? options.wait(sql) : null;
      if (pending) {
        return pending;
      }
      return Promise.resolve([rowsForSql(rows, sql), []]);
    },
    release() { state.releases += 1; },
    destroy() { state.destroys += 1; },
  };
  return {
    state,
    pool: {
      getConnection() {
        state.acquires += 1;
        return Promise.resolve(connection);
      },
      end() {
        state.ends += 1;
        return Promise.resolve();
      },
    },
  };
}

function rowsForSql(rows, sql) {
  if (/FROM information_schema\.tables/.test(sql)) return rows.contract;
  if (/FROM mail_storage_control/.test(sql)) return rows.control;
  if (/FROM mail_messages\b/.test(sql)) return rows.source;
  if (/FROM mail_identity_registry/.test(sql)) return rows.identity;
  if (/FROM mail_active_counters/.test(sql)) return rows.counter;
  if (/FROM mail_archive_messages/.test(sql)) return rows.archive;
  if (/FROM reward_vault_entries/.test(sql)) return rows.vault;
  return [];
}

function sqlWithoutStringLiterals(sql) {
  return sql.replace(/'(?:''|\\.|[^'])*'/g, "''");
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

function fakeTimers() {
  const active = [];
  return {
    setTimeout(callback, timeoutMs) {
      const token = {callback, timeoutMs, active: true, unref() {}};
      active.push(token);
      return token;
    },
    clearTimeout(token) {
      token.active = false;
    },
    fireNext() {
      const token = active.find((candidate) => candidate.active);
      assert.ok(token, "expected an active timer");
      token.active = false;
      token.callback();
    },
  };
}

async function waitUntil(predicate) {
  for (let index = 0; index < 30; index += 1) {
    if (predicate()) {
      return;
    }
    await flushMicrotasks();
  }
  assert.fail("condition did not become true");
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}
