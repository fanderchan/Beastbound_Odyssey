"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  BoundedTokenBucketLimiter,
  NetworkAdmissionError,
  createNetworkAdmission,
  createTrustedProxyMatcher,
  requestNetworkIdentity,
} = require("../src/network-admission");

function request(remoteAddress = "127.0.0.1", forwardedFor = "") {
  return {
    socket: {remoteAddress},
    headers: forwardedFor ? {"x-forwarded-for": forwardedFor} : {},
  };
}

test("network identity ignores forwarded headers unless the immediate peer is trusted", () => {
  const untrusted = requestNetworkIdentity(request("127.0.0.1", "198.51.100.7"));
  assert.equal(untrusted.clientIp, "127.0.0.1");
  assert.equal(untrusted.forwarded, false);

  const trustedProxy = createTrustedProxyMatcher(["127.0.0.0/8", "2001:db8::/32"]);
  const trusted = requestNetworkIdentity(
    request("127.0.0.1", "198.51.100.7, 127.0.0.2"),
    {trustedProxy},
  );
  assert.equal(trusted.clientIp, "198.51.100.7");
  assert.equal(trusted.forwarded, true);
  assert.equal(trustedProxy.matches("2001:db8::10"), true);
  assert.equal(trustedProxy.matches("2001:db9::10"), false);
});

test("trusted proxy parsing rejects malformed, overlong and all-trusted chains", () => {
  for (const invalid of ["127.0.0.1/", "127.0.0.1/01", "::1/"]) {
    assert.throws(() => createTrustedProxyMatcher([invalid]), /Invalid trusted proxy CIDR/);
  }
  const trustedProxy = createTrustedProxyMatcher(["127.0.0.0/8"]);
  for (const forwardedFor of [
    "bad-ip",
    "198.51.100.1,198.51.100.2,198.51.100.3,198.51.100.4",
    "127.0.0.2",
    "1".repeat(257),
  ]) {
    assert.throws(
      () => requestNetworkIdentity(request("127.0.0.1", forwardedFor), {trustedProxy}),
      (error) => error instanceof NetworkAdmissionError && error.code === "forwarded_for_invalid",
    );
  }
});

test("trusted TLS proxy mode rejects direct product traffic and invalid forwarding metadata", () => {
  assert.throws(
    () => createNetworkAdmission({requireTrustedTlsProxy: true}),
    (error) => error.code === "trusted_tls_proxy_configuration_invalid",
  );
  const admission = createNetworkAdmission({
    trustedProxies: ["127.0.0.1"],
    requireTrustedTlsProxy: true,
  });
  const directProduct = {...request("127.0.0.1"), url: "/profiles/me"};
  assert.throws(
    () => admission.networkIdentity(directProduct),
    (error) => error.code === "forwarded_for_required" && error.statusCode === 400,
  );
  for (const [forwardedFor, forwardedProto, code] of [
    ["", "https", "forwarded_for_required"],
    ["198.51.100.8", "", "forwarded_proto_invalid"],
    ["198.51.100.8", "http", "forwarded_proto_invalid"],
    ["198.51.100.8", "https,http", "forwarded_proto_invalid"],
  ]) {
    const req = {
      ...request("127.0.0.1", forwardedFor),
      url: "/profiles/me",
      headers: {
        ...(forwardedFor ? {"x-forwarded-for": forwardedFor} : {}),
        ...(forwardedProto ? {"x-forwarded-proto": forwardedProto} : {}),
      },
    };
    assert.throws(
      () => admission.networkIdentity(req),
      (error) => error.code === code,
    );
  }
  assert.throws(
    () => admission.networkIdentity({
      ...request("198.51.100.9", "198.51.100.8"),
      url: "/profiles/me",
      headers: {
        "x-forwarded-for": "198.51.100.8",
        "x-forwarded-proto": "https",
      },
    }),
    (error) => error.code === "trusted_tls_proxy_required" && error.statusCode === 403,
  );
  assert.throws(
    () => admission.networkIdentity({...request("127.0.0.1"), url: "/health/live?verbose=1"}),
    (error) => error.code === "forwarded_for_required" && error.statusCode === 400,
  );
});

