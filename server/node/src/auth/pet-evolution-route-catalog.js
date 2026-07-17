"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {isDeepStrictEqual} = require("node:util");

const {loadPetEvolutionBalance} = require("./pet-evolution-balance");
const {loadPetGrowthCatalog} = require("./pet-growth-catalog");
const {createPetPaidResetPolicyCatalog} = require("./pet-paid-reset-policy-catalog");
const {loadPetEncounterCatalog} = require("./pet-encounter-authority");

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const DATA_DIR = path.join(REPO_ROOT, "client/godot/data");
const DEFAULT_ROUTE_PATH = path.join(DATA_DIR, "pet_evolution_routes.json");
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]{1,95}$/;
const STAT_KEYS = Object.freeze(["maxHp", "attack", "defense", "quick"]);
const STAT_WEIGHTS = Object.freeze({maxHp: 0.25, attack: 1, defense: 1, quick: 1});
const EXPECTED_ROUTE_COUNT = 2;
const TOLERANCE = 0.001;

class PetEvolutionRouteCatalogError extends Error {
  constructor(errors) {
    const values = Array.isArray(errors) ? errors.map(String).filter(Boolean) : [String(errors || "")].filter(Boolean);
    super(`pet evolution route catalog invalid: ${values.join("; ")}`);
    this.name = "PetEvolutionRouteCatalogError";
    this.code = "pet_evolution_route_catalog_invalid";
    this.errors = values;
  }
}

function loadPetEvolutionRouteCatalog(options = {}) {
  const routePath = path.resolve(String(options.routePath || DEFAULT_ROUTE_PATH));
  const dataDir = path.resolve(String(options.dataDir || DATA_DIR));
  const document = readJson(routePath);
  const templates = readJson(path.join(dataDir, "pet_templates.json"));
  const growthDocument = readJson(path.join(dataDir, "balance", "pet_growth_species_profiles.json"));
  const items = readJson(path.join(dataDir, "bag_items.json"));
  const rewards = readJson(path.join(dataDir, "battle_rewards.json"));
  const quests = readJson(path.join(dataDir, "quests.json"));
  const actions = readJson(path.join(dataDir, "battle_actions.json"));
  const passives = readJson(path.join(dataDir, "battle_passive_skills.json"));
  const rewardEconomy = readJson(path.join(dataDir, "balance", "reward_economy.json"));
  const evolutionBalance = options.evolutionBalance || loadPetEvolutionBalance();
  const growthCatalog = options.growthCatalog || loadPetGrowthCatalog();
  const paidResetCatalog = options.paidResetCatalog || createPetPaidResetPolicyCatalog();
  const encounterCatalog = options.encounterCatalog || loadPetEncounterCatalog({dataDir});
  return normalizePetEvolutionRouteCatalog({
    document,
    templates,
    growthDocument,
    items,
    rewards,
    quests,
    actions,
    passives,
    rewardEconomy,
    evolutionBalance,
    growthCatalog,
    paidResetCatalog,
    encounterCatalog,
    routePath,
  });
}

