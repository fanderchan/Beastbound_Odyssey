"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
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
} = require("../src/auth/pet-exp-settlement");
const {loadPetGrowthCatalog} = require("../src/auth/pet-growth-catalog");
const {initializePetGrowth, validatePetGrowth} = require("../src/auth/pet-growth-runtime");
const {publicPet} = require("../src/auth/profile-visibility");

const PRIVATE_SEED = `bps1_${"A".repeat(43)}`;
const FORBIDDEN_SETTLEMENT_KEYS = new Set([
  "continuousStats",
  "cultivation",
  "private",
  "privateRoll",
  "privateSeed",
  "growthSpeciesSeed",
  "individualSeed",
  "roll",
  "seed",
]);

function calculateAward(entry, amount, maxLevel) {
  let level = Math.max(1, Math.min(maxLevel, Math.trunc(Number(entry.level || 1))));
  const startLevel = level;
  let exp = Math.max(0, Math.trunc(Number(entry.exp || 0))) + amount;
  let nextExp = level * 100;
  while (level < maxLevel && exp >= nextExp) {
    exp -= nextExp;
    level += 1;
    nextExp = level * 100;
  }
  let overflowExp = 0;
  if (level >= maxLevel && exp > 0) {
    overflowExp = exp;
    exp = 0;
  }
  return {
    level,
    exp,
    nextExp,
    levelsGained: level - startLevel,
    overflowExp,
  };
}

function legacyPet(formId, overrides = {}) {
  return {
    instanceId: `pet_${formId}`,
    petId: `pet_${formId}`,
    formId,
    templateId: formId,
    level: 1,
    exp: 0,
    nextExp: 100,
    hp: 60,
    maxHp: 60,
    attack: 14,
    defense: 8,
    quick: 6,
    name: "旧成长宠",
    state: "standby",
    ...overrides,
  };
}

function authorityPet(catalog, overrides = {}) {
  const profile = catalog.requireProfileById("blue_man_dragon_v1");
  const source = legacyPet(profile.formId, {
    growthSpeciesProfileId: profile.profileId,
    ...overrides,
  });
  return {
    profile,
    pet: initializePetGrowth(source, profile, {privateSeed: PRIVATE_SEED}).pet,
  };
}

function createDispatcher(overrides = {}) {
  return createPetExpSettlement({
    growthCatalog: loadPetGrowthCatalog(),
    calculateAward,
    ...overrides,
  });
}

function assertSettlementError(error, code) {
  return error instanceof PetExpSettlementError && error.code === code;
}

function firstForbiddenPath(value, prefix = "") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = firstForbiddenPath(value[index], `${prefix}[${index}]`);
      if (found) return found;
    }
    return "";
  }
  if (!value || typeof value !== "object") {
    return "";
  }
  for (const [key, nested] of Object.entries(value)) {
    const pathValue = prefix ? `${prefix}.${key}` : key;
    if (FORBIDDEN_SETTLEMENT_KEYS.has(key)) {
      return pathValue;
    }
    const found = firstForbiddenPath(nested, pathValue);
    if (found) return found;
  }
  return "";
}

test("factory requires explicit strict catalog and pure award calculator", () => {
  assert.throws(
    () => createPetExpSettlement(),
    (error) => assertSettlementError(error, ERROR_CONFIGURATION_INVALID),
  );
  assert.throws(
    () => createPetExpSettlement({
      growthCatalog: loadPetGrowthCatalog(),
      calculateAward,
      enableAuthorityV1: "true",
    }),
    (error) => assertSettlementError(error, ERROR_CONFIGURATION_INVALID),
  );
});

test("linked legacy pet keeps old exp behavior and never changes four stats", () => {
  const dispatcher = createDispatcher();
  const source = legacyPet("blue_man_dragon_water10");
  const before = structuredClone(source);
  const result = dispatcher.settle(source, 150, 140, {name: "兼容蓝人龙"});

  assert.deepEqual(source, before);
  assert.equal(result.changed, true);
  assert.deepEqual(
    {level: result.pet.level, exp: result.pet.exp, nextExp: result.pet.nextExp},
    {level: 2, exp: 50, nextExp: 200},
  );
  assert.deepEqual(
    {maxHp: result.pet.maxHp, attack: result.pet.attack, defense: result.pet.defense, quick: result.pet.quick},
    {maxHp: 60, attack: 14, defense: 8, quick: 6},
  );
  assert.deepEqual(result.publicExp, {
    name: "兼容蓝人龙",
    beforeLevel: 1,
    level: 2,
    beforeExp: 0,
    exp: 50,
    nextExp: 200,
    levelsGained: 1,
    overflowExp: 0,
    schemaVersion: 1,
  });
  assert.equal(result.settlement, null);
});

