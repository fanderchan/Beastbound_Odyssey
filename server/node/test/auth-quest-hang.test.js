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
  internalProfileForAccount,
  isValidPetPrivateSeed,
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
const {loadPetEncounterCatalog} = require("../src/auth/pet-encounter-authority");
const {createPetEncounterPermitAuthority} = require("../src/auth/pet-encounter-permit-authority");

test("quest catalog gives every formal quest explicit pickup and recommended levels", () => {
  const questCatalog = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../client/godot/data/quests.json"), "utf8"));
  assert.equal(Array.isArray(questCatalog.quests), true);
  assert.equal(questCatalog.quests.length, 44);
  assert.equal(questCatalog.quests.every((quest) => Object.hasOwn(quest, "requiredLevel")), true);
  assert.equal(questCatalog.quests.every((quest) => Object.hasOwn(quest, "recommendedLevel")), true);
  assert.equal(questCatalog.quests.filter((quest) => Number(quest.requiredLevel) === 1).length, 38);
  assert.deepEqual(
    questCatalog.quests
      .filter((quest) => Number(quest.requiredLevel) === 80 && Number(quest.recommendedLevel) === 100)
      .map((quest) => quest.id),
    [
      "quest_rebirth_1_guidance",
      "quest_rebirth_2_guidance",
      "quest_rebirth_3_guidance",
      "quest_rebirth_4_guidance",
      "quest_rebirth_5_guidance",
      "quest_rebirth_6_guidance",
    ],
  );
});

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
  assert.equal(recorded.profile.activeQuestId, "quest_open_task_panel");
  assert.equal(recorded.profile.stoneCoins, 20);
  assert.equal(profileItemCount(recorded.profile, "item_meat_small"), 2);
  assert.equal(recorded.questMessages.some((message) => String(message).includes("[1] 认识训练师")), true);
});

