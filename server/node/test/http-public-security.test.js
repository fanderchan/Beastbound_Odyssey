"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const net = require("node:net");
const {once} = require("node:events");
const test = require("node:test");
const {createHttpServer} = require("../src/http-server");
const {createAuthService, createMemoryAuthStore} = require("../src/auth-service");
const {
  CLIENT_PROTOCOL_HEADER,
  CLIENT_VERSION_HEADER,
  PROTOCOL_VERSION,
  SERVER_VERSION,
} = require("../src/protocol");

function eventHubStub() {
  return {
    handleUpgrade() { return false; },
    clientCount() { return 0; },
    metrics() { return {connections: 0}; },
    close() { return Promise.resolve(); },
  };
}

function protocolHeaders(extra = {}) {
  return {
    [CLIENT_VERSION_HEADER]: SERVER_VERSION,
    [CLIENT_PROTOCOL_HEADER]: String(PROTOCOL_VERSION),
    ...extra,
  };
}

async function listen(server, t) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await server.eventHub.close();
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  });
  return `http://127.0.0.1:${server.address().port}`;
}

function jsonWithExactBytes(size) {
  const prefix = '{"username":"boundeduser","password":"wrong123","pad":"';
  const suffix = '"}';
  assert.equal(size >= prefix.length + suffix.length, true);
  return prefix + "x".repeat(size - prefix.length - suffix.length) + suffix;
}

test("HTTP transport rejects malformed targets without an unhandled rejection", async (t) => {
  const server = createHttpServer({service: {}, eventHub: eventHubStub(), logger: false});
  await listen(server, t);
  let rejection = null;
  const rejectionHandler = (error) => { rejection = error; };
  process.once("unhandledRejection", rejectionHandler);
  t.after(() => process.off("unhandledRejection", rejectionHandler));

  const socket = net.createConnection({host: "127.0.0.1", port: server.address().port});
  await once(socket, "connect");
  let response = "";
  socket.on("data", (chunk) => { response += chunk.toString("latin1"); });
  socket.write("GET http://[ HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n");
  await once(socket, "close");
  assert.match(response, /^HTTP\/1\.1 400 /);
  assert.equal(rejection, null);
});

test("HTTP JSON parser enforces auth body and content-type boundaries", async (t) => {
  const service = {
    login(payload) { return {ok: true, observedBytes: Buffer.byteLength(JSON.stringify(payload))}; },
    register(payload) { return {ok: true, observedClientIp: payload.clientIp}; },
  };
  const server = createHttpServer({service, eventHub: eventHubStub(), logger: false});
  const base = await listen(server, t);
  const exactBody = jsonWithExactBytes(4096);
  const accepted = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: protocolHeaders({"content-type": "application/json"}),
    body: exactBody,
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.headers.get("cache-control"), "no-store");
  assert.equal(accepted.headers.get("x-content-type-options"), "nosniff");
  assert.match(String(accepted.headers.get("x-request-id") || ""), /^[A-Za-z0-9_-]{16}$/);

  const tooLarge = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: protocolHeaders({"content-type": "application/json"}),
    body: jsonWithExactBytes(4097),
  });
  assert.equal(tooLarge.status, 413);
  assert.equal((await tooLarge.json()).code, "request_body_too_large");

  const wrongType = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: protocolHeaders({"content-type": "text/plain"}),
    body: "{}",
  });
  assert.equal(wrongType.status, 415);
  assert.equal((await wrongType.json()).code, "content_type_unsupported");

  const malformed = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: protocolHeaders({"content-type": "application/json"}),
    body: "{",
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).code, "request_json_invalid");
});

