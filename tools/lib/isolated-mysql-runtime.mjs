import {execFileSync, spawn} from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const LOOPBACK_HOST = "127.0.0.1";
const DEFAULT_STARTUP_TIMEOUT_MS = 15000;
const DEFAULT_STOP_TIMEOUT_MS = 5000;
const DEFAULT_MEMORY_BYTES = 128 * 1024 * 1024;

export async function startIsolatedMysql(options = {}) {
  const binDir = isolatedMysqlBinaryDirectory(options.binDir);
  const basedir = path.dirname(binDir);
  const port = await reserveLoopbackPort();
  const runtimePrefix = safeRuntimePrefix(options.runtimePrefix);
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), `${runtimePrefix}-`));
  const datadir = path.join(runtimeDir, "data");
  const socketPath = path.join(runtimeDir, "mysql.sock");
  const pidPath = path.join(runtimeDir, "mysqld.pid");
  const errorLogPath = path.join(runtimeDir, "mysqld.log");
  const mysqlWrapperPath = path.join(runtimeDir, "mysql-no-defaults");
  const mysqlPath = path.join(binDir, "mysql");
  const mysqladminPath = path.join(binDir, "mysqladmin");
  const mysqldPath = path.join(binDir, "mysqld");
  const memoryBytes = positiveInteger(options.memoryBytes, DEFAULT_MEMORY_BYTES);
  const maxConnections = positiveInteger(options.maxConnections, 50);
  const startupTimeoutMs = positiveInteger(options.startupTimeoutMs, DEFAULT_STARTUP_TIMEOUT_MS);

  try {
    fs.writeFileSync(mysqlWrapperPath, mysqlNoDefaultsWrapper(mysqlPath), {mode: 0o700});
    fs.mkdirSync(datadir, {recursive: true});
    execFileSync(mysqldPath, [
      "--no-defaults",
      `--basedir=${basedir}`,
      `--datadir=${datadir}`,
      "--initialize-insecure",
    ], {stdio: "ignore", timeout: 30000});
  } catch (error) {
    fs.rmSync(runtimeDir, {recursive: true, force: true});
    throw error;
  }

  let processHandle = null;
  try {
    processHandle = spawn(mysqldPath, [
      "--no-defaults",
      `--basedir=${basedir}`,
      `--datadir=${datadir}`,
      `--bind-address=${LOOPBACK_HOST}`,
      `--port=${port}`,
      `--socket=${socketPath}`,
      `--pid-file=${pidPath}`,
      `--log-error=${errorLogPath}`,
      "--mysqlx=0",
      "--skip-log-bin",
      "--performance-schema=ON",
      `--innodb-buffer-pool-size=${memoryBytes}`,
      "--innodb-lock-wait-timeout=8",
      `--max-connections=${maxConnections}`,
    ], {stdio: "ignore"});
  } catch (error) {
    fs.rmSync(runtimeDir, {recursive: true, force: true});
    throw error;
  }

  const exited = new Promise((resolve, reject) => {
    processHandle.once("exit", (code, signal) => resolve({code, signal}));
    processHandle.once("error", reject);
  });
  void exited.catch(() => {});
  const runtime = {
    binDir,
    basedir,
    connectionOptions: {
      host: LOOPBACK_HOST,
      port,
      user: "root",
      password: "",
      connectTimeout: 1000,
    },
    datadir,
    errorLogPath,
    exited,
    mysqlPath: mysqlWrapperPath,
    mysqladminPath,
    port,
    processHandle,
    runtimeDir,
  };
  try {
    await waitUntil(() => {
      if (isolatedMysqlRuntimeStopped(runtime)) {
        const log = fs.existsSync(errorLogPath)
          ? fs.readFileSync(errorLogPath, "utf8").slice(-4000)
          : "";
        throw new Error(`一次性 mysqld 提前退出：${log}`);
      }
      try {
        execFileSync(mysqladminPath, [
          "--no-defaults",
          "--no-login-paths",
          "--protocol=TCP",
          `--host=${LOOPBACK_HOST}`,
          `--port=${port}`,
          "--user=root",
          "ping",
        ], {
          env: {...process.env, MYSQL_PWD: ""},
          stdio: "ignore",
          timeout: 1000,
        });
        return true;
      } catch {
        return false;
      }
    }, startupTimeoutMs, "一次性 mysqld 启动");
    return runtime;
  } catch (error) {
    await terminateIsolatedMysqlProcess(runtime);
    if (isolatedMysqlRuntimeStopped(runtime)) {
      fs.rmSync(runtimeDir, {recursive: true, force: true});
    }
    throw error;
  }
}

