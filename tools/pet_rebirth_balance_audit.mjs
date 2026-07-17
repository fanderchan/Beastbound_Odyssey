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
const REPORT_PATH = path.join(ROOT, ".run/pet_rebirth_balance_audit.json");
const STAT_KEYS = Object.freeze(["maxHp", "attack", "defense", "quick"]);
const TARGET_LEVELS = Object.freeze([80, 110, 140]);
const FULL_STONES = Object.freeze({maxHp: 50, attack: 50, defense: 50, quick: 50});

function argumentValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index < 0 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
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

function allocateStage(balance, targetGrowth, helperGrowth, stage, targetLevel, percentile) {
  const targetInternal = internalGrowth(targetGrowth, balance);
  const helperWeights = helperWeightDistribution(helperGrowth, balance);
  const weights = {};
  let totalWeight = 0;
  for (const key of STAT_KEYS) {
    const weight = Math.max(0.05, targetInternal[key] * balance.allocation.targetGrowthWeight)
      + balance.allocation.stoneWeight
      + helperWeights[key] * balance.allocation.helperGrowthWeight;
    weights[key] = weight;
    totalWeight += weight;
  }
  const pool = petRebirthPoolInfo(balance, {
    stonePoints: FULL_STONES,
    stage,
    targetLevel,
    percentile,
  });
  const visibleBonus = {};
  for (const key of STAT_KEYS) {
    const internal = pool.pool * weights[key] / totalWeight;
    visibleBonus[key] = key === "maxHp" ? internal * balance.internalPower.maxHpScale : internal;
  }
  return {pool, visibleBonus};
}

function addGrowth(left, right) {
  return Object.fromEntries(STAT_KEYS.map((key) => [key, finite(left[key]) + finite(right[key])]));
}

function internalPower(visible, balance) {
  const internal = internalGrowth(visible, balance);
  return STAT_KEYS.reduce((sum, key) => sum + internal[key], 0);
}

function gradeFor(balance, percentile) {
  const value = Math.max(0, Math.min(100, finite(percentile)));
  const thresholds = balance.roll.gradeThresholds;
  if (value >= thresholds.S) return "S";
  if (value >= thresholds.A) return "A";
  if (value >= thresholds.B) return "B";
  if (value >= thresholds.C) return "C";
  return "D";
}

function summary(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const quantile = (ratio) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(ratio * sorted.length)))];
  return {
    min: round(sorted[0]),
    p05: round(quantile(0.05)),
    p50: round(quantile(0.5)),
    p95: round(quantile(0.95)),
    max: round(sorted.at(-1)),
    mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
  };
}

const sampleCount = Math.max(10000, Math.trunc(finite(argumentValue("--samples", 10000), 10000)));
const profileDocument = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf8"));
const allProfiles = Array.isArray(profileDocument.profiles) ? profileDocument.profiles : [];
const ordinaryProfiles = allProfiles.filter((profile) => (
  profile
  && typeof profile.profileId === "string"
  && !profile.profileId.startsWith("pet_rebirth_mm_")
  && profile.outputGrowth
));
const helpers = Object.fromEntries([1, 2].map((stage) => {
  const profile = allProfiles.find((entry) => entry.profileId === `pet_rebirth_mm_stage${stage}_v1`);
  return [stage, profile];
}));
const balance = loadPetRebirthBalance();
const errors = [];
if (ordinaryProfiles.length < 20) errors.push(`ordinary profile coverage too small: ${ordinaryProfiles.length}`);
if (!helpers[1] || !helpers[2]) errors.push("rebirth MM growth profiles are missing");

