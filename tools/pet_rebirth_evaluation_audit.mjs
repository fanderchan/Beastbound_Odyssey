#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

const require = createRequire(import.meta.url);
const {
  loadPetRebirthBalance,
  petRebirthPoolInfo,
} = require("../server/node/src/auth/pet-rebirth-balance");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE_PATH = path.join(ROOT, "client/godot/data/balance/pet_growth_species_profiles.json");
const REPORT_PATH = path.join(ROOT, ".run/pet_rebirth_evaluation_audit.json");
const STAT_KEYS = Object.freeze(["maxHp", "attack", "defense", "quick"]);
const THRESHOLD_KEYS = Object.freeze(["min", "p25", "p55", "p85", "p95", "max"]);
const THRESHOLD_PERCENTILES = Object.freeze([0, 25, 55, 85, 95, 100]);
const DEFAULT_REFERENCE_LEVEL = 140;
const DEFAULT_STONE_POINTS = 50;
const DEFAULT_SAMPLE_COUNT = 10000;
const STAGE_TWO_PERMUTATION = 7919;

function argumentValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index < 0 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 6) {
  const scale = 10 ** digits;
  return Math.round(finite(value) * scale) / scale;
}

function visibleGrowth(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(STAT_KEYS.map((key) => [key, finite(source[key])]));
}

function internalGrowth(visible, balance) {
  return {
    maxHp: finite(visible.maxHp) / balance.internalPower.maxHpScale,
    attack: finite(visible.attack),
    defense: finite(visible.defense),
    quick: finite(visible.quick),
  };
}

function helperWeightDistribution(helperGrowth, balance) {
  const internal = internalGrowth(helperGrowth, balance);
  const total = STAT_KEYS.reduce((sum, key) => sum + Math.max(0.001, finite(internal[key])), 0);
  return Object.fromEntries(STAT_KEYS.map((key) => [
    key,
    Math.max(0.001, finite(internal[key])) / total * STAT_KEYS.length,
  ]));
}

function allocateStage(balance, targetGrowth, helperGrowth, stonePoints, stage, targetLevel, percentile) {
  const targetInternal = internalGrowth(targetGrowth, balance);
  const helperWeights = helperWeightDistribution(helperGrowth, balance);
  const weights = {};
  let totalWeight = 0;
  for (const key of STAT_KEYS) {
    const stoneRatio = finite(stonePoints[key]) / balance.stone.capacityPerStat;
    const weight = Math.max(0.05, targetInternal[key] * balance.allocation.targetGrowthWeight)
      + stoneRatio * balance.allocation.stoneWeight
      + helperWeights[key] * balance.allocation.helperGrowthWeight;
    weights[key] = weight;
    totalWeight += weight;
  }
  const pool = petRebirthPoolInfo(balance, {stonePoints, stage, targetLevel, percentile});
  const internalBonus = {};
  const visibleBonus = {};
  for (const key of STAT_KEYS) {
    const internal = pool.pool * weights[key] / totalWeight;
    internalBonus[key] = internal;
    visibleBonus[key] = key === "maxHp" ? internal * balance.internalPower.maxHpScale : internal;
  }
  return {pool, internalBonus, visibleBonus};
}

function addGrowth(left, right) {
  return Object.fromEntries(STAT_KEYS.map((key) => [key, finite(left[key]) + finite(right[key])]));
}

function createSeries(length) {
  return {
    power: new Float64Array(length),
    stats: Object.fromEntries(STAT_KEYS.map((key) => [key, new Float64Array(length)])),
  };
}

function thresholdTable(values) {
  values.sort();
  const result = {};
  for (let index = 0; index < THRESHOLD_KEYS.length; index += 1) {
    const target = THRESHOLD_PERCENTILES[index] / 100 * (values.length - 1);
    const lower = Math.floor(target);
    const upper = Math.ceil(target);
    const lowerValue = values[lower];
    const upperValue = values[upper];
    const value = lower === upper
      ? lowerValue
      : lowerValue + (upperValue - lowerValue) * (target - lower);
    result[THRESHOLD_KEYS[index]] = round(value);
  }
  return result;
}

function thresholdSeries(series) {
  return {
    power: thresholdTable(series.power),
    stats: Object.fromEntries(STAT_KEYS.map((key) => [key, thresholdTable(series.stats[key])])),
  };
}

function gradeForThresholds(value, thresholds) {
  if (value >= thresholds.p95) return "S";
  if (value >= thresholds.p85) return "A";
  if (value >= thresholds.p55) return "B";
  if (value >= thresholds.p25) return "C";
  return "D";
}