test("quest pickup level does not block an already accepted quest after level drops", () => {
  const service = createAuthService({"store": createMemoryAuthStore(), "allowPositionTeleport": true});
  const acceptedPlayer = service.register({"username": "questlevelaccepted", "password": "test1234", "displayName": "已接等级任务"});
  assert.equal(acceptedPlayer.ok, true);
  const acceptedProfile = battleProfile("已接等级任务", {"level": 80, "hp": 120, "maxHp": 120}, null);
  acceptedProfile.activeQuestId = "quest_rebirth_1_guidance";
  acceptedProfile.questStates = {
    "quest_rebirth_1_guidance": {"questId": "quest_rebirth_1_guidance", "status": "active", "progress": 0},
  };
  assert.equal(service.saveProfile(acceptedPlayer.session.token, {"expectedRevision": 0, "profile": acceptedProfile}).ok, true);
  const loweredProfile = service.getProfile(acceptedPlayer.session.token).profile;
  loweredProfile.player.level = 1;
  assert.equal(service.saveProfile(acceptedPlayer.session.token, {"expectedRevision": 1, "profile": loweredProfile}).ok, true);

  const completed = service.questRecord(acceptedPlayer.session.token, {
    "questId": "quest_rebirth_1_guidance",
    "event": {"type": "talk", "targetId": "firebud_rebirth_mentor"},
  });
  assert.equal(completed.ok, true);
  assert.equal(completed.profile.player.level, 1);
  assert.equal(completed.profile.questStates.quest_rebirth_1_guidance.status, "claimed");
  assert.equal(completed.profile.activeQuestId, "");
  assert.equal(completed.questMessages.some((message) => String(message).includes("[80] 一转资格")), true);

  const blockedPlayer = service.register({"username": "questlevelblocked", "password": "test1234", "displayName": "未接等级任务"});
  assert.equal(blockedPlayer.ok, true);
  const blockedProfile = battleProfile("未接等级任务", {"level": 1, "hp": 120, "maxHp": 120}, null);
  blockedProfile.activeQuestId = "";
  blockedProfile.questStates = {};
  assert.equal(service.saveProfile(blockedPlayer.session.token, {"expectedRevision": 0, "profile": blockedProfile}).ok, true);
  const rejected = service.questRecord(blockedPlayer.session.token, {
    "questId": "quest_rebirth_1_guidance",
    "event": {"type": "talk", "targetId": "firebud_rebirth_mentor"},
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "quest_unavailable");
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
  assert.equal(recorded.profile.questStates.quest_open_task_panel.status, "active");
  assert.equal(recorded.profile.activeQuestId, "quest_open_task_panel");
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
    {"type": "battle_pet", "instanceId": "pet_four_spirit", "ridePetInstanceId": "pet_tiger", "formId": "rebirth_starter_four_spirit_cub"},
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

test("bottom-bar tutorial feature intent is allowlisted and advances only the matching quest", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const player = service.register({"username": "featuretutorial", "password": "test1234", "displayName": "功能教学"});
  const profile = battleProfile("功能教学", {"level": 1, "hp": 120, "maxHp": 120}, null);
  profile.stoneCoins = 0;
  profile.activeQuestId = "quest_open_task_panel";
  profile.questStates = {"quest_open_task_panel": {"questId": "quest_open_task_panel", "status": "active", "progress": 0}};
  assert.equal(service.saveProfile(player.session.token, {"expectedRevision": 0, profile}).ok, true);

  const unrelated = service.questRecord(player.session.token, {"event": {"type": "open_feature", "featureId": "map"}});
  assert.equal(unrelated.ok, false);
  assert.equal(unrelated.code, "quest_feature_not_expected");

  const invalid = service.questRecord(player.session.token, {"event": {"type": "open_feature", "featureId": "gm_tools"}});
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "quest_feature_invalid");

  const opened = service.questRecord(player.session.token, {"event": {"type": "open_feature", "featureId": "quest"}});
  assert.equal(opened.ok, true);
  assert.equal(opened.profile.questStates.quest_open_task_panel.status, "claimed");
  assert.equal(opened.profile.activeQuestId, "quest_open_map_panel");
  assert.equal(opened.profile.stoneCoins, 5);
});

test("starting a real hang session completes the hang tutorial server-side", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const player = service.register({"username": "hangtutorial", "password": "test1234", "displayName": "挂机教学"});
  const profile = battleProfile("挂机教学", {"level": 2, "hp": 120, "maxHp": 120}, null);
  profile.stoneCoins = 0;
  profile.activeQuestId = "quest_start_hang";
  profile.questStates = {"quest_start_hang": {"questId": "quest_start_hang", "status": "active", "progress": 0}};
  assert.equal(service.saveProfile(player.session.token, {"expectedRevision": 0, profile}).ok, true);

  const started = service.startHangSession(player.session.token, {"mode": "walk", "mapId": "firebud_training_yard", "cellX": 5, "cellY": 11});
  assert.equal(started.ok, true);
  assert.equal(started.hang.enabled, true);
  assert.equal(started.profile.questStates.quest_start_hang.status, "claimed");
  assert.equal(started.profile.activeQuestId, "quest_market_sell_player");
  assert.equal(started.questMessages.length > 0, true);
});

