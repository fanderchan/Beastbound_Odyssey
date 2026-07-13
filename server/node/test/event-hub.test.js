"use strict";

const assert = require("node:assert/strict");
const {EventEmitter} = require("node:events");
const {once} = require("node:events");
const http = require("node:http");
const net = require("node:net");
const {setTimeout: delay} = require("node:timers/promises");
const test = require("node:test");
const {TEST_AUTH_SUBPROTOCOL, createEventHub} = require("../src/event-hub");
const {
  DEFAULT_EVENT_HUB_WRITER_LIMITS,
  createEventHubWriter,
  encodeEventFrame,
  encodeFrame,
} = require("../src/event-hub-writer");
const {markReusableEventProjection} = require("../src/event-projection-cache");
const {createEventSubscriptionIndex} = require("../src/event-hub-subscriptions");
const {projectOnlinePositionDelta, projectOnlinePositionRebase} = require("../src/auth/online-presence");
const {PROTOCOL_VERSION} = require("../src/protocol");

const TEST_EVENT_STREAM_EPOCH = Buffer.alloc(16, 0x35).toString("base64url");
const PRODUCTION_TOKEN_A = "A".repeat(43);
const PRODUCTION_TOKEN_B = "B".repeat(43);

test("event writer direct path preserves frame identity and never stages healthy writes", () => {
  const socket = new ReferenceFakeSocket([true, true]);
  const firstEvent = {type: "online.position", accountId: "acc_a", presenceRevision: 1};
  const secondEvent = {type: "party.update", eventSeq: 2};
  const firstFrame = encodeEventFrame(firstEvent);
  const secondFrame = encodeEventFrame(secondEvent);
  const sent = [];
  const queuedChanges = [];
  const writer = createEventHubWriter(socket, {
    onFrameSent: (_bytes, event) => sent.push(event),
    onQueuedFramesChanged: (frames) => queuedChanges.push(frames),
  });

  assert.equal(writer.enqueuePreencoded(firstEvent, firstFrame, {coalesceKey: "acc_a"}), true);
  assert.equal(writer.enqueuePreencoded(secondEvent, secondFrame), true);
  assert.strictEqual(socket.writes[0], firstFrame);
  assert.strictEqual(socket.writes[1], secondFrame);
  assert.deepEqual(sent, [firstEvent, secondEvent]);
  assert.deepEqual(queuedChanges, []);
  assert.equal(writer.metrics().queuedFrames, 0);
  assert.equal(writer.metrics().applicationQueuedBytes, 0);
  assert.equal(writer.metrics().peakQueuedFrames, 0);

  writer.requestCloseAfterFlush();
  assert.equal(socket.ended, true);
});

test("event writer stops on write(false), keeps critical FIFO, and coalesces presence until drain", () => {
  const socket = new FakeSocket([false, true, true]);
  let coalesced = 0;
  let coalescedPrevious = null;
  const sent = [];
  const writer = createEventHubWriter(socket, {
    onPresenceCoalesced: (_key, previousEvent) => {
      coalesced += 1;
      coalescedPrevious = previousEvent;
    },
    onFrameSent: (_bytes, event) => sent.push(event),
  });

  assert.equal(writer.enqueue({type: "party.update", eventSeq: 1}), true);
  assert.equal(socket.writes.length, 1);
  assert.equal(writer.metrics().blocked, true);
  assert.equal(writer.enqueue({type: "online.position", accountId: "acc_a", presenceRevision: 1}, {coalesceKey: "acc_a"}), true);
  assert.equal(writer.enqueue({type: "online.position", accountId: "acc_a", presenceRevision: 2}, {coalesceKey: "acc_a"}), true);
  assert.equal(writer.enqueue({type: "battle.invite", eventSeq: 2}), true);
  assert.equal(writer.metrics().queuedFrames, 2);
  assert.equal(coalesced, 1);
  assert.equal(coalescedPrevious.presenceRevision, 1);

  socket.drain();

  assert.equal(writer.metrics().blocked, false);
  assert.equal(writer.metrics().queuedFrames, 0);
  assert.deepEqual(sent.map((event) => event.type), ["party.update", "online.position", "battle.invite"]);
  assert.equal(sent[1].presenceRevision, 2);
  writer.dispose();
});

test("trusted preencoded writer frames preserve bytes, FIFO, coalescing, budgets, and Buffer identity", () => {
  const events = [
    {type: "transport.block"},
    {type: "online.position", accountId: "acc_a", presenceRevision: 1},
    {type: "online.position", accountId: "acc_a", presenceRevision: 2},
    {type: "battle.invite", eventSeq: 2},
  ];
  const frames = events.map(encodeEventFrame);
  const controlSocket = new ReferenceFakeSocket([false, true, true]);
  const preencodedSocket = new ReferenceFakeSocket([false, true, true]);
  const controlSent = [];
  const preencodedSent = [];
  let controlCoalesced = 0;
  let preencodedCoalesced = 0;
  const control = createEventHubWriter(controlSocket, {
    onFrameSent: (_bytes, event) => controlSent.push(event),
    onPresenceCoalesced: () => { controlCoalesced += 1; },
  });
  const preencoded = createEventHubWriter(preencodedSocket, {
    onFrameSent: (_bytes, event) => preencodedSent.push(event),
    onPresenceCoalesced: () => { preencodedCoalesced += 1; },
  });

  assert.equal(control.enqueue(events[0]), true);
  assert.equal(preencoded.enqueuePreencoded(events[0], frames[0]), true);
  for (const [index, coalesceKey] of [[1, "acc_a"], [2, "acc_a"], [3, ""]]) {
    assert.equal(control.enqueue(events[index], {coalesceKey}), true);
    assert.equal(preencoded.enqueuePreencoded(events[index], frames[index], {coalesceKey}), true);
  }
  assert.deepEqual(
    pickWriterQueueMetrics(preencoded.metrics()),
    pickWriterQueueMetrics(control.metrics()),
  );
  assert.equal(controlCoalesced, 1);
  assert.equal(preencodedCoalesced, 1);

  controlSocket.drain();
  preencodedSocket.drain();
  assert.deepEqual(preencodedSocket.writes, controlSocket.writes);
  assert.deepEqual(preencodedSent, controlSent);
  assert.deepEqual(preencodedSent.map((event) => event.presenceRevision || event.type), [
    "transport.block",
    2,
    "battle.invite",
  ]);
  assert.strictEqual(preencodedSocket.writes[0], frames[0]);
  assert.strictEqual(preencodedSocket.writes[1], frames[2]);
  assert.strictEqual(preencodedSocket.writes[2], frames[3]);
  control.dispose();
  preencoded.dispose();

  const controlPressureSocket = new ReferenceFakeSocket([false]);
  const preencodedPressureSocket = new ReferenceFakeSocket([false]);
  let controlReason = "";
  let preencodedReason = "";
  const pressureOptions = {
    maxQueuedFrames: 1,
    maxQueuedBytes: frames[3].length,
  };
  const controlPressure = createEventHubWriter(controlPressureSocket, {
    ...pressureOptions,
    onSlowConsumer: (reason) => { controlReason = reason; },
  });
  const preencodedPressure = createEventHubWriter(preencodedPressureSocket, {
    ...pressureOptions,
    onSlowConsumer: (reason) => { preencodedReason = reason; },
  });
  assert.equal(controlPressure.enqueue(events[0]), true);
  assert.equal(preencodedPressure.enqueuePreencoded(events[0], frames[0]), true);
  assert.equal(controlPressure.enqueue(events[3]), true);
  assert.equal(preencodedPressure.enqueuePreencoded(events[3], frames[3]), true);
  assert.equal(controlPressure.enqueue({type: "overflow"}), false);
  assert.equal(preencodedPressure.enqueuePreencoded(
    {type: "overflow"},
    encodeEventFrame({type: "overflow"}),
  ), false);
  assert.equal(controlReason, "outbound_frames_exceeded");
  assert.equal(preencodedReason, controlReason);
  assert.equal(controlPressureSocket.destroyed, true);
  assert.equal(preencodedPressureSocket.destroyed, true);
});

test("event writer metrics include bytes already buffered by the raw socket", () => {
  const socket = new FakeSocket();
  socket.writableLength = 1024;
  const writer = createEventHubWriter(socket);
  assert.equal(writer.metrics().queuedBytes, 1024);
  assert.equal(writer.metrics().bufferedBytes, 1024);
  assert.equal(writer.metrics().applicationQueuedBytes, 0);
  writer.dispose();
});

test("event writer production defaults are 128 frames, 256 KiB, and two seconds", () => {
  assert.deepEqual(DEFAULT_EVENT_HUB_WRITER_LIMITS, {
    maxQueuedFrames: 128,
    maxQueuedBytes: 256 * 1024,
    backpressureTimeoutMs: 2000,
  });

  const frameSocket = new FakeSocket([false]);
  let frameReason = "";
  const frameWriter = createEventHubWriter(frameSocket, {
    onSlowConsumer: (reason) => { frameReason = reason; },
  });
  assert.equal(frameWriter.enqueue({type: "transport.block"}), true);
  for (let index = 0; index < 128; index += 1) {
    assert.equal(frameWriter.enqueue({type: "party.update", index}), true);
  }
  assert.equal(frameWriter.metrics().queuedFrames, 128);
  assert.equal(frameWriter.metrics().peakQueuedFrames, 128);
  assert.equal(frameWriter.enqueue({type: "party.update", index: 128}), false);
  assert.equal(frameSocket.destroyed, true);
  assert.equal(frameReason, "outbound_frames_exceeded");

  const byteSocket = new FakeSocket([false]);
  let byteReason = "";
  const byteWriter = createEventHubWriter(byteSocket, {
    onSlowConsumer: (reason) => { byteReason = reason; },
  });
  assert.equal(byteWriter.enqueue({type: "transport.block"}), true);
  const exactBudgetEvent = eventWithEncodedSize(DEFAULT_EVENT_HUB_WRITER_LIMITS.maxQueuedBytes);
  assert.equal(encodedEventBytes(exactBudgetEvent), 256 * 1024);
  assert.equal(byteWriter.enqueue(exactBudgetEvent), true);
  assert.equal(byteWriter.metrics().queuedBytes, 256 * 1024);
  assert.equal(byteWriter.enqueue({type: "one-byte-too-many"}), false);
  assert.equal(byteSocket.destroyed, true);
  assert.equal(byteReason, "outbound_bytes_exceeded");
});

test("event writer preserves cross-kind chronology while moving a coalesced presence update to its latest position", () => {
  const socket = new FakeSocket([false, true, true, true]);
  const sent = [];
  const writer = createEventHubWriter(socket, {onFrameSent: (_bytes, event) => sent.push(event)});
  writer.enqueue({type: "transport.block"});
  writer.enqueue({type: "online.position", change: "upsert", accountId: "remote", presenceRevision: 1}, {coalesceKey: "remote"});
  writer.enqueue({type: "online.position", change: "rebase", accountId: "self", presenceRevision: 1});
  socket.drain();
  assert.deepEqual(sent.map((event) => `${event.type}:${event.change || "block"}`), [
    "transport.block:block",
    "online.position:upsert",
    "online.position:rebase",
  ]);
  writer.dispose();

  const secondSocket = new FakeSocket([false, true, true]);
  const secondSent = [];
  const secondWriter = createEventHubWriter(secondSocket, {onFrameSent: (_bytes, event) => secondSent.push(event)});
  secondWriter.enqueue({type: "transport.block"});
  secondWriter.enqueue({type: "online.position", change: "upsert", accountId: "remote", presenceRevision: 1}, {coalesceKey: "remote"});
  secondWriter.enqueue({type: "online.position", change: "rebase", accountId: "self", presenceRevision: 1});
  secondWriter.enqueue({type: "online.position", change: "remove", accountId: "remote", presenceRevision: 2}, {coalesceKey: "remote"});
  secondSocket.drain();
  assert.deepEqual(secondSent.map((event) => `${event.type}:${event.change || "block"}`), [
    "transport.block:block",
    "online.position:rebase",
    "online.position:remove",
  ]);
  secondWriter.dispose();
});

test("event writer disconnects a blocked consumer on frame budget and timeout", async (t) => {
  await t.test("frame budget", () => {
    const socket = new FakeSocket([false]);
    let slowReason = "";
    const writer = createEventHubWriter(socket, {
      maxQueuedFrames: 2,
      maxQueuedBytes: 64 * 1024,
      backpressureTimeoutMs: 1000,
      onSlowConsumer: (reason) => { slowReason = reason; },
    });
    writer.enqueue({type: "party.update", eventSeq: 1});
    writer.enqueue({type: "party.update", eventSeq: 2});
    writer.enqueue({type: "party.update", eventSeq: 3});
    assert.equal(socket.destroyed, false);
    writer.enqueue({type: "party.update", eventSeq: 4});
    assert.equal(socket.destroyed, true);
    assert.equal(slowReason, "outbound_frames_exceeded");
  });

  await t.test("backpressure timeout", async () => {
    const socket = new FakeSocket([false]);
    let slowReason = "";
    const writer = createEventHubWriter(socket, {
      backpressureTimeoutMs: 20,
      onSlowConsumer: (reason) => { slowReason = reason; },
    });
    writer.enqueue({type: "party.update", eventSeq: 1});
    await delay(35);
    assert.equal(socket.destroyed, true);
    assert.equal(slowReason, "outbound_backpressure_timeout");
  });

  await t.test("replacement waits for drain or timeout and rejects later events", async () => {
    const socket = new FakeSocket([false]);
    const writer = createEventHubWriter(socket, {backpressureTimeoutMs: 20});
    writer.enqueue({type: "session.replaced", eventSeq: 1});
    writer.requestCloseAfterFlush();
    assert.equal(socket.ended, false);
    assert.equal(writer.enqueue({type: "party.update", eventSeq: 2}), false);
    await delay(35);
    assert.equal(socket.destroyed, true);
    assert.equal(socket.ended, false);
  });
});

test("subscription index routes targeted and AOI position candidates without scanning unrelated maps", () => {
  const index = createEventSubscriptionIndex();
  const near = {accountId: "acc_near", sessionId: "sess_near"};
  const actor = {accountId: "acc_actor", sessionId: "sess_actor"};
  const far = {accountId: "acc_far", sessionId: "sess_far"};
  const unanchored = {accountId: "acc_unanchored", sessionId: "sess_unanchored"};
  const clients = new Set([near, actor, far, unanchored]);
  for (const client of clients) index.register(client);
  index.update(near, {scope: "aoi", mapId: "map_a", cellX: 10, cellY: 10, radius: 18});
  index.update(actor, {scope: "aoi", mapId: "map_a", cellX: 12, cellY: 10, radius: 18});
  index.update(far, {scope: "aoi", mapId: "map_b", cellX: 10, cellY: 10, radius: 18});
  index.update(unanchored, {scope: "none"});

  const position = {
    type: "online.position",
    accountId: "acc_actor",
    previousPosition: {mapId: "map_a", cellX: 12, cellY: 10},
    position: {mapId: "map_a", cellX: 13, cellY: 10},
  };
  assert.deepEqual(new Set(index.candidates(position, clients)), new Set([near, actor]));
  assert.equal(index.positionEventMayBeVisible(near, position), true);
  assert.equal(index.positionEventMayBeVisible(far, position), false);
  assert.equal(index.positionEventMayBeVisible(unanchored, position), false);
  assert.deepEqual(
    new Set(index.candidates({type: "party.update", targetAccountIds: ["acc_far"]}, clients)),
    new Set([far]),
  );
  assert.deepEqual(
    new Set(index.candidates({type: "session.replaced", targetSessionIds: ["sess_actor"]}, clients)),
    new Set([actor]),
  );
  assert.deepEqual(
    new Set(index.candidates({type: "party.update", targetAccountIds: ["acc_unanchored"]}, clients)),
    new Set([unanchored]),
  );
});

