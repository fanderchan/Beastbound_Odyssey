"use strict";

const {isDeepStrictEqual} = require("node:util");

const {
  PET_FUSION_ROLE_IDS,
} = require("./pet-fusion-recipe-catalog");
const {
  inspectCanonicalStageOneCultivation,
} = require("./pet-evolution");
const {
  inspectPetFusionEligibility,
  resolvePetFusion,
} = require("./pet-fusion");

const PET_FUSION_SCHEMA_VERSION = 1;
const PET_FUSION_TERMINAL_STAGE = 2;
const REQUEST_ID_MAX_LENGTH = 160;
const QUOTE_REQUEST_KEYS = Object.freeze([
  "recipeId",
  "materialInstanceIds",
]);
const EXECUTE_REQUEST_KEYS = Object.freeze([
  ...QUOTE_REQUEST_KEYS,
  "expectedProfileRevision",
  "expectedCatalogId",
]);
const ZERO_GROWTH_BONUS = Object.freeze({
  maxHp: 0,
  attack: 0,
  defense: 0,
  quick: 0,
});
const ALLOWED_RESULT_STATES = new Set([
  "battle",
  "standby",
  "rest",
  "storage",
]);

function createPetFusionDomain(ctx) {
  const {
    activeBattleRoomForAccount,
    clone,
    currentDurableOperation,
    ensureActivePetAfterInstanceRemoval,
    expToNextLevel,
    fail,
    load,
    newPetFactory,
    nextProfilePetInstanceSerial,
    now,
    ok,
    persistProfileForAccount,
    petEvolutionRouteCatalog,
    petFusionRandomAuthority,
    petFusionRecipeCatalog,
    petFusionTargetTemplateForFormId,
    petRequiredByActiveQuest,
    petRebirthGrowthCycle,
    profilePetName,
    profileSummaryForAccount,
    publicAccount,
    rawBackpackAssetConflict,
    recordProfilePetCodexForm,
    resolveSession,
    save,
  } = ctx;

  function quote(token, payloadValue = {}) {
    const request = normalizeRequest(payloadValue, false);
    if (!request.ok) return fail(request.code, request.message);
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) return fail(resolved.code, resolved.message);
    const context = resolvedProfileContext(data, resolved.account);
    if (!context.ok) return fail(context.code, context.message, context.extra);
    const prepared = prepareFusion(data, resolved.account, context, request);
    if (!prepared.ok) {
      return fail(prepared.code, prepared.message, context.publicExtra);
    }
    return ok({
      ...context.publicExtra,
      petFusionQuote: publicQuote(context, prepared),
      message: "融合条件与技能遗传概率已刷新；本次查看不会消耗宠物。",
    });
  }

  function fuse(token, payloadValue = {}) {
    const operation = typeof currentDurableOperation === "function"
      ? currentDurableOperation()
      : null;
    if (!operation || typeof operation.operationId !== "string" || operation.operationId === "") {
      return fail("idempotency_key_required", "本操作需要有效的操作标识，请刷新后重试。");
    }
    const request = normalizeRequest(payloadValue, true);
    if (!request.ok) return fail(request.code, request.message);
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) return fail(resolved.code, resolved.message);
    const context = resolvedProfileContext(data, resolved.account);
    if (!context.ok) return fail(context.code, context.message, context.extra);
    const currentRevision = Math.max(
      0,
      Math.trunc(Number(context.binding.profileRevision || 0)),
    );
    if (request.expectedProfileRevision !== currentRevision) {
      return fail(
        "revision_conflict",
        "角色档案已经变化，请刷新三只材料宠和融合条件后重试。",
        context.publicExtra,
      );
    }
    if (request.expectedCatalogId !== String(petFusionRecipeCatalog.catalogId || "")) {
      return fail(
        "pet_fusion_catalog_conflict",
        "融合规则已经变化，请刷新条件后重新确认。",
        context.publicExtra,
      );
    }

    const profile = clone(context.profile);
    const canonicalized = canonicalizeFusionProfilePetContainer(profile);
    if (!canonicalized.ok) {
      return fail(canonicalized.code, canonicalized.message, context.publicExtra);
    }
    const mutationContext = {
      ...context,
      profile,
      publicExtra: context.publicExtra,
    };
    const prepared = prepareFusion(data, resolved.account, mutationContext, request);
    if (!prepared.ok) {
      return fail(prepared.code, prepared.message, context.publicExtra);
    }
    if (
      !petFusionRandomAuthority
      || typeof petFusionRandomAuthority.open !== "function"
    ) {
      return fail(
        "pet_fusion_random_context_invalid",
        "融合随机权威暂不可用，本次操作未执行。",
        context.publicExtra,
      );
    }
    let randomContext;
    try {
      randomContext = petFusionRandomAuthority.open();
    } catch {
      return fail(
        "pet_fusion_random_context_invalid",
        "融合随机权威暂不可用，本次操作未执行。",
        context.publicExtra,
      );
    }
    const resolvedFusion = resolvePetFusion(prepared.materialsByRole, {
      catalog: petFusionRecipeCatalog,
      evolutionRouteCatalog: petEvolutionRouteCatalog,
      recipeId: request.recipeId,
      randomContext,
    });
    if (!resolvedFusion.ok) {
      return fail(resolvedFusion.code, resolvedFusion.message, context.publicExtra);
    }
    const built = buildResultPet(profile, prepared, resolvedFusion, {
      operationId: operation.operationId,
      completedAtSec: Math.max(0, Math.trunc(Number(now()) / 1000)),
    });
    if (!built.ok) {
      return fail(built.code, built.message, context.publicExtra);
    }
    const applied = applyFusionToProfile(profile, prepared, built.pet);
    if (!applied.ok) {
      return fail(applied.code, applied.message, context.publicExtra);
    }

    recordProfilePetCodexForm(profile, prepared.recipe.targetFormId, false);
    const persisted = persistProfileForAccount(
      data,
      resolved.account,
      context.binding,
      profile,
      now,
    );
    save(data);
    const publicResult = publicFusionResult(prepared, resolvedFusion, built.pet);
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(profile),
      petFusion: publicResult,
      logLines: [publicResult.message],
      message: publicResult.message,
    });
  }

  function resolvedProfileContext(data, account) {
    const binding = data.profileBindings && data.profileBindings[account.accountId];
    const profileDoc = binding && binding.playerId && data.profiles
      ? data.profiles[binding.playerId]
      : null;
    if (
      !binding
      || !profileDoc
      || !recordOrNull(profileDoc.profile)
    ) {
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
    return {
      ok: true,
      binding,
      profile: profileDoc.profile,
      publicExtra: {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(account, data),
      },
    };
  }

  function prepareFusion(data, account, context, request) {
    if (!petFusionRecipeCatalog || petFusionRecipeCatalog.runtimeEnabled !== true) {
      return failure(
        "pet_fusion_disabled",
        String(
          petFusionRecipeCatalog && petFusionRecipeCatalog.disabledMessage
          || "宠物融合尚未开放。",
        ),
      );
    }
    if (
      typeof activeBattleRoomForAccount === "function"
      && activeBattleRoomForAccount(data, account.accountId)
    ) {
      return failure(
        "battle_profile_mutation_locked",
        "战斗中不能融合宠物，请在战斗结束后重试。",
      );
    }
    if (
      String(
        context.profile.offlineHang
        && context.profile.offlineHang.session
        && context.profile.offlineHang.session.status
        || "",
      ) === "active"
    ) {
      return failure("offline_hang_active", "正在离线挂机，请先领取或取消离线收益。");
    }
    const backpackConflict = typeof rawBackpackAssetConflict === "function"
      ? rawBackpackAssetConflict(context.profile)
      : null;
    if (backpackConflict) {
      return failure(backpackConflict.code, backpackConflict.message);
    }
    const recipe = petFusionRecipeCatalog.recipesById
      && petFusionRecipeCatalog.recipesById[request.recipeId];
    if (!recipe) {
      return failure("pet_fusion_recipe_missing", "没有找到所选融合配方。");
    }
    if (!recipe.assetGate || recipe.assetGate.status !== "formal") {
      return failure(
        "pet_fusion_asset_gate",
        "该融合形态的正式资源尚未就绪，当前不会消耗宠物。",
      );
    }
    const selectedPets = selectFusionProfilePetContainer(context.profile);
    if (!selectedPets.ok) return selectedPets;
    const pets = selectedPets.pets;
    const materialsByRole = {};
    for (const roleId of PET_FUSION_ROLE_IDS) {
      const instanceId = request.materialInstanceIds[roleId];
      const index = fusionPetIndexById(pets, instanceId);
      const pet = index >= 0 ? pets[index] : null;
      if (!pet) {
        return failure("pet_missing", `${roleLabel(roleId)}没有找到所选宠物。`);
      }
      const protection = protectedMaterialFailure(
        context.profile,
        pet,
        instanceId,
        roleId,
      );
      if (protection) return protection;
      materialsByRole[roleId] = pet;
    }
    const inspected = inspectPetFusionEligibility(materialsByRole, {
      catalog: petFusionRecipeCatalog,
      evolutionRouteCatalog: petEvolutionRouteCatalog,
      recipeId: request.recipeId,
    });
    if (!inspected.ok) return inspected;
    for (const roleId of PET_FUSION_ROLE_IDS) {
      const material = materialsByRole[roleId];
      const cultivation = inspectCanonicalStageOneCultivation(
        material.petCultivation,
      );
      if (!cultivation.ok) {
        return failure(
          "pet_fusion_material_cultivation_invalid",
          `${roleLabel(roleId)}材料的一转培养记录不完整，本次操作未执行。`,
        );
      }
      let growthPreflight;
      try {
        growthPreflight = petRebirthGrowthCycle.preflight(material);
      } catch {
        return failure(
          "pet_fusion_material_growth_unsupported",
          `${roleLabel(roleId)}材料成长数据异常，本次操作未执行。`,
        );
      }
      const geneProfile = petFusionRecipeCatalog.geneProfilesById[
        inspected.materialsByRole[roleId].geneProfileId
      ];
      if (
        !growthPreflight
        || growthPreflight.authorityV1 !== true
        || !geneProfile
        || growthPreflight.profileId !== geneProfile.growthProfileId
      ) {
        return failure(
          "pet_fusion_material_growth_unsupported",
          `${roleLabel(roleId)}材料必须是资料完整的 authority-v1 普通宠。`,
        );
      }
    }
    return {
      ok: true,
      recipe,
      inspected,
      materialsByRole,
    };
  }

  function protectedMaterialFailure(profile, pet, instanceId, roleId) {
    const label = roleLabel(roleId);
    const name = profilePetName(pet);
    if (pet.locked === true) {
      return failure("pet_locked", `${label}${name}已锁定，请先解锁后再融合。`);
    }
    if (
      typeof petRequiredByActiveQuest === "function"
      && petRequiredByActiveQuest(profile, pet)
    ) {
      return failure(
        "pet_required_by_quest",
        `${label}${name}是当前任务需要的宠物，不能用于融合。`,
      );
    }
    if (
      String(pet.state || "") === "riding"
      || String(profile.ridePetInstanceId || "") === instanceId
    ) {
      return failure("pet_riding", `${label}${name}正在骑乘，请先取消骑乘后再融合。`);
    }
    if (pet.captureOverflowPending === true) {
      return failure(
        "pet_capture_overflow_pending",
        `${label}${name}仍在安全收容流程中，不能用于融合。`,
      );
    }
    return null;
  }

  function publicQuote(context, prepared) {
    const targetTemplate = petFusionTargetTemplateForFormId(
      prepared.recipe.targetFormId,
    );
    return {
      schemaVersion: PET_FUSION_SCHEMA_VERSION,
      catalogId: String(petFusionRecipeCatalog.catalogId || ""),
      recipeId: prepared.recipe.recipeId,
      profileRevision: Math.max(
        0,
        Math.trunc(Number(context.binding.profileRevision || 0)),
      ),
      materials: PET_FUSION_ROLE_IDS.map((roleId) => {
        const pet = prepared.materialsByRole[roleId];
        const gene = prepared.inspected.materialsByRole[roleId];
        return {
          roleId,
          instanceId: gene.instanceId,
          formId: gene.formId,
          formName: String(pet.formName || pet.name || gene.formId),
          level: Number(pet.level),
          rebirthCount: Number(pet.petCultivation && pet.petCultivation.rebirthCount),
          specialActiveSkillId: gene.specialActiveSkillId,
          passiveSkillId: gene.passiveSkillId,
        };
      }),
      inheritance: {
        baseActiveSkillIds: [...petFusionRecipeCatalog.rules.baseActiveSkillIds],
        specialActiveInheritanceChance:
          petFusionRecipeCatalog.rules.specialActiveInheritanceChance,
        activeRollsIndependent: true,
        ordinaryOrTrainingActiveInheritance: false,
        duplicateActiveSkillPolicy: "deduplicate_after_roll_no_reroll",
        passiveSourceWeights: {
          ...petFusionRecipeCatalog.rules.passiveSourceWeights,
        },
        resultPassiveSkillCount:
          petFusionRecipeCatalog.rules.resultPassiveSkillCount,
      },
      result: {
        targetFormId: prepared.recipe.targetFormId,
        targetFormName: String(
          targetTemplate && targetTemplate.formName
          || prepared.recipe.targetFormId,
        ),
        level: prepared.recipe.result.level,
        rebirthCount: prepared.recipe.result.rebirthCount,
        terminalStage: PET_FUSION_TERMINAL_STAGE,
        terminalStageLabel: "2转/进化/融合",
        numericSource: prepared.recipe.result.numericSource,
        materialNumericInheritance: false,
        rideable: false,
      },
    };
  }

  function buildResultPet(profile, prepared, resolvedFusion, operation) {
    const blueprint = resolvedFusion.blueprint;
    const targetTemplate = petFusionTargetTemplateForFormId(
      prepared.recipe.targetFormId,
    );
    if (
      !recordOrNull(targetTemplate)
      || String(targetTemplate.formId || "") !== prepared.recipe.targetFormId
      || String(targetTemplate.growthSpeciesProfileId || "")
        !== prepared.recipe.targetGrowthProfileId
      || targetTemplate.riding
        && recordOrNull(targetTemplate.riding)
        && targetTemplate.riding.rideable === true
    ) {
      return failure(
        "pet_fusion_target_invalid",
        "融合目标形态配置异常，本次操作未执行。",
      );
    }
    if (
      !newPetFactory
      || typeof newPetFactory.finalizeLevelOneWithPrivateSeed !== "function"
      || typeof expToNextLevel !== "function"
    ) {
      return failure(
        "pet_fusion_context_invalid",
        "融合创建服务暂不可用，本次操作未执行。",
      );
    }
    const selectedPets = selectFusionProfilePetContainer(profile);
    if (!selectedPets.ok) return selectedPets;
    const pets = selectedPets.pets;
    let serial = nextProfilePetInstanceSerial(profile, pets);
    let instanceId = `pet_fusion_${serial}`;
    while (fusionPetIndexById(pets, instanceId) >= 0) {
      serial += 1;
      instanceId = `pet_fusion_${serial}`;
    }
    const state = resultPetState(profile, prepared, blueprint.resultStatePolicy);
    const binding = resultPetBinding(prepared, blueprint.bindingPolicy);
    const targetName = String(targetTemplate.formName || "融合宠物");
    const candidate = fusionTargetCandidate({
      binding,
      blueprint,
      instanceId,
      serial,
      state,
      targetName,
      targetTemplate,
    });

    let pet;
    try {
      pet = newPetFactory.finalizeLevelOneWithPrivateSeed(candidate, {
        purpose: "pet_fusion_result_growth",
        privateSeed: blueprint.fusionPrivate.growthPrivateSeed,
      }).pet;
    } catch {
      return failure(
        "pet_fusion_target_invalid",
        "融合目标成长生成失败，本次操作未执行。",
      );
    }
    const nextExp = Number(expToNextLevel(1));
    if (!Number.isSafeInteger(nextExp) || nextExp < 1) {
      return failure(
        "pet_fusion_context_invalid",
        "宠物等级经验配置异常，本次操作未执行。",
      );
    }
    const event = {
      schemaVersion: PET_FUSION_SCHEMA_VERSION,
      mode: "fusion",
      timestamp: operation.completedAtSec,
      petInstanceId: instanceId,
      petName: targetName,
      formId: prepared.recipe.targetFormId,
      beforeLevel: 1,
      afterLevel: 1,
      beforeRebirthCount: 0,
      afterRebirthCount: 1,
      summary: `三宠融合 -> ${targetName}，Lv1・1转融合终局`,
      message: `${targetName}融合完成；已进入“2转/进化/融合”终局。`,
    };
    pet.petCultivation = {
      schemaVersion: 1,
      rebirthCount: 1,
      enhanceLevel: 0,
      rebirthGrowthBonus: {...ZERO_GROWTH_BONUS},
      history: [clone(event)],
      lastPreview: {},
      lastResult: clone(event),
    };
    pet.lastCultivationResult = clone(event);
    pet.fusionLineage = {
      ...clone(blueprint.fusionLineage),
      catalogId: String(petFusionRecipeCatalog.catalogId || ""),
      targetFormName: targetName,
      completedAtSec: operation.completedAtSec,
      sourceMaterials: blueprint.fusionLineage.sourceMaterials.map((entry) => ({
        ...clone(entry),
        formName: String(
          prepared.materialsByRole[entry.roleId]
          && (
            prepared.materialsByRole[entry.roleId].formName
            || prepared.materialsByRole[entry.roleId].name
          )
          || entry.formId,
        ),
      })),
    };
    pet.fusionPrivate = {
      ...clone(blueprint.fusionPrivate),
      operationId: operation.operationId,
    };
    pet.exp = 0;
    pet.nextExp = nextExp;
    pet.hp = pet.maxHp;
    pet.activeSkillIds = [...blueprint.activeSkillIds];
    pet.petSkillSlots = [...blueprint.petSkillSlots];
    pet.passiveSkillIds = [...blueprint.passiveSkillIds];

    const sourcePrivateSeeds = new Set(
      PET_FUSION_ROLE_IDS.map((roleId) => String(
        prepared.materialsByRole[roleId]
        && prepared.materialsByRole[roleId].petGrowth
        && prepared.materialsByRole[roleId].petGrowth.private
        && prepared.materialsByRole[roleId].petGrowth.private.privateSeed
        || "",
      )),
    );
    if (
      String(pet.instanceId || pet.petId || "") !== instanceId
      || String(pet.formId || pet.templateId || "") !== prepared.recipe.targetFormId
      || pet.level !== 1
      || pet.petCultivation.rebirthCount !== 1
      || pet.activeSkillIds[0] !== "pet_attack"
      || pet.activeSkillIds[1] !== "pet_defend"
      || pet.passiveSkillIds.length !== 1
      || String(pet.petGrowth && pet.petGrowth.profileId || "")
        !== prepared.recipe.targetGrowthProfileId
      || sourcePrivateSeeds.has(String(
        pet.petGrowth
        && pet.petGrowth.private
        && pet.petGrowth.private.privateSeed
        || "",
      ))
    ) {
      return failure(
        "pet_fusion_result_invalid",
        "融合结果校验失败，本次操作未执行。",
      );
    }
    profile.nextPetInstanceSerial = serial + 1;
    return {ok: true, pet};
  }

  function applyFusionToProfile(profile, prepared, resultPet) {
    const selectedPets = selectFusionProfilePetContainer(profile);
    if (!selectedPets.ok) return selectedPets;
    const pets = selectedPets.pets;
    const consumedIds = new Set(PET_FUSION_ROLE_IDS.map(
      (roleId) => prepared.inspected.materialsByRole[roleId].instanceId,
    ));
    const beforeCount = pets.length;
    const selectedActive = consumedIds.has(
      String(profile.activePetInstanceId || "").trim(),
    );
    const remaining = pets.filter((pet) => !consumedIds.has(
      String(pet && (pet.instanceId || pet.petId) || "").trim(),
    ));
    if (remaining.length !== beforeCount - PET_FUSION_ROLE_IDS.length) {
      return failure(
        "pet_fusion_material_conflict",
        "融合材料身份发生变化，本次操作未执行。",
      );
    }
    remaining.push(resultPet);
    profile.petInstances = remaining;
    if (selectedActive) {
      profile.activePetInstanceId = String(resultPet.instanceId || "");
      resultPet.state = "battle";
    }
    if (typeof ensureActivePetAfterInstanceRemoval === "function") {
      ensureActivePetAfterInstanceRemoval(profile);
    }
    return {ok: true};
  }

  function resultPetState(profile, prepared, policy) {
    if (policy !== "replace_active_else_core_state") return "standby";
    const selectedIds = new Set(PET_FUSION_ROLE_IDS.map(
      (roleId) => prepared.inspected.materialsByRole[roleId].instanceId,
    ));
    if (selectedIds.has(String(profile.activePetInstanceId || "").trim())) {
      return "battle";
    }
    const coreState = String(prepared.materialsByRole.core.state || "standby");
    return ALLOWED_RESULT_STATES.has(coreState) ? coreState : "standby";
  }

  function resultPetBinding(prepared, policy) {
    if (policy === "always_bound") return "bound";
    if (policy !== "bound_if_any_material_bound") return "unbound";
    return PET_FUSION_ROLE_IDS.some((roleId) => {
      const pet = prepared.materialsByRole[roleId];
      return String(pet.binding || "") === "bound"
        || pet.bound === true
        || pet.bindingLocked === true;
    }) ? "bound" : "unbound";
  }

  function publicFusionResult(prepared, resolvedFusion, pet) {
    const targetName = String(
      pet.formName
      || pet.name
      || prepared.recipe.targetFormId,
    );
    return {
      schemaVersion: PET_FUSION_SCHEMA_VERSION,
      catalogId: String(petFusionRecipeCatalog.catalogId || ""),
      recipeId: prepared.recipe.recipeId,
      resultInstanceId: String(pet.instanceId || pet.petId || ""),
      targetFormId: prepared.recipe.targetFormId,
      targetFormName: targetName,
      level: 1,
      rebirthCount: 1,
      terminalStage: PET_FUSION_TERMINAL_STAGE,
      consumedMaterials: PET_FUSION_ROLE_IDS.map((roleId) => {
        const material = prepared.inspected.materialsByRole[roleId];
        return {
          roleId,
          instanceId: material.instanceId,
          formId: material.formId,
          formName: String(
            prepared.materialsByRole[roleId].formName
            || prepared.materialsByRole[roleId].name
            || material.formId,
          ),
        };
      }),
      baseActiveSkillIds: [...petFusionRecipeCatalog.rules.baseActiveSkillIds],
      inheritedActiveSkillIds: [
        ...resolvedFusion.publicResult.inheritedActiveSkillIds,
      ],
      inheritedPassiveSkillId:
        resolvedFusion.publicResult.inheritedPassiveSkillId,
      passiveSourceRoleId: resolvedFusion.publicResult.passiveSourceRoleId,
      numericSource: prepared.recipe.result.numericSource,
      materialNumericInheritance: false,
      rideable: false,
      message: `${targetName}融合完成；三只材料宠已消耗，成品技能与独立成长已生成。`,
    };
  }

  return Object.freeze({quote, fuse});
}

