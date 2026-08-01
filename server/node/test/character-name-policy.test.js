"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CHARACTER_NAME_POLICY_ID,
  inspectCharacterNameSafety,
  loadCharacterNamePolicy,
  normalizeCharacterNameForSafety,
  normalizeCharacterNamePolicy,
} = require("../src/auth/character-name-policy");

test("shared character-name policy loads a closed, usable contract", () => {
  const policy = loadCharacterNamePolicy();
  assert.equal(policy.schemaVersion, 1);
  assert.equal(policy.policyId, CHARACTER_NAME_POLICY_ID);
  assert.equal(policy.playerMessage, "这个名字不能使用，请换一个。");
  assert.equal(policy.maximumConsecutiveDigits, 5);
  assert.deepEqual(policy.latinTokenTerms, ["gm", "admin", "qq", "wx", "vx"]);
  assert.ok(policy.randomName.prefixes.length >= 20);
  assert.ok(policy.randomName.suffixes.length >= 20);
  assert.ok(policy.blockedScanKeys.length >= 30);
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(Object.isFrozen(policy.blockedScanKeys), true);
});

test("name safety normalizes width, case, separators, symbols and combining marks", () => {
  assert.equal(normalizeCharacterNameForSafety(" Ｇ·M_管理员 "), "gm管理员");
  assert.equal(normalizeCharacterNameForSafety("微🌟信"), "微信");
  assert.equal(normalizeCharacterNameForSafety("傻\u0336逼"), "傻逼");
});

test("name safety blocks obfuscated terms and long digit runs but accepts ordinary names", () => {
  const policy = loadCharacterNamePolicy();
  for (const value of [
    "Ｇ · M",
    "游 戏 管 理 员",
    "微🌟信",
    "傻_逼",
    "猎人1-2-3-4-5-6",
    "🌟✨",
    "GM小龙",
    "小龙GM",
    "WX小王",
    "小王QQ",
    "真GM玩家",
    "我是ADMIN本人",
    "小王QQ客服",
  ]) {
    assert.equal(inspectCharacterNameSafety(value, policy).ok, false, value);
  }
  for (const value of ["山岚", "月影", "石芽12345", "风语猎人", "Sigma", "Enigma", "Badminton"]) {
    assert.deepEqual(inspectCharacterNameSafety(value, policy), {ok: true}, value);
  }
});

test("policy normalization fails closed on duplicate evasion keys", () => {
  assert.throws(() => normalizeCharacterNamePolicy({
    schemaVersion: 1,
    policyId: CHARACTER_NAME_POLICY_ID,
    playerMessage: "这个名字不能使用，请换一个。",
    maximumConsecutiveDigits: 5,
    latinTokenTerms: ["gm"],
    randomName: {prefixes: ["山"], suffixes: ["岚"]},
    blockedTerms: {officialImpersonation: ["Ｇ Ｍ"]},
  }), /invalid or duplicate blocked term/);
});

test("policy normalization rejects a random-name combination matched as a latin token", () => {
  assert.throws(() => normalizeCharacterNamePolicy({
    schemaVersion: 1,
    policyId: CHARACTER_NAME_POLICY_ID,
    playerMessage: "这个名字不能使用，请换一个。",
    maximumConsecutiveDigits: 5,
    latinTokenTerms: ["gm"],
    randomName: {prefixes: ["Ｇ"], suffixes: ["Ｍ小龙"]},
    blockedTerms: {officialImpersonation: ["管理员"]},
  }), /random-name catalog can generate a blocked term/);
});
