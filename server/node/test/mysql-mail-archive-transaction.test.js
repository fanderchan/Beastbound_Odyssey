"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  runMysqlMailArchiveBatch,
} = require("../src/mysql-mail-archive");
const {
  projectActiveMailIdentityRow,
} = require("../src/mysql-mail-storage-forward-maintenance");

const RECIPIENT = "account_archive_tx";
const SETTLED_AT = "2026-05-01T00:00:00.000Z";
const ARCHIVED_AT = "2026-05-31T00:00:00.000Z";
const MYSQL_SESSION_POLICY_SQL =
  "SET SESSION innodb_lock_wait_timeout = ?, SESSION lock_wait_timeout = ?";

function mail(overrides = {}) {
  return {
    mailId: "mail_archive_tx",
    mailKind: "system",
    senderAccountId: "account_sender",
    senderUsername: "system",
    senderDisplayName: "系统",
    recipientAccountId: RECIPIENT,
    recipientUsername: "recipient",
    recipientDisplayName: "收件人",
    title: "事务归档",
    body: "已结算。",
    items: [],
    equipmentEnvelopes: [],
    currency: {},
    createdAt: "2026-04-01T00:00:00.000Z",
    readAt: SETTLED_AT,
    settledAt: SETTLED_AT,
    schemaVersion: 2,
    ...overrides,
  };
}

function stateFixture(options = {}) {
  const document = mail(options.mailOverrides || {});
  const projected = projectActiveMailIdentityRow({mail: document, settledAt: SETTLED_AT, revision: 5});
  return {
    control: {
      scope_key: "mail_lifecycle",
      schema_generation: 1,
      data_generation: 1,
      lifecycle_state: "ready",
      archive_enabled: 1,
      vault_claim_enabled: 0,
      active_limit_enabled: 0,
    },
    counter: {
      recipient_account_id: RECIPIENT,
      active_count: 1,
      data_generation: 1,
      revision: 9,
    },
    identity: {
      mail_id: projected.mailId,
      sender_account_id: projected.senderAccountId,
      recipient_account_id: projected.recipientAccountId,
      location: "active",
      created_at: projected.createdAt,
      settled_at: projected.settledAt,
      archived_at: null,
      identity_digest: projected.identityDigest,
      document_digest: projected.documentDigest,
      reward_id: null,
      data_generation: 1,
      revision: projected.revision,
    },
    active: {
      mail_id: document.mailId,
      sender_account_id: document.senderAccountId,
      recipient_account_id: document.recipientAccountId,
      title: document.title,
      created_at: document.createdAt,
      read_at: document.readAt,
      document_json: structuredClone(document),
    },
    archive: null,
  };
}

function cloneState(value) {
  return structuredClone(value);
}

