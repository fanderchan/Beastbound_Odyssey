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

async function main() {
  const command = String(process.argv[2] || "status").trim().toLowerCase();
  const env = loadRuntimeEnv();
  if (command === "start") {
    await startServer(env);
  } else if (command === "stop") {
    stopServer();
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
  const stopped = stopServer({"quiet": true, "killPort": true, env});
  await waitForStopped(env, stopped.pids);
  killPortListeners(env);
  if (!(await waitForHealthDown(env))) {
    throw new Error("Unable to stop the existing backend before restart.");
  }
  fs.rmSync(pidPath, {"force": true});
  console.log(JSON.stringify({"ok": true, "restarting": true, "stoppedPids": stopped.pids}, null, 2));
  await startServer(env);
}

async function waitForStopped(env, pids = []) {
  const uniquePids = Array.from(new Set(pids.map((pid) => Number(pid || 0)).filter((pid) => pid > 0)));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const alivePids = uniquePids.filter((pid) => processAlive(pid));
    const health = await requestHealth(env).catch(() => null);
    if (alivePids.length <= 0 && !(health && health.ok)) {
      return true;
    }
    if (attempt === 10) {
      for (const pid of alivePids) {
        try {
          process.kill(pid, "SIGKILL");
        } catch (_error) {
          // The process may have exited between the liveness check and kill.
        }
      }
    }
    await sleep(250);
  }
  return false;
}

async function waitForHealthDown(env) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const health = await requestHealth(env).catch(() => null);
    if (!(health && health.ok)) {
      return true;
    }
    await sleep(250);
  }
  return false;
}

async function startServer(env) {
  fs.mkdirSync(localDir, {"recursive": true});
  const existingPid = readPid();
  if (existingPid && processAlive(existingPid)) {
    console.log(JSON.stringify({"ok": true, "alreadyRunning": true, "pid": existingPid, "url": publicUrl(env)}, null, 2));
    return;
  }
  const existingHealth = await requestHealth(env).catch(() => null);
  if (existingHealth && existingHealth.ok) {
    console.log(JSON.stringify({"ok": true, "alreadyRunning": true, "pid": null, "url": publicUrl(env), "health": existingHealth}, null, 2));
    return;
  }
  const logFd = fs.openSync(logPath, "a");
  const child = spawn(process.execPath, ["src/http-server.js"], {
    cwd: serverRoot,
    env: {...process.env, ...env},
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  fs.writeFileSync(pidPath, `${child.pid}\n`);
  child.unref();
  console.log(JSON.stringify({"ok": true, "started": true, "pid": child.pid, "url": publicUrl(env), "logPath": logPath}, null, 2));
}

function stopServer(options = {}) {
  const pid = readPid();
  const pids = [];
  if (pid) {
    pids.push(pid);
  }
  if (options.killPort) {
    for (const portPid of portListenerPids(options.env || loadRuntimeEnv())) {
      if (!pids.includes(portPid)) {
        pids.push(portPid);
      }
    }
  }
  if (pids.length <= 0) {
    if (!options.quiet) {
      console.log(JSON.stringify({"ok": true, "stopped": false, "message": "No pid file."}, null, 2));
    }
    return {"ok": true, "stopped": false, pids};
  }
  for (const targetPid of pids) {
    if (processAlive(targetPid)) {
      process.kill(targetPid, "SIGTERM");
    }
  }
  fs.rmSync(pidPath, {"force": true});
  if (!options.quiet) {
    console.log(JSON.stringify({"ok": true, "stopped": true, pids}, null, 2));
  }
  return {"ok": true, "stopped": true, pids};
}

function killPortListeners(env, signal = "SIGTERM") {
  const pids = portListenerPids(env);
  for (const pid of pids) {
    if (!processAlive(pid)) {
      continue;
    }
    try {
      process.kill(pid, signal);
    } catch (_error) {
      // The process may have exited between lsof and kill.
    }
  }
  return pids;
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function printStatus(env) {
  const pid = readPid();
  const health = await requestHealth(env).catch((error) => ({"ok": false, "error": error.message}));
  const counts = mysqlCounts(env);
  console.log(JSON.stringify({
    ok: Boolean(health.ok),
    pid: pid || null,
    pidAlive: pid ? processAlive(pid) : false,
    url: publicUrl(env),
    localUrl: `http://127.0.0.1:${env.BEASTBOUND_AUTH_PORT || "8787"}`,
    lanIps: lanIps(),
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
    BEASTBOUND_AUTH_HOST: env.BEASTBOUND_AUTH_HOST || "0.0.0.0",
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
