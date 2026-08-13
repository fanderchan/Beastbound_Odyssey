"use strict";

const MAIL_ACTIVE_CAPACITY = 200;

function canonicalMailCenterSummary(value) {
  if (!isRecord(value)) {
    throw summaryError("shape");
  }
  const expectedFields = new Set([
    "schemaVersion",
    "activeCount",
    "activeCapacity",
    "unreadCount",
    "availableRewardCount",
    "archiveCount",
    "archiveEnabled",
    "rewardVaultEnabled",
    "activeLimitEnabled",
  ]);
  if (
    Object.keys(value).length !== expectedFields.size
    || Object.keys(value).some((field) => !expectedFields.has(field))
    || value.schemaVersion !== 1
    || value.activeCapacity !== MAIL_ACTIVE_CAPACITY
    || !nonNegativeInteger(value.activeCount)
    || !nonNegativeInteger(value.unreadCount)
    || !nonNegativeInteger(value.availableRewardCount)
    || !nonNegativeInteger(value.archiveCount)
    || typeof value.archiveEnabled !== "boolean"
    || typeof value.rewardVaultEnabled !== "boolean"
    || typeof value.activeLimitEnabled !== "boolean"
    || value.unreadCount > value.activeCount
    || (value.activeLimitEnabled && !value.rewardVaultEnabled)
    || (value.activeLimitEnabled && value.activeCount > MAIL_ACTIVE_CAPACITY)
    || (!value.rewardVaultEnabled && value.availableRewardCount !== 0)
    || (!value.archiveEnabled && value.archiveCount !== 0)
  ) {
    throw summaryError("fields");
  }
  return Object.freeze({
    schemaVersion: 1,
    activeCount: value.activeCount,
    activeCapacity: MAIL_ACTIVE_CAPACITY,
    unreadCount: value.unreadCount,
    availableRewardCount: value.availableRewardCount,
    archiveCount: value.archiveCount,
    archiveEnabled: value.archiveEnabled,
    rewardVaultEnabled: value.rewardVaultEnabled,
    activeLimitEnabled: value.activeLimitEnabled,
  });
}

function emptyMailCenterSummary() {
  return canonicalMailCenterSummary({
    schemaVersion: 1,
    activeCount: 0,
    activeCapacity: MAIL_ACTIVE_CAPACITY,
    unreadCount: 0,
    availableRewardCount: 0,
    archiveCount: 0,
    archiveEnabled: false,
    rewardVaultEnabled: false,
    activeLimitEnabled: false,
  });
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function summaryError(reason) {
  const error = new TypeError(`邮件中心摘要不符合安全合同：${reason}`);
  error.code = "mail_center_summary_invalid";
  error.reason = String(reason || "invalid");
  return error;
}

module.exports = {
  MAIL_ACTIVE_CAPACITY,
  canonicalMailCenterSummary,
  emptyMailCenterSummary,
};
