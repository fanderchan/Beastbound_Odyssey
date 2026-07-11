"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {buildBattleEquipmentCatalog} = require("../src/auth/battle-equipment-rules");
const {
  EQUIPMENT_SLOTS_VERSION,
  auditEquipmentProfileState,
  consumeBackpackEquipmentInstances,
  grantFreshBackpackEquipmentInstances,
  moveBackpackEquipmentInstanceToSlot,
  moveEquippedEquipmentInstanceToBackpack,
  readEquipmentInstanceState,
  requireEquippedEquipmentInstance,
} = require("../src/auth/equipment-profile-state");

const catalog = buildBattleEquipmentCatalog({
  schemaVersion: 1,
  slots: [{id: "right_hand_weapon"}, {id: "exp_pill"}],
  items: [
    {id: "weapon_club", slot: "right_hand_weapon", durabilityMax: 30, enhanceMax: 5, stats: {attack: 3}},
    {id: "weapon_axe", slot: "right_hand_weapon", durabilityMax: 40, enhanceMax: 5, stats: {attack: 6}},
    {id: "exp_pill_131", slot: "exp_pill", usesDurability: false, expPill: true, expPillLevel: 131, stats: {}},
  ],
});

function slots(...entries) {
  return [...entries, ...Array.from({length: Math.max(0, 15 - entries.length)}, () => ({}))];
}

function instance(instanceId, itemId, overrides = {}) {
  const item = catalog.itemById.get(itemId);
  return {
    schemaVersion: 1,
    instanceId,
    itemId,
    location: "backpack",
    slotId: "",
    durability: item.usesDurability === false ? 0 : Number(item.durabilityMax || 30),
    enhancement: item.expPill ? {} : {itemId, level: 0, history: []},
    wearCounters: item.usesDurability === false ? {} : {itemId, attackCount: 0, hitCount: 0},
    expPillCharge: item.expPill ? {itemId, level: 131, exp: 0, nextExp: 1} : {},
    source: "test",
    ...overrides,
  };
}

test("fresh grants create one instance per template and preserve unknown fields", () => {
  const profile = {
    backpackSlots: slots({itemId: "weapon_club", count: 1}, {itemId: "weapon_axe", count: 1}),
    equipmentInstances: {
      legacy_axe: instance("legacy_axe", "weapon_axe", {affixes: [{id: "future_power", value: 7}], boundTo: "acc_1"}),
    },
    equipmentSlotInstanceIds: {},
    nextEquipmentInstanceSerial: 1,
    equipmentSlotsVersion: 4,
  };

  const result = grantFreshBackpackEquipmentInstances(profile, catalog, [{itemId: "weapon_club", count: 1}], "shop");

  assert.equal(result.ok, true);
  assert.deepEqual(result.instanceIds, ["equip_000001"]);
  assert.deepEqual(profile.equipmentInstances.legacy_axe.affixes, [{id: "future_power", value: 7}]);
  assert.equal(profile.equipmentInstances.legacy_axe.boundTo, "acc_1");
  assert.equal(profile.equipmentInstances.equip_000001.source, "shop");
  assert.equal(profile.nextEquipmentInstanceSerial, 2);
  assert.equal(profile.equipmentSlotsVersion, EQUIPMENT_SLOTS_VERSION);
});

test("fresh exp pills require and store the authoritative next-exp curve", () => {
  const profile = {
    backpackSlots: slots({itemId: "exp_pill_131", count: 2}),
    equipmentInstances: {},
    equipmentSlotInstanceIds: {},
    nextEquipmentInstanceSerial: 1,
    equipmentSlotsVersion: 5,
  };
  const before = structuredClone(profile);
  const missingCurve = grantFreshBackpackEquipmentInstances(profile, catalog, [{itemId: "exp_pill_131", count: 2}], "reward");
  assert.equal(missingCurve.ok, false);
  assert.equal(missingCurve.code, "equipment_exp_pill_curve_missing");
  assert.deepEqual(profile, before);

  const granted = grantFreshBackpackEquipmentInstances(
    profile,
    catalog,
    [{itemId: "exp_pill_131", count: 2}],
    "reward",
    {expToNextLevel: (level) => level * 100},
  );
  assert.equal(granted.ok, true);
  assert.equal(granted.instanceIds.length, 2);
  assert.ok(granted.instanceIds.every((instanceId) => profile.equipmentInstances[instanceId].expPillCharge.nextExp === 13100));
});

