"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  MAIL_ACTIVE_CAPACITY,
  canonicalMailCenterSummary,
  emptyMailCenterSummary,
} = require("../src/auth/mail-center-summary");

function summary(overrides = {}) {
  return {
    schemaVersion: 1,
    activeCount: 12,
    activeCapacity: 200,
    unreadCount: 3,
    availableRewardCount: 2,
    archiveCount: 8,
    archiveEnabled: true,
    rewardVaultEnabled: true,
    activeLimitEnabled: true,
    ...overrides,
  };
}

test("mail center summary freezes the one public 200-capacity contract", () => {
  assert.equal(MAIL_ACTIVE_CAPACITY, 200);
  const value = canonicalMailCenterSummary(summary());
  assert.deepEqual(value, summary());
  assert.equal(Object.isFrozen(value), true);
  assert.deepEqual(emptyMailCenterSummary(), {
    schemaVersion: 1,
    activeCount: 0,
    activeCapacity: 200,
    unreadCount: 0,
    availableRewardCount: 0,
    archiveCount: 0,
    archiveEnabled: false,
    rewardVaultEnabled: false,
    activeLimitEnabled: false,
  });
});

test("mail center summary rejects drift, impossible badges, and hidden feature dependencies", () => {
  const invalid = [
    {...summary(), extra: true},
    summary({activeCapacity: 201}),
    summary({unreadCount: 13}),
    summary({activeCount: 201}),
    summary({rewardVaultEnabled: false, activeLimitEnabled: true, availableRewardCount: 0}),
    summary({rewardVaultEnabled: false, availableRewardCount: 1, activeLimitEnabled: false}),
    summary({archiveEnabled: false, archiveCount: 1}),
    summary({activeCount: "12"}),
  ];
  for (const value of invalid) {
    assert.throws(
      () => canonicalMailCenterSummary(value),
      (error) => error && error.code === "mail_center_summary_invalid",
    );
  }
});