function normalizePetEvolutionRouteCatalog(input) {
  const errors = [];
  const document = record(input.document);
  exactKeys(document, [
    "schemaVersion",
    "catalogId",
    "balanceVersion",
    "runtimeEnabled",
    "disabledMessage",
    "qualityProjection",
    "materialEncounters",
    "routes",
  ], "catalog", errors);
  if (document.schemaVersion !== 1) errors.push("catalog.schemaVersion must equal 1");
  if (document.catalogId !== "pet_evolution_routes_v1") errors.push("catalog.catalogId must equal pet_evolution_routes_v1");
  if (document.balanceVersion !== input.evolutionBalance.balanceVersion) errors.push("catalog.balanceVersion does not match pet evolution balance");
  if (typeof document.runtimeEnabled !== "boolean") errors.push("catalog.runtimeEnabled must be boolean");
  if (!text(document.disabledMessage)) errors.push("catalog.disabledMessage must be non-empty");
  if (!isDeepStrictEqual(document.qualityProjection, input.evolutionBalance.qualityProjection)) {
    errors.push("catalog.qualityProjection must exactly match pet evolution balance");
  }

  const linesById = uniqueIndex(input.templates.lines, "lineId", "pet lines", errors);
  const subtypesById = uniqueIndex(input.templates.subtypes, "subtypeId", "pet subtypes", errors);
  const formsById = uniqueIndex(input.templates.forms, "formId", "pet forms", errors);
  const rawProfilesById = uniqueIndex(input.growthDocument.profiles, "profileId", "growth profiles", errors);
  const itemsById = uniqueIndex(input.items.items, "id", "bag items", errors);
  const rewardTablesById = uniqueIndex(input.rewards.rewardTables, "id", "battle rewards", errors);
  const questsById = uniqueIndex(input.quests.quests, "id", "quests", errors);
  const actionIds = new Set(array(input.actions.actions).map((entry) => text(entry && entry.id)).filter(Boolean));
  const passiveIds = new Set(array(input.passives.passives).map((entry) => text(entry && entry.id)).filter(Boolean));
  const expGroups = explicitExpGroups(input.rewardEconomy, errors);

  const encounters = [];
  const encountersById = Object.create(null);
  for (const [index, raw] of array(document.materialEncounters).entries()) {
    const encounter = normalizeMaterialEncounter(raw, index, {
      itemsById,
      rewardTablesById,
      encounterCatalog: input.encounterCatalog,
      expGroups,
    }, errors);
    if (!encounter) continue;
    if (Object.hasOwn(encountersById, encounter.sourceId)) {
      errors.push(`duplicate material source ${encounter.sourceId}`);
      continue;
    }
    encountersById[encounter.sourceId] = encounter;
    encounters.push(encounter);
  }
  if (encounters.length !== 3) errors.push("catalog.materialEncounters must contain one shared core source and two lineage sources");
  if (encounters.filter((entry) => entry.kind === "shared_floor_core").length !== 1) {
    errors.push("catalog.materialEncounters must contain exactly one shared_floor_core");
  }
  if (encounters.filter((entry) => entry.kind === "lineage_material").length !== 2) {
    errors.push("catalog.materialEncounters must contain exactly two lineage_material sources");
  }

  const routes = [];
  const routesById = Object.create(null);
  const sourceForms = new Set();
  const targetForms = new Set();
  const lineIds = new Set();
  for (const [index, raw] of array(document.routes).entries()) {
    const route = normalizeRoute(raw, index, {
      runtimeEnabled: document.runtimeEnabled,
      evolutionBalance: input.evolutionBalance,
      growthCatalog: input.growthCatalog,
      paidResetCatalog: input.paidResetCatalog,
      linesById,
      subtypesById,
      formsById,
      rawProfilesById,
      questsById,
      actionIds,
      passiveIds,
      encountersById,
    }, errors);
    if (!route) continue;
    if (Object.hasOwn(routesById, route.routeId)) errors.push(`duplicate route ${route.routeId}`);
    if (sourceForms.has(route.sourceFormId)) errors.push(`duplicate route source form ${route.sourceFormId}`);
    if (targetForms.has(route.targetFormId)) errors.push(`duplicate route target form ${route.targetFormId}`);
    if (lineIds.has(route.lineId)) errors.push(`duplicate evolution line ${route.lineId}`);
    routesById[route.routeId] = route;
    sourceForms.add(route.sourceFormId);
    targetForms.add(route.targetFormId);
    lineIds.add(route.lineId);
    routes.push(route);
  }
  if (routes.length !== EXPECTED_ROUTE_COUNT) {
    errors.push(`catalog.routes must contain exactly ${EXPECTED_ROUTE_COUNT} routes`);
  }
  const usedLineageSources = routes.map((route) => route.lineageSourceId);
  if (new Set(usedLineageSources).size !== routes.length) {
    errors.push("each evolution route must use a distinct lineage material source");
  }
  const sharedCoreIds = new Set(routes.map((route) => route.sharedCoreSourceId));
  if (sharedCoreIds.size !== 1) errors.push("all evolution routes must share one floor-core source");
  if (document.runtimeEnabled && routes.some((route) => route.assetGate.status !== "formal")) {
    errors.push("runtime cannot be enabled while any route still has deferred assets");
  }

  if (errors.length > 0) throw new PetEvolutionRouteCatalogError(errors);
  const manualEncounterRules = encounters.map((encounter) => deepFreeze({
    kind: "evolution_material",
    mapId: encounter.mapId,
    interactionId: encounter.interactionId,
    groupId: encounter.encounterGroupId,
    claimId: "",
    minAttemptLevel: encounter.minPlayerLevel,
    minParticipantCount: encounter.minPlayerCount,
    rewardItemId: encounter.itemId,
    rewardName: encounter.itemLabel,
    sourceName: encounter.interactionName,
    runtimeEnabled: Boolean(document.runtimeEnabled),
    disabledMessage: text(document.disabledMessage),
  }));
  return deepFreeze({
    schemaVersion: 1,
    catalogId: document.catalogId,
    balanceVersion: document.balanceVersion,
    runtimeEnabled: document.runtimeEnabled,
    disabledMessage: text(document.disabledMessage),
    qualityProjection: structuredClone(document.qualityProjection),
    materialEncounters: encounters,
    materialEncountersById: encountersById,
    routes,
    routesById,
    manualEncounterRules,
    routePath: String(input.routePath || ""),
  });
}

