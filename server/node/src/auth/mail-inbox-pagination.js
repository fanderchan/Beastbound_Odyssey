"use strict";

const {
  MAX_MAIL_ID_LENGTH,
  canonicalMailDocument,
  readMailAuthorityRecipientRows,
} = require("./mail-authority-state");

const MAIL_INBOX_DEFAULT_LIMIT = 30;
const MAIL_INBOX_MAX_LIMIT = 50;
const MAIL_INBOX_CURSOR_VERSION = 1;
const MAIL_INBOX_CURSOR_MAX_LENGTH = 512;

function normalizeMailInboxPageOptions(options = {}, config = {}) {
  if (!isRecord(options)) {
    throw mailInboxPaginationError("options");
  }
  const fields = new Set(["limit", "cursor"]);
  if (Object.keys(options).some((field) => !fields.has(field))) {
    throw mailInboxPaginationError("options_fields");
  }
  const hasLimit = Object.hasOwn(options, "limit");
  if (config.requireExplicitLimit === true && !hasLimit) {
    throw mailInboxPaginationError("limit_required");
  }
  const limit = hasLimit
    ? canonicalPageLimit(options.limit)
    : MAIL_INBOX_DEFAULT_LIMIT;
  if (limit === null) {
    throw mailInboxPaginationError("limit");
  }
  let cursor = null;
  if (Object.hasOwn(options, "cursor")) {
    if (options.cursor === null) {
      cursor = null;
    } else if (typeof options.cursor === "string") {
      cursor = decodeMailInboxCursor(options.cursor);
    } else {
      cursor = canonicalCursor(options.cursor);
      if (cursor === null) {
        throw mailInboxPaginationError("cursor");
      }
    }
  }
  return Object.freeze({limit, cursor});
}

function encodeMailInboxCursor(value) {
  const cursor = canonicalCursor(value);
  if (cursor === null) {
    throw mailInboxPaginationError("cursor");
  }
  return Buffer.from(JSON.stringify({
    v: MAIL_INBOX_CURSOR_VERSION,
    createdAt: cursor.createdAt,
    mailId: cursor.mailId,
  }), "utf8").toString("base64url");
}

function decodeMailInboxCursor(value) {
  if (
    typeof value !== "string"
    || value === ""
    || value !== value.trim()
    || value.length > MAIL_INBOX_CURSOR_MAX_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw mailInboxPaginationError("cursor_encoding");
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
    throw mailInboxPaginationError("cursor_encoding");
  }
  const cursor = canonicalCursor(parsed, {requireVersion: true});
  if (cursor === null || encodeMailInboxCursor(cursor) !== value) {
    throw mailInboxPaginationError("cursor_canonical");
  }
  return cursor;
}

function buildCanonicalMailInboxPage(mailMessages, recipientAccountIdValue, options = {}) {
  const pageOptions = normalizeMailInboxPageOptions(options);
  const recipientAccountId = canonicalIdentity(recipientAccountIdValue, 80);
  if (recipientAccountId === "") {
    throw mailInboxPaginationError("recipient");
  }
  const indexed = readMailAuthorityRecipientRows(mailMessages, recipientAccountId);
  if (!indexed.ok) {
    const error = new Error(indexed.message || "邮箱权威数据异常，暂时无法读取。");
    error.code = indexed.code || "mail_authority_read_failed";
    throw error;
  }
  const rows = indexed.mailRows.map((mail) => canonicalInboxMail(mail, recipientAccountId));
  rows.sort(compareMailInboxRows);
  const unreadCount = rows.reduce((count, mail) => count + (mail.readAt ? 0 : 1), 0);
  const eligible = pageOptions.cursor === null
    ? rows
    : rows.filter((mail) => mailComesAfterCursor(mail, pageOptions.cursor));
  const hasMore = eligible.length > pageOptions.limit;
  const mailRows = eligible.slice(0, pageOptions.limit);
  const nextCursor = hasMore && mailRows.length > 0
    ? encodeMailInboxCursor(mailCursorFor(mailRows[mailRows.length - 1]))
    : null;
  return Object.freeze({
    recipientAccountId,
    mailRows: Object.freeze(mailRows),
    unreadCount,
    nextCursor,
    hasMore,
  });
}