test("HTTP client identity ignores spoofed forwarding by default and accepts an explicit trusted proxy", async (t) => {
  const service = {
    register(payload) { return {ok: true, observedClientIp: payload.clientIp}; },
    login(payload) { return {ok: true, observedClientIp: payload.clientIp}; },
  };
  const defaultServer = createHttpServer({service, eventHub: eventHubStub(), logger: false});
  const defaultBase = await listen(defaultServer, t);
  const ignored = await fetch(`${defaultBase}/auth/register`, {
    method: "POST",
    headers: protocolHeaders({"content-type": "application/json", "x-forwarded-for": "198.51.100.7"}),
    body: JSON.stringify({username: "identitya", password: "test1234"}),
  }).then((response) => response.json());
  assert.equal(ignored.observedClientIp, "127.0.0.1");

  const trustedServer = createHttpServer({
    service,
    eventHub: eventHubStub(),
    logger: false,
    trustedProxies: ["127.0.0.1"],
  });
  const trustedBase = await listen(trustedServer, t);
  const forwarded = await fetch(`${trustedBase}/auth/register`, {
    method: "POST",
    headers: protocolHeaders({"content-type": "application/json", "x-forwarded-for": "198.51.100.8"}),
    body: JSON.stringify({username: "identityb", password: "test1234"}),
  }).then((response) => response.json());
  assert.equal(forwarded.observedClientIp, "198.51.100.8");
});

test("HTTP bearer boundary forwards only canonical 43-byte base64url session tokens", async (t) => {
  const server = createHttpServer({
    service: {getSession(token) { return {ok: true, observedToken: token}; }},
    eventHub: eventHubStub(),
    logger: false,
  });
  const base = await listen(server, t);
  const invalid = await fetch(`${base}/auth/session`, {
    headers: protocolHeaders({authorization: "Bearer short-token"}),
  }).then((response) => response.json());
  assert.equal(invalid.observedToken, "");
  const canonicalToken = "a".repeat(43);
  const valid = await fetch(`${base}/auth/session`, {
    headers: protocolHeaders({authorization: `Bearer ${canonicalToken}`}),
  }).then((response) => response.json());
  assert.equal(valid.observedToken, canonicalToken);
});

test("HTTP response diagnostics identify bounded send phases without leaking dynamic route IDs", async (t) => {
  const pad = "x".repeat(32 * 1024);
  const service = {
    leaveBattleRoom(token, roomId) {
      return {ok: true, token, roomId, pad};
    },
  };
  const server = createHttpServer({service, eventHub: eventHubStub(), logger: false});
  const base = await listen(server, t);
  const token = "a".repeat(43);
  const response = await fetch(`${base}/battle/rooms/private-room-123/leave`, {
    method: "POST",
    headers: protocolHeaders({authorization: `Bearer ${token}`, "content-type": "application/json"}),
    body: "{}",
  });
  const responseBytes = Number(response.headers.get("content-length"));
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.roomId, "private-room-123");
  assert.equal(body.pad, pad);

  const observed = server.networkAdmission.metrics().httpResponses;
  assert.equal(observed.count, 1);
  assert.equal(observed.bytes, responseBytes);
  assert.equal(observed.serviceCalls, 1);
  assert.equal(observed.serviceSyncMax.serviceMethod, "leaveBattleRoom");
  assert.equal(observed.serviceSyncMax.route, "/battle/rooms/:id/leave");
  assert.equal(observed.maxBytes.route, "/battle/rooms/:id/leave");
  assert.equal(observed.maxBytes.route.includes("private-room-123"), false);
  assert.equal(observed.maxBytes.responseBytes, responseBytes);
  for (const phase of ["preSend", "metadata", "serialize", "byteLength", "writeHead", "end", "sendTotal"]) {
    assert.equal(observed.phaseMax[phase].route, "/battle/rooms/:id/leave");
    assert.equal(Number.isFinite(observed.phaseMax[phase].durationMs), true);
    assert.equal(observed.phaseMax[phase].durationMs >= 0, true);
  }
});

