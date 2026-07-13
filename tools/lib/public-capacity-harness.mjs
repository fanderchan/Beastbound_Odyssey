import assert from "node:assert/strict";
import crypto from "node:crypto";
import net from "node:net";
import {createHistogram, performance} from "node:perf_hooks";

export function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(milliseconds) || 0)));
}

export function withTimeout(promise, timeoutMs, message) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

export function round(value, digits = 3) {
  return Number(Number(value || 0).toFixed(digits));
}

export function bytesToMiB(value) {
  return Number(value || 0) / 1048576;
}

export function boundedTail(value, maxLength = 16000) {
  const text = String(value || "");
  return text.length <= maxLength ? text : text.slice(-maxLength);
}

export function seededRandom(seedValue) {
  let state = crypto.createHash("sha256").update(String(seedValue || "beastbound-capacity")).digest().readUInt32LE(0);
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export class LatencyBook {
  constructor(durationMs, options = {}) {
    this.durationMs = Math.max(1, Number(durationMs || 1));
    this.windowMs = Math.max(1000, Math.min(
      this.durationMs / 2,
      Number(options.windowMs || Math.min(5 * 60 * 1000, this.durationMs * 0.2)),
    ));
    this.firstWindowStartMs = Math.max(0, Math.min(
      this.durationMs - this.windowMs,
      Number(options.firstWindowStartMs || 0),
    ));
    this.firstWindowEndMs = this.firstWindowStartMs + this.windowMs;
    this.startedAt = performance.now();
    this.rows = new Map();
  }

  record(name, milliseconds, options = {}) {
    const key = String(name || "unknown");
    const elapsedMs = Number(options.elapsedMs ?? (performance.now() - this.startedAt));
    const measuredMs = Number(milliseconds || 0);
    const row = this.rows.get(key) || this.#newRow();
    this.rows.set(key, row);
    recordMilliseconds(row.all, measuredMs);
    row.count += 1;
    if (row.maxAtElapsedMs === null || measuredMs > row.maxMs) {
      row.maxMs = measuredMs;
      row.maxAtElapsedMs = elapsedMs;
    }
    if (elapsedMs >= this.firstWindowStartMs && elapsedMs < this.firstWindowEndMs) {
      recordMilliseconds(row.first, measuredMs);
      row.firstCount += 1;
      if (row.firstMaxAtElapsedMs === null || measuredMs > row.firstMaxMs) {
        row.firstMaxMs = measuredMs;
        row.firstMaxAtElapsedMs = elapsedMs;
      }
    }
    if (elapsedMs >= this.durationMs - this.windowMs) {
      recordMilliseconds(row.last, measuredMs);
      row.lastCount += 1;
      if (row.lastMaxAtElapsedMs === null || measuredMs > row.lastMaxMs) {
        row.lastMaxMs = measuredMs;
        row.lastMaxAtElapsedMs = elapsedMs;
      }
    }
    if (options.ok === false) {
      row.failures += 1;
      const code = String(options.code || "unknown");
      row.failureCodes[code] = Number(row.failureCodes[code] || 0) + 1;
    }
  }

  summary() {
    return Object.fromEntries([...this.rows.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([name, row]) => [name, {
      count: row.count,
      failures: row.failures,
      failureCodes: row.failureCodes,
      p50Ms: histogramMs(row.all, 50),
      p95Ms: histogramMs(row.all, 95),
      p99Ms: histogramMs(row.all, 99),
      maxMs: round(row.maxMs),
      maxAtElapsedMs: round(row.maxAtElapsedMs),
      first: histogramSummary(row.first, row.firstCount, row.firstMaxMs, row.firstMaxAtElapsedMs),
      last: histogramSummary(row.last, row.lastCount, row.lastMaxMs, row.lastMaxAtElapsedMs),
    }]));
  }

  #newRow() {
    return {
      all: createHistogram(),
      first: createHistogram(),
      last: createHistogram(),
      count: 0,
      firstCount: 0,
      lastCount: 0,
      failures: 0,
      failureCodes: {},
      maxMs: 0,
      maxAtElapsedMs: null,
      firstMaxMs: 0,
      firstMaxAtElapsedMs: null,
      lastMaxMs: 0,
      lastMaxAtElapsedMs: null,
    };
  }
}

function recordMilliseconds(histogram, milliseconds) {
  const nanoseconds = Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.round(Number(milliseconds || 0) * 1e6)));
  histogram.record(nanoseconds);
}

