"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {MODEL_VERSION: PET_GROWTH_MODEL_VERSION} = require("./pet-growth-authority");
const {
  PetFusionReleaseAttestationError,
  loadPetFusionReleaseAttestation,
} = require("./pet-fusion-release-attestation");

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const DATA_DIR = path.join(REPO_ROOT, "client/godot/data");
const DEFAULT_CATALOG_PATH = path.join(DATA_DIR, "pet_fusion_recipes.json");
const DEFAULT_TEMPLATE_PATH = path.join(DATA_DIR, "pet_templates.json");
const DEFAULT_GROWTH_PROFILE_PATH = path.join(
  DATA_DIR,
  "balance",
  "pet_growth_species_profiles.json",
);
const DEFAULT_ACTION_PATH = path.join(DATA_DIR, "battle_actions.json");
const DEFAULT_PASSIVE_PATH = path.join(DATA_DIR, "battle_passive_skills.json");
const DEFAULT_SKILL_TRAINING_PATH = path.join(DATA_DIR, "pet_skill_training.json");
const DEFAULT_PAID_RESET_PATH = path.join(
  DATA_DIR,
  "balance",
  "pet_paid_reset_policy.json",
);

const PET_FUSION_CATALOG_SCHEMA_VERSION = 2;
const PET_FUSION_CATALOG_ID = "pet_fusion_recipes_v2";
const PET_FUSION_ROLE_IDS = Object.freeze([
  "core",
  "resonance_one",
  "resonance_two",
]);
const PET_FUSION_BASE_ACTIVE_SKILL_IDS = Object.freeze([
  "pet_attack",
  "pet_defend",
]);
const PET_FUSION_SPECIAL_ACTIVE_CHANCE = 0.5;
const PET_FUSION_PASSIVE_SOURCE_WEIGHTS = Object.freeze({
  core: 0.4,
  resonance_one: 0.3,
  resonance_two: 0.3,
});
const PET_FUSION_REQUIRED_REBIRTH_COUNT = 1;
const PET_FUSION_MINIMUM_LEVEL = 131;
const PET_FUSION_MAXIMUM_LEVEL = 140;
const PET_FUSION_ADDITIONAL_COST_POLICY = "materials_only";
const PET_FUSION_RESULT_BINDING_POLICY = "bound_if_any_material_bound";
const PET_FUSION_UNBOUND_RESULT_TRADE_POLICY = "eligible_when_pet_trading_available";
const PET_FUSION_BASE_ACTIVE_SKILL_FORGET_POLICY = "forbidden";
const PET_FUSION_INHERITED_SPECIAL_ACTIVE_FORGET_POLICY = "double_confirm_irreversible";
const PET_FUSION_POST_FUSION_TRAINING_POLICY = "empty_slots_only";
const PET_FUSION_BINDING_POLICIES = Object.freeze([
  PET_FUSION_RESULT_BINDING_POLICY,
]);
const PET_FUSION_RESULT_STATE_POLICIES = Object.freeze([
  "replace_active_else_core_state",
]);
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]{1,95}$/;

class PetFusionRecipeCatalogError extends Error {
  constructor(errors) {
    const normalized = (Array.isArray(errors) ? errors : [errors])
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    super(`pet fusion recipe catalog invalid: ${normalized.join("; ")}`);
    this.name = "PetFusionRecipeCatalogError";
    this.code = "pet_fusion_recipe_catalog_invalid";
    this.errors = normalized;
  }
}

function loadPetFusionRecipeCatalog(options = {}) {
  const catalogPath = path.resolve(String(options.catalogPath || DEFAULT_CATALOG_PATH));
  return createPetFusionRecipeCatalog({
    document: options.document || readJson(catalogPath),
    templatesDocument: options.templatesDocument || readJson(DEFAULT_TEMPLATE_PATH),
    growthProfilesDocument: options.growthProfilesDocument || readJson(DEFAULT_GROWTH_PROFILE_PATH),
    actionsDocument: options.actionsDocument || readJson(DEFAULT_ACTION_PATH),
    passivesDocument: options.passivesDocument || readJson(DEFAULT_PASSIVE_PATH),
    skillTrainingDocument: options.skillTrainingDocument || readJson(DEFAULT_SKILL_TRAINING_PATH),
    paidResetDocument: options.paidResetDocument || readJson(DEFAULT_PAID_RESET_PATH),
    allowTestOnlyRecipes: options.allowTestOnlyRecipes === true,
    releaseAttestationPath: options.releaseAttestationPath,
    releaseAttestationReadFile: options.releaseAttestationReadFile,
    catalogPath,
  });
}

