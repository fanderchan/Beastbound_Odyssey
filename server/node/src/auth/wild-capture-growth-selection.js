"use strict";

const {STAT_KEYS, stableUnit} = require("./pet-growth-authority");

const POLICY_SCHEMA_VERSION = 1;
const SELECTION_SCHEMA_VERSION = 1;
const POLICY_ID_PATTERN = /^[a-z][a-z0-9_]*_v[1-9][0-9]*$/;
const POLICY_KEYS = Object.freeze([
  "schemaVersion",
  "policyId",
  "qualityPowerWeights",
  "levelPressureHalfLevel",
  "upperTailStart",
  "jackpotAcceptanceFloor",
  "upperTailShape",
  "maxSelectionAttempts",
]);

const DEFAULT_WILD_CAPTURE_GROWTH_POLICY = deepFreeze({
  schemaVersion: POLICY_SCHEMA_VERSION,
  policyId: "wild_capture_growth_level_bias_v1",
  qualityPowerWeights: {
    maxHp: 0.25,
    attack: 1,
    defense: 1,
    quick: 1,
  },
  levelPressureHalfLevel: 10,
  upperTailStart: 0.5,
  jackpotAcceptanceFloor: 0.0001,
  upperTailShape: 1.2,
  maxSelectionAttempts: 8,
});

function isObjectRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactKeys(value, keys) {
  return isObjectRecord(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function clone(value) {
  return structuredClone(value);
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

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function quantize(value, decimals = 6) {
  const factor = 10 ** Math.max(0, Math.trunc(decimals));
  return Math.round(Number(value) * factor) / factor;
}

function validateWildCaptureGrowthPolicy(value, fieldPath = "wildCaptureGrowthPolicy") {
  const errors = [];
  if (!hasExactKeys(value, POLICY_KEYS)) {
    return [`${fieldPath} must contain exactly ${POLICY_KEYS.join(",")}`];
  }
  if (value.schemaVersion !== POLICY_SCHEMA_VERSION) {
    errors.push(`${fieldPath}.schemaVersion must be ${POLICY_SCHEMA_VERSION}`);
  }
  if (typeof value.policyId !== "string" || !POLICY_ID_PATTERN.test(value.policyId)) {
    errors.push(`${fieldPath}.policyId must be a versioned lowercase id`);
  }
  if (!hasExactKeys(value.qualityPowerWeights, STAT_KEYS)) {
    errors.push(`${fieldPath}.qualityPowerWeights must contain exactly ${STAT_KEYS.join(",")}`);
  } else {
    for (const key of STAT_KEYS) {
      const weight = value.qualityPowerWeights[key];
      if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0 || weight > 10) {
        errors.push(`${fieldPath}.qualityPowerWeights.${key} must be a finite number in (0,10]`);
      }
    }
  }
  if (
    !Number.isInteger(value.levelPressureHalfLevel)
    || value.levelPressureHalfLevel < 2
    || value.levelPressureHalfLevel > 140
  ) {
    errors.push(`${fieldPath}.levelPressureHalfLevel must be an integer between 2 and 140`);
  }
  if (
    typeof value.upperTailStart !== "number"
    || !Number.isFinite(value.upperTailStart)
    || value.upperTailStart <= 0
    || value.upperTailStart >= 1
  ) {
    errors.push(`${fieldPath}.upperTailStart must be a finite number in (0,1)`);
  }
  if (
    typeof value.jackpotAcceptanceFloor !== "number"
    || !Number.isFinite(value.jackpotAcceptanceFloor)
    || value.jackpotAcceptanceFloor <= 0
    || value.jackpotAcceptanceFloor >= 1
  ) {
    errors.push(`${fieldPath}.jackpotAcceptanceFloor must be a finite number in (0,1)`);
  }
  if (
    typeof value.upperTailShape !== "number"
    || !Number.isFinite(value.upperTailShape)
    || value.upperTailShape < 0.25
    || value.upperTailShape > 8
  ) {
    errors.push(`${fieldPath}.upperTailShape must be a finite number between 0.25 and 8`);
  }
  if (
    !Number.isInteger(value.maxSelectionAttempts)
    || value.maxSelectionAttempts < 1
    || value.maxSelectionAttempts > 16
  ) {
    errors.push(`${fieldPath}.maxSelectionAttempts must be an integer between 1 and 16`);
  }
  return errors;
}

function canonicalWildCaptureGrowthPolicy(value = DEFAULT_WILD_CAPTURE_GROWTH_POLICY) {
  const errors = validateWildCaptureGrowthPolicy(value);
  if (errors.length > 0) {
    throw new TypeError(`wild capture growth policy invalid: ${errors.join("; ")}`);
  }
  if (Object.isFrozen(value) && Object.values(value).every((nested) => (
    !nested || typeof nested !== "object" || Object.isFrozen(nested)
  ))) {
    return value;
  }
  return deepFreeze(clone(value));
}

function normalizedRange(profile, key) {
  const raw = profile
    && profile.individualRules
    && profile.individualRules.growthOutputSpread
    && profile.individualRules.growthOutputSpread[key];
  if (!Array.isArray(raw) || raw.length !== 2) {
    throw new TypeError(`growth profile is missing individualRules.growthOutputSpread.${key}`);
  }
  const first = Number(raw[0]);
  const second = Number(raw[1]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    throw new TypeError(`growth profile has invalid individualRules.growthOutputSpread.${key}`);
  }
  return {minimum: Math.min(first, second), maximum: Math.max(first, second)};
}

function growthQualityUnitTrusted(profile, privateRoll, policy) {
  if (!isObjectRecord(profile) || !isObjectRecord(privateRoll) || !isObjectRecord(privateRoll.innateGrowthBonus)) {
    throw new TypeError("wild capture growth quality requires a profile and private growth roll");
  }
  let minimumPower = 0;
  let maximumPower = 0;
  let actualPower = 0;
  for (const key of STAT_KEYS) {
    const range = normalizedRange(profile, key);
    const value = privateRoll.innateGrowthBonus[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError(`private growth roll has invalid innateGrowthBonus.${key}`);
    }
    const weight = policy.qualityPowerWeights[key];
    minimumPower += range.minimum * weight;
    maximumPower += range.maximum * weight;
    actualPower += value * weight;
  }
  if (maximumPower <= minimumPower) {
    return 0.5;
  }
  return quantize(clamp((actualPower - minimumPower) / (maximumPower - minimumPower), 0, 1));
}

function growthQualityUnit(profile, privateRoll, policyValue = DEFAULT_WILD_CAPTURE_GROWTH_POLICY) {
  return growthQualityUnitTrusted(
    profile,
    privateRoll,
    canonicalWildCaptureGrowthPolicy(policyValue),
  );
}

function levelPressureTrusted(encounterLevel, policy) {
  const level = Math.max(1, Math.min(140, Math.trunc(Number(encounterLevel) || 1)));
  if (level <= 1) {
    return 0;
  }
  const numerator = level - 1;
  return quantize(numerator / (numerator + policy.levelPressureHalfLevel - 1));
}

function levelPressure(encounterLevel, policyValue = DEFAULT_WILD_CAPTURE_GROWTH_POLICY) {
  return levelPressureTrusted(encounterLevel, canonicalWildCaptureGrowthPolicy(policyValue));
}

function acceptanceProbabilityTrusted(qualityUnit, encounterLevel, policy) {
  const numericQuality = Number(qualityUnit);
  if (!Number.isFinite(numericQuality)) {
    throw new TypeError("wild capture growth quality unit must be finite");
  }
  const quality = clamp(numericQuality, 0, 1);
  const pressure = levelPressureTrusted(encounterLevel, policy);
  if (pressure <= 0 || quality <= policy.upperTailStart) {
    return 1;
  }
  const upperTailUnit = (quality - policy.upperTailStart) / (1 - policy.upperTailStart);
  return Math.pow(
    policy.jackpotAcceptanceFloor,
    pressure * Math.pow(upperTailUnit, policy.upperTailShape),
  );
}

function acceptanceProbability(qualityUnit, encounterLevel, policyValue = DEFAULT_WILD_CAPTURE_GROWTH_POLICY) {
  return acceptanceProbabilityTrusted(
    qualityUnit,
    encounterLevel,
    canonicalWildCaptureGrowthPolicy(policyValue),
  );
}

function evaluateWildCaptureGrowthDrawTrusted({
  profile,
  privateSeed,
  privateRoll,
  encounterLevel,
  policy,
}) {
  const seed = typeof privateSeed === "string" ? privateSeed.trim() : "";
  if (seed === "") {
    throw new TypeError("wild capture growth draw requires a private seed");
  }
  if (!Number.isInteger(encounterLevel) || encounterLevel < 1 || encounterLevel > 140) {
    throw new TypeError("wild capture growth draw requires an encounter level between 1 and 140");
  }
  const quality = growthQualityUnitTrusted(profile, privateRoll, policy);
  const pressure = levelPressureTrusted(encounterLevel, policy);
  const probability = acceptanceProbabilityTrusted(quality, encounterLevel, policy);
  const acceptanceUnit = stableUnit([
    "beastbound-odyssey/wild-capture-growth-selection/v1",
    policy.policyId,
    String(encounterLevel),
    seed,
  ].join("\0"));
  return Object.freeze({
    schemaVersion: SELECTION_SCHEMA_VERSION,
    policyId: policy.policyId,
    encounterLevel,
    qualityUnit: quality,
    levelPressure: pressure,
    acceptanceProbability: probability,
    acceptanceUnit,
    accepted: probability >= 1 || acceptanceUnit < probability,
  });
}

function evaluateWildCaptureGrowthDraw({profile, privateSeed, privateRoll, encounterLevel, policy} = {}) {
  return evaluateWildCaptureGrowthDrawTrusted({
    profile,
    privateSeed,
    privateRoll,
    encounterLevel,
    policy: canonicalWildCaptureGrowthPolicy(policy),
  });
}

function selectWildCaptureGrowthDraw({profile, encounterLevel, policy, draw} = {}) {
  const canonicalPolicy = canonicalWildCaptureGrowthPolicy(policy);
  if (typeof draw !== "function") {
    throw new TypeError("wild capture growth selection requires a draw function");
  }
  let fallback = null;
  for (let attempt = 1; attempt <= canonicalPolicy.maxSelectionAttempts; attempt += 1) {
    const candidate = draw(attempt);
    if (
      !isObjectRecord(candidate)
      || typeof candidate.privateSeed !== "string"
      || !isObjectRecord(candidate.privateRoll)
      || !Object.prototype.hasOwnProperty.call(candidate, "value")
    ) {
      throw new TypeError("wild capture growth draw returned an invalid candidate");
    }
    const evaluation = evaluateWildCaptureGrowthDrawTrusted({
      profile,
      privateSeed: candidate.privateSeed,
      privateRoll: candidate.privateRoll,
      encounterLevel,
      policy: canonicalPolicy,
    });
    const row = {value: candidate.value, evaluation, attempt};
    if (!fallback || evaluation.qualityUnit < fallback.evaluation.qualityUnit) {
      fallback = row;
    }
    if (evaluation.accepted) {
      return Object.freeze({
        value: candidate.value,
        evaluation,
        attemptCount: attempt,
        fallbackUsed: false,
      });
    }
  }
  return Object.freeze({
    value: fallback.value,
    evaluation: fallback.evaluation,
    attemptCount: canonicalPolicy.maxSelectionAttempts,
    fallbackUsed: true,
  });
}

module.exports = {
  DEFAULT_WILD_CAPTURE_GROWTH_POLICY,
  POLICY_SCHEMA_VERSION,
  SELECTION_SCHEMA_VERSION,
  acceptanceProbability,
  canonicalWildCaptureGrowthPolicy,
  evaluateWildCaptureGrowthDraw,
  growthQualityUnit,
  levelPressure,
  selectWildCaptureGrowthDraw,
  validateWildCaptureGrowthPolicy,
};
