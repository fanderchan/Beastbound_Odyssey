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

test("profiles sync with revision conflict protection", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "syncuser", "password": "test1234", "displayName": "同步猎人"});
  const token = registered.session.token;

  const emptyProfile = service.getProfile(token);
  assert.equal(emptyProfile.ok, true);
  assert.equal(emptyProfile.profile.player.name, "同步猎人");
  assert.equal(emptyProfile.profile.player.level, 1);
  assert.equal(emptyProfile.profileSummary.profileRevision, 0);
  assert.equal(emptyProfile.profileSummary.storageMode, "server_document");

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

test("profile revision conflicts keep the newer server profile intact", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "syncconflict", "password": "test1234", "displayName": "冲突档案"});
  const token = registered.session.token;
  const firstProfile = {
    "schemaVersion": 1,
    "player": {"name": "冲突档案", "level": 15, "hp": 120, "maxHp": 120},
    "stoneCoins": 77,
  };
  const firstSave = service.saveProfile(token, {
    "expectedRevision": 0,
    "profile": firstProfile,
  });
  assert.equal(firstSave.ok, true);
  assert.equal(firstSave.profileSummary.profileRevision, 1);

  const staleWrite = service.saveProfile(token, {
    "expectedRevision": 0,
    "profile": {
      "schemaVersion": 1,
      "player": {"name": "旧客户端", "level": 1, "hp": 1, "maxHp": 1},
      "stoneCoins": 0,
    },
  });
  assert.equal(staleWrite.ok, false);
  assert.equal(staleWrite.code, "revision_conflict");
  assert.equal(staleWrite.profileSummary.profileRevision, 1);

  const loaded = service.getProfile(token);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.profile.player.name, "冲突档案");
  assert.equal(loaded.profile.player.level, 15);
  assert.equal(loaded.profile.stoneCoins, 77);
  assert.equal(loaded.profileSummary.profileRevision, 1);
});

