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

test("quest record endpoint advances and auto-claims talk quests server-side", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const player = service.register({"username": "questrecorda", "password": "test1234", "displayName": "任务记录"});
  assert.equal(player.ok, true);
  const profile = battleProfile("任务记录", {"level": 1, "hp": 120, "maxHp": 120}, null);
  profile.stoneCoins = 0;
  profile.backpackSlots = [];
  profile.activeQuestId = "quest_intro_talk";
  profile.questStates = {"quest_intro_talk": {"questId": "quest_intro_talk", "status": "active", "progress": 0}};
  assert.equal(service.saveProfile(player.session.token, {"expectedRevision": 0, profile}).ok, true);
  assert.equal(service.updatePlayerPosition(player.session.token, {"mapId": "firebud_training_yard", "cellX": 5, "cellY": 11}).ok, true);

  const recorded = service.questRecord(player.session.token, {
    "event": {"type": "talk", "targetId": "trainer"},
  });
  assert.equal(recorded.ok, true);
  assert.equal(recorded.profileSummary.profileRevision, 2);
  assert.equal(recorded.progress.questId, "quest_intro_talk");
  assert.equal(recorded.progress.ready, true);
  assert.equal(recorded.profile.questStates.quest_intro_talk.status, "claimed");
  assert.equal(recorded.profile.activeQuestId, "quest_bank_intro");
  assert.equal(recorded.profile.stoneCoins, 20);
  assert.equal(profileItemCount(recorded.profile, "item_meat_small"), 2);
  assert.equal(recorded.questMessages.some((message) => String(message).includes("认识训练师")), true);
});

test("quest record recovers missing active main quest before auto-claiming", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const player = service.register({"username": "questmissingactive", "password": "test1234", "displayName": "空任务记录"});
  assert.equal(player.ok, true);
  const profile = battleProfile("空任务记录", {"level": 1, "hp": 120, "maxHp": 120}, null);
  profile.stoneCoins = 0;
  profile.backpackSlots = [];
  profile.activeQuestId = "";
  profile.questStates = {};
  assert.equal(service.saveProfile(player.session.token, {"expectedRevision": 0, profile}).ok, true);
  assert.equal(service.updatePlayerPosition(player.session.token, {"mapId": "firebud_training_yard", "cellX": 5, "cellY": 11}).ok, true);

  const recorded = service.questRecord(player.session.token, {
    "event": {"type": "talk", "targetId": "trainer"},
  });
  assert.equal(recorded.ok, true);
  assert.equal(recorded.progress.questId, "quest_intro_talk");
  assert.equal(recorded.profile.questStates.quest_intro_talk.status, "claimed");
  assert.equal(recorded.profile.questStates.quest_bank_intro.status, "active");
  assert.equal(recorded.profile.activeQuestId, "quest_bank_intro");
  assert.equal(recorded.profile.stoneCoins, 20);
  assert.equal(profileItemCount(recorded.profile, "item_meat_small"), 2);
});

