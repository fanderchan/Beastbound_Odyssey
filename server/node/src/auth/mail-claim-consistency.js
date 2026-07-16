"use strict";

const {isDeepStrictEqual} = require("node:util");
const {
  consumedEquipmentEnvelopeLedgerDeltaFrom,
} = require("./equipment-envelope-consumed-ledger");
const {mailAuthorityDeltaFrom} = require("./mail-authority-state");

function buildRowLocalMailClaimConsistencyScope(options = {}) {
  if (options.methodName !== "claimMailAttachments"
    || !options.receipt
    || typeof options.receipt !== "object") {
    return null;
  }
  const before = objectOrEmpty(options.before);
  const candidate = objectOrEmpty(options.candidate);
  const accountId = String(options.accountId || "");
  const playerId = String(options.playerId || "");
  const mailId = String(options.mailId || "").trim();
  const beforeBinding = objectOrEmpty(before.profileBindings && before.profileBindings[accountId]);
  const beforeProfile = objectOrEmpty(before.profiles && before.profiles[playerId]);
  const nextBinding = objectOrEmpty(candidate.profileBindings && candidate.profileBindings[accountId]);
  const nextProfile = objectOrEmpty(candidate.profiles && candidate.profiles[playerId]);
  const beforeMail = objectOrEmpty(before.mailMessages && before.mailMessages[mailId]);
  const hasNextMail = Boolean(candidate.mailMessages
    && Object.hasOwn(candidate.mailMessages, mailId));
  const nextMail = hasNextMail ? objectOrEmpty(candidate.mailMessages[mailId]) : null;
  const mailDisposition = hasNextMail ? "update" : "delete";
  const mailDelta = mailAuthorityDeltaFrom(before.mailMessages, candidate.mailMessages);
  const exactMailChange = mailDelta.ok && mailDelta.changes.length === 1
    ? mailDelta.changes[0]
    : null;
  const claimedEnvelopeIds = removedMailEquipmentEnvelopeIds(beforeMail, nextMail);
  const consumedDelta = consumedEquipmentEnvelopeLedgerDeltaFrom(
    before.consumedEquipmentEnvelopes,
    candidate.consumedEquipmentEnvelopes,
  );
  const responseClaim = objectOrEmpty(objectOrEmpty(options.receipt.response).claim);
  if (
    accountId === ""
    || playerId === ""
    || mailId === ""
    || String(beforeBinding.accountId || "") !== accountId
    || String(beforeProfile.accountId || "") !== accountId
    || String(beforeProfile.playerId || "") !== playerId
    || String(nextBinding.accountId || "") !== accountId
    || String(nextBinding.playerId || "") !== playerId
    || String(nextProfile.accountId || "") !== accountId
    || String(nextProfile.playerId || "") !== playerId
    || String(beforeMail.mailId || "") !== mailId
    || String(beforeMail.recipientAccountId || "") !== accountId
    || exactMailChange === null
    || exactMailChange.mailId !== mailId
    || exactMailChange.disposition !== mailDisposition
    || exactMailChange.before !== beforeMail
    || exactMailChange.after !== nextMail
    || (nextMail !== null && (
      String(nextMail.mailId || "") !== mailId
      || String(nextMail.recipientAccountId || "") !== accountId
    ))
    || claimedEnvelopeIds === null
    || !consumedDelta.ok
    || !isDeepStrictEqual([...consumedDelta.addedIds].sort(), claimedEnvelopeIds)
    || String(responseClaim.mailId || "") !== mailId
  ) {
    return null;
  }
  return {
    kind: "row_local_mail_claim_v1",
    accountId,
    playerId,
    mailId,
    mailDisposition,
    claimedEnvelopeIds,
    operationId: String(options.receipt.operationId || ""),
    requestHash: String(options.receipt.requestHash || ""),
    actionId: String(options.receipt.actionId || ""),
  };
}

