"use strict";

const crypto = require("node:crypto");

const MODEL_VERSION = "pet_growth_authority_v1";
const PUBLIC_SNAPSHOT_SCHEMA_VERSION = 1;
const MAX_LEVEL = 140;
const STAT_KEYS = Object.freeze(["maxHp", "attack", "defense", "quick"]);
const INTERNAL_DECIMALS = 6;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length === expectedKeys.length
    && expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function roundHalfAwayFromZero(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const rounded = numeric < 0 ? -Math.floor(-numeric + 0.5) : Math.floor(numeric + 0.5);
  return Object.is(rounded, -0) ? 0 : rounded;
}

function quantize(value, decimals = INTERNAL_DECIMALS) {
  const factor = 10 ** Math.max(0, Math.trunc(decimals));
  return roundHalfAwayFromZero(Number(value) * factor) / factor;
}

function stableUnit(seed) {
  const digest = crypto.createHash("sha256").update(String(seed)).digest("hex");
  return Number.parseInt(digest.slice(0, 8), 16) / 0xffffffff;
}

function normalizedRange(source, key, fallbackMinimum = 0, fallbackMaximum = 0) {
  const raw = source && typeof source === "object" ? source[key] : null;
  if (Array.isArray(raw) && raw.length >= 2) {
    const first = Number(raw[0]);
    const second = Number(raw[1]);
    if (Number.isFinite(first) && Number.isFinite(second)) {
      return {"min": Math.min(first, second), "max": Math.max(first, second)};
    }
  }
  if (raw && typeof raw === "object") {
    const first = Number(raw.min);
    const second = Number(raw.max);
    if (Number.isFinite(first) && Number.isFinite(second)) {
      return {"min": Math.min(first, second), "max": Math.max(first, second)};
    }
  }
  return {
    "min": Math.min(fallbackMinimum, fallbackMaximum),
    "max": Math.max(fallbackMinimum, fallbackMaximum),
  };
}

function rollInRange(seed, key, range, distribution, rareExtremeRate) {
  const minimum = Number(range.min);
  const maximum = Number(range.max);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum <= minimum) {
    return Number.isFinite(minimum) ? minimum : 0;
  }
  let unit = stableUnit(`${seed}:${key}`);
  if (distribution === "uniform") {
    return minimum + (maximum - minimum) * unit;
  }
  if (distribution === "rare_spike") {
    const spike = stableUnit(`${seed}:${key}:spike`);
    if (spike < rareExtremeRate) {
      unit = 0.92 + stableUnit(`${seed}:${key}:spike_value`) * 0.08;
    } else {
      unit = (stableUnit(`${seed}:${key}:body`) ** 1.35) * 0.72;
    }
    return minimum + (maximum - minimum) * clamp(unit, 0, 1);
  }
  const rare = stableUnit(`${seed}:${key}:rare`);
  if (rare < rareExtremeRate) {
    unit = stableUnit(`${seed}:${key}:side`) < 0.5 ? 0 : 1;
  } else {
    const first = stableUnit(`${seed}:${key}:a`);
    const second = stableUnit(`${seed}:${key}:b`);
    unit = (first + second) * 0.5;
  }
  return minimum + (maximum - minimum) * clamp(unit, 0, 1);
}

function assertProfile(profile) {
  if (!profile || typeof profile !== "object") {
    throw new TypeError("pet growth profile must be an object");
  }
  if (!String(profile.profileId || "").trim()) {
    throw new TypeError("pet growth profile requires profileId");
  }
  for (const key of STAT_KEYS) {
    if (!Number.isFinite(Number(profile.outputBase?.[key]))) {
      throw new TypeError(`pet growth profile outputBase.${key} must be numeric`);
    }
    if (!Number.isFinite(Number(profile.outputGrowth?.[key]))) {
      throw new TypeError(`pet growth profile outputGrowth.${key} must be numeric`);
    }
  }
}

