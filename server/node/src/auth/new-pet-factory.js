"use strict";

const {
  PROFILE_RESOLUTION_AUTHORITY_V1,
  PROFILE_RESOLUTION_LEGACY_UNLINKED,
} = require("./pet-growth-catalog");
const {initializePetGrowth} = require("./pet-growth-runtime");
const {initializeNewLegacyPetPrivateState} = require("./pet-private-state");
const {generatePetPrivateSeed} = require("./pet-private-seed");

const ERROR_CONFIGURATION_INVALID = "new_pet_factory_configuration_invalid";
const ERROR_INPUT_INVALID = "new_pet_factory_input_invalid";
const ERROR_GROWTH_RESOLUTION_FAILED = "new_pet_factory_growth_resolution_failed";
const ERROR_GROWTH_INITIALIZATION_FAILED = "new_pet_factory_growth_initialization_failed";
const PURPOSE_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const STAT_KEYS = Object.freeze(["maxHp", "attack", "defense", "quick"]);
const FRESH_STATE_FORBIDDEN_KEYS = Object.freeze([
  "continuousStats",
  "growthAuthority",
  "growthBonus",
  "growthModelVersion",
  "growthPrivate",
  "growthRecord",
  "growthSpeciesLevel1Stats",
  "growthSpeciesRoll",
  "growthSpeciesSampleNo",
  "growthSpeciesSeed",
  "helperGrowthWeights",
  "individualQualityLabel",
  "individualQualityScore",
  "individualSeed",
  "individualVariance",
  "initialBonus",
  "initialStats",
  "innateGrowthBonus",
  "internalGrowthBonus",
  "lastCultivationResult",
  "petCultivation",
  "petGrowth",
  "petGrowthPrivate",
  "privateRoll",
  "privateSeed",
  "qualityRoll",
  "rebirthBonusInternalPower",
  "rebirthRollSeed",
  "settledContinuousStats",
]);

class NewPetFactoryError extends Error {
  constructor(code, errors = []) {
    const safeErrors = normalizedErrors(errors);
    super(`new pet factory rejected ${String(code || ERROR_INPUT_INVALID)}${safeErrors.length > 0 ? `: ${safeErrors.join("; ")}` : ""}`);
    this.name = "NewPetFactoryError";
    this.code = String(code || ERROR_INPUT_INVALID);
    this.errors = safeErrors;
  }
}

function normalizedErrors(errors) {
  return (Array.isArray(errors) ? errors : [errors])
    .map((error) => String(error || "").trim())
    .filter(Boolean);
}

function isObjectRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value, visited = new WeakSet()) {
  if (!value || typeof value !== "object" || visited.has(value)) {
    return value;
  }
  visited.add(value);
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested, visited);
  }
  return value;
}

function validateFactoryOptions(options) {
  const errors = [];
  if (!isObjectRecord(options)) {
    return ["factory options must be an object"];
  }
  if (Object.keys(options).some((key) => key !== "growthCatalog")) {
    errors.push("factory options contain unknown fields");
  }
  if (
    !isObjectRecord(options.growthCatalog)
    || !Object.isFrozen(options.growthCatalog)
    || typeof options.growthCatalog.resolveNewPetProfile !== "function"
  ) {
    errors.push("growthCatalog must be an injected strict frozen catalog");
  }
  return errors;
}

function validateFinalizeOptions(options) {
  if (!isObjectRecord(options)) {
    return ["finalize options must be an object"];
  }
  if (Object.keys(options).length !== 1 || !hasOwn(options, "purpose")) {
    return ["finalize options must contain only purpose"];
  }
  if (typeof options.purpose !== "string" || !PURPOSE_PATTERN.test(options.purpose)) {
    return ["purpose must be a stable private-seed namespace"];
  }
  return [];
}

function validateCandidate(candidate) {
  const errors = [];
  if (!isObjectRecord(candidate)) {
    return ["candidate must be an object"];
  }
  if (candidate.level !== 1) {
    errors.push("candidate must be exactly level one");
  }
  const instanceId = typeof candidate.instanceId === "string" ? candidate.instanceId.trim() : "";
  const petId = typeof candidate.petId === "string" ? candidate.petId.trim() : "";
  if (instanceId === "" && petId === "") {
    errors.push("candidate requires a stable instance identity");
  }
  if (
    (instanceId !== "" && candidate.instanceId !== instanceId)
    || (petId !== "" && candidate.petId !== petId)
    || (instanceId !== "" && petId !== "" && instanceId !== petId)
  ) {
    errors.push("candidate instance identities are inconsistent");
  }
  const formId = typeof candidate.formId === "string" ? candidate.formId.trim() : "";
  const templateId = typeof candidate.templateId === "string" ? candidate.templateId.trim() : "";
  if (formId === "" && templateId === "") {
    errors.push("candidate requires a stable form identity");
  }
  if (
    (formId !== "" && candidate.formId !== formId)
    || (templateId !== "" && candidate.templateId !== templateId)
    || (formId !== "" && templateId !== "" && formId !== templateId)
  ) {
    errors.push("candidate form identities are inconsistent");
  }
  for (const key of STAT_KEYS) {
    if (!Number.isInteger(candidate[key]) || candidate[key] < 1) {
      errors.push(`candidate.${key} must be a positive integer`);
    }
  }
  if (!Number.isInteger(candidate.hp) || candidate.hp < 0 || candidate.hp > candidate.maxHp) {
    errors.push("candidate.hp must be an integer within maxHp");
  }
  if (FRESH_STATE_FORBIDDEN_KEYS.some((key) => hasOwn(candidate, key))) {
    errors.push("candidate must not contain existing growth or cultivation state");
  }
  return errors;
}

