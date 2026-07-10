"use strict";

const {
  PROFILE_RESOLUTION_AUTHORITY_V1,
  PROFILE_RESOLUTION_LEGACY_EXISTING,
  PROFILE_RESOLUTION_LEGACY_UNLINKED,
} = require("./pet-growth-catalog");
const {MODEL_VERSION, STAT_KEYS} = require("./pet-growth-authority");
const {settlePetGrowthToLevel} = require("./pet-growth-runtime");

const ERROR_CONFIGURATION_INVALID = "pet_exp_configuration_invalid";
const ERROR_INPUT_INVALID = "pet_exp_input_invalid";
const ERROR_AWARD_INVALID = "pet_exp_award_invalid";
const ERROR_GROWTH_RESOLUTION_FAILED = "pet_exp_growth_resolution_failed";
const ERROR_AUTHORITY_V1_DISABLED = "pet_exp_authority_v1_disabled";
const ERROR_GROWTH_STATE_INVALID = "pet_exp_growth_state_invalid";
const PUBLIC_ERROR_AUTHORITY_V1_DISABLED = "pet_growth_runtime_disabled";
const PUBLIC_ERROR_GROWTH_STATE_INVALID = "pet_growth_state_invalid";

const AWARD_KEYS = Object.freeze([
  "level",
  "exp",
  "nextExp",
  "levelsGained",
  "overflowExp",
]);
const SETTLEMENT_KEYS = Object.freeze([
  "schemaVersion",
  "modelVersion",
  "profileId",
  "fromLevel",
  "toLevel",
  "levels",
]);
const SETTLEMENT_LEVEL_KEYS = Object.freeze([
  "level",
  "stats",
  "visibleDelta",
]);

