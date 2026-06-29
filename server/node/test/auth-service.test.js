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

test("players can invite, accept, and leave server parties", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const leader = service.register({"username": "partya", "password": "test1234", "displayName": "队长"});
  const member = service.register({"username": "partyb", "password": "test1234", "displayName": "队员"});
  const outsider = service.register({"username": "partyc", "password": "test1234", "displayName": "路人"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  assert.equal(outsider.ok, true);

  const online = service.listOnlinePlayers(leader.session.token);
  assert.equal(online.ok, true);
  assert.deepEqual(online.players.map((player) => player.username).sort(), ["partya", "partyb", "partyc"]);

  const invite = service.inviteToParty(leader.session.token, {"username": "partyb"});
  assert.equal(invite.ok, true);
  assert.equal(invite.party.memberCount, 1);
  assert.equal(invite.party.members[0].role, "leader");
  assert.equal(invite.invite.toUsername, "partyb");

  const memberState = service.getPartyState(member.session.token);
  assert.equal(memberState.ok, true);
  assert.equal(memberState.party, null);
  assert.equal(memberState.incomingInvites.length, 1);

  const outsiderAccept = service.acceptPartyInvite(outsider.session.token, memberState.incomingInvites[0].inviteId);
  assert.equal(outsiderAccept.ok, false);
  assert.equal(outsiderAccept.code, "party_invite_missing");

  const accept = service.acceptPartyInvite(member.session.token, memberState.incomingInvites[0].inviteId);
  assert.equal(accept.ok, true);
  assert.equal(accept.party.memberCount, 2);
  assert.deepEqual(accept.party.members.map((player) => player.username), ["partya", "partyb"]);

  const busyInvite = service.inviteToParty(outsider.session.token, {"username": "partyb"});
  assert.equal(busyInvite.ok, false);
  assert.equal(busyInvite.code, "party_target_busy");

  const leaveMember = service.leaveParty(member.session.token);
  assert.equal(leaveMember.ok, true);
  const leaderState = service.getPartyState(leader.session.token);
  assert.equal(leaderState.ok, true);
  assert.equal(leaderState.party.memberCount, 1);
  assert.equal(leaderState.party.members[0].username, "partya");

  const leaveLeader = service.leaveParty(leader.session.token);
  assert.equal(leaveLeader.ok, true);
  const emptyState = service.getPartyState(leader.session.token);
  assert.equal(emptyState.ok, true);
  assert.equal(emptyState.party, null);
});

test("players can invite and accept duel battle rooms", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const events = [];
  service.onEvent((event) => events.push(event));
  const challenger = service.register({"username": "battlea", "password": "test1234", "displayName": "挑战甲"});
  const opponent = service.register({"username": "battleb", "password": "test1234", "displayName": "迎战乙"});
  const outsider = service.register({"username": "battlec", "password": "test1234", "displayName": "旁观丙"});
  assert.equal(challenger.ok, true);
  assert.equal(opponent.ok, true);
  assert.equal(outsider.ok, true);

  const invite = service.inviteToBattle(challenger.session.token, {"username": "battleb"});
  assert.equal(invite.ok, true);
  assert.equal(invite.invite.status, "pending");
  assert.equal(invite.invite.toUsername, "battleb");
  assert.equal(events.some((event) => event.type === "battle.invite" && event.invite.inviteId === invite.invite.inviteId), true);

  const opponentState = service.getBattleState(opponent.session.token);
  assert.equal(opponentState.ok, true);
  assert.equal(opponentState.room, null);
  assert.equal(opponentState.incomingInvites.length, 1);

  const outsiderAccept = service.acceptBattleInvite(outsider.session.token, invite.invite.inviteId);
  assert.equal(outsiderAccept.ok, false);
  assert.equal(outsiderAccept.code, "battle_invite_missing");

  const accept = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);
  assert.equal(accept.room.status, "ready");
  assert.equal(accept.room.mode, "duel");
  assert.equal(Boolean(accept.room.seed), true);
  assert.deepEqual(accept.room.participants.map((player) => player.username), ["battlea", "battleb"]);
  assert.equal(accept.room.participants[0].teamSnapshot.playerLevel, 1);
  assert.equal(events.some((event) => event.type === "battle.room_ready" && event.room.roomId === accept.room.roomId), true);

  const challengerState = service.getBattleState(challenger.session.token);
  assert.equal(challengerState.ok, true);
  assert.equal(challengerState.room.roomId, accept.room.roomId);

  const busyInvite = service.inviteToBattle(outsider.session.token, {"username": "battleb"});
  assert.equal(busyInvite.ok, false);
  assert.equal(busyInvite.code, "battle_target_busy");
});