test("online walk hang uses the formal high-level route and settles authoritative EXP and rewards", () => {
  const catalog = loadPetEncounterCatalog();
  const service = createAuthService({
    store: createMemoryAuthStore(),
    now: () => Date.parse("2026-07-11T00:00:00.000Z"),
    allowPositionTeleport: true,
    useStrictPetEncounterAuthority: true,
    petEncounterPermitAuthority: createPetEncounterPermitAuthority({
      catalog,
      randomBytes: (size) => crypto.randomBytes(size),
      randomFloat: () => 0,
      eligibleStepIntervalMs: 0,
    }),
  });
  const player = service.register({username: "hangformalroute", password: "test1234", displayName: "正式路线挂机"});
  const profile = battleProfile("正式路线挂机", {
    level: 70, hp: 4000, maxHp: 4000, attack: 999, defense: 999, quick: 400, comboRateOverride: 0,
  }, {
    petId: "hang_route_pet",
    name: "挂机路线宠",
    level: 70,
    hp: 1800,
    maxHp: 1800,
    attack: 1,
    defense: 200,
    quick: 200,
    comboRateOverride: 0,
  });
  profile.stoneCoins = 0;
  profile.backpackSlots = [];
  assert.equal(service.saveProfile(player.session.token, {expectedRevision: 0, profile}).ok, true);
  assert.equal(service.updatePlayerPosition(player.session.token, {
    mapId: "earth_vein_cave", cellX: 6, cellY: 8, moving: false,
  }).ok, true);
  const started = service.startHangSession(player.session.token, {
    mode: "walk", mapId: "earth_vein_cave", cellX: 6, cellY: 8,
  });
  assert.equal(started.ok, true);
  assert.equal(started.hang.enabled, true);
  let permit = null;
  for (const [fromCellX, toCellX] of [[6, 7], [7, 8], [8, 9]]) {
    const moved = service.movePlayerStep(player.session.token, {
      mapId: "earth_vein_cave",
      fromCellX,
      fromCellY: 8,
      toCellX,
      toCellY: 8,
      moving: true,
    });
    assert.equal(moved.ok, true);
    permit = moved.encounterPermit || permit;
  }
  assert.equal(typeof permit.token, "string");
  const encounter = service.startPartyEncounter(player.session.token, {
    encounterPermitToken: permit.token,
    encounterIntent: {zoneId: "earth_vein_training_65_80", encounterGroupId: "rebirth_prep_training_01"},
  });
  assert.equal(encounter.ok, true);
  const internalRoom = service.snapshot().battleRooms[encounter.room.roomId];
  assert.equal(internalRoom.encounter.rewardTableId, "rebirth_prep_training_01");
  const playerActor = encounter.room.battle.actors.find((actor) => actor.accountId === player.account.accountId && actor.kind === "player");
  const petActor = encounter.room.battle.actors.find((actor) => actor.accountId === player.account.accountId && actor.kind === "pet");
  const enemy = encounter.room.battle.actors.find((actor) => actor.side === "enemy");
  let resolved = null;
  for (let round = 1; round <= 100; round += 1) {
    const playerCommand = service.submitBattleCommand(player.session.token, encounter.room.roomId, {
      round, actorId: playerActor.actorId, actionId: "attack", targetActorId: enemy.actorId,
    });
    assert.equal(playerCommand.ok, true);
    if (playerCommand.room.status === "closed") {
      resolved = playerCommand;
      break;
    }
    const petCommand = service.submitBattleCommand(player.session.token, encounter.room.roomId, {
      round, actorId: petActor.actorId, actionId: "pet_attack", targetActorId: enemy.actorId,
    });
    assert.equal(petCommand.ok, true);
    resolved = petCommand;
    if (petCommand.room.status === "closed") {
      break;
    }
  }
  assert.equal(resolved.room.status, "closed");
  const writeback = resolved.room.battle.profileWriteback.profiles.find((entry) => entry.accountId === player.account.accountId);
  assert.equal(writeback.rewards.tableId, "rebirth_prep_training_01");
  const playerExp = writeback.exp.player.amount;
  const petExp = writeback.exp.pets[0].amount;
  assert.equal(playerExp + petExp > 0, true);
  assert.equal((playerExp > 0) !== (petExp > 0), true);
  assert.equal(writeback.hang.enabled, true);
  assert.equal(writeback.hang.battleCount, 1);
});

