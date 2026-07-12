"use strict";

const assert = require("node:assert/strict");
const {spawnSync} = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  applyBatchProfileMigration,
  parseArgs,
  runMysqlProfileMigration,
  validateApplyGates,
} = require("../scripts/migrate-mysql-profiles");
const {
  buildBatchProfileMigration,
} = require("../src/auth/profile-migration-batch-ops");

const NOW = "2026-07-12T12:00:00.000Z";
const scriptPath = path.resolve(__dirname, "../scripts/migrate-mysql-profiles.js");

test("real batch CLI defaults to read-only rehearsal without DDL, writes, or backup", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-profile-batch-cli-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const mysqlLogPath = path.join(tempDir, "mysql.jsonl");
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.appendFileSync(process.env.FAKE_MYSQL_LOG, JSON.stringify({stdin}) + "\\n");
  if (stdin.includes("information_schema.tables")) {
    process.stdout.write("1\\n");
  } else if (stdin.includes("SELECT 'server_state'")) {
    process.stdout.write("server_state\\tauth\\t{\\\"schemaVersion\\\":2,\\\"storage\\\":\\\"mysql_entity_tables\\\",\\\"marketConfig\\\":{},\\\"offlineHangConfig\\\":{},\\\"serviceEventSeq\\\":0}\\n");
  }
});
`, {mode: 0o755});
  try {
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: path.resolve(__dirname, "../../.."),
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_MYSQL_LOG: mysqlLogPath,
        BEASTBOUND_MYSQL_BIN: fakeMysqlPath,
        BEASTBOUND_MYSQL_HOST: "127.0.0.1",
        BEASTBOUND_MYSQL_PORT: "3306",
        BEASTBOUND_MYSQL_USER: "reader",
        BEASTBOUND_MYSQL_PASSWORD: "mysql-secret-must-not-leak",
        BEASTBOUND_MYSQL_DATABASE: "beastbound_test",
        BEASTBOUND_MYSQL_CREATE_DATABASE: "0",
      },
    });
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.mode, "dry-run");
    assert.equal(report.applied, false);
    assert.equal(report.rehearsal.ok, true);
    assert.equal(report.plan.profileCount, 0);
    assert.equal(result.stdout.includes("mysql-secret-must-not-leak"), false);

    const sql = fs.readFileSync(mysqlLogPath, "utf8");
    assert.match(sql, /information_schema\.tables/);
    assert.match(sql, /SELECT 'profiles'/);
    assert.doesNotMatch(sql, /CREATE\s+(DATABASE|TABLE)/i);
    assert.doesNotMatch(sql, /START\s+TRANSACTION|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bCOMMIT\b/i);
    assert.equal(fs.existsSync(path.join(tempDir, "server/node/.local/backups")), false);
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("CLI redacts a database password even when a failing mysql process echoes it", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-profile-batch-secret-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql-failure.js");
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
process.stdin.resume();
process.stdin.on("end", () => {
  process.stderr.write("Access denied from -pmysql-secret-must-not-leak");
  process.exitCode = 1;
});
`, {mode: 0o755});
  try {
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: path.resolve(__dirname, "../../.."),
      encoding: "utf8",
      env: {
        ...process.env,
        BEASTBOUND_MYSQL_BIN: fakeMysqlPath,
        BEASTBOUND_MYSQL_PASSWORD: "mysql-secret-must-not-leak",
        BEASTBOUND_MYSQL_DATABASE: "beastbound_test",
      },
    });
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.message.includes("[REDACTED]"), true);
    assert.equal(`${result.stdout}\n${result.stderr}`.includes("mysql-secret-must-not-leak"), false);
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

test("apply gates and argument parser reject unsafe invocation before opening a store", () => {
  assert.deepEqual(parseArgs([]), {});
  assert.deepEqual(parseArgs([
    "--apply",
    "--maintenance-confirmed",
    "--expect-source-digest", "a".repeat(64),
    "--expect-plan-digest", "b".repeat(64),
    "--backup-path", "/tmp/profile-backup.json",
  ]), {
    apply: true,
    maintenanceConfirmed: true,
    expectSourceDigest: "a".repeat(64),
    expectPlanDigest: "b".repeat(64),
    backupPath: "/tmp/profile-backup.json",
  });
  assert.throws(() => parseArgs(["--unknown"]), (error) => (
    error.code === "batch_profile_migration_argument_unknown"
  ));
  assert.throws(() => parseArgs(["--backup-path", "--apply"]), (error) => (
    error.code === "batch_profile_migration_argument_missing"
  ));
  assert.throws(() => validateApplyGates({apply: true}), (error) => (
    error.code === "batch_profile_migration_maintenance_required"
  ));
  assert.throws(() => validateApplyGates({apply: true, maintenanceConfirmed: true}), (error) => (
    error.code === "batch_profile_migration_source_digest_required"
  ));

  let readStoreCreated = false;
  assert.throws(() => runMysqlProfileMigration({
    args: {apply: true},
    createReadStore() {
      readStoreCreated = true;
      throw new Error("must not open");
    },
  }), (error) => error.code === "batch_profile_migration_maintenance_required");
  assert.equal(readStoreCreated, false);
});

