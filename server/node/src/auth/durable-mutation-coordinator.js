"use strict";

const STORAGE_QUEUE_FULL = "storage_queue_full";
const STORAGE_COMMIT_TIMEOUT = "storage_commit_timeout";
const STORAGE_SHUTTING_DOWN = "storage_shutting_down";
const STORAGE_REQUEST_CANCELED = "storage_request_canceled";

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

function requestCanceledError() {
  return new DurableMutationCoordinatorError(
    STORAGE_REQUEST_CANCELED,
    "连接已中断，本次操作尚未开始。",
    {
      statusCode: 499,
      publicMessage: "连接已中断，本次操作尚未开始。",
      retryable: true,
      outcomeUnknown: false,
    },
  );
}

function abortSignal(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (
    typeof value !== "object"
    || typeof value.aborted !== "boolean"
    || typeof value.addEventListener !== "function"
    || typeof value.removeEventListener !== "function"
  ) {
    throw new TypeError("signal must be an AbortSignal");
  }
  return value;
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
  const yieldTurn = typeof options.yieldTurn === "function"
    ? options.yieldTurn
    : () => new Promise((resolve) => setImmediate(resolve));

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
  let canceledBeforeStart = 0;
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
      canceledBeforeStart,
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
    const signal = abortSignal(runOptions.signal);
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
    if (signal && signal.aborted) {
      canceledBeforeStart += 1;
      rejected += 1;
      return Promise.reject(requestCanceledError());
    }

    pending += 1;
    accepted += 1;

    let started = false;
    let canceled = false;
    let cancelError = null;
    let responseCancel = null;
    const removeAbortListener = () => {
      if (signal) {
        signal.removeEventListener("abort", handleAbort);
      }
    };
    const handleAbort = () => {
      if (started || canceled) {
        return;
      }
      canceled = true;
      cancelError = requestCanceledError();
      canceledBeforeStart += 1;
      removeAbortListener();
      if (responseCancel) {
        responseCancel(cancelError);
      }
    };
    if (signal) {
      signal.addEventListener("abort", handleAbort, {once: true});
    }

    const operation = tail.then(async () => {
      // Promise continuations otherwise run the whole queued burst in one
      // microtask checkpoint. Ten battle commands can each be safely bounded
      // yet still starve HTTP/WS timers when chained without returning to the
      // event loop. The first admitted operation starts immediately; every
      // later serialized operation yields only after its predecessor has fully
      // settled and published, so ordering and COMMIT-before-success remain
      // unchanged.
      if (completed > 0) {
        await yieldTurn();
      }
      if (canceled) {
        throw cancelError;
      }
      started = true;
      removeAbortListener();
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

      responseCancel = (error) => {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        if (responseSettled) {
          return;
        }
        responseSettled = true;
        rejected += 1;
        reject(error);
      };

      // The signal can abort after listener registration but before the
      // response promise installs its cancellation callback.
      if (canceled) {
        responseCancel(cancelError);
      }

      if (!responseSettled && timeoutMs > 0) {
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
        removeAbortListener();
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
  STORAGE_REQUEST_CANCELED,
  DurableMutationCoordinatorError,
  createDurableMutationCoordinator,
};
