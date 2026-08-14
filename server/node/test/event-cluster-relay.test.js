"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  REQUIRED_CLUSTER_EVENT_CAPABILITIES,
  createEventClusterRelay,
} = require("../src/event-cluster-relay");

test("cluster relay fans out once across nodes, ignores its own echo, and deduplicates replay", async () => {
  const bridge = new FakeClusterBridge();
  const receivedA = [];
  const receivedB = [];
  const relayA = createRelay(bridge, "node-a", "epoch_node_a_000001", receivedA);
  const relayB = createRelay(bridge, "node-b", "epoch_node_b_000001", receivedB);

  const source = {
    type: "party.update",
    eventSeq: 41,
    targetAccountIds: ["acc_b"],
    party: {partyId: "party_1"},
  };
  assert.equal(relayA.publishLocal(source), true);
  source.party.partyId = "mutated_after_publish";
  await nextImmediate();

  assert.deepEqual(receivedA, []);
  assert.equal(receivedB.length, 1);
  assert.equal(receivedB[0].event.party.partyId, "party_1");
  assert.equal(receivedB[0].metadata.originNodeId, "node-a");
  assert.equal(bridge.published.length, 1);
  assert.deepEqual(
    Object.keys(bridge.published[0]).sort(),
    [
      "event",
      "eventId",
      "originEpoch",
      "originNodeId",
      "originSequence",
      "publishedAtMs",
      "schemaVersion",
    ],
  );

  bridge.redeliver(bridge.published[0]);
  assert.equal(receivedB.length, 1);
  assert.equal(relayB.metrics().remoteDuplicates, 1);
  assert.equal(relayA.metrics().remoteSelfIgnored, 2);

  assert.equal(relayB.publishLocal({
    type: "online.position",
    accountId: "acc_b",
    presenceRevision: 9,
  }), true);
  await nextImmediate();
  assert.equal(receivedA.length, 1);
  assert.equal(receivedA[0].event.type, "online.position");
  assert.equal(receivedA[0].metadata.originNodeId, "node-b");
  assert.equal(relayA.metrics().remoteDelivered, 1);
  assert.equal(relayA.metrics().publishAcknowledged, 1);
  assert.equal(relayB.metrics().publishAcknowledged, 1);

  await Promise.all([relayA.close(), relayB.close()]);
  assert.equal(bridge.listenerCount(), 0);
});

test("cluster relay rejects unsafe topology, malformed envelopes, and non-JSON or oversized events", async () => {
  assert.throws(
    () => createEventClusterRelay({required: true}),
    (error) => error && error.code === "cluster_event_bridge_required",
  );
  assert.throws(
    () => createEventClusterRelay({
      bridge: new FakeClusterBridge({delivery: "best_effort"}),
      nodeId: "node-a",
    }),
    (error) => error && error.code === "cluster_event_capability_missing",
  );
  assert.throws(
    () => createEventClusterRelay({bridge: new FakeClusterBridge()}),
    (error) => error && error.code === "cluster_node_id_required",
  );

  const bridge = new FakeClusterBridge();
  const errors = [];
  const relay = createEventClusterRelay({
    bridge,
    nodeId: "node-a",
    originEpoch: "epoch_node_a_000002",
    maxEventBytes: 128,
    onError: (error) => errors.push(error.code),
  });
  const cyclic = {type: "party.update"};
  cyclic.self = cyclic;
  assert.equal(relay.publishLocal(cyclic), false);
  assert.equal(relay.publishLocal({type: "party.update", payload: "x".repeat(256)}), false);
  assert.equal(relay.publishLocal({type: "invalid type"}), false);
  assert.equal(relay.publishLocal({type: "party.update", dropped: () => true}), false);
  assert.deepEqual(errors, [
    "cluster_event_not_json",
    "cluster_event_too_large",
    "cluster_event_invalid",
    "cluster_event_not_json",
  ]);
  assert.equal(bridge.published.length, 0);
  assert.equal(relay.metrics().localRejected, 4);

  bridge.redeliver({
    schemaVersion: 1,
    originNodeId: "node-b",
    originEpoch: "epoch_node_b_000002",
    originSequence: 1,
    eventId: "spoofed",
    publishedAtMs: Date.now(),
    event: {type: "party.update"},
  });
  assert.equal(relay.metrics().remoteInvalid, 1);
  assert.equal(errors.at(-1), "cluster_event_envelope_invalid");
  await relay.close();
});

