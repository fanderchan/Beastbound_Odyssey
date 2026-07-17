"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_BALANCE_PATH = path.resolve(
  __dirname,
  "../../../../client/godot/data/balance/pet_rebirth_balance.json",
);
const STAT_KEYS = Object.freeze(["maxHp", "attack", "defense", "quick"]);

class PetRebirthBalanceError extends Error {
  constructor(errors = []) {
    const safeErrors = (Array.isArray(errors) ? errors : [errors])
      .map((error) => String(error || "").trim())
      .filter(Boolean);
    super(`pet rebirth balance rejected${safeErrors.length > 0 ? `: ${safeErrors.join("; ")}` : ""}`);
    this.name = "PetRebirthBalanceError";
    this.code = "pet_rebirth_balance_invalid";
    this.errors = safeErrors;
  }
}

function isObjectRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function finiteNumber(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function positiveNumber(value) {
  const result = finiteNumber(value);
  return result !== null && result > 0 ? result : null;
}

function integerInRange(value, minimum, maximum) {
  const result = finiteNumber(value);
  return Number.isInteger(result) && result >= minimum && result <= maximum ? result : null;
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

function normalizedRangeTable(value, stage, errors) {
  if (!Array.isArray(value) || value.length !== 5) {
    errors.push(`poolRangesByStage.${stage} must contain five anchors`);
    return [];
  }
  const result = [];
  let previousMin = -Infinity;
  let previousMax = -Infinity;
  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index];
    if (!isObjectRecord(raw)) {
      errors.push(`poolRangesByStage.${stage}[${index}] must be an object`);
      continue;
    }
    const anchor = integerInRange(raw.effectiveStoneCount, 0, 4);
    const minimum = finiteNumber(raw.min);
    const maximum = finiteNumber(raw.max);
    if (anchor !== index) {
      errors.push(`poolRangesByStage.${stage}[${index}] anchor must equal ${index}`);
    }
    if (minimum === null || maximum === null || minimum < 0 || maximum < minimum) {
      errors.push(`poolRangesByStage.${stage}[${index}] range is invalid`);
      continue;
    }
    if (minimum < previousMin || maximum < previousMax) {
      errors.push(`poolRangesByStage.${stage} anchors must be non-decreasing`);
    }
    previousMin = minimum;
    previousMax = maximum;
    result.push(Object.freeze({effectiveStoneCount: index, min: minimum, max: maximum}));
  }
  return result;
}

