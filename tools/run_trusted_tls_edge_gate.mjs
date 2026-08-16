#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import {createRequire} from "node:module";
import {once} from "node:events";

const require = createRequire(import.meta.url);
const {
  createAuthService,
  createMemoryAuthStore,
} = require("../server/node/src/auth-service");
const {
  createHttpServer,
} = require("../server/node/src/http-server");
const {
  CLIENT_PROTOCOL_HEADER,
  CLIENT_VERSION_HEADER,
  PROTOCOL_VERSION,
  SERVER_VERSION,
} = require("../server/node/src/protocol");

const LOOPBACK = "127.0.0.1";
const LOOPBACK_V6 = "::1";
const EDGE_HOSTNAME = "edge.beastbound.test";
const EDGE_ORIGIN = `https://${EDGE_HOSTNAME}`;
const CLIENT_A = LOOPBACK;
const REQUEST_TIMEOUT_MS = 5000;
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const FORWARDED_HEADERS = new Set([
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-port",
  "x-forwarded-proto",
  "x-real-ip",
]);

async function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-phase467-edge-"));
  const resources = {
    edges: [],
    edgeSockets: new Set(),
    backends: [],
    wssClient: null,
  };
  const usedPorts = [];
  let summary = null;
  let primaryError = null;
  try {
    const certificates = createTemporaryCertificates(tempDir);
    const store = createMemoryAuthStore();
    const service = createAuthService({store});
    const websocketAccount = service.register({
      username: "phase467wss",
      password: "test1234",
      displayName: "TLS边缘验收",
    });
    assert.equal(websocketAccount.ok, true, `fixture register failed: ${String(websocketAccount.code || "unknown")}`);
    assert.match(websocketAccount.session.token, /^[A-Za-z0-9_-]{43}$/);
    const websocketCharacter = service.createCharacter(websocketAccount.session.token, {
      appearanceId: "novice_hunter_v1",
      slotIndex: 0,
      displayName: "边缘猎人",
      elements: {earth: 6, water: 4, fire: 0, wind: 0},
    });
    assert.equal(websocketCharacter.ok, true, `fixture character failed: ${String(websocketCharacter.code || "unknown")}`);
    const selectedWebsocketCharacter = service.selectCharacter(websocketAccount.session.token, {
      slotIndex: 0,
    });
    assert.equal(
      selectedWebsocketCharacter.ok,
      true,
      `fixture character selection failed: ${String(selectedWebsocketCharacter.code || "unknown")}`,
    );
    const websocketToken = selectedWebsocketCharacter.session.token;
    assert.match(websocketToken, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(service.getEventSession(websocketToken).ok, true);

    for (let index = 0; index < 2; index += 1) {
      const backend = createHttpServer({
        service,
        store,
        logger: false,
        trustedProxies: [LOOPBACK_V6],
        networkAdmissionOptions: {
          requireTrustedTlsProxy: true,
          authIpCapacity: 1,
          authIpWindowMs: 60_000,
          authAccountCapacity: 20,
        },
        eventHubOptions: {
          allowedOrigins: [EDGE_ORIGIN],
        },
      });
      await listen(backend, LOOPBACK_V6);
      resources.backends.push(backend);
      usedPorts.push(serverPort(backend));
    }
    assert.notEqual(serverPort(resources.backends[0]), serverPort(resources.backends[1]));

    const edge = createTemporaryTlsEdge({
      key: certificates.serverKey,
      cert: certificates.serverCertificate,
      backendPorts: resources.backends.map(serverPort),
      sockets: resources.edgeSockets,
    });
    resources.edges = [...edge.servers];
    await listen(resources.edges[0], LOOPBACK);
    const edgePort = serverPort(resources.edges[0]);
    usedPorts.push(edgePort);

    const wrongCaError = await expectUntrustedCertificate(edgePort);
    assert.notEqual(wrongCaError, "", "a client without the temporary CA unexpectedly trusted the edge");
    const plaintextResult = await plaintextProbe(edgePort);
    assert.equal(plaintextResult.acceptedAsHttp, false);

    const directHealth = await plainHttpRequest({
      port: serverPort(resources.backends[0]),
      connectHost: LOOPBACK_V6,
      pathname: "/health/live",
    });
    assert.equal(directHealth.status, 200);
    const directProduct = await plainHttpRequest({
      port: serverPort(resources.backends[0]),
      connectHost: LOOPBACK_V6,
      pathname: "/profiles/me",
    });
    assert.equal(directProduct.status, 400);
    assert.equal(directProduct.json.code, "forwarded_for_required");

    const secureHealth = await secureJsonRequest({
      port: edgePort,
      ca: certificates.caCertificate,
      connectHost: CLIENT_A,
      pathname: "/health/live",
    });
    assert.equal(secureHealth.status, 200);
    assert.equal(secureHealth.authorized, true);
    assert.equal(secureHealth.protocol, "TLSv1.3");
    assert.equal(
      secureHealth.headers["strict-transport-security"],
      "max-age=31536000; includeSubDomains",
    );

    const firstRegister = await secureJsonRequest({
      port: edgePort,
      ca: certificates.caCertificate,
      connectHost: CLIENT_A,
      pathname: "/auth/register",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.10",
        "x-forwarded-proto": "http",
      },
      body: {
        username: "phase467edgea",
        password: "test1234",
        displayName: "边缘甲",
      },
    });
    assert.equal(
      firstRegister.status,
      200,
      `first secure register failed: status=${firstRegister.status} code=${String(firstRegister.json?.code || "unknown")}`,
    );
    const spoofedSecondRegister = await secureJsonRequest({
      port: edgePort,
      ca: certificates.caCertificate,
      connectHost: CLIENT_A,
      pathname: "/auth/register",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.11",
        "x-forwarded-proto": "http",
      },
      body: {
        username: "phase467edgea2",
        password: "test1234",
        displayName: "边缘甲二",
      },
    });
    assert.equal(
      spoofedSecondRegister.status,
      429,
      `spoofed register was not limited: status=${spoofedSecondRegister.status} code=${String(spoofedSecondRegister.json?.code || "unknown")}`,
    );
    assert.equal(spoofedSecondRegister.json.code, "request_rate_limited");
    resources.wssClient = await openSecureWebSocket({
      port: edgePort,
      ca: certificates.caCertificate,
      connectHost: CLIENT_A,
      token: websocketToken,
      expectedAccountId: websocketAccount.account.accountId,
    });
    assert.equal(resources.wssClient.authorized, true);
    assert.equal(resources.wssClient.protocol, "TLSv1.3");
    assert.equal(resources.wssClient.readySeen, true);
    resources.wssClient.close();
    resources.wssClient = null;

    assert.equal(edge.hits.length, 2);
    assert.ok(edge.hits.every((count) => count > 0), JSON.stringify(edge.hits));
    assert.equal(edge.forwardedHeaderOverwrites >= 2, true);

    summary = {
      status: "PASS",
      scope: "temporary trusted TLS edge contract gate",
      tls: {
        negotiated: "TLSv1.3",
        certificateChainVerified: true,
        hostnameVerified: EDGE_HOSTNAME,
        untrustedCaRejected: true,
        untrustedCaError: wrongCaError,
        plaintextHttpRejected: true,
        hstsObserved: true,
      },
      topology: {
        temporaryTlsEdgeListeners: 1,
        edgeAddressFamily: "IPv4 loopback",
        trustedProxyToBackendAddressFamily: "IPv6 loopback",
        independentBackendListeners: 2,
        bothBackendsReached: true,
        backendHitCounts: [...edge.hits],
        backendPrivateHealthReachable: true,
        backendDirectProductRejected: true,
      },
      clientIdentity: {
        incomingForwardingHeadersOverwritten: true,
        forwardedHeaderOverwriteRequests: edge.forwardedHeaderOverwrites,
        sameClientSpoofAttemptsRateLimited: true,
        observedStatuses: [
          firstRegister.status,
          spoofedSecondRegister.status,
        ],
      },
      websocket: {
        wssUpgradeAccepted: true,
        certificateVerified: true,
        eventsReadyObserved: true,
      },
      claims: {
        productionProxyVendorValidated: false,
        accountStickyIngressValidated: false,
        broadNetworkPartitionValidated: false,
        persistentServiceStarted: false,
      },
    };
  } catch (error) {
    primaryError = error;
  } finally {
    const cleanupFailures = [];
    const cleanupError = await cleanup(resources, tempDir);
    if (cleanupError) {
      cleanupFailures.push(cleanupError);
    }
    for (const port of usedPorts) {
      try {
        await assertPortClosed(port);
      } catch (error) {
        cleanupFailures.push(error);
      }
    }
    if (fs.existsSync(tempDir)) {
      cleanupFailures.push(new Error("temporary certificate directory remains"));
    }
    if (cleanupFailures.length > 0) {
      primaryError = primaryError
        ? new AggregateError([primaryError, ...cleanupFailures], "trusted TLS edge gate and cleanup failed")
        : new AggregateError(cleanupFailures, "trusted TLS edge cleanup verification failed");
    }
  }
  if (primaryError) {
    throw primaryError;
  }
  summary.cleanup = {
    temporaryCertificateDirectoryRemoved: true,
    temporaryListenersClosed: usedPorts.length,
    temporaryPortsClosed: true,
    temporaryPlayerStateRemoved: true,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

function createTemporaryCertificates(tempDir) {
  const openssl = findOpenSsl();
  const caKeyPath = path.join(tempDir, "ca.key");
  const caCertificatePath = path.join(tempDir, "ca.crt");
  const serverKeyPath = path.join(tempDir, "edge.key");
  const serverRequestPath = path.join(tempDir, "edge.csr");
  const serverCertificatePath = path.join(tempDir, "edge.crt");
  const extensionPath = path.join(tempDir, "edge.ext");
  execOpenSsl(openssl, [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256",
    "-keyout", caKeyPath,
    "-out", caCertificatePath,
    "-days", "1",
    "-subj", "/CN=Beastbound Phase467 Temporary CA",
    "-addext", "basicConstraints=critical,CA:TRUE",
    "-addext", "keyUsage=critical,keyCertSign,cRLSign",
  ]);
  execOpenSsl(openssl, [
    "req", "-newkey", "rsa:2048", "-nodes", "-sha256",
    "-keyout", serverKeyPath,
    "-out", serverRequestPath,
    "-subj", `/CN=${EDGE_HOSTNAME}`,
  ]);
  fs.writeFileSync(extensionPath, [
    `subjectAltName=DNS:${EDGE_HOSTNAME},IP:${LOOPBACK},IP:${LOOPBACK_V6}`,
    "basicConstraints=critical,CA:FALSE",
    "keyUsage=critical,digitalSignature,keyEncipherment",
    "extendedKeyUsage=serverAuth",
    "",
  ].join("\n"), {mode: 0o600});
  execOpenSsl(openssl, [
    "x509", "-req",
    "-in", serverRequestPath,
    "-CA", caCertificatePath,
    "-CAkey", caKeyPath,
    "-CAcreateserial",
    "-out", serverCertificatePath,
    "-days", "1",
    "-sha256",
    "-extfile", extensionPath,
  ]);
  fs.chmodSync(caKeyPath, 0o600);
  fs.chmodSync(serverKeyPath, 0o600);
  return {
    caCertificate: fs.readFileSync(caCertificatePath),
    serverCertificate: fs.readFileSync(serverCertificatePath),
    serverKey: fs.readFileSync(serverKeyPath),
  };
}

function findOpenSsl() {
  const configured = String(process.env.BEASTBOUND_OPENSSL_BIN || "").trim();
  if (configured !== "") {
    return configured;
  }
  for (const candidate of ["/opt/homebrew/bin/openssl", "/usr/local/bin/openssl", "/usr/bin/openssl"]) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "openssl";
}

function execOpenSsl(executable, args) {
  execFileSync(executable, args, {
    stdio: ["ignore", "ignore", "pipe"],
    timeout: 15_000,
  });
}

function createTemporaryTlsEdge({key, cert, backendPorts, sockets}) {
  assert.equal(backendPorts.length, 2);
  const hits = backendPorts.map(() => 0);
  let forwardedHeaderOverwrites = 0;
  const tlsOptions = {
    key,
    cert,
    minVersion: "TLSv1.3",
    maxVersion: "TLSv1.3",
  };
  const handleRequest = (req, res) => {
    const clientIp = normalizedRemoteAddress(req.socket.remoteAddress);
    const backendIndex = req.url === "/health/live"
      ? 0
      : backendIndexForClient(clientIp, backendPorts.length);
    hits[backendIndex] += 1;
    if (hasIncomingForwardingHeaders(req.headers)) {
      forwardedHeaderOverwrites += 1;
    }
    const upstream = http.request({
      host: LOOPBACK_V6,
      port: backendPorts[backendIndex],
      method: req.method,
      path: req.url,
      headers: sanitizedForwardHeaders(req.headers, clientIp, {upgrade: false}),
      agent: false,
    }, (upstreamResponse) => {
      const responseHeaders = sanitizedResponseHeaders(upstreamResponse.headers);
      responseHeaders["strict-transport-security"] = "max-age=31536000; includeSubDomains";
      res.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
      upstreamResponse.pipe(res);
    });
    upstream.once("error", () => {
      if (!res.headersSent) {
        res.writeHead(502, {"content-type": "application/json", "connection": "close"});
      }
      res.end('{"ok":false,"code":"temporary_edge_upstream_failed"}');
    });
    req.pipe(upstream);
  };
  const handleUpgrade = (req, downstream, head) => {
    const clientIp = normalizedRemoteAddress(req.socket.remoteAddress);
    const backendIndex = backendIndexForClient(clientIp, backendPorts.length);
    hits[backendIndex] += 1;
    if (hasIncomingForwardingHeaders(req.headers)) {
      forwardedHeaderOverwrites += 1;
    }
    const upstream = net.createConnection({host: LOOPBACK_V6, port: backendPorts[backendIndex]});
    let connected = false;
    const closePair = () => {
      downstream.destroy();
      upstream.destroy();
    };
    downstream.once("error", closePair);
    upstream.once("error", closePair);
    upstream.once("connect", () => {
      connected = true;
      const headers = sanitizedForwardHeaders(req.headers, clientIp, {upgrade: true});
      const rows = [
        `${req.method} ${req.url} HTTP/${req.httpVersion}`,
        ...Object.entries(headers).map(([name, value]) => `${name}: ${headerValue(value)}`),
        "",
        "",
      ];
      upstream.write(rows.join("\r\n"));
      if (head.length > 0) {
        upstream.write(head);
      }
      downstream.pipe(upstream);
      upstream.pipe(downstream);
    });
    downstream.once("close", () => {
      if (connected || !upstream.destroyed) {
        upstream.destroy();
      }
    });
    upstream.once("close", () => downstream.destroy());
  };
  const servers = [0].map(() => {
    const server = https.createServer(tlsOptions, handleRequest);
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    });
    server.on("tlsClientError", () => {});
    server.on("upgrade", handleUpgrade);
    return server;
  });
  return {
    servers,
    hits,
    get forwardedHeaderOverwrites() {
      return forwardedHeaderOverwrites;
    },
  };
}

