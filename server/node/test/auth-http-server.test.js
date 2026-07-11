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
const {loadPetEncounterCatalog} = require("../src/auth/pet-encounter-authority");
const {createPetEncounterPermitAuthority} = require("../src/auth/pet-encounter-permit-authority");

const strictPetEncounterCatalog = loadPetEncounterCatalog();

test("HTTP server exposes auth and session endpoints", async (t) => {
  const store = createMemoryAuthStore();
  const service = createAuthService({store});
  const server = createHttpServer({service, store});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const {port} = server.address();
  const base = `http://127.0.0.1:${port}`;

  const health = await fetchJson(`${base}/health`);
  assert.equal(health.ok, true);
  assert.equal(health.protocolVersion, PROTOCOL_VERSION);
  assert.equal(health.serverVersion, SERVER_VERSION);
  assert.equal(health.storage.ok, true);
  assert.equal(health.storage.checked, true);
  assert.equal(health.storage.mode, "memory");
  assert.equal(health.eventStream.clients, 0);

  const registered = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httpuser", "password": "test1234"}),
  });
  assert.equal(registered.ok, true);
  assert.equal(registered.protocolVersion, PROTOCOL_VERSION);
  assert.equal(registered.hotUpdate.required, false);

  const backoffUser = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httpbackoff", "password": "test1234"}),
  });
  assert.equal(backoffUser.ok, true);
  for (let index = 0; index < 5; index += 1) {
    const failed = await fetchJson(`${base}/auth/login`, {
      "method": "POST",
      "headers": {"x-forwarded-for": "203.0.113.20"},
      "body": JSON.stringify({"username": "httpbackoff", "password": "wrong123"}),
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.code, "wrong_password");
  }
  const backoffResponse = await fetch(`${base}/auth/login`, {
    "method": "POST",
    "headers": {
      "content-type": "application/json",
      [CLIENT_VERSION_HEADER]: SERVER_VERSION,
      [CLIENT_PROTOCOL_HEADER]: String(PROTOCOL_VERSION),
      "x-forwarded-for": "203.0.113.20",
    },
    "body": JSON.stringify({"username": "httpbackoff", "password": "test1234"}),
  });
  const backoff = await backoffResponse.json();
  assert.equal(backoffResponse.status, 429);
  assert.equal(backoff.ok, false);
  assert.equal(backoff.code, "auth_backoff");

  const session = await fetchJson(`${base}/auth/session`, {
    "headers": {"authorization": `Bearer ${registered.session.token}`},
  });
  assert.equal(session.ok, true);
  assert.equal(session.account.username, "httpuser");
  assert.equal(session.profileSummary.storageMode, "server_document");

  const refreshed = await fetchJson(`${base}/auth/refresh`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
  });
  assert.equal(refreshed.ok, true);
  assert.equal(refreshed.account.username, "httpuser");
  assert.equal(Boolean(refreshed.session.token), true);
  assert.notEqual(refreshed.session.token, registered.session.token);

  const profile = await fetchJson(`${base}/profiles/me`, {
    "headers": {"authorization": `Bearer ${refreshed.session.token}`},
  });
  assert.equal(profile.ok, true);
  assert.equal(profile.profile.player.level, 1);
  assert.equal(profile.profileSummary.playerId, registered.profileSummary.playerId);
  assert.equal(profile.profileSummary.serverAuthority, "profile_document");

  const deniedUpload = await fetchJson(`${base}/profiles/me`, {
    "method": "PUT",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
    "body": JSON.stringify({
      "expectedRevision": 0,
      "profile": {"schemaVersion": 1, "player": {"level": 9}},
    }),
  });
  assert.equal(deniedUpload.ok, false);
  assert.equal(deniedUpload.code, "profile_upload_denied");

  const deniedConflictUpload = await fetchJson(`${base}/profiles/me`, {
    "method": "PUT",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
    "body": JSON.stringify({
      "expectedRevision": 0,
      "profile": {"schemaVersion": 1, "player": {"level": 1}},
    }),
  });
  assert.equal(deniedConflictUpload.ok, false);
  assert.equal(deniedConflictUpload.code, "profile_upload_denied");

  const tools = await fetchJson(`${base}/gm/tools`, {
    "headers": {"authorization": `Bearer ${refreshed.session.token}`},
  });
  assert.equal(tools.ok, false);
  assert.equal(tools.code, "gm_denied");
});

