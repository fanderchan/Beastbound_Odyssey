"use strict";

const {
  MAX_REWARD_ID_LENGTH,
  canonicalRewardVaultEntry,
} = require("./reward-vault-state");

const REWARD_VAULT_DEFAULT_LIMIT = 30;
const REWARD_VAULT_MAX_LIMIT = 50;
const REWARD_VAULT_CURSOR_KIND = "reward_vault";
const REWARD_VAULT_CURSOR_VERSION = 1;
const REWARD_VAULT_CURSOR_MAX_LENGTH = 512;

function normalizeRewardVaultPageOptions(options = {}, config = {}) {
  if (!isRecord(options)) throw paginationError("options");
  const fields = new Set(["limit", "cursor"]);
  if (Object.keys(options).some((field) => !fields.has(field))) {
    throw paginationError("options_fields");
  }
  const hasLimit = Object.hasOwn(options, "limit");
  if (config.requireExplicitLimit === true && !hasLimit) {
    throw paginationError("limit_required");
  }
  const limit = hasLimit ? canonicalPageLimit(options.limit) : REWARD_VAULT_DEFAULT_LIMIT;
  if (limit === null) throw paginationError("limit");
  let cursor = null;
  if (Object.hasOwn(options, "cursor")) {
    if (options.cursor === null) {
      cursor = null;
    } else if (typeof options.cursor === "string") {
      cursor = decodeRewardVaultCursor(options.cursor);
    } else {
      cursor = canonicalCursor(options.cursor);
      if (cursor === null) throw paginationError("cursor");
    }
  }
  return Object.freeze({limit, cursor});
}

function encodeRewardVaultCursor(value) {
  const cursor = canonicalCursor(value);
  if (cursor === null) throw paginationError("cursor");
  return Buffer.from(JSON.stringify({
    v: REWARD_VAULT_CURSOR_VERSION,
    k: REWARD_VAULT_CURSOR_KIND,
    createdAt: cursor.createdAt,
    rewardId: cursor.rewardId,
  }), "utf8").toString("base64url");
}

function decodeRewardVaultCursor(value) {
  if (
    typeof value !== "string"
    || value === ""
    || value !== value.trim()
    || value.length > REWARD_VAULT_CURSOR_MAX_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw paginationError("cursor_encoding");
  }
  let parsed;
  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.toString("base64url") !== value) throw new Error("non-canonical base64url");
    const text = decoded.toString("utf8");
    if (Buffer.from(text, "utf8").compare(decoded) !== 0) throw new Error("invalid utf8");
    parsed = JSON.parse(text);
  } catch {
    throw paginationError("cursor_encoding");
  }
  const cursor = canonicalCursor(parsed, {requireEnvelope: true});
  if (cursor === null || encodeRewardVaultCursor(cursor) !== value) {
    throw paginationError("cursor_canonical");
  }
  return cursor;
}

