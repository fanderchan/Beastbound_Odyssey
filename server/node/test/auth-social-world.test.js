"use strict";

const {
  assert,
  crypto,
  fs,
  os,
  path,
  test,
  once,
  createAuthService,
  createMemoryAuthStore,
  createHttpServer,
  createDefaultStore,
  DEFAULT_COMMAND_CATALOG,
  CLIENT_PROTOCOL_HEADER,
  CLIENT_VERSION_HEADER,
  PROTOCOL_VERSION,
  SERVER_VERSION,
  createMysqlAuthStore,
  createCountingAuthStore,
  testPasswordHash,
  withEnv,
  battleProfile,
  profileItemCount,
  playerRebirthReadyProfile,
  battleProfileWithPets,
  fetchJson,
  eventStreamUrl,
  webSocketOpen,
  webSocketJsonReader,
} = require("../test-support/auth-service-test-context");

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

  const senderProfile = battleProfile("甲", {"level": 1, "hp": 120, "maxHp": 120}, null);
  senderProfile.backpackSlots = [
    {"itemId": "item_meat_small", "count": 3},
    ...Array.from({"length": 14}, () => ({})),
  ];
  const recipientProfile = battleProfile("乙", {"level": 1, "hp": 120, "maxHp": 120}, null);
  recipientProfile.backpackSlots = Array.from({"length": 15}, () => ({}));
  assert.equal(service.saveProfile(sender.session.token, {"expectedRevision": 0, "profile": senderProfile}).ok, true);
  assert.equal(service.saveProfile(recipient.session.token, {"expectedRevision": 0, "profile": recipientProfile}).ok, true);

  const attached = service.sendMail(sender.session.token, {
    "recipientUsername": "mailb",
    "title": "补给",
    "body": "带上小肉。",
    "items": [{"itemId": "item_meat_small", "count": 2}],
  });
  assert.equal(attached.ok, true);
  assert.equal(attached.mail.items.length, 1);
  assert.equal(profileItemCount(attached.profile, "item_meat_small"), 1);
  const attachmentInbox = service.listInbox(recipient.session.token);
  assert.equal(attachmentInbox.messages[0].items[0].itemId, "item_meat_small");
  const claimed = service.claimMailAttachments(recipient.session.token, attachmentInbox.messages[0].mailId);
  assert.equal(claimed.ok, true);
  assert.equal(claimed.claim.addedItems[0].count, 2);
  assert.equal(profileItemCount(claimed.profile, "item_meat_small"), 2);
  assert.equal(claimed.mail, null);
  const afterClaimInbox = service.listInbox(recipient.session.token);
  assert.equal(afterClaimInbox.messages.some((mail) => mail.mailId === attachmentInbox.messages[0].mailId), false);
});

test("players can invite, accept, and leave server parties", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const leader = service.register({"username": "partya", "password": "test1234", "displayName": "队长"});
  const member = service.register({"username": "partyb", "password": "test1234", "displayName": "队员"});
  const outsider = service.register({"username": "partyc", "password": "test1234", "displayName": "路人"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  assert.equal(outsider.ok, true);
  const leaderProfile = service.saveProfile(leader.session.token, {
    profile: battleProfile("队长", {level: 12, hp: 140, maxHp: 140, attack: 24, defense: 10, quick: 72}, {
      petId: "party_leader_pet",
      name: "队长布伊",
      level: 12,
      hp: 100,
      maxHp: 100,
    }),
  });
  const memberProfile = service.saveProfile(member.session.token, {
    profile: battleProfile("队员", {level: 9, hp: 130, maxHp: 130, attack: 21, defense: 8, quick: 66}, {
      petId: "party_member_pet",
      name: "队员布伊",
      level: 9,
      hp: 95,
      maxHp: 95,
    }),
  });
  assert.equal(leaderProfile.ok, true);
  assert.equal(memberProfile.ok, true);

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
  const acceptedMember = accept.party.members.find((player) => player.username === "partyb");
  assert.equal(acceptedMember.teamSnapshot.player.name, "队员");
  assert.equal(acceptedMember.teamSnapshot.battlePets[0].petId, "party_member_pet");

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

test("party members follow the leader and cannot move independently", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const leader = service.register({"username": "followa", "password": "test1234", "displayName": "跟随甲"});
  const member = service.register({"username": "followb", "password": "test1234", "displayName": "跟随乙"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);

  const leaderSeed = service.updatePlayerPosition(leader.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 10,
    "cellY": 10,
    "facing": "east",
    "moving": false,
  });
  const memberSeed = service.updatePlayerPosition(member.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 9,
    "cellY": 10,
    "facing": "east",
    "moving": false,
  });
  assert.equal(leaderSeed.ok, true);
  assert.equal(memberSeed.ok, true);

  const invite = service.inviteToParty(leader.session.token, {"username": "followb"});
  const accept = service.acceptPartyInvite(member.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);
  assert.equal(accept.party.memberCount, 2);

  const memberMove = service.movePlayerStep(member.session.token, {
    "mapId": "firebud_training_yard",
    "fromCellX": 9,
    "fromCellY": 10,
    "toCellX": 8,
    "toCellY": 10,
  });
  assert.equal(memberMove.ok, false);
  assert.equal(memberMove.code, "movement_party_member_locked");
  assert.equal(memberMove.position.cellX, 9);

  const memberSnapshot = service.updatePlayerPosition(member.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 30,
    "cellY": 30,
    "facing": "south",
    "moving": false,
  });
  assert.equal(memberSnapshot.ok, true);
  assert.equal(memberSnapshot.position.cellX, 9);
  assert.equal(memberSnapshot.position.cellY, 10);
  assert.equal(memberSnapshot.position.authority, "party_follow");

  const leaderStep = service.movePlayerStep(leader.session.token, {
    "mapId": "firebud_training_yard",
    "fromCellX": 10,
    "fromCellY": 10,
    "toCellX": 11,
    "toCellY": 10,
    "moving": false,
  });
  assert.equal(leaderStep.ok, true);
  assert.equal(leaderStep.position.cellX, 11);
  const snapshot = service.snapshot();
  const followerPosition = snapshot.playerPositions[member.account.accountId];
  assert.equal(followerPosition.cellX, 10);
  assert.equal(followerPosition.cellY, 10);
  assert.equal(followerPosition.authority, "party_follow");
  const followerOnline = leaderStep.players.find((player) => player.accountId === member.account.accountId);
  assert.equal(followerOnline.position.cellX, 10);
  assert.equal(followerOnline.position.authority, "party_follow");

  const leaderMapSwitch = service.updatePlayerPosition(leader.session.token, {
    "mapId": "firebud_village_gate",
    "cellX": 15,
    "cellY": 20,
    "facing": "south",
    "moving": false,
  });
  assert.equal(leaderMapSwitch.ok, true);
  assert.equal(leaderMapSwitch.position.mapId, "firebud_village_gate");
  const switchedSnapshot = service.snapshot();
  const switchedFollowerPosition = switchedSnapshot.playerPositions[member.account.accountId];
  assert.equal(switchedFollowerPosition.mapId, "firebud_village_gate");
  assert.equal(switchedFollowerPosition.cellX, 15);
  assert.equal(switchedFollowerPosition.cellY, 20);
  assert.equal(switchedFollowerPosition.authority, "party_follow");
  const switchedFollowerOnline = leaderMapSwitch.players.find((player) => player.accountId === member.account.accountId);
  assert.equal(switchedFollowerOnline.position.mapId, "firebud_village_gate");
  assert.equal(switchedFollowerOnline.position.cellX, 15);
  assert.equal(switchedFollowerOnline.position.authority, "party_follow");
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
