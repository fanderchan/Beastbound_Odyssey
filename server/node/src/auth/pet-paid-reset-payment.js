"use strict";

const {
  BINDING_IDS,
  CURRENCY_IDS,
  walletBalance,
  walletFieldFor,
} = require("./currency-wallet");

function planPetPaidResetDebit(profile, quoteValue, options = {}) {
  const quote = quoteValue && quoteValue.quote ? quoteValue.quote : quoteValue;
  if (!quote || typeof quote !== "object" || Array.isArray(quote)) {
    return invalidPlan("宠物重置报价缺失。");
  }
  const currencyId = String(quote.currencyId || "");
  const amount = Number(quote.amount);
  const policy = quote.walletPolicy;
  if (
    !CURRENCY_IDS.includes(currencyId)
    || !Number.isSafeInteger(amount)
    || amount < 1
    || !policy
    || typeof policy !== "object"
    || Array.isArray(policy)
  ) {
    return invalidPlan("宠物重置报价或货币无效。");
  }
  const allowedBindings = Array.isArray(policy.allowedBindings)
    ? policy.allowedBindings.map((entry) => String(entry || ""))
    : [];
  const debitOrder = Array.isArray(policy.debitOrder)
    ? policy.debitOrder.map((entry) => String(entry || ""))
    : [];
  if (
    allowedBindings.length < 1
    || new Set(allowedBindings).size !== allowedBindings.length
    || new Set(debitOrder).size !== debitOrder.length
    || allowedBindings.some((binding) => !BINDING_IDS.includes(binding))
    || debitOrder.some((binding) => !allowedBindings.includes(binding))
    || debitOrder.length !== allowedBindings.length
    || typeof policy.allowSplit !== "boolean"
    || policy.allowSplit !== (allowedBindings.length > 1)
  ) {
    return invalidPlan("宠物重置钱包扣款策略无效。");
  }
  const balanceOptions = {
    stoneCoinLimit: options.stoneCoinLimit,
    diamondLimit: options.diamondLimit,
  };
  const balances = Object.fromEntries(allowedBindings.map((binding) => [
    binding,
    walletBalance(profile, currencyId, binding, balanceOptions),
  ]));
  const available = Object.values(balances).reduce((sum, value) => sum + value, 0);
  if (available < amount) {
    return {
      ok: false,
      code: "pet_paid_reset_currency_insufficient",
      message: "宠物重置所需货币不足。",
      currencyId,
      amount,
      available,
      shortfall: amount - available,
      balances,
      debits: [],
    };
  }
  let remaining = amount;
  const debits = [];
  for (const binding of debitOrder) {
    const before = balances[binding];
    const debitAmount = Math.min(before, remaining);
    if (debitAmount > 0) {
      debits.push({
        currencyId,
        binding,
        field: walletFieldFor(currencyId, binding),
        amount: debitAmount,
        before,
        after: before - debitAmount,
      });
      remaining -= debitAmount;
    }
  }
  if (remaining !== 0 || (!policy.allowSplit && debits.length !== 1)) {
    return invalidPlan("宠物重置钱包扣款计划无法完整覆盖报价。");
  }
  return {
    ok: true,
    currencyId,
    amount,
    available,
    shortfall: 0,
    balances,
    debits,
  };
}

function invalidPlan(message) {
  return {
    ok: false,
    code: "pet_paid_reset_payment_policy_invalid",
    message: String(message || "宠物重置扣款策略无效。"),
    debits: [],
  };
}

module.exports = {
  planPetPaidResetDebit,
};
