"use strict";

const {isDeepStrictEqual} = require("node:util");

const {
  MODEL_VERSION: PET_GROWTH_MODEL_VERSION,
  STAT_KEYS,
  buildPublicSnapshot,
} = require("./pet-growth-authority");

const PET_EVOLUTION_SCHEMA_VERSION = 1;
const PET_EVOLUTION_HISTORY_MAX_RECORDS = 20;
const PET_EVOLUTION_OPERATION_ID_PATTERN = /^[A-Za-z0-9._:-]{16,160}$/;
const FRESH_TARGET_STRIP_KEYS = Object.freeze([
  "combatPower",
  "combatPowerBreakdown",
  "continuousStats",
  "growthAuthority",
  "growthBonus",
  "growthModelVersion",
  "growthObservation",
  "growthObservationUnavailableReason",
  "growthPrivate",
  "growthRecord",
  "growthSpeciesLevel1Stats",
  "growthSpeciesRoll",
  "growthSpeciesSampleNo",
  "growthSpeciesSeed",
  "growthTierId",
  "growthTierLabel",
  "helperGrowthWeights",
  "individualQualityLabel",
  "individualQualityScore",
  "individualSeed",
  "individualVariance",
  "initialBonus",
  "initialStats",
  "innateGrowthBonus",
  "internalGrowthBonus",
  "lastCultivationResult",
  "petCultivation",
  "petGrowth",
  "petGrowthPrivate",
  "privateRoll",
  "privateSeed",
  "qualityRoll",
  "rebirthBonusInternalPower",
  "rebirthRollSeed",
  "settledContinuousStats",
]);
const OBSERVATION_NUMBER_KEYS = Object.freeze([
  "schemaVersion",
  "level",
  "observedLevels",
  "stage",
  "powerGrowthPerLevel",
  "powerPercentile",
]);
const OBSERVATION_STRING_KEYS = Object.freeze([
  "profileId",
  "stageLabel",
  "overallGrade",
]);
const OBSERVATION_BOOLEAN_KEYS = Object.freeze(["enabled", "hasRecord"]);