function histogramMs(histogram, percentile) {
  return histogram.count > 0 ? round(histogram.percentile(percentile) / 1e6) : null;
}

function histogramSummary(histogram, count, maxMs, maxAtElapsedMs) {
  return {
    count,
    p95Ms: histogramMs(histogram, 95),
    p99Ms: histogramMs(histogram, 99),
    maxMs: count > 0 ? round(maxMs) : null,
    maxAtElapsedMs: count > 0 ? round(maxAtElapsedMs) : null,
  };
}

export async function fetchJsonMeasured(url, options = {}) {
  const headers = {
    accept: "application/json",
    ...(options.headers || {}),
  };
  if (options.protocolVersion !== undefined) {
    headers["x-beastbound-protocol-version"] = String(options.protocolVersion);
  }
  if (options.clientVersion !== undefined) {
    headers["x-beastbound-client-version"] = String(options.clientVersion);
  }
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }
  let body = options.body;
  if (body !== undefined && options.rawBody !== true) {
    headers["content-type"] = headers["content-type"] || "application/json";
    body = JSON.stringify(body);
  }
  const startedAt = performance.now();
  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body,
    signal: AbortSignal.timeout(options.timeoutMs || 10000),
  });
  const text = await response.text();
  const elapsedMs = performance.now() - startedAt;
  const responseObservedAtUnixMs = performance.timeOrigin + performance.now();
  let json = null;
  try {
    json = text === "" ? {} : JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid JSON status=${response.status} url=${new URL(url).pathname} body=${text.slice(0, 300)}`, {cause: error});
  }
  return {
    status: response.status,
    ok: response.ok && json && json.ok !== false,
    json,
    elapsedMs,
    responseObservedAtUnixMs,
    responseBytes: Buffer.byteLength(text),
    requestId: response.headers.get("x-request-id") || "",
  };
}

export class RawJsonWebSocket {
  constructor(options = {}) {
    this.host = String(options.host || "127.0.0.1");
    this.port = Number(options.port || 0);
    this.path = String(options.path || "/events");
    this.headers = {...(options.headers || {})};
    this.index = Number(options.index ?? -1);
    this.expectedAccountId = String(options.expectedAccountId || "");
    this.onEvent = typeof options.onEvent === "function" ? options.onEvent : () => {};
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.httpBuffer = Buffer.alloc(0);
    this.upgraded = false;
    this.ready = null;
    this.snapshot = null;
    this.epoch = "";
    this.lastEventSeq = Math.max(0, Math.trunc(Number(options.lastEventSeq || 0)));
    this.eventSeqRegressions = 0;
    this.eventSeqDuplicates = 0;
    this.presenceRevisionRegressions = 0;
    this.presenceRevisions = new Map(options.initialPresenceRevisions || []);
    this.protocolErrors = 0;
    this.resetCount = 0;
    this.receivedFrames = 0;
    this.receivedBytes = 0;
    this.receivedBatchFrames = 0;
    this.receivedBatchDeltas = 0;
    this.unexpectedCloseCount = 0;
    this.expectedClose = false;
    this.closed = false;
    this.waiters = [];
    this.connectStartedAt = 0;
    this.connectedAt = 0;
    this.bootstrapAt = 0;
    this.handshakeKey = "";
    this.handshakeAccept = "";
    this.connectPromise = null;
  }

  connect(timeoutMs = 10000) {
    assert.ok(this.port > 0, "websocket port is required");
    assert.equal(this.connectPromise, null, "websocket client is single-use");
    this.connectStartedAt = performance.now();
    this.handshakeKey = crypto.randomBytes(16).toString("base64");
    this.handshakeAccept = crypto.createHash("sha1")
      .update(`${this.handshakeKey}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    this.socket = net.createConnection({host: this.host, port: this.port});
    const bootstrapPromise = new Promise((resolve, reject) => {
      const fail = (error) => reject(error instanceof Error ? error : new Error(String(error || "websocket failed")));
      this.socket.once("connect", () => {
        this.connectedAt = performance.now();
        const requestHeaders = {
          Host: `${this.host}:${this.port}`,
          Upgrade: "websocket",
          Connection: "Upgrade",
          "Sec-WebSocket-Key": this.handshakeKey,
          "Sec-WebSocket-Version": "13",
          ...this.headers,
        };
        const rows = [`GET ${this.path} HTTP/1.1`, ...Object.entries(requestHeaders).map(([name, value]) => `${name}: ${value}`), "", ""];
        this.socket.write(rows.join("\r\n"));
      });
      this.socket.on("data", (chunk) => {
        try {
          this.#onData(chunk, resolve, fail);
        } catch (error) {
          this.protocolErrors += 1;
          fail(error);
          this.terminate();
        }
      });
      this.socket.on("error", fail);
      this.socket.on("close", () => {
        this.closed = true;
        if (this.bootstrapAt === 0) {
          fail(new Error(`websocket ${this.index} closed before ready/snapshot`));
        }
        if (!this.expectedClose) {
          this.unexpectedCloseCount += 1;
        }
        for (const waiter of this.waiters.splice(0)) {
          clearTimeout(waiter.timer);
          waiter.reject(new Error(`websocket ${this.index} closed`));
        }
      });
    });
    this.connectPromise = withTimeout(
      bootstrapPromise,
      timeoutMs,
      `websocket ${this.index} ready/snapshot timeout`,
    ).catch((error) => {
      this.terminate();
      throw error;
    });
    return this.connectPromise;
  }

  waitFor(predicate, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
      const waiter = {predicate, resolve, reject, timer: null};
      waiter.timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) {
          this.waiters.splice(index, 1);
        }
        reject(new Error(`websocket ${this.index} event wait timeout`));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  sendPing(payload = crypto.randomBytes(8)) {
    if (this.socket && !this.socket.destroyed) {
      this.socket.write(encodeClientFrame(0x9, payload));
    }
  }

  close(code = 1000, reason = "") {
    this.expectedClose = true;
    if (!this.socket || this.socket.destroyed) {
      return;
    }
    const reasonBuffer = Buffer.from(String(reason || "").slice(0, 80));
    const payload = Buffer.alloc(2 + reasonBuffer.length);
    payload.writeUInt16BE(code, 0);
    reasonBuffer.copy(payload, 2);
    try {
      this.socket.write(encodeClientFrame(0x8, payload));
      this.socket.end();
    } catch {
      this.socket.destroy();
    }
  }

  terminate() {
    this.expectedClose = true;
    if (this.socket && !this.socket.destroyed) {
      this.socket.destroy();
    }
  }

  summary() {
    return {
      index: this.index,
      accountId: this.expectedAccountId,
      lastEventSeq: this.lastEventSeq,
      epoch: this.epoch,
      resetCount: this.resetCount,
      receivedFrames: this.receivedFrames,
      receivedBytes: this.receivedBytes,
      receivedBatchFrames: this.receivedBatchFrames,
      receivedBatchDeltas: this.receivedBatchDeltas,
      eventSeqRegressions: this.eventSeqRegressions,
      eventSeqDuplicates: this.eventSeqDuplicates,
      presenceRevisionRegressions: this.presenceRevisionRegressions,
      protocolErrors: this.protocolErrors,
      unexpectedCloseCount: this.unexpectedCloseCount,
    };
  }

  #onData(chunk, resolve, reject) {
    if (!this.upgraded) {
      this.httpBuffer = Buffer.concat([this.httpBuffer, chunk]);
      if (this.httpBuffer.length > 65536) {
        throw new Error("websocket handshake header exceeded 64KiB");
      }
      const headerEnd = this.httpBuffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) {
        return;
      }
      const headerText = this.httpBuffer.subarray(0, headerEnd).toString("utf8");
      const lines = headerText.split("\r\n");
      const headers = new Map(lines.slice(1).map((line) => {
        const separator = line.indexOf(":");
        return separator < 0
          ? [line.toLowerCase(), ""]
          : [line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()];
      }));
      if (!/^HTTP\/1\.1 101\b/.test(lines[0])) {
        reject(new Error(`websocket ${this.index} upgrade failed: ${lines[0]} ${headerText.slice(0, 300)}`));
        this.terminate();
        return;
      }
      if (headers.get("sec-websocket-accept") !== this.handshakeAccept) {
        throw new Error(`websocket ${this.index} accept mismatch`);
      }
      this.upgraded = true;
      this.buffer = Buffer.from(this.httpBuffer.subarray(headerEnd + 4));
      this.httpBuffer = Buffer.alloc(0);
    } else {
      this.buffer = Buffer.concat([this.buffer, chunk]);
    }
    this.#drainFrames(resolve, reject);
  }

  #drainFrames(resolve, reject) {
    let parsedCount = 0;
    while (parsedCount < 256) {
      const parsed = readServerFrame(this.buffer);
      if (!parsed) {
        return;
      }
      parsedCount += 1;
      this.buffer = this.buffer.subarray(parsed.bytesRead);
      this.receivedFrames += 1;
      this.receivedBytes += parsed.bytesRead;
      if (parsed.opcode === 0x8) {
        if (this.socket && !this.socket.destroyed) {
          this.socket.end(encodeClientFrame(0x8, parsed.payload));
        }
        return;
      }
      if (parsed.opcode === 0x9) {
        if (this.socket && !this.socket.destroyed) {
          this.socket.write(encodeClientFrame(0xA, parsed.payload));
        }
        continue;
      }
      if (parsed.opcode === 0xA) {
        continue;
      }
      if (parsed.opcode !== 0x1 || !parsed.fin) {
        throw new Error(`websocket ${this.index} received unsupported server frame opcode=${parsed.opcode}`);
      }
      const event = JSON.parse(parsed.payload.toString("utf8"));
      const receivedAt = performance.now();
      const logicalEvents = expandLogicalServerEvents(event);
      if (event && event.type === "online.position_batch") {
        this.receivedBatchFrames += 1;
        this.receivedBatchDeltas += logicalEvents.length;
      }
      for (const logicalEvent of logicalEvents) {
        this.#recordEvent(logicalEvent);
        this.onEvent(this.index, logicalEvent, parsed.payload.length, receivedAt, this);
        this.#resolveWaiters(logicalEvent, receivedAt);
        if (logicalEvent.type === "events.ready") {
          this.ready = logicalEvent;
          this.epoch = String(logicalEvent.eventStreamEpoch || logicalEvent.epoch || this.epoch || "");
          const accountId = String(logicalEvent.account && logicalEvent.account.accountId || "");
          if (this.expectedAccountId && accountId !== this.expectedAccountId) {
            throw new Error(`websocket ${this.index} ready account ${accountId} != ${this.expectedAccountId}`);
          }
        }
        if (logicalEvent.type === "online.snapshot") {
          this.snapshot = logicalEvent;
        }
      }
      if (this.ready && this.snapshot && this.bootstrapAt === 0) {
        this.bootstrapAt = receivedAt;
        resolve(this);
      }
    }
    if (this.buffer.length > 0) {
      setImmediate(() => {
        try {
          this.#drainFrames(resolve, reject);
        } catch (error) {
          this.protocolErrors += 1;
          reject(error);
          this.terminate();
        }
      });
    }
  }

  #recordEvent(event) {
    const eventSeq = Math.max(0, Math.trunc(Number(event && event.eventSeq || 0)));
    if (eventSeq > 0) {
      if (eventSeq < this.lastEventSeq) {
        this.eventSeqRegressions += 1;
      } else if (eventSeq === this.lastEventSeq) {
        this.eventSeqDuplicates += 1;
      } else {
        this.lastEventSeq = eventSeq;
      }
    }
    if (event && event.type === "events.reset") {
      this.resetCount += 1;
      const latest = Math.max(0, Math.trunc(Number(event.latestEventSeq || event.latestSeq || 0)));
      this.lastEventSeq = Math.max(this.lastEventSeq, latest);
      this.epoch = String(event.eventStreamEpoch || event.epoch || this.epoch || "");
    }
    if (event && event.type === "online.snapshot" && Array.isArray(event.players)) {
      for (const player of event.players) {
        this.#recordPresenceRevision(player && player.accountId, player && player.presenceRevision);
      }
    } else if (event && event.type === "online.position") {
      this.#recordPresenceRevision(event.accountId, event.presenceRevision);
    }
  }

  #recordPresenceRevision(accountIdValue, revisionValue) {
    const accountId = String(accountIdValue || "");
    const revision = Math.max(0, Math.trunc(Number(revisionValue || 0)));
    if (accountId === "" || revision <= 0) {
      return;
    }
    const previous = Number(this.presenceRevisions.get(accountId) || 0);
    if (revision < previous) {
      this.presenceRevisionRegressions += 1;
    }
    this.presenceRevisions.set(accountId, Math.max(previous, revision));
  }

  #resolveWaiters(event, receivedAt) {
    for (let index = 0; index < this.waiters.length; index += 1) {
      const waiter = this.waiters[index];
      if (!waiter.predicate(event)) {
        continue;
      }
      this.waiters.splice(index, 1);
      index -= 1;
      clearTimeout(waiter.timer);
      waiter.resolve({event, receivedAt});
    }
  }
}

