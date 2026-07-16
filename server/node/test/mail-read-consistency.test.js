"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MAIL_READ_DISPOSITION_UPDATE,
  buildRowLocalMailReadConsistencyScope,
  canonicalMailReadConsistencyScope,
  rowLocalMailReadRecoveryMatches,
} = require("../src/auth/mail-read-consistency");
const {
  readMailAuthorityState,
  stageMailAuthorityUpsert,
} = require("../src/auth/mail-authority-state");

const ACCOUNT_ID = "acc_mail_read_owner";
const MAIL_ID = "mail_read_target_0001";
const OPERATION_ID = "operation_mail_read_0001";
const REQUEST_HASH = "a".repeat(64);
const ACTION_ID = "POST /mail/:id/read";
const READ_AT = "2026-07-16T09:15:00.000Z";

test("mail read scope certifies exactly one unread-to-read target row", () => {
  const before = rootWithMail(mail({readAt: null}));
  const staged = stageMailAuthorityUpsert(before.mailMessages, {
    ...before.mailMessages[MAIL_ID],
    readAt: READ_AT,
  });
  assert.equal(staged.ok, true);
  const candidate = {...before, mailMessages: staged.messages};
  const scope = buildScope(before, candidate);

  assert.deepEqual(scope, {
    kind: "row_local_mail_read_v1",
    mailDisposition: MAIL_READ_DISPOSITION_UPDATE,
    accountId: ACCOUNT_ID,
    mailId: MAIL_ID,
    operationId: OPERATION_ID,
    requestHash: REQUEST_HASH,
    actionId: ACTION_ID,
  });
  assert.deepEqual(canonicalMailReadConsistencyScope(scope), scope);
});

test("mail read scope leaves already-read targets on the existing no-write path", () => {
  const before = rootWithMail(mail({readAt: READ_AT}));
  assert.equal(buildScope(before, {...before}), null);

  const staged = stageMailAuthorityUpsert(before.mailMessages, {
    ...before.mailMessages[MAIL_ID],
    title: "被夹带修改的标题",
  });
  assert.equal(staged.ok, true);
  assert.equal(buildScope(before, {...before, mailMessages: staged.messages}), null);
});

test("mail read scope rejects wrong authority, malformed time, extra mail changes, and unbound receipts", () => {
  const before = rootWithMail(mail({readAt: null}));
  const updated = stageMailAuthorityUpsert(before.mailMessages, {
    ...before.mailMessages[MAIL_ID],
    readAt: READ_AT,
  });
  assert.equal(updated.ok, true);
  const candidate = {...before, mailMessages: updated.messages};

  assert.equal(buildScope(before, candidate, {methodName: "claimMailAttachments"}), null);
  assert.equal(buildScope(before, candidate, {accountId: "acc_other"}), null);
  assert.equal(buildScope(before, candidate, {
    receipt: receipt({operationId: ""}),
  }), null);
  assert.equal(buildScope(before, candidate, {
    receipt: receipt({accountId: "acc_other"}),
  }), null);

  const malformedTime = stageMailAuthorityUpsert(before.mailMessages, {
    ...before.mailMessages[MAIL_ID],
    readAt: "2026-07-16T09:15:00Z",
  });
  assert.equal(malformedTime.ok, true);
  assert.equal(buildScope(before, {...before, mailMessages: malformedTime.messages}), null);

  let extra = stageMailAuthorityUpsert(before.mailMessages, {
    ...before.mailMessages[MAIL_ID],
    readAt: READ_AT,
  });
  extra = stageMailAuthorityUpsert(extra.messages, mail({
    mailId: "mail_read_extra_0002",
    readAt: READ_AT,
  }));
  assert.equal(extra.ok, true);
  assert.equal(buildScope(before, {...before, mailMessages: extra.messages}), null);
});

test("mail read recovery matches only the scoped final mail and durable receipt", () => {
  const before = rootWithMail(mail({readAt: null}));
  const staged = stageMailAuthorityUpsert(before.mailMessages, {
    ...before.mailMessages[MAIL_ID],
    readAt: READ_AT,
  });
  assert.equal(staged.ok, true);
  const committedReceipt = receipt();
  const expected = {
    ...before,
    mailMessages: staged.messages,
    mutationReceipts: {[OPERATION_ID]: committedReceipt},
  };
  const scope = buildScope(before, expected);
  const reloaded = {
    ...expected,
    profiles: {unrelated_remote_profile: {profileRevision: 99}},
  };
  assert.equal(rowLocalMailReadRecoveryMatches(reloaded, expected, scope), true);

  assert.equal(rowLocalMailReadRecoveryMatches({
    ...reloaded,
    mutationReceipts: {
      [OPERATION_ID]: receipt({requestHash: "b".repeat(64)}),
    },
  }, expected, scope), false);
  assert.equal(rowLocalMailReadRecoveryMatches({
    ...reloaded,
    mailMessages: readMailAuthorityState({}).messages,
  }, expected, scope), false);
  assert.equal(rowLocalMailReadRecoveryMatches(reloaded, expected, {
    ...scope,
    unexpected: true,
  }), false);
});

function buildScope(before, candidate, overrides = {}) {
  return buildRowLocalMailReadConsistencyScope({
    methodName: "markMailRead",
    before,
    candidate,
    accountId: ACCOUNT_ID,
    mailId: MAIL_ID,
    receipt: receipt(),
    ...overrides,
  });
}

function rootWithMail(document) {
  const read = readMailAuthorityState({[document.mailId]: document});
  assert.equal(read.ok, true);
  return {
    mailMessages: read.messages,
    mutationReceipts: {},
    profiles: {},
  };
}

function mail(overrides = {}) {
  const mailId = overrides.mailId || MAIL_ID;
  return {
    mailId,
    senderAccountId: "acc_mail_read_sender",
    recipientAccountId: ACCOUNT_ID,
    title: "精确已读测试",
    body: "只能修改 readAt。",
    items: [],
    currency: {},
    createdAt: "2026-07-16T09:00:00.000Z",
    readAt: null,
    schemaVersion: 1,
    ...overrides,
  };
}

function receipt(overrides = {}) {
  return {
    schemaVersion: 1,
    operationId: OPERATION_ID,
    requestHash: REQUEST_HASH,
    actionId: ACTION_ID,
    accountId: ACCOUNT_ID,
    committedAt: READ_AT,
    expiresAt: "2026-07-19T09:15:00.000Z",
    response: {ok: true, mail: {mailId: MAIL_ID, readAt: READ_AT}},
    ...overrides,
  };
}