function createPetFusionRecipeCatalog(input = {}) {
  const errors = [];
  const document = objectRecord(input.document);
  exactKeys(document, [
    "schemaVersion",
    "catalogId",
    "runtimeEnabled",
    "disabledMessage",
    "rules",
    "geneProfiles",
    "recipes",
  ], "catalog", errors);
  if (document.schemaVersion !== PET_FUSION_CATALOG_SCHEMA_VERSION) {
    errors.push(`catalog.schemaVersion must equal ${PET_FUSION_CATALOG_SCHEMA_VERSION}`);
  }
  if (document.catalogId !== PET_FUSION_CATALOG_ID) {
    errors.push(`catalog.catalogId must equal ${PET_FUSION_CATALOG_ID}`);
  }
  if (typeof document.runtimeEnabled !== "boolean") {
    errors.push("catalog.runtimeEnabled must be boolean");
  }
  if (text(document.disabledMessage) === "") {
    errors.push("catalog.disabledMessage must be non-empty");
  }
  if (!Array.isArray(document.geneProfiles)) {
    errors.push("catalog.geneProfiles must be an array");
  }
  if (!Array.isArray(document.recipes)) {
    errors.push("catalog.recipes must be an array");
  }
  const rules = normalizeRules(document.rules, errors);

  const formsById = uniqueIndex(
    array(input.templatesDocument && input.templatesDocument.forms),
    "formId",
    "pet forms",
    errors,
  );
  const growthProfilesById = uniqueIndex(
    array(input.growthProfilesDocument && input.growthProfilesDocument.profiles),
    "profileId",
    "pet growth profiles",
    errors,
  );
  const actionsById = uniqueIndex(
    array(input.actionsDocument && input.actionsDocument.actions),
    "id",
    "battle actions",
    errors,
  );
  const passivesById = uniqueIndex(
    array(input.passivesDocument && input.passivesDocument.passives),
    "id",
    "battle passives",
    errors,
  );
  const trainableSkillIds = skillTrainingSkillIds(input.skillTrainingDocument);
  const paidResetPoliciesByFormId = uniqueIndex(
    array(input.paidResetDocument && input.paidResetDocument.formPolicies),
    "formId",
    "pet paid reset policies",
    errors,
  );
  const terminalTargetFormIds = deepFreeze(collectTerminalFusionTargetFormIds({
    paidResetPoliciesByFormId,
    formsById,
    growthProfilesById,
  }, errors));

  const geneProfiles = [];
  const geneProfilesById = Object.create(null);
  const geneProfilesByFormId = Object.create(null);
  for (const [index, raw] of array(document.geneProfiles).entries()) {
    const profile = normalizeGeneProfile(raw, index, {
      formsById,
      growthProfilesById,
      actionsById,
      passivesById,
      trainableSkillIds,
    }, errors);
    if (!profile) continue;
    if (Object.hasOwn(geneProfilesById, profile.geneProfileId)) {
      errors.push(`duplicate gene profile ${profile.geneProfileId}`);
      continue;
    }
    if (Object.hasOwn(geneProfilesByFormId, profile.formId)) {
      errors.push(`duplicate fusion gene form ${profile.formId}`);
      continue;
    }
    geneProfiles.push(profile);
    geneProfilesById[profile.geneProfileId] = profile;
    geneProfilesByFormId[profile.formId] = profile;
  }

  const allowTestOnlyRecipes = input.allowTestOnlyRecipes === true;
  const recipes = [];
  const recipesById = Object.create(null);
  const targetFormIds = new Set();
  const appearanceLineagePairOwners = new Map();
  for (const [index, raw] of array(document.recipes).entries()) {
    const recipe = normalizeRecipe(raw, index, {
      allowTestOnlyRecipes,
      formsById,
      growthProfilesById,
      paidResetPoliciesByFormId,
      geneProfilesById,
      geneProfilesByFormId,
    }, errors);
    if (!recipe) continue;
    let duplicate = false;
    if (Object.hasOwn(recipesById, recipe.recipeId)) {
      errors.push(`duplicate fusion recipe ${recipe.recipeId}`);
      duplicate = true;
    }
    if (targetFormIds.has(recipe.targetFormId)) {
      errors.push(`duplicate fusion target form ${recipe.targetFormId}`);
      duplicate = true;
    }
    for (const pair of recipe.appearanceLineagePairs) {
      const key = appearanceLineagePairKey(pair);
      const owner = appearanceLineagePairOwners.get(key);
      if (owner) {
        errors.push(
          `appearance lineage pair ${pair.coreLineageId}/${pair.resonanceOneLineageId}`
          + ` is already assigned to recipe ${owner}; resonance_two cannot choose a target`,
        );
        duplicate = true;
      }
    }
    if (duplicate) {
      continue;
    }
    recipes.push(recipe);
    recipesById[recipe.recipeId] = recipe;
    targetFormIds.add(recipe.targetFormId);
    for (const pair of recipe.appearanceLineagePairs) {
      appearanceLineagePairOwners.set(appearanceLineagePairKey(pair), recipe.recipeId);
    }
  }

  if (document.runtimeEnabled === true) {
    if (recipes.length === 0) {
      errors.push("enabled fusion catalog must contain at least one recipe");
    }
    if (recipes.some((recipe) => recipe.assetGate.status !== "formal")) {
      errors.push("enabled fusion catalog requires formal assets for every recipe");
    }
  }
  if (!allowTestOnlyRecipes && recipes.some((recipe) => recipe.assetGate.status === "test_only")) {
    errors.push("test-only fusion recipes require explicit test injection");
  }
  const catalogPath = String(input.catalogPath || "");
  const requestedTestBypass = input.allowUnattestedRuntimeForTests === true;
  const testOnlyRuntimeBypass = (
    requestedTestBypass
    && allowTestOnlyRecipes
    && catalogPath.startsWith("test://")
  );
  if (requestedTestBypass && !testOnlyRuntimeBypass) {
    errors.push("unattested runtime bypass is restricted to explicit test:// catalogs");
  }
  let releaseAttestation = null;
  if (document.runtimeEnabled === true && errors.length === 0) {
    if (testOnlyRuntimeBypass) {
      releaseAttestation = {
        testOnly: true,
        status: "test_only_unattested",
        catalogPath,
      };
    } else {
      try {
        releaseAttestation = loadPetFusionReleaseAttestation({
          repoRoot: input.repoRoot || REPO_ROOT,
          attestationPath: input.releaseAttestationPath,
          readFile: input.releaseAttestationReadFile,
          expectedCatalogDocument: document,
          expectedCatalogPath: catalogPath,
        });
      } catch (error) {
        if (error instanceof PetFusionReleaseAttestationError) {
          errors.push(...error.errors.map((entry) => `runtime release attestation: ${entry}`));
        } else {
          errors.push("runtime release attestation could not be loaded");
        }
      }
    }
  }
  if (errors.length > 0) {
    throw new PetFusionRecipeCatalogError(errors);
  }

  return deepFreeze({
    schemaVersion: PET_FUSION_CATALOG_SCHEMA_VERSION,
    catalogId: PET_FUSION_CATALOG_ID,
    runtimeEnabled: document.runtimeEnabled === true,
    disabledMessage: text(document.disabledMessage),
    rules,
    geneProfiles,
    geneProfilesById,
    geneProfilesByFormId,
    recipes,
    recipesById,
    targetFormIds: Array.from(targetFormIds).sort(),
    terminalTargetFormIds,
    ...(releaseAttestation ? {releaseAttestation} : {}),
    catalogPath,
  });
}

