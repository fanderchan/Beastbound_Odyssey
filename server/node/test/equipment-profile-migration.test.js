"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const equipmentTransferVectors = require("../../../tools/fixtures/equipment_transfer_public_v1_vectors.json");
const {loadBattleEquipmentCatalog} = require("../src/auth/battle-equipment-rules");
const {
  EQUIPMENT_SLOTS_VERSION,
  MAX_EQUIPMENT_INSTANCE_SERIAL,
  auditEquipmentProfileState,
  createFreshEquipmentInstance,
} = require("../src/auth/equipment-profile-state");
const {equipmentTransferStateFingerprint} = require("../src/auth/equipment-transfer-envelope");
const {
  EQUIPMENT_PROFILE_MIGRATION_SOURCE,
  auditEquipmentProfileV3,
  migrateEquipmentProfileV2ToV3,
  snapshotExternalEquipmentConflicts,
} = require("../src/auth/equipment-profile-migration");
const {loadPlayerLevelRuntime} = require("../src/auth/player-level-runtime");

const catalog = loadBattleEquipmentCatalog();
const levelRuntime = loadPlayerLevelRuntime();

function profileV2(overrides = {}) {
  return {
    schemaVersion: 2,
    backpackSlots: [],
    equipmentSlots: {},
    equipmentInstances: {},
    equipmentSlotInstanceIds: {},
    nextEquipmentInstanceSerial: 1,
    equipmentDurability: {},
    equipmentEnhancement: {},
    equipmentWearCounters: {},
    equipmentExpPillCharge: {},
    equipmentSlotsVersion: 4,
    ...structuredClone(overrides),
  };
}

function freshInstance(itemId, instanceId, location = "backpack", slotId = "") {
  const instance = createFreshEquipmentInstance(
    catalog.itemById.get(itemId),
    itemId,
    instanceId,
    "test_fixture",
    {expToNextLevel: levelRuntime.expToNextLevel},
  );
  instance.location = location;
  instance.slotId = slotId;
  return instance;
}

function bankV2WithEquipment(envelopesValue) {
  const envelopes = structuredClone(envelopesValue);
  const slots = Array.from({length: 90}, () => ({}));
  for (const [index, envelope] of envelopes.entries()) {
    slots[index] = {
      itemId: envelope.itemId,
      count: 1,
      equipmentEnvelopes: [envelope],
    };
  }
  return {
    stoneCoins: 123,
    items: envelopes.length > 0
      ? [{itemId: envelopes[0].itemId, count: envelopes.length}]
      : [],
    slots,
    unlockedTabs: 1,
    schemaVersion: 2,
  };
}