test("profile action endpoint applies whitelisted gameplay mutations server-side", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "profileaction", "password": "test1234", "displayName": "档案动作"});
  const token = registered.session.token;
  const profile = battleProfile("档案动作", {"level": 1, "hp": 80, "maxHp": 120}, {
    "petId": "pet_action_target",
    "formId": "bui_normal_red_fire10",
    "name": "动作布伊",
    "level": 10,
    "hp": 12,
    "maxHp": 90,
    "attack": 30,
    "defense": 12,
    "quick": 42,
  });
  profile.player.statPoints = 2;
  profile.player.baseStats = {"maxHp": 120, "attack": 18, "defense": 6, "quick": 70};
  profile.diamonds = 60;
  profile.stoneCoins = 200;
  profile.backpackSlots = [
    {"itemId": "item_meat_small", "count": 1},
    {"itemId": "mm_stone_attack_high", "count": 1},
    ...Array.from({"length": 13}, () => ({})),
  ];
  profile.petInstances.push({
    "instanceId": "pet_action_mm",
    "petId": "pet_action_mm",
    "formId": "pet_rebirth_mm_stage1",
    "templateId": "pet_rebirth_mm_stage1",
    "name": "动作小MM",
    "state": "standby",
    "level": 10,
    "hp": 90,
    "maxHp": 90,
    "attack": 12,
    "defense": 12,
    "quick": 42,
    "petRebirthHelper": {"stage": 1, "stonePoints": {"maxHp": 0, "attack": 48, "defense": 0, "quick": 0}},
  });
  assert.equal(service.saveProfile(token, {"expectedRevision": 0, profile}).ok, true);

  const statAllocated = service.profileAction(token, {"action": "player_stat_allocate", "payload": {"statKey": "maxHp"}});
  assert.equal(statAllocated.ok, true);
  assert.equal(statAllocated.profile.player.statPoints, 1);
  assert.equal(statAllocated.profile.player.baseStats.maxHp, 124);
  assert.equal(statAllocated.profile.player.maxHp, 124);
  assert.equal(statAllocated.profile.player.hp, 84);

  const unlock = service.profileAction(token, {"action": "backpack_unlock_slot", "payload": {"extraSlotIndex": 0}});
  assert.equal(unlock.ok, true);
  assert.equal(unlock.profile.backpackExtraSlots, 1);
  assert.equal(unlock.profile.diamonds, 10);

  const healed = service.profileAction(token, {"action": "world_item_use", "payload": {"itemId": "item_meat_small", "instanceId": "pet_action_target"}});
  assert.equal(healed.ok, true);
  assert.equal(profileItemCount(healed.profile, "item_meat_small"), 0);
  assert.equal(healed.profile.petInstances.find((pet) => pet.instanceId === "pet_action_target").hp, 40);

  const fedStone = service.profileAction(token, {"action": "world_item_use", "payload": {"itemId": "mm_stone_attack_high", "instanceId": "pet_action_mm"}});
  assert.equal(fedStone.ok, true);
  assert.equal(profileItemCount(fedStone.profile, "mm_stone_attack_high"), 0);
  assert.equal(fedStone.profile.petInstances.find((pet) => pet.instanceId === "pet_action_mm").petRebirthHelper.stonePoints.attack, 50);

  const learned = service.profileAction(token, {
    "action": "pet_skill_set_slot",
    "payload": {"instanceId": "pet_action_target", "slot": 7, "skillId": "pet_focus_bite", "trainerId": "firebud_pet_skill_trainer"},
  });
  assert.equal(learned.ok, true);
  assert.equal(learned.profile.petInstances.find((pet) => pet.instanceId === "pet_action_target").petSkillSlots[6], "pet_focus_bite");
  assert.equal(learned.profile.stoneCoins, 172);

  const renamed = service.profileAction(token, {"action": "pet_rename", "payload": {"instanceId": "pet_action_target", "name": "服务布伊"}});
  assert.equal(renamed.ok, true);
  assert.equal(renamed.profile.petInstances.find((pet) => pet.instanceId === "pet_action_target").name, "服务布伊");

  const trained = service.profileAction(token, {"action": "training_partner_set_count", "payload": {"count": 2}});
  assert.equal(trained.ok, true);
  assert.equal(trained.result.count, 2);
  assert.equal(trained.profile.trainingPartners.length, 2);
  assert.equal(trained.profile.trainingPartners[0].partnerId, "training_partner_1");
  assert.equal(trained.profile.trainingPartners[0].name, "陪练伙伴1");
  assert.equal(trained.profile.trainingPartners[0].pet.name, "陪练服务布伊1");
  assert.equal(trained.profile.trainingPartners[0].pet.attack, 30);

  const cappedTraining = service.profileAction(token, {"action": "training_partner_set_count", "payload": {"count": 99}});
  assert.equal(cappedTraining.ok, true);
  assert.equal(cappedTraining.result.count, 4);
  assert.equal(cappedTraining.profile.trainingPartners.length, 4);

  const shrunkTraining = service.profileAction(token, {"action": "training_partner_set_count", "payload": {"count": 1}});
  assert.equal(shrunkTraining.ok, true);
  assert.equal(shrunkTraining.profile.trainingPartners.length, 1);
  assert.equal(shrunkTraining.profile.trainingPartners[0].partnerId, "training_partner_1");

  const recordPoint = service.profileAction(token, {
    "action": "record_point_save",
    "payload": {"recordPoint": {"mapId": "firebud_training_yard", "spawnName": "yard", "label": "训练场"}},
  });
  assert.equal(recordPoint.ok, true);
  assert.equal(recordPoint.profile.recordPoint.mapId, "firebud_training_yard");

  const beforeCultivation = service.getProfile(token).profile;
  beforeCultivation.petInstances = beforeCultivation.petInstances.filter((pet) => pet.instanceId !== "pet_action_mm");
  beforeCultivation.petInstances.find((pet) => pet.instanceId === "pet_action_target").level = 80;
  beforeCultivation.petInstances.find((pet) => pet.instanceId === "pet_action_target").hp = 500;
  beforeCultivation.petInstances.find((pet) => pet.instanceId === "pet_action_target").maxHp = 500;
  beforeCultivation.petInstances.find((pet) => pet.instanceId === "pet_action_target").attack = 100;
  beforeCultivation.petInstances.find((pet) => pet.instanceId === "pet_action_target").defense = 60;
  beforeCultivation.petInstances.find((pet) => pet.instanceId === "pet_action_target").quick = 80;
  beforeCultivation.petInstances.find((pet) => pet.instanceId === "pet_action_target").initialStats = {"maxHp": 90, "attack": 12, "defense": 6, "quick": 50};
  beforeCultivation.petInstances.push({
    "instanceId": "pet_rebirth_helper",
    "petId": "pet_rebirth_helper",
    "formId": "pet_rebirth_mm_stage1",
    "templateId": "pet_rebirth_mm_stage1",
    "name": "满石小MM",
    "state": "standby",
    "level": 79,
    "hp": 90,
    "maxHp": 90,
    "attack": 12,
    "defense": 12,
    "quick": 42,
    "petRebirthHelper": {"stage": 1, "stonePoints": {"maxHp": 50, "attack": 50, "defense": 50, "quick": 50}},
  });
  assert.equal(service.saveProfile(token, {"expectedRevision": recordPoint.profileSummary.profileRevision, "profile": beforeCultivation}).ok, true);
  const cultivated = service.profileAction(token, {"action": "pet_cultivation_apply", "payload": {"instanceId": "pet_action_target"}});
  assert.equal(cultivated.ok, true);
  const cultivatedPet = cultivated.profile.petInstances.find((pet) => pet.instanceId === "pet_action_target");
  assert.equal(cultivatedPet.level, 1);
  assert.equal(cultivatedPet.petCultivation.rebirthCount, 1);
  assert.equal(cultivated.profile.petInstances.some((pet) => pet.instanceId === "pet_rebirth_helper"), false);
  assert.equal(cultivated.profile.petRebirthMmGuide.status, "completed");

  const loaded = service.getProfile(token);
  assert.equal(loaded.profileSummary.profileRevision, cultivated.profileSummary.profileRevision);
  assert.equal(loaded.profile.petInstances.find((pet) => pet.instanceId === "pet_action_target").name, "服务布伊");
});