function inspectPetEvolutionEligibility(petValue, options = {}) {
  const pet = recordOrNull(petValue);
  const route = recordOrNull(options.route);
  const growthCatalog = options.growthCatalog;
  const growthCycle = options.growthCycle;
  if (
    !pet
    || !route
    || !growthCatalog
    || typeof growthCatalog.requireProfileById !== "function"
    || !growthCycle
    || typeof growthCycle.preflight !== "function"
    || typeof growthCycle.restart !== "function"
  ) {
    return failure("pet_evolution_context_invalid", "宠物进化校验信息不完整，本次操作未执行。");
  }
  const instanceId = stablePetIdentity(pet);
  const formId = stablePetFormId(pet);
  if (instanceId === "" || formId === "" || formId !== String(route.sourceFormId || "")) {
    return failure("pet_evolution_route_mismatch", "这只宠物不属于所选进化路线。");
  }
  if (recordOrNull(pet.petRebirthHelper)) {
    return failure("pet_evolution_helper_ineligible", "转生MM不能进化。");
  }
  if (recordOrNull(pet.evolutionLineage)) {
    return failure("pet_evolution_already_completed", "这只宠物已经完成进化。");
  }
  if (pet.level !== Number(route.eligibility && route.eligibility.requiredLevel)) {
    return failure("pet_evolution_level_required", "进化要求宠物达到一转 Lv140。");
  }
  const cultivation = canonicalStageOneCultivation(pet.petCultivation);
  if (!cultivation.ok) {
    return cultivation;
  }
  if (cultivation.record.rebirthCount !== Number(route.eligibility && route.eligibility.requiredRebirthCount)) {
    return failure("pet_evolution_rebirth_required", "进化要求宠物恰好完成一转。");
  }
  let growthPreflight;
  try {
    growthPreflight = growthCycle.preflight(pet);
  } catch {
    return failure("pet_growth_state_invalid", "宠物成长数据异常，本次进化未执行，材料与石币未消耗。");
  }
  if (
    !growthPreflight
    || growthPreflight.authorityV1 !== true
    || growthPreflight.profileId !== String(route.sourceGrowthProfileId || "")
  ) {
    return failure("pet_evolution_growth_unsupported", "该宠物成长档不能安全进化，请联系GM处理。");
  }
  const growth = recordOrNull(pet.petGrowth);
  const privateState = growth && recordOrNull(growth.private);
  const publicState = growth && recordOrNull(growth.public);
  if (
    !growth
    || growth.modelVersion !== PET_GROWTH_MODEL_VERSION
    || growth.profileId !== route.sourceGrowthProfileId
    || growth.settledLevel !== route.eligibility.requiredLevel
    || !privateState
    || !publicState
    || publicState.growthSpeciesProfileId !== route.sourceGrowthProfileId
    || publicState.level !== route.eligibility.requiredLevel
    || !validVisibleStatMap(publicState.levelOneFourV)
    || !validVisibleStatMap(publicState.stats)
  ) {
    return failure("pet_growth_state_invalid", "宠物成长数据异常，本次进化未执行，材料与石币未消耗。");
  }
  const intrinsicCombatPower = petIntrinsicCombatPower(publicState.stats);
  const minimumIntrinsicCombatPower = positiveInteger(route.eligibility.minimumIntrinsicCombatPower);
  if (minimumIntrinsicCombatPower < 1) {
    return failure("pet_evolution_route_invalid", "进化路线战力门槛异常，本次操作未执行。");
  }
  if (intrinsicCombatPower < minimumIntrinsicCombatPower) {
    return failure(
      "pet_evolution_power_below_p90",
      `该宠一转 Lv140 成长战力为 ${intrinsicCombatPower}，进化门槛为 ${minimumIntrinsicCombatPower}。`,
      {intrinsicCombatPower, minimumIntrinsicCombatPower},
    );
  }

  let sourceProfile;
  let stageZeroPublic;
  try {
    sourceProfile = growthCatalog.requireProfileById(route.sourceGrowthProfileId);
    const privateCultivation = recordOrNull(privateState.cultivation);
    stageZeroPublic = buildPublicSnapshot(
      sourceProfile,
      privateState.privateSeed,
      route.eligibility.requiredLevel,
      privateState.privateRoll,
      {
        schemaVersion: 1,
        initialBonus: cloneStatMap(privateCultivation && privateCultivation.initialBonus),
        growthBonus: zeroStatMap(),
      },
    );
  } catch {
    return failure("pet_growth_state_invalid", "宠物成长数据异常，本次进化未执行，材料与石币未消耗。");
  }
  const sourceFormName = String(pet.formName || pet.name || route.sourceFormId || "进化源宠");
  const stageSnapshots = [
    publicStageSnapshot({
      stage: 0,
      formId,
      formName: sourceFormName,
      publicState: stageZeroPublic,
      observation: {},
    }),
    publicStageSnapshot({
      stage: 1,
      formId,
      formName: sourceFormName,
      publicState,
      observation: pet.growthObservation,
    }),
  ];
  if (!stageSnapshots.every(validPublicStageSnapshot)) {
    return failure("pet_evolution_history_invalid", "进化前成长履历无法安全保存，本次操作未执行。");
  }
  return {
    ok: true,
    pet,
    instanceId,
    formId,
    cultivation: cultivation.record,
    intrinsicCombatPower,
    minimumIntrinsicCombatPower,
    stageSnapshots,
  };
}

