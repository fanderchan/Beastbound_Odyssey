"use strict";

const {
  loadPetGrowthCatalog,
} = require("../src/auth/pet-growth-catalog");
const {
  initializePetGrowth,
  settlePetGrowthToLevel,
} = require("../src/auth/pet-growth-runtime");
const {createPetRebirthGrowthCycle} = require("../src/auth/pet-rebirth-growth-cycle");

const FORM_ID = "rebirth_starter_four_spirit_cub";
const PROFILE_ID = "rebirth_starter_four_spirit_cub_v1";

function createTwoRebirthAuthorityPet(options = {}) {
  const instanceId = String(options.instanceId || "paid_reset_fixture_pet");
  const privateSeed = String(options.privateSeed || `bps1_${"Q".repeat(43)}`);
  const catalog = loadPetGrowthCatalog();
  const profile = catalog.requireProfileById(PROFILE_ID);
  const cycle = createPetRebirthGrowthCycle({growthCatalog: catalog});
  let pet = initializePetGrowth({
    instanceId,
    petId: instanceId,
    formId: FORM_ID,
    templateId: FORM_ID,
    speciesId: FORM_ID,
    growthSpeciesProfileId: profile.profileId,
    name: String(options.name || "事务四灵幼兽"),
    formName: "四灵幼兽",
    state: String(options.state || "standby"),
    level: 1,
    exp: 0,
    nextExp: 100,
    hp: 1,
    maxHp: 1,
    attack: 1,
    defense: 1,
    quick: 1,
    binding: String(options.binding || "bound"),
    bound: options.bound === undefined ? true : Boolean(options.bound),
    bindingLocked: options.bindingLocked === undefined ? true : Boolean(options.bindingLocked),
    locked: Boolean(options.locked),
    activeSkillIds: ["pet_attack", "pet_defend", "pet_bui_charge"],
    petSkillSlots: ["pet_attack", "pet_defend", "pet_bui_charge"],
    passiveSkillIds: ["bui_resistant_skin"],
    learnedSkillIds: ["pet_bui_charge"],
  }, profile, {
    privateSeed,
    cultivation: {
      schemaVersion: 1,
      initialBonus: {maxHp: 1.2, attack: 0.3, defense: 0.2, quick: 0.1},
      growthBonus: {maxHp: 0, attack: 0, defense: 0, quick: 0},
    },
  }).pet;
  pet = settlePetGrowthToLevel(pet, profile, 140).pet;
  pet = cycle.restart(pet, cultivationRecord(instanceId, 1)).pet;
  pet.exp = 0;
  pet.nextExp = 100;
  pet = settlePetGrowthToLevel(pet, profile, 140).pet;
  pet = cycle.restart(pet, cultivationRecord(instanceId, 2)).pet;
  pet.exp = 4321;
  pet.nextExp = 8800;
  pet = settlePetGrowthToLevel(pet, profile, Math.max(1, Math.min(140, Number(options.level || 88)))).pet;
  pet.exp = 4321;
  pet.nextExp = 8800;
  return {catalog, cycle, profile, pet, privateSeed};
}

function cultivationRecord(instanceId, stage) {
  const growthBonus = stage === 1
    ? {maxHp: 0.4, attack: 0.2, defense: 0.1, quick: 0.3}
    : {maxHp: 0.7, attack: 0.5, defense: 0.3, quick: 0.5};
  const history = [{
    schemaVersion: 1,
    mode: "enhance",
    timestamp: 1700000000,
    petInstanceId: instanceId,
    petName: "事务四灵幼兽",
    formId: FORM_ID,
    beforeLevel: 100,
    afterLevel: 100,
    beforeRebirthCount: 0,
    afterRebirthCount: 0,
    beforeEnhanceLevel: 2,
    afterEnhanceLevel: 3,
    summary: "强化 +2 -> +3",
    message: "强化完成",
  }];
  for (let index = 1; index <= stage; index += 1) {
    history.push({
      schemaVersion: 1,
      mode: "rebirth",
      timestamp: 1700000000 + index,
      petInstanceId: instanceId,
      petName: "事务四灵幼兽",
      formId: FORM_ID,
      beforeLevel: 140,
      afterLevel: 1,
      beforeRebirthCount: index - 1,
      afterRebirthCount: index,
      beforeEnhanceLevel: 3,
      afterEnhanceLevel: 3,
      visibleGrowthBonus: index === 1
        ? {maxHp: 0.4, attack: 0.2, defense: 0.1, quick: 0.3}
        : {maxHp: 0.3, attack: 0.3, defense: 0.2, quick: 0.2},
      summary: `${index - 1}转 -> ${index}转`,
      message: `第${index}次转生`,
    });
  }
  return {
    schemaVersion: 1,
    rebirthCount: stage,
    enhanceLevel: 3,
    rebirthGrowthBonus: growthBonus,
    history,
    lastPreview: {schemaVersion: 1, stage},
    lastResult: structuredClone(history[history.length - 1]),
  };
}

function seedPaidResetAccount(service, options = {}) {
  const username = String(options.username || "paidresetfixture");
  const registered = service.register({
    username,
    password: "test1234",
    displayName: String(options.displayName || "重置事务猎人"),
  });
  if (!registered.ok) {
    throw new Error(`paid reset fixture registration failed: ${registered.code}`);
  }
  const loaded = service.getProfile(registered.session.token);
  if (!loaded.ok) {
    throw new Error(`paid reset fixture profile load failed: ${loaded.code}`);
  }
  const profile = structuredClone(loaded.profile);
  const fixture = createTwoRebirthAuthorityPet(options.pet || {});
  profile.petInstances = [fixture.pet];
  profile.activePetInstanceId = fixture.pet.instanceId;
  profile.ridePetInstanceId = "";
  profile.diamonds = Number(options.diamonds ?? 100);
  profile.boundDiamonds = Number(options.boundDiamonds ?? 250);
  profile.stoneCoins = Number(options.stoneCoins ?? 500000);
  profile.boundStoneCoins = Number(options.boundStoneCoins ?? 500000);
  const saved = service.saveProfile(registered.session.token, {
    expectedRevision: loaded.profileSummary.profileRevision,
    profile,
  });
  if (!saved.ok) {
    throw new Error(`paid reset fixture profile seed failed: ${saved.code}`);
  }
  return {
    ...registered,
    fixture,
    profileRevision: saved.profileSummary.profileRevision,
  };
}

module.exports = {
  FORM_ID,
  PROFILE_ID,
  createTwoRebirthAuthorityPet,
  seedPaidResetAccount,
};
