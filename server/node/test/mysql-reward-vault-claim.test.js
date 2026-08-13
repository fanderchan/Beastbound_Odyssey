"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  REWARD_VAULT_CLAIM_SQL,
  REWARD_VAULT_LOCK_SQL,
  mysqlResourceWriteAffectedRowsAccepted,
} = require("../src/mysql-resource-acquisition-order");
const {
  createRewardVaultEntry,
} = require("../src/auth/reward-vault-state");
const {
  assertRewardVaultClaimWriteSet,
  buildRewardVaultClaimWriteSet,
} = require("../src/mysql-reward-vault-claim");

function attachment(mail) {
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

function entry() {
  return createRewardVaultEntry({
    sourceKind: "market_sale",
    sourceKey: "listing_claim_1",
    recipientAccountId: "account_reward_claim",
    recipientUsername: "rewardclaim",
    recipientDisplayName: "领取测试员",
    title: "成交奖励",
    body: "领取必须与档案原子提交。",
    items: [{itemId: "material_bone", count: 2}],
    currency: {stoneCoins: 20},
    createdAt: "2026-08-13T00:00:00.000Z",
  }, {certifyAttachment: attachment});
}

test("claim write-set binds control, exact pre-image, monotonic next state and one CAS", () => {
  const before = entry();
  const result = buildRewardVaultClaimWriteSet({
    storageState: storageState({
      flags: {archive: true, vaultClaim: true, activeLimit: false},
    }),
    beforeEntry: before,
    claimedAt: "2026-08-13T00:01:00.000Z",
    certifyAttachment: attachment,
  });
  assert.equal(result.controlLocks[0].expectedRow.archive_enabled, 1);
  assert.equal(result.locks[0].sql, REWARD_VAULT_LOCK_SQL);
  assert.equal(result.locks[0].expectedRow.document_json.rewardId, before.rewardId);
  assert.equal(result.writes[0].sql, REWARD_VAULT_CLAIM_SQL);
  assert.equal(result.writes[0].kind, "claim");
  assert.equal(result.nextEntry.status, "claimed");
  assert.equal(result.nextEntry.revision, before.revision + 1);
  assert.equal(mysqlResourceWriteAffectedRowsAccepted(result.writes[0], 1), true);
  assert.equal(mysqlResourceWriteAffectedRowsAccepted(result.writes[0], 0), false);
  assert.deepEqual(assertRewardVaultClaimWriteSet(result, {
    storageState: storageState({
      flags: {archive: true, vaultClaim: true, activeLimit: false},
    }),
    certifyAttachment: attachment,
  }), result);
});

test("claimed input, feature drift, next-state drift and SQL tampering fail closed", () => {
  const before = entry();
  const valid = buildRewardVaultClaimWriteSet({
    storageState: storageState(),
    beforeEntry: before,
    claimedAt: "2026-08-13T00:01:00.000Z",
    certifyAttachment: attachment,
  });
  assert.throws(
    () => buildRewardVaultClaimWriteSet({
      storageState: storageState({
        flags: {archive: false, vaultClaim: false, activeLimit: false},
      }),
      beforeEntry: before,
      claimedAt: "2026-08-13T00:01:00.000Z",
      certifyAttachment: attachment,
    }),
    (error) => error && error.code === "mysql_reward_vault_claim_invalid",
  );
  assert.throws(
    () => buildRewardVaultClaimWriteSet({
      storageState: storageState(),
      beforeEntry: valid.nextEntry,
      claimedAt: "2026-08-13T00:02:00.000Z",
      certifyAttachment: attachment,
    }),
    (error) => error && error.code === "reward_vault_input_invalid",
  );
  assert.throws(
    () => buildRewardVaultClaimWriteSet({
      storageState: storageState(),
      beforeEntry: before,
      nextEntry: {...structuredClone(valid.nextEntry), revision: 4},
      claimedAt: "2026-08-13T00:01:00.000Z",
      certifyAttachment: attachment,
    }),
    (error) => error && error.code === "mysql_reward_vault_claim_invalid"
      && error.reason === "next_entry_drifted",
  );
  const tampered = structuredClone(valid);
  tampered.writes[0].params[5] = "0".repeat(64);
  assert.throws(
    () => assertRewardVaultClaimWriteSet(tampered, {
      storageState: storageState(),
      certifyAttachment: attachment,
    }),
    (error) => error && error.code === "mysql_reward_vault_claim_invalid",
  );
});
