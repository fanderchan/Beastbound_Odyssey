"use strict";

const {MODEL_VERSION: PET_GROWTH_MODEL_VERSION} = require("./pet-growth-authority");
const {isValidPetPrivateSeed} = require("./pet-private-seed");
const {
  createPetFusionRandomContext,
} = require("./pet-fusion-random-authority");
const {
  PET_FUSION_CATALOG_ID,
  PET_FUSION_CATALOG_SCHEMA_VERSION,
  PET_FUSION_ROLE_IDS,
} = require("./pet-fusion-recipe-catalog");
const {inspectPetTerminalPath} = require("./pet-terminal-path");

const PET_FUSION_SCHEMA_VERSION = 1;
const PET_FUSION_TERMINAL_STAGE = 2;
const PET_FUSION_SKILL_SLOT_COUNT = 7;
const MATERIAL_ID_MAX_LENGTH = 160;

function inspectPetFusionEligibility(materialsValue, options = {}) {
  const resolved = resolveCatalogRecipe(options);
  if (!resolved.ok) return resolved;
  const materials = objectRecord(materialsValue);
  if (!hasExactKeys(materials, PET_FUSION_ROLE_IDS)) {
    return failure(
      "pet_fusion_material_roles_invalid",
      "融合材料必须严格包含核心、共鸣一和共鸣二三个位置。",
    );
  }

  const inspectedByRole = {};
  const instanceIds = new Set();
  const targetFormIds = new Set(resolved.catalog.targetFormIds);
  for (const roleId of PET_FUSION_ROLE_IDS) {
    const pet = objectRecordOrNull(materials[roleId]);
    const formId = stablePetFormId(pet || {});
    const terminalPath = inspectPetTerminalPath(
      pet,
      options.evolutionRouteCatalog,
      resolved.catalog,
    );
    if (
      terminalPath.terminal
      && terminalPath.branch === "evolution"
      && terminalPath.evidence === "target_form"
    ) {
      return failure(
        "pet_fusion_material_terminal",
        `${roleLabel(roleId)}材料已经是进化终局形态。`,
      );
    }
    if (targetFormIds.has(formId)) {
      return failure(
        "pet_fusion_material_terminal",
        `${roleLabel(roleId)}材料已经是融合终局形态。`,
      );
    }
    const geneProfile = formId === ""
      ? null
      : resolved.catalog.geneProfilesByFormId[formId];
    if (!geneProfile) {
      return failure(
        "pet_fusion_material_gene_missing",
        `${roleLabel(roleId)}材料没有获准参与融合的显式血脉基因档。`,
      );
    }
    const geneRule = resolved.recipe.roleGeneRules[roleId];
    if (!geneProfileAllowed(geneProfile, geneRule)) {
      return failure(
        "pet_fusion_material_gene_mismatch",
        `${roleLabel(roleId)}材料不属于该位置允许的血脉集合。`,
      );
    }
    const inspected = inspectMaterial(materials[roleId], {
      roleId,
      geneProfile,
      rules: resolved.catalog.rules,
    });
    if (!inspected.ok) return inspected;
    if (instanceIds.has(inspected.material.instanceId)) {
      return failure("pet_fusion_material_duplicate", "三个融合位置必须选择三只不同的宠物。");
    }
    instanceIds.add(inspected.material.instanceId);
    inspectedByRole[roleId] = inspected.material;
  }

  return {
    ok: true,
    catalog: resolved.catalog,
    recipe: resolved.recipe,
    materialsByRole: inspectedByRole,
    materials: PET_FUSION_ROLE_IDS.map((roleId) => inspectedByRole[roleId]),
  };
}

