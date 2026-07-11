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
const {loadPetGrowthCatalog} = require("../src/auth/pet-growth-catalog");
const {
  initializePetGrowth,
  settlePetGrowthToLevel,
  validatePetGrowth,
} = require("../src/auth/pet-growth-runtime");

function authorityPetAtLevel(catalog, profileId, instanceId, level, privateSeed, overrides = {}) {
  const growthProfile = catalog.requireProfileById(profileId);
  const source = {
    "instanceId": instanceId,
    "petId": instanceId,
    "formId": growthProfile.formId,
    "templateId": growthProfile.formId,
    "growthSpeciesProfileId": growthProfile.profileId,
    "name": String(overrides.name || growthProfile.displayName || growthProfile.formName || "权威成长宠"),
    "state": String(overrides.state || "standby"),
    "level": 1,
    "exp": 0,
    "nextExp": 100,
    "hp": 1,
    "maxHp": 1,
    "attack": 1,
    "defense": 1,
    "quick": 1,
    ...overrides,
  };
  const initialized = initializePetGrowth(source, growthProfile, {privateSeed}).pet;
  const settled = settlePetGrowthToLevel(initialized, growthProfile, level).pet;
  settled.exp = 0;
  settled.nextExp = Math.max(1, level * 100);
  return {growthProfile, pet: settled};
}

test("profiles sync with revision conflict protection", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "syncuser", "password": "test1234", "displayName": "同步猎人"});
  const token = registered.session.token;

  const emptyProfile = service.getProfile(token);
  assert.equal(emptyProfile.ok, true);
  assert.equal(emptyProfile.profile.player.name, "同步猎人");
  assert.equal(emptyProfile.profile.player.level, 1);
  assert.deepEqual(emptyProfile.profile.equipmentSlots, {});
  assert.deepEqual(emptyProfile.profile.equipmentDurability, {});
  assert.deepEqual(emptyProfile.profile.equipmentEnhancement, {});
  assert.deepEqual(emptyProfile.profile.equipmentWearCounters, {});
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

test("full profile save cannot overwrite an existing unsafe future backpack", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const registered = seedService.register({username: "savefuturebag", password: "test1234", displayName: "整档保护号"});
  const token = registered.session.token;
  const cleanProfile = battleProfile("整档保护号", {level: 1, hp: 120, maxHp: 120}, null);
  cleanProfile.backpackSlots = Array.from({length: 15}, () => ({}));
  const saved = seedService.saveProfile(token, {expectedRevision: 0, profile: cleanProfile});
  assert.equal(saved.ok, true);
  const seed = seedService.snapshot();
  const binding = seed.profileBindings[registered.account.accountId];
  seed.profiles[binding.playerId].profile.backpackSlots[0] = {
    itemId: "future_backpack_relic_999",
    count: 1,
    futureEnvelope: {assetId: "future_full_save_asset"},
  };
  const profileBefore = structuredClone(seed.profiles[binding.playerId].profile);
  const revisionBefore = binding.profileRevision;
  const service = createAuthService({store: createMemoryAuthStore(seed)});

  const overwritten = service.saveProfile(token, {expectedRevision: revisionBefore, profile: cleanProfile});
  assert.equal(overwritten.ok, false);
  assert.equal(overwritten.code, "backpack_item_unknown");
  const after = service.snapshot();
  assert.equal(after.profileBindings[registered.account.accountId].profileRevision, revisionBefore);
  assert.deepEqual(after.profiles[binding.playerId].profile, profileBefore);
});

test("full profile save preserves unsafe bank and equipment instance assets", () => {
  const cases = [
    {
      suffix: "bank",
      code: "bank_item_unknown",
      makeUnsafe(profile) {
        profile.bank = {
          schemaVersion: 1,
          stoneCoins: 25,
          unlockedTabs: 1,
          slots: [{itemId: "future_bank_relic_999", count: 1}],
          items: [{itemId: "future_bank_relic_999", count: 1}],
          futureField: {assetId: "future_bank_asset"},
        };
      },
    },
    {
      suffix: "equip",
      code: "equipment_instance_schema_future",
      makeUnsafe(profile) {
        profile.backpackSlots[0] = {itemId: "weapon_wooden_club", count: 1};
        profile.equipmentInstances = {
          equip_000001: {
            schemaVersion: 2,
            instanceId: "equip_000001",
            itemId: "weapon_wooden_club",
            location: "backpack",
            slotId: "",
            enhancement: {itemId: "weapon_wooden_club", level: 7, history: []},
            wearCounters: {itemId: "weapon_wooden_club", attackCount: 23, hitCount: 4},
            futureAffixes: [{id: "future_power", value: 99}],
          },
        };
        profile.nextEquipmentInstanceSerial = 2;
        profile.equipmentSlotsVersion = 5;
      },
    },
    {
      suffix: "orphan",
      code: "equipment_profile_state_conflict",
      makeUnsafe(profile) {
        profile.equipmentInstances = {
          orphan_asset: {
            schemaVersion: 1,
            instanceId: "orphan_asset",
            itemId: "weapon_wooden_club",
            location: "backpack",
            slotId: "",
            durability: 30,
            enhancement: {itemId: "weapon_wooden_club", level: 4, history: []},
            wearCounters: {itemId: "weapon_wooden_club", attackCount: 11, hitCount: 2},
            expPillCharge: {},
            futureAffixes: [{id: "rare_orphan_power", value: 88}],
          },
        };
        profile.nextEquipmentInstanceSerial = 1;
        profile.equipmentSlotInstanceIds = {};
        profile.equipmentSlotsVersion = 5;
      },
    },
  ];

  for (const scenario of cases) {
    const seedService = createAuthService({store: createMemoryAuthStore()});
    const username = `saveasset${scenario.suffix}`;
    const registered = seedService.register({username, password: "test1234", displayName: `资产保护${scenario.suffix}`});
    const token = registered.session.token;
    const cleanProfile = battleProfile(`资产保护${scenario.suffix}`, {level: 1, hp: 120, maxHp: 120}, null);
    cleanProfile.backpackSlots = Array.from({length: 15}, () => ({}));
    assert.equal(seedService.saveProfile(token, {expectedRevision: 0, profile: cleanProfile}).ok, true);
    const seed = seedService.snapshot();
    const binding = seed.profileBindings[registered.account.accountId];
    scenario.makeUnsafe(seed.profiles[binding.playerId].profile);
    const profileBefore = structuredClone(seed.profiles[binding.playerId].profile);
    const revisionBefore = binding.profileRevision;
    const service = createAuthService({store: createMemoryAuthStore(seed)});

    const overwritten = service.saveProfile(token, {expectedRevision: revisionBefore, profile: cleanProfile});
    assert.equal(overwritten.ok, false);
    assert.equal(overwritten.code, scenario.code);
    const after = service.snapshot();
    assert.equal(after.profileBindings[registered.account.accountId].profileRevision, revisionBefore);
    assert.deepEqual(after.profiles[binding.playerId].profile, profileBefore);

    const unsafeIncoming = structuredClone(cleanProfile);
    scenario.makeUnsafe(unsafeIncoming);
    const incomingResult = service.saveProfile(token, {expectedRevision: revisionBefore, profile: unsafeIncoming});
    assert.equal(incomingResult.ok, false);
    assert.equal(incomingResult.code, scenario.code);
    const afterIncoming = service.snapshot();
    assert.equal(afterIncoming.profileBindings[registered.account.accountId].profileRevision, revisionBefore);
    assert.deepEqual(afterIncoming.profiles[binding.playerId].profile, profileBefore);
  }
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
  beforeCultivation.petInstances.push({
    "instanceId": "valuable_normal_pet",
    "petId": "valuable_normal_pet",
    "formId": "bui_normal_red_fire10",
    "templateId": "bui_normal_red_fire10",
    "name": "珍贵普通宠",
    "state": "standby",
    "level": 130,
    "hp": 800,
    "maxHp": 800,
    "attack": 180,
    "defense": 120,
    "quick": 140,
  });
  assert.equal(service.saveProfile(token, {"expectedRevision": recordPoint.profileSummary.profileRevision, "profile": beforeCultivation}).ok, true);
  const cultivated = service.profileAction(token, {"action": "pet_cultivation_apply", "payload": {"instanceId": "pet_action_target"}});
  assert.equal(cultivated.ok, true);
  const cultivatedPet = cultivated.profile.petInstances.find((pet) => pet.instanceId === "pet_action_target");
  assert.equal(cultivatedPet.level, 1);
  assert.equal(cultivatedPet.petCultivation.rebirthCount, 1);
  assert.equal(cultivated.profile.petInstances.some((pet) => pet.instanceId === "pet_rebirth_helper"), false);
  assert.equal(cultivated.profile.petInstances.some((pet) => pet.instanceId === "valuable_normal_pet"), true);
  assert.equal(cultivated.profile.petRebirthMmGuide.status, "completed");
  const cultivatedInternal = internalProfileForAccount(service, registered.account.accountId)
    .petInstances.find((pet) => pet.instanceId === "pet_action_target");
  const cultivationEvent = cultivatedInternal.petCultivation.history.at(-1);
  assert.equal(isValidPetPrivateSeed(cultivationEvent.rebirthRollSeed), true);

  const loaded = service.getProfile(token);
  assert.equal(loaded.profileSummary.profileRevision, cultivated.profileSummary.profileRevision);
  assert.equal(loaded.profile.petInstances.find((pet) => pet.instanceId === "pet_action_target").name, "服务布伊");
});

