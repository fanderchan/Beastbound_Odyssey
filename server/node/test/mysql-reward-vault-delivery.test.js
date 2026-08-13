"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {createRewardVaultEntry} = require("../src/auth/reward-vault-state");
const {
  rewardNotificationMail,
  runMysqlRewardVaultDeliveryBatch,
} = require("../src/mysql-reward-vault-delivery");
const {projectActiveMailIdentityRow} = require("../src/mysql-mail-storage-forward-maintenance");

const DELIVERED_AT = "2026-08-13T04:00:00.000Z";
const RECIPIENT = "account_reward_delivery";
const SESSION_SQL = "SET SESSION innodb_lock_wait_timeout = ?, SESSION lock_wait_timeout = ?";

function certifyAttachment(mail) {
  return {
    ok: true,
    items: structuredClone(mail.items || []),
    ordinaryItems: structuredClone(mail.items || []),
    equipmentItems: [],
    equipmentEnvelopes: structuredClone(mail.equipmentEnvelopes || []),
    currency: structuredClone(mail.currency || {}),
  };
}

function reward() {
  return createRewardVaultEntry({
    sourceKind: "market_sale",
    sourceKey: "source_delivery_1",
    recipientAccountId: RECIPIENT,
    recipientUsername: "delivery_player",
    recipientDisplayName: "投递玩家",
    title: "拍卖行成交收益",
    body: "成交收益已安全存入奖励仓。",
    items: [],
    currency: {stoneCoins: 39},
    createdAt: "2026-08-13T03:00:00.000Z",
  }, {certifyAttachment});
}

function physicalReward(entry) {
  return {
    reward_id: entry.rewardId,
    source_key: entry.sourceKey,
    source_kind: entry.sourceKind,
    source_digest: entry.sourceDigest,
    recipient_account_id: entry.recipientAccountId,
    status: entry.status,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
    delivered_at: entry.deliveredAt,
    claimed_at: entry.claimedAt,
    delivered_mail_id: entry.deliveredMailId,
    data_generation: entry.dataGeneration,
    revision: entry.revision,
    document_json: structuredClone(entry.document),
  };
}

function fixture(options = {}) {
  const entry = reward();
  const shared = {
    control: {
      scope_key: "mail_lifecycle",
      schema_generation: 1,
      data_generation: 1,
      lifecycle_state: "ready",
      archive_enabled: 1,
      vault_claim_enabled: 1,
      active_limit_enabled: 0,
    },
    counter: {
      recipient_account_id: RECIPIENT,
      active_count: Number(options.activeCount ?? 199),
      data_generation: 1,
      revision: 8,
    },
    reward: physicalReward(entry),
    identity: null,
    mail: null,
  };
  const transactions = [];
  return {
    entry,
    shared,
    transactions,
    pool: {
      async getConnection() {
        let working = structuredClone(shared);
        const trace = {queries: [], committed: 0, rolledBack: 0, destroyed: 0};
        transactions.push(trace);
        return {
          async query(statement, params = []) {
            const sql = String(statement).trim().replace(/\s+/g, " ");
            if (sql === SESSION_SQL) {
              assert.deepEqual(params, [3, 5]);
              return [{affectedRows: 0}, []];
            }
            trace.queries.push({sql, params: structuredClone(params)});
            if (/^SET TRANSACTION ISOLATION LEVEL REPEATABLE READ$/i.test(sql)) {
              return [{affectedRows: 0}, []];
            }
            if (/^SELECT scope_key, schema_generation/i.test(sql)) {
              return [[structuredClone(working.control)], []];
            }
            if (/^SELECT reward\.reward_id, reward\.recipient_account_id FROM reward_vault_entries AS reward/i.test(sql)) {
              return [working.reward && working.reward.status === "available"
                ? [{reward_id: working.reward.reward_id, recipient_account_id: RECIPIENT}]
                : [], []];
            }
            if (/^INSERT INTO mail_active_counters/i.test(sql)) return [{affectedRows: 0}, []];
            if (/^SELECT recipient_account_id, active_count/i.test(sql)) {
              return [[structuredClone(working.counter)], []];
            }
            if (/^SELECT reward_id, source_key/i.test(sql)) {
              return [working.reward ? [structuredClone(working.reward)] : [], []];
            }
            if (/^SELECT mail_id, sender_account_id/i.test(sql) && /FROM mail_identity_registry/i.test(sql)) {
              return [working.identity ? [structuredClone(working.identity)] : [], []];
            }
            if (/^SELECT mail_id, sender_account_id/i.test(sql) && /FROM mail_messages/i.test(sql)) {
              return [working.mail ? [structuredClone(working.mail)] : [], []];
            }
            if (/^UPDATE reward_vault_entries SET status = 'mail_delivered'/i.test(sql)) {
              if (!working.reward || working.reward.status !== "available") return [{affectedRows: 0}, []];
              working.reward.status = "mail_delivered";
              working.reward.updated_at = params[0];
              working.reward.delivered_at = params[1];
              working.reward.delivered_mail_id = params[2];
              working.reward.revision += 1;
              return [{affectedRows: 1}, []];
            }
            if (/^INSERT INTO mail_identity_registry/i.test(sql)) {
              if (working.identity) return [{affectedRows: 0}, []];
              working.identity = {
                mail_id: params[0], sender_account_id: params[1], recipient_account_id: params[2],
                location: "active", created_at: params[3], settled_at: params[4], archived_at: null,
                identity_digest: params[5], document_digest: params[6], reward_id: params[7],
                data_generation: 1, revision: 0,
              };
              return [{affectedRows: 1}, []];
            }
            if (/^INSERT INTO mail_messages/i.test(sql)) {
              if (working.mail) return [{affectedRows: 0}, []];
              working.mail = {
                mail_id: params[0], sender_account_id: params[1], recipient_account_id: params[2],
                title: params[3], created_at: params[4], read_at: params[5],
                document_json: JSON.parse(params[6]),
              };
              return [{affectedRows: 1}, []];
            }
            if (/^UPDATE mail_active_counters/i.test(sql)) {
              if (working.counter.active_count !== params[2]
                || working.counter.active_count + params[3] > 200) return [{affectedRows: 0}, []];
              working.counter.active_count += params[0];
              working.counter.revision += 1;
              return [{affectedRows: 1}, []];
            }
            throw new Error(`unexpected delivery SQL: ${sql}`);
          },
          async beginTransaction() { working = structuredClone(shared); },
          async commit() {
            Object.assign(shared, structuredClone(working));
            trace.committed += 1;
            if (options.ambiguousCommit && transactions.length === 1) {
              const error = new Error("lost commit response");
              error.code = "PROTOCOL_CONNECTION_LOST";
              throw error;
            }
          },
          async rollback() { working = structuredClone(shared); trace.rolledBack += 1; },
          release() {},
          destroy() { trace.destroyed += 1; },
        };
      },
    },
  };
}

