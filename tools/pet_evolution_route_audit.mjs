#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

const require = createRequire(import.meta.url);
const {derivePrivateRoll, quantize} = require("../server/node/src/auth/pet-growth-authority");
const {loadPetEvolutionRouteCatalog} = require("../server/node/src/auth/pet-evolution-route-catalog");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE_PATH = path.join(ROOT, "client/godot/data/balance/pet_growth_species_profiles.json");
const DEFAULT_REPORT_PATH = path.join(ROOT, ".run/pet_evolution_route_audit.json");
const DEFAULT_SAMPLE_COUNT = 10_000;
const STAT_KEYS = Object.freeze(["maxHp", "attack", "defense", "quick"]);
const STAT_WEIGHTS = Object.freeze({maxHp: 0.25, attack: 1, defense: 1, quick: 1});
const PERCENTILES = Object.freeze([0, 25, 55, 85, 95, 100]);
const PERCENTILE_KEYS = Object.freeze(["min", "p25", "p55", "p85", "p95", "max"]);
const TOLERANCE = 0.001;

function argumentValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : fallback;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 100 ? number : fallback;
}

function round(value, digits = 6) {
  const scale = 10 ** digits;
  return Math.round(Number(value || 0) * scale) / scale;
}

function percentile(sorted, percentileValue) {
  if (sorted.length <= 1) return sorted[0] || 0;
  const position = Math.max(0, Math.min(100, percentileValue)) / 100 * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function thresholds(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return Object.fromEntries(PERCENTILES.map((entry, index) => [PERCENTILE_KEYS[index], round(percentile(sorted, entry))]));
}

function rankedValues(samples, selector) {
  const ranked = samples.map((sample, sampleIndex) => ({sampleIndex, value: Number(selector(sample) || 0)}));
  ranked.sort((left, right) => left.value - right.value || left.sampleIndex - right.sampleIndex);
  const rankBySample = new Int32Array(samples.length);
  ranked.forEach((entry, rank) => {
    rankBySample[entry.sampleIndex] = rank;
  });
  return {
    rankBySample,
    sortedValues: ranked.map((entry) => entry.value),
  };
}

function sampleRolls(profile, routeId, kind, sampleCount) {
  return Array.from({length: sampleCount}, (_, index) => derivePrivateRoll(
    profile,
    `evolution-route-audit:${routeId}:${kind}:${String(index + 1).padStart(6, "0")}`,
  ));
}

function internalPower(stats) {
  return STAT_KEYS.reduce((total, key) => total + Number(stats[key] || 0) * STAT_WEIGHTS[key], 0);
}

function positiveHalfRange(profile, field, key) {
  const range = profile.individualRules[field][key];
  return Math.max(Math.abs(Number(range[0] || 0)), Math.abs(Number(range[1] || 0)));
}

function auditRoute(route, sourceProfile, targetProfile, balance, sampleCount) {
  const sourceRolls = sampleRolls(sourceProfile, route.routeId, "source", sampleCount);
  const sourceInitialRanks = {};
  const sourceGrowthRanks = {};
  const mappedInitialValues = {};
  const mappedGrowthValues = {};
  const mappedInitialRanks = {};
  const mappedGrowthRanks = {};
  for (const key of STAT_KEYS) {
    sourceInitialRanks[key] = rankedValues(sourceRolls, (roll) => roll.initialBonus[key]);
    sourceGrowthRanks[key] = rankedValues(sourceRolls, (roll) => roll.innateGrowthBonus[key]);
    const sourceInitialHalf = positiveHalfRange(sourceProfile, "initialOutputSpread", key);
    const targetInitialHalf = positiveHalfRange(targetProfile, "initialOutputSpread", key);
    const sourceGrowthHalf = positiveHalfRange(sourceProfile, "growthOutputSpread", key);
    const targetGrowthHalf = positiveHalfRange(targetProfile, "growthOutputSpread", key);
    mappedInitialValues[key] = sourceRolls.map((roll) => quantize(
      Number(roll.initialBonus[key] || 0) * targetInitialHalf / sourceInitialHalf,
    ));
    mappedGrowthValues[key] = sourceRolls.map((roll) => quantize(
      Number(roll.innateGrowthBonus[key] || 0) * targetGrowthHalf / sourceGrowthHalf,
    ));
    mappedInitialRanks[key] = rankedValues(mappedInitialValues[key], (value) => value);
    mappedGrowthRanks[key] = rankedValues(mappedGrowthValues[key], (value) => value);
  }

  const initialPowerDrifts = [];
  const intrinsicUplifts = [];
  let maximumInitialRankDrift = 0;
  let maximumGrowthRankDrift = 0;
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const sourceInitial = {};
    const targetInitial = {};
    let uplift = 0;
    for (const key of STAT_KEYS) {
      const sourceInitialBonus = Number(sourceRolls[sampleIndex].initialBonus[key] || 0);
      const sourceGrowthBonus = Number(sourceRolls[sampleIndex].innateGrowthBonus[key] || 0);
      const targetInitialBonus = Number(mappedInitialValues[key][sampleIndex] || 0);
      const targetGrowthBonus = Number(mappedGrowthValues[key][sampleIndex] || 0);
      sourceInitial[key] = quantize(Number(sourceProfile.outputBase[key]) + sourceInitialBonus);
      targetInitial[key] = quantize(Number(targetProfile.outputBase[key]) + targetInitialBonus);
      uplift += (
        Number(targetProfile.outputGrowth[key]) + targetGrowthBonus
        - Number(sourceProfile.outputGrowth[key]) - sourceGrowthBonus
      ) * STAT_WEIGHTS[key];
      maximumInitialRankDrift = Math.max(
        maximumInitialRankDrift,
        Math.abs(sourceInitialRanks[key].rankBySample[sampleIndex] - mappedInitialRanks[key].rankBySample[sampleIndex]),
      );
      maximumGrowthRankDrift = Math.max(
        maximumGrowthRankDrift,
        Math.abs(sourceGrowthRanks[key].rankBySample[sampleIndex] - mappedGrowthRanks[key].rankBySample[sampleIndex]),
      );
    }
    initialPowerDrifts.push(round(internalPower(targetInitial) - internalPower(sourceInitial)));
    intrinsicUplifts.push(round(uplift));
  }

  const initialPowerDrift = thresholds(initialPowerDrifts);
  const uplift = thresholds(intrinsicUplifts);
  const budget = balance.powerBudget.intrinsicUpliftInternalPower;
  const errors = [];
  if (maximumInitialRankDrift !== 0 || maximumGrowthRankDrift !== 0) errors.push("per-stat rank projection drifted");
  if (Math.abs(initialPowerDrift.min) > TOLERANCE || Math.abs(initialPowerDrift.max) > TOLERANCE) {
    errors.push(`Lv1 internal power drift ${initialPowerDrift.min}..${initialPowerDrift.max}`);
  }
  if (uplift.min < Number(budget.min) - TOLERANCE || uplift.max > Number(budget.max) + TOLERANCE) {
    errors.push(`intrinsic uplift ${uplift.min}..${uplift.max} exceeds ${budget.min}..${budget.max}`);
  }
  if (uplift.p55 < Number(budget.p25) || uplift.p55 > Number(budget.p85)) {
    errors.push(`intrinsic uplift p55 ${uplift.p55} is outside the approved center band`);
  }
  if (route.effort.deterministicVictories !== 20) errors.push("deterministic victory count must equal 20");
  if (route.effort.normalizedRepeatableEffort !== 150 || route.effort.normalizedFirstUnlockEffort !== 170) {
    errors.push("normalized effort does not match the approved 1.50x/1.70x contract");
  }
  return {
    routeId: route.routeId,
    sourceFormId: route.sourceFormId,
    targetFormId: route.targetFormId,
    sampleCount,
    projection: {
      method: "empirical_per_stat_rank_projection",
      maximumLv1RankDrift: maximumInitialRankDrift,
      maximumHiddenGrowthRankDrift: maximumGrowthRankDrift,
      lv1InternalPowerDrift: initialPowerDrift,
      intrinsicGrowthUplift: uplift,
    },
    acquisition: {
      sharedCoreVictories: route.effort.sharedCoreVictories,
      lineageVictories: route.effort.lineageVictories,
      deterministicVictories: route.effort.deterministicVictories,
      stoneCoins: route.cost.stoneCoins,
      repeatableEffortRatio: route.effort.normalizedRepeatableEffort / 100,
      firstUnlockEffortRatio: route.effort.normalizedFirstUnlockEffort / 100,
      materialDropRandomness: false,
    },
    errors,
  };
}

