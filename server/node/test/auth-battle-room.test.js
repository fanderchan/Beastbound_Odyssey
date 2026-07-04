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

test("duel battle rooms resolve turn commands into event lists", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const events = [];
  service.onEvent((event) => events.push(event));
  const challenger = service.register({"username": "turna", "password": "test1234", "displayName": "回合甲"});
  const opponent = service.register({"username": "turnb", "password": "test1234", "displayName": "回合乙"});
  assert.equal(challenger.ok, true);
  assert.equal(opponent.ok, true);
  assert.equal(service.saveProfile(challenger.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("回合甲", {"level": 8, "hp": 140, "maxHp": 140, "attack": 28, "defense": 10, "quick": 80}, null),
  }).ok, true);
  assert.equal(service.saveProfile(opponent.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("回合乙", {"level": 8, "hp": 140, "maxHp": 140, "attack": 22, "defense": 10, "quick": 70}, null),
  }).ok, true);
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

test("resolved battle rounds reserve playback grace before next command timeout", () => {
  let nowMs = Date.parse("2026-01-01T00:00:00.000Z");
  const service = createAuthService({
    "store": createMemoryAuthStore(),
    "now": () => nowMs,
  });
  const challenger = service.register({"username": "gracea", "password": "test1234", "displayName": "缓冲甲"});
  const opponent = service.register({"username": "graceb", "password": "test1234", "displayName": "缓冲乙"});
  assert.equal(challenger.ok, true);
  assert.equal(opponent.ok, true);
  assert.equal(service.saveProfile(challenger.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("缓冲甲", {"level": 10, "hp": 220, "maxHp": 220, "attack": 20, "defense": 12, "quick": 80}, null),
  }).ok, true);
  assert.equal(service.saveProfile(opponent.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("缓冲乙", {"level": 10, "hp": 220, "maxHp": 220, "attack": 20, "defense": 12, "quick": 70}, null),
  }).ok, true);
  service.updatePlayerPosition(challenger.session.token, {"mapId": "firebud_training_yard", "cellX": 10, "cellY": 10, "facing": "east", "moving": false});
  service.updatePlayerPosition(opponent.session.token, {"mapId": "firebud_training_yard", "cellX": 11, "cellY": 10, "facing": "west", "moving": false});
  const invite = service.inviteToBattle(challenger.session.token, {"username": "graceb"});
  assert.equal(invite.ok, true);
  const accept = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);
  assert.equal(Date.parse(accept.room.battle.commandDeadlineAt) - nowMs, 99 * 1000);
  const roomId = accept.room.roomId;
  const firstCommand = service.submitBattleCommand(challenger.session.token, roomId, {
    "round": 1,
    "actionId": "attack",
    "targetUsername": "graceb",
  });
  assert.equal(firstCommand.ok, true);
  assert.equal(firstCommand.turn, null);
  const secondCommand = service.submitBattleCommand(opponent.session.token, roomId, {
    "round": 1,
    "actionId": "defend",
  });
  assert.equal(secondCommand.ok, true);
  assert.equal(secondCommand.turn.kind, "battle_event_list");
  assert.equal(secondCommand.room.battle.round, 2);
  assert.equal(Date.parse(secondCommand.room.battle.commandDeadlineAt) - nowMs, 129 * 1000);
  nowMs += 100 * 1000;
  const earlyMaintenance = service.runBattleMaintenance();
  assert.equal(earlyMaintenance.ok, true);
  assert.equal(earlyMaintenance.events.some((event) => event.type === "battle.room_closed"), false);
  assert.equal(service.snapshot().battleRooms[roomId].status, "ready");
  nowMs += 30 * 1000;
  const timeoutMaintenance = service.runBattleMaintenance();
  assert.equal(timeoutMaintenance.ok, true);
  assert.equal(timeoutMaintenance.events.some((event) => event.type === "battle.room_closed" && event.reason === "timeout"), true);
});

test("duel battle rooms resolve near-concurrent round commands once", async () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const events = [];
  service.onEvent((event) => events.push(event));
  const challenger = service.register({"username": "racea", "password": "test1234", "displayName": "并发甲"});
  const opponent = service.register({"username": "raceb", "password": "test1234", "displayName": "并发乙"});
  assert.equal(challenger.ok, true);
  assert.equal(opponent.ok, true);
  assert.equal(service.saveProfile(challenger.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("并发甲", {"level": 10, "hp": 150, "maxHp": 150, "attack": 30, "defense": 12, "quick": 80}, null),
  }).ok, true);
  assert.equal(service.saveProfile(opponent.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("并发乙", {"level": 10, "hp": 150, "maxHp": 150, "attack": 28, "defense": 12, "quick": 78}, null),
  }).ok, true);
  service.updatePlayerPosition(challenger.session.token, {"mapId": "village", "cellX": 10, "cellY": 10, "facing": "east", "moving": false});
  service.updatePlayerPosition(opponent.session.token, {"mapId": "village", "cellX": 11, "cellY": 10, "facing": "west", "moving": false});

  const invite = service.inviteToBattle(challenger.session.token, {"username": "raceb"});
  assert.equal(invite.ok, true);
  const accept = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);
  assert.equal(accept.room.battle.round, 1);

  const [firstResult, secondResult] = await Promise.all([
    Promise.resolve().then(() => service.submitBattleCommand(challenger.session.token, accept.room.roomId, {
      "round": 1,
      "actionId": "attack",
      "targetUsername": "raceb",
    })),
    Promise.resolve().then(() => service.submitBattleCommand(opponent.session.token, accept.room.roomId, {
      "round": 1,
      "actionId": "defend",
    })),
  ]);
  assert.equal(firstResult.ok, true);
  assert.equal(secondResult.ok, true);
  const resolvedTurns = [firstResult.turn, secondResult.turn].filter(Boolean);
  assert.equal(resolvedTurns.length, 1);
  assert.equal(resolvedTurns[0].round, 1);
  assert.equal(events.filter((event) => event.type === "battle.turn_resolved" && event.roomId === accept.room.roomId).length, 1);
  const currentState = service.getBattleState(challenger.session.token);
  assert.equal(currentState.ok, true);
  assert.equal(currentState.room.battle.round, 2);
  assert.deepEqual(currentState.room.battle.submittedAccountIds, []);
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

test("party pve encounters create one shared server room and wait for all players", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const leader = service.register({"username": "pveleader", "password": "test1234", "displayName": "队长号"});
  const member = service.register({"username": "pvemember", "password": "test1234", "displayName": "队员号"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);

  const leaderProfile = battleProfile("队长号", {"level": 20, "hp": 180, "maxHp": 180, "attack": 30, "defense": 12, "quick": 78}, {
    "petId": "leader_battle_pet",
    "name": "队长布伊",
    "level": 16,
    "hp": 120,
    "maxHp": 120,
    "attack": 24,
    "defense": 10,
    "quick": 70,
  });
  leaderProfile.trainingPartners = [{
    "partnerId": "leader_partner_1",
    "name": "队长伙伴",
    "level": 12,
    "hp": 130,
    "maxHp": 130,
    "attack": 23,
    "defense": 9,
    "quick": 65,
    "pet": {
      "petId": "leader_partner_pet_1",
      "name": "伙伴布伊",
      "formId": "bui_normal_red_fire10",
      "level": 12,
      "hp": 100,
      "maxHp": 100,
      "attack": 18,
      "defense": 8,
      "quick": 62,
      "activeSkillIds": ["pet_attack", "pet_defend"],
      "petSkillSlots": ["pet_attack", "pet_defend", "", "", "", "", ""],
    },
  }];
  const memberProfile = battleProfileWithPets("队员号", {"level": 19, "hp": 170, "maxHp": 170, "attack": 28, "defense": 11, "quick": 76}, [
    {
      "petId": "member_battle_pet",
      "name": "队员布伊",
      "state": "battle",
      "level": 15,
      "hp": 116,
      "maxHp": 116,
      "attack": 23,
      "defense": 10,
      "quick": 69,
    },
    {
      "petId": "member_ride_pet",
      "name": "队员骑宠",
      "formId": "bui_normal_yellow_wind10",
      "state": "riding",
      "level": 18,
      "hp": 160,
      "maxHp": 160,
      "attack": 10,
      "defense": 10,
      "quick": 80,
    },
  ]);
  memberProfile.ridePetInstanceId = "member_ride_pet";
  assert.equal(service.saveProfile(leader.session.token, {"expectedRevision": 0, "profile": leaderProfile}).ok, true);
  assert.equal(service.saveProfile(member.session.token, {"expectedRevision": 0, "profile": memberProfile}).ok, true);

  service.updatePlayerPosition(leader.session.token, {"mapId": "firebud_training_yard", "cellX": 12, "cellY": 12, "facing": "east", "moving": false});
  service.updatePlayerPosition(member.session.token, {"mapId": "firebud_training_yard", "cellX": 12, "cellY": 12, "facing": "east", "moving": false});
  const invite = service.inviteToParty(leader.session.token, {"username": "pvemember"});
  assert.equal(invite.ok, true);
  const accept = service.acceptPartyInvite(member.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);

  const encounter = service.startPartyEncounter(leader.session.token, {
    "enemyCount": 10,
    "encounterZone": {
      "id": "test_grass",
      "name": "测试草丛",
      "formationTemplate": "10v10",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "满血乌力",
        "level": 8,
        "battleStats": {
          "maxHp": 240,
          "attack": 14,
          "defense": 8,
          "quick": 48,
        },
      },
    },
  });
  assert.equal(encounter.ok, true);
  assert.equal(encounter.room.mode, "party_pve");
  assert.equal(encounter.room.participantAccountIds.length, 2);
  const memberState = service.getBattleState(member.session.token);
  assert.equal(memberState.ok, true);
  assert.equal(memberState.room.roomId, encounter.room.roomId);

  const actors = encounter.room.battle.actors;
  const enemies = actors.filter((actor) => actor.side === "enemy");
  assert.equal(enemies.length, 10);
  assert.equal(enemies.every((actor) => actor.kind === "wild_pet" && actor.hp === actor.maxHp), true);
  const memberPlayer = actors.find((actor) => actor.username === "pvemember" && actor.kind === "player");
  assert.equal(memberPlayer.ridePetInstanceId, "member_ride_pet");
  assert.equal(memberPlayer.ridePetHp, 160);
  assert.equal(actors.some((actor) => actor.displayName === "队长伙伴"), true);
  assert.equal(encounter.room.battle.requiredActorIds.length, 4);

  const leaderPlayer = actors.find((actor) => actor.username === "pveleader" && actor.kind === "player");
  const leaderPet = actors.find((actor) => actor.username === "pveleader" && actor.kind === "pet");
  const memberPet = actors.find((actor) => actor.username === "pvemember" && actor.kind === "pet");
  const firstEnemy = enemies[0];
  assert.equal(Boolean(leaderPlayer && leaderPet && memberPlayer && memberPet && firstEnemy), true);
  assert.equal(service.submitBattleCommand(leader.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": leaderPlayer.actorId,
    "actionId": "attack",
    "targetActorId": firstEnemy.actorId,
  }).turn, null);
  assert.equal(service.submitBattleCommand(leader.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": leaderPet.actorId,
    "actionId": "pet_attack",
    "targetActorId": firstEnemy.actorId,
  }).turn, null);
  assert.equal(service.submitBattleCommand(member.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": memberPlayer.actorId,
    "actionId": "defend",
  }).turn, null);
  const resolved = service.submitBattleCommand(member.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": memberPet.actorId,
    "actionId": "pet_defend",
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.turn.kind, "battle_event_list");
  assert.equal(resolved.turn.events.some((event) => event.actorId.startsWith("party_pve_enemy_")), true);
  assert.equal(resolved.room.battle.round, 2);
});

test("party pve training partners heal their low hp partner pair before attacking", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const solo = service.register({"username": "pvehealpartner", "password": "test1234", "displayName": "陪练治疗号"});
  assert.equal(solo.ok, true);

  const profile = battleProfile("陪练治疗号", {"level": 20, "hp": 180, "maxHp": 180, "attack": 22, "defense": 12, "quick": 80}, {
    "petId": "heal_owner_pet",
    "name": "治疗号布伊",
    "level": 16,
    "hp": 120,
    "maxHp": 120,
    "attack": 18,
    "defense": 10,
    "quick": 70,
  });
  profile.trainingPartners = [{
    "partnerId": "heal_partner_1",
    "name": "低血伙伴",
    "level": 12,
    "hp": 39,
    "maxHp": 100,
    "attack": 16,
    "defense": 8,
    "quick": 130,
    "pet": {
      "petId": "heal_partner_pet_1",
      "name": "满血伙伴宠",
      "level": 12,
      "hp": 90,
      "maxHp": 100,
      "attack": 16,
      "defense": 8,
      "quick": 60,
      "activeSkillIds": ["pet_attack", "pet_defend"],
      "petSkillSlots": ["pet_attack", "pet_defend", "", "", "", "", ""],
    },
  }, {
    "partnerId": "heal_partner_2",
    "name": "护宠伙伴",
    "level": 12,
    "hp": 90,
    "maxHp": 100,
    "attack": 16,
    "defense": 8,
    "quick": 128,
    "pet": {
      "petId": "heal_partner_pet_2",
      "name": "低血伙伴宠",
      "level": 12,
      "hp": 47,
      "maxHp": 120,
      "attack": 16,
      "defense": 8,
      "quick": 58,
      "activeSkillIds": ["pet_attack", "pet_defend"],
      "petSkillSlots": ["pet_attack", "pet_defend", "", "", "", "", ""],
    },
  }];
  assert.equal(service.saveProfile(solo.session.token, {"expectedRevision": 0, "profile": profile}).ok, true);
  assert.equal(service.updatePlayerPosition(solo.session.token, {
    "mapId": "firebud_training_yard",
    "cellX": 12,
    "cellY": 12,
    "facing": "east",
    "moving": false,
  }).ok, true);

  const encounter = service.startPartyEncounter(solo.session.token, {
    "enemyCount": 1,
    "encounterZone": {
      "id": "partner_heal_grass",
      "name": "陪练治疗草丛",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "耐打乌力",
        "level": 12,
        "battleStats": {"maxHp": 500, "attack": 1, "defense": 5, "quick": 10},
      },
    },
  });
  assert.equal(encounter.ok, true);
  const actors = encounter.room.battle.actors;
  const soloPlayer = actors.find((actor) => actor.username === "pvehealpartner" && actor.kind === "player");
  const soloPet = actors.find((actor) => actor.username === "pvehealpartner" && actor.kind === "pet");
  const lowPartner = actors.find((actor) => actor.displayName === "低血伙伴" && actor.kind === "player");
  const petGuardPartner = actors.find((actor) => actor.displayName === "护宠伙伴" && actor.kind === "player");
  const lowPartnerPet = actors.find((actor) => actor.displayName === "低血伙伴宠" && actor.kind === "pet");
  assert.equal(Boolean(soloPlayer && soloPet && lowPartner && petGuardPartner && lowPartnerPet), true);

  assert.equal(service.submitBattleCommand(solo.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": soloPlayer.actorId,
    "actionId": "defend",
  }).turn, null);
  const resolved = service.submitBattleCommand(solo.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": soloPet.actorId,
    "actionId": "pet_defend",
  });
  assert.equal(resolved.ok, true);

  const healEvents = resolved.turn.events.filter((event) => event.eventType === "spirit_heal" && event.actionKind === "training_partner_heal");
  assert.equal(healEvents.length, 2);
  const selfHeal = healEvents.find((event) => event.actorId === lowPartner.actorId && event.targetActorId === lowPartner.actorId);
  assert.equal(Boolean(selfHeal), true);
  assert.equal(selfHeal.spiritId, "spirit_moist_1");
  assert.equal(selfHeal.hpBefore, 39);
  assert.equal(selfHeal.heal, 25);
  assert.equal(selfHeal.healed, 25);
  assert.equal(selfHeal.hpAfter, 64);

  const petHeal = healEvents.find((event) => event.actorId === petGuardPartner.actorId && event.targetActorId === lowPartnerPet.actorId);
  assert.equal(Boolean(petHeal), true);
  assert.equal(petHeal.hpBefore, 47);
  assert.equal(petHeal.heal, 30);
  assert.equal(petHeal.healed, 30);
  assert.equal(petHeal.hpAfter, 77);

  const updatedLowPartner = resolved.room.battle.actors.find((actor) => actor.actorId === lowPartner.actorId);
  const updatedLowPartnerPet = resolved.room.battle.actors.find((actor) => actor.actorId === lowPartnerPet.actorId);
  assert.equal(updatedLowPartner.hp, 64);
  assert.equal(updatedLowPartnerPet.hp, 77);
  assert.equal(resolved.turn.events.some((event) => event.actorId === lowPartner.actorId && event.eventType === "basic_attack"), false);
  assert.equal(resolved.turn.events.some((event) => event.actorId === petGuardPartner.actorId && event.eventType === "basic_attack"), false);
});