function selectFusionProfilePetContainer(profileValue) {
  const profile = recordOrNull(profileValue);
  if (!profile) {
    return failure(
      "pet_profile_pet_container_invalid",
      "宠物档案结构异常，本次融合未执行。",
    );
  }
  const hasCanonical = Object.hasOwn(profile, "petInstances");
  const hasLegacy = Object.hasOwn(profile, "pets");
  const canonical = Array.isArray(profile.petInstances)
    ? profile.petInstances
    : null;
  const legacy = Array.isArray(profile.pets) ? profile.pets : null;
  if (
    hasCanonical && !canonical
    || hasLegacy && !legacy
    || canonical && legacy && !isDeepStrictEqual(canonical, legacy)
  ) {
    return failure(
      "pet_profile_pet_container_conflict",
      "宠物档案存在冲突，请联系GM恢复后再进行融合。",
    );
  }
  return {
    ok: true,
    pets: canonical || legacy || [],
    legacyOnly: !canonical && Boolean(legacy),
  };
}

function canonicalizeFusionProfilePetContainer(profile) {
  const selected = selectFusionProfilePetContainer(profile);
  if (!selected.ok) return selected;
  profile.petInstances = structuredClone(selected.pets);
  delete profile.pets;
  return {ok: true, pets: profile.petInstances};
}