function resolvePetFusion(materialsValue, options = {}) {
  const inspected = inspectPetFusionEligibility(materialsValue, options);
  if (!inspected.ok) return inspected;
  const randomContext = options.randomContext;
  if (
    !randomContext
    || typeof randomContext !== "object"
    || Array.isArray(randomContext)
    || typeof randomContext.privateRootSeed !== "string"
    || typeof randomContext.seedCommitment !== "string"
    || !isValidPetPrivateSeed(randomContext.growthPrivateSeed)
  ) {
    return failure("pet_fusion_random_context_invalid", "融合随机权威信息不完整，本次操作未执行。");
  }
  let trustedRandomContext;
  try {
    trustedRandomContext = createPetFusionRandomContext(randomContext.privateRootSeed);
  } catch (_error) {
    return failure("pet_fusion_random_context_invalid", "融合随机权威信息不完整，本次操作未执行。");
  }
  if (
    randomContext.seedCommitment !== trustedRandomContext.seedCommitment
    || randomContext.growthPrivateSeed !== trustedRandomContext.growthPrivateSeed
  ) {
    return failure("pet_fusion_random_context_invalid", "融合随机权威信息不一致，本次操作未执行。");
  }

  const activeInheritance = [];
  const inheritedActiveSkillIds = [];
  const activeRolls = {};
  try {
    for (const roleId of PET_FUSION_ROLE_IDS) {
      const material = inspected.materialsByRole[roleId];
      const roll = checkedRoll(trustedRandomContext, `inherit.active.${roleId}`);
      activeRolls[roleId] = roll;
      const inherited = roll < inspected.catalog.rules.specialActiveInheritanceChance;
      activeInheritance.push({
        roleId,
        geneProfileId: material.geneProfileId,
        skillId: material.specialActiveSkillId,
        inherited,
      });
      if (inherited && !inheritedActiveSkillIds.includes(material.specialActiveSkillId)) {
        inheritedActiveSkillIds.push(material.specialActiveSkillId);
      }
    }
  } catch (_error) {
    return failure("pet_fusion_random_context_invalid", "融合主动遗传随机结果无效，本次操作未执行。");
  }

  let passiveSourceRoll;
  try {
    passiveSourceRoll = checkedRoll(trustedRandomContext, "inherit.passive.source");
  } catch (_error) {
    return failure("pet_fusion_random_context_invalid", "融合被动遗传随机结果无效，本次操作未执行。");
  }
  const passiveSourceRoleId = selectPassiveSourceRole(
    passiveSourceRoll,
    inspected.catalog.rules.passiveSourceWeights,
  );
  const passiveMaterial = inspected.materialsByRole[passiveSourceRoleId];
  if (!passiveMaterial || String(passiveMaterial.passiveSkillId || "") === "") {
    return failure("pet_fusion_gene_profile_invalid", "融合被动血脉资料不完整，本次操作未执行。");
  }

  const activeSkillIds = uniqueStrings([
    ...inspected.catalog.rules.baseActiveSkillIds,
    ...inheritedActiveSkillIds,
  ]);
  const passiveSkillIds = [passiveMaterial.passiveSkillId];
  if (
    activeSkillIds.length !== inspected.catalog.rules.baseActiveSkillIds.length
      + inheritedActiveSkillIds.length
    || activeSkillIds[0] !== "pet_attack"
    || activeSkillIds[1] !== "pet_defend"
    || passiveSkillIds.length !== 1
  ) {
    return failure("pet_fusion_result_invalid", "融合技能结果无法安全生成，本次操作未执行。");
  }

  const sourceMaterials = inspected.materials.map((material) => ({
    roleId: material.roleId,
    instanceId: material.instanceId,
    formId: material.formId,
    geneProfileId: material.geneProfileId,
    lineageId: material.lineageId,
  }));
  const fusionLineage = {
    schemaVersion: PET_FUSION_SCHEMA_VERSION,
    catalogId: inspected.catalog.catalogId,
    mode: "fusion",
    recipeId: inspected.recipe.recipeId,
    targetFormId: inspected.recipe.targetFormId,
    terminalStage: PET_FUSION_TERMINAL_STAGE,
    bindingPolicy: inspected.recipe.result.bindingPolicy,
    resultStatePolicy: inspected.recipe.result.resultStatePolicy,
    sourceMaterials,
    activeInheritance: activeInheritance.map((entry) => ({...entry})),
    passiveInheritance: {
      roleId: passiveSourceRoleId,
      geneProfileId: passiveMaterial.geneProfileId,
      skillId: passiveMaterial.passiveSkillId,
    },
  };
  const privateResult = {
    schemaVersion: PET_FUSION_SCHEMA_VERSION,
    privateRootSeed: trustedRandomContext.privateRootSeed,
    seedCommitment: trustedRandomContext.seedCommitment,
    growthPrivateSeed: trustedRandomContext.growthPrivateSeed,
    activeRolls: {...activeRolls},
    passiveSourceRoll,
  };
  const blueprint = {
    schemaVersion: PET_FUSION_SCHEMA_VERSION,
    catalogId: inspected.catalog.catalogId,
    recipeId: inspected.recipe.recipeId,
    targetFormId: inspected.recipe.targetFormId,
    targetGrowthProfileId: inspected.recipe.targetGrowthProfileId,
    level: inspected.recipe.result.level,
    rebirthCount: inspected.recipe.result.rebirthCount,
    terminalPathId: inspected.recipe.result.terminalPathId,
    terminalStage: PET_FUSION_TERMINAL_STAGE,
    paidResetAllowed: inspected.recipe.result.paidResetAllowed,
    newInstanceRequired: inspected.recipe.result.newInstanceRequired,
    numericSource: inspected.recipe.result.numericSource,
    rideable: false,
    bindingPolicy: inspected.recipe.result.bindingPolicy,
    resultStatePolicy: inspected.recipe.result.resultStatePolicy,
    additionalCostPolicy: inspected.catalog.rules.additionalCostPolicy,
    resultBindingPolicy: inspected.catalog.rules.resultBindingPolicy,
    unboundResultTradePolicy: inspected.catalog.rules.unboundResultTradePolicy,
    baseActiveSkillForgetPolicy:
      inspected.catalog.rules.baseActiveSkillForgetPolicy,
    inheritedSpecialActiveForgetPolicy:
      inspected.catalog.rules.inheritedSpecialActiveForgetPolicy,
    postFusionTrainingPolicy:
      inspected.catalog.rules.postFusionTrainingPolicy,
    activeSkillIds,
    petSkillSlots: paddedSkillSlots(activeSkillIds),
    passiveSkillIds,
    fusionLineage,
    fusionPrivate: privateResult,
  };
  return {
    ok: true,
    blueprint,
    publicResult: {
      schemaVersion: PET_FUSION_SCHEMA_VERSION,
      recipeId: inspected.recipe.recipeId,
      targetFormId: inspected.recipe.targetFormId,
      level: inspected.recipe.result.level,
      rebirthCount: inspected.recipe.result.rebirthCount,
      terminalStage: PET_FUSION_TERMINAL_STAGE,
      consumedMaterialIds: sourceMaterials.map((entry) => entry.instanceId),
      inheritedActiveSkillIds: [...inheritedActiveSkillIds],
      inheritedPassiveSkillId: passiveMaterial.passiveSkillId,
      passiveSourceRoleId,
    },
  };
}