test("subscription visibility checks previous/current positions and map/AOI scopes without changing semantics", () => {
  const index = createEventSubscriptionIndex();
  const client = {accountId: "acc_viewer", sessionId: "sess_viewer"};
  index.register(client);
  index.update(client, {scope: "aoi", mapId: "map_a", cellX: 10, cellY: 10, radius: 2});

  assert.equal(index.positionEventMayBeVisible(client, {
    type: "online.position",
    accountId: "acc_remote",
    previousPosition: {mapId: "map_a", cellX: 10, cellY: 10},
    position: {mapId: "map_a", cellX: 30, cellY: 30},
  }), true, "leaving the AOI remains visible through previousPosition");
  assert.equal(index.positionEventMayBeVisible(client, {
    type: "online.position",
    accountId: "acc_remote",
    previousPosition: {mapId: "map_a", cellX: 30, cellY: 30},
    position: {mapId: "map_a", cellX: "11", cellY: "9"},
  }), true, "entering the AOI remains visible through current position");
  assert.equal(index.positionEventMayBeVisible(client, {
    type: "online.position",
    accountId: "acc_remote",
    previousPosition: {mapId: "map_a", cellX: 30, cellY: 30},
    position: {mapId: "map_b", cellX: 10, cellY: 10},
  }), false);

  index.update(client, {scope: "map", mapId: "map_a"});
  assert.equal(index.positionEventMayBeVisible(client, {
    type: "online.position",
    accountId: "acc_remote",
    previousPosition: null,
    position: {mapId: "map_a", precision: "map"},
  }), true, "map scope does not require cell coordinates");
  assert.equal(index.positionEventMayBeVisible(client, {
    type: "online.position",
    accountId: "acc_remote",
    position: {mapId: "map_b", precision: "map"},
  }), false);

  index.update(client, {scope: "aoi", mapId: "map_a", cellX: 10, cellY: 10, radius: 2});
  assert.equal(index.positionEventMayBeVisible(client, {
    type: "online.position",
    accountId: "acc_remote",
    position: {mapId: "map_a", precision: "map"},
  }), false, "AOI scope still requires cell precision");
  index.update(client, {scope: "none"});
  assert.equal(index.positionEventMayBeVisible(client, {
    type: "online.position",
    accountId: "acc_remote",
    position: {mapId: "map_a", cellX: 10, cellY: 10},
  }), false);
});

test("event projection identity reuses a frozen subscription and invalidates exactly on AOI replacement", async () => {
  const replacementAoi = aoi("map_b", 30, 40, 12);
  const service = createFakeEventService({
    sessions: {token_a: identity("acc_a", "sess_a", "a")},
    aoiByToken: {token_a: aoi("map_a", 10, 10)},
    projectEvent(connection, event, projected) {
      if (event.type === "online.position" && connection.accountId === event.accountId) {
        return {...projected, change: "rebase", aoi: replacementAoi};
      }
      return projected;
    },
  });
  const hub = createTestEventHub(service);
  const socket = new ReferenceFakeSocket();
  await openFakeConnection(hub, "token_a", socket);
  service.eventConnectionIdentities.length = 0;

  service.emit({type: "party.update", revision: 1});
  service.emit({type: "party.update", revision: 2});
  service.emit(positionSourceEvent("acc_a", 1, "a"));
  await nextImmediate();
  service.emit({type: "party.update", revision: 3});
  service.emit({type: "party.update", revision: 4});

  const [first, second, selfRebase, afterRebase, afterRebaseAgain] = service.eventConnectionIdentities;
  assert.equal(service.eventConnectionIdentities.length, 5);
  assert.strictEqual(first, second);
  assert.strictEqual(second, selfRebase, "the self rebase is projected against the prior subscription");
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.aoi), true);
  assert.equal(first.aoi.mapId, "map_a");
  assert.notStrictEqual(afterRebase, selfRebase, "a replacement subscription invalidates the cached identity");
  assert.strictEqual(afterRebase, afterRebaseAgain);
  assert.equal(Object.isFrozen(afterRebase), true);
  assert.equal(Object.isFrozen(afterRebase.aoi), true);
  assert.equal(afterRebase.aoi.mapId, "map_b");
  replacementAoi.mapId = "map_mutated_after_projection";
  assert.equal(afterRebase.aoi.mapId, "map_b", "the normalized frozen subscription does not alias the projection payload");
  await hub.close();
});

test("production websocket handshake requires strict RFC headers, an allowed Origin, and Authorization bearer", async (t) => {
  const service = createFakeEventService({
    sessions: { [PRODUCTION_TOKEN_A]: identity("acc_prod", "sess_prod", "prod") },
  });
  const hub = createEventHub(service, {
    eventStreamEpoch: TEST_EVENT_STREAM_EPOCH,
    allowedOrigins: ["https://game.example"],
  });
  t.after(() => hub.close());
  const accepted = new FakeSocket();
  await hub.handleUpgrade(productionUpgradeRequest(PRODUCTION_TOKEN_A, accepted, {
    headers: {origin: "https://game.example"},
  }), accepted);
  assert.match(String(accepted.writes[0]), /^HTTP\/1\.1 101 /);
  assert.deepEqual(accepted.keepAlive, {enabled: true, initialDelay: 30_000});
  assert.equal(hub.clientCount(), 1);

  const queryToken = new FakeSocket();
  await hub.handleUpgrade(productionUpgradeRequest(PRODUCTION_TOKEN_A, queryToken, {
    url: `/events?clientVersion=test&clientProtocolVersion=${PROTOCOL_VERSION}&token=${PRODUCTION_TOKEN_A}`,
    headers: {origin: "https://game.example"},
  }), queryToken);
  assert.match(httpResponse(queryToken), /^HTTP\/1\.1 400 /);
  assert.match(httpResponse(queryToken), /\r\nCache-Control: no-store\r\n/i);
  assert.match(httpResponse(queryToken), /\r\nX-Content-Type-Options: nosniff\r\n/i);

  const testProtocolWithoutOptIn = new FakeSocket();
  await hub.handleUpgrade(testSubprotocolRequest("fake_test_token", testProtocolWithoutOptIn), testProtocolWithoutOptIn);
  assert.match(httpResponse(testProtocolWithoutOptIn), /^HTTP\/1\.1 401 /);
  assert.equal(service.eventSessionCalls, 1);
  assert.deepEqual(hub.metrics().upgradeRejectReasons, {
    ws_authorization_required: 1,
    ws_query_token_forbidden: 1,
  });
  await hub.close();
});

test("malformed upgrade metadata is rejected before session authorization", async (t) => {
  const cases = [
    [{method: "POST"}, 400, "ws_method_invalid"],
    [{headers: {connection: "keep-alive"}}, 400, "ws_connection_header_invalid"],
    [{headers: {upgrade: "h2c"}}, 400, "ws_upgrade_header_invalid"],
    [{headers: {"sec-websocket-version": "12"}}, 426, "ws_version_invalid"],
    [{headers: {"sec-websocket-key": "x"}}, 400, "ws_key_invalid"],
    [{headers: {origin: "https://evil.example"}}, 403, "ws_origin_denied"],
    [{headers: {authorization: ""}}, 401, "ws_authorization_required"],
    [{headers: {authorization: "Bearer too-short"}}, 401, "ws_authorization_invalid"],
    [{headers: {"sec-websocket-protocol": `${TEST_AUTH_SUBPROTOCOL}, fake`}}, 400, "ws_auth_ambiguous"],
    [{url: `https://example.test/events?clientVersion=test&clientProtocolVersion=${PROTOCOL_VERSION}`}, 400, "ws_request_target_invalid"],
    [{url: "/events?clientVersion=test"}, 426, "ws_protocol_version_mismatch"],
    [{url: `/events?clientVersion=test&clientProtocolVersion=${PROTOCOL_VERSION}&bad=%ZZ`}, 400, "ws_request_target_invalid"],
    [{url: `/events?clientVersion=test&clientProtocolVersion=${PROTOCOL_VERSION}#fragment`}, 400, "ws_request_target_invalid"],
    [{url: `/${"x".repeat(2050)}`}, 400, "ws_request_target_invalid"],
  ];
  for (const [overrides, status, reason] of cases) {
    const service = createFakeEventService({
      sessions: { [PRODUCTION_TOKEN_A]: identity("acc_prod", "sess_prod", "prod") },
    });
    const hub = createEventHub(service, {eventStreamEpoch: TEST_EVENT_STREAM_EPOCH});
    t.after(() => hub.close());
    const socket = new FakeSocket();
    await hub.handleUpgrade(productionUpgradeRequest(PRODUCTION_TOKEN_A, socket, overrides), socket);
    assert.match(httpResponse(socket), new RegExp(`^HTTP/1\\.1 ${status} `), reason);
    assert.match(httpResponse(socket), /\r\nCache-Control: no-store\r\n/i, reason);
    assert.match(httpResponse(socket), /\r\nX-Content-Type-Options: nosniff\r\n/i, reason);
    if (status === 426) {
      assert.match(httpResponse(socket), /\r\nSec-WebSocket-Version: 13\r\n/i, reason);
    }
    assert.equal(service.eventSessionCalls, 0, reason);
    assert.equal(hub.metrics().upgradeRejectReasons[reason], 1, reason);
    await hub.close();
  }
});

test("pending and established websocket admission are bounded and released on disconnect", async () => {
  await testAdmissionLimit("global", {maxConnections: 1}, "ws_connection_capacity_full", 503);
  await testAdmissionLimit("ip", {maxConnectionsPerIp: 1}, "ws_connection_ip_full", 429);
  await testAdmissionLimit("token", {
    maxConnectionsPerAccount: 10,
    maxConnectionsPerSession: 10,
    maxConnectionsPerToken: 1,
  }, "ws_connection_token_full", 429, {sameToken: true});
  await testAdmissionLimit("account", {
    maxConnectionsPerAccount: 1,
    maxConnectionsPerSession: 10,
    maxConnectionsPerToken: 10,
  }, "ws_connection_account_full", 429, {sameAccount: true});
  await testAdmissionLimit("session", {
    maxConnectionsPerAccount: 10,
    maxConnectionsPerSession: 1,
    maxConnectionsPerToken: 10,
  }, "ws_connection_session_full", 429, {sameSession: true});
  await testPendingAdmissionLimit(
    {maxPendingUpgrades: 1, maxPendingUpgradesPerIp: 10},
    "ws_pending_capacity_full",
    503,
  );
  await testPendingAdmissionLimit(
    {maxPendingUpgrades: 10, maxPendingUpgradesPerIp: 1},
    "ws_pending_ip_full",
    429,
  );
  await testHandshakeDisconnectRelease();
});

test("websocket upgrade rate limits run before auth by IP and after auth by account", async (t) => {
  const sessions = {
    [PRODUCTION_TOKEN_A]: identity("acc_rate", "sess_rate_a", "rate-a"),
    [PRODUCTION_TOKEN_B]: identity("acc_rate", "sess_rate_b", "rate-b"),
  };
  const ipService = createFakeEventService({sessions});
  const ipHub = createEventHub(ipService, {
    eventStreamEpoch: TEST_EVENT_STREAM_EPOCH,
    upgradeIpCapacity: 1,
  });
  t.after(() => ipHub.close());
  const firstIpSocket = new FakeSocket();
  await ipHub.handleUpgrade(productionUpgradeRequest(PRODUCTION_TOKEN_A, firstIpSocket), firstIpSocket);
  firstIpSocket.destroy();
  const blockedIpSocket = new FakeSocket();
  await ipHub.handleUpgrade(productionUpgradeRequest(PRODUCTION_TOKEN_B, blockedIpSocket), blockedIpSocket);
  assert.match(httpResponse(blockedIpSocket), /^HTTP\/1\.1 429 /);
  assert.match(httpResponse(blockedIpSocket), /\r\nRetry-After: 60\r\n/);
  assert.equal(ipService.eventSessionCalls, 1);
  assert.equal(ipHub.metrics().upgradeRejectReasons.ws_upgrade_ip_rate_limited, 1);
  assertAdmissionCleared(ipHub.metrics(), "IP rate rejection leaves no admission");
  await ipHub.close();

  const accountService = createFakeEventService({sessions});
  const accountHub = createEventHub(accountService, {
    eventStreamEpoch: TEST_EVENT_STREAM_EPOCH,
    upgradeAccountCapacity: 1,
    maxConnectionsPerAccount: 10,
  });
  t.after(() => accountHub.close());
  const firstAccountSocket = new FakeSocket();
  await accountHub.handleUpgrade(
    productionUpgradeRequest(PRODUCTION_TOKEN_A, firstAccountSocket),
    firstAccountSocket,
  );
  firstAccountSocket.destroy();
  const blockedAccountSocket = new FakeSocket();
  await accountHub.handleUpgrade(
    productionUpgradeRequest(PRODUCTION_TOKEN_B, blockedAccountSocket),
    blockedAccountSocket,
  );
  assert.match(httpResponse(blockedAccountSocket), /^HTTP\/1\.1 429 /);
  assert.match(httpResponse(blockedAccountSocket), /\r\nRetry-After: 60\r\n/);
  assert.equal(accountService.eventSessionCalls, 2);
  assert.equal(accountHub.metrics().upgradeRejectReasons.ws_upgrade_account_rate_limited, 1);
  assertAdmissionCleared(accountHub.metrics(), "account rate rejection leaves no admission");
  await accountHub.close();
});

test("websocket authentication deadline rejects and releases pending capacity", async (t) => {
  const service = createFakeEventService({
    sessions: {[PRODUCTION_TOKEN_A]: identity("acc_timeout", "sess_timeout", "timeout")},
    getEventSession() {
      return delay(100).then(() => ({
        ok: true,
        ...identity("acc_timeout", "sess_timeout", "timeout"),
      }));
    },
  });
  const hub = createEventHub(service, {
    eventStreamEpoch: TEST_EVENT_STREAM_EPOCH,
    handshakeTimeoutMs: 10,
  });
  t.after(() => hub.close());
  const socket = new FakeSocket();
  await hub.handleUpgrade(productionUpgradeRequest(PRODUCTION_TOKEN_A, socket), socket);
  assert.match(httpResponse(socket), /^HTTP\/1\.1 503 /);
  assert.match(httpResponse(socket), /\r\nRetry-After: 1\r\n/);
  assert.equal(hub.metrics().upgradeRejectReasons.ws_handshake_timeout, 1);
  assertAdmissionCleared(hub.metrics(), "authentication timeout releases admission");
  await hub.close();
});

test("websocket handshake uses one total deadline across auth, replay, and catchup", async (t) => {
  const connection = identity("acc_total_timeout", "sess_total_timeout", "total-timeout");
  const replayCatalog = {
    ok: true,
    events: [],
    earliestEventSeq: 1,
    latestEventSeq: 0,
  };
  const service = createFakeEventService({
    sessions: {[PRODUCTION_TOKEN_A]: connection},
    getEventSession() {
      return delay(15).then(() => ({ok: true, ...connection}));
    },
    replayResult() {
      return delay(15).then(() => replayCatalog);
    },
  });
  const hub = createEventHub(service, {
    eventStreamEpoch: TEST_EVENT_STREAM_EPOCH,
    handshakeTimeoutMs: 38,
  });
  t.after(() => hub.close());
  const socket = new FakeSocket();
  const startedAt = performance.now();
  await hub.handleUpgrade(productionUpgradeRequest(PRODUCTION_TOKEN_A, socket), socket);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(socket.destroyed, true, "the upgraded socket is closed when the shared deadline expires");
  assert.equal(service.replayCalls, 2, "timeout occurs in catchup instead of granting each phase a new budget");
  assert.equal(service.eventConnectionCalls.length, 0);
  assert.equal(elapsedMs < 65, true, `total handshake exceeded one bounded deadline: ${elapsedMs}ms`);
  assertAdmissionCleared(hub.metrics(), "total handshake timeout releases admission");
  await hub.close();
});

test("disconnect during replay catchup cannot resurrect a dead event session", async (t) => {
  const connection = identity("acc_catchup_disconnect", "sess_catchup_disconnect", "catchup-disconnect");
  let resolveCatchup = null;
  const service = createFakeEventService({
    sessions: {token_catchup_disconnect: connection},
    replayResult(_token, _payload, call) {
      if (call === 1) {
        return {ok: true, events: [], earliestEventSeq: 1, latestEventSeq: 0};
      }
      return new Promise((resolve) => { resolveCatchup = resolve; });
    },
  });
  const hub = createTestEventHub(service);
  t.after(() => hub.close());
  const socket = new FakeSocket();
  const upgrade = openFakeConnection(hub, "token_catchup_disconnect", socket);
  await waitUntil(() => service.replayCalls === 2 && typeof resolveCatchup === "function", 200);

  socket.destroy();
  resolveCatchup({ok: true, events: [], earliestEventSeq: 1, latestEventSeq: 0});
  await upgrade;

  assert.equal(hub.clientCount(), 0);
  assert.deepEqual(service.eventConnectionCalls, [], "a cleaned client must not be marked connected later");
  assertAdmissionCleared(hub.metrics(), "catchup disconnect releases admission and indexes");
  await hub.close();
});

