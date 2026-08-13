"use strict";

const crypto = require("node:crypto");
const {isDeepStrictEqual} = require("node:util");

const REWARD_VAULT_SCHEMA_VERSION = 1;
const REWARD_VAULT_DATA_GENERATION = 1;
const REWARD_VAULT_STATUS_AVAILABLE = "available";
const REWARD_VAULT_STATUS_MAIL_DELIVERED = "mail_delivered";
const REWARD_VAULT_STATUS_CLAIMED = "claimed";
const REWARD_VAULT_STATUSES = Object.freeze([
  REWARD_VAULT_STATUS_AVAILABLE,
  REWARD_VAULT_STATUS_MAIL_DELIVERED,
  REWARD_VAULT_STATUS_CLAIMED,
]);
const REWARD_VAULT_SOURCE_KINDS = Object.freeze([
  "battle_overflow",
  "market_sale",
  "qualification_reward",
  "tutorial_market_sale",
]);
const MAX_REWARD_ID_LENGTH = 160;
const MAX_REWARD_SOURCE_KEY_LENGTH = 191;
const MAX_REWARD_SOURCE_KIND_LENGTH = 64;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_SOURCE_PATTERN = /^[A-Za-z0-9._:-]+$/;
const DOCUMENT_FIELDS = Object.freeze([
  "schemaVersion",
  "rewardId",
  "sourceKind",
  "sourceKey",
  "recipientAccountId",
  "recipientUsername",
  "recipientDisplayName",
  "title",
  "body",
  "items",
  "currency",
  "createdAt",
]);
const ROW_FIELDS = Object.freeze([
  "rewardId",
  "sourceKey",
  "sourceKind",
  "sourceDigest",
  "recipientAccountId",
  "status",
  "createdAt",
  "updatedAt",
  "deliveredAt",
  "claimedAt",
  "deliveredMailId",
  "dataGeneration",
  "revision",
  "document",
]);

function createRewardVaultEntry(value, options = {}) {
  const input = canonicalRewardInput(value);
  const rewardId = rewardVaultIdForSource(
    input.recipientAccountId,
    input.sourceKind,
    input.sourceKey,
  );
  const assets = certifyRewardAssets({
    ...input,
    rewardId,
  }, options.certifyAttachment);
  const document = deepFreeze({
    schemaVersion: REWARD_VAULT_SCHEMA_VERSION,
    rewardId,
    sourceKind: input.sourceKind,
    sourceKey: input.sourceKey,
    recipientAccountId: input.recipientAccountId,
    recipientUsername: input.recipientUsername,
    recipientDisplayName: input.recipientDisplayName,
    title: input.title,
    body: input.body,
    items: assets.items,
    currency: assets.currency,
    createdAt: input.createdAt,
  });
  const sourceDigest = rewardVaultDocumentDigest(document);
  return deepFreeze({
    rewardId,
    sourceKey: input.sourceKey,
    sourceKind: input.sourceKind,
    sourceDigest,
    recipientAccountId: input.recipientAccountId,
    status: REWARD_VAULT_STATUS_AVAILABLE,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    deliveredAt: null,
    claimedAt: null,
    deliveredMailId: null,
    dataGeneration: REWARD_VAULT_DATA_GENERATION,
    revision: 0,
    document,
  });
}