test("HTTP GM market config routes are command-scoped", async (t) => {
  const store = createMemoryAuthStore();
  const service = createAuthService({store});
  const server = createHttpServer({service, store});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const {port} = server.address();
  const base = `http://127.0.0.1:${port}`;

  const registered = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httpmarketgm", "password": "test1234"}),
  });
  assert.equal(registered.ok, true);

  const denied = await fetchJson(`${base}/gm/market/config`, {
    "headers": {"authorization": `Bearer ${registered.session.token}`},
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "gm_denied");

  const grant = service.grantGm({
    "username": "httpmarketgm",
    "commandIds": ["gm_market_tax"],
    "grantedBy": "unit_test",
  });
  assert.equal(grant.ok, true);

  const tools = await fetchJson(`${base}/gm/tools`, {
    "headers": {"authorization": `Bearer ${registered.session.token}`},
  });
  assert.equal(tools.ok, true);
  assert.deepEqual(tools.commandIds, ["gm_market_tax"]);

  const updated = await fetchJson(`${base}/gm/market/config`, {
    "method": "PUT",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
    "body": JSON.stringify({
      "defaultTaxBps": 200,
      "itemTaxBps": {"item_meat_small": 500},
    }),
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.marketConfig.defaultTaxBps, 200);
  assert.equal(updated.marketConfig.itemTaxBps.item_meat_small, 500);

  const read = await fetchJson(`${base}/gm/market/config`, {
    "headers": {"authorization": `Bearer ${registered.session.token}`},
  });
  assert.equal(read.ok, true);
  assert.equal(read.marketConfig.defaultTaxBps, 200);
  assert.equal(read.marketConfig.itemTaxBps.item_meat_small, 500);
});

test("HTTP server rejects incompatible protocol versions with upgrade guidance", async (t) => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const {port} = server.address();
  const base = `http://127.0.0.1:${port}`;

  const missingResponse = await fetch(`${base}/auth/register`, {
    "method": "POST",
    "headers": {"content-type": "application/json"},
    "body": JSON.stringify({"username": "missingversion", "password": "test1234"}),
  });
  const missing = await missingResponse.json();
  assert.equal(missingResponse.status, 426);
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "client_version_missing");
  assert.equal(missing.protocolVersion, PROTOCOL_VERSION);
  assert.equal(missing.upgrade.required, true);

  const mismatchResponse = await fetch(`${base}/auth/login`, {
    "method": "POST",
    "headers": {
      "content-type": "application/json",
      [CLIENT_VERSION_HEADER]: "0.0.1",
      [CLIENT_PROTOCOL_HEADER]: String(PROTOCOL_VERSION - 1),
    },
    "body": JSON.stringify({"username": "future", "password": "test1234"}),
  });
  const mismatch = await mismatchResponse.json();
  assert.equal(mismatchResponse.status, 426);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, "protocol_version_mismatch");
  assert.equal(mismatch.message.includes("更新客户端"), true);
  assert.equal(mismatch.protocolVersion, PROTOCOL_VERSION);
  assert.equal(mismatch.upgrade.required, true);
});

test("HTTP server exposes server-authoritative shop transaction endpoint", async (t) => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const {port} = server.address();
  const base = `http://127.0.0.1:${port}`;

  const registered = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httpshop", "password": "test1234", "displayName": "接口商店"}),
  });
  assert.equal(registered.ok, true);
  const profile = battleProfile("接口商店", {"level": 1, "hp": 120, "maxHp": 120}, null);
  profile.stoneCoins = 20;
  profile.backpackSlots = Array.from({"length": 15}, () => ({}));
  const saved = service.saveProfile(registered.session.token, {"expectedRevision": 0, profile});
  assert.equal(saved.ok, true);

  const buy = await fetchJson(`${base}/shops/transaction`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
    "body": JSON.stringify({
      "mode": "buy",
      "shopId": "firebud_item_shop",
      "itemId": "item_meat_small",
      "amount": 2,
    }),
  });
  assert.equal(buy.ok, true);
  assert.equal(buy.profileSummary.profileRevision, 2);
  assert.equal(buy.transaction.price, 16);
  assert.equal(buy.profile.stoneCoins, 4);
  assert.equal(profileItemCount(buy.profile, "item_meat_small"), 2);

  const denied = await fetchJson(`${base}/shops/transaction`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
    "body": JSON.stringify({
      "mode": "buy",
      "shopId": "firebud_item_shop",
      "itemId": "item_heal_all_5",
      "amount": 1,
    }),
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "not_enough_currency");
});

