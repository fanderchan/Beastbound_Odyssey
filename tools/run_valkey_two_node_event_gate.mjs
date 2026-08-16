#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import {execFileSync, fork, spawn} from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {
  PerformanceObserver,
  constants as performanceConstants,
  monitorEventLoopDelay,
  performance,
} from "node:perf_hooks";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {
  LatencyBook,
  RawJsonWebSocket,
  boundedTail,
  bytesToMiB,
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
const PARTITION_TRANSACTION_TIMEOUT_MS = 15000;
const PARTITION_ROW_LOCK_WAIT_TIMEOUT_SECONDS = 15;
const PARTITION_HTTP_TIMEOUT_MS = 10000;
const MYSQL_COMMIT_RECOVERY_OPERATION_ID = "bbo_mysql_commit_ack_loss_recovery_0001";
const MYSQL_COMMIT_RECOVERY_RECORD_POINT = Object.freeze({
  mapId: MAP_ID,
  spawnName: "mysql_commit_recovery",
  label: "提交恢复记录点",
});
const CAPACITY_GC_KIND_NAMES = new Map([
  [performanceConstants.NODE_PERFORMANCE_GC_MAJOR, "major"],
  [performanceConstants.NODE_PERFORMANCE_GC_MINOR, "minor"],
  [performanceConstants.NODE_PERFORMANCE_GC_INCREMENTAL, "incremental"],
  [performanceConstants.NODE_PERFORMANCE_GC_WEAKCB, "weak_callback"],
].filter(([value]) => Number.isInteger(value)));
const TAKEOVER_AUTHORITY_MARKER = "generation-2-authority-reloaded";
const TAKEOVER_DISPLAY_NAME = "跨节点接管新事实";
const TAKEOVER_CHAT_MESSAGE_ID = "chat_cluster_takeover_gate";
const TAKEOVER_CHAT_TEXT = "接管后补回的持久聊天";
const BATTLE_FAILURE_TICKET_PATTERN = /^battle_failure_[a-f0-9]{32}$/;
const CAPACITY_ACCOUNT_COUNT = 200;
const CAPACITY_QUICK_SECONDS = 120;
const CAPACITY_FULL_SECONDS = 1800;
const CAPACITY_TICK_MS = 100;
const CAPACITY_SAMPLE_MS = 1000;
const CAPACITY_CLUSTER_PATHS = Object.freeze([
  Object.freeze([[5, 5], [6, 5], [6, 6], [5, 6]]),
  Object.freeze([[28, 5], [29, 5], [29, 6], [28, 6]]),
  Object.freeze([[5, 27], [6, 27], [6, 28], [5, 28]]),
  Object.freeze([[28, 27], [29, 27], [29, 28], [28, 28]]),
]);
const CAPACITY_MAX_FAILURE_ROWS = 200;

function createCapacityGcTelemetry(enabled) {
  let available = false;
  let unavailableReason = enabled ? "gc_performance_observer_unavailable" : "capacity_mode_disabled";
  let observer = null;
  let interval = emptyCapacityGcInterval();
  const recordEntries = (entries) => {
    for (const entry of entries) {
      const durationMs = Number(entry && entry.duration);
      if (!Number.isFinite(durationMs) || durationMs < 0) {
        continue;
      }
      const detail = entry.detail && typeof entry.detail === "object" ? entry.detail : {};
      const kind = Number.isInteger(Number(detail.kind))
        ? Number(detail.kind)
        : Number(entry.kind || 0);
      const flags = Number.isInteger(Number(detail.flags))
        ? Number(detail.flags)
        : Number(entry.flags || 0);
      const kindName = CAPACITY_GC_KIND_NAMES.get(kind) || `unknown_${kind}`;
      const normalized = {
        kind,
        kindName,
        flags,
        durationMs: round(durationMs),
        startTimeMs: round(Number(entry.startTime || 0)),
      };
      interval.count += 1;
      interval.durationMs += durationMs;
      const byKind = interval.byKind[kindName] || {count: 0, durationMs: 0, maxDurationMs: 0};
      byKind.count += 1;
      byKind.durationMs += durationMs;
      byKind.maxDurationMs = Math.max(byKind.maxDurationMs, durationMs);
      interval.byKind[kindName] = byKind;
      if (!interval.maxEvent || durationMs > interval.maxEvent.durationMs) {
        interval.maxEvent = normalized;
      }
    }
  };
  if (enabled) {
    try {
      if (!PerformanceObserver.supportedEntryTypes.includes("gc")) {
        throw new Error("gc performance entries are unsupported");
      }
      observer = new PerformanceObserver((list) => recordEntries(list.getEntries()));
      observer.observe({entryTypes: ["gc"]});
      available = true;
      unavailableReason = "";
    } catch (error) {
      unavailableReason = String(error && error.message || error);
    }
  }
  return Object.freeze({
    snapshotAndReset() {
      if (observer && typeof observer.takeRecords === "function") {
        recordEntries(observer.takeRecords());
      }
      const maxEvent = interval.maxEvent ? {...interval.maxEvent} : null;
      const result = {
        available,
        unavailableReason,
        count: interval.count,
        durationMs: round(interval.durationMs),
        maxDurationMs: maxEvent ? maxEvent.durationMs : 0,
        maxEvent,
        byKind: Object.fromEntries(Object.entries(interval.byKind).map(([kindName, row]) => [kindName, {
          count: row.count,
          durationMs: round(row.durationMs),
          maxDurationMs: round(row.maxDurationMs),
        }])),
      };
      interval = emptyCapacityGcInterval();
      return result;
    },
    disconnect() {
      if (observer && typeof observer.takeRecords === "function") {
        recordEntries(observer.takeRecords());
      }
      observer?.disconnect();
      observer = null;
    },
  });
}

function emptyCapacityGcInterval() {
  return {count: 0, durationMs: 0, maxEvent: null, byKind: {}};
}

function normalizeCapacityWorkerScheduling(enabled) {
  if (!enabled || process.platform !== "darwin") {
    return {
      required: false,
      supported: process.platform === "darwin",
      success: true,
      action: enabled ? "not_required_on_non_darwin" : "capacity_mode_disabled",
    };
  }
  try {
    execFileSync("/usr/sbin/taskpolicy", ["-B", "-p", String(process.pid)], {
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
    assert.equal(crossNodeLogin.status, 503, JSON.stringify(crossNodeLogin.json));
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

    const aliceReconnectEpoch = aliceSocket.epoch;
    const aliceReconnectCursor = aliceSocket.lastEventSeq;
    assert.match(aliceReconnectEpoch, /^[A-Za-z0-9_-]{22}$/);
    assert.ok(aliceReconnectCursor > 0);

    const seededAuthority = await nodeB.rpc("seed-takeover-authority");
    assert.equal(seededAuthority.accountId, alice.accountId);
    assert.notEqual(seededAuthority.localDisplayName, TAKEOVER_DISPLAY_NAME);
    assert.equal(seededAuthority.storedDisplayName, TAKEOVER_DISPLAY_NAME);
    assert.equal(seededAuthority.storedProfileMarker, TAKEOVER_AUTHORITY_MARKER);
    assert.equal(seededAuthority.storedPartyId, "party_cluster_takeover_gate");
    assert.equal(seededAuthority.localChatMessagePresent, false);
    assert.equal(seededAuthority.storedChatMessageId, TAKEOVER_CHAT_MESSAGE_ID);
    assert.equal(seededAuthority.storedChatMessageText, TAKEOVER_CHAT_TEXT);
    assert.ok(seededAuthority.storedLatestEventSeq > seededAuthority.localLatestEventSeq);

    aliceSocket.expectedClose = true;
    await nodeA.crash();
    const conflictBeforeExpiry = await request(nodeB, "/players/position", {
      method: "POST",
      token: alice.token,
      body: positionPayload(12, 10, "east", false),
    });
    assert.equal(conflictBeforeExpiry.status, 503, JSON.stringify(conflictBeforeExpiry.json));
    assert.equal(conflictBeforeExpiry.json.code, "account_node_switching");

    // Let the crashed owner's lease expire, then make WebSocket reconnect the
    // first successful admission on the new owner. Its replay catalog and
    // online snapshot must therefore observe the authority rebase performed
    // by the owner observer, not Node B's deliberately stale service cache.
    await delay(ACCOUNT_LEASE_MS + 500);
    const aliceReconnectSocket = eventSocket(
      nodeB,
      alice,
      3,
      aliceReconnectCursor,
      aliceReconnectEpoch,
    );
    sockets.push(aliceReconnectSocket);
    const reconnectReset = aliceReconnectSocket.waitFor(
      (event) => event && event.type === "events.reset",
      EVENT_TIMEOUT_MS,
    );
    await aliceReconnectSocket.connect(EVENT_TIMEOUT_MS);
    const reconnectResetResult = await reconnectReset;
    assert.equal(aliceReconnectSocket.ready.replayMode, "reset");
    assert.equal(aliceReconnectSocket.ready.account.displayName, TAKEOVER_DISPLAY_NAME);
    assert.equal(
      aliceReconnectSocket.ready.latestEventSeq,
      seededAuthority.storedLatestEventSeq,
    );
    assert.notEqual(aliceReconnectSocket.epoch, aliceReconnectEpoch);
    assert.equal(reconnectResetResult.event.reason, "epoch_mismatch");
    assert.equal(
      reconnectResetResult.event.latestEventSeq,
      seededAuthority.storedLatestEventSeq,
    );
    assert.equal(
      aliceReconnectSocket.snapshot
      && aliceReconnectSocket.snapshot.party
      && aliceReconnectSocket.snapshot.party.partyId,
      "party_cluster_takeover_gate",
    );
    assert.equal(aliceReconnectSocket.resetCount, 1);
    assert.equal(aliceReconnectSocket.protocolErrors, 0);

    // Reset deliberately does not pretend that two node-local eventSeq spaces
    // form one replay cursor. The client responds by refetching each durable
    // domain; prove that the new owner now serves the chat gap from persistent
    // history while the party's current state already arrived in the snapshot.
    const recoveredChatHistory = await expectOk(
      nodeB,
      "/chat/messages?channel=nearby&limit=50",
      {token: alice.token},
    );
    assert.equal(recoveredChatHistory.json.channel, "nearby");
    const recoveredTakeoverChat = recoveredChatHistory.json.messages.find((message) => (
      message && message.messageId === TAKEOVER_CHAT_MESSAGE_ID
    ));
    assert.ok(recoveredTakeoverChat, JSON.stringify(recoveredChatHistory.json));
    assert.equal(recoveredTakeoverChat.text, TAKEOVER_CHAT_TEXT);
    assert.equal(recoveredTakeoverChat.senderDisplayName, TAKEOVER_DISPLAY_NAME);

    const takeoverPresence = bobSocket.waitFor((event) => (
      event
      && event.type === "online.position"
      && event.accountId === alice.accountId
      && event.change === "upsert"
      && event.player
      && event.player.position
      && event.player.position.cellX === 12
    ), EVENT_TIMEOUT_MS + ACCOUNT_LEASE_MS);
    const takeoverResponse = await expectOk(nodeB, "/players/position", {
      method: "POST",
      token: alice.token,
      body: positionPayload(12, 10, "east", false),
    });
    const takeoverEvent = await takeoverPresence;
    assert.ok(takeoverResponse.json.presenceRevision >= 2_000_000_001);
    assert.equal(takeoverEvent.event.presenceRevision, takeoverResponse.json.presenceRevision);
    assert.ok(takeoverEvent.event.presenceRevision > remotePositionResult.event.presenceRevision);
    const takeoverHealth = await clusterHealth(nodeB);
    assert.equal(takeoverHealth.status, 200);
    assert.equal(takeoverHealth.json.accountOwnership.ok, true);
    const takeoverAuthority = await nodeB.rpc("probe-takeover-authority");
    assert.equal(takeoverAuthority.displayName, TAKEOVER_DISPLAY_NAME);
    assert.equal(takeoverAuthority.profileMarker, TAKEOVER_AUTHORITY_MARKER);
    assert.equal(takeoverAuthority.partyId, "party_cluster_takeover_gate");
    assert.ok(takeoverAuthority.recoveryMetrics.authorityReloads >= 1);

    for (const socket of sockets) {
      socket.close();
    }
    await Promise.all([
      nodeB.stop(),
    ]);
    nodeB = null;
    const battleOwnerFailure = await runBattleOwnerFailureSubgate({
      temporaryRoot,
      valkeyPort,
      streamKey: `${streamKey}:battle-owner-failure`,
    });
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
      takeoverAuthorityReloadFromAdvancedStoreFixtureProven: true,
      persistentProfileAndPartyAuthorityReloadProven: true,
      takeoverWebSocketFirstSuccessfulAdmission: true,
      ownerEpochResetBeforeReconnectSnapshot: true,
      persistentReconnectStateHydrationProven: true,
      partyCurrentStateHydrationProven: true,
      persistentChatHistoryHydrationProven: true,
      crossOwnerChatAndPartyRecoveryProven: true,
      partyAndBattleAuthorityTakeoverProven: false,
      battleOwnerFailureNodeProcesses: battleOwnerFailure.independentGameNodeProcesses,
      battleOwnerFailureSharedJsonAuthorityFixtureProven: battleOwnerFailure.sharedJsonAuthorityFixtureProven,
      battleOwnerFailureGenerationTwoTakeoverProven: battleOwnerFailure.generationTwoTakeoverProven,
      battleOwnerFailureTicketTakeoverProven: battleOwnerFailure.ticketTakeoverProven,
      battleOwnerFailureNeutralRecoveryProven: battleOwnerFailure.neutralRecoveryProven,
      battleOwnerFailureStableRecoveryReplayProven: battleOwnerFailure.stableRecoveryReplayProven,
      battleOwnerFailureWinLossUnaffected: battleOwnerFailure.winLossUnaffected,
      battleParticipantsCanRematchAfterRecovery: battleOwnerFailure.participantsCanRematch,
      sharedMysqlBattleTakeoverProven: false,
      crossNodeNormalBattleCommandRoutingProven: false,
      reconnectEventReplayProven: false,
      battleRuntimeReconnectHydrationProven: false,
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

async function runMysqlBattleOwnerFailureGate() {
  // Empty credentials are deliberate for the disposable initialize-insecure
  // process. Scrub inherited player-server values without reading them.
  process.env.BEASTBOUND_MYSQL_PASSWORD = "";
  process.env.MYSQL_PWD = "";
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-two-node-mysql-gate-"));
  const database = `beastbound_cluster_battle_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  let mysqlRuntime = null;
  let admin = null;
  let bootstrap = null;
  let valkey = null;
  let report = null;
  let failure = null;
  let databaseDropped = false;
  const cleanupErrors = [];
  try {
    mysqlRuntime = await startIsolatedMysql({
      runtimePrefix: "beastbound-cluster-battle-mysql",
      maxConnections: 50,
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
    const fixture = clusterFixture(Date.now(), 0);
    await withTimeout(
      bootstrap.saveAsync(mysqlBattleAuthorityFixture(empty, fixture.data)),
      15000,
      "isolated MySQL cluster battle fixture bootstrap timeout",
    );
    await withTimeout(bootstrap.close(), 10000, "isolated MySQL bootstrap close timeout");
    bootstrap = null;

    const seeded = await loadMysqlBattleAuthority(mysqlRuntime, database);
    assert.equal(Object.keys(seeded.accounts || {}).length, fixture.accounts.length);
    assert.equal(Object.keys(seeded.sessions || {}).length, fixture.accounts.length);

    const valkeyPort = await reserveLoopbackPort();
    const streamKey = `beastbound:test:two-node:mysql-battle:${process.pid}`;
    valkey = startValkey(valkeyPort, temporaryRoot);
    await waitForLoopback(valkeyPort, valkey);
    const battleOwnerFailure = await runBattleOwnerFailureSubgate({
      temporaryRoot,
      valkeyPort,
      streamKey,
      mysqlConfiguration: {
        port: mysqlRuntime.port,
        database,
        mysqlPath: mysqlRuntime.mysqlPath,
      },
      loadPersistedAuthority: () => loadMysqlBattleAuthority(mysqlRuntime, database),
    });

    let activity = null;
    await waitFor(async () => {
      activity = await isolatedMysqlActivity(admin);
      return activity.activeTransactions === 0 && activity.activeLockWaits === 0;
    }, 5000, "isolated MySQL battle gate left active transactions or lock waits");
    const deadlocksAfter = await isolatedMysqlDeadlockCount(admin);
    assert.equal(deadlocksAfter - deadlocksBefore, 0);
    const globalsAfter = await isolatedMysqlGlobalValues(admin);
    assert.deepEqual(globalsAfter, globalsBefore);
    report = {
      status: "PASS",
      gate: "valkey_two_node_isolated_mysql_battle_owner_failure",
      engine: "real_loopback_valkey_and_isolated_mysql",
      mysqlVersion,
      isolatedMysql: true,
      sharedPlayerDatabaseTouched: false,
      mysqlPortIsNot3306: mysqlRuntime.port !== 3306,
      independentGameNodeProcesses: battleOwnerFailure.independentGameNodeProcesses,
      independentHttpAndWebSocketPorts: true,
      sharedMysqlBattleTakeoverProven: battleOwnerFailure.sharedMysqlAuthorityFixtureProven,
      battleOwnerFailureGenerationTwoTakeoverProven: battleOwnerFailure.generationTwoTakeoverProven,
      battleOwnerFailureTicketTakeoverProven: battleOwnerFailure.ticketTakeoverProven,
      battleOwnerFailureNeutralRecoveryProven: battleOwnerFailure.neutralRecoveryProven,
      battleOwnerFailureStableRecoveryReplayProven: battleOwnerFailure.stableRecoveryReplayProven,
      battleOwnerFailureWinLossUnaffected: battleOwnerFailure.winLossUnaffected,
      battleParticipantsCanRematchAfterRecovery: battleOwnerFailure.participantsCanRematch,
      mysqlGlobalValuesUnchanged: true,
      mysqlDeadlockDelta: deadlocksAfter - deadlocksBefore,
      mysqlResidualTransactions: activity.activeTransactions,
      mysqlResidualLockWaits: activity.activeLockWaits,
      crossNodeNormalBattleCommandRoutingProven: false,
      battleRuntimeReconnectHydrationProven: false,
      networkPartitionRecoveryProven: false,
      twoHundredConnectionSoakProven: false,
      persistentServiceStarted: false,
    };
  } catch (error) {
    failure = error;
  } finally {
    if (bootstrap) {
      try {
        await withTimeout(bootstrap.close(), 10000, "isolated MySQL bootstrap cleanup timeout");
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (admin) {
      try {
        await admin.query(`DROP DATABASE IF EXISTS \`${mysqlDatabaseIdentifier(database)}\``);
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
  if (failure) {
    process.stderr.write(`${JSON.stringify({
      status: "FAIL",
      gate: "valkey_two_node_isolated_mysql_battle_owner_failure",
      code: String(failure && failure.code || "isolated_mysql_battle_gate_failed"),
      message: String(failure && failure.message || "isolated MySQL battle gate failed"),
      databaseDropped,
      mysqlCleanupVerified,
      temporaryStateRemoved,
    }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  assert.ok(report);
  assert.equal(databaseDropped, true);
  assert.equal(mysqlCleanupVerified, true);
  assert.equal(temporaryStateRemoved, true);
  process.stdout.write(`${JSON.stringify({
    ...report,
    temporaryDatabaseDropped: databaseDropped,
    mysqlCleanupVerified,
    temporaryStateRemoved,
  }, null, 2)}\n`);
}

async function runMysqlBattleCommandRoutingGate() {
  // This lane owns disposable initialize-insecure infrastructure. Never read or
  // inherit credentials for the normal player database while constructing it.
  process.env.BEASTBOUND_MYSQL_PASSWORD = "";
  process.env.MYSQL_PWD = "";
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-battle-routing-gate-"));
  const database = `beastbound_battle_route_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  let mysqlRuntime = null;
  let admin = null;
  let bootstrap = null;
  let valkey = null;
  let report = null;
  let failure = null;
  let databaseDropped = false;
  const cleanupErrors = [];
  try {
    mysqlRuntime = await startIsolatedMysql({
      runtimePrefix: "beastbound-battle-routing-mysql",
      maxConnections: 50,
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
    const fixture = clusterFixture(Date.now(), 0);
    await withTimeout(
      bootstrap.saveAsync(mysqlBattleAuthorityFixture(empty, fixture.data)),
      15000,
      "isolated MySQL cross-node battle routing fixture bootstrap timeout",
    );
    await withTimeout(bootstrap.close(), 10000, "isolated MySQL battle routing bootstrap close timeout");
    bootstrap = null;

    const seeded = await loadMysqlBattleAuthority(mysqlRuntime, database);
    assert.equal(Object.keys(seeded.accounts || {}).length, fixture.accounts.length);
    assert.equal(Object.keys(seeded.sessions || {}).length, fixture.accounts.length);

    const valkeyPort = await reserveLoopbackPort();
    const streamKey = `beastbound:test:two-node:battle-routing:${process.pid}`;
    valkey = startValkey(valkeyPort, temporaryRoot);
    await waitForLoopback(valkeyPort, valkey);
    const routing = await runBattleCommandRoutingSubgate({
      valkeyPort,
      streamKey,
      mysqlConfiguration: {
        port: mysqlRuntime.port,
        database,
        mysqlPath: mysqlRuntime.mysqlPath,
      },
      loadPersistedAuthority: () => loadMysqlBattleAuthority(mysqlRuntime, database),
    });

    const streamText = await readValkeyStreamText(valkeyPort, streamKey);
    const lowerStreamText = streamText.toLowerCase();
    assert.equal(streamText.includes(routing.challengerToken), false);
    assert.equal(streamText.includes(routing.opponentToken), false);
    assert.equal(streamText.includes(FIXTURE_PASSWORD), false);
    assert.equal(lowerStreamText.includes("authorization"), false);
    assert.equal(lowerStreamText.includes("bearer "), false);
    assert.equal(streamText.includes("cluster.control.battle.state.request"), true);
    assert.equal(streamText.includes("cluster.control.battle.command.request"), true);
    assert.equal(streamText.includes("cluster.control.battle.command.response"), true);

    let activity = null;
    await waitFor(async () => {
      activity = await isolatedMysqlActivity(admin);
      return activity.activeTransactions === 0 && activity.activeLockWaits === 0;
    }, 5000, "isolated MySQL battle routing gate left active transactions or lock waits");
    const deadlocksAfter = await isolatedMysqlDeadlockCount(admin);
    assert.equal(deadlocksAfter - deadlocksBefore, 0);
    const globalsAfter = await isolatedMysqlGlobalValues(admin);
    assert.deepEqual(globalsAfter, globalsBefore);
    report = {
      status: "PASS",
      gate: "valkey_two_node_isolated_mysql_battle_command_routing",
      engine: "two_independent_node_processes_real_loopback_valkey_and_isolated_mysql",
      mysqlVersion,
      isolatedMysql: true,
      sharedPlayerDatabaseTouched: false,
      mysqlPortIsNot3306: mysqlRuntime.port !== 3306,
      independentGameNodeProcesses: routing.independentGameNodeProcesses,
      independentHttpAndWebSocketPorts: true,
      crossNodeBattleStateDelegationProven: routing.crossNodeBattleStateDelegationProven,
      crossNodeNormalBattleCommandRoutingProven: routing.crossNodeNormalBattleCommandRoutingProven,
      remoteCommandExecutedExactlyOnce: routing.remoteCommandExecutedExactlyOnce,
      exactReplayStable: routing.exactReplayStable,
      alteredReplayRejected: routing.alteredReplayRejected,
      roundResolvedExactlyOnce: routing.roundResolvedExactlyOnce,
      publicBattleEventsReachedBothNodes: routing.publicBattleEventsReachedBothNodes,
      clusterControlFramesHiddenFromPlayerWebSockets: routing.clusterControlFramesHiddenFromPlayerWebSockets,
      staleOwnerControlRejected: routing.staleOwnerControlRejected,
      staleOwnerHttpRejectedBeforeExecution: routing.staleOwnerHttpRejectedBeforeExecution,
      runtimeOnlyBattleRoomStayedOnOwnerNode: routing.runtimeOnlyBattleRoomStayedOnOwnerNode,
      persistentFailureTicketsPreserved: routing.persistentFailureTicketsPreserved,
      rawBearerAndPasswordAbsentFromValkeyStream: true,
      mysqlGlobalValuesUnchanged: true,
      mysqlDeadlockDelta: deadlocksAfter - deadlocksBefore,
      mysqlResidualTransactions: activity.activeTransactions,
      mysqlResidualLockWaits: activity.activeLockWaits,
      battleRuntimeReconnectHydrationProven: false,
      networkPartitionRecoveryProven: false,
      twoHundredConnectionSoakProven: false,
      persistentServiceStarted: false,
    };
  } catch (error) {
    failure = error;
  } finally {
    if (bootstrap) {
      try {
        await withTimeout(bootstrap.close(), 10000, "isolated MySQL battle routing bootstrap cleanup timeout");
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (admin) {
      try {
        await admin.query(`DROP DATABASE IF EXISTS \`${mysqlDatabaseIdentifier(database)}\``);
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
  if (failure) {
    process.stderr.write(`${JSON.stringify({
      status: "FAIL",
      gate: "valkey_two_node_isolated_mysql_battle_command_routing",
      code: String(failure && failure.code || "isolated_mysql_battle_routing_gate_failed"),
      message: String(failure && failure.message || "isolated MySQL battle routing gate failed"),
      databaseDropped,
      mysqlCleanupVerified,
      temporaryStateRemoved,
    }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  assert.ok(report);
  assert.equal(databaseDropped, true);
  assert.equal(mysqlCleanupVerified, true);
  assert.equal(temporaryStateRemoved, true);
  process.stdout.write(`${JSON.stringify({
    ...report,
    temporaryDatabaseDropped: databaseDropped,
    mysqlCleanupVerified,
    temporaryStateRemoved,
  }, null, 2)}\n`);
}

async function runMysqlBattleRuntimeHydrationGate() {
  // This lane owns disposable initialize-insecure infrastructure and never
  // reads credentials for the normal player database.
  process.env.BEASTBOUND_MYSQL_PASSWORD = "";
  process.env.MYSQL_PWD = "";
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-battle-hydration-gate-"));
  const database = `beastbound_battle_hydrate_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  let mysqlRuntime = null;
  let admin = null;
  let bootstrap = null;
  let valkey = null;
  let report = null;
  let failure = null;
  let databaseDropped = false;
  const cleanupErrors = [];
  try {
    mysqlRuntime = await startIsolatedMysql({
      runtimePrefix: "beastbound-battle-hydration-mysql",
      maxConnections: 50,
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
    const fixture = clusterFixture(Date.now(), 0);
    await withTimeout(
      bootstrap.saveAsync(mysqlBattleAuthorityFixture(empty, fixture.data)),
      15000,
      "isolated MySQL battle hydration fixture bootstrap timeout",
    );
    await withTimeout(bootstrap.close(), 10000, "isolated MySQL battle hydration bootstrap close timeout");
    bootstrap = null;

    const valkeyPort = await reserveLoopbackPort();
    const streamKey = `beastbound:test:two-node:battle-hydration:${process.pid}`;
    valkey = startValkey(valkeyPort, temporaryRoot);
    await waitForLoopback(valkeyPort, valkey);
    const hydration = await runBattleRuntimeHydrationSubgate({
      valkeyPort,
      streamKey,
      mysqlConfiguration: {
        port: mysqlRuntime.port,
        database,
        mysqlPath: mysqlRuntime.mysqlPath,
      },
      loadPersistedAuthority: () => loadMysqlBattleAuthority(mysqlRuntime, database),
    });

    const streamText = await readValkeyStreamText(valkeyPort, streamKey);
    const lowerStreamText = streamText.toLowerCase();
    assert.equal(streamText.includes(hydration.challengerToken), false);
    assert.equal(streamText.includes(hydration.opponentToken), false);
    assert.equal(streamText.includes(FIXTURE_PASSWORD), false);
    assert.equal(lowerStreamText.includes("authorization"), false);
    assert.equal(lowerStreamText.includes("bearer "), false);
    assert.equal(streamText.includes("cluster.control.battle.state.request"), true);

    let activity = null;
    await waitFor(async () => {
      activity = await isolatedMysqlActivity(admin);
      return activity.activeTransactions === 0 && activity.activeLockWaits === 0;
    }, 5000, "isolated MySQL battle hydration gate left active transactions or lock waits");
    const deadlocksAfter = await isolatedMysqlDeadlockCount(admin);
    assert.equal(deadlocksAfter - deadlocksBefore, 0);
    const globalsAfter = await isolatedMysqlGlobalValues(admin);
    assert.deepEqual(globalsAfter, globalsBefore);
    report = {
      status: "PASS",
      gate: "valkey_two_node_isolated_mysql_battle_runtime_hydration",
      engine: "two_independent_node_processes_real_loopback_valkey_and_isolated_mysql",
      mysqlVersion,
      isolatedMysql: true,
      sharedPlayerDatabaseTouched: false,
      mysqlPortIsNot3306: mysqlRuntime.port !== 3306,
      independentGameNodeProcesses: hydration.independentGameNodeProcesses,
      independentHttpAndWebSocketPorts: true,
      roomOwnerCrashedWithSigkill: hydration.roomOwnerCrashedWithSigkill,
      halfFinishedRoundHydrated: hydration.halfFinishedRoundHydrated,
      submittedCommandPreserved: hydration.submittedCommandPreserved,
      randomAuthorityContinuationHydrated: hydration.randomAuthorityContinuationHydrated,
      exactNonterminalReplayStable: hydration.exactNonterminalReplayStable,
      alteredReplayRejected: hydration.alteredReplayRejected,
      roundResolvedExactlyOnceAfterTakeover: hydration.roundResolvedExactlyOnceAfterTakeover,
      runtimeOnlyBattleRoomStayedOutOfMysql: hydration.runtimeOnlyBattleRoomStayedOutOfMysql,
      persistentFailureTicketsPreserved: hydration.persistentFailureTicketsPreserved,
      runtimeTakeovers: hydration.runtimeTakeovers,
      runtimeCheckpoints: hydration.runtimeCheckpoints,
      rawBearerAndPasswordAbsentFromValkeyStream: true,
      mysqlGlobalValuesUnchanged: true,
      mysqlDeadlockDelta: deadlocksAfter - deadlocksBefore,
      mysqlResidualTransactions: activity.activeTransactions,
      mysqlResidualLockWaits: activity.activeLockWaits,
      battleRuntimeReconnectHydrationProven: true,
      networkPartitionRecoveryProven: false,
      twoHundredConnectionSoakProven: false,
      persistentServiceStarted: false,
    };
  } catch (error) {
    failure = error;
  } finally {
    if (bootstrap) {
      try {
        await withTimeout(bootstrap.close(), 10000, "isolated MySQL battle hydration bootstrap cleanup timeout");
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (admin) {
      try {
        await admin.query(`DROP DATABASE IF EXISTS \`${mysqlDatabaseIdentifier(database)}\``);
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
  if (failure) {
    process.stderr.write(`${JSON.stringify({
      status: "FAIL",
      gate: "valkey_two_node_isolated_mysql_battle_runtime_hydration",
      code: String(failure && failure.code || "isolated_mysql_battle_hydration_gate_failed"),
      message: String(failure && failure.message || "isolated MySQL battle hydration gate failed"),
      databaseDropped,
      mysqlCleanupVerified,
      temporaryStateRemoved,
    }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  assert.ok(report);
  assert.equal(databaseDropped, true);
  assert.equal(mysqlCleanupVerified, true);
  assert.equal(temporaryStateRemoved, true);
  process.stdout.write(`${JSON.stringify({
    ...report,
    temporaryDatabaseDropped: databaseDropped,
    mysqlCleanupVerified,
    temporaryStateRemoved,
  }, null, 2)}\n`);
}

async function runValkeyPartitionOldOwnerFenceGate() {
  // The gate owns a disposable initialize-insecure MySQL. Never inherit or
  // inspect player-server credentials while constructing this fault lane.
  process.env.BEASTBOUND_MYSQL_PASSWORD = "";
  process.env.MYSQL_PWD = "";
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-valkey-partition-gate-"));
  const database = `beastbound_partition_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  let mysqlRuntime = null;
  let admin = null;
  let observer = null;
  let lockConnection = null;
  let lockHeld = false;
  let bootstrap = null;
  let valkey = null;
  let proxy = null;
  let ownerNode = null;
  let successorNode = null;
  let report = null;
  let failure = null;
  let databaseDropped = false;
  const cleanupErrors = [];
  try {
    mysqlRuntime = await startIsolatedMysql({
      runtimePrefix: "beastbound-valkey-partition-mysql",
      maxConnections: 50,
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
    const fixture = clusterFixture(Date.now(), 0);
    await withTimeout(
      bootstrap.saveAsync(mysqlBattleAuthorityFixture(empty, fixture.data)),
      15000,
      "Valkey partition fixture bootstrap timeout",
    );
    await withTimeout(bootstrap.close(), 10000, "Valkey partition bootstrap close timeout");
    bootstrap = null;
    const ownerMysqlUser = "partition_owner_a";
    const successorMysqlUser = "partition_successor_b";
    for (const user of [ownerMysqlUser, successorMysqlUser]) {
      await admin.query(`CREATE USER '${user}'@'127.0.0.1' IDENTIFIED BY ''`);
      await admin.query(
        `GRANT ALL PRIVILEGES ON \`${mysqlDatabaseIdentifier(database)}\`.* TO '${user}'@'127.0.0.1'`,
      );
    }

    const databaseConnectionOptions = {
      ...mysqlRuntime.connectionOptions,
      database: mysqlDatabaseIdentifier(database),
    };
    observer = await mysql.createConnection(databaseConnectionOptions);
    lockConnection = await mysql.createConnection(databaseConnectionOptions);

    const valkeyPort = await reserveLoopbackPort();
    valkey = startValkey(valkeyPort, temporaryRoot);
    await waitForLoopback(valkeyPort, valkey);
    proxy = await startCuttableTcpProxy(valkeyPort);
    const streamKey = `beastbound:test:valkey-partition:${process.pid}`;
    const mysqlConfiguration = {
      port: mysqlRuntime.port,
      database,
      mysqlPath: mysqlRuntime.mysqlPath,
      transactionTimeoutMs: PARTITION_TRANSACTION_TIMEOUT_MS,
      rowLockWaitTimeoutSeconds: PARTITION_ROW_LOCK_WAIT_TIMEOUT_SECONDS,
    };
    ownerNode = await NodeWorker.start({
      nodeId: "partition-owner-a",
      valkeyPort: proxy.port,
      streamKey,
      serviceEventSeq: 0,
      mysqlConfiguration: {...mysqlConfiguration, user: ownerMysqlUser},
    });
    successorNode = await NodeWorker.start({
      nodeId: "partition-successor-b",
      valkeyPort,
      streamKey,
      serviceEventSeq: 0,
      mysqlConfiguration: {...mysqlConfiguration, user: successorMysqlUser},
    });
    assert.deepEqual(ownerNode.fixtureDigest, successorNode.fixtureDigest);
    await Promise.all([
      waitForClusterReady(ownerNode),
      waitForClusterReady(successorNode),
    ]);

    const challenger = fixtureAccount(ownerNode.accounts, "battle_challenger");
    const opponent = fixtureAccount(ownerNode.accounts, "battle_opponent");
    await expectOk(ownerNode, "/players/position", {
      method: "POST",
      token: challenger.token,
      body: positionPayload(20, 20, "east", false),
    });
    await expectOk(ownerNode, "/players/position", {
      method: "POST",
      token: opponent.token,
      body: positionPayload(21, 20, "west", false),
    });
    const invite = await expectOk(ownerNode, "/battle/invite", {
      method: "POST",
      token: challenger.token,
      body: {username: opponent.username},
    });

    const revisionBefore = await isolatedMysqlAuthRevision(observer);
    await lockConnection.beginTransaction();
    lockHeld = true;
    const [lockedRows] = await lockConnection.query(
      "SELECT revision FROM auth_store_revisions WHERE scope_key = 'auth' FOR UPDATE",
    );
    assert.equal(Number(lockedRows[0] && lockedRows[0].revision), revisionBefore);

    const oldWriteStartedAt = Date.now();
    const oldAcceptSettlement = request(
      ownerNode,
      `/battle/invites/${encodeURIComponent(invite.json.invite.inviteId)}/accept`,
      {
        method: "POST",
        token: opponent.token,
        timeoutMs: PARTITION_HTTP_TIMEOUT_MS,
      },
    ).then((value) => ({ok: true, value}), (error) => ({ok: false, error}));
    let peakLockWaits = 0;
    await waitFor(async () => {
      const activity = await isolatedMysqlActivity(observer);
      peakLockWaits = Math.max(peakLockWaits, activity.activeLockWaits);
      return activity.activeLockWaits > 0;
    }, 5000, "old owner durable battle write did not enter the injected MySQL lock wait");
    assert.ok(proxy.connectedPairs() > 0);

    const partitionStartedAt = Date.now();
    await proxy.cut();
    const successorHealthDuringPartition = await clusterHealth(successorNode);
    assert.equal(successorHealthDuringPartition.status, 200);
    assert.equal(successorHealthDuringPartition.json.ok, true);
    assert.equal(successorHealthDuringPartition.json.eventStream.clusterRelay.runtimeHealthy, true);
    const conflictBeforeExpiry = await request(successorNode, "/battle/state", {
      token: challenger.token,
    });
    assert.equal(conflictBeforeExpiry.status, 503, JSON.stringify(conflictBeforeExpiry.json));
    assert.equal(conflictBeforeExpiry.json.code, "account_node_switching");

    const oldAcceptSettlementResult = await oldAcceptSettlement;
    if (!oldAcceptSettlementResult.ok) {
      throw oldAcceptSettlementResult.error;
    }
    const oldAccept = oldAcceptSettlementResult.value;
    assert.equal(oldAccept.status, 503, JSON.stringify(oldAccept.json));
    assert.equal(oldAccept.json.code, "storage_write_failed");
    const oldWriteFailedAfterMs = Date.now() - oldWriteStartedAt;
    assert.ok(oldWriteFailedAfterMs < PARTITION_ROW_LOCK_WAIT_TIMEOUT_SECONDS * 1000 - 1000);

    const ownerExit = await ownerNode.waitForExit(10000);
    assert.equal(ownerExit.code, 1);
    assert.equal(ownerExit.signal, null);
    assert.ok(ownerNode.fatalCodes.some((code) => [
      "cluster_account_owner_lease_expired",
      "cluster_valkey_node_lease_expired",
    ].includes(code)), JSON.stringify(ownerNode.diagnostic()));
    const ownerExitedBeforeLockRelease = lockHeld;
    assert.equal(ownerExitedBeforeLockRelease, true);
    const fencedLockWaitsBeforeRelease = await isolatedMysqlLockWaitDetails(observer);
    assert.equal(fencedLockWaitsBeforeRelease.length, 1);
    assert.equal(fencedLockWaitsBeforeRelease[0].objectName, "auth_store_revisions");
    assert.equal(fencedLockWaitsBeforeRelease[0].lockData, "'auth'");
    assert.match(fencedLockWaitsBeforeRelease[0].requestingStatement, /FOR UPDATE$/);
    await lockConnection.rollback();
    lockHeld = false;
    await lockConnection.end();
    lockConnection = null;
    const liveActivityAfterFence = await isolatedMysqlLiveActivity(observer);
    assert.equal(liveActivityAfterFence.activeTransactions, 0);
    assert.equal(liveActivityAfterFence.activeLockWaits, 0);

    const revisionAfterFailedOldWrite = await isolatedMysqlAuthRevision(observer);
    assert.equal(revisionAfterFailedOldWrite, revisionBefore);
    const authorityAfterFailedOldWrite = await loadMysqlBattleAuthority(mysqlRuntime, database);
    assert.equal((authorityAfterFailedOldWrite.battleRecords || []).length, 0);
    assert.equal(Object.keys(authorityAfterFailedOldWrite.battleRooms || {}).length, 0);
    assert.equal(battleFailureTicketCount(authorityAfterFailedOldWrite, [challenger, opponent]), 0);

    const remainingLeaseWaitMs = Math.max(
      0,
      ACCOUNT_LEASE_MS + 500 - (Date.now() - partitionStartedAt),
    );
    if (remainingLeaseWaitMs > 0) {
      await delay(remainingLeaseWaitMs);
    }
    const challengerPosition = await expectOk(successorNode, "/players/position", {
      method: "POST",
      token: challenger.token,
      body: positionPayload(20, 20, "east", false),
    });
    const opponentPosition = await expectOk(successorNode, "/players/position", {
      method: "POST",
      token: opponent.token,
      body: positionPayload(21, 20, "west", false),
    });
    assert.ok(challengerPosition.json.presenceRevision >= 2_000_000_001);
    assert.ok(opponentPosition.json.presenceRevision >= 2_000_000_001);
    const successorInvite = await expectOk(successorNode, "/battle/invite", {
      method: "POST",
      token: challenger.token,
      body: {username: opponent.username},
    });
    const successorAccept = await expectOk(
      successorNode,
      `/battle/invites/${encodeURIComponent(successorInvite.json.invite.inviteId)}/accept`,
      {method: "POST", token: opponent.token},
    );
    assert.equal(successorAccept.json.room.status, "ready");
    const successorRevision = await isolatedMysqlAuthRevision(observer);
    assert.equal(successorRevision, revisionBefore + 1);
    const authorityAfterSuccessorCommit = await loadMysqlBattleAuthority(mysqlRuntime, database);
    assert.equal(battleFailureTicketCount(authorityAfterSuccessorCommit, [challenger, opponent]), 2);
    assert.equal((authorityAfterSuccessorCommit.battleRecords || []).length, 0);

    await successorNode.stop();
    successorNode = null;
    const ownerDiagnostic = ownerNode.diagnostic();
    ownerNode = null;
    let activity = null;
    await waitFor(async () => {
      activity = await isolatedMysqlLiveActivity(observer);
      return activity.activeTransactions === 0 && activity.activeLockWaits === 0;
    }, 5000, "Valkey partition gate left active MySQL transactions or lock waits");
    const instrumentationActivity = await isolatedMysqlActivity(observer);
    const deadlocksAfter = await isolatedMysqlDeadlockCount(observer);
    assert.equal(deadlocksAfter - deadlocksBefore, 0);
    const globalsAfter = await isolatedMysqlGlobalValues(observer);
    assert.deepEqual(globalsAfter, globalsBefore);
    report = {
      status: "PASS",
      gate: "valkey_single_node_partition_old_owner_write_fence",
      engine: "real_cuttable_tcp_valkey_and_isolated_mysql",
      mysqlVersion,
      isolatedMysql: true,
      sharedPlayerDatabaseTouched: false,
      mysqlPortIsNot3306: mysqlRuntime.port !== 3306,
      independentGameNodeProcesses: 2,
      partitionScopedToOldNodeValkeyLink: true,
      successorValkeyLinkStayedHealthy: true,
      oldWriteEnteredMysqlLockWait: peakLockWaits > 0,
      oldWriteSpannedLeaseFatal: ownerDiagnostic.fatalCodes.length > 0,
      oldOwnerTransactionFenceProven: true,
      serverSideBlockedStatementOutlivedClientFence: fencedLockWaitsBeforeRelease.length === 1,
      oldOwnerCommitAfterLeaseLoss: false,
      oldOwnerExitedBeforeInjectedLockRelease: ownerExitedBeforeLockRelease,
      oldOwnerFatalExitCode: ownerDiagnostic.exitCode,
      oldWriteFailedAfterMs,
      configuredRowLockWaitTimeoutMs: PARTITION_ROW_LOCK_WAIT_TIMEOUT_SECONDS * 1000,
      failedOldWriteAuthRevisionDelta: revisionAfterFailedOldWrite - revisionBefore,
      successorGenerationTwoTakeoverProven: true,
      successorBattleCommitProven: true,
      successorAuthRevisionDelta: successorRevision - revisionBefore,
      mysqlGlobalValuesUnchanged: true,
      mysqlDeadlockDelta: deadlocksAfter - deadlocksBefore,
      mysqlResidualTransactions: activity.activeTransactions,
      mysqlResidualLockWaits: activity.activeLockWaits,
      mysqlDetachedInstrumentationTransactionsBeforeInstanceStop: Math.max(
        0,
        instrumentationActivity.activeTransactions - activity.activeTransactions,
      ),
      mysqlDetachedInstrumentationLockWaitsBeforeInstanceStop: Math.max(
        0,
        instrumentationActivity.activeLockWaits - activity.activeLockWaits,
      ),
      broadNetworkPartitionRecoveryProven: false,
      mysqlNetworkPartitionRecoveryProven: false,
      crossNodeNormalBattleCommandRoutingProven: false,
      battleRuntimeReconnectHydrationProven: false,
      twoHundredConnectionSoakProven: false,
      persistentServiceStarted: false,
    };
  } catch (error) {
    failure = error;
  } finally {
    if (proxy) {
      try {
        await proxy.close();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    const nodeCleanup = await Promise.allSettled([
      ownerNode && ownerNode.stop(false),
      successorNode && successorNode.stop(false),
    ]);
    for (const result of nodeCleanup) {
      if (result.status === "rejected") {
        cleanupErrors.push(result.reason);
      }
    }
    if (lockHeld && lockConnection) {
      try {
        await lockConnection.rollback();
        lockHeld = false;
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    for (const connection of [lockConnection, observer]) {
      if (!connection) {
        continue;
      }
      try {
        await connection.end();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (bootstrap) {
      try {
        await withTimeout(bootstrap.close(), 10000, "Valkey partition bootstrap cleanup timeout");
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (admin) {
      try {
        await admin.query(`DROP DATABASE IF EXISTS \`${mysqlDatabaseIdentifier(database)}\``);
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
  if (failure) {
    process.stderr.write(`${JSON.stringify({
      status: "FAIL",
      gate: "valkey_single_node_partition_old_owner_write_fence",
      code: String(failure && failure.code || "valkey_partition_gate_failed"),
      message: String(failure && failure.message || "Valkey partition gate failed"),
      ownerNode: ownerNode && ownerNode.diagnostic(),
      successorNode: successorNode && successorNode.diagnostic(),
      databaseDropped,
      mysqlCleanupVerified,
      temporaryStateRemoved,
    }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  assert.ok(report);
  assert.equal(databaseDropped, true);
  assert.equal(mysqlCleanupVerified, true);
  assert.equal(temporaryStateRemoved, true);
  process.stdout.write(`${JSON.stringify({
    ...report,
    temporaryDatabaseDropped: databaseDropped,
    mysqlCleanupVerified,
    temporaryStateRemoved,
  }, null, 2)}\n`);
}

async function runMysqlPartitionCommitRecoveryGate() {
  // This lane owns its initialize-insecure loopback instance. It must never
  // inherit player-server credentials or reach a configured/shared database.
  process.env.BEASTBOUND_MYSQL_PASSWORD = "";
  process.env.MYSQL_PWD = "";
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-partition-gate-"));
  const database = `beastbound_mysql_partition_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  let mysqlRuntime = null;
  let admin = null;
  let observer = null;
  let lockConnection = null;
  let lockHeld = false;
  let bootstrap = null;
  let valkey = null;
  let mysqlProxy = null;
  let ownerNode = null;
  let successorNode = null;
  let report = null;
  let failure = null;
  let databaseDropped = false;
  const cleanupErrors = [];
  try {
    mysqlRuntime = await startIsolatedMysql({
      runtimePrefix: "beastbound-mysql-partition-runtime",
      maxConnections: 50,
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
    const fixture = clusterFixture(Date.now(), 0);
    await withTimeout(
      bootstrap.saveAsync(mysqlBattleAuthorityFixture(empty, fixture.data)),
      15000,
      "MySQL partition fixture bootstrap timeout",
    );
    await withTimeout(bootstrap.close(), 10000, "MySQL partition bootstrap close timeout");
    bootstrap = null;
    const ownerMysqlUser = "mysql_partition_owner_a";
    const successorMysqlUser = "mysql_partition_successor_b";
    for (const user of [ownerMysqlUser, successorMysqlUser]) {
      await admin.query(`CREATE USER '${user}'@'127.0.0.1' IDENTIFIED BY ''`);
      await admin.query(
        `GRANT ALL PRIVILEGES ON \`${mysqlDatabaseIdentifier(database)}\`.* TO '${user}'@'127.0.0.1'`,
      );
    }

    const databaseConnectionOptions = {
      ...mysqlRuntime.connectionOptions,
      database: mysqlDatabaseIdentifier(database),
    };
    observer = await mysql.createConnection(databaseConnectionOptions);
    lockConnection = await mysql.createConnection(databaseConnectionOptions);

    const valkeyPort = await reserveLoopbackPort();
    valkey = startValkey(valkeyPort, temporaryRoot);
    await waitForLoopback(valkeyPort, valkey);
    mysqlProxy = await startMysqlFaultProxy(mysqlRuntime.port);
    const streamKey = `beastbound:test:mysql-partition:${process.pid}`;
    const mysqlConfiguration = {
      database,
      mysqlPath: mysqlRuntime.mysqlPath,
      transactionTimeoutMs: PARTITION_TRANSACTION_TIMEOUT_MS,
      rowLockWaitTimeoutSeconds: PARTITION_ROW_LOCK_WAIT_TIMEOUT_SECONDS,
    };
    ownerNode = await NodeWorker.start({
      nodeId: "mysql-partition-owner-a",
      valkeyPort,
      streamKey,
      serviceEventSeq: 0,
      mysqlConfiguration: {
        ...mysqlConfiguration,
        port: mysqlProxy.port,
        user: ownerMysqlUser,
      },
    });
    successorNode = await NodeWorker.start({
      nodeId: "mysql-partition-successor-b",
      valkeyPort,
      streamKey,
      serviceEventSeq: 0,
      mysqlConfiguration: {
        ...mysqlConfiguration,
        port: mysqlRuntime.port,
        user: successorMysqlUser,
      },
    });
    assert.deepEqual(ownerNode.fixtureDigest, successorNode.fixtureDigest);
    await Promise.all([
      waitForClusterReady(ownerNode),
      waitForClusterReady(successorNode),
    ]);

    const alice = fixtureAccount(ownerNode.accounts, "alice");
    const challenger = fixtureAccount(ownerNode.accounts, "battle_challenger");
    const opponent = fixtureAccount(ownerNode.accounts, "battle_opponent");
    const recordPointRequest = {
      action: "record_point_save",
      payload: {recordPoint: MYSQL_COMMIT_RECOVERY_RECORD_POINT},
    };
    const authorityBeforeCommitAckLoss = await loadMysqlBattleAuthority(mysqlRuntime, database);
    assert.equal(authorityBeforeCommitAckLoss.mutationReceipts[MYSQL_COMMIT_RECOVERY_OPERATION_ID], undefined);
    const alicePlayerId = String(
      authorityBeforeCommitAckLoss.profileBindings[alice.accountId]
      && authorityBeforeCommitAckLoss.profileBindings[alice.accountId].playerId
      || "",
    );
    assert.notEqual(alicePlayerId, "");
    const profileRevisionBeforeCommitAckLoss = Number(
      authorityBeforeCommitAckLoss.profiles[alicePlayerId].profileRevision,
    );

    mysqlProxy.armCommitAckDrop();
    const commitAckRecovery = await expectOk(ownerNode, "/profile/action", {
      method: "POST",
      token: alice.token,
      headers: {"Idempotency-Key": MYSQL_COMMIT_RECOVERY_OPERATION_ID},
      body: recordPointRequest,
      timeoutMs: PARTITION_HTTP_TIMEOUT_MS,
    });
    assert.equal(commitAckRecovery.json.durableCommit.operationId, MYSQL_COMMIT_RECOVERY_OPERATION_ID);
    assert.equal(commitAckRecovery.json.durableCommit.replayed, true);
    assert.equal(
      commitAckRecovery.json.profile.recordPoint.label,
      MYSQL_COMMIT_RECOVERY_RECORD_POINT.label,
    );
    await waitFor(
      () => mysqlProxy.commitAckDrops() === 1,
      5000,
      "MySQL proxy did not drop the armed COMMIT acknowledgement",
    );
    assert.equal(mysqlProxy.commitPacketsForwarded(), 1);
    assert.equal(mysqlProxy.commitAckDropArmed(), false);
    const authorityAfterCommitAckRecovery = await loadMysqlBattleAuthority(mysqlRuntime, database);
    const committedReceipt = authorityAfterCommitAckRecovery
      .mutationReceipts[MYSQL_COMMIT_RECOVERY_OPERATION_ID];
    assert.ok(committedReceipt);
    assert.equal(committedReceipt.actionId, "POST /profile/action");
    assert.equal(
      authorityAfterCommitAckRecovery.profiles[alicePlayerId].profile.recordPoint.label,
      MYSQL_COMMIT_RECOVERY_RECORD_POINT.label,
    );
    assert.equal(
      Number(authorityAfterCommitAckRecovery.profiles[alicePlayerId].profileRevision),
      profileRevisionBeforeCommitAckLoss + 1,
    );
    const [commitReceiptRows] = await observer.query(
      "SELECT COUNT(*) AS rowCount FROM mutation_receipts WHERE operation_id = ?",
      [MYSQL_COMMIT_RECOVERY_OPERATION_ID],
    );
    assert.equal(Number(commitReceiptRows[0] && commitReceiptRows[0].rowCount || 0), 1);
    const ownerMetricsAfterCommitRecovery = await ownerNode.rpc("capacity-metrics");
    const ownerDurableMetricsAfterCommitRecovery = ownerMetricsAfterCommitRecovery.durableMutations;
    assert.equal(ownerDurableMetricsAfterCommitRecovery.pending, 0);
    assert.equal(ownerDurableMetricsAfterCommitRecovery.running, 0);
    assert.equal(ownerDurableMetricsAfterCommitRecovery.accepted, 1);
    assert.equal(ownerDurableMetricsAfterCommitRecovery.succeeded, 1);
    assert.equal(ownerDurableMetricsAfterCommitRecovery.failed, 0);

    await expectOk(ownerNode, "/players/position", {
      method: "POST",
      token: challenger.token,
      body: positionPayload(20, 20, "east", false),
    });
    await expectOk(ownerNode, "/players/position", {
      method: "POST",
      token: opponent.token,
      body: positionPayload(21, 20, "west", false),
    });
    const invite = await expectOk(ownerNode, "/battle/invite", {
      method: "POST",
      token: challenger.token,
      body: {username: opponent.username},
    });

    const revisionBeforePartition = await isolatedMysqlAuthRevision(observer);
    await lockConnection.beginTransaction();
    lockHeld = true;
    const [lockedRows] = await lockConnection.query(
      "SELECT revision FROM auth_store_revisions WHERE scope_key = 'auth' FOR UPDATE",
    );
    assert.equal(Number(lockedRows[0] && lockedRows[0].revision), revisionBeforePartition);

    const oldWriteStartedAt = Date.now();
    const oldAcceptSettlement = request(
      ownerNode,
      `/battle/invites/${encodeURIComponent(invite.json.invite.inviteId)}/accept`,
      {
        method: "POST",
        token: opponent.token,
        timeoutMs: PARTITION_HTTP_TIMEOUT_MS,
      },
    ).then((value) => ({ok: true, value}), (error) => ({ok: false, error}));
    let peakLockWaits = 0;
    await waitFor(async () => {
      const activity = await isolatedMysqlActivity(observer);
      peakLockWaits = Math.max(peakLockWaits, activity.activeLockWaits);
      return activity.activeLockWaits > 0;
    }, 5000, "old owner durable write did not enter the injected MySQL lock wait");
    assert.ok(mysqlProxy.connectedPairs() > 0);

    const partitionStartedAt = Date.now();
    await mysqlProxy.partition();
    assert.equal(mysqlProxy.partitioned(), true);
    const successorHealthDuringPartition = await clusterHealth(successorNode);
    assert.equal(successorHealthDuringPartition.status, 200);
    assert.equal(successorHealthDuringPartition.json.ok, true);
    assert.equal(successorHealthDuringPartition.json.storage.ok, true);
    const conflictBeforeOwnerDrain = await request(successorNode, "/battle/state", {
      token: challenger.token,
    });
    assert.equal(conflictBeforeOwnerDrain.status, 503, JSON.stringify(conflictBeforeOwnerDrain.json));
    assert.equal(conflictBeforeOwnerDrain.json.code, "account_node_switching");

    const oldAcceptSettlementResult = await oldAcceptSettlement;
    if (!oldAcceptSettlementResult.ok) {
      throw oldAcceptSettlementResult.error;
    }
    const oldAccept = oldAcceptSettlementResult.value;
    assert.equal(oldAccept.status, 503, JSON.stringify(oldAccept.json));
    assert.equal(oldAccept.json.code, "storage_write_failed");
    const oldWriteFailedAfterMs = Date.now() - oldWriteStartedAt;
    assert.ok(oldWriteFailedAfterMs < PARTITION_HTTP_TIMEOUT_MS);

    const ownerExit = await ownerNode.waitForExit(12000);
    assert.equal(ownerExit.code, 1);
    assert.equal(ownerExit.signal, null);
    assert.ok(
      ownerNode.fatalCodes.includes("storage_health_unavailable"),
      JSON.stringify(ownerNode.diagnostic()),
    );
    const ownerExitedBeforeLockRelease = lockHeld;
    assert.equal(ownerExitedBeforeLockRelease, true);
    const lockWaitsAfterOwnerExit = await isolatedMysqlLockWaitDetails(observer);
    assert.equal(lockWaitsAfterOwnerExit.length, 1);
    assert.equal(lockWaitsAfterOwnerExit[0].objectName, "auth_store_revisions");
    assert.equal(lockWaitsAfterOwnerExit[0].lockData, "'auth'");
    assert.equal(lockWaitsAfterOwnerExit[0].requestingUser, ownerMysqlUser);
    assert.match(lockWaitsAfterOwnerExit[0].requestingStatement, /FOR UPDATE$/);
    await lockConnection.rollback();
    lockHeld = false;
    await lockConnection.end();
    lockConnection = null;
    const liveActivityAfterFence = await isolatedMysqlLiveActivity(observer);
    assert.equal(liveActivityAfterFence.activeTransactions, 0);
    assert.equal(liveActivityAfterFence.activeLockWaits, 0);

    const revisionAfterFailedOldWrite = await isolatedMysqlAuthRevision(observer);
    assert.equal(revisionAfterFailedOldWrite, revisionBeforePartition);
    const authorityAfterFailedOldWrite = await loadMysqlBattleAuthority(mysqlRuntime, database);
    assert.equal((authorityAfterFailedOldWrite.battleRecords || []).length, 0);
    assert.equal(Object.keys(authorityAfterFailedOldWrite.battleRooms || {}).length, 0);
    assert.equal(battleFailureTicketCount(authorityAfterFailedOldWrite, [challenger, opponent]), 0);
    assert.ok(authorityAfterFailedOldWrite.mutationReceipts[MYSQL_COMMIT_RECOVERY_OPERATION_ID]);
    assert.equal(
      Number(authorityAfterFailedOldWrite.profiles[alicePlayerId].profileRevision),
      profileRevisionBeforeCommitAckLoss + 1,
    );

    const remainingLeaseWaitMs = Math.max(
      0,
      ACCOUNT_LEASE_MS + 500 - (Date.now() - partitionStartedAt),
    );
    if (remainingLeaseWaitMs > 0) {
      await delay(remainingLeaseWaitMs);
    }
    const replayRevisionBefore = await isolatedMysqlAuthRevision(observer);
    const profileRevisionBeforeReplay = Number(
      authorityAfterFailedOldWrite.profiles[alicePlayerId].profileRevision,
    );
    const successorReplay = await expectOk(successorNode, "/profile/action", {
      method: "POST",
      token: alice.token,
      headers: {"Idempotency-Key": MYSQL_COMMIT_RECOVERY_OPERATION_ID},
      body: recordPointRequest,
    });
    assert.equal(successorReplay.json.durableCommit.operationId, MYSQL_COMMIT_RECOVERY_OPERATION_ID);
    assert.equal(successorReplay.json.durableCommit.replayed, true);
    const replayRevisionAfter = await isolatedMysqlAuthRevision(observer);
    assert.equal(replayRevisionAfter, replayRevisionBefore);
    const authorityAfterSuccessorReplay = await loadMysqlBattleAuthority(mysqlRuntime, database);
    assert.equal(
      Number(authorityAfterSuccessorReplay.profiles[alicePlayerId].profileRevision),
      profileRevisionBeforeReplay,
    );
    const [replayedReceiptRows] = await observer.query(
      "SELECT COUNT(*) AS rowCount FROM mutation_receipts WHERE operation_id = ?",
      [MYSQL_COMMIT_RECOVERY_OPERATION_ID],
    );
    assert.equal(Number(replayedReceiptRows[0] && replayedReceiptRows[0].rowCount || 0), 1);

    const challengerPosition = await expectOk(successorNode, "/players/position", {
      method: "POST",
      token: challenger.token,
      body: positionPayload(20, 20, "east", false),
    });
    const opponentPosition = await expectOk(successorNode, "/players/position", {
      method: "POST",
      token: opponent.token,
      body: positionPayload(21, 20, "west", false),
    });
    assert.ok(challengerPosition.json.presenceRevision >= 2_000_000_001);
    assert.ok(opponentPosition.json.presenceRevision >= 2_000_000_001);
    const successorInvite = await expectOk(successorNode, "/battle/invite", {
      method: "POST",
      token: challenger.token,
      body: {username: opponent.username},
    });
    const successorAccept = await expectOk(
      successorNode,
      `/battle/invites/${encodeURIComponent(successorInvite.json.invite.inviteId)}/accept`,
      {method: "POST", token: opponent.token},
    );
    assert.equal(successorAccept.json.room.status, "ready");
    const successorRevision = await isolatedMysqlAuthRevision(observer);
    assert.equal(successorRevision, revisionAfterFailedOldWrite + 1);
    const authorityAfterSuccessorCommit = await loadMysqlBattleAuthority(mysqlRuntime, database);
    assert.equal(battleFailureTicketCount(authorityAfterSuccessorCommit, [challenger, opponent]), 2);
    assert.equal((authorityAfterSuccessorCommit.battleRecords || []).length, 0);

    await successorNode.stop();
    successorNode = null;
    const ownerDiagnostic = ownerNode.diagnostic();
    ownerNode = null;
    let activity = null;
    await waitFor(async () => {
      activity = await isolatedMysqlLiveActivity(observer);
      return activity.activeTransactions === 0 && activity.activeLockWaits === 0;
    }, 5000, "MySQL partition gate left active transactions or lock waits");
    const instrumentationActivity = await isolatedMysqlActivity(observer);
    const deadlocksAfter = await isolatedMysqlDeadlockCount(observer);
    assert.equal(deadlocksAfter - deadlocksBefore, 0);
    const globalsAfter = await isolatedMysqlGlobalValues(observer);
    assert.deepEqual(globalsAfter, globalsBefore);
    report = {
      status: "PASS",
      gate: "mysql_single_node_partition_and_commit_outcome_recovery",
      engine: "real_cuttable_tcp_mysql_real_valkey_and_isolated_mysql",
      mysqlVersion,
      isolatedMysql: true,
      sharedPlayerDatabaseTouched: false,
      mysqlPortIsNot3306: mysqlRuntime.port !== 3306,
      independentGameNodeProcesses: 2,
      partitionScopedToOldNodeMysqlLink: true,
      successorMysqlLinkStayedHealthy: true,
      commitPacketForwardedBeforeAckDrop: mysqlProxy.commitPacketsForwarded() === 1,
      commitAcknowledgementDropped: mysqlProxy.commitAckDrops() === 1,
      exactDurableReceiptRecoveryProven: true,
      commitRecoveryReturnedReplay: commitAckRecovery.json.durableCommit.replayed === true,
      commitRecoveryReceiptRows: Number(replayedReceiptRows[0] && replayedReceiptRows[0].rowCount || 0),
      commitRecoveryProfileRevisionDelta: Number(
        authorityAfterCommitAckRecovery.profiles[alicePlayerId].profileRevision,
      ) - profileRevisionBeforeCommitAckLoss,
      crossNodeExactReplayProven: successorReplay.json.durableCommit.replayed === true,
      crossNodeReplayAuthRevisionDelta: replayRevisionAfter - replayRevisionBefore,
      crossNodeReplayProfileRevisionDelta: Number(
        authorityAfterSuccessorReplay.profiles[alicePlayerId].profileRevision,
      ) - profileRevisionBeforeReplay,
      ownerDurableMetricsAfterCommitRecovery: {
        accepted: ownerDurableMetricsAfterCommitRecovery.accepted,
        succeeded: ownerDurableMetricsAfterCommitRecovery.succeeded,
        failed: ownerDurableMetricsAfterCommitRecovery.failed,
        pending: ownerDurableMetricsAfterCommitRecovery.pending,
        running: ownerDurableMetricsAfterCommitRecovery.running,
      },
      oldWriteEnteredMysqlLockWait: peakLockWaits > 0,
      oldOwnerStorageHealthFatalProven: ownerDiagnostic.fatalCodes.includes("storage_health_unavailable"),
      oldOwnerPreCommitNoWriteProven: true,
      serverSideBlockedStatementOutlivedPartitionedClient: lockWaitsAfterOwnerExit.length === 1,
      oldOwnerExitedBeforeInjectedLockRelease: ownerExitedBeforeLockRelease,
      oldOwnerFatalExitCode: ownerDiagnostic.exitCode,
      oldWriteFailedAfterMs,
      failedOldWriteAuthRevisionDelta: revisionAfterFailedOldWrite - revisionBeforePartition,
      successorGenerationTwoTakeoverProven: true,
      successorBattleCommitProven: true,
      successorAuthRevisionDelta: successorRevision - revisionAfterFailedOldWrite,
      mysqlGlobalValuesUnchanged: true,
      mysqlDeadlockDelta: deadlocksAfter - deadlocksBefore,
      mysqlResidualTransactions: activity.activeTransactions,
      mysqlResidualLockWaits: activity.activeLockWaits,
      mysqlDetachedInstrumentationTransactionsBeforeInstanceStop: Math.max(
        0,
        instrumentationActivity.activeTransactions - activity.activeTransactions,
      ),
      mysqlDetachedInstrumentationLockWaitsBeforeInstanceStop: Math.max(
        0,
        instrumentationActivity.activeLockWaits - activity.activeLockWaits,
      ),
      mysqlNetworkPartitionRecoveryProven: true,
      broadNetworkPartitionRecoveryProven: false,
      crossNodeNormalBattleCommandRoutingProven: false,
      battleRuntimeReconnectHydrationProven: false,
      reverseProxyTlsProven: false,
      persistentServiceStarted: false,
    };
  } catch (error) {
    failure = error;
  } finally {
    if (mysqlProxy) {
      try {
        await mysqlProxy.close();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    const nodeCleanup = await Promise.allSettled([
      ownerNode && ownerNode.stop(false),
      successorNode && successorNode.stop(false),
    ]);
    for (const result of nodeCleanup) {
      if (result.status === "rejected") {
        cleanupErrors.push(result.reason);
      }
    }
    if (lockHeld && lockConnection) {
      try {
        await lockConnection.rollback();
        lockHeld = false;
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    for (const connection of [lockConnection, observer]) {
      if (!connection) {
        continue;
      }
      try {
        await connection.end();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (bootstrap) {
      try {
        await withTimeout(bootstrap.close(), 10000, "MySQL partition bootstrap cleanup timeout");
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (admin) {
      try {
        await admin.query(`DROP DATABASE IF EXISTS \`${mysqlDatabaseIdentifier(database)}\``);
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
  if (failure) {
    process.stderr.write(`${JSON.stringify({
      status: "FAIL",
      gate: "mysql_single_node_partition_and_commit_outcome_recovery",
      code: String(failure && failure.code || "mysql_partition_gate_failed"),
      message: String(failure && failure.message || "MySQL partition gate failed"),
      ownerNode: ownerNode && ownerNode.diagnostic(),
      successorNode: successorNode && successorNode.diagnostic(),
      databaseDropped,
      mysqlCleanupVerified,
      temporaryStateRemoved,
    }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  assert.ok(report);
  assert.equal(databaseDropped, true);
  assert.equal(mysqlCleanupVerified, true);
  assert.equal(temporaryStateRemoved, true);
  process.stdout.write(`${JSON.stringify({
    ...report,
    temporaryDatabaseDropped: databaseDropped,
    mysqlCleanupVerified,
    temporaryStateRemoved,
  }, null, 2)}\n`);
}

async function isolatedMysqlAuthRevision(connection) {
  const [rows] = await connection.query(
    "SELECT revision FROM auth_store_revisions WHERE scope_key = 'auth'",
  );
  const revision = Number(rows[0] && rows[0].revision);
  assert.equal(Number.isSafeInteger(revision), true);
  assert.ok(revision >= 0);
  return revision;
}

function battleFailureTicketCount(authorityValue, accounts) {
  const authority = authorityValue && typeof authorityValue === "object" ? authorityValue : {};
  const accountIds = new Set(accounts.map((account) => String(account.accountId || "")));
  return Object.values(authority.sessions || {}).filter((session) => (
    session
    && accountIds.has(String(session.accountId || ""))
    && session.battleFailureTicket
  )).length;
}

function mysqlBattleStoreOptions(runtime, database, createDatabase = false) {
  return {
    mysqlPath: runtime.mysqlPath,
    host: LOOPBACK_HOST,
    port: runtime.port,
    user: "root",
    password: "",
    database: mysqlDatabaseIdentifier(database),
    createDatabase,
    ensureSchema: true,
    usePool: true,
    poolConnectionLimit: 4,
  };
}

function mysqlBattleAuthorityFixture(emptyValue, fixtureDataValue) {
  const empty = emptyValue && typeof emptyValue === "object" ? emptyValue : {};
  const fixtureData = fixtureDataValue && typeof fixtureDataValue === "object" ? fixtureDataValue : {};
  return {
    ...empty,
    accounts: structuredClone(fixtureData.accounts || {}),
    sessions: structuredClone(fixtureData.sessions || {}),
    profileBindings: structuredClone(fixtureData.profileBindings || {}),
    profiles: structuredClone(fixtureData.profiles || {}),
    serviceEventSeq: Number(fixtureData.serviceEventSeq || 0),
    serviceEvents: structuredClone(fixtureData.serviceEvents || []),
  };
}

async function loadMysqlBattleAuthority(runtime, database) {
  const {createMysqlAuthStore} = require("../server/node/src/mysql-store");
  const verifier = createMysqlAuthStore(mysqlBattleStoreOptions(runtime, database));
  try {
    return verifier.load();
  } finally {
    await withTimeout(verifier.close(), 10000, "isolated MySQL verifier close timeout");
  }
}

function mysqlDatabaseIdentifier(value) {
  const database = String(value || "");
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(database)) {
    throw new Error("isolated MySQL database identifier is invalid");
  }
  return database;
}

async function isolatedMysqlVersion(connection) {
  const [rows] = await connection.query("SELECT VERSION() AS version");
  return String(rows[0] && rows[0].version || "");
}

async function isolatedMysqlGlobalValues(connection) {
  const [rows] = await connection.query(
    "SELECT @@GLOBAL.innodb_lock_wait_timeout AS rowLockSeconds, @@GLOBAL.lock_wait_timeout AS metadataLockSeconds, @@GLOBAL.max_connections AS maxConnections",
  );
  return {
    rowLockSeconds: Number(rows[0] && rows[0].rowLockSeconds),
    metadataLockSeconds: Number(rows[0] && rows[0].metadataLockSeconds),
    maxConnections: Number(rows[0] && rows[0].maxConnections),
  };
}

async function isolatedMysqlDeadlockCount(connection) {
  const [rows] = await connection.query("SHOW GLOBAL STATUS LIKE 'Innodb_deadlocks'");
  return Number(rows[0] && rows[0].Value || 0);
}

async function isolatedMysqlActivity(connection) {
  const [transactionResult, lockWaitResult] = await Promise.all([
    connection.query("SELECT COUNT(*) AS rowCount FROM information_schema.innodb_trx"),
    connection.query("SELECT COUNT(*) AS rowCount FROM performance_schema.data_lock_waits"),
  ]);
  const transactionRow = transactionResult[0][0];
  const lockWaitRow = lockWaitResult[0][0];
  return {
    activeTransactions: Number(transactionRow && transactionRow.rowCount || 0),
    activeLockWaits: Number(lockWaitRow && lockWaitRow.rowCount || 0),
  };
}

async function isolatedMysqlLiveActivity(connection) {
  const [transactionResult, lockWaitResult] = await Promise.all([
    connection.query(`
      SELECT COUNT(*) AS rowCount
      FROM information_schema.innodb_trx AS transaction
      JOIN performance_schema.threads AS thread
        ON thread.PROCESSLIST_ID = transaction.trx_mysql_thread_id
    `),
    connection.query(`
      SELECT COUNT(*) AS rowCount
      FROM performance_schema.data_lock_waits AS waits
      JOIN performance_schema.data_locks AS requesting
        ON requesting.ENGINE_LOCK_ID = waits.REQUESTING_ENGINE_LOCK_ID
      JOIN information_schema.innodb_trx AS transaction
        ON transaction.trx_id = requesting.ENGINE_TRANSACTION_ID
      JOIN performance_schema.threads AS thread
        ON thread.PROCESSLIST_ID = transaction.trx_mysql_thread_id
    `),
  ]);
  const transactionRow = transactionResult[0][0];
  const lockWaitRow = lockWaitResult[0][0];
  return {
    activeTransactions: Number(transactionRow && transactionRow.rowCount || 0),
    activeLockWaits: Number(lockWaitRow && lockWaitRow.rowCount || 0),
  };
}

async function isolatedMysqlLockWaitDetails(connection) {
  const [rows] = await connection.query(`
    SELECT
      requesting.ENGINE_TRANSACTION_ID AS requestingTransactionId,
      requesting.OBJECT_SCHEMA AS objectSchema,
      requesting.OBJECT_NAME AS objectName,
      requesting.INDEX_NAME AS indexName,
      requesting.LOCK_MODE AS requestingMode,
      requesting.LOCK_STATUS AS requestingStatus,
      requesting.LOCK_DATA AS lockData,
      blocking.ENGINE_TRANSACTION_ID AS blockingTransactionId,
      blocking.LOCK_MODE AS blockingMode,
      transaction.trx_mysql_thread_id AS requestingConnectionId,
      transaction.trx_started AS requestingStartedAt,
      thread.PROCESSLIST_USER AS requestingUser,
      thread.PROCESSLIST_COMMAND AS requestingCommand,
      thread.PROCESSLIST_STATE AS requestingState,
      thread.PROCESSLIST_INFO AS requestingStatement
    FROM performance_schema.data_lock_waits AS waits
    JOIN performance_schema.data_locks AS requesting
      ON requesting.ENGINE_LOCK_ID = waits.REQUESTING_ENGINE_LOCK_ID
    JOIN performance_schema.data_locks AS blocking
      ON blocking.ENGINE_LOCK_ID = waits.BLOCKING_ENGINE_LOCK_ID
    LEFT JOIN information_schema.innodb_trx AS transaction
      ON transaction.trx_id = requesting.ENGINE_TRANSACTION_ID
    LEFT JOIN performance_schema.threads AS thread
      ON thread.PROCESSLIST_ID = transaction.trx_mysql_thread_id
    ORDER BY requesting.ENGINE_TRANSACTION_ID, requesting.OBJECT_NAME
  `);
  return rows.map((row) => ({
    requestingTransactionId: String(row.requestingTransactionId || ""),
    objectSchema: String(row.objectSchema || ""),
    objectName: String(row.objectName || ""),
    indexName: String(row.indexName || ""),
    requestingMode: String(row.requestingMode || ""),
    requestingStatus: String(row.requestingStatus || ""),
    lockData: String(row.lockData || ""),
    blockingTransactionId: String(row.blockingTransactionId || ""),
    blockingMode: String(row.blockingMode || ""),
    requestingConnectionId: Number(row.requestingConnectionId || 0),
    requestingStartedAt: String(row.requestingStartedAt || ""),
    requestingUser: String(row.requestingUser || ""),
    requestingCommand: String(row.requestingCommand || ""),
    requestingState: String(row.requestingState || ""),
    requestingStatement: String(row.requestingStatement || ""),
  }));
}

async function runBattleOwnerFailureSubgate(options) {
  const mysqlConfiguration = options.mysqlConfiguration || null;
  const sharedStorePath = mysqlConfiguration
    ? ""
    : path.join(options.temporaryRoot, "battle-owner-authority.json");
  if (!mysqlConfiguration) {
    const fixture = clusterFixture(Date.now(), 0);
    fs.writeFileSync(sharedStorePath, JSON.stringify(fixture.data, null, 2));
  }
  const loadPersistedAuthority = typeof options.loadPersistedAuthority === "function"
    ? options.loadPersistedAuthority
    : async () => JSON.parse(fs.readFileSync(sharedStorePath, "utf8"));
  let ownerNode = null;
  let takeoverNode = null;
  try {
    ownerNode = await NodeWorker.start({
      nodeId: "two-node-battle-owner-a",
      valkeyPort: options.valkeyPort,
      streamKey: options.streamKey,
      serviceEventSeq: 0,
      sharedStorePath,
      mysqlConfiguration,
      battleRuntimeEnabled: false,
      readyTimeoutMs: 30000,
    });
    takeoverNode = await NodeWorker.start({
      nodeId: "two-node-battle-owner-b",
      valkeyPort: options.valkeyPort,
      streamKey: options.streamKey,
      serviceEventSeq: 0,
      sharedStorePath,
      mysqlConfiguration,
      battleRuntimeEnabled: false,
      readyTimeoutMs: 30000,
    });
    assert.deepEqual(ownerNode.fixtureDigest, takeoverNode.fixtureDigest);
    await Promise.all([
      waitForClusterReady(ownerNode),
      waitForClusterReady(takeoverNode),
    ]);

    const challenger = fixtureAccount(ownerNode.accounts, "battle_challenger");
    const opponent = fixtureAccount(ownerNode.accounts, "battle_opponent");
    const challengerPosition = await expectOk(ownerNode, "/players/position", {
      method: "POST",
      token: challenger.token,
      body: positionPayload(20, 20, "east", false),
    });
    const opponentPosition = await expectOk(ownerNode, "/players/position", {
      method: "POST",
      token: opponent.token,
      body: positionPayload(21, 20, "west", false),
    });
    assert.ok(challengerPosition.json.presenceRevision >= 1_000_000_001);
    assert.ok(opponentPosition.json.presenceRevision >= 1_000_000_001);

    const invite = await expectOk(ownerNode, "/battle/invite", {
      method: "POST",
      token: challenger.token,
      body: {username: opponent.username},
    });
    const accepted = await expectOk(
      ownerNode,
      `/battle/invites/${encodeURIComponent(invite.json.invite.inviteId)}/accept`,
      {method: "POST", token: opponent.token},
    );
    const interruptedRoomId = String(accepted.json.room && accepted.json.room.roomId || "");
    assert.notEqual(interruptedRoomId, "");
    assert.equal(accepted.json.room.status, "ready");
    for (const account of [challenger, opponent]) {
      const activeState = await expectOk(ownerNode, "/battle/state", {token: account.token});
      assert.equal(activeState.json.room.roomId, interruptedRoomId);
      assert.equal(activeState.json.interruption, null);
    }

    const persistedBeforeCrash = await loadPersistedAuthority();
    assert.equal(Object.keys(persistedBeforeCrash.battleRooms || {}).length, 0);
    assert.equal((persistedBeforeCrash.battleRecords || []).length, 0);
    const persistedTickets = [challenger, opponent].map((account) => {
      const tickets = Object.values(persistedBeforeCrash.sessions || {})
        .filter((session) => session && session.accountId === account.accountId)
        .map((session) => session.battleFailureTicket)
        .filter(Boolean);
      assert.equal(tickets.length, 1);
      assert.match(String(tickets[0].ticketId || ""), BATTLE_FAILURE_TICKET_PATTERN);
      assert.equal(tickets[0].roomId, interruptedRoomId);
      return tickets[0];
    });
    assert.notEqual(persistedTickets[0].ticketId, persistedTickets[1].ticketId);

    await ownerNode.crash();
    ownerNode = null;
    const conflictBeforeExpiry = await request(takeoverNode, "/battle/state", {
      token: challenger.token,
    });
    assert.equal(conflictBeforeExpiry.status, 503, JSON.stringify(conflictBeforeExpiry.json));
    assert.equal(conflictBeforeExpiry.json.code, "account_node_switching");

    await delay(ACCOUNT_LEASE_MS + 500);
    const interruptionStates = [];
    for (const account of [challenger, opponent]) {
      const interrupted = await expectOk(takeoverNode, "/battle/state", {token: account.token});
      assert.equal(interrupted.json.room, null);
      assert.equal(interrupted.json.interruption.kind, "battle_owner_interruption");
      assert.equal(interrupted.json.interruption.roomId, interruptedRoomId);
      assert.match(interrupted.json.interruption.ticketId, BATTLE_FAILURE_TICKET_PATTERN);
      assert.equal(interrupted.json.interruption.encounterReturnAvailable, false);
      interruptionStates.push(interrupted.json.interruption);
    }

    for (let index = 0; index < interruptionStates.length; index += 1) {
      const account = index === 0 ? challenger : opponent;
      const interruption = interruptionStates[index];
      const operationId = battleInterruptionOperationId(interruption.ticketId);
      const recovered = await expectOk(takeoverNode, "/battle/interruption/recover", {
        method: "POST",
        token: account.token,
        headers: {"Idempotency-Key": operationId},
        body: {},
      });
      assert.equal(recovered.json.interruption, null);
      assert.equal(recovered.json.encounterReturned, false);
      const replayed = await expectOk(takeoverNode, "/battle/interruption/recover", {
        method: "POST",
        token: account.token,
        headers: {"Idempotency-Key": operationId},
        body: {},
      });
      assert.equal(replayed.json.durableCommit.replayed, true);
      assert.equal(replayed.json.message, recovered.json.message);
      const cleared = await expectOk(takeoverNode, "/battle/state", {token: account.token});
      assert.equal(cleared.json.room, null);
      assert.equal(cleared.json.interruption, null);
    }

    const summaries = await Promise.all([
      expectOk(
        takeoverNode,
        `/battle/records/summary?username=${encodeURIComponent(opponent.username)}`,
        {token: challenger.token},
      ),
      expectOk(
        takeoverNode,
        `/battle/records/summary?username=${encodeURIComponent(challenger.username)}`,
        {token: opponent.token},
      ),
    ]);
    for (const summary of summaries) {
      assert.equal(summary.json.summary.total, 0);
      assert.equal(summary.json.summary.wins, 0);
      assert.equal(summary.json.summary.losses, 0);
      assert.equal(summary.json.summary.draws, 0);
    }
    const persistedAfterRecovery = await loadPersistedAuthority();
    assert.equal((persistedAfterRecovery.battleRecords || []).length, 0);
    for (const account of [challenger, opponent]) {
      const tickets = Object.values(persistedAfterRecovery.sessions || {})
        .filter((session) => session && session.accountId === account.accountId)
        .map((session) => session.battleFailureTicket)
        .filter(Boolean);
      assert.equal(tickets.length, 0);
    }

    const challengerTakeoverPosition = await expectOk(takeoverNode, "/players/position", {
      method: "POST",
      token: challenger.token,
      body: positionPayload(20, 20, "east", false),
    });
    const opponentTakeoverPosition = await expectOk(takeoverNode, "/players/position", {
      method: "POST",
      token: opponent.token,
      body: positionPayload(21, 20, "west", false),
    });
    assert.ok(challengerTakeoverPosition.json.presenceRevision >= 2_000_000_001);
    assert.ok(opponentTakeoverPosition.json.presenceRevision >= 2_000_000_001);
    const rematchInvite = await expectOk(takeoverNode, "/battle/invite", {
      method: "POST",
      token: challenger.token,
      body: {username: opponent.username},
    });
    const rematch = await expectOk(
      takeoverNode,
      `/battle/invites/${encodeURIComponent(rematchInvite.json.invite.inviteId)}/accept`,
      {method: "POST", token: opponent.token},
    );
    assert.equal(rematch.json.room.status, "ready");
    assert.notEqual(rematch.json.room.roomId, interruptedRoomId);
    for (const account of [challenger, opponent]) {
      const rematchState = await expectOk(takeoverNode, "/battle/state", {token: account.token});
      assert.equal(rematchState.json.room.roomId, rematch.json.room.roomId);
      assert.equal(rematchState.json.interruption, null);
    }

    await takeoverNode.stop();
    takeoverNode = null;
    return {
      independentGameNodeProcesses: 2,
      sharedJsonAuthorityFixtureProven: !mysqlConfiguration,
      sharedMysqlAuthorityFixtureProven: Boolean(mysqlConfiguration),
      generationTwoTakeoverProven: true,
      ticketTakeoverProven: true,
      neutralRecoveryProven: true,
      stableRecoveryReplayProven: true,
      winLossUnaffected: true,
      participantsCanRematch: true,
    };
  } finally {
    await Promise.allSettled([
      ownerNode && ownerNode.stop(false),
      takeoverNode && takeoverNode.stop(false),
    ]);
  }
}

async function runBattleCommandRoutingSubgate(options) {
  let roomOwnerNode = null;
  let remoteCommandNode = null;
  let challengerSocket = null;
  let opponentSocket = null;
  try {
    roomOwnerNode = await NodeWorker.start({
      nodeId: "two-node-battle-route-a",
      valkeyPort: options.valkeyPort,
      streamKey: options.streamKey,
      serviceEventSeq: 0,
      mysqlConfiguration: options.mysqlConfiguration,
      readyTimeoutMs: 30000,
    });
    remoteCommandNode = await NodeWorker.start({
      nodeId: "two-node-battle-route-b",
      valkeyPort: options.valkeyPort,
      streamKey: options.streamKey,
      serviceEventSeq: 0,
      mysqlConfiguration: options.mysqlConfiguration,
      readyTimeoutMs: 30000,
    });
    assert.deepEqual(roomOwnerNode.fixtureDigest, remoteCommandNode.fixtureDigest);
    await Promise.all([
      waitForClusterReady(roomOwnerNode),
      waitForClusterReady(remoteCommandNode),
    ]);

    const challenger = fixtureAccount(roomOwnerNode.accounts, "battle_challenger");
    const opponent = fixtureAccount(roomOwnerNode.accounts, "battle_opponent");
    await expectOk(roomOwnerNode, "/players/position", {
      method: "POST",
      token: challenger.token,
      body: positionPayload(20, 20, "east", false),
    });
    await expectOk(roomOwnerNode, "/players/position", {
      method: "POST",
      token: opponent.token,
      body: positionPayload(21, 20, "west", false),
    });
    const invite = await expectOk(roomOwnerNode, "/battle/invite", {
      method: "POST",
      token: challenger.token,
      body: {username: opponent.username},
    });
    const accepted = await expectOk(
      roomOwnerNode,
      `/battle/invites/${encodeURIComponent(invite.json.invite.inviteId)}/accept`,
      {method: "POST", token: opponent.token},
    );
    const roomId = String(accepted.json.room && accepted.json.room.roomId || "");
    assert.notEqual(roomId, "");
    assert.equal(accepted.json.room.status, "ready");
    const challengerActor = accepted.json.room.battle.actors.find((actor) => (
      actor
      && actor.kind === "player"
      && actor.accountId === challenger.accountId
    ));
    const opponentActor = accepted.json.room.battle.actors.find((actor) => (
      actor
      && actor.kind === "player"
      && actor.accountId === opponent.accountId
    ));
    assert.ok(challengerActor);
    assert.ok(opponentActor);

    const persistedBeforeRouting = await options.loadPersistedAuthority();
    assert.equal(Object.keys(persistedBeforeRouting.battleRooms || {}).length, 0);
    assert.equal((persistedBeforeRouting.battleRecords || []).length, 0);
    assert.equal(battleFailureTicketCount(persistedBeforeRouting, [challenger, opponent]), 2);

    const releasedByOwner = await roomOwnerNode.rpc("release-account-owner", {
      accountKey: "battle_opponent",
    });
    assert.equal(releasedByOwner.accountId, opponent.accountId);
    assert.equal(releasedByOwner.generation, 1);
    assert.equal(releasedByOwner.released, true);

    const routedState = await expectOk(remoteCommandNode, "/battle/state", {
      token: opponent.token,
    });
    assert.equal(routedState.json.room.roomId, roomId);
    assert.equal(routedState.json.room.battle.round, 1);
    assert.equal(routedState.json.interruption, null);

    const challengerEvents = [];
    const opponentEvents = [];
    challengerSocket = eventSocket(
      roomOwnerNode,
      challenger,
      20,
      0,
      "",
      (_index, event) => challengerEvents.push(event),
    );
    opponentSocket = eventSocket(
      remoteCommandNode,
      opponent,
      21,
      0,
      "",
      (_index, event) => opponentEvents.push(event),
    );
    await Promise.all([challengerSocket.connect(), opponentSocket.connect()]);

    const opponentCommandEventA = challengerSocket.waitFor((event) => (
      event
      && event.type === "battle.command_submitted"
      && event.roomId === roomId
      && event.round === 1
      && event.submittedAccountId === opponent.accountId
    ), EVENT_TIMEOUT_MS);
    const opponentCommandEventB = opponentSocket.waitFor((event) => (
      event
      && event.type === "battle.command_submitted"
      && event.roomId === roomId
      && event.round === 1
      && event.submittedAccountId === opponent.accountId
    ), EVENT_TIMEOUT_MS);
    const opponentOperationId = "bbo_cluster_battle_route_opponent_0001";
    const opponentPayload = {
      round: 1,
      actorId: opponentActor.actorId,
      actionId: "attack",
      targetActorId: challengerActor.actorId,
    };
    const firstRemoteCommand = await expectOk(
      remoteCommandNode,
      `/battle/rooms/${encodeURIComponent(roomId)}/commands`,
      {
        method: "POST",
        token: opponent.token,
        headers: {"Idempotency-Key": opponentOperationId},
        body: opponentPayload,
      },
    );
    await Promise.all([opponentCommandEventA, opponentCommandEventB]);
    assert.equal(firstRemoteCommand.json.command.actorId, opponentActor.actorId);
    assert.equal(firstRemoteCommand.json.turn, null);

    const exactReplay = await expectOk(
      remoteCommandNode,
      `/battle/rooms/${encodeURIComponent(roomId)}/commands`,
      {
        method: "POST",
        token: opponent.token,
        headers: {"Idempotency-Key": opponentOperationId},
        body: opponentPayload,
      },
    );
    assert.deepEqual(exactReplay.json, firstRemoteCommand.json);
    const alteredReplay = await request(
      remoteCommandNode,
      `/battle/rooms/${encodeURIComponent(roomId)}/commands`,
      {
        method: "POST",
        token: opponent.token,
        headers: {"Idempotency-Key": opponentOperationId},
        body: {
          round: 1,
          actorId: opponentActor.actorId,
          actionId: "defend",
        },
      },
    );
    assert.equal(alteredReplay.status, 409, JSON.stringify(alteredReplay.json));
    assert.equal(alteredReplay.json.code, "idempotency_key_conflict");
    await delay(250);

    const opponentCommandEventsOnA = challengerEvents.filter((event) => (
      event
      && event.type === "battle.command_submitted"
      && event.roomId === roomId
      && event.round === 1
      && event.submittedAccountId === opponent.accountId
    ));
    const opponentCommandEventsOnB = opponentEvents.filter((event) => (
      event
      && event.type === "battle.command_submitted"
      && event.roomId === roomId
      && event.round === 1
      && event.submittedAccountId === opponent.accountId
    ));
    assert.equal(opponentCommandEventsOnA.length, 1);
    assert.equal(opponentCommandEventsOnB.length, 1);

    const ownerProbeBeforeResolution = await roomOwnerNode.rpc("probe-battle-routing", {
      roomId,
      accountId: opponent.accountId,
      round: 1,
    });
    const remoteProbeBeforeResolution = await remoteCommandNode.rpc("probe-battle-routing", {
      roomId,
      accountId: opponent.accountId,
      round: 1,
    });
    assert.equal(ownerProbeBeforeResolution.roomKnown, true);
    assert.equal(remoteProbeBeforeResolution.roomKnown, false);
    assert.equal(ownerProbeBeforeResolution.commandTraces.length, 1);
    assert.equal(ownerProbeBeforeResolution.routerMetrics.duplicateOperations, 1);
    assert.equal(ownerProbeBeforeResolution.routerMetrics.operationConflicts, 1);

    const turnEventA = challengerSocket.waitFor((event) => (
      event
      && event.type === "battle.turn_resolved"
      && event.roomId === roomId
      && event.round === 1
    ), EVENT_TIMEOUT_MS);
    const turnEventB = opponentSocket.waitFor((event) => (
      event
      && event.type === "battle.turn_resolved"
      && event.roomId === roomId
      && event.round === 1
    ), EVENT_TIMEOUT_MS);
    const challengerCommand = await expectOk(
      roomOwnerNode,
      `/battle/rooms/${encodeURIComponent(roomId)}/commands`,
      {
        method: "POST",
        token: challenger.token,
        headers: {"Idempotency-Key": "bbo_cluster_battle_route_challenger_0001"},
        body: {
          round: 1,
          actorId: challengerActor.actorId,
          actionId: "attack",
          targetActorId: opponentActor.actorId,
        },
      },
    );
    assert.equal(challengerCommand.json.turn.round, 1);
    await Promise.all([turnEventA, turnEventB]);

    const nextRemoteState = await expectOk(remoteCommandNode, "/battle/state", {
      token: opponent.token,
    });
    assert.equal(nextRemoteState.json.room.roomId, roomId);
    assert.equal(nextRemoteState.json.room.battle.round, 2);
    assert.equal(nextRemoteState.json.interruption, null);

    const ownerProbeAfterResolution = await roomOwnerNode.rpc("probe-battle-routing", {
      roomId,
      accountId: opponent.accountId,
      round: 1,
    });
    assert.equal(ownerProbeAfterResolution.commandTraces.length, 1);
    assert.equal(ownerProbeAfterResolution.turnTraceCount, 1);
    assert.ok(ownerProbeAfterResolution.routerMetrics.remoteExecutions >= 5);
    assert.equal(
      [...challengerEvents, ...opponentEvents].some((event) => (
        String(event && event.type || "").startsWith("cluster.control.")
      )),
      false,
    );

    const persistedAfterRound = await options.loadPersistedAuthority();
    assert.equal(Object.keys(persistedAfterRound.battleRooms || {}).length, 0);
    assert.equal((persistedAfterRound.battleRecords || []).length, 0);
    assert.equal(battleFailureTicketCount(persistedAfterRound, [challenger, opponent]), 2);

    challengerSocket.close();
    opponentSocket.close();
    await delay(100);
    challengerSocket.terminate();
    opponentSocket.terminate();
    challengerSocket = null;
    opponentSocket = null;

    const releasedByRemote = await remoteCommandNode.rpc("release-account-owner", {
      accountKey: "battle_opponent",
    });
    assert.equal(releasedByRemote.generation, 2);
    assert.equal(releasedByRemote.released, true);
    const reacquiredOnOwner = await request(roomOwnerNode, "/battle/state", {
      token: opponent.token,
    });
    if (reacquiredOnOwner.status !== 200 || reacquiredOnOwner.json && reacquiredOnOwner.json.ok !== true) {
      const reacquireDiagnostic = await roomOwnerNode.rpc("probe-battle-routing", {
        roomId,
        accountId: opponent.accountId,
        accountKey: "battle_opponent",
        round: 1,
      });
      throw new Error(
        `room owner reacquire state failed: ${JSON.stringify({response: reacquiredOnOwner, diagnostic: reacquireDiagnostic})}`,
      );
    }
    assert.equal(reacquiredOnOwner.json.room.roomId, roomId);
    assert.equal(reacquiredOnOwner.json.room.battle.round, 2);

    const staleControl = await remoteCommandNode.rpc("route-stale-battle-state", {
      accountKey: "battle_opponent",
      roomId,
      ownerGeneration: releasedByRemote.generation,
    });
    assert.equal(staleControl.routed, false);
    assert.equal(staleControl.code, "account_node_switching");
    assert.equal(staleControl.statusCode, 503);
    const staleHttp = await request(remoteCommandNode, "/battle/state", {
      token: opponent.token,
    });
    assert.equal(staleHttp.status, 503, JSON.stringify(staleHttp.json));
    assert.equal(staleHttp.json.code, "account_node_switching");

    const finalOwnerProbe = await roomOwnerNode.rpc("probe-battle-routing", {
      roomId,
      accountId: opponent.accountId,
      round: 1,
    });
    assert.equal(finalOwnerProbe.commandTraces.length, 1);
    assert.equal(finalOwnerProbe.turnTraceCount, 1);
    assert.equal(finalOwnerProbe.routerMetrics.staleOwnerRejected, 1);

    await Promise.all([roomOwnerNode.stop(), remoteCommandNode.stop()]);
    roomOwnerNode = null;
    remoteCommandNode = null;
    return {
      independentGameNodeProcesses: 2,
      crossNodeBattleStateDelegationProven: true,
      crossNodeNormalBattleCommandRoutingProven: true,
      remoteCommandExecutedExactlyOnce: true,
      exactReplayStable: true,
      alteredReplayRejected: true,
      roundResolvedExactlyOnce: true,
      publicBattleEventsReachedBothNodes: true,
      clusterControlFramesHiddenFromPlayerWebSockets: true,
      staleOwnerControlRejected: true,
      staleOwnerHttpRejectedBeforeExecution: true,
      runtimeOnlyBattleRoomStayedOnOwnerNode: true,
      persistentFailureTicketsPreserved: true,
      challengerToken: challenger.token,
      opponentToken: opponent.token,
    };
  } finally {
    challengerSocket?.terminate();
    opponentSocket?.terminate();
    await Promise.allSettled([
      roomOwnerNode && roomOwnerNode.stop(false),
      remoteCommandNode && remoteCommandNode.stop(false),
    ]);
  }
}

async function runBattleRuntimeHydrationSubgate(options) {
  let roomOwnerNode = null;
  let takeoverNode = null;
  try {
    roomOwnerNode = await NodeWorker.start({
      nodeId: "two-node-battle-hydrate-a",
      valkeyPort: options.valkeyPort,
      streamKey: options.streamKey,
      serviceEventSeq: 0,
      mysqlConfiguration: options.mysqlConfiguration,
      readyTimeoutMs: 30000,
    });
    takeoverNode = await NodeWorker.start({
      nodeId: "two-node-battle-hydrate-b",
      valkeyPort: options.valkeyPort,
      streamKey: options.streamKey,
      serviceEventSeq: 0,
      mysqlConfiguration: options.mysqlConfiguration,
      readyTimeoutMs: 30000,
    });
    assert.deepEqual(roomOwnerNode.fixtureDigest, takeoverNode.fixtureDigest);
    await Promise.all([
      waitForClusterReady(roomOwnerNode),
      waitForClusterReady(takeoverNode),
    ]);

    const challenger = fixtureAccount(roomOwnerNode.accounts, "battle_challenger");
    const opponent = fixtureAccount(roomOwnerNode.accounts, "battle_opponent");
    await expectOk(roomOwnerNode, "/players/position", {
      method: "POST",
      token: challenger.token,
      body: positionPayload(20, 20, "east", false),
    });
    await expectOk(roomOwnerNode, "/players/position", {
      method: "POST",
      token: opponent.token,
      body: positionPayload(21, 20, "west", false),
    });
    const invite = await expectOk(roomOwnerNode, "/battle/invite", {
      method: "POST",
      token: challenger.token,
      body: {username: opponent.username},
    });
    const accepted = await expectOk(
      roomOwnerNode,
      `/battle/invites/${encodeURIComponent(invite.json.invite.inviteId)}/accept`,
      {method: "POST", token: opponent.token},
    );
    const roomId = String(accepted.json.room && accepted.json.room.roomId || "");
    assert.notEqual(roomId, "");
    const challengerActor = accepted.json.room.battle.actors.find((actor) => (
      actor && actor.kind === "player" && actor.accountId === challenger.accountId
    ));
    const opponentActor = accepted.json.room.battle.actors.find((actor) => (
      actor && actor.kind === "player" && actor.accountId === opponent.accountId
    ));
    assert.ok(challengerActor);
    assert.ok(opponentActor);

    const challengerOperationId = "bbo_cluster_battle_hydrate_challenger_0001";
    const challengerPayload = {
      round: 1,
      actorId: challengerActor.actorId,
      actionId: "attack",
      targetActorId: opponentActor.actorId,
    };
    const firstCommand = await expectOk(
      roomOwnerNode,
      `/battle/rooms/${encodeURIComponent(roomId)}/commands`,
      {
        method: "POST",
        token: challenger.token,
        headers: {"Idempotency-Key": challengerOperationId},
        body: challengerPayload,
      },
    );
    assert.equal(firstCommand.json.turn, null);
    assert.equal(
      firstCommand.json.room.battle.submittedAccountIds.includes(challenger.accountId),
      true,
    );
    const ownerRuntimeProbe = await roomOwnerNode.rpc("probe-battle-routing", {roomId});
    assert.match(ownerRuntimeProbe.runtimeSecretDigest, /^[a-f0-9]{64}$/);

    const persistedBeforeCrash = await options.loadPersistedAuthority();
    assert.equal(Object.keys(persistedBeforeCrash.battleRooms || {}).length, 0);
    assert.equal((persistedBeforeCrash.battleRecords || []).length, 0);
    assert.equal(battleFailureTicketCount(persistedBeforeCrash, [challenger, opponent]), 2);

    await delay(200);
    await roomOwnerNode.crash();
    roomOwnerNode = null;
    await delay(Math.max(NODE_LEASE_MS, ACCOUNT_LEASE_MS) + 400);

    const hydratedState = await expectOk(takeoverNode, "/battle/state", {
      token: opponent.token,
      timeoutMs: 10000,
    });
    assert.equal(hydratedState.json.room.roomId, roomId);
    assert.equal(hydratedState.json.room.battle.round, 1);
    assert.equal(hydratedState.json.interruption, null);
    assert.equal(
      hydratedState.json.room.battle.submittedAccountIds.includes(challenger.accountId),
      true,
    );

    const exactReplay = await expectOk(
      takeoverNode,
      `/battle/rooms/${encodeURIComponent(roomId)}/commands`,
      {
        method: "POST",
        token: challenger.token,
        headers: {"Idempotency-Key": challengerOperationId},
        body: challengerPayload,
        timeoutMs: 10000,
      },
    );
    assert.deepEqual(exactReplay.json, firstCommand.json);
    const alteredReplay = await request(
      takeoverNode,
      `/battle/rooms/${encodeURIComponent(roomId)}/commands`,
      {
        method: "POST",
        token: challenger.token,
        headers: {"Idempotency-Key": challengerOperationId},
        body: {
          round: 1,
          actorId: challengerActor.actorId,
          actionId: "defend",
        },
        timeoutMs: 10000,
      },
    );
    assert.equal(alteredReplay.status, 409, JSON.stringify(alteredReplay.json));
    assert.equal(alteredReplay.json.code, "idempotency_key_conflict");

    const resolved = await expectOk(
      takeoverNode,
      `/battle/rooms/${encodeURIComponent(roomId)}/commands`,
      {
        method: "POST",
        token: opponent.token,
        headers: {"Idempotency-Key": "bbo_cluster_battle_hydrate_opponent_0001"},
        body: {
          round: 1,
          actorId: opponentActor.actorId,
          actionId: "defend",
        },
        timeoutMs: 10000,
      },
    );
    assert.equal(resolved.json.turn.round, 1);
    assert.equal(resolved.json.room.battle.round, 2);

    const probe = await takeoverNode.rpc("probe-battle-routing", {
      roomId,
      accountId: challenger.accountId,
      round: 1,
    });
    assert.equal(probe.roomKnown, true);
    assert.equal(probe.battleRound, 2);
    assert.equal(probe.turnTraceCount, 1);
    assert.ok(probe.routerMetrics.runtimeTakeovers >= 1);
    assert.ok(probe.routerMetrics.runtimeCheckpoints >= 2);
    assert.ok(probe.battleRuntimeMetrics.takeovers >= 1);
    assert.equal(probe.battleRuntimeMetrics.fatal, false);
    assert.equal(probe.runtimeSecretDigest, ownerRuntimeProbe.runtimeSecretDigest);

    const persistedAfterRound = await options.loadPersistedAuthority();
    assert.equal(Object.keys(persistedAfterRound.battleRooms || {}).length, 0);
    assert.equal((persistedAfterRound.battleRecords || []).length, 0);
    assert.equal(battleFailureTicketCount(persistedAfterRound, [challenger, opponent]), 2);

    await takeoverNode.stop();
    takeoverNode = null;
    return {
      independentGameNodeProcesses: 2,
      roomOwnerCrashedWithSigkill: true,
      halfFinishedRoundHydrated: true,
      submittedCommandPreserved: true,
      randomAuthorityContinuationHydrated: (
        probe.runtimeSecretDigest === ownerRuntimeProbe.runtimeSecretDigest
      ),
      exactNonterminalReplayStable: true,
      alteredReplayRejected: true,
      roundResolvedExactlyOnceAfterTakeover: true,
      runtimeOnlyBattleRoomStayedOutOfMysql: true,
      persistentFailureTicketsPreserved: true,
      runtimeTakeovers: probe.routerMetrics.runtimeTakeovers,
      runtimeCheckpoints: probe.routerMetrics.runtimeCheckpoints,
      challengerToken: challenger.token,
      opponentToken: opponent.token,
    };
  } finally {
    await Promise.allSettled([
      roomOwnerNode && roomOwnerNode.stop(false),
      takeoverNode && takeoverNode.stop(false),
    ]);
  }
}

function battleInterruptionOperationId(ticketIdValue) {
  const ticketId = String(ticketIdValue || "");
  assert.match(ticketId, BATTLE_FAILURE_TICKET_PATTERN);
  return `bbo_battle_recover_${ticketId.slice("battle_failure_".length)}`;
}

class NodeWorker {
  static async start(configuration) {
    const mysqlConfiguration = configuration.mysqlConfiguration || {};
    const child = fork(filePath, ["--node-worker"], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        BEASTBOUND_GATE_NODE_ID: configuration.nodeId,
        BEASTBOUND_GATE_VALKEY_PORT: String(configuration.valkeyPort),
        BEASTBOUND_GATE_STREAM_KEY: configuration.streamKey,
        BEASTBOUND_GATE_SERVICE_EVENT_SEQ: String(configuration.serviceEventSeq),
        BEASTBOUND_GATE_SHARED_STORE_PATH: String(configuration.sharedStorePath || ""),
        BEASTBOUND_GATE_MYSQL_PORT: String(mysqlConfiguration.port || ""),
        BEASTBOUND_GATE_MYSQL_DATABASE: String(mysqlConfiguration.database || ""),
        BEASTBOUND_GATE_MYSQL_BIN: String(mysqlConfiguration.mysqlPath || ""),
        BEASTBOUND_GATE_MYSQL_USER: String(mysqlConfiguration.user || "root"),
        BEASTBOUND_GATE_CAPACITY_MODE: configuration.capacityMode === true ? "1" : "0",
        BEASTBOUND_GATE_BATTLE_RUNTIME_ENABLED: configuration.battleRuntimeEnabled === false ? "0" : "1",
        BEASTBOUND_GATE_FIXTURE_ACCOUNT_COUNT: String(
          configuration.fixtureAccountCount || 5,
        ),
        BEASTBOUND_MYSQL_TRANSACTION_TIMEOUT_MS: String(mysqlConfiguration.transactionTimeoutMs || ""),
        BEASTBOUND_MYSQL_ROW_LOCK_WAIT_TIMEOUT_SECONDS: String(
          mysqlConfiguration.rowLockWaitTimeoutSeconds || "",
        ),
        BEASTBOUND_MYSQL_PASSWORD: "",
        MYSQL_PWD: "",
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    const worker = new NodeWorker(
      child,
      configuration.nodeId,
      Number(configuration.readyTimeoutMs || (configuration.capacityMode === true ? 60000 : 10000)),
    );
    try {
      await worker.ready();
      return worker;
    } catch (error) {
      const diagnostic = worker.diagnostic();
      await worker.stop(false);
      throw new Error(`${error.message}: ${JSON.stringify(diagnostic)}`);
    }
  }

  constructor(child, nodeId, readyTimeoutMs = 10000) {
    this.child = child;
    this.nodeId = nodeId;
    this.port = 0;
    this.accounts = [];
    this.fixtureDigest = "";
    this.schedulingPolicy = null;
    this.stdout = "";
    this.stderr = "";
    this.requestId = 0;
    this.pending = new Map();
    this.fatalCodes = [];
    this.fatalErrors = [];
    this.readySettled = false;
    this.readyTimeoutMs = readyTimeoutMs;
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
    return withTimeout(
      this.readyPromise,
      this.readyTimeoutMs,
      `node worker ${this.nodeId} ready timeout`,
    );
  }

  onMessage(message) {
    if (!message || typeof message !== "object") {
      return;
    }
    if (message.type === "ready") {
      this.port = Number(message.port || 0);
      this.accounts = Array.isArray(message.accounts) ? message.accounts : [];
      this.fixtureDigest = String(message.fixtureDigest || "");
      this.schedulingPolicy = message.schedulingPolicy || null;
      this.readySettled = true;
      this.resolveReady(this);
      return;
    }
    if (message.type === "fatal") {
      this.fatalCodes.push(String(message.code || ""));
      this.fatalErrors.push(String(message.error || "node worker fatal"));
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

  rpc(command, payload = null) {
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

  waitForExit(timeoutMs = 10000) {
    if (!childRunning(this.child)) {
      return Promise.resolve({code: this.child.exitCode, signal: this.child.signalCode});
    }
    return withTimeout(new Promise((resolve) => {
      this.child.once("exit", (code, signal) => resolve({code, signal}));
    }), timeoutMs, `node worker ${this.nodeId} exit timeout`);
  }

  diagnostic() {
    return {
      nodeId: this.nodeId,
      port: this.port,
      exitCode: this.child.exitCode,
      signalCode: this.child.signalCode,
      fatalCodes: this.fatalCodes.slice(),
      fatalErrors: this.fatalErrors.slice(),
      schedulingPolicy: this.schedulingPolicy,
      stdout: this.stdout,
      stderr: this.stderr,
    };
  }
}

async function runNodeWorker() {
  const {
    createAsyncWriteAuthStore,
    createAuthService,
    createJsonAuthStore,
    createMemoryAuthStore,
  } = require("../server/node/src/auth-service");
  const {createMysqlAuthStore} = require("../server/node/src/mysql-store");
  const {
    createHttpServer,
    drainServerForShutdown,
  } = require("../server/node/src/http-server");
  const {
    createConfiguredClusterEventRuntime,
  } = require("../server/node/src/cluster-event-runtime-config");

  const nowMs = Date.now();
  const capacityMode = process.env.BEASTBOUND_GATE_CAPACITY_MODE === "1";
  const schedulingPolicy = normalizeCapacityWorkerScheduling(capacityMode);
  if (schedulingPolicy.required && schedulingPolicy.success !== true) {
    throw new Error(`capacity worker scheduling normalization failed: ${schedulingPolicy.error}`);
  }
  const fixtureAccountCount = Math.max(
    5,
    Math.min(1000, Math.trunc(Number(
      process.env.BEASTBOUND_GATE_FIXTURE_ACCOUNT_COUNT || 5,
    )) || 5),
  );
  const clusterFatalTransactionFence = new AbortController();
  const fixture = clusterFixture(
    nowMs,
    Number(process.env.BEASTBOUND_GATE_SERVICE_EVENT_SEQ || 0),
    {accountCount: fixtureAccountCount},
  );
  const sharedStorePath = String(process.env.BEASTBOUND_GATE_SHARED_STORE_PATH || "").trim();
  const mysqlDatabase = String(process.env.BEASTBOUND_GATE_MYSQL_DATABASE || "").trim();
  const mysqlPort = Number(process.env.BEASTBOUND_GATE_MYSQL_PORT || 0);
  const mysqlPath = String(process.env.BEASTBOUND_GATE_MYSQL_BIN || "").trim();
  const mysqlUser = String(process.env.BEASTBOUND_GATE_MYSQL_USER || "root").trim();
  if (
    mysqlDatabase !== ""
    && (!Number.isInteger(mysqlPort) || mysqlPort <= 0 || mysqlPort === 3306 || mysqlPath === "")
  ) {
    throw new Error("isolated MySQL worker configuration is invalid");
  }
  const store = mysqlDatabase !== ""
    ? createAsyncWriteAuthStore(createMysqlAuthStore({
      mysqlPath,
      host: LOOPBACK_HOST,
      port: mysqlPort,
      user: mysqlUser,
      password: "",
      database: mysqlDatabase,
      createDatabase: false,
      ensureSchema: true,
      usePool: true,
      poolConnectionLimit: 4,
      transactionSignal: clusterFatalTransactionFence.signal,
    }), {onError() {}})
    : sharedStorePath !== ""
      ? createJsonAuthStore(sharedStorePath)
      : createMemoryAuthStore(fixture.data);
  const send = (message) => {
    if (typeof process.send === "function" && process.connected) {
      process.send(message);
    }
  };
  let server = null;
  let clusterRuntime = null;
  let service = null;
  let shutdownStarted = false;
  const eventLoopDelay = capacityMode
    ? monitorEventLoopDelay({resolution: 10})
    : null;
  const gcTelemetry = createCapacityGcTelemetry(capacityMode);
  if (eventLoopDelay) {
    eventLoopDelay.enable();
  }

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
    if (store && typeof store.close === "function") {
      await store.close().catch(() => undefined);
    }
    eventLoopDelay?.disable();
    gcTelemetry.disconnect();
    setImmediate(() => process.exit(exitCode));
  };
  const fatal = (error) => {
    if (!clusterFatalTransactionFence.signal.aborted) {
      clusterFatalTransactionFence.abort(error);
    }
    send({
      type: "fatal",
      code: String(error && error.code || ""),
      error: String(error && error.stack || error),
    });
    void shutdown(1);
  };
  process.on("uncaughtException", fatal);
  process.on("unhandledRejection", fatal);
  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));

  try {
    service = createAuthService({
      store,
      now: capacityMode ? () => Date.now() : () => nowMs,
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
    server = createHttpServer({
      service,
      store,
      eventHubOptions: {
        ...clusterRuntime.eventHubOptions,
        ...(capacityMode ? {
          maxConnectionsPerIp: 256,
          upgradeIpCapacity: 640,
          upgradeIpWindowMs: 60_000,
        } : {}),
      },
      clusterAccountAdmission: clusterRuntime.accountAdmission,
      clusterBattleRuntime: process.env.BEASTBOUND_GATE_BATTLE_RUNTIME_ENABLED === "0"
        ? null
        : clusterRuntime.battleRuntime,
      onStorageFatal: fatal,
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
      capacityMode,
      schedulingPolicy,
    });
  } catch (error) {
    fatal(error);
  }

  process.on("message", (message) => {
    if (!message || typeof message !== "object" || !message.id) {
      return;
    }
    if (message.command === "capacity-metrics") {
      try {
        const memory = process.memoryUsage();
        const resource = process.resourceUsage();
        const loopCount = Number(eventLoopDelay && eventLoopDelay.count || 0);
        const capacityMetrics = [
          "capacityMetrics",
          "runtimeCapacityMetrics",
          "authorityCardinalityMetrics",
        ].map((methodName) => (
          service && typeof service[methodName] === "function"
            ? service[methodName]()
            : null
        )).find((value) => value && typeof value === "object") || null;
        const result = {
          memory: Object.fromEntries(Object.entries(memory).map(([key, value]) => [key, Number(value)])),
          resourceUsage: {
            userCpuTime: Number(resource.userCPUTime || 0),
            systemCpuTime: Number(resource.systemCPUTime || 0),
            maxRssKiB: Number(resource.maxRSS || 0),
          },
          eventLoop: {
            count: loopCount,
            p95Ms: loopCount > 0 ? Number(eventLoopDelay.percentile(95)) / 1e6 : 0,
            p99Ms: loopCount > 0 ? Number(eventLoopDelay.percentile(99)) / 1e6 : 0,
            maxMs: loopCount > 0 ? Number(eventLoopDelay.max) / 1e6 : 0,
            utilization: Number(performance.eventLoopUtilization().utilization || 0),
          },
          gc: gcTelemetry.snapshotAndReset(),
          durableMutations: service && typeof service.durableMutationMetrics === "function"
            ? service.durableMutationMetrics()
            : null,
          capacityMetrics,
        };
        eventLoopDelay?.reset();
        send({id: message.id, ok: true, result});
      } catch (error) {
        send({id: message.id, ok: false, error: String(error && error.stack || error)});
      }
      return;
    }
    if (message.command === "seed-takeover-authority") {
      try {
        const alice = fixtureAccount(fixture.accounts, "alice");
        const local = service.snapshot();
        const data = store.load();
        const binding = data.profileBindings[alice.accountId];
        const profileDocument = binding && data.profiles[binding.playerId];
        if (!binding || !profileDocument || !profileDocument.profile) {
          throw new Error("takeover authority fixture profile is missing");
        }
        data.accounts[alice.username].displayName = TAKEOVER_DISPLAY_NAME;
        data.accounts[alice.username].updatedAt = new Date(nowMs + 1000).toISOString();
        profileDocument.profile.takeoverAuthorityMarker = TAKEOVER_AUTHORITY_MARKER;
        if (profileDocument.profile.player && typeof profileDocument.profile.player === "object") {
          profileDocument.profile.player.name = TAKEOVER_DISPLAY_NAME;
        }
        profileDocument.profileRevision = Number(profileDocument.profileRevision || 0) + 1;
        binding.profileRevision = Number(binding.profileRevision || 0) + 1;
        data.parties.party_cluster_takeover_gate = {
          partyId: "party_cluster_takeover_gate",
          leaderAccountId: alice.accountId,
          memberAccountIds: [alice.accountId],
          createdAt: new Date(nowMs + 1000).toISOString(),
          updatedAt: new Date(nowMs + 1000).toISOString(),
          schemaVersion: 1,
        };
        data.chatMessages = [
          ...(Array.isArray(data.chatMessages) ? data.chatMessages : []),
          {
            messageId: TAKEOVER_CHAT_MESSAGE_ID,
            channel: "nearby",
            partyId: "",
            senderAccountId: alice.accountId,
            senderUsername: alice.username,
            senderDisplayName: TAKEOVER_DISPLAY_NAME,
            text: TAKEOVER_CHAT_TEXT,
            createdAt: new Date(nowMs + 1000).toISOString(),
            schemaVersion: 1,
          },
        ];
        const latestEventSeq = Math.max(
          Number(data.serviceEventSeq || 0),
          ...(Array.isArray(data.serviceEvents)
            ? data.serviceEvents.map((event) => Number(event && event.eventSeq || 0))
            : [0]),
        ) + 1;
        data.serviceEventSeq = latestEventSeq;
        data.serviceEvents = [
          ...(Array.isArray(data.serviceEvents) ? data.serviceEvents : []),
          {
            type: "party.update",
            eventId: `server_event_${latestEventSeq}`,
            eventSeq: latestEventSeq,
            targetAccountIds: [alice.accountId],
            partyId: "party_cluster_takeover_gate",
            createdAt: new Date(nowMs + 1000).toISOString(),
            schemaVersion: 1,
          },
        ];
        store.save(data);
        const stored = store.load();
        const storedChatMessage = Array.isArray(stored.chatMessages)
          ? stored.chatMessages.find((entry) => (
            entry && entry.messageId === TAKEOVER_CHAT_MESSAGE_ID
          ))
          : null;
        send({
          id: message.id,
          ok: true,
          result: {
            accountId: alice.accountId,
            localDisplayName: String(local.accounts[alice.username].displayName || ""),
            localLatestEventSeq: Number(local.serviceEventSeq || 0),
            storedDisplayName: String(stored.accounts[alice.username].displayName || ""),
            storedLatestEventSeq: Number(stored.serviceEventSeq || 0),
            storedProfileMarker: String(
              stored.profiles[binding.playerId].profile.takeoverAuthorityMarker || "",
            ),
            storedPartyId: String(
              stored.parties.party_cluster_takeover_gate
              && stored.parties.party_cluster_takeover_gate.partyId
              || "",
            ),
            localChatMessagePresent: Array.isArray(local.chatMessages)
              && local.chatMessages.some((entry) => (
                entry && entry.messageId === TAKEOVER_CHAT_MESSAGE_ID
              )),
            storedChatMessageId: String(storedChatMessage && storedChatMessage.messageId || ""),
            storedChatMessageText: String(storedChatMessage && storedChatMessage.text || ""),
          },
        });
      } catch (error) {
        send({id: message.id, ok: false, error: String(error && error.stack || error)});
      }
      return;
    }
    if (message.command === "probe-takeover-authority") {
      try {
        const alice = fixtureAccount(fixture.accounts, "alice");
        const snapshot = service.snapshot();
        const binding = snapshot.profileBindings[alice.accountId];
        const profileDocument = binding && snapshot.profiles[binding.playerId];
        const party = Object.values(snapshot.parties || {}).find((entry) => (
          entry
          && Array.isArray(entry.memberAccountIds)
          && entry.memberAccountIds.includes(alice.accountId)
        )) || null;
        send({
          id: message.id,
          ok: true,
          result: {
            displayName: String(snapshot.accounts[alice.username].displayName || ""),
            profileMarker: String(
              profileDocument
              && profileDocument.profile
              && profileDocument.profile.takeoverAuthorityMarker
              || "",
            ),
            partyId: String(party && party.partyId || ""),
            recoveryMetrics: service._clusterAccountRecoveryMetrics(),
          },
        });
      } catch (error) {
        send({id: message.id, ok: false, error: String(error && error.stack || error)});
      }
      return;
    }
    if (message.command === "release-account-owner") {
      void (async () => {
        try {
          const payload = message.payload && typeof message.payload === "object"
            ? message.payload
            : {};
          const account = fixtureAccount(fixture.accounts, String(payload.accountKey || ""));
          const admission = await clusterRuntime.accountAdmission.admit(account.accountId);
          const released = await clusterRuntime.accountAdmission.release(account.accountId, {
            generation: admission.generation,
          });
          send({
            id: message.id,
            ok: true,
            result: {
              accountId: account.accountId,
              generation: Number(admission.generation || 0),
              released,
            },
          });
        } catch (error) {
          send({id: message.id, ok: false, error: String(error && error.stack || error)});
        }
      })();
      return;
    }
    if (message.command === "probe-battle-routing") {
      try {
        const payload = message.payload && typeof message.payload === "object"
          ? message.payload
          : {};
        const roomId = String(payload.roomId || "");
        const accountId = String(payload.accountId || "");
        const round = Math.max(0, Math.trunc(Number(payload.round || 0)));
        const snapshot = service.snapshot();
        const room = snapshot.battleRooms && snapshot.battleRooms[roomId] || null;
        const account = String(payload.accountKey || "") !== ""
          ? fixtureAccount(fixture.accounts, String(payload.accountKey || ""))
          : null;
        const localBattleState = account ? service.getBattleState(account.token) : null;
        let runtimeSecretDigest = "";
        if (
          room
          && server
          && server.clusterBattleRuntime
          && typeof service._issueClusterBattleRuntimeCredential === "function"
          && typeof service._clusterExportBattleRuntime === "function"
        ) {
          const runtimeCredential = service._issueClusterBattleRuntimeCredential();
          const runtimeExport = service._clusterExportBattleRuntime(runtimeCredential, roomId);
          const randomSecret = String(
            runtimeExport && runtimeExport.ok === true && runtimeExport.active === true
              ? runtimeExport.snapshot && runtimeExport.snapshot.randomSecret
              : "",
          );
          if (randomSecret !== "") {
            runtimeSecretDigest = crypto.createHash("sha256").update(randomSecret).digest("hex");
          }
        }
        const commandTraces = (Array.isArray(snapshot.battleTrace) ? snapshot.battleTrace : [])
          .filter((trace) => (
            trace
            && trace.type === "battle_command_submitted"
            && trace.roomId === roomId
            && (accountId === "" || String(trace.details && trace.details.accountId || "") === accountId)
            && (round === 0 || Number(trace.details && trace.details.round || 0) === round)
          ))
          .map((trace) => ({
            traceId: String(trace.traceId || ""),
            accountId: String(trace.details && trace.details.accountId || ""),
            actorId: String(trace.details && trace.details.actorId || ""),
            actionId: String(trace.details && trace.details.actionId || ""),
            round: Number(trace.details && trace.details.round || 0),
          }));
        const turnTraceCount = (Array.isArray(snapshot.battleTrace) ? snapshot.battleTrace : [])
          .filter((trace) => (
            trace
            && trace.type === "battle_turn_resolved"
            && trace.roomId === roomId
            && (round === 0 || Number(trace.details && trace.details.round || trace.round || 0) === round)
          )).length;
        send({
          id: message.id,
          ok: true,
          result: {
            roomKnown: Boolean(room),
            roomStatus: String(room && room.status || ""),
            participantAccountIds: Array.isArray(room && room.participantAccountIds)
              ? room.participantAccountIds.slice()
              : [],
            battleRound: Number(room && room.battle && room.battle.round || 0),
            submittedActorIds: Array.isArray(room && room.battle && room.battle.submittedActorIds)
              ? room.battle.submittedActorIds.slice()
              : [],
            commandTraces,
            turnTraceCount,
            runtimeSecretDigest,
            localBattleState: localBattleState ? {
              ok: localBattleState.ok === true,
              code: String(localBattleState.code || ""),
              roomId: String(localBattleState.room && localBattleState.room.roomId || ""),
              interruptionRoomId: String(
                localBattleState.interruption && localBattleState.interruption.roomId || "",
              ),
            } : null,
            routerMetrics: server && server.clusterBattleRouter
              ? server.clusterBattleRouter.metrics()
              : null,
            battleRuntimeMetrics: clusterRuntime && clusterRuntime.battleRuntime
              && typeof clusterRuntime.battleRuntime.metrics === "function"
              ? clusterRuntime.battleRuntime.metrics()
              : null,
          },
        });
      } catch (error) {
        send({id: message.id, ok: false, error: String(error && error.stack || error)});
      }
      return;
    }
    if (message.command === "route-stale-battle-state") {
      void (async () => {
        try {
          const payload = message.payload && typeof message.payload === "object"
            ? message.payload
            : {};
          const account = fixtureAccount(fixture.accounts, String(payload.accountKey || ""));
          const identity = await Promise.resolve(service._clusterIngressIdentity(account.token));
          assert.equal(identity && identity.ok, true);
          const localState = service.getBattleState(account.token);
          assert.equal(localState && localState.ok, true);
          assert.equal(String(localState.interruption && localState.interruption.roomId || ""), String(payload.roomId || ""));
          try {
            const result = await server.clusterBattleRouter.routeState({
              accountId: identity.accountId,
              playerId: identity.playerId,
              selectionEpoch: identity.selectionEpoch,
              ownerGeneration: Number(payload.ownerGeneration || 0),
            }, localState);
            send({id: message.id, ok: true, result: {routed: true, result}});
          } catch (error) {
            send({
              id: message.id,
              ok: true,
              result: {
                routed: false,
                code: String(error && error.code || ""),
                statusCode: Number(error && error.statusCode || 0),
              },
            });
          }
        } catch (error) {
          send({id: message.id, ok: false, error: String(error && error.stack || error)});
        }
      })();
      return;
    }
    if (message.command === "shutdown") {
      send({id: message.id, ok: true, result: {closing: true}});
      void shutdown(0);
      return;
    }
    send({id: message.id, ok: false, error: "unknown node worker command"});
  });
}

function clusterFixture(nowMs, serviceEventSeq, options = {}) {
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
    fixtureIdentity("battle_challenger", "故障切磋甲"),
    fixtureIdentity("battle_opponent", "故障切磋乙"),
  ];
  const accountCount = Math.max(
    accounts.length,
    Math.min(1000, Math.trunc(Number(options.accountCount || accounts.length)) || accounts.length),
  );
  for (let index = accounts.length; index < accountCount; index += 1) {
    const suffix = String(index).padStart(3, "0");
    accounts.push(fixtureIdentity(`capacity_${suffix}`, `容量旅人${suffix}`));
  }
  for (const account of accounts) {
    const salt = crypto.createHash("sha256").update(`salt:${account.key}`).digest("hex").slice(0, 32);
    const playerId = `player_cluster_gate_${account.key}`;
    const isBattleFixture = account.key === "battle_challenger" || account.key === "battle_opponent";
    const battleElements = account.key === "battle_opponent"
      ? {earth: 0, water: 10, fire: 0, wind: 0}
      : {earth: 10, water: 0, fire: 0, wind: 0};
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
        ...(isBattleFixture ? {
          player: {
            name: account.displayName,
            level: 1,
            hp: 120,
            maxHp: 120,
            baseStats: {maxHp: 120, attack: 18, defense: 6, quick: 70},
            elements: battleElements,
          },
          activePetInstanceId: "",
        } : {}),
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
    username: `cl_gate_${key}`,
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

function eventSocket(worker, account, index, cursor, eventStreamEpoch = "", onEvent = null) {
  const query = new URLSearchParams({
    clientVersion: SERVER_VERSION,
    clientProtocolVersion: String(PROTOCOL_VERSION),
    lastEventSeq: String(cursor),
  });
  if (String(eventStreamEpoch || "") !== "") {
    query.set("eventStreamEpoch", String(eventStreamEpoch));
  }
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
    ...(typeof onEvent === "function" ? {onEvent} : {}),
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
    headers: options.headers,
    protocolVersion: PROTOCOL_VERSION,
    clientVersion: SERVER_VERSION,
    timeoutMs: Number(options.timeoutMs || HTTP_TIMEOUT_MS),
  });
}

function clusterHealth(worker) {
  return fetchJsonMeasured(`http://${LOOPBACK_HOST}:${worker.port}/health/ready`, {
    timeoutMs: HTTP_TIMEOUT_MS,
  });
}

async function waitForClusterReady(worker) {
  let last = null;
  try {
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
  } catch (error) {
    throw new Error(`${error.message}: ${JSON.stringify({last, worker: worker.diagnostic()})}`);
  }
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

async function startCuttableTcpProxy(targetPort) {
  const sockets = new Set();
  let listening = true;
  const server = net.createServer((downstream) => {
    const upstream = net.createConnection({host: LOOPBACK_HOST, port: targetPort});
    const pair = {downstream, upstream, close: null};
    sockets.add(pair);
    let closed = false;
    const closePair = () => {
      if (closed) {
        return;
      }
      closed = true;
      sockets.delete(pair);
      downstream.destroy();
      upstream.destroy();
    };
    pair.close = closePair;
    downstream.once("error", closePair);
    upstream.once("error", closePair);
    downstream.once("close", closePair);
    upstream.once("close", closePair);
    downstream.pipe(upstream);
    upstream.pipe(downstream);
  });
  server.unref();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, LOOPBACK_HOST, resolve);
  });
  const address = server.address();
  const port = address && typeof address === "object" ? Number(address.port) : 0;
  assert.ok(port > 0);

  const cut = async () => {
    if (!listening) {
      return;
    }
    listening = false;
    const closed = new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    for (const pair of Array.from(sockets)) {
      pair.close();
    }
    await closed;
    assert.equal(sockets.size, 0);
  };
  return Object.freeze({
    port,
    cut,
    close: cut,
    connectedPairs: () => sockets.size,
    listening: () => listening,
  });
}

async function startMysqlFaultProxy(targetPort) {
  const sockets = new Set();
  const commitPacket = Buffer.from("COMMIT", "ascii");
  let partitioned = false;
  let closed = false;
  let commitAckDropArmed = false;
  let commitPacketsForwarded = 0;
  let commitAckDrops = 0;
  const server = net.createServer((downstream) => {
    if (partitioned || closed) {
      downstream.destroy();
      return;
    }
    const upstream = net.createConnection({host: LOOPBACK_HOST, port: targetPort});
    const pair = {
      downstream,
      upstream,
      close: null,
      clientBuffer: Buffer.alloc(0),
      dropNextUpstreamPacket: false,
    };
    sockets.add(pair);
    let pairClosed = false;
    const closePair = () => {
      if (pairClosed) {
        return;
      }
      pairClosed = true;
      sockets.delete(pair);
      downstream.destroy();
      upstream.destroy();
    };
    pair.close = closePair;
    downstream.once("error", closePair);
    upstream.once("error", closePair);
    downstream.once("close", closePair);
    upstream.once("close", closePair);
    downstream.on("data", (chunk) => {
      if (pairClosed || partitioned || closed) {
        closePair();
        return;
      }
      pair.clientBuffer = Buffer.concat([pair.clientBuffer, chunk]);
      while (pair.clientBuffer.length >= 4) {
        const payloadLength = pair.clientBuffer[0]
          | (pair.clientBuffer[1] << 8)
          | (pair.clientBuffer[2] << 16);
        if (pair.clientBuffer.length < 4 + payloadLength) {
          break;
        }
        const payload = pair.clientBuffer.subarray(4, 4 + payloadLength);
        pair.clientBuffer = pair.clientBuffer.subarray(4 + payloadLength);
        if (
          commitAckDropArmed
          && payload.length >= 1 + commitPacket.length
          && payload[0] === 0x03
          && payload.subarray(payload.length - commitPacket.length).equals(commitPacket)
        ) {
          commitAckDropArmed = false;
          pair.dropNextUpstreamPacket = true;
          commitPacketsForwarded += 1;
        }
      }
      upstream.write(chunk);
    });
    upstream.on("data", (chunk) => {
      if (pairClosed) {
        return;
      }
      if (pair.dropNextUpstreamPacket) {
        pair.dropNextUpstreamPacket = false;
        commitAckDrops += 1;
        closePair();
        return;
      }
      downstream.write(chunk);
    });
  });
  server.unref();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, LOOPBACK_HOST, resolve);
  });
  const address = server.address();
  const port = address && typeof address === "object" ? Number(address.port) : 0;
  assert.ok(port > 0);

  return Object.freeze({
    port,
    armCommitAckDrop() {
      assert.equal(closed, false);
      assert.equal(partitioned, false);
      assert.equal(commitAckDropArmed, false);
      commitAckDropArmed = true;
    },
    async partition() {
      if (closed || partitioned) {
        return;
      }
      partitioned = true;
      commitAckDropArmed = false;
      for (const pair of Array.from(sockets)) {
        pair.close();
      }
      assert.equal(sockets.size, 0);
    },
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      partitioned = true;
      commitAckDropArmed = false;
      for (const pair of Array.from(sockets)) {
        pair.close();
      }
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      assert.equal(sockets.size, 0);
    },
    connectedPairs: () => sockets.size,
    commitAckDropArmed: () => commitAckDropArmed,
    commitAckDrops: () => commitAckDrops,
    commitPacketsForwarded: () => commitPacketsForwarded,
    partitioned: () => partitioned,
  });
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

async function readValkeyStreamText(port, streamKey) {
  const {GlideClient} = require("../server/node/node_modules/@valkey/valkey-glide");
  const client = await GlideClient.createClient({
    addresses: [{host: LOOPBACK_HOST, port}],
    useTLS: false,
    requestTimeout: 2000,
    clientName: "beastbound-battle-routing-gate-inspector",
  });
  try {
    const rows = await client.customCommand(["XRANGE", streamKey, "-", "+"]);
    return JSON.stringify(textualValkeyValue(rows));
  } finally {
    try {
      client.close();
    } catch {
      // The disposable Valkey process is still owned and stopped by the gate.
    }
  }
}

function textualValkeyValue(value) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return Buffer.from(value).toString("utf8");
  }
  if (typeof value === "bigint") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(textualValkeyValue);
  }
  if (value instanceof Map) {
    return Array.from(value.entries()).map(([key, entry]) => [
      textualValkeyValue(key),
      textualValkeyValue(entry),
    ]);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      textualValkeyValue(entry),
    ]));
  }
  return value;
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

if (process.argv[1] && path.resolve(process.argv[1]) === filePath) {
  if (process.argv.includes("--node-worker")) {
    await runNodeWorker();
  } else if (process.argv.includes("--valkey-partition-only")) {
    await runValkeyPartitionOldOwnerFenceGate();
  } else if (process.argv.includes("--mysql-partition-only")) {
    await runMysqlPartitionCommitRecoveryGate();
  } else if (process.argv.includes("--mysql-battle-only")) {
    await runMysqlBattleOwnerFailureGate();
  } else if (process.argv.includes("--mysql-battle-routing-only")) {
    await runMysqlBattleCommandRoutingGate();
  } else if (process.argv.includes("--mysql-battle-hydration-only")) {
    await runMysqlBattleRuntimeHydrationGate();
  } else {
    await runGate();
  }
}

export {
  ACCOUNT_LEASE_MS,
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
  startMysqlFaultProxy,
  stopExactChild,
  waitFor,
  waitForClusterReady,
  waitForLoopback,
};