test("event hub applies parser close codes, head processing, and inbound frame-rate isolation", async (t) => {
  const cases = [
    [Buffer.from([0x89, 0x00]), 1002, "protocolViolations"],
    [clientFrame(0x9, Buffer.alloc(0), {fin: false}), 1002, "protocolViolations"],
    [clientFrame(0x9, Buffer.alloc(0), {reservedBits: 0x40}), 1002, "protocolViolations"],
    [clientFrame(0x1, Buffer.from("text")), 1003, "protocolViolations"],
    [clientFrame(0x2, Buffer.from("binary")), 1003, "protocolViolations"],
    [Buffer.alloc((32 * 1024) + 1), 1009, "oversizedInboundFrames"],
  ];
  for (const [input, expectedCode, metric] of cases) {
    const service = createFakeEventService({sessions: {token_a: identity("acc_a", "sess_a", "a")}});
    const hub = createTestEventHub(service);
    t.after(() => hub.close());
    const socket = new FakeSocket();
    await openFakeConnection(hub, "token_a", socket);
    socket.clearWrites();
    socket.emit("data", input);
    assert.equal(serverCloseCode(socket), expectedCode);
    assert.equal(hub.clientCount(), 0);
    assert.equal(hub.metrics()[metric], 1);
    assert.equal(socket.destroyed, false);
    await waitUntil(() => socket.destroyed, 200);
    await hub.close();
  }

  const headService = createFakeEventService({sessions: {token_head: identity("acc_head", "sess_head", "head")}});
  const headHub = createTestEventHub(headService);
  t.after(() => headHub.close());
  const headSocket = new FakeSocket();
  await openFakeConnection(headHub, "token_head", headSocket, {
    head: clientFrame(0x9, Buffer.from("upgrade-head")),
  });
  const pong = serverFrames(headSocket).find((frame) => frame.opcode === 0xA);
  assert.equal(pong.payload.toString("utf8"), "upgrade-head");
  await headHub.close();

  const closeService = createFakeEventService({sessions: {token_close: identity("acc_close", "sess_close", "close")}});
  const closeHub = createTestEventHub(closeService, {closeGraceMs: 5});
  t.after(() => closeHub.close());
  const closeSocket = new FakeSocket();
  await openFakeConnection(closeHub, "token_close", closeSocket);
  closeSocket.clearWrites();
  const closePayload = Buffer.alloc(2);
  closePayload.writeUInt16BE(1000, 0);
  closeSocket.emit("data", clientFrame(0x8, closePayload));
  assert.equal(serverCloseCode(closeSocket), 1000);
  assertAdmissionCleared(closeHub.metrics(), "valid close frame releases admission");
  await waitUntil(() => closeSocket.destroyed, 200);
  await closeHub.close();

  const floodService = createFakeEventService({sessions: {token_flood: identity("acc_flood", "sess_flood", "flood")}});
  const floodHub = createTestEventHub(floodService);
  t.after(() => floodHub.close());
  const floodSocket = new FakeSocket();
  await openFakeConnection(floodHub, "token_flood", floodSocket);
  floodSocket.clearWrites();
  floodSocket.emit("data", Buffer.concat(Array.from({length: 41}, () => clientFrame(0x9))));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(serverFrames(floodSocket).filter((frame) => frame.opcode === 0xA).length, 40);
  assert.equal(serverCloseCode(floodSocket), 1008);
  assert.equal(floodHub.metrics().inboundRateLimited, 1);
  await floodHub.close();
});

test("shared heartbeat accepts a matching pong and isolates a silent peer", async (t) => {
  const service = createFakeEventService({sessions: {token_heartbeat: identity("acc_heartbeat", "sess_heartbeat", "heartbeat")}});
  const hub = createTestEventHub(service, {
    heartbeatIntervalMs: 8,
    heartbeatDeadlineMs: 8,
    heartbeatSweepMs: 2,
    closeGraceMs: 5,
    randomBytes: (size) => Buffer.alloc(size, 0x5A),
  });
  t.after(() => hub.close());
  const socket = new FakeSocket();
  await openFakeConnection(hub, "token_heartbeat", socket);
  socket.clearWrites();
  await waitUntil(() => serverFrames(socket).some((frame) => frame.opcode === 0x9), 100);
  const firstPing = serverFrames(socket).find((frame) => frame.opcode === 0x9);
  socket.emit("data", clientFrame(0xA, firstPing.payload));
  socket.clearWrites();
  await waitUntil(() => serverFrames(socket).some((frame) => frame.opcode === 0x9), 100);
  await waitUntil(() => socket.destroyed, 100);
  assert.equal(serverCloseCode(socket), 1001);
  assert.equal(hub.metrics().heartbeatTimeouts, 1);
  await hub.close();

  const wrongService = createFakeEventService({sessions: {token_wrong: identity("acc_wrong", "sess_wrong", "wrong")}});
  const wrongHub = createTestEventHub(wrongService, {
    heartbeatIntervalMs: 8,
    heartbeatDeadlineMs: 8,
    heartbeatSweepMs: 2,
    closeGraceMs: 5,
    randomBytes: (size) => Buffer.alloc(size, 0x4B),
  });
  t.after(() => wrongHub.close());
  const wrongSocket = new FakeSocket();
  await openFakeConnection(wrongHub, "token_wrong", wrongSocket);
  wrongSocket.clearWrites();
  await waitUntil(() => serverFrames(wrongSocket).some((frame) => frame.opcode === 0x9), 200);
  const wrongPing = serverFrames(wrongSocket).find((frame) => frame.opcode === 0x9);
  wrongSocket.emit("data", clientFrame(0xA, Buffer.alloc(wrongPing.payload.length, 0x4C)));
  await waitUntil(() => wrongSocket.destroyed, 200);
  assert.equal(serverCloseCode(wrongSocket), 1001);
  assert.equal(wrongHub.metrics().heartbeatTimeouts, 1);
  await wrongHub.close();
});

test("fresh, replay, reset, and handshake-race cursor modes are explicit", async (t) => {
  const history = Array.from({length: 3}, (_, index) => ({
    type: "party.update",
    targetAccountIds: ["acc_cursor"],
    eventSeq: index + 1,
  }));
  const freshService = createFakeEventService({
    sessions: {token_cursor: identity("acc_cursor", "sess_cursor", "cursor")},
    replayEvents: history,
  });
  const freshHub = createTestEventHub(freshService);
  t.after(() => freshHub.close());
  const freshSocket = new FakeSocket();
  await openFakeConnection(freshHub, "token_cursor", freshSocket);
  assert.equal(jsonMessages(freshSocket).filter((event) => event.type === "party.update").length, 0);
  assert.equal(jsonMessages(freshSocket).find((event) => event.type === "events.ready").replayMode, "fresh");
  await freshHub.close();

  const replayHub = createTestEventHub(freshService);
  t.after(() => replayHub.close());
  const replaySocket = new FakeSocket();
  await openFakeConnection(replayHub, "token_cursor", replaySocket, {cursorPresent: true, lastEventSeq: 1});
  assert.deepEqual(
    jsonMessages(replaySocket).filter((event) => event.type === "party.update").map((event) => event.eventSeq),
    [2, 3],
  );
  assert.deepEqual(
    freshService.replayPayloads.slice(-2).map((payload) => payload.afterSeq),
    [1, 3],
    "normal reconnect should project only the requested gap and the handshake race tail",
  );
  await replayHub.close();

  const resetHub = createTestEventHub(freshService);
  t.after(() => resetHub.close());
  const resetSocket = new FakeSocket();
  await openFakeConnection(resetHub, "token_cursor", resetSocket, {cursorPresent: true, lastEventSeq: 99});
  assert.deepEqual(jsonMessages(resetSocket).slice(0, 3).map((event) => event.type), [
    "events.ready",
    "events.reset",
    "online.snapshot",
  ]);
  assert.equal(jsonMessages(resetSocket).find((event) => event.type === "events.reset").reason, "cursor_ahead");
  assert.equal(resetHub.metrics().cursorResets, 1);
  await resetHub.close();

  for (const [lastEventSeq, eventStreamEpoch, expectedReason] of [
    [8, TEST_EVENT_STREAM_EPOCH, "cursor_evicted"],
    [10, Buffer.alloc(16, 0x7A).toString("base64url"), "epoch_mismatch"],
  ]) {
    const service = createFakeEventService({
      sessions: {token_reset: identity("acc_reset", "sess_reset", "reset")},
      replayEvents: history.map((event) => ({...event, eventSeq: event.eventSeq + 9})),
      earliestEventSeq: 10,
      latestEventSeq: 12,
    });
    const hub = createTestEventHub(service);
    t.after(() => hub.close());
    const socket = new FakeSocket();
    await openFakeConnection(hub, "token_reset", socket, {
      cursorPresent: true,
      lastEventSeq,
      eventStreamEpoch,
    });
    assert.equal(jsonMessages(socket).find((event) => event.type === "events.reset").reason, expectedReason);
    assert.equal(jsonMessages(socket).filter((event) => event.type === "party.update").length, 0);
    await hub.close();
  }

  let raceService;
  raceService = createFakeEventService({
    sessions: {token_race: identity("acc_race", "sess_race", "race")},
    replayResult(_token, _payload, call) {
      if (call === 1) {
        return {ok: true, events: [{type: "party.update", eventSeq: 1}], earliestEventSeq: 1, latestEventSeq: 1};
      }
      raceService.emit({type: "party.update", eventSeq: 2});
      return {
        ok: true,
        events: [{type: "party.update", eventSeq: 1}, {type: "party.update", eventSeq: 2}],
        earliestEventSeq: 1,
        latestEventSeq: 2,
      };
    },
  });
  const raceHub = createTestEventHub(raceService);
  t.after(() => raceHub.close());
  const raceSocket = new FakeSocket();
  await openFakeConnection(raceHub, "token_race", raceSocket, {cursorPresent: true, lastEventSeq: 0});
  const raceMessages = jsonMessages(raceSocket);
  const raceSequences = raceMessages.filter((event) => event.type === "party.update").map((event) => event.eventSeq);
  assert.deepEqual(raceSequences, [1, 2]);
  assert.equal(new Set(raceSequences).size, raceSequences.length);
  assert.equal(raceMessages.find((event) => event.type === "events.ready").latestEventSeq, 1);
  await raceHub.close();
});

test("a real node:http upgrade accepts production Authorization and closes malformed raw frames", async (t) => {
  const service = createFakeEventService({
    sessions: { [PRODUCTION_TOKEN_A]: identity("acc_raw", "sess_raw", "raw") },
  });
  const hub = createEventHub(service, {eventStreamEpoch: TEST_EVENT_STREAM_EPOCH});
  const server = http.createServer();
  server.on("upgrade", (req, socket, head) => hub.handleUpgrade(req, socket, head));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await hub.close();
    await new Promise((resolve) => server.close(resolve));
  });
  const socket = net.connect(server.address().port, "127.0.0.1");
  await once(socket, "connect");
  socket.write(rawUpgradeRequest(PRODUCTION_TOKEN_A));
  let received = Buffer.alloc(0);
  socket.on("data", (chunk) => { received = Buffer.concat([received, chunk]); });
  await waitUntil(() => received.includes(Buffer.from("101 Switching Protocols")), 200);
  assert.equal(hub.clientCount(), 1);
  socket.write(Buffer.from([0x89, 0x00]));
  await waitUntil(() => socket.destroyed, 500);
  assert.equal(hub.clientCount(), 0);
  assert.equal(hub.metrics().protocolViolations, 1);
});

test("event hub uses pure event sessions and AOI/account indexes for live routing", async () => {
  const service = createFakeEventService({
    sessions: {
      token_a: identity("acc_a", "sess_a", "a"),
      token_b: identity("acc_b", "sess_b", "b"),
      token_c: identity("acc_c", "sess_c", "c"),
    },
    aoiByToken: {
      token_a: aoi("map_a", 10, 10),
      token_b: aoi("map_a", 12, 10),
      token_c: aoi("map_b", 200, 200),
    },
  });
  const hub = createTestEventHub(service);
  const sockets = {
    token_a: new FakeSocket(),
    token_b: new FakeSocket(),
    token_c: new FakeSocket(),
  };
  for (const [token, socket] of Object.entries(sockets)) {
    await openFakeConnection(hub, token, socket);
    socket.clearWrites();
  }

  service.emit({
    type: "online.position",
    accountId: "acc_b",
    previousPosition: {mapId: "map_a", cellX: 12, cellY: 10, hasCell: true},
    position: {mapId: "map_a", cellX: 13, cellY: 10, hasCell: true},
    player: {accountId: "acc_b", position: {mapId: "map_a", cellX: 13, cellY: 10}},
    presenceRevision: 2,
  });
  await nextImmediate();
  assert.deepEqual(jsonMessages(sockets.token_a).map((event) => event.type), ["online.position"]);
  assert.deepEqual(jsonMessages(sockets.token_b).map((event) => event.type), ["online.position"]);
  assert.deepEqual(jsonMessages(sockets.token_c), []);
  assert.equal(service.eventProjectionCalls, 2);

  service.eventProjectionCalls = 0;
  service.emit({type: "party.update", targetAccountIds: ["acc_c"], eventSeq: 4});
  assert.equal(jsonMessages(sockets.token_c).at(-1).type, "party.update");
  assert.equal(service.eventProjectionCalls, 1);
  assert.equal(service.durableCalls.length, 0);
  const metrics = hub.metrics();
  assert.equal(metrics.positionDrainMaxMs >= 0, true);
  assert.equal(metrics.synchronousPublishTurns >= 0, true);
  assert.equal(metrics.synchronousPublishMaxMs >= 0, true);
  assert.equal(typeof metrics.synchronousPublishMaxType, "string");
  assert.equal(metrics.synchronousPublishMaxCandidates >= 0, true);
  assert.deepEqual(metrics, {
    connections: 3,
    establishedConnections: 3,
    pendingUpgrades: 0,
    pendingIpKeys: 0,
    establishedIpKeys: 1,
    establishedAccountKeys: 3,
    establishedSessionKeys: 3,
    establishedTokenKeys: 3,
    peakPendingUpgrades: 1,
    acceptedUpgrades: 3,
    rejectedUpgrades: 0,
    upgradeRejectReasons: {},
    backpressureConnections: 0,
    queuedFrames: 0,
    queuedBytes: 0,
    combinedBufferedBytes: 0,
    maxClientCombinedBufferedBytes: 0,
    combinedQueuedFrames: 0,
    maxClientCombinedQueuedFrames: 0,
    peakQueuedFrames: hub.metrics().peakQueuedFrames,
    peakQueuedBytes: hub.metrics().peakQueuedBytes,
    maxClientQueuedFrames: hub.metrics().maxClientQueuedFrames,
    maxClientQueuedBytes: hub.metrics().maxClientQueuedBytes,
    sentFrames: 9,
    sentBytes: hub.metrics().sentBytes,
    encodedFrames: 3,
    encodedBytes: hub.metrics().encodedBytes,
    reusedFrames: 0,
    reusedBytes: 0,
    presenceCoalesced: 0,
    slowConsumerDisconnects: 0,
    inboundFrames: 0,
    inboundBytes: 0,
    inboundRateLimited: 0,
    protocolViolations: 0,
    oversizedInboundFrames: 0,
    heartbeatTimeouts: 0,
    cursorResets: 0,
    synchronousPublishTurns: 1,
    synchronousPublishMaxMs: metrics.synchronousPublishMaxMs,
    synchronousPublishMaxType: "party.update",
    synchronousPublishMaxCandidates: 1,
    pendingPositionEvents: 0,
    peakPendingPositionEvents: 1,
    positionEventsCoalesced: 0,
    positionDrainTurns: 1,
    positionDrainBudgetMs: 4,
    positionDrainMaxMs: metrics.positionDrainMaxMs,
    positionEventsPerTurn: 4,
    positionClientsPerTurn: 512,
    activePositionJob: 0,
    positionClientsProcessed: 2,
    pendingPositionBatchClients: 0,
    pendingPositionBatchDeltas: 0,
    positionBatchWindowMs: 0,
    positionBatchClientsPerTurn: 32,
    positionBatchBytesPerTurn: 512 * 1024,
    positionBatchFlushBudgetMs: 4,
    positionBatchFlushes: 0,
    positionBatchFlushMaxMs: 0,
    positionBatchFlushClientsMax: 0,
    positionBatchFlushGroupsMax: 0,
    positionBatchFrames: 0,
    positionBatchDeltas: 0,
    positionBatchBytes: 0,
    positionBatchEncodedFrames: 0,
    positionBatchEncodedDeltas: 0,
    positionBatchEncodedBytes: 0,
    positionBatchReusedFrames: 0,
    positionBatchReusedDeltas: 0,
    positionBatchReusedBytes: 0,
    currentPositionBatchBytes: 0,
    peakPositionBatchBytes: 0,
    peakClientCombinedBufferedBytes: 0,
    peakClientCombinedQueuedFrames: 0,
    eventTypes: hub.metrics().eventTypes,
  });
  await hub.close();
});

