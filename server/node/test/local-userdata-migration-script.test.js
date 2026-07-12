"use strict";

const assert = require("node:assert/strict");
const {spawnSync} = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  applyLocalUserdataMigration,
  buildLocalUserdataMigration,
  parseArgs,
  resolveMigrationRole,
  targetScopeDigest,
  verifyAppliedMigration,
  writeBackupSnapshot,
} = require("../scripts/migrate-local-userdata-to-mysql");

const NOW = "2026-07-12T08:00:00.000Z";
const scriptPath = path.resolve(__dirname, "../scripts/migrate-local-userdata-to-mysql.js");

test("real CLI defaults to read-only dry-run and sends no DDL or transaction writes", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-migration-cli-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const mysqlLogPath = path.join(tempDir, "mysql.jsonl");
  const profilePath = path.join(tempDir, "profile.json");
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.appendFileSync(process.env.FAKE_MYSQL_LOG, JSON.stringify({stdin}) + "\\n");
});
`, {mode: 0o755});
  fs.writeFileSync(profilePath, JSON.stringify(importedProfile()));
  try {
    const result = spawnSync(process.execPath, [scriptPath, "--username", "newqa", "--profile-path", profilePath], {
      cwd: path.resolve(__dirname, "../../.."),
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_MYSQL_LOG: mysqlLogPath,
        BEASTBOUND_MYSQL_BIN: fakeMysqlPath,
        BEASTBOUND_MYSQL_HOST: "127.0.0.1",
        BEASTBOUND_MYSQL_PORT: "3306",
        BEASTBOUND_MYSQL_USER: "reader",
        BEASTBOUND_MYSQL_PASSWORD: "mysql-secret",
        BEASTBOUND_MYSQL_DATABASE: "beastbound_test",
        BEASTBOUND_MYSQL_CREATE_DATABASE: "0",
        BEASTBOUND_MIGRATE_PASSWORD: "account-secret",
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.mode, "dry-run");
    assert.equal(report.applied, false);
    assert.equal(result.stdout.includes("account-secret"), false);
    assert.equal(result.stdout.includes("mysql-secret"), false);
    const calls = fs.readFileSync(mysqlLogPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(calls.length, 2);
    assert.match(calls[0].stdin, /information_schema\.tables/);
    assert.match(calls[1].stdin, /SELECT 'server_state'/);
    assert.doesNotMatch(calls[1].stdin, /consumed_equipment_envelopes/);
    for (const call of calls) {
      assert.doesNotMatch(call.stdin, /CREATE TABLE|CREATE DATABASE|START TRANSACTION|INSERT INTO|DELETE FROM/);
    }
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("unsafe equipment migration returns a structured apply conflict before database access or backup", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-migration-conflict-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const mysqlLogPath = path.join(tempDir, "mysql.jsonl");
  const profilePath = path.join(tempDir, "profile.json");
  const backupPath = path.join(tempDir, "must-not-exist.json");
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.appendFileSync(process.env.FAKE_MYSQL_LOG, JSON.stringify({stdin}) + "\\n");
});
`, {mode: 0o755});
  const unsafe = importedProfile();
  unsafe.schemaVersion = 2;
  unsafe.equipmentInstances.equip_000001 = {
    schemaVersion: 1,
    instanceId: "equip_000001",
    itemId: "weapon_wooden_club",
    location: "backpack",
    slotId: "",
    durability: 30,
    enhancement: {itemId: "weapon_wooden_club", level: 0, history: []},
    wearCounters: {itemId: "weapon_wooden_club", attackCount: 0, hitCount: 0},
    expPillCharge: {},
    source: "unsafe_fixture",
  };
  unsafe.nextEquipmentInstanceSerial = 2;
  fs.writeFileSync(profilePath, JSON.stringify(unsafe));
  try {
    const result = spawnSync(process.execPath, [
      scriptPath,
      "--username", "newqa",
      "--profile-path", profilePath,
      "--backup-path", backupPath,
      "--apply",
    ], {
      cwd: path.resolve(__dirname, "../../.."),
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_MYSQL_LOG: mysqlLogPath,
        BEASTBOUND_MYSQL_BIN: fakeMysqlPath,
        BEASTBOUND_MYSQL_HOST: "127.0.0.1",
        BEASTBOUND_MYSQL_PORT: "3306",
        BEASTBOUND_MYSQL_USER: "reader",
        BEASTBOUND_MYSQL_PASSWORD: "mysql-secret",
        BEASTBOUND_MYSQL_DATABASE: "beastbound_test",
        BEASTBOUND_MYSQL_CREATE_DATABASE: "0",
        BEASTBOUND_MIGRATE_PASSWORD: "account-secret",
      },
    });
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.mode, "apply");
    assert.equal(report.applied, false);
    assert.equal(report.profileMigration.applySafe, false);
    assert.equal(report.profileMigration.errors.some((entry) => (
      entry.code === "equipment_backpack_instance_surplus"
    )), true);
    assert.equal(report.profileMigration.planDigest.length, 64);
    assert.equal(result.stdout.includes("account-secret"), false);
    assert.equal(result.stdout.includes("mysql-secret"), false);
    assert.equal(fs.existsSync(backupPath), false);
    assert.equal(fs.existsSync(mysqlLogPath), false);
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("local userdata migration preserves every unrelated persistent bucket and existing credentials", () => {
  const source = persistentFixture();
  const before = structuredClone(source);
  const migration = buildLocalUserdataMigration({
    sourceData: source,
    username: "auth1373",
    password: "",
    role: "gm",
    profile: importedProfile(),
    profilePath: "/tmp/player_profile.json",
    localAccount: {displayName: "迁移测试员"},
    nowIso: NOW,
    randomUuid: sequence(["event_uuid"]),
  });

  assert.deepEqual(source, before);
  assert.equal(migration.report.unrelatedStatePreserved, true);
  assert.equal(migration.report.passwordChanged, false);
  assert.equal(migration.data.accounts.auth1373.passwordSalt, "existing_salt");
  assert.equal(migration.data.accounts.auth1373.passwordHash, "existing_hash");
  assert.equal(migration.data.sessions.target_session, undefined);
  assert.deepEqual(migration.data.sessions.peer_session, source.sessions.peer_session);
  assert.equal(migration.data.profileBindings.acc_target.profileRevision, 5);
  assert.deepEqual(migration.data.profiles.player_target.profile, {
    ...importedProfile(),
    schemaVersion: 3,
  });
  assert.equal(migration.report.profileMigration.applySafe, true);
  assert.equal(migration.report.profileMigration.fromVersion, 1);
  assert.equal(migration.report.profileMigration.toVersion, 3);
  assert.equal(migration.report.profileMigration.changed, true);
  assert.equal(migration.report.profileMigration.assetsUnchanged, true);
  assert.equal(migration.report.profileMigration.contentUnchanged, true);
  assert.equal(migration.report.profileMigration.planDigest.length, 64);
  assert.equal(migration.report.profileMigration.beforeLogicalDigest, migration.report.profileMigration.afterLogicalDigest);
  assert.deepEqual(migration.report.profileMigration.steps, [
    "profile_v1_to_v2",
    "profile_v2_to_v3_equipment_instances",
  ]);
  assert.equal(migration.report.profileMigration.stepReports[1].equipment.conflicts.length, 0);
  assert.equal(migration.data.gmCommandGrants.acc_target.length, 1);
  assert.equal(migration.data.gmCommandGrants.acc_target[0].commandId, "*");

  for (const key of [
    "marketListings",
    "consumedEquipmentEnvelopes",
    "marketConfig",
    "offlineHangConfig",
    "families",
    "manors",
    "manorWars",
    "manorBattles",
    "battleRecords",
    "battleTrace",
  ]) {
    assert.deepEqual(migration.data[key], source[key], key);
  }
  assert.deepEqual(migration.data.futurePersistentBucket, source.futurePersistentBucket);
  assert.equal(migration.report.beforeCounts.marketListings, 1);
  assert.equal(migration.report.afterCounts.marketListings, 1);
  assert.equal(migration.report.beforeCounts.consumedEquipmentEnvelopes, 1);
  assert.equal(migration.report.afterCounts.consumedEquipmentEnvelopes, 1);
  assert.equal(verifyAppliedMigration(migration.data, migration).ok, true);
});