test("server shop transactions validate price, currency, backpack, and buy quests", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "shopuser", "password": "test1234", "displayName": "商店玩家"});
  const token = registered.session.token;
  const profile = battleProfile("商店玩家", {"level": 1, "hp": 120, "maxHp": 120}, null);
  profile.stoneCoins = 100;
  profile.backpackSlots = Array.from({"length": 15}, () => ({}));
  profile.activeQuestId = "quest_buy_supply";
  profile.questStates = {"quest_buy_supply": {"questId": "quest_buy_supply", "status": "active", "progress": 0}};
  assert.equal(service.saveProfile(token, {"expectedRevision": 0, profile}).ok, true);

  const buy = service.shopTransaction(token, {
    "mode": "buy",
    "shopId": "firebud_item_shop",
    "itemId": "item_meat_small",
    "amount": 1,
  });
  assert.equal(buy.ok, true);
  assert.equal(buy.profileSummary.profileRevision, 2);
  assert.equal(buy.transaction.price, 8);
  assert.equal(buy.profile.stoneCoins, 92);
  assert.equal(profileItemCount(buy.profile, "item_meat_small"), 1);
  assert.equal(profileItemCount(buy.profile, "capture_rope_basic"), 1);
  assert.equal(buy.profile.activeQuestId, "quest_use_meat");
  assert.equal(buy.questMessages.some((message) => String(message).includes("补给准备")), true);

  const sell = service.shopTransaction(token, {
    "mode": "sell",
    "shopId": "firebud_item_shop",
    "itemId": "item_meat_small",
    "amount": 1,
  });
  assert.equal(sell.ok, true);
  assert.equal(sell.profileSummary.profileRevision, 3);
  assert.equal(sell.transaction.price, 4);
  assert.equal(sell.profile.stoneCoins, 96);
  assert.equal(profileItemCount(sell.profile, "item_meat_small"), 0);

  const expensive = service.shopTransaction(token, {
    "mode": "buy",
    "shopId": "firebud_diamond_shop",
    "itemId": "thunder_dragon_egg",
    "amount": 999,
  });
  assert.equal(expensive.ok, false);
  assert.equal(expensive.code, "not_enough_currency");
  assert.equal(service.getProfile(token).profileSummary.profileRevision, 3);
});

