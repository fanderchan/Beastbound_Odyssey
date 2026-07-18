"use strict";

const {
  BINDING_BOUND,
  BINDING_UNBOUND,
  CURRENCY_STONE_COINS,
  setWalletBalance,
  walletBalance,
} = require("./currency-wallet");
const {
  applyPetEvolution,
  inspectPetEvolutionEligibility,
} = require("./pet-evolution");

const QUOTE_REQUEST_KEYS = new Set(["instanceId", "petId", "routeId"]);
const EXECUTE_REQUEST_KEYS = new Set([
  "instanceId",
  "petId",
  "routeId",
  "expectedProfileRevision",
  "expectedCatalogId",
]);

function createPetEvolutionDomain(ctx) {
  const {
    activeBattleRoomForAccount,
    bagItemIsBound,
    bagItemLabel,
    backpackItemCount,
    clone,
    consumeBackpackItem,
    currentDurableOperation,
    expToNextLevel,
    fail,
    load,
    newPetFactory,
    now,
    ok,
    persistProfileForAccount,
    petEvolutionRouteCatalog,
    petGrowthCatalog,
    petRebirthGrowthCycle,
    petRequiredByActiveQuest,
    petTemplateForFormId,
    profileBackpackSlots,
    profileHasUnlockedAbility,
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
    if (!request.ok) return fail(request.code, request.message);
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) return fail(resolved.code, resolved.message);
    const context = resolvedProfileContext(data, resolved.account);
    if (!context.ok) {
      return fail(context.code, context.message, context.extra);
    }
    const commonFailure = commonProfileFailure(data, resolved.account, context, request.instanceId);
    if (commonFailure) return fail(commonFailure.code, commonFailure.message, commonFailure.extra);
    const routeResolution = routeForPet(context.pet, request.routeId);
    if (!routeResolution.ok) return fail(routeResolution.code, routeResolution.message, context.publicExtra);
    const route = routeResolution.route;
    const routeFailure = routeAccessFailure(context.profile, route);
    if (routeFailure) return fail(routeFailure.code, routeFailure.message, context.publicExtra);
    const inspected = inspectPetEvolutionEligibility(context.pet, {
      route,
      growthCatalog: petGrowthCatalog,
      growthCycle: petRebirthGrowthCycle,
    });
    if (!inspected.ok) {
      return fail(inspected.code, inspected.message, {
        ...context.publicExtra,
        ...(Number.isFinite(inspected.intrinsicCombatPower) ? {
          evolutionEligibility: {
            intrinsicCombatPower: inspected.intrinsicCombatPower,
            minimumIntrinsicCombatPower: inspected.minimumIntrinsicCombatPower,
          },
        } : {}),
      });
    }
    const affordability = evolutionAffordability(context.profile, route);
    return ok({
      ...context.publicExtra,
      petEvolutionQuote: publicQuote({
        binding: context.binding,
        catalogId: petEvolutionRouteCatalog.catalogId,
        inspected,
        route,
        affordability,
      }),
      message: affordability.affordable
        ? "宠物进化条件与消耗已刷新。"
        : "宠物进化条件已满足，但材料或石币不足。",
    });
  }

  function evolve(token, payloadValue = {}) {
    const operation = typeof currentDurableOperation === "function" ? currentDurableOperation() : null;
    if (!operation || typeof operation.operationId !== "string" || operation.operationId === "") {
      return fail("idempotency_key_required", "本操作需要有效的操作标识，请刷新后重试。");
    }
    const request = normalizeExecuteRequest(payloadValue);
    if (!request.ok) return fail(request.code, request.message);
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) return fail(resolved.code, resolved.message);
    const context = resolvedProfileContext(data, resolved.account);
    if (!context.ok) return fail(context.code, context.message, context.extra);
    const currentRevision = Math.max(0, Math.trunc(Number(context.binding.profileRevision || 0)));
    if (request.expectedProfileRevision !== currentRevision) {
      return fail("revision_conflict", "角色档案已经变化，请刷新宠物资料和进化条件后重试。", context.publicExtra);
    }
    if (request.expectedCatalogId !== String(petEvolutionRouteCatalog.catalogId || "")) {
      return fail("pet_evolution_catalog_conflict", "进化规则已经变化，请刷新条件后重新确认。", context.publicExtra);
    }
    const commonFailure = commonProfileFailure(data, resolved.account, context, request.instanceId);
    if (commonFailure) return fail(commonFailure.code, commonFailure.message, commonFailure.extra);

    const profile = clone(context.profile);
    const pets = profilePetInstances(profile);
    const petIndex = profilePetIndexById(profile, request.instanceId);
    const pet = petIndex >= 0 ? pets[petIndex] : null;
    if (!pet) return fail("pet_missing", "没有找到这只宠物。", context.publicExtra);
    const protection = protectedPetFailure(profile, pet, request.instanceId);
    if (protection) return fail(protection.code, protection.message, context.publicExtra);
    const routeResolution = routeForPet(pet, request.routeId);
    if (!routeResolution.ok) return fail(routeResolution.code, routeResolution.message, context.publicExtra);
    const route = routeResolution.route;
    const routeFailure = routeAccessFailure(profile, route);
    if (routeFailure) return fail(routeFailure.code, routeFailure.message, context.publicExtra);
    const affordability = evolutionAffordability(profile, route);
    if (!affordability.affordable) {
      return fail("pet_evolution_assets_insufficient", "进化所需材料或石币不足，本次操作未执行。", {
        ...context.publicExtra,
        petEvolutionCost: publicAffordability(affordability),
      });
    }
    const targetTemplate = petTemplateForFormId(route.targetFormId);
    const evolved = applyPetEvolution(pet, {
      operationId: operation.operationId,
      recordedAt: new Date(Number(now())).toISOString(),
      route,
      targetTemplate,
      growthCatalog: petGrowthCatalog,
      growthCycle: petRebirthGrowthCycle,
      newPetFactory,
      expToNextLevel,
    });
    if (!evolved.ok) return fail(evolved.code, evolved.message, context.publicExtra);
    if (!applyEvolutionCosts(profile, route, affordability)) {
      return fail("pet_evolution_cost_apply_failed", "进化消耗校验失败，本次操作未执行。", context.publicExtra);
    }
    pets[petIndex] = evolved.pet;
    const persisted = persistProfileForAccount(data, resolved.account, context.binding, profile, now);
    save(data);
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(profile),
      petEvolution: {
        ...evolved.publicResult,
        cost: publicAppliedCost(route, affordability),
      },
      logLines: [evolved.publicResult.message],
      message: evolved.publicResult.message,
    });
  }

  function resolvedProfileContext(data, account) {
    const binding = data.profileBindings && data.profileBindings[account.accountId];
    const profileDoc = binding && binding.playerId && data.profiles ? data.profiles[binding.playerId] : null;
    if (!binding || !profileDoc || !recordOrNull(profileDoc.profile)) {
      return {
        ok: false,
        code: "profile_missing",
        message: "请先创建角色档案。",
        extra: {
          profileBinding: binding || null,
          profileSummary: profileSummaryForAccount(account, data),
        },
      };
    }
    const profile = profileDoc.profile;
    const publicExtra = {
      profileBinding: binding,
      profileSummary: profileSummaryForAccount(account, data),
    };
    return {ok: true, binding, profile, publicExtra, pet: null};
  }

  function commonProfileFailure(data, account, context, instanceId) {
    if (!petEvolutionRouteCatalog.runtimeEnabled) {
      return failure("pet_evolution_disabled", String(
        petEvolutionRouteCatalog.disabledMessage || "宠物进化暂未开放。",
      ), context.publicExtra);
    }
    if (typeof activeBattleRoomForAccount === "function" && activeBattleRoomForAccount(data, account.accountId)) {
      return failure("battle_profile_mutation_locked", "战斗中不能进化宠物，请在战斗结束后重试。", context.publicExtra);
    }
    if (String(context.profile.offlineHang && context.profile.offlineHang.session && context.profile.offlineHang.session.status || "") === "active") {
      return failure("offline_hang_active", "正在离线挂机，请先领取或取消离线收益。", context.publicExtra);
    }
    const backpackConflict = typeof rawBackpackAssetConflict === "function"
      ? rawBackpackAssetConflict(context.profile)
      : null;
    if (backpackConflict) return failure(backpackConflict.code, backpackConflict.message, context.publicExtra);
    const petIndex = profilePetIndexById(context.profile, instanceId);
    const pets = profilePetInstances(context.profile);
    const pet = petIndex >= 0 ? pets[petIndex] : null;
    if (!pet) return failure("pet_missing", "没有找到这只宠物。", context.publicExtra);
    const protection = protectedPetFailure(context.profile, pet, instanceId);
    if (protection) return failure(protection.code, protection.message, context.publicExtra);
    context.pet = pet;
    return null;
  }

  function protectedPetFailure(profile, pet, instanceId) {
    const petName = profilePetName(pet);
    if (pet.locked === true) return failure("pet_locked", `${petName} 已锁定，请先解锁后再进化。`);
    if (typeof petRequiredByActiveQuest === "function" && petRequiredByActiveQuest(profile, pet)) {
      return failure("pet_required_by_quest", `${petName} 是当前任务需要的宠物，不能进化。`);
    }
    if (String(pet.state || "") === "riding" || String(profile.ridePetInstanceId || "") === instanceId) {
      return failure("pet_riding", `${petName} 正在骑乘，请先取消骑乘后再进化。`);
    }
    return null;
  }

  function routeForPet(pet, requestedRouteId) {
    const sourceFormId = String(pet && (pet.formId || pet.templateId || pet.speciesId) || "").trim();
    const requested = String(requestedRouteId || "").trim();
    const route = requested !== ""
      ? petEvolutionRouteCatalog.routesById && petEvolutionRouteCatalog.routesById[requested]
      : (Array.isArray(petEvolutionRouteCatalog.routes)
        ? petEvolutionRouteCatalog.routes.find((entry) => entry.sourceFormId === sourceFormId)
        : null);
    if (!route) return failure("pet_evolution_route_missing", "这只宠物当前没有可用的进化路线。");
    if (route.sourceFormId !== sourceFormId) return failure("pet_evolution_route_mismatch", "所选进化路线与宠物形态不匹配。");
    return {ok: true, route};
  }

  function routeAccessFailure(profile, route) {
    if (!profileHasUnlockedAbility(profile, route.license.abilityId)) {
      return failure("pet_evolution_license_required", "尚未完成该族系的一次性进化资格任务。");
    }
    if (route.assetGate && route.assetGate.status !== "formal") {
      return failure("pet_evolution_asset_gate", "该进化形态的正式资源尚未就绪，当前不会消耗宠物或材料。");
    }
    return null;
  }

  function evolutionAffordability(profile, route) {
    const slots = profileBackpackSlots(profile);
    const items = route.cost.items.map((cost) => {
      const available = backpackItemCount(slots, cost.itemId);
      return {
        itemId: cost.itemId,
        label: bagItemLabel(cost.itemId),
        binding: bagItemIsBound(cost.itemId) ? BINDING_BOUND : BINDING_UNBOUND,
        required: cost.count,
        available,
        enough: available >= cost.count,
      };
    });
    const stoneCoins = planBoundFirstStoneCoinDebit(profile, route.cost.stoneCoins, profileStoneCoinLimit);
    return {
      affordable: items.every((entry) => entry.enough) && stoneCoins.ok,
      items,
      stoneCoins,
    };
  }

  function applyEvolutionCosts(profile, route, affordability) {
    let slots = profileBackpackSlots(profile);
    for (const item of route.cost.items) {
      if (backpackItemCount(slots, item.itemId) < item.count) return false;
      const before = backpackItemCount(slots, item.itemId);
      slots = consumeBackpackItem(slots, item.itemId, item.count);
      if (backpackItemCount(slots, item.itemId) !== before - item.count) return false;
    }
    for (const debit of affordability.stoneCoins.debits) {
      const current = walletBalance(profile, CURRENCY_STONE_COINS, debit.binding, {
        stoneCoinLimit: profileStoneCoinLimit,
      });
      if (current !== debit.before || debit.after !== debit.before - debit.amount) return false;
    }
    for (const debit of affordability.stoneCoins.debits) {
      if (!setWalletBalance(profile, CURRENCY_STONE_COINS, debit.binding, debit.after, {
        stoneCoinLimit: profileStoneCoinLimit,
      })) return false;
    }
    profile.backpackSlots = slots;
    return true;
  }

  return {quote, evolve};
}