test("local userdata migration persists a v3 materialized origin and its tombstone in one candidate", () => {
  const profile = importedProfile();
  profile.schemaVersion = 3;
  profile.backpackSlots.push({itemId: "weapon_wooden_club", count: 1});
  profile.equipmentInstances.equip_000001 = {
    schemaVersion: 1,
    instanceId: "equip_000001",
    itemId: "weapon_wooden_club",
    location: "backpack",
    slotId: "",
    durability: 30,
    enhancement: {itemId: "weapon_wooden_club", level: 0, history: []},
    wearCounters: {itemId: "weapon_wooden_club", attackCount: 0, hitCount: 0},
    expPillCharge: {},
    source: "migration_materialized_fixture",
    transferProvenance: {
      schemaVersion: 1,
      originEnvelopeId: "eqx_mail_local_migration_0001",
      originStateFingerprint: "a".repeat(64),
      sourceInstanceId: "equip_source_0001",
    },
  };
  profile.nextEquipmentInstanceSerial = 2;
  const migration = buildLocalUserdataMigration({
    sourceData: persistentFixture(),
    username: "auth1373",
    profile,
    role: "gm",
    nowIso: NOW,
    randomUuid: sequence(["event_uuid"]),
  });
  assert.equal(migration.report.consumedEnvelopeBackfillCount, 1);
  assert.deepEqual(migration.data.consumedEquipmentEnvelopes.eqx_mail_local_migration_0001, {
    schemaVersion: 1,
    envelopeId: "eqx_mail_local_migration_0001",
  });
  assert.equal(verifyAppliedMigration(migration.data, migration).ok, true);
});