function normalizeMaterialEncounter(rawValue, index, deps, errors) {
  const raw = record(rawValue);
  const label = `materialEncounters[${index}]`;
  const sourceId = identifier(raw.sourceId, `${label}.sourceId`, errors);
  const kind = text(raw.kind);
  if (!["shared_floor_core", "lineage_material"].includes(kind)) errors.push(`${label}.kind is unsupported`);
  const mapId = identifier(raw.mapId, `${label}.mapId`, errors);
  const encounterZoneId = identifier(raw.encounterZoneId, `${label}.encounterZoneId`, errors);
  const interactionId = identifier(raw.interactionId, `${label}.interactionId`, errors);
  const encounterGroupId = identifier(raw.encounterGroupId, `${label}.encounterGroupId`, errors);
  const rewardTableId = identifier(raw.rewardTableId, `${label}.rewardTableId`, errors);
  const itemId = identifier(raw.itemId, `${label}.itemId`, errors);
  const itemBinding = text(raw.itemBinding);
  if (!["bound", "unbound"].includes(itemBinding)) errors.push(`${label}.itemBinding must be bound or unbound`);
  const itemCountPerVictory = positiveInteger(raw.itemCountPerVictory, `${label}.itemCountPerVictory`, errors);
  const minPlayerLevel = positiveInteger(raw.minPlayerLevel, `${label}.minPlayerLevel`, errors);
  const minPlayerCount = positiveInteger(raw.minPlayerCount, `${label}.minPlayerCount`, errors);
  if (minPlayerCount !== 2) errors.push(`${label}.minPlayerCount must equal 2`);
  const enemyCount = positiveInteger(raw.enemyCount, `${label}.enemyCount`, errors);
  if (enemyCount !== 10) errors.push(`${label}.enemyCount must equal 10`);
  if (raw.repeatable !== true) errors.push(`${label}.repeatable must be true`);
  if (raw.personalReward !== true) errors.push(`${label}.personalReward must be true`);

  const item = deps.itemsById[itemId];
  if (!item) {
    errors.push(`${label} references unknown item ${itemId}`);
  } else {
    const actualBinding = text(item.binding) === "bound" ? "bound" : "unbound";
    if (actualBinding !== itemBinding) errors.push(`${label}.itemBinding does not match bag item ${itemId}`);
  }
  const reward = deps.rewardTablesById[rewardTableId];
  if (!reward) {
    errors.push(`${label} references unknown reward table ${rewardTableId}`);
  } else {
    if (reward.repeatable !== true || reward.personalReward !== true) errors.push(`${label} reward table must be repeatable personal reward`);
    const itemRewards = array(reward.rewards);
    if (itemRewards.length !== 1) errors.push(`${label} reward table must contain exactly one item reward`);
    const only = record(itemRewards[0]);
    if (
      text(only.itemId) !== itemId
      || Number(only.min) !== itemCountPerVictory
      || Number(only.max) !== itemCountPerVictory
      || Number(only.chance) !== 1
    ) errors.push(`${label} reward table must deterministically grant ${itemCountPerVictory} ${itemId}`);
  }
  if (!deps.expGroups.has(rewardTableId)) errors.push(`${label} reward table lacks an explicit EXP multiplier in every formula`);

  const map = deps.encounterCatalog.mapsById && deps.encounterCatalog.mapsById[mapId];
  const zone = map && map.zonesById && map.zonesById[encounterZoneId];
  const interaction = map && map.interactionsById && map.interactionsById[interactionId];
  if (!map) errors.push(`${label} references unknown map ${mapId}`);
  if (!zone) errors.push(`${label} references unknown encounter zone ${encounterZoneId}`);
  if (!interaction) errors.push(`${label} references unknown interaction ${interactionId}`);
  if (zone) {
    if (zone.manualOnly !== true) errors.push(`${label} encounter zone must be manualOnly`);
    if (text(zone.encounterGroupId) !== encounterGroupId || text(zone.rewardTableId || zone.encounterGroupId) !== rewardTableId) {
      errors.push(`${label} encounter zone group/reward mismatch`);
    }
    if (Number(zone.enemyCount) !== enemyCount || array(zone.fixedWildPets).length !== enemyCount) {
      errors.push(`${label} encounter zone must contain exactly ${enemyCount} fixed enemies`);
    }
    if (array(zone.fixedWildPets).some((pet) => pet && pet.catchable !== false)) {
      errors.push(`${label} evolution material enemies must all be explicitly non-catchable`);
    }
  }
  if (interaction) {
    if (
      text(interaction.encounterZoneId) !== encounterZoneId
      || text(interaction.encounterGroupId) !== encounterGroupId
    ) errors.push(`${label} interaction does not point to the declared encounter`);
  }
  if (!sourceId) return null;
  return deepFreeze({
    sourceId,
    kind,
    mapId,
    encounterZoneId,
    interactionId,
    encounterGroupId,
    rewardTableId,
    itemId,
    itemLabel: item ? text(item.label || itemId) : itemId,
    itemBinding,
    itemCountPerVictory,
    minPlayerLevel,
    minPlayerCount,
    enemyCount,
    repeatable: true,
    personalReward: true,
    interactionName: interaction ? text(interaction.name || interactionId) : interactionId,
  });
}

