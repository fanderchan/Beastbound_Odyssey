#!/usr/bin/env node

import {spawn} from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";

const toolRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(toolRoot, "..");
const liveTest = path.join(
  repositoryRoot,
  "server/node/test/valkey-stream-event-bridge-live.test.js",
);
const serverBinary = resolveValkeyServerBinary();
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-valkey-gate-"));
let serverProcess = null;
let cleanupStarted = false;

try {
  const port = await reserveLoopbackPort();
  serverProcess = spawn(serverBinary, [
    "--bind", "127.0.0.1",
    "--protected-mode", "yes",
    "--port", String(port),
    "--save", "",
    "--appendonly", "no",
    "--dir", temporaryRoot,
    "--dbfilename", "gate.rdb",
    "--loglevel", "warning",
  ], {
    cwd: repositoryRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const serverOutput = boundedOutput(serverProcess, 64 * 1024);
  await waitForLoopback(port, serverProcess, serverOutput);

  const testExitCode = await runTest(port);
  if (testExitCode !== 0) {
    throw gateError(
      "valkey_event_bridge_live_test_failed",
      `Valkey event bridge live test exited with ${testExitCode}`,
    );
  }
  await runHttpEntrypointGate(port);
  await stopExactChild(serverProcess);
  serverProcess = null;
  fs.rmSync(temporaryRoot, {recursive: true, force: true});
  cleanupStarted = true;
  process.stdout.write(JSON.stringify({
    status: "PASS",
    gate: "valkey_event_bridge_live",
    engine: "real_loopback_valkey",
    httpEntrypointReady: true,
    duplicateNodeStartupRejected: true,
    persistentServiceStarted: false,
    temporaryStateRemoved: true,
  }, null, 2) + "\n");
} catch (error) {
  await cleanup();
  process.stderr.write(JSON.stringify({
    status: "FAIL",
    gate: "valkey_event_bridge_live",
    code: String(error && error.code || "valkey_event_bridge_live_gate_failed"),
  }, null, 2) + "\n");
  process.exitCode = 1;
}

async function cleanup() {
  if (cleanupStarted) {
    return;
  }
  cleanupStarted = true;
  if (serverProcess) {
    await stopExactChild(serverProcess).catch(() => undefined);
    serverProcess = null;
  }
  fs.rmSync(temporaryRoot, {recursive: true, force: true});
}

function resolveValkeyServerBinary() {
  const configured = String(process.env.BEASTBOUND_VALKEY_SERVER_BIN || "").trim();
  const candidates = [
    configured,
    "/opt/homebrew/opt/valkey/bin/valkey-server",
    "/usr/local/opt/valkey/bin/valkey-server",
    "/usr/bin/valkey-server",
  ].filter(Boolean);
  const match = candidates.find((candidate) => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
  if (!match) {
    throw gateError(
      "valkey_server_binary_missing",
      "No executable valkey-server binary was found",
    );
  }
  return match;
}

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const reservation = net.createServer();
    reservation.unref();
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", () => {
      const address = reservation.address();
      const port = address && typeof address === "object" ? Number(address.port) : 0;
      reservation.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForLoopback(port, child, output, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw gateError(
        "valkey_server_exited_early",
        `Temporary Valkey exited early: ${output.text()}`,
      );
    }
    if (await canConnect(port)) {
      return;
    }
    await delay(25);
  }
  throw gateError("valkey_server_start_timeout", "Temporary Valkey did not accept connections");
}

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({host: "127.0.0.1", port});
    const finish = (connected) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(connected);
    };
    socket.setTimeout(100, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

function runTest(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--test", liveTest], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        BEASTBOUND_TEST_VALKEY_PORT: String(port),
      },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(gateError(
          "valkey_live_test_signaled",
          `Valkey live test exited on ${signal}`,
        ));
        return;
      }
      resolve(Number(code || 0));
    });
  });
}

