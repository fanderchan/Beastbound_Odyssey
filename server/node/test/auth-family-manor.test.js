"use strict";

const {
  assert,
  test,
  createAuthService,
  createMemoryAuthStore,
  createHttpServer,
  battleProfile,
  profileItemCount,
  fetchJson,
} = require("../test-support/auth-service-test-context");

test("families can occupy one of nine manors and unlock its manor shop", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const leader = service.register({"username": "manorlead", "password": "test1234", "displayName": "族长"});
  const member = service.register({"username": "manormember", "password": "test1234", "displayName": "族员"});
  const outsider = service.register({"username": "manorout", "password": "test1234", "displayName": "路人"});
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  assert.equal(outsider.ok, true);

  const leaderProfile = battleProfile("族长", {
    level: 35,
    hp: 420,
    maxHp: 420,
    attack: 88,
    defense: 48,
    quick: 118,
  }, {
    petId: "manor_leader_pet",
    name: "战宠",
    level: 32,
    hp: 320,
    maxHp: 320,
    attack: 72,
    defense: 44,
    quick: 92,
  });
  leaderProfile.stoneCoins = 1000;
  const memberProfile = battleProfile("族员", {level: 20, hp: 220, maxHp: 220, attack: 45, defense: 26, quick: 80}, null);
  memberProfile.stoneCoins = 1000;
  const outsiderProfile = battleProfile("路人", {level: 12, hp: 160, maxHp: 160, attack: 28, defense: 14, quick: 76}, null);
  outsiderProfile.stoneCoins = 1000;
  assert.equal(service.saveProfile(leader.session.token, {profile: leaderProfile}).ok, true);
  assert.equal(service.saveProfile(member.session.token, {profile: memberProfile}).ok, true);
  assert.equal(service.saveProfile(outsider.session.token, {profile: outsiderProfile}).ok, true);

  const beforeOwnerBuy = service.shopTransaction(outsider.session.token, {
    mode: "buy",
    shopId: "manor_firebud_shop",
    itemId: "item_heal_all_5",
    amount: 1,
  });
  assert.equal(beforeOwnerBuy.ok, false);
  assert.equal(beforeOwnerBuy.code, "shop_family_manor_required");

  const created = service.createFamily(leader.session.token, {"name": "火芽盟"});
  assert.equal(created.ok, true);
  assert.equal(created.family.memberCount, 1);
  assert.equal(created.manors.length, 9);

  const joined = service.joinFamily(member.session.token, {"familyId": created.family.familyId});
  assert.equal(joined.ok, true);
  assert.equal(joined.family.memberCount, 2);

  const memberChallenge = service.challengeManor(member.session.token, {"manorId": "firebud_manor"});
  assert.equal(memberChallenge.ok, false);
  assert.equal(memberChallenge.code, "family_leader_required");

  const declared = service.challengeManor(leader.session.token, {"manorId": "firebud_manor"});
  assert.equal(declared.ok, true);
  assert.equal(declared.war.status, "scheduled");
  assert.equal(declared.war.challengerParticipantCount, 1);
  assert.equal(declared.war.viewerParticipantSide, "challenger");
  assert.equal(declared.war.canLeaveByViewerFamily, false);
  assert.equal(declared.manor.ownerFamilyName, "");
  assert.equal(declared.manor.activeWar.warId, declared.war.warId);
  const leaderOnlyPower = declared.war.challengerPower;

  const outsiderEnter = service.enterManorWar(outsider.session.token, {"warId": declared.war.warId});
  assert.equal(outsiderEnter.ok, false);
  assert.equal(outsiderEnter.code, "family_missing");

  const memberEnter = service.enterManorWar(member.session.token, {"warId": declared.war.warId});
  assert.equal(memberEnter.ok, true);
  assert.equal(memberEnter.war.challengerParticipantCount, 2);
  assert.ok(memberEnter.war.challengerPower > leaderOnlyPower);

  const memberLeave = service.leaveManorWar(member.session.token, {"warId": declared.war.warId});
  assert.equal(memberLeave.ok, true);
  assert.equal(memberLeave.war.challengerParticipantCount, 1);

  const memberReenter = service.enterManorWar(member.session.token, {"warId": declared.war.warId});
  assert.equal(memberReenter.ok, true);
  assert.equal(memberReenter.war.challengerParticipantCount, 2);

  const pendingOwnerBuy = service.shopTransaction(leader.session.token, {
    mode: "buy",
    shopId: "manor_firebud_shop",
    itemId: "item_heal_all_5",
    amount: 1,
  });
  assert.equal(pendingOwnerBuy.ok, false);
  assert.equal(pendingOwnerBuy.code, "shop_family_manor_required");

  const duplicateWar = service.challengeManor(leader.session.token, {"manorId": "earth_vein_manor"});
  assert.equal(duplicateWar.ok, false);
  assert.equal(duplicateWar.code, "manor_family_war_active");

  const memberResolve = service.resolveManorWar(member.session.token, {"warId": declared.war.warId});
  assert.equal(memberResolve.ok, false);
  assert.equal(memberResolve.code, "family_leader_required");

  const battle = service.resolveManorWar(leader.session.token, {"warId": declared.war.warId});
  assert.equal(battle.ok, true);
  assert.equal(battle.battle.result, "challenger_win");
  assert.equal(battle.manor.ownerFamilyName, "火芽盟");
  assert.equal(battle.manor.isOwnedByViewerFamily, true);
  assert.equal(battle.war.status, "resolved");

  const bought = service.shopTransaction(leader.session.token, {
    mode: "buy",
    shopId: "manor_firebud_shop",
    itemId: "item_heal_all_5",
    amount: 1,
  });
  assert.equal(bought.ok, true);
  assert.equal(profileItemCount(bought.profile, "item_heal_all_5"), 1);

  const outsiderBuy = service.shopTransaction(outsider.session.token, {
    mode: "buy",
    shopId: "manor_firebud_shop",
    itemId: "item_heal_all_5",
    amount: 1,
  });
  assert.equal(outsiderBuy.ok, false);
  assert.equal(outsiderBuy.code, "shop_family_manor_required");
});

