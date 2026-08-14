#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import {fork, spawn} from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {
  RawJsonWebSocket,
  boundedTail,
  delay,
  fetchJsonMeasured,
  withTimeout,
} from "./lib/public-capacity-harness.mjs";

const require = createRequire(import.meta.url);
const filePath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(filePath), "..");
const {PROTOCOL_VERSION, SERVER_VERSION} = require("../server/node/src/protocol");

const LOOPBACK_HOST = "127.0.0.1";
const MAP_ID = "firebud_training_yard";
const FIXTURE_PASSWORD = "cluster-gate-password-1";
const HTTP_TIMEOUT_MS = 5000;
const EVENT_TIMEOUT_MS = 5000;
const NODE_LEASE_MS = 3000;
const ACCOUNT_LEASE_MS = 3000;

async function runGate() {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-two-node-gate-"));
  const valkeyPort = await reserveLoopbackPort();
  const streamKey = `beastbound:test:two-node:${process.pid}`;
  let valkey = null;
  let nodeA = null;
  let nodeB = null;
  const sockets = [];
  try {
    valkey = startValkey(valkeyPort, temporaryRoot);
    await waitForLoopback(valkeyPort, valkey);
    nodeA = await NodeWorker.start({
      nodeId: "two-node-a",
      valkeyPort,
      streamKey,
      serviceEventSeq: 0,
    });
    nodeB = await NodeWorker.start({
      nodeId: "two-node-b",
      valkeyPort,
      streamKey,
      // Deliberately place the receiver cursor above Node A's source-local
      // sequence.  A remote event carrying `eventSeq=1` would be silently
      // discarded without receiver-side live-event normalization.
      serviceEventSeq: 100,
    });
    assert.deepEqual(nodeA.fixtureDigest, nodeB.fixtureDigest);

    const alice = fixtureAccount(nodeA.accounts, "alice");
    const bob = fixtureAccount(nodeB.accounts, "bob");
    const replacement = fixtureAccount(nodeB.accounts, "replacement");
    await Promise.all([
      waitForClusterReady(nodeA),
      waitForClusterReady(nodeB),
    ]);

    await expectOk(nodeA, "/players/position", {
      method: "POST",
      token: alice.token,
      body: positionPayload(10, 10, "east", false),
    });
    await expectOk(nodeB, "/players/position", {
      method: "POST",
      token: bob.token,
      body: positionPayload(10, 10, "west", false),
    });

    const aliceSocket = eventSocket(nodeA, alice, 0, 0);
    const bobSocket = eventSocket(nodeB, bob, 1, 100);
    const replacedSocket = eventSocket(nodeB, replacement, 2, 100);
    sockets.push(aliceSocket, bobSocket, replacedSocket);
    await Promise.all(sockets.map((socket) => socket.connect(EVENT_TIMEOUT_MS)));
    assert.equal(bobSocket.lastEventSeq, 100);
    assert.equal(replacedSocket.lastEventSeq, 100);

    const chatText = `跨节点门槛-${process.pid}`;
    const localChat = aliceSocket.waitFor(
      (event) => chatEventMatches(event, chatText),
      EVENT_TIMEOUT_MS,
    );
    const remoteChat = bobSocket.waitFor(
      (event) => chatEventMatches(event, chatText),
      EVENT_TIMEOUT_MS,
    );
    const chatResponse = await expectOk(nodeA, "/chat/send", {
      method: "POST",
      token: alice.token,
      body: {channel: "nearby", text: chatText},
    });
    assert.equal(chatResponse.json.message.text, chatText);
    const [localChatResult, remoteChatResult] = await Promise.all([localChat, remoteChat]);
    assert.equal(localChatResult.event.eventSeq, 1);
    assert.equal(Object.hasOwn(remoteChatResult.event, "eventSeq"), false);
    assert.equal(Object.hasOwn(remoteChatResult.event, "eventId"), false);

    const remotePosition = bobSocket.waitFor((event) => (
      event
      && event.type === "online.position"
      && event.accountId === alice.accountId
      && event.change === "upsert"
      && event.player
      && event.player.position
      && event.player.position.cellX === 11
    ), EVENT_TIMEOUT_MS);
    await expectOk(nodeA, "/movement/step", {
      method: "POST",
      token: alice.token,
      body: {
        mapId: MAP_ID,
        fromCellX: 10,
        fromCellY: 10,
        toCellX: 11,
        toCellY: 10,
        facing: "east",
        moving: true,
      },
    });
    const remotePositionResult = await remotePosition;
    assert.equal(Number.isSafeInteger(remotePositionResult.event.presenceRevision), true);
    assert.ok(remotePositionResult.event.presenceRevision > 0);

    const crossNodeLogin = await request(nodeA, "/auth/login", {
      method: "POST",
      body: {
        username: replacement.username,
        password: FIXTURE_PASSWORD,
      },
    });
    assert.equal(crossNodeLogin.status, 503);
    assert.equal(crossNodeLogin.json.code, "account_node_switching");
    assert.equal(replacedSocket.closed, false);
    const oldSessionStillValid = await expectOk(nodeB, "/auth/session", {
      token: replacement.token,
    });
    assert.equal(oldSessionStillValid.json.session.sessionId, replacement.sessionId);

    replacedSocket.expectedClose = true;
    const replacementEvent = replacedSocket.waitFor((event) => (
      event
      && event.type === "session.replaced"
      && Array.isArray(event.targetSessionIds)
      && event.targetSessionIds.includes(replacement.sessionId)
    ), EVENT_TIMEOUT_MS);
    const loginResponse = await expectOk(nodeB, "/auth/login", {
      method: "POST",
      body: {
        username: replacement.username,
        password: FIXTURE_PASSWORD,
      },
    });
    assert.notEqual(loginResponse.json.session.sessionId, replacement.sessionId);
    const replacementResult = await replacementEvent;
    assert.ok(replacementResult.event.eventSeq > 100);
    await waitFor(() => replacedSocket.closed, EVENT_TIMEOUT_MS, "replaced websocket did not close");

    const [healthA, healthB] = await Promise.all([
      clusterHealth(nodeA),
      clusterHealth(nodeB),
    ]);
    assert.equal(healthA.status, 200);
    assert.equal(healthB.status, 200);
    assert.equal(healthA.json.eventStream.clusterRelay.runtimeHealthy, true);
    assert.equal(healthB.json.eventStream.clusterRelay.runtimeHealthy, true);
    assert.equal(healthA.json.accountOwnership.ok, true);
    assert.equal(healthB.json.accountOwnership.ok, true);
    assert.ok(healthA.json.eventStream.clusterRelay.localAccepted >= 3);
    assert.ok(healthB.json.eventStream.clusterRelay.remoteDelivered >= 3);
    assert.equal(bobSocket.eventSeqRegressions, 0);
    assert.equal(bobSocket.eventSeqDuplicates, 0);
    assert.equal(bobSocket.presenceRevisionRegressions, 0);
    assert.equal(bobSocket.protocolErrors, 0);

    aliceSocket.expectedClose = true;
    await nodeA.crash();
    const conflictBeforeExpiry = await request(nodeB, "/players/position", {
      method: "POST",
      token: alice.token,
      body: positionPayload(12, 10, "east", false),
    });
    assert.equal(conflictBeforeExpiry.status, 503);
    assert.equal(conflictBeforeExpiry.json.code, "account_node_switching");

    const takeoverPresence = bobSocket.waitFor((event) => (
      event
      && event.type === "online.position"
      && event.accountId === alice.accountId
      && event.change === "upsert"
      && event.player
      && event.player.position
      && event.player.position.cellX === 12
    ), EVENT_TIMEOUT_MS + ACCOUNT_LEASE_MS);
    let takeoverResponse = null;
    await waitFor(async () => {
      takeoverResponse = await request(nodeB, "/players/position", {
        method: "POST",
        token: alice.token,
        body: positionPayload(12, 10, "east", false),
      });
      return takeoverResponse.status === 200 && takeoverResponse.json.ok === true;
    }, EVENT_TIMEOUT_MS + ACCOUNT_LEASE_MS, "account ownership did not transfer after lease expiry");
    const takeoverEvent = await takeoverPresence;
    assert.ok(takeoverResponse.json.presenceRevision >= 2_000_000_001);
    assert.equal(takeoverEvent.event.presenceRevision, takeoverResponse.json.presenceRevision);
    assert.ok(takeoverEvent.event.presenceRevision > remotePositionResult.event.presenceRevision);
    const takeoverHealth = await clusterHealth(nodeB);
    assert.equal(takeoverHealth.status, 200);
    assert.equal(takeoverHealth.json.accountOwnership.ok, true);

    for (const socket of sockets) {
      socket.close();
    }
    await Promise.all([
      nodeB.stop(),
    ]);
    nodeB = null;
    await stopExactChild(valkey.process);
    valkey = null;
    fs.rmSync(temporaryRoot, {recursive: true, force: true});

    process.stdout.write(`${JSON.stringify({
      status: "PASS",
      gate: "valkey_two_node_event_and_account_takeover",
      engine: "real_loopback_valkey",
      independentGameNodeProcesses: 2,
      independentHttpAndWebSocketPorts: true,
      remoteSourceSequenceBelowReceiverCursorDelivered: true,
      livePresence: true,
      liveWorldChat: true,
      crossNodeLoginConflictBeforeMutation: true,
      sameOwnerSessionReplacement: true,
      crashedOwnerLeaseExpiryTakeover: true,
      presenceRevisionGenerationAdvanced: true,
      partyAndBattleAuthorityTakeoverProven: false,
      reconnectHydrationProven: false,
      persistentServiceStarted: false,
      temporaryStateRemoved: true,
    }, null, 2)}\n`);
  } catch (error) {
    for (const socket of sockets) {
      socket.terminate();
    }
    await Promise.allSettled([
      nodeA && nodeA.stop(false),
      nodeB && nodeB.stop(false),
    ]);
    if (valkey) {
      await stopExactChild(valkey.process).catch(() => undefined);
    }
    fs.rmSync(temporaryRoot, {recursive: true, force: true});
    process.stderr.write(`${JSON.stringify({
      status: "FAIL",
      gate: "valkey_two_independent_node_event",
      code: String(error && error.code || "two_node_gate_failed"),
      message: String(error && error.message || "two-node gate failed"),
      nodeA: nodeA && nodeA.diagnostic(),
      nodeB: nodeB && nodeB.diagnostic(),
      valkey: valkey && valkey.output.text(),
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

class NodeWorker {
  static async start(configuration) {
    const child = fork(filePath, ["--node-worker"], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        BEASTBOUND_GATE_NODE_ID: configuration.nodeId,
        BEASTBOUND_GATE_VALKEY_PORT: String(configuration.valkeyPort),
        BEASTBOUND_GATE_STREAM_KEY: configuration.streamKey,
        BEASTBOUND_GATE_SERVICE_EVENT_SEQ: String(configuration.serviceEventSeq),
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    const worker = new NodeWorker(child, configuration.nodeId);
    try {
      await worker.ready();
      return worker;
    } catch (error) {
      await worker.stop(false);
      throw error;
    }
  }

  constructor(child, nodeId) {
    this.child = child;
    this.nodeId = nodeId;
    this.port = 0;
    this.accounts = [];
    this.fixtureDigest = "";
    this.stdout = "";
    this.stderr = "";
    this.requestId = 0;
    this.pending = new Map();
    this.readySettled = false;
    this.readyPromise = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    child.stdout.on("data", (chunk) => {
      this.stdout = boundedTail(this.stdout + chunk.toString("utf8"), 32 * 1024);
    });
    child.stderr.on("data", (chunk) => {
      this.stderr = boundedTail(this.stderr + chunk.toString("utf8"), 32 * 1024);
    });
    child.on("message", (message) => this.onMessage(message));
    child.on("error", (error) => this.failAll(error));
    child.on("exit", (code, signal) => {
      if (!this.readySettled || this.pending.size > 0) {
        this.failAll(new Error(
          `node worker ${this.nodeId} exited code=${code} signal=${signal}: ${this.stderr}`,
        ));
      }
    });
  }

  ready() {
    return withTimeout(this.readyPromise, 10000, `node worker ${this.nodeId} ready timeout`);
  }

  onMessage(message) {
    if (!message || typeof message !== "object") {
      return;
    }
    if (message.type === "ready") {
      this.port = Number(message.port || 0);
      this.accounts = Array.isArray(message.accounts) ? message.accounts : [];
      this.fixtureDigest = String(message.fixtureDigest || "");
      this.readySettled = true;
      this.resolveReady(this);
      return;
    }
    if (message.type === "fatal") {
      this.failAll(new Error(String(message.error || "node worker fatal")));
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.ok) {
      pending.resolve(message.result);
    } else {
      pending.reject(new Error(String(message.error || "node worker request failed")));
    }
  }

  rpc(command) {
    if (!childRunning(this.child) || !this.child.connected) {
      return Promise.reject(new Error(`node worker ${this.nodeId} is unavailable`));
    }
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`node worker ${this.nodeId} ${command} timeout`));
      }, 10000);
      this.pending.set(id, {resolve, reject, timer});
      this.child.send({id, command});
    });
  }

  failAll(error) {
    this.rejectReady(error);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async stop(graceful = true) {
    if (!childRunning(this.child)) {
      return;
    }
    if (graceful && this.readySettled && this.child.connected) {
      await this.rpc("shutdown").catch(() => undefined);
    }
    await waitForChildStop(this.child, 750);
    if (childRunning(this.child)) {
      this.child.kill("SIGTERM");
      await waitForChildStop(this.child, 750);
    }
    if (childRunning(this.child)) {
      this.child.kill("SIGKILL");
      await waitForChildStop(this.child, 1000);
    }
    if (childRunning(this.child)) {
      throw new Error(`node worker ${this.nodeId} did not exit`);
    }
  }

  async crash() {
    if (!childRunning(this.child)) {
      return;
    }
    this.child.kill("SIGKILL");
    await waitForChildStop(this.child, 1500);
    if (childRunning(this.child)) {
      throw new Error(`node worker ${this.nodeId} did not crash`);
    }
  }

  diagnostic() {
    return {
      nodeId: this.nodeId,
      port: this.port,
      exitCode: this.child.exitCode,
      signalCode: this.child.signalCode,
      stdout: this.stdout,
      stderr: this.stderr,
    };
  }
}

async function runNodeWorker() {
  const {
    createAuthService,
    createMemoryAuthStore,
  } = require("../server/node/src/auth-service");
  const {
    createHttpServer,
    drainServerForShutdown,
  } = require("../server/node/src/http-server");
  const {
    createConfiguredClusterEventRuntime,
  } = require("../server/node/src/cluster-event-runtime-config");

  const nowMs = Date.now();
  const fixture = clusterFixture(
    nowMs,
    Number(process.env.BEASTBOUND_GATE_SERVICE_EVENT_SEQ || 0),
  );
  const store = createMemoryAuthStore(fixture.data);
  const send = (message) => {
    if (typeof process.send === "function" && process.connected) {
      process.send(message);
    }
  };
  let server = null;
  let clusterRuntime = null;
  let shutdownStarted = false;

  const shutdown = async (exitCode = 0) => {
    if (shutdownStarted) {
      return;
    }
    shutdownStarted = true;
    if (server) {
      await drainServerForShutdown(server, store).catch(() => undefined);
    }
    if (clusterRuntime) {
      await clusterRuntime.close().catch(() => undefined);
    }
    setImmediate(() => process.exit(exitCode));
  };
  const fatal = (error) => {
    send({type: "fatal", error: String(error && error.stack || error)});
    void shutdown(1);
  };
  process.on("uncaughtException", fatal);
  process.on("unhandledRejection", fatal);
  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));

  try {
    clusterRuntime = await createConfiguredClusterEventRuntime({
      BEASTBOUND_CLUSTER_MODE: "valkey",
      BEASTBOUND_CLUSTER_NODE_ID: process.env.BEASTBOUND_GATE_NODE_ID,
      BEASTBOUND_CLUSTER_ACCOUNT_STICKY: "1",
      BEASTBOUND_CLUSTER_VALKEY_HOST: LOOPBACK_HOST,
      BEASTBOUND_CLUSTER_VALKEY_PORT: process.env.BEASTBOUND_GATE_VALKEY_PORT,
      BEASTBOUND_CLUSTER_VALKEY_TLS: "0",
      BEASTBOUND_CLUSTER_VALKEY_STREAM_KEY: process.env.BEASTBOUND_GATE_STREAM_KEY,
      BEASTBOUND_CLUSTER_NODE_LEASE_MS: String(NODE_LEASE_MS),
      BEASTBOUND_CLUSTER_ACCOUNT_LEASE_MS: String(ACCOUNT_LEASE_MS),
      BEASTBOUND_CLUSTER_VALKEY_READ_BLOCK_MS: "25",
      BEASTBOUND_CLUSTER_VALKEY_REQUEST_TIMEOUT_MS: "1000",
    }, {
      onError() {},
      onFatal: fatal,
    });
    const service = createAuthService({
      store,
      now: () => nowMs,
      allowPositionTeleport: false,
      allowInitialPositionSeedForTests: true,
    });
    const fixtureSessionProbe = service.getSession(fixture.accounts[0].token);
    if (!fixtureSessionProbe || fixtureSessionProbe.ok !== true) {
      const error = new Error(
        `cluster fixture session is invalid: ${JSON.stringify(fixtureSessionProbe)}`,
      );
      error.code = "cluster_gate_fixture_session_invalid";
      throw error;
    }
    server = createHttpServer({
      service,
      store,
      eventHubOptions: clusterRuntime.eventHubOptions,
      clusterAccountAdmission: clusterRuntime.accountAdmission,
      logger() {},
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, LOOPBACK_HOST, resolve);
    });
    send({
      type: "ready",
      port: server.address().port,
      accounts: fixture.accounts,
      fixtureDigest: fixture.fixtureDigest,
    });
  } catch (error) {
    fatal(error);
  }

  process.on("message", (message) => {
    if (!message || typeof message !== "object" || !message.id) {
      return;
    }
    if (message.command !== "shutdown") {
      send({id: message.id, ok: false, error: "unknown node worker command"});
      return;
    }
    send({id: message.id, ok: true, result: {closing: true}});
    void shutdown(0);
  });
}

function clusterFixture(nowMs, serviceEventSeq) {
  const createdAt = new Date(nowMs).toISOString();
  const data = {
    accounts: {},
    sessions: {},
    profileBindings: {},
    profiles: {},
    serviceEventSeq: Math.max(0, Math.trunc(Number(serviceEventSeq || 0))),
    serviceEvents: [],
  };
  const accounts = [
    fixtureIdentity("alice", "跨节点甲"),
    fixtureIdentity("bob", "跨节点乙"),
    fixtureIdentity("replacement", "换线验证"),
  ];
  for (const account of accounts) {
    const salt = crypto.createHash("sha256").update(`salt:${account.key}`).digest("hex").slice(0, 32);
    const playerId = `player_cluster_gate_${account.key}`;
    data.accounts[account.username] = {
      accountId: account.accountId,
      username: account.username,
      displayName: account.displayName,
      role: "player",
      passwordSalt: salt,
      passwordHash: crypto.scryptSync(FIXTURE_PASSWORD, salt, 32).toString("hex"),
      passwordPolicyVersion: 2,
      createdAt,
      updatedAt: createdAt,
      schemaVersion: 1,
    };
    data.sessions[account.sessionId] = {
      sessionId: account.sessionId,
      accountId: account.accountId,
      tokenHash: crypto.createHash("sha256").update(account.token).digest("hex"),
      createdAt,
      expiresAt: new Date(nowMs + 24 * 60 * 60 * 1000).toISOString(),
      revokedAt: null,
      schemaVersion: 1,
    };
    data.profileBindings[account.accountId] = {
      accountId: account.accountId,
      playerId,
      profileRevision: 0,
      createdAt,
      updatedAt: createdAt,
      schemaVersion: 1,
    };
    data.profiles[playerId] = {
      playerId,
      accountId: account.accountId,
      profileRevision: 0,
      updatedAt: createdAt,
      schemaVersion: 1,
      profile: {
        name: account.displayName,
        backpackSlots: [],
        equipmentInstances: {},
        petInstances: [],
      },
    };
  }
  return {
    data,
    accounts,
    fixtureDigest: crypto.createHash("sha256").update(JSON.stringify(accounts)).digest("hex"),
  };
}

function fixtureIdentity(key, displayName) {
  return {
    key,
    accountId: `acc_cluster_gate_${key}`,
    username: `cluster_gate_${key}`,
    displayName,
    sessionId: `sess_cluster_gate_${key}`,
    token: crypto.createHash("sha256").update(`cluster-gate-token:${key}`).digest("base64url"),
  };
}

function fixtureAccount(accounts, key) {
  const account = accounts.find((entry) => entry && entry.key === key);
  assert.ok(account, `fixture account ${key} is missing`);
  return account;
}

function eventSocket(worker, account, index, cursor) {
  const query = new URLSearchParams({
    clientVersion: SERVER_VERSION,
    clientProtocolVersion: String(PROTOCOL_VERSION),
    lastEventSeq: String(cursor),
  });
  return new RawJsonWebSocket({
    host: LOOPBACK_HOST,
    port: worker.port,
    path: `/events?${query.toString()}`,
    index,
    expectedAccountId: account.accountId,
    lastEventSeq: cursor,
    headers: {
      Authorization: `Bearer ${account.token}`,
    },
  });
}

function chatEventMatches(event, text) {
  return Boolean(
    event
    && event.type === "chat.message"
    && event.message
    && event.message.text === text,
  );
}

function positionPayload(cellX, cellY, facing, moving) {
  return {mapId: MAP_ID, cellX, cellY, facing, moving};
}

async function expectOk(worker, pathname, options = {}) {
  const result = await request(worker, pathname, options);
  assert.equal(
    result.status,
    200,
    `${worker.nodeId} ${pathname} status ${result.status}: ${JSON.stringify(result.json)}`,
  );
  assert.equal(result.json && result.json.ok, true, `${worker.nodeId} ${pathname}: ${JSON.stringify(result.json)}`);
  return result;
}

function request(worker, pathname, options = {}) {
  return fetchJsonMeasured(`http://${LOOPBACK_HOST}:${worker.port}${pathname}`, {
    method: options.method,
    token: options.token,
    body: options.body,
    protocolVersion: PROTOCOL_VERSION,
    clientVersion: SERVER_VERSION,
    timeoutMs: HTTP_TIMEOUT_MS,
  });
}

