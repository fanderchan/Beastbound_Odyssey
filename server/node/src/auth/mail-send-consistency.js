"use strict";

const {isDeepStrictEqual} = require("node:util");
const {
  consumedEquipmentEnvelopeLedgerDeltaFrom,
} = require("./equipment-envelope-consumed-ledger");
const {readMailAttachmentState} = require("./mail-attachment-state");
const {
  mailAuthorityDeltaFrom,
} = require("./mail-authority-state");

const MAIL_SEND_SCOPE_KIND = "row_local_mail_send_v1";
const MAIL_SEND_MODE_TEXT = "text";
const MAIL_SEND_MODE_ORDINARY_ITEMS = "ordinary_items";
const PLAYER_MAIL_FIELDS = new Set([
  "mailId",
  "senderAccountId",
  "senderUsername",
  "senderDisplayName",
  "recipientAccountId",
  "recipientUsername",
  "recipientDisplayName",
  "title",
  "body",
  "items",
  "equipmentEnvelopes",
  "currency",
  "createdAt",
  "readAt",
  "schemaVersion",
]);

function buildMailSendSharedAssetReadRequest(options = {}) {
  if (options.methodName !== "sendMail") {
    return null;
  }
  const accountId = canonicalIdentity(options.accountId);
  const payload = objectOrEmpty(options.payload);
  const normalizeUsername = typeof options.normalizeUsername === "function"
    ? options.normalizeUsername
    : (value) => String(value || "").trim().toLowerCase();
  const recipientUsername = normalizeUsername(
    payload.recipientUsername || payload.toUsername || payload.username || "",
  );
  if (accountId === "" || recipientUsername === "") {
    return null;
  }
  if (["equipmentEnvelope", "equipmentEnvelopes", "envelope", "envelopes"]
    .some((field) => Object.hasOwn(payload, field))) {
    return null;
  }
  if (Object.hasOwn(payload, "items") && Object.hasOwn(payload, "attachments")) {
    return null;
  }
  const rawItems = Object.hasOwn(payload, "items")
    ? payload.items
    : (Object.hasOwn(payload, "attachments") ? payload.attachments : []);
  if (!Array.isArray(rawItems)) {
    return null;
  }
  const normalizeMailText = typeof options.normalizeMailText === "function"
    ? options.normalizeMailText
    : null;
  if (normalizeMailText && (
    normalizeMailText(payload.title, options.mailTitleMaxLength) === ""
    || normalizeMailText(payload.body, options.mailBodyMaxLength) === ""
  )) {
    return null;
  }
  const itemById = typeof options.itemById === "function" ? options.itemById : null;
  const isEquipmentItemId = typeof options.isEquipmentItemId === "function"
    ? options.isEquipmentItemId
    : () => false;
  const selectedEquipmentInstanceIds = new Set();
  let hasEquipmentAttachment = false;
  if (rawItems.some((entry) => {
    if (!isRecord(entry)) {
      return true;
    }
    const itemId = typeof entry.itemId === "string" ? entry.itemId.trim() : "";
    const count = Number(entry.count);
    const equipment = isEquipmentItemId(itemId);
    const allowedFields = equipment
      ? new Set(["itemId", "count", "instanceId", "sourceSlotIndex"])
      : new Set(["itemId", "count"]);
    if (
      Object.keys(entry).some((field) => !allowedFields.has(field))
      || !Object.hasOwn(entry, "itemId")
      || !Object.hasOwn(entry, "count")
      || itemId === ""
      || itemById === null
      || !itemById(itemId)
      || !Number.isSafeInteger(count)
      || count < 1
    ) {
      return true;
    }
    if (!equipment) {
      return false;
    }
    const instanceId = typeof entry.instanceId === "string" ? entry.instanceId.trim() : "";
    const sourceSlotIndex = Number(entry.sourceSlotIndex);
    if (
      count !== 1
      || instanceId === ""
      || entry.instanceId !== instanceId
      || !Number.isSafeInteger(sourceSlotIndex)
      || sourceSlotIndex < 0
      || selectedEquipmentInstanceIds.has(instanceId)
    ) {
      return true;
    }
    selectedEquipmentInstanceIds.add(instanceId);
    hasEquipmentAttachment = true;
    return false;
  })) {
    return null;
  }
  const accounts = objectOrEmpty(options.data && options.data.accounts);
  const knownRecipient = objectOrEmpty(accounts[recipientUsername]);
  const knownRecipientAccountId = canonicalIdentity(knownRecipient.accountId);
  if (knownRecipientAccountId === accountId) {
    return null;
  }
  return {
    schemaVersion: 1,
    scope: "mail_send",
    accountId,
    recipientUsername,
    knownRecipientAccountId,
    includeActorProfile: rawItems.length > 0,
    includeProfileMailPartitions: hasEquipmentAttachment,
  };
}