function canonicalRewardVaultEntry(value, expectedRewardId = "", options = {}) {
  if (!isRecord(value) || !hasExactFields(value, ROW_FIELDS)) {
    throw rewardVaultIntegrityError("row_shape");
  }
  const rewardId = canonicalIdentity(value.rewardId, MAX_REWARD_ID_LENGTH);
  const sourceKind = canonicalSourceKind(value.sourceKind);
  const sourceKey = canonicalSourceKey(value.sourceKey);
  const recipientAccountId = canonicalIdentity(value.recipientAccountId, 80);
  const sourceDigest = canonicalDigest(value.sourceDigest);
  const status = REWARD_VAULT_STATUSES.includes(value.status) ? value.status : "";
  const createdAt = canonicalIsoTimestamp(value.createdAt);
  const updatedAt = canonicalIsoTimestamp(value.updatedAt);
  const deliveredAt = nullableIsoTimestamp(value.deliveredAt);
  const claimedAt = nullableIsoTimestamp(value.claimedAt);
  const deliveredMailId = nullableIdentity(value.deliveredMailId, 96);
  if (
    rewardId === ""
    || (expectedRewardId !== "" && rewardId !== expectedRewardId)
    || sourceKind === ""
    || sourceKey === ""
    || recipientAccountId === ""
    || sourceDigest === ""
    || status === ""
    || createdAt === ""
    || updatedAt === ""
    || deliveredAt.invalid
    || claimedAt.invalid
    || deliveredMailId.invalid
    || value.dataGeneration !== REWARD_VAULT_DATA_GENERATION
    || !Number.isSafeInteger(value.revision)
    || value.revision < 0
  ) {
    throw rewardVaultIntegrityError("row_fields");
  }
  const expectedId = rewardVaultIdForSource(recipientAccountId, sourceKind, sourceKey);
  if (rewardId !== expectedId) {
    throw rewardVaultIntegrityError("reward_id");
  }
  const document = canonicalRewardVaultDocument(value.document, rewardId, options);
  if (
    document.sourceKind !== sourceKind
    || document.sourceKey !== sourceKey
    || document.recipientAccountId !== recipientAccountId
    || document.createdAt !== createdAt
    || rewardVaultDocumentDigest(document) !== sourceDigest
    || Date.parse(updatedAt) < Date.parse(createdAt)
  ) {
    throw rewardVaultIntegrityError("document_binding");
  }
  assertLifecycle({
    status,
    createdAt,
    updatedAt,
    deliveredAt: deliveredAt.value,
    claimedAt: claimedAt.value,
    deliveredMailId: deliveredMailId.value,
    revision: value.revision,
  });
  return deepFreeze({
    rewardId,
    sourceKey,
    sourceKind,
    sourceDigest,
    recipientAccountId,
    status,
    createdAt,
    updatedAt,
    deliveredAt: deliveredAt.value,
    claimedAt: claimedAt.value,
    deliveredMailId: deliveredMailId.value,
    dataGeneration: REWARD_VAULT_DATA_GENERATION,
    revision: value.revision,
    document,
  });
}

function canonicalRewardVaultDocument(value, expectedRewardId = "", options = {}) {
  if (!isRecord(value) || !hasExactFields(value, DOCUMENT_FIELDS)) {
    throw rewardVaultIntegrityError("document_shape");
  }
  const document = structuredClone(value);
  const rewardId = canonicalIdentity(document.rewardId, MAX_REWARD_ID_LENGTH);
  const sourceKind = canonicalSourceKind(document.sourceKind);
  const sourceKey = canonicalSourceKey(document.sourceKey);
  const recipientAccountId = canonicalIdentity(document.recipientAccountId, 80);
  const recipientUsername = canonicalText(document.recipientUsername, 80, {allowEmpty: true});
  const recipientDisplayName = canonicalText(document.recipientDisplayName, 120, {allowEmpty: true});
  const title = canonicalText(document.title, 200);
  const body = canonicalText(document.body, 4000, {allowEmpty: true});
  const createdAt = canonicalIsoTimestamp(document.createdAt);
  if (
    document.schemaVersion !== REWARD_VAULT_SCHEMA_VERSION
    || rewardId === ""
    || (expectedRewardId !== "" && rewardId !== expectedRewardId)
    || sourceKind === ""
    || sourceKey === ""
    || recipientAccountId === ""
    || recipientUsername === null
    || recipientDisplayName === null
    || title === null
    || body === null
    || createdAt === ""
  ) {
    throw rewardVaultIntegrityError("document_fields");
  }
  const assets = certifyRewardAssets(document, options.certifyAttachment);
  if (
    !isDeepStrictEqual(document.items, assets.items)
    || !isDeepStrictEqual(document.currency, assets.currency)
  ) {
    throw rewardVaultIntegrityError("document_assets_noncanonical");
  }
  return deepFreeze({
    schemaVersion: REWARD_VAULT_SCHEMA_VERSION,
    rewardId,
    sourceKind,
    sourceKey,
    recipientAccountId,
    recipientUsername,
    recipientDisplayName,
    title,
    body,
    items: assets.items,
    currency: assets.currency,
    createdAt,
  });
}