function gradeCounts(values, thresholds) {
  const counts = {S: 0, A: 0, B: 0, C: 0, D: 0};
  for (const value of values) counts[gradeForThresholds(value, thresholds)] += 1;
  return counts;
}

function compareThresholdTable(actual, expected, pathLabel, errors, tolerance = 0.000002) {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    errors.push(`${pathLabel} is missing`);
    return;
  }
  for (const key of THRESHOLD_KEYS) {
    const difference = Math.abs(finite(actual[key], Number.NaN) - finite(expected[key], Number.NaN));
    if (!Number.isFinite(difference) || difference > tolerance) {
      errors.push(`${pathLabel}.${key}=${actual[key]} expected=${expected[key]}`);
    }
  }
}

function compareThresholdSeries(actual, expected, pathLabel, errors) {
  compareThresholdTable(actual && actual.power, expected.power, `${pathLabel}.power`, errors);
  for (const key of STAT_KEYS) {
    compareThresholdTable(actual && actual.stats && actual.stats[key], expected.stats[key], `${pathLabel}.stats.${key}`, errors);
  }
}

const balance = loadPetRebirthBalance();
const configuredEvaluation = balance.evaluation || null;
const configuredReference = configuredEvaluation && configuredEvaluation.reference || {};
const targetLevel = Math.trunc(finite(configuredReference.targetLevel, DEFAULT_REFERENCE_LEVEL));
const stonePointsPerStat = Math.trunc(finite(configuredReference.stonePointsPerStat, DEFAULT_STONE_POINTS));
const sampleCount = Math.max(
  DEFAULT_SAMPLE_COUNT,
  Math.trunc(finite(argumentValue("--samples", configuredReference.samplesPerProfile || DEFAULT_SAMPLE_COUNT), DEFAULT_SAMPLE_COUNT)),
);
const stonePoints = Object.freeze(Object.fromEntries(STAT_KEYS.map((key) => [key, stonePointsPerStat])));

const profileDocument = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf8"));
const allProfiles = Array.isArray(profileDocument.profiles) ? profileDocument.profiles : [];
const ordinaryProfiles = allProfiles.filter((profile) => (
  profile
  && typeof profile.profileId === "string"
  && !profile.profileId.startsWith("pet_rebirth_mm_")
  && profile.outputGrowth
));
const helpers = Object.fromEntries([1, 2].map((stage) => [
  stage,
  allProfiles.find((entry) => entry.profileId === `pet_rebirth_mm_stage${stage}_v1`),
]));
const errors = [];
if (ordinaryProfiles.length < 20) errors.push(`ordinary profile coverage too small: ${ordinaryProfiles.length}`);
if (!helpers[1] || !helpers[2]) errors.push("rebirth MM growth profiles are missing");
if (targetLevel !== balance.target.fullPreparationLevel) errors.push("evaluation reference must use the full-preparation level");
if (stonePointsPerStat !== balance.stone.capacityPerStat) errors.push("evaluation reference must use full stones");

const totalSamples = ordinaryProfiles.length * sampleCount;
const stageOneSeries = createSeries(totalSamples);
const stageTwoSeries = createSeries(totalSamples);
const terminalSeries = createSeries(totalSamples);
let maximumConservationError = 0;
let cursor = 0;
for (const profile of ordinaryProfiles) {
  const targetBaseGrowth = visibleGrowth(profile.outputGrowth);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const stageOnePercentile = (sample + 0.5) / sampleCount * 100;
    const stageTwoPercentile = ((sample * STAGE_TWO_PERMUTATION) % sampleCount + 0.5) / sampleCount * 100;
    const stageOne = allocateStage(
      balance,
      targetBaseGrowth,
      visibleGrowth(helpers[1].outputGrowth),
      stonePoints,
      1,
      targetLevel,
      stageOnePercentile,
    );
    const afterStageOneGrowth = addGrowth(targetBaseGrowth, stageOne.visibleBonus);
    const stageTwo = allocateStage(
      balance,
      afterStageOneGrowth,
      visibleGrowth(helpers[2].outputGrowth),
      stonePoints,
      2,
      targetLevel,
      stageTwoPercentile,
    );
    const terminalPower = stageOne.pool.pool + stageTwo.pool.pool;
    stageOneSeries.power[cursor] = stageOne.pool.pool;
    stageTwoSeries.power[cursor] = stageTwo.pool.pool;
    terminalSeries.power[cursor] = terminalPower;
    let allocatedTerminalPower = 0;
    for (const key of STAT_KEYS) {
      const terminalStat = stageOne.internalBonus[key] + stageTwo.internalBonus[key];
      stageOneSeries.stats[key][cursor] = stageOne.internalBonus[key];
      stageTwoSeries.stats[key][cursor] = stageTwo.internalBonus[key];
      terminalSeries.stats[key][cursor] = terminalStat;
      allocatedTerminalPower += terminalStat;
    }
    maximumConservationError = Math.max(
      maximumConservationError,
      Math.abs(allocatedTerminalPower - terminalPower),
    );
    cursor += 1;
  }
}

