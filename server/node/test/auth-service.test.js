"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
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
const {
  createMysqlAuthStore,
} = require("../src/mysql-store");

function createCountingAuthStore(initialData = null) {
  const store = createMemoryAuthStore(initialData);
  const counts = {
    loads: 0,
    saves: 0,
  };
  return {
    counts,
    load() {
      counts.loads += 1;
      return store.load();
    },
    save(nextData) {
      counts.saves += 1;
      store.save(nextData);
    },
    snapshot() {
      return store.load();
    },
  };
}

function battleProfile(name, playerStats, petStats = null) {
  const petId = petStats && petStats.petId ? petStats.petId : "";
  const profile = {
    "player": {
      "name": name,
      "level": Number(playerStats.level || 1),
      "hp": Number(playerStats.hp || playerStats.maxHp || 120),
      "maxHp": Number(playerStats.maxHp || 120),
      "baseStats": {
        "maxHp": Number(playerStats.maxHp || 120),
        "attack": Number(playerStats.attack || 18),
        "defense": Number(playerStats.defense || 6),
        "quick": Number(playerStats.quick || 70),
      },
    },
    "activePetInstanceId": petId,
    "petInstances": [],
  };
  if (petStats) {
    profile.petInstances.push({
      "instanceId": petId,
      "petId": petId,
      "formId": String(petStats.formId || "bui_normal_red_fire10"),
      "name": String(petStats.name || "宠物"),
      "state": "battle",
      "level": Number(petStats.level || 1),
      "hp": Number(petStats.hp || petStats.maxHp || 90),
      "maxHp": Number(petStats.maxHp || 90),
      "attack": Number(petStats.attack || 12),
      "defense": Number(petStats.defense || 6),
      "quick": Number(petStats.quick || 50),
      "activeSkillIds": ["pet_attack", "pet_defend", "pet_bui_charge"],
      "petSkillSlots": ["pet_attack", "pet_defend", "pet_bui_charge", "", "", "", ""],
      "passiveSkillIds": ["test_passive"],
    });
  }
  return profile;
}

function battleProfileWithPets(name, playerStats, pets) {
  const profile = battleProfile(name, playerStats, null);
  profile.activePetInstanceId = "";
  profile.petInstances = pets.map((pet, index) => {
    const petId = String(pet.petId || `pet_${index + 1}`);
    if (pet.state === "battle" && profile.activePetInstanceId === "") {
      profile.activePetInstanceId = petId;
    }
    return {
      "instanceId": petId,
      "petId": petId,
      "formId": String(pet.formId || "bui_normal_red_fire10"),
      "name": String(pet.name || "宠物"),
      "state": String(pet.state || "standby"),
      "level": Number(pet.level || 1),
      "hp": Number(pet.hp || pet.maxHp || 90),
      "maxHp": Number(pet.maxHp || 90),
      "attack": Number(pet.attack || 12),
      "defense": Number(pet.defense || 6),
      "quick": Number(pet.quick || 50),
      "activeSkillIds": ["pet_attack", "pet_defend", "pet_bui_charge"],
      "petSkillSlots": ["pet_attack", "pet_defend", "pet_bui_charge", "", "", "", ""],
      "passiveSkillIds": [],
    };
  });
  if (profile.activePetInstanceId === "" && profile.petInstances.length > 0) {
    profile.activePetInstanceId = String(profile.petInstances[0].instanceId || "");
    profile.petInstances[0].state = "battle";
  }
  return profile;
}