function applyPetEvolution(petValue, options = {}) {
  const operationId = String(options.operationId || "").trim();
  const recordedAt = canonicalIsoTimestamp(options.recordedAt);
  const route = recordOrNull(options.route);
  const targetTemplate = recordOrNull(options.targetTemplate);
  const newPetFactory = options.newPetFactory;
  const growthCycle = options.growthCycle;
  const expToNextLevel = options.expToNextLevel;
  if (
    !PET_EVOLUTION_OPERATION_ID_PATTERN.test(operationId)
    || recordedAt === ""
    || !route
    || !targetTemplate
    || !newPetFactory
    || typeof newPetFactory.finalizeLevelOne !== "function"
    || !growthCycle
    || typeof growthCycle.restart !== "function"
    || typeof expToNextLevel !== "function"
  ) {
    return failure("pet_evolution_context_invalid", "宠物进化校验信息不完整，本次操作未执行。");
  }
  const inspected = inspectPetEvolutionEligibility(petValue, options);
  if (!inspected.ok) {
    return inspected;
  }
  if (
    String(targetTemplate.formId || "") !== String(route.targetFormId || "")
    || String(targetTemplate.growthSpeciesProfileId || "") !== String(route.targetGrowthProfileId || "")
  ) {
    return failure("pet_evolution_target_invalid", "进化目标形态配置异常，本次操作未执行。");
  }

  let freshTarget;
  try {
    const candidate = freshTargetCandidate(inspected.pet, route, targetTemplate);
    freshTarget = newPetFactory.finalizeLevelOne(candidate, {purpose: "pet_evolution"}).pet;
  } catch {
    return failure("pet_evolution_target_invalid", "进化目标成长生成失败，本次操作未执行。");
  }
  const nowSec = Math.max(0, Math.trunc(Date.parse(recordedAt) / 1000));
  const event = evolutionCultivationEvent(inspected, route, targetTemplate, nowSec);
  const nextCultivation = nextEvolutionCultivation(inspected.cultivation, event);
  let restarted;
  try {
    restarted = growthCycle.restart(freshTarget, nextCultivation);
  } catch {
    return failure("pet_growth_state_invalid", "进化目标成长数据异常，本次操作未执行，材料与石币未消耗。");
  }
  if (!restarted || restarted.restarted !== true || !recordOrNull(restarted.pet)) {
    return failure("pet_evolution_growth_unsupported", "进化目标无法安全启动成长周期，本次操作未执行。");
  }
  const nextPet = structuredClone(restarted.pet);
  nextPet.petCultivation = structuredClone(nextCultivation);
  nextPet.lastCultivationResult = structuredClone(event);
  nextPet.evolutionLineage = {
    schemaVersion: PET_EVOLUTION_SCHEMA_VERSION,
    mode: "evolution",
    routeId: String(route.routeId || ""),
    sourceFormId: inspected.formId,
    sourceFormName: String(inspected.pet.formName || inspected.pet.name || inspected.formId),
    targetFormId: String(route.targetFormId || ""),
    targetFormName: String(targetTemplate.formName || route.presentation && route.presentation.name || route.targetFormId),
    completedAtSec: nowSec,
    terminalStage: 2,
    stageSnapshots: structuredClone(inspected.stageSnapshots),
  };
  nextPet.exp = 0;
  const nextExp = Number(expToNextLevel(1));
  if (!Number.isSafeInteger(nextExp) || nextExp < 1) {
    return failure("pet_evolution_context_invalid", "宠物等级经验配置异常，本次操作未执行。");
  }
  nextPet.nextExp = nextExp;
  nextPet.hp = nextPet.maxHp;
  delete nextPet.growthObservation;
  delete nextPet.growthObservationUnavailableReason;

  if (!validEvolutionLineage(nextPet.evolutionLineage)) {
    return failure("pet_evolution_history_invalid", "进化前成长履历写入失败，本次操作未执行。");
  }
  if (
    stablePetIdentity(nextPet) !== inspected.instanceId
    || stablePetFormId(nextPet) !== route.targetFormId
    || nextPet.level !== 1
    || nextPet.petCultivation.rebirthCount !== route.result.rebirthCount
    || nextPet.petGrowth.private.privateSeed === inspected.pet.petGrowth.private.privateSeed
    || isDeepStrictEqual(nextPet.petGrowth.private.privateRoll, inspected.pet.petGrowth.private.privateRoll)
  ) {
    return failure("pet_evolution_result_invalid", "进化结果校验失败，本次操作未执行。");
  }
  return {
    ok: true,
    pet: nextPet,
    publicResult: {
      schemaVersion: PET_EVOLUTION_SCHEMA_VERSION,
      routeId: String(route.routeId || ""),
      instanceId: inspected.instanceId,
      sourceFormId: inspected.formId,
      sourceFormName: String(inspected.pet.formName || inspected.pet.name || inspected.formId),
      targetFormId: String(route.targetFormId || ""),
      targetFormName: String(targetTemplate.formName || route.presentation && route.presentation.name || route.targetFormId),
      beforeLevel: Number(route.eligibility.requiredLevel),
      afterLevel: 1,
      rebirthCount: Number(route.result.rebirthCount),
      intrinsicCombatPower: inspected.intrinsicCombatPower,
      minimumIntrinsicCombatPower: inspected.minimumIntrinsicCombatPower,
      historyStages: [0, 1],
      message: `${String(inspected.pet.name || inspected.pet.formName || "宠物")} 已进化为${String(targetTemplate.formName || "新形态")}；二代4V与天生成长已重新生成，0转和1转履历已保留。`,
    },
  };
}

