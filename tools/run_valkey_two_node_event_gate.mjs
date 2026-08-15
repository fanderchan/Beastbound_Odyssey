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
const TAKEOVER_AUTHORITY_MARKER = "generation-2-authority-reloaded";
const TAKEOVER_DISPLAY_NAME = "跨节点接管新事实";
const TAKEOVER_CHAT_MESSAGE_ID = "chat_cluster_takeover_gate";
const TAKEOVER_CHAT_TEXT = "接管后补回的持久聊天";
const BATTLE_FAILURE_TICKET_PATTERN = /^battle_failure_[a-f0-9]{32}$/;

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
    });
    takeoverNode = await NodeWorker.start({
      nodeId: "two-node-battle-owner-b",
      valkeyPort: options.valkeyPort,
      streamKey: options.streamKey,
      serviceEventSeq: 0,
      sharedStorePath,
      mysqlConfiguration,
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
        BEASTBOUND_MYSQL_PASSWORD: "",
        MYSQL_PWD: "",
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
  const fixture = clusterFixture(
    nowMs,
    Number(process.env.BEASTBOUND_GATE_SERVICE_EVENT_SEQ || 0),
  );
  const sharedStorePath = String(process.env.BEASTBOUND_GATE_SHARED_STORE_PATH || "").trim();
  const mysqlDatabase = String(process.env.BEASTBOUND_GATE_MYSQL_DATABASE || "").trim();
  const mysqlPort = Number(process.env.BEASTBOUND_GATE_MYSQL_PORT || 0);
  const mysqlPath = String(process.env.BEASTBOUND_GATE_MYSQL_BIN || "").trim();
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
      user: "root",
      password: "",
      database: mysqlDatabase,
      createDatabase: false,
      ensureSchema: true,
      usePool: true,
      poolConnectionLimit: 4,
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
    service = createAuthService({
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
    if (message.command === "shutdown") {
      send({id: message.id, ok: true, result: {closing: true}});
      void shutdown(0);
      return;
    }
    send({id: message.id, ok: false, error: "unknown node worker command"});
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
    fixtureIdentity("battle_challenger", "故障切磋甲"),
    fixtureIdentity("battle_opponent", "故障切磋乙"),
  ];
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

function eventSocket(worker, account, index, cursor, eventStreamEpoch = "") {
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
} else if (process.argv.includes("--mysql-battle-only")) {
  await runMysqlBattleOwnerFailureGate();
} else {
  await runGate();
}
