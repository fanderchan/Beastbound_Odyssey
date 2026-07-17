#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../../..");
const require = createRequire(import.meta.url);
const {
  createPetPaidResetPolicyCatalog,
  resolvePetPaidResetQuote,
} = require(path.join(repoRoot, "server/node/src/auth/pet-paid-reset-policy-catalog.js"));
const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const checkMode = args.includes("--check");
const formArgIndex = args.indexOf("--form");
const requestedFormId = formArgIndex >= 0 ? String(args[formArgIndex + 1] || "").trim() : "";
const STAT_KEYS_FOR_INSPECTION = Object.freeze(["maxHp", "attack", "defense", "quick"]);

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function readJson(relativePath) {
  try {
    return JSON.parse(readText(relativePath));
  } catch (error) {
    throw new Error(`${relativePath}: ${error.message}`);
  }
}

function rows(value, key) {
  return value && Array.isArray(value[key]) ? value[key] : [];
}

function indexRows(values, key, label, issues) {
  const result = new Map();
  for (const [index, value] of values.entries()) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      issues.errors.push(`${label}[${index}] 不是对象`);
      continue;
    }
    const id = String(value[key] || "").trim();
    if (!id) {
      issues.errors.push(`${label}[${index}].${key} 不能为空`);
      continue;
    }
    if (result.has(id)) {
      issues.errors.push(`${label}.${key} 重复: ${id}`);
      continue;
    }
    result.set(id, value);
  }
  return result;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function compactGrowthProfile(profile) {
  if (!profile) return null;
  const observation = profile.growthObservation && typeof profile.growthObservation === "object"
    ? profile.growthObservation
    : {};
  return {
    profileId: profile.profileId,
    displayName: profile.displayName,
    familyRole: profile.familyRole,
    formId: profile.formId,
    outputBase: profile.outputBase,
    outputGrowth: profile.outputGrowth,
    individualRules: profile.individualRules,
    targetAudit: profile.targetAudit,
    growthObservation: {
      sampleCount: observation.sampleCount,
      levelMin: observation.levelMin,
      levelMax: observation.levelMax,
      thresholdMetric: observation.thresholdMetric,
      gradeThresholds: observation.gradeThresholds,
      configuredLevels: observation.powerGrowthPercentilesByLevel
        ? Object.keys(observation.powerGrowthPercentilesByLevel).length
        : 0,
    },
  };
}

function captureChanceTable(form, captureFormula, captureTools) {
  const capture = form && form.capture && typeof form.capture === "object" ? form.capture : {};
  const difficulty = clamp(number(capture.difficulty, 42), 0, 90) / 100;
  const hpRatios = {fullHp: 1, halfHp: 0.5, nearZeroHp: 0};
  const result = {};
  for (const tool of captureTools) {
    const toolId = String(tool.id || "");
    if (!toolId || toolId === "capture_poison_wuli_net") continue;
    result[toolId] = {};
    for (const [label, hpRatio] of Object.entries(hpRatios)) {
      let chance = number(captureFormula.baseChance, 0.42);
      chance -= hpRatio * number(captureFormula.hpRatioPenalty, 0.22);
      chance -= difficulty * number(captureFormula.difficultyRatioPenalty, 0.12);
      chance += number(tool.chanceBonus, 0);
      chance = clamp(chance, number(captureFormula.minChance, 0.05), number(captureFormula.maxChance, 0.95));
      const roundedChance = Number(chance.toFixed(4));
      result[toolId][label] = {
        chance: roundedChance,
        expectedAttempts: roundedChance > 0 ? Number((1 / roundedChance).toFixed(2)) : null,
      };
    }
  }
  return result;
}

const issues = {errors: [], warnings: []};
const petDocument = readJson("client/godot/data/pet_templates.json");
const actionDocument = readJson("client/godot/data/battle_actions.json");
const passiveDocument = readJson("client/godot/data/battle_passive_skills.json");
const growthDocument = readJson("client/godot/data/balance/pet_growth_species_profiles.json");
const captureFormulaDocument = readJson("client/godot/data/balance/capture_formula.json");
const captureToolDocument = readJson("client/godot/data/capture_tools.json");
const trainingDocument = readJson("client/godot/data/pet_skill_training.json");
const regionDocument = readJson("client/godot/data/map_regions.json");

const lines = rows(petDocument, "lines");
const subtypes = rows(petDocument, "subtypes");
const forms = rows(petDocument, "forms");
const actions = rows(actionDocument, "actions");
const passives = rows(passiveDocument, "passives");
const growthProfiles = rows(growthDocument, "profiles");
const captureTools = rows(captureToolDocument, "tools");
const trainingSkills = rows(trainingDocument, "skills");
const trainers = rows(trainingDocument, "trainers");

