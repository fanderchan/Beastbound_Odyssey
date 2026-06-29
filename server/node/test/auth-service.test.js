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
  assert.equal(registered.profileSummary.storageMode, "local_shadow");
  assert.equal(registered.profileSummary.profileRevision, 0);
  assert.match(registered.profileSummary.playerId, /^player_/);

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

test("profiles sync with revision conflict protection", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "syncuser", "password": "test1234", "displayName": "同步猎人"});
  const token = registered.session.token;

  const emptyProfile = service.getProfile(token);
  assert.equal(emptyProfile.ok, true);
  assert.equal(emptyProfile.profile, null);
  assert.equal(emptyProfile.profileSummary.profileRevision, 0);
  assert.equal(emptyProfile.profileSummary.storageMode, "local_shadow");

  const saved = service.saveProfile(token, {
    "expectedRevision": 0,
    "profile": {
      "schemaVersion": 1,
      "playerName": "同步猎人",
      "player": {"level": 12},
    },
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.profileSummary.profileRevision, 1);
  assert.equal(saved.profileSummary.storageMode, "server_document");

  const loaded = service.getProfile(token);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.profile.player.level, 12);
  assert.equal(loaded.profileSummary.serverAuthority, "profile_document");

  const conflict = service.saveProfile(token, {
    "expectedRevision": 0,
    "profile": {"schemaVersion": 1, "player": {"level": 1}},
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "revision_conflict");
  assert.equal(conflict.profileSummary.profileRevision, 1);
});

test("players can search and send text mail across accounts", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const sender = service.register({"username": "maila", "password": "test1234", "displayName": "甲"});
  const recipient = service.register({"username": "mailb", "password": "test1234", "displayName": "乙"});
  assert.equal(sender.ok, true);
  assert.equal(recipient.ok, true);

  const search = service.searchPlayers(sender.session.token, {"username": "mailb"});
  assert.equal(search.ok, true);
  assert.equal(search.players.length, 1);
  assert.equal(search.players[0].username, "mailb");

  const sent = service.sendMail(sender.session.token, {
    "recipientUsername": "mailb",
    "title": "组队吗",
    "body": "火芽村门口见。",
  });
  assert.equal(sent.ok, true);
  assert.equal(sent.mail.senderUsername, "maila");
  assert.equal(sent.mail.recipientUsername, "mailb");
  assert.equal(sent.mail.readAt, null);

  const senderInbox = service.listInbox(sender.session.token);
  assert.equal(senderInbox.ok, true);
  assert.equal(senderInbox.messages.length, 0);

  const recipientInbox = service.listInbox(recipient.session.token);
  assert.equal(recipientInbox.ok, true);
  assert.equal(recipientInbox.unreadCount, 1);
  assert.equal(recipientInbox.messages[0].title, "组队吗");

  const read = service.markMailRead(recipient.session.token, recipientInbox.messages[0].mailId);
  assert.equal(read.ok, true);
  assert.notEqual(read.mail.readAt, null);

  const refreshed = service.listInbox(recipient.session.token);
  assert.equal(refreshed.unreadCount, 0);

  const blocked = service.markMailRead(sender.session.token, recipientInbox.messages[0].mailId);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "mail_missing");
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
  assert.equal(session.profileSummary.storageMode, "local_shadow");

  const profile = await fetchJson(`${base}/profiles/me`, {
    "headers": {"authorization": `Bearer ${registered.session.token}`},
  });
  assert.equal(profile.ok, true);
  assert.equal(profile.profile, null);
  assert.equal(profile.profileSummary.playerId, registered.profileSummary.playerId);
  assert.equal(profile.profileSummary.serverAuthority, "account_binding");

  const savedProfile = await fetchJson(`${base}/profiles/me`, {
    "method": "PUT",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
    "body": JSON.stringify({
      "expectedRevision": 0,
      "profile": {"schemaVersion": 1, "player": {"level": 9}},
    }),
  });
  assert.equal(savedProfile.ok, true);
  assert.equal(savedProfile.profileSummary.profileRevision, 1);

  const conflict = await fetchJson(`${base}/profiles/me`, {
    "method": "PUT",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
    "body": JSON.stringify({
      "expectedRevision": 0,
      "profile": {"schemaVersion": 1, "player": {"level": 1}},
    }),
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "revision_conflict");

  const tools = await fetchJson(`${base}/gm/tools`, {
    "headers": {"authorization": `Bearer ${registered.session.token}`},
  });
  assert.equal(tools.ok, false);
  assert.equal(tools.code, "gm_denied");
});

test("HTTP server exposes player search and mail endpoints", async (t) => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const {port} = server.address();
  const base = `http://127.0.0.1:${port}`;

  const sender = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httpmaila", "password": "test1234", "displayName": "邮甲"}),
  });
  const recipient = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httpmailb", "password": "test1234", "displayName": "邮乙"}),
  });
  assert.equal(sender.ok, true);
  assert.equal(recipient.ok, true);

  const search = await fetchJson(`${base}/players/search?username=httpmailb`, {
    "headers": {"authorization": `Bearer ${sender.session.token}`},
  });
  assert.equal(search.ok, true);
  assert.equal(search.players[0].username, "httpmailb");

  const sent = await fetchJson(`${base}/mail/send`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${sender.session.token}`},
    "body": JSON.stringify({
      "recipientUsername": "httpmailb",
      "title": "你好",
      "body": "这是服务器邮件。",
    }),
  });
  assert.equal(sent.ok, true);

  const inbox = await fetchJson(`${base}/mail/inbox`, {
    "headers": {"authorization": `Bearer ${recipient.session.token}`},
  });
  assert.equal(inbox.ok, true);
  assert.equal(inbox.unreadCount, 1);
  assert.equal(inbox.messages[0].body, "这是服务器邮件。");

  const read = await fetchJson(`${base}/mail/${encodeURIComponent(inbox.messages[0].mailId)}/read`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${recipient.session.token}`},
  });
  assert.equal(read.ok, true);
  assert.notEqual(read.mail.readAt, null);
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
