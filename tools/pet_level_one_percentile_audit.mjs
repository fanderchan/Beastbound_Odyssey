#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

const require = createRequire(import.meta.url);
const {
  STAT_KEYS,
  derivePrivateRoll,
  roundHalfAwayFromZero,
} = require("../server/node/src/auth/pet-growth-authority.js");
const {loadPetGrowthCatalog} = require("../server/node/src/auth/pet-growth-catalog.js");
const {levelOneStatPercentile} = require("../server/node/src/auth/pet-level-one-percentile.js");

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT_PATH = path.join(REPOSITORY_ROOT, ".run/godot/pet_level_one_percentile_audit.json");
const DEFAULT_SAMPLE_COUNT = 10000;
const DEFAULT_MAX_ERROR_PERCENT = 2.5;

function parseArgs(argv) {
  const options = {
    samples: DEFAULT_SAMPLE_COUNT,
    maxErrorPercent: DEFAULT_MAX_ERROR_PERCENT,
    outputPath: DEFAULT_OUTPUT_PATH,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--samples") {
      options.samples = Number(argv[++index]);
    } else if (arg === "--max-error-percent") {
      options.maxErrorPercent = Number(argv[++index]);
    } else if (arg === "--output") {
      options.outputPath = path.resolve(REPOSITORY_ROOT, String(argv[++index] || ""));
    } else {
      throw new TypeError(`unknown argument: ${arg}`);
    }
  }
  if (!Number.isInteger(options.samples) || options.samples < 1000) {
    throw new TypeError("--samples must be an integer of at least 1000");
  }
  if (!Number.isFinite(options.maxErrorPercent) || options.maxErrorPercent <= 0 || options.maxErrorPercent > 10) {
    throw new TypeError("--max-error-percent must be greater than 0 and at most 10");
  }
  return options;
}

function visibleLevelOneStats(profile, privateSeed) {
  const roll = derivePrivateRoll(profile, privateSeed);
  return Object.fromEntries(STAT_KEYS.map((key) => [
    key,
    Math.max(1, roundHalfAwayFromZero(profile.outputBase[key] + roll.initialBonus[key])),
  ]));
}

function auditStat(profile, statKey, counts, sampleCount) {
  const values = [...counts.keys()].sort((left, right) => left - right);
  let cumulative = 0;
  let maxAbsErrorPercent = 0;
  const observations = values.map((value) => {
    cumulative += counts.get(value);
    const empiricalPercentile = cumulative / sampleCount * 100;
    const analyticPercentile = levelOneStatPercentile(profile, statKey, value);
    const absErrorPercent = Math.abs(empiricalPercentile - analyticPercentile);
    maxAbsErrorPercent = Math.max(maxAbsErrorPercent, absErrorPercent);
    return {
      value,
      count: counts.get(value),
      empiricalPercentile: Number(empiricalPercentile.toFixed(3)),
      analyticPercentile,
      absErrorPercent: Number(absErrorPercent.toFixed(3)),
    };
  });
  return {
    minimumValue: values.at(0),
    maximumValue: values.at(-1),
    distinctValueCount: values.length,
    maxAbsErrorPercent: Number(maxAbsErrorPercent.toFixed(3)),
    observations,
  };
}

function auditProfile(profile, sampleCount) {
  const countsByStat = Object.fromEntries(STAT_KEYS.map((key) => [key, new Map()]));
  for (let index = 0; index < sampleCount; index += 1) {
    const stats = visibleLevelOneStats(profile, `lv1-percentile-audit:${profile.profileId}:${index}`);
    for (const key of STAT_KEYS) {
      const counts = countsByStat[key];
      counts.set(stats[key], (counts.get(stats[key]) || 0) + 1);
    }
  }
  const stats = Object.fromEntries(STAT_KEYS.map((key) => [
    key,
    auditStat(profile, key, countsByStat[key], sampleCount),
  ]));
  return {
    profileId: profile.profileId,
    formId: profile.formId,
    distribution: profile.individualRules.distribution,
    rareExtremeRate: profile.individualRules.rareExtremeRate,
    maxAbsErrorPercent: Math.max(...STAT_KEYS.map((key) => stats[key].maxAbsErrorPercent)),
    stats,
  };
}

function writeJson(outputPath, value) {
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const catalog = loadPetGrowthCatalog();
  const profileIds = [...new Set(
    catalog.profiledFormIds().map((formId) => catalog.profileIdForFormId(formId)),
  )].sort();
  const profiles = profileIds.map((profileId) => catalog.requireProfileById(profileId));
  const reports = profiles.map((profile) => auditProfile(profile, options.samples));
  const maxAbsErrorPercent = Math.max(...reports.map((report) => report.maxAbsErrorPercent));
  const errors = [];
  if (profiles.length !== catalog.profileCount) {
    errors.push(`audited ${profiles.length} unique profiles but catalog contains ${catalog.profileCount}`);
  }
  for (const report of reports) {
    if (report.maxAbsErrorPercent > options.maxErrorPercent) {
      errors.push(
        `${report.profileId} analytic CDF error ${report.maxAbsErrorPercent}% exceeds ${options.maxErrorPercent}%`,
      );
    }
  }
  const output = {
    schemaVersion: 1,
    mode: "pet_level_one_percentile_audit",
    sampleCountPerProfile: options.samples,
    expectedProfileCount: catalog.profileCount,
    auditedProfileCount: reports.length,
    maxAllowedErrorPercent: options.maxErrorPercent,
    maxAbsErrorPercent: Number(maxAbsErrorPercent.toFixed(3)),
    reports,
    errors,
  };
  writeJson(options.outputPath, output);
  process.stdout.write(
    `Lv1 percentile audit: profiles=${reports.length}/${catalog.profileCount}`
    + ` samples=${options.samples}/profile max_error=${output.maxAbsErrorPercent}%`
    + ` status=${errors.length === 0 ? "ok" : "failed"}\n`,
  );
  process.stdout.write(`report=${options.outputPath}\n`);
  if (errors.length > 0) {
    for (const error of errors) {
      process.stderr.write(`${error}\n`);
    }
    process.exitCode = 1;
  }
}

main();