test("party pve encounters skip offline party members", () => {
  let nowMs = Date.parse("2026-02-03T00:00:00.000Z");
  const service = createAuthService({"store": createMemoryAuthStore(), "now": () => nowMs});
  const leader = service.register({"username": "pveofflinea", "password": "test1234", "displayName": "在线队长"});
  const member = service.register({"username": "pveofflineb", "password": "test1234", "displayName": "离线队员"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  const leaderProfile = battleProfile("在线队长", {"level": 12, "hp": 150, "maxHp": 150, "attack": 28, "defense": 10, "quick": 75}, {
      "petId": "offline_leader_pet",
      "name": "队长布伊",
      "level": 10,
      "hp": 100,
      "maxHp": 100,
      "attack": 20,
      "defense": 8,
      "quick": 65,
    });
  leaderProfile.trainingPartners = [{
    "partnerId": "offline_leader_partner_1",
    "name": "离线替补伙伴",
    "level": 9,
    "hp": 120,
    "maxHp": 120,
    "attack": 20,
    "defense": 8,
    "quick": 60,
    "pet": {
      "petId": "offline_leader_partner_pet_1",
      "name": "替补伙伴布伊",
      "formId": "bui_normal_yellow_wind10",
      "level": 9,
      "hp": 90,
      "maxHp": 90,
      "attack": 16,
      "defense": 7,
      "quick": 58,
      "activeSkillIds": ["pet_attack", "pet_defend"],
      "petSkillSlots": ["pet_attack", "pet_defend", "", "", "", "", ""],
    },
  }];
  assert.equal(service.saveProfile(leader.session.token, {
    "expectedRevision": 0,
    "profile": leaderProfile,
  }).ok, true);
  assert.equal(service.saveProfile(member.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("离线队员", {"level": 12, "hp": 150, "maxHp": 150, "attack": 28, "defense": 10, "quick": 75}, {
      "petId": "offline_member_pet",
      "name": "队员布伊",
      "level": 10,
      "hp": 100,
      "maxHp": 100,
      "attack": 20,
      "defense": 8,
      "quick": 65,
    }),
  }).ok, true);
  assert.equal(service.updatePlayerPosition(leader.session.token, {"mapId": "firebud_training_yard", "cellX": 12, "cellY": 12, "facing": "east", "moving": false}).ok, true);
  assert.equal(service.updatePlayerPosition(member.session.token, {"mapId": "firebud_training_yard", "cellX": 12, "cellY": 12, "facing": "east", "moving": false}).ok, true);
  const invite = service.inviteToParty(leader.session.token, {"username": "pveofflineb"});
  assert.equal(invite.ok, true);
  const accept = service.acceptPartyInvite(member.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);

  nowMs += 30 * 1000;
  const encounter = service.startPartyEncounter(leader.session.token, {
    "enemyCount": 1,
    "encounterZone": {
      "id": "offline_skip_grass",
      "name": "离线过滤草丛",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "过滤乌力",
        "level": 3,
        "battleStats": {"maxHp": 80, "attack": 10, "defense": 5, "quick": 40},
      },
    },
  });
  assert.equal(encounter.ok, true);
  assert.equal(encounter.message, "队伍遭遇了野生宠物，离线队员未参战。");
  assert.deepEqual(encounter.room.participantAccountIds, [leader.account.accountId]);
  assert.deepEqual(encounter.room.participants.map((player) => player.username), ["pveofflinea"]);
  assert.deepEqual(encounter.room.battle.requiredAccountIds, [leader.account.accountId]);
  assert.equal(encounter.room.battle.actors.some((actor) => actor.username === "pveofflineb"), false);
  assert.equal(encounter.room.battle.actors.some((actor) => actor.displayName === "离线替补伙伴"), true);
  assert.equal(encounter.room.battle.actors.some((actor) => actor.displayName === "替补伙伴布伊"), true);
  const partyState = service.getPartyState(leader.session.token);
  assert.equal(partyState.ok, true);
  assert.equal(partyState.party.memberCount, 2);
  const offlineMember = partyState.party.members.find((player) => player.username === "pveofflineb");
  assert.equal(offlineMember.online, false);
  assert.equal(offlineMember.connectionState, "offline");
});

test("party pve waiting battle removes offline non-leader members and resolves remaining commands", () => {
  let nowMs = Date.parse("2026-02-03T01:00:00.000Z");
  const service = createAuthService({"store": createMemoryAuthStore(), "now": () => nowMs});
  const events = [];
  service.onEvent((event) => events.push(event));
  const leader = service.register({"username": "pvewaitdropa", "password": "test1234", "displayName": "等待队长"});
  const member = service.register({"username": "pvewaitdropb", "password": "test1234", "displayName": "等待队员"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  assert.equal(service.saveProfile(leader.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("等待队长", {"level": 12, "hp": 150, "maxHp": 150, "attack": 28, "defense": 10, "quick": 75}, {
      "petId": "wait_drop_leader_pet",
      "name": "队长布伊",
      "level": 10,
      "hp": 100,
      "maxHp": 100,
      "attack": 20,
      "defense": 8,
      "quick": 65,
    }),
  }).ok, true);
  assert.equal(service.saveProfile(member.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("等待队员", {"level": 12, "hp": 150, "maxHp": 150, "attack": 28, "defense": 10, "quick": 72}, {
      "petId": "wait_drop_member_pet",
      "name": "队员布伊",
      "level": 10,
      "hp": 100,
      "maxHp": 100,
      "attack": 20,
      "defense": 8,
      "quick": 64,
    }),
  }).ok, true);
  assert.equal(service.updatePlayerPosition(leader.session.token, {"mapId": "firebud_training_yard", "cellX": 12, "cellY": 12, "facing": "east", "moving": false}).ok, true);
  assert.equal(service.updatePlayerPosition(member.session.token, {"mapId": "firebud_training_yard", "cellX": 12, "cellY": 12, "facing": "east", "moving": false}).ok, true);
  const invite = service.inviteToParty(leader.session.token, {"username": "pvewaitdropb"});
  assert.equal(invite.ok, true);
  const accept = service.acceptPartyInvite(member.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);
  const encounter = service.startPartyEncounter(leader.session.token, {
    "enemyCount": 1,
    "encounterZone": {
      "id": "wait_drop_grass",
      "name": "等待掉线草丛",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "等待乌力",
        "level": 3,
        "battleStats": {"maxHp": 500, "attack": 1, "defense": 5, "quick": 40},
      },
    },
  });
  assert.equal(encounter.ok, true);
  const actors = encounter.room.battle.actors;
  const leaderPlayer = actors.find((actor) => actor.username === "pvewaitdropa" && actor.kind === "player");
  const leaderPet = actors.find((actor) => actor.username === "pvewaitdropa" && actor.kind === "pet");
  const memberPlayer = actors.find((actor) => actor.username === "pvewaitdropb" && actor.kind === "player");
  const memberPet = actors.find((actor) => actor.username === "pvewaitdropb" && actor.kind === "pet");
  const enemy = actors.find((actor) => actor.side === "enemy");
  assert.equal(Boolean(leaderPlayer && leaderPet && memberPlayer && memberPet && enemy), true);
  assert.equal(encounter.room.battle.requiredActorIds.length, 4);
  assert.equal(service.submitBattleCommand(leader.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": leaderPlayer.actorId,
    "actionId": "attack",
    "targetActorId": enemy.actorId,
  }).turn, null);
  assert.equal(service.submitBattleCommand(leader.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": leaderPet.actorId,
    "actionId": "pet_attack",
    "targetActorId": enemy.actorId,
  }).turn, null);

  const disconnected = service.markBattleConnection(member.session.token, false);
  assert.equal(disconnected.ok, true);
  nowMs += 20 * 1000;
  assert.equal(service.getSession(member.session.token).ok, true);
  nowMs += 9 * 1000;
  const beforeGraceState = service.getBattleState(leader.session.token);
  assert.equal(beforeGraceState.ok, true);
  assert.deepEqual(beforeGraceState.room.participantAccountIds.sort(), [leader.account.accountId, member.account.accountId].sort());
  assert.equal(beforeGraceState.room.battle.round, 1);
  nowMs += 1 * 1000;
  const state = service.getBattleState(leader.session.token);
  assert.equal(state.ok, true);
  assert.deepEqual(state.room.participantAccountIds, [leader.account.accountId]);
  assert.deepEqual(state.room.battle.requiredAccountIds, [leader.account.accountId]);
  assert.equal(state.room.battle.actors.some((actor) => actor.username === "pvewaitdropb"), false);
  assert.equal(state.room.battle.round, 2);
  assert.equal(state.room.battle.lastEventList.kind, "battle_event_list");
  assert.deepEqual(state.room.battle.submittedActorIds, []);
  const partyState = service.getPartyState(leader.session.token);
  assert.equal(partyState.ok, true);
  assert.deepEqual(partyState.party.members.map((player) => player.username), ["pvewaitdropa"]);
  const memberPartyState = service.getPartyState(member.session.token);
  assert.equal(memberPartyState.ok, true);
  assert.equal(memberPartyState.party, null);
  const roomUpdate = events.find((event) => event.type === "battle.room_updated" && event.reason === "party_member_offline");
  assert.equal(Boolean(roomUpdate), true);
  assert.deepEqual(roomUpdate.removedAccountIds, [member.account.accountId]);
  assert.equal(roomUpdate.escapedActorIds.includes(memberPlayer.actorId), true);
  assert.equal(roomUpdate.escapedActorIds.includes(memberPet.actorId), true);
  assert.equal(roomUpdate.turn.kind, "battle_event_list");
  assert.equal(events.some((event) => (
    event.type === "party.update" &&
    Array.isArray(event.removedAccountIds) &&
    event.removedAccountIds.includes(member.account.accountId)
  )), true);
});

test("party pve waiting battle removes offline leader with owned partner actors", () => {
  let nowMs = Date.parse("2026-02-03T01:15:00.000Z");
  const service = createAuthService({"store": createMemoryAuthStore(), "now": () => nowMs});
  const events = [];
  service.onEvent((event) => events.push(event));
  const leader = service.register({"username": "pveleaderdropa", "password": "test1234", "displayName": "掉线队长"});
  const member = service.register({"username": "pveleaderdropb", "password": "test1234", "displayName": "在线队员"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  const leaderProfile = battleProfile("掉线队长", {"level": 12, "hp": 150, "maxHp": 150, "attack": 28, "defense": 10, "quick": 75}, {
    "petId": "leader_drop_pet",
    "name": "队长掉线布伊",
    "level": 10,
    "hp": 100,
    "maxHp": 100,
    "attack": 20,
    "defense": 8,
    "quick": 65,
  });
  leaderProfile.trainingPartners = [{
    "partnerId": "leader_drop_partner",
    "name": "队长掉线伙伴",
    "level": 9,
    "hp": 120,
    "maxHp": 120,
    "attack": 20,
    "defense": 8,
    "quick": 60,
    "pet": {
      "petId": "leader_drop_partner_pet",
      "name": "队长伙伴布伊",
      "formId": "bui_normal_yellow_wind10",
      "level": 9,
      "hp": 90,
      "maxHp": 90,
      "attack": 16,
      "defense": 7,
      "quick": 58,
      "activeSkillIds": ["pet_attack", "pet_defend"],
      "petSkillSlots": ["pet_attack", "pet_defend", "", "", "", "", ""],
    },
  }];
  assert.equal(service.saveProfile(leader.session.token, {
    "expectedRevision": 0,
    "profile": leaderProfile,
  }).ok, true);
  assert.equal(service.saveProfile(member.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("在线队员", {"level": 12, "hp": 150, "maxHp": 150, "attack": 28, "defense": 10, "quick": 72}, {
      "petId": "member_after_leader_drop_pet",
      "name": "队员布伊",
      "level": 10,
      "hp": 100,
      "maxHp": 100,
      "attack": 20,
      "defense": 8,
      "quick": 64,
    }),
  }).ok, true);
  assert.equal(service.updatePlayerPosition(leader.session.token, {"mapId": "firebud_training_yard", "cellX": 12, "cellY": 12, "facing": "east", "moving": false}).ok, true);
  assert.equal(service.updatePlayerPosition(member.session.token, {"mapId": "firebud_training_yard", "cellX": 12, "cellY": 12, "facing": "east", "moving": false}).ok, true);
  const invite = service.inviteToParty(leader.session.token, {"username": "pveleaderdropb"});
  assert.equal(invite.ok, true);
  assert.equal(service.acceptPartyInvite(member.session.token, invite.invite.inviteId).ok, true);
  const encounter = service.startPartyEncounter(leader.session.token, {
    "enemyCount": 1,
    "encounterZone": {
      "id": "leader_drop_grass",
      "name": "队长掉线草丛",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "队长掉线乌力",
        "level": 3,
        "battleStats": {"maxHp": 500, "attack": 1, "defense": 5, "quick": 40},
      },
    },
  });
  assert.equal(encounter.ok, true);
  const actors = encounter.room.battle.actors;
  const leaderPlayer = actors.find((actor) => actor.username === "pveleaderdropa" && actor.kind === "player");
  const leaderPet = actors.find((actor) => actor.username === "pveleaderdropa" && actor.kind === "pet");
  const leaderPartner = actors.find((actor) => actor.displayName === "队长掉线伙伴");
  const leaderPartnerPet = actors.find((actor) => actor.displayName === "队长伙伴布伊");
  const memberPlayer = actors.find((actor) => actor.username === "pveleaderdropb" && actor.kind === "player");
  const memberPet = actors.find((actor) => actor.username === "pveleaderdropb" && actor.kind === "pet");
  const enemy = actors.find((actor) => actor.side === "enemy");
  assert.equal(Boolean(leaderPlayer && leaderPet && leaderPartner && leaderPartnerPet && memberPlayer && memberPet && enemy), true);
  assert.equal(service.submitBattleCommand(member.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": memberPlayer.actorId,
    "actionId": "attack",
    "targetActorId": enemy.actorId,
  }).turn, null);
  assert.equal(service.submitBattleCommand(member.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": memberPet.actorId,
    "actionId": "pet_attack",
    "targetActorId": enemy.actorId,
  }).turn, null);

  assert.equal(service.markBattleConnection(leader.session.token, false).ok, true);
  nowMs += 20 * 1000;
  assert.equal(service.getSession(leader.session.token).ok, true);
  nowMs += 9 * 1000;
  const beforeGraceState = service.getBattleState(member.session.token);
  assert.equal(beforeGraceState.ok, true);
  assert.deepEqual(beforeGraceState.room.participantAccountIds.sort(), [leader.account.accountId, member.account.accountId].sort());
  assert.equal(beforeGraceState.room.battle.round, 1);
  nowMs += 1 * 1000;
  const state = service.getBattleState(member.session.token);
  assert.equal(state.ok, true);
  assert.deepEqual(state.room.participantAccountIds, [member.account.accountId]);
  assert.deepEqual(state.room.battle.requiredAccountIds, [member.account.accountId]);
  assert.equal(state.room.battle.actors.some((actor) => actor.username === "pveleaderdropa"), false);
  assert.equal(state.room.battle.actors.some((actor) => actor.displayName === "队长掉线伙伴"), false);
  assert.equal(state.room.battle.actors.some((actor) => actor.displayName === "队长伙伴布伊"), false);
  assert.equal(state.room.battle.round, 2);
  assert.equal(state.room.battle.lastEventList.kind, "battle_event_list");
  assert.deepEqual(state.room.battle.submittedActorIds, []);
  const partyState = service.getPartyState(member.session.token);
  assert.equal(partyState.ok, true);
  assert.equal(partyState.party.leaderAccountId, member.account.accountId);
  assert.deepEqual(partyState.party.members.map((player) => player.username), ["pveleaderdropb"]);
  const leaderPartyState = service.getPartyState(leader.session.token);
  assert.equal(leaderPartyState.ok, true);
  assert.equal(leaderPartyState.party, null);
  const roomUpdate = events.find((event) => event.type === "battle.room_updated" && event.reason === "party_member_offline");
  assert.equal(Boolean(roomUpdate), true);
  assert.deepEqual(roomUpdate.removedAccountIds, [leader.account.accountId]);
  for (const actor of [leaderPlayer, leaderPet, leaderPartner, leaderPartnerPet]) {
    assert.equal(roomUpdate.escapedActorIds.includes(actor.actorId), true);
  }
  assert.equal(roomUpdate.turn.kind, "battle_event_list");
});