function buildRowLocalMailSendConsistencyScope(options = {}) {
  if (options.methodName !== "sendMail"
    || !isRecord(options.receipt)) {
    return null;
  }
  const before = objectOrEmpty(options.before);
  const candidate = objectOrEmpty(options.candidate);
  const accountId = canonicalIdentity(options.accountId);
  const addition = singleNewMailAddition(before.mailMessages, candidate.mailMessages);
  if (accountId === "" || addition === null) {
    return null;
  }
  const mail = addition.mail;
  const mailId = addition.mailId;
  const sender = accountById(before.accounts, accountId);
  const recipientAccountId = canonicalIdentity(mail.recipientAccountId);
  const recipient = accountById(before.accounts, recipientAccountId);
  const mailState = readMailAttachmentState(
    mail,
    options.battleEquipmentCatalog,
    objectOrEmpty(options.mailAttachmentStateOptions),
  );
  const consumedDelta = consumedEquipmentEnvelopeLedgerDeltaFrom(
    before.consumedEquipmentEnvelopes,
    candidate.consumedEquipmentEnvelopes,
  );
  if (
    sender === null
    || recipient === null
    || recipientAccountId === ""
    || recipientAccountId === accountId
    || !exactFields(mail, PLAYER_MAIL_FIELDS)
    || Number(mail.schemaVersion) !== 2
    || mail.readAt !== null
    || !isRecord(mail.currency)
    || Object.keys(mail.currency).length !== 0
    || !Array.isArray(mail.equipmentEnvelopes)
    || mail.equipmentEnvelopes.length !== 0
    || !mailState.ok
    || mailState.changed
    || mailState.equipmentItems.length !== 0
    || mailState.equipmentEnvelopes.length !== 0
    || !isDeepStrictEqual(mailState.currency, {})
    || canonicalIdentity(mail.mailId) !== mailId
    || canonicalIdentity(mail.senderAccountId) !== accountId
    || mail.senderUsername !== sender.username
    || mail.senderDisplayName !== sender.displayName
    || mail.recipientUsername !== recipient.username
    || mail.recipientDisplayName !== recipient.displayName
    || typeof mail.title !== "string"
    || mail.title === ""
    || mail.title !== mail.title.trim()
    || typeof mail.body !== "string"
    || mail.body === ""
    || mail.body !== mail.body.trim()
    || typeof mail.createdAt !== "string"
    || mail.createdAt === ""
    || mail.createdAt !== mail.createdAt.trim()
    || !consumedDelta.ok
    || consumedDelta.addedIds.length !== 0
    || canonicalIdentity(options.receipt.accountId) !== accountId
  ) {
    return null;
  }

  const mode = mailState.ordinaryItems.length === 0
    ? MAIL_SEND_MODE_TEXT
    : MAIL_SEND_MODE_ORDINARY_ITEMS;
  let playerId = "";
  let nextBinding = null;
  let nextProfile = null;
  if (mode === MAIL_SEND_MODE_TEXT) {
    if (!senderProfileUnchanged(before, candidate, accountId)) {
      return null;
    }
  } else {
    const profileChange = certifiedOrdinaryAttachmentProfileChange({
      before,
      candidate,
      accountId,
      items: mailState.ordinaryItems,
      normalizeBackpackSlots: options.normalizeBackpackSlots,
      profileBackpackSlots: options.profileBackpackSlots,
      backpackItemCount: options.backpackItemCount,
      consumeBackpackItem: options.consumeBackpackItem,
      captureToolBagFromProfile: options.captureToolBagFromProfile,
    });
    if (profileChange === null) {
      return null;
    }
    playerId = profileChange.playerId;
    nextBinding = profileChange.nextBinding;
    nextProfile = profileChange.nextProfile;
  }
  if (!mailSendReceiptResponseMatches({
    receipt: options.receipt,
    mail,
    sender,
    mode,
    nextBinding,
    nextProfile,
  })) {
    return null;
  }
  return {
    kind: MAIL_SEND_SCOPE_KIND,
    mode,
    accountId,
    playerId,
    recipientAccountId,
    recipientUsername: recipient.username,
    mailId,
    operationId: canonicalIdentity(options.receipt.operationId),
    requestHash: canonicalIdentity(options.receipt.requestHash),
    actionId: canonicalIdentity(options.receipt.actionId),
  };
}