test("server-authoritative encounter stones bind origin, duration and one battle per interval", () => {
  let nowMs = Date.parse("2026-07-11T00:00:00.000Z");
  const store = createMemoryAuthStore();
  const service = createAuthService({
    store,
    now: () => nowMs,
    useStrictPetEncounterPermitAuthority: true,
  });
  const player = service.register({username: "timedstone", password: "test1234", displayName: "遇敌石计时号"});
  const profile = battleProfile("遇敌石计时号", {level: 5, hp: 120, maxHp: 120, attack: 18, defense: 8, quick: 70}, null);
  profile.backpackSlots = [{itemId: "encounter_stone_patrol", count: 1}];
  assert.equal(service.saveProfile(player.session.token, {expectedRevision: 0, profile}).ok, true);

  const missingPosition = service.startHangSession(player.session.token, {
    mode: "encounter_stone", itemId: "encounter_stone_patrol", mapId: "firebud_village_gate", cellX: 11, cellY: 15,
  });
  assert.equal(missingPosition.ok, false);
  assert.equal(missingPosition.code, "hang_position_missing");
  assert.equal(profileItemCount(service.getProfile(player.session.token).profile, "encounter_stone_patrol"), 1);

  assert.equal(service.updatePlayerPosition(player.session.token, {
    mapId: "firebud_village_gate", cellX: 10, cellY: 17, moving: false,
  }).ok, true);
  for (const [fromCellX, fromCellY, toCellX, toCellY] of [
    [10, 17, 11, 17], [11, 17, 11, 16], [11, 16, 11, 15],
  ]) {
    assert.equal(service.movePlayerStep(player.session.token, {
      mapId: "firebud_village_gate", fromCellX, fromCellY, toCellX, toCellY, moving: false,
    }).ok, true);
  }
  const forgedOrigin = service.startHangSession(player.session.token, {
    mode: "encounter_stone", itemId: "encounter_stone_patrol", mapId: "firebud_village_gate", cellX: 12, cellY: 15,
  });
  assert.equal(forgedOrigin.ok, false);
  assert.equal(forgedOrigin.code, "hang_position_mismatch");
  assert.equal(profileItemCount(service.getProfile(player.session.token).profile, "encounter_stone_patrol"), 1);

  const started = service.startHangSession(player.session.token, {
    mode: "encounter_stone", itemId: "encounter_stone_patrol", mapId: "firebud_village_gate", cellX: 11, cellY: 15,
  });
  assert.equal(started.ok, true);
  assert.equal(started.hang.encounterStoneItemId, "encounter_stone_patrol");
  assert.equal(started.hang.encounterIntervalMs, 2500);
  assert.equal(started.hang.encounterZoneId, "village_grass");
  assert.equal(Date.parse(started.hang.expiresAt) - Date.parse(started.hang.startedAt), 900_000);
  assert.equal(profileItemCount(started.profile, "encounter_stone_patrol"), 0);

  const request = {encounterIntent: {zoneId: "village_grass", encounterGroupId: "firebud_grass_01"}};
  const tooEarly = service.startPartyEncounter(player.session.token, request);
  assert.equal(tooEarly.ok, false);
  assert.equal(tooEarly.code, "encounter_stone_interval_pending");
  nowMs += 2500;
  const first = service.startPartyEncounter(player.session.token, request);
  assert.equal(first.ok, true);
  assert.equal(service.leaveBattleRoom(player.session.token, first.room.roomId).ok, true);
  const restarted = createAuthService({
    store,
    now: () => nowMs,
    useStrictPetEncounterPermitAuthority: true,
  });
  const relogged = restarted.login({username: "timedstone", password: "test1234"});
  assert.equal(relogged.ok, true);
  assert.equal(restarted.updatePlayerPosition(relogged.session.token, {
    mapId: "firebud_village_gate", cellX: 10, cellY: 17, moving: false,
  }).ok, true);
  for (const [fromCellX, fromCellY, toCellX, toCellY] of [
    [10, 17, 11, 17], [11, 17, 11, 16], [11, 16, 11, 15],
  ]) {
    assert.equal(restarted.movePlayerStep(relogged.session.token, {
      mapId: "firebud_village_gate", fromCellX, fromCellY, toCellX, toCellY, moving: false,
    }).ok, true);
  }
  const duplicate = restarted.startPartyEncounter(relogged.session.token, request);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.code, "encounter_stone_interval_pending");
  nowMs += 2500;
  const second = restarted.startPartyEncounter(relogged.session.token, request);
  assert.equal(second.ok, true);
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
  assert.equal(used.profile.activeQuestId, "quest_sell_to_shop");
  assert.equal(used.profile.stoneCoins, 15);
  assert.equal(profileItemCount(used.profile, "tutorial_worn_hide"), 2);
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
  assert.equal(claimed.profile.activeQuestId, "quest_open_codex_panel");
});

