"use strict";

const {
  assert,
  test,
  createAuthService,
  createMemoryAuthStore,
  battleProfile,
  profileItemCount,
} = require("../test-support/auth-service-test-context");

const CLUB_ID = "weapon_wooden_club";
const DAGGER_ID = "weapon_stone_dagger";
const EXP_PILL_ID = "item_exp_pill_lv1";

function equipmentInstance(instanceId, itemId, options = {}) {
  const expPill = itemId === EXP_PILL_ID;
  const enhancementLevel = Math.max(0, Math.trunc(Number(options.enhancementLevel || 0)));
  return {
    schemaVersion: 1,
    instanceId,
    itemId,
    location: String(options.location || "backpack"),
    slotId: String(options.slotId || ""),
    durability: expPill ? 0 : 30,
    enhancement: expPill ? {} : {itemId, level: enhancementLevel, history: []},
    wearCounters: expPill ? {} : {itemId, attackCount: 0, hitCount: 0},
    expPillCharge: expPill
      ? {
        itemId,
        level: Math.max(1, Math.trunc(Number(options.chargeLevel || 1))),
        exp: Math.max(0, Math.trunc(Number(options.chargeExp || 0))),
        nextExp: 1,
      }
      : {},
    source: "exact_instance_test",
  };
}

function filledBackpack(firstEntries) {
  const slots = firstEntries.map((entry) => ({...entry}));
  while (slots.length < 15) {
    slots.push({itemId: "item_meat_small", count: 99});
  }
  return slots;
}

function saveFixture(service, token, profile) {
  const saved = service.saveProfile(token, {expectedRevision: 0, profile});
  assert.equal(saved.ok, true, JSON.stringify(saved));
  return saved;
}

test("exact instance equip swaps same-template equipment and preserves the selected enhancement", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const registered = service.register({
    username: "equipsameinstance",
    password: "test1234",
    displayName: "同模装备号",
  });
  const token = registered.session.token;
  const profile = battleProfile("同模装备号", {level: 1, hp: 120, maxHp: 120}, null);
  profile.backpackSlots = filledBackpack([
    {itemId: CLUB_ID, count: 1},
    {itemId: CLUB_ID, count: 1},
  ]);
  profile.equipmentSlots = {right_hand_weapon: CLUB_ID};
  profile.equipmentDurability = {right_hand_weapon: 30};
  profile.equipmentEnhancement = {
    right_hand_weapon: {itemId: CLUB_ID, level: 1, history: []},
  };
  profile.equipmentWearCounters = {
    right_hand_weapon: {itemId: CLUB_ID, attackCount: 0, hitCount: 0},
  };
  profile.equipmentInstances = {
    equip_current: equipmentInstance("equip_current", CLUB_ID, {
      location: "equipped",
      slotId: "right_hand_weapon",
      enhancementLevel: 1,
    }),
    equip_plain: equipmentInstance("equip_plain", CLUB_ID),
    equip_plus_three: equipmentInstance("equip_plus_three", CLUB_ID, {
      enhancementLevel: 3,
    }),
  };
  profile.equipmentSlotInstanceIds = {right_hand_weapon: "equip_current"};
  profile.equipmentSlotsVersion = 5;
  profile.nextEquipmentInstanceSerial = 1;
  saveFixture(service, token, profile);

  const legacy = service.equipmentEquip(token, {itemId: CLUB_ID});
  assert.equal(legacy.ok, false);
  assert.equal(legacy.code, "equipment_already_equipped");
  assert.equal(service.getProfile(token).profileSummary.profileRevision, 1);

  const swapped = service.equipmentEquip(token, {
    itemId: CLUB_ID,
    equipmentInstanceId: "equip_plus_three",
  });
  assert.equal(swapped.ok, true);
  assert.equal(swapped.profileSummary.profileRevision, 2);
  assert.equal(swapped.equipment.instanceId, "equip_plus_three");
  assert.equal(swapped.equipment.previousInstanceId, "equip_current");
  assert.equal(swapped.profile.equipmentSlotInstanceIds.right_hand_weapon, "equip_plus_three");
  assert.equal(swapped.profile.equipmentEnhancement.right_hand_weapon.level, 3);
  assert.equal(swapped.profile.equipmentInstances.equip_plus_three.location, "equipped");
  assert.equal(swapped.profile.equipmentInstances.equip_current.location, "backpack");
  assert.equal(swapped.profile.equipmentInstances.equip_current.enhancement.level, 1);
  assert.equal(profileItemCount(swapped.profile, CLUB_ID), 2);
  assert.match(swapped.message, /更换木棒/);

  const sameInstance = service.equipmentEquip(token, {
    itemId: CLUB_ID,
    equipmentInstanceId: "equip_plus_three",
  });
  assert.equal(sameInstance.ok, false);
  assert.equal(sameInstance.code, "equipment_already_equipped");
  assert.equal(service.getProfile(token).profileSummary.profileRevision, 2);
  assert.equal(
    service.getProfile(token).profile.equipmentSlotInstanceIds.right_hand_weapon,
    "equip_plus_three",
  );
});