function normalizeRoute(rawValue, index, deps, errors) {
  const raw = record(rawValue);
  const label = `routes[${index}]`;
  const routeId = identifier(raw.routeId, `${label}.routeId`, errors);
  const lineId = identifier(raw.lineId, `${label}.lineId`, errors);
  const sourceFormId = identifier(raw.sourceFormId, `${label}.sourceFormId`, errors);
  const targetFormId = identifier(raw.targetFormId, `${label}.targetFormId`, errors);
  const sourceGrowthProfileId = identifier(raw.sourceGrowthProfileId, `${label}.sourceGrowthProfileId`, errors);
  const targetGrowthProfileId = identifier(raw.targetGrowthProfileId, `${label}.targetGrowthProfileId`, errors);
  const line = deps.linesById[lineId];
  const sourceForm = deps.formsById[sourceFormId];
  const targetForm = deps.formsById[targetFormId];
  const sourceProfile = deps.rawProfilesById[sourceGrowthProfileId];
  const targetProfile = deps.rawProfilesById[targetGrowthProfileId];
  if (!line) errors.push(`${label} references unknown line ${lineId}`);
  if (!sourceForm) errors.push(`${label} references unknown source form ${sourceFormId}`);
  if (!targetForm) errors.push(`${label} references unknown target form ${targetFormId}`);
  if (!sourceProfile) errors.push(`${label} references unknown source growth profile ${sourceGrowthProfileId}`);
  if (!targetProfile) errors.push(`${label} references unknown target growth profile ${targetGrowthProfileId}`);
  if (sourceForm && (text(sourceForm.lineId) !== lineId || sourceForm.capture && sourceForm.capture.catchable !== true)) {
    errors.push(`${label} source form must be a catchable member of ${lineId}`);
  }
  if (targetForm && (text(targetForm.lineId) !== lineId || !targetForm.capture || targetForm.capture.catchable !== false)) {
    errors.push(`${label} target form must be a non-catchable member of ${lineId}`);
  }
  if (sourceForm && text(sourceForm.growthSpeciesProfileId) !== sourceGrowthProfileId) errors.push(`${label} source form/profile mismatch`);
  if (targetForm && text(targetForm.growthSpeciesProfileId) !== targetGrowthProfileId) errors.push(`${label} target form/profile mismatch`);
  if (sourceProfile && text(sourceProfile.formId) !== sourceFormId) errors.push(`${label} source profile/form mismatch`);
  if (targetProfile && text(targetProfile.formId) !== targetFormId) errors.push(`${label} target profile/form mismatch`);
  if (sourceGrowthProfileId && !deps.growthCatalog.profileById(sourceGrowthProfileId)) errors.push(`${label} source profile is absent from strict growth catalog`);
  if (targetGrowthProfileId && !deps.growthCatalog.profileById(targetGrowthProfileId)) errors.push(`${label} target profile is absent from strict growth catalog`);

  const basePower = sourceProfile && targetProfile ? validateGrowthPair(sourceProfile, targetProfile, label, deps.evolutionBalance, errors) : null;
  const license = record(raw.license);
  const questId = identifier(license.questId, `${label}.license.questId`, errors);
  const abilityId = identifier(license.abilityId, `${label}.license.abilityId`, errors);
  if (license.oneTime !== true || license.directResult !== false) errors.push(`${label}.license must be one-time and never grant the evolved pet directly`);
  const quest = deps.questsById[questId];
  if (!quest) {
    errors.push(`${label} references unknown license quest ${questId}`);
  } else {
    const objective = record(quest.objective);
    const rewards = record(quest.rewards);
    const abilities = array(rewards.abilities);
    if (quest.optional !== true || quest.runtimeEnabled !== deps.runtimeEnabled) errors.push(`${label} license quest runtime gate must match the route catalog`);
    if (text(quest.requiredMissingAbility) !== abilityId) errors.push(`${label} license quest missing-ability gate mismatch`);
    if (array(rewards.items).length !== 0 || abilities.length !== 1 || text(abilities[0] && abilities[0].abilityId) !== abilityId) {
      errors.push(`${label} license quest must grant only the declared ability`);
    }
    if (text(objective.type) !== "battle_victory" || Number(objective.minPartyMemberCount) < 1) {
      errors.push(`${label} license quest must require a team battle victory`);
    }
  }

  const eligibility = record(raw.eligibility);
  const expectedEligibility = deps.evolutionBalance.eligibility;
  if (
    Number(eligibility.requiredRebirthCount) !== expectedEligibility.requiredRebirthCount
    || Number(eligibility.requiredLevel) !== expectedEligibility.requiredLevel
    || text(eligibility.requiredGrowthModelVersion) !== expectedEligibility.requiredGrowthModelVersion
  ) errors.push(`${label}.eligibility does not match pet evolution balance`);

  const cost = record(raw.cost);
  const stoneCoins = positiveInteger(cost.stoneCoins, `${label}.cost.stoneCoins`, errors);
  if (text(cost.walletPolicyId) !== deps.evolutionBalance.acquisition.paymentWalletPolicyId) errors.push(`${label}.cost.walletPolicyId mismatch`);
  const itemCosts = array(cost.items);
  if (itemCosts.length !== 2) errors.push(`${label}.cost.items must contain shared core and lineage material`);
  let sharedCoreSourceId = "";
  let lineageSourceId = "";
  let sharedCoreVictories = 0;
  let lineageVictories = 0;
  for (const itemCost of itemCosts) {
    const itemId = identifier(itemCost && itemCost.itemId, `${label}.cost.items.itemId`, errors);
    const count = positiveInteger(itemCost && itemCost.count, `${label}.cost.items.count`, errors);
    const sourceId = identifier(itemCost && itemCost.sourceId, `${label}.cost.items.sourceId`, errors);
    const source = deps.encountersById[sourceId];
    if (!source || source.itemId !== itemId) {
      errors.push(`${label} item ${itemId} does not match material source ${sourceId}`);
      continue;
    }
    const victories = Math.ceil(count / source.itemCountPerVictory);
    if (source.kind === "shared_floor_core") {
      sharedCoreSourceId = sourceId;
      sharedCoreVictories = victories;
    } else {
      lineageSourceId = sourceId;
      lineageVictories = victories;
      if (quest && text(record(quest.objective).encounterGroupId) !== source.encounterGroupId) {
        errors.push(`${label} license quest must use its lineage encounter group`);
      }
    }
  }
  if (!sharedCoreSourceId || !lineageSourceId) errors.push(`${label} must consume one shared core and one lineage material`);

  const result = record(raw.result);
  const terminal = deps.evolutionBalance.terminalPath;
  if (
    Number(result.level) !== terminal.resultLevel
    || Number(result.rebirthCount) !== terminal.resultRebirthCount
    || text(result.terminalPathId) !== terminal.pathId
    || result.normalSecondRebirthAllowed !== terminal.normalSecondRebirthAllowed
    || result.fusionMaterialAllowed !== terminal.fusionMaterialAllowed
    || Number(result.successRate) !== terminal.successRate
    || result.failureConsumes !== terminal.failureConsumes
    || result.preserveInstanceIdentity !== true
    || result.preserveBindingAndLock !== true
  ) errors.push(`${label}.result violates the terminal evolution contract`);

  const skills = record(raw.skills);
  const defaultActionIds = array(skills.defaultActionIds).map(text).filter(Boolean);
  if (new Set(defaultActionIds).size !== defaultActionIds.length || defaultActionIds.length < 2 || defaultActionIds.length > 7) errors.push(`${label}.skills.defaultActionIds must contain 2..7 unique actions`);
  for (const actionId of defaultActionIds) if (!deps.actionIds.has(actionId)) errors.push(`${label} references unsupported action ${actionId}`);
  const passiveSkillId = identifier(skills.passiveSkillId, `${label}.skills.passiveSkillId`, errors);
  if (!deps.passiveIds.has(passiveSkillId)) errors.push(`${label} references unsupported passive ${passiveSkillId}`);
  if (line && text(line.passiveSkillId) !== passiveSkillId) errors.push(`${label} passive must preserve the line identity`);
  const targetSubtype = targetForm && deps.subtypesById[text(targetForm.subtypeId)];
  if (!targetSubtype || !isDeepStrictEqual(array(targetSubtype.activeSkillIds), defaultActionIds)) errors.push(`${label} target subtype actions do not match the route`);
  if (skills.preserveLearnedAndInherited !== true) errors.push(`${label} must preserve learned and inherited skills`);

  const effort = record(raw.effort);
  const deterministicVictories = sharedCoreVictories + lineageVictories;
  if (
    Number(effort.sharedCoreVictories) !== sharedCoreVictories
    || Number(effort.lineageVictories) !== lineageVictories
    || Number(effort.deterministicVictories) !== deterministicVictories
    || Number(effort.normalizedRepeatableEffort) !== deps.evolutionBalance.effortModel.evolutionRepeatable.total
    || Number(effort.normalizedFirstUnlockEffort) !== deps.evolutionBalance.effortModel.evolutionRepeatable.total + deps.evolutionBalance.effortModel.firstUnlock.licenseQuest
  ) errors.push(`${label}.effort does not match deterministic costs or the global effort budget`);
  if (deterministicVictories !== 20) errors.push(`${label} must require exactly 20 deterministic team victories in v1`);

  const paidResetPriceTierId = identifier(raw.paidResetPriceTierId, `${label}.paidResetPriceTierId`, errors);
  const resetPolicy = deps.paidResetCatalog.formPoliciesById[targetFormId];
  if (!resetPolicy || resetPolicy.priceTierId !== paidResetPriceTierId || paidResetPriceTierId !== "diamond_evolution") {
    errors.push(`${label} target form must use the diamond_evolution paid-reset tier`);
  }
  const assetGate = record(raw.assetGate);
  if (
    !["deferred", "formal"].includes(text(assetGate.status))
    || assetGate.formalAssetRequiredBeforeRuntime !== true
    || assetGate.placeholderAllowedForQa !== true
    || !text(assetGate.replacementPath)
    || array(assetGate.requiredAnimations).length < 8
  ) errors.push(`${label}.assetGate is incomplete`);
  if (targetForm) {
    const artPlan = record(record(targetForm.visual).artPlan);
    if (
      text(artPlan.replacementPath) !== text(assetGate.replacementPath)
      || !array(assetGate.requiredAnimations).every((animation) => array(artPlan.neededAnimations).includes(animation))
    ) errors.push(`${label} target form art plan does not satisfy the route asset gate`);
  }
  if (deps.runtimeEnabled && text(assetGate.status) !== "formal") errors.push(`${label} cannot run with deferred assets`);
  if (!routeId) return null;
  return deepFreeze({
    routeId,
    lineId,
    sourceFormId,
    targetFormId,
    sourceGrowthProfileId,
    targetGrowthProfileId,
    license: {questId, abilityId, oneTime: true, directResult: false},
    eligibility: structuredClone(eligibility),
    cost: {stoneCoins, walletPolicyId: text(cost.walletPolicyId), items: structuredClone(itemCosts)},
    result: structuredClone(result),
    skills: {defaultActionIds, passiveSkillId, preserveLearnedAndInherited: true},
    effort: structuredClone(effort),
    paidResetPriceTierId,
    assetGate: structuredClone(assetGate),
    presentation: structuredClone(record(raw.presentation)),
    sharedCoreSourceId,
    lineageSourceId,
    projectedBasePower: basePower,
  });
}

