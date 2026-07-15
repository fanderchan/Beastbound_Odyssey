"use strict";

const MYSQL_POOL_ACQUIRE_TIMEOUT = "mysql_pool_acquire_timeout";
const MYSQL_POOL_ACQUIRE_FAILED = "mysql_pool_acquire_failed";
const MYSQL_SESSION_POLICY_TIMEOUT = "mysql_session_policy_timeout";
const MYSQL_SESSION_POLICY_FAILED = "mysql_session_policy_failed";
const MYSQL_TRANSACTION_ROLLED_BACK = "mysql_transaction_rolled_back";
const MYSQL_COMMIT_OUTCOME_AMBIGUOUS = "mysql_commit_outcome_ambiguous";

const MYSQL_TRANSACTION_POLICY_DEFAULTS = Object.freeze({
  poolAcquireTimeoutMs: 2000,
  sessionSetupTimeoutMs: 1000,
  transactionTimeoutMs: 6000,
  rowLockWaitTimeoutSeconds: 3,
  metadataLockWaitTimeoutSeconds: 5,
});

const MYSQL_TRANSACTION_POLICY_LIMITS = Object.freeze({
  poolAcquireTimeoutMs: 30000,
  sessionSetupTimeoutMs: 10000,
  transactionTimeoutMs: 60000,
  rowLockWaitTimeoutSeconds: 30,
  metadataLockWaitTimeoutSeconds: 60,
});

const MYSQL_SESSION_POLICY_SQL =
  "SET SESSION innodb_lock_wait_timeout = ?, SESSION lock_wait_timeout = ?";
const MYSQL_DEFINITE_ROLLBACK_DRIVER_CODES = new Set([
  "ER_LOCK_WAIT_TIMEOUT",
  "ER_LOCK_DEADLOCK",
]);

function normalizeMysqlTransactionPolicy(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const policy = {};
  for (const key of Object.keys(MYSQL_TRANSACTION_POLICY_DEFAULTS)) {
    policy[key] = boundedPositiveInteger(
      source[key],
      MYSQL_TRANSACTION_POLICY_DEFAULTS[key],
      MYSQL_TRANSACTION_POLICY_LIMITS[key],
    );
  }
  return Object.freeze(policy);
}

function mysqlSessionPolicyStatement(policyValue = {}) {
  const policy = normalizeMysqlTransactionPolicy(policyValue);
  return Object.freeze({
    sql: MYSQL_SESSION_POLICY_SQL,
    params: Object.freeze([
      policy.rowLockWaitTimeoutSeconds,
      policy.metadataLockWaitTimeoutSeconds,
    ]),
  });
}

async function acquireMysqlPoolConnection(pool, policyValue = {}, options = {}) {
  if (!pool || typeof pool.getConnection !== "function") {
    throw mysqlGuardError(MYSQL_POOL_ACQUIRE_FAILED, "MySQL 连接池不可用。");
  }
  const policy = normalizeMysqlTransactionPolicy(policyValue);
  const timers = mysqlGuardTimers(options);
  return settleWithDeadline({
    timeoutMs: policy.poolAcquireTimeoutMs,
    timers,
    operation: () => pool.getConnection(),
    timeoutError: () => mysqlGuardError(
      MYSQL_POOL_ACQUIRE_TIMEOUT,
      "等待 MySQL 连接超时。",
      {
        timeoutMs: policy.poolAcquireTimeoutMs,
        transactionPhase: "not_started",
        outcomeUnknown: false,
        retryable: true,
      },
    ),
    failureError: (cause) => mysqlGuardError(
      MYSQL_POOL_ACQUIRE_FAILED,
      "获取 MySQL 连接失败。",
      {
        cause,
        transactionPhase: "not_started",
        outcomeUnknown: false,
        retryable: true,
      },
    ),
    onLateSuccess: (connection, timeoutError) => {
      try {
        connection?.release?.();
      } catch (releaseError) {
        timeoutError.releaseCause = releaseError;
      }
    },
  });
}