test("players can publish map positions into the online roster", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const scout = service.register({"username": "posa", "password": "test1234", "displayName": "同步甲"});
  const watcher = service.register({"username": "posb", "password": "test1234", "displayName": "同步乙"});
  assert.equal(scout.ok, true);
  assert.equal(watcher.ok, true);

  const updated = service.updatePlayerPosition(scout.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 12,
    "cellY": 8,
    "facing": "east",
    "moving": true,
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.position.mapId, "firebud_training_yard");
  assert.equal(updated.position.cellX, 12);
  assert.equal(updated.position.facing, "east");

  const online = service.listOnlinePlayers(watcher.session.token);
  assert.equal(online.ok, true);
  const scoutRow = online.players.find((player) => player.username === "posa");
  assert.notEqual(scoutRow, undefined);
  assert.equal(scoutRow.position.mapId, "firebud_training_yard");
  assert.equal(scoutRow.position.cellY, 8);
});

test("online roster can be filtered by map area of interest", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const watcher = service.register({"username": "aoia", "password": "test1234", "displayName": "观察甲"});
  const nearby = service.register({"username": "aoib", "password": "test1234", "displayName": "附近乙"});
  const distant = service.register({"username": "aoic", "password": "test1234", "displayName": "远处丙"});
  const otherMap = service.register({"username": "aoid", "password": "test1234", "displayName": "异图丁"});
  assert.equal(watcher.ok, true);
  assert.equal(nearby.ok, true);
  assert.equal(distant.ok, true);
  assert.equal(otherMap.ok, true);

  const watcherPosition = service.updatePlayerPosition(watcher.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 10,
    "cellY": 10,
    "facing": "south",
    "moving": false,
  });
  assert.equal(watcherPosition.ok, true);
  assert.equal(watcherPosition.aoi.scope, "aoi");
  service.updatePlayerPosition(nearby.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 12,
    "cellY": 11,
    "facing": "west",
    "moving": false,
  });
  service.updatePlayerPosition(distant.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 80,
    "cellY": 80,
    "facing": "west",
    "moving": false,
  });
  service.updatePlayerPosition(otherMap.session.token, {
    "mapId": "coral_coast",
    "cellX": 12,
    "cellY": 11,
    "facing": "west",
    "moving": false,
  });

  const all = service.listOnlinePlayers(watcher.session.token);
  assert.equal(all.ok, true);
  assert.deepEqual(all.players.map((player) => player.username).sort(), ["aoia", "aoib", "aoic", "aoid"]);

  const scoped = service.listOnlinePlayers(watcher.session.token, {"scope": "aoi", "radius": 4});
  assert.equal(scoped.ok, true);
  assert.equal(scoped.aoi.scope, "aoi");
  assert.deepEqual(scoped.players.map((player) => player.username).sort(), ["aoia", "aoib"]);

  const explicit = service.listOnlinePlayers(watcher.session.token, {
    "scope": "aoi",
    "mapId": "firebud_training_yard",
    "cellX": 80,
    "cellY": 80,
    "radius": 1,
  });
  assert.equal(explicit.ok, true);
  assert.deepEqual(explicit.players.map((player) => player.username).sort(), ["aoia", "aoic"]);
});

