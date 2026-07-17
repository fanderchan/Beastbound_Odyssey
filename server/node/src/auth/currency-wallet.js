"use strict";

const CURRENCY_STONE_COINS = "stoneCoins";
const CURRENCY_DIAMONDS = "diamonds";
const BINDING_UNBOUND = "unbound";
const BINDING_BOUND = "bound";
const DEFAULT_MAX_BALANCE = Number.MAX_SAFE_INTEGER;

const WALLET_FIELDS = Object.freeze({
  [CURRENCY_STONE_COINS]: Object.freeze({
    [BINDING_UNBOUND]: "stoneCoins",
    [BINDING_BOUND]: "boundStoneCoins",
  }),
  [CURRENCY_DIAMONDS]: Object.freeze({
    [BINDING_UNBOUND]: "diamonds",
    [BINDING_BOUND]: "boundDiamonds",
  }),
});

const CURRENCY_IDS = Object.freeze(Object.keys(WALLET_FIELDS));
const BINDING_IDS = Object.freeze([BINDING_UNBOUND, BINDING_BOUND]);
const ALL_WALLET_FIELDS = Object.freeze(CURRENCY_IDS.flatMap((currency) => (
  BINDING_IDS.map((binding) => WALLET_FIELDS[currency][binding])
)));

function normalizeCurrencyId(value) {
  const currency = String(value || "").trim();
  return Object.hasOwn(WALLET_FIELDS, currency) ? currency : "";
}

function normalizeBindingId(value) {
  const binding = String(value || "").trim();
  return BINDING_IDS.includes(binding) ? binding : "";
}

function walletFieldFor(currencyValue, bindingValue = BINDING_UNBOUND) {
  const currency = normalizeCurrencyId(currencyValue);
  const binding = normalizeBindingId(bindingValue);
  return currency !== "" && binding !== "" ? WALLET_FIELDS[currency][binding] : "";
}

function walletLimitFor(currencyValue, options = {}) {
  const currency = normalizeCurrencyId(currencyValue);
  const rawLimit = currency === CURRENCY_STONE_COINS
    ? options.stoneCoinLimit
    : options.diamondLimit;
  const numeric = Number(rawLimit);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : DEFAULT_MAX_BALANCE;
}

function normalizeWalletAmount(value, limit = DEFAULT_MAX_BALANCE) {
  const safeLimit = Number.isSafeInteger(limit) && limit >= 0 ? limit : DEFAULT_MAX_BALANCE;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(safeLimit, Math.trunc(numeric)));
}

function walletBalance(profile, currencyValue, bindingValue = BINDING_UNBOUND, options = {}) {
  const field = walletFieldFor(currencyValue, bindingValue);
  if (field === "" || !profile || typeof profile !== "object" || Array.isArray(profile)) {
    return 0;
  }
  return normalizeWalletAmount(profile[field], walletLimitFor(currencyValue, options));
}

function transferableWalletBalance(profile, currencyValue, options = {}) {
  return walletBalance(profile, currencyValue, BINDING_UNBOUND, options);
}

function totalWalletBalance(profile, currencyValue, options = {}) {
  return normalizeWalletAmount(
    transferableWalletBalance(profile, currencyValue, options)
      + walletBalance(profile, currencyValue, BINDING_BOUND, options),
    walletLimitFor(currencyValue, options),
  );
}

function setWalletBalance(profile, currencyValue, bindingValue, amount, options = {}) {
  const field = walletFieldFor(currencyValue, bindingValue);
  if (field === "" || !profile || typeof profile !== "object" || Array.isArray(profile)) {
    return false;
  }
  profile[field] = normalizeWalletAmount(amount, walletLimitFor(currencyValue, options));
  return true;
}

function publicWalletFields(profile, options = {}) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return {};
  }
  const result = {};
  for (const currency of CURRENCY_IDS) {
    const unboundField = walletFieldFor(currency, BINDING_UNBOUND);
    const boundField = walletFieldFor(currency, BINDING_BOUND);
    const hasUnbound = Object.hasOwn(profile, unboundField);
    const hasBound = Object.hasOwn(profile, boundField);
    if (!hasUnbound && !hasBound) {
      continue;
    }
    if (hasUnbound) {
      result[unboundField] = walletBalance(profile, currency, BINDING_UNBOUND, options);
    }
    // Legacy profiles with the historical unbound field gain a public zero
    // balance without requiring a bulk database migration or revision bump.
    result[boundField] = walletBalance(profile, currency, BINDING_BOUND, options);
  }
  return result;
}

module.exports = {
  ALL_WALLET_FIELDS,
  BINDING_BOUND,
  BINDING_IDS,
  BINDING_UNBOUND,
  CURRENCY_DIAMONDS,
  CURRENCY_IDS,
  CURRENCY_STONE_COINS,
  DEFAULT_MAX_BALANCE,
  WALLET_FIELDS,
  normalizeBindingId,
  normalizeCurrencyId,
  normalizeWalletAmount,
  publicWalletFields,
  setWalletBalance,
  totalWalletBalance,
  transferableWalletBalance,
  walletBalance,
  walletFieldFor,
  walletLimitFor,
};
