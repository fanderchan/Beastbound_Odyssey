"use strict";

const {
  STAT_KEYS,
  roundHalfAwayFromZero,
} = require("./pet-growth-authority");

const PERCENTILE_SCHEMA_VERSION = 1;
const DISTRIBUTIONS = new Set(["uniform", "weighted_center", "rare_spike"]);
const MAX_ABSOLUTE_PROFILE_VALUE = 1_000_000;

function isObjectRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundTo(value, decimals = 1) {
  const factor = 10 ** Math.max(0, Math.trunc(decimals));
  return Math.round(Number(value) * factor) / factor;
}

function strictProfileFacts(profile, statKey) {
  if (!isObjectRecord(profile) || typeof profile.profileId !== "string" || profile.profileId.trim() === "") {
    throw new TypeError("Lv1 percentile requires a versioned species growth profile");
  }
  if (!STAT_KEYS.includes(statKey)) {
    throw new TypeError(`Lv1 percentile stat is unsupported: ${statKey}`);
  }
  const base = profile.outputBase && profile.outputBase[statKey];
  const rules = isObjectRecord(profile.individualRules) ? profile.individualRules : null;
  const rawRange = rules && rules.initialOutputSpread && rules.initialOutputSpread[statKey];
  const distribution = String(rules && rules.distribution || "weighted_center");
  const rareExtremeRate = rules && rules.rareExtremeRate;
  if (
    typeof base !== "number"
    || !Number.isFinite(base)
    || Math.abs(base) > MAX_ABSOLUTE_PROFILE_VALUE
    || !Array.isArray(rawRange)
    || rawRange.length !== 2
    || rawRange.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
    || rawRange.some((entry) => Math.abs(entry) > MAX_ABSOLUTE_PROFILE_VALUE)
    || rawRange[0] > rawRange[1]
    || !DISTRIBUTIONS.has(distribution)
    || typeof rareExtremeRate !== "number"
    || !Number.isFinite(rareExtremeRate)
    || rareExtremeRate < 0
    || rareExtremeRate > 0.25
  ) {
    throw new TypeError(`Lv1 percentile profile facts are invalid for ${profile.profileId}.${statKey}`);
  }
  return {
    profileId: profile.profileId,
    base,
    minimum: rawRange[0],
    maximum: rawRange[1],
    distribution,
    rareExtremeRate,
  };
}

function weightedCenterBodyCdf(unit) {
  if (unit <= 0) {
    return 0;
  }
  if (unit >= 1) {
    return 1;
  }
  return unit <= 0.5
    ? 2 * unit * unit
    : 1 - 2 * (1 - unit) * (1 - unit);
}

function rareSpikeBodyCdf(unit) {
  if (unit <= 0) {
    return 0;
  }
  if (unit >= 0.72) {
    return 1;
  }
  return Math.pow(unit / 0.72, 1 / 1.35);
}

function rareSpikeTailCdf(unit) {
  if (unit < 0.92) {
    return 0;
  }
  if (unit >= 1) {
    return 1;
  }
  return (unit - 0.92) / 0.08;
}

function distributionCdf(distribution, rareExtremeRate, unitValue) {
  const unit = Number(unitValue);
  if (!Number.isFinite(unit)) {
    throw new TypeError("Lv1 percentile distribution unit must be finite");
  }
  if (unit < 0) {
    return 0;
  }
  if (unit >= 1) {
    return 1;
  }
  if (distribution === "uniform") {
    return unit;
  }
  const rareRate = clamp(Number(rareExtremeRate), 0, 0.25);
  if (distribution === "rare_spike") {
    return ((1 - rareRate) * rareSpikeBodyCdf(unit))
      + (rareRate * rareSpikeTailCdf(unit));
  }
  if (distribution === "weighted_center") {
    // The authority roll puts half of rare extremes exactly at each endpoint.
    // At every non-negative cutoff the lower endpoint mass is already included;
    // the upper endpoint is included by the unit >= 1 branch above.
    return ((1 - rareRate) * weightedCenterBodyCdf(unit)) + (rareRate * 0.5);
  }
  throw new TypeError(`Lv1 percentile distribution is unsupported: ${distribution}`);
}

function roundedBonusCdf(facts, maximumRoundedBonus) {
  if (facts.maximum <= facts.minimum) {
    return maximumRoundedBonus >= roundHalfAwayFromZero(facts.minimum) ? 1 : 0;
  }
  const cutoff = (
    Number(maximumRoundedBonus) + 0.5 - facts.minimum
  ) / (facts.maximum - facts.minimum);
  return distributionCdf(facts.distribution, facts.rareExtremeRate, cutoff);
}

function visibleStatForRoundedBonus(base, roundedBonus) {
  return Math.max(1, roundHalfAwayFromZero(base + roundedBonus));
}

function levelOneStatPercentile(profile, statKey, visibleValue) {
  const facts = strictProfileFacts(profile, statKey);
  if (!Number.isSafeInteger(visibleValue) || visibleValue < 1) {
    throw new TypeError(`Lv1 percentile visible ${statKey} must be a positive integer`);
  }
  const firstBonus = Math.floor(facts.minimum) - 2;
  const lastBonus = Math.ceil(facts.maximum) + 2;
  let maximumAcceptedBonus = null;
  let lower = firstBonus;
  let upper = lastBonus;
  while (lower <= upper) {
    const bonus = Math.floor((lower + upper) / 2);
    if (visibleStatForRoundedBonus(facts.base, bonus) <= visibleValue) {
      maximumAcceptedBonus = bonus;
      lower = bonus + 1;
    } else {
      upper = bonus - 1;
    }
  }
  const percentile = maximumAcceptedBonus === null
    ? 0
    : roundedBonusCdf(facts, maximumAcceptedBonus) * 100;
  return roundTo(clamp(percentile, 0, 100), 1);
}

function readLevelOneStats(value) {
  if (!isObjectRecord(value)) {
    throw new TypeError("Lv1 percentile requires a four-stat public snapshot");
  }
  const stats = {};
  for (const key of STAT_KEYS) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 1) {
      throw new TypeError(`Lv1 percentile public snapshot has invalid ${key}`);
    }
    stats[key] = value[key];
  }
  return stats;
}

function levelOnePercentiles(profile, levelOneStats) {
  const stats = readLevelOneStats(levelOneStats);
  const percentiles = Object.fromEntries(STAT_KEYS.map((key) => [
    key,
    levelOneStatPercentile(profile, key, stats[key]),
  ]));
  return Object.freeze({
    schemaVersion: PERCENTILE_SCHEMA_VERSION,
    profileId: String(profile.profileId),
    levelOneFourV: Object.freeze({...stats}),
    statPercentiles: Object.freeze(percentiles),
  });
}

module.exports = Object.freeze({
  DISTRIBUTIONS,
  MAX_ABSOLUTE_PROFILE_VALUE,
  PERCENTILE_SCHEMA_VERSION,
  distributionCdf,
  levelOnePercentiles,
  levelOneStatPercentile,
});
