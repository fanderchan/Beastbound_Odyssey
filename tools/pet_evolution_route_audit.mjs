#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

const require = createRequire(import.meta.url);
const {derivePrivateRoll} = require("../server/node/src/auth/pet-growth-authority");
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

function sampleRolls(profile, routeId, kind, sampleCount) {
  return Array.from({length: sampleCount}, (_, index) => derivePrivateRoll(
    profile,
    `evolution-route-audit:${routeId}:${kind}:${String(index + 1).padStart(6, "0")}`,
  ));
}

function internalPower(stats) {
  return STAT_KEYS.reduce((total, key) => total + Number(stats[key] || 0) * STAT_WEIGHTS[key], 0);
}

function mean(values) {
	return values.reduce((sum, value) => sum + Number(value || 0), 0) / Math.max(1, values.length);
}

function pearsonCorrelation(left, right) {
	const leftMean = mean(left);
	const rightMean = mean(right);
	let numerator = 0;
	let leftSquares = 0;
	let rightSquares = 0;
	for (let index = 0; index < left.length; index += 1) {
		const leftDelta = Number(left[index] || 0) - leftMean;
		const rightDelta = Number(right[index] || 0) - rightMean;
		numerator += leftDelta * rightDelta;
		leftSquares += leftDelta * leftDelta;
		rightSquares += rightDelta * rightDelta;
	}
	const denominator = Math.sqrt(leftSquares * rightSquares);
	return denominator > 0 ? numerator / denominator : 0;
}

function configuredRange(profile, field, key) {
	const values = profile.individualRules[field][key];
	return {min: Number(values[0]), max: Number(values[1])};
}

function weightedBase(profile, field) {
	return STAT_KEYS.reduce(
		(sum, key) => sum + Number(profile[field][key] || 0) * STAT_WEIGHTS[key],
		0,
	);
}