test("occupied manor wars can open a battle room and settle ownership", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const defender = service.register({"username": "manordef", "password": "test1234", "displayName": "守方族长"});
  const challenger = service.register({"username": "manoratt", "password": "test1234", "displayName": "挑战族长"});
  assert.equal(defender.ok, true);
  assert.equal(challenger.ok, true);
  const defenderProfile = battleProfile("守方族长", {
    level: 32,
    hp: 340,
    maxHp: 340,
    attack: 70,
    defense: 42,
    quick: 96,
  }, {
    petId: "defender_pet",
    name: "守宠",
    level: 28,
    hp: 250,
    maxHp: 250,
    attack: 58,
    defense: 34,
    quick: 76,
  });
  defenderProfile.stoneCoins = 1000;
  const challengerProfile = battleProfile("挑战族长", {
    level: 38,
    hp: 420,
    maxHp: 420,
    attack: 92,
    defense: 48,
    quick: 110,
  }, {
    petId: "challenger_pet",
    name: "攻宠",
    level: 34,
    hp: 310,
    maxHp: 310,
    attack: 78,
    defense: 38,
    quick: 86,
  });
  challengerProfile.stoneCoins = 1000;
  assert.equal(service.saveProfile(defender.session.token, {profile: defenderProfile}).ok, true);
  assert.equal(service.saveProfile(challenger.session.token, {profile: challengerProfile}).ok, true);

  const defenderFamily = service.createFamily(defender.session.token, {"name": "守庄盟"});
  assert.equal(defenderFamily.ok, true);
  const firstWar = service.challengeManor(defender.session.token, {"manorId": "firebud_manor"});
  assert.equal(firstWar.ok, true);
  const firstBattle = service.resolveManorWar(defender.session.token, {"warId": firstWar.war.warId});
  assert.equal(firstBattle.ok, true);
  assert.equal(firstBattle.manor.ownerFamilyName, "守庄盟");

  const challengerFamily = service.createFamily(challenger.session.token, {"name": "攻庄盟"});
  assert.equal(challengerFamily.ok, true);
  const declared = service.challengeManor(challenger.session.token, {"manorId": "firebud_manor"});
  assert.equal(declared.ok, true);
  assert.equal(declared.war.defenderFamilyName, "守庄盟");
  assert.equal(declared.war.canStartBattleRoomByViewerFamily, false);
  const defenderEntered = service.enterManorWar(defender.session.token, {"warId": declared.war.warId});
  assert.equal(defenderEntered.ok, true);
  assert.equal(defenderEntered.war.defenderParticipantCount, 1);

  const roomReady = service.startManorWarBattleRoom(challenger.session.token, {"warId": declared.war.warId});
  assert.equal(roomReady.ok, true);
  assert.equal(roomReady.room.mode, "manor_war");
  assert.equal(roomReady.room.participantAccountIds.length, 2);
  assert.equal(roomReady.room.entry.manorWar.warId, declared.war.warId);
  assert.equal(roomReady.war.battleRoomId, roomReady.room.roomId);
  assert.equal(new Set(roomReady.room.battle.actors.map((actor) => actor.actorId)).size, roomReady.room.battle.actors.length);
  assert.equal(roomReady.room.battle.actors.some((actor) => actor.side === "challenger"), true);
  assert.equal(roomReady.room.battle.actors.some((actor) => actor.side === "opponent"), true);

  const directResolve = service.resolveManorWar(challenger.session.token, {"warId": declared.war.warId});
  assert.equal(directResolve.ok, false);
  assert.equal(directResolve.code, "manor_war_room_active");

  const closed = service.leaveBattleRoom(defender.session.token, roomReady.room.roomId);
  assert.equal(closed.ok, true);
  assert.equal(closed.room.status, "closed");
  assert.equal(closed.result.reason, "forfeit");
  assert.equal(closed.result.winnerFamilyId, challengerFamily.family.familyId);
  assert.notEqual(closed.result.manorBattleId, "");

  const after = service.listManors(challenger.session.token);
  assert.equal(after.ok, true);
  const firebud = after.manors.find((manor) => manor.manorId === "firebud_manor");
  assert.equal(firebud.ownerFamilyName, "攻庄盟");
  assert.equal(firebud.isOwnedByViewerFamily, true);
});

