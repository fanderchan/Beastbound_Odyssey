"use strict";

const {isDeepStrictEqual} = require("node:util");
const {cloneAuthorityRoot} = require("./authority-root-clone");
const {
  collectMaterializedEquipmentEnvelopeTraces,
  ensureConsumedEquipmentEnvelopeIds,
  validEnvelopeId,
} = require("./equipment-envelope-consumed-ledger");
const {mailEquipmentEnvelopeMap} = require("./mail-claim-consistency");

const SHARED_ASSET_READ_VIEW_SCHEMA_VERSION = 1;

function applySharedAssetReadView(rootValue, viewValue) {
  const root = objectOrEmpty(rootValue);
  const view = certifiedSharedAssetReadView(viewValue);
  const next = cloneAuthorityRoot(root);

  applyAccountReplacement(next, view.accounts);
  applyEntityReplacement(next, "profileBindings", view.profileBindings);
  applyEntityReplacement(next, "profiles", view.profiles);

  if (view.marketListings !== null) {
    next.marketListings = {...view.marketListings};
  }
  if (view.marketConfig !== null) {
    next.marketConfig = structuredClone(view.marketConfig);
  }
  for (const partition of view.mailPartitions) {
    const messages = objectOrEmpty(next.mailMessages);
    const retained = {};
    for (const [mailId, mail] of Object.entries(messages)) {
      if (String(mail && mail.recipientAccountId || "") !== partition.recipientAccountId) {
        retained[mailId] = mail;
      }
    }
    next.mailMessages = {...retained, ...partition.messages};
  }
  if (view.consumedEquipmentEnvelopeIds.length > 0) {
    const ensured = ensureConsumedEquipmentEnvelopeIds(
      next.consumedEquipmentEnvelopes,
      view.consumedEquipmentEnvelopeIds,
    );
    if (!ensured.ok) {
      throw sharedAssetReadViewError("consumedEquipmentEnvelopeIds");
    }
    next.consumedEquipmentEnvelopes = ensured.ledger;
  }
  return next;
}