test("local userdata migration tombstones the old target origin before replacing that profile", () => {
  const source = persistentFixture();
  const oldTargetProfile = importedProfile();
  oldTargetProfile.schemaVersion = 3;
  oldTargetProfile.backpackSlots.push({itemId: "weapon_wooden_club", count: 1});
  oldTargetProfile.equipmentInstances.equip_000001 = {
    schemaVersion: 1,
    instanceId: "equip_000001",
    itemId: "weapon_wooden_club",
    location: "backpack",
    slotId: "",
    durability: 30,
    enhancement: {itemId: "weapon_wooden_club", level: 0, history: []},
    wearCounters: {itemId: "weapon_wooden_club", attackCount: 0, hitCount: 0},
    expPillCharge: {},
    source: "old_mysql_target_fixture",
    transferProvenance: {
      schemaVersion: 1,
      originEnvelopeId: "eqx_mail_old_mysql_target_0001",
      originStateFingerprint: "b".repeat(64),
      sourceInstanceId: "equip_old_source_0001",
    },
  };
  oldTargetProfile.nextEquipmentInstanceSerial = 2;
  source.profiles.player_target.profile = oldTargetProfile;
  const before = structuredClone(source);

  const migration = buildLocalUserdataMigration({
    sourceData: source,
    username: "auth1373",
    profile: importedProfile(),
    role: "gm",
    nowIso: NOW,
    randomUuid: sequence(["event_uuid"]),
  });

  assert.deepEqual(source, before);
  assert.equal(migration.data.profiles.player_target.profile.equipmentInstances.equip_000001, undefined);
  assert.deepEqual(migration.data.consumedEquipmentEnvelopes.eqx_mail_old_mysql_target_0001, {
    schemaVersion: 1,
    envelopeId: "eqx_mail_old_mysql_target_0001",
  });
  assert.equal(migration.report.consumedEnvelopeBackfillCount, 1);
  assert.equal(migration.report.beforeCounts.consumedEquipmentEnvelopes, 1);
  assert.equal(migration.report.afterCounts.consumedEquipmentEnvelopes, 2);
  assert.equal(verifyAppliedMigration(migration.data, migration).ok, true);
});

