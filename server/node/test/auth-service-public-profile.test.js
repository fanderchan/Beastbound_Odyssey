"use strict";

const {
  assert,
  test,
  createAuthService,
  createMemoryAuthStore,
} = require("../test-support/auth-service-test-context");
const {loadPetGrowthCatalog} = require("../src/auth/pet-growth-catalog");
const {createNewPetFactory} = require("../src/auth/new-pet-factory");

const PRIVATE_KEYS = new Set([
  "continuousStats",
  "individualSeed",
  "individualVariance",
  "private",
  "privateRoll",
  "privateSeed",
]);

function firstPrivatePath(value, prefix = "") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nested = firstPrivatePath(value[index], `${prefix}[${index}]`);
      if (nested) return nested;
    }
    return "";
  }
  if (!value || typeof value !== "object") return "";
  for (const [key, nestedValue] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (PRIVATE_KEYS.has(key)) return path;
    const nested = firstPrivatePath(nestedValue, path);
    if (nested) return nested;
  }
  return "";
}

function authorityProfile(displayName) {
  const catalog = loadPetGrowthCatalog();
  const growthProfile = catalog.requireProfileById("blue_man_dragon_v1");
  const pet = createNewPetFactory({growthCatalog: catalog}).finalizeLevelOne({
    instanceId: "service_public_v1_pet",
    petId: "service_public_v1_pet",
    formId: growthProfile.formId,
    templateId: growthProfile.formId,
    name: "公开边界蓝人龙",
    state: "battle",
    level: 1,
    exp: 0,
    nextExp: 122,
    hp: growthProfile.outputBase.maxHp,
    maxHp: growthProfile.outputBase.maxHp,
    attack: growthProfile.outputBase.attack,
    defense: growthProfile.outputBase.defense,
    quick: growthProfile.outputBase.quick,
    activeSkillIds: ["pet_attack", "pet_defend"],
    petSkillSlots: ["pet_attack", "pet_defend", "", "", "", "", ""],
    passiveSkillIds: [],
  }, {purpose: "service_public_test_growth"}).pet;
  return {
    player: {name: displayName, level: 1, hp: 120, maxHp: 120},
    activePetInstanceId: pet.instanceId,
    petInstances: [pet],
    backpackSlots: [],
  };
}

test("service profile boundaries project authority pets while internal snapshots retain private state", () => {
  const store = createMemoryAuthStore();
  const bootstrap = createAuthService({store});
  const registered = bootstrap.register({
    username: "publicprofilev2",
    password: "test1234",
    displayName: "公开边界玩家",
  });
  assert.equal(registered.ok, true);
  assert.equal(bootstrap.saveProfile(registered.session.token, {
    expectedRevision: 0,
    profile: authorityProfile("公开边界玩家"),
  }).ok, true);

  const service = createAuthService({store, allowFullProfileSave: false});
  const pulled = service.getProfile(registered.session.token);
  assert.equal(pulled.ok, true);
  assert.equal(firstPrivatePath(pulled), "");
  assert.equal(pulled.profile.petInstances[0].growthAuthority.modelVersion, "pet_growth_authority_v1");
  assert.equal(Object.hasOwn(pulled.profile.petInstances[0].petGrowth, "private"), false);

  const internalBefore = service.snapshot().profiles[pulled.profileSummary.playerId].profile.petInstances[0];
  assert.equal(typeof internalBefore.petGrowth.private.privateSeed, "string");
  const privateSeed = internalBefore.petGrowth.private.privateSeed;

  const mutated = service.profileAction(registered.session.token, {
    action: "pet_lock_toggle",
    payload: {instanceId: internalBefore.instanceId},
  });
  assert.equal(mutated.ok, true);
  assert.equal(firstPrivatePath(mutated), "");
  assert.equal(mutated.profile.petInstances[0].locked, true);
  const internalAfter = service.snapshot().profiles[pulled.profileSummary.playerId].profile.petInstances[0];
  assert.equal(internalAfter.petGrowth.private.privateSeed, privateSeed);
});
