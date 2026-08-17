"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  MYSQL_BACKUP_CONSISTENCY_CONTRACT,
  createMysqlBackupManifest,
  findLatestMysqlBackupArtifact,
  mysqlBackupManifestPath,
  verifyMysqlBackupArtifact,
  writeMysqlBackupManifest,
} = require("../src/mysql-backup-artifact");

const CREATED_AT = "2026-08-17T01:02:03.000Z";

test("backup manifest binds one owner-only SQL dump with a single-transaction contract", (t) => {
  const fixture = createFixture(t, "beastbound_odyssey-20260817T010203Z.sql");
  const manifest = createMysqlBackupManifest(fixture.backupPath, {
    database: "beastbound_odyssey",
    createdAt: CREATED_AT,
  });
  const manifestPath = writeMysqlBackupManifest(manifest, fixture.backupPath);
  const verified = verifyMysqlBackupArtifact(fixture.backupPath);

  assert.equal(manifestPath, mysqlBackupManifestPath(fixture.backupPath));
  assert.equal(verified.manifest.dumpFile, path.basename(fixture.backupPath));
  assert.equal(verified.manifest.bytes, fs.statSync(fixture.backupPath).size);
  assert.match(verified.manifest.sha256, /^[a-f0-9]{64}$/);
  assert.equal(verified.manifest.consistency.contract, MYSQL_BACKUP_CONSISTENCY_CONTRACT);
  assert.equal(verified.manifest.consistency.singleTransaction, true);
  assert.equal(fs.statSync(manifestPath).mode & 0o777, 0o600);
});

test("backup artifact refuses dump tampering and manifest tampering", (t) => {
  const unpublished = createFixture(t, "beastbound_odyssey-20260817T010203500Z.sql");
  const unpublishedManifest = createMysqlBackupManifest(unpublished.backupPath, {
    database: "beastbound_odyssey",
    createdAt: CREATED_AT,
  });
  fs.appendFileSync(unpublished.backupPath, "-- changed before publish\n", "utf8");
  assert.throws(
    () => writeMysqlBackupManifest(unpublishedManifest, unpublished.backupPath),
    (error) => error.code === "mysql_backup_manifest_digest_mismatch",
  );
  assert.equal(fs.existsSync(mysqlBackupManifestPath(unpublished.backupPath)), false);

  const fixture = createFixture(t, "beastbound_odyssey-20260817T010204Z.sql");
  const manifest = createMysqlBackupManifest(fixture.backupPath, {
    database: "beastbound_odyssey",
    createdAt: CREATED_AT,
  });
  writeMysqlBackupManifest(manifest, fixture.backupPath);
  fs.appendFileSync(fixture.backupPath, "-- tampered\n", "utf8");
  assert.throws(
    () => verifyMysqlBackupArtifact(fixture.backupPath),
    (error) => error.code === "mysql_backup_manifest_size_mismatch",
  );

  fs.writeFileSync(fixture.backupPath, fixture.source, {encoding: "utf8", mode: 0o600});
  const manifestPath = mysqlBackupManifestPath(fixture.backupPath);
  const document = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  document.consistency.singleTransaction = false;
  fs.writeFileSync(manifestPath, `${JSON.stringify(document)}\n`, {encoding: "utf8", mode: 0o600});
  assert.throws(
    () => verifyMysqlBackupArtifact(fixture.backupPath),
    (error) => error.code === "mysql_backup_manifest_consistency_invalid",
  );
});

test("backup manifest publication is create-once", (t) => {
  const fixture = createFixture(t, "beastbound_odyssey-20260817T010205Z.sql");
  const manifest = createMysqlBackupManifest(fixture.backupPath, {
    database: "beastbound_odyssey",
    createdAt: CREATED_AT,
  });
  const manifestPath = writeMysqlBackupManifest(manifest, fixture.backupPath);
  const before = fs.readFileSync(manifestPath);

  assert.throws(() => writeMysqlBackupManifest(manifest, fixture.backupPath), /EEXIST/);
  assert.deepEqual(fs.readFileSync(manifestPath), before);
});

test("latest backup selection verifies the newest manifest instead of hiding corruption", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-backup-latest-"));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const older = createBackup(root, "beastbound_odyssey-20260817T010200Z.sql", "SELECT 1;\n");
  const newer = createBackup(root, "beastbound_odyssey-20260817T010300Z.sql", "SELECT 2;\n");
  for (const entry of [older, newer]) {
    writeMysqlBackupManifest(createMysqlBackupManifest(entry, {
      database: "beastbound_odyssey",
      createdAt: CREATED_AT,
    }), entry);
  }
  const irregularLegacy = createBackup(root, "zzzz-before-formal-manifests.sql", "SELECT 0;\n");
  fs.utimesSync(irregularLegacy, new Date("2026-07-01T00:00:00.000Z"), new Date("2026-07-01T00:00:00.000Z"));

  assert.equal(findLatestMysqlBackupArtifact(root).backupPath, newer);
  const orphan = createBackup(root, "beastbound_odyssey-20260817T010400Z.sql", "SELECT 3;\n");
  assert.throws(
    () => findLatestMysqlBackupArtifact(root),
    (error) => error.code === "mysql_backup_manifest_missing",
  );
  fs.rmSync(orphan);
  fs.appendFileSync(newer, "-- corrupt\n", "utf8");
  assert.throws(
    () => findLatestMysqlBackupArtifact(root),
    (error) => error.code === "mysql_backup_manifest_size_mismatch",
  );
});

test("backup artifact refuses permissive files and symbolic links", (t) => {
  const fixture = createFixture(t, "beastbound_odyssey-20260817T010206Z.sql");
  fs.chmodSync(fixture.backupPath, 0o644);
  assert.throws(
    () => createMysqlBackupManifest(fixture.backupPath, {
      database: "beastbound_odyssey",
      createdAt: CREATED_AT,
    }),
    (error) => error.code === "mysql_backup_file_permissions_invalid",
  );

  fs.chmodSync(fixture.backupPath, 0o600);
  const linkPath = path.join(fixture.root, "backup-link.sql");
  fs.symlinkSync(fixture.backupPath, linkPath);
  assert.throws(
    () => createMysqlBackupManifest(linkPath, {
      database: "beastbound_odyssey",
      createdAt: CREATED_AT,
    }),
    (error) => error.code === "mysql_backup_file_type_invalid",
  );
});

function createFixture(t, name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-backup-artifact-"));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const source = "CREATE TABLE sample (id INT PRIMARY KEY);\nINSERT INTO sample VALUES (1);\n";
  const backupPath = createBackup(root, name, source);
  return {root, backupPath, source};
}

function createBackup(root, name, source) {
  const backupPath = path.join(root, name);
  fs.writeFileSync(backupPath, source, {encoding: "utf8", mode: 0o600});
  fs.chmodSync(backupPath, 0o600);
  return backupPath;
}