function certifiedSharedAssetReadView(value) {
  if (!isRecord(value) || Number(value.schemaVersion) !== SHARED_ASSET_READ_VIEW_SCHEMA_VERSION) {
    throw sharedAssetReadViewError("schema");
  }
  const scope = String(value.scope || "");
  const accountId = String(value.accountId || "");
  if (![
    "market_read",
    "market_mutation",
    "mail_read",
    "mail_mutation",
    "mail_send",
  ].includes(scope) || accountId === "") {
    throw sharedAssetReadViewError("scope");
  }
  const mailSend = scope === "mail_send";
  const recipientUsername = mailSend ? String(value.recipientUsername || "") : "";
  const knownRecipientAccountId = mailSend
    ? String(value.knownRecipientAccountId || "")
    : "";
  const recipientAccountId = mailSend ? String(value.recipientAccountId || "") : "";
  const includeActorProfile = mailSend && value.includeActorProfile === true;
  if (mailSend && (
    !canonicalOptionalIdentity(recipientUsername, false)
    || !canonicalOptionalIdentity(knownRecipientAccountId, true)
    || !canonicalOptionalIdentity(recipientAccountId, true)
    || typeof value.includeActorProfile !== "boolean"
  )) {
    throw sharedAssetReadViewError("mail_send_identity");
  }
  const marketListings = value.marketListings === null || value.marketListings === undefined
    ? null
    : certifiedEntityMap(value.marketListings, "listingId", "marketListings");
  if ((scope.startsWith("market_")) !== (marketListings !== null)) {
    throw sharedAssetReadViewError("market_scope");
  }
  const marketConfig = value.marketConfig === null || value.marketConfig === undefined
    ? null
    : certifiedDocument(value.marketConfig, "marketConfig");
  if ((scope.startsWith("market_")) !== (marketConfig !== null)) {
    throw sharedAssetReadViewError("market_config_scope");
  }

  const mailPartitions = Array.isArray(value.mailPartitions)
    ? value.mailPartitions.map(certifiedMailPartition)
    : [];
  const partitionIds = mailPartitions.map((partition) => partition.recipientAccountId);
  if (
    !canonicalUniqueStrings(partitionIds)
    || (["mail_read", "mail_mutation"].includes(scope) && (
      partitionIds.length !== 1
      || partitionIds[0] !== accountId
    ))
    || ((scope.startsWith("market_") || mailSend) && partitionIds.length !== 0)
  ) {
    throw sharedAssetReadViewError("mail_partitions");
  }

  if (!Array.isArray(value.consumedEquipmentEnvelopeIds)) {
    throw sharedAssetReadViewError("consumedEquipmentEnvelopeIds");
  }
  const consumedEquipmentEnvelopeIds = value.consumedEquipmentEnvelopeIds
    .map((entry) => String(entry || ""));
  if (
    !canonicalUniqueStrings(consumedEquipmentEnvelopeIds)
    || consumedEquipmentEnvelopeIds.some((envelopeId) => !validEnvelopeId(envelopeId))
  ) {
    throw sharedAssetReadViewError("consumedEquipmentEnvelopeIds");
  }

  const accounts = certifiedEntityReplacement(value.accounts, "accountId", "accounts");
  const profileBindings = certifiedEntityReplacement(
    value.profileBindings,
    "accountId",
    "profileBindings",
  );
  const profiles = certifiedEntityReplacement(value.profiles, "playerId", "profiles");
  if (mailSend) {
    assertCertifiedMailSendAuthority({
      accountId,
      recipientUsername,
      knownRecipientAccountId,
      recipientAccountId,
      includeActorProfile,
      accounts,
      profileBindings,
      profiles,
    });
  }
  const referencedEnvelopeIds = new Set(sharedAssetReadReferencedEnvelopeIds({
    marketListings,
    mailPartitions,
    profiles: profiles.values,
  }));
  if (consumedEquipmentEnvelopeIds.some((envelopeId) => !referencedEnvelopeIds.has(envelopeId))) {
    throw sharedAssetReadViewError("consumedEquipmentEnvelopeIds.unreferenced");
  }

  return {
    schemaVersion: SHARED_ASSET_READ_VIEW_SCHEMA_VERSION,
    scope,
    accountId,
    recipientUsername,
    knownRecipientAccountId,
    recipientAccountId,
    includeActorProfile,
    accounts,
    profileBindings,
    profiles,
    marketListings,
    marketConfig,
    mailPartitions,
    consumedEquipmentEnvelopeIds,
  };
}

function assertSharedAssetReadViewMatchesRequest(viewValue, requestValue) {
  const view = certifiedSharedAssetReadView(viewValue);
  const request = objectOrEmpty(requestValue);
  if (
    String(request.scope || "") !== view.scope
    || String(request.accountId || "") !== view.accountId
    || (view.scope === "mail_send" && (
      String(request.recipientUsername || "") !== view.recipientUsername
      || String(request.knownRecipientAccountId || "") !== view.knownRecipientAccountId
      || Boolean(request.includeActorProfile) !== view.includeActorProfile
    ))
  ) {
    throw sharedAssetReadViewError("request_identity");
  }
  return true;
}

