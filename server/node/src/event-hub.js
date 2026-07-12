"use strict";

const crypto = require("node:crypto");
const {
  protocolCompatibility,
  protocolMetadata,
  protocolMismatchResult,
} = require("./protocol");
const {
  createEventSubscriptionIndex,
} = require("./event-hub-subscriptions");
const {
  createEventHubWriter,
  encodeFrame,
} = require("./event-hub-writer");

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function createEventHub(service, options = {}) {
  const clients = new Set();
  const subscriptions = createEventSubscriptionIndex({
    bucketSize: options.bucketSize,
    maxAoiRadius: options.maxAoiRadius,
  });
  const battleAcknowledgedAccounts = new Set();
  const battleDesiredStates = new Map();
  const battleTransitions = new Map();
  const eventConnectionCounts = new Map();
  const totals = {
    currentQueuedFrames: 0,
    currentBufferedBytes: 0,
    peakQueuedFrames: 0,
    peakQueuedBytes: 0,
    maxClientQueuedFrames: 0,
    maxClientQueuedBytes: 0,
    sentFrames: 0,
    sentBytes: 0,
    presenceCoalesced: 0,
    slowConsumerDisconnects: 0,
  };
  let closing = false;
  let closePromise = null;
  const unsubscribe = service && typeof service.onEvent === "function"
    ? service.onEvent((event) => publish(event))
    : () => {};

  async function handleUpgrade(req, socket) {
    if (closing) {
      writeHttpError(socket, 503, "server shutting down");
      return true;
    }
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname !== "/events") {
      writeHttpError(socket, 404, "not found");
      return false;
    }
    const protocol = protocolCompatibility(req, url);
    if (!protocol.ok) {
      writeHttpError(socket, 426, "protocol version mismatch", protocolMismatchResult(protocol));
      return true;
    }
    const token = url.searchParams.get("token") || "";
    const modernSessionBoundary = Boolean(service && typeof service.getEventSession === "function");
    const authorized = await authorizeEventSession(service, token, modernSessionBoundary);
    if (closing) {
      writeHttpError(socket, 503, "server shutting down");
      return true;
    }
    if (!authorized.ok) {
      writeHttpError(socket, 401, "unauthorized");
      return true;
    }
    const key = String(req.headers["sec-websocket-key"] || "");
    if (!key) {
      writeHttpError(socket, 400, "missing websocket key");
      return true;
    }
    const accept = crypto.createHash("sha1").update(key + WS_GUID).digest("base64");
    const handshakeWritable = socket.write([
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "",
      "",
    ].join("\r\n"));
    const account = authorized.account || {};
    const session = authorized.session && typeof authorized.session === "object" ? authorized.session : {};
    const lastEventSeq = normalizeEventSeq(url.searchParams.get("lastEventSeq") || url.searchParams.get("afterSeq") || "0");
    const client = {
      socket,
      writer: null,
      accountId: String(account.accountId || session.accountId || ""),
      sessionId: String(session.sessionId || authorized.sessionId || ""),
      username: String(account.username || ""),
      token,
      buffer: Buffer.alloc(0),
      lastSentEventSeq: lastEventSeq,
      queuedEventSeqs: new Set(),
      initializing: true,
      modernSessionBoundary,
      cleanup: null,
      dataHandler: null,
      closeHandler: null,
      errorHandler: null,
      reportedQueuedFrames: 0,
      reportedBufferedBytes: 0,
    };
    client.writer = createEventHubWriter(socket, {
      paused: true,
      initiallyBlocked: handshakeWritable === false,
      maxQueuedFrames: options.maxQueuedFrames,
      maxQueuedBytes: options.maxQueuedBytes,
      backpressureTimeoutMs: options.backpressureTimeoutMs,
      onFrameSent(bytes, event) {
        totals.sentFrames += 1;
        totals.sentBytes += bytes;
        const eventSeq = normalizeEventSeq(event && event.eventSeq);
        if (eventSeq > 0) {
          client.queuedEventSeqs.delete(eventSeq);
          client.lastSentEventSeq = Math.max(client.lastSentEventSeq, eventSeq);
        }
      },
      onPresenceCoalesced(_accountId, previousEvent) {
        totals.presenceCoalesced += 1;
        const previousSeq = normalizeEventSeq(previousEvent && previousEvent.eventSeq);
        if (previousSeq > 0) {
          client.queuedEventSeqs.delete(previousSeq);
        }
      },
      onQueuedFramesChanged(frames) {
        const nextFrames = Math.max(0, Number(frames || 0));
        totals.currentQueuedFrames = Math.max(
          0,
          totals.currentQueuedFrames - client.reportedQueuedFrames + nextFrames,
        );
        client.reportedQueuedFrames = nextFrames;
        totals.peakQueuedFrames = Math.max(totals.peakQueuedFrames, totals.currentQueuedFrames);
        totals.maxClientQueuedFrames = Math.max(totals.maxClientQueuedFrames, nextFrames);
      },
      onBufferedBytesChanged(bytes) {
        const nextBytes = Math.max(0, Number(bytes || 0));
        totals.currentBufferedBytes = Math.max(
          0,
          totals.currentBufferedBytes - client.reportedBufferedBytes + nextBytes,
        );
        client.reportedBufferedBytes = nextBytes;
        totals.peakQueuedBytes = Math.max(totals.peakQueuedBytes, totals.currentBufferedBytes);
        totals.maxClientQueuedBytes = Math.max(totals.maxClientQueuedBytes, nextBytes);
      },
      onSlowConsumer() {
        totals.slowConsumerDisconnects += 1;
        queueMicrotask(() => cleanupClient(client));
      },
    });
    clients.add(client);
    subscriptions.register(client);
    client.dataHandler = (chunk) => handleSocketData(client, chunk);
    client.closeHandler = () => cleanupClient(client);
    client.errorHandler = () => terminateClient(client);
    client.cleanup = client.closeHandler;
    socket.on("data", client.dataHandler);
    socket.on("close", client.closeHandler);
    socket.on("error", client.errorHandler);

    if (!markEventStreamConnection(client, true)) {
      terminateClient(client);
      return true;
    }
    const initialBattleRoom = Boolean(authorized.activeBattleRoom || !modernSessionBoundary);
    const battleConnectionReady = await setBattleConnectionState(client, initialBattleRoom);
    if (initialBattleRoom && !battleConnectionReady) {
      terminateClient(client);
      return true;
    }

    const online = modernSessionBoundary
      ? await Promise.resolve(service.listOnlinePlayers(token, {scope: "aoi"}))
      : await invokeEventService(service, "listOnlinePlayers", [token, {scope: "aoi"}], "ws_online_snapshot");
    if (!clients.has(client) || socket.destroyed) {
      return true;
    }
    if (!online || !online.ok) {
      terminateClient(client);
      return true;
    }
    subscriptions.update(client, online.aoi);

    const ready = {
      type: "events.ready",
      account,
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      ...protocolMetadata(),
    };
    const snapshot = {
      type: "online.snapshot",
      players: online.players,
      party: online.party,
      aoi: online.aoi,
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
    };
    const replay = replayEventsForClient(client, lastEventSeq);
    if (!replay.ok) {
      terminateClient(client);
      return true;
    }
    const bootstrap = [ready, snapshot, ...replay.events];
    for (const event of replay.events) {
      const eventSeq = normalizeEventSeq(event && event.eventSeq);
      if (eventSeq > 0) {
        client.queuedEventSeqs.add(eventSeq);
      }
    }
    client.initializing = false;
    if (!client.writer.startBootstrap(bootstrap)) {
      terminateClient(client);
      return true;
    }
    return true;
  }

  function publish(event) {
    const candidates = subscriptions.candidates(event, clients);
    for (const client of candidates) {
      if (!clients.has(client) || client.closing || !client.socket || client.socket.destroyed) {
        continue;
      }
      if (!subscriptions.positionEventMayBeVisible(client, event)) {
        continue;
      }
      const prepared = eventForClient(client, event);
      if (!prepared.ok) {
        terminateClient(client);
        continue;
      }
      if (prepared.hasActiveBattleRoom) {
        setBattleConnectionState(client, prepared.activeBattleRoom);
      }
      if (!prepared.visible) {
        continue;
      }
      const outgoing = prepared.event || event;
      if (isPositionEvent(outgoing) && String(client.accountId || "") === String(outgoing.accountId || "")) {
        subscriptions.update(client, outgoing.aoi || event && event.aoi || outgoing.position);
      }
      queueClientEvent(client, outgoing);
      if (sessionReplacementTargetsClient(outgoing, client)) {
        client.closing = true;
        subscriptions.unregister(client);
        client.writer.requestCloseAfterFlush();
      }
    }
  }

  function eventForClient(client, event) {
    let result;
    if (service && typeof service.eventForConnection === "function") {
      result = service.eventForConnection(eventConnectionIdentity(client), event);
    } else if (service && typeof service.eventForSession === "function") {
      result = service.eventForSession(client.token, event);
    } else {
      result = {ok: true, visible: true, event};
    }
    if (!result || typeof result.then === "function" || result.ok === false) {
      return {ok: false, visible: false, event};
    }
    return {
      ok: true,
      visible: result.visible !== false,
      event: result.event || event,
      hasActiveBattleRoom: Object.hasOwn(result, "activeBattleRoom"),
      activeBattleRoom: Boolean(result.activeBattleRoom),
    };
  }

  function replayEventsForClient(client, lastEventSeq) {
    if (!service || typeof service.listEventsForSession !== "function") {
      return {ok: true, events: []};
    }
    const replay = service.listEventsForSession(client.token, {afterSeq: lastEventSeq});
    if (!replay || !replay.ok || !Array.isArray(replay.events)) {
      return {ok: false, events: []};
    }
    const events = [];
    for (const event of replay.events) {
      const eventSeq = normalizeEventSeq(event && event.eventSeq);
      if (eventSeq > 0 && (
        eventSeq <= normalizeEventSeq(client.lastSentEventSeq)
        || client.queuedEventSeqs.has(eventSeq)
      )) {
        continue;
      }
      events.push(event);
    }
    return {ok: true, events};
  }

  function queueClientEvent(client, event) {
    if (!client || !client.writer) {
      return false;
    }
    const eventSeq = normalizeEventSeq(event && event.eventSeq);
    if (eventSeq > 0) {
      if (eventSeq <= normalizeEventSeq(client.lastSentEventSeq) || client.queuedEventSeqs.has(eventSeq)) {
        return true;
      }
      client.queuedEventSeqs.add(eventSeq);
    }
    const coalesceKey = isCoalesciblePositionEvent(event) ? String(event.accountId || "") : "";
    const queued = client.writer.enqueue(event, {coalesceKey});
    if (!queued && eventSeq > 0) {
      client.queuedEventSeqs.delete(eventSeq);
    }
    return queued;
  }

  function setBattleConnectionState(client, activeBattleRoom) {
    const accountId = String(client && client.accountId || "");
    if (!accountId) {
      return true;
    }
    const requestedState = Boolean(activeBattleRoom);
    const existingDesired = battleDesiredStates.get(accountId);
    if (
      existingDesired
      && existingDesired.connected === requestedState
      && !battleTransitions.has(accountId)
      && battleAcknowledgedAccounts.has(accountId) === requestedState
    ) {
      return true;
    }
    battleDesiredStates.set(accountId, {
      connected: requestedState,
      identity: clientIdentity(client),
      token: client.token,
    });
    if (battleTransitions.has(accountId)) {
      return battleTransitions.get(accountId);
    }
    if (battleAcknowledgedAccounts.has(accountId) === requestedState) {
      return true;
    }
    const transition = Promise.resolve().then(async () => {
      while (true) {
        const desired = battleDesiredStates.get(accountId);
        if (!desired) {
          return true;
        }
        const acknowledged = battleAcknowledgedAccounts.has(accountId);
        if (acknowledged === desired.connected) {
          return true;
        }
        const applied = await markBattleConnection(
          service,
          desired.identity,
          desired.token,
          desired.connected,
        );
        if (!applied) {
          return false;
        }
        if (desired.connected) {
          battleAcknowledgedAccounts.add(accountId);
        } else {
          battleAcknowledgedAccounts.delete(accountId);
        }
      }
    }).finally(() => {
      battleTransitions.delete(accountId);
      const hasConnection = Array.from(clients).some((candidate) => candidate.accountId === accountId);
      if (!hasConnection && !battleAcknowledgedAccounts.has(accountId)) {
        battleDesiredStates.delete(accountId);
      }
    });
    battleTransitions.set(accountId, transition);
    return transition;
  }

  function cleanupClient(client) {
    if (!client || !clients.delete(client)) {
      return Promise.resolve();
    }
    subscriptions.unregister(client);
    detachClientSocketListeners(client);
    if (client.writer) {
      client.writer.dispose();
    }
    markEventStreamConnection(client, false);
    const accountId = String(client.accountId || "");
    const hasAnotherConnection = Array.from(clients).some((candidate) => candidate.accountId === accountId);
    if (hasAnotherConnection) {
      return Promise.resolve();
    }
    let activeBattleRoom = battleAcknowledgedAccounts.has(accountId)
      || battleTransitions.has(accountId)
      || Boolean(battleDesiredStates.get(accountId) && battleDesiredStates.get(accountId).connected);
    if (!activeBattleRoom && service && typeof service.eventConnectionState === "function") {
      try {
        const state = service.eventConnectionState(clientIdentity(client));
        activeBattleRoom = Boolean(state && state.ok && state.activeBattleRoom);
      } catch {
        activeBattleRoom = false;
      }
    }
    if (!activeBattleRoom) {
      battleDesiredStates.delete(accountId);
      return Promise.resolve();
    }
    return Promise.resolve(setBattleConnectionState(client, false)).finally(() => {
      const connectionRemains = Array.from(clients).some((candidate) => candidate.accountId === accountId);
      if (
        !connectionRemains
        && !battleTransitions.has(accountId)
        && !battleAcknowledgedAccounts.has(accountId)
      ) {
        battleDesiredStates.delete(accountId);
      }
    });
  }

  function terminateClient(client) {
    const cleanup = cleanupClient(client);
    try {
      if (client && client.socket && !client.socket.destroyed) {
        client.socket.destroy();
      }
    } catch {
      // A failed socket destroy must not leak the indexes or shutdown drain.
    }
    return cleanup;
  }

  function markEventStreamConnection(client, connected) {
    if (!service || typeof service.markEventConnection !== "function") {
      return true;
    }
    const sessionId = String(client && client.sessionId || "");
    if (!sessionId) {
      return false;
    }
    const previousCount = Number(eventConnectionCounts.get(sessionId) || 0);
    if (connected) {
      eventConnectionCounts.set(sessionId, previousCount + 1);
      if (previousCount > 0) {
        return true;
      }
    } else if (previousCount > 1) {
      eventConnectionCounts.set(sessionId, previousCount - 1);
      return true;
    } else {
      eventConnectionCounts.delete(sessionId);
      if (previousCount <= 0) {
        return true;
      }
    }
    try {
      const result = service.markEventConnection(clientIdentity(client), connected);
      if (result && typeof result.then !== "function" && result.ok !== false) {
        return true;
      }
    } catch {
      // Roll back the local reference transition below.
    }
    if (connected) {
      eventConnectionCounts.delete(sessionId);
    }
    return false;
  }

  function close() {
    if (closePromise !== null) {
      return closePromise;
    }
    closing = true;
    try {
      unsubscribe();
    } catch {
      // Shutdown must still disconnect and drain the accepted clients.
    }
    const disconnects = Array.from(clients).map((client) => terminateClient(client));
    closePromise = Promise.allSettled(disconnects).then(() => undefined);
    return closePromise;
  }

  function clientCount() {
    return clients.size;
  }

  function metrics() {
    let backpressureConnections = 0;
    let queuedFrames = 0;
    let queuedBytes = 0;
    for (const client of clients) {
      const writerMetrics = client.writer ? client.writer.metrics() : {};
      if (writerMetrics.blocked) {
        backpressureConnections += 1;
      }
      queuedFrames += Number(writerMetrics.queuedFrames || 0);
      queuedBytes += Number(writerMetrics.queuedBytes || 0);
    }
    return Object.freeze({
      connections: clients.size,
      backpressureConnections,
      queuedFrames,
      queuedBytes,
      peakQueuedFrames: totals.peakQueuedFrames,
      peakQueuedBytes: totals.peakQueuedBytes,
      maxClientQueuedFrames: totals.maxClientQueuedFrames,
      maxClientQueuedBytes: totals.maxClientQueuedBytes,
      sentFrames: totals.sentFrames,
      sentBytes: totals.sentBytes,
      presenceCoalesced: totals.presenceCoalesced,
      slowConsumerDisconnects: totals.slowConsumerDisconnects,
    });
  }

  return {
    handleUpgrade,
    publish,
    close,
    clientCount,
    metrics,
  };
}