test("party pve battle maintenance removes disconnected members after offline grace", () => {
  let nowMs = Date.parse("2026-02-03T01:30:00.000Z");
  const service = createAuthService({"store": createMemoryAuthStore(), "now": () => nowMs});
  const leader = service.register({"username": "pvemaintdropa", "password": "test1234", "displayName": "维护队长"});
  const member = service.register({"username": "pvemaintdropb", "password": "test1234", "displayName": "维护队员"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  assert.equal(service.saveProfile(leader.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("维护队长", {"level": 12, "hp": 150, "maxHp": 150, "attack": 28, "defense": 10, "quick": 75}, {
      "petId": "maint_drop_leader_pet",
      "name": "队长布伊",
      "level": 10,
      "hp": 100,
      "maxHp": 100,
      "attack": 20,
      "defense": 8,
      "quick": 65,
    }),
  }).ok, true);
  assert.equal(service.saveProfile(member.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("维护队员", {"level": 12, "hp": 150, "maxHp": 150, "attack": 28, "defense": 10, "quick": 72}, {
      "petId": "maint_drop_member_pet",
      "name": "队员布伊",
      "level": 10,
      "hp": 100,
      "maxHp": 100,
      "attack": 20,
      "defense": 8,
      "quick": 64,
    }),
  }).ok, true);
  assert.equal(service.updatePlayerPosition(leader.session.token, {"mapId": "firebud_training_yard", "cellX": 12, "cellY": 12, "facing": "east", "moving": false}).ok, true);
  assert.equal(service.updatePlayerPosition(member.session.token, {"mapId": "firebud_training_yard", "cellX": 12, "cellY": 12, "facing": "east", "moving": false}).ok, true);
  const invite = service.inviteToParty(leader.session.token, {"username": "pvemaintdropb"});
  assert.equal(invite.ok, true);
  assert.equal(service.acceptPartyInvite(member.session.token, invite.invite.inviteId).ok, true);
  const encounter = service.startPartyEncounter(leader.session.token, {
    "enemyCount": 1,
    "encounterZone": {
      "id": "maint_drop_grass",
      "name": "维护掉线草丛",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "维护乌力",
        "level": 3,
        "battleStats": {"maxHp": 500, "attack": 1, "defense": 5, "quick": 40},
      },
    },
  });
  assert.equal(encounter.ok, true);
  const roomId = encounter.room.roomId;
  assert.equal(service.markBattleConnection(member.session.token, false).ok, true);
  nowMs += 20 * 1000;
  assert.equal(service.getSession(leader.session.token).ok, true);
  assert.equal(service.getSession(member.session.token).ok, true);
  nowMs += 9 * 1000;
  const earlyMaintenance = service.runBattleMaintenance();
  assert.equal(earlyMaintenance.ok, true);
  assert.equal(earlyMaintenance.events.some((event) => event.type === "battle.room_updated"), false);
  assert.deepEqual(service.snapshot().battleRooms[roomId].participantAccountIds.sort(), [leader.account.accountId, member.account.accountId].sort());
  nowMs += 1 * 1000;
  const maintenance = service.runBattleMaintenance();
  assert.equal(maintenance.ok, true);
  const roomUpdate = maintenance.events.find((event) => event.type === "battle.room_updated" && event.reason === "party_member_offline");
  assert.equal(Boolean(roomUpdate), true);
  assert.deepEqual(roomUpdate.removedAccountIds, [member.account.accountId]);
  assert.equal(service.snapshot().battleRooms[roomId].status, "ready");
  assert.deepEqual(service.snapshot().battleRooms[roomId].participantAccountIds, [leader.account.accountId]);
  assert.equal(service.getPartyState(member.session.token).party, null);
});

test("party pve encounters support a solo server account without local battle fallback", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const solo = service.register({"username": "solopve", "password": "test1234", "displayName": "单人练级号"});
  assert.equal(solo.ok, true);

  const profile = battleProfile("单人练级号", {"level": 6, "hp": 128, "maxHp": 128, "attack": 24, "defense": 8, "quick": 72}, {
    "petId": "solo_battle_pet",
    "name": "单人布伊",
    "level": 5,
    "hp": 96,
    "maxHp": 96,
    "attack": 18,
    "defense": 7,
    "quick": 64,
  });
  assert.equal(service.saveProfile(solo.session.token, {"expectedRevision": 0, "profile": profile}).ok, true);
  assert.equal(service.updatePlayerPosition(solo.session.token, {
    "mapId": "firebud_village_gate",
    "cellX": 15,
    "cellY": 17,
    "facing": "south",
    "moving": false,
  }).ok, true);

  const encounter = service.startPartyEncounter(solo.session.token, {
    "enemyCount": 1,
    "encounterZone": {
      "id": "solo_grass",
      "name": "单人草丛",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "单人乌力",
        "level": 3,
        "battleStats": {"maxHp": 80, "attack": 10, "defense": 5, "quick": 40},
      },
    },
  });
  assert.equal(encounter.ok, true);
  assert.equal(encounter.room.mode, "party_pve");
  assert.equal(encounter.room.partyId, "");
  assert.deepEqual(encounter.room.participantAccountIds, [solo.account.accountId]);
  assert.equal(encounter.message, "遭遇了野生宠物。");
  const storedRoom = service.snapshot().battleRooms[encounter.room.roomId];
  assert.equal(storedRoom.leaderAccountId, solo.account.accountId);

  const actors = encounter.room.battle.actors;
  assert.equal(actors.some((actor) => actor.accountId === solo.account.accountId && actor.kind === "player"), true);
  assert.equal(actors.some((actor) => actor.accountId === solo.account.accountId && actor.kind === "pet"), true);
  assert.equal(actors.filter((actor) => actor.side === "enemy").length, 1);
  assert.deepEqual(encounter.room.battle.requiredAccountIds, [solo.account.accountId]);

  const restored = service.getBattleState(solo.session.token);
  assert.equal(restored.ok, true);
  assert.equal(restored.room.roomId, encounter.room.roomId);
});

test("party pve encounter fallback count uses server profile instead of local client partners", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const solo = service.register({"username": "solostaleclient", "password": "test1234", "displayName": "单人服务器档案"});
  assert.equal(solo.ok, true);

  const profile = battleProfile("单人服务器档案", {"level": 6, "hp": 128, "maxHp": 128, "attack": 24, "defense": 8, "quick": 72}, {
    "petId": "solo_stale_pet",
    "name": "服务器布伊",
    "level": 5,
    "hp": 96,
    "maxHp": 96,
    "attack": 18,
    "defense": 7,
    "quick": 64,
  });
  assert.equal(service.saveProfile(solo.session.token, {"expectedRevision": 0, "profile": profile}).ok, true);

  const encounter = service.startPartyEncounter(solo.session.token, {
    "enemyCount": 10,
    "encounterZone": {
      "id": "solo_stale_local_partner_grass",
      "name": "本地伙伴误算草丛",
      "selectedEnemyCount": 10,
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "误算乌力",
        "level": 3,
        "battleStats": {"maxHp": 80, "attack": 10, "defense": 5, "quick": 40},
      },
      "selectedWildPets": [{
        "formId": "wuli_normal_orange_fire10",
        "name": "误算乌力",
        "level": 3,
        "battleStats": {"maxHp": 80, "attack": 10, "defense": 5, "quick": 40},
      }],
    },
  });

  assert.equal(encounter.ok, true);
  const storedRoom = service.snapshot().battleRooms[encounter.room.roomId];
  assert.equal(storedRoom.encounter.enemyCount, 1);
  assert.equal(storedRoom.encounter.formationTemplate, "");
  assert.equal(encounter.room.battle.actors.filter((actor) => actor.side === "enemy").length, 1);
});

test("party pve guardian encounters preserve fixed enemies and source metadata", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const solo = service.register({"username": "guardianpve", "password": "test1234", "displayName": "守护挑战号"});
  assert.equal(solo.ok, true);

  const profile = battleProfile("守护挑战号", {"level": 80, "hp": 520, "maxHp": 520, "attack": 80, "defense": 45, "quick": 120}, {
    "petId": "guardian_pet",
    "name": "守护布伊",
    "level": 80,
    "hp": 420,
    "maxHp": 420,
    "attack": 75,
    "defense": 40,
    "quick": 110,
  });
  assert.equal(service.saveProfile(solo.session.token, {"expectedRevision": 0, "profile": profile}).ok, true);

  const fixedWildPets = Array.from({"length": 10}, (_value, index) => ({
    "formId": index === 2 ? "bui_normal_thick_earth10" : "wuli_normal_tough_earth10",
    "name": index === 2 ? "固定主守护" : "固定守护",
    "level": 98 + index,
    "catchable": false,
    "battleStats": {
      "maxHp": index === 2 ? 1680 : 1000 + index * 10,
      "attack": index === 2 ? 192 : 130 + index,
      "defense": index === 2 ? 138 : 90 + index,
      "agility": index === 2 ? 92 : 70 + index,
    },
    ...(index === 2 ? {"activeSkillIds": ["pet_attack", "pet_stone_gaze"]} : {}),
  }));
  const encounter = service.startPartyEncounter(solo.session.token, {
    "encounterZone": {
      "id": "earth_vein_guardian_floor",
      "name": "岩脉守护层",
      "encounterGroupId": "earth_vein_guardian_group",
      "sourceInteractionId": "earth_vein_guardian_npc",
      "sourceInteractionName": "岩脉守护兽",
      "formationTemplate": "10v10",
      "fixedWildPets": fixedWildPets,
    },
  });

  assert.equal(encounter.ok, true);
  assert.equal(encounter.room.mode, "party_pve");
  const storedRoom = service.snapshot().battleRooms[encounter.room.roomId];
  assert.equal(storedRoom.encounter.groupId, "earth_vein_guardian_group");
  assert.equal(storedRoom.encounter.sourceInteractionId, "earth_vein_guardian_npc");
  assert.equal(storedRoom.encounter.sourceInteractionName, "岩脉守护兽");
  assert.equal(storedRoom.encounter.enemyCount, 10);
  assert.equal(storedRoom.encounter.selectedWildPets.length, 10);
  const enemies = encounter.room.battle.actors.filter((actor) => actor.side === "enemy");
  assert.equal(enemies.length, 10);
  assert.equal(enemies[2].formId, "bui_normal_thick_earth10");
  assert.equal(storedRoom.encounter.selectedWildPets[2].battleStats.maxHp, 1680);
  assert.equal(enemies[2].maxHp, 1688);
  assert.deepEqual(enemies[2].activeSkillIds, ["pet_attack", "pet_stone_gaze"]);
});

test("party pve guardian victories write server-side trial rewards", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const proofPlayer = service.register({"username": "guardianproof", "password": "test1234", "displayName": "证明挑战号"});
  assert.equal(proofPlayer.ok, true);
  const proofProfile = battleProfile("证明挑战号", {"level": 80, "hp": 520, "maxHp": 520, "attack": 999, "defense": 45, "quick": 120, "comboRateOverride": 0}, null);
  assert.equal(service.saveProfile(proofPlayer.session.token, {"expectedRevision": 0, "profile": proofProfile}).ok, true);
  const proofEncounter = service.startPartyEncounter(proofPlayer.session.token, {
    "enemyCount": 1,
    "encounterZone": {
      "id": "shadow_oath_rebirth_guardian_floor",
      "name": "玄影守护层",
      "encounterGroupId": "shadow_oath_rebirth_guardian",
      "sourceInteractionId": "shadow_oath_rebirth_guardian_npc",
      "selectedWildPet": {
        "formId": "rebirth_beast_fire_lv50",
        "name": "玄影转生兽",
        "level": 1,
        "catchable": false,
        "battleStats": {"maxHp": 1, "attack": 1, "defense": 1, "quick": 1},
      },
    },
  });
  assert.equal(proofEncounter.ok, true);
  const proofActor = proofEncounter.room.battle.actors.find((actor) => actor.accountId === proofPlayer.account.accountId && actor.kind === "player");
  const proofEnemy = proofEncounter.room.battle.actors.find((actor) => actor.side === "enemy");
  const proofResolved = service.submitBattleCommand(proofPlayer.session.token, proofEncounter.room.roomId, {
    "round": 1,
    "actorId": proofActor.actorId,
    "actionId": "attack",
    "targetActorId": proofEnemy.actorId,
  });
  assert.equal(proofResolved.ok, true);
  assert.equal(proofResolved.room.status, "closed");
  const proofWriteback = proofResolved.room.battle.profileWriteback.profiles.find((entry) => entry.accountId === proofPlayer.account.accountId);
  assert.equal(proofWriteback.special.rebirthTrialProofs.count, 1);
  const proofAfter = service.getProfile(proofPlayer.session.token);
  assert.equal(proofAfter.profile.rebirthTrialProofs.shadow_oath_rebirth_guardian, 1);

  const mmPlayer = service.register({"username": "guardianmm", "password": "test1234", "displayName": "MM挑战号"});
  assert.equal(mmPlayer.ok, true);
  const mmProfile = battleProfile("MM挑战号", {"level": 80, "hp": 520, "maxHp": 520, "attack": 999, "defense": 45, "quick": 120, "comboRateOverride": 0}, null);
  assert.equal(service.saveProfile(mmPlayer.session.token, {"expectedRevision": 0, "profile": mmProfile}).ok, true);
  const mmEncounter = service.startPartyEncounter(mmPlayer.session.token, {
    "enemyCount": 1,
    "encounterZone": {
      "id": "pet_rebirth_mm_trial_floor",
      "name": "1转MM试炼",
      "encounterGroupId": "pet_rebirth_mm_trial_1",
      "sourceInteractionId": "firebud_pet_mm_trial_mentor",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "MM试炼兽",
        "level": 1,
        "battleStats": {"maxHp": 1, "attack": 1, "defense": 1, "quick": 1},
      },
    },
  });
  assert.equal(mmEncounter.ok, true);
  const mmActor = mmEncounter.room.battle.actors.find((actor) => actor.accountId === mmPlayer.account.accountId && actor.kind === "player");
  const mmEnemy = mmEncounter.room.battle.actors.find((actor) => actor.side === "enemy");
  const mmResolved = service.submitBattleCommand(mmPlayer.session.token, mmEncounter.room.roomId, {
    "round": 1,
    "actorId": mmActor.actorId,
    "actionId": "attack",
    "targetActorId": mmEnemy.actorId,
  });
  assert.equal(mmResolved.ok, true);
  assert.equal(mmResolved.room.status, "closed");
  const mmWriteback = mmResolved.room.battle.profileWriteback.profiles.find((entry) => entry.accountId === mmPlayer.account.accountId);
  assert.equal(mmWriteback.special.petRebirthMm.stage, 1);
  const mmAfter = service.getProfile(mmPlayer.session.token);
  assert.equal(mmAfter.profile.petInstances.some((pet) => pet.formId === "pet_rebirth_mm_stage1"), true);
});

