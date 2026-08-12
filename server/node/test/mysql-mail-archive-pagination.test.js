"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  decodeMailArchiveCursor,
} = require("../src/auth/mail-archive-pagination");
const {
  projectActiveMailIdentityRow,
} = require("../src/mysql-mail-storage-forward-maintenance");
const {
  __runMysqlMailArchivePageReadForTest: runMysqlMailArchivePageRead,
} = require("../src/mysql-store");

const RECIPIENT = "account_archive_page";
const SETTLED_AT = "2026-05-01T00:00:00.000Z";
const ARCHIVED_AT = "2026-06-01T00:00:00.000Z";
const MYSQL_SESSION_POLICY_SQL =
  "SET SESSION innodb_lock_wait_timeout = ?, SESSION lock_wait_timeout = ?";

function mail(mailId, createdAt) {
  return {
    mailId,
    mailKind: "system",
    senderAccountId: "account_archive_sender",
    senderUsername: "system",
    senderDisplayName: "系统",
    recipientAccountId: RECIPIENT,
    recipientUsername: "archive_page",
    recipientDisplayName: "归档玩家",
    title: `归档 ${mailId}`,
    body: "只读邮件。",
    items: [],
    equipmentEnvelopes: [],
    currency: {},
    createdAt,
    readAt: SETTLED_AT,
    settledAt: SETTLED_AT,
    schemaVersion: 2,
  };
}

function archiveRow(document) {
  return {
    mail_id: document.mailId,
    sender_account_id: document.senderAccountId,
    recipient_account_id: document.recipientAccountId,
    title: document.title,
    created_at: document.createdAt,
    read_at: document.readAt,
    settled_at: document.settledAt,
    archived_at: ARCHIVED_AT,
    archive_generation: 1,
    document_json: structuredClone(document),
  };
}

function identityRow(document, overrides = {}) {
  const identity = projectActiveMailIdentityRow({
    mail: document,
    settledAt: document.settledAt,
    revision: 3,
  });
  return {
    mail_id: identity.mailId,
    sender_account_id: identity.senderAccountId,
    recipient_account_id: identity.recipientAccountId,
    location: "archive",
    created_at: identity.createdAt,
    settled_at: identity.settledAt,
    archived_at: ARCHIVED_AT,
    identity_digest: identity.identityDigest,
    document_digest: identity.documentDigest,
    reward_id: null,
    data_generation: 1,
    revision: identity.revision,
    ...overrides,
  };
}

function recordingPool(pageRows, identityRows) {
  const state = {queries: [], acquisitions: 0, begun: 0, rolledBack: 0, committed: 0, released: 0};
  const connection = {
    async query(statement, params = []) {
      const sql = String(statement && statement.sql || statement).trim().replace(/\s+/g, " ");
      if (sql === MYSQL_SESSION_POLICY_SQL) {
        assert.deepEqual(params, [3, 5]);
        return [{affectedRows: 0}, []];
      }
      state.queries.push({sql, params: structuredClone(params)});
      if (/^SET TRANSACTION ISOLATION LEVEL REPEATABLE READ$/i.test(sql)) {
        return [{affectedRows: 0}, []];
      }
      if (/^SELECT scope_key, schema_generation/i.test(sql)) {
        return [[{
          scope_key: "mail_lifecycle",
          schema_generation: 1,
          data_generation: 1,
          lifecycle_state: "ready",
          archive_enabled: 1,
          vault_claim_enabled: 0,
          active_limit_enabled: 0,
        }], []];
      }
      if (/FROM mail_archive_messages/i.test(sql)) return [pageRows, []];
      if (/FROM mail_identity_registry/i.test(sql)) return [identityRows, []];
      throw new Error(`unexpected archive page SQL: ${sql}`);
    },
    async beginTransaction() { state.begun += 1; },
    async rollback() { state.rolledBack += 1; },
    async commit() { state.committed += 1; },
    release() { state.released += 1; },
    destroy() {},
  };
  return {
    state,
    pool: {
      async getConnection() {
        state.acquisitions += 1;
        return connection;
      },
    },
  };
}

function attachment(value) {
  return {
    ok: true,
    items: structuredClone(value.items || []),
    equipmentEnvelopes: structuredClone(value.equipmentEnvelopes || []),
    currency: structuredClone(value.currency || {}),
  };
}

test("archive page uses recipient keyset, limit+1, immutable registry certification, and rollback", async () => {
  const newest = mail("mail_archive_z", "2026/04/30 10:00:00");
  const older = mail("mail_archive_y", "2026/04/29 10:00:00");
  const fake = recordingPool(
    [archiveRow(newest), archiveRow(older)],
    [identityRow(newest), identityRow(older)],
  );
  const page = await runMysqlMailArchivePageRead(fake.pool, RECIPIENT, {
    limit: 1,
    cursor: null,
  }, {certifyAttachment: attachment});
  assert.deepEqual(page.archiveRows.map((entry) => entry.mail.mailId), [newest.mailId]);
  assert.equal(page.hasMore, true);
  assert.deepEqual(decodeMailArchiveCursor(page.nextCursor), {
    createdAt: newest.createdAt,
    mailId: newest.mailId,
  });
  const pageQuery = fake.state.queries.find(({sql}) => /FROM mail_archive_messages/i.test(sql));
  assert.match(pageQuery.sql, /WHERE recipient_account_id = \?/i);
  assert.match(pageQuery.sql, /ORDER BY created_at DESC, mail_id DESC LIMIT \?/i);
  assert.doesNotMatch(pageQuery.sql, /\bOFFSET\b/i);
  assert.deepEqual(pageQuery.params, [RECIPIENT, 2]);
  const identityQuery = fake.state.queries.find(({sql}) => /FROM mail_identity_registry/i.test(sql));
  assert.doesNotMatch(identityQuery.sql, /FOR UPDATE/i);
  assert.equal(fake.state.begun, 1);
  assert.equal(fake.state.rolledBack, 1);
  assert.equal(fake.state.committed, 0);
  assert.equal(fake.state.released, 1);
});

test("invalid archive cursor fails before pool acquisition", async () => {
  const fake = recordingPool([], []);
  await assert.rejects(
    runMysqlMailArchivePageRead(fake.pool, RECIPIENT, {
      limit: 1,
      cursor: "not-a-cursor",
    }, {certifyAttachment: attachment}),
    (error) => error && error.code === "mail_archive_pagination_invalid",
  );
  assert.equal(fake.state.acquisitions, 0);
});

test("archive page fails closed on active identity, missing transition revision, or identity digest drift", async () => {
  const document = mail("mail_archive_drift", "2026/04/30 10:00:00");
  for (const overrides of [
    {location: "active"},
    {revision: 0},
    {document_digest: "f".repeat(64)},
  ]) {
    const fake = recordingPool([archiveRow(document)], [identityRow(document, overrides)]);
    await assert.rejects(
      runMysqlMailArchivePageRead(fake.pool, RECIPIENT, {
        limit: 1,
        cursor: null,
      }, {certifyAttachment: attachment}),
      (error) => error && /^mysql_mail_archive_page_/.test(String(error.code || "")),
    );
    assert.equal(fake.state.rolledBack, 1);
    assert.equal(fake.state.committed, 0);
  }
});
