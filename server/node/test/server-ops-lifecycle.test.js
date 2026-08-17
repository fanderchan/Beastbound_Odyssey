"use strict";

const assert = require("node:assert/strict");
const {spawn, execFile, execFileSync} = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const SOURCE_OPS_PATH = path.resolve(__dirname, "../scripts/server-ops.js");
const SOURCE_BACKUP_ARTIFACT_PATH = path.resolve(__dirname, "../src/mysql-backup-artifact.js");
const SOURCE_BACKUP_HEALTH_PATH = path.resolve(__dirname, "../src/mysql-backup-health.js");

test("restart never signals an unrelated listener even when its health endpoint reports ok", {timeout: 20_000}, async (t) => {
  const fixture = await createFixture(t);
  const externalScript = path.resolve(fixture.root, "external-health.js");
  fs.writeFileSync(externalScript, fakeExternalHealthSource(), "utf8");
  const external = spawnDetached(process.execPath, [externalScript], {
    cwd: fixture.root,
    env: {...process.env, TEST_PORT: String(fixture.port)},
  });
  fixture.track(external.pid);
  await waitForHealth(fixture.port);

  const stopped = await runOps(fixture, "stop");
  assert.equal(stopped.code, 0, stopped.stdout + stopped.stderr);
  assert.equal(processAlive(external.pid), true);

  const result = await runOps(fixture, "restart");

  assert.equal(result.code, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /not a verified Beastbound backend|occupied/i);
  assert.equal(processAlive(external.pid), true);
  assert.equal((await requestHealth(fixture.port)).ok, true);
});

test("restart ignores a reused pid that belongs to a sleeper", {timeout: 20_000}, async (t) => {
  const fixture = await createFixture(t);
  const sleeperScript = path.resolve(fixture.root, "sleeper.js");
  const signalMarker = path.resolve(fixture.root, "sleeper-signals.log");
  fs.writeFileSync(sleeperScript, [
    '"use strict";',
    'const fs = require("node:fs");',
    'const marker = process.env.TEST_SIGNAL_MARKER;',
    'process.on("SIGTERM", () => fs.appendFileSync(marker, "SIGTERM\\n"));',
    'setInterval(() => undefined, 1000);',
    "",
  ].join("\n"), "utf8");
  const sleeper = spawnDetached(process.execPath, [sleeperScript], {
    cwd: fixture.root,
    env: {...process.env, TEST_SIGNAL_MARKER: signalMarker},
  });
  fixture.track(sleeper.pid);
  fs.writeFileSync(fixture.pidPath, `${sleeper.pid}\n`, "utf8");

  const result = await runOps(fixture, "restart");
  assert.equal(result.code, 0, result.stdout + result.stderr);
  await waitForHealth(fixture.port);
  fixture.track(readPid(fixture.pidPath));

  assert.equal(processAlive(sleeper.pid), true);
  assert.equal(fs.existsSync(signalMarker), false);
  assert.notEqual(readPid(fixture.pidPath), sleeper.pid);
});

test("stop gives a backend four seconds to drain instead of killing it early", {timeout: 20_000}, async (t) => {
  const fixture = await createFixture(t, {shutdownDelayMs: 4_000});
  const start = await runOps(fixture, "start");
  assert.equal(start.code, 0, start.stdout + start.stderr);
  const backendPid = readPid(fixture.pidPath);
  fixture.track(backendPid);
  await waitForHealth(fixture.port);

  const startedAt = Date.now();
  const stopped = await runOps(fixture, "stop", {timeout: 12_000});
  const elapsedMs = Date.now() - startedAt;

  assert.equal(stopped.code, 0, stopped.stdout + stopped.stderr);
  assert.ok(elapsedMs >= 3_700, `stop returned after only ${elapsedMs}ms`);
  assert.ok(elapsedMs < 10_000, `stop took ${elapsedMs}ms`);
  assert.equal(processAlive(backendPid), false);
  assert.match(fs.readFileSync(fixture.signalMarker, "utf8"), new RegExp(`SIGTERM ${backendPid}`));
  assert.match(fs.readFileSync(fixture.signalMarker, "utf8"), new RegExp(`EXIT ${backendPid}`));
  await assert.rejects(requestHealth(fixture.port));
});

