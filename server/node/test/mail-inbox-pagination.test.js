"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MAIL_INBOX_DEFAULT_LIMIT,
  MAIL_INBOX_MAX_LIMIT,
  buildCanonicalMailInboxPage,
  canonicalMailInboxPageResult,
  decodeMailInboxCursor,
  encodeMailInboxCursor,
  normalizeMailInboxPageOptions,
} = require("../src/auth/mail-inbox-pagination");
const {
  mailAuthorityDiagnostics,
  readMailAuthorityState,
  stageMailAuthorityDelete,
  stageMailAuthorityUpsert,
} = require("../src/auth/mail-authority-state");

const ACCOUNT_ID = "acc_inbox_page_owner";

test("mail inbox options and opaque cursor are strict and canonical", () => {
  assert.equal(MAIL_INBOX_DEFAULT_LIMIT, 30);
  assert.equal(MAIL_INBOX_MAX_LIMIT, 50);
  assert.deepEqual(normalizeMailInboxPageOptions({}), {limit: 30, cursor: null});
  assert.throws(
    () => normalizeMailInboxPageOptions({}, {requireExplicitLimit: true}),
    (error) => error && error.code === "mail_inbox_pagination_invalid",
  );
  const encoded = encodeMailInboxCursor({
    createdAt: "2026/07/16 12:00:00",
    mailId: "mail_cursor_0001",
  });
  assert.deepEqual(decodeMailInboxCursor(encoded), {
    createdAt: "2026/07/16 12:00:00",
    mailId: "mail_cursor_0001",
  });
  assert.deepEqual(normalizeMailInboxPageOptions({limit: "50", cursor: encoded}), {
    limit: 50,
    cursor: {
      createdAt: "2026/07/16 12:00:00",
      mailId: "mail_cursor_0001",
    },
  });
  for (const invalid of [0, 51, "01", " 1", "1.0", ""]) {
    assert.throws(
      () => normalizeMailInboxPageOptions({limit: invalid}),
      (error) => error && error.code === "mail_inbox_pagination_invalid",
    );
  }
  for (const invalid of ["=", `${encoded}=`, Buffer.from(JSON.stringify({
    v: 2,
    createdAt: "2026-07-16T12:00:00.000Z",
    mailId: "mail_cursor_0001",
  })).toString("base64url")]) {
    assert.throws(
      () => decodeMailInboxCursor(invalid),
      (error) => error && error.code === "mail_inbox_pagination_invalid",
    );
  }
});

test("mail inbox keyset pages equal timestamps without duplicates or skips", () => {
  const messages = canonicalMessages({
    mail_a: mail("mail_a", "2026-07-16T12:00:00.000Z", {readAt: null}),
    mail_b: mail("mail_b", "2026-07-16T12:00:00.000Z", {readAt: "2026-07-16T12:05:00.000Z"}),
    mail_c: mail("mail_c", "2026-07-16T12:00:00.000Z", {readAt: null}),
    mail_d: mail("mail_d", "2026-07-15T12:00:00.000Z", {readAt: null}),
  });
  const first = buildCanonicalMailInboxPage(messages, ACCOUNT_ID, {limit: 2});
  assert.deepEqual(first.mailRows.map(({mailId}) => mailId), ["mail_c", "mail_b"]);
  assert.equal(first.unreadCount, 3);
  assert.equal(first.hasMore, true);
  assert.equal(typeof first.nextCursor, "string");

  const second = buildCanonicalMailInboxPage(messages, ACCOUNT_ID, {
    limit: 2,
    cursor: first.nextCursor,
  });
  assert.deepEqual(second.mailRows.map(({mailId}) => mailId), ["mail_a", "mail_d"]);
  assert.equal(second.unreadCount, 3);
  assert.equal(second.hasMore, false);
  assert.equal(second.nextCursor, null);
  assert.deepEqual(
    [...first.mailRows, ...second.mailRows].map(({mailId}) => mailId),
    ["mail_c", "mail_b", "mail_a", "mail_d"],
  );
});

test("mail inbox sorting and cursor filtering share one total order for legacy text keys", () => {
  const messages = canonicalMessages({
    mail_upper: mail("mail_upper", "B"),
    mail_lower: mail("mail_lower", "a"),
  });
  const first = buildCanonicalMailInboxPage(messages, ACCOUNT_ID, {limit: 1});
  const second = buildCanonicalMailInboxPage(messages, ACCOUNT_ID, {
    limit: 1,
    cursor: first.nextCursor,
  });

  assert.deepEqual(first.mailRows.map(({mailId}) => mailId), ["mail_lower"]);
  assert.equal(first.hasMore, true);
  assert.deepEqual(second.mailRows.map(({mailId}) => mailId), ["mail_upper"]);
  assert.equal(second.hasMore, false);
  assert.equal(second.nextCursor, null);
});

