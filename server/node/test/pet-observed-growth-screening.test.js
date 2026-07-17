"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  DEFAULT_POWER_FORMULA_PATH,
  DEFAULT_SPECIES_PROFILE_PATH,
  MINIMUM_SCREENING_LEVEL,
  PetObservedGrowthConfigError,
  createPetObservedGrowthScreening,
  loadPetObservedGrowthScreening,
} = require("../src/auth/pet-observed-growth-screening");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function productionDocuments(profileIndex = null) {
  const profileDocument = readJson(DEFAULT_SPECIES_PROFILE_PATH);
  return {
    profileDocument: profileIndex === null
      ? profileDocument
      : {schemaVersion: 1, profiles: [profileDocument.profiles[profileIndex]]},
    powerDocument: readJson(DEFAULT_POWER_FORMULA_PATH),
  };
}

function blueDragonPet(overrides = {}) {
  return {
    formId: "blue_man_dragon_water10",
    templateId: "blue_man_dragon_water10",
    growthModelVersion: "pet_growth_authority_v1",
    growthSpeciesProfileId: "blue_man_dragon_v1",
    level: 20,
    initialStats: {maxHp: 65, attack: 14, defense: 9, quick: 6},
    growthSpeciesLevel1Stats: {maxHp: 65, attack: 14, defense: 9, quick: 6},
    maxHp: 239,
    attack: 63,
    defense: 28,
    quick: 29,
    ...overrides,
  };
}

test("production observed-growth catalog covers all pets and reproduces the visible Lv20 blue-dragon rating", () => {
  const screening = loadPetObservedGrowthScreening();
  const result = screening.evaluatePet(blueDragonPet());

  assert.equal(screening.schemaVersion, 1);
  assert.equal(screening.minimumLevel, MINIMUM_SCREENING_LEVEL);
  assert.equal(screening.profileCount, 34);
  assert.equal(screening.powerFormulaId, "stoneage_like_v1");
  assert.deepEqual(result, {
    schemaVersion: 1,
    status: "mature",
    growthRuleEligible: true,
    retainPet: true,
    reasonCode: "pet_growth_screening_mature",
    reasonLabel: "公开成长观察已达到 Lv20 证据门槛。",
    minimumLevel: 20,
    level: 20,
    observedLevels: 19,
    remainingLevels: 0,
    observation: {
      schemaVersion: 1,
      profileId: "blue_man_dragon_v1",
      level: 20,
      observedLevels: 19,
      statAverages: {maxHp: 9.158, attack: 2.579, defense: 1, quick: 1.211},
      statPercentiles: {maxHp: 89, attack: 91.9, defense: 38.7, quick: 30.4},
      statGrades: {maxHp: "A", attack: "A", defense: "C", quick: "C"},
      powerGrowthPerLevel: 7.105,
      powerPercentile: 90,
      overallGrade: "A",
    },
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.observation), true);
});

test("Lv1 and Lv19 remain observation-only while Lv20 is the first growth-rule-eligible level", () => {
  const screening = loadPetObservedGrowthScreening();
  const levelOne = screening.evaluatePet(blueDragonPet({
    level: 1,
    maxHp: 65,
    attack: 14,
    defense: 9,
    quick: 6,
  }));
  assert.equal(levelOne.status, "unobserved");
  assert.equal(levelOne.growthRuleEligible, false);
  assert.equal(levelOne.retainPet, true);
  assert.equal(levelOne.observedLevels, 0);
  assert.equal(levelOne.remainingLevels, 19);
  assert.equal(levelOne.observation.overallGrade, "未观察");

  const levelNineteen = screening.evaluatePet(blueDragonPet({
    level: 19,
    maxHp: 230,
    attack: 60,
    defense: 27,
    quick: 28,
  }));
  assert.equal(levelNineteen.status, "observing");
  assert.equal(levelNineteen.growthRuleEligible, false);
  assert.equal(levelNineteen.retainPet, true);
  assert.equal(levelNineteen.observedLevels, 18);
  assert.equal(levelNineteen.remainingLevels, 1);
  assert.equal(levelNineteen.observation.overallGrade, "A");

  const levelTwenty = screening.evaluatePet(blueDragonPet());
  assert.equal(levelTwenty.status, "mature");
  assert.equal(levelTwenty.growthRuleEligible, true);
  assert.equal(levelTwenty.retainPet, true);
});

