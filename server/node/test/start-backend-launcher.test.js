"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const {spawn, execFileSync} = require("node:child_process");
const test = require("node:test");

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SOURCE_LAUNCHER = path.resolve(REPO_ROOT, "start-backend.command");
const SOURCE_OPS = path.resolve(REPO_ROOT, "server/node/scripts/server-ops.js");

test("interactive launcher owns one backend and waits for graceful shutdown", async (t) => {
  const fixture = await createFixture({shutdownDelayMs: 1200});
  t.after(() => fixture.cleanup());
  const controller = fixture.startController();

  const state = await fixture.waitForState();
  await fixture.waitForHealthy();
  assert.equal(state.tty, "");
  assert.equal(fileMode(fixture.localDir), 0o700);
  assert.equal(fileMode(fixture.stateFile), 0o600);
  assert.equal(fileMode(fixture.logFile), 0o600);

  const stoppingAt = Date.now();
  process.kill(state.launcherPid, "SIGTERM");
  await fixture.waitForStopped();
  await waitFor(() => !processAlive(state.backendPid), 5000, "backend process exit");
  await waitForExit(controller);
  assert.ok(Date.now() - stoppingAt >= 1000, "launcher must wait for the backend drain");
  assert.equal(fs.existsSync(fixture.pidFile), false);
  assert.equal(fs.existsSync(fixture.stateFile), false);
  assert.equal(fs.existsSync(fixture.lockDir), false);
});

test("a second controller serially replaces the first without overlapping backends", async (t) => {
  const fixture = await createFixture({shutdownDelayMs: 600});
  t.after(() => fixture.cleanup());
  const firstController = fixture.startController();
  const first = await fixture.waitForState();
  await fixture.waitForHealthy();

  const secondController = fixture.startController();
  const second = await waitFor(async () => {
    const current = fixture.readState();
    return current && current.launcherPid !== first.launcherPid ? current : null;
  }, 12000, "replacement controller state");
  await fixture.waitForHealthy();

  assert.notEqual(second.backendPid, first.backendPid);
  await waitFor(() => !processAlive(first.launcherPid), 5000, "old launcher exit");
  await waitFor(() => !processAlive(first.backendPid), 5000, "old backend exit");
  assert.deepEqual(listenerPids(fixture.port), [second.backendPid]);

  process.kill(second.launcherPid, "SIGTERM");
  await fixture.waitForStopped();
  await Promise.all([waitForExit(firstController), waitForExit(secondController)]);
});

test("a zsh command that only mentions the launcher path is never treated as an old controller", async (t) => {
  const fixture = await createFixture({shutdownDelayMs: 300});
  t.after(() => fixture.cleanup());
  const signalFile = path.join(fixture.root, "decoy-signal.txt");
  const readyFile = path.join(fixture.root, "decoy-ready.txt");
  const decoy = spawn("/bin/zsh", [
    "-c",
    "trap 'print TERM > \"$1\"; exit 0' TERM; print READY > \"$2\"; sleep 30",
    fixture.launcher,
    signalFile,
    readyFile,
  ], {
    cwd: fixture.root,
    stdio: "ignore",
  });
  t.after(async () => {
    if (processAlive(decoy.pid)) {
      decoy.kill("SIGKILL");
    }
    await waitForExit(decoy).catch(() => {});
  });
  await waitFor(() => fs.existsSync(readyFile), 3000, "decoy shell readiness");

  const controller = fixture.startController();
  const state = await fixture.waitForState();
  await fixture.waitForHealthy();

  assert.equal(processAlive(decoy.pid), true);
  assert.equal(fs.existsSync(signalFile), false);

  process.kill(state.launcherPid, "SIGTERM");
  await fixture.waitForStopped();
  await waitForExit(controller);
});

test("startup interruption cannot leave a detached backend or launcher lock", async (t) => {
  const fixture = await createFixture({healthDelayMs: 5000, shutdownDelayMs: 300});
  t.after(() => fixture.cleanup());
  const controller = fixture.startController();

  const backendPid = await waitFor(() => fixture.readPid(), 8000, "spawned backend pid");
  assert.equal(fs.existsSync(fixture.stateFile), false);
  const launcherPid = await waitFor(
    () => launcherPidForPath(fixture.launcher),
    3000,
    "launcher pid during health wait",
  );
  process.kill(launcherPid, "SIGTERM");

  await waitFor(() => !processAlive(backendPid), 8000, "startup backend cleanup");
  await waitFor(() => !fs.existsSync(fixture.lockDir), 3000, "startup lock cleanup");
  assert.equal(fs.existsSync(fixture.pidFile), false);
  assert.equal(fs.existsSync(fixture.stateFile), false);
  await waitForExit(controller);
});

