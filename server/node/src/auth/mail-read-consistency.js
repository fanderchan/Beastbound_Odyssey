"use strict";

const {isDeepStrictEqual} = require("node:util");
const {mailAuthorityDeltaFrom} = require("./mail-authority-state");

const MAIL_READ_SCOPE_KIND = "row_local_mail_read_v1";
const MAIL_READ_DISPOSITION_UPDATE = "update";

function buildRowLocalMailReadConsistencyScope(options = {}) {
  if (options.methodName !== "markMailRead" || !isRecord(options.receipt)) {
    return null;
  }
  const before = objectOrEmpty(options.before);
  const candidate = objectOrEmpty(options.candidate);
  const accountId = canonicalIdentity(options.accountId);
  const mailId = canonicalIdentity(options.mailId);
  const receipt = options.receipt;
  const operationId = canonicalIdentity(receipt.operationId);
  const requestHash = canonicalIdentity(receipt.requestHash);
  const actionId = canonicalIdentity(receipt.actionId);
  const beforeMail = objectOrEmpty(before.mailMessages && before.mailMessages[mailId]);
  const candidateHasMail = Boolean(candidate.mailMessages
    && Object.hasOwn(candidate.mailMessages, mailId));
  const nextMail = candidateHasMail
    ? objectOrEmpty(candidate.mailMessages[mailId])
    : null;
  if (
    accountId === ""
    || mailId === ""
    || operationId === ""
    || requestHash === ""
    || actionId === ""
    || canonicalIdentity(receipt.accountId) !== accountId
    || canonicalIdentity(beforeMail.mailId) !== mailId
    || canonicalIdentity(beforeMail.recipientAccountId) !== accountId
    || nextMail === null
    || canonicalIdentity(nextMail.mailId) !== mailId
    || canonicalIdentity(nextMail.recipientAccountId) !== accountId
  ) {
    return null;
  }

  const delta = mailAuthorityDeltaFrom(before.mailMessages, candidate.mailMessages);
  if (!delta.ok) {
    return null;
  }
  const exactChange = delta.changes.length === 1 ? delta.changes[0] : null;
  const expectedNextMail = {...beforeMail, readAt: nextMail.readAt};
  if (
    beforeMail.readAt !== null
    || !canonicalIsoTimestamp(nextMail.readAt)
    || exactChange === null
    || exactChange.mailId !== mailId
    || exactChange.disposition !== MAIL_READ_DISPOSITION_UPDATE
    || exactChange.before !== beforeMail
    || exactChange.after !== nextMail
    || !isDeepStrictEqual(nextMail, expectedNextMail)
  ) {
    return null;
  }

  return {
    kind: MAIL_READ_SCOPE_KIND,
    mailDisposition: MAIL_READ_DISPOSITION_UPDATE,
    accountId,
    mailId,
    operationId,
    requestHash,
    actionId,
  };
}

function rowLocalMailReadRecoveryMatches(reloadedValue, expectedValue, scopeValue) {
  const scope = canonicalMailReadConsistencyScope(scopeValue);
  if (scope === null) {
    return false;
  }
  const reloaded = objectOrEmpty(reloadedValue);
  const expected = objectOrEmpty(expectedValue);
  const reloadedMail = reloaded.mailMessages && reloaded.mailMessages[scope.mailId];
  const expectedMail = expected.mailMessages && expected.mailMessages[scope.mailId];
  const reloadedReceipt = reloaded.mutationReceipts
    && reloaded.mutationReceipts[scope.operationId];
  const expectedReceipt = expected.mutationReceipts
    && expected.mutationReceipts[scope.operationId];
  return Boolean(reloadedMail && expectedMail && reloadedReceipt && expectedReceipt)
    && canonicalIdentity(reloadedMail.mailId) === scope.mailId
    && canonicalIdentity(reloadedMail.recipientAccountId) === scope.accountId
    && canonicalIsoTimestamp(reloadedMail.readAt)
    && canonicalIdentity(reloadedReceipt.operationId) === scope.operationId
    && canonicalIdentity(reloadedReceipt.requestHash) === scope.requestHash
    && canonicalIdentity(reloadedReceipt.actionId) === scope.actionId
    && canonicalIdentity(reloadedReceipt.accountId) === scope.accountId
    && isDeepStrictEqual(reloadedMail, expectedMail)
    && isDeepStrictEqual(reloadedReceipt, expectedReceipt);
}

function canonicalMailReadConsistencyScope(value) {
  if (!isRecord(value)) {
    return null;
  }
  const fields = new Set([
    "kind",
    "mailDisposition",
    "accountId",
    "mailId",
    "operationId",
    "requestHash",
    "actionId",
  ]);
  const scope = {
    kind: value.kind,
    mailDisposition: value.mailDisposition,
    accountId: value.accountId,
    mailId: value.mailId,
    operationId: value.operationId,
    requestHash: value.requestHash,
    actionId: value.actionId,
  };
  if (
    Object.keys(value).length !== fields.size
    || Object.keys(value).some((field) => !fields.has(field))
    || scope.kind !== MAIL_READ_SCOPE_KIND
    || scope.mailDisposition !== MAIL_READ_DISPOSITION_UPDATE
    || canonicalIdentity(scope.accountId) !== scope.accountId
    || canonicalIdentity(scope.mailId) !== scope.mailId
    || canonicalIdentity(scope.operationId) !== scope.operationId
    || canonicalIdentity(scope.requestHash) !== scope.requestHash
    || canonicalIdentity(scope.actionId) !== scope.actionId
  ) {
    return null;
  }
  return scope;
}

function canonicalIsoTimestamp(value) {
  if (typeof value !== "string" || value === "" || value !== value.trim()) {
    return false;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  try {
    return new Date(timestamp).toISOString() === value;
  } catch {
    return false;
  }
}

function canonicalIdentity(value) {
  return typeof value === "string" && value !== "" && value === value.trim() ? value : "";
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function objectOrEmpty(value) {
  return isRecord(value) ? value : {};
}

module.exports = {
  MAIL_READ_DISPOSITION_UPDATE,
  MAIL_READ_SCOPE_KIND,
  buildRowLocalMailReadConsistencyScope,
  canonicalMailReadConsistencyScope,
  rowLocalMailReadRecoveryMatches,
};
