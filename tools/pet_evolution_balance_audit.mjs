#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

const require = createRequire(import.meta.url);
const {
  loadPetEvolutionBalance,
  petEvolutionEffortSummary,
} = require("../server/node/src/auth/pet-evolution-balance");
const {
  loadPetRebirthBalance,
  petRebirthPoolInfo,
} = require("../server/node/src/auth/pet-rebirth-balance");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_PATH = path.join(ROOT, ".run/pet_evolution_balance_audit.json");
const STAT_KEYS = Object.freeze(["maxHp", "attack", "defense", "quick"]);
const THRESHOLD_KEYS = Object.freeze(["min", "p25", "p55", "p85", "p95", "max"]);
const THRESHOLD_PERCENTILES = Object.freeze([0, 25, 55, 85, 95, 100]);
const DEFAULT_SAMPLE_COUNT = 10_000;
const TOLERANCE = 0.000002;

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

function thresholdTable(sortedValues) {
  const result = {};
  for (let index = 0; index < THRESHOLD_KEYS.length; index += 1) {
    const target = THRESHOLD_PERCENTILES[index] / 100 * (sortedValues.length - 1);
    const lower = Math.floor(target);
    const upper = Math.ceil(target);
    const lowerValue = sortedValues[lower];
    const upperValue = sortedValues[upper];
    const value = lower === upper
      ? lowerValue
      : lowerValue + (upperValue - lowerValue) * (target - lower);
    result[THRESHOLD_KEYS[index]] = round(value);
  }
  return result;
}

function interpolateThresholdTable(table, percentile) {
  const safePercentile = Math.max(0, Math.min(100, finite(percentile)));
  for (let index = 0; index < THRESHOLD_PERCENTILES.length - 1; index += 1) {
    const leftPercentile = THRESHOLD_PERCENTILES[index];
    const rightPercentile = THRESHOLD_PERCENTILES[index + 1];
    if (safePercentile > rightPercentile) continue;
    const ratio = (safePercentile - leftPercentile) / (rightPercentile - leftPercentile);
    const left = finite(table[THRESHOLD_KEYS[index]]);
    const right = finite(table[THRESHOLD_KEYS[index + 1]]);
    return left + (right - left) * ratio;
  }
  return finite(table.max);
}

function compareThresholds(actual, expected, label, errors) {
  for (const key of THRESHOLD_KEYS) {
    const difference = Math.abs(finite(actual[key], Number.NaN) - finite(expected[key], Number.NaN));
    if (!Number.isFinite(difference) || difference > TOLERANCE) {
      errors.push(`${label}.${key}=${actual[key]} expected=${expected[key]}`);
    }
  }
}

const sampleCount = Math.max(
  DEFAULT_SAMPLE_COUNT,
  Math.trunc(finite(argumentValue("--samples", DEFAULT_SAMPLE_COUNT), DEFAULT_SAMPLE_COUNT)),
);
const rebirth = loadPetRebirthBalance();
const evolution = loadPetEvolutionBalance({rebirthBalance: rebirth});
const effort = petEvolutionEffortSummary(evolution);
const fullStones = Object.freeze(Object.fromEntries(
  STAT_KEYS.map((key) => [key, rebirth.stone.capacityPerStat]),
));
const errors = [];

const normalStageTwo = new Float64Array(sampleCount);
for (let sample = 0; sample < sampleCount; sample += 1) {
  normalStageTwo[sample] = petRebirthPoolInfo(rebirth, {
    stonePoints: fullStones,
    stage: 2,
    targetLevel: rebirth.target.fullPreparationLevel,
    percentile: (sample + 0.5) / sampleCount * 100,
  }).pool;
}
normalStageTwo.sort();

const normalStageTwoThresholds = thresholdTable(normalStageTwo);
const configuredEvolutionThresholds = evolution.powerBudget.intrinsicUpliftInternalPower;
compareThresholds(
  normalStageTwoThresholds,
  configuredEvolutionThresholds,
  "evolution intrinsic uplift",
  errors,
);
compareThresholds(
  normalStageTwoThresholds,
  rebirth.evaluation.stageThresholds[2].power,
  "rebirth stage-two evaluation",
  errors,
);

