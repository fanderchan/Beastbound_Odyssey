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
      "comboRateOverride": playerStats.comboRateOverride,
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
      "comboRateOverride": petStats.comboRateOverride,
    });
  }
  return profile;
}

function profileItemCount(profile, itemId) {
  const slots = Array.isArray(profile && profile.backpackSlots) ? profile.backpackSlots : [];
  return slots.reduce((total, slot) => {
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
      return total;
    }
    if (String(slot.itemId || "") !== itemId) {
      return total;
    }
    return total + Math.max(0, Math.trunc(Number(slot.count || 0)));
  }, 0);
}

function playerRebirthReadyProfile(name) {
  const profile = battleProfile(name, {
    "level": 80,
    "hp": 220,
    "maxHp": 220,
    "attack": 45,
    "defense": 30,
    "quick": 90,
  }, {
    "petId": "rebirth_active_pet",
    "formId": "bui_normal_red_fire10",
    "name": "随行布伊",
    "level": 60,
    "hp": 160,
    "maxHp": 160,
    "attack": 40,
    "defense": 20,
    "quick": 80,
  });
  profile.rebirthQuestCompletions = ["rebirth_1"];
  profile.rebirthTrialProofs = {"shadow_oath_rebirth_guardian": 1};
  profile.backpackSlots = [
    {"itemId": "ring_earth_trial", "count": 1},
    {"itemId": "ring_water_trial", "count": 1},
    {"itemId": "ring_fire_trial", "count": 1},
    {"itemId": "ring_wind_trial", "count": 1},
    ...Array.from({"length": 11}, () => ({})),
  ];
  profile.petInstances.push({
    "instanceId": "rebirth_beast_earth_1",
    "petId": "rebirth_beast_earth_1",
    "formId": "rebirth_beast_earth_lv50",
    "templateId": "rebirth_beast_earth_lv50",
    "name": "地灵转生兽",
    "state": "standby",
    "level": 50,
    "hp": 520,
    "maxHp": 520,
    "attack": 76,
    "defense": 92,
    "quick": 48,
  });
  profile.nextPetInstanceSerial = 10;
  profile.recordPoint = {
    "mapId": "firebud_village_gate",
    "spawnName": "doctor_record",
    "label": "火芽村医旁记录点",
  };
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
    hasBattleRecords: stdin.includes("INSERT INTO battle_records"),
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
      "battleRecords": [
        {
          "recordId": "battle_record_mysqlprobe",
          "roomId": "battle_room_mysqlprobe",
          "mode": "duel",
          "reason": "leave",
          "winnerAccountId": "acc_mysqlprobe",
          "loserAccountIds": ["acc_other"],
          "closedByAccountId": "acc_other",
          "participantAccountIds": ["acc_mysqlprobe", "acc_other"],
          "participants": [],
          "round": 1,
          "turnSeq": 1,
          "startedAt": "2026-06-30T00:00:00.000Z",
          "endedAt": "2026-06-30T00:01:00.000Z",
          "durationSeconds": 60,
          "schemaVersion": 1,
        },
      ],
      "authEvents": [],
      "serviceEvents": [],
    });
    const calls = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.ok(calls.length >= 2);
    assert.ok(calls.every((call) => call.hasExecuteArg === false));
    assert.ok(calls.some((call) => call.hasServerState));
    assert.ok(calls.some((call) => call.hasBattleRecords));
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
  assert.equal(registered.profileSummary.storageMode, "server_document");
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

