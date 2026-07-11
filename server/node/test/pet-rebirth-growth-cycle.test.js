"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PROFILE_RESOLUTION_AUTHORITY_V1,
  PROFILE_RESOLUTION_LEGACY_EXISTING,
  PROFILE_RESOLUTION_LEGACY_UNLINKED,
  loadPetGrowthCatalog,
} = require("../src/auth/pet-growth-catalog");
const {
  initializePetGrowth,
  settlePetGrowthToLevel,
  validatePetGrowth,
} = require("../src/auth/pet-growth-runtime");
const {
  ERROR_CONFIGURATION_INVALID,
  ERROR_STATE_INVALID,
  PUBLIC_ERROR_STATE_INVALID,
  PetRebirthGrowthCycleError,
  createPetRebirthGrowthCycle,
  publicPetRebirthGrowthCycleFailure,
} = require("../src/auth/pet-rebirth-growth-cycle");

const PRIVATE_SEED = `bps1_${"R".repeat(43)}`;

function authorityPet(catalog, level = 140) {
  const profile = catalog.requireProfileById("blue_man_dragon_v1");
  const initialized = initializePetGrowth({
    instanceId: "cycle_authority_pet",
    petId: "cycle_authority_pet",
    formId: profile.formId,
    templateId: profile.formId,
    growthSpeciesProfileId: profile.profileId,
    name: "周期蓝人龙",
    state: "standby",
    level: 1,
    exp: 0,
    nextExp: 100,
    hp: 1,
    maxHp: 1,
    attack: 1,
    defense: 1,
    quick: 1,
  }, profile, {privateSeed: PRIVATE_SEED}).pet;
  return {profile, pet: settlePetGrowthToLevel(initialized, profile, level).pet};
}

function legacyPet(formId) {
  return {
    instanceId: `legacy_${formId}`,
    petId: `legacy_${formId}`,
    formId,
    templateId: formId,
    name: "兼容旧宠",
    state: "standby",
    level: 80,
    exp: 0,
    nextExp: 8000,
    hp: 300,
    maxHp: 300,
    attack: 80,
    defense: 60,
    quick: 70,
  };
}

function nextRecord() {
  return {
    schemaVersion: 1,
    rebirthCount: 1,
    enhanceLevel: 0,
    rebirthGrowthBonus: {maxHp: 0.4, attack: 0.2, defense: 0.1, quick: 0.3},
    history: [{schemaVersion: 1, mode: "rebirth"}],
    lastPreview: {},
    lastResult: {},
  };
}

function assertCycleError(error, code) {
  return error instanceof PetRebirthGrowthCycleError && error.code === code;
}

test("rebirth growth cycle factory requires the strict frozen growth catalog", () => {
  assert.throws(
    () => createPetRebirthGrowthCycle(),
    (error) => assertCycleError(error, ERROR_CONFIGURATION_INVALID),
  );
  assert.throws(
    () => createPetRebirthGrowthCycle({growthCatalog: {resolvePetProfile() { return {}; }}}),
    (error) => assertCycleError(error, ERROR_CONFIGURATION_INVALID),
  );
});

test("rebirth growth cycle strictly routes authority and both legacy compatibility kinds", () => {
  const catalog = loadPetGrowthCatalog();
  const cycle = createPetRebirthGrowthCycle({growthCatalog: catalog});
  const authority = authorityPet(catalog);
  assert.deepEqual(cycle.preflight(authority.pet), {
    kind: PROFILE_RESOLUTION_AUTHORITY_V1,
    profileId: authority.profile.profileId,
    authorityV1: true,
  });
  assert.deepEqual(cycle.preflight(legacyPet("blue_man_dragon_water10")), {
    kind: PROFILE_RESOLUTION_LEGACY_EXISTING,
    profileId: "",
    authorityV1: false,
  });
  assert.deepEqual(cycle.preflight(legacyPet("rebirth_starter_four_spirit_cub")), {
    kind: PROFILE_RESOLUTION_LEGACY_UNLINKED,
    profileId: "",
    authorityV1: false,
  });

  const forged = structuredClone(authority.pet);
  forged.petGrowth.settledLevel = 1;
  assert.throws(
    () => cycle.preflight(forged),
    (error) => assertCycleError(error, ERROR_STATE_INVALID),
  );
});

test("rebirth growth cycle restarts authority-v1 without mutating input and leaves legacy unchanged", () => {
  const catalog = loadPetGrowthCatalog();
  const cycle = createPetRebirthGrowthCycle({growthCatalog: catalog});
  const authority = authorityPet(catalog);
  const sourceBefore = structuredClone(authority.pet);
  const record = nextRecord();
  const result = cycle.restart(authority.pet, record);

  assert.deepEqual(authority.pet, sourceBefore);
  assert.equal(result.restarted, true);
  assert.equal(result.kind, PROFILE_RESOLUTION_AUTHORITY_V1);
  assert.equal(result.pet.level, 1);
  assert.equal(result.pet.petGrowth.settledLevel, 1);
  assert.equal(result.pet.petGrowth.private.privateSeed, PRIVATE_SEED);
  assert.deepEqual(result.pet.petGrowth.private.privateRoll, sourceBefore.petGrowth.private.privateRoll);
  assert.deepEqual(result.pet.petGrowth.private.cultivation.growthBonus, record.rebirthGrowthBonus);
  assert.deepEqual(validatePetGrowth(result.pet, authority.profile), {ok: true, code: "", errors: []});

  const legacy = legacyPet("rebirth_starter_four_spirit_cub");
  const legacyBefore = structuredClone(legacy);
  const legacyResult = cycle.restart(legacy, record);
  assert.equal(legacyResult.restarted, false);
  assert.equal(legacyResult.kind, PROFILE_RESOLUTION_LEGACY_UNLINKED);
  assert.deepEqual(legacyResult.pet, legacyBefore);
  assert.deepEqual(legacy, legacyBefore);
});

test("rebirth growth cycle failures collapse to one secret-free player response", () => {
  const failure = publicPetRebirthGrowthCycleFailure(new Error(`canary ${PRIVATE_SEED}`));
  assert.deepEqual(failure, {
    ok: false,
    code: PUBLIC_ERROR_STATE_INVALID,
    message: "宠物成长数据异常，本次转生未执行，转生MM未消耗。",
    schemaVersion: 1,
  });
  assert.equal(JSON.stringify(failure).includes(PRIVATE_SEED), false);
});
