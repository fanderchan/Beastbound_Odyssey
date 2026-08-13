"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createRewardVaultEntry,
} = require("../src/auth/reward-vault-state");
const {
  decodeRewardVaultCursor,
} = require("../src/auth/reward-vault-pagination");
const {
  runMysqlRewardVaultEntryRead,
  runMysqlRewardVaultPageRead,
} = require("../src/mysql-reward-vault");

const RECIPIENT = "account_reward_page";
const MYSQL_SESSION_POLICY_SQL =
  "SET SESSION innodb_lock_wait_timeout = ?, SESSION lock_wait_timeout = ?";

function attachment(value) {
  return {
    ok: true,
    items: structuredClone(value.items || []),
    ordinaryItems: structuredClone(value.items || []),
    equipmentItems: [],
    equipmentEnvelopes: [],
    currency: structuredClone(value.currency || {}),
  };
}

function reward(sourceKey, createdAt, overrides = {}) {
  return createRewardVaultEntry({
    sourceKind: "market_sale",
    sourceKey,
    recipientAccountId: RECIPIENT,
    recipientUsername: "reward_page",
    recipientDisplayName: "奖励玩家",
    title: `成交 ${sourceKey}`,
    body: "奖励已安全保存。",
    items: [],
    currency: {stoneCoins: 12},
    createdAt,
  }, {certifyAttachment: attachment, ...overrides});
}

function row(entry, overrides = {}) {
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
    ...overrides,
  };
}

function recordingPool(pageRows, options = {}) {
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
          archive_enabled: options.archiveEnabled ? 1 : 0,
          vault_claim_enabled: options.vaultDisabled ? 0 : 1,
          active_limit_enabled: 0,
        }], []];
      }
      if (/FROM reward_vault_entries/i.test(sql)) return [pageRows, []];
      throw new Error(`unexpected reward vault SQL: ${sql}`);
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

test("reward page uses recipient keyset, limit+1, strict certification, and rollback", async () => {
  const newest = reward("listing_z", "2026-08-13T02:00:00.000Z");
  const older = reward("listing_y", "2026-08-12T02:00:00.000Z");
  const fake = recordingPool([row(newest), row(older)], {archiveEnabled: true});
  const page = await runMysqlRewardVaultPageRead(fake.pool, RECIPIENT, {
    limit: 1,
    cursor: null,
  }, {certifyAttachment: attachment});
  assert.deepEqual(page.rewardRows.map(({rewardId}) => rewardId), [newest.rewardId]);
  assert.equal(page.hasMore, true);
  assert.deepEqual(decodeRewardVaultCursor(page.nextCursor), {
    createdAt: newest.createdAt,
    rewardId: newest.rewardId,
  });
  const query = fake.state.queries.find(({sql}) => /FROM reward_vault_entries/i.test(sql));
  assert.match(query.sql, /WHERE recipient_account_id = \?/i);
  assert.match(query.sql, /ORDER BY created_at DESC, reward_id DESC LIMIT \?/i);
  assert.doesNotMatch(query.sql, /\bOFFSET\b/i);
  assert.deepEqual(query.params, [RECIPIENT, 2]);
  assert.equal(fake.state.begun, 1);
  assert.equal(fake.state.rolledBack, 1);
  assert.equal(fake.state.committed, 0);
  assert.equal(fake.state.released, 1);
});

test("exact reward read is recipient scoped and returns null without inventing state", async () => {
  const entry = reward("listing_exact", "2026-08-13T03:00:00.000Z");
  const found = recordingPool([row(entry)]);
  assert.deepEqual(
    await runMysqlRewardVaultEntryRead(found.pool, RECIPIENT, entry.rewardId, {
      certifyAttachment: attachment,
    }),
    entry,
  );
  const query = found.state.queries.find(({sql}) => /FROM reward_vault_entries/i.test(sql));
  assert.match(query.sql, /recipient_account_id = \? AND reward_id = \?/i);
  assert.deepEqual(query.params, [RECIPIENT, entry.rewardId]);

  const missing = recordingPool([]);
  assert.equal(await runMysqlRewardVaultEntryRead(
    missing.pool,
    RECIPIENT,
    entry.rewardId,
    {certifyAttachment: attachment},
  ), null);
});

test("invalid request fails before pool acquisition and disabled or drifted data fails closed", async () => {
  const invalid = recordingPool([]);
  await assert.rejects(
    runMysqlRewardVaultPageRead(invalid.pool, RECIPIENT, {
      limit: 1,
      cursor: "not-a-cursor",
    }, {certifyAttachment: attachment}),
    (error) => error && error.code === "reward_vault_pagination_invalid",
  );
  assert.equal(invalid.state.acquisitions, 0);

  const disabled = recordingPool([], {vaultDisabled: true});
  await assert.rejects(
    runMysqlRewardVaultPageRead(disabled.pool, RECIPIENT, {
      limit: 1,
      cursor: null,
    }, {certifyAttachment: attachment}),
    (error) => error && error.code === "reward_vault_feature_disabled_or_drifted",
  );
  assert.equal(disabled.state.rolledBack, 1);

  const entry = reward("listing_drift", "2026-08-13T04:00:00.000Z");
  const drift = recordingPool([row(entry, {source_digest: "f".repeat(64)})]);
  await assert.rejects(
    runMysqlRewardVaultPageRead(drift.pool, RECIPIENT, {
      limit: 1,
      cursor: null,
    }, {certifyAttachment: attachment}),
    (error) => error && error.code === "reward_vault_integrity_invalid",
  );
  assert.equal(drift.state.rolledBack, 1);
});