test("cached health never probes storage per request or exposes internal errors", async (t) => {
  let probes = 0;
  let fail = false;
  const store = {
    mode: "isolated",
    async checkHealthAsync() {
      probes += 1;
      if (fail) {
        throw new Error("connect db.internal.example:3306 as secret_user");
      }
      return {ok: true};
    },
  };
  const server = createHttpServer({service: {}, store, eventHub: eventHubStub(), logger: false});
  const base = await listen(server, t);
  await server.healthMonitor.refresh();
  const baseline = probes;
  for (let index = 0; index < 20; index += 1) {
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
  }
  assert.equal(probes, baseline);

  fail = true;
  await server.healthMonitor.refresh();
  const failed = await fetch(`${base}/health`);
  const text = await failed.text();
  assert.equal(failed.status, 503);
  assert.equal(text.includes("db.internal.example"), false);
  assert.equal(text.includes("secret_user"), false);
});

test("readiness stays unavailable until the first storage probe succeeds", async (t) => {
  const pendingHealth = {
    start() { return Promise.resolve(); },
    close() {},
    liveSnapshot() { return {ok: true, service: "beastbound-auth"}; },
    snapshot() {
      return {ok: null, checked: false, stale: false, mode: "isolated", latencyMs: 0, checkedAgoMs: 0};
    },
    metrics() { return {probes: 1, failures: 0, timeouts: 0, recoveries: 0, inFlight: true}; },
  };
  const server = createHttpServer({
    service: {},
    eventHub: eventHubStub(),
    healthMonitor: pendingHealth,
    logger: false,
  });
  const base = await listen(server, t);

  const live = await fetch(`${base}/health/live`);
  assert.equal(live.status, 200);
  const ready = await fetch(`${base}/health/ready`);
  const body = await ready.json();
  assert.equal(ready.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.storage.checked, false);
  assert.equal(body.storage.ok, null);
});

test("chunked auth body crossing 4KiB is rejected", async (t) => {
  const server = createHttpServer({
    service: {login() { return {ok: true}; }},
    eventHub: eventHubStub(),
    logger: false,
  });
  await listen(server, t);
  const response = await new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port: server.address().port,
      path: "/auth/login",
      method: "POST",
      headers: protocolHeaders({"content-type": "application/json", "transfer-encoding": "chunked"}),
    }, resolve);
    request.on("error", reject);
    const body = jsonWithExactBytes(4097);
    request.write(body.slice(0, 2048));
    request.end(body.slice(2048));
  });
  const chunks = [];
  for await (const chunk of response) {
    chunks.push(chunk);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  assert.equal(response.statusCode, 413);
  assert.equal(body.code, "request_body_too_large");
});

test("bodyless routes retain HTTP admission until a bounded chunked body finishes", async (t) => {
  const server = createHttpServer({service: {}, eventHub: eventHubStub(), logger: false});
  await listen(server, t);
  const port = server.address().port;

  const stalled = net.createConnection({host: "127.0.0.1", port});
  await once(stalled, "connect");
  let stalledResponse = "";
  stalled.on("data", (chunk) => { stalledResponse += chunk.toString("latin1"); });
  const stalledClose = once(stalled, "close");
  const partialBody = Buffer.alloc(4096, 0x61);
  stalled.write("GET /health/live HTTP/1.1\r\nHost: localhost\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n");
  stalled.write(`${partialBody.length.toString(16)}\r\n`);
  stalled.write(partialBody);
  stalled.write("\r\n");
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(stalledResponse, "");
  assert.equal(server.networkAdmission.metrics().activeHttp, 1);
  stalled.write("0\r\n\r\n");
  await stalledClose;
  assert.match(stalledResponse, /^HTTP\/1\.1 200 /);
  assert.equal(server.networkAdmission.metrics().activeHttp, 0);

  const oversized = net.createConnection({host: "127.0.0.1", port});
  await once(oversized, "connect");
  let oversizedResponse = "";
  oversized.on("data", (chunk) => { oversizedResponse += chunk.toString("latin1"); });
  const oversizedClose = once(oversized, "close");
  const oversizedBody = Buffer.alloc((64 * 1024) + 1, 0x62);
  oversized.write("GET /health/live HTTP/1.1\r\nHost: localhost\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n");
  oversized.write(`${oversizedBody.length.toString(16)}\r\n`);
  oversized.write(oversizedBody);
  oversized.write("\r\n");
  await oversizedClose;
  assert.match(oversizedResponse, /^HTTP\/1\.1 413 /);
  assert.equal(server.networkAdmission.metrics().activeHttp, 0);
});

