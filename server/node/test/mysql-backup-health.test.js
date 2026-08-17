"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createMysqlBackupManifest,
  verifyMysqlBackupArtifact,
  writeMysqlBackupManifest,
} = require("../src/mysql-backup-artifact");
const {
  findLatestMysqlRestoreReceipt,
  inspectMysqlBackupHealth,
  mysqlRestoreReceiptDirectory,
  parseMysqlBackupHealthArgs,
  verifyMysqlRestoreReceipt,
  writeMysqlRestoreReceipt,
} = require("../src/mysql-backup-health");

test("restore receipt binds the exact private backup and produces a fresh health result", (t) => {
  const fixture = createArtifact(t);
  const result = writeMysqlRestoreReceipt(passReport(fixture.artifact), fixture.artifact, {
    completedAt: "2026-08-17T02:00:00.000Z",
  });

  assert.equal(fs.statSync(result.receiptPath).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(result.receiptPath)).mode & 0o777, 0o700);
  assert.match(path.basename(result.receiptPath), /-[a-f0-9]{64}\.json$/);
  assert.equal(verifyMysqlRestoreReceipt(result.receiptPath, fixture.artifact).receipt.backup.sha256, fixture.artifact.manifest.sha256);

  const health = inspectMysqlBackupHealth({
    backupDirectory: fixture.root,
    checkedAt: "2026-08-17T03:00:00.000Z",
    maxBackupAgeHours: 3,
    maxRestoreAgeHours: 2,
  });
  assert.equal(health.ok, true);
  assert.equal(health.backup.fresh, true);
  assert.equal(health.restore.fresh, true);
  assert.equal(health.restore.backupSha256, fixture.artifact.manifest.sha256);
  assert.deepEqual(health.failures, []);
  assert.equal(JSON.stringify(health).includes(fixture.root), false);
  assert.equal(JSON.stringify(result.receipt).includes("alice"), false);
});

test("backup health fails closed for a missing or stale restore receipt", (t) => {
  const fixture = createArtifact(t);
  const missing = inspectMysqlBackupHealth({
    backupDirectory: fixture.root,
    checkedAt: "2026-08-17T02:00:00.000Z",
    maxBackupAgeHours: 2,
    maxRestoreAgeHours: 2,
  });
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.failures, [{code: "mysql_restore_receipt_missing"}]);

  writeMysqlRestoreReceipt(passReport(fixture.artifact), fixture.artifact, {
    completedAt: "2026-08-17T02:00:00.000Z",
  });
  const stale = inspectMysqlBackupHealth({
    backupDirectory: fixture.root,
    checkedAt: "2026-08-17T10:00:00.000Z",
    maxBackupAgeHours: 12,
    maxRestoreAgeHours: 1,
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.backup.fresh, true);
  assert.equal(stale.restore.fresh, false);
  assert.deepEqual(stale.failures, [{code: "mysql_restore_receipt_stale"}]);
});

test("newest corrupt restore receipt is not hidden by an older valid receipt", (t) => {
  const fixture = createArtifact(t);
  const older = writeMysqlRestoreReceipt(passReport(fixture.artifact), fixture.artifact, {
    completedAt: "2026-08-17T02:00:00.000Z",
  });
  const newer = writeMysqlRestoreReceipt(passReport(fixture.artifact, {schemaDigest: "b".repeat(64)}), fixture.artifact, {
    completedAt: "2026-08-17T03:00:00.000Z",
  });
  fs.appendFileSync(newer.receiptPath, "\n", "utf8");
  const future = new Date("2026-08-17T04:00:00.000Z");
  fs.utimesSync(newer.receiptPath, future, future);
  fs.utimesSync(older.receiptPath, new Date("2026-08-17T02:00:00.000Z"), new Date("2026-08-17T02:00:00.000Z"));

  assert.throws(
    () => findLatestMysqlRestoreReceipt(fixture.artifact),
    (error) => error.code === "mysql_restore_receipt_digest_mismatch",
  );
  const health = inspectMysqlBackupHealth({
    backupDirectory: fixture.root,
    checkedAt: "2026-08-17T04:00:00.000Z",
    maxBackupAgeHours: 4,
    maxRestoreAgeHours: 4,
  });
  assert.equal(health.ok, false);
  assert.deepEqual(health.failures, [{code: "mysql_restore_receipt_digest_mismatch"}]);
});

test("restore receipt publication is create-once and rejects a changed dump", (t) => {
  const fixture = createArtifact(t);
  const report = passReport(fixture.artifact);
  const options = {completedAt: "2026-08-17T02:00:00.000Z"};
  writeMysqlRestoreReceipt(report, fixture.artifact, options);
  assert.throws(
    () => writeMysqlRestoreReceipt(report, fixture.artifact, options),
    (error) => error && error.code === "EEXIST",
  );

  fs.appendFileSync(fixture.artifact.backupPath, "-- changed\n", "utf8");
  assert.throws(
    () => writeMysqlRestoreReceipt(report, fixture.artifact, {completedAt: "2026-08-17T03:00:00.000Z"}),
    (error) => error.code === "mysql_backup_manifest_size_mismatch",
  );
});