function normalizeRules(value, errors) {
  const raw = objectRecord(value);
  exactKeys(raw, [
    "roleIds",
    "requiredGrowthModelVersion",
    "requiredRebirthCount",
    "minimumLevel",
    "maximumLevel",
    "baseActiveSkillIds",
    "specialActiveInheritanceChance",
    "passiveSourceWeights",
    "resultPassiveSkillCount",
    "materialNumericInheritance",
    "resultRideable",
    "additionalCostPolicy",
    "resultBindingPolicy",
    "unboundResultTradePolicy",
    "baseActiveSkillForgetPolicy",
    "inheritedSpecialActiveForgetPolicy",
    "postFusionTrainingPolicy",
  ], "catalog.rules", errors);
  if (!sameStringArray(raw.roleIds, PET_FUSION_ROLE_IDS)) {
    errors.push("catalog.rules.roleIds must equal core/resonance_one/resonance_two");
  }
  if (raw.requiredGrowthModelVersion !== PET_GROWTH_MODEL_VERSION) {
    errors.push(`catalog.rules.requiredGrowthModelVersion must equal ${PET_GROWTH_MODEL_VERSION}`);
  }
  if (raw.requiredRebirthCount !== PET_FUSION_REQUIRED_REBIRTH_COUNT) {
    errors.push("catalog.rules.requiredRebirthCount must equal 1");
  }
  if (raw.minimumLevel !== PET_FUSION_MINIMUM_LEVEL || raw.maximumLevel !== PET_FUSION_MAXIMUM_LEVEL) {
    errors.push("catalog.rules level range must equal 131..140");
  }
  if (!sameStringArray(raw.baseActiveSkillIds, PET_FUSION_BASE_ACTIVE_SKILL_IDS)) {
    errors.push("catalog.rules.baseActiveSkillIds must equal pet_attack/pet_defend");
  }
  if (raw.specialActiveInheritanceChance !== PET_FUSION_SPECIAL_ACTIVE_CHANCE) {
    errors.push("catalog.rules.specialActiveInheritanceChance must equal 0.5");
  }
  const weights = objectRecord(raw.passiveSourceWeights);
  exactKeys(weights, PET_FUSION_ROLE_IDS, "catalog.rules.passiveSourceWeights", errors);
  for (const roleId of PET_FUSION_ROLE_IDS) {
    if (weights[roleId] !== PET_FUSION_PASSIVE_SOURCE_WEIGHTS[roleId]) {
      errors.push(`catalog.rules.passiveSourceWeights.${roleId} is invalid`);
    }
  }
  if (raw.resultPassiveSkillCount !== 1) {
    errors.push("catalog.rules.resultPassiveSkillCount must equal 1");
  }
  if (raw.materialNumericInheritance !== false) {
    errors.push("catalog.rules.materialNumericInheritance must be false");
  }
  if (raw.resultRideable !== false) {
    errors.push("catalog.rules.resultRideable must be false");
  }
  if (raw.additionalCostPolicy !== PET_FUSION_ADDITIONAL_COST_POLICY) {
    errors.push(
      `catalog.rules.additionalCostPolicy must equal ${PET_FUSION_ADDITIONAL_COST_POLICY}`,
    );
  }
  if (raw.resultBindingPolicy !== PET_FUSION_RESULT_BINDING_POLICY) {
    errors.push(
      `catalog.rules.resultBindingPolicy must equal ${PET_FUSION_RESULT_BINDING_POLICY}`,
    );
  }
  if (raw.unboundResultTradePolicy !== PET_FUSION_UNBOUND_RESULT_TRADE_POLICY) {
    errors.push(
      "catalog.rules.unboundResultTradePolicy must equal "
      + PET_FUSION_UNBOUND_RESULT_TRADE_POLICY,
    );
  }
  if (raw.baseActiveSkillForgetPolicy !== PET_FUSION_BASE_ACTIVE_SKILL_FORGET_POLICY) {
    errors.push(
      "catalog.rules.baseActiveSkillForgetPolicy must equal "
      + PET_FUSION_BASE_ACTIVE_SKILL_FORGET_POLICY,
    );
  }
  if (
    raw.inheritedSpecialActiveForgetPolicy
    !== PET_FUSION_INHERITED_SPECIAL_ACTIVE_FORGET_POLICY
  ) {
    errors.push(
      "catalog.rules.inheritedSpecialActiveForgetPolicy must equal "
      + PET_FUSION_INHERITED_SPECIAL_ACTIVE_FORGET_POLICY,
    );
  }
  if (raw.postFusionTrainingPolicy !== PET_FUSION_POST_FUSION_TRAINING_POLICY) {
    errors.push(
      "catalog.rules.postFusionTrainingPolicy must equal "
      + PET_FUSION_POST_FUSION_TRAINING_POLICY,
    );
  }
  return {
    roleIds: [...PET_FUSION_ROLE_IDS],
    requiredGrowthModelVersion: PET_GROWTH_MODEL_VERSION,
    requiredRebirthCount: PET_FUSION_REQUIRED_REBIRTH_COUNT,
    minimumLevel: PET_FUSION_MINIMUM_LEVEL,
    maximumLevel: PET_FUSION_MAXIMUM_LEVEL,
    baseActiveSkillIds: [...PET_FUSION_BASE_ACTIVE_SKILL_IDS],
    specialActiveInheritanceChance: PET_FUSION_SPECIAL_ACTIVE_CHANCE,
    passiveSourceWeights: {...PET_FUSION_PASSIVE_SOURCE_WEIGHTS},
    resultPassiveSkillCount: 1,
    materialNumericInheritance: false,
    resultRideable: false,
    additionalCostPolicy: PET_FUSION_ADDITIONAL_COST_POLICY,
    resultBindingPolicy: PET_FUSION_RESULT_BINDING_POLICY,
    unboundResultTradePolicy: PET_FUSION_UNBOUND_RESULT_TRADE_POLICY,
    baseActiveSkillForgetPolicy: PET_FUSION_BASE_ACTIVE_SKILL_FORGET_POLICY,
    inheritedSpecialActiveForgetPolicy:
      PET_FUSION_INHERITED_SPECIAL_ACTIVE_FORGET_POLICY,
    postFusionTrainingPolicy: PET_FUSION_POST_FUSION_TRAINING_POLICY,
  };
}

