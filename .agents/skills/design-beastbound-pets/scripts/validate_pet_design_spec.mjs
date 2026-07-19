#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const filename = args.find((arg) => !arg.startsWith("--"));
if (!filename) {
  console.error("用法: node validate_pet_design_spec.mjs <pet-design.json> [--json]");
  process.exit(2);
}

let spec;
try {
  spec = JSON.parse(fs.readFileSync(path.resolve(filename), "utf8"));
} catch (error) {
  console.error(`无法读取设计合同: ${error.message}`);
  process.exit(2);
}

const errors = [];
const warnings = [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value || "").trim();
const finite = (value) => Number.isFinite(Number(value));

function requireObject(value, key) {
  if (!object(value)) {
    errors.push(`${key} 必须是对象`);
    return {};
  }
  return value;
}

function requireText(value, key) {
  if (!text(value)) errors.push(`${key} 不能为空`);
}

function requireStringArray(value, key, minimum = 0) {
  if (!Array.isArray(value)) {
    errors.push(`${key} 必须是数组`);
    return [];
  }
  const normalized = value.map(text).filter(Boolean);
  if (normalized.length < minimum) errors.push(`${key} 至少需要 ${minimum} 项`);
  if (new Set(normalized).size !== normalized.length) errors.push(`${key} 不能包含重复项`);
  return normalized;
}

function validateRange(value, key) {
  if (!Array.isArray(value) || value.length !== 2 || !finite(value[0]) || !finite(value[1])) {
    errors.push(`${key} 必须是两个数字组成的范围`);
    return;
  }
  if (Number(value[0]) > Number(value[1])) errors.push(`${key} 下限不能大于上限`);
}

function validateFourStats(value, key, ranges = false) {
  const record = requireObject(value, key);
  for (const stat of ["maxHp", "attack", "defense", "quick"]) {
    if (ranges) validateRange(record[stat], `${key}.${stat}`);
    else if (!finite(record[stat])) errors.push(`${key}.${stat} 必须是数字`);
  }
}

if (Number(spec.schemaVersion) !== 1) errors.push("schemaVersion 当前必须是 1");
requireText(spec.designId, "designId");
if (text(spec.designId) && !/^[a-z0-9][a-z0-9_-]*$/.test(text(spec.designId))) {
  errors.push("designId 只能使用小写字母、数字、下划线或连字符");
}

const promise = requireObject(spec.playerPromise, "playerPromise");
requireText(promise.fantasy, "playerPromise.fantasy");
const tiers = new Set(["common_wild", "rare_wild", "boss_reward", "floor_reward", "event", "commercial", "rebirth", "evolution", "fusion"]);
if (!tiers.has(text(promise.acquisitionTier))) errors.push("playerPromise.acquisitionTier 不在允许范围");
requireStringArray(promise.roles, "playerPromise.roles", 1);
const strengths = requireStringArray(promise.strengths, "playerPromise.strengths", 1);
requireStringArray(promise.weaknesses, "playerPromise.weaknesses", 1);
requireStringArray(promise.counters, "playerPromise.counters", 1);
if (strengths.length < 2) warnings.push("建议明确两项核心强项，便于定义角色预算");

const taxonomy = requireObject(spec.taxonomy, "taxonomy");
for (const key of ["lineId", "lineName", "subtypeId", "subtypeName", "formId", "formName"]) {
  requireText(taxonomy[key], `taxonomy.${key}`);
}

const elements = requireObject(spec.elements, "elements");
let elementTotal = 0;
for (const key of ["fire", "water", "earth", "wind"]) {
  const value = Number(elements[key]);
  if (!Number.isInteger(value) || value < 0 || value > 10) errors.push(`elements.${key} 必须是 0..10 的整数`);
  else elementTotal += value;
}
if (elementTotal !== 10) errors.push(`elements 四系合计必须为 10，当前为 ${elementTotal}`);

