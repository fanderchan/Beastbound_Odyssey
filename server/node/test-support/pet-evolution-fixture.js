"use strict";

const {loadPetEvolutionRouteCatalog} = require("../src/auth/pet-evolution-route-catalog");
const {loadPetGrowthCatalog} = require("../src/auth/pet-growth-catalog");
const {
  initializePetGrowth,
  settlePetGrowthToLevel,
} = require("../src/auth/pet-growth-runtime");
const {createPetRebirthGrowthCycle} = require("../src/auth/pet-rebirth-growth-cycle");

const ROUTE_ID = "wuli_crystal_evolution_v1";
const SOURCE_FORM_ID = "wuli_normal_tough_earth10";
const SOURCE_PROFILE_ID = "wuli_normal_tough_earth10_v1";
const TARGET_FORM_ID = "wuli_evolved_crystal_earth8_water2";
const LICENSE_ABILITY_ID = "pet_evolution_wuli_license";
const CORE_ITEM_ID = "pet_evolution_resonance_core";
const LINEAGE_ITEM_ID = "pet_evolution_wuli_crystal_scale";

function createEnabledPetEvolutionRouteCatalog() {
  const source = loadPetEvolutionRouteCatalog();
  const routes = source.routes.map((route) => ({
    ...structuredClone(route),
    assetGate: {...structuredClone(route.assetGate), status: "formal"},
  }));
  const catalog = {
    ...structuredClone(source),
    runtimeEnabled: true,
    routes,
    routesById: Object.fromEntries(routes.map((route) => [route.routeId, route])),
  };
  return deepFreeze(catalog);
}

function createOneRebirthEvolutionPet(options = {}) {
  const instanceId = String(options.instanceId || "evolution_fixture_pet");
  const privateSeed = String(options.privateSeed || `bps1_${"W".repeat(43)}`);
  const rebirthGrowthBonus = structuredClone(options.rebirthGrowthBonus || {
    maxHp: 1.4,
    attack: 0.6,
    defense: 0.6,
    quick: 0.6,
  });
  const growthCatalog = loadPetGrowthCatalog();
  const growthProfile = growthCatalog.requireProfileById(SOURCE_PROFILE_ID);
  const growthCycle = createPetRebirthGrowthCycle({growthCatalog});
  let pet = initializePetGrowth({
    schemaVersion: 1,
    instanceId,
    petId: instanceId,
    formId: SOURCE_FORM_ID,
    templateId: SOURCE_FORM_ID,
    speciesId: SOURCE_FORM_ID,
    lineId: "wuli",
    lineName: "乌力系",
    subtypeId: "wuli_normal",
    subtypeName: "普通乌力",
    formName: "高防乌力",
    growthProfileId: "defense_high",
    growthSpeciesProfileId: SOURCE_PROFILE_ID,
    name: String(options.name || "进化测试高防乌力"),
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
    elements: {earth: 10, water: 0, fire: 0, wind: 0},
    activeSkillIds: ["pet_attack", "pet_defend", "pet_focus_bite"],
    petSkillSlots: ["pet_attack", "pet_defend", "pet_focus_bite", "", "", "", ""],
    passiveSkillIds: ["wuli_hard_shell"],
    learnedSkillIds: ["pet_focus_bite"],
    inheritedSkillIds: [],
    paidResetCount: 2,
    capturedSerial: 37,
    capturedAtSec: 1700000000,
  }, growthProfile, {
    privateSeed,
    cultivation: {
      schemaVersion: 1,
      initialBonus: {maxHp: 0, attack: 0, defense: 0, quick: 0},
      growthBonus: {maxHp: 0, attack: 0, defense: 0, quick: 0},
    },
  }).pet;
  pet = settlePetGrowthToLevel(pet, growthProfile, 140).pet;
  const rebirthEvent = {
    schemaVersion: 1,
    mode: "rebirth",
    timestamp: 1700000100,
    petInstanceId: instanceId,
    petName: pet.name,
    formId: SOURCE_FORM_ID,
    beforeLevel: 140,
    afterLevel: 1,
    beforeRebirthCount: 0,
    afterRebirthCount: 1,
    beforeEnhanceLevel: 3,
    afterEnhanceLevel: 3,
    visibleGrowthBonus: structuredClone(rebirthGrowthBonus),
    summary: "0转 -> 1转，Lv140 -> Lv1",
    message: "一转完成",
  };
  const cultivation = {
    schemaVersion: 1,
    rebirthCount: 1,
    enhanceLevel: 3,
    rebirthGrowthBonus: structuredClone(rebirthGrowthBonus),
    history: [rebirthEvent],
    lastPreview: {},
    lastResult: structuredClone(rebirthEvent),
  };
  pet = growthCycle.restart(pet, cultivation).pet;
  pet = settlePetGrowthToLevel(pet, growthProfile, 140).pet;
  pet.exp = 0;
  return {growthCatalog, growthCycle, growthProfile, pet, privateSeed};
}