test("party pve escape closes room without win or loss result", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const solo = service.register({"username": "pveescapeone", "password": "test1234", "displayName": "逃跑玩家"});
  assert.equal(solo.ok, true);
  const profile = battleProfile("逃跑玩家", {
    "level": 5,
    "hp": 120,
    "maxHp": 120,
    "attack": 18,
    "defense": 8,
    "quick": 90,
  }, {
    "petId": "escape_pet",
    "name": "逃跑布伊",
    "level": 5,
    "hp": 90,
    "maxHp": 90,
    "attack": 15,
    "defense": 7,
    "quick": 70,
  });
  assert.equal(service.saveProfile(solo.session.token, {"expectedRevision": 0, "profile": profile}).ok, true);

  const encounter = service.startPartyEncounter(solo.session.token, {
    "enemyCount": 1,
    "encounterZone": {
      "id": "escape_grass",
      "name": "逃跑草丛",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "逃跑乌力",
        "level": 3,
        "expReward": 200,
        "battleStats": {"maxHp": 80, "attack": 10, "defense": 5, "quick": 40},
      },
      "rewards": {
        "stoneCoins": {"count": 99},
      },
    },
  });
  assert.equal(encounter.ok, true);
  const leave = service.leaveBattleRoom(solo.session.token, encounter.room.roomId);
  assert.equal(leave.ok, true);
  assert.equal(leave.message, "已逃离战斗。");
  assert.equal(leave.room.status, "closed");
  assert.equal(leave.result.reason, "escape");
  assert.equal(leave.result.winnerAccountId, "");
  assert.deepEqual(leave.result.loserAccountIds, []);
  assert.equal(leave.result.closedByAccountId, solo.account.accountId);

  const after = service.getProfile(solo.session.token);
  assert.equal(after.ok, true);
  assert.equal(after.profile.player.level, 5);
  assert.equal(after.profile.stoneCoins || 0, 0);
  assert.equal(after.profileSummary.profileRevision, 1);

  const snapshot = service.snapshot();
  const storedRoom = snapshot.battleRooms[encounter.room.roomId];
  assert.equal(storedRoom.battle.profileWriteback.profiles.length, 0);
  const record = snapshot.battleRecords.find((entry) => entry.roomId === encounter.room.roomId);
  assert.equal(Boolean(record), true);
  assert.equal(record.mode, "party_pve");
  assert.equal(record.reason, "escape");
  assert.equal(record.winnerAccountId, "");
  assert.deepEqual(record.loserAccountIds, []);
  assert.equal(record.expSummaries.length, 0);
});

test("party pve escape only removes non-leader members from party", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const events = [];
  service.onEvent((event) => events.push(event));
  const leader = service.register({"username": "pveescapelead", "password": "test1234", "displayName": "逃跑队长"});
  const member = service.register({"username": "pveescapemem", "password": "test1234", "displayName": "逃跑队员"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  assert.equal(service.saveProfile(leader.session.token, {
    "profile": battleProfile("逃跑队长", {"level": 9, "hp": 140, "maxHp": 140, "attack": 24, "defense": 9, "quick": 72}, {
      "petId": "pve_escape_leader_pet",
      "name": "队长宠",
      "level": 9,
      "hp": 90,
      "maxHp": 90,
    }),
  }).ok, true);
  assert.equal(service.saveProfile(member.session.token, {
    "profile": battleProfile("逃跑队员", {"level": 8, "hp": 132, "maxHp": 132, "attack": 22, "defense": 8, "quick": 70}, {
      "petId": "pve_escape_member_pet",
      "name": "队员宠",
      "level": 8,
      "hp": 84,
      "maxHp": 84,
    }),
  }).ok, true);
  const invite = service.inviteToParty(leader.session.token, {"username": "pveescapemem"});
  assert.equal(invite.ok, true);
  const accept = service.acceptPartyInvite(member.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);
  const memberEncounter = service.startPartyEncounter(leader.session.token, {
    "enemyCount": 1,
    "encounterZone": {
      "id": "member_escape_grass",
      "name": "队员逃跑草丛",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "队员逃跑乌力",
        "level": 3,
        "battleStats": {"maxHp": 80, "attack": 10, "defense": 5, "quick": 40},
      },
    },
  });
  assert.equal(memberEncounter.ok, true);
  assert.equal(memberEncounter.room.participantAccountIds.includes(member.account.accountId), true);
  const memberLeave = service.leaveBattleRoom(member.session.token, memberEncounter.room.roomId);
  assert.equal(memberLeave.ok, true);
  assert.equal(memberLeave.message, "已逃离战斗并离开队伍。");
  const afterMemberEscape = service.getPartyState(leader.session.token);
  assert.equal(afterMemberEscape.ok, true);
  assert.deepEqual(afterMemberEscape.party.members.map((player) => player.username), ["pveescapelead"]);
  const memberPartyState = service.getPartyState(member.session.token);
  assert.equal(memberPartyState.ok, true);
  assert.equal(memberPartyState.party, null);
  assert.equal(events.some((event) => event.type === "party.update" && Array.isArray(event.removedAccountIds) && event.removedAccountIds.includes(member.account.accountId)), true);

  const memberAgain = service.inviteToParty(leader.session.token, {"username": "pveescapemem"});
  assert.equal(memberAgain.ok, true);
  const acceptAgain = service.acceptPartyInvite(member.session.token, memberAgain.invite.inviteId);
  assert.equal(acceptAgain.ok, true);
  const leaderEncounter = service.startPartyEncounter(leader.session.token, {
    "enemyCount": 1,
    "encounterZone": {
      "id": "leader_escape_grass",
      "name": "队长逃跑草丛",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "队长逃跑乌力",
        "level": 3,
        "battleStats": {"maxHp": 80, "attack": 10, "defense": 5, "quick": 40},
      },
    },
  });
  assert.equal(leaderEncounter.ok, true);
  const leaderLeave = service.leaveBattleRoom(leader.session.token, leaderEncounter.room.roomId);
  assert.equal(leaderLeave.ok, true);
  assert.equal(leaderLeave.message, "已逃离战斗。");
  const afterLeaderEscape = service.getPartyState(leader.session.token);
  assert.equal(afterLeaderEscape.ok, true);
  assert.equal(afterLeaderEscape.party.memberCount, 2);
  assert.deepEqual(afterLeaderEscape.party.members.map((player) => player.username), ["pveescapelead", "pveescapemem"]);
});

test("party pve capture command stores captured wild pet and consumes capture tool", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const solo = service.register({"username": "pvecaptureone", "password": "test1234", "displayName": "捕捉玩家"});
  assert.equal(solo.ok, true);
  const profile = battleProfile("捕捉玩家", {
    "level": 5,
    "hp": 120,
    "maxHp": 120,
    "attack": 18,
    "defense": 8,
    "quick": 90,
  });
  profile.backpackSlots = [{"itemId": "capture_net", "count": 1}];
  profile.captureTools = {"capture_net": 1};
  profile.petCodexSeenFormIds = [];
  profile.petCodexCapturedFormIds = [];
  assert.equal(service.saveProfile(solo.session.token, {"expectedRevision": 0, "profile": profile}).ok, true);

  const encounter = service.startPartyEncounter(solo.session.token, {
    "enemyCount": 1,
    "encounterZone": {
      "id": "capture_grass",
      "name": "捕捉草丛",
      "formationTemplate": "10v10",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "捕捉乌力",
        "level": 3,
        "catchable": true,
        "captureDifficulty": 1,
        "captureChanceOverride": 1,
        "battleStats": {
          "maxHp": 80,
          "attack": 1,
          "defense": 1,
          "quick": 10,
        },
      },
    },
  });
  assert.equal(encounter.ok, true);
  assert.equal(encounter.room.participants[0].teamSnapshot.captureToolBag.capture_net, 1);
  const player = encounter.room.battle.actors.find((actor) => actor.accountId === solo.account.accountId && actor.kind === "player");
  const enemy = encounter.room.battle.actors.find((actor) => actor.side === "enemy");
  assert.equal(Boolean(player && enemy), true);
  assert.equal(enemy.catchable, true);
  const resolved = service.submitBattleCommand(solo.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": player.actorId,
    "actionId": "capture",
    "targetActorId": enemy.actorId,
    "captureToolId": "capture_net",
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.room.status, "closed");
  const captureEvent = resolved.turn.events.find((event) => event.eventType === "capture");
  assert.equal(Boolean(captureEvent), true);
  assert.equal(captureEvent.success, true);
  assert.equal(captureEvent.captureToolId, "capture_net");
  assert.equal(captureEvent.remainingCaptureToolCount, 0);

  const writeback = resolved.room.battle.profileWriteback.profiles.find((entry) => entry.accountId === solo.account.accountId);
  assert.equal(Boolean(writeback), true);
  assert.equal(writeback.captureToolBag.capture_net, 0);
  assert.equal(writeback.capturedPets.length, 1);
  assert.equal(writeback.capturedPets[0].formId, "wuli_normal_orange_fire10");
  assert.equal(writeback.capturedPets[0].state, "standby");
  const after = service.getProfile(solo.session.token);
  assert.equal(after.ok, true);
  const captured = after.profile.petInstances.find((pet) => pet.formId === "wuli_normal_orange_fire10" && pet.isNew === true);
  assert.equal(Boolean(captured), true);
  assert.equal(captured.state, "standby");
  assert.equal(captured.level, 3);
  assert.equal(after.profile.petCodexCapturedFormIds.includes("wuli_normal_orange_fire10"), true);
  const remainingNetCount = (after.profile.backpackSlots || []).reduce((sum, slot) => (
    sum + (slot && slot.itemId === "capture_net" ? Number(slot.count || 0) : 0)
  ), 0);
  assert.equal(remainingNetCount, 0);
});

