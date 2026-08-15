#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {createRequire} from "node:module";
import {performance} from "node:perf_hooks";
import {fileURLToPath} from "node:url";
import {
  LatencyBook,
  RawJsonWebSocket,
  delay,
  fetchJsonMeasured,
  round,
  seededRandom,
  withTimeout,
} from "./lib/public-capacity-harness.mjs";
import {
  isolatedMysqlRuntimeStopped,
  startIsolatedMysql,
  stopIsolatedMysql,
} from "./lib/isolated-mysql-runtime.mjs";
import {
  classifyMacosHostEvidence,
  createMacosHostEvidenceCollector,
} from "./lib/macos-host-evidence.mjs";
import {
  CAPACITY_ACCOUNT_COUNT,
  CAPACITY_CLUSTER_PATHS,
  LOOPBACK_HOST,
  MAP_ID,
  NodeWorker,
  clusterFixture,
  clusterHealth,
  isolatedMysqlActivity,
  isolatedMysqlAuthRevision,
  isolatedMysqlDeadlockCount,
  isolatedMysqlGlobalValues,
  isolatedMysqlVersion,
  loadMysqlBattleAuthority,
  mysqlBattleAuthorityFixture,
  mysqlBattleStoreOptions,
  request,
  reserveLoopbackPort,
  startValkey,
  stopExactChild,
  waitFor,
  waitForClusterReady,
  waitForLoopback,
} from "./run_valkey_two_node_event_gate.mjs";

const require = createRequire(import.meta.url);
const filePath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(filePath), "..");
const {PROTOCOL_VERSION, SERVER_VERSION} = require("../server/node/src/protocol");

const QUICK_DURATION_SECONDS = 120;
const FULL_DURATION_SECONDS = 1800;
const TICK_MS = 100;
const SAMPLE_MS = 1000;
const HTTP_TIMEOUT_MS = 5000;
const WS_TIMEOUT_MS = 15000;
const MAX_FAILURE_ROWS = 200;
const SOURCE_FILES = Object.freeze([
  "tools/run_valkey_two_node_capacity_soak.mjs",
  "tools/run_valkey_two_node_event_gate.mjs",
  "tools/lib/public-capacity-harness.mjs",
  "tools/lib/isolated-mysql-runtime.mjs",
  "tools/lib/macos-host-evidence.mjs",
  "server/node/src/auth-service.js",
  "server/node/src/auth/cluster-account-authority.js",
  "server/node/src/cluster-event-runtime-config.js",
  "server/node/src/event-hub.js",
  "server/node/src/http-server.js",
  "server/node/src/mysql-store.js",
  "server/node/src/mysql-transaction-guard.js",
  "server/node/src/valkey-account-owner.js",
  "server/node/src/valkey-stream-event-bridge.js",
]);

function parseArgs(argv) {
  const durationSeconds = integerOption(argv, "--duration-seconds", QUICK_DURATION_SECONDS);
  const fullRequested = argv.includes("--full");
  const quickRequested = argv.includes("--quick");
  if (durationSeconds < 1) {
    throw new Error("--duration-seconds must be at least 1");
  }
  if (fullRequested && durationSeconds < FULL_DURATION_SECONDS) {
    throw new Error(`--full requires --duration-seconds >= ${FULL_DURATION_SECONDS}`);
  }
  if (quickRequested && (durationSeconds < QUICK_DURATION_SECONDS || durationSeconds >= FULL_DURATION_SECONDS)) {
    throw new Error(`--quick requires ${QUICK_DURATION_SECONDS} <= --duration-seconds < ${FULL_DURATION_SECONDS}`);
  }
  const outputPath = stringOption(argv, "--output", "");
  if ((argv.includes("--output") || argv.some((value) => value.startsWith("--output="))) && outputPath === "") {
    throw new Error("--output requires a report path");
  }
  return Object.freeze({
    durationSeconds,
    full: durationSeconds >= FULL_DURATION_SECONDS,
    qualification: durationSeconds >= FULL_DURATION_SECONDS
      ? "full_30_minute"
      : (durationSeconds >= QUICK_DURATION_SECONDS ? "quick" : "development_smoke"),
    seed: stringOption(argv, "--seed", "p0_6d_two_node_capacity_v1"),
    outputPath,
  });
}

function integerOption(argv, name, fallback) {
  const value = stringOption(argv, name, "");
  if (value === "") {
    return fallback;
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new Error(`${name} must be an integer`);
  }
  return number;
}

function stringOption(argv, name, fallback) {
  const inline = argv.find((value) => value.startsWith(`${name}=`));
  if (inline) {
    return String(inline.slice(name.length + 1)).trim();
  }
  const index = argv.indexOf(name);
  if (index >= 0) {
    const value = String(argv[index + 1] || "").trim();
    return value.startsWith("--") ? "" : value;
  }
  return fallback;
}

