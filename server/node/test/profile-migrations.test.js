"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CURRENT_PROFILE_SCHEMA_VERSION,
  PROFILE_MIGRATION_V1_TO_V2,
  migrateProfile,
  migrateProfilesSnapshot,
  profileAssetSummary,
  stableDigest,
} = require("../src/auth/profile-migrations");

function legacyProfile(schemaVersion = undefined) {
  const profile = {
    player: {name: "迁移猎人", level: 20, hp: 140, maxHp: 140},
    stoneCoins: 123456,
    diamonds: 789,
    bank: {
      stoneCoins: 654321,
      slots: [{itemId: "capture_net_basic", count: 3}],
      items: [{itemId: "legacy_bank_item", count: 2}],
      schemaVersion: 1,
    },
    backpackSlots: [
      {itemId: "capture_net_basic", count: 5},
      {itemId: "weapon_wooden_club", count: 1},
      {itemId: "", count: 0},
    ],
    captureTools: {capture_net_basic: 5},
    petInstances: [{
      instanceId: "pet_blue_001",
      formId: "blue_man_dragon_water10",
      state: "battle",
      level: 20,
      hp: 211,
      maxHp: 239,
      attack: 63,
      defense: 28,
      quick: 29,
      petGrowth: {
        modelVersion: "pet_growth_authority_v1",
        private: {privateSeed: `bps1_${"A".repeat(43)}`},
      },
    }],
    groundPetDrops: [{pet: {
      instanceId: "pet_ground_001",
      formId: "piggy_baby",
      state: "ground",
      level: 1,
      hp: 30,
      maxHp: 30,
      attack: 8,
      defense: 5,
      quick: 9,
    }}],
    trainingPartners: [{pet: {
      instanceId: "pet_partner_001",
      formId: "novice_tiger_mount",
      state: "standby",
      level: 10,
      hp: 100,
      maxHp: 100,
      attack: 20,
      defense: 15,
      quick: 30,
    }}],
    equipmentSlots: {right_hand_weapon: "weapon_wooden_club"},
    equipmentInstances: {
      equip_000001: {
        instanceId: "equip_000001",
        itemId: "weapon_wooden_club",
        location: "equipped",
        slotId: "right_hand_weapon",
        durability: 17,
        enhancement: {itemId: "weapon_wooden_club", level: 2},
      },
    },
    equipmentSlotInstanceIds: {right_hand_weapon: "equip_000001"},
    equipmentDurability: {right_hand_weapon: 17},
    equipmentEnhancement: {right_hand_weapon: {itemId: "weapon_wooden_club", level: 2}},
    equipmentWearCounters: {right_hand_weapon: {itemId: "weapon_wooden_club", attackCount: 99, hitCount: 0}},
    equipmentExpPillCharge: {},
  };
  if (schemaVersion !== undefined) {
    profile.schemaVersion = schemaVersion;
  }
  return profile;
}

function profileDocument(playerId, profile) {
  return {
    playerId,
    accountId: `acc_${playerId}`,
    profileRevision: 7,
    updatedAt: "2026-07-12T00:00:00.000Z",
    profile,
    schemaVersion: 1,
  };
}

test("missing and version-1 profiles migrate to version 2 without changing assets or source", () => {
  for (const source of [legacyProfile(), legacyProfile(1)]) {
    const before = structuredClone(source);
    const beforeAssets = profileAssetSummary(source);
    const result = migrateProfile(source);

    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    assert.equal(result.fromVersion, 1);
    assert.equal(result.toVersion, CURRENT_PROFILE_SCHEMA_VERSION);
    assert.equal(result.steps.length, 1);
    assert.equal(result.steps[0].id, PROFILE_MIGRATION_V1_TO_V2);
    assert.equal(result.profile.schemaVersion, 2);
    assert.equal(result.assetsUnchanged, true);
    assert.equal(result.contentUnchanged, true);
    assert.equal(result.beforeAssets.digest, result.afterAssets.digest);
    assert.equal(result.beforeAssets.digest, beforeAssets.digest);
    assert.deepEqual(source, before);
    assert.notStrictEqual(result.profile, source);
    assert.notStrictEqual(result.profile.petInstances, source.petInstances);
  }
});

test("version-2 migration is idempotent and always returns a deep clone", () => {
  const first = migrateProfile(legacyProfile(1));
  const second = migrateProfile(first.profile);

  assert.equal(second.ok, true);
  assert.equal(second.changed, false);
  assert.deepEqual(second.profile, first.profile);
  assert.equal(second.beforeDigest, second.afterDigest);
  assert.equal(second.assetsUnchanged, true);
  second.profile.player.name = "只改返回副本";
  assert.equal(first.profile.player.name, "迁移猎人");
});

test("future and malformed profile versions fail closed without rewriting the profile", () => {
  for (const profile of [legacyProfile(99), legacyProfile("1"), legacyProfile(0), []]) {
    const before = structuredClone(profile);
    const result = migrateProfile(profile);

    assert.equal(result.ok, false);
    assert.equal(result.changed, false);
    assert.deepEqual(result.profile, before);
    assert.equal(result.beforeDigest, result.afterDigest);
    assert.equal(result.errors.length > 0, true);
  }
  assert.equal(migrateProfile(legacyProfile(99)).errors[0].code, "profile_schema_too_new");
});

test("stable digests ignore object key order but retain array order and value types", () => {
  assert.equal(stableDigest({b: 2, a: 1}), stableDigest({a: 1, b: 2}));
  assert.notEqual(stableDigest([1, 2]), stableDigest([2, 1]));
  assert.notEqual(stableDigest({value: 1}), stableDigest({value: "1"}));
  assert.notEqual(
    stableDigest(JSON.parse('{"__proto__":{"hidden":"A"}}')),
    stableDigest(JSON.parse('{"__proto__":{"hidden":"B"}}')),
  );
});