test("party pve retargets defeated enemies and writes exp to participants", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const leader = service.register({"username": "pveexpone", "password": "test1234", "displayName": "经验队长"});
  const member = service.register({"username": "pveexptwo", "password": "test1234", "displayName": "经验队员"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);

  const leaderProfile = battleProfile("经验队长", {"level": 1, "hp": 120, "maxHp": 120, "attack": 24, "defense": 8, "quick": 90, "comboRateOverride": 0}, {
    "petId": "exp_leader_pet",
    "name": "队长布伊",
    "level": 1,
    "hp": 90,
    "maxHp": 90,
    "attack": 22,
    "defense": 6,
    "quick": 89,
    "comboRateOverride": 0,
  });
  leaderProfile.ridePetInstanceId = "exp_ride_pet";
  leaderProfile.petInstances.push({
    "instanceId": "exp_ride_pet",
    "petId": "exp_ride_pet",
    "formId": "bui_normal_blue_water10",
    "name": "经验骑宠",
    "state": "riding",
    "level": 1,
    "hp": 95,
    "maxHp": 95,
    "attack": 12,
    "defense": 7,
    "quick": 72,
    "activeSkillIds": ["pet_attack", "pet_defend"],
    "petSkillSlots": ["pet_attack", "pet_defend", "", "", "", "", ""],
    "passiveSkillIds": [],
  });
  leaderProfile.trainingPartners = [{
    "partnerId": "exp_partner_1",
    "name": "经验伙伴",
    "level": 1,
    "exp": 0,
    "hp": 120,
    "maxHp": 120,
    "attack": 22,
    "defense": 7,
    "quick": 88,
    "pet": {
      "petId": "exp_partner_pet_1",
      "name": "经验伙伴宠",
      "level": 1,
      "exp": 0,
      "hp": 90,
      "maxHp": 90,
      "attack": 18,
      "defense": 6,
      "quick": 86,
    },
  }];
  const memberProfile = battleProfile("经验队员", {"level": 1, "hp": 120, "maxHp": 120, "attack": 23, "defense": 8, "quick": 88, "comboRateOverride": 0}, {
    "petId": "exp_member_pet",
    "name": "队员布伊",
    "level": 1,
    "hp": 90,
    "maxHp": 90,
    "attack": 21,
    "defense": 6,
    "quick": 87,
    "comboRateOverride": 0,
  });
  assert.equal(service.saveProfile(leader.session.token, {"expectedRevision": 0, "profile": leaderProfile}).ok, true);
  assert.equal(service.saveProfile(member.session.token, {"expectedRevision": 0, "profile": memberProfile}).ok, true);

  service.updatePlayerPosition(leader.session.token, {"mapId": "firebud_training_yard", "cellX": 18, "cellY": 18, "facing": "east", "moving": false});
  service.updatePlayerPosition(member.session.token, {"mapId": "firebud_training_yard", "cellX": 18, "cellY": 18, "facing": "east", "moving": false});
  const invite = service.inviteToParty(leader.session.token, {"username": "pveexptwo"});
  assert.equal(invite.ok, true);
  const accept = service.acceptPartyInvite(member.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);

	  const encounter = service.startPartyEncounter(leader.session.token, {
	    "enemyCount": 2,
	    "encounterZone": {
	      "id": "exp_grass",
	      "name": "经验草丛",
	      "formationTemplate": "10v10",
	      "selectedWildPet": {
	        "formId": "wuli_normal_orange_fire10",
	        "name": "经验乌力",
	        "level": 1,
	        "expReward": 200,
	        "battleStats": {
	          "maxHp": 10,
	          "attack": 30,
	          "defense": 20,
	          "quick": 80,
	        },
      },
    },
  });
  assert.equal(encounter.ok, true);
  const actors = encounter.room.battle.actors;
  const leaderPlayer = actors.find((actor) => actor.username === "pveexpone" && actor.kind === "player");
  const leaderPet = actors.find((actor) => actor.username === "pveexpone" && actor.kind === "pet");
  const memberPlayer = actors.find((actor) => actor.username === "pveexptwo" && actor.kind === "player");
  const memberPet = actors.find((actor) => actor.username === "pveexptwo" && actor.kind === "pet");
  const firstEnemy = actors.find((actor) => actor.side === "enemy");
  assert.equal(Boolean(leaderPlayer && leaderPet && memberPlayer && memberPet && firstEnemy), true);

  assert.equal(service.submitBattleCommand(leader.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": leaderPlayer.actorId,
    "actionId": "attack",
    "targetActorId": firstEnemy.actorId,
  }).turn, null);
  assert.equal(service.submitBattleCommand(leader.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": leaderPet.actorId,
    "actionId": "pet_attack",
    "targetActorId": firstEnemy.actorId,
  }).turn, null);
  assert.equal(service.submitBattleCommand(member.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": memberPlayer.actorId,
    "actionId": "attack",
    "targetActorId": firstEnemy.actorId,
  }).turn, null);
  const resolved = service.submitBattleCommand(member.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": memberPet.actorId,
    "actionId": "pet_attack",
    "targetActorId": firstEnemy.actorId,
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.room.status, "closed");
  assert.equal(resolved.turn.events.some((event) => event.eventType === "target_missing"), false);
  const attackEvents = resolved.turn.events.filter((event) => event.eventType === "basic_attack" || event.eventType === "pet_skill");
  assert.equal(attackEvents.some((event) => event.targetActorId !== firstEnemy.actorId), true);

  const leaderAfter = service.getProfile(leader.session.token);
  const memberAfter = service.getProfile(member.session.token);
  assert.equal(leaderAfter.ok, true);
  assert.equal(memberAfter.ok, true);
  assert.equal(leaderAfter.profile.player.level > 1, true);
  assert.equal(memberAfter.profile.player.level, 1);
  assert.equal(leaderAfter.profile.petInstances.find((pet) => pet.instanceId === "exp_leader_pet").level > 1, true);
  assert.equal(leaderAfter.profile.petInstances.find((pet) => pet.instanceId === "exp_ride_pet").level > 1, true);
  assert.equal(memberAfter.profile.petInstances.find((pet) => pet.instanceId === "exp_member_pet").level, 1);
  assert.equal(leaderAfter.profile.trainingPartners[0].level, 1);
  assert.equal(leaderAfter.profile.trainingPartners[0].pet.level, 1);

  const storedRoom = service.snapshot().battleRooms[encounter.room.roomId];
  assert.equal(storedRoom.battle.expCredits.length, 2);
  const creditRecipients = storedRoom.battle.expCredits.flatMap((credit) => credit.recipients || []);
  assert.equal(creditRecipients.some((entry) => entry.accountId === leader.account.accountId && entry.type === "player" && entry.amount === 220 && entry.partyBonusPercent === 10), true);
  assert.equal(creditRecipients.some((entry) => entry.accountId === leader.account.accountId && entry.type === "ride_pet" && entry.amount === 132 && entry.baseAmount === 120), true);
  assert.equal(creditRecipients.some((entry) => entry.accountId === leader.account.accountId && entry.type === "pet" && entry.petId === "exp_leader_pet" && entry.amount === 220), true);
  assert.equal(creditRecipients.some((entry) => entry.accountId === member.account.accountId), false);
  const storedLeaderWriteback = storedRoom.battle.profileWriteback.profiles.find((entry) => entry.accountId === leader.account.accountId);
  const storedMemberWriteback = storedRoom.battle.profileWriteback.profiles.find((entry) => entry.accountId === member.account.accountId);
  assert.equal(storedLeaderWriteback.exp.amount, 572);
  assert.equal(storedLeaderWriteback.exp.player.amount, 220);
  assert.equal(storedLeaderWriteback.exp.player.baseAmount, 200);
  assert.equal(storedLeaderWriteback.exp.player.partyBonusPercent, 10);
  assert.equal(storedLeaderWriteback.exp.pets[0].petId, "exp_leader_pet");
  assert.equal(storedLeaderWriteback.exp.pets[0].amount, 220);
  assert.equal(storedLeaderWriteback.exp.ridePets[0].petId, "exp_ride_pet");
  assert.equal(storedLeaderWriteback.exp.ridePets[0].amount, 132);
  assert.equal(storedLeaderWriteback.exp.ridePets[0].levelsGained > 0, true);
  assert.equal(storedMemberWriteback.exp.amount, 0);
  assert.equal(storedMemberWriteback.exp.player.amount, 0);
  assert.equal(storedMemberWriteback.exp.player.killCount, 0);
  assert.equal(storedMemberWriteback.exp.pets[0].petId, "exp_member_pet");
  assert.equal(storedMemberWriteback.exp.pets[0].amount, 0);
  const publicLeaderWriteback = resolved.room.battle.profileWriteback.profiles.find((entry) => entry.accountId === leader.account.accountId);
  assert.equal(publicLeaderWriteback.exp.amount, 572);
  assert.equal(publicLeaderWriteback.exp.ridePets[0].name, "经验骑宠");
  const expRecord = service.snapshot().battleRecords.find((record) => record.roomId === encounter.room.roomId);
  assert.equal(expRecord.expSummaries.some((entry) => entry.accountId === leader.account.accountId && entry.amount === 572), true);
  assert.equal(expRecord.expSummaries.some((entry) => entry.accountId === member.account.accountId && entry.amount === 0), true);
  assert.equal(expRecord.profileWriteback.profiles.length, 2);
});

test("party pve victory writes stone coins and item drops to profile", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const solo = service.register({"username": "pverewardone", "password": "test1234", "displayName": "奖励玩家"});
  assert.equal(solo.ok, true);
  const profile = battleProfile("奖励玩家", {"level": 8, "hp": 140, "maxHp": 140, "attack": 999, "defense": 20, "quick": 200, "comboRateOverride": 0}, {
    "petId": "reward_pet",
    "name": "奖励布伊",
    "level": 8,
    "hp": 100,
    "maxHp": 100,
    "attack": 1,
    "defense": 10,
    "quick": 80,
    "comboRateOverride": 0,
  });
  profile.stoneCoins = 7;
  profile.backpackSlots = [];
  profile.captureTools = {};
  assert.equal(service.saveProfile(solo.session.token, {"expectedRevision": 0, "profile": profile}).ok, true);

  const encounter = service.startPartyEncounter(solo.session.token, {
    "enemyCount": 1,
    "encounterZone": {
      "id": "reward_grass",
      "name": "奖励草丛",
      "encounterGroupId": "firebud_grass_01",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "奖励乌力",
        "level": 1,
        "battleStats": {"maxHp": 1, "attack": 1, "defense": 1, "quick": 1},
      },
    },
  });
  assert.equal(encounter.ok, true);
  const player = encounter.room.battle.actors.find((actor) => actor.accountId === solo.account.accountId && actor.kind === "player");
  const pet = encounter.room.battle.actors.find((actor) => actor.accountId === solo.account.accountId && actor.kind === "pet");
  const enemy = encounter.room.battle.actors.find((actor) => actor.side === "enemy");
  assert.equal(Boolean(player && pet && enemy), true);
  assert.equal(service.submitBattleCommand(solo.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": player.actorId,
    "actionId": "attack",
    "targetActorId": enemy.actorId,
  }).turn, null);
  const resolved = service.submitBattleCommand(solo.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": pet.actorId,
    "actionId": "pet_defend",
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.room.status, "closed");
  const writeback = resolved.room.battle.profileWriteback.profiles.find((entry) => entry.accountId === solo.account.accountId);
  assert.equal(Boolean(writeback && writeback.rewards), true);
  assert.equal(writeback.rewards.tableId, "firebud_grass_01");
  assert.equal(writeback.rewards.stoneCoins > 0, true);
  assert.equal(writeback.rewards.addedItems.some((entry) => entry.itemId === "item_meat_small" && entry.count >= 1), true);
  assert.equal(writeback.rewards.addedItems.some((entry) => entry.itemId === "capture_rope_basic" && entry.count >= 1), true);
  assert.equal(writeback.captureToolBag.capture_rope_basic >= 1, true);

  const after = service.getProfile(solo.session.token);
  assert.equal(after.ok, true);
  assert.equal(after.profile.stoneCoins, 7 + writeback.rewards.stoneCoins);
  const meatCount = (after.profile.backpackSlots || []).reduce((sum, slot) => sum + (slot && slot.itemId === "item_meat_small" ? Number(slot.count || 0) : 0), 0);
  const ropeCount = (after.profile.backpackSlots || []).reduce((sum, slot) => sum + (slot && slot.itemId === "capture_rope_basic" ? Number(slot.count || 0) : 0), 0);
  assert.equal(meatCount >= 1, true);
  assert.equal(ropeCount >= 1, true);
  assert.equal(after.profile.captureTools.capture_rope_basic, ropeCount);
  const record = service.snapshot().battleRecords.find((entry) => entry.roomId === encounter.room.roomId);
  assert.equal(Boolean(record && record.profileWriteback.profiles[0].rewards), true);
});

test("party pve derives enemy exp from stats when expReward is omitted", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const leader = service.register({"username": "pveformulaa", "password": "test1234", "displayName": "公式队长"});
  const member = service.register({"username": "pveformulab", "password": "test1234", "displayName": "公式队员"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  assert.equal(service.saveProfile(leader.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("公式队长", {"level": 1, "hp": 120, "maxHp": 120, "attack": 18, "defense": 8, "quick": 90}, {
      "petId": "formula_leader_pet",
      "name": "公式布伊",
      "level": 1,
      "hp": 90,
      "maxHp": 90,
      "attack": 140,
      "defense": 6,
      "quick": 120,
    }),
  }).ok, true);
  assert.equal(service.saveProfile(member.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("公式队员", {"level": 1, "hp": 120, "maxHp": 120, "attack": 18, "defense": 8, "quick": 60}, {
      "petId": "formula_member_pet",
      "name": "旁观布伊",
      "level": 1,
      "hp": 90,
      "maxHp": 90,
      "attack": 12,
      "defense": 6,
      "quick": 50,
    }),
  }).ok, true);
  service.updatePlayerPosition(leader.session.token, {"mapId": "firebud_village_gate", "cellX": 15, "cellY": 17, "facing": "east", "moving": false});
  service.updatePlayerPosition(member.session.token, {"mapId": "firebud_village_gate", "cellX": 15, "cellY": 17, "facing": "east", "moving": false});
  const invite = service.inviteToParty(leader.session.token, {"username": "pveformulab"});
  assert.equal(invite.ok, true);
  assert.equal(service.acceptPartyInvite(member.session.token, invite.invite.inviteId).ok, true);

  const encounter = service.startPartyEncounter(leader.session.token, {
    "enemyCount": 1,
    "encounterZone": {
      "id": "formula_grass",
      "name": "公式草丛",
      "formationTemplate": "10v10",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "野生乌力",
        "level": 1,
        "battleStats": {
          "maxHp": 80,
          "attack": 10,
          "defense": 6,
          "agility": 48,
        },
      },
    },
  });
  assert.equal(encounter.ok, true);
  const actors = encounter.room.battle.actors;
  const leaderPlayer = actors.find((actor) => actor.username === "pveformulaa" && actor.kind === "player");
  const leaderPet = actors.find((actor) => actor.username === "pveformulaa" && actor.kind === "pet");
  const memberPlayer = actors.find((actor) => actor.username === "pveformulab" && actor.kind === "player");
  const memberPet = actors.find((actor) => actor.username === "pveformulab" && actor.kind === "pet");
  const enemy = actors.find((actor) => actor.side === "enemy");
  assert.equal(Boolean(leaderPlayer && leaderPet && memberPlayer && memberPet && enemy), true);
  const storedEnemy = service.snapshot().battleRooms[encounter.room.roomId].battle.actors.find((actor) => actor.side === "enemy");
  assert.equal(storedEnemy.expReward, 30);
  assert.equal(service.submitBattleCommand(leader.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": leaderPlayer.actorId,
    "actionId": "defend",
  }).turn, null);
  assert.equal(service.submitBattleCommand(leader.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": leaderPet.actorId,
    "actionId": "pet_attack",
    "targetActorId": enemy.actorId,
  }).turn, null);
  assert.equal(service.submitBattleCommand(member.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": memberPlayer.actorId,
    "actionId": "defend",
  }).turn, null);
  const resolved = service.submitBattleCommand(member.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": memberPet.actorId,
    "actionId": "pet_defend",
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.room.status, "closed");
  const attackEvent = resolved.turn.events.find((event) => event.actorId === leaderPet.actorId && event.eventType === "basic_attack");
  assert.equal(Boolean(attackEvent), true);
  assert.equal(attackEvent.expCredits[0].rawBaseAmount, 30);
  const leaderWriteback = resolved.room.battle.profileWriteback.profiles.find((entry) => entry.accountId === leader.account.accountId);
  assert.equal(leaderWriteback.exp.amount, 33);
  assert.equal(leaderWriteback.exp.pets[0].petId, "formula_leader_pet");
  assert.equal(leaderWriteback.exp.pets[0].baseAmount, 30);
  assert.equal(leaderWriteback.exp.pets[0].amount, 33);
  assert.equal(leaderWriteback.exp.pets[0].partyBonusPercent, 10);
});

test("party pve wild enemies choose random living targets instead of first slot", () => {
  let randomByteValue = 0;
  const service = createAuthService({
    "store": createMemoryAuthStore(),
    "randomBytes": (size) => Buffer.alloc(size, randomByteValue++ % 256),
  });
  const leader = service.register({"username": "pvewilda", "password": "test1234", "displayName": "随机队长"});
  const member = service.register({"username": "pvewildb", "password": "test1234", "displayName": "随机队员"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  assert.equal(service.saveProfile(leader.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("随机队长", {"level": 12, "hp": 180, "maxHp": 180, "attack": 20, "defense": 20, "quick": 80}, {
      "petId": "wild_leader_pet",
      "name": "随机队长宠",
      "level": 12,
      "hp": 120,
      "maxHp": 120,
      "attack": 20,
      "defense": 10,
      "quick": 70,
    }),
  }).ok, true);
  assert.equal(service.saveProfile(member.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("随机队员", {"level": 12, "hp": 180, "maxHp": 180, "attack": 20, "defense": 20, "quick": 78}, {
      "petId": "wild_member_pet",
      "name": "随机队员宠",
      "level": 12,
      "hp": 120,
      "maxHp": 120,
      "attack": 20,
      "defense": 10,
      "quick": 68,
    }),
  }).ok, true);
  service.updatePlayerPosition(leader.session.token, {"mapId": "firebud_training_yard", "cellX": 20, "cellY": 20, "facing": "east", "moving": false});
  service.updatePlayerPosition(member.session.token, {"mapId": "firebud_training_yard", "cellX": 20, "cellY": 20, "facing": "east", "moving": false});
  const invite = service.inviteToParty(leader.session.token, {"username": "pvewildb"});
  assert.equal(invite.ok, true);
  assert.equal(service.acceptPartyInvite(member.session.token, invite.invite.inviteId).ok, true);
  const encounter = service.startPartyEncounter(leader.session.token, {
    "enemyCount": 1,
    "encounterZone": {
      "id": "wild_target_grass",
      "name": "随机目标草丛",
      "formationTemplate": "10v10",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "随机乌力",
        "level": 1,
        "battleStats": {
          "maxHp": 500,
          "attack": 10,
          "defense": 1,
          "quick": 10,
        },
      },
    },
  });
  assert.equal(encounter.ok, true);
  assert.equal(encounter.room.seed, "0404040404040404");
  const actors = encounter.room.battle.actors;
  const leaderPlayer = actors.find((actor) => actor.username === "pvewilda" && actor.kind === "player");
  const leaderPet = actors.find((actor) => actor.username === "pvewilda" && actor.kind === "pet");
  const memberPlayer = actors.find((actor) => actor.username === "pvewildb" && actor.kind === "player");
  const memberPet = actors.find((actor) => actor.username === "pvewildb" && actor.kind === "pet");
  const enemy = actors.find((actor) => actor.side === "enemy");
  assert.equal(Boolean(leaderPlayer && leaderPet && memberPlayer && memberPet && enemy), true);
  assert.equal(service.submitBattleCommand(leader.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": leaderPlayer.actorId,
    "actionId": "defend",
  }).turn, null);
  assert.equal(service.submitBattleCommand(leader.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": leaderPet.actorId,
    "actionId": "pet_defend",
  }).turn, null);
  assert.equal(service.submitBattleCommand(member.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": memberPlayer.actorId,
    "actionId": "defend",
  }).turn, null);
  const resolved = service.submitBattleCommand(member.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": memberPet.actorId,
    "actionId": "pet_defend",
  });
  assert.equal(resolved.ok, true);
  const enemyAttack = resolved.turn.events.find((event) => event.actorId === enemy.actorId && event.eventType === "basic_attack");
  assert.equal(Boolean(enemyAttack), true);
  assert.equal(enemyAttack.targetRule, "wild_random");
  assert.equal(enemyAttack.targetCandidateCount, 4);
  assert.equal(enemyAttack.targetActorId, leaderPlayer.actorId);
  assert.notEqual(enemyAttack.targetActorId, leaderPet.actorId);
});