test("event hub bounds and coalesces untargeted source position bursts without reordering accounts", async () => {
  const service = createFakeEventService({
    sessions: {token_a: identity("acc_a", "sess_a", "a")},
    aoiByToken: {token_a: aoi("map_a", 10, 10)},
  });
  const hub = createTestEventHub(service);
  const socket = new FakeSocket();
  await openFakeConnection(hub, "token_a", socket);
  socket.clearWrites();

  service.emit({
    type: "online.position",
    accountId: "acc_mover",
    position: {mapId: "map_a", cellX: 11, cellY: 10},
    presenceRevision: 1,
  });
  service.emit({
    type: "online.position",
    accountId: "acc_mover",
    previousPosition: {mapId: "map_a", cellX: 11, cellY: 10},
    position: {mapId: "map_a", cellX: 12, cellY: 10},
    presenceRevision: 2,
  });
  service.emit({
    type: "online.position",
    accountId: "acc_other",
    previousPosition: null,
    position: {mapId: "map_a", cellX: 12, cellY: 11},
    presenceRevision: 1,
  });
  service.emit({
    type: "online.position",
    accountId: "acc_mover",
    previousPosition: {mapId: "map_a", cellX: 12, cellY: 10},
    position: {mapId: "map_a", cellX: 13, cellY: 10},
    presenceRevision: 3,
  });
  assert.equal(hub.metrics().pendingPositionEvents, 2);
  assert.equal(hub.metrics().positionEventsCoalesced, 2);

  service.emit({type: "party.update", targetAccountIds: ["acc_a"]});
  assert.deepEqual(jsonMessages(socket).map((event) => event.type), ["party.update"]);
  await nextImmediate();

  const positions = jsonMessages(socket).filter((event) => event.type === "online.position");
  assert.deepEqual(positions.map((event) => [event.accountId, event.presenceRevision]), [
    ["acc_mover", 3],
    ["acc_other", 1],
  ]);
  assert.equal(Object.hasOwn(positions[0], "previousPosition"), false);
  assert.equal(Object.hasOwn(positions[1], "previousPosition"), true);
  assert.equal(positions[1].previousPosition, null);
  assert.equal(hub.metrics().pendingPositionEvents, 0);
  assert.equal(hub.metrics().peakPendingPositionEvents, 2);
  assert.equal(hub.metrics().positionDrainTurns, 1);
  await hub.close();
});

test("targeted and sequenced position events bypass the deferred source queue", async () => {
  const service = createFakeEventService({
    sessions: {token_a: identity("acc_a", "sess_a", "a")},
    aoiByToken: {token_a: aoi("map_a", 10, 10)},
  });
  const hub = createTestEventHub(service);
  const socket = new FakeSocket();
  await openFakeConnection(hub, "token_a", socket);
  socket.clearWrites();

  service.emit({type: "online.position", accountId: "acc_pending", position: {mapId: "map_a", cellX: 11, cellY: 10}, presenceRevision: 1});
  service.emit({type: "online.position", accountId: "acc_targeted", position: {mapId: "map_a", cellX: 11, cellY: 10}, targetAccountIds: ["acc_a"], presenceRevision: 2});
  service.emit({type: "online.position", accountId: "acc_sequenced", position: {mapId: "map_a", cellX: 11, cellY: 10}, eventSeq: 7, presenceRevision: 3});

  assert.deepEqual(jsonMessages(socket).map((event) => event.accountId), ["acc_targeted", "acc_sequenced"]);
  assert.equal(hub.metrics().pendingPositionEvents, 1);
  await nextImmediate();
  assert.deepEqual(jsonMessages(socket).map((event) => event.accountId), [
    "acc_targeted",
    "acc_sequenced",
    "acc_pending",
  ]);
  await hub.close();
});

test("position draining honors the four-event turn cap, soft time budget, and hard backlog cap", async () => {
  const service = createFakeEventService({
    sessions: {token_a: identity("acc_a", "sess_a", "a")},
    aoiByToken: {token_a: aoi("map_a", 10, 10)},
  });
  const hub = createTestEventHub(service);
  const socket = new FakeSocket();
  await openFakeConnection(hub, "token_a", socket);
  socket.clearWrites();
  for (let index = 0; index < 9; index += 1) {
    service.emit({type: "online.position", accountId: `acc_${index}`, position: {mapId: "map_a", cellX: 10 + index, cellY: 10}, presenceRevision: 1});
  }
  await nextImmediate();
  assert.equal(jsonMessages(socket).length, 4);
  assert.equal(hub.metrics().pendingPositionEvents, 5);
  await nextImmediate();
  assert.equal(jsonMessages(socket).length, 8);
  await nextImmediate();
  assert.equal(jsonMessages(socket).length, 9);
  assert.equal(hub.metrics().positionDrainTurns, 3);
  await hub.close();

  const timedHub = createTestEventHub(service, {positionDrainBudgetMs: Number.EPSILON});
  const timedSocket = new FakeSocket();
  await openFakeConnection(timedHub, "token_a", timedSocket);
  timedSocket.clearWrites();
  for (let index = 0; index < 4; index += 1) {
    timedHub.publish({type: "online.position", accountId: `timed_${index}`, position: {mapId: "map_a", cellX: 10 + index, cellY: 10}, presenceRevision: 1});
  }
  await nextImmediate();
  assert.equal(jsonMessages(timedSocket).length, 1);
  assert.equal(timedHub.metrics().pendingPositionEvents, 3);
  await timedHub.close();

  const cappedHub = createTestEventHub(service, {maxPendingPositionEvents: 2});
  const cappedSocket = new FakeSocket();
  await openFakeConnection(cappedHub, "token_a", cappedSocket);
  cappedSocket.clearWrites();
  for (let index = 0; index < 3; index += 1) {
    cappedHub.publish({type: "online.position", accountId: `capped_${index}`, position: {mapId: "map_a", cellX: 10 + index, cellY: 10}, presenceRevision: 1});
  }
  assert.deepEqual(jsonMessages(cappedSocket).map((event) => event.accountId), [
    "capped_0",
    "capped_1",
    "capped_2",
  ]);
  assert.equal(cappedHub.metrics().pendingPositionEvents, 0);
  await cappedHub.close();
});

test("snapshot admission skips older deferred movement without a synchronous fanout storm", async () => {
  const firstSocket = new FakeSocket();
  let inspectSnapshotBoundary = false;
  let flushedBeforeSnapshot = false;
  const service = createFakeEventService({
    sessions: {
      token_a: identity("acc_a", "sess_a", "a"),
      token_b: identity("acc_b", "sess_b", "b"),
    },
    aoiByToken: {
      token_a: aoi("map_a", 10, 10),
      token_b: aoi("map_a", 10, 10),
    },
    listOnlinePlayers(token) {
      if (inspectSnapshotBoundary && token === "token_b") {
        flushedBeforeSnapshot = jsonMessages(firstSocket).some((event) => event.type === "online.position");
      }
      return {ok: true, players: [], party: null, aoi: aoi("map_a", 10, 10)};
    },
  });
  const hub = createTestEventHub(service);
  await openFakeConnection(hub, "token_a", firstSocket);
  firstSocket.clearWrites();
  service.emit({type: "online.position", accountId: "acc_mover", position: {mapId: "map_a", cellX: 11, cellY: 10}, presenceRevision: 4});

  inspectSnapshotBoundary = true;
  const joiningSocket = new FakeSocket();
  await openFakeConnection(hub, "token_b", joiningSocket);
  assert.equal(flushedBeforeSnapshot, false);
  assert.deepEqual(jsonMessages(joiningSocket).map((event) => event.type), [
    "events.ready",
    "online.snapshot",
  ]);
  assert.equal(hub.metrics().pendingPositionEvents, 1);
  await nextImmediate();
  assert.equal(jsonMessages(firstSocket).some((event) => event.type === "online.position"), true);
  assert.deepEqual(jsonMessages(joiningSocket).map((event) => event.type), [
    "events.ready",
    "online.snapshot",
  ]);
  assert.equal(hub.metrics().pendingPositionEvents, 0);
  await hub.close();
});

test("modern event sessions reject an asynchronous online snapshot contract", async () => {
  const service = createFakeEventService({
    sessions: {token_a: identity("acc_a", "sess_a", "a")},
    listOnlinePlayers() {
      return Promise.resolve({ok: true, players: [], party: null, aoi: {scope: "all"}});
    },
  });
  const hub = createTestEventHub(service);
  const socket = new FakeSocket();
  await openFakeConnection(hub, "token_a", socket);
  assert.equal(socket.destroyed, true);
  assert.equal(hub.clientCount(), 0);
  assert.equal(jsonMessages(socket).some((event) => event.type === "online.snapshot"), false);
  await hub.close();
});

test("one position job drains at most 64 clients per turn and keeps per-client event order", async () => {
  const sessions = {};
  const aoiByToken = {};
  const sockets = [];
  for (let index = 0; index < 130; index += 1) {
    const token = `token_${index}`;
    sessions[token] = identity(`acc_${index}`, `sess_${index}`, `user-${index}`);
    aoiByToken[token] = aoi("map_a", 10, 10);
  }
  const service = createFakeEventService({sessions, aoiByToken});
  const hub = createTestEventHub(service, {
    maxConnectionsPerIp: 200,
    upgradeIpCapacity: 200,
    positionClientsPerTurn: 64,
    positionDrainBudgetMs: 1000,
  });
  for (let index = 0; index < 130; index += 1) {
    const socket = new ReferenceFakeSocket();
    sockets.push(socket);
    await openFakeConnection(hub, `token_${index}`, socket);
    socket.clearWrites();
  }
  service.eventProjectionCalls = 0;
  const before = hub.metrics();
  service.emit({
    type: "online.position",
    accountId: "acc_mover",
    previousPosition: {mapId: "map_a", cellX: 9, cellY: 10},
    position: {mapId: "map_a", cellX: 10, cellY: 10},
    presenceRevision: 1,
  });
  await nextImmediate();
  assert.equal(sockets.filter((socket) => jsonMessages(socket).length === 1).length, 64);
  assert.equal(service.eventProjectionCalls, 64, "each processed client projects exactly once");
  assert.equal(hub.metrics().activePositionJob, 1);
  assert.equal(hub.metrics().pendingPositionEvents, 1);

  service.emit({
    type: "online.position",
    accountId: "acc_mover",
    previousPosition: {mapId: "map_a", cellX: 10, cellY: 10},
    position: {mapId: "map_a", cellX: 11, cellY: 10},
    presenceRevision: 2,
  });
  assert.equal(hub.metrics().pendingPositionEvents, 2, "active and later same-account jobs stay separate");
  for (let turn = 0; turn < 8 && hub.metrics().pendingPositionEvents > 0; turn += 1) {
    await nextImmediate();
  }
  assert.equal(hub.metrics().pendingPositionEvents, 0);
  for (const socket of sockets) {
    assert.deepEqual(
      jsonMessages(socket).map((event) => event.presenceRevision),
      [1, 2],
    );
  }
  assert.equal(service.eventProjectionCalls, 260, "two events project once for each of 130 clients");
  const after = hub.metrics();
  assert.equal(after.encodedFrames - before.encodedFrames, 2);
  assert.equal(after.reusedFrames - before.reusedFrames, 258);
  assert.equal(after.positionClientsProcessed - before.positionClientsProcessed, 260);
  await hub.close();
});

test("a pending removal survives socket cleanup and a merged self rebase updates its AOI", async () => {
  const sessions = {
    token_self: identity("acc_self", "sess_self", "self"),
    token_observer: identity("acc_observer", "sess_observer", "observer"),
  };
  const service = createFakeEventService({
    sessions,
    aoiByToken: {
      token_self: aoi("map_old", 10, 10),
      token_observer: {scope: "all"},
    },
    projectEvent(connection, event, projected) {
      if (connection.accountId === "acc_self" && event.accountId === "acc_self") {
        return {
          ...projected,
          change: "rebase",
          aoi: event.aoi,
          presenceRebase: {upserts: [], removedAccountIds: [], schemaVersion: 1},
        };
      }
      return projected;
    },
  });
  const hub = createTestEventHub(service);
  const selfSocket = new FakeSocket();
  const observerSocket = new FakeSocket();
  await openFakeConnection(hub, "token_self", selfSocket);
  await openFakeConnection(hub, "token_observer", observerSocket);
  selfSocket.clearWrites();
  observerSocket.clearWrites();

  const originalPosition = {mapId: "map_old", cellX: 10, cellY: 10};
  service.emit({type: "online.position", accountId: "acc_self", previousPosition: originalPosition, position: {mapId: "map_mid", cellX: 1, cellY: 1}, aoi: aoi("map_mid", 1, 1), presenceRevision: 1});
  service.emit({type: "online.position", accountId: "acc_self", previousPosition: {mapId: "map_mid", cellX: 1, cellY: 1}, position: {mapId: "map_new", cellX: 20, cellY: 20}, aoi: aoi("map_new", 20, 20), presenceRevision: 2});
  await nextImmediate();
  const selfRebase = jsonMessages(selfSocket).find((event) => event.accountId === "acc_self");
  assert.equal(selfRebase.change, "rebase");
  assert.deepEqual(selfRebase.previousPosition, originalPosition);
  assert.equal(selfRebase.position.mapId, "map_new");
  assert.equal(selfRebase.aoi.mapId, "map_new");

  selfSocket.clearWrites();
  service.emit({type: "online.position", accountId: "acc_remote_new", previousPosition: {mapId: "map_new", cellX: 21, cellY: 20}, position: {mapId: "map_new", cellX: 22, cellY: 20}, presenceRevision: 1});
  await nextImmediate();
  assert.equal(jsonMessages(selfSocket).some((event) => event.accountId === "acc_remote_new"), true);

  observerSocket.clearWrites();
  service.emit({type: "online.position", change: "remove", accountId: "acc_self", previousPosition: {mapId: "map_new", cellX: 20, cellY: 20}, position: null, presenceRevision: 3});
  selfSocket.destroy();
  assert.equal(hub.metrics().pendingPositionEvents, 1);
  await nextImmediate();
  assert.equal(jsonMessages(observerSocket).some((event) => event.accountId === "acc_self"), true);
  await hub.close();
});

test("event hub encodes one unchanged source frame per publish and reuses its exact Buffer", async () => {
  const service = createFakeEventService({
    sessions: {
      token_a: identity("acc_a", "sess_a", "a"),
      token_b: identity("acc_b", "sess_b", "b"),
      token_c: identity("acc_c", "sess_c", "c"),
    },
  });
  const hub = createTestEventHub(service);
  const sockets = [
    new ReferenceFakeSocket(),
    new ReferenceFakeSocket(),
    new ReferenceFakeSocket(),
  ];
  for (const [index, token] of ["token_a", "token_b", "token_c"].entries()) {
    await openFakeConnection(hub, token, sockets[index]);
    sockets[index].clearWrites();
  }
  const bootstrapMetrics = hub.metrics();
  assert.equal(bootstrapMetrics.encodedFrames, 0, "bootstrap frames are intentionally excluded");
  assert.equal(bootstrapMetrics.encodedBytes, 0, "bootstrap bytes are intentionally excluded");
  sockets[0].emit("data", clientFrame(0x9, Buffer.from("control")));
  const before = hub.metrics();
  assert.equal(before.sentFrames, bootstrapMetrics.sentFrames + 1);
  assert.equal(before.encodedFrames, 0, "control frames are intentionally excluded");
  assert.equal(before.encodedBytes, 0, "control bytes are intentionally excluded");
  assert.equal(before.reusedFrames, 0);
  assert.equal(before.reusedBytes, 0);
  sockets[0].clearWrites();

  const event = {type: "party.update", revision: 7, members: ["acc_a", "acc_b"]};
  const expectedFrame = encodeEventFrame(event);
  service.emit(event);

  assert.deepEqual(sockets.map((socket) => jsonMessages(socket)), [[event], [event], [event]]);
  assert.strictEqual(sockets[0].writes[0], sockets[1].writes[0]);
  assert.strictEqual(sockets[1].writes[0], sockets[2].writes[0]);
  assert.deepEqual(sockets[0].writes[0], expectedFrame);
  const after = hub.metrics();
  assert.equal(after.encodedFrames - before.encodedFrames, 1);
  assert.equal(after.encodedBytes - before.encodedBytes, expectedFrame.length);
  assert.equal(after.reusedFrames - before.reusedFrames, 2);
  assert.equal(after.reusedBytes - before.reusedBytes, expectedFrame.length * 2);
  assert.equal(after.sentFrames - before.sentFrames, 3);
  assert.deepEqual(after.eventTypes["party.update"], {
    sentFrames: 3,
    sentBytes: expectedFrame.length * 3,
    encodedFrames: 1,
    encodedBytes: expectedFrame.length,
    reusedFrames: 2,
    reusedBytes: expectedFrame.length * 2,
  });
  assert.deepEqual(Object.keys(after.eventTypes["party.update"]), [
    "sentFrames", "sentBytes", "encodedFrames", "encodedBytes", "reusedFrames", "reusedBytes",
  ]);
  assert.equal(JSON.stringify(after.eventTypes).includes("acc_a"), false, "type metrics contain no account or payload");
  await hub.close();
});

