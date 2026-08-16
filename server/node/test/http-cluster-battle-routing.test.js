"use strict";

const assert = require("node:assert/strict");
const {once} = require("node:events");
const test = require("node:test");
const {
  battleProfile,
  createAuthService,
  createMemoryAuthStore,
} = require("../test-support/auth-service-test-context");
const {
  createHttpServer,
  drainServerForShutdown,
} = require("../src/http-server");
const {
  REQUIRED_CLUSTER_EVENT_CAPABILITIES,
} = require("../src/event-cluster-relay");
const {
  CLIENT_PROTOCOL_HEADER,
  CLIENT_VERSION_HEADER,
  PROTOCOL_VERSION,
  SERVER_VERSION,
} = require("../src/protocol");

test("HTTP routes battle state and normal commands to a live remote room owner without relaying bearer tokens", async (t) => {
  const storeA = createMemoryAuthStore();
  const serviceA = createAuthService({store: storeA});
  const challenger = serviceA.register({
    username: "routebattleta",
    password: "routepass123",
    displayName: "路由甲",
  });
  const opponent = serviceA.register({
    username: "routebattletb",
    password: "routepass123",
    displayName: "路由乙",
  });
  assert.equal(serviceA.saveProfile(challenger.session.token, {
    expectedRevision: 0,
    profile: battleProfile("路由甲", {
      level: 8,
      hp: 180,
      maxHp: 180,
      attack: 26,
      defense: 12,
      quick: 80,
    }, null),
  }).ok, true);
  assert.equal(serviceA.saveProfile(opponent.session.token, {
    expectedRevision: 0,
    profile: battleProfile("路由乙", {
      level: 8,
      hp: 1,
      maxHp: 1,
      attack: 24,
      defense: 1,
      quick: 70,
    }, null),
  }).ok, true);
  assert.equal(serviceA.updatePlayerPosition(challenger.session.token, {
    mapId: "firebud_training_yard",
    cellX: 10,
    cellY: 10,
    facing: "east",
    moving: false,
  }).ok, true);
  assert.equal(serviceA.updatePlayerPosition(opponent.session.token, {
    mapId: "firebud_training_yard",
    cellX: 11,
    cellY: 10,
    facing: "west",
    moving: false,
  }).ok, true);
  const invite = serviceA.inviteToBattle(challenger.session.token, {username: opponent.account.username});
  const accepted = serviceA.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  assert.equal(accepted.ok, true);
  const roomId = accepted.room.roomId;
  const challengerActor = accepted.room.battle.actors.find((actor) => (
    actor.accountId === challenger.account.accountId && actor.kind === "player"
  ));
  const opponentActor = accepted.room.battle.actors.find((actor) => (
    actor.accountId === opponent.account.accountId && actor.kind === "player"
  ));

  const nodeBData = serviceA.snapshot();
  nodeBData.battleRooms = {};
  nodeBData.battleRoomRecoveries = {};
  nodeBData.battleRoomRecoveryByAccountId = {};
  const serviceB = createAuthService({
    store: createMemoryAuthStore(nodeBData),
    initialData: nodeBData,
  });
  const localBState = serviceB.getBattleState(opponent.session.token);
  assert.equal(localBState.ok, true);
  assert.equal(localBState.room, null);
  assert.equal(localBState.interruption.roomId, roomId);

  const bridge = new SharedClusterBridge();
  const admissionA = fakeAdmission("node-a", (accountId, remoteNodeId, generation) => (
    accountId === opponent.account.accountId
    && remoteNodeId === "node-b"
    && generation === 2
  ));
  const admissionB = fakeAdmission("node-b", () => false, 2);
  const serverA = createHttpServer({
    service: serviceA,
    eventHubOptions: {
      clusterEventBridge: bridge,
      clusterRequired: true,
      clusterNodeId: "node-a",
      clusterOriginEpoch: "http_battle_route_epoch_a_01",
    },
    clusterAccountAdmission: admissionA,
    logger: false,
  });
  const serverB = createHttpServer({
    service: serviceB,
    eventHubOptions: {
      clusterEventBridge: bridge,
      clusterRequired: true,
      clusterNodeId: "node-b",
      clusterOriginEpoch: "http_battle_route_epoch_b_01",
    },
    clusterAccountAdmission: admissionB,
    logger: false,
  });
  const baseA = await listen(serverA);
  const baseB = await listen(serverB);
  t.after(async () => {
    await Promise.all([
      drainServerForShutdown(serverA),
      drainServerForShutdown(serverB),
    ]);
  });

  const routedState = await getJson(`${baseB}/battle/state`, opponent.session.token);
  assert.equal(routedState.response.status, 200);
  assert.equal(routedState.body.ok, true);
  assert.equal(routedState.body.room.roomId, roomId);
  assert.equal(routedState.body.interruption, null);

  const challengerCommand = await postJson(
    `${baseA}/battle/rooms/${encodeURIComponent(roomId)}/commands`,
    challenger.session.token,
    "cluster-battle-command-challenger-0001",
    {
      round: 1,
      actorId: challengerActor.actorId,
      actionId: "attack",
      targetActorId: opponentActor.actorId,
    },
  );
  assert.equal(challengerCommand.response.status, 200);
  assert.equal(challengerCommand.body.turn, null);

  const opponentOperationId = "cluster-battle-command-opponent-0001";
  const opponentPayload = {
    round: 1,
    actorId: opponentActor.actorId,
    actionId: "defend",
  };
  const first = await postJson(
    `${baseB}/battle/rooms/${encodeURIComponent(roomId)}/commands`,
    opponent.session.token,
    opponentOperationId,
    opponentPayload,
  );
  const replay = await postJson(
    `${baseB}/battle/rooms/${encodeURIComponent(roomId)}/commands`,
    opponent.session.token,
    opponentOperationId,
    opponentPayload,
  );
  assert.equal(first.response.status, 200);
  assert.equal(first.body.turn.round, 1);
  assert.equal(first.body.turn.result.reason, "defeat");
  assert.equal(first.body.room.status, "closed");
  assert.deepEqual(replay.body, first.body);
  const conflict = await postJson(
    `${baseB}/battle/rooms/${encodeURIComponent(roomId)}/commands`,
    opponent.session.token,
    opponentOperationId,
    {
      round: 1,
      actorId: opponentActor.actorId,
      actionId: "attack",
      targetActorId: challengerActor.actorId,
    },
  );
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.body.code, "idempotency_key_conflict");
  assert.equal(serverA.clusterBattleRouter.metrics().remoteExecutions >= 2, true);
  assert.equal(serverA.clusterBattleRouter.metrics().duplicateOperations, 1);
  assert.equal(serverA.clusterBattleRouter.metrics().operationConflicts, 1);

  const persistedAfterTerminal = storeA.load();
  const roomRecords = persistedAfterTerminal.battleRecords.filter((record) => record.roomId === roomId);
  assert.equal(roomRecords.length, 1);
  const terminalReceipt = persistedAfterTerminal.mutationReceipts[opponentOperationId];
  assert.ok(terminalReceipt);
  assert.equal(terminalReceipt.accountId, opponent.account.accountId);
  assert.equal(terminalReceipt.scopeKind, "character");
  assert.equal(terminalReceipt.response.room.status, "closed");

  // Simulate loss of the room owner's in-memory router cache. The durable
  // receipt must still replay the terminal settlement without another record.
  const opponentIdentity = serviceA._clusterIngressIdentity(opponent.session.token);
  assert.equal(opponentIdentity.ok, true);
  const clusterCredential = serviceA._issueClusterBattleCredential(opponentIdentity);
  assert.ok(clusterCredential);
  const forgedCredentialReplay = await serviceA.invokeDurable(
    "_clusterSubmitBattleCommand",
    [{...clusterCredential}, roomId, opponentPayload],
    {
      operationId: opponentOperationId,
      requestHash: terminalReceipt.requestHash,
      actionId: terminalReceipt.actionId,
    },
  );
  assert.equal(forgedCredentialReplay.ok, false);
  assert.equal(forgedCredentialReplay.code, "cluster_battle_identity_invalid");
  const forgedPublicReplay = await serviceA.invokeDurable(
    "submitBattleCommand",
    [{...clusterCredential}, roomId, opponentPayload],
    {
      operationId: opponentOperationId,
      requestHash: terminalReceipt.requestHash,
      actionId: terminalReceipt.actionId,
    },
  );
  assert.equal(forgedPublicReplay.ok, false);
  assert.equal(forgedPublicReplay.code, "session_missing");
  const durableReplay = await serviceA.invokeDurable(
    "_clusterSubmitBattleCommand",
    [clusterCredential, roomId, opponentPayload],
    {
      operationId: opponentOperationId,
      requestHash: terminalReceipt.requestHash,
      actionId: terminalReceipt.actionId,
    },
  );
  assert.equal(durableReplay.ok, true);
  assert.equal(durableReplay.room.status, "closed");
  assert.equal(durableReplay.durableCommit.replayed, true);
  assert.equal(storeA.load().battleRecords.filter((record) => record.roomId === roomId).length, 1);

  const nextState = await getJson(`${baseB}/battle/state`, opponent.session.token);
  assert.equal(nextState.response.status, 200);
  assert.equal(nextState.body.room.status, "closed");
  assert.equal(admissionA.verifications.length >= 3, true);
  assert.equal(admissionA.verifications.every((entry) => (
    entry[0] === opponent.account.accountId
    && entry[1] === "node-b"
    && entry[2] === 2
  )), true);
  const streamText = JSON.stringify(bridge.published);
  assert.equal(streamText.includes(challenger.session.token), false);
  assert.equal(streamText.includes(opponent.session.token), false);
  assert.equal(streamText.includes("authorization"), false);
  assert.equal(streamText.includes("Bearer"), false);
});