function seedEvolutionAccount(service, options = {}) {
  const username = String(options.username || "evolutionfixture");
  const registered = service.register({
    username,
    password: "test1234",
    displayName: String(options.displayName || "进化事务猎人"),
  });
  if (!registered.ok) throw new Error(`evolution fixture registration failed: ${registered.code}`);
  const loaded = service.getProfile(registered.session.token);
  if (!loaded.ok) throw new Error(`evolution fixture profile load failed: ${loaded.code}`);
  const profile = structuredClone(loaded.profile);
  const fixture = createOneRebirthEvolutionPet(options.pet || {});
  profile.petInstances = [fixture.pet];
  profile.activePetInstanceId = fixture.pet.instanceId;
  profile.ridePetInstanceId = String(options.ridePetInstanceId || "");
  profile.unlockedAbilities = options.withLicense === false
    ? []
    : [LICENSE_ABILITY_ID];
  profile.backpackSlots = (Array.isArray(profile.backpackSlots) ? profile.backpackSlots : [])
    .map((slot) => ([CORE_ITEM_ID, LINEAGE_ITEM_ID].includes(String(slot && slot.itemId || "")) ? {} : slot));
  const coreCount = Math.max(0, Math.trunc(Number(options.coreCount ?? 8)));
  const lineageCount = Math.max(0, Math.trunc(Number(options.lineageCount ?? 12)));
  putBackpackStack(profile.backpackSlots, CORE_ITEM_ID, coreCount);
  putBackpackStack(profile.backpackSlots, LINEAGE_ITEM_ID, lineageCount);
  profile.stoneCoins = Math.max(0, Math.trunc(Number(options.stoneCoins ?? 100000)));
  profile.boundStoneCoins = Math.max(0, Math.trunc(Number(options.boundStoneCoins ?? 250000)));
  const saved = service.saveProfile(registered.session.token, {
    expectedRevision: loaded.profileSummary.profileRevision,
    profile,
  });
  if (!saved.ok) throw new Error(`evolution fixture profile seed failed: ${saved.code}`);
  return {
    ...registered,
    fixture,
    profileRevision: saved.profileSummary.profileRevision,
  };
}

function putBackpackStack(slots, itemId, count) {
  if (count <= 0) return;
  const index = slots.findIndex((slot) => String(slot && slot.itemId || "").trim() === "");
  if (index < 0) throw new Error(`evolution fixture has no empty backpack slot for ${itemId}`);
  slots[index] = {itemId, count};
}

function deepFreeze(value, visited = new WeakSet()) {
  if (!value || typeof value !== "object" || visited.has(value)) return value;
  visited.add(value);
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested, visited);
  return value;
}

module.exports = {
  CORE_ITEM_ID,
  LICENSE_ABILITY_ID,
  LINEAGE_ITEM_ID,
  ROUTE_ID,
  SOURCE_FORM_ID,
  SOURCE_PROFILE_ID,
  TARGET_FORM_ID,
  createEnabledPetEvolutionRouteCatalog,
  createOneRebirthEvolutionPet,
  seedEvolutionAccount,
};
