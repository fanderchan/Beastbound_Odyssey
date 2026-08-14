"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const {
  createConfiguredClusterEventRuntime,
} = require("../src/cluster-event-runtime-config");
const {
  createHttpServer,
} = require("../src/http-server");

test("cluster runtime defaults to single node and rejects unproven or insecure Valkey topology", async () => {
  const single = await createConfiguredClusterEventRuntime({});
  assert.equal(single.enabled, false);
  assert.deepEqual(single.eventHubOptions, {});

  await assert.rejects(
    createConfiguredClusterEventRuntime({
      BEASTBOUND_CLUSTER_MODE: "valkey",
      BEASTBOUND_CLUSTER_NODE_ID: "node-a",
      BEASTBOUND_CLUSTER_VALKEY_HOST: "127.0.0.1",
    }),
    (error) => error && error.code === "cluster_account_sticky_required",
  );
  await assert.rejects(
    createConfiguredClusterEventRuntime({
      BEASTBOUND_CLUSTER_MODE: "valkey",
      BEASTBOUND_CLUSTER_NODE_ID: "node-a",
      BEASTBOUND_CLUSTER_VALKEY_HOST: "valkey.internal.example",
      BEASTBOUND_CLUSTER_VALKEY_TLS: "0",
      BEASTBOUND_CLUSTER_ACCOUNT_STICKY: "1",
    }),
    (error) => error && error.code === "cluster_valkey_plaintext_remote_forbidden",
  );
  await assert.rejects(
    createConfiguredClusterEventRuntime({
      BEASTBOUND_CLUSTER_MODE: "unknown",
    }),
    (error) => error && error.code === "cluster_mode_invalid",
  );
});

test("cluster runtime passes a bounded loopback Valkey configuration without exposing credentials", async () => {
  const calls = [];
  let closeCalls = 0;
  const bridge = {
    capabilities: {},
    publish() {},
    subscribe() { return () => {}; },
    async close() { closeCalls += 1; },
  };
  const runtime = await createConfiguredClusterEventRuntime({
    BEASTBOUND_CLUSTER_MODE: "valkey",
    BEASTBOUND_CLUSTER_NODE_ID: "node-a",
    BEASTBOUND_CLUSTER_VALKEY_HOST: "127.0.0.1",
    BEASTBOUND_CLUSTER_VALKEY_PORT: "6380",
    BEASTBOUND_CLUSTER_VALKEY_TLS: "0",
    BEASTBOUND_CLUSTER_ACCOUNT_STICKY: "true",
    BEASTBOUND_CLUSTER_VALKEY_STREAM_MAXLEN: "4096",
    BEASTBOUND_CLUSTER_VALKEY_PASSWORD: "secret-not-for-logs",
  }, {
    async bridgeFactory(options) {
      calls.push(options);
      return bridge;
    },
  });

  assert.equal(runtime.enabled, true);
  assert.equal(runtime.eventHubOptions.clusterRequired, true);
  assert.equal(runtime.eventHubOptions.clusterNodeId, "node-a");
  assert.equal(calls[0].connection.port, 6380);
  assert.equal(calls[0].connection.useTLS, false);
  assert.equal(calls[0].maxStreamLength, 4096);
  assert.equal(calls[0].connection.password, "secret-not-for-logs");
  assert.equal(JSON.stringify(runtime.eventHubOptions).includes("secret-not-for-logs"), false);
  await runtime.close();
  await runtime.close();
  assert.equal(closeCalls, 1);
});

test("ready health fails closed when a required cluster relay is unhealthy", async (t) => {
  const eventHub = {
    handleUpgrade() { return false; },
    close() { return Promise.resolve(); },
    clientCount() { return 0; },
    metrics() {
      return {
        clusterRelay: {
          enabled: true,
          required: true,
          runtimeHealthy: false,
        },
      };
    },
  };
  const server = createHttpServer({service: {}, eventHub, logger: false});
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await requestJson(server.address().port, "/health/ready");
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.eventStream.clusterRelay.runtimeHealthy, false);
});

function requestJson(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get({host: "127.0.0.1", port, path}, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        statusCode: res.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
      }));
    });
    req.on("error", reject);
  });
}