test("party pve wild random targets are distributed across live rounds", () => {
  let randomByteValue = 4;
  const service = createAuthService({
    "store": createMemoryAuthStore(),
    "randomBytes": (size) => Buffer.alloc(size, randomByteValue++ % 256),
  });
  const leader = service.register({"username": "pvewildspread1", "password": "test1234", "displayName": "分散队长"});
  const member = service.register({"username": "pvewildspread2", "password": "test1234", "displayName": "分散队员"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  assert.equal(service.saveProfile(leader.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("分散队长", {"level": 12, "hp": 999, "maxHp": 999, "attack": 1, "defense": 80, "quick": 220}, {
      "petId": "wild_spread_leader_pet",
      "name": "分散队长宠",
      "level": 12,
      "hp": 999,
      "maxHp": 999,
      "attack": 1,
      "defense": 80,
      "quick": 210,
    }),
  }).ok, true);
  assert.equal(service.saveProfile(member.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("分散队员", {"level": 12, "hp": 999, "maxHp": 999, "attack": 1, "defense": 80, "quick": 205}, {
      "petId": "wild_spread_member_pet",
      "name": "分散队员宠",
      "level": 12,
      "hp": 999,
      "maxHp": 999,
      "attack": 1,
      "defense": 80,
      "quick": 200,
    }),
  }).ok, true);
  service.updatePlayerPosition(leader.session.token, {"mapId": "firebud_training_yard", "cellX": 21, "cellY": 21, "facing": "east", "moving": false});
  service.updatePlayerPosition(member.session.token, {"mapId": "firebud_training_yard", "cellX": 21, "cellY": 21, "facing": "east", "moving": false});
  const invite = service.inviteToParty(leader.session.token, {"username": "pvewildspread2"});
  assert.equal(invite.ok, true);
  assert.equal(service.acceptPartyInvite(member.session.token, invite.invite.inviteId).ok, true);
  const encounter = service.startPartyEncounter(leader.session.token, {
    "enemyCount": 4,
    "encounterZone": {
      "id": "wild_spread_grass",
      "name": "野怪分散草丛",
      "formationTemplate": "10v10",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "分散乌力",
        "level": 1,
        "comboRateOverride": 0,
        "battleStats": {
          "maxHp": 5000,
          "attack": 1,
          "defense": 1,
          "quick": 10,
        },
      },
    },
  });
  assert.equal(encounter.ok, true);
  const actors = encounter.room.battle.actors;
  const leaderPlayer = actors.find((actor) => actor.username === "pvewildspread1" && actor.kind === "player");
  const leaderPet = actors.find((actor) => actor.username === "pvewildspread1" && actor.kind === "pet");
  const memberPlayer = actors.find((actor) => actor.username === "pvewildspread2" && actor.kind === "player");
  const memberPet = actors.find((actor) => actor.username === "pvewildspread2" && actor.kind === "pet");
  assert.equal(Boolean(leaderPlayer && leaderPet && memberPlayer && memberPet), true);
  const commandActors = [
    {token: leader.session.token, actor: leaderPlayer, actionId: "defend"},
    {token: leader.session.token, actor: leaderPet, actionId: "pet_defend"},
    {token: member.session.token, actor: memberPlayer, actionId: "defend"},
    {token: member.session.token, actor: memberPet, actionId: "pet_defend"},
  ];
  const targetCounts = new Map();
  let round = 1;
  for (let index = 0; index < 5; index += 1) {
    let resolved = null;
    commandActors.forEach((entry, commandIndex) => {
      resolved = service.submitBattleCommand(entry.token, encounter.room.roomId, {
        "round": round,
        "actorId": entry.actor.actorId,
        "actionId": entry.actionId,
      });
      assert.equal(resolved.ok, true);
      if (commandIndex < commandActors.length - 1) {
        assert.equal(resolved.turn, null);
      }
    });
    assert.equal(Boolean(resolved.turn), true);
    const wildEvents = resolved.turn.events.filter((event) => (
      event.eventType === "basic_attack" &&
      event.targetRule === "wild_random" &&
      String(event.actorId || "").startsWith("party_pve_enemy_")
    ));
    assert.equal(wildEvents.length, 4);
    for (const event of wildEvents) {
      targetCounts.set(event.targetActorId, (targetCounts.get(event.targetActorId) || 0) + 1);
      assert.equal(event.targetCandidateCount, 4);
    }
    round = resolved.room.battle.round;
  }
  assert.ok(targetCounts.size > 1, `expected wild targets to spread, got ${JSON.stringify(Object.fromEntries(targetCounts))}`);
  const trace = service.getBattleTrace(leader.session.token, {"roomId": encounter.room.roomId, "limit": 10});
  assert.equal(trace.ok, true);
  assert.equal(trace.traces.some((entry) => (
    entry.type === "battle_turn_resolved" &&
    entry.details &&
    Object.keys(entry.details.wildAiTargetCounts || {}).length > 1
  )), true);
});

test("party pve wild enemies can combo when random targets match", () => {
  const seedBytes = [0, 1, 2, 3, 41];
  let randomByteIndex = 0;
  const service = createAuthService({
    "store": createMemoryAuthStore(),
    "randomBytes": (size) => Buffer.alloc(size, seedBytes[randomByteIndex++] ?? 42),
  });
  const leader = service.register({"username": "pvewildca", "password": "test1234", "displayName": "野合队长"});
  const member = service.register({"username": "pvewildcb", "password": "test1234", "displayName": "野合队员"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  assert.equal(service.saveProfile(leader.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("野合队长", {"level": 12, "hp": 180, "maxHp": 180, "attack": 20, "defense": 20, "quick": 80}, {
      "petId": "wild_combo_leader_pet",
      "name": "野合队长宠",
      "level": 12,
      "hp": 120,
      "maxHp": 120,
      "attack": 20,
      "defense": 10,
      "quick": 70,
    }),
  }).ok, true);
  assert.equal(service.saveProfile(member.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("野合队员", {"level": 12, "hp": 180, "maxHp": 180, "attack": 20, "defense": 20, "quick": 78}, {
      "petId": "wild_combo_member_pet",
      "name": "野合队员宠",
      "level": 12,
      "hp": 120,
      "maxHp": 120,
      "attack": 20,
      "defense": 10,
      "quick": 68,
    }),
  }).ok, true);
  service.updatePlayerPosition(leader.session.token, {"mapId": "firebud_training_yard", "cellX": 20, "cellY": 20, "facing": "east", "moving": false});
  service.updatePlayerPosition(member.session.token, {"mapId": "firebud_training_yard", "cellX": 20, "cellY": 20, "facing": "east", "moving": false});
  const invite = service.inviteToParty(leader.session.token, {"username": "pvewildcb"});
  assert.equal(invite.ok, true);
  assert.equal(service.acceptPartyInvite(member.session.token, invite.invite.inviteId).ok, true);
  const encounter = service.startPartyEncounter(leader.session.token, {
    "enemyCount": 2,
    "encounterZone": {
      "id": "wild_combo_grass",
      "name": "野怪合击草丛",
      "formationTemplate": "10v10",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "野合乌力",
        "level": 1,
        "battleStats": {
          "maxHp": 500,
          "attack": 10,
          "defense": 1,
          "quick": 10,
        },
      },
    },
  });
  assert.equal(encounter.ok, true);
  assert.equal(encounter.room.seed, "2929292929292929");
  const actors = encounter.room.battle.actors;
  const leaderPlayer = actors.find((actor) => actor.username === "pvewildca" && actor.kind === "player");
  const leaderPet = actors.find((actor) => actor.username === "pvewildca" && actor.kind === "pet");
  const memberPlayer = actors.find((actor) => actor.username === "pvewildcb" && actor.kind === "player");
  const memberPet = actors.find((actor) => actor.username === "pvewildcb" && actor.kind === "pet");
  const enemyOne = actors.find((actor) => actor.actorId === "party_pve_enemy_front_1");
  const enemyTwo = actors.find((actor) => actor.actorId === "party_pve_enemy_front_2");
  assert.equal(Boolean(leaderPlayer && leaderPet && memberPlayer && memberPet && enemyOne && enemyTwo), true);
  assert.equal(service.submitBattleCommand(leader.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": leaderPlayer.actorId,
    "actionId": "defend",
  }).turn, null);
  assert.equal(service.submitBattleCommand(leader.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": leaderPet.actorId,
    "actionId": "pet_defend",
  }).turn, null);
  assert.equal(service.submitBattleCommand(member.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": memberPlayer.actorId,
    "actionId": "defend",
  }).turn, null);
  const resolved = service.submitBattleCommand(member.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": memberPet.actorId,
    "actionId": "pet_defend",
  });
  assert.equal(resolved.ok, true);
  const comboEvent = resolved.turn.events.find((event) => event.eventType === "combo_attack" && event.actorId === enemyTwo.actorId);
  assert.equal(Boolean(comboEvent), true);
  assert.deepEqual(comboEvent.participantActorIds, [enemyTwo.actorId, enemyOne.actorId]);
  assert.equal(comboEvent.targetActorId, leaderPlayer.actorId);
  assert.equal(comboEvent.expCredits, undefined);
});

test("party pve collapses adjacent same-target attacks into combo events and shared kill credit", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const leader = service.register({"username": "pvecomboa", "password": "test1234", "displayName": "合击队长"});
  const member = service.register({"username": "pvecombob", "password": "test1234", "displayName": "合击队员"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  assert.equal(service.saveProfile(leader.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("合击队长", {"level": 1, "hp": 120, "maxHp": 120, "attack": 24, "defense": 8, "quick": 100, "comboRateOverride": 1}, {
      "petId": "combo_leader_pet",
      "name": "合击布伊",
      "level": 1,
      "hp": 90,
      "maxHp": 90,
      "attack": 22,
      "defense": 6,
      "quick": 99,
      "comboRateOverride": 1,
    }),
  }).ok, true);
  assert.equal(service.saveProfile(member.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("合击队员", {"level": 1, "hp": 120, "maxHp": 120, "attack": 20, "defense": 8, "quick": 40}, {
      "petId": "combo_member_pet",
      "name": "旁观布伊",
      "level": 1,
      "hp": 90,
      "maxHp": 90,
      "attack": 18,
      "defense": 6,
      "quick": 39,
    }),
  }).ok, true);

  service.updatePlayerPosition(leader.session.token, {"mapId": "firebud_training_yard", "cellX": 18, "cellY": 18, "facing": "east", "moving": false});
  service.updatePlayerPosition(member.session.token, {"mapId": "firebud_training_yard", "cellX": 18, "cellY": 18, "facing": "east", "moving": false});
  const invite = service.inviteToParty(leader.session.token, {"username": "pvecombob"});
  assert.equal(invite.ok, true);
  assert.equal(service.acceptPartyInvite(member.session.token, invite.invite.inviteId).ok, true);

  const encounter = service.startPartyEncounter(leader.session.token, {
    "enemyCount": 1,
    "encounterZone": {
      "id": "combo_grass",
      "name": "合击草丛",
      "formationTemplate": "10v10",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "合击乌力",
        "level": 1,
        "expReward": 100,
        "battleStats": {
          "maxHp": 30,
          "attack": 1,
          "defense": 1,
          "quick": 10,
        },
      },
    },
  });
  assert.equal(encounter.ok, true);
  const actors = encounter.room.battle.actors;
  const leaderPlayer = actors.find((actor) => actor.username === "pvecomboa" && actor.kind === "player");
  const leaderPet = actors.find((actor) => actor.username === "pvecomboa" && actor.kind === "pet");
  const memberPlayer = actors.find((actor) => actor.username === "pvecombob" && actor.kind === "player");
  const memberPet = actors.find((actor) => actor.username === "pvecombob" && actor.kind === "pet");
  const enemy = actors.find((actor) => actor.side === "enemy");
  assert.equal(Boolean(leaderPlayer && leaderPet && memberPlayer && memberPet && enemy), true);

  assert.equal(service.submitBattleCommand(leader.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": leaderPlayer.actorId,
    "actionId": "attack",
    "targetActorId": enemy.actorId,
  }).turn, null);
  assert.equal(service.submitBattleCommand(leader.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": leaderPet.actorId,
    "actionId": "pet_attack",
    "targetActorId": enemy.actorId,
  }).turn, null);
  assert.equal(service.submitBattleCommand(member.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": memberPlayer.actorId,
    "actionId": "defend",
  }).turn, null);
  const resolved = service.submitBattleCommand(member.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": memberPet.actorId,
    "actionId": "pet_defend",
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.room.status, "closed");
  const comboEvent = resolved.turn.events.find((event) => event.eventType === "combo_attack");
  assert.equal(Boolean(comboEvent), true);
  assert.deepEqual(comboEvent.participantActorIds, [leaderPlayer.actorId, leaderPet.actorId]);
  assert.equal(comboEvent.targetActorId, enemy.actorId);
  assert.equal(comboEvent.defeated, true);
  assert.equal(comboEvent.expCredits.length, 1);
  const recipients = comboEvent.expCredits[0].recipients || [];
  assert.equal(recipients.some((entry) => entry.accountId === leader.account.accountId && entry.type === "player" && entry.amount === 110), true);
  assert.equal(recipients.some((entry) => entry.accountId === leader.account.accountId && entry.type === "pet" && entry.petId === "combo_leader_pet" && entry.amount === 110), true);
  assert.equal(recipients.some((entry) => entry.accountId === member.account.accountId), false);
  const leaderWriteback = resolved.room.battle.profileWriteback.profiles.find((entry) => entry.accountId === leader.account.accountId);
  const memberWriteback = resolved.room.battle.profileWriteback.profiles.find((entry) => entry.accountId === member.account.accountId);
  assert.equal(leaderWriteback.exp.amount, 220);
  assert.equal(memberWriteback.exp.amount, 0);
  const trace = service.getBattleTrace(leader.session.token, {"roomId": encounter.room.roomId, "limit": 20});
  assert.equal(trace.ok, true);
  assert.equal(trace.traces.some((entry) => (
    entry.type === "battle_turn_resolved" &&
    entry.details.comboEventCount === 1 &&
    entry.details.comboParticipantCount === 2
  )), true);
});