test("an external backend replacement is never killed by the old controller", async (t) => {
  const fixture = await createFixture({shutdownDelayMs: 300});
  t.after(() => fixture.cleanup());
  const controller = fixture.startController();
  const original = await fixture.waitForState();
  await fixture.waitForHealthy();

  const restarted = await runOpsPath(fixture.opsPath, fixture.root, "restart");
  assert.equal(restarted.code, 0, restarted.output);
  const replacementPid = await waitFor(() => {
    const pid = fixture.readPid();
    return pid > 1 && pid !== original.backendPid ? pid : 0;
  }, 5000, "external replacement pid");
  await fixture.waitForHealthy();
  await waitFor(() => !fs.existsSync(fixture.stateFile), 5000, "old controller state cleanup");

  assert.equal(processAlive(original.backendPid), false);
  assert.equal(processAlive(replacementPid), true);
  assert.deepEqual(listenerPids(fixture.port), [replacementPid]);
  const launcherPid = launcherPidForPath(fixture.launcher);
  if (launcherPid) {
    process.kill(launcherPid, "SIGKILL");
  }
  controller.kill("SIGKILL");
  await waitForExit(controller);
  assert.equal(processAlive(replacementPid), true);
});

test("non-interactive mode restarts once and leaves no controller state", async (t) => {
  const fixture = await createFixture();
  t.after(() => fixture.cleanup());

  const result = await runExecutable(fixture.launcher, [], fixture.root, {
    BEASTBOUND_NO_PAUSE: "1",
  });
  assert.equal(result.code, 0, result.output);
  const backendPid = fixture.readPid();
  assert.ok(backendPid > 1);
  await fixture.waitForHealthy();
  assert.equal(fs.existsSync(fixture.stateFile), false);
  assert.equal(fs.existsSync(fixture.lockDir), false);
  assert.deepEqual(listenerPids(fixture.port), [backendPid]);

  const stopped = await runOpsPath(fixture.opsPath, fixture.root, "stop");
  assert.equal(stopped.code, 0, stopped.output);
  await fixture.waitForStopped();
});

