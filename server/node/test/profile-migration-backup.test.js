"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  BATCH_MIGRATION_BACKUP_KIND,
  BATCH_MIGRATION_BACKUP_SCHEMA_VERSION,
  createBatchMigrationBackup,
  verifyBatchMigrationBackup,
  writeBatchMigrationBackup,
} = require("../src/auth/profile-migration-backup");
const {stableDigest} = require("../src/auth/profile-migrations");

const CREATED_AT = "2026-07-12T10:30:00.000Z";
const WRITTEN_AT = "2026-07-12T10:31:00.000Z";

test("batch migration backup contains an isolated complete snapshot and fixed integrity envelope", () => {
  const snapshot = snapshotFixture();
  const sourceDigest = stableDigest(snapshot);
  const planDigest = stableDigest({migration: "profiles_v3", sourceDigest});
  const backup = createBatchMigrationBackup(snapshot, {sourceDigest, planDigest, createdAt: CREATED_AT});

  assert.equal(backup.kind, BATCH_MIGRATION_BACKUP_KIND);
  assert.equal(backup.schemaVersion, BATCH_MIGRATION_BACKUP_SCHEMA_VERSION);
  assert.equal(backup.createdAt, CREATED_AT);
  assert.equal(backup.sourceDigest, sourceDigest);
  assert.equal(backup.planDigest, planDigest);
  assert.deepEqual(backup.snapshot, snapshot);
  assert.notEqual(backup.snapshot, snapshot);
  assert.equal(backup.backupDigest, stableDigest({
    kind: backup.kind,
    schemaVersion: backup.schemaVersion,
    createdAt: backup.createdAt,
    sourceDigest: backup.sourceDigest,
    planDigest: backup.planDigest,
    snapshot: backup.snapshot,
  }));

  snapshot.profiles.player_target.profile.stoneCoins = 0;
  assert.equal(backup.snapshot.profiles.player_target.profile.stoneCoins, 7850);
  const verification = verifyBatchMigrationBackup(backup);
  assert.equal(verification.ok, true);
  assert.equal(Object.hasOwn(verification, "snapshot"), false);
  assert.equal(JSON.stringify(verification).includes("session-secret"), false);
});

test("batch migration backup verification fails closed for schema, source and payload tampering", () => {
  const backup = backupFixture();
  const cases = [
    [null, "profile_migration_backup_document_invalid"],
    [{...backup, extra: true}, "profile_migration_backup_fields_invalid"],
    [{...backup, kind: "other"}, "profile_migration_backup_kind_invalid"],
    [{...backup, schemaVersion: 2}, "profile_migration_backup_schema_version_invalid"],
    [{...backup, createdAt: "2026-07-12"}, "profile_migration_backup_created_at_invalid"],
    [{...backup, snapshot: []}, "profile_migration_backup_snapshot_invalid"],
    [{...backup, sourceDigest: "not-a-digest"}, "profile_migration_backup_source_digest_invalid"],
    [{...backup, planDigest: "not-a-digest"}, "profile_migration_backup_plan_digest_invalid"],
    [{...backup, backupDigest: "not-a-digest"}, "profile_migration_backup_digest_invalid"],
    [{
      ...backup,
      snapshot: {
        ...backup.snapshot,
        profiles: {
          ...backup.snapshot.profiles,
          player_target: {
            ...backup.snapshot.profiles.player_target,
            profile: {...backup.snapshot.profiles.player_target.profile, stoneCoins: 1},
          },
        },
      },
    }, "profile_migration_backup_source_digest_mismatch"],
    [{...backup, planDigest: "f".repeat(64)}, "profile_migration_backup_digest_mismatch"],
  ];

  for (const [document, code] of cases) {
    const verification = verifyBatchMigrationBackup(document);
    assert.equal(verification.ok, false, code);
    assert.equal(verification.code, code);
    assert.equal(JSON.stringify(verification).includes("session-secret"), false);
  }
});