function archivePool(initialState = stateFixture(), options = {}) {
  const shared = cloneState(initialState);
  const metrics = {acquisitions: 0, transactions: []};
  return {
    shared,
    metrics,
    pool: {
      async getConnection() {
        metrics.acquisitions += 1;
        let working = cloneState(shared);
        const tx = {queries: [], begun: 0, committed: 0, rolledBack: 0, released: 0, destroyed: 0};
        metrics.transactions.push(tx);
        return {
          async query(statement, params = []) {
            const sql = String(statement).trim().replace(/\s+/g, " ");
            if (sql === MYSQL_SESSION_POLICY_SQL) {
              assert.deepEqual(params, [3, 5]);
              return [{affectedRows: 0}, []];
            }
            tx.queries.push({sql, params: structuredClone(params)});
            if (/^SET TRANSACTION ISOLATION LEVEL REPEATABLE READ$/i.test(sql)) {
              return [{affectedRows: 0}, []];
            }
            if (/^SELECT scope_key, schema_generation/i.test(sql)) {
              return [[cloneState(working.control)], []];
            }
            if (/^SELECT mail_id, recipient_account_id FROM mail_identity_registry/i.test(sql)) {
              const cutoffAt = params[0];
              return [working.identity
                && (working.identity.location === "active" || options.staleCandidates === true)
                && working.identity.settled_at <= cutoffAt
                ? [{mail_id: working.identity.mail_id, recipient_account_id: RECIPIENT}]
                : [], []];
            }
            if (/^SELECT recipient_account_id, active_count/i.test(sql)) {
              return [working.counter ? [cloneState(working.counter)] : [], []];
            }
            if (/^SELECT mail_id, sender_account_id/i.test(sql) && /FROM mail_identity_registry/i.test(sql)) {
              return [working.identity ? [cloneState(working.identity)] : [], []];
            }
            if (/^SELECT mail_id, sender_account_id/i.test(sql) && /FROM mail_messages/i.test(sql)) {
              return [working.active ? [cloneState(working.active)] : [], []];
            }
            if (/^SELECT mail_id, sender_account_id/i.test(sql) && /FROM mail_archive_messages/i.test(sql)) {
              return [working.archive ? [cloneState(working.archive)] : [], []];
            }
            if (/^INSERT INTO mail_archive_messages/i.test(sql)) {
              if (working.archive) return [{affectedRows: 0}, []];
              working.archive = {
                mail_id: params[0],
                sender_account_id: params[1],
                recipient_account_id: params[2],
                title: params[3],
                created_at: params[4],
                read_at: params[5],
                settled_at: params[6],
                archived_at: params[7],
                archive_generation: 1,
                document_json: JSON.parse(params[8]),
              };
              return [{affectedRows: 1}, []];
            }
            if (/^UPDATE mail_identity_registry SET location = 'archive'/i.test(sql)) {
              if (!working.identity || working.identity.location !== "active") {
                return [{affectedRows: 0}, []];
              }
              working.identity.location = "archive";
              working.identity.archived_at = params[0];
              working.identity.revision += 1;
              return [{affectedRows: 1}, []];
            }
            if (/^DELETE FROM mail_messages/i.test(sql)) {
              if (!working.active) return [{affectedRows: 0}, []];
              working.active = null;
              return [{affectedRows: 1}, []];
            }
            if (/^UPDATE mail_active_counters/i.test(sql)) {
              if (!working.counter || working.counter.active_count !== params[2]) {
                return [{affectedRows: 0}, []];
              }
              working.counter.active_count -= params[0];
              working.counter.revision += 1;
              return [{affectedRows: 1}, []];
            }
            throw new Error(`unexpected archive transaction SQL: ${sql}`);
          },
          async beginTransaction() { tx.begun += 1; working = cloneState(shared); },
          async commit() {
            Object.assign(shared, cloneState(working));
            tx.committed += 1;
            if (options.ambiguousCommit === true && metrics.transactions.length === 1) {
              const error = new Error("lost commit response");
              error.code = "PROTOCOL_CONNECTION_LOST";
              throw error;
            }
          },
          async rollback() { tx.rolledBack += 1; working = cloneState(shared); },
          release() { tx.released += 1; },
          destroy() { tx.destroyed += 1; },
        };
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

test("archive transaction follows control-counter-identity-mail locks and commits all four writes", async () => {
  const fake = archivePool();
  const report = await runMysqlMailArchiveBatch(fake.pool, {
    now: () => new Date(ARCHIVED_AT),
    limit: 64,
    certifyAttachment: attachment,
  });
  assert.equal(report.ok, true);
  assert.equal(report.archivedCount, 1);
  assert.equal(fake.shared.active, null);
  assert.equal(fake.shared.identity.location, "archive");
  assert.equal(fake.shared.counter.active_count, 0);
  assert.equal(fake.shared.archive.mail_id, "mail_archive_tx");
  const queries = fake.metrics.transactions[0].queries.map(({sql}) => sql);
  const positions = [
    queries.findIndex((sql) => /^SELECT scope_key/i.test(sql)),
    queries.findIndex((sql) => /^SELECT recipient_account_id, active_count/i.test(sql)),
    queries.findIndex((sql) => /^SELECT mail_id, sender_account_id/i.test(sql) && /mail_identity_registry/i.test(sql)),
    queries.findIndex((sql) => /^SELECT mail_id, sender_account_id/i.test(sql) && /FROM mail_messages/i.test(sql)),
  ];
  assert.deepEqual([...positions].sort((left, right) => left - right), positions);
  assert.ok(positions.every((position) => position >= 0));
  assert.equal(fake.metrics.transactions[0].committed, 1);
  assert.equal(fake.metrics.transactions[0].rolledBack, 0);
});

test("candidate discovery and every multi-row entity lock share one binary key order", async () => {
  const fake = archivePool();
  await runMysqlMailArchiveBatch(fake.pool, {
    now: () => new Date(ARCHIVED_AT),
    certifyAttachment: attachment,
  });
  const sql = fake.metrics.transactions[0].queries.map((entry) => entry.sql).join("\n");
  assert.match(sql, /ORDER BY settled_at COLLATE utf8mb4_bin, mail_id COLLATE utf8mb4_bin/i);
  assert.match(sql, /mail_identity_registry[\s\S]+ORDER BY mail_id COLLATE utf8mb4_bin FOR UPDATE/i);
  assert.match(sql, /FROM mail_messages[\s\S]+ORDER BY mail_id COLLATE utf8mb4_bin FOR UPDATE/i);
});

test("empty eligible set rolls back and performs no writes", async () => {
  const initial = stateFixture();
  initial.identity.settled_at = "2026-05-01T00:00:00.001Z";
  const fake = archivePool(initial);
  const report = await runMysqlMailArchiveBatch(fake.pool, {
    now: () => new Date(ARCHIVED_AT),
    certifyAttachment: attachment,
  });
  assert.equal(report.code, "mail_archive_batch_empty");
  assert.equal(fake.metrics.transactions[0].committed, 0);
  assert.equal(fake.metrics.transactions[0].rolledBack, 1);
  assert.equal(fake.shared.active.mail_id, "mail_archive_tx");
  assert.equal(fake.shared.archive, null);
});

test("eligibility failure rolls back archive insert and leaves all active state intact", async () => {
  const initial = stateFixture({mailOverrides: {items: [{itemId: "capture_tool_basic", count: 1}]}});
  const fake = archivePool(initial);
  await assert.rejects(
    runMysqlMailArchiveBatch(fake.pool, {
      now: () => new Date(ARCHIVED_AT),
      certifyAttachment: attachment,
    }),
    (error) => error
      && error.code === "mail_archive_mail_not_eligible"
      && error.noCommitGuaranteed === true,
  );
  assert.equal(fake.metrics.transactions[0].committed, 0);
  assert.equal(fake.metrics.transactions[0].rolledBack, 1);
  assert.equal(fake.shared.active.mail_id, "mail_archive_tx");
  assert.equal(fake.shared.identity.location, "active");
  assert.equal(fake.shared.counter.active_count, 1);
  assert.equal(fake.shared.archive, null);
});

test("lost COMMIT response is recovered only from exact independent current reads", async () => {
  const fake = archivePool(stateFixture(), {ambiguousCommit: true});
  const report = await runMysqlMailArchiveBatch(fake.pool, {
    now: () => new Date(ARCHIVED_AT),
    certifyAttachment: attachment,
  });
  assert.equal(report.ok, true);
  assert.equal(report.code, "mail_archive_batch_commit_recovered");
  assert.equal(report.recovered, true);
  assert.equal(fake.metrics.acquisitions, 2);
  assert.equal(fake.metrics.transactions[0].destroyed, 1);
  assert.equal(fake.metrics.transactions[1].rolledBack, 1);
  assert.equal(fake.shared.identity.location, "archive");
});

test("a stale candidate is retired only after exact archive and permanent identity certification", async () => {
  const fake = archivePool(stateFixture(), {staleCandidates: true});
  const first = await runMysqlMailArchiveBatch(fake.pool, {
    now: () => new Date(ARCHIVED_AT),
    certifyAttachment: attachment,
  });
  assert.deepEqual(first.retiredMailIds, ["mail_archive_tx"]);

  const second = await runMysqlMailArchiveBatch(fake.pool, {
    now: () => new Date(ARCHIVED_AT),
    certifyAttachment: attachment,
  });
  assert.equal(second.code, "mail_archive_batch_concurrent_noop");
  assert.equal(second.archivedCount, 0);
  assert.deepEqual(second.archivedMailIds, []);
  assert.deepEqual(second.retiredMailIds, ["mail_archive_tx"]);
  assert.equal(fake.metrics.transactions[1].committed, 0);
  assert.equal(fake.metrics.transactions[1].rolledBack, 1);

  fake.shared.archive.title = "tampered";
  await assert.rejects(
    runMysqlMailArchiveBatch(fake.pool, {
      now: () => new Date(ARCHIVED_AT),
      certifyAttachment: attachment,
    }),
    (error) => error
      && error.code === "mail_archive_archive_row_drift"
      && error.noCommitGuaranteed === true,
  );
});
