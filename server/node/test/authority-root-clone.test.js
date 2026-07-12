"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  authorityRootTrustCompromised,
  cloneAuthorityRoot,
  isTrustedAuthorityRoot,
  markAuthorityRootTrusted,
} = require("../src/auth/authority-root-clone");
const {
  materializeAuthorityRootLargeCollections,
} = require("../src/auth/authority-root-materialization");
const {
  commitConsumedEquipmentEnvelopeLedger,
  ensureConsumedEquipmentEnvelopeIds,
  readConsumedEquipmentEnvelopeLedger,
} = require("../src/auth/equipment-envelope-consumed-ledger");
const {
  canonicalDurableMutationReceipts,
  commitDurableMutationReceiptDelta,
  stageDurableMutationReceipt,
} = require("../src/auth/durable-mutation-state");

test("authority root clones share only a validated immutable consumed ledger", () => {
  const canonical = readConsumedEquipmentEnvelopeLedger({
    eqx_clone_capacity_0001: {
      schemaVersion: 1,
      envelopeId: "eqx_clone_capacity_0001",
    },
  });
  assert.equal(canonical.ok, true);
  const root = {
    profiles: {player_a: {profile: {stoneCoins: 10}}},
    consumedEquipmentEnvelopes: canonical.ledger,
  };
  const cloned = cloneAuthorityRoot(root);
  assert.notEqual(cloned, root);
  assert.notEqual(cloned.profiles, root.profiles);
  assert.equal(cloned.consumedEquipmentEnvelopes, root.consumedEquipmentEnvelopes);

  cloned.profiles.player_a.profile.stoneCoins = 20;
  assert.equal(root.profiles.player_a.profile.stoneCoins, 10);
  const appended = ensureConsumedEquipmentEnvelopeIds(
    cloned.consumedEquipmentEnvelopes,
    "eqx_clone_capacity_0002",
  );
  assert.equal(appended.ok, true);
  assert.notEqual(appended.ledger, canonical.ledger);
  assert.equal(Object.hasOwn(canonical.ledger, "eqx_clone_capacity_0002"), false);
  assert.equal(Object.hasOwn(appended.ledger, "eqx_clone_capacity_0002"), true);
});

test("authority root clones never share an unvalidated ledger", () => {
  const rawLedger = {
    eqx_clone_untrusted_0001: {
      schemaVersion: 1,
      envelopeId: "eqx_clone_untrusted_0001",
    },
  };
  const root = {profiles: {}, consumedEquipmentEnvelopes: rawLedger};
  const cloned = cloneAuthorityRoot(root);
  assert.notEqual(cloned.consumedEquipmentEnvelopes, rawLedger);
  cloned.consumedEquipmentEnvelopes.eqx_clone_untrusted_0001.schemaVersion = 2;
  assert.equal(rawLedger.eqx_clone_untrusted_0001.schemaVersion, 1);
});

test("trusted roots accept same-lineage staged views but reject canonical field replacement", () => {
  const originalLedger = readConsumedEquipmentEnvelopeLedger({
    eqx_trusted_identity_0001: {
      schemaVersion: 1,
      envelopeId: "eqx_trusted_identity_0001",
    },
  }).ledger;
  const originalReceipts = canonicalDurableMutationReceipts({});
  const root = {
    profiles: {},
    consumedEquipmentEnvelopes: originalLedger,
    mutationReceipts: originalReceipts,
  };
  assert.equal(markAuthorityRootTrusted(root), true);
  assert.equal(isTrustedAuthorityRoot(root), true);

  const staged = ensureConsumedEquipmentEnvelopeIds(
    originalLedger,
    "eqx_trusted_identity_0002",
  );
  assert.equal(staged.ok, true);
  root.consumedEquipmentEnvelopes = staged.ledger;
  assert.equal(isTrustedAuthorityRoot(root), true);
  assert.doesNotThrow(() => cloneAuthorityRoot(root));

  commitConsumedEquipmentEnvelopeLedger(staged.ledger);
  assert.equal(markAuthorityRootTrusted(root), true);
  root.consumedEquipmentEnvelopes = originalLedger;
  assert.equal(authorityRootTrustCompromised(root), true);
  root.consumedEquipmentEnvelopes = staged.ledger;
  assert.equal(isTrustedAuthorityRoot(root), true);

  root.mutationReceipts = canonicalDurableMutationReceipts({});
  assert.equal(authorityRootTrustCompromised(root), true);
  assert.throws(
    () => cloneAuthorityRoot(root),
    (error) => error && error.code === "authority_root_large_collection_identity_replaced",
  );
  root.mutationReceipts = originalReceipts;
  assert.equal(isTrustedAuthorityRoot(root), true);

  root.consumedEquipmentEnvelopes = readConsumedEquipmentEnvelopeLedger({}).ledger;
  assert.equal(isTrustedAuthorityRoot(root), false);
  assert.equal(authorityRootTrustCompromised(root), true);
  assert.throws(
    () => cloneAuthorityRoot(root),
    (error) => error && error.code === "authority_root_large_collection_identity_replaced",
  );
});

test("backup and migration materialization produces complete structured-cloneable buckets", () => {
  const baseline = readConsumedEquipmentEnvelopeLedger({
    eqx_materialize_ledger_0001: {schemaVersion: 1, envelopeId: "eqx_materialize_ledger_0001"},
  }).ledger;
  const staged = ensureConsumedEquipmentEnvelopeIds(baseline, "eqx_materialize_ledger_0002");
  const root = {
    profiles: {player_a: {profile: {name: "物化档案"}}},
    consumedEquipmentEnvelopes: staged.ledger,
    mutationReceipts: canonicalDurableMutationReceipts({}),
  };
  markAuthorityRootTrusted(root);
  const materialized = materializeAuthorityRootLargeCollections(root);
  assert.doesNotThrow(() => structuredClone(materialized));
  assert.deepEqual(Object.keys(materialized.consumedEquipmentEnvelopes), [
    "eqx_materialize_ledger_0001",
    "eqx_materialize_ledger_0002",
  ]);
  assert.deepEqual(materialized.mutationReceipts, {});
  assert.equal(isTrustedAuthorityRoot(materialized), false);
});

test("trusted receipt views cannot drop pending rows or roll back to an older revision", () => {
  const receipts = canonicalDurableMutationReceipts({});
  const root = {
    profiles: {},
    consumedEquipmentEnvelopes: readConsumedEquipmentEnvelopeLedger({}).ledger,
    mutationReceipts: receipts,
  };
  markAuthorityRootTrusted(root);
  const staged = stageDurableMutationReceipt(receipts, {
    schemaVersion: 1,
    operationId: "operation_trusted_receipt_0001",
    requestHash: "a".repeat(64),
    actionId: "bank.deposit",
    accountId: "acc_trusted_receipt",
    committedAt: "2026-07-12T00:00:00.000Z",
    expiresAt: "2026-07-15T00:00:00.000Z",
    response: {ok: true},
  }, {nowMs: Date.parse("2026-07-12T00:00:00.000Z")});
  root.mutationReceipts = staged;
  assert.equal(isTrustedAuthorityRoot(root), true);
  markAuthorityRootTrusted(root);

  root.mutationReceipts = receipts;
  assert.equal(authorityRootTrustCompromised(root), true);
  root.mutationReceipts = staged;
  assert.equal(isTrustedAuthorityRoot(root), true);

  commitDurableMutationReceiptDelta(staged);
  markAuthorityRootTrusted(root);
  root.mutationReceipts = receipts;
  assert.equal(authorityRootTrustCompromised(root), true);
});
