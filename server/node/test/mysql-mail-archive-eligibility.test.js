"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  canonicalMailArchiveCutoff,
  certifyMailArchiveEligibility,
} = require("../src/mysql-mail-archive");
const {
  projectActiveMailIdentityRow,
} = require("../src/mysql-mail-storage-forward-maintenance");

const CREATED_AT = "2026-04-01T00:00:00.000Z";
const SETTLED_AT = "2026-05-01T00:00:00.000Z";
const ARCHIVED_AT = "2026-05-31T00:00:00.000Z";

function mail(overrides = {}) {
  const result = {
    mailId: "mail_archive_eligible",
    mailKind: "player",
    senderAccountId: "account_sender",
    senderUsername: "sender",
    senderDisplayName: "寄件人",
    recipientAccountId: "account_recipient",
    recipientUsername: "recipient",
    recipientDisplayName: "收件人",
    title: "已结算回执",
    body: "没有任何待领取资产。",
    items: [],
    equipmentEnvelopes: [],
    currency: {},
    createdAt: CREATED_AT,
    readAt: SETTLED_AT,
    settledAt: SETTLED_AT,
    schemaVersion: 2,
    ...overrides,
  };
  if (Object.hasOwn(overrides, "settledAt") && overrides.settledAt === undefined) {
    delete result.settledAt;
  }
  return result;
}

function attachment(value) {
  return {
    ok: true,
    items: structuredClone(value.items || []),
    equipmentEnvelopes: structuredClone(value.equipmentEnvelopes || []),
    currency: structuredClone(value.currency || {}),
  };
}

function rows(document = mail(), overrides = {}, projectedSettledAt = document.settledAt) {
  const projected = projectActiveMailIdentityRow({
    mail: document,
    settledAt: projectedSettledAt,
    revision: 7,
  });
  return {
    mailRow: {
      mail_id: document.mailId,
      sender_account_id: document.senderAccountId,
      recipient_account_id: document.recipientAccountId,
      title: document.title,
      created_at: document.createdAt,
      read_at: document.readAt,
      document_json: structuredClone(document),
    },
    identityRow: {
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
      ...overrides,
    },
  };
}

test("archive cutoff is exactly thirty UTC days and boundary is inclusive", () => {
  assert.equal(canonicalMailArchiveCutoff(ARCHIVED_AT), SETTLED_AT);
  const input = rows();
  const result = certifyMailArchiveEligibility({
    ...input,
    archivedAt: ARCHIVED_AT,
    cutoffAt: SETTLED_AT,
    certifyAttachment: attachment,
  });
  assert.equal(result.mail.mailId, "mail_archive_eligible");
  assert.equal(result.settledAt, SETTLED_AT);
  assert.equal(result.identity.revision, 7);
});

test("pending assets, under-age settlement, and legacy empty mail never qualify", () => {
  const assetMail = mail({items: [{itemId: "capture_tool_basic", count: 1}]});
  const cases = [
    {
      input: rows(assetMail),
      cutoffAt: SETTLED_AT,
    },
    {
      input: rows(),
      cutoffAt: "2026-04-30T23:59:59.999Z",
    },
    {
      input: rows(mail({settledAt: undefined}), {}, null),
      cutoffAt: SETTLED_AT,
    },
  ];
  for (const fixture of cases) {
    assert.throws(
      () => certifyMailArchiveEligibility({
        ...fixture.input,
        archivedAt: ARCHIVED_AT,
        cutoffAt: fixture.cutoffAt,
        certifyAttachment: attachment,
      }),
      (error) => error && /^mail_archive_/.test(error.code),
    );
  }
});

test("identity digest, document digest, location, and generation are exact fences", () => {
  for (const overrides of [
    {location: "archive"},
    {document_digest: "f".repeat(64)},
    {identity_digest: "e".repeat(64)},
    {archived_at: ARCHIVED_AT},
    {data_generation: 2},
  ]) {
    const input = rows(mail(), overrides);
    assert.throws(
      () => certifyMailArchiveEligibility({
        ...input,
        archivedAt: ARCHIVED_AT,
        cutoffAt: SETTLED_AT,
        certifyAttachment: attachment,
      }),
      (error) => error && error.code === "mail_archive_identity_drift",
    );
  }
});
