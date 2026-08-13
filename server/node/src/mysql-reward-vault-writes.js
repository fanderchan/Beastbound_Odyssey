"use strict";

const {isDeepStrictEqual} = require("node:util");

const {
  REWARD_VAULT_INSERT_SQL,
  MAIL_STORAGE_CONTROL_LOCK_SQL,
  mysqlResourceWriteAffectedRowsAccepted,
} = require("./mysql-resource-acquisition-order");
const {
  REWARD_VAULT_STATUS_AVAILABLE,
  canonicalRewardVaultEntry,
} = require("./auth/reward-vault-state");

const REWARD_VAULT_ISSUE_MAX_PER_MUTATION = 16;
const MAIL_STORAGE_SCOPE_KEY = "mail_lifecycle";

function buildRewardVaultIssueWriteSet(options = {}) {
  const entries = options.entries;
  if (entries === undefined || entries === null || (Array.isArray(entries) && entries.length === 0)) {
    return null;
  }
  if (
    !Array.isArray(entries)
    || entries.length > REWARD_VAULT_ISSUE_MAX_PER_MUTATION
    || typeof options.certifyAttachment !== "function"
  ) {
    throw rewardVaultWriteError("issue_batch_invalid");
  }
  const state = canonicalStorageState(options.storageState);
  if (
    state.dataGeneration !== 1
    || state.lifecycleState !== "ready"
    || state.flags.vaultClaim !== true
  ) {
    throw rewardVaultWriteError("feature_disabled_or_drifted");
  }
  const canonicalEntries = entries.map((entry) => canonicalRewardVaultEntry(
    entry,
    entry && entry.rewardId || "",
    {certifyAttachment: options.certifyAttachment},
  ));
  const rewardIds = new Set();
  const sourceIds = new Set();
  for (const entry of canonicalEntries) {
    const sourceIdentity = JSON.stringify([
      entry.recipientAccountId,
      entry.sourceKind,
      entry.sourceKey,
    ]);
    if (
      entry.status !== REWARD_VAULT_STATUS_AVAILABLE
      || entry.revision !== 0
      || rewardIds.has(entry.rewardId)
      || sourceIds.has(sourceIdentity)
    ) {
      throw rewardVaultWriteError("issue_identity_duplicate");
    }
    rewardIds.add(entry.rewardId);
    sourceIds.add(sourceIdentity);
  }
  canonicalEntries.sort((left, right) => compareText(left.rewardId, right.rewardId));
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
  const writes = canonicalEntries.map((entry) => deepFreeze({
    kind: "insert",
    resource: "reward_vault",
    key: entry.rewardId,
    sql: REWARD_VAULT_INSERT_SQL,
    params: [
      entry.rewardId,
      entry.sourceKey,
      entry.sourceKind,
      entry.sourceDigest,
      entry.recipientAccountId,
      entry.createdAt,
      entry.updatedAt,
      JSON.stringify(entry.document),
    ],
    expectedAffectedRows: 1,
  }));
  for (const write of writes) {
    if (!mysqlResourceWriteAffectedRowsAccepted(write, 1)) {
      throw rewardVaultWriteError("issue_write_contract_invalid");
    }
  }
  return deepFreeze({
    controlLocks: [controlLock],
    entries: canonicalEntries,
    writes,
  });
}

function assertRewardVaultIssueWriteSet(value, options = {}) {
  const rebuilt = buildRewardVaultIssueWriteSet({
    storageState: options.storageState,
    entries: value && value.entries,
    certifyAttachment: options.certifyAttachment,
  });
  if (
    rebuilt === null
    || !value
    || !isDeepStrictEqual(value.controlLocks, rebuilt.controlLocks)
    || !isDeepStrictEqual(value.entries, rebuilt.entries)
    || !isDeepStrictEqual(value.writes, rebuilt.writes)
  ) {
    throw rewardVaultWriteError("issue_write_set_drifted");
  }
  return rebuilt;
}

function canonicalStorageState(value) {
  const state = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const flagsValue = state.flags && typeof state.flags === "object" && !Array.isArray(state.flags)
    ? state.flags
    : {};
  const flags = {
    archive: flagsValue.archive === true,
    vaultClaim: flagsValue.vaultClaim === true,
    activeLimit: flagsValue.activeLimit === true,
  };
  if (
    state.controlFence !== true
    || state.schemaGeneration !== 1
    || !Number.isSafeInteger(state.dataGeneration)
    || typeof state.lifecycleState !== "string"
    || Object.keys(flagsValue).length !== 3
    || !["archive", "vaultClaim", "activeLimit"].every((field) => (
      typeof flagsValue[field] === "boolean"
    ))
  ) {
    throw rewardVaultWriteError("storage_state_invalid");
  }
  return {dataGeneration: state.dataGeneration, lifecycleState: state.lifecycleState, flags};
}

function compareText(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function rewardVaultWriteError(reason) {
  const error = new Error("MySQL 奖励仓发放写入合同无效，整笔业务已安全取消。");
  error.code = "mysql_reward_vault_issue_invalid";
  error.reason = String(reason || "invalid");
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

module.exports = {
  REWARD_VAULT_ISSUE_MAX_PER_MUTATION,
  assertRewardVaultIssueWriteSet,
  buildRewardVaultIssueWriteSet,
};