const lineById = indexRows(lines, "lineId", "lines", issues);
const subtypeById = indexRows(subtypes, "subtypeId", "subtypes", issues);
const formById = indexRows(forms, "formId", "forms", issues);
const actionById = indexRows(actions, "id", "actions", issues);
const passiveById = indexRows(passives, "id", "passives", issues);
const growthById = indexRows(growthProfiles, "profileId", "growthProfiles", issues);
let paidResetPolicyCatalog = null;
try {
  paidResetPolicyCatalog = createPetPaidResetPolicyCatalog();
} catch (error) {
  issues.errors.push(`付费重置价格目录无效: ${String(error && error.message || error)}`);
}

const wildCaptureGrowthPolicy = growthDocument.wildCaptureGrowthPolicy;
const expectedWildCapturePolicyKeys = [
  "schemaVersion",
  "policyId",
  "qualityPowerWeights",
  "levelPressureHalfLevel",
  "upperTailStart",
  "jackpotAcceptanceFloor",
  "upperTailShape",
  "maxSelectionAttempts",
];
if (!wildCaptureGrowthPolicy || typeof wildCaptureGrowthPolicy !== "object" || Array.isArray(wildCaptureGrowthPolicy)) {
  issues.errors.push("成长档缺少 wildCaptureGrowthPolicy；无法保证全宠物捕捉等级成长分布");
} else {
  const keys = Object.keys(wildCaptureGrowthPolicy).sort();
  const expectedKeys = [...expectedWildCapturePolicyKeys].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    issues.errors.push("wildCaptureGrowthPolicy 字段不完整或包含未知字段");
  }
  const weights = wildCaptureGrowthPolicy.qualityPowerWeights;
  if (
    !weights
    || typeof weights !== "object"
    || Array.isArray(weights)
    || STAT_KEYS_FOR_INSPECTION.some((key) => !Number.isFinite(Number(weights[key])) || Number(weights[key]) <= 0)
  ) {
    issues.errors.push("wildCaptureGrowthPolicy.qualityPowerWeights 必须包含正数血攻防敏权重");
  }
  if (!(number(wildCaptureGrowthPolicy.jackpotAcceptanceFloor) > 0 && number(wildCaptureGrowthPolicy.jackpotAcceptanceFloor) < 1)) {
    issues.errors.push("wildCaptureGrowthPolicy.jackpotAcceptanceFloor 必须在 0..1 开区间，不能抹掉彩票尾巴");
  }
  if (!(Math.trunc(number(wildCaptureGrowthPolicy.maxSelectionAttempts)) >= 1 && Math.trunc(number(wildCaptureGrowthPolicy.maxSelectionAttempts)) <= 16)) {
    issues.errors.push("wildCaptureGrowthPolicy.maxSelectionAttempts 必须在 1..16，保证在线生成有界");
  }
}

const petActions = actions.filter((action) => String(action.owner || "") === "pet_skill");
for (const action of petActions) {
  const slot = Math.trunc(number(action.preferredSlot ?? action.slot));
  if (slot < 1 || slot > 7) {
    issues.errors.push(`宠物技能 ${action.id} 的 preferredSlot 必须在 1..7`);
  }
}

for (const line of lines) {
  const passiveId = String(line.passiveSkillId || "").trim();
  if (!passiveId) issues.errors.push(`种系 ${line.lineId} 缺少 passiveSkillId`);
  else if (!passiveById.has(passiveId)) issues.errors.push(`种系 ${line.lineId} 引用不存在的被动 ${passiveId}`);
}

for (const subtype of subtypes) {
  const lineId = String(subtype.lineId || "").trim();
  if (!lineById.has(lineId)) issues.errors.push(`亚种 ${subtype.subtypeId} 引用不存在的种系 ${lineId}`);
  const skillIds = Array.isArray(subtype.activeSkillIds) ? subtype.activeSkillIds.map(String) : [];
  if (!skillIds.includes("pet_attack") || !skillIds.includes("pet_defend")) {
    issues.errors.push(`亚种 ${subtype.subtypeId} 必须包含 pet_attack 与 pet_defend`);
  }
  for (const skillId of skillIds) {
    const action = actionById.get(skillId);
    if (!action) issues.errors.push(`亚种 ${subtype.subtypeId} 引用不存在的主动技能 ${skillId}`);
    else if (String(action.owner || "") !== "pet_skill") issues.errors.push(`亚种 ${subtype.subtypeId} 引用的 ${skillId} 不是 pet_skill`);
  }
}

for (const form of forms) {
  const lineId = String(form.lineId || "").trim();
  const subtypeId = String(form.subtypeId || "").trim();
  const subtype = subtypeById.get(subtypeId);
  if (!lineById.has(lineId)) issues.errors.push(`形态 ${form.formId} 引用不存在的种系 ${lineId}`);
  if (!subtype) issues.errors.push(`形态 ${form.formId} 引用不存在的亚种 ${subtypeId}`);
  else if (String(subtype.lineId || "") !== lineId) issues.errors.push(`形态 ${form.formId} 的种系与亚种不一致`);
  const elements = form.elements && typeof form.elements === "object" ? form.elements : {};
  const elementTotal = ["fire", "water", "earth", "wind"].reduce((sum, key) => sum + Math.trunc(number(elements[key])), 0);
  if (elementTotal !== 10) issues.errors.push(`形态 ${form.formId} 四系合计为 ${elementTotal}，必须为 10`);
  const growthProfileId = String(form.growthSpeciesProfileId || "").trim();
  if (growthProfileId && !growthById.has(growthProfileId)) {
    issues.errors.push(`形态 ${form.formId} 引用不存在的物种成长档 ${growthProfileId}`);
  } else if (!growthProfileId) {
    issues.warnings.push(`形态 ${form.formId} 尚未接入 growthSpeciesProfileId，仍可能走通用成长`);
  }
}