test("migration verification fails closed when a non-target asset changes", () => {
  const migration = buildLocalUserdataMigration({
    sourceData: persistentFixture(),
    username: "auth1373",
    profile: importedProfile(),
    profilePath: "/tmp/player_profile.json",
    role: "gm",
    nowIso: NOW,
    randomUuid: sequence(["event_uuid"]),
  });
  const damaged = structuredClone(migration.data);
  delete damaged.marketListings.listing_keep;
  const verification = verifyAppliedMigration(damaged, migration);
  assert.equal(verification.ok, false);
  assert.deepEqual(verification.reasons, ["unrelated_state_changed"]);
});

test("single-account import refuses a snapshot that still has equipment in external containers", () => {
  const source = persistentFixture();
  source.marketListings.listing_keep.itemId = "weapon_wooden_club";
  assert.throws(() => buildLocalUserdataMigration({
    sourceData: source,
    username: "auth1373",
    profile: importedProfile(),
    profilePath: "/tmp/player_profile.json",
    role: "gm",
    nowIso: NOW,
    randomUuid: sequence(["event_uuid"]),
  }), (error) => {
    assert.equal(error.code, "snapshot_external_equipment_unsafe");
    assert.equal(error.externalEquipmentConflicts.some((entry) => (
      entry.code === "market_equipment_transfer_unsupported"
      && entry.path === "marketListings.listing_keep"
    )), true);
    return true;
  });
});

test("apply failure restores only the target scope and preserves concurrent non-target writes", () => {
  const source = persistentFixture();
  const migration = buildLocalUserdataMigration({
    sourceData: source,
    username: "auth1373",
    profile: importedProfile(),
    profilePath: "/tmp/player_profile.json",
    role: "gm",
    nowIso: NOW,
    randomUuid: sequence(["event_uuid"]),
  });
  let data = structuredClone(source);
  let saveCount = 0;
  const store = {
    load() {
      return structuredClone(data);
    },
    save(value) {
      saveCount += 1;
      data = structuredClone(value);
      if (saveCount === 1) {
        data.marketListings.concurrent_listing = {
          listingId: "concurrent_listing",
          sellerAccountId: "acc_peer",
          itemId: "item_meat_small",
          count: 1,
          unitPrice: 12,
          currency: "stoneCoins",
          createdAt: "2026-07-12T08:01:00.000Z",
          schemaVersion: 1,
        };
      }
    },
  };

  assert.throws(
    () => applyLocalUserdataMigration(store, source, migration, "/tmp/backup.json"),
    /targetRollback=ok/,
  );
  assert.equal(saveCount, 2);
  assert.equal(data.marketListings.concurrent_listing.listingId, "concurrent_listing");
  assert.equal(targetScopeDigest(data, migration.verificationContext), targetScopeDigest(source, migration.verificationContext));
  assert.equal(data.authEvents.some((event) => event.eventId === "auth_event_uuid"), false);
});

test("ambiguous save failure reloads current state and performs a target-only rollback", () => {
  const source = persistentFixture();
  const migration = buildLocalUserdataMigration({
    sourceData: source,
    username: "auth1373",
    profile: importedProfile(),
    role: "gm",
    nowIso: NOW,
    randomUuid: sequence(["event_uuid"]),
  });
  let data = structuredClone(source);
  let saveCount = 0;
  const store = {
    load() {
      return structuredClone(data);
    },
    save(value) {
      saveCount += 1;
      data = structuredClone(value);
      if (saveCount === 1) {
        data.families.concurrent_family = {familyId: "concurrent_family", name: "并发家族"};
        throw new Error("ambiguous mysql response");
      }
    },
  };

  assert.throws(
    () => applyLocalUserdataMigration(store, source, migration, "/tmp/backup.json"),
    /ambiguous mysql response; targetRollback=ok/,
  );
  assert.equal(data.families.concurrent_family.name, "并发家族");
  assert.equal(targetScopeDigest(data, migration.verificationContext), targetScopeDigest(source, migration.verificationContext));
});