export function expandLogicalServerEvents(event) {
  if (!event || event.type !== "online.position_batch") {
    return [event];
  }
  if (
    Math.max(0, Math.trunc(Number(event.eventSeq || 0))) > 0
    || Object.hasOwn(event, "targetSessionIds")
    || Object.hasOwn(event, "targetAccountIds")
    || !Array.isArray(event.deltas)
    || event.deltas.length <= 0
    || event.deltas.length > 64
  ) {
    throw new Error("invalid online.position_batch envelope");
  }
  return event.deltas.map((delta) => {
    if (
      !delta
      || typeof delta !== "object"
      || Array.isArray(delta)
      || delta.type !== "online.position"
      || Math.max(0, Math.trunc(Number(delta.eventSeq || 0))) > 0
      || Object.hasOwn(delta, "targetSessionIds")
      || Object.hasOwn(delta, "targetAccountIds")
    ) {
      throw new Error("invalid online.position_batch delta");
    }
    return delta;
  });
}

export function encodeClientFrame(opcode, payloadValue, options = {}) {
  const payload = Buffer.isBuffer(payloadValue) ? payloadValue : Buffer.from(payloadValue || "");
  const fin = options.fin !== false;
  const masked = options.masked !== false;
  const first = (fin ? 0x80 : 0) | (Number(opcode || 0) & 0x0F);
  let lengthBytes;
  if (payload.length < 126) {
    lengthBytes = Buffer.from([(masked ? 0x80 : 0) | payload.length]);
  } else if (payload.length <= 0xFFFF) {
    lengthBytes = Buffer.alloc(3);
    lengthBytes[0] = (masked ? 0x80 : 0) | 126;
    lengthBytes.writeUInt16BE(payload.length, 1);
  } else {
    lengthBytes = Buffer.alloc(9);
    lengthBytes[0] = (masked ? 0x80 : 0) | 127;
    lengthBytes.writeBigUInt64BE(BigInt(payload.length), 1);
  }
  if (!masked) {
    return Buffer.concat([Buffer.from([first]), lengthBytes, payload]);
  }
  const mask = options.mask || crypto.randomBytes(4);
  const encoded = Buffer.alloc(payload.length);
  for (let index = 0; index < payload.length; index += 1) {
    encoded[index] = payload[index] ^ mask[index % 4];
  }
  return Buffer.concat([Buffer.from([first]), lengthBytes, mask, encoded]);
}