test("start recovers a missing pid for the verified service and restart waits for its exit", {timeout: 20_000}, async (t) => {
  const fixture = await createFixture(t, {shutdownDelayMs: 500});
  const started = await runOps(fixture, "start");
  assert.equal(started.code, 0, started.stdout + started.stderr);
  const firstPid = readPid(fixture.pidPath);
  fixture.track(firstPid);
  await waitForHealth(fixture.port);

  fs.rmSync(fixture.pidPath, {force: true});
  const recovered = await runOps(fixture, "start");
  assert.equal(recovered.code, 0, recovered.stdout + recovered.stderr);
  assert.equal(readPid(fixture.pidPath), firstPid);
  assert.equal(processAlive(firstPid), true);

  const restarted = await runOps(fixture, "restart");
  assert.equal(restarted.code, 0, restarted.stdout + restarted.stderr);
  const secondPid = readPid(fixture.pidPath);
  fixture.track(secondPid);
  await waitForHealth(fixture.port);

  assert.notEqual(secondPid, firstPid);
  assert.equal(processAlive(firstPid), false);
  assert.equal(processAlive(secondPid), true);
});

test("backup creates a private single-transaction artifact and digest manifest", {timeout: 20_000}, async (t) => {
  const fixture = await createFixture(t);
  const fakeDump = path.resolve(fixture.root, "fake-mysqldump.js");
  const argsPath = path.resolve(fixture.root, "mysqldump-args.json");
  fs.writeFileSync(fakeDump, [
    "#!/usr/bin/env node",
    '"use strict";',
    'const fs = require("node:fs");',
    'fs.writeFileSync(process.env.TEST_DUMP_ARGS_PATH, JSON.stringify(process.argv.slice(2)));',
    'process.stdout.write("CREATE TABLE sample (id INT PRIMARY KEY);\\nINSERT INTO sample VALUES (1);\\n");',
    "",
  ].join("\n"), {encoding: "utf8", mode: 0o700});
  fs.chmodSync(fakeDump, 0o700);

  const result = await runOps(fixture, "backup", {
    env: {
      BEASTBOUND_MYSQLDUMP_BIN: fakeDump,
      TEST_DUMP_ARGS_PATH: argsPath,
    },
  });
  assert.equal(result.code, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  const args = JSON.parse(fs.readFileSync(argsPath, "utf8"));
  assert.equal(report.ok, true);
  assert.match(report.sha256, /^[a-f0-9]{64}$/);
  assert.equal(report.consistency, "mysql_innodb_single_transaction_v1");
  assert.equal(args.includes("--single-transaction"), true);
  assert.equal(args.includes("--quick"), true);
  assert.equal(args.includes("--skip-lock-tables"), true);
  assert.equal(args.includes("--default-character-set=utf8mb4"), true);
  assert.equal(fs.statSync(report.backupPath).mode & 0o777, 0o600);
  assert.equal(fs.statSync(report.manifestPath).mode & 0o777, 0o600);
  assert.equal(fs.existsSync(path.resolve(fixture.serverRoot, ".local", path.basename(args[0].split("=")[1]))), false);
});

test("backup never overwrites an artifact created in the same timestamp bucket", {timeout: 20_000}, async (t) => {
  const fixture = await createFixture(t);
  const fixedDate = path.resolve(fixture.root, "fixed-date.js");
  const fakeDump = path.resolve(fixture.root, "fake-mysqldump.js");
  fs.writeFileSync(fixedDate, [
    '"use strict";',
    "const NativeDate = Date;",
    "global.Date = class FixedDate extends NativeDate {",
    "  constructor(...args) { super(...(args.length === 0 ? ['2026-08-17T01:02:03.456Z'] : args)); }",
    "  static now() { return NativeDate.parse('2026-08-17T01:02:03.456Z'); }",
    "};",
    "",
  ].join("\n"), "utf8");
  fs.writeFileSync(fakeDump, [
    "#!/usr/bin/env node",
    '"use strict";',
    'process.stdout.write(`${process.env.TEST_DUMP_BODY}\\n`);',
    "",
  ].join("\n"), {encoding: "utf8", mode: 0o700});
  fs.chmodSync(fakeDump, 0o700);
  const commonEnv = {
    BEASTBOUND_MYSQLDUMP_BIN: fakeDump,
    NODE_OPTIONS: `--require=${fixedDate}`,
  };

  const first = await runOps(fixture, "backup", {env: {...commonEnv, TEST_DUMP_BODY: "first"}});
  assert.equal(first.code, 0, first.stdout + first.stderr);
  const firstReport = JSON.parse(first.stdout);
  const beforeDump = fs.readFileSync(firstReport.backupPath);
  const beforeManifest = fs.readFileSync(firstReport.manifestPath);

  const second = await runOps(fixture, "backup", {env: {...commonEnv, TEST_DUMP_BODY: "second"}});
  assert.equal(second.code, 1, second.stdout + second.stderr);
  assert.match(second.stderr, /EEXIST/);
  assert.deepEqual(fs.readFileSync(firstReport.backupPath), beforeDump);
  assert.deepEqual(fs.readFileSync(firstReport.manifestPath), beforeManifest);
});

test("restore drill does not read configured player database credentials", {timeout: 20_000}, async (t) => {
  const fixture = await createFixture(t);
  const envPath = path.resolve(fixture.serverRoot, ".local/mysql.env");
  fs.rmSync(envPath);
  fs.mkdirSync(envPath);
  const toolsDir = path.resolve(fixture.root, "tools");
  fs.mkdirSync(toolsDir, {recursive: true});
  fs.writeFileSync(path.resolve(toolsDir, "run_mysql_backup_restore_drill.mjs"), "process.exit(0);\n", "utf8");

  const result = await runOps(fixture, "restore-drill");
  assert.equal(result.code, 0, result.stdout + result.stderr);
});

test("backup status uses explicit freshness policy without reading player database credentials", {timeout: 20_000}, async (t) => {
  const fixture = await createFixture(t);
  const fakeDump = path.resolve(fixture.root, "fake-mysqldump.js");
  fs.writeFileSync(fakeDump, [
    "#!/usr/bin/env node",
    'process.stdout.write("CREATE TABLE sample (id INT PRIMARY KEY);\\n");',
    "",
  ].join("\n"), {encoding: "utf8", mode: 0o700});
  fs.chmodSync(fakeDump, 0o700);
  const backupResult = await runOps(fixture, "backup", {
    env: {BEASTBOUND_MYSQLDUMP_BIN: fakeDump},
  });
  assert.equal(backupResult.code, 0, backupResult.stdout + backupResult.stderr);
  const backupReport = JSON.parse(backupResult.stdout);
  const {verifyMysqlBackupArtifact} = require(SOURCE_BACKUP_ARTIFACT_PATH);
  const {writeMysqlRestoreReceipt} = require(SOURCE_BACKUP_HEALTH_PATH);
  const artifact = verifyMysqlBackupArtifact(backupReport.backupPath);
  writeMysqlRestoreReceipt(successfulRestoreReport(artifact), artifact, {
    completedAt: new Date().toISOString(),
  });

  const envPath = path.resolve(fixture.serverRoot, ".local/mysql.env");
  fs.rmSync(envPath);
  fs.mkdirSync(envPath);
  const status = await runOps(fixture, "backup-status", {
    args: ["--max-backup-age-hours", "26", "--max-restore-age-hours", "168"],
  });
  assert.equal(status.code, 0, status.stdout + status.stderr);
  const report = JSON.parse(status.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.claims.latestArtifactDigestVerified, true);
  assert.equal(report.claims.latestArtifactHasMatchingRestoreReceipt, true);
  assert.equal(JSON.stringify(report).includes(backupReport.backupPath), false);

  const fixedFutureDate = path.resolve(fixture.root, "fixed-future-date.js");
  fs.writeFileSync(fixedFutureDate, [
    '"use strict";',
    "const NativeDate = Date;",
    "global.Date = class FixedFutureDate extends NativeDate {",
    "  constructor(...args) { super(...(args.length === 0 ? ['2030-08-17T03:30:00.000Z'] : args)); }",
    "  static now() { return NativeDate.parse('2030-08-17T03:30:00.000Z'); }",
    "};",
    "",
  ].join("\n"), "utf8");
  const stale = await runOps(fixture, "backup-status", {
    args: ["--max-backup-age-hours", "26", "--max-restore-age-hours", "168"],
    env: {NODE_OPTIONS: `--require=${fixedFutureDate}`},
  });
  assert.equal(stale.code, 1, stale.stdout + stale.stderr);
  const staleReport = JSON.parse(stale.stdout);
  assert.equal(staleReport.ok, false);
  assert.deepEqual(staleReport.failures, [
    {code: "mysql_backup_stale"},
    {code: "mysql_restore_receipt_stale"},
  ]);

  const missingPolicy = await runOps(fixture, "backup-status", {
    args: ["--max-backup-age-hours", "26"],
  });
  assert.equal(missingPolicy.code, 1, missingPolicy.stdout + missingPolicy.stderr);
  assert.match(missingPolicy.stderr, /必须显式提供/);
});

async function createFixture(t, options = {}) {
  const root = fs.mkdtempSync(path.resolve(os.tmpdir(), "beastbound-server-ops-"));
  const serverRoot = path.resolve(root, "server/node");
  const scriptsDir = path.resolve(serverRoot, "scripts");
  const srcDir = path.resolve(serverRoot, "src");
  const localDir = path.resolve(serverRoot, ".local");
  fs.mkdirSync(scriptsDir, {recursive: true});
  fs.mkdirSync(srcDir, {recursive: true});
  fs.mkdirSync(localDir, {recursive: true});
  fs.copyFileSync(SOURCE_OPS_PATH, path.resolve(scriptsDir, "server-ops.js"));
  fs.copyFileSync(SOURCE_BACKUP_ARTIFACT_PATH, path.resolve(srcDir, "mysql-backup-artifact.js"));
  fs.copyFileSync(SOURCE_BACKUP_HEALTH_PATH, path.resolve(srcDir, "mysql-backup-health.js"));
  fs.writeFileSync(path.resolve(srcDir, "http-server.js"), fakeBackendSource(), "utf8");

  const port = await reservePort();
  const signalMarker = path.resolve(root, "backend-signals.log");
  const envLines = [
    `export BEASTBOUND_AUTH_PORT='${port}'`,
    "export BEASTBOUND_AUTH_HOST='127.0.0.1'",
    "export BEASTBOUND_AUTH_STORE='json'",
    `export TEST_SHUTDOWN_DELAY_MS='${Number(options.shutdownDelayMs || 0)}'`,
    `export TEST_SIGNAL_MARKER='${shellSingleQuote(signalMarker)}'`,
    "",
  ];
  fs.writeFileSync(path.resolve(localDir, "mysql.env"), envLines.join("\n"), {encoding: "utf8", mode: 0o600});

  const trackedPids = new Set();
  const fixture = {
    root,
    serverRoot,
    opsPath: path.resolve(scriptsDir, "server-ops.js"),
    pidPath: path.resolve(localDir, "server.pid"),
    port,
    signalMarker,
    track(pid) {
      if (Number(pid) > 1) {
        trackedPids.add(Number(pid));
      }
    },
  };
  t.after(async () => {
    for (const pid of listenerPids(port)) {
      trackedPids.add(pid);
    }
    for (const pid of trackedPids) {
      terminateForCleanup(pid);
    }
    await waitUntil(() => Array.from(trackedPids).every((pid) => !processAlive(pid)), 3_000).catch(() => undefined);
    fs.rmSync(root, {recursive: true, force: true});
  });
  return fixture;
}

function fakeBackendSource() {
  return [
    '"use strict";',
    'const fs = require("node:fs");',
    'const http = require("node:http");',
    'const port = Number(process.env.BEASTBOUND_AUTH_PORT);',
    'const delayMs = Number(process.env.TEST_SHUTDOWN_DELAY_MS || 0);',
    'const marker = process.env.TEST_SIGNAL_MARKER;',
    'const server = http.createServer((req, res) => {',
    '  res.setHeader("content-type", "application/json");',
    '  res.end(JSON.stringify({ok: true, service: "beastbound-test"}));',
    '});',
    'server.listen(port, "127.0.0.1");',
    'let stopping = false;',
    'process.on("SIGTERM", () => {',
    '  if (stopping) return;',
    '  stopping = true;',
    '  fs.appendFileSync(marker, `SIGTERM ${process.pid}\\n`);',
    '  setTimeout(() => server.close(() => {',
    '    fs.appendFileSync(marker, `EXIT ${process.pid}\\n`);',
    '    process.exit(0);',
    '  }), delayMs);',
    '});',
    "",
  ].join("\n");
}

function fakeExternalHealthSource() {
  return [
    '"use strict";',
    'const http = require("node:http");',
    'http.createServer((_req, res) => {',
    '  res.setHeader("content-type", "application/json");',
    '  res.end(JSON.stringify({ok: true}));',
    '}).listen(Number(process.env.TEST_PORT), "127.0.0.1");',
    "",
  ].join("\n");
}

function runOps(fixture, command, options = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [fixture.opsPath, command, ...(options.args || [])], {
      cwd: fixture.root,
      env: {...process.env, ...(options.env || {})},
      encoding: "utf8",
      timeout: options.timeout || 20_000,
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error && error.killed) {
        reject(error);
        return;
      }
      resolve({code: error ? Number(error.code || 1) : 0, stdout, stderr});
    });
    child.on("error", reject);
  });
}

