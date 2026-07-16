"use strict";

const {cloneAuthorityRoot} = require("./authority-root-clone");
const {
  materializeConsumedEquipmentEnvelopeLedger,
} = require("./equipment-envelope-consumed-ledger");
const {
  materializeDurableMutationReceipts,
} = require("./durable-mutation-state");
const {
  materializeMailAuthorityState,
} = require("./mail-authority-state");

// Online authority roots may contain immutable Proxy-backed MVCC views. Every
// serialization, backup and migration boundary must turn those views back into
// complete ordinary objects before structuredClone/JSON/file tooling sees them.
function materializeAuthorityRootLargeCollections(data) {
  // Spreading drops the internal trusted-root marker before replacing the two
  // canonical fields with their ordinary serialized form.
  const root = {...cloneAuthorityRoot(data || {})};
  const ledger = materializeConsumedEquipmentEnvelopeLedger(root.consumedEquipmentEnvelopes);
  // A malformed consumed ledger remains inspectable by quarantine/recovery
  // tooling; domain registries still reject it before any asset mutation.
  root.consumedEquipmentEnvelopes = ledger.ok
    ? cloneJson(ledger.ledger)
    : cloneJson(root.consumedEquipmentEnvelopes);
  root.mutationReceipts = materializeDurableMutationReceipts(root.mutationReceipts);
  const mailMessages = materializeMailAuthorityState(root.mailMessages);
  root.mailMessages = mailMessages.ok
    ? mailMessages.messages
    : cloneJson(root.mailMessages);
  return root;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  materializeAuthorityRootLargeCollections,
};