const dataDir = path.join(repoRoot, "client/godot/data");
const mapDocuments = [];
for (const filename of fs.readdirSync(dataDir).filter((name) => name.endsWith("_map.json")).sort()) {
  const relativePath = `client/godot/data/${filename}`;
  const document = readJson(relativePath);
  if (!document || typeof document !== "object" || Array.isArray(document)) continue;
  mapDocuments.push({filename, relativePath, document});
}

const mapCatalogText = readText("client/godot/scripts/world/map_data_catalog.gd");
const registeredMapIds = new Set();
for (const match of mapCatalogText.matchAll(/^\s*"([^"]+)"\s*:\s*"res:\/\/data\/[^\"]+"/gm)) {
  registeredMapIds.add(match[1]);
}

const placementsByFormId = new Map();
const encounterGroupIds = new Set();
for (const {relativePath, document} of mapDocuments) {
  const mapId = String(document.id || "").trim();
  if (!mapId) {
    issues.errors.push(`${relativePath} 缺少 map id`);
    continue;
  }
  if (!registeredMapIds.has(mapId)) issues.errors.push(`地图 ${mapId} 未注册到 MapDataCatalog`);
  const zones = Array.isArray(document.encounterZones) ? document.encounterZones : [];
  for (const zone of zones) {
    if (!zone || typeof zone !== "object") continue;
    const groupId = String(zone.encounterGroupId || "").trim();
    if (groupId) encounterGroupIds.add(groupId);
    const weightedPool = Array.isArray(zone.wildPetPool) ? zone.wildPetPool : [];
    const fixedPool = Array.isArray(zone.fixedWildPets) ? zone.fixedWildPets : [];
    const totalWeight = weightedPool.reduce((sum, entry) => sum + Math.max(0, number(entry && entry.weight, 1)), 0);
    const sources = [
      ...weightedPool.map((entry) => ({entry, source: "wildPetPool"})),
      ...fixedPool.map((entry) => ({entry, source: "fixedWildPets"})),
    ];
    for (const {entry, source} of sources) {
      if (!entry || typeof entry !== "object") continue;
      const formId = String(entry.formId || entry.templateId || "").trim();
      if (!formId) {
        issues.errors.push(`${mapId}.${zone.id || groupId}.wildPetPool 存在空 formId`);
        continue;
      }
      if (!formById.has(formId)) issues.errors.push(`地图 ${mapId} 遇敌池引用不存在的形态 ${formId}`);
      const weight = Math.max(0, number(entry.weight, 1));
      const levelMin = Math.max(1, Math.trunc(number(entry.levelMin ?? entry.level, 1)));
      const levelMax = Math.max(levelMin, Math.trunc(number(entry.levelMax ?? entry.level, levelMin)));
      const formRate = source === "fixedWildPets" ? 1 : (totalWeight > 0 ? weight / totalWeight : 0);
      const lv1GivenFormRate = levelMin <= 1 && levelMax >= 1 ? 1 / (levelMax - levelMin + 1) : 0;
      const lv1PerEnemyRate = formRate * lv1GivenFormRate;
      const enemyCount = Math.max(1, Math.trunc(number(zone.enemyCount, 1)));
      const enemyCountMin = Math.max(1, Math.trunc(number(zone.enemyCountMin, enemyCount)));
      const enemyCountMax = Math.max(enemyCountMin, Math.trunc(number(zone.enemyCountMax, enemyCountMin)));
      const independent = Boolean(zone.individualWildPets) && source !== "fixedWildPets";
      const perEncounterMin = independent ? 1 - Math.pow(1 - lv1PerEnemyRate, enemyCountMin) : lv1PerEnemyRate;
      const perEncounterMax = independent ? 1 - Math.pow(1 - lv1PerEnemyRate, enemyCountMax) : lv1PerEnemyRate;
      const encounterRate = clamp(number(zone.encounterRate), 0, 1);
      const perCheckMin = encounterRate * perEncounterMin;
      const perCheckMax = encounterRate * perEncounterMax;
      const placement = {
        mapId,
        mapName: String(document.name || mapId),
        mapPath: relativePath,
        encounterZoneId: String(zone.id || ""),
        encounterZoneName: String(zone.name || ""),
        encounterGroupId: groupId,
        source,
        encounterRate,
        enemyCount: zone.enemyCount,
        enemyCountMin: zone.enemyCountMin,
        enemyCountMax: zone.enemyCountMax,
        individualWildPets: Boolean(zone.individualWildPets),
        weight,
        poolWeightTotal: source === "fixedWildPets" ? null : totalWeight,
        formRate: Number(formRate.toFixed(6)),
        levelMin,
        levelMax,
        lv1GivenFormRate: Number(lv1GivenFormRate.toFixed(6)),
        lv1PerEnemyRate: Number(lv1PerEnemyRate.toFixed(6)),
        lv1PerEncounterRateMin: Number(perEncounterMin.toFixed(6)),
        lv1PerEncounterRateMax: Number(perEncounterMax.toFixed(6)),
        lv1PerMovementCheckMin: Number(perCheckMin.toFixed(8)),
        lv1PerMovementCheckMax: Number(perCheckMax.toFixed(8)),
        expectedMovementChecksMin: perCheckMax > 0 ? Number((1 / perCheckMax).toFixed(1)) : null,
        expectedMovementChecksMax: perCheckMin > 0 ? Number((1 / perCheckMin).toFixed(1)) : null,
        battleStats: entry.battleStats || null,
        captureOverrides: {
          catchable: entry.catchable,
          captureDifficulty: entry.captureDifficulty,
          captureChanceOverride: entry.captureChanceOverride ?? entry.captureRateOverride,
        },
      };
      if (!placementsByFormId.has(formId)) placementsByFormId.set(formId, []);
      placementsByFormId.get(formId).push(placement);
    }
  }
}

