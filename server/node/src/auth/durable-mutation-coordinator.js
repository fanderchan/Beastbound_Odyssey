"use strict";

const STORAGE_QUEUE_FULL = "storage_queue_full";
const STORAGE_COMMIT_TIMEOUT = "storage_commit_timeout";
const STORAGE_SHUTTING_DOWN = "storage_shutting_down";

const DEFAULT_MAX_PENDING = 128;
const DEFAULT_RESPONSE_TIMEOUT_MS = 10000;

class DurableMutationCoordinatorError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "DurableMutationCoordinatorError";
    this.code = code;
    Object.assign(this, details);
  }
}

function positiveInteger(value, fieldName) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${fieldName} must be a positive integer`);
  }
  return value;
}

function timeoutMilliseconds(value, fieldName) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${fieldName} must be a non-negative integer`);
  }
  return value;
}

function queueFullError() {
  return new DurableMutationCoordinatorError(
    STORAGE_QUEUE_FULL,
    "服务器正在保存较多操作，请稍后重试。",
    {retryable: true, outcomeUnknown: false},
  );
}

function commitTimeoutError() {
  return new DurableMutationCoordinatorError(
    STORAGE_COMMIT_TIMEOUT,
    "服务器仍在确认本次操作，请使用原操作标识重试，勿新建重复操作。",
    {retryable: true, outcomeUnknown: true},
  );
}

function shuttingDownError() {
  return new DurableMutationCoordinatorError(
    STORAGE_SHUTTING_DOWN,
    "服务器正在安全停服，请稍后重新连接。",
    {retryable: true, outcomeUnknown: false},
  );
}

function createDurableMutationCoordinator(options = {}) {
  const maxPending = positiveInteger(
    options.maxPending ?? DEFAULT_MAX_PENDING,
    "maxPending",
  );
  const responseTimeoutMs = timeoutMilliseconds(
    options.responseTimeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS,
    "responseTimeoutMs",
  );

  let tail = Promise.resolve();
  let pending = 0;
  let running = 0;
  let accepted = 0;
  let rejected = 0;
  let timeouts = 0;
  let completed = 0;
  let succeeded = 0;
  let failed = 0;
  let queueFull = 0;
  let shutdownRejected = 0;
  let admissionOpen = true;

  function metrics() {
    return Object.freeze({
      pending,
      running,
      accepted,
      rejected,
      timeouts,
      completed,
      succeeded,
      failed,
      queueFull,
      shutdownRejected,
      admissionOpen,
      maxPending,
      responseTimeoutMs,
    });
  }

  function idle() {
    return pending === 0;
  }

  function waitForIdle() {
    return tail.then(() => undefined);
  }

  function stopAdmissionAndDrain() {
    // Closing admission and capturing the tail happen in the same synchronous
    // turn. A later run() cannot attach behind the tail that shutdown awaits.
    admissionOpen = false;
    return tail.then(() => undefined);
  }

  function run(operationFn, runOptions = {}) {
    if (typeof operationFn !== "function") {
      return Promise.reject(new TypeError("operationFn must be a function"));
    }
    const timeoutMs = timeoutMilliseconds(
      runOptions.timeoutMs ?? responseTimeoutMs,
      "timeoutMs",
    );
    if (!admissionOpen) {
      shutdownRejected += 1;
      rejected += 1;
      return Promise.reject(shuttingDownError());
    }
    if (pending >= maxPending) {
      queueFull += 1;
      rejected += 1;
      return Promise.reject(queueFullError());
    }

    pending += 1;
    accepted += 1;

    const operation = tail.then(async () => {
      running += 1;
      try {
        return await operationFn();
      } finally {
        running -= 1;
      }
    });

    const settlement = operation.then(
      (value) => {
        succeeded += 1;
        return {ok: true, value};
      },
      (error) => {
        failed += 1;
        return {ok: false, error};
      },
    ).then((result) => {
      pending -= 1;
      completed += 1;
      return result;
    });

    // The serial tail always heals after a failed operation. Each caller still
    // observes its own settlement through the response promise below.
    tail = settlement.then(() => undefined);

    return new Promise((resolve, reject) => {
      let responseSettled = false;
      let timer = null;

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          timer = null;
          if (responseSettled) {
            return;
          }
          responseSettled = true;
          timeouts += 1;
          rejected += 1;
          reject(commitTimeoutError());
        }, timeoutMs);
      }

      settlement.then((result) => {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        if (responseSettled) {
          return;
        }
        responseSettled = true;
        if (result.ok) {
          resolve(result.value);
          return;
        }
        rejected += 1;
        reject(result.error);
      });
    });
  }

  return Object.freeze({
    run,
    idle,
    isIdle: idle,
    waitForIdle,
    stopAdmissionAndDrain,
    metrics,
    getMetrics: metrics,
  });
}

module.exports = {
  STORAGE_QUEUE_FULL,
  STORAGE_COMMIT_TIMEOUT,
  STORAGE_SHUTTING_DOWN,
  DurableMutationCoordinatorError,
  createDurableMutationCoordinator,
};
