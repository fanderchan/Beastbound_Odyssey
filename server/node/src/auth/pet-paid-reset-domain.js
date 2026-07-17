"use strict";

const {
  resolvePetPaidResetQuote,
} = require("./pet-paid-reset-policy-catalog");
const {planPetPaidResetDebit} = require("./pet-paid-reset-payment");
const {
  setWalletBalance,
  walletBalance,
} = require("./currency-wallet");
const {
  applyPetPaidReset,
  inspectPetPaidResetEligibility,
  preflightPetPaidReset,
} = require("./pet-paid-reset");

const REQUEST_KEYS = new Set([
  "instanceId",
  "petId",
  "expectedProfileRevision",
  "expectedPriceConfigRevision",
]);
const QUOTE_REQUEST_KEYS = new Set(["instanceId", "petId"]);
const CLEAR_CONSEQUENCE_IDS = Object.freeze([
  "level_and_exp",
  "rebirth_stage",
  "rebirth_growth_bonus",
  "rebirth_history",
  "growth_observation",
]);
const PRESERVE_CONSEQUENCE_IDS = Object.freeze([
  "pet_identity",
  "level_one_stats",
  "hidden_growth",
  "enhancement",
  "active_passive_skills",
  "learned_inherited_skills",
  "evolution_lineage",
]);
const NON_REFUND_CONSEQUENCE_IDS = Object.freeze([
  "training_time",
  "consumed_rebirth_inputs",
  "consumed_cultivation_inputs",
]);

