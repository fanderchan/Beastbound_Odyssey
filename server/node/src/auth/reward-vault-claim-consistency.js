"use strict";

const {isDeepStrictEqual} = require("node:util");

const {
  canonicalRewardVaultEntry,
  projectRewardVaultEntry,
} = require("./reward-vault-state");

function buildRowLocalRewardVaultClaimConsistencyScope(options = {}) {
  if (
    options.methodName !== "claimRewardVault"
    || !options.receipt
    || typeof options.receipt !== "object"
    || !options.claim
    || typeof options.claim !== "object"
    || typeof options.certifyAttachment !== "function"
    || typeof options.projectProfile !== "function"
  ) {
    return null;
  }
  const before = objectOrEmpty(options.before);
  const candidate = objectOrEmpty(options.candidate);
  const accountId = String(options.accountId || "");
  const playerId = String(options.playerId || "");
  const rewardId = String(options.rewardId || "");
  const beforeBinding = objectOrEmpty(before.profileBindings && before.profileBindings[accountId]);
  const beforeProfile = objectOrEmpty(before.profiles && before.profiles[playerId]);
  const nextBinding = objectOrEmpty(candidate.profileBindings && candidate.profileBindings[accountId]);
  const nextProfile = objectOrEmpty(candidate.profiles && candidate.profiles[playerId]);
  let beforeEntry;
  let nextEntry;
  try {
    beforeEntry = canonicalRewardVaultEntry(
      options.claim.beforeEntry,
      rewardId,
      {certifyAttachment: options.certifyAttachment},
    );
    nextEntry = canonicalRewardVaultEntry(
      options.claim.nextEntry,
      rewardId,
      {certifyAttachment: options.certifyAttachment},
    );
  } catch {
    return null;
  }
  const response = objectOrEmpty(options.receipt.response);
  const expectedReward = projectRewardVaultEntry(nextEntry, {
    certifyAttachment: options.certifyAttachment,
  });
  const expectedProfile = options.projectProfile(nextProfile.profile);
  if (
    accountId === ""
    || playerId === ""
    || !/^reward_[a-f0-9]{64}$/.test(rewardId)
    || String(beforeBinding.accountId || "") !== accountId
    || String(beforeBinding.playerId || "") !== playerId
    || String(beforeProfile.accountId || "") !== accountId
    || String(beforeProfile.playerId || "") !== playerId
    || String(nextBinding.accountId || "") !== accountId
    || String(nextBinding.playerId || "") !== playerId
    || String(nextProfile.accountId || "") !== accountId
    || String(nextProfile.playerId || "") !== playerId
    || beforeEntry.rewardId !== rewardId
    || beforeEntry.recipientAccountId !== accountId
    || beforeEntry.status === "claimed"
    || nextEntry.rewardId !== rewardId
    || nextEntry.recipientAccountId !== accountId
    || nextEntry.status !== "claimed"
    || nextEntry.claimedAt !== options.claim.claimedAt
    || nextEntry.revision !== beforeEntry.revision + 1
    || response.ok !== true
    || !isDeepStrictEqual(response.reward, expectedReward)
    || !isDeepStrictEqual(response.profile, expectedProfile)
    || String(response.message || "") !== "奖励已领取。"
  ) {
    return null;
  }
  return {
    kind: "row_local_reward_vault_claim_v1",
    accountId,
    playerId,
    rewardId,
    operationId: String(options.receipt.operationId || ""),
    requestHash: String(options.receipt.requestHash || ""),
    actionId: String(options.receipt.actionId || ""),
  };
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

module.exports = {buildRowLocalRewardVaultClaimConsistencyScope};