test("unlinked legacy pet keeps the same legacy-only mutation boundary", () => {
  const dispatcher = createDispatcher();
  const source = legacyPet("wuli_normal_orange_fire10", {hp: 31});
  const result = dispatcher.settle(source, 150, 140);

  assert.equal(result.pet.level, 2);
  assert.equal(result.pet.exp, 50);
  assert.equal(result.pet.nextExp, 200);
  assert.equal(result.pet.hp, 31);
  assert.equal(result.pet.maxHp, source.maxHp);
  assert.equal(result.pet.attack, source.attack);
  assert.equal(result.pet.defense, source.defense);
  assert.equal(result.pet.quick, source.quick);
  assert.equal(result.settlement, null);
});

test("authority-v1 routing is disabled by default before award calculation", () => {
  const catalog = loadPetGrowthCatalog();
  const source = authorityPet(catalog).pet;
  const before = structuredClone(source);
  let awardCalls = 0;
  const dispatcher = createPetExpSettlement({
    growthCatalog: catalog,
    calculateAward(...args) {
      awardCalls += 1;
      return calculateAward(...args);
    },
  });

  assert.throws(
    () => dispatcher.settle(source, 150, 140),
    (error) => {
      assert.equal(String(error.message).includes(PRIVATE_SEED), false);
      return assertSettlementError(error, ERROR_AUTHORITY_V1_DISABLED);
    },
  );
  assert.equal(awardCalls, 0);
  assert.deepEqual(source, before);
});

test("explicit authority-v1 settlement returns an internal pet and public-only evidence", () => {
  const catalog = loadPetGrowthCatalog();
  const {profile, pet: source} = authorityPet(catalog);
  const before = structuredClone(source);
  const dispatcher = createPetExpSettlement({
    growthCatalog: catalog,
    calculateAward,
    enableAuthorityV1: true,
  });
  const result = dispatcher.settle(source, 150, 140);

  assert.deepEqual(source, before);
  assert.equal(result.changed, true);
  assert.equal(result.pet.level, 2);
  assert.equal(result.pet.exp, 50);
  assert.equal(result.pet.nextExp, 200);
  assert.equal(result.pet.petGrowth.private.privateSeed, PRIVATE_SEED);
  assert.deepEqual(validatePetGrowth(result.pet, profile), {ok: true, code: "", errors: []});
  assert.deepEqual(result.publicExp, {
    name: "旧成长宠",
    beforeLevel: 1,
    level: 2,
    beforeExp: 0,
    exp: 50,
    nextExp: 200,
    levelsGained: 1,
    overflowExp: 0,
    schemaVersion: 1,
  });
  assert.equal(result.settlement.fromLevel, 1);
  assert.equal(result.settlement.toLevel, 2);
  assert.equal(result.settlement.levels.length, 1);
  assert.equal(firstForbiddenPath(result.settlement), "");
  assert.equal(JSON.stringify(result.settlement).includes(PRIVATE_SEED), false);
});

test("same-level authority settlement still validates canonical private state", () => {
  const catalog = loadPetGrowthCatalog();
  const {pet: source} = authorityPet(catalog);
  const dispatcher = createPetExpSettlement({
    growthCatalog: catalog,
    calculateAward,
    enableAuthorityV1: true,
  });
  const unchanged = dispatcher.settle(source, 0, 140);
  assert.equal(unchanged.changed, false);
  assert.deepEqual(unchanged.pet, source);
  assert.deepEqual(unchanged.settlement.levels, []);

  const forged = structuredClone(source);
  forged.petGrowth.private.continuousStats.attack += 0.000001;
  assert.throws(
    () => dispatcher.settle(forged, 0, 140),
    (error) => {
      assert.equal(String(error.message).includes(PRIVATE_SEED), false);
      assert.equal(JSON.stringify(error.errors).includes(PRIVATE_SEED), false);
      return assertSettlementError(error, ERROR_GROWTH_STATE_INVALID);
    },
  );
});

