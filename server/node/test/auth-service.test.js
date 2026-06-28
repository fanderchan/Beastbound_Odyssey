"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {once} = require("node:events");
const {
  createAuthService,
  createMemoryAuthStore,
} = require("../src/auth-service");
const {
  createHttpServer,
  DEFAULT_COMMAND_CATALOG,
} = require("../src/http-server");

test("register/login/session keeps players away from GM tools", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});

  const registered = service.register({
    "username": "Fander",
    "password": "test1234",
    "displayName": "测试玩家",
  });
  assert.equal(registered.ok, true);
  assert.equal(registered.account.username, "fander");
  assert.equal(registered.account.passwordHash, undefined);
  assert.equal(registered.session.effectiveRole, "player");
  assert.equal(Boolean(registered.session.token), true);

  const duplicate = service.register({"username": "fander", "password": "test1234"});
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.code, "account_exists");

  const login = service.login({"username": "fander", "password": "test1234"});
  assert.equal(login.ok, true);
  const session = service.getSession(login.session.token);
  assert.equal(session.ok, true);
  assert.equal(session.session.effectiveRole, "player");

  const tools = service.listGmTools(login.session.token, DEFAULT_COMMAND_CATALOG);
  assert.equal(tools.ok, false);
  assert.equal(tools.code, "gm_denied");
});

test("GM grants are command-scoped and audited", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "gmtester", "password": "test1234"});
  const token = registered.session.token;

  const playerDenied = service.authorizeGmCommand({"token": token, "commandId": "gm_map"});
  assert.equal(playerDenied.ok, false);
  assert.equal(playerDenied.code, "gm_denied");

  const grant = service.grantGm({
    "username": "gmtester",
    "commandIds": ["gm_map"],
    "grantedBy": "unit_test",
  });
  assert.equal(grant.ok, true);

  const session = service.getSession(token);
  assert.equal(session.ok, true);
  assert.equal(session.session.effectiveRole, "gm");

  const tools = service.listGmTools(token, DEFAULT_COMMAND_CATALOG);
  assert.deepEqual(tools.commandIds, ["gm_map"]);

  const allowed = service.authorizeGmCommand({"token": token, "commandId": "gm_map"});
  assert.equal(allowed.ok, true);

  const denied = service.authorizeGmCommand({"token": token, "commandId": "gm_level_pet"});
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "command_denied");

  const snapshot = service.snapshot();
  assert.equal(snapshot.gmCommandAudit.length, 3);
  assert.deepEqual(snapshot.gmCommandAudit.map((row) => row.ok), [false, true, false]);
});

test("HTTP server exposes auth and session endpoints", async (t) => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const {port} = server.address();
  const base = `http://127.0.0.1:${port}`;

  const health = await fetchJson(`${base}/health`);
  assert.equal(health.ok, true);

  const registered = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httpuser", "password": "test1234"}),
  });
  assert.equal(registered.ok, true);

  const session = await fetchJson(`${base}/auth/session`, {
    "headers": {"authorization": `Bearer ${registered.session.token}`},
  });
  assert.equal(session.ok, true);
  assert.equal(session.account.username, "httpuser");

  const tools = await fetchJson(`${base}/gm/tools`, {
    "headers": {"authorization": `Bearer ${registered.session.token}`},
  });
  assert.equal(tools.ok, false);
  assert.equal(tools.code, "gm_denied");
});

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    "headers": {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  return response.json();
}