export function readServerFrame(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 2) {
    return null;
  }
  const first = buffer[0];
  const second = buffer[1];
  const fin = (first & 0x80) !== 0;
  const opcode = first & 0x0F;
  const masked = (second & 0x80) !== 0;
  if (masked) {
    throw new Error("server websocket frame must not be masked");
  }
  let length = second & 0x7F;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < 4) {
      return null;
    }
    length = buffer.readUInt16BE(2);
    offset = 4;
  } else if (length === 127) {
    if (buffer.length < 10) {
      return null;
    }
    const bigLength = buffer.readBigUInt64BE(2);
    if (bigLength > BigInt(64 * 1024 * 1024)) {
      throw new Error("server websocket frame exceeded 64MiB harness cap");
    }
    length = Number(bigLength);
    offset = 10;
  }
  if (buffer.length < offset + length) {
    return null;
  }
  return {
    fin,
    opcode,
    payload: Buffer.from(buffer.subarray(offset, offset + length)),
    bytesRead: offset + length,
  };
}

export async function openRawWebSocketAttack(options = {}) {
  const key = crypto.randomBytes(16).toString("base64");
  const socket = net.createConnection({host: options.host || "127.0.0.1", port: options.port});
  const closed = new Promise((resolve) => socket.once("close", resolve));
  const response = new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    socket.once("connect", () => {
      const headers = {
        Host: `${options.host || "127.0.0.1"}:${options.port}`,
        Upgrade: "websocket",
        Connection: "Upgrade",
        "Sec-WebSocket-Key": key,
        "Sec-WebSocket-Version": "13",
        ...(options.headers || {}),
      };
      socket.write([`GET ${options.path || "/events"} HTTP/1.1`, ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`), "", ""].join("\r\n"));
    });
    socket.on("error", reject);
    socket.on("data", function onData(chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      const end = buffer.indexOf("\r\n\r\n");
      if (end < 0) {
        return;
      }
      socket.off("data", onData);
      resolve(buffer.subarray(0, end + 4).toString("utf8"));
    });
  });
  try {
    const headerText = await withTimeout(response, options.timeoutMs || 3000, "raw websocket attack handshake timeout");
    return {socket, closed, headerText};
  } catch (error) {
    socket.destroy();
    throw error;
  }
}