test("unknown and explicitly invalid growth routes fail closed", () => {
  const dispatcher = createDispatcher({enableAuthorityV1: true});
  assert.throws(
    () => dispatcher.settle(legacyPet("missing_form"), 1, 140),
    (error) => assertSettlementError(error, ERROR_GROWTH_RESOLUTION_FAILED),
  );

  const catalog = loadPetGrowthCatalog();
  const {pet} = authorityPet(catalog);
  delete pet.petGrowth.private.continuousStats.attack;
  const invalidPublicPet = publicPet(pet);
  assert.equal(invalidPublicPet.growthModelVersion, "invalid_pet_growth_authority_v1");
  assert.throws(
    () => dispatcher.settle(invalidPublicPet, 1, 140),
    (error) => assertSettlementError(error, ERROR_GROWTH_RESOLUTION_FAILED),
  );

  const unknownCatalog = Object.freeze({
    schemaVersion: 1,
    resolvePetProfile() {
      return {kind: "future_unknown"};
    },
  });
  const unknownDispatcher = createPetExpSettlement({
    growthCatalog: unknownCatalog,
    calculateAward,
  });
  assert.throws(
    () => unknownDispatcher.settle(legacyPet("blue_man_dragon_water10"), 1, 140),
    (error) => assertSettlementError(error, ERROR_GROWTH_RESOLUTION_FAILED),
  );
});

test("award failures and hostile calculator messages cannot leak private seed material", () => {
  const catalog = loadPetGrowthCatalog();
  const source = legacyPet("blue_man_dragon_water10");
  const sourceBefore = structuredClone(source);
  const throwingDispatcher = createPetExpSettlement({
    growthCatalog: catalog,
    calculateAward(entry) {
      entry.level = 99;
      throw new Error(`bad calculator ${PRIVATE_SEED}`);
    },
  });
  assert.throws(
    () => throwingDispatcher.settle(source, 1, 140),
    (error) => {
      assert.equal(String(error.message).includes(PRIVATE_SEED), false);
      assert.equal(String(error.stack).includes(PRIVATE_SEED), false);
      return assertSettlementError(error, ERROR_AWARD_INVALID);
    },
  );
  assert.deepEqual(source, sourceBefore);

  const malformedDispatcher = createPetExpSettlement({
    growthCatalog: catalog,
    calculateAward() {
      return {
        level: 2,
        exp: 0,
        nextExp: 200,
        levelsGained: 1,
        overflowExp: 0,
        privateSeed: PRIVATE_SEED,
      };
    },
  });
  assert.throws(
    () => malformedDispatcher.settle(source, 1, 140),
    (error) => {
      assert.equal(String(error.message).includes(PRIVATE_SEED), false);
      return assertSettlementError(error, ERROR_AWARD_INVALID);
    },
  );
});

test("input validation and max-level overflow preserve stable publicExp semantics", () => {
  const dispatcher = createDispatcher();
  assert.throws(
    () => dispatcher.settle(legacyPet("blue_man_dragon_water10"), -1, 140),
    (error) => assertSettlementError(error, ERROR_INPUT_INVALID),
  );
  const source = legacyPet("blue_man_dragon_water10", {
    level: 3,
    exp: 0,
    nextExp: 300,
  });
  const result = dispatcher.settle(source, 50, 3);
  assert.equal(result.changed, false);
  assert.equal(result.publicExp.level, 3);
  assert.equal(result.publicExp.exp, 0);
  assert.equal(result.publicExp.nextExp, 300);
  assert.equal(result.publicExp.levelsGained, 0);
  assert.equal(result.publicExp.overflowExp, 50);

  const missingNextExp = legacyPet("blue_man_dragon_water10", {nextExp: 0});
  const unchanged = dispatcher.settle(missingNextExp, 0, 140);
  assert.equal(unchanged.changed, false);
  assert.equal(unchanged.pet.nextExp, calculateAward(missingNextExp, 0, 140).nextExp);
});

test("public failures collapse internal errors to two stable secret-free responses", () => {
  const disabled = publicPetExpSettlementFailure(new PetExpSettlementError(
    ERROR_AUTHORITY_V1_DISABLED,
    [PRIVATE_SEED],
  ));
  assert.deepEqual(disabled, {
    ok: false,
    code: PUBLIC_ERROR_AUTHORITY_V1_DISABLED,
    message: "这只宠物的新版成长结算尚未启用，本次经验未结算。",
    schemaVersion: 1,
  });
  assert.equal(JSON.stringify(disabled).includes(PRIVATE_SEED), false);

  const invalid = publicPetExpSettlementFailure(new Error(PRIVATE_SEED));
  assert.deepEqual(invalid, {
    ok: false,
    code: PUBLIC_ERROR_GROWTH_STATE_INVALID,
    message: "宠物成长数据异常，本次经验未结算。",
    schemaVersion: 1,
  });
  assert.equal(JSON.stringify(invalid).includes(PRIVATE_SEED), false);
});
