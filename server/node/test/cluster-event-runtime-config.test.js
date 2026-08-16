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
  assert.equal(single.accountAdmission, null);
  assert.equal(single.battleRuntime, null);

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
  let accountCloseCalls = 0;
  let battleRuntimeCloseCalls = 0;
  const bridge = {
    capabilities: {},
    publish() {},
    subscribe() { return () => {}; },
    async close() { closeCalls += 1; },
  };
  const accountAdmission = {
    setPresenceRevisionObserver() {},
    admit() { return Promise.resolve({ok: true}); },
    health() { return {ok: true}; },
    async close() { accountCloseCalls += 1; },
  };
  const battleRuntime = {
    checkpoint() { return Promise.resolve({ok: true}); },
    claim() { return Promise.resolve({ok: true, found: false}); },
    remove() { return Promise.resolve(false); },
    health() { return {ok: true}; },
    async close() { battleRuntimeCloseCalls += 1; },
  };
  const runtime = await createConfiguredClusterEventRuntime({
    BEASTBOUND_CLUSTER_MODE: "valkey",
    BEASTBOUND_CLUSTER_NODE_ID: "node-a",
    BEASTBOUND_CLUSTER_VALKEY_HOST: "127.0.0.1",
    BEASTBOUND_CLUSTER_VALKEY_PORT: "6380",
    BEASTBOUND_CLUSTER_VALKEY_TLS: "0",
    BEASTBOUND_CLUSTER_ACCOUNT_STICKY: "true",
    BEASTBOUND_CLUSTER_VALKEY_STREAM_MAXLEN: "4096",
    BEASTBOUND_CLUSTER_ACCOUNT_LEASE_MS: "9000",
    BEASTBOUND_CLUSTER_ACCOUNT_OWNER_MAX: "512",
    BEASTBOUND_CLUSTER_ACCOUNT_ADMISSION_MAX_PENDING: "128",
    BEASTBOUND_CLUSTER_VALKEY_PASSWORD: "secret-not-for-logs",
  }, {
    async bridgeFactory(options) {
      calls.push(options);
      return bridge;
    },
    async accountOwnerFactory(options) {
      calls.push(options);
      return accountAdmission;
    },
    async battleRuntimeFactory(options) {
      calls.push(options);
      return battleRuntime;
    },
  });

  assert.equal(runtime.enabled, true);
  assert.equal(runtime.eventHubOptions.clusterRequired, true);
  assert.equal(runtime.eventHubOptions.clusterNodeId, "node-a");
  assert.equal(runtime.accountAdmission, accountAdmission);
  assert.equal(runtime.battleRuntime, battleRuntime);
  assert.equal(calls[0].connection.port, 6380);
  assert.equal(calls[0].connection.useTLS, false);
  assert.equal(calls[0].maxStreamLength, 4096);
  assert.equal(calls[0].connection.password, "secret-not-for-logs");
  assert.equal(calls[1].leaseMs, 9000);
  assert.equal(calls[1].maxOwnedAccounts, 512);
  assert.equal(calls[1].maxPendingAdmissions, 128);
  assert.equal(calls[1].connection.password, "secret-not-for-logs");
  assert.equal(calls[2].leaseMs, 9000);
  assert.equal(calls[2].snapshotTtlMs, 6 * 60 * 60 * 1000);
  assert.equal(calls[2].maxOwnedRooms, 2048);
  assert.equal(calls[2].maxSnapshotBytes, 8 * 1024 * 1024);
  assert.equal(calls[2].connection.password, "secret-not-for-logs");
  assert.equal(JSON.stringify(runtime.eventHubOptions).includes("secret-not-for-logs"), false);
  await runtime.close();
  await runtime.close();
  assert.equal(closeCalls, 1);
  assert.equal(accountCloseCalls, 1);
  assert.equal(battleRuntimeCloseCalls, 1);
});

test("cluster runtime closes an initialized relay when account ownership fails to initialize", async () => {
  let bridgeCloseCalls = 0;
  const bridge = {
    async close() { bridgeCloseCalls += 1; },
  };
  await assert.rejects(
    createConfiguredClusterEventRuntime({
      BEASTBOUND_CLUSTER_MODE: "valkey",
      BEASTBOUND_CLUSTER_NODE_ID: "node-a",
      BEASTBOUND_CLUSTER_VALKEY_HOST: "127.0.0.1",
      BEASTBOUND_CLUSTER_ACCOUNT_STICKY: "1",
    }, {
      async bridgeFactory() {
        return bridge;
      },
      async accountOwnerFactory() {
        const error = new Error("owner failed");
        error.code = "cluster_account_owner_connect_failed";
        throw error;
      },
    }),
    (error) => error.code === "cluster_account_owner_connect_failed",
  );
  assert.equal(bridgeCloseCalls, 1);
});

test("cluster runtime closes relay and account ownership when battle runtime initialization fails", async () => {
  let bridgeCloseCalls = 0;
  let accountCloseCalls = 0;
  const bridge = {
    async close() { bridgeCloseCalls += 1; },
  };
  const accountAdmission = {
    async close() { accountCloseCalls += 1; },
  };
  await assert.rejects(
    createConfiguredClusterEventRuntime({
      BEASTBOUND_CLUSTER_MODE: "valkey",
      BEASTBOUND_CLUSTER_NODE_ID: "node-a",
      BEASTBOUND_CLUSTER_VALKEY_HOST: "127.0.0.1",
      BEASTBOUND_CLUSTER_ACCOUNT_STICKY: "1",
    }, {
      async bridgeFactory() {
        return bridge;
      },
      async accountOwnerFactory() {
        return accountAdmission;
      },
      async battleRuntimeFactory() {
        const error = new Error("battle runtime failed");
        error.code = "cluster_battle_runtime_connect_failed";
        throw error;
      },
    }),
    (error) => error.code === "cluster_battle_runtime_connect_failed",
  );
  assert.equal(bridgeCloseCalls, 1);
  assert.equal(accountCloseCalls, 1);
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

test("ready health fails closed when the battle runtime lease is unhealthy", async (t) => {
  const battleRuntime = {
    health() {
      return {
        ok: false,
        runtimeHealthy: false,
        fatal: true,
        closed: false,
        ownedRooms: 1,
      };
    },
  };
  const server = createHttpServer({service: {}, clusterBattleRuntime: battleRuntime, logger: false});
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await requestJson(server.address().port, "/health/ready");
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.battleRuntime.enabled, true);
  assert.equal(response.body.battleRuntime.fatal, true);
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