function canonicalMailInboxPageResult(
  value,
  recipientAccountIdValue,
  options = {},
  validationOptions = {},
) {
  const pageOptions = normalizeMailInboxPageOptions(options);
  // A MySQL adapter already obtains rows through one ORDER BY/WHERE collation
  // contract. Replaying that order with JavaScript code-unit comparison would
  // reject valid legacy text keys, so the internal adapter may certify order
  // itself. Every player-identity, row, duplicate, count and cursor boundary
  // check below remains mandatory.
  const trustStoreOrder = isRecord(validationOptions)
    && validationOptions.trustStoreOrder === true;
  const recipientAccountId = canonicalIdentity(recipientAccountIdValue, 80);
  const expectedFields = new Set([
    "recipientAccountId",
    "mailRows",
    "unreadCount",
    "nextCursor",
    "hasMore",
  ]);
  if (
    recipientAccountId === ""
    || !isRecord(value)
    || Object.keys(value).length !== expectedFields.size
    || Object.keys(value).some((field) => !expectedFields.has(field))
    || value.recipientAccountId !== recipientAccountId
    || !Array.isArray(value.mailRows)
    || value.mailRows.length > pageOptions.limit
    || !Number.isSafeInteger(value.unreadCount)
    || value.unreadCount < 0
    || typeof value.hasMore !== "boolean"
  ) {
    throw mailInboxPageIntegrityError("shape");
  }
  const mailRows = value.mailRows.map((mail) => canonicalInboxMail(mail, recipientAccountId));
  const seen = new Set();
  for (let index = 0; index < mailRows.length; index += 1) {
    const mail = mailRows[index];
    if (
      seen.has(mail.mailId)
      || (pageOptions.cursor !== null
        && mail.createdAt === pageOptions.cursor.createdAt
        && mail.mailId === pageOptions.cursor.mailId)
      || (!trustStoreOrder && index > 0
        && compareMailInboxRows(mailRows[index - 1], mail) >= 0)
      || (!trustStoreOrder && pageOptions.cursor !== null
        && !mailComesAfterCursor(mail, pageOptions.cursor))
    ) {
      throw mailInboxPageIntegrityError("order");
    }
    seen.add(mail.mailId);
  }
  const pageUnread = mailRows.reduce((count, mail) => count + (mail.readAt ? 0 : 1), 0);
  if (value.unreadCount < pageUnread) {
    throw mailInboxPageIntegrityError("unread_count");
  }
  const expectedNextCursor = value.hasMore && mailRows.length > 0
    ? encodeMailInboxCursor(mailCursorFor(mailRows[mailRows.length - 1]))
    : null;
  if (
    (value.hasMore && mailRows.length !== pageOptions.limit)
    || value.nextCursor !== expectedNextCursor
  ) {
    throw mailInboxPageIntegrityError("next_cursor");
  }
  return Object.freeze({
    recipientAccountId,
    mailRows: Object.freeze(mailRows),
    unreadCount: value.unreadCount,
    nextCursor: expectedNextCursor,
    hasMore: value.hasMore,
  });
}

function canonicalInboxMail(value, recipientAccountId) {
  const expectedMailId = canonicalIdentity(value && value.mailId, MAX_MAIL_ID_LENGTH);
  const canonical = canonicalMailDocument(value, expectedMailId);
  if (
    expectedMailId === ""
    || !canonical.ok
    || canonical.mail.recipientAccountId !== recipientAccountId
    || !canonicalCreatedAtKey(canonical.mail.createdAt)
  ) {
    throw mailInboxPageIntegrityError("mail_row");
  }
  return canonical.mail;
}

function compareMailInboxRows(left, right) {
  const createdAtOrder = compareCanonicalTextDescending(left.createdAt, right.createdAt);
  return createdAtOrder !== 0
    ? createdAtOrder
    : compareCanonicalTextDescending(left.mailId, right.mailId);
}

function mailComesAfterCursor(mail, cursor) {
  return compareMailInboxRows(mail, cursor) > 0;
}

function compareCanonicalTextDescending(left, right) {
  if (left === right) {
    return 0;
  }
  return left > right ? -1 : 1;
}

function mailCursorFor(mail) {
  return {createdAt: mail.createdAt, mailId: mail.mailId};
}

function canonicalCursor(value, options = {}) {
  if (!isRecord(value)) {
    return null;
  }
  const requireVersion = options.requireVersion === true;
  const fields = requireVersion
    ? new Set(["v", "createdAt", "mailId"])
    : new Set(["createdAt", "mailId"]);
  if (
    Object.keys(value).length !== fields.size
    || Object.keys(value).some((field) => !fields.has(field))
    || (requireVersion && value.v !== MAIL_INBOX_CURSOR_VERSION)
    || !canonicalCreatedAtKey(value.createdAt)
    || canonicalIdentity(value.mailId, MAX_MAIL_ID_LENGTH) !== value.mailId
  ) {
    return null;
  }
  return Object.freeze({
    createdAt: value.createdAt,
    mailId: value.mailId,
  });
}

function canonicalPageLimit(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 1 && value <= MAIL_INBOX_MAX_LIMIT
      ? value
      : null;
  }
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    return null;
  }
  const limit = Number(value);
  return Number.isSafeInteger(limit)
    && limit <= MAIL_INBOX_MAX_LIMIT
    && String(limit) === value
    ? limit
    : null;
}

function canonicalCreatedAtKey(value) {
  return typeof value === "string"
    && value !== ""
    && value === value.trim()
    && value.length <= 40
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function canonicalIdentity(value, maxLength) {
  return typeof value === "string"
    && value !== ""
    && value === value.trim()
    && value.length <= maxLength
    ? value
    : "";
}

function mailInboxPaginationError(reason) {
  const error = new Error("邮箱分页参数无效，请刷新后重试。");
  error.code = "mail_inbox_pagination_invalid";
  error.reason = String(reason || "invalid");
  return error;
}

function mailInboxPageIntegrityError(reason) {
  const error = new Error("邮箱分页数据与权威身份不一致。");
  error.code = "mail_inbox_page_integrity_invalid";
  error.reason = String(reason || "invalid");
  return error;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  MAIL_INBOX_DEFAULT_LIMIT,
  MAIL_INBOX_MAX_LIMIT,
  buildCanonicalMailInboxPage,
  canonicalMailInboxPageResult,
  compareMailInboxRows,
  decodeMailInboxCursor,
  encodeMailInboxCursor,
  normalizeMailInboxPageOptions,
};