function fakeAdmission(nodeId, verify, generation = 1) {
  return {
    nodeId,
    observer: null,
    verifications: [],
    setPresenceRevisionObserver(observer) {
      this.observer = observer;
    },
    admit() {
      return Promise.resolve({ok: true, generation});
    },
    verifyRemoteOwner(accountId, remoteNodeId, remoteGeneration) {
      this.verifications.push([accountId, remoteNodeId, remoteGeneration]);
      return Promise.resolve(Boolean(verify(accountId, remoteNodeId, remoteGeneration)));
    },
    health() {
      return {
        ok: true,
        runtimeHealthy: true,
        closed: false,
        fatal: false,
        ownedAccounts: 2,
        pendingAdmissions: 0,
      };
    },
    close() {
      return Promise.resolve();
    },
  };
}

class SharedClusterBridge {
  constructor() {
    this.capabilities = REQUIRED_CLUSTER_EVENT_CAPABILITIES;
    this.listeners = new Set();
    this.published = [];
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(envelope) {
    const snapshot = JSON.parse(JSON.stringify(envelope));
    this.published.push(snapshot);
    for (const listener of this.listeners) {
      listener(snapshot);
    }
    return Promise.resolve();
  }

  nodeLeaseState() {
    return Promise.resolve({known: true, alive: true, ttlMs: 1000});
  }

  health() {
    return {
      ok: true,
      leaseHeld: true,
      readerRunning: true,
      readerHealthy: true,
    };
  }

  close() {
    return Promise.resolve();
  }
}

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}

function protocolHeaders(token, extra = {}) {
  return {
    [CLIENT_PROTOCOL_HEADER]: String(PROTOCOL_VERSION),
    [CLIENT_VERSION_HEADER]: SERVER_VERSION,
    authorization: `Bearer ${token}`,
    ...extra,
  };
}

async function getJson(url, token) {
  const response = await fetch(url, {headers: protocolHeaders(token)});
  return {response, body: await response.json()};
}

async function postJson(url, token, operationId, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: protocolHeaders(token, {
      "content-type": "application/json",
      "idempotency-key": operationId,
    }),
    body: JSON.stringify(payload),
  });
  return {response, body: await response.json()};
}