function createPetPaidResetDomain(ctx) {
  const {
    activeBattleRoomForAccount,
    clone,
    currentDurableOperation,
    expToNextLevel,
    fail,
    load,
    now,
    ok,
    persistProfileForAccount,
    petPaidResetPolicyCatalog,
    petRebirthGrowthCycle,
    petRequiredByActiveQuest,
    profilePetIndexById,
    profilePetInstances,
    profilePetName,
    profileStoneCoinLimit,
    profileSummaryForAccount,
    publicAccount,
    rawBackpackAssetConflict,
    resolveSession,
    save,
  } = ctx;

  function quote(token, payloadValue = {}) {
    const request = normalizeQuoteRequest(payloadValue);
    if (!request.ok) {
      return fail(request.code, request.message);
    }
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const binding = data.profileBindings && data.profileBindings[resolved.account.accountId];
    const profileDoc = binding && binding.playerId && data.profiles
      ? data.profiles[binding.playerId]
      : null;
    if (!binding || !profileDoc || !profileDoc.profile || typeof profileDoc.profile !== "object" || Array.isArray(profileDoc.profile)) {
      return fail("profile_missing", "请先创建角色档案。", {
        profileBinding: binding || null,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const profile = profileDoc.profile;
    if (typeof activeBattleRoomForAccount === "function" && activeBattleRoomForAccount(data, resolved.account.accountId)) {
      return fail("battle_profile_mutation_locked", "战斗中不能重置宠物，请在战斗结束后重试。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    if (String(profile.offlineHang && profile.offlineHang.session && profile.offlineHang.session.status || "") === "active") {
      return fail("offline_hang_active", "正在离线挂机，请先领取或取消离线收益。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const backpackConflict = typeof rawBackpackAssetConflict === "function"
      ? rawBackpackAssetConflict(profile)
      : null;
    if (backpackConflict) {
      return fail(backpackConflict.code, backpackConflict.message, {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const petIndex = profilePetIndexById(profile, request.instanceId);
    const pets = profilePetInstances(profile);
    const pet = petIndex >= 0 ? pets[petIndex] : null;
    if (!pet) {
      return fail("pet_missing", "没有找到这只宠物。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const protection = protectedPetFailure(
      profile,
      pet,
      request.instanceId,
      petRequiredByActiveQuest,
      profilePetName,
    );
    if (protection) {
      return fail(protection.code, protection.message, {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const formId = String(pet.formId || pet.templateId || pet.speciesId || "").trim();
    const quoted = resolvePetPaidResetQuote(
      petPaidResetPolicyCatalog,
      data.petPaidResetConfig,
      formId,
    );
    if (!quoted.ok) {
      return fail(quoted.code, quoted.message, {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const inspected = inspectPetPaidResetEligibility(pet, {
      quote: quoted.quote,
      growthCycle: petRebirthGrowthCycle,
    });
    if (!inspected.ok) {
      return fail(inspected.code, inspected.message, {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const paymentPlan = planPetPaidResetDebit(profile, quoted, {
      stoneCoinLimit: profileStoneCoinLimit,
    });
    if (!paymentPlan.ok && paymentPlan.code !== "pet_paid_reset_currency_insufficient") {
      return fail(paymentPlan.code, paymentPlan.message, {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    return ok({
      profileBinding: binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      paidResetQuote: publicQuote({binding, inspected, paymentPlan, quote: quoted.quote}),
      message: paymentPlan.ok ? "宠物重置报价已刷新。" : "宠物重置报价已刷新，当前货币不足。",
    });
  }

  function reset(token, payloadValue = {}) {
    const operation = typeof currentDurableOperation === "function"
      ? currentDurableOperation()
      : null;
    if (!operation || typeof operation.operationId !== "string" || operation.operationId === "") {
      return fail("idempotency_key_required", "本操作需要有效的操作标识，请刷新后重试。");
    }
    const request = normalizeRequest(payloadValue);
    if (!request.ok) {
      return fail(request.code, request.message);
    }
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const binding = data.profileBindings && data.profileBindings[resolved.account.accountId];
    const profileDoc = binding && binding.playerId && data.profiles
      ? data.profiles[binding.playerId]
      : null;
    if (!binding || !profileDoc || !profileDoc.profile || typeof profileDoc.profile !== "object" || Array.isArray(profileDoc.profile)) {
      return fail("profile_missing", "请先创建角色档案。", {
        profileBinding: binding || null,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const currentRevision = Math.max(0, Math.trunc(Number(binding.profileRevision || 0)));
    if (request.expectedProfileRevision !== currentRevision) {
      return fail("revision_conflict", "角色档案已经变化，请刷新宠物资料和报价后重试。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const backpackConflict = typeof rawBackpackAssetConflict === "function"
      ? rawBackpackAssetConflict(profileDoc.profile)
      : null;
    if (backpackConflict) {
      return fail(backpackConflict.code, backpackConflict.message, {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }

    const profile = clone(profileDoc.profile);
    const petIndex = profilePetIndexById(profile, request.instanceId);
    const pets = profilePetInstances(profile);
    const pet = petIndex >= 0 ? pets[petIndex] : null;
    if (!pet) {
      return fail("pet_missing", "没有找到这只宠物。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const petName = profilePetName(pet);
    if (pet.locked === true) {
      return fail("pet_locked", `${petName} 已锁定，请先解锁后再重置。`, {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    if (typeof petRequiredByActiveQuest === "function" && petRequiredByActiveQuest(profile, pet)) {
      return fail("pet_required_by_quest", `${petName} 是当前任务需要的宠物，不能重置。`, {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    if (
      String(pet.state || "") === "riding"
      || String(profile.ridePetInstanceId || "") === request.instanceId
    ) {
      return fail("pet_riding", `${petName} 正在骑乘，请先取消骑乘后再重置。`, {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }

    const formId = String(pet.formId || pet.templateId || pet.speciesId || "").trim();
    const quoted = resolvePetPaidResetQuote(
      petPaidResetPolicyCatalog,
      data.petPaidResetConfig,
      formId,
    );
    if (!quoted.ok) {
      return fail(quoted.code, quoted.message, {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    if (quoted.quote.configRevision !== request.expectedPriceConfigRevision) {
      return fail("pet_paid_reset_config_revision_conflict", "宠物重置价格已经变化，请刷新报价后重新确认。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const preflight = preflightPetPaidReset(pet, {
      operationId: operation.operationId,
      quote: quoted.quote,
      growthCycle: petRebirthGrowthCycle,
    });
    if (!preflight.ok) {
      return fail(preflight.code, preflight.message, {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const paymentPlan = planPetPaidResetDebit(profile, quoted, {
      stoneCoinLimit: profileStoneCoinLimit,
    });
    if (!paymentPlan.ok) {
      return fail(paymentPlan.code, paymentPlan.message, {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
        payment: publicPaymentFailure(paymentPlan),
      });
    }
    const resetResult = applyPetPaidReset(pet, {
      operationId: operation.operationId,
      recordedAt: new Date(Number(now())).toISOString(),
      quote: quoted.quote,
      paymentPlan,
      growthCycle: petRebirthGrowthCycle,
      expToNextLevel,
    });
    if (!resetResult.ok) {
      return fail(resetResult.code, resetResult.message, {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    if (!applyPaymentPlan(profile, paymentPlan, {stoneCoinLimit: profileStoneCoinLimit})) {
      return fail("pet_paid_reset_payment_apply_failed", "宠物重置扣款校验失败，本次操作未执行。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    pets[petIndex] = resetResult.pet;
    const persisted = persistProfileForAccount(data, resolved.account, binding, profile, now);
    save(data);
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(profile),
      paidReset: resetResult.publicResult,
      logLines: [resetResult.publicResult.message],
      message: resetResult.publicResult.message,
    });
  }

  return {quote, reset};
}

function normalizeQuoteRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return failure("pet_paid_reset_quote_request_invalid", "宠物重置报价请求格式不正确。");
  }
  if (Object.keys(value).some((key) => !QUOTE_REQUEST_KEYS.has(key))) {
    return failure("pet_paid_reset_quote_request_invalid", "宠物重置报价请求包含不受支持的字段。");
  }
  const instanceId = String(value.instanceId || value.petId || "").trim();
  const alias = String(value.petId || "").trim();
  if (
    instanceId === ""
    || instanceId.length > 160
    || (alias !== "" && String(value.instanceId || "").trim() !== "" && alias !== String(value.instanceId).trim())
  ) {
    return failure("pet_paid_reset_pet_invalid", "宠物身份不正确，请刷新后重试。");
  }
  return {ok: true, instanceId};
}

function protectedPetFailure(profile, pet, instanceId, petRequiredByActiveQuest, profilePetName) {
  const petName = profilePetName(pet);
  if (pet.locked === true) {
    return failure("pet_locked", `${petName} 已锁定，请先解锁后再重置。`);
  }
  if (typeof petRequiredByActiveQuest === "function" && petRequiredByActiveQuest(profile, pet)) {
    return failure("pet_required_by_quest", `${petName} 是当前任务需要的宠物，不能重置。`);
  }
  if (String(pet.state || "") === "riding" || String(profile.ridePetInstanceId || "") === instanceId) {
    return failure("pet_riding", `${petName} 正在骑乘，请先取消骑乘后再重置。`);
  }
  return null;
}

function publicQuote(input) {
  const {binding, inspected, paymentPlan, quote} = input;
  const cultivation = inspected.cultivation.record;
  const balances = paymentPlan && paymentPlan.balances && typeof paymentPlan.balances === "object"
    ? paymentPlan.balances
    : {};
  return {
    schemaVersion: 1,
    profileRevision: Math.max(0, Math.trunc(Number(binding.profileRevision || 0))),
    configRevision: quote.configRevision,
    pet: {
      instanceId: inspected.instanceId,
      formId: inspected.formId,
      formName: String(quote.formName || inspected.pet.formName || inspected.pet.name || "宠物"),
      level: inspected.beforeLevel,
      rebirthCount: cultivation.rebirthCount,
      enhanceLevel: cultivation.enhanceLevel,
      binding: String(inspected.pet.binding || "unbound"),
      paidResetCount: inspected.paidResetState.count,
    },
    payment: {
      currencyId: quote.currencyId,
      amount: quote.amount,
      affordable: paymentPlan.ok === true,
      available: Math.max(0, Math.trunc(Number(paymentPlan.available || 0))),
      shortfall: Math.max(0, Math.trunc(Number(paymentPlan.shortfall || 0))),
      balances: Object.fromEntries(Object.entries(balances).map(([key, value]) => [
        key,
        Math.max(0, Math.trunc(Number(value || 0))),
      ])),
      debits: paymentPlan.ok === true
        ? paymentPlan.debits.map((debit) => ({binding: debit.binding, amount: debit.amount}))
        : [],
    },
    result: {level: 1, rebirthCount: 0, binding: "unbound"},
    consequences: {
      clears: [...CLEAR_CONSEQUENCE_IDS],
      preserves: [...PRESERVE_CONSEQUENCE_IDS],
      nonRefunded: [...NON_REFUND_CONSEQUENCE_IDS],
    },
  };
}

function normalizeRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return failure("pet_paid_reset_request_invalid", "宠物重置请求格式不正确。");
  }
  if (Object.keys(value).some((key) => !REQUEST_KEYS.has(key))) {
    return failure("pet_paid_reset_request_invalid", "宠物重置请求包含不受支持的字段。");
  }
  const instanceId = String(value.instanceId || value.petId || "").trim();
  const alias = String(value.petId || "").trim();
  if (
    instanceId === ""
    || instanceId.length > 160
    || (alias !== "" && String(value.instanceId || "").trim() !== "" && alias !== String(value.instanceId).trim())
  ) {
    return failure("pet_paid_reset_pet_invalid", "宠物身份不正确，请刷新后重试。");
  }
  if (
    !Number.isSafeInteger(value.expectedProfileRevision)
    || value.expectedProfileRevision < 0
    || !Number.isSafeInteger(value.expectedPriceConfigRevision)
    || value.expectedPriceConfigRevision < 0
  ) {
    return failure("pet_paid_reset_revision_invalid", "宠物重置缺少有效的档案或报价版本。");
  }
  return {
    ok: true,
    instanceId,
    expectedProfileRevision: value.expectedProfileRevision,
    expectedPriceConfigRevision: value.expectedPriceConfigRevision,
  };
}

function applyPaymentPlan(profile, plan, options = {}) {
  for (const debit of plan.debits) {
    const current = walletBalance(profile, plan.currencyId, debit.binding, options);
    if (current !== debit.before || debit.after !== debit.before - debit.amount) {
      return false;
    }
  }
  for (const debit of plan.debits) {
    if (!setWalletBalance(profile, plan.currencyId, debit.binding, debit.after, options)) {
      return false;
    }
  }
  return true;
}

function publicPaymentFailure(plan) {
  return {
    schemaVersion: 1,
    currencyId: String(plan && plan.currencyId || ""),
    amount: Math.max(0, Math.trunc(Number(plan && plan.amount || 0))),
    available: Math.max(0, Math.trunc(Number(plan && plan.available || 0))),
    shortfall: Math.max(0, Math.trunc(Number(plan && plan.shortfall || 0))),
  };
}

function failure(code, message) {
  return {ok: false, code, message};
}

module.exports = {
  createPetPaidResetDomain,
  normalizeQuoteRequest,
  normalizeRequest,
};