test("event hub encodes one compact battle command frame and reuses it for five participants", async () => {
  const sessions = Object.fromEntries(Array.from({length: 5}, (_, index) => [
    `token_battle_${index}`,
    identity(`acc_battle_${index}`, `sess_battle_${index}`, `battle-${index}`),
  ]));
  const service = createFakeEventService({sessions, activeBattleRoom: true});
  const hub = createTestEventHub(service);
  const sockets = [];
  for (const token of Object.keys(sessions)) {
    const socket = new ReferenceFakeSocket();
    sockets.push(socket);
    await openFakeConnection(hub, token, socket);
    socket.clearWrites();
  }
  const before = hub.metrics();
  const event = {
    type: "battle.command_submitted",
    targetAccountIds: Object.values(sessions).map((value) => value.account.accountId),
    roomId: "room_compact_command",
    round: 3,
    submittedAccountId: "acc_battle_0",
    submittedActorId: "actor_battle_0",
    submittedActorIds: ["actor_battle_0"],
    submittedAccountIds: ["acc_battle_0"],
    requiredActorIds: Object.values(sessions).map((value) => `actor_${value.account.accountId}`),
    requiredAccountIds: Object.values(sessions).map((value) => value.account.accountId),
    eventSeq: 41,
  };
  assert.equal(Object.hasOwn(event, "room"), false);
  const expectedFrame = encodeEventFrame(event);
  service.emit(event);

  for (const socket of sockets) {
    assert.deepEqual(jsonMessages(socket), [event]);
    assert.strictEqual(socket.writes[0], sockets[0].writes[0]);
  }
  const after = hub.metrics();
  assert.equal(after.encodedFrames - before.encodedFrames, 1);
  assert.equal(after.encodedBytes - before.encodedBytes, expectedFrame.length);
  assert.equal(after.reusedFrames - before.reusedFrames, 4);
  assert.equal(after.reusedBytes - before.reusedBytes, expectedFrame.length * 4);
  assert.equal(after.sentFrames - before.sentFrames, 5);
  await hub.close();
});

test("event hub encodes one marked public turn projection and reuses it for five participants", async () => {
  const sessions = Object.fromEntries(Array.from({length: 5}, (_, index) => [
    `token_turn_${index}`,
    identity(`acc_turn_${index}`, `sess_turn_${index}`, `turn-${index}`),
  ]));
  let heavyProjectionBuilds = 0;
  const service = createFakeEventService({
    sessions,
    activeBattleRoom: true,
    projectEvent(_connection, event, projected, projectionCache) {
      if (event.type !== "battle.turn_resolved") {
        return projected;
      }
      let shared = projectionCache.get(event);
      if (!shared) {
        heavyProjectionBuilds += 1;
        shared = {
          ...event,
          turn: {kind: "battle_event_list", payload: "x".repeat(96 * 1024)},
          room: {
            roomId: event.roomId,
            battle: {profileWriteback: null, schemaVersion: 1},
            schemaVersion: 1,
          },
        };
        projectionCache.set(event, shared);
      }
      markReusableEventProjection(projectionCache, shared);
      return shared;
    },
  });
  const hub = createTestEventHub(service);
  const sockets = [];
  for (const token of Object.keys(sessions)) {
    const socket = new ReferenceFakeSocket();
    sockets.push(socket);
    await openFakeConnection(hub, token, socket);
    socket.clearWrites();
  }
  service.eventProjectionCalls = 0;
  const before = hub.metrics();
  const event = {
    type: "battle.turn_resolved",
    targetAccountIds: Object.values(sessions).map((value) => value.account.accountId),
    roomId: "room_public_turn",
    round: 7,
    eventSeq: 42,
  };
  service.emit(event);

  assert.equal(service.eventProjectionCalls, 5, "every connection still passes authorization/projection entry");
  assert.equal(heavyProjectionBuilds, 1);
  for (const socket of sockets) {
    assert.strictEqual(socket.writes[0], sockets[0].writes[0]);
  }
  const projected = jsonMessages(sockets[0])[0];
  assert.equal(projected.type, "battle.turn_resolved");
  assert.equal(projected.turn.payload.length, 96 * 1024);
  const after = hub.metrics();
  assert.equal(after.encodedFrames - before.encodedFrames, 1);
  assert.equal(after.reusedFrames - before.reusedFrames, 4);
  assert.equal(after.sentFrames - before.sentFrames, 5);
  assert.equal(after.eventTypes["battle.turn_resolved"].encodedFrames, 1);
  assert.equal(after.eventTypes["battle.turn_resolved"].reusedFrames, 4);
  await hub.close();
});

test("event hub never shares marked private settlement frames across accounts", async () => {
  const sessions = {
    token_settlement_a: identity("acc_settlement_a", "sess_settlement_a", "settlement-a"),
    token_settlement_b: identity("acc_settlement_b", "sess_settlement_b", "settlement-b"),
  };
  const service = createFakeEventService({
    sessions,
    activeBattleRoom: true,
    projectEvent(connection, event, projected, projectionCache) {
      if (event.type !== "battle.turn_resolved") {
        return projected;
      }
      const privateProjection = {
        ...event,
        room: {
          roomId: event.roomId,
          battle: {
            profileWriteback: {
              profiles: [{accountId: connection.accountId, stoneCoins: 10}],
              schemaVersion: 1,
            },
            schemaVersion: 1,
          },
          schemaVersion: 1,
        },
      };
      markReusableEventProjection(projectionCache, privateProjection);
      return privateProjection;
    },
  });
  const hub = createTestEventHub(service);
  const socketA = new ReferenceFakeSocket();
  const socketB = new ReferenceFakeSocket();
  await openFakeConnection(hub, "token_settlement_a", socketA);
  await openFakeConnection(hub, "token_settlement_b", socketB);
  socketA.clearWrites();
  socketB.clearWrites();
  const before = hub.metrics();

  service.emit({
    type: "battle.turn_resolved",
    targetAccountIds: ["acc_settlement_a", "acc_settlement_b"],
    roomId: "room_private_settlement",
    round: 9,
    eventSeq: 43,
  });

  const profilesA = jsonMessages(socketA)[0].room.battle.profileWriteback.profiles;
  const profilesB = jsonMessages(socketB)[0].room.battle.profileWriteback.profiles;
  assert.deepEqual(profilesA.map((entry) => entry.accountId), ["acc_settlement_a"]);
  assert.deepEqual(profilesB.map((entry) => entry.accountId), ["acc_settlement_b"]);
  assert.notStrictEqual(socketA.writes[0], socketB.writes[0]);
  const after = hub.metrics();
  assert.equal(after.encodedFrames - before.encodedFrames, 2);
  assert.equal(after.reusedFrames - before.reusedFrames, 0);
  assert.equal(after.sentFrames - before.sentFrames, 2);
  await hub.close();
});

test("event hub reuses protocol v10 remote presence frames across different visible AOIs", async () => {
  const sessions = {
    token_actor_a: identity("acc_actor", "sess_actor_a", "actor-a"),
    token_actor_b: identity("acc_actor", "sess_actor_b", "actor-b"),
    token_same_a: identity("acc_same_a", "sess_same_a", "same-a"),
    token_same_b: identity("acc_same_b", "sess_same_b", "same-b"),
    token_other: identity("acc_other", "sess_other", "other"),
  };
  const aoiByToken = {
    token_actor_a: aoi("map_a", 10, 10),
    token_actor_b: aoi("map_a", 10, 10),
    token_same_a: aoi("map_a", 12, 10),
    token_same_b: aoi("map_a", 12, 10),
    token_other: aoi("map_a", 20, 10),
  };
  const service = createFakeEventService({
    sessions,
    aoiByToken,
    projectEvent(connection, event, projected) {
      if (event.type !== "online.position") {
        return projected;
      }
      if (connection.accountId !== event.accountId) {
        return projectOnlinePositionDelta({
          event,
          viewerAccountId: connection.accountId,
          currentVisible: true,
          previousVisible: true,
        }).event;
      }
      return {
        type: "online.position",
        change: "rebase",
        accountId: event.accountId,
        presenceRevision: event.presenceRevision,
        aoi: projected.aoi,
        presenceRebase: {upserts: [], removedAccountIds: [], schemaVersion: 1},
        schemaVersion: 1,
        createdAt: "",
      };
    },
  });
  const hub = createTestEventHub(service);
  const sockets = new Map();
  for (const token of Object.keys(sessions)) {
    const socket = new ReferenceFakeSocket();
    sockets.set(token, socket);
    await openFakeConnection(hub, token, socket);
    socket.clearWrites();
  }
  const before = hub.metrics();
  const event = {
    type: "online.position",
    accountId: "acc_actor",
    previousPosition: {mapId: "map_a", cellX: 12, cellY: 10, hasCell: true},
    position: {mapId: "map_a", cellX: 13, cellY: 10, hasCell: true},
    player: {accountId: "acc_actor", position: {mapId: "map_a", cellX: 13, cellY: 10}},
    presenceRevision: 3,
    schemaVersion: 1,
    createdAt: "",
  };
  service.emit(event);
  await nextImmediate();

  const actorAFrame = sockets.get("token_actor_a").writes[0];
  const actorBFrame = sockets.get("token_actor_b").writes[0];
  const sameAFrame = sockets.get("token_same_a").writes[0];
  const sameBFrame = sockets.get("token_same_b").writes[0];
  const otherFrame = sockets.get("token_other").writes[0];
  assert.strictEqual(actorAFrame, actorBFrame);
  assert.strictEqual(sameAFrame, sameBFrame);
  assert.notStrictEqual(actorAFrame, sameAFrame);
  assert.strictEqual(otherFrame, sameAFrame, "remote v10 DTO is viewer-AOI neutral once visibility is approved");
  assert.equal(jsonMessages(sockets.get("token_actor_a"))[0].change, "rebase");
  assert.equal(jsonMessages(sockets.get("token_same_a"))[0].change, "upsert");
  assert.deepEqual(
    jsonMessages(sockets.get("token_same_a"))[0],
    jsonMessages(sockets.get("token_same_b"))[0],
  );
  assert.equal(Object.hasOwn(jsonMessages(sockets.get("token_same_a"))[0], "aoi"), false);
  const after = hub.metrics();
  assert.equal(after.encodedFrames - before.encodedFrames, 2);
  assert.equal(after.encodedBytes - before.encodedBytes, (
    actorAFrame.length + sameAFrame.length
  ));
  assert.equal(after.reusedFrames - before.reusedFrames, 3);
  assert.equal(after.reusedBytes - before.reusedBytes, actorAFrame.length + sameAFrame.length * 2);
  assert.equal(after.sentFrames - before.sentFrames, 5);
  assert.deepEqual(after.eventTypes["online.position"], {
    sentFrames: 5,
    sentBytes: actorAFrame.length * 2 + sameAFrame.length * 2 + otherFrame.length,
    encodedFrames: 2,
    encodedBytes: actorAFrame.length + sameAFrame.length,
    reusedFrames: 3,
    reusedBytes: actorAFrame.length + sameAFrame.length * 2,
  });
  await hub.close();
});

test("position batches preserve projected order, snapshot facts, and exact cross-client Buffer reuse", async () => {
  const sessions = {
    token_self: identity("acc_self", "sess_self", "self"),
    token_a: identity("acc_a", "sess_a", "a"),
    token_b: identity("acc_b", "sess_b", "b"),
  };
  const service = createFakeEventService({
    sessions,
    aoiByToken: Object.fromEntries(Object.keys(sessions).map((token) => [token, aoi("map_a", 10, 10)])),
    projectEvent(connection, event, projected) {
      return projectV10PositionForFake(connection, event, projected);
    },
  });
  const hub = createTestEventHub(service, {
    positionBatchWindowMs: 40,
    positionEventsPerTurn: 16,
  });
  const sockets = new Map();
  for (const token of Object.keys(sessions)) {
    const socket = new ReferenceFakeSocket();
    sockets.set(token, socket);
    await openFakeConnection(hub, token, socket);
    socket.clearWrites();
  }
  const sourceEvents = [
    positionSourceEvent("acc_remote_1", 1, "远端一"),
    positionSourceEvent("acc_self", 1, "自己"),
    positionSourceEvent("acc_remote_2", 1, "远端二"),
  ];
  for (const event of sourceEvents) {
    service.emit(event);
  }
  await nextImmediate();
  assert.equal(hub.metrics().pendingPositionBatchClients, 3);
  sourceEvents[0].player.displayName = "延迟窗口篡改";
  sourceEvents[0].player.position.cellX = 999;
  service.emit({type: "party.update", revision: 1});
  for (const socket of sockets.values()) {
    assert.deepEqual(jsonMessages(socket).map((event) => event.type), [
      "online.position_batch",
      "party.update",
    ]);
  }
  await delay(55);

  const selfFrame = sockets.get("token_self").writes[0];
  const observerAFrame = sockets.get("token_a").writes[0];
  const observerBFrame = sockets.get("token_b").writes[0];
  assert.strictEqual(observerAFrame, observerBFrame, "identical final delta sequences reuse one exact Buffer");
  assert.notStrictEqual(selfFrame, observerAFrame, "self rebase sequence cannot collide with remote upserts");
  const observerBatch = jsonMessages(sockets.get("token_a"))[0];
  assert.equal(observerBatch.type, "online.position_batch");
  assert.equal(Object.hasOwn(observerBatch, "eventSeq"), false);
  assert.deepEqual(observerBatch.deltas.map((event) => [event.accountId, event.change]), [
    ["acc_remote_1", "upsert"],
    ["acc_self", "upsert"],
    ["acc_remote_2", "upsert"],
  ]);
  assert.equal(observerBatch.deltas[0].player.displayName, "远端一", "timer cannot observe source mutation");
  assert.equal(observerBatch.deltas[0].player.position.cellX, 11);
  const selfBatch = jsonMessages(sockets.get("token_self"))[0];
  assert.deepEqual(selfBatch.deltas.map((event) => [event.accountId, event.change]), [
    ["acc_remote_1", "upsert"],
    ["acc_self", "rebase"],
    ["acc_remote_2", "upsert"],
  ]);
  const metrics = hub.metrics();
  assert.equal(metrics.pendingPositionBatchClients, 0);
  assert.equal(metrics.pendingPositionBatchDeltas, 0);
  assert.equal(metrics.positionBatchFrames, 3);
  assert.equal(metrics.positionBatchDeltas, 9);
  assert.equal(metrics.positionBatchEncodedFrames, 2);
  assert.equal(metrics.positionBatchReusedFrames, 1);
  await hub.close();
});

test("position batch running byte total preserves the exact incremental budget", async () => {
  const service = createFakeEventService({
    sessions: {token_a: identity("acc_a", "sess_a", "a")},
    aoiByToken: {token_a: aoi("map_a", 10, 10)},
    projectEvent(connection, event, projected) {
      return projectV10PositionForFake(connection, event, projected);
    },
  });
  const hub = createTestEventHub(service, {
    positionBatchWindowMs: 1000,
    positionEventsPerTurn: 16,
  });
  const socket = new ReferenceFakeSocket();
  await openFakeConnection(hub, "token_a", socket);
  socket.clearWrites();

  const expectedDeltas = [];
  for (let index = 0; index < 3; index += 1) {
    const event = positionSourceEvent(`acc_remote_${index}`, index + 1, `远端${index}`);
    expectedDeltas.push(projectOnlinePositionDelta({
      event,
      viewerAccountId: "acc_a",
      currentVisible: true,
      previousVisible: true,
    }).event);
    service.emit(event);
    await nextImmediate();
    const payloadBytes = expectedDeltas.reduce(
      (total, delta) => total + Buffer.byteLength(JSON.stringify(delta)),
      0,
    );
    assert.equal(hub.metrics().pendingPositionBatchDeltas, expectedDeltas.length);
    assert.equal(
      hub.metrics().currentPositionBatchBytes,
      128 + payloadBytes + Math.max(0, expectedDeltas.length - 1),
    );
  }

  await hub.close();
  assert.equal(hub.metrics().currentPositionBatchBytes, 0);
});

