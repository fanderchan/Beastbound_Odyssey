"use strict";

const {
  PROFILE_RESOLUTION_AUTHORITY_V1,
  PROFILE_RESOLUTION_LEGACY_EXISTING,
  PROFILE_RESOLUTION_LEGACY_UNLINKED,
} = require("./pet-growth-catalog");
const {
  restartPetGrowthCycle,
  validatePetGrowth,
} = require("./pet-growth-runtime");

const ERROR_CONFIGURATION_INVALID = "pet_rebirth_growth_configuration_invalid";
const ERROR_INPUT_INVALID = "pet_rebirth_growth_input_invalid";
const ERROR_RESOLUTION_FAILED = "pet_rebirth_growth_resolution_failed";
const ERROR_STATE_INVALID = "pet_rebirth_growth_state_invalid";
const PUBLIC_ERROR_STATE_INVALID = "pet_growth_state_invalid";

class PetRebirthGrowthCycleError extends Error {
  constructor(code, errors = []) {
    const safeErrors = normalizedErrors(errors);
    super(`pet rebirth growth cycle rejected ${String(code || ERROR_STATE_INVALID)}${safeErrors.length > 0 ? `: ${safeErrors.join("; ")}` : ""}`);
    this.name = "PetRebirthGrowthCycleError";
    this.code = String(code || ERROR_STATE_INVALID);
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
    || typeof options.growthCatalog.resolvePetProfile !== "function"
  ) {
    errors.push("growthCatalog must be an injected strict frozen catalog");
  }
  return errors;
}

function createPetRebirthGrowthCycle(options = {}) {
  const configurationErrors = validateFactoryOptions(options);
  if (configurationErrors.length > 0) {
    throw new PetRebirthGrowthCycleError(ERROR_CONFIGURATION_INVALID, configurationErrors);
  }
  const growthCatalog = options.growthCatalog;

  function resolveValidated(pet) {
    if (!isObjectRecord(pet)) {
      throw new PetRebirthGrowthCycleError(ERROR_INPUT_INVALID, ["pet must be an object"]);
    }
    let source;
    let resolution;
    try {
      source = clone(pet);
      resolution = growthCatalog.resolvePetProfile(deepFreeze(clone(source)));
    } catch (_error) {
      throw new PetRebirthGrowthCycleError(ERROR_RESOLUTION_FAILED, [
        "pet growth route could not be resolved",
      ]);
    }
    if (!isObjectRecord(resolution)) {
      throw new PetRebirthGrowthCycleError(ERROR_RESOLUTION_FAILED, [
        "pet growth route is invalid",
      ]);
    }
    const kind = resolution.kind;
    if (![PROFILE_RESOLUTION_AUTHORITY_V1, PROFILE_RESOLUTION_LEGACY_EXISTING, PROFILE_RESOLUTION_LEGACY_UNLINKED].includes(kind)) {
      throw new PetRebirthGrowthCycleError(ERROR_RESOLUTION_FAILED, [
        "pet growth route kind is unsupported",
      ]);
    }
    if (kind === PROFILE_RESOLUTION_AUTHORITY_V1) {
      const validation = validatePetGrowth(source, resolution.profile);
      if (!validation.ok) {
        throw new PetRebirthGrowthCycleError(ERROR_STATE_INVALID, [
          "authority-v1 pet growth state is invalid",
        ]);
      }
    }
    return {source, resolution};
  }

  function preflight(pet) {
    const {resolution} = resolveValidated(pet);
    return Object.freeze({
      kind: resolution.kind,
      profileId: String(resolution.profileId || ""),
      authorityV1: resolution.kind === PROFILE_RESOLUTION_AUTHORITY_V1,
    });
  }

  function restart(pet, nextPetCultivation) {
    const {source, resolution} = resolveValidated(pet);
    if (resolution.kind !== PROFILE_RESOLUTION_AUTHORITY_V1) {
      return {
        pet: source,
        kind: resolution.kind,
        profileId: "",
        restarted: false,
      };
    }
    if (!isObjectRecord(nextPetCultivation)) {
      throw new PetRebirthGrowthCycleError(ERROR_INPUT_INVALID, [
        "nextPetCultivation must be an object",
      ]);
    }
    const currentCultivation = source.petGrowth.private.cultivation;
    const nextGrowthBonus = nextPetCultivation.rebirthGrowthBonus;
    let result;
    try {
      result = restartPetGrowthCycle(source, resolution.profile, {
        cultivation: {
          schemaVersion: 1,
          initialBonus: clone(currentCultivation.initialBonus),
          growthBonus: clone(nextGrowthBonus),
        },
        petCultivation: clone(nextPetCultivation),
      });
    } catch (_error) {
      throw new PetRebirthGrowthCycleError(ERROR_STATE_INVALID, [
        "authority-v1 pet growth cycle could not be restarted",
      ]);
    }
    return {
      pet: result.pet,
      kind: resolution.kind,
      profileId: String(resolution.profileId || ""),
      restarted: true,
    };
  }

  return Object.freeze({preflight, restart});
}

function publicPetRebirthGrowthCycleFailure(_error) {
  return {
    ok: false,
    code: PUBLIC_ERROR_STATE_INVALID,
    message: "宠物成长数据异常，本次转生未执行，转生MM未消耗。",
    schemaVersion: 1,
  };
}

module.exports = {
  ERROR_CONFIGURATION_INVALID,
  ERROR_INPUT_INVALID,
  ERROR_RESOLUTION_FAILED,
  ERROR_STATE_INVALID,
  PUBLIC_ERROR_STATE_INVALID,
  PetRebirthGrowthCycleError,
  createPetRebirthGrowthCycle,
  publicPetRebirthGrowthCycleFailure,
};