function normalizeGeneProfile(value, index, refs, errors) {
  const raw = objectRecord(value);
  const label = `catalog.geneProfiles[${index}]`;
  exactKeys(raw, [
    "geneProfileId",
    "lineageId",
    "formId",
    "growthProfileId",
    "materialClass",
    "specialActiveSkillId",
    "passiveSkillId",
  ], label, errors);
  const geneProfileId = identifier(raw.geneProfileId, `${label}.geneProfileId`, errors);
  const lineageId = identifier(raw.lineageId, `${label}.lineageId`, errors);
  const formId = identifier(raw.formId, `${label}.formId`, errors);
  const growthProfileId = identifier(raw.growthProfileId, `${label}.growthProfileId`, errors);
  const specialActiveSkillId = identifier(
    raw.specialActiveSkillId,
    `${label}.specialActiveSkillId`,
    errors,
  );
  const passiveSkillId = identifier(raw.passiveSkillId, `${label}.passiveSkillId`, errors);
  if (raw.materialClass !== "ordinary") {
    errors.push(`${label}.materialClass must equal ordinary`);
  }
  const form = refs.formsById[formId];
  const growthProfile = refs.growthProfilesById[growthProfileId];
  const action = refs.actionsById[specialActiveSkillId];
  const passive = refs.passivesById[passiveSkillId];
  if (!form) errors.push(`${label} references unknown form ${formId}`);
  if (!growthProfile) errors.push(`${label} references unknown growth profile ${growthProfileId}`);
  if (
    form
    && String(form.growthSpeciesProfileId || "") !== growthProfileId
  ) {
    errors.push(`${label} growth profile does not match form ${formId}`);
  }
  if (growthProfile && String(growthProfile.formId || "") !== formId) {
    errors.push(`${label} growth profile form does not match ${formId}`);
  }
  if (form && String(form.lineId || "") !== lineageId) {
    errors.push(`${label} lineage does not match form ${formId}`);
  }
  if (
    !action
    || String(action.owner || "") !== "pet_skill"
    || PET_FUSION_BASE_ACTIVE_SKILL_IDS.includes(specialActiveSkillId)
  ) {
    errors.push(`${label} special active must reference one non-base pet skill`);
  }
  if (refs.trainableSkillIds.has(specialActiveSkillId)) {
    errors.push(`${label} special active must not be an ordinary trainable skill`);
  }
  if (!passive) errors.push(`${label} references unknown passive ${passiveSkillId}`);
  if (
    geneProfileId === ""
    || lineageId === ""
    || formId === ""
    || growthProfileId === ""
    || specialActiveSkillId === ""
    || passiveSkillId === ""
  ) {
    return null;
  }
  return {
    geneProfileId,
    lineageId,
    formId,
    growthProfileId,
    materialClass: "ordinary",
    specialActiveSkillId,
    passiveSkillId,
  };
}