function rowLocalMailSendRecoveryMatches(reloadedValue, expectedValue, scopeValue) {
  const scope = canonicalMailSendConsistencyScope(scopeValue);
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
  if (
    !reloadedMail
    || !expectedMail
    || !reloadedReceipt
    || !expectedReceipt
    || canonicalIdentity(reloadedMail.mailId) !== scope.mailId
    || canonicalIdentity(reloadedMail.senderAccountId) !== scope.accountId
    || canonicalIdentity(reloadedMail.recipientAccountId) !== scope.recipientAccountId
    || canonicalIdentity(reloadedReceipt.operationId) !== scope.operationId
    || canonicalIdentity(reloadedReceipt.requestHash) !== scope.requestHash
    || canonicalIdentity(reloadedReceipt.actionId) !== scope.actionId
    || canonicalIdentity(reloadedReceipt.accountId) !== scope.accountId
    || !isDeepStrictEqual(reloadedMail, expectedMail)
    || !isDeepStrictEqual(reloadedReceipt, expectedReceipt)
  ) {
    return false;
  }
  if (scope.mode === MAIL_SEND_MODE_TEXT) {
    return true;
  }
  const reloadedBinding = reloaded.profileBindings
    && reloaded.profileBindings[scope.accountId];
  const expectedBinding = expected.profileBindings
    && expected.profileBindings[scope.accountId];
  const reloadedProfile = reloaded.profiles && reloaded.profiles[scope.playerId];
  const expectedProfile = expected.profiles && expected.profiles[scope.playerId];
  return Boolean(reloadedBinding && expectedBinding && reloadedProfile && expectedProfile)
    && isDeepStrictEqual(reloadedBinding, expectedBinding)
    && isDeepStrictEqual(reloadedProfile, expectedProfile);
}

function canonicalMailSendConsistencyScope(value) {
  if (!isRecord(value)) {
    return null;
  }
  const fields = new Set([
    "kind",
    "mode",
    "accountId",
    "playerId",
    "recipientAccountId",
    "recipientUsername",
    "mailId",
    "operationId",
    "requestHash",
    "actionId",
  ]);
  const scope = {
    kind: value.kind,
    mode: value.mode,
    accountId: value.accountId,
    playerId: value.playerId,
    recipientAccountId: value.recipientAccountId,
    recipientUsername: value.recipientUsername,
    mailId: value.mailId,
    operationId: value.operationId,
    requestHash: value.requestHash,
    actionId: value.actionId,
  };
  if (
    Object.keys(value).length !== fields.size
    || Object.keys(value).some((field) => !fields.has(field))
    || scope.kind !== MAIL_SEND_SCOPE_KIND
    || ![MAIL_SEND_MODE_TEXT, MAIL_SEND_MODE_ORDINARY_ITEMS].includes(scope.mode)
    || canonicalIdentity(scope.accountId) !== scope.accountId
    || (scope.mode === MAIL_SEND_MODE_TEXT
      ? scope.playerId !== ""
      : canonicalIdentity(scope.playerId) !== scope.playerId)
    || canonicalIdentity(scope.recipientAccountId) !== scope.recipientAccountId
    || scope.recipientAccountId === scope.accountId
    || canonicalIdentity(scope.recipientUsername) !== scope.recipientUsername
    || canonicalIdentity(scope.mailId) !== scope.mailId
    || canonicalIdentity(scope.operationId) !== scope.operationId
    || canonicalIdentity(scope.requestHash) !== scope.requestHash
    || canonicalIdentity(scope.actionId) !== scope.actionId
  ) {
    return null;
  }
  return scope;
}

