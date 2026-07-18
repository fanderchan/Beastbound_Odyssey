#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

const require = createRequire(import.meta.url);
const {
  buildPublicSnapshot,
  derivePrivateRoll,
  quantize,
} = require("../server/node/src/auth/pet-growth-authority");
const {
  loadPetRebirthBalance,
  petRebirthPoolInfo,
} = require("../server/node/src/auth/pet-rebirth-balance");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE_PATH = path.join(ROOT, "client/godot/data/balance/pet_growth_species_profiles.json");
const ROUTE_PATH = path.join(ROOT, "client/godot/data/pet_evolution_routes.json");
const REPORT_PATH = path.join(ROOT, ".run/pet_evolution_eligibility_audit.json");
const STAT_KEYS = Object.freeze(["maxHp", "attack", "defense", "quick"]);
const DEFAULT_SAMPLE_COUNT = 10_000;
const TARGET_PERCENTILE = 90;
const TARGET_LEVEL = 140;
const HELPER_LEVEL = 79;
const PERCENTILE_PERMUTATION = 7919;

function argumentValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : fallback;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function deterministicPrivateSeed(namespace, sample) {
  const digest = crypto.createHash("sha256")
    .update(`beastbound-evolution-eligibility-v1:${namespace}:${sample}`)
    .digest("base64url");
  return `bps1_${digest}`;
}

function visibleGrowth(snapshot) {
  const levels = Math.max(1, finite(snapshot.level, 1) - 1);
  return Object.fromEntries(STAT_KEYS.map((key) => [
    key,
    (finite(snapshot.stats && snapshot.stats[key]) - finite(snapshot.levelOneFourV && snapshot.levelOneFourV[key])) / levels,
  ]));
}

function internalGrowth(visible, hpScale) {
  return {
    maxHp: finite(visible.maxHp) / hpScale,
    attack: finite(visible.attack),
    defense: finite(visible.defense),
    quick: finite(visible.quick),
  };
}

function helperWeights(snapshot, hpScale) {
  const internal = internalGrowth(visibleGrowth(snapshot), hpScale);
  const total = STAT_KEYS.reduce((sum, key) => sum + Math.max(0.001, finite(internal[key])), 0);
  return Object.fromEntries(STAT_KEYS.map((key) => [
    key,
    Math.max(0.001, finite(internal[key])) / total * STAT_KEYS.length,
  ]));
}

function stageOneBonus(balance, targetSnapshot, helperSnapshot, percentile) {
  const hpScale = balance.internalPower.maxHpScale;
  const targetInternal = internalGrowth(visibleGrowth(targetSnapshot), hpScale);
  const helperDistribution = helperWeights(helperSnapshot, hpScale);
  const weights = {};
  let weightTotal = 0;
  for (const key of STAT_KEYS) {
    const weight = Math.max(0.05, targetInternal[key] * balance.allocation.targetGrowthWeight)
      + balance.allocation.stoneWeight
      + helperDistribution[key] * balance.allocation.helperGrowthWeight;
    weights[key] = weight;
    weightTotal += weight;
  }
  const stonePoints = Object.fromEntries(STAT_KEYS.map((key) => [key, balance.stone.capacityPerStat]));
  const pool = petRebirthPoolInfo(balance, {
    stonePoints,
    stage: 1,
    targetLevel: TARGET_LEVEL,
    percentile,
  }).pool;
  return Object.fromEntries(STAT_KEYS.map((key) => {
    const internal = pool * weights[key] / weightTotal;
    return [key, quantize(key === "maxHp" ? internal * hpScale : internal, 3)];
  }));
}

function combatPower(stats) {
  return Math.round(
    finite(stats.maxHp) * 0.25
    + finite(stats.attack)
    + finite(stats.defense)
    + finite(stats.quick),
  );
}

function nearestRank(values, percentile) {
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.max(1, Math.ceil(percentile / 100 * sorted.length));
  return sorted[Math.min(sorted.length - 1, rank - 1)];
}

function rateAtOrAbove(values, threshold) {
  return values.filter((value) => value >= threshold).length / Math.max(1, values.length);
}

