"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {loadPetObservedGrowthScreening} = require("../src/auth/pet-observed-growth-screening");
const {
  createPetObservedGrowthRulePreview,
  defaultGrowthRulePolicy,
  growthRulePolicyConfigured,
  normalizeGrowthRulePolicy,
  strictPlayerGrowthRulePolicy,
} = require("../src/auth/pet-observed-growth-rule-preview");

function blueDragonPet(overrides = {}) {
  return {
    instanceId: "pet_blue_preview",
    petId: "pet_blue_preview",
    name: "蓝人龙预览",
    state: "standby",
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

function policy(overrides = {}) {
  return {
    schemaVersion: 1,
    overallMinimumPercentile: 91,
    statMinimumPercentiles: {maxHp: 90, attack: 90, defense: 0, quick: 40},
    ...overrides,
  };
}

function preview() {
  return createPetObservedGrowthRulePreview({screening: loadPetObservedGrowthScreening()});
}

test("growth rule policy defaults disabled, repairs legacy data, and strictly validates player writes", () => {
  const defaults = defaultGrowthRulePolicy();
  assert.deepEqual(defaults, {
    schemaVersion: 1,
    overallMinimumPercentile: 0,
    statMinimumPercentiles: {maxHp: 0, attack: 0, defense: 0, quick: 0},
  });
  assert.equal(growthRulePolicyConfigured(defaults), false);
  assert.deepEqual(normalizeGrowthRulePolicy({schemaVersion: 2, overallMinimumPercentile: 99}), defaults);
  assert.deepEqual(normalizeGrowthRulePolicy({
    schemaVersion: 1,
    overallMinimumPercentile: "200",
    statMinimumPercentiles: {maxHp: -3, attack: "88", defense: 25.8},
  }), {
    schemaVersion: 1,
    overallMinimumPercentile: 100,
    statMinimumPercentiles: {maxHp: 0, attack: 88, defense: 25, quick: 0},
  });

  assert.deepEqual(strictPlayerGrowthRulePolicy(policy()), {ok: true, policy: policy()});
  for (const value of [
    null,
    {...policy(), schemaVersion: 2},
    {...policy(), overallMinimumPercentile: "91"},
    {...policy(), overallMinimumPercentile: 101},
    {...policy(), unexpected: true},
    {...policy(), statMinimumPercentiles: {maxHp: 1, attack: 2, defense: 3}},
    {...policy(), statMinimumPercentiles: {maxHp: 1, attack: 2, defense: 3, quick: 4.5}},
  ]) {
    const rejected = strictPlayerGrowthRulePolicy(value);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, "auto_capture_growth_rule_policy_invalid");
  }
});

test("mature blue dragon explains every active retention threshold without handling the pet", () => {
  const evaluator = preview();
  const result = evaluator.evaluatePet(blueDragonPet(), policy());

  assert.equal(result.status, "would_handle");
  assert.equal(result.meetsRetentionRules, false);
  assert.equal(result.wouldHandle, true);
  assert.equal(result.previewAction, "review");
  assert.equal(result.retainPet, true);
  assert.equal(result.mutationPerformed, false);
  assert.equal(result.growth.powerPercentile, 90);
  assert.deepEqual(result.growth.statPercentiles, {
    maxHp: 89,
    attack: 91.9,
    defense: 38.7,
    quick: 30.4,
  });
  assert.deepEqual(result.checks.map((entry) => [entry.code, entry.passed]), [
    ["growth_overall_below_minimum", false],
    ["growth_maxHp_below_minimum", false],
    ["growth_attack_minimum_met", true],
    ["growth_quick_below_minimum", false],
  ]);
  assert.match(result.reasonMessage, /进入待处理/);
  assert.equal(JSON.stringify(result).includes("private"), false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.checks), true);

  const keep = evaluator.evaluatePet(blueDragonPet(), policy({
    overallMinimumPercentile: 85,
    statMinimumPercentiles: {maxHp: 85, attack: 90, defense: 0, quick: 30},
  }));
  assert.equal(keep.status, "would_keep");
  assert.equal(keep.meetsRetentionRules, true);
  assert.equal(keep.wouldHandle, false);
  assert.equal(keep.previewAction, "keep");
  assert.equal(keep.retainPet, true);
  assert.equal(keep.mutationPerformed, false);
});