test("timer position flush yields between bounded client slices and reuses one Buffer per slice", async () => {
  const sessions = Object.fromEntries(Array.from({length: 4}, (_value, index) => [
    `token_${index}`,
    identity(`acc_${index}`, `sess_${index}`, `player-${index}`),
  ]));
  const service = createFakeEventService({
    sessions,
    aoiByToken: Object.fromEntries(Object.keys(sessions).map((token) => [token, aoi("map_a", 10, 10)])),
    projectEvent(connection, event, projected) {
      return projectV10PositionForFake(connection, event, projected);
    },
  });
  const hub = createTestEventHub(service, {
    positionBatchWindowMs: 1,
    positionEventsPerTurn: 16,
    positionClientsPerTurn: 64,
    positionDrainBudgetMs: 1000,
    positionBatchClientsPerTurn: 2,
    positionBatchBytesPerTurn: 512 * 1024,
    positionBatchFlushBudgetMs: 1000,
  });
  const sockets = [];
  let observeBatchWrites = false;
  let pendingAtFirstSliceWrite = null;
  for (const token of Object.keys(sessions)) {
    const socket = new ReferenceFakeSocket();
    const write = socket.write.bind(socket);
    socket.write = (value) => {
      const result = write(value);
      if (observeBatchWrites && Buffer.isBuffer(value) && pendingAtFirstSliceWrite === null) {
        pendingAtFirstSliceWrite = hub.metrics().pendingPositionBatchClients;
      }
      return result;
    };
    sockets.push(socket);
    await openFakeConnection(hub, token, socket);
    socket.clearWrites();
  }

  observeBatchWrites = true;
  service.emit(positionSourceEvent("acc_remote", 1, "远端"));
  await waitUntil(() => sockets.every((socket) => socket.writes.length === 1), 100);

  assert.equal(pendingAtFirstSliceWrite, 2, "the first two-client slice leaves two batches for a later turn");
  assert.deepEqual(sockets.map((socket) => jsonMessages(socket).map((event) => event.type)), [
    ["online.position_batch"],
    ["online.position_batch"],
    ["online.position_batch"],
    ["online.position_batch"],
  ]);
  const frames = sockets.map((socket) => socket.writes[0]);
  const uniqueFrames = new Set(frames);
  assert.equal(uniqueFrames.size, 2, "each timer slice encodes its own frame");
  for (const frame of uniqueFrames) {
    assert.equal(frames.filter((candidate) => candidate === frame).length, 2);
  }
  const metrics = hub.metrics();
  assert.equal(metrics.positionBatchFlushClientsMax, 2);
  assert.equal(metrics.positionBatchEncodedFrames, 2);
  assert.equal(metrics.positionBatchReusedFrames, 2);
  assert.equal(metrics.currentPositionBatchBytes, 0);
  await hub.close();
});

test("close cancels a queued timer-batch continuation and force-flushes each remaining batch once", async () => {
  const sessions = Object.fromEntries(Array.from({length: 3}, (_value, index) => [
    `token_close_${index}`,
    identity(`acc_close_${index}`, `sess_close_${index}`, `close-${index}`),
  ]));
  const service = createFakeEventService({
    sessions,
    aoiByToken: Object.fromEntries(Object.keys(sessions).map((token) => [token, aoi("map_a", 10, 10)])),
    projectEvent(connection, event, projected) {
      return projectV10PositionForFake(connection, event, projected);
    },
  });
  const hub = createTestEventHub(service, {
    positionBatchWindowMs: 1,
    positionEventsPerTurn: 16,
    positionClientsPerTurn: 64,
    positionDrainBudgetMs: 1000,
    positionBatchClientsPerTurn: 1,
    positionBatchBytesPerTurn: 512 * 1024,
    positionBatchFlushBudgetMs: 1000,
  });
  const sockets = [];
  let observeBatchWrites = false;
  let pendingAtFirstSliceWrite = null;
  let closePromise = null;
  for (const token of Object.keys(sessions)) {
    const socket = new ReferenceFakeSocket();
    const write = socket.write.bind(socket);
    socket.write = (value) => {
      const result = write(value);
      if (observeBatchWrites && Buffer.isBuffer(value) && pendingAtFirstSliceWrite === null) {
        pendingAtFirstSliceWrite = hub.metrics().pendingPositionBatchClients;
        queueMicrotask(() => {
          closePromise ||= hub.close();
        });
      }
      return result;
    };
    sockets.push(socket);
    await openFakeConnection(hub, token, socket);
    socket.clearWrites();
  }

  observeBatchWrites = true;
  service.emit(positionSourceEvent("acc_close_remote", 1, "远端"));
  await waitUntil(() => closePromise !== null, 100);
  await closePromise;

  assert.equal(pendingAtFirstSliceWrite, 2);
  assert.deepEqual(sockets.map((socket) => (
    jsonMessages(socket).filter((event) => event.type === "online.position_batch").length
  )), [1, 1, 1]);
  const writesAfterClose = sockets.map((socket) => socket.writes.length);
  await nextImmediate();
  await delay(5);
  assert.deepEqual(sockets.map((socket) => socket.writes.length), writesAfterClose);
  assert.equal(hub.metrics().pendingPositionBatchClients, 0);
  assert.equal(hub.metrics().currentPositionBatchBytes, 0);
});

test("position batches flush at 64 deltas, split before 64 KiB, and close without a late timer write", async () => {
  const service = createFakeEventService({
    sessions: {
      token_a: identity("acc_a", "sess_a", "a"),
      token_b: identity("acc_b", "sess_b", "b"),
    },
    aoiByToken: {
      token_a: aoi("map_a", 10, 10),
      token_b: aoi("map_a", 10, 10),
    },
    projectEvent(connection, event, projected) {
      return projectV10PositionForFake(connection, event, projected);
    },
  });
  const hub = createTestEventHub(service, {
    positionBatchWindowMs: 20,
    positionEventsPerTurn: 128,
    positionClientsPerTurn: 2048,
    positionDrainBudgetMs: 1000,
  });
  const socket = new ReferenceFakeSocket();
  const socketB = new ReferenceFakeSocket();
  await openFakeConnection(hub, "token_a", socket);
  await openFakeConnection(hub, "token_b", socketB);
  socket.clearWrites();
  socketB.clearWrites();
  for (let index = 0; index < 64; index += 1) {
    service.emit(positionSourceEvent(`acc_${index}`, 1, `玩家${index}`));
  }
  await nextImmediate();
  await delay(30);
  let batches = jsonMessages(socket).filter((event) => event.type === "online.position_batch");
  assert.equal(batches.length, 1);
  assert.equal(batches[0].deltas.length, 64);
  assert.strictEqual(socket.writes[0], socketB.writes[0], "two clients reuse the exact 64-delta Buffer");
  assert.equal(hub.metrics().pendingPositionBatchDeltas, 0);

  socket.clearWrites();
  socketB.clearWrites();
  service.emit(positionSourceEvent("acc_large_a", 1, "甲".repeat(11000)));
  service.emit(positionSourceEvent("acc_large_b", 1, "乙".repeat(11000)));
  await nextImmediate();
  assert.equal(jsonMessages(socket).filter((event) => event.type === "online.position_batch").length, 1);
  assert.equal(hub.metrics().pendingPositionBatchDeltas, 2);
  await hub.close();
  batches = jsonMessages(socket).filter((event) => event.type === "online.position_batch");
  assert.equal(batches.length, 2, "close flushes the final private batch exactly once");
  assert.equal(socket.writes.every((frame) => frame.length <= 64 * 1024), true);
  const writesAfterClose = socket.writes.length;
  const writesAfterCloseB = socketB.writes.length;
  await delay(20);
  assert.equal(socket.writes.length, writesAfterClose, "cleared batch timer cannot write after close");
  assert.equal(socketB.writes.length, writesAfterCloseB, "all shared batch timers are cleared on close");
});

test("position batch snapshots never reuse an untrusted mutable projection across viewers", async () => {
  const sharedProjection = {};
  const service = createFakeEventService({
    sessions: {
      token_a: identity("acc_a", "sess_a", "a"),
      token_b: identity("acc_b", "sess_b", "b"),
    },
    aoiByToken: {
      token_a: aoi("map_a", 10, 10),
      token_b: aoi("map_a", 10, 10),
    },
    projectEvent(connection, event) {
      const value = projectOnlinePositionDelta({
        event,
        viewerAccountId: connection.accountId,
        currentVisible: true,
        previousVisible: true,
      }).event;
      value.player = {...value.player, displayName: `viewer:${connection.accountId}`};
      for (const key of Object.keys(sharedProjection)) delete sharedProjection[key];
      Object.assign(sharedProjection, value);
      return sharedProjection;
    },
  });
  const hub = createTestEventHub(service, {positionBatchWindowMs: 10});
  const socketA = new ReferenceFakeSocket();
  const socketB = new ReferenceFakeSocket();
  await openFakeConnection(hub, "token_a", socketA);
  await openFakeConnection(hub, "token_b", socketB);
  socketA.clearWrites();
  socketB.clearWrites();
  service.emit(positionSourceEvent("acc_remote", 1, "远端"));
  await nextImmediate();
  await delay(20);
  assert.equal(jsonMessages(socketA)[0].deltas[0].player.displayName, "viewer:acc_a");
  assert.equal(jsonMessages(socketB)[0].deltas[0].player.displayName, "viewer:acc_b");
  assert.notStrictEqual(socketA.writes[0], socketB.writes[0]);
  await hub.close();
});