function canonicalRewardVaultPageResult(
  value,
  recipientAccountIdValue,
  options = {},
  validationOptions = {},
) {
  const pageOptions = normalizeRewardVaultPageOptions(options);
  const recipientAccountId = canonicalIdentity(recipientAccountIdValue, 80);
  const trustStoreOrder = isRecord(validationOptions)
    && validationOptions.trustStoreOrder === true;
  const fields = new Set(["recipientAccountId", "rewardRows", "nextCursor", "hasMore"]);
  if (
    recipientAccountId === ""
    || !isRecord(value)
    || Object.keys(value).length !== fields.size
    || Object.keys(value).some((field) => !fields.has(field))
    || value.recipientAccountId !== recipientAccountId
    || !Array.isArray(value.rewardRows)
    || value.rewardRows.length > pageOptions.limit
    || typeof value.hasMore !== "boolean"
  ) {
    throw pageIntegrityError("shape");
  }
  const rewardRows = value.rewardRows.map((entry) => {
    const canonical = canonicalRewardVaultEntry(
      entry,
      entry && entry.rewardId || "",
      {certifyAttachment: validationOptions.certifyAttachment},
    );
    if (canonical.recipientAccountId !== recipientAccountId) {
      throw pageIntegrityError("recipient");
    }
    return canonical;
  });
  const seen = new Set();
  for (let index = 0; index < rewardRows.length; index += 1) {
    const entry = rewardRows[index];
    if (
      seen.has(entry.rewardId)
      || (pageOptions.cursor !== null
        && entry.createdAt === pageOptions.cursor.createdAt
        && entry.rewardId === pageOptions.cursor.rewardId)
      || (!trustStoreOrder && index > 0
        && compareRewardVaultEntries(rewardRows[index - 1], entry) >= 0)
      || (!trustStoreOrder && pageOptions.cursor !== null
        && !entryComesAfterCursor(entry, pageOptions.cursor))
    ) {
      throw pageIntegrityError("order");
    }
    seen.add(entry.rewardId);
  }
  const expectedNextCursor = value.hasMore && rewardRows.length > 0
    ? encodeRewardVaultCursor(cursorForEntry(rewardRows[rewardRows.length - 1]))
    : null;
  if (
    (value.hasMore && rewardRows.length !== pageOptions.limit)
    || value.nextCursor !== expectedNextCursor
  ) {
    throw pageIntegrityError("next_cursor");
  }
  return deepFreeze({
    recipientAccountId,
    rewardRows,
    nextCursor: expectedNextCursor,
    hasMore: value.hasMore,
  });
}

function compareRewardVaultEntries(left, right) {
  const createdOrder = compareDescending(left.createdAt, right.createdAt);
  return createdOrder !== 0 ? createdOrder : compareDescending(left.rewardId, right.rewardId);
}

function entryComesAfterCursor(entry, cursor) {
  return compareRewardVaultEntries(entry, cursor) > 0;
}

function cursorForEntry(entry) {
  return {createdAt: entry.createdAt, rewardId: entry.rewardId};
}

function canonicalCursor(value, options = {}) {
  if (!isRecord(value)) return null;
  const requireEnvelope = options.requireEnvelope === true;
  const fields = requireEnvelope
    ? new Set(["v", "k", "createdAt", "rewardId"])
    : new Set(["createdAt", "rewardId"]);
  if (
    Object.keys(value).length !== fields.size
    || Object.keys(value).some((field) => !fields.has(field))
    || (requireEnvelope && value.v !== REWARD_VAULT_CURSOR_VERSION)
    || (requireEnvelope && value.k !== REWARD_VAULT_CURSOR_KIND)
    || canonicalIsoTimestamp(value.createdAt) === ""
    || canonicalIdentity(value.rewardId, MAX_REWARD_ID_LENGTH) !== value.rewardId
  ) {
    return null;
  }
  return Object.freeze({createdAt: value.createdAt, rewardId: value.rewardId});
}

function canonicalPageLimit(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 1 && value <= REWARD_VAULT_MAX_LIMIT
      ? value
      : null;
  }
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed)
    && parsed <= REWARD_VAULT_MAX_LIMIT
    && String(parsed) === value
    ? parsed
    : null;
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

function compareDescending(left, right) {
  if (left === right) return 0;
  return left > right ? -1 : 1;
}

function paginationError(reason) {
  const error = new Error("奖励仓分页参数无效，请刷新后重试。");
  error.code = "reward_vault_pagination_invalid";
  error.reason = String(reason || "invalid");
  return error;
}

function pageIntegrityError(reason) {
  const error = new Error("奖励仓分页结果不完整或身份不一致。");
  error.code = "reward_vault_page_integrity_invalid";
  error.reason = String(reason || "invalid");
  return error;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

module.exports = {
  REWARD_VAULT_DEFAULT_LIMIT,
  REWARD_VAULT_MAX_LIMIT,
  canonicalRewardVaultPageResult,
  compareRewardVaultEntries,
  decodeRewardVaultCursor,
  encodeRewardVaultCursor,
  normalizeRewardVaultPageOptions,
};