export async function stopIsolatedMysql(runtime, options = {}) {
  if (!runtime) {
    return;
  }
  const stopTimeoutMs = positiveInteger(options.stopTimeoutMs, DEFAULT_STOP_TIMEOUT_MS);
  let stopped = isolatedMysqlRuntimeStopped(runtime);
  try {
    if (!stopped) {
      try {
        execFileSync(runtime.mysqladminPath, [
          "--no-defaults",
          "--no-login-paths",
          "--protocol=TCP",
          `--host=${LOOPBACK_HOST}`,
          `--port=${runtime.port}`,
          "--user=root",
          "shutdown",
        ], {
          env: {...process.env, MYSQL_PWD: ""},
          stdio: "ignore",
          timeout: stopTimeoutMs,
        });
      } catch {
        // The bounded signal fallback owns final cleanup.
      }
      stopped = await waitForProcessExit(runtime, stopTimeoutMs);
    }
    if (!stopped) {
      stopped = await terminateIsolatedMysqlProcess(runtime, stopTimeoutMs);
    }
    if (!stopped) {
      throw new Error("一次性 mysqld 在 SIGKILL 后仍未确认退出，拒绝删除 datadir。");
    }
  } finally {
    if (stopped) {
      fs.rmSync(runtime.runtimeDir, {recursive: true, force: true});
    }
  }
}

export function isolatedMysqlRuntimeStopped(runtime) {
  const child = runtime && runtime.processHandle;
  return !child
    || !Number.isInteger(child.pid)
    || child.exitCode !== null
    || child.signalCode !== null;
}

function isolatedMysqlBinaryDirectory(explicitValue) {
  const explicit = String(explicitValue || process.env.BEASTBOUND_ISOLATED_MYSQL_BIN_DIR || "").trim();
  const candidates = [
    explicit,
    "/Users/fander/.local/opt/mysql/mysql-9.7.0-er2/bin",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (["mysql", "mysqladmin", "mysqld"].every((name) => fs.existsSync(path.join(candidate, name)))) {
      return candidate;
    }
  }
  throw new Error("未找到隔离门槛需要的 mysql/mysqladmin/mysqld 二进制。");
}

function mysqlNoDefaultsWrapper(mysqlPath) {
  return `#!/usr/bin/env node
const {spawn} = require("node:child_process");
const env = {...process.env};
delete env.MYSQL_PWD;
const child = spawn(${JSON.stringify(mysqlPath)}, ["--no-defaults", "--no-login-paths", ...process.argv.slice(2)], {
  env,
  stdio: "inherit",
});
const timer = setTimeout(() => child.kill("SIGKILL"), 8000);
child.once("error", () => {
  clearTimeout(timer);
  process.exitCode = 125;
});
child.once("exit", (code) => {
  clearTimeout(timer);
  process.exitCode = Number.isInteger(code) ? code : 124;
});
`;
}

function safeRuntimePrefix(value) {
  const prefix = String(value || "beastbound-isolated-mysql").trim();
  if (!/^[a-z0-9][a-z0-9-]{0,48}$/.test(prefix)) {
    throw new Error("一次性 MySQL runtime prefix 不合法。");
  }
  return prefix;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

async function reserveLoopbackPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, LOOPBACK_HOST, resolve);
  });
  const address = server.address();
  const port = Number(address && typeof address === "object" && address.port || 0);
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  if (!Number.isInteger(port) || port <= 0 || port === 3306) {
    throw new Error("无法分配安全的一次性 MySQL 非 3306 端口。");
  }
  return port;
}

async function waitUntil(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) {
        return;
      }
    } catch (error) {
      lastError = error;
      if (isolatedMysqlStartupFatal(error)) {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const error = new Error(`${label}超时${lastError ? `：${lastError.message}` : ""}`);
  error.cause = lastError;
  throw error;
}

function isolatedMysqlStartupFatal(error) {
  return String(error && error.message || "").startsWith("一次性 mysqld 提前退出：");
}

async function waitForProcessExit(runtime, timeoutMs) {
  if (isolatedMysqlRuntimeStopped(runtime)) {
    return true;
  }
  await Promise.race([
    Promise.resolve(runtime.exited).catch(() => null),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
  return isolatedMysqlRuntimeStopped(runtime);
}

async function terminateIsolatedMysqlProcess(runtime, timeoutMs = DEFAULT_STOP_TIMEOUT_MS) {
  if (isolatedMysqlRuntimeStopped(runtime)) {
    return true;
  }
  runtime.processHandle.kill("SIGTERM");
  if (await waitForProcessExit(runtime, timeoutMs)) {
    return true;
  }
  runtime.processHandle.kill("SIGKILL");
  return waitForProcessExit(runtime, timeoutMs);
}
