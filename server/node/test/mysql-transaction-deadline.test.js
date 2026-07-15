"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  __runMysqlGuardedPoolTransactionForTest: runMysqlTransaction,
  createMysqlAuthStore,
} = require("../src/mysql-store");
const {
  MYSQL_COMMIT_OUTCOME_AMBIGUOUS,
  MYSQL_POOL_ACQUIRE_TIMEOUT,
  MYSQL_SESSION_POLICY_FAILED,
  MYSQL_SESSION_POLICY_SQL,
  MYSQL_TRANSACTION_ROLLED_BACK,
} = require("../src/mysql-transaction-guard");

test("Beastbound pool bounds connect and queue waits without server-global settings", async () => {
  let poolOptions = null;
  let healthQueries = 0;
  let closes = 0;
  const store = createMysqlAuthStore({
    ensureSchema: false,
    usePool: true,
    poolConnectTimeoutMs: 2500,
    poolQueueLimit: 7,
    poolFactory(options) {
      poolOptions = options;
      return {
        getConnection() { throw new Error("not used by health probe"); },
        query() { healthQueries += 1; return Promise.resolve([[], []]); },
        end() { closes += 1; return Promise.resolve(); },
      };
    },
  });
  await store.checkHealthAsync();
  await store.close();
  assert.equal(poolOptions.connectTimeout, 2500);
  assert.equal(poolOptions.queueLimit, 7);
  assert.equal(poolOptions.waitForConnections, true);
  assert.equal(Object.hasOwn(poolOptions, "acquireTimeout"), false);
  assert.equal(healthQueries, 1);
  assert.equal(closes, 1);
});

test("checkout configures only the Beastbound session before isolation and BEGIN", async () => {
  const timers = fakeTimers();
  const fixture = fakeConnection();
  const result = await runMysqlTransaction(
    {getConnection: async () => {
      fixture.events.push("acquire");
      return fixture.connection;
    }},
    {transactionGuardOptions: {timers}},
    async (connection) => {
      await connection.query("SELECT business_row FOR UPDATE");
      return "committed";
    },
    {beforeBegin: (connection) => connection.query(
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ",
    )},
  );

  assert.equal(result, "committed");
  assert.deepEqual(fixture.events, [
    "acquire",
    `query:${MYSQL_SESSION_POLICY_SQL}:3,5`,
    "query:SET TRANSACTION ISOLATION LEVEL REPEATABLE READ:",
    "begin",
    "query:SELECT business_row FOR UPDATE:",
    "commit",
    "release",
  ]);
  assert.equal(fixture.destroys(), 0);
  assert.equal(timers.activeCount(), 0);
});

test("pool acquire timeout never starts work and releases a late connection", async () => {
  const timers = fakeTimers();
  const acquired = deferred();
  const fixture = fakeConnection();
  let businessCalls = 0;
  const operation = runMysqlTransaction(
    {getConnection: () => acquired.promise},
    {
      transactionPolicy: {poolAcquireTimeoutMs: 1},
      transactionGuardOptions: {timers},
    },
    async () => { businessCalls += 1; },
  );
  timers.fireNext();
  await assert.rejects(operation, (error) => error.code === MYSQL_POOL_ACQUIRE_TIMEOUT
    && error.transactionPhase === "not_started"
    && error.outcomeUnknown === false);
  acquired.resolve(fixture.connection);
  await flushMicrotasks();
  assert.equal(businessCalls, 0);
  assert.deepEqual(fixture.events, ["release"]);
});

test("session policy failure destroys the connection before BEGIN", async () => {
  const timers = fakeTimers();
  const fixture = fakeConnection({
    query(sql) {
      if (sql === MYSQL_SESSION_POLICY_SQL) {
        return Promise.reject(new Error("SET denied"));
      }
      return Promise.resolve([[], []]);
    },
  });
  await assert.rejects(
    runMysqlTransaction(
      {getConnection: async () => fixture.connection},
      {transactionGuardOptions: {timers}},
      async () => { throw new Error("business must not run"); },
    ),
    (error) => error.code === MYSQL_SESSION_POLICY_FAILED
      && error.transactionPhase === "not_started"
      && error.outcomeUnknown === false,
  );
  assert.equal(fixture.destroys(), 1);
  assert.equal(fixture.events.includes("begin"), false);
  assert.equal(fixture.events.includes("release"), false);
});

