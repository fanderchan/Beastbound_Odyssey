"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createRewardVaultEntry,
} = require("../src/auth/reward-vault-state");
const {
  REWARD_VAULT_INSERT_SQL,
  buildMysqlResourceAcquisitionPlan,
  mysqlResourceWriteAffectedRowsAccepted,
} = require("../src/mysql-resource-acquisition-order");
const {
  __runMysqlPoolSavePlanForTest,
} = require("../src/mysql-store");
const {
  assertRewardVaultIssueWriteSet,
  buildRewardVaultIssueWriteSet,
} = require("../src/mysql-reward-vault-writes");

function certifyAttachment(mail) {
  return {
    ok: true,
    items: structuredClone(mail.items || []),
    ordinaryItems: structuredClone(mail.items || []),
    equipmentItems: [],
    equipmentEnvelopes: [],
    currency: structuredClone(mail.currency || {}),
  };
}

function storageState(overrides = {}) {
  return {
    controlFence: true,
    schemaGeneration: 1,
    dataGeneration: 1,
    lifecycleState: "ready",
    flags: {archive: false, vaultClaim: true, activeLimit: false},
    ...overrides,
  };
}

function entry(sourceKey = "listing_1", overrides = {}) {
  return createRewardVaultEntry({
    sourceKind: "market_sale",
    sourceKey,
    recipientAccountId: "account_reward_writer",
    recipientUsername: "rewardwriter",
    recipientDisplayName: "奖励写入员",
    title: "成交收益",
    body: "收益已安全存入奖励仓。",
    items: [],
    currency: {stoneCoins: 10},
    createdAt: "2026-08-13T00:00:00.000Z",
    ...overrides,
  }, {certifyAttachment});
}

function physicalReward(value) {
  return {
    reward_id: value.rewardId,
    source_key: value.sourceKey,
    source_kind: value.sourceKind,
    source_digest: value.sourceDigest,
    recipient_account_id: value.recipientAccountId,
    status: value.status,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
    delivered_at: value.deliveredAt,
    claimed_at: value.claimedAt,
    delivered_mail_id: value.deliveredMailId,
    data_generation: value.dataGeneration,
    revision: value.revision,
    document_json: structuredClone(value.document),
  };
}

function vaultOnlyPlan(entries) {
  const writeSet = buildRewardVaultIssueWriteSet({
    storageState: storageState(),
    entries,
    certifyAttachment,
  });
  return buildMysqlResourceAcquisitionPlan({
    kind: "reward_vault_issue_only_v1",
    globalRevisionFence: false,
    globalCompatibilityBarrier: "shared",
    rewardVaultIssueWriteSet: writeSet,
    locks: [...writeSet.controlLocks],
    writes: [...writeSet.writes],
  });
}

function ambiguousCommitFixture(plan, commitMode) {
  const shared = {rewards: new Map()};
  let connectionCount = 0;
  return {
    shared,
    pool: {
      async getConnection() {
        connectionCount += 1;
        const connectionIndex = connectionCount;
        let working = new Map(Array.from(shared.rewards, ([key, value]) => [
          key,
          structuredClone(value),
        ]));
        return {
          async query(statement, params = []) {
            const sql = String(statement).trim().replace(/\s+/g, " ");
            if (/^SET SESSION innodb_lock_wait_timeout/i.test(sql)) {
              return [{affectedRows: 0}, []];
            }
            if (/^SELECT revision AS storeRevision FROM auth_store_revisions/i.test(sql)) {
              return [[{storeRevision: 12}], []];
            }
            if (/^SELECT scope_key, schema_generation/i.test(sql)) {
              return [[{
                scope_key: "mail_lifecycle",
                schema_generation: 1,
                data_generation: 1,
                lifecycle_state: "ready",
                archive_enabled: 0,
                vault_claim_enabled: 1,
                active_limit_enabled: 0,
              }], []];
            }
            if (/^INSERT INTO reward_vault_entries/i.test(sql)) {
              const value = plan.rewardVaultIssueWriteSet.entries.find(({rewardId}) => (
                rewardId === params[0]
              ));
              if (!value || working.has(value.rewardId)) {
                const error = new Error("duplicate reward");
                error.code = "ER_DUP_ENTRY";
                throw error;
              }
              working.set(value.rewardId, physicalReward(value));
              return [{affectedRows: 1}, []];
            }
            if (/^SELECT reward_id, source_key/i.test(sql)) {
              const value = working.get(params[0]);
              return [value ? [structuredClone(value)] : [], []];
            }
            throw new Error(`unexpected vault-only SQL: ${sql}`);
          },
          async beginTransaction() {
            working = new Map(Array.from(shared.rewards, ([key, value]) => [
              key,
              structuredClone(value),
            ]));
          },
          async commit() {
            if (connectionIndex === 1) {
              if (commitMode !== "not_applied") shared.rewards = working;
              if (commitMode === "mismatch") {
                const first = shared.rewards.values().next().value;
                first.source_digest = "0".repeat(64);
              }
              const error = new Error("lost commit response");
              error.code = "PROTOCOL_CONNECTION_LOST";
              throw error;
            }
          },
          async rollback() {},
          release() {},
          destroy() {},
        };
      },
    },
  };
}

