"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DURABLE_RECEIPT_MAX_COUNT,
  DURABLE_RECEIPT_CHECKPOINT_HISTORY_MAX,
  activeDurableReceipt,
  canonicalDurableMutationReceipts,
  commitDurableMutationReceiptDelta,
  durableMutationReceiptCount,
  durableMutationReceiptDeltaFrom,
  durableMutationReceiptLedgerStats,
  durableMutationReceiptPayloadStats,
  durableReceiptReplayResult,
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

test("final-only receipt payload diagnostics aggregate bytes and shapes without exposing payloads", () => {
  const firstResponse = {ok: true, profile: {name: "容量玩家", slots: [{itemId: "herb", count: 2}]}};
  const secondResponse = {ok: true, bank: {stoneCoins: 120}, message: "完成"};
  const first = receipt("operation_payload_stats_0001", {
    actionId: "POST /bank/deposit",
    response: firstResponse,
  });
  const second = receipt("operation_payload_stats_0002", {
    actionId: "POST /bank/withdraw",
    response: secondResponse,
  });
  const ledger = canonicalDurableMutationReceipts({
    [first.operationId]: first,
    [second.operationId]: second,
  });
  const stats = durableMutationReceiptPayloadStats(ledger);

  assert.equal(stats.activeCount, 2);
  assert.equal(stats.responseJsonBytes, Buffer.byteLength(JSON.stringify(firstResponse)) + Buffer.byteLength(JSON.stringify(secondResponse)));
  assert.ok(stats.receiptJsonBytes > stats.responseJsonBytes);
  assert.equal(stats.responseMaxBytes, Math.max(
    Buffer.byteLength(JSON.stringify(firstResponse)),
    Buffer.byteLength(JSON.stringify(secondResponse)),
  ));
  assert.equal(stats.byAction["POST /bank/deposit"].count, 1);
  assert.equal(stats.byAction["POST /bank/withdraw"].count, 1);
  assert.ok(stats.responseShape.objects >= 5);
  assert.ok(stats.responseShape.arrays >= 1);
  assert.equal(Object.hasOwn(stats, "responses"), false);
});

test("canonical receipt loading fails closed above the 20,000-row contract", () => {
  const raw = {};
  for (let index = 0; index <= DURABLE_RECEIPT_MAX_COUNT; index += 1) {
    const operationId = `operation_over_capacity_${String(index).padStart(8, "0")}`;
    raw[operationId] = receipt(operationId);
  }
  assert.throws(
    () => canonicalDurableMutationReceipts(raw),
    (error) => error && error.code === "mutation_receipt_capacity_exceeded",
  );
});