test("apply writes and verifies backup before opening writer, then saves one candidate", () => {
  const source = completeSnapshot();
  const reviewed = buildBatchProfileMigration(source);
  const events = [];
  let data = structuredClone(source);
  let saveCount = 0;
  const result = runMysqlProfileMigration({
    args: applyArgs(reviewed),
    nowIso: NOW,
    createReadStore() {
      events.push("read-store");
      return {load() { events.push("read-load"); return structuredClone(source); }};
    },
    writeBackup(document) {
      events.push("backup");
      assert.deepEqual(document.snapshot, source);
      return "/tmp/verified-profile-backup.json";
    },
    createWriteStore() {
      events.push("write-store");
      return {
        load() { events.push("write-load"); return structuredClone(data); },
        save(value) { events.push("write-save"); saveCount += 1; data = structuredClone(value); },
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.equal(result.backupPath, "/tmp/verified-profile-backup.json");
  assert.equal(result.ambiguousCommitRecovered, false);
  assert.equal(saveCount, 1);
  assert.equal(data.profiles.player_batch.profile.schemaVersion, 3);
  assert.equal(events.indexOf("backup") < events.indexOf("write-store"), true);
  assert.equal(events.indexOf("backup") < events.indexOf("write-save"), true);
  assert.equal(JSON.stringify(result).includes("password-secret"), false);
});

test("apply refuses source drift after backup and performs no profile save", () => {
  const source = completeSnapshot();
  const reviewed = buildBatchProfileMigration(source);
  const drifted = structuredClone(source);
  drifted.marketConfig.taxBps = 999;
  let backupWritten = false;
  let saveCount = 0;

  assert.throws(() => runMysqlProfileMigration({
    args: applyArgs(reviewed),
    nowIso: NOW,
    createReadStore: () => ({load: () => structuredClone(source)}),
    writeBackup() {
      backupWritten = true;
      return "/tmp/drift-profile-backup.json";
    },
    createWriteStore: () => ({
      load: () => structuredClone(drifted),
      save() { saveCount += 1; },
    }),
  }), (error) => {
    assert.equal(error.code, "batch_profile_migration_source_drifted");
    assert.equal(error.batchMigration.backupPath, "/tmp/drift-profile-backup.json");
    return true;
  });
  assert.equal(backupWritten, true);
  assert.equal(saveCount, 0);
});

test("writer initialization or reload failure reports the verified backup path", () => {
  const source = completeSnapshot();
  const reviewed = buildBatchProfileMigration(source);
  for (const createWriteStore of [
    () => { throw new Error("writer unavailable"); },
    () => ({load() { throw new Error("schema load failed"); }}),
  ]) {
    let backupWritten = false;
    assert.throws(() => runMysqlProfileMigration({
      args: applyArgs(reviewed),
      nowIso: NOW,
      createReadStore: () => ({load: () => structuredClone(source)}),
      writeBackup() {
        backupWritten = true;
        return "/tmp/writer-failure-backup.json";
      },
      createWriteStore,
    }), (error) => {
      assert.equal(error.code, "batch_profile_migration_writer_prepare_failed");
      assert.equal(error.batchMigration.backupPath, "/tmp/writer-failure-backup.json");
      return true;
    });
    assert.equal(backupWritten, true);
  }
});

test("an ambiguous save response is accepted only when reload proves the whole candidate", () => {
  const plan = buildBatchProfileMigration(completeSnapshot());
  let data = structuredClone(plan.sourceSnapshot);
  const store = {
    save(value) {
      data = structuredClone(value);
      throw new Error("ambiguous response");
    },
    load() { return structuredClone(data); },
  };
  const result = applyBatchProfileMigration(store, plan, {backupPath: "/tmp/before.json"});
  assert.equal(result.ok, true);
  assert.equal(result.ambiguousCommitRecovered, true);
  assert.equal(result.verification.ok, true);
});

test("tampered plans fail integrity checks before the first save", () => {
  const sourcePlan = buildBatchProfileMigration(completeSnapshot());
  const cases = [
    (plan) => { plan.candidateSnapshot.profiles.player_batch.profile.stoneCoins += 1; },
    (plan) => { plan.changedProfileIds = []; },
    (plan) => { plan.planDigest = "0".repeat(64); },
  ];
  for (const patchPlan of cases) {
    const plan = structuredClone(sourcePlan);
    patchPlan(plan);
    let saveCount = 0;
    assert.throws(() => applyBatchProfileMigration({
      save() { saveCount += 1; },
      load() { return structuredClone(sourcePlan.sourceSnapshot); },
    }, plan, {backupPath: "/tmp/before.json"}), (error) => (
      error.code === "batch_profile_migration_plan_invalid"
    ));
    assert.equal(saveCount, 0);
  }
});

test("verification failure restores profiles only and preserves concurrent non-target state", () => {
  const plan = buildBatchProfileMigration(completeSnapshot());
  let data = structuredClone(plan.sourceSnapshot);
  let saveCount = 0;
  const store = {
    save(value) {
      saveCount += 1;
      data = structuredClone(value);
      if (saveCount === 1) {
        data.marketConfig.concurrentNote = "keep me";
        data.families.family_concurrent = {familyId: "family_concurrent", name: "并发家族"};
      }
    },
    load() { return structuredClone(data); },
  };

  assert.throws(
    () => applyBatchProfileMigration(store, plan, {backupPath: "/tmp/before.json"}),
    (error) => {
      assert.equal(error.code, "batch_profile_migration_apply_failed_rolled_back");
      assert.equal(error.batchMigration.rollback.verified, true);
      return true;
    },
  );
  assert.equal(saveCount, 2);
  assert.deepEqual(data.profiles, plan.sourceSnapshot.profiles);
  assert.equal(data.marketConfig.concurrentNote, "keep me");
  assert.equal(data.families.family_concurrent.name, "并发家族");
});

test("rollback conflict fails closed without overwriting a third profile state", () => {
  const plan = buildBatchProfileMigration(completeSnapshot());
  let data = structuredClone(plan.sourceSnapshot);
  let saveCount = 0;
  const store = {
    save(value) {
      saveCount += 1;
      data = structuredClone(value);
      data.profiles.player_batch.profile.stoneCoins = 999999;
    },
    load() { return structuredClone(data); },
  };

  assert.throws(
    () => applyBatchProfileMigration(store, plan, {backupPath: "/tmp/before.json"}),
    (error) => error.code === "batch_profile_migration_rollback_conflict",
  );
  assert.equal(saveCount, 1);
  assert.equal(data.profiles.player_batch.profile.stoneCoins, 999999);
});

function applyArgs(plan) {
  return {
    apply: true,
    maintenanceConfirmed: true,
    expectSourceDigest: plan.sourceDigest,
    expectPlanDigest: plan.planDigest,
  };
}

function completeSnapshot() {
  return {
    schemaVersion: 1,
    accounts: {
      batchuser: {
        accountId: "acc_batch",
        username: "batchuser",
        displayName: "批量用户",
        passwordHash: "password-secret",
      },
    },
    sessions: {},
    profileBindings: {
      acc_batch: {
        accountId: "acc_batch",
        playerId: "player_batch",
        profileRevision: 7,
        updatedAt: NOW,
      },
    },
    profiles: {
      player_batch: {
        playerId: "player_batch",
        accountId: "acc_batch",
        profileRevision: 7,
        updatedAt: NOW,
        profile: {
          schemaVersion: 1,
          player: {name: "批量迁移测试员", level: 20},
          stoneCoins: 1234,
        },
      },
    },
    mailMessages: {},
    marketListings: {},
    consumedEquipmentEnvelopes: {},
    marketConfig: {taxBps: 500},
    offlineHangConfig: {rewardRateBps: 5000},
    parties: {},
    partyInvites: {},
    families: {},
    manors: {},
    manorWars: [],
    manorBattles: [],
    chatMessages: [],
    battleRecords: [],
    battleTrace: [],
    gmUserGrants: {},
    gmCommandGrants: {},
    gmCommandAudit: [],
    authEvents: [],
    serviceEventSeq: 0,
    serviceEvents: [],
    playerPositions: {},
    battleInvites: {},
    battleRooms: {},
    tradeOffers: {},
  };
}
