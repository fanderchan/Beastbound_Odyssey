"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  DEFAULT_STREAM_KEY,
  createValkeyStreamEventBridge,
} = require("../src/valkey-stream-event-bridge");

test("Valkey stream bridge serializes bounded publishes and acknowledges delivery after acceptance", async () => {
  const clients = fakeClients({
    reads: [
      null,
      streamResult("1-0", [["envelope", JSON.stringify(clusterEnvelope(
        "node-b",
        "epoch_node_b_000001",
        1,
        {type: "party.update"},
      ))]]),
    ],
  });
  const received = [];
  const bridge = await createValkeyStreamEventBridge({
    nodeId: "node-a",
    leaseToken: "lease_token_node_a_000001",
    clients,
    readBlockMs: 10,
    retryDelayMs: 1,
    maxStreamLength: 4096,
  });
  const unsubscribe = bridge.subscribe((envelope) => {
    received.push(envelope);
    return true;
  });
  await waitFor(() => received.length === 1);

  const outbound = clusterEnvelope(
    "node-a",
    "epoch_node_a_000001",
    1,
    {type: "chat.message", text: "hello"},
  );
  await bridge.publish(outbound);

  assert.equal(clients.control.calls[0][0], "SET");
  assert.equal(clients.reader.groupCreates.length, 1);
  assert.equal(clients.writer.adds.length, 1);
  assert.equal(clients.writer.adds[0].key, DEFAULT_STREAM_KEY);
  assert.deepEqual(clients.writer.adds[0].options, {
    trim: {method: "maxlen", threshold: 4096, exact: false},
  });
  assert.deepEqual(JSON.parse(clients.writer.adds[0].values[0][1]), outbound);
  assert.deepEqual(clients.reader.acks, [{
    key: DEFAULT_STREAM_KEY,
    group: "beastbound:cluster:node:v1:node-a",
    ids: ["1-0"],
  }]);
  assert.equal(bridge.health().ok, true);
  assert.equal(bridge.metrics().published, 1);
  assert.equal(bridge.metrics().acknowledged, 1);
  assert.equal((await bridge.nodeLeaseState("node-a")).alive, true);
  clients.control.remoteLeaseTtlMs = 1250;
  assert.deepEqual(await bridge.nodeLeaseState("node-b"), {
    known: true,
    alive: true,
    ttlMs: 1250,
  });
  clients.control.remoteLeaseTtlMs = -2;
  assert.deepEqual(await bridge.nodeLeaseState("node-b"), {
    known: true,
    alive: false,
    ttlMs: 0,
  });

  unsubscribe();
  await bridge.close();
  assert.equal(clients.writer.closed, true);
  assert.equal(clients.reader.closed, true);
  assert.equal(clients.control.closed, true);
  assert.equal(bridge.health().ok, false);
  assert.equal(clients.control.calls.at(-1)[0], "EVAL");
});

test("Valkey stream bridge retries an unaccepted pending entry and drops malformed JSON without poisoning the stream", async () => {
  const valid = [["envelope", JSON.stringify(clusterEnvelope(
    "node-b",
    "epoch_node_b_000002",
    1,
    {type: "online.position"},
  ))]];
  const clients = fakeClients({
    reads: [
      null,
      streamResult("2-0", valid),
      streamResult("2-0", valid),
      null,
      streamResult("3-0", [["envelope", "{not-json"]]),
    ],
  });
  let attempts = 0;
  const errors = [];
  const bridge = await createValkeyStreamEventBridge({
    nodeId: "node-b",
    leaseToken: "lease_token_node_b_000001",
    clients,
    readBlockMs: 10,
    retryDelayMs: 1,
    onError: (error) => errors.push(error.code),
  });
  bridge.subscribe(() => {
    attempts += 1;
    return attempts > 1;
  });

  await waitFor(() => clients.reader.acks.length === 2);
  assert.equal(attempts, 2);
  assert.equal(bridge.metrics().deliveryRetries, 1);
  assert.equal(bridge.metrics().invalidDropped, 1);
  assert.deepEqual(clients.reader.acks.map((entry) => entry.ids[0]), ["2-0", "3-0"]);
  assert.equal(errors.includes("cluster_valkey_envelope_json_invalid"), true);
  await bridge.close();
});

