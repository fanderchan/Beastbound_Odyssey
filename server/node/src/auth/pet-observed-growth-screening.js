"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {MODEL_VERSION, STAT_KEYS} = require("./pet-growth-authority");

const SCREENING_SCHEMA_VERSION = 1;
const OBSERVATION_SCHEMA_VERSION = 1;
const MINIMUM_SCREENING_LEVEL = 20;
const MAXIMUM_SCREENING_LEVEL = 140;
const DEFAULT_SPECIES_PROFILE_PATH = path.resolve(
  __dirname,
  "../../../../client/godot/data/balance/pet_growth_species_profiles.json",
);
const DEFAULT_POWER_FORMULA_PATH = path.resolve(
  __dirname,
  "../../../../client/godot/data/balance/pet_growth_profiles.json",
);
const THRESHOLD_KEYS = Object.freeze(["min", "p25", "p55", "p85", "p95", "max"]);
const THRESHOLD_PERCENTILES = Object.freeze([0, 25, 55, 85, 95, 100]);
const GRADE_IDS = Object.freeze(["S", "A", "B", "C", "D"]);
const REASON_CODES = Object.freeze({
  UNAVAILABLE: "pet_growth_screening_unavailable",
  UNOBSERVED: "pet_growth_screening_unobserved",
  OBSERVING: "pet_growth_screening_observing",
  MATURE: "pet_growth_screening_mature",
});
const REASON_LABELS = Object.freeze({
  [REASON_CODES.UNAVAILABLE]: "成长观察资料不完整，不能参与自动筛选。",
  [REASON_CODES.UNOBSERVED]: "尚未升级，暂时没有成长观察证据。",
  [REASON_CODES.OBSERVING]: "成长仍在观察中，达到 Lv20 后才能参与自动筛选。",
  [REASON_CODES.MATURE]: "公开成长观察已达到 Lv20 证据门槛。",
});

class PetObservedGrowthConfigError extends Error {
  constructor(errors) {
    const safeErrors = (Array.isArray(errors) ? errors : [errors])
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
    super(`pet observed growth config invalid: ${safeErrors.join("; ")}`);
    this.name = "PetObservedGrowthConfigError";
    this.code = "pet_observed_growth_config_invalid";
    this.errors = safeErrors;
  }
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function exactKeys(value, keys) {
  return isObjectRecord(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => hasOwn(value, key));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return value;
}

function clone(value) {
  return structuredClone(value);
}

function stableId(value) {
  return typeof value === "string" && value !== "" && value === value.trim() ? value : "";
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finiteInteger(value, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : null;
}

function validateStatMap(value, fieldPath, errors, options = {}) {
  if (!exactKeys(value, STAT_KEYS)) {
    errors.push(`${fieldPath} must contain exactly ${STAT_KEYS.join(",")}`);
    return;
  }
  for (const key of STAT_KEYS) {
    const number = finiteNumber(value[key]);
    if (number === null || (options.integer === true && !Number.isInteger(number))) {
      errors.push(`${fieldPath}.${key} must be ${options.integer === true ? "an integer" : "finite"}`);
    } else if (options.positive === true && number < 1) {
      errors.push(`${fieldPath}.${key} must be positive`);
    } else if (options.nonnegative === true && number < 0) {
      errors.push(`${fieldPath}.${key} must not be negative`);
    }
  }
}

function validateRangeMap(value, fieldPath, errors) {
  if (!exactKeys(value, STAT_KEYS)) {
    errors.push(`${fieldPath} must contain exactly ${STAT_KEYS.join(",")}`);
    return;
  }
  for (const key of STAT_KEYS) {
    const range = value[key];
    if (
      !Array.isArray(range)
      || range.length !== 2
      || range.some((entry) => finiteNumber(entry) === null)
      || range[0] > range[1]
    ) {
      errors.push(`${fieldPath}.${key} must be a monotonic two-number range`);
    }
  }
}

function validateThresholds(value, fieldPath, errors) {
  if (!exactKeys(value, THRESHOLD_KEYS)) {
    errors.push(`${fieldPath} must contain exactly ${THRESHOLD_KEYS.join(",")}`);
    return;
  }
  const values = THRESHOLD_KEYS.map((key) => finiteNumber(value[key]));
  if (values.some((entry) => entry === null)) {
    errors.push(`${fieldPath} must contain only finite thresholds`);
    return;
  }
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] < values[index - 1]) {
      errors.push(`${fieldPath} thresholds must be monotonic`);
      return;
    }
  }
}

