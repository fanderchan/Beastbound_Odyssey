"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const {
  createEventClusterRelay,
} = require("../src/event-cluster-relay");
const {
  createValkeyStreamEventBridge,
} = require("../src/valkey-stream-event-bridge");

const livePort = Number(process.env.BEASTBOUND_TEST_VALKEY_PORT || 0);
const liveEnabled = Number.isSafeInteger(livePort) && livePort > 0 && livePort <= 65535;

test("real Valkey stream relays across clients, rejects duplicate node leases, and replays pending delivery", {
  skip: liveEnabled ? false : "BEASTBOUND_TEST_VALKEY_PORT is not configured",
}, async () => {
  const suffix = crypto.randomBytes(8).toString("hex");
  const streamKey = `beastbound:test:cluster:${suffix}`;
  const common = {
    streamKey,
    groupPrefix: `beastbound:test:group:${suffix}`,
    leasePrefix: `beastbound:test:lease:${suffix}`,
    maxStreamLength: 1024,
    readBlockMs: 25,
    retryDelayMs: 5,
    leaseMs: 3000,
    connection: {
      host: "127.0.0.1",
      port: livePort,
      useTLS: false,
      requestTimeoutMs: 1000,
    },
  };
  const errors = [];
  const bridgeA = await createValkeyStreamEventBridge({
    ...common,
    nodeId: "live-node-a",
    onError: (error) => errors.push(error.code),
  });
  const bridgeB = await createValkeyStreamEventBridge({
    ...common,
    nodeId: "live-node-b",
    onError: (error) => errors.push(error.code),
  });
  const receivedA = [];
  const receivedB = [];
  const relayA = createEventClusterRelay({
    bridge: bridgeA,
    required: true,
    nodeId: "live-node-a",
    originEpoch: "live_epoch_node_a_000001",
    onRemoteEvent: (event) => receivedA.push(event),
  });
  const relayB = createEventClusterRelay({
    bridge: bridgeB,
    required: true,
    nodeId: "live-node-b",
    originEpoch: "live_epoch_node_b_000001",
    onRemoteEvent: (event) => receivedB.push(event),
  });

  assert.equal(relayA.publishLocal({
    type: "party.update",
    eventSeq: 1,
    targetAccountIds: ["account-b"],
  }), true);
  await waitFor(() => receivedB.length === 1);
  assert.equal(receivedA.length, 0);
  assert.equal(receivedB[0].type, "party.update");
  assert.equal(relayA.metrics().runtimeHealthy, true);
  assert.equal(relayB.metrics().runtimeHealthy, true);

  await assert.rejects(
    createValkeyStreamEventBridge({
      ...common,
      nodeId: "live-node-a",
    }),
    (error) => error && error.code === "cluster_valkey_node_lease_conflict",
  );

  let rejectedDeliveries = 0;
  const bridgeC1 = await createValkeyStreamEventBridge({
    ...common,
    nodeId: "live-node-c",
  });
  bridgeC1.subscribe(() => {
    rejectedDeliveries += 1;
    return false;
  });
  const replayEnvelope = {
    schemaVersion: 1,
    originNodeId: "live-node-a",
    originEpoch: "live_epoch_node_a_000001",
    originSequence: 2,
    eventId: "live-node-a:live_epoch_node_a_000001:2",
    publishedAtMs: Date.now(),
    event: {type: "chat.message", eventSeq: 2},
  };
  await bridgeA.publish(replayEnvelope);
  await waitFor(() => rejectedDeliveries > 0 && bridgeC1.metrics().deliveryRetries > 0);
  await bridgeC1.close();

  const replayed = [];
  const bridgeC2 = await createValkeyStreamEventBridge({
    ...common,
    nodeId: "live-node-c",
  });
  bridgeC2.subscribe((envelope) => {
    replayed.push(envelope.event.type);
    return true;
  });
  await waitFor(() => replayed.includes("chat.message"));
  assert.equal(bridgeC2.metrics().acknowledged >= 1, true);
  assert.equal(errors.length, 0);

  await Promise.all([
    relayA.close(),
    relayB.close(),
    bridgeC2.close(),
  ]);
});

async function waitFor(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("live Valkey condition timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