test("HTTP server exposes server-authoritative profile action endpoint", async (t) => {
  const structuredLogs = [];
  const service = createAuthService({"store": createMemoryAuthStore()});
  const server = createHttpServer({service, logger: (entry) => structuredLogs.push(entry)});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const {port} = server.address();
  const base = `http://127.0.0.1:${port}`;

  const registered = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httpprofileaction", "password": "test1234", "displayName": "接口档案"}),
  });
  assert.equal(registered.ok, true);
  const profile = battleProfile("接口档案", {"level": 1, "hp": 80, "maxHp": 120}, {
    "petId": "http_pet_action",
    "formId": "bui_normal_red_fire10",
    "name": "接口布伊",
    "level": 1,
    "hp": 10,
    "maxHp": 90,
  });
  profile.backpackSlots = [
    {"itemId": "item_meat_small", "count": 1},
    ...Array.from({"length": 14}, () => ({})),
  ];
  assert.equal(service.saveProfile(registered.session.token, {"expectedRevision": 0, profile}).ok, true);

  const healed = await fetchJson(`${base}/profile/action`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
    "body": JSON.stringify({
      "action": "world_item_use",
      "payload": {"itemId": "item_meat_small", "instanceId": "http_pet_action"},
    }),
  });
  assert.equal(healed.ok, true);
  assert.equal(healed.profileSummary.serverAuthority, "profile_document");
  assert.equal(healed.profile.petInstances.find((pet) => pet.instanceId === "http_pet_action").hp, 38);
  assert.equal(profileItemCount(healed.profile, "item_meat_small"), 0);
  await new Promise((resolve) => setImmediate(resolve));
  const profileActionRequestLog = structuredLogs.find((entry) => entry.type === "http.request" && entry.path === "/profile/action");
  assert.notEqual(profileActionRequestLog, undefined);
  assert.equal(profileActionRequestLog.statusCode, 200);
  assert.equal(profileActionRequestLog.durationMs >= 0, true);
  const profileWriteLog = structuredLogs.find((entry) => entry.type === "profile.writeback" && entry.path === "/profile/action");
  assert.notEqual(profileWriteLog, undefined);
  assert.equal(profileWriteLog.playerId, healed.profileSummary.playerId);
  assert.equal(profileWriteLog.profileRevision, 2);

  const partners = await fetchJson(`${base}/profile/action`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
    "body": JSON.stringify({
      "action": "training_partner_set_count",
      "payload": {"count": 2},
    }),
  });
  assert.equal(partners.ok, true);
  assert.equal(partners.result.count, 2);
  assert.equal(partners.profile.trainingPartners.length, 2);
  assert.equal(partners.profile.trainingPartners[0].pet.name, "陪练接口布伊1");

  const invalid = await fetchJson(`${base}/profile/action`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
    "body": JSON.stringify({"action": "unknown_local_mutation", "payload": {}}),
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "profile_action_invalid");
});

test("HTTP server exposes server-authoritative quest record and claim endpoints", async (t) => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const {port} = server.address();
  const base = `http://127.0.0.1:${port}`;

  const registered = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httpquest", "password": "test1234", "displayName": "接口任务"}),
  });
  assert.equal(registered.ok, true);
  const introProfile = battleProfile("接口任务", {"level": 1, "hp": 120, "maxHp": 120}, null);
  introProfile.stoneCoins = 0;
  introProfile.backpackSlots = [];
  introProfile.activeQuestId = "quest_intro_talk";
  introProfile.questStates = {"quest_intro_talk": {"questId": "quest_intro_talk", "status": "active", "progress": 0}};
  const savedIntro = service.saveProfile(registered.session.token, {"expectedRevision": 0, "profile": introProfile});
  assert.equal(savedIntro.ok, true);
  assert.equal(service.updatePlayerPosition(registered.session.token, {"mapId": "firebud_training_yard", "cellX": 5, "cellY": 11}).ok, true);

  const recorded = await fetchJson(`${base}/quests/record`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
    "body": JSON.stringify({"event": {"type": "talk", "targetId": "trainer"}}),
  });
  assert.equal(recorded.ok, true);
  assert.equal(recorded.profileSummary.profileRevision, 2);
  assert.equal(recorded.profile.questStates.quest_intro_talk.status, "claimed");
  assert.equal(recorded.profile.activeQuestId, "quest_open_task_panel");
  assert.equal(recorded.profile.stoneCoins, 20);
  assert.equal(profileItemCount(recorded.profile, "item_meat_small"), 2);

  const captureProfile = battleProfile("接口任务", {"level": 5, "hp": 130, "maxHp": 130}, null);
  captureProfile.stoneCoins = 1;
  captureProfile.backpackSlots = [];
  captureProfile.activeQuestId = "quest_capture_wuli";
  captureProfile.questStates = {"quest_capture_wuli": {"questId": "quest_capture_wuli", "status": "ready", "progress": 1}};
  const savedCapture = service.saveProfile(registered.session.token, {"expectedRevision": 2, "profile": captureProfile});
  assert.equal(savedCapture.ok, true);

  const denied = await fetchJson(`${base}/quests/claim`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
    "body": JSON.stringify({"questId": "quest_capture_wuli"}),
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "quest_reward_choice_required");

  const claimed = await fetchJson(`${base}/quests/claim`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
    "body": JSON.stringify({"questId": "quest_capture_wuli", "rewardChoiceId": "capture_net_pack"}),
  });
  assert.equal(claimed.ok, true);
  assert.equal(claimed.profileSummary.profileRevision, 4);
  assert.equal(claimed.claim.rewardChoiceId, "capture_net_pack");
  assert.equal(claimed.profile.stoneCoins, 61);
  assert.equal(profileItemCount(claimed.profile, "capture_net"), 2);
  assert.equal(claimed.profile.captureTools.capture_net, 2);
});