function normalizeRecipe(value, index, refs, errors) {
  const raw = objectRecord(value);
  const label = `catalog.recipes[${index}]`;
  exactKeys(raw, [
    "recipeId",
    "targetFormId",
    "targetGrowthProfileId",
    "roleGeneRules",
    "result",
    "assetGate",
  ], label, errors);
  const recipeId = identifier(raw.recipeId, `${label}.recipeId`, errors);
  const targetFormId = identifier(raw.targetFormId, `${label}.targetFormId`, errors);
  const targetGrowthProfileId = identifier(
    raw.targetGrowthProfileId,
    `${label}.targetGrowthProfileId`,
    errors,
  );
  const roleGeneRules = objectRecord(raw.roleGeneRules);
  exactKeys(roleGeneRules, PET_FUSION_ROLE_IDS, `${label}.roleGeneRules`, errors);
  const normalizedRoleRules = {};
  for (const roleId of PET_FUSION_ROLE_IDS) {
    normalizedRoleRules[roleId] = normalizeRoleGeneRule(
      roleGeneRules[roleId],
      `${label}.roleGeneRules.${roleId}`,
      roleId,
      refs.geneProfilesById,
      errors,
    );
  }

  const targetForm = refs.formsById[targetFormId];
  const targetGrowthProfile = refs.growthProfilesById[targetGrowthProfileId];
  if (!targetForm) errors.push(`${label} references unknown target form ${targetFormId}`);
  if (!targetGrowthProfile) {
    errors.push(`${label} references unknown target growth profile ${targetGrowthProfileId}`);
  }
  if (
    targetForm
    && objectRecord(targetForm.riding).rideable === true
  ) {
    errors.push(`${label} target form must not be rideable in the initial fusion release`);
  }
  if (refs.geneProfilesByFormId[targetFormId]) {
    errors.push(`${label} target form cannot be an approved fusion material`);
  }
  if (
    targetForm
    && String(targetForm.growthSpeciesProfileId || "") !== targetGrowthProfileId
  ) {
    errors.push(`${label} target growth profile does not match target form`);
  }
  if (targetGrowthProfile && String(targetGrowthProfile.formId || "") !== targetFormId) {
    errors.push(`${label} target growth profile form does not match target form`);
  }
  const sourceFormIds = PET_FUSION_ROLE_IDS.flatMap((roleId) => {
    const rule = normalizedRoleRules[roleId];
    if (!rule || rule.allowedGeneProfileIds.includes("*")) return [];
    return rule.allowedGeneProfileIds
      .map((geneProfileId) => refs.geneProfilesById[geneProfileId])
      .filter(Boolean)
      .map((profile) => profile.formId);
  });
  if (sourceFormIds.includes(targetFormId)) {
    errors.push(`${label} target form cannot be a material form`);
  }

  const resetPolicy = refs.paidResetPoliciesByFormId[targetFormId];
  if (
    !resetPolicy
    || resetPolicy.resetAllowed !== false
    || String(resetPolicy.ineligibleReason || "") !== "terminal_fusion"
  ) {
    errors.push(`${label} target form must declare paid reset terminal_fusion`);
  }

  const result = normalizeRecipeResult(raw.result, label, errors);
  const assetGate = normalizeAssetGate(
    raw.assetGate,
    label,
    refs.allowTestOnlyRecipes,
    errors,
  );
  if (recipeId === "" || targetFormId === "" || targetGrowthProfileId === "") return null;
  return {
    recipeId,
    targetFormId,
    targetGrowthProfileId,
    roleGeneRules: normalizedRoleRules,
    appearanceLineagePairs: normalizedRoleRules.core.allowedLineageIds.flatMap(
      (coreLineageId) => normalizedRoleRules.resonance_one.allowedLineageIds.map(
        (resonanceOneLineageId) => ({coreLineageId, resonanceOneLineageId}),
      ),
    ),
    result,
    assetGate,
  };
}

