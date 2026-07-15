"use strict";

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const {spawn, spawnSync, execFileSync} = require("node:child_process");

const repoRoot = path.resolve(__dirname, "../../..");
const serverRoot = path.resolve(repoRoot, "server/node");
const localDir = path.resolve(serverRoot, ".local");
const envPath = path.resolve(localDir, "mysql.env");
const pidPath = path.resolve(localDir, "server.pid");
const logPath = path.resolve(localDir, "dev-server.log");
const backupDir = path.resolve(localDir, "backups");
const GRACEFUL_DRAIN_MS = 15_000;
const FORCE_KILL_AFTER_MS = GRACEFUL_DRAIN_MS + 2_500;
const STOP_HARD_DEADLINE_MS = 20_000;
const STOP_POLL_MS = 200;

async function main() {
  const command = String(process.argv[2] || "status").trim().toLowerCase();
  const env = loadRuntimeEnv();
  if (command === "start") {
    await startServer(env);
  } else if (command === "stop") {
    await stopServer({env});
  } else if (command === "restart") {
    await restartServer(env);
  } else if (command === "backup") {
    backupMysql(env);
  } else if (command === "status") {
    await printStatus(env);
  } else {
    throw new Error("Usage: node scripts/server-ops.js start|stop|restart|status|backup");
  }
}

async function restartServer(env) {
  const stopped = await stopServer({"quiet": true, env});
  await waitForPortFree(env);
  fs.rmSync(pidPath, {"force": true});
  console.log(JSON.stringify({"ok": true, "restarting": true, "stoppedPids": stopped.pids}, null, 2));
  await startServer(env);
}

async function startServer(env) {
  fs.mkdirSync(localDir, {"recursive": true});
  const existingPid = readPid();
  const existingProcess = trustedServerProcess(existingPid);
  const listenerPids = portListenerPids(env);
  const trustedListeners = listenerPids
    .map((pid) => trustedServerProcess(pid))
    .filter(Boolean);
  if (listenerPids.length > 0) {
    if (listenerPids.length !== 1 || trustedListeners.length !== 1) {
      throw new Error(`Configured backend port is occupied by a process that is not a verified Beastbound backend (pids: ${listenerPids.join(", ")}).`);
    }
    const listener = trustedListeners[0];
    if (existingProcess && existingProcess.pid !== listener.pid) {
      throw new Error(`Pid file and configured backend port refer to different verified Beastbound processes (${existingProcess.pid} and ${listener.pid}).`);
    }
    writePid(listener.pid);
    console.log(JSON.stringify({
      "ok": true,
      "alreadyRunning": true,
      "recoveredPidFile": existingPid !== listener.pid,
      "pid": listener.pid,
      "url": publicUrl(env),
    }, null, 2));
    return;
  }
  if (existingProcess) {
    throw new Error(`Verified Beastbound backend pid ${existingProcess.pid} is alive but is not listening on the configured port; refusing to overwrite its pid file.`);
  }
  fs.rmSync(pidPath, {"force": true});
  const logFd = fs.openSync(logPath, "a");
  try {
    const child = spawn(process.execPath, ["src/http-server.js"], {
      cwd: serverRoot,
      env: {...process.env, ...env},
      detached: true,
      stdio: ["ignore", logFd, logFd],
    });
    writePid(child.pid);
    child.unref();
    console.log(JSON.stringify({"ok": true, "started": true, "pid": child.pid, "url": publicUrl(env), "logPath": logPath}, null, 2));
  } finally {
    fs.closeSync(logFd);
  }
}

async function stopServer(options = {}) {
  const env = options.env || loadRuntimeEnv();
  const pid = readPid();
  const candidatePids = Array.from(new Set([
    pid,
    ...portListenerPids(env),
  ].map(Number).filter((value) => value > 1)));
  const processes = candidatePids
    .map((candidatePid) => trustedServerProcess(candidatePid))
    .filter(Boolean);
  const pids = processes.map((entry) => entry.pid);
  if (processes.length <= 0) {
    fs.rmSync(pidPath, {"force": true});
    if (!options.quiet) {
      console.log(JSON.stringify({
        "ok": true,
        "stopped": false,
        "message": candidatePids.length > 0
          ? "No verified Beastbound backend process was found; unrelated processes were not signalled."
          : "No verified Beastbound backend process was found.",
      }, null, 2));
    }
    return {"ok": true, "stopped": false, pids};
  }
  const signalled = processes.filter((entry) => signalSameServerProcess(entry, "SIGTERM"));
  if (signalled.length > 0) {
    await waitForServerProcessesToExit(signalled);
  }
  fs.rmSync(pidPath, {"force": true});
  if (!options.quiet) {
    console.log(JSON.stringify({"ok": true, "stopped": signalled.length > 0, "pids": signalled.map((entry) => entry.pid)}, null, 2));
  }
  return {"ok": true, "stopped": signalled.length > 0, "pids": signalled.map((entry) => entry.pid)};
}