const derivedEvaluation = {
  reference: {
    targetLevel,
    stonePointsPerStat,
    profileSelector: "all_non_mm_growth_profiles",
    profileCount: ordinaryProfiles.length,
    samplesPerProfile: sampleCount,
    stageRolls: "independent_uniform_percentile",
  },
  stageThresholds: {
    "1": thresholdSeries(stageOneSeries),
    "2": thresholdSeries(stageTwoSeries),
  },
  terminalTwoStageThresholds: thresholdSeries(terminalSeries),
};

if (!configuredEvaluation) {
  if (!hasFlag("--suggest")) errors.push("pet rebirth evaluation config is missing");
} else {
  if (configuredReference.profileSelector !== derivedEvaluation.reference.profileSelector) {
    errors.push("evaluation reference profileSelector is invalid");
  }
  if (Number(configuredReference.profileCount) !== ordinaryProfiles.length) {
    errors.push(`evaluation reference profileCount=${configuredReference.profileCount} actual=${ordinaryProfiles.length}`);
  }
  if (Number(configuredReference.samplesPerProfile) !== sampleCount) {
    errors.push(`evaluation reference samplesPerProfile=${configuredReference.samplesPerProfile} actual=${sampleCount}`);
  }
  for (const stage of [1, 2]) {
    compareThresholdSeries(
      configuredEvaluation.stageThresholds && configuredEvaluation.stageThresholds[String(stage)],
      derivedEvaluation.stageThresholds[String(stage)],
      `evaluation.stageThresholds.${stage}`,
      errors,
    );
  }
  compareThresholdSeries(
    configuredEvaluation.terminalTwoStageThresholds,
    derivedEvaluation.terminalTwoStageThresholds,
    "evaluation.terminalTwoStageThresholds",
    errors,
  );
}
if (maximumConservationError > 1e-9) {
  errors.push(`allocation does not conserve internal power: ${maximumConservationError}`);
}

const gradeDistributions = {
  stage1: gradeCounts(stageOneSeries.power, derivedEvaluation.stageThresholds["1"].power),
  stage2: gradeCounts(stageTwoSeries.power, derivedEvaluation.stageThresholds["2"].power),
  terminalTwoStage: gradeCounts(terminalSeries.power, derivedEvaluation.terminalTwoStageThresholds.power),
};
const expectedGradeRates = {S: 0.05, A: 0.10, B: 0.30, C: 0.30, D: 0.25};
for (const [seriesName, counts] of Object.entries(gradeDistributions)) {
  for (const [grade, expectedRate] of Object.entries(expectedGradeRates)) {
    const actualRate = counts[grade] / totalSamples;
    if (Math.abs(actualRate - expectedRate) > 0.01) {
      errors.push(`${seriesName} ${grade} rate=${round(actualRate, 4)} expected=${expectedRate}`);
    }
  }
}
const report = {
  schemaVersion: 1,
  balanceVersion: balance.balanceVersion,
  totalSamples,
  maximumInternalPowerConservationError: maximumConservationError,
  derivedEvaluation,
  gradeDistributions,
  errors,
  ok: errors.length === 0,
};

fs.mkdirSync(path.dirname(REPORT_PATH), {recursive: true});
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(`pet rebirth evaluation audit: ${report.ok ? "ok" : "failed"} profiles=${ordinaryProfiles.length} samples=${totalSamples}`);
console.log(`stage1=${JSON.stringify(derivedEvaluation.stageThresholds["1"].power)}`);
console.log(`stage2=${JSON.stringify(derivedEvaluation.stageThresholds["2"].power)}`);
console.log(`terminal=${JSON.stringify(derivedEvaluation.terminalTwoStageThresholds.power)}`);
console.log(`report=${path.relative(ROOT, REPORT_PATH)}`);
if (hasFlag("--suggest")) console.log(JSON.stringify(derivedEvaluation, null, 2));
for (const error of errors) console.log(`ERROR ${error}`);
if (!report.ok) process.exitCode = 1;