for (const form of forms) {
  const capture = form.capture && typeof form.capture === "object" ? form.capture : {};
  if (capture.catchable !== false && !(placementsByFormId.get(form.formId) || []).length) {
    issues.warnings.push(`可捕捉形态 ${form.formId} 没有显式世界遇敌位置（GM codex 动态池不计）`);
  }
}

const knownMapIds = new Set(mapDocuments.map(({document}) => String(document.id || "")));
for (const region of rows(regionDocument, "regions")) {
  for (const mapId of [...(Array.isArray(region.mapIds) ? region.mapIds : []), ...(Array.isArray(region.sharedMapIds) ? region.sharedMapIds : [])]) {
    if (mapId && !knownMapIds.has(String(mapId))) issues.warnings.push(`区域 ${region.id} 引用未扫描到的地图 ${mapId}`);
  }
}

const activeFormulaId = String(captureFormulaDocument.activeFormulaId || "");
const captureFormula = rows(captureFormulaDocument, "formulas").find((entry) => String(entry.id || "") === activeFormulaId)
  || rows(captureFormulaDocument, "formulas")[0]
  || {};
const trainedSkillIds = new Set(trainingSkills.map((entry) => String(entry.skillId || "")));
const trainerSkillIds = new Set(trainers.flatMap((trainer) => Array.isArray(trainer.skillIds) ? trainer.skillIds.map(String) : []));