async function runHttpEntrypointGate(valkeyPort) {
  const primaryPort = await reserveLoopbackPort();
  const duplicatePort = await reserveLoopbackPort();
  const serverEntry = path.join(repositoryRoot, "server/node/src/http-server.js");
  const baseEnv = {
    ...process.env,
    BEASTBOUND_AUTH_HOST: "127.0.0.1",
    BEASTBOUND_AUTH_STORE: "json",
    BEASTBOUND_AUTH_STORE_PATH: path.join(temporaryRoot, "auth-store.json"),
    BEASTBOUND_CLUSTER_MODE: "valkey",
    BEASTBOUND_CLUSTER_NODE_ID: "live-http-node",
    BEASTBOUND_CLUSTER_VALKEY_HOST: "127.0.0.1",
    BEASTBOUND_CLUSTER_VALKEY_PORT: String(valkeyPort),
    BEASTBOUND_CLUSTER_VALKEY_TLS: "0",
    BEASTBOUND_CLUSTER_ACCOUNT_STICKY: "1",
    BEASTBOUND_CLUSTER_VALKEY_STREAM_KEY: `beastbound:test:http:${process.pid}`,
    BEASTBOUND_CLUSTER_NODE_LEASE_MS: "3000",
    BEASTBOUND_CLUSTER_VALKEY_READ_BLOCK_MS: "25",
    BEASTBOUND_CLUSTER_VALKEY_REQUEST_TIMEOUT_MS: "1000",
  };
  const primary = spawn(process.execPath, [serverEntry], {
    cwd: repositoryRoot,
    env: {...baseEnv, BEASTBOUND_AUTH_PORT: String(primaryPort)},
    stdio: ["ignore", "pipe", "pipe"],
  });
  const primaryOutput = boundedOutput(primary, 64 * 1024);
  try {
    const health = await waitForReadyHealth(primaryPort, primary, primaryOutput);
    if (
      health.statusCode !== 200
      || health.body.ok !== true
      || health.body.eventStream?.clusterRelay?.runtimeHealthy !== true
      || health.body.eventStream?.clusterRelay?.bridgeLeaseHeld !== true
      || health.body.eventStream?.clusterRelay?.bridgeReaderHealthy !== true
    ) {
      throw gateError(
        "valkey_http_entrypoint_not_ready",
        "Cluster-enabled HTTP entrypoint did not report a healthy relay",
      );
    }

    const duplicate = spawn(process.execPath, [serverEntry], {
      cwd: repositoryRoot,
      env: {...baseEnv, BEASTBOUND_AUTH_PORT: String(duplicatePort)},
      stdio: ["ignore", "pipe", "pipe"],
    });
    const duplicateOutput = boundedOutput(duplicate, 64 * 1024);
    const duplicateExit = await waitForChildExit(duplicate, 5000);
    if (duplicateExit.code !== 1 || duplicateExit.signal !== null) {
      await stopExactChild(duplicate).catch(() => undefined);
      throw gateError(
        "valkey_duplicate_node_startup_not_rejected",
        `Duplicate node startup was not rejected: ${duplicateOutput.text()}`,
      );
    }
    const primaryAfterDuplicate = await requestJson(primaryPort, "/health/ready");
    if (primaryAfterDuplicate.statusCode !== 200 || primaryAfterDuplicate.body.ok !== true) {
      throw gateError(
        "valkey_primary_unhealthy_after_duplicate",
        "Primary cluster node became unhealthy after duplicate startup rejection",
      );
    }
  } finally {
    await stopExactChild(primary).catch(() => undefined);
  }
}

async function waitForReadyHealth(port, child, output, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw gateError(
        "valkey_http_entrypoint_exited_early",
        `Cluster-enabled HTTP entrypoint exited early: ${output.text()}`,
      );
    }
    try {
      const result = await requestJson(port, "/health/ready");
      if (result.statusCode === 200 && result.body.ok === true) {
        return result;
      }
    } catch {
      // Startup owns a bounded retry window below.
    }
    await delay(25);
  }
  throw gateError(
    "valkey_http_entrypoint_start_timeout",
    `Cluster-enabled HTTP entrypoint did not become ready: ${output.text()}`,
  );
}

function requestJson(port, requestPath) {
  return new Promise((resolve, reject) => {
    const request = http.get({host: "127.0.0.1", port, path: requestPath}, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try {
          resolve({
            statusCode: response.statusCode,
            body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.setTimeout(1000, () => request.destroy(new Error("health request timed out")));
    request.once("error", reject);
  });
}

function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({code: child.exitCode, signal: child.signalCode});
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      reject(gateError("child_exit_timeout", "Child process did not exit in time"));
    }, timeoutMs);
    const onExit = (code, signal) => {
      clearTimeout(timer);
      resolve({code, signal});
    };
    child.once("exit", onExit);
  });
}

async function stopExactChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill("SIGINT");
  if (await waitForExit(child, 3000)) {
    return;
  }
  child.kill("SIGTERM");
  if (await waitForExit(child, 1000)) {
    return;
  }
  child.kill("SIGKILL");
  if (!await waitForExit(child, 1000)) {
    throw gateError("exact_child_stop_failed", "Exact child process did not stop");
  }
}

function waitForExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve(value);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", onExit);
  });
}

function boundedOutput(child, maxBytes) {
  let content = "";
  const append = (chunk) => {
    content += Buffer.from(chunk).toString("utf8");
    if (Buffer.byteLength(content) > maxBytes) {
      content = content.slice(-maxBytes);
    }
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  return {text: () => content};
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function gateError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