test("cluster relay records asynchronous publish rejection and close drains accepted publishes", async () => {
  let releasePublish;
  const bridge = new FakeClusterBridge();
  bridge.publishResult = () => new Promise((resolve) => {
    releasePublish = resolve;
  });
  const errors = [];
  const relay = createEventClusterRelay({
    bridge,
    nodeId: "node-a",
    originEpoch: "epoch_node_a_000003",
    publishTimeoutMs: 1000,
    onError: (error) => errors.push(error.code),
  });
  assert.equal(relay.publishLocal({type: "chat.message", eventSeq: 1}), true);
  assert.equal(relay.metrics().pendingPublishes, 1);
  const closing = relay.close();
  let closed = false;
  closing.then(() => { closed = true; });
  await nextImmediate();
  assert.equal(closed, false);
  releasePublish();
  await closing;
  assert.equal(relay.metrics().publishAcknowledged, 1);
  assert.equal(relay.metrics().pendingPublishes, 0);

  const rejectingBridge = new FakeClusterBridge();
  rejectingBridge.publishResult = () => Promise.reject(Object.assign(
    new Error("bridge down"),
    {code: "bridge_down"},
  ));
  const rejecting = createEventClusterRelay({
    bridge: rejectingBridge,
    nodeId: "node-b",
    originEpoch: "epoch_node_b_000003",
    onError: (error) => errors.push(error.code),
  });
  assert.equal(rejecting.publishLocal({type: "battle.invite", eventSeq: 2}), true);
  await nextImmediate();
  assert.equal(rejecting.metrics().publishFailures, 1);
  assert.equal(errors.at(-1), "bridge_down");
  await rejecting.close();
});

test("cluster relay sanitizes bridge health and owns bridge shutdown", async () => {
  const bridge = new FakeClusterBridge();
  bridge.healthResult = {
    ok: false,
    leaseHeld: false,
    readerRunning: true,
    readerHealthy: false,
    secretTopic: "must-not-leak",
  };
  const relay = createRelay(bridge, "node-a", "epoch_node_a_000004", []);
  const metrics = relay.metrics();
  assert.equal(metrics.runtimeHealthy, false);
  assert.equal(metrics.bridgeHealthChecked, true);
  assert.equal(metrics.bridgeLeaseHeld, false);
  assert.equal(metrics.bridgeReaderRunning, true);
  assert.equal(metrics.bridgeReaderHealthy, false);
  assert.equal(Object.hasOwn(metrics, "secretTopic"), false);

  await relay.close();
  await relay.close();
  assert.equal(bridge.closeCalls, 1);
});

function createRelay(bridge, nodeId, originEpoch, target) {
  return createEventClusterRelay({
    bridge,
    nodeId,
    originEpoch,
    now: () => 1786723200000,
    onRemoteEvent(event, metadata) {
      target.push({event, metadata});
    },
  });
}

class FakeClusterBridge {
  constructor(capabilityOverrides = {}) {
    this.capabilities = {
      ...REQUIRED_CLUSTER_EVENT_CAPABILITIES,
      ...capabilityOverrides,
    };
    this.listeners = new Set();
    this.published = [];
    this.publishResult = null;
    this.healthResult = null;
    this.closeCalls = 0;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(envelope) {
    this.published.push(envelope);
    for (const listener of this.listeners) {
      listener(envelope);
    }
    return this.publishResult ? this.publishResult(envelope) : Promise.resolve();
  }

  redeliver(envelope) {
    for (const listener of this.listeners) {
      listener(envelope);
    }
  }

  listenerCount() {
    return this.listeners.size;
  }

  metrics() {
    return {published: this.published.length};
  }

  health() {
    return this.healthResult || {
      ok: true,
      leaseHeld: true,
      readerRunning: true,
      readerHealthy: true,
    };
  }

  async close() {
    this.closeCalls += 1;
  }
}

function nextImmediate() {
  return new Promise((resolve) => setImmediate(resolve));
}
