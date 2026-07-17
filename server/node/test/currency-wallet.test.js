"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  BINDING_BOUND,
  BINDING_UNBOUND,
  CURRENCY_DIAMONDS,
  CURRENCY_STONE_COINS,
  normalizeWalletAmount,
  publicWalletFields,
  setWalletBalance,
  totalWalletBalance,
  transferableWalletBalance,
  walletBalance,
  walletFieldFor,
} = require("../src/auth/currency-wallet");

test("legacy scalar balances remain unbound and missing bound balances project as zero", () => {
  const legacy = {stoneCoins: 120, diamonds: 9};

  assert.equal(transferableWalletBalance(legacy, CURRENCY_STONE_COINS), 120);
  assert.equal(transferableWalletBalance(legacy, CURRENCY_DIAMONDS), 9);
  assert.equal(walletBalance(legacy, CURRENCY_STONE_COINS, BINDING_BOUND), 0);
  assert.equal(walletBalance(legacy, CURRENCY_DIAMONDS, BINDING_BOUND), 0);
  assert.deepEqual(publicWalletFields(legacy), {
    stoneCoins: 120,
    boundStoneCoins: 0,
    diamonds: 9,
    boundDiamonds: 0,
  });
  assert.deepEqual(legacy, {stoneCoins: 120, diamonds: 9});
});

test("four balances stay independent and totals do not change transferable balances", () => {
  const profile = {
    stoneCoins: 20,
    boundStoneCoins: 80,
    diamonds: 3,
    boundDiamonds: 7,
  };

  assert.equal(transferableWalletBalance(profile, CURRENCY_STONE_COINS), 20);
  assert.equal(totalWalletBalance(profile, CURRENCY_STONE_COINS), 100);
  assert.equal(transferableWalletBalance(profile, CURRENCY_DIAMONDS), 3);
  assert.equal(totalWalletBalance(profile, CURRENCY_DIAMONDS), 10);

  assert.equal(setWalletBalance(profile, CURRENCY_STONE_COINS, BINDING_UNBOUND, 5), true);
  assert.equal(profile.stoneCoins, 5);
  assert.equal(profile.boundStoneCoins, 80);
  assert.equal(setWalletBalance(profile, CURRENCY_DIAMONDS, BINDING_BOUND, 11), true);
  assert.equal(profile.diamonds, 3);
  assert.equal(profile.boundDiamonds, 11);
});

test("wallet primitives reject unknown axes and normalize malformed amounts without overflow", () => {
  const profile = {stoneCoins: 10};

  assert.equal(walletFieldFor("gold", BINDING_UNBOUND), "");
  assert.equal(walletFieldFor(CURRENCY_STONE_COINS, "tradable"), "");
  assert.equal(setWalletBalance(profile, "gold", BINDING_UNBOUND, 99), false);
  assert.equal(setWalletBalance(profile, CURRENCY_STONE_COINS, "tradable", 99), false);
  assert.deepEqual(profile, {stoneCoins: 10});
  assert.equal(normalizeWalletAmount(Number.POSITIVE_INFINITY), 0);
  assert.equal(normalizeWalletAmount(-3), 0);
  assert.equal(normalizeWalletAmount(19.9), 19);
  assert.equal(normalizeWalletAmount(Number.MAX_SAFE_INTEGER + 1000), Number.MAX_SAFE_INTEGER);
  assert.equal(walletBalance({stoneCoins: 999}, CURRENCY_STONE_COINS, BINDING_UNBOUND, {stoneCoinLimit: 100}), 100);
});