const acquisition = requireObject(spec.acquisition, "acquisition");
const sourceTypes = new Set(["wild", "boss_reward", "floor_reward", "quest", "event", "commercial", "rebirth", "evolution", "fusion"]);
if (!sourceTypes.has(text(acquisition.sourceType))) errors.push("acquisition.sourceType 不在允许范围");
if (typeof acquisition.catchable !== "boolean") errors.push("acquisition.catchable 必须是布尔值");
const captureDifficulty = Number(acquisition.captureDifficulty);
if (acquisition.catchable && (!Number.isInteger(captureDifficulty) || captureDifficulty < 1 || captureDifficulty > 100)) {
  errors.push("acquisition.captureDifficulty 必须是 1..100 的整数");
} else if (!acquisition.catchable && acquisition.captureDifficulty != null) {
  warnings.push("不可捕捉宠物通常应把 captureDifficulty 设为 null，避免误导");
}
const placements = array(acquisition.placements);
if (!Array.isArray(acquisition.placements)) errors.push("acquisition.placements 必须是数组");
if (acquisition.catchable && placements.length === 0) warnings.push("可捕捉宠物没有配置显式世界遇敌位置");
for (const [index, value] of placements.entries()) {
  const placement = requireObject(value, `acquisition.placements[${index}]`);
  for (const key of ["mapId", "encounterZoneId", "encounterGroupId"]) requireText(placement[key], `acquisition.placements[${index}].${key}`);
  if (!finite(placement.weight) || Number(placement.weight) < 0) errors.push(`acquisition.placements[${index}].weight 必须 >= 0`);
  const min = Number(placement.levelMin);
  const max = Number(placement.levelMax);
  if (!Number.isInteger(min) || min < 1 || min > 140) errors.push(`acquisition.placements[${index}].levelMin 必须是 1..140`);
  if (!Number.isInteger(max) || max < min || max > 140) errors.push(`acquisition.placements[${index}].levelMax 必须在 levelMin..140`);
  if (min <= 1 && max >= 1 && !finite(placement.targetLv1PerEnemyRate)) {
    warnings.push(`acquisition.placements[${index}] 包含 Lv1，但未记录目标单敌 Lv1 率`);
  }
}
if (text(promise.acquisitionTier) === "rare_wild" && !placements.some((placement) => Number(placement.levelMin) <= 1)) {
  warnings.push("rare_wild 没有任何包含 Lv1 的遇敌配置");
}

const world = requireObject(spec.worldIntegration, "worldIntegration");
const progressionBand = requireObject(world.progressionBand, "worldIntegration.progressionBand");
const bandMin = Number(progressionBand.levelMin);
const bandMax = Number(progressionBand.levelMax);
if (!Number.isInteger(bandMin) || bandMin < 1 || bandMin > 140) errors.push("worldIntegration.progressionBand.levelMin 必须是 1..140");
if (!Number.isInteger(bandMax) || bandMax < bandMin || bandMax > 140) errors.push("worldIntegration.progressionBand.levelMax 必须在 levelMin..140");
requireText(progressionBand.purpose, "worldIntegration.progressionBand.purpose");
for (const key of ["battleRewardGroupId", "rewardEconomyGroupId", "overflowCapturePolicy"]) requireText(world[key], `worldIntegration.${key}`);
requireStringArray(world.questIds, "worldIntegration.questIds", 0);
if (!["implemented", "blocked", "not_applicable"].includes(text(world.serverEncounterAuthority))) errors.push("worldIntegration.serverEncounterAuthority 不受支持");
if (acquisition.sourceType === "wild" && world.serverEncounterAuthority !== "implemented") warnings.push("野生投放的服务端遇敌权威尚未完成，不能声明可正式发布");

const growth = requireObject(spec.growth, "growth");
requireText(growth.profileId, "growth.profileId");
requireText(growth.familyRole, "growth.familyRole");
requireText(growth.lv1FourVInterpretation, "growth.lv1FourVInterpretation");
validateFourStats(growth.outputBase, "growth.outputBase");
validateFourStats(growth.outputGrowth, "growth.outputGrowth");
validateFourStats(growth.initialOutputSpread, "growth.initialOutputSpread", true);
validateFourStats(growth.growthOutputSpread, "growth.growthOutputSpread", true);
if (!["weighted_center", "uniform", "rare_spike"].includes(text(growth.distribution))) errors.push("growth.distribution 不受支持");
const targetAudit = requireObject(growth.targetAudit, "growth.targetAudit");
for (const key of ["lv140PowerBand", "threeStatGrowthBand", "hpGrowthBand"]) validateRange(targetAudit[key], `growth.targetAudit.${key}`);
if (!text(targetAudit.lv20DecisionIntent)) warnings.push("建议明确 Lv20 时玩家应能判断到什么程度");

