"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  REWARD_VAULT_STATUS_CLAIMED,
  REWARD_VAULT_STATUS_MAIL_DELIVERED,
  canonicalRewardVaultEntry,
  claimRewardVaultEntry,
  createRewardVaultEntry,
  deliverRewardVaultEntry,
  projectRewardVaultEntry,
  rewardVaultIdForSource,
} = require("../src/auth/reward-vault-state");

const CREATED_AT = "2026-08-13T00:00:00.000Z";

function certifyAttachment(mail) {
  const items = structuredClone(mail.items || []);
  const equipmentItems = items.filter(({itemId}) => itemId.startsWith("equipment_"));
  return {
    ok: equipmentItems.length === 0,
    items,
    ordinaryItems: items.filter(({itemId}) => !itemId.startsWith("equipment_")),
    equipmentItems,
    equipmentEnvelopes: structuredClone(mail.equipmentEnvelopes || []),
    currency: structuredClone(mail.currency || {}),
  };
}

function input(overrides = {}) {
  return {
    sourceKind: "market_sale",
    sourceKey: "listing_20260813_1",
    recipientAccountId: "account_reward_owner",
    recipientUsername: "rewardowner",
    recipientDisplayName: "奖励测试员",
    title: "交易所成交收益",
    body: "成交收益已安全进入奖励仓。",
    items: [{itemId: "material_bone", count: 2}],
    currency: {stoneCoins: 100},
    createdAt: CREATED_AT,
    ...overrides,
  };
}

test("the same recipient and source always derive one frozen available reward", () => {
  const first = createRewardVaultEntry(input(), {certifyAttachment});
  const second = createRewardVaultEntry(input(), {certifyAttachment});

  assert.deepEqual(first, second);
  assert.equal(first.rewardId, rewardVaultIdForSource(
    first.recipientAccountId,
    first.sourceKind,
    first.sourceKey,
  ));
  assert.match(first.rewardId, /^reward_[a-f0-9]{64}$/);
  assert.match(first.sourceDigest, /^[a-f0-9]{64}$/);
  assert.equal(first.status, "available");
  assert.equal(first.revision, 0);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.document.items), true);
});

test("recipient and source domains prevent cross-account or cross-kind collisions", () => {
  const base = createRewardVaultEntry(input(), {certifyAttachment});
  const recipient = createRewardVaultEntry(input({recipientAccountId: "account_other"}), {
    certifyAttachment,
  });
  const kind = createRewardVaultEntry(input({sourceKind: "tutorial_market_sale"}), {
    certifyAttachment,
  });

  assert.notEqual(base.rewardId, recipient.rewardId);
  assert.notEqual(base.rewardId, kind.rewardId);
});

test("reward documents canonicalize ordinary assets and reject empty or equipment grants", () => {
  const mergedCertifier = (mail) => ({
    ok: true,
    items: [{itemId: "material_bone", count: 3}],
    ordinaryItems: [{itemId: "material_bone", count: 3}],
    equipmentItems: [],
    equipmentEnvelopes: [],
    currency: {stoneCoins: 100},
  });
  const canonical = createRewardVaultEntry(input({
    items: [
      {itemId: "material_bone", count: 1},
      {itemId: "material_bone", count: 2},
    ],
  }), {certifyAttachment: mergedCertifier});
  assert.deepEqual(canonical.document.items, [{itemId: "material_bone", count: 3}]);

  assert.throws(
    () => createRewardVaultEntry(input({
      items: [{itemId: "equipment_sword", count: 1}],
      currency: {},
    }), {certifyAttachment}),
    (error) => error && error.code === "reward_vault_input_invalid"
      && error.reason === "asset_not_supported",
  );
  assert.throws(
    () => createRewardVaultEntry(input({items: [], currency: {}}), {certifyAttachment}),
    (error) => error && error.code === "reward_vault_input_invalid"
      && error.reason === "asset_empty",
  );
});

test("source keys, timestamps, unknown fields, and missing certifiers fail closed", () => {
  for (const candidate of [
    input({sourceKey: "listing key with spaces"}),
    input({sourceKind: "gm_reward"}),
    input({createdAt: "2026/08/13 00:00:00"}),
    {...input(), unexpected: true},
  ]) {
    assert.throws(
      () => createRewardVaultEntry(candidate, {certifyAttachment}),
      (error) => error && error.code === "reward_vault_input_invalid",
    );
  }
  assert.throws(
    () => createRewardVaultEntry(input()),
    (error) => error && error.reason === "certifier_missing",
  );
});

