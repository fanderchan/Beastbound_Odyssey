"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const test = require("node:test");

const PetGrowthAuthority = require("../src/auth/pet-growth-authority");
const {
  createPetGrowthCatalog,
  loadPetGrowthCatalog,
} = require("../src/auth/pet-growth-catalog");
const {
  ERROR_INITIALIZATION_CONFLICT,
  ERROR_INPUT_INVALID,
  ERROR_LEVEL_ROLLBACK,
  ERROR_PROFILE_MISMATCH,
  ERROR_STATE_INVALID,
  ERROR_TARGET_INVALID,
  PetGrowthRuntimeError,
  initializePetGrowth,
  settlePetGrowthToLevel,
  validatePetGrowth,
} = require("../src/auth/pet-growth-runtime");
const {publicPet} = require("../src/auth/profile-visibility");

const ROOT = path.resolve(__dirname, "../../..");
const PROFILE_PATH = path.join(
  ROOT,
  "client/godot/data/balance/pet_growth_species_profiles.json",
);
const VECTOR_PATH = path.join(ROOT, "tools/fixtures/pet_growth_authority_v1_vectors.json");
const PRIVATE_SEED_A = `bps1_${"A".repeat(43)}`;
const PRIVATE_SEED_B = `bps1_${"B".repeat(43)}`;
const PRIVATE_FIELD_KEYS = new Set([
  "continuousStats",
  "cultivation",
  "private",
  "privateRoll",
  "privateSeed",
  "individualSeed",
  "growthSpeciesSeed",
  "growthSpeciesRoll",
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function runtimeProfile() {
  return loadPetGrowthCatalog().requireProfileById("blue_man_dragon_v1");
}

function rawRuntimeProfile() {
  return readJson(PROFILE_PATH).profiles.find(
    (profile) => profile.profileId === "blue_man_dragon_v1",
  );
}

function authorityProfileFromRaw(rawProfile, formId = "runtime_vector_form") {
  const profile = {
    ...structuredClone(rawProfile),
    displayName: rawProfile.displayName || "运行时测试成长档",
    formId: rawProfile.formId || formId,
    formName: rawProfile.formName || "运行时测试宠",
  };
  const catalog = createPetGrowthCatalog({
    profileDocument: {schemaVersion: 1, profiles: [profile]},
    templateDocument: {
      schemaVersion: 1,
      forms: [{
        formId: profile.formId,
        formName: profile.formName,
        growthSpeciesProfileId: profile.profileId,
        baseStats: {
          maxHp: profile.outputBase.maxHp,
          attack: profile.outputBase.attack,
          defense: profile.outputBase.defense,
          agility: profile.outputBase.quick,
        },
      }],
    },
  });
  return catalog.requireProfileById(profile.profileId);
}

function weightedNoiseVector() {
  return readJson(VECTOR_PATH).vectors.find((vector) => vector.id === "weighted_noise_unicode");
}

function petForProfile(profile, overrides = {}) {
  const formId = String(profile.formId || "runtime_test_form");
  const maxHp = Math.max(1, Math.trunc(Number(profile.outputBase.maxHp)));
  return {
    instanceId: "pet_growth_runtime_test",
    petId: "pet_growth_runtime_test",
    formId,
    templateId: formId,
    growthSpeciesProfileId: profile.profileId,
    level: 1,
    exp: 0,
    nextExp: 120,
    hp: maxHp,
    maxHp,
    attack: Math.max(1, Math.trunc(Number(profile.outputBase.attack))),
    defense: Math.max(1, Math.trunc(Number(profile.outputBase.defense))),
    quick: Math.max(1, Math.trunc(Number(profile.outputBase.quick))),
    name: "成长测试宠",
    state: "standby",
    ...overrides,
  };
}

function cultivation(overrides = {}) {
  return {
    initialBonus: {maxHp: 2, attack: 1, defense: 0, quick: -1},
    growthBonus: {maxHp: 0.15, attack: 0.04, defense: 0.02, quick: 0.03},
    ...overrides,
  };
}

function assertRuntimeError(error, code) {
  return error instanceof PetGrowthRuntimeError && error.code === code;
}

function firstPrivatePath(value, prefix = "") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = firstPrivatePath(value[index], `${prefix}[${index}]`);
      if (found) return found;
    }
    return "";
  }
  if (!value || typeof value !== "object") {
    return "";
  }
  for (const [key, nested] of Object.entries(value)) {
    const pathValue = prefix ? `${prefix}.${key}` : key;
    if (PRIVATE_FIELD_KEYS.has(key)) {
      return pathValue;
    }
    const found = firstPrivatePath(nested, pathValue);
    if (found) return found;
  }
  return "";
}