test("party pve capture advances capture quest and stops hang capture target", () => {
  const service = createAuthService({
    "store": createMemoryAuthStore(),
    "randomBytes": (size) => Buffer.alloc(size, 0x19),
  });
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
  profile.backpackSlots = [{"itemId": "capture_poison_wuli_net", "count": 1}];
  profile.captureTools = {"capture_poison_wuli_net": 1};
  profile.equipmentSlots = {"body": "armor_toxin_wrap"};
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
        "level": 1,
        "catchable": true,
        "captureDifficulty": 1,
        "captureChanceOverride": 1.0,
        "battleStats": {"maxHp": 80, "attack": 1, "defense": 1, "quick": 10},
      },
    },
  });
  assert.equal(encounter.ok, true);
  const player = encounter.room.battle.actors.find((actor) => actor.accountId === solo.account.accountId && actor.kind === "player");
  const enemy = encounter.room.battle.actors.find((actor) => actor.side === "enemy");
  assert.equal(Boolean(player && enemy), true);
  assert.equal(player.spiritIds.includes("spirit_poison_1"), true);
  const invalidUnpoisonedCapture = service.submitBattleCommand(solo.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": player.actorId,
    "actionId": "capture",
    "targetActorId": enemy.actorId,
    "captureToolId": "capture_poison_wuli_net",
  });
  assert.equal(invalidUnpoisonedCapture.ok, false);
  assert.equal(invalidUnpoisonedCapture.code, "battle_command_capture_invalid");
  assert.match(invalidUnpoisonedCapture.message, /中毒的乌力/);
  assert.equal(encounter.room.participants[0].teamSnapshot.captureToolBag.capture_poison_wuli_net, 1);
  const poisoned = service.submitBattleCommand(solo.session.token, encounter.room.roomId, {
    "round": 1,
    "actorId": player.actorId,
    "actionId": "spirit_poison_1",
    "targetActorId": enemy.actorId,
  });
  assert.equal(poisoned.ok, true);
  assert.equal(poisoned.room.status, "ready");
  const poisonSpiritEvent = poisoned.turn.events.find((event) => event.eventType === "spirit_poison" && event.statusId === "poison");
  assert.equal(Boolean(poisonSpiritEvent), true);
  assert.equal(poisonSpiritEvent.sourceActorId, poisonSpiritEvent.actorId);
  assert.equal(poisonSpiritEvent.statusChanges.find((change) => change.change === "apply").sourceId, poisonSpiritEvent.actorId);
  const resolved = service.submitBattleCommand(solo.session.token, encounter.room.roomId, {
    "round": 2,
    "actorId": player.actorId,
    "actionId": "capture",
    "targetActorId": enemy.actorId,
    "captureToolId": "capture_poison_wuli_net",
  });
  assert.equal(resolved.ok, true, JSON.stringify(resolved));
  const writeback = resolved.room.battle.profileWriteback.profiles.find((entry) => entry.accountId === solo.account.accountId);
  assert.equal(writeback.capturedPets[0].lineId, "wuli");
  assert.equal(writeback.capturedPets[0].captureToolId, "capture_poison_wuli_net");
  assert.equal(writeback.capturedPets[0].captureStatusIds.includes("poison"), true);
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
  const capturedPet = after.profile.petInstances.find((pet) => String(pet && pet.formId || "") === "wuli_normal_orange_fire10");
  assert.equal(Boolean(capturedPet), true);
  assert.equal(capturedPet.activeSkillIds.includes("pet_attack"), true);
  assert.equal(capturedPet.activeSkillIds.includes("pet_defend"), true);
  assert.deepEqual(capturedPet.petSkillSlots.slice(0, 2), ["pet_attack", "pet_defend"]);
  const internalCapturedPet = internalProfileForAccount(service, solo.account.accountId)
    .petInstances.find((pet) => pet.instanceId === capturedPet.instanceId);
  assert.equal(internalCapturedPet.growthSpeciesProfileId, "wuli_normal_orange_fire10_v1");
  assert.equal(isValidPetPrivateSeed(internalCapturedPet.petGrowth.private.privateSeed), true);
  assert.equal(Object.hasOwn(internalCapturedPet, "individualSeed"), false);
  const expectedLevelOneStats = {
    maxHp: internalCapturedPet.maxHp,
    attack: internalCapturedPet.attack,
    defense: internalCapturedPet.defense,
    quick: internalCapturedPet.quick,
  };
  assert.deepEqual(internalCapturedPet.initialStats, expectedLevelOneStats);
  assert.deepEqual(internalCapturedPet.growthSpeciesLevel1Stats, expectedLevelOneStats);
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
    "quest_buy_spirit_armor": {"questId": "quest_buy_spirit_armor", "status": "claimed", "progress": 1},
    "quest_equip_spirit_armor": {"questId": "quest_equip_spirit_armor", "status": "claimed", "progress": 1},
    "quest_use_moist_spirit": {"questId": "quest_use_moist_spirit", "status": "claimed", "progress": 1},
    "quest_buy_poison_spirit_armor": {"questId": "quest_buy_poison_spirit_armor", "status": "claimed", "progress": 1},
    "quest_equip_poison_spirit_armor": {"questId": "quest_equip_poison_spirit_armor", "status": "claimed", "progress": 1},
    "quest_training_partner_intro": {"questId": "quest_training_partner_intro", "status": "claimed", "progress": 1},
    "quest_group_brawl": {"questId": "quest_group_brawl", "status": "claimed", "progress": 1},
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
  assert.equal(after.profile.questStates.quest_buy_spirit_armor.status, "claimed");
  assert.equal(after.profile.questStates.quest_equip_spirit_armor.status, "claimed");
  assert.equal(after.profile.questStates.quest_use_moist_spirit.status, "claimed");
  assert.equal(after.profile.questStates.quest_buy_poison_spirit_armor.status, "claimed");
  assert.equal(after.profile.questStates.quest_equip_poison_spirit_armor.status, "claimed");
  assert.equal(after.profile.questStates.quest_training_partner_intro.status, "claimed");
  assert.equal(after.profile.questStates.quest_group_brawl.status, "claimed");
  assert.equal(after.profile.activeQuestId, "quest_capture_wuli");
  assert.equal(after.profile.stoneCoins, 13 + writeback.rewards.stoneCoins + 20);
  const blessedClubCount = (after.profile.backpackSlots || []).reduce((sum, slot) => (
    sum + (slot && slot.itemId === "weapon_blessed_club" ? Number(slot.count || 0) : 0)
  ), 0);
  assert.equal(blessedClubCount, 1);
  assert.equal(profileItemCount(after.profile, "capture_poison_wuli_net"), 1);
  assert.equal(after.profile.captureTools.capture_poison_wuli_net, 1);
});