function fusionPetIndexById(pets, instanceId) {
  const normalizedId = String(instanceId || "").trim();
  if (normalizedId === "") return -1;
  return pets.findIndex((pet) => {
    const values = [
      pet && pet.instanceId,
      pet && pet.petId,
      pet && pet.id,
    ].map((value) => String(value || "").trim()).filter(Boolean);
    return values.length > 0
      && values.every((value) => value === values[0])
      && values[0] === normalizedId;
  });
}

function fusionTargetCandidate(input) {
  const template = input.targetTemplate;
  const baseStats = recordOrNull(template.baseStats) || {};
  const maxHp = positiveInteger(baseStats.maxHp, 1);
  const quick = positiveInteger(baseStats.quick ?? baseStats.agility, 1);
  return {
    schemaVersion: 1,
    instanceId: input.instanceId,
    petId: input.instanceId,
    templateId: input.blueprint.targetFormId,
    formId: input.blueprint.targetFormId,
    speciesId: input.blueprint.targetFormId,
    lineId: String(template.lineId || ""),
    lineName: String(template.lineName || ""),
    subtypeId: String(template.subtypeId || ""),
    subtypeName: String(template.subtypeName || ""),
    formName: input.targetName,
    name: input.targetName,
    state: input.state,
    level: 1,
    exp: 0,
    nextExp: 1,
    hp: maxHp,
    maxHp,
    attack: positiveInteger(baseStats.attack, 1),
    defense: positiveInteger(baseStats.defense, 1),
    quick,
    elements: cloneRecord(template.elements),
    growthProfileId: String(template.growthProfileId || "balanced"),
    activeSkillIds: [...input.blueprint.activeSkillIds],
    petSkillSlots: [...input.blueprint.petSkillSlots],
    passiveSkillIds: [...input.blueprint.passiveSkillIds],
    capturedSerial: input.serial,
    source: "pet_fusion",
    isNew: true,
    binding: input.binding,
    bound: input.binding === "bound",
    bindingLocked: false,
  };
}