let maximumPairedPowerDifference = 0;
for (let index = 0; index < normalStageTwo.length; index += 1) {
  const rankPercentile = index / (normalStageTwo.length - 1) * 100;
  const evolutionPower = interpolateThresholdTable(configuredEvolutionThresholds, rankPercentile);
  maximumPairedPowerDifference = Math.max(
    maximumPairedPowerDifference,
    Math.abs(normalStageTwo[index] - evolutionPower),
  );
}
if (maximumPairedPowerDifference > TOLERANCE) {
  errors.push(`evolution power band drift ${maximumPairedPowerDifference} exceeds ${TOLERANCE}`);
}

if (effort.repeatableRatio < 1.5 || effort.repeatableRatio > 2.0) {
  errors.push(`repeatable effort ratio ${effort.repeatableRatio} is outside 1.5..2.0`);
}
if (effort.firstEvolutionRatio <= effort.repeatableRatio) {
  errors.push("first evolution must include additional one-time quest effort");
}
if (
	 evolution.qualityProjection.lv1FourV !== "fresh_target_species_roll_v1"
	 || evolution.qualityProjection.hiddenGrowth !== "fresh_target_species_roll_v1"
	 || evolution.qualityProjection.preserveIndependentDimensions !== true
	 || evolution.qualityProjection.rerollAllowed !== true
	 || evolution.qualityProjection.sourceQualityTransfer !== false
	 || evolution.qualityProjection.preserveSourceStageSnapshots !== true
	 || evolution.qualityProjection.publicCombinedScore !== false
) {
	errors.push("evolution quality generation violates the fresh target reroll plus public history contract");
}
if (
  evolution.terminalPath.normalSecondRebirthAllowed !== false
  || evolution.terminalPath.fusionMaterialAllowed !== false
  || evolution.terminalPath.successRate !== 1
  || evolution.terminalPath.failureConsumes !== false
) {
  errors.push("evolution terminal path may stack or consume assets on failure");
}

const report = {
  schemaVersion: 1,
  evolutionBalanceVersion: evolution.balanceVersion,
  rebirthBalanceVersion: rebirth.balanceVersion,
  rebirthEvaluationVersion: rebirth.evaluation.evaluationVersion,
  sampleCount,
  reference: {
    stage: 2,
    targetLevel: rebirth.target.fullPreparationLevel,
    stonePointsPerStat: rebirth.stone.capacityPerStat,
    sampling: "stratified_uniform_midpoints",
  },
  normalStageTwoInternalPower: normalStageTwoThresholds,
  evolutionIntrinsicUpliftInternalPower: {...configuredEvolutionThresholds},
  maximumPairedPowerDifference,
  effort: {...effort},
  qualityProjection: {...evolution.qualityProjection},
  terminalPath: {...evolution.terminalPath},
	scope: "fresh_target_reroll_budget_and_public_history_contract",
  errors,
  ok: errors.length === 0,
};

fs.mkdirSync(path.dirname(REPORT_PATH), {recursive: true});
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(`pet evolution balance audit: ${report.ok ? "ok" : "failed"} version=${evolution.balanceVersion} samples=${sampleCount}`);
console.log(`effort repeatable=${effort.repeatableRatio.toFixed(2)}x first=${effort.firstEvolutionRatio.toFixed(2)}x`);
console.log(`stage2=${normalStageTwoThresholds.min.toFixed(6)}..${normalStageTwoThresholds.max.toFixed(6)} pairedDrift=${maximumPairedPowerDifference.toExponential(2)}`);
console.log(`report=${path.relative(ROOT, REPORT_PATH)}`);
for (const error of errors) console.log(`ERROR ${error}`);
if (!report.ok) process.exitCode = 1;