test("HTTP server exposes server-authoritative equipment equip endpoint", async (t) => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const {port} = server.address();
  const base = `http://127.0.0.1:${port}`;

  const registered = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httpequip", "password": "test1234", "displayName": "接口装备"}),
  });
  assert.equal(registered.ok, true);
  const profile = battleProfile("接口装备", {"level": 1, "hp": 120, "maxHp": 120}, null);
  profile.backpackSlots = [
    {"itemId": "weapon_wooden_club", "count": 1},
    ...Array.from({"length": 14}, () => ({})),
  ];
  profile.equipmentSlots = {"right_hand_weapon": "weapon_stone_dagger"};
  profile.equipmentDurability = {"right_hand_weapon": 30};
  const saved = service.saveProfile(registered.session.token, {"expectedRevision": 0, profile});
  assert.equal(saved.ok, true);

  const equipped = await fetchJson(`${base}/equipment/equip`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
    "body": JSON.stringify({"itemId": "weapon_wooden_club"}),
  });
  assert.equal(equipped.ok, true);
  assert.equal(equipped.profileSummary.profileRevision, 2);
  assert.equal(equipped.equipment.slot, "right_hand_weapon");
  assert.equal(equipped.profile.equipmentSlots.right_hand_weapon, "weapon_wooden_club");
  assert.equal(profileItemCount(equipped.profile, "weapon_stone_dagger"), 1);

  const denied = await fetchJson(`${base}/equipment/equip`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
    "body": JSON.stringify({"itemId": "weapon_stone_axe"}),
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "equipment_item_missing");

  const unequipped = await fetchJson(`${base}/equipment/unequip`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
    "body": JSON.stringify({"slotId": "right_hand_weapon"}),
  });
  assert.equal(unequipped.ok, true);
  assert.equal(unequipped.profileSummary.profileRevision, 3);
  assert.equal(unequipped.equipment.slot, "right_hand_weapon");
  assert.equal(unequipped.profile.equipmentSlots.right_hand_weapon, undefined);
  assert.equal(profileItemCount(unequipped.profile, "weapon_wooden_club"), 1);
});

test("HTTP server exposes server-authoritative equipment enhance endpoint", async (t) => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const {port} = server.address();
  const base = `http://127.0.0.1:${port}`;

  const registered = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httpenhance", "password": "test1234", "displayName": "接口强化"}),
  });
  assert.equal(registered.ok, true);
  const profile = battleProfile("接口强化", {"level": 1, "hp": 120, "maxHp": 120}, null);
  profile.stoneCoins = 50;
  profile.backpackSlots = [
    {"itemId": "equip_frag_wood_basic", "count": 1},
    ...Array.from({"length": 14}, () => ({})),
  ];
  profile.equipmentSlots = {"right_hand_weapon": "weapon_wooden_club"};
  profile.equipmentDurability = {"right_hand_weapon": 30};
  profile.equipmentEnhancement = {"right_hand_weapon": {"itemId": "weapon_wooden_club", "level": 0, "history": []}};
  const saved = service.saveProfile(registered.session.token, {"expectedRevision": 0, profile});
  assert.equal(saved.ok, true);

  const enhanced = await fetchJson(`${base}/equipment/enhance`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
    "body": JSON.stringify({"slotId": "right_hand_weapon"}),
  });
  assert.equal(enhanced.ok, true);
  assert.equal(enhanced.profileSummary.profileRevision, 2);
  assert.equal(enhanced.enhancement.level, 1);
  assert.equal(enhanced.profile.stoneCoins, 30);
  assert.equal(profileItemCount(enhanced.profile, "equip_frag_wood_basic"), 0);

  const denied = await fetchJson(`${base}/equipment/enhance`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
    "body": JSON.stringify({"slotId": "right_hand_weapon"}),
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "equipment_enhance_material_missing");
});

test("HTTP server exposes server-authoritative equipment repair endpoint", async (t) => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const {port} = server.address();
  const base = `http://127.0.0.1:${port}`;

  const registered = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httprepair", "password": "test1234", "displayName": "接口修理"}),
  });
  assert.equal(registered.ok, true);
  const profile = battleProfile("接口修理", {"level": 1, "hp": 120, "maxHp": 120}, null);
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
  const saved = service.saveProfile(registered.session.token, {"expectedRevision": 0, profile});
  assert.equal(saved.ok, true);

  const repaired = await fetchJson(`${base}/equipment/repair-all`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
  });
  assert.equal(repaired.ok, true);
  assert.equal(repaired.profileSummary.profileRevision, 2);
  assert.equal(repaired.repair.missingDurability, 28);
  assert.equal(repaired.repair.cost, 6);
  assert.equal(repaired.profile.stoneCoins, 14);
  assert.equal(repaired.profile.equipmentDurability.right_hand_weapon, 30);
  assert.equal(repaired.profile.equipmentWearCounters.right_hand_weapon.attackCount, 0);
  assert.equal(repaired.profile.equipmentInstances.equip_000001.durability, 30);
  assert.equal(repaired.profile.equipmentInstances.equip_000001.wearCounters.attackCount, 0);

  const denied = await fetchJson(`${base}/equipment/repair-all`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "equipment_repair_not_needed");
});

