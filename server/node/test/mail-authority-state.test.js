"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MAIL_AUTHORITY_CHECKPOINT_HISTORY_MAX,
  commitMailAuthorityDelta,
  isCanonicalMailAuthorityState,
  mailAuthorityDeltaFrom,
  mailAuthorityDiagnostics,
  mailAuthoritySignature,
  mailAuthorityStateCanDescendFrom,
  materializeMailAuthorityState,
  readMailAuthorityState,
  stageMailAuthorityChanges,
  stageMailAuthorityDelete,
  stageMailAuthorityUpsert,
} = require("../src/auth/mail-authority-state");

function mail(mailId, overrides = {}) {
  return {
    mailId,
    senderAccountId: "system_test",
    recipientAccountId: "acc_mail_state",
    title: mailId,
    body: "测试邮件",
    items: [],
    createdAt: "2026-07-16T00:00:00.000Z",
    readAt: null,
    schemaVersion: 1,
    ...overrides,
  };
}

test("mail authority stages touched rows without exposing them to the baseline", () => {
  const read = readMailAuthorityState({mail_a: mail("mail_a")});
  assert.equal(read.ok, true);
  assert.equal(isCanonicalMailAuthorityState(read.messages), true);
  const baseline = read.messages;

  const inserted = stageMailAuthorityUpsert(baseline, mail("mail_b"));
  assert.equal(inserted.ok, true);
  assert.equal(Object.hasOwn(baseline, "mail_b"), false);
  assert.equal(Object.hasOwn(inserted.messages, "mail_b"), true);
  assert.equal(Object.keys(inserted.messages).length, 2);

  const delta = mailAuthorityDeltaFrom(baseline, inserted.messages);
  assert.equal(delta.ok, true);
  assert.deepEqual(delta.changes.map((entry) => [entry.mailId, entry.disposition]), [
    ["mail_b", "insert"],
  ]);
  assert.equal(mailAuthorityStateCanDescendFrom(baseline, inserted.messages), true);
  assert.notEqual(mailAuthoritySignature(baseline), mailAuthoritySignature(inserted.messages));
});

test("mail authority commit advances only the candidate view", () => {
  const baseline = readMailAuthorityState({mail_a: mail("mail_a")}).messages;
  const updated = stageMailAuthorityUpsert(baseline, {
    ...mail("mail_a"),
    readAt: "2026-07-16T00:01:00.000Z",
  }).messages;
  commitMailAuthorityDelta(updated);

  assert.equal(baseline.mail_a.readAt, null);
  assert.equal(updated.mail_a.readAt, "2026-07-16T00:01:00.000Z");
  assert.equal(mailAuthorityDeltaFrom(updated, updated).ok, true);
  assert.equal(mailAuthorityDeltaFrom(updated, updated).changes.length, 0);

  const deleted = stageMailAuthorityDelete(updated, "mail_a");
  assert.equal(deleted.ok, true);
  assert.equal(Object.hasOwn(updated, "mail_a"), true);
  assert.equal(Object.hasOwn(deleted.messages, "mail_a"), false);
  assert.equal(mailAuthorityDeltaFrom(updated, deleted.messages).changes[0].disposition, "delete");
  commitMailAuthorityDelta(deleted.messages);
  assert.equal(Object.hasOwn(updated, "mail_a"), true);
  assert.equal(Object.hasOwn(deleted.messages, "mail_a"), false);
});

test("mail authority freezes documents and cancels a staged revert", () => {
  const baseline = readMailAuthorityState({mail_a: mail("mail_a")}).messages;
  assert.equal(Object.isFrozen(baseline.mail_a), true);
  assert.equal(Object.isFrozen(baseline.mail_a.items), true);
  assert.throws(() => {
    baseline.mail_a.title = "篡改";
  }, TypeError);
  assert.equal(baseline.mail_a.title, "mail_a");

  const updated = stageMailAuthorityUpsert(baseline, {...mail("mail_a"), title: "已读"}).messages;
  const reverted = stageMailAuthorityUpsert(updated, mail("mail_a"));
  assert.equal(reverted.ok, true);
  assert.equal(mailAuthorityDeltaFrom(baseline, reverted.messages).changes.length, 0);
});

test("mail authority stages a partition replacement in one isolated batch", () => {
  const baseline = readMailAuthorityState({
    mail_a: mail("mail_a"),
    mail_b: mail("mail_b"),
  }).messages;
  const staged = stageMailAuthorityChanges(baseline, [
    {mailId: "mail_a", after: null},
    {mailId: "mail_b", after: {...mail("mail_b"), readAt: "2026-07-16T00:02:00.000Z"}},
    {mailId: "mail_c", after: mail("mail_c")},
  ]);

  assert.equal(staged.ok, true);
  assert.equal(staged.changed, true);
  assert.equal(Object.hasOwn(baseline, "mail_a"), true);
  assert.equal(Object.hasOwn(staged.messages, "mail_a"), false);
  assert.equal(staged.messages.mail_b.readAt, "2026-07-16T00:02:00.000Z");
  assert.equal(staged.messages.mail_c.mailId, "mail_c");
  assert.deepEqual(
    mailAuthorityDeltaFrom(baseline, staged.messages).changes
      .map(({mailId, disposition}) => [mailId, disposition]),
    [["mail_a", "delete"], ["mail_b", "update"], ["mail_c", "insert"]],
  );
});