test("mysql store sends generated SQL through stdin", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-store-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  const logPath = path.join(tempDir, "calls.jsonl");
  const previousLogPath = process.env.FAKE_MYSQL_LOG;
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
const fs = require("node:fs");
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdin += chunk;
});
process.stdin.on("end", () => {
  fs.appendFileSync(process.env.FAKE_MYSQL_LOG, JSON.stringify({
    argv: process.argv.slice(2),
    stdinLength: stdin.length,
    hasExecuteArg: process.argv.slice(2).includes("-e"),
    hasServerState: stdin.includes("INSERT INTO server_state"),
  }) + "\\n");
});
`, {"mode": 0o755});
  try {
    process.env.FAKE_MYSQL_LOG = logPath;
    const store = createMysqlAuthStore({
      "mysqlPath": fakeMysqlPath,
      "host": "127.0.0.1",
      "port": 3306,
      "user": "tester",
      "password": "secret",
      "database": "beastbound_test",
      "createDatabase": false,
    });
    store.save({
      "accounts": {
        "mysqlprobe": {
          "accountId": "acc_mysqlprobe",
          "username": "mysqlprobe",
          "displayName": "MySQL探针",
          "role": "player",
          "createdAt": "2026-06-30T00:00:00.000Z",
          "updatedAt": "2026-06-30T00:00:00.000Z",
          "note": "x".repeat(4096),
        },
      },
      "sessions": {},
      "profileBindings": {},
      "profiles": {},
      "authEvents": [],
      "serviceEvents": [],
    });
    const calls = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.ok(calls.length >= 2);
    assert.ok(calls.every((call) => call.hasExecuteArg === false));
    assert.ok(calls.some((call) => call.hasServerState));
    assert.ok(calls.some((call) => call.stdinLength > 4096));
  } finally {
    if (previousLogPath === undefined) {
      delete process.env.FAKE_MYSQL_LOG;
    } else {
      process.env.FAKE_MYSQL_LOG = previousLogPath;
    }
    fs.rmSync(tempDir, {"recursive": true, "force": true});
  }
});

test("mysql store loads state documents larger than the Node default buffer", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-mysql-store-load-"));
  const fakeMysqlPath = path.join(tempDir, "fake-mysql.js");
  fs.writeFileSync(fakeMysqlPath, `#!/usr/bin/env node
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdin += chunk;
});
process.stdin.on("end", () => {
  if (!stdin.includes("SELECT CAST(document_json AS CHAR) FROM server_state")) {
    return;
  }
  const largeNote = "x".repeat(2 * 1024 * 1024);
  process.stdout.write(JSON.stringify({
    accounts: {
      biguser: {
        accountId: "acc_biguser",
        username: "biguser",
        displayName: "Big User",
        role: "player",
        createdAt: "2026-06-30T00:00:00.000Z",
        updatedAt: "2026-06-30T00:00:00.000Z",
        note: largeNote,
      },
    },
    sessions: {},
    profileBindings: {},
    profiles: {},
    authEvents: [],
    serviceEvents: [],
  }) + "\\n");
});
`, {"mode": 0o755});
  try {
    const store = createMysqlAuthStore({
      "mysqlPath": fakeMysqlPath,
      "host": "127.0.0.1",
      "port": 3306,
      "user": "tester",
      "password": "",
      "database": "beastbound_test",
      "createDatabase": false,
    });
    const loaded = store.load();
    assert.equal(Object.keys(loaded.accounts || {}).length, 1);
    assert.equal(loaded.accounts.biguser.note.length, 2 * 1024 * 1024);
  } finally {
    fs.rmSync(tempDir, {"recursive": true, "force": true});
  }
});

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

  const application = service.applyToParty(outsider.session.token, {"username": "partyb"});
  assert.equal(application.ok, true);
  assert.equal(application.invite.kind, "application");
  assert.equal(application.invite.fromUsername, "partyc");
  assert.equal(application.invite.toUsername, "partya");

  const applicationLeaderState = service.getPartyState(leader.session.token);
  assert.equal(applicationLeaderState.ok, true);
  assert.equal(applicationLeaderState.incomingInvites.length, 1);
  assert.equal(applicationLeaderState.incomingInvites[0].kind, "application");

  const acceptApplication = service.acceptPartyInvite(leader.session.token, applicationLeaderState.incomingInvites[0].inviteId);
  assert.equal(acceptApplication.ok, true);
  assert.equal(acceptApplication.party.memberCount, 3);
  assert.deepEqual(acceptApplication.party.members.map((player) => player.username), ["partya", "partyb", "partyc"]);

  const leaveOutsider = service.leaveParty(outsider.session.token);
  assert.equal(leaveOutsider.ok, true);

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
  service.updatePlayerPosition(challenger.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 10,
    "cellY": 10,
    "facing": "east",
    "moving": false,
  });
  service.updatePlayerPosition(opponent.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 11,
    "cellY": 10,
    "facing": "west",
    "moving": false,
  });

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
  assert.equal(accept.room.entry.distanceCells, 1);
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

test("server movement steps are authoritative and bounded", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const events = [];
  service.onEvent((event) => events.push(event));
  const scout = service.register({"username": "movea", "password": "test1234", "displayName": "移动甲"});
  assert.equal(scout.ok, true);

  const missing = service.movePlayerStep(scout.session.token, {
    "mapId": "firebud_training_yard",
    "fromCellX": 10,
    "fromCellY": 10,
    "toCellX": 11,
    "toCellY": 10,
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "movement_position_missing");

  const seed = service.updatePlayerPosition(scout.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 10,
    "cellY": 10,
    "facing": "east",
    "moving": false,
  });
  assert.equal(seed.ok, true);
  const step = service.movePlayerStep(scout.session.token, {
    "mapId": "firebud_training_yard",
    "fromCellX": 10,
    "fromCellY": 10,
    "toCellX": 11,
    "toCellY": 10,
    "moving": false,
  });
  assert.equal(step.ok, true);
  assert.equal(step.authority, "server_step");
  assert.equal(step.position.cellX, 11);
  assert.equal(step.position.movementSeq, 1);
  assert.equal(step.movement.stepAccepted, true);
  assert.equal(events.some((event) => event.type === "online.position" && event.authority === "server_step" && event.position.cellX === 11), true);

  const stale = service.movePlayerStep(scout.session.token, {
    "mapId": "firebud_training_yard",
    "fromCellX": 10,
    "fromCellY": 10,
    "toCellX": 11,
    "toCellY": 11,
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "movement_origin_mismatch");

  const jump = service.movePlayerStep(scout.session.token, {
    "mapId": "firebud_training_yard",
    "fromCellX": 11,
    "fromCellY": 10,
    "toCellX": 14,
    "toCellY": 10,
  });
  assert.equal(jump.ok, false);
  assert.equal(jump.code, "movement_step_too_far");
});

test("online positions are runtime-only and do not trigger store writes", () => {
  const store = createCountingAuthStore();
  const service = createAuthService({"store": store});
  const scout = service.register({"username": "movepersist", "password": "test1234", "displayName": "移动持久化"});
  assert.equal(scout.ok, true);
  const loadsAfterRegister = store.counts.loads;
  const savesAfterRegister = store.counts.saves;

  const seed = service.updatePlayerPosition(scout.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 10,
    "cellY": 10,
    "facing": "east",
    "moving": false,
  });
  assert.equal(seed.ok, true);
  const step = service.movePlayerStep(scout.session.token, {
    "mapId": "firebud_training_yard",
    "fromCellX": 10,
    "fromCellY": 10,
    "toCellX": 11,
    "toCellY": 10,
    "moving": false,
  });
  assert.equal(step.ok, true);
  assert.equal(step.position.cellX, 11);
  assert.equal(store.counts.loads, loadsAfterRegister);
  assert.equal(store.counts.saves, savesAfterRegister);

  const runtimePosition = service.snapshot().playerPositions[scout.account.accountId];
  assert.equal(runtimePosition.cellX, 11);
  assert.equal(runtimePosition.authority, "server_step");
  assert.equal(store.snapshot().playerPositions[scout.account.accountId], undefined);
});

test("duel battle rooms resolve turn commands into event lists", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const events = [];
  service.onEvent((event) => events.push(event));
  const challenger = service.register({"username": "turna", "password": "test1234", "displayName": "回合甲"});
  const opponent = service.register({"username": "turnb", "password": "test1234", "displayName": "回合乙"});
  assert.equal(challenger.ok, true);
  assert.equal(opponent.ok, true);
  service.updatePlayerPosition(challenger.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 10,
    "cellY": 10,
    "facing": "east",
    "moving": false,
  });
  service.updatePlayerPosition(opponent.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 11,
    "cellY": 10,
    "facing": "west",
    "moving": false,
  });
  const invite = service.inviteToBattle(challenger.session.token, {"username": "turnb"});
  assert.equal(invite.ok, true);
  const accept = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);
  assert.equal(accept.room.battle.phase, "command");
  assert.equal(accept.room.battle.round, 1);
  assert.equal(accept.room.battle.actors.length, 2);

  const firstCommand = service.submitBattleCommand(challenger.session.token, accept.room.roomId, {
    "round": 1,
    "actionId": "attack",
    "targetUsername": "turnb",
  });
  assert.equal(firstCommand.ok, true);
  assert.equal(firstCommand.turn, null);
  assert.equal(firstCommand.room.battle.submittedAccountIds.includes(challenger.account.accountId), true);
  assert.equal(events.some((event) => event.type === "battle.command_submitted" && event.roomId === accept.room.roomId), true);

  const duplicate = service.submitBattleCommand(challenger.session.token, accept.room.roomId, {
    "round": 1,
    "actionId": "attack",
    "targetUsername": "turnb",
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.code, "battle_command_duplicate");

  const secondCommand = service.submitBattleCommand(opponent.session.token, accept.room.roomId, {
    "round": 1,
    "actionId": "defend",
  });
  assert.equal(secondCommand.ok, true);
  assert.equal(secondCommand.turn.kind, "battle_event_list");
  assert.equal(secondCommand.turn.round, 1);
  assert.equal(secondCommand.turn.events.length, 2);
  assert.equal(secondCommand.turn.events.some((event) => event.eventType === "basic_attack" && event.targetUsername === "turnb" && event.damage > 0), true);
  assert.equal(secondCommand.turn.events.some((event) => event.eventType === "defend" && event.actorUsername === "turnb"), true);
  assert.equal(secondCommand.room.battle.round, 2);
  assert.equal(secondCommand.room.battle.submittedAccountIds.length, 0);
  assert.equal(secondCommand.room.battle.lastEventList.round, 1);
  assert.equal(events.some((event) => event.type === "battle.turn_resolved" && event.turn.kind === "battle_event_list"), true);

  const staleRound = service.submitBattleCommand(challenger.session.token, accept.room.roomId, {
    "round": 1,
    "actionId": "attack",
    "targetUsername": "turnb",
  });
  assert.equal(staleRound.ok, false);
  assert.equal(staleRound.code, "battle_command_round_mismatch");
});

test("duel battle rooms snapshot active battle pets as targetable actors", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const challenger = service.register({"username": "peta", "password": "test1234", "displayName": "宠物甲"});
  const opponent = service.register({"username": "petb", "password": "test1234", "displayName": "宠物乙"});
  assert.equal(challenger.ok, true);
  assert.equal(opponent.ok, true);
  const challengerProfile = service.saveProfile(challenger.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("宠物甲", {"level": 12, "hp": 156, "maxHp": 160, "attack": 28, "defense": 12, "quick": 76}, {
      "petId": "pet_a_active",
      "name": "甲的布伊",
      "level": 9,
      "hp": 88,
      "maxHp": 90,
      "attack": 20,
      "defense": 9,
      "quick": 64,
    }),
  });
  const opponentProfile = service.saveProfile(opponent.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("宠物乙", {"level": 11, "hp": 150, "maxHp": 152, "attack": 25, "defense": 11, "quick": 72}, {
      "petId": "pet_b_active",
      "name": "乙的布伊",
      "level": 8,
      "hp": 70,
      "maxHp": 72,
      "attack": 19,
      "defense": 8,
      "quick": 62,
    }),
  });
  assert.equal(challengerProfile.ok, true);
  assert.equal(opponentProfile.ok, true);
  service.updatePlayerPosition(challenger.session.token, {"mapId": "village", "cellX": 10, "cellY": 10, "facing": "east", "moving": false});
  service.updatePlayerPosition(opponent.session.token, {"mapId": "village", "cellX": 11, "cellY": 10, "facing": "west", "moving": false});

  const invite = service.inviteToBattle(challenger.session.token, {"username": "petb"});
  const accept = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);
  assert.equal(accept.room.participants[0].teamSnapshot.battlePetCount, 1);
  assert.equal(accept.room.battle.actors.length, 4);
  assert.equal(accept.room.battle.requiredActorIds.length, 4);
  const challengerPlayer = accept.room.battle.actors.find((actor) => actor.username === "peta" && actor.kind === "player");
  const challengerPet = accept.room.battle.actors.find((actor) => actor.username === "peta" && actor.kind === "pet");
  const opponentPlayer = accept.room.battle.actors.find((actor) => actor.username === "petb" && actor.kind === "player");
  const opponentPet = accept.room.battle.actors.find((actor) => actor.username === "petb" && actor.kind === "pet");
  assert.equal(challengerPlayer.attack, 28);
  assert.equal(challengerPet.petId, "pet_a_active");
  assert.equal(opponentPet.displayName, "乙的布伊");
  assert.equal(opponentPet.hp, 70);
  assert.equal(opponentPet.activeSkillIds.includes("pet_attack"), true);
  assert.equal(opponentPet.activeSkillIds.includes("pet_bui_charge"), true);

  const first = service.submitBattleCommand(challenger.session.token, accept.room.roomId, {
    "round": 1,
    "actionId": "attack",
    "actorId": challengerPlayer.actorId,
    "targetActorId": opponentPet.actorId,
  });
  assert.equal(first.ok, true);
  assert.equal(first.command.targetActorId, opponentPet.actorId);
  assert.equal(first.turn, null);
  const second = service.submitBattleCommand(opponent.session.token, accept.room.roomId, {
    "round": 1,
    "actionId": "defend",
    "actorId": opponentPlayer.actorId,
  });
  assert.equal(second.ok, true);
  assert.equal(second.turn, null);
  const third = service.submitBattleCommand(challenger.session.token, accept.room.roomId, {
    "round": 1,
    "actionId": "pet_bui_charge",
    "actorId": challengerPet.actorId,
    "targetActorId": opponentPet.actorId,
  });
  assert.equal(third.ok, true);
  assert.equal(third.turn, null);
  const fourth = service.submitBattleCommand(opponent.session.token, accept.room.roomId, {
    "round": 1,
    "actionId": "pet_defend",
    "actorId": opponentPet.actorId,
  });
  assert.equal(fourth.ok, true);
  assert.equal(fourth.turn.kind, "battle_event_list");
  assert.equal(fourth.turn.events.length, 4);
  const attack = fourth.turn.events.find((event) => event.eventType === "basic_attack" && event.actorId === challengerPlayer.actorId);
  const petSkill = fourth.turn.events.find((event) => event.eventType === "pet_skill" && event.actorId === challengerPet.actorId);
  assert.equal(attack.targetActorId, opponentPet.actorId);
  assert.equal(attack.targetKind, "pet");
  assert.equal(petSkill.targetActorId, opponentPet.actorId);
  assert.equal(petSkill.actionId, "pet_bui_charge");
  assert.equal(petSkill.damage > 0, true);
  const updatedOpponentPet = fourth.room.battle.actors.find((actor) => actor.actorId === opponentPet.actorId);
  const updatedOpponentPlayer = fourth.room.battle.actors.find((actor) => actor.actorId === opponentPlayer.actorId);
  assert.equal(updatedOpponentPet.hp < opponentPet.hp, true);
  assert.equal(updatedOpponentPlayer.hp, opponentPlayer.hp);

  const leave = service.leaveBattleRoom(challenger.session.token, accept.room.roomId);
  assert.equal(leave.ok, true);
  assert.equal(leave.room.status, "closed");
  const opponentAfter = service.getProfile(opponent.session.token);
  assert.equal(opponentAfter.ok, true);
  const storedOpponentPet = opponentAfter.profile.petInstances.find((pet) => pet.instanceId === opponentPet.petId);
  assert.equal(storedOpponentPet.hp, updatedOpponentPet.hp);
  assert.equal(opponentAfter.profileSummary.profileRevision, 2);
  const challengerAfter = service.getProfile(challenger.session.token);
  assert.equal(challengerAfter.profileSummary.profileRevision, 1);
  const storedRoom = service.snapshot().battleRooms[accept.room.roomId];
  assert.equal(storedRoom.battle.profileWriteback.profiles.length, 1);
  assert.equal(storedRoom.battle.profileWriteback.profiles[0].accountId, opponent.account.accountId);
  assert.equal(storedRoom.battle.profileWriteback.profiles[0].petHps[0].hp, updatedOpponentPet.hp);
});

test("duel battle rooms snapshot pet teams and resolve switch-pet commands", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const challenger = service.register({"username": "swapa", "password": "test1234", "displayName": "换宠甲"});
  const opponent = service.register({"username": "swapb", "password": "test1234", "displayName": "换宠乙"});
  assert.equal(challenger.ok, true);
  assert.equal(opponent.ok, true);
  assert.equal(service.saveProfile(challenger.session.token, {
    "expectedRevision": 0,
    "profile": battleProfileWithPets("换宠甲", {"level": 12, "hp": 150, "maxHp": 150, "attack": 20, "defense": 8, "quick": 50}, [
      {"petId": "pet_a_active", "name": "甲首发布伊", "state": "battle", "hp": 60, "maxHp": 90, "attack": 17, "defense": 7, "quick": 42},
      {"petId": "pet_a_standby", "name": "甲候补布伊", "state": "standby", "hp": 85, "maxHp": 92, "attack": 24, "defense": 9, "quick": 70},
    ]),
  }).ok, true);
  assert.equal(service.saveProfile(opponent.session.token, {
    "expectedRevision": 0,
    "profile": battleProfileWithPets("换宠乙", {"level": 12, "hp": 150, "maxHp": 150, "attack": 30, "defense": 8, "quick": 95}, [
      {"petId": "pet_b_active", "name": "乙布伊", "state": "battle", "hp": 80, "maxHp": 90, "attack": 18, "defense": 7, "quick": 60},
    ]),
  }).ok, true);
  service.updatePlayerPosition(challenger.session.token, {"mapId": "village", "cellX": 10, "cellY": 10, "facing": "east", "moving": false});
  service.updatePlayerPosition(opponent.session.token, {"mapId": "village", "cellX": 11, "cellY": 10, "facing": "west", "moving": false});

  const invite = service.inviteToBattle(challenger.session.token, {"username": "swapb"});
  const accept = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);
  assert.equal(accept.room.participants[0].teamSnapshot.battlePetCount, 2);
  assert.equal(accept.room.participants[0].teamSnapshot.battlePets[0].activeInBattle, true);
  assert.equal(accept.room.participants[0].teamSnapshot.battlePets[1].state, "standby");
  assert.equal(accept.room.battle.actors.filter((actor) => actor.username === "swapa" && actor.kind === "pet").length, 1);
  assert.equal(accept.room.battle.requiredActorIds.length, 4);
  const challengerPlayer = accept.room.battle.actors.find((actor) => actor.username === "swapa" && actor.kind === "player");
  const challengerPet = accept.room.battle.actors.find((actor) => actor.username === "swapa" && actor.kind === "pet");
  const opponentPlayer = accept.room.battle.actors.find((actor) => actor.username === "swapb" && actor.kind === "player");
  const opponentPet = accept.room.battle.actors.find((actor) => actor.username === "swapb" && actor.kind === "pet");
  assert.equal(challengerPet.petId, "pet_a_active");

  const switchCommand = service.submitBattleCommand(challenger.session.token, accept.room.roomId, {
    "round": 1,
    "actorId": challengerPlayer.actorId,
    "actionId": "switch_pet",
    "petId": "pet_a_standby",
  });
  assert.equal(switchCommand.ok, true);
  assert.equal(switchCommand.command.actionKind, "switch_pet");
  assert.equal(switchCommand.room.battle.requiredActorIds.includes(challengerPet.actorId), false);
  const attackCommand = service.submitBattleCommand(opponent.session.token, accept.room.roomId, {
    "round": 1,
    "actorId": opponentPlayer.actorId,
    "actionId": "attack",
    "targetActorId": challengerPet.actorId,
  });
  assert.equal(attackCommand.ok, true);
  assert.equal(attackCommand.turn, null);
  const resolveCommand = service.submitBattleCommand(opponent.session.token, accept.room.roomId, {
    "round": 1,
    "actorId": opponentPet.actorId,
    "actionId": "pet_defend",
  });
  assert.equal(resolveCommand.ok, true);
  assert.equal(resolveCommand.turn.kind, "battle_event_list");
  const attackEvent = resolveCommand.turn.events.find((event) => event.eventType === "basic_attack" && event.targetActorId === challengerPet.actorId);
  const switchEvent = resolveCommand.turn.events.find((event) => event.eventType === "switch_pet");
  assert.equal(Boolean(attackEvent), true);
  assert.equal(Boolean(switchEvent), true);
  assert.equal(switchEvent.petId, "pet_a_standby");
  assert.equal(switchEvent.previousPetId, "pet_a_active");
  assert.equal(switchEvent.nextPet.petId, "pet_a_standby");
  const switchedPet = resolveCommand.room.battle.actors.find((actor) => actor.username === "swapa" && actor.kind === "pet");
  assert.equal(switchedPet.petId, "pet_a_standby");
  assert.equal(resolveCommand.room.battle.requiredActorIds.includes(switchedPet.actorId), true);
  assert.equal(resolveCommand.room.battle.requiredActorIds.includes(challengerPet.actorId), false);

  const leave = service.leaveBattleRoom(opponent.session.token, accept.room.roomId);
  assert.equal(leave.ok, true);
  const challengerAfter = service.getProfile(challenger.session.token);
  assert.equal(challengerAfter.ok, true);
  const oldPet = challengerAfter.profile.petInstances.find((pet) => pet.instanceId === "pet_a_active");
  const newPet = challengerAfter.profile.petInstances.find((pet) => pet.instanceId === "pet_a_standby");
  assert.equal(oldPet.hp, attackEvent.hpAfter);
  assert.equal(newPet.hp, 85);
  assert.equal(challengerAfter.profileSummary.profileRevision, 2);
});

test("duel battle rooms snapshot and resolve server-authoritative battle items", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const challenger = service.register({"username": "itema", "password": "test1234", "displayName": "道具甲"});
  const opponent = service.register({"username": "itemb", "password": "test1234", "displayName": "道具乙"});
  assert.equal(challenger.ok, true);
  assert.equal(opponent.ok, true);
  const challengerProfile = battleProfile("道具甲", {"level": 12, "hp": 150, "maxHp": 150, "attack": 20, "defense": 8, "quick": 90}, {
    "petId": "pet_item_a",
    "name": "甲布伊",
    "state": "battle",
    "hp": 40,
    "maxHp": 90,
    "attack": 16,
    "defense": 7,
    "quick": 50,
  });
  challengerProfile.backpackSlots = [
    {"itemId": "item_heal_single_5", "count": 2},
    {"itemId": "item_meat_small", "count": 1},
  ];
  assert.equal(service.saveProfile(challenger.session.token, {
    "expectedRevision": 0,
    "profile": challengerProfile,
  }).ok, true);
  assert.equal(service.saveProfile(opponent.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("道具乙", {"level": 12, "hp": 150, "maxHp": 150, "attack": 18, "defense": 8, "quick": 70}, {
      "petId": "pet_item_b",
      "name": "乙布伊",
      "state": "battle",
      "hp": 80,
      "maxHp": 90,
      "attack": 16,
      "defense": 7,
      "quick": 50,
    }),
  }).ok, true);
  service.updatePlayerPosition(challenger.session.token, {"mapId": "village", "cellX": 10, "cellY": 10, "facing": "east", "moving": false});
  service.updatePlayerPosition(opponent.session.token, {"mapId": "village", "cellX": 11, "cellY": 10, "facing": "west", "moving": false});

  const invite = service.inviteToBattle(challenger.session.token, {"username": "itemb"});
  const accept = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);
  assert.equal(accept.room.participants[0].teamSnapshot.battleItemBag.item_heal_single_5, 2);
  assert.equal(accept.room.participants[0].teamSnapshot.battleItemBag.item_meat_small, 1);
  const challengerPlayer = accept.room.battle.actors.find((actor) => actor.username === "itema" && actor.kind === "player");
  const challengerPet = accept.room.battle.actors.find((actor) => actor.username === "itema" && actor.kind === "pet");
  const opponentPlayer = accept.room.battle.actors.find((actor) => actor.username === "itemb" && actor.kind === "player");
  const opponentPet = accept.room.battle.actors.find((actor) => actor.username === "itemb" && actor.kind === "pet");

  const enemyTarget = service.submitBattleCommand(challenger.session.token, accept.room.roomId, {
    "round": 1,
    "actorId": challengerPlayer.actorId,
    "actionId": "item_heal_single_5",
    "itemId": "item_heal_single_5",
    "targetActorId": opponentPet.actorId,
  });
  assert.equal(enemyTarget.ok, false);
  assert.equal(enemyTarget.code, "battle_command_target_invalid");

  const unsupported = service.submitBattleCommand(challenger.session.token, accept.room.roomId, {
    "round": 1,
    "actorId": challengerPlayer.actorId,
    "actionId": "item_heal_all_5",
    "itemId": "item_heal_all_5",
    "targetActorId": challengerPet.actorId,
  });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.code, "battle_command_item_unsupported");

  const itemCommand = service.submitBattleCommand(challenger.session.token, accept.room.roomId, {
    "round": 1,
    "actorId": challengerPlayer.actorId,
    "actionId": "item_heal_single_5",
    "itemId": "item_heal_single_5",
    "targetActorId": challengerPet.actorId,
  });
  assert.equal(itemCommand.ok, true);
  assert.equal(itemCommand.command.actionKind, "item");
  assert.equal(itemCommand.command.itemId, "item_heal_single_5");
  assert.equal(itemCommand.room.participants[0].teamSnapshot.battleItemBag.item_heal_single_5, 2);
  assert.equal(itemCommand.turn, null);

  assert.equal(service.submitBattleCommand(challenger.session.token, accept.room.roomId, {
    "round": 1,
    "actorId": challengerPet.actorId,
    "actionId": "pet_defend",
  }).ok, true);
  assert.equal(service.submitBattleCommand(opponent.session.token, accept.room.roomId, {
    "round": 1,
    "actorId": opponentPlayer.actorId,
    "actionId": "defend",
  }).ok, true);
  const roundOne = service.submitBattleCommand(opponent.session.token, accept.room.roomId, {
    "round": 1,
    "actorId": opponentPet.actorId,
    "actionId": "pet_defend",
  });
  assert.equal(roundOne.ok, true);
  assert.equal(roundOne.turn.kind, "battle_event_list");
  const healEvent = roundOne.turn.events.find((event) => event.eventType === "item_heal");
  assert.equal(healEvent.itemId, "item_heal_single_5");
  assert.equal(healEvent.targetActorId, challengerPet.actorId);
  assert.equal(healEvent.targetKind, "pet");
  assert.equal(healEvent.hpBefore, 40);
  assert.equal(healEvent.hpAfter, 82);
  assert.equal(healEvent.remainingItemCount, 1);

  const meatCommand = service.submitBattleCommand(challenger.session.token, accept.room.roomId, {
    "round": 2,
    "actorId": challengerPlayer.actorId,
    "actionId": "item_meat_small",
    "itemId": "item_meat_small",
    "targetActorId": challengerPlayer.actorId,
  });
  assert.equal(meatCommand.ok, true);
  assert.equal(meatCommand.room.participants[0].teamSnapshot.battleItemBag.item_meat_small, 1);
  assert.equal(service.submitBattleCommand(challenger.session.token, accept.room.roomId, {
    "round": 2,
    "actorId": challengerPet.actorId,
    "actionId": "pet_defend",
  }).ok, true);
  assert.equal(service.submitBattleCommand(opponent.session.token, accept.room.roomId, {
    "round": 2,
    "actorId": opponentPlayer.actorId,
    "actionId": "defend",
  }).ok, true);
  const roundTwo = service.submitBattleCommand(opponent.session.token, accept.room.roomId, {
    "round": 2,
    "actorId": opponentPet.actorId,
    "actionId": "pet_defend",
  });
  assert.equal(roundTwo.ok, true);
  const meatEvent = roundTwo.turn.events.find((event) => event.eventType === "item_heal" && event.itemId === "item_meat_small");
  assert.equal(meatEvent.targetActorId, challengerPlayer.actorId);
  assert.equal(meatEvent.remainingItemCount, 0);

  const leave = service.leaveBattleRoom(opponent.session.token, accept.room.roomId);
  assert.equal(leave.ok, true);
  const challengerAfter = service.getProfile(challenger.session.token);
  assert.equal(challengerAfter.ok, true);
  const storedPet = challengerAfter.profile.petInstances.find((pet) => pet.instanceId === "pet_item_a");
  assert.equal(storedPet.hp, 82);
  assert.equal(challengerAfter.profile.backpackSlots.filter((slot) => slot.itemId === "item_heal_single_5").reduce((total, slot) => total + slot.count, 0), 1);
  assert.equal(challengerAfter.profile.backpackSlots.filter((slot) => slot.itemId === "item_meat_small").reduce((total, slot) => total + slot.count, 0), 0);
});

test("duel battle rooms can cancel, leave, timeout, and finish with results", () => {
  let nowMs = Date.parse("2026-06-29T00:00:00.000Z");
  const service = createAuthService({
    "store": createMemoryAuthStore(),
    "now": () => nowMs,
  });
  const events = [];
  service.onEvent((event) => events.push(event));

  const challenger = service.register({"username": "closea", "password": "test1234", "displayName": "关闭甲"});
  const opponent = service.register({"username": "closeb", "password": "test1234", "displayName": "关闭乙"});
  assert.equal(challenger.ok, true);
  assert.equal(opponent.ok, true);
  service.updatePlayerPosition(challenger.session.token, {"mapId": "village", "cellX": 10, "cellY": 10, "facing": "east", "moving": false});
  service.updatePlayerPosition(opponent.session.token, {"mapId": "village", "cellX": 11, "cellY": 10, "facing": "west", "moving": false});

  const cancelInvite = service.inviteToBattle(challenger.session.token, {"username": "closeb"});
  assert.equal(cancelInvite.ok, true);
  assert.equal(Boolean(cancelInvite.invite.expiresAt), true);
  const cancel = service.cancelBattleInvite(challenger.session.token, cancelInvite.invite.inviteId);
  assert.equal(cancel.ok, true);
  assert.equal(cancel.invite.status, "cancelled");
  assert.equal(events.some((event) => event.type === "battle.invite_cancelled" && event.invite.inviteId === cancelInvite.invite.inviteId), true);
  const acceptCancelled = service.acceptBattleInvite(opponent.session.token, cancelInvite.invite.inviteId);
  assert.equal(acceptCancelled.ok, false);
  assert.equal(acceptCancelled.code, "battle_invite_missing");

  const leaveInvite = service.inviteToBattle(challenger.session.token, {"username": "closeb"});
  const leaveAccept = service.acceptBattleInvite(opponent.session.token, leaveInvite.invite.inviteId);
  assert.equal(leaveAccept.ok, true);
  const leave = service.leaveBattleRoom(opponent.session.token, leaveAccept.room.roomId);
  assert.equal(leave.ok, true);
  assert.equal(leave.room.status, "closed");
  assert.equal(leave.result.reason, "leave");
  assert.equal(leave.result.winnerAccountId, challenger.account.accountId);
  assert.equal(service.getBattleState(challenger.session.token).room, null);
  assert.equal(events.some((event) => event.type === "battle.room_closed" && event.reason === "leave"), true);

  const timeoutInvite = service.inviteToBattle(challenger.session.token, {"username": "closeb"});
  assert.equal(timeoutInvite.ok, true);
  nowMs += 3 * 60 * 1000;
  const expiredState = service.getBattleState(opponent.session.token);
  assert.equal(expiredState.ok, true);
  assert.equal(expiredState.incomingInvites.length, 0);
  assert.equal(events.some((event) => event.type === "battle.invite_expired" && event.invite.inviteId === timeoutInvite.invite.inviteId), true);

  const roomInvite = service.inviteToBattle(challenger.session.token, {"username": "closeb"});
  const roomAccept = service.acceptBattleInvite(opponent.session.token, roomInvite.invite.inviteId);
  assert.equal(roomAccept.ok, true);
  nowMs += 100 * 1000;
  const timeoutState = service.getBattleState(challenger.session.token);
  assert.equal(timeoutState.ok, true);
  assert.equal(timeoutState.room, null);
  assert.equal(events.some((event) => event.type === "battle.room_closed" && event.reason === "timeout"), true);

  const lateInvite = service.inviteToBattle(challenger.session.token, {"username": "closeb"});
  const lateAccept = service.acceptBattleInvite(opponent.session.token, lateInvite.invite.inviteId);
  assert.equal(lateAccept.ok, true);
  nowMs += 100 * 1000;
  const timeoutEventsBeforeLateCommand = events.filter((event) => event.type === "battle.room_closed" && event.reason === "timeout").length;
  const lateCommand = service.submitBattleCommand(challenger.session.token, lateAccept.room.roomId, {
    "round": 1,
    "actionId": "attack",
    "targetUsername": "closeb",
  });
  assert.equal(lateCommand.ok, false);
  assert.equal(lateCommand.code, "battle_room_missing");
  assert.equal(events.filter((event) => event.type === "battle.room_closed" && event.reason === "timeout").length, timeoutEventsBeforeLateCommand + 1);

  const resultInvite = service.inviteToBattle(challenger.session.token, {"username": "closeb"});
  const resultAccept = service.acceptBattleInvite(opponent.session.token, resultInvite.invite.inviteId);
  assert.equal(resultAccept.ok, true);
  let activeRoom = resultAccept.room;
  let finalCommand = null;
  for (let guard = 0; guard < 20 && activeRoom && activeRoom.status !== "closed"; guard += 1) {
    const round = activeRoom.battle.round;
    const first = service.submitBattleCommand(challenger.session.token, activeRoom.roomId, {
      "round": round,
      "actionId": "attack",
      "targetUsername": "closeb",
    });
    assert.equal(first.ok, true);
    const second = service.submitBattleCommand(opponent.session.token, activeRoom.roomId, {
      "round": round,
      "actionId": "defend",
    });
    assert.equal(second.ok, true);
    finalCommand = second;
    activeRoom = second.room;
  }
  assert.equal(finalCommand.ok, true);
  assert.equal(finalCommand.room.status, "closed");
  assert.equal(finalCommand.turn.result.reason, "defeat");
  assert.equal(finalCommand.room.battle.result.winnerAccountId, challenger.account.accountId);
  assert.equal(finalCommand.room.battle.result.battleReturns.length, 1);
  assert.equal(finalCommand.room.battle.result.battleReturns[0].accountId, opponent.account.accountId);
  assert.equal(finalCommand.room.battle.result.battleReturns[0].recordPoint.mapId, "firebud_village_gate");
  assert.equal(finalCommand.room.battle.result.battleReturns[0].position.cellX, 10);
  assert.equal(finalCommand.room.battle.result.battleReturns[0].position.cellY, 17);
  assert.equal(finalCommand.turn.result.battleReturns[0].position.authority, "battle_result_return");
  const returnedOpponentPosition = service.snapshot().playerPositions[opponent.account.accountId];
  assert.equal(returnedOpponentPosition.mapId, "firebud_village_gate");
  assert.equal(returnedOpponentPosition.cellX, 10);
  assert.equal(returnedOpponentPosition.cellY, 17);
  assert.equal(returnedOpponentPosition.authority, "battle_result_return");
  assert.equal(events.some((event) => event.type === "battle.room_closed" && event.reason === "defeat"), true);
});

test("duel battle rooms require nearby settled positions", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const challenger = service.register({"username": "nearba", "password": "test1234", "displayName": "近战甲"});
  const opponent = service.register({"username": "nearbb", "password": "test1234", "displayName": "近战乙"});
  assert.equal(challenger.ok, true);
  assert.equal(opponent.ok, true);

  const invite = service.inviteToBattle(challenger.session.token, {"username": "nearbb"});
  assert.equal(invite.ok, true);
  const missing = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "battle_position_missing");

  service.updatePlayerPosition(challenger.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 10,
    "cellY": 10,
    "facing": "east",
    "moving": false,
  });
  service.updatePlayerPosition(opponent.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 30,
    "cellY": 10,
    "facing": "west",
    "moving": false,
  });
  const far = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  assert.equal(far.ok, false);
  assert.equal(far.code, "battle_distance_too_far");

  service.updatePlayerPosition(opponent.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 11,
    "cellY": 10,
    "facing": "west",
    "moving": true,
  });
  const moving = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  assert.equal(moving.ok, false);
  assert.equal(moving.code, "battle_player_moving");

  service.updatePlayerPosition(opponent.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 11,
    "cellY": 10,
    "facing": "west",
    "moving": false,
  });
  const accept = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);
  assert.equal(accept.room.entry.distanceCells, 1);
});

test("battle rooms are runtime-only and are not restored from the auth store", () => {
  const store = createCountingAuthStore();
  const service = createAuthService({"store": store});
  const challenger = service.register({"username": "runtimea", "password": "test1234", "displayName": "运行甲"});
  const opponent = service.register({"username": "runtimeb", "password": "test1234", "displayName": "运行乙"});
  assert.equal(challenger.ok, true);
  assert.equal(opponent.ok, true);
  service.updatePlayerPosition(challenger.session.token, {"mapId": "village", "cellX": 10, "cellY": 10, "facing": "east", "moving": false});
  service.updatePlayerPosition(opponent.session.token, {"mapId": "village", "cellX": 11, "cellY": 10, "facing": "west", "moving": false});
  const invite = service.inviteToBattle(challenger.session.token, {"username": "runtimeb"});
  assert.equal(invite.ok, true);
  const accept = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);
  assert.notEqual(service.snapshot().battleRooms[accept.room.roomId], undefined);
  assert.deepEqual(store.snapshot().battleRooms, {});
  assert.deepEqual(store.snapshot().battleInvites, {});

  const restarted = createAuthService({"store": store});
  const restartedState = restarted.getBattleState(challenger.session.token);
  assert.equal(restartedState.ok, true);
  assert.equal(restartedState.room, null);
});

test("battle rooms preserve short reconnects and close after disconnect grace", () => {
  let nowMs = Date.parse("2026-01-01T00:00:00.000Z");
  const service = createAuthService({
    "store": createMemoryAuthStore(),
    "now": () => nowMs,
  });
  const challenger = service.register({"username": "recona", "password": "test1234", "displayName": "重连甲"});
  const opponent = service.register({"username": "reconb", "password": "test1234", "displayName": "重连乙"});
  assert.equal(challenger.ok, true);
  assert.equal(opponent.ok, true);
  service.updatePlayerPosition(challenger.session.token, {"mapId": "village", "cellX": 10, "cellY": 10, "facing": "east", "moving": false});
  service.updatePlayerPosition(opponent.session.token, {"mapId": "village", "cellX": 11, "cellY": 10, "facing": "west", "moving": false});
  const invite = service.inviteToBattle(challenger.session.token, {"username": "reconb"});
  const accept = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);
  const roomId = accept.room.roomId;

  const disconnected = service.markBattleConnection(challenger.session.token, false);
  assert.equal(disconnected.ok, true);
  nowMs += 20 * 1000;
  const reconnected = service.markBattleConnection(challenger.session.token, true);
  assert.equal(reconnected.ok, true);
  assert.equal(reconnected.room.roomId, roomId);
  assert.equal(service.getBattleState(challenger.session.token).room.roomId, roomId);

  service.markBattleConnection(challenger.session.token, false);
  nowMs += 31 * 1000;
  const maintenance = service.runBattleMaintenance();
  assert.equal(maintenance.ok, true);
  assert.equal(maintenance.events.some((event) => event.type === "battle.room_closed" && event.reason === "disconnect_timeout"), true);
  assert.equal(service.getBattleState(challenger.session.token).room, null);
  assert.equal(service.getBattleState(opponent.session.token).room, null);
  const closedRoom = service.snapshot().battleRooms[roomId];
  assert.equal(closedRoom.status, "closed");
  assert.equal(closedRoom.battle.result.winnerAccountId, opponent.account.accountId);
  assert.deepEqual(closedRoom.battle.result.loserAccountIds, [challenger.account.accountId]);
});

test("battle rooms close cleanly when both participants miss reconnect grace", () => {
  let nowMs = Date.parse("2026-01-01T01:00:00.000Z");
  const service = createAuthService({
    "store": createMemoryAuthStore(),
    "now": () => nowMs,
  });
  const challenger = service.register({"username": "bothdropa", "password": "test1234", "displayName": "双断甲"});
  const opponent = service.register({"username": "bothdropb", "password": "test1234", "displayName": "双断乙"});
  assert.equal(challenger.ok, true);
  assert.equal(opponent.ok, true);
  service.updatePlayerPosition(challenger.session.token, {"mapId": "village", "cellX": 10, "cellY": 10, "facing": "east", "moving": false});
  service.updatePlayerPosition(opponent.session.token, {"mapId": "village", "cellX": 11, "cellY": 10, "facing": "west", "moving": false});
  const invite = service.inviteToBattle(challenger.session.token, {"username": "bothdropb"});
  const accept = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);
  const roomId = accept.room.roomId;
  service.markBattleConnection(challenger.session.token, false);
  service.markBattleConnection(opponent.session.token, false);
  nowMs += 31 * 1000;

  const maintenance = service.runBattleMaintenance();
  assert.equal(maintenance.ok, true);
  assert.equal(service.getBattleState(challenger.session.token).room, null);
  assert.equal(service.getBattleState(opponent.session.token).room, null);
  const closedRoom = service.snapshot().battleRooms[roomId];
  assert.equal(closedRoom.status, "closed");
  assert.equal(closedRoom.battle.result.reason, "disconnect_timeout");
  assert.equal(closedRoom.battle.result.winnerAccountId, "");
  assert.deepEqual(closedRoom.battle.result.loserAccountIds.sort(), [challenger.account.accountId, opponent.account.accountId].sort());
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
  const step = await fetchJson(`${base}/movement/step`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${member.session.token}`},
    "body": JSON.stringify({
      "mapId": "firebud_training_yard",
      "fromCellX": 9,
      "fromCellY": 11,
      "toCellX": 10,
      "toCellY": 11,
      "moving": false,
    }),
  });
  assert.equal(step.ok, true);
  assert.equal(step.authority, "server_step");
  assert.equal(step.position.cellX, 10);
  assert.equal(step.position.movementSeq, 1);
  const staleStep = await fetchJson(`${base}/movement/step`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${member.session.token}`},
    "body": JSON.stringify({
      "mapId": "firebud_training_yard",
      "fromCellX": 9,
      "fromCellY": 11,
      "toCellX": 10,
      "toCellY": 11,
      "moving": false,
    }),
  });
  assert.equal(staleStep.ok, false);
  assert.equal(staleStep.code, "movement_origin_mismatch");
  assert.equal(staleStep.position.cellX, 10);
  assert.equal(staleStep.movement.authority, "server_step");
  assert.equal(staleStep.movement.stepAccepted, false);
  assert.equal(staleStep.movement.retryable, true);
  assert.equal(staleStep.movement.requiresSync, true);
  const jump = await fetchJson(`${base}/movement/step`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${member.session.token}`},
    "body": JSON.stringify({
      "mapId": "firebud_training_yard",
      "fromCellX": 10,
      "fromCellY": 11,
      "toCellX": 14,
      "toCellY": 11,
    }),
  });
  assert.equal(jump.ok, false);
  assert.equal(jump.code, "movement_step_too_far");
  assert.equal(jump.position.cellX, 10);
  assert.equal(jump.movement.stepAccepted, false);
  assert.equal(jump.movement.maxStepCells, 1);
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
  assert.equal(memberOnline.position.facing, "east");
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

  const application = await fetchJson(`${base}/party/apply`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${distant.session.token}`},
    "body": JSON.stringify({"username": "httppartyb"}),
  });
  assert.equal(application.ok, true);
  assert.equal(application.invite.kind, "application");
  assert.equal(application.invite.toUsername, "httppartya");

  const leaderState = await fetchJson(`${base}/party/state`, {
    "headers": {"authorization": `Bearer ${leader.session.token}`},
  });
  assert.equal(leaderState.ok, true);
  assert.equal(leaderState.party.members[0].role, "leader");
  assert.equal(leaderState.incomingInvites.length, 1);
  assert.equal(leaderState.incomingInvites[0].kind, "application");

  const acceptApplication = await fetchJson(`${base}/party/invites/${encodeURIComponent(leaderState.incomingInvites[0].inviteId)}/accept`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${leader.session.token}`},
  });
  assert.equal(acceptApplication.ok, true);
  assert.equal(acceptApplication.party.memberCount, 3);

  const outsiderLeave = await fetchJson(`${base}/party/leave`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${distant.session.token}`},
  });
  assert.equal(outsiderLeave.ok, true);

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
  await fetchJson(`${base}/players/position`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${challenger.session.token}`},
    "body": JSON.stringify({
      "mapId": "firebud_training_yard",
      "cellX": 10,
      "cellY": 10,
      "facing": "east",
      "moving": false,
    }),
  });
  await fetchJson(`${base}/players/position`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${opponent.session.token}`},
    "body": JSON.stringify({
      "mapId": "firebud_training_yard",
      "cellX": 11,
      "cellY": 10,
      "facing": "west",
      "moving": false,
    }),
  });

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
  assert.equal(accept.room.entry.distanceCells, 1);
  assert.equal(accept.room.participants.length, 2);
  const roomEvent = await reader.next("battle.room_ready");
  assert.equal(roomEvent.room.roomId, accept.room.roomId);
  assert.equal(roomEvent.room.seed, accept.room.seed);

  const challengerCommand = await fetchJson(`${base}/battle/rooms/${encodeURIComponent(accept.room.roomId)}/commands`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${challenger.session.token}`},
    "body": JSON.stringify({
      "round": 1,
      "actionId": "attack",
      "targetUsername": "httpbatb",
    }),
  });
  assert.equal(challengerCommand.ok, true);
  assert.equal(challengerCommand.turn, null);
  const commandEvent = await reader.next("battle.command_submitted");
  assert.equal(commandEvent.roomId, accept.room.roomId);
  assert.equal(commandEvent.submittedUsername, "httpbata");

  const opponentCommand = await fetchJson(`${base}/battle/rooms/${encodeURIComponent(accept.room.roomId)}/commands`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${opponent.session.token}`},
    "body": JSON.stringify({
      "round": 1,
      "actionId": "defend",
    }),
  });
  assert.equal(opponentCommand.ok, true);
  assert.equal(opponentCommand.turn.kind, "battle_event_list");
  assert.equal(opponentCommand.turn.events.length, 2);
  const turnEvent = await reader.next("battle.turn_resolved");
  assert.equal(turnEvent.roomId, accept.room.roomId);
  assert.equal(turnEvent.turn.kind, "battle_event_list");
  assert.equal(turnEvent.turn.round, 1);
  assert.equal(turnEvent.room.battle.round, 2);
  const leave = await fetchJson(`${base}/battle/rooms/${encodeURIComponent(accept.room.roomId)}/leave`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${opponent.session.token}`},
  });
  assert.equal(leave.ok, true);
  assert.equal(leave.room.status, "closed");
  assert.equal(leave.result.reason, "leave");
  const closeEvent = await reader.next("battle.room_closed");
  assert.equal(closeEvent.roomId, accept.room.roomId);
  assert.equal(closeEvent.reason, "leave");
  assert.equal(closeEvent.room.status, "closed");
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
  await fetchJson(`${base}/players/position`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${challenger.session.token}`},
    "body": JSON.stringify({
      "mapId": "firebud_training_yard",
      "cellX": 10,
      "cellY": 10,
      "facing": "east",
      "moving": false,
    }),
  });
  await fetchJson(`${base}/players/position`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${opponent.session.token}`},
    "body": JSON.stringify({
      "mapId": "firebud_training_yard",
      "cellX": 11,
      "cellY": 10,
      "facing": "west",
      "moving": false,
    }),
  });

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

  const latest = await fetchJson(`${base}/events/latest`, {
    "headers": {"authorization": `Bearer ${watcher.session.token}`},
  });
  assert.equal(latest.ok, true);
  assert.equal(Number.isInteger(latest.latestEventSeq), true);

  const ws = new WebSocket(`${wsBase}/events?token=${encodeURIComponent(watcher.session.token)}&lastEventSeq=${latest.latestEventSeq}`);
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