function mailSendReceiptResponseMatches(options = {}) {
  const receipt = objectOrEmpty(options.receipt);
  const response = objectOrEmpty(receipt.response);
  const mail = objectOrEmpty(options.mail);
  const sender = objectOrEmpty(options.sender);
  const mode = String(options.mode || "");
  const durableCommit = objectOrEmpty(response.durableCommit);
  const expectedResponseFields = mode === MAIL_SEND_MODE_ORDINARY_ITEMS
    ? new Set(["ok", "mail", "profileSummary", "profile", "message", "durableCommit"])
    : new Set(["ok", "mail", "message", "durableCommit"]);
  const expectedPublicMail = {
    mailId: mail.mailId,
    mailKind: "",
    senderUsername: mail.senderUsername,
    senderDisplayName: mail.senderDisplayName,
    recipientUsername: mail.recipientUsername,
    recipientDisplayName: mail.recipientDisplayName,
    title: mail.title,
    body: mail.body,
    items: mail.items,
    currency: {},
    createdAt: mail.createdAt,
    readAt: null,
    schemaVersion: 2,
    equipmentEnvelopes: [],
  };
  if (
    ![MAIL_SEND_MODE_TEXT, MAIL_SEND_MODE_ORDINARY_ITEMS].includes(mode)
    || !exactFields(response, expectedResponseFields)
    || response.ok !== true
    || response.message !== "邮件已发送。"
    || !isDeepStrictEqual(response.mail, expectedPublicMail)
    || !exactFields(durableCommit, new Set([
      "schemaVersion",
      "operationId",
      "actionId",
      "committedAt",
      "replayed",
    ]))
    || durableCommit.schemaVersion !== 1
    || canonicalIdentity(durableCommit.operationId) !== canonicalIdentity(receipt.operationId)
    || canonicalIdentity(durableCommit.actionId) !== canonicalIdentity(receipt.actionId)
    || canonicalIdentity(durableCommit.committedAt) !== canonicalIdentity(receipt.committedAt)
    || durableCommit.replayed !== false
  ) {
    return false;
  }
  if (mode === MAIL_SEND_MODE_TEXT) {
    return true;
  }
  const nextBinding = objectOrEmpty(options.nextBinding);
  const nextProfile = objectOrEmpty(options.nextProfile);
  const expectedProfileSummary = {
    accountId: sender.accountId,
    username: sender.username,
    displayName: sender.displayName,
    playerId: nextBinding.playerId,
    profileRevision: Number(nextBinding.profileRevision),
    storageMode: "server_document",
    serverAuthority: "profile_document",
    hasProfile: true,
    updatedAt: nextBinding.updatedAt,
    schemaVersion: 1,
  };
  return isRecord(nextProfile.profile)
    && isDeepStrictEqual(response.profileSummary, expectedProfileSummary)
    && isDeepStrictEqual(response.profile, nextProfile.profile);
}

function certifiedOrdinaryAttachmentProfileChange(options) {
  const before = options.before;
  const candidate = options.candidate;
  const accountId = options.accountId;
  const beforeBinding = objectOrEmpty(before.profileBindings && before.profileBindings[accountId]);
  const playerId = canonicalIdentity(beforeBinding.playerId);
  const nextBinding = objectOrEmpty(candidate.profileBindings && candidate.profileBindings[accountId]);
  const beforeProfile = objectOrEmpty(before.profiles && before.profiles[playerId]);
  const nextProfile = objectOrEmpty(candidate.profiles && candidate.profiles[playerId]);
  const expectedRevision = Number(beforeBinding.profileRevision);
  if (
    playerId === ""
    || !Number.isSafeInteger(expectedRevision)
    || expectedRevision < 0
    || Number(beforeProfile.profileRevision) !== expectedRevision
    || Number(nextBinding.profileRevision) !== expectedRevision + 1
    || Number(nextProfile.profileRevision) !== expectedRevision + 1
    || beforeBinding.accountId !== accountId
    || nextBinding.accountId !== accountId
    || beforeBinding.playerId !== playerId
    || nextBinding.playerId !== playerId
    || beforeProfile.accountId !== accountId
    || nextProfile.accountId !== accountId
    || beforeProfile.playerId !== playerId
    || nextProfile.playerId !== playerId
    || beforeBinding.createdAt !== nextBinding.createdAt
    || beforeProfile.createdAt !== nextProfile.createdAt
    || typeof nextBinding.updatedAt !== "string"
    || nextBinding.updatedAt === ""
    || nextProfile.updatedAt !== nextBinding.updatedAt
    || !isRecord(beforeProfile.profile)
    || !isRecord(nextProfile.profile)
    || typeof options.normalizeBackpackSlots !== "function"
    || typeof options.profileBackpackSlots !== "function"
    || typeof options.backpackItemCount !== "function"
    || typeof options.consumeBackpackItem !== "function"
    || typeof options.captureToolBagFromProfile !== "function"
  ) {
    return null;
  }
  const expectedProfile = structuredClone(beforeProfile.profile);
  let slots = options.normalizeBackpackSlots(options.profileBackpackSlots(expectedProfile));
  for (const item of options.items) {
    if (options.backpackItemCount(slots, item.itemId) < item.count) {
      return null;
    }
    slots = options.consumeBackpackItem(slots, item.itemId, item.count);
  }
  expectedProfile.backpackSlots = options.normalizeBackpackSlots(slots);
  expectedProfile.captureTools = options.captureToolBagFromProfile(expectedProfile);
  return isDeepStrictEqual(nextProfile.profile, expectedProfile)
    ? {playerId, nextBinding, nextProfile}
    : null;
}

