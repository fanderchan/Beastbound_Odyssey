"use strict";

const crypto = require("node:crypto");
const {
  inspectPetEvolutionEligibility,
} = require("./pet-evolution");
const {
  BINDING_BOUND,
  CURRENCY_STONE_COINS,
  setWalletBalance,
  walletBalance,
} = require("./currency-wallet");

const GM_PET_EVOLUTION_QA_COMMAND_ID = "gm_pet_evolution_qa";
const GM_PET_EVOLUTION_QA_MANIFEST_ID = "pet_evolution_qa_v1";
const QA_MANIFESTS_PROFILE_KEY = "gmQaPetSampleManifests";
const QA_SAMPLE_MARKER_KEY = "qaSample";
const QA_SAMPLE_SOURCE = "gm_pet_evolution_qa_manifest";
const QA_SAMPLE_GENERATION_ATTEMPTS = 128;
const QA_STONE_COIN_MINIMUM = 600000;
const QA_STAGE_ONE_LOW_BONUS = Object.freeze({
  maxHp: 1.481988,
  attack: 0.347273,
  defense: 0.334516,
  quick: 0.348396,
});
const QA_STAGE_ONE_HIGH_BONUS = Object.freeze({
  maxHp: 1.895784,
  attack: 0.447598,
  defense: 0.43318,
  quick: 0.455753,
});
const QA_SAMPLE_PLANS = Object.freeze([
  Object.freeze({
    slotId: "evolution_wuli_below_p90",
    routeId: "wuli_crystal_evolution_v1",
    expectedEligible: false,
    name: "进化验收·乌力未达标",
    rebirthGrowthBonus: QA_STAGE_ONE_LOW_BONUS,
  }),
  Object.freeze({
    slotId: "evolution_wuli_above_p90",
    routeId: "wuli_crystal_evolution_v1",
    expectedEligible: true,
    name: "进化验收·乌力达标",
    rebirthGrowthBonus: QA_STAGE_ONE_HIGH_BONUS,
  }),
  Object.freeze({
    slotId: "evolution_driftfox_below_p90",
    routeId: "driftfox_moon_gale_evolution_v1",
    expectedEligible: false,
    name: "进化验收·风狐未达标",
    rebirthGrowthBonus: QA_STAGE_ONE_LOW_BONUS,
  }),
  Object.freeze({
    slotId: "evolution_driftfox_above_p90",
    routeId: "driftfox_moon_gale_evolution_v1",
    expectedEligible: true,
    name: "进化验收·风狐达标",
    rebirthGrowthBonus: QA_STAGE_ONE_HIGH_BONUS,
  }),
]);