function clusterHealth(worker) {
  return fetchJsonMeasured(`http://${LOOPBACK_HOST}:${worker.port}/health/ready`, {
    timeoutMs: HTTP_TIMEOUT_MS,
  });
}

async function waitForClusterReady(worker) {
  let last = null;
  await waitFor(async () => {
    try {
      last = await clusterHealth(worker);
      return Boolean(
        last.status === 200
        && last.json
        && last.json.ok === true
        && last.json.eventStream
        && last.json.eventStream.clusterRelay
        && last.json.eventStream.clusterRelay.runtimeHealthy === true
        && last.json.accountOwnership
        && last.json.accountOwnership.ok === true
      );
    } catch {
      return false;
    }
  }, HTTP_TIMEOUT_MS, `${worker.nodeId} cluster readiness timeout`);
  return last;
}

async function waitFor(predicate, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await delay(25);
  }
  throw new Error(message);
}

function startValkey(port, directory) {
  const binary = resolveValkeyServerBinary();
  const child = spawn(binary, [
    "--bind", LOOPBACK_HOST,
    "--protected-mode", "yes",
    "--port", String(port),
    "--save", "",
    "--appendonly", "no",
    "--dir", directory,
    "--dbfilename", "two-node-gate.rdb",
    "--loglevel", "warning",
  ], {
    cwd: repositoryRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {process: child, output: captureOutput(child, 64 * 1024)};
}

function resolveValkeyServerBinary() {
  const candidates = [
    String(process.env.BEASTBOUND_VALKEY_SERVER_BIN || "").trim(),
    "/opt/homebrew/opt/valkey/bin/valkey-server",
    "/usr/local/opt/valkey/bin/valkey-server",
    "/usr/bin/valkey-server",
  ].filter(Boolean);
  const binary = candidates.find((candidate) => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
  if (!binary) {
    const error = new Error("No executable valkey-server binary was found");
    error.code = "valkey_server_binary_missing";
    throw error;
  }
  return binary;
}

async function waitForLoopback(port, valkey, timeoutMs = 5000) {
  await waitFor(async () => {
    if (!childRunning(valkey.process)) {
      throw new Error(`temporary Valkey exited early: ${valkey.output.text()}`);
    }
    return canConnect(port);
  }, timeoutMs, "temporary Valkey start timeout");
}

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({host: LOOPBACK_HOST, port});
    const finish = (value) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(100, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, LOOPBACK_HOST, () => {
      const address = server.address();
      const port = address && typeof address === "object" ? Number(address.port) : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function captureOutput(child, maxBytes) {
  let value = "";
  const append = (chunk) => {
    value = boundedTail(value + chunk.toString("utf8"), maxBytes);
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  return {text: () => value};
}

async function stopExactChild(child) {
  if (!childRunning(child)) {
    return;
  }
  child.kill("SIGINT");
  await waitForChildStop(child, 750);
  if (childRunning(child)) {
    child.kill("SIGTERM");
    await waitForChildStop(child, 750);
  }
  if (childRunning(child)) {
    child.kill("SIGKILL");
    await waitForChildStop(child, 1000);
  }
  if (childRunning(child)) {
    throw new Error(`owned child ${child.pid} did not exit`);
  }
}

function waitForChildStop(child, timeoutMs) {
  if (!childRunning(child)) {
    return Promise.resolve();
  }
  return Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(timeoutMs),
  ]);
}

function childRunning(child) {
  return Boolean(child && child.exitCode === null && child.signalCode === null);
}

if (process.argv.includes("--node-worker")) {
  await runNodeWorker();
} else {
  await runGate();
}
