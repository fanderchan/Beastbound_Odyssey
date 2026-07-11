"use strict";

const {assert, test} = require("../test-support/auth-service-test-context");
const {
  applyEquipmentWearUsageToProfile,
  equipmentWearRulesFromDocument,
  loadBattleEquipmentCatalog,
  resolveEquipmentBattleStats,
} = require("../src/auth/battle-equipment-rules");

const catalog = loadBattleEquipmentCatalog();
const wearRules = equipmentWearRulesFromDocument({
  equipmentWear: {
    weaponAttacksPerDurability: 100,
    armorHitsPerDurability: 10,
  },
});

function baseProfile() {
  return {
    player: {
      level: 20,
      hp: 120,
      maxHp: 120,
      baseStats: {maxHp: 120, attack: 18, defense: 6, quick: 70},
    },
    rebirthCount: 0,
    equipmentSlots: {},
    equipmentDurability: {},
    equipmentEnhancement: {},
    equipmentWearCounters: {},
    equipmentInstances: {},
    equipmentSlotInstanceIds: {},
  };
}

test("equipment battle stats match the established client vectors", () => {
  const profile = baseProfile();
  profile.equipmentSlots = {
    right_hand_weapon: "weapon_stone_axe",
    body: "armor_stitched_hide_vest",
    accessory_left: "accessory_firebud_charm",
  };
  profile.equipmentDurability = {right_hand_weapon: 30, body: 34, accessory_left: 30};
  profile.equipmentEnhancement = {
    right_hand_weapon: {itemId: "weapon_stone_axe", level: 2},
    body: {itemId: "armor_stitched_hide_vest", level: 3},
    accessory_left: {itemId: "accessory_firebud_charm", level: 2},
  };
  const result = resolveEquipmentBattleStats(profile, catalog);
  assert.deepEqual(result.baseStats, {maxHp: 120, attack: 18, defense: 6, quick: 70});
  assert.deepEqual(result.equipmentBonus, {maxHp: 18, attack: 13, defense: 10, quick: -2});
  assert.deepEqual(result.effectiveStats, {maxHp: 138, attack: 31, defense: 16, quick: 68});
  assert.equal(result.currentHp, 120);
});

test("legacy profiles without baseStats do not count equipped max HP twice", () => {
  const profile = baseProfile();
  profile.player = {level: 20, hp: 128, maxHp: 128, attack: 18, defense: 6, quick: 70};
  profile.equipmentSlots = {accessory_left: "accessory_firebud_charm"};
  profile.equipmentDurability = {accessory_left: 30};
  const result = resolveEquipmentBattleStats(profile, catalog);
  assert.deepEqual(result.baseStats, {maxHp: 120, attack: 18, defense: 6, quick: 70});
  assert.deepEqual(result.effectiveStats, {maxHp: 128, attack: 18, defense: 6, quick: 70});
  assert.equal(result.currentHp, 128);
});

test("broken and requirement-inactive equipment loses stats, spirits, and attack style", () => {
  const profile = baseProfile();
  profile.equipmentSlots = {
    right_hand_weapon: "weapon_shadow_group_bow",
    body: "armor_moist_cloth",
  };
  profile.equipmentDurability = {right_hand_weapon: 50, body: 0};
  let result = resolveEquipmentBattleStats(profile, catalog);
  assert.deepEqual(result.effectiveStats, {maxHp: 120, attack: 18, defense: 6, quick: 70});
  assert.equal(result.attackActionId, "");
  assert.equal(result.attackStyle, "melee");
  assert.deepEqual(result.spiritIds, []);

  profile.rebirthCount = 6;
  result = resolveEquipmentBattleStats(profile, catalog);
  assert.deepEqual(result.effectiveStats, {maxHp: 120, attack: 50, defense: 6, quick: 75});
  assert.equal(result.attackActionId, "weapon_shadow_group_shot");
  assert.equal(result.attackStyle, "ranged");
  assert.deepEqual(result.battleActionIds, ["weapon_shadow_group_shot"]);
});