test("a trusted reusable position projection is audited and serialized once per publish", async () => {
  let auditCount = 0;
  let projectionCalls = 0;
  let auditAtSecondProjection = -1;
  const baseProjection = projectOnlinePositionDelta({
    event: positionSourceEvent("acc_remote", 1, "远端"),
    viewerAccountId: "acc_a",
    currentVisible: true,
    previousVisible: true,
  }).event;
  const auditedProjection = new Proxy(baseProjection, {
    ownKeys(target) {
      auditCount += 1;
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, property) {
      auditCount += 1;
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
  });
  const service = createFakeEventService({
    sessions: {
      token_a: identity("acc_a", "sess_a", "a"),
      token_b: identity("acc_b", "sess_b", "b"),
    },
    aoiByToken: {
      token_a: aoi("map_a", 10, 10),
      token_b: aoi("map_a", 10, 10),
    },
    projectEvent(_connection, _event, _projected, projectionCache) {
      projectionCalls += 1;
      if (projectionCalls === 2) {
        auditAtSecondProjection = auditCount;
      }
      markReusableEventProjection(projectionCache, auditedProjection);
      return auditedProjection;
    },
  });
  const hub = createTestEventHub(service, {positionBatchWindowMs: 10});
  const socketA = new ReferenceFakeSocket();
  const socketB = new ReferenceFakeSocket();
  await openFakeConnection(hub, "token_a", socketA);
  await openFakeConnection(hub, "token_b", socketB);
  socketA.clearWrites();
  socketB.clearWrites();
  service.emit(positionSourceEvent("acc_remote", 1, "远端"));
  await nextImmediate();
  await delay(20);
  assert.equal(projectionCalls, 2);
  assert.equal(auditAtSecondProjection > 0, true);
  assert.equal(auditCount, auditAtSecondProjection, "trusted WeakMap hit skips repeated descriptor and JSON audit");
  assert.strictEqual(socketA.writes[0], socketB.writes[0]);
  await hub.close();
});

test("a pending position batch shares the writer 128-frame and 256-KiB hard budget", async () => {
  const service = createFakeEventService({
    sessions: {token_a: identity("acc_a", "sess_a", "a")},
    aoiByToken: {token_a: aoi("map_a", 10, 10)},
    projectEvent(connection, event, projected) {
      return projectV10PositionForFake(connection, event, projected);
    },
  });
  const hub = createTestEventHub(service, {positionBatchWindowMs: 1000});
  const socket = new FakeSocket();
  await openFakeConnection(hub, "token_a", socket);
  socket.clearWrites();
  service.emit(positionSourceEvent("acc_remote", 1, "远端"));
  await nextImmediate();
  assert.equal(hub.metrics().pendingPositionBatchDeltas, 1);
  socket.writeResults.push(false);
  for (let index = 0; index < 129 && !socket.destroyed; index += 1) {
    service.emit({type: "party.update", index, payload: "x".repeat(32)});
  }
  await nextImmediate();
  const metrics = hub.metrics();
  assert.equal(socket.destroyed, true);
  assert.equal(metrics.peakClientCombinedQueuedFrames <= 128, true);
  assert.equal(metrics.peakClientCombinedBufferedBytes <= 256 * 1024, true);
  assert.equal(metrics.slowConsumerDisconnects >= 1, true);
  assert.equal(metrics.pendingPositionBatchDeltas, 0);
  await hub.close();
});

test("critical fanout flushes each client's older batch without exceeding its private byte budget", async () => {
  const service = createFakeEventService({
    sessions: {
      token_slow: identity("acc_slow", "sess_slow", "slow"),
      token_fast: identity("acc_fast", "sess_fast", "fast"),
    },
    aoiByToken: {
      token_slow: aoi("map_a", 10, 10),
      token_fast: aoi("map_a", 10, 10),
    },
    projectEvent(connection, event, projected) {
      return projectV10PositionForFake(connection, event, projected);
    },
  });
  const hub = createTestEventHub(service, {
    positionBatchWindowMs: 1000,
    maxQueuedFrames: 1024,
  });
  const slowSocket = new FakeSocket();
  const fastSocket = new ReferenceFakeSocket();
  await openFakeConnection(hub, "token_slow", slowSocket);
  await openFakeConnection(hub, "token_fast", fastSocket);
  slowSocket.clearWrites();
  fastSocket.clearWrites();
  service.emit(positionSourceEvent("acc_remote", 1, "远端"));
  await nextImmediate();
  assert.equal(hub.metrics().pendingPositionBatchClients, 2);
  slowSocket.writeResults.push(false);
  for (let index = 0; index < 12; index += 1) {
    service.emit({type: "party.update", index, payload: "x".repeat(32 * 1024)});
  }
  await nextImmediate();
  const metrics = hub.metrics();
  assert.equal(slowSocket.destroyed, true);
  assert.equal(fastSocket.destroyed, false);
  assert.equal(hub.clientCount(), 1);
  assert.equal(metrics.peakClientCombinedBufferedBytes <= 256 * 1024, true);
  assert.equal(metrics.slowConsumerDisconnects >= 1, true);
  assert.equal(metrics.pendingPositionBatchClients, 0);
  assert.equal(metrics.pendingPositionBatchDeltas, 0);
  assert.equal(jsonMessages(fastSocket)[0].type, "online.position_batch");
  assert.equal(jsonMessages(fastSocket).filter((event) => event.type === "party.update").length, 12);
  await hub.close();
});

test("event hub gives one projection cache to each publish and never carries it across publishes", async () => {
  const sessions = {
    token_cache_a: identity("acc_cache_a", "sess_cache_a", "cache-a"),
    token_cache_b: identity("acc_cache_b", "sess_cache_b", "cache-b"),
  };
  const sharedAoi = aoi("map_cache", 10, 10);
  const projectionCaches = [];
  let projectionAuditCount = 0;
  const auditCountBeforeRepeatedQueues = [];
  const service = createFakeEventService({
    sessions,
    aoiByToken: {
      token_cache_a: sharedAoi,
      token_cache_b: {...sharedAoi},
    },
    projectEvent(_connection, event, projected, projectionCache) {
      projectionCaches.push(projectionCache);
      assert.equal(projectionCache instanceof Map, true);
      const cached = projectionCache.get(event);
      if (cached) {
        auditCountBeforeRepeatedQueues.push(projectionAuditCount);
        return cached;
      }
      const auditedProjection = new Proxy(projected, {
        ownKeys(target) {
          projectionAuditCount += 1;
          return Reflect.ownKeys(target);
        },
        getOwnPropertyDescriptor(target, property) {
          projectionAuditCount += 1;
          return Reflect.getOwnPropertyDescriptor(target, property);
        },
      });
      projectionCache.set(event, auditedProjection);
      markReusableEventProjection(projectionCache, auditedProjection);
      return auditedProjection;
    },
  });
  const hub = createTestEventHub(service);
  const socketA = new ReferenceFakeSocket();
  const socketB = new ReferenceFakeSocket();
  await openFakeConnection(hub, "token_cache_a", socketA);
  await openFakeConnection(hub, "token_cache_b", socketB);
  socketA.clearWrites();
  socketB.clearWrites();
  const event = {
    type: "online.position",
    accountId: "acc_cache_actor",
    previousPosition: {mapId: "map_cache", cellX: 9, cellY: 10, hasCell: true},
    position: {mapId: "map_cache", cellX: 10, cellY: 10, hasCell: true},
    player: {accountId: "acc_cache_actor", position: {mapId: "map_cache", cellX: 10, cellY: 10}},
    presenceRevision: 9,
  };

  const before = hub.metrics();
  service.emit(event);
  await nextImmediate();
  const firstA = socketA.writes[0];
  const firstB = socketB.writes[0];
  assert.strictEqual(projectionCaches[0], projectionCaches[1]);
  assert.strictEqual(firstA, firstB, "same outgoing object reuses the publish-local frame");
  assert.deepEqual(jsonMessages(socketA), jsonMessages(socketB));
  assert.equal(
    projectionAuditCount,
    auditCountBeforeRepeatedQueues[0],
    "the repeated outgoing object skips descriptor/key/JSON inspection",
  );

  socketA.clearWrites();
  socketB.clearWrites();
  service.emit(event);
  await nextImmediate();
  const secondA = socketA.writes[0];
  const secondB = socketB.writes[0];
  assert.strictEqual(projectionCaches[2], projectionCaches[3]);
  assert.notStrictEqual(projectionCaches[0], projectionCaches[2]);
  assert.strictEqual(secondA, secondB);
  assert.notStrictEqual(secondA, firstA, "encoded frame Buffers never survive into a later publish");
  assert.deepEqual(secondA, firstA, "later publishes preserve exact WebSocket bytes");
  assert.equal(
    projectionAuditCount,
    auditCountBeforeRepeatedQueues[1],
    "each new publish audits once, then memoizes only inside that publish",
  );

  const after = hub.metrics();
  assert.equal(after.encodedFrames - before.encodedFrames, 2);
  assert.equal(after.reusedFrames - before.reusedFrames, 2);
  assert.equal(after.sentFrames - before.sentFrames, 4);
  await hub.close();
});

test("event hub never reuses position frames for undefined, null, or empty projection fields", async () => {
  const sessions = {
    token_change_undefined: identity("acc_change_undefined", "sess_change_undefined", "change-undefined"),
    token_change_empty: identity("acc_change_empty", "sess_change_empty", "change-empty"),
    token_aoi_undefined: identity("acc_aoi_undefined", "sess_aoi_undefined", "aoi-undefined"),
    token_aoi_null: identity("acc_aoi_null", "sess_aoi_null", "aoi-null"),
  };
  const sharedAoi = aoi("map_a", 12, 10);
  const aoiByToken = Object.fromEntries(Object.keys(sessions).map((token) => [token, sharedAoi]));
  const service = createFakeEventService({
    sessions,
    aoiByToken,
    projectEvent(connection, _event, projected) {
      if (connection.accountId === "acc_change_undefined") {
        return {...projected, change: undefined};
      }
      if (connection.accountId === "acc_change_empty") {
        return {...projected, change: ""};
      }
      if (connection.accountId === "acc_aoi_undefined") {
        return {...projected, aoi: undefined};
      }
      if (connection.accountId === "acc_aoi_null") {
        return {...projected, aoi: null};
      }
      return projected;
    },
  });
  const hub = createTestEventHub(service);
  const sockets = new Map();
  for (const token of Object.keys(sessions)) {
    const socket = new ReferenceFakeSocket();
    sockets.set(token, socket);
    await openFakeConnection(hub, token, socket);
    socket.clearWrites();
  }
  const before = hub.metrics();
  const event = {
    type: "online.position",
    accountId: "acc_projection_source",
    previousPosition: {mapId: "map_a", cellX: 11, cellY: 10, hasCell: true},
    position: {mapId: "map_a", cellX: 12, cellY: 10, hasCell: true},
    player: {accountId: "acc_projection_source", position: {mapId: "map_a", cellX: 12, cellY: 10}},
    presenceRevision: 4,
  };
  service.emit(event);
  await nextImmediate();

  const projectedBase = {...event, change: "upsert", aoi: sharedAoi};
  const expectedByToken = {
    token_change_undefined: {...projectedBase, change: undefined},
    token_change_empty: {...projectedBase, change: ""},
    token_aoi_undefined: {...projectedBase, aoi: undefined},
    token_aoi_null: {...projectedBase, aoi: null},
  };
  for (const [token, expected] of Object.entries(expectedByToken)) {
    assert.deepEqual(sockets.get(token).writes[0], encodeEventFrame(expected), token);
    assert.deepEqual(jsonMessages(sockets.get(token))[0], JSON.parse(JSON.stringify(expected)), token);
  }
  assert.notDeepEqual(
    sockets.get("token_change_undefined").writes[0],
    sockets.get("token_change_empty").writes[0],
  );
  assert.notDeepEqual(
    sockets.get("token_aoi_undefined").writes[0],
    sockets.get("token_aoi_null").writes[0],
  );
  const after = hub.metrics();
  assert.equal(after.encodedFrames - before.encodedFrames, 4);
  assert.equal(after.reusedFrames - before.reusedFrames, 0);
  assert.equal(after.sentFrames - before.sentFrames, 4);
  await hub.close();
});

test("event hub repairs only a missing profile through the durable fallback", async () => {
  const session = identity("acc_repair", "sess_repair", "repair");
  let repaired = false;
  const service = createFakeEventService({
    sessions: {token_repair: session},
    aoiByToken: {token_repair: aoi("map_a", 1, 1)},
    needsRepair: () => !repaired,
    onDurable(methodName) {
      if (methodName === "getSession") repaired = true;
    },
  });
  const hub = createTestEventHub(service);
  const socket = new FakeSocket();
  await openFakeConnection(hub, "token_repair", socket);
  assert.deepEqual(service.durableCalls.map((call) => call.methodName), ["getSession"]);
  assert.equal(jsonMessages(socket).some((event) => event.type === "events.ready"), true);
  await hub.close();
});

test("event hub reference-counts duplicate account sockets and closes only the replaced session", async () => {
  const service = createFakeEventService({
    sessions: {
      token_old: {...identity("acc_same", "sess_old", "same"), activeBattleRoom: true},
      token_new: {...identity("acc_same", "sess_new", "same"), activeBattleRoom: true},
    },
    aoiByToken: {
      token_old: aoi("map_a", 10, 10),
      token_new: aoi("map_a", 10, 10),
    },
    activeBattleRoom: true,
  });
  const hub = createTestEventHub(service);
  const oldSocket = new FakeSocket();
  const newSocket = new FakeSocket();
  await openFakeConnection(hub, "token_old", oldSocket);
  await openFakeConnection(hub, "token_new", newSocket);
  assert.deepEqual(service.battleConnectionCalls, [{accountId: "acc_same", sessionId: "sess_old", connected: true}]);

  oldSocket.destroy();
  assert.equal(hub.clientCount(), 1);
  assert.deepEqual(service.battleConnectionCalls, [{accountId: "acc_same", sessionId: "sess_old", connected: true}]);

  service.emit({
    type: "session.replaced",
    targetAccountIds: ["acc_same"],
    targetSessionIds: ["sess_new"],
    eventSeq: 9,
  });
  await Promise.resolve();
  assert.equal(newSocket.ended, true);
  assert.equal(jsonMessages(newSocket).some((event) => event.type === "session.replaced"), true);
  assert.deepEqual(service.battleConnectionCalls, [
    {accountId: "acc_same", sessionId: "sess_old", connected: true},
    {accountId: "acc_same", sessionId: "sess_new", connected: false},
  ]);
  assert.equal(hub.clientCount(), 0);
  await hub.close();
});

test("event hub clears battle connection state through the trusted identity after the old session is replaced", async () => {
  const service = createFakeEventService({
    sessions: {
      token_old: {...identity("acc_battle", "sess_revoked", "battle"), activeBattleRoom: true},
    },
    aoiByToken: {token_old: aoi("map_a", 10, 10)},
    activeBattleRoom: true,
  });
  const hub = createTestEventHub(service);
  const socket = new FakeSocket();
  await openFakeConnection(hub, "token_old", socket);
  assert.equal(service.battleConnectionCalls.at(-1).connected, true);

  service.emit({
    type: "session.replaced",
    targetAccountIds: ["acc_battle"],
    targetSessionIds: ["sess_revoked"],
    eventSeq: 20,
  });
  await Promise.resolve();
  assert.equal(socket.ended, true);
  assert.deepEqual(service.battleConnectionCalls, [
    {accountId: "acc_battle", sessionId: "sess_revoked", connected: true},
    {accountId: "acc_battle", sessionId: "sess_revoked", connected: false},
  ]);
  await hub.close();
});

test("a failed battle connection transition is not acknowledged and the next socket retries it", async () => {
  const service = createFakeEventService({
    sessions: {
      token_one: {...identity("acc_retry", "sess_one", "retry"), activeBattleRoom: true},
      token_two: {...identity("acc_retry", "sess_two", "retry"), activeBattleRoom: true},
    },
    aoiByToken: {
      token_one: aoi("map_a", 10, 10),
      token_two: aoi("map_a", 10, 10),
    },
    activeBattleRoom: true,
    battleTransitionResults: [{ok: false}, {ok: true}],
  });
  const hub = createTestEventHub(service);
  const failedSocket = new FakeSocket();
  await openFakeConnection(hub, "token_one", failedSocket);
  assert.equal(failedSocket.destroyed, true);
  await openFakeConnection(hub, "token_two", new FakeSocket());
  assert.deepEqual(service.battleConnectionCalls.slice(0, 2).map((row) => row.connected), [true, true]);
  await hub.close();
});

test("an error-only socket is destroyed and removed from every event index", async () => {
  const service = createFakeEventService({
    sessions: {token_a: identity("acc_a", "sess_a", "a")},
    aoiByToken: {token_a: aoi("map_a", 10, 10)},
  });
  const hub = createTestEventHub(service);
  const socket = new FakeSocket();
  await openFakeConnection(hub, "token_a", socket);
  socket.emit("error", new Error("socket failed"));
  assert.equal(socket.destroyed, true);
  assert.equal(hub.clientCount(), 0);
  service.emit({type: "party.update", targetAccountIds: ["acc_a"]});
  assert.equal(hub.clientCount(), 0);
  await hub.close();
});

test("event hub marks a duplicated session connected only on the first socket and disconnected on the last", async () => {
  const service = createFakeEventService({
    sessions: {
      token_one: identity("acc_same", "sess_same", "same"),
      token_two: identity("acc_same", "sess_same", "same"),
    },
    aoiByToken: {
      token_one: aoi("map_a", 10, 10),
      token_two: aoi("map_a", 10, 10),
    },
  });
  const hub = createTestEventHub(service);
  const first = new FakeSocket();
  const second = new FakeSocket();
  await openFakeConnection(hub, "token_one", first);
  await openFakeConnection(hub, "token_two", second);
  assert.deepEqual(service.eventConnectionCalls, [{sessionId: "sess_same", connected: true}]);

  first.destroy();
  assert.deepEqual(service.eventConnectionCalls, [{sessionId: "sess_same", connected: true}]);
  second.destroy();
  assert.deepEqual(service.eventConnectionCalls, [
    {sessionId: "sess_same", connected: true},
    {sessionId: "sess_same", connected: false},
  ]);
  await hub.close();
});

test("event hub coalesces source position bursts and releases superseded writer event seqs", async () => {
  const service = createFakeEventService({
    sessions: {token_a: identity("acc_a", "sess_a", "a")},
    aoiByToken: {token_a: aoi("map_a", 10, 10)},
  });
  const hub = createTestEventHub(service);
  const socket = new FakeSocket();
  await openFakeConnection(hub, "token_a", socket);
  socket.clearWrites();
  socket.writeResults.push(false, true, true, true, true);
  service.emit({type: "party.update"});
  service.emit({type: "online.position", change: "rebase", accountId: "acc_a", position: {mapId: "map_a", cellX: 11, cellY: 10}, presenceRevision: 1});
  service.emit({type: "online.position", change: "rebase", accountId: "acc_a", position: {mapId: "map_a", cellX: 12, cellY: 10}, presenceRevision: 2});
  service.emit({type: "online.position", change: "upsert", accountId: "acc_remote", position: {mapId: "map_a", cellX: 12, cellY: 11}, presenceRevision: 1});
  service.emit({type: "online.position", change: "upsert", accountId: "acc_remote", position: {mapId: "map_a", cellX: 13, cellY: 11}, presenceRevision: 2});
  await nextImmediate();
  socket.drain();
  const positionEvents = jsonMessages(socket).filter((event) => event.type === "online.position");
  assert.deepEqual(positionEvents.map((event) => [event.change, event.accountId, event.presenceRevision]), [
    ["rebase", "acc_a", 2],
    ["upsert", "acc_remote", 2],
  ]);

  socket.clearWrites();
  socket.writeResults.length = 0;
  socket.writeResults.push(false, true, true, true);
  service.emit({type: "party.update"});
  service.emit({type: "online.position", change: "upsert", accountId: "acc_remote", position: {mapId: "map_a", cellX: 13, cellY: 11}, presenceRevision: 3, eventSeq: 10});
  service.emit({type: "online.position", change: "remove", accountId: "acc_remote", previousPosition: {mapId: "map_a", cellX: 13, cellY: 11}, presenceRevision: 4});
  await nextImmediate();
  socket.drain();
  service.emit({type: "battle.invite", targetAccountIds: ["acc_a"], eventSeq: 10});
  assert.equal(jsonMessages(socket).some((event) => event.type === "battle.invite" && event.eventSeq === 10), true);
  await hub.close();
});

test("healthy bootstrap streams the complete replay window without staging it in the bounded live queue", async () => {
  const service = createFakeEventService({
    sessions: {token_a: identity("acc_a", "sess_a", "a")},
    aoiByToken: {token_a: aoi("map_a", 1, 1)},
    replayEvents: Array.from({length: 500}, (_, index) => ({
      type: "party.update",
      targetAccountIds: ["acc_a"],
      eventSeq: index + 1,
    })),
  });
  const hub = createTestEventHub(service, {maxQueuedFrames: 5});
  const socket = new FakeSocket();
  await openFakeConnection(hub, "token_a", socket, {cursorPresent: true, lastEventSeq: 0});
  assert.equal(socket.destroyed, false);
  assert.equal(hub.clientCount(), 1);
  assert.equal(jsonMessages(socket).filter((event) => event.type === "party.update").length, 500);
  assert.equal(hub.metrics().queuedFrames, 0);
  assert.equal(hub.metrics().peakQueuedFrames, 0);
  assert.equal(hub.metrics().slowConsumerDisconnects, 0);
  await hub.close();
});

test("a blocked bootstrap is charged to the same frame budget and isolates only that slow client", async () => {
  const service = createFakeEventService({
    sessions: {token_a: identity("acc_a", "sess_a", "a")},
    aoiByToken: {token_a: aoi("map_a", 1, 1)},
    replayEvents: Array.from({length: 8}, (_, index) => ({
      type: "party.update",
      targetAccountIds: ["acc_a"],
      eventSeq: index + 1,
    })),
  });
  const hub = createTestEventHub(service, {maxQueuedFrames: 5});
  const socket = new FakeSocket([false]);
  await openFakeConnection(hub, "token_a", socket, {cursorPresent: true, lastEventSeq: 0});
  await Promise.resolve();
  assert.equal(socket.destroyed, true);
  assert.equal(hub.clientCount(), 0);
  assert.equal(hub.metrics().peakQueuedFrames, 10);
  assert.equal(hub.metrics().slowConsumerDisconnects, 1);
  await hub.close();
});

test("blocked bootstrap replay and subsequently published live events share one frame budget", () => {
  const socket = new FakeSocket([true, false]);
  let slowReason = "";
  const writer = createEventHubWriter(socket, {
    paused: true,
    maxQueuedFrames: 4,
    onSlowConsumer: (reason) => { slowReason = reason; },
  });
  assert.equal(writer.startBootstrap([
    {type: "events.ready"},
    {type: "online.snapshot"},
    {type: "party.update", eventSeq: 1},
    {type: "party.update", eventSeq: 2},
  ]), true);
  assert.equal(writer.metrics().blocked, true);
  assert.equal(writer.metrics().replayFramesRemaining, 2);
  assert.equal(writer.enqueue({type: "battle.invite", eventSeq: 3}), true);
  assert.equal(writer.enqueue({type: "party.update", eventSeq: 4}), true);
  assert.equal(writer.metrics().queuedFrames, 4);
  assert.equal(writer.enqueue({type: "party.update", eventSeq: 5}), false);
  assert.equal(socket.destroyed, true);
  assert.equal(slowReason, "outbound_frames_exceeded");
});

function productionUpgradeRequest(token, socket, overrides = {}) {
  const headers = {
    connection: "keep-alive, Upgrade",
    upgrade: "websocket",
    "sec-websocket-version": "13",
    "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
    authorization: `Bearer ${token}`,
    ...(overrides.headers || {}),
  };
  return {
    method: overrides.method || "GET",
    url: overrides.url || `/events?clientVersion=event-hub-test&clientProtocolVersion=${PROTOCOL_VERSION}`,
    headers,
    socket,
  };
}

function testSubprotocolRequest(token, socket, overrides = {}) {
  const request = productionUpgradeRequest(PRODUCTION_TOKEN_A, socket, overrides);
  delete request.headers.authorization;
  request.headers["sec-websocket-protocol"] = `${TEST_AUTH_SUBPROTOCOL}, ${token}`;
  return request;
}

function httpResponse(socket) {
  return socket.writes.filter((value) => typeof value === "string").join("");
}

function serverFrames(socket) {
  return socket.writes.filter(Buffer.isBuffer).map(decodeServerFrame);
}

function serverCloseCode(socket) {
  const frame = serverFrames(socket).findLast((candidate) => candidate.opcode === 0x8);
  return frame && frame.payload.length >= 2 ? frame.payload.readUInt16BE(0) : null;
}

function clientFrame(opcode, payload = Buffer.alloc(0), options = {}) {
  const data = Buffer.from(payload);
  const fin = options.fin !== false;
  const reservedBits = Number(options.reservedBits || 0) & 0x70;
  const masked = options.masked !== false;
  const first = (fin ? 0x80 : 0) | reservedBits | (opcode & 0x0F);
  let header;
  if (data.length < 126) {
    header = Buffer.from([first, (masked ? 0x80 : 0) | data.length]);
  } else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = first;
    header[1] = (masked ? 0x80 : 0) | 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = first;
    header[1] = (masked ? 0x80 : 0) | 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  if (!masked) {
    return Buffer.concat([header, data]);
  }
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  const encoded = Buffer.alloc(data.length);
  for (let index = 0; index < data.length; index += 1) {
    encoded[index] = data[index] ^ mask[index % 4];
  }
  return Buffer.concat([header, mask, encoded]);
}

async function testAdmissionLimit(label, options, reason, status, identityOptions = {}) {
  const firstIdentity = identity("acc_limit_a", "sess_limit_a", "limit-a");
  const secondIdentity = identityOptions.sameSession
    ? identity("acc_limit_a", "sess_limit_a", "limit-a")
    : identityOptions.sameAccount
      ? identity("acc_limit_a", "sess_limit_b", "limit-b")
      : identity("acc_limit_b", "sess_limit_b", "limit-b");
  const secondToken = identityOptions.sameToken ? PRODUCTION_TOKEN_A : PRODUCTION_TOKEN_B;
  const service = createFakeEventService({
    sessions: {
      [PRODUCTION_TOKEN_A]: firstIdentity,
      [PRODUCTION_TOKEN_B]: secondIdentity,
    },
  });
  const hub = createEventHub(service, {eventStreamEpoch: TEST_EVENT_STREAM_EPOCH, ...options});
  const firstSocket = new FakeSocket();
  const secondSocket = new FakeSocket();
  const replacementSocket = new FakeSocket();
  try {
    await hub.handleUpgrade(productionUpgradeRequest(PRODUCTION_TOKEN_A, firstSocket), firstSocket);
    assert.equal(hub.metrics().establishedConnections, 1, `${label}: first connection`);
    await hub.handleUpgrade(productionUpgradeRequest(secondToken, secondSocket), secondSocket);
    assert.match(httpResponse(secondSocket), new RegExp(`^HTTP/1\\.1 ${status} `), label);
    assert.equal(hub.metrics().upgradeRejectReasons[reason], 1, label);
    assert.equal(hub.metrics().establishedConnections, 1, `${label}: rejected connection not counted`);
    firstSocket.destroy();
    assertAdmissionCleared(hub.metrics(), `${label}: disconnect releases capacity`);
    await hub.handleUpgrade(productionUpgradeRequest(secondToken, replacementSocket), replacementSocket);
    assert.equal(hub.metrics().establishedConnections, 1, `${label}: released capacity is reusable`);
  } finally {
    firstSocket.destroy();
    secondSocket.destroy();
    replacementSocket.destroy();
    assertAdmissionCleared(hub.metrics(), `${label}: final disconnect releases capacity`);
    await hub.close();
  }
}

async function testPendingAdmissionLimit(options, reason, status) {
  let releaseAuthorization;
  const authorizationGate = new Promise((resolve) => { releaseAuthorization = resolve; });
  const identities = {
    [PRODUCTION_TOKEN_A]: identity("acc_pending_a", "sess_pending_a", "pending-a"),
    [PRODUCTION_TOKEN_B]: identity("acc_pending_b", "sess_pending_b", "pending-b"),
  };
  const service = createFakeEventService({
    sessions: identities,
    getEventSession(token) {
      return authorizationGate.then(() => ({
        ok: true,
        account: identities[token].account,
        session: identities[token].session,
      }));
    },
  });
  const hub = createEventHub(service, {eventStreamEpoch: TEST_EVENT_STREAM_EPOCH, ...options});
  const firstSocket = new FakeSocket();
  const secondSocket = new FakeSocket();
  let firstUpgrade = null;
  try {
    firstUpgrade = hub.handleUpgrade(productionUpgradeRequest(PRODUCTION_TOKEN_A, firstSocket), firstSocket);
    await waitUntil(() => hub.metrics().pendingUpgrades === 1, 200);
    await hub.handleUpgrade(productionUpgradeRequest(PRODUCTION_TOKEN_B, secondSocket), secondSocket);
    assert.match(httpResponse(secondSocket), new RegExp(`^HTTP/1\\.1 ${status} `), reason);
    assert.equal(hub.metrics().upgradeRejectReasons[reason], 1, reason);
    assert.equal(hub.metrics().pendingUpgrades, 1, reason);
  } finally {
    releaseAuthorization();
    if (firstUpgrade) {
      await firstUpgrade;
    }
    firstSocket.destroy();
    secondSocket.destroy();
    assertAdmissionCleared(hub.metrics(), `${reason}: admission released`);
    await hub.close();
  }
}

async function testHandshakeDisconnectRelease() {
  let releaseReplay;
  const replayGate = new Promise((resolve) => { releaseReplay = resolve; });
  const service = createFakeEventService({
    sessions: {[PRODUCTION_TOKEN_A]: identity("acc_aborted", "sess_aborted", "aborted")},
    replayResult() {
      return replayGate;
    },
  });
  const hub = createEventHub(service, {eventStreamEpoch: TEST_EVENT_STREAM_EPOCH});
  const socket = new FakeSocket();
  let upgrade = null;
  try {
    upgrade = hub.handleUpgrade(productionUpgradeRequest(PRODUCTION_TOKEN_A, socket), socket);
    await waitUntil(() => (
      hub.metrics().pendingUpgrades === 1
      && hub.metrics().establishedConnections === 1
    ), 200);
    socket.destroy();
    assertAdmissionCleared(hub.metrics(), "aborted replay releases all admission immediately");
    assert.equal(hub.metrics().acceptedUpgrades, 0);
  } finally {
    releaseReplay({ok: true, events: [], earliestEventSeq: 1, latestEventSeq: 0});
    if (upgrade) {
      await upgrade;
    }
    socket.destroy();
    await hub.close();
  }
}

function assertAdmissionCleared(metrics, label) {
  for (const field of [
    "connections",
    "pendingUpgrades",
    "pendingIpKeys",
    "establishedConnections",
    "establishedIpKeys",
    "establishedAccountKeys",
    "establishedSessionKeys",
    "establishedTokenKeys",
  ]) {
    assert.equal(metrics[field], 0, `${label}: ${field}`);
  }
}

async function waitUntil(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (predicate()) {
      return;
    }
    await delay(2);
  }
  assert.fail(`condition not met within ${timeoutMs}ms`);
}