test("unconfigured, immature, legacy, and corrupt pets never become handling candidates", () => {
  const evaluator = preview();
  const unconfigured = evaluator.evaluatePet(blueDragonPet(), defaultGrowthRulePolicy());
  assert.equal(unconfigured.status, "not_configured");
  assert.equal(unconfigured.wouldHandle, false);
  assert.equal(unconfigured.retainPet, true);

  const observing = evaluator.evaluatePet(blueDragonPet({
    level: 19,
    maxHp: 230,
    attack: 60,
    defense: 27,
    quick: 28,
  }), policy());
  assert.equal(observing.status, "observing");
  assert.equal(observing.wouldHandle, false);

  for (const pet of [
    blueDragonPet({growthModelVersion: "legacy_species_linear_v0"}),
    blueDragonPet({formId: "wuli_normal_orange_fire10"}),
    blueDragonPet({attack: 13}),
  ]) {
    const unavailable = evaluator.evaluatePet(pet, policy());
    assert.equal(unavailable.status, "unavailable");
    assert.equal(unavailable.wouldHandle, false);
    assert.equal(unavailable.retainPet, true);
    assert.equal(unavailable.mutationPerformed, false);
  }
});

test("profile preview is bounded, immutable, zero-mutation, and ignores private growth getters", () => {
  const evaluator = preview();
  const allowedKeys = new Set([
    "instanceId", "petId", "name", "displayName", "state", "formId", "templateId",
    "growthModelVersion", "growthSpeciesProfileId", "level", "initialStats",
    "growthSpeciesLevel1Stats", "maxHp", "attack", "defense", "quick",
  ]);
  const guarded = new Proxy(blueDragonPet(), {
    get(target, property, receiver) {
      if (typeof property === "string" && !allowedKeys.has(property)) {
        throw new Error(`forbidden pet read: ${property}`);
      }
      return Reflect.get(target, property, receiver);
    },
  });
  for (const key of ["privateSeed", "privateRoll", "petGrowth", "growthSpeciesRoll", "qualityRoll"]) {
    Object.defineProperty(guarded, key, {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error(`private field ${key} must not be read`);
      },
    });
  }
  const profile = {
    autoCaptureSettings: {growthRulePolicy: policy()},
    petInstances: [guarded, blueDragonPet({instanceId: "pet_second", petId: "pet_second"})],
  };
  const result = evaluator.evaluateProfile(profile);

  assert.equal(result.dryRun, true);
  assert.equal(result.retainPet, true);
  assert.equal(result.mutationCount, 0);
  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.wouldHandle, 2);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].pet.instanceId, "pet_blue_preview");
  assert.equal(result.items[0].status, "would_handle");
  assert.equal(Object.isFrozen(result), true);
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("profile preview never expands beyond the 25-slot owned roster bound", () => {
  const evaluator = createPetObservedGrowthRulePreview({
    screening: loadPetObservedGrowthScreening(),
    maxPets: 100,
  });
  const pets = Array.from({length: 30}, (_entry, index) => blueDragonPet({
    instanceId: `pet_bound_${index}`,
    petId: `pet_bound_${index}`,
  }));
  const result = evaluator.evaluateProfile({
    autoCaptureSettings: {growthRulePolicy: policy()},
    petInstances: pets,
  });

  assert.equal(result.items.length, 25);
  assert.equal(result.summary.total, 25);
  assert.equal(result.totalPetCount, 30);
  assert.equal(result.truncated, true);
  assert.equal(result.mutationCount, 0);
});