const authServiceText = readText("server/node/src/auth-service.js");
const growthCatalogText = readText("server/node/src/auth/pet-growth-catalog.js");
const observedGrowthScreeningText = readText("server/node/src/auth/pet-observed-growth-screening.js");
const observedGrowthRulePreviewText = readText("server/node/src/auth/pet-observed-growth-rule-preview.js");
const petExpSettlementText = readText("server/node/src/auth/pet-exp-settlement.js");
const petEncounterAuthorityText = readText("server/node/src/auth/pet-encounter-authority.js");
const petCaptureCandidateAuthorityText = readText("server/node/src/auth/pet-capture-candidate-authority.js");
const wildCaptureGrowthSelectionText = readText("server/node/src/auth/wild-capture-growth-selection.js");
const newPetFactoryText = readText("server/node/src/auth/new-pet-factory.js");
const petRebirthGrowthCycleText = readText("server/node/src/auth/pet-rebirth-growth-cycle.js");
const battlePassiveCatalogText = readText("server/node/src/auth/battle-passive-catalog.js");
const profileVisibilityText = readText("server/node/src/auth/profile-visibility.js");
const protocolText = readText("server/node/src/protocol.js");
const playerProgressText = readText("client/godot/scripts/progression/player_progress_model.gd");
const serverAuthClientText = readText("client/godot/scripts/progression/server_auth_client_model.gd");
const clientGrowthRulePreviewText = readText("client/godot/scripts/progression/pet_growth_rule_preview_model.gd");
const autoCaptureSettingsText = readText("server/node/src/auth/auto-capture-settings.js");
const petAutoCaptureFilterText = readText("server/node/src/auth/pet-auto-capture-filter.js");
const petLevelOnePercentileText = readText("server/node/src/auth/pet-level-one-percentile.js");
const petPaidResetPolicyCatalogText = readText("server/node/src/auth/pet-paid-reset-policy-catalog.js");
const gmPetPaidResetConfigText = readText("server/node/src/auth/gm-pet-paid-reset-config.js");
const clientAutoCaptureFilterText = readText("client/godot/scripts/progression/auto_capture_filter_model.gd");
const protocolVersion = Number(protocolText.match(/const PROTOCOL_VERSION = (\d+)/)?.[1] || 0);
const minimumProtocolVersion = Number(protocolText.match(/const MIN_CLIENT_PROTOCOL_VERSION = (\d+)/)?.[1] || 0);
const maximumProtocolVersion = Number(protocolText.match(/const MAX_CLIENT_PROTOCOL_VERSION = (\d+)/)?.[1] || 0);
const clientProtocolVersion = Number(serverAuthClientText.match(/const CLIENT_PROTOCOL_VERSION := (\d+)/)?.[1] || 0);
const serverAuthority = {
  loadsPetTemplates: authServiceText.includes("pet_templates.json"),
  loadsSpeciesGrowthProfiles: authServiceText.includes("loadPetGrowthCatalog")
    && growthCatalogText.includes("pet_growth_species_profiles.json"),
  observedGrowthScreeningContract: observedGrowthScreeningText.includes("MINIMUM_SCREENING_LEVEL = 20")
    && observedGrowthScreeningText.includes("growthRuleEligible")
    && observedGrowthScreeningText.includes("retainPet: true")
    && observedGrowthScreeningText.includes("powerGrowthPercentilesByLevel"),
  observedGrowthRulePreviewContract: observedGrowthRulePreviewText.includes("MAX_PREVIEW_PETS = 25")
    && observedGrowthRulePreviewText.includes("mutationPerformed: false")
    && observedGrowthRulePreviewText.includes("retainPet: true")
    && observedGrowthRulePreviewText.includes("strictPlayerGrowthRulePolicy")
    && authServiceText.includes("createPetObservedGrowthRulePreview")
    && clientGrowthRulePreviewText.includes('"mutationCount": 0')
    && clientGrowthRulePreviewText.includes("PetGrowthScreeningModel.evaluate_pet"),
  loadsPassiveCatalog: authServiceText.includes("loadBattlePassiveCatalog")
    && battlePassiveCatalogText.includes("battle_passive_skills.json"),
  acceptsClientEncounterZonePayload: authServiceText.includes("payload.encounterZone"),
  petEncounterAuthorityWired: authServiceText.includes("createPetEncounterAuthority")
    && authServiceText.includes("petEncounterAuthority.resolve")
    && petEncounterAuthorityText.includes("server_pet_encounter_v1")
    && petEncounterAuthorityText.includes("zoneContainsCell")
    && petEncounterAuthorityText.includes("positionNearInteraction"),
  clientEncounterIntentOnly: serverAuthClientText.includes('"encounterIntent": intent')
    && !serverAuthClientText.includes('"encounterZone": encounter_zone')
    && !serverAuthClientText.includes('"enemyCount": enemy_count'),
  petExpDispatcherWired: authServiceText.includes("createPetExpSettlement")
    && authServiceText.includes("petExpSettlement.settle")
    && petExpSettlementText.includes("settlePetGrowthToLevel"),
  petExpAuthorityV1Enabled: authServiceText.includes("enableAuthorityV1: true"),
  newLevelOneFactoryWired: authServiceText.includes("createNewPetFactory")
    && newPetFactoryText.includes("resolveNewPetProfile")
    && newPetFactoryText.includes("initializePetGrowth"),
  petCaptureCandidatesWired: authServiceText.includes("createPetCaptureCandidateAuthority")
    && authServiceText.includes("petCaptureCandidateAuthority.captureRoll")
    && authServiceText.includes("petCaptureCandidateAuthority.materialize")
    && petCaptureCandidateAuthorityText.includes("captureCandidatesByActorId")
    && petCaptureCandidateAuthorityText.includes("createHmac")
    && petCaptureCandidateAuthorityText.includes("settlePetGrowthToLevel"),
  wildCaptureGrowthLevelBiasWired: growthCatalogText.includes("wildCaptureGrowthPolicy")
    && wildCaptureGrowthSelectionText.includes("selectWildCaptureGrowthDraw")
    && wildCaptureGrowthSelectionText.includes("jackpotAcceptanceFloor")
    && petCaptureCandidateAuthorityText.includes("selectWildCaptureGrowthDraw"),
  levelOnePercentileFilterWired: authServiceText.includes("resolveGrowthProfile")
    && autoCaptureSettingsText.includes("FILTER_POLICY_SCHEMA_VERSION = 2")
    && autoCaptureSettingsText.includes("levelOneMinimumPercentiles")
    && petAutoCaptureFilterText.includes("levelOnePercentiles")
    && petAutoCaptureFilterText.includes("captured_level_not_one")
    && petAutoCaptureFilterText.includes("retainPet: true")
    && petLevelOnePercentileText.includes("distributionCdf")
    && petLevelOnePercentileText.includes("initialOutputSpread")
    && !petLevelOnePercentileText.includes("growthOutputSpread")
    && clientAutoCaptureFilterText.includes("const SCHEMA_VERSION := 2")
    && clientAutoCaptureFilterText.includes("levelOneMinimumPercentiles"),
  captureActorCandidateFactsUnified: petCaptureCandidateAuthorityText.includes("synchronizeActorWithCandidate")
    && petCaptureCandidateAuthorityText.includes("battle actor intrinsic pet facts do not match its frozen capture candidate")
    && petCaptureCandidateAuthorityText.includes("actor.maxHp !== pet.maxHp")
    && petCaptureCandidateAuthorityText.includes("actor.speed !== pet.quick"),
  petRebirthGrowthCycleWired: authServiceText.includes("createPetRebirthGrowthCycle")
    && authServiceText.includes("petRebirthGrowthCycle.preflight")
    && authServiceText.includes("petRebirthGrowthCycle.restart")
    && petRebirthGrowthCycleText.includes("restartPetGrowthCycle"),
  publicProfileBoundaryWired: authServiceText.includes("projectPublicServiceResult")
    && authServiceText.includes("publicProfile(result.profile)")
    && profileVisibilityText.includes("function publicProfile"),
  publicGrowthProtocolBoundary: protocolVersion >= 2
    && minimumProtocolVersion === protocolVersion
    && maximumProtocolVersion === protocolVersion
    && clientProtocolVersion === protocolVersion,
  clientServerPetNoReroll: playerProgressText.includes("_normalize_server_authoritative_pet_instance")
    && playerProgressText.includes("has_server_authority_marker"),
  paidResetCatalogWired: authServiceText.includes("createPetPaidResetPolicyCatalog")
    && petPaidResetPolicyCatalogText.includes("pet_paid_reset_policy.json")
    && paidResetPolicyCatalog !== null,
  paidResetGmConfigWired: authServiceText.includes("createGmPetPaidResetConfigDomain")
    && gmPetPaidResetConfigText.includes("gm_pet_paid_reset_config")
    && gmPetPaidResetConfigText.includes("buildUpdatedPetPaidResetConfig")
    && petPaidResetPolicyCatalogText.includes("expectedRevision"),
};
if (!serverAuthority.loadsSpeciesGrowthProfiles) issues.warnings.push("Node 当前未加载 pet_growth_species_profiles.json；物种成长尚非完整服务端事实");
if (!serverAuthority.observedGrowthScreeningContract) issues.warnings.push("Node 尚未建立 Lv20 公开成长证据筛选合同；不能为新宠开放按成长自动处理");
if (!serverAuthority.observedGrowthRulePreviewContract) issues.warnings.push("Lv20 成长保留门槛尚未形成服务端确认、客户端解释且零变更的预览合同；不得开放自动处置");
if (!serverAuthority.loadsPassiveCatalog) issues.warnings.push("Node 当前未加载 battle_passive_skills.json；不能把被动目录存在当成服务端已执行");
if (!serverAuthority.petEncounterAuthorityWired) issues.warnings.push("Node 尚未接入服务端地图遇敌目录、位置校验与权威抽取");
if (serverAuthority.acceptsClientEncounterZonePayload && !serverAuthority.petEncounterAuthorityWired) issues.warnings.push("Node 当前接收客户端 encounterZone 的宠物事实；正式遇敌/捕捉前必须删除信任");
if (!serverAuthority.clientEncounterIntentOnly) issues.warnings.push("Godot 联网遇敌请求仍携带本地抽取的宠物、数量或战斗数值，而不是纯 zone/interaction 意图");
if (!serverAuthority.petExpDispatcherWired) issues.warnings.push("Node 宠物经验入口尚未统一接入成长 dispatcher");
if (serverAuthority.petExpDispatcherWired && !serverAuthority.petExpAuthorityV1Enabled) {
  issues.warnings.push("Node 宠物经验 dispatcher 已接线但 authority-v1 仍安全关闭；需等待公开投影、客户端不重滚与协议边界原子切换");
}
if (!serverAuthority.newLevelOneFactoryWired) issues.warnings.push("Node 新 Lv1 宠物尚未统一经过严格成长 factory");
if (!serverAuthority.petCaptureCandidatesWired) issues.warnings.push("Node 野外捕捉尚未冻结遇敌候选、使用私有随机数并原样转移");
if (!serverAuthority.wildCaptureGrowthLevelBiasWired) issues.warnings.push("Node 尚未按捕捉等级压低隐藏成长上尾，Lv1 捕宠价值没有全宠物服务端合同");
if (!serverAuthority.levelOnePercentileFilterWired) issues.warnings.push("Lv1 捕后筛选尚未统一为全物种公开分位，或仍可能读取隐藏成长/误筛 Lv2+");
if (!serverAuthority.captureActorCandidateFactsUnified) issues.warnings.push("可捕捉野怪的战斗固有属性尚未与冻结宠物个体统一，捕前捕后可能不一致");
if (!serverAuthority.petRebirthGrowthCycleWired) issues.warnings.push("Node authority-v1 宠物转生尚未接入严格成长周期重启与材料预检");
if (!serverAuthority.publicProfileBoundaryWired) issues.warnings.push("Node 完整档案响应尚未统一经过公开宠物投影");
if (!serverAuthority.publicGrowthProtocolBoundary) issues.warnings.push("宠物公开成长契约要求客户端与服务端锁定在同一份 v2+ 协议边界");
if (!serverAuthority.clientServerPetNoReroll) issues.warnings.push("Godot 联网宠物仍缺少明确的无重掷 normalize 路径");
if (!serverAuthority.paidResetCatalogWired) issues.errors.push("全形态付费重置价格目录尚未严格接入服务端");
if (!serverAuthority.paidResetGmConfigWired) issues.errors.push("付费重置价格目录尚未接入带 revision 的 GM 配置域");

