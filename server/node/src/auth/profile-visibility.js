"use strict";

const STAT_KEYS = Object.freeze(["maxHp", "attack", "defense", "quick"]);
const ELEMENT_KEYS = Object.freeze(["earth", "water", "fire", "wind"]);
const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const PET_ARRAY_CONTAINER_KEYS = new Set(["petInstances", "pets"]);
const PET_OBJECT_CONTAINER_KEYS = new Set(["pet"]);

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
  "lastPreview",
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

const KNOWN_PRIVATE_GROWTH_FIELD_KEYS = new Set([
  "continuousStats",
  "growthBonus",
  "growthPrivate",
  "growthRecord",
  "growthSpeciesRoll",
  "growthSpeciesSampleNo",
  "growthSpeciesSeed",
  "helperGrowthWeights",
  "individualQualityLabel",
  "individualQualityScore",
  "individualSeed",
  "individualVariance",
  "initialBonus",
  "innateGrowthBonus",
  "internalGrowthBonus",
  "petGrowthPrivate",
  "privateRoll",
  "privateSeed",
  "qualityLabel",
  "qualityPercentile",
  "qualityRoll",
  "qualityScore",
  "qualityTier",
  "rebirthBonusInternalPower",
  "rebirthRollSeed",
  "settledContinuousStats",
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

function cloneStringArray(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}

function cloneNumericMap(value, keys) {
  if (!isObjectRecord(value)) {
    return {};
  }
  const result = {};
  for (const key of keys) {
    if (hasOwn(value, key) && isFiniteNumber(value[key])) {
      result[key] = value[key];
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
    } else if (GROWTH_OBSERVATION_NUMBER_FIELD_KEYS.has(key) && isFiniteNumber(observation[key])) {
      result[key] = observation[key];
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
    } else if (["schemaVersion", "settledLevel", "level"].includes(key) && isFiniteNumber(value[key])) {
      result[key] = value[key];
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
    if ((key === "schemaVersion" || key === "settledLevel") && isFiniteNumber(value[key])) {
      result[key] = value[key];
    } else if ((key === "source" || key === "modelVersion") && typeof value[key] === "string") {
      result[key] = value[key];
    }
  }
  return result;
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
    } else if (CULTIVATION_EVENT_NUMBER_FIELD_KEYS.has(key) && isFiniteNumber(value[key])) {
      result[key] = value[key];
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
    if (["schemaVersion", "rebirthCount", "enhanceLevel"].includes(key) && isFiniteNumber(value[key])) {
      result[key] = value[key];
    } else if (key === "rebirthGrowthBonus") {
      result[key] = cloneNumericMap(value[key], STAT_KEYS);
    } else if (key === "history") {
      result[key] = Array.isArray(value[key]) ? value[key].map(publicCultivationEvent) : [];
    } else if (key === "lastPreview" || key === "lastResult") {
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
  if (isFiniteNumber(value.schemaVersion)) {
    result.schemaVersion = value.schemaVersion;
  }
  if (isFiniteNumber(value.stage)) {
    result.stage = value.stage;
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
    } else if (COMBAT_POWER_BREAKDOWN_NUMBER_FIELD_KEYS.has(key) && isFiniteNumber(value[key])) {
      result[key] = value[key];
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
  for (const key of PET_PUBLIC_FIELD_KEYS) {
    if (!hasOwn(pet, key)) {
      continue;
    }
    const value = pet[key];
    if (PET_STRING_FIELD_KEYS.has(key) && typeof value === "string") {
      result[key] = value;
    } else if (PET_NUMBER_FIELD_KEYS.has(key) && isFiniteNumber(value)) {
      result[key] = value;
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
      result[key] = publicPetGrowth(value);
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
  return result;
}

function isKnownPrivateGrowthKey(key) {
  if (KNOWN_PRIVATE_GROWTH_FIELD_KEYS.has(key)) {
    return true;
  }
  const normalized = String(key).toLowerCase();
  return (
    normalized.includes("growth")
      && /(seed|roll|variance|entropy|private|hidden|continuous|exact|prediction|quality|mean|secret)/.test(normalized)
  ) || (
    normalized.includes("quality")
      && /(score|percentile|roll|seed|entropy|private|hidden|mean|secret)/.test(normalized)
  );
}

function clonePublicValue(value, parentKey = "") {
  if (Array.isArray(value)) {
    return value.map((entry) => (
      PET_ARRAY_CONTAINER_KEYS.has(parentKey) || looksLikePet(entry)
        ? publicPet(entry)
        : clonePublicValue(entry, parentKey)
    ));
  }
  if (!isObjectRecord(value)) {
    return value;
  }
  if (looksLikePet(value)) {
    return publicPet(value);
  }
  const result = {};
  for (const [key, nested] of Object.entries(value)) {
    if (UNSAFE_OBJECT_KEYS.has(key) || isKnownPrivateGrowthKey(key)) {
      continue;
    }
    if (PET_ARRAY_CONTAINER_KEYS.has(key) && Array.isArray(nested)) {
      result[key] = nested.map(publicPet);
    } else if (PET_OBJECT_CONTAINER_KEYS.has(key) && isObjectRecord(nested)) {
      result[key] = publicPet(nested);
    } else if (key === "growthObservation") {
      result[key] = publicGrowthObservation(nested);
    } else if (key === "growthAuthority") {
      result[key] = publicGrowthAuthority(nested);
    } else if (key === "growthSpeciesLevel1Stats" || key === "initialStats") {
      result[key] = cloneNumericMap(nested, STAT_KEYS);
    } else if (key === "petGrowth") {
      result[key] = publicPetGrowth(nested);
    } else if (key === "petCultivation") {
      result[key] = publicCultivationRecord(nested);
    } else if (key === "lastCultivationResult") {
      result[key] = publicCultivationEvent(nested);
    } else if (key === "petRebirthHelper") {
      result[key] = publicPetRebirthHelper(nested);
    } else if (key === "elements") {
      result[key] = cloneNumericMap(nested, ELEMENT_KEYS);
    } else if (looksLikePet(nested)) {
      result[key] = publicPet(nested);
    } else {
      result[key] = clonePublicValue(nested, key);
    }
  }
  return result;
}

function publicProfile(profile) {
  return isObjectRecord(profile) ? clonePublicValue(profile) : {};
}

module.exports = {
  publicGrowthObservation,
  publicPet,
  publicProfile,
};