test("Valkey stream bridge fails closed on duplicate node lease, trimmed pending replay, and publish queue overflow", async () => {
  const duplicate = fakeClients({leaseResult: null});
  await assert.rejects(
    createValkeyStreamEventBridge({
      nodeId: "node-a",
      leaseToken: "lease_token_node_a_000002",
      clients: duplicate,
    }),
    (error) => error && error.code === "cluster_valkey_node_lease_conflict",
  );
  assert.equal(duplicate.reader.closed, true);

  const gap = fakeClients({groupLag: null});
  await assert.rejects(
    createValkeyStreamEventBridge({
      nodeId: "node-gap",
      leaseToken: "lease_token_node_gap_0001",
      clients: gap,
    }),
    (error) => error && error.code === "cluster_valkey_replay_gap_detected",
  );
  assert.equal(gap.control.calls.some((args) => (
    args[0] === "EVAL" && String(args[1]).includes("DEL")
  )), true);
  assert.equal(gap.reader.closed, true);

  const replayClients = fakeClients({
    reads: [streamResult("4-0", null)],
  });
  const fatals = [];
  const replayBridge = await createValkeyStreamEventBridge({
    nodeId: "node-c",
    leaseToken: "lease_token_node_c_000001",
    clients: replayClients,
    readBlockMs: 10,
    retryDelayMs: 1,
    onFatal: (error) => fatals.push(error.code),
  });
  replayBridge.subscribe(() => true);
  await waitFor(() => fatals.length === 1);
  assert.deepEqual(fatals, ["cluster_valkey_replay_window_exhausted"]);
  assert.equal(replayBridge.health().fatal, true);
  await assert.rejects(
    replayBridge.publish(clusterEnvelope(
      "node-c",
      "epoch_node_c_000001",
      1,
      {type: "party.update"},
    )),
    (error) => error && error.code === "cluster_valkey_publish_unavailable",
  );
  await replayBridge.close();

  let releaseWrite;
  const queueClients = fakeClients({
    writerResult: () => new Promise((resolve) => { releaseWrite = resolve; }),
  });
  const queueBridge = await createValkeyStreamEventBridge({
    nodeId: "node-d",
    leaseToken: "lease_token_node_d_000001",
    clients: queueClients,
    maxQueuedPublishes: 1,
  });
  const first = queueBridge.publish(clusterEnvelope(
    "node-d",
    "epoch_node_d_000001",
    1,
    {type: "party.update"},
  ));
  await assert.rejects(
    queueBridge.publish(clusterEnvelope(
      "node-d",
      "epoch_node_d_000001",
      2,
      {type: "party.update"},
    )),
    (error) => error && error.code === "cluster_valkey_publish_queue_full",
  );
  releaseWrite("5-0");
  await first;
  assert.equal(queueBridge.metrics().publishRejected, 1);
  await queueBridge.close();
});

test("Valkey stream bridge turns lease loss into a fatal readiness and publish failure", async () => {
  const clients = fakeClients({renewResult: 0});
  const fatals = [];
  const bridge = await createValkeyStreamEventBridge({
    nodeId: "node-lease",
    leaseToken: "lease_token_node_lease_001",
    clients,
    leaseMs: 3000,
    onFatal: (error) => fatals.push(error.code),
  });
  bridge.subscribe(() => true);
  await waitFor(() => fatals.length === 1, 1500);
  assert.deepEqual(fatals, ["cluster_valkey_node_lease_lost"]);
  assert.equal(bridge.health().ok, false);
  assert.equal(bridge.health().leaseHeld, false);
  await assert.rejects(
    bridge.publish(clusterEnvelope(
      "node-lease",
      "epoch_node_lease_001",
      1,
      {type: "party.update"},
    )),
    (error) => error && error.code === "cluster_valkey_publish_unavailable",
  );
  await bridge.close();
});

function fakeClients(options = {}) {
  return {
    writer: new FakeWriter(options.writerResult),
    reader: new FakeReader(options.reads || [], options.groupLag),
    control: new FakeControl(options.leaseResult, options.renewResult, options.remoteLeaseTtlMs),
  };
}

class FakeWriter {
  constructor(result = null) {
    this.result = result;
    this.adds = [];
    this.closed = false;
  }

  async xadd(key, values, options) {
    this.adds.push({key, values, options});
    if (typeof this.result === "function") {
      return this.result({key, values, options});
    }
    return `${this.adds.length}-0`;
  }

  close() {
    this.closed = true;
  }
}

class FakeReader {
  constructor(reads, groupLag = 0) {
    this.reads = [...reads];
    this.groupLag = groupLag;
    this.groupCreates = [];
    this.readCalls = [];
    this.acks = [];
    this.waiters = [];
    this.closed = false;
  }

  async xgroupCreate(key, groupName, id, options) {
    this.groupCreates.push({key, groupName, id, options});
    return "OK";
  }

  async xinfoGroups() {
    const groupName = this.groupCreates.at(-1).groupName;
    return [{
      name: groupName,
      consumers: 0,
      pending: 0,
      "last-delivered-id": "0-0",
      "entries-read": 0,
      lag: this.groupLag,
    }];
  }

  async xreadgroup(group, consumer, streams, options) {
    this.readCalls.push({group, consumer, streams, options});
    if (this.reads.length > 0) {
      return this.reads.shift();
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  async xack(key, group, ids) {
    this.acks.push({key, group, ids});
    return 1;
  }

  close() {
    this.closed = true;
    for (const resolve of this.waiters.splice(0)) {
      resolve(null);
    }
  }
}

class FakeControl {
  constructor(leaseResult = "OK", renewResult = 1, remoteLeaseTtlMs = -2) {
    this.leaseResult = leaseResult;
    this.renewResult = renewResult;
    this.remoteLeaseTtlMs = remoteLeaseTtlMs;
    this.calls = [];
    this.closed = false;
  }

  async customCommand(args) {
    this.calls.push(args);
    if (args[0] === "SET") {
      return this.leaseResult;
    }
    if (args[0] === "EVAL") {
      return String(args[1]).includes("PEXPIRE") ? this.renewResult : 1;
    }
    if (args[0] === "PTTL") {
      return this.remoteLeaseTtlMs;
    }
    throw new Error("unexpected command");
  }

  close() {
    this.closed = true;
  }
}

function streamResult(id, fields) {
  return [{
    key: DEFAULT_STREAM_KEY,
    value: [{key: id, value: fields}],
  }];
}

function clusterEnvelope(nodeId, epoch, sequence, event) {
  return {
    schemaVersion: 1,
    originNodeId: nodeId,
    originEpoch: epoch,
    originSequence: sequence,
    eventId: `${nodeId}:${epoch}:${sequence}`,
    publishedAtMs: 1786723200000,
    event,
  };
}

async function waitFor(predicate, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("condition timed out");
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
}