function validateGrowthPair(source, target, label, balance, errors) {
  const sourceBasePower = internalPower(source.outputBase);
  const targetBasePower = internalPower(target.outputBase);
  if (Math.abs(sourceBasePower - targetBasePower) > 0.000001) {
    errors.push(`${label} evolution may not inflate Lv1 internal base power`);
  }
  const sourceRules = record(source.individualRules);
  const targetRules = record(target.individualRules);
  if (sourceRules.distribution !== targetRules.distribution || sourceRules.rareExtremeRate !== targetRules.rareExtremeRate) {
    errors.push(`${label} source and target must share the same per-stat distribution family for quantile projection`);
  }
  let center = 0;
  let radius = 0;
  for (const key of STAT_KEYS) {
    const sourceInitial = symmetricHalfRange(record(sourceRules.initialOutputSpread)[key], `${label}.source.initial.${key}`, errors);
    const targetInitial = symmetricHalfRange(record(targetRules.initialOutputSpread)[key], `${label}.target.initial.${key}`, errors);
    if (sourceInitial !== null && targetInitial !== null && Math.abs(sourceInitial - targetInitial) > 0.000001) {
      errors.push(`${label} must preserve ${key} Lv1 percentile geometry exactly`);
    }
    const sourceGrowth = symmetricHalfRange(record(sourceRules.growthOutputSpread)[key], `${label}.source.growth.${key}`, errors);
    const targetGrowth = symmetricHalfRange(record(targetRules.growthOutputSpread)[key], `${label}.target.growth.${key}`, errors);
    const weight = STAT_WEIGHTS[key];
    center += (Number(target.outputGrowth && target.outputGrowth[key]) - Number(source.outputGrowth && source.outputGrowth[key])) * weight;
    if (sourceGrowth !== null && targetGrowth !== null) {
      if (targetGrowth + TOLERANCE < sourceGrowth) errors.push(`${label} target ${key} growth spread may not narrow the preserved quantile`);
      radius += Math.abs(targetGrowth - sourceGrowth) * weight;
    }
  }
  const minimum = center - radius;
  const maximum = center + radius;
  const budget = balance.powerBudget.intrinsicUpliftInternalPower;
  if (minimum < Number(budget.min) - TOLERANCE || maximum > Number(budget.max) + TOLERANCE) {
    errors.push(`${label} intrinsic growth uplift ${round6(minimum)}..${round6(maximum)} exceeds the ordinary second-rebirth band`);
  }
  if (center < Number(budget.p25) || center > Number(budget.p85)) {
    errors.push(`${label} center intrinsic uplift must remain between the ordinary second-rebirth p25 and p85`);
  }
  return deepFreeze({
    source: round6(sourceBasePower),
    target: round6(targetBasePower),
    intrinsicUplift: {min: round6(minimum), center: round6(center), max: round6(maximum)},
  });
}