function validateGradeThresholds(value, fieldPath, errors) {
  if (!exactKeys(value, GRADE_IDS)) {
    errors.push(`${fieldPath} must contain exactly ${GRADE_IDS.join(",")}`);
    return;
  }
  const thresholds = GRADE_IDS.map((gradeId) => finiteNumber(value[gradeId]));
  if (thresholds.some((entry) => entry === null || entry < 0 || entry > 100)) {
    errors.push(`${fieldPath} must contain finite percentiles between 0 and 100`);
    return;
  }
  for (let index = 1; index < thresholds.length; index += 1) {
    if (thresholds[index] > thresholds[index - 1]) {
      errors.push(`${fieldPath} must descend from S through D`);
      return;
    }
  }
}

function observationProfile(profile, index, errors) {
  const fieldPath = `profiles[${index}]`;
  if (!isObjectRecord(profile)) {
    errors.push(`${fieldPath} must be an object`);
    return null;
  }
  const profileId = stableId(profile.profileId);
  if (profileId === "") {
    errors.push(`${fieldPath}.profileId must be a stable id`);
    return null;
  }
  const formId = stableId(profile.formId);
  if (formId === "") {
    errors.push(`${fieldPath}.formId must be a stable id`);
  }
  const observation = profile.growthObservation;
  if (!isObjectRecord(observation)) {
    errors.push(`${fieldPath}.growthObservation must be an object`);
    return null;
  }
  // The original seven generated tables declared schemaVersion while the 25
  // later 10k tables used the same shape without the metadata. Preserve that
  // tracked v1 compatibility, but never reinterpret an explicit future value.
  if (hasOwn(observation, "schemaVersion") && observation.schemaVersion !== OBSERVATION_SCHEMA_VERSION) {
    errors.push(`${fieldPath}.growthObservation.schemaVersion must be ${OBSERVATION_SCHEMA_VERSION}`);
  }
  if (!Number.isSafeInteger(observation.sampleCount) || observation.sampleCount < 10000) {
    errors.push(`${fieldPath}.growthObservation.sampleCount must be at least 10000`);
  }
  if (observation.levelMin !== 2 || observation.levelMax !== MAXIMUM_SCREENING_LEVEL) {
    errors.push(`${fieldPath}.growthObservation must cover Lv2-${MAXIMUM_SCREENING_LEVEL}`);
  }
  if (observation.thresholdMetric !== "powerGrowthPerLevel") {
    errors.push(`${fieldPath}.growthObservation.thresholdMetric is unsupported`);
  }
  if (hasOwn(observation, "profileId") && observation.profileId !== profileId) {
    errors.push(`${fieldPath}.growthObservation.profileId must match the owning profile`);
  }
  validateGradeThresholds(
    observation.gradeThresholds,
    `${fieldPath}.growthObservation.gradeThresholds`,
    errors,
  );
  const byLevel = observation.powerGrowthPercentilesByLevel;
  if (!isObjectRecord(byLevel)) {
    errors.push(`${fieldPath}.growthObservation.powerGrowthPercentilesByLevel must be an object`);
    return null;
  }
  const expectedLevelKeys = [];
  for (let level = 2; level <= MAXIMUM_SCREENING_LEVEL; level += 1) {
    expectedLevelKeys.push(String(level));
    validateThresholds(
      byLevel[String(level)],
      `${fieldPath}.growthObservation.powerGrowthPercentilesByLevel.${level}`,
      errors,
    );
  }
  if (!exactKeys(byLevel, expectedLevelKeys)) {
    errors.push(`${fieldPath}.growthObservation must contain exactly one threshold row for every Lv2-140 level`);
  }
  validateStatMap(profile.outputGrowth, `${fieldPath}.outputGrowth`, errors, {nonnegative: true});
  if (
    exactKeys(profile.outputGrowth, STAT_KEYS)
    && STAT_KEYS.every((key) => finiteNumber(profile.outputGrowth[key]) !== null)
    && STAT_KEYS.every((key) => profile.outputGrowth[key] === 0)
  ) {
    errors.push(`${fieldPath}.outputGrowth must contain at least one positive stat`);
  }
  const growthOutputSpread = isObjectRecord(profile.individualRules)
    ? profile.individualRules.growthOutputSpread
    : null;
  validateRangeMap(growthOutputSpread, `${fieldPath}.individualRules.growthOutputSpread`, errors);
  return {
    profileId,
    formId,
    gradeThresholds: clone(observation.gradeThresholds),
    powerGrowthPercentilesByLevel: clone(byLevel),
    outputGrowth: clone(profile.outputGrowth),
    growthOutputSpread: clone(growthOutputSpread),
  };
}