test("authority-v1 pet rebirth restarts one canonical growth cycle atomically", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "v1petrebirth", "password": "test1234", "displayName": "权威转宠"});
  assert.equal(registered.ok, true);
  const token = registered.session.token;
  const catalog = loadPetGrowthCatalog();
  const target = authorityPetAtLevel(
    catalog,
    "blue_man_dragon_v1",
    "authority_rebirth_target",
    140,
    `bps1_${"T".repeat(43)}`,
    {"name": "蓝人龙", "state": "battle"},
  );
  const helper = authorityPetAtLevel(
    catalog,
    "pet_rebirth_mm_stage1_v1",
    "authority_rebirth_helper",
    79,
    `bps1_${"H".repeat(43)}`,
    {
      "name": "满石1转小MM",
      "state": "standby",
      "petRebirthHelper": {
        "stage": 1,
        "stonePoints": {"maxHp": 50, "attack": 50, "defense": 50, "quick": 50},
      },
    },
  );
  const profile = battleProfile("权威转宠", {"level": 140, "hp": 900, "maxHp": 900, "attack": 180, "defense": 120, "quick": 160}, null);
  profile.activePetInstanceId = target.pet.instanceId;
  const stageTwoHelper = {
    "instanceId": "authority_rebirth_helper_stage2",
    "petId": "authority_rebirth_helper_stage2",
    "formId": "pet_rebirth_mm_stage2",
    "templateId": "pet_rebirth_mm_stage2",
    "name": "保留的2转小MM",
    "state": "standby",
    "level": 79,
    "hp": 90,
    "maxHp": 90,
    "attack": 12,
    "defense": 12,
    "quick": 42,
    "petRebirthHelper": {
      "stage": 2,
      "stonePoints": {"maxHp": 50, "attack": 50, "defense": 50, "quick": 50},
    },
  };
  profile.petInstances = [target.pet, helper.pet, stageTwoHelper];
  const saved = service.saveProfile(token, {"expectedRevision": 0, profile});
  assert.equal(saved.ok, true);
  const beforeTarget = structuredClone(
    internalProfileForAccount(service, registered.account.accountId).petInstances
      .find((pet) => pet.instanceId === target.pet.instanceId),
  );

  const reborn = service.profileAction(token, {
    "action": "pet_cultivation_apply",
    "payload": {"instanceId": target.pet.instanceId},
  });
  assert.equal(reborn.ok, true, JSON.stringify(reborn));
  assert.equal(reborn.profileSummary.profileRevision, saved.profileSummary.profileRevision + 1);
  const internalProfile = internalProfileForAccount(service, registered.account.accountId);
  const rebornTarget = internalProfile.petInstances.find((pet) => pet.instanceId === target.pet.instanceId);
  assert.equal(internalProfile.petInstances.some((pet) => pet.instanceId === helper.pet.instanceId), false);
  assert.equal(internalProfile.petInstances.some((pet) => pet.instanceId === stageTwoHelper.instanceId), true);
  assert.equal(rebornTarget.level, 1);
  assert.equal(rebornTarget.exp, 0);
  assert.equal(rebornTarget.petGrowth.settledLevel, 1);
  assert.equal(rebornTarget.petGrowth.public.level, 1);
  assert.deepEqual(rebornTarget.petGrowth.public.stats, {
    maxHp: rebornTarget.maxHp,
    attack: rebornTarget.attack,
    defense: rebornTarget.defense,
    quick: rebornTarget.quick,
  });
  assert.deepEqual(validatePetGrowth(rebornTarget, target.growthProfile), {ok: true, code: "", errors: []});
  assert.equal(rebornTarget.petGrowth.private.privateSeed, beforeTarget.petGrowth.private.privateSeed);
  assert.deepEqual(rebornTarget.petGrowth.private.privateRoll, beforeTarget.petGrowth.private.privateRoll);
  assert.deepEqual(rebornTarget.initialStats, beforeTarget.initialStats);
  assert.deepEqual(rebornTarget.growthSpeciesLevel1Stats, beforeTarget.growthSpeciesLevel1Stats);
  assert.deepEqual(
    rebornTarget.petGrowth.private.cultivation.growthBonus,
    rebornTarget.petCultivation.rebirthGrowthBonus,
  );
  assert.equal(Object.values(rebornTarget.petCultivation.rebirthGrowthBonus).some((value) => value > 0), true);
  const retrainedToLevel20 = settlePetGrowthToLevel(rebornTarget, target.growthProfile, 20).pet;
  assert.equal(retrainedToLevel20.level, 20);
  assert.deepEqual(validatePetGrowth(retrainedToLevel20, target.growthProfile), {ok: true, code: "", errors: []});
  const publicTarget = reborn.profile.petInstances.find((pet) => pet.instanceId === target.pet.instanceId);
  assert.equal(publicTarget.growthAuthority.modelVersion, "pet_growth_authority_v1");
  const publicResponseText = JSON.stringify(reborn);
  assert.equal(publicResponseText.includes(beforeTarget.petGrowth.private.privateSeed), false);
  for (const privateField of ["privateSeed", "privateRoll", "continuousStats", "rebirthRollSeed", "helperGrowthWeights", "rebirthBonusInternalPower"]) {
    assert.equal(publicResponseText.includes(`\"${privateField}\"`), false, privateField);
  }

  const historyAfterFirst = structuredClone(rebornTarget.petCultivation.history);
  const repeated = service.profileAction(token, {
    "action": "pet_cultivation_apply",
    "payload": {"instanceId": target.pet.instanceId},
  });
  assert.equal(repeated.ok, false);
  assert.equal(repeated.code, "pet_rebirth_level_low");
  assert.equal(repeated.profileSummary.profileRevision, reborn.profileSummary.profileRevision);
  const afterRepeated = internalProfileForAccount(service, registered.account.accountId);
  assert.equal(afterRepeated.petInstances.some((pet) => pet.instanceId === stageTwoHelper.instanceId), true);
  assert.deepEqual(
    afterRepeated.petInstances.find((pet) => pet.instanceId === target.pet.instanceId).petCultivation.history,
    historyAfterFirst,
  );
});

test("authority-v1 pet rebirth rejects damaged target or selected MM before consumption", () => {
  const catalog = loadPetGrowthCatalog();
  const cases = [
    {id: "target", mutate(target) { target.attack += 1; }},
    {id: "helper", mutate(_target, helper) { helper.petGrowth.settledLevel = 1; }},
  ];
  for (const fixture of cases) {
    const service = createAuthService({"store": createMemoryAuthStore()});
    const registered = service.register({
      "username": `badrebirth${fixture.id}`,
      "password": "test1234",
      "displayName": `坏档${fixture.id}`,
    });
    assert.equal(registered.ok, true);
    const target = authorityPetAtLevel(
      catalog,
      "blue_man_dragon_v1",
      `damaged_target_${fixture.id}`,
      140,
      `bps1_${fixture.id === "target" ? "A".repeat(43) : "B".repeat(43)}`,
      {"name": "待转蓝人龙", "state": "battle"},
    );
    const helper = authorityPetAtLevel(
      catalog,
      "pet_rebirth_mm_stage1_v1",
      `damaged_helper_${fixture.id}`,
      79,
      `bps1_${fixture.id === "target" ? "C".repeat(43) : "D".repeat(43)}`,
      {
        "name": "待验1转小MM",
        "state": "standby",
        "petRebirthHelper": {
          "stage": 1,
          "stonePoints": {"maxHp": 50, "attack": 50, "defense": 50, "quick": 50},
        },
      },
    );
    fixture.mutate(target.pet, helper.pet);
    const profile = battleProfile(`坏档${fixture.id}`, {"level": 140, "hp": 900, "maxHp": 900}, null);
    profile.activePetInstanceId = target.pet.instanceId;
    profile.petInstances = [target.pet, helper.pet];
    const saved = service.saveProfile(registered.session.token, {"expectedRevision": 0, profile});
    assert.equal(saved.ok, true);
    const before = structuredClone(internalProfileForAccount(service, registered.account.accountId));

    const rejected = service.profileAction(registered.session.token, {
      "action": "pet_cultivation_apply",
      "payload": {"instanceId": target.pet.instanceId},
    });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, "pet_growth_state_invalid");
    assert.match(rejected.message, /转生MM未消耗/);
    assert.equal(rejected.profileSummary.profileRevision, saved.profileSummary.profileRevision);
    assert.deepEqual(internalProfileForAccount(service, registered.account.accountId), before);
    assert.equal(JSON.stringify(rejected).includes("privateSeed"), false);
  }
});

test("pet rebirth consumes the exact MM confirmed by the player", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "exactmmhelper", "password": "test1234", "displayName": "精确材料"});
  assert.equal(registered.ok, true);
  const target = {
    "instanceId": "exact_mm_target",
    "petId": "exact_mm_target",
    "formId": "wuli_normal_orange_fire10",
    "templateId": "wuli_normal_orange_fire10",
    "name": "待转乌力",
    "state": "battle",
    "level": 80,
    "hp": 500,
    "maxHp": 500,
    "attack": 100,
    "defense": 60,
    "quick": 80,
    "initialStats": {"maxHp": 90, "attack": 12, "defense": 6, "quick": 50},
  };
  const helper = (id, name, attackPoints) => ({
    "instanceId": id,
    "petId": id,
    "formId": "pet_rebirth_mm_stage1",
    "templateId": "pet_rebirth_mm_stage1",
    name,
    "state": "standby",
    "level": 79,
    "hp": 90,
    "maxHp": 90,
    "attack": 12,
    "defense": 12,
    "quick": 42,
    "petRebirthHelper": {
      "stage": 1,
      "stonePoints": {"maxHp": 0, "attack": attackPoints, "defense": 0, "quick": 0},
    },
  });
  const helperA = helper("exact_mm_a", "攻石MM-A", 10);
  const helperB = helper("exact_mm_b", "攻石MM-B", 50);
  const profile = battleProfile("精确材料", {"level": 80, "hp": 500, "maxHp": 500}, null);
  profile.activePetInstanceId = target.instanceId;
  profile.petInstances = [target, helperA, helperB];
  const saved = service.saveProfile(registered.session.token, {"expectedRevision": 0, profile});
  assert.equal(saved.ok, true);
  const before = structuredClone(internalProfileForAccount(service, registered.account.accountId));

  const ambiguous = service.profileAction(registered.session.token, {
    "action": "pet_cultivation_apply",
    "payload": {"instanceId": target.instanceId},
  });
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.code, "pet_rebirth_helper_selection_required");
  assert.equal(ambiguous.profileSummary.profileRevision, saved.profileSummary.profileRevision);
  assert.deepEqual(internalProfileForAccount(service, registered.account.accountId), before);

  const applied = service.profileAction(registered.session.token, {
    "action": "pet_cultivation_apply",
    "payload": {"instanceId": target.instanceId, "helperInstanceId": helperB.instanceId},
  });
  assert.equal(applied.ok, true);
  assert.equal(applied.profile.petInstances.some((pet) => pet.instanceId === helperA.instanceId), true);
  assert.equal(applied.profile.petInstances.some((pet) => pet.instanceId === helperB.instanceId), false);
  const internalTarget = internalProfileForAccount(service, registered.account.accountId).petInstances
    .find((pet) => pet.instanceId === target.instanceId);
  assert.equal(internalTarget.petCultivation.history.at(-1).helperInstanceId, helperB.instanceId);
});