function appearanceLineagePairKey(pair) {
  return `${String(pair.coreLineageId || "")}\u0000${String(pair.resonanceOneLineageId || "")}`;
}

function normalizeRoleGeneRule(value, label, roleId, geneProfilesById, errors) {
  const raw = objectRecord(value);
  exactKeys(raw, ["allowedLineageIds", "allowedGeneProfileIds"], label, errors);
  const allowedLineageIds = normalizedIdentifierSet(
    raw.allowedLineageIds,
    `${label}.allowedLineageIds`,
    errors,
  );
  const allowedGeneProfileIds = normalizedIdentifierSet(
    raw.allowedGeneProfileIds,
    `${label}.allowedGeneProfileIds`,
    errors,
  );
  const lineageWildcard = allowedLineageIds.includes("*");
  const geneWildcard = allowedGeneProfileIds.includes("*");
  if ((lineageWildcard || geneWildcard) && roleId !== "resonance_two") {
    errors.push(`${label} wildcard is allowed only for resonance_two`);
  }
  if (lineageWildcard !== geneWildcard) {
    errors.push(`${label} wildcard must cover both lineage and gene profile`);
  }
  const approvedLineages = new Set(
    Object.values(geneProfilesById).map((profile) => profile.lineageId),
  );
  for (const lineageId of allowedLineageIds) {
    if (lineageId !== "*" && !approvedLineages.has(lineageId)) {
      errors.push(`${label} references unknown lineage ${lineageId}`);
    }
  }
  for (const geneProfileId of allowedGeneProfileIds) {
    if (geneProfileId !== "*" && !geneProfilesById[geneProfileId]) {
      errors.push(`${label} references unknown gene profile ${geneProfileId}`);
    }
  }
  if (!lineageWildcard && !geneWildcard) {
    for (const geneProfileId of allowedGeneProfileIds) {
      const profile = geneProfilesById[geneProfileId];
      if (profile && !allowedLineageIds.includes(profile.lineageId)) {
        errors.push(`${label} gene profile ${geneProfileId} is outside its allowed lineage set`);
      }
    }
    const uncoveredLineages = allowedLineageIds.filter((lineageId) => (
      !allowedGeneProfileIds.some((geneProfileId) => (
        geneProfilesById[geneProfileId]
        && geneProfilesById[geneProfileId].lineageId === lineageId
      ))
    ));
    if (uncoveredLineages.length > 0) {
      errors.push(`${label} lineage set contains no approved gene profile: ${uncoveredLineages.join(",")}`);
    }
  }
  return {allowedLineageIds, allowedGeneProfileIds};
}