async function authorizeEventSession(service, token, modernSessionBoundary) {
  if (!modernSessionBoundary) {
    return invokeEventService(service, "getSession", [token], "ws_session");
  }
  let result = await Promise.resolve(service.getEventSession(token));
  if (!result || !result.ok || !result.needsRepair) {
    return result;
  }
  const repaired = await invokeEventService(service, "getSession", [token], "ws_session_repair");
  if (!repaired || !repaired.ok) {
    return repaired;
  }
  result = await Promise.resolve(service.getEventSession(token));
  return result;
}

function invokeEventService(service, methodName, args, actionId) {
  if (service && typeof service.invokeDurable === "function") {
    return service.invokeDurable(methodName, args, {actionId});
  }
  return Promise.resolve(service[methodName](...args));
}

function markBattleConnection(service, identity, token, connected) {
  const modernMethod = "markBattleConnectionForEventConnection";
  const useModernMethod = Boolean(service && typeof service[modernMethod] === "function");
  const methodName = useModernMethod ? modernMethod : "markBattleConnection";
  if (!service || typeof service[methodName] !== "function") {
    return Promise.resolve(true);
  }
  const args = useModernMethod ? [identity, connected] : [token, connected];
  try {
    const result = typeof service.invokeDurable === "function"
      ? service.invokeDurable(methodName, args, {
        actionId: connected ? "ws_battle_connect" : "ws_battle_disconnect",
      })
      : service[methodName](...args);
    return Promise.resolve(result).then(
      (value) => Boolean(value && value.ok),
      () => false,
    );
  } catch {
    // A later connection transition retries because failed results are not
    // committed into the local acknowledged-account set.
    return Promise.resolve(false);
  }
}