test("players can chat nearby and inside server parties", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const leader = service.register({"username": "chata", "password": "test1234", "displayName": "聊甲"});
  const member = service.register({"username": "chatb", "password": "test1234", "displayName": "聊乙"});
  const outsider = service.register({"username": "chatc", "password": "test1234", "displayName": "聊丙"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  assert.equal(outsider.ok, true);

  const nearby = service.sendChatMessage(leader.session.token, {"channel": "nearby", "text": "火芽村集合"});
  assert.equal(nearby.ok, true);
  assert.equal(nearby.message.senderUsername, "chata");
  const nearbyList = service.listChatMessages(member.session.token, {"channel": "nearby"});
  assert.equal(nearbyList.ok, true);
  assert.equal(nearbyList.messages.length, 1);
  assert.equal(nearbyList.messages[0].text, "火芽村集合");

  const blockedTeam = service.sendChatMessage(leader.session.token, {"channel": "team", "text": "队伍内见"});
  assert.equal(blockedTeam.ok, false);
  assert.equal(blockedTeam.code, "chat_team_missing");

  const invite = service.inviteToParty(leader.session.token, {"username": "chatb"});
  assert.equal(invite.ok, true);
  const memberState = service.getPartyState(member.session.token);
  const accept = service.acceptPartyInvite(member.session.token, memberState.incomingInvites[0].inviteId);
  assert.equal(accept.ok, true);

  const team = service.sendChatMessage(member.session.token, {"channel": "team", "text": "队伍频道已通"});
  assert.equal(team.ok, true);
  assert.equal(team.message.partyId, accept.party.partyId);
  const leaderTeam = service.listChatMessages(leader.session.token, {"channel": "team"});
  assert.equal(leaderTeam.ok, true);
  assert.equal(leaderTeam.messages.length, 1);
  assert.equal(leaderTeam.messages[0].text, "队伍频道已通");
  const outsiderTeam = service.listChatMessages(outsider.session.token, {"channel": "team"});
  assert.equal(outsiderTeam.ok, true);
  assert.equal(outsiderTeam.messages.length, 0);
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

test("HTTP server exposes online roster and party endpoints", async (t) => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const {port} = server.address();
  const base = `http://127.0.0.1:${port}`;

  const leader = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httppartya", "password": "test1234", "displayName": "队长甲"}),
  });
  const member = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httppartyb", "password": "test1234", "displayName": "队员乙"}),
  });
  const distant = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httppartyc", "password": "test1234", "displayName": "远处丙"}),
  });
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  assert.equal(distant.ok, true);

  const online = await fetchJson(`${base}/players/online`, {
    "headers": {"authorization": `Bearer ${leader.session.token}`},
  });
  assert.equal(online.ok, true);
  assert.equal(online.players.some((player) => player.username === "httppartyb"), true);

  const position = await fetchJson(`${base}/players/position`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${member.session.token}`},
    "body": JSON.stringify({
      "mapId": "firebud_training_yard",
      "cellX": 9,
      "cellY": 11,
      "facing": "northwest",
      "moving": false,
    }),
  });
  assert.equal(position.ok, true);
  assert.equal(position.position.cellX, 9);
  const leaderPosition = await fetchJson(`${base}/players/position`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${leader.session.token}`},
    "body": JSON.stringify({
      "mapId": "firebud_training_yard",
      "cellX": 8,
      "cellY": 11,
      "facing": "east",
      "moving": false,
    }),
  });
  assert.equal(leaderPosition.ok, true);
  const distantPosition = await fetchJson(`${base}/players/position`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${distant.session.token}`},
    "body": JSON.stringify({
      "mapId": "firebud_training_yard",
      "cellX": 80,
      "cellY": 80,
      "facing": "west",
      "moving": false,
    }),
  });
  assert.equal(distantPosition.ok, true);
  const onlineWithPosition = await fetchJson(`${base}/players/online`, {
    "headers": {"authorization": `Bearer ${leader.session.token}`},
  });
  assert.equal(onlineWithPosition.ok, true);
  const memberOnline = onlineWithPosition.players.find((player) => player.username === "httppartyb");
  assert.equal(memberOnline.position.mapId, "firebud_training_yard");
  assert.equal(memberOnline.position.facing, "northwest");
  assert.equal(onlineWithPosition.players.some((player) => player.username === "httppartyc"), true);

  const scopedOnline = await fetchJson(`${base}/players/online?scope=aoi&mapId=firebud_training_yard&cellX=8&cellY=11&radius=4`, {
    "headers": {"authorization": `Bearer ${leader.session.token}`},
  });
  assert.equal(scopedOnline.ok, true);
  assert.equal(scopedOnline.aoi.scope, "aoi");
  assert.equal(scopedOnline.players.some((player) => player.username === "httppartyb"), true);
  assert.equal(scopedOnline.players.some((player) => player.username === "httppartyc"), false);

  const invite = await fetchJson(`${base}/party/invite`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${leader.session.token}`},
    "body": JSON.stringify({"username": "httppartyb"}),
  });
  assert.equal(invite.ok, true);
  assert.equal(invite.party.memberCount, 1);

  const memberState = await fetchJson(`${base}/party/state`, {
    "headers": {"authorization": `Bearer ${member.session.token}`},
  });
  assert.equal(memberState.ok, true);
  assert.equal(memberState.incomingInvites.length, 1);

  const accept = await fetchJson(`${base}/party/invites/${encodeURIComponent(memberState.incomingInvites[0].inviteId)}/accept`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${member.session.token}`},
  });
  assert.equal(accept.ok, true);
  assert.equal(accept.party.memberCount, 2);

  const leaderState = await fetchJson(`${base}/party/state`, {
    "headers": {"authorization": `Bearer ${leader.session.token}`},
  });
  assert.equal(leaderState.ok, true);
  assert.equal(leaderState.party.members[0].role, "leader");

  const leave = await fetchJson(`${base}/party/leave`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${member.session.token}`},
  });
  assert.equal(leave.ok, true);
});

