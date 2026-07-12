"use strict";

const {
  isCanonicalConsumedEquipmentEnvelopeLedger,
} = require("./equipment-envelope-consumed-ledger");

const CONSUMED_EQUIPMENT_ENVELOPES_KEY = "consumedEquipmentEnvelopes";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

// A validated consumed-envelope ledger is immutable and append-only. Sharing
// that one large bucket between request-private candidates is therefore safe:
// any real append returns a new canonical ledger, while failed requests cannot
// mutate the published value. Untrusted, malformed or not-yet-validated roots
// still take the ordinary full clone path and are audited before reuse.
function cloneAuthorityRoot(value) {
  if (!isRecord(value)) {
    return value === undefined ? undefined : cloneJson(value);
  }
  const ledger = value[CONSUMED_EQUIPMENT_ENVELOPES_KEY];
  if (!isCanonicalConsumedEquipmentEnvelopeLedger(ledger)) {
    return cloneJson(value);
  }
  const withoutLedger = {...value};
  delete withoutLedger[CONSUMED_EQUIPMENT_ENVELOPES_KEY];
  const cloned = cloneJson(withoutLedger);
  cloned[CONSUMED_EQUIPMENT_ENVELOPES_KEY] = ledger;
  return cloned;
}

module.exports = {
  cloneAuthorityRoot,
};