test("quest record rejects client-reported settlement events and out-of-range talk", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const player = service.register({"username": "questguarda", "password": "test1234", "displayName": "任务防线"});
  assert.equal(player.ok, true);
  const profile = battleProfile("任务防线", {"level": 3, "hp": 120, "maxHp": 120}, null);
  profile.backpackSlots = [];
  profile.activeQuestId = "quest_first_victory";
  profile.questStates = {"quest_first_victory": {"questId": "quest_first_victory", "status": "active", "progress": 0}};
  assert.equal(service.saveProfile(player.session.token, {"expectedRevision": 0, profile}).ok, true);

  for (const forged of [
    {"type": "battle_victory", "encounterGroupId": "firebud_grass_01"},
    {"type": "defeat_npc", "encounterGroupId": "firebud_grass_01", "targetId": "village_guard"},
    {"type": "capture_pet", "lineId": "wuli", "formId": "wuli_normal_orange_fire10", "amount": 1},
    {"type": "use_spirit", "spiritId": "spirit_poison_1", "eventType": "spirit_poison"},
    {"type": "buy_item", "shopId": "firebud_general", "itemId": "item_meat_small", "amount": 1},
    {"type": "use_world_item", "itemId": "item_meat_small", "targetType": "pet", "amount": 1},
    {"type": "equip_item", "itemId": "weapon_wood_axe_1", "slot": "weapon", "amount": 1},
  ]) {
    const rejected = service.questRecord(player.session.token, {"event": forged});
    assert.equal(rejected.ok, false, `event ${forged.type} should be rejected`);
    assert.equal(rejected.code, "quest_event_not_client_reportable");
  }

  const noPosition = service.questRecord(player.session.token, {"event": {"type": "talk", "targetId": "trainer"}});
  assert.equal(noPosition.ok, false);
  assert.equal(noPosition.code, "movement_position_missing");

  const unknownNpc = service.questRecord(player.session.token, {"event": {"type": "talk", "targetId": "npc_never_exists"}});
  assert.equal(unknownNpc.ok, false);
  assert.equal(unknownNpc.code, "quest_talk_target_invalid");

  assert.equal(service.updatePlayerPosition(player.session.token, {"mapId": "firebud_training_yard", "cellX": 14, "cellY": 12}).ok, true);
  const tooFar = service.questRecord(player.session.token, {"event": {"type": "talk", "targetId": "trainer"}});
  assert.equal(tooFar.ok, false);
  assert.equal(tooFar.code, "quest_talk_too_far");

  const untouched = service.getProfile(player.session.token);
  assert.equal(untouched.ok, true);
  assert.equal(untouched.profile.questStates.quest_first_victory.status, "active");
  assert.equal(untouched.profile.questStates.quest_first_victory.progress, 0);

  const qaService = createAuthService({"store": createMemoryAuthStore(), "allowPositionTeleport": true});
  const qaPlayer = qaService.register({"username": "questguardqa", "password": "test1234", "displayName": "任务防线QA"});
  assert.equal(qaPlayer.ok, true);
  const qaProfile = battleProfile("任务防线QA", {"level": 1, "hp": 120, "maxHp": 120}, null);
  qaProfile.backpackSlots = [];
  qaProfile.activeQuestId = "quest_intro_talk";
  qaProfile.questStates = {"quest_intro_talk": {"questId": "quest_intro_talk", "status": "active", "progress": 0}};
  assert.equal(qaService.saveProfile(qaPlayer.session.token, {"expectedRevision": 0, "profile": qaProfile}).ok, true);
  const qaTalk = qaService.questRecord(qaPlayer.session.token, {"event": {"type": "talk", "targetId": "trainer"}});
  assert.equal(qaTalk.ok, true);
  const qaForged = qaService.questRecord(qaPlayer.session.token, {"event": {"type": "battle_victory", "encounterGroupId": "firebud_grass_01"}});
  assert.equal(qaForged.ok, false);
  assert.equal(qaForged.code, "quest_event_not_client_reportable");
});

test("world item use profile action advances use item quests server-side", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const player = service.register({"username": "questusemeat", "password": "test1234", "displayName": "任务用肉"});
  assert.equal(player.ok, true);
  const profile = battleProfile("任务用肉", {"level": 2, "hp": 120, "maxHp": 120}, {"petId": "pet_meat_quest", "hp": 1, "maxHp": 90});
  profile.stoneCoins = 0;
  profile.backpackSlots = [{"itemId": "item_meat_small", "count": 1}];
  profile.activeQuestId = "quest_use_meat";
  profile.questStates = {"quest_use_meat": {"questId": "quest_use_meat", "status": "active", "progress": 0}};
  assert.equal(service.saveProfile(player.session.token, {"expectedRevision": 0, profile}).ok, true);

  const used = service.profileAction(player.session.token, {
    "action": "world_item_use",
    "payload": {"itemId": "item_meat_small", "instanceId": "pet_meat_quest"},
  });
  assert.equal(used.ok, true);
  assert.equal(used.profile.questStates.quest_use_meat.status, "claimed");
  assert.equal(used.profile.activeQuestId, "quest_buy_weapon");
  assert.equal(used.profile.stoneCoins, 15);
  assert.equal(used.questMessages.length > 0, true);
  assert.equal(used.logLines.some((line) => String(line).includes("给宠物喂肉")), true);
});

test("quest claim endpoint requires reward choice and grants selected rewards server-side", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const player = service.register({"username": "questclaima", "password": "test1234", "displayName": "任务领取"});
  assert.equal(player.ok, true);
  const profile = battleProfile("任务领取", {"level": 5, "hp": 130, "maxHp": 130}, null);
  profile.stoneCoins = 3;
  profile.backpackSlots = [];
  profile.activeQuestId = "quest_capture_wuli";
  profile.questStates = {"quest_capture_wuli": {"questId": "quest_capture_wuli", "status": "ready", "progress": 1}};
  assert.equal(service.saveProfile(player.session.token, {"expectedRevision": 0, profile}).ok, true);

  const missingChoice = service.questClaim(player.session.token, {"questId": "quest_capture_wuli"});
  assert.equal(missingChoice.ok, false);
  assert.equal(missingChoice.code, "quest_reward_choice_required");
  assert.equal(missingChoice.requiresChoice, true);

  const claimed = service.questClaim(player.session.token, {
    "questId": "quest_capture_wuli",
    "rewardChoiceId": "rope_pack",
  });
  assert.equal(claimed.ok, true);
  assert.equal(claimed.profileSummary.profileRevision, 2);
  assert.equal(claimed.claim.questId, "quest_capture_wuli");
  assert.equal(claimed.claim.rewardChoiceId, "rope_pack");
  assert.equal(claimed.claim.rewards.stoneCoins, 60);
  assert.equal(claimed.profile.stoneCoins, 63);
  assert.equal(profileItemCount(claimed.profile, "capture_rope_basic"), 4);
  assert.equal(claimed.profile.captureTools.capture_rope_basic, 4);
  assert.equal(claimed.profile.questStates.quest_capture_wuli.status, "claimed");
  assert.equal(claimed.profile.activeQuestId, "quest_rebirth_1_guidance");
});