function activePowerFormula(powerDocument, errors) {
  if (!isObjectRecord(powerDocument) || powerDocument.schemaVersion !== 1) {
    errors.push("pet power formula document must use schemaVersion 1");
    return null;
  }
  const activeId = stableId(powerDocument.activePowerFormula);
  const formulas = Array.isArray(powerDocument.powerFormulas) ? powerDocument.powerFormulas : [];
  const matches = formulas.filter((entry) => isObjectRecord(entry) && entry.id === activeId);
  if (activeId === "" || matches.length !== 1) {
    errors.push("pet power formula document must resolve exactly one active formula");
    return null;
  }
  const weights = matches[0].weights;
  validateStatMap(weights, `powerFormulas.${activeId}.weights`, errors);
  if (isObjectRecord(weights)) {
    for (const key of STAT_KEYS) {
      if (finiteNumber(weights[key]) !== null && weights[key] < 0) {
        errors.push(`powerFormulas.${activeId}.weights.${key} must not be negative`);
      }
    }
    if (STAT_KEYS.every((key) => finiteNumber(weights[key]) !== null && weights[key] === 0)) {
      errors.push(`powerFormulas.${activeId}.weights must contain at least one positive weight`);
    }
  }
  return {id: activeId, weights: clone(weights)};
}

function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function combatPower(stats, weights) {
  return Math.round(STAT_KEYS.reduce((total, key) => total + (stats[key] * weights[key]), 0));
}

function percentileFromThresholds(value, thresholds) {
  const values = THRESHOLD_KEYS.map((key) => thresholds[key]);
  if (value <= values[0]) {
    return 0;
  }
  if (value >= values.at(-1)) {
    return 100;
  }
  for (let index = 0; index < values.length - 1; index += 1) {
    const left = values[index];
    const right = values[index + 1];
    if (value > right) {
      continue;
    }
    if (Math.abs(right - left) <= 0.0001) {
      return THRESHOLD_PERCENTILES[index + 1];
    }
    const unit = Math.max(0, Math.min(1, (value - left) / (right - left)));
    return THRESHOLD_PERCENTILES[index]
      + (unit * (THRESHOLD_PERCENTILES[index + 1] - THRESHOLD_PERCENTILES[index]));
  }
  return 100;
}

function percentileFromRange(value, minimum, maximum) {
  if (Math.abs(maximum - minimum) <= 0.0001) {
    return 50;
  }
  return Math.max(0, Math.min(100, ((value - minimum) / (maximum - minimum)) * 100));
}

function gradeForPercentile(percentile, gradeThresholds) {
  for (const gradeId of GRADE_IDS) {
    if (percentile >= gradeThresholds[gradeId]) {
      return gradeId;
    }
  }
  return "D";
}

function publicStatMap(value) {
  const errors = [];
  validateStatMap(value, "pet stats", errors, {integer: true, positive: true});
  return errors.length === 0 ? Object.fromEntries(STAT_KEYS.map((key) => [key, value[key]])) : null;
}

function unavailableResult(level = 0, observedLevels = 0) {
  return deepFreeze({
    schemaVersion: SCREENING_SCHEMA_VERSION,
    status: "unavailable",
    growthRuleEligible: false,
    retainPet: true,
    reasonCode: REASON_CODES.UNAVAILABLE,
    reasonLabel: REASON_LABELS[REASON_CODES.UNAVAILABLE],
    minimumLevel: MINIMUM_SCREENING_LEVEL,
    level,
    observedLevels,
    remainingLevels: Math.max(0, MINIMUM_SCREENING_LEVEL - level),
    observation: {},
  });
}

function resultForObservation(status, reasonCode, observation) {
  const level = observation.level;
  return deepFreeze({
    schemaVersion: SCREENING_SCHEMA_VERSION,
    status,
    growthRuleEligible: status === "mature",
    retainPet: true,
    reasonCode,
    reasonLabel: REASON_LABELS[reasonCode],
    minimumLevel: MINIMUM_SCREENING_LEVEL,
    level,
    observedLevels: observation.observedLevels,
    remainingLevels: Math.max(0, MINIMUM_SCREENING_LEVEL - level),
    observation,
  });
}