function resolveCatalogRecipe(options) {
  const catalog = objectRecord(options.catalog);
  if (
    catalog.schemaVersion !== PET_FUSION_CATALOG_SCHEMA_VERSION
    || catalog.catalogId !== PET_FUSION_CATALOG_ID
    || !objectRecordOrNull(catalog.rules)
    || !objectRecordOrNull(catalog.geneProfilesById)
    || !objectRecordOrNull(catalog.geneProfilesByFormId)
    || !objectRecordOrNull(catalog.recipesById)
    || !Array.isArray(catalog.targetFormIds)
  ) {
    return failure("pet_fusion_catalog_invalid", "宠物融合目录不可用。");
  }
  const recipeId = String(options.recipeId || "").trim();
  const recipe = recipeId === "" ? null : catalog.recipesById[recipeId];
  if (!recipe) {
    return failure("pet_fusion_recipe_missing", "没有找到所选融合配方。");
  }
  return {ok: true, catalog, recipe};
}

function geneProfileAllowed(geneProfile, ruleValue) {
  const rule = objectRecord(ruleValue);
  const allowedLineageIds = Array.isArray(rule.allowedLineageIds)
    ? rule.allowedLineageIds
    : [];
  const allowedGeneProfileIds = Array.isArray(rule.allowedGeneProfileIds)
    ? rule.allowedGeneProfileIds
    : [];
  const lineageAllowed = allowedLineageIds.includes("*")
    || allowedLineageIds.includes(geneProfile.lineageId);
  const geneAllowed = allowedGeneProfileIds.includes("*")
    || allowedGeneProfileIds.includes(geneProfile.geneProfileId);
  return lineageAllowed && geneAllowed;
}