test("HTTP server exposes nearby and team chat endpoints", async (t) => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const {port} = server.address();
  const base = `http://127.0.0.1:${port}`;

  const leader = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httpchata", "password": "test1234", "displayName": "聊甲"}),
  });
  const member = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httpchatb", "password": "test1234", "displayName": "聊乙"}),
  });
  const outsider = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httpchatc", "password": "test1234", "displayName": "聊丙"}),
  });
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  assert.equal(outsider.ok, true);

  const nearby = await fetchJson(`${base}/chat/send`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${leader.session.token}`},
    "body": JSON.stringify({"channel": "nearby", "text": "服务器附近频道"}),
  });
  assert.equal(nearby.ok, true);
  const nearbyList = await fetchJson(`${base}/chat/messages?channel=nearby`, {
    "headers": {"authorization": `Bearer ${member.session.token}`},
  });
  assert.equal(nearbyList.ok, true);
  assert.equal(nearbyList.messages[0].text, "服务器附近频道");

  const invite = await fetchJson(`${base}/party/invite`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${leader.session.token}`},
    "body": JSON.stringify({"username": "httpchatb"}),
  });
  assert.equal(invite.ok, true);
  const memberState = await fetchJson(`${base}/party/state`, {
    "headers": {"authorization": `Bearer ${member.session.token}`},
  });
  const accept = await fetchJson(`${base}/party/invites/${encodeURIComponent(memberState.incomingInvites[0].inviteId)}/accept`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${member.session.token}`},
  });
  assert.equal(accept.ok, true);

  const team = await fetchJson(`${base}/chat/send`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${member.session.token}`},
    "body": JSON.stringify({"channel": "team", "text": "队伍消息"}),
  });
  assert.equal(team.ok, true);
  const leaderTeam = await fetchJson(`${base}/chat/messages?channel=team`, {
    "headers": {"authorization": `Bearer ${leader.session.token}`},
  });
  assert.equal(leaderTeam.ok, true);
  assert.equal(leaderTeam.messages.length, 1);
  const outsiderTeam = await fetchJson(`${base}/chat/messages?channel=team`, {
    "headers": {"authorization": `Bearer ${outsider.session.token}`},
  });
  assert.equal(outsiderTeam.ok, true);
  assert.equal(outsiderTeam.messages.length, 0);
});

test("HTTP server exposes battle room endpoints and websocket events", async (t) => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.eventHub.close();
    server.close();
  });
  const {port} = server.address();
  const base = `http://127.0.0.1:${port}`;
  const wsBase = `ws://127.0.0.1:${port}`;

  const challenger = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httpbata", "password": "test1234", "displayName": "挑战甲"}),
  });
  const opponent = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httpbatb", "password": "test1234", "displayName": "迎战乙"}),
  });
  assert.equal(challenger.ok, true);
  assert.equal(opponent.ok, true);

  const ws = new WebSocket(`${wsBase}/events?token=${encodeURIComponent(opponent.session.token)}`);
  const reader = webSocketJsonReader(ws);
  await webSocketOpen(ws);
  const ready = await reader.next("events.ready");
  assert.equal(ready.account.username, "httpbatb");

  const invite = await fetchJson(`${base}/battle/invite`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${challenger.session.token}`},
    "body": JSON.stringify({"username": "httpbatb"}),
  });
  assert.equal(invite.ok, true);
  assert.equal(invite.invite.status, "pending");
  const inviteEvent = await reader.next("battle.invite");
  assert.equal(inviteEvent.invite.inviteId, invite.invite.inviteId);
  assert.equal(inviteEvent.invite.fromUsername, "httpbata");

  const state = await fetchJson(`${base}/battle/state`, {
    "headers": {"authorization": `Bearer ${opponent.session.token}`},
  });
  assert.equal(state.ok, true);
  assert.equal(state.incomingInvites.length, 1);

  const accept = await fetchJson(`${base}/battle/invites/${encodeURIComponent(invite.invite.inviteId)}/accept`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${opponent.session.token}`},
  });
  assert.equal(accept.ok, true);
  assert.equal(accept.room.status, "ready");
  assert.equal(accept.room.participants.length, 2);
  const roomEvent = await reader.next("battle.room_ready");
  assert.equal(roomEvent.room.roomId, accept.room.roomId);
  assert.equal(roomEvent.room.seed, accept.room.seed);
  ws.close();
});