function resolvedForm(formId) {
  const form = formById.get(formId);
  if (!form) return null;
  const line = lineById.get(String(form.lineId || "")) || null;
  const subtype = subtypeById.get(String(form.subtypeId || "")) || null;
  const activeSkillIds = subtype && Array.isArray(subtype.activeSkillIds) ? subtype.activeSkillIds.map(String) : [];
  const passiveSkillId = line ? String(line.passiveSkillId || "") : "";
  const paidResetQuote = paidResetPolicyCatalog
    ? resolvePetPaidResetQuote(paidResetPolicyCatalog, {}, formId)
    : null;
  return {
    form,
    line,
    subtype,
    activeSkills: activeSkillIds.map((id) => ({
      id,
      action: actionById.get(id) || null,
      trainable: trainedSkillIds.has(id) || trainerSkillIds.has(id),
    })),
    passive: passiveById.get(passiveSkillId) || null,
    growthProfile: compactGrowthProfile(growthById.get(String(form.growthSpeciesProfileId || ""))),
    placements: placementsByFormId.get(formId) || [],
    captureChance: captureChanceTable(form, captureFormula, captureTools),
    paidResetPolicy: paidResetQuote && paidResetQuote.ok ? paidResetQuote.quote : null,
    serverAuthority,
  };
}