test("HTTP exposes family and manor endpoints", async (t) => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const server = createHttpServer({service, logger: false});
  t.after(() => server.close());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const registered = await fetchJson(`${base}/auth/register`, {
    method: "POST",
    body: JSON.stringify({"username": "httpmanor", "password": "test1234", "displayName": "接口族长"}),
  });
  assert.equal(registered.ok, true);
  const headers = {"authorization": `Bearer ${registered.session.token}`};
  const created = await fetchJson(`${base}/families/create`, {
    method: "POST",
    headers,
    body: JSON.stringify({"name": "接口家族"}),
  });
  assert.equal(created.ok, true);
  assert.equal(created.family.name, "接口家族");

  const state = await fetchJson(`${base}/families/state`, {headers});
  assert.equal(state.ok, true);
  assert.equal(state.family.name, "接口家族");

  const manors = await fetchJson(`${base}/manors`, {headers});
  assert.equal(manors.ok, true);
  assert.equal(manors.manors.length, 9);

  const challenged = await fetchJson(`${base}/manors/challenge`, {
    method: "POST",
    headers,
    body: JSON.stringify({"manorId": "firebud_manor"}),
  });
  assert.equal(challenged.ok, true);
  assert.equal(challenged.war.status, "scheduled");
  assert.equal(challenged.war.challengerParticipantCount, 1);

  const neutralRoom = await fetchJson(`${base}/manors/battle-room`, {
    method: "POST",
    headers,
    body: JSON.stringify({"warId": challenged.war.warId}),
  });
  assert.equal(neutralRoom.ok, false);
  assert.equal(neutralRoom.code, "manor_war_defender_missing");

  const entered = await fetchJson(`${base}/manors/enter`, {
    method: "POST",
    headers,
    body: JSON.stringify({"warId": challenged.war.warId}),
  });
  assert.equal(entered.ok, true);
  assert.equal(entered.war.viewerParticipantSide, "challenger");

  const resolved = await fetchJson(`${base}/manors/resolve`, {
    method: "POST",
    headers,
    body: JSON.stringify({"warId": challenged.war.warId}),
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.war.status, "resolved");
});