test("party pve victory advances auto-claim battle quest and hang session", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const solo = service.register({"username": "pvequestone", "password": "test1234", "displayName": "任务玩家"});
  assert.equal(solo.ok, true);
  const profile = battleProfile("任务玩家", {"level": 8, "hp": 140, "maxHp": 140, "attack": 999, "defense": 20, "quick": 200, "comboRateOverride": 0}, {
    "petId": "quest_pet",
    "name": "任务布伊",
    "level": 8,
    "hp": 100,
    "maxHp": 100,
    "attack": 1,
    "defense": 10,
    "quick": 80,
    "comboRateOverride": 0,
  });
  profile.stoneCoins = 11;
  profile.backpackSlots = [];
  profile.activeQuestId = "quest_first_victory";
  profile.questStates = {"quest_first_victory": {"questId": "quest_first_victory", "status": "active", "progress": 0}};
  profile.hangSettings = {"captureTargetCount": 0};
  profile.hangSession = {"enabled": true, "mode": "walk", "battleCount": 2, "captureSuccessCount": 0};
  assert.equal(service.saveProfile(solo.session.token, {"expectedRevision": 0, "profile": profile}).ok, true);

  const encounter = service.startPartyEncounter(solo.session.token, {
    "enemyCount": 1,
    "encounterZone": {
      "id": "quest_grass",
      "name": "任务草丛",
      "encounterGroupId": "firebud_grass_01",
      "selectedWildPet": {
        "formId": "wuli_normal_orange_fire10",
        "name": "任务乌力",
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
  assert.equal(Boolean(writeback && writeback.quests), true);
  assert.equal(writeback.quests.claimed.some((entry) => entry.questId === "quest_first_victory"), true);
  assert.equal(writeback.quests.activeQuestId, "quest_capture_wuli");
  assert.equal(writeback.hang.battleCount, 3);

  const after = service.getProfile(solo.session.token);
  assert.equal(after.ok, true);
  assert.equal(after.profile.questStates.quest_first_victory.status, "claimed");
  assert.equal(after.profile.activeQuestId, "quest_capture_wuli");
  assert.equal(after.profile.hangSession.battleCount, 3);
  assert.equal(after.profile.stoneCoins, 11 + writeback.rewards.stoneCoins + 30);
  const healCount = (after.profile.backpackSlots || []).reduce((sum, slot) => (
    sum + (slot && slot.itemId === "item_heal_single_5" ? Number(slot.count || 0) : 0)
  ), 0);
  assert.equal(healCount >= 1, true);
  const record = service.snapshot().battleRecords.find((entry) => entry.roomId === encounter.room.roomId);
  assert.equal(Boolean(record && record.profileWriteback.profiles[0].quests), true);
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

  const recorded = service.questRecord(player.session.token, {
    "event": {"type": "talk", "targetId": "trainer"},
  });
  assert.equal(recorded.ok, true);
  assert.equal(recorded.profileSummary.profileRevision, 2);
  assert.equal(recorded.progress.questId, "quest_intro_talk");
  assert.equal(recorded.progress.ready, true);
  assert.equal(recorded.profile.questStates.quest_intro_talk.status, "claimed");
  assert.equal(recorded.profile.activeQuestId, "quest_buy_supply");
  assert.equal(recorded.profile.stoneCoins, 20);
  assert.equal(profileItemCount(recorded.profile, "item_meat_small"), 2);
  assert.equal(recorded.questMessages.some((message) => String(message).includes("认识训练师")), true);
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

test("hang session endpoints start encounter stone and stop server-side", () => {
  const service = createAuthService({"store": createMemoryAuthStore()});
  const player = service.register({"username": "hangstoneone", "password": "test1234", "displayName": "遇敌石玩家"});
  assert.equal(player.ok, true);
  const profile = battleProfile("遇敌石玩家", {"level": 5, "hp": 120, "maxHp": 120});
  profile.backpackSlots = [{"itemId": "encounter_stone_low", "count": 1}];
  profile.hangSettings = {"captureTargetCount": 0};
  profile.hangSession = {"enabled": false, "mode": "", "battleCount": 4, "captureSuccessCount": 1};
  assert.equal(service.saveProfile(player.session.token, {"expectedRevision": 0, "profile": profile}).ok, true);

  const started = service.startHangSession(player.session.token, {
    "mode": "encounter_stone",
    "itemId": "encounter_stone_low",
    "mapId": "firebud_village_gate",
    "originCell": [11, 15],
    "settings": {"lowHpStopPercent": 30, "lowHpAction": "town_heal", "resumeAfterHeal": true, "captureTargetCount": 2},
  });
  assert.equal(started.ok, true);
  assert.equal(started.profile.hangSession.enabled, true);
  assert.equal(started.profile.hangSession.mode, "encounter_stone");
  assert.deepEqual(started.profile.hangSession.originCell, [11, 15]);
  assert.equal(started.profile.hangSession.battleCount, 4);
  assert.equal(started.profile.hangSession.captureSuccessCount, 1);
  assert.equal(started.profile.hangSettings.captureTargetCount, 2);
  assert.equal(profileItemCount(started.profile, "encounter_stone_low"), 0);

  const stopped = service.stopHangSession(player.session.token, {"reason": "manual"});
  assert.equal(stopped.ok, true);
  assert.equal(stopped.profile.hangSession.enabled, false);
  assert.equal(stopped.profile.hangSession.lastStopReason, "manual");
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
  profile.questStates = {"quest_use_poison_spirit": {"questId": "quest_use_poison_spirit", "status": "active", "progress": 0}};
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
  assert.equal(writeback.quests.claimed.some((entry) => entry.questId === "quest_first_victory"), true);
  assert.equal(writeback.quests.activeQuestId, "quest_capture_wuli");

  const after = service.getProfile(solo.session.token);
  assert.equal(after.ok, true);
  assert.equal(after.profile.questStates.quest_use_poison_spirit.status, "claimed");
  assert.equal(after.profile.questStates.quest_first_victory.status, "claimed");
  assert.equal(after.profile.activeQuestId, "quest_capture_wuli");
  assert.equal(after.profile.stoneCoins, 13 + writeback.rewards.stoneCoins + 50);
  const blessedClubCount = (after.profile.backpackSlots || []).reduce((sum, slot) => (
    sum + (slot && slot.itemId === "weapon_blessed_club" ? Number(slot.count || 0) : 0)
  ), 0);
  assert.equal(blessedClubCount, 1);
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
  nowMs += 299 * 1000;
  const reconnected = service.markBattleConnection(challenger.session.token, true);
  assert.equal(reconnected.ok, true);
  assert.equal(reconnected.room.roomId, roomId);
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
  assert.equal(session.profileSummary.storageMode, "server_document");

  const profile = await fetchJson(`${base}/profiles/me`, {
    "headers": {"authorization": `Bearer ${registered.session.token}`},
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
    "headers": {"authorization": `Bearer ${registered.session.token}`},
  });
  assert.equal(tools.ok, false);
  assert.equal(tools.code, "gm_denied");
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
  const service = createAuthService({"store": createMemoryAuthStore()});
  const server = createHttpServer({service});
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

  const recorded = await fetchJson(`${base}/quests/record`, {
    "method": "POST",
    "headers": {"authorization": `Bearer ${registered.session.token}`},
    "body": JSON.stringify({"event": {"type": "talk", "targetId": "trainer"}}),
  });
  assert.equal(recorded.ok, true);
  assert.equal(recorded.profileSummary.profileRevision, 2);
  assert.equal(recorded.profile.questStates.quest_intro_talk.status, "claimed");
  assert.equal(recorded.profile.activeQuestId, "quest_buy_supply");
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