async function runTwoNodeCapacitySoak(options) {
  // This gate owns an initialize-insecure disposable MySQL. Never inherit or
  // inspect player-server credentials while constructing the isolated lane.
  process.env.BEASTBOUND_MYSQL_PASSWORD = "";
  process.env.MYSQL_PWD = "";
  const schedulingPolicy = normalizeBenchmarkScheduling(process.pid);
  const startedAt = new Date().toISOString();
  const sourceStart = sourceFingerprint();
  const hostCollector = createMacosHostEvidenceCollector();
  let hostEvidence = null;
  let hostCollectionStarted = false;
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-two-node-capacity-"));
  const database = `beastbound_capacity_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  let mysqlRuntime = null;
  let admin = null;
  let observer = null;
  let bootstrap = null;
  let valkey = null;
  let nodeA = null;
  let nodeB = null;
  let scenario = null;
  let scenarioReport = null;
  let storageEvidence = null;
  let failure = null;
  let databaseDropped = false;
  const cleanupErrors = [];
  const failures = [];

  try {
    if (schedulingPolicy.required && schedulingPolicy.success !== true) {
      throw new Error(`benchmark scheduling normalization failed: ${schedulingPolicy.error}`);
    }
    const preflight = await hostCollector.preflight({
      durationMs: options.durationSeconds >= QUICK_DURATION_SECONDS ? 10000 : 2000,
      sampleIntervalMs: 1000,
    });
    if (
      options.durationSeconds >= QUICK_DURATION_SECONDS
      && (!preflight.classification || preflight.classification.environmentValid !== true)
    ) {
      throw new Error(`host preflight invalid: ${JSON.stringify(
        preflight.classification && preflight.classification.invalidReasons || [],
      )}`);
    }
    mysqlRuntime = await startIsolatedMysql({
      runtimePrefix: "beastbound-two-node-capacity-mysql",
      maxConnections: 80,
      memoryBytes: 256 * 1024 * 1024,
    });
    assert.notEqual(mysqlRuntime.port, 3306);
    const mysql = require("../server/node/node_modules/mysql2/promise");
    const {createMysqlAuthStore} = require("../server/node/src/mysql-store");
    admin = await mysql.createConnection(mysqlRuntime.connectionOptions);
    const mysqlVersion = await isolatedMysqlVersion(admin);
    assert.match(mysqlVersion, /^9\.7\./);
    const globalsBefore = await isolatedMysqlGlobalValues(admin);
    const deadlocksBefore = await isolatedMysqlDeadlockCount(admin);

    bootstrap = createMysqlAuthStore(mysqlBattleStoreOptions(mysqlRuntime, database, true));
    const empty = bootstrap.load();
    const fixture = clusterFixture(Date.now(), 0, {accountCount: CAPACITY_ACCOUNT_COUNT});
    await withTimeout(
      bootstrap.saveAsync(mysqlBattleAuthorityFixture(empty, fixture.data)),
      60000,
      "two-node capacity fixture bootstrap timeout",
    );
    await withTimeout(bootstrap.close(), 15000, "two-node capacity bootstrap close timeout");
    bootstrap = null;

    const seeded = await loadMysqlBattleAuthority(mysqlRuntime, database);
    assert.equal(Object.keys(seeded.accounts || {}).length, CAPACITY_ACCOUNT_COUNT);
    assert.equal(Object.keys(seeded.sessions || {}).length, CAPACITY_ACCOUNT_COUNT);
    observer = await mysql.createConnection({
      ...mysqlRuntime.connectionOptions,
      database: databaseIdentifier(database),
    });
    const revisionBefore = await isolatedMysqlAuthRevision(observer);

    const nodeUsers = ["capacity_node_a", "capacity_node_b"];
    for (const user of nodeUsers) {
      await admin.query(`CREATE USER '${user}'@'127.0.0.1' IDENTIFIED BY ''`);
      await admin.query(`GRANT ALL PRIVILEGES ON \`${databaseIdentifier(database)}\`.* TO '${user}'@'127.0.0.1'`);
    }

    const valkeyPort = await reserveLoopbackPort();
    const streamKey = `beastbound:test:two-node:capacity:${process.pid}`;
    valkey = startValkey(valkeyPort, temporaryRoot);
    await waitForLoopback(valkeyPort, valkey);
    const mysqlConfiguration = {
      port: mysqlRuntime.port,
      database,
      mysqlPath: mysqlRuntime.mysqlPath,
    };
    [nodeA, nodeB] = await Promise.all([
      NodeWorker.start({
        nodeId: "capacity-a",
        valkeyPort,
        streamKey,
        serviceEventSeq: 0,
        mysqlConfiguration: {...mysqlConfiguration, user: nodeUsers[0]},
        capacityMode: true,
        fixtureAccountCount: CAPACITY_ACCOUNT_COUNT,
      }),
      NodeWorker.start({
        nodeId: "capacity-b",
        valkeyPort,
        streamKey,
        serviceEventSeq: 0,
        mysqlConfiguration: {...mysqlConfiguration, user: nodeUsers[1]},
        capacityMode: true,
        fixtureAccountCount: CAPACITY_ACCOUNT_COUNT,
      }),
    ]);
    assert.deepEqual(nodeA.fixtureDigest, nodeB.fixtureDigest);
    assert.equal(nodeA.accounts.length, CAPACITY_ACCOUNT_COUNT);
    assert.equal(nodeB.accounts.length, CAPACITY_ACCOUNT_COUNT);
    await Promise.all([waitForClusterReady(nodeA), waitForClusterReady(nodeB)]);

    await hostCollector.start();
    hostCollectionStarted = true;
    scenario = new TwoNodeCapacityScenario([nodeA, nodeB], options, failures, hostCollector);
    scenarioReport = await scenario.run();
    hostEvidence = await hostCollector.stop();
    hostCollectionStarted = false;
    await waitFor(async () => {
      const healthRows = await Promise.all([clusterHealth(nodeA), clusterHealth(nodeB)]);
      return healthRows.every((row) => row.status === 200
        && Number(row.json && row.json.durableMutations && row.json.durableMutations.pending || 0) === 0
        && Number(row.json && row.json.durableMutations && row.json.durableMutations.running || 0) === 0);
    }, 15000, "two-node capacity durable drain timeout");

    await scenario.cleanup();
    await Promise.all([nodeA.stop(), nodeB.stop()]);
    const nodeDiagnostics = [nodeA.diagnostic(), nodeB.diagnostic()];
    nodeA = null;
    nodeB = null;

    const persisted = await loadMysqlBattleAuthority(mysqlRuntime, database);
    const revisionAfter = await isolatedMysqlAuthRevision(observer);
    let activity = null;
    await waitFor(async () => {
      activity = await isolatedMysqlActivity(observer);
      return activity.activeTransactions === 0 && activity.activeLockWaits === 0;
    }, 10000, "two-node capacity left MySQL activity");
    const deadlocksAfter = await isolatedMysqlDeadlockCount(admin);
    const globalsAfter = await isolatedMysqlGlobalValues(admin);
    assert.deepEqual(globalsAfter, globalsBefore);

    storageEvidence = {
      mysqlVersion,
      isolatedMysql: true,
      sharedPlayerDatabaseTouched: false,
      mysqlPortIsNot3306: mysqlRuntime.port !== 3306,
      authRevisionBefore: revisionBefore,
      authRevisionAfter: revisionAfter,
      authRevisionDelta: revisionAfter - revisionBefore,
      expectedChatCommitDelta: scenarioReport.correctness.chatAccepted,
      accounts: Object.keys(persisted.accounts || {}).length,
      sessions: Object.keys(persisted.sessions || {}).length,
      profiles: Object.keys(persisted.profiles || {}).length,
      chatMessages: Array.isArray(persisted.chatMessages) ? persisted.chatMessages.length : 0,
      serviceEvents: Array.isArray(persisted.serviceEvents) ? persisted.serviceEvents.length : 0,
      lastChatMarkerPersisted: Array.isArray(persisted.chatMessages)
        && persisted.chatMessages.some((row) => row && row.text === scenarioReport.correctness.lastChatText),
      mysqlGlobalValuesUnchanged: true,
      mysqlDeadlockDelta: deadlocksAfter - deadlocksBefore,
      mysqlResidualTransactions: activity.activeTransactions,
      mysqlResidualLockWaits: activity.activeLockWaits,
      nodeDiagnostics,
    };
    validateStorageEvidence(storageEvidence, failures);
  } catch (error) {
    failure = error;
  } finally {
    if (hostCollectionStarted) {
      try {
        hostEvidence = await hostCollector.stop();
        hostCollectionStarted = false;
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (scenario) {
      try {
        await scenario.cleanup();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    const nodeCleanup = await Promise.allSettled([
      nodeA && nodeA.stop(false),
      nodeB && nodeB.stop(false),
    ]);
    for (const result of nodeCleanup) {
      if (result.status === "rejected") {
        cleanupErrors.push(result.reason);
      }
    }
    if (bootstrap) {
      try {
        await withTimeout(bootstrap.close(), 15000, "two-node capacity bootstrap cleanup timeout");
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (observer) {
      try {
        await observer.end();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (admin) {
      try {
        await admin.query(`DROP DATABASE IF EXISTS \`${databaseIdentifier(database)}\``);
        const [rows] = await admin.query(
          "SELECT COUNT(*) AS rowCount FROM information_schema.schemata WHERE schema_name = ?",
          [database],
        );
        databaseDropped = Number(rows[0] && rows[0].rowCount || 0) === 0;
      } catch (error) {
        cleanupErrors.push(error);
      }
      try {
        await admin.end();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (valkey) {
      try {
        await stopExactChild(valkey.process);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (mysqlRuntime) {
      try {
        await stopIsolatedMysql(mysqlRuntime);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    fs.rmSync(temporaryRoot, {recursive: true, force: true});
  }

  if (!failure && cleanupErrors.length > 0) {
    failure = cleanupErrors[0];
  }
  const mysqlCleanupVerified = Boolean(
    mysqlRuntime
    && isolatedMysqlRuntimeStopped(mysqlRuntime)
    && !fs.existsSync(mysqlRuntime.runtimeDir),
  );
  const temporaryStateRemoved = !fs.existsSync(temporaryRoot) && mysqlCleanupVerified;
  if (!databaseDropped) {
    failures.push("temporary capacity database was not proven dropped");
  }
  if (!temporaryStateRemoved) {
    failures.push("temporary capacity runtime was not fully removed");
  }
  if (failure) {
    failures.push(String(failure && failure.stack || failure));
  }
  const sourceFinish = sourceFingerprint();
  if (sourceFinish.digest !== sourceStart.digest) {
    failures.push("capacity source fingerprint changed during the run");
  }
  hostEvidence ||= hostCollector.report();
  const hostClassification = classifyMacosHostEvidence(hostEvidence);
  if (
    options.durationSeconds >= QUICK_DURATION_SECONDS
    && hostClassification.environmentValid !== true
  ) {
    for (const reason of hostClassification.invalidReasons || ["host_evidence_invalid"]) {
      failures.push(`host environment invalid: ${reason}`);
    }
  }
  const uniqueFailures = [...new Set(failures.map(String))].slice(0, MAX_FAILURE_ROWS);
  const fullProof = options.full && uniqueFailures.length === 0;
  const report = {
    status: uniqueFailures.length === 0 ? "PASS" : "FAIL",
    schemaVersion: 1,
    gate: "valkey_two_node_200_connection_long_soak",
    qualification: options.qualification,
    qualified: uniqueFailures.length === 0,
    twoHundredConnectionSoakProven: fullProof,
    engine: "two_real_node_processes_loopback_valkey_isolated_mysql",
    startedAt,
    finishedAt: new Date().toISOString(),
    metadata: {
      durationSeconds: options.durationSeconds,
      accountCount: CAPACITY_ACCOUNT_COUNT,
      nodeCount: 2,
      clientsPerNode: CAPACITY_ACCOUNT_COUNT / 2,
      seed: options.seed,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: os.cpus()[0] && os.cpus()[0].model || "unknown",
      memoryGiB: round(os.totalmem() / 1073741824),
      schedulingPolicy,
      sourceStart,
      sourceFinish,
    },
    environment: {
      required: options.durationSeconds >= QUICK_DURATION_SECONDS,
      classification: hostClassification,
      evidence: hostEvidence,
    },
    result: scenarioReport,
    storage: storageEvidence,
    boundaries: {
      broadNetworkPartitionRecoveryProven: false,
      mysqlNetworkPartitionRecoveryProven: false,
      crossNodeNormalBattleCommandRoutingProven: false,
      battleRuntimeReconnectHydrationProven: false,
      reverseProxyTlsProven: false,
    },
    cleanup: {
      temporaryDatabaseDropped: databaseDropped,
      mysqlCleanupVerified,
      temporaryStateRemoved,
    },
    failures: uniqueFailures,
  };
  emitReport(report, options.outputPath);
  if (uniqueFailures.length > 0) {
    process.exitCode = 1;
  }
}

class TwoNodeCapacityScenario {
  constructor(nodes, options, failures, hostCollector = null) {
    this.nodes = nodes;
    this.options = options;
    this.failures = failures;
    this.hostCollector = hostCollector;
    this.random = seededRandom(options.seed);
    this.states = [];
    this.stateByAccountId = new Map();
    this.socketHistory = [];
    this.latencies = null;
    this.delivery = null;
    this.pending = new Set();
    this.metricSamples = [];
    this.reconnectRows = [];
    this.reconnectBusy = false;
    this.deliveryTrackingPaused = false;
    this.metricsBusy = false;
    this.chatBusy = false;
    this.movementCursor = 0;
    this.heartbeatCursor = 0;
    this.profileCursor = 0;
    this.partyCursor = 0;
    this.chatCursor = 0;
    this.reconnectCursor = 0;
    this.startedAt = 0;
    this.finishedAt = 0;
    this.previousCpuByNode = new Map();
    this.previousCpuSampleAt = null;
    this.correctness = {
      initialPositions: 0,
      initialConnections: 0,
      movementAccepted: 0,
      heartbeatAccepted: 0,
      profileReads: 0,
      partyReads: 0,
      chatAccepted: 0,
      chatSkippedBusy: 0,
      requestFailures: 0,
      reconnects: 0,
      reconnectStorms: 0,
      lastChatText: "",
    };
  }

  async run() {
    await this.setup();
    this.startedAt = performance.now();
    this.latencies = new LatencyBook(this.options.durationSeconds * 1000, {
      firstWindowStartMs: this.options.full ? 5 * 60 * 1000 : 0,
    });
    this.delivery = new CrossNodeDeliveryTracker(this.latencies);
    await this.collectMetrics(0);
    const timeline = reconnectTimeline(this.options.durationSeconds);
    let timelineIndex = 0;
    let tick = 0;
    let nextTickAt = this.startedAt;
    const durationMs = this.options.durationSeconds * 1000;
    while (performance.now() - this.startedAt < durationMs) {
      const elapsedMs = performance.now() - this.startedAt;
      this.scheduleMovement(elapsedMs, 4);
      this.scheduleHeartbeat(elapsedMs);
      if (tick % 5 === 0) {
        this.scheduleProfileRead(elapsedMs);
      }
      if (tick % 5 === 2) {
        this.schedulePartyRead(elapsedMs);
      }
      if (tick % 10 === 0) {
        this.scheduleChat(elapsedMs);
        this.scheduleMetricSample(elapsedMs);
      }
      if (tick % 100 === 0) {
        for (const state of this.states) {
          state.socket && !state.socket.closed && state.socket.sendPing();
        }
      }
      while (timelineIndex < timeline.length && elapsedMs >= timeline[timelineIndex].atMs) {
        const event = timeline[timelineIndex++];
        if (this.reconnectBusy) {
          this.pushFailure(`reconnect event ${event.id} overlapped the previous reconnect`);
        } else {
          this.track(this.runReconnectEvent(event), `reconnect ${event.id}`);
        }
      }
      this.delivery.expire(performance.now());
      tick += 1;
      if (tick % Math.round(60000 / TICK_MS) === 0) {
        const latestMetrics = this.metricSamples.at(-1);
        process.stderr.write(
          `[two-node-capacity] elapsed=${Math.floor(elapsedMs / 1000)}s`
          + ` clients=${sum((latestMetrics && latestMetrics.nodes || []).map((row) => row.clients))}`
          + ` moves=${this.correctness.movementAccepted}`
          + ` chats=${this.correctness.chatAccepted}`
          + ` reconnects=${this.correctness.reconnects}`
          + ` failures=${this.failures.length}\n`,
        );
      }
      nextTickAt += TICK_MS;
      await delay(Math.max(0, nextTickAt - performance.now()));
    }
    this.finishedAt = performance.now();
    await withTimeout(
      Promise.allSettled([...this.pending]),
      30000,
      "two-node capacity pending operations did not settle",
    );
    await delay(1000);
    this.delivery.expire(performance.now(), true);
    await this.collectMetrics(this.finishedAt - this.startedAt);
    const report = this.report();
    this.validate(report);
    report.failures = [...new Set(this.failures.map(String))].slice(0, MAX_FAILURE_ROWS);
    report.qualified = report.failures.length === 0;
    return report;
  }

  async setup() {
    for (const node of this.nodes) {
      assert.equal(
        node.schedulingPolicy && node.schedulingPolicy.success,
        true,
        `${node.nodeId} scheduling policy was not normalized`,
      );
    }
    const accounts = this.nodes[0].accounts;
    assert.equal(accounts.length, CAPACITY_ACCOUNT_COUNT);
    this.states = accounts.map((account, index) => {
      const nodeIndex = index % 2;
      const cluster = Math.floor(index / 50);
      const state = {
        index,
        account,
        nodeIndex,
        cluster,
        path: CAPACITY_CLUSTER_PATHS[cluster],
        pathIndex: index % CAPACITY_CLUSTER_PATHS[cluster].length,
        positionBusy: false,
        paused: false,
        socket: null,
        isSentinel: false,
      };
      this.stateByAccountId.set(account.accountId, state);
      return state;
    });
    for (let cluster = 0; cluster < CAPACITY_CLUSTER_PATHS.length; cluster += 1) {
      for (let nodeIndex = 0; nodeIndex < this.nodes.length; nodeIndex += 1) {
        const sentinel = this.states.find((state) => state.cluster === cluster && state.nodeIndex === nodeIndex);
        assert.ok(sentinel);
        sentinel.isSentinel = true;
      }
    }

    await mapWithConcurrency(this.states, 16, async (state) => {
      const [cellX, cellY] = state.path[state.pathIndex];
      const result = await request(this.nodes[state.nodeIndex], "/players/position", {
        method: "POST",
        token: state.account.token,
        body: positionBody(cellX, cellY, "south", false),
        timeoutMs: HTTP_TIMEOUT_MS,
      });
      assert.equal(result.status, 200, `initial position ${state.index}: ${JSON.stringify(result.json)}`);
      assert.equal(result.json && result.json.ok, true);
      this.correctness.initialPositions += 1;
    });

    await mapWithConcurrency(this.states, 20, async (state) => {
      const socket = this.createSocket(state, 0, "", []);
      state.socket = socket;
      await socket.connect(WS_TIMEOUT_MS);
      this.correctness.initialConnections += 1;
    });
    assert.equal(this.correctness.initialConnections, CAPACITY_ACCOUNT_COUNT);
    const healthRows = await Promise.all(this.nodes.map((node) => clusterHealth(node)));
    assert.deepEqual(healthRows.map((row) => row.status), [200, 200]);
    assert.deepEqual(
      healthRows.map((row) => Number(row.json && row.json.eventStream && row.json.eventStream.clients || 0)),
      [100, 100],
    );
    // Worker histograms begin at process startup. Discard fixture load and the
    // deliberate 200-socket bootstrap so the timed gate measures steady-state
    // work and reconnect storms rather than untimed setup.
    await Promise.all(this.nodes.map((node) => node.rpc("capacity-metrics")));
    await delay(50);
  }

  createSocket(state, cursor, epoch, presenceRevisions) {
    const query = new URLSearchParams({
      clientVersion: SERVER_VERSION,
      clientProtocolVersion: String(PROTOCOL_VERSION),
      lastEventSeq: String(Math.max(0, Number(cursor || 0))),
    });
    if (epoch) {
      query.set("eventStreamEpoch", epoch);
    }
    return new RawJsonWebSocket({
      host: LOOPBACK_HOST,
      port: this.nodes[state.nodeIndex].port,
      path: `/events?${query.toString()}`,
      index: state.index,
      expectedAccountId: state.account.accountId,
      lastEventSeq: cursor,
      initialPresenceRevisions: presenceRevisions,
      headers: {Authorization: `Bearer ${state.account.token}`},
      onEvent: (_index, event, _bytes, receivedAt) => this.onSocketEvent(state, event, receivedAt),
    });
  }

  onSocketEvent(observerState, event, receivedAt) {
    if (!observerState.isSentinel || this.deliveryTrackingPaused || !this.delivery) {
      return;
    }
    if (event && event.type === "online.position") {
      const source = this.stateByAccountId.get(String(event.accountId || ""));
      if (!source || source.cluster !== observerState.cluster || source.nodeIndex === observerState.nodeIndex) {
        return;
      }
      const revision = Math.max(0, Math.trunc(Number(event.presenceRevision || 0)));
      if (revision > 0) {
        this.delivery.observe("position", `${source.account.accountId}:${revision}`, receivedAt);
      }
      return;
    }
    if (event && event.type === "chat.message" && event.message) {
      const text = String(event.message.text || "");
      const source = this.delivery.chatSource(text);
      if (!source || source.cluster !== observerState.cluster || source.nodeIndex === observerState.nodeIndex) {
        return;
      }
      this.delivery.observe("chat", text, receivedAt);
    }
  }

  scheduleMovement(elapsedMs, count) {
    for (let offset = 0; offset < count; offset += 1) {
      const state = this.states[this.movementCursor % this.states.length];
      this.movementCursor += 1;
      if (!state.paused && !state.positionBusy) {
        this.track(this.move(state, elapsedMs), `movement ${state.index}`);
      }
    }
  }

  async move(state, elapsedMs) {
    state.positionBusy = true;
    const fromIndex = state.pathIndex;
    const nextIndex = (fromIndex + 1) % state.path.length;
    const [fromCellX, fromCellY] = state.path[fromIndex];
    const [toCellX, toCellY] = state.path[nextIndex];
    const startedAt = performance.now();
    try {
      const result = await request(this.nodes[state.nodeIndex], "/movement/step", {
        method: "POST",
        token: state.account.token,
        body: {
          mapId: MAP_ID,
          fromCellX,
          fromCellY,
          toCellX,
          toCellY,
          facing: movementFacing(fromCellX, fromCellY, toCellX, toCellY),
          moving: true,
          aoiRadius: 18,
        },
        timeoutMs: HTTP_TIMEOUT_MS,
      });
      this.recordRequest("movement", result, elapsedMs);
      if (!result.ok || result.status !== 200) {
        this.recordRequestFailure("movement", state, result);
        return;
      }
      state.pathIndex = nextIndex;
      this.correctness.movementAccepted += 1;
      if (!this.deliveryTrackingPaused) {
        const revision = Math.max(0, Math.trunc(Number(
          result.json && (
            result.json.presenceRevision
            || result.json.position && result.json.position.presenceRevision
          )
          || 0,
        )));
        if (revision > 0) {
          this.delivery.expect("position", `${state.account.accountId}:${revision}`, startedAt);
        }
      }
    } finally {
      state.positionBusy = false;
    }
  }

  scheduleHeartbeat(elapsedMs) {
    const state = this.states[this.heartbeatCursor % this.states.length];
    this.heartbeatCursor += 1;
    if (!state.paused && !state.positionBusy) {
      this.track(this.heartbeat(state, elapsedMs), `heartbeat ${state.index}`);
    }
  }

  async heartbeat(state, elapsedMs) {
    state.positionBusy = true;
    try {
      const [cellX, cellY] = state.path[state.pathIndex];
      const result = await request(this.nodes[state.nodeIndex], "/players/position", {
        method: "POST",
        token: state.account.token,
        body: positionBody(cellX, cellY, "south", false),
        timeoutMs: HTTP_TIMEOUT_MS,
      });
      this.recordRequest("heartbeat", result, elapsedMs);
      if (result.ok && result.status === 200) {
        this.correctness.heartbeatAccepted += 1;
      } else {
        this.recordRequestFailure("heartbeat", state, result);
      }
    } finally {
      state.positionBusy = false;
    }
  }

  scheduleProfileRead(elapsedMs) {
    const state = this.states[this.profileCursor % this.states.length];
    this.profileCursor += 1;
    if (!state.paused) {
      this.track(this.simpleRead(state, "/profiles/me", "profile_read", elapsedMs), `profile read ${state.index}`);
    }
  }

  schedulePartyRead(elapsedMs) {
    const state = this.states[this.partyCursor % this.states.length];
    this.partyCursor += 1;
    if (!state.paused) {
      this.track(this.simpleRead(state, "/party/state", "party_read", elapsedMs), `party read ${state.index}`);
    }
  }

  async simpleRead(state, pathname, category, elapsedMs) {
    const result = await request(this.nodes[state.nodeIndex], pathname, {
      token: state.account.token,
      timeoutMs: HTTP_TIMEOUT_MS,
    });
    this.recordRequest(category, result, elapsedMs);
    if (result.ok && result.status === 200) {
      if (category === "profile_read") {
        this.correctness.profileReads += 1;
      } else {
        this.correctness.partyReads += 1;
      }
    } else {
      this.recordRequestFailure(category, state, result);
    }
  }

  scheduleChat(elapsedMs) {
    if (this.chatBusy) {
      this.correctness.chatSkippedBusy += 1;
      return;
    }
    this.track(this.sendChat(elapsedMs), "nearby chat");
  }

  async sendChat(elapsedMs) {
    this.chatBusy = true;
    const source = this.states.find((state) => state.nodeIndex === 0 && state.cluster === 0 && !state.paused);
    if (!source) {
      this.chatBusy = false;
      return;
    }
    const text = `双节点长稳-${String(++this.chatCursor).padStart(6, "0")}`;
    const startedAt = performance.now();
    this.delivery.registerChat(text, source);
    try {
      const result = await request(this.nodes[source.nodeIndex], "/chat/send", {
        method: "POST",
        token: source.account.token,
        body: {channel: "nearby", text},
        timeoutMs: HTTP_TIMEOUT_MS,
      });
      this.recordRequest("chat_write", result, elapsedMs);
      if (!result.ok || result.status !== 200) {
        this.recordRequestFailure("chat_write", source, result);
        return;
      }
      this.correctness.chatAccepted += 1;
      this.correctness.lastChatText = text;
      if (!this.deliveryTrackingPaused) {
        this.delivery.expect("chat", text, startedAt);
      }
    } finally {
      this.chatBusy = false;
    }
  }

  scheduleMetricSample(elapsedMs) {
    if (this.metricsBusy) {
      return;
    }
    this.track(this.collectMetrics(elapsedMs), "metric sample");
  }

  async collectMetrics(elapsedMs) {
    this.metricsBusy = true;
    try {
      const rows = await Promise.all(this.nodes.map(async (node) => {
        const startedAt = performance.now();
        const [health, processMetrics] = await Promise.all([
          clusterHealth(node),
          node.rpc("capacity-metrics"),
        ]);
        const healthElapsedMs = performance.now() - startedAt;
        if (this.latencies) {
          this.latencies.record("health_read", healthElapsedMs, {
            elapsedMs,
            ok: health.status === 200 && health.json && health.json.ok === true,
            code: String(health.json && health.json.code || health.status),
          });
        }
        if (health.status !== 200 || !health.json || health.json.ok !== true) {
          this.pushFailure(`health ${node.nodeId} failed ${health.status}`);
        }
        return {
          nodeId: node.nodeId,
          clients: Number(health.json && health.json.eventStream && health.json.eventStream.clients || 0),
          relay: health.json && health.json.eventStream && health.json.eventStream.clusterRelay || null,
          durable: health.json && health.json.durableMutations || null,
          ownership: health.json && health.json.accountOwnership || null,
          storage: health.json && health.json.storage || null,
          process: processMetrics,
        };
      }));
      const sampledAt = performance.now();
      const cpuSampleDurationMs = this.previousCpuSampleAt === null
        ? 0
        : sampledAt - this.previousCpuSampleAt;
      let childCpuPercentOneCore = 0;
      for (const row of rows) {
        const resource = row.process && row.process.resourceUsage || {};
        const totalMicros = Number(resource.userCpuTime || 0) + Number(resource.systemCpuTime || 0);
        const previous = this.previousCpuByNode.get(row.nodeId);
        if (previous !== undefined && cpuSampleDurationMs > 0) {
          childCpuPercentOneCore += Math.max(0, totalMicros - previous) / (cpuSampleDurationMs * 1000) * 100;
        }
        this.previousCpuByNode.set(row.nodeId, totalMicros);
      }
      this.previousCpuSampleAt = sampledAt;
      this.hostCollector?.recordWorkloadSample({
        serverCpuPercentOneCore: childCpuPercentOneCore,
        elapsedMs,
      });
      this.metricSamples.push({elapsedMs: round(elapsedMs), nodes: rows});
    } finally {
      this.metricsBusy = false;
    }
  }

  async runReconnectEvent(event) {
    this.reconnectBusy = true;
    this.deliveryTrackingPaused = true;
    const startedAt = performance.now();
    const selected = Array.from({length: event.count}, (_, offset) => (
      this.states[(this.reconnectCursor + offset) % this.states.length]
    ));
    this.reconnectCursor = (this.reconnectCursor + event.count) % this.states.length;
    const connectionTimes = [];
    try {
      for (const state of selected) {
        state.paused = true;
        if (state.socket) {
          state.socket.expectedClose = true;
          state.socket.terminate();
          this.socketHistory.push(state.socket);
        }
      }
      await delay(50);
      await mapWithConcurrency(selected, 32, async (state) => {
        const jitterMs = event.jitterMs > 0 ? Math.floor(this.random() * event.jitterMs) : 0;
        await delay(jitterMs);
        const previous = state.socket;
        const connectedAt = performance.now();
        const socket = this.createSocket(
          state,
          previous && previous.lastEventSeq || 0,
          previous && previous.epoch || "",
          previous ? [...previous.presenceRevisions.entries()] : [],
        );
        state.socket = socket;
        await socket.connect(WS_TIMEOUT_MS);
        const connectionMs = performance.now() - connectedAt;
        connectionTimes.push(connectionMs);
        this.latencies.record("ws_reconnect", connectionMs, {
          elapsedMs: connectedAt - this.startedAt,
          ok: true,
        });
        state.paused = false;
        this.correctness.reconnects += 1;
      });
      this.correctness.reconnectStorms += 1;
      this.reconnectRows.push({
        id: event.id,
        count: event.count,
        jitterMs: event.jitterMs,
        wallMs: round(performance.now() - startedAt),
        connectionP95Ms: percentile(connectionTimes, 0.95),
        connectionMaxMs: round(Math.max(0, ...connectionTimes)),
      });
    } finally {
      for (const state of selected) {
        state.paused = false;
      }
      this.deliveryTrackingPaused = false;
      this.reconnectBusy = false;
    }
  }

  recordRequest(category, result, elapsedMs) {
    this.latencies.record(category, Number(result && result.elapsedMs || 0), {
      elapsedMs,
      ok: Boolean(result && result.ok && result.status === 200),
      code: String(result && result.json && result.json.code || result && result.status || "unknown"),
    });
  }

  recordRequestFailure(category, state, result) {
    this.correctness.requestFailures += 1;
    this.pushFailure(
      `${category} account=${state.index} failed ${String(result && result.status)}/${String(result && result.json && result.json.code || "unknown")}`,
    );
  }

  track(promise, label) {
    if (this.pending.size >= 512) {
      this.pushFailure(`pending operation capacity exceeded before ${label}`);
      return;
    }
    const tracked = Promise.resolve(promise).catch((error) => {
      this.pushFailure(`${label}: ${String(error && error.message || error)}`);
    }).finally(() => this.pending.delete(tracked));
    this.pending.add(tracked);
  }

  pushFailure(message) {
    if (this.failures.length < MAX_FAILURE_ROWS) {
      this.failures.push(String(message));
    }
  }

  report() {
    const currentSockets = this.states.map((state) => state.socket).filter(Boolean);
    const socketSummaries = [...this.socketHistory, ...currentSockets].map((socket) => socket.summary());
    return {
      durationMs: round(this.finishedAt - this.startedAt),
      correctness: {...this.correctness},
      latencies: this.latencies.summary(),
      delivery: this.delivery.summary(),
      reconnects: this.reconnectRows,
      sockets: {
        currentConnected: currentSockets.filter((socket) => !socket.closed).length,
        generations: socketSummaries.length,
        receivedFrames: sum(socketSummaries.map((row) => row.receivedFrames)),
        receivedBytes: sum(socketSummaries.map((row) => row.receivedBytes)),
        positionBatchFrames: sum(socketSummaries.map((row) => row.receivedBatchFrames)),
        positionBatchDeltas: sum(socketSummaries.map((row) => row.receivedBatchDeltas)),
        eventSeqRegressions: sum(socketSummaries.map((row) => row.eventSeqRegressions)),
        eventSeqDuplicates: sum(socketSummaries.map((row) => row.eventSeqDuplicates)),
        presenceRevisionRegressions: sum(socketSummaries.map((row) => row.presenceRevisionRegressions)),
        protocolErrors: sum(socketSummaries.map((row) => row.protocolErrors)),
        unexpectedCloses: sum(socketSummaries.map((row) => row.unexpectedCloseCount)),
      },
      metrics: metricSummary(this.metricSamples, this.options.durationSeconds),
      failures: [],
      qualified: false,
    };
  }

  validate(report) {
    const minimumMovement = this.options.durationSeconds * 20;
    const minimumHeartbeat = this.options.durationSeconds * 5;
    const minimumReads = this.options.durationSeconds;
    const minimumChat = Math.floor(this.options.durationSeconds * 0.8);
    check(this.failures, report.durationMs >= this.options.durationSeconds * 1000, "scheduler ended before requested duration");
    check(this.failures, report.correctness.initialPositions === CAPACITY_ACCOUNT_COUNT, "initial position count is not 200");
    check(this.failures, report.correctness.initialConnections === CAPACITY_ACCOUNT_COUNT, "initial websocket count is not 200");
    check(this.failures, report.sockets.currentConnected === CAPACITY_ACCOUNT_COUNT, "final websocket count is not 200");
    check(this.failures, report.correctness.movementAccepted >= minimumMovement, `movement throughput ${report.correctness.movementAccepted}/${minimumMovement}`);
    check(this.failures, report.correctness.heartbeatAccepted >= minimumHeartbeat, `heartbeat throughput ${report.correctness.heartbeatAccepted}/${minimumHeartbeat}`);
    check(this.failures, report.correctness.profileReads + report.correctness.partyReads >= minimumReads, "read throughput below contract");
    check(this.failures, report.correctness.chatAccepted >= minimumChat, `chat throughput ${report.correctness.chatAccepted}/${minimumChat}`);
    check(this.failures, report.correctness.requestFailures === 0, `request failures ${report.correctness.requestFailures}`);
    check(this.failures, report.delivery.position.missing === 0, `cross-node position missing ${report.delivery.position.missing}`);
    check(this.failures, report.delivery.chat.missing === 0, `cross-node chat missing ${report.delivery.chat.missing}`);
    check(this.failures, report.delivery.position.delivered === report.delivery.position.expected, "cross-node position delivery mismatch");
    check(this.failures, report.delivery.chat.delivered === report.delivery.chat.expected, "cross-node chat delivery mismatch");
    for (const field of ["eventSeqRegressions", "eventSeqDuplicates", "presenceRevisionRegressions", "protocolErrors", "unexpectedCloses"]) {
      check(this.failures, report.sockets[field] === 0, `${field}=${report.sockets[field]}`);
    }
    checkLatency(this.failures, report.latencies, "movement", 75, 150);
    checkLatency(this.failures, report.latencies, "heartbeat", 75, 150);
    checkLatency(this.failures, report.latencies, "profile_read", 250, 500);
    checkLatency(this.failures, report.latencies, "party_read", 250, 500);
    checkLatency(this.failures, report.latencies, "chat_write", 250, 500);
    checkLatency(this.failures, report.latencies, "ws_position_cross_node", 150, 300);
    checkLatency(this.failures, report.latencies, "ws_chat_cross_node", 150, 300);
    checkLatency(this.failures, report.latencies, "ws_reconnect", 2000, 5000);
    check(this.failures, report.metrics.samples >= Math.floor(this.options.durationSeconds * 0.8), "metric sample coverage too low");
    check(this.failures, report.metrics.finalClients === CAPACITY_ACCOUNT_COUNT, `health final clients ${report.metrics.finalClients}/200`);
    check(this.failures, report.metrics.readyFailures === 0, `health readiness failures ${report.metrics.readyFailures}`);
    check(this.failures, report.metrics.durable.queueFull === 0, "durable queue full observed");
    check(this.failures, report.metrics.durable.timeouts === 0, "durable timeout observed");
    check(this.failures, report.metrics.durable.failed === 0, "durable failure observed");
    check(this.failures, report.metrics.durable.finalPending === 0, "durable pending did not drain");
    check(this.failures, report.metrics.durable.finalRunning === 0, "durable running did not drain");
    check(this.failures, report.metrics.eventLoop.p95Ms <= 20, `event-loop p95 ${report.metrics.eventLoop.p95Ms}ms > 20ms`);
    check(this.failures, report.metrics.eventLoop.p99Ms <= 50, `event-loop p99 ${report.metrics.eventLoop.p99Ms}ms > 50ms`);
    check(this.failures, report.metrics.eventLoop.maxMs <= 250, `event-loop max ${report.metrics.eventLoop.maxMs}ms > 250ms`);
    check(this.failures, report.metrics.gc.available === true, `GC telemetry unavailable: ${report.metrics.gc.unavailableReasons.join(",")}`);
    for (const row of report.reconnects) {
      const limit = row.count >= 200 ? 10000 : (row.count >= 50 ? 5000 : 2000);
      check(this.failures, row.connectionMaxMs <= limit, `${row.id} reconnect max ${row.connectionMaxMs}ms > ${limit}ms`);
    }
    if (this.options.full) {
      for (const node of report.metrics.nodes) {
        check(this.failures, node.heapNetGrowthMiB <= 64, `${node.nodeId} heap growth ${node.heapNetGrowthMiB}MiB > 64MiB`);
        check(this.failures, node.heapSlopeMiBPerMinute <= 1, `${node.nodeId} heap slope ${node.heapSlopeMiBPerMinute}MiB/min > 1`);
        check(this.failures, node.rssNetGrowthMiB <= 256, `${node.nodeId} RSS growth ${node.rssNetGrowthMiB}MiB > 256MiB`);
        check(this.failures, node.rssSlopeMiBPerMinute <= 2, `${node.nodeId} RSS slope ${node.rssSlopeMiBPerMinute}MiB/min > 2`);
      }
      for (const category of ["movement", "heartbeat", "profile_read", "party_read", "chat_write", "ws_position_cross_node", "ws_chat_cross_node"]) {
        const row = report.latencies[category];
        if (row && row.first.count > 0 && row.last.count > 0) {
          const additive = category === "chat_write" ? 50 : 25;
          const allowance = Math.max(row.first.p95Ms * 1.5, row.first.p95Ms + additive);
          check(this.failures, row.last.p95Ms <= allowance, `${category} last p95 ${row.last.p95Ms}ms > ${round(allowance)}ms`);
        }
      }
      check(this.failures, report.reconnects.some((row) => row.count === 50), "full gate missed 50-client storm");
      check(this.failures, report.reconnects.some((row) => row.count === 200), "full gate missed 200-client storm");
    }
  }

  async cleanup() {
    for (const state of this.states) {
      if (state.socket) {
        state.socket.expectedClose = true;
        state.socket.terminate();
      }
    }
    await delay(50);
  }
}

class CrossNodeDeliveryTracker {
  constructor(latencies) {
    this.latencies = latencies;
    this.early = new Map();
    this.pending = new Map();
    this.chatSources = new Map();
    this.rows = {
      position: {expected: 0, delivered: 0, missing: 0},
      chat: {expected: 0, delivered: 0, missing: 0},
    };
  }

  registerChat(text, source) {
    this.chatSources.set(text, source);
    if (this.chatSources.size > 4096) {
      this.chatSources.delete(this.chatSources.keys().next().value);
    }
  }

  chatSource(text) {
    return this.chatSources.get(text) || null;
  }

  expect(kind, key, startedAt) {
    const composite = `${kind}:${key}`;
    this.rows[kind].expected += 1;
    const early = this.early.get(composite);
    if (early !== undefined) {
      this.early.delete(composite);
      this.record(kind, early - startedAt);
      return;
    }
    this.pending.set(composite, {kind, startedAt, deadline: performance.now() + 5000});
  }

  observe(kind, key, receivedAt) {
    const composite = `${kind}:${key}`;
    const pending = this.pending.get(composite);
    if (pending) {
      this.pending.delete(composite);
      this.record(kind, receivedAt - pending.startedAt);
      return;
    }
    this.early.set(composite, receivedAt);
    while (this.early.size > 8192) {
      this.early.delete(this.early.keys().next().value);
    }
  }

  record(kind, latencyMs) {
    this.rows[kind].delivered += 1;
    this.latencies.record(`ws_${kind}_cross_node`, Math.max(0, latencyMs), {ok: true});
  }

  expire(now, force = false) {
    for (const [key, pending] of this.pending) {
      if (!force && pending.deadline > now) {
        continue;
      }
      this.pending.delete(key);
      this.rows[pending.kind].missing += 1;
    }
  }

  summary() {
    return {
      position: {...this.rows.position},
      chat: {...this.rows.chat},
      earlyBuffered: this.early.size,
      pending: this.pending.size,
    };
  }
}

function reconnectTimeline(durationSeconds) {
  if (durationSeconds >= FULL_DURATION_SECONDS) {
    return [
      {id: "rolling_5m", atMs: 300000, count: 10, jitterMs: 2000},
      {id: "rolling_10m", atMs: 600000, count: 10, jitterMs: 2000},
      {id: "storm_50", atMs: 720000, count: 50, jitterMs: 2000},
      {id: "rolling_15m", atMs: 900000, count: 10, jitterMs: 2000},
      {id: "rolling_20m", atMs: 1200000, count: 10, jitterMs: 2000},
      {id: "storm_200", atMs: 1320000, count: 200, jitterMs: 5000},
      {id: "rolling_25m", atMs: 1500000, count: 10, jitterMs: 2000},
    ];
  }
  if (durationSeconds >= QUICK_DURATION_SECONDS) {
    return [
      {id: "quick_rolling_10", atMs: 30000, count: 10, jitterMs: 1000},
      {id: "quick_storm_50", atMs: Math.floor(durationSeconds * 600), count: 50, jitterMs: 2000},
    ];
  }
  if (durationSeconds >= 10) {
    return [{id: "smoke_reconnect_10", atMs: Math.floor(durationSeconds * 500), count: 10, jitterMs: 250}];
  }
  return [];
}

function metricSummary(samples, durationSeconds) {
  const nodeIds = [...new Set(samples.flatMap((sample) => sample.nodes.map((row) => row.nodeId)))];
  const nodes = nodeIds.map((nodeId) => nodeMetricSummary(samples, nodeId, durationSeconds));
  const loopP95 = samples.flatMap((sample) => sample.nodes.map((row) => Number(row.process && row.process.eventLoop && row.process.eventLoop.p95Ms || 0)));
  const loopP99 = samples.flatMap((sample) => sample.nodes.map((row) => Number(row.process && row.process.eventLoop && row.process.eventLoop.p99Ms || 0)));
  const loopMax = samples.flatMap((sample) => sample.nodes.map((row) => Number(row.process && row.process.eventLoop && row.process.eventLoop.maxMs || 0)));
  const final = samples.at(-1);
  const durableRows = samples.flatMap((sample) => sample.nodes.map((row) => row.durable || {}));
  return {
    samples: samples.length,
    finalClients: sum((final && final.nodes || []).map((row) => row.clients)),
    minimumClients: samples.length > 0 ? Math.min(...samples.map((sample) => sum(sample.nodes.map((row) => row.clients)))) : 0,
    readyFailures: samples.flatMap((sample) => sample.nodes).filter((row) => !row.ownership || row.ownership.ok !== true || !row.relay || row.relay.runtimeHealthy !== true).length,
    eventLoop: {
      p95Ms: percentile(loopP95, 0.95),
      p99Ms: percentile(loopP99, 0.99),
      maxMs: round(Math.max(0, ...loopMax)),
      hotspots: eventLoopHotspots(samples),
    },
    gc: capacityGcSummary(samples),
    durable: {
      queueFull: Math.max(0, ...durableRows.map((row) => Number(row.queueFull || 0))),
      timeouts: Math.max(0, ...durableRows.map((row) => Number(row.timeouts || 0))),
      failed: Math.max(0, ...durableRows.map((row) => Number(row.failed || 0))),
      peakPending: Math.max(0, ...durableRows.map((row) => Number(row.pending || 0))),
      finalPending: Math.max(0, ...(final && final.nodes || []).map((row) => Number(row.durable && row.durable.pending || 0))),
      finalRunning: Math.max(0, ...(final && final.nodes || []).map((row) => Number(row.durable && row.durable.running || 0))),
    },
    nodes,
  };
}

function eventLoopHotspots(samples) {
  return samples.flatMap((sample) => sample.nodes.map((row) => {
    const processMetrics = row.process || {};
    const memory = processMetrics.memory || {};
    const eventLoop = processMetrics.eventLoop || {};
    return {
      elapsedMs: sample.elapsedMs,
      nodeId: row.nodeId,
      maxMs: round(Number(eventLoop.maxMs || 0)),
      p99Ms: round(Number(eventLoop.p99Ms || 0)),
      utilization: round(Number(eventLoop.utilization || 0), 6),
      heapUsedMiB: round(Number(memory.heapUsed || 0) / 1048576),
      rssMiB: round(Number(memory.rss || 0) / 1048576),
      gc: processMetrics.gc || null,
    };
  })).filter((row) => row.maxMs > 0)
    .sort((left, right) => right.maxMs - left.maxMs)
    .slice(0, 12);
}

function capacityGcSummary(samples) {
  const rows = samples.flatMap((sample) => sample.nodes.map((row) => ({
    elapsedMs: sample.elapsedMs,
    nodeId: row.nodeId,
    gc: row.process && row.process.gc || null,
  })));
  const nodeIds = [...new Set(rows.map((row) => row.nodeId))];
  const nodes = nodeIds.map((nodeId) => aggregateGcRows(
    rows.filter((row) => row.nodeId === nodeId),
    nodeId,
  ));
  const aggregate = aggregateGcRows(rows, "all");
  return {
    ...aggregate,
    available: nodes.length > 0 && nodes.every((row) => row.available),
    nodes,
    hotspots: rows.filter((row) => row.gc && Number(row.gc.maxDurationMs || 0) > 0)
      .map((row) => ({
        elapsedMs: row.elapsedMs,
        nodeId: row.nodeId,
        durationMs: round(Number(row.gc.maxDurationMs || 0)),
        event: row.gc.maxEvent || null,
      }))
      .sort((left, right) => right.durationMs - left.durationMs)
      .slice(0, 12),
  };
}

function aggregateGcRows(rows, nodeId) {
  const availableRows = rows.filter((row) => row.gc && row.gc.available === true);
  const unavailableReasons = [...new Set(rows.map((row) => (
    row.gc && row.gc.available !== true ? String(row.gc.unavailableReason || "gc_metrics_unavailable") : ""
  )).filter(Boolean))];
  const byKind = {};
  let maxDurationMs = 0;
  let maxAtElapsedMs = null;
  for (const row of availableRows) {
    const gc = row.gc;
    if (Number(gc.maxDurationMs || 0) > maxDurationMs) {
      maxDurationMs = Number(gc.maxDurationMs || 0);
      maxAtElapsedMs = row.elapsedMs;
    }
    for (const [kindName, kindRow] of Object.entries(gc.byKind || {})) {
      const aggregate = byKind[kindName] || {count: 0, durationMs: 0, maxDurationMs: 0};
      aggregate.count += Number(kindRow.count || 0);
      aggregate.durationMs += Number(kindRow.durationMs || 0);
      aggregate.maxDurationMs = Math.max(aggregate.maxDurationMs, Number(kindRow.maxDurationMs || 0));
      byKind[kindName] = aggregate;
    }
  }
  return {
    nodeId,
    available: rows.length > 0 && availableRows.length === rows.length,
    unavailableReasons,
    count: sum(availableRows.map((row) => Number(row.gc.count || 0))),
    durationMs: round(sum(availableRows.map((row) => Number(row.gc.durationMs || 0)))),
    maxDurationMs: round(maxDurationMs),
    maxAtElapsedMs,
    byKind: Object.fromEntries(Object.entries(byKind).map(([kindName, row]) => [kindName, {
      count: row.count,
      durationMs: round(row.durationMs),
      maxDurationMs: round(row.maxDurationMs),
    }])),
  };
}

function nodeMetricSummary(samples, nodeId, durationSeconds) {
  const rows = samples.map((sample) => ({
    elapsedMs: sample.elapsedMs,
    value: sample.nodes.find((row) => row.nodeId === nodeId),
  })).filter((row) => row.value && row.value.process && row.value.process.memory);
  const warmupStartMs = durationSeconds >= FULL_DURATION_SECONDS ? 5 * 60 * 1000 : durationSeconds * 100;
  const slopeStartMs = durationSeconds >= FULL_DURATION_SECONDS ? 10 * 60 * 1000 : warmupStartMs;
  const retained = rows.filter((row) => row.elapsedMs >= warmupStartMs);
  const baselineRows = retained.filter((row) => row.elapsedMs < warmupStartMs + 60000);
  const finalRows = retained.filter((row) => row.elapsedMs >= Math.max(warmupStartMs, durationSeconds * 1000 - 60000));
  const baselineHeap = minMetric(baselineRows, (row) => row.value.process.memory.heapUsed);
  const finalHeap = minMetric(finalRows, (row) => row.value.process.memory.heapUsed);
  const baselineRss = minMetric(baselineRows, (row) => row.value.process.memory.rss);
  const finalRss = minMetric(finalRows, (row) => row.value.process.memory.rss);
  return {
    nodeId,
    samples: rows.length,
    heapNetGrowthMiB: round((finalHeap - baselineHeap) / 1048576),
    rssNetGrowthMiB: round((finalRss - baselineRss) / 1048576),
    heapSlopeMiBPerMinute: round(minuteFloorSlope(
      rows,
      (row) => row.value.process.memory.heapUsed,
      slopeStartMs,
      durationSeconds * 1000,
    ) / 1048576),
    rssSlopeMiBPerMinute: round(minuteFloorSlope(
      rows,
      (row) => row.value.process.memory.rss,
      slopeStartMs,
      durationSeconds * 1000,
    ) / 1048576),
    heapPeakMiB: round(Math.max(0, ...rows.map((row) => Number(row.value.process.memory.heapUsed || 0))) / 1048576),
    rssPeakMiB: round(Math.max(0, ...rows.map((row) => Number(row.value.process.memory.rss || 0))) / 1048576),
    eventLoopUtilization: round(Math.max(0, ...rows.map((row) => Number(row.value.process.eventLoop && row.value.process.eventLoop.utilization || 0))), 6),
  };
}

function minuteFloorSlope(rows, selector, startMs, durationMs = Number.POSITIVE_INFINITY) {
  const floors = new Map();
  for (const row of rows) {
    if (row.elapsedMs < startMs) {
      continue;
    }
    const minute = Math.floor(row.elapsedMs / 60000);
    if ((minute + 1) * 60000 > durationMs) {
      continue;
    }
    const value = Number(selector(row));
    if (!Number.isFinite(value)) {
      continue;
    }
    floors.set(minute, Math.min(value, floors.get(minute) ?? Number.POSITIVE_INFINITY));
  }
  const points = [...floors.entries()].map(([minute, value]) => ({x: minute, y: value}));
  if (points.length < 2) {
    return 0;
  }
  const meanX = sum(points.map((point) => point.x)) / points.length;
  const meanY = sum(points.map((point) => point.y)) / points.length;
  const denominator = sum(points.map((point) => (point.x - meanX) ** 2));
  return denominator > 0
    ? sum(points.map((point) => (point.x - meanX) * (point.y - meanY))) / denominator
    : 0;
}

function minMetric(rows, selector) {
  const values = rows.map(selector).map(Number).filter(Number.isFinite);
  return values.length > 0 ? Math.min(...values) : 0;
}

function validateStorageEvidence(evidence, failures) {
  check(failures, evidence.authRevisionDelta === evidence.expectedChatCommitDelta, `MySQL revision delta ${evidence.authRevisionDelta}/${evidence.expectedChatCommitDelta}`);
  check(failures, evidence.accounts === CAPACITY_ACCOUNT_COUNT, `persisted accounts ${evidence.accounts}/200`);
  check(failures, evidence.sessions === CAPACITY_ACCOUNT_COUNT, `persisted sessions ${evidence.sessions}/200`);
  check(failures, evidence.profiles === CAPACITY_ACCOUNT_COUNT, `persisted profiles ${evidence.profiles}/200`);
  check(failures, evidence.chatMessages === Math.min(500, evidence.expectedChatCommitDelta), `persisted chat tail ${evidence.chatMessages}`);
  check(failures, evidence.serviceEvents <= 500, `service event tail ${evidence.serviceEvents} > 500`);
  check(failures, evidence.lastChatMarkerPersisted === true, "last chat marker was not persisted");
  check(failures, evidence.mysqlGlobalValuesUnchanged === true, "MySQL global values changed");
  check(failures, evidence.mysqlDeadlockDelta === 0, `MySQL deadlock delta ${evidence.mysqlDeadlockDelta}`);
  check(failures, evidence.mysqlResidualTransactions === 0, `MySQL residual transactions ${evidence.mysqlResidualTransactions}`);
  check(failures, evidence.mysqlResidualLockWaits === 0, `MySQL residual lock waits ${evidence.mysqlResidualLockWaits}`);
}

function checkLatency(failures, rows, category, p95Limit, p99Limit) {
  const row = rows && rows[category];
  check(failures, row && row.count > 0, `${category} has no latency samples`);
  if (!row || row.count <= 0) {
    return;
  }
  check(failures, row.failures === 0, `${category} failures ${row.failures}`);
  check(failures, row.p95Ms <= p95Limit, `${category} p95 ${row.p95Ms}ms > ${p95Limit}ms`);
  check(failures, row.p99Ms <= p99Limit, `${category} p99 ${row.p99Ms}ms > ${p99Limit}ms`);
}

function check(failures, condition, message) {
  if (!condition && failures.length < MAX_FAILURE_ROWS) {
    failures.push(String(message));
  }
}

function positionBody(cellX, cellY, facing, moving) {
  return {mapId: MAP_ID, cellX, cellY, facing, moving, scope: "aoi", radius: 18};
}

function movementFacing(fromCellX, fromCellY, toCellX, toCellY) {
  return toCellX > fromCellX ? "east" : (toCellX < fromCellX ? "west" : (toCellY > fromCellY ? "south" : "north"));
}

async function mapWithConcurrency(values, concurrency, fn) {
  let cursor = 0;
  await Promise.all(Array.from({length: Math.min(concurrency, values.length)}, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      await fn(values[index], index);
    }
  }));
}

function percentile(values, ratio) {
  const rows = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (rows.length === 0) {
    return 0;
  }
  return round(rows[Math.max(0, Math.ceil(rows.length * ratio) - 1)]);
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function normalizeBenchmarkScheduling(pid) {
  if (process.platform !== "darwin") {
    return {
      required: false,
      supported: false,
      success: true,
      action: "not_required_on_non_darwin",
    };
  }
  try {
    execFileSync("/usr/sbin/taskpolicy", ["-B", "-p", String(pid)], {
      stdio: "ignore",
      timeout: 5000,
    });
    return {
      required: true,
      supported: true,
      success: true,
      action: "remove_darwin_background_policy",
    };
  } catch (error) {
    return {
      required: true,
      supported: true,
      success: false,
      action: "remove_darwin_background_policy",
      error: String(error && error.message || error),
    };
  }
}

function databaseIdentifier(value) {
  const text = String(value || "");
  if (!/^[a-z0-9_]{1,64}$/i.test(text)) {
    throw new Error("invalid isolated capacity database identifier");
  }
  return text;
}

function sourceFingerprint() {
  const hash = crypto.createHash("sha256");
  for (const relativePath of SOURCE_FILES) {
    const absolutePath = path.join(repositoryRoot, relativePath);
    hash.update(relativePath);
    hash.update("\0");
    hash.update(fs.readFileSync(absolutePath));
    hash.update("\0");
  }
  let head = "";
  try {
    head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      timeout: 5000,
    }).trim();
  } catch {
    head = "unavailable";
  }
  return {head, digest: hash.digest("hex"), files: SOURCE_FILES.length};
}

function emitReport(report, outputPath) {
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  process.stdout.write(serialized);
  if (!outputPath) {
    return;
  }
  const absolutePath = path.resolve(repositoryRoot, outputPath);
  fs.mkdirSync(path.dirname(absolutePath), {recursive: true});
  const temporaryPath = `${absolutePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, serialized, {mode: 0o600});
  fs.renameSync(temporaryPath, absolutePath);
}

async function runSelfTest() {
  assert.equal(parseArgs([]).durationSeconds, QUICK_DURATION_SECONDS);
  assert.equal(parseArgs(["--duration-seconds=1800"]).qualification, "full_30_minute");
  assert.throws(() => parseArgs(["--full", "--duration-seconds=120"]), /requires/);
  assert.equal(reconnectTimeline(1800).some((row) => row.count === 200), true);
  assert.equal(reconnectTimeline(120).some((row) => row.count === 50), true);
  assert.equal(reconnectTimeline(9).length, 0);
  assert.equal(percentile([1, 2, 3, 4], 0.95), 4);
  assert.equal(movementFacing(1, 1, 2, 1), "east");
  assert.equal(databaseIdentifier("beastbound_capacity_1"), "beastbound_capacity_1");
  assert.throws(() => databaseIdentifier("bad-name"), /invalid/);
  process.stdout.write("two-node capacity self-test: PASS\n");
}

if (process.argv.includes("--self-test")) {
  await runSelfTest();
} else {
  await runTwoNodeCapacitySoak(parseArgs(process.argv.slice(2)));
}