test("screening consumes only public level, four-stat, profile, and model fields", () => {
  const screening = loadPetObservedGrowthScreening();
  const allowedPetKeys = new Set([
    "growthModelVersion",
    "growthSpeciesProfileId",
    "formId",
    "templateId",
    "level",
    "initialStats",
    "growthSpeciesLevel1Stats",
    "maxHp",
    "attack",
    "defense",
    "quick",
  ]);
  const allowedStatKeys = new Set(["maxHp", "attack", "defense", "quick"]);
  const guardedStats = (stats) => new Proxy(stats, {
    get(target, property, receiver) {
      if (typeof property === "string" && !allowedStatKeys.has(property)) {
        throw new Error(`forbidden stat read: ${property}`);
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const source = blueDragonPet({
    initialStats: guardedStats({maxHp: 65, attack: 14, defense: 9, quick: 6}),
    growthSpeciesLevel1Stats: guardedStats({maxHp: 65, attack: 14, defense: 9, quick: 6}),
  });
  const guardedPet = new Proxy(source, {
    get(target, property, receiver) {
      if (typeof property === "string" && !allowedPetKeys.has(property)) {
        throw new Error(`forbidden pet read: ${property}`);
      }
      return Reflect.get(target, property, receiver);
    },
  });
  for (const key of ["privateSeed", "privateRoll", "petGrowth", "qualityRoll", "growthSpeciesRoll"]) {
    Object.defineProperty(guardedPet, key, {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error(`private field ${key} must not be read`);
      },
    });
  }

  const guardedResult = screening.evaluatePet(guardedPet);
  const plainResult = screening.evaluatePet(blueDragonPet({
    privateSeed: "changed-but-irrelevant",
    privateRoll: {innateGrowthBonus: {attack: 999}},
  }));
  assert.equal(guardedResult.status, "mature");
  assert.deepEqual(guardedResult, plainResult);
  assert.equal(JSON.stringify(guardedResult).includes("private"), false);
});

test("legacy, corrupt, mismatched, and unknown public facts fail closed and always retain the pet", () => {
  const screening = loadPetObservedGrowthScreening();
  const invalidPets = [
    null,
    {},
    blueDragonPet({growthModelVersion: "legacy_species_linear_v0"}),
    blueDragonPet({growthSpeciesProfileId: "missing_profile_v1"}),
    blueDragonPet({formId: "wuli_normal_orange_fire10"}),
    blueDragonPet({templateId: "wuli_normal_orange_fire10"}),
    blueDragonPet({level: "20"}),
    blueDragonPet({level: 141}),
    blueDragonPet({attack: 63.5}),
    blueDragonPet({attack: 13}),
    blueDragonPet({initialStats: {maxHp: 65, attack: 14, defense: 9}}),
    blueDragonPet({growthSpeciesLevel1Stats: {maxHp: 65, attack: 15, defense: 9, quick: 6}}),
  ];

  for (const pet of invalidPets) {
    const result = screening.evaluatePet(pet);
    assert.equal(result.status, "unavailable");
    assert.equal(result.growthRuleEligible, false);
    assert.equal(result.retainPet, true);
    assert.equal(result.reasonCode, "pet_growth_screening_unavailable");
    assert.deepEqual(result.observation, {});
  }
});

test("tracked missing observation schema metadata remains v1-compatible while unsafe config fails startup", () => {
  const legacyCompatible = productionDocuments(7);
  assert.equal(legacyCompatible.profileDocument.profiles[0].growthObservation.schemaVersion, undefined);
  assert.equal(createPetObservedGrowthScreening(legacyCompatible).profileCount, 1);

  const explicitFuture = productionDocuments(0);
  explicitFuture.profileDocument.profiles[0].growthObservation.schemaVersion = 2;
  assert.throws(
    () => createPetObservedGrowthScreening(explicitFuture),
    (error) => error instanceof PetObservedGrowthConfigError && /schemaVersion must be 1/.test(error.message),
  );

  const missingLevel = productionDocuments(0);
  delete missingLevel.profileDocument.profiles[0].growthObservation.powerGrowthPercentilesByLevel["20"];
  assert.throws(
    () => createPetObservedGrowthScreening(missingLevel),
    /exactly one threshold row for every Lv2-140 level/,
  );

  const reversed = productionDocuments(0);
  reversed.profileDocument.profiles[0].growthObservation.powerGrowthPercentilesByLevel["20"] = {
    min: 6,
    p25: 5,
    p55: 7,
    p85: 8,
    p95: 9,
    max: 10,
  };
  assert.throws(() => createPetObservedGrowthScreening(reversed), /thresholds must be monotonic/);

  const negativeGrowth = productionDocuments(0);
  negativeGrowth.profileDocument.profiles[0].outputGrowth.quick = -0.01;
  assert.throws(() => createPetObservedGrowthScreening(negativeGrowth), /must not be negative/);

  const zeroGrowth = productionDocuments(0);
  zeroGrowth.profileDocument.profiles[0].outputGrowth = {maxHp: 0, attack: 0, defense: 0, quick: 0};
  assert.throws(() => createPetObservedGrowthScreening(zeroGrowth), /at least one positive stat/);

  const unsafeFormula = productionDocuments(0);
  unsafeFormula.powerDocument.powerFormulas[0].weights.maxHp = -0.25;
  assert.throws(() => createPetObservedGrowthScreening(unsafeFormula), /must not be negative/);

  const zeroFormula = productionDocuments(0);
  zeroFormula.powerDocument.powerFormulas[0].weights = {maxHp: 0, attack: 0, defense: 0, quick: 0};
  assert.throws(() => createPetObservedGrowthScreening(zeroFormula), /at least one positive weight/);
});