test("runtime initialization creates one canonical authority-v1 envelope without mutating input", () => {
  const profile = runtimeProfile();
  const source = petForProfile(profile, {individualSeed: PRIVATE_SEED_A});
  const sourceBefore = structuredClone(source);
  const result = initializePetGrowth(source, profile, {privateSeed: PRIVATE_SEED_A});

  assert.equal(result.changed, true);
  assert.deepEqual(source, sourceBefore);
  assert.notEqual(result.pet, source);
  assert.equal(Object.hasOwn(result.pet, "individualSeed"), false);
  assert.equal(result.pet.growthModelVersion, PetGrowthAuthority.MODEL_VERSION);
  assert.deepEqual(Object.keys(result.pet.petGrowth).sort(), [
    "modelVersion",
    "private",
    "profileId",
    "public",
    "schemaVersion",
    "settledLevel",
  ]);
  assert.deepEqual(Object.keys(result.pet.petGrowth.private).sort(), [
    "continuousStats",
    "cultivation",
    "privateRoll",
    "privateSeed",
    "schemaVersion",
  ]);
  assert.deepEqual(result.pet.initialStats, result.pet.petGrowth.public.levelOneFourV);
  assert.deepEqual(result.pet.growthSpeciesLevel1Stats, result.pet.petGrowth.public.levelOneFourV);
  assert.deepEqual(
    PetGrowthAuthority.STAT_KEYS.map((key) => result.pet[key]),
    PetGrowthAuthority.STAT_KEYS.map((key) => result.pet.petGrowth.public.stats[key]),
  );
  assert.deepEqual(validatePetGrowth(result.pet, profile), {ok: true, code: "", errors: []});
});

test("runtime internal pet projects to an idempotent public v1 pet without private growth fields", () => {
  const profile = runtimeProfile();
  const internalPet = settlePetGrowthToLevel(
    initializePetGrowth(
      petForProfile(profile),
      profile,
      {privateSeed: PRIVATE_SEED_A},
    ).pet,
    profile,
    20,
  ).pet;
  const projected = publicPet(internalPet);

  assert.equal(projected.growthAuthority.modelVersion, PetGrowthAuthority.MODEL_VERSION);
  assert.equal(projected.petGrowth.public.level, 20);
  assert.equal(firstPrivatePath(projected), "");
  assert.equal(JSON.stringify(projected).includes(PRIVATE_SEED_A), false);
  assert.deepEqual(publicPet(projected), projected);
});

test("runtime initialization preserves absolute injury and never revives a dead pet", () => {
  const profile = runtimeProfile();
  const fullSource = petForProfile(profile);
  const woundedSource = petForProfile(profile, {hp: fullSource.maxHp - 7});
  const deadSource = petForProfile(profile, {hp: 0});

  const full = initializePetGrowth(fullSource, profile, {privateSeed: PRIVATE_SEED_A}).pet;
  const wounded = initializePetGrowth(woundedSource, profile, {privateSeed: PRIVATE_SEED_A}).pet;
  const dead = initializePetGrowth(deadSource, profile, {privateSeed: PRIVATE_SEED_A}).pet;

  assert.equal(full.hp, full.maxHp);
  assert.equal(wounded.maxHp - wounded.hp, 7);
  assert.equal(dead.hp, 0);
});

