"use strict";

const {isValidPetPrivateSeed} = require("./pet-private-seed");

const STAT_KEYS = Object.freeze(["maxHp", "attack", "defense", "quick"]);
const ELEMENT_KEYS = Object.freeze(["earth", "water", "fire", "wind"]);
const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const PET_ARRAY_CONTAINER_KEYS = new Set(["petInstances", "pets"]);
const GROWTH_AUTHORITY_SCHEMA_VERSION = 1;
const GROWTH_AUTHORITY_SOURCE_SERVER = "server";
const GROWTH_MODEL_LEGACY_INDIVIDUAL = "legacy_individual_v0";
const GROWTH_MODEL_LEGACY_SPECIES_LINEAR = "legacy_species_linear_v0";
const GROWTH_MODEL_AUTHORITY_V1 = "pet_growth_authority_v1";
const GROWTH_MODEL_INVALID_AUTHORITY_V1 = "invalid_pet_growth_authority_v1";

const GROWTH_OBSERVATION_FIELD_KEYS = Object.freeze([
  "schemaVersion",
  "profileId",
  "level",
  "observedLevels",
  "stage",
  "stageLabel",
  "enabled",
  "hasRecord",
  "statAverages",
  "statPercentiles",
  "statGrades",
  "powerGrowthPerLevel",
  "powerPercentile",
  "overallGrade",
]);
const GROWTH_OBSERVATION_NUMBER_FIELD_KEYS = new Set([
  "schemaVersion",
  "level",
  "observedLevels",
  "stage",
  "powerGrowthPerLevel",
  "powerPercentile",
]);
const GROWTH_OBSERVATION_STRING_FIELD_KEYS = new Set([
  "profileId",
  "stageLabel",
  "overallGrade",
]);
const GROWTH_OBSERVATION_BOOLEAN_FIELD_KEYS = new Set(["enabled", "hasRecord"]);

const PET_GROWTH_FIELD_KEYS = Object.freeze([
  "schemaVersion",
  "modelVersion",
  "growthModelVersion",
  "profileId",
  "growthSpeciesProfileId",
  "settledLevel",
  "level",
  "levelOneFourV",
  "stats",
  "growthObservation",
  "public",
]);

const PET_STRING_FIELD_KEYS = new Set([
  "instanceId",
  "petId",
  "templateId",
  "formId",
  "speciesId",
  "lineId",
  "lineName",
  "subtypeId",
  "subtypeName",
  "formName",
  "name",
  "displayName",
  "state",
  "status",
  "binding",
  "growthProfileId",
  "growthTierId",
  "growthTierLabel",
  "growthModelVersion",
  "growthSpeciesProfileId",
  "capturedBattleRoomId",
  "capturedBattleActorId",
  "captureToolId",
]);
const PET_NUMBER_FIELD_KEYS = new Set([
  "schemaVersion",
  "level",
  "exp",
  "nextExp",
  "hp",
  "maxHp",
  "attack",
  "defense",
  "quick",
  "agility",
  "combatPower",
  "capturedSerial",
  "capturedAtSec",
  "acquiredAtSec",
  "partySlot",
  "storageSlot",
  "sortOrder",
]);
const PET_BOOLEAN_FIELD_KEYS = new Set([
  "isNew",
  "locked",
  "bindingLocked",
  "tameEligible",
  "favorite",
  "bound",
]);
const PET_STRING_ARRAY_FIELD_KEYS = new Set([
  "activeSkillIds",
  "petSkillSlots",
  "passiveSkillIds",
  "forgottenSkillIds",
  "captureStatusIds",
  "tags",
]);
const PET_PUBLIC_FIELD_KEYS = Object.freeze([
  ...PET_STRING_FIELD_KEYS,
  ...PET_NUMBER_FIELD_KEYS,
  ...PET_BOOLEAN_FIELD_KEYS,
  ...PET_STRING_ARRAY_FIELD_KEYS,
  "elements",
  "growthAuthority",
  "growthSpeciesLevel1Stats",
  "initialStats",
  "growthObservation",
  "petGrowth",
  "petCultivation",
  "lastCultivationResult",
  "petRebirthHelper",
  "combatPowerBreakdown",
]);

