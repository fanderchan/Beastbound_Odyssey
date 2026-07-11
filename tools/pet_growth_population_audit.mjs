#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const {
  MAX_LEVEL,
  STAT_KEYS,
  derivePrivateRoll,
  levelNoise,
  quantize,
  roundHalfAwayFromZero,
} = require("../server/node/src/auth/pet-growth-authority.js");
const {loadPetGrowthCatalog} = require("../server/node/src/auth/pet-growth-catalog.js");

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE_PATH = path.join(
  REPOSITORY_ROOT,
  "client/godot/data/balance/pet_growth_species_profiles.json",
);
const DEFAULT_OUTPUT_PATH = path.join(REPOSITORY_ROOT, ".run/godot/pet_growth_population_audit.json");
const DEFAULT_SAMPLE_COUNT = 10000;
const OBSERVATION_LEVEL_MIN = 2;
const OBSERVATION_LEVEL_MAX = 140;
const PERCENTILES = Object.freeze([0, 25, 55, 85, 95, 100]);
const PERCENTILE_KEYS = Object.freeze(["min", "p25", "p55", "p85", "p95", "max"]);
const POWER_WEIGHTS = Object.freeze({maxHp: 0.25, attack: 1, defense: 1, quick: 1});

function parsePositiveInteger(raw, name, fallback) {
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}

function parseArgs(argv) {
  const options = {
    all: false,
    profileIds: [],
    samples: DEFAULT_SAMPLE_COUNT,
    outputPath: DEFAULT_OUTPUT_PATH,
    writeObservations: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--all") {
      options.all = true;
    } else if (arg === "--profiles") {
      options.profileIds = String(argv[++index] || "").split(",").map((value) => value.trim()).filter(Boolean);
    } else if (arg === "--samples") {
      options.samples = parsePositiveInteger(argv[++index], "--samples", DEFAULT_SAMPLE_COUNT);
    } else if (arg === "--output") {
      options.outputPath = path.resolve(REPOSITORY_ROOT, String(argv[++index] || ""));
    } else if (arg === "--write-observations") {
      options.writeObservations = true;
    } else {
      throw new TypeError(`unknown argument: ${arg}`);
    }
  }
  if (options.all === (options.profileIds.length > 0)) {
    throw new TypeError("choose exactly one of --all or --profiles <id,id>");
  }
  if (options.samples < 100) {
    throw new TypeError("--samples must be at least 100");
  }
  return options;
}

function percentileValue(sortedValues, percentile) {
  if (sortedValues.length === 0) {
    return 0;
  }
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }
  const target = Math.min(100, Math.max(0, percentile)) / 100 * (sortedValues.length - 1);
  const lower = Math.floor(target);
  const upper = Math.ceil(target);
  if (lower === upper) {
    return sortedValues[lower];
  }
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (target - lower);
}

function snapped(value, decimals = 3) {
  return quantize(value, decimals);
}

function visibleStats(continuous) {
  const result = {};
  for (const key of STAT_KEYS) {
    result[key] = Math.max(1, roundHalfAwayFromZero(continuous[key]));
  }
  return result;
}

function combatPower(stats) {
  let total = 0;
  for (const key of STAT_KEYS) {
    total += Number(stats[key] || 0) * POWER_WEIGHTS[key];
  }
  return roundHalfAwayFromZero(total);
}

function newSummary() {
  return {min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY, total: 0};
}

function collect(summary, value) {
  summary.min = Math.min(summary.min, value);
  summary.max = Math.max(summary.max, value);
  summary.total += value;
}

function finishSummary(summary, count, decimals = 3) {
  return {
    min: snapped(summary.min, decimals),
    max: snapped(summary.max, decimals),
    avg: snapped(summary.total / count, decimals),
  };
}