function planBoundFirstStoneCoinDebit(profile, amountValue, stoneCoinLimit) {
  const amount = positiveInteger(amountValue);
  if (amount < 1) return {ok: false, amount: 0, available: 0, shortfall: 0, balances: {}, debits: []};
  const options = {stoneCoinLimit};
  const balances = {
    bound: walletBalance(profile, CURRENCY_STONE_COINS, BINDING_BOUND, options),
    unbound: walletBalance(profile, CURRENCY_STONE_COINS, BINDING_UNBOUND, options),
  };
  const available = balances.bound + balances.unbound;
  if (available < amount) {
    return {ok: false, amount, available, shortfall: amount - available, balances, debits: []};
  }
  let remaining = amount;
  const debits = [];
  for (const binding of [BINDING_BOUND, BINDING_UNBOUND]) {
    const before = balances[binding];
    const debitAmount = Math.min(before, remaining);
    if (debitAmount > 0) {
      debits.push({binding, amount: debitAmount, before, after: before - debitAmount});
      remaining -= debitAmount;
    }
  }
  return {ok: remaining === 0, amount, available, shortfall: remaining, balances, debits};
}

function publicQuote({binding, catalogId, inspected, route, affordability}) {
  return {
    schemaVersion: 1,
    catalogId: String(catalogId || ""),
    routeId: route.routeId,
    profileRevision: Math.max(0, Math.trunc(Number(binding.profileRevision || 0))),
    pet: {
      instanceId: inspected.instanceId,
      sourceFormId: route.sourceFormId,
      sourceFormName: String(inspected.pet.formName || inspected.pet.name || route.sourceFormId),
      level: inspected.pet.level,
      rebirthCount: inspected.cultivation.rebirthCount,
      intrinsicCombatPower: inspected.intrinsicCombatPower,
      minimumIntrinsicCombatPower: inspected.minimumIntrinsicCombatPower,
      requiredPercentile: route.eligibility.requiredIntrinsicPowerPercentile,
    },
    result: {
      targetFormId: route.targetFormId,
      targetFormName: String(route.presentation && route.presentation.name || route.targetFormId),
      level: route.result.level,
      rebirthCount: route.result.rebirthCount,
      rerollLevelOneFourV: true,
      rerollHiddenGrowth: true,
      preservedHistoryStages: [0, 1],
      terminalStageLabel: "2转/进化/融合",
    },
    cost: publicAffordability(affordability),
  };
}