test("HTTP server exposes server-authoritative equipment synthesis endpoint", async (t) => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const {port} = server.address();
  const base = `http://127.0.0.1:${port}`;

  const registered = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httpsynth", "password": "test1234", "displayName": "接口合成"}),
  });
  assert.equal(registered.ok, true);
  const profile = battleProfile("接口合成", {"level": 1, "hp": 120, "maxHp": 120}, null);
  profile.stoneCoins = 50;
  profile.backpackSlots = [
    {"itemId": "equip_frag_wood_basic", "count": 3},
    ...Array.from({"length": 14}, () => ({})),
  ];
  const saved = service.saveProfile(registered.session.token, {"expectedRevision": 0, profile});
  assert.equal(saved.ok, true);

  const synthesized = await fetchJson(`${base}/equipment/synthesize`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
    "body": JSON.stringify({"recipeId": "craft_hardwood_club"}),
  });
  assert.equal(synthesized.ok, true);
  assert.equal(synthesized.profileSummary.profileRevision, 2);
  assert.equal(synthesized.synthesis.outputItemId, "weapon_hardwood_club");
  assert.equal(synthesized.profile.stoneCoins, 30);
  assert.equal(profileItemCount(synthesized.profile, "weapon_hardwood_club"), 1);

  const denied = await fetchJson(`${base}/equipment/synthesize`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
    "body": JSON.stringify({"recipeId": "craft_hardwood_club"}),
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "equipment_synthesis_material_missing");
});

test("HTTP server exposes server-authoritative player rebirth endpoint", async (t) => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const {port} = server.address();
  const base = `http://127.0.0.1:${port}`;

  const registered = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httprebirth", "password": "test1234", "displayName": "接口转生"}),
  });
  assert.equal(registered.ok, true);
  const profile = playerRebirthReadyProfile("接口转生");
  const saved = service.saveProfile(registered.session.token, {"expectedRevision": 0, profile});
  assert.equal(saved.ok, true);

  const reborn = await fetchJson(`${base}/player/rebirth`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
  });
  assert.equal(reborn.ok, true);
  assert.equal(reborn.profileSummary.profileRevision, 2);
  assert.equal(reborn.profile.rebirthCount, 1);
  assert.equal(reborn.profile.player.level, 1);
  assert.equal(profileItemCount(reborn.profile, "armor_grace_cloth_3"), 1);
  assert.equal(reborn.profile.petInstances.some((pet) => pet.formId === "rebirth_starter_earth_cub"), true);

  const denied = await fetchJson(`${base}/player/rebirth`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "player_rebirth_not_ready");
  assert.equal(denied.profileSummary.profileRevision, 2);
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

  const senderProfile = battleProfile("邮甲", {"level": 1, "hp": 120, "maxHp": 120}, null);
  senderProfile.backpackSlots = [
    {"itemId": "item_meat_small", "count": 4},
    ...Array.from({"length": 14}, () => ({})),
  ];
  const recipientProfile = battleProfile("邮乙", {"level": 1, "hp": 120, "maxHp": 120}, null);
  recipientProfile.backpackSlots = Array.from({"length": 15}, () => ({}));
  assert.equal(service.saveProfile(sender.session.token, {"expectedRevision": 0, "profile": senderProfile}).ok, true);
  assert.equal(service.saveProfile(recipient.session.token, {"expectedRevision": 0, "profile": recipientProfile}).ok, true);

  const attached = await fetchJson(`${base}/mail/send`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${sender.session.token}`},
    "body": JSON.stringify({
      "recipientUsername": "httpmailb",
      "title": "补给",
      "body": "带上小肉。",
      "items": [{"itemId": "item_meat_small", "count": 2}],
    }),
  });
  assert.equal(attached.ok, true);
  assert.equal(attached.mail.items[0].count, 2);
  assert.equal(profileItemCount(attached.profile, "item_meat_small"), 2);

  const attachmentInbox = await fetchJson(`${base}/mail/inbox`, {
    "headers": {"authorization": `Bearer ${recipient.session.token}`},
  });
  const attachmentMail = attachmentInbox.messages.find((mail) => mail.title === "补给");
  assert.equal(attachmentMail.items[0].itemId, "item_meat_small");
  const claimed = await fetchJson(`${base}/mail/${encodeURIComponent(attachmentMail.mailId)}/claim`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${recipient.session.token}`},
  });
  assert.equal(claimed.ok, true);
  assert.equal(profileItemCount(claimed.profile, "item_meat_small"), 2);
  assert.equal(claimed.mail, null);
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
      "cellX": 33,
      "cellY": 32,
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

  const sameMapOnline = await fetchJson(`${base}/players/online?scope=map&mapId=firebud_training_yard`, {
    "headers": {"authorization": `Bearer ${leader.session.token}`},
  });
  assert.equal(sameMapOnline.ok, true);
  assert.equal(sameMapOnline.aoi.scope, "map");
  assert.equal(sameMapOnline.players.some((player) => player.username === "httppartyb"), true);
  assert.equal(sameMapOnline.players.some((player) => player.username === "httppartyc"), true);

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