function freshTargetCandidate(pet, route, targetTemplate) {
  const candidate = structuredClone(pet);
  for (const key of FRESH_TARGET_STRIP_KEYS) {
    delete candidate[key];
  }
  delete candidate.evolutionLineage;
  const formId = String(route.targetFormId || "");
  candidate.formId = formId;
  candidate.templateId = formId;
  candidate.speciesId = formId;
  candidate.lineId = String(targetTemplate.lineId || route.lineId || "");
  candidate.lineName = String(targetTemplate.lineName || candidate.lineName || "");
  candidate.subtypeId = String(targetTemplate.subtypeId || "");
  candidate.subtypeName = String(targetTemplate.subtypeName || "");
  candidate.formName = String(targetTemplate.formName || route.presentation && route.presentation.name || formId);
  candidate.growthProfileId = String(targetTemplate.growthProfileId || "");
  candidate.growthSpeciesProfileId = String(route.targetGrowthProfileId || "");
  candidate.elements = structuredClone(recordOrNull(targetTemplate.elements) || {});
  candidate.level = 1;
  candidate.exp = 0;
  candidate.nextExp = 1;
  const baseStats = recordOrNull(targetTemplate.baseStats) || {};
  candidate.maxHp = positiveInteger(baseStats.maxHp) || 1;
  candidate.attack = positiveInteger(baseStats.attack) || 1;
  candidate.defense = positiveInteger(baseStats.defense) || 1;
  candidate.quick = positiveInteger(baseStats.quick ?? baseStats.agility) || 1;
  candidate.hp = candidate.maxHp;

  const sourceActive = uniqueStrings(pet.activeSkillIds);
  const learned = uniqueStrings(pet.learnedSkillIds);
  const inherited = uniqueStrings(pet.inheritedSkillIds);
  candidate.learnedSkillIds = learned;
  candidate.inheritedSkillIds = inherited;
  candidate.activeSkillIds = uniqueStrings([
    ...uniqueStrings(route.skills && route.skills.defaultActionIds),
    ...learned,
    ...inherited,
    ...sourceActive,
  ]).slice(0, 7);
  candidate.petSkillSlots = mergedSkillSlots(candidate.activeSkillIds, pet.petSkillSlots);
  candidate.passiveSkillIds = uniqueStrings([
    route.skills && route.skills.passiveSkillId,
    ...uniqueStrings(targetTemplate.passiveSkillIds),
    ...uniqueStrings(pet.passiveSkillIds),
  ]);
  return candidate;
}

function mergedSkillSlots(activeSkillIds, previousSlots) {
  const active = new Set(activeSkillIds);
  const slots = [];
  for (const value of Array.isArray(previousSlots) ? previousSlots : []) {
    const skillId = String(value || "").trim();
    if (skillId !== "" && active.has(skillId) && !slots.includes(skillId)) {
      slots.push(skillId);
    }
  }
  for (const skillId of activeSkillIds) {
    if (!slots.includes(skillId)) slots.push(skillId);
  }
  while (slots.length < 7) slots.push("");
  return slots.slice(0, 7);
}

function nextEvolutionCultivation(current, event) {
  const history = current.history.map((entry) => structuredClone(entry));
  history.push(structuredClone(event));
  while (history.length > PET_EVOLUTION_HISTORY_MAX_RECORDS) history.shift();
  return {
    schemaVersion: 1,
    rebirthCount: 1,
    enhanceLevel: current.enhanceLevel,
    rebirthGrowthBonus: cloneStatMap(current.rebirthGrowthBonus),
    history,
    lastPreview: {},
    lastResult: structuredClone(event),
  };
}