function publicAffordability(value) {
  return {
    affordable: value.affordable,
    items: value.items.map((entry) => ({...entry})),
    stoneCoins: {
      amount: value.stoneCoins.amount,
      available: value.stoneCoins.available,
      shortfall: value.stoneCoins.shortfall,
      balances: {...value.stoneCoins.balances},
      debits: value.stoneCoins.debits.map((entry) => ({binding: entry.binding, amount: entry.amount})),
    },
  };
}

function publicAppliedCost(route, affordability) {
  return {
    items: route.cost.items.map((entry) => ({itemId: entry.itemId, count: entry.count})),
    stoneCoins: route.cost.stoneCoins,
    stoneCoinDebits: affordability.stoneCoins.debits.map((entry) => ({
      binding: entry.binding,
      amount: entry.amount,
    })),
  };
}

function normalizeQuoteRequest(value) {
  if (!recordOrNull(value) || Object.keys(value).some((key) => !QUOTE_REQUEST_KEYS.has(key))) {
    return failure("pet_evolution_quote_request_invalid", "宠物进化条件请求格式不正确。");
  }
  return normalizedIdentityRequest(value, false);
}

function normalizeExecuteRequest(value) {
  if (!recordOrNull(value) || Object.keys(value).some((key) => !EXECUTE_REQUEST_KEYS.has(key))) {
    return failure("pet_evolution_request_invalid", "宠物进化请求格式不正确。");
  }
  const identity = normalizedIdentityRequest(value, true);
  if (!identity.ok) return identity;
  if (!Number.isSafeInteger(value.expectedProfileRevision) || value.expectedProfileRevision < 0) {
    return failure("pet_evolution_revision_invalid", "宠物进化缺少有效的档案版本。");
  }
  const expectedCatalogId = String(value.expectedCatalogId || "").trim();
  if (expectedCatalogId === "" || expectedCatalogId.length > 96) {
    return failure("pet_evolution_catalog_invalid", "宠物进化缺少有效的规则版本。");
  }
  return {
    ...identity,
    expectedProfileRevision: value.expectedProfileRevision,
    expectedCatalogId,
  };
}

function normalizedIdentityRequest(value, requireRoute) {
  const instanceId = String(value.instanceId || value.petId || "").trim();
  const alias = String(value.petId || "").trim();
  const explicit = String(value.instanceId || "").trim();
  const routeId = String(value.routeId || "").trim();
  if (instanceId === "" || instanceId.length > 160 || (alias !== "" && explicit !== "" && alias !== explicit)) {
    return failure("pet_evolution_pet_invalid", "宠物身份不正确，请刷新后重试。");
  }
  if ((requireRoute && routeId === "") || routeId.length > 96) {
    return failure("pet_evolution_route_invalid", "进化路线不正确，请刷新后重试。");
  }
  return {ok: true, instanceId, routeId};
}

function recordOrNull(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 ? number : 0;
}

function failure(code, message, extra = {}) {
  return {ok: false, code, message, extra};
}

module.exports = {
  createPetEvolutionDomain,
  normalizeExecuteRequest,
  normalizeQuoteRequest,
  planBoundFirstStoneCoinDebit,
};