export function simulateProfile(profile, sampleCount = DEFAULT_SAMPLE_COUNT) {
  const safeSampleCount = parsePositiveInteger(sampleCount, "sampleCount", DEFAULT_SAMPLE_COUNT);
  if (safeSampleCount < 100) {
    throw new TypeError("sampleCount must be at least 100");
  }
  const powerGrowthByLevel = new Map();
  for (let level = OBSERVATION_LEVEL_MIN; level <= OBSERVATION_LEVEL_MAX; level += 1) {
    powerGrowthByLevel.set(level, []);
  }
  const lv1Summaries = Object.fromEntries(STAT_KEYS.map((key) => [key, newSummary()]));
  const lv140Summaries = Object.fromEntries(STAT_KEYS.map((key) => [key, newSummary()]));
  const growthSummaries = Object.fromEntries(STAT_KEYS.map((key) => [key, newSummary()]));
  const threeStatGrowthSummary = newSummary();
  const lv140PowerSummary = newSummary();

  for (let sampleIndex = 0; sampleIndex < safeSampleCount; sampleIndex += 1) {
    const privateSeed = `audit:${profile.profileId}:${String(sampleIndex + 1).padStart(6, "0")}`;
    const roll = derivePrivateRoll(profile, privateSeed);
    const continuous = {};
    for (const key of STAT_KEYS) {
      continuous[key] = quantize(Number(profile.outputBase[key]) + Number(roll.initialBonus[key] || 0));
    }
    const levelOne = visibleStats(continuous);
    const levelOnePower = combatPower(levelOne);
    for (const key of STAT_KEYS) {
      collect(lv1Summaries[key], levelOne[key]);
    }

    let levelStats = levelOne;
    for (let level = 2; level <= MAX_LEVEL; level += 1) {
      for (const key of STAT_KEYS) {
        const delta = quantize(
          Number(profile.outputGrowth[key])
          + Number(roll.innateGrowthBonus[key] || 0)
          + levelNoise(profile, privateSeed, level, key),
        );
        continuous[key] = quantize(continuous[key] + delta);
      }
      levelStats = visibleStats(continuous);
      const powerGrowth = (combatPower(levelStats) - levelOnePower) / (level - 1);
      powerGrowthByLevel.get(level).push(powerGrowth);
    }

    for (const key of STAT_KEYS) {
      collect(lv140Summaries[key], levelStats[key]);
      collect(growthSummaries[key], (levelStats[key] - levelOne[key]) / (MAX_LEVEL - 1));
    }
    collect(
      threeStatGrowthSummary,
      (levelStats.attack - levelOne.attack + levelStats.defense - levelOne.defense
        + levelStats.quick - levelOne.quick) / (MAX_LEVEL - 1),
    );
    collect(lv140PowerSummary, combatPower(levelStats));
  }

  const thresholdsByLevel = {};
  for (const [level, values] of powerGrowthByLevel.entries()) {
    values.sort((left, right) => left - right);
    thresholdsByLevel[String(level)] = Object.fromEntries(PERCENTILES.map((percentile, index) => [
      PERCENTILE_KEYS[index],
      snapped(percentileValue(values, percentile)),
    ]));
  }
  const lv1 = Object.fromEntries(STAT_KEYS.map((key) => [key, finishSummary(lv1Summaries[key], safeSampleCount, 2)]));
  const lv140 = Object.fromEntries(STAT_KEYS.map((key) => [key, finishSummary(lv140Summaries[key], safeSampleCount, 2)]));
  const perLevelGrowth = Object.fromEntries(STAT_KEYS.map((key) => [
    key,
    finishSummary(growthSummaries[key], safeSampleCount),
  ]));
  const observation = {
    sampleCount: safeSampleCount,
    levelMin: OBSERVATION_LEVEL_MIN,
    levelMax: OBSERVATION_LEVEL_MAX,
    thresholdMetric: "powerGrowthPerLevel",
    gradeThresholds: {S: 95, A: 85, B: 55, C: 25, D: 0},
    powerGrowthPercentilesByLevel: thresholdsByLevel,
  };
  return {
    profileId: profile.profileId,
    formId: profile.formId,
    sampleCount: safeSampleCount,
    lv1,
    perLevelGrowth,
    threeStatGrowthPerLevel: finishSummary(threeStatGrowthSummary, safeSampleCount),
    lv140: {...lv140, combatPower: finishSummary(lv140PowerSummary, safeSampleCount, 2)},
    observation,
  };
}