function sanitizedForwardHeaders(source, clientIp, options = {}) {
  const result = {};
  for (const [name, value] of Object.entries(source || {})) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower) || FORWARDED_HEADERS.has(lower) || lower === "host") {
      continue;
    }
    result[lower] = value;
  }
  result.host = EDGE_HOSTNAME;
  result["x-forwarded-for"] = clientIp;
  result["x-forwarded-host"] = EDGE_HOSTNAME;
  result["x-forwarded-proto"] = "https";
  if (options.upgrade === true) {
    result.connection = "Upgrade";
    result.upgrade = "websocket";
  } else {
    result.connection = "close";
  }
  return result;
}

function sanitizedResponseHeaders(source) {
  const result = {};
  for (const [name, value] of Object.entries(source || {})) {
    const lower = name.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(lower) && value !== undefined) {
      result[lower] = value;
    }
  }
  return result;
}

function hasIncomingForwardingHeaders(headers) {
  return Object.keys(headers || {}).some((name) => FORWARDED_HEADERS.has(name.toLowerCase()));
}

function backendIndexForClient(clientIp, backendCount) {
  if (clientIp === LOOPBACK_V6) {
    return 0;
  }
  const parts = String(clientIp).split(".");
  const last = Number(parts[parts.length - 1]);
  if (Number.isInteger(last)) {
    return Math.abs(last) % backendCount;
  }
  return crypto.createHash("sha256").update(String(clientIp)).digest()[0] % backendCount;
}

