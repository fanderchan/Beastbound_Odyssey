"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createMailArchiveMaintenance,
} = require("../src/mail-archive-maintenance");

function batch(overrides = {}) {
  const archivedMailIds = structuredClone(overrides.archivedMailIds || []);
  return {
    kind: "beastbound_mail_archive_batch",
    schemaVersion: 1,
    ok: overrides.ok !== false,
    code: overrides.code || "mail_archive_batch_ok",
    archivedCount: archivedMailIds.length,
    archivedMailIds,
    retiredMailIds: structuredClone(overrides.retiredMailIds || archivedMailIds),
    outcomeUnknown: overrides.outcomeUnknown === true,
    retryable: overrides.retryable === true,
  };
}

function fakeTimers() {
  const state = {scheduled: [], cleared: []};
  return {
    state,
    api: {
      setTimeout(callback, delayMs) {
        const handle = {callback, delayMs, unref() {}};
        state.scheduled.push(handle);
        return handle;
      },
      clearTimeout(handle) {
        state.cleared.push(handle);
      },
    },
  };
}

test("maintenance stays inert until the startup archive fence is enabled", async () => {
  let calls = 0;
  const timers = fakeTimers();
  const maintenance = createMailArchiveMaintenance({
    mailArchiveBatches: true,
    mailArchiveEnabled: () => false,
    async archiveSettledMailBatch() { calls += 1; return batch(); },
  }, {timers: timers.api});

  assert.equal(maintenance.start(), false);
  assert.equal((await maintenance.runNow()).code, "mail_archive_maintenance_disabled");
  assert.equal(calls, 0);
  assert.equal(timers.state.scheduled.length, 0);
  assert.equal(maintenance.metrics().enabled, false);
});

test("one bounded cycle drains archived and concurrent-retired rows then schedules the interval", async () => {
  const responses = [
    batch({archivedMailIds: ["mail_a"]}),
    batch({retiredMailIds: ["mail_b"]}),
    batch({code: "mail_archive_batch_empty"}),
  ];
  const calls = [];
  const timers = fakeTimers();
  const maintenance = createMailArchiveMaintenance({
    mailArchiveBatches: true,
    mailArchiveEnabled: () => true,
    async archiveSettledMailBatch(options) {
      calls.push(structuredClone(options));
      return responses.shift();
    },
  }, {
    timers: timers.api,
    initialDelayMs: 25,
    intervalMs: 1000,
    batchLimit: 32,
    maxBatchesPerCycle: 4,
  });

  assert.equal(maintenance.start(), true);
  assert.equal(timers.state.scheduled[0].delayMs, 25);
  const report = await maintenance.runNow();
  assert.equal(report.ok, true);
  assert.equal(report.archivedCount, 1);
  assert.equal(report.batchCount, 3);
  assert.equal(report.exhausted, true);
  assert.deepEqual(calls, [{limit: 32}, {limit: 32}, {limit: 32}]);
  assert.equal(timers.state.cleared.length, 1);
  assert.equal(timers.state.scheduled.at(-1).delayMs, 1000);
  assert.deepEqual(maintenance.metrics(), {
    kind: "beastbound_mail_archive_maintenance",
    schemaVersion: 1,
    enabled: true,
    started: true,
    closed: false,
    inFlight: false,
    cycles: 1,
    batches: 3,
    archived: 1,
    emptyCycles: 0,
    failures: 0,
    outcomeUnknown: 0,
  });
  await maintenance.close();
});

test("overlapping triggers coalesce and shutdown waits without rescheduling", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const timers = fakeTimers();
  const maintenance = createMailArchiveMaintenance({
    mailArchiveBatches: true,
    mailArchiveEnabled: () => true,
    async archiveSettledMailBatch() {
      calls += 1;
      await gate;
      return batch({code: "mail_archive_batch_empty"});
    },
  }, {timers: timers.api});

  const first = maintenance.runNow();
  const second = maintenance.runNow();
  assert.equal(first, second);
  const closing = maintenance.close();
  release();
  await Promise.all([first, closing]);
  assert.equal(calls, 1);
  assert.equal(timers.state.scheduled.length, 0);
  assert.equal(maintenance.metrics().closed, true);
});

test("shutdown stops a draining cycle after its current database transaction", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const maintenance = createMailArchiveMaintenance({
    mailArchiveBatches: true,
    mailArchiveEnabled: () => true,
    async archiveSettledMailBatch() {
      calls += 1;
      await gate;
      return batch({archivedMailIds: ["mail_shutdown"]});
    },
  });

  const cycle = maintenance.runNow();
  const closing = maintenance.close();
  release();
  const report = await cycle;
  await closing;
  assert.equal(report.archivedCount, 1);
  assert.equal(report.batchCount, 1);
  assert.equal(calls, 1);
});

test("unknown or malformed batch outcomes fail one cycle closed and remain observable", async () => {
  const errors = [];
  const timers = fakeTimers();
  const reports = [
    batch({
      ok: false,
      code: "mail_archive_batch_commit_outcome_unknown",
      outcomeUnknown: true,
    }),
    {...batch(), archivedCount: 1},
  ];
  const maintenance = createMailArchiveMaintenance({
    mailArchiveBatches: true,
    mailArchiveEnabled: () => true,
    async archiveSettledMailBatch() { return reports.shift(); },
  }, {timers: timers.api, onError: (error) => errors.push(error)});

  const unknown = await maintenance.runNow();
  assert.equal(unknown.ok, false);
  assert.equal(unknown.outcomeUnknown, true);
  assert.equal(unknown.errorCode, "mail_archive_batch_commit_outcome_unknown");
  const malformed = await maintenance.runNow();
  assert.equal(malformed.ok, false);
  assert.equal(malformed.errorCode, "mail_archive_maintenance_batch_report_invalid");
  assert.equal(errors.length, 2);
  assert.equal(maintenance.metrics().failures, 2);
  assert.equal(maintenance.metrics().outcomeUnknown, 1);
  await maintenance.close();
});