function auditRoute(route, sourceProfile, targetProfile, balance, sampleCount) {
	const sourceRolls = sampleRolls(sourceProfile, route.routeId, "source", sampleCount);
	const targetRolls = sampleRolls(targetProfile, route.routeId, "fresh_target", sampleCount);
	const initialPowerDrifts = [];
	const intrinsicUplifts = [];
	const correlations = {levelOneFourV: {}, hiddenGrowth: {}};
	const targetRanges = {levelOneFourV: {}, hiddenGrowth: {}};
	let maximumAbsoluteCorrelation = 0;
	for (const key of STAT_KEYS) {
		const sourceInitial = sourceRolls.map((roll) => Number(roll.initialBonus[key] || 0));
		const targetInitial = targetRolls.map((roll) => Number(roll.initialBonus[key] || 0));
		const sourceGrowth = sourceRolls.map((roll) => Number(roll.innateGrowthBonus[key] || 0));
		const targetGrowth = targetRolls.map((roll) => Number(roll.innateGrowthBonus[key] || 0));
		const initialCorrelation = pearsonCorrelation(sourceInitial, targetInitial);
		const growthCorrelation = pearsonCorrelation(sourceGrowth, targetGrowth);
		correlations.levelOneFourV[key] = round(initialCorrelation);
		correlations.hiddenGrowth[key] = round(growthCorrelation);
		maximumAbsoluteCorrelation = Math.max(
			maximumAbsoluteCorrelation,
			Math.abs(initialCorrelation),
			Math.abs(growthCorrelation),
		);
		targetRanges.levelOneFourV[key] = {
			configured: configuredRange(targetProfile, "initialOutputSpread", key),
			observed: {min: Math.min(...targetInitial), max: Math.max(...targetInitial)},
		};
		targetRanges.hiddenGrowth[key] = {
			configured: configuredRange(targetProfile, "growthOutputSpread", key),
			observed: {min: Math.min(...targetGrowth), max: Math.max(...targetGrowth)},
		};
	}
	for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
		const sourceInitial = {};
		const targetInitial = {};
		let uplift = 0;
		for (const key of STAT_KEYS) {
			const sourceInitialBonus = Number(sourceRolls[sampleIndex].initialBonus[key] || 0);
			const sourceGrowthBonus = Number(sourceRolls[sampleIndex].innateGrowthBonus[key] || 0);
			const targetInitialBonus = Number(targetRolls[sampleIndex].initialBonus[key] || 0);
			const targetGrowthBonus = Number(targetRolls[sampleIndex].innateGrowthBonus[key] || 0);
			sourceInitial[key] = Number(sourceProfile.outputBase[key]) + sourceInitialBonus;
			targetInitial[key] = Number(targetProfile.outputBase[key]) + targetInitialBonus;
			uplift += (
				Number(targetProfile.outputGrowth[key]) + targetGrowthBonus
				- Number(sourceProfile.outputGrowth[key]) - sourceGrowthBonus
			) * STAT_WEIGHTS[key];
		}
		initialPowerDrifts.push(round(internalPower(targetInitial) - internalPower(sourceInitial)));
		intrinsicUplifts.push(round(uplift));
	}

	const initialPowerDrift = thresholds(initialPowerDrifts);
	const uplift = thresholds(intrinsicUplifts);
	const budget = balance.powerBudget.intrinsicUpliftInternalPower;
	const sourceBaseLv1Power = weightedBase(sourceProfile, "outputBase");
	const targetBaseLv1Power = weightedBase(targetProfile, "outputBase");
	const baseGrowthUplift = weightedBase(targetProfile, "outputGrowth") - weightedBase(sourceProfile, "outputGrowth");
	const averageGrowthUplift = mean(intrinsicUplifts);
	const errors = [];
	if (maximumAbsoluteCorrelation > 0.05) {
		errors.push(`fresh target correlation ${maximumAbsoluteCorrelation} exceeds 0.05`);
	}
	for (const dimension of Object.values(targetRanges)) {
		for (const [key, range] of Object.entries(dimension)) {
			if (
				range.observed.min < range.configured.min - TOLERANCE
				|| range.observed.max > range.configured.max + TOLERANCE
				|| range.observed.max - range.observed.min <= TOLERANCE
			) {
				errors.push(`fresh target ${key} roll escaped or collapsed its configured species range`);
			}
		}
	}
	if (Math.abs(targetBaseLv1Power - sourceBaseLv1Power) > TOLERANCE) {
		errors.push(`species-center Lv1 power drift ${targetBaseLv1Power - sourceBaseLv1Power}`);
	}
	if (baseGrowthUplift < Number(budget.min) - TOLERANCE || baseGrowthUplift > Number(budget.max) + TOLERANCE) {
		errors.push(`species-center growth uplift ${baseGrowthUplift} is outside ${budget.min}..${budget.max}`);
	}
	if (
		uplift.p55 < Number(budget.p25) - TOLERANCE
		|| uplift.p55 > Number(budget.p85) + TOLERANCE
		|| averageGrowthUplift < Number(budget.p25) - TOLERANCE
		|| averageGrowthUplift > Number(budget.p85) + TOLERANCE
	) {
		errors.push(`fresh reroll uplift center p55=${uplift.p55} mean=${averageGrowthUplift} is outside the approved center band`);
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
			method: "independent_fresh_target_species_roll",
			maximumAbsoluteSourceTargetCorrelation: round(maximumAbsoluteCorrelation),
			correlations,
			targetRanges,
			sourceBaseLv1InternalPower: round(sourceBaseLv1Power),
			targetBaseLv1InternalPower: round(targetBaseLv1Power),
			lv1InternalPowerDrift: initialPowerDrift,
			baseIntrinsicGrowthUplift: round(baseGrowthUplift),
			averageFreshRerollGrowthUplift: round(averageGrowthUplift),
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
	mode: "pet_evolution_fresh_target_reroll_audit",
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
	console.log(`${report.routeId}: samples=${sampleCount} maxCorrelation=${report.projection.maximumAbsoluteSourceTargetCorrelation} uplift=${uplift.min}..${uplift.max} p55=${uplift.p55} clears=${report.acquisition.deterministicVictories} errors=${report.errors.length}`);
}
console.log(`pet evolution route audit: ${output.ok ? "ok" : "failed"} report=${path.relative(ROOT, reportPath)}`);
if (!output.ok) process.exitCode = 1;