function normalizeRequest(value, execute) {
  const source = recordOrNull(value);
  const expectedKeys = execute ? EXECUTE_REQUEST_KEYS : QUOTE_REQUEST_KEYS;
  const errorCode = "pet_fusion_request_invalid";
  if (!source || !hasExactKeys(source, expectedKeys)) {
    return failure(errorCode, "宠物融合请求不正确，请刷新后重试。");
  }
  const recipeId = normalizedId(source.recipeId);
  const materialIds = recordOrNull(source.materialInstanceIds);
  if (
    recipeId === ""
    || !materialIds
    || !hasExactKeys(materialIds, PET_FUSION_ROLE_IDS)
  ) {
    return failure(errorCode, "宠物融合请求不正确，请刷新后重试。");
  }
  const materialInstanceIds = {};
  for (const roleId of PET_FUSION_ROLE_IDS) {
    const instanceId = normalizedId(materialIds[roleId]);
    if (instanceId === "") {
      return failure(errorCode, "宠物融合材料身份不正确，请重新选择。");
    }
    materialInstanceIds[roleId] = instanceId;
  }
  if (new Set(Object.values(materialInstanceIds)).size !== PET_FUSION_ROLE_IDS.length) {
    return failure("pet_fusion_material_duplicate", "三个融合位置必须选择三只不同的宠物。");
  }
  const result = {ok: true, recipeId, materialInstanceIds};
  if (!execute) return result;
  if (
    !Number.isSafeInteger(source.expectedProfileRevision)
    || source.expectedProfileRevision < 0
    || normalizedId(source.expectedCatalogId) === ""
  ) {
    return failure(errorCode, "宠物融合确认信息不完整，请刷新后重试。");
  }
  result.expectedProfileRevision = source.expectedProfileRevision;
  result.expectedCatalogId = normalizedId(source.expectedCatalogId);
  return result;
}

function normalizedId(value) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized !== "" && normalized.length <= REQUEST_ID_MAX_LENGTH
    ? normalized
    : "";
}

function positiveInteger(value, fallback) {
  const normalized = Math.trunc(Number(value));
  return Number.isSafeInteger(normalized) && normalized > 0
    ? normalized
    : fallback;
}

function cloneRecord(value) {
  return recordOrNull(value) ? structuredClone(value) : {};
}

function roleLabel(roleId) {
  return {
    core: "核心位",
    resonance_one: "共鸣一",
    resonance_two: "共鸣二",
  }[roleId] || "融合位";
}

function hasExactKeys(value, keys) {
  const actual = Object.keys(recordOrNull(value) || {}).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function recordOrNull(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function failure(code, message) {
  return {
    ok: false,
    code: String(code || "pet_fusion_failed"),
    message: String(message || "宠物融合失败。"),
  };
}

module.exports = {
  createPetFusionDomain,
  normalizeRequest,
};