test("fresh grant fails closed on future instance schemas without changing the profile", () => {
  const profile = {
    backpackSlots: slots({itemId: "weapon_club", count: 1}, {itemId: "weapon_axe", count: 1}),
    equipmentInstances: {
      future_axe: instance("future_axe", "weapon_axe", {schemaVersion: 2, affixes: [{id: "future"}]}),
    },
    equipmentSlotInstanceIds: {},
    nextEquipmentInstanceSerial: 1,
    equipmentSlotsVersion: 5,
  };
  const before = structuredClone(profile);

  const result = grantFreshBackpackEquipmentInstances(profile, catalog, [{itemId: "weapon_club", count: 1}], "quest");

  assert.equal(result.ok, false);
  assert.equal(result.code, "equipment_instance_schema_future");
  assert.deepEqual(profile, before);
});

test("unsafe instance serials fail closed instead of entering an unbounded collision loop", () => {
  const profile = {
    backpackSlots: slots({itemId: "weapon_club", count: 1}),
    equipmentInstances: {},
    equipmentSlotInstanceIds: {},
    nextEquipmentInstanceSerial: Number.MAX_SAFE_INTEGER + 1,
    equipmentSlotsVersion: 5,
  };
  const before = structuredClone(profile);
  const result = grantFreshBackpackEquipmentInstances(profile, catalog, [{itemId: "weapon_club", count: 1}], "test");
  assert.equal(result.ok, false);
  assert.equal(result.code, "equipment_instance_serial_invalid");
  assert.deepEqual(profile, before);

  const exhausted = {...structuredClone(before), nextEquipmentInstanceSerial: 1000000000};
  const exhaustedBefore = structuredClone(exhausted);
  const exhaustedResult = grantFreshBackpackEquipmentInstances(exhausted, catalog, [{itemId: "weapon_club", count: 1}], "test");
  assert.equal(exhaustedResult.ok, false);
  assert.equal(exhaustedResult.code, "equipment_instance_serial_exhausted");
  assert.deepEqual(exhausted, exhaustedBefore);
});

test("consume rejects surplus ghosts and never guesses which asset is real", () => {
  const profile = {
    backpackSlots: slots({itemId: "weapon_club", count: 1}),
    equipmentInstances: {
      equip_000001: instance("equip_000001", "weapon_club"),
      equip_000002: instance("equip_000002", "weapon_club", {enhancement: {itemId: "weapon_club", level: 3, history: []}}),
    },
    equipmentSlotInstanceIds: {},
    equipmentSlotsVersion: 5,
  };
  const before = structuredClone(profile);

  const result = consumeBackpackEquipmentInstances(profile, catalog, "weapon_club", 1);

  assert.equal(result.ok, false);
  assert.equal(result.code, "equipment_backpack_state_conflict");
  assert.deepEqual(profile, before);
});

test("partial consume requires an explicit id when same-name equipment states differ", () => {
  const profile = {
    backpackSlots: slots({itemId: "weapon_club", count: 1}, {itemId: "weapon_club", count: 1}),
    equipmentInstances: {
      equip_000001: instance("equip_000001", "weapon_club", {enhancement: {itemId: "weapon_club", level: 0, history: []}}),
      equip_000002: instance("equip_000002", "weapon_club", {enhancement: {itemId: "weapon_club", level: 3, history: []}, quality: "rare"}),
    },
    equipmentSlotInstanceIds: {},
    equipmentSlotsVersion: 5,
  };

  const ambiguous = consumeBackpackEquipmentInstances(profile, catalog, "weapon_club", 1);
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.code, "equipment_instance_selection_ambiguous");

  const selected = consumeBackpackEquipmentInstances(profile, catalog, "weapon_club", 1, {instanceIds: ["equip_000001"]});
  assert.equal(selected.ok, true);
  assert.equal(profile.equipmentInstances.equip_000001, undefined);
  assert.equal(profile.equipmentInstances.equip_000002.quality, "rare");
});