test("canonical recipient index avoids global proxy enumeration and follows pending changes", () => {
  const source = {};
  for (let index = 0; index < 2000; index += 1) {
    const mailId = `mail_other_${String(index).padStart(4, "0")}`;
    source[mailId] = mail(mailId, "2026-07-10T00:00:00.000Z", {
      recipientAccountId: `acc_other_${String(index).padStart(4, "0")}`,
    });
  }
  source.mail_target_old = mail("mail_target_old", "2026-07-15T00:00:00.000Z");
  let messages = canonicalMessages(source);
  const enumerations = mailAuthorityDiagnostics(messages).ownKeyEnumerations;

  const inserted = stageMailAuthorityUpsert(
    messages,
    mail("mail_target_new", "2026-07-16T00:00:00.000Z"),
  );
  assert.equal(inserted.ok, true);
  const deleted = stageMailAuthorityDelete(inserted.messages, "mail_target_old");
  assert.equal(deleted.ok, true);
  messages = deleted.messages;
  const page = buildCanonicalMailInboxPage(messages, ACCOUNT_ID, {limit: 10});
  assert.deepEqual(page.mailRows.map(({mailId}) => mailId), ["mail_target_new"]);
  assert.equal(mailAuthorityDiagnostics(messages).ownKeyEnumerations, enumerations);
});

test("specialized store page certification enforces recipient, order, cursor, and internal row identity", () => {
  const rows = [
    mail("mail_b", "2026-07-16T12:00:00.000Z"),
    mail("mail_a", "2026-07-16T12:00:00.000Z"),
  ];
  const page = {
    recipientAccountId: ACCOUNT_ID,
    mailRows: rows,
    unreadCount: 2,
    nextCursor: encodeMailInboxCursor({createdAt: rows[1].createdAt, mailId: rows[1].mailId}),
    hasMore: true,
  };
  const certified = canonicalMailInboxPageResult(page, ACCOUNT_ID, {limit: 2});
  assert.deepEqual(certified.mailRows.map(({mailId}) => mailId), ["mail_b", "mail_a"]);
  assert.throws(
    () => canonicalMailInboxPageResult({...page, recipientAccountId: "acc_other"}, ACCOUNT_ID, {limit: 2}),
    (error) => error && error.code === "mail_inbox_page_integrity_invalid",
  );
  assert.throws(
    () => canonicalMailInboxPageResult({...page, mailRows: [...rows].reverse()}, ACCOUNT_ID, {limit: 2}),
    (error) => error && error.code === "mail_inbox_page_integrity_invalid",
  );
  assert.throws(
    () => canonicalMailInboxPageResult({...page, mailRows: [
      {...rows[0], recipientAccountId: "acc_other"},
      rows[1],
    ]}, ACCOUNT_ID, {limit: 2}),
    (error) => error && error.code === "mail_inbox_page_integrity_invalid",
  );
});

test("trusted store order skips only JS ordering while retaining row, duplicate, and cursor certification", () => {
  const rows = [
    mail("mail_b", "2026-07-16T12:00:00.000Z"),
    mail("mail_a", "2026-07-16T12:00:00.000Z"),
  ].reverse();
  const page = {
    recipientAccountId: ACCOUNT_ID,
    mailRows: rows,
    unreadCount: 2,
    nextCursor: encodeMailInboxCursor({
      createdAt: rows[1].createdAt,
      mailId: rows[1].mailId,
    }),
    hasMore: true,
  };
  const trusted = canonicalMailInboxPageResult(
    page,
    ACCOUNT_ID,
    {limit: 2},
    {trustStoreOrder: true},
  );
  assert.deepEqual(trusted.mailRows.map(({mailId}) => mailId), ["mail_a", "mail_b"]);

  assert.throws(
    () => canonicalMailInboxPageResult({
      ...page,
      mailRows: [rows[0], rows[0]],
      nextCursor: encodeMailInboxCursor({
        createdAt: rows[0].createdAt,
        mailId: rows[0].mailId,
      }),
    }, ACCOUNT_ID, {limit: 2}, {trustStoreOrder: true}),
    (error) => error && error.code === "mail_inbox_page_integrity_invalid",
  );
  assert.throws(
    () => canonicalMailInboxPageResult({
      ...page,
      mailRows: [{...rows[0], recipientAccountId: "acc_other"}, rows[1]],
    }, ACCOUNT_ID, {limit: 2}, {trustStoreOrder: true}),
    (error) => error && error.code === "mail_inbox_page_integrity_invalid",
  );
  assert.throws(
    () => canonicalMailInboxPageResult({
      ...page,
      nextCursor: encodeMailInboxCursor({
        createdAt: rows[0].createdAt,
        mailId: rows[0].mailId,
      }),
    }, ACCOUNT_ID, {limit: 2}, {trustStoreOrder: true}),
    (error) => error && error.code === "mail_inbox_page_integrity_invalid",
  );
  assert.throws(
    () => canonicalMailInboxPageResult(
      page,
      ACCOUNT_ID,
      {
        limit: 2,
        cursor: encodeMailInboxCursor({
          createdAt: rows[0].createdAt,
          mailId: rows[0].mailId,
        }),
      },
      {trustStoreOrder: true},
    ),
    (error) => error && error.code === "mail_inbox_page_integrity_invalid",
  );
});

function canonicalMessages(value) {
  const read = readMailAuthorityState(value);
  assert.equal(read.ok, true);
  return read.messages;
}

function mail(mailId, createdAt, overrides = {}) {
  return {
    mailId,
    senderAccountId: "acc_inbox_sender",
    senderUsername: "inbox_sender",
    senderDisplayName: "分页寄件人",
    recipientAccountId: ACCOUNT_ID,
    recipientUsername: "inbox_owner",
    recipientDisplayName: "分页收件人",
    title: `邮件 ${mailId}`,
    body: "分页测试正文。",
    items: [],
    currency: {},
    createdAt,
    readAt: null,
    schemaVersion: 1,
    ...overrides,
  };
}