function validateResolution(resolution) {
  if (!isObjectRecord(resolution)) {
    return ["new-pet growth route is invalid"];
  }
  if (resolution.kind === PROFILE_RESOLUTION_AUTHORITY_V1) {
    if (
      typeof resolution.profileId !== "string"
      || resolution.profileId.trim() === ""
      || resolution.profileId !== resolution.profileId.trim()
      || !isObjectRecord(resolution.profile)
    ) {
      return ["authority-v1 route is incomplete"];
    }
    return [];
  }
  if (resolution.kind === PROFILE_RESOLUTION_LEGACY_UNLINKED) {
    if (String(resolution.profileId || "") !== "" || resolution.profile !== null) {
      return ["legacy-unlinked route contains authority state"];
    }
    return [];
  }
  return ["new-pet growth route kind is unsupported"];
}

function createNewPetFactory(options = {}) {
  const configurationErrors = validateFactoryOptions(options);
  if (configurationErrors.length > 0) {
    throw new NewPetFactoryError(ERROR_CONFIGURATION_INVALID, configurationErrors);
  }
  const growthCatalog = options.growthCatalog;

  function finalizeLevelOne(candidate, finalizeOptions = {}) {
    const optionErrors = validateFinalizeOptions(finalizeOptions);
    if (optionErrors.length > 0) {
      throw new NewPetFactoryError(ERROR_INPUT_INVALID, optionErrors);
    }

    let source;
    try {
      source = clone(candidate);
    } catch (_error) {
      throw new NewPetFactoryError(ERROR_INPUT_INVALID, ["candidate must be cloneable"]);
    }
    const candidateErrors = validateCandidate(source);
    if (candidateErrors.length > 0) {
      throw new NewPetFactoryError(ERROR_INPUT_INVALID, candidateErrors);
    }

    let resolution;
    try {
      resolution = growthCatalog.resolveNewPetProfile(deepFreeze(clone(source)));
    } catch (_error) {
      throw new NewPetFactoryError(ERROR_GROWTH_RESOLUTION_FAILED, [
        "new-pet growth route could not be resolved",
      ]);
    }
    const resolutionErrors = validateResolution(resolution);
    if (resolutionErrors.length > 0) {
      throw new NewPetFactoryError(ERROR_GROWTH_RESOLUTION_FAILED, resolutionErrors);
    }

    let privateSeed;
    try {
      privateSeed = generatePetPrivateSeed(finalizeOptions.purpose);
    } catch (_error) {
      throw new NewPetFactoryError(ERROR_GROWTH_INITIALIZATION_FAILED, [
        "new-pet private identity could not be created",
      ]);
    }

    if (resolution.kind === PROFILE_RESOLUTION_AUTHORITY_V1) {
      source.growthSpeciesProfileId = resolution.profileId;
      try {
        const initialized = initializePetGrowth(source, resolution.profile, {privateSeed});
        return {
          pet: initialized.pet,
          growthKind: PROFILE_RESOLUTION_AUTHORITY_V1,
          profileId: resolution.profileId,
          schemaVersion: 1,
        };
      } catch (_error) {
        throw new NewPetFactoryError(ERROR_GROWTH_INITIALIZATION_FAILED, [
          "authority-v1 growth initialization failed",
        ]);
      }
    }

    source.individualSeed = privateSeed;
    try {
      const pet = initializeNewLegacyPetPrivateState(
        source,
        finalizeOptions.purpose,
        {knownLevelOneStats: true},
      );
      return {
        pet,
        growthKind: PROFILE_RESOLUTION_LEGACY_UNLINKED,
        profileId: "",
        schemaVersion: 1,
      };
    } catch (_error) {
      throw new NewPetFactoryError(ERROR_GROWTH_INITIALIZATION_FAILED, [
        "legacy growth initialization failed",
      ]);
    }
  }

  return Object.freeze({finalizeLevelOne});
}

module.exports = {
  ERROR_CONFIGURATION_INVALID,
  ERROR_GROWTH_INITIALIZATION_FAILED,
  ERROR_GROWTH_RESOLUTION_FAILED,
  ERROR_INPUT_INVALID,
  NewPetFactoryError,
  createNewPetFactory,
};
