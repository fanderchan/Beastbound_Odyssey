"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  certifyMailArchiveEligibility,
  classifyMailArchiveRecoveryForTest,
} = require("../src/mysql-mail-archive");
const {
  projectActiveMailIdentityRow,
} = require("../src/mysql-mail-storage-forward-maintenance");

const SETTLED_AT = "2026-05-01T00:00:00.000Z";
const ARCHIVED_AT = "2026-05-31T00:00:00.000Z";

function mail() {
  return {
    mailId: "mail_archive_recovery",
    mailKind: "system",
    senderAccountId: "account_sender",
    senderUsername: "system",
    senderDisplayName: "系统",
    recipientAccountId: "account_recipient",
    recipientUsername: "recipient",
    recipientDisplayName: "收件人",
    title: "归档恢复",
    body: "精确判断提交结果。",
    items: [],
    equipmentEnvelopes: [],
    currency: {},
    createdAt: "2026-04-01T00:00:00.000Z",
    readAt: SETTLED_AT,
    settledAt: SETTLED_AT,
    schemaVersion: 2,
  };
}

function attachment() {
  return {ok: true, items: [], equipmentEnvelopes: [], currency: {}};
}

function fixture() {
  const document = mail();
  const projected = projectActiveMailIdentityRow({mail: document, settledAt: SETTLED_AT, revision: 4});
  const activeRow = {
    mail_id: document.mailId,
    sender_account_id: document.senderAccountId,
    recipient_account_id: document.recipientAccountId,
    title: document.title,
    created_at: document.createdAt,
    read_at: document.readAt,
    document_json: structuredClone(document),
  };
  const identityRow = {
    mail_id: projected.mailId,
    sender_account_id: projected.senderAccountId,
    recipient_account_id: projected.recipientAccountId,
    location: projected.location,
    created_at: projected.createdAt,
    settled_at: projected.settledAt,
    archived_at: projected.archivedAt,
    identity_digest: projected.identityDigest,
    document_digest: projected.documentDigest,
    reward_id: projected.rewardId,
    data_generation: projected.dataGeneration,
    revision: projected.revision,
  };
  const fact = certifyMailArchiveEligibility({
    mailRow: activeRow,
    identityRow,
    cutoffAt: SETTLED_AT,
    archivedAt: ARCHIVED_AT,
    certifyAttachment: attachment,
  });
  const expected = {
    archivedAt: ARCHIVED_AT,
    archiveFacts: [fact],
    counters: [{
      recipientAccountId: document.recipientAccountId,
      before: {
        recipientAccountId: document.recipientAccountId,
        activeCount: 4,
        dataGeneration: 1,
        revision: 8,
      },
      after: {
        recipientAccountId: document.recipientAccountId,
        activeCount: 3,
        dataGeneration: 1,
        revision: 9,
      },
    }],
  };
  const archiveRow = {
    ...activeRow,
    settled_at: SETTLED_AT,
    archived_at: ARCHIVED_AT,
    archive_generation: 1,
  };
  const archivedIdentityRow = {
    ...identityRow,
    location: "archive",
    archived_at: ARCHIVED_AT,
    revision: identityRow.revision + 1,
  };
  return {expected, activeRow, identityRow, archiveRow, archivedIdentityRow};
}

function counterRow(value) {
  return {
    recipient_account_id: value.recipientAccountId,
    active_count: value.activeCount,
    data_generation: value.dataGeneration,
    revision: value.revision,
  };
}

test("recovery proves exact committed and exact not-committed states", () => {
  const value = fixture();
  assert.equal(classifyMailArchiveRecoveryForTest(value.expected, {
    identityRows: [value.archivedIdentityRow],
    activeRows: [],
    archiveRows: [value.archiveRow],
    counterRows: [counterRow(value.expected.counters[0].after)],
  }), "committed");
  assert.equal(classifyMailArchiveRecoveryForTest(value.expected, {
    identityRows: [value.identityRow],
    activeRows: [value.activeRow],
    archiveRows: [],
    counterRows: [counterRow(value.expected.counters[0].before)],
  }), "not_committed");
});

test("recovery never guesses on partial, replacement, or different archive timestamp", () => {
  const value = fixture();
  for (const observed of [
    {
      identityRows: [value.archivedIdentityRow],
      activeRows: [value.activeRow],
      archiveRows: [value.archiveRow],
      counterRows: [counterRow(value.expected.counters[0].after)],
    },
    {
      identityRows: [value.archivedIdentityRow],
      activeRows: [],
      archiveRows: [{...value.archiveRow, archived_at: "2026-06-01T00:00:00.000Z"}],
      counterRows: [counterRow(value.expected.counters[0].after)],
    },
    {
      identityRows: [value.identityRow],
      activeRows: [],
      archiveRows: [],
      counterRows: [counterRow(value.expected.counters[0].before)],
    },
  ]) {
    assert.equal(classifyMailArchiveRecoveryForTest(value.expected, observed), "unknown");
  }
});