function evolutionCultivationEvent(inspected, route, targetTemplate, nowSec) {
  const sourceName = String(inspected.pet.name || inspected.pet.formName || "宠物");
  const targetName = String(targetTemplate.formName || route.presentation && route.presentation.name || "进化形态");
  return {
    schemaVersion: 1,
    mode: "evolution",
    timestamp: nowSec,
    petInstanceId: inspected.instanceId,
    petName: sourceName,
    formId: String(route.targetFormId || ""),
    beforeLevel: Number(route.eligibility.requiredLevel),
    afterLevel: 1,
    beforeRebirthCount: 1,
    afterRebirthCount: 1,
    beforeEnhanceLevel: inspected.cultivation.enhanceLevel,
    afterEnhanceLevel: inspected.cultivation.enhanceLevel,
    amount: inspected.intrinsicCombatPower,
    summary: `${String(route.sourceFormId || "源形态")} -> ${String(route.targetFormId || "进化形态")}，Lv140 -> Lv1`,
    message: `${sourceName} 已进化为${targetName}。`,
  };
}

function publicStageSnapshot({stage, formId, formName, publicState, observation}) {
  return {
    schemaVersion: PET_EVOLUTION_SCHEMA_VERSION,
    stage,
    formId: String(formId || ""),
    formName: String(formName || ""),
    growthSpeciesProfileId: String(publicState && publicState.growthSpeciesProfileId || ""),
    level: positiveInteger(publicState && publicState.level),
    levelOneFourV: cloneStatMap(publicState && publicState.levelOneFourV),
    stats: cloneStatMap(publicState && publicState.stats),
    intrinsicCombatPower: petIntrinsicCombatPower(publicState && publicState.stats),
    growthObservation: publicObservation(observation),
  };
}

function publicObservation(value) {
  const source = recordOrNull(value);
  if (!source) return {};
  const result = {};
  for (const key of OBSERVATION_NUMBER_KEYS) {
    if (Number.isFinite(source[key])) result[key] = Number(source[key]);
  }
  for (const key of OBSERVATION_STRING_KEYS) {
    if (typeof source[key] === "string") result[key] = source[key];
  }
  for (const key of OBSERVATION_BOOLEAN_KEYS) {
    if (typeof source[key] === "boolean") result[key] = source[key];
  }
  for (const key of ["statAverages", "statPercentiles"]) {
    if (validNumericStatMap(source[key])) result[key] = cloneStatMap(source[key]);
  }
  if (validStringStatMap(source.statGrades)) {
    result.statGrades = Object.fromEntries(STAT_KEYS.map((key) => [key, source.statGrades[key]]));
  }
  return result;
}

function validEvolutionLineage(value) {
  const lineage = recordOrNull(value);
  return Boolean(
    lineage
    && lineage.schemaVersion === PET_EVOLUTION_SCHEMA_VERSION
    && lineage.mode === "evolution"
    && typeof lineage.routeId === "string"
    && lineage.routeId !== ""
    && typeof lineage.sourceFormId === "string"
    && lineage.sourceFormId !== ""
    && typeof lineage.targetFormId === "string"
    && lineage.targetFormId !== ""
    && Number.isSafeInteger(lineage.completedAtSec)
    && lineage.completedAtSec >= 0
    && lineage.terminalStage === 2
    && Array.isArray(lineage.stageSnapshots)
    && lineage.stageSnapshots.length === 2
    && lineage.stageSnapshots.every(validPublicStageSnapshot)
    && lineage.stageSnapshots[0].stage === 0
    && lineage.stageSnapshots[1].stage === 1
  );
}

