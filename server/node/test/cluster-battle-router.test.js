"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  STATE_RESPONSE,
  createClusterBattleRouter,
} = require("../src/cluster-battle-router");

const ACCOUNT_ID = "account_cross_battle";
const PLAYER_ID = "player_cross_battle";
const ROOM_ID = "battle_cross_node_1";
const TOKEN_MARKER = "T".repeat(43);

test("cross-node battle commands execute once, replay exactly, and reject an altered idempotency intent", async (t) => {
  const bus = new FakeControlBus();
  const owner = fakeOwner(() => true);
  const serviceA = fakeService({roomKnown: true});
  const serviceB = fakeService({roomKnown: false});
  const hubA = bus.hub("node-a");
  const hubB = bus.hub("node-b");
  const routerA = createRouter("node-a", hubA, owner, serviceA);
  const routerB = createRouter("node-b", hubB, owner, serviceB);
  t.after(() => {
    routerA.close();
    routerB.close();
  });
  hubB.observeRemote({
    type: "battle.room_ready",
    roomId: ROOM_ID,
  }, {originNodeId: "node-a"});

  const context = ingress();
  const localState = interruptedState();
  const localMissing = battleMissing();
  const operation = durableOperation("a".repeat(64));
  const payload = {round: 1, actorId: "actor_b", actionId: "attack", targetActorId: "actor_a"};
  const first = await routerB.routeCommand(
    context,
    ROOM_ID,
    payload,
    operation,
    localMissing,
    localState,
  );
  const replay = await routerB.routeCommand(
    context,
    ROOM_ID,
    payload,
    operation,
    localMissing,
    localState,
  );
  const conflict = await routerB.routeCommand(
    context,
    ROOM_ID,
    payload,
    durableOperation("b".repeat(64)),
    localMissing,
    localState,
  );

  assert.deepEqual(first, replay);
  assert.equal(first.ok, true);
  assert.equal(first.command.commandId, "remote_command_1");
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "idempotency_key_conflict");
  assert.equal(serviceA.commandExecutions, 1);
  assert.equal(routerA.metrics().duplicateOperations, 1);
  assert.equal(routerA.metrics().operationConflicts, 1);
  assert.equal(owner.verifications.length, 3);
  assert.deepEqual(owner.verifications[0], [ACCOUNT_ID, "node-b", 2]);
  const streamText = JSON.stringify(bus.published);
  assert.equal(streamText.includes(TOKEN_MARKER), false);
  assert.equal(streamText.includes("authorization"), false);
  assert.equal(streamText.includes("Bearer"), false);
});

test("a stale account owner cannot execute a remote battle command", async (t) => {
  const bus = new FakeControlBus();
  const owner = fakeOwner(() => false);
  const serviceA = fakeService({roomKnown: true});
  const hubA = bus.hub("node-a");
  const hubB = bus.hub("node-b");
  const routerA = createRouter("node-a", hubA, owner, serviceA);
  const routerB = createRouter("node-b", hubB, owner, fakeService({roomKnown: false}));
  t.after(() => {
    routerA.close();
    routerB.close();
  });
  hubB.observeRemote({type: "battle.room_ready", roomId: ROOM_ID}, {originNodeId: "node-a"});

  await assert.rejects(
    routerB.routeCommand(
      ingress(),
      ROOM_ID,
      {round: 1, actorId: "actor_b", actionId: "attack"},
      durableOperation("c".repeat(64)),
      battleMissing(),
      interruptedState(),
    ),
    (error) => error && error.statusCode === 503 && error.code === "account_node_switching",
  );
  assert.equal(serviceA.commandExecutions, 0);
  assert.equal(routerA.metrics().staleOwnerRejected, 1);
});

test("state routing fails closed while the known room owner is live and permits neutral recovery after its lease expires", async (t) => {
  const bus = new FakeControlBus();
  const hubB = bus.hub("node-b");
  const routerB = createRouter(
    "node-b",
    hubB,
    fakeOwner(() => true),
    fakeService({roomKnown: false}),
    {requestTimeoutMs: 250},
  );
  t.after(() => routerB.close());
  hubB.observeRemote({type: "battle.room_ready", roomId: ROOM_ID}, {originNodeId: "node-a"});
  hubB.leaseStates.set("node-a", {known: true, alive: true, ttlMs: 1200});

  await assert.rejects(
    routerB.routeState(ingress(), interruptedState()),
    (error) => error && error.statusCode === 503 && error.code === "battle_route_unavailable",
  );

  hubB.leaseStates.set("node-a", {known: true, alive: false, ttlMs: 0});
  const recovered = await routerB.routeState(ingress(), interruptedState());
  assert.deepEqual(recovered, interruptedState());
  assert.equal(routerB.metrics().timeouts, 2);
});