test("malformed known buckets and conflicting identity graphs fail closed", () => {
  const malformed = persistentFixture();
  malformed.marketListings = [{listingId: "must_not_vanish"}];
  assert.throws(() => buildLocalUserdataMigration({
    sourceData: malformed,
    username: "auth1373",
    profile: importedProfile(),
    role: "gm",
    nowIso: NOW,
  }), /marketListings must be an object/);

  const malformedLedger = persistentFixture();
  malformedLedger.consumedEquipmentEnvelopes = [];
  assert.throws(() => buildLocalUserdataMigration({
    sourceData: malformedLedger,
    username: "auth1373",
    profile: importedProfile(),
    role: "gm",
    nowIso: NOW,
  }), /consumedEquipmentEnvelopes must be an object/);

  const duplicateAccount = persistentFixture();
  duplicateAccount.accounts.alias = {accountId: "acc_target", username: "alias", role: "player"};
  assert.throws(() => buildLocalUserdataMigration({
    sourceData: duplicateAccount,
    username: "auth1373",
    profile: importedProfile(),
    role: "gm",
    nowIso: NOW,
  }), /account_id_reused_by_username/);

  const duplicateBinding = persistentFixture();
  duplicateBinding.profileBindings.acc_other = {accountId: "acc_other", playerId: "player_target"};
  assert.throws(() => buildLocalUserdataMigration({
    sourceData: duplicateBinding,
    username: "auth1373",
    profile: importedProfile(),
    role: "gm",
    nowIso: NOW,
  }), /player_id_reused_by_binding/);

  const mismatchedProfile = persistentFixture();
  mismatchedProfile.profiles.player_target.accountId = "acc_peer";
  assert.throws(() => buildLocalUserdataMigration({
    sourceData: mismatchedProfile,
    username: "auth1373",
    profile: importedProfile(),
    role: "gm",
    nowIso: NOW,
  }), /target_profile_account_mismatch/);
});

test("new account import requires a password while an existing account may preserve its password", () => {
  assert.throws(() => buildLocalUserdataMigration({
    sourceData: persistentFixture(),
    username: "new_account",
    profile: importedProfile(),
    nowIso: NOW,
    randomUuid: sequence(["account_uuid"]),
  }), /password is required/i);
});

test("migration command is dry-run by default and apply is explicit", () => {
  assert.deepEqual(parseArgs(["--username", "auth1373"]), {username: "auth1373"});
  assert.deepEqual(parseArgs(["--username", "auth1373", "--apply", "--backup-path", "/tmp/backup.json"]), {
    username: "auth1373",
    apply: true,
    backupPath: "/tmp/backup.json",
  });
  assert.throws(() => parseArgs(["--force"]), /Unknown argument/);
  assert.throws(() => parseArgs(["--password", "secret"]), /Do not place passwords/);
  assert.equal(resolveMigrationRole({existingRole: "gm", localRole: "player", username: "auth1373"}), "gm");
  assert.throws(() => resolveMigrationRole({requestedRole: "gmn", existingRole: "gm"}), /must be gm or player/);
});