test("v2 equipment migration deterministically creates equipped and backpack deficits", () => {
  const nextExp = levelRuntime.expToNextLevel(132);
  const source = profileV2({
    backpackSlots: [
      {itemId: "weapon_wooden_club", count: 1},
      {itemId: "weapon_wooden_club", count: 1},
    ],
    equipmentSlots: {
      right_hand_weapon: "weapon_stone_dagger",
      exp_pill: "item_exp_pill_lv131",
    },
    equipmentDurability: {right_hand_weapon: 17},
    equipmentEnhancement: {
      right_hand_weapon: {itemId: "weapon_stone_dagger", level: 2, history: [{roll: 41}]},
    },
    equipmentWearCounters: {
      right_hand_weapon: {itemId: "weapon_stone_dagger", attackCount: 99, hitCount: 0},
    },
    equipmentExpPillCharge: {
      itemId: "item_exp_pill_lv131",
      level: 132,
      exp: 50,
      nextExp,
    },
  });
  const before = structuredClone(source);
  const first = migrateEquipmentProfileV2ToV3(source);
  const second = migrateEquipmentProfileV2ToV3(structuredClone(source));

  assert.equal(first.ok, true);
  assert.deepEqual(first, second);
  assert.deepEqual(source, before);
  assert.equal(first.profile.equipmentSlotsVersion, EQUIPMENT_SLOTS_VERSION);
  assert.equal(first.profile.nextEquipmentInstanceSerial, 5);
  assert.deepEqual(first.report.createdEquipped, [
    {slotId: "right_hand_weapon", itemId: "weapon_stone_dagger", instanceId: "equip_000001"},
    {slotId: "exp_pill", itemId: "item_exp_pill_lv131", instanceId: "equip_000002"},
  ]);
  assert.deepEqual(first.report.createdBackpack, [{
    itemId: "weapon_wooden_club",
    count: 2,
    instanceIds: ["equip_000003", "equip_000004"],
  }]);
  assert.equal(first.profile.equipmentInstances.equip_000001.durability, 17);
  assert.deepEqual(first.profile.equipmentInstances.equip_000001.enhancement, {
    itemId: "weapon_stone_dagger",
    level: 2,
    history: [{roll: 41}],
  });
  assert.deepEqual(first.profile.equipmentInstances.equip_000001.wearCounters, {
    itemId: "weapon_stone_dagger",
    attackCount: 99,
    hitCount: 0,
  });
  assert.deepEqual(first.profile.equipmentInstances.equip_000002.expPillCharge, {
    itemId: "item_exp_pill_lv131",
    level: 132,
    exp: 50,
    nextExp,
  });
  assert.equal(first.profile.equipmentInstances.equip_000003.source, EQUIPMENT_PROFILE_MIGRATION_SOURCE);
  assert.equal(auditEquipmentProfileState(first.profile, catalog).ok, true);
});

test("partial migration preserves every existing instance byte-for-byte and repairs one unique mapping", () => {
  const backpack = freshInstance("weapon_wooden_club", "legacy_named");
  backpack.quality = {tier: "future_keep", rolls: [3, 1, 4]};
  const equipped = freshInstance(
    "weapon_stone_dagger",
    "equip_000007",
    "equipped",
    "right_hand_weapon",
  );
  equipped.durability = 12;
  equipped.enhancement.level = 1;
  equipped.wearCounters.attackCount = 8;
  const source = profileV2({
    backpackSlots: [
      {itemId: "weapon_wooden_club", count: 1},
      {itemId: "weapon_wooden_club", count: 1},
    ],
    equipmentSlots: {right_hand_weapon: "weapon_stone_dagger"},
    equipmentInstances: {legacy_named: backpack, equip_000007: equipped},
    equipmentSlotInstanceIds: {},
    nextEquipmentInstanceSerial: 2,
    equipmentDurability: {right_hand_weapon: 12},
    equipmentEnhancement: {
      right_hand_weapon: {itemId: "weapon_stone_dagger", level: 1, history: []},
    },
    equipmentWearCounters: {
      right_hand_weapon: {itemId: "weapon_stone_dagger", attackCount: 8, hitCount: 0},
    },
  });
  const result = migrateEquipmentProfileV2ToV3(source);

  assert.equal(result.ok, true);
  assert.deepEqual(result.profile.equipmentInstances.legacy_named, backpack);
  assert.deepEqual(result.profile.equipmentInstances.equip_000007, equipped);
  assert.equal(result.profile.equipmentSlotInstanceIds.right_hand_weapon, "equip_000007");
  assert.equal(result.profile.equipmentInstances.equip_000008.itemId, "weapon_wooden_club");
  assert.equal(result.profile.nextEquipmentInstanceSerial, 9);
  assert.deepEqual(result.report.createdMappings, [{
    slotId: "right_hand_weapon",
    itemId: "weapon_stone_dagger",
    instanceId: "equip_000007",
    reason: "unique_equipped_instance",
  }]);
  assert.equal(result.report.existingInstancesPreserved, true);
  assert.equal(result.report.existingMappingsPreserved, true);
});