test("runtime initialization is idempotent and rejects conflicting or partial state", () => {
  const profile = runtimeProfile();
  const options = {privateSeed: PRIVATE_SEED_A, cultivation: cultivation()};
  const initialized = initializePetGrowth(petForProfile(profile), profile, options).pet;
  const repeated = initializePetGrowth(initialized, profile, options);

  assert.equal(repeated.changed, false);
  assert.deepEqual(repeated.pet, initialized);
  assert.throws(
    () => initializePetGrowth(initialized, profile, {...options, privateSeed: PRIVATE_SEED_B}),
    (error) => assertRuntimeError(error, ERROR_INITIALIZATION_CONFLICT),
  );
  assert.throws(
    () => initializePetGrowth(initialized, profile, {
      ...options,
      cultivation: cultivation({growthBonus: {maxHp: 0.15, attack: 0.05, defense: 0.02, quick: 0.03}}),
    }),
    (error) => assertRuntimeError(error, ERROR_INITIALIZATION_CONFLICT),
  );

  const partial = petForProfile(profile, {petGrowth: {schemaVersion: 1}});
  assert.throws(
    () => initializePetGrowth(partial, profile, options),
    (error) => assertRuntimeError(error, ERROR_INITIALIZATION_CONFLICT),
  );
});

test("runtime initialization fails closed for bad links, old facts, and non-canonical cultivation", () => {
  const profile = runtimeProfile();
  assert.throws(
    () => initializePetGrowth(
      petForProfile(profile, {growthSpeciesProfileId: "other_growth_v1"}),
      profile,
      {privateSeed: PRIVATE_SEED_A},
    ),
    (error) => assertRuntimeError(error, ERROR_PROFILE_MISMATCH),
  );
  assert.throws(
    () => initializePetGrowth(
      petForProfile(profile, {initialStats: {maxHp: 999, attack: 1, defense: 1, quick: 1}}),
      profile,
      {privateSeed: PRIVATE_SEED_A},
    ),
    (error) => assertRuntimeError(error, ERROR_INITIALIZATION_CONFLICT),
  );
  assert.throws(
    () => initializePetGrowth(petForProfile(profile), profile, {
      privateSeed: PRIVATE_SEED_A,
      cultivation: cultivation({growthBonus: {maxHp: 0.15, attack: "0.04", defense: 0.02, quick: 0.03}}),
    }),
    (error) => assertRuntimeError(error, ERROR_INPUT_INVALID),
  );
  assert.throws(
    () => initializePetGrowth(petForProfile(profile), profile, {
      privateSeed: "predictable-seed",
    }),
    (error) => assertRuntimeError(error, ERROR_INPUT_INVALID),
  );
  assert.throws(
    () => initializePetGrowth(
      petForProfile(profile, {
        formId: "pet_rebirth_mm_stage1",
        templateId: "pet_rebirth_mm_stage1",
      }),
      profile,
      {privateSeed: PRIVATE_SEED_A},
    ),
    (error) => assertRuntimeError(error, ERROR_PROFILE_MISMATCH),
  );
  assert.throws(
    () => initializePetGrowth(petForProfile(profile), rawRuntimeProfile(), {
      privateSeed: PRIVATE_SEED_A,
    }),
    (error) => assertRuntimeError(error, ERROR_INPUT_INVALID),
  );
  assert.throws(
    () => initializePetGrowth(
      petForProfile(profile, {
        petCultivation: {
          rebirthGrowthBonus: {maxHp: 9, attack: 9, defense: 9, quick: 9},
        },
      }),
      profile,
      {privateSeed: PRIVATE_SEED_A},
    ),
    (error) => assertRuntimeError(error, ERROR_INITIALIZATION_CONFLICT),
  );
});

test("runtime accepts fractional positive species growth allowed by the strict catalog", () => {
  const rawProfile = rawRuntimeProfile();
  rawProfile.outputGrowth.defense = 0.8;
  const profile = authorityProfileFromRaw(rawProfile);
  const result = initializePetGrowth(
    petForProfile(profile),
    profile,
    {privateSeed: PRIVATE_SEED_A},
  );

  assert.equal(result.changed, true);
  assert.deepEqual(validatePetGrowth(result.pet, profile), {ok: true, code: "", errors: []});
});