function handleSocketData(client, chunk) {
  client.buffer = Buffer.concat([client.buffer, chunk]);
  while (client.buffer.length >= 2) {
    const parsed = readFrame(client.buffer);
    if (!parsed) {
      return;
    }
    client.buffer = client.buffer.subarray(parsed.bytesRead);
    if (parsed.opcode === 0x8) {
      client.socket.end(encodeFrame(0x8, Buffer.alloc(0)));
      return;
    }
    if (parsed.opcode === 0x9 && client.writer) {
      client.writer.enqueueRaw(encodeFrame(0xA, parsed.payload));
    }
  }
}

function readFrame(buffer) {
  if (buffer.length < 2) {
    return null;
  }
  const opcode = buffer[0] & 0x0F;
  const masked = (buffer[1] & 0x80) !== 0;
  let length = buffer[1] & 0x7F;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < offset + 2) {
      return null;
    }
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    if (buffer.length < offset + 8) {
      return null;
    }
    const bigLength = buffer.readBigUInt64BE(offset);
    if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
      return null;
    }
    length = Number(bigLength);
    offset += 8;
  }
  let mask = null;
  if (masked) {
    if (buffer.length < offset + 4) {
      return null;
    }
    mask = buffer.subarray(offset, offset + 4);
    offset += 4;
  }
  if (buffer.length < offset + length) {
    return null;
  }
  const payload = Buffer.from(buffer.subarray(offset, offset + length));
  if (mask) {
    for (let index = 0; index < payload.length; index += 1) {
      payload[index] ^= mask[index % 4];
    }
  }
  return {
    opcode,
    payload,
    bytesRead: offset + length,
  };
}

