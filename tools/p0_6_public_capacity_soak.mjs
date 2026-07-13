#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import {
  getHeapCodeStatistics,
  getHeapSpaceStatistics,
  getHeapStatistics,
} from "node:v8";
import {fork, execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {
  PerformanceObserver,
  constants as performanceConstants,
  createHistogram,
  monitorEventLoopDelay,
  performance,
} from "node:perf_hooks";
import {
  LatencyBook,
  RawJsonWebSocket,
  boundedTail,
  bytesToMiB,
  delay,
  encodeClientFrame,
  fetchJsonMeasured,
  openRawWebSocketAttack,
  round,
  seededRandom,
  withTimeout,
  expandLogicalServerEvents,
} from "./lib/public-capacity-harness.mjs";
import {createMacosHostEvidenceCollector} from "./lib/macos-host-evidence.mjs";

const require = createRequire(import.meta.url);
const FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(FILE), "..");

const ACCOUNT_COUNT = 200;
const TOMBSTONE_COUNT = 100_000;
const RECEIPT_COUNT = 20_000;
const RECEIPT_RESPONSE_PAD_BYTES = 2 * 1024;
const QUICK_DURATION_SECONDS = 120;
const FULL_DURATION_SECONDS = 1800;
const TICK_MS = 100;
const EVENT_LOOP_SAMPLE_SETTLE_MS = 12;
// Keep the test-only composite business coverage away from the synthetic
// reconnect boundary and regular chat/asset/party/battle phases. Natural mixed
// load remains active, while reconnect recovery is measured without a second
// test-only burst deliberately stacked 300ms in front of it.
const BUSINESS_PROBE_START_TICK = 247;
const BUSINESS_PROBE_INTERVAL_TICKS = 600;
const METRIC_SAMPLE_MS = 1000;
const MAP_ID = "firebud_training_yard";
const HTTP_TIMEOUT_MS = 10_000;
const WS_TIMEOUT_MS = 15_000;
const MAX_FAILURE_ROWS = 500;
const WORKER_EMERGENCY_EXIT_MS = 15_000;
const PARENT_EMERGENCY_EXIT_MS = 20_000;
const CLEANUP_PROBE_TIMEOUT_MS = 10_000;
const FORMAL_HOST_PREFLIGHT_MS = 10_000;
const DEVELOPMENT_HOST_PREFLIGHT_MS = 2_000;
const FIXTURE_PASSWORD = "capacity1234";
const BATTLE_GROUP_COUNT = 8;
const BATTLE_ACTIVE_GROUPS = 4;
const BATTLE_GROUP_SIZE = 5;
const RECONCILIATION_SOURCE = "worker_authority_narrow_reconciliation_view";
const CHURN_GROUP_START = 8;
const CHURN_GROUP_COUNT = 4;
const MOVER_START = 60;
const MOVER_COUNT = 80;
const ASSET_START = 140;
const ASSET_COUNT = 20;
const CHAT_START = 160;
const MIN_POSITION_BATCH_FRAME_REDUCTION_RATIO = 0.25;
const BATTLE_RECORD_LIMIT = 10_000;
const BATTLE_TRACE_LIMIT = 1_200;
const CHAT_MESSAGE_LIMIT = 500;
const FIXTURE_OLDEST_BATTLE_RECORD_ID = "battle_record_fixture_00000";
const FIXTURE_NEWEST_BATTLE_RECORD_ID = "battle_record_fixture_09999";
const FIXTURE_OLDEST_BATTLE_TRACE_ID = "battle_trace_fixture_0000";
const FIXTURE_NEWEST_BATTLE_TRACE_ID = "battle_trace_fixture_1199";
const RECEIPT_DEAD_KEY_PEAK_LIMIT = 1_023;
const RECEIPT_HISTORY_ENTRY_PEAK_LIMIT = 2_047;
const RECEIPT_HEAP_OVERHEAD_LIMIT = 2_048;
const GC_KIND_NAMES = new Map([
  [performanceConstants.NODE_PERFORMANCE_GC_MAJOR, "major"],
  [performanceConstants.NODE_PERFORMANCE_GC_MINOR, "minor"],
  [performanceConstants.NODE_PERFORMANCE_GC_INCREMENTAL, "incremental"],
  [performanceConstants.NODE_PERFORMANCE_GC_WEAKCB, "weak_callback"],
].filter(([value]) => Number.isInteger(value)));
const GC_FLAG_NAMES = Object.freeze([
  [performanceConstants.NODE_PERFORMANCE_GC_FLAGS_CONSTRUCT_RETAINED, "construct_retained"],
  [performanceConstants.NODE_PERFORMANCE_GC_FLAGS_FORCED, "forced"],
  [performanceConstants.NODE_PERFORMANCE_GC_FLAGS_SYNCHRONOUS_PHANTOM_PROCESSING, "synchronous_phantom_processing"],
  [performanceConstants.NODE_PERFORMANCE_GC_FLAGS_ALL_AVAILABLE_GARBAGE, "all_available_garbage"],
  [performanceConstants.NODE_PERFORMANCE_GC_FLAGS_ALL_EXTERNAL_MEMORY, "all_external_memory"],
  [performanceConstants.NODE_PERFORMANCE_GC_FLAGS_SCHEDULE_IDLE, "schedule_idle"],
].filter(([value]) => Number.isInteger(value) && value > 0));
const COLLECTION_REQUIRED_NUMERIC_FIELDS = Object.freeze([
  "battleRecords",
  "battleTrace",
  "chatMessages",
  "receiptActive",
  "receiptCheckpoints",
  "receiptHistoricalKeys",
  "receiptHistoryEntries",
  "receiptExpiryHeap",
  "receiptOldestHeap",
  "receiptPendingDeletes",
  "receiptPendingUpserts",
  "receiptDeadKeys",
  "receiptExpiryHeapOverhead",
  "receiptOldestHeapOverhead",
]);
const COLLECTION_SAMPLE_FIELDS = Object.freeze([
  "available",
  "activeBattleRooms",
  "battleRoomRecoveries",
  "battleRecoveryIndexedAccounts",
  "partyInvitesPending",
  "partyInvitesTerminal",
  "battleInvitesPending",
  "battleInvitesTerminal",
  "authAttemptKeys",
  "authEvents",
  "battleRecords",
  "battleTrace",
  "chatMessages",
  "receiptActive",
  "receiptCheckpoints",
  "receiptHistoricalKeys",
  "receiptHistoryEntries",
  "receiptExpiryHeap",
  "receiptOldestHeap",
  "receiptPendingDeletes",
  "receiptPendingUpserts",
  "receiptDeadKeys",
  "receiptExpiryHeapOverhead",
  "receiptOldestHeapOverhead",
  "sessions",
  "serviceEvents",
]);
const DURABLE_SAMPLE_FIELDS = Object.freeze([
  "pending",
  "running",
  "accepted",
  "completed",
  "queueFull",
  "timeouts",
  "failed",
]);
const EVENT_STREAM_SAMPLE_FIELDS = Object.freeze([
  "connections",
  "clients",
  "queuedFrames",
  "encodedFrames",
  "reusedFrames",
  "pendingPositionEvents",
  "backpressureConnections",
  "activePositionJob",
  "pendingPositionBatchClients",
  "pendingPositionBatchDeltas",
  "currentPositionBatchBytes",
  "combinedBufferedBytes",
  "combinedQueuedFrames",
]);
const PUBLIC_HEALTH_TRANSPORT_SAMPLE_FIELDS = Object.freeze([
  "activeHttp",
  "peakActiveHttp",
  "maxActiveHttp",
  "rejectedHttp",
  "rateLimitKeys",
  "rateLimitMaxKeys",
  "rateLimitRejected",
  "rateLimitCapacityRejected",
]);
const PUBLIC_HEALTH_AUTH_WORK_SAMPLE_FIELDS = Object.freeze([
  "active",
  "queued",
  "maxActive",
  "maxQueued",
  "peakActive",
  "peakQueued",
  "completed",
  "rejected",
]);
const FULL_COLLECTION_STABLE_FIELDS = Object.freeze([
  "activeBattleRooms",
  "battleRoomRecoveries",
  "battleRecoveryIndexedGroups",
  "partyInvitesTerminal",
  "battleInvitesTerminal",
  "receiptActive",
  "receiptPendingDeletes",
  "receiptPendingUpserts",
  "chatMessages",
  "battleTrace",
  "sessions",
  "serviceEvents",
]);
const RUNTIME_LATENCY_CATEGORIES = new Set([
  "movement",
  "movement_hotspot",
  "movement_sentinel",
  "heartbeat",
  "party_read",
  "market_read",
  "profile_read",
  "health_read",
  "hotspot_enter",
  "hotspot_exit",
  "reconnect_aoi",
  "ws_sentinel_last",
  "ws_sentinel_spread",
  "ws_reconnect",
  "ws_stale_cursor_reset",
]);
const FULL_TREND_REQUIRED_CATEGORIES = Object.freeze([
  "movement",
  "movement_sentinel",
  "heartbeat",
  "party_read",
  "market_read",
  "profile_read",
  "health_read",
  "chat_write",
  "chat_probe",
  "asset_write",
  "asset_replay",
  "party_write",
  "battle_command",
  "battle_write",
  "ws_sentinel_last",
  "ws_sentinel_spread",
]);
const CAPACITY_SOURCE_FILES = Object.freeze([
  "tools/p0_6_public_capacity_soak.mjs",
  "tools/lib/public-capacity-harness.mjs",
  "tools/lib/macos-host-evidence.mjs",
  "client/godot/scripts/battle/server_battle_coordinator.gd",
  "client/godot/scripts/battle/server_battle_room_model.gd",
  "client/godot/scripts/net/online_presence_cache_model.gd",
  "client/godot/scripts/net/server_event_reconnect_model.gd",
  "client/godot/scripts/progression/server_auth_client_model.gd",
  "client/godot/scripts/ui/panel_flow_coordinator.gd",
  "server/node/src/auth-service.js",
  "server/node/src/auth/authority-root-clone.js",
  "server/node/src/auth/authority-root-materialization.js",
  "server/node/src/auth/battle-room.js",
  "server/node/src/auth/battle-room-cow.js",
  "server/node/src/auth/durable-mutation-coordinator.js",
  "server/node/src/auth/durable-mutation-state.js",
  "server/node/src/auth/economy.js",
  "server/node/src/auth/equipment-envelope-consumed-ledger.js",
  "server/node/src/auth/mail-chat.js",
  "server/node/src/auth/online-presence.js",
  "server/node/src/auth/party.js",
  "server/node/src/auth/profile-actions.js",
  "server/node/src/auth/runtime-battle-recovery.js",
  "server/node/src/auth/runtime-invite-boundary.js",
  "server/node/src/event-hub.js",
  "server/node/src/event-hub-subscriptions.js",
  "server/node/src/event-hub-writer.js",
  "server/node/src/event-projection-cache.js",
  "server/node/src/event-stream-cursor.js",
  "server/node/src/health-monitor.js",
  "server/node/src/http-auth-boundary.js",
  "server/node/src/http-server.js",
  "server/node/src/http-security-boundary.js",
  "server/node/src/mysql-store.js",
  "server/node/src/network-admission.js",
  "server/node/src/protocol.js",
  "server/node/src/websocket-frame-parser.js",
]);

const CLUSTER_PATHS = Object.freeze([
  Object.freeze([[5, 5], [6, 5], [6, 6], [5, 6]]),
  Object.freeze([[28, 5], [29, 5], [29, 6], [28, 6]]),
  Object.freeze([[5, 27], [6, 27], [6, 28], [5, 28]]),
  Object.freeze([[28, 27], [29, 27], [29, 28], [28, 28]]),
]);

const {PROTOCOL_VERSION, SERVER_VERSION} = require("../server/node/src/protocol");
const {DEFAULT_MYSQL_CLI_OUTPUT_MAX_BUFFER_BYTES} = require("../server/node/src/mysql-store");

const args = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const explicitDuration = optionNumber(argv, "--duration-seconds");
  const requestedFull = argv.includes("--full");
  const requestedQuick = argv.includes("--quick");
  const outputRequested = argv.includes("--output") || argv.some((value) => value.startsWith("--output="));
  const outputPath = optionString(argv, "--output");
  if (requestedFull && requestedQuick) {
    throw new Error("--full and --quick cannot be combined");
  }
  const durationSeconds = explicitDuration ?? (requestedFull ? FULL_DURATION_SECONDS : QUICK_DURATION_SECONDS);
  const skipAttacks = argv.includes("--skip-attacks");
  if (!Number.isFinite(durationSeconds) || durationSeconds < 1) {
    throw new Error("--duration-seconds must be at least 1");
  }
  const full = durationSeconds >= FULL_DURATION_SECONDS;
  if (requestedFull && !full) {
    throw new Error(`--full requires --duration-seconds >= ${FULL_DURATION_SECONDS}`);
  }
  if (requestedQuick && full) {
    throw new Error(`--quick requires --duration-seconds < ${FULL_DURATION_SECONDS}`);
  }
  const quick = durationSeconds >= QUICK_DURATION_SECONDS && !full;
  if (requestedQuick && !quick) {
    throw new Error(`--quick requires --duration-seconds >= ${QUICK_DURATION_SECONDS}`);
  }
  if (outputRequested && (outputPath === "" || outputPath.startsWith("--"))) {
    throw new Error("--output requires a report file path");
  }
  if (skipAttacks && (full || durationSeconds >= QUICK_DURATION_SECONDS)) {
    throw new Error("--skip-attacks is development-smoke-only and cannot qualify quick/full capacity");
  }
  return Object.freeze({
    serverWorker: argv.includes("--server-worker"),
    selfTest: argv.includes("--self-test"),
    lifecycleProbeParent: argv.includes("--lifecycle-probe-parent"),
    lifecycleProbeWorker: argv.includes("--lifecycle-probe-worker"),
    full,
    quick,
    durationSeconds: Math.trunc(durationSeconds),
    reportOnly: argv.includes("--report-only"),
    skipAttacks,
    seed: optionString(argv, "--seed") || "p0_6c_public_capacity_v1",
    outputPath,
  });
}

function optionString(argv, name) {
  const inline = argv.find((value) => value.startsWith(`${name}=`));
  if (inline) {
    return inline.slice(name.length + 1);
  }
  const index = argv.indexOf(name);
  return index >= 0 ? String(argv[index + 1] || "") : "";
}

function optionNumber(argv, name) {
  const value = optionString(argv, name);
  return value === "" ? null : Number(value);
}

let activeCapacityWorker = null;
let activeGateEmergencyContext = null;
let parentLifecycleInstalled = false;
let parentShutdownStarted = false;

function createCapacityHostEvidenceLifecycle() {
  return {
    collector: createMacosHostEvidenceCollector(),
    stopPromise: null,
  };
}

async function startCapacityHostEvidence(lifecycle) {
  if (!lifecycle || !lifecycle.collector) {
    return null;
  }
  const state = lifecycle.collector.report().state;
  if (state === "idle") {
    await lifecycle.collector.start();
  }
  return lifecycle.collector.report();
}

async function stopCapacityHostEvidence(lifecycle) {
  if (!lifecycle || !lifecycle.collector) {
    return null;
  }
  if (lifecycle.stopPromise) {
    return lifecycle.stopPromise;
  }
  const state = lifecycle.collector.report().state;
  lifecycle.stopPromise = state === "running"
    ? lifecycle.collector.stop()
    : Promise.resolve(lifecycle.collector.report());
  return lifecycle.stopPromise;
}

function installParentCapacityLifecycle() {
  if (parentLifecycleInstalled) {
    return;
  }
  parentLifecycleInstalled = true;
  process.once("exit", () => {
    activeCapacityWorker?.emergencyStop();
  });
  process.once("SIGINT", () => void shutdownCapacityParent("SIGINT"));
  process.once("SIGTERM", () => void shutdownCapacityParent("SIGTERM"));
  if (process.channel) {
    process.once("disconnect", () => void shutdownCapacityParent("parent_disconnect"));
  }
}

async function shutdownCapacityParent(reason) {
  if (parentShutdownStarted) {
    return;
  }
  parentShutdownStarted = true;
  const worker = activeCapacityWorker;
  const exitCode = reason === "SIGINT" ? 130 : (reason === "SIGTERM" ? 143 : 1);
  const forceTimer = setTimeout(() => {
    worker?.emergencyStop();
    process.exit(exitCode);
  }, PARENT_EMERGENCY_EXIT_MS);
  try {
    if (activeGateEmergencyContext && activeGateEmergencyContext.hostEvidenceLifecycle) {
      await stopCapacityHostEvidence(activeGateEmergencyContext.hostEvidenceLifecycle);
    }
    if (worker) {
      await worker.stop();
    }
  } catch (error) {
    process.stderr.write(`capacity parent ${reason} cleanup failed: ${error.message}\n`);
  } finally {
    clearTimeout(forceTimer);
  }
  if (activeGateEmergencyContext && !activeGateEmergencyContext.reportWritten) {
    emitInterruptedCapacityReport(activeGateEmergencyContext, reason, worker);
  }
  process.exit(exitCode);
}

function registerActiveCapacityWorker(worker) {
  activeCapacityWorker = worker;
}

function clearActiveCapacityWorker(worker) {
  if (activeCapacityWorker === worker) {
    activeCapacityWorker = null;
  }
}

async function runGate(options) {
  installParentCapacityLifecycle();
  const failures = [];
  const warnings = [];
  const environmentFailures = [];
  const startedAt = new Date().toISOString();
  const hostEvidenceLifecycle = createCapacityHostEvidenceLifecycle();
  let environmentDecision = "run";
  let sourceManifest = Object.freeze([...CAPACITY_SOURCE_FILES].sort());
  let sourceManifestError = "";
  try {
    sourceManifest = capacitySourceManifest();
  } catch (error) {
    sourceManifestError = error && error.stack ? error.stack : String(error);
    pushFailure(failures, `capacity source manifest discovery failed: ${sourceManifestError}`);
  }
  const startedCapture = sourceManifestError
    ? {fingerprint: unavailableCapacityRunFingerprint(sourceManifest), error: sourceManifestError}
    : tryCaptureCapacityRunFingerprint(sourceManifest);
  const startedFingerprint = startedCapture.fingerprint;
  let finishedFingerprint = unavailableCapacityRunFingerprint(sourceManifest);
  let worker = null;
  let scenario = null;
  let cleanup = emptyCapacityCleanupEvidence();
  const emergencyContext = {
    options,
    startedAt,
    sourceManifest,
    startedFingerprint,
    warnings,
    failures,
    environmentFailures,
    environmentDecision,
    hostEvidenceLifecycle,
    reportWritten: false,
  };
  activeGateEmergencyContext = emergencyContext;
  if (startedCapture.error) {
    pushFailure(failures, `capacity run start fingerprint failed: ${startedCapture.error}`);
  }

  try {
    await hostEvidenceLifecycle.collector.preflight({
      durationMs: capacityHostPreflightDurationMs(options),
      sampleIntervalMs: 1_000,
    });
  } catch {
    if (options.durationSeconds >= QUICK_DURATION_SECONDS) {
      environmentFailures.push("host_evidence_preflight_failed");
    } else {
      warnings.push("host environment warning: host_evidence_preflight_failed");
    }
  }
  const preflightAssessment = capacityHostEnvironmentAssessment(
    hostEvidenceLifecycle.collector.report(),
    options,
  );
  for (const code of preflightAssessment.errors) {
    if (!environmentFailures.includes(code)) {
      environmentFailures.push(code);
    }
  }
  for (const code of preflightAssessment.warnings) {
    const message = `host environment warning: ${code}`;
    if (!warnings.includes(message)) {
      warnings.push(message);
    }
  }
  if (preflightAssessment.abort) {
    environmentDecision = "abort";
    emergencyContext.environmentDecision = environmentDecision;
  }

  if (!startedCapture.error && environmentDecision === "run") {
    try {
      worker = await ServerWorker.start();
      emergencyContext.worker = worker;
      scenario = new CapacityScenario(
        worker,
        options,
        failures,
        warnings,
        hostEvidenceLifecycle,
      );
      await scenario.run();
    } catch (error) {
      if (error && error.capacityCleanupEvidence) {
        cleanup = error.capacityCleanupEvidence;
      }
      pushFailure(failures, `gate execution failed: ${error && error.stack ? error.stack : error}`);
    } finally {
      try {
        await stopCapacityHostEvidence(hostEvidenceLifecycle);
      } catch {
        if (
          options.durationSeconds >= QUICK_DURATION_SECONDS
          && !environmentFailures.includes("host_evidence_runtime_stop_failed")
        ) {
          environmentFailures.push("host_evidence_runtime_stop_failed");
        } else if (options.durationSeconds < QUICK_DURATION_SECONDS) {
          warnings.push("host environment warning: host_evidence_runtime_stop_failed");
        }
      }
      if (scenario) {
        try {
          await scenario.cleanup();
        } catch (error) {
          pushFailure(failures, `capacity scenario cleanup failed: ${error && error.stack ? error.stack : error}`);
        }
      }
      if (worker) {
        try {
          await worker.stop();
        } catch (error) {
          pushFailure(failures, `capacity worker cleanup failed: ${error && error.stack ? error.stack : error}`);
        }
        cleanup = worker.cleanupEvidence();
      }
    }
  } else {
    await stopCapacityHostEvidence(hostEvidenceLifecycle);
  }
  const hostEvidence = hostEvidenceLifecycle.collector.report();
  const finalEnvironmentAssessment = capacityHostEnvironmentAssessment(hostEvidence, options);
  for (const code of finalEnvironmentAssessment.errors) {
    if (!environmentFailures.includes(code)) {
      environmentFailures.push(code);
    }
  }
  for (const code of finalEnvironmentAssessment.warnings) {
    const message = `host environment warning: ${code}`;
    if (!warnings.includes(message)) {
      warnings.push(message);
    }
  }
  let result = null;
  if (scenario) {
    try {
      result = scenario.report();
    } catch (error) {
      pushFailure(failures, `capacity result construction failed: ${error && error.stack ? error.stack : error}`);
    }
  }
  if (environmentDecision === "run") {
    for (const message of capacityCleanupEvidenceFailures(cleanup)) {
      pushFailure(failures, message);
    }
  }
  if (environmentDecision === "run") {
    try {
      applyGateChecks(result, options, failures, warnings);
    } catch (error) {
      pushFailure(failures, `capacity gate checks failed: ${error && error.stack ? error.stack : error}`);
    }
  }
  const finishedCapture = tryCaptureCapacityRunFingerprint(sourceManifest);
  finishedFingerprint = finishedCapture.fingerprint;
  if (finishedCapture.error) {
    pushFailure(failures, `capacity run end fingerprint failed: ${finishedCapture.error}`);
  }
  for (const message of capacityRunFingerprintFailures(startedFingerprint, finishedFingerprint)) {
    pushFailure(failures, message);
  }
  const report = capacityReportDocument({
    options,
    startedAt,
    finishedAt: new Date().toISOString(),
    sourceManifest,
    startedFingerprint,
    finishedFingerprint,
    cleanup,
    result,
    warnings,
    failures,
    environment: capacityHostEnvironmentReport({
      options,
      decision: environmentDecision,
      evidence: hostEvidence,
      errors: environmentFailures,
    }),
  });
  emitCapacityReport(report, options);
  emergencyContext.reportWritten = true;
  if (activeGateEmergencyContext === emergencyContext) {
    activeGateEmergencyContext = null;
  }
}

function capacityReportDocument(input) {
  const {
    options,
    startedAt,
    finishedAt,
    sourceManifest,
    startedFingerprint,
    finishedFingerprint,
    cleanup,
    result,
    warnings,
    failures,
    environment,
  } = input;
  const workloadFailures = [...new Set((failures || []).map(String))];
  const environmentFailures = [...new Set((environment && environment.errors || []).map(String))];
  const workloadStatus = result
    ? (workloadFailures.length === 0 ? "passed" : "failed")
    : "not_run";
  const environmentRequired = Boolean(environment && environment.required);
  const environmentStatus = String(
    environment && environment.evidence && environment.evidence.classification
      && environment.evidence.classification.status
      || "unavailable",
  );
  const qualified = workloadStatus === "passed"
    && (!environmentRequired || environmentFailures.length === 0);
  const combinedFailures = [
    ...workloadFailures,
    ...environmentFailures.map((code) => `host environment invalid: ${code}`),
  ].slice(0, MAX_FAILURE_ROWS);
  return {
    ok: qualified,
    schemaVersion: 2,
    qualification: capacityQualification(options),
    outcome: {
      workloadStatus,
      environmentStatus,
      environmentRequired,
      qualified,
    },
    metadata: {
      startedAt,
      finishedAt,
      head: startedFingerprint.head,
      dirty: startedFingerprint.dirty,
      sourceManifest,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: os.cpus()[0]?.model || "unknown",
      seed: options.seed,
      durationSeconds: options.durationSeconds,
      protocolVersion: PROTOCOL_VERSION,
      serverVersion: SERVER_VERSION,
      accountCount: ACCOUNT_COUNT,
      tombstoneCount: TOMBSTONE_COUNT,
      receiptCount: RECEIPT_COUNT,
      store: "production_mysql_planner_with_recording_pool",
      realMysql: false,
      mysqlCliOutputMaxBufferBytes: DEFAULT_MYSQL_CLI_OUTPUT_MAX_BUFFER_BYTES,
      networkEndpoint: "127.0.0.1 ephemeral only",
      cleanup,
      testOnlyAdmissionOverrides: {
        wsConnectionsPerIp: 256,
        wsUpgradesPerMinute: 320,
        authAttemptsPerIpPerMinute: 10,
        trustedProxies: [],
      },
      sourceSha256: startedFingerprint.sourceSha256,
      finishedHead: finishedFingerprint.head,
      finishedDirty: finishedFingerprint.dirty,
      finishedSourceSha256: finishedFingerprint.sourceSha256,
      fixedRunFingerprint: startedFingerprint.fingerprintSha256,
      finishedRunFingerprint: finishedFingerprint.fingerprintSha256,
      runFingerprintMatched: startedFingerprint.fingerprintSha256 !== ""
        && startedFingerprint.fingerprintSha256 === finishedFingerprint.fingerprintSha256,
    },
    environment: environment || null,
    thresholds: gateThresholds(),
    result,
    warnings: [...new Set((warnings || []).map(String))],
    workloadFailures,
    environmentFailures,
    failures: combinedFailures,
  };
}

function capacityHostPreflightDurationMs(options) {
  return Number(options && options.durationSeconds || 0) >= QUICK_DURATION_SECONDS
    ? FORMAL_HOST_PREFLIGHT_MS
    : DEVELOPMENT_HOST_PREFLIGHT_MS;
}

function capacityHostEnvironmentAssessment(evidenceValue, options) {
  const evidence = evidenceValue && typeof evidenceValue === "object" ? evidenceValue : null;
  const required = Number(options && options.durationSeconds || 0) >= QUICK_DURATION_SECONDS;
  const classification = evidence && evidence.classification || {
    status: "invalid",
    environmentValid: false,
    invalidReasons: ["host_evidence_missing"],
    warnings: [],
  };
  const invalidReasons = Array.isArray(classification.invalidReasons)
    ? classification.invalidReasons.map(String)
    : [];
  const classificationWarnings = Array.isArray(classification.warnings)
    ? classification.warnings.map(String)
    : [];
  const environmentValid = classification.environmentValid === true;
  const fallbackCode = classification.status === "unsupported"
    ? "host_evidence_unsupported"
    : "host_evidence_invalid";
  const errors = required && !environmentValid
    ? (invalidReasons.length > 0 ? invalidReasons : [fallbackCode])
    : [];
  const warnings = [
    ...classificationWarnings,
    ...(!required && !environmentValid
      ? (invalidReasons.length > 0 ? invalidReasons : [fallbackCode])
      : []),
  ];
  return {
    required,
    abort: errors.length > 0,
    errors: [...new Set(errors)].sort(),
    warnings: [...new Set(warnings)].sort(),
  };
}

function capacityHostEnvironmentReport(input) {
  return {
    required: Number(input.options && input.options.durationSeconds || 0) >= QUICK_DURATION_SECONDS,
    preflightDurationMs: capacityHostPreflightDurationMs(input.options),
    decision: String(input.decision || "run"),
    evidence: input.evidence || null,
    errors: [...new Set((input.errors || []).map(String))].sort(),
  };
}

function capacityQualification(options) {
  return options.durationSeconds >= FULL_DURATION_SECONDS
    ? "full_30_minute"
    : (options.durationSeconds >= QUICK_DURATION_SECONDS ? "quick" : "development_smoke");
}

function emitCapacityReport(reportValue, options) {
  let report = reportValue;
  let serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.outputPath) {
    try {
      writeReportAtomically(options.outputPath, serialized);
    } catch (error) {
      report = {
        ...report,
        ok: false,
        failures: [...report.failures, `capacity report write failed: ${error.message}`].slice(0, MAX_FAILURE_ROWS),
      };
      serialized = `${JSON.stringify(report, null, 2)}\n`;
    }
  }
  process.stdout.write(serialized);
  if (!options.reportOnly && !report.ok) {
    process.exitCode = 1;
  }
}

function emitInterruptedCapacityReport(context, reason, worker) {
  const finishedCapture = tryCaptureCapacityRunFingerprint(context.sourceManifest);
  const failures = [...context.failures, `capacity run interrupted by ${reason}`];
  if (finishedCapture.error) {
    failures.push(`capacity run interrupted fingerprint failed: ${finishedCapture.error}`);
  }
  const report = capacityReportDocument({
    options: context.options,
    startedAt: context.startedAt,
    finishedAt: new Date().toISOString(),
    sourceManifest: context.sourceManifest,
    startedFingerprint: context.startedFingerprint,
    finishedFingerprint: finishedCapture.fingerprint,
    cleanup: worker ? worker.cleanupEvidence() : emptyCapacityCleanupEvidence(),
    result: null,
    warnings: context.warnings,
    failures,
    environment: capacityHostEnvironmentReport({
      options: context.options,
      decision: context.environmentDecision || "run",
      evidence: context.hostEvidenceLifecycle
        ? context.hostEvidenceLifecycle.collector.report()
        : null,
      errors: context.environmentFailures || [],
    }),
  });
  emitCapacityReport(report, {...context.options, reportOnly: true});
  context.reportWritten = true;
}

function writeReportAtomically(outputPath, serialized) {
  const resolved = path.resolve(ROOT, outputPath);
  const directory = path.dirname(resolved);
  const temporary = path.join(directory, `.${path.basename(resolved)}.${process.pid}.tmp`);
  fs.mkdirSync(directory, {recursive: true});
  try {
    fs.writeFileSync(temporary, serialized, {encoding: "utf8", mode: 0o600, flag: "wx"});
    fs.renameSync(temporary, resolved);
  } catch (error) {
    try {
      fs.rmSync(temporary, {force: true});
    } catch {
      // Preserve the original write/rename error.
    }
    throw error;
  }
}

class ReconnectBusinessCoordination {
  constructor(options = {}) {
    this.now = typeof options.now === "function" ? options.now : performance.now.bind(performance);
    this.wait = typeof options.wait === "function" ? options.wait : delay;
    this.businessActive = false;
    this.sentinelActive = false;
    this.reconnectActive = 0;
  }

  tryBeginBusiness() {
    if (this.businessActive || this.sentinelActive || this.reconnectActive > 0) {
      return false;
    }
    this.businessActive = true;
    return true;
  }

  endBusiness() {
    this.businessActive = false;
  }

  tryBeginSentinel() {
    if (this.businessActive || this.sentinelActive || this.reconnectActive > 0) {
      return false;
    }
    this.sentinelActive = true;
    return true;
  }

  endSentinel() {
    this.sentinelActive = false;
  }

  async beginReconnect(timeoutMs = WS_TIMEOUT_MS) {
    const startedAt = this.now();
    while (this.businessActive || this.sentinelActive) {
      const remainingMs = Math.max(0, Number(timeoutMs || 0) - (this.now() - startedAt));
      if (remainingMs <= 0) {
        return false;
      }
      await this.wait(Math.min(25, remainingMs));
    }
    this.reconnectActive += 1;
    return true;
  }

  endReconnect() {
    this.reconnectActive = Math.max(0, this.reconnectActive - 1);
  }

  summary() {
    return {
      businessActive: this.businessActive,
      sentinelActive: this.sentinelActive,
      reconnectActive: this.reconnectActive,
    };
  }
}

class CapacityScenario {
  constructor(worker, options, failures, warnings, hostEvidenceLifecycle = null) {
    this.worker = worker;
    this.options = options;
    this.failures = failures;
    this.warnings = warnings;
    this.hostEvidenceLifecycle = hostEvidenceLifecycle;
    this.base = `http://127.0.0.1:${worker.port}`;
    this.durationMs = options.durationSeconds * 1000;
    this.random = seededRandom(options.seed);
    this.firstTrendWindowStartMs = options.full ? 5 * 60 * 1000 : 0;
    this.latencies = new LatencyBook(this.durationMs, {
      firstWindowStartMs: this.firstTrendWindowStartMs,
    });
    this.driverStartedAt = performance.now();
    this.driverCpuStarted = process.cpuUsage();
    this.driverMemoryStarted = process.memoryUsage();
    this.driverLoopDelay = monitorEventLoopDelay({resolution: 10});
    this.driverLoopDelay.enable();
    this.clients = new Array(ACCOUNT_COUNT).fill(null);
    this.retiredClientSummaries = [];
    this.accountStates = worker.accounts.map((account, index) => newAccountRuntime(account, index));
    this.inFlight = new Set();
    this.maxInFlight = 0;
    this.metricSamples = [];
    this.metricTimelineCollectionSnapshots = new Map();
    this.lastMetricCollections = null;
    this.maxEventLoopDiagnostic = null;
    this.maxEventLoopMetricValue = Number.NEGATIVE_INFINITY;
    this.previousMetricResourceUsage = null;
    this.scenarioStartedAt = 0;
    this.schedulerFinishedAt = 0;
    this.loadFinishedAt = 0;
    this.scenarioFinishedAt = 0;
    this.running = false;
    this.metricsPromise = null;
    this.movementCursor = 0;
    this.hotMovementCursor = 0;
    this.heartbeatCursor = 0;
    this.partyPollCursor = 0;
    this.marketCursor = 0;
    this.profilePollCursor = 0;
    this.assetCursor = 0;
    this.chatCursor = 0;
    this.churnCursor = 0;
    this.battleRoundCursor = 0;
    this.battleStates = [];
    this.startedBattleRoomIds = [];
    this.closedBattleRoomIds = [];
    this.pausedAccounts = new Set();
    this.storms = [];
    this.attacks = [];
    this.assetCommitObservations = [];
    this.heldClients = new Map();
    this.correctness = {
      initializedPositions: 0,
      initializedConnections: 0,
      movementAccepted: 0,
      heartbeatsAccepted: 0,
      chatAccepted: 0,
      partyPollAccepted: 0,
      marketPollAccepted: 0,
      profilePollAccepted: 0,
      partyChurnCycles: 0,
      battleRoomsStarted: 0,
      battleRoundsResolved: 0,
      battleRoomsClosed: 0,
      assetWrites: 0,
      assetReplays: 0,
      assetDuplicateApplications: 0,
      reconnects: 0,
      staleCursorResets: 0,
      attackExpectedRejects: 0,
      attackUnexpectedResults: 0,
      finalReconciliations: 0,
      authorityCheckpoints: 0,
      checkpointProfiles: 0,
      checkpointParties: 0,
      checkpointBattles: 0,
      finalProfilesReconciled: 0,
      finalPartiesReconciled: 0,
      finalBattleMembersReconciled: 0,
      hotspotTransitions: 0,
      hotspotRadiusUpdates: 0,
      hotspotSkippedPaused: 0,
      reconciliationDurableSideEffects: 0,
      reconciliationStoreWrites: 0,
      businessEventProbes: 0,
      schedulerBackpressureTicks: 0,
    };
    this.sentinel = new PresenceSentinel((message) => pushFailure(this.failures, message));
    this.schedulerLag = [];
    this.schedulerExpectedTicks = Math.ceil(this.durationMs / TICK_MS);
    this.schedulerTickCount = 0;
    this.schedulerRebaseCount = 0;
    this.schedulerRebasedLagMs = 0;
    this.schedulerMaxLagMs = 0;
    this.schedulerMaxLagAtElapsedMs = 0;
    this.timelineFired = new Set();
    this.initialMetrics = null;
    this.fixtureMetrics = null;
    this.finalMetrics = null;
    this.initialConnectMs = null;
    this.cleanupDone = false;
    this.checkpointBusy = false;
    this.hotspotActive = false;
    this.hotspotTransitionBusy = false;
    this.reconciliationSource = "";
    this.checkpointCoverage = [];
    this.businessEventTracker = new BusinessEventTracker((message) => pushFailure(this.failures, message));
    this.businessProbeBusy = false;
    this.businessProbeCursor = 0;
    this.coordination = new ReconnectBusinessCoordination();
    this.finalHealth = null;
    this.finalClientState = null;
  }

  async run() {
    assert.equal(this.worker.accounts.length, ACCOUNT_COUNT, "capacity worker fixture account count drifted");
    this.fixtureMetrics = await this.worker.rpc("metrics", {gc: true});
    await this.initializePositions();
    await this.connectAll();
    await this.startInitialBattles();
    // The retained-growth baseline starts after the 200-player fixture, event
    // streams, AOI positions and initial battle rooms exist. Startup allocation
    // is capacity evidence of its own, but it is not a 30-minute leak slope.
    this.initialMetrics = await this.worker.rpc("metrics", {
      gc: true,
      resetPeakRss: true,
      includeHeapDiagnostics: true,
      includeRetentionDiagnostics: true,
    });
    await startCapacityHostEvidence(this.hostEvidenceLifecycle);
    await this.worker.rpc("markScenarioStart", {durationMs: this.durationMs});
    this.scenarioStartedAt = performance.now();
    this.running = true;
    this.metricsPromise = this.sampleMetrics();
    // Take one deterministic normal-AOI sentinel sample before timeline locks
    // can overlap. Recurring samples still exercise hotspot/reconnect phases.
    await this.runPresenceSentinel(0);
    await this.runScheduler();
    this.schedulerFinishedAt = performance.now();
    this.running = false;
    this.sentinel.cancel();
    await this.drainInflight();
    await this.waitForServerDrain();
    this.loadFinishedAt = performance.now();
    if (this.metricsPromise) {
      await this.metricsPromise;
    }
    await this.reconcileFinalState();
    this.finalHealth = await this.request(null, "/health");
    if (!this.finalHealth.ok) {
      throw new Error(`post-drain health failed ${this.finalHealth.status}/${this.finalHealth.json && this.finalHealth.json.code}`);
    }
    this.finalMetrics = await this.worker.rpc("metrics", {
      gc: true,
      includeGcTimeline: true,
      includeOperationCommitTimes: true,
      includeCloneDiagnostics: true,
      includeHeapDiagnostics: true,
      includeRetentionDiagnostics: true,
    });
    this.finalClientState = finalClientSummary(this.clients, this.heldClients, this.pausedAccounts);
    this.scenarioFinishedAt = performance.now();
  }

  async initializePositions() {
    await mapInBatches(this.accountStates, 20, async (state) => {
      const result = await this.request(state.account, "/players/position", {
        method: "POST",
        body: positionPayload(state, this.hotspotActive ? 48 : 18),
      });
      if (!result.ok) {
        throw new Error(`initial position ${state.index} failed: ${result.status}/${result.json && result.json.code}`);
      }
      state.movementSeq = Number(result.json.position && result.json.position.movementSeq || 0);
      this.correctness.initializedPositions += 1;
    });
  }

  async connectAll() {
    const startedAt = performance.now();
    await mapWithConcurrency(this.accountStates, 8, async (state) => {
      const client = this.createClient(state.index, 0, "");
      this.clients[state.index] = client;
      await client.connect(WS_TIMEOUT_MS);
      this.correctness.initializedConnections += 1;
    });
    this.initialConnectMs = performance.now() - startedAt;
  }

  createClient(index, lastEventSeq, epoch, initialPresenceRevisions = []) {
    const state = this.accountStates[index];
    return new RawJsonWebSocket({
      host: "127.0.0.1",
      port: this.worker.port,
      path: eventStreamPath({lastEventSeq, epoch}),
      headers: eventStreamHeaders(state.account),
      index,
      expectedAccountId: state.account.accountId,
      lastEventSeq,
      initialPresenceRevisions,
      onEvent: (clientIndex, event, byteLength, receivedAt) => {
        this.sentinel.record(clientIndex, event, byteLength, receivedAt);
        this.businessEventTracker.record(clientIndex, event, byteLength, receivedAt);
      },
    });
  }

  async startInitialBattles() {
    for (let groupIndex = 0; groupIndex < BATTLE_ACTIVE_GROUPS; groupIndex += 1) {
      const state = {groupIndex, busy: false, roomId: "", round: 0, commandActors: []};
      this.battleStates.push(state);
      await this.startBattle(state);
    }
  }

  async runScheduler() {
    let tick = 0;
    let nextTickAt = performance.now();
    while (tick < this.schedulerExpectedTicks) {
      const nowAt = performance.now();
      if (nowAt < nextTickAt) {
        await delay(nextTickAt - nowAt);
        continue;
      }
      if (this.inFlight.size >= 240) {
        this.correctness.schedulerBackpressureTicks += 1;
        await Promise.race(this.inFlight);
        nextTickAt = Math.max(nextTickAt, performance.now());
        continue;
      }
      const timing = capacitySchedulerTickTiming(nextTickAt, nowAt, TICK_MS);
      this.schedulerLag.push(timing.lagMs);
      if (timing.lagMs >= this.schedulerMaxLagMs) {
        this.schedulerMaxLagMs = timing.lagMs;
        this.schedulerMaxLagAtElapsedMs = Math.max(0, nowAt - this.scenarioStartedAt);
      }
      if (timing.rebased) {
        this.schedulerRebaseCount += 1;
        this.schedulerRebasedLagMs += timing.lagMs;
      }
      nextTickAt = timing.dispatchAtMs;
      // Workload phases and modulo probes follow logical 10 Hz time. A paused
      // local driver therefore extends wall time while still issuing every
      // planned tick exactly once, instead of replaying missed ticks as an
      // artificial same-machine request burst.
      const elapsedMs = tick * TICK_MS;
      this.updateHotspotMode(elapsedMs);
      this.scheduleMovementBurst(tick, elapsedMs);
      this.scheduleHeartbeatBurst(elapsedMs);
      this.schedulePartyPollBurst(elapsedMs);
      if (tick % 5 === 0) {
        this.launch(this.sendChat(elapsedMs));
      }
      if (tick % 10 === 0) {
        this.launch(this.runAssetMutation(elapsedMs));
        this.launch(this.marketPoll(elapsedMs));
      }
      if (tick % 10 === 5) {
        this.launch(this.profilePoll(elapsedMs));
      }
      if (tick % 50 === 0 && tick > 0) {
        this.launch(this.runPartyChurn(elapsedMs));
      }
      if (tick >= 45 && (tick - 45) % 15 === 0) {
        const battle = this.battleStates[this.battleRoundCursor % this.battleStates.length];
        this.battleRoundCursor += 1;
        this.launch(this.runBattleRound(battle, elapsedMs));
      }
      if (tick >= 600 && tick % 600 === 7) {
        this.launch(this.runAuthorityCheckpoint(elapsedMs));
      }
      const businessProbeTick = this.options.durationSeconds >= QUICK_DURATION_SECONDS
        ? tick >= BUSINESS_PROBE_START_TICK
          && (tick - BUSINESS_PROBE_START_TICK) % BUSINESS_PROBE_INTERVAL_TICKS === 0
        : tick === 5;
      if (businessProbeTick) {
        this.launch(this.runBusinessEventProbe(elapsedMs));
      }
      // A normal-AOI baseline already ran before the scheduler. Start recurring
      // hotspot samples 2.5s later, matching later hotspot windows instead of
      // measuring the synthetic 200-account radius transition itself. The
      // coordination lock also prevents reconnect from changing recipients
      // while the 3-second SLA is timed. Offset samples from the eight-mover
      // wrap (tick % 50 === 0 always selects sentinel account 60 first).
      if (tick >= 25 && tick % 50 === 25) {
        this.launch(this.runPresenceSentinel(elapsedMs));
      }
      this.scheduleTimeline(elapsedMs);
      tick += 1;
      this.schedulerTickCount = tick;
      nextTickAt = timing.nextTickAtMs;
      await delay(Math.max(0, nextTickAt - performance.now()));
    }
  }

  scheduleMovementBurst(tick, elapsedMs) {
    if (this.hotspotTransitionBusy) {
      return;
    }
    for (let offset = 0; offset < 8; offset += 1) {
      const moverOffset = this.movementCursor % MOVER_COUNT;
      this.movementCursor += 1;
      const index = MOVER_START + moverOffset;
      const state = this.accountStates[index];
      if (this.pausedAccounts.has(index) || state.positionBusy) {
        continue;
      }
      this.launch(this.moveOne(state, elapsedMs));
    }
    if (this.hotspotActive) {
      const hotMovers = this.accountStates.slice(MOVER_START, MOVER_START + MOVER_COUNT);
      for (let offset = 0; offset < 2; offset += 1) {
        const state = hotMovers[this.hotMovementCursor % hotMovers.length];
        this.hotMovementCursor += 1;
        if (!this.pausedAccounts.has(state.index) && !state.positionBusy) {
          this.launch(this.moveOne(state, elapsedMs, "movement_hotspot"));
        }
      }
    }
  }

  updateHotspotMode(elapsedMs) {
    const active = hotspotActiveAt(elapsedMs, this.options.durationSeconds, this.options.full);
    if (active === this.hotspotActive || this.hotspotTransitionBusy) {
      return;
    }
    this.launch(this.setHotspotMode(active, elapsedMs));
  }

  async setHotspotMode(active, elapsedMs) {
    this.hotspotActive = active;
    this.hotspotTransitionBusy = true;
    const desiredRadius = active ? 48 : 18;
    // Keep the intended client subscription even for accounts currently held
    // out by a reconnect. Their post-handshake position refresh reapplies it
    // before they rejoin any sentinel expectation.
    this.accountStates.forEach((state) => { state.aoiRadius = desiredRadius; });
    const targets = this.accountStates.filter((state) => !this.pausedAccounts.has(state.index));
    this.correctness.hotspotSkippedPaused += ACCOUNT_COUNT - targets.length;
    try {
      await mapWithConcurrency(targets, 20, async (state) => {
        for (let attempt = 0; state.positionBusy && attempt < 100; attempt += 1) {
          await delay(10);
        }
        if (state.positionBusy) {
          pushFailure(this.failures, `hotspot radius account=${state.index} could not acquire its position lock`);
          return;
        }
        state.positionBusy = true;
        try {
          const result = await this.request(state.account, "/players/position", {
            method: "POST",
            body: positionPayload(state, desiredRadius),
          });
          this.recordRequest(active ? "hotspot_enter" : "hotspot_exit", result, elapsedMs);
          if (!result.ok) {
            pushFailure(this.failures, `hotspot radius account=${state.index} failed ${result.status}/${result.json && result.json.code}`);
            return;
          }
          this.correctness.hotspotRadiusUpdates += 1;
        } finally {
          state.positionBusy = false;
        }
      });
      this.correctness.hotspotTransitions += 1;
    } finally {
      this.hotspotTransitionBusy = false;
    }
  }

  scheduleHeartbeatBurst(elapsedMs) {
    if (this.hotspotTransitionBusy) {
      return;
    }
    for (let count = 0; count < 2; count += 1) {
      const index = this.heartbeatCursor % ACCOUNT_COUNT;
      this.heartbeatCursor += 1;
      if (this.pausedAccounts.has(index)) {
        continue;
      }
      this.launch(this.heartbeat(this.accountStates[index], elapsedMs));
    }
  }

  schedulePartyPollBurst(elapsedMs) {
    for (let count = 0; count < 2; count += 1) {
      const index = this.partyPollCursor % ACCOUNT_COUNT;
      this.partyPollCursor += 1;
      if (this.pausedAccounts.has(index)) {
        continue;
      }
      this.launch(this.partyPoll(this.accountStates[index], elapsedMs));
    }
  }

  async moveOne(state, elapsedMs, category = "movement") {
    if (state.positionBusy) {
      return null;
    }
    state.positionBusy = true;
    const previousIndex = state.pathIndex;
    const nextIndex = (previousIndex + 1) % state.path.length;
    const [fromCellX, fromCellY] = state.path[previousIndex];
    const [toCellX, toCellY] = state.path[nextIndex];
    try {
      const result = await this.request(state.account, "/movement/step", {
        method: "POST",
          body: movementStepPayload(state, fromCellX, fromCellY, toCellX, toCellY),
      });
      this.recordRequest(category, result, elapsedMs);
      if (result.ok) {
        state.pathIndex = nextIndex;
        state.movementSeq = Number(result.json.position && result.json.position.movementSeq || state.movementSeq + 1);
        this.correctness.movementAccepted += 1;
      } else {
        pushFailure(this.failures, `${category} account=${state.index} failed ${result.status}/${result.json && result.json.code}`);
      }
      return result;
    } finally {
      state.positionBusy = false;
    }
  }

  async heartbeat(state, elapsedMs) {
    if (state.positionBusy) {
      return;
    }
    state.positionBusy = true;
    try {
      const result = await this.request(state.account, "/players/position", {
        method: "POST",
        body: positionPayload(state),
      });
      this.recordRequest("heartbeat", result, elapsedMs);
      if (result.ok) {
        state.aoiRadius = this.hotspotActive ? 48 : 18;
        this.correctness.heartbeatsAccepted += 1;
      } else {
        pushFailure(this.failures, `heartbeat account=${state.index} failed ${result.status}/${result.json && result.json.code}`);
      }
    } finally {
      state.positionBusy = false;
    }
  }

  async partyPoll(state, elapsedMs) {
    const result = await this.request(state.account, "/party/state");
    this.recordRequest("party_read", result, elapsedMs);
    if (result.ok) {
      this.correctness.partyPollAccepted += 1;
    } else {
      pushFailure(this.failures, `party poll account=${state.index} failed ${result.status}/${result.json && result.json.code}`);
    }
  }

  async marketPoll(elapsedMs) {
    const state = this.accountStates[this.marketCursor % ACCOUNT_COUNT];
    this.marketCursor += 1;
    if (this.pausedAccounts.has(state.index)) {
      return;
    }
    const result = await this.request(state.account, "/market/listings?limit=20");
    this.recordRequest("market_read", result, elapsedMs);
    if (result.ok) {
      this.correctness.marketPollAccepted += 1;
    } else {
      pushFailure(this.failures, `market poll account=${state.index} failed ${result.status}/${result.json && result.json.code}`);
    }
  }

  async profilePoll(elapsedMs) {
    const state = this.accountStates[this.profilePollCursor % ASSET_START];
    this.profilePollCursor += 1;
    if (this.pausedAccounts.has(state.index)) {
      return;
    }
    const result = await this.request(state.account, "/profiles/me");
    this.recordRequest("profile_read", result, elapsedMs);
    if (this.verifyProfileResult(state, result, "runtime read")) {
      this.correctness.profilePollAccepted += 1;
    }
  }

  async sendChat(elapsedMs) {
    const nearby = this.chatCursor % 2 === 0;
    const state = nearby
      ? this.accountStates[CHAT_START + (this.chatCursor % (ACCOUNT_COUNT - CHAT_START))]
      : this.accountStates[this.chatCursor % (BATTLE_ACTIVE_GROUPS * BATTLE_GROUP_SIZE)];
    this.chatCursor += 1;
    const result = await this.request(state.account, "/chat/send", {
      method: "POST",
      body: {
        channel: nearby ? "nearby" : "team",
        text: `容量${nearby ? "附近" : "队伍"}-${this.chatCursor}`,
      },
    });
    this.recordRequest("chat_write", result, elapsedMs);
    if (result.ok) {
      this.correctness.chatAccepted += 1;
    } else {
      pushFailure(this.failures, `chat failed ${result.status}/${result.json && result.json.code}`);
    }
  }

  async runBusinessEventProbe(elapsedMs) {
    if (this.businessProbeBusy || this.checkpointBusy || !this.coordination.tryBeginBusiness()) {
      return;
    }
    this.businessProbeBusy = true;
    const probeIndex = this.businessProbeCursor;
    this.businessProbeCursor += 1;
    const probeId = `p06c.ws.${String(probeIndex + 1).padStart(4, "0")}`;
    try {
      const nearbySender = this.accountStates[CHAT_START + (probeIndex % (ACCOUNT_COUNT - CHAT_START))];
      await this.runBusinessChatProbe("nearby", nearbySender, `${probeId}.nearby`, this.activeClientIndexes(), elapsedMs, probeId);
      const teamGroupIndex = 4 + (probeIndex % Math.max(1, BATTLE_GROUP_COUNT - BATTLE_ACTIVE_GROUPS));
      const teamSender = this.accountStates[teamGroupIndex * BATTLE_GROUP_SIZE];
      await this.runBusinessChatProbe("team", teamSender, `${probeId}.team`, this.groupClientIndexes(teamGroupIndex), elapsedMs, probeId);
      await this.runPartyChurn(elapsedMs, {
        businessProbe: true,
        groupOffset: probeIndex % CHURN_GROUP_COUNT,
        probeId,
      });
      const battle = this.battleStates[probeIndex % this.battleStates.length];
      await this.runBattleRound(battle, elapsedMs, {businessProbe: true, probeId});
      this.correctness.businessEventProbes += 1;
    } finally {
      this.businessProbeBusy = false;
      this.coordination.endBusiness();
    }
  }

  async runBusinessChatProbe(channel, state, marker, expectedClients, elapsedMs, probeId) {
    const observed = this.businessEventTracker.expect({
      domain: "chat",
      channel,
      probeId,
      elapsedMs,
      expectedClients,
      minimumExpectedTargets: expectedClients.size,
      predicate: (event) => event && event.type === "chat.message"
        && event.message
        && event.message.channel === channel
        && event.message.text === marker,
    });
    const result = await this.request(state.account, "/chat/send", {
      method: "POST",
      body: {channel, text: marker},
    });
    this.recordRequest("chat_probe", result, elapsedMs);
    if (!result.ok) {
      pushFailure(this.failures, `business chat probe ${probeId}/${channel} failed ${result.status}/${result.json && result.json.code}`);
    }
    await observed;
  }

  activeClientIndexes() {
    return new Set(this.clients.map((client, index) => (
      client
      && !client.closed
        ? index
        : -1
    )).filter((index) => index >= 0));
  }

  groupClientIndexes(groupIndex) {
    return new Set(Array.from({length: BATTLE_GROUP_SIZE}, (_, offset) => groupIndex * BATTLE_GROUP_SIZE + offset).filter((index) => {
      const client = this.clients[index];
      return client && !client.closed;
    }));
  }

  async runAssetMutation(elapsedMs) {
    if (this.checkpointBusy) {
      return;
    }
    const state = this.accountStates[ASSET_START + (this.assetCursor % ASSET_COUNT)];
    this.assetCursor += 1;
    const mutationSequence = this.assetCursor;
    if (state.assetBusy) {
      return;
    }
    state.assetBusy = true;
    const withdraw = state.expectedBankCoins > 0;
    const pathName = withdraw ? "/bank/withdraw" : "/bank/deposit";
    const operationId = `p06c.asset.${String(mutationSequence).padStart(12, "0")}`;
    try {
      const options = {
        method: "POST",
        headers: {"idempotency-key": operationId},
        body: {stoneCoins: 1, items: []},
      };
      const result = await this.request(state.account, pathName, options);
      this.recordRequest("asset_write", result, elapsedMs);
      if (!result.ok) {
        pushFailure(this.failures, `asset ${pathName} failed ${result.status}/${result.json && result.json.code}`);
        return;
      }
      this.assetCommitObservations.push({
        operationId,
        responseObservedAtUnixMs: Number(result.responseObservedAtUnixMs || 0),
      });
      const beforeBank = state.expectedBankCoins;
      state.expectedBankCoins += withdraw ? -1 : 1;
      state.expectedStoneCoins += withdraw ? 1 : -1;
      this.correctness.assetWrites += 1;
      if (mutationSequence % 10 === 0) {
        const replay = await this.request(state.account, pathName, options);
        this.recordRequest("asset_replay", replay, elapsedMs);
        this.correctness.assetReplays += 1;
        if (!replay.ok || !replay.json.durableCommit || replay.json.durableCommit.replayed !== true) {
          pushFailure(this.failures, `asset replay ${operationId} was not acknowledged as replay`);
        }
        const replayBank = Number(replay.json.bank && replay.json.bank.stoneCoins);
        if (Number.isFinite(replayBank) && replayBank !== state.expectedBankCoins) {
          this.correctness.assetDuplicateApplications += 1;
        }
      }
      const bankCoins = Number(result.json.bank && result.json.bank.stoneCoins);
      if (Number.isFinite(bankCoins) && bankCoins !== state.expectedBankCoins) {
        pushFailure(this.failures, `asset bank drift account=${state.index} before=${beforeBank} expected=${state.expectedBankCoins} actual=${bankCoins}`);
      }
    } finally {
      state.assetBusy = false;
    }
  }

  async runPartyChurn(elapsedMs, options = {}) {
    if ((this.checkpointBusy || this.businessProbeBusy) && options.businessProbe !== true) {
      return;
    }
    const groupOffset = options.businessProbe === true
      ? Math.max(0, Math.min(CHURN_GROUP_COUNT - 1, Number(options.groupOffset || 0)))
      : this.churnCursor % CHURN_GROUP_COUNT;
    if (options.businessProbe !== true) {
      this.churnCursor += 1;
    }
    const groupIndex = CHURN_GROUP_START + groupOffset;
    const leaderIndex = groupIndex * BATTLE_GROUP_SIZE;
    const memberIndex = leaderIndex + BATTLE_GROUP_SIZE - 1;
    const leader = this.accountStates[leaderIndex];
    const member = this.accountStates[memberIndex];
    if (options.businessProbe === true) {
      for (let attempt = 0; (leader.churnBusy || member.churnBusy) && attempt < 100; attempt += 1) {
        await delay(50);
      }
    }
    if (leader.churnBusy || member.churnBusy) {
      if (options.businessProbe === true) {
        pushFailure(this.failures, `business party probe ${options.probeId} could not acquire group ${groupIndex}`);
      }
      return;
    }
    leader.churnBusy = true;
    member.churnBusy = true;
    try {
      const left = await this.request(member.account, "/party/leave", {method: "POST", body: {}});
      this.recordRequest("party_write", left, elapsedMs);
      if (!left.ok) {
        pushFailure(this.failures, `party leave failed group=${groupIndex} ${left.status}/${left.json && left.json.code}`);
        return;
      }
      const invited = await this.request(leader.account, "/party/invite", {
        method: "POST",
        body: {username: member.account.username},
      });
      this.recordRequest("party_write", invited, elapsedMs);
      const inviteId = String(invited.json && invited.json.invite && invited.json.invite.inviteId || "");
      if (!invited.ok || inviteId === "") {
        pushFailure(this.failures, `party invite failed group=${groupIndex}`);
        return;
      }
      const observed = options.businessProbe === true ? this.businessEventTracker.expect({
        domain: "party",
        channel: "churn_accept",
        probeId: options.probeId,
        elapsedMs,
        expectedClients: this.groupClientIndexes(groupIndex),
        minimumExpectedTargets: BATTLE_GROUP_SIZE,
        predicate: (event) => event && event.type === "party.update"
          && event.invite
          && event.invite.inviteId === inviteId
          && event.invite.status === "accepted",
      }) : null;
      const accepted = await this.request(member.account, `/party/invites/${encodeURIComponent(inviteId)}/accept`, {method: "POST", body: {}});
      this.recordRequest("party_write", accepted, elapsedMs);
      if (!accepted.ok || Number(accepted.json.party && accepted.json.party.memberCount || 0) !== BATTLE_GROUP_SIZE) {
        pushFailure(this.failures, `party accept failed group=${groupIndex}`);
        if (observed) {
          await observed;
        }
        return;
      }
      this.correctness.partyChurnCycles += 1;
      if (observed) {
        await observed;
      }
    } finally {
      leader.churnBusy = false;
      member.churnBusy = false;
    }
  }

  async startBattle(battle) {
    const leaderIndex = battle.groupIndex * BATTLE_GROUP_SIZE;
    const leader = this.accountStates[leaderIndex];
    const result = await this.request(leader.account, "/battle/party-encounter", {
      method: "POST",
      body: battleEncounterPayload(battle.groupIndex),
    });
    // Initial battle setup happens before the timed scenario starts. Keep those
    // requests in the first window instead of treating process uptime as the
    // scenario elapsed time (which can poison short smoke reports).
    const elapsedMs = this.scenarioStartedAt > 0
      ? Math.max(0, performance.now() - this.scenarioStartedAt)
      : 0;
    this.recordRequest("battle_write", result, elapsedMs);
    if (!result.ok) {
      pushFailure(this.failures, `battle start group=${battle.groupIndex} failed ${result.status}/${result.json && result.json.code}`);
      return false;
    }
    const room = result.json.room || {};
    battle.roomId = String(room.roomId || "");
    if (battle.roomId !== "") {
      this.startedBattleRoomIds.push(battle.roomId);
    }
    battle.round = Number(room.battle && room.battle.round || 1);
    const actorValidation = capacityBattleActorRosterValidation(
      room.battle && room.battle.actors,
      battle.groupIndex,
      this.accountStates,
    );
    battle.commandActors = battleCommandActors(room, this.accountStates);
    if (!actorValidation.ok || battle.commandActors.length !== 10) {
      pushFailure(this.failures, `battle group=${battle.groupIndex} actor mapping invalid: ${actorValidation.message}; commands=${battle.commandActors.length}/10`);
    }
    this.correctness.battleRoomsStarted += 1;
    return battle.roomId !== "";
  }

  async runBattleRound(battle, elapsedMs, options = {}) {
    if ((this.checkpointBusy || this.businessProbeBusy) && options.businessProbe !== true) {
      return;
    }
    if (options.businessProbe === true) {
      for (let attempt = 0; battle.busy && attempt < 100; attempt += 1) {
        await delay(50);
      }
    }
    if (battle.busy || battle.roomId === "") {
      if (options.businessProbe === true) {
        pushFailure(this.failures, `business battle probe ${options.probeId} could not acquire group ${battle.groupIndex}`);
      }
      return;
    }
    const firstIndex = battle.groupIndex * BATTLE_GROUP_SIZE;
    if (Array.from({length: BATTLE_GROUP_SIZE}, (_, offset) => firstIndex + offset).some((index) => this.pausedAccounts.has(index))) {
      if (options.businessProbe === true) {
        pushFailure(this.failures, `business battle probe ${options.probeId} target group is reconnecting`);
      }
      return;
    }
    battle.busy = true;
    try {
      const expectedRound = battle.round;
      const expectedRoomId = battle.roomId;
      const observed = options.businessProbe === true ? this.businessEventTracker.expect({
        domain: "battle",
        channel: "turn_resolved",
        probeId: options.probeId,
        elapsedMs,
        expectedClients: this.groupClientIndexes(battle.groupIndex),
        minimumExpectedTargets: BATTLE_GROUP_SIZE,
        predicate: (event) => event && event.type === "battle.turn_resolved"
          && event.roomId === expectedRoomId
          && Number(event.round || 0) === expectedRound,
      }) : null;
      const results = new Array(battle.commandActors.length);
      await mapWithConcurrency(battle.commandActors, 2, async (entry, index) => {
        const result = await this.request(entry.account, `/battle/rooms/${encodeURIComponent(battle.roomId)}/commands`, {
          method: "POST",
          body: {
            round: battle.round,
            actorId: entry.actorId,
            actionId: entry.kind === "pet" ? "pet_defend" : "defend",
          },
        });
        this.recordRequest("battle_command", result, elapsedMs);
        results[index] = result;
      });
      if (results.some((result) => !result.ok)) {
        const failure = results.find((result) => !result.ok);
        pushFailure(this.failures, `battle command group=${battle.groupIndex} failed ${failure.status}/${failure.json && failure.json.code}`);
        if (observed) {
          await observed;
        }
        return;
      }
      const resolved = results.find((result) => result.json && result.json.turn) || results.at(-1);
      battle.round = Number(resolved.json.room && resolved.json.room.battle && resolved.json.room.battle.round || battle.round + 1);
      this.correctness.battleRoundsResolved += 1;
      if (observed) {
        await observed;
      }
      if (battle.round > 3) {
        const leader = this.accountStates[battle.groupIndex * BATTLE_GROUP_SIZE];
        const closedRoomId = battle.roomId;
        const closed = await this.request(leader.account, `/battle/rooms/${encodeURIComponent(battle.roomId)}/leave`, {method: "POST", body: {}});
        this.recordRequest("battle_write", closed, elapsedMs);
        if (!closed.ok) {
          pushFailure(this.failures, `battle close group=${battle.groupIndex} failed`);
          return;
        }
        this.correctness.battleRoomsClosed += 1;
        this.closedBattleRoomIds.push(closedRoomId);
        battle.roomId = "";
        battle.round = 0;
        battle.commandActors = [];
        await this.startBattle(battle);
      }
    } finally {
      battle.busy = false;
    }
  }

  async runPresenceSentinel(elapsedMs) {
    if (
      this.sentinel.active
      || this.hotspotTransitionBusy
      || !this.coordination.tryBeginSentinel()
    ) {
      return;
    }
    try {
      const state = this.accountStates[MOVER_START];
      if (state.positionBusy || this.pausedAccounts.has(state.index)) {
        return;
      }
      const expected = new Set(this.accountStates.filter((value) => (
        !this.pausedAccounts.has(value.index)
        && (this.hotspotActive || value.cluster === state.cluster)
      )).map((value) => value.index));
      const wait = this.sentinel.begin(state.account.accountId, expected, performance.now(), 3000);
      const movement = await this.moveOne(state, elapsedMs, "movement_sentinel");
      if (!movement || !movement.ok) {
        this.sentinel.cancel();
        return;
      }
      try {
        const observed = await wait;
        if (observed.cancelled) {
          return;
        }
        this.latencies.record("ws_sentinel_last", observed.lastAt - observed.startedAt, {elapsedMs});
        this.latencies.record("ws_sentinel_spread", observed.lastAt - observed.firstAt, {elapsedMs});
      } catch (error) {
        pushFailure(this.failures, error.message);
      }
    } finally {
      this.coordination.endSentinel();
    }
  }

  scheduleTimeline(elapsedMs) {
    const elapsedSeconds = elapsedMs / 1000;
    const events = timelineFor(this.options.durationSeconds, this.options.full, this.options.skipAttacks);
    for (const event of events) {
      if (elapsedSeconds < event.atSeconds || this.timelineFired.has(event.id)) {
        continue;
      }
      this.timelineFired.add(event.id);
      if (event.kind === "reconnect") {
        this.launch(this.runReconnectStorm(event));
      } else if (event.kind === "attack") {
        this.launch(this.runSecurityAttacks(event.id));
      } else if (event.kind === "hold_cursor") {
        this.launch(this.holdCursorClient(event.index));
      } else if (event.kind === "restore_cursor") {
        this.launch(this.restoreCursorClient(event.index));
      }
    }
  }

  async runReconnectStorm(event) {
    const coordinationAcquired = await this.coordination.beginReconnect(WS_TIMEOUT_MS);
    if (!coordinationAcquired) {
      pushFailure(this.failures, `reconnect storm ${event.id} could not acquire the bounded business-probe coordination lock`);
      return;
    }
    const count = Math.min(ACCOUNT_COUNT, event.count);
    const startIndex = event.count >= ACCOUNT_COUNT ? 0 : (Math.trunc(this.random() * (ACCOUNT_COUNT - count + 1)));
    const indices = Array.from({length: ACCOUNT_COUNT}, (_, offset) => (startIndex + offset) % ACCOUNT_COUNT)
      .filter((index) => !this.heldClients.has(index))
      .slice(0, count);
    indices.forEach((index) => this.pausedAccounts.add(index));
    const startedAt = performance.now();
    const reconnectWithLimit = createConcurrencyLimiter(8);
    const attempts = indices.map((index) => ({
      index,
      jitterMs: Math.trunc(this.random() * event.jitterMs),
    }));
    let completions = [];
    try {
      completions = await Promise.all(attempts.map(async (attempt) => {
        await delay(attempt.jitterMs);
        const dueAt = startedAt + attempt.jitterMs;
        await reconnectWithLimit(() => this.reconnectOne(attempt.index));
        return {
          index: attempt.index,
          jitterMs: attempt.jitterMs,
          recoveryMsExcludingJitter: Math.max(0, performance.now() - dueAt),
        };
      }));
    } finally {
      indices.forEach((index) => this.pausedAccounts.delete(index));
      this.coordination.endReconnect();
    }
    const row = {
      id: event.id,
      count: indices.length,
      jitterMs: event.jitterMs,
      elapsedMs: round(performance.now() - startedAt),
      maxAppliedJitterMs: Math.max(0, ...completions.map((entry) => entry.jitterMs)),
      recoveryP95MsExcludingJitter: percentile(completions.map((entry) => entry.recoveryMsExcludingJitter), 0.95),
      recoveryMaxMsExcludingJitter: round(Math.max(0, ...completions.map((entry) => entry.recoveryMsExcludingJitter))),
    };
    this.storms.push(row);
  }

  async holdCursorClient(index) {
    const coordinationAcquired = await this.coordination.beginReconnect(WS_TIMEOUT_MS);
    if (!coordinationAcquired) {
      pushFailure(this.failures, `cursor hold client ${index} could not acquire the sentinel coordination lock`);
      return;
    }
    try {
      if (this.heldClients.has(index)) {
        return;
      }
      const previous = this.clients[index];
      if (!previous) {
        pushFailure(this.failures, `cursor hold client ${index} is missing`);
        return;
      }
      this.heldClients.set(index, {
        lastEventSeq: previous.lastEventSeq,
        epoch: previous.epoch,
        presenceRevisions: [...previous.presenceRevisions.entries()],
        heldAt: performance.now(),
      });
      this.retiredClientSummaries.push(previous.summary());
      this.pausedAccounts.add(index);
      previous.expectedClose = true;
      previous.terminate();
      this.clients[index] = null;
    } finally {
      this.coordination.endReconnect();
    }
  }

  async restoreCursorClient(index) {
    const coordinationAcquired = await this.coordination.beginReconnect(WS_TIMEOUT_MS);
    if (!coordinationAcquired) {
      pushFailure(this.failures, `cursor restore client ${index} could not acquire the sentinel coordination lock`);
      return;
    }
    const held = this.heldClients.get(index);
    try {
      if (!held) {
        pushFailure(this.failures, `cursor restore client ${index} was not held`);
        return;
      }
      const client = this.createClient(index, held.lastEventSeq, held.epoch, held.presenceRevisions);
      this.clients[index] = client;
      const startedAt = performance.now();
      await client.connect(WS_TIMEOUT_MS);
      await this.refreshAoiAfterReconnect(index);
      this.latencies.record("ws_stale_cursor_reset", performance.now() - startedAt, {
        elapsedMs: Math.max(0, performance.now() - this.scenarioStartedAt),
      });
      if (client.resetCount < 1) {
        pushFailure(this.failures, `stale cursor client ${index} did not receive events.reset`);
      } else {
        this.correctness.staleCursorResets += 1;
      }
    } finally {
      this.heldClients.delete(index);
      this.pausedAccounts.delete(index);
      this.coordination.endReconnect();
    }
  }

  async reconnectOne(index) {
    const previous = this.clients[index];
    const cursor = previous ? previous.lastEventSeq : 0;
    const epoch = previous ? previous.epoch : "";
    if (previous) {
      this.retiredClientSummaries.push(previous.summary());
      previous.expectedClose = true;
      previous.terminate();
    }
    await delay(25);
    const client = this.createClient(index, cursor, epoch, previous ? [...previous.presenceRevisions.entries()] : []);
    this.clients[index] = client;
    const startedAt = performance.now();
    await client.connect(WS_TIMEOUT_MS);
    await this.refreshAoiAfterReconnect(index);
    this.latencies.record("ws_reconnect", performance.now() - startedAt, {
      elapsedMs: Math.max(0, performance.now() - this.scenarioStartedAt),
    });
    this.correctness.reconnects += 1;
  }

  async refreshAoiAfterReconnect(index) {
    const state = this.accountStates[index];
    for (let attempt = 0; state.positionBusy && attempt < 100; attempt += 1) {
      await delay(10);
    }
    if (state.positionBusy) {
      pushFailure(this.failures, `reconnect AOI account=${index} could not acquire its position lock`);
      return false;
    }
    state.positionBusy = true;
    try {
      const result = await this.request(state.account, "/players/position", {
        method: "POST",
        body: positionPayload(state),
      });
      this.recordRequest("reconnect_aoi", result, Math.max(0, performance.now() - this.scenarioStartedAt));
      if (!result.ok) {
        pushFailure(this.failures, `reconnect AOI account=${index} failed ${result.status}/${result.json && result.json.code}`);
        return false;
      }
      return true;
    } finally {
      state.positionBusy = false;
    }
  }

  async runSecurityAttacks(label) {
    const startedAt = performance.now();
    const account = this.accountStates[CHAT_START].account;
    const result = {label, checks: {}};
    try {
      const oversized = await this.request(account, "/chat/send", {
        method: "POST",
        rawBody: true,
        body: JSON.stringify({channel: "nearby", text: "x".repeat(70 * 1024)}),
        headers: {"content-type": "application/json"},
      });
      result.checks.oversizedBodyStatus = oversized.status;
      if (oversized.status === 413) {
        this.correctness.attackExpectedRejects += 1;
      } else {
        this.correctness.attackUnexpectedResults += 1;
        pushFailure(this.failures, `security ${label} oversized body status ${oversized.status} != 413`);
      }

      const authRows = await Promise.all(Array.from({length: 12}, (_, index) => fetchJsonMeasured(`${this.base}/auth/login`, {
        method: "POST",
        protocolVersion: PROTOCOL_VERSION,
        clientVersion: SERVER_VERSION,
        headers: {"x-forwarded-for": `203.0.113.${index + 1}`},
        body: {username: `ghost${String(index).padStart(3, "0")}`, password: "wrong-password"},
        timeoutMs: HTTP_TIMEOUT_MS,
      })));
      result.checks.forgedXffStatuses = Object.fromEntries(countBy(authRows.map((row) => row.status)));
      if (forgedXffAttackWasExactlyBounded(authRows)) {
        this.correctness.attackExpectedRejects += 1;
      } else {
        this.correctness.attackUnexpectedResults += 1;
        pushFailure(this.failures, `security ${label} forged XFF statuses were not exactly 10x400 + 2x429`);
      }

      let attack = null;
      try {
        attack = await openRawWebSocketAttack({
          port: this.worker.port,
          path: eventStreamPath({lastEventSeq: 0, epoch: ""}),
          headers: eventStreamHeaders(account),
        });
        result.checks.invalidFrameHandshake = attack.headerText.split("\r\n")[0];
        if (!/^HTTP\/1\.1 101\b/.test(attack.headerText)) {
          this.correctness.attackUnexpectedResults += 1;
          pushFailure(this.failures, `security ${label} invalid-frame probe could not establish its valid handshake`);
        } else {
          const invalidFrameAt = performance.now();
          attack.socket.write(encodeClientFrame(0x9, Buffer.from("bad-unmasked"), {masked: false}));
          await withTimeout(attack.closed, 250, "unmasked websocket frame was not isolated within 250ms");
          result.checks.invalidFrameIsolationMs = round(performance.now() - invalidFrameAt);
          if (result.checks.invalidFrameIsolationMs <= 100) {
            this.correctness.attackExpectedRejects += 1;
          } else {
            this.correctness.attackUnexpectedResults += 1;
            pushFailure(this.failures, `security ${label} invalid frame isolation ${result.checks.invalidFrameIsolationMs}ms > 100ms`);
          }
        }
      } finally {
        if (attack) {
          attack.socket.destroy();
        }
      }

      const future = this.createClient(0, Number.MAX_SAFE_INTEGER - 10, "future-epoch");
      try {
        await future.connect(WS_TIMEOUT_MS);
        result.checks.futureCursorResetCount = future.resetCount;
        if (future.resetCount < 1) {
          this.correctness.attackUnexpectedResults += 1;
          pushFailure(this.failures, "future cursor websocket did not receive events.reset");
        } else {
          this.correctness.attackExpectedRejects += 1;
        }
      } finally {
        future.close();
      }
      if (!this.clients[account.index] || this.clients[account.index].closed) {
        this.correctness.attackUnexpectedResults += 1;
        pushFailure(this.failures, `security ${label} attack disconnected the legitimate websocket`);
      }
    } catch (error) {
      this.correctness.attackUnexpectedResults += 1;
      pushFailure(this.failures, `security ${label} failed: ${error.message}`);
    }
    result.elapsedMs = round(performance.now() - startedAt);
    this.attacks.push(result);
  }

  async sampleMetrics() {
    let nextAt = performance.now();
    while (this.running) {
      nextAt += METRIC_SAMPLE_MS;
      await delay(Math.max(0, nextAt - performance.now()));
      if (!this.running) {
        break;
      }
      try {
        const [sample, health] = await Promise.all([
          this.worker.rpc("metrics"),
          this.request(null, "/health"),
        ]);
        this.recordRequest("health_read", health, performance.now() - this.scenarioStartedAt);
        if (!health.ok) {
          pushFailure(this.failures, `health sample failed ${health.status}/${health.json && health.json.code}`);
        }
        const elapsedMs = performance.now() - this.scenarioStartedAt;
        const sampleIndex = this.metricSamples.length;
        const diagnosticSample = {elapsedMs, ...sample};
        const eventLoopMaxMs = Number(sample.eventLoop && sample.eventLoop.maxMs);
        if (
          eventLoopMetricRowIsValid(diagnosticSample)
          && eventLoopMaxMs > this.maxEventLoopMetricValue
        ) {
          this.maxEventLoopMetricValue = eventLoopMaxMs;
          this.maxEventLoopDiagnostic = eventLoopMaxSample(
            diagnosticSample,
            this.previousMetricResourceUsage
              ? {resourceUsage: this.previousMetricResourceUsage}
              : null,
          );
        }
        this.previousMetricResourceUsage = sample.resourceUsage
          && typeof sample.resourceUsage === "object"
          ? {...sample.resourceUsage}
          : null;
        if (sampleIndex === 0 || (sampleIndex + 1) % 30 === 0) {
          this.metricTimelineCollectionSnapshots.set(sampleIndex, sample.collections);
        }
        this.lastMetricCollections = sample.collections;
        this.metricSamples.push(capacityCompactMetricSample(sample, elapsedMs, health.json));
        this.hostEvidenceLifecycle?.collector.recordWorkloadSample({
          serverCpuPercentOneCore: sample.cpuPercent,
          elapsedMs,
        });
      } catch (error) {
        pushFailure(this.failures, `metric sample failed: ${error.message}`);
      }
    }
  }

  async runAuthorityCheckpoint(elapsedMs) {
    if (this.checkpointBusy) {
      return;
    }
    this.checkpointBusy = true;
    const row = {
      index: this.checkpointCoverage.length + 1,
      elapsedMs: round(elapsedMs),
      lockAcquired: false,
      profilesChecked: 0,
      profilesPassed: 0,
      partiesChecked: 0,
      partiesPassed: 0,
      battlesChecked: 0,
      battlesPassed: 0,
      durationMs: 0,
      error: "",
    };
    const startedAt = performance.now();
    const assetStates = this.accountStates.slice(ASSET_START, ASSET_START + ASSET_COUNT);
    const partyGroups = Array.from({length: BATTLE_GROUP_COUNT + CHURN_GROUP_COUNT}, (_, index) => index);
    const battleGroups = this.battleStates.slice();
    try {
      row.lockAcquired = await this.waitForCheckpointIdle(5000);
      if (!row.lockAcquired) {
        row.error = "checkpoint lock drain exceeded 5000ms";
        pushFailure(this.failures, row.error);
        return;
      }
      for (const state of assetStates) {
        state.assetBusy = true;
      }
      for (const groupIndex of partyGroups) {
        this.accountStates[groupIndex * BATTLE_GROUP_SIZE].churnBusy = true;
        this.accountStates[groupIndex * BATTLE_GROUP_SIZE + BATTLE_GROUP_SIZE - 1].churnBusy = true;
      }
      for (const battle of battleGroups) {
        battle.busy = true;
      }
      const snapshot = await this.authoritySnapshot(true);
      for (const state of assetStates) {
        row.profilesChecked += 1;
        if (this.verifyProfileSnapshot(state, snapshot, "checkpoint")) {
          row.profilesPassed += 1;
          this.correctness.checkpointProfiles += 1;
        }
      }
      for (const groupIndex of partyGroups) {
        row.partiesChecked += 1;
        if (this.verifyPartySnapshot(groupIndex, snapshot, "checkpoint")) {
          row.partiesPassed += 1;
          this.correctness.checkpointParties += 1;
        }
      }
      for (const battle of battleGroups) {
        row.battlesChecked += 1;
        if (this.verifyBattleSnapshot(battle, snapshot, "checkpoint")) {
          row.battlesPassed += 1;
          this.correctness.checkpointBattles += 1;
        }
      }
    } catch (error) {
      row.error = error && error.message ? error.message : String(error);
      pushFailure(this.failures, `authority checkpoint failed: ${row.error}`);
    } finally {
      if (row.lockAcquired) {
        for (const state of assetStates) {
          state.assetBusy = false;
        }
        for (const groupIndex of partyGroups) {
          this.accountStates[groupIndex * BATTLE_GROUP_SIZE].churnBusy = false;
          this.accountStates[groupIndex * BATTLE_GROUP_SIZE + BATTLE_GROUP_SIZE - 1].churnBusy = false;
        }
        for (const battle of battleGroups) {
          battle.busy = false;
        }
      }
      row.durationMs = round(performance.now() - startedAt);
      this.checkpointCoverage.push(row);
      this.correctness.authorityCheckpoints += 1;
      this.checkpointBusy = false;
    }
  }

  async waitForCheckpointIdle(timeoutMs) {
    const startedAt = performance.now();
    while (performance.now() - startedAt < timeoutMs) {
      const assetsBusy = this.accountStates.slice(ASSET_START, ASSET_START + ASSET_COUNT).some((state) => state.assetBusy);
      const partiesBusy = Array.from({length: BATTLE_GROUP_COUNT + CHURN_GROUP_COUNT}, (_, groupIndex) => {
        const leader = this.accountStates[groupIndex * BATTLE_GROUP_SIZE];
        const member = this.accountStates[groupIndex * BATTLE_GROUP_SIZE + BATTLE_GROUP_SIZE - 1];
        return leader.churnBusy || member.churnBusy;
      }).some(Boolean);
      const battlesBusy = this.battleStates.some((battle) => battle.busy);
      if (!assetsBusy && !partiesBusy && !battlesBusy) {
        return true;
      }
      await delay(25);
    }
    return false;
  }

  async reconcileFinalState() {
    const snapshot = await this.authoritySnapshot(true);
    for (const state of this.accountStates) {
      if (this.verifyProfileSnapshot(state, snapshot, "final")) {
        this.correctness.finalProfilesReconciled += 1;
        this.correctness.finalReconciliations += 1;
      }
    }
    for (let groupIndex = 0; groupIndex < BATTLE_GROUP_COUNT + CHURN_GROUP_COUNT; groupIndex += 1) {
      if (this.verifyPartySnapshot(groupIndex, snapshot, "final")) {
        this.correctness.finalPartiesReconciled += 1;
        this.correctness.finalReconciliations += 1;
      }
    }
    for (const battle of this.battleStates) {
      if (this.verifyBattleSnapshot(battle, snapshot, "final")) {
        this.correctness.finalBattleMembersReconciled += BATTLE_GROUP_SIZE;
        this.correctness.finalReconciliations += BATTLE_GROUP_SIZE;
      }
    }
  }

  async authoritySnapshot(assertNoSideEffects = false) {
    const snapshot = await this.worker.rpc("authoritySnapshot", {assertNoSideEffects});
    const reconciliationSource = String(snapshot && snapshot.reconciliationSource || "");
    if (reconciliationSource !== RECONCILIATION_SOURCE) {
      throw new Error(`capacity authority reconciliation source mismatch: ${reconciliationSource || "missing"}`);
    }
    this.reconciliationSource = reconciliationSource;
    const sideEffects = snapshot.reconciliationSideEffects || {};
    if (assertNoSideEffects) {
      this.correctness.reconciliationDurableSideEffects += Math.abs(Number(sideEffects.durableAcceptedDelta || 0))
        + Math.abs(Number(sideEffects.durableCompletedDelta || 0))
        + Math.abs(Number(sideEffects.durablePendingDelta || 0));
      this.correctness.reconciliationStoreWrites += Math.abs(Number(sideEffects.transactionDelta || 0));
    }
    return snapshot;
  }

  verifyProfileSnapshot(state, snapshot, label) {
    const profile = snapshot.profiles && snapshot.profiles[state.account.accountId];
    if (!profile || profile.playerId !== state.account.playerId
      || Number(profile.stoneCoins || 0) !== state.expectedStoneCoins
      || Number(profile.bankStoneCoins || 0) !== state.expectedBankCoins) {
      pushFailure(this.failures, `${label} authority profile account=${state.index} mismatch`);
      return false;
    }
    return true;
  }

  verifyPartySnapshot(groupIndex, snapshot, label) {
    const partyId = `party_capacity_${String(groupIndex).padStart(2, "0")}`;
    const party = snapshot.parties && snapshot.parties[partyId];
    const expectedUsernames = Array.from({length: BATTLE_GROUP_SIZE}, (_, offset) => this.accountStates[groupIndex * BATTLE_GROUP_SIZE + offset].account.username).sort();
    const actualUsernames = Array.isArray(party && party.memberUsernames) ? party.memberUsernames.map(String).sort() : [];
    if (!party || party.leaderUsername !== expectedUsernames[0] || JSON.stringify(actualUsernames) !== JSON.stringify(expectedUsernames)) {
      pushFailure(this.failures, `${label} authority party group=${groupIndex} members=${actualUsernames.length}/${BATTLE_GROUP_SIZE}`);
      return false;
    }
    return true;
  }

  verifyBattleSnapshot(battle, snapshot, label) {
    const room = snapshot.battleRooms && snapshot.battleRooms[battle.roomId];
    const actors = Array.isArray(room && room.actors) ? room.actors : [];
    const validation = capacityBattleActorRosterValidation(actors, battle.groupIndex, this.accountStates);
    if (!room || !validation.ok) {
      pushFailure(this.failures, `${label} authority battle group=${battle.groupIndex} room=${battle.roomId || "missing"}: ${validation.message}`);
      return false;
    }
    return true;
  }

  verifyProfileResult(state, result, label) {
    if (!result.ok) {
      pushFailure(this.failures, `${label} profile account=${state.index} failed ${result.status}/${result.json && result.json.code}`);
      return false;
    }
    const profile = result.json.profile || {};
    const summaryPlayerId = String(result.json.profileSummary && result.json.profileSummary.playerId || "");
    const bankCoins = Number(profile.bank && profile.bank.stoneCoins || 0);
    const stoneCoins = Number(profile.stoneCoins || 0);
    if (summaryPlayerId !== state.account.playerId) {
      pushFailure(this.failures, `${label} profile binding account=${state.index} expected=${state.account.playerId} actual=${summaryPlayerId}`);
      return false;
    }
    if (bankCoins !== state.expectedBankCoins || stoneCoins !== state.expectedStoneCoins) {
      pushFailure(this.failures, `${label} asset account=${state.index} expected=${state.expectedStoneCoins}/${state.expectedBankCoins} actual=${stoneCoins}/${bankCoins}`);
      return false;
    }
    return true;
  }

  verifyPartyResult(groupIndex, result, label) {
    const party = result.json && result.json.party;
    const expectedUsernames = Array.from({length: BATTLE_GROUP_SIZE}, (_, offset) => this.accountStates[groupIndex * BATTLE_GROUP_SIZE + offset].account.username).sort();
    const actualUsernames = Array.isArray(party && party.members)
      ? party.members.map((member) => String(member && member.username || "")).sort()
      : [];
    if (!result.ok || Number(party && party.memberCount || 0) !== BATTLE_GROUP_SIZE || JSON.stringify(actualUsernames) !== JSON.stringify(expectedUsernames)) {
      pushFailure(this.failures, `${label} party group=${groupIndex} members=${actualUsernames.length}/${BATTLE_GROUP_SIZE}`);
      return false;
    }
    return true;
  }

  verifyBattleResult(battle, result, label) {
    const room = result.json && result.json.room;
    const actors = Array.isArray(room && room.battle && room.battle.actors) ? room.battle.actors : [];
    const allyCount = actors.filter((actor) => actor && actor.side === "ally").length;
    const enemyCount = actors.filter((actor) => actor && actor.side === "enemy").length;
    if (!result.ok || String(room && room.roomId || "") !== battle.roomId || allyCount !== 10 || enemyCount !== 10) {
      pushFailure(this.failures, `${label} battle group=${battle.groupIndex} room=${String(room && room.roomId || "missing")} actors=${allyCount}v${enemyCount}`);
      return false;
    }
    return true;
  }

  recordRequest(category, result, elapsedMs) {
    this.latencies.record(category, result.elapsedMs, {
      elapsedMs,
      ok: result.ok,
      code: result.json && result.json.code || String(result.status),
    });
  }

  request(account, pathName, options = {}) {
    return fetchJsonMeasured(`${this.base}${pathName}`, {
      protocolVersion: PROTOCOL_VERSION,
      clientVersion: SERVER_VERSION,
      token: account && account.token,
      timeoutMs: HTTP_TIMEOUT_MS,
      ...options,
    });
  }

  launch(promise) {
    const tracked = Promise.resolve(promise).catch((error) => {
      pushFailure(this.failures, `background action failed: ${error && error.stack ? error.stack : error}`);
    }).finally(() => this.inFlight.delete(tracked));
    this.inFlight.add(tracked);
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight.size);
    return tracked;
  }

  async drainInflight() {
    while (this.inFlight.size > 0) {
      await Promise.allSettled([...this.inFlight]);
    }
  }

  async waitForServerDrain(timeoutMs = 60_000) {
    const startedAt = performance.now();
    while (performance.now() - startedAt < timeoutMs) {
      const metrics = await this.worker.rpc("metrics");
      if (capacityServerDrainReady(metrics)) {
        return metrics;
      }
      await delay(100);
    }
    throw new Error(`capacity server did not drain durable work within ${timeoutMs}ms`);
  }

  async cleanup() {
    if (this.cleanupDone) {
      return;
    }
    this.cleanupDone = true;
    this.running = false;
    this.sentinel.cancel();
    this.businessEventTracker.cancelAll();
    for (const client of this.clients) {
      if (client) {
        client.expectedClose = true;
        client.terminate();
      }
    }
    await this.drainInflight();
    await delay(100);
    this.driverLoopDelay.disable();
  }

  report() {
    const driverCpu = process.cpuUsage(this.driverCpuStarted);
    const driverElapsedMs = Math.max(1, performance.now() - this.driverStartedAt);
    const driverMemory = process.memoryUsage();
    if (this.metricSamples.length > 0 && this.lastMetricCollections) {
      this.metricTimelineCollectionSnapshots.set(
        this.metricSamples.length - 1,
        this.lastMetricCollections,
      );
    }
    const metricSampleJsonBytes = Buffer.byteLength(JSON.stringify(this.metricSamples));
    const metricDiagnosticJsonBytes = Buffer.byteLength(JSON.stringify({
      maxEventLoopDiagnostic: this.maxEventLoopDiagnostic,
      timelineCollections: Array.from(this.metricTimelineCollectionSnapshots.values()),
    }));
    const clientSummaries = [
      ...this.retiredClientSummaries,
      ...this.clients.filter(Boolean).map((client) => client.summary()),
    ];
    const initialMemory = this.initialMetrics && this.initialMetrics.memory || {};
    const finalMemory = this.finalMetrics && this.finalMetrics.memory || {};
    const sampledMemory = [
      initialMemory,
      ...this.metricSamples.map((row) => row.memory || {}),
      finalMemory,
    ];
    const sampledPeakExternal = Math.max(0, ...sampledMemory.map((row) => Number(row.external || 0)));
    const sampledPeakArrayBuffers = Math.max(0, ...sampledMemory.map((row) => Number(row.arrayBuffers || 0)));
    const finalRecordingStore = this.finalMetrics && this.finalMetrics.store && this.finalMetrics.store.recording || {};
    const assetCommitTiming = assetCommitTimingSummary(
      this.assetCommitObservations,
      finalRecordingStore.operationCommitCompletedAtUnixMs,
    );
    return {
      durationMs: round(Math.max(0, this.schedulerFinishedAt - this.scenarioStartedAt)),
      drainTailMs: round(Math.max(0, this.loadFinishedAt - this.schedulerFinishedAt)),
      totalElapsedMs: round(Math.max(0, this.scenarioFinishedAt - this.scenarioStartedAt)),
      initialConnectMs: round(this.initialConnectMs),
      initializedPositions: this.correctness.initializedPositions,
      initializedConnections: this.correctness.initializedConnections,
      reconciliationSource: this.reconciliationSource,
      trendWindows: {
        firstStartMs: this.firstTrendWindowStartMs,
        firstEndMs: this.firstTrendWindowStartMs + Math.min(5 * 60 * 1000, this.durationMs * 0.2),
        lastStartMs: this.durationMs - Math.min(5 * 60 * 1000, this.durationMs * 0.2),
        lastEndMs: this.durationMs,
      },
      maxInFlight: this.maxInFlight,
      latency: this.latencies.summary(),
      correctness: this.correctness,
      checkpointCoverage: this.checkpointCoverage,
      businessEvents: this.businessEventTracker.summary(this.durationMs),
      finalClients: this.finalClientState || finalClientSummary(this.clients, this.heldClients, this.pausedAccounts),
      coordination: this.coordination.summary(),
      websocket: {
        receivedFrames: sum(clientSummaries.map((row) => row.receivedFrames)),
        receivedBytes: sum(clientSummaries.map((row) => row.receivedBytes)),
        receivedBatchFrames: sum(clientSummaries.map((row) => row.receivedBatchFrames)),
        receivedBatchDeltas: sum(clientSummaries.map((row) => row.receivedBatchDeltas)),
        eventSeqRegressions: sum(clientSummaries.map((row) => row.eventSeqRegressions)),
        eventSeqDuplicates: sum(clientSummaries.map((row) => row.eventSeqDuplicates)),
        presenceRevisionRegressions: sum(clientSummaries.map((row) => row.presenceRevisionRegressions)),
        protocolErrors: sum(clientSummaries.map((row) => row.protocolErrors)),
        unexpectedCloseCount: sum(clientSummaries.map((row) => row.unexpectedCloseCount)),
        resetCount: sum(clientSummaries.map((row) => row.resetCount)),
      },
      scheduler: {
        samples: this.schedulerLag.length,
        expectedTicks: this.schedulerExpectedTicks,
        tickCount: this.schedulerTickCount,
        rebaseCount: this.schedulerRebaseCount,
        rebasedLagMs: round(this.schedulerRebasedLagMs),
        p95LagMs: percentile(this.schedulerLag, 0.95),
        p99LagMs: percentile(this.schedulerLag, 0.99),
        maxLagMs: round(this.schedulerMaxLagMs),
        maxLagAtElapsedMs: round(this.schedulerMaxLagAtElapsedMs),
      },
      driver: {
        cpuPercent: round(((driverCpu.user + driverCpu.system) / 1000) / driverElapsedMs * 100),
        heapGrowthMiB: round(bytesToMiB(driverMemory.heapUsed - this.driverMemoryStarted.heapUsed)),
        rssGrowthMiB: round(bytesToMiB(driverMemory.rss - this.driverMemoryStarted.rss)),
        externalGrowthMiB: round(bytesToMiB(driverMemory.external - this.driverMemoryStarted.external)),
        arrayBuffersGrowthMiB: round(bytesToMiB(driverMemory.arrayBuffers - this.driverMemoryStarted.arrayBuffers)),
        retainedMetricSampleCount: this.metricSamples.length,
        retainedMetricSampleJsonBytes: metricSampleJsonBytes,
        retainedMetricSampleAverageBytes: this.metricSamples.length > 0
          ? Math.round(metricSampleJsonBytes / this.metricSamples.length)
          : 0,
        retainedMetricDiagnosticJsonBytes: metricDiagnosticJsonBytes,
        eventLoopP95Ms: finiteDelayMs(this.driverLoopDelay.percentile(95)),
        eventLoopP99Ms: finiteDelayMs(this.driverLoopDelay.percentile(99)),
        eventLoopMaxMs: finiteDelayMs(this.driverLoopDelay.max),
      },
      memory: {
        fixtureHeapMiB: round(bytesToMiB(this.fixtureMetrics && this.fixtureMetrics.memory && this.fixtureMetrics.memory.heapUsed || 0)),
        steadyBaselineHeapMiB: round(bytesToMiB(initialMemory.heapUsed || 0)),
        finalHeapMiB: round(bytesToMiB(finalMemory.heapUsed || 0)),
        fixtureRssMiB: round(bytesToMiB(this.fixtureMetrics && this.fixtureMetrics.memory && this.fixtureMetrics.memory.rss || 0)),
        steadyBaselineRssMiB: round(bytesToMiB(initialMemory.rss || 0)),
        finalRssMiB: round(bytesToMiB(finalMemory.rss || 0)),
        steadyBaselineExternalMiB: round(bytesToMiB(initialMemory.external || 0)),
        steadyBaselineArrayBuffersMiB: round(bytesToMiB(initialMemory.arrayBuffers || 0)),
        finalExternalMiB: round(bytesToMiB(finalMemory.external || 0)),
        finalArrayBuffersMiB: round(bytesToMiB(finalMemory.arrayBuffers || 0)),
        sampledPeakExternalMiB: round(bytesToMiB(sampledPeakExternal)),
        sampledPeakArrayBuffersMiB: round(bytesToMiB(sampledPeakArrayBuffers)),
        sampledPeakExternalGrowthMiB: round(bytesToMiB(sampledPeakExternal - Number(initialMemory.external || 0))),
        sampledPeakArrayBuffersGrowthMiB: round(bytesToMiB(sampledPeakArrayBuffers - Number(initialMemory.arrayBuffers || 0))),
        arrayBuffersExceedsExternalSamples: sampledMemory.filter((row) => (
          Number(row.arrayBuffers || 0) > Number(row.external || 0)
        )).length,
        heapGrowthMiB: round(bytesToMiB(Number(finalMemory.heapUsed || 0) - Number(initialMemory.heapUsed || 0))),
        rssGrowthMiB: round(bytesToMiB(Number(finalMemory.rss || 0) - Number(initialMemory.rss || 0))),
        externalGrowthMiB: round(bytesToMiB(Number(finalMemory.external || 0) - Number(initialMemory.external || 0))),
        arrayBuffersGrowthMiB: round(bytesToMiB(Number(finalMemory.arrayBuffers || 0) - Number(initialMemory.arrayBuffers || 0))),
        peakRssGrowthMiB: round(bytesToMiB(Number(this.finalMetrics && this.finalMetrics.peakRss || 0) - Number(initialMemory.rss || 0))),
        heapSlopeMiBPerMinute: metricMinuteFloorSlope(
          this.metricSamples,
          (row) => Number(row.memory && row.memory.heapUsed || 0) / 1048576,
          this.durationMs >= FULL_DURATION_SECONDS * 1000 ? 10 * 60 * 1000 : null,
          this.durationMs,
        ),
        heapObservedSlopeMiBPerMinute: metricSlope(
          this.metricSamples,
          (row) => Number(row.memory && row.memory.heapUsed || 0) / 1048576,
          this.durationMs >= FULL_DURATION_SECONDS * 1000 ? 10 * 60 * 1000 : null,
        ),
        rssSlopeMiBPerMinute: metricSlope(
          this.metricSamples,
          (row) => Number(row.memory && row.memory.rss || 0) / 1048576,
          this.durationMs >= FULL_DURATION_SECONDS * 1000 ? 10 * 60 * 1000 : null,
        ),
        externalSlopeMiBPerMinute: metricSlope(
          this.metricSamples,
          (row) => Number(row.memory && row.memory.external || 0) / 1048576,
          this.durationMs >= FULL_DURATION_SECONDS * 1000 ? 10 * 60 * 1000 : null,
        ),
        arrayBuffersSlopeMiBPerMinute: metricSlope(
          this.metricSamples,
          (row) => Number(row.memory && row.memory.arrayBuffers || 0) / 1048576,
          this.durationMs >= FULL_DURATION_SECONDS * 1000 ? 10 * 60 * 1000 : null,
        ),
      },
      memorySampling: this.finalMetrics && this.finalMetrics.memorySampling
        || this.metricSamples.at(-1) && this.metricSamples.at(-1).memorySampling
        || null,
      fixture: this.fixtureMetrics && this.fixtureMetrics.fixture || null,
      historyEvidence: capacityHistoryEvidence(
        this.fixtureMetrics,
        this.finalMetrics,
        this.startedBattleRoomIds,
        this.closedBattleRoomIds,
      ),
      gc: capacityGcReport(this.metricSamples, this.finalMetrics),
      eventLoop: eventLoopSummary(this.metricSamples, this.maxEventLoopDiagnostic),
      durable: durableSummary(this.metricSamples, this.finalMetrics),
      eventStream: eventStreamSummary(this.metricSamples, this.finalMetrics),
      assetCommitTiming,
      health: healthSummary(this.metricSamples, this.finalHealth, this.finalMetrics),
      store: capacityStoreReport(this.finalMetrics && this.finalMetrics.store),
      cloneDiagnostics: this.finalMetrics && this.finalMetrics.cloneDiagnostics || null,
      heapDiagnostics: {
        initial: this.initialMetrics && this.initialMetrics.heapDiagnostics || null,
        final: this.finalMetrics && this.finalMetrics.heapDiagnostics || null,
      },
      retentionDiagnostics: {
        initial: this.initialMetrics && this.initialMetrics.retentionDiagnostics || null,
        final: this.finalMetrics && this.finalMetrics.retentionDiagnostics || null,
      },
      collections: collectionSummary(
        this.metricSamples,
        this.finalMetrics,
        this.initialMetrics,
        this.durationMs,
      ),
      storms: this.storms,
      attacks: this.attacks,
      metricSampleCount: this.metricSamples.length,
      lastMetricElapsedMs: round(Number(this.metricSamples.at(-1) && this.metricSamples.at(-1).elapsedMs || 0)),
      metricTimeline: compactMetricTimeline(
        this.metricSamples,
        this.metricTimelineCollectionSnapshots,
      ),
      metricHotspots: metricHotspots(this.metricSamples),
    };
  }
}

function capacityCompactMetricSample(sampleValue, elapsedMs, publicHealthValue) {
  const sample = metricObject(sampleValue);
  const publicHealthAvailable = Boolean(
    publicHealthValue
      && typeof publicHealthValue === "object"
      && !Array.isArray(publicHealthValue),
  );
  const publicHealth = metricObject(publicHealthValue);
  return {
    elapsedMs: round(Number(elapsedMs || 0)),
    cpuPercent: sample.cpuPercent,
    memory: shallowMetricObject(sample.memory),
    memorySampling: compactMetricNestedObject(sample.memorySampling),
    resourceUsage: shallowMetricObject(sample.resourceUsage),
    eventLoop: shallowMetricObject(sample.eventLoop),
    gc: compactGcMetricSample(sample.gc),
    durable: pickMetricFields(sample.durable, DURABLE_SAMPLE_FIELDS),
    eventStream: pickMetricFields(sample.eventStream, EVENT_STREAM_SAMPLE_FIELDS),
    transport: pickMetricFields(sample.transport, PUBLIC_HEALTH_TRANSPORT_SAMPLE_FIELDS),
    collections: pickMetricFields(sample.collections, COLLECTION_SAMPLE_FIELDS),
    publicHealth: publicHealthAvailable ? {
      storage: pickMetricFields(publicHealth.storage, ["ok"]),
      transport: pickMetricFields(publicHealth.transport, PUBLIC_HEALTH_TRANSPORT_SAMPLE_FIELDS),
      authWork: pickMetricFields(publicHealth.authWork, PUBLIC_HEALTH_AUTH_WORK_SAMPLE_FIELDS),
    } : null,
  };
}

function compactGcMetricSample(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const gc = metricObject(value);
  const total = metricObject(gc.total);
  return {
    available: gc.available,
    unavailableReason: gc.unavailableReason,
    observedElapsedMs: gc.observedElapsedMs,
    total: {
      ...pickMetricFields(total, ["count", "durationMs", "maxDurationMs", "maxAtElapsedMs"]),
      maxEvent: shallowMetricObject(total.maxEvent),
    },
  };
}

function metricObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function shallowMetricObject(value) {
  const source = metricObject(value);
  return Object.keys(source).length > 0 ? {...source} : null;
}

function compactMetricNestedObject(value) {
  const source = metricObject(value);
  const result = {};
  for (const [key, child] of Object.entries(source)) {
    if (child && typeof child === "object" && !Array.isArray(child)) {
      result[key] = {...child};
    } else if (child === null || ["string", "number", "boolean"].includes(typeof child)) {
      result[key] = child;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

function pickMetricFields(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const source = metricObject(value);
  const result = {};
  for (const field of fields) {
    if (Object.hasOwn(source, field)) {
      const entry = source[field];
      if (entry === null || ["string", "number", "boolean"].includes(typeof entry)) {
        result[field] = entry;
      }
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

function capacityServerDrainReady(metricsValue) {
  const metrics = metricsValue && typeof metricsValue === "object" ? metricsValue : {};
  const durable = metrics.durable || {};
  const recording = metrics.store && metrics.store.recording || {};
  const eventStream = metrics.eventStream || {};
  return Number(durable.pending || 0) === 0
    && Number(recording.activeTransactions || 0) === 0
    && Number(eventStream.queuedFrames || 0) === 0
    && Number(eventStream.queuedBytes || 0) === 0
    && Number(eventStream.pendingPositionBatchClients || 0) === 0
    && Number(eventStream.pendingPositionBatchDeltas || 0) === 0
    && Number(eventStream.currentPositionBatchBytes || 0) === 0
    && Number(eventStream.pendingUpgrades || 0) === 0;
}

class PresenceSentinel {
  constructor(onFailure) {
    this.onFailure = onFailure;
    this.active = null;
  }

  begin(accountId, expectedClients, startedAt, timeoutMs) {
    let resolvePromise;
    let rejectPromise;
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const timer = setTimeout(() => {
      if (!this.active) {
        return;
      }
      const missing = [...this.active.expected].filter((index) => !this.active.seen.has(index));
      this.active = null;
      rejectPromise(new Error(`presence sentinel ${accountId} missing ${missing.length} client(s)`));
    }, timeoutMs);
    this.active = {
      accountId,
      expected: expectedClients,
      seen: new Set(),
      startedAt,
      firstAt: Number.POSITIVE_INFINITY,
      lastAt: 0,
      resolve: resolvePromise,
      reject: rejectPromise,
      timer,
    };
    return promise;
  }

  record(clientIndex, event, _bytes, receivedAt) {
    if (!this.active || !event || event.type !== "online.position" || String(event.accountId || "") !== this.active.accountId) {
      return;
    }
    if (!this.active.expected.has(clientIndex) || this.active.seen.has(clientIndex)) {
      return;
    }
    this.active.seen.add(clientIndex);
    this.active.firstAt = Math.min(this.active.firstAt, receivedAt);
    this.active.lastAt = Math.max(this.active.lastAt, receivedAt);
    if (this.active.seen.size === this.active.expected.size) {
      const result = this.active;
      clearTimeout(result.timer);
      this.active = null;
      result.resolve(result);
    }
  }

  cancel() {
    if (!this.active) {
      return;
    }
    clearTimeout(this.active.timer);
    this.active.resolve({...this.active, cancelled: true});
    this.active = null;
  }
}

class BusinessEventTracker {
  constructor(onFailure) {
    this.onFailure = onFailure;
    this.active = new Map();
    this.rows = [];
    this.nextId = 1;
  }

  expect(options = {}) {
    const id = `business_event_${this.nextId++}`;
    const expected = new Set(options.expectedClients || []);
    let resolvePromise;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    const entry = {
      id,
      domain: String(options.domain || "unknown"),
      channel: String(options.channel || ""),
      probeId: String(options.probeId || ""),
      elapsedMs: Math.max(0, Number(options.elapsedMs || 0)),
      expected,
      minimumExpectedTargets: Math.max(0, Number(options.minimumExpectedTargets || 0)),
      seen: new Set(),
      unexpectedClients: new Set(),
      duplicates: 0,
      firstAt: Number.POSITIVE_INFINITY,
      lastAt: 0,
      startedAt: performance.now(),
      predicate: typeof options.predicate === "function" ? options.predicate : () => false,
      resolve: resolvePromise,
      timer: null,
      settleTimer: null,
    };
    this.active.set(id, entry);
    entry.timer = setTimeout(() => this.finish(entry, true, false), 5000);
    if (expected.size === 0) {
      queueMicrotask(() => this.finish(entry, true, false));
    }
    return promise;
  }

  record(clientIndex, event, _bytes, receivedAt) {
    for (const entry of this.active.values()) {
      let matches = false;
      try {
        matches = entry.predicate(event) === true;
      } catch {
        matches = false;
      }
      if (!matches) {
        continue;
      }
      if (!entry.expected.has(clientIndex)) {
        entry.unexpectedClients.add(clientIndex);
        continue;
      }
      if (entry.seen.has(clientIndex)) {
        entry.duplicates += 1;
      } else {
        entry.seen.add(clientIndex);
        entry.firstAt = Math.min(entry.firstAt, receivedAt);
        entry.lastAt = Math.max(entry.lastAt, receivedAt);
      }
      if (entry.seen.size === entry.expected.size && entry.settleTimer === null) {
        entry.settleTimer = setTimeout(() => this.finish(entry, false, false), 50);
      }
    }
  }

  finish(entry, timedOut, cancelled) {
    if (!entry || !this.active.has(entry.id)) {
      return;
    }
    this.active.delete(entry.id);
    clearTimeout(entry.timer);
    clearTimeout(entry.settleTimer);
    const missing = Math.max(0, entry.expected.size - entry.seen.size);
    const row = {
      domain: entry.domain,
      channel: entry.channel,
      probeId: entry.probeId,
      elapsedMs: round(entry.elapsedMs),
      expectedTargets: entry.expected.size,
      minimumExpectedTargets: entry.minimumExpectedTargets,
      receivedTargets: entry.seen.size,
      missing,
      unexpected: entry.unexpectedClients.size,
      duplicates: entry.duplicates,
      timeouts: timedOut ? 1 : 0,
      cancelled: cancelled ? 1 : 0,
      lastTargetLatencyMs: entry.lastAt > 0 ? round(entry.lastAt - entry.startedAt) : null,
    };
    this.rows.push(row);
    if (missing > 0 || entry.unexpectedClients.size > 0 || entry.duplicates > 0 || timedOut || cancelled) {
      this.onFailure(`business WS ${entry.domain}/${entry.channel} ${entry.probeId} missing=${missing} unexpected=${entry.unexpectedClients.size} duplicate=${entry.duplicates} timeout=${timedOut ? 1 : 0} cancelled=${cancelled ? 1 : 0}`);
    }
    entry.resolve(row);
  }

  cancelAll() {
    for (const entry of [...this.active.values()]) {
      this.finish(entry, false, true);
    }
  }

  summary(durationMs) {
    return businessEventSummaryFromRows(this.rows, durationMs, this.active.size);
  }
}

class ServerWorker {
  static async start(options = {}) {
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-p06c-capacity-"));
    let child;
    try {
      child = fork(FILE, [String(options.workerArgument || "--server-worker")], {
        cwd: ROOT,
        env: capacityWorkerEnvironment(fixtureDir),
        execArgv: ["--expose-gc"],
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      });
    } catch (error) {
      fs.rmSync(fixtureDir, {recursive: true, force: true});
      throw error;
    }
    const worker = new ServerWorker(child, fixtureDir);
    registerActiveCapacityWorker(worker);
    try {
      await worker.ready();
      return worker;
    } catch (error) {
      await worker.stop(false);
      if (error && typeof error === "object") {
        error.capacityCleanupEvidence = worker.cleanupEvidence();
      }
      throw error;
    }
  }

  constructor(child, fixtureDir) {
    this.child = child;
    this.fixtureDir = fixtureDir;
    this.originalFixtureDir = fixtureDir;
    this.workerPid = Number(child.pid || 0);
    this.port = 0;
    this.accounts = [];
    this.nextId = 1;
    this.pending = new Map();
    this.stdoutTail = "";
    this.stderrTail = "";
    this.readySettled = false;
    this.stopPromise = null;
    this.cleanupState = {
      workerStarted: true,
      workerPid: this.workerPid,
      childExited: false,
      portClosed: null,
      fixtureRemoved: false,
    };
    this.readyPromise = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    child.stdout.on("data", (chunk) => {
      this.stdoutTail = boundedTail(this.stdoutTail + chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk) => {
      this.stderrTail = boundedTail(this.stderrTail + chunk.toString("utf8"));
    });
    child.on("message", (message) => this.onMessage(message));
    child.on("error", (error) => this.failAll(error));
    child.on("exit", (code, signal) => {
      this.cleanupState.childExited = true;
      if (!this.readySettled || this.pending.size > 0) {
        this.failAll(new Error(`capacity worker exited code=${code} signal=${signal}\n${this.stderrTail}`));
      }
    });
  }

  ready() {
    return withTimeout(this.readyPromise, 120000, "capacity server worker ready timeout");
  }

  onMessage(message) {
    if (!message || typeof message !== "object") {
      return;
    }
    if (message.type === "ready") {
      this.readySettled = true;
      this.port = Number(message.port || 0);
      this.cleanupState.portClosed = this.port > 0 ? false : null;
      this.accounts = Array.isArray(message.accounts) ? message.accounts : [];
      this.resolveReady(this);
      return;
    }
    if (message.type === "fatal") {
      this.failAll(new Error(String(message.error || "capacity worker fatal")));
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
      pending.reject(new Error(String(message.error || "capacity worker request failed")));
    }
  }

  rpc(command, payload = {}) {
    if (!this.child.connected || !childIsRunning(this.child)) {
      return Promise.reject(new Error("capacity worker IPC is closed"));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`capacity worker ${command} timeout`));
      }, 30000);
      this.pending.set(id, {resolve, reject, timer});
      this.child.send({id, command, payload});
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
    if (!this.stopPromise) {
      this.stopPromise = this.stopInternal(graceful);
    }
    return this.stopPromise;
  }

  async stopInternal(graceful = true) {
    let cleanupError = null;
    try {
      if (this.child && childIsRunning(this.child)) {
        if (graceful && this.readySettled) {
          await this.rpc("shutdown").catch(() => undefined);
        }
        if (childIsRunning(this.child)) {
          await Promise.race([new Promise((resolve) => this.child.once("exit", resolve)), delay(1000)]);
        }
        if (childIsRunning(this.child)) {
          this.child.kill("SIGTERM");
          await Promise.race([new Promise((resolve) => this.child.once("exit", resolve)), delay(1000)]);
        }
        if (childIsRunning(this.child)) {
          this.child.kill("SIGKILL");
          await Promise.race([new Promise((resolve) => this.child.once("exit", resolve)), delay(1000)]);
        }
        if (childIsRunning(this.child)) {
          throw new Error(`capacity worker ${this.child.pid} did not exit`);
        }
      }
    } catch (error) {
      cleanupError = error;
    } finally {
      try {
        removeCapacityFixtureDirectory(this.fixtureDir);
      } catch (error) {
        cleanupError ||= error;
      }
      this.fixtureDir = "";
      this.cleanupState.childExited = !childIsRunning(this.child);
      this.cleanupState.fixtureRemoved = !fs.existsSync(this.originalFixtureDir);
      this.cleanupState.portClosed = this.port > 0
        ? await waitForTcpPortClosed(this.port, 3000)
        : null;
      clearActiveCapacityWorker(this);
    }
    if (cleanupError) {
      throw cleanupError;
    }
  }

  emergencyStop() {
    try {
      if (childIsRunning(this.child)) {
        this.child.kill("SIGKILL");
      }
    } catch {
      // The worker disconnect handler is the independent second cleanup path.
    }
    try {
      removeCapacityFixtureDirectory(this.fixtureDir || this.originalFixtureDir);
    } catch {
      // Process exit cannot recover from a filesystem cleanup failure.
    }
    this.fixtureDir = "";
    this.cleanupState.childExited = !childIsRunning(this.child);
    this.cleanupState.fixtureRemoved = !fs.existsSync(this.originalFixtureDir);
    clearActiveCapacityWorker(this);
  }

  cleanupEvidence() {
    return {
      ...this.cleanupState,
      childExited: !childIsRunning(this.child),
      fixtureRemoved: !fs.existsSync(this.originalFixtureDir),
    };
  }
}

function capacityWorkerEnvironment(fixtureDir) {
  const environment = isolatedCapacityEnvironment();
  environment.BEASTBOUND_CAPACITY_FIXTURE_DIR = fixtureDir;
  return environment;
}

function isolatedCapacityEnvironment() {
  const environment = {...process.env};
  for (const name of Object.keys(environment)) {
    if (name.startsWith("BEASTBOUND_MYSQL_")) {
      delete environment[name];
    }
  }
  delete environment.BEASTBOUND_CAPACITY_FIXTURE_DIR;
  return environment;
}

async function runLifecycleProbeWorker() {
  const fixtureDir = capacityFixtureDirectory(process.env.BEASTBOUND_CAPACITY_FIXTURE_DIR);
  let fixtureCleaned = false;
  const cleanupFixture = () => {
    if (!fixtureCleaned) {
      fixtureCleaned = true;
      removeCapacityFixtureDirectory(fixtureDir);
    }
  };
  fs.writeFileSync(path.join(fixtureDir, "lifecycle-probe"), String(process.pid), {mode: 0o600});
  const server = net.createServer((socket) => socket.end());
  const termination = createWorkerTerminationBoundary({
    cleanup: cleanupFixture,
    drain: () => server.listening
      ? new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
      : undefined,
    onError(error) {
      process.stderr.write(`capacity lifecycle probe cleanup failed: ${error.message}\n`);
    },
  });
  process.on("message", (message) => {
    if (message && message.id && message.command === "shutdown") {
      void termination.requestStop("parent_rpc", {
        acknowledge: () => process.send?.({id: message.id, ok: true, result: {closed: true}}),
      });
    }
  });
  server.listen(0, "127.0.0.1", () => {
    process.send?.({type: "ready", port: server.address().port, accounts: []});
  });
}

async function runLifecycleProbeParent() {
  installParentCapacityLifecycle();
  const worker = await ServerWorker.start({workerArgument: "--lifecycle-probe-worker"});
  process.send?.({
    type: "lifecycle-probe-ready",
    workerPid: worker.workerPid,
    fixtureDir: worker.originalFixtureDir,
    port: worker.port,
  });
  await new Promise(() => {});
}

async function runParentOnlyCleanupSelfTest(signal) {
  let parent = null;
  let state = null;
  let stderrTail = "";
  try {
    parent = fork(FILE, ["--lifecycle-probe-parent"], {
      cwd: ROOT,
      env: isolatedCapacityEnvironment(),
      execArgv: [],
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    parent.stderr.on("data", (chunk) => {
      stderrTail = boundedTail(stderrTail + chunk.toString("utf8"));
    });
    state = await withTimeout(new Promise((resolve, reject) => {
      parent.on("message", (message) => {
        if (message && message.type === "lifecycle-probe-ready") {
          resolve(message);
        }
      });
      parent.once("error", reject);
      parent.once("exit", (code, exitSignal) => reject(new Error(
        `lifecycle probe parent exited before ready code=${code} signal=${exitSignal} ${stderrTail}`,
      )));
    }), CLEANUP_PROBE_TIMEOUT_MS, `lifecycle probe ${signal} ready timeout`);
    assert.equal(await tcpPortAcceptingConnections(state.port), true, `${signal} probe port must be open before parent termination`);
    assert.equal(fs.existsSync(state.fixtureDir), true, `${signal} probe fixture must exist before parent termination`);
    parent.kill(signal);
    const cleaned = await waitForCondition(() => (
      !pidIsRunning(state.workerPid)
      && !fs.existsSync(state.fixtureDir)
    ), CLEANUP_PROBE_TIMEOUT_MS);
    assert.equal(cleaned, true, `${signal} parent-only termination stranded child=${state.workerPid} fixture=${state.fixtureDir}`);
    assert.equal(await waitForTcpPortClosed(state.port, 2000), true, `${signal} parent-only termination stranded port=${state.port}`);
  } finally {
    if (parent && childIsRunning(parent)) {
      parent.kill("SIGKILL");
    }
    if (state && pidIsRunning(state.workerPid)) {
      try {
        process.kill(state.workerPid, "SIGKILL");
      } catch {
        // Already exited.
      }
    }
    if (state && state.fixtureDir) {
      removeCapacityFixtureDirectory(state.fixtureDir);
    }
  }
}

function pidIsRunning(pidValue) {
  const pid = Number(pidValue || 0);
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === "EPERM";
  }
}

async function waitForCondition(predicate, timeoutMs, intervalMs = 25) {
  const deadline = performance.now() + Math.max(1, Number(timeoutMs || 0));
  while (performance.now() < deadline) {
    if (await predicate()) {
      return true;
    }
    await delay(intervalMs);
  }
  return Boolean(await predicate());
}

function tcpPortAcceptingConnections(portValue, timeoutMs = 250) {
  const port = Number(portValue || 0);
  if (!Number.isInteger(port) || port <= 0) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const socket = net.createConnection({host: "127.0.0.1", port});
    let settled = false;
    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function waitForTcpPortClosed(port, timeoutMs) {
  return waitForCondition(async () => !(await tcpPortAcceptingConnections(port)), timeoutMs);
}

function childIsRunning(child) {
  return Boolean(child && child.exitCode === null && child.signalCode === null);
}

function capacityFixtureDirectory(value = "") {
  const temporaryRoot = path.resolve(os.tmpdir());
  const resolved = path.resolve(String(value || ""));
  if (
    resolved === temporaryRoot
    || path.dirname(resolved) !== temporaryRoot
    || !path.basename(resolved).startsWith("beastbound-p06c-capacity-")
  ) {
    throw new Error("capacity fixture directory is outside the isolated temporary root");
  }
  return resolved;
}

function removeCapacityFixtureDirectory(value) {
  if (!value) {
    return;
  }
  fs.rmSync(capacityFixtureDirectory(value), {recursive: true, force: true});
}

function createWorkerTerminationBoundary(options) {
  let stopPromise = null;
  const requestStop = (reason, requestOptions = {}) => {
    if (stopPromise) {
      return stopPromise;
    }
    let exitCode = Number(requestOptions.exitCode || 0);
    const forceTimer = setTimeout(() => {
      try {
        options.cleanup();
      } finally {
        process.exit(1);
      }
    }, WORKER_EMERGENCY_EXIT_MS);
    stopPromise = Promise.resolve()
      .then(() => options.drain(reason))
      .then(() => requestOptions.acknowledge?.())
      .catch((error) => {
        exitCode = 1;
        options.onError?.(error, reason);
      })
      .finally(() => {
        clearTimeout(forceTimer);
        try {
          options.cleanup();
        } catch (error) {
          exitCode = 1;
          options.onError?.(error, `${reason}_fixture_cleanup`);
        }
        setImmediate(() => process.exit(exitCode));
      });
    return stopPromise;
  };
  process.once("disconnect", () => void requestStop("parent_disconnect"));
  process.once("SIGINT", () => void requestStop("SIGINT", {exitCode: 130}));
  process.once("SIGTERM", () => void requestStop("SIGTERM", {exitCode: 143}));
  process.once("exit", options.cleanup);
  return {requestStop};
}

async function runServerWorker() {
  const {
    createAsyncWriteAuthStore,
    createAuthService,
  } = require("../server/node/src/auth-service");
  const {createMysqlAuthStore} = require("../server/node/src/mysql-store");
  const {createHttpServer, drainServerForShutdown} = require("../server/node/src/http-server");

  const fixtureDir = process.env.BEASTBOUND_CAPACITY_FIXTURE_DIR
    ? capacityFixtureDirectory(process.env.BEASTBOUND_CAPACITY_FIXTURE_DIR)
    : fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-p06c-capacity-"));
  let fixtureCleaned = false;
  const cleanupFixture = () => {
    if (fixtureCleaned) {
      return;
    }
    fixtureCleaned = true;
    removeCapacityFixtureDirectory(fixtureDir);
  };
  const send = (message) => {
    if (typeof process.send === "function" && process.connected) {
      process.send(message);
    }
  };
  let store = null;
  let server = null;
  let loopDelay = null;
  let rssTimer = null;
  const gcObservation = createWorkerGcObservation();
  const termination = createWorkerTerminationBoundary({
    cleanup: cleanupFixture,
    async drain() {
      if (rssTimer) {
        clearInterval(rssTimer);
      }
      gcObservation.disconnect();
      loopDelay?.disable();
      if (server && server.listening) {
        await drainServerForShutdown(server, store);
      }
      if (store && typeof store.close === "function") {
        await store.close();
      }
    },
    onError(error, reason) {
      send({type: "fatal", error: `capacity worker ${reason} cleanup failed: ${error.message}`});
    },
  });
  let fatalTriggered = false;
  const fatal = (error) => {
    if (fatalTriggered) {
      return;
    }
    fatalTriggered = true;
    send({type: "fatal", error: error && error.stack ? error.stack : String(error)});
    try {
      cleanupFixture();
    } catch {
      // The parent still terminates the worker if emergency cleanup fails.
    }
    setImmediate(() => process.exit(1));
  };
  // Install cleanup before fixture loading or product server construction so
  // startup contract drift cannot strand the fake CLI directory.
  process.on("uncaughtException", fatal);
  process.on("unhandledRejection", fatal);
  const fakeMysqlPath = path.join(fixtureDir, "fake-mysql.js");
  fs.writeFileSync(fakeMysqlPath, fakeMysqlProgram(), {mode: 0o755});
  const recording = createRecordingPoolMetrics();
  const pool = createRecordingPool(recording);
  const mysqlStore = createMysqlAuthStore({
    mysqlPath: fakeMysqlPath,
    host: "127.0.0.1",
    port: 1,
    user: "capacity-isolated",
    password: "not-a-real-password",
    database: "beastbound_capacity_isolated",
    createDatabase: false,
    outputMaxBufferBytes: DEFAULT_MYSQL_CLI_OUTPUT_MAX_BUFFER_BYTES,
    usePool: true,
    poolFactory: () => pool,
  });
  const observedStore = {
    mode: "isolated-recording-mysql-planner",
    load: () => mysqlStore.load(),
    checkHealth: () => ({ok: true, isolated: true}),
    async saveAsync(value) {
      const startedAt = performance.now();
      try {
        return await mysqlStore.saveAsync(value);
      } finally {
        recordRecordingMetric(recording, "saveLatencyMs", performance.now() - startedAt, startedAt);
      }
    },
    async saveAsyncOwned(value) {
      const startedAt = performance.now();
      try {
        return await mysqlStore.saveAsyncOwned(value);
      } finally {
        recordRecordingMetric(recording, "saveLatencyMs", performance.now() - startedAt, startedAt);
      }
    },
    // The async store wrapper polls this on every capacity metric sample.
    // Keep the recurring path O(1): the full percentile distributions are
    // derived once from the retained diagnostic rows after the load drains.
    metrics: () => recordingPoolSummary(recording),
    close: () => mysqlStore.close(),
  };
  store = createAsyncWriteAuthStore(observedStore, {onError() {}});
  let idCounter = 0;
  const service = createAuthService({
    store,
    allowPositionTeleport: false,
    allowInitialPositionSeedForTests: true,
    randomId: () => `capacity_${String(++idCounter).padStart(12, "0")}`,
    petEncounterAuthority: fixtureEncounterAuthority(),
    petEncounterPermitAuthority: fixtureEncounterPermitAuthority(),
    manualEncounterAccess: fixtureManualEncounterAccess(),
  });
  const accounts = fixtureAccounts();
  const warm = service.getEventSession(accounts[0].token);
  if (!warm.ok) {
    throw new Error(`capacity fixture warmup failed: ${warm.code}`);
  }
  const fixtureMetadata = readCapacityFixtureMetadata(
    fixtureDir,
    DEFAULT_MYSQL_CLI_OUTPUT_MAX_BUFFER_BYTES,
  );
  server = createHttpServer(capacityHttpServerOptions({service, store}));
  loopDelay = monitorEventLoopDelay({resolution: 10});
  loopDelay.enable();
  let eventLoopWindowStartedAt = performance.now();
  const rss100msSampling = createBoundedDurationDiagnostic();
  const fullMemoryUsageSampling = createBoundedDurationDiagnostic();
  let peakRss = process.memoryUsage.rss();
  let lastCpuUsage = process.cpuUsage();
  let lastCpuAt = performance.now();
  let lastEventLoopUtilization = performance.eventLoopUtilization();
  rssTimer = setInterval(() => {
    const startedAt = performance.now();
    const rss = process.memoryUsage.rss();
    const finishedAt = performance.now();
    rss100msSampling.record(
      finishedAt - startedAt,
      recording.scenarioStartedAt > 0 ? startedAt - recording.scenarioStartedAt : null,
    );
    peakRss = Math.max(peakRss, rss);
  }, 100);
  rssTimer.unref();

  server.listen(0, "127.0.0.1", () => {
    send({type: "ready", port: server.address().port, accounts});
  });

  process.on("message", async (message) => {
    if (!message || typeof message !== "object" || !message.id) {
      return;
    }
    const {id, command, payload = {}} = message;
    try {
      if (command === "markScenarioStart") {
        await gcObservation.flush();
        recording.scenarioStartedAt = performance.now();
        rss100msSampling.reset();
        fullMemoryUsageSampling.reset();
        gcObservation.reset(recording.scenarioStartedAt);
        loopDelay.reset();
        eventLoopWindowStartedAt = recording.scenarioStartedAt;
        recording.scenarioDurationMs = Math.max(1, Number(payload.durationMs || 1));
        recording.scenarioTransactionBaseline = recording.transactionCount;
        recording.distributions = createRecordingDistributions();
        recording.operationCommitCompletedAtUnixMs.clear();
        send({id, ok: true, result: {marked: true}});
        return;
      }
      if (command === "authoritySnapshot") {
        send({id, ok: true, result: capacityAuthoritySnapshot(service, accounts, recording, payload.assertNoSideEffects === true)});
        return;
      }
      if (command === "metrics") {
        // monitorEventLoopDelay records on its own timer. An IPC metrics
        // callback can otherwise run immediately after a long synchronous
        // callback and reset the histogram before that timer observes the
        // delay. Cross one probe interval before reading/resetting so a quick
        // or full report cannot gain a false green window at the sample edge.
        await delay(EVENT_LOOP_SAMPLE_SETTLE_MS);
        // Drain observer delivery before the snapshot. Explicit global.gc()
        // below exists only to stabilize retained-memory measurements and is
        // deliberately excluded from the workload's GC evidence.
        await gcObservation.flush();
        const gc = gcObservation.snapshot({
          includePerSecond: payload.includeGcTimeline === true,
        });
        if (payload.gc && typeof global.gc === "function") {
          global.gc();
        }
        const nowAt = performance.now();
        const cpuUsage = process.cpuUsage(lastCpuUsage);
        const cpuWallMs = Math.max(1, nowAt - lastCpuAt);
        lastCpuUsage = process.cpuUsage();
        lastCpuAt = nowAt;
        const eventLoopUtilization = performance.eventLoopUtilization(lastEventLoopUtilization);
        lastEventLoopUtilization = performance.eventLoopUtilization();
        const eventLoop = {
          minMs: finiteDelayMs(loopDelay.min),
          maxMs: finiteDelayMs(loopDelay.max),
          meanMs: finiteDelayMs(loopDelay.mean),
          p50Ms: finiteDelayMs(loopDelay.percentile(50)),
          p95Ms: finiteDelayMs(loopDelay.percentile(95)),
          p99Ms: finiteDelayMs(loopDelay.percentile(99)),
          utilization: round(eventLoopUtilization.utilization, 6),
          windowStartedAtElapsedMs: recording.scenarioStartedAt > 0
            ? round(Math.max(0, eventLoopWindowStartedAt - recording.scenarioStartedAt))
            : null,
          windowEndedAtElapsedMs: recording.scenarioStartedAt > 0
            ? round(Math.max(0, nowAt - recording.scenarioStartedAt))
            : null,
          windowDurationMs: round(Math.max(0, nowAt - eventLoopWindowStartedAt)),
        };
        loopDelay.reset();
        eventLoopWindowStartedAt = performance.now();
        const memoryUsageStartedAt = performance.now();
        const memory = process.memoryUsage();
        const memoryUsageFinishedAt = performance.now();
        fullMemoryUsageSampling.record(
          memoryUsageFinishedAt - memoryUsageStartedAt,
          recording.scenarioStartedAt > 0 ? memoryUsageStartedAt - recording.scenarioStartedAt : null,
        );
        if (payload.resetPeakRss) {
          peakRss = memory.rss;
        } else {
          peakRss = Math.max(peakRss, memory.rss);
        }
        const result = {
          memory,
          // Capture V8 spaces immediately after the optional forced GC and
          // process.memoryUsage(). Final-only JSON footprint diagnostics below
          // intentionally allocate large temporary strings.
          heapDiagnostics: payload.includeHeapDiagnostics === true
            ? capacityHeapDiagnostics()
            : null,
          peakRss,
          memorySampling: capacityMemorySamplingDiagnostics(
            rss100msSampling,
            fullMemoryUsageSampling,
          ),
          gc,
          cpuPercent: round(((cpuUsage.user + cpuUsage.system) / 1000) / cpuWallMs * 100),
          resourceUsage: process.resourceUsage(),
          eventLoop,
          durable: service.durableMutationMetrics(),
          eventStream: server.eventHub && typeof server.eventHub.metrics === "function" ? server.eventHub.metrics() : null,
          transport: server.networkAdmission && typeof server.networkAdmission.metrics === "function"
            ? server.networkAdmission.metrics()
            : null,
          collections: capacityCollectionMetrics(service),
          fixture: fixtureMetadata,
          cloneDiagnostics: payload.includeCloneDiagnostics === true
            && typeof service._capacityCloneDiagnostics === "function"
            ? service._capacityCloneDiagnostics()
            : null,
          retentionDiagnostics: payload.includeRetentionDiagnostics === true
            && typeof service._capacityRetentionDiagnostics === "function"
            ? service._capacityRetentionDiagnostics()
            : null,
          store: {
            wrapper: typeof store.metrics === "function" ? store.metrics() : null,
            recording: payload.includeOperationCommitTimes === true
              ? recordingPoolMetrics(recording, {includeOperationCommitTimes: true})
              : recordingPoolSummary(recording),
          },
          connections: await serverConnectionCount(server),
        };
        send({id, ok: true, result});
        return;
      }
      if (command === "shutdown") {
        await termination.requestStop("parent_rpc", {
          acknowledge: () => send({id, ok: true, result: {closed: true}}),
        });
        return;
      }
      throw new Error(`unknown capacity worker command: ${command}`);
    } catch (error) {
      send({id, ok: false, error: error && error.stack ? error.stack : String(error)});
    }
  });
}

function capacityHeapDiagnostics() {
  const heap = getHeapStatistics();
  const code = getHeapCodeStatistics();
  return Object.freeze({
    heap: Object.freeze(Object.fromEntries(Object.entries(heap)
      .filter(([, value]) => Number.isFinite(Number(value)))
      .map(([key, value]) => [key, Number(value)]))),
    code: Object.freeze(Object.fromEntries(Object.entries(code)
      .filter(([, value]) => Number.isFinite(Number(value)))
      .map(([key, value]) => [key, Number(value)]))),
    spaces: Object.freeze(Object.fromEntries(getHeapSpaceStatistics().map((space) => [
      String(space.space_name || "unknown"),
      Object.freeze({
        size: Number(space.space_size || 0),
        used: Number(space.space_used_size || 0),
        available: Number(space.space_available_size || 0),
        physical: Number(space.physical_space_size || 0),
      }),
    ]))),
  });
}

// All product-facing option names live here so transport work can adjust one
// adapter without rewriting the load generator. Unknown keys are deliberately
// omitted until the product server exposes its final P0.6c configuration API.
function capacityHttpServerOptions({service, store}) {
  return {
    service,
    store,
    logger: false,
    trustedProxies: [],
    networkAdmissionOptions: {
      // A smaller fixture-only bucket proves that twelve distinct accounts
      // cannot evade the peer-IP limiter with twelve forged XFF values without
      // spending 300 async scrypt operations per attack burst.
      authIpCapacity: 10,
      authIpWindowMs: 60_000,
    },
    eventHubOptions: {
      // All 200 isolated clients share 127.0.0.1. Raise only this fixture's
      // per-IP limits; production remains at its defensive 64/120 defaults.
      maxConnectionsPerIp: 256,
      upgradeIpCapacity: 320,
      upgradeIpWindowMs: 60_000,
    },
  };
}

function capacityCollectionMetrics(service) {
  for (const methodName of ["capacityMetrics", "runtimeCapacityMetrics", "authorityCardinalityMetrics"]) {
    if (service && typeof service[methodName] === "function") {
      const value = service[methodName]();
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return {available: true, ...value};
      }
    }
  }
  return {available: false};
}

function createBoundedDurationDiagnostic() {
  let count = 0;
  let maxDurationMs = 0;
  let maxAtElapsedMs = null;
  return Object.freeze({
    record(durationValue, atElapsedValue = null) {
      const numericDuration = Number(durationValue);
      if (!Number.isFinite(numericDuration) || numericDuration < 0) {
        return false;
      }
      const durationMs = numericDuration;
      count += 1;
      if (count === 1 || durationMs > maxDurationMs) {
        maxDurationMs = durationMs;
        maxAtElapsedMs = Number.isFinite(Number(atElapsedValue))
          ? Math.max(0, Number(atElapsedValue))
          : null;
      }
      return true;
    },
    reset() {
      count = 0;
      maxDurationMs = 0;
      maxAtElapsedMs = null;
    },
    snapshot() {
      return Object.freeze({
        count,
        maxDurationMs: round(maxDurationMs),
        maxAtElapsedMs: maxAtElapsedMs === null ? null : round(maxAtElapsedMs),
      });
    },
  });
}

function capacityMemorySamplingDiagnostics(rss100msSampling, fullMemoryUsageSampling) {
  return Object.freeze({
    rss100ms: Object.freeze({
      api: "process.memoryUsage.rss()",
      intervalMs: 100,
      ...rss100msSampling.snapshot(),
    }),
    fullMemoryUsage: Object.freeze({
      api: "process.memoryUsage()",
      intervalMs: METRIC_SAMPLE_MS,
      ...fullMemoryUsageSampling.snapshot(),
    }),
  });
}

function capacityAuthoritySnapshot(service, accounts, recording, assertNoSideEffects = false) {
  if (!service || typeof service._capacityReconciliationView !== "function") {
    throw new Error("capacity authority reconciliation view is unavailable");
  }
  const durableBefore = assertNoSideEffects ? service.durableMutationMetrics() : null;
  const transactionBefore = assertNoSideEffects ? Number(recording && recording.transactionCount || 0) : null;
  const data = service._capacityReconciliationView(accounts.map((account) => account.accountId));
  const durableAfter = assertNoSideEffects ? service.durableMutationMetrics() : null;
  const accountUsernameById = new Map(accounts.map((account) => [account.accountId, account.username]));
  const profiles = data.profiles && typeof data.profiles === "object" ? data.profiles : {};
  const parties = data.parties && typeof data.parties === "object" ? data.parties : {};
  const battleRooms = data.battleRooms && typeof data.battleRooms === "object" ? data.battleRooms : {};
  return {
    reconciliationSource: RECONCILIATION_SOURCE,
    profiles: Object.fromEntries(accounts.map((account) => {
      const profile = profiles[account.accountId] || {};
      return [account.accountId, {
        playerId: String(profile.playerId || ""),
        stoneCoins: Number(profile.stoneCoins || 0),
        bankStoneCoins: Number(profile.bankStoneCoins || 0),
      }];
    })),
    parties: Object.fromEntries(Object.values(parties).filter(Boolean).map((party) => [String(party.partyId || ""), {
      partyId: String(party.partyId || ""),
      leaderUsername: String(accountUsernameById.get(String(party.leaderAccountId || "")) || ""),
      memberUsernames: Array.isArray(party.memberAccountIds)
        ? party.memberAccountIds.map((accountId) => String(accountUsernameById.get(String(accountId)) || ""))
        : [],
    }])),
    battleRooms: Object.fromEntries(Object.values(battleRooms).filter((room) => room && room.roomId).map((room) => [String(room.roomId), {
      roomId: String(room.roomId),
      status: String(room.status || ""),
      actors: (Array.isArray(room.actors) ? room.actors : []).map((actor) => ({
        side: String(actor && actor.side || ""),
        accountId: String(actor && actor.accountId || ""),
        kind: String(actor && actor.kind || ""),
      })),
    }])),
    reconciliationSideEffects: assertNoSideEffects ? {
      durableAcceptedDelta: Number(durableAfter.accepted || 0) - Number(durableBefore.accepted || 0),
      durableCompletedDelta: Number(durableAfter.completed || 0) - Number(durableBefore.completed || 0),
      durablePendingDelta: Number(durableAfter.pending || 0) - Number(durableBefore.pending || 0),
      transactionDelta: Number(recording && recording.transactionCount || 0) - transactionBefore,
    } : null,
  };
}

function createRecordingPoolMetrics() {
  return {
    transactionCount: 0,
    commitCount: 0,
    rollbackCount: 0,
    queryCount: 0,
    activeTransactions: 0,
    maxActiveTransactions: 0,
    maxStatementsPerTransaction: 0,
    maxTouchedRowsPerTransaction: 0,
    currentStatementCount: 0,
    currentTouchedRows: 0,
    currentTransaction: null,
    operationCommitCompletedAtUnixMs: new Map(),
    commitDelayMsTotal: 0,
    distributions: createRecordingDistributions(),
    scenarioStartedAt: 0,
    scenarioDurationMs: 0,
    scenarioTransactionBaseline: 0,
    storeRevision: 0,
    pendingStoreRevision: null,
  };
}

function createRecordingPool(metrics) {
  const connection = {
    async beginTransaction() {
      metrics.transactionCount += 1;
      metrics.activeTransactions += 1;
      metrics.maxActiveTransactions = Math.max(metrics.maxActiveTransactions, metrics.activeTransactions);
      metrics.currentStatementCount = 0;
      metrics.currentTouchedRows = 0;
      metrics.currentTransaction = {startedAtMs: performance.now(), operationIds: new Set()};
    },
    async query(statementValue) {
      const statement = typeof statementValue === "string"
        ? statementValue
        : String(statementValue && statementValue.sql || "");
      metrics.queryCount += 1;
      metrics.currentStatementCount += 1;
      metrics.currentTouchedRows += estimateSqlTouchedRows(statementValue);
      for (const operationId of recordingOperationIdsFromStatement(statementValue)) {
        metrics.currentTransaction && metrics.currentTransaction.operationIds.add(operationId);
      }
      if (/^SELECT revision AS storeRevision FROM auth_store_revisions[\s\S]+FOR UPDATE$/i.test(statement.trim())) {
        return [[{storeRevision: metrics.storeRevision}], []];
      }
      if (/^UPDATE auth_store_revisions SET revision = revision \+ 1[\s\S]+AND revision = \d+$/i.test(statement.trim())) {
        metrics.pendingStoreRevision = metrics.storeRevision + 1;
        return [{affectedRows: 1}, []];
      }
      return [{affectedRows: 1}, []];
    },
    async commit() {
      metrics.commitCount += 1;
      metrics.maxStatementsPerTransaction = Math.max(metrics.maxStatementsPerTransaction, metrics.currentStatementCount);
      metrics.maxTouchedRowsPerTransaction = Math.max(metrics.maxTouchedRowsPerTransaction, metrics.currentTouchedRows);
      const delayMs = metrics.commitCount % 100 === 0 ? 20 : 5;
      metrics.commitDelayMsTotal += delayMs;
      if (metrics.pendingStoreRevision !== null) {
        metrics.storeRevision = metrics.pendingStoreRevision;
      }
      metrics.pendingStoreRevision = null;
      const operationIds = [...(metrics.currentTransaction && metrics.currentTransaction.operationIds || [])];
      await delay(delayMs);
      const startedAtMs = Number(metrics.currentTransaction && metrics.currentTransaction.startedAtMs || performance.now());
      recordRecordingMetric(metrics, "transactionSqlCount", metrics.currentStatementCount, startedAtMs);
      recordRecordingMetric(metrics, "transactionTouchedRows", metrics.currentTouchedRows, startedAtMs);
      metrics.activeTransactions = Math.max(0, metrics.activeTransactions - 1);
      metrics.currentStatementCount = 0;
      metrics.currentTouchedRows = 0;
      metrics.currentTransaction = null;
      metrics.pendingStoreRevision = null;
      const completedAtUnixMs = performance.timeOrigin + performance.now();
      for (const operationId of operationIds) {
        metrics.operationCommitCompletedAtUnixMs.set(operationId, completedAtUnixMs);
      }
    },
    async rollback() {
      metrics.rollbackCount += 1;
      metrics.activeTransactions = Math.max(0, metrics.activeTransactions - 1);
      metrics.currentStatementCount = 0;
      metrics.currentTouchedRows = 0;
      metrics.currentTransaction = null;
      metrics.pendingStoreRevision = null;
    },
    release() {},
  };
  return {
    async getConnection() {
      return connection;
    },
    async end() {},
  };
}

function recordingPoolMetrics(metrics, options = {}) {
  const transactionSqlCount = recordingMetricSummary(metrics, "transactionSqlCount");
  const transactionTouchedRows = recordingMetricSummary(metrics, "transactionTouchedRows");
  const saveLatencyMs = recordingMetricSummary(metrics, "saveLatencyMs");
  const result = {
    transactionCount: metrics.transactionCount,
    commitCount: metrics.commitCount,
    rollbackCount: metrics.rollbackCount,
    queryCount: metrics.queryCount,
    activeTransactions: metrics.activeTransactions,
    maxActiveTransactions: metrics.maxActiveTransactions,
    maxStatementsPerTransaction: metrics.maxStatementsPerTransaction,
    maxTouchedRowsPerTransaction: metrics.maxTouchedRowsPerTransaction,
    commitDelayMsTotal: metrics.commitDelayMsTotal,
    scenarioTransactionDelta: metrics.transactionCount - metrics.scenarioTransactionBaseline,
    scenarioTransactionCount: transactionSqlCount.count,
    transactionSqlCount,
    transactionTouchedRows,
    saveLatencyMs,
    saveP95Ms: saveLatencyMs.p95,
    saveP99Ms: saveLatencyMs.p99,
    saveMaxMs: saveLatencyMs.max,
    realMysql: false,
  };
  if (options.includeOperationCommitTimes === true) {
    result.operationCommitCompletedAtUnixMs = Object.fromEntries(metrics.operationCommitCompletedAtUnixMs);
  }
  return result;
}

function recordingPoolSummary(metrics) {
  return {
    transactionCount: metrics.transactionCount,
    commitCount: metrics.commitCount,
    rollbackCount: metrics.rollbackCount,
    queryCount: metrics.queryCount,
    activeTransactions: metrics.activeTransactions,
    maxActiveTransactions: metrics.maxActiveTransactions,
    maxStatementsPerTransaction: metrics.maxStatementsPerTransaction,
    maxTouchedRowsPerTransaction: metrics.maxTouchedRowsPerTransaction,
    commitDelayMsTotal: metrics.commitDelayMsTotal,
    scenarioTransactionDelta: metrics.transactionCount - metrics.scenarioTransactionBaseline,
    retainedTransactionSamples: 0,
    retainedSaveSamples: 0,
    realMysql: false,
  };
}

function createRecordingDistributions() {
  return {
    transactionSqlCount: createRecordingDistribution(1),
    transactionTouchedRows: createRecordingDistribution(1),
    saveLatencyMs: createRecordingDistribution(1_000_000),
  };
}

function createRecordingDistribution(scale) {
  return {
    scale: Math.max(1, Number(scale || 1)),
    all: createHistogram(),
    first: createHistogram(),
    last: createHistogram(),
    allMax: null,
    firstMax: null,
    lastMax: null,
  };
}

function recordRecordingMetric(metrics, field, value, startedAtMs) {
  const scenarioStartedAt = Number(metrics.scenarioStartedAt || 0);
  const durationMs = Math.max(1, Number(metrics.scenarioDurationMs || 1));
  const elapsedMs = Number(startedAtMs || 0) - scenarioStartedAt;
  if (scenarioStartedAt <= 0 || elapsedMs < 0 || elapsedMs > durationMs) {
    return;
  }
  const row = metrics.distributions && metrics.distributions[field];
  if (!row) {
    throw new Error(`recording distribution is missing: ${field}`);
  }
  const windowMs = Math.max(1000, Math.min(5 * 60 * 1000, durationMs * 0.2));
  const firstWindowStartMs = durationMs >= FULL_DURATION_SECONDS * 1000 ? 5 * 60 * 1000 : 0;
  recordRecordingDistributionValue(row, "all", value);
  if (elapsedMs >= firstWindowStartMs && elapsedMs < firstWindowStartMs + windowMs) {
    recordRecordingDistributionValue(row, "first", value);
  }
  if (elapsedMs >= durationMs - windowMs && elapsedMs <= durationMs) {
    recordRecordingDistributionValue(row, "last", value);
  }
}

function recordRecordingDistributionValue(row, window, value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return;
  }
  const histogram = row[window];
  const encoded = Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.round(numericValue * row.scale) + 1));
  histogram.record(encoded);
  const maxField = `${window}Max`;
  row[maxField] = row[maxField] === null ? numericValue : Math.max(row[maxField], numericValue);
}

function recordingMetricSummary(metrics, field) {
  const durationMs = Math.max(1, Number(metrics.scenarioDurationMs || 1));
  const windowMs = Math.max(1000, Math.min(5 * 60 * 1000, durationMs * 0.2));
  const firstWindowStartMs = durationMs >= FULL_DURATION_SECONDS * 1000 ? 5 * 60 * 1000 : 0;
  const row = metrics.distributions && metrics.distributions[field];
  if (!row) {
    throw new Error(`recording distribution is missing: ${field}`);
  }
  const all = recordingHistogramSummary(row, "all");
  const first = recordingHistogramSummary(row, "first");
  const last = recordingHistogramSummary(row, "last");
  return {
    ...all,
    windowSeconds: round(windowMs / 1000),
    firstWindowStartSeconds: round(firstWindowStartMs / 1000),
    first,
    last,
    p95Delta: first.p95 === null || last.p95 === null ? null : round(last.p95 - first.p95),
  };
}

function recordingHistogramSummary(row, window) {
  const histogram = row[window];
  const decode = (percentileValue) => round(Math.max(0, (percentileValue - 1) / row.scale));
  return {
    count: histogram.count,
    p50: histogram.count > 0 ? decode(histogram.percentile(50)) : null,
    p95: histogram.count > 0 ? decode(histogram.percentile(95)) : null,
    p99: histogram.count > 0 ? decode(histogram.percentile(99)) : null,
    max: row[`${window}Max`] === null ? null : round(row[`${window}Max`]),
  };
}

function recordingOperationIdsFromStatement(statementValue) {
  const sql = String(statementValue && statementValue.sql || statementValue || "").trim();
  const match = /^INSERT\s+INTO\s+mutation_receipts\s*\([^)]*\)\s*VALUES\s*\(\s*'((?:''|[^'])+)'/i.exec(sql);
  return match ? [match[1].replaceAll("''", "'")] : [];
}

function estimateSqlTouchedRows(statementValue) {
  const sql = String(statementValue && statementValue.sql || statementValue || "").trim();
  if (sql === "") {
    return 0;
  }
  if (/^(INSERT|REPLACE)\b/i.test(sql)) {
    const valuesMatch = /\bVALUES\b/i.exec(sql);
    return valuesMatch ? Math.max(1, countTopLevelSqlItems(sql.slice(valuesMatch.index + valuesMatch[0].length), "tuples")) : 1;
  }
  if (/^DELETE\b/i.test(sql)) {
    const inMatch = /\bIN\s*\(/i.exec(sql);
    if (!inMatch) {
      return 1;
    }
    const openIndex = sql.indexOf("(", inMatch.index);
    return Math.max(1, countTopLevelSqlItems(sql.slice(openIndex + 1), "list"));
  }
  if (/^UPDATE\b/i.test(sql)) {
    return 1;
  }
  return 0;
}

function countTopLevelSqlItems(textValue, mode) {
  const text = String(textValue || "");
  let quote = "";
  let escaped = false;
  let depth = mode === "list" ? 1 : 0;
  let count = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote !== "") {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === "(") {
      if (mode === "tuples" && depth === 0) {
        count += 1;
      }
      depth += 1;
      continue;
    }
    if (character === ")") {
      depth -= 1;
      if (mode === "list" && depth === 0) {
        return count + 1;
      }
      continue;
    }
    if (mode === "list" && character === "," && depth === 1) {
      count += 1;
    }
    if (mode === "tuples" && depth === 0 && /^\s*ON\s+DUPLICATE\b/i.test(text.slice(index))) {
      break;
    }
  }
  return count;
}

function fixtureAccounts() {
  return Array.from({length: ACCOUNT_COUNT}, (_, index) => {
    const suffix = String(index).padStart(3, "0");
    return {
      index,
      accountId: `acc_capacity_${suffix}`,
      playerId: `player_capacity_${suffix}`,
      username: `capacity${suffix}`,
      sessionId: `sess_capacity_${suffix}`,
      token: fixtureToken(index),
    };
  });
}

function fixtureToken(index) {
  return crypto.createHash("sha256").update(`p0_6c_capacity_token_${index}`).digest("base64url");
}

function fakeMysqlProgram() {
  return `#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  if (!stdin.includes("SELECT 'server_state'")) return;
  const nowMs = Date.now();
  const createdAt = new Date(nowMs).toISOString();
  const salt = "capacity-fixture-salt-32-bytes";
  const passwordHash = crypto.scryptSync(${JSON.stringify(FIXTURE_PASSWORD)}, salt, 32).toString("hex");
  const rows = [
    ["server_state", "auth", JSON.stringify({schemaVersion: 2, storage: "mysql_entity_tables"})],
    ["store_revision", "auth", "0"],
  ];
  for (let index = 0; index < ${ACCOUNT_COUNT}; index += 1) {
    const suffix = String(index).padStart(3, "0");
    const accountId = "acc_capacity_" + suffix;
    const username = "capacity" + suffix;
    const sessionId = "sess_capacity_" + suffix;
    const token = crypto.createHash("sha256").update("p0_6c_capacity_token_" + index).digest("base64url");
    const playerId = "player_capacity_" + suffix;
    const account = {accountId, username, displayName: "容量玩家" + suffix, role: "player", passwordSalt: salt, passwordHash, passwordPolicyVersion: 1, passwordUpdatedAt: createdAt, createdAt, updatedAt: createdAt, schemaVersion: 1};
    const session = {sessionId, accountId, tokenHash: crypto.createHash("sha256").update(token).digest("hex"), createdAt, expiresAt: new Date(nowMs + 86400000).toISOString(), revokedAt: null, schemaVersion: 1};
    const binding = {accountId, playerId, profileRevision: 0, createdAt, updatedAt: createdAt, schemaVersion: 1};
    const petId = "pet_capacity_" + suffix;
    const profile = {
      name: "容量玩家" + suffix,
      stoneCoins: 1000000,
      diamonds: 0,
      player: {name: "容量玩家" + suffix, level: 20, hp: 10000, maxHp: 10000, baseStats: {maxHp: 10000, attack: 30, defense: 100, quick: 80}},
      activePetInstanceId: petId,
      petInstances: [{instanceId: petId, petId, formId: "wuli_normal_orange_fire10", name: "容量乌力" + suffix, state: "battle", level: 20, hp: 8000, maxHp: 8000, attack: 20, defense: 100, quick: 70, activeSkillIds: ["pet_attack", "pet_defend"], petSkillSlots: ["pet_attack", "pet_defend", "", "", "", "", ""], passiveSkillIds: []}],
      backpackSlots: Array.from({length: 15}, () => ({})),
      equipmentInstances: {},
      bank: {schemaVersion: 1, stoneCoins: 0, unlockedTabs: 1, items: []},
      recordPoint: {mapId: "firebud_village_gate", spawnName: "doctor_record", label: "容量记录点"}
    };
    rows.push(["accounts", accountId, JSON.stringify(account)]);
    rows.push(["sessions", sessionId, JSON.stringify(session)]);
    rows.push(["profile_bindings", accountId, JSON.stringify(binding)]);
    rows.push(["profiles", playerId, JSON.stringify({playerId, accountId, profileRevision: 0, updatedAt: createdAt, schemaVersion: 1, profile})]);
  }
  for (let groupIndex = 0; groupIndex < ${BATTLE_GROUP_COUNT + CHURN_GROUP_COUNT}; groupIndex += 1) {
    const partyId = "party_capacity_" + String(groupIndex).padStart(2, "0");
    const memberAccountIds = Array.from({length: ${BATTLE_GROUP_SIZE}}, (_, offset) => "acc_capacity_" + String(groupIndex * ${BATTLE_GROUP_SIZE} + offset).padStart(3, "0"));
    rows.push(["parties", partyId, JSON.stringify({partyId, leaderAccountId: memberAccountIds[0], memberAccountIds, createdAt, updatedAt: createdAt, schemaVersion: 1})]);
  }
  for (let index = 0; index < ${BATTLE_RECORD_LIMIT}; index += 1) {
    const suffix = String(index).padStart(5, "0");
    const groupIndex = index % 40;
    const participantAccountIds = Array.from({length: 5}, (_, offset) => "acc_capacity_" + String(groupIndex * 5 + offset).padStart(3, "0"));
    const startedAt = new Date(nowMs - (${BATTLE_RECORD_LIMIT} - index) * 300000).toISOString();
    const endedAt = new Date(Date.parse(startedAt) + 200000).toISOString();
    const profiles = participantAccountIds.map((accountId, offset) => {
      const accountSuffix = accountId.slice(-3);
      return {
        accountId,
        playerId: "player_capacity_" + accountSuffix,
        profileRevision: index + offset + 1,
        playerHp: {before: 10000, after: 9870, maxHp: 10000},
        ridePetHp: {petId: "ride_capacity_" + accountSuffix, before: 8200, after: 8110, maxHp: 8200},
        exp: {
          amount: 572,
          player: {amount: 220, baseAmount: 200, partyBonusPercent: 10},
          pets: [{petId: "pet_capacity_" + accountSuffix, amount: 220, baseAmount: 200}],
          ridePets: [{petId: "ride_capacity_" + accountSuffix, amount: 132, baseAmount: 120}],
        },
        rewards: {stoneCoins: 120, items: [{itemId: "healing_herb", count: 1}]},
        quests: null,
      };
    });
    const recordId = "battle_record_fixture_" + suffix;
    const roomId = "battle_room_fixture_" + suffix;
    const record = {
      recordId,
      roomId,
      mode: "party_pve",
      reason: "victory",
      winnerAccountId: participantAccountIds[0],
      loserAccountIds: [],
      closedByAccountId: participantAccountIds[0],
      participantAccountIds,
      participants: participantAccountIds.map((accountId, offset) => ({
        accountId,
        username: "capacity" + accountId.slice(-3),
        displayName: "容量玩家" + accountId.slice(-3),
        role: offset === 0 ? "leader" : "member",
        schemaVersion: 1,
      })),
      round: 20,
      turnSeq: 200,
      result: {
        reason: "victory",
        winnerAccountId: participantAccountIds[0],
        loserAccountIds: [],
        closedByAccountId: participantAccountIds[0],
        endedAt,
        battleRecordId: recordId,
        manorWarId: "",
        manorBattleId: "",
        manorId: "",
        winnerFamilyId: "",
        winnerFamilyName: "",
        battleReturns: [],
        schemaVersion: 1,
      },
      profileWriteback: {
        kind: "battle_profile_writeback",
        roomId,
        reason: "victory",
        updatedAt: endedAt,
        profiles,
        skippedProfiles: [],
        schemaVersion: 1,
      },
      expSummaries: profiles.map((profile) => ({
        accountId: profile.accountId,
        playerId: profile.playerId,
        amount: profile.exp.amount,
        playerAmount: profile.exp.player.amount,
        petAmount: profile.exp.pets[0].amount,
        ridePetAmount: profile.exp.ridePets[0].amount,
      })),
      startedAt,
      endedAt,
      durationSeconds: 200,
      schemaVersion: 2,
    };
    rows.push(["battle_records", recordId, JSON.stringify(record)]);
  }
  for (let index = 0; index < ${BATTLE_TRACE_LIMIT}; index += 1) {
    const suffix = String(index).padStart(4, "0");
    const roomSuffix = String(${BATTLE_RECORD_LIMIT} - ${BATTLE_TRACE_LIMIT} + index).padStart(5, "0");
    const groupIndex = index % 40;
    const participantAccountIds = Array.from({length: 5}, (_, offset) => "acc_capacity_" + String(groupIndex * 5 + offset).padStart(3, "0"));
    const traceId = "battle_trace_fixture_" + suffix;
    const trace = {
      traceId,
      createdAt: new Date(nowMs - (${BATTLE_TRACE_LIMIT} - index) * 1000).toISOString(),
      type: "battle_room_closed",
      roomId: "battle_room_fixture_" + roomSuffix,
      mode: "party_pve",
      status: "closed",
      phase: "finished",
      round: 20,
      turnSeq: 200,
      participantAccountIds,
      details: {
        recordId: "battle_record_fixture_" + roomSuffix,
        reason: "victory",
        battleReturnCount: 0,
        resultReason: "victory",
        lastEventRound: 20,
        lastEventTurnSeq: 200,
        lastEventCount: 20,
        profileWritebackCount: 5,
        profileExpAmounts: participantAccountIds.map((accountId) => ({accountId, amount: 572})),
      },
      schemaVersion: 1,
    };
    rows.push(["battle_trace", traceId, JSON.stringify(trace)]);
  }
  const pad = "x".repeat(${RECEIPT_RESPONSE_PAD_BYTES});
  for (let index = 0; index < ${RECEIPT_COUNT}; index += 1) {
    const operationId = "p06c.fixture.receipt." + String(index).padStart(6, "0");
    const committedAtMs = nowMs - ${RECEIPT_COUNT} + index;
    rows.push(["mutation_receipts", operationId, JSON.stringify({schemaVersion: 1, operationId, requestHash: "c".repeat(64), actionId: "fixture.seed", accountId: "acc_capacity_000", committedAt: new Date(committedAtMs).toISOString(), expiresAt: new Date(committedAtMs + 72 * 60 * 60 * 1000).toISOString(), response: {ok: true, pad}})]);
  }
  for (let index = 0; index < ${TOMBSTONE_COUNT}; index += 1) {
    rows.push(["consumed_equipment_envelopes", "eqx_p06c_" + String(index).padStart(12, "0"), "{}"]);
  }
  const output = rows.map((row) => row.join("\\t")).join("\\n") + "\\n";
  const documentJsonBytes = rows.reduce((total, row) => total + Buffer.byteLength(row[2] || ""), 0);
  const battleRecordJsonBytes = rows
    .filter((row) => row[0] === "battle_records")
    .reduce((total, row) => total + Buffer.byteLength(row[2] || ""), 0);
  const battleTraceJsonBytes = rows
    .filter((row) => row[0] === "battle_trace")
    .reduce((total, row) => total + Buffer.byteLength(row[2] || ""), 0);
  fs.writeFileSync(path.join(__dirname, "fixture-metadata.json"), JSON.stringify({
    outputBytes: Buffer.byteLength(output),
    documentJsonBytes,
    battleRecordJsonBytes,
    battleTraceJsonBytes,
    battleRecords: ${BATTLE_RECORD_LIMIT},
    battleTrace: ${BATTLE_TRACE_LIMIT},
    receipts: ${RECEIPT_COUNT},
    tombstones: ${TOMBSTONE_COUNT},
  }));
  process.stdout.write(output);
});
`;
}

function readCapacityFixtureMetadata(fixtureDir, outputLimitBytesValue) {
  const filePath = path.join(fixtureDir, "fixture-metadata.json");
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const result = {};
  for (const field of [
    "outputBytes",
    "documentJsonBytes",
    "battleRecordJsonBytes",
    "battleTraceJsonBytes",
    "battleRecords",
    "battleTrace",
    "receipts",
    "tombstones",
  ]) {
    if (!isFiniteMetricNumber(parsed[field]) || parsed[field] < 0) {
      throw new Error(`capacity fixture metadata ${field} is invalid`);
    }
    result[field] = parsed[field];
  }
  if (!isFiniteMetricNumber(outputLimitBytesValue) || outputLimitBytesValue <= 0) {
    throw new Error("capacity fixture shared MySQL CLI output limit is invalid");
  }
  result.outputLimitBytes = outputLimitBytesValue;
  result.outputHeadroomBytes = outputLimitBytesValue - result.outputBytes;
  result.outputHeadroomRatio = round(result.outputHeadroomBytes / outputLimitBytesValue, 6);
  result.outputUsageRatio = round(result.outputBytes / outputLimitBytesValue, 6);
  return Object.freeze(result);
}

function fixtureEncounterAuthority() {
  return Object.freeze({
    catalog: {},
    resolve(input = {}) {
      const request = input.request && typeof input.request === "object" ? input.request : {};
      const zone = request.encounterZone && typeof request.encounterZone === "object" ? request.encounterZone : {};
      return {
        ok: true,
        encounter: {
          zoneId: String(zone.id || "p06c_capacity_zone"),
          groupId: "p06c_capacity_group",
          name: "容量野怪",
          formationTemplate: "10v10",
          enemyCount: 10,
          selectedWildPet: zone.selectedWildPet,
          selectedWildPets: [],
          wildPetPool: [],
          authority: "isolated_capacity_fixture",
          schemaVersion: 1,
        },
      };
    },
  });
}

function fixtureEncounterPermitAuthority() {
  return Object.freeze({
    observeAcceptedStep() {
      return {ok: true, permit: null};
    },
    authorizeEncounter() {
      return {ok: true, mode: "direct", authorization: {mode: "direct"}};
    },
    consume() {
      return {ok: true};
    },
    invalidateAccount() {},
  });
}

function fixtureManualEncounterAccess() {
  return Object.freeze({authorize: () => ({ok: true, manual: false, notManual: true, schemaVersion: 1})});
}

function newAccountRuntime(account, index) {
  const groupIndex = Math.floor(index / BATTLE_GROUP_SIZE);
  const cluster = index < (BATTLE_GROUP_COUNT + CHURN_GROUP_COUNT) * BATTLE_GROUP_SIZE ? groupIndex % CLUSTER_PATHS.length : index % CLUSTER_PATHS.length;
  return {
    index,
    account,
    cluster,
    path: CLUSTER_PATHS[cluster],
    pathIndex: 0,
    movementSeq: 0,
    aoiRadius: 18,
    positionBusy: false,
    assetBusy: false,
    churnBusy: false,
    expectedStoneCoins: 1000000,
    expectedBankCoins: 0,
  };
}

function positionPayload(state, radius = state.aoiRadius || 18) {
  const [cellX, cellY] = state.path[state.pathIndex];
  return {mapId: MAP_ID, cellX, cellY, facing: "south", moving: false, scope: "aoi", radius};
}

function movementStepPayload(state, fromCellX, fromCellY, toCellX, toCellY) {
  return {
    mapId: MAP_ID,
    fromCellX,
    fromCellY,
    toCellX,
    toCellY,
    facing: toCellX > fromCellX ? "east" : (toCellX < fromCellX ? "west" : (toCellY > fromCellY ? "south" : "north")),
    moving: true,
    // The movement endpoint also refreshes this connection's AOI
    // subscription. Preserve the scenario's current radius instead of
    // accidentally resetting hotspot movers to the production default (18).
    aoiRadius: state.aoiRadius || 18,
  };
}

function battleEncounterPayload(groupIndex) {
  return {
    enemyCount: 10,
    encounterZone: {
      id: `p06c_capacity_${groupIndex}`,
      name: "容量十对十",
      formationTemplate: "10v10",
      selectedWildPet: {
        formId: "wuli_normal_orange_fire10",
        name: "容量野生乌力",
        level: 20,
        battleStats: {maxHp: 5000, attack: 1, defense: 10, quick: 30},
      },
    },
  };
}

function battleCommandActors(room, states) {
  const accountById = new Map(states.map((state) => [state.account.accountId, state.account]));
  return (Array.isArray(room && room.battle && room.battle.actors) ? room.battle.actors : [])
    .filter((actor) => actor && actor.side === "ally" && (actor.kind === "player" || actor.kind === "pet"))
    .map((actor) => ({
      account: accountById.get(String(actor.accountId || "")),
      actorId: String(actor.actorId || ""),
      kind: String(actor.kind || ""),
    }))
    .filter((entry) => entry.account && entry.actorId);
}

function capacityBattleActorRosterValidation(actorsValue, groupIndexValue, statesValue) {
  const actors = Array.isArray(actorsValue) ? actorsValue : [];
  const groupIndex = Math.max(0, Math.trunc(Number(groupIndexValue || 0)));
  const states = Array.isArray(statesValue) ? statesValue : [];
  const expectedAccountIds = states
    .slice(groupIndex * BATTLE_GROUP_SIZE, groupIndex * BATTLE_GROUP_SIZE + BATTLE_GROUP_SIZE)
    .map((state) => String(state && state.account && state.account.accountId || ""))
    .filter(Boolean);
  const expected = new Set(expectedAccountIds);
  const allies = actors.filter((actor) => actor && actor.side === "ally");
  const enemies = actors.filter((actor) => actor && actor.side === "enemy");
  const unexpectedSides = actors.length - allies.length - enemies.length;
  const byAccount = new Map();
  for (const actor of allies) {
    const accountId = String(actor && actor.accountId || "");
    const rows = byAccount.get(accountId) || [];
    rows.push(String(actor && actor.kind || ""));
    byAccount.set(accountId, rows);
  }
  const unexpectedAccounts = [...byAccount.keys()].filter((accountId) => accountId === "" || !expected.has(accountId));
  const invalidExpectedAccounts = expectedAccountIds.filter((accountId) => {
    const kinds = byAccount.get(accountId) || [];
    return kinds.length !== 2
      || kinds.filter((kind) => kind === "player").length !== 1
      || kinds.filter((kind) => kind === "pet").length !== 1;
  });
  const ok = expectedAccountIds.length === BATTLE_GROUP_SIZE
    && expected.size === BATTLE_GROUP_SIZE
    && allies.length === BATTLE_GROUP_SIZE * 2
    && enemies.length === 10
    && unexpectedSides === 0
    && unexpectedAccounts.length === 0
    && invalidExpectedAccounts.length === 0;
  return {
    ok,
    message: ok ? "ok" : [
      `allies=${allies.length}/10`,
      `enemies=${enemies.length}/10`,
      `expectedAccounts=${expected.size}/5`,
      `unexpectedAccounts=${unexpectedAccounts.join(",") || "none"}`,
      `invalidExpectedAccounts=${invalidExpectedAccounts.join(",") || "none"}`,
      `unexpectedSides=${unexpectedSides}`,
    ].join(" "),
  };
}

// Protocol/transport differences are intentionally centralized here. P0.6c
// requires Authorization headers; query tokens are never generated.
function eventStreamPath({lastEventSeq, epoch}) {
  const query = new URLSearchParams({
    clientVersion: SERVER_VERSION,
    clientProtocolVersion: String(PROTOCOL_VERSION),
  });
  if (Number(lastEventSeq || 0) > 0) {
    query.set("lastEventSeq", String(Math.trunc(Number(lastEventSeq))));
  }
  if (String(epoch || "") !== "") {
    query.set("eventStreamEpoch", String(epoch));
  }
  return `/events?${query.toString()}`;
}

function eventStreamHeaders(account) {
  return {
    Authorization: `Bearer ${account.token}`,
    "X-Beastbound-Client-Version": SERVER_VERSION,
    "X-Beastbound-Protocol-Version": String(PROTOCOL_VERSION),
  };
}

function timelineFor(durationSeconds, full, skipAttacks) {
  if (durationSeconds < 30) {
    return !skipAttacks && durationSeconds >= 5
      ? [{id: "development_attack", kind: "attack", atSeconds: Math.max(1, Math.floor(durationSeconds * 0.1))}]
      : [];
  }
  const rows = [];
  if (full) {
    rows.push({id: "hold_stale_cursor", kind: "hold_cursor", atSeconds: 15 * 60, index: ACCOUNT_COUNT - 1});
    rows.push({id: "restore_stale_cursor", kind: "restore_cursor", atSeconds: 18 * 60, index: ACCOUNT_COUNT - 1});
    rows.push({id: "storm_50", kind: "reconnect", atSeconds: 12 * 60, count: 50, jitterMs: 2000});
    rows.push({id: "storm_200", kind: "reconnect", atSeconds: 22 * 60, count: 200, jitterMs: 5000});
    if (!skipAttacks) {
      rows.push({id: "attack_8m", kind: "attack", atSeconds: 8 * 60});
      rows.push({id: "attack_28m", kind: "attack", atSeconds: 28 * 60});
    }
  } else {
    for (let second = 30; second < durationSeconds; second += 30) {
      rows.push({id: `rolling_${second}`, kind: "reconnect", atSeconds: second, count: 10, jitterMs: 1000});
    }
    rows.push({id: "quick_storm_50", kind: "reconnect", atSeconds: Math.max(20, Math.floor(durationSeconds * 0.6)), count: 50, jitterMs: 2000});
    if (durationSeconds >= QUICK_DURATION_SECONDS) {
      // A shorter development smoke may not generate 500 retained events,
      // so it cannot honestly require an over-window cursor reset.
      rows.push({id: "quick_hold_stale_cursor", kind: "hold_cursor", atSeconds: Math.max(10, Math.floor(durationSeconds * 0.1)), index: ACCOUNT_COUNT - 1});
      rows.push({id: "quick_restore_stale_cursor", kind: "restore_cursor", atSeconds: Math.max(25, Math.floor(durationSeconds * 0.9)), index: ACCOUNT_COUNT - 1});
    }
    if (!skipAttacks) {
      rows.push({id: "quick_attack", kind: "attack", atSeconds: Math.max(15, Math.floor(durationSeconds * 0.4))});
    }
  }
  return rows;
}

function capacitySchedulerTickTiming(nextTickAtValue, nowAtValue, tickMsValue = TICK_MS) {
  const nextTickAt = Number(nextTickAtValue);
  const nowAt = Number(nowAtValue);
  const tickMs = Math.max(1, Number(tickMsValue || TICK_MS));
  const lagMs = Math.max(0, nowAt - nextTickAt);
  const rebased = lagMs >= tickMs;
  const dispatchAtMs = rebased ? nowAt : nextTickAt;
  return {
    lagMs,
    rebased,
    dispatchAtMs,
    nextTickAtMs: dispatchAtMs + tickMs,
  };
}

function hotspotActiveAt(elapsedMs, durationSeconds, full) {
  if (durationSeconds < 60) {
    return false;
  }
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  if (!full) {
    return elapsedSeconds < 60;
  }
  if (elapsedSeconds < 5 * 60) {
    return false;
  }
  return (elapsedSeconds - 5 * 60) % (5 * 60) < 60;
}

function gateThresholds() {
  return {
    runtimeHttpP95Ms: 75,
    runtimeHttpP99Ms: 150,
    durableHttpP95Ms: 250,
    durableHttpP99Ms: 500,
    wsP95Ms: 150,
    wsP99Ms: 300,
    reconnectP95Ms: 2000,
    durablePeakPending: 64,
    eventLoopP95Ms: 20,
    eventLoopP99Ms: 50,
    eventLoopMaxMs: 250,
    heapGrowthMiB: 64,
    heapSlopeMiBPerMinute: 1,
    rssGrowthMiB: 256,
    rssSlopeMiBPerMinute: 2,
    peakRssGrowthMiB: 384,
    externalGrowthMiB: 128,
    arrayBuffersGrowthMiB: 128,
    externalSlopeMiBPerMinute: 2,
    arrayBuffersSlopeMiBPerMinute: 2,
    frameReuseRatio: 0.5,
    maxPendingPositionEvents: 512,
    maxTouchedRowsPerTransaction: 64,
  };
}

function capacityDurationFailures(resultValue, optionsValue) {
  const result = resultValue && typeof resultValue === "object" ? resultValue : {};
  const expectedMs = Math.max(0, Number(optionsValue && optionsValue.durationSeconds || 0) * 1000);
  const failures = [];
  if (!isFiniteMetricNumber(result.durationMs) || result.durationMs < expectedMs) {
    failures.push(`actual scheduler duration ${String(result.durationMs)}ms < requested ${expectedMs}ms`);
  }
  const minimumLastMetricMs = Math.max(0, expectedMs - 2 * METRIC_SAMPLE_MS);
  if (!isFiniteMetricNumber(result.lastMetricElapsedMs) || result.lastMetricElapsedMs < minimumLastMetricMs) {
    failures.push(`last metric coverage ${String(result.lastMetricElapsedMs)}ms < ${minimumLastMetricMs}ms`);
  }
  return failures;
}

function capacityMemoryFailures(memoryValue, optionsValue, thresholdsValue = gateThresholds()) {
  const memory = memoryValue && typeof memoryValue === "object" ? memoryValue : {};
  const thresholds = thresholdsValue || gateThresholds();
  const failures = [];
  const requiredFields = [
    "steadyBaselineHeapMiB",
    "steadyBaselineRssMiB",
    "steadyBaselineExternalMiB",
    "steadyBaselineArrayBuffersMiB",
    "finalHeapMiB",
    "finalRssMiB",
    "finalExternalMiB",
    "finalArrayBuffersMiB",
    "heapGrowthMiB",
    "rssGrowthMiB",
    "externalGrowthMiB",
    "arrayBuffersGrowthMiB",
    "peakRssGrowthMiB",
    "sampledPeakExternalMiB",
    "sampledPeakArrayBuffersMiB",
    "sampledPeakExternalGrowthMiB",
    "sampledPeakArrayBuffersGrowthMiB",
    "rssSlopeMiBPerMinute",
    "externalSlopeMiBPerMinute",
    "arrayBuffersSlopeMiBPerMinute",
    "arrayBuffersExceedsExternalSamples",
  ];
  if (Number(optionsValue && optionsValue.durationSeconds || 0) >= FULL_DURATION_SECONDS) {
    requiredFields.push("heapSlopeMiBPerMinute");
  }
  for (const field of requiredFields) {
    if (!isFiniteMetricNumber(memory[field])) {
      failures.push(`memory metric ${field} is missing or non-finite`);
    }
  }
  const upperBounds = [
    ["heapGrowthMiB", thresholds.heapGrowthMiB],
    ["rssGrowthMiB", thresholds.rssGrowthMiB],
    ["peakRssGrowthMiB", thresholds.peakRssGrowthMiB],
    ["externalGrowthMiB", thresholds.externalGrowthMiB],
    ["arrayBuffersGrowthMiB", thresholds.arrayBuffersGrowthMiB],
    ["sampledPeakExternalGrowthMiB", thresholds.externalGrowthMiB],
    ["sampledPeakArrayBuffersGrowthMiB", thresholds.arrayBuffersGrowthMiB],
  ];
  for (const [field, limit] of upperBounds) {
    if (isFiniteMetricNumber(memory[field]) && memory[field] > Number(limit)) {
      failures.push(`${field} ${memory[field]}MiB > ${limit}MiB`);
    }
  }
  for (const [arrayField, externalField] of [
    ["steadyBaselineArrayBuffersMiB", "steadyBaselineExternalMiB"],
    ["finalArrayBuffersMiB", "finalExternalMiB"],
    ["sampledPeakArrayBuffersMiB", "sampledPeakExternalMiB"],
  ]) {
    if (Number(memory[arrayField]) > Number(memory[externalField])) {
      failures.push(`${arrayField} ${memory[arrayField]}MiB > ${externalField} ${memory[externalField]}MiB`);
    }
  }
  if (Number(memory.arrayBuffersExceedsExternalSamples || 0) !== 0) {
    failures.push(`arrayBuffers exceeded external in ${memory.arrayBuffersExceedsExternalSamples} memory sample(s)`);
  }
  if (Number(optionsValue && optionsValue.durationSeconds || 0) >= FULL_DURATION_SECONDS) {
    for (const [field, limit] of [
      ["heapSlopeMiBPerMinute", thresholds.heapSlopeMiBPerMinute],
      ["rssSlopeMiBPerMinute", thresholds.rssSlopeMiBPerMinute],
      ["externalSlopeMiBPerMinute", thresholds.externalSlopeMiBPerMinute],
      ["arrayBuffersSlopeMiBPerMinute", thresholds.arrayBuffersSlopeMiBPerMinute],
    ]) {
      if (isFiniteMetricNumber(memory[field]) && memory[field] > Number(limit)) {
        failures.push(`${field} ${memory[field]}MiB/min > ${limit}MiB/min`);
      }
    }
  }
  return failures;
}

function frameReuseFailures(eventStreamValue, minimumRatio) {
  const eventStream = eventStreamValue && typeof eventStreamValue === "object" ? eventStreamValue : {};
  const failures = [];
  for (const field of ["encodedFrames", "reusedFrames", "reusedBytes", "frameReuseRatio"]) {
    if (!isFiniteMetricNumber(eventStream[field])) {
      failures.push(`event stream frame metric ${field} is missing or non-finite`);
    }
  }
  for (const field of ["encodedFrames", "reusedFrames", "reusedBytes"]) {
    if (Number(eventStream[field] || 0) <= 0) {
      failures.push(`event stream ${field} ${Number(eventStream[field] || 0)} <= 0`);
    }
  }
  if (Number(eventStream.frameReuseRatio || 0) < Number(minimumRatio || 0)) {
    failures.push(`event stream frame reuse ratio ${Number(eventStream.frameReuseRatio || 0)} < ${minimumRatio}`);
  }
  return failures;
}

function plannerTouchedRowFailures(recordingValue, maximumTouchedRows) {
  const recording = recordingValue && typeof recordingValue === "object" ? recordingValue : {};
  const distribution = recording.transactionTouchedRows && typeof recording.transactionTouchedRows === "object"
    ? recording.transactionTouchedRows
    : {};
  const failures = [];
  for (const [label, value] of [
    ["max touched rows per transaction", recording.maxTouchedRowsPerTransaction],
    ["touched rows p99", distribution.p99],
    ["touched rows max", distribution.max],
  ]) {
    if (!isFiniteMetricNumber(value)) {
      failures.push(`${label} is missing or non-finite`);
    } else if (Number(value) > Number(maximumTouchedRows)) {
      failures.push(`${label} ${value} > ${maximumTouchedRows}`);
    }
  }
  return failures;
}

function recordingScenarioDistributionFailures(recordingValue) {
  const recording = recordingValue && typeof recordingValue === "object" ? recordingValue : {};
  const failures = [];
  const transactionDelta = recording.scenarioTransactionDelta;
  if (!isNonNegativeIntegerMetricNumber(transactionDelta)) {
    failures.push("recording scenario transaction delta is missing or is not a non-negative integer");
    return failures;
  }
  if (
    !isNonNegativeIntegerMetricNumber(recording.scenarioTransactionCount)
    || recording.scenarioTransactionCount !== transactionDelta
  ) {
    failures.push(`recording scenario transactions ${String(recording.scenarioTransactionCount)}/${transactionDelta}`);
  }
  for (const [label, field] of [
    ["transaction SQL count", "transactionSqlCount"],
    ["transaction touched rows", "transactionTouchedRows"],
    ["planner/save latency", "saveLatencyMs"],
  ]) {
    const distribution = recording[field] && typeof recording[field] === "object" ? recording[field] : {};
    if (!isNonNegativeIntegerMetricNumber(distribution.count)) {
      failures.push(`${label} sample count is missing or is not a non-negative integer`);
    } else if (distribution.count !== transactionDelta) {
      failures.push(`${label} samples ${distribution.count}/${transactionDelta}`);
    }
  }
  return failures;
}

function assetCommitTimingSummary(observationsValue, commitsValue) {
  const observations = Array.isArray(observationsValue) ? observationsValue : [];
  const commits = commitsValue && typeof commitsValue === "object" && !Array.isArray(commitsValue)
    ? commitsValue
    : {};
  let matchedCommits = 0;
  let missingCommits = 0;
  let earlyResponses = 0;
  let invalidResponseTimes = 0;
  const margins = [];
  for (const observation of observations) {
    const operationId = String(observation && observation.operationId || "");
    const responseAt = Number(observation && observation.responseObservedAtUnixMs);
    const commitAt = Number(commits[operationId]);
    if (!Number.isFinite(responseAt) || responseAt <= 0) {
      invalidResponseTimes += 1;
    }
    if (!Number.isFinite(commitAt) || commitAt <= 0) {
      missingCommits += 1;
      continue;
    }
    matchedCommits += 1;
    const marginMs = responseAt - commitAt;
    margins.push(marginMs);
    if (!Number.isFinite(marginMs) || marginMs < 0) {
      earlyResponses += 1;
    }
  }
  return {
    observedSuccesses: observations.length,
    uniqueOperationIds: new Set(observations.map((row) => String(row && row.operationId || ""))).size,
    matchedCommits,
    missingCommits,
    responsesNotBeforeCommit: matchedCommits - earlyResponses,
    earlyResponses,
    invalidResponseTimes,
    minimumResponseAfterCommitMs: margins.length > 0 ? round(Math.min(...margins)) : null,
  };
}

function assetCommitTimingFailures(summaryValue, expectedSuccessesValue) {
  const summary = summaryValue && typeof summaryValue === "object" ? summaryValue : {};
  const expected = Math.max(0, Math.trunc(Number(expectedSuccessesValue || 0)));
  const failures = [];
  for (const [field, expectedValue] of [
    ["observedSuccesses", expected],
    ["uniqueOperationIds", expected],
    ["matchedCommits", expected],
    ["responsesNotBeforeCommit", expected],
    ["missingCommits", 0],
    ["earlyResponses", 0],
    ["invalidResponseTimes", 0],
  ]) {
    if (Number(summary[field] || 0) !== expectedValue) {
      failures.push(`asset COMMIT timing ${field} ${Number(summary[field] || 0)}/${expectedValue}`);
    }
  }
  return failures;
}

function capacityStoreReport(storeValue) {
  if (!storeValue || typeof storeValue !== "object" || Array.isArray(storeValue)) {
    return null;
  }
  const recording = storeValue.recording && typeof storeValue.recording === "object"
    ? {...storeValue.recording}
    : null;
  if (recording) {
    delete recording.operationCommitCompletedAtUnixMs;
  }
  return {...storeValue, recording};
}

function capacityHistoryEvidence(initialMetricsValue, finalMetricsValue, startedRoomIdsValue, closedRoomIdsValue) {
  const initial = capacityCollectionSummaryRow(initialMetricsValue && initialMetricsValue.collections) || {};
  const final = capacityCollectionSummaryRow(finalMetricsValue && finalMetricsValue.collections) || {};
  const startedRoomIds = (Array.isArray(startedRoomIdsValue) ? startedRoomIdsValue : [])
    .filter((value) => typeof value === "string" && value !== "");
  const uniqueStartedRoomIds = [...new Set(startedRoomIds)];
  const closedRoomIds = (Array.isArray(closedRoomIdsValue) ? closedRoomIdsValue : [])
    .filter((value) => typeof value === "string" && value !== "");
  const uniqueClosedRoomIds = [...new Set(closedRoomIds)];
  const newestRecordRoomId = typeof final.battleRecordNewestRoomId === "string"
    ? final.battleRecordNewestRoomId
    : "";
  return {
    initial: {
      battleRecords: initial.battleRecords,
      battleRecordOldestId: initial.battleRecordOldestId,
      battleRecordNewestId: initial.battleRecordNewestId,
      battleTrace: initial.battleTrace,
      battleTraceOldestId: initial.battleTraceOldestId,
      battleTraceNewestId: initial.battleTraceNewestId,
      battleTraceNewestType: initial.battleTraceNewestType,
    },
    final: {
      battleRecords: final.battleRecords,
      battleRecordOldestId: final.battleRecordOldestId,
      battleRecordNewestId: final.battleRecordNewestId,
      battleRecordNewestRoomId: newestRecordRoomId,
      battleTrace: final.battleTrace,
      battleTraceOldestId: final.battleTraceOldestId,
      battleTraceNewestId: final.battleTraceNewestId,
      battleTraceNewestType: final.battleTraceNewestType,
      battleTraceNewestRoomId: final.battleTraceNewestRoomId,
    },
    startedRoomCount: startedRoomIds.length,
    uniqueStartedRoomCount: uniqueStartedRoomIds.length,
    closedRoomCount: closedRoomIds.length,
    uniqueClosedRoomCount: uniqueClosedRoomIds.length,
    lastClosedRoomId: closedRoomIds.at(-1) || "",
    newestRecordRoomWasClosedByScenario: uniqueClosedRoomIds.includes(newestRecordRoomId),
    newestTraceRoomWasStartedByScenario: uniqueStartedRoomIds.includes(final.battleTraceNewestRoomId),
  };
}

function capacityHistoryEvidenceFailures(historyValue, fixtureValue, correctnessValue = {}) {
  const history = historyValue && typeof historyValue === "object" ? historyValue : {};
  const initial = history.initial && typeof history.initial === "object" ? history.initial : {};
  const final = history.final && typeof history.final === "object" ? history.final : {};
  const fixture = fixtureValue && typeof fixtureValue === "object" ? fixtureValue : {};
  const correctness = correctnessValue && typeof correctnessValue === "object" ? correctnessValue : {};
  const failures = [];
  for (const [field, expected] of [
    ["battleRecords", BATTLE_RECORD_LIMIT],
    ["battleTrace", BATTLE_TRACE_LIMIT],
  ]) {
    if (!isFiniteMetricNumber(fixture[field]) || fixture[field] !== expected) {
      failures.push(`fixture ${field} ${String(fixture[field])}/${expected}`);
    }
  }
  for (const field of [
    "outputBytes",
    "documentJsonBytes",
    "battleRecordJsonBytes",
    "battleTraceJsonBytes",
    "outputLimitBytes",
    "outputHeadroomBytes",
    "outputHeadroomRatio",
    "outputUsageRatio",
  ]) {
    if (!isFiniteMetricNumber(fixture[field]) || fixture[field] <= 0) {
      failures.push(`fixture ${field} is missing or non-positive`);
    }
  }
  if (
    isFiniteMetricNumber(fixture.outputLimitBytes)
    && fixture.outputLimitBytes !== DEFAULT_MYSQL_CLI_OUTPUT_MAX_BUFFER_BYTES
  ) {
    failures.push(`fixture output limit ${fixture.outputLimitBytes}/${DEFAULT_MYSQL_CLI_OUTPUT_MAX_BUFFER_BYTES} shared production bytes`);
  }
  if (
    isFiniteMetricNumber(fixture.outputBytes)
    && isFiniteMetricNumber(fixture.outputLimitBytes)
    && fixture.outputBytes >= fixture.outputLimitBytes
  ) {
    failures.push(`fixture output ${fixture.outputBytes}B exceeds shared MySQL CLI ${fixture.outputLimitBytes}B limit`);
  }
  if (isFiniteMetricNumber(fixture.outputHeadroomRatio) && fixture.outputHeadroomRatio < 0.25) {
    failures.push(`fixture output headroom ratio ${fixture.outputHeadroomRatio} < 0.25`);
  }
  if (
    isFiniteMetricNumber(fixture.outputBytes)
    && isFiniteMetricNumber(fixture.outputLimitBytes)
    && isFiniteMetricNumber(fixture.outputHeadroomBytes)
    && fixture.outputHeadroomBytes !== fixture.outputLimitBytes - fixture.outputBytes
  ) {
    failures.push("fixture output headroom bytes do not reconcile with the shared limit");
  }
  if (
    isFiniteMetricNumber(fixture.battleRecordJsonBytes)
    && (fixture.battleRecordJsonBytes < 40 * 1024 * 1024 || fixture.battleRecordJsonBytes > 64 * 1024 * 1024)
  ) {
    failures.push(`fixture battle record JSON ${fixture.battleRecordJsonBytes}B is outside the representative 40-64MiB range`);
  }
  for (const [label, row] of [["initial", initial], ["final", final]]) {
    for (const [field, expected] of [["battleRecords", BATTLE_RECORD_LIMIT], ["battleTrace", BATTLE_TRACE_LIMIT]]) {
      if (!isFiniteMetricNumber(row[field]) || row[field] !== expected) {
        failures.push(`${label} history ${field} ${String(row[field])}/${expected}`);
      }
    }
  }
  for (const [field, expected] of [
    ["battleRecordOldestId", FIXTURE_OLDEST_BATTLE_RECORD_ID],
    ["battleRecordNewestId", FIXTURE_NEWEST_BATTLE_RECORD_ID],
    ["battleTraceOldestId", FIXTURE_OLDEST_BATTLE_TRACE_ID],
    ["battleTraceNewestId", FIXTURE_NEWEST_BATTLE_TRACE_ID],
  ]) {
    if (initial[field] !== expected) {
      failures.push(`initial history ${field} ${String(initial[field])}/${expected}`);
    }
  }
  const expectedClosed = isFiniteMetricNumber(correctness.battleRoomsClosed)
    ? Math.max(0, Math.trunc(correctness.battleRoomsClosed))
    : null;
  if (expectedClosed === null) {
    failures.push("history correctness battleRoomsClosed is missing or non-finite");
  } else {
    if (!isFiniteMetricNumber(history.closedRoomCount) || history.closedRoomCount !== expectedClosed) {
      failures.push(`history closed room evidence ${String(history.closedRoomCount)}/${expectedClosed}`);
    }
    if (!isFiniteMetricNumber(history.uniqueClosedRoomCount) || history.uniqueClosedRoomCount !== expectedClosed) {
      failures.push(`history unique closed room evidence ${String(history.uniqueClosedRoomCount)}/${expectedClosed}`);
    }
    if (expectedClosed > 0) {
      if (expectedClosed < BATTLE_RECORD_LIMIT) {
        const expectedOldestId = `battle_record_fixture_${String(expectedClosed).padStart(5, "0")}`;
        if (final.battleRecordOldestId !== expectedOldestId) {
          failures.push(`battle record oldest sentinel ${String(final.battleRecordOldestId)}/${expectedOldestId}`);
        }
      }
      if (final.battleRecordNewestId === FIXTURE_NEWEST_BATTLE_RECORD_ID) {
        failures.push("battle record newest fixture sentinel did not advance");
      }
      if (history.newestRecordRoomWasClosedByScenario !== true) {
        failures.push(`newest battle record room ${String(final.battleRecordNewestRoomId)} was not closed by this scenario`);
      }
      if (typeof history.lastClosedRoomId !== "string" || final.battleRecordNewestRoomId !== history.lastClosedRoomId) {
        failures.push(`newest battle record room ${String(final.battleRecordNewestRoomId)}/${String(history.lastClosedRoomId)} last closed room`);
      }
      const expectedNewestRecordId = typeof history.lastClosedRoomId === "string"
        ? `battle_record_${history.lastClosedRoomId.replace(/^battle_room_/, "")}`
        : "";
      if (expectedNewestRecordId === "" || final.battleRecordNewestId !== expectedNewestRecordId) {
        failures.push(`newest battle record ID ${String(final.battleRecordNewestId)}/${expectedNewestRecordId || "missing"}`);
      }
      if (final.battleTraceOldestId === FIXTURE_OLDEST_BATTLE_TRACE_ID) {
        failures.push("battle trace oldest fixture sentinel was not evicted");
      }
      if (final.battleTraceNewestId === FIXTURE_NEWEST_BATTLE_TRACE_ID) {
        failures.push("battle trace newest fixture sentinel did not advance");
      }
      if (![
        "party_pve_room_created",
        "battle_command_submitted",
        "battle_turn_resolved",
        "battle_room_closed",
      ].includes(final.battleTraceNewestType)) {
        failures.push(`newest battle trace type ${String(final.battleTraceNewestType)} is not a scenario trace`);
      }
      if (history.newestTraceRoomWasStartedByScenario !== true) {
        failures.push(`newest battle trace room ${String(final.battleTraceNewestRoomId)} was not started by this scenario`);
      }
    }
  }
  return failures;
}

function fullCollectionStabilityFailures(collectionsValue) {
  const collections = collectionsValue && typeof collectionsValue === "object" ? collectionsValue : {};
  const slopes = collections.slopesPerMinute && typeof collections.slopesPerMinute === "object"
    ? collections.slopesPerMinute
    : {};
  const failures = [];
  for (const field of FULL_COLLECTION_STABLE_FIELDS) {
    const slope = slopes[field];
    if (!isFiniteMetricNumber(slope)) {
      failures.push(`${field} slope is missing or non-finite`);
    } else if (Math.abs(slope) > 0.01) {
      failures.push(`${field} slope ${slope}/min is not stable at zero`);
    }
  }
  return failures;
}

function collectionCapacityFailures(collectionsValue, correctnessValue = {}, businessEventsValue = {}, optionsValue = {}) {
  const collections = collectionsValue && typeof collectionsValue === "object" ? collectionsValue : {};
  if (!collections.available) {
    return ["product collection cardinality metrics are unavailable"];
  }
  const first = collections.first && typeof collections.first === "object" ? collections.first : {};
  const last = collections.last && typeof collections.last === "object" ? collections.last : {};
  const peaks = collections.peaks && typeof collections.peaks === "object" ? collections.peaks : {};
  const minima = collections.minima && typeof collections.minima === "object" ? collections.minima : {};
  const failures = [];
  for (const field of COLLECTION_REQUIRED_NUMERIC_FIELDS) {
    for (const [label, row] of [["first", first], ["last", last], ["peak", peaks], ["minimum", minima]]) {
      if (!Object.hasOwn(row, field) || !isFiniteMetricNumber(row[field])) {
        failures.push(`collection ${field} ${label} is missing or non-finite`);
      }
    }
  }
  const checkMaximum = (field, limit) => {
    if (isFiniteMetricNumber(peaks[field]) && peaks[field] > limit) {
      failures.push(`collection ${field} peak ${peaks[field]} > ${limit}`);
    }
  };
  if (isFiniteMetricNumber(minima.receiptActive) && minima.receiptActive !== RECEIPT_COUNT) {
    failures.push(`receipt active minimum ${minima.receiptActive}/${RECEIPT_COUNT}`);
  }
  if (isFiniteMetricNumber(peaks.receiptActive) && peaks.receiptActive !== RECEIPT_COUNT) {
    failures.push(`receipt active peak ${peaks.receiptActive}/${RECEIPT_COUNT}`);
  }
  for (const field of ["receiptPendingDeletes", "receiptPendingUpserts"]) {
    if (isFiniteMetricNumber(peaks[field]) && peaks[field] !== 0) {
      failures.push(`published ${field} peak ${peaks[field]} != 0`);
    }
  }
  checkMaximum("receiptDeadKeys", RECEIPT_DEAD_KEY_PEAK_LIMIT);
  checkMaximum("receiptHistoryEntries", RECEIPT_HISTORY_ENTRY_PEAK_LIMIT);
  checkMaximum("receiptExpiryHeapOverhead", RECEIPT_HEAP_OVERHEAD_LIMIT);
  checkMaximum("receiptOldestHeapOverhead", RECEIPT_HEAP_OVERHEAD_LIMIT);
  checkMaximum("battleRecords", BATTLE_RECORD_LIMIT);
  checkMaximum("battleTrace", BATTLE_TRACE_LIMIT);
  checkMaximum("chatMessages", CHAT_MESSAGE_LIMIT);

  const durationSeconds = isFiniteMetricNumber(optionsValue.durationSeconds)
    ? Math.max(0, optionsValue.durationSeconds)
    : 0;
  const coverage = collections.sampleCoverage && typeof collections.sampleCoverage === "object"
    ? collections.sampleCoverage
    : {};
  if (durationSeconds >= QUICK_DURATION_SECONDS) {
    const minimumSamples = Math.floor(durationSeconds * 0.9);
    if (!isFiniteMetricNumber(coverage.sampleCount) || coverage.sampleCount < minimumSamples) {
      failures.push(`collection sample coverage ${String(coverage.sampleCount)}/${minimumSamples}`);
    }
    if (!isFiniteMetricNumber(coverage.firstElapsedMs) || coverage.firstElapsedMs > 2 * METRIC_SAMPLE_MS) {
      failures.push(`collection first sample coverage ${String(coverage.firstElapsedMs)}ms > ${2 * METRIC_SAMPLE_MS}ms`);
    }
    const minimumLastElapsedMs = durationSeconds * 1000 - 2 * METRIC_SAMPLE_MS;
    if (!isFiniteMetricNumber(coverage.lastElapsedMs) || coverage.lastElapsedMs < minimumLastElapsedMs) {
      failures.push(`collection last sample coverage ${String(coverage.lastElapsedMs)}ms < ${minimumLastElapsedMs}ms`);
    }
    for (const field of COLLECTION_REQUIRED_NUMERIC_FIELDS) {
      const count = coverage.numericSampleCounts && coverage.numericSampleCounts[field];
      if (!isFiniteMetricNumber(count) || count !== coverage.sampleCount) {
        failures.push(`collection ${field} numeric samples ${String(count)}/${String(coverage.sampleCount)}`);
      }
    }
  }
  if (durationSeconds >= FULL_DURATION_SECONDS) {
    const minimumSteadySamples = Math.floor((durationSeconds - 10 * 60) * 0.9);
    if (!isFiniteMetricNumber(coverage.steadySampleCount) || coverage.steadySampleCount < minimumSteadySamples) {
      failures.push(`collection steady sample coverage ${String(coverage.steadySampleCount)}/${minimumSteadySamples}`);
    }
    if (!isFiniteMetricNumber(coverage.steadyFirstElapsedMs) || coverage.steadyFirstElapsedMs > 10 * 60 * 1000 + 2 * METRIC_SAMPLE_MS) {
      failures.push(`collection steady first sample ${String(coverage.steadyFirstElapsedMs)}ms is too late`);
    }
    const minimumSteadyLastElapsedMs = durationSeconds * 1000 - 2 * METRIC_SAMPLE_MS;
    if (!isFiniteMetricNumber(coverage.steadyLastElapsedMs) || coverage.steadyLastElapsedMs < minimumSteadyLastElapsedMs) {
      failures.push(`collection steady last sample ${String(coverage.steadyLastElapsedMs)}ms < ${minimumSteadyLastElapsedMs}ms`);
    }
    for (const field of COLLECTION_REQUIRED_NUMERIC_FIELDS) {
      const count = coverage.steadyNumericSampleCounts && coverage.steadyNumericSampleCounts[field];
      if (!isFiniteMetricNumber(count) || count !== coverage.steadySampleCount) {
        failures.push(`collection steady ${field} numeric samples ${String(count)}/${String(coverage.steadySampleCount)}`);
      }
    }
  }

  const correctness = correctnessValue && typeof correctnessValue === "object" ? correctnessValue : {};
  const expectedBattleRecords = isFiniteMetricNumber(first.battleRecords)
    ? Math.min(BATTLE_RECORD_LIMIT, first.battleRecords + Math.max(0, Number(correctness.battleRoomsClosed || 0)))
    : null;
  if (expectedBattleRecords !== null && isFiniteMetricNumber(last.battleRecords) && last.battleRecords !== expectedBattleRecords) {
    failures.push(`battle records ${last.battleRecords}/${expectedBattleRecords} closed rooms`);
  }
  const businessChatRows = Number(
    businessEventsValue
    && businessEventsValue.domains
    && businessEventsValue.domains.chat
    && businessEventsValue.domains.chat.count
    || 0
  );
  const expectedChatMessages = Math.min(
    CHAT_MESSAGE_LIMIT,
    Math.max(0, Number(correctness.chatAccepted || 0)) + Math.max(0, businessChatRows),
  );
  if (isFiniteMetricNumber(last.chatMessages) && last.chatMessages !== expectedChatMessages) {
    failures.push(`chat messages ${last.chatMessages}/${expectedChatMessages} accepted writes`);
  }
  const requiredCheckpointDelta = Math.floor(Math.max(0, Number(correctness.assetWrites || 0)) / 1024);
  if (
    isFiniteMetricNumber(first.receiptCheckpoints)
    && isFiniteMetricNumber(last.receiptCheckpoints)
    && last.receiptCheckpoints - first.receiptCheckpoints !== requiredCheckpointDelta
  ) {
    failures.push(`receipt checkpoint delta ${last.receiptCheckpoints - first.receiptCheckpoints}/${requiredCheckpointDelta}`);
  }
  const traceEvidence = Number(correctness.battleRoomsStarted || 0)
    + Number(correctness.battleRoomsClosed || 0)
    + Number(correctness.battleRoundsResolved || 0);
  if (
    Number(optionsValue.durationSeconds || 0) >= FULL_DURATION_SECONDS
    && traceEvidence >= BATTLE_TRACE_LIMIT
    && isFiniteMetricNumber(last.battleTrace)
    && last.battleTrace !== BATTLE_TRACE_LIMIT
  ) {
    failures.push(`battle trace ${last.battleTrace}/${BATTLE_TRACE_LIMIT} after ${traceEvidence} trace-producing actions`);
  }
  return failures;
}

function applyGateChecks(result, options, failures, warnings) {
  if (!result) {
    return;
  }
  const thresholds = gateThresholds();
  for (const message of capacityDurationFailures(result, options)) {
    pushFailure(failures, message);
  }
  check(failures, result.initializedPositions === ACCOUNT_COUNT, `initialized positions ${result.initializedPositions}/${ACCOUNT_COUNT}`);
  check(failures, result.initializedConnections === ACCOUNT_COUNT, `initialized websocket clients ${result.initializedConnections}/${ACCOUNT_COUNT}`);
  check(failures, result.correctness.assetDuplicateApplications === 0, `asset duplicate applications ${result.correctness.assetDuplicateApplications}`);
  check(failures, result.correctness.finalProfilesReconciled === ACCOUNT_COUNT, `final profiles reconciled ${result.correctness.finalProfilesReconciled}/${ACCOUNT_COUNT}`);
  check(failures, result.correctness.finalPartiesReconciled === BATTLE_GROUP_COUNT + CHURN_GROUP_COUNT, `final parties reconciled ${result.correctness.finalPartiesReconciled}/${BATTLE_GROUP_COUNT + CHURN_GROUP_COUNT}`);
  check(failures, result.correctness.finalBattleMembersReconciled === BATTLE_ACTIVE_GROUPS * BATTLE_GROUP_SIZE, `final battle members reconciled ${result.correctness.finalBattleMembersReconciled}/${BATTLE_ACTIVE_GROUPS * BATTLE_GROUP_SIZE}`);
  check(failures, result.reconciliationSource === RECONCILIATION_SOURCE, `unexpected reconciliation source ${result.reconciliationSource}`);
  check(failures, result.correctness.reconciliationDurableSideEffects === 0, `reconciliation durable side effects ${result.correctness.reconciliationDurableSideEffects}`);
  check(failures, result.correctness.reconciliationStoreWrites === 0, `reconciliation store writes ${result.correctness.reconciliationStoreWrites}`);
  check(failures, metricEquals(result.finalClients && result.finalClients.active, ACCOUNT_COUNT), `active final clients ${String(result.finalClients && result.finalClients.active)}/${ACCOUNT_COUNT}`);
  check(failures, metricEquals(result.finalClients && result.finalClients.uniqueIndexes, ACCOUNT_COUNT), `unique final client indexes ${String(result.finalClients && result.finalClients.uniqueIndexes)}/${ACCOUNT_COUNT}`);
  check(failures, metricEquals(result.finalClients && result.finalClients.uniqueExpectedAccounts, ACCOUNT_COUNT), `unique expected final client accounts ${String(result.finalClients && result.finalClients.uniqueExpectedAccounts)}/${ACCOUNT_COUNT}`);
  check(failures, metricEquals(result.finalClients && result.finalClients.uniqueReadyAccounts, ACCOUNT_COUNT), `unique ready final client accounts ${String(result.finalClients && result.finalClients.uniqueReadyAccounts)}/${ACCOUNT_COUNT}`);
  check(failures, metricEquals(result.finalClients && result.finalClients.identityMatches, ACCOUNT_COUNT), `final client identity matches ${String(result.finalClients && result.finalClients.identityMatches)}/${ACCOUNT_COUNT}`);
  check(failures, metricEquals(result.finalClients && result.finalClients.held, 0), `held final clients ${String(result.finalClients && result.finalClients.held)}`);
  check(failures, metricEquals(result.finalClients && result.finalClients.paused, 0), `paused final clients ${String(result.finalClients && result.finalClients.paused)}`);
  check(failures, result.coordination && result.coordination.businessActive === false, "business probe coordination remained active at final reconciliation");
  check(failures, result.coordination && result.coordination.sentinelActive === false, "presence sentinel coordination remained active at final reconciliation");
  check(failures, metricEquals(result.coordination && result.coordination.reconnectActive, 0), `reconnect coordination remained active ${String(result.coordination && result.coordination.reconnectActive)}`);
  check(failures, result.websocket.eventSeqRegressions === 0, `event sequence regressions ${result.websocket.eventSeqRegressions}`);
  check(failures, result.websocket.eventSeqDuplicates === 0, `event sequence duplicates ${result.websocket.eventSeqDuplicates}`);
  check(failures, result.websocket.presenceRevisionRegressions === 0, `presence revision regressions ${result.websocket.presenceRevisionRegressions}`);
  check(failures, result.websocket.protocolErrors === 0, `legitimate websocket protocol errors ${result.websocket.protocolErrors}`);
  check(failures, result.websocket.unexpectedCloseCount === 0, `unexpected websocket closes ${result.websocket.unexpectedCloseCount}`);
  check(failures, result.correctness.attackUnexpectedResults === 0, `unexpected security attack results ${result.correctness.attackUnexpectedResults}`);
  check(failures, result.correctness.schedulerBackpressureTicks === 0, `scheduler backpressure ticks ${result.correctness.schedulerBackpressureTicks}`);
  const sentinelRow = result.latency && result.latency.ws_sentinel_last || null;
  const sentinelRequired = sentinelSampleRequirements(options);
  check(failures, Number(sentinelRow && sentinelRow.count || 0) >= sentinelRequired.total, `WS sentinel samples ${Number(sentinelRow && sentinelRow.count || 0)}/${sentinelRequired.total}`);
  if (sentinelRequired.first > 0 || sentinelRequired.last > 0) {
    check(failures, Number(sentinelRow && sentinelRow.first && sentinelRow.first.count || 0) >= sentinelRequired.first, `WS sentinel first-window samples ${Number(sentinelRow && sentinelRow.first && sentinelRow.first.count || 0)}/${sentinelRequired.first}`);
    check(failures, Number(sentinelRow && sentinelRow.last && sentinelRow.last.count || 0) >= sentinelRequired.last, `WS sentinel last-window samples ${Number(sentinelRow && sentinelRow.last && sentinelRow.last.count || 0)}/${sentinelRequired.last}`);
  }
  for (const message of businessEventCoverageFailures(result.businessEvents, options)) {
    pushFailure(failures, message);
  }
  if (options.durationSeconds >= QUICK_DURATION_SECONDS) {
    check(failures, result.websocket.receivedBatchFrames > 0, `received position batch frames ${result.websocket.receivedBatchFrames} <= 0`);
    check(
      failures,
      result.websocket.receivedBatchDeltas > result.websocket.receivedBatchFrames,
      `received position batch deltas/frames ${result.websocket.receivedBatchDeltas}/${result.websocket.receivedBatchFrames}`,
    );
    checkLatencyCategory(result, "movement", thresholds.runtimeHttpP95Ms, thresholds.runtimeHttpP99Ms, failures);
    checkLatencyCategory(result, "heartbeat", thresholds.runtimeHttpP95Ms, thresholds.runtimeHttpP99Ms, failures);
    for (const category of ["party_read", "market_read", "profile_read", "hotspot_enter", "hotspot_exit"]) {
      checkLatencyCategory(result, category, thresholds.runtimeHttpP95Ms, thresholds.runtimeHttpP99Ms, failures);
    }
    checkLatencyCategory(result, "health_read", thresholds.runtimeHttpP95Ms, thresholds.runtimeHttpP99Ms, failures);
    for (const category of ["chat_write", "party_write", "battle_command", "battle_write", "asset_write"]) {
      checkLatencyCategory(result, category, thresholds.durableHttpP95Ms, thresholds.durableHttpP99Ms, failures);
    }
    checkLatencyCategory(result, "ws_sentinel_last", thresholds.wsP95Ms, thresholds.wsP99Ms, failures);
    checkLatencyCategory(result, "ws_reconnect", thresholds.reconnectP95Ms, Math.max(5000, thresholds.reconnectP95Ms), failures);
  } else {
    for (const [category, row] of Object.entries(result.latency || {})) {
      check(failures, Number(row.failures || 0) === 0, `${category} legitimate failures ${row.failures}`);
    }
    warnings.push("development smoke validates contracts and cleanup only; latency thresholds require the 120-second quick gate");
  }
  check(failures, metricAtMost(result.durable.peakPending, thresholds.durablePeakPending), `durable peak pending ${String(result.durable.peakPending)} > ${thresholds.durablePeakPending}`);
  check(failures, metricAtMost(result.durable.stablePendingP95, 16), `durable stable pending p95 ${String(result.durable.stablePendingP95)} > 16`);
  check(failures, metricEquals(result.durable.finalPending, 0), `durable final pending ${String(result.durable.finalPending)} != 0`);
  check(failures, metricEquals(result.durable.queueFullDelta, 0), `storage queue full delta ${String(result.durable.queueFullDelta)} != 0`);
  check(failures, metricEquals(result.durable.timeoutDelta, 0), `storage timeout delta ${String(result.durable.timeoutDelta)} != 0`);
  check(failures, metricEquals(result.durable.failedDelta, 0), `storage failed delta ${String(result.durable.failedDelta)} != 0`);
  check(failures, metricEquals(result.eventStream.connectionsFinal, ACCOUNT_COUNT), `final websocket connections ${String(result.eventStream.connectionsFinal)}/${ACCOUNT_COUNT}`);
  check(failures, metricEquals(result.eventStream.establishedConnections, ACCOUNT_COUNT), `final established websocket connections ${String(result.eventStream.establishedConnections)}/${ACCOUNT_COUNT}`);
  check(failures, metricEquals(result.eventStream.establishedAccountKeys, ACCOUNT_COUNT), `final websocket account identities ${String(result.eventStream.establishedAccountKeys)}/${ACCOUNT_COUNT}`);
  check(failures, metricEquals(result.eventStream.establishedSessionKeys, ACCOUNT_COUNT), `final websocket session identities ${String(result.eventStream.establishedSessionKeys)}/${ACCOUNT_COUNT}`);
  check(failures, metricEquals(result.eventStream.establishedTokenKeys, ACCOUNT_COUNT), `final websocket token identities ${String(result.eventStream.establishedTokenKeys)}/${ACCOUNT_COUNT}`);
  check(failures, metricEquals(result.eventStream.pendingUpgrades, 0), `pending websocket upgrades ${String(result.eventStream.pendingUpgrades)}`);
  check(failures, metricEquals(result.eventStream.backpressureConnections, 0), `websocket backpressure connections ${String(result.eventStream.backpressureConnections)}`);
  check(failures, metricEquals(result.eventStream.queuedFrames, 0), `websocket frames did not drain ${String(result.eventStream.queuedFrames)}`);
  check(failures, metricEquals(result.eventStream.queuedBytes, 0), `websocket bytes did not drain ${String(result.eventStream.queuedBytes)}`);
  check(failures, metricEquals(result.eventStream.slowConsumerDisconnects, 0), `slow consumer disconnects ${String(result.eventStream.slowConsumerDisconnects)}`);
  check(failures, metricEquals(result.eventStream.heartbeatTimeouts, 0), `heartbeat timeouts ${String(result.eventStream.heartbeatTimeouts)}`);
  check(failures, result.health.postDrainSampleOk === true, "post-drain health sample is missing or failed");
  check(failures, metricEquals(result.health.transport.activeHttpFinal, 0), `HTTP work did not drain active=${String(result.health.transport.activeHttpFinal)}`);
  check(failures, result.health.authWork.activeFinal === 0 && result.health.authWork.queuedFinal === 0, `auth work did not drain active=${result.health.authWork.activeFinal} queued=${result.health.authWork.queuedFinal}`);
  const recordingStore = result.store && result.store.recording;
  check(failures, Boolean(recordingStore), "recording MySQL planner metrics are missing");
  if (recordingStore) {
    check(failures, recordingStore.realMysql === false, "capacity fixture unexpectedly used real MySQL");
    check(failures, metricEquals(recordingStore.activeTransactions, 0), `recording transactions still active ${String(recordingStore.activeTransactions)}`);
    check(failures, metricEquals(recordingStore.rollbackCount, 0), `recording rollbacks ${String(recordingStore.rollbackCount)}`);
    check(
      failures,
      isNonNegativeIntegerMetricNumber(recordingStore.transactionCount)
        && isNonNegativeIntegerMetricNumber(recordingStore.commitCount)
        && recordingStore.transactionCount === recordingStore.commitCount,
      `recording transactions/commits ${String(recordingStore.transactionCount)}/${String(recordingStore.commitCount)}`,
    );
    check(failures, metricAtMost(recordingStore.maxActiveTransactions, 1), `recording concurrent transactions ${String(recordingStore.maxActiveTransactions)} > 1`);
    check(failures, metricAtMost(recordingStore.maxStatementsPerTransaction, 64), `recording statements per transaction ${String(recordingStore.maxStatementsPerTransaction)} > 64`);
    for (const message of recordingScenarioDistributionFailures(recordingStore)) {
      pushFailure(failures, message);
    }
    for (const message of plannerTouchedRowFailures(recordingStore, thresholds.maxTouchedRowsPerTransaction)) {
      pushFailure(failures, message);
    }
    for (const [label, distribution] of [
      ["transaction SQL count", recordingStore.transactionSqlCount],
      ["transaction touched rows", recordingStore.transactionTouchedRows],
      ["planner/save latency", recordingStore.saveLatencyMs],
    ]) {
      check(
        failures,
        Boolean(distribution && isNonNegativeIntegerMetricNumber(distribution.count) && distribution.count > 0),
        `${label} scenario distribution is empty`,
      );
      if (options.durationSeconds >= FULL_DURATION_SECONDS && distribution) {
        const firstCount = distribution.first && distribution.first.count;
        const lastCount = distribution.last && distribution.last.count;
        check(failures, isNonNegativeIntegerMetricNumber(firstCount) && firstCount >= 10, `${label} first-window samples ${String(firstCount)}/10`);
        check(failures, isNonNegativeIntegerMetricNumber(lastCount) && lastCount >= 10, `${label} last-window samples ${String(lastCount)}/10`);
        if (
          distribution.first
          && distribution.last
          && isFiniteMetricNumber(distribution.first.p95)
          && isFiniteMetricNumber(distribution.last.p95)
        ) {
          const limit = Math.max(Number(distribution.first.p95) * 1.5, Number(distribution.first.p95) + 5);
          check(failures, Number(distribution.last.p95) <= limit, `${label} last-window p95 ${distribution.last.p95} > ${round(limit)}`);
        }
      }
    }
  }
  for (const message of assetCommitTimingFailures(
    result.assetCommitTiming,
    Number(result.correctness && result.correctness.assetWrites || 0),
  )) {
    pushFailure(failures, message);
  }
  for (const message of capacityHistoryEvidenceFailures(
    result.historyEvidence,
    result.fixture,
    result.correctness,
  )) {
    pushFailure(failures, message);
  }
  if (options.durationSeconds >= QUICK_DURATION_SECONDS) {
    for (const message of frameReuseFailures(result.eventStream, thresholds.frameReuseRatio)) {
      pushFailure(failures, message);
    }
    check(failures, result.eventStream.pendingPositionEvents === 0, `pending position fanout ${result.eventStream.pendingPositionEvents} != 0`);
    check(failures, result.eventStream.pendingPositionBatchClients === 0, `pending position batch clients ${result.eventStream.pendingPositionBatchClients} != 0`);
    check(failures, result.eventStream.pendingPositionBatchDeltas === 0, `pending position batch deltas ${result.eventStream.pendingPositionBatchDeltas} != 0`);
    check(failures, result.eventStream.currentPositionBatchBytes === 0, `pending position batch bytes ${result.eventStream.currentPositionBatchBytes} != 0`);
    check(failures, result.eventStream.combinedBufferedBytes === 0, `combined websocket buffered bytes ${result.eventStream.combinedBufferedBytes} != 0`);
    check(failures, result.eventStream.combinedQueuedFrames === 0, `combined websocket queued frames ${result.eventStream.combinedQueuedFrames} != 0`);
    check(failures, result.eventStream.peakClientCombinedBufferedBytes <= 256 * 1024, `peak client combined bytes ${result.eventStream.peakClientCombinedBufferedBytes} > ${256 * 1024}`);
    check(failures, result.eventStream.peakClientCombinedQueuedFrames <= 128, `peak client combined frames ${result.eventStream.peakClientCombinedQueuedFrames} > 128`);
    check(failures, result.eventStream.positionBatch.deltas > 0, `position batch deltas ${result.eventStream.positionBatch.deltas} <= 0`);
    check(
      failures,
      result.eventStream.positionBatch.frameReductionRatio >= MIN_POSITION_BATCH_FRAME_REDUCTION_RATIO,
      `position batch frame reduction ${result.eventStream.positionBatch.frameReductionRatio} < ${MIN_POSITION_BATCH_FRAME_REDUCTION_RATIO}`,
    );
    check(failures, result.eventStream.peakPendingPositionEvents <= thresholds.maxPendingPositionEvents, `peak pending position fanout ${result.eventStream.peakPendingPositionEvents} > ${thresholds.maxPendingPositionEvents}`);
    check(failures, result.eventStream.positionDrainTurns > 0, `position fanout drain turns ${result.eventStream.positionDrainTurns} <= 0`);
    check(failures, result.correctness.movementAccepted >= options.durationSeconds * 60, `movement throughput ${result.correctness.movementAccepted}/${options.durationSeconds * 60}`);
    check(failures, result.correctness.heartbeatsAccepted >= options.durationSeconds * 15, `heartbeat throughput ${result.correctness.heartbeatsAccepted}/${options.durationSeconds * 15}`);
    check(failures, result.correctness.partyPollAccepted >= options.durationSeconds * 15, `party read throughput ${result.correctness.partyPollAccepted}/${options.durationSeconds * 15}`);
    check(failures, result.correctness.marketPollAccepted >= options.durationSeconds * 0.8, `market read throughput ${result.correctness.marketPollAccepted}/${round(options.durationSeconds * 0.8)}`);
    check(failures, result.correctness.profilePollAccepted >= options.durationSeconds * 0.8, `profile read throughput ${result.correctness.profilePollAccepted}/${round(options.durationSeconds * 0.8)}`);
    check(failures, result.correctness.chatAccepted >= options.durationSeconds * 1.5, `chat throughput ${result.correctness.chatAccepted}/${round(options.durationSeconds * 1.5)}`);
    check(failures, result.correctness.assetWrites >= options.durationSeconds * 0.8, `asset throughput ${result.correctness.assetWrites}/${round(options.durationSeconds * 0.8)}`);
    check(failures, result.correctness.partyChurnCycles >= options.durationSeconds / 8, `party churn throughput ${result.correctness.partyChurnCycles}/${round(options.durationSeconds / 8)}`);
    check(failures, result.correctness.battleRoundsResolved >= options.durationSeconds * 0.35, `battle round throughput ${result.correctness.battleRoundsResolved}/${round(options.durationSeconds * 0.35)}`);
    check(failures, metricAtMost(result.scheduler.p95LagMs, TICK_MS), `load scheduler p95 lag ${String(result.scheduler.p95LagMs)}ms > ${TICK_MS}ms`);
    check(failures, metricAtMost(result.scheduler.maxLagMs, 1000), `load scheduler max lag ${String(result.scheduler.maxLagMs)}ms > 1000ms`);
    check(failures, metricEquals(result.scheduler.tickCount, result.scheduler.expectedTicks), `load scheduler ticks ${String(result.scheduler.tickCount)}/${String(result.scheduler.expectedTicks)}`);
    check(failures, metricEquals(result.scheduler.samples, result.scheduler.tickCount), `load scheduler lag samples ${String(result.scheduler.samples)}/${String(result.scheduler.tickCount)}`);
    check(failures, result.health.samples >= Math.floor(options.durationSeconds * 0.9), `health samples ${result.health.samples}/${options.durationSeconds}`);
    check(failures, result.health.storageOk === true, "cached storage health is not ready");
    check(failures, result.health.transport.rateLimitKeys <= result.health.transport.rateLimitMaxKeys, `HTTP rate-limit keys ${result.health.transport.rateLimitKeys}/${result.health.transport.rateLimitMaxKeys}`);
    check(failures, result.health.transport.rateLimitCapacityRejected === 0, `HTTP limiter key-capacity rejects ${result.health.transport.rateLimitCapacityRejected}`);
    check(failures, result.health.authWork.peakActive <= result.health.authWork.maxActive, `auth work peak active ${result.health.authWork.peakActive}/${result.health.authWork.maxActive}`);
    check(failures, result.health.authWork.peakQueued <= result.health.authWork.maxQueued, `auth work peak queued ${result.health.authWork.peakQueued}/${result.health.authWork.maxQueued}`);
    check(failures, result.health.authWork.rejected === 0, `auth work queue rejects ${result.health.authWork.rejected}`);
    const expectedCheckpoints = Math.max(1, Math.ceil(options.durationSeconds / 60) - 1);
    check(failures, result.correctness.authorityCheckpoints >= expectedCheckpoints, `authority checkpoints ${result.correctness.authorityCheckpoints}/${expectedCheckpoints}`);
    for (const message of checkpointCoverageFailures(result.checkpointCoverage, expectedCheckpoints)) {
      pushFailure(failures, message);
    }
    const expectedHotspotTransitions = options.durationSeconds >= FULL_DURATION_SECONDS ? 10 : 2;
    check(failures, result.correctness.hotspotTransitions >= expectedHotspotTransitions, `AOI hotspot transitions ${result.correctness.hotspotTransitions}/${expectedHotspotTransitions}`);
    check(failures, result.correctness.hotspotRadiusUpdates + result.correctness.hotspotSkippedPaused >= expectedHotspotTransitions * ACCOUNT_COUNT, `AOI hotspot accounted radius updates ${result.correctness.hotspotRadiusUpdates}+${result.correctness.hotspotSkippedPaused}/${expectedHotspotTransitions * ACCOUNT_COUNT}`);
    check(failures, result.correctness.staleCursorResets >= 1, `stale cursor resets ${result.correctness.staleCursorResets} < 1`);
    const requiredStorms = options.durationSeconds >= FULL_DURATION_SECONDS
      ? [{id: "storm_50", count: 50, limitMs: 5000}, {id: "storm_200", count: 200, limitMs: 10000}]
      : [{id: "quick_storm_50", count: 50, limitMs: 5000}];
    for (const required of requiredStorms) {
      const storm = result.storms.find((row) => row.id === required.id);
      check(failures, Boolean(storm), `missing reconnect storm ${required.id}`);
      if (storm) {
        check(failures, storm.count === required.count, `${required.id} reconnected ${storm.count}/${required.count}`);
        check(failures, metricAtMost(storm.recoveryMaxMsExcludingJitter, required.limitMs), `${required.id} recovery ${String(storm.recoveryMaxMsExcludingJitter)}ms > ${required.limitMs}ms excluding jitter`);
      }
    }
    if (!options.skipAttacks) {
      const requiredAttackCount = options.durationSeconds >= FULL_DURATION_SECONDS ? 2 : 1;
      check(failures, result.attacks.length >= requiredAttackCount, `security attack bursts ${result.attacks.length}/${requiredAttackCount}`);
      check(failures, result.correctness.attackExpectedRejects >= requiredAttackCount * 4, `expected attack isolations ${result.correctness.attackExpectedRejects}/${requiredAttackCount * 4}`);
      check(failures, result.eventStream.protocolViolations >= requiredAttackCount, `recorded WS protocol violations ${result.eventStream.protocolViolations}/${requiredAttackCount}`);
      check(failures, result.eventStream.cursorResets >= requiredAttackCount + 1, `recorded cursor resets ${result.eventStream.cursorResets}/${requiredAttackCount + 1}`);
    }
    for (const message of capacityMemoryFailures(result.memory, options, thresholds)) {
      pushFailure(failures, message);
    }
    for (const message of eventLoopSampleFailures(result.eventLoop, options)) {
      pushFailure(failures, message);
    }
    check(failures, metricAtMost(result.eventLoop.p95Ms, thresholds.eventLoopP95Ms), `event-loop p95 ${String(result.eventLoop.p95Ms)}ms > ${thresholds.eventLoopP95Ms}ms`);
    check(failures, metricAtMost(result.eventLoop.p99Ms, thresholds.eventLoopP99Ms), `event-loop p99 ${String(result.eventLoop.p99Ms)}ms > ${thresholds.eventLoopP99Ms}ms`);
    check(failures, metricAtMost(result.eventLoop.maxMs, thresholds.eventLoopMaxMs), `event-loop max ${String(result.eventLoop.maxMs)}ms > ${thresholds.eventLoopMaxMs}ms`);
  } else if (!options.skipAttacks && options.durationSeconds >= 5) {
    check(failures, result.attacks.length >= 1, `development security attack bursts ${result.attacks.length}/1`);
    check(failures, result.correctness.attackExpectedRejects >= 4, `development expected attack isolations ${result.correctness.attackExpectedRejects}/4`);
    check(failures, result.eventStream.protocolViolations >= 1, `development recorded WS protocol violations ${result.eventStream.protocolViolations}/1`);
    check(failures, result.eventStream.cursorResets >= 1, `development recorded cursor resets ${result.eventStream.cursorResets}/1`);
  }
  if (options.durationSeconds >= FULL_DURATION_SECONDS) {
    check(failures, Boolean(result.collections && result.collections.available), "full gate is missing product collection cardinality metrics");
  } else if (!result.collections || !result.collections.available) {
    warnings.push("product collection cardinality metrics are not yet exposed; full gate will fail until the product adapter is wired");
  }
  if (result.collections && result.collections.available) {
    for (const message of collectionCapacityFailures(
      result.collections,
      result.correctness,
      result.businessEvents,
      options,
    )) {
      pushFailure(failures, message);
    }
    const last = result.collections.last || {};
    check(failures, metricEquals(last.activeBattleRooms, BATTLE_ACTIVE_GROUPS), `active battle rooms ${String(last.activeBattleRooms)}/${BATTLE_ACTIVE_GROUPS}`);
    check(failures, metricAtMost(last.battleRoomRecoveries, 256), `battle room recoveries ${String(last.battleRoomRecoveries)} > 256`);
    check(failures, metricAtMost(last.battleRecoveryIndexedAccounts, ACCOUNT_COUNT), `battle recovery indexed accounts ${String(last.battleRecoveryIndexedAccounts)} > ${ACCOUNT_COUNT}`);
    check(failures, metricEquals(last.partyInvitesPending, 0), `pending party invites ${String(last.partyInvitesPending)}`);
    check(failures, metricEquals(last.partyInvitesTerminal, 0), `terminal party invites ${String(last.partyInvitesTerminal)}`);
    check(failures, metricEquals(last.battleInvitesPending, 0), `pending battle invites ${String(last.battleInvitesPending)}`);
    check(failures, metricEquals(last.battleInvitesTerminal, 0), `terminal battle invites ${String(last.battleInvitesTerminal)}`);
    check(failures, metricAtMost(last.authAttemptKeys, 50_000), `auth attempt keys ${String(last.authAttemptKeys)} > 50000`);
    check(failures, metricAtMost(last.authEvents, 500), `auth events ${String(last.authEvents)} > 500`);
    check(failures, metricEquals(last.sessions, ACCOUNT_COUNT), `sessions ${String(last.sessions)}/${ACCOUNT_COUNT}`);
    check(failures, metricAtMost(last.serviceEvents, 500), `service events ${String(last.serviceEvents)} > 500`);
    if (options.durationSeconds >= FULL_DURATION_SECONDS) {
      for (const message of fullCollectionStabilityFailures(result.collections)) {
        pushFailure(failures, message);
      }
    }
  }
  // Historical-degradation evidence is a full-gate property: only the 30
  // minute run contains the specified first/last five-minute windows. A 10s
  // smoke or 120s quick gate would compare unrelated two-second bursts.
  if (options.durationSeconds >= FULL_DURATION_SECONDS) {
    for (const message of fullLatencyTrendFailures(result.latency)) {
      pushFailure(failures, message);
    }
  }
}

function checkLatencyCategory(result, category, p95Limit, p99Limit, failures) {
  const row = result.latency && result.latency[category];
  if (!row || !isNonNegativeIntegerMetricNumber(row.count) || row.count === 0) {
    pushFailure(failures, `${category} latency samples are missing`);
    return;
  }
  check(failures, metricEquals(row.failures, 0), `${category} legitimate failures ${String(row.failures)}`);
  check(failures, metricAtMost(row.p95Ms, p95Limit), `${category} p95 ${String(row.p95Ms)}ms > ${p95Limit}ms`);
  check(failures, metricAtMost(row.p99Ms, p99Limit), `${category} p99 ${String(row.p99Ms)}ms > ${p99Limit}ms`);
}

function latencyTrendAllowance(category) {
  return RUNTIME_LATENCY_CATEGORIES.has(String(category || "")) ? 25 : 50;
}

function fullLatencyTrendFailures(latencyValue) {
  const latency = latencyValue && typeof latencyValue === "object" ? latencyValue : {};
  const required = new Set(FULL_TREND_REQUIRED_CATEGORIES);
  const categories = new Set([...Object.keys(latency), ...required]);
  const failures = [];
  for (const category of categories) {
    const row = latency[category];
    const firstCount = row && row.first && row.first.count;
    const lastCount = row && row.last && row.last.count;
    if (required.has(category) && (!metricAtLeast(firstCount, 10) || !metricAtLeast(lastCount, 10))) {
      failures.push(`${category} full-window samples first=${String(firstCount)}/10 last=${String(lastCount)}/10`);
      continue;
    }
    if (!row || !metricAtLeast(firstCount, 10) || !metricAtLeast(lastCount, 10)) {
      continue;
    }
    const firstP95 = row.first.p95Ms;
    const lastP95 = row.last.p95Ms;
    if (!isFiniteMetricNumber(firstP95) || !isFiniteMetricNumber(lastP95)) {
      failures.push(`${category} full-window p95 is missing or non-finite`);
      continue;
    }
    const allowance = latencyTrendAllowance(category);
    const limit = Math.max(firstP95 * 1.5, firstP95 + allowance);
    if (lastP95 > limit) {
      failures.push(`${category} last-window p95 ${row.last.p95Ms}ms > regression limit ${round(limit)}ms`);
    }
  }
  return failures;
}

function sentinelSampleRequirements(options) {
  const durationSeconds = Number(options && options.durationSeconds || 0);
  if (durationSeconds >= FULL_DURATION_SECONDS) {
    return {total: 100, first: 10, last: 10};
  }
  if (durationSeconds >= QUICK_DURATION_SECONDS) {
    return {total: 10, first: 0, last: 0};
  }
  return {total: 1, first: 0, last: 0};
}

function checkpointCoverageFailures(rowsValue, expectedCount) {
  const rows = Array.isArray(rowsValue) ? rowsValue : [];
  const failures = [];
  if (rows.length < expectedCount) {
    failures.push(`authority checkpoint coverage rows ${rows.length}/${expectedCount}`);
  }
  for (const row of rows) {
    const label = `authority checkpoint ${Number(row && row.index || 0)}`;
    if (!row || row.lockAcquired !== true) {
      failures.push(`${label} did not acquire its bounded lock`);
      continue;
    }
    if (Number(row.profilesChecked || 0) < ASSET_COUNT || Number(row.profilesPassed || 0) < ASSET_COUNT) {
      failures.push(`${label} asset profiles ${Number(row.profilesPassed || 0)}/${Number(row.profilesChecked || 0)}/${ASSET_COUNT}`);
    }
    if (Number(row.partiesChecked || 0) < BATTLE_GROUP_COUNT + CHURN_GROUP_COUNT || Number(row.partiesPassed || 0) < BATTLE_GROUP_COUNT + CHURN_GROUP_COUNT) {
      failures.push(`${label} parties ${Number(row.partiesPassed || 0)}/${Number(row.partiesChecked || 0)}/${BATTLE_GROUP_COUNT + CHURN_GROUP_COUNT}`);
    }
    if (Number(row.battlesChecked || 0) < BATTLE_ACTIVE_GROUPS || Number(row.battlesPassed || 0) < BATTLE_ACTIVE_GROUPS) {
      failures.push(`${label} active battles ${Number(row.battlesPassed || 0)}/${Number(row.battlesChecked || 0)}/${BATTLE_ACTIVE_GROUPS}`);
    }
  }
  return failures;
}

function businessEventCoverageFailures(summaryValue, options) {
  const summary = summaryValue && typeof summaryValue === "object" ? summaryValue : {};
  const rows = Array.isArray(summary.rows) ? summary.rows : [];
  const durationSeconds = Number(options && options.durationSeconds || 0);
  const requirements = durationSeconds >= FULL_DURATION_SECONDS
    ? {chat: 60, party: 30, battle: 30, chatWindow: 10, domainWindow: 5, channel: 30}
    : (durationSeconds >= QUICK_DURATION_SECONDS
      ? {chat: 4, party: 2, battle: 2, chatWindow: 0, domainWindow: 0, channel: 2}
      : {chat: 2, party: 1, battle: 1, chatWindow: 0, domainWindow: 0, channel: 1});
  const failures = [];
  if (!metricEquals(summary.active, 0)) {
    failures.push(`business WS expectations still active ${summary.active}`);
  }
  for (const domain of ["chat", "party", "battle"]) {
    const domainSummary = summary.domains && summary.domains[domain] || {};
    if (!metricAtLeast(domainSummary.count, requirements[domain])) {
      failures.push(`business WS ${domain} samples ${String(domainSummary.count)}/${requirements[domain]}`);
    }
    for (const field of ["missing", "unexpected", "duplicates", "timeouts", "cancelled"]) {
      if (!metricEquals(domainSummary[field], 0)) {
        failures.push(`business WS ${domain} ${field} ${domainSummary[field]}`);
      }
    }
    if (durationSeconds >= FULL_DURATION_SECONDS) {
      const windowMinimum = domain === "chat" ? requirements.chatWindow : requirements.domainWindow;
      if (!metricAtLeast(domainSummary.firstCount, windowMinimum)) {
        failures.push(`business WS ${domain} first-window samples ${String(domainSummary.firstCount)}/${windowMinimum}`);
      }
      if (!metricAtLeast(domainSummary.lastCount, windowMinimum)) {
        failures.push(`business WS ${domain} last-window samples ${String(domainSummary.lastCount)}/${windowMinimum}`);
      }
    }
  }
  const chatChannels = summary.domains && summary.domains.chat && summary.domains.chat.channelCounts || {};
  for (const channel of ["nearby", "team"]) {
    if (!metricAtLeast(chatChannels[channel], requirements.channel)) {
      failures.push(`business WS chat ${channel} samples ${String(chatChannels[channel])}/${requirements.channel}`);
    }
  }
  for (const row of rows) {
    const targetMinimum = Math.max(1, Number(row.minimumExpectedTargets || BATTLE_GROUP_SIZE));
    if (Number(row.expectedTargets || 0) < targetMinimum) {
      failures.push(`business WS ${row.domain}/${row.channel} ${row.probeId} targets ${Number(row.expectedTargets || 0)}/${targetMinimum}`);
    }
    if (Number(row.missing || 0) !== 0 || Number(row.unexpected || 0) !== 0 || Number(row.duplicates || 0) !== 0 || Number(row.timeouts || 0) !== 0 || Number(row.cancelled || 0) !== 0) {
      failures.push(`business WS ${row.domain}/${row.channel} ${row.probeId} delivery was not exact`);
    }
  }
  return failures;
}

function businessEventSummaryFromRows(rowsValue, durationMs, active = 0) {
  const rows = Array.isArray(rowsValue) ? rowsValue : [];
  const normalizedDurationMs = isFiniteMetricNumber(durationMs) && durationMs > 0 ? durationMs : 1;
  const windowMs = Math.max(1000, Math.min(5 * 60 * 1000, normalizedDurationMs * 0.2));
  const firstWindowStartMs = normalizedDurationMs >= FULL_DURATION_SECONDS * 1000 ? 5 * 60 * 1000 : 0;
  const domains = {};
  for (const domain of ["chat", "party", "battle"]) {
    const domainRows = rows.filter((row) => row.domain === domain);
    const first = domainRows.filter((row) => (
      isFiniteMetricNumber(row.elapsedMs)
      && row.elapsedMs >= firstWindowStartMs
      && row.elapsedMs < firstWindowStartMs + windowMs
    ));
    const last = domainRows.filter((row) => (
      isFiniteMetricNumber(row.elapsedMs)
      && row.elapsedMs >= normalizedDurationMs - windowMs
      && row.elapsedMs <= normalizedDurationMs
    ));
    domains[domain] = {
      count: domainRows.length,
      missing: sum(domainRows.map((row) => row.missing)),
      unexpected: sum(domainRows.map((row) => row.unexpected)),
      duplicates: sum(domainRows.map((row) => row.duplicates)),
      timeouts: sum(domainRows.map((row) => row.timeouts)),
      cancelled: sum(domainRows.map((row) => row.cancelled)),
      firstCount: first.length,
      lastCount: last.length,
      channelCounts: Object.fromEntries(countBy(domainRows.map((row) => row.channel))),
    };
  }
  return {
    windowSeconds: round(windowMs / 1000),
    firstWindowStartSeconds: round(firstWindowStartMs / 1000),
    rows: rows.slice(),
    domains,
    active: Number(active || 0),
  };
}

function eventLoopSummary(samples, maxSampleOverride = null) {
  const rows = Array.isArray(samples) ? samples : [];
  const validRows = rows.filter(eventLoopMetricRowIsValid);
  const p95Rows = validRows.map((row) => row.eventLoop.p95Ms);
  const p99Rows = validRows.map((row) => row.eventLoop.p99Ms);
  const validRowSet = new Set(validRows);
  let maxRow = null;
  let maxRowIndex = -1;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!validRowSet.has(row)) {
      continue;
    }
    if (!maxRow || row.eventLoop.maxMs > maxRow.eventLoop.maxMs) {
      maxRow = row;
      maxRowIndex = index;
    }
  }
  const overrideMatchesMaximum = Boolean(
    maxRow
      && maxSampleOverride
      && isFiniteMetricNumber(maxSampleOverride.eventLoop && maxSampleOverride.eventLoop.maxMs)
      && Number(maxSampleOverride.eventLoop.maxMs) === Number(maxRow.eventLoop.maxMs),
  );
  return {
    sampleCount: rows.length,
    validSampleCount: validRows.length,
    invalidSampleCount: rows.length - validRows.length,
    p95Ms: p95Rows.length > 0 ? percentile(p95Rows, 0.95) : null,
    p99Ms: p99Rows.length > 0 ? percentile(p99Rows, 0.99) : null,
    maxMs: maxRow ? round(maxRow.eventLoop.maxMs) : null,
    maxSample: overrideMatchesMaximum
      ? maxSampleOverride
      : (maxRow ? eventLoopMaxSample(maxRow, maxRowIndex > 0 ? rows[maxRowIndex - 1] : null) : null),
    utilizationP95: validRows.length > 0
      ? percentile(validRows.map((row) => Number(row.eventLoop.utilization)), 0.95)
      : null,
    cpuPercentP95: validRows.length > 0
      ? percentile(validRows.map((row) => Number(row.cpuPercent)), 0.95)
      : null,
  };
}

function eventLoopMetricRowIsValid(row) {
  return (
    isFiniteMetricNumber(row && row.eventLoop && row.eventLoop.p95Ms)
    && row.eventLoop.p95Ms > 0
    && isFiniteMetricNumber(row.eventLoop.p99Ms)
    && row.eventLoop.p99Ms > 0
    && isFiniteMetricNumber(row.eventLoop.maxMs)
    && row.eventLoop.maxMs > 0
    && isFiniteMetricNumber(row.eventLoop.utilization)
    && row.eventLoop.utilization > 0
  );
}

function eventLoopMaxSample(row, previousRow = null) {
  const sample = row && typeof row === "object" ? row : {};
  const eventLoop = sample.eventLoop && typeof sample.eventLoop === "object" ? sample.eventLoop : {};
  const objectOrNull = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;
  const numberOrNull = (value) => isFiniteMetricNumber(value) ? round(value) : null;
  return {
    elapsedMs: numberOrNull(sample.elapsedMs),
    window: {
      startedAtElapsedMs: numberOrNull(eventLoop.windowStartedAtElapsedMs),
      endedAtElapsedMs: numberOrNull(eventLoop.windowEndedAtElapsedMs),
      durationMs: numberOrNull(eventLoop.windowDurationMs),
    },
    cpuPercent: numberOrNull(sample.cpuPercent),
    memory: objectOrNull(sample.memory),
    memorySampling: objectOrNull(sample.memorySampling),
    resourceUsage: objectOrNull(sample.resourceUsage),
    resourceUsageDelta: resourceUsageDelta(sample.resourceUsage, previousRow && previousRow.resourceUsage),
    eventLoop: objectOrNull(sample.eventLoop),
    gc: objectOrNull(sample.gc),
    durable: objectOrNull(sample.durable),
    eventStream: objectOrNull(sample.eventStream),
    transport: objectOrNull(sample.transport),
  };
}

function resourceUsageDelta(currentValue, previousValue) {
  const current = currentValue && typeof currentValue === "object" && !Array.isArray(currentValue) ? currentValue : null;
  const previous = previousValue && typeof previousValue === "object" && !Array.isArray(previousValue) ? previousValue : null;
  if (!current || !previous) {
    return null;
  }
  const result = {};
  for (const [key, value] of Object.entries(current)) {
    const currentNumber = Number(value);
    const previousNumber = Number(previous[key]);
    if (Number.isFinite(currentNumber) && Number.isFinite(previousNumber)) {
      result[key] = round(currentNumber - previousNumber);
    }
  }
  return result;
}

function eventLoopSampleFailures(summaryValue, optionsValue) {
  const summary = summaryValue && typeof summaryValue === "object" ? summaryValue : {};
  const expectedSamples = Math.floor(Number(optionsValue && optionsValue.durationSeconds || 0) * 0.9);
  const failures = [];
  if (!isNonNegativeIntegerMetricNumber(summary.sampleCount) || summary.sampleCount < expectedSamples) {
    failures.push(`event-loop samples ${String(summary.sampleCount)}/${expectedSamples}`);
  }
  if (
    !isNonNegativeIntegerMetricNumber(summary.validSampleCount)
    || summary.validSampleCount !== summary.sampleCount
    || summary.invalidSampleCount !== 0
  ) {
    failures.push(`event-loop valid/total/invalid ${String(summary.validSampleCount)}/${String(summary.sampleCount)}/${String(summary.invalidSampleCount)}`);
  }
  for (const field of ["p95Ms", "p99Ms", "maxMs"]) {
    if (!isFiniteMetricNumber(summary[field]) || summary[field] <= 0) {
      failures.push(`event-loop ${field} is missing, non-finite, or non-positive`);
    }
  }
  return failures;
}

function durableSummary(samples, finalMetrics) {
  const durableRows = samples.map((row) => row.durable || {});
  const first = durableRows[0] || {};
  const final = finalMetrics && finalMetrics.durable || durableRows.at(-1) || {};
  return {
    peakPending: Math.max(0, ...durableRows.map((row) => Number(row.pending || 0))),
    stablePendingP95: percentile(durableRows.map((row) => Number(row.pending || 0)), 0.95),
    finalPending: Number(final.pending || 0),
    acceptedDelta: Number(final.accepted || 0) - Number(first.accepted || 0),
    completedDelta: Number(final.completed || 0) - Number(first.completed || 0),
    queueFullDelta: Number(final.queueFull || 0) - Number(first.queueFull || 0),
    timeoutDelta: Number(final.timeouts || 0) - Number(first.timeouts || 0),
    failedDelta: Number(final.failed || 0) - Number(first.failed || 0),
    precommitAverageMs: Number(final.precommitAverageMs || 0),
    precommitMaxMs: Number(final.precommitMaxMs || 0),
    precommitByMethod: final.precommitByMethod || {},
  };
}

function finalClientSummary(clientsValue, heldClientsValue, pausedAccountsValue) {
  const clients = Array.isArray(clientsValue) ? clientsValue : [];
  const heldClients = heldClientsValue && typeof heldClientsValue.size === "number" ? heldClientsValue : new Map();
  const pausedAccounts = pausedAccountsValue && typeof pausedAccountsValue.size === "number" ? pausedAccountsValue : new Set();
  const activeRows = clients.map((client, index) => {
    const readyAccountId = String(client && client.ready && client.ready.account && client.ready.account.accountId || "");
    const expectedAccountId = String(client && client.expectedAccountId || "");
    const active = Boolean(
      client
      && client.upgraded
      && client.bootstrapAt > 0
      && client.ready
      && client.snapshot
      && !client.closed
      && client.socket
      && !client.socket.destroyed
    );
    return {index, active, expectedAccountId, readyAccountId};
  }).filter((row) => row.active);
  return {
    expected: clients.length,
    active: activeRows.length,
    uniqueIndexes: new Set(activeRows.map((row) => row.index)).size,
    uniqueExpectedAccounts: new Set(activeRows.map((row) => row.expectedAccountId).filter(Boolean)).size,
    uniqueReadyAccounts: new Set(activeRows.map((row) => row.readyAccountId).filter(Boolean)).size,
    identityMatches: activeRows.filter((row) => row.expectedAccountId !== "" && row.readyAccountId === row.expectedAccountId).length,
    held: heldClients.size,
    paused: pausedAccounts.size,
  };
}

function eventStreamSummary(samples, finalMetrics) {
  const rows = samples.map((row) => row.eventStream || {});
  const final = finalMetrics && finalMetrics.eventStream || rows.at(-1) || {};
  const eventTypes = final.eventTypes && typeof final.eventTypes === "object" && !Array.isArray(final.eventTypes)
    ? final.eventTypes
    : {};
  const positionWire = eventTypes["online.position"] && typeof eventTypes["online.position"] === "object"
    ? eventTypes["online.position"]
    : {};
  return {
    connectionsMin: rows.length > 0 ? Math.min(...rows.map((row) => Number(row.connections || row.clients || 0))) : 0,
    connectionsMax: Math.max(0, ...rows.map((row) => Number(row.connections || row.clients || 0))),
    connectionsFinal: Number(final.connections ?? final.clients ?? 0),
    establishedConnections: Number(final.establishedConnections || 0),
    establishedAccountKeys: Number(final.establishedAccountKeys || 0),
    establishedSessionKeys: Number(final.establishedSessionKeys || 0),
    establishedTokenKeys: Number(final.establishedTokenKeys || 0),
    pendingUpgrades: Number(final.pendingUpgrades || 0),
    rejectedUpgrades: Number(final.rejectedUpgrades || 0),
    upgradeRejectReasons: final.upgradeRejectReasons || {},
    backpressureConnections: Number(final.backpressureConnections || 0),
    queuedFrames: Number(final.queuedFrames || 0),
    queuedBytes: Number(final.queuedBytes || 0),
    peakQueuedFrames: Number(final.peakQueuedFrames || 0),
    maxClientQueuedFrames: Number(final.maxClientQueuedFrames || 0),
    peakQueuedBytes: Number(final.peakQueuedBytes || 0),
    slowConsumerDisconnects: Number(final.slowConsumerDisconnects || 0),
    inboundRateLimited: Number(final.inboundRateLimited || 0),
    protocolViolations: Number(final.protocolViolations || 0),
    oversizedInboundFrames: Number(final.oversizedInboundFrames || 0),
    heartbeatTimeouts: Number(final.heartbeatTimeouts || 0),
    cursorResets: Number(final.cursorResets || 0),
    sentFrames: Number(final.sentFrames || 0),
    sentBytes: Number(final.sentBytes || 0),
    encodedFrames: Number(final.encodedFrames || 0),
    encodedBytes: Number(final.encodedBytes || 0),
    reusedFrames: Number(final.reusedFrames || 0),
    reusedBytes: Number(final.reusedBytes || 0),
    pendingPositionEvents: Number(final.pendingPositionEvents || 0),
    peakPendingPositionEvents: Number(final.peakPendingPositionEvents || 0),
    positionEventsCoalesced: Number(final.positionEventsCoalesced || 0),
    positionDrainTurns: Number(final.positionDrainTurns || 0),
    positionDrainBudgetMs: Number(final.positionDrainBudgetMs || 0),
    positionDrainMaxMs: Number(final.positionDrainMaxMs || 0),
    positionEventsPerTurn: Number(final.positionEventsPerTurn || 0),
    positionClientsPerTurn: Number(final.positionClientsPerTurn || 0),
    activePositionJob: Number(final.activePositionJob || 0),
    positionClientsProcessed: Number(final.positionClientsProcessed || 0),
    pendingPositionBatchClients: Number(final.pendingPositionBatchClients || 0),
    pendingPositionBatchDeltas: Number(final.pendingPositionBatchDeltas || 0),
    positionBatchWindowMs: Number(final.positionBatchWindowMs || 0),
    positionBatchFlushes: Number(final.positionBatchFlushes || 0),
    positionBatchFlushMaxMs: Number(final.positionBatchFlushMaxMs || 0),
    positionBatchFlushClientsMax: Number(final.positionBatchFlushClientsMax || 0),
    positionBatchFlushGroupsMax: Number(final.positionBatchFlushGroupsMax || 0),
    currentPositionBatchBytes: Number(final.currentPositionBatchBytes || 0),
    peakPositionBatchBytes: Number(final.peakPositionBatchBytes || 0),
    combinedBufferedBytes: Number(final.combinedBufferedBytes || 0),
    maxClientCombinedBufferedBytes: Number(final.maxClientCombinedBufferedBytes || 0),
    peakClientCombinedBufferedBytes: Number(final.peakClientCombinedBufferedBytes || 0),
    combinedQueuedFrames: Number(final.combinedQueuedFrames || 0),
    maxClientCombinedQueuedFrames: Number(final.maxClientCombinedQueuedFrames || 0),
    peakClientCombinedQueuedFrames: Number(final.peakClientCombinedQueuedFrames || 0),
    positionBatch: {
      frames: Number(final.positionBatchFrames || 0),
      deltas: Number(final.positionBatchDeltas || 0),
      bytes: Number(final.positionBatchBytes || 0),
      encodedFrames: Number(final.positionBatchEncodedFrames || 0),
      encodedDeltas: Number(final.positionBatchEncodedDeltas || 0),
      encodedBytes: Number(final.positionBatchEncodedBytes || 0),
      reusedFrames: Number(final.positionBatchReusedFrames || 0),
      reusedDeltas: Number(final.positionBatchReusedDeltas || 0),
      reusedBytes: Number(final.positionBatchReusedBytes || 0),
      frameReductionRatio: safeRatio(
        Math.max(0, Number(final.positionBatchDeltas || 0) - Number(final.positionBatchFrames || 0)),
        Number(final.positionBatchDeltas || 0),
      ),
    },
    eventTypes,
    onlinePositionWire: {
      sentFrames: Number(positionWire.sentFrames || 0),
      sentBytes: Number(positionWire.sentBytes || 0),
      encodedFrames: Number(positionWire.encodedFrames || 0),
      encodedBytes: Number(positionWire.encodedBytes || 0),
      reusedFrames: Number(positionWire.reusedFrames || 0),
      reusedBytes: Number(positionWire.reusedBytes || 0),
    },
    frameReuseRatio: safeRatio(
      Number(final.reusedFrames || 0),
      Number(final.encodedFrames || 0) + Number(final.reusedFrames || 0),
    ),
  };
}

function healthSummary(samples, finalHealthResult = null, finalMetrics = null) {
  const rows = samples.map((row) => row.publicHealth).filter((row) => row && typeof row === "object");
  const lastPeriodic = rows.at(-1) || {};
  const postDrain = finalHealthResult && finalHealthResult.ok && finalHealthResult.json
    ? finalHealthResult.json
    : lastPeriodic;
  const finalTransport = finalMetrics && finalMetrics.transport
    ? finalMetrics.transport
    : (postDrain.transport || {});
  const transports = rows.map((row) => row.transport || {});
  const authWorkRows = rows.map((row) => row.authWork || {});
  const finalAuthWork = postDrain.authWork || {};
  return {
    samples: rows.length,
    postDrainSampleOk: Boolean(finalHealthResult && finalHealthResult.ok),
    storageOk: postDrain.storage && postDrain.storage.ok !== false,
    transport: {
      activeHttpFinal: Number(finalTransport.activeHttp || 0),
      peakActiveHttp: Math.max(Number(finalTransport.peakActiveHttp || 0), ...transports.map((row) => Number(row.peakActiveHttp || 0))),
      maxActiveHttp: Number(finalTransport.maxActiveHttp || 0),
      rejectedHttp: Number(finalTransport.rejectedHttp || 0),
      rateLimitKeys: Number(finalTransport.rateLimitKeys || 0),
      rateLimitMaxKeys: Number(finalTransport.rateLimitMaxKeys || 0),
      rateLimitRejected: Number(finalTransport.rateLimitRejected || 0),
      rateLimitCapacityRejected: Number(finalTransport.rateLimitCapacityRejected || 0),
    },
    authWork: {
      activeFinal: Number(finalAuthWork.active || 0),
      queuedFinal: Number(finalAuthWork.queued || 0),
      maxActive: Number(finalAuthWork.maxActive || 0),
      maxQueued: Number(finalAuthWork.maxQueued || 0),
      peakActive: Math.max(Number(finalAuthWork.peakActive || 0), ...authWorkRows.map((row) => Number(row.peakActive || 0))),
      peakQueued: Math.max(Number(finalAuthWork.peakQueued || 0), ...authWorkRows.map((row) => Number(row.peakQueued || 0))),
      completed: Number(finalAuthWork.completed || 0),
      rejected: Number(finalAuthWork.rejected || 0),
    },
    authSecurity: postDrain.authSecurity || {},
    healthProbe: postDrain.healthProbe || {},
  };
}

function compactMetricTimeline(samples, collectionSnapshots = null) {
  const rows = Array.isArray(samples) ? samples : [];
  return rows.map((row, index) => ({row, index}))
    .filter(({index}) => index === 0 || index === rows.length - 1 || (index + 1) % 30 === 0)
    .map(({row, index}) => ({
    elapsedMs: row.elapsedMs,
    cpuPercent: row.cpuPercent,
    heapMiB: round(bytesToMiB(row.memory && row.memory.heapUsed || 0)),
    rssMiB: round(bytesToMiB(row.memory && row.memory.rss || 0)),
    externalMiB: round(bytesToMiB(row.memory && row.memory.external || 0)),
    arrayBuffersMiB: round(bytesToMiB(row.memory && row.memory.arrayBuffers || 0)),
    eventLoopP95Ms: row.eventLoop && row.eventLoop.p95Ms,
    eventLoopP99Ms: row.eventLoop && row.eventLoop.p99Ms,
    eventLoopMaxMs: row.eventLoop && row.eventLoop.maxMs,
    durablePending: row.durable && row.durable.pending,
    websocketConnections: row.eventStream && row.eventStream.connections,
    websocketQueuedFrames: row.eventStream && row.eventStream.queuedFrames,
    websocketEncodedFrames: row.eventStream && row.eventStream.encodedFrames,
    websocketReusedFrames: row.eventStream && row.eventStream.reusedFrames,
    transportRateLimitKeys: row.publicHealth && row.publicHealth.transport && row.publicHealth.transport.rateLimitKeys,
    authWorkActive: row.publicHealth && row.publicHealth.authWork && row.publicHealth.authWork.active,
    authWorkQueued: row.publicHealth && row.publicHealth.authWork && row.publicHealth.authWork.queued,
    collections: collectionSnapshots && collectionSnapshots.get(index) || row.collections,
  }));
}

function metricHotspots(samples, limit = 12) {
  const normalizedLimit = Math.max(1, Math.trunc(Number(limit || 0)));
  const rows = (Array.isArray(samples) ? samples : [])
    .map((row, index) => ({
      index,
      value: {
        elapsedMs: round(Number(row.elapsedMs || 0)),
        cpuPercent: round(Number(row.cpuPercent || 0)),
        eventLoopP95Ms: round(Number(row.eventLoop && row.eventLoop.p95Ms || 0)),
        eventLoopP99Ms: round(Number(row.eventLoop && row.eventLoop.p99Ms || 0)),
        eventLoopMaxMs: round(Number(row.eventLoop && row.eventLoop.maxMs || 0)),
        durablePending: Number(row.durable && row.durable.pending || 0),
        websocketConnections: Number(row.eventStream && row.eventStream.connections || 0),
        websocketQueuedFrames: Number(row.eventStream && row.eventStream.queuedFrames || 0),
        pendingPositionEvents: Number(row.eventStream && row.eventStream.pendingPositionEvents || 0),
        activeHttp: Number(row.transport && row.transport.activeHttp || 0),
      },
    }));
  const topByP95 = [...rows].sort((left, right) => (
    right.value.eventLoopP95Ms - left.value.eventLoopP95Ms
    || right.value.eventLoopMaxMs - left.value.eventLoopMaxMs
    || left.value.elapsedMs - right.value.elapsedMs
  )).slice(0, normalizedLimit);
  const topByMax = [...rows].sort((left, right) => (
    right.value.eventLoopMaxMs - left.value.eventLoopMaxMs
    || right.value.eventLoopP95Ms - left.value.eventLoopP95Ms
    || left.value.elapsedMs - right.value.elapsedMs
  )).slice(0, normalizedLimit);
  const selected = new Map();
  for (const entry of [...topByP95, ...topByMax]) {
    selected.set(entry.index, entry.value);
  }
  return [...selected.values()];
}

function collectionSummary(samples, finalMetrics, initialMetrics = null, durationMs = null) {
  const initial = capacityCollectionSummaryRow(initialMetrics && initialMetrics.collections);
  const sampledRows = (Array.isArray(samples) ? samples : [])
    .map((row) => ({elapsedMs: row && row.elapsedMs, collections: capacityCollectionSummaryRow(row && row.collections)}))
    .filter((row) => isFiniteMetricNumber(row.elapsedMs) && row.elapsedMs >= 0 && row.collections && row.collections.available);
  const final = capacityCollectionSummaryRow(finalMetrics && finalMetrics.collections);
  if (!(initial && initial.available) && sampledRows.length === 0 && !(final && final.available)) {
    return {available: false};
  }
  const numericFields = [...new Set([
    "activeBattleRooms",
    "battleRoomRecoveries",
    "battleRecoveryIndexedAccounts",
    "partyInvitesPending",
    "partyInvitesTerminal",
    "battleInvitesPending",
    "battleInvitesTerminal",
    "authAttemptKeys",
    "authEvents",
    "battleRecords",
    "battleTrace",
    "chatMessages",
    "receiptActive",
    "receiptCheckpoints",
    "receiptHistoricalKeys",
    "receiptHistoryEntries",
    "receiptExpiryHeap",
    "receiptOldestHeap",
    "receiptPendingDeletes",
    "receiptPendingUpserts",
    "receiptDeadKeys",
    "receiptExpiryHeapOverhead",
    "receiptOldestHeapOverhead",
    "sessions",
    "serviceEvents",
    ...COLLECTION_REQUIRED_NUMERIC_FIELDS,
  ])];
  const steadySampledRows = sampledRows.filter((row) => row.elapsedMs >= 10 * 60 * 1000);
  const numericSampleCounts = Object.fromEntries(COLLECTION_REQUIRED_NUMERIC_FIELDS.map((field) => [
    field,
    sampledRows.filter((row) => isFiniteMetricNumber(row.collections[field])).length,
  ]));
  const steadyNumericSampleCounts = Object.fromEntries(COLLECTION_REQUIRED_NUMERIC_FIELDS.map((field) => [
    field,
    steadySampledRows.filter((row) => isFiniteMetricNumber(row.collections[field])).length,
  ]));
  const timeline = [
    ...(initial && initial.available ? [{elapsedMs: 0, collections: initial}] : []),
    ...sampledRows,
    ...(final && final.available ? [{elapsedMs: Math.max(0, Number(durationMs || sampledRows.at(-1) && sampledRows.at(-1).elapsedMs || 0)), collections: final}] : []),
  ];
  const collectionRows = timeline.map((row) => row.collections);
  const valuesFor = (field) => collectionRows
    .filter((row) => Object.hasOwn(row, field) && isFiniteMetricNumber(row[field]))
    .map((row) => row[field]);
  return {
    available: true,
    sampleCoverage: {
      sampleCount: sampledRows.length,
      firstElapsedMs: sampledRows.length > 0 ? sampledRows[0].elapsedMs : null,
      lastElapsedMs: sampledRows.length > 0 ? sampledRows.at(-1).elapsedMs : null,
      steadyStartMs: 10 * 60 * 1000,
      steadySampleCount: steadySampledRows.length,
      steadyFirstElapsedMs: steadySampledRows.length > 0 ? steadySampledRows[0].elapsedMs : null,
      steadyLastElapsedMs: steadySampledRows.length > 0 ? steadySampledRows.at(-1).elapsedMs : null,
      numericSampleCounts,
      steadyNumericSampleCounts,
    },
    first: initial && initial.available ? initial : sampledRows[0] && sampledRows[0].collections || final,
    last: final && final.available ? final : sampledRows.at(-1) && sampledRows.at(-1).collections || initial,
    peaks: Object.fromEntries(numericFields.map((field) => {
      const values = valuesFor(field);
      return [field, values.length > 0 ? Math.max(...values) : null];
    })),
    minima: Object.fromEntries(numericFields.map((field) => {
      const values = valuesFor(field);
      return [field, values.length > 0 ? Math.min(...values) : null];
    })),
    slopesPerMinute: {
      ...Object.fromEntries(numericFields.map((field) => [
        field,
        metricSlope(timeline, (row) => Number(row.collections[field]), 10 * 60 * 1000),
      ])),
      battleRecoveryIndexedGroups: metricSlope(
        timeline,
        (row) => Number(row.collections.battleRecoveryIndexedAccounts || 0) / BATTLE_GROUP_SIZE,
        10 * 60 * 1000,
      ),
    },
  };
}

function capacityCollectionSummaryRow(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const row = {...value};
  for (const [field, left, right] of [
    ["receiptDeadKeys", "receiptHistoricalKeys", "receiptActive"],
    ["receiptExpiryHeapOverhead", "receiptExpiryHeap", "receiptActive"],
    ["receiptOldestHeapOverhead", "receiptOldestHeap", "receiptActive"],
  ]) {
    if (isFiniteMetricNumber(row[left]) && isFiniteMetricNumber(row[right])) {
      row[field] = Math.max(0, row[left] - row[right]);
    }
  }
  return row;
}

function isFiniteMetricNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeIntegerMetricNumber(value) {
  return isFiniteMetricNumber(value) && Number.isInteger(value) && value >= 0;
}

function metricEquals(value, expected) {
  return isFiniteMetricNumber(value) && value === expected;
}

function metricAtMost(value, limit) {
  return isFiniteMetricNumber(value) && value <= limit;
}

function metricAtLeast(value, minimum) {
  return isFiniteMetricNumber(value) && value >= minimum;
}

function metricSlope(samples, selector, startElapsedMs = null) {
  if (!Array.isArray(samples) || samples.length < 10) {
    return null;
  }
  const hasExplicitStart = startElapsedMs !== null
    && startElapsedMs !== undefined
    && Number.isFinite(Number(startElapsedMs));
  const selected = hasExplicitStart
    ? samples.filter((row) => Number(row.elapsedMs || 0) >= Number(startElapsedMs))
    : samples.slice(Math.floor(samples.length * 0.5));
  const rows = selected.map((row) => ({x: Number(row.elapsedMs || 0) / 60000, y: selector(row)})).filter((row) => Number.isFinite(row.x) && Number.isFinite(row.y));
  if (rows.length < 2) {
    return null;
  }
  const xMean = sum(rows.map((row) => row.x)) / rows.length;
  const yMean = sum(rows.map((row) => row.y)) / rows.length;
  let numerator = 0;
  let denominator = 0;
  for (const row of rows) {
    numerator += (row.x - xMean) * (row.y - yMean);
    denominator += (row.x - xMean) ** 2;
  }
  return round(denominator > 0 ? numerator / denominator : 0);
}

function metricMinuteFloorSlope(samples, selector, startElapsedMs, durationMs) {
  if (!Array.isArray(samples) || samples.length < 10) {
    return null;
  }
  const start = Number.isFinite(Number(startElapsedMs)) ? Number(startElapsedMs) : 0;
  const duration = Math.max(1, Number(durationMs || 0));
  const byMinute = new Map();
  for (const sample of samples) {
    const elapsedMs = Number(sample && sample.elapsedMs || 0);
    if (elapsedMs < start || elapsedMs > duration) {
      continue;
    }
    const minute = Math.floor(elapsedMs / 60000);
    // Exclude the incomplete tail bucket. One pre-drain sample at exactly the
    // duration boundary is not a retained-memory floor for that minute.
    if ((minute + 1) * 60000 > duration) {
      continue;
    }
    const value = Number(selector(sample));
    if (!Number.isFinite(value)) {
      continue;
    }
    const existing = byMinute.get(minute);
    if (!existing || value < existing.y) {
      byMinute.set(minute, {x: minute + 0.5, y: value});
    }
  }
  const floors = Array.from(byMinute.values()).sort((left, right) => left.x - right.x);
  return metricSlope(floors.map((row) => ({elapsedMs: row.x * 60000, value: row.y})), (row) => row.value, 0);
}

function createGcTelemetryAccumulator(options = {}) {
  let startedAt = finiteMonotonicMs(options.startedAt, performance.now());
  let available = options.available === true;
  let unavailableReason = String(options.unavailableReason || "");
  let total = createGcAggregate();
  let perSecond = new Map();

  function reset(startedAtValue = performance.now()) {
    startedAt = finiteMonotonicMs(startedAtValue, performance.now());
    total = createGcAggregate();
    perSecond = new Map();
  }

  function setAvailability(value, reason = "") {
    available = value === true;
    unavailableReason = available ? "" : String(reason || "gc_performance_observer_unavailable");
  }

  function record(entry) {
    const event = normalizeGcPerformanceEntry(entry, startedAt);
    if (!event) {
      return false;
    }
    addGcEvent(total, event);
    const second = Math.floor(event.startElapsedMs / 1000);
    const bucket = perSecond.get(second) || createGcAggregate();
    addGcEvent(bucket, event);
    perSecond.set(second, bucket);
    return true;
  }

  function snapshot(snapshotOptions = {}) {
    const includePerSecond = snapshotOptions.includePerSecond === true;
    const summary = {
      available,
      unavailableReason,
      observedElapsedMs: round(Math.max(0, performance.now() - startedAt)),
      total: gcAggregateSummary(total),
      perSecondSparse: true,
    };
    if (includePerSecond) {
      summary.perSecond = Array.from(perSecond.entries())
        .sort(([left], [right]) => left - right)
        .map(([second, aggregate]) => ({
          second,
          startElapsedMs: second * 1000,
          endElapsedMs: (second + 1) * 1000,
          ...gcAggregateSummary(aggregate),
        }));
    }
    return summary;
  }

  return Object.freeze({record, reset, setAvailability, snapshot});
}

function createWorkerGcObservation() {
  const accumulator = createGcTelemetryAccumulator({startedAt: performance.now()});
  let observer = null;
  const recordEntries = (entries) => {
    for (const entry of entries) {
      accumulator.record(entry);
    }
  };
  try {
    if (!PerformanceObserver.supportedEntryTypes.includes("gc")) {
      throw new Error("gc performance entries are unsupported");
    }
    observer = new PerformanceObserver((list) => recordEntries(list.getEntries()));
    observer.observe({entryTypes: ["gc"]});
    accumulator.setAvailability(true);
  } catch (error) {
    accumulator.setAvailability(false, error && error.message ? error.message : String(error));
  }

  const drainRecords = () => {
    if (observer && typeof observer.takeRecords === "function") {
      recordEntries(observer.takeRecords());
    }
  };
  return Object.freeze({
    async flush() {
      drainRecords();
      await new Promise((resolve) => setImmediate(resolve));
      drainRecords();
    },
    reset(startedAt = performance.now()) {
      drainRecords();
      accumulator.reset(startedAt);
    },
    snapshot(options = {}) {
      drainRecords();
      return accumulator.snapshot(options);
    },
    disconnect() {
      drainRecords();
      observer?.disconnect();
      observer = null;
    },
  });
}

function createGcAggregate() {
  return {
    count: 0,
    durationMs: 0,
    maxEvent: null,
    byKind: new Map(),
    byFlags: new Map(),
  };
}

function createGcCounter() {
  return {count: 0, durationMs: 0, maxEvent: null};
}

function addGcEvent(aggregate, event) {
  addGcEventToCounter(aggregate, event);
  const kindCounter = aggregate.byKind.get(event.kind) || createGcCounter();
  addGcEventToCounter(kindCounter, event);
  aggregate.byKind.set(event.kind, kindCounter);
  const flagCounter = aggregate.byFlags.get(event.flags) || createGcCounter();
  addGcEventToCounter(flagCounter, event);
  aggregate.byFlags.set(event.flags, flagCounter);
}

function addGcEventToCounter(counter, event) {
  counter.count += 1;
  counter.durationMs += event.durationMs;
  if (!counter.maxEvent || event.durationMs > counter.maxEvent.durationMs) {
    counter.maxEvent = event;
  }
}

function normalizeGcPerformanceEntry(entry, startedAt) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const startTime = Number(entry.startTime);
  const durationMs = Number(entry.duration);
  if (!Number.isFinite(startTime) || !Number.isFinite(durationMs) || durationMs < 0 || startTime < startedAt) {
    return null;
  }
  const detail = entry.detail && typeof entry.detail === "object" ? entry.detail : null;
  const kind = nonNegativeInteger(detail ? detail.kind : undefined, entry.kind);
  const flags = nonNegativeInteger(detail ? detail.flags : undefined, entry.flags);
  const startElapsedMs = round(startTime - startedAt);
  return Object.freeze({
    kind,
    kindName: gcKindName(kind),
    flags,
    flagNames: gcFlagNames(flags),
    durationMs: round(durationMs),
    startElapsedMs,
    endElapsedMs: round(startElapsedMs + durationMs),
  });
}

function gcAggregateSummary(aggregate) {
  const maxEvent = aggregate.maxEvent ? {...aggregate.maxEvent} : null;
  return {
    count: aggregate.count,
    durationMs: round(aggregate.durationMs),
    maxDurationMs: maxEvent ? maxEvent.durationMs : 0,
    maxAtElapsedMs: maxEvent ? maxEvent.startElapsedMs : null,
    maxEvent,
    byKind: Object.fromEntries(Array.from(aggregate.byKind.entries())
      .sort(([left], [right]) => left - right)
      .map(([kind, counter]) => [gcKindName(kind), {
        kind,
        kindName: gcKindName(kind),
        ...gcCounterSummary(counter),
      }])),
    byFlags: Object.fromEntries(Array.from(aggregate.byFlags.entries())
      .sort(([left], [right]) => left - right)
      .map(([flags, counter]) => [String(flags), {
        flags,
        flagNames: gcFlagNames(flags),
        ...gcCounterSummary(counter),
      }])),
  };
}

function gcCounterSummary(counter) {
  return {
    count: counter.count,
    durationMs: round(counter.durationMs),
    maxDurationMs: counter.maxEvent ? counter.maxEvent.durationMs : 0,
    maxAtElapsedMs: counter.maxEvent ? counter.maxEvent.startElapsedMs : null,
  };
}

function gcKindName(kind) {
  return GC_KIND_NAMES.get(kind) || `unknown_${kind}`;
}

function gcFlagNames(flagsValue) {
  const flags = nonNegativeInteger(flagsValue, 0);
  if (flags === 0) {
    return ["none"];
  }
  const names = [];
  let knownMask = 0;
  for (const [flag, name] of GC_FLAG_NAMES) {
    knownMask |= flag;
    if ((flags & flag) !== 0) {
      names.push(name);
    }
  }
  const unknown = flags & ~knownMask;
  if (unknown !== 0) {
    names.push(`unknown_0x${unknown.toString(16)}`);
  }
  return names;
}

function nonNegativeInteger(primary, fallback = 0) {
  const primaryNumber = Number(primary);
  if (Number.isInteger(primaryNumber) && primaryNumber >= 0) {
    return primaryNumber;
  }
  const fallbackNumber = Number(fallback);
  return Number.isInteger(fallbackNumber) && fallbackNumber >= 0 ? fallbackNumber : 0;
}

function finiteMonotonicMs(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : Number(fallback || 0);
}

function capacityGcReport(samplesValue, finalMetricsValue) {
  const samples = Array.isArray(samplesValue) ? samplesValue : [];
  const finalGc = finalMetricsValue && finalMetricsValue.gc;
  const latestGc = finalGc || (samples.at(-1) && samples.at(-1).gc);
  if (latestGc && typeof latestGc === "object" && !Array.isArray(latestGc)) {
    return latestGc;
  }
  return createGcTelemetryAccumulator({
    available: false,
    unavailableReason: "worker_gc_metrics_missing",
  }).snapshot({includePerSecond: true});
}

function finiteDelayMs(nanoseconds) {
  const value = Number(nanoseconds);
  return Number.isFinite(value) && value > 0 ? round(value / 1e6) : null;
}

function percentile(values, ratio) {
  const rows = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (rows.length === 0) {
    return 0;
  }
  return round(rows[Math.max(0, Math.ceil(rows.length * ratio) - 1)]);
}

function sum(values) {
  return (Array.isArray(values) ? values : []).reduce((total, value) => total + Number(value || 0), 0);
}

function safeRatio(numeratorValue, denominatorValue) {
  const numerator = Number(numeratorValue || 0);
  const denominator = Number(denominatorValue || 0);
  return round(denominator > 0 ? numerator / denominator : 0);
}

function countBy(values) {
  const result = new Map();
  for (const value of values) {
    result.set(String(value), Number(result.get(String(value)) || 0) + 1);
  }
  return result;
}

function forgedXffAttackWasExactlyBounded(rowsValue) {
  const rows = Array.isArray(rowsValue) ? rowsValue : [];
  const statuses = countBy(rows.map((row) => Number(row && row.status || 0)));
  return rows.length === 12
    && Number(statuses.get("400") || 0) === 10
    && Number(statuses.get("429") || 0) === 2
    && [...statuses.keys()].every((status) => status === "400" || status === "429")
    && rows.every((row) => row && row.ok === false);
}

async function mapInBatches(values, batchSize, fn) {
  for (let offset = 0; offset < values.length; offset += batchSize) {
    await Promise.all(values.slice(offset, offset + batchSize).map(fn));
  }
}

async function mapWithConcurrency(values, concurrency, fn) {
  let cursor = 0;
  const workers = Array.from({length: Math.min(concurrency, values.length)}, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      await fn(values[index], index);
    }
  });
  await Promise.all(workers);
}

function createConcurrencyLimiter(limitValue) {
  const limit = Math.max(1, Math.trunc(Number(limitValue || 1)));
  let active = 0;
  const queue = [];
  const drain = () => {
    while (active < limit && queue.length > 0) {
      const entry = queue.shift();
      active += 1;
      Promise.resolve()
        .then(entry.task)
        .then(entry.resolve, entry.reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    }
  };
  return (task) => new Promise((resolve, reject) => {
    queue.push({task, resolve, reject});
    drain();
  });
}

function serverConnectionCount(server) {
  return new Promise((resolve) => {
    server.getConnections((error, count) => resolve(error ? null : count));
  });
}

function check(failures, condition, message) {
  if (!condition) {
    pushFailure(failures, message);
  }
}

function pushFailure(failures, message) {
  if (failures.length < MAX_FAILURE_ROWS) {
    failures.push(String(message || "unknown failure"));
  }
}

function git(argumentsList) {
  try {
    return execFileSync("git", argumentsList, {cwd: ROOT, encoding: "utf8"}).trim();
  } catch {
    return "unknown";
  }
}

function capacitySourceManifest() {
  const sources = new Set(CAPACITY_SOURCE_FILES);
  const pending = CAPACITY_SOURCE_FILES.filter((relativePath) => relativePath.endsWith(".js"));
  while (pending.length > 0) {
    const relativePath = pending.shift();
    const absolutePath = path.join(ROOT, relativePath);
    const source = fs.readFileSync(absolutePath, "utf8");
    for (const match of source.matchAll(/require\(\s*["'](\.[^"']+)["']\s*\)/g)) {
      const dependency = resolveCommonJsDependency(path.dirname(absolutePath), match[1]);
      if (!dependency) {
        continue;
      }
      const dependencyRelative = path.relative(ROOT, dependency).split(path.sep).join("/");
      if (dependencyRelative.startsWith("../") || sources.has(dependencyRelative)) {
        continue;
      }
      sources.add(dependencyRelative);
      if (dependencyRelative.endsWith(".js")) {
        pending.push(dependencyRelative);
      }
    }
  }
  return Object.freeze([...sources].sort());
}

function resolveCommonJsDependency(parentDirectory, request) {
  const unresolved = path.resolve(parentDirectory, request);
  for (const candidate of [unresolved, `${unresolved}.js`, `${unresolved}.json`, path.join(unresolved, "index.js")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function tryCaptureCapacityRunFingerprint(sourceManifest) {
  try {
    return {fingerprint: captureCapacityRunFingerprint(sourceManifest), error: ""};
  } catch (error) {
    return {
      fingerprint: unavailableCapacityRunFingerprint(sourceManifest),
      error: error && error.stack ? error.stack : String(error),
    };
  }
}

function unavailableCapacityRunFingerprint(sourceManifest = []) {
  return Object.freeze({
    head: "unknown",
    dirty: Object.freeze(["unknown"]),
    gitHeadAvailable: false,
    gitStatusAvailable: false,
    sourceManifest: Object.freeze([...sourceManifest]),
    sourceSha256: Object.freeze({}),
    fingerprintSha256: "",
  });
}

function captureCapacityRunFingerprint(sourceManifest = capacitySourceManifest()) {
  const sourceSha256 = Object.fromEntries(sourceManifest.map((relativePath) => [
    relativePath,
    crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, relativePath))).digest("hex"),
  ]));
  const head = git(["rev-parse", "HEAD"]);
  const dirtyText = git(["status", "--short"]);
  const state = {
    head,
    dirty: dirtyText.split(/\r?\n/).filter(Boolean),
    gitHeadAvailable: head !== "unknown" && head !== "",
    gitStatusAvailable: dirtyText !== "unknown",
    sourceSha256,
  };
  return Object.freeze({
    ...state,
    dirty: Object.freeze(state.dirty.slice()),
    sourceSha256: Object.freeze({...sourceSha256}),
    fingerprintSha256: crypto.createHash("sha256").update(JSON.stringify(state)).digest("hex"),
  });
}

function capacityRunFingerprintFailures(startedValue, finishedValue) {
  const started = startedValue && typeof startedValue === "object" ? startedValue : {};
  const finished = finishedValue && typeof finishedValue === "object" ? finishedValue : {};
  const failures = [];
  if (started.gitHeadAvailable !== true || typeof started.head !== "string" || started.head === "" || started.head === "unknown") {
    failures.push("capacity run start Git HEAD fingerprint is unavailable");
  }
  if (finished.gitHeadAvailable !== true || typeof finished.head !== "string" || finished.head === "" || finished.head === "unknown") {
    failures.push("capacity run end Git HEAD fingerprint is unavailable");
  }
  if (started.gitStatusAvailable !== true || (started.dirty || []).includes("unknown")) {
    failures.push("capacity run start Git dirty fingerprint is unavailable");
  }
  if (finished.gitStatusAvailable !== true || (finished.dirty || []).includes("unknown")) {
    failures.push("capacity run end Git dirty fingerprint is unavailable");
  }
  if (
    typeof started.fingerprintSha256 !== "string"
    || !/^[a-f0-9]{64}$/.test(started.fingerprintSha256)
    || typeof finished.fingerprintSha256 !== "string"
    || !/^[a-f0-9]{64}$/.test(finished.fingerprintSha256)
  ) {
    failures.push("capacity run source fingerprint is unavailable or malformed");
  } else if (started.fingerprintSha256 !== finished.fingerprintSha256) {
    failures.push(`capacity run source/dirty fingerprint changed ${started.fingerprintSha256}/${finished.fingerprintSha256}`);
  }
  if (JSON.stringify(started.sourceSha256 || {}) !== JSON.stringify(finished.sourceSha256 || {})) {
    failures.push("capacity run source SHA-256 manifest changed while the gate was running");
  }
  if (JSON.stringify(started.dirty || []) !== JSON.stringify(finished.dirty || [])) {
    failures.push("capacity run Git dirty fingerprint changed while the gate was running");
  }
  if (started.head !== finished.head) {
    failures.push(`capacity run Git HEAD changed ${String(started.head)}/${String(finished.head)}`);
  }
  return failures;
}

function emptyCapacityCleanupEvidence() {
  return Object.freeze({
    workerStarted: false,
    workerPid: null,
    childExited: null,
    portClosed: null,
    fixtureRemoved: null,
  });
}

function capacityCleanupEvidenceFailures(value) {
  const cleanup = value && typeof value === "object" ? value : {};
  if (cleanup.workerStarted !== true) {
    return [];
  }
  const failures = [];
  for (const field of ["childExited", "portClosed", "fixtureRemoved"]) {
    if (cleanup[field] !== true) {
      failures.push(`capacity cleanup ${field} was not verified`);
    }
  }
  return failures;
}

async function runCapacityToolSelfTest() {
  const logicalBatch = [1, 2, 3].map((revision) => ({
    type: "online.position",
    accountId: `acc_${revision}`,
    presenceRevision: revision,
  }));
  assert.deepEqual(expandLogicalServerEvents({
    type: "online.position_batch",
    deltas: logicalBatch,
  }), logicalBatch);
  for (const invalidBatch of [
    {type: "online.position_batch", deltas: []},
    {type: "online.position_batch", deltas: Array.from({length: 65}, () => logicalBatch[0])},
    {type: "online.position_batch", targetAccountIds: ["acc"], deltas: logicalBatch},
    {type: "online.position_batch", deltas: [{...logicalBatch[0], eventSeq: 1}]},
    {type: "online.position_batch", deltas: [{...logicalBatch[0], targetAccountIds: ["acc"]}]},
    {type: "online.position_batch", deltas: [{type: "chat.message"}]},
  ]) {
    assert.throws(() => expandLogicalServerEvents(invalidBatch), /invalid online\.position_batch/);
  }
  assert.equal(parseArgs([]).durationSeconds, QUICK_DURATION_SECONDS);
  assert.equal(parseArgs(["--full"]).durationSeconds, FULL_DURATION_SECONDS);
  assert.equal(parseArgs(["--duration-seconds=1800"]).full, true);
  assert.equal(parseArgs(["--duration-seconds=120"]).full, false);
  assert.throws(() => parseArgs(["--full", "--quick"]), /cannot be combined/);
  assert.throws(() => parseArgs(["--full", "--duration-seconds=120"]), /requires --duration-seconds/);
  assert.throws(() => parseArgs(["--quick", "--duration-seconds=1800"]), /requires --duration-seconds/);
  assert.throws(() => parseArgs(["--quick", "--duration-seconds=119"]), /requires --duration-seconds/);
  assert.throws(() => parseArgs(["--full", "--skip-attacks"]), /development-smoke-only/);
  assert.throws(() => parseArgs(["--duration-seconds=1800", "--skip-attacks"]), /development-smoke-only/);
  assert.throws(() => parseArgs(["--quick", "--skip-attacks"]), /development-smoke-only/);
  assert.equal(parseArgs(["--duration-seconds=10", "--skip-attacks"]).skipAttacks, true);
  assert.equal(parseArgs(["--output=.run/p0_6c_report.json"]).outputPath, ".run/p0_6c_report.json");
  assert.throws(() => parseArgs(["--output", "--quick"]), /report file path/);
  assert.equal(capacityHostPreflightDurationMs({durationSeconds: 1}), DEVELOPMENT_HOST_PREFLIGHT_MS);
  assert.equal(capacityHostPreflightDurationMs({durationSeconds: QUICK_DURATION_SECONDS}), FORMAL_HOST_PREFLIGHT_MS);
  const cleanHostEvidence = {
    classification: {status: "valid", environmentValid: true, invalidReasons: [], warnings: []},
  };
  assert.deepEqual(capacityHostEnvironmentAssessment(cleanHostEvidence, {durationSeconds: QUICK_DURATION_SECONDS}), {
    required: true,
    abort: false,
    errors: [],
    warnings: [],
  });
  const invalidHostEvidence = {
    classification: {
      status: "invalid",
      environmentValid: false,
      invalidReasons: ["preflight_active_paging_high"],
      warnings: ["preflight_static_swap_high"],
    },
  };
  assert.equal(capacityHostEnvironmentAssessment(
    invalidHostEvidence,
    {durationSeconds: QUICK_DURATION_SECONDS},
  ).abort, true);
  assert.deepEqual(capacityHostEnvironmentAssessment(
    invalidHostEvidence,
    {durationSeconds: 1},
  ), {
    required: false,
    abort: false,
    errors: [],
    warnings: ["preflight_active_paging_high", "preflight_static_swap_high"],
  });
  const oversizedMetricPayload = "x".repeat(32 * 1024);
  const compactMetric = capacityCompactMetricSample({
    cpuPercent: 37,
    memory: {rss: 100, heapUsed: 50, external: 10, arrayBuffers: 5},
    memorySampling: {rss100ms: {count: 10, maxDurationMs: 0.1}},
    resourceUsage: {userCPUTime: 10, involuntaryContextSwitches: 3},
    eventLoop: {p95Ms: 12, p99Ms: 18, maxMs: 25, utilization: 0.2},
    gc: {
      available: true,
      observedElapsedMs: 1_000,
      total: {
        count: 2,
        durationMs: 3,
        maxDurationMs: 2,
        maxAtElapsedMs: 900,
        byKind: {oversizedMetricPayload},
      },
    },
    durable: {
      pending: 2,
      running: 1,
      accepted: 10,
      completed: 8,
      queueFull: 0,
      timeouts: 0,
      failed: 0,
      precommitByMethod: {oversizedMetricPayload},
    },
    eventStream: {
      connections: 200,
      queuedFrames: 3,
      encodedFrames: 100,
      reusedFrames: 900,
      pendingPositionEvents: 4,
      eventTypes: {oversizedMetricPayload},
    },
    transport: {activeHttp: 5, httpResponses: {oversizedMetricPayload}},
    collections: {
      available: true,
      activeBattleRooms: 4,
      battleRecords: 10_000,
      battleTrace: 1_200,
      chatMessages: 500,
      receiptActive: 20_000,
      receiptHistoricalKeys: 20_001,
      receiptExpiryHeap: 20_000,
      receiptOldestHeap: 20_000,
      movementStepTiming: {oversizedMetricPayload},
    },
    store: {oversizedMetricPayload},
  }, 1_000, {
    storage: {ok: true, internal: oversizedMetricPayload},
    transport: {activeHttp: 5, peakActiveHttp: 8, internal: oversizedMetricPayload},
    authWork: {active: 1, queued: 2, internal: oversizedMetricPayload},
    authSecurity: {oversizedMetricPayload},
  });
  const compactMetricJson = JSON.stringify(compactMetric);
  assert.equal(compactMetric.durable.pending, 2);
  assert.equal(compactMetric.eventStream.connections, 200);
  assert.equal(compactMetric.collections.receiptActive, 20_000);
  assert.equal(compactMetric.publicHealth.storage.ok, true);
  assert.equal(Object.hasOwn(compactMetric, "store"), false);
  assert.equal(compactMetricJson.includes("oversizedMetricPayload"), false);
  assert.equal(compactMetricJson.includes(oversizedMetricPayload), false);
  assert.ok(Buffer.byteLength(compactMetricJson) * FULL_DURATION_SECONDS < 10 * 1024 * 1024);
  assert.equal(eventLoopSummary([compactMetric]).validSampleCount, 1);
  assert.equal(durableSummary([compactMetric], {durable: {pending: 0}}).peakPending, 2);
  assert.equal(collectionSummary([compactMetric], null).available, true);
  const missingMetric = capacityCompactMetricSample({}, 2_000, {});
  assert.equal(missingMetric.gc, null);
  assert.equal(missingMetric.durable, null);
  assert.equal(missingMetric.publicHealth.storage, null);
  assert.equal(healthSummary([missingMetric]).storageOk === true, false);
  assert.equal(capacityGcReport([missingMetric], null).available, false);
  const invalidHighMax = {
    ...compactMetric,
    elapsedMs: 2_000,
    eventLoop: {...compactMetric.eventLoop, maxMs: 999, utilization: 0},
  };
  const invalidOverride = eventLoopMaxSample(invalidHighMax, compactMetric);
  const validOnlySummary = eventLoopSummary([compactMetric, invalidHighMax], invalidOverride);
  assert.equal(validOnlySummary.maxMs, compactMetric.eventLoop.maxMs);
  assert.equal(validOnlySummary.maxSample.eventLoop.maxMs, compactMetric.eventLoop.maxMs);
  assert.deepEqual(capacitySchedulerTickTiming(100, 100, 100), {
    lagMs: 0,
    rebased: false,
    dispatchAtMs: 100,
    nextTickAtMs: 200,
  });
  assert.deepEqual(capacitySchedulerTickTiming(100, 107, 100), {
    lagMs: 7,
    rebased: false,
    dispatchAtMs: 100,
    nextTickAtMs: 200,
  });
  assert.deepEqual(capacitySchedulerTickTiming(100, 307, 100), {
    lagMs: 207,
    rebased: true,
    dispatchAtMs: 307,
    nextTickAtMs: 407,
  });
  const quickBusinessProbeTicks = Array.from({length: QUICK_DURATION_SECONDS * 10}, (_, tick) => tick)
    .filter((tick) => tick >= BUSINESS_PROBE_START_TICK
      && (tick - BUSINESS_PROBE_START_TICK) % BUSINESS_PROBE_INTERVAL_TICKS === 0);
  assert.deepEqual(quickBusinessProbeTicks, [247, 847]);
  for (const tick of quickBusinessProbeTicks) {
    assert.notEqual(tick % 5, 0, "business probe must not duplicate the regular chat tick");
    assert.notEqual(tick % 10, 0, "business probe must not duplicate asset and market ticks");
    assert.notEqual(tick % 50, 0, "business probe must not duplicate party churn ticks");
    assert.notEqual((tick - 45) % 15, 0, "business probe must not duplicate a regular battle round");
  }
  const quickSentinelTicks = Array.from({length: QUICK_DURATION_SECONDS * 10}, (_, tick) => tick)
    .filter((tick) => tick >= 25 && tick % 50 === 25);
  assert.equal(quickSentinelTicks.length, 24);
  assert.deepEqual(quickSentinelTicks.slice(0, 3), [25, 75, 125]);
  assert.equal(isFiniteMetricNumber(0), true);
  assert.equal(isFiniteMetricNumber(null), false);
  assert.equal(isFiniteMetricNumber(""), false);
  assert.equal(isFiniteMetricNumber("1"), false);
  assert.equal(isNonNegativeIntegerMetricNumber(1), true);
  assert.equal(isNonNegativeIntegerMetricNumber(1.5), false);
  const rssSamplingSelf = createBoundedDurationDiagnostic();
  const fullMemorySamplingSelf = createBoundedDurationDiagnostic();
  assert.equal(rssSamplingSelf.record(0.125, 1000), true);
  assert.equal(rssSamplingSelf.record(2.5, 2000), true);
  assert.equal(rssSamplingSelf.record(Number.NaN, 3000), false);
  assert.equal(fullMemorySamplingSelf.record(4.25, 2100), true);
  assert.deepEqual(capacityMemorySamplingDiagnostics(rssSamplingSelf, fullMemorySamplingSelf), {
    rss100ms: {
      api: "process.memoryUsage.rss()",
      intervalMs: 100,
      count: 2,
      maxDurationMs: 2.5,
      maxAtElapsedMs: 2000,
    },
    fullMemoryUsage: {
      api: "process.memoryUsage()",
      intervalMs: METRIC_SAMPLE_MS,
      count: 1,
      maxDurationMs: 4.25,
      maxAtElapsedMs: 2100,
    },
  });
  rssSamplingSelf.reset();
  assert.deepEqual(rssSamplingSelf.snapshot(), {count: 0, maxDurationMs: 0, maxAtElapsedMs: null});
  const cleanFingerprint = {
    head: "a".repeat(40),
    dirty: [" M source.js"],
    gitHeadAvailable: true,
    gitStatusAvailable: true,
    sourceSha256: {"source.js": "b".repeat(64)},
    fingerprintSha256: "c".repeat(64),
  };
  assert.deepEqual(capacityRunFingerprintFailures(cleanFingerprint, structuredClone(cleanFingerprint)), []);
  assert.ok(capacityRunFingerprintFailures(cleanFingerprint, {
    ...cleanFingerprint,
    sourceSha256: {"source.js": "d".repeat(64)},
    fingerprintSha256: "e".repeat(64),
  }).length >= 2);
  assert.ok(capacityRunFingerprintFailures(
    {...cleanFingerprint, dirty: ["unknown"], gitStatusAvailable: false},
    cleanFingerprint,
  ).some((message) => message.includes("start Git dirty")));
  const sourceManifest = capacitySourceManifest();
  for (const requiredSource of [
    "server/node/src/auth/economy.js",
    "server/node/src/auth/equipment-envelope-consumed-ledger.js",
    "server/node/src/auth/battle-combat-formula.js",
  ]) {
    assert.ok(sourceManifest.includes(requiredSource), `capacity source manifest omitted ${requiredSource}`);
  }
  const strictEventLoop = eventLoopSummary(Array.from({length: 108}, (_, index) => ({
    cpuPercent: 1,
    eventLoop: {p95Ms: 10 + index / 1000, p99Ms: 12, maxMs: 15, utilization: 0.1},
  })));
  assert.deepEqual(eventLoopSampleFailures(strictEventLoop, {durationSeconds: QUICK_DURATION_SECONDS}), []);
  const invalidEventLoop = eventLoopSummary([{eventLoop: {p95Ms: null, p99Ms: 0, maxMs: Number.NaN}}]);
  assert.ok(eventLoopSampleFailures(invalidEventLoop, {durationSeconds: 1}).length >= 2);
  const isolatedEventLoopSamples = [
    {
      elapsedMs: 1000,
      cpuPercent: 20,
      memory: {rss: 100, heapUsed: 50},
      resourceUsage: {involuntaryContextSwitches: 1},
      eventLoop: {
        p95Ms: 40,
        p99Ms: 50,
        maxMs: 60,
        utilization: 0.2,
        windowStartedAtElapsedMs: 0,
        windowEndedAtElapsedMs: 1000,
        windowDurationMs: 1000,
      },
      durable: {pending: 0},
      eventStream: {connections: ACCOUNT_COUNT},
      transport: {activeHttp: 1},
    },
    {
      elapsedMs: 2000,
      cpuPercent: 21,
      memory: {rss: 120, heapUsed: 55},
      memorySampling: {
        rss100ms: {count: 20, maxDurationMs: 2.5, maxAtElapsedMs: 1900},
        fullMemoryUsage: {count: 2, maxDurationMs: 4.25, maxAtElapsedMs: 1990},
      },
      resourceUsage: {involuntaryContextSwitches: 9},
      eventLoop: {
        p95Ms: 5,
        p99Ms: 6,
        maxMs: 550,
        utilization: 0.21,
        windowStartedAtElapsedMs: 1000,
        windowEndedAtElapsedMs: 2000,
        windowDurationMs: 1000,
      },
      durable: {pending: 2},
      eventStream: {connections: ACCOUNT_COUNT - 1},
      transport: {activeHttp: 12},
    },
  ];
  const isolatedEventLoop = eventLoopSummary(isolatedEventLoopSamples);
  assert.equal(isolatedEventLoop.maxMs, 550);
  assert.equal(isolatedEventLoop.maxSample.elapsedMs, 2000);
  assert.equal(isolatedEventLoop.maxSample.cpuPercent, 21);
  assert.equal(isolatedEventLoop.maxSample.eventLoop.maxMs, 550);
  assert.deepEqual(isolatedEventLoop.maxSample.window, {
    startedAtElapsedMs: 1000,
    endedAtElapsedMs: 2000,
    durationMs: 1000,
  });
  assert.deepEqual(isolatedEventLoop.maxSample.memory, {rss: 120, heapUsed: 55});
  assert.deepEqual(isolatedEventLoop.maxSample.memorySampling, isolatedEventLoopSamples[1].memorySampling);
  assert.deepEqual(isolatedEventLoop.maxSample.resourceUsage, {involuntaryContextSwitches: 9});
  assert.deepEqual(isolatedEventLoop.maxSample.resourceUsageDelta, {involuntaryContextSwitches: 8});
  assert.deepEqual(isolatedEventLoop.maxSample.durable, {pending: 2});
  assert.deepEqual(isolatedEventLoop.maxSample.eventStream, {connections: ACCOUNT_COUNT - 1});
  assert.deepEqual(isolatedEventLoop.maxSample.transport, {activeHttp: 12});
  const isolatedHotspots = metricHotspots(isolatedEventLoopSamples, 1);
  assert.deepEqual(isolatedHotspots.map((row) => row.elapsedMs), [1000, 2000]);
  assert.ok(isolatedHotspots.some((row) => row.eventLoopMaxMs === 550), "isolated event-loop max must remain in hotspots");
  const gcSelf = createGcTelemetryAccumulator({available: true, startedAt: 1000});
  const forcedGcFlag = performanceConstants.NODE_PERFORMANCE_GC_FLAGS_FORCED;
  const scheduledGcFlags = forcedGcFlag | performanceConstants.NODE_PERFORMANCE_GC_FLAGS_SCHEDULE_IDLE;
  assert.equal(gcSelf.record({
    startTime: 1100,
    duration: 4,
    detail: {kind: performanceConstants.NODE_PERFORMANCE_GC_MAJOR, flags: 0},
  }), true);
  assert.equal(gcSelf.record({
    startTime: 1950,
    duration: 12.345,
    detail: {kind: performanceConstants.NODE_PERFORMANCE_GC_MINOR, flags: forcedGcFlag},
  }), true);
  assert.equal(gcSelf.record({
    startTime: 2100,
    duration: 5,
    detail: {kind: performanceConstants.NODE_PERFORMANCE_GC_INCREMENTAL, flags: scheduledGcFlags},
  }), true);
  assert.equal(gcSelf.record({
    startTime: 999,
    duration: 100,
    detail: {kind: performanceConstants.NODE_PERFORMANCE_GC_MAJOR, flags: 0},
  }), false, "GC that started before the scenario baseline must be excluded");
  const gcSelfSummary = gcSelf.snapshot({includePerSecond: true});
  assert.equal(gcSelfSummary.available, true);
  assert.equal(gcSelfSummary.total.count, 3);
  assert.equal(gcSelfSummary.total.durationMs, 21.345);
  assert.equal(gcSelfSummary.total.maxDurationMs, 12.345);
  assert.equal(gcSelfSummary.total.maxAtElapsedMs, 950);
  assert.equal(gcSelfSummary.total.maxEvent.kindName, "minor");
  assert.equal(gcSelfSummary.total.byKind.major.count, 1);
  assert.deepEqual(gcSelfSummary.total.byFlags[String(forcedGcFlag)].flagNames, ["forced"]);
  assert.equal(gcSelfSummary.perSecondSparse, true);
  assert.deepEqual(gcSelfSummary.perSecond.map((row) => [row.second, row.count]), [[0, 2], [1, 1]]);
  assert.equal(Object.hasOwn(gcSelf.snapshot(), "perSecond"), false, "recurring metrics must remain O(1)");
  gcSelf.reset(3000);
  assert.equal(gcSelf.snapshot({includePerSecond: true}).total.count, 0);
  const missingGc = capacityGcReport([], null);
  assert.equal(missingGc.available, false);
  assert.deepEqual(missingGc.perSecond, []);
  assert.deepEqual(
    movementStepPayload({aoiRadius: 48}, 5, 5, 6, 5),
    {
      mapId: MAP_ID,
      fromCellX: 5,
      fromCellY: 5,
      toCellX: 6,
      toCellY: 5,
      facing: "east",
      moving: true,
      aoiRadius: 48,
    },
    "hotspot movement must preserve the intended AOI radius",
  );
  assert.deepEqual(sentinelSampleRequirements({durationSeconds: 1}), {total: 1, first: 0, last: 0});
  assert.deepEqual(sentinelSampleRequirements({durationSeconds: QUICK_DURATION_SECONDS}), {total: 10, first: 0, last: 0});
  assert.deepEqual(sentinelSampleRequirements({durationSeconds: FULL_DURATION_SECONDS}), {total: 100, first: 10, last: 10});
  assert.equal(timelineFor(10, false, false).filter((row) => row.kind === "attack").length, 1);
  assert.equal(timelineFor(60, false, false).filter((row) => row.kind === "hold_cursor" || row.kind === "restore_cursor").length, 0);
  assert.equal(timelineFor(QUICK_DURATION_SECONDS, false, false).filter((row) => row.kind === "hold_cursor" || row.kind === "restore_cursor").length, 2);
  const shiftedLatency = new LatencyBook(10_000, {windowMs: 2_000, firstWindowStartMs: 2_000});
  shiftedLatency.record("read", 1, {elapsedMs: 1_000});
  shiftedLatency.record("read", 2, {elapsedMs: 2_500});
  shiftedLatency.record("read", 4, {elapsedMs: 4_000});
  shiftedLatency.record("read", 3, {elapsedMs: 8_500});
  const shiftedLatencySummary = shiftedLatency.summary().read;
  assert.equal(shiftedLatencySummary.maxMs, 4);
  assert.equal(shiftedLatencySummary.maxAtElapsedMs, 4_000);
  assert.equal(shiftedLatencySummary.first.count, 1);
  assert.ok(Math.abs(shiftedLatencySummary.first.p95Ms - 2) < 0.01);
  assert.equal(shiftedLatencySummary.first.maxMs, 2);
  assert.equal(shiftedLatencySummary.first.maxAtElapsedMs, 2_500);
  assert.equal(shiftedLatencySummary.last.count, 1);
  assert.ok(Math.abs(shiftedLatencySummary.last.p95Ms - 3) < 0.01);
  assert.equal(shiftedLatencySummary.last.maxMs, 3);
  assert.equal(shiftedLatencySummary.last.maxAtElapsedMs, 8_500);
  assert.deepEqual(
    timelineFor(FULL_DURATION_SECONDS, true, false).filter((row) => row.kind === "attack").map((row) => row.atSeconds),
    [8 * 60, 28 * 60],
  );
  assert.deepEqual(
    timelineFor(FULL_DURATION_SECONDS, true, false).filter((row) => row.kind === "reconnect").map((row) => row.atSeconds),
    [12 * 60, 22 * 60],
  );
  assert.equal(estimateSqlTouchedRows("INSERT INTO t (id, payload) VALUES ('a', '{\"x\":\"a,b\"}') ON DUPLICATE KEY UPDATE payload=VALUES(payload)"), 1);
  assert.equal(estimateSqlTouchedRows("INSERT INTO t (id) VALUES ('a'), ('b')"), 2);
  assert.equal(estimateSqlTouchedRows("DELETE FROM t WHERE id IN ('a', 'b', 'c')"), 3);
  assert.equal(estimateSqlTouchedRows("UPDATE t SET value=1 WHERE id='a'"), 1);
  assert.equal(estimateSqlTouchedRows("SELECT 1"), 0);
  const metrics = createRecordingPoolMetrics();
  metrics.scenarioStartedAt = 1000;
  metrics.scenarioDurationMs = FULL_DURATION_SECONDS * 1000;
  for (const [startedAtMs, value] of [
    [2000, 2],
    [301000, 4],
    [601000, 5],
    [1502000, 6],
    [1800000, 8],
  ]) {
    recordRecordingMetric(metrics, "transactionSqlCount", value, startedAtMs);
  }
  const distribution = recordingMetricSummary(metrics, "transactionSqlCount");
  assert.equal(distribution.windowSeconds, 300);
  assert.equal(distribution.firstWindowStartSeconds, 300);
  assert.equal(distribution.count, 5);
  assert.equal(distribution.first.count, 1);
  assert.equal(distribution.first.p95, 4);
  assert.equal(distribution.last.p95, 8);
  assert.equal(distribution.p95Delta, 4);
  const boundedRecording = createRecordingPoolMetrics();
  boundedRecording.scenarioStartedAt = 1000;
  boundedRecording.scenarioDurationMs = FULL_DURATION_SECONDS * 1000;
  for (let index = 0; index < 10_000; index += 1) {
    recordRecordingMetric(boundedRecording, "saveLatencyMs", 1 + index % 20, 2000 + index * 100);
  }
  assert.equal(recordingMetricSummary(boundedRecording, "saveLatencyMs").count, 10_000);
  assert.equal(Object.hasOwn(boundedRecording, "transactions"), false);
  assert.equal(Object.hasOwn(boundedRecording, "saveDurations"), false);
  assert.equal(Object.hasOwn(recordingPoolSummary(boundedRecording), "saveLatencyMs"), false);
  assert.equal(recordingPoolSummary(boundedRecording).retainedSaveSamples, 0);
  const cleanRecordingDistribution = {
    scenarioTransactionDelta: 2,
    scenarioTransactionCount: 2,
    transactionSqlCount: {count: 2},
    transactionTouchedRows: {count: 2},
    saveLatencyMs: {count: 2},
  };
  assert.deepEqual(recordingScenarioDistributionFailures(cleanRecordingDistribution), []);
  for (const badCount of [null, "", "2", 1]) {
    assert.ok(recordingScenarioDistributionFailures({
      ...cleanRecordingDistribution,
      transactionSqlCount: {count: badCount},
    }).some((message) => message.includes("transaction SQL count")));
  }
  const steadyFloorSamples = [];
  for (let minute = 10; minute < 30; minute += 1) {
    steadyFloorSamples.push(
      {elapsedMs: minute * 60000 + 1000, heap: 100 + minute - 10},
      {elapsedMs: minute * 60000 + 30000, heap: 180 + minute * 4},
    );
  }
  assert.equal(metricMinuteFloorSlope(steadyFloorSamples, (row) => row.heap, 10 * 60000, 30 * 60000), 1);
  const slopeSelectionRows = Array.from({length: 20}, (_, index) => ({
    elapsedMs: index * 60000,
    value: index < 10 ? index : 10,
  }));
  assert.equal(metricSlope(slopeSelectionRows, (row) => row.value), 0);
  assert.ok(metricSlope(slopeSelectionRows, (row) => row.value, 0) > 0);
  assert.equal(metricSlope(slopeSelectionRows.slice(0, 9), (row) => row.value, 0), null);
  assert.equal(metricSlope(slopeSelectionRows, (row) => row.value, 60 * 60 * 1000), null);
  assert.equal(metricMinuteFloorSlope([], (row) => row.value, 0, FULL_DURATION_SECONDS * 1000), null);

  const cleanCollectionRow = {
    available: true,
    activeBattleRooms: BATTLE_ACTIVE_GROUPS,
    battleRoomRecoveries: 4,
    battleRecoveryIndexedAccounts: 20,
    partyInvitesPending: 0,
    partyInvitesTerminal: 0,
    battleInvitesPending: 0,
    battleInvitesTerminal: 0,
    authAttemptKeys: 0,
    authEvents: 0,
    battleRecords: BATTLE_RECORD_LIMIT,
    battleTrace: BATTLE_TRACE_LIMIT,
    chatMessages: CHAT_MESSAGE_LIMIT,
    receiptActive: RECEIPT_COUNT,
    receiptCheckpoints: 1,
    receiptHistoricalKeys: RECEIPT_COUNT + RECEIPT_DEAD_KEY_PEAK_LIMIT,
    receiptHistoryEntries: RECEIPT_HISTORY_ENTRY_PEAK_LIMIT,
    receiptExpiryHeap: RECEIPT_COUNT + RECEIPT_HEAP_OVERHEAD_LIMIT,
    receiptOldestHeap: RECEIPT_COUNT + RECEIPT_HEAP_OVERHEAD_LIMIT,
    receiptPendingDeletes: 0,
    receiptPendingUpserts: 0,
    sessions: ACCOUNT_COUNT,
    serviceEvents: 500,
  };
  const cleanCollectionInitialRow = {...cleanCollectionRow, receiptCheckpoints: 0};
  const cleanCollectionSamples = Array.from({length: FULL_DURATION_SECONDS - 1}, (_, index) => {
    const elapsedSeconds = index + 1;
    return {
      elapsedMs: elapsedSeconds * 1000,
      collections: {
        ...cleanCollectionRow,
        receiptCheckpoints: elapsedSeconds >= 1024 ? 1 : 0,
      },
    };
  });
  const cleanCollectionSummary = collectionSummary(
    cleanCollectionSamples,
    {collections: cleanCollectionRow},
    {collections: cleanCollectionInitialRow},
    FULL_DURATION_SECONDS * 1000,
  );
  const cleanCollectionCorrectness = {
    battleRoomsStarted: 500,
    battleRoomsClosed: 10,
    battleRoundsResolved: 1000,
    chatAccepted: CHAT_MESSAGE_LIMIT,
    assetWrites: 1024,
  };
  assert.deepEqual(collectionCapacityFailures(
    cleanCollectionSummary,
    cleanCollectionCorrectness,
    {domains: {chat: {count: 0}}},
    {durationSeconds: FULL_DURATION_SECONDS},
  ), []);
  assert.deepEqual(fullCollectionStabilityFailures(cleanCollectionSummary), []);
  const missingCollectionSlope = structuredClone(cleanCollectionSummary);
  missingCollectionSlope.slopesPerMinute.activeBattleRooms = null;
  assert.ok(fullCollectionStabilityFailures(missingCollectionSlope).some((message) => message.includes("activeBattleRooms slope is missing")));
  const missingCollectionCoverage = structuredClone(cleanCollectionSummary);
  missingCollectionCoverage.sampleCoverage.steadySampleCount = 1;
  assert.ok(collectionCapacityFailures(
    missingCollectionCoverage,
    cleanCollectionCorrectness,
    {domains: {chat: {count: 0}}},
    {durationSeconds: FULL_DURATION_SECONDS},
  ).some((message) => message.includes("steady sample coverage")));
  for (const [field, badValue] of [
    ["receiptDeadKeys", RECEIPT_DEAD_KEY_PEAK_LIMIT + 1],
    ["receiptHistoryEntries", RECEIPT_HISTORY_ENTRY_PEAK_LIMIT + 1],
    ["receiptExpiryHeapOverhead", RECEIPT_HEAP_OVERHEAD_LIMIT + 1],
    ["receiptOldestHeapOverhead", RECEIPT_HEAP_OVERHEAD_LIMIT + 1],
  ]) {
    const bad = structuredClone(cleanCollectionSummary);
    bad.peaks[field] = badValue;
    assert.ok(collectionCapacityFailures(
      bad,
      cleanCollectionCorrectness,
      {domains: {chat: {count: 0}}},
      {durationSeconds: FULL_DURATION_SECONDS},
    ).some((message) => message.includes(field)));
  }
  const missingCollectionField = structuredClone(cleanCollectionSummary);
  delete missingCollectionField.last.receiptActive;
  assert.ok(collectionCapacityFailures(
    missingCollectionField,
    cleanCollectionCorrectness,
    {domains: {chat: {count: 0}}},
    {durationSeconds: FULL_DURATION_SECONDS},
  ).some((message) => message.includes("receiptActive last")));
  const nullCollectionField = structuredClone(cleanCollectionSummary);
  nullCollectionField.last.receiptActive = null;
  assert.ok(collectionCapacityFailures(
    nullCollectionField,
    cleanCollectionCorrectness,
    {domains: {chat: {count: 0}}},
    {durationSeconds: FULL_DURATION_SECONDS},
  ).some((message) => message.includes("receiptActive last")));
  const excessiveCheckpoints = structuredClone(cleanCollectionSummary);
  excessiveCheckpoints.last.receiptCheckpoints = 2;
  assert.ok(collectionCapacityFailures(
    excessiveCheckpoints,
    cleanCollectionCorrectness,
    {domains: {chat: {count: 0}}},
    {durationSeconds: FULL_DURATION_SECONDS},
  ).some((message) => message.includes("checkpoint delta")));
  const cleanFixture = {
    outputBytes: 104 * 1024 * 1024,
    outputLimitBytes: DEFAULT_MYSQL_CLI_OUTPUT_MAX_BUFFER_BYTES,
    outputHeadroomBytes: DEFAULT_MYSQL_CLI_OUTPUT_MAX_BUFFER_BYTES - 104 * 1024 * 1024,
    outputHeadroomRatio: round((DEFAULT_MYSQL_CLI_OUTPUT_MAX_BUFFER_BYTES - 104 * 1024 * 1024) / DEFAULT_MYSQL_CLI_OUTPUT_MAX_BUFFER_BYTES, 6),
    outputUsageRatio: round((104 * 1024 * 1024) / DEFAULT_MYSQL_CLI_OUTPUT_MAX_BUFFER_BYTES, 6),
    documentJsonBytes: 100 * 1024 * 1024,
    battleRecordJsonBytes: 49 * 1024 * 1024,
    battleTraceJsonBytes: 512 * 1024,
    battleRecords: BATTLE_RECORD_LIMIT,
    battleTrace: BATTLE_TRACE_LIMIT,
  };
  const cleanHistory = {
    initial: {
      battleRecords: BATTLE_RECORD_LIMIT,
      battleRecordOldestId: FIXTURE_OLDEST_BATTLE_RECORD_ID,
      battleRecordNewestId: FIXTURE_NEWEST_BATTLE_RECORD_ID,
      battleTrace: BATTLE_TRACE_LIMIT,
      battleTraceOldestId: FIXTURE_OLDEST_BATTLE_TRACE_ID,
      battleTraceNewestId: FIXTURE_NEWEST_BATTLE_TRACE_ID,
      battleTraceNewestType: "battle_room_closed",
    },
    final: {
      battleRecords: BATTLE_RECORD_LIMIT,
      battleRecordOldestId: "battle_record_fixture_00010",
      battleRecordNewestId: "battle_record_capacity_newest",
      battleRecordNewestRoomId: "battle_room_capacity_newest",
      battleTrace: BATTLE_TRACE_LIMIT,
      battleTraceOldestId: "battle_trace_fixture_0010",
      battleTraceNewestId: "battle_trace_capacity_newest",
      battleTraceNewestType: "battle_room_closed",
      battleTraceNewestRoomId: "battle_room_capacity_newest",
    },
    startedRoomCount: 14,
    uniqueStartedRoomCount: 14,
    closedRoomCount: 10,
    uniqueClosedRoomCount: 10,
    lastClosedRoomId: "battle_room_capacity_newest",
    newestRecordRoomWasClosedByScenario: true,
    newestTraceRoomWasStartedByScenario: true,
  };
  assert.deepEqual(capacityHistoryEvidenceFailures(cleanHistory, cleanFixture, {battleRoomsClosed: 10}), []);
  assert.ok(capacityHistoryEvidenceFailures(cleanHistory, {
    ...cleanFixture,
    outputHeadroomRatio: 0.24,
  }, {battleRoomsClosed: 10}).some((message) => message.includes("headroom ratio")));
  assert.ok(capacityHistoryEvidenceFailures({
    ...cleanHistory,
    final: {...cleanHistory.final, battleRecordOldestId: FIXTURE_OLDEST_BATTLE_RECORD_ID},
  }, cleanFixture, {battleRoomsClosed: 10}).some((message) => message.includes("oldest sentinel")));
  assert.ok(capacityHistoryEvidenceFailures({
    ...cleanHistory,
    newestRecordRoomWasClosedByScenario: false,
  }, cleanFixture, {battleRoomsClosed: 10}).some((message) => message.includes("was not closed")));
  assert.ok(checkpointCoverageFailures([], 1).length > 0, "empty authority checkpoint must fail");
  assert.deepEqual(checkpointCoverageFailures([{
    index: 1,
    lockAcquired: true,
    profilesChecked: ASSET_COUNT,
    profilesPassed: ASSET_COUNT,
    partiesChecked: BATTLE_GROUP_COUNT + CHURN_GROUP_COUNT,
    partiesPassed: BATTLE_GROUP_COUNT + CHURN_GROUP_COUNT,
    battlesChecked: BATTLE_ACTIVE_GROUPS,
    battlesPassed: BATTLE_ACTIVE_GROUPS,
  }], 1), []);
  const cleanRow = (domain, channel, targets) => ({
    domain,
    channel,
    probeId: `self.${domain}.${channel}`,
    elapsedMs: 500,
    expectedTargets: targets,
    minimumExpectedTargets: targets,
    receivedTargets: targets,
    missing: 0,
    unexpected: 0,
    duplicates: 0,
    timeouts: 0,
    cancelled: 0,
  });
  const cleanRows = [
    cleanRow("chat", "nearby", ACCOUNT_COUNT),
    cleanRow("chat", "team", BATTLE_GROUP_SIZE),
    cleanRow("party", "churn_accept", BATTLE_GROUP_SIZE),
    cleanRow("battle", "turn_resolved", BATTLE_GROUP_SIZE),
  ];
  const developmentOptions = {durationSeconds: 10};
  assert.deepEqual(
    businessEventCoverageFailures(businessEventSummaryFromRows(cleanRows, 10_000), developmentOptions),
    [],
    "current nearby chat contract must reach every active same-server client",
  );
  const oneNearbyMissing = cleanRows.map((row) => ({...row}));
  oneNearbyMissing[0].receivedTargets -= 1;
  oneNearbyMissing[0].missing = 1;
  assert.ok(businessEventCoverageFailures(businessEventSummaryFromRows(oneNearbyMissing, 10_000), developmentOptions).length > 0, "one missing nearby target must fail");
  assert.ok(businessEventCoverageFailures(businessEventSummaryFromRows([], 10_000), developmentOptions).length > 0, "completely lost business events must fail");
  const fullBusinessWindows = businessEventSummaryFromRows([
    {...cleanRows[0], elapsedMs: 60 * 1000},
    {...cleanRows[0], elapsedMs: 6 * 60 * 1000},
    {...cleanRows[0], elapsedMs: 26 * 60 * 1000},
  ], FULL_DURATION_SECONDS * 1000);
  assert.equal(fullBusinessWindows.firstWindowStartSeconds, 300);
  assert.equal(fullBusinessWindows.domains.chat.firstCount, 1);
  assert.equal(fullBusinessWindows.domains.chat.lastCount, 1);

  const trendRow = (firstP95Ms = 10, lastP95Ms = 20) => ({
    count: 20,
    failures: 0,
    p95Ms: lastP95Ms,
    p99Ms: lastP95Ms,
    first: {count: 10, p95Ms: firstP95Ms, p99Ms: firstP95Ms},
    last: {count: 10, p95Ms: lastP95Ms, p99Ms: lastP95Ms},
  });
  const fullLatency = Object.fromEntries(FULL_TREND_REQUIRED_CATEGORIES.map((category) => [category, trendRow()]));
  assert.deepEqual(fullLatencyTrendFailures(fullLatency), []);
  const missingFullLatency = {...fullLatency};
  delete missingFullLatency.movement;
  assert.ok(fullLatencyTrendFailures(missingFullLatency).some((message) => message.includes("movement full-window samples")));
  assert.ok(fullLatencyTrendFailures({...fullLatency, movement: trendRow(10, 36)}).some((message) => message.includes("movement last-window p95")));
  assert.equal(latencyTrendAllowance("party_read"), 25);
  assert.equal(latencyTrendAllowance("ws_sentinel_last"), 25);
  assert.equal(latencyTrendAllowance("chat_probe"), 50);
  const missingLatencyFailures = [];
  checkLatencyCategory({latency: {}}, "movement", 75, 150, missingLatencyFailures);
  assert.deepEqual(missingLatencyFailures, ["movement latency samples are missing"]);

  const activeClient = (index, readyAccountId = `account-${index}`) => ({
    expectedAccountId: `account-${index}`,
    upgraded: true,
    bootstrapAt: 1,
    ready: {account: {accountId: readyAccountId}},
    snapshot: {type: "online.snapshot"},
    closed: false,
    socket: {destroyed: false},
  });
  assert.deepEqual(finalClientSummary([activeClient(0), activeClient(1)], new Map(), new Set()), {
    expected: 2,
    active: 2,
    uniqueIndexes: 2,
    uniqueExpectedAccounts: 2,
    uniqueReadyAccounts: 2,
    identityMatches: 2,
    held: 0,
    paused: 0,
  });
  assert.equal(finalClientSummary([activeClient(0), activeClient(1, "account-0")], new Map(), new Set()).identityMatches, 1);

  const postDrainHealth = healthSummary([], {
    ok: true,
    json: {
      storage: {ok: true},
      transport: {activeHttp: 1, maxActiveHttp: 512},
      authWork: {active: 0, queued: 0, maxActive: 8, maxQueued: 32},
    },
  }, {
    transport: {activeHttp: 0, peakActiveHttp: 5, maxActiveHttp: 512},
  });
  assert.equal(postDrainHealth.transport.activeHttpFinal, 0, "post-drain IPC transport must override the self-observing health request");
  assert.equal(postDrainHealth.authWork.activeFinal, 0);

  const streamSummary = eventStreamSummary([], {eventStream: {
    connections: 2,
    sentFrames: 5,
    encodedFrames: 2,
    encodedBytes: 300,
    reusedFrames: 3,
    reusedBytes: 450,
    pendingPositionEvents: 0,
    peakPendingPositionEvents: 4,
    positionEventsCoalesced: 2,
    positionDrainTurns: 3,
    positionDrainBudgetMs: 4,
    positionDrainMaxMs: 4.5,
    positionEventsPerTurn: 4,
    positionClientsPerTurn: 512,
    activePositionJob: 0,
    positionClientsProcessed: 25,
    pendingPositionBatchClients: 0,
    pendingPositionBatchDeltas: 0,
    positionBatchWindowMs: 16,
    positionBatchFlushes: 6,
    positionBatchFlushMaxMs: 2.5,
    positionBatchFlushClientsMax: 200,
    positionBatchFlushGroupsMax: 20,
    currentPositionBatchBytes: 0,
    combinedBufferedBytes: 0,
    maxClientCombinedBufferedBytes: 0,
    peakClientCombinedBufferedBytes: 64000,
    combinedQueuedFrames: 0,
    maxClientCombinedQueuedFrames: 0,
    peakClientCombinedQueuedFrames: 64,
    positionBatchFrames: 10,
    positionBatchDeltas: 40,
    positionBatchBytes: 4000,
    positionBatchEncodedFrames: 2,
    positionBatchEncodedDeltas: 8,
    positionBatchEncodedBytes: 800,
    positionBatchReusedFrames: 8,
    positionBatchReusedDeltas: 32,
    positionBatchReusedBytes: 3200,
    eventTypes: {
      "online.position": {
        sentFrames: 40,
        sentBytes: 8000,
        encodedFrames: 4,
        encodedBytes: 800,
        reusedFrames: 36,
        reusedBytes: 7200,
      },
    },
  }});
  assert.equal(streamSummary.encodedFrames, 2);
  assert.equal(streamSummary.reusedFrames, 3);
  assert.equal(streamSummary.frameReuseRatio, 0.6);
  assert.equal(streamSummary.peakPendingPositionEvents, 4);
  assert.equal(streamSummary.positionEventsCoalesced, 2);
  assert.equal(streamSummary.positionDrainTurns, 3);
  assert.equal(streamSummary.positionDrainBudgetMs, 4);
  assert.equal(streamSummary.positionDrainMaxMs, 4.5);
  assert.equal(streamSummary.positionBatchWindowMs, 16);
  assert.equal(streamSummary.positionBatchFlushMaxMs, 2.5);
  assert.equal(streamSummary.activePositionJob, 0);
  assert.equal(streamSummary.positionClientsProcessed, 25);
  assert.equal(streamSummary.positionBatch.frameReductionRatio, 0.75);
  assert.equal(streamSummary.positionBatch.encodedFrames, 2);
  assert.equal(streamSummary.positionBatch.reusedDeltas, 32);
  assert.equal(streamSummary.peakClientCombinedBufferedBytes, 64000);
  assert.equal(streamSummary.peakClientCombinedQueuedFrames, 64);
  assert.deepEqual(streamSummary.onlinePositionWire, {
    sentFrames: 40,
    sentBytes: 8000,
    encodedFrames: 4,
    encodedBytes: 800,
    reusedFrames: 36,
    reusedBytes: 7200,
  });
  assert.equal(safeRatio(0, 0), 0);
  assert.deepEqual(
    metricHotspots([
      {elapsedMs: 1000, eventLoop: {p95Ms: 12, p99Ms: 20, maxMs: 25}},
      {elapsedMs: 2000, eventLoop: {p95Ms: 40, p99Ms: 50, maxMs: 60}},
      {elapsedMs: 3000, eventLoop: {p95Ms: 30, p99Ms: 35, maxMs: 45}},
    ], 2).map((row) => row.elapsedMs),
    [2000, 3000],
  );

  const reconciliationAccounts = [
    {accountId: "acc_self_a", username: "selfa"},
    {accountId: "acc_self_b", username: "selfb"},
  ];
  const reconciliation = capacityAuthoritySnapshot({
    _capacityReconciliationView(accountIds) {
      assert.deepEqual(accountIds, ["acc_self_a", "acc_self_b"]);
      return {
        profiles: {
          acc_self_a: {playerId: "player_self_a", stoneCoins: 12, bankStoneCoins: 34},
          acc_self_b: {playerId: "player_self_b", stoneCoins: 56, bankStoneCoins: 78},
        },
        parties: {
          party_self: {partyId: "party_self", leaderAccountId: "acc_self_a", memberAccountIds: ["acc_self_a", "acc_self_b"]},
        },
        battleRooms: {
          room_self: {roomId: "room_self", status: "ready", actors: [{side: "ally", accountId: "acc_self_a", kind: "player"}]},
        },
      };
    },
    durableMutationMetrics() {
      return {accepted: 0, completed: 0, pending: 0};
    },
  }, reconciliationAccounts, {transactionCount: 0}, true);
  assert.equal(reconciliation.reconciliationSource, RECONCILIATION_SOURCE);
  assert.deepEqual(reconciliation.parties.party_self.memberUsernames, ["selfa", "selfb"]);
  assert.deepEqual(reconciliation.battleRooms.room_self.actors, [{side: "ally", accountId: "acc_self_a", kind: "player"}]);
  assert.deepEqual(reconciliation.reconciliationSideEffects, {
    durableAcceptedDelta: 0,
    durableCompletedDelta: 0,
    durablePendingDelta: 0,
    transactionDelta: 0,
  });

  assert.deepEqual(capacityDurationFailures({durationMs: 120000, lastMetricElapsedMs: 118000}, {durationSeconds: 120}), []);
  assert.ok(capacityDurationFailures({durationMs: 119999, lastMetricElapsedMs: 118000}, {durationSeconds: 120}).some((message) => message.includes("scheduler duration")));
  assert.ok(capacityDurationFailures({durationMs: 120000, lastMetricElapsedMs: 117999}, {durationSeconds: 120}).some((message) => message.includes("last metric")));

  const cleanMemory = {
    steadyBaselineHeapMiB: 100,
    steadyBaselineRssMiB: 500,
    steadyBaselineExternalMiB: 20,
    steadyBaselineArrayBuffersMiB: 10,
    finalHeapMiB: 120,
    finalRssMiB: 600,
    finalExternalMiB: 40,
    finalArrayBuffersMiB: 20,
    heapGrowthMiB: 20,
    rssGrowthMiB: 100,
    externalGrowthMiB: 20,
    arrayBuffersGrowthMiB: 10,
    peakRssGrowthMiB: 384,
    sampledPeakExternalMiB: 50,
    sampledPeakArrayBuffersMiB: 30,
    sampledPeakExternalGrowthMiB: 30,
    sampledPeakArrayBuffersGrowthMiB: 20,
    heapSlopeMiBPerMinute: 1,
    rssSlopeMiBPerMinute: 2,
    externalSlopeMiBPerMinute: 2,
    arrayBuffersSlopeMiBPerMinute: 2,
    arrayBuffersExceedsExternalSamples: 0,
  };
  assert.deepEqual(capacityMemoryFailures(cleanMemory, {durationSeconds: FULL_DURATION_SECONDS}), []);
  assert.ok(capacityMemoryFailures({...cleanMemory, peakRssGrowthMiB: 384.001}, {durationSeconds: QUICK_DURATION_SECONDS}).some((message) => message.includes("peakRssGrowthMiB")));
  assert.ok(capacityMemoryFailures({...cleanMemory, externalGrowthMiB: 128.001}, {durationSeconds: QUICK_DURATION_SECONDS}).some((message) => message.includes("externalGrowthMiB")));
  assert.ok(capacityMemoryFailures({...cleanMemory, sampledPeakExternalGrowthMiB: 128.001}, {durationSeconds: QUICK_DURATION_SECONDS}).some((message) => message.includes("sampledPeakExternalGrowthMiB")));
  assert.ok(capacityMemoryFailures({...cleanMemory, sampledPeakArrayBuffersGrowthMiB: 128.001}, {durationSeconds: QUICK_DURATION_SECONDS}).some((message) => message.includes("sampledPeakArrayBuffersGrowthMiB")));
  assert.ok(capacityMemoryFailures({...cleanMemory, finalArrayBuffersMiB: 41}, {durationSeconds: QUICK_DURATION_SECONDS}).some((message) => message.includes("finalArrayBuffersMiB")));
  assert.ok(capacityMemoryFailures({...cleanMemory, externalSlopeMiBPerMinute: 2.001}, {durationSeconds: FULL_DURATION_SECONDS}).some((message) => message.includes("externalSlopeMiBPerMinute")));
  assert.equal(
    capacityMemoryFailures({...cleanMemory, heapSlopeMiBPerMinute: null}, {durationSeconds: QUICK_DURATION_SECONDS})
      .some((message) => message.includes("heapSlopeMiBPerMinute")),
    false,
  );

  assert.deepEqual(frameReuseFailures({encodedFrames: 10, reusedFrames: 10, reusedBytes: 1000, frameReuseRatio: 0.5}, 0.5), []);
  assert.ok(frameReuseFailures({encodedFrames: 10, reusedFrames: 0, reusedBytes: 0, frameReuseRatio: 0}, 0.5).length >= 3);

  assert.deepEqual(plannerTouchedRowFailures({
    maxTouchedRowsPerTransaction: 24,
    transactionTouchedRows: {p99: 20, max: 24},
  }, 64), []);
  assert.ok(plannerTouchedRowFailures({
    maxTouchedRowsPerTransaction: 65,
    transactionTouchedRows: {p99: 65, max: 65},
  }, 64).length >= 3);
  assert.ok(plannerTouchedRowFailures({
    maxTouchedRowsPerTransaction: 1,
    transactionTouchedRows: {p99: null, max: null},
  }, 64).length >= 2);

  assert.deepEqual(
    recordingOperationIdsFromStatement("INSERT INTO mutation_receipts (operation_id, document_json) VALUES ('p06c.asset.0001', '{}')"),
    ["p06c.asset.0001"],
  );
  const recordingSelfMetrics = createRecordingPoolMetrics();
  const recordingSelfPool = createRecordingPool(recordingSelfMetrics);
  const recordingSelfConnection = await recordingSelfPool.getConnection();
  await recordingSelfConnection.beginTransaction();
  await recordingSelfConnection.query("INSERT INTO mutation_receipts (operation_id, document_json) VALUES ('p06c.asset.recording-self', '{}')");
  const commitNotBeforeUnixMs = performance.timeOrigin + performance.now();
  await recordingSelfConnection.commit();
  assert.equal(Object.hasOwn(recordingPoolMetrics(recordingSelfMetrics), "operationCommitCompletedAtUnixMs"), false);
  const recordingSelfFinal = recordingPoolMetrics(recordingSelfMetrics, {includeOperationCommitTimes: true});
  assert.equal(
    Number(recordingSelfFinal.operationCommitCompletedAtUnixMs["p06c.asset.recording-self"]) >= commitNotBeforeUnixMs,
    true,
  );
  const cleanCommitTiming = assetCommitTimingSummary([
    {operationId: "p06c.asset.0001", responseObservedAtUnixMs: 110},
  ], {"p06c.asset.0001": 100});
  assert.deepEqual(assetCommitTimingFailures(cleanCommitTiming, 1), []);
  assert.ok(assetCommitTimingFailures(assetCommitTimingSummary([
    {operationId: "p06c.asset.0001", responseObservedAtUnixMs: 90},
  ], {"p06c.asset.0001": 100}), 1).some((message) => message.includes("earlyResponses")));
  assert.ok(assetCommitTimingFailures(assetCommitTimingSummary([
    {operationId: "p06c.asset.0001", responseObservedAtUnixMs: 110},
  ], {}), 1).some((message) => message.includes("missingCommits")));

  const battleStates = Array.from({length: BATTLE_GROUP_SIZE}, (_, index) => ({
    account: {accountId: `acc_battle_${index}`},
  }));
  const validBattleActors = [
    ...battleStates.flatMap((state) => [
      {side: "ally", accountId: state.account.accountId, kind: "player"},
      {side: "ally", accountId: state.account.accountId, kind: "pet"},
    ]),
    ...Array.from({length: 10}, () => ({side: "enemy", accountId: "", kind: "pet"})),
  ];
  assert.equal(capacityBattleActorRosterValidation(validBattleActors, 0, battleStates).ok, true);
  const wrongGroupActors = validBattleActors.map((actor, index) => index === 0 ? {...actor, accountId: "acc_wrong_group"} : actor);
  assert.equal(capacityBattleActorRosterValidation(wrongGroupActors, 0, battleStates).ok, false);
  const duplicateActors = validBattleActors.map((actor, index) => index === 3 ? {...actor, accountId: "acc_battle_0"} : actor);
  assert.equal(capacityBattleActorRosterValidation(duplicateActors, 0, battleStates).ok, false);

  assert.equal(capacityServerDrainReady({
    durable: {pending: 0},
    store: {recording: {activeTransactions: 0}},
    eventStream: {queuedFrames: 0, queuedBytes: 0, pendingUpgrades: 0},
  }), true);
  assert.equal(capacityServerDrainReady({
    durable: {pending: 0},
    store: {recording: {activeTransactions: 0}},
    eventStream: {queuedFrames: 1, queuedBytes: 100, pendingUpgrades: 0},
  }), false);
  assert.equal(capacityServerDrainReady({
    durable: {pending: 0},
    store: {recording: {activeTransactions: 0}},
    eventStream: {
      queuedFrames: 0,
      queuedBytes: 0,
      pendingUpgrades: 0,
      pendingPositionBatchClients: 1,
      pendingPositionBatchDeltas: 2,
      currentPositionBatchBytes: 512,
    },
  }), false);
  const exactAttackRows = [
    ...Array.from({length: 10}, () => ({status: 400, ok: false})),
    ...Array.from({length: 2}, () => ({status: 429, ok: false})),
  ];
  assert.equal(forgedXffAttackWasExactlyBounded(exactAttackRows), true);
  assert.equal(forgedXffAttackWasExactlyBounded([...exactAttackRows.slice(0, -1), {status: 500, ok: false}]), false);
  assert.deepEqual(capacityStoreReport({recording: {
    transactionCount: 1,
    operationCommitCompletedAtUnixMs: {secret: 1},
  }}), {recording: {transactionCount: 1}});
  assert.throws(() => capacityFixtureDirectory(ROOT), /outside the isolated temporary root/);
  const cleanupSelfFixture = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-p06c-capacity-self-"));
  removeCapacityFixtureDirectory(cleanupSelfFixture);
  assert.equal(fs.existsSync(cleanupSelfFixture), false);
  await runParentOnlyCleanupSelfTest("SIGTERM");
  await runParentOnlyCleanupSelfTest("SIGKILL");

  let coordinationNow = 0;
  let coordination = null;
  coordination = new ReconnectBusinessCoordination({
    now: () => coordinationNow,
    wait: async (milliseconds) => {
      coordinationNow += milliseconds;
      coordination.endBusiness();
    },
  });
  assert.equal(coordination.tryBeginBusiness(), true);
  assert.equal(coordination.tryBeginSentinel(), false);
  assert.equal(await coordination.beginReconnect(50), true);
  assert.equal(coordination.tryBeginBusiness(), false);
  assert.equal(coordination.tryBeginSentinel(), false);
  coordination.endReconnect();
  assert.equal(coordination.tryBeginBusiness(), true);
  coordination.endBusiness();
  assert.equal(coordination.tryBeginSentinel(), true);
  assert.equal(coordination.tryBeginBusiness(), false);
  coordination.endSentinel();
  assert.equal(coordination.summary().sentinelActive, false);

  let sentinelNow = 0;
  let sentinelCoordination = null;
  sentinelCoordination = new ReconnectBusinessCoordination({
    now: () => sentinelNow,
    wait: async (milliseconds) => {
      sentinelNow += milliseconds;
      sentinelCoordination.endSentinel();
    },
  });
  assert.equal(sentinelCoordination.tryBeginSentinel(), true);
  assert.equal(await sentinelCoordination.beginReconnect(50), true);
  sentinelCoordination.endReconnect();
  let timeoutNow = 0;
  const timeoutCoordination = new ReconnectBusinessCoordination({
    now: () => timeoutNow,
    wait: async (milliseconds) => { timeoutNow += milliseconds; },
  });
  assert.equal(timeoutCoordination.tryBeginBusiness(), true);
  assert.equal(await timeoutCoordination.beginReconnect(50), false);
  timeoutCoordination.endBusiness();

  process.stdout.write(`${JSON.stringify({ok: true, suites: 30})}\n`);
}

if (args.selfTest) {
  await runCapacityToolSelfTest();
} else if (args.lifecycleProbeParent) {
  await runLifecycleProbeParent();
} else if (args.lifecycleProbeWorker) {
  await runLifecycleProbeWorker();
} else if (args.serverWorker) {
  await runServerWorker();
} else {
  await runGate(args);
}