test("19,999 to 20,000 steady-state append only replaces an expired hashed victim", () => {
  const raw = {};
  for (let index = 0; index < DURABLE_RECEIPT_MAX_COUNT - 1; index += 1) {
    const operationId = `operation_capacity_${String(index).padStart(8, "0")}`;
    raw[operationId] = receipt(operationId, {
      committedAtMs: NOW_MS - 40_000 + index,
      expiresAtMs: index < 256 ? NOW_MS + 1 : NOW_MS + 60_000 + index,
    });
  }
  const baseline = canonicalDurableMutationReceipts(raw);
  assert.equal(durableMutationReceiptCount(baseline), DURABLE_RECEIPT_MAX_COUNT - 1);
  assert.equal(activeDurableReceipt({mutationReceipts: baseline}, "operation_capacity_00019998", NOW_MS).operationId, "operation_capacity_00019998");

  const originalObjectKeys = Object.keys;
  let baselineScans = 0;
  const trackedLedgers = new Set([baseline]);
  Object.keys = function countedObjectKeys(value) {
    if (trackedLedgers.has(value)) {
      baselineScans += 1;
    }
    return originalObjectKeys(value);
  };
  let atCapacity;
  let appendDelta;
  let staged;
  let repeated;
  let alternative;
  try {
    atCapacity = stageDurableMutationReceipt(
      baseline,
      receipt("operation_capacity_new_19999", {
        committedAtMs: NOW_MS,
        expiresAtMs: NOW_MS + 120_000,
      }),
      {nowMs: NOW_MS},
    );
    appendDelta = durableMutationReceiptDeltaFrom(baseline, atCapacity);
    commitDurableMutationReceiptDelta(atCapacity);
    trackedLedgers.add(atCapacity);

    assert.throws(
      () => stageDurableMutationReceipt(
        atCapacity,
        receipt("operation_capacity_full_active", {
          committedAtMs: NOW_MS,
          expiresAtMs: NOW_MS + 120_000,
        }),
        {nowMs: NOW_MS},
      ),
      (error) => error && error.code === "mutation_receipt_capacity_exceeded",
    );

    staged = stageDurableMutationReceipt(
      atCapacity,
      receipt("operation_capacity_new_20001", {
        committedAtMs: NOW_MS + 2,
        expiresAtMs: NOW_MS + 120_002,
      }),
      {nowMs: NOW_MS + 2},
    );
    repeated = stageDurableMutationReceipt(
      atCapacity,
      receipt("operation_capacity_new_20001", {
        committedAtMs: NOW_MS + 2,
        expiresAtMs: NOW_MS + 120_002,
      }),
      {nowMs: NOW_MS + 2},
    );
    alternative = stageDurableMutationReceipt(
      atCapacity,
      receipt("operation_capacity_new_20002", {
        committedAtMs: NOW_MS + 2,
        expiresAtMs: NOW_MS + 120_002,
      }),
      {nowMs: NOW_MS + 2},
    );
  } finally {
    Object.keys = originalObjectKeys;
  }
  assert.equal(baselineScans, 0);
  assert.equal(appendDelta.ok, true);
  assert.equal(appendDelta.deletes.length, 0);
  assert.deepEqual(appendDelta.upserts.map((entry) => entry.operationId), ["operation_capacity_new_19999"]);
  assert.equal(durableMutationReceiptCount(atCapacity), DURABLE_RECEIPT_MAX_COUNT);
  assert.equal(durableMutationReceiptCount(staged), DURABLE_RECEIPT_MAX_COUNT);
  const delta = durableMutationReceiptDeltaFrom(atCapacity, staged);
  const repeatedDelta = durableMutationReceiptDeltaFrom(atCapacity, repeated);
  const alternativeDelta = durableMutationReceiptDeltaFrom(atCapacity, alternative);
  assert.equal(delta.ok, true);
  assert.equal(delta.deletes.length, 1);
  assert.equal(delta.deletes[0].reason, "expired");
  assert.ok(Number(delta.deletes[0].operationId.slice(-8)) < 256);
  assert.equal(Date.parse(delta.deletes[0].expectedReceipt.expiresAt) <= NOW_MS + 2, true);
  assert.deepEqual(repeatedDelta.deletes.map((entry) => entry.operationId), delta.deletes.map((entry) => entry.operationId));
  assert.notDeepEqual(alternativeDelta.deletes.map((entry) => entry.operationId), delta.deletes.map((entry) => entry.operationId));
  assert.deepEqual(delta.upserts.map((entry) => entry.operationId), ["operation_capacity_new_20001"]);
  assert.equal(Object.hasOwn(atCapacity, "operation_capacity_new_20001"), false);
  assert.equal(Object.hasOwn(staged, "operation_capacity_new_20001"), true);
});

test("receipt MVCC checkpoints bound expired-victim churn while old views remain isolated", () => {
  const raw = {};
  for (let index = 0; index < DURABLE_RECEIPT_MAX_COUNT; index += 1) {
    const operationId = `operation_churn_base_${String(index).padStart(8, "0")}`;
    raw[operationId] = receipt(operationId, {
      committedAtMs: NOW_MS - 2_000_000 + index,
      expiresAtMs: NOW_MS - DURABLE_RECEIPT_MAX_COUNT + index,
      response: {ok: true},
    });
  }
  const baseline = canonicalDurableMutationReceipts(raw);
  let current = baseline;
  const churnCount = Math.floor(DURABLE_RECEIPT_CHECKPOINT_HISTORY_MAX / 2) + 1;
  for (let index = 0; index < churnCount; index += 1) {
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
  assert.equal(stats.checkpointCount, 1);
  assert.ok(stats.historicalKeyCount <= DURABLE_RECEIPT_MAX_COUNT + 1);
  assert.ok(stats.historyEntryCount <= 2);
  assert.ok(stats.expiryHeapSize <= DURABLE_RECEIPT_MAX_COUNT + stats.historyEntryCount);
  assert.ok(stats.oldestHeapSize <= DURABLE_RECEIPT_MAX_COUNT + stats.historyEntryCount);
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
  const firstRead = baseline[operationId].response;
  const secondRead = baseline[operationId].response;
  assert.equal(firstRead.nested.value, 1);
  assert.equal(Object.isFrozen(firstRead.nested), true);
  assert.notEqual(firstRead, secondRead);
  assert.equal(Object.keys(baseline[operationId]).includes("response"), true);
  const responseDescriptor = Object.getOwnPropertyDescriptor(baseline[operationId], "response");
  assert.equal(responseDescriptor.enumerable, true);
  assert.equal(responseDescriptor.set, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(baseline[operationId])).response, {
    ok: true,
    nested: {value: 1},
  });
  assert.deepEqual(structuredClone(baseline[operationId]).response, {
    ok: true,
    nested: {value: 1},
  });
  const materializedBaseline = materializeDurableMutationReceipts(baseline);
  materializedBaseline[operationId].response.nested.value = 7;
  assert.equal(baseline[operationId].response.nested.value, 1);
  assert.equal(durableReceiptReplayResult(baseline[operationId]).nested.value, 1);

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