test("runtime validator deterministically rejects forged private, public, and root facts", () => {
  const profile = runtimeProfile();
  const initialized = initializePetGrowth(
    petForProfile(profile),
    profile,
    {privateSeed: PRIVATE_SEED_A, cultivation: cultivation()},
  ).pet;
  const mutations = [
    (pet) => { pet.petGrowth.private.privateRoll.innateGrowthBonus.attack += 0.1; },
    (pet) => {
      pet.petGrowth.private.continuousStats.attack = PetGrowthAuthority.quantize(
        pet.petGrowth.private.continuousStats.attack + 0.000001,
      );
    },
    (pet) => { pet.petGrowth.public.stats.attack += 1; },
    (pet) => { pet.attack += 1; },
    (pet) => { pet.petGrowth.settledLevel += 1; },
    (pet) => { pet.petGrowth.profileId = "other_growth_v1"; },
    (pet) => { pet.initialStats.attack += 1; },
    (pet) => { pet.hp = pet.maxHp + 1; },
    (pet) => { delete pet.petGrowth.private.cultivation.schemaVersion; },
    (pet) => { pet.petGrowth.private.unexpected = true; },
    (pet) => { pet.growthAuthority = {source: "server"}; },
    (pet) => { pet.privateSeed = PRIVATE_SEED_A; },
    (pet) => {
      pet.petCultivation = {
        rebirthGrowthBonus: {maxHp: 9, attack: 9, defense: 9, quick: 9},
      };
    },
  ];

  for (const mutate of mutations) {
    const forged = structuredClone(initialized);
    mutate(forged);
    const validation = validatePetGrowth(forged, profile);
    assert.equal(validation.ok, false);
    assert.equal(validation.code, ERROR_STATE_INVALID);
    assert.ok(validation.errors.length > 0);
    assert.equal(validation.errors.some((error) => error.includes(PRIVATE_SEED_A)), false);
  }
});

test("runtime settles Lv1 to Lv20 incrementally and returns only visible level evidence", () => {
  const profile = runtimeProfile();
  const source = initializePetGrowth(
    petForProfile(profile),
    profile,
    {privateSeed: PRIVATE_SEED_A, cultivation: cultivation()},
  ).pet;
  const sourceBefore = structuredClone(source);
  const result = settlePetGrowthToLevel(source, profile, 20);
  const privateState = result.pet.petGrowth.private;
  const expectedPublic = PetGrowthAuthority.buildPublicSnapshot(
    profile,
    privateState.privateSeed,
    20,
    privateState.privateRoll,
    privateState.cultivation,
  );

  assert.equal(result.changed, true);
  assert.deepEqual(source, sourceBefore);
  assert.equal(result.pet.level, 20);
  assert.equal(result.pet.petGrowth.settledLevel, 20);
  assert.deepEqual(result.pet.petGrowth.public, expectedPublic);
  assert.equal(result.settlement.fromLevel, 1);
  assert.equal(result.settlement.toLevel, 20);
  assert.equal(result.settlement.levels.length, 19);
  assert.equal(result.settlement.levels[0].level, 2);
  assert.equal(result.settlement.levels.at(-1).level, 20);
  assert.equal(firstPrivatePath(result.settlement), "");
  assert.deepEqual(validatePetGrowth(result.pet, profile), {ok: true, code: "", errors: []});
});