test("surplus, mapping mismatch, duplicate mapping, compatibility conflict, and future schema fail closed", () => {
  const cases = [];
  const surplus = profileV2({
    equipmentSlotsVersion: 5,
    equipmentInstances: {equip_000001: freshInstance("weapon_wooden_club", "equip_000001")},
    nextEquipmentInstanceSerial: 2,
  });
  cases.push([surplus, "equipment_backpack_instance_surplus"]);

  const wrongMapping = profileV2({
    equipmentSlotsVersion: 5,
    equipmentSlots: {right_hand_weapon: "weapon_stone_dagger"},
    equipmentInstances: {equip_000001: freshInstance("weapon_wooden_club", "equip_000001")},
    equipmentSlotInstanceIds: {right_hand_weapon: "equip_000001"},
    nextEquipmentInstanceSerial: 2,
  });
  cases.push([wrongMapping, "equipment_slot_instance_mismatch"]);

  const leftAccessory = freshInstance(
    "accessory_firebud_charm",
    "equip_000001",
    "equipped",
    "accessory_left",
  );
  const duplicateMapping = profileV2({
    equipmentSlotsVersion: 5,
    equipmentSlots: {
      accessory_left: "accessory_firebud_charm",
      accessory_right: "accessory_wind_ring",
    },
    equipmentInstances: {equip_000001: leftAccessory},
    equipmentSlotInstanceIds: {
      accessory_left: "equip_000001",
      accessory_right: "equip_000001",
    },
    nextEquipmentInstanceSerial: 2,
  });
  cases.push([duplicateMapping, "equipment_duplicate_slot_mapping"]);

  const conflicting = freshInstance(
    "weapon_stone_dagger",
    "equip_000001",
    "equipped",
    "right_hand_weapon",
  );
  conflicting.durability = 10;
  const compatibilityConflict = profileV2({
    equipmentSlotsVersion: 5,
    equipmentSlots: {right_hand_weapon: "weapon_stone_dagger"},
    equipmentInstances: {equip_000001: conflicting},
    equipmentSlotInstanceIds: {right_hand_weapon: "equip_000001"},
    nextEquipmentInstanceSerial: 2,
    equipmentDurability: {right_hand_weapon: 11},
  });
  cases.push([compatibilityConflict, "equipment_compatibility_instance_conflict"]);

  const missingCompatibilityInstance = freshInstance(
    "weapon_stone_dagger",
    "equip_000001",
    "equipped",
    "right_hand_weapon",
  );
  missingCompatibilityInstance.durability = 17;
  missingCompatibilityInstance.enhancement.level = 2;
  missingCompatibilityInstance.wearCounters.attackCount = 8;
  const missingCompatibility = profileV2({
    equipmentSlotsVersion: 5,
    equipmentSlots: {right_hand_weapon: "weapon_stone_dagger"},
    equipmentInstances: {equip_000001: missingCompatibilityInstance},
    equipmentSlotInstanceIds: {right_hand_weapon: "equip_000001"},
    nextEquipmentInstanceSerial: 2,
  });
  cases.push([missingCompatibility, "equipment_compatibility_instance_conflict"]);

  const futureInstance = freshInstance("weapon_wooden_club", "equip_000001");
  futureInstance.schemaVersion = 2;
  const future = profileV2({
    equipmentSlotsVersion: 5,
    backpackSlots: [{itemId: "weapon_wooden_club", count: 1}],
    equipmentInstances: {equip_000001: futureInstance},
    nextEquipmentInstanceSerial: 2,
  });
  cases.push([future, "equipment_instance_schema_future"]);

  for (const [source, expectedCode] of cases) {
    const before = structuredClone(source);
    const result = migrateEquipmentProfileV2ToV3(source);
    assert.equal(result.ok, false, expectedCode);
    assert.equal(result.changed, false, expectedCode);
    assert.deepEqual(result.profile, before, expectedCode);
    assert.deepEqual(source, before, expectedCode);
    assert.equal(result.conflicts.some((entry) => entry.code === expectedCode), true, expectedCode);
  }
});