function createPetObservedGrowthScreening({profileDocument, powerDocument} = {}) {
  const errors = [];
  if (!isObjectRecord(profileDocument) || profileDocument.schemaVersion !== 1) {
    errors.push("pet growth species profile document must use schemaVersion 1");
  }
  const profiles = isObjectRecord(profileDocument) && Array.isArray(profileDocument.profiles)
    ? profileDocument.profiles
    : [];
  if (profiles.length === 0) {
    errors.push("pet growth species profile document must contain profiles");
  }
  const profileById = new Map();
  for (let index = 0; index < profiles.length; index += 1) {
    const profile = observationProfile(profiles[index], index, errors);
    if (!profile) {
      continue;
    }
    if (profileById.has(profile.profileId)) {
      errors.push(`duplicate pet observed growth profile ${profile.profileId}`);
    } else {
      profileById.set(profile.profileId, deepFreeze(profile));
    }
  }
  const powerFormula = activePowerFormula(powerDocument, errors);
  if (errors.length > 0 || !powerFormula) {
    throw new PetObservedGrowthConfigError(errors);
  }
  const frozenPowerFormula = deepFreeze(powerFormula);

  function evaluatePet(pet) {
    try {
      if (!isObjectRecord(pet)) {
        return unavailableResult();
      }
      const level = finiteInteger(pet.level, 1, MAXIMUM_SCREENING_LEVEL);
      const observedLevels = level === null ? 0 : level - 1;
      const profileId = stableId(pet.growthSpeciesProfileId);
      const profile = profileById.get(profileId);
      const formId = stableId(pet.formId);
      const templateId = stableId(pet.templateId);
      const initialStats = publicStatMap(pet.initialStats);
      const speciesLevelOneStats = publicStatMap(pet.growthSpeciesLevel1Stats);
      const currentStats = publicStatMap(Object.fromEntries(STAT_KEYS.map((key) => [key, pet[key]])));
      if (
        pet.growthModelVersion !== MODEL_VERSION
        || level === null
        || !profile
        || formId === ""
        || templateId === ""
        || formId !== templateId
        || formId !== profile.formId
        || !initialStats
        || !speciesLevelOneStats
        || !currentStats
        || STAT_KEYS.some((key) => initialStats[key] !== speciesLevelOneStats[key])
        || (level > 1 && STAT_KEYS.some((key) => currentStats[key] < initialStats[key]))
      ) {
        return unavailableResult(level || 0, observedLevels);
      }

      const observation = {
        schemaVersion: OBSERVATION_SCHEMA_VERSION,
        profileId,
        level,
        observedLevels,
        statAverages: {},
        statPercentiles: {},
        statGrades: {},
        powerGrowthPerLevel: 0,
        powerPercentile: 0,
        overallGrade: "未观察",
      };
      if (level === 1) {
        return resultForObservation("unobserved", REASON_CODES.UNOBSERVED, deepFreeze(observation));
      }

      const thresholds = profile.powerGrowthPercentilesByLevel[String(level)];
      if (!thresholds) {
        return unavailableResult(level, observedLevels);
      }
      for (const key of STAT_KEYS) {
        const average = (currentStats[key] - initialStats[key]) / observedLevels;
        const percentile = percentileFromRange(
          average,
          profile.outputGrowth[key] + profile.growthOutputSpread[key][0],
          profile.outputGrowth[key] + profile.growthOutputSpread[key][1],
        );
        observation.statAverages[key] = roundTo(average, 3);
        observation.statPercentiles[key] = roundTo(percentile, 1);
        observation.statGrades[key] = gradeForPercentile(percentile, profile.gradeThresholds);
      }
      const powerGrowth = (
        combatPower(currentStats, frozenPowerFormula.weights)
        - combatPower(initialStats, frozenPowerFormula.weights)
      ) / observedLevels;
      const powerPercentile = percentileFromThresholds(powerGrowth, thresholds);
      observation.powerGrowthPerLevel = roundTo(powerGrowth, 3);
      observation.powerPercentile = roundTo(powerPercentile, 1);
      observation.overallGrade = gradeForPercentile(powerPercentile, profile.gradeThresholds);
      const frozenObservation = deepFreeze(observation);
      return level >= MINIMUM_SCREENING_LEVEL
        ? resultForObservation("mature", REASON_CODES.MATURE, frozenObservation)
        : resultForObservation("observing", REASON_CODES.OBSERVING, frozenObservation);
    } catch (_error) {
      return unavailableResult();
    }
  }

  return Object.freeze({
    schemaVersion: SCREENING_SCHEMA_VERSION,
    minimumLevel: MINIMUM_SCREENING_LEVEL,
    profileCount: profileById.size,
    powerFormulaId: frozenPowerFormula.id,
    evaluatePet,
  });
}

function readJsonDocument(filePath, label) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!isObjectRecord(value)) {
      throw new TypeError("root must be an object");
    }
    return value;
  } catch (error) {
    throw new PetObservedGrowthConfigError([`${label} load failed: ${error.message}`]);
  }
}

function loadPetObservedGrowthScreening() {
  return createPetObservedGrowthScreening({
    profileDocument: readJsonDocument(DEFAULT_SPECIES_PROFILE_PATH, "pet growth species profile document"),
    powerDocument: readJsonDocument(DEFAULT_POWER_FORMULA_PATH, "pet power formula document"),
  });
}

module.exports = Object.freeze({
  DEFAULT_POWER_FORMULA_PATH,
  DEFAULT_SPECIES_PROFILE_PATH,
  MINIMUM_SCREENING_LEVEL,
  OBSERVATION_SCHEMA_VERSION,
  PetObservedGrowthConfigError,
  REASON_CODES,
  REASON_LABELS,
  SCREENING_SCHEMA_VERSION,
  createPetObservedGrowthScreening,
  loadPetObservedGrowthScreening,
});