test("exact instance equip keeps the full-backpack unequip denial", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const registered = service.register({
    username: "equipfullinstance",
    password: "test1234",
    displayName: "满包装备号",
  });
  const token = registered.session.token;
  const profile = battleProfile("满包装备号", {level: 1, hp: 120, maxHp: 120}, null);
  profile.backpackSlots = filledBackpack([]);
  profile.equipmentSlots = {right_hand_weapon: DAGGER_ID};
  profile.equipmentDurability = {right_hand_weapon: 30};
  profile.equipmentEnhancement = {
    right_hand_weapon: {itemId: DAGGER_ID, level: 0, history: []},
  };
  profile.equipmentWearCounters = {
    right_hand_weapon: {itemId: DAGGER_ID, attackCount: 0, hitCount: 0},
  };
  profile.equipmentInstances = {
    equip_dagger: equipmentInstance("equip_dagger", DAGGER_ID, {
      location: "equipped",
      slotId: "right_hand_weapon",
    }),
  };
  profile.equipmentSlotInstanceIds = {right_hand_weapon: "equip_dagger"};
  profile.equipmentSlotsVersion = 5;
  profile.nextEquipmentInstanceSerial = 1;
  saveFixture(service, token, profile);

  const denied = service.equipmentUnequip(token, {slotId: "right_hand_weapon"});
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "backpack_full");
  const after = service.getProfile(token);
  assert.equal(after.profileSummary.profileRevision, 1);
  assert.equal(after.profile.equipmentSlotInstanceIds.right_hand_weapon, "equip_dagger");
  assert.equal(after.profile.equipmentInstances.equip_dagger.location, "equipped");
});

test("exact instance equip cannot bypass stored-exp pill replacement lock", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const registered = service.register({
    username: "equippillinstance",
    password: "test1234",
    displayName: "丹锁装备号",
  });
  const token = registered.session.token;
  const profile = battleProfile("丹锁装备号", {level: 140, hp: 120, maxHp: 120}, null);
  profile.backpackSlots = [
    {itemId: EXP_PILL_ID, count: 1},
    ...Array.from({length: 14}, () => ({})),
  ];
  profile.equipmentSlots = {exp_pill: EXP_PILL_ID};
  profile.equipmentDurability = {};
  profile.equipmentEnhancement = {};
  profile.equipmentWearCounters = {};
  profile.equipmentExpPillCharge = {
    itemId: EXP_PILL_ID,
    level: 1,
    exp: 1,
    nextExp: 1,
  };
  profile.equipmentInstances = {
    equip_charged_pill: equipmentInstance("equip_charged_pill", EXP_PILL_ID, {
      location: "equipped",
      slotId: "exp_pill",
      chargeExp: 1,
    }),
    equip_empty_pill: equipmentInstance("equip_empty_pill", EXP_PILL_ID),
  };
  profile.equipmentSlotInstanceIds = {exp_pill: "equip_charged_pill"};
  profile.equipmentSlotsVersion = 5;
  profile.nextEquipmentInstanceSerial = 1;
  saveFixture(service, token, profile);

  const denied = service.equipmentEquip(token, {
    itemId: EXP_PILL_ID,
    equipmentInstanceId: "equip_empty_pill",
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "equipment_exp_pill_locked");
  const after = service.getProfile(token);
  assert.equal(after.profileSummary.profileRevision, 1);
  assert.equal(after.profile.equipmentSlotInstanceIds.exp_pill, "equip_charged_pill");
  assert.equal(after.profile.equipmentInstances.equip_empty_pill.location, "backpack");
});
