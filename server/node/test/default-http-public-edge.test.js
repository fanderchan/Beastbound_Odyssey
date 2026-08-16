"use strict";

const assert = require("node:assert/strict");
const {once} = require("node:events");
const test = require("node:test");
const {
  createMemoryAuthStore,
} = require("../src/auth-service");
const {
  startDefaultHttpServer,
} = require("../src/http-server");

test("default HTTP entry applies trusted TLS edge configuration from its supplied environment", async (t) => {
  let clusterClosed = 0;
  const server = await startDefaultHttpServer({
    env: {
      BEASTBOUND_AUTH_HOST: "127.0.0.1",
      BEASTBOUND_AUTH_PORT: "0",
      BEASTBOUND_EDGE_MODE: "trusted_tls_proxy",
      BEASTBOUND_TRUSTED_PROXIES: "127.0.0.1",
      BEASTBOUND_WS_ALLOWED_ORIGINS: "https://game.example",
    },
    async createClusterRuntime() {
      return {
        eventHubOptions: {},
        accountAdmission: null,
        battleRuntime: null,
        async close() {
          clusterClosed += 1;
        },
      };
    },
    createStore() {
      return createMemoryAuthStore();
    },
    onClusterError() {},
  });
  t.after(async () => {
    await server.eventHub.close();
    if (server.listening) {
      const closed = once(server, "close");
      server.close();
      await closed;
    }
    await server.clusterEventRuntime.close();
    assert.equal(clusterClosed, 1);
  });

  assert.deepEqual(server.publicEdgeRuntime, {
    mode: "trusted_tls_proxy",
    tlsTerminatedAtTrustedProxy: true,
    backendPrivateBindRequired: true,
    trustedProxyCount: 1,
    webSocketOriginCount: 1,
  });
  assert.equal(server.networkAdmission.metrics().edgeMode, "trusted_tls_proxy");

  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(`${base}/health/live`);
  assert.equal(health.status, 200);
  const directProduct = await fetch(`${base}/profiles/me`);
  assert.equal(directProduct.status, 400);
  assert.equal((await directProduct.json()).code, "forwarded_for_required");
});

test("default HTTP entry rejects an unsafe trusted TLS backend bind before starting dependencies", async () => {
  let clusterStarts = 0;
  let storeStarts = 0;
  await assert.rejects(
    startDefaultHttpServer({
      env: {
        BEASTBOUND_AUTH_HOST: "0.0.0.0",
        BEASTBOUND_AUTH_PORT: "0",
        BEASTBOUND_EDGE_MODE: "trusted_tls_proxy",
        BEASTBOUND_TRUSTED_PROXIES: "127.0.0.1",
      },
      async createClusterRuntime() {
        clusterStarts += 1;
        throw new Error("cluster must not start");
      },
      createStore() {
        storeStarts += 1;
        throw new Error("store must not start");
      },
    }),
    (error) => error && error.code === "public_edge_backend_bind_unsafe",
  );
  assert.equal(clusterStarts, 0);
  assert.equal(storeStarts, 0);
});
