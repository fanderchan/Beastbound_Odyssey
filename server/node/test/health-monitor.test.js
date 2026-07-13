"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {createHealthMonitor} = require("../src/health-monitor");
const {createAsyncWriteAuthStore} = require("../src/auth-service");
const {createMysqlAuthStore} = require("../src/mysql-store");

test("health monitor probes in the background and serves a stable cached snapshot", async (t) => {
  let probes = 0;
  let fail = false;
  let nowMs = 1000;
  const monitor = createHealthMonitor({
    mode: "isolated",
    async checkHealthAsync() {
      probes += 1;
      if (fail) {
        throw new Error("db.internal.example secret detail");
      }
      return {ok: true};
    },
  }, {
    now: () => nowMs,
    probeIntervalMs: 60_000,
    staleAfterMs: 100,
  });
  t.after(() => monitor.close());

  await monitor.start();
  assert.equal(probes, 1);
  assert.equal(monitor.snapshot().ok, true);
  for (let index = 0; index < 1000; index += 1) {
    assert.equal(monitor.snapshot().ok, true);
  }
  assert.equal(probes, 1);

  fail = true;
  await monitor.refresh();
  assert.equal(probes, 2);
  assert.equal(monitor.snapshot().ok, false);
  assert.equal(Object.hasOwn(monitor.snapshot(), "message"), false);

  fail = false;
  await monitor.refresh();
  assert.equal(monitor.metrics().recoveries, 1);
  nowMs += 101;
  assert.equal(monitor.snapshot().stale, true);
  assert.equal(monitor.snapshot().ok, false);
});

test("async store and MySQL health probes use the non-blocking pool path", async (t) => {
  const queryCalls = [];
  const pool = {
    async query(options) {
      queryCalls.push(options);
      return [[{value: 1}], []];
    },
    async getConnection() {
      throw new Error("health must not reserve a transaction connection");
    },
    async end() {},
  };
  const mysql = createMysqlAuthStore({
    ensureSchema: false,
    usePool: true,
    poolFactory: () => pool,
    database: "isolated_health",
    user: "isolated",
    password: "not-used-by-fake-pool",
  });
  t.after(() => mysql.close());
  const wrapped = createAsyncWriteAuthStore(mysql, {onError: () => {}});
  await wrapped.checkHealthAsync();
  assert.deepEqual(queryCalls, [{sql: "SELECT 1", timeout: 2000}]);
});

test("timed-out mysql child health probes are terminated and one monitor never overlaps them", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-health-child-"));
  const mysqlPath = path.join(tempDir, "hanging-mysql");
  const startedPath = path.join(tempDir, "started.log");
  const killedPath = path.join(tempDir, "killed.log");
  fs.writeFileSync(mysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(${JSON.stringify(startedPath)}, "started\\n");
process.on("SIGTERM", () => {
  fs.appendFileSync(${JSON.stringify(killedPath)}, "killed\\n");
  process.exit(0);
});
setInterval(() => {}, 1000);
`);
  fs.chmodSync(mysqlPath, 0o700);
  const mysql = createMysqlAuthStore({
    mysqlPath,
    usePool: false,
    ensureSchema: false,
    healthProbeTimeoutMs: 500,
    database: "isolated_health_child",
    user: "isolated",
    password: "not-used-by-fake-cli",
  });
  const monitor = createHealthMonitor(mysql, {probeIntervalMs: 60_000, probeTimeoutMs: 1000});
  t.after(async () => {
    monitor.close();
    await mysql.close();
    fs.rmSync(tempDir, {recursive: true, force: true});
  });
  const first = monitor.start();
  const duplicate = monitor.refresh();
  assert.equal(first, duplicate);
  await first;
  const deadline = Date.now() + 2000;
  while (!fs.existsSync(killedPath) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(monitor.snapshot().ok, false);
  assert.equal(fs.readFileSync(startedPath, "utf8").trim().split(/\n/).length, 1);
  assert.equal(fs.readFileSync(killedPath, "utf8").trim(), "killed");
});