test("stored rows bind document digest, recipient, source and deterministic identity", () => {
  const entry = createRewardVaultEntry(input(), {certifyAttachment});
  assert.deepEqual(
    canonicalRewardVaultEntry(structuredClone(entry), entry.rewardId, {certifyAttachment}),
    entry,
  );

  for (const mutated of [
    {...structuredClone(entry), sourceDigest: "0".repeat(64)},
    {...structuredClone(entry), recipientAccountId: "account_other"},
    {...structuredClone(entry), document: {...structuredClone(entry.document), title: "篡改"}},
    {...structuredClone(entry), unexpected: true},
  ]) {
    assert.throws(
      () => canonicalRewardVaultEntry(mutated, entry.rewardId, {certifyAttachment}),
      (error) => error && error.code === "reward_vault_integrity_invalid",
    );
  }
});

test("available, delivered, and claimed lifecycle states are monotonic and exact", () => {
  const available = createRewardVaultEntry(input(), {certifyAttachment});
  const deliveredAt = "2026-08-13T00:01:00.000Z";
  const delivered = {
    ...structuredClone(available),
    status: REWARD_VAULT_STATUS_MAIL_DELIVERED,
    updatedAt: deliveredAt,
    deliveredAt,
    deliveredMailId: "mail_reward_delivery_1",
    revision: 1,
  };
  assert.equal(
    canonicalRewardVaultEntry(delivered, delivered.rewardId, {certifyAttachment}).status,
    REWARD_VAULT_STATUS_MAIL_DELIVERED,
  );
  const claimedAt = "2026-08-13T00:02:00.000Z";
  const claimed = {
    ...delivered,
    status: REWARD_VAULT_STATUS_CLAIMED,
    updatedAt: claimedAt,
    claimedAt,
    revision: 2,
  };
  assert.equal(
    canonicalRewardVaultEntry(claimed, claimed.rewardId, {certifyAttachment}).status,
    REWARD_VAULT_STATUS_CLAIMED,
  );

  for (const broken of [
    {...structuredClone(available), revision: 1},
    {...structuredClone(delivered), deliveredMailId: null},
    {...structuredClone(delivered), claimedAt},
    {...structuredClone(claimed), claimedAt: "2026-08-12T23:59:59.000Z"},
  ]) {
    assert.throws(
      () => canonicalRewardVaultEntry(broken, broken.rewardId, {certifyAttachment}),
      (error) => error && error.code === "reward_vault_integrity_invalid",
    );
  }
});

test("claim transition preserves source assets and advances exactly one revision", () => {
  const available = createRewardVaultEntry(input(), {certifyAttachment});
  const claimedAt = "2026-08-13T00:02:00.000Z";
  const claimed = claimRewardVaultEntry(available, claimedAt, {certifyAttachment});
  assert.equal(claimed.status, REWARD_VAULT_STATUS_CLAIMED);
  assert.equal(claimed.claimedAt, claimedAt);
  assert.equal(claimed.updatedAt, claimedAt);
  assert.equal(claimed.revision, 1);
  assert.deepEqual(claimed.document, available.document);

  assert.throws(
    () => claimRewardVaultEntry(claimed, "2026-08-13T00:03:00.000Z", {certifyAttachment}),
    (error) => error && error.code === "reward_vault_input_invalid"
      && error.reason === "claim_transition",
  );
  assert.throws(
    () => claimRewardVaultEntry(available, "2026-08-12T23:59:59.000Z", {certifyAttachment}),
    (error) => error && error.code === "reward_vault_input_invalid",
  );
});

test("delivery transition binds one notification without changing assets", () => {
  const available = createRewardVaultEntry(input(), {certifyAttachment});
  const deliveredAt = "2026-08-13T00:01:00.000Z";
  const delivered = deliverRewardVaultEntry(
    available,
    "mail_reward_delivery_1",
    deliveredAt,
    {certifyAttachment},
  );
  assert.equal(delivered.status, REWARD_VAULT_STATUS_MAIL_DELIVERED);
  assert.equal(delivered.deliveredAt, deliveredAt);
  assert.equal(delivered.deliveredMailId, "mail_reward_delivery_1");
  assert.equal(delivered.revision, 1);
  assert.deepEqual(delivered.document, available.document);

  assert.throws(
    () => deliverRewardVaultEntry(delivered, "mail_reward_delivery_2", deliveredAt, {
      certifyAttachment,
    }),
    (error) => error && error.code === "reward_vault_input_invalid"
      && error.reason === "delivery_transition",
  );
});

test("public projection omits recipient and replay source identities", () => {
  const entry = createRewardVaultEntry(input(), {certifyAttachment});
  const projected = projectRewardVaultEntry(entry, {certifyAttachment});
  assert.equal(projected.rewardId, entry.rewardId);
  assert.equal(projected.claimable, true);
  assert.equal(Object.hasOwn(projected, "sourceKey"), false);
  assert.equal(Object.hasOwn(projected, "recipientAccountId"), false);
  assert.equal(Object.hasOwn(projected, "sourceDigest"), false);
});