function projectRewardVaultEntry(value, options = {}) {
  const entry = canonicalRewardVaultEntry(value, value && value.rewardId || "", options);
  return deepFreeze({
    rewardId: entry.rewardId,
    sourceKind: entry.sourceKind,
    status: entry.status,
    title: entry.document.title,
    body: entry.document.body,
    items: entry.document.items,
    currency: entry.document.currency,
    createdAt: entry.createdAt,
    deliveredAt: entry.deliveredAt,
    claimedAt: entry.claimedAt,
    claimable: entry.status !== REWARD_VAULT_STATUS_CLAIMED,
    schemaVersion: REWARD_VAULT_SCHEMA_VERSION,
  });
}

function claimRewardVaultEntry(value, claimedAtValue, options = {}) {
  const entry = canonicalRewardVaultEntry(
    value,
    value && value.rewardId || "",
    options,
  );
  const claimedAt = canonicalIsoTimestamp(claimedAtValue);
  if (
    claimedAt === ""
    || entry.status === REWARD_VAULT_STATUS_CLAIMED
    || Date.parse(claimedAt) < Date.parse(entry.createdAt)
    || Date.parse(claimedAt) < Date.parse(entry.updatedAt)
    || entry.revision >= Number.MAX_SAFE_INTEGER
  ) {
    throw rewardVaultInputError("claim_transition");
  }
  return canonicalRewardVaultEntry({
    ...entry,
    status: REWARD_VAULT_STATUS_CLAIMED,
    updatedAt: claimedAt,
    claimedAt,
    revision: entry.revision + 1,
  }, entry.rewardId, options);
}

function deliverRewardVaultEntry(value, mailIdValue, deliveredAtValue, options = {}) {
  const entry = canonicalRewardVaultEntry(
    value,
    value && value.rewardId || "",
    options,
  );
  const deliveredMailId = canonicalIdentity(mailIdValue, 96);
  const deliveredAt = canonicalIsoTimestamp(deliveredAtValue);
  if (
    entry.status !== REWARD_VAULT_STATUS_AVAILABLE
    || deliveredMailId === ""
    || deliveredAt === ""
    || Date.parse(deliveredAt) < Date.parse(entry.createdAt)
    || Date.parse(deliveredAt) < Date.parse(entry.updatedAt)
    || entry.revision >= Number.MAX_SAFE_INTEGER
  ) {
    throw rewardVaultInputError("delivery_transition");
  }
  return canonicalRewardVaultEntry({
    ...entry,
    status: REWARD_VAULT_STATUS_MAIL_DELIVERED,
    updatedAt: deliveredAt,
    deliveredAt,
    deliveredMailId,
    revision: entry.revision + 1,
  }, entry.rewardId, options);
}

function rewardVaultIdForSource(recipientAccountIdValue, sourceKindValue, sourceKeyValue) {
  const recipientAccountId = canonicalIdentity(recipientAccountIdValue, 80);
  const sourceKind = canonicalSourceKind(sourceKindValue);
  const sourceKey = canonicalSourceKey(sourceKeyValue);
  if (recipientAccountId === "" || sourceKind === "" || sourceKey === "") {
    throw rewardVaultInputError("source_identity");
  }
  const digest = crypto.createHash("sha256")
    .update(`${recipientAccountId}\u0000${sourceKind}\u0000${sourceKey}`, "utf8")
    .digest("hex");
  return `reward_${digest}`;
}

function rewardVaultDocumentDigest(document) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(document), "utf8")
    .digest("hex");
}