function rawUpgradeRequest(token) {
  return [
    `GET /events?clientVersion=event-hub-test&clientProtocolVersion=${PROTOCOL_VERSION} HTTP/1.1`,
    "Host: 127.0.0.1",
    "Connection: Upgrade",
    "Upgrade: websocket",
    "Sec-WebSocket-Version: 13",
    "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
    `Authorization: Bearer ${token}`,
    "",
    "",
  ].join("\r\n");
}

class FakeSocket extends EventEmitter {
  constructor(writeResults = []) {
    super();
    this.writeResults = writeResults.slice();
    this.writes = [];
    this.destroyed = false;
    this.ended = false;
    this.writableNeedDrain = false;
    this.writableLength = 0;
    this.remoteAddress = "127.0.0.1";
    this.keepAlive = null;
  }

  write(value) {
    this.writes.push(Buffer.isBuffer(value) ? Buffer.from(value) : String(value));
    const result = this.writeResults.length > 0 ? this.writeResults.shift() : true;
    if (result === false) {
      this.writableNeedDrain = true;
    }
    return result;
  }

  drain() {
    this.writableNeedDrain = false;
    this.writableLength = 0;
    this.emit("drain");
  }

  end(value) {
    if (value !== undefined) this.write(value);
    this.ended = true;
    this.destroy();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit("close");
  }

  clearWrites() {
    this.writes.length = 0;
  }

  setKeepAlive(enabled, initialDelay) {
    this.keepAlive = {enabled, initialDelay};
  }
}

class ReferenceFakeSocket extends FakeSocket {
  write(value) {
    this.writes.push(Buffer.isBuffer(value) ? value : String(value));
    const result = this.writeResults.length > 0 ? this.writeResults.shift() : true;
    if (result === false) {
      this.writableNeedDrain = true;
    }
    return result;
  }
}

function createFakeEventService(options = {}) {
  const listeners = new Set();
  const sessions = options.sessions || {};
  const aoiByToken = options.aoiByToken || {};
  const service = {
    durableCalls: [],
    battleConnectionCalls: [],
    eventConnectionCalls: [],
    eventConnectionIdentities: [],
    eventProjectionCalls: 0,
    eventSessionCalls: 0,
    replayCalls: 0,
    replayPayloads: [],
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(event) {
      for (const listener of listeners) listener(event);
    },
    getEventSession(token) {
      service.eventSessionCalls += 1;
      if (typeof options.getEventSession === "function") {
        return options.getEventSession(token, service.eventSessionCalls);
      }
      const value = sessions[token];
      if (!value) return {ok: false, code: "session_missing"};
      return {
        ok: true,
        account: value.account,
        session: value.session,
        activeBattleRoom: Boolean(value.activeBattleRoom || options.activeBattleRoom),
        needsRepair: typeof options.needsRepair === "function" ? options.needsRepair(token) : false,
      };
    },
    listOnlinePlayers(token) {
      if (typeof options.listOnlinePlayers === "function") {
        return options.listOnlinePlayers(token);
      }
      return {ok: true, players: [], party: null, aoi: aoiByToken[token] || {scope: "all"}};
    },
    listEventsForSession(token, payload) {
      service.replayCalls += 1;
      service.replayPayloads.push({...payload});
      if (typeof options.replayResult === "function") {
        return options.replayResult(token, payload, service.replayCalls);
      }
      const events = options.replayEvents || [];
      const latestEventSeq = options.latestEventSeq ?? events.reduce(
        (maximum, event) => Math.max(maximum, Number(event && event.eventSeq || 0)),
        0,
      );
      return {
        ok: true,
        events,
        earliestEventSeq: options.earliestEventSeq ?? (
          events.length > 0 ? Number(events[0].eventSeq || 0) : latestEventSeq + 1
        ),
        latestEventSeq,
      };
    },
    eventForConnection(connection, event, projectionCache = null) {
      service.eventProjectionCalls += 1;
      service.eventConnectionIdentities.push(connection);
      if (event.type === "session.replaced") {
        return {
          ok: true,
          visible: event.targetSessionIds.includes(connection.sessionId),
          event,
          activeBattleRoom: Boolean(options.activeBattleRoom),
        };
      }
      let projectedEvent = event.type === "online.position"
        ? {...event, change: event.change || "upsert", aoi: aoiByToken[tokenForSession(sessions, connection.sessionId)]}
        : event;
      if (typeof options.projectEvent === "function") {
        projectedEvent = options.projectEvent(connection, event, projectedEvent, projectionCache);
      }
      return {
        ok: true,
        visible: true,
        event: projectedEvent,
        activeBattleRoom: Boolean(options.activeBattleRoom),
      };
    },
    eventConnectionState() {
      return {ok: true, activeBattleRoom: Boolean(options.activeBattleRoom)};
    },
    markEventConnection(connection, connected) {
      service.eventConnectionCalls.push({sessionId: connection.sessionId, connected: Boolean(connected)});
      return {ok: true};
    },
    markBattleConnection(token, connected) {
      service.battleConnectionCalls.push({token, connected});
      return {ok: true};
    },
    markBattleConnectionForEventConnection(connection, connected) {
      service.battleConnectionCalls.push({
        accountId: connection.accountId,
        sessionId: connection.sessionId,
        connected: Boolean(connected),
      });
      const configured = Array.isArray(options.battleTransitionResults)
        ? options.battleTransitionResults.shift()
        : undefined;
      return configured === undefined ? {ok: true} : configured;
    },
    invokeDurable(methodName, args, operation) {
      service.durableCalls.push({methodName, args, operation});
      if (typeof options.onDurable === "function") options.onDurable(methodName, args, operation);
      if (methodName === "getSession") return Promise.resolve({ok: true});
      if (methodName === "markBattleConnection") {
        return Promise.resolve(service.markBattleConnection(args[0], args[1]));
      }
      if (methodName === "markBattleConnectionForEventConnection") {
        return Promise.resolve(service.markBattleConnectionForEventConnection(args[0], args[1]));
      }
      return Promise.resolve({ok: true});
    },
  };
  return service;
}

function identity(accountId, sessionId, username) {
  return {
    account: {accountId, username, displayName: username},
    session: {accountId, sessionId},
  };
}

function aoi(mapId, cellX, cellY, radius = 18) {
  return {scope: "aoi", mapId, cellX, cellY, radius};
}

function positionSourceEvent(accountId, revision, displayName) {
  const position = {
    mapId: "map_a",
    cellX: 10 + revision,
    cellY: 10,
    facing: "east",
    moving: true,
    hasCell: true,
  };
  return {
    type: "online.position",
    accountId,
    previousPosition: {...position, cellX: position.cellX - 1},
    position,
    player: {
      accountId,
      username: accountId,
      displayName,
      partyId: "",
      partyRole: "",
      position: {...position},
    },
    presenceRevision: revision,
    schemaVersion: 1,
    createdAt: "2026-07-13T00:00:00.000Z",
  };
}

function projectV10PositionForFake(connection, event, projected) {
  if (!event || event.type !== "online.position") {
    return projected;
  }
  if (connection.accountId === event.accountId) {
    return projectOnlinePositionRebase({
      event,
      aoi: projected.aoi,
      presenceRebase: {upserts: [], removedAccountIds: []},
    });
  }
  return projectOnlinePositionDelta({
    event,
    viewerAccountId: connection.accountId,
    currentVisible: true,
    previousVisible: true,
  }).event;
}

function tokenForSession(sessions, sessionId) {
  return Object.keys(sessions).find((token) => sessions[token].session.sessionId === sessionId) || "";
}

function createTestEventHub(service, options = {}) {
  return createEventHub(service, {
    allowTestSubprotocolAuth: true,
    eventStreamEpoch: TEST_EVENT_STREAM_EPOCH,
    positionBatchWindowMs: 0,
    ...options,
  });
}

async function openFakeConnection(hub, token, socket, options = {}) {
  const query = new URLSearchParams({
    clientVersion: "event-hub-test",
    clientProtocolVersion: String(PROTOCOL_VERSION),
  });
  if (options.cursorPresent) {
    query.set("lastEventSeq", String(options.lastEventSeq ?? 0));
    query.set("eventStreamEpoch", String(options.eventStreamEpoch || TEST_EVENT_STREAM_EPOCH));
  }
  return hub.handleUpgrade({
    method: "GET",
    url: `/events?${query.toString()}`,
    headers: {
      connection: "Upgrade",
      upgrade: "websocket",
      "sec-websocket-version": "13",
      "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
      "sec-websocket-protocol": `${TEST_AUTH_SUBPROTOCOL}, ${token}`,
    },
    socket,
  }, socket, options.head || Buffer.alloc(0));
}

function jsonMessages(socket) {
  return socket.writes
    .filter(Buffer.isBuffer)
    .map(decodeServerFrame)
    .filter((frame) => frame.opcode === 0x1)
    .map((frame) => JSON.parse(frame.payload.toString("utf8")));
}

function decodeServerFrame(frame) {
  const opcode = frame[0] & 0x0F;
  let length = frame[1] & 0x7F;
  let offset = 2;
  if (length === 126) {
    length = frame.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    length = Number(frame.readBigUInt64BE(offset));
    offset += 8;
  }
  return {opcode, payload: frame.subarray(offset, offset + length)};
}

function encodedEventBytes(event) {
  return encodeFrame(0x1, Buffer.from(JSON.stringify(event), "utf8")).length;
}

function nextImmediate() {
  return new Promise((resolve) => setImmediate(resolve));
}

function pickWriterQueueMetrics(metrics) {
  return {
    queuedFrames: metrics.queuedFrames,
    queuedBytes: metrics.queuedBytes,
    applicationQueuedBytes: metrics.applicationQueuedBytes,
    bufferedBytes: metrics.bufferedBytes,
    blocked: metrics.blocked,
    paused: metrics.paused,
    accepting: metrics.accepting,
    disposed: metrics.disposed,
  };
}

function eventWithEncodedSize(targetBytes) {
  let payloadLength = Math.max(0, targetBytes - 64);
  let event = {type: "bulk", payload: "x".repeat(payloadLength)};
  let encodedBytes = encodedEventBytes(event);
  while (encodedBytes < targetBytes) {
    payloadLength += targetBytes - encodedBytes;
    event = {type: "bulk", payload: "x".repeat(payloadLength)};
    encodedBytes = encodedEventBytes(event);
  }
  while (encodedBytes > targetBytes) {
    payloadLength -= encodedBytes - targetBytes;
    event = {type: "bulk", payload: "x".repeat(payloadLength)};
    encodedBytes = encodedEventBytes(event);
  }
  return event;
}