function senderProfileUnchanged(before, candidate, accountId) {
  const beforeBinding = before.profileBindings && before.profileBindings[accountId];
  const nextBinding = candidate.profileBindings && candidate.profileBindings[accountId];
  if (!isDeepStrictEqual(beforeBinding, nextBinding)) {
    return false;
  }
  const playerId = canonicalIdentity(beforeBinding && beforeBinding.playerId);
  if (playerId === "") {
    return true;
  }
  return isDeepStrictEqual(
    before.profiles && before.profiles[playerId],
    candidate.profiles && candidate.profiles[playerId],
  );
}

function singleNewMailAddition(beforeValue, candidateValue) {
  const authorityDelta = mailAuthorityDeltaFrom(beforeValue, candidateValue);
  if (authorityDelta.ok) {
    if (authorityDelta.changes.length !== 1) {
      return null;
    }
    const change = authorityDelta.changes[0];
    const beforeMail = beforeValue && beforeValue[change.mailId];
    if (
      change.disposition !== "insert"
      || change.before !== null
      || !change.after
      || canonicalIdentity(change.after.mailId) !== change.mailId
      || (beforeMail && !isDeepStrictEqual(beforeMail, change.before))
    ) {
      return null;
    }
    return {mailId: change.mailId, mail: change.after};
  }
  const before = objectOrEmpty(beforeValue);
  const candidate = objectOrEmpty(candidateValue);
  const beforeIds = Object.keys(before);
  const candidateIds = Object.keys(candidate);
  const added = candidateIds.filter((mailId) => !Object.hasOwn(before, mailId));
  if (
    added.length !== 1
    || candidateIds.length !== beforeIds.length + 1
    || beforeIds.some((mailId) => (
      !Object.hasOwn(candidate, mailId)
      || !isDeepStrictEqual(candidate[mailId], before[mailId])
    ))
  ) {
    return null;
  }
  const mailId = canonicalIdentity(added[0]);
  const mail = objectOrEmpty(candidate[mailId]);
  return mailId !== "" && canonicalIdentity(mail.mailId) === mailId
    ? {mailId, mail}
    : null;
}

function accountById(accountsValue, accountId) {
  const matches = Object.entries(objectOrEmpty(accountsValue)).filter(([username, account]) => (
    isRecord(account)
    && canonicalIdentity(account.accountId) === accountId
    && canonicalIdentity(account.username) === username
  ));
  return matches.length === 1 ? matches[0][1] : null;
}

function exactFields(value, fields) {
  return isRecord(value)
    && Object.keys(value).length === fields.size
    && Object.keys(value).every((field) => fields.has(field));
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
  __certifiedOrdinaryAttachmentProfileChangeForTest: certifiedOrdinaryAttachmentProfileChange,
  __singleNewMailAdditionForTest: singleNewMailAddition,
  MAIL_SEND_MODE_ORDINARY_ITEMS,
  MAIL_SEND_MODE_TEXT,
  MAIL_SEND_SCOPE_KIND,
  buildMailSendSharedAssetReadRequest,
  buildRowLocalMailSendConsistencyScope,
  canonicalMailSendConsistencyScope,
  mailSendReceiptResponseMatches,
  rowLocalMailSendRecoveryMatches,
};