test("HTTP server exposes party pve encounter endpoint", async (t) => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const {port} = server.address();
  const base = `http://127.0.0.1:${port}`;

  const leader = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httppvea", "password": "test1234", "displayName": "队战甲"}),
  });
  const member = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httppveb", "password": "test1234", "displayName": "队战乙"}),
  });
  assert.equal(leader.ok, true);
  assert.equal(member.ok, true);
  for (const account of [leader, member]) {
    const position = await fetchJson(`${base}/players/position`, {
      "method": "POST",
      "headers": {"authorization": `Bearer ${account.session.token}`},
      "body": JSON.stringify({
        "mapId": "firebud_training_yard",
        "cellX": 14,
        "cellY": 14,
        "facing": "east",
        "moving": false,
      }),
    });
    assert.equal(position.ok, true);
  }
  const invite = await fetchJson(`${base}/party/invite`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${leader.session.token}`},
    "body": JSON.stringify({"username": "httppveb"}),
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
  const encounter = await fetchJson(`${base}/battle/party-encounter`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${leader.session.token}`},
    "body": JSON.stringify({
      "enemyCount": 3,
      "encounterZone": {
        "id": "http_grass",
        "name": "HTTP 草丛",
        "selectedWildPet": {
          "formId": "wuli_normal_orange_fire10",
          "name": "HTTP 乌力",
          "level": 3,
          "battleStats": {"maxHp": 99, "attack": 10, "defense": 6, "quick": 40},
        },
      },
    }),
  });
  assert.equal(encounter.ok, true);
  assert.equal(encounter.room.mode, "party_pve");
  const enemies = encounter.room.battle.actors.filter((actor) => actor.side === "enemy");
  assert.equal(enemies.length, 3);
  assert.equal(enemies.every((actor) => actor.hp === actor.maxHp), true);
});

test("HTTP server exposes solo pve encounter endpoint", async (t) => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const {port} = server.address();
  const base = `http://127.0.0.1:${port}`;

  const solo = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httpsolopve", "password": "test1234", "displayName": "HTTP 单人"}),
  });
  assert.equal(solo.ok, true);
  const position = await fetchJson(`${base}/players/position`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${solo.session.token}`},
    "body": JSON.stringify({
      "mapId": "firebud_village_gate",
      "cellX": 15,
      "cellY": 17,
      "facing": "south",
      "moving": false,
    }),
  });
  assert.equal(position.ok, true);
  const encounter = await fetchJson(`${base}/battle/party-encounter`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${solo.session.token}`},
    "body": JSON.stringify({
      "enemyCount": 1,
      "encounterZone": {
        "id": "http_solo_grass",
        "name": "HTTP 单人草丛",
        "selectedWildPet": {
          "formId": "wuli_normal_orange_fire10",
          "name": "HTTP 单人乌力",
          "level": 3,
          "battleStats": {"maxHp": 88, "attack": 10, "defense": 6, "quick": 40},
        },
      },
    }),
  });
  assert.equal(encounter.ok, true);
  assert.equal(encounter.room.mode, "party_pve");
  assert.deepEqual(encounter.room.participantAccountIds, [solo.account.accountId]);
  assert.equal(encounter.message, "遭遇了野生宠物。");
  const enemies = encounter.room.battle.actors.filter((actor) => actor.side === "enemy");
  assert.equal(enemies.length, 1);
  assert.equal(enemies[0].hp, enemies[0].maxHp);
});