test("restore receipt rejects incomplete cleanup and private-file violations", (t) => {
  const fixture = createArtifact(t);
  const report = passReport(fixture.artifact);
  assert.throws(
    () => writeMysqlRestoreReceipt({
      ...report,
      cleanup: {...report.cleanup, temporaryPortClosed: false},
    }, fixture.artifact, {completedAt: "2026-08-17T02:00:00.000Z"}),
    (error) => error.code === "mysql_restore_report_boolean_contract_invalid",
  );

  const written = writeMysqlRestoreReceipt(report, fixture.artifact, {
    completedAt: "2026-08-17T02:00:00.000Z",
  });
  if (process.platform !== "win32") {
    fs.chmodSync(written.receiptPath, 0o644);
    assert.throws(
      () => verifyMysqlRestoreReceipt(written.receiptPath, fixture.artifact),
      (error) => error.code === "mysql_restore_receipt_file_permissions_invalid",
    );
  }
});

test("restore receipt directory refuses symbolic links", (t) => {
  if (process.platform === "win32") {
    t.skip("symbolic-link permission contract is POSIX-specific");
    return;
  }
  const fixture = createArtifact(t);
  const target = path.join(fixture.root, "receipt-target");
  fs.mkdirSync(target, {mode: 0o700});
  fs.symlinkSync(target, mysqlRestoreReceiptDirectory(fixture.artifact.backupPath));
  assert.throws(
    () => writeMysqlRestoreReceipt(passReport(fixture.artifact), fixture.artifact, {
      completedAt: "2026-08-17T02:00:00.000Z",
    }),
    (error) => error.code === "mysql_restore_receipt_directory_type_invalid",
  );
});

test("backup health policy requires both explicit bounded hour thresholds", () => {
  assert.deepEqual(parseMysqlBackupHealthArgs([
    "--max-restore-age-hours", "168",
    "--max-backup-age-hours", "26",
  ]), {maxBackupAgeHours: 26, maxRestoreAgeHours: 168});
  assert.throws(
    () => parseMysqlBackupHealthArgs(["--max-backup-age-hours", "26"]),
    (error) => error.code === "mysql_backup_health_policy_missing",
  );
  assert.throws(
    () => parseMysqlBackupHealthArgs([
      "--max-backup-age-hours", "0",
      "--max-restore-age-hours", "168",
    ]),
    (error) => error.code === "mysql_backup_health_policy_invalid",
  );
  assert.throws(
    () => parseMysqlBackupHealthArgs([
      "--max-backup-age-hours", "26",
      "--max-backup-age-hours", "27",
      "--max-restore-age-hours", "168",
    ]),
    (error) => error.code === "mysql_backup_health_argument_duplicate",
  );
});

function createArtifact(t, options = {}) {
  const root = fs.mkdtempSync(path.resolve(os.tmpdir(), "beastbound-backup-health-"));
  fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const backupPath = path.join(root, options.dumpFile || "beastbound_odyssey-20260817T010000000Z.sql");
  fs.writeFileSync(backupPath, "CREATE TABLE sample (id INT PRIMARY KEY);\n", {encoding: "utf8", mode: 0o600});
  fs.chmodSync(backupPath, 0o600);
  const manifest = createMysqlBackupManifest(backupPath, {
    database: "beastbound_odyssey",
    createdAt: "2026-08-17T01:00:00.000Z",
  });
  writeMysqlBackupManifest(manifest, backupPath);
  return {root, artifact: verifyMysqlBackupArtifact(backupPath)};
}

function passReport(artifact, options = {}) {
  return Object.freeze({
    status: "PASS",
    kind: "beastbound_mysql_backup_restore_drill",
    schemaVersion: 1,
    backup: Object.freeze({
      database: artifact.manifest.database,
      dumpFile: artifact.manifest.dumpFile,
      bytes: artifact.manifest.bytes,
      sha256: artifact.manifest.sha256,
      consistency: artifact.manifest.consistency.contract,
    }),
    restore: Object.freeze({
      engine: "isolated_mysql_logical_restore_and_real_service_smoke",
      mysqlVersion: "9.7.0-test",
      nonDefaultLoopbackPort: true,
      tableCount: 2,
      checkedTableCount: 2,
      schemaDigest: options.schemaDigest || "a".repeat(64),
      persistentAuthorityDigest: "c".repeat(64),
      authorityCounts: Object.freeze({
        accounts: 2,
        sessions: 1,
        profiles: 2,
        characterSlots: 2,
        mutationReceipts: 3,
        activeMail: 4,
        marketListings: 0,
        consumedEquipmentEnvelopes: 1,
        parties: 1,
        families: 0,
        battleRecords: 5,
        serviceEvents: 6,
        storeRevision: 7,
      }),
      importElapsedMs: 100,
      totalElapsedMs: 200,
    }),
    application: Object.freeze({
      strictStoreLoadPassed: true,
      realHttpServerReadyPassed: true,
      schemaUnchangedAfterStartup: true,
      persistentAuthorityUnchangedAfterStartup: true,
    }),
    claims: Object.freeze({
      backupRestorableInIsolatedMysql: true,
      restoreDrillConnectedToSourceDatabase: false,
      sourceDatabaseWritten: false,
      productionRpoRtoProven: false,
    }),
    cleanup: Object.freeze({
      restoredServerStopped: true,
      temporaryMysqlStopped: true,
      temporaryStateRemoved: true,
      temporaryPortClosed: true,
    }),
  });
}
