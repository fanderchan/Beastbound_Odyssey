"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {createRewardVaultEntry} = require("../src/auth/reward-vault-state");
const {
  canonicalRewardVaultPageResult,
  decodeRewardVaultCursor,
  encodeRewardVaultCursor,
  normalizeRewardVaultPageOptions,
} = require("../src/auth/reward-vault-pagination");
const {encodeMailArchiveCursor} = require("../src/auth/mail-archive-pagination");

const ACCOUNT_ID = "account_reward_page";

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

function reward(sourceKey, createdAt) {
  return createRewardVaultEntry({
    sourceKind: "battle_overflow",
    sourceKey,
    recipientAccountId: ACCOUNT_ID,
    recipientUsername: "rewardpage",
    recipientDisplayName: "奖励页",
    title: "战斗溢出奖励",
    body: "背包已满的普通物品已安全保管。",
    items: [{itemId: "material_bone", count: 1}],
    currency: {},
    createdAt,
  }, {certifyAttachment});
}

test("reward cursor is canonical, domain-separated, and round trips", () => {
  const row = reward("room_1", "2026-08-13T00:00:00.000Z");
  const encoded = encodeRewardVaultCursor({createdAt: row.createdAt, rewardId: row.rewardId});
  assert.deepEqual(decodeRewardVaultCursor(encoded), {
    createdAt: row.createdAt,
    rewardId: row.rewardId,
  });
  assert.throws(
    () => decodeRewardVaultCursor(encodeMailArchiveCursor({
      createdAt: row.createdAt,
      mailId: "mail_other_domain",
    })),
    (error) => error && error.code === "reward_vault_pagination_invalid",
  );
});

test("page result certifies recipient, strict order, duplicates and continuation", () => {
  const rows = [
    reward("room_z", "2026-08-13T01:00:00.000Z"),
    reward("room_y", "2026-08-13T00:00:00.000Z"),
  ];
  const nextCursor = encodeRewardVaultCursor({
    createdAt: rows[1].createdAt,
    rewardId: rows[1].rewardId,
  });
  const page = canonicalRewardVaultPageResult({
    recipientAccountId: ACCOUNT_ID,
    rewardRows: rows,
    nextCursor,
    hasMore: true,
  }, ACCOUNT_ID, {limit: 2}, {certifyAttachment});
  assert.deepEqual(page.rewardRows.map(({sourceKey}) => sourceKey), ["room_z", "room_y"]);
  assert.equal(page.nextCursor, nextCursor);
  assert.equal(Object.isFrozen(page), true);

  for (const result of [
    {
      recipientAccountId: ACCOUNT_ID,
      rewardRows: [rows[0], rows[0]],
      nextCursor,
      hasMore: true,
    },
    {
      recipientAccountId: "account_other",
      rewardRows: rows,
      nextCursor,
      hasMore: true,
    },
    {
      recipientAccountId: ACCOUNT_ID,
      rewardRows: rows.slice().reverse(),
      nextCursor,
      hasMore: true,
    },
  ]) {
    assert.throws(
      () => canonicalRewardVaultPageResult(
        result,
        ACCOUNT_ID,
        {limit: 2},
        {certifyAttachment},
      ),
      (error) => error && error.code === "reward_vault_page_integrity_invalid",
    );
  }
});

test("page options require bounded canonical limits and reject foreign fields", () => {
  assert.deepEqual(normalizeRewardVaultPageOptions({limit: "30"}), {limit: 30, cursor: null});
  for (const options of [
    {},
    {limit: 0},
    {limit: 51},
    {limit: "01"},
    {limit: 10, status: "available"},
  ]) {
    assert.throws(
      () => normalizeRewardVaultPageOptions(options, {requireExplicitLimit: true}),
      (error) => error && error.code === "reward_vault_pagination_invalid",
    );
  }
});

test("continuation rows must be strictly after the cursor", () => {
  const cursorRow = reward("room_cursor", "2026-08-13T00:00:00.000Z");
  assert.throws(
    () => canonicalRewardVaultPageResult({
      recipientAccountId: ACCOUNT_ID,
      rewardRows: [cursorRow],
      nextCursor: null,
      hasMore: false,
    }, ACCOUNT_ID, {
      limit: 1,
      cursor: {createdAt: cursorRow.createdAt, rewardId: cursorRow.rewardId},
    }, {certifyAttachment}),
    (error) => error && error.code === "reward_vault_page_integrity_invalid",
  );
});