test("row lock timeout rolls back the whole transaction before releasing", async () => {
  const timers = fakeTimers();
  const lockError = Object.assign(new Error("lock wait"), {code: "ER_LOCK_WAIT_TIMEOUT"});
  const fixture = fakeConnection({
    query(sql) {
      if (sql === "UPDATE locked_row") {
        return Promise.reject(lockError);
      }
      return Promise.resolve([[], []]);
    },
  });
  await assert.rejects(
    runMysqlTransaction(
      {getConnection: async () => fixture.connection},
      {transactionGuardOptions: {timers}},
      (connection) => connection.query("UPDATE locked_row"),
    ),
    (error) => error.code === MYSQL_TRANSACTION_ROLLED_BACK
      && error.mysqlCode === "ER_LOCK_WAIT_TIMEOUT"
      && error.rollbackConfirmed === true
      && error.outcomeUnknown === false,
  );
  assert.equal(fixture.events.includes("rollback"), true);
  assert.equal(fixture.events.at(-1), "release");
  assert.equal(fixture.destroys(), 0);
});

test("pre-COMMIT hard deadline destroys the connection with a known no-commit result", async () => {
  const timers = fakeTimers();
  const blocked = deferred();
  const fixture = fakeConnection({
    query(sql) {
      return sql === "UPDATE blocked_row" ? blocked.promise : Promise.resolve([[], []]);
    },
  });
  const operation = runMysqlTransaction(
    {getConnection: async () => fixture.connection},
    {
      transactionPolicy: {transactionTimeoutMs: 1},
      transactionGuardOptions: {timers},
    },
    (connection) => connection.query("UPDATE blocked_row"),
  );
  await waitFor(() => fixture.events.includes("query:UPDATE blocked_row:"));
  timers.fireNext();
  await assert.rejects(operation, (error) => error.code === MYSQL_TRANSACTION_ROLLED_BACK
    && error.timeout === true
    && error.noCommitGuaranteed === true
    && error.outcomeUnknown === false);
  assert.equal(fixture.destroys(), 1);
  assert.equal(fixture.events.includes("rollback"), false);
  assert.equal(fixture.events.includes("release"), false);
  blocked.resolve([[], []]);
});

test("deadline after COMMIT dispatch is ambiguous and never sends ROLLBACK", async () => {
  const timers = fakeTimers();
  const pendingCommit = deferred();
  const fixture = fakeConnection({commit: () => pendingCommit.promise});
  const operation = runMysqlTransaction(
    {getConnection: async () => fixture.connection},
    {
      transactionPolicy: {transactionTimeoutMs: 1},
      transactionGuardOptions: {timers},
    },
    (connection) => connection.query("UPDATE ready_row"),
  );
  await waitFor(() => fixture.events.includes("commit"));
  timers.fireNext();
  await assert.rejects(operation, (error) => error.code === MYSQL_COMMIT_OUTCOME_AMBIGUOUS
    && error.transactionPhase === "commit_ambiguous"
    && error.outcomeUnknown === true
    && error.rollbackConfirmed === false);
  assert.equal(fixture.destroys(), 1);
  assert.equal(fixture.events.includes("rollback"), false);
  assert.equal(fixture.events.includes("release"), false);
  pendingCommit.reject(new Error("late socket close"));
  await flushMicrotasks();
});

function fakeConnection(overrides = {}) {
  const events = [];
  let destroyCount = 0;
  const connection = {
    query(sql, params = []) {
      events.push(`query:${sql}:${params.join(",")}`);
      if (typeof overrides.query === "function") {
        return overrides.query(sql, params);
      }
      return Promise.resolve([[], []]);
    },
    beginTransaction() {
      events.push("begin");
      return typeof overrides.beginTransaction === "function"
        ? overrides.beginTransaction()
        : Promise.resolve();
    },
    commit() {
      events.push("commit");
      return typeof overrides.commit === "function" ? overrides.commit() : Promise.resolve();
    },
    rollback() {
      events.push("rollback");
      return typeof overrides.rollback === "function" ? overrides.rollback() : Promise.resolve();
    },
    release() {
      events.push("release");
    },
    destroy() {
      destroyCount += 1;
      events.push("destroy");
    },
  };
  return {connection, events, destroys: () => destroyCount};
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
    activeCount() {
      return active.filter((token) => token.active).length;
    },
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

async function waitFor(predicate) {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) {
      return;
    }
    await flushMicrotasks();
  }
  assert.fail("condition did not become true");
}
