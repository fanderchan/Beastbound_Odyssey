"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DURABLE_RECEIPT_MAX_COUNT,
  activeDurableReceipt,
  canonicalDurableMutationReceipts,
  commitDurableMutationReceiptDelta,
  durableMutationReceiptCount,
  durableMutationReceiptDeltaFrom,
  durableMutationReceiptLedgerStats,
  materializeDurableMutationReceipts,
  stageDurableMutationReceipt,
} = require("../src/auth/durable-mutation-state");

const NOW_MS = Date.parse("2026-07-12T12:00:00.000Z");

function receipt(operationId, options = {}) {
  const committedAtMs = options.committedAtMs ?? NOW_MS - 1000;
  const expiresAtMs = options.expiresAtMs ?? NOW_MS + 60_000;
  return {
    schemaVersion: 1,
    operationId,
    requestHash: String(options.requestHash || "a".repeat(64)),
    actionId: String(options.actionId || "bank.withdraw"),
    accountId: String(options.accountId || "acc_receipt_owner"),
    committedAt: new Date(committedAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    response: options.response || {ok: true, marker: operationId},
  };
}

test("20k receipt lookup, append and capacity eviction touch only indexed rows", () => {
  const raw = {};
  for (let index = 0; index < DURABLE_RECEIPT_MAX_COUNT; index += 1) {
    const operationId = `operation_capacity_${String(index).padStart(8, "0")}`;
    raw[operationId] = receipt(operationId, {
      committedAtMs: NOW_MS - 40_000 + index,
      expiresAtMs: NOW_MS + 60_000 + index,
    });
  }
  const baseline = canonicalDurableMutationReceipts(raw);
  assert.equal(durableMutationReceiptCount(baseline), DURABLE_RECEIPT_MAX_COUNT);
  assert.equal(activeDurableReceipt({mutationReceipts: baseline}, "operation_capacity_00019999", NOW_MS).operationId, "operation_capacity_00019999");

  const originalObjectKeys = Object.keys;
  let baselineScans = 0;
  Object.keys = function countedObjectKeys(value) {
    if (value === baseline) {
      baselineScans += 1;
    }
    return originalObjectKeys(value);
  };
  let staged;
  try {
    staged = stageDurableMutationReceipt(
      baseline,
      receipt("operation_capacity_new_20000", {
        committedAtMs: NOW_MS,
        expiresAtMs: NOW_MS + 120_000,
      }),
      {nowMs: NOW_MS},
    );
  } finally {
    Object.keys = originalObjectKeys;
  }
  assert.equal(baselineScans, 0);
  assert.equal(durableMutationReceiptCount(staged), DURABLE_RECEIPT_MAX_COUNT);
  const delta = durableMutationReceiptDeltaFrom(baseline, staged);
  assert.equal(delta.ok, true);
  assert.deepEqual(delta.deletes.map((entry) => entry.operationId), ["operation_capacity_00000000"]);
  assert.equal(delta.deletes[0].reason, "capacity");
  assert.deepEqual(delta.upserts.map((entry) => entry.operationId), ["operation_capacity_new_20000"]);
  assert.equal(Object.hasOwn(baseline, "operation_capacity_new_20000"), false);
  assert.equal(Object.hasOwn(staged, "operation_capacity_new_20000"), true);
});

test("receipt MVCC checkpoints bound long-running history while old views remain isolated", () => {
  const raw = {};
  for (let index = 0; index < DURABLE_RECEIPT_MAX_COUNT; index += 1) {
    const operationId = `operation_churn_base_${String(index).padStart(8, "0")}`;
    raw[operationId] = receipt(operationId, {
      committedAtMs: NOW_MS - DURABLE_RECEIPT_MAX_COUNT + index,
      expiresAtMs: NOW_MS + 1_000_000 + index,
      response: {ok: true},
    });
  }
  const baseline = canonicalDurableMutationReceipts(raw);
  let current = baseline;
  for (let index = 0; index <= DURABLE_RECEIPT_MAX_COUNT; index += 1) {
    const operationId = `operation_churn_next_${String(index).padStart(8, "0")}`;
    current = stageDurableMutationReceipt(current, receipt(operationId, {
      committedAtMs: NOW_MS + index,
      expiresAtMs: NOW_MS + 2_000_000 + index,
      response: {ok: true},
    }), {nowMs: NOW_MS + index});
    commitDurableMutationReceiptDelta(current);
  }
  const stats = durableMutationReceiptLedgerStats(current);
  assert.equal(stats.activeCount, DURABLE_RECEIPT_MAX_COUNT);
  assert.ok(stats.historicalKeyCount <= DURABLE_RECEIPT_MAX_COUNT + 1);
  assert.ok(stats.historyEntryCount <= 2);
  assert.ok(stats.expiryHeapSize <= DURABLE_RECEIPT_MAX_COUNT);
  assert.ok(stats.oldestHeapSize <= DURABLE_RECEIPT_MAX_COUNT);
  assert.equal(Object.keys(materializeDurableMutationReceipts(current)).length, DURABLE_RECEIPT_MAX_COUNT);
  assert.equal(Object.hasOwn(baseline, "operation_churn_base_00000000"), true);
  assert.equal(Object.hasOwn(baseline, "operation_churn_next_00000000"), false);
});

test("expired operation IDs reuse DELETE then INSERT while active receipts stay immutable", () => {
  const operationId = "operation_expired_reuse_0001";
  const sourceResponse = {ok: true, nested: {value: 1}};
  const baseline = canonicalDurableMutationReceipts({
    [operationId]: receipt(operationId, {
      committedAtMs: NOW_MS - 120_000,
      expiresAtMs: NOW_MS - 1,
      response: sourceResponse,
    }),
  });
  sourceResponse.nested.value = 999;
  assert.equal(baseline[operationId].response.nested.value, 1);
  assert.equal(Object.isFrozen(baseline[operationId].response.nested), true);

  const replacement = stageDurableMutationReceipt(
    baseline,
    receipt(operationId, {
      committedAtMs: NOW_MS,
      expiresAtMs: NOW_MS + 60_000,
      requestHash: "b".repeat(64),
      response: {ok: true, generation: 2},
    }),
    {nowMs: NOW_MS},
  );
  const delta = durableMutationReceiptDeltaFrom(baseline, replacement);
  assert.equal(delta.ok, true);
  assert.equal(delta.deletes.length, 1);
  assert.equal(delta.upserts.length, 1);
  assert.equal(delta.deletes[0].operationId, operationId);
  assert.equal(delta.upserts[0].operationId, operationId);
  assert.equal(baseline[operationId].requestHash, "a".repeat(64));

  const committed = commitDurableMutationReceiptDelta(replacement);
  assert.equal(committed, replacement);
  assert.equal(committed[operationId].requestHash, "b".repeat(64));
  assert.equal(commitDurableMutationReceiptDelta(replacement), replacement);
  assert.equal(baseline[operationId].requestHash, "a".repeat(64));
  assert.deepEqual(materializeDurableMutationReceipts(committed)[operationId].response, {
    ok: true,
    generation: 2,
  });

  assert.throws(
    () => stageDurableMutationReceipt(
      committed,
      receipt(operationId, {
        committedAtMs: NOW_MS + 1,
        expiresAtMs: NOW_MS + 120_000,
      }),
      {nowMs: NOW_MS + 1},
    ),
    (error) => error && error.code === "mutation_receipt_operation_conflict",
  );
});