test("server shop equipment purchase can be equipped immediately", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "shopequip", "password": "test1234", "displayName": "买穿玩家"});
  const token = registered.session.token;
  const profile = battleProfile("买穿玩家", {"level": 1, "hp": 120, "maxHp": 120}, null);
  profile.stoneCoins = 100;
  profile.backpackSlots = Array.from({"length": 15}, () => ({}));
  assert.equal(service.saveProfile(token, {"expectedRevision": 0, profile}).ok, true);

  const buy = service.shopTransaction(token, {
    "mode": "buy",
    "shopId": "firebud_equipment_shop",
    "itemId": "weapon_wooden_club",
    "amount": 1,
  });
  assert.equal(buy.ok, true);
  assert.equal(buy.profileSummary.profileRevision, 2);
  assert.equal(buy.profile.stoneCoins, 55);
  assert.equal(profileItemCount(buy.profile, "weapon_wooden_club"), 1);

  const equipped = service.equipmentEquip(token, {"itemId": "weapon_wooden_club"});
  assert.equal(equipped.ok, true);
  assert.equal(equipped.profileSummary.profileRevision, 3);
  assert.equal(equipped.profile.equipmentSlots.right_hand_weapon, "weapon_wooden_club");
  assert.equal(profileItemCount(equipped.profile, "weapon_wooden_club"), 0);
  assert.equal(service.getProfile(token).profileSummary.profileRevision, 3);
});

test("server equipment equip validates ownership, swaps equipment, and advances quests", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "equipuser", "password": "test1234", "displayName": "装备玩家"});
  const token = registered.session.token;
  const profile = battleProfile("装备玩家", {"level": 1, "hp": 120, "maxHp": 120}, null);
  profile.backpackSlots = [
    {"itemId": "weapon_wooden_club", "count": 1},
    ...Array.from({"length": 14}, () => ({})),
  ];
  profile.equipmentSlots = {"right_hand_weapon": "weapon_stone_dagger"};
  profile.equipmentDurability = {"right_hand_weapon": 30};
  profile.equipmentEnhancement = {"right_hand_weapon": {"itemId": "weapon_stone_dagger", "level": 0, "history": []}};
  profile.equipmentWearCounters = {"right_hand_weapon": {"itemId": "weapon_stone_dagger", "attackCount": 0, "hitCount": 0}};
  profile.equipmentInstances = {
    "equip_000001": {
      "schemaVersion": 1,
      "instanceId": "equip_000001",
      "itemId": "weapon_wooden_club",
      "location": "backpack",
      "slotId": "",
      "durability": 30,
      "enhancement": {"itemId": "weapon_wooden_club", "level": 0, "history": []},
      "wearCounters": {"itemId": "weapon_wooden_club", "attackCount": 0, "hitCount": 0},
      "expPillCharge": {},
      "source": "test",
    },
    "equip_000002": {
      "schemaVersion": 1,
      "instanceId": "equip_000002",
      "itemId": "weapon_stone_dagger",
      "location": "equipped",
      "slotId": "right_hand_weapon",
      "durability": 30,
      "enhancement": {"itemId": "weapon_stone_dagger", "level": 0, "history": []},
      "wearCounters": {"itemId": "weapon_stone_dagger", "attackCount": 0, "hitCount": 0},
      "expPillCharge": {},
      "source": "starter",
    },
  };
  profile.equipmentSlotInstanceIds = {"right_hand_weapon": "equip_000002"};
  profile.nextEquipmentInstanceSerial = 3;
  profile.activeQuestId = "quest_equip_weapon";
  profile.questStates = {"quest_equip_weapon": {"questId": "quest_equip_weapon", "status": "active", "progress": 0}};
  assert.equal(service.saveProfile(token, {"expectedRevision": 0, profile}).ok, true);

  const equipped = service.equipmentEquip(token, {"itemId": "weapon_wooden_club"});
  assert.equal(equipped.ok, true);
  assert.equal(equipped.profileSummary.profileRevision, 2);
  assert.equal(equipped.equipment.slot, "right_hand_weapon");
  assert.equal(equipped.equipment.previousItemId, "weapon_stone_dagger");
  assert.equal(equipped.profile.equipmentSlots.right_hand_weapon, "weapon_wooden_club");
  assert.equal(equipped.profile.equipmentSlotInstanceIds.right_hand_weapon, "equip_000001");
  assert.equal(equipped.profile.equipmentInstances.equip_000001.location, "equipped");
  assert.equal(equipped.profile.equipmentInstances.equip_000002.location, "backpack");
  assert.equal(profileItemCount(equipped.profile, "weapon_wooden_club"), 0);
  assert.equal(profileItemCount(equipped.profile, "weapon_stone_dagger"), 1);
  assert.equal(equipped.profile.activeQuestId, "quest_buy_spirit_armor");
  assert.equal(equipped.questMessages.some((message) => String(message).includes("装备木棒")), true);

  const missing = service.equipmentEquip(token, {"itemId": "weapon_wooden_club"});
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "equipment_item_missing");
  assert.equal(service.getProfile(token).profileSummary.profileRevision, 2);
});