const levels = {};
let maximumConservationError = 0;
for (const targetLevel of TARGET_LEVELS) {
  const aggregatePower = [];
  const perSpecies = [];
  const stageGradeCounts = {
    1: {S: 0, A: 0, B: 0, C: 0, D: 0},
    2: {S: 0, A: 0, B: 0, C: 0, D: 0},
  };
  for (const profile of ordinaryProfiles) {
    const targetBaseGrowth = visibleGrowth(profile.outputGrowth);
    const combinedPower = [];
    const combinedStats = Object.fromEntries(STAT_KEYS.map((key) => [key, []]));
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const stageOnePercentile = (sample + 0.5) / sampleCount * 100;
      const stageTwoPercentile = ((sample * 7919) % sampleCount + 0.5) / sampleCount * 100;
      const stageOne = allocateStage(
        balance,
        targetBaseGrowth,
        visibleGrowth(helpers[1].outputGrowth),
        1,
        targetLevel,
        stageOnePercentile,
      );
      const afterStageOneGrowth = addGrowth(targetBaseGrowth, stageOne.visibleBonus);
      const stageTwo = allocateStage(
        balance,
        afterStageOneGrowth,
        visibleGrowth(helpers[2].outputGrowth),
        2,
        targetLevel,
        stageTwoPercentile,
      );
      const combinedBonus = addGrowth(stageOne.visibleBonus, stageTwo.visibleBonus);
      const power = internalPower(combinedBonus, balance);
      const expectedPower = stageOne.pool.pool + stageTwo.pool.pool;
      maximumConservationError = Math.max(maximumConservationError, Math.abs(power - expectedPower));
      combinedPower.push(power);
      aggregatePower.push(power);
      for (const key of STAT_KEYS) combinedStats[key].push(combinedBonus[key]);
      stageGradeCounts[1][gradeFor(balance, stageOnePercentile)] += 1;
      stageGradeCounts[2][gradeFor(balance, stageTwoPercentile)] += 1;
    }
    perSpecies.push({
      profileId: profile.profileId,
      formId: profile.formId,
      totalInternalPower: summary(combinedPower),
      visibleGrowthBonus: Object.fromEntries(STAT_KEYS.map((key) => [key, summary(combinedStats[key])])),
    });
  }
  levels[String(targetLevel)] = {
    targetPreparationMultiplier: round(
      petRebirthPoolInfo(balance, {stonePoints: FULL_STONES, stage: 1, targetLevel, percentile: 50})
        .targetPreparationMultiplier,
      3,
    ),
    totalInternalPower: summary(aggregatePower),
    stageGradeCounts,
    perSpecies,
  };
}

const expectedMeans = {80: 3.0, 110: 3.15, 140: 3.3};
for (const targetLevel of TARGET_LEVELS) {
  const actual = levels[String(targetLevel)].totalInternalPower.mean;
  if (Math.abs(actual - expectedMeans[targetLevel]) > 0.002) {
    errors.push(`Lv${targetLevel} mean ${actual} != ${expectedMeans[targetLevel]}`);
  }
}
if (levels["80"].targetPreparationMultiplier !== 1) errors.push("Lv80 must preserve the previous multiplier");
if (levels["140"].targetPreparationMultiplier !== 1.1) errors.push("Lv140 multiplier must remain capped at 1.10");
if (maximumConservationError > 1e-9) errors.push(`allocation does not conserve internal power: ${maximumConservationError}`);
for (const stage of [1, 2]) {
  const counts = levels["80"].stageGradeCounts[stage];
  const divisor = ordinaryProfiles.length;
  const expected = {D: 2500, C: 3000, B: 3000, A: 1000, S: 500};
  for (const [grade, count] of Object.entries(expected)) {
    if (counts[grade] / divisor !== count) {
      errors.push(`stage${stage} ${grade} distribution is ${counts[grade] / divisor}, expected ${count}`);
    }
  }
}

const report = {
  schemaVersion: 1,
  balanceVersion: balance.balanceVersion,
  sampleCountPerSpecies: sampleCount,
  ordinaryProfileCount: ordinaryProfiles.length,
  totalTwoStageSamples: sampleCount * ordinaryProfiles.length * TARGET_LEVELS.length,
  targetLevels: TARGET_LEVELS,
  stonePolicy: "four_full_stones_each_stage",
  percentilePolicy: "two_independent_stratified_uniform_rolls",
  maximumInternalPowerConservationError: maximumConservationError,
  levels,
  errors,
  ok: errors.length === 0,
};

fs.mkdirSync(path.dirname(REPORT_PATH), {recursive: true});
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(`pet rebirth balance audit: ${report.ok ? "ok" : "failed"} version=${balance.balanceVersion} profiles=${ordinaryProfiles.length} samples=${report.totalTwoStageSamples}`);
for (const targetLevel of TARGET_LEVELS) {
  const level = levels[String(targetLevel)];
  console.log(`Lv${targetLevel} multiplier=${level.targetPreparationMultiplier.toFixed(3)} two-stage=${level.totalInternalPower.min.toFixed(3)}..${level.totalInternalPower.max.toFixed(3)} mean=${level.totalInternalPower.mean.toFixed(3)}`);
}
console.log(`report=${path.relative(ROOT, REPORT_PATH)}`);
for (const error of errors) console.log(`ERROR ${error}`);
if (!report.ok) process.exitCode = 1;
