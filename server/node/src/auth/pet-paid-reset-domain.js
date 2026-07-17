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
  preflightPetPaidReset,
} = require("./pet-paid-reset");

const REQUEST_KEYS = new Set([
  "instanceId",
  "petId",
  "expectedProfileRevision",
  "expectedPriceConfigRevision",
]);

function createPetPaidResetDomain(ctx) {
  const {
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

  return {reset};
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
  normalizeRequest,
};
