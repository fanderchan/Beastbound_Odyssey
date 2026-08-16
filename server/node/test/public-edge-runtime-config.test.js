"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  EDGE_MODE_DIRECT,
  EDGE_MODE_TRUSTED_TLS_PROXY,
  createPublicEdgeRuntimeConfig,
  isPrivateOrLoopbackHost,
} = require("../src/public-edge-runtime-config");

test("public edge runtime defaults to direct mode without inventing proxy trust", () => {
  const config = createPublicEdgeRuntimeConfig({}, {backendHost: "127.0.0.1"});
  assert.equal(config.mode, EDGE_MODE_DIRECT);
  assert.deepEqual(config.trustedProxies, []);
  assert.deepEqual(config.allowedOrigins, []);
  assert.equal(config.networkAdmissionOptions.requireTrustedTlsProxy, false);
  assert.equal(config.summary.tlsTerminatedAtTrustedProxy, false);
});

test("trusted TLS proxy mode requires a bounded trusted proxy and private backend bind", () => {
  for (const [env, code] of [
    [{BEASTBOUND_EDGE_MODE: "invalid"}, "public_edge_mode_invalid"],
    [{BEASTBOUND_EDGE_MODE: EDGE_MODE_TRUSTED_TLS_PROXY}, "public_edge_trusted_proxy_required"],
    [{
      BEASTBOUND_EDGE_MODE: EDGE_MODE_TRUSTED_TLS_PROXY,
      BEASTBOUND_TRUSTED_PROXIES: "0.0.0.0/0",
    }, "public_edge_trust_all_forbidden"],
    [{
      BEASTBOUND_EDGE_MODE: EDGE_MODE_TRUSTED_TLS_PROXY,
      BEASTBOUND_TRUSTED_PROXIES: "10.20.0.0/0",
    }, "public_edge_trust_all_forbidden"],
    [{
      BEASTBOUND_EDGE_MODE: EDGE_MODE_TRUSTED_TLS_PROXY,
      BEASTBOUND_TRUSTED_PROXIES: "2001:db8::/0",
    }, "public_edge_trust_all_forbidden"],
    [{
      BEASTBOUND_EDGE_MODE: EDGE_MODE_TRUSTED_TLS_PROXY,
      BEASTBOUND_TRUSTED_PROXIES: "bad-proxy",
    }, "public_edge_trusted_proxy_invalid"],
  ]) {
    assert.throws(
      () => createPublicEdgeRuntimeConfig(env, {backendHost: "127.0.0.1"}),
      (error) => error && error.code === code,
    );
  }
  assert.throws(
    () => createPublicEdgeRuntimeConfig({
      BEASTBOUND_EDGE_MODE: EDGE_MODE_TRUSTED_TLS_PROXY,
      BEASTBOUND_TRUSTED_PROXIES: "10.0.0.10",
    }, {backendHost: "0.0.0.0"}),
    (error) => error && error.code === "public_edge_backend_bind_unsafe",
  );
  assert.equal(isPrivateOrLoopbackHost("127.0.0.1"), true);
  assert.equal(isPrivateOrLoopbackHost("10.20.30.40"), true);
  assert.equal(isPrivateOrLoopbackHost("172.31.0.5"), true);
  assert.equal(isPrivateOrLoopbackHost("192.168.20.5"), true);
  assert.equal(isPrivateOrLoopbackHost("::1"), true);
  assert.equal(isPrivateOrLoopbackHost("fc00::10"), true);
  assert.equal(isPrivateOrLoopbackHost("fd12:3456::10"), true);
  assert.equal(isPrivateOrLoopbackHost("fe80::10"), true);
  assert.equal(isPrivateOrLoopbackHost("198.51.100.10"), false);
  assert.equal(isPrivateOrLoopbackHost("2001:db8::10"), false);
  assert.equal(isPrivateOrLoopbackHost("::"), false);
});

test("trusted TLS proxy mode accepts only canonical HTTPS browser origins", () => {
  const config = createPublicEdgeRuntimeConfig({
    BEASTBOUND_EDGE_MODE: EDGE_MODE_TRUSTED_TLS_PROXY,
    BEASTBOUND_TRUSTED_PROXIES: "127.0.0.1,10.20.0.0/16",
    BEASTBOUND_WS_ALLOWED_ORIGINS: "https://game.example,https://account.example",
  }, {backendHost: "127.0.0.1"});
  assert.equal(config.mode, EDGE_MODE_TRUSTED_TLS_PROXY);
  assert.equal(config.summary.trustedProxyCount, 2);
  assert.equal(config.summary.webSocketOriginCount, 2);
  assert.equal(config.networkAdmissionOptions.requireTrustedTlsProxy, true);
  assert.deepEqual(config.allowedOrigins, ["https://game.example", "https://account.example"]);

  for (const origin of [
    "http://game.example",
    "https://game.example/",
    "https://user:pass@game.example",
    "not-an-origin",
  ]) {
    assert.throws(
      () => createPublicEdgeRuntimeConfig({
        BEASTBOUND_EDGE_MODE: EDGE_MODE_TRUSTED_TLS_PROXY,
        BEASTBOUND_TRUSTED_PROXIES: "127.0.0.1",
        BEASTBOUND_WS_ALLOWED_ORIGINS: origin,
      }, {backendHost: "127.0.0.1"}),
      (error) => error && error.code === "public_edge_ws_origin_invalid",
    );
  }
});