function canonicalRewardInput(value) {
  const fields = [
    "sourceKind",
    "sourceKey",
    "recipientAccountId",
    "recipientUsername",
    "recipientDisplayName",
    "title",
    "body",
    "items",
    "currency",
    "createdAt",
  ];
  if (!isRecord(value) || !hasExactFields(value, fields)) {
    throw rewardVaultInputError("shape");
  }
  const sourceKind = canonicalSourceKind(value.sourceKind);
  const sourceKey = canonicalSourceKey(value.sourceKey);
  const recipientAccountId = canonicalIdentity(value.recipientAccountId, 80);
  const recipientUsername = canonicalText(value.recipientUsername, 80, {allowEmpty: true});
  const recipientDisplayName = canonicalText(value.recipientDisplayName, 120, {allowEmpty: true});
  const title = canonicalText(value.title, 200);
  const body = canonicalText(value.body, 4000, {allowEmpty: true});
  const createdAt = canonicalIsoTimestamp(value.createdAt);
  if (
    sourceKind === ""
    || sourceKey === ""
    || recipientAccountId === ""
    || recipientUsername === null
    || recipientDisplayName === null
    || title === null
    || body === null
    || createdAt === ""
  ) {
    throw rewardVaultInputError("fields");
  }
  return {
    sourceKind,
    sourceKey,
    recipientAccountId,
    recipientUsername,
    recipientDisplayName,
    title,
    body,
    items: structuredClone(value.items),
    currency: structuredClone(value.currency),
    createdAt,
  };
}

function certifyRewardAssets(document, certifyAttachment) {
  if (typeof certifyAttachment !== "function") {
    throw rewardVaultInputError("certifier_missing");
  }
  let certified;
  try {
    certified = certifyAttachment({
      mailId: `mail_${document.rewardId}`.slice(0, 96),
      mailKind: "system_reward",
      senderAccountId: "system",
      senderUsername: "system",
      senderDisplayName: "系统",
      recipientAccountId: document.recipientAccountId,
      recipientUsername: document.recipientUsername,
      recipientDisplayName: document.recipientDisplayName,
      title: document.title,
      body: document.body,
      items: structuredClone(document.items),
      equipmentEnvelopes: [],
      currency: structuredClone(document.currency),
      createdAt: document.createdAt,
      readAt: null,
      schemaVersion: 2,
    });
  } catch (cause) {
    const error = rewardVaultInputError("asset_certifier_failed");
    error.cause = cause;
    throw error;
  }
  if (
    !certified
    || certified.ok !== true
    || !Array.isArray(certified.items)
    || !Array.isArray(certified.equipmentEnvelopes)
    || !isRecord(certified.currency)
    || certified.equipmentEnvelopes.length !== 0
    || (Array.isArray(certified.equipmentItems) && certified.equipmentItems.length !== 0)
  ) {
    throw rewardVaultInputError("asset_not_supported");
  }
  const items = structuredClone(
    Array.isArray(certified.ordinaryItems) ? certified.ordinaryItems : certified.items,
  );
  const currency = structuredClone(certified.currency);
  const hasCurrency = Object.values(currency).some((amount) => (
    Number.isSafeInteger(amount) && amount > 0
  ));
  if (items.length === 0 && !hasCurrency) {
    throw rewardVaultInputError("asset_empty");
  }
  return deepFreeze({items, currency});
}

