"use strict";

const assert = require("node:assert/strict");
const {EventEmitter} = require("node:events");
const {setTimeout: delay} = require("node:timers/promises");
const test = require("node:test");
const {createEventHub} = require("../src/event-hub");
const {
  DEFAULT_EVENT_HUB_WRITER_LIMITS,
  createEventHubWriter,
  encodeFrame,
} = require("../src/event-hub-writer");
const {createEventSubscriptionIndex} = require("../src/event-hub-subscriptions");
const {eventStreamUrl} = require("../test-support/auth-service-test-context");

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
  const hub = createEventHub(service);
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
  assert.deepEqual(jsonMessages(sockets.token_a).map((event) => event.type), ["online.position"]);
  assert.deepEqual(jsonMessages(sockets.token_b).map((event) => event.type), ["online.position"]);
  assert.deepEqual(jsonMessages(sockets.token_c), []);
  assert.equal(service.eventProjectionCalls, 2);

  service.eventProjectionCalls = 0;
  service.emit({type: "party.update", targetAccountIds: ["acc_c"], eventSeq: 4});
  assert.equal(jsonMessages(sockets.token_c).at(-1).type, "party.update");
  assert.equal(service.eventProjectionCalls, 1);
  assert.equal(service.durableCalls.length, 0);
  assert.deepEqual(hub.metrics(), {
    connections: 3,
    backpressureConnections: 0,
    queuedFrames: 0,
    queuedBytes: 0,
    peakQueuedFrames: hub.metrics().peakQueuedFrames,
    peakQueuedBytes: hub.metrics().peakQueuedBytes,
    maxClientQueuedFrames: hub.metrics().maxClientQueuedFrames,
    maxClientQueuedBytes: hub.metrics().maxClientQueuedBytes,
    sentFrames: 9,
    sentBytes: hub.metrics().sentBytes,
    presenceCoalesced: 0,
    slowConsumerDisconnects: 0,
  });
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
  const hub = createEventHub(service);
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
  const hub = createEventHub(service);
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
  const hub = createEventHub(service);
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
  const hub = createEventHub(service);
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
  const hub = createEventHub(service);
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
  const hub = createEventHub(service);
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

test("event hub keeps rebase deltas ordered, coalesces ordinary presence, and releases superseded event seqs", async () => {
  const service = createFakeEventService({
    sessions: {token_a: identity("acc_a", "sess_a", "a")},
    aoiByToken: {token_a: aoi("map_a", 10, 10)},
  });
  const hub = createEventHub(service);
  const socket = new FakeSocket();
  await openFakeConnection(hub, "token_a", socket);
  socket.clearWrites();
  socket.writeResults.push(false, true, true, true, true);
  service.emit({type: "party.update"});
  service.emit({type: "online.position", change: "rebase", accountId: "acc_a", position: {mapId: "map_a", cellX: 11, cellY: 10}, presenceRevision: 1});
  service.emit({type: "online.position", change: "rebase", accountId: "acc_a", position: {mapId: "map_a", cellX: 12, cellY: 10}, presenceRevision: 2});
  service.emit({type: "online.position", change: "upsert", accountId: "acc_remote", position: {mapId: "map_a", cellX: 12, cellY: 11}, presenceRevision: 1});
  service.emit({type: "online.position", change: "upsert", accountId: "acc_remote", position: {mapId: "map_a", cellX: 13, cellY: 11}, presenceRevision: 2});
  socket.drain();
  const positionEvents = jsonMessages(socket).filter((event) => event.type === "online.position");
  assert.deepEqual(positionEvents.map((event) => [event.change, event.accountId, event.presenceRevision]), [
    ["rebase", "acc_a", 1],
    ["rebase", "acc_a", 2],
    ["upsert", "acc_remote", 2],
  ]);

  socket.clearWrites();
  socket.writeResults.length = 0;
  socket.writeResults.push(false, true, true, true);
  service.emit({type: "party.update"});
  service.emit({type: "online.position", change: "upsert", accountId: "acc_remote", position: {mapId: "map_a", cellX: 13, cellY: 11}, presenceRevision: 3, eventSeq: 10});
  service.emit({type: "online.position", change: "remove", accountId: "acc_remote", previousPosition: {mapId: "map_a", cellX: 13, cellY: 11}, presenceRevision: 4});
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
  const hub = createEventHub(service, {maxQueuedFrames: 5});
  const socket = new FakeSocket();
  await openFakeConnection(hub, "token_a", socket);
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
  const hub = createEventHub(service, {maxQueuedFrames: 5});
  const socket = new FakeSocket([false]);
  await openFakeConnection(hub, "token_a", socket);
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

class FakeSocket extends EventEmitter {
  constructor(writeResults = []) {
    super();
    this.writeResults = writeResults.slice();
    this.writes = [];
    this.destroyed = false;
    this.ended = false;
    this.writableNeedDrain = false;
    this.writableLength = 0;
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
}

function createFakeEventService(options = {}) {
  const listeners = new Set();
  const sessions = options.sessions || {};
  const aoiByToken = options.aoiByToken || {};
  const service = {
    durableCalls: [],
    battleConnectionCalls: [],
    eventConnectionCalls: [],
    eventProjectionCalls: 0,
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(event) {
      for (const listener of listeners) listener(event);
    },
    getEventSession(token) {
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
      return {ok: true, players: [], party: null, aoi: aoiByToken[token] || {scope: "all"}};
    },
    listEventsForSession() {
      return {ok: true, events: options.replayEvents || []};
    },
    eventForConnection(connection, event) {
      service.eventProjectionCalls += 1;
      if (event.type === "session.replaced") {
        return {
          ok: true,
          visible: event.targetSessionIds.includes(connection.sessionId),
          event,
          activeBattleRoom: Boolean(options.activeBattleRoom),
        };
      }
      return {
        ok: true,
        visible: true,
        event: event.type === "online.position"
          ? {...event, change: event.change || "upsert", aoi: aoiByToken[tokenForSession(sessions, connection.sessionId)]}
          : event,
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

function tokenForSession(sessions, sessionId) {
  return Object.keys(sessions).find((token) => sessions[token].session.sessionId === sessionId) || "";
}

async function openFakeConnection(hub, token, socket) {
  const url = new URL(eventStreamUrl("ws://127.0.0.1", token));
  return hub.handleUpgrade({
    url: `${url.pathname}${url.search}`,
    headers: {"sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ=="},
  }, socket);
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