test("pet rebirth MM guide requires Lv80 and never reopens a completed guide", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "mmguidelevel", "password": "test1234", "displayName": "等级教学"});
  assert.equal(registered.ok, true);
  const token = registered.session.token;
  const profile = battleProfile("等级教学", {"level": 79, "hp": 500, "maxHp": 500, "attack": 80, "defense": 50, "quick": 100}, null);
  assert.equal(service.saveProfile(token, {"expectedRevision": 0, profile}).ok, true);

  const rejected = service.profileAction(token, {"action": "pet_rebirth_mm_guide_start", "payload": {}});
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "pet_rebirth_mm_guide_level_required");
  assert.match(rejected.message, /Lv80/);
  let loaded = service.getProfile(token);
  assert.equal(loaded.profileSummary.profileRevision, 1);
  assert.equal(String(loaded.profile.petRebirthMmGuide && loaded.profile.petRebirthMmGuide.status || "available"), "available");

  loaded.profile.player.level = 80;
  const leveled = service.saveProfile(token, {"expectedRevision": 1, "profile": loaded.profile});
  assert.equal(leveled.ok, true);
  const started = service.profileAction(token, {"action": "pet_rebirth_mm_guide_start", "payload": {}});
  assert.equal(started.ok, true);
  assert.equal(started.profile.petRebirthMmGuide.status, "active");
  assert.match(started.message, /\[80\] 宠物转生教学/);
  assert.match(started.message, /推荐等级：Lv130/);

  const completedProfile = started.profile;
  completedProfile.petRebirthMmGuide.status = "completed";
  const completedSave = service.saveProfile(token, {
    "expectedRevision": started.profileSummary.profileRevision,
    "profile": completedProfile,
  });
  assert.equal(completedSave.ok, true);
  const reopened = service.profileAction(token, {"action": "pet_rebirth_mm_guide_start", "payload": {}});
  assert.equal(reopened.ok, false);
  assert.equal(reopened.code, "pet_rebirth_mm_guide_completed");
  loaded = service.getProfile(token);
  assert.equal(loaded.profile.petRebirthMmGuide.status, "completed");
  assert.equal(loaded.profileSummary.profileRevision, completedSave.profileSummary.profileRevision);
});

test("server backpack actions merge split and discard item stacks", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "bagstacks", "password": "test1234", "displayName": "背包整理"});
  const token = registered.session.token;
  const profile = battleProfile("背包整理", {"level": 1, "hp": 120, "maxHp": 120});
  profile.backpackSlots = [
    {"itemId": "item_meat_small", "count": 20},
    {"itemId": "item_meat_small", "count": 7},
    ...Array.from({"length": 13}, () => ({})),
  ];
  assert.equal(service.saveProfile(token, {"expectedRevision": 0, profile}).ok, true);

  const merged = service.profileAction(token, {
    "action": "backpack_move_stack",
    "payload": {"sourceSlotIndex": 1, "targetSlotIndex": 0},
  });
  assert.equal(merged.ok, true);
  assert.equal(merged.profile.backpackSlots[0].itemId, "item_meat_small");
  assert.equal(merged.profile.backpackSlots[0].count, 27);
  assert.deepEqual(merged.profile.backpackSlots[1], {});
  assert.equal(profileItemCount(merged.profile, "item_meat_small"), 27);

  const split = service.profileAction(token, {
    "action": "backpack_split_stack",
    "payload": {"sourceSlotIndex": 0, "quantity": 7},
  });
  assert.equal(split.ok, true);
  assert.equal(split.profile.backpackSlots[0].count, 20);
  assert.equal(split.profile.backpackSlots[1].count, 7);
  assert.equal(profileItemCount(split.profile, "item_meat_small"), 27);

  const discarded = service.profileAction(token, {
    "action": "backpack_discard_item",
    "payload": {"sourceSlotIndex": 1, "quantity": 7},
  });
  assert.equal(discarded.ok, true);
  assert.equal(discarded.profile.backpackSlots[0].count, 20);
  assert.deepEqual(discarded.profile.backpackSlots[1], {});
  assert.equal(profileItemCount(discarded.profile, "item_meat_small"), 20);
  assert.equal(discarded.message, "已丢弃肉 x7。");
});

test("server world pet eggs hatch pets with default attack and defend skills", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "peteggbasics", "password": "test1234", "displayName": "蛋宠玩家"});
  const token = registered.session.token;
  const profile = battleProfile("蛋宠玩家", {"level": 1, "hp": 120, "maxHp": 120}, null);
  profile.backpackSlots = [
    {"itemId": "novice_battle_pet_egg", "count": 1},
    ...Array.from({"length": 14}, () => ({})),
  ];
  assert.equal(service.saveProfile(token, {"expectedRevision": 0, profile}).ok, true);

  const hatched = service.profileAction(token, {
    "action": "world_item_use",
    "payload": {"itemId": "novice_battle_pet_egg"},
  });
  assert.equal(hatched.ok, true);
  assert.equal(profileItemCount(hatched.profile, "novice_battle_pet_egg"), 0);
  const pet = hatched.profile.petInstances.find((entry) => String(entry.instanceId || "") === hatched.result.instanceId);
  assert.equal(Boolean(pet), true);
  assert.equal(pet.formId, "bui_novice_sprout_earth5_wind5");
  assert.equal(pet.growthSpeciesProfileId, "bui_novice_sprout_earth5_wind5_v1");
  assert.equal(pet.tameEligible, true);
  assert.equal(pet.activeSkillIds.includes("pet_attack"), true);
  assert.equal(pet.activeSkillIds.includes("pet_defend"), true);
  assert.deepEqual(pet.petSkillSlots.slice(0, 2), ["pet_attack", "pet_defend"]);
  const internalPet = internalProfileForAccount(service, registered.account.accountId)
    .petInstances.find((entry) => entry.instanceId === hatched.result.instanceId);
  assert.equal(Object.hasOwn(internalPet, "individualSeed"), false);
  assert.equal(isValidPetPrivateSeed(internalPet.petGrowth.private.privateSeed), true);
  const expectedLevelOneStats = {
    maxHp: internalPet.maxHp,
    attack: internalPet.attack,
    defense: internalPet.defense,
    quick: internalPet.quick,
  };
  assert.deepEqual(internalPet.initialStats, expectedLevelOneStats);
  assert.deepEqual(internalPet.growthSpeciesLevel1Stats, expectedLevelOneStats);
});

test("linked MM eggs hatch canonical authority-v1 pets and return only public growth facts", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const registered = service.register({username: "peteggmmvone", password: "test1234", displayName: "MM蛋玩家"});
  const profile = battleProfile("MM蛋玩家", {level: 80, hp: 120, maxHp: 120}, null);
  profile.backpackSlots = [
    {itemId: "pet_rebirth_mm1_egg", count: 1},
    ...Array.from({length: 14}, () => ({})),
  ];
  assert.equal(service.saveProfile(registered.session.token, {expectedRevision: 0, profile}).ok, true);

  const hatched = service.profileAction(registered.session.token, {
    action: "world_item_use",
    payload: {itemId: "pet_rebirth_mm1_egg"},
  });
  assert.equal(hatched.ok, true);
  assert.equal(profileItemCount(hatched.profile, "pet_rebirth_mm1_egg"), 0);
  const publicPet = hatched.profile.petInstances.find((pet) => pet.instanceId === hatched.result.instanceId);
  assert.equal(publicPet.formId, "pet_rebirth_mm_stage1");
  assert.equal(publicPet.growthAuthority.modelVersion, "pet_growth_authority_v1");
  assert.equal(JSON.stringify(publicPet).includes("privateSeed"), false);

  const internalPet = internalProfileForAccount(service, registered.account.accountId)
    .petInstances.find((pet) => pet.instanceId === publicPet.instanceId);
  assert.equal(Object.hasOwn(internalPet, "individualSeed"), false);
  assert.equal(isValidPetPrivateSeed(internalPet.petGrowth.private.privateSeed), true);
  assert.equal(internalPet.petRebirthHelper.stage, 1);
  assert.deepEqual(internalPet.initialStats, internalPet.petGrowth.public.levelOneFourV);
  assert.deepEqual(internalPet.growthSpeciesLevel1Stats, internalPet.initialStats);
});

test("new rider eggs hatch authoritative tiger and thunder dragon growth", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const registered = service.register({username: "mountgrowth", password: "test1234", displayName: "骑宠玩家"});
  const profile = battleProfile("骑宠玩家", {level: 1, hp: 120, maxHp: 120}, null);
  profile.backpackSlots = [
    {itemId: "novice_tiger_egg", count: 1},
    {itemId: "thunder_dragon_egg", count: 1},
    ...Array.from({length: 13}, () => ({})),
  ];
  assert.equal(service.saveProfile(registered.session.token, {expectedRevision: 0, profile}).ok, true);

  const expected = [
    ["novice_tiger_egg", "novice_tiger_mount", "novice_tiger_mount_v1"],
    ["thunder_dragon_egg", "thunder_dragon_mount", "thunder_dragon_mount_v1"],
  ];
  for (const [itemId, formId, profileId] of expected) {
    const hatched = service.profileAction(registered.session.token, {
      action: "world_item_use",
      payload: {itemId},
    });
    assert.equal(hatched.ok, true);
    const publicPet = hatched.profile.petInstances.find((pet) => pet.instanceId === hatched.result.instanceId);
    assert.equal(publicPet.formId, formId);
    assert.equal(publicPet.growthSpeciesProfileId, profileId);
    assert.equal(publicPet.growthAuthority.modelVersion, "pet_growth_authority_v1");
    assert.equal(JSON.stringify(publicPet).includes("privateSeed"), false);
    const internalPet = internalProfileForAccount(service, registered.account.accountId)
      .petInstances.find((pet) => pet.instanceId === publicPet.instanceId);
    assert.equal(isValidPetPrivateSeed(internalPet.petGrowth.private.privateSeed), true);
  }
});