function inspectMaterial(value, context) {
  const pet = objectRecordOrNull(value);
  if (!pet) {
    return failure("pet_fusion_material_invalid", `${roleLabel(context.roleId)}材料资料不完整。`);
  }
  const instanceId = stablePetIdentity(pet);
  const formId = stablePetFormId(pet);
  if (
    instanceId === ""
    || instanceId.length > MATERIAL_ID_MAX_LENGTH
    || formId === ""
  ) {
    return failure("pet_fusion_material_invalid", `${roleLabel(context.roleId)}材料身份不完整。`);
  }
  if (formId !== context.geneProfile.formId) {
    return failure("pet_fusion_material_gene_mismatch", `${roleLabel(context.roleId)}材料不属于配方指定血脉。`);
  }
  if (Object.hasOwn(pet, "evolutionLineage") || Object.hasOwn(pet, "fusionLineage")) {
    return failure("pet_fusion_material_terminal", `${roleLabel(context.roleId)}材料已经进入终局形态。`);
  }
  if (objectRecordOrNull(pet.petRebirthHelper)) {
    return failure("pet_fusion_material_helper", "转生MM不能作为融合材料。");
  }
  if (
    !Number.isSafeInteger(pet.level)
    || pet.level < context.rules.minimumLevel
    || pet.level > context.rules.maximumLevel
  ) {
    return failure(
      "pet_fusion_material_level",
      `融合材料必须达到一转 Lv${context.rules.minimumLevel}-${context.rules.maximumLevel}。`,
    );
  }
  const cultivation = objectRecordOrNull(pet.petCultivation);
  if (
    !cultivation
    || !Number.isSafeInteger(cultivation.rebirthCount)
    || cultivation.rebirthCount !== context.rules.requiredRebirthCount
  ) {
    return failure("pet_fusion_material_rebirth", "融合材料必须恰好完成一转且尚未进入终局。");
  }
  const growth = objectRecordOrNull(pet.petGrowth);
  const privateGrowth = growth && objectRecordOrNull(growth.private);
  const publicGrowth = growth && objectRecordOrNull(growth.public);
  if (
    !growth
    || growth.modelVersion !== PET_GROWTH_MODEL_VERSION
    || growth.modelVersion !== context.rules.requiredGrowthModelVersion
    || growth.profileId !== context.geneProfile.growthProfileId
    || growth.settledLevel !== pet.level
    || !privateGrowth
    || !isValidPetPrivateSeed(privateGrowth.privateSeed)
    || !publicGrowth
    || publicGrowth.growthSpeciesProfileId !== context.geneProfile.growthProfileId
    || publicGrowth.level !== pet.level
  ) {
    return failure(
      "pet_fusion_material_growth_unsupported",
      "融合材料必须是资料完整的 authority-v1 普通宠。",
    );
  }
  return {
    ok: true,
    material: {
      roleId: context.roleId,
      instanceId,
      formId,
      geneProfileId: context.geneProfile.geneProfileId,
      lineageId: context.geneProfile.lineageId,
      specialActiveSkillId: context.geneProfile.specialActiveSkillId,
      passiveSkillId: context.geneProfile.passiveSkillId,
    },
  };
}

function selectPassiveSourceRole(roll, weightsValue) {
  const weights = objectRecord(weightsValue);
  let cumulative = 0;
  for (const roleId of PET_FUSION_ROLE_IDS) {
    cumulative += Number(weights[roleId] || 0);
    if (roll < cumulative) return roleId;
  }
  return PET_FUSION_ROLE_IDS[PET_FUSION_ROLE_IDS.length - 1];
}

function checkedRoll(randomContext, label) {
  const value = Number(randomContext.roll(label));
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError(`invalid pet fusion roll for ${label}`);
  }
  return value;
}

function paddedSkillSlots(activeSkillIds) {
  const result = activeSkillIds.slice(0, PET_FUSION_SKILL_SLOT_COUNT);
  while (result.length < PET_FUSION_SKILL_SLOT_COUNT) result.push("");
  return result;
}

function uniqueStrings(values) {
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = String(value || "").trim();
    if (normalized !== "" && !result.includes(normalized)) result.push(normalized);
  }
  return result;
}

function stablePetIdentity(pet) {
  const values = [pet.instanceId, pet.petId, pet.id]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (values.length === 0 || values.some((value) => value !== values[0])) return "";
  return values[0];
}

function stablePetFormId(pet) {
  const values = [pet.formId, pet.templateId, pet.speciesId]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (values.length === 0 || values.some((value) => value !== values[0])) return "";
  return values[0];
}

function roleLabel(roleId) {
  return {
    core: "核心位",
    resonance_one: "共鸣一",
    resonance_two: "共鸣二",
  }[roleId] || "融合";
}

function hasExactKeys(value, keys) {
  const actual = Object.keys(objectRecord(value)).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function objectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function objectRecordOrNull(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function failure(code, message) {
  return {
    ok: false,
    code: String(code || "pet_fusion_failed"),
    message: String(message || "宠物融合失败。"),
  };
}

module.exports = {
  PET_FUSION_SCHEMA_VERSION,
  PET_FUSION_SKILL_SLOT_COUNT,
  PET_FUSION_TERMINAL_STAGE,
  inspectPetFusionEligibility,
  resolvePetFusion,
  selectPassiveSourceRole,
};