test("batch and one-level-at-a-time settlement produce exactly the same Lv140 pet", () => {
  const vector = weightedNoiseVector();
  const profile = authorityProfileFromRaw(vector.profile);
  const options = {privateSeed: PRIVATE_SEED_A, cultivation: vector.cultivation};
  const initialized = initializePetGrowth(petForProfile(profile), profile, options).pet;
  const batch = settlePetGrowthToLevel(initialized, profile, 140);
  let repeatedPet = initialized;
  const repeatedLevels = [];
  for (let level = 2; level <= 140; level += 1) {
    const result = settlePetGrowthToLevel(repeatedPet, profile, level);
    repeatedPet = result.pet;
    repeatedLevels.push(...result.settlement.levels);
  }

  assert.deepEqual(repeatedPet, batch.pet);
  assert.deepEqual(repeatedLevels, batch.settlement.levels);
  const roundTripped = JSON.parse(JSON.stringify(batch.pet));
  assert.deepEqual(roundTripped, batch.pet);
  assert.deepEqual(validatePetGrowth(roundTripped, profile), {ok: true, code: "", errors: []});

  let incorrectlyRounded = PetGrowthAuthority.visibleStatsAtLevel(
    profile,
    PRIVATE_SEED_A,
    1,
    batch.pet.petGrowth.private.privateRoll,
    vector.cultivation,
  );
  for (let level = 2; level <= 140; level += 1) {
    const delta = PetGrowthAuthority.growthDeltaForLevel(
      profile,
      PRIVATE_SEED_A,
      level,
      batch.pet.petGrowth.private.privateRoll,
      vector.cultivation,
    );
    for (const key of PetGrowthAuthority.STAT_KEYS) {
      incorrectlyRounded[key] = Math.max(
        1,
        PetGrowthAuthority.roundHalfAwayFromZero(incorrectlyRounded[key] + delta[key]),
      );
    }
  }
  assert.notDeepEqual(incorrectlyRounded, batch.pet.petGrowth.public.stats);
});

test("ordinary settlement preserves full, wounded, and dead HP semantics", () => {
  const profile = runtimeProfile();
  const initialized = initializePetGrowth(
    petForProfile(profile),
    profile,
    {privateSeed: PRIVATE_SEED_A},
  ).pet;
  const full = settlePetGrowthToLevel(initialized, profile, 20).pet;
  const woundedSource = structuredClone(initialized);
  woundedSource.hp = woundedSource.maxHp - 52;
  const wounded = settlePetGrowthToLevel(woundedSource, profile, 20).pet;
  const deadSource = structuredClone(initialized);
  deadSource.hp = 0;
  const dead = settlePetGrowthToLevel(deadSource, profile, 20).pet;

  assert.equal(full.hp, full.maxHp);
  assert.equal(wounded.maxHp - wounded.hp, 52);
  assert.equal(dead.hp, 0);
});

test("same-level settlement is idempotent and level rollback or invalid targets fail closed", () => {
  const profile = runtimeProfile();
  const initialized = initializePetGrowth(
    petForProfile(profile),
    profile,
    {privateSeed: PRIVATE_SEED_A},
  ).pet;
  const level20 = settlePetGrowthToLevel(initialized, profile, 20).pet;
  const repeated = settlePetGrowthToLevel(level20, profile, 20);

  assert.equal(repeated.changed, false);
  assert.deepEqual(repeated.pet, level20);
  assert.deepEqual(repeated.settlement.levels, []);
  assert.throws(
    () => settlePetGrowthToLevel(level20, profile, 19),
    (error) => assertRuntimeError(error, ERROR_LEVEL_ROLLBACK),
  );
  for (const target of [0, 20.5, 141, "21"]) {
    assert.throws(
      () => settlePetGrowthToLevel(level20, profile, target),
      (error) => assertRuntimeError(error, ERROR_TARGET_INVALID),
    );
  }
});

test("settlement refuses tampered state before mutation and cultivation is frozen by value", () => {
  const profile = runtimeProfile();
  const inputCultivation = cultivation();
  const initialized = initializePetGrowth(
    petForProfile(profile),
    profile,
    {privateSeed: PRIVATE_SEED_A, cultivation: inputCultivation},
  ).pet;
  inputCultivation.growthBonus.attack = 99;
  assert.equal(initialized.petGrowth.private.cultivation.growthBonus.attack, 0.04);

  const forged = structuredClone(initialized);
  forged.petGrowth.private.continuousStats.attack = PetGrowthAuthority.quantize(
    forged.petGrowth.private.continuousStats.attack + 0.000001,
  );
  const before = structuredClone(forged);
  assert.throws(
    () => settlePetGrowthToLevel(forged, profile, 2),
    (error) => {
      assert.equal(String(error.message).includes(PRIVATE_SEED_A), false);
      assert.equal(String(error.stack).includes(PRIVATE_SEED_A), false);
      assert.equal(JSON.stringify(error.errors).includes(PRIVATE_SEED_A), false);
      return assertRuntimeError(error, ERROR_STATE_INVALID);
    },
  );
  assert.deepEqual(forged, before);
});