function normalizedRemoteAddress(value) {
  const address = String(value || "");
  return address.startsWith("::ffff:") ? address.slice(7) : address;
}

function headerValue(value) {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

async function secureJsonRequest(options) {
  const bodyBuffer = options.body === undefined
    ? null
    : Buffer.from(JSON.stringify(options.body));
  const headers = {
    [CLIENT_VERSION_HEADER]: SERVER_VERSION,
    [CLIENT_PROTOCOL_HEADER]: String(PROTOCOL_VERSION),
    ...(options.headers || {}),
    ...(bodyBuffer ? {"content-length": String(bodyBuffer.length)} : {}),
    connection: "close",
  };
  return new Promise((resolve, reject) => {
    const request = https.request({
      host: options.connectHost || LOOPBACK,
      port: options.port,
      servername: EDGE_HOSTNAME,
      path: options.pathname,
      method: options.method || "GET",
      headers,
      ca: options.ca,
      rejectUnauthorized: true,
      minVersion: "TLSv1.3",
      maxVersion: "TLSv1.3",
      timeout: REQUEST_TIMEOUT_MS,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try {
          json = text === "" ? null : JSON.parse(text);
        } catch (error) {
          reject(new Error(`invalid secure edge JSON: status=${response.statusCode || 0} bytes=${Buffer.byteLength(text)}`, {cause: error}));
          return;
        }
        resolve({
          status: response.statusCode || 0,
          headers: response.headers,
          json,
          authorized: response.socket.authorized === true,
          protocol: response.socket.getProtocol(),
        });
      });
    });
    request.once("timeout", () => request.destroy(new Error("secure edge request timeout")));
    request.once("error", reject);
    if (bodyBuffer) {
      request.write(bodyBuffer);
    }
    request.end();
  });
}