async function waitForServerProcessesToExit(processes) {
  const startedAt = Date.now();
  let forceKillAttempted = false;
  while (Date.now() - startedAt < STOP_HARD_DEADLINE_MS) {
    const remaining = processes.filter((entry) => sameProcessIdentity(entry));
    if (remaining.length <= 0) {
      return;
    }
    const elapsedMs = Date.now() - startedAt;
    // The real server owns a 15s durable drain deadline. Leave an additional
    // safety gap and only force a process whose start identity, cwd and exact
    // command still match the snapshot captured before SIGTERM.
    if (!forceKillAttempted && elapsedMs >= FORCE_KILL_AFTER_MS) {
      forceKillAttempted = true;
      for (const entry of remaining) {
        signalSameServerProcess(entry, "SIGKILL");
      }
    }
    await sleep(STOP_POLL_MS);
  }
  const remainingPids = processes.filter((entry) => sameProcessIdentity(entry)).map((entry) => entry.pid);
  if (remainingPids.length > 0) {
    throw new Error(`Verified Beastbound backend did not exit within ${STOP_HARD_DEADLINE_MS}ms (pids: ${remainingPids.join(", ")}).`);
  }
}

async function waitForPortFree(env) {
  const deadline = Date.now() + 2_000;
  let listeners = portListenerPids(env);
  while (listeners.length > 0 && Date.now() < deadline) {
    await sleep(100);
    listeners = portListenerPids(env);
  }
  if (listeners.length > 0) {
    throw new Error(`Configured backend port is still occupied; refusing to restart or signal unrelated listeners (pids: ${listeners.join(", ")}).`);
  }
}

function portListenerPids(env) {
  const port = String(env.BEASTBOUND_AUTH_PORT || "8787").trim();
  if (!/^\d+$/.test(port)) {
    return [];
  }
  try {
    const output = execFileSync("lsof", [
      "-nP",
      `-iTCP:${port}`,
      "-sTCP:LISTEN",
      "-t",
    ], {"encoding": "utf8", "stdio": ["ignore", "pipe", "ignore"]});
    return Array.from(new Set(output
      .split(/\s+/)
      .map((value) => Number(value || 0))
      .filter((value) => value > 0)));
  } catch (_error) {
    return [];
  }
}

function trustedServerProcess(pid) {
  const processInfo = inspectProcess(pid);
  if (!processInfo || canonicalPath(processInfo.cwd) !== canonicalPath(serverRoot)) {
    return null;
  }
  const commandMatch = processInfo.command.match(/^(\S+)\s+src\/http-server\.js$/);
  if (!commandMatch || path.basename(commandMatch[1]) !== "node") {
    return null;
  }
  return processInfo;
}

function inspectProcess(pid) {
  const normalizedPid = Number(pid || 0);
  if (!Number.isSafeInteger(normalizedPid) || normalizedPid <= 1) {
    return null;
  }
  try {
    const command = execFileSync("ps", [
      "-ww",
      "-p", String(normalizedPid),
      "-o", "command=",
    ], {"encoding": "utf8", "stdio": ["ignore", "pipe", "ignore"]}).trim();
    const startedAt = processStartedAt(normalizedPid);
    const cwd = processCwd(normalizedPid);
    if (!command || !startedAt || !cwd) {
      return null;
    }
    return {pid: normalizedPid, command, startedAt, cwd};
  } catch (_error) {
    return null;
  }
}

function processStartedAt(pid) {
  try {
    return execFileSync("ps", [
      "-ww",
      "-p", String(pid),
      "-o", "lstart=",
    ], {"encoding": "utf8", "stdio": ["ignore", "pipe", "ignore"]}).trim() || "";
  } catch (_error) {
    return "";
  }
}

function processCwd(pid) {
  const procCwdPath = `/proc/${pid}/cwd`;
  try {
    if (fs.existsSync(procCwdPath)) {
      return fs.readlinkSync(procCwdPath);
    }
  } catch (_error) {
    // Fall through to the macOS/BSD lsof path.
  }
  try {
    const output = execFileSync("lsof", [
      "-a",
      "-p", String(pid),
      "-d", "cwd",
      "-Fn",
    ], {"encoding": "utf8", "stdio": ["ignore", "pipe", "ignore"]});
    const cwdLine = output.split(/\r?\n/).find((line) => line.startsWith("n"));
    return cwdLine ? cwdLine.slice(1) : "";
  } catch (_error) {
    return "";
  }
}

function canonicalPath(value) {
  if (!value) {
    return "";
  }
  try {
    return fs.realpathSync.native(value);
  } catch (_error) {
    return path.resolve(value);
  }
}