test("server equipment enhance validates equipped slot, consumes cost, and updates instance", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "enhanceuser", "password": "test1234", "displayName": "强化玩家"});
  const token = registered.session.token;
  const profile = battleProfile("强化玩家", {"level": 1, "hp": 120, "maxHp": 120}, null);
  profile.stoneCoins = 120;
  profile.backpackSlots = [
    {"itemId": "equip_frag_wood_basic", "count": 3},
    ...Array.from({"length": 14}, () => ({})),
  ];
  profile.equipmentSlots = {"right_hand_weapon": "weapon_wooden_club"};
  profile.equipmentDurability = {"right_hand_weapon": 30};
  profile.equipmentEnhancement = {"right_hand_weapon": {"itemId": "weapon_wooden_club", "level": 0, "history": []}};
  profile.equipmentInstances = {
    "equip_000001": {
      "schemaVersion": 1,
      "instanceId": "equip_000001",
      "itemId": "weapon_wooden_club",
      "location": "equipped",
      "slotId": "right_hand_weapon",
      "durability": 30,
      "enhancement": {"itemId": "weapon_wooden_club", "level": 0, "history": []},
      "wearCounters": {"itemId": "weapon_wooden_club", "attackCount": 0, "hitCount": 0},
      "expPillCharge": {},
      "source": "starter",
    },
  };
  profile.equipmentSlotInstanceIds = {"right_hand_weapon": "equip_000001"};
  profile.nextEquipmentInstanceSerial = 2;
  assert.equal(service.saveProfile(token, {"expectedRevision": 0, profile}).ok, true);

  const enhanced = service.equipmentEnhance(token, {"slotId": "right_hand_weapon"});
  assert.equal(enhanced.ok, true);
  assert.equal(enhanced.profileSummary.profileRevision, 2);
  assert.equal(enhanced.enhancement.level, 1);
  assert.equal(enhanced.enhancement.materialId, "equip_frag_wood_basic");
  assert.equal(enhanced.profile.stoneCoins, 100);
  assert.equal(profileItemCount(enhanced.profile, "equip_frag_wood_basic"), 2);
  assert.equal(enhanced.profile.equipmentEnhancement.right_hand_weapon.level, 1);
  assert.equal(enhanced.profile.equipmentInstances.equip_000001.enhancement.level, 1);

  const second = service.equipmentEnhance(token, {"slotId": "right_hand_weapon"});
  assert.equal(second.ok, true);
  assert.equal(second.profileSummary.profileRevision, 3);
  assert.equal(second.enhancement.level, 2);
  assert.equal(profileItemCount(second.profile, "equip_frag_wood_basic"), 0);
  assert.equal(second.profile.stoneCoins, 60);

  const missing = service.equipmentEnhance(token, {"slotId": "right_hand_weapon"});
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "equipment_enhance_material_missing");
  assert.equal(service.getProfile(token).profileSummary.profileRevision, 3);
});