function successfulRestoreReport(artifact) {
  return {
    status: "PASS",
    kind: "beastbound_mysql_backup_restore_drill",
    schemaVersion: 1,
    backup: {
      database: artifact.manifest.database,
      dumpFile: artifact.manifest.dumpFile,
      bytes: artifact.manifest.bytes,
      sha256: artifact.manifest.sha256,
      consistency: artifact.manifest.consistency.contract,
    },
    restore: {
      engine: "isolated_mysql_logical_restore_and_real_service_smoke",
      mysqlVersion: "9.7.0-test",
      nonDefaultLoopbackPort: true,
      tableCount: 1,
      checkedTableCount: 1,
      schemaDigest: "a".repeat(64),
      persistentAuthorityDigest: "b".repeat(64),
      authorityCounts: {
        accounts: 0,
        sessions: 0,
        profiles: 0,
        characterSlots: 0,
        mutationReceipts: 0,
        activeMail: 0,
        marketListings: 0,
        consumedEquipmentEnvelopes: 0,
        parties: 0,
        families: 0,
        battleRecords: 0,
        serviceEvents: 0,
        storeRevision: 0,
      },
      importElapsedMs: 1,
      totalElapsedMs: 2,
    },
    application: {
      strictStoreLoadPassed: true,
      realHttpServerReadyPassed: true,
      schemaUnchangedAfterStartup: true,
      persistentAuthorityUnchangedAfterStartup: true,
    },
    claims: {
      backupRestorableInIsolatedMysql: true,
      restoreDrillConnectedToSourceDatabase: false,
      sourceDatabaseWritten: false,
      productionRpoRtoProven: false,
    },
    cleanup: {
      restoredServerStopped: true,
      temporaryMysqlStopped: true,
      temporaryStateRemoved: true,
      temporaryPortClosed: true,
    },
  };
}

function spawnDetached(command, args, options) {
  const child = spawn(command, args, {...options, detached: true, stdio: "ignore"});
  child.unref();
  return child;
}

function requestHealth(port) {
  return new Promise((resolve, reject) => {
    const req = http.request({host: "127.0.0.1", port, path: "/health", timeout: 250}, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("health timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function waitForHealth(port) {
  await waitUntil(async () => {
    try {
      return Boolean((await requestHealth(port)).ok);
    } catch {
      return false;
    }
  }, 5_000);
}

async function waitUntil(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`condition not met within ${timeoutMs}ms`);
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function listenerPids(port) {
  try {
    return execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).split(/\s+/).map(Number).filter((pid) => pid > 1);
  } catch {
    return [];
  }
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function terminateForCleanup(pid) {
  if (!processAlive(pid)) {
    return;
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // The isolated fixture process may have already exited.
  }
}

function readPid(pidPath) {
  return Number(fs.readFileSync(pidPath, "utf8").trim());
}

function shellSingleQuote(value) {
  return String(value).replace(/'/g, `'\\''`);
}
