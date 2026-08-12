"use strict";

const {
  MAX_MAIL_ID_LENGTH,
  canonicalMailDocument,
} = require("./mail-authority-state");
const {
  canonicalMailLifecycleIsoTimestamp,
} = require("./mail-lifecycle-state");

const MAIL_ARCHIVE_DEFAULT_LIMIT = 30;
const MAIL_ARCHIVE_MAX_LIMIT = 50;
const MAIL_ARCHIVE_CURSOR_KIND = "mail_archive";
const MAIL_ARCHIVE_CURSOR_VERSION = 1;
const MAIL_ARCHIVE_CURSOR_MAX_LENGTH = 512;

function normalizeMailArchivePageOptions(options = {}, config = {}) {
  if (!isRecord(options)) {
    throw mailArchivePaginationError("options");
  }
  const fields = new Set(["limit", "cursor"]);
  if (Object.keys(options).some((field) => !fields.has(field))) {
    throw mailArchivePaginationError("options_fields");
  }
  const hasLimit = Object.hasOwn(options, "limit");
  if (config.requireExplicitLimit === true && !hasLimit) {
    throw mailArchivePaginationError("limit_required");
  }
  const limit = hasLimit
    ? canonicalPageLimit(options.limit)
    : MAIL_ARCHIVE_DEFAULT_LIMIT;
  if (limit === null) {
    throw mailArchivePaginationError("limit");
  }
  let cursor = null;
  if (Object.hasOwn(options, "cursor")) {
    if (options.cursor === null) {
      cursor = null;
    } else if (typeof options.cursor === "string") {
      cursor = decodeMailArchiveCursor(options.cursor);
    } else {
      cursor = canonicalCursor(options.cursor);
      if (cursor === null) {
        throw mailArchivePaginationError("cursor");
      }
    }
  }
  return Object.freeze({limit, cursor});
}

function encodeMailArchiveCursor(value) {
  const cursor = canonicalCursor(value);
  if (cursor === null) {
    throw mailArchivePaginationError("cursor");
  }
  return Buffer.from(JSON.stringify({
    v: MAIL_ARCHIVE_CURSOR_VERSION,
    k: MAIL_ARCHIVE_CURSOR_KIND,
    createdAt: cursor.createdAt,
    mailId: cursor.mailId,
  }), "utf8").toString("base64url");
}

function decodeMailArchiveCursor(value) {
  if (
    typeof value !== "string"
    || value === ""
    || value !== value.trim()
    || value.length > MAIL_ARCHIVE_CURSOR_MAX_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw mailArchivePaginationError("cursor_encoding");
  }
  let parsed;
  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.toString("base64url") !== value) {
      throw new Error("non-canonical base64url");
    }
    const text = decoded.toString("utf8");
    if (Buffer.from(text, "utf8").compare(decoded) !== 0) {
      throw new Error("invalid utf8");
    }
    parsed = JSON.parse(text);
  } catch {
    throw mailArchivePaginationError("cursor_encoding");
  }
  const cursor = canonicalCursor(parsed, {requireEnvelope: true});
  if (cursor === null || encodeMailArchiveCursor(cursor) !== value) {
    throw mailArchivePaginationError("cursor_canonical");
  }
  return cursor;
}

function canonicalMailArchivePageResult(
  value,
  recipientAccountIdValue,
  options = {},
  validationOptions = {},
) {
  const pageOptions = normalizeMailArchivePageOptions(options);
  const trustStoreOrder = isRecord(validationOptions)
    && validationOptions.trustStoreOrder === true;
  const recipientAccountId = canonicalIdentity(recipientAccountIdValue, 80);
  const expectedFields = new Set([
    "recipientAccountId",
    "archiveRows",
    "nextCursor",
    "hasMore",
  ]);
  if (
    recipientAccountId === ""
    || !isRecord(value)
    || Object.keys(value).length !== expectedFields.size
    || Object.keys(value).some((field) => !expectedFields.has(field))
    || value.recipientAccountId !== recipientAccountId
    || !Array.isArray(value.archiveRows)
    || value.archiveRows.length > pageOptions.limit
    || typeof value.hasMore !== "boolean"
  ) {
    throw mailArchivePageIntegrityError("shape");
  }
  const archiveRows = value.archiveRows.map((entry) => (
    canonicalArchivePageEntry(entry, recipientAccountId)
  ));
  const seen = new Set();
  for (let index = 0; index < archiveRows.length; index += 1) {
    const entry = archiveRows[index];
    if (
      seen.has(entry.mail.mailId)
      || (pageOptions.cursor !== null
        && entry.mail.createdAt === pageOptions.cursor.createdAt
        && entry.mail.mailId === pageOptions.cursor.mailId)
      || (!trustStoreOrder && index > 0
        && compareArchiveEntries(archiveRows[index - 1], entry) >= 0)
      || (!trustStoreOrder && pageOptions.cursor !== null
        && !entryComesAfterCursor(entry, pageOptions.cursor))
    ) {
      throw mailArchivePageIntegrityError("order");
    }
    seen.add(entry.mail.mailId);
  }
  const expectedNextCursor = value.hasMore && archiveRows.length > 0
    ? encodeMailArchiveCursor(cursorForEntry(archiveRows[archiveRows.length - 1]))
    : null;
  if (
    (value.hasMore && archiveRows.length !== pageOptions.limit)
    || value.nextCursor !== expectedNextCursor
  ) {
    throw mailArchivePageIntegrityError("next_cursor");
  }
  return deepFreeze({
    recipientAccountId,
    archiveRows,
    nextCursor: expectedNextCursor,
    hasMore: value.hasMore,
  });
}