function explicitExpGroups(document, errors) {
  const formulas = array(record(document).battleExp && record(document).battleExp.formulas);
  if (formulas.length < 1) {
    errors.push("reward economy has no battle EXP formulas");
    return new Set();
  }
  const groupSets = formulas.map((formula) => new Set(Object.keys(record(formula && formula.groupMultipliers))));
  return new Set([...groupSets[0]].filter((id) => groupSets.every((set) => set.has(id))));
}

function uniqueIndex(values, key, label, errors) {
  const result = Object.create(null);
  for (const [index, value] of array(values).entries()) {
    const id = text(value && value[key]);
    if (!id) {
      errors.push(`${label}[${index}].${key} is empty`);
    } else if (Object.hasOwn(result, id)) {
      errors.push(`duplicate ${label} id ${id}`);
    } else {
      result[id] = value;
    }
  }
  return result;
}

function exactKeys(value, keys, label, errors) {
  const actual = Object.keys(record(value)).sort();
  const expected = [...keys].sort();
  if (!isDeepStrictEqual(actual, expected)) errors.push(`${label} fields must equal ${expected.join(",")}`);
}

function symmetricHalfRange(value, label, errors) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every((entry) => Number.isFinite(entry))) {
    errors.push(`${label} must be a finite two-number range`);
    return null;
  }
  if (Math.abs(Number(value[0]) + Number(value[1])) > 0.000001 || Number(value[0]) > 0) {
    errors.push(`${label} must be symmetric around zero`);
    return null;
  }
  return Number(value[1]);
}

function internalPower(stats) {
  return STAT_KEYS.reduce((sum, key) => sum + Number(stats && stats[key] || 0) * STAT_WEIGHTS[key], 0);
}

function positiveInteger(value, label, errors) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    errors.push(`${label} must be a positive integer`);
    return 0;
  }
  return number;
}

function identifier(value, label, errors) {
  const id = text(value);
  if (!IDENTIFIER_PATTERN.test(id)) {
    errors.push(`${label} must be a stable lowercase identifier`);
    return "";
  }
  return id;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function round6(value) {
  return Math.round(Number(value || 0) * 1e6) / 1e6;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

module.exports = {
  EXPECTED_ROUTE_COUNT,
  PetEvolutionRouteCatalogError,
  loadPetEvolutionRouteCatalog,
};