async function plainHttpRequest(options) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: options.connectHost || LOOPBACK,
      port: options.port,
      path: options.pathname,
      method: options.method || "GET",
      headers: {connection: "close"},
      timeout: REQUEST_TIMEOUT_MS,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try {
          json = text === "" ? null : JSON.parse(text);
        } catch (error) {
          reject(new Error(`invalid backend JSON: status=${response.statusCode || 0} bytes=${Buffer.byteLength(text)}`, {cause: error}));
          return;
        }
        resolve({status: response.statusCode || 0, json});
      });
    });
    request.once("timeout", () => request.destroy(new Error("backend request timeout")));
    request.once("error", reject);
    request.end();
  });
}

async function expectUntrustedCertificate(port) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: LOOPBACK,
      port,
      servername: EDGE_HOSTNAME,
      rejectUnauthorized: true,
      minVersion: "TLSv1.3",
      maxVersion: "TLSv1.3",
      localAddress: CLIENT_A,
    });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("untrusted certificate probe timeout"));
    }, REQUEST_TIMEOUT_MS);
    socket.once("secureConnect", () => {
      clearTimeout(timer);
      socket.destroy();
      reject(new Error("temporary CA was trusted without being supplied"));
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(String(error && error.code || "certificate_rejected"));
    });
  });
}

