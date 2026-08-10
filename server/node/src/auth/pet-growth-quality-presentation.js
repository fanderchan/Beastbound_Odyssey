"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {STAT_KEYS} = require("./pet-growth-authority");

const DEFAULT_PRESENTATION_PATH = path.resolve(
  __dirname,
  "../../../../client/godot/data/balance/pet_growth_quality_presentation.json",
);
const QUALITY_GRADE_IDS = Object.freeze(["S", "A", "B", "C", "D"]);
const QUALITY_TONE_IDS = Object.freeze(["rainbow", "red", "orange", "purple", "blue"]);
const STAT_LABELS = Object.freeze({
  maxHp: "生命成长",
  attack: "攻击成长",
  defense: "防御成长",
  quick: "敏捷成长",
});

class PetGrowthQualityPresentationConfigError extends Error {
  constructor(errors) {
    const safeErrors = (Array.isArray(errors) ? errors : [errors])
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
    super(`pet growth quality presentation invalid: ${safeErrors.join("; ")}`);
    this.name = "PetGrowthQualityPresentationConfigError";
    this.code = "pet_growth_quality_presentation_invalid";
    this.errors = safeErrors;
  }
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stableString(value) {
  return typeof value === "string" && value.trim() === value && value !== "" ? value : "";
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return value;
}

function clone(value) {
  return structuredClone(value);
}

function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function validHexColor(value) {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value);
}

function validatePresentationDocument(document) {
  const errors = [];
  if (!isObjectRecord(document) || document.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1");
  }
  if (stableString(document && document.presentationId) === "") {
    errors.push("presentationId must be a stable string");
  }
  if (document && document.minimumMatureLevel !== 20) {
    errors.push("minimumMatureLevel must be 20");
  }
  if (document && document.minimumMatureObservedLevels !== 19) {
    errors.push("minimumMatureObservedLevels must be 19");
  }
  if (
    !isObjectRecord(document && document.unobserved)
    || stableString(document.unobserved.label) === ""
    || stableString(document.unobserved.toneId) === ""
    || !validHexColor(document.unobserved.colorHex)
  ) {
    errors.push("unobserved must contain label, toneId, and colorHex");
  }
  if (stableString(document && document.observingSuffix) === "") {
    errors.push("observingSuffix must be a stable string");
  }
  const bands = Array.isArray(document && document.qualityBands)
    ? document.qualityBands
    : [];
  const minimums = [95, 85, 55, 25, 0];
  if (bands.length !== QUALITY_GRADE_IDS.length) {
    errors.push("qualityBands must contain exactly S,A,B,C,D");
  } else {
    bands.forEach((band, index) => {
      if (
        !isObjectRecord(band)
        || band.gradeId !== QUALITY_GRADE_IDS[index]
        || band.minimumPercentile !== minimums[index]
        || band.toneId !== QUALITY_TONE_IDS[index]
        || stableString(band.colorName) === ""
        || stableString(band.qualityName) === ""
        || !validHexColor(band.colorHex)
      ) {
        errors.push(`qualityBands[${index}] is not the approved ${QUALITY_GRADE_IDS[index]} band`);
      }
    });
  }
  const rainbowStops = Array.isArray(document && document.rainbowStops)
    ? document.rainbowStops
    : [];
  if (rainbowStops.length < 5 || rainbowStops.some((entry) => !validHexColor(entry))) {
    errors.push("rainbowStops must contain at least five valid colors");
  }
  const burst = document && document.burst;
  if (
    !isObjectRecord(burst)
    || burst.label !== "爆"
    || burst.comparison !== "public_observed_average_gt_public_top_benchmark"
    || finiteNumber(burst.epsilon) === null
    || burst.epsilon < 0
    || burst.minimumLevel !== 20
    || burst.minimumObservedLevels !== 19
  ) {
    errors.push("burst must use the approved Lv20 public-observation comparison");
  }
  if (errors.length > 0) {
    throw new PetGrowthQualityPresentationConfigError(errors);
  }
  return deepFreeze(clone(document));
}