test("server bank tab unlock consumes diamonds and opens next bank page", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "bankunlock", "password": "test1234", "displayName": "银行开页"});
  const token = registered.session.token;
  const current = service.getProfile(token);
  assert.equal(current.ok, true);
  current.profile.diamonds = 200;
  assert.equal(service.saveProfile(token, {
    "expectedRevision": current.profileSummary.profileRevision,
    "profile": current.profile,
  }).ok, true);
  const funded = service.getProfile(token);
  assert.equal(funded.ok, true);
  const beforeDiamonds = funded.profile.diamonds;

  const unlock = service.profileAction(token, {"action": "bank_unlock_tab", "payload": {"tabIndex": 1}});
  assert.equal(unlock.ok, true);
  assert.equal(unlock.profile.bank.unlockedTabs, 2);
  assert.equal(unlock.profile.bank.slots.length, 90);
  assert.equal(unlock.profile.diamonds, beforeDiamonds - 100);

  const skipped = service.profileAction(token, {"action": "bank_unlock_tab", "payload": {"tabIndex": 3}});
  assert.equal(skipped.ok, false);
  assert.equal(skipped.code, "bank_tab_order");
});

test("bank tab unlock preserves unknown and equipment raw assets atomically", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const registered = seedService.register({username: "bankunlockfuture", password: "test1234", displayName: "未来银行号"});
  const token = registered.session.token;
  const current = seedService.getProfile(token);
  current.profile.diamonds = 200;
  assert.equal(seedService.saveProfile(token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile: current.profile,
  }).ok, true);

  const baseSeed = seedService.snapshot();
  for (const scenario of [
    {itemId: "future_relic_from_new_server", expectedCode: "bank_item_unknown"},
    {itemId: "weapon_wooden_club", expectedCode: "bank_equipment_transfer_unsupported"},
  ]) {
    const seed = structuredClone(baseSeed);
    const seedBinding = seed.profileBindings[registered.account.accountId];
    const profileDoc = seed.profiles[seedBinding.playerId].profile;
    profileDoc.diamonds = 200;
    profileDoc.bank = {
      stoneCoins: 37,
      items: [{itemId: scenario.itemId, count: 1, futureMeta: {grade: 9}}],
      slots: [
        {itemId: scenario.itemId, count: 1, futureMeta: {grade: 9}},
        ...Array.from({length: 89}, () => ({})),
      ],
      unlockedTabs: 1,
      schemaVersion: 1,
      futureField: {keep: true},
    };
    const bankBefore = structuredClone(profileDoc.bank);
    const revisionBefore = seedBinding.profileRevision;
    const service = createAuthService({store: createMemoryAuthStore(seed)});

    const unlock = service.profileAction(token, {action: "bank_unlock_tab", payload: {tabIndex: 1}});
    assert.equal(unlock.ok, false);
    assert.equal(unlock.code, scenario.expectedCode);
    const after = service.snapshot();
    const afterBinding = after.profileBindings[registered.account.accountId];
    const afterProfile = after.profiles[afterBinding.playerId].profile;
    assert.equal(after.profileBindings[registered.account.accountId].profileRevision, revisionBefore);
    assert.equal(afterProfile.diamonds, 200);
    assert.deepEqual(afterProfile.bank, bankBefore);
  }
});

test("bank tab unlock rejects conflicting, overflowing, and malformed raw banks", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const registered = seedService.register({username: "bankunlockshape", password: "test1234", displayName: "银行开页坏档号"});
  const token = registered.session.token;
  const current = seedService.getProfile(token);
  current.profile.diamonds = 200;
  assert.equal(seedService.saveProfile(token, {
    expectedRevision: current.profileSummary.profileRevision,
    profile: current.profile,
  }).ok, true);
  const baseSeed = seedService.snapshot();
  const scenarios = [
    {
      expectedCode: "bank_representation_conflict",
      bank: {
        stoneCoins: 25,
        items: [{itemId: "item_meat_small", count: 5}],
        slots: Array.from({length: 90}, () => ({})),
        unlockedTabs: 1,
        schemaVersion: 1,
      },
    },
    {
      expectedCode: "bank_representation_conflict",
      bank: {
        stoneCoins: 25,
        items: [{itemId: "item_meat_small", count: 10000}],
        slots: [{itemId: "item_meat_small", count: 10000}, ...Array.from({length: 89}, () => ({}))],
        unlockedTabs: 6,
        schemaVersion: 1,
      },
    },
    {
      expectedCode: "bank_schema_invalid",
      bank: {
        stoneCoins: 25,
        items: [{itemId: "item_meat_small", count: 5}],
        slots: [{itemId: "item_meat_small", count: 5}, ...Array.from({length: 89}, () => ({}))],
        unlockedTabs: 1,
        schemaVersion: "not-a-version",
      },
    },
  ];

  for (const scenario of scenarios) {
    const seed = structuredClone(baseSeed);
    const binding = seed.profileBindings[registered.account.accountId];
    const profile = seed.profiles[binding.playerId].profile;
    profile.bank = structuredClone(scenario.bank);
    const profileBefore = structuredClone(profile);
    const revisionBefore = binding.profileRevision;
    const service = createAuthService({store: createMemoryAuthStore(seed)});

    const unlock = service.profileAction(token, {action: "bank_unlock_tab", payload: {tabIndex: 1}});
    assert.equal(unlock.ok, false);
    assert.equal(unlock.code, scenario.expectedCode);
    const after = service.snapshot();
    const afterBinding = after.profileBindings[registered.account.accountId];
    assert.equal(afterBinding.profileRevision, revisionBefore);
    assert.deepEqual(after.profiles[afterBinding.playerId].profile, profileBefore);
  }
});

test("training partner action advances the partner tutorial quest server-side", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "partnerquest", "password": "test1234", "displayName": "陪练任务"});
  const token = registered.session.token;
  const profile = battleProfile("陪练任务", {"level": 1, "hp": 120, "maxHp": 120}, {
    "petId": "pet_partner_quest",
    "formId": "bui_normal_red_fire10",
    "name": "任务布伊",
    "level": 1,
    "hp": 90,
    "maxHp": 90,
    "attack": 22,
    "defense": 10,
    "quick": 42,
  });
  profile.stoneCoins = 40;
  profile.activeQuestId = "quest_training_partner_intro";
  profile.questStates = {
    "quest_first_victory": {"id": "quest_first_victory", "status": "claimed", "progress": 1},
    "quest_buy_spirit_armor": {"id": "quest_buy_spirit_armor", "status": "claimed", "progress": 1},
    "quest_equip_spirit_armor": {"id": "quest_equip_spirit_armor", "status": "claimed", "progress": 1},
    "quest_use_moist_spirit": {"id": "quest_use_moist_spirit", "status": "claimed", "progress": 1},
    "quest_buy_poison_spirit_armor": {"id": "quest_buy_poison_spirit_armor", "status": "claimed", "progress": 1},
    "quest_equip_poison_spirit_armor": {"id": "quest_equip_poison_spirit_armor", "status": "claimed", "progress": 1},
    "quest_training_partner_intro": {"id": "quest_training_partner_intro", "status": "active", "progress": 0},
  };
  assert.equal(service.saveProfile(token, {"expectedRevision": 0, profile}).ok, true);

  const trained = service.profileAction(token, {"action": "training_partner_set_count", "payload": {"count": 1}});
  assert.equal(trained.ok, true);
  assert.equal(trained.result.count, 1);
  assert.equal(trained.profile.trainingPartners.length, 1);
  assert.equal(trained.profile.stoneCoins, 50);
  assert.equal(trained.profile.activeQuestId, "quest_group_brawl");
  assert.equal(trained.profile.questStates.quest_training_partner_intro.status, "claimed");
  assert.equal(trained.profile.questStates.quest_training_partner_intro.progress, 1);
  assert.equal(trained.profile.questStates.quest_group_brawl.status, "active");
  assert.ok(trained.questMessages.some((message) => String(message).includes("完成任务「[1] 陪练伙伴」")));
  assert.ok(trained.logLines.some((message) => String(message).includes("完成任务「[1] 陪练伙伴」")));
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