test("199 active mails delivers one empty notice and preserves reward identity", async () => {
  const fake = fixture();
  const report = await runMysqlRewardVaultDeliveryBatch(fake.pool, {
    now: () => new Date(DELIVERED_AT),
    certifyAttachment,
  });
  assert.equal(report.ok, true);
  assert.equal(report.deliveredCount, 1);
  assert.equal(fake.shared.counter.active_count, 200);
  assert.equal(fake.shared.reward.status, "mail_delivered");
  const expectedMail = rewardNotificationMail(fake.entry, DELIVERED_AT);
  assert.deepEqual(fake.shared.mail.document_json, expectedMail);
  assert.equal(fake.shared.mail.document_json.items.length, 0);
  assert.deepEqual(fake.shared.mail.document_json.currency, {});
  assert.equal(fake.shared.identity.reward_id, fake.entry.rewardId);
  const candidateQuery = fake.transactions[0].queries.find(({sql}) => (
    /FROM reward_vault_entries AS reward/i.test(sql)
  ));
  assert.match(candidateQuery.sql, /LEFT JOIN mail_active_counters AS counter/i);
  assert.match(candidateQuery.sql, /COALESCE\(counter\.active_count, 0\) >= 200/i);
  assert.match(candidateQuery.sql, /ORDER BY \(COALESCE\(counter\.active_count, 0\) >= 200\) ASC/i);
  assert.deepEqual(
    projectActiveMailIdentityRow({
      mail: expectedMail,
      settledAt: DELIVERED_AT,
      rewardId: fake.entry.rewardId,
      revision: 0,
    }).documentDigest,
    fake.shared.identity.document_digest,
  );
});

test("200 active mails writes nothing and leaves reward available", async () => {
  const fake = fixture({activeCount: 200});
  const report = await runMysqlRewardVaultDeliveryBatch(fake.pool, {
    now: () => new Date(DELIVERED_AT),
    certifyAttachment,
  });
  assert.equal(report.ok, true);
  assert.equal(report.deliveredCount, 0);
  assert.equal(report.skippedRecipientCount, 1);
  assert.equal(fake.shared.reward.status, "available");
  assert.equal(fake.shared.identity, null);
  assert.equal(fake.shared.mail, null);
  assert.equal(fake.transactions[0].committed, 0);
  assert.equal(fake.transactions[0].rolledBack, 1);
});

test("ambiguous COMMIT is recovered only from exact reward, mail, identity and counter", async () => {
  const fake = fixture({ambiguousCommit: true});
  const report = await runMysqlRewardVaultDeliveryBatch(fake.pool, {
    now: () => new Date(DELIVERED_AT),
    certifyAttachment,
  });
  assert.equal(report.ok, true);
  assert.equal(report.recovered, true);
  assert.equal(report.code, "reward_vault_delivery_batch_commit_recovered");
  assert.equal(fake.transactions.length, 2);
  assert.equal(fake.shared.counter.active_count, 200);
});
