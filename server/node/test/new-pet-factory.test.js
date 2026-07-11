"use strict";

const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PROFILE_RESOLUTION_AUTHORITY_V1,
  PROFILE_RESOLUTION_LEGACY_EXISTING,
  PROFILE_RESOLUTION_LEGACY_UNLINKED,
  loadPetGrowthCatalog,
} = require("../src/auth/pet-growth-catalog");
const {
  ERROR_CONFIGURATION_INVALID,
  ERROR_GROWTH_INITIALIZATION_FAILED,
  ERROR_GROWTH_RESOLUTION_FAILED,
  ERROR_INPUT_INVALID,
  NewPetFactoryError,
  createNewPetFactory,
} = require("../src/auth/new-pet-factory");
const {validatePetGrowth} = require("../src/auth/pet-growth-runtime");
const {generatePetPrivateSeed, isValidPetPrivateSeed} = require("../src/auth/pet-private-seed");

function levelOneCandidate(formId, overrides = {}) {
  return {
    instanceId: `pet_new_${formId}`,
    petId: `pet_new_${formId}`,
    formId,
    templateId: formId,
    name: "新宠工厂测试宠",
    state: "standby",
    level: 1,
    exp: 0,
    nextExp: 120,
    hp: 60,
    maxHp: 60,
    attack: 14,
    defense: 8,
    quick: 6,
    schemaVersion: 1,
    ...overrides,
  };
}

function assertFactoryError(error, code) {
  return error instanceof NewPetFactoryError && error.code === code;
}

test("factory requires one strict frozen growth catalog", () => {
  for (const options of [
    null,
    {},
    {growthCatalog: {}},
    {growthCatalog: Object.freeze({})},
    {growthCatalog: loadPetGrowthCatalog(), unexpected: true},
  ]) {
    assert.throws(
      () => createNewPetFactory(options),
      (error) => assertFactoryError(error, ERROR_CONFIGURATION_INVALID),
    );
  }
});

test("linked Lv1 finalization uses one CSPRNG identity and creates canonical authority v1", (t) => {
  const catalog = loadPetGrowthCatalog();
  const factory = createNewPetFactory({growthCatalog: catalog});
  const source = levelOneCandidate("blue_man_dragon_water10");
  const before = structuredClone(source);
  let randomCalls = 0;
  t.mock.method(crypto, "randomBytes", (size) => {
    randomCalls += 1;
    return Buffer.alloc(size, 0x2a);
  });

  const result = factory.finalizeLevelOne(source, {purpose: "world_egg_growth"});
  const profile = catalog.requireProfileById("blue_man_dragon_v1");

  assert.equal(randomCalls, 1);
  assert.deepEqual(source, before);
  assert.notEqual(result.pet, source);
  assert.equal(result.growthKind, PROFILE_RESOLUTION_AUTHORITY_V1);
  assert.equal(result.profileId, "blue_man_dragon_v1");
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.pet.growthSpeciesProfileId, "blue_man_dragon_v1");
  assert.equal(Object.hasOwn(result.pet, "individualSeed"), false);
  assert.equal(isValidPetPrivateSeed(result.pet.petGrowth.private.privateSeed), true);
  assert.deepEqual(validatePetGrowth(result.pet, profile), {ok: true, code: "", errors: []});
});

test("unlinked Lv1 finalization gives the same single generated seed to the legacy initializer", (t) => {
  const catalog = loadPetGrowthCatalog();
  const factory = createNewPetFactory({growthCatalog: catalog});
  const source = levelOneCandidate("novice_tiger_mount", {
    hp: 120,
    maxHp: 120,
    attack: 12,
    defense: 24,
    quick: 55,
  });
  const before = structuredClone(source);
  let randomCalls = 0;
  t.mock.method(crypto, "randomBytes", (size) => {
    randomCalls += 1;
    return Buffer.alloc(size, 0x3b);
  });
  const expectedSeed = generatePetPrivateSeed("world_egg_growth");
  randomCalls = 0;

  const result = factory.finalizeLevelOne(source, {purpose: "world_egg_growth"});

  assert.equal(randomCalls, 1);
  assert.deepEqual(source, before);
  assert.equal(result.growthKind, PROFILE_RESOLUTION_LEGACY_UNLINKED);
  assert.equal(result.profileId, "");
  assert.equal(result.pet.individualSeed, expectedSeed);
  assert.deepEqual(result.pet.initialStats, {
    maxHp: 120,
    attack: 12,
    defense: 24,
    quick: 55,
  });
  assert.deepEqual(result.pet.growthSpeciesLevel1Stats, result.pet.initialStats);
  assert.notEqual(result.pet.growthSpeciesLevel1Stats, result.pet.initialStats);
  assert.equal(Object.hasOwn(result.pet, "petGrowth"), false);
});