test("HTTP production encounter intent ignores forged client pet facts", async (t) => {
  const service = createAuthService({
    "store": createMemoryAuthStore(),
    "useStrictPetEncounterAuthority": true,
    "petEncounterPermitAuthority": createPetEncounterPermitAuthority({
      catalog: strictPetEncounterCatalog,
      randomBytes: (size) => crypto.randomBytes(size),
      randomFloat: () => 0,
      eligibleStepIntervalMs: 0,
    }),
  });
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const {port} = server.address();
  const base = `http://127.0.0.1:${port}`;

  const solo = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httpstrictpve", "password": "test1234", "displayName": "HTTP权威遇敌"}),
  });
  assert.equal(solo.ok, true);
  const position = await fetchJson(`${base}/players/position`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${solo.session.token}`},
    "body": JSON.stringify({
      "mapId": "firebud_village_gate",
      "cellX": 10,
      "cellY": 17,
      "facing": "south",
      "moving": false,
    }),
  });
  assert.equal(position.ok, true);
  let encounterPermit = null;
  for (const [fromCellX, fromCellY, toCellX, toCellY] of [
    [10, 17, 11, 17],
    [11, 17, 11, 16],
    [11, 16, 11, 15],
  ]) {
    const step = await fetchJson(`${base}/movement/step`, {
      "method": "POST",
      "headers": {"authorization": `Bearer ${solo.session.token}`},
      "body": JSON.stringify({
        "mapId": "firebud_village_gate",
        fromCellX,
        fromCellY,
        toCellX,
        toCellY,
        "facing": "south",
        "moving": true,
      }),
    });
    assert.equal(step.ok, true);
    if (step.encounterPermit) {
      encounterPermit = step.encounterPermit;
    }
  }
  assert.equal(typeof encounterPermit.token, "string");
  const missingPermit = await fetchJson(`${base}/battle/party-encounter`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${solo.session.token}`},
    "body": JSON.stringify({"encounterIntent": {"zoneId": "village_grass", "encounterGroupId": "firebud_grass_01"}}),
  });
  assert.equal(missingPermit.ok, false);
  assert.equal(missingPermit.code, "encounter_permit_required");
  const encounter = await fetchJson(`${base}/battle/party-encounter`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${solo.session.token}`},
    "body": JSON.stringify({
      "encounterPermitToken": encounterPermit.token,
      "enemyCount": 10,
      "encounterIntent": {"zoneId": "village_grass", "encounterGroupId": "firebud_grass_01"},
      "encounterZone": {
        "id": "client_forged",
        "selectedWildPet": {
          "formId": "rebirth_starter_shadow_cub",
          "level": 140,
          "captureChanceOverride": 1,
          "expReward": 999999,
          "battleStats": {"maxHp": 999999, "attack": 999999, "defense": 999999, "quick": 999999},
        },
      },
    }),
  });
  assert.equal(encounter.ok, true);
  const enemies = encounter.room.battle.actors.filter((actor) => actor.side === "enemy");
  assert.equal(enemies.length, 1);
  assert.equal(enemies[0].formId.startsWith("wuli_"), true);
  assert.equal(enemies[0].level, 1);
  assert.equal(enemies[0].maxHp < 1000, true);
  assert.equal(enemies[0].attack < 1000, true);
  assert.equal(JSON.stringify(encounter).includes("rebirth_starter_shadow_cub"), false);
  assert.equal(JSON.stringify(encounter).includes("999999"), false);
});

test("HTTP server exposes hang session endpoints", async (t) => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const server = createHttpServer({service});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const {port} = server.address();
  const base = `http://127.0.0.1:${port}`;

  const registered = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httphang", "password": "test1234", "displayName": "HTTP 挂机"}),
  });
  assert.equal(registered.ok, true);
  const profile = battleProfile("HTTP 挂机", {"level": 6, "hp": 120, "maxHp": 120}, null);
  profile.backpackSlots = [{"itemId": "encounter_stone_low", "count": 1}];
  profile.hangSettings = {"captureTargetCount": 0};
  assert.equal(service.saveProfile(registered.session.token, {"expectedRevision": 0, profile}).ok, true);

  const started = await fetchJson(`${base}/hang/session/start`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
    "body": JSON.stringify({
      "mode": "encounter_stone",
      "itemId": "encounter_stone_low",
      "mapId": "firebud_village_gate",
      "originCell": [11, 15],
      "settings": {
        "lowHpStopPercent": 35,
        "lowHpAction": "town_heal",
        "resumeAfterHeal": true,
        "captureTargetCount": 2,
      },
    }),
  });
  assert.equal(started.ok, true);
  assert.equal(started.profile.hangSession.enabled, true);
  assert.equal(started.profile.hangSession.mode, "encounter_stone");
  assert.deepEqual(started.profile.hangSession.originCell, [11, 15]);
  assert.equal(started.profile.hangSettings.captureTargetCount, 2);
  assert.equal(profileItemCount(started.profile, "encounter_stone_low"), 0);

  const stopped = await fetchJson(`${base}/hang/session/stop`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
    "body": JSON.stringify({"reason": "manual"}),
  });
  assert.equal(stopped.ok, true);
  assert.equal(stopped.profile.hangSession.enabled, false);
  assert.equal(stopped.profile.hangSession.lastStopReason, "manual");
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
  assert.equal(service.saveProfile(challenger.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("挑战甲", {"level": 8, "hp": 140, "maxHp": 140, "attack": 28, "defense": 10, "quick": 80}, null),
  }).ok, true);
  assert.equal(service.saveProfile(opponent.session.token, {
    "expectedRevision": 0,
    "profile": battleProfile("迎战乙", {"level": 8, "hp": 140, "maxHp": 140, "attack": 22, "defense": 10, "quick": 70}, null),
  }).ok, true);
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

  const ws = new WebSocket(eventStreamUrl(wsBase, opponent.session.token));
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
  assert.equal(leave.result.battleRecordId.startsWith("battle_record_"), true);
  const summary = await fetchJson(`${base}/battle/records/summary?username=httpbatb`, {
    "headers": {"authorization": `Bearer ${challenger.session.token}`},
  });
  assert.equal(summary.ok, true);
  assert.equal(summary.summary.total, 1);
  assert.equal(summary.summary.wins, 1);
  assert.equal(summary.summary.losses, 0);
  const closeEvent = await reader.next("battle.room_closed");
  assert.equal(closeEvent.roomId, accept.room.roomId);
  assert.equal(closeEvent.reason, "leave");
  assert.equal(closeEvent.room.status, "closed");
  ws.close();
});