test("party pve capture advances capture quest and stops hang capture target", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const solo = service.register({"username": "pvequestcap", "password": "test1234", "displayName": "捕捉任务"});
  assert.equal(solo.ok, true);
  const profile = battleProfile("捕捉任务", {
    "level": 5,
    "hp": 120,
    "maxHp": 120,
    "attack": 18,
    "defense": 8,
    "quick": 90,
  });
  profile.backpackSlots = [{"itemId": "capture_net", "count": 1}];
  profile.captureTools = {"capture_net": 1};
  profile.activeQuestId = "quest_capture_wuli";
  profile.questStates = {"quest_capture_wuli": {"questId": "quest_capture_wuli", "status": "active", "progress": 0}};
  profile.hangSettings = {"captureTargetCount": 1};
  profile.hangSession = {"enabled": true, "mode": "encounter_stone", "battleCount": 1, "captureSuccessCount": 0};
  assert.equal(service.saveProfile(solo.session.token, {"expectedRevision": 0, "profile": profile}).ok, true);

  const encounter = service.startPartyEncounter(solo.session.token, {
    "enemyCount": 1,
    "encounterZone": {
      "id": "capture_quest_grass",
      "name": "捕捉任务草丛",
      "encounterGroupId": "firebud_grass_01",
      "formationTemplate": "10v10",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "任务乌力",
        "level": 3,
        "catchable": true,
        "captureDifficulty": 1,
        "captureChanceOverride": 1,
        "battleStats": {"maxHp": 80, "attack": 1, "defense": 1, "quick": 10},
      },
    },
  });
  assert.equal(encounter.ok, true);
  const player = encounter.room.battle.actors.find((actor) => actor.accountId === solo.account.accountId && actor.kind === "player");
  const enemy = encounter.room.battle.actors.find((actor) => actor.side === "enemy");
  assert.equal(Boolean(player && enemy), true);
  const resolved = service.submitBattleCommand(solo.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": player.actorId,
    "actionId": "capture",
    "targetActorId": enemy.actorId,
    "captureToolId": "capture_net",
  });
  assert.equal(resolved.ok, true);
  const writeback = resolved.room.battle.profileWriteback.profiles.find((entry) => entry.accountId === solo.account.accountId);
  assert.equal(writeback.capturedPets[0].lineId, "wuli");
  assert.equal(writeback.quests.events.some((entry) => entry.questId === "quest_capture_wuli" && entry.ready === true), true);
  assert.equal(writeback.quests.claimed.length, 0);
  assert.equal(writeback.hang.captureSuccessCount, 1);
  assert.equal(writeback.hang.enabled, false);
  assert.equal(writeback.hang.lastStopReason, "capture_target");

  const after = service.getProfile(solo.session.token);
  assert.equal(after.ok, true);
  assert.equal(after.profile.questStates.quest_capture_wuli.status, "ready");
  assert.equal(after.profile.questStates.quest_capture_wuli.progress, 1);
  assert.equal(after.profile.activeQuestId, "quest_capture_wuli");
  assert.equal(after.profile.hangSession.enabled, false);
  assert.equal(after.profile.hangSession.battleCount, 2);
  assert.equal(after.profile.hangSession.captureSuccessCount, 1);
  assert.equal(after.profile.hangSession.lastStopReason, "capture_target");
});