test("server equipment repair validates missing durability, consumes coins, and updates instances", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "repairuser", "password": "test1234", "displayName": "修理玩家"});
  const token = registered.session.token;
  const profile = battleProfile("修理玩家", {"level": 1, "hp": 120, "maxHp": 120}, null);
  profile.stoneCoins = 20;
  profile.backpackSlots = Array.from({"length": 15}, () => ({}));
  profile.equipmentSlots = {"right_hand_weapon": "weapon_wooden_club"};
  profile.equipmentDurability = {"right_hand_weapon": 2};
  profile.equipmentWearCounters = {"right_hand_weapon": {"itemId": "weapon_wooden_club", "attackCount": 37, "hitCount": 0}};
  profile.equipmentInstances = {
    "equip_000001": {
      "schemaVersion": 1,
      "instanceId": "equip_000001",
      "itemId": "weapon_wooden_club",
      "location": "equipped",
      "slotId": "right_hand_weapon",
      "durability": 2,
      "enhancement": {"itemId": "weapon_wooden_club", "level": 0, "history": []},
      "wearCounters": {"itemId": "weapon_wooden_club", "attackCount": 37, "hitCount": 0},
      "expPillCharge": {},
      "source": "starter",
    },
  };
  profile.equipmentSlotInstanceIds = {"right_hand_weapon": "equip_000001"};
  profile.nextEquipmentInstanceSerial = 2;
  assert.equal(service.saveProfile(token, {"expectedRevision": 0, profile}).ok, true);

  const repaired = service.equipmentRepairAll(token);
  assert.equal(repaired.ok, true);
  assert.equal(repaired.profileSummary.profileRevision, 2);
  assert.equal(repaired.repair.missingDurability, 28);
  assert.equal(repaired.repair.cost, 6);
  assert.equal(repaired.profile.stoneCoins, 14);
  assert.equal(repaired.profile.equipmentDurability.right_hand_weapon, 30);
  assert.equal(repaired.profile.equipmentWearCounters.right_hand_weapon.attackCount, 0);
  assert.equal(repaired.profile.equipmentInstances.equip_000001.durability, 30);
  assert.equal(repaired.profile.equipmentInstances.equip_000001.wearCounters.attackCount, 0);

  const notNeeded = service.equipmentRepairAll(token);
  assert.equal(notNeeded.ok, false);
  assert.equal(notNeeded.code, "equipment_repair_not_needed");
  assert.equal(service.getProfile(token).profileSummary.profileRevision, 2);
});