const GROWTH_AUTHORITY_FIELD_KEYS = Object.freeze([
  "schemaVersion",
  "source",
  "modelVersion",
  "settledLevel",
]);
const CULTIVATION_RECORD_FIELD_KEYS = Object.freeze([
  "schemaVersion",
  "rebirthCount",
  "enhanceLevel",
  "rebirthGrowthBonus",
  "history",
  "lastResult",
]);
const CULTIVATION_EVENT_STRING_FIELD_KEYS = new Set([
  "mode",
  "petInstanceId",
  "petName",
  "formId",
  "helperInstanceId",
  "helperName",
  "rebirthBonusGrade",
  "summary",
  "message",
  "itemId",
]);
const CULTIVATION_EVENT_NUMBER_FIELD_KEYS = new Set([
  "schemaVersion",
  "timestamp",
  "helperStage",
  "helperLevel",
  "rebirthBonusPercentile",
  "beforeLevel",
  "afterLevel",
  "beforeRebirthCount",
  "afterRebirthCount",
  "beforeEnhanceLevel",
  "afterEnhanceLevel",
  "amount",
]);
const CULTIVATION_EVENT_FIELD_KEYS = Object.freeze([
  ...CULTIVATION_EVENT_STRING_FIELD_KEYS,
  ...CULTIVATION_EVENT_NUMBER_FIELD_KEYS,
  "visibleGrowthBonus",
  "helperStonePoints",
]);
const COMBAT_POWER_BREAKDOWN_STRING_FIELD_KEYS = new Set(["formula"]);
const COMBAT_POWER_BREAKDOWN_NUMBER_FIELD_KEYS = new Set([
  "maxHp",
  "maxHpContribution",
  "attack",
  "attackContribution",
  "defense",
  "defenseContribution",
  "quick",
  "agility",
  "quickContribution",
  "total",
]);
const COMBAT_POWER_BREAKDOWN_FIELD_KEYS = Object.freeze([
  ...COMBAT_POWER_BREAKDOWN_STRING_FIELD_KEYS,
  ...COMBAT_POWER_BREAKDOWN_NUMBER_FIELD_KEYS,
]);

function isObjectRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function finiteNumber(value) {
  if (isFiniteNumber(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value >= 1;
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function cloneStringArray(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}

function cloneNumericMap(value, keys) {
  if (!isObjectRecord(value)) {
    return {};
  }
  const result = {};
  for (const key of keys) {
    const numeric = hasOwn(value, key) ? finiteNumber(value[key]) : null;
    if (numeric !== null) {
      result[key] = numeric;
    }
  }
  return result;
}

function cloneStringMap(value, keys) {
  if (!isObjectRecord(value)) {
    return {};
  }
  const result = {};
  for (const key of keys) {
    if (hasOwn(value, key) && typeof value[key] === "string") {
      result[key] = value[key];
    }
  }
  return result;
}

function publicGrowthObservation(observation) {
  if (!isObjectRecord(observation)) {
    return {};
  }
  const result = {};
  for (const key of GROWTH_OBSERVATION_FIELD_KEYS) {
    if (!hasOwn(observation, key)) {
      continue;
    }
    if (key === "statGrades") {
      result[key] = cloneStringMap(observation[key], STAT_KEYS);
    } else if (key === "statAverages" || key === "statPercentiles") {
      result[key] = cloneNumericMap(observation[key], STAT_KEYS);
    } else if (GROWTH_OBSERVATION_NUMBER_FIELD_KEYS.has(key) && finiteNumber(observation[key]) !== null) {
      result[key] = finiteNumber(observation[key]);
    } else if (GROWTH_OBSERVATION_STRING_FIELD_KEYS.has(key) && typeof observation[key] === "string") {
      result[key] = observation[key];
    } else if (GROWTH_OBSERVATION_BOOLEAN_FIELD_KEYS.has(key) && typeof observation[key] === "boolean") {
      result[key] = observation[key];
    }
  }
  return result;
}

function publicPetGrowth(value, allowNestedPublic = true) {
  if (!isObjectRecord(value)) {
    return {};
  }
  const result = {};
  for (const key of PET_GROWTH_FIELD_KEYS) {
    if (!hasOwn(value, key)) {
      continue;
    }
    if (key === "levelOneFourV" || key === "stats") {
      result[key] = cloneNumericMap(value[key], STAT_KEYS);
    } else if (key === "growthObservation") {
      result[key] = publicGrowthObservation(value[key]);
    } else if (key === "public") {
      if (allowNestedPublic) {
        result[key] = publicPetGrowth(value[key], false);
      }
    } else if (["schemaVersion", "settledLevel", "level"].includes(key) && finiteNumber(value[key]) !== null) {
      result[key] = finiteNumber(value[key]);
    } else if (
      ["modelVersion", "growthModelVersion", "profileId", "growthSpeciesProfileId"].includes(key)
      && typeof value[key] === "string"
    ) {
      result[key] = value[key];
    }
  }
  return result;
}

function publicGrowthAuthority(value) {
  if (!isObjectRecord(value)) {
    return {};
  }
  const result = {};
  for (const key of GROWTH_AUTHORITY_FIELD_KEYS) {
    if (!hasOwn(value, key)) {
      continue;
    }
    if ((key === "schemaVersion" || key === "settledLevel") && finiteNumber(value[key]) !== null) {
      result[key] = finiteNumber(value[key]);
    } else if ((key === "source" || key === "modelVersion") && typeof value[key] === "string") {
      result[key] = value[key];
    }
  }
  return result;
}

function hasExactNumericStatMap(value) {
  return isObjectRecord(value)
    && Object.keys(value).length === STAT_KEYS.length
    && STAT_KEYS.every((key) => hasOwn(value, key) && isFiniteNumber(value[key]));
}

function hasNumericStatFields(value) {
  return isObjectRecord(value) && STAT_KEYS.every((key) => isFiniteNumber(value[key]));
}

function statMapsEqual(left, right) {
  return hasExactNumericStatMap(left)
    && hasExactNumericStatMap(right)
    && STAT_KEYS.every((key) => left[key] === right[key]);
}

function visibleStatsFromContinuous(value) {
  if (!hasExactNumericStatMap(value)) {
    return {};
  }
  return Object.fromEntries(STAT_KEYS.map((key) => [key, Math.max(1, Math.round(value[key]))]));
}

function declaresAuthorityV1(pet) {
  const growth = isObjectRecord(pet && pet.petGrowth) ? pet.petGrowth : {};
  return growth.modelVersion === GROWTH_MODEL_AUTHORITY_V1;
}

function hasPublicAuthorityV1State(pet) {
  const authority = isObjectRecord(pet && pet.growthAuthority) ? pet.growthAuthority : {};
  const growth = isObjectRecord(pet && pet.petGrowth) ? pet.petGrowth : {};
  const publicState = isObjectRecord(growth.public) ? growth.public : {};
  const level = pet && pet.level;
  return authority.schemaVersion === GROWTH_AUTHORITY_SCHEMA_VERSION
    && authority.source === GROWTH_AUTHORITY_SOURCE_SERVER
    && authority.modelVersion === GROWTH_MODEL_AUTHORITY_V1
    && isPositiveInteger(level)
    && level <= 140
    && authority.settledLevel === level
    && growth.schemaVersion === GROWTH_AUTHORITY_SCHEMA_VERSION
    && growth.modelVersion === GROWTH_MODEL_AUTHORITY_V1
    && growth.settledLevel === level
    && !hasOwn(growth, "private")
    && publicState.schemaVersion === GROWTH_AUTHORITY_SCHEMA_VERSION
    && publicState.growthModelVersion === GROWTH_MODEL_AUTHORITY_V1
    && publicState.growthSpeciesProfileId === pet.growthSpeciesProfileId
    && publicState.level === level
    && hasNumericStatFields(pet)
    && hasExactNumericStatMap(publicState.levelOneFourV)
    && hasExactNumericStatMap(publicState.stats)
    && statMapsEqual(publicState.stats, cloneNumericMap(pet, STAT_KEYS));
}

function hasInvalidAuthorityV1Marker(pet) {
  const authority = isObjectRecord(pet && pet.growthAuthority) ? pet.growthAuthority : {};
  const level = finiteNumber(pet && pet.level);
  return authority.schemaVersion === GROWTH_AUTHORITY_SCHEMA_VERSION
    && authority.source === GROWTH_AUTHORITY_SOURCE_SERVER
    && authority.modelVersion === GROWTH_MODEL_INVALID_AUTHORITY_V1
    && Number.isInteger(level)
    && level >= 1
    && authority.settledLevel === level;
}

function hasAuthorityV1PrivateState(pet) {
  const growth = isObjectRecord(pet && pet.petGrowth) ? pet.petGrowth : {};
  const publicState = isObjectRecord(growth.public) ? growth.public : {};
  const privateState = isObjectRecord(growth.private) ? growth.private : {};
  const privateRoll = isObjectRecord(privateState.privateRoll) ? privateState.privateRoll : {};
  const level = pet && pet.level;
  const profileId = firstNonEmptyString(pet && pet.growthSpeciesProfileId);
  return growth.modelVersion === GROWTH_MODEL_AUTHORITY_V1
    && growth.schemaVersion === GROWTH_AUTHORITY_SCHEMA_VERSION
    && isPositiveInteger(level)
    && level <= 140
    && isPositiveInteger(growth.settledLevel)
    && growth.settledLevel === level
    && profileId !== ""
    && isValidPetPrivateSeed(privateState.privateSeed)
    && Object.keys(privateRoll).length === 4
    && privateRoll.modelVersion === GROWTH_MODEL_AUTHORITY_V1
    && privateRoll.profileId === profileId
    && hasExactNumericStatMap(privateRoll.initialBonus)
    && hasExactNumericStatMap(privateRoll.innateGrowthBonus)
    && hasExactNumericStatMap(privateState.continuousStats)
    && hasNumericStatFields(pet)
    && publicState.schemaVersion === GROWTH_AUTHORITY_SCHEMA_VERSION
    && publicState.growthModelVersion === GROWTH_MODEL_AUTHORITY_V1
    && publicState.growthSpeciesProfileId === profileId
    && publicState.level === level
    && hasExactNumericStatMap(publicState.levelOneFourV)
    && hasExactNumericStatMap(publicState.stats)
    && statMapsEqual(publicState.stats, cloneNumericMap(pet, STAT_KEYS))
    && statMapsEqual(publicState.stats, visibleStatsFromContinuous(privateState.continuousStats));
}

function derivedGrowthAuthority(pet) {
  const numericLevel = finiteNumber(pet && pet.level);
  const level = Number.isInteger(numericLevel) && numericLevel >= 1 ? Math.min(140, numericLevel) : 1;
  let modelVersion = GROWTH_MODEL_LEGACY_INDIVIDUAL;
  if (declaresAuthorityV1(pet)) {
    modelVersion = hasAuthorityV1PrivateState(pet) || hasPublicAuthorityV1State(pet)
      ? GROWTH_MODEL_AUTHORITY_V1
      : GROWTH_MODEL_INVALID_AUTHORITY_V1;
  } else if (hasInvalidAuthorityV1Marker(pet)) {
    modelVersion = GROWTH_MODEL_INVALID_AUTHORITY_V1;
  } else if (typeof (pet && pet.growthSpeciesProfileId) === "string" && pet.growthSpeciesProfileId.trim()) {
    modelVersion = GROWTH_MODEL_LEGACY_SPECIES_LINEAR;
  }
  return {
    "schemaVersion": GROWTH_AUTHORITY_SCHEMA_VERSION,
    "source": GROWTH_AUTHORITY_SOURCE_SERVER,
    modelVersion,
    "settledLevel": level,
  };
}

function publicCultivationEvent(value) {
  if (!isObjectRecord(value)) {
    return {};
  }
  const result = {};
  for (const key of CULTIVATION_EVENT_FIELD_KEYS) {
    if (!hasOwn(value, key)) {
      continue;
    }
    if (key === "visibleGrowthBonus" || key === "helperStonePoints") {
      result[key] = cloneNumericMap(value[key], STAT_KEYS);
    } else if (CULTIVATION_EVENT_STRING_FIELD_KEYS.has(key) && typeof value[key] === "string") {
      result[key] = value[key];
    } else if (CULTIVATION_EVENT_NUMBER_FIELD_KEYS.has(key) && finiteNumber(value[key]) !== null) {
      result[key] = finiteNumber(value[key]);
    }
  }
  return result;
}

function publicCultivationRecord(value) {
  if (!isObjectRecord(value)) {
    return {};
  }
  const result = {};
  for (const key of CULTIVATION_RECORD_FIELD_KEYS) {
    if (!hasOwn(value, key)) {
      continue;
    }
    if (["schemaVersion", "rebirthCount", "enhanceLevel"].includes(key) && finiteNumber(value[key]) !== null) {
      result[key] = finiteNumber(value[key]);
    } else if (key === "rebirthGrowthBonus") {
      result[key] = cloneNumericMap(value[key], STAT_KEYS);
    } else if (key === "history") {
      result[key] = Array.isArray(value[key]) ? value[key].map(publicCultivationEvent) : [];
    } else if (key === "lastResult") {
      result[key] = publicCultivationEvent(value[key]);
    }
  }
  return result;
}

function publicPetRebirthHelper(value) {
  if (!isObjectRecord(value)) {
    return {};
  }
  const result = {};
  if (finiteNumber(value.schemaVersion) !== null) {
    result.schemaVersion = finiteNumber(value.schemaVersion);
  }
  if (finiteNumber(value.stage) !== null) {
    result.stage = finiteNumber(value.stage);
  }
  if (hasOwn(value, "stonePoints")) {
    result.stonePoints = cloneNumericMap(value.stonePoints, STAT_KEYS);
  }
  return result;
}

function publicCombatPowerBreakdown(value) {
  if (!isObjectRecord(value)) {
    return {};
  }
  const result = {};
  for (const key of COMBAT_POWER_BREAKDOWN_FIELD_KEYS) {
    if (!hasOwn(value, key)) {
      continue;
    }
    if (COMBAT_POWER_BREAKDOWN_STRING_FIELD_KEYS.has(key) && typeof value[key] === "string") {
      result[key] = value[key];
    } else if (COMBAT_POWER_BREAKDOWN_NUMBER_FIELD_KEYS.has(key) && finiteNumber(value[key]) !== null) {
      result[key] = finiteNumber(value[key]);
    }
  }
  return result;
}

function looksLikePet(value) {
  if (!isObjectRecord(value)) {
    return false;
  }
  const hasIdentity = typeof value.instanceId === "string" || typeof value.petId === "string";
  if (!hasIdentity) {
    return false;
  }
  const statCount = ["maxHp", "attack", "defense", "quick"]
    .filter((key) => hasOwn(value, key)).length;
  return (
    typeof value.formId === "string"
    || typeof value.templateId === "string"
    || typeof value.speciesId === "string"
    || statCount >= 2
  );
}

function publicPet(pet) {
  if (!isObjectRecord(pet)) {
    return {};
  }
  const result = {};
  const growthAuthority = derivedGrowthAuthority(pet);
  for (const key of PET_PUBLIC_FIELD_KEYS) {
    if (!hasOwn(pet, key)) {
      continue;
    }
    const value = pet[key];
    if (PET_STRING_FIELD_KEYS.has(key) && typeof value === "string") {
      result[key] = value;
    } else if (PET_NUMBER_FIELD_KEYS.has(key) && finiteNumber(value) !== null) {
      result[key] = finiteNumber(value);
    } else if (PET_BOOLEAN_FIELD_KEYS.has(key) && typeof value === "boolean") {
      result[key] = value;
    } else if (PET_STRING_ARRAY_FIELD_KEYS.has(key)) {
      result[key] = cloneStringArray(value);
    } else if (key === "elements") {
      result[key] = cloneNumericMap(value, ELEMENT_KEYS);
    } else if (key === "growthSpeciesLevel1Stats" || key === "initialStats") {
      result[key] = cloneNumericMap(value, STAT_KEYS);
    } else if (key === "growthObservation") {
      result[key] = publicGrowthObservation(value);
    } else if (key === "growthAuthority") {
      result[key] = publicGrowthAuthority(value);
    } else if (key === "petGrowth") {
      if (growthAuthority.modelVersion === GROWTH_MODEL_AUTHORITY_V1) {
        result[key] = publicPetGrowth(value);
      }
    } else if (key === "petCultivation") {
      result[key] = publicCultivationRecord(value);
    } else if (key === "lastCultivationResult") {
      result[key] = publicCultivationEvent(value);
    } else if (key === "petRebirthHelper") {
      result[key] = publicPetRebirthHelper(value);
    } else if (key === "combatPowerBreakdown") {
      result[key] = publicCombatPowerBreakdown(value);
    }
  }
  const identity = firstNonEmptyString(pet.instanceId, pet.petId, pet.id);
  if (identity !== "") {
    result.instanceId = identity;
    result.petId = identity;
    const formId = firstNonEmptyString(pet.formId, pet.templateId, pet.speciesId);
    if (formId !== "") {
      result.formId = formId;
      result.templateId = formId;
    }
    const name = firstNonEmptyString(pet.name, pet.displayName, pet.speciesName);
    if (name !== "") {
      result.name = name;
    }
    const state = firstNonEmptyString(pet.state, pet.status, pet.battleState);
    if (state !== "") {
      result.state = state;
    }
    if (
      (!isObjectRecord(result.petRebirthHelper) || Object.keys(result.petRebirthHelper).length === 0)
      && isObjectRecord(pet.rebirthHelper)
    ) {
      result.petRebirthHelper = publicPetRebirthHelper(pet.rebirthHelper);
    }
    result.growthAuthority = growthAuthority;
    result.growthModelVersion = growthAuthority.modelVersion;
  }
  return result;
}

function cloneProfileValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneProfileValue(entry));
  }
  if (!isObjectRecord(value)) {
    return value;
  }
  if (looksLikePet(value)) {
    return publicPet(value);
  }
  const result = {};
  for (const [key, nested] of Object.entries(value)) {
    if (UNSAFE_OBJECT_KEYS.has(key)) {
      continue;
    }
    if (key === "petGrowth") {
      result[key] = publicPetGrowth(nested);
    } else {
      result[key] = cloneProfileValue(nested);
    }
  }
  return result;
}

