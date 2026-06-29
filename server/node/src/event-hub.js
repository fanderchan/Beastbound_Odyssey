"use strict";

const crypto = require("node:crypto");

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
    const client = {
      socket,
      accountId: account.accountId || "",
      username: account.username || "",
      buffer: Buffer.alloc(0),
    };
    clients.add(client);
    socket.on("data", (chunk) => handleSocketData(client, chunk));
    socket.on("close", () => clients.delete(client));
    socket.on("error", () => clients.delete(client));
    sendEvent(client, {
      type: "events.ready",
      account,
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
    });
    const online = service.listOnlinePlayers(token);
    if (online.ok) {
      sendEvent(client, {
        type: "online.snapshot",
        players: online.players,
        party: online.party,
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
      });
    }
    return true;
  }

  function publish(event) {
    for (const client of clients) {
      if (!eventVisibleToClient(event, client)) {
        continue;
      }
      sendEvent(client, event);
    }
  }

  function eventVisibleToClient(event, client) {
    const targetAccountIds = event && Array.isArray(event.targetAccountIds) ? event.targetAccountIds : null;
    if (!targetAccountIds) {
      return true;
    }
    return targetAccountIds.includes(client.accountId);
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

function writeHttpError(socket, status, message) {
  socket.write([
    `HTTP/1.1 ${status} ${message}`,
    "Connection: close",
    "Content-Length: 0",
    "",
    "",
  ].join("\r\n"));
  socket.destroy();
}

module.exports = {
  createEventHub,
};