test("batch migration backup creation rejects mismatched digests and non-JSON snapshots", () => {
  const snapshot = snapshotFixture();
  const planDigest = stableDigest({plan: 1});
  assert.throws(
    () => createBatchMigrationBackup(snapshot, {
      sourceDigest: "0".repeat(64),
      planDigest,
      createdAt: CREATED_AT,
    }),
    (error) => error.code === "profile_migration_backup_source_digest_invalid"
  );
  assert.throws(
    () => createBatchMigrationBackup(snapshot, {
      sourceDigest: stableDigest(snapshot),
      planDigest: "",
      createdAt: CREATED_AT,
    }),
    (error) => error.code === "profile_migration_backup_plan_digest_invalid"
  );
  const circular = {};
  circular.self = circular;
  assert.throws(
    () => createBatchMigrationBackup(circular, {
      sourceDigest: "0".repeat(64),
      planDigest,
      createdAt: CREATED_AT,
    }),
    (error) => error.code === "profile_migration_backup_snapshot_not_json"
  );
});

test("batch migration backup writer uses owner-only create-once files and verifies readback", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-profile-batch-backup-"));
  const requestedPath = path.join(tempDir, "requested", "before.json");
  const backup = backupFixture();
  try {
    const writtenPath = writeBatchMigrationBackup(backup, requestedPath, {nowIso: WRITTEN_AT});
    assert.equal(writtenPath, requestedPath);
    assert.deepEqual(JSON.parse(fs.readFileSync(writtenPath, "utf8")), backup);
    assert.equal(fs.statSync(writtenPath).mode & 0o777, 0o600);
    assert.equal(verifyBatchMigrationBackup(JSON.parse(fs.readFileSync(writtenPath, "utf8"))).ok, true);

    assert.throws(
      () => writeBatchMigrationBackup(backup, requestedPath, {nowIso: WRITTEN_AT}),
      (error) => error.code === "EEXIST"
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(writtenPath, "utf8")), backup);
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("batch migration backup writer defaults to the ignored repository backup directory", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-profile-batch-root-"));
  const backup = backupFixture();
  try {
    const writtenPath = writeBatchMigrationBackup(backup, "", {
      nowIso: WRITTEN_AT,
      repoRoot: tempDir,
    });
    assert.equal(path.dirname(writtenPath), path.join(tempDir, "server/node/.local/backups"));
    assert.match(path.basename(writtenPath), /^profile-migration-batch-20260712T103100Z-[a-f0-9]{8}\.json$/);
    assert.equal(fs.statSync(writtenPath).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("batch migration backup writer rejects invalid documents before creating a file", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-profile-batch-invalid-"));
  const requestedPath = path.join(tempDir, "must-not-exist.json");
  const invalid = {...backupFixture(), backupDigest: "0".repeat(64)};
  try {
    assert.throws(
      () => writeBatchMigrationBackup(invalid, requestedPath, {nowIso: WRITTEN_AT}),
      (error) => error.code === "profile_migration_backup_digest_mismatch"
    );
    assert.equal(fs.existsSync(requestedPath), false);
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

function backupFixture() {
  const snapshot = snapshotFixture();
  const sourceDigest = stableDigest(snapshot);
  return createBatchMigrationBackup(snapshot, {
    sourceDigest,
    planDigest: stableDigest({migration: "profiles_v3", sourceDigest}),
    createdAt: CREATED_AT,
  });
}

function snapshotFixture() {
  return {
    schemaVersion: 1,
    accounts: {
      auth1373: {accountId: "acc_target", username: "auth1373", passwordHash: "hash-secret"},
    },
    sessions: {
      session_target: {sessionId: "session_target", accountId: "acc_target", tokenHash: "session-secret"},
    },
    profileBindings: {
      acc_target: {accountId: "acc_target", playerId: "player_target", profileRevision: 8},
    },
    profiles: {
      player_target: {
        playerId: "player_target",
        accountId: "acc_target",
        profileRevision: 8,
        profile: {schemaVersion: 2, stoneCoins: 7850, petInstances: [{instanceId: "pet_keep"}]},
      },
    },
    consumedEquipmentEnvelopes: {
      eqx_mail_fixture_0001: {schemaVersion: 1, envelopeId: "eqx_mail_fixture_0001"},
    },
    marketConfig: {taxRate: 0.08},
    futurePersistentBucket: {mustRemain: {value: 7}},
  };
}