test("server equipment synthesis validates materials, currency, backpack, and instances", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "synthuser", "password": "test1234", "displayName": "合成玩家"});
  const token = registered.session.token;
  const profile = battleProfile("合成玩家", {"level": 1, "hp": 120, "maxHp": 120}, null);
  profile.stoneCoins = 50;
  profile.backpackSlots = [
    {"itemId": "equip_frag_wood_basic", "count": 3},
    ...Array.from({"length": 14}, () => ({})),
  ];
  profile.equipmentInstances = {};
  profile.nextEquipmentInstanceSerial = 1;
  assert.equal(service.saveProfile(token, {"expectedRevision": 0, profile}).ok, true);

  const synthesized = service.equipmentSynthesize(token, {"recipeId": "craft_hardwood_club"});
  assert.equal(synthesized.ok, true);
  assert.equal(synthesized.profileSummary.profileRevision, 2);
  assert.equal(synthesized.synthesis.outputItemId, "weapon_hardwood_club");
  assert.equal(synthesized.synthesis.stoneCost, 20);
  assert.equal(synthesized.profile.stoneCoins, 30);
  assert.equal(profileItemCount(synthesized.profile, "equip_frag_wood_basic"), 0);
  assert.equal(profileItemCount(synthesized.profile, "weapon_hardwood_club"), 1);
  assert.equal(synthesized.synthesis.instanceIds.length, 1);
  const instanceId = synthesized.synthesis.instanceIds[0];
  assert.equal(synthesized.profile.equipmentInstances[instanceId].itemId, "weapon_hardwood_club");
  assert.equal(synthesized.profile.equipmentInstances[instanceId].location, "backpack");
  assert.equal(synthesized.profile.equipmentInstances[instanceId].source, "synthesis");

  const missing = service.equipmentSynthesize(token, {"recipeId": "craft_hardwood_club"});
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "equipment_synthesis_material_missing");
  assert.equal(service.getProfile(token).profileSummary.profileRevision, 2);
});

test("server player rebirth consumes trial requirements and writes authoritative profile", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "rebirthuser", "password": "test1234", "displayName": "转生玩家"});
  const token = registered.session.token;
  const profile = playerRebirthReadyProfile("转生玩家");
  assert.equal(service.saveProfile(token, {"expectedRevision": 0, profile}).ok, true);
  service.updatePlayerPosition(token, {"mapId": "level_grass_trial_ground", "cellX": 12, "cellY": 8, "facing": "east", "moving": false});

  const reborn = service.playerRebirth(token);
  assert.equal(reborn.ok, true);
  assert.equal(reborn.profileSummary.profileRevision, 2);
  assert.equal(reborn.profile.rebirthCount, 1);
  assert.equal(reborn.profile.player.level, 1);
  assert.equal(reborn.profile.player.exp, 0);
  assert.equal(reborn.profile.player.nextExp, 122);
  assert.equal(reborn.profile.rebirthHistory.length, 1);
  assert.equal(reborn.profile.rebirthHistory[0].toRebirth, 1);
  assert.equal(reborn.profile.rebirthHistory[0].questId, "rebirth_1");
  assert.equal(profileItemCount(reborn.profile, "ring_earth_trial"), 0);
  assert.equal(profileItemCount(reborn.profile, "ring_water_trial"), 0);
  assert.equal(profileItemCount(reborn.profile, "ring_fire_trial"), 0);
  assert.equal(profileItemCount(reborn.profile, "ring_wind_trial"), 0);
  assert.equal(profileItemCount(reborn.profile, "armor_grace_cloth_3"), 1);
  assert.equal(reborn.profile.rebirthTrialProofs.shadow_oath_rebirth_guardian, undefined);
  assert.equal(reborn.profile.petInstances.some((pet) => pet.formId === "rebirth_beast_earth_lv50"), false);
  const starter = reborn.profile.petInstances.find((pet) => pet.formId === "rebirth_starter_earth_cub");
  assert.equal(Boolean(starter), true);
  assert.equal(starter.state, "battle");
  assert.equal(reborn.profile.activePetInstanceId, starter.instanceId);
  assert.equal(reborn.rebirth.consumedRingIds.length, 4);
  assert.equal(reborn.rebirth.consumedPets[0].formId, "rebirth_beast_earth_lv50");
  assert.equal(reborn.rebirth.rewardItems[0].itemId, "armor_grace_cloth_3");
  assert.equal(reborn.returnEntry.position.authority, "player_rebirth_return");
  assert.equal(reborn.returnEntry.position.mapId, "firebud_village_gate");

  const second = service.playerRebirth(token);
  assert.equal(second.ok, false);
  assert.equal(second.code, "player_rebirth_not_ready");
  assert.equal(service.getProfile(token).profileSummary.profileRevision, 2);
});
