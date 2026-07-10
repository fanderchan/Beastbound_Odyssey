"use strict";

const {generatePetPrivateSeed} = require("./pet-private-seed");

const STAT_KEYS = Object.freeze(["maxHp", "attack", "defense", "quick"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function levelOneStatsFromPet(pet) {
  if (!hasCompleteLevelOneStats(pet)) {
    throw new TypeError("known level-one facts require four positive integer stats");
  }
  return {
    maxHp: pet.maxHp,
    attack: pet.attack,
    defense: pet.defense,
    quick: pet.quick,
  };
}

function hasCompleteLevelOneStats(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
    && STAT_KEYS.every((key) => (
      typeof value[key] === "number"
      && Number.isFinite(value[key])
      && Number.isInteger(value[key])
      && value[key] >= 1
    ));
}

function initializeNewLegacyPetPrivateState(pet, purpose, options = {}) {
  if (!pet || typeof pet !== "object" || Array.isArray(pet)) {
    throw new TypeError("new pet private state requires a pet object");
  }
  const level = Math.max(1, Math.trunc(Number(pet.level || 1)));
  let levelOneStats = null;
  if (Boolean(options.knownLevelOneStats) && level === 1) {
    const existingStats = hasCompleteLevelOneStats(pet.initialStats)
      ? pet.initialStats
      : (hasCompleteLevelOneStats(pet.growthSpeciesLevel1Stats)
        ? pet.growthSpeciesLevel1Stats
        : pet);
    levelOneStats = levelOneStatsFromPet(existingStats);
  }
  if (String(pet.individualSeed || "").trim() === "") {
    pet.individualSeed = generatePetPrivateSeed(purpose);
  }
  if (levelOneStats) {
    if (!hasCompleteLevelOneStats(pet.initialStats)) {
      pet.initialStats = clone(levelOneStats);
    }
    if (!hasCompleteLevelOneStats(pet.growthSpeciesLevel1Stats)) {
      pet.growthSpeciesLevel1Stats = clone(levelOneStats);
    }
  }
  return pet;
}

function generatePetCultivationRollSeed() {
  return generatePetPrivateSeed("rebirth_mm_roll");
}

module.exports = {
  generatePetCultivationRollSeed,
  hasCompleteLevelOneStats,
  initializeNewLegacyPetPrivateState,
  levelOneStatsFromPet,
};
