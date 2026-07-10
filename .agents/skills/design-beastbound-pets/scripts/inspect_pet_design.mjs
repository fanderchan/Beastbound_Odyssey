#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../../..");
const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const checkMode = args.includes("--check");
const formArgIndex = args.indexOf("--form");
const requestedFormId = formArgIndex >= 0 ? String(args[formArgIndex + 1] || "").trim() : "";

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

const petActions = actions.filter((action) => String(action.owner || "") === "pet_skill");
const petActionSlots = new Map();
for (const action of petActions) {
  const slot = Math.trunc(number(action.slot));
  if (slot < 1 || slot > 7) {
    issues.errors.push(`宠物技能 ${action.id} 的 slot 必须在 1..7`);
    continue;
  }
  if (petActionSlots.has(slot) && petActionSlots.get(slot) !== action.id) {
    issues.errors.push(`当前目录要求宠物技能默认槽全局唯一，技${slot} 同时被 ${petActionSlots.get(slot)} 与 ${action.id} 使用`);
  } else {
    petActionSlots.set(slot, action.id);
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
const petExpSettlementText = readText("server/node/src/auth/pet-exp-settlement.js");
const serverAuthority = {
  loadsPetTemplates: authServiceText.includes("pet_templates.json"),
  loadsSpeciesGrowthProfiles: authServiceText.includes("loadPetGrowthCatalog")
    && growthCatalogText.includes("pet_growth_species_profiles.json"),
  loadsPassiveCatalog: authServiceText.includes("battle_passive_skills.json"),
  acceptsClientEncounterZonePayload: authServiceText.includes("payload.encounterZone"),
  petExpDispatcherWired: authServiceText.includes("createPetExpSettlement")
    && authServiceText.includes("petExpSettlement.settle")
    && petExpSettlementText.includes("settlePetGrowthToLevel"),
  petExpAuthorityV1Enabled: authServiceText.includes("enableAuthorityV1: true"),
};
if (!serverAuthority.loadsSpeciesGrowthProfiles) issues.warnings.push("Node 当前未加载 pet_growth_species_profiles.json；物种成长尚非完整服务端事实");
if (!serverAuthority.loadsPassiveCatalog) issues.warnings.push("Node 当前未加载 battle_passive_skills.json；不能把被动目录存在当成服务端已执行");
if (serverAuthority.acceptsClientEncounterZonePayload) issues.warnings.push("Node 当前接收客户端 encounterZone；正式遇敌/捕捉前必须补服务端目录校验与权威抽取");
if (!serverAuthority.petExpDispatcherWired) issues.warnings.push("Node 宠物经验入口尚未统一接入成长 dispatcher");
if (serverAuthority.petExpDispatcherWired && !serverAuthority.petExpAuthorityV1Enabled) {
  issues.warnings.push("Node 宠物经验 dispatcher 已接线但 authority-v1 仍安全关闭；需等待公开投影、客户端不重滚与协议 v2 原子切换");
}

function resolvedForm(formId) {
  const form = formById.get(formId);
  if (!form) return null;
  const line = lineById.get(String(form.lineId || "")) || null;
  const subtype = subtypeById.get(String(form.subtypeId || "")) || null;
  const activeSkillIds = subtype && Array.isArray(subtype.activeSkillIds) ? subtype.activeSkillIds.map(String) : [];
  const passiveSkillId = line ? String(line.passiveSkillId || "") : "";
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
  },
  petSkillSlotContract: {
    maxInstanceSlots: Math.trunc(number(actionDocument.maxPetSkillSlots, 7)),
    globallyOccupiedPreferredSlots: Object.fromEntries([...petActionSlots.entries()].sort((a, b) => a[0] - b[0])),
    note: "当前目录校验要求不同宠技的默认 slot 全局唯一；扩展技能库前需要解除该限制，实例仍保持七格。",
  },
  formalLv14VContract: {
    present: [...forms, ...growthProfiles].some((entry) => Object.keys(entry || {}).some((key) => /(^|_)4v$|four.?v|lv1.?4v/i.test(key))),
    note: "未检测到时，当前以 growthSpeciesLevel1Stats/initialStats 的 Lv1 血攻防敏代用；不要擅自声称已有独立 4V 公式。",
  },
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
    console.log(`服务端: growthProfiles=${serverAuthority.loadsSpeciesGrowthProfiles}, petExpDispatcher=${serverAuthority.petExpDispatcherWired}, petExpV1=${serverAuthority.petExpAuthorityV1Enabled}, passives=${serverAuthority.loadsPassiveCatalog}, clientEncounterPayload=${serverAuthority.acceptsClientEncounterZonePayload}`);
  }
} else if (jsonOutput) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log("Beastbound pet catalog audit");
  console.log(JSON.stringify(summary.counts));
  console.log(`4V正式契约: ${summary.formalLv14VContract.present ? "有" : "无"}`);
  console.log(`服务端成长档/EXP dispatcher/v1/被动目录: ${serverAuthority.loadsSpeciesGrowthProfiles}/${serverAuthority.petExpDispatcherWired}/${serverAuthority.petExpAuthorityV1Enabled}/${serverAuthority.loadsPassiveCatalog}`);
  console.log(`errors=${issues.errors.length} warnings=${issues.warnings.length}`);
  for (const error of issues.errors) console.log(`ERROR ${error}`);
  for (const warning of issues.warnings) console.log(`WARN  ${warning}`);
}

if (checkMode && issues.errors.length > 0) process.exitCode = 1;