test("vault issue write-set freezes one strict insert behind the enabled control fence", () => {
  const result = buildRewardVaultIssueWriteSet({
    storageState: storageState(),
    entries: [entry()],
    certifyAttachment,
  });
  assert.equal(result.controlLocks.length, 1);
  assert.equal(result.controlLocks[0].expectedRow.vault_claim_enabled, 1);
  assert.equal(result.controlLocks[0].expectedRow.active_limit_enabled, 0);
  assert.equal(result.writes.length, 1);
  assert.equal(result.writes[0].sql, REWARD_VAULT_INSERT_SQL);
  assert.equal(result.writes[0].resource, "reward_vault");
  assert.equal(result.writes[0].kind, "insert");
  assert.equal(mysqlResourceWriteAffectedRowsAccepted(result.writes[0], 1), true);
  assert.equal(mysqlResourceWriteAffectedRowsAccepted(result.writes[0], 0), false);
  assert.equal(Object.isFrozen(result.entries[0].document), true);
  assert.deepEqual(assertRewardVaultIssueWriteSet(result, {
    storageState: storageState(),
    certifyAttachment,
  }), result);
});

test("multiple rewards sort by deterministic identity and reject duplicate sources", () => {
  const first = entry("listing_z");
  const second = entry("listing_a");
  const result = buildRewardVaultIssueWriteSet({
    storageState: storageState({
      flags: {archive: true, vaultClaim: true, activeLimit: false},
    }),
    entries: [first, second],
    certifyAttachment,
  });
  assert.deepEqual(
    result.entries.map(({rewardId}) => rewardId),
    [first.rewardId, second.rewardId].sort(),
  );
  assert.equal(result.controlLocks[0].expectedRow.archive_enabled, 1);
  assert.throws(
    () => buildRewardVaultIssueWriteSet({
      storageState: storageState(),
      entries: [first, structuredClone(first)],
      certifyAttachment,
    }),
    (error) => error && error.code === "mysql_reward_vault_issue_invalid"
      && error.reason === "issue_identity_duplicate",
  );
});

test("disabled, generation drift, malformed batches and tampering fail closed while active limit stays compatible", () => {
  const valid = entry();
  for (const state of [
    storageState({flags: {archive: false, vaultClaim: false, activeLimit: false}}),
    storageState({dataGeneration: 0, lifecycleState: "uninitialized"}),
  ]) {
    assert.throws(
      () => buildRewardVaultIssueWriteSet({
        storageState: state,
        entries: [valid],
        certifyAttachment,
      }),
      (error) => error && error.code === "mysql_reward_vault_issue_invalid",
    );
  }
  const activeLimited = buildRewardVaultIssueWriteSet({
    storageState: storageState({flags: {archive: true, vaultClaim: true, activeLimit: true}}),
    entries: [valid],
    certifyAttachment,
  });
  assert.equal(activeLimited.controlLocks[0].expectedRow.active_limit_enabled, 1);
  assert.equal(buildRewardVaultIssueWriteSet({
    storageState: storageState(),
    entries: [],
    certifyAttachment,
  }), null);
  const built = buildRewardVaultIssueWriteSet({
    storageState: storageState(),
    entries: [valid],
    certifyAttachment,
  });
  const tampered = structuredClone(built);
  tampered.writes[0].params[3] = "0".repeat(64);
  assert.throws(
    () => assertRewardVaultIssueWriteSet(tampered, {
      storageState: storageState(),
      certifyAttachment,
    }),
    (error) => error && error.code === "mysql_reward_vault_issue_invalid",
  );
});

test("vault-only ambiguous COMMIT recovers only from the exact deterministic rows", async () => {
  const plan = vaultOnlyPlan([entry("listing_recovered")]);
  const fake = ambiguousCommitFixture(plan, "applied");
  const result = await __runMysqlPoolSavePlanForTest(fake.pool, plan, {
    expectedRevision: 12,
    transactionPolicy: {},
    certifyAttachment,
  });
  assert.deepEqual(result, {
    revision: 12,
    globalRevisionAdvanced: false,
    rewardVaultIssueRecovered: true,
  });
  assert.equal(fake.shared.rewards.size, 1);
});

test("vault-only ambiguous COMMIT distinguishes safe retry from physical drift", async () => {
  const plan = vaultOnlyPlan([entry("listing_unknown")]);
  const absent = ambiguousCommitFixture(plan, "not_applied");
  await assert.rejects(
    __runMysqlPoolSavePlanForTest(absent.pool, plan, {
      expectedRevision: 12,
      transactionPolicy: {},
      certifyAttachment,
    }),
    (error) => error && error.code === "mysql_reward_vault_issue_not_committed"
      && error.outcomeUnknown === false
      && error.noCommitGuaranteed === true
      && error.retryable === true,
  );

  const drifted = ambiguousCommitFixture(plan, "mismatch");
  await assert.rejects(
    __runMysqlPoolSavePlanForTest(drifted.pool, plan, {
      expectedRevision: 12,
      transactionPolicy: {},
      certifyAttachment,
    }),
    (error) => error && error.code === "mysql_reward_vault_issue_outcome_unknown"
      && error.outcomeUnknown === true
      && error.retryable === false,
  );
});