const skills = requireObject(spec.skills, "skills");
const activeSkillIds = requireStringArray(skills.activeSkillIds, "skills.activeSkillIds", 2);
if (activeSkillIds.length > 7) errors.push("skills.activeSkillIds 最多 7 个");
for (const required of ["pet_attack", "pet_defend"]) {
  if (!activeSkillIds.includes(required)) errors.push(`skills.activeSkillIds 必须包含 ${required}`);
}
requireText(skills.passiveSkillId, "skills.passiveSkillId");
if (!object(skills.inheritancePolicy)) errors.push("skills.inheritancePolicy 必须是对象");
if (!object(skills.autoBattlePolicy)) errors.push("skills.autoBattlePolicy 必须是对象");
for (const [index, action] of array(skills.newActiveSkills).entries()) {
  if (!object(action)) {
    errors.push(`skills.newActiveSkills[${index}] 必须是对象`);
    continue;
  }
  for (const key of ["id", "purpose", "target", "effect", "counterplay", "serverSupport"]) requireText(action[key], `skills.newActiveSkills[${index}].${key}`);
}
if (object(skills.newPassiveSkill)) {
  for (const key of ["id", "familyFantasy", "trigger", "effect", "counterplay", "serverSupport", "inheritanceConflictGroup"]) {
    requireText(skills.newPassiveSkill[key], `skills.newPassiveSkill.${key}`);
  }
}

const progression = requireObject(spec.progression, "progression");
for (const key of ["rebirth", "evolution", "fusion", "tradePolicy", "commercialPolicy"]) requireText(progression[key], `progression.${key}`);
const paidResetPolicy = requireObject(progression.paidResetPolicy, "progression.paidResetPolicy");
requireText(paidResetPolicy.priceTierId, "progression.paidResetPolicy.priceTierId");
if (text(paidResetPolicy.priceTierId) && !/^[a-z][a-z0-9_]{1,79}$/.test(text(paidResetPolicy.priceTierId))) {
  errors.push("progression.paidResetPolicy.priceTierId 只能使用稳定的小写标识");
}
if (!["bound_first_split", "unbound_only"].includes(text(paidResetPolicy.walletPolicyId))) {
  errors.push("progression.paidResetPolicy.walletPolicyId 不受支持");
}
for (const key of ["fixedPerOperation", "unlimited", "clearBindingOnSuccess"]) {
  if (paidResetPolicy[key] !== true) errors.push(`progression.paidResetPolicy.${key} 必须为 true`);
}
if (paidResetPolicy.refundPolicy !== "technical_transaction_rollback_only") {
  errors.push("progression.paidResetPolicy.refundPolicy 必须为 technical_transaction_rollback_only");
}
const protections = requireStringArray(progression.autoDiscardProtection, "progression.autoDiscardProtection", 0);
if (!protections.length) warnings.push("尚未声明自动丢弃保护条件");
if (text(promise.acquisitionTier) === "commercial" && text(progression.commercialPolicy).length < 12) {
  warnings.push("商业宠需要更明确的保值、重置与非付费对抗说明");
}