function sameProcessIdentity(snapshot) {
  return Boolean(snapshot && processStartedAt(snapshot.pid) === snapshot.startedAt);
}

function signalSameServerProcess(snapshot, signal) {
  const current = trustedServerProcess(snapshot && snapshot.pid);
  if (!current || current.startedAt !== snapshot.startedAt) {
    return false;
  }
  try {
    process.kill(current.pid, signal);
    return true;
  } catch (_error) {
    return false;
  }
}

function writePid(pid) {
  const normalizedPid = Number(pid || 0);
  if (!Number.isSafeInteger(normalizedPid) || normalizedPid <= 1) {
    throw new Error("Unable to record an invalid backend pid.");
  }
  fs.mkdirSync(localDir, {"recursive": true});
  const temporaryPath = `${pidPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${normalizedPid}\n`, {"encoding": "utf8", "mode": 0o600});
  fs.renameSync(temporaryPath, pidPath);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function printStatus(env) {
  const pid = readPid();
  const health = await requestHealth(env).catch((error) => ({"ok": false, "error": error.message}));
  const counts = mysqlCounts(env);
  const bindHost = env.BEASTBOUND_AUTH_HOST || "127.0.0.1";
  const wildcardBind = bindHost === "0.0.0.0" || bindHost === "::";
  console.log(JSON.stringify({
    ok: Boolean(health.ok),
    pid: pid || null,
    pidAlive: pid ? processAlive(pid) : false,
    url: publicUrl(env),
    localUrl: `http://127.0.0.1:${env.BEASTBOUND_AUTH_PORT || "8787"}`,
    lanIps: lanIps(),
    exposure: {
      bindHost,
      mode: wildcardBind ? "lan_or_edge" : "local_or_private",
      warning: wildcardBind
        ? "服务正在监听所有网卡；公网部署必须置于TLS反向代理和显式可信代理配置之后。"
        : "",
    },
    health,
    mysql: {
      database: env.BEASTBOUND_MYSQL_DATABASE,
      user: env.BEASTBOUND_MYSQL_USER,
      counts,
    },
  }, null, 2));
}