function publicProfile(profile) {
  if (!isObjectRecord(profile)) {
    return {};
  }
  const result = {};
  for (const [key, value] of Object.entries(profile)) {
    if (UNSAFE_OBJECT_KEYS.has(key)) {
      continue;
    }
    if (PET_ARRAY_CONTAINER_KEYS.has(key) && Array.isArray(value)) {
      result[key] = value.map(publicPet);
      continue;
    }
    if ((key === "trainingPartners" || key === "groundPetDrops") && Array.isArray(value)) {
      result[key] = value.map((entry) => {
        if (!isObjectRecord(entry)) {
          return cloneProfileValue(entry);
        }
        const projected = cloneProfileValue(entry);
        if (isObjectRecord(entry.pet)) {
          projected.pet = publicPet(entry.pet);
        }
        return projected;
      });
      continue;
    }
    result[key] = cloneProfileValue(value);
  }
  return result;
}

module.exports = {
  GROWTH_MODEL_AUTHORITY_V1,
  GROWTH_MODEL_INVALID_AUTHORITY_V1,
  GROWTH_MODEL_LEGACY_INDIVIDUAL,
  GROWTH_MODEL_LEGACY_SPECIES_LINEAR,
  publicGrowthObservation,
  publicPet,
  publicProfile,
};