test("HTTP server replays websocket battle events after cursor", async (t) => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.eventHub.close();
    server.close();
  });
  const {port} = server.address();
  const base = `http://127.0.0.1:${port}`;
  const wsBase = `ws://127.0.0.1:${port}`;

  const challenger = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "replaya", "password": "test1234", "displayName": "补发甲"}),
  });
  const opponent = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "replayb", "password": "test1234", "displayName": "补发乙"}),
  });
  assert.equal(challenger.ok, true);
  assert.equal(opponent.ok, true);

  const invite = await fetchJson(`${base}/battle/invite`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${challenger.session.token}`},
    "body": JSON.stringify({"username": "replayb"}),
  });
  assert.equal(invite.ok, true);
  const firstWs = new WebSocket(`${wsBase}/events?token=${encodeURIComponent(opponent.session.token)}`);
  const firstReader = webSocketJsonReader(firstWs);
  await webSocketOpen(firstWs);
  await firstReader.next("events.ready");
  const inviteEvent = await firstReader.next("battle.invite");
  assert.equal(inviteEvent.invite.inviteId, invite.invite.inviteId);
  assert.equal(Number.isInteger(inviteEvent.eventSeq), true);
  assert.equal(inviteEvent.eventSeq > 0, true);
  firstWs.close();

  const accept = await fetchJson(`${base}/battle/invites/${encodeURIComponent(invite.invite.inviteId)}/accept`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${opponent.session.token}`},
  });
  assert.equal(accept.ok, true);
  const secondWs = new WebSocket(`${wsBase}/events?token=${encodeURIComponent(opponent.session.token)}&lastEventSeq=${inviteEvent.eventSeq}`);
  const secondReader = webSocketJsonReader(secondWs);
  await webSocketOpen(secondWs);
  await secondReader.next("events.ready");
  const roomEvent = await secondReader.next("battle.room_ready");
  assert.equal(roomEvent.room.roomId, accept.room.roomId);
  assert.equal(roomEvent.eventSeq > inviteEvent.eventSeq, true);
  await assert.rejects(secondReader.next("battle.invite"), /websocket message timeout: battle.invite/);
  secondWs.close();
});