const sampleCount = positiveInteger(argumentValue("--samples", DEFAULT_SAMPLE_COUNT), DEFAULT_SAMPLE_COUNT);
const reportPath = path.resolve(ROOT, argumentValue("--output", DEFAULT_REPORT_PATH));
const routeCatalog = loadPetEvolutionRouteCatalog();
const profileDocument = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf8"));
const profilesById = new Map(profileDocument.profiles.map((profile) => [profile.profileId, profile]));
const reports = routeCatalog.routes.map((route) => auditRoute(
  route,
  profilesById.get(route.sourceGrowthProfileId),
  profilesById.get(route.targetGrowthProfileId),
  require("../server/node/src/auth/pet-evolution-balance").loadPetEvolutionBalance(),
  sampleCount,
));
const errors = reports.flatMap((report) => report.errors.map((error) => `${report.routeId}: ${error}`));
const output = {
  schemaVersion: 1,
  mode: "pet_evolution_route_rank_projection_audit",
  catalogId: routeCatalog.catalogId,
  runtimeEnabled: routeCatalog.runtimeEnabled,
  sampleCountPerRoute: sampleCount,
  routeCount: reports.length,
  reports,
  errors,
  ok: errors.length === 0,
};
fs.mkdirSync(path.dirname(reportPath), {recursive: true});
fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`);
for (const report of reports) {
  const uplift = report.projection.intrinsicGrowthUplift;
  const rankDrift = Math.max(
    report.projection.maximumLv1RankDrift,
    report.projection.maximumHiddenGrowthRankDrift,
  );
  console.log(`${report.routeId}: samples=${sampleCount} rankDrift=${rankDrift} uplift=${uplift.min}..${uplift.max} p55=${uplift.p55} clears=${report.acquisition.deterministicVictories} errors=${report.errors.length}`);
}
console.log(`pet evolution route audit: ${output.ok ? "ok" : "failed"} report=${path.relative(ROOT, reportPath)}`);
if (!output.ok) process.exitCode = 1;
