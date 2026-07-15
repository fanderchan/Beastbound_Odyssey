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
    const child = execFile(process.execPath, [fixture.opsPath, command], {
      cwd: fixture.root,
      env: {...process.env},
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