function rowLocalMailClaimRecoveryMatches(reloaded, expected, scope) {
  if (!scope || String(scope.kind || "") !== "row_local_mail_claim_v1") {
    return false;
  }
  const accountId = String(scope.accountId || "");
  const playerId = String(scope.playerId || "");
  const mailId = String(scope.mailId || "");
  const mailDisposition = String(scope.mailDisposition || "");
  const operationId = String(scope.operationId || "");
  const requestHash = String(scope.requestHash || "");
  const actionId = String(scope.actionId || "");
  const claimedEnvelopeIds = canonicalMailClaimEnvelopeIds(scope.claimedEnvelopeIds);
  if (
    accountId === ""
    || playerId === ""
    || mailId === ""
    || !["update", "delete"].includes(mailDisposition)
    || operationId === ""
    || requestHash === ""
    || actionId === ""
    || claimedEnvelopeIds === null
  ) {
    return false;
  }
  const reloadedBinding = reloaded.profileBindings && reloaded.profileBindings[accountId];
  const expectedBinding = expected.profileBindings && expected.profileBindings[accountId];
  const reloadedProfile = reloaded.profiles && reloaded.profiles[playerId];
  const expectedProfile = expected.profiles && expected.profiles[playerId];
  const reloadedReceipt = reloaded.mutationReceipts && reloaded.mutationReceipts[operationId];
  const expectedReceipt = expected.mutationReceipts && expected.mutationReceipts[operationId];
  const reloadedMail = reloaded.mailMessages && reloaded.mailMessages[mailId];
  const expectedMail = expected.mailMessages && expected.mailMessages[mailId];
  if (
    !reloadedBinding
    || !expectedBinding
    || !reloadedProfile
    || !expectedProfile
    || !reloadedReceipt
    || !expectedReceipt
    || String(reloadedReceipt.operationId || "") !== operationId
    || String(reloadedReceipt.requestHash || "") !== requestHash
    || String(reloadedReceipt.actionId || "") !== actionId
    || String(reloadedReceipt.accountId || "") !== accountId
    || (mailDisposition === "update" && (
      !reloadedMail
      || !expectedMail
      || !isDeepStrictEqual(reloadedMail, expectedMail)
    ))
    || (mailDisposition === "delete" && (reloadedMail || expectedMail))
  ) {
    return false;
  }
  for (const envelopeId of claimedEnvelopeIds) {
    const reloadedRecord = reloaded.consumedEquipmentEnvelopes
      && reloaded.consumedEquipmentEnvelopes[envelopeId];
    const expectedRecord = expected.consumedEquipmentEnvelopes
      && expected.consumedEquipmentEnvelopes[envelopeId];
    if (!reloadedRecord || !expectedRecord || !isDeepStrictEqual(reloadedRecord, expectedRecord)) {
      return false;
    }
  }
  return isDeepStrictEqual(reloadedBinding, expectedBinding)
    && isDeepStrictEqual(reloadedProfile, expectedProfile)
    && isDeepStrictEqual(reloadedReceipt, expectedReceipt);
}

function canonicalMailClaimEnvelopeIds(value) {
  if (!Array.isArray(value)) {
    return null;
  }
  const ids = [];
  const seen = new Set();
  for (const rawId of value) {
    const envelopeId = typeof rawId === "string" ? rawId : "";
    if (
      envelopeId === ""
      || envelopeId !== envelopeId.trim()
      || !/^eqx_[A-Za-z0-9_-]{8,156}$/.test(envelopeId)
      || seen.has(envelopeId)
    ) {
      return null;
    }
    seen.add(envelopeId);
    ids.push(envelopeId);
  }
  const sorted = [...ids].sort();
  return isDeepStrictEqual(ids, sorted) ? ids : null;
}

function mailEquipmentEnvelopeMap(mailValue) {
  if (!mailValue || typeof mailValue !== "object" || Array.isArray(mailValue)) {
    return null;
  }
  const rawEnvelopes = Object.hasOwn(mailValue, "equipmentEnvelopes")
    ? mailValue.equipmentEnvelopes
    : [];
  if (!Array.isArray(rawEnvelopes)) {
    return null;
  }
  const envelopes = new Map();
  for (const envelope of rawEnvelopes) {
    const envelopeId = String(envelope && envelope.envelopeId || "");
    if (
      !envelope
      || typeof envelope !== "object"
      || Array.isArray(envelope)
      || envelopeId === ""
      || envelopeId !== envelopeId.trim()
      || !/^eqx_[A-Za-z0-9_-]{8,156}$/.test(envelopeId)
      || envelopes.has(envelopeId)
    ) {
      return null;
    }
    envelopes.set(envelopeId, envelope);
  }
  return envelopes;
}

function removedMailEquipmentEnvelopeIds(beforeMail, nextMail) {
  const beforeEnvelopes = mailEquipmentEnvelopeMap(beforeMail);
  const nextEnvelopes = nextMail === null ? new Map() : mailEquipmentEnvelopeMap(nextMail);
  if (beforeEnvelopes === null || nextEnvelopes === null) {
    return null;
  }
  for (const [envelopeId, envelope] of nextEnvelopes.entries()) {
    if (!beforeEnvelopes.has(envelopeId)
      || !isDeepStrictEqual(beforeEnvelopes.get(envelopeId), envelope)) {
      return null;
    }
  }
  return Array.from(beforeEnvelopes.keys())
    .filter((envelopeId) => !nextEnvelopes.has(envelopeId))
    .sort();
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

module.exports = {
  buildRowLocalMailClaimConsistencyScope,
  canonicalMailClaimEnvelopeIds,
  mailEquipmentEnvelopeMap,
  removedMailEquipmentEnvelopeIds,
  rowLocalMailClaimRecoveryMatches,
};