test("serial exhaustion with a real deficit fails atomically", () => {
  const source = profileV2({
    backpackSlots: [{itemId: "weapon_wooden_club", count: 1}],
    nextEquipmentInstanceSerial: MAX_EQUIPMENT_INSTANCE_SERIAL + 1,
    equipmentSlotsVersion: 5,
  });
  const before = structuredClone(source);
  const result = migrateEquipmentProfileV2ToV3(source);
  assert.equal(result.ok, false);
  assert.equal(result.changed, false);
  assert.equal(result.conflicts.some((entry) => entry.code === "equipment_instance_serial_exhausted"), true);
  assert.deepEqual(result.profile, before);
  assert.deepEqual(source, before);
});

test("legacy same-item backpack ownership and equipment in external containers are reported instead of guessed", () => {
  const legacy = profileV2({
    equipmentSlotsVersion: 2,
    backpackSlots: [{itemId: "weapon_wooden_club", count: 1}],
    equipmentSlots: {right_hand_weapon: "weapon_wooden_club"},
  });
  const ambiguous = migrateEquipmentProfileV2ToV3(legacy);
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.conflicts.some((entry) => entry.code === "equipment_legacy_backpack_ownership_ambiguous"), true);

  for (const source of [
    profileV2({bank: {slots: [{itemId: "weapon_wooden_club", count: 1}], items: []}}),
    profileV2({mailboxMessages: [{mailId: "mail_old", items: [{itemId: "weapon_wooden_club", count: 1}]}]}),
  ]) {
    const result = migrateEquipmentProfileV2ToV3(source);
    assert.equal(result.ok, false);
    assert.equal(result.conflicts.some((entry) => entry.code === "equipment_external_container_blocked"), true);
  }

  const legacyBankAmounts = profileV2({
    bank: {
      itemAmounts: [{itemId: "item_meat_small", count: 1}],
      unlockedTabs: 1,
      schemaVersion: 1,
    },
  });
  const ordinaryBank = migrateEquipmentProfileV2ToV3(legacyBankAmounts);
  assert.equal(ordinaryBank.ok, true);
  assert.deepEqual(ordinaryBank.profile.bank, legacyBankAmounts.bank);
});

test("schema-v2 bank equipment envelopes survive migration while malformed, duplicate, and future banks fail closed", () => {
  const envelope = equipmentTransferVectors.vectors[0].internalEnvelope;
  const bank = bankV2WithEquipment([envelope]);
  const source = profileV2({bank});
  const migrated = migrateEquipmentProfileV2ToV3(source);

  assert.equal(migrated.ok, true);
  assert.deepEqual(migrated.profile.bank, bank);
  assert.equal(auditEquipmentProfileV3(migrated.profile).ok, true);

  const malformedEnvelope = structuredClone(envelope);
  malformedEnvelope.stateFingerprint = "0".repeat(64);
  const cases = [
    [profileV2({bank: bankV2WithEquipment([envelope, envelope])}), "equipment_transfer_envelope_duplicate"],
    [profileV2({bank: bankV2WithEquipment([malformedEnvelope])}), "equipment_transfer_fingerprint_mismatch"],
    [profileV2({bank: {...bank, schemaVersion: 3}}), "bank_schema_future"],
  ];
  for (const [invalidSource, expectedCode] of cases) {
    const before = structuredClone(invalidSource);
    const result = migrateEquipmentProfileV2ToV3(invalidSource);
    assert.equal(result.ok, false, expectedCode);
    assert.equal(result.changed, false, expectedCode);
    assert.deepEqual(result.profile, before, expectedCode);
    assert.equal(result.conflicts.some((entry) => entry.code === expectedCode), true, expectedCode);
  }
});