test("equipment in a mismatched slot is ignored instead of stacking duplicate stats", () => {
  const profile = baseProfile();
  profile.rebirthCount = 6;
  profile.equipmentSlots = {
    head: "weapon_shadow_group_bow",
    body: "weapon_shadow_group_bow",
    right_hand_weapon: "weapon_shadow_group_bow",
  };
  profile.equipmentDurability = {head: 50, body: 50, right_hand_weapon: 50};
  const result = resolveEquipmentBattleStats(profile, catalog);
  assert.deepEqual(result.equipmentBonus, {maxHp: 0, attack: 32, defense: 0, quick: 5});
  assert.equal(result.slotFacts.find((entry) => entry.slotId === "head").reason, "slot_mismatch");
  assert.equal(result.slotFacts.find((entry) => entry.slotId === "body").reason, "slot_mismatch");
  assert.equal(result.slotFacts.find((entry) => entry.slotId === "right_hand_weapon").active, true);
});

test("equipment wear persists counter remainder, durability, and canonical instance state", () => {
  const profile = baseProfile();
  profile.equipmentSlots = {
    right_hand_weapon: "weapon_wooden_club",
    body: "armor_hide_vest",
  };
  profile.equipmentDurability = {right_hand_weapon: 30, body: 30};
  profile.equipmentWearCounters = {
    right_hand_weapon: {itemId: "weapon_wooden_club", attackCount: 99, hitCount: 0},
    body: {itemId: "armor_hide_vest", attackCount: 0, hitCount: 9},
  };
  profile.equipmentSlotInstanceIds = {
    right_hand_weapon: "equip_weapon",
    body: "equip_body",
  };
  profile.equipmentInstances = {
    equip_weapon: {
      instanceId: "equip_weapon",
      itemId: "weapon_wooden_club",
      location: "equipped",
      slotId: "right_hand_weapon",
      durability: 30,
      wearCounters: {...profile.equipmentWearCounters.right_hand_weapon},
    },
    equip_body: {
      instanceId: "equip_body",
      itemId: "armor_hide_vest",
      location: "equipped",
      slotId: "body",
      durability: 30,
      wearCounters: {...profile.equipmentWearCounters.body},
    },
  };
  const result = applyEquipmentWearUsageToProfile(profile, {weaponAttacks: 1, armorHits: 1}, catalog, wearRules);
  assert.equal(result.changed, true);
  assert.deepEqual(result.durabilityDrops.map((entry) => [entry.slotId, entry.amount]), [
    ["right_hand_weapon", 1],
    ["body", 1],
  ]);
  assert.equal(profile.equipmentDurability.right_hand_weapon, 29);
  assert.equal(profile.equipmentDurability.body, 29);
  assert.equal(profile.equipmentWearCounters.right_hand_weapon.attackCount, 0);
  assert.equal(profile.equipmentWearCounters.body.hitCount, 0);
  assert.equal(profile.equipmentInstances.equip_weapon.durability, 29);
  assert.equal(profile.equipmentInstances.equip_body.durability, 29);
});

test("sub-threshold equipment wear still persists its counter", () => {
  const profile = baseProfile();
  profile.equipmentSlots = {right_hand_weapon: "weapon_wooden_club"};
  profile.equipmentDurability = {right_hand_weapon: 30};
  profile.equipmentWearCounters = {
    right_hand_weapon: {itemId: "weapon_wooden_club", attackCount: 98, hitCount: 0},
  };
  const result = applyEquipmentWearUsageToProfile(profile, {weaponAttacks: 1}, catalog, wearRules);
  assert.equal(result.changed, true);
  assert.deepEqual(result.durabilityDrops, []);
  assert.equal(profile.equipmentDurability.right_hand_weapon, 30);
  assert.equal(profile.equipmentWearCounters.right_hand_weapon.attackCount, 99);
});

test("wear skips requirement-inactive equipment and reaches the next valid slot", () => {
  const profile = baseProfile();
  profile.equipmentSlots = {
    right_hand_weapon: "weapon_shadow_group_bow",
    left_hand_weapon: "weapon_training_spear",
  };
  profile.equipmentDurability = {right_hand_weapon: 50, left_hand_weapon: 30};
  profile.equipmentWearCounters = {
    right_hand_weapon: {itemId: "weapon_shadow_group_bow", attackCount: 0, hitCount: 0},
    left_hand_weapon: {itemId: "weapon_training_spear", attackCount: 0, hitCount: 0},
  };
  const result = applyEquipmentWearUsageToProfile(profile, {weaponAttacks: 1}, catalog, wearRules);
  assert.equal(result.changed, true);
  assert.equal(profile.equipmentWearCounters.right_hand_weapon.attackCount, 0);
  assert.equal(profile.equipmentWearCounters.left_hand_weapon.attackCount, 1);
});