test("HTTP server exposes websocket event stream", async (t) => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.eventHub.close();
    server.close();
  });
  const {port} = server.address();
  const base = `http://127.0.0.1:${port}`;
  const wsBase = `ws://127.0.0.1:${port}`;

  const watcher = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httpwsa", "password": "test1234", "displayName": "推送甲"}),
  });
  const actor = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httpwsb", "password": "test1234", "displayName": "推送乙"}),
  });
  const distant = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httpwsc", "password": "test1234", "displayName": "远处丙"}),
  });
  assert.equal(watcher.ok, true);
  assert.equal(actor.ok, true);
  assert.equal(distant.ok, true);

  const watcherPosition = await fetchJson(`${base}/players/position`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${watcher.session.token}`},
    "body": JSON.stringify({
      "mapId": "firebud_training_yard",
      "cellX": 10,
      "cellY": 10,
      "facing": "east",
      "moving": false,
    }),
  });
  assert.equal(watcherPosition.ok, true);
  const actorInitialPosition = await fetchJson(`${base}/players/position`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${actor.session.token}`},
    "body": JSON.stringify({
      "mapId": "firebud_training_yard",
      "cellX": 12,
      "cellY": 10,
      "facing": "west",
      "moving": false,
    }),
  });
  assert.equal(actorInitialPosition.ok, true);
  const distantInitialPosition = await fetchJson(`${base}/players/position`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${distant.session.token}`},
    "body": JSON.stringify({
      "mapId": "firebud_training_yard",
      "cellX": 80,
      "cellY": 80,
      "facing": "west",
      "moving": false,
    }),
  });
  assert.equal(distantInitialPosition.ok, true);

  const ws = new WebSocket(`${wsBase}/events?token=${encodeURIComponent(watcher.session.token)}`);
  const reader = webSocketJsonReader(ws);
  await webSocketOpen(ws);
  const ready = await reader.next("events.ready");
  assert.equal(ready.account.username, "httpwsa");
  const snapshot = await reader.next("online.snapshot");
  assert.equal(snapshot.aoi.scope, "aoi");
  assert.equal(snapshot.players.some((player) => player.username === "httpwsb"), true);
  assert.equal(snapshot.players.some((player) => player.username === "httpwsc"), false);

  const position = await fetchJson(`${base}/players/position`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${actor.session.token}`},
    "body": JSON.stringify({
      "mapId": "firebud_training_yard",
      "cellX": 18,
      "cellY": 9,
      "facing": "west",
      "moving": true,
    }),
  });
  assert.equal(position.ok, true);
  const positionEvent = await reader.next("online.position");
  assert.equal(positionEvent.username, "httpwsb");
  assert.equal(positionEvent.position.cellX, 18);
  assert.equal(positionEvent.players.some((player) => player.username === "httpwsc"), false);

  const distantStillFar = await fetchJson(`${base}/players/position`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${distant.session.token}`},
    "body": JSON.stringify({
      "mapId": "firebud_training_yard",
      "cellX": 81,
      "cellY": 80,
      "facing": "west",
      "moving": true,
    }),
  });
  assert.equal(distantStillFar.ok, true);
  await assert.rejects(reader.next("online.position"), /websocket message timeout: online.position/);

  const distantMovedNear = await fetchJson(`${base}/players/position`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${distant.session.token}`},
    "body": JSON.stringify({
      "mapId": "firebud_training_yard",
      "cellX": 11,
      "cellY": 12,
      "facing": "north",
      "moving": true,
    }),
  });
  assert.equal(distantMovedNear.ok, true);
  const movedNearEvent = await reader.next("online.position");
  assert.equal(movedNearEvent.username, "httpwsc");
  assert.equal(movedNearEvent.players.some((player) => player.username === "httpwsc"), true);

  const chat = await fetchJson(`${base}/chat/send`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${actor.session.token}`},
    "body": JSON.stringify({"channel": "nearby", "text": "事件频道已通"}),
  });
  assert.equal(chat.ok, true);
  const chatEvent = await reader.next("chat.message");
  assert.equal(chatEvent.message.text, "事件频道已通");
  ws.close();
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

function webSocketOpen(ws) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("websocket open timeout")), 1000);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    }, {"once": true});
    ws.addEventListener("error", (event) => {
      clearTimeout(timer);
      reject(new Error(`websocket error ${event.message || ""}`));
    }, {"once": true});
  });
}

async function webSocketDataText(data) {
  if (typeof data === "string") {
    return data;
  }
  if (data && typeof data.arrayBuffer === "function") {
    return Buffer.from(await data.arrayBuffer()).toString("utf8");
  }
  return Buffer.from(data).toString("utf8");
}

function webSocketJsonReader(ws) {
  const queue = [];
  const waiters = [];
  ws.addEventListener("message", async (event) => {
    const data = await webSocketDataText(event.data);
    queue.push(JSON.parse(data));
    flush();
  });
  ws.addEventListener("error", (event) => {
    const error = new Error(`websocket error ${event.message || ""}`);
    while (waiters.length > 0) {
      const waiter = waiters.shift();
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  });
  function next(type) {
    const existingIndex = queue.findIndex((message) => !type || message.type === type);
    if (existingIndex >= 0) {
      const [message] = queue.splice(existingIndex, 1);
      return Promise.resolve(message);
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        type,
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) {
            waiters.splice(index, 1);
          }
          reject(new Error(`websocket message timeout: ${type}`));
        }, 1200),
      };
      waiters.push(waiter);
      flush();
    });
  }
  function flush() {
    for (let waiterIndex = 0; waiterIndex < waiters.length; waiterIndex += 1) {
      const waiter = waiters[waiterIndex];
      const messageIndex = queue.findIndex((message) => !waiter.type || message.type === waiter.type);
      if (messageIndex < 0) {
        continue;
      }
      const [message] = queue.splice(messageIndex, 1);
      waiters.splice(waiterIndex, 1);
      waiterIndex -= 1;
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  }
  return {next};
}