test("equip and unequip move the same instance while preserving future-safe fields", () => {
  const profile = {
    backpackSlots: slots({itemId: "weapon_club", count: 1}),
    equipmentSlots: {},
    equipmentInstances: {
      equip_000009: instance("equip_000009", "weapon_club", {quality: "rare", affixes: [{id: "power", value: 4}]}),
    },
    equipmentSlotInstanceIds: {},
    equipmentSlotsVersion: 5,
  };

  const equipped = moveBackpackEquipmentInstanceToSlot(profile, catalog, "weapon_club", "right_hand_weapon");
  assert.equal(equipped.ok, true);
  profile.equipmentSlots.right_hand_weapon = "weapon_club";
  assert.equal(profile.equipmentInstances.equip_000009.location, "equipped");
  assert.equal(profile.equipmentInstances.equip_000009.quality, "rare");

  const unequipped = moveEquippedEquipmentInstanceToBackpack(profile, catalog, "right_hand_weapon");
  assert.equal(unequipped.ok, true);
  assert.equal(unequipped.instanceId, "equip_000009");
  assert.equal(profile.equipmentInstances.equip_000009.location, "backpack");
  assert.deepEqual(profile.equipmentInstances.equip_000009.affixes, [{id: "power", value: 4}]);
});

test("wrong-item slot mappings fail closed instead of rewriting the mapped instance", () => {
  const profile = {
    backpackSlots: slots(),
    equipmentSlots: {right_hand_weapon: "weapon_club"},
    equipmentInstances: {
      equip_000002: instance("equip_000002", "weapon_axe", {location: "equipped", slotId: "right_hand_weapon"}),
    },
    equipmentSlotInstanceIds: {right_hand_weapon: "equip_000002"},
    equipmentSlotsVersion: 5,
  };
  const before = structuredClone(profile);

  const result = requireEquippedEquipmentInstance(profile, catalog, "right_hand_weapon");

  assert.equal(result.ok, false);
  assert.equal(result.code, "equipment_slot_instance_conflict");
  assert.deepEqual(profile, before);
});

test("a backpack instance still referenced by any slot cannot be equipped or consumed", () => {
  const profile = {
    backpackSlots: slots({itemId: "weapon_club", count: 1}),
    equipmentSlots: {},
    equipmentInstances: {
      equip_000001: instance("equip_000001", "weapon_club"),
    },
    equipmentSlotInstanceIds: {exp_pill: "equip_000001"},
    equipmentSlotsVersion: 5,
  };
  const before = structuredClone(profile);

  const equipped = moveBackpackEquipmentInstanceToSlot(profile, catalog, "weapon_club", "right_hand_weapon");
  assert.equal(equipped.ok, false);
  assert.equal(equipped.code, "equipment_instance_mapping_conflict");
  assert.deepEqual(profile, before);

  const consumed = consumeBackpackEquipmentInstances(profile, catalog, "weapon_club", 1);
  assert.equal(consumed.ok, false);
  assert.equal(consumed.code, "equipment_instance_mapping_conflict");
  assert.deepEqual(profile, before);
});

test("orphan equipped instances block both empty-slot equip and mapped-slot mutation", () => {
  const emptySlot = {
    backpackSlots: slots({itemId: "weapon_club", count: 1}),
    equipmentSlots: {},
    equipmentInstances: {
      equip_backpack: instance("equip_backpack", "weapon_club"),
      equip_orphan: instance("equip_orphan", "weapon_axe", {location: "equipped", slotId: "right_hand_weapon"}),
    },
    equipmentSlotInstanceIds: {},
    equipmentSlotsVersion: 5,
  };
  const emptyBefore = structuredClone(emptySlot);
  const equipResult = moveBackpackEquipmentInstanceToSlot(emptySlot, catalog, "weapon_club", "right_hand_weapon");
  assert.equal(equipResult.ok, false);
  assert.equal(equipResult.code, "equipment_slot_instance_conflict");
  assert.deepEqual(emptySlot, emptyBefore);

  const mapped = {
    backpackSlots: slots(),
    equipmentSlots: {right_hand_weapon: "weapon_club"},
    equipmentInstances: {
      equip_mapped: instance("equip_mapped", "weapon_club", {location: "equipped", slotId: "right_hand_weapon"}),
      equip_orphan: instance("equip_orphan", "weapon_axe", {location: "equipped", slotId: "right_hand_weapon"}),
    },
    equipmentSlotInstanceIds: {right_hand_weapon: "equip_mapped"},
    equipmentSlotsVersion: 5,
  };
  const required = requireEquippedEquipmentInstance(mapped, catalog, "right_hand_weapon");
  assert.equal(required.ok, false);
  assert.equal(required.code, "equipment_slot_instance_conflict");
});