class PetExpSettlementError extends Error {
  constructor(code, errors = []) {
    const safeErrors = normalizedErrors(errors);
    super(`pet exp settlement rejected ${String(code || ERROR_INPUT_INVALID)}${safeErrors.length > 0 ? `: ${safeErrors.join("; ")}` : ""}`);
    this.name = "PetExpSettlementError";
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

function hasExactKeys(value, keys) {
  return isObjectRecord(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => hasOwn(value, key));
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

function strictPositiveInteger(value) {
  return Number.isInteger(value) && value >= 1;
}

function strictNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function normalizedBefore(entry, fallbackNextExp = 1) {
  return {
    level: Math.max(1, Math.trunc(Number(entry.level || 1))),
    exp: Math.max(0, Math.trunc(Number(entry.exp || 0))),
    nextExp: Math.max(1, Math.trunc(Number(entry.nextExp || fallbackNextExp || 1))),
  };
}

function validateAward(award, before, maxLevel) {
  const errors = [];
  if (!hasExactKeys(award, AWARD_KEYS)) {
    return ["calculateAward must return the canonical award shape"];
  }
  if (!strictPositiveInteger(award.level) || award.level > maxLevel) {
    errors.push("award.level must remain within the requested maximum level");
  }
  if (!strictNonNegativeInteger(award.exp)) {
    errors.push("award.exp must be a non-negative integer");
  }
  if (!strictPositiveInteger(award.nextExp)) {
    errors.push("award.nextExp must be a positive integer");
  }
  if (!strictNonNegativeInteger(award.levelsGained)) {
    errors.push("award.levelsGained must be a non-negative integer");
  }
  if (!strictNonNegativeInteger(award.overflowExp)) {
    errors.push("award.overflowExp must be a non-negative integer");
  }
  if (strictPositiveInteger(award.level) && award.level < before.level) {
    errors.push("calculateAward must not lower the pet level");
  }
  if (
    strictPositiveInteger(award.level)
    && strictNonNegativeInteger(award.levelsGained)
    && award.levelsGained !== award.level - before.level
  ) {
    errors.push("award.levelsGained does not match the level transition");
  }
  if (strictPositiveInteger(award.level) && award.level < maxLevel && award.overflowExp !== 0) {
    errors.push("award.overflowExp is only valid at the maximum level");
  }
  if (award.level === maxLevel && award.exp !== 0) {
    errors.push("award.exp must be zero at the maximum level");
  }
  return errors;
}

function validateStatMap(value, fieldPath, errors, options = {}) {
  if (!hasExactKeys(value, STAT_KEYS)) {
    errors.push(`${fieldPath} must contain exactly four stat axes`);
    return;
  }
  for (const key of STAT_KEYS) {
    const numeric = value[key];
    if (!Number.isInteger(numeric)) {
      errors.push(`${fieldPath}.${key} must be an integer`);
    } else if (options.positive && numeric < 1) {
      errors.push(`${fieldPath}.${key} must be positive`);
    }
  }
}

function publicGrowthSettlement(value, profileId, fromLevel, toLevel) {
  const errors = [];
  if (!hasExactKeys(value, SETTLEMENT_KEYS)) {
    throw new PetExpSettlementError(ERROR_GROWTH_STATE_INVALID, [
      "growth settlement has a non-public shape",
    ]);
  }
  if (value.schemaVersion !== 1) {
    errors.push("growth settlement schemaVersion is unsupported");
  }
  if (value.modelVersion !== MODEL_VERSION) {
    errors.push("growth settlement modelVersion is unsupported");
  }
  if (value.profileId !== profileId) {
    errors.push("growth settlement profileId is inconsistent");
  }
  if (value.fromLevel !== fromLevel || value.toLevel !== toLevel) {
    errors.push("growth settlement level range is inconsistent");
  }
  if (!Array.isArray(value.levels)) {
    errors.push("growth settlement levels must be an array");
  } else if (value.levels.length !== Math.max(0, toLevel - fromLevel)) {
    errors.push("growth settlement level evidence count is inconsistent");
  } else {
    for (let index = 0; index < value.levels.length; index += 1) {
      const level = value.levels[index];
      if (!hasExactKeys(level, SETTLEMENT_LEVEL_KEYS)) {
        errors.push("growth settlement level evidence has a non-public shape");
        continue;
      }
      if (level.level !== fromLevel + index + 1) {
        errors.push("growth settlement level evidence is not sequential");
      }
      validateStatMap(level.stats, "growth settlement stats", errors, {positive: true});
      validateStatMap(level.visibleDelta, "growth settlement visibleDelta", errors);
    }
  }
  if (errors.length > 0) {
    throw new PetExpSettlementError(ERROR_GROWTH_STATE_INVALID, errors);
  }
  return {
    schemaVersion: 1,
    modelVersion: MODEL_VERSION,
    profileId,
    fromLevel,
    toLevel,
    levels: value.levels.map((level) => ({
      level: level.level,
      stats: Object.fromEntries(STAT_KEYS.map((key) => [key, level.stats[key]])),
      visibleDelta: Object.fromEntries(STAT_KEYS.map((key) => [key, level.visibleDelta[key]])),
    })),
  };
}

function publicExpSummary(entry, options, before, award) {
  return {
    name: String(options.name || entry.name || entry.displayName || ""),
    beforeLevel: before.level,
    level: award.level,
    beforeExp: before.exp,
    exp: award.exp,
    nextExp: award.nextExp,
    levelsGained: award.levelsGained,
    overflowExp: award.overflowExp,
    schemaVersion: 1,
  };
}

function validateFactoryOptions(options) {
  const errors = [];
  if (!isObjectRecord(options)) {
    return ["factory options must be an object"];
  }
  const allowedKeys = ["growthCatalog", "calculateAward", "enableAuthorityV1"];
  if (Object.keys(options).some((key) => !allowedKeys.includes(key))) {
    errors.push("factory options contain unknown fields");
  }
  if (
    !isObjectRecord(options.growthCatalog)
    || !Object.isFrozen(options.growthCatalog)
    || typeof options.growthCatalog.resolvePetProfile !== "function"
  ) {
    errors.push("growthCatalog must be an injected strict frozen catalog");
  }
  if (typeof options.calculateAward !== "function") {
    errors.push("calculateAward must be an injected pure function");
  }
  if (hasOwn(options, "enableAuthorityV1") && typeof options.enableAuthorityV1 !== "boolean") {
    errors.push("enableAuthorityV1 must be boolean");
  }
  return errors;
}

function createPetExpSettlement(options = {}) {
  const configurationErrors = validateFactoryOptions(options);
  if (configurationErrors.length > 0) {
    throw new PetExpSettlementError(ERROR_CONFIGURATION_INVALID, configurationErrors);
  }
  const growthCatalog = options.growthCatalog;
  const calculateAward = options.calculateAward;
  const enableAuthorityV1 = options.enableAuthorityV1 === true;

  function settle(entry, amount, maxLevel, settleOptions = {}) {
    if (!isObjectRecord(entry)) {
      throw new PetExpSettlementError(ERROR_INPUT_INVALID, ["pet exp entry must be an object"]);
    }
    if (!strictNonNegativeInteger(amount)) {
      throw new PetExpSettlementError(ERROR_INPUT_INVALID, ["pet exp amount must be a non-negative integer"]);
    }
    if (!strictPositiveInteger(maxLevel)) {
      throw new PetExpSettlementError(ERROR_INPUT_INVALID, ["pet maxLevel must be a positive integer"]);
    }
    if (!isObjectRecord(settleOptions)) {
      throw new PetExpSettlementError(ERROR_INPUT_INVALID, ["pet exp settle options must be an object"]);
    }
    if (Object.keys(settleOptions).some((key) => key !== "name")) {
      throw new PetExpSettlementError(ERROR_INPUT_INVALID, ["pet exp settle options contain unknown fields"]);
    }

    let source;
    try {
      source = clone(entry);
    } catch (_error) {
      throw new PetExpSettlementError(ERROR_INPUT_INVALID, ["pet exp entry must be serializable"]);
    }
    const routeInput = deepFreeze(clone(source));
    let resolution;
    try {
      resolution = growthCatalog.resolvePetProfile(routeInput);
    } catch (_error) {
      throw new PetExpSettlementError(ERROR_GROWTH_RESOLUTION_FAILED, [
        "pet growth route could not be resolved",
      ]);
    }
    if (!isObjectRecord(resolution)) {
      throw new PetExpSettlementError(ERROR_GROWTH_RESOLUTION_FAILED, [
        "pet growth route is invalid",
      ]);
    }

    const kind = resolution.kind;
    if (kind === PROFILE_RESOLUTION_AUTHORITY_V1 && !enableAuthorityV1) {
      throw new PetExpSettlementError(ERROR_AUTHORITY_V1_DISABLED, [
        "authority-v1 pet exp settlement is disabled",
      ]);
    }
    if (![PROFILE_RESOLUTION_AUTHORITY_V1, PROFILE_RESOLUTION_LEGACY_EXISTING, PROFILE_RESOLUTION_LEGACY_UNLINKED].includes(kind)) {
      throw new PetExpSettlementError(ERROR_GROWTH_RESOLUTION_FAILED, [
        "pet growth route kind is unsupported",
      ]);
    }

    const before = normalizedBefore(source);
    let award;
    try {
      award = calculateAward(deepFreeze(clone(source)), amount, maxLevel);
    } catch (_error) {
      throw new PetExpSettlementError(ERROR_AWARD_INVALID, ["calculateAward failed"]);
    }
    const awardErrors = validateAward(award, before, maxLevel);
    if (awardErrors.length > 0) {
      throw new PetExpSettlementError(ERROR_AWARD_INVALID, awardErrors);
    }

    const comparableBefore = normalizedBefore(source, award.nextExp);
    const publicExp = publicExpSummary(source, settleOptions, comparableBefore, award);
    const changed = comparableBefore.level !== award.level
      || comparableBefore.exp !== award.exp
      || comparableBefore.nextExp !== award.nextExp;

    if (kind === PROFILE_RESOLUTION_LEGACY_EXISTING || kind === PROFILE_RESOLUTION_LEGACY_UNLINKED) {
      const pet = clone(source);
      pet.level = award.level;
      pet.exp = award.exp;
      pet.nextExp = award.nextExp;
      return {
        pet,
        changed,
        publicExp,
        settlement: null,
      };
    }

    let growthResult;
    try {
      growthResult = settlePetGrowthToLevel(source, resolution.profile, award.level);
    } catch (_error) {
      throw new PetExpSettlementError(ERROR_GROWTH_STATE_INVALID, [
        "authority-v1 pet growth state is invalid",
      ]);
    }
    const settlement = publicGrowthSettlement(
      growthResult.settlement,
      resolution.profileId,
      before.level,
      award.level,
    );
    const pet = growthResult.pet;
    pet.exp = award.exp;
    pet.nextExp = award.nextExp;
    return {
      pet,
      changed: changed || growthResult.changed,
      publicExp,
      settlement,
    };
  }

  return Object.freeze({settle});
}

function publicPetExpSettlementFailure(error) {
  const disabled = error instanceof PetExpSettlementError
    && error.code === ERROR_AUTHORITY_V1_DISABLED;
  return {
    ok: false,
    code: disabled ? PUBLIC_ERROR_AUTHORITY_V1_DISABLED : PUBLIC_ERROR_GROWTH_STATE_INVALID,
    message: disabled
      ? "这只宠物的新版成长结算尚未启用，本次经验未结算。"
      : "宠物成长数据异常，本次经验未结算。",
    schemaVersion: 1,
  };
}

module.exports = {
  ERROR_AUTHORITY_V1_DISABLED,
  ERROR_AWARD_INVALID,
  ERROR_CONFIGURATION_INVALID,
  ERROR_GROWTH_RESOLUTION_FAILED,
  ERROR_GROWTH_STATE_INVALID,
  ERROR_INPUT_INVALID,
  PUBLIC_ERROR_AUTHORITY_V1_DISABLED,
  PUBLIC_ERROR_GROWTH_STATE_INVALID,
  PetExpSettlementError,
  createPetExpSettlement,
  publicPetExpSettlementFailure,
};
