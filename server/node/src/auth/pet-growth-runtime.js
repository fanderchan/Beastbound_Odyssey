"use strict";

const {isDeepStrictEqual} = require("node:util");

const {
  MAX_LEVEL,
  MODEL_VERSION,
  STAT_KEYS,
  buildPublicSnapshot,
  continuousStatsAtLevel,
  derivePrivateRoll,
  growthDeltaForLevel,
  quantize,
  roundHalfAwayFromZero,
} = require("./pet-growth-authority");
const {isValidPetPrivateSeed} = require("./pet-private-seed");
const {isPetGrowthAuthorityProfile} = require("./pet-growth-catalog");

const RUNTIME_SCHEMA_VERSION = 1;
const ERROR_INPUT_INVALID = "pet_growth_input_invalid";
const ERROR_PROFILE_MISMATCH = "pet_growth_profile_mismatch";
const ERROR_STATE_INVALID = "pet_growth_state_invalid";
const ERROR_INITIALIZATION_CONFLICT = "pet_growth_initialization_conflict";
const ERROR_TARGET_INVALID = "pet_growth_target_invalid";
const ERROR_LEVEL_ROLLBACK = "pet_growth_level_rollback";

const PET_GROWTH_KEYS = Object.freeze([
  "schemaVersion",
  "modelVersion",
  "profileId",
  "settledLevel",
  "private",
  "public",
]);
const PRIVATE_STATE_KEYS = Object.freeze([
  "schemaVersion",
  "privateSeed",
  "privateRoll",
  "cultivation",
  "continuousStats",
]);
const CULTIVATION_KEYS = Object.freeze([
  "schemaVersion",
  "initialBonus",
  "growthBonus",
]);
const LEGACY_PRIVATE_FIELD_KEYS = Object.freeze([
  "continuousStats",
  "growthBonus",
  "growthPrivate",
  "growthRecord",
  "individualSeed",
  "individualVariance",
  "individualQualityScore",
  "individualQualityLabel",
  "growthSpeciesSeed",
  "growthSpeciesSampleNo",
  "growthSpeciesRoll",
  "helperGrowthWeights",
  "initialBonus",
  "innateGrowthBonus",
  "internalGrowthBonus",
  "petGrowthPrivate",
  "privateRoll",
  "privateSeed",
  "qualityRoll",
  "rebirthBonusInternalPower",
  "rebirthRollSeed",
  "settledContinuousStats",
]);