test("a routed response is bound to the observed room owner and exact room", async (t) => {
  const bus = new FakeControlBus();
  const hubB = bus.hub("node-b");
  const routerB = createRouter(
    "node-b",
    hubB,
    fakeOwner(() => true),
    fakeService({roomKnown: false}),
  );
  t.after(() => routerB.close());
  hubB.observeRemote({type: "battle.room_ready", roomId: ROOM_ID}, {originNodeId: "node-a"});

  const routed = routerB.routeState(ingress(), interruptedState());
  const request = bus.published.at(-1).event;
  const response = {
    type: STATE_RESPONSE,
    schemaVersion: 1,
    requestId: request.requestId,
    requesterNodeId: "node-b",
    targetNodeId: "node-b",
    responderNodeId: "node-c",
    roomId: ROOM_ID,
    result: {ok: true, room: {roomId: ROOM_ID, status: "ready"}, interruption: null},
  };
  hubB.controlHandler(response, {eventId: "forged_node", originNodeId: "node-c"});
  assert.equal(routerB.metrics().pendingRequests, 1);

  response.responderNodeId = "node-a";
  response.roomId = "battle_cross_node_wrong";
  hubB.controlHandler(response, {eventId: "wrong_room", originNodeId: "node-a"});
  assert.equal(routerB.metrics().pendingRequests, 1);

  response.roomId = ROOM_ID;
  hubB.controlHandler(response, {eventId: "correct_response", originNodeId: "node-a"});
  assert.deepEqual(await routed, response.result);
  assert.equal(routerB.metrics().pendingRequests, 0);
});

function createRouter(nodeId, eventHub, accountOwner, service, extra = {}) {
  let randomSerial = nodeId === "node-a" ? 1 : 21;
  return createClusterBattleRouter({
    nodeId,
    eventHub,
    accountOwner,
    service,
    requestTimeoutMs: 500,
    randomBytes(size) {
      const value = Buffer.alloc(size, randomSerial);
      randomSerial = (randomSerial + 1) & 0xff;
      return value;
    },
    ...extra,
  });
}

function fakeOwner(decide) {
  return {
    verifications: [],
    async verifyRemoteOwner(accountId, nodeId, generation) {
      this.verifications.push([accountId, nodeId, generation]);
      return Boolean(decide(accountId, nodeId, generation));
    },
  };
}

function fakeService({roomKnown}) {
  return {
    commandExecutions: 0,
    _issueClusterBattleCredential(identity) {
      return Object.freeze({...identity, credentialKind: "cluster_battle_v1"});
    },
    _clusterBattleRoomKnown() {
      return roomKnown;
    },
    invokeDurable(methodName, args, operation) {
      if (methodName === "_clusterGetBattleState") {
        return Promise.resolve({
          ok: true,
          room: {roomId: args[1], status: "ready"},
          interruption: null,
        });
      }
      assert.equal(methodName, "_clusterSubmitBattleCommand");
      assert.equal(operation.operationId, "battle-route-operation-0001");
      this.commandExecutions += 1;
      return Promise.resolve({
        ok: true,
        command: {commandId: `remote_command_${this.commandExecutions}`},
        room: {roomId: args[1], status: "ready"},
        message: "回合命令已提交。",
      });
    },
  };
}

function ingress() {
  return {
    accountId: ACCOUNT_ID,
    playerId: PLAYER_ID,
    selectionEpoch: 4,
    ownerGeneration: 2,
  };
}

function durableOperation(requestHash) {
  return {
    operationId: "battle-route-operation-0001",
    requestHash,
    actionId: `POST /battle/rooms/${ROOM_ID}/commands`,
  };
}

function battleMissing() {
  return {ok: false, code: "battle_room_missing", message: "切磋房间不存在。"};
}

function interruptedState() {
  return {
    ok: true,
    room: null,
    interruption: {
      kind: "battle_owner_interruption",
      roomId: ROOM_ID,
    },
  };
}

class FakeControlBus {
  constructor() {
    this.hubs = new Map();
    this.published = [];
    this.nextEventId = 1;
  }

  hub(nodeId) {
    const hub = new FakeEventHub(this, nodeId);
    this.hubs.set(nodeId, hub);
    return hub;
  }

  publish(sourceNodeId, event) {
    const snapshot = JSON.parse(JSON.stringify(event));
    const metadata = {
      eventId: `fake_event_${this.nextEventId}`,
      originNodeId: sourceNodeId,
    };
    this.nextEventId += 1;
    this.published.push({sourceNodeId, event: snapshot});
    for (const [nodeId, hub] of this.hubs) {
      if (nodeId !== sourceNodeId && hub.controlHandler) {
        setImmediate(() => hub.controlHandler(snapshot, metadata));
      }
    }
    return true;
  }
}

class FakeEventHub {
  constructor(bus, nodeId) {
    this.bus = bus;
    this.nodeId = nodeId;
    this.controlHandler = null;
    this.remoteObserver = null;
    this.leaseStates = new Map();
  }

  publishClusterControl(event) {
    return this.bus.publish(this.nodeId, event);
  }

  setClusterControlHandler(handler) {
    assert.equal(this.controlHandler, null);
    this.controlHandler = handler;
    return () => {
      if (this.controlHandler === handler) {
        this.controlHandler = null;
      }
    };
  }

  setClusterRemoteEventObserver(observer) {
    assert.equal(this.remoteObserver, null);
    this.remoteObserver = observer;
    return () => {
      if (this.remoteObserver === observer) {
        this.remoteObserver = null;
      }
    };
  }

  clusterNodeLeaseState(nodeId) {
    return Promise.resolve(this.leaseStates.get(nodeId) || {known: false, alive: false, ttlMs: 0});
  }

  observeRemote(event, metadata) {
    this.remoteObserver?.(event, metadata);
  }
}