test("party pve victory stops hang when player remains below low hp threshold", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const player = service.register({"username": "hanglowhpone", "password": "test1234", "displayName": "低血挂机"});
  assert.equal(player.ok, true);
  const profile = battleProfile("低血挂机", {
    "level": 8,
    "hp": 40,
    "maxHp": 120,
    "attack": 999,
    "defense": 20,
    "quick": 200,
    "comboRateOverride": 0,
  }, null);
  profile.backpackSlots = [];
  profile.hangSettings = {"lowHpStopPercent": 50, "lowHpAction": "town_heal", "resumeAfterHeal": true, "captureTargetCount": 0};
  profile.hangSession = {"enabled": true, "mode": "walk", "battleCount": 2, "captureSuccessCount": 0};
  assert.equal(service.saveProfile(player.session.token, {"expectedRevision": 0, "profile": profile}).ok, true);

  const encounter = service.startPartyEncounter(player.session.token, {
    "enemyCount": 1,
    "encounterZone": {
      "id": "low_hp_grass",
      "name": "低血草丛",
      "encounterGroupId": "firebud_grass_01",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "低血乌力",
        "level": 1,
        "battleStats": {"maxHp": 1, "attack": 1, "defense": 1, "quick": 1},
      },
    },
  });
  assert.equal(encounter.ok, true);
  const playerActor = encounter.room.battle.actors.find((actor) => actor.accountId === player.account.accountId && actor.kind === "player");
  const enemy = encounter.room.battle.actors.find((actor) => actor.side === "enemy");
  const resolved = service.submitBattleCommand(player.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": playerActor.actorId,
    "actionId": "attack",
    "targetActorId": enemy.actorId,
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.room.status, "closed");
  const writeback = resolved.room.battle.profileWriteback.profiles.find((entry) => entry.accountId === player.account.accountId);
  assert.equal(writeback.hang.enabled, false);
  assert.equal(writeback.hang.lastStopReason, "low_hp");
  assert.equal(writeback.hang.pendingResume, true);
  assert.equal(writeback.hang.battleCount, 3);

  const after = service.getProfile(player.session.token);
  assert.equal(after.profile.hangSession.enabled, false);
  assert.equal(after.profile.hangSession.lastStopReason, "low_hp");
  assert.equal(after.profile.hangSession.pendingResume, true);
});

test("party pve spirit event advances battle quest chain from server event log", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const solo = service.register({"username": "pvequestspirit", "password": "test1234", "displayName": "精灵任务"});
  assert.equal(solo.ok, true);
  const profile = battleProfile("精灵任务", {
    "level": 8,
    "hp": 140,
    "maxHp": 140,
    "attack": 20,
    "defense": 20,
    "quick": 200,
    "comboRateOverride": 0,
  });
  profile.stoneCoins = 13;
  profile.backpackSlots = [];
  profile.equipmentSlots = {"body": "armor_toxin_wrap"};
  profile.equipmentDurability = {"body": 30};
  profile.activeQuestId = "quest_use_poison_spirit";
  profile.questStates = {
    "quest_first_victory": {"questId": "quest_first_victory", "status": "claimed", "progress": 1},
    "quest_training_partner_intro": {"questId": "quest_training_partner_intro", "status": "claimed", "progress": 1},
    "quest_use_poison_spirit": {"questId": "quest_use_poison_spirit", "status": "active", "progress": 0},
  };
  assert.equal(service.saveProfile(solo.session.token, {"expectedRevision": 0, "profile": profile}).ok, true);

  const encounter = service.startPartyEncounter(solo.session.token, {
    "enemyCount": 1,
    "encounterZone": {
      "id": "spirit_quest_grass",
      "name": "精灵任务草丛",
      "encounterGroupId": "firebud_grass_01",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "精灵乌力",
        "level": 1,
        "battleStats": {"maxHp": 1, "attack": 1, "defense": 1, "quick": 1},
      },
    },
  });
  assert.equal(encounter.ok, true);
  const player = encounter.room.battle.actors.find((actor) => actor.accountId === solo.account.accountId && actor.kind === "player");
  const enemy = encounter.room.battle.actors.find((actor) => actor.side === "enemy");
  assert.equal(Boolean(player && enemy), true);
  assert.equal(player.spiritIds.includes("spirit_poison_1"), true);
  const resolved = service.submitBattleCommand(solo.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": player.actorId,
    "actionId": "spirit_poison_1",
    "targetActorId": enemy.actorId,
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.room.status, "closed");
  const writeback = resolved.room.battle.profileWriteback.profiles.find((entry) => entry.accountId === solo.account.accountId);
  assert.equal(writeback.quests.claimed.some((entry) => entry.questId === "quest_use_poison_spirit"), true);
  assert.equal(writeback.quests.claimed.some((entry) => entry.questId === "quest_first_victory"), false);
  assert.equal(writeback.quests.activeQuestId, "quest_capture_wuli");

  const after = service.getProfile(solo.session.token);
  assert.equal(after.ok, true);
  assert.equal(after.profile.questStates.quest_use_poison_spirit.status, "claimed");
  assert.equal(after.profile.questStates.quest_first_victory.status, "claimed");
  assert.equal(after.profile.questStates.quest_training_partner_intro.status, "claimed");
  assert.equal(after.profile.activeQuestId, "quest_capture_wuli");
  assert.equal(after.profile.stoneCoins, 13 + writeback.rewards.stoneCoins + 20);
  const blessedClubCount = (after.profile.backpackSlots || []).reduce((sum, slot) => (
    sum + (slot && slot.itemId === "weapon_blessed_club" ? Number(slot.count || 0) : 0)
  ), 0);
  assert.equal(blessedClubCount, 1);
});