function validPublicStageSnapshot(value) {
  const snapshot = recordOrNull(value);
  return Boolean(
    snapshot
    && snapshot.schemaVersion === PET_EVOLUTION_SCHEMA_VERSION
    && [0, 1].includes(snapshot.stage)
    && typeof snapshot.formId === "string"
    && snapshot.formId !== ""
    && typeof snapshot.formName === "string"
    && snapshot.formName !== ""
    && typeof snapshot.growthSpeciesProfileId === "string"
    && snapshot.growthSpeciesProfileId !== ""
    && positiveInteger(snapshot.level) >= 1
    && validVisibleStatMap(snapshot.levelOneFourV)
    && validVisibleStatMap(snapshot.stats)
    && snapshot.intrinsicCombatPower === petIntrinsicCombatPower(snapshot.stats)
    && recordOrNull(snapshot.growthObservation)
  );
}

function canonicalStageOneCultivation(value) {
  const source = recordOrNull(value);
  if (
    !source
    || source.schemaVersion !== 1
    || !Number.isSafeInteger(source.rebirthCount)
    || source.rebirthCount !== 1
    || !Number.isSafeInteger(source.enhanceLevel)
    || source.enhanceLevel < 0
    || source.enhanceLevel > 100
    || !validNumericStatMap(source.rebirthGrowthBonus)
    || !Array.isArray(source.history)
    || source.history.length > PET_EVOLUTION_HISTORY_MAX_RECORDS
    || source.history.some((entry) => !recordOrNull(entry))
    || !source.history.some((entry) => String(entry.mode || "") === "rebirth" && Number(entry.afterRebirthCount) === 1)
    || !recordOrNull(source.lastPreview)
    || !recordOrNull(source.lastResult)
  ) {
    return failure("pet_evolution_cultivation_invalid", "宠物一转培养记录不完整，本次进化未执行。");
  }
  return {ok: true, record: structuredClone(source)};
}

function petIntrinsicCombatPower(stats) {
  const source = recordOrNull(stats) || {};
  return Math.round(
    Number(source.maxHp || 0) * 0.25
    + Number(source.attack || 0)
    + Number(source.defense || 0)
    + Number(source.quick || 0),
  );
}

function stablePetIdentity(pet) {
  const values = [pet.instanceId, pet.petId]
    .filter((value) => typeof value === "string" && value.trim() !== "")
    .map((value) => value.trim());
  return values.length >= 1 && values.every((value) => value === values[0]) ? values[0] : "";
}

function stablePetFormId(pet) {
  const values = [pet.formId, pet.templateId, pet.speciesId]
    .filter((value) => typeof value === "string" && value.trim() !== "")
    .map((value) => value.trim());
  return values.length >= 1 && values.every((value) => value === values[0]) ? values[0] : "";
}

function uniqueStrings(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.map((entry) => String(entry || "").trim()).filter(Boolean))];
}

function validVisibleStatMap(value) {
  return validNumericStatMap(value) && STAT_KEYS.every((key) => Number.isInteger(value[key]) && value[key] >= 1);
}

function validNumericStatMap(value) {
  const source = recordOrNull(value);
  return Boolean(
    source
    && STAT_KEYS.every((key) => typeof source[key] === "number" && Number.isFinite(source[key]))
  );
}

function validStringStatMap(value) {
  const source = recordOrNull(value);
  return Boolean(source && STAT_KEYS.every((key) => typeof source[key] === "string"));
}

function cloneStatMap(value) {
  const source = recordOrNull(value) || {};
  return Object.fromEntries(STAT_KEYS.map((key) => [key, Number(source[key] || 0)]));
}

function zeroStatMap() {
  return Object.fromEntries(STAT_KEYS.map((key) => [key, 0]));
}

function positiveInteger(value) {
  return Number.isSafeInteger(Number(value)) && Number(value) >= 1 ? Number(value) : 0;
}

function canonicalIsoTimestamp(value) {
  const text = String(value || "");
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return "";
  const canonical = new Date(parsed).toISOString();
  return canonical === text ? canonical : "";
}

function recordOrNull(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function failure(code, message, extra = {}) {
  return {ok: false, code: String(code || "pet_evolution_failed"), message: String(message || "宠物进化失败。"), ...extra};
}

module.exports = {
  PET_EVOLUTION_SCHEMA_VERSION,
  applyPetEvolution,
  inspectPetEvolutionEligibility,
  petIntrinsicCombatPower,
  validEvolutionLineage,
};
