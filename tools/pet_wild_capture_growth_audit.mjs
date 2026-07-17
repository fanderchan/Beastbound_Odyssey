#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {performance} from "node:perf_hooks";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

const require = createRequire(import.meta.url);
const {STAT_KEYS, derivePrivateRoll} = require("../server/node/src/auth/pet-growth-authority.js");
const {loadPetGrowthCatalog} = require("../server/node/src/auth/pet-growth-catalog.js");
const {
  selectWildCaptureGrowthDraw,
} = require("../server/node/src/auth/wild-capture-growth-selection.js");

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE_PATH = path.join(
  REPOSITORY_ROOT,
  "client/godot/data/balance/pet_growth_species_profiles.json",
);
const DEFAULT_OUTPUT_PATH = path.join(
  REPOSITORY_ROOT,
  ".run/godot/pet_wild_capture_growth_audit.json",
);
const DEFAULT_SAMPLE_COUNT = 10000;
const DEFAULT_LEVELS = Object.freeze([1, 10, 20, 50, 140]);

function parsePositiveInteger(raw, field, fallback) {
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive integer`);
  }
  return value;
}

function parseArgs(argv) {
  const options = {
    levels: [...DEFAULT_LEVELS],
    outputPath: DEFAULT_OUTPUT_PATH,
    samples: DEFAULT_SAMPLE_COUNT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--samples") {
      options.samples = parsePositiveInteger(argv[++index], "--samples", DEFAULT_SAMPLE_COUNT);
    } else if (arg === "--levels") {
      options.levels = String(argv[++index] || "")
        .split(",")
        .map((value) => Number(value.trim()))
        .filter(Number.isFinite);
    } else if (arg === "--output") {
      options.outputPath = path.resolve(REPOSITORY_ROOT, String(argv[++index] || ""));
    } else {
      throw new TypeError(`unknown argument: ${arg}`);
    }
  }
  options.levels = Array.from(new Set(options.levels)).sort((left, right) => left - right);
  if (
    options.levels.length === 0
    || options.levels[0] !== 1
    || options.levels.some((level) => !Number.isInteger(level) || level < 1 || level > 140)
  ) {
    throw new TypeError("--levels must contain unique integer levels in 1..140 and include Lv1");
  }
  if (options.samples < 1000) {
    throw new TypeError("--samples must be at least 1000");
  }
  return options;
}

function round(value, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round(Number(value) * factor) / factor;
}

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length <= 1) {
    return sortedValues[0] || 0;
  }
  const target = Math.max(0, Math.min(100, percentileValue)) / 100 * (sortedValues.length - 1);
  const lower = Math.floor(target);
  const upper = Math.ceil(target);
  if (lower === upper) {
    return sortedValues[lower];
  }
  return sortedValues[lower] + ((sortedValues[upper] - sortedValues[lower]) * (target - lower));
}

function normalizedPowerUnit(profile, values, spreadKey, weights) {
  let minimum = 0;
  let maximum = 0;
  let actual = 0;
  for (const key of STAT_KEYS) {
    const range = profile.individualRules[spreadKey][key];
    const rangeMinimum = Math.min(Number(range[0]), Number(range[1]));
    const rangeMaximum = Math.max(Number(range[0]), Number(range[1]));
    const weight = Number(weights[key]);
    minimum += rangeMinimum * weight;
    maximum += rangeMaximum * weight;
    actual += Number(values[key]) * weight;
  }
  if (maximum <= minimum) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, (actual - minimum) / (maximum - minimum)));
}

function selectedSample(profile, level, sampleIndex, policy) {
  const selected = selectWildCaptureGrowthDraw({
    profile,
    encounterLevel: level,
    policy,
    draw(attempt) {
      const privateSeed = [
        "beastbound-wild-capture-audit-v1",
        profile.profileId,
        `lv${level}`,
        `sample${sampleIndex + 1}`,
        `attempt${attempt}`,
      ].join(":");
      const privateRoll = derivePrivateRoll(profile, privateSeed);
      return {privateSeed, privateRoll, value: {privateSeed, privateRoll}};
    },
  });
  return {
    growthQualityUnit: selected.evaluation.qualityUnit,
    initialQualityUnit: normalizedPowerUnit(
      profile,
      selected.value.privateRoll.initialBonus,
      "initialOutputSpread",
      policy.qualityPowerWeights,
    ),
    attemptCount: selected.attemptCount,
    fallbackUsed: selected.fallbackUsed,
  };
}

function emptyLevelAccumulator() {
  return {
    count: 0,
    growthQualityTotal: 0,
    initialQualityTotal: 0,
    lowerHalfCount: 0,
    topFiveCount: 0,
    topOneCount: 0,
    attemptTotal: 0,
    maxAttempts: 0,
    fallbackCount: 0,
  };
}

function collectSample(accumulator, sample, thresholds = null) {
  accumulator.count += 1;
  accumulator.growthQualityTotal += sample.growthQualityUnit;
  accumulator.initialQualityTotal += sample.initialQualityUnit;
  accumulator.lowerHalfCount += sample.growthQualityUnit <= 0.5 ? 1 : 0;
  accumulator.attemptTotal += sample.attemptCount;
  accumulator.maxAttempts = Math.max(accumulator.maxAttempts, sample.attemptCount);
  accumulator.fallbackCount += sample.fallbackUsed ? 1 : 0;
  if (thresholds) {
    accumulator.topFiveCount += sample.growthQualityUnit >= thresholds.topFive ? 1 : 0;
    accumulator.topOneCount += sample.growthQualityUnit >= thresholds.topOne ? 1 : 0;
  }
}

function finishedLevel(accumulator) {
  const count = Math.max(1, accumulator.count);
  return {
    sampleCount: accumulator.count,
    meanGrowthQualityUnit: round(accumulator.growthQualityTotal / count),
    meanInitial4VQualityUnit: round(accumulator.initialQualityTotal / count),
    lowerHalfRate: round(accumulator.lowerHalfCount / count),
    topFiveRateAgainstLv1: round(accumulator.topFiveCount / count),
    topOneRateAgainstLv1: round(accumulator.topOneCount / count),
    averageSelectionAttempts: round(accumulator.attemptTotal / count),
    maxSelectionAttempts: accumulator.maxAttempts,
    fallbackRate: round(accumulator.fallbackCount / count),
  };
}

function writeJson(outputPath, value) {
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function validateReport(report) {
  const errors = [];
  const levels = report.levels;
  const policy = report.policy;
  if (report.profileCount <= 0 || report.profileCount !== report.catalogProfileCount) {
    errors.push(`audited ${report.profileCount} profiles but strict catalog contains ${report.catalogProfileCount}`);
  }
  const levelOne = report.aggregateByLevel["1"];
  if (
    levelOne.averageSelectionAttempts !== 1
    || levelOne.maxSelectionAttempts !== 1
    || levelOne.fallbackRate !== 0
  ) {
    errors.push("Lv1 must accept the first species-distribution draw without fallback");
  }
  for (let index = 1; index < levels.length; index += 1) {
    const previous = report.aggregateByLevel[String(levels[index - 1])];
    const current = report.aggregateByLevel[String(levels[index])];
    if (current.meanGrowthQualityUnit > previous.meanGrowthQualityUnit + 0.005) {
      errors.push(`mean hidden-growth quality rose from Lv${levels[index - 1]} to Lv${levels[index]}`);
    }
    if (current.averageSelectionAttempts > 2) {
      errors.push(`Lv${levels[index]} average selection attempts exceeded 2`);
    }
    if (current.maxSelectionAttempts > policy.maxSelectionAttempts) {
      errors.push(`Lv${levels[index]} exceeded the configured hard attempt limit`);
    }
  }
  const highestLevel = levels[levels.length - 1];
  const highest = report.aggregateByLevel[String(highestLevel)];
  if (highest.topFiveRateAgainstLv1 >= 0.015) {
    errors.push(`Lv${highestLevel} top-5% hidden-growth rate must stay below 1.5%`);
  }
  if (highest.topOneRateAgainstLv1 <= 0 || highest.topOneRateAgainstLv1 >= 0.005) {
    errors.push(`Lv${highestLevel} top-1% lottery tail must remain non-zero and below 0.5%`);
  }
  if (Math.abs(highest.meanInitial4VQualityUnit - levelOne.meanInitial4VQualityUnit) > 0.02) {
    errors.push("capture-level conditioning drifted the aggregate Lv1 4V distribution by more than 2 points");
  }
  for (const profile of report.profiles) {
    const baseline = profile.byLevel["1"];
    const final = profile.byLevel[String(highestLevel)];
    if (Math.abs(final.meanInitial4VQualityUnit - baseline.meanInitial4VQualityUnit) > 0.05) {
      errors.push(`${profile.profileId} Lv1 4V distribution drift exceeded 5 points`);
    }
  }
  return errors;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const document = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf8"));
  const catalog = loadPetGrowthCatalog();
  const policy = catalog.wildCaptureGrowthPolicy;
  const profiles = [];
  const aggregateByLevel = Object.fromEntries(options.levels.map((level) => [String(level), emptyLevelAccumulator()]));
  const startedAt = performance.now();

  for (const rawProfile of document.profiles) {
    const profile = catalog.requireProfileById(rawProfile.profileId);
    const baselineSamples = [];
    for (let sampleIndex = 0; sampleIndex < options.samples; sampleIndex += 1) {
      baselineSamples.push(selectedSample(profile, 1, sampleIndex, policy));
    }
    const sortedGrowthQuality = baselineSamples
      .map((sample) => sample.growthQualityUnit)
      .sort((left, right) => left - right);
    const thresholds = {
      topFive: percentile(sortedGrowthQuality, 95),
      topOne: percentile(sortedGrowthQuality, 99),
    };
    const byLevel = {};
    for (const level of options.levels) {
      const accumulator = emptyLevelAccumulator();
      const samples = level === 1
        ? baselineSamples
        : Array.from({length: options.samples}, (_, sampleIndex) => (
          selectedSample(profile, level, sampleIndex, policy)
        ));
      for (const sample of samples) {
        collectSample(accumulator, sample, thresholds);
        collectSample(aggregateByLevel[String(level)], sample, thresholds);
      }
      byLevel[String(level)] = finishedLevel(accumulator);
    }
    profiles.push({
      profileId: profile.profileId,
      formId: profile.formId,
      lv1GrowthQualityThresholds: {
        topFive: round(thresholds.topFive),
        topOne: round(thresholds.topOne),
      },
      byLevel,
    });
  }

  const elapsedMs = performance.now() - startedAt;
  const finishedAggregate = Object.fromEntries(options.levels.map((level) => [
    String(level),
    finishedLevel(aggregateByLevel[String(level)]),
  ]));
  const report = {
    schemaVersion: 1,
    policy,
    profileCount: profiles.length,
    catalogProfileCount: catalog.profileCount,
    samplesPerProfilePerLevel: options.samples,
    levels: options.levels,
    totalSelectedPets: profiles.length * options.samples * options.levels.length,
    elapsedMs: round(elapsedMs, 3),
    selectedPetsPerSecond: round((profiles.length * options.samples * options.levels.length) / (elapsedMs / 1000), 1),
    aggregateByLevel: finishedAggregate,
    profiles,
    errors: [],
  };
  report.errors = validateReport(report);
  writeJson(options.outputPath, report);

  console.log(`wild capture growth audit: profiles=${report.profileCount} samples=${options.samples} levels=${options.levels.join(",")} elapsed_ms=${report.elapsedMs}`);
  for (const level of options.levels) {
    const row = report.aggregateByLevel[String(level)];
    console.log([
      `Lv${level}`,
      `mean=${row.meanGrowthQualityUnit}`,
      `top5=${round(row.topFiveRateAgainstLv1 * 100, 3)}%`,
      `top1=${round(row.topOneRateAgainstLv1 * 100, 3)}%`,
      `lv1_4v_mean=${row.meanInitial4VQualityUnit}`,
      `attempts=${row.averageSelectionAttempts}`,
      `fallback=${round(row.fallbackRate * 100, 3)}%`,
    ].join(" "));
  }
  console.log(`output=${path.relative(REPOSITORY_ROOT, options.outputPath)} errors=${report.errors.length}`);
  for (const error of report.errors) {
    console.error(`ERROR: ${error}`);
  }
  process.exitCode = report.errors.length === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