function createPetRebirthBalance(document) {
  const errors = [];
  if (!isObjectRecord(document)) {
    throw new PetRebirthBalanceError(["document must be an object"]);
  }
  if (document.schemaVersion !== 1) {
    errors.push("schemaVersion must equal 1");
  }
  const balanceVersion = String(document.balanceVersion || "").trim();
  if (!/^[a-z][a-z0-9_]{2,63}$/.test(balanceVersion)) {
    errors.push("balanceVersion is invalid");
  }
  const maxRebirthStage = integerInRange(document.maxRebirthStage, 2, 2);
  if (maxRebirthStage === null) {
    errors.push("maxRebirthStage must equal 2");
  }

  const target = isObjectRecord(document.target) ? document.target : {};
  const minimumLevel = integerInRange(target.minimumLevel, 1, 140);
  const fullPreparationLevel = integerInRange(target.fullPreparationLevel, 1, 140);
  const recommendedLevel = integerInRange(target.recommendedLevel, 1, 140);
  const maxPoolMultiplier = finiteNumber(target.maxPoolMultiplier);
  if (minimumLevel === null) errors.push("target.minimumLevel is invalid");
  if (fullPreparationLevel === null || (minimumLevel !== null && fullPreparationLevel <= minimumLevel)) {
    errors.push("target.fullPreparationLevel must exceed target.minimumLevel");
  }
  if (
    recommendedLevel === null
    || (minimumLevel !== null && recommendedLevel < minimumLevel)
    || (fullPreparationLevel !== null && recommendedLevel > fullPreparationLevel)
  ) {
    errors.push("target.recommendedLevel must be within the preparation range");
  }
  if (maxPoolMultiplier === null || maxPoolMultiplier < 1 || maxPoolMultiplier > 1.25) {
    errors.push("target.maxPoolMultiplier must be within 1.00..1.25");
  }
  if (target.curve !== "linear") {
    errors.push("target.curve must equal linear");
  }

  const helper = isObjectRecord(document.helper) ? document.helper : {};
  const helperRequiredLevel = integerInRange(helper.requiredLevel, 1, 140);
  if (helperRequiredLevel === null) errors.push("helper.requiredLevel is invalid");

  const internalPower = isObjectRecord(document.internalPower) ? document.internalPower : {};
  const maxHpScale = positiveNumber(internalPower.maxHpScale);
  if (maxHpScale === null) errors.push("internalPower.maxHpScale must be positive");

  const stone = isObjectRecord(document.stone) ? document.stone : {};
  const stoneCapacity = integerInRange(stone.capacityPerStat, 1, 1000);
  const effectiveExponent = positiveNumber(stone.effectiveExponent);
  if (stoneCapacity === null) errors.push("stone.capacityPerStat is invalid");
  if (effectiveExponent === null || effectiveExponent < 1 || effectiveExponent > 3) {
    errors.push("stone.effectiveExponent must be within 1..3");
  }

  const allocation = isObjectRecord(document.allocation) ? document.allocation : {};
  const targetGrowthWeight = finiteNumber(allocation.targetGrowthWeight);
  const stoneWeight = finiteNumber(allocation.stoneWeight);
  const helperGrowthWeight = finiteNumber(allocation.helperGrowthWeight);
  for (const [key, value] of [
    ["targetGrowthWeight", targetGrowthWeight],
    ["stoneWeight", stoneWeight],
    ["helperGrowthWeight", helperGrowthWeight],
  ]) {
    if (value === null || value < 0 || value > 20) errors.push(`allocation.${key} is invalid`);
  }

  const roll = isObjectRecord(document.roll) ? document.roll : {};
  const previewPercentile = finiteNumber(roll.previewPercentile);
  if (roll.distribution !== "uniform_percentile") errors.push("roll.distribution must equal uniform_percentile");
  if (previewPercentile === null || previewPercentile < 0 || previewPercentile > 100) {
    errors.push("roll.previewPercentile is invalid");
  }
  const gradeThresholds = isObjectRecord(roll.gradeThresholds) ? roll.gradeThresholds : {};
  const normalizedThresholds = {};
  let lastThreshold = 101;
  for (const grade of ["S", "A", "B", "C"]) {
    const threshold = finiteNumber(gradeThresholds[grade]);
    if (threshold === null || threshold < 0 || threshold > 100 || threshold >= lastThreshold) {
      errors.push(`roll.gradeThresholds.${grade} is invalid`);
    }
    normalizedThresholds[grade] = threshold === null ? 0 : threshold;
    lastThreshold = threshold === null ? lastThreshold : threshold;
  }

  const rawTables = isObjectRecord(document.poolRangesByStage) ? document.poolRangesByStage : {};
  const poolRangesByStage = {};
  for (const stage of [1, 2]) {
    poolRangesByStage[stage] = normalizedRangeTable(rawTables[String(stage)], stage, errors);
  }

  const compatibility = isObjectRecord(document.compatibility) ? document.compatibility : {};
  if (compatibility.applyTo !== "future_confirmed_rebirths_only") {
    errors.push("compatibility.applyTo must protect existing results");
  }
  if (compatibility.existingPets !== "unchanged" || compatibility.existingHistory !== "unchanged") {
    errors.push("compatibility must keep existing pets and history unchanged");
  }

  if (errors.length > 0) {
    throw new PetRebirthBalanceError(errors);
  }
  return deepFreeze({
    schemaVersion: 1,
    balanceVersion,
    maxRebirthStage,
    target: {
      minimumLevel,
      fullPreparationLevel,
      recommendedLevel,
      maxPoolMultiplier,
      curve: "linear",
    },
    helper: {requiredLevel: helperRequiredLevel},
    internalPower: {maxHpScale},
    stone: {capacityPerStat: stoneCapacity, effectiveExponent},
    allocation: {targetGrowthWeight, stoneWeight, helperGrowthWeight},
    roll: {
      distribution: "uniform_percentile",
      previewPercentile,
      gradeThresholds: normalizedThresholds,
    },
    poolRangesByStage,
    compatibility: {
      applyTo: compatibility.applyTo,
      existingPets: compatibility.existingPets,
      existingHistory: compatibility.existingHistory,
    },
  });
}