test("migration rejects non-canonical instance identity, locked backpack overflow, and invalid exp-pill progress", () => {
  const spaced = freshInstance("weapon_wooden_club", "equip_000001");
  spaced.itemId = " weapon_wooden_club ";
  const nonCanonical = profileV2({
    equipmentSlotsVersion: 5,
    backpackSlots: [{itemId: "weapon_wooden_club", count: 1}],
    equipmentInstances: {equip_000001: spaced},
    nextEquipmentInstanceSerial: 2,
  });
  const nonCanonicalResult = migrateEquipmentProfileV2ToV3(nonCanonical);
  assert.equal(nonCanonicalResult.ok, false);
  assert.equal(nonCanonicalResult.conflicts.some((entry) => entry.code === "equipment_instance_state_noncanonical"), true);

  const overThreshold = freshInstance(
    "weapon_wooden_club",
    "equip_000001",
    "equipped",
    "right_hand_weapon",
  );
  overThreshold.wearCounters.attackCount = 100;
  const invalidWear = profileV2({
    equipmentSlotsVersion: 5,
    equipmentSlots: {right_hand_weapon: "weapon_wooden_club"},
    equipmentInstances: {equip_000001: overThreshold},
    equipmentSlotInstanceIds: {right_hand_weapon: "equip_000001"},
    nextEquipmentInstanceSerial: 2,
    equipmentWearCounters: {
      right_hand_weapon: {itemId: "weapon_wooden_club", attackCount: 100, hitCount: 0},
    },
  });
  const invalidWearResult = migrateEquipmentProfileV2ToV3(invalidWear);
  assert.equal(invalidWearResult.ok, false);
  assert.equal(invalidWearResult.conflicts.some((entry) => entry.code === "equipment_wear_state_noncanonical"), true);

  const overflow = profileV2({
    backpackExtraSlots: 0,
    backpackSlots: Array.from({length: 16}, () => ({itemId: "", count: 0})),
  });
  const overflowResult = migrateEquipmentProfileV2ToV3(overflow);
  assert.equal(overflowResult.ok, false);
  assert.equal(overflowResult.conflicts.some((entry) => (
    entry.code === "equipment_migration_backpack_invalid" && entry.slotCount === 16 && entry.slotLimit === 15
  )), true);

  const missingBackpackWithFreeCapacity = profileV2({backpackExtraSlots: 999});
  delete missingBackpackWithFreeCapacity.backpackSlots;
  const freeCapacityResult = migrateEquipmentProfileV2ToV3(missingBackpackWithFreeCapacity);
  assert.equal(freeCapacityResult.ok, false);
  assert.equal(freeCapacityResult.conflicts.some((entry) => (
    entry.code === "equipment_migration_backpack_invalid" && entry.path === "backpackExtraSlots"
  )), true);

  for (const charge of [
    {itemId: "item_exp_pill_lv131", level: 1, exp: 0, nextExp: levelRuntime.expToNextLevel(1)},
    {itemId: "item_exp_pill_lv131", level: 999, exp: 0, nextExp: 1},
    {itemId: "item_exp_pill_lv131", level: 132, exp: levelRuntime.expToNextLevel(132), nextExp: levelRuntime.expToNextLevel(132)},
  ]) {
    const invalidCharge = profileV2({
      equipmentSlots: {exp_pill: "item_exp_pill_lv131"},
      equipmentExpPillCharge: charge,
    });
    const result = migrateEquipmentProfileV2ToV3(invalidCharge);
    assert.equal(result.ok, false);
    assert.equal(result.conflicts.some((entry) => (
      entry.code === "equipment_migration_final_equipment_exp_pill_state_noncanonical"
    )), true);
    assert.deepEqual(result.profile, invalidCharge);
  }
});

