#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {isDeepStrictEqual} from "node:util";
import {fileURLToPath} from "node:url";

import {simulateProfile} from "./pet_growth_population_audit.mjs";

const TOOL_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(TOOL_PATH), "..");
const CANDIDATE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/data/p1_4b_fusion_candidate_growth_profiles.json",
);
const PRODUCTION_GROWTH_PATH = path.join(
  REPOSITORY_ROOT,
  "client/godot/data/balance/pet_growth_species_profiles.json",
);
const PRODUCTION_TEMPLATE_PATH = path.join(
  REPOSITORY_ROOT,
  "client/godot/data/pet_templates.json",
);
const PRODUCTION_FUSION_PATH = path.join(
  REPOSITORY_ROOT,
  "client/godot/data/pet_fusion_recipes.json",
);
const DEFAULT_OUTPUT_PATH = path.join(
  REPOSITORY_ROOT,
  ".run/godot/p1_4b_fusion_candidate_growth_audit.json",
);
const DEFAULT_SAMPLE_COUNT = 10000;
const STAT_KEYS = Object.freeze(["maxHp", "attack", "defense", "quick"]);
const EXPECTED_MODEL_VERSION = "pet_growth_authority_v1";
const EXPECTED_STATUS = "owner_review_pending";
const EXPECTED_SEED_FORMAT = "audit:<profileId>:<six-digit sample number starting at 000001>";
const EXPECTED_PROFILE_COUNT = 2;
const EXPECTED_PROFILE_IDENTITIES = new Map([
  [
    "emberhorn_fusion_solar_crown_fire7_wind3_v1",
    "emberhorn_fusion_solar_crown_fire7_wind3",
  ],
  [
    "emberhorn_fusion_moss_rampart_fire4_earth6_v1",
    "emberhorn_fusion_moss_rampart_fire4_earth6",
  ],
]);
const FROZEN_PRODUCTION_PROFILE_PATHS = Object.freeze([
  "profileId",
  "formId",
  "formName",
  "familyRole",
  ...STAT_KEYS.map((key) => `outputBase.${key}`),
  ...STAT_KEYS.map((key) => `outputGrowth.${key}`),
  ...STAT_KEYS.map((key) => `individualRules.initialOutputSpread.${key}`),
  ...STAT_KEYS.map((key) => `individualRules.growthOutputSpread.${key}`),
  "individualRules.distribution",
  "individualRules.rareExtremeRate",
  "targetAudit.sampleCount",
  "targetAudit.levelMin",
  "targetAudit.levelMax",
  "targetAudit.lv140PowerBand",
  "targetAudit.threeStatGrowthBand",
  "targetAudit.hpGrowthBand",
]);

function repositoryRelative(filePath) {
  return path.relative(REPOSITORY_ROOT, filePath).split(path.sep).join("/");
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parsePositiveInteger(raw, name, fallback) {
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 100) {
    throw new TypeError(`${name} must be an integer of at least 100`);
  }
  return value;
}

function parseArgs(argv) {
  const options = {
    samples: DEFAULT_SAMPLE_COUNT,
    outputPath: DEFAULT_OUTPUT_PATH,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--samples") {
      const rawSamples = argv[++index];
      if (rawSamples === undefined) {
        throw new TypeError("--samples requires a value");
      }
      options.samples = parsePositiveInteger(rawSamples, "--samples", DEFAULT_SAMPLE_COUNT);
    } else if (argument === "--output") {
      const rawPath = String(argv[++index] || "").trim();
      if (!rawPath) {
        throw new TypeError("--output requires a path");
      }
      options.outputPath = path.resolve(REPOSITORY_ROOT, rawPath);
    } else {
      throw new TypeError(`unknown argument: ${argument}`);
    }
  }
  return options;
}

function isObjectRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactKeys(value, expectedKeys) {
  return isObjectRecord(value)
    && Object.keys(value).length === expectedKeys.length
    && expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function valueAtPath(value, fieldPath) {
  return fieldPath.split(".").reduce(
    (current, key) => (isObjectRecord(current) ? current[key] : undefined),
    value,
  );
}

function describeValue(value) {
  return value === undefined ? "<missing>" : JSON.stringify(value);
}

function validateStatMap(value, fieldPath, errors, {integer = false} = {}) {
  if (!hasExactKeys(value, STAT_KEYS)) {
    errors.push(`${fieldPath} must contain exactly ${STAT_KEYS.join(",")}`);
    return;
  }
  for (const key of STAT_KEYS) {
    const candidate = value[key];
    if (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate <= 0) {
      errors.push(`${fieldPath}.${key} must be a positive finite number`);
    } else if (integer && !Number.isInteger(candidate)) {
      errors.push(`${fieldPath}.${key} must be an integer`);
    }
  }
}

function validateRangeMap(value, fieldPath, errors) {
  if (!hasExactKeys(value, STAT_KEYS)) {
    errors.push(`${fieldPath} must contain exactly ${STAT_KEYS.join(",")}`);
    return;
  }
  for (const key of STAT_KEYS) {
    const range = value[key];
    if (
      !Array.isArray(range)
      || range.length !== 2
      || range.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
      || range[0] > range[1]
    ) {
      errors.push(`${fieldPath}.${key} must be an ordered two-number range`);
    }
  }
}

function validateBand(value, fieldPath, errors) {
  if (
    !Array.isArray(value)
    || value.length !== 2
    || value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
    || value[0] > value[1]
  ) {
    errors.push(`${fieldPath} must be an ordered two-number range`);
  }
}

function validateCandidateDocument(document) {
  const errors = [];
  if (!isObjectRecord(document)) {
    return ["candidate growth document must be an object"];
  }
  if (document.schemaVersion !== 1) {
    errors.push("candidate growth document schemaVersion must be 1");
  }
  if (document.status !== EXPECTED_STATUS) {
    errors.push(`candidate growth document status must be ${EXPECTED_STATUS}`);
  }
  if (document.runtimeEnabled !== false) {
    errors.push("candidate growth document runtimeEnabled must be false");
  }
  if (document.modelVersion !== EXPECTED_MODEL_VERSION) {
    errors.push(`candidate growth document modelVersion must be ${EXPECTED_MODEL_VERSION}`);
  }
  if (document.seedFormat !== EXPECTED_SEED_FORMAT) {
    errors.push(`candidate growth document seedFormat must be ${EXPECTED_SEED_FORMAT}`);
  }
  if (!Array.isArray(document.profiles) || document.profiles.length !== EXPECTED_PROFILE_COUNT) {
    errors.push(`candidate growth document must contain exactly ${EXPECTED_PROFILE_COUNT} profiles`);
    return errors;
  }

  const profileIds = new Set();
  const formIds = new Set();
  for (const [index, profile] of document.profiles.entries()) {
    const fieldPath = `profiles[${index}]`;
    if (!isObjectRecord(profile)) {
      errors.push(`${fieldPath} must be an object`);
      continue;
    }
    for (const key of ["profileId", "displayName", "formId", "formName", "familyRole"]) {
      if (typeof profile[key] !== "string" || profile[key].trim() === "") {
        errors.push(`${fieldPath}.${key} must be a non-empty string`);
      }
    }
    if (profile.runtimeEnabled !== false) {
      errors.push(`${fieldPath}.runtimeEnabled must be false`);
    }
    if (profile.reviewStatus !== EXPECTED_STATUS) {
      errors.push(`${fieldPath}.reviewStatus must be ${EXPECTED_STATUS}`);
    }
    if (profileIds.has(profile.profileId)) {
      errors.push(`${fieldPath}.profileId must be unique`);
    }
    if (formIds.has(profile.formId)) {
      errors.push(`${fieldPath}.formId must be unique`);
    }
    profileIds.add(profile.profileId);
    formIds.add(profile.formId);
    if (EXPECTED_PROFILE_IDENTITIES.get(profile.profileId) !== profile.formId) {
      errors.push(`${fieldPath} is not one of the frozen P1.4b candidate identities`);
    }
    validateStatMap(profile.outputBase, `${fieldPath}.outputBase`, errors, {integer: true});
    validateStatMap(profile.outputGrowth, `${fieldPath}.outputGrowth`, errors);
    if (!isObjectRecord(profile.individualRules)) {
      errors.push(`${fieldPath}.individualRules must be an object`);
    } else {
      validateRangeMap(
        profile.individualRules.initialOutputSpread,
        `${fieldPath}.individualRules.initialOutputSpread`,
        errors,
      );
      validateRangeMap(
        profile.individualRules.growthOutputSpread,
        `${fieldPath}.individualRules.growthOutputSpread`,
        errors,
      );
      if (profile.individualRules.distribution !== "weighted_center") {
        errors.push(`${fieldPath}.individualRules.distribution must be weighted_center`);
      }
      if (profile.individualRules.rareExtremeRate !== 0.02) {
        errors.push(`${fieldPath}.individualRules.rareExtremeRate must be 0.02`);
      }
    }
    if (!isObjectRecord(profile.targetAudit)) {
      errors.push(`${fieldPath}.targetAudit must be an object`);
    } else {
      validateBand(profile.targetAudit.lv140PowerBand, `${fieldPath}.targetAudit.lv140PowerBand`, errors);
      validateBand(
        profile.targetAudit.threeStatGrowthBand,
        `${fieldPath}.targetAudit.threeStatGrowthBand`,
        errors,
      );
      validateBand(profile.targetAudit.hpGrowthBand, `${fieldPath}.targetAudit.hpGrowthBand`, errors);
      if (
        profile.targetAudit.sampleCount !== DEFAULT_SAMPLE_COUNT
        || profile.targetAudit.levelMin !== 1
        || profile.targetAudit.levelMax !== 140
      ) {
        errors.push(`${fieldPath}.targetAudit must freeze 10000 samples across Lv1-Lv140`);
      }
    }
  }
  if (
    profileIds.size !== EXPECTED_PROFILE_IDENTITIES.size
    || [...EXPECTED_PROFILE_IDENTITIES.keys()].some((profileId) => !profileIds.has(profileId))
  ) {
    errors.push("candidate growth document must contain the two frozen P1.4b profile ids");
  }
  return errors;
}

function rangeContains(range, minimum, maximum) {
  const tolerance = 0.01;
  return Array.isArray(range)
    && range.length === 2
    && range[0] - tolerance <= minimum
    && range[1] + tolerance >= maximum;
}

function validateSimulation(profile, result) {
  const errors = [];
  if (Object.keys(result.observation.powerGrowthPercentilesByLevel).length !== 139) {
    errors.push("observation threshold level count must be 139");
  }
  if (
    !rangeContains(
      profile.targetAudit.threeStatGrowthBand,
      result.threeStatGrowthPerLevel.min,
      result.threeStatGrowthPerLevel.max,
    )
  ) {
    errors.push("three-stat growth sample range exceeds targetAudit.threeStatGrowthBand");
  }
  if (
    !rangeContains(
      profile.targetAudit.hpGrowthBand,
      result.perLevelGrowth.maxHp.min,
      result.perLevelGrowth.maxHp.max,
    )
  ) {
    errors.push("HP growth sample range exceeds targetAudit.hpGrowthBand");
  }
  const averagePower = result.lv140.combatPower.avg;
  const powerBand = profile.targetAudit.lv140PowerBand;
  if (averagePower < powerBand[0] || averagePower > powerBand[1]) {
    errors.push("Lv140 average combat power is outside targetAudit.lv140PowerBand");
  }
  return errors;
}

export function verifyProductionPromotion(candidateDocument, documents = {}) {
  const growthDocument = documents.growthDocument || readJson(PRODUCTION_GROWTH_PATH);
  const templateDocument = documents.templateDocument || readJson(PRODUCTION_TEMPLATE_PATH);
  const fusionDocument = documents.fusionDocument || readJson(PRODUCTION_FUSION_PATH);
  const productionProfiles = Array.isArray(growthDocument.profiles) ? growthDocument.profiles : [];
  const productionForms = Array.isArray(templateDocument.forms) ? templateDocument.forms : [];
  const productionProfilesById = new Map(
    productionProfiles.map((profile) => [String(profile.profileId || ""), profile]),
  );
  const productionFormsById = new Map(
    productionForms.map((form) => [String(form.formId || ""), form]),
  );
  const promotionErrors = [];
  const profileChecks = [];
  for (const profile of candidateDocument.profiles) {
    const productionProfileCount = productionProfiles.filter(
      (candidate) => candidate.profileId === profile.profileId,
    ).length;
    const productionFormCount = productionForms.filter(
      (candidate) => candidate.formId === profile.formId,
    ).length;
    const productionProfile = productionProfilesById.get(profile.profileId);
    const productionForm = productionFormsById.get(profile.formId);
    const mismatches = [];
    if (productionProfileCount !== 1) {
      mismatches.push(`production profile occurrence count expected=1 actual=${productionProfileCount}`);
    }
    if (!productionProfile) {
      mismatches.push("production profile is missing");
    } else {
      for (const fieldPath of FROZEN_PRODUCTION_PROFILE_PATHS) {
        const expected = valueAtPath(profile, fieldPath);
        const actual = valueAtPath(productionProfile, fieldPath);
        if (!isDeepStrictEqual(actual, expected)) {
          mismatches.push(
            `${fieldPath} expected=${describeValue(expected)} actual=${describeValue(actual)}`,
          );
        }
      }
      const expectedLv1MaxHpSpread = profile.individualRules.initialOutputSpread.maxHp;
      const actualLv1MaxHpSpread = productionProfile.targetAudit?.lv1MaxHpSpread;
      if (!isDeepStrictEqual(actualLv1MaxHpSpread, expectedLv1MaxHpSpread)) {
        mismatches.push(
          "targetAudit.lv1MaxHpSpread"
          + ` expected=${describeValue(expectedLv1MaxHpSpread)}`
          + ` actual=${describeValue(actualLv1MaxHpSpread)}`,
        );
      }
    }
    if (productionFormCount !== 1) {
      mismatches.push(`production form occurrence count expected=1 actual=${productionFormCount}`);
    }
    if (!productionForm) {
      mismatches.push("production form is missing");
    } else {
      const expectedBaseStats = {
        maxHp: profile.outputBase.maxHp,
        attack: profile.outputBase.attack,
        defense: profile.outputBase.defense,
        agility: profile.outputBase.quick,
      };
      if (productionForm.growthSpeciesProfileId !== profile.profileId) {
        mismatches.push(
          "template.growthSpeciesProfileId"
          + ` expected=${describeValue(profile.profileId)}`
          + ` actual=${describeValue(productionForm.growthSpeciesProfileId)}`,
        );
      }
      if (productionForm.formName !== profile.formName) {
        mismatches.push(
          "template.formName"
          + ` expected=${describeValue(profile.formName)}`
          + ` actual=${describeValue(productionForm.formName)}`,
        );
      }
      if (!isDeepStrictEqual(productionForm.baseStats, expectedBaseStats)) {
        mismatches.push(
          "template.baseStats"
          + ` expected=${describeValue(expectedBaseStats)}`
          + ` actual=${describeValue(productionForm.baseStats)}`,
        );
      }
    }
    promotionErrors.push(
      ...mismatches.map((error) => `${profile.profileId}: ${error}`),
    );
    profileChecks.push({
      profileId: profile.profileId,
      formId: profile.formId,
      frozenProfileFieldCount: FROZEN_PRODUCTION_PROFILE_PATHS.length,
      productionProfileCount,
      productionFormCount,
      productionProfilePresent: Boolean(productionProfile),
      productionFormPresent: Boolean(productionForm),
      matchesFrozenCandidate: mismatches.length === 0,
      mismatches,
    });
  }
  const fusionCatalogErrors = [];
  if (fusionDocument.runtimeEnabled !== false) {
    fusionCatalogErrors.push("production fusion catalog runtimeEnabled must remain false");
  }
  if (!Array.isArray(fusionDocument.recipes) || fusionDocument.recipes.length !== 0) {
    fusionCatalogErrors.push("production fusion catalog recipes must remain an empty array");
  }
  const errors = [...promotionErrors, ...fusionCatalogErrors];
  return {
    growthProfileCount: productionProfiles.length,
    petFormCount: productionForms.length,
    fusionRuntimeEnabled: fusionDocument.runtimeEnabled,
    fusionRecipeCount: Array.isArray(fusionDocument.recipes) ? fusionDocument.recipes.length : null,
    approvedProfileCount: candidateDocument.profiles.length,
    promotedProfileCount: profileChecks.filter((check) => check.matchesFrozenCandidate).length,
    productionProfilesMatchFrozenCandidates: promotionErrors.length === 0,
    fusionCatalogClosed: fusionCatalogErrors.length === 0,
    profileChecks,
    errors,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const candidateDocument = readJson(CANDIDATE_PATH);
  const documentErrors = validateCandidateDocument(candidateDocument);
  if (documentErrors.length > 0) {
    throw new TypeError(`candidate growth document invalid: ${documentErrors.join("; ")}`);
  }

  const productionPromotion = verifyProductionPromotion(candidateDocument);
  const reports = [];
  const errors = [...productionPromotion.errors];
  for (const profile of candidateDocument.profiles) {
    const result = simulateProfile(profile, options.samples);
    const profileErrors = validateSimulation(profile, result);
    reports.push({...result, errors: profileErrors});
    errors.push(...profileErrors.map((error) => `${profile.profileId}: ${error}`));
    process.stdout.write(
      `${profile.profileId}: samples=${options.samples}`
      + ` three_growth=${result.threeStatGrowthPerLevel.min}-${result.threeStatGrowthPerLevel.max}`
      + ` hp_growth=${result.perLevelGrowth.maxHp.min}-${result.perLevelGrowth.maxHp.max}`
      + ` lv140_power=${result.lv140.combatPower.min}-${result.lv140.combatPower.max}`
      + ` avg=${result.lv140.combatPower.avg} errors=${profileErrors.length}\n`,
    );
  }

  const report = {
    schemaVersion: 1,
    mode: "pet_fusion_candidate_growth_audit",
    modelVersion: EXPECTED_MODEL_VERSION,
    candidateStatus: candidateDocument.status,
    runtimeEnabled: candidateDocument.runtimeEnabled,
    sourceDocument: repositoryRelative(CANDIDATE_PATH),
    sourceSha256: sha256File(CANDIDATE_PATH),
    auditTool: repositoryRelative(TOOL_PATH),
    auditToolSha256: sha256File(TOOL_PATH),
    seedFormat: candidateDocument.seedFormat,
    sampleCountPerProfile: options.samples,
    profileCount: reports.length,
    productionPromotion,
    reports,
    errors,
  };
  writeJson(options.outputPath, report);
  const status = errors.length === 0 ? "ok" : "failed";
  process.stdout.write(
    `report=${options.outputPath} sha256=${sha256File(options.outputPath)} status=${status}\n`,
  );
  process.exitCode = errors.length === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === TOOL_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
