"use strict";

const DEFAULT_INITIAL_DELAY_MS = 10 * 1000;
const DEFAULT_INTERVAL_MS = 60 * 1000;
const DEFAULT_BATCH_LIMIT = 32;
const DEFAULT_MAX_BATCHES_PER_CYCLE = 4;
const MAX_BATCH_LIMIT = 64;
const MAX_BATCHES_PER_CYCLE = 16;

function createRewardVaultDeliveryMaintenance(store, options = {}) {
  const enabled = Boolean(
    store
    && store.rewardVaultNotificationBatches === true
    && typeof store.deliverRewardVaultNotificationsBatch === "function"
    && typeof store.rewardVaultEnabled === "function"
    && store.rewardVaultEnabled() === true
  );
  const initialDelayMs = nonNegativeInteger(options.initialDelayMs, DEFAULT_INITIAL_DELAY_MS);
  const intervalMs = positiveInteger(options.intervalMs, DEFAULT_INTERVAL_MS);
  const batchLimit = boundedPositiveInteger(options.batchLimit, DEFAULT_BATCH_LIMIT, MAX_BATCH_LIMIT);
  const maxBatchesPerCycle = boundedPositiveInteger(
    options.maxBatchesPerCycle,
    DEFAULT_MAX_BATCHES_PER_CYCLE,
    MAX_BATCHES_PER_CYCLE,
  );
  const timers = timerApi(options.timers);
  const onError = typeof options.onError === "function" ? options.onError : () => {};
  let closed = false;
  let started = false;
  let timer = null;
  let inFlight = null;

  function start() {
    if (started || closed) return enabled;
    started = true;
    if (enabled) schedule(initialDelayMs);
    return enabled;
  }

  function schedule(delayMs) {
    if (!enabled || closed || timer !== null) return;
    timer = timers.setTimeout(() => {
      timer = null;
      void runNow();
    }, delayMs);
    if (timer && typeof timer.unref === "function") timer.unref();
  }

  function runNow() {
    if (!enabled || closed) return Promise.resolve(report("reward_vault_delivery_maintenance_disabled"));
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
    if (inFlight !== null) return inFlight;
    inFlight = runCycle().catch((error) => {
      try { onError(error); } catch {}
      return report("reward_vault_delivery_maintenance_failed", {
        ok: false,
        errorCode: safeErrorCode(error),
        outcomeUnknown: Boolean(error && error.outcomeUnknown === true),
      });
    }).finally(() => {
      inFlight = null;
      schedule(intervalMs);
    });
    return inFlight;
  }

  async function runCycle() {
    let deliveredCount = 0;
    let batchCount = 0;
    let exhausted = false;
    for (let index = 0; index < maxBatchesPerCycle; index += 1) {
      const batch = await store.deliverRewardVaultNotificationsBatch({limit: batchLimit});
      assertBatchReport(batch);
      if (batch.ok !== true) {
        const error = new Error("奖励仓通知事务返回了未确认结果。");
        error.code = safeErrorCode(batch);
        error.outcomeUnknown = batch.outcomeUnknown === true;
        error.retryable = batch.retryable === true;
        throw error;
      }
      batchCount += 1;
      deliveredCount += batch.deliveredCount;
      if (closed) break;
      if (batch.deliveredCount === 0) {
        exhausted = true;
        break;
      }
    }
    return report("reward_vault_delivery_maintenance_ok", {deliveredCount, batchCount, exhausted});
  }

  function close() {
    closed = true;
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
    return inFlight || Promise.resolve();
  }

  function report(code, overrides = {}) {
    return Object.freeze({
      kind: "beastbound_reward_vault_delivery_maintenance",
      schemaVersion: 1,
      ok: overrides.ok !== false,
      code,
      enabled,
      deliveredCount: Number(overrides.deliveredCount || 0),
      batchCount: Number(overrides.batchCount || 0),
      exhausted: overrides.exhausted === true,
      outcomeUnknown: overrides.outcomeUnknown === true,
      errorCode: String(overrides.errorCode || ""),
    });
  }

  return Object.freeze({start, runNow, close});
}

function assertBatchReport(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.kind !== "beastbound_reward_vault_delivery_batch"
    || value.schemaVersion !== 1 || typeof value.ok !== "boolean"
    || !Number.isSafeInteger(value.deliveredCount) || value.deliveredCount < 0
    || !Array.isArray(value.deliveredRewardIds)
    || !Array.isArray(value.deliveredMailIds)
    || value.deliveredRewardIds.length !== value.deliveredCount
    || value.deliveredMailIds.length !== value.deliveredCount
    || value.deliveredCount > MAX_BATCH_LIMIT
    || typeof value.outcomeUnknown !== "boolean"
    || typeof value.retryable !== "boolean") {
    const error = new Error("奖励仓通知事务结果不符合维护合同。");
    error.code = "reward_vault_delivery_maintenance_batch_report_invalid";
    throw error;
  }
}

function safeErrorCode(value) {
  const code = String(value && value.code || "");
  return /^(?:reward_vault_delivery_|mysql_(?:pool|session|transaction|commit)_)/.test(code)
    ? code
    : "reward_vault_delivery_maintenance_failed";
}

function positiveInteger(value, fallback) {
  const candidate = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < 1) throw parameterError();
  return candidate;
}

function nonNegativeInteger(value, fallback) {
  const candidate = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < 0) throw parameterError();
  return candidate;
}

function boundedPositiveInteger(value, fallback, maximum) {
  const candidate = positiveInteger(value, fallback);
  if (candidate > maximum) throw parameterError();
  return candidate;
}

function timerApi(value) {
  const candidate = value && typeof value === "object" ? value : {};
  return {
    setTimeout: typeof candidate.setTimeout === "function" ? candidate.setTimeout : setTimeout,
    clearTimeout: typeof candidate.clearTimeout === "function" ? candidate.clearTimeout : clearTimeout,
  };
}

function parameterError() {
  const error = new RangeError("奖励仓通知维护参数无效。");
  error.code = "reward_vault_delivery_maintenance_parameter_invalid";
  return error;
}

module.exports = {createRewardVaultDeliveryMaintenance};