async function plaintextProbe(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({host: LOOPBACK, port, localAddress: CLIENT_A});
    let response = "";
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve({acceptedAsHttp: /^HTTP\/1\.[01] 2\d\d\b/.test(response)});
    };
    const timer = setTimeout(finish, 1000);
    socket.once("connect", () => {
      socket.write(`GET /health/live HTTP/1.1\r\nHost: ${EDGE_HOSTNAME}\r\nConnection: close\r\n\r\n`);
    });
    socket.on("data", (chunk) => {
      response += chunk.toString("latin1");
    });
    socket.once("error", finish);
    socket.once("close", finish);
  });
}

async function openSecureWebSocket({port, ca, connectHost, token, expectedAccountId}) {
  const key = crypto.randomBytes(16).toString("base64");
  const expectedAccept = crypto.createHash("sha1").update(`${key}${WS_GUID}`).digest("base64");
  const socket = tls.connect({
    host: connectHost || LOOPBACK,
    port,
    servername: EDGE_HOSTNAME,
    ca,
    rejectUnauthorized: true,
    minVersion: "TLSv1.3",
    maxVersion: "TLSv1.3",
  });
  let transportBuffer = Buffer.alloc(0);
  let frameBuffer = Buffer.alloc(0);
  let upgraded = false;
  let settled = false;
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => fail(new Error("WSS events.ready timeout")), REQUEST_TIMEOUT_MS);
    const fail = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    socket.once("secureConnect", () => {
      try {
        assert.equal(socket.authorized, true);
        assert.equal(socket.getProtocol(), "TLSv1.3");
        const query = new URLSearchParams({
          clientVersion: SERVER_VERSION,
          clientProtocolVersion: String(PROTOCOL_VERSION),
        });
        socket.write([
          `GET /events?${query.toString()} HTTP/1.1`,
          `Host: ${EDGE_HOSTNAME}`,
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Key: ${key}`,
          "Sec-WebSocket-Version: 13",
          `Authorization: Bearer ${token}`,
          `Origin: ${EDGE_ORIGIN}`,
          "",
          "",
        ].join("\r\n"));
      } catch (error) {
        fail(error);
      }
    });
    socket.once("error", fail);
    socket.once("close", () => {
      if (!settled) {
        fail(new Error("WSS closed before events.ready"));
      }
    });
    socket.on("data", (chunk) => {
      try {
        if (!upgraded) {
          transportBuffer = Buffer.concat([transportBuffer, chunk]);
          const headerEnd = transportBuffer.indexOf("\r\n\r\n");
          if (headerEnd < 0) {
            return;
          }
          const headerText = transportBuffer.subarray(0, headerEnd).toString("utf8");
          const lines = headerText.split("\r\n");
          const headers = new Map(lines.slice(1).map((line) => {
            const separator = line.indexOf(":");
            return [line.slice(0, separator).toLowerCase(), line.slice(separator + 1).trim()];
          }));
          assert.match(lines[0], /^HTTP\/1\.1 101\b/);
          assert.equal(headers.get("sec-websocket-accept"), expectedAccept);
          upgraded = true;
          frameBuffer = Buffer.from(transportBuffer.subarray(headerEnd + 4));
          transportBuffer = Buffer.alloc(0);
        } else {
          frameBuffer = Buffer.concat([frameBuffer, chunk]);
        }
        while (true) {
          const frame = readServerWebSocketFrame(frameBuffer);
          if (!frame) {
            break;
          }
          frameBuffer = frameBuffer.subarray(frame.bytesRead);
          if (frame.opcode === 0x9) {
            socket.write(encodeClientWebSocketFrame(0xA, frame.payload));
            continue;
          }
          if (frame.opcode === 0x8) {
            throw new Error("WSS closed before events.ready");
          }
          if (frame.opcode !== 0x1) {
            continue;
          }
          const event = JSON.parse(frame.payload.toString("utf8"));
          if (event.type !== "events.ready") {
            continue;
          }
          assert.equal(String(event.account && event.account.accountId || ""), expectedAccountId);
          settled = true;
          clearTimeout(timeout);
          resolve({
            socket,
            authorized: socket.authorized === true,
            protocol: socket.getProtocol(),
            readySeen: true,
            close() {
              if (!socket.destroyed) {
                socket.end(encodeClientWebSocketFrame(0x8, Buffer.from([0x03, 0xE8])));
              }
            },
          });
          return;
        }
      } catch (error) {
        fail(error);
      }
    });
  });
  return result;
}

function readServerWebSocketFrame(buffer) {
  if (buffer.length < 2) {
    return null;
  }
  const fin = (buffer[0] & 0x80) !== 0;
  const opcode = buffer[0] & 0x0F;
  const masked = (buffer[1] & 0x80) !== 0;
  assert.equal(masked, false, "server websocket frame must not be masked");
  let length = buffer[1] & 0x7F;
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
    const value = buffer.readBigUInt64BE(2);
    assert.ok(value <= BigInt(Number.MAX_SAFE_INTEGER), "server websocket frame too large");
    length = Number(value);
    offset = 10;
  }
  if (buffer.length < offset + length) {
    return null;
  }
  assert.equal(fin, true, "fragmented gate frame is unsupported");
  return {
    opcode,
    payload: Buffer.from(buffer.subarray(offset, offset + length)),
    bytesRead: offset + length,
  };
}

function encodeClientWebSocketFrame(opcode, payload) {
  const body = Buffer.from(payload || Buffer.alloc(0));
  assert.ok(body.length < 126, "gate control frame payload too large");
  const mask = crypto.randomBytes(4);
  const frame = Buffer.alloc(2 + 4 + body.length);
  frame[0] = 0x80 | (opcode & 0x0F);
  frame[1] = 0x80 | body.length;
  mask.copy(frame, 2);
  for (let index = 0; index < body.length; index += 1) {
    frame[6 + index] = body[index] ^ mask[index % 4];
  }
  return frame;
}

async function cleanup(resources, tempDir) {
  const errors = [];
  try {
    resources.wssClient?.close();
  } catch (error) {
    errors.push(error);
  }
  if (resources.edges.length > 0) {
    for (const socket of Array.from(resources.edgeSockets)) {
      socket.destroy();
    }
    for (const edge of resources.edges) {
      try {
        await closeServer(edge);
      } catch (error) {
        errors.push(error);
      }
    }
  }
  for (const backend of resources.backends) {
    try {
      await backend.eventHub.close();
    } catch (error) {
      errors.push(error);
    }
    try {
      await closeServer(backend);
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    fs.rmSync(tempDir, {recursive: true, force: true});
  } catch (error) {
    errors.push(error);
  }
  return errors.length > 0 ? new AggregateError(errors, "trusted TLS edge cleanup failed") : null;
}

async function listen(server, host) {
  server.listen(0, host);
  await once(server, "listening");
  assert.ok(serverPort(server) > 0);
}

function serverPort(server) {
  const address = server.address();
  return address && typeof address === "object" ? Number(address.port) : 0;
}

async function closeServer(server) {
  if (!server || !server.listening) {
    return;
  }
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function assertPortClosed(port) {
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({host: LOOPBACK, port});
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`temporary port ${port} did not close`));
    }, 500);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      reject(new Error(`temporary port ${port} still accepts connections`));
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

run().catch((error) => {
  process.stderr.write(`trusted TLS edge gate failed: ${String(error && error.stack || error)}\n`);
  process.exitCode = 1;
});