function assertCertifiedMailSendAuthority(value) {
  const expectedAccountKeys = Array.from(new Set([
    value.accountId,
    value.knownRecipientAccountId,
    value.recipientAccountId,
  ].filter(Boolean))).sort(compareCanonicalIds);
  if (!isDeepStrictEqual(value.accounts.keys, expectedAccountKeys)) {
    throw sharedAssetReadViewError("mail_send_accounts.keys");
  }
  const actor = value.accounts.values[value.accountId];
  const recipient = value.recipientAccountId === ""
    ? null
    : value.accounts.values[value.recipientAccountId];
  if (
    !actor
    || String(actor.accountId || "") !== value.accountId
    || (value.recipientAccountId !== "" && (
      !recipient
      || String(recipient.accountId || "") !== value.recipientAccountId
      || String(recipient.username || "") !== value.recipientUsername
    ))
    || Object.values(value.accounts.values).some((account) => (
      String(account && account.username || "") === value.recipientUsername
      && String(account && account.accountId || "") !== value.recipientAccountId
    ))
  ) {
    throw sharedAssetReadViewError("mail_send_accounts.values");
  }
  if (!value.includeActorProfile) {
    if (
      value.profileBindings.keys.length !== 0
      || Object.keys(value.profileBindings.values).length !== 0
      || value.profiles.keys.length !== 0
      || Object.keys(value.profiles.values).length !== 0
    ) {
      throw sharedAssetReadViewError("mail_send_profile_unexpected");
    }
    return;
  }
  const binding = value.profileBindings.values[value.accountId];
  const playerId = String(binding && binding.playerId || "");
  const profile = value.profiles.values[playerId];
  if (
    !isDeepStrictEqual(value.profileBindings.keys, [value.accountId])
    || !binding
    || playerId === ""
    || !isDeepStrictEqual(value.profiles.keys, [playerId])
    || !profile
    || String(profile.accountId || "") !== value.accountId
  ) {
    throw sharedAssetReadViewError("mail_send_profile_missing");
  }
}

function canonicalOptionalIdentity(value, allowEmpty) {
  return typeof value === "string"
    && (allowEmpty || value !== "")
    && value === value.trim();
}

function certifiedEntityReplacement(value, identityField, fieldName) {
  if (!isRecord(value) || !Array.isArray(value.keys) || !isRecord(value.values)) {
    throw sharedAssetReadViewError(fieldName);
  }
  const keys = value.keys.map((entry) => String(entry || ""));
  if (!canonicalUniqueStrings(keys)) {
    throw sharedAssetReadViewError(`${fieldName}.keys`);
  }
  const values = certifiedEntityMap(value.values, identityField, `${fieldName}.values`);
  if (Object.keys(values).some((key) => !keys.includes(key))) {
    throw sharedAssetReadViewError(`${fieldName}.extra`);
  }
  return {keys, values};
}

function certifiedMailPartition(value) {
  if (!isRecord(value)) {
    throw sharedAssetReadViewError("mail_partition");
  }
  const recipientAccountId = String(value.recipientAccountId || "");
  const messages = certifiedEntityMap(value.messages, "mailId", "mail_partition.messages");
  if (recipientAccountId === "" || Object.values(messages).some((mail) => (
    String(mail.recipientAccountId || "") !== recipientAccountId
  ))) {
    throw sharedAssetReadViewError("mail_partition.recipient");
  }
  return {recipientAccountId, messages};
}

function certifiedEntityMap(value, identityField, fieldName) {
  if (!isRecord(value)) {
    throw sharedAssetReadViewError(fieldName);
  }
  const result = {};
  const keys = Object.keys(value);
  if (!isDeepStrictEqual(keys, [...keys].sort(compareCanonicalIds))) {
    throw sharedAssetReadViewError(`${fieldName}.order`);
  }
  for (const key of keys) {
    const document = certifiedDocument(value[key], `${fieldName}.${key}`);
    if (String(document[identityField] || "") !== key) {
      throw sharedAssetReadViewError(`${fieldName}.${key}.identity`);
    }
    result[key] = document;
  }
  return result;
}

function certifiedDocument(value, fieldName) {
  if (!isRecord(value)) {
    throw sharedAssetReadViewError(fieldName);
  }
  try {
    // The store baseline and service root both apply the same MySQL view.
    // Each application must own its documents or a mutable mail/listing could
    // silently alter the other cache's diff baseline before COMMIT.
    return structuredClone(value);
  } catch {
    throw sharedAssetReadViewError(`${fieldName}.clone`);
  }
}