test("shop writers preserve an unsafe future backpack without charging currency", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const registered = seedService.register({username: "shopfuturebag", password: "test1234", displayName: "未来背包商店号"});
  const token = registered.session.token;
  const profile = battleProfile("未来背包商店号", {level: 1, hp: 120, maxHp: 120}, null);
  profile.stoneCoins = 100;
  profile.backpackSlots = Array.from({length: 15}, () => ({}));
  assert.equal(seedService.saveProfile(token, {expectedRevision: 0, profile}).ok, true);
  const cleanSeed = seedService.snapshot();
  const seed = structuredClone(cleanSeed);
  const binding = seed.profileBindings[registered.account.accountId];
  seed.profiles[binding.playerId].profile.backpackSlots[0] = {
    itemId: "future_backpack_relic_999",
    count: 1,
    futureEnvelope: {assetId: "future_asset_shop"},
  };
  const profileBefore = structuredClone(seed.profiles[binding.playerId].profile);
  const revisionBefore = binding.profileRevision;
  const service = createAuthService({store: createMemoryAuthStore(seed)});

  const buy = service.shopTransaction(token, {
    mode: "buy",
    shopId: "firebud_item_shop",
    itemId: "item_meat_small",
    amount: 1,
  });
  assert.equal(buy.ok, false);
  assert.equal(buy.code, "backpack_item_unknown");
  const after = service.snapshot();
  assert.equal(after.profileBindings[registered.account.accountId].profileRevision, revisionBefore);
  assert.deepEqual(after.profiles[binding.playerId].profile, profileBefore);

  const futureEquipmentSeed = structuredClone(cleanSeed);
  const futureEquipmentProfile = futureEquipmentSeed.profiles[binding.playerId].profile;
  futureEquipmentProfile.backpackSlots[0] = {itemId: "weapon_wooden_club", count: 1};
  futureEquipmentProfile.equipmentInstances = {
    equip_future_shop: {
      schemaVersion: 2,
      instanceId: "equip_future_shop",
      itemId: "weapon_wooden_club",
      location: "backpack",
      slotId: "",
      durability: 30,
      enhancement: {itemId: "weapon_wooden_club", level: 7, history: []},
      wearCounters: {itemId: "weapon_wooden_club", attackCount: 0, hitCount: 0},
      expPillCharge: {},
      futureAffixes: [{id: "future_shop_power", value: 99}],
    },
  };
  futureEquipmentProfile.nextEquipmentInstanceSerial = 2;
  futureEquipmentProfile.equipmentSlotsVersion = 5;
  const futureEquipmentBefore = structuredClone(futureEquipmentProfile);
  const futureEquipmentService = createAuthService({store: createMemoryAuthStore(futureEquipmentSeed)});

  const futureEquipmentBuy = futureEquipmentService.shopTransaction(token, {
    mode: "buy",
    shopId: "firebud_item_shop",
    itemId: "item_meat_small",
    amount: 1,
  });
  assert.equal(futureEquipmentBuy.ok, false);
  assert.equal(futureEquipmentBuy.code, "equipment_instance_schema_future");
  const futureEquipmentAfter = futureEquipmentService.snapshot();
  assert.equal(futureEquipmentAfter.profileBindings[registered.account.accountId].profileRevision, revisionBefore);
  assert.deepEqual(futureEquipmentAfter.profiles[binding.playerId].profile, futureEquipmentBefore);
});

test("server shop transactions recover missing active main quest before buy progress", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "shopmissingactive", "password": "test1234", "displayName": "补给玩家"});
  const token = registered.session.token;
  const profile = battleProfile("补给玩家", {"level": 1, "hp": 120, "maxHp": 120}, null);
  profile.stoneCoins = 100;
  profile.backpackSlots = Array.from({"length": 15}, () => ({}));
  profile.activeQuestId = "";
  profile.unlockedAbilities = ["riding"];
  profile.questStates = {
    "quest_intro_talk": {"questId": "quest_intro_talk", "status": "claimed", "progress": 1},
    "quest_open_task_panel": {"questId": "quest_open_task_panel", "status": "claimed", "progress": 1},
    "quest_open_map_panel": {"questId": "quest_open_map_panel", "status": "claimed", "progress": 1},
    "quest_bank_intro": {"questId": "quest_bank_intro", "status": "claimed", "progress": 1},
    "quest_stable_intro": {"questId": "quest_stable_intro", "status": "claimed", "progress": 1},
    "quest_riding_certificate": {"questId": "quest_riding_certificate", "status": "claimed", "progress": 1},
    "quest_try_riding_tiger": {"questId": "quest_try_riding_tiger", "status": "claimed", "progress": 1},
    "quest_open_status_panel": {"questId": "quest_open_status_panel", "status": "claimed", "progress": 1},
  };
  assert.equal(service.saveProfile(token, {"expectedRevision": 0, profile}).ok, true);

  const buy = service.shopTransaction(token, {
    "mode": "buy",
    "shopId": "firebud_item_shop",
    "itemId": "item_meat_small",
    "amount": 1,
  });
  assert.equal(buy.ok, true);
  assert.equal(buy.transaction.price, 8);
  assert.equal(buy.profile.stoneCoins, 92);
  assert.equal(profileItemCount(buy.profile, "item_meat_small"), 1);
  assert.equal(profileItemCount(buy.profile, "capture_rope_basic"), 1);
  assert.equal(buy.profile.questStates.quest_set_battle_pet.status, "claimed");
  assert.equal(buy.profile.questStates.quest_buy_supply.status, "claimed");
  assert.equal(buy.profile.activeQuestId, "quest_use_meat");
  assert.equal(buy.questMessages.some((message) => String(message).includes("补给准备")), true);
});

test("server pet riding advances novice tiger tutorial quest", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "ridingquest", "password": "test1234", "displayName": "骑虎玩家"});
  const token = registered.session.token;
  const profile = battleProfile("骑虎玩家", {"level": 1, "hp": 120, "maxHp": 120}, null);
  profile.unlockedAbilities = ["riding"];
  profile.activeQuestId = "quest_try_riding_tiger";
  profile.questStates = {
    "quest_intro_talk": {"questId": "quest_intro_talk", "status": "claimed", "progress": 1},
    "quest_bank_intro": {"questId": "quest_bank_intro", "status": "claimed", "progress": 1},
    "quest_stable_intro": {"questId": "quest_stable_intro", "status": "claimed", "progress": 1},
    "quest_riding_certificate": {"questId": "quest_riding_certificate", "status": "claimed", "progress": 1},
    "quest_try_riding_tiger": {"questId": "quest_try_riding_tiger", "status": "active", "progress": 0},
  };
  profile.backpackSlots = [];
  profile.petInstances.push({
    "instanceId": "pet_tiger_quest",
    "petId": "pet_tiger_quest",
    "formId": "novice_tiger_mount",
    "templateId": "novice_tiger_mount",
    "speciesId": "novice_tiger_mount",
    "lineId": "tiger",
    "name": "新手老虎",
    "state": "standby",
    "level": 1,
    "hp": 80,
    "maxHp": 80,
    "attack": 20,
    "defense": 16,
    "quick": 28,
  });
  profile.petInstances.push({
    "instanceId": "pet_battle_quest",
    "petId": "pet_battle_quest",
    "formId": "rebirth_starter_four_spirit_cub",
    "templateId": "rebirth_starter_four_spirit_cub",
    "speciesId": "rebirth_starter_four_spirit_cub",
    "lineId": "four_spirit_cub",
    "name": "四灵幼兽",
    "state": "standby",
    "level": 1,
    "hp": 90,
    "maxHp": 90,
    "attack": 22,
    "defense": 18,
    "quick": 20,
  });
  assert.equal(service.saveProfile(token, {"expectedRevision": 0, profile}).ok, true);

  const riding = service.profileAction(token, {
    "action": "pet_state_cycle",
    "payload": {"instanceId": "pet_tiger_quest"},
  });
  assert.equal(riding.ok, true);
  assert.equal(riding.result.state, "riding");
  assert.equal(riding.profile.ridePetInstanceId, "pet_tiger_quest");
  assert.equal(riding.profile.questStates.quest_try_riding_tiger.status, "claimed");
  assert.equal(riding.profile.activeQuestId, "quest_set_battle_pet");
  assert.equal(riding.questMessages.some((message) => String(message).includes("试骑新手老虎")), true);

  const legacyPetReclaim = service.profileAction(token, {"action": "battle_pet_tutorial_egg_reclaim"});
  assert.equal(legacyPetReclaim.ok, false);
  assert.equal(legacyPetReclaim.code, "battle_pet_tutorial_pet_owned");

  const tigerAsBattle = service.profileAction(token, {
    "action": "pet_state_cycle",
    "payload": {"instanceId": "pet_tiger_quest"},
  });
  assert.equal(tigerAsBattle.ok, true);
  assert.equal(tigerAsBattle.result.state, "battle");
  assert.equal(tigerAsBattle.profile.questStates.quest_set_battle_pet.status, "active");
  assert.equal(tigerAsBattle.profile.activeQuestId, "quest_set_battle_pet");

  for (const expectedState of ["rest", "standby", "riding"]) {
    const restored = service.profileAction(token, {
      "action": "pet_state_cycle",
      "payload": {"instanceId": "pet_tiger_quest"},
    });
    assert.equal(restored.ok, true);
    assert.equal(restored.result.state, expectedState);
  }

  const battlePet = service.profileAction(token, {
    "action": "pet_state_cycle",
    "payload": {"instanceId": "pet_battle_quest"},
  });
  assert.equal(battlePet.ok, true);
  assert.equal(battlePet.result.state, "battle");
  assert.equal(battlePet.profile.ridePetInstanceId, "pet_tiger_quest");
  assert.equal(battlePet.profile.activePetInstanceId, "pet_battle_quest");
  assert.equal(battlePet.profile.questStates.quest_set_battle_pet.status, "claimed");
  assert.equal(battlePet.profile.activeQuestId, "quest_open_status_panel");
  assert.equal(battlePet.questMessages.some((message) => String(message).includes("设置战斗宠物")), true);
});

test("riding tutorial reconciles an already active non-mount battle pet", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "ridingreadyquest", "password": "test1234", "displayName": "双宠玩家"});
  const token = registered.session.token;
  const profile = battleProfileWithPets("双宠玩家", {"level": 1, "hp": 120, "maxHp": 120}, [
    {"petId": "pet_ready_tiger", "formId": "novice_tiger_mount", "name": "新手老虎", "state": "standby", "hp": 80, "maxHp": 80},
    {"petId": "pet_ready_battle", "formId": "rebirth_starter_four_spirit_cub", "name": "四灵幼兽", "state": "battle", "hp": 90, "maxHp": 90},
  ]);
  profile.unlockedAbilities = ["riding"];
  profile.activeQuestId = "quest_try_riding_tiger";
  profile.questStates = {
    "quest_try_riding_tiger": {"questId": "quest_try_riding_tiger", "status": "active", "progress": 0},
  };
  assert.equal(service.saveProfile(token, {"expectedRevision": 0, profile}).ok, true);

  const riding = service.profileAction(token, {
    "action": "pet_state_cycle",
    "payload": {"instanceId": "pet_ready_tiger"},
  });
  assert.equal(riding.ok, true);
  assert.equal(riding.result.state, "riding");
  assert.equal(riding.profile.ridePetInstanceId, "pet_ready_tiger");
  assert.equal(riding.profile.activePetInstanceId, "pet_ready_battle");
  assert.equal(riding.profile.questStates.quest_try_riding_tiger.status, "claimed");
  assert.equal(riding.profile.questStates.quest_set_battle_pet.status, "claimed");
  assert.equal(riding.profile.activeQuestId, "quest_open_status_panel");
  assert.equal(riding.questMessages.some((message) => String(message).includes("设置战斗宠物")), true);
});