test("party pve retargets defeated command targets from highest monster slot", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const leader = service.register({"username": "pveordera", "password": "test1234", "displayName": "顺序队长"});
  const member = service.register({"username": "pveorderb", "password": "test1234", "displayName": "顺序队员"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  assert.equal(service.saveProfile(leader.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("顺序队长", {"level": 12, "hp": 180, "maxHp": 180, "attack": 520, "defense": 20, "quick": 100, "comboRateOverride": 0}, {
      "petId": "order_leader_pet",
      "name": "顺序队长宠",
      "level": 12,
      "hp": 120,
      "maxHp": 120,
      "attack": 500,
      "defense": 10,
      "quick": 99,
      "comboRateOverride": 0,
    }),
  }).ok, true);
  assert.equal(service.saveProfile(member.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("顺序队员", {"level": 12, "hp": 180, "maxHp": 180, "attack": 510, "defense": 20, "quick": 98, "comboRateOverride": 0}, {
      "petId": "order_member_pet",
      "name": "顺序队员宠",
      "level": 12,
      "hp": 120,
      "maxHp": 120,
      "attack": 490,
      "defense": 10,
      "quick": 97,
      "comboRateOverride": 0,
    }),
  }).ok, true);

  service.updatePlayerPosition(leader.session.token, {"mapId": "firebud_training_yard", "cellX": 20, "cellY": 20, "facing": "east", "moving": false});
  service.updatePlayerPosition(member.session.token, {"mapId": "firebud_training_yard", "cellX": 20, "cellY": 20, "facing": "east", "moving": false});
  const invite = service.inviteToParty(leader.session.token, {"username": "pveorderb"});
  assert.equal(invite.ok, true);
  assert.equal(service.acceptPartyInvite(member.session.token, invite.invite.inviteId).ok, true);
  const encounter = service.startPartyEncounter(leader.session.token, {
    "enemyCount": 10,
    "encounterZone": {
      "id": "order_grass",
      "name": "顺序草丛",
      "formationTemplate": "10v10",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "顺序乌力",
        "level": 1,
        "battleStats": {
          "maxHp": 10,
          "attack": 1,
          "defense": 1,
          "quick": 10,
        },
      },
    },
  });
  assert.equal(encounter.ok, true);
  const actors = encounter.room.battle.actors;
  const leaderPlayer = actors.find((actor) => actor.username === "pveordera" && actor.kind === "player");
  const leaderPet = actors.find((actor) => actor.username === "pveordera" && actor.kind === "pet");
  const memberPlayer = actors.find((actor) => actor.username === "pveorderb" && actor.kind === "player");
  const memberPet = actors.find((actor) => actor.username === "pveorderb" && actor.kind === "pet");
  const firstEnemy = actors.find((actor) => actor.slotId === "enemy.front.1");
  assert.equal(Boolean(leaderPlayer && leaderPet && memberPlayer && memberPet && firstEnemy), true);
  assert.equal(service.submitBattleCommand(leader.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": leaderPlayer.actorId,
    "actionId": "attack",
    "targetActorId": firstEnemy.actorId,
  }).turn, null);
  assert.equal(service.submitBattleCommand(leader.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": leaderPet.actorId,
    "actionId": "pet_attack",
    "targetActorId": firstEnemy.actorId,
  }).turn, null);
  assert.equal(service.submitBattleCommand(member.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": memberPlayer.actorId,
    "actionId": "attack",
    "targetActorId": firstEnemy.actorId,
  }).turn, null);
  const resolved = service.submitBattleCommand(member.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": memberPet.actorId,
    "actionId": "pet_attack",
    "targetActorId": firstEnemy.actorId,
  });
  assert.equal(resolved.ok, true);
  const playerAttackEvents = resolved.turn.events.filter((event) => (
    (event.eventType === "basic_attack" || event.eventType === "pet_skill") &&
    [leaderPlayer.actorId, leaderPet.actorId, memberPlayer.actorId, memberPet.actorId].includes(event.actorId)
  ));
  assert.equal(playerAttackEvents[0].targetActorId, "party_pve_enemy_front_1");
  assert.equal(playerAttackEvents[1].targetActorId, "party_pve_enemy_back_5");
  assert.equal(playerAttackEvents[2].targetActorId, "party_pve_enemy_back_4");
  assert.equal(resolved.turn.events.some((event) => event.eventType === "target_missing"), false);
});

test("party pve victory applies StoneAge-style high level exp decay floor", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const leader = service.register({"username": "pvezeroa", "password": "test1234", "displayName": "高等队长"});
  const member = service.register({"username": "pvezerob", "password": "test1234", "displayName": "高等队员"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  assert.equal(service.saveProfile(leader.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("高等队长", {"level": 131, "hp": 500, "maxHp": 500, "attack": 520, "defense": 80, "quick": 100, "comboRateOverride": 0}, {
      "petId": "zero_leader_pet",
      "name": "高等队长宠",
      "level": 131,
      "hp": 400,
      "maxHp": 400,
      "attack": 480,
      "defense": 70,
      "quick": 99,
      "comboRateOverride": 0,
    }),
  }).ok, true);
  assert.equal(service.saveProfile(member.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("高等队员", {"level": 131, "hp": 500, "maxHp": 500, "attack": 510, "defense": 80, "quick": 98, "comboRateOverride": 0}, {
      "petId": "zero_member_pet",
      "name": "高等队员宠",
      "level": 131,
      "hp": 400,
      "maxHp": 400,
      "attack": 470,
      "defense": 70,
      "quick": 97,
      "comboRateOverride": 0,
    }),
  }).ok, true);
  service.updatePlayerPosition(leader.session.token, {"mapId": "firebud_training_yard", "cellX": 22, "cellY": 22, "facing": "east", "moving": false});
  service.updatePlayerPosition(member.session.token, {"mapId": "firebud_training_yard", "cellX": 22, "cellY": 22, "facing": "east", "moving": false});
  const invite = service.inviteToParty(leader.session.token, {"username": "pvezerob"});
  assert.equal(invite.ok, true);
  assert.equal(service.acceptPartyInvite(member.session.token, invite.invite.inviteId).ok, true);
  const encounter = service.startPartyEncounter(leader.session.token, {
    "enemyCount": 2,
    "encounterZone": {
      "id": "zero_exp_grass",
      "name": "零经验草丛",
      "formationTemplate": "10v10",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "低级乌力",
        "level": 1,
        "battleStats": {
          "maxHp": 10,
          "attack": 1,
          "defense": 1,
          "quick": 10,
        },
      },
    },
  });
  assert.equal(encounter.ok, true);
  const actors = encounter.room.battle.actors;
  const leaderPlayer = actors.find((actor) => actor.username === "pvezeroa" && actor.kind === "player");
  const leaderPet = actors.find((actor) => actor.username === "pvezeroa" && actor.kind === "pet");
  const memberPlayer = actors.find((actor) => actor.username === "pvezerob" && actor.kind === "player");
  const memberPet = actors.find((actor) => actor.username === "pvezerob" && actor.kind === "pet");
  const firstEnemy = actors.find((actor) => actor.side === "enemy");
  assert.equal(Boolean(leaderPlayer && leaderPet && memberPlayer && memberPet && firstEnemy), true);
  assert.equal(service.submitBattleCommand(leader.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": leaderPlayer.actorId,
    "actionId": "attack",
    "targetActorId": firstEnemy.actorId,
  }).turn, null);
  assert.equal(service.submitBattleCommand(leader.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": leaderPet.actorId,
    "actionId": "pet_attack",
    "targetActorId": firstEnemy.actorId,
  }).turn, null);
  assert.equal(service.submitBattleCommand(member.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": memberPlayer.actorId,
    "actionId": "attack",
    "targetActorId": firstEnemy.actorId,
  }).turn, null);
  const resolved = service.submitBattleCommand(member.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": memberPet.actorId,
    "actionId": "pet_attack",
    "targetActorId": firstEnemy.actorId,
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.room.status, "closed");
  const profiles = resolved.room.battle.profileWriteback.profiles;
  const leaderWriteback = profiles.find((entry) => entry.accountId === leader.account.accountId);
  assert.equal(Boolean(leaderWriteback && leaderWriteback.exp), true);
  assert.equal(leaderWriteback.exp.amount, 2);
  assert.equal(leaderWriteback.exp.player.amount, 1);
  assert.equal(leaderWriteback.exp.player.baseAmount, 1);
  assert.equal(leaderWriteback.exp.player.partyBonusPercent, 10);
  assert.equal(leaderWriteback.exp.ridePets.length, 0);
  assert.equal(leaderWriteback.exp.pets[0].amount, 1);
  const memberWriteback = profiles.find((entry) => entry.accountId === member.account.accountId);
  assert.equal(Boolean(memberWriteback && memberWriteback.exp), true);
  assert.equal(memberWriteback.exp.amount, 0);
  assert.equal(memberWriteback.exp.player.amount, 0);
  assert.equal(memberWriteback.exp.pets[0].amount, 0);
  assert.equal(service.getProfile(leader.session.token).profile.player.level, 131);
  assert.equal(service.getProfile(member.session.token).profile.player.level, 131);
  const leaderState = service.getBattleState(leader.session.token);
  assert.equal(leaderState.ok, true);
  assert.equal(leaderState.room.status, "closed");
  assert.equal(leaderState.room.roomId, encounter.room.roomId);
  assert.equal(leaderState.room.battle.profileWriteback.profiles[0].exp.amount, 2);
  const trace = service.getBattleTrace(leader.session.token, {"roomId": encounter.room.roomId, "limit": 20});
  assert.equal(trace.ok, true);
  assert.equal(trace.traces.some((entry) => entry.type === "battle_room_closed" && entry.details.profileWritebackCount >= 1), true);
  assert.equal(trace.traces.some((entry) => entry.type === "battle_turn_resolved" && entry.details.expCreditCount === 2), true);
  assert.equal(trace.traces.some((entry) => entry.type === "battle_state_query" && entry.details.returnedClosedRoom === true), true);
});

test("duel battle rooms close when a player is defeated even if their pet survives", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const challenger = service.register({"username": "playerkoa", "password": "test1234", "displayName": "人物胜"});
  const opponent = service.register({"username": "playerkob", "password": "test1234", "displayName": "人物败"});
  assert.equal(challenger.ok, true);
  assert.equal(opponent.ok, true);
  assert.equal(service.saveProfile(challenger.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("人物胜", {"level": 12, "hp": 150, "maxHp": 150, "attack": 80, "defense": 8, "quick": 90}, {
      "petId": "pet_ko_a",
      "name": "甲布伊",
      "state": "battle",
      "hp": 90,
      "maxHp": 90,
      "attack": 16,
      "defense": 7,
      "quick": 50,
    }),
  }).ok, true);
  assert.equal(service.saveProfile(opponent.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("人物败", {"level": 12, "hp": 12, "maxHp": 150, "attack": 18, "defense": 1, "quick": 70}, {
      "petId": "pet_ko_b",
      "name": "乙布伊",
      "state": "battle",
      "hp": 90,
      "maxHp": 90,
      "attack": 16,
      "defense": 7,
      "quick": 50,
    }),
  }).ok, true);
  service.updatePlayerPosition(challenger.session.token, {"mapId": "village", "cellX": 10, "cellY": 10, "facing": "east", "moving": false});
  service.updatePlayerPosition(opponent.session.token, {"mapId": "village", "cellX": 11, "cellY": 10, "facing": "west", "moving": false});
  const invite = service.inviteToBattle(challenger.session.token, {"username": "playerkob"});
  const accept = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);
  const challengerPlayer = accept.room.battle.actors.find((actor) => actor.username === "playerkoa" && actor.kind === "player");
  const challengerPet = accept.room.battle.actors.find((actor) => actor.username === "playerkoa" && actor.kind === "pet");
  const opponentPlayer = accept.room.battle.actors.find((actor) => actor.username === "playerkob" && actor.kind === "player");
  const opponentPet = accept.room.battle.actors.find((actor) => actor.username === "playerkob" && actor.kind === "pet");

  assert.equal(service.submitBattleCommand(challenger.session.token, accept.room.roomId, {
    "round": 1,
    "actorId": challengerPlayer.actorId,
    "actionId": "attack",
    "targetActorId": opponentPlayer.actorId,
  }).ok, true);
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
  const final = service.submitBattleCommand(opponent.session.token, accept.room.roomId, {
    "round": 1,
    "actorId": opponentPet.actorId,
    "actionId": "pet_defend",
  });
  assert.equal(final.ok, true);
  assert.equal(final.room.status, "closed");
  assert.equal(final.turn.result.reason, "defeat");
  assert.equal(final.room.battle.result.winnerAccountId, challenger.account.accountId);
  assert.deepEqual(final.room.battle.result.loserAccountIds, [opponent.account.accountId]);
  const updatedOpponentPlayer = final.room.battle.actors.find((actor) => actor.actorId === opponentPlayer.actorId);
  const updatedOpponentPet = final.room.battle.actors.find((actor) => actor.actorId === opponentPet.actorId);
  assert.equal(updatedOpponentPlayer.hp, 0);
  assert.equal(updatedOpponentPet.hp, 90);
  assert.equal(final.turn.events.some((event) => event.eventType === "defend" && event.actorId === opponentPet.actorId), false);
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
    {"itemId": "item_heal_all_5", "count": 1},
    {"itemId": "item_poison_single_5", "count": 1},
    {"itemId": "item_poison_all_5", "count": 1},
    {"itemId": "item_cleanse_single_5", "count": 1},
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
  assert.equal(accept.room.participants[0].teamSnapshot.battleItemBag.item_heal_all_5, 1);
  assert.equal(accept.room.participants[0].teamSnapshot.battleItemBag.item_poison_single_5, 1);
  assert.equal(accept.room.participants[0].teamSnapshot.battleItemBag.item_poison_all_5, 1);
  assert.equal(accept.room.participants[0].teamSnapshot.battleItemBag.item_cleanse_single_5, 1);
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
    "actionId": "item_unknown_999",
    "itemId": "item_unknown_999",
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