function sharedAssetReadReferencedEnvelopeIds(value = {}) {
  const ids = new Set();
  const marketListings = objectOrEmpty(value.marketListings);
  const mailMessages = {};
  const addEnvelopeId = (rawValue, reason) => {
    const envelopeId = String(rawValue || "");
    if (!validEnvelopeId(envelopeId)) {
      throw sharedAssetReadViewError(reason);
    }
    ids.add(envelopeId);
  };

  for (const listing of Object.values(marketListings)) {
    if (listing && Object.hasOwn(listing, "equipmentEnvelope")) {
      addEnvelopeId(
        listing.equipmentEnvelope && listing.equipmentEnvelope.envelopeId,
        "marketListings.equipmentEnvelope",
      );
    }
  }
  for (const partition of Array.isArray(value.mailPartitions) ? value.mailPartitions : []) {
    for (const [mailId, mail] of Object.entries(objectOrEmpty(partition && partition.messages))) {
      mailMessages[mailId] = mail;
      const envelopes = mailEquipmentEnvelopeMap(mail);
      if (envelopes === null) {
        throw sharedAssetReadViewError("mailPartitions.equipmentEnvelopes");
      }
      for (const envelopeId of envelopes.keys()) {
        ids.add(envelopeId);
      }
    }
  }

  const profiles = objectOrEmpty(value.profiles);
  for (const document of Object.values(profiles)) {
    const profile = objectOrEmpty(document && document.profile);
    const bank = objectOrEmpty(profile.bank);
    for (const slot of Array.isArray(bank.slots) ? bank.slots : []) {
      for (const envelope of Array.isArray(slot && slot.equipmentEnvelopes)
        ? slot.equipmentEnvelopes
        : []) {
        addEnvelopeId(
          envelope && envelope.envelopeId,
          "profiles.bank.equipmentEnvelopes",
        );
      }
    }
  }
  const traces = collectMaterializedEquipmentEnvelopeTraces({
    profiles,
    mailMessages,
    marketListings,
  });
  for (const trace of traces) {
    if (trace.invalidReason) {
      throw sharedAssetReadViewError("profiles.transferProvenance");
    }
    addEnvelopeId(trace.originEnvelopeId, "profiles.transferProvenance.originEnvelopeId");
  }
  return Array.from(ids).sort(compareCanonicalIds);
}

function applyEntityReplacement(root, fieldName, replacement) {
  const values = {...objectOrEmpty(root[fieldName])};
  for (const key of replacement.keys) {
    if (Object.hasOwn(replacement.values, key)) {
      values[key] = replacement.values[key];
    } else {
      delete values[key];
    }
  }
  root[fieldName] = values;
}

function applyAccountReplacement(root, replacement) {
  const values = {...objectOrEmpty(root.accounts)};
  const replacedAccountIds = new Set(replacement.keys);
  for (const [username, account] of Object.entries(values)) {
    if (replacedAccountIds.has(String(account && account.accountId || ""))) {
      delete values[username];
    }
  }
  for (const accountId of replacement.keys) {
    if (!Object.hasOwn(replacement.values, accountId)) {
      continue;
    }
    const account = replacement.values[accountId];
    const username = String(account.username || "");
    const existing = values[username];
    if (
      username === ""
      || username !== username.trim()
      || (existing && String(existing.accountId || "") !== accountId)
    ) {
      throw sharedAssetReadViewError("accounts.username");
    }
    values[username] = account;
  }
  root.accounts = values;
}

function canonicalUniqueStrings(values) {
  if (!Array.isArray(values) || values.some((value) => value === "" || value !== value.trim())) {
    return false;
  }
  const sorted = [...values].sort(compareCanonicalIds);
  return new Set(values).size === values.length && isDeepStrictEqual(values, sorted);
}

function compareCanonicalIds(leftValue, rightValue) {
  const left = String(leftValue || "");
  const right = String(rightValue || "");
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function objectOrEmpty(value) {
  return isRecord(value) ? value : {};
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sharedAssetReadViewError(reason) {
  const error = new Error("共享资产读取结果不符合认证合同。");
  error.code = "shared_asset_read_view_invalid";
  error.reason = String(reason || "invalid");
  return error;
}

module.exports = {
  SHARED_ASSET_READ_VIEW_SCHEMA_VERSION,
  applySharedAssetReadView,
  assertSharedAssetReadViewMatchesRequest,
  compareCanonicalIds,
  sharedAssetReadReferencedEnvelopeIds,
};