test("mail authority durable signatures distinguish different touched-row contents", () => {
  const baseline = readMailAuthorityState({mail_a: mail("mail_a")}).messages;
  const left = stageMailAuthorityUpsert(baseline, {...mail("mail_a"), title: "左"}).messages;
  const right = stageMailAuthorityUpsert(baseline, {...mail("mail_a"), title: "右"}).messages;

  assert.notEqual(mailAuthoritySignature(left), mailAuthoritySignature(right));
  assert.equal(mailAuthoritySignature(left), mailAuthoritySignature(left));
});

test("mail authority rejects malformed identities and stale commits", () => {
  const invalidKey = readMailAuthorityState({" mail_a": mail("mail_a")});
  assert.equal(invalidKey.ok, false);
  assert.equal(invalidKey.code, "mail_authority_identity_invalid");
  const invalidRecipient = readMailAuthorityState({mail_a: mail("mail_a", {recipientAccountId: ""})});
  assert.equal(invalidRecipient.ok, false);

  const baseline = readMailAuthorityState({mail_a: mail("mail_a")}).messages;
  const left = stageMailAuthorityUpsert(baseline, {...mail("mail_a"), title: "左"}).messages;
  const right = stageMailAuthorityUpsert(baseline, {...mail("mail_a"), title: "右"}).messages;
  commitMailAuthorityDelta(left);
  assert.throws(
    () => commitMailAuthorityDelta(right),
    (error) => error && error.code === "mail_authority_commit_conflict",
  );
});

test("mail authority materializes an ordinary isolated object", () => {
  const baseline = readMailAuthorityState({mail_a: mail("mail_a")}).messages;
  const inserted = stageMailAuthorityUpsert(baseline, mail("mail_b")).messages;
  const materialized = materializeMailAuthorityState(inserted);
  assert.equal(materialized.ok, true);
  assert.deepEqual(Object.keys(materialized.messages), ["mail_a", "mail_b"]);
  assert.equal(isCanonicalMailAuthorityState(materialized.messages), false);
  materialized.messages.mail_a.title = "只改导出副本";
  assert.equal(inserted.mail_a.title, "mail_a");
});

test("mail authority checkpoints bounded history while old views keep their snapshot", () => {
  const ancient = readMailAuthorityState({mail_a: mail("mail_a")}).messages;
  let current = ancient;
  assert.deepEqual(Object.keys(current), ["mail_a"]);
  for (let revision = 1; revision <= MAIL_AUTHORITY_CHECKPOINT_HISTORY_MAX + 1; revision += 1) {
    current = stageMailAuthorityUpsert(current, {
      ...mail("mail_a"),
      title: `版本${revision}`,
    }).messages;
    commitMailAuthorityDelta(current);
  }

  const diagnostics = mailAuthorityDiagnostics(current);
  assert.equal(diagnostics.checkpointCount, 1);
  assert.equal(diagnostics.checkpointLastScannedMailIds, 1);
  assert.equal(diagnostics.ownKeyEnumerations, 1);
  assert.equal(diagnostics.historyEntryCount, 1);
  assert.equal(diagnostics.deadKeyCount, 0);
  assert.equal(diagnostics.trackedMailIds, 1);
  assert.equal(ancient.mail_a.title, "mail_a");
  assert.equal(current.mail_a.title, `版本${MAIL_AUTHORITY_CHECKPOINT_HISTORY_MAX + 1}`);
});

test("mail authority checkpoint releases deleted mail bodies from the current lineage", () => {
  let current = readMailAuthorityState({}).messages;
  let oldWithMail = null;
  const cycles = MAIL_AUTHORITY_CHECKPOINT_HISTORY_MAX / 2;
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    current = stageMailAuthorityUpsert(current, mail("mail_churn", {
      body: `含附件语义的历史正文${cycle}`,
    })).messages;
    commitMailAuthorityDelta(current);
    oldWithMail = current;
    current = stageMailAuthorityDelete(current, "mail_churn").messages;
    commitMailAuthorityDelta(current);
  }

  const diagnostics = mailAuthorityDiagnostics(current);
  assert.equal(diagnostics.checkpointCount, 1);
  assert.equal(diagnostics.checkpointLastScannedMailIds, 1);
  assert.equal(diagnostics.checkpointScannedMailIds, 1);
  assert.equal(diagnostics.historyEntryCount, 0);
  assert.equal(diagnostics.deadKeyCount, 0);
  assert.equal(diagnostics.trackedMailIds, 0);
  assert.equal(Object.hasOwn(current, "mail_churn"), false);
  assert.equal(oldWithMail.mail_churn.body, `含附件语义的历史正文${cycles - 1}`);
});