test("battle pet tutorial egg can be discarded, reclaimed, and hatches a bound pet", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "battleeggreclaim", "password": "test1234", "displayName": "补领玩家"});
  const token = registered.session.token;
  const profile = battleProfile("补领玩家", {"level": 1, "hp": 120, "maxHp": 120}, null);
  profile.activeQuestId = "quest_set_battle_pet";
  profile.questStates = {
    "quest_try_riding_tiger": {"questId": "quest_try_riding_tiger", "status": "claimed", "progress": 1},
    "quest_set_battle_pet": {"questId": "quest_set_battle_pet", "status": "active", "progress": 0},
  };
  profile.backpackSlots = [
    {"itemId": "novice_battle_pet_egg", "count": 1},
    ...Array.from({"length": 14}, () => ({})),
  ];
  assert.equal(service.saveProfile(token, {"expectedRevision": 0, profile}).ok, true);

  const discarded = service.profileAction(token, {
    "action": "backpack_discard_item",
    "payload": {"sourceSlotIndex": 0, "quantity": 1},
  });
  assert.equal(discarded.ok, true);
  assert.equal(profileItemCount(discarded.profile, "novice_battle_pet_egg"), 0);

  const fullProfile = discarded.profile;
  fullProfile.backpackSlots = Array.from({"length": 15}, () => ({"itemId": "item_meat_small", "count": 20}));
  assert.equal(service.saveProfile(token, {
    "expectedRevision": discarded.profileSummary.profileRevision,
    "profile": fullProfile,
  }).ok, true);
  const fullReclaim = service.profileAction(token, {"action": "battle_pet_tutorial_egg_reclaim"});
  assert.equal(fullReclaim.ok, false);
  assert.equal(fullReclaim.code, "backpack_full");
  assert.equal(service.profileAction(token, {
    "action": "backpack_discard_item",
    "payload": {"sourceSlotIndex": 0, "quantity": 20},
  }).ok, true);

  const reclaimed = service.profileAction(token, {"action": "battle_pet_tutorial_egg_reclaim"});
  assert.equal(reclaimed.ok, true);
  assert.equal(profileItemCount(reclaimed.profile, "novice_battle_pet_egg"), 1);

  const banked = service.bankDeposit(token, {"items": [{"itemId": "novice_battle_pet_egg", "count": 1}]});
  assert.equal(banked.ok, true);
  const reclaimWhileBanked = service.profileAction(token, {"action": "battle_pet_tutorial_egg_reclaim"});
  assert.equal(reclaimWhileBanked.ok, false);
  assert.equal(reclaimWhileBanked.code, "battle_pet_tutorial_egg_banked");
  const withdrawn = service.bankWithdraw(token, {"items": [{"itemId": "novice_battle_pet_egg", "count": 1}]});
  assert.equal(withdrawn.ok, true);

  const duplicate = service.profileAction(token, {"action": "battle_pet_tutorial_egg_reclaim"});
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.code, "battle_pet_tutorial_egg_owned");
  assert.equal(profileItemCount(service.getProfile(token).profile, "novice_battle_pet_egg"), 1);

  const hatched = service.profileAction(token, {
    "action": "world_item_use",
    "payload": {"itemId": "novice_battle_pet_egg"},
  });
  assert.equal(hatched.ok, true);
  assert.equal(profileItemCount(hatched.profile, "novice_battle_pet_egg"), 0);
  const boundPet = hatched.profile.petInstances.find((pet) => pet.formId === "bui_novice_sprout_earth5_wind5");
  assert.ok(boundPet);
  assert.equal(boundPet.binding, "bound");

  const dropBoundPet = service.profileAction(token, {
    "action": "pet_drop",
    "payload": {"instanceId": boundPet.instanceId, "mapId": "firebud_village_gate", "cell": [10, 10]},
  });
  assert.equal(dropBoundPet.ok, false);
  assert.equal(dropBoundPet.code, "pet_bound");

  const reclaimWithPet = service.profileAction(token, {"action": "battle_pet_tutorial_egg_reclaim"});
  assert.equal(reclaimWithPet.ok, false);
  assert.equal(reclaimWithPet.code, "battle_pet_tutorial_pet_owned");

  const storedBoundPet = service.profileAction(token, {
    "action": "pet_stable_toggle",
    "payload": {"instanceId": boundPet.instanceId},
  });
  assert.equal(storedBoundPet.ok, true);
  assert.equal(storedBoundPet.profile.petInstances.find((pet) => pet.instanceId === boundPet.instanceId).state, "storage");
  const withdrewBoundPet = service.profileAction(token, {
    "action": "pet_stable_toggle",
    "payload": {"instanceId": boundPet.instanceId},
  });
  assert.equal(withdrewBoundPet.ok, true);
  assert.equal(withdrewBoundPet.profile.petInstances.find((pet) => pet.instanceId === boundPet.instanceId).state, "standby");

  const battleWithoutCurrentMount = service.profileAction(token, {
    "action": "pet_state_cycle",
    "payload": {"instanceId": boundPet.instanceId},
  });
  assert.equal(battleWithoutCurrentMount.ok, true);
  assert.equal(battleWithoutCurrentMount.result.state, "battle");
  assert.equal(battleWithoutCurrentMount.profile.questStates.quest_set_battle_pet.status, "claimed");
  assert.equal(battleWithoutCurrentMount.profile.activeQuestId, "quest_open_status_panel");
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
  const boughtInstanceId = Object.keys(buy.profile.equipmentInstances)[0];
  assert.ok(boughtInstanceId);
  assert.equal(buy.profile.equipmentInstances[boughtInstanceId].itemId, "weapon_wooden_club");
  assert.equal(buy.profile.equipmentInstances[boughtInstanceId].location, "backpack");
  assert.equal(buy.profile.equipmentInstances[boughtInstanceId].source, "shop");

  const equipped = service.equipmentEquip(token, {"itemId": "weapon_wooden_club"});
  assert.equal(equipped.ok, true);
  assert.equal(equipped.profileSummary.profileRevision, 3);
  assert.equal(equipped.profile.equipmentSlots.right_hand_weapon, "weapon_wooden_club");
  assert.equal(equipped.profile.equipmentSlotInstanceIds.right_hand_weapon, boughtInstanceId);
  assert.equal(equipped.profile.equipmentInstances[boughtInstanceId].location, "equipped");
  assert.equal(profileItemCount(equipped.profile, "weapon_wooden_club"), 0);
  assert.equal(service.getProfile(token).profileSummary.profileRevision, 3);
});

test("selling or discarding equipment removes its instance and rebuy cannot resurrect enhancement", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const registered = service.register({"username": "equipassetwriter", "password": "test1234", "displayName": "装备资产号"});
  const token = registered.session.token;
  const profile = battleProfile("装备资产号", {"level": 1, "hp": 120, "maxHp": 120}, null);
  profile.stoneCoins = 500;
  profile.backpackSlots = Array.from({"length": 15}, () => ({}));
  assert.equal(service.saveProfile(token, {"expectedRevision": 0, profile}).ok, true);

  const firstBuy = service.shopTransaction(token, {
    "mode": "buy",
    "shopId": "firebud_equipment_shop",
    "itemId": "weapon_wooden_club",
    "amount": 1,
  });
  assert.equal(firstBuy.ok, true);
  const firstInstanceId = Object.keys(firstBuy.profile.equipmentInstances)[0];
  const equipped = service.equipmentEquip(token, {"itemId": "weapon_wooden_club"});
  assert.equal(equipped.ok, true);

  const enhancedProfile = service.getProfile(token);
  enhancedProfile.profile.equipmentEnhancement.right_hand_weapon = {
    itemId: "weapon_wooden_club",
    level: 2,
    history: [],
  };
  enhancedProfile.profile.equipmentInstances[firstInstanceId].enhancement = {
    itemId: "weapon_wooden_club",
    level: 2,
    history: [],
  };
  assert.equal(service.saveProfile(token, {
    expectedRevision: enhancedProfile.profileSummary.profileRevision,
    profile: enhancedProfile.profile,
  }).ok, true);
  assert.equal(service.equipmentUnequip(token, {slotId: "right_hand_weapon"}).ok, true);

  const sold = service.shopTransaction(token, {
    mode: "sell",
    shopId: "firebud_equipment_shop",
    itemId: "weapon_wooden_club",
    amount: 1,
  });
  assert.equal(sold.ok, true);
  assert.equal(profileItemCount(sold.profile, "weapon_wooden_club"), 0);
  assert.equal(sold.profile.equipmentInstances[firstInstanceId], undefined);

  const secondBuy = service.shopTransaction(token, {
    mode: "buy",
    shopId: "firebud_equipment_shop",
    itemId: "weapon_wooden_club",
    amount: 1,
  });
  assert.equal(secondBuy.ok, true);
  const secondInstanceId = Object.keys(secondBuy.profile.equipmentInstances)[0];
  assert.notEqual(secondInstanceId, firstInstanceId);
  assert.equal(secondBuy.profile.equipmentInstances[secondInstanceId].enhancement.level, 0);

  const discarded = service.profileAction(token, {
    action: "backpack_discard_item",
    payload: {sourceSlotIndex: 0, quantity: 1},
  });
  assert.equal(discarded.ok, true);
  assert.equal(profileItemCount(discarded.profile, "weapon_wooden_club"), 0);
  assert.deepEqual(discarded.profile.equipmentInstances, {});
});