test("nested equipment state cannot claim a different item identity", () => {
  const profile = {
    backpackSlots: slots({itemId: "weapon_club", count: 1}),
    equipmentInstances: {
      equip_000001: instance("equip_000001", "weapon_club", {
        enhancement: {itemId: "weapon_axe", level: 2, history: []},
      }),
    },
    equipmentSlotInstanceIds: {},
    equipmentSlotsVersion: 5,
  };
  const before = structuredClone(profile);
  const result = consumeBackpackEquipmentInstances(profile, catalog, "weapon_club", 1);
  assert.equal(result.ok, false);
  assert.equal(result.code, "equipment_instance_item_conflict");
  assert.deepEqual(profile, before);
});

test("opaque nested instance state fails closed instead of being normalized away", () => {
  for (const field of ["enhancement", "wearCounters", "expPillCharge"]) {
    const profile = {
      backpackSlots: slots({itemId: "weapon_club", count: 1}),
      equipmentInstances: {
        equip_000001: instance("equip_000001", "weapon_club", {[field]: "future-opaque-value"}),
      },
      nextEquipmentInstanceSerial: 2,
      equipmentSlotsVersion: 5,
      equipmentSlots: {},
      equipmentSlotInstanceIds: {},
    };
    const before = structuredClone(profile);

    const state = readEquipmentInstanceState(profile, catalog);

    assert.equal(state.ok, false);
    assert.equal(state.code, "equipment_instance_field_invalid");
    assert.equal(state.field, field);
    assert.deepEqual(profile, before);
  }
});

test("malformed known instance values fail closed without lossy coercion", () => {
  for (const [field, patch] of [
    ["durability", {durability: "opaque-durability"}],
    ["enhancement", {enhancement: {itemId: "weapon_club", level: "opaque-level", history: []}}],
    ["enhancement", {enhancement: {itemId: "weapon_club", level: 0, history: "opaque-history"}}],
    ["wearCounters", {wearCounters: {itemId: "weapon_club", attackCount: "opaque-count", hitCount: 0}}],
    ["expPillCharge", {expPillCharge: {itemId: "weapon_club", level: 1, exp: -1, nextExp: 10}}],
  ]) {
    const profile = {
      backpackSlots: slots({itemId: "weapon_club", count: 1}),
      equipmentInstances: {
        equip_000001: instance("equip_000001", "weapon_club", patch),
      },
      nextEquipmentInstanceSerial: 2,
      equipmentSlotsVersion: 5,
      equipmentSlots: {},
      equipmentSlotInstanceIds: {},
    };
    const before = structuredClone(profile);

    const state = readEquipmentInstanceState(profile, catalog);

    assert.equal(state.ok, false);
    assert.equal(state.code, "equipment_instance_field_invalid");
    assert.equal(state.field, field);
    assert.deepEqual(profile, before);
  }
});

test("non-object equipment containers and future slot schemas fail closed", () => {
  for (const [field, value, code] of [
    ["equipmentSlots", [], "equipment_profile_container_invalid"],
    ["equipmentSlotInstanceIds", [], "equipment_profile_container_invalid"],
    ["equipmentDurability", "future", "equipment_profile_container_invalid"],
    ["equipmentEnhancement", null, "equipment_profile_container_invalid"],
    ["equipmentWearCounters", 7, "equipment_profile_container_invalid"],
    ["equipmentExpPillCharge", [], "equipment_profile_container_invalid"],
    ["equipmentSlotsVersion", 6, "equipment_slots_schema_future"],
  ]) {
    const profile = {
      backpackSlots: slots(),
      equipmentInstances: {},
      nextEquipmentInstanceSerial: 1,
      equipmentSlotsVersion: 5,
      equipmentSlots: {},
      equipmentSlotInstanceIds: {},
      [field]: value,
    };
    const before = structuredClone(profile);

    const state = readEquipmentInstanceState(profile, catalog);

    assert.equal(state.ok, false);
    assert.equal(state.code, code);
    assert.deepEqual(profile, before);
  }
});