test("valid v3 is audited as an idempotent clone while corrupt v3 is rejected", () => {
  const migrated = migrateEquipmentProfileV2ToV3(profileV2({
    backpackSlots: [{itemId: "weapon_wooden_club", count: 1}],
  }));
  assert.equal(migrated.ok, true);
  const current = {...migrated.profile, schemaVersion: 3};
  const valid = auditEquipmentProfileV3(current);
  assert.equal(valid.ok, true);
  assert.equal(valid.changed, false);
  assert.deepEqual(valid.profile, current);
  assert.notStrictEqual(valid.profile, current);

  const corrupt = structuredClone(current);
  corrupt.backpackSlots = [];
  const rejected = auditEquipmentProfileV3(corrupt);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.conflicts.some((entry) => entry.code === "equipment_v3_backpack_count_mismatch"), true);
  assert.deepEqual(rejected.profile, corrupt);

  for (const mutate of [
    (profile) => { profile.equipmentSlotsVersion = "5"; },
    (profile) => { profile.nextEquipmentInstanceSerial = String(profile.nextEquipmentInstanceSerial); },
  ]) {
    const nonCanonicalV3 = structuredClone(current);
    mutate(nonCanonicalV3);
    const strict = auditEquipmentProfileV3(nonCanonicalV3);
    assert.equal(strict.ok, false);
    assert.deepEqual(strict.profile, nonCanonicalV3);
  }
});

test("snapshot external equipment scanner reports mail, market, and trade paths deterministically", () => {
  const snapshot = {
    mailMessages: {
      mail_1: {
        mailId: "mail_1",
        recipientAccountId: "account_recipient",
        items: [{itemId: "weapon_wooden_club", count: 1}],
      },
    },
    marketListings: {
      listing_1: {
        listingId: "listing_1",
        sellerAccountId: "account_seller",
        itemId: "weapon_stone_dagger",
        count: 1,
        unitPrice: 99,
        currency: "stoneCoins",
        createdAt: "2026-07-12T00:00:00.000Z",
        schemaVersion: 1,
      },
    },
    tradeOffers: {
      trade_1: {offerItems: [{itemId: "boots_grass", count: 1}]},
    },
  };
  const conflicts = snapshotExternalEquipmentConflicts(snapshot);
  assert.deepEqual(conflicts.map((entry) => entry.path), [
    "mailMessages.mail_1",
    "marketListings.listing_1",
    "tradeOffers.trade_1.offerItems[0]",
  ]);
  assert.deepEqual(conflicts.map((entry) => entry.code), [
    "mail_equipment_transfer_unsupported",
    "market_equipment_transfer_unsupported",
    "equipment_external_container_blocked",
  ]);
});

test("future mail and market schemas plus unsupported listing fields fail closed", () => {
  const futureConflicts = snapshotExternalEquipmentConflicts({
    mailMessages: {
      mail_future: {
        mailId: "mail_future",
        recipientAccountId: "account_recipient",
        schemaVersion: 3,
        items: [],
      },
    },
    marketListings: {
      listing_future: {
        listingId: "listing_future",
        sellerAccountId: "account_seller",
        itemId: "item_meat_small",
        count: 1,
        unitPrice: 9,
        currency: "stoneCoins",
        createdAt: "2026-07-12T00:00:00.000Z",
        schemaVersion: 3,
      },
    },
    tradeOffers: {},
  });
  assert.equal(futureConflicts.some((entry) => entry.code === "mail_schema_future"), true);
  assert.equal(futureConflicts.some((entry) => entry.code === "market_listing_schema_future"), true);

  const unsupportedConflicts = snapshotExternalEquipmentConflicts({
    marketListings: {
      listing_unknown: {
        listingId: "listing_unknown",
        sellerAccountId: "account_seller",
        itemId: "item_meat_small",
        count: 1,
        unitPrice: 9,
        currency: "stoneCoins",
        createdAt: "2026-07-12T00:00:00.000Z",
        schemaVersion: 1,
        equipmentEnvelope: {instanceId: "future_instance"},
      },
    },
    tradeOffers: {},
  });
  assert.equal(unsupportedConflicts.some((entry) => entry.code === "market_listing_schema_unsupported"), true);
});