function assertLifecycle(value) {
  const delivered = value.deliveredAt !== null || value.deliveredMailId !== null;
  if ((value.deliveredAt === null) !== (value.deliveredMailId === null)) {
    throw rewardVaultIntegrityError("delivery_pair");
  }
  if (
    (value.deliveredAt !== null && Date.parse(value.deliveredAt) < Date.parse(value.createdAt))
    || (value.claimedAt !== null && Date.parse(value.claimedAt) < Date.parse(value.createdAt))
    || (value.deliveredAt !== null && Date.parse(value.updatedAt) < Date.parse(value.deliveredAt))
    || (value.claimedAt !== null && Date.parse(value.updatedAt) < Date.parse(value.claimedAt))
  ) {
    throw rewardVaultIntegrityError("lifecycle_time");
  }
  if (
    (value.status === REWARD_VAULT_STATUS_AVAILABLE
      && (delivered || value.claimedAt !== null || value.revision !== 0))
    || (value.status === REWARD_VAULT_STATUS_MAIL_DELIVERED
      && (!delivered || value.claimedAt !== null || value.revision < 1))
    || (value.status === REWARD_VAULT_STATUS_CLAIMED
      && (value.claimedAt === null || value.revision < 1))
  ) {
    throw rewardVaultIntegrityError("lifecycle_status");
  }
}

function canonicalSourceKind(value) {
  return typeof value === "string"
    && value.length <= MAX_REWARD_SOURCE_KIND_LENGTH
    && REWARD_VAULT_SOURCE_KINDS.includes(value)
    ? value
    : "";
}

function canonicalSourceKey(value) {
  return typeof value === "string"
    && value !== ""
    && value === value.trim()
    && value.length <= MAX_REWARD_SOURCE_KEY_LENGTH
    && SAFE_SOURCE_PATTERN.test(value)
    ? value
    : "";
}

function canonicalIdentity(value, maxLength) {
  return typeof value === "string"
    && value !== ""
    && value === value.trim()
    && value.length <= maxLength
    && !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : "";
}

function nullableIdentity(value, maxLength) {
  if (value === null) return {invalid: false, value: null};
  const canonical = canonicalIdentity(value, maxLength);
  return {invalid: canonical === "", value: canonical || null};
}

function canonicalText(value, maxLength, options = {}) {
  if (
    typeof value !== "string"
    || value !== value.trim()
    || value.length > maxLength
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
    || (value === "" && options.allowEmpty !== true)
  ) {
    return null;
  }
  return value;
}

function canonicalDigest(value) {
  return typeof value === "string" && SHA256_PATTERN.test(value) ? value : "";
}

function canonicalIsoTimestamp(value) {
  if (typeof value !== "string" || value === "" || value !== value.trim()) return "";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  try {
    return new Date(time).toISOString() === value ? value : "";
  } catch {
    return "";
  }
}

function nullableIsoTimestamp(value) {
  if (value === null) return {invalid: false, value: null};
  const canonical = canonicalIsoTimestamp(value);
  return {invalid: canonical === "", value: canonical || null};
}

function hasExactFields(value, fields) {
  return Object.keys(value).length === fields.length
    && Object.keys(value).every((field) => fields.includes(field));
}

function isRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function rewardVaultInputError(reason) {
  const error = new Error("系统奖励内容不完整或当前版本暂不支持，本次发放已安全取消。");
  error.code = "reward_vault_input_invalid";
  error.reason = String(reason || "invalid");
  return error;
}

function rewardVaultIntegrityError(reason) {
  const error = new Error("奖励仓记录身份、资产或生命周期不一致，相关操作已暂停，请联系GM处理。");
  error.code = "reward_vault_integrity_invalid";
  error.reason = String(reason || "invalid");
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

module.exports = {
  MAX_REWARD_ID_LENGTH,
  MAX_REWARD_SOURCE_KEY_LENGTH,
  REWARD_VAULT_DATA_GENERATION,
  REWARD_VAULT_SCHEMA_VERSION,
  REWARD_VAULT_SOURCE_KINDS,
  REWARD_VAULT_STATUS_AVAILABLE,
  REWARD_VAULT_STATUS_CLAIMED,
  REWARD_VAULT_STATUS_MAIL_DELIVERED,
  REWARD_VAULT_STATUSES,
  canonicalRewardVaultDocument,
  canonicalRewardVaultEntry,
  claimRewardVaultEntry,
  createRewardVaultEntry,
  deliverRewardVaultEntry,
  projectRewardVaultEntry,
  rewardVaultDocumentDigest,
  rewardVaultIdForSource,
};