function normalizeEventSeq(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return 0;
  }
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(number));
}

function clientIdentity(client) {
  return Object.freeze({
    accountId: String(client && client.accountId || ""),
    sessionId: String(client && client.sessionId || ""),
  });
}

function eventConnectionIdentity(client) {
  return Object.freeze({
    ...clientIdentity(client),
    aoi: client && client.presenceSubscription
      ? {...client.presenceSubscription}
      : null,
  });
}

function isPositionEvent(event) {
  return Boolean(event && String(event.type || "") === "online.position");
}

function isCoalesciblePositionEvent(event) {
  if (!isPositionEvent(event)) {
    return false;
  }
  const change = String(event.change || "").trim().toLowerCase();
  return change === "upsert" || change === "remove";
}

function sessionReplacementTargetsClient(event, client) {
  if (!event || event.type !== "session.replaced" || !Array.isArray(event.targetSessionIds)) {
    return false;
  }
  return event.targetSessionIds.map((value) => String(value || "")).includes(String(client && client.sessionId || ""));
}

function detachClientSocketListeners(client) {
  const socket = client && client.socket;
  if (!socket) {
    return;
  }
  removeSocketListener(socket, "data", client.dataHandler);
  removeSocketListener(socket, "close", client.closeHandler);
  removeSocketListener(socket, "error", client.errorHandler);
}

function removeSocketListener(socket, eventName, listener) {
  if (typeof listener !== "function") {
    return;
  }
  if (typeof socket.off === "function") {
    socket.off(eventName, listener);
  } else if (typeof socket.removeListener === "function") {
    socket.removeListener(eventName, listener);
  }
}

function writeHttpError(socket, status, message, body = null) {
  const text = body ? JSON.stringify(body) : "";
  const headers = [
    `HTTP/1.1 ${status} ${message}`,
    "Connection: close",
  ];
  if (text !== "") {
    headers.push("Content-Type: application/json; charset=utf-8");
  }
  headers.push(`Content-Length: ${Buffer.byteLength(text)}`);
  socket.write([
    ...headers,
    "",
    text,
  ].join("\r\n"));
  socket.destroy();
}

module.exports = {
  createEventHub,
};