test("snapshot scanner accepts complete mail and market equipment escrows but rejects cross-container replay", () => {
  const mailEnvelope = structuredClone(equipmentTransferVectors.vectors[0].internalEnvelope);
  mailEnvelope.envelopeId = "eqx_snapshot_mail_0001";
  mailEnvelope.provenance.sourceInstanceId = "equip_snapshot_mail_0001";
  mailEnvelope.instanceState.transferProvenance.originEnvelopeId = "eqx_snapshot_mail_prior_0001";
  mailEnvelope.stateFingerprint = equipmentTransferStateFingerprint(mailEnvelope.instanceState);
  const marketEnvelope = structuredClone(equipmentTransferVectors.vectors[0].internalEnvelope);
  marketEnvelope.envelopeId = "eqx_snapshot_market_0001";
  marketEnvelope.provenance.sourceInstanceId = "equip_snapshot_market_0001";
  marketEnvelope.instanceState.transferProvenance.originEnvelopeId = "eqx_snapshot_market_prior_0001";
  marketEnvelope.stateFingerprint = equipmentTransferStateFingerprint(marketEnvelope.instanceState);
  const snapshot = {
    mailMessages: {
      mail_equipment: {
        mailId: "mail_equipment",
        recipientAccountId: "account_recipient",
        items: [{itemId: "weapon_wooden_club", count: 1}],
        equipmentEnvelopes: [mailEnvelope],
        currency: {},
        schemaVersion: 2,
      },
    },
    marketListings: {
      listing_equipment: {
        listingId: "listing_equipment",
        sellerAccountId: "account_seller",
        itemId: "weapon_wooden_club",
        count: 1,
        unitPrice: 199,
        currency: "stoneCoins",
        createdAt: "2026-07-12T00:00:00.000Z",
        equipmentEnvelope: marketEnvelope,
        schemaVersion: 2,
      },
    },
    tradeOffers: {},
  };
  assert.deepEqual(snapshotExternalEquipmentConflicts(snapshot), []);

  const replayed = structuredClone(snapshot);
  replayed.marketListings.listing_equipment.equipmentEnvelope = structuredClone(mailEnvelope);
  const conflicts = snapshotExternalEquipmentConflicts(replayed);
  assert.equal(conflicts.some((entry) => (
    entry.code === "equipment_external_envelope_duplicate"
    && entry.envelopeId === mailEnvelope.envelopeId
  )), true);

  const materializedReplay = structuredClone(snapshot);
  materializedReplay.profiles = {
    player_replay: {
      playerId: "player_replay",
      profile: {
        equipmentInstances: {
          equip_replay: {
            transferProvenance: {originEnvelopeId: mailEnvelope.envelopeId},
          },
        },
      },
    },
  };
  const materializedConflicts = snapshotExternalEquipmentConflicts(materializedReplay);
  assert.equal(materializedConflicts.some((entry) => (
    entry.code === "equipment_external_envelope_duplicate"
    && entry.envelopeId === mailEnvelope.envelopeId
    && entry.path.includes("equipmentInstances.equip_replay")
  )), true);
});

test("snapshot scanner rejects mismatched mail keys, missing recipients, and absent recipient accounts", () => {
  const conflicts = snapshotExternalEquipmentConflicts({
    accounts: {
      known: {accountId: "account_known"},
    },
    mailMessages: {
      mail_missing_recipient: {
        mailId: "mail_missing_recipient",
        items: [{itemId: "item_meat_small", count: 1}],
      },
      mail_wrong_key: {
        mailId: "mail_inner_id",
        recipientAccountId: "account_known",
        items: [{itemId: "item_meat_small", count: 1}],
      },
      mail_unknown_recipient: {
        mailId: "mail_unknown_recipient",
        recipientAccountId: "account_absent",
        items: [{itemId: "item_meat_small", count: 1}],
      },
    },
  });
  assert.equal(conflicts.some((entry) => (
    entry.code === "mail_identity_conflict" && entry.reason === "recipient_missing"
  )), true);
  assert.equal(conflicts.some((entry) => (
    entry.code === "mail_identity_conflict" && entry.reason === "mail_id_mismatch"
  )), true);
  assert.equal(conflicts.some((entry) => entry.code === "mail_recipient_missing"), true);
});