test("Expect 100-continue rejects oversized auth bodies before granting upload", async (t) => {
  const server = createHttpServer({
    service: {login() { return {ok: true}; }},
    eventHub: eventHubStub(),
    logger: false,
  });
  await listen(server, t);
  let continued = false;
  const response = await new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port: server.address().port,
      path: "/auth/login",
      method: "POST",
      headers: protocolHeaders({
        "content-type": "application/json",
        "content-length": "4097",
        expect: "100-continue",
      }),
    }, resolve);
    request.on("continue", () => { continued = true; });
    request.on("error", reject);
    request.end();
  });
  const chunks = [];
  for await (const chunk of response) {
    chunks.push(chunk);
  }
  assert.equal(continued, false);
  assert.equal(response.statusCode, 413);
  assert.equal(JSON.parse(Buffer.concat(chunks).toString("utf8")).code, "request_body_too_large");
});

test("production HTTP login uses bounded async scrypt and uniform credential failures", async (t) => {
  const service = createAuthService({store: createMemoryAuthStore()});
  for (let index = 0; index < 12; index += 1) {
    assert.equal(service.register({username: `asyncuser${index}`, password: "test1234"}).ok, true);
  }
  const server = createHttpServer({service, eventHub: eventHubStub(), logger: false});
  const base = await listen(server, t);
  let ticks = 0;
  const ticker = setInterval(() => { ticks += 1; }, 1);
  const failures = await Promise.all(Array.from({length: 12}, async (_entry, index) => {
    const response = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: protocolHeaders({"content-type": "application/json"}),
      body: JSON.stringify({username: `asyncuser${index}`, password: "wrong123"}),
    });
    return response.json();
  }));
  clearInterval(ticker);
  assert.equal(failures.every((entry) => entry.code === "invalid_credentials"), true);
  const unknown = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: protocolHeaders({"content-type": "application/json"}),
    body: JSON.stringify({username: "unknownasync", password: "wrong123"}),
  }).then((response) => response.json());
  assert.equal(unknown.code, "invalid_credentials");
  assert.equal(ticks > 0, true);
  const health = await fetch(`${base}/health`).then((response) => response.json());
  assert.equal(health.authWork.active, 0);
  assert.equal(health.authWork.queued, 0);
  assert.equal(health.authWork.peakActive, 4);
  assert.equal(health.authWork.completed >= 13, true);
});

test("transport auth admission rejects before password work and durable login", async (t) => {
  const service = createAuthService({store: createMemoryAuthStore()});
  assert.equal(service.register({username: "prehashgate", password: "test1234"}).ok, true);
  let derives = 0;
  const queue = {
    async derive() {
      derives += 1;
      return "0".repeat(64);
    },
    metrics() { return {active: 0, queued: 0}; },
  };
  const server = createHttpServer({
    service,
    eventHub: eventHubStub(),
    logger: false,
    networkAdmissionOptions: {authAccountCapacity: 1, authAccountWindowMs: 60_000},
    httpAuthOptions: {queue},
  });
  const base = await listen(server, t);
  const requestOptions = {
    method: "POST",
    headers: protocolHeaders({"content-type": "application/json"}),
    body: JSON.stringify({username: "prehashgate", password: "wrong123"}),
  };
  const first = await fetch(`${base}/auth/login`, requestOptions);
  assert.equal(first.status, 400);
  assert.equal((await first.json()).code, "invalid_credentials");
  const second = await fetch(`${base}/auth/login`, requestOptions);
  assert.equal(second.status, 429);
  assert.equal((await second.json()).code, "request_rate_limited");
  assert.equal(derives, 1);
});
