"use strict";

const MAIL_ARCHIVE_MAINTENANCE_KIND = "beastbound_mail_archive_maintenance";
const MAIL_ARCHIVE_MAINTENANCE_SCHEMA_VERSION = 1;
const DEFAULT_INITIAL_DELAY_MS = 30 * 1000;
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_BATCH_LIMIT = 64;
const DEFAULT_MAX_BATCHES_PER_CYCLE = 4;
const MAX_BATCH_LIMIT = 128;
const MAX_BATCHES_PER_CYCLE = 16;

function createMailArchiveMaintenance(store, options = {}) {
  const enabled = Boolean(
    store
    && store.mailArchiveBatches === true
    && typeof store.archiveSettledMailBatch === "function"
    && typeof store.mailArchiveEnabled === "function"
    && store.mailArchiveEnabled() === true
  );
  const initialDelayMs = nonNegativeInteger(
    options.initialDelayMs,
    DEFAULT_INITIAL_DELAY_MS,
    "mail_archive_maintenance_initial_delay_invalid",
  );
  const intervalMs = positiveInteger(
    options.intervalMs,
    DEFAULT_INTERVAL_MS,
    "mail_archive_maintenance_interval_invalid",
  );
  const batchLimit = boundedPositiveInteger(
    options.batchLimit,
    DEFAULT_BATCH_LIMIT,
    MAX_BATCH_LIMIT,
    "mail_archive_maintenance_batch_limit_invalid",
  );
  const maxBatchesPerCycle = boundedPositiveInteger(
    options.maxBatchesPerCycle,
    DEFAULT_MAX_BATCHES_PER_CYCLE,
    MAX_BATCHES_PER_CYCLE,
    "mail_archive_maintenance_cycle_limit_invalid",
  );
  const timers = timerApi(options.timers);
  const onError = typeof options.onError === "function" ? options.onError : () => {};
  let closed = false;
  let started = false;
  let timer = null;
  let inFlight = null;
  const totals = {
    cycles: 0,
    batches: 0,
    archived: 0,
    emptyCycles: 0,
    failures: 0,
    outcomeUnknown: 0,
  };

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
    timer && typeof timer.unref === "function" && timer.unref();
  }

  function runNow() {
    if (!enabled || closed) return Promise.resolve(report("mail_archive_maintenance_disabled"));
    if (timer !== null) {
      timers.clearTimeout(timer);
      timer = null;
    }
    if (inFlight !== null) return inFlight;
    totals.cycles += 1;
    inFlight = runCycle().then((value) => value, (error) => {
      totals.failures += 1;
      if (error && error.outcomeUnknown === true) totals.outcomeUnknown += 1;
      try {
        onError(error);
      } catch {
        // Observability is intentionally outside the storage outcome.
      }
      return report("mail_archive_maintenance_failed", {
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
    let archivedCount = 0;
    let batchCount = 0;
    let exhausted = false;
    for (let index = 0; index < maxBatchesPerCycle; index += 1) {
      const batch = await store.archiveSettledMailBatch({limit: batchLimit});
      assertBatchReport(batch);
      if (batch.ok !== true) {
        const error = new Error("邮件归档事务返回了未确认结果。");
        error.code = safeErrorCode(batch);
        error.outcomeUnknown = batch.outcomeUnknown === true;
        error.retryable = batch.retryable === true;
        throw error;
      }
      totals.batches += 1;
      batchCount += 1;
      totals.archived += batch.archivedCount;
      archivedCount += batch.archivedCount;
      if (closed) break;
      if (batch.archivedCount === 0 && batch.retiredMailIds.length === 0) {
        exhausted = true;
        break;
      }
    }
    if (archivedCount === 0) totals.emptyCycles += 1;
    return report("mail_archive_maintenance_ok", {
      archivedCount,
      batchCount,
      exhausted,
    });
  }

  function metrics() {
    return Object.freeze({
      kind: MAIL_ARCHIVE_MAINTENANCE_KIND,
      schemaVersion: MAIL_ARCHIVE_MAINTENANCE_SCHEMA_VERSION,
      enabled,
      started,
      closed,
      inFlight: inFlight !== null,
      ...totals,
    });
  }

  function close() {
    closed = true;
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
    return inFlight || Promise.resolve();
  }

  function report(code, overrides = {}) {
    return Object.freeze({
      kind: MAIL_ARCHIVE_MAINTENANCE_KIND,
      schemaVersion: MAIL_ARCHIVE_MAINTENANCE_SCHEMA_VERSION,
      ok: overrides.ok !== false,
      code,
      enabled,
      archivedCount: Number(overrides.archivedCount || 0),
      batchCount: Number(overrides.batchCount || 0),
      exhausted: overrides.exhausted === true,
      outcomeUnknown: overrides.outcomeUnknown === true,
      errorCode: String(overrides.errorCode || ""),
    });
  }

  return Object.freeze({start, runNow, metrics, close});
}

function assertBatchReport(value) {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || value.kind !== "beastbound_mail_archive_batch"
    || value.schemaVersion !== 1
    || typeof value.ok !== "boolean"
    || !Number.isSafeInteger(value.archivedCount)
    || value.archivedCount < 0
    || !Array.isArray(value.archivedMailIds)
    || value.archivedMailIds.length !== value.archivedCount
    || value.archivedMailIds.length > MAX_BATCH_LIMIT
    || value.archivedMailIds.some((mailId) => typeof mailId !== "string" || mailId === "")
    || new Set(value.archivedMailIds).size !== value.archivedMailIds.length
    || !Array.isArray(value.retiredMailIds)
    || value.retiredMailIds.length > MAX_BATCH_LIMIT
    || value.retiredMailIds.some((mailId) => typeof mailId !== "string" || mailId === "")
    || new Set(value.retiredMailIds).size !== value.retiredMailIds.length
    || value.archivedMailIds.some((mailId) => !value.retiredMailIds.includes(mailId))
    || typeof value.outcomeUnknown !== "boolean"
    || typeof value.retryable !== "boolean"
  ) {
    const error = new Error("邮件归档事务结果不符合维护合同。");
    error.code = "mail_archive_maintenance_batch_report_invalid";
    throw error;
  }
}

function safeErrorCode(value) {
  const code = String(value && value.code || "");
  return /^(?:mail_archive_|mysql_(?:mail_archive|pool|session|transaction|commit)_)/.test(code)
    ? code
    : "mail_archive_maintenance_failed";
}

function timerApi(value) {
  const candidate = value && typeof value === "object" ? value : {};
  return {
    setTimeout: typeof candidate.setTimeout === "function" ? candidate.setTimeout : setTimeout,
    clearTimeout: typeof candidate.clearTimeout === "function" ? candidate.clearTimeout : clearTimeout,
  };
}

function positiveInteger(value, fallback, code) {
  const candidate = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < 1) throw maintenanceError(code);
  return candidate;
}

function nonNegativeInteger(value, fallback, code) {
  const candidate = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < 0) throw maintenanceError(code);
  return candidate;
}

function boundedPositiveInteger(value, fallback, maximum, code) {
  const candidate = positiveInteger(value, fallback, code);
  if (candidate > maximum) throw maintenanceError(code);
  return candidate;
}

function maintenanceError(code) {
  const error = new RangeError("邮件归档维护参数无效。");
  error.code = code;
  return error;
}

module.exports = {
  MAIL_ARCHIVE_MAINTENANCE_KIND,
  MAIL_ARCHIVE_MAINTENANCE_SCHEMA_VERSION,
  createMailArchiveMaintenance,
};