class PetGrowthRuntimeError extends Error {
  constructor(code, errors = []) {
    const safeErrors = normalizedErrors(errors);
    super(`pet growth runtime rejected ${String(code || ERROR_STATE_INVALID)}${safeErrors.length > 0 ? `: ${safeErrors.join("; ")}` : ""}`);
    this.name = "PetGrowthRuntimeError";
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

function zeroStatMap() {
  return Object.fromEntries(STAT_KEYS.map((key) => [key, 0]));
}

function validateStatMap(value, fieldPath, errors, options = {}) {
  if (!hasExactKeys(value, STAT_KEYS)) {
    errors.push(`${fieldPath} must contain exactly four stat axes`);
    return;
  }
  for (const key of STAT_KEYS) {
    const numeric = value[key];
    if (typeof numeric !== "number" || !Number.isFinite(numeric)) {
      errors.push(`${fieldPath}.${key} must be a finite number`);
      continue;
    }
    if (options.integer && !Number.isInteger(numeric)) {
      errors.push(`${fieldPath}.${key} must be an integer`);
    }
    if (options.positive && numeric <= 0) {
      errors.push(`${fieldPath}.${key} must be greater than zero`);
    }
    if (Number.isFinite(options.minimum) && numeric < options.minimum) {
      errors.push(`${fieldPath}.${key} must be at least ${options.minimum}`);
    }
    if (options.quantized && quantize(numeric) !== numeric) {
      errors.push(`${fieldPath}.${key} must be quantized to six decimals`);
    }
  }
}

function validateAuthorityProfile(profile) {
  const errors = [];
  if (!isObjectRecord(profile)) {
    return ["profile must be an object"];
  }
  if (!isPetGrowthAuthorityProfile(profile)) {
    errors.push("profile must come from the strict pet growth catalog");
  }
  if (
    typeof profile.profileId !== "string"
    || profile.profileId.trim() === ""
    || profile.profileId !== profile.profileId.trim()
  ) {
    errors.push("profile.profileId must be a stable non-empty id");
  }
  if (
    typeof profile.formId !== "string"
    || profile.formId.trim() === ""
    || profile.formId !== profile.formId.trim()
  ) {
    errors.push("profile.formId must be a stable non-empty id");
  }
  validateStatMap(profile.outputBase, "profile.outputBase", errors, {minimum: 1});
  validateStatMap(profile.outputGrowth, "profile.outputGrowth", errors, {positive: true});
  if (!isObjectRecord(profile.individualRules)) {
    errors.push("profile.individualRules must be an object");
  }
  return errors;
}

function validatePetIdentity(pet) {
  const errors = [];
  if (!isObjectRecord(pet)) {
    return ["pet must be an object"];
  }
  const instanceId = typeof pet.instanceId === "string" ? pet.instanceId.trim() : "";
  const petId = typeof pet.petId === "string" ? pet.petId.trim() : "";
  if (
    (instanceId !== "" && pet.instanceId !== instanceId)
    || (petId !== "" && pet.petId !== petId)
  ) {
    errors.push("pet instance identity must not contain surrounding whitespace");
  }
  if (instanceId === "" && petId === "") {
    errors.push("pet requires a stable instance identity");
  }
  if (instanceId !== "" && petId !== "" && instanceId !== petId) {
    errors.push("pet.instanceId and pet.petId must match");
  }
  const formId = typeof pet.formId === "string" ? pet.formId.trim() : "";
  const templateId = typeof pet.templateId === "string" ? pet.templateId.trim() : "";
  if (
    (formId !== "" && pet.formId !== formId)
    || (templateId !== "" && pet.templateId !== templateId)
  ) {
    errors.push("pet form identity must not contain surrounding whitespace");
  }
  if (formId === "" && templateId === "") {
    errors.push("pet requires a stable form identity");
  }
  if (formId !== "" && templateId !== "" && formId !== templateId) {
    errors.push("pet.formId and pet.templateId must match");
  }
  return errors;
}

function validateProfileLink(pet, profile) {
  const profileId = isObjectRecord(profile) && typeof profile.profileId === "string"
    ? profile.profileId.trim()
    : "";
  const petProfileId = isObjectRecord(pet) && typeof pet.growthSpeciesProfileId === "string"
    ? pet.growthSpeciesProfileId.trim()
    : "";
  const formId = isObjectRecord(pet) && typeof pet.formId === "string" && pet.formId.trim()
    ? pet.formId.trim()
    : (isObjectRecord(pet) && typeof pet.templateId === "string" ? pet.templateId.trim() : "");
  return profileId !== ""
    && petProfileId === profileId
    && pet.growthSpeciesProfileId === petProfileId
    && profile.formId === formId
    ? []
    : ["pet growth profile or form link does not match the resolved authority profile"];
}

function canonicalCultivation(value) {
  if (value === undefined) {
    return {
      schemaVersion: RUNTIME_SCHEMA_VERSION,
      initialBonus: zeroStatMap(),
      growthBonus: zeroStatMap(),
    };
  }
  if (!isObjectRecord(value)) {
    throw new PetGrowthRuntimeError(ERROR_INPUT_INVALID, ["cultivation must be an object"]);
  }
  const inputKeys = Object.keys(value);
  const allowedKeys = inputKeys.length === 2
    ? ["initialBonus", "growthBonus"]
    : CULTIVATION_KEYS;
  if (!hasExactKeys(value, allowedKeys)) {
    throw new PetGrowthRuntimeError(ERROR_INPUT_INVALID, ["cultivation has a non-canonical shape"]);
  }
  if (hasOwn(value, "schemaVersion") && value.schemaVersion !== RUNTIME_SCHEMA_VERSION) {
    throw new PetGrowthRuntimeError(ERROR_INPUT_INVALID, ["cultivation schemaVersion is unsupported"]);
  }
  const errors = [];
  validateStatMap(value.initialBonus, "cultivation.initialBonus", errors, {quantized: true});
  validateStatMap(value.growthBonus, "cultivation.growthBonus", errors, {quantized: true});
  if (errors.length > 0) {
    throw new PetGrowthRuntimeError(ERROR_INPUT_INVALID, errors);
  }
  return {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    initialBonus: Object.fromEntries(STAT_KEYS.map((key) => [key, quantize(value.initialBonus[key])])),
    growthBonus: Object.fromEntries(STAT_KEYS.map((key) => [key, quantize(value.growthBonus[key])])),
  };
}

function validateCanonicalCultivation(value, errors) {
  if (!hasExactKeys(value, CULTIVATION_KEYS)) {
    errors.push("petGrowth.private.cultivation has a non-canonical shape");
    return;
  }
  if (value.schemaVersion !== RUNTIME_SCHEMA_VERSION) {
    errors.push("petGrowth.private.cultivation schemaVersion is unsupported");
  }
  validateStatMap(value.initialBonus, "petGrowth.private.cultivation.initialBonus", errors, {quantized: true});
  validateStatMap(value.growthBonus, "petGrowth.private.cultivation.growthBonus", errors, {quantized: true});
}

function validateVisibleCultivationLink(pet, cultivation, errors) {
  if (!hasOwn(pet, "petCultivation")) {
    return;
  }
  if (!isObjectRecord(pet.petCultivation)) {
    errors.push("pet.petCultivation must be an object when present");
    return;
  }
  if (!hasOwn(pet.petCultivation, "rebirthGrowthBonus")) {
    return;
  }
  const linkErrors = [];
  validateStatMap(
    pet.petCultivation.rebirthGrowthBonus,
    "pet.petCultivation.rebirthGrowthBonus",
    linkErrors,
    {quantized: true},
  );
  errors.push(...linkErrors);
  if (
    linkErrors.length === 0
    && !isDeepStrictEqual(pet.petCultivation.rebirthGrowthBonus, cultivation.growthBonus)
  ) {
    errors.push("pet.petCultivation rebirthGrowthBonus does not match frozen growth cultivation");
  }
}

function visibleStatsFromContinuous(continuousStats) {
  return Object.fromEntries(STAT_KEYS.map((key) => [
    key,
    Math.max(1, roundHalfAwayFromZero(continuousStats[key])),
  ]));
}

function currentRootStats(pet) {
  return Object.fromEntries(STAT_KEYS.map((key) => [key, pet[key]]));
}

function validateRootState(pet, errors) {
  if (!Number.isInteger(pet.level) || pet.level < 1 || pet.level > MAX_LEVEL) {
    errors.push("pet.level must be an integer in the supported range");
  }
  validateStatMap(currentRootStats(pet), "pet", errors, {integer: true, minimum: 1});
  if (!Number.isInteger(pet.hp)) {
    errors.push("pet.hp must be an integer");
  } else if (Number.isInteger(pet.maxHp) && (pet.hp < 0 || pet.hp > pet.maxHp)) {
    errors.push("pet.hp must remain between zero and maxHp");
  }
}

function failedValidation(code, errors) {
  return {
    ok: false,
    code,
    errors: normalizedErrors(errors),
  };
}

function validatePetGrowth(pet, profile) {
  const profileErrors = validateAuthorityProfile(profile);
  if (profileErrors.length > 0) {
    return failedValidation(ERROR_INPUT_INVALID, profileErrors);
  }
  const identityErrors = validatePetIdentity(pet);
  if (identityErrors.length > 0) {
    return failedValidation(ERROR_INPUT_INVALID, identityErrors);
  }
  const linkErrors = validateProfileLink(pet, profile);
  if (linkErrors.length > 0) {
    return failedValidation(ERROR_PROFILE_MISMATCH, linkErrors);
  }

  const errors = [];
  validateRootState(pet, errors);
  for (const key of LEGACY_PRIVATE_FIELD_KEYS) {
    if (hasOwn(pet, key)) {
      errors.push(`pet.${key} must not coexist with canonical v1 growth state`);
    }
  }
  if (hasOwn(pet, "growthAuthority")) {
    errors.push("pet.growthAuthority is response-derived and must not be persisted");
  }
  if (hasOwn(pet, "growthModelVersion") && pet.growthModelVersion !== MODEL_VERSION) {
    errors.push("pet.growthModelVersion does not match the runtime model");
  }
  validateStatMap(pet.initialStats, "pet.initialStats", errors, {integer: true, minimum: 1});
  validateStatMap(
    pet.growthSpeciesLevel1Stats,
    "pet.growthSpeciesLevel1Stats",
    errors,
    {integer: true, minimum: 1},
  );

  const growth = pet.petGrowth;
  if (!hasExactKeys(growth, PET_GROWTH_KEYS)) {
    errors.push("pet.petGrowth has a non-canonical shape");
    return failedValidation(ERROR_STATE_INVALID, errors);
  }
  if (growth.schemaVersion !== RUNTIME_SCHEMA_VERSION) {
    errors.push("pet.petGrowth schemaVersion is unsupported");
  }
  if (growth.modelVersion !== MODEL_VERSION) {
    errors.push("pet.petGrowth modelVersion is unsupported");
  }
  if (growth.profileId !== profile.profileId || growth.profileId !== pet.growthSpeciesProfileId) {
    errors.push("pet.petGrowth profileId is inconsistent");
  }
  if (!Number.isInteger(growth.settledLevel) || growth.settledLevel !== pet.level) {
    errors.push("pet.petGrowth settledLevel is inconsistent");
  }

  const privateState = growth.private;
  if (!hasExactKeys(privateState, PRIVATE_STATE_KEYS)) {
    errors.push("pet.petGrowth.private has a non-canonical shape");
    return failedValidation(ERROR_STATE_INVALID, errors);
  }
  if (privateState.schemaVersion !== RUNTIME_SCHEMA_VERSION) {
    errors.push("pet.petGrowth.private schemaVersion is unsupported");
  }
  if (!isValidPetPrivateSeed(privateState.privateSeed)) {
    errors.push("pet.petGrowth.private privateSeed is invalid");
  }
  validateCanonicalCultivation(privateState.cultivation, errors);
  validateVisibleCultivationLink(pet, privateState.cultivation, errors);
  validateStatMap(
    privateState.continuousStats,
    "pet.petGrowth.private.continuousStats",
    errors,
    {quantized: true},
  );

  if (errors.length > 0) {
    return failedValidation(ERROR_STATE_INVALID, errors);
  }

  try {
    const expectedRoll = derivePrivateRoll(profile, privateState.privateSeed);
    if (!isDeepStrictEqual(privateState.privateRoll, expectedRoll)) {
      errors.push("pet.petGrowth.private privateRoll does not match its private seed");
    }
    const expectedContinuous = continuousStatsAtLevel(
      profile,
      privateState.privateSeed,
      pet.level,
      expectedRoll,
      privateState.cultivation,
    );
    if (!isDeepStrictEqual(privateState.continuousStats, expectedContinuous)) {
      errors.push("pet.petGrowth.private continuousStats do not match deterministic settlement");
    }
    const expectedPublic = buildPublicSnapshot(
      profile,
      privateState.privateSeed,
      pet.level,
      expectedRoll,
      privateState.cultivation,
    );
    if (!isDeepStrictEqual(growth.public, expectedPublic)) {
      errors.push("pet.petGrowth.public does not match deterministic settlement");
    }
    if (!isDeepStrictEqual(currentRootStats(pet), expectedPublic.stats)) {
      errors.push("pet root stats do not match the public growth snapshot");
    }
    if (!isDeepStrictEqual(pet.initialStats, expectedPublic.levelOneFourV)) {
      errors.push("pet.initialStats do not match immutable level-one facts");
    }
    if (!isDeepStrictEqual(pet.growthSpeciesLevel1Stats, expectedPublic.levelOneFourV)) {
      errors.push("pet.growthSpeciesLevel1Stats do not match immutable level-one facts");
    }
    if (!isDeepStrictEqual(
      visibleStatsFromContinuous(privateState.continuousStats),
      expectedPublic.stats,
    )) {
      errors.push("pet visible stats do not match the continuous accumulator");
    }
  } catch (_error) {
    errors.push("pet growth deterministic recomputation failed");
  }

  return errors.length > 0
    ? failedValidation(ERROR_STATE_INVALID, errors)
    : {ok: true, code: "", errors: []};
}

function throwForValidation(result, fallbackCode = ERROR_STATE_INVALID) {
  if (!result || !result.ok) {
    throw new PetGrowthRuntimeError(result && result.code ? result.code : fallbackCode, result && result.errors);
  }
}

function validateFreshPetForInitialization(pet, privateSeed, cultivation, expectedPublic) {
  const errors = [];
  validateRootState(pet, errors);
  if (pet.level !== 1) {
    errors.push("new authority growth initialization requires a level-one pet");
  }
  if (hasOwn(pet, "individualSeed") && pet.individualSeed !== privateSeed) {
    errors.push("legacy individualSeed conflicts with the supplied private seed");
  }
  for (const key of LEGACY_PRIVATE_FIELD_KEYS) {
    if (key !== "individualSeed" && hasOwn(pet, key)) {
      errors.push(`pet.${key} requires an explicit legacy migration instead of initialization`);
    }
  }
  if (hasOwn(pet, "growthModelVersion") && pet.growthModelVersion !== MODEL_VERSION) {
    errors.push("pet.growthModelVersion conflicts with authority v1 initialization");
  }
  for (const field of ["initialStats", "growthSpeciesLevel1Stats"]) {
    if (!hasOwn(pet, field)) {
      continue;
    }
    const fieldErrors = [];
    validateStatMap(pet[field], `pet.${field}`, fieldErrors, {integer: true, minimum: 1});
    if (fieldErrors.length > 0 || !isDeepStrictEqual(pet[field], expectedPublic.levelOneFourV)) {
      errors.push(`pet.${field} conflicts with deterministic level-one facts`);
    }
  }
  validateVisibleCultivationLink(pet, cultivation, errors);
  if (errors.length > 0) {
    throw new PetGrowthRuntimeError(ERROR_INITIALIZATION_CONFLICT, errors);
  }
}

function initializePetGrowth(pet, profile, options = {}) {
  const profileErrors = validateAuthorityProfile(profile);
  if (profileErrors.length > 0) {
    throw new PetGrowthRuntimeError(ERROR_INPUT_INVALID, profileErrors);
  }
  const identityErrors = validatePetIdentity(pet);
  if (identityErrors.length > 0) {
    throw new PetGrowthRuntimeError(ERROR_INPUT_INVALID, identityErrors);
  }
  const linkErrors = validateProfileLink(pet, profile);
  if (linkErrors.length > 0) {
    throw new PetGrowthRuntimeError(ERROR_PROFILE_MISMATCH, linkErrors);
  }
  if (!isObjectRecord(options)) {
    throw new PetGrowthRuntimeError(ERROR_INPUT_INVALID, ["initialization options must be an object"]);
  }
  const optionKeys = Object.keys(options);
  if (optionKeys.some((key) => !["privateSeed", "cultivation"].includes(key))) {
    throw new PetGrowthRuntimeError(ERROR_INPUT_INVALID, ["initialization options contain unknown fields"]);
  }
  const privateSeed = options.privateSeed;
  if (!isValidPetPrivateSeed(privateSeed)) {
    throw new PetGrowthRuntimeError(ERROR_INPUT_INVALID, ["privateSeed is invalid"]);
  }
  const cultivation = canonicalCultivation(options.cultivation);

  if (hasOwn(pet, "petGrowth")) {
    const existingValidation = validatePetGrowth(pet, profile);
    if (!existingValidation.ok) {
      throw new PetGrowthRuntimeError(ERROR_INITIALIZATION_CONFLICT, existingValidation.errors);
    }
    const existingPrivate = pet.petGrowth.private;
    if (
      existingPrivate.privateSeed !== privateSeed
      || !isDeepStrictEqual(existingPrivate.cultivation, cultivation)
    ) {
      throw new PetGrowthRuntimeError(ERROR_INITIALIZATION_CONFLICT, [
        "existing authority growth identity or cultivation differs",
      ]);
    }
    return {pet: clone(pet), changed: false};
  }

  let privateRoll;
  let continuousStats;
  let publicSnapshot;
  try {
    privateRoll = derivePrivateRoll(profile, privateSeed);
    continuousStats = continuousStatsAtLevel(profile, privateSeed, 1, privateRoll, cultivation);
    publicSnapshot = buildPublicSnapshot(profile, privateSeed, 1, privateRoll, cultivation);
  } catch (_error) {
    throw new PetGrowthRuntimeError(ERROR_INPUT_INVALID, ["authority growth initialization failed"]);
  }
  validateFreshPetForInitialization(pet, privateSeed, cultivation, publicSnapshot);

  const oldMaxHp = pet.maxHp;
  const oldHp = pet.hp;
  const missingHp = Math.max(0, oldMaxHp - oldHp);
  const next = clone(pet);
  for (const key of LEGACY_PRIVATE_FIELD_KEYS) {
    delete next[key];
  }
  delete next.growthAuthority;
  next.growthModelVersion = MODEL_VERSION;
  next.level = 1;
  for (const key of STAT_KEYS) {
    next[key] = publicSnapshot.stats[key];
  }
  next.hp = oldHp === 0
    ? 0
    : Math.max(0, Math.min(next.maxHp, next.maxHp - missingHp));
  next.initialStats = clone(publicSnapshot.levelOneFourV);
  next.growthSpeciesLevel1Stats = clone(publicSnapshot.levelOneFourV);
  next.petGrowth = {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    modelVersion: MODEL_VERSION,
    profileId: profile.profileId,
    settledLevel: 1,
    private: {
      schemaVersion: RUNTIME_SCHEMA_VERSION,
      privateSeed,
      privateRoll: clone(privateRoll),
      cultivation: clone(cultivation),
      continuousStats: clone(continuousStats),
    },
    public: clone(publicSnapshot),
  };

  throwForValidation(validatePetGrowth(next, profile));
  return {pet: next, changed: true};
}

function settlementEnvelope(profileId, fromLevel, toLevel, levels) {
  return {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    modelVersion: MODEL_VERSION,
    profileId,
    fromLevel,
    toLevel,
    levels,
  };
}

function settlePetGrowthToLevel(pet, profile, targetLevel) {
  const validation = validatePetGrowth(pet, profile);
  throwForValidation(validation);
  if (!Number.isInteger(targetLevel) || targetLevel < 1 || targetLevel > MAX_LEVEL) {
    throw new PetGrowthRuntimeError(ERROR_TARGET_INVALID, [
      "targetLevel must be an integer in the supported range",
    ]);
  }
  const fromLevel = pet.petGrowth.settledLevel;
  if (targetLevel < fromLevel) {
    throw new PetGrowthRuntimeError(ERROR_LEVEL_ROLLBACK, [
      "ordinary growth settlement cannot lower a pet level",
    ]);
  }
  if (targetLevel === fromLevel) {
    return {
      pet: clone(pet),
      changed: false,
      settlement: settlementEnvelope(profile.profileId, fromLevel, targetLevel, []),
    };
  }

  const next = clone(pet);
  const privateState = next.petGrowth.private;
  const privateSeed = privateState.privateSeed;
  const privateRoll = privateState.privateRoll;
  const cultivation = privateState.cultivation;
  const continuousStats = clone(privateState.continuousStats);
  let previousVisible = currentRootStats(next);
  const levels = [];

  try {
    for (let level = fromLevel + 1; level <= targetLevel; level += 1) {
      const delta = growthDeltaForLevel(
        profile,
        privateSeed,
        level,
        privateRoll,
        cultivation,
      );
      for (const key of STAT_KEYS) {
        continuousStats[key] = quantize(continuousStats[key] + delta[key]);
      }
      const visibleStats = visibleStatsFromContinuous(continuousStats);
      const visibleDelta = Object.fromEntries(STAT_KEYS.map((key) => [
        key,
        visibleStats[key] - previousVisible[key],
      ]));
      levels.push({
        level,
        stats: clone(visibleStats),
        visibleDelta,
      });
      previousVisible = visibleStats;
    }
  } catch (_error) {
    throw new PetGrowthRuntimeError(ERROR_STATE_INVALID, ["incremental growth settlement failed"]);
  }

  let publicSnapshot;
  try {
    publicSnapshot = buildPublicSnapshot(
      profile,
      privateSeed,
      targetLevel,
      privateRoll,
      cultivation,
    );
  } catch (_error) {
    throw new PetGrowthRuntimeError(ERROR_STATE_INVALID, ["growth settlement verification failed"]);
  }
  if (!isDeepStrictEqual(previousVisible, publicSnapshot.stats)) {
    throw new PetGrowthRuntimeError(ERROR_STATE_INVALID, [
      "incremental growth settlement diverged from the authority model",
    ]);
  }

  const oldMaxHp = pet.maxHp;
  const oldHp = pet.hp;
  const missingHp = Math.max(0, oldMaxHp - oldHp);
  next.level = targetLevel;
  for (const key of STAT_KEYS) {
    next[key] = publicSnapshot.stats[key];
  }
  next.hp = oldHp === 0
    ? 0
    : Math.max(0, Math.min(next.maxHp, next.maxHp - missingHp));
  next.petGrowth.settledLevel = targetLevel;
  next.petGrowth.private.continuousStats = continuousStats;
  next.petGrowth.public = clone(publicSnapshot);

  throwForValidation(validatePetGrowth(next, profile));
  return {
    pet: next,
    changed: true,
    settlement: settlementEnvelope(profile.profileId, fromLevel, targetLevel, levels),
  };
}

module.exports = {
  ERROR_INITIALIZATION_CONFLICT,
  ERROR_INPUT_INVALID,
  ERROR_LEVEL_ROLLBACK,
  ERROR_PROFILE_MISMATCH,
  ERROR_STATE_INVALID,
  ERROR_TARGET_INVALID,
  PetGrowthRuntimeError,
  RUNTIME_SCHEMA_VERSION,
  initializePetGrowth,
  settlePetGrowthToLevel,
  validatePetGrowth,
};