function normalizeRecipeResult(value, recipeLabel, errors) {
  const raw = objectRecord(value);
  const label = `${recipeLabel}.result`;
  exactKeys(raw, [
    "level",
    "rebirthCount",
    "terminalPathId",
    "paidResetAllowed",
    "newInstanceRequired",
    "numericSource",
    "rideable",
    "bindingPolicy",
    "resultStatePolicy",
  ], label, errors);
  if (raw.level !== 1) errors.push(`${label}.level must equal 1`);
  if (raw.rebirthCount !== 1) errors.push(`${label}.rebirthCount must equal 1`);
  if (raw.terminalPathId !== "fusion_terminal_v1") {
    errors.push(`${label}.terminalPathId must equal fusion_terminal_v1`);
  }
  if (raw.paidResetAllowed !== false) errors.push(`${label}.paidResetAllowed must be false`);
  if (raw.newInstanceRequired !== true) errors.push(`${label}.newInstanceRequired must be true`);
  if (raw.numericSource !== "target_profile_only_v1") {
    errors.push(`${label}.numericSource must equal target_profile_only_v1`);
  }
  if (raw.rideable !== false) errors.push(`${label}.rideable must be false`);
  if (raw.bindingPolicy !== PET_FUSION_RESULT_BINDING_POLICY) {
    errors.push(
      `${label}.bindingPolicy must equal ${PET_FUSION_RESULT_BINDING_POLICY}`,
    );
  }
  if (!PET_FUSION_RESULT_STATE_POLICIES.includes(raw.resultStatePolicy)) {
    errors.push(
      `${label}.resultStatePolicy must equal one of ${PET_FUSION_RESULT_STATE_POLICIES.join(",")}`,
    );
  }
  return {
    level: 1,
    rebirthCount: 1,
    terminalPathId: "fusion_terminal_v1",
    paidResetAllowed: false,
    newInstanceRequired: true,
    numericSource: "target_profile_only_v1",
    rideable: false,
    bindingPolicy: String(raw.bindingPolicy || ""),
    resultStatePolicy: String(raw.resultStatePolicy || ""),
  };
}

function normalizeAssetGate(value, recipeLabel, allowTestOnly, errors) {
  const raw = objectRecord(value);
  const label = `${recipeLabel}.assetGate`;
  exactKeys(raw, ["status", "replacementPath"], label, errors);
  const status = text(raw.status);
  if (status !== "formal" && !(allowTestOnly && status === "test_only")) {
    errors.push(`${label}.status must equal formal`);
  }
  const replacementPath = text(raw.replacementPath);
  if (replacementPath === "") errors.push(`${label}.replacementPath must be non-empty`);
  return {status, replacementPath};
}

function uniqueIndex(values, key, label, errors) {
  const result = Object.create(null);
  for (const [index, value] of values.entries()) {
    const id = text(value && value[key]);
    if (id === "") {
      errors.push(`${label}[${index}].${key} must be non-empty`);
      continue;
    }
    if (Object.hasOwn(result, id)) {
      errors.push(`${label} contains duplicate ${id}`);
      continue;
    }
    result[id] = value;
  }
  return result;
}