const sampleCount = Math.max(
  DEFAULT_SAMPLE_COUNT,
  Math.trunc(finite(argumentValue("--samples", DEFAULT_SAMPLE_COUNT), DEFAULT_SAMPLE_COUNT)),
);
const profileDocument = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf8"));
const routeDocument = JSON.parse(fs.readFileSync(ROUTE_PATH, "utf8"));
const profiles = new Map((Array.isArray(profileDocument.profiles) ? profileDocument.profiles : [])
  .filter((profile) => profile && typeof profile.profileId === "string")
  .map((profile) => [profile.profileId, profile]));
const balance = loadPetRebirthBalance();
const helperProfile = profiles.get("pet_rebirth_mm_stage1_v1");
const errors = [];
const routes = [];

if (!helperProfile) {
  errors.push("stage-one rebirth helper growth profile is missing");
}

for (const route of Array.isArray(routeDocument.routes) ? routeDocument.routes : []) {
  const routeId = String(route && route.routeId || "");
  const sourceProfileId = String(route && route.sourceGrowthProfileId || "");
  const sourceProfile = profiles.get(sourceProfileId);
  if (!routeId || !sourceProfile || !helperProfile) {
    errors.push(`${routeId || "unknown route"} source/helper profile is missing`);
    continue;
  }
  const powers = new Array(sampleCount);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const sourceSeed = deterministicPrivateSeed(`${routeId}:source`, sample);
    const helperSeed = deterministicPrivateSeed(`${routeId}:helper`, sample);
    const sourceRoll = derivePrivateRoll(sourceProfile, sourceSeed);
    const helperRoll = derivePrivateRoll(helperProfile, helperSeed);
    const sourceBeforeRebirth = buildPublicSnapshot(sourceProfile, sourceSeed, TARGET_LEVEL, sourceRoll);
    const helper = buildPublicSnapshot(helperProfile, helperSeed, HELPER_LEVEL, helperRoll);
    const rollPercentile = ((sample * PERCENTILE_PERMUTATION) % sampleCount + 0.5) / sampleCount * 100;
    const rebirthGrowthBonus = stageOneBonus(balance, sourceBeforeRebirth, helper, rollPercentile);
    const sourceAfterRebirth = buildPublicSnapshot(sourceProfile, sourceSeed, TARGET_LEVEL, sourceRoll, {
      initialBonus: Object.fromEntries(STAT_KEYS.map((key) => [key, 0])),
      growthBonus: rebirthGrowthBonus,
    });
    powers[sample] = combatPower(sourceAfterRebirth.stats);
  }
  const threshold = nearestRank(powers, TARGET_PERCENTILE);
  const configured = route && route.eligibility && route.eligibility.minimumIntrinsicCombatPower;
  if (configured !== undefined && Number(configured) !== threshold) {
    errors.push(`${routeId} configured P90 power ${configured} does not match ${threshold}`);
  }
  routes.push({
    routeId,
    sourceFormId: String(route.sourceFormId || ""),
    sourceGrowthProfileId: sourceProfileId,
    sampleCount,
    referenceLevel: TARGET_LEVEL,
    referenceRebirthCount: 1,
    fullPreparation: true,
    fullStoneStageOneHelper: true,
    targetPercentile: TARGET_PERCENTILE,
    minimumIntrinsicCombatPower: threshold,
    acceptedRate: rateAtOrAbove(powers, threshold),
    minimumObservedPower: Math.min(...powers),
    maximumObservedPower: Math.max(...powers),
  });
}

const report = {
  schemaVersion: 1,
  auditVersion: "pet_evolution_eligibility_p90_v1",
  rebirthBalanceVersion: balance.balanceVersion,
  routes,
  errors,
  ok: errors.length === 0,
};
fs.mkdirSync(path.dirname(REPORT_PATH), {recursive: true});
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(`pet evolution eligibility audit: ${report.ok ? "ok" : "failed"} routes=${routes.length} samples=${sampleCount * routes.length}`);
for (const route of routes) {
  console.log(`${route.routeId}: P90=${route.minimumIntrinsicCombatPower} accepted=${(route.acceptedRate * 100).toFixed(2)}% range=${route.minimumObservedPower}..${route.maximumObservedPower}`);
}
console.log(`report=${path.relative(ROOT, REPORT_PATH)}`);
for (const error of errors) console.log(`ERROR ${error}`);
if (!report.ok) process.exitCode = 1;
