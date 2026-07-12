"use strict";

const {
  consumedEquipmentEnvelopeLedgerCanDescendFrom,
  isCanonicalConsumedEquipmentEnvelopeLedger,
} = require("./equipment-envelope-consumed-ledger");
const {
  durableMutationReceiptLedgerCanDescendFrom,
  isCanonicalDurableMutationReceipts,
} = require("./durable-mutation-state");

const CONSUMED_EQUIPMENT_ENVELOPES_KEY = "consumedEquipmentEnvelopes";
const MUTATION_RECEIPTS_KEY = "mutationReceipts";
const TRUSTED_AUTHORITY_ROOTS = new WeakMap();

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

// The two large authority ledgers expose immutable MVCC views. Sharing those
// views between request-private candidates is safe: staged rows live on a new
// view and are not published into the shared lineage until storage COMMIT.
// Untrusted roots still take the full clone path and are audited by normalize.
function cloneAuthorityRoot(value) {
  if (!isRecord(value)) {
    return value === undefined ? undefined : cloneJson(value);
  }
  if (authorityRootTrustCompromised(value)) {
    const error = new Error("权威大型账本身份已被替换，拒绝继续使用旧可信索引。");
    error.code = "authority_root_large_collection_identity_replaced";
    throw error;
  }
  const ledger = value[CONSUMED_EQUIPMENT_ENVELOPES_KEY];
  const receipts = value[MUTATION_RECEIPTS_KEY];
  const shareLedger = isCanonicalConsumedEquipmentEnvelopeLedger(ledger);
  const shareReceipts = isCanonicalDurableMutationReceipts(receipts);
  if (!shareLedger && !shareReceipts) {
    return cloneJson(value);
  }
  const withoutSharedLedgers = {...value};
  if (shareLedger) {
    delete withoutSharedLedgers[CONSUMED_EQUIPMENT_ENVELOPES_KEY];
  }
  if (shareReceipts) {
    delete withoutSharedLedgers[MUTATION_RECEIPTS_KEY];
  }
  const cloned = cloneJson(withoutSharedLedgers);
  if (shareLedger) {
    cloned[CONSUMED_EQUIPMENT_ENVELOPES_KEY] = ledger;
  }
  if (shareReceipts) {
    cloned[MUTATION_RECEIPTS_KEY] = receipts;
  }
  if (isTrustedAuthorityRoot(value) && shareLedger && shareReceipts) {
    TRUSTED_AUTHORITY_ROOTS.set(cloned, {
      consumedEquipmentEnvelopes: ledger,
      mutationReceipts: receipts,
    });
  }
  return cloned;
}

function markAuthorityRootTrusted(value) {
  if (
    isRecord(value)
    && isCanonicalConsumedEquipmentEnvelopeLedger(value[CONSUMED_EQUIPMENT_ENVELOPES_KEY])
    && isCanonicalDurableMutationReceipts(value[MUTATION_RECEIPTS_KEY])
  ) {
    TRUSTED_AUTHORITY_ROOTS.set(value, {
      consumedEquipmentEnvelopes: value[CONSUMED_EQUIPMENT_ENVELOPES_KEY],
      mutationReceipts: value[MUTATION_RECEIPTS_KEY],
    });
    return true;
  }
  return false;
}

function isTrustedAuthorityRoot(value) {
  if (!isRecord(value)) {
    return false;
  }
  const trusted = TRUSTED_AUTHORITY_ROOTS.get(value);
  if (!trusted) {
    return false;
  }
  const ledger = value[CONSUMED_EQUIPMENT_ENVELOPES_KEY];
  const receipts = value[MUTATION_RECEIPTS_KEY];
  return (
    isCanonicalConsumedEquipmentEnvelopeLedger(ledger)
    && isCanonicalDurableMutationReceipts(receipts)
    && consumedEquipmentEnvelopeLedgerCanDescendFrom(
      trusted.consumedEquipmentEnvelopes,
      ledger,
    )
    && durableMutationReceiptLedgerCanDescendFrom(
      trusted.mutationReceipts,
      receipts,
    )
  );
}

function authorityRootTrustCompromised(value) {
  return isRecord(value) && TRUSTED_AUTHORITY_ROOTS.has(value) && !isTrustedAuthorityRoot(value);
}

module.exports = {
  cloneAuthorityRoot,
  authorityRootTrustCompromised,
  isTrustedAuthorityRoot,
  markAuthorityRootTrusted,
};