function backupMysql(env) {
  fs.mkdirSync(backupDir, {"recursive": true});
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const database = env.BEASTBOUND_MYSQL_DATABASE || "beastbound_odyssey";
  const filePath = path.resolve(backupDir, `${database}-${stamp}.sql`);
  const partialPath = `${filePath}.partial-${process.pid}`;
  const authOptionPath = path.resolve(localDir, `.mysqldump-auth-${process.pid}-${Date.now()}.cnf`);
  const dumpPath = process.env.BEASTBOUND_MYSQLDUMP_BIN || "mysqldump";
  let outputFd = null;
  try {
    fs.writeFileSync(
      authOptionPath,
      [
        "[client]",
        `user=${mysqlOptionFileValue(env.BEASTBOUND_MYSQL_USER || "beastbound_app")}`,
        `host=${mysqlOptionFileValue(env.BEASTBOUND_MYSQL_HOST || "127.0.0.1")}`,
        `port=${mysqlPortOptionValue(env.BEASTBOUND_MYSQL_PORT)}`,
        `password=${mysqlOptionFileValue(env.BEASTBOUND_MYSQL_PASSWORD || "")}`,
        "protocol=tcp",
        "",
      ].join("\n"),
      {"encoding": "utf8", "flag": "wx", "mode": 0o600},
    );
    outputFd = fs.openSync(partialPath, "wx", 0o600);
    const result = spawnSync(dumpPath, [
      `--defaults-extra-file=${authOptionPath}`,
      "--skip-lock-tables",
      "--skip-add-locks",
      "--no-tablespaces",
      "--skip-masking-policies",
      "--skip-add-drop-masking-policy",
      "--set-gtid-purged=OFF",
      database,
    ], {
      env: process.env,
      stdio: ["ignore", outputFd, "pipe"],
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    fs.fsyncSync(outputFd);
    fs.closeSync(outputFd);
    outputFd = null;
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(String(result.stderr || `mysqldump exited with status ${result.status}`).trim());
    }
    fs.renameSync(partialPath, filePath);
    fs.chmodSync(filePath, 0o600);
    fs.rmSync(authOptionPath, {"force": true});
    const bytes = fs.statSync(filePath).size;
    console.log(JSON.stringify({"ok": true, "backupPath": filePath, bytes}, null, 2));
  } catch (error) {
    if (outputFd !== null) {
      try { fs.closeSync(outputFd); } catch {}
    }
    fs.rmSync(partialPath, {"force": true});
    fs.rmSync(authOptionPath, {"force": true});
    throw error;
  }
}

function mysqlPortOptionValue(value) {
  const port = String(value || "3306").trim();
  return /^\d{1,5}$/.test(port) ? port : "3306";
}

function mysqlOptionFileValue(value) {
  return `"${String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")}"`;
}

function mysqlCounts(env) {
  try {
    const output = execFileSync(env.BEASTBOUND_MYSQL_BIN || "mysql", [
      "--protocol=tcp",
      "-h", env.BEASTBOUND_MYSQL_HOST || "127.0.0.1",
      "-P", env.BEASTBOUND_MYSQL_PORT || "3306",
      "-u", env.BEASTBOUND_MYSQL_USER || "beastbound_app",
      `-p${env.BEASTBOUND_MYSQL_PASSWORD || ""}`,
      "--batch",
      "--raw",
      "--skip-column-names",
      env.BEASTBOUND_MYSQL_DATABASE || "beastbound_odyssey",
      "-e",
      "SELECT 'accounts', COUNT(*) FROM accounts UNION ALL SELECT 'profiles', COUNT(*) FROM profiles UNION ALL SELECT 'sessions', COUNT(*) FROM sessions UNION ALL SELECT 'families', COUNT(*) FROM families UNION ALL SELECT 'manors', COUNT(*) FROM manors UNION ALL SELECT 'manor_battles', COUNT(*) FROM manor_battles UNION ALL SELECT 'player_positions', COUNT(*) FROM player_positions UNION ALL SELECT 'battle_rooms', COUNT(*) FROM battle_rooms UNION ALL SELECT 'battle_records', COUNT(*) FROM battle_records UNION ALL SELECT 'service_events', COUNT(*) FROM service_events;",
    ], {"encoding": "utf8", "stdio": ["ignore", "pipe", "pipe"]});
    const counts = {};
    for (const line of output.trim().split(/\r?\n/)) {
      const [key, value] = line.split(/\t/);
      if (key) {
        counts[key] = Number(value || 0);
      }
    }
    counts.manor_wars = mysqlTableCount(env, "manor_wars");
    return counts;
  } catch (error) {
    return {"error": error.message};
  }
}

function mysqlTableCount(env, tableName) {
  try {
    const output = execFileSync(env.BEASTBOUND_MYSQL_BIN || "mysql", [
      "--protocol=tcp",
      "-h", env.BEASTBOUND_MYSQL_HOST || "127.0.0.1",
      "-P", env.BEASTBOUND_MYSQL_PORT || "3306",
      "-u", env.BEASTBOUND_MYSQL_USER || "beastbound_app",
      `-p${env.BEASTBOUND_MYSQL_PASSWORD || ""}`,
      "--batch",
      "--raw",
      "--skip-column-names",
      env.BEASTBOUND_MYSQL_DATABASE || "beastbound_odyssey",
      "-e",
      `SELECT COUNT(*) FROM ${tableName};`,
    ], {"encoding": "utf8", "stdio": ["ignore", "pipe", "pipe"]});
    return Number(output.trim() || 0);
  } catch (_error) {
    return 0;
  }
}

function requestHealth(env) {
  const port = Number(env.BEASTBOUND_AUTH_PORT || 8787);
  return new Promise((resolve, reject) => {
    const req = http.request({"host": "127.0.0.1", port, "path": "/health", "method": "GET", "timeout": 1500}, (res) => {
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
    req.on("timeout", () => {
      req.destroy(new Error("health timeout"));
    });
    req.on("error", reject);
    req.end();
  });
}

function publicUrl(env) {
  const host = env.BEASTBOUND_AUTH_HOST || "127.0.0.1";
  const port = env.BEASTBOUND_AUTH_PORT || "8787";
  if (host === "0.0.0.0") {
    const ip = lanIps()[0] || "127.0.0.1";
    return `http://${ip}:${port}`;
  }
  return `http://${host}:${port}`;
}

function lanIps() {
  const result = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) {
        result.push(entry.address);
      }
    }
  }
  return result;
}

function loadRuntimeEnv() {
  const env = {};
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) {
        continue;
      }
      env[match[1]] = unquoteShellValue(match[2].trim());
    }
  }
  return {
    ...env,
    BEASTBOUND_AUTH_STORE: env.BEASTBOUND_AUTH_STORE || "mysql",
    BEASTBOUND_AUTH_HOST: env.BEASTBOUND_AUTH_HOST || "127.0.0.1",
    BEASTBOUND_AUTH_PORT: env.BEASTBOUND_AUTH_PORT || "8787",
  };
}

function readPid() {
  if (!fs.existsSync(pidPath)) {
    return 0;
  }
  return Number(fs.readFileSync(pidPath, "utf8").trim() || 0);
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function unquoteShellValue(value) {
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/'\\''/g, "'");
  }
  if (value.startsWith("\"") && value.endsWith("\"")) {
    return value.slice(1, -1).replace(/\\"/g, "\"");
  }
  return value;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