const summary = {
  repoRoot,
  counts: {
    lines: lines.length,
    subtypes: subtypes.length,
    forms: forms.length,
    catchableForms: forms.filter((form) => !(form.capture && form.capture.catchable === false)).length,
    speciesGrowthProfiles: growthProfiles.length,
    formsWithSpeciesGrowth: forms.filter((form) => String(form.growthSpeciesProfileId || "").trim()).length,
    petActiveSkills: petActions.length,
    passiveSkills: passives.length,
    explicitEncounterPlacements: [...placementsByFormId.values()].reduce((sum, values) => sum + values.length, 0),
    encounterGroups: encounterGroupIds.size,
    mapDocuments: mapDocuments.length,
    paidResetFormPolicies: paidResetPolicyCatalog ? paidResetPolicyCatalog.formPolicies.length : 0,
    paidResetPriceTiers: paidResetPolicyCatalog ? paidResetPolicyCatalog.priceTiers.length : 0,
  },
  petSkillSlotContract: {
    maxInstanceSlots: Math.trunc(number(actionDocument.maxPetSkillSlots, 7)),
    preferredSlotHints: Object.fromEntries(Array.from({length: 7}, (_, index) => {
      const slot = index + 1;
      return [slot, petActions.filter((action) => Math.trunc(number(action.preferredSlot ?? action.slot)) === slot).map((action) => action.id)];
    })),
    catalogCanExceedInstanceSlots: actionDocument.schemaVersion >= 2,
    note: "schema v2 的 preferredSlot 只是可重复装配提示；目录可扩展，单个实例的 petSkillSlots 仍固定七格。",
  },
  formalLv14VContract: {
    present: [...forms, ...growthProfiles].some((entry) => Object.keys(entry || {}).some((key) => /(^|_)4v$|four.?v|lv1.?4v/i.test(key))),
    note: "未检测到时，当前以 growthSpeciesLevel1Stats/initialStats 的 Lv1 血攻防敏代用；不要擅自声称已有独立 4V 公式。",
  },
  wildCaptureGrowthPolicy: wildCaptureGrowthPolicy || null,
  serverAuthority,
  issues,
};