function collectTerminalFusionTargetFormIds(refs, errors) {
  const result = [];
  for (const [formId, resetPolicy] of Object.entries(refs.paidResetPoliciesByFormId)) {
    if (
      resetPolicy.resetAllowed !== false
      || text(resetPolicy.ineligibleReason) !== "terminal_fusion"
    ) {
      continue;
    }
    result.push(formId);
    const targetForm = refs.formsById[formId];
    if (!targetForm) {
      errors.push(`terminal fusion target form ${formId} is missing from pet templates`);
      continue;
    }
    const growthProfileId = text(targetForm.growthSpeciesProfileId);
    const growthProfile = refs.growthProfilesById[growthProfileId];
    if (!growthProfile) {
      errors.push(
        `terminal fusion target form ${formId} must reference a known pet growth profile`,
      );
      continue;
    }
    if (text(growthProfile.formId) !== formId) {
      errors.push(
        `terminal fusion target growth profile ${growthProfileId}`
        + ` must belong to form ${formId}`,
      );
    }
  }
  return result.sort();
}

function skillTrainingSkillIds(documentValue) {
  const document = objectRecord(documentValue);
  const result = new Set();
  for (const skill of array(document.skills)) {
    const skillId = text(skill && skill.skillId);
    if (skillId !== "") result.add(skillId);
  }
  for (const trainer of array(document.trainers)) {
    for (const value of array(trainer && trainer.skillIds)) {
      const skillId = text(value);
      if (skillId !== "") result.add(skillId);
    }
  }
  return result;
}

function exactKeys(value, keys, label, errors) {
  const actual = Object.keys(objectRecord(value)).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    errors.push(`${label} must contain exactly ${expected.join(",")}`);
  }
}

function identifier(value, label, errors) {
  const normalized = text(value);
  if (!IDENTIFIER_PATTERN.test(normalized)) {
    errors.push(`${label} must be a stable snake_case identifier`);
    return "";
  }
  return normalized;
}

function normalizedIdentifierSet(value, label, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${label} must be a non-empty array`);
    return [];
  }
  const result = [];
  for (const [index, entry] of value.entries()) {
    const normalized = text(entry);
    if (normalized !== "*" && !IDENTIFIER_PATTERN.test(normalized)) {
      errors.push(`${label}[${index}] must be a stable identifier or wildcard`);
      continue;
    }
    if (result.includes(normalized)) {
      errors.push(`${label} contains duplicate ${normalized}`);
      continue;
    }
    result.push(normalized);
  }
  if (result.includes("*") && result.length !== 1) {
    errors.push(`${label} wildcard must be the only entry`);
  }
  return result;
}

function sameStringArray(value, expected) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((entry, index) => entry === expected[index]);
}

function objectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function deepFreeze(value, visited = new WeakSet()) {
  if (!value || typeof value !== "object" || visited.has(value)) return value;
  visited.add(value);
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested, visited);
  return value;
}

module.exports = {
  DEFAULT_CATALOG_PATH,
  PET_FUSION_ADDITIONAL_COST_POLICY,
  PET_FUSION_BASE_ACTIVE_SKILL_IDS,
  PET_FUSION_BASE_ACTIVE_SKILL_FORGET_POLICY,
  PET_FUSION_BINDING_POLICIES,
  PET_FUSION_CATALOG_ID,
  PET_FUSION_CATALOG_SCHEMA_VERSION,
  PET_FUSION_INHERITED_SPECIAL_ACTIVE_FORGET_POLICY,
  PET_FUSION_MAXIMUM_LEVEL,
  PET_FUSION_MINIMUM_LEVEL,
  PET_FUSION_PASSIVE_SOURCE_WEIGHTS,
  PET_FUSION_POST_FUSION_TRAINING_POLICY,
  PET_FUSION_REQUIRED_REBIRTH_COUNT,
  PET_FUSION_RESULT_BINDING_POLICY,
  PET_FUSION_RESULT_STATE_POLICIES,
  PET_FUSION_ROLE_IDS,
  PET_FUSION_SPECIAL_ACTIVE_CHANCE,
  PET_FUSION_UNBOUND_RESULT_TRADE_POLICY,
  PetFusionRecipeCatalogError,
  createPetFusionRecipeCatalog,
  loadPetFusionRecipeCatalog,
};