test("migration backup is a complete owner-only JSON snapshot", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-migration-backup-"));
  const backupPath = path.join(tempDir, "before.json");
  const source = persistentFixture();
  try {
    const writtenPath = writeBackupSnapshot(source, backupPath, NOW);
    assert.equal(writtenPath, backupPath);
    assert.deepEqual(JSON.parse(fs.readFileSync(backupPath, "utf8")), source);
    assert.equal(fs.statSync(backupPath).mode & 0o777, 0o600);
    assert.throws(() => writeBackupSnapshot(source, backupPath, NOW), /EEXIST/);
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

function persistentFixture() {
  const otherProfile = {schemaVersion: 1, player: {name: "保留玩家", level: 30}, stoneCoins: 888};
  return {
    schemaVersion: 1,
    accounts: {
      auth1373: {
        accountId: "acc_target",
        username: "auth1373",
        displayName: "旧测试员",
        role: "gm",
        passwordSalt: "existing_salt",
        passwordHash: "existing_hash",
        passwordPolicyVersion: 1,
        passwordUpdatedAt: "2026-07-01T00:00:00.000Z",
      },
      peer: {accountId: "acc_peer", username: "peer", displayName: "保留玩家", role: "player"},
    },
    sessions: {
      target_session: {sessionId: "target_session", accountId: "acc_target"},
      peer_session: {sessionId: "peer_session", accountId: "acc_peer"},
    },
    profileBindings: {
      acc_target: {accountId: "acc_target", playerId: "player_target", profileRevision: 4},
      acc_peer: {accountId: "acc_peer", playerId: "player_peer", profileRevision: 9},
    },
    profiles: {
      player_target: {playerId: "player_target", accountId: "acc_target", profileRevision: 4, profile: {schemaVersion: 1}},
      player_peer: {playerId: "player_peer", accountId: "acc_peer", profileRevision: 9, profile: otherProfile},
    },
    mailMessages: {mail_keep: {mailId: "mail_keep", recipientAccountId: "acc_peer"}},
    marketListings: {
      listing_keep: {
        listingId: "listing_keep",
        sellerAccountId: "acc_peer",
        itemId: "item_meat_small",
        count: 1,
        unitPrice: 10,
        currency: "stoneCoins",
        createdAt: "2026-07-12T08:00:00.000Z",
        schemaVersion: 1,
      },
    },
    consumedEquipmentEnvelopes: {
      eqx_mail_existing_consumed_0001: {
        schemaVersion: 1,
        envelopeId: "eqx_mail_existing_consumed_0001",
      },
    },
    marketConfig: {taxRate: 0.08},
    offlineHangConfig: {rewardRate: 0.5},
    tradeOffers: {},
    parties: {party_keep: {partyId: "party_keep", leaderAccountId: "acc_peer"}},
    partyInvites: {invite_keep: {inviteId: "invite_keep", toAccountId: "acc_peer"}},
    families: {family_keep: {familyId: "family_keep", name: "保留家族"}},
    manors: {manor_keep: {manorId: "manor_keep", ownerFamilyId: "family_keep"}},
    manorWars: [{warId: "war_keep", manorId: "manor_keep"}],
    manorBattles: [{battleId: "manor_battle_keep", manorId: "manor_keep"}],
    chatMessages: [{messageId: "chat_keep", senderAccountId: "acc_peer"}],
    playerPositions: {},
    battleInvites: {},
    battleRooms: {},
    battleRecords: [{recordId: "battle_record_keep", roomId: "room_keep"}],
    battleTrace: [{traceId: "trace_keep", roomId: "room_keep"}],
    gmUserGrants: {acc_target: {accountId: "acc_target", username: "auth1373", enabled: true}},
    gmCommandGrants: {
      acc_target: [{accountId: "acc_target", commandId: "gm_grant_pet", enabled: true}],
      acc_peer: [{accountId: "acc_peer", commandId: "gm_none", enabled: false}],
    },
    gmCommandAudit: [{auditId: "audit_keep", username: "auth1373", commandId: "gm_grant_pet"}],
    authEvents: [{eventId: "auth_keep", type: "login", username: "peer"}],
    serviceEventSeq: 3,
    serviceEvents: [{eventId: "service_keep", eventSeq: 3, type: "party.update"}],
    futurePersistentBucket: {mustRemain: {value: 7}},
  };
}

function importedProfile() {
  return {
    schemaVersion: 1,
    player: {name: "迁移测试员", level: 131},
    stoneCoins: 7850,
    diamonds: 993899,
    petInstances: [{instanceId: "pet_keep", formId: "blue_man_dragon_water10"}],
    backpackSlots: [{itemId: "item_meat_small", count: 5}],
    equipmentInstances: {},
    equipmentSlots: {},
    equipmentSlotInstanceIds: {},
    nextEquipmentInstanceSerial: 1,
    equipmentDurability: {},
    equipmentEnhancement: {},
    equipmentWearCounters: {},
    equipmentExpPillCharge: {},
    equipmentSlotsVersion: 5,
    rebirthCount: 5,
  };
}

function sequence(values) {
  let index = 0;
  return () => values[index++] || `fallback_${index}`;
}
