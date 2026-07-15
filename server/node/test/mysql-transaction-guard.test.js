"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MYSQL_COMMIT_OUTCOME_AMBIGUOUS,
  MYSQL_POOL_ACQUIRE_FAILED,
  MYSQL_POOL_ACQUIRE_TIMEOUT,
  MYSQL_SESSION_POLICY_FAILED,
  MYSQL_SESSION_POLICY_SQL,
  MYSQL_SESSION_POLICY_TIMEOUT,
  MYSQL_TRANSACTION_POLICY_DEFAULTS,
  MYSQL_TRANSACTION_POLICY_LIMITS,
  MYSQL_TRANSACTION_ROLLED_BACK,
  acquireMysqlPoolConnection,
  applyMysqlSessionPolicy,
  checkoutMysqlConnection,
  classifyMysqlTransactionFailure,
  createMysqlTransactionDeadlineController,
  destroyMysqlConnection,
  mysqlSessionPolicyStatement,
  normalizeMysqlTransactionPolicy,
} = require("../src/mysql-transaction-guard");

test("hard destruction evicts mysql2 connection and force-closes its socket", () => {
  let publicDestroys = 0;
  let socketDestroys = 0;
  const error = new Error("deadline");
  destroyMysqlConnection({
    destroy() { publicDestroys += 1; },
    connection: {
      stream: {
        destroyed: false,
        destroy() { socketDestroys += 1; this.destroyed = true; },
      },
    },
  }, error);
  assert.equal(publicDestroys, 1);
  assert.equal(socketDestroys, 1);
  assert.equal(error.destroyCause, undefined);
  assert.equal(error.socketDestroyCause, undefined);
});

test("policy defaults and safety ceilings normalize positive integer settings", () => {
  assert.deepEqual(normalizeMysqlTransactionPolicy(), MYSQL_TRANSACTION_POLICY_DEFAULTS);
  assert.deepEqual(normalizeMysqlTransactionPolicy({
    poolAcquireTimeoutMs: "7",
    sessionSetupTimeoutMs: 0,
    transactionTimeoutMs: -1,
    rowLockWaitTimeoutSeconds: 1.5,
    metadataLockWaitTimeoutSeconds: Number.MAX_SAFE_INTEGER,
  }), {
    poolAcquireTimeoutMs: 7,
    sessionSetupTimeoutMs: 1000,
    transactionTimeoutMs: 6000,
    rowLockWaitTimeoutSeconds: 3,
    metadataLockWaitTimeoutSeconds: MYSQL_TRANSACTION_POLICY_LIMITS.metadataLockWaitTimeoutSeconds,
  });
  const capped = normalizeMysqlTransactionPolicy(Object.fromEntries(
    Object.keys(MYSQL_TRANSACTION_POLICY_LIMITS).map((key) => [key, Number.MAX_SAFE_INTEGER]),
  ));
  assert.deepEqual(capped, MYSQL_TRANSACTION_POLICY_LIMITS);
  assert.equal(Object.isFrozen(capped), true);
});

test("session policy is exactly one parameterized SET SESSION statement", () => {
  const statement = mysqlSessionPolicyStatement({
    rowLockWaitTimeoutSeconds: 4,
    metadataLockWaitTimeoutSeconds: 6,
  });
  assert.equal(statement.sql, MYSQL_SESSION_POLICY_SQL);
  assert.deepEqual(statement.params, [4, 6]);
  assert.match(statement.sql, /^SET SESSION innodb_lock_wait_timeout = \?, SESSION lock_wait_timeout = \?$/);
  assert.doesNotMatch(statement.sql, /\b(?:GLOBAL|PERSIST|PERSIST_ONLY)\b/i);
  assert.equal(Object.isFrozen(statement.params), true);
});

test("pool acquire clears its timer after success and wraps early failure", async () => {
  const successTimers = fakeTimers();
  const connection = {release() {}};
  assert.equal(await acquireMysqlPoolConnection(
    {getConnection: () => Promise.resolve(connection)},
    {},
    {timers: successTimers},
  ), connection);
  assert.equal(successTimers.activeCount(), 0);

  const failureTimers = fakeTimers();
  const cause = Object.assign(new Error("offline"), {code: "ECONNREFUSED"});
  await assert.rejects(
    acquireMysqlPoolConnection(
      {getConnection: () => Promise.reject(cause)},
      {},
      {timers: failureTimers},
    ),
    (error) => error.code === MYSQL_POOL_ACQUIRE_FAILED && error.cause === cause,
  );
  assert.equal(failureTimers.activeCount(), 0);
});

test("pool acquire timeout releases a late connection without beginning a transaction", async () => {
  const timers = fakeTimers();
  const pending = deferred();
  let releases = 0;
  let begins = 0;
  const connection = {
    release() { releases += 1; },
    beginTransaction() { begins += 1; },
  };
  const checkout = acquireMysqlPoolConnection(
    {getConnection: () => pending.promise},
    {poolAcquireTimeoutMs: 1},
    {timers},
  );
  timers.fireNext();
  await assert.rejects(checkout, (error) => error.code === MYSQL_POOL_ACQUIRE_TIMEOUT);
  pending.resolve(connection);
  await flushMicrotasks();
  assert.equal(releases, 1);
  assert.equal(begins, 0);
  assert.equal(timers.activeCount(), 0);
});