test("HTTP login replaces same-account websocket session", async (t) => {
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

  const first = await fetchJson(`${base}/auth/register`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httpreplace", "password": "test1234", "displayName": "顶号玩家"}),
  });
  assert.equal(first.ok, true);
  const ws = new WebSocket(eventStreamUrl(wsBase, first.session.token));
  const reader = webSocketJsonReader(ws);
  await webSocketOpen(ws);
  const ready = await reader.next("events.ready");
  assert.equal(ready.account.username, "httpreplace");

  const second = await fetchJson(`${base}/auth/login`, {
    "method": "POST",
    "body": JSON.stringify({"username": "httpreplace", "password": "test1234"}),
  });
  assert.equal(second.ok, true);
  assert.notEqual(second.session.token, first.session.token);

  const replaced = await reader.next("session.replaced");
  assert.equal(replaced.code, "session_replaced");
  assert.match(replaced.message, /其他地方登录/);
  assert.deepEqual(replaced.targetSessionIds, [first.session.sessionId]);

  const oldSession = await fetchJson(`${base}/auth/session`, {
    "headers": {"authorization": `Bearer ${first.session.token}`},
  });
  assert.equal(oldSession.ok, false);
  assert.equal(oldSession.code, "session_replaced");
  assert.match(oldSession.message, /被踢出游戏/);

  const newSession = await fetchJson(`${base}/auth/session`, {
    "headers": {"authorization": `Bearer ${second.session.token}`},
  });
  assert.equal(newSession.ok, true);
  assert.equal(newSession.session.username, "httpreplace");
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
  const firstWs = new WebSocket(eventStreamUrl(wsBase, opponent.session.token));
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
  const secondWs = new WebSocket(eventStreamUrl(wsBase, opponent.session.token, inviteEvent.eventSeq));
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
  let nowMs = Date.parse("2026-07-11T00:00:00.000Z");
  const service = createAuthService({"store": createMemoryAuthStore(), now: () => nowMs});
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
      "cellX": 17,
      "cellY": 9,
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
      "cellX": 30,
      "cellY": 11,
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

  const ws = new WebSocket(eventStreamUrl(wsBase, watcher.session.token, latest.latestEventSeq));
  const reader = webSocketJsonReader(ws);
  await webSocketOpen(ws);
  const ready = await reader.next("events.ready");
  assert.equal(ready.account.username, "httpwsa");
  const snapshot = await reader.next("online.snapshot");
  assert.equal(snapshot.aoi.scope, "aoi");
  assert.equal(snapshot.players.some((player) => player.username === "httpwsb"), true);
  assert.equal(snapshot.players.some((player) => player.username === "httpwsc"), false);

  const position = await fetchJson(`${base}/movement/step`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${actor.session.token}`},
    "body": JSON.stringify({
      "mapId": "firebud_training_yard",
      "fromCellX": 17,
      "fromCellY": 9,
      "toCellX": 18,
      "toCellY": 9,
      "facing": "west",
      "moving": true,
    }),
  });
  assert.equal(position.ok, true);
  const positionEvent = await reader.next("online.position");
  assert.equal(positionEvent.username, "httpwsb");
  assert.equal(positionEvent.position.cellX, 18);
  assert.equal(positionEvent.players.some((player) => player.username === "httpwsc"), false);

  const distantStillFar = await fetchJson(`${base}/movement/step`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${distant.session.token}`},
    "body": JSON.stringify({
      "mapId": "firebud_training_yard",
      "fromCellX": 30,
      "fromCellY": 11,
      "toCellX": 31,
      "toCellY": 11,
      "facing": "west",
      "moving": true,
    }),
  });
  assert.equal(distantStillFar.ok, true);
  await assert.rejects(reader.next("online.position"), /websocket message timeout: online.position/);

  // 远处玩家通过权威单步移动走进观察者的 AOI 范围。
  let distantCellX = 31;
  while (distantCellX > 26) {
    nowMs += 100;
    const distantStep = await fetchJson(`${base}/movement/step`, {
      "method": "POST",
      "headers": {"authorization": `Bearer ${distant.session.token}`},
      "body": JSON.stringify({
        "mapId": "firebud_training_yard",
        "fromCellX": distantCellX,
        "fromCellY": 11,
        "toCellX": distantCellX - 1,
        "toCellY": 11,
        "moving": true,
      }),
    });
    assert.equal(distantStep.ok, true);
    distantCellX -= 1;
  }
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