test("duel battle rooms resolve expanded battle items and pet status skills", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const challenger = service.register({"username": "statusa", "password": "test1234", "displayName": "状态甲"});
  const opponent = service.register({"username": "statusb", "password": "test1234", "displayName": "状态乙"});
  assert.equal(challenger.ok, true);
  assert.equal(opponent.ok, true);
  const challengerProfile = battleProfile("状态甲", {"level": 18, "hp": 160, "maxHp": 160, "attack": 22, "defense": 8, "quick": 90}, {
    "petId": "pet_status_a",
    "name": "催眠布伊",
    "state": "battle",
    "hp": 70,
    "maxHp": 90,
    "attack": 14,
    "defense": 7,
    "quick": 70,
  });
  challengerProfile.petInstances[0].activeSkillIds = ["pet_attack", "pet_defend", "pet_sleep_powder"];
  challengerProfile.petInstances[0].petSkillSlots = ["pet_attack", "pet_defend", "pet_sleep_powder", "", "", "", ""];
  challengerProfile.backpackSlots = [
    {"itemId": "item_heal_all_5", "count": 1},
    {"itemId": "item_poison_single_5", "count": 1},
  ];
  const opponentProfile = battleProfile("状态乙", {"level": 18, "hp": 160, "maxHp": 160, "attack": 20, "defense": 8, "quick": 80}, {
    "petId": "pet_status_b",
    "name": "受术布伊",
    "state": "battle",
    "hp": 75,
    "maxHp": 90,
    "attack": 12,
    "defense": 7,
    "quick": 60,
  });
  opponentProfile.backpackSlots = [
    {"itemId": "item_cleanse_single_5", "count": 1},
  ];
  assert.equal(service.saveProfile(challenger.session.token, {
    "expectedRevision": 0,
    "profile": challengerProfile,
  }).ok, true);
  assert.equal(service.saveProfile(opponent.session.token, {
    "expectedRevision": 0,
    "profile": opponentProfile,
  }).ok, true);
  service.updatePlayerPosition(challenger.session.token, {"mapId": "village", "cellX": 10, "cellY": 10, "facing": "east", "moving": false});
  service.updatePlayerPosition(opponent.session.token, {"mapId": "village", "cellX": 11, "cellY": 10, "facing": "west", "moving": false});

  const invite = service.inviteToBattle(challenger.session.token, {"username": "statusb"});
  const accept = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);
  assert.equal(accept.room.participants[0].teamSnapshot.battleItemBag.item_heal_all_5, 1);
  assert.equal(accept.room.participants[0].teamSnapshot.battleItemBag.item_poison_single_5, 1);
  assert.equal(accept.room.participants[1].teamSnapshot.battleItemBag.item_cleanse_single_5, 1);
  const challengerPlayer = accept.room.battle.actors.find((actor) => actor.username === "statusa" && actor.kind === "player");
  const challengerPet = accept.room.battle.actors.find((actor) => actor.username === "statusa" && actor.kind === "pet");
  const opponentPlayer = accept.room.battle.actors.find((actor) => actor.username === "statusb" && actor.kind === "player");
  const opponentPet = accept.room.battle.actors.find((actor) => actor.username === "statusb" && actor.kind === "pet");

  assert.equal(service.submitBattleCommand(challenger.session.token, accept.room.roomId, {
    "round": 1,
    "actorId": challengerPlayer.actorId,
    "actionId": "item_heal_all_5",
    "itemId": "item_heal_all_5",
    "targetActorId": challengerPlayer.actorId,
  }).ok, true);
  assert.equal(service.submitBattleCommand(challenger.session.token, accept.room.roomId, {
    "round": 1,
    "actorId": challengerPet.actorId,
    "actionId": "pet_sleep_powder",
    "targetActorId": opponentPet.actorId,
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
  const healAllEvent = roundOne.turn.events.find((event) => event.eventType === "item_heal_all");
  assert.equal(Boolean(healAllEvent), true);
  assert.equal(healAllEvent.itemId, "item_heal_all_5");
  assert.equal(healAllEvent.remainingItemCount, 0);
  assert.ok(Array.isArray(healAllEvent.targets));
  const statusEvent = roundOne.turn.events.find((event) => event.eventType === "skill_status");
  assert.equal(Boolean(statusEvent), true);
  assert.equal(statusEvent.skillId, "pet_sleep_powder");
  assert.equal(statusEvent.targetActorId, opponentPet.actorId);
  assert.equal(statusEvent.statusId, "sleep");
  assert.ok(["applied", "resisted", "immune"].includes(statusEvent.statusResult));
  if (statusEvent.statusResult === "applied") {
    const updatedOpponentPet = roundOne.room.battle.actors.find((actor) => actor.actorId === opponentPet.actorId);
    assert.equal(Boolean(updatedOpponentPet.statuses.sleep), true);
  }

  assert.equal(service.submitBattleCommand(challenger.session.token, accept.room.roomId, {
    "round": 2,
    "actorId": challengerPlayer.actorId,
    "actionId": "item_poison_single_5",
    "itemId": "item_poison_single_5",
    "targetActorId": opponentPlayer.actorId,
  }).ok, true);
  assert.equal(service.submitBattleCommand(challenger.session.token, accept.room.roomId, {
    "round": 2,
    "actorId": challengerPet.actorId,
    "actionId": "pet_defend",
  }).ok, true);
  assert.equal(service.submitBattleCommand(opponent.session.token, accept.room.roomId, {
    "round": 2,
    "actorId": opponentPlayer.actorId,
    "actionId": "item_cleanse_single_5",
    "itemId": "item_cleanse_single_5",
    "targetActorId": opponentPlayer.actorId,
  }).ok, true);
  const roundTwo = service.submitBattleCommand(opponent.session.token, accept.room.roomId, {
    "round": 2,
    "actorId": opponentPet.actorId,
    "actionId": "pet_defend",
  });
  assert.equal(roundTwo.ok, true);
  const poisonEvent = roundTwo.turn.events.find((event) => event.eventType === "item_poison");
  assert.equal(Boolean(poisonEvent), true);
  assert.equal(poisonEvent.itemId, "item_poison_single_5");
  assert.equal(poisonEvent.targetActorId, opponentPlayer.actorId);
  assert.equal(poisonEvent.remainingItemCount, 0);
  assert.ok(["applied", "resisted", "immune", "target_down"].includes(poisonEvent.statusResult));
  const cleanseEvent = roundTwo.turn.events.find((event) => event.eventType === "item_cleanse");
  assert.equal(Boolean(cleanseEvent), true);
  assert.equal(cleanseEvent.itemId, "item_cleanse_single_5");
  assert.equal(cleanseEvent.targetActorId, opponentPlayer.actorId);
  assert.equal(cleanseEvent.remainingItemCount, 0);
});

test("duel battle rooms snapshot and resolve equipment spirits", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const challenger = service.register({"username": "spirita", "password": "test1234", "displayName": "精灵甲"});
  const opponent = service.register({"username": "spiritb", "password": "test1234", "displayName": "精灵乙"});
  assert.equal(challenger.ok, true);
  assert.equal(opponent.ok, true);

  const challengerProfile = battleProfile("精灵甲", {"level": 12, "hp": 150, "maxHp": 150, "attack": 18, "defense": 8, "quick": 72}, {
    "petId": "pet_spirit_a",
    "name": "受伤布伊",
    "state": "battle",
    "hp": 40,
    "maxHp": 90,
    "attack": 12,
    "defense": 7,
    "quick": 55,
  });
  challengerProfile.equipmentSlots = {
    "accessory_left": "accessory_firebud_charm",
    "accessory_right": "accessory_wind_ring",
    "left_hand_weapon": "weapon_training_spear",
    "body": "armor_moist_cloth",
  };
  challengerProfile.equipmentDurability = {
    "accessory_left": 30,
    "accessory_right": 30,
    "left_hand_weapon": 30,
    "body": 30,
  };
  assert.equal(service.saveProfile(challenger.session.token, {
    "expectedRevision": 0,
    "profile": challengerProfile,
  }).ok, true);
  assert.equal(service.saveProfile(opponent.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("精灵乙", {"level": 12, "hp": 150, "maxHp": 150, "attack": 18, "defense": 8, "quick": 70}, {
      "petId": "pet_spirit_b",
      "name": "乙布伊",
      "state": "battle",
      "hp": 80,
      "maxHp": 90,
      "attack": 12,
      "defense": 7,
      "quick": 54,
    }),
  }).ok, true);
  service.updatePlayerPosition(challenger.session.token, {"mapId": "village", "cellX": 10, "cellY": 10, "facing": "east", "moving": false});
  service.updatePlayerPosition(opponent.session.token, {"mapId": "village", "cellX": 11, "cellY": 10, "facing": "west", "moving": false});

  const invite = service.inviteToBattle(challenger.session.token, {"username": "spiritb"});
  const accept = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);
  assert.deepEqual(
    accept.room.participants[0].teamSnapshot.player.spiritIds.sort(),
    ["spirit_grace_1", "spirit_moist_1", "spirit_poison_1", "spirit_poison_mist_1"].sort()
  );
  const challengerPlayer = accept.room.battle.actors.find((actor) => actor.username === "spirita" && actor.kind === "player");
  const challengerPet = accept.room.battle.actors.find((actor) => actor.username === "spirita" && actor.kind === "pet");
  const opponentPlayer = accept.room.battle.actors.find((actor) => actor.username === "spiritb" && actor.kind === "player");
  const opponentPet = accept.room.battle.actors.find((actor) => actor.username === "spiritb" && actor.kind === "pet");
  assert.equal(challengerPlayer.spiritIds.includes("spirit_moist_1"), true);

  const spiritCommand = service.submitBattleCommand(challenger.session.token, accept.room.roomId, {
    "round": 1,
    "actorId": challengerPlayer.actorId,
    "actionId": "spirit_moist_1",
    "spiritId": "spirit_moist_1",
    "targetActorId": challengerPet.actorId,
  });
  assert.equal(spiritCommand.ok, true);
  assert.equal(spiritCommand.command.actionKind, "spirit");
  assert.equal(spiritCommand.command.spiritId, "spirit_moist_1");
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
  const resolved = service.submitBattleCommand(opponent.session.token, accept.room.roomId, {
    "round": 1,
    "actorId": opponentPet.actorId,
    "actionId": "pet_defend",
  });
  assert.equal(resolved.ok, true);
  const spiritEvent = resolved.turn.events.find((event) => event.eventType === "spirit_heal");
  assert.equal(spiritEvent.spiritId, "spirit_moist_1");
  assert.equal(spiritEvent.targetActorId, challengerPet.actorId);
  assert.equal(spiritEvent.healed, 18);
  assert.equal(spiritEvent.hpAfter, 58);
  const updatedPet = resolved.room.battle.actors.find((actor) => actor.actorId === challengerPet.actorId);
  assert.equal(updatedPet.hp, 58);
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
  assert.equal(service.saveProfile(challenger.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("关闭甲", {"level": 12, "hp": 160, "maxHp": 160, "attack": 90, "defense": 12, "quick": 90}, null),
  }).ok, true);
  assert.equal(service.saveProfile(opponent.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("关闭乙", {"level": 8, "hp": 48, "maxHp": 48, "attack": 16, "defense": 1, "quick": 50}, null),
  }).ok, true);
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
  assert.equal(leave.result.battleRecordId.startsWith("battle_record_"), true);
  assert.equal(service.getBattleState(challenger.session.token).room, null);
  assert.equal(events.some((event) => event.type === "battle.room_closed" && event.reason === "leave"), true);
  const leaveRecord = service.snapshot().battleRecords.find((record) => record.roomId === leaveAccept.room.roomId);
  assert.equal(leaveRecord.reason, "leave");
  assert.equal(leaveRecord.winnerAccountId, challenger.account.accountId);
  assert.deepEqual(leaveRecord.loserAccountIds, [opponent.account.accountId]);
  assert.equal(leaveRecord.participants.length, 2);
  const winnerSummary = service.getBattleRecordSummary(challenger.session.token, {"username": "closeb"});
  assert.equal(winnerSummary.ok, true);
  assert.equal(winnerSummary.summary.total, 1);
  assert.equal(winnerSummary.summary.wins, 1);
  assert.equal(winnerSummary.summary.losses, 0);
  const loserSummary = service.getBattleRecordSummary(opponent.session.token, {"username": "closea"});
  assert.equal(loserSummary.ok, true);
  assert.equal(loserSummary.summary.total, 1);
  assert.equal(loserSummary.summary.wins, 0);
  assert.equal(loserSummary.summary.losses, 1);

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

  service.updatePlayerPosition(challenger.session.token, {"mapId": "village", "cellX": 10, "cellY": 10, "facing": "east", "moving": false});
  service.updatePlayerPosition(opponent.session.token, {"mapId": "village", "cellX": 11, "cellY": 10, "facing": "west", "moving": false});
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

  service.updatePlayerPosition(challenger.session.token, {"mapId": "village", "cellX": 10, "cellY": 10, "facing": "east", "moving": false});
  service.updatePlayerPosition(opponent.session.token, {"mapId": "village", "cellX": 11, "cellY": 10, "facing": "west", "moving": false});
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
  assert.equal(finalCommand.room.battle.result.battleRecordId.startsWith("battle_record_"), true);
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

test("duel battle room timeout and leave race closes idempotently", () => {
  let nowMs = Date.parse("2026-06-29T01:00:00.000Z");
  const service = createAuthService({
    "store": createMemoryAuthStore(),
    "now": () => nowMs,
  });
  const events = [];
  service.onEvent((event) => events.push(event));
  const challenger = service.register({"username": "timeoutleavea", "password": "test1234", "displayName": "超时甲"});
  const opponent = service.register({"username": "timeoutleaveb", "password": "test1234", "displayName": "超时乙"});
  assert.equal(challenger.ok, true);
  assert.equal(opponent.ok, true);
  assert.equal(service.saveProfile(challenger.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("超时甲", {"level": 10, "hp": 150, "maxHp": 150, "attack": 30, "defense": 12, "quick": 80}, null),
  }).ok, true);
  assert.equal(service.saveProfile(opponent.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("超时乙", {"level": 10, "hp": 150, "maxHp": 150, "attack": 28, "defense": 12, "quick": 78}, null),
  }).ok, true);
  service.updatePlayerPosition(challenger.session.token, {"mapId": "village", "cellX": 10, "cellY": 10, "facing": "east", "moving": false});
  service.updatePlayerPosition(opponent.session.token, {"mapId": "village", "cellX": 11, "cellY": 10, "facing": "west", "moving": false});

  const invite = service.inviteToBattle(challenger.session.token, {"username": "timeoutleaveb"});
  assert.equal(invite.ok, true);
  const accept = service.acceptBattleInvite(opponent.session.token, invite.invite.inviteId);
  assert.equal(accept.ok, true);
  nowMs += 100 * 1000;
  const maintenance = service.runBattleMaintenance();
  assert.equal(maintenance.ok, true);
  assert.equal(maintenance.events.length, 1);
  assert.equal(maintenance.events[0].reason, "timeout");

  const lateLeave = service.leaveBattleRoom(opponent.session.token, accept.room.roomId);
  assert.equal(lateLeave.ok, false);
  assert.equal(lateLeave.code, "battle_room_missing");
  assert.equal(events.filter((event) => event.type === "battle.room_closed" && event.reason === "timeout" && event.roomId === accept.room.roomId).length, 1);
  const records = service.snapshot().battleRecords.filter((record) => record.roomId === accept.room.roomId);
  assert.equal(records.length, 1);
  assert.equal(records[0].reason, "timeout");
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
  const structuredLogs = [];
  const service = createAuthService({
    "store": createMemoryAuthStore(),
    "now": () => nowMs,
  });
  createHttpServer({service, logger: (entry) => structuredLogs.push(entry)});
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
  const initialDeadline = service.snapshot().battleRooms[roomId].battle.commandDeadlineAt;

  const disconnected = service.markBattleConnection(challenger.session.token, false);
  assert.equal(disconnected.ok, true);
  nowMs += 4 * 1000;
  const polledReconnect = service.getBattleState(challenger.session.token);
  assert.equal(polledReconnect.ok, true);
  assert.equal(polledReconnect.room.roomId, roomId);
  assert.equal(polledReconnect.room.battle.commandDeadlineAt, initialDeadline);

  service.markBattleConnection(challenger.session.token, false);
  nowMs += 299 * 1000;
  const reconnected = service.markBattleConnection(challenger.session.token, true);
  assert.equal(reconnected.ok, true);
  assert.equal(reconnected.room.roomId, roomId);
  assert.equal(Date.parse(reconnected.room.battle.commandDeadlineAt) > nowMs, true);
  assert.equal(service.getBattleState(challenger.session.token).room.roomId, roomId);

  service.markBattleConnection(challenger.session.token, false);
  nowMs += 301 * 1000;
  const maintenance = service.runBattleMaintenance();
  assert.equal(maintenance.ok, true);
  assert.equal(maintenance.events.some((event) => event.type === "battle.room_closed" && event.reason === "disconnect_timeout"), true);
  assert.equal(service.getBattleState(challenger.session.token).room, null);
  assert.equal(service.getBattleState(opponent.session.token).room, null);
  const closedRoom = service.snapshot().battleRooms[roomId];
  assert.equal(closedRoom.status, "closed");
  assert.equal(closedRoom.battle.result.winnerAccountId, opponent.account.accountId);
  assert.deepEqual(closedRoom.battle.result.loserAccountIds, [challenger.account.accountId]);
  const settlementLog = structuredLogs.find((entry) => entry.type === "battle.settlement" && entry.roomId === roomId);
  assert.notEqual(settlementLog, undefined);
  assert.equal(settlementLog.reason, "disconnect_timeout");
  assert.equal(settlementLog.profileWritebackCount >= 0, true);
  assert.equal(Array.isArray(settlementLog.skippedProfiles), true);
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
  nowMs += 301 * 1000;

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
