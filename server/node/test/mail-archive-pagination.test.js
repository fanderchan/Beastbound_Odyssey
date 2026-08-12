"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  canonicalMailArchivePageResult,
  decodeMailArchiveCursor,
  encodeMailArchiveCursor,
  normalizeMailArchivePageOptions,
} = require("../src/auth/mail-archive-pagination");
const {
  decodeMailInboxCursor,
  encodeMailInboxCursor,
} = require("../src/auth/mail-inbox-pagination");

const RECIPIENT = "account_archive_owner";
const SETTLED_AT = "2026-05-01T00:00:00.000Z";
const ARCHIVED_AT = "2026-06-01T00:00:00.000Z";

function mail(mailId, createdAt) {
  return {
    mailId,
    mailKind: "system",
    senderAccountId: "account_archive_sender",
    senderUsername: "system",
    senderDisplayName: "系统",
    recipientAccountId: RECIPIENT,
    recipientUsername: "archive_owner",
    recipientDisplayName: "归档玩家",
    title: `归档邮件 ${mailId}`,
    body: "只读历史回执。",
    items: [],
    equipmentEnvelopes: [],
    currency: {},
    createdAt,
    readAt: SETTLED_AT,
    settledAt: SETTLED_AT,
    schemaVersion: 2,
  };
}

test("archive cursor is canonical, domain-separated, and rejects inbox cursors", () => {
  const value = {createdAt: "2026/04/30 10:00:00", mailId: "mail_archive_1"};
  const cursor = encodeMailArchiveCursor(value);
  assert.deepEqual(decodeMailArchiveCursor(cursor), value);
  assert.throws(
    () => decodeMailArchiveCursor(encodeMailInboxCursor(value)),
    (error) => error && error.code === "mail_archive_pagination_invalid",
  );
  assert.throws(
    () => decodeMailInboxCursor(cursor),
    (error) => error && error.code === "mail_inbox_pagination_invalid",
  );
});

test("archive page validates immutable lifecycle, ordering, and last-row cursor", () => {
  const rows = [
    {mail: mail("mail_archive_z", "2026/04/30 10:00:00"), archivedAt: ARCHIVED_AT},
    {mail: mail("mail_archive_y", "2026/04/30 10:00:00"), archivedAt: ARCHIVED_AT},
  ];
  const nextCursor = encodeMailArchiveCursor({
    createdAt: rows[1].mail.createdAt,
    mailId: rows[1].mail.mailId,
  });
  const page = canonicalMailArchivePageResult({
    recipientAccountId: RECIPIENT,
    archiveRows: rows,
    nextCursor,
    hasMore: true,
  }, RECIPIENT, {limit: 2, cursor: null});
  assert.equal(page.hasMore, true);
  assert.equal(page.archiveRows[0].archivedAt, ARCHIVED_AT);
  assert.deepEqual(decodeMailArchiveCursor(page.nextCursor), {
    createdAt: rows[1].mail.createdAt,
    mailId: rows[1].mail.mailId,
  });

  assert.throws(
    () => canonicalMailArchivePageResult({
      recipientAccountId: RECIPIENT,
      archiveRows: [{...rows[0], archivedAt: "2026-04-01T00:00:00.000Z"}],
      nextCursor: null,
      hasMore: false,
    }, RECIPIENT, {limit: 2, cursor: null}),
    (error) => error && error.code === "mail_archive_page_integrity_invalid",
  );
});

test("archive pagination accepts only explicit bounded limit and its own cursor", () => {
  assert.deepEqual(
    normalizeMailArchivePageOptions({limit: "50", cursor: null}, {requireExplicitLimit: true}),
    {limit: 50, cursor: null},
  );
  for (const options of [
    {},
    {limit: 0},
    {limit: 51},
    {limit: 1, extra: true},
    {limit: 1, cursor: "not-a-cursor"},
  ]) {
    assert.throws(
      () => normalizeMailArchivePageOptions(options, {requireExplicitLimit: true}),
      (error) => error && error.code === "mail_archive_pagination_invalid",
    );
  }
});