test("unknown keys in slot-indexed equipment containers fail closed", () => {
  for (const field of [
    "equipmentSlots",
    "equipmentSlotInstanceIds",
    "equipmentDurability",
    "equipmentEnhancement",
    "equipmentWearCounters",
  ]) {
    const profile = {
      backpackSlots: slots(),
      equipmentInstances: {},
      nextEquipmentInstanceSerial: 1,
      equipmentSlotsVersion: 5,
      equipmentSlots: {},
      equipmentSlotInstanceIds: {},
      [field]: {future_relic_slot: {futureValue: 99}},
    };
    const before = structuredClone(profile);

    const state = readEquipmentInstanceState(profile, catalog);

    assert.equal(state.ok, false);
    assert.equal(state.code, "equipment_profile_slot_unknown");
    assert.equal(state.field, field);
    assert.equal(state.slotId, "future_relic_slot");
    assert.deepEqual(profile, before);
  }
});

test("malformed compatibility fields and unknown known-slot items fail closed", () => {
  for (const [field, patch] of [
    ["equipmentSlots", {equipmentSlots: {right_hand_weapon: "future_weapon_999"}}],
    ["equipmentSlotInstanceIds", {equipmentSlotInstanceIds: {right_hand_weapon: 7}}],
    ["equipmentDurability", {
      equipmentSlots: {right_hand_weapon: "weapon_club"},
      equipmentDurability: {right_hand_weapon: "opaque-durability"},
    }],
    ["equipmentEnhancement", {
      equipmentSlots: {right_hand_weapon: "weapon_club"},
      equipmentEnhancement: {right_hand_weapon: {itemId: "weapon_club", level: "opaque-level", history: []}},
    }],
    ["equipmentEnhancement", {
      equipmentSlots: {right_hand_weapon: "weapon_club"},
      equipmentEnhancement: {right_hand_weapon: {itemId: "weapon_club", level: 0, history: ["opaque-step"]}},
    }],
    ["equipmentWearCounters", {
      equipmentSlots: {right_hand_weapon: "weapon_club"},
      equipmentWearCounters: {right_hand_weapon: {itemId: "weapon_club", attackCount: "opaque-count", hitCount: 0}},
    }],
    ["equipmentExpPillCharge", {
      equipmentSlots: {exp_pill: "exp_pill_131"},
      equipmentExpPillCharge: {itemId: "exp_pill_131", level: "opaque-level", exp: 0, nextExp: 1},
    }],
  ]) {
    const profile = {
      backpackSlots: slots(),
      equipmentInstances: {},
      nextEquipmentInstanceSerial: 1,
      equipmentSlotsVersion: 5,
      equipmentSlots: {},
      equipmentSlotInstanceIds: {},
      ...patch,
    };
    const before = structuredClone(profile);

    const state = readEquipmentInstanceState(profile, catalog);

    assert.equal(state.ok, false);
    assert.equal(state.code, "equipment_profile_field_invalid");
    assert.equal(state.field, field);
    assert.deepEqual(profile, before);
  }
});

test("audit proves canonical counts and reports version or mapping drift", () => {
  const profile = {
    backpackSlots: slots({itemId: "weapon_club", count: 1}, {itemId: "exp_pill_131", count: 2}),
    equipmentSlots: {right_hand_weapon: "weapon_axe"},
    equipmentInstances: {
      equip_000001: instance("equip_000001", "weapon_club"),
      equip_000002: instance("equip_000002", "exp_pill_131"),
      equip_000003: instance("equip_000003", "exp_pill_131"),
      equip_000004: instance("equip_000004", "weapon_axe", {location: "equipped", slotId: "right_hand_weapon"}),
    },
    equipmentSlotInstanceIds: {right_hand_weapon: "equip_000004"},
    equipmentSlotsVersion: 5,
  };
  assert.equal(auditEquipmentProfileState(profile, catalog).ok, true);

  profile.equipmentSlotsVersion = 3;
  profile.equipmentSlotInstanceIds.right_hand_weapon = "equip_000001";
  const drift = auditEquipmentProfileState(profile, catalog);
  assert.equal(drift.ok, false);
  assert.ok(drift.conflicts.some((entry) => entry.code === "slot_instance_mismatch"));
  assert.ok(drift.conflicts.some((entry) => entry.code === "orphan_equipped_instance"));
  assert.ok(drift.conflicts.some((entry) => entry.code === "equipment_slots_version_mismatch"));
});