function canonicalArchivePageEntry(value, recipientAccountId) {
  if (
    !isRecord(value)
    || Object.keys(value).length !== 2
    || !Object.hasOwn(value, "mail")
    || !Object.hasOwn(value, "archivedAt")
  ) {
    throw mailArchivePageIntegrityError("archive_row");
  }
  const expectedMailId = canonicalIdentity(value.mail && value.mail.mailId, MAX_MAIL_ID_LENGTH);
  const canonical = canonicalMailDocument(value.mail, expectedMailId);
  const archivedAt = canonicalMailLifecycleIsoTimestamp(value.archivedAt);
  const settledAt = canonicalMailLifecycleIsoTimestamp(
    canonical.ok && canonical.mail ? canonical.mail.settledAt : null,
  );
  if (
    expectedMailId === ""
    || !canonical.ok
    || canonical.mail.recipientAccountId !== recipientAccountId
    || !canonicalCreatedAtKey(canonical.mail.createdAt)
    || archivedAt === ""
    || settledAt === ""
    || Date.parse(archivedAt) < Date.parse(settledAt)
  ) {
    throw mailArchivePageIntegrityError("archive_row");
  }
  return deepFreeze({mail: canonical.mail, archivedAt});
}

function canonicalCursor(value, options = {}) {
  if (!isRecord(value)) {
    return null;
  }
  const requireEnvelope = options.requireEnvelope === true;
  const fields = requireEnvelope
    ? new Set(["v", "k", "createdAt", "mailId"])
    : new Set(["createdAt", "mailId"]);
  if (
    Object.keys(value).length !== fields.size
    || Object.keys(value).some((field) => !fields.has(field))
    || (requireEnvelope && value.v !== MAIL_ARCHIVE_CURSOR_VERSION)
    || (requireEnvelope && value.k !== MAIL_ARCHIVE_CURSOR_KIND)
    || !canonicalCreatedAtKey(value.createdAt)
    || canonicalIdentity(value.mailId, MAX_MAIL_ID_LENGTH) !== value.mailId
  ) {
    return null;
  }
  return Object.freeze({createdAt: value.createdAt, mailId: value.mailId});
}

function compareArchiveEntries(left, right) {
  const createdAtOrder = compareCanonicalTextDescending(
    left.mail.createdAt,
    right.mail.createdAt,
  );
  return createdAtOrder !== 0
    ? createdAtOrder
    : compareCanonicalTextDescending(left.mail.mailId, right.mail.mailId);
}

function entryComesAfterCursor(entry, cursor) {
  return compareArchiveEntries(entry, {mail: cursor}) > 0;
}

function cursorForEntry(entry) {
  return {createdAt: entry.mail.createdAt, mailId: entry.mail.mailId};
}

function compareCanonicalTextDescending(left, right) {
  if (left === right) return 0;
  return left > right ? -1 : 1;
}

function canonicalCreatedAtKey(value) {
  return typeof value === "string"
    && value !== ""
    && value === value.trim()
    && value.length <= 40
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function canonicalPageLimit(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 1 && value <= MAIL_ARCHIVE_MAX_LIMIT
      ? value
      : null;
  }
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= MAIL_ARCHIVE_MAX_LIMIT ? parsed : null;
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

function mailArchivePaginationError(reason) {
  const error = new Error("邮件归档分页参数无效，请刷新后重试。");
  error.code = "mail_archive_pagination_invalid";
  error.reason = String(reason || "invalid");
  return error;
}

function mailArchivePageIntegrityError(reason) {
  const error = new Error("邮件归档分页结果不完整或身份不一致。");
  error.code = "mail_archive_page_integrity_invalid";
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
  MAIL_ARCHIVE_DEFAULT_LIMIT,
  MAIL_ARCHIVE_MAX_LIMIT,
  canonicalMailArchivePageResult,
  decodeMailArchiveCursor,
  encodeMailArchiveCursor,
  normalizeMailArchivePageOptions,
};