async function createFixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-launcher-test-"));
  const serverRoot = path.join(root, "server/node");
  const scriptsDir = path.join(serverRoot, "scripts");
  const srcDir = path.join(serverRoot, "src");
  const localDir = path.join(serverRoot, ".local");
  fs.mkdirSync(scriptsDir, {recursive: true});
  fs.mkdirSync(srcDir, {recursive: true});
  fs.mkdirSync(localDir, {recursive: true, mode: 0o700});
  const port = await unusedPort();
  const launcher = path.join(root, "start-backend.command");
  const opsPath = path.join(scriptsDir, "server-ops.js");
  const pidFile = path.join(localDir, "server.pid");
  const stateFile = path.join(localDir, "backend-console.state");
  const lockDir = path.join(localDir, "backend-console.lock");
  const logFile = path.join(localDir, "dev-server.log");
  fs.copyFileSync(SOURCE_LAUNCHER, launcher);
  fs.chmodSync(launcher, 0o755);
  fs.copyFileSync(SOURCE_OPS, opsPath);
  fs.writeFileSync(path.join(serverRoot, "package.json"), JSON.stringify({
    name: "beastbound-launcher-fixture",
    private: true,
    scripts: {ops: "node scripts/server-ops.js"},
  }));
  fs.writeFileSync(path.join(localDir, "mysql.env"), [
    "export BEASTBOUND_AUTH_HOST='127.0.0.1'",
    `export BEASTBOUND_AUTH_PORT='${port}'`,
    "export BEASTBOUND_MYSQL_HOST='127.0.0.1'",
    "export BEASTBOUND_MYSQL_PORT='1'",
    "export BEASTBOUND_MYSQL_USER='launcher_test'",
    "export BEASTBOUND_MYSQL_PASSWORD=''",
    "export BEASTBOUND_MYSQL_DATABASE='launcher_test'",
    `export TEST_HEALTH_DELAY_MS='${Number(options.healthDelayMs || 0)}'`,
    `export TEST_SHUTDOWN_DELAY_MS='${Number(options.shutdownDelayMs || 0)}'`,
    "",
  ].join("\n"), {mode: 0o600});
  fs.writeFileSync(path.join(srcDir, "http-server.js"), fakeServerSource(), {mode: 0o600});

  const controllers = new Set();
  return {
    root,
    serverRoot,
    localDir,
    launcher,
    opsPath,
    pidFile,
    stateFile,
    lockDir,
    logFile,
    port,
    startController() {
      const child = spawn("/usr/bin/script", ["-q", "/dev/null", launcher], {
        cwd: root,
        env: {...process.env, HOME: os.homedir()},
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.output = "";
      child.stdout.on("data", (chunk) => { child.output += chunk.toString("utf8"); });
      child.stderr.on("data", (chunk) => { child.output += chunk.toString("utf8"); });
      controllers.add(child);
      child.once("exit", () => controllers.delete(child));
      return child;
    },
    readPid() {
      if (!fs.existsSync(pidFile)) {
        return 0;
      }
      const pid = Number(fs.readFileSync(pidFile, "utf8").trim() || 0);
      return Number.isSafeInteger(pid) && pid > 1 ? pid : 0;
    },
    readState() {
      if (!fs.existsSync(stateFile)) {
        return null;
      }
      const [launcherPid, tty, token, backendPid, ...fingerprint] = fs
        .readFileSync(stateFile, "utf8").trimEnd().split("|");
      if (!launcherPid || !token || !backendPid || fingerprint.length === 0) {
        return null;
      }
      return {
        launcherPid: Number(launcherPid),
        tty,
        token,
        backendPid: Number(backendPid),
        fingerprint: fingerprint.join("|"),
      };
    },
    waitForState() {
      return waitFor(() => this.readState(), 10000, "controller state");
    },
    waitForHealthy() {
      return waitFor(() => requestHealth(port), 10000, "fixture health");
    },
    waitForStopped() {
      return waitFor(async () => {
        const health = await requestHealth(port);
        return listenerPids(port).length === 0 && !health ? true : null;
      }, 10000, "fixture shutdown");
    },
    async cleanup() {
      for (const child of controllers) {
        try { child.kill("SIGKILL"); } catch {}
      }
      const pids = new Set([...listenerPids(port), this.readPid()]);
      const state = this.readState();
      if (state) {
        pids.add(state.launcherPid);
        pids.add(state.backendPid);
      }
      const launcherPid = launcherPidForPath(launcher);
      if (launcherPid) {
        pids.add(launcherPid);
      }
      for (const pid of pids) {
        if (pid > 1 && processAlive(pid)) {
          try { process.kill(pid, "SIGKILL"); } catch {}
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
      fs.rmSync(root, {recursive: true, force: true});
    },
  };
}

function fakeServerSource() {
  return `"use strict";
const fs = require("node:fs");
const http = require("node:http");
const port = Number(process.env.BEASTBOUND_AUTH_PORT);
const healthAt = Date.now() + Number(process.env.TEST_HEALTH_DELAY_MS || 0);
const shutdownDelay = Number(process.env.TEST_SHUTDOWN_DELAY_MS || 0);
const server = http.createServer((req, res) => {
  if (req.url !== "/health") { res.writeHead(404).end(); return; }
  const ok = Date.now() >= healthAt;
  res.writeHead(ok ? 200 : 503, {"content-type": "application/json"});
  res.end(JSON.stringify({ok, service: "beastbound-auth", storage: {ok}}));
});
server.listen(port, "127.0.0.1");
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  server.close();
  setTimeout(() => process.exit(0), shutdownDelay);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
setInterval(() => {}, 1000).unref();
`;
}

function runOpsPath(opsPath, cwd, command) {
  return runExecutable(process.execPath, [opsPath, command], cwd);
}

function runExecutable(command, args, cwd, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {...process.env, ...env},
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { output += chunk.toString("utf8"); });
    child.once("error", reject);
    child.once("exit", (code) => resolve({code: Number(code || 0), output}));
  });
}

async function unusedPort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function requestHealth(port) {
  return new Promise((resolve) => {
    const request = http.get({host: "127.0.0.1", port, path: "/health", timeout: 250}, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          resolve(body.ok === true && body.service === "beastbound-auth" && body.storage.ok === true);
        } catch {
          resolve(false);
        }
      });
    });
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(false));
  });
}

function listenerPids(port) {
  try {
    const output = execFileSync("lsof", [
      "-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t",
    ], {encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]});
    return [...new Set(output.split(/\s+/).map(Number).filter((pid) => pid > 1))].sort((a, b) => a - b);
  } catch {
    return [];
  }
}

function launcherPidForPath(launcherPath) {
  try {
    const output = execFileSync("pgrep", ["-f", launcherPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    for (const pid of output.split(/\s+/).map(Number).filter((value) => value > 1)) {
      const command = execFileSync("ps", ["-ww", "-p", String(pid), "-o", "command="], {
        encoding: "utf8",
      });
      if (command.includes("zsh") && command.includes(launcherPath)) {
        return pid;
      }
    }
  } catch {}
  return 0;
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function fileMode(filePath) {
  return fs.statSync(filePath).mode & 0o777;
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`child did not exit: ${child.output}`)), 5000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function waitFor(check, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
}