test("trusted TLS proxy mode accepts secure forwarding while retaining direct private health", () => {
  const admission = createNetworkAdmission({
    trustedProxies: ["127.0.0.1"],
    requireTrustedTlsProxy: true,
  });
  const identity = admission.networkIdentity({
    ...request("127.0.0.1", "198.51.100.8"),
    url: "/profiles/me",
    headers: {
      "x-forwarded-for": "198.51.100.8",
      "x-forwarded-proto": "https",
    },
  });
  assert.equal(identity.clientIp, "198.51.100.8");
  assert.equal(identity.forwarded, true);
  assert.equal(identity.secureTransport, true);
  assert.equal(identity.directHealth, false);

  const health = admission.networkIdentity({...request("127.0.0.1"), url: "/health/ready"});
  assert.equal(health.clientIp, "127.0.0.1");
  assert.equal(health.forwarded, false);
  assert.equal(health.secureTransport, false);
  assert.equal(health.directHealth, true);

  const metrics = admission.metrics();
  assert.equal(metrics.edgeMode, "trusted_tls_proxy");
  assert.equal(metrics.secureProxyRequired, true);
  assert.equal(metrics.trustedProxyCount, 1);
  assert.equal(metrics.directHealthAllowed, true);
});

test("bounded token buckets refill, expire and fail closed at the key cap", () => {
  let nowMs = 1000;
  const limiter = new BoundedTokenBucketLimiter({now: () => nowMs, ttlMs: 100, maxKeys: 2});
  assert.equal(limiter.consume("a", {capacity: 2, windowMs: 1000}).ok, true);
  assert.equal(limiter.consume("a", {capacity: 2, windowMs: 1000}).ok, true);
  const limited = limiter.consume("a", {capacity: 2, windowMs: 1000});
  assert.equal(limited.ok, false);
  assert.equal(limited.retryAfterMs, 500);
  assert.equal(limiter.consume("b", {capacity: 1, windowMs: 1000}).ok, true);
  assert.equal(limiter.consume("c", {capacity: 1, windowMs: 1000}).capacityLimited, true);
  assert.equal(limiter.metrics().keys, 2);
  nowMs += 101;
  assert.equal(limiter.consume("c", {capacity: 1, windowMs: 1000}).ok, true);
  assert.equal(limiter.metrics().keys, 1);
});

test("HTTP admission counts active requests once and releases them idempotently", () => {
  const admission = createNetworkAdmission({maxActiveHttp: 1, grossCapacity: 10});
  const first = admission.beginHttp(request());
  assert.equal(admission.metrics().activeHttp, 1);
  assert.throws(
    () => admission.beginHttp(request()),
    (error) => error.code === "http_capacity_full" && error.statusCode === 503,
  );
  first.release();
  first.release();
  assert.equal(admission.metrics().activeHttp, 0);
  const second = admission.beginHttp(request());
  second.release();
  assert.equal(admission.metrics().peakActiveHttp, 1);
});

test("HTTP response diagnostics retain only bounded phase maxima", () => {
  const admission = createNetworkAdmission();
  admission.observeHttpResponse({
    method: "get",
    route: "/profiles/me",
    statusCode: 200,
    responseBytes: 120,
    preSendMs: 2,
    metadataMs: 0.1,
    serializeMs: 1,
    byteLengthMs: 0.2,
    writeHeadMs: 0.3,
    endMs: 0.4,
    sendTotalMs: 2,
  });
  admission.observeHttpResponse({
    method: "POST",
    route: "/battle/rooms/:id/commands",
    statusCode: 200,
    responseBytes: 80,
    preSendMs: 8,
    metadataMs: 0.05,
    serializeMs: 0.5,
    byteLengthMs: 0.1,
    writeHeadMs: 0.2,
    endMs: 4,
    sendTotalMs: 5,
  });
  admission.observeHttpServiceCall({serviceMethod: "getProfile", route: "/profiles/me", durationMs: 3});
  admission.observeHttpServiceCall({serviceMethod: "leaveBattleRoom", route: "/battle/rooms/:id/leave", durationMs: 9});

  const observed = admission.metrics().httpResponses;
  assert.equal(observed.count, 2);
  assert.equal(observed.bytes, 200);
  assert.equal(observed.serviceCalls, 2);
  assert.deepEqual(observed.serviceSyncMax, {
    serviceMethod: "leaveBattleRoom",
    route: "/battle/rooms/:id/leave",
    durationMs: 9,
  });
  assert.deepEqual(observed.maxBytes, {
    method: "GET",
    route: "/profiles/me",
    statusCode: 200,
    responseBytes: 120,
  });
  assert.equal(observed.phaseMax.preSend.route, "/battle/rooms/:id/commands");
  assert.equal(observed.phaseMax.preSend.durationMs, 8);
  assert.equal(observed.phaseMax.serialize.route, "/profiles/me");
  assert.equal(observed.phaseMax.serialize.durationMs, 1);
  assert.equal(observed.phaseMax.end.durationMs, 4);
  assert.equal(observed.phaseMax.sendTotal.durationMs, 5);
  assert.deepEqual(Object.keys(observed.phaseMax), [
    "preSend",
    "metadata",
    "serialize",
    "byteLength",
    "writeHead",
    "end",
    "sendTotal",
  ]);
});