test("equipment slot mismatch fails without rewriting or charging the mapped instance", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const registered = seedService.register({username: "equipmismatch", password: "test1234", displayName: "错配装备号"});
  const token = registered.session.token;
  const profile = battleProfile("错配装备号", {level: 1, hp: 120, maxHp: 120}, null);
  profile.stoneCoins = 500;
  profile.backpackSlots = [
    {itemId: "equip_frag_wood_basic", count: 5},
    ...Array.from({length: 14}, () => ({})),
  ];
  profile.equipmentSlots = {right_hand_weapon: "weapon_wooden_club"};
  profile.equipmentDurability = {right_hand_weapon: 30};
  profile.equipmentEnhancement = {right_hand_weapon: {itemId: "weapon_wooden_club", level: 0, history: []}};
  profile.equipmentWearCounters = {right_hand_weapon: {itemId: "weapon_wooden_club", attackCount: 0, hitCount: 0}};
  profile.equipmentInstances = {
    equip_000001: {
      schemaVersion: 1,
      instanceId: "equip_000001",
      itemId: "weapon_wooden_club",
      location: "equipped",
      slotId: "right_hand_weapon",
      durability: 30,
      enhancement: {itemId: "weapon_wooden_club", level: 0, history: []},
      wearCounters: {itemId: "weapon_wooden_club", attackCount: 0, hitCount: 0},
      expPillCharge: {},
      source: "legacy_mismatch",
    },
  };
  profile.equipmentSlotInstanceIds = {right_hand_weapon: "equip_000001"};
  profile.equipmentSlotsVersion = 5;
  assert.equal(seedService.saveProfile(token, {expectedRevision: 0, profile}).ok, true);
  const seed = seedService.snapshot();
  const binding = seed.profileBindings[registered.account.accountId];
  const mismatched = seed.profiles[binding.playerId].profile.equipmentInstances.equip_000001;
  mismatched.itemId = "weapon_stone_axe";
  mismatched.enhancement.itemId = "weapon_stone_axe";
  mismatched.wearCounters.itemId = "weapon_stone_axe";
  const service = createAuthService({store: createMemoryAuthStore(seed)});
  const before = service.getProfile(token);

  const result = service.equipmentEnhance(token, {slotId: "right_hand_weapon"});

  assert.equal(result.ok, false);
  assert.equal(result.code, "equipment_slot_instance_conflict");
  const after = service.getProfile(token);
  assert.equal(after.profileSummary.profileRevision, before.profileSummary.profileRevision);
  assert.equal(after.profile.stoneCoins, before.profile.stoneCoins);
  assert.equal(after.profile.equipmentInstances.equip_000001.itemId, "weapon_stone_axe");
  assert.equal(after.profile.equipmentInstances.equip_000001.enhancement.level, 0);
});

test("using a stackable equipment exp pill consumes exactly one matching instance", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const registered = service.register({username: "equipworldpill", password: "test1234", displayName: "经验丹实例号"});
  const token = registered.session.token;
  const profile = battleProfile("经验丹实例号", {level: 1, hp: 120, maxHp: 120}, null);
  profile.backpackSlots = [
    {itemId: "item_player_exp_pill_lv131", count: 2},
    ...Array.from({length: 14}, () => ({})),
  ];
  profile.equipmentInstances = {};
  profile.equipmentSlotInstanceIds = {};
  profile.equipmentSlotsVersion = 5;
  profile.nextEquipmentInstanceSerial = 1;
  const grantProfile = structuredClone(profile);
  grantProfile.equipmentInstances = {
    equip_000001: {
      schemaVersion: 1,
      instanceId: "equip_000001",
      itemId: "item_player_exp_pill_lv131",
      location: "backpack",
      slotId: "",
      durability: 0,
      enhancement: {},
      wearCounters: {},
      expPillCharge: {itemId: "item_player_exp_pill_lv131", level: 131, exp: 0, nextExp: 1},
      source: "test",
    },
    equip_000002: {
      schemaVersion: 1,
      instanceId: "equip_000002",
      itemId: "item_player_exp_pill_lv131",
      location: "backpack",
      slotId: "",
      durability: 0,
      enhancement: {},
      wearCounters: {},
      expPillCharge: {itemId: "item_player_exp_pill_lv131", level: 131, exp: 0, nextExp: 1},
      source: "test",
    },
  };
  grantProfile.nextEquipmentInstanceSerial = 3;
  grantProfile.equipmentSlotsVersion = 5;
  assert.equal(service.saveProfile(token, {expectedRevision: 0, profile: grantProfile}).ok, true);

  const used = service.profileAction(token, {
    action: "world_item_use",
    payload: {itemId: "item_player_exp_pill_lv131"},
  });

  assert.equal(used.ok, true);
  assert.equal(profileItemCount(used.profile, "item_player_exp_pill_lv131"), 1);
  assert.equal(Object.keys(used.profile.equipmentInstances).length, 1);
  assert.equal(used.profile.player.level, 131);
});