function derivePrivateRoll(profile, privateSeed) {
  assertProfile(profile);
  const cleanSeed = String(privateSeed || "").trim();
  if (!cleanSeed) {
    throw new TypeError("pet growth privateSeed must be non-empty");
  }
  const profileId = String(profile.profileId);
  const rules = profile.individualRules && typeof profile.individualRules === "object"
    ? profile.individualRules
    : {};
  const initialSpread = rules.initialOutputSpread && typeof rules.initialOutputSpread === "object"
    ? rules.initialOutputSpread
    : {};
  const growthSpread = rules.growthOutputSpread && typeof rules.growthOutputSpread === "object"
    ? rules.growthOutputSpread
    : {};
  const distribution = String(rules.distribution || "weighted_center");
  const rareExtremeRate = clamp(Number(rules.rareExtremeRate || 0), 0, 0.25);
  const rollSeed = `${MODEL_VERSION}:${profileId}:${cleanSeed}`;
  const initialBonus = {};
  const innateGrowthBonus = {};
  for (const key of STAT_KEYS) {
    initialBonus[key] = roundHalfAwayFromZero(rollInRange(
      rollSeed,
      `initial:${key}`,
      normalizedRange(initialSpread, key, 0, 0),
      distribution,
      rareExtremeRate,
    ));
    innateGrowthBonus[key] = quantize(rollInRange(
      rollSeed,
      `innate_growth:${key}`,
      normalizedRange(growthSpread, key, 0, 0),
      distribution,
      rareExtremeRate,
    ));
  }
  return {
    "modelVersion": MODEL_VERSION,
    "profileId": profileId,
    initialBonus,
    innateGrowthBonus,
  };
}

function privateRollMatches(left, right) {
  if (!left || typeof left !== "object" || !right || typeof right !== "object") {
    return false;
  }
  const expectedTopLevelKeys = ["initialBonus", "innateGrowthBonus", "modelVersion", "profileId"];
  if (!hasExactKeys(left, expectedTopLevelKeys) || !hasExactKeys(right, expectedTopLevelKeys)) {
    return false;
  }
  if (left.modelVersion !== right.modelVersion || left.profileId !== right.profileId) {
    return false;
  }
  const expectedStatKeys = [...STAT_KEYS];
  if (
    !hasExactKeys(left.initialBonus, expectedStatKeys)
    || !hasExactKeys(left.innateGrowthBonus, expectedStatKeys)
  ) {
    return false;
  }
  for (const key of STAT_KEYS) {
    const initialValue = left.initialBonus[key];
    const growthValue = left.innateGrowthBonus[key];
    if (
      typeof initialValue !== "number"
      || !Number.isFinite(initialValue)
      || initialValue !== right.initialBonus[key]
    ) {
      return false;
    }
    if (
      typeof growthValue !== "number"
      || !Number.isFinite(growthValue)
      || growthValue !== right.innateGrowthBonus[key]
    ) {
      return false;
    }
  }
  return true;
}

function verifiedPrivateRoll(profile, privateSeed, candidate) {
  const derived = derivePrivateRoll(profile, privateSeed);
  if (candidate && !privateRollMatches(candidate, derived)) {
    throw new TypeError("pet growth private roll does not match private seed");
  }
  return derived;
}

function normalizedCultivation(cultivation) {
  const source = cultivation && typeof cultivation === "object" ? cultivation : {};
  const initialSource = source.initialBonus && typeof source.initialBonus === "object" ? source.initialBonus : {};
  const growthSource = source.growthBonus && typeof source.growthBonus === "object" ? source.growthBonus : {};
  const initialBonus = {};
  const growthBonus = {};
  for (const key of STAT_KEYS) {
    initialBonus[key] = quantize(Number(initialSource[key] || 0));
    growthBonus[key] = quantize(Number(growthSource[key] || 0));
  }
  return {initialBonus, growthBonus};
}

function levelNoise(profile, privateSeed, level, key) {
  const rules = profile.individualRules && typeof profile.individualRules === "object"
    ? profile.individualRules
    : {};
  const spread = rules.levelOutputNoiseSpread && typeof rules.levelOutputNoiseSpread === "object"
    ? rules.levelOutputNoiseSpread
    : {};
  const range = normalizedRange(spread, key, 0, 0);
  if (range.max <= range.min) {
    return quantize(range.min);
  }
  const distribution = String(rules.levelNoiseDistribution || rules.distribution || "weighted_center");
  const rareExtremeRate = clamp(Number(
    rules.levelNoiseRareExtremeRate ?? rules.rareExtremeRate ?? 0,
  ), 0, 0.25);
  const cleanSeed = String(privateSeed || "").trim();
  const seed = `${MODEL_VERSION}:${String(profile.profileId)}:${cleanSeed}`;
  return quantize(rollInRange(seed, `level:${level}:${key}`, range, distribution, rareExtremeRate));
}

