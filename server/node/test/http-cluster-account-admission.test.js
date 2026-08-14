"use strict";

const assert = require("node:assert/strict");
const {once} = require("node:events");
const test = require("node:test");
const {
  createAuthService,
  createMemoryAuthStore,
} = require("../src/auth-service");
const {
  createHttpServer,
  drainServerForShutdown,
} = require("../src/http-server");
const {
  CLIENT_PROTOCOL_HEADER,
  CLIENT_VERSION_HEADER,
  PROTOCOL_VERSION,
  SERVER_VERSION,
} = require("../src/protocol");

test("HTTP cluster admission owns authenticated requests and verified login only", async (t) => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const registered = service.register({
    username: "httpowner",
    password: "ownerpass123",
    displayName: "HTTP归属",
  });
  assert.equal(registered.ok, true);
  const admission = fakeAdmission();
  const server = createHttpServer({
    service,
    eventHub: eventHubStub(),
    clusterAccountAdmission: admission,
    logger: false,
  });
  const base = await listen(server, t);

  const sessionResponse = await fetch(`${base}/auth/session`, {
    headers: protocolHeaders({authorization: `Bearer ${registered.session.token}`}),
  });
  assert.equal(sessionResponse.status, 200);
  assert.equal((await sessionResponse.json()).ok, true);
  assert.deepEqual(admission.admitted, [registered.account.accountId]);

  admission.admitted.length = 0;
  const invalidTokenResponse = await fetch(`${base}/auth/session`, {
    headers: protocolHeaders({authorization: `Bearer ${"z".repeat(43)}`}),
  });
  assert.equal(invalidTokenResponse.status, 400);
  assert.equal((await invalidTokenResponse.json()).ok, false);
  assert.deepEqual(admission.admitted, []);

  const wrongLogin = await postJson(`${base}/auth/login`, {
    username: "httpowner",
    password: "wrongpass123",
  });
  assert.equal(wrongLogin.response.status, 400);
  assert.equal(wrongLogin.body.ok, false);
  assert.deepEqual(admission.admitted, []);
  assert.equal(service.getSession(registered.session.token).ok, true);

  const correctLogin = await postJson(`${base}/auth/login`, {
    username: "httpowner",
    password: "ownerpass123",
  });
  assert.equal(correctLogin.response.status, 200);
  assert.equal(correctLogin.body.ok, true);
  assert.deepEqual(admission.admitted, [registered.account.accountId]);
  assert.equal(service.getSession(registered.session.token).ok, false);
  assert.equal(typeof admission.observer, "function");
  assert.equal(
    admission.observer(registered.account.accountId, 3_000_000_000),
    3_000_000_000,
  );
});

test("owner conflict returns a bounded public 503 before login can revoke the old session", async (t) => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const registered = service.register({
    username: "httpconflict",
    password: "conflict123",
    displayName: "冲突玩家",
  });
  const admission = fakeAdmission();
  admission.rejectWith = Object.assign(new Error("raw owner conflict"), {
    code: "cluster_account_owner_conflict",
    retryAfterMs: 2750,
  });
  const server = createHttpServer({
    service,
    eventHub: eventHubStub(),
    clusterAccountAdmission: admission,
    logger: false,
  });
  const base = await listen(server, t);

  const login = await postJson(`${base}/auth/login`, {
    username: "httpconflict",
    password: "conflict123",
  });
  assert.equal(login.response.status, 503);
  assert.equal(login.response.headers.get("retry-after"), "3");
  assert.equal(login.body.code, "account_node_switching");
  assert.equal(login.body.message, "账号正在切换服务器，请稍后重试。");
  assert.equal(JSON.stringify(login.body).includes("raw owner conflict"), false);
  assert.equal(service.getSession(registered.session.token).ok, true);
});

test("readiness includes only sanitized account ownership health and fails closed", async (t) => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const admission = fakeAdmission();
  admission.healthState = {
    ok: false,
    closed: false,
    fatal: true,
    ownedAccounts: 2,
    pendingAdmissions: 1,
    password: "must-not-leak",
  };
  const server = createHttpServer({
    service,
    eventHub: eventHubStub(),
    clusterAccountAdmission: admission,
    logger: false,
  });
  const base = await listen(server, t);

  const response = await fetch(`${base}/health/ready`);
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.deepEqual(body.accountOwnership, {
    enabled: true,
    checked: true,
    ok: false,
    runtimeHealthy: false,
    closed: false,
    fatal: true,
    ownedAccounts: 2,
    pendingAdmissions: 1,
  });
  assert.equal(JSON.stringify(body).includes("must-not-leak"), false);
});

test("graceful drain releases account ownership only after websocket, durable, and store drains", async () => {
  const order = [];
  const baseService = createAuthService({store: createMemoryAuthStore()});
  const service = new Proxy(baseService, {
    get(target, property) {
      if (property === "stopDurableAdmissionsAndDrain") {
        return async () => {
          await target.stopDurableAdmissionsAndDrain();
          order.push("durable-drained");
        };
      }
      const value = target[property];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const admission = fakeAdmission();
  admission.close = async () => {
    admission.closeCalls += 1;
    order.push("account-owner-released");
  };
  const eventHub = eventHubStub();
  eventHub.close = async () => {
    order.push("websocket-drained");
  };
  const store = {
    mode: "cluster-drain-order",
    checkHealth() { return {ok: true}; },
    async flush() {
      order.push("store-flushed");
    },
  };
  const server = createHttpServer({
    service,
    store,
    eventHub,
    clusterAccountAdmission: admission,
    logger: false,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  await drainServerForShutdown(server, store);

  const releasedAt = order.indexOf("account-owner-released");
  assert.ok(releasedAt > order.indexOf("websocket-drained"));
  assert.ok(releasedAt > order.indexOf("durable-drained"));
  assert.ok(releasedAt > order.indexOf("store-flushed"));
  assert.equal(admission.closeCalls, 1);
});

function fakeAdmission() {
  return {
    admitted: [],
    observer: null,
    rejectWith: null,
    closeCalls: 0,
    healthState: {
      ok: true,
      runtimeHealthy: true,
      closed: false,
      fatal: false,
      ownedAccounts: 0,
      pendingAdmissions: 0,
    },
    setPresenceRevisionObserver(observer) {
      this.observer = observer;
    },
    admit(accountId) {
      this.admitted.push(accountId);
      if (this.rejectWith) {
        throw this.rejectWith;
      }
      return {ok: true};
    },
    health() {
      return this.healthState;
    },
    close() {
      this.closeCalls += 1;
      return Promise.resolve();
    },
  };
}

function eventHubStub() {
  return {
    handleUpgrade() { return false; },
    clientCount() { return 0; },
    metrics() { return {}; },
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

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: protocolHeaders({"content-type": "application/json"}),
    body: JSON.stringify(payload),
  });
  return {response, body: await response.json()};
}

async function listen(server, t) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  let drained = false;
  t.after(async () => {
    if (!drained) {
      drained = true;
      await drainServerForShutdown(server, null);
    }
  });
  return `http://127.0.0.1:${server.address().port}`;
}