if (requestedFormId) {
  const detail = resolvedForm(requestedFormId);
  if (!detail) {
    console.error(`未找到 formId: ${requestedFormId}`);
    process.exit(2);
  }
  const result = {summary, detail};
  if (jsonOutput) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`宠物: ${detail.form.formName} (${requestedFormId})`);
    console.log(`种系/亚种: ${detail.line?.lineName || "?"} / ${detail.subtype?.subtypeName || "?"}`);
    console.log(`元素: ${JSON.stringify(detail.form.elements || {})}`);
    console.log(`主动: ${detail.activeSkills.map((entry) => entry.id).join(", ")}`);
    console.log(`被动: ${detail.passive?.id || "缺失"}`);
    console.log(`成长档: ${detail.growthProfile?.profileId || "未接入"}`);
    if (detail.growthProfile) {
      console.log(`  Lv1基础(当前4V代理): ${JSON.stringify(detail.growthProfile.outputBase || {})}`);
      console.log(`  Lv1浮动: ${JSON.stringify(detail.growthProfile.individualRules?.initialOutputSpread || {})}`);
      console.log(`  每级基础成长: ${JSON.stringify(detail.growthProfile.outputGrowth || {})}`);
      console.log(`  隐藏成长浮动: ${JSON.stringify(detail.growthProfile.individualRules?.growthOutputSpread || {})}`);
      console.log(`  目标审计: ${JSON.stringify(detail.growthProfile.targetAudit || {})}`);
      console.log(`  观察阈值: samples=${detail.growthProfile.growthObservation?.sampleCount || 0}, levels=${detail.growthProfile.growthObservation?.configuredLevels || 0}`);
    }
    console.log(`显式遇敌位置: ${detail.placements.length}`);
    for (const placement of detail.placements) {
      const weightText = placement.source === "fixedWildPets" ? "fixed" : `${placement.weight}/${placement.poolWeightTotal}`;
      const checkText = placement.expectedMovementChecksMin == null
        ? "不可出现Lv1"
        : `约${placement.expectedMovementChecksMin}-${placement.expectedMovementChecksMax}次移动检查/Lv1`;
      console.log(`  - ${placement.mapName}/${placement.encounterZoneName}: source=${placement.source}, weight=${weightText}, Lv${placement.levelMin}-${placement.levelMax}, 单敌Lv1率=${(placement.lv1PerEnemyRate * 100).toFixed(3)}%, ${checkText}`);
    }
    console.log("捕捉率(无状态):");
    for (const [toolId, chances] of Object.entries(detail.captureChance)) {
      console.log(`  - ${toolId}: 满血 ${(chances.fullHp.chance * 100).toFixed(1)}% (~${chances.fullHp.expectedAttempts}次), 半血 ${(chances.halfHp.chance * 100).toFixed(1)}% (~${chances.halfHp.expectedAttempts}次), 残血 ${(chances.nearZeroHp.chance * 100).toFixed(1)}% (~${chances.nearZeroHp.expectedAttempts}次)`);
    }
    if (detail.paidResetPolicy) {
      console.log(`付费重置: tier=${detail.paidResetPolicy.priceTierId}, ${detail.paidResetPolicy.amount} ${detail.paidResetPolicy.currencyId}, wallet=${detail.paidResetPolicy.walletPolicy.walletPolicyId}`);
    }
    console.log(`服务端: growthProfiles=${serverAuthority.loadsSpeciesGrowthProfiles}, growthPreview=${serverAuthority.observedGrowthRulePreviewContract}, petExpDispatcher=${serverAuthority.petExpDispatcherWired}, petExpV1=${serverAuthority.petExpAuthorityV1Enabled}, captureCandidates=${serverAuthority.petCaptureCandidatesWired}, levelBias=${serverAuthority.wildCaptureGrowthLevelBiasWired}, lv1Percentiles=${serverAuthority.levelOnePercentileFilterWired}, actorSamePet=${serverAuthority.captureActorCandidateFactsUnified}, passives=${serverAuthority.loadsPassiveCatalog}, clientEncounterPayload=${serverAuthority.acceptsClientEncounterZonePayload}`);
  }
} else if (jsonOutput) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log("Beastbound pet catalog audit");
  console.log(JSON.stringify(summary.counts));
  console.log(`独立4V字段/公式: ${summary.formalLv14VContract.present ? "有" : "无（authority-v1 初始四维为正式代理）"}`);
  console.log(`服务端成长档/成长预览/EXP/v1/新宠factory/捕捉候选/等级分布/Lv1分位/战宠同体/转生周期/公开档/协议v2+/客户端不重掷/被动目录/重置价格/GM价格: ${serverAuthority.loadsSpeciesGrowthProfiles}/${serverAuthority.observedGrowthRulePreviewContract}/${serverAuthority.petExpDispatcherWired}/${serverAuthority.petExpAuthorityV1Enabled}/${serverAuthority.newLevelOneFactoryWired}/${serverAuthority.petCaptureCandidatesWired}/${serverAuthority.wildCaptureGrowthLevelBiasWired}/${serverAuthority.levelOnePercentileFilterWired}/${serverAuthority.captureActorCandidateFactsUnified}/${serverAuthority.petRebirthGrowthCycleWired}/${serverAuthority.publicProfileBoundaryWired}/${serverAuthority.publicGrowthProtocolBoundary}/${serverAuthority.clientServerPetNoReroll}/${serverAuthority.loadsPassiveCatalog}/${serverAuthority.paidResetCatalogWired}/${serverAuthority.paidResetGmConfigWired}`);
  console.log(`errors=${issues.errors.length} warnings=${issues.warnings.length}`);
  for (const error of issues.errors) console.log(`ERROR ${error}`);
  for (const warning of issues.warnings) console.log(`WARN  ${warning}`);
}

if (checkMode && issues.errors.length > 0) process.exitCode = 1;