function rangeContains(range, minimum, maximum) {
  const roundingTolerance = 0.01;
  return Array.isArray(range) && range.length === 2
    && Number(range[0]) - roundingTolerance <= minimum
    && Number(range[1]) + roundingTolerance >= maximum;
}

function validateSimulation(profile, result) {
  const errors = [];
  const target = profile.targetAudit && typeof profile.targetAudit === "object" ? profile.targetAudit : {};
  if (Object.keys(result.observation.powerGrowthPercentilesByLevel).length !== 139) {
    errors.push("observation threshold level count must be 139");
  }
  if (!rangeContains(target.threeStatGrowthBand, result.threeStatGrowthPerLevel.min, result.threeStatGrowthPerLevel.max)) {
    errors.push("three-stat growth sample range exceeds targetAudit.threeStatGrowthBand");
  }
  if (!rangeContains(target.hpGrowthBand, result.perLevelGrowth.maxHp.min, result.perLevelGrowth.maxHp.max)) {
    errors.push("HP growth sample range exceeds targetAudit.hpGrowthBand");
  }
  const powerAverage = result.lv140.combatPower.avg;
  if (!Array.isArray(target.lv140PowerBand) || powerAverage < target.lv140PowerBand[0] || powerAverage > target.lv140PowerBand[1]) {
    errors.push("Lv140 average combat power is outside targetAudit.lv140PowerBand");
  }
  return errors;
}

function writeJson(outputPath, value) {
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function updateEmbeddedObservations(results) {
  const document = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf8"));
  const resultByProfileId = new Map(results.map((result) => [result.profileId, result]));
  for (const profile of document.profiles) {
    const result = resultByProfileId.get(profile.profileId);
    if (result) {
      profile.growthObservation = result.observation;
    }
  }
  writeJson(PROFILE_PATH, document);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const catalog = loadPetGrowthCatalog();
  const profileDocument = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf8"));
  const rawProfileById = new Map(profileDocument.profiles.map((profile) => [profile.profileId, profile]));
  const profileIds = options.all
    ? profileDocument.profiles.map((profile) => profile.profileId)
    : options.profileIds;
  const reports = [];
  const errors = [];
  for (const profileId of profileIds) {
    const strictProfile = catalog.profileById(profileId);
    const profile = rawProfileById.get(profileId);
    if (!strictProfile || !profile) {
      errors.push(`${profileId}: profile not found in strict catalog`);
      continue;
    }
    const result = simulateProfile(profile, options.samples);
    const profileErrors = validateSimulation(profile, result);
    reports.push({...result, errors: profileErrors});
    errors.push(...profileErrors.map((error) => `${profileId}: ${error}`));
    process.stdout.write(
      `${profileId}: samples=${options.samples} lv1_hp=${result.lv1.maxHp.min}-${result.lv1.maxHp.max}`
      + ` three_growth=${result.threeStatGrowthPerLevel.min}-${result.threeStatGrowthPerLevel.max}`
      + ` lv140_power=${result.lv140.combatPower.min}-${result.lv140.combatPower.max}`
      + ` avg=${result.lv140.combatPower.avg} errors=${profileErrors.length}\n`,
    );
  }
  const report = {
    schemaVersion: 1,
    mode: "pet_growth_authority_population_audit",
    modelVersion: "pet_growth_authority_v1",
    sampleCountPerProfile: options.samples,
    profileCount: reports.length,
    reports,
    errors,
  };
  writeJson(options.outputPath, report);
  if (options.writeObservations && errors.length === 0) {
    updateEmbeddedObservations(reports);
  }
  process.stdout.write(`report=${options.outputPath} status=${errors.length === 0 ? "ok" : "failed"}\n`);
  process.exitCode = errors.length === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
