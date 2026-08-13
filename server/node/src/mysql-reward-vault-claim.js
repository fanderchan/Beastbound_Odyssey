"use strict";

const {isDeepStrictEqual} = require("node:util");

const {
  MAIL_STORAGE_CONTROL_LOCK_SQL,
  REWARD_VAULT_CLAIM_SQL,
  REWARD_VAULT_LOCK_SQL,
  mysqlResourceWriteAffectedRowsAccepted,
} = require("./mysql-resource-acquisition-order");
const {
  REWARD_VAULT_STATUS_CLAIMED,
  canonicalRewardVaultEntry,
  claimRewardVaultEntry,
} = require("./auth/reward-vault-state");

const MAIL_STORAGE_SCOPE_KEY = "mail_lifecycle";

function buildRewardVaultClaimWriteSet(options = {}) {
  if (typeof options.certifyAttachment !== "function") {
    throw claimWriteError("certifier_missing");
  }
  const state = canonicalStorageState(options.storageState);
  if (
    state.dataGeneration !== 1
    || state.lifecycleState !== "ready"
    || state.flags.vaultClaim !== true
  ) {
    throw claimWriteError("feature_disabled_or_drifted");
  }
  const before = canonicalRewardVaultEntry(
    options.beforeEntry,
    options.beforeEntry && options.beforeEntry.rewardId || "",
    {certifyAttachment: options.certifyAttachment},
  );
  const next = claimRewardVaultEntry(before, options.claimedAt, {
    certifyAttachment: options.certifyAttachment,
  });
  if (
    options.nextEntry !== undefined
    && !isDeepStrictEqual(
      canonicalRewardVaultEntry(options.nextEntry, before.rewardId, {
        certifyAttachment: options.certifyAttachment,
      }),
      next,
    )
  ) {
    throw claimWriteError("next_entry_drifted");
  }
  const controlLock = deepFreeze({
    kind: "lock",
    resource: "mail_storage_control",
    key: MAIL_STORAGE_SCOPE_KEY,
    lockMode: "shared",
    sql: MAIL_STORAGE_CONTROL_LOCK_SQL,
    params: [MAIL_STORAGE_SCOPE_KEY],
    expectedRow: {
      scope_key: MAIL_STORAGE_SCOPE_KEY,
      schema_generation: 1,
      data_generation: 1,
      lifecycle_state: "ready",
      archive_enabled: state.flags.archive ? 1 : 0,
      vault_claim_enabled: 1,
      active_limit_enabled: state.flags.activeLimit ? 1 : 0,
    },
  });
  const rewardLock = deepFreeze({
    kind: "lock",
    resource: "reward_vault",
    key: before.rewardId,
    lockMode: "exclusive",
    sql: REWARD_VAULT_LOCK_SQL,
    params: [before.rewardId],
    expectedRow: physicalRow(before),
  });
  const write = deepFreeze({
    kind: "claim",
    resource: "reward_vault",
    key: before.rewardId,
    sql: REWARD_VAULT_CLAIM_SQL,
    params: [
      next.updatedAt,
      next.claimedAt,
      before.rewardId,
      before.sourceKey,
      before.sourceKind,
      before.sourceDigest,
      before.recipientAccountId,
      before.status,
      before.createdAt,
      before.updatedAt,
      before.deliveredAt,
      before.deliveredMailId,
      before.revision,
      JSON.stringify(before.document),
    ],
    expectedAffectedRows: 1,
  });
  if (!mysqlResourceWriteAffectedRowsAccepted(write, 1)) {
    throw claimWriteError("claim_write_contract_invalid");
  }
  return deepFreeze({
    controlLocks: [controlLock],
    locks: [rewardLock],
    beforeEntry: before,
    nextEntry: next,
    writes: [write],
  });
}

function assertRewardVaultClaimWriteSet(value, options = {}) {
  const rebuilt = buildRewardVaultClaimWriteSet({
    storageState: options.storageState,
    beforeEntry: value && value.beforeEntry,
    nextEntry: value && value.nextEntry,
    claimedAt: value && value.nextEntry && value.nextEntry.claimedAt,
    certifyAttachment: options.certifyAttachment,
  });
  if (
    !value
    || !isDeepStrictEqual(value.controlLocks, rebuilt.controlLocks)
    || !isDeepStrictEqual(value.locks, rebuilt.locks)
    || !isDeepStrictEqual(value.beforeEntry, rebuilt.beforeEntry)
    || !isDeepStrictEqual(value.nextEntry, rebuilt.nextEntry)
    || !isDeepStrictEqual(value.writes, rebuilt.writes)
  ) {
    throw claimWriteError("claim_write_set_drifted");
  }
  return rebuilt;
}

function physicalRow(entry) {
  return deepFreeze({
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
    document_json: entry.document,
  });
}

function canonicalStorageState(value) {
  const state = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const rawFlags = state.flags && typeof state.flags === "object" && !Array.isArray(state.flags)
    ? state.flags
    : {};
  if (
    state.controlFence !== true
    || state.schemaGeneration !== 1
    || !Number.isSafeInteger(state.dataGeneration)
    || typeof state.lifecycleState !== "string"
    || Object.keys(rawFlags).length !== 3
    || !["archive", "vaultClaim", "activeLimit"].every((field) => (
      typeof rawFlags[field] === "boolean"
    ))
  ) {
    throw claimWriteError("storage_state_invalid");
  }
  return {
    dataGeneration: state.dataGeneration,
    lifecycleState: state.lifecycleState,
    flags: {
      archive: rawFlags.archive,
      vaultClaim: rawFlags.vaultClaim,
      activeLimit: rawFlags.activeLimit,
    },
  };
}

function claimWriteError(reason) {
  const error = new Error("MySQL 奖励仓领取写入合同无效，整笔领取已安全取消。");
  error.code = "mysql_reward_vault_claim_invalid";
  error.reason = String(reason || "invalid");
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

module.exports = {
  assertRewardVaultClaimWriteSet,
  buildRewardVaultClaimWriteSet,
};