test("factory accepts only fresh exact-Lv1 candidates and never spends entropy on bad input", (t) => {
  const factory = createNewPetFactory({growthCatalog: loadPetGrowthCatalog()});
  let randomCalls = 0;
  t.mock.method(crypto, "randomBytes", (size) => {
    randomCalls += 1;
    return Buffer.alloc(size, 0x4c);
  });
  const invalidCandidates = [
    null,
    [],
    levelOneCandidate("blue_man_dragon_water10", {level: 2}),
    levelOneCandidate("blue_man_dragon_water10", {level: "1"}),
    levelOneCandidate("blue_man_dragon_water10", {level: 1.5}),
    levelOneCandidate("blue_man_dragon_water10", {attack: 0}),
    levelOneCandidate("blue_man_dragon_water10", {hp: 61}),
    levelOneCandidate("blue_man_dragon_water10", {petId: "other_pet"}),
    levelOneCandidate("blue_man_dragon_water10", {templateId: "other_form"}),
    levelOneCandidate("blue_man_dragon_water10", {individualSeed: "old_seed"}),
    levelOneCandidate("blue_man_dragon_water10", {initialStats: {maxHp: 60, attack: 14, defense: 8, quick: 6}}),
    levelOneCandidate("blue_man_dragon_water10", {petGrowth: {}}),
    levelOneCandidate("blue_man_dragon_water10", {petCultivation: {}}),
  ];

  for (const candidate of invalidCandidates) {
    const before = isObjectCandidate(candidate) ? structuredClone(candidate) : candidate;
    assert.throws(
      () => factory.finalizeLevelOne(candidate, {purpose: "world_egg_growth"}),
      (error) => assertFactoryError(error, ERROR_INPUT_INVALID),
    );
    if (isObjectCandidate(candidate)) {
      assert.deepEqual(candidate, before);
    }
  }
  for (const options of [null, {}, {purpose: "World Egg"}, {purpose: "ok", extra: true}]) {
    assert.throws(
      () => factory.finalizeLevelOne(levelOneCandidate("blue_man_dragon_water10"), options),
      (error) => assertFactoryError(error, ERROR_INPUT_INVALID),
    );
  }
  const notCloneable = levelOneCandidate("blue_man_dragon_water10", {notCloneable: () => {}});
  assert.throws(
    () => factory.finalizeLevelOne(notCloneable, {purpose: "world_egg_growth"}),
    (error) => (
      assertFactoryError(error, ERROR_INPUT_INVALID)
      && error.errors.includes("candidate must be cloneable")
    ),
  );
  assert.equal(randomCalls, 0);
});

test("catalog failures and unsupported new-pet routes map to stable safe resolution errors", () => {
  const catalog = loadPetGrowthCatalog();
  const factory = createNewPetFactory({growthCatalog: catalog});
  const unknown = levelOneCandidate("commercial_secret_form");
  const before = structuredClone(unknown);

  assert.throws(
    () => factory.finalizeLevelOne(unknown, {purpose: "world_egg_growth"}),
    (error) => {
      assert.equal(String(error.message).includes("commercial_secret_form"), false);
      assert.deepEqual(error.errors, ["new-pet growth route could not be resolved"]);
      return assertFactoryError(error, ERROR_GROWTH_RESOLUTION_FAILED);
    },
  );
  assert.deepEqual(unknown, before);

  const unsupportedCatalog = Object.freeze({
    resolveNewPetProfile() {
      return Object.freeze({
        kind: PROFILE_RESOLUTION_LEGACY_EXISTING,
        profileId: "",
        profile: null,
      });
    },
  });
  const unsupportedFactory = createNewPetFactory({growthCatalog: unsupportedCatalog});
  assert.throws(
    () => unsupportedFactory.finalizeLevelOne(
      levelOneCandidate("wuli_normal_orange_fire10"),
      {purpose: "world_egg_growth"},
    ),
    (error) => assertFactoryError(error, ERROR_GROWTH_RESOLUTION_FAILED),
  );
});

test("CSPRNG and authority initialization failures expose only stable errors and keep input unchanged", (t) => {
  const source = levelOneCandidate("blue_man_dragon_water10");
  const before = structuredClone(source);
  const catalog = loadPetGrowthCatalog();
  const factory = createNewPetFactory({growthCatalog: catalog});
  t.mock.method(crypto, "randomBytes", () => {
    throw new Error("entropy provider leaked secret details");
  });

  assert.throws(
    () => factory.finalizeLevelOne(source, {purpose: "world_egg_growth"}),
    (error) => {
      assert.equal(String(error.message).includes("entropy provider"), false);
      assert.deepEqual(error.errors, ["new-pet private identity could not be created"]);
      return assertFactoryError(error, ERROR_GROWTH_INITIALIZATION_FAILED);
    },
  );
  assert.deepEqual(source, before);
});

test("untrusted authority profiles cannot bypass the strict runtime brand", (t) => {
  const fakeProfile = {
    profileId: "fake_growth_v1",
    formId: "blue_man_dragon_water10",
    outputBase: {maxHp: 60, attack: 14, defense: 8, quick: 6},
    outputGrowth: {maxHp: 8, attack: 2, defense: 1, quick: 1},
    individualRules: {},
  };
  const fakeCatalog = Object.freeze({
    resolveNewPetProfile() {
      return Object.freeze({
        kind: PROFILE_RESOLUTION_AUTHORITY_V1,
        profileId: fakeProfile.profileId,
        profile: fakeProfile,
      });
    },
  });
  const factory = createNewPetFactory({growthCatalog: fakeCatalog});
  const source = levelOneCandidate("blue_man_dragon_water10");
  const before = structuredClone(source);
  t.mock.method(crypto, "randomBytes", (size) => Buffer.alloc(size, 0x5d));

  assert.throws(
    () => factory.finalizeLevelOne(source, {purpose: "world_egg_growth"}),
    (error) => {
      assert.equal(JSON.stringify(error).includes("bps1_"), false);
      assert.deepEqual(error.errors, ["authority-v1 growth initialization failed"]);
      return assertFactoryError(error, ERROR_GROWTH_INITIALIZATION_FAILED);
    },
  );
  assert.deepEqual(source, before);
});

function isObjectCandidate(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