async function applyMysqlSessionPolicy(connection, policyValue = {}, options = {}) {
  if (!connection || typeof connection.query !== "function") {
    throw mysqlGuardError(MYSQL_SESSION_POLICY_FAILED, "MySQL 会话连接不可用。");
  }
  const policy = normalizeMysqlTransactionPolicy(policyValue);
  const statement = mysqlSessionPolicyStatement(policy);
  const timers = mysqlGuardTimers(options);
  try {
    await settleWithDeadline({
      timeoutMs: policy.sessionSetupTimeoutMs,
      timers,
      operation: () => connection.query(statement.sql, statement.params),
      timeoutError: () => mysqlGuardError(
        MYSQL_SESSION_POLICY_TIMEOUT,
        "设置 MySQL 会话锁等待策略超时。",
        {
          timeoutMs: policy.sessionSetupTimeoutMs,
          transactionPhase: "not_started",
          outcomeUnknown: false,
          retryable: true,
        },
      ),
      failureError: (cause) => mysqlGuardError(
        MYSQL_SESSION_POLICY_FAILED,
        "设置 MySQL 会话锁等待策略失败。",
        {
          cause,
          transactionPhase: "not_started",
          outcomeUnknown: false,
          retryable: true,
        },
      ),
    });
    return statement;
  } catch (error) {
    destroyMysqlConnection(connection, error);
    throw error;
  }
}

async function checkoutMysqlConnection(pool, policyValue = {}, options = {}) {
  const policy = normalizeMysqlTransactionPolicy(policyValue);
  const connection = await acquireMysqlPoolConnection(pool, policy, options);
  await applyMysqlSessionPolicy(connection, policy, options);
  return connection;
}

function createMysqlTransactionDeadlineController(connection, policyValue = {}, options = {}) {
  if (!connection || typeof connection.destroy !== "function") {
    throw new TypeError("MySQL transaction deadline requires a destroyable connection.");
  }
  const policy = normalizeMysqlTransactionPolicy(policyValue);
  const timers = mysqlGuardTimers(options);
  let commitDispatched = false;
  let finished = false;
  let terminalError = null;
  const waiters = new Set();
  let timer = timers.setTimeout(() => {
    timer = null;
    if (finished) {
      return;
    }
    terminalError = transactionOutcomeError(null, {commitDispatched, timedOut: true});
    finished = true;
    destroyMysqlConnection(connection, terminalError);
    for (const waiter of waiters) {
      waiter.reject(terminalError);
    }
    waiters.clear();
  }, policy.transactionTimeoutMs);
  timer?.unref?.();

  function track(operationValue, trackOptions = {}) {
    if (terminalError !== null) {
      return Promise.reject(terminalError);
    }
    if (finished) {
      return Promise.reject(new Error("MySQL transaction deadline controller is finished."));
    }
    return new Promise((resolve, reject) => {
      const waiter = {reject};
      waiters.add(waiter);
      Promise.resolve(operationValue).then((value) => {
        if (!waiters.delete(waiter)) {
          return;
        }
        resolve(value);
      }, (error) => {
        if (!waiters.delete(waiter)) {
          return;
        }
        reject(trackOptions.classifyFailure === false
          ? error
          : classifyMysqlTransactionFailure(error, {commitDispatched}));
      });
    });
  }

  function markCommitDispatched() {
    if (finished) {
      throw terminalError || new Error("MySQL transaction deadline controller is finished.");
    }
    commitDispatched = true;
  }

  function complete() {
    if (timer !== null) {
      timers.clearTimeout(timer);
      timer = null;
    }
    finished = true;
  }

  return Object.freeze({
    track,
    markCommitDispatched,
    complete,
    isCommitDispatched: () => commitDispatched,
    isFinished: () => finished,
  });
}