function loadPetRebirthBalance({filePath = DEFAULT_BALANCE_PATH} = {}) {
  let document;
  try {
    document = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new PetRebirthBalanceError([`cannot load balance document: ${error.message}`]);
  }
  return createPetRebirthBalance(document);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value || 0)));
}

function petRebirthEffectiveStoneCount(balance, stonePoints) {
  const points = isObjectRecord(stonePoints) ? stonePoints : {};
  let total = 0;
  for (const key of STAT_KEYS) {
    const ratio = clamp(points[key], 0, balance.stone.capacityPerStat) / balance.stone.capacityPerStat;
    total += Math.pow(ratio, balance.stone.effectiveExponent);
  }
  return total;
}

function petRebirthPoolRange(balance, effectiveStoneCount, stage) {
  const safeStage = Math.max(1, Math.min(balance.maxRebirthStage, Math.trunc(Number(stage || 1))));
  const table = balance.poolRangesByStage[safeStage];
  const safeCount = clamp(effectiveStoneCount, 0, table.length - 1);
  const lowerIndex = Math.floor(safeCount);
  const upperIndex = Math.min(table.length - 1, lowerIndex + 1);
  const ratio = lowerIndex === upperIndex ? 0 : safeCount - lowerIndex;
  const lower = table[lowerIndex];
  const upper = table[upperIndex];
  return {
    min: lower.min + (upper.min - lower.min) * ratio,
    max: lower.max + (upper.max - lower.max) * ratio,
  };
}

function petRebirthTargetPreparation(balance, targetLevel) {
  const level = Math.max(1, Math.trunc(Number(targetLevel || 1)));
  const start = balance.target.minimumLevel;
  const end = balance.target.fullPreparationLevel;
  const ratio = clamp((level - start) / (end - start), 0, 1);
  return {
    level,
    ratio,
    multiplier: 1 + (balance.target.maxPoolMultiplier - 1) * ratio,
  };
}

function petRebirthPoolInfo(balance, {stonePoints, stage, targetLevel, percentile}) {
  const effectiveStoneCount = petRebirthEffectiveStoneCount(balance, stonePoints);
  const baseRange = petRebirthPoolRange(balance, effectiveStoneCount, stage);
  const safePercentile = clamp(percentile, 0, 100);
  const basePool = baseRange.min + (baseRange.max - baseRange.min) * safePercentile / 100;
  const preparation = petRebirthTargetPreparation(balance, targetLevel);
  return {
    effectiveStoneCount,
    baseMin: baseRange.min,
    baseMax: baseRange.max,
    basePool,
    pool: basePool * preparation.multiplier,
    percentile: safePercentile,
    targetPreparationLevel: preparation.level,
    targetPreparationRatio: preparation.ratio,
    targetPreparationMultiplier: preparation.multiplier,
  };
}

module.exports = {
  DEFAULT_BALANCE_PATH,
  STAT_KEYS,
  PetRebirthBalanceError,
  createPetRebirthBalance,
  loadPetRebirthBalance,
  petRebirthEffectiveStoneCount,
  petRebirthPoolInfo,
  petRebirthPoolRange,
  petRebirthTargetPreparation,
};
