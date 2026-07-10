"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {MODEL_VERSION, STAT_KEYS} = require("./pet-growth-authority");

const REPOSITORY_ROOT = path.resolve(__dirname, "../../../..");
const DEFAULT_PROFILE_PATH = path.join(
  REPOSITORY_ROOT,
  "client/godot/data/balance/pet_growth_species_profiles.json",
);
const DEFAULT_TEMPLATE_PATH = path.join(
  REPOSITORY_ROOT,
  "client/godot/data/pet_templates.json",
);
const PROFILE_SCHEMA_VERSION = 1;
const ALLOWED_DISTRIBUTIONS = new Set(["uniform", "weighted_center", "rare_spike"]);
const ALLOWED_INDIVIDUAL_RULE_KEYS = new Set([
  "initialOutputSpread",
  "growthOutputSpread",
  "distribution",
  "rareExtremeRate",
  "levelOutputNoiseSpread",
  "levelNoiseDistribution",
  "levelNoiseRareExtremeRate",
]);
const VERSIONED_PROFILE_ID_PATTERN = /^[a-z][a-z0-9_]*_v[1-9][0-9]*$/;
const PROFILE_RESOLUTION_AUTHORITY_V1 = "authority_v1";
const PROFILE_RESOLUTION_LEGACY_EXISTING = "legacy_existing";
const PROFILE_RESOLUTION_LEGACY_UNLINKED = "legacy_unlinked";
const INVALID_AUTHORITY_MODEL_VERSION = "invalid_pet_growth_authority_v1";
const LEGACY_MODEL_VERSIONS = new Set([
  "legacy_individual_v0",
  "legacy_species_linear_v0",
]);
const AUTHORITY_PROFILE_BRAND = Symbol("beastbound.pet-growth-authority-profile");

class PetGrowthCatalogError extends Error {
  constructor(errors) {
    const normalizedErrors = Array.isArray(errors) ? errors.map(String).filter(Boolean) : [String(errors || "")].filter(Boolean);
    super(`pet growth catalog invalid: ${normalizedErrors.join("; ")}`);
    this.name = "PetGrowthCatalogError";
    this.code = "pet_growth_catalog_invalid";
    this.errors = normalizedErrors;
  }
}

function isObjectRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clone(value) {
  return structuredClone(value);
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

function exactKeys(value, keys) {
  return isObjectRecord(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function strictLookupId(value) {
  return typeof value === "string" && value !== "" && value === value.trim() ? value : "";
}

function validateStatMap(value, fieldPath, errors, options = {}) {
  if (!exactKeys(value, STAT_KEYS)) {
    errors.push(`${fieldPath} must contain exactly ${STAT_KEYS.join(",")}`);
    return;
  }
  for (const key of STAT_KEYS) {
    const number = value[key];
    if (typeof number !== "number" || !Number.isFinite(number)) {
      errors.push(`${fieldPath}.${key} must be a finite number`);
      continue;
    }
    if (options.positive && number <= 0) {
      errors.push(`${fieldPath}.${key} must be positive`);
    }
    if (options.integer && !Number.isInteger(number)) {
      errors.push(`${fieldPath}.${key} must be an integer`);
    }
  }
}

function validateRangeMap(value, fieldPath, errors) {
  if (!exactKeys(value, STAT_KEYS)) {
    errors.push(`${fieldPath} must contain exactly ${STAT_KEYS.join(",")}`);
    return;
  }
  for (const key of STAT_KEYS) {
    const range = value[key];
    if (!Array.isArray(range) || range.length !== 2) {
      errors.push(`${fieldPath}.${key} must be a two-number range`);
      continue;
    }
    const [minimum, maximum] = range;
    if (
      typeof minimum !== "number"
      || typeof maximum !== "number"
      || !Number.isFinite(minimum)
      || !Number.isFinite(maximum)
    ) {
      errors.push(`${fieldPath}.${key} must be a finite two-number range`);
    } else if (minimum > maximum) {
      errors.push(`${fieldPath}.${key} minimum must not exceed maximum`);
    }
  }
}

function validateProfile(profile, index, errors) {
  const fieldPath = `profiles[${index}]`;
  if (!isObjectRecord(profile)) {
    errors.push(`${fieldPath} must be an object`);
    return;
  }
  const profileId = String(profile.profileId || "").trim();
  if (!VERSIONED_PROFILE_ID_PATTERN.test(profileId) || profile.profileId !== profileId) {
    errors.push(`${fieldPath}.profileId must be a lowercase versioned id ending in _vN`);
  }
  if (typeof profile.displayName !== "string" || profile.displayName.trim() === "") {
    errors.push(`${fieldPath}.displayName must be non-empty`);
  }
  if (typeof profile.formId !== "string" || profile.formId.trim() === "" || profile.formId !== profile.formId.trim()) {
    errors.push(`${fieldPath}.formId must be a stable non-empty id`);
  }
  if (typeof profile.formName !== "string" || profile.formName.trim() === "") {
    errors.push(`${fieldPath}.formName must be non-empty`);
  }
  validateStatMap(profile.outputBase, `${fieldPath}.outputBase`, errors, {positive: true, integer: true});
  validateStatMap(profile.outputGrowth, `${fieldPath}.outputGrowth`, errors, {positive: true});
  if (!isObjectRecord(profile.individualRules)) {
    errors.push(`${fieldPath}.individualRules must be an object`);
    return;
  }
  for (const key of Object.keys(profile.individualRules)) {
    if (!ALLOWED_INDIVIDUAL_RULE_KEYS.has(key)) {
      errors.push(`${fieldPath}.individualRules.${key} is unknown`);
    }
  }
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
  if (Object.prototype.hasOwnProperty.call(profile.individualRules, "levelOutputNoiseSpread")) {
    validateRangeMap(
      profile.individualRules.levelOutputNoiseSpread,
      `${fieldPath}.individualRules.levelOutputNoiseSpread`,
      errors,
    );
  }
  const distribution = String(profile.individualRules.distribution || "");
  if (!ALLOWED_DISTRIBUTIONS.has(distribution)) {
    errors.push(`${fieldPath}.individualRules.distribution is unsupported`);
  }
  if (!Object.prototype.hasOwnProperty.call(profile.individualRules, "rareExtremeRate")) {
    errors.push(`${fieldPath}.individualRules.rareExtremeRate is required`);
  }
  if (
    !Object.prototype.hasOwnProperty.call(profile.individualRules, "levelOutputNoiseSpread")
    && (
      Object.prototype.hasOwnProperty.call(profile.individualRules, "levelNoiseDistribution")
      || Object.prototype.hasOwnProperty.call(profile.individualRules, "levelNoiseRareExtremeRate")
    )
  ) {
    errors.push(`${fieldPath}.individualRules level-noise settings require levelOutputNoiseSpread`);
  }
  if (Object.prototype.hasOwnProperty.call(profile.individualRules, "levelNoiseDistribution")) {
    const levelDistribution = String(profile.individualRules.levelNoiseDistribution || "");
    if (!ALLOWED_DISTRIBUTIONS.has(levelDistribution)) {
      errors.push(`${fieldPath}.individualRules.levelNoiseDistribution is unsupported`);
    }
  }
  for (const key of ["rareExtremeRate", "levelNoiseRareExtremeRate"]) {
    if (!Object.prototype.hasOwnProperty.call(profile.individualRules, key)) {
      continue;
    }
    const rate = profile.individualRules[key];
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 0.25) {
      errors.push(`${fieldPath}.individualRules.${key} must be between 0 and 0.25`);
    }
  }
  if (exactKeys(profile.outputBase, STAT_KEYS) && exactKeys(profile.individualRules.initialOutputSpread, STAT_KEYS)) {
    for (const key of STAT_KEYS) {
      const range = profile.individualRules.initialOutputSpread[key];
      if (Array.isArray(range) && typeof range[0] === "number" && profile.outputBase[key] + range[0] < 1) {
        errors.push(`${fieldPath}.${key} minimum Lv1 visible stat must remain at least 1`);
      }
    }
  }
  if (exactKeys(profile.outputGrowth, STAT_KEYS) && exactKeys(profile.individualRules.growthOutputSpread, STAT_KEYS)) {
    const noise = isObjectRecord(profile.individualRules.levelOutputNoiseSpread)
      ? profile.individualRules.levelOutputNoiseSpread
      : {};
    for (const key of STAT_KEYS) {
      const growthRange = profile.individualRules.growthOutputSpread[key];
      const noiseRange = noise[key];
      if (Array.isArray(growthRange) && typeof growthRange[0] === "number") {
        const minimumNoise = Array.isArray(noiseRange) && typeof noiseRange[0] === "number" ? noiseRange[0] : 0;
        if (profile.outputGrowth[key] + growthRange[0] + minimumNoise <= 0) {
          errors.push(`${fieldPath}.${key} minimum per-level growth must remain positive`);
        }
      }
    }
  }
}

function authorityProfile(profile) {
  const rules = profile.individualRules;
  const authorityRules = {
    initialOutputSpread: clone(rules.initialOutputSpread),
    growthOutputSpread: clone(rules.growthOutputSpread),
    distribution: rules.distribution,
    rareExtremeRate: rules.rareExtremeRate,
  };
  for (const key of ["levelOutputNoiseSpread", "levelNoiseDistribution", "levelNoiseRareExtremeRate"]) {
    if (Object.prototype.hasOwnProperty.call(rules, key)) {
      authorityRules[key] = clone(rules[key]);
    }
  }
  const result = {
    profileId: profile.profileId,
    formId: profile.formId,
    outputBase: clone(profile.outputBase),
    outputGrowth: clone(profile.outputGrowth),
    individualRules: authorityRules,
  };
  Object.defineProperty(result, AUTHORITY_PROFILE_BRAND, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });
  return deepFreeze(result);
}

function isPetGrowthAuthorityProfile(value) {
  return Boolean(
    isObjectRecord(value)
    && value[AUTHORITY_PROFILE_BRAND] === true
    && Object.isFrozen(value)
  );
}

function templateBaseStats(template) {
  const base = isObjectRecord(template && template.baseStats) ? template.baseStats : {};
  return {
    maxHp: base.maxHp,
    attack: base.attack,
    defense: base.defense,
    quick: base.quick ?? base.agility,
  };
}

function validateTemplateProfilePair(template, profile, fieldPath, errors) {
  if (String(profile.formId || "") !== String(template.formId || "")) {
    errors.push(`${fieldPath}.formId must match ${profile.profileId}.formId`);
  }
  if (String(profile.formName || "") !== String(template.formName || "")) {
    errors.push(`${fieldPath}.formName must match ${profile.profileId}.formName`);
  }
  const base = templateBaseStats(template);
  for (const key of STAT_KEYS) {
    if (base[key] !== profile.outputBase[key]) {
      errors.push(`${fieldPath}.baseStats.${key} must match ${profile.profileId}.outputBase.${key}`);
    }
  }
}

function createPetGrowthCatalog({profileDocument, templateDocument} = {}) {
  const errors = [];
  if (!isObjectRecord(profileDocument)) {
    throw new PetGrowthCatalogError(["profile document must be an object"]);
  }
  if (!isObjectRecord(templateDocument)) {
    throw new PetGrowthCatalogError(["template document must be an object"]);
  }
  if (profileDocument.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    errors.push(`profile document schemaVersion must be ${PROFILE_SCHEMA_VERSION}`);
  }
  if (templateDocument.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    errors.push(`template document schemaVersion must be ${PROFILE_SCHEMA_VERSION}`);
  }
  const profiles = Array.isArray(profileDocument.profiles) ? profileDocument.profiles : null;
  const forms = Array.isArray(templateDocument.forms) ? templateDocument.forms : null;
  if (!profiles) {
    errors.push("profile document profiles must be an array");
  }
  if (!forms) {
    errors.push("template document forms must be an array");
  }
  if (!profiles || !forms) {
    throw new PetGrowthCatalogError(errors);
  }
  if (profiles.length === 0) {
    errors.push("profile document profiles must not be empty");
  }
  if (forms.length === 0) {
    errors.push("template document forms must not be empty");
  }

  const profileById = new Map();
  const profileIdsByDeclaredFormId = new Map();
  for (let index = 0; index < profiles.length; index += 1) {
    const profile = profiles[index];
    validateProfile(profile, index, errors);
    if (!isObjectRecord(profile)) {
      continue;
    }
    const profileId = String(profile.profileId || "").trim();
    if (profileId === "") {
      continue;
    }
    if (profileById.has(profileId)) {
      errors.push(`duplicate pet growth profile id ${profileId}`);
      continue;
    }
    profileById.set(profileId, clone(profile));
    const declaredFormId = String(profile.formId || "").trim();
    if (declaredFormId !== "") {
      const declaredProfileIds = profileIdsByDeclaredFormId.get(declaredFormId) || [];
      declaredProfileIds.push(profileId);
      profileIdsByDeclaredFormId.set(declaredFormId, declaredProfileIds);
    }
  }

  const templateByFormId = new Map();
  const profileIdByFormId = new Map();
  for (let index = 0; index < forms.length; index += 1) {
    const form = forms[index];
    const fieldPath = `forms[${index}]`;
    if (!isObjectRecord(form)) {
      errors.push(`${fieldPath} must be an object`);
      continue;
    }
    const formId = String(form.formId || "").trim();
    if (formId === "" || form.formId !== formId) {
      errors.push(`${fieldPath}.formId must be a stable non-empty id`);
      continue;
    }
    if (templateByFormId.has(formId)) {
      errors.push(`duplicate pet form id ${formId}`);
      continue;
    }
    templateByFormId.set(formId, clone(form));
    const profileId = String(form.growthSpeciesProfileId || "").trim();
    if (profileId !== "" && form.growthSpeciesProfileId !== profileId) {
      errors.push(`${fieldPath}.growthSpeciesProfileId must not contain surrounding whitespace`);
      continue;
    }
    if (profileId === "") {
      continue;
    }
    const profile = profileById.get(profileId);
    if (!profile) {
      errors.push(`${fieldPath}.growthSpeciesProfileId references missing profile ${profileId}`);
      continue;
    }
    validateTemplateProfilePair(form, profile, fieldPath, errors);
    profileIdByFormId.set(formId, profileId);
  }

  for (const [declaredFormId, profileIds] of profileIdsByDeclaredFormId.entries()) {
    if (!templateByFormId.has(declaredFormId)) {
      for (const profileId of profileIds) {
        errors.push(`pet growth profile ${profileId} references missing form ${declaredFormId}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new PetGrowthCatalogError(errors);
  }

  const authorityProfileById = new Map(
    Array.from(profileById.entries()).map(([profileId, profile]) => [profileId, authorityProfile(profile)]),
  );
  return Object.freeze({
    schemaVersion: PROFILE_SCHEMA_VERSION,
    profileCount: profileById.size,
    formCount: templateByFormId.size,
    profiledFormCount: profileIdByFormId.size,
    orphanProfileIds: Object.freeze([]),
    profileById(profileId) {
      return authorityProfileById.get(strictLookupId(profileId)) || null;
    },
    requireProfileById(profileId) {
      const normalizedProfileId = strictLookupId(profileId);
      const profile = authorityProfileById.get(normalizedProfileId);
      if (!profile) {
        throw new PetGrowthCatalogError([`missing pet growth profile ${normalizedProfileId || "<empty>"}`]);
      }
      return profile;
    },
    templateByFormId(formId) {
      const template = templateByFormId.get(strictLookupId(formId));
      return template ? clone(template) : null;
    },
    profileForFormId(formId) {
      const profileId = profileIdByFormId.get(strictLookupId(formId));
      return profileId ? authorityProfileById.get(profileId) || null : null;
    },
    profileIdForFormId(formId) {
      return profileIdByFormId.get(strictLookupId(formId)) || "";
    },
    profileIdsForFormId(formId) {
      const normalizedFormId = strictLookupId(formId);
      return Object.freeze([...(profileIdsByDeclaredFormId.get(normalizedFormId) || [])]);
    },
    profiledFormIds() {
      return Array.from(profileIdByFormId.keys());
    },
    resolveNewPetProfile(pet) {
      if (!isObjectRecord(pet)) {
        throw new PetGrowthCatalogError(["pet profile resolution requires a pet object"]);
      }
      const formId = String(pet.formId || "").trim();
      const templateId = String(pet.templateId || "").trim();
      if (
        (formId !== "" && pet.formId !== formId)
        || (templateId !== "" && pet.templateId !== templateId)
      ) {
        throw new PetGrowthCatalogError(["pet formId and templateId must not contain surrounding whitespace"]);
      }
      if (formId !== "" && templateId !== "" && formId !== templateId) {
        throw new PetGrowthCatalogError([`pet formId ${formId} does not match templateId ${templateId}`]);
      }
      const resolvedFormId = formId || templateId;
      const template = templateByFormId.get(resolvedFormId);
      if (!template) {
        throw new PetGrowthCatalogError([`missing pet template ${resolvedFormId || "<empty>"}`]);
      }
      const linkedProfileId = profileIdByFormId.get(resolvedFormId) || "";
      const instanceProfileId = String(pet.growthSpeciesProfileId || "").trim();
      if (instanceProfileId !== "" && pet.growthSpeciesProfileId !== instanceProfileId) {
        throw new PetGrowthCatalogError(["pet growthSpeciesProfileId must not contain surrounding whitespace"]);
      }
      if (instanceProfileId !== "" && instanceProfileId !== linkedProfileId) {
        throw new PetGrowthCatalogError([
          `pet growthSpeciesProfileId ${instanceProfileId} does not match template link ${linkedProfileId || "<legacy>"}`,
        ]);
      }
      if (linkedProfileId === "") {
        return Object.freeze({kind: PROFILE_RESOLUTION_LEGACY_UNLINKED, formId: resolvedFormId, profileId: "", profile: null});
      }
      return Object.freeze({
        kind: PROFILE_RESOLUTION_AUTHORITY_V1,
        formId: resolvedFormId,
        profileId: linkedProfileId,
        profile: authorityProfileById.get(linkedProfileId),
      });
    },
    resolvePetProfile(pet) {
      if (!isObjectRecord(pet)) {
        throw new PetGrowthCatalogError(["pet profile resolution requires a pet object"]);
      }
      const formId = String(pet.formId || "").trim();
      const templateId = String(pet.templateId || "").trim();
      if (
        (formId !== "" && pet.formId !== formId)
        || (templateId !== "" && pet.templateId !== templateId)
      ) {
        throw new PetGrowthCatalogError(["pet formId and templateId must not contain surrounding whitespace"]);
      }
      if (formId !== "" && templateId !== "" && formId !== templateId) {
        throw new PetGrowthCatalogError([`pet formId ${formId} does not match templateId ${templateId}`]);
      }
      const resolvedFormId = formId || templateId;
      if (!templateByFormId.has(resolvedFormId)) {
        throw new PetGrowthCatalogError([`missing pet template ${resolvedFormId || "<empty>"}`]);
      }
      const instanceProfileId = String(pet.growthSpeciesProfileId || "").trim();
      if (instanceProfileId !== "" && pet.growthSpeciesProfileId !== instanceProfileId) {
        throw new PetGrowthCatalogError(["pet growthSpeciesProfileId must not contain surrounding whitespace"]);
      }
      if (Object.prototype.hasOwnProperty.call(pet, "petGrowth") && !isObjectRecord(pet.petGrowth)) {
        throw new PetGrowthCatalogError(["petGrowth must be an object when present"]);
      }
      if (
        Object.prototype.hasOwnProperty.call(pet, "growthAuthority")
        && (!isObjectRecord(pet.growthAuthority) || pet.growthAuthority.source !== "server")
      ) {
        throw new PetGrowthCatalogError(["growthAuthority must be a server marker when present"]);
      }
      const growth = isObjectRecord(pet.petGrowth) ? pet.petGrowth : {};
      const growthAuthority = isObjectRecord(pet.growthAuthority) ? pet.growthAuthority : {};
      if (Object.prototype.hasOwnProperty.call(pet, "petGrowth") && Object.keys(growth).length === 0) {
        throw new PetGrowthCatalogError(["petGrowth must not be empty when present"]);
      }
      if (Object.prototype.hasOwnProperty.call(pet, "growthAuthority") && Object.keys(growthAuthority).length === 0) {
        throw new PetGrowthCatalogError(["growthAuthority must not be empty when present"]);
      }
      const declaredModelFields = [
        [growth, "modelVersion"],
        [pet, "growthModelVersion"],
        [growthAuthority, "modelVersion"],
      ].filter(([owner, key]) => isObjectRecord(owner) && Object.prototype.hasOwnProperty.call(owner, key));
      if (declaredModelFields.some(([owner, key]) => typeof owner[key] !== "string" || owner[key] === "")) {
        throw new PetGrowthCatalogError(["pet growth model fields must be non-empty strings"]);
      }
      const modelVersions = declaredModelFields.map(([owner, key]) => owner[key]);
      if (
        modelVersions.includes(INVALID_AUTHORITY_MODEL_VERSION)
      ) {
        throw new PetGrowthCatalogError(["invalid authority-v1 pet cannot resolve as legacy growth"]);
      }
      const unsupportedModelVersion = modelVersions.find(
        (value) => value !== MODEL_VERSION && !LEGACY_MODEL_VERSIONS.has(value),
      );
      if (unsupportedModelVersion) {
        throw new PetGrowthCatalogError(["unknown pet growth model cannot resolve as legacy growth"]);
      }
      if (new Set(modelVersions).size > 1) {
        throw new PetGrowthCatalogError(["pet growth model fields conflict"]);
      }
      const authorityShapedGrowth = Object.keys(growth).length > 0 && [
        "schemaVersion",
        "profileId",
        "settledLevel",
        "private",
        "public",
      ].some((key) => Object.prototype.hasOwnProperty.call(growth, key));
      const authorityShapedMarker = Object.keys(growthAuthority).length > 0
        && growthAuthority.source === "server";
      if (
        (authorityShapedGrowth && typeof growth.modelVersion !== "string")
        || (authorityShapedMarker && typeof growthAuthority.modelVersion !== "string")
      ) {
        throw new PetGrowthCatalogError(["authority-shaped pet growth state requires a model version"]);
      }
      if (Object.prototype.hasOwnProperty.call(pet, "petGrowth") && growth.modelVersion !== MODEL_VERSION) {
        throw new PetGrowthCatalogError(["authority-shaped pet growth state cannot resolve as legacy growth"]);
      }
      const declaresAuthorityV1 = growth.modelVersion === MODEL_VERSION
        || pet.growthModelVersion === MODEL_VERSION
        || growthAuthority.modelVersion === MODEL_VERSION;
      if (!declaresAuthorityV1) {
        const kind = profileIdByFormId.has(resolvedFormId)
          ? PROFILE_RESOLUTION_LEGACY_EXISTING
          : PROFILE_RESOLUTION_LEGACY_UNLINKED;
        return Object.freeze({kind, formId: resolvedFormId, profileId: "", profile: null});
      }
      if (growth.modelVersion !== MODEL_VERSION) {
        throw new PetGrowthCatalogError(["authority-v1 pet requires a canonical petGrowth envelope"]);
      }
      if (instanceProfileId === "") {
        throw new PetGrowthCatalogError(["authority-v1 pet requires growthSpeciesProfileId"]);
      }
      if (growth.profileId !== instanceProfileId) {
        throw new PetGrowthCatalogError(["authority-v1 pet growth profile fields do not match"]);
      }
      const profile = profileById.get(instanceProfileId);
      if (!profile) {
        throw new PetGrowthCatalogError([`missing pet growth profile ${instanceProfileId}`]);
      }
      if (profile.formId !== resolvedFormId) {
        throw new PetGrowthCatalogError([
          `pet growthSpeciesProfileId ${instanceProfileId} belongs to form ${profile.formId}, not ${resolvedFormId}`,
        ]);
      }
      return Object.freeze({
        kind: PROFILE_RESOLUTION_AUTHORITY_V1,
        formId: resolvedFormId,
        profileId: instanceProfileId,
        profile: authorityProfileById.get(instanceProfileId),
      });
    },
  });
}

function readJsonDocument(filePath, label) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!isObjectRecord(parsed)) {
      throw new TypeError(`${label} root must be an object`);
    }
    return parsed;
  } catch (error) {
    throw new PetGrowthCatalogError([`${label} load failed: ${error.message}`]);
  }
}

function loadPetGrowthCatalog() {
  return createPetGrowthCatalog({
    profileDocument: readJsonDocument(DEFAULT_PROFILE_PATH, "pet growth profile document"),
    templateDocument: readJsonDocument(DEFAULT_TEMPLATE_PATH, "pet template document"),
  });
}

module.exports = {
  ALLOWED_DISTRIBUTIONS,
  DEFAULT_PROFILE_PATH,
  DEFAULT_TEMPLATE_PATH,
  PROFILE_SCHEMA_VERSION,
  PROFILE_RESOLUTION_AUTHORITY_V1,
  PROFILE_RESOLUTION_LEGACY_EXISTING,
  PROFILE_RESOLUTION_LEGACY_UNLINKED,
  PetGrowthCatalogError,
  createPetGrowthCatalog,
  isPetGrowthAuthorityProfile,
  loadPetGrowthCatalog,
};