function classifyMysqlTransactionFailure(error, options = {}) {
  if (error && [MYSQL_TRANSACTION_ROLLED_BACK, MYSQL_COMMIT_OUTCOME_AMBIGUOUS].includes(error.code)) {
    if (error.code === MYSQL_TRANSACTION_ROLLED_BACK && options.rollbackCompleted === true) {
      error.rollbackConfirmed = true;
    }
    return error;
  }
  const driverCode = String(error && error.code || "");
  if (MYSQL_DEFINITE_ROLLBACK_DRIVER_CODES.has(driverCode)) {
    return transactionOutcomeError(error, {
      commitDispatched: false,
      definiteDriverRollback: true,
      rollbackCompleted: options.rollbackCompleted === true,
    });
  }
  return transactionOutcomeError(error, {
    commitDispatched: options.commitDispatched === true,
    rollbackCompleted: options.rollbackCompleted === true,
  });
}

function transactionOutcomeError(cause, options = {}) {
  const ambiguous = options.commitDispatched === true && options.definiteDriverRollback !== true;
  return mysqlGuardError(
    ambiguous ? MYSQL_COMMIT_OUTCOME_AMBIGUOUS : MYSQL_TRANSACTION_ROLLED_BACK,
    ambiguous
      ? "COMMIT 已发送，但数据库提交结果无法确认。"
      : "事务未提交；必须完成回滚或销毁连接后再释放资源。",
    {
      cause: cause || undefined,
      mysqlCode: cause && typeof cause.code === "string" ? cause.code : undefined,
      timeout: options.timedOut === true,
      transactionPhase: ambiguous ? "commit_ambiguous" : "rolled_back",
      commitDispatched: options.commitDispatched === true,
      outcomeAmbiguous: ambiguous,
      outcomeUnknown: ambiguous,
      noCommitGuaranteed: !ambiguous,
      rollbackConfirmed: options.rollbackCompleted === true,
      retryable: !ambiguous,
    },
  );
}

function settleWithDeadline({
  timeoutMs,
  timers,
  operation,
  timeoutError,
  failureError,
  onLateSuccess = null,
}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOutError = null;
    let timer = timers.setTimeout(() => {
      timer = null;
      if (settled) {
        return;
      }
      settled = true;
      timedOutError = timeoutError();
      reject(timedOutError);
    }, timeoutMs);
    timer?.unref?.();

    let result;
    try {
      result = operation();
    } catch (error) {
      result = Promise.reject(error);
    }
    Promise.resolve(result).then((value) => {
      if (settled) {
        if (timedOutError !== null && typeof onLateSuccess === "function") {
          onLateSuccess(value, timedOutError);
        }
        return;
      }
      settled = true;
      if (timer !== null) {
        timers.clearTimeout(timer);
        timer = null;
      }
      resolve(value);
    }, (error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer !== null) {
        timers.clearTimeout(timer);
        timer = null;
      }
      reject(failureError(error));
    });
  });
}

function destroyMysqlConnection(connection, error) {
  // mysql2's public destroy() currently delegates to stream.end(), which can
  // wait for a blocked server command to finish. Reset the checked-out TCP
  // socket first so MySQL observes disconnect and rolls the transaction back;
  // the public destroy call below then evicts pool connections synchronously.
  const rawConnection = connection && connection.connection
    ? connection.connection
    : connection;
  const stream = rawConnection && rawConnection.stream;
  if (stream) {
    try {
      if (typeof stream.resetAndDestroy === "function") {
        stream.resetAndDestroy();
      } else if (typeof stream.destroy === "function") {
        stream.destroy();
      }
    } catch (socketDestroyError) {
      error.socketDestroyCause = socketDestroyError;
    }
  }
  try {
    const result = connection.destroy();
    if (result && typeof result.then === "function") {
      result.catch((destroyError) => {
        error.destroyCause = destroyError;
      });
    }
  } catch (destroyError) {
    error.destroyCause = destroyError;
  }
}

function mysqlGuardTimers(options) {
  const source = options && options.timers && typeof options.timers === "object"
    ? options.timers
    : globalThis;
  return {
    setTimeout: source.setTimeout.bind(source),
    clearTimeout: source.clearTimeout.bind(source),
  };
}

function boundedPositiveInteger(value, fallback, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    return fallback;
  }
  return Math.min(number, maximum);
}

function mysqlGuardError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  for (const [key, value] of Object.entries(details)) {
    if (value !== undefined) {
      error[key] = value;
    }
  }
  return error;
}

module.exports = {
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
};