test("Lv140 overflow exp charges the exact equipped pill and reports the stored gain", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const registered = service.register({username: "equipoverflowpill", password: "test1234", displayName: "满级充丹号"});
  const token = registered.session.token;
  const profile = battleProfile("满级充丹号", {level: 140, exp: 0, nextExp: 1, hp: 120, maxHp: 120}, null);
  profile.backpackSlots = [
    {itemId: "item_exp_pill_lv1", count: 1},
    {itemId: "item_player_exp_pill_lv131", count: 1},
    ...Array.from({length: 13}, () => ({})),
  ];
  profile.equipmentSlots = {};
  profile.equipmentExpPillCharge = {};
  profile.equipmentInstances = {
    equip_empty_pill: {
      schemaVersion: 1,
      instanceId: "equip_empty_pill",
      itemId: "item_exp_pill_lv1",
      location: "backpack",
      slotId: "",
      durability: 0,
      enhancement: {},
      wearCounters: {},
      expPillCharge: {itemId: "item_exp_pill_lv1", level: 1, exp: 0, nextExp: 1, futureCalibration: {keep: true}},
      source: "test",
    },
    equip_consumable_pill: {
      schemaVersion: 1,
      instanceId: "equip_consumable_pill",
      itemId: "item_player_exp_pill_lv131",
      location: "backpack",
      slotId: "",
      durability: 0,
      enhancement: {},
      wearCounters: {},
      expPillCharge: {itemId: "item_player_exp_pill_lv131", level: 131, exp: 0, nextExp: 1},
      source: "test",
    },
  };
  profile.equipmentSlotInstanceIds = {};
  profile.nextEquipmentInstanceSerial = 3;
  profile.equipmentSlotsVersion = 5;
  assert.equal(service.saveProfile(token, {expectedRevision: 0, profile}).ok, true);

  const equipped = service.equipmentEquip(token, {
    itemId: "item_exp_pill_lv1",
    equipmentInstanceId: "equip_empty_pill",
  });
  assert.equal(equipped.ok, true);
  assert.equal(equipped.profile.equipmentSlotInstanceIds.exp_pill, "equip_empty_pill");
  assert.equal(equipped.profile.equipmentExpPillCharge.level, 1);
  assert.ok(equipped.profile.equipmentExpPillCharge.nextExp > 1);
  assert.deepEqual(
    equipped.profile.equipmentInstances.equip_empty_pill.expPillCharge.futureCalibration,
    {keep: true},
  );

  const used = service.profileAction(token, {
    action: "world_item_use",
    payload: {
      itemId: "item_player_exp_pill_lv131",
      equipmentInstanceIds: ["equip_consumable_pill"],
    },
  });
  assert.equal(used.ok, true);
  assert.equal(used.profile.player.level, 140);
  assert.equal(profileItemCount(used.profile, "item_player_exp_pill_lv131"), 0);
  assert.equal(used.profile.equipmentInstances.equip_consumable_pill, undefined);
  assert.equal(used.profile.equipmentSlotInstanceIds.exp_pill, "equip_empty_pill");
  assert.ok(used.result.chargedExp > 0);
  assert.equal(used.result.unchargedExp, 0);
  assert.equal(used.result.expPillItemId, "item_exp_pill_lv1");
  assert.equal(used.result.expPillInstanceId, "equip_empty_pill");
  assert.equal(used.result.expPillLevel, 131);
  assert.match(used.message, /已储入经验丹/);
  assert.deepEqual(
    used.profile.equipmentExpPillCharge,
    {
      itemId: "item_exp_pill_lv1",
      level: 131,
      exp: 0,
      nextExp: used.profile.equipmentExpPillCharge.nextExp,
    },
  );
  assert.ok(used.profile.equipmentExpPillCharge.nextExp > 1);
  assert.deepEqual(
    {
      itemId: used.profile.equipmentInstances.equip_empty_pill.expPillCharge.itemId,
      level: used.profile.equipmentInstances.equip_empty_pill.expPillCharge.level,
      exp: used.profile.equipmentInstances.equip_empty_pill.expPillCharge.exp,
      nextExp: used.profile.equipmentInstances.equip_empty_pill.expPillCharge.nextExp,
    },
    used.profile.equipmentExpPillCharge,
  );
  assert.deepEqual(
    used.profile.equipmentInstances.equip_empty_pill.expPillCharge.futureCalibration,
    {keep: true},
  );
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
  profile.equipmentSlotsVersion = 5;
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
  assert.equal(equipped.profile.activeQuestId, "quest_open_equipment_panel");
  assert.equal(equipped.questMessages.some((message) => String(message).includes("装备木棒")), true);

  const missing = service.equipmentEquip(token, {"itemId": "weapon_wooden_club"});
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "equipment_item_missing");
  assert.equal(service.getProfile(token).profileSummary.profileRevision, 2);

  const unequipped = service.equipmentUnequip(token, {"slotId": "right_hand_weapon"});
  assert.equal(unequipped.ok, true);
  assert.equal(unequipped.profileSummary.profileRevision, 3);
  assert.equal(unequipped.equipment.slot, "right_hand_weapon");
  assert.equal(unequipped.equipment.itemId, "weapon_wooden_club");
  assert.equal(unequipped.profile.equipmentSlots.right_hand_weapon, undefined);
  assert.equal(unequipped.profile.equipmentSlotInstanceIds.right_hand_weapon, undefined);
  assert.equal(unequipped.profile.equipmentInstances.equip_000001.location, "backpack");
  assert.equal(profileItemCount(unequipped.profile, "weapon_wooden_club"), 1);
  assert.equal(service.getProfile(token).profileSummary.profileRevision, 3);
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
  profile.equipmentSlotsVersion = 5;
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
  profile.equipmentSlotsVersion = 5;
  profile.nextEquipmentInstanceSerial = 2;
  assert.equal(service.saveProfile(token, {"expectedRevision": 0, profile}).ok, true);

  const unsafeSeed = service.snapshot();
  const unsafeBinding = unsafeSeed.profileBindings[registered.account.accountId];
  unsafeSeed.profiles[unsafeBinding.playerId].profile.backpackSlots[0] = {
    itemId: "future_repair_relic_999",
    count: 1,
    futureEnvelope: {schemaVersion: 99},
  };
  const unsafeBefore = structuredClone(unsafeSeed.profiles[unsafeBinding.playerId].profile);
  const unsafeRevision = unsafeBinding.profileRevision;
  const unsafeService = createAuthService({store: createMemoryAuthStore(unsafeSeed)});
  const blockedRepair = unsafeService.equipmentRepairAll(token);
  assert.equal(blockedRepair.ok, false);
  assert.equal(blockedRepair.code, "backpack_item_unknown");
  const unsafeAfter = unsafeService.snapshot();
  assert.equal(unsafeAfter.profileBindings[registered.account.accountId].profileRevision, unsafeRevision);
  assert.deepEqual(unsafeAfter.profiles[unsafeBinding.playerId].profile, unsafeBefore);

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
  profile.equipmentSlotInstanceIds = {};
  profile.equipmentSlotsVersion = 5;
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
  profile.equipmentSlots = {"accessory_left": "accessory_firebud_charm"};
  profile.equipmentDurability = {"accessory_left": 30};
  profile.equipmentSlotInstanceIds = {"accessory_left": "equip_rebirth_firebud_charm"};
  profile.equipmentInstances = {
    "equip_rebirth_firebud_charm": {
      "schemaVersion": 1,
      "instanceId": "equip_rebirth_firebud_charm",
      "itemId": "accessory_firebud_charm",
      "location": "equipped",
      "slotId": "accessory_left",
      "durability": 30,
      "enhancement": {"itemId": "accessory_firebud_charm", "level": 0, "history": []},
      "wearCounters": {"itemId": "accessory_firebud_charm", "attackCount": 0, "hitCount": 0},
      "expPillCharge": {},
      "source": "test_fixture"
    },
  };
  profile.equipmentSlotsVersion = 5;
  assert.equal(service.saveProfile(token, {"expectedRevision": 0, profile}).ok, true);
  service.updatePlayerPosition(token, {"mapId": "level_grass_trial_ground", "cellX": 12, "cellY": 8, "facing": "east", "moving": false});

  const reborn = service.playerRebirth(token);
  assert.equal(reborn.ok, true);
  assert.equal(reborn.profileSummary.profileRevision, 2);
  assert.equal(reborn.profile.rebirthCount, 1);
  assert.equal(reborn.profile.player.level, 1);
  assert.equal(reborn.profile.player.exp, 0);
  assert.equal(reborn.profile.player.nextExp, 122);
  assert.deepEqual(reborn.profile.player.baseStats, reborn.rebirth.afterStats);
  assert.equal(reborn.profile.player.maxHp, reborn.rebirth.afterStats.maxHp + 8);
  assert.equal(reborn.profile.player.hp, reborn.rebirth.afterStats.maxHp);
  assert.equal(reborn.profile.rebirthHistory.length, 1);
  assert.equal(reborn.profile.rebirthHistory[0].toRebirth, 1);
  assert.equal(reborn.profile.rebirthHistory[0].questId, "rebirth_1");
  assert.equal(profileItemCount(reborn.profile, "ring_earth_trial"), 0);
  assert.equal(profileItemCount(reborn.profile, "ring_water_trial"), 0);
  assert.equal(profileItemCount(reborn.profile, "ring_fire_trial"), 0);
  assert.equal(profileItemCount(reborn.profile, "ring_wind_trial"), 0);
  assert.equal(profileItemCount(reborn.profile, "armor_grace_cloth_3"), 1);
  const rebirthEquipmentInstances = Object.values(reborn.profile.equipmentInstances || {}).filter((instance) => (
    instance && instance.itemId === "armor_grace_cloth_3" && instance.location === "backpack"
  ));
  assert.equal(rebirthEquipmentInstances.length, 1);
  assert.equal(rebirthEquipmentInstances[0].source, "player_rebirth_1");
  assert.equal(reborn.profile.rebirthTrialProofs.shadow_oath_rebirth_guardian, undefined);
  assert.equal(reborn.profile.petInstances.some((pet) => pet.formId === "rebirth_beast_earth_lv50"), false);
  const starter = reborn.profile.petInstances.find((pet) => pet.formId === "rebirth_starter_earth_cub");
  assert.equal(Boolean(starter), true);
  assert.equal(starter.state, "battle");
  assert.equal(reborn.profile.activePetInstanceId, starter.instanceId);
  const internalStarter = internalProfileForAccount(service, registered.account.accountId)
    .petInstances.find((pet) => pet.instanceId === starter.instanceId);
  assert.equal(Object.hasOwn(internalStarter, "individualSeed"), false);
  assert.equal(internalStarter.growthModelVersion, "pet_growth_authority_v1");
  assert.equal(isValidPetPrivateSeed(internalStarter.petGrowth.private.privateSeed), true);
  assert.deepEqual(internalStarter.initialStats, {
    maxHp: internalStarter.maxHp,
    attack: internalStarter.attack,
    defense: internalStarter.defense,
    quick: internalStarter.quick,
  });
  assert.deepEqual(internalStarter.growthSpeciesLevel1Stats, internalStarter.initialStats);
  assert.equal(starter.growthAuthority.modelVersion, "pet_growth_authority_v1");
  assert.equal(JSON.stringify(starter).includes("privateSeed"), false);
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

test("player rebirth reserves its equipment reward after simulating consumed trial slots", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const registered = service.register({username: "rebirthfullbag", password: "test1234", displayName: "转生满包号"});
  const token = registered.session.token;
  const profile = playerRebirthReadyProfile("转生满包号");
  profile.backpackSlots = profile.backpackSlots.map((slot) => (
    slot && slot.itemId ? slot : {itemId: "item_meat_small", count: 99}
  ));
  assert.equal(profile.backpackSlots.every((slot) => slot && slot.itemId), true);
  assert.equal(service.saveProfile(token, {expectedRevision: 0, profile}).ok, true);
  const reborn = service.playerRebirth(token);

  assert.equal(reborn.ok, true);
  assert.equal(profileItemCount(reborn.profile, "ring_earth_trial"), 0);
  assert.equal(profileItemCount(reborn.profile, "armor_grace_cloth_3"), 1);
  assert.equal(Object.values(reborn.profile.equipmentInstances || {}).filter((instance) => (
    instance && instance.itemId === "armor_grace_cloth_3"
  )).length, 1);
});

test("player rebirth instance preflight fails before consuming any requirement", () => {
  const seedService = createAuthService({store: createMemoryAuthStore()});
  const registered = seedService.register({username: "rebirthfutureequip", password: "test1234", displayName: "转生未来装备号"});
  const token = registered.session.token;
  const profile = playerRebirthReadyProfile("转生未来装备号");
  const emptyIndex = profile.backpackSlots.findIndex((slot) => !slot || !slot.itemId);
  assert.ok(emptyIndex >= 0);
  profile.backpackSlots[emptyIndex] = {itemId: "weapon_wooden_club", count: 1};
  profile.equipmentInstances = {
    equip_future_rebirth: {
      schemaVersion: 1,
      instanceId: "equip_future_rebirth",
      itemId: "weapon_wooden_club",
      location: "backpack",
      slotId: "",
      durability: 30,
      enhancement: {itemId: "weapon_wooden_club", level: 0, history: []},
      wearCounters: {itemId: "weapon_wooden_club", attackCount: 0, hitCount: 0},
      expPillCharge: {},
      source: "future_test",
    },
  };
  profile.equipmentSlotInstanceIds = {};
  profile.equipmentSlotsVersion = 5;
  assert.equal(seedService.saveProfile(token, {expectedRevision: 0, profile}).ok, true);
  const seed = seedService.snapshot();
  const binding = seed.profileBindings[registered.account.accountId];
  seed.profiles[binding.playerId].profile.equipmentInstances.equip_future_rebirth.schemaVersion = 2;
  seed.profiles[binding.playerId].profile.equipmentInstances.equip_future_rebirth.affixes = [{id: "future", value: 1}];
  const service = createAuthService({store: createMemoryAuthStore(seed)});
  const before = service.getProfile(token);

  const reborn = service.playerRebirth(token);

  assert.equal(reborn.ok, false);
  assert.equal(reborn.code, "equipment_instance_schema_future");
  const after = service.getProfile(token);
  assert.equal(after.profileSummary.profileRevision, before.profileSummary.profileRevision);
  assert.equal(profileItemCount(after.profile, "ring_earth_trial"), 1);
  assert.equal(after.profile.petInstances.some((pet) => pet.formId === "rebirth_beast_earth_lv50"), true);
  assert.equal(profileItemCount(after.profile, "armor_grace_cloth_3"), 0);
  assert.deepEqual(after.profile.equipmentInstances.equip_future_rebirth.affixes, [{id: "future", value: 1}]);
});