function createPetGrowthQualityPresentation({presentationDocument} = {}) {
  const contract = validatePresentationDocument(presentationDocument);

  function bandForPercentile(percentileValue) {
    const percentile = Math.max(0, Math.min(100, Number(percentileValue) || 0));
    return clone(contract.qualityBands.find(
      (band) => percentile >= band.minimumPercentile,
    ) || contract.qualityBands.at(-1));
  }

  function unobservedPresentation(level = 1, observedLevels = 0) {
    return deepFreeze({
      schemaVersion: 1,
      presentationId: contract.presentationId,
      available: false,
      level: Math.max(1, Math.min(140, Number.isSafeInteger(level) ? level : 1)),
      observedLevels: Math.max(0, Number.isSafeInteger(observedLevels) ? observedLevels : 0),
      mature: false,
      preliminary: false,
      gradeId: "",
      toneId: contract.unobserved.toneId,
      colorHex: contract.unobserved.colorHex,
      colorName: "",
      qualityName: "",
      badgeText: contract.unobserved.label,
      statusText: "Lv1四维独立显示，升级后开始观察成长",
      benchmarkLabel: "当前形态公开上限",
      burstAny: false,
      burstKeys: [],
      burstLabel: contract.burst.label,
      rows: [],
    });
  }

  function speciesBenchmark(profile, powerWeights) {
    if (!isObjectRecord(profile) || !isObjectRecord(powerWeights)) {
      return deepFreeze({label: "当前形态公开上限", power: 0, stats: {}});
    }
    const output = isObjectRecord(profile.outputGrowth) ? profile.outputGrowth : {};
    const rules = isObjectRecord(profile.individualRules) ? profile.individualRules : {};
    const spread = isObjectRecord(rules.growthOutputSpread) ? rules.growthOutputSpread : {};
    const stats = {};
    let power = 0;
    for (const key of STAT_KEYS) {
      const range = Array.isArray(spread[key]) ? spread[key] : [];
      const base = finiteNumber(output[key]);
      const maximumSpread = finiteNumber(range[1]);
      if (base === null || maximumSpread === null) {
        return deepFreeze({label: "当前形态公开上限", power: 0, stats: {}});
      }
      const maximum = base + maximumSpread;
      stats[key] = roundTo(maximum, 4);
      power += maximum * (finiteNumber(powerWeights[key]) ?? 1);
    }
    return deepFreeze({
      label: "当前形态公开上限",
      power: roundTo(power, 4),
      stats,
    });
  }

  function rowPresentation(key, label, value, benchmarkValue, percentile, burstAllowed) {
    const numericValue = finiteNumber(value);
    const numericBenchmark = finiteNumber(benchmarkValue);
    const hasBenchmark = numericBenchmark !== null && numericBenchmark > 0;
    const band = bandForPercentile(percentile);
    const burst = Boolean(
      burstAllowed
      && numericValue !== null
      && hasBenchmark
      && numericValue > numericBenchmark + contract.burst.epsilon
    );
    return {
      key,
      label,
      available: numericValue !== null && hasBenchmark,
      value: roundTo(numericValue ?? 0, 3),
      benchmark: roundTo(numericBenchmark ?? 0, 3),
      ratio: hasBenchmark
        ? Math.max(0, Math.min(1, (numericValue ?? 0) / numericBenchmark))
        : 0,
      percentile: roundTo(Math.max(0, Math.min(100, Number(percentile) || 0)), 1),
      gradeId: band.gradeId,
      toneId: band.toneId,
      colorHex: band.colorHex,
      qualityName: band.qualityName,
      burst,
    };
  }

  function presentObservation(observation, benchmark, options = {}) {
    if (!isObjectRecord(observation)) {
      return unobservedPresentation();
    }
    const requiresObservationMaturity = options.requiresObservationMaturity !== false;
    const observedLevels = Math.max(
      0,
      Number.isSafeInteger(observation.observedLevels) ? observation.observedLevels : 0,
    );
    const level = Math.max(
      1,
      Math.min(140, Number.isSafeInteger(observation.level) ? observation.level : observedLevels + 1),
    );
    const averages = isObjectRecord(observation.statAverages) ? observation.statAverages : {};
    const percentiles = isObjectRecord(observation.statPercentiles)
      ? observation.statPercentiles
      : {};
    let hasRecord = typeof observation.hasRecord === "boolean"
      ? observation.hasRecord
      : STAT_KEYS.every((key) => finiteNumber(averages[key]) !== null);
    if (requiresObservationMaturity && observedLevels <= 0) {
      hasRecord = false;
    }
    if (!hasRecord) {
      return unobservedPresentation(level, observedLevels);
    }
    const mature = !requiresObservationMaturity || (
      level >= contract.minimumMatureLevel
      && observedLevels >= contract.minimumMatureObservedLevels
    );
    const overallPercentile = Math.max(
      0,
      Math.min(100, Number(observation.powerPercentile) || 0),
    );
    const overallBand = bandForPercentile(overallPercentile);
    const burstAllowed = (
      level >= contract.burst.minimumLevel
      && observedLevels >= contract.burst.minimumObservedLevels
    );
    const safeBenchmark = isObjectRecord(benchmark) ? benchmark : {};
    const benchmarkStats = isObjectRecord(safeBenchmark.stats) ? safeBenchmark.stats : {};
    const rows = [
      rowPresentation(
        "power",
        "总成长",
        observation.powerGrowthPerLevel,
        safeBenchmark.power,
        overallPercentile,
        burstAllowed,
      ),
      ...STAT_KEYS.map((key) => rowPresentation(
        key,
        STAT_LABELS[key],
        averages[key],
        benchmarkStats[key],
        percentiles[key],
        burstAllowed,
      )),
    ];
    const burstKeys = rows.filter((row) => row.burst).map((row) => row.key);
    let badgeText = `${overallBand.colorName}·${overallBand.qualityName}`;
    if (!mature) {
      badgeText += `｜${contract.observingSuffix}`;
    }
    return deepFreeze({
      schemaVersion: 1,
      presentationId: contract.presentationId,
      available: true,
      level,
      observedLevels,
      mature,
      preliminary: !mature,
      gradeId: overallBand.gradeId,
      toneId: overallBand.toneId,
      colorHex: overallBand.colorHex,
      colorName: overallBand.colorName,
      qualityName: overallBand.qualityName,
      badgeText,
      statusText: mature
        ? `已观察${observedLevels}级成长`
        : `已观察${observedLevels}级，Lv${contract.minimumMatureLevel}后定档`,
      benchmarkLabel: stableString(safeBenchmark.label) || "当前形态公开上限",
      burstAny: burstKeys.length > 0,
      burstKeys,
      burstLabel: contract.burst.label,
      rows,
    });
  }

  return Object.freeze({
    schemaVersion: contract.schemaVersion,
    presentationId: contract.presentationId,
    bandForPercentile,
    presentObservation,
    speciesBenchmark,
    unobservedPresentation,
  });
}

function readPresentationDocument(filePath = DEFAULT_PRESENTATION_PATH) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new PetGrowthQualityPresentationConfigError([
      `presentation document load failed: ${error.message}`,
    ]);
  }
}

function loadPetGrowthQualityPresentation() {
  return createPetGrowthQualityPresentation({
    presentationDocument: readPresentationDocument(),
  });
}

module.exports = Object.freeze({
  DEFAULT_PRESENTATION_PATH,
  PetGrowthQualityPresentationConfigError,
  createPetGrowthQualityPresentation,
  loadPetGrowthQualityPresentation,
  validatePresentationDocument,
});