function growthDeltaForLevel(profile, privateSeed, targetLevel, privateRoll = null, cultivation = null) {
  assertProfile(profile);
  const safeTargetLevel = clamp(Math.trunc(Number(targetLevel) || 1), 1, MAX_LEVEL);
  const roll = verifiedPrivateRoll(profile, privateSeed, privateRoll);
  const cultivated = normalizedCultivation(cultivation);
  return growthDeltaForLevelTrusted(profile, privateSeed, safeTargetLevel, roll, cultivated);
}

function growthDeltaForLevelTrusted(profile, privateSeed, safeTargetLevel, roll, cultivated) {
  const result = {};
  for (const key of STAT_KEYS) {
    result[key] = safeTargetLevel <= 1 ? 0 : quantize(
      Number(profile.outputGrowth[key])
      + Number(roll.innateGrowthBonus[key] || 0)
      + Number(cultivated.growthBonus[key] || 0)
      + levelNoise(profile, privateSeed, safeTargetLevel, key),
    );
  }
  return result;
}

function continuousStatsAtLevel(profile, privateSeed, level, privateRoll = null, cultivation = null) {
  assertProfile(profile);
  const safeLevel = clamp(Math.trunc(Number(level) || 1), 1, MAX_LEVEL);
  const roll = verifiedPrivateRoll(profile, privateSeed, privateRoll);
  const cultivated = normalizedCultivation(cultivation);
  const result = {};
  for (const key of STAT_KEYS) {
    result[key] = quantize(
      Number(profile.outputBase[key])
      + Number(roll.initialBonus[key] || 0)
      + Number(cultivated.initialBonus[key] || 0),
    );
  }
  for (let nextLevel = 2; nextLevel <= safeLevel; nextLevel += 1) {
    const delta = growthDeltaForLevelTrusted(profile, privateSeed, nextLevel, roll, cultivated);
    for (const key of STAT_KEYS) {
      result[key] = quantize(result[key] + Number(delta[key] || 0));
    }
  }
  return result;
}

function visibleStatsAtLevel(profile, privateSeed, level, privateRoll = null, cultivation = null) {
  const continuous = continuousStatsAtLevel(profile, privateSeed, level, privateRoll, cultivation);
  const result = {};
  for (const key of STAT_KEYS) {
    result[key] = Math.max(1, roundHalfAwayFromZero(continuous[key]));
  }
  return result;
}

function buildPublicSnapshot(profile, privateSeed, level, privateRoll = null, cultivation = null) {
  const roll = verifiedPrivateRoll(profile, privateSeed, privateRoll);
  const safeLevel = clamp(Math.trunc(Number(level) || 1), 1, MAX_LEVEL);
  return {
    "schemaVersion": PUBLIC_SNAPSHOT_SCHEMA_VERSION,
    "growthModelVersion": MODEL_VERSION,
    "growthSpeciesProfileId": String(profile.profileId),
    "level": safeLevel,
    "levelOneFourV": visibleStatsAtLevel(profile, privateSeed, 1, roll),
    "stats": visibleStatsAtLevel(profile, privateSeed, safeLevel, roll, cultivation),
  };
}

function buildPrivateSnapshot(profile, privateSeed, level, cultivation = null) {
  const privateRoll = derivePrivateRoll(profile, privateSeed);
  return {
    "modelVersion": MODEL_VERSION,
    "profileId": String(profile.profileId),
    "privateSeed": String(privateSeed || "").trim(),
    privateRoll,
    "continuousStats": continuousStatsAtLevel(profile, privateSeed, level, privateRoll, cultivation),
    "publicSnapshot": buildPublicSnapshot(profile, privateSeed, level, privateRoll, cultivation),
  };
}

module.exports = {
  INTERNAL_DECIMALS,
  MAX_LEVEL,
  MODEL_VERSION,
  PUBLIC_SNAPSHOT_SCHEMA_VERSION,
  STAT_KEYS,
  buildPrivateSnapshot,
  buildPublicSnapshot,
  continuousStatsAtLevel,
  derivePrivateRoll,
  growthDeltaForLevel,
  levelNoise,
  quantize,
  roundHalfAwayFromZero,
  stableUnit,
  visibleStatsAtLevel,
};