test("session setup uses no mysql2 query timeout and clears its timer on success", async () => {
  const timers = fakeTimers();
  const calls = [];
  const connection = {
    query(...args) {
      calls.push(args);
      return Promise.resolve([[], []]);
    },
    destroy() {
      throw new Error("must not destroy a healthy connection");
    },
  };
  const statement = await applyMysqlSessionPolicy(connection, {}, {timers});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 2);
  assert.equal(calls[0][0], MYSQL_SESSION_POLICY_SQL);
  assert.deepEqual(calls[0][1], statement.params);
  assert.equal(timers.activeCount(), 0);
});

test("session setup failure and timeout destroy the connection fail-closed", async () => {
  for (const scenario of ["failure", "timeout"]) {
    const timers = fakeTimers();
    const pending = deferred();
    let destroys = 0;
    const connection = {
      query() {
        return scenario === "failure" ? Promise.reject(new Error("SET denied")) : pending.promise;
      },
      destroy() { destroys += 1; },
      release() {
        throw new Error("failed session must not return to the pool");
      },
    };
    const setup = applyMysqlSessionPolicy(
      connection,
      {sessionSetupTimeoutMs: 1},
      {timers},
    );
    if (scenario === "timeout") {
      timers.fireNext();
    }
    await assert.rejects(
      setup,
      (error) => error.code === (scenario === "failure"
        ? MYSQL_SESSION_POLICY_FAILED
        : MYSQL_SESSION_POLICY_TIMEOUT),
    );
    assert.equal(destroys, 1);
    assert.equal(timers.activeCount(), 0);
    pending.resolve();
  }
});

test("checkout applies the session policy before returning the acquired connection", async () => {
  const timers = fakeTimers();
  const events = [];
  const connection = {
    query(sql) {
      events.push(sql);
      return Promise.resolve();
    },
    destroy() {},
  };
  const result = await checkoutMysqlConnection(
    {getConnection() { events.push("acquire"); return Promise.resolve(connection); }},
    {},
    {timers},
  );
  assert.equal(result, connection);
  assert.deepEqual(events, ["acquire", MYSQL_SESSION_POLICY_SQL]);
  assert.equal(timers.activeCount(), 0);
});

test("transaction deadline before COMMIT is known rolled back and destroys the connection", async () => {
  const timers = fakeTimers();
  const pending = deferred();
  let destroys = 0;
  const controller = createMysqlTransactionDeadlineController(
    {destroy() { destroys += 1; }},
    {transactionTimeoutMs: 1},
    {timers},
  );
  const guarded = controller.track(pending.promise);
  timers.fireNext();
  await assert.rejects(
    guarded,
    (error) => error.code === MYSQL_TRANSACTION_ROLLED_BACK
      && error.noCommitGuaranteed === true
      && error.rollbackConfirmed === false
      && error.outcomeAmbiguous === false,
  );
  assert.equal(destroys, 1);
  pending.resolve("late");
  await flushMicrotasks();
});

test("transaction deadline after COMMIT dispatch is outcome ambiguous", async () => {
  const timers = fakeTimers();
  const pendingCommit = deferred();
  let destroys = 0;
  const controller = createMysqlTransactionDeadlineController(
    {destroy() { destroys += 1; }},
    {transactionTimeoutMs: 1},
    {timers},
  );
  controller.markCommitDispatched();
  const guardedCommit = controller.track(pendingCommit.promise);
  timers.fireNext();
  await assert.rejects(
    guardedCommit,
    (error) => error.code === MYSQL_COMMIT_OUTCOME_AMBIGUOUS
      && error.rollbackConfirmed === false
      && error.retryable === false,
  );
  assert.equal(destroys, 1);
  pendingCommit.reject(new Error("late socket close"));
  await flushMicrotasks();
});

test("driver lock timeout and deadlock are classified as definite rollbacks", () => {
  for (const driverCode of ["ER_LOCK_WAIT_TIMEOUT", "ER_LOCK_DEADLOCK"]) {
    const cause = Object.assign(new Error(driverCode), {code: driverCode});
    const result = classifyMysqlTransactionFailure(cause, {commitDispatched: true});
    assert.equal(result.code, MYSQL_TRANSACTION_ROLLED_BACK);
    assert.equal(result.mysqlCode, driverCode);
    assert.equal(result.noCommitGuaranteed, true);
    assert.equal(result.rollbackConfirmed, false);
    assert.equal(result.cause, cause);
    assert.equal(
      classifyMysqlTransactionFailure(cause, {rollbackCompleted: true}).rollbackConfirmed,
      true,
    );
  }
  const connectionLoss = Object.assign(new Error("lost"), {code: "PROTOCOL_CONNECTION_LOST"});
  assert.equal(
    classifyMysqlTransactionFailure(connectionLoss, {commitDispatched: true}).code,
    MYSQL_COMMIT_OUTCOME_AMBIGUOUS,
  );
});

test("completed transaction clears its deadline timer without destroying the connection", async () => {
  const timers = fakeTimers();
  let destroys = 0;
  const controller = createMysqlTransactionDeadlineController(
    {destroy() { destroys += 1; }},
    {},
    {timers},
  );
  assert.equal(await controller.track(Promise.resolve("committed")), "committed");
  controller.complete();
  assert.equal(controller.isFinished(), true);
  assert.equal(timers.activeCount(), 0);
  timers.fireAll();
  assert.equal(destroys, 0);
});

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
    fireAll() {
      for (const token of active.filter((candidate) => candidate.active)) {
        token.active = false;
        token.callback();
      }
    },
    activeCount() {
      return active.filter((candidate) => candidate.active).length;
    },
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}