function createGmPetEvolutionQaDomain(ctx) {
  const {
    BATTLE_PET_MAX_PER_PARTICIPANT,
    BATTLE_PET_STATE_STANDBY,
    BATTLE_PET_STATE_STORAGE,
    BATTLE_PET_STORAGE_LIMIT,
    MAX_PET_LEVEL,
    activeBattleRoomForAccount,
    addRewardItemsToBackpack,
    backpackItemCount,
    bagItemIsBound,
    bagItemLabel,
    clone,
    createDefaultServerPet,
    expToNextLevel,
    fail,
    gmCommandAccess,
    load,
    newPetFactory,
    nextProfilePetInstanceSerial,
    ok,
    persistProfileForAccount,
    petEvolutionRouteCatalog,
    petExpSettlement,
    petGrowthCatalog,
    petRebirthGrowthCycle,
    profilePartyVisiblePetCount,
    profileStoneCoinLimit,
    profileStoragePetCount,
    profileSummaryForAccount,
    publicAccount,
    rawBackpackAssetConflict,
    recordGmCommandAudit,
    recordProfilePetCodexForm,
    save,
  } = ctx;

  function run(token, payload = {}) {
    const data = load();
    const access = gmCommandAccess(data, token, GM_PET_EVOLUTION_QA_COMMAND_ID);
    if (!access.ok) {
      return auditedFailure(data, access, access.code, access.message);
    }
    if (!validPayload(payload)) {
      return auditedFailure(data, access, "gm_pet_evolution_qa_payload_invalid", "宠物进化验收参数不正确，请刷新后重试。");
    }
    const resolved = targetProfile(data, access.resolved.account);
    if (!resolved.ok) {
      return auditedFailure(data, access, resolved.code, resolved.message);
    }
    if (activeBattleRoomForAccount(data, access.resolved.account.accountId)) {
      return auditedFailure(data, access, "gm_pet_evolution_qa_target_in_battle", "当前账号正在战斗，不能准备宠物进化验收档。");
    }
    if (String(resolved.profile.offlineHang && resolved.profile.offlineHang.session && resolved.profile.offlineHang.session.status || "") === "active") {
      return auditedFailure(data, access, "offline_hang_active", "当前账号正在离线挂机，请先领取或取消离线收益。");
    }
    const conflict = rawBackpackAssetConflict(resolved.profile);
    if (conflict) {
      return auditedFailure(data, access, conflict.code, conflict.message);
    }
    const manifest = resolveManifest(petEvolutionRouteCatalog, petGrowthCatalog);
    if (!manifest.ok) {
      return auditedFailure(data, access, manifest.code, manifest.message);
    }

    const beforeRevision = safeRevision(resolved.binding.profileRevision);
    const profile = clone(resolved.profile);
    const instances = Array.isArray(profile.petInstances) ? profile.petInstances : null;
    if (!instances) {
      return auditedFailure(data, access, "gm_pet_evolution_qa_profile_invalid", "宠物档案结构异常，验收档未改变。");
    }
    const expected = QA_SAMPLE_PLANS.map((plan) => {
      const route = manifest.routesById[plan.routeId];
      return {
        ...plan,
        sourceFormId: route.sourceFormId,
        targetFormId: route.targetFormId,
        instanceId: instanceIdForSlot(access.resolved.account.accountId, plan.slotId),
      };
    });
    const ledgers = isRecord(profile[QA_MANIFESTS_PROFILE_KEY])
      ? profile[QA_MANIFESTS_PROFILE_KEY]
      : {};
    const ledger = isRecord(ledgers[GM_PET_EVOLUTION_QA_MANIFEST_ID])
      ? ledgers[GM_PET_EVOLUTION_QA_MANIFEST_ID]
      : null;
    let samplesCreated = 0;
    let partyAdded = 0;
    let storageAdded = 0;
    if (!ledger) {
      if (expected.some((sample) => instances.some((pet) => stablePetId(pet) === sample.instanceId))) {
        return auditedFailure(data, access, "gm_pet_evolution_qa_provenance_conflict", "发现没有进化验收清单的同名宠物，已停止以避免覆盖。");
      }
      const totalCapacity = BATTLE_PET_MAX_PER_PARTICIPANT + BATTLE_PET_STORAGE_LIMIT;
      if (instances.length + expected.length > totalCapacity) {
        return auditedFailure(data, access, "gm_pet_evolution_qa_capacity_full", "宠物空间不足；请至少留出4个位置后重试。");
      }
      let serial = nextProfilePetInstanceSerial(profile, instances);
      let partyCount = profilePartyVisiblePetCount(profile);
      let storageCount = profileStoragePetCount(profile);
      for (const sample of expected) {
        const state = partyCount < BATTLE_PET_MAX_PER_PARTICIPANT
          ? BATTLE_PET_STATE_STANDBY
          : BATTLE_PET_STATE_STORAGE;
        if (state === BATTLE_PET_STATE_STORAGE && storageCount >= BATTLE_PET_STORAGE_LIMIT) {
          return auditedFailure(data, access, "gm_pet_evolution_qa_capacity_full", "兽栏空间不足，进化验收档未改变。");
        }
        let generated;
        try {
          generated = createQaPet({
            ...sample,
            capturedSerial: serial,
            createDefaultServerPet,
            expToNextLevel,
            growthCatalog: petGrowthCatalog,
            growthCycle: petRebirthGrowthCycle,
            maxPetLevel: MAX_PET_LEVEL,
            newPetFactory,
            petExpSettlement,
            route: manifest.routesById[sample.routeId],
            state,
          });
        } catch (_error) {
          return auditedFailure(data, access, "gm_pet_evolution_qa_creation_failed", "进化验收宠物生成失败，档案未改变。");
        }
        if (!generated || !generated.pet) {
          return auditedFailure(data, access, "gm_pet_evolution_qa_creation_failed", "未能在安全尝试次数内生成代表性进化样本，档案未改变。");
        }
        instances.push(generated.pet);
        recordProfilePetCodexForm(profile, sample.sourceFormId, true);
        serial += 1;
        samplesCreated += 1;
        if (state === BATTLE_PET_STATE_STORAGE) {
          storageCount += 1;
          storageAdded += 1;
        } else {
          partyCount += 1;
          partyAdded += 1;
        }
      }
      profile.nextPetInstanceSerial = serial;
      ledgers[GM_PET_EVOLUTION_QA_MANIFEST_ID] = {
        schemaVersion: 1,
        manifestId: GM_PET_EVOLUTION_QA_MANIFEST_ID,
        preparedAt: new Date(ctx.now()).toISOString(),
        slots: expected.map((sample) => ({
          slotId: sample.slotId,
          instanceId: sample.instanceId,
          routeId: sample.routeId,
          sourceFormId: sample.sourceFormId,
          expectedEligible: sample.expectedEligible,
        })),
      };
      profile[QA_MANIFESTS_PROFILE_KEY] = ledgers;
    } else if (!validLedger(ledger, expected)) {
      return auditedFailure(data, access, "gm_pet_evolution_qa_provenance_invalid", "宠物进化验收清单异常，未自动修复或重发。");
    }

    const abilityChanges = ensureEvolutionAbilities(profile, manifest.routes);
    const materialTopUp = topUpEvolutionMaterials(profile, manifest.routes, {
      addRewardItemsToBackpack,
      backpackItemCount,
    });
    if (!materialTopUp.ok) {
      return auditedFailure(data, access, materialTopUp.code, materialTopUp.message);
    }
    const stoneCoinChanged = topUpStoneCoins(profile, profileStoneCoinLimit);
    if (stoneCoinChanged === null) {
      return auditedFailure(data, access, "gm_pet_evolution_qa_wallet_failed", "进化验收石币补齐失败，档案未改变。");
    }
    const changed = (
      samplesCreated > 0
      || abilityChanges.length > 0
      || materialTopUp.addedItems.length > 0
      || stoneCoinChanged
    );
    const persisted = changed
      ? persistProfileForAccount(data, access.resolved.account, resolved.binding, profile, ctx.now)
      : {binding: resolved.binding};
    const sampleSummaries = expected.map((sample) => summarizeSample(
      instances.find((pet) => stablePetId(pet) === sample.instanceId),
      sample,
      manifest.routesById[sample.routeId],
      petGrowthCatalog,
      petRebirthGrowthCycle,
    ));
    const afterRevision = safeRevision(persisted.binding.profileRevision);
    const result = {
      commandId: GM_PET_EVOLUTION_QA_COMMAND_ID,
      schemaVersion: 1,
      summary: {
        schemaVersion: 1,
        manifestId: GM_PET_EVOLUTION_QA_MANIFEST_ID,
        changed,
        alreadyPrepared: samplesCreated === 0,
        samplesCreated,
        sampleCount: expected.length,
        presentCount: sampleSummaries.filter((sample) => sample.present).length,
        expectationMatchedCount: sampleSummaries.filter((sample) => sample.matchesExpectation).length,
        partyAdded,
        storageAdded,
        abilitiesAdded: abilityChanges.length,
        materialItemsAdded: materialTopUp.addedItems.reduce((sum, item) => sum + item.count, 0),
        primaryInstanceId: expected.find((sample) => sample.slotId === "evolution_wuli_above_p90").instanceId,
        profileRevisionBefore: beforeRevision,
        profileRevisionAfter: afterRevision,
        boundStoneCoins: walletBalance(profile, CURRENCY_STONE_COINS, BINDING_BOUND, {
          stoneCoinLimit: profileStoneCoinLimit,
        }),
      },
      samples: sampleSummaries,
      materials: materialSummary(profile, manifest.routes, {
        backpackItemCount,
        bagItemIsBound,
        bagItemLabel,
      }),
      assetGate: assetGateSummary(petEvolutionRouteCatalog),
    };
    const message = changed
      ? "宠物进化验收档已准备，并补齐资格、材料与石币下限。"
      : "宠物进化验收档已存在，已刷新代表样本和正式资源门禁状态。";
    const audit = recordGmCommandAudit(data, access, true, message, {
      manifestId: GM_PET_EVOLUTION_QA_MANIFEST_ID,
      samplesCreated,
      presentCount: result.summary.presentCount,
      expectationMatchedCount: result.summary.expectationMatchedCount,
      abilitiesAdded: abilityChanges.length,
      materialItemsAdded: result.summary.materialItemsAdded,
      stoneCoinChanged,
      profileRevisionBefore: beforeRevision,
      profileRevisionAfter: afterRevision,
      productionOpen: result.assetGate.productionOpen,
    });
    save(data);
    return ok({
      account: publicAccount(access.resolved.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(access.resolved.account, data),
      profile,
      result,
      auditId: audit.auditId,
      message,
    });
  }

  function auditedFailure(data, access, code, message, details = {}) {
    const audit = recordGmCommandAudit(data, access, false, message, details);
    if (audit.recorded !== false) {
      save(data);
    }
    return fail(code, message, audit.auditId ? {auditId: audit.auditId} : {});
  }

  return Object.freeze({run});
}

function validPayload(value) {
  return isRecord(value)
    && Object.keys(value).length === 1
    && value.manifestId === GM_PET_EVOLUTION_QA_MANIFEST_ID;
}

function targetProfile(data, account) {
  const binding = data.profileBindings && data.profileBindings[account.accountId];
  const playerId = String(binding && binding.playerId || "");
  const profileDoc = playerId !== "" && data.profiles ? data.profiles[playerId] || null : null;
  const revision = safeRevision(binding && binding.profileRevision);
  if (
    !binding
    || !profileDoc
    || !isRecord(profileDoc.profile)
    || revision === null
    || safeRevision(profileDoc.profileRevision) !== revision
    || String(binding.accountId || "") !== account.accountId
    || String(profileDoc.accountId || "") !== account.accountId
    || String(profileDoc.playerId || "") !== playerId
  ) {
    return {ok: false, code: "profile_binding_conflict", message: "GM账号的角色档案归属或版本异常。"};
  }
  return {ok: true, binding, profile: profileDoc.profile};
}

function resolveManifest(routeCatalog, growthCatalog) {
  const routes = Array.isArray(routeCatalog && routeCatalog.routes) ? routeCatalog.routes : [];
  const routesById = Object.fromEntries(routes.map((route) => [String(route.routeId || ""), route]));
  const requiredRoutes = QA_SAMPLE_PLANS.map((plan) => routesById[plan.routeId]);
  if (
    requiredRoutes.some((route) => !isRecord(route))
    || new Set(requiredRoutes.map((route) => route.routeId)).size !== 2
    || requiredRoutes.some((route) => (
      !growthCatalog.profileById(route.sourceGrowthProfileId)
      || !isRecord(route.eligibility)
      || route.eligibility.requiredRebirthCount !== 1
      || route.eligibility.requiredLevel !== 140
      || route.eligibility.requiredIntrinsicPowerPercentile !== 90
      || !Number.isSafeInteger(route.eligibility.minimumIntrinsicCombatPower)
    ))
  ) {
    return {
      ok: false,
      code: "gm_pet_evolution_qa_manifest_invalid",
      message: "宠物进化验收清单与正式路线目录不一致。",
    };
  }
  return {ok: true, routes: [...new Set(requiredRoutes)], routesById};
}

function createQaPet(options) {
  for (let attempt = 1; attempt <= QA_SAMPLE_GENERATION_ATTEMPTS; attempt += 1) {
    let pet = options.createDefaultServerPet(
      options.instanceId,
      options.name,
      options.sourceFormId,
      options.state,
      1,
    );
    pet.capturedSerial = options.capturedSerial;
    const finalized = options.newPetFactory.finalizeLevelOne(pet, {purpose: QA_SAMPLE_SOURCE});
    if (!isRecord(finalized) || finalized.profileId !== options.route.sourceGrowthProfileId || !isRecord(finalized.pet)) {
      throw new Error("evolution QA factory mismatch");
    }
    pet = advancePetToLevel(
      finalized.pet,
      140,
      options.petExpSettlement,
      options.expToNextLevel,
      options.maxPetLevel,
    );
    const cultivation = cultivationRecord(options, attempt);
    const restarted = options.growthCycle.restart(pet, cultivation);
    if (!restarted || restarted.restarted !== true || !isRecord(restarted.pet)) {
      throw new Error("evolution QA rebirth restart failed");
    }
    pet = advancePetToLevel(
      restarted.pet,
      140,
      options.petExpSettlement,
      options.expToNextLevel,
      options.maxPetLevel,
    );
    pet.binding = "bound";
    pet.bound = true;
    pet.bindingLocked = false;
    pet.locked = false;
    pet.source = QA_SAMPLE_SOURCE;
    pet[QA_SAMPLE_MARKER_KEY] = {
      schemaVersion: 1,
      manifestId: GM_PET_EVOLUTION_QA_MANIFEST_ID,
      slotId: options.slotId,
      routeId: options.routeId,
      sourceFormId: options.sourceFormId,
      expectedEligible: options.expectedEligible,
    };
    const eligibility = inspectPetEvolutionEligibility(pet, {
      route: options.route,
      growthCatalog: options.growthCatalog,
      growthCycle: options.growthCycle,
    });
    const matches = options.expectedEligible
      ? eligibility.ok === true
      : eligibility.ok === false && eligibility.code === "pet_evolution_power_below_p90";
    if (matches) {
      return {pet, attempts: attempt};
    }
  }
  return null;
}

function cultivationRecord(options, attempt) {
  const timestamp = 1700000200 + attempt;
  const visible = structuredClone(options.rebirthGrowthBonus);
  const event = {
    schemaVersion: 1,
    mode: "rebirth",
    timestamp,
    petInstanceId: options.instanceId,
    petName: options.name,
    formId: options.sourceFormId,
    beforeLevel: 140,
    afterLevel: 1,
    beforeRebirthCount: 0,
    afterRebirthCount: 1,
    beforeEnhanceLevel: 3,
    afterEnhanceLevel: 3,
    visibleGrowthBonus: visible,
    summary: "0转 -> 1转，Lv140 -> Lv1",
    message: "GM进化验收一转记录",
  };
  return {
    schemaVersion: 1,
    rebirthCount: 1,
    enhanceLevel: 3,
    rebirthGrowthBonus: visible,
    history: [event],
    lastPreview: {},
    lastResult: structuredClone(event),
  };
}

function advancePetToLevel(pet, targetLevel, settlement, expToNextLevel, maxPetLevel) {
  let next = pet;
  while (next.level < targetLevel) {
    const required = expToNextLevel(next.level);
    const result = settlement.settle(next, required - next.exp, maxPetLevel, {name: String(next.name || "宠物")});
    if (!result || result.changed !== true || !isRecord(result.pet) || result.pet.level !== next.level + 1) {
      throw new Error("evolution QA level settlement failed");
    }
    next = result.pet;
  }
  if (next.level !== targetLevel) {
    throw new Error("evolution QA target level mismatch");
  }
  return next;
}

function validLedger(ledger, expected) {
  if (
    ledger.schemaVersion !== 1
    || ledger.manifestId !== GM_PET_EVOLUTION_QA_MANIFEST_ID
    || !Array.isArray(ledger.slots)
    || ledger.slots.length !== expected.length
  ) {
    return false;
  }
  return expected.every((sample) => ledger.slots.some((slot) => (
    isRecord(slot)
    && slot.slotId === sample.slotId
    && slot.instanceId === sample.instanceId
    && slot.routeId === sample.routeId
    && slot.sourceFormId === sample.sourceFormId
    && slot.expectedEligible === sample.expectedEligible
  )));
}

function ensureEvolutionAbilities(profile, routes) {
  const current = uniqueStrings(profile.unlockedAbilities);
  const added = [];
  for (const route of routes) {
    const abilityId = String(route && route.license && route.license.abilityId || "").trim();
    if (abilityId !== "" && !current.includes(abilityId)) {
      current.push(abilityId);
      added.push(abilityId);
    }
  }
  profile.unlockedAbilities = current;
  return added;
}

function topUpEvolutionMaterials(profile, routes, deps) {
  const requirements = new Map();
  for (const route of routes) {
    for (const item of Array.isArray(route && route.cost && route.cost.items) ? route.cost.items : []) {
      const itemId = String(item.itemId || "").trim();
      const count = Math.max(0, Math.trunc(Number(item.count || 0)));
      requirements.set(itemId, (requirements.get(itemId) || 0) + count);
    }
  }
  const rewards = [];
  for (const [itemId, required] of requirements.entries()) {
    const available = deps.backpackItemCount(profile.backpackSlots, itemId);
    if (available < required) rewards.push({itemId, count: required - available});
  }
  if (rewards.length === 0) return {ok: true, addedItems: []};
  const added = deps.addRewardItemsToBackpack(profile.backpackSlots, rewards);
  if (!added || !Array.isArray(added.lostItems) || added.lostItems.length > 0) {
    return {ok: false, code: "gm_pet_evolution_qa_backpack_full", message: "背包空间不足，无法补齐进化验收材料；档案未改变。"};
  }
  profile.backpackSlots = added.slots;
  return {ok: true, addedItems: Array.isArray(added.addedItems) ? added.addedItems : []};
}

function topUpStoneCoins(profile, stoneCoinLimit) {
  const options = {stoneCoinLimit};
  const current = walletBalance(profile, CURRENCY_STONE_COINS, BINDING_BOUND, options);
  if (current >= QA_STONE_COIN_MINIMUM) return false;
  return setWalletBalance(
    profile,
    CURRENCY_STONE_COINS,
    BINDING_BOUND,
    QA_STONE_COIN_MINIMUM,
    options,
  ) ? true : null;
}

function summarizeSample(pet, sample, route, growthCatalog, growthCycle) {
  if (!isRecord(pet)) {
    return {
      schemaVersion: 1,
      slotId: sample.slotId,
      instanceId: sample.instanceId,
      routeId: sample.routeId,
      sourceFormName: String(route.presentation && route.presentation.sourceName || route.sourceFormId),
      targetFormName: String(route.presentation && route.presentation.name || route.targetFormId),
      present: false,
      expectedEligible: sample.expectedEligible,
      eligible: false,
      matchesExpectation: false,
      eligibilityCode: "sample_missing",
      eligibilityMessage: "样本已不存在；为避免重复发放，不会自动补回。",
      intrinsicCombatPower: 0,
      minimumIntrinsicCombatPower: route.eligibility.minimumIntrinsicCombatPower,
      requiredPercentile: route.eligibility.requiredIntrinsicPowerPercentile,
    };
  }
  const eligibility = inspectPetEvolutionEligibility(pet, {route, growthCatalog, growthCycle});
  const eligible = eligibility.ok === true;
  const matchesExpectation = sample.expectedEligible
    ? eligible
    : eligibility.ok === false && eligibility.code === "pet_evolution_power_below_p90";
  return {
    schemaVersion: 1,
    slotId: sample.slotId,
    instanceId: sample.instanceId,
    routeId: sample.routeId,
    sourceFormName: String(pet.formName || route.sourceFormId),
    targetFormName: String(route.presentation && route.presentation.name || route.targetFormId),
    present: true,
    name: String(pet.name || pet.formName || "宠物"),
    level: Math.max(0, Math.trunc(Number(pet.level || 0))),
    rebirthCount: Math.max(0, Math.trunc(Number(pet.petCultivation && pet.petCultivation.rebirthCount || 0))),
    expectedEligible: sample.expectedEligible,
    eligible,
    matchesExpectation,
    eligibilityCode: eligible ? "ok" : String(eligibility.code || "pet_evolution_failed"),
    eligibilityMessage: eligible ? "已达到同形态P90进化门槛。" : String(eligibility.message || "当前不能进化。"),
    intrinsicCombatPower: Math.max(0, Math.trunc(Number(eligibility.intrinsicCombatPower || 0))),
    minimumIntrinsicCombatPower: route.eligibility.minimumIntrinsicCombatPower,
    requiredPercentile: route.eligibility.requiredIntrinsicPowerPercentile,
  };
}

function materialSummary(profile, routes, deps) {
  const requirements = new Map();
  for (const route of routes) {
    for (const item of route.cost.items) {
      requirements.set(item.itemId, (requirements.get(item.itemId) || 0) + item.count);
    }
  }
  return [...requirements.entries()].map(([itemId, required]) => ({
    itemId,
    label: deps.bagItemLabel(itemId),
    binding: deps.bagItemIsBound(itemId) ? "bound" : "unbound",
    required,
    available: deps.backpackItemCount(profile.backpackSlots, itemId),
  }));
}

function assetGateSummary(routeCatalog) {
  const routes = Array.isArray(routeCatalog && routeCatalog.routes) ? routeCatalog.routes : [];
  const routeSummaries = routes.map((route) => ({
    routeId: route.routeId,
    targetFormName: String(route.presentation && route.presentation.name || route.targetFormId),
    status: String(route.assetGate && route.assetGate.status || "deferred"),
  }));
  const runtimeEnabled = routeCatalog && routeCatalog.runtimeEnabled === true;
  return {
    schemaVersion: 1,
    runtimeEnabled,
    productionOpen: runtimeEnabled && routeSummaries.length > 0 && routeSummaries.every((route) => route.status === "formal"),
    routes: routeSummaries,
  };
}

function instanceIdForSlot(accountId, slotId) {
  const digest = crypto.createHash("sha256").update(String(accountId || "")).digest("hex").slice(0, 16);
  return `pet_gmqa_${digest}_${slotId}`;
}

function stablePetId(pet) {
  return String(pet && (pet.instanceId || pet.petId) || "");
}

function safeRevision(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function uniqueStrings(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((entry) => String(entry || "").trim()).filter(Boolean))];
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

module.exports = {
  GM_PET_EVOLUTION_QA_COMMAND_ID,
  GM_PET_EVOLUTION_QA_MANIFEST_ID,
  QA_SAMPLE_PLANS,
  QA_STONE_COIN_MINIMUM,
  createGmPetEvolutionQaDomain,
};