test("group brawl quest requires an ally and a dangerous grass victory", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const solo = service.register({"username": "groupbrawlsolo", "password": "test1234", "displayName": "单人群殴"});
  assert.equal(solo.ok, true);
  const soloProfile = battleProfile("单人群殴", {
    "level": 8,
    "hp": 140,
    "maxHp": 140,
    "attack": 80,
    "defense": 20,
    "quick": 200,
    "comboRateOverride": 0,
  });
  soloProfile.activeQuestId = "quest_group_brawl";
  soloProfile.questStates = {
    "quest_training_partner_intro": {"questId": "quest_training_partner_intro", "status": "claimed", "progress": 1},
    "quest_group_brawl": {"questId": "quest_group_brawl", "status": "active", "progress": 0},
  };
  assert.equal(service.saveProfile(solo.session.token, {"expectedRevision": 0, "profile": soloProfile}).ok, true);
  const soloEncounter = service.startPartyEncounter(solo.session.token, {
    "enemyCount": 1,
    "encounterZone": {
      "id": "danger_grass",
      "name": "危险草丛",
      "encounterGroupId": "firebud_grass_danger",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "危险乌力",
        "level": 1,
        "battleStats": {"maxHp": 1, "attack": 1, "defense": 1, "quick": 1},
      },
    },
  });
  assert.equal(soloEncounter.ok, true);
  const soloPlayer = soloEncounter.room.battle.actors.find((actor) => actor.accountId === solo.account.accountId && actor.kind === "player");
  const soloEnemy = soloEncounter.room.battle.actors.find((actor) => actor.side === "enemy");
  const soloResolved = service.submitBattleCommand(solo.session.token, soloEncounter.room.roomId, {
    "round": 1,
    "actorId": soloPlayer.actorId,
    "actionId": "attack",
    "targetActorId": soloEnemy.actorId,
  });
  assert.equal(soloResolved.ok, true);
  const soloAfter = service.getProfile(solo.session.token);
  assert.equal(soloAfter.ok, true);
  assert.equal(soloAfter.profile.activeQuestId, "quest_group_brawl");
  assert.equal(soloAfter.profile.questStates.quest_group_brawl.status, "active");
  assert.equal(soloAfter.profile.questStates.quest_group_brawl.progress, 0);

  const grouped = service.register({"username": "groupbrawlally", "password": "test1234", "displayName": "群殴队伍"});
  assert.equal(grouped.ok, true);
  const groupedProfile = battleProfile("群殴队伍", {
    "level": 8,
    "hp": 140,
    "maxHp": 140,
    "attack": 80,
    "defense": 20,
    "quick": 200,
    "comboRateOverride": 0,
  });
  groupedProfile.stoneCoins = 5;
  groupedProfile.activeQuestId = "quest_group_brawl";
  groupedProfile.questStates = {
    "quest_training_partner_intro": {"questId": "quest_training_partner_intro", "status": "claimed", "progress": 1},
    "quest_group_brawl": {"questId": "quest_group_brawl", "status": "active", "progress": 0},
  };
  assert.equal(service.saveProfile(grouped.session.token, {"expectedRevision": 0, "profile": groupedProfile}).ok, true);
  const partnerSet = service.profileAction(grouped.session.token, {"action": "training_partner_set_count", "payload": {"count": 1}});
  assert.equal(partnerSet.ok, true);
  const groupedEncounter = service.startPartyEncounter(grouped.session.token, {
    "enemyCount": 1,
    "encounterZone": {
      "id": "danger_grass",
      "name": "危险草丛",
      "encounterGroupId": "firebud_grass_danger",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "危险乌力",
        "level": 1,
        "battleStats": {"maxHp": 1, "attack": 1, "defense": 1, "quick": 1},
      },
    },
  });
  assert.equal(groupedEncounter.ok, true);
  const groupedPlayer = groupedEncounter.room.battle.actors.find((actor) => actor.accountId === grouped.account.accountId && actor.kind === "player");
  const groupedEnemy = groupedEncounter.room.battle.actors.find((actor) => actor.side === "enemy");
  const groupedResolved = service.submitBattleCommand(grouped.session.token, groupedEncounter.room.roomId, {
    "round": 1,
    "actorId": groupedPlayer.actorId,
    "actionId": "attack",
    "targetActorId": groupedEnemy.actorId,
  });
  assert.equal(groupedResolved.ok, true);
  const writeback = groupedResolved.room.battle.profileWriteback.profiles.find((entry) => entry.accountId === grouped.account.accountId);
  assert.equal(writeback.quests.claimed.some((entry) => entry.questId === "quest_group_brawl"), true);
  assert.equal(writeback.quests.activeQuestId, "quest_use_poison_spirit");
  const groupedAfter = service.getProfile(grouped.session.token);
  assert.equal(groupedAfter.ok, true);
  assert.equal(groupedAfter.profile.questStates.quest_group_brawl.status, "claimed");
  assert.equal(groupedAfter.profile.activeQuestId, "quest_use_poison_spirit");
  assert.equal(groupedAfter.profile.stoneCoins >= 25, true);
  assert.equal(profileItemCount(groupedAfter.profile, "item_heal_single_5"), 1);
});
