"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  generatePetCultivationRollSeed,
  initializeNewLegacyPetPrivateState,
} = require("../src/auth/pet-private-state");
const {isValidPetPrivateSeed} = require("../src/auth/pet-private-seed");

function levelOnePet(overrides = {}) {
  return {
    instanceId: "pet_private_state_test",
    level: 1,
    hp: 73,
    maxHp: 81,
    attack: 29,
    defense: 24,
    quick: 36,
    ...overrides,
  };
}

test("new level-one pets receive an opaque private seed and stable level-one facts", () => {
  const pet = initializeNewLegacyPetPrivateState(
    levelOnePet(),
    "capture_growth",
    {knownLevelOneStats: true},
  );

  assert.equal(isValidPetPrivateSeed(pet.individualSeed), true);
  assert.deepEqual(pet.initialStats, {maxHp: 81, attack: 29, defense: 24, quick: 36});
  assert.deepEqual(pet.growthSpeciesLevel1Stats, pet.initialStats);
  assert.notEqual(pet.growthSpeciesLevel1Stats, pet.initialStats);

  const originalSeed = pet.individualSeed;
  pet.attack = 999;
  initializeNewLegacyPetPrivateState(pet, "capture_growth", {knownLevelOneStats: true});
  assert.equal(pet.individualSeed, originalSeed);
  assert.equal(pet.initialStats.attack, 29);
  assert.equal(pet.growthSpeciesLevel1Stats.attack, 29);
});

test("private state initialization preserves an existing identity and fills only missing level-one facts", () => {
  const pet = levelOnePet({
    individualSeed: "legacy_identity_that_must_not_change",
    initialStats: {maxHp: 70, attack: 20, defense: 18, quick: 31},
  });

  initializeNewLegacyPetPrivateState(pet, "world_egg_growth", {knownLevelOneStats: true});

  assert.equal(pet.individualSeed, "legacy_identity_that_must_not_change");
  assert.deepEqual(pet.initialStats, {maxHp: 70, attack: 20, defense: 18, quick: 31});
  assert.deepEqual(pet.growthSpeciesLevel1Stats, pet.initialStats);
});

test("higher-level captures receive private identity without fabricated level-one history", () => {
  const pet = initializeNewLegacyPetPrivateState(
    levelOnePet({level: 3, maxHp: 96, attack: 37}),
    "capture_growth",
    {knownLevelOneStats: false},
  );

  assert.equal(isValidPetPrivateSeed(pet.individualSeed), true);
  assert.equal(Object.hasOwn(pet, "initialStats"), false);
  assert.equal(Object.hasOwn(pet, "growthSpeciesLevel1Stats"), false);
});

test("known level-one initialization fails closed before writing incomplete facts or identity", () => {
  for (const pet of [
    levelOnePet({attack: undefined}),
    levelOnePet({defense: Number.NaN}),
    levelOnePet({quick: 0}),
    levelOnePet({maxHp: 81.5}),
    levelOnePet({attack: "29"}),
  ]) {
    assert.throws(
      () => initializeNewLegacyPetPrivateState(pet, "capture_growth", {knownLevelOneStats: true}),
      /four positive integer stats/,
    );
    assert.equal(Object.hasOwn(pet, "individualSeed"), false);
    assert.equal(Object.hasOwn(pet, "initialStats"), false);
    assert.equal(Object.hasOwn(pet, "growthSpeciesLevel1Stats"), false);
  }
});

test("new pet and cultivation seeds use fresh cryptographic identities", () => {
  const firstPet = initializeNewLegacyPetPrivateState(levelOnePet(), "rebirth_mm_reward_growth");
  const secondPet = initializeNewLegacyPetPrivateState(levelOnePet(), "rebirth_mm_reward_growth");
  const firstRoll = generatePetCultivationRollSeed();
  const secondRoll = generatePetCultivationRollSeed();

  assert.equal(isValidPetPrivateSeed(firstPet.individualSeed), true);
  assert.equal(isValidPetPrivateSeed(secondPet.individualSeed), true);
  assert.equal(isValidPetPrivateSeed(firstRoll), true);
  assert.equal(isValidPetPrivateSeed(secondRoll), true);
  assert.notEqual(firstPet.individualSeed, secondPet.individualSeed);
  assert.notEqual(firstRoll, secondRoll);
});

test("private state initialization rejects non-pet values", () => {
  for (const value of [null, undefined, [], "pet"]) {
    assert.throws(
      () => initializeNewLegacyPetPrivateState(value, "capture_growth"),
      /requires a pet object/,
    );
  }
});
