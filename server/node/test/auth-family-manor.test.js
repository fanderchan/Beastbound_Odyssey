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