test("asset summary covers currencies, backpack, pets, and equipment deterministically", () => {
  const summary = profileAssetSummary(legacyProfile(1));

  assert.equal(summary.validProfileRoot, true);
  assert.equal(summary.currencies.stoneCoins, 123456);
  assert.equal(summary.currencies.bankStoneCoins, 654321);
  assert.deepEqual(summary.backpack.itemCounts, {
    capture_net_basic: 5,
    weapon_wooden_club: 1,
  });
  assert.equal(summary.pets.referenceCount, 3);
  assert.equal(summary.pets.uniqueIdentityCount, 3);
  assert.equal(summary.equipment.equippedSlotCount, 1);
  assert.deepEqual(summary.equipment.equippedItemCounts, {weapon_wooden_club: 1});
  assert.equal(summary.equipment.instanceCount, 1);
  assert.equal(summary.equipment.slotMappingCount, 1);
  assert.equal(summary.digest, profileAssetSummary(structuredClone(legacyProfile(1))).digest);
});

test("batch migration preserves every existing and unknown bucket plus profile document metadata", () => {
  const snapshot = {
    schemaVersion: 1,
    accounts: {migration: {accountId: "acc_player_migration", username: "migration"}},
    sessions: {session_1: {sessionId: "session_1", tokenHash: "secret_hash"}},
    profileBindings: {acc_player_migration: {accountId: "acc_player_migration", playerId: "player_migration", profileRevision: 7}},
    profiles: {
      player_migration: profileDocument("player_migration", legacyProfile()),
      player_current: profileDocument("player_current", legacyProfile(2)),
    },
    marketListings: {listing_1: {listingId: "listing_1", itemId: "capture_net_basic"}},
    marketConfig: {taxBps: 500},
    offlineHangConfig: {rewardRateBps: 5000},
    families: {family_1: {familyId: "family_1", name: "迁移家族"}},
    manors: {manor_1: {manorId: "manor_1", ownerFamilyId: "family_1"}},
    manorWars: [{warId: "war_1"}],
    manorBattles: [{battleId: "battle_1"}],
    battleRecords: [{recordId: "record_1"}],
    battleTrace: [{traceId: "trace_1"}],
    unknownFutureBucket: {nested: [3, 2, 1], keep: true},
  };
  const before = structuredClone(snapshot);
  const result = migrateProfilesSnapshot(snapshot);

  assert.equal(result.ok, true);
  assert.equal(result.applySafe, true);
  assert.equal(result.changed, true);
  assert.deepEqual(result.counts, {total: 2, eligible: 2, changed: 1, unchanged: 1, invalid: 0});
  assert.equal(result.snapshot.profiles.player_migration.profile.schemaVersion, 2);
  assert.equal(result.snapshot.profiles.player_current.profile.schemaVersion, 2);
  assert.deepEqual(result.snapshot.unknownFutureBucket, snapshot.unknownFutureBucket);
  assert.deepEqual(result.snapshot.marketListings, snapshot.marketListings);
  assert.deepEqual(result.snapshot.families, snapshot.families);
  assert.deepEqual(
    {...result.snapshot.profiles.player_migration, profile: undefined},
    {...snapshot.profiles.player_migration, profile: undefined},
  );
  assert.equal(result.profiles.every((entry) => entry.documentMetadataPreserved), true);
  assert.equal(result.profiles.every((entry) => entry.assetsUnchanged), true);
  assert.equal(result.profileKeysPreserved, true);
  assert.equal(result.nonProfileBucketsPreserved, true);
  assert.deepEqual(snapshot, before);
});

test("one invalid profile makes the whole snapshot plan non-applicable without deleting any profile", () => {
  const snapshot = {
    profiles: {
      valid: profileDocument("valid", legacyProfile(1)),
      future: profileDocument("future", legacyProfile(99)),
      malformed: {playerId: "malformed", profileRevision: 3},
    },
    unknownFutureBucket: {keep: "exactly"},
  };
  const before = structuredClone(snapshot);
  const result = migrateProfilesSnapshot(snapshot);

  assert.equal(result.ok, false);
  assert.equal(result.applySafe, false);
  assert.equal(result.changed, false);
  assert.equal(result.wouldChange, true);
  assert.equal(result.counts.total, 3);
  assert.equal(result.counts.invalid, 2);
  assert.deepEqual(result.snapshot, before);
  assert.deepEqual(Object.keys(result.snapshot.profiles).sort(), ["future", "malformed", "valid"]);
  assert.equal(result.errors.some((error) => error.code === "profile_schema_too_new"), true);
  assert.equal(result.errors.some((error) => error.code === "profile_document_invalid"), true);
  assert.equal(result.profileKeysPreserved, true);
  assert.equal(result.nonProfileBucketsPreserved, true);
});

test("missing profiles bucket is a no-op and an invalid bucket fails closed", () => {
  const withoutProfiles = {schemaVersion: 1, unknownFutureBucket: {keep: true}};
  const noOp = migrateProfilesSnapshot(withoutProfiles);
  assert.equal(noOp.ok, true);
  assert.equal(noOp.changed, false);
  assert.deepEqual(noOp.snapshot, withoutProfiles);

  const invalid = {profiles: [], unknownFutureBucket: {keep: true}};
  const rejected = migrateProfilesSnapshot(invalid);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.errors[0].code, "snapshot_profiles_invalid");
  assert.deepEqual(rejected.snapshot, invalid);
});