const presentation = requireObject(spec.presentation, "presentation");
for (const key of ["codexText", "captureText", "growthVisibility", "futureArtBrief"]) requireText(presentation[key], `presentation.${key}`);
const artStatuses = new Set(["deferred", "planned", "in_production", "owner_review_pending", "approved"]);
const artStatus = text(presentation.artStatus);
if (!artStatuses.has(artStatus)) errors.push("presentation.artStatus 不受支持");
if (artStatus !== "deferred") {
  const art = requireObject(presentation.artProduction, "presentation.artProduction");
  if (art.deliveryScope !== "full_release") errors.push("presentation.artProduction.deliveryScope 必须为 full_release");
  if (art.identityLockRequired !== true) errors.push("presentation.artProduction.identityLockRequired 必须为 true");
  if (art.rideable !== true) errors.push("presentation.artProduction.rideable 必须为 true");
  const subjectSets = requireStringArray(art.worldSubjectSets, "presentation.artProduction.worldSubjectSets", 3);
  for (const subject of ["character", "pet", "mounted_character_pet"]) {
    if (!subjectSets.includes(subject)) errors.push(`presentation.artProduction.worldSubjectSets 必须包含 ${subject}`);
  }
  const expectedDirections = ["south", "southwest", "west", "northwest", "north", "northeast", "east", "southeast"];
  const directions = requireStringArray(art.worldDirections, "presentation.artProduction.worldDirections", 8);
  if (directions.length !== expectedDirections.length || expectedDirections.some((value) => !directions.includes(value))) {
    errors.push("presentation.artProduction.worldDirections 必须使用 Godot 运行时 canonical 名称覆盖真八方向：south/southwest/west/northwest/north/northeast/east/southeast");
  }
  const worldActions = requireStringArray(art.worldActions, "presentation.artProduction.worldActions", 2);
  for (const action of ["idle", "walk"]) {
    if (!worldActions.includes(action)) errors.push(`presentation.artProduction.worldActions 必须包含 ${action}`);
  }
  if (art.runtimeMirroring !== false) errors.push("presentation.artProduction.runtimeMirroring 必须为 false");
  const battleViews = requireStringArray(art.battleViews, "presentation.artProduction.battleViews", 2);
  for (const view of ["front_3quarter_sw", "back_3quarter_ne"]) {
    if (!battleViews.includes(view)) errors.push(`presentation.artProduction.battleViews 必须包含 ${view}`);
  }
  const requiredBattleScenarios = ["idle", "walk", "attack", "skill", "defend", "defend_hit", "hurt", "dodge", "dodge_counter", "counter", "stagger_return", "knockaway", "down", "revive", "combo"];
  const battleScenarios = requireStringArray(art.battleScenarios, "presentation.artProduction.battleScenarios", requiredBattleScenarios.length);
  for (const scenario of requiredBattleScenarios) {
    if (!battleScenarios.includes(scenario)) errors.push(`presentation.artProduction.battleScenarios 必须包含 ${scenario}`);
  }
  const mounted = requireObject(art.mounted, "presentation.artProduction.mounted");
  if (mounted.composition !== "ai_integrated_whole_frame") errors.push("presentation.artProduction.mounted.composition 必须为 ai_integrated_whole_frame");
  if (mounted.runtimeLayeredComposition !== false) errors.push("presentation.artProduction.mounted.runtimeLayeredComposition 必须为 false");
  if (mounted.runtimeMirroring !== false) errors.push("presentation.artProduction.mounted.runtimeMirroring 必须为 false");
  requireStringArray(mounted.supportedCharacterIds, "presentation.artProduction.mounted.supportedCharacterIds", 1);
  const requiredReviewScenes = ["true8_world", "formation_10v10", "attack", "skill_attack", "defend_hit", "hurt_recovery", "dodge", "dodge_counter", "counter", "counter_ko_return_down", "counter_knockaway", "combo", "down_revive"];
  const reviewScenes = requireStringArray(art.reviewScenes, "presentation.artProduction.reviewScenes", requiredReviewScenes.length);
  for (const scene of requiredReviewScenes) {
    if (!reviewScenes.includes(scene)) errors.push(`presentation.artProduction.reviewScenes 必须包含 ${scene}`);
  }
  if (art.ownerReviewRequired !== true) errors.push("presentation.artProduction.ownerReviewRequired 必须为 true");
  const ownerReviewStatus = text(art.ownerReviewStatus);
  if (!["not_started", "pending", "approved", "rejected"].includes(ownerReviewStatus)) {
    errors.push("presentation.artProduction.ownerReviewStatus 不受支持");
  }
  const evidencePaths = requireStringArray(art.evidencePaths, "presentation.artProduction.evidencePaths", 0);
  if (artStatus === "owner_review_pending" && ownerReviewStatus !== "pending") {
    errors.push("artStatus=owner_review_pending 时 ownerReviewStatus 必须为 pending");
  }
  if (artStatus === "approved") {
    if (ownerReviewStatus !== "approved") errors.push("artStatus=approved 时 ownerReviewStatus 必须为 approved");
    if (!evidencePaths.length) errors.push("artStatus=approved 时必须记录截图或录像 evidencePaths");
  } else if (ownerReviewStatus === "approved") {
    errors.push("ownerReviewStatus=approved 时 presentation.artStatus 也必须为 approved");
  }
} else if (object(presentation.artProduction)) {
  warnings.push("artStatus=deferred 时 artProduction 只作未来计划，不代表已进入美术生产");
}

const validation = requireObject(spec.validation, "validation");
const sampleCount = Number(validation.growthSampleCount);
if (!Number.isInteger(sampleCount) || sampleCount < 100) errors.push("validation.growthSampleCount 至少为 100");
else if (sampleCount < 10000) warnings.push("最终物种成长档建议至少使用 10,000 个样本");
requireStringArray(validation.fixedSeedCases, "validation.fixedSeedCases", 1);
requireStringArray(validation.requiredChecks, "validation.requiredChecks", 1);
requireStringArray(validation.serverAuthorityChecks, "validation.serverAuthorityChecks", 1);
requireStringArray(validation.manualAcceptance, "validation.manualAcceptance", 1);

const result = {
  ok: errors.length === 0,
  path: path.resolve(filename),
  designId: text(spec.designId),
  formId: text(taxonomy.formId),
  errors,
  warnings,
};

if (jsonOutput) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`pet design spec: ${result.ok ? "ok" : "failed"} design=${result.designId || "?"} form=${result.formId || "?"}`);
  for (const error of errors) console.log(`ERROR ${error}`);
  for (const warning of warnings) console.log(`WARN  ${warning}`);
}

if (!result.ok) process.exitCode = 1;
