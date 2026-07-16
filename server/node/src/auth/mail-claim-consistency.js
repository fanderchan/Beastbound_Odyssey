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
  const receiptResponse = objectOrEmpty(options.receipt.response);
  const responseClaim = objectOrEmpty(receiptResponse.claim);
  const responseMail = objectOrEmpty(receiptResponse.mail);
  const expectedResponseMail = typeof options.publicMail === "function" && nextMail !== null
    ? options.publicMail(nextMail)
    : null;
  if (
    accountId === ""
    || playerId === ""
    || mailId === ""
    || mailDisposition !== "update"
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
    || !expectedResponseMail
    || !isDeepStrictEqual(responseMail, expectedResponseMail)
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
    || mailDisposition !== "update"
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
    || !reloadedMail
    || !expectedMail
    || !isDeepStrictEqual(reloadedMail, expectedMail)
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

function nullableTimestamp(value) {
  return typeof value === "string" && value !== "" ? value : null;
}

function mailClaimReceiptResponseMatches(mailValue, responseValue) {
  const mail = objectOrEmpty(mailValue);
  const response = objectOrEmpty(responseValue);
  const schemaVersion = Number(mail.schemaVersion) === 2 ? 2 : 1;
  const expected = {
    mailId: mail.mailId,
    mailKind: String(mail.mailKind || ""),
    senderUsername: mail.senderUsername,
    senderDisplayName: mail.senderDisplayName,
    recipientUsername: mail.recipientUsername,
    recipientDisplayName: mail.recipientDisplayName,
    title: mail.title,
    body: mail.body,
    items: publicMailClaimItems(mail.items),
    currency: publicMailClaimCurrency(mail.currency || mail.currencies || {}),
    createdAt: mail.createdAt,
    readAt: nullableTimestamp(mail.readAt),
    settledAt: nullableTimestamp(mail.settledAt),
    schemaVersion,
  };
  if (schemaVersion === 2 || Object.hasOwn(mail, "equipmentEnvelopes")) {
    expected.equipmentEnvelopes = (Array.isArray(mail.equipmentEnvelopes)
      ? mail.equipmentEnvelopes
      : []).map(publicMailClaimEquipmentEnvelope);
  }
  return isDeepStrictEqual(response, expected);
}

function publicMailClaimItems(value) {
  const counts = new Map();
  for (const entry of Array.isArray(value) ? value : []) {
    const itemId = String(entry && entry.itemId || "").trim();
    const count = Math.max(0, Math.trunc(Number(entry && entry.count || 0)));
    if (itemId === "" || count <= 0) {
      continue;
    }
    counts.set(itemId, Number(counts.get(itemId) || 0) + count);
  }
  return Array.from(counts.entries()).map(([itemId, count]) => ({itemId, count}));
}

function publicMailClaimCurrency(value) {
  const raw = objectOrEmpty(value);
  const result = {};
  const stoneCoins = Math.max(0, Math.trunc(Number(raw.stoneCoins || raw.coins || 0)));
  const diamonds = Math.max(0, Math.trunc(Number(raw.diamonds || raw.diamond || 0)));
  if (stoneCoins > 0) {
    result.stoneCoins = stoneCoins;
  }
  if (diamonds > 0) {
    result.diamonds = diamonds;
  }
  return result;
}

function publicMailClaimEquipmentEnvelope(value) {
  const envelope = objectOrEmpty(value);
  const state = objectOrEmpty(envelope.instanceState);
  const publicState = {};
  for (const [field, fieldValue] of Object.entries(state)) {
    if (["source", "transferProvenance", "qaAssetSample", "__proto__", "prototype", "constructor"].includes(field)) {
      continue;
    }
    publicState[field] = structuredClone(fieldValue);
  }
  return {
    schemaVersion: envelope.schemaVersion,
    envelopeId: envelope.envelopeId,
    itemId: envelope.itemId,
    instanceState: publicState,
    stateFingerprint: envelope.stateFingerprint,
  };
}

module.exports = {
  buildRowLocalMailClaimConsistencyScope,
  canonicalMailClaimEnvelopeIds,
  mailClaimReceiptResponseMatches,
  mailEquipmentEnvelopeMap,
  removedMailEquipmentEnvelopeIds,
  rowLocalMailClaimRecoveryMatches,
};
