"use strict";

const crypto = require("node:crypto");
const {
  protocolCompatibility,
  protocolMetadata,
  protocolMismatchResult,
} = require("./protocol");

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function createEventHub(service) {
  const clients = new Set();
  const unsubscribe = service && typeof service.onEvent === "function"
    ? service.onEvent((event) => publish(event))
    : () => {};

  function handleUpgrade(req, socket) {
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
    const session = service.getSession(token);
    if (!session.ok) {
      writeHttpError(socket, 401, "unauthorized");
      return true;
    }
    const key = String(req.headers["sec-websocket-key"] || "");
    if (!key) {
      writeHttpError(socket, 400, "missing websocket key");
      return true;
    }
    const accept = crypto.createHash("sha1").update(key + WS_GUID).digest("base64");
    socket.write([
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "",
      "",
    ].join("\r\n"));
    const account = session.account || {};
    const lastEventSeq = normalizeEventSeq(url.searchParams.get("lastEventSeq") || url.searchParams.get("afterSeq") || "0");
    const client = {
      socket,
      accountId: account.accountId || "",
      username: account.username || "",
      token,
      buffer: Buffer.alloc(0),
      lastSentEventSeq: lastEventSeq,
      pendingLiveEvents: [],
      replaying: true,
    };
    clients.add(client);
    markBattleConnection(service, token, true);
    socket.on("data", (chunk) => handleSocketData(client, chunk));
    const cleanup = () => {
      if (!clients.has(client)) {
        return;
      }
      clients.delete(client);
      markBattleConnection(service, token, false);
    };
    socket.on("close", cleanup);
    socket.on("error", cleanup);
    sendEvent(client, {
      type: "events.ready",
      account,
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      ...protocolMetadata(),
    });
    const online = service.listOnlinePlayers(token, {"scope": "aoi"});
    if (online.ok) {
      sendEvent(client, {
        type: "online.snapshot",
        players: online.players,
        party: online.party,
        aoi: online.aoi,
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
      });
    }
    replayEventsForClient(client, lastEventSeq);
    client.replaying = false;
    drainPendingLiveEvents(client);
    return true;
  }

  function publish(event) {
    for (const client of clients) {
      if (!eventVisibleToClient(event, client)) {
        continue;
      }
      const prepared = eventForClient(client, event);
      if (!prepared.visible) {
        continue;
      }
      if (client.replaying) {
        queuePendingLiveEvent(client, prepared.event);
      } else {
        sendSequencedEvent(client, prepared.event);
      }
    }
  }

  function eventForClient(client, event) {
    if (!service || typeof service.eventForSession !== "function") {
      return {visible: true, event};
    }
    const result = service.eventForSession(client.token, event);
    if (!result.ok) {
      client.socket.destroy();
      return {visible: false, event};
    }
    return {
      visible: result.visible !== false,
      event: result.event || event,
    };
  }

  function eventVisibleToClient(event, client) {
    const targetAccountIds = event && Array.isArray(event.targetAccountIds) ? event.targetAccountIds : null;
    if (!targetAccountIds) {
      return true;
    }
    return targetAccountIds.includes(client.accountId);
  }

  function replayEventsForClient(client, lastEventSeq) {
    if (!service || typeof service.listEventsForSession !== "function") {
      return;
    }
    const replay = service.listEventsForSession(client.token, {"afterSeq": lastEventSeq});
    if (!replay.ok || !Array.isArray(replay.events)) {
      client.socket.destroy();
      return;
    }
    for (const event of replay.events) {
      sendSequencedEvent(client, event);
    }
  }

  function close() {
    unsubscribe();
    for (const client of clients) {
      client.socket.destroy();
    }
    clients.clear();
  }

  function clientCount() {
    return clients.size;
  }

  return {
    handleUpgrade,
    publish,
    close,
    clientCount,
  };
}

function markBattleConnection(service, token, connected) {
  if (!service || typeof service.markBattleConnection !== "function") {
    return;
  }
  try {
    service.markBattleConnection(token, connected);
  } catch {
    // Socket lifecycle cleanup must not tear down the HTTP server.
  }
}

function queuePendingLiveEvent(client, event) {
  const eventSeq = normalizeEventSeq(event && event.eventSeq);
  if (eventSeq > 0 && eventSeq <= normalizeEventSeq(client.lastSentEventSeq)) {
    return;
  }
  if (eventSeq > 0 && client.pendingLiveEvents.some((pending) => normalizeEventSeq(pending && pending.eventSeq) === eventSeq)) {
    return;
  }
  client.pendingLiveEvents.push(event);
}

function drainPendingLiveEvents(client) {
  client.pendingLiveEvents.sort((a, b) => pendingEventSortSeq(a) - pendingEventSortSeq(b));
  for (const event of client.pendingLiveEvents) {
    sendSequencedEvent(client, event);
  }
  client.pendingLiveEvents = [];
}

function pendingEventSortSeq(event) {
  const eventSeq = normalizeEventSeq(event && event.eventSeq);
  return eventSeq > 0 ? eventSeq : Number.MAX_SAFE_INTEGER;
}

function sendSequencedEvent(client, event) {
  const eventSeq = normalizeEventSeq(event && event.eventSeq);
  if (eventSeq > 0) {
    if (eventSeq <= normalizeEventSeq(client.lastSentEventSeq)) {
      return;
    }
    client.lastSentEventSeq = eventSeq;
  }
  sendEvent(client, event);
}

function sendEvent(client, event) {
  if (!client || !client.socket || client.socket.destroyed) {
    return;
  }
  const text = JSON.stringify(event);
  client.socket.write(encodeFrame(0x1, Buffer.from(text, "utf8")));
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
    if (parsed.opcode === 0x9) {
      client.socket.write(encodeFrame(0xA, parsed.payload));
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

function encodeFrame(opcode, payload) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload || "");
  let header;
  if (data.length < 126) {
    header = Buffer.from([0x80 | opcode, data.length]);
  } else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  return Buffer.concat([header, data]);
}

function normalizeEventSeq(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return 0;
  }
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(number));
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
