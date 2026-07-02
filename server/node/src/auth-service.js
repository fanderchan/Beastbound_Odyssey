"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 20;
const PASSWORD_MIN_LENGTH = 4;
const ROLE_PLAYER = "player";
const ROLE_GM = "gm";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_AUDIT_ROWS = 500;
const MAX_PLAYER_SEARCH_RESULTS = 12;
const MAX_SERVICE_EVENTS = 500;
const MAX_BATTLE_RECORDS = 10000;
const MAX_BATTLE_TRACE_ROWS = 1200;
const MAIL_TITLE_MAX_LENGTH = 40;
const MAIL_BODY_MAX_LENGTH = 500;
const PARTY_MAX_MEMBERS = 5;
const CHAT_CHANNEL_NEARBY = "nearby";
const CHAT_CHANNEL_TEAM = "team";
const CHAT_TEXT_MAX_LENGTH = 120;
const CHAT_HISTORY_LIMIT = 50;
const MAX_CHAT_MESSAGES = 500;
const POSITION_MAP_ID_MAX_LENGTH = 64;
const POSITION_FACING_VALUES = new Set(["east", "southeast", "south", "southwest", "west", "northwest", "north", "northeast"]);
const ONLINE_AOI_SCOPE = "aoi";
const ONLINE_AOI_DEFAULT_RADIUS = 18;
const ONLINE_AOI_MAX_RADIUS = 48;
const ONLINE_PLAYERS_RESPONSE_LIMIT = 64;
const MOVEMENT_MAX_STEP_CELLS = 1;
const BATTLE_ROOM_ENTRY_MAX_DISTANCE = 4;
const BATTLE_MODE_DUEL = "duel";
const BATTLE_MODE_PARTY_PVE = "party_pve";
const BATTLE_INVITE_PENDING = "pending";
const BATTLE_INVITE_ACCEPTED = "accepted";
const BATTLE_INVITE_DECLINED = "declined";
const BATTLE_INVITE_CANCELLED = "cancelled";
const BATTLE_INVITE_EXPIRED = "expired";
const BATTLE_ROOM_READY = "ready";
const BATTLE_ROOM_CLOSED = "closed";
const BATTLE_PHASE_COMMAND = "command";
const BATTLE_PHASE_FINISHED = "finished";
const BATTLE_ACTION_ATTACK = "attack";
const BATTLE_ACTION_DEFEND = "defend";
const BATTLE_ACTION_PET_ATTACK = "pet_attack";
const BATTLE_ACTION_PET_DEFEND = "pet_defend";
const BATTLE_ACTION_PET_BUI_CHARGE = "pet_bui_charge";
const BATTLE_ACTION_SWITCH_PET = "switch_pet";
const BATTLE_ACTION_ITEM = "item";
const BATTLE_ACTION_SPIRIT = "spirit";
const BATTLE_ACTION_CAPTURE = "capture";
const BATTLE_ITEM_MEAT_SMALL = "item_meat_small";
const BATTLE_ITEM_HEAL_SINGLE = "item_heal_single_5";
const BATTLE_ITEM_HEAL_ALL = "item_heal_all_5";
const BATTLE_ITEM_POISON_SINGLE = "item_poison_single_5";
const BATTLE_ITEM_POISON_ALL = "item_poison_all_5";
const BATTLE_ITEM_CLEANSE_SINGLE = "item_cleanse_single_5";
const BATTLE_ITEM_IDS = [
  BATTLE_ITEM_MEAT_SMALL,
  BATTLE_ITEM_HEAL_SINGLE,
  BATTLE_ITEM_HEAL_ALL,
  BATTLE_ITEM_POISON_SINGLE,
  BATTLE_ITEM_POISON_ALL,
  BATTLE_ITEM_CLEANSE_SINGLE,
];
const BATTLE_ITEM_HEAL_AMOUNTS = {
  [BATTLE_ITEM_MEAT_SMALL]: 28,
  [BATTLE_ITEM_HEAL_SINGLE]: 42,
  [BATTLE_ITEM_HEAL_ALL]: 24,
};
const BATTLE_ITEM_LABELS = {
  [BATTLE_ITEM_MEAT_SMALL]: "肉",
  [BATTLE_ITEM_HEAL_SINGLE]: "回复药5",
  [BATTLE_ITEM_HEAL_ALL]: "群体草药5",
  [BATTLE_ITEM_POISON_SINGLE]: "毒粉5",
  [BATTLE_ITEM_POISON_ALL]: "毒雾粉5",
  [BATTLE_ITEM_CLEANSE_SINGLE]: "净化草5",
};
const BATTLE_STATUS_POISON = "poison";
const BATTLE_STATUS_SLEEP = "sleep";
const BATTLE_STATUS_CONFUSION = "confusion";
const BATTLE_STATUS_STONE = "stone";
const BATTLE_CONTROL_STATUSES = [BATTLE_STATUS_SLEEP, BATTLE_STATUS_CONFUSION, BATTLE_STATUS_STONE];
const BATTLE_CLEANSE_STATUS_IDS = [BATTLE_STATUS_POISON, BATTLE_STATUS_SLEEP, BATTLE_STATUS_CONFUSION, BATTLE_STATUS_STONE];
const BATTLE_ACTOR_MAX_HP = 120;
const BATTLE_BASE_ATTACK_DAMAGE = 18;
const BATTLE_DEFEND_REDUCTION = 8;
const BATTLE_PLAYER_COMBO_BASE_RATE = 0.50;
const BATTLE_MONSTER_COMBO_BASE_RATE = 0.20;
const BATTLE_COMBO_BONUS_DAMAGE_PER_EXTRA_ACTOR = 8;
const BATTLE_TARGET_RULE_SLOT_ORDER = "slot_order";
const BATTLE_TARGET_RULE_REVERSE_SLOT_ORDER = "reverse_slot_order";
const BATTLE_TARGET_RULE_WILD_RANDOM = "wild_random";
const BATTLE_INVITE_TTL_MS = 2 * 60 * 1000;
const BATTLE_COMMAND_TIMEOUT_MS = 99 * 1000;
const BATTLE_RECONNECT_GRACE_MS = 300 * 1000;
const BATTLE_CLOSED_ROOM_REPLAY_MS = 10 * 60 * 1000;
const SHOP_TRANSACTION_BUY = "buy";
const SHOP_TRANSACTION_SELL = "sell";
const SHOP_CURRENCY_STONE_COINS = "stoneCoins";
const SHOP_CURRENCY_DIAMONDS = "diamonds";
const EQUIPMENT_ENHANCE_WOOD_MATERIAL_ID = "equip_frag_wood_basic";
const EQUIPMENT_ENHANCE_HIDE_MATERIAL_ID = "equip_frag_hide_basic";
const EQUIPMENT_ENHANCE_BASE_STONE_COST = 20;
const BATTLE_SIDE_ALLY = "ally";
const BATTLE_SIDE_ENEMY = "enemy";
const BATTLE_ACTOR_KIND_PLAYER = "player";
const BATTLE_ACTOR_KIND_PET = "pet";
const BATTLE_ACTOR_KIND_WILD_PET = "wild_pet";
const BATTLE_PET_MAX_PER_PARTICIPANT = 5;
const BATTLE_ACTIVE_PET_MAX_PER_PARTICIPANT = 1;
const MAX_PLAYER_LEVEL = 140;
const MAX_PET_LEVEL = 140;
const PLAYER_STAT_POINTS_PER_LEVEL = 3;
const BATTLE_PET_STATE_BATTLE = "battle";
const BATTLE_PET_STATE_STANDBY = "standby";
const BATTLE_PET_STATE_RIDING = "riding";
const BATTLE_PET_STATE_STORAGE = "storage";
const BATTLE_PET_STORAGE_LIMIT = 20;
const BATTLE_CAPTURE_TOOL_EMPTY_HAND = "empty_hand";
const ENCOUNTER_STONE_ITEM_IDS = new Set([
  "encounter_stone_low",
  "encounter_stone_mid",
  "encounter_stone_high",
]);
const BATTLE_PARTY_PVE_PLAYER_SLOTS = [3, 4, 2, 5, 1];
const BATTLE_PARTY_PVE_PARTNER_SLOTS = [1, 2, 4, 5];
const TRAINING_PARTNER_MAX_COUNT = BATTLE_PARTY_PVE_PARTNER_SLOTS.length;
const BATTLE_EXP_FULL_LEVEL_DELTA = 5;
const BATTLE_EXP_DECAY_LEVEL_RANGE = 15;
const BATTLE_RIDE_PET_EXP_RATE = 0.6;
const BATTLE_PARTY_EXP_BONUS_RATES = Object.freeze({
  2: 0.10,
  3: 0.13,
  4: 0.15,
  5: 0.20,
});
const BACKPACK_BASE_SLOT_LIMIT = 15;
const BACKPACK_SLOT_LIMIT = 20;
const BACKPACK_EXTRA_SLOT_LIMIT = BACKPACK_SLOT_LIMIT - BACKPACK_BASE_SLOT_LIMIT;
const BACKPACK_UNLOCK_COSTS = [50, 100, 200, 400, 1000];
const DEFAULT_STONE_COINS = 120;
const DEFAULT_DIAMONDS = 999999;
const DEV_DIAMONDS_GRANT_VERSION = 1;
const EQUIPMENT_SLOTS_VERSION = 5;
const EQUIPMENT_STARTER_SET_VERSION = 1;
const EXP_PILL_STARTER_VERSION = 2;
const DEFAULT_RECORD_POINT = {
  mapId: "firebud_village_gate",
  spawnName: "doctor_record",
  label: "火芽村医旁记录点",
};
const DEFAULT_RECORD_POINT_CELL = [10, 17];
const DEFAULT_PLAYER_BATTLE_STATS = {
  maxHp: 120,
  attack: 18,
  defense: 6,
  quick: 70,
};
const PLAYER_STAT_KEYS = ["maxHp", "attack", "defense", "quick"];
const PLAYER_STAT_LABELS = Object.freeze({
  maxHp: "生命",
  attack: "攻击",
  defense: "防御",
  quick: "敏捷",
});
const DEFAULT_PET_BATTLE_STATS = {
  maxHp: 90,
  attack: 12,
  defense: 6,
  quick: 50,
};
const BATTLE_PET_STATE_REST = "rest";
const PET_NAME_MAX_LENGTH = 8;
const PET_DROP_TTL_SECONDS = 600;
const PET_PICKUP_LEVEL_MARGIN = 5;
const PET_REBIRTH_MM_STAGE2_CLAIMED_KEY = "petRebirthMmStage2Claimed";
const PET_REBIRTH_MM_GUIDE_KEY = "petRebirthMmGuide";
const PET_REBIRTH_MM_GUIDE_STATUS_AVAILABLE = "available";
const PET_REBIRTH_MM_GUIDE_STATUS_ACTIVE = "active";
const PET_REBIRTH_MM_GUIDE_STATUS_COMPLETED = "completed";
const PET_REBIRTH_MM_TRIAL_GROUP_ID = "pet_rebirth_mm_trial_1";
const PET_CULTIVATION_MODE_ENHANCE = "enhance";
const PET_CULTIVATION_MODE_REBIRTH = "rebirth";
const PET_CULTIVATION_MAX_ENHANCE_LEVEL = 10;
const PET_CULTIVATION_MAX_HISTORY_RECORDS = 20;
const PET_REBIRTH_MM_HELPER_REQUIRED_LEVEL = 79;
const PET_REBIRTH_MM_TARGET_REQUIRED_LEVEL = 80;
const PET_REBIRTH_MM_MAX_STAGE = 2;
const PET_REBIRTH_MM_STONE_CAPACITY = 50;
const PET_REBIRTH_MM_HP_INTERNAL_SCALE = 4.0;
const PET_REBIRTH_MM_TARGET_WEIGHT_SCALE = 1.0;
const PET_REBIRTH_MM_STONE_WEIGHT_SCALE = 8.0;
const PET_REBIRTH_MM_HELPER_GROWTH_WEIGHT_SCALE = 0.6;
const PET_REBIRTH_MM_STONE_EFFECTIVE_EXPONENT = 1.35;
const PET_REBIRTH_MM_STAT_KEYS = ["maxHp", "attack", "defense", "quick"];
const PET_REBIRTH_MM_POOL_RANGES_BY_STAGE = {
  1: {
    0: {min: 0.00, max: 0.10},
    1: {min: 0.55, max: 0.95},
    2: {min: 0.80, max: 1.25},
    3: {min: 1.00, max: 1.45},
    4: {min: 1.15, max: 1.65},
  },
  2: {
    0: {min: 0.00, max: 0.12},
    1: {min: 0.65, max: 1.05},
    2: {min: 0.95, max: 1.40},
    3: {min: 1.15, max: 1.65},
    4: {min: 1.35, max: 1.85},
  },
};
const PROFILE_ACTION_IDS = new Set([
  "player_stat_allocate",
  "backpack_unlock_slot",
  "village_heal",
  "record_point_save",
  "world_item_use",
  "pet_skill_set_slot",
  "pet_skill_move_slot",
  "pet_skill_forget",
  "pet_state_cycle",
  "pet_stable_toggle",
  "pet_party_move",
  "pet_lock_toggle",
  "pet_batch_store",
  "pet_batch_state",
  "pet_rename",
  "pet_drop",
  "pet_clear_storage",
  "pet_pickup_drop",
  "pet_expire_drops",
  "pet_mark_seen",
  "pet_rebirth_mm_stage2_claim",
  "pet_rebirth_mm_guide_start",
  "pet_cultivation_apply",
  "training_partner_set_count",
]);
const PLAYER_REBIRTH_COUNT_KEY = "rebirthCount";
const PLAYER_REBIRTH_HISTORY_KEY = "rebirthHistory";
const PLAYER_REBIRTH_QUEST_COMPLETIONS_KEY = "rebirthQuestCompletions";
const PLAYER_REBIRTH_TRIAL_PROOFS_KEY = "rebirthTrialProofs";
const PLAYER_REBIRTH_FINAL_BOSS_PROOF_ID = "shadow_oath_rebirth_guardian";
const PLAYER_REBIRTH_MAX_COUNT = 6;
const PLAYER_REBIRTH_MIN_LEVEL = 80;
const PLAYER_REBIRTH_PREVIEW_LEVEL_CAP = 140;
const PLAYER_REBIRTH_FORMULA_VERSION = 1;
const PLAYER_REBIRTH_STAT_KEYS = ["maxHp", "attack", "defense", "quick"];
const PLAYER_REBIRTH_DEFAULT_BASE_STATS = Object.freeze({
  maxHp: 120,
  attack: 18,
  defense: 6,
  quick: 70,
});
const PLAYER_REBIRTH_REWARD_ITEMS_BY_TARGET = Object.freeze({
  1: "armor_grace_cloth_3",
  2: "accessory_moist_charm_3",
  3: "weapon_flame_trial_spear",
  4: "boots_gale_trial",
  5: "accessory_four_spirit_charm",
  6: "weapon_shadow_group_bow",
});
const PLAYER_REBIRTH_STARTER_PET_BY_TARGET = Object.freeze({
  1: {formId: "rebirth_starter_earth_cub", name: "地纹幼兽"},
  2: {formId: "rebirth_starter_water_cub", name: "潮纹幼兽"},
  3: {formId: "rebirth_starter_fire_cub", name: "焰纹幼兽"},
  4: {formId: "rebirth_starter_wind_cub", name: "岚纹幼兽"},
  5: {formId: "rebirth_starter_four_spirit_cub", name: "四灵幼兽"},
  6: {formId: "rebirth_starter_shadow_cub", name: "玄影幼兽"},
});

function createAuthService(options = {}) {
  const store = options.store || createMemoryAuthStore();
  const now = options.now || (() => Date.now());
  const randomId = options.randomId || (() => crypto.randomUUID());
  const randomBytes = options.randomBytes || ((size) => crypto.randomBytes(size));
  const serviceEventListeners = new Set();
  let cachedData = null;
  let battleMaintenanceTimer = null;

  function load() {
    if (!cachedData) {
      cachedData = normalizeData(store.load());
      cachedData.playerPositions = {};
      cachedData.battleInvites = {};
      cachedData.battleRooms = {};
    }
    return cachedData;
  }

  function save(data) {
    const normalized = normalizeData(data);
    store.save(persistentDataForStore(normalized));
    cachedData = normalized;
    scheduleBattleMaintenance(cachedData);
  }

  function emitServiceEvent(event) {
    const payload = {
      ...event,
      schemaVersion: 1,
      createdAt: isoNow(now),
    };
    if (serviceEventIsReplayable(payload)) {
      const data = load();
      const eventSeq = nextServiceEventSeq(data);
      payload.eventId = `server_event_${eventSeq}`;
      payload.eventSeq = eventSeq;
      data.serviceEventSeq = eventSeq;
      data.serviceEvents.push(clone(payload));
      while (data.serviceEvents.length > MAX_SERVICE_EVENTS) {
        data.serviceEvents.shift();
      }
      save(data);
    }
    for (const listener of serviceEventListeners) {
      listener(payload);
    }
  }

  function onEvent(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }
    serviceEventListeners.add(listener);
    return () => serviceEventListeners.delete(listener);
  }

  function register(payload = {}) {
    const username = normalizeUsername(payload.username);
    const password = String(payload.password || "");
    const displayName = String(payload.displayName || "").trim() || username;
    if (!isValidUsername(username)) {
      return fail("invalid_username", "账号只能使用3-20位小写字母、数字或下划线。");
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      return fail("weak_password", "密码至少需要4位。");
    }
    const data = load();
    if (data.accounts[username]) {
      recordAuthEvent(data, "register_denied", username, false, "账号已存在。", now);
      save(data);
      return fail("account_exists", "账号已存在，请直接登录。");
    }
    const accountId = `acc_${randomId()}`;
    const salt = randomBytes(16).toString("hex");
    const account = {
      accountId,
      username,
      displayName,
      role: ROLE_PLAYER,
      passwordSalt: salt,
      passwordHash: hashPassword(password, salt),
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
      schemaVersion: 1,
    };
    data.accounts[username] = account;
    data.profileBindings[accountId] = {
      accountId,
      playerId: `player_${accountId.slice(4, 16)}`,
      profileRevision: 0,
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
      schemaVersion: 1,
    };
    ensureProfileForAccount(data, account, now);
    recordAuthEvent(data, "register", username, true, "", now);
    const sessionResult = createSessionForAccount(data, account, now, randomBytes);
    save(data);
    return ok({
      account: publicAccount(account),
      session: publicSession(sessionResult.session, account, data, sessionResult.token),
      profileBinding: data.profileBindings[accountId],
      profileSummary: profileSummaryForAccount(account, data),
    });
  }

  function login(payload = {}) {
    const username = normalizeUsername(payload.username);
    const password = String(payload.password || "");
    const data = load();
    const account = data.accounts[username];
    if (!account) {
      recordAuthEvent(data, "login_denied", username, false, "账号不存在。", now);
      save(data);
      return fail("account_missing", "账号不存在。");
    }
    if (hashPassword(password, account.passwordSalt) !== account.passwordHash) {
      recordAuthEvent(data, "login_denied", username, false, "密码不正确。", now);
      save(data);
      return fail("wrong_password", "密码不正确。");
    }
    const ensured = ensureProfileForAccount(data, account, now);
    const sessionResult = createSessionForAccount(data, account, now, randomBytes);
    recordAuthEvent(data, "login", username, true, "", now);
    save(data);
    return ok({
      account: publicAccount(account),
      session: publicSession(sessionResult.session, account, data, sessionResult.token),
      profileBinding: ensured.binding,
      profileSummary: profileSummaryForAccount(account, data),
    });
  }

  function logout(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    resolved.session.revokedAt = isoNow(now);
    recordAuthEvent(data, "logout", resolved.account.username, true, "", now);
    save(data);
    return ok({"message": "已退出登录。"});
  }

  function getSession(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const ensured = ensureProfileForAccount(data, resolved.account, now);
    if (ensured.created) {
      save(data);
    }
    return ok({
      account: publicAccount(resolved.account),
      session: publicSession(resolved.session, resolved.account, data),
      profileBinding: ensured.binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
    });
  }

  function getProfile(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const ensured = ensureProfileForAccount(data, resolved.account, now);
    if (ensured.created) {
      save(data);
    }
    const binding = ensured.binding;
    const profileDoc = ensured.profileDoc;
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: profileDoc && profileDoc.profile ? clone(profileDoc.profile) : null,
    });
  }

  function saveProfile(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const profile = payload.profile;
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      return fail("invalid_profile", "角色档案必须是对象。");
    }
    const binding = profileBindingForAccount(data, resolved.account, now);
    const currentRevision = Number(binding.profileRevision || 0);
    const expectedRevision = Number(payload.expectedRevision || 0);
    if (expectedRevision !== currentRevision) {
      return fail("revision_conflict", "服务器档案已更新，请重新登录或重新拉取档案。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const nextRevision = currentRevision + 1;
    binding.profileRevision = nextRevision;
    binding.updatedAt = isoNow(now);
    data.profileBindings[resolved.account.accountId] = binding;
    data.profiles[binding.playerId] = {
      playerId: binding.playerId,
      accountId: resolved.account.accountId,
      profileRevision: nextRevision,
      profile: clone(profile),
      updatedAt: binding.updatedAt,
      schemaVersion: 1,
    };
    save(data);
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      message: "角色档案已同步。",
    });
  }

  function startHangSession(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const ensured = ensureProfileForAccount(data, resolved.account, now);
    const profileDoc = ensured.profileDoc;
    const profile = profileDoc && profileDoc.profile && typeof profileDoc.profile === "object" && !Array.isArray(profileDoc.profile)
      ? clone(profileDoc.profile)
      : null;
    if (!profile) {
      return fail("profile_missing", "请先创建角色档案。", {
        profileBinding: ensured.binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const mode = normalizeHangMode(payload.mode || payload.type);
    if (!mode) {
      return fail("hang_mode_invalid", "挂机模式不正确。", {
        profileBinding: ensured.binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const party = partyForAccount(data, resolved.account.accountId);
    const partyLeaderAccountId = party ? String(party.leaderAccountId || "") : resolved.account.accountId;
    if (party && partyLeaderAccountId !== resolved.account.accountId) {
      return fail("hang_party_leader_required", mode === "encounter_stone" ? "队伍中只有队长可以使用遇敌石。" : "队伍中只有队长可以开始挂机。", {
        profileBinding: ensured.binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const settings = normalizeHangSettings(payload.settings);
    profile.hangSettings = settings;
    let session = normalizeHangSession(profile.hangSession);
    const origin = normalizeHangOriginPayload(payload);
    session = {
      ...session,
      enabled: true,
      mode,
      pendingResume: false,
      lastStopReason: "",
      originMapId: origin.mapId || session.originMapId,
      originCell: origin.originCell,
    };
    if (mode === "encounter_stone") {
      const itemId = String(payload.itemId || payload.encounterStoneItemId || "").trim();
      if (!ENCOUNTER_STONE_ITEM_IDS.has(itemId)) {
        return fail("hang_item_invalid", "遇敌石道具不正确。", {
          profileBinding: ensured.binding,
          profileSummary: profileSummaryForAccount(resolved.account, data),
        });
      }
      const slots = normalizeBackpackSlots(profileBackpackSlots(profile));
      if (backpackItemCount(slots, itemId) <= 0) {
        return fail("item_not_enough", "遇敌石不够。", {
          profileBinding: ensured.binding,
          profileSummary: profileSummaryForAccount(resolved.account, data),
        });
      }
      profile.backpackSlots = consumeBackpackItem(slots, itemId, 1);
      profile.captureTools = captureToolBagFromProfile(profile);
    }
    profile.hangSession = session;
    const persisted = persistProfileForAccount(data, resolved.account, ensured.binding, profile, now);
    save(data);
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(profile),
      hang: publicHangSession(session),
      message: mode === "encounter_stone" ? "遇敌石已生效。" : "开始挂机。",
    });
  }

  function stopHangSession(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const ensured = ensureProfileForAccount(data, resolved.account, now);
    const profileDoc = ensured.profileDoc;
    const profile = profileDoc && profileDoc.profile && typeof profileDoc.profile === "object" && !Array.isArray(profileDoc.profile)
      ? clone(profileDoc.profile)
      : null;
    if (!profile) {
      return fail("profile_missing", "请先创建角色档案。", {
        profileBinding: ensured.binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const previousSession = normalizeHangSession(profile.hangSession);
    const reason = normalizeHangStopReason(payload.reason || payload.message || "manual");
    const nextSession = {
      ...previousSession,
      enabled: false,
      pendingResume: Boolean(payload.pendingResume),
      lastStopReason: reason,
    };
    profile.hangSession = nextSession;
    const changed = JSON.stringify(previousSession) !== JSON.stringify(nextSession);
    let binding = ensured.binding;
    if (changed) {
      const persisted = persistProfileForAccount(data, resolved.account, ensured.binding, profile, now);
      binding = persisted.binding;
      save(data);
    } else if (ensured.created) {
      save(data);
    }
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(profile),
      hang: publicHangSession(nextSession),
      message: "挂机已停止。",
    });
  }

  function profileAction(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const ensured = ensureProfileForAccount(data, resolved.account, now);
    const binding = ensured.binding;
    const profileDoc = ensured.profileDoc;
    if (!profileDoc || !profileDoc.profile || typeof profileDoc.profile !== "object" || Array.isArray(profileDoc.profile)) {
      return fail("profile_missing", "请先创建角色档案。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const action = normalizeProfileActionId(payload.action || payload.type || payload.kind || payload.command);
    if (!PROFILE_ACTION_IDS.has(action)) {
      return fail("profile_action_invalid", "档案操作不正确。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const profile = clone(profileDoc.profile);
    const params = objectOrEmpty(payload.payload || payload.params || payload);
    const actionResult = applyProfileActionToProfile(profile, action, params, now);
    if (!actionResult.ok) {
      return fail(actionResult.code || "profile_action_failed", actionResult.message || "档案操作失败。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
        result: publicProfileActionResult(action, actionResult),
      });
    }
    const persisted = persistProfileForAccount(data, resolved.account, binding, profile, now);
    save(data);
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(profile),
      result: publicProfileActionResult(action, actionResult),
      logLines: profileActionLogLines(actionResult),
      message: actionResult.message || "角色档案已更新。",
    });
  }

  function playerRebirth(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const binding = profileBindingForAccount(data, resolved.account, now);
    const profileDoc = data.profiles[binding.playerId] || null;
    if (!profileDoc || !profileDoc.profile || typeof profileDoc.profile !== "object" || Array.isArray(profileDoc.profile)) {
      return fail("profile_missing", "请先创建角色档案。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const profile = clone(profileDoc.profile);
    const rebirthResult = executePlayerRebirthToProfile(profile);
    if (!rebirthResult.ok) {
      return fail(rebirthResult.code || "player_rebirth_not_ready", rebirthResult.message || "暂时不能转生。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
        rebirth: rebirthResult.rebirth || null,
      });
    }
    const updatedAt = isoNow(now);
    const nextRevision = Number(binding.profileRevision || 0) + 1;
    binding.profileRevision = nextRevision;
    binding.updatedAt = updatedAt;
    data.profileBindings[resolved.account.accountId] = binding;
    data.profiles[binding.playerId] = {
      playerId: binding.playerId,
      accountId: resolved.account.accountId,
      profileRevision: nextRevision,
      profile,
      updatedAt,
      schemaVersion: 1,
    };
    const returnEntry = applyPlayerRebirthReturn(data, resolved.account, now);
    save(data);
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(profile),
      rebirth: rebirthResult.rebirth,
      returnEntry,
      message: rebirthResult.message,
    });
  }

  function questRecord(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const binding = profileBindingForAccount(data, resolved.account, now);
    const profileDoc = data.profiles[binding.playerId] || null;
    if (!profileDoc || !profileDoc.profile || typeof profileDoc.profile !== "object" || Array.isArray(profileDoc.profile)) {
      return fail("profile_missing", "请先创建角色档案。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const event = normalizedQuestEventPayload(payload.event && typeof payload.event === "object" && !Array.isArray(payload.event) ? payload.event : payload);
    if (String(event.type || "") === "") {
      return fail("quest_event_invalid", "任务事件为空。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const profile = clone(profileDoc.profile);
    const questId = String(payload.questId || event.questId || "").trim();
    const progress = questId !== ""
      ? recordQuestEventByIdToProfile(profile, questId, event)
      : recordQuestEventToProfile(profile, event);
    if (!progress.ok) {
      return fail(progress.code || "quest_event_invalid", progress.message || "任务无法推进。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const questMessages = [];
    if (progress.changed && progress.message) {
      questMessages.push(progress.message);
    }
    if (progress.ready) {
      const quest = questById(progress.questId);
      if (quest && Boolean(quest.autoClaimOnReady) && questRewardChoices(quest).length <= 0) {
        const claim = claimQuestByIdToProfile(profile, progress.questId, "", !questIsOptional(quest));
        if (claim.ok && claim.message) {
          questMessages.push(claim.message);
        }
      }
    }
    const persisted = persistProfileForAccount(data, resolved.account, binding, profile, now);
    save(data);
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(profile),
      progress: publicQuestProgress(progress),
      questMessages,
      message: questMessages.filter(Boolean).join("\n") || progress.message || "任务已同步。",
    });
  }

  function questClaim(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const binding = profileBindingForAccount(data, resolved.account, now);
    const profileDoc = data.profiles[binding.playerId] || null;
    if (!profileDoc || !profileDoc.profile || typeof profileDoc.profile !== "object" || Array.isArray(profileDoc.profile)) {
      return fail("profile_missing", "请先创建角色档案。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const profile = clone(profileDoc.profile);
    const requestedQuestId = String(payload.questId || payload.id || "").trim();
    const questId = requestedQuestId !== "" ? requestedQuestId : currentProfileQuestId(profile);
    const quest = questById(questId);
    if (!quest) {
      return fail("quest_missing", "当前没有可领取的任务奖励。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const rewardChoiceId = String(payload.rewardChoiceId || payload.choiceId || "").trim();
    const claim = claimQuestByIdToProfile(profile, questId, rewardChoiceId, !questIsOptional(quest));
    if (!claim.ok) {
      return fail(claim.code || "quest_claim_failed", claim.message || "领取任务奖励失败。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
        requiresChoice: Boolean(claim.requiresChoice),
      });
    }
    const persisted = persistProfileForAccount(data, resolved.account, binding, profile, now);
    save(data);
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(profile),
      claim: publicQuestClaim(claim),
      questMessages: [claim.message].filter(Boolean),
      message: claim.message,
    });
  }

  function shopTransaction(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const mode = normalizeShopTransactionMode(payload.mode || payload.action || payload.type);
    if (!mode) {
      return fail("invalid_shop_action", "商店操作不正确。");
    }
    const shopId = String(payload.shopId || "").trim();
    const itemId = String(payload.itemId || "").trim();
    const amount = clampInt(payload.amount, 1, 999, 1);
    const entry = shopEntryForItem(shopId, itemId);
    const itemLabel = bagItemLabel(itemId);
    if (!entry) {
      return fail("shop_item_missing", "商店没有出售这个物品。");
    }
    const binding = profileBindingForAccount(data, resolved.account, now);
    const profileDoc = data.profiles[binding.playerId] || null;
    if (!profileDoc || !profileDoc.profile || typeof profileDoc.profile !== "object" || Array.isArray(profileDoc.profile)) {
      return fail("profile_missing", "请先创建角色档案。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const profile = clone(profileDoc.profile);
    const currency = shopCurrencyFor(shopId);
    const currencyLabel = shopCurrencyLabel(currency);
    const backpackSlots = normalizeBackpackSlots(profileBackpackSlots(profile));
    let transaction = null;
    const questMessages = [];
    if (mode === SHOP_TRANSACTION_BUY) {
      if (!shopEntryIsBuyable(entry)) {
        return fail("shop_item_not_buyable", `${itemLabel} 暂时不能购买。`);
      }
      const totalPrice = shopBuyPrice(entry) * amount;
      const currentCurrency = profileCurrencyAmount(profile, currency);
      if (currentCurrency < totalPrice) {
        return fail("not_enough_currency", `${currencyLabel}不够。`);
      }
      const addResult = addSingleItemToBackpack(backpackSlots, itemId, amount);
      if (addResult.addedCount < amount) {
        return fail("backpack_full", "背包已满。");
      }
      profile.backpackSlots = normalizeBackpackSlots(addResult.slots);
      profile.captureTools = captureToolBagFromProfile(profile);
      setProfileCurrencyAmount(profile, currency, currentCurrency - totalPrice);
      transaction = {
        mode,
        shopId,
        itemId,
        amount,
        price: totalPrice,
        currency,
        schemaVersion: 1,
      };
      const questProgress = recordQuestEventToProfile(profile, {
        type: "buy_item",
        shopId,
        itemId,
        amount,
        schemaVersion: 1,
      });
      if (questProgress.changed && questProgress.message) {
        questMessages.push(questProgress.message);
      }
      if (questProgress.ready && activeQuestAutoClaim(profile)) {
        const claim = claimActiveQuestToProfile(profile);
        if (claim.ok && claim.message) {
          questMessages.push(claim.message);
        }
      }
    } else {
      if (!shopEntryIsSellable(shopId, entry)) {
        return fail("shop_item_not_sellable", `${itemLabel} 不能出售。`);
      }
      const heldCount = backpackItemCount(backpackSlots, itemId);
      if (heldCount < amount) {
        return fail("item_not_enough", `${itemLabel} 数量不够。`);
      }
      const totalPrice = shopSellPrice(shopId, entry) * amount;
      profile.backpackSlots = consumeBackpackItem(backpackSlots, itemId, amount);
      profile.captureTools = captureToolBagFromProfile(profile);
      setProfileCurrencyAmount(profile, currency, profileCurrencyAmount(profile, currency) + totalPrice);
      transaction = {
        mode,
        shopId,
        itemId,
        amount,
        price: totalPrice,
        currency,
        schemaVersion: 1,
      };
    }
    const updatedAt = isoNow(now);
    const nextRevision = Number(binding.profileRevision || 0) + 1;
    binding.profileRevision = nextRevision;
    binding.updatedAt = updatedAt;
    data.profileBindings[resolved.account.accountId] = binding;
    data.profiles[binding.playerId] = {
      playerId: binding.playerId,
      accountId: resolved.account.accountId,
      profileRevision: nextRevision,
      profile,
      updatedAt,
      schemaVersion: 1,
    };
    save(data);
    const actionLabel = mode === SHOP_TRANSACTION_SELL ? "出售" : "购买";
    const priceVerb = mode === SHOP_TRANSACTION_SELL ? "获得" : "花费";
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(profile),
      transaction,
      questMessages,
      message: `${actionLabel}${itemLabel} x${amount}，${priceVerb}${transaction.price}${currencyLabel}。`,
    });
  }

  function equipmentEquip(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const itemId = String(payload.itemId || payload.equipmentItemId || "").trim();
    const item = equipmentItemById(itemId);
    const itemLabel = equipmentItemLabel(itemId);
    if (!item) {
      return fail("equipment_item_invalid", `${itemLabel} 不能装备。`);
    }
    const binding = profileBindingForAccount(data, resolved.account, now);
    const profileDoc = data.profiles[binding.playerId] || null;
    if (!profileDoc || !profileDoc.profile || typeof profileDoc.profile !== "object" || Array.isArray(profileDoc.profile)) {
      return fail("profile_missing", "请先创建角色档案。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const profile = clone(profileDoc.profile);
    const equipResult = equipItemToProfile(profile, itemId);
    if (!equipResult.ok) {
      return fail(equipResult.code || "equipment_equip_failed", equipResult.message || "装备失败。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const questMessages = [];
    const questProgress = recordQuestEventToProfile(profile, {
      type: "equip_item",
      itemId,
      slot: equipResult.slot,
      amount: 1,
      schemaVersion: 1,
    });
    if (questProgress.changed && questProgress.message) {
      questMessages.push(questProgress.message);
    }
    if (questProgress.ready && activeQuestAutoClaim(profile)) {
      const claim = claimActiveQuestToProfile(profile);
      if (claim.ok && claim.message) {
        questMessages.push(claim.message);
      }
    }
    const updatedAt = isoNow(now);
    const nextRevision = Number(binding.profileRevision || 0) + 1;
    binding.profileRevision = nextRevision;
    binding.updatedAt = updatedAt;
    data.profileBindings[resolved.account.accountId] = binding;
    data.profiles[binding.playerId] = {
      playerId: binding.playerId,
      accountId: resolved.account.accountId,
      profileRevision: nextRevision,
      profile,
      updatedAt,
      schemaVersion: 1,
    };
    save(data);
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(profile),
      equipment: {
        itemId,
        slot: equipResult.slot,
        instanceId: equipResult.instanceId,
        previousItemId: equipResult.previousItemId,
        previousInstanceId: equipResult.previousInstanceId,
        schemaVersion: 1,
      },
      questMessages,
      message: equipResult.message,
    });
  }

  function equipmentEnhance(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const slotId = String(payload.slotId || payload.slot || "").trim();
    const binding = profileBindingForAccount(data, resolved.account, now);
    const profileDoc = data.profiles[binding.playerId] || null;
    if (!profileDoc || !profileDoc.profile || typeof profileDoc.profile !== "object" || Array.isArray(profileDoc.profile)) {
      return fail("profile_missing", "请先创建角色档案。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const profile = clone(profileDoc.profile);
    const enhanceResult = enhanceEquipmentSlotToProfile(profile, slotId);
    if (!enhanceResult.ok) {
      return fail(enhanceResult.code || "equipment_enhance_failed", enhanceResult.message || "强化失败。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const questMessages = [];
    const questProgress = recordQuestEventToProfile(profile, {
      type: "enhance_equipment",
      itemId: enhanceResult.itemId,
      slotId: enhanceResult.slotId,
      slot: enhanceResult.slotId,
      level: enhanceResult.level,
      amount: 1,
      schemaVersion: 1,
    });
    if (questProgress.changed && questProgress.message) {
      questMessages.push(questProgress.message);
    }
    if (questProgress.ready && activeQuestAutoClaim(profile)) {
      const claim = claimActiveQuestToProfile(profile);
      if (claim.ok && claim.message) {
        questMessages.push(claim.message);
      }
    }
    const updatedAt = isoNow(now);
    const nextRevision = Number(binding.profileRevision || 0) + 1;
    binding.profileRevision = nextRevision;
    binding.updatedAt = updatedAt;
    data.profileBindings[resolved.account.accountId] = binding;
    data.profiles[binding.playerId] = {
      playerId: binding.playerId,
      accountId: resolved.account.accountId,
      profileRevision: nextRevision,
      profile,
      updatedAt,
      schemaVersion: 1,
    };
    save(data);
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(profile),
      enhancement: {
        slotId: enhanceResult.slotId,
        itemId: enhanceResult.itemId,
        level: enhanceResult.level,
        materialId: enhanceResult.materialId,
        materialCount: enhanceResult.materialCount,
        stoneCost: enhanceResult.stoneCost,
        instanceId: enhanceResult.instanceId,
        schemaVersion: 1,
      },
      questMessages,
      message: enhanceResult.message,
    });
  }

  function equipmentRepairAll(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const binding = profileBindingForAccount(data, resolved.account, now);
    const profileDoc = data.profiles[binding.playerId] || null;
    if (!profileDoc || !profileDoc.profile || typeof profileDoc.profile !== "object" || Array.isArray(profileDoc.profile)) {
      return fail("profile_missing", "请先创建角色档案。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const profile = clone(profileDoc.profile);
    const repairResult = repairAllEquipmentToProfile(profile);
    if (!repairResult.ok) {
      return fail(repairResult.code || "equipment_repair_failed", repairResult.message || "修理失败。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const updatedAt = isoNow(now);
    const nextRevision = Number(binding.profileRevision || 0) + 1;
    binding.profileRevision = nextRevision;
    binding.updatedAt = updatedAt;
    data.profileBindings[resolved.account.accountId] = binding;
    data.profiles[binding.playerId] = {
      playerId: binding.playerId,
      accountId: resolved.account.accountId,
      profileRevision: nextRevision,
      profile,
      updatedAt,
      schemaVersion: 1,
    };
    save(data);
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(profile),
      repair: {
        missingDurability: repairResult.missingDurability,
        cost: repairResult.cost,
        repairedSlots: repairResult.repairedSlots,
        schemaVersion: 1,
      },
      message: repairResult.message,
    });
  }

  function equipmentSynthesize(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const recipeId = String(payload.recipeId || payload.id || "").trim();
    const binding = profileBindingForAccount(data, resolved.account, now);
    const profileDoc = data.profiles[binding.playerId] || null;
    if (!profileDoc || !profileDoc.profile || typeof profileDoc.profile !== "object" || Array.isArray(profileDoc.profile)) {
      return fail("profile_missing", "请先创建角色档案。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const profile = clone(profileDoc.profile);
    const synthesisResult = synthesizeEquipmentToProfile(profile, recipeId);
    if (!synthesisResult.ok) {
      return fail(synthesisResult.code || "equipment_synthesis_failed", synthesisResult.message || "合成失败。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const questMessages = [];
    const questProgress = recordQuestEventToProfile(profile, {
      type: "synthesize_equipment",
      recipeId,
      itemId: synthesisResult.outputItemId,
      outputItemId: synthesisResult.outputItemId,
      category: synthesisResult.category,
      amount: synthesisResult.outputCount,
      schemaVersion: 1,
    });
    if (questProgress.changed && questProgress.message) {
      questMessages.push(questProgress.message);
    }
    if (questProgress.ready && activeQuestAutoClaim(profile)) {
      const claim = claimActiveQuestToProfile(profile);
      if (claim.ok && claim.message) {
        questMessages.push(claim.message);
      }
    }
    const updatedAt = isoNow(now);
    const nextRevision = Number(binding.profileRevision || 0) + 1;
    binding.profileRevision = nextRevision;
    binding.updatedAt = updatedAt;
    data.profileBindings[resolved.account.accountId] = binding;
    data.profiles[binding.playerId] = {
      playerId: binding.playerId,
      accountId: resolved.account.accountId,
      profileRevision: nextRevision,
      profile,
      updatedAt,
      schemaVersion: 1,
    };
    save(data);
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(profile),
      synthesis: {
        recipeId,
        outputItemId: synthesisResult.outputItemId,
        outputCount: synthesisResult.outputCount,
        materials: synthesisResult.materials,
        stoneCost: synthesisResult.stoneCost,
        category: synthesisResult.category,
        instanceIds: synthesisResult.instanceIds,
        schemaVersion: 1,
      },
      questMessages,
      message: synthesisResult.message,
    });
  }

  function searchPlayers(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const username = normalizeUsername(payload.username || payload.query || "");
    if (!username) {
      return ok({"players": []});
    }
    const players = Object.values(data.accounts)
      .filter((account) => account && account.username && account.username.includes(username))
      .sort((a, b) => String(a.username).localeCompare(String(b.username)))
      .slice(0, MAX_PLAYER_SEARCH_RESULTS)
      .map((account) => publicPlayerSearchResult(account, data));
    return ok({players});
  }

  function sendMail(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const recipientUsername = normalizeUsername(payload.recipientUsername || payload.toUsername || payload.username || "");
    const recipient = data.accounts[recipientUsername];
    if (!recipient) {
      return fail("recipient_missing", "收件账号不存在。");
    }
    if (recipient.accountId === resolved.account.accountId) {
      return fail("recipient_self", "不能给自己发送邮件。");
    }
    const title = normalizeMailText(payload.title, MAIL_TITLE_MAX_LENGTH);
    if (!title) {
      return fail("invalid_title", "邮件标题不能为空。");
    }
    const body = normalizeMailText(payload.body, MAIL_BODY_MAX_LENGTH);
    if (!body) {
      return fail("invalid_body", "邮件正文不能为空。");
    }
    const attachments = normalizeMailItems(payload.items || payload.attachments || []);
    let senderProfileDoc = null;
    let senderProfile = null;
    let senderBinding = null;
    if (attachments.length > 0) {
      senderBinding = profileBindingForAccount(data, resolved.account, now);
      senderProfileDoc = data.profiles[senderBinding.playerId] || null;
      if (!senderProfileDoc || !senderProfileDoc.profile || typeof senderProfileDoc.profile !== "object" || Array.isArray(senderProfileDoc.profile)) {
        return fail("profile_missing", "请先创建角色档案。", {
          profileBinding: senderBinding,
          profileSummary: profileSummaryForAccount(resolved.account, data),
        });
      }
      senderProfile = clone(senderProfileDoc.profile);
      const senderSlots = normalizeBackpackSlots(profileBackpackSlots(senderProfile));
      for (const item of attachments) {
        if (backpackItemCount(senderSlots, item.itemId) < item.count) {
          return fail("mail_attachment_not_enough", `${bagItemLabel(item.itemId)} 数量不够。`, {
            itemId: item.itemId,
            required: item.count,
          });
        }
      }
      let nextSlots = senderSlots;
      for (const item of attachments) {
        nextSlots = consumeBackpackItem(nextSlots, item.itemId, item.count);
      }
      senderProfile.backpackSlots = normalizeBackpackSlots(nextSlots);
      senderProfile.captureTools = captureToolBagFromProfile(senderProfile);
      const updatedAt = isoNow(now);
      const nextRevision = Number(senderBinding.profileRevision || 0) + 1;
      senderBinding.profileRevision = nextRevision;
      senderBinding.updatedAt = updatedAt;
      data.profileBindings[resolved.account.accountId] = senderBinding;
      data.profiles[senderBinding.playerId] = {
        playerId: senderBinding.playerId,
        accountId: resolved.account.accountId,
        profileRevision: nextRevision,
        profile: senderProfile,
        updatedAt,
        schemaVersion: 1,
      };
    }
    const mail = {
      mailId: `mail_${randomId()}`,
      senderAccountId: resolved.account.accountId,
      senderUsername: resolved.account.username,
      senderDisplayName: resolved.account.displayName,
      recipientAccountId: recipient.accountId,
      recipientUsername: recipient.username,
      recipientDisplayName: recipient.displayName,
      title,
      body,
      items: attachments,
      createdAt: isoNow(now),
      readAt: null,
      schemaVersion: 1,
    };
    data.mailMessages[mail.mailId] = mail;
    save(data);
    return ok({
      mail: publicMail(mail),
      profileSummary: senderBinding ? profileSummaryForAccount(resolved.account, data) : undefined,
      profile: senderProfile ? clone(senderProfile) : undefined,
      message: "邮件已发送。",
    });
  }

  function listInbox(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const messages = Object.values(data.mailMessages)
      .filter((mail) => mail && mail.recipientAccountId === resolved.account.accountId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map(publicMail);
    return ok({
      messages,
      unreadCount: messages.filter((mail) => !mail.readAt).length,
    });
  }

  function markMailRead(token, mailId) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const normalizedMailId = String(mailId || "").trim();
    const mail = data.mailMessages[normalizedMailId];
    if (!mail || mail.recipientAccountId !== resolved.account.accountId) {
      return fail("mail_missing", "邮件不存在。");
    }
    if (!mail.readAt) {
      mail.readAt = isoNow(now);
      data.mailMessages[normalizedMailId] = mail;
      save(data);
    }
    return ok({
      mail: publicMail(mail),
      message: "邮件已读。",
    });
  }

  function claimMailAttachments(token, mailId) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const normalizedMailId = String(mailId || "").trim();
    const mail = data.mailMessages[normalizedMailId];
    if (!mail || mail.recipientAccountId !== resolved.account.accountId) {
      return fail("mail_missing", "邮件不存在。");
    }
    const attachments = normalizeMailItems(mail.items || []);
    if (attachments.length <= 0) {
      return fail("mail_no_attachments", "邮件没有可领取附件。", {
        mail: publicMail(mail),
      });
    }
    const binding = profileBindingForAccount(data, resolved.account, now);
    const profileDoc = data.profiles[binding.playerId] || null;
    if (!profileDoc || !profileDoc.profile || typeof profileDoc.profile !== "object" || Array.isArray(profileDoc.profile)) {
      return fail("profile_missing", "请先创建角色档案。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const profile = clone(profileDoc.profile);
    const addResult = addRewardItemsToBackpack(profileBackpackSlots(profile), attachments);
    if (addResult.addedItems.length <= 0) {
      return fail("backpack_full", "背包已满，无法领取邮件附件。", {
        mail: publicMail(mail),
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    profile.backpackSlots = normalizeBackpackSlots(addResult.slots);
    profile.captureTools = captureToolBagFromProfile(profile);
    const remaining = normalizeMailItems(addResult.lostItems);
    if (remaining.length > 0) {
      mail.items = remaining;
      data.mailMessages[normalizedMailId] = mail;
    } else {
      delete data.mailMessages[normalizedMailId];
    }
    const updatedAt = isoNow(now);
    const nextRevision = Number(binding.profileRevision || 0) + 1;
    binding.profileRevision = nextRevision;
    binding.updatedAt = updatedAt;
    data.profileBindings[resolved.account.accountId] = binding;
    data.profiles[binding.playerId] = {
      playerId: binding.playerId,
      accountId: resolved.account.accountId,
      profileRevision: nextRevision,
      profile,
      updatedAt,
      schemaVersion: 1,
    };
    save(data);
    const message = "领取邮件附件：%s。".replace("%s", itemAmountText(addResult.addedItems));
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(profile),
      mail: remaining.length > 0 ? publicMail(mail) : null,
      claim: {
        mailId: normalizedMailId,
        addedItems: addResult.addedItems,
        remainingItems: remaining,
        schemaVersion: 1,
      },
      message: remaining.length > 0 ? `${message} 背包空间不足，剩余附件留在邮箱。` : message,
    });
  }

  function listOnlinePlayers(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const viewerPosition = data.playerPositions[resolved.account.accountId] || null;
    const aoi = normalizeOnlineAoiPayload(payload, viewerPosition);
    const players = publicOnlinePlayersForViewer(data, resolved.account, aoi, now);
    return ok({
      players,
      party: publicPartyForAccount(data, resolved.account.accountId),
      aoi: publicOnlineAoi(aoi),
    });
  }

  function updatePlayerPosition(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const party = partyForAccount(data, resolved.account.accountId);
    const currentPosition = data.playerPositions[resolved.account.accountId]
      ? publicPlayerPosition(data.playerPositions[resolved.account.accountId])
      : null;
    if (party && party.leaderAccountId !== resolved.account.accountId) {
      const position = partyMemberFollowSnapshotPosition(data, resolved.account, payload, now);
      if (!position) {
        return rejectMovementStep("movement_party_member_locked", "队伍中由队长带队移动。", currentPosition, {
          movement: {
            reason: "movement_party_member_locked",
            requiresSync: false,
          },
        });
      }
      const previousPosition = data.playerPositions[resolved.account.accountId]
        ? publicPlayerPosition(data.playerPositions[resolved.account.accountId])
        : null;
      data.playerPositions[resolved.account.accountId] = position;
      return publishPositionUpdate(data, resolved.account, position, previousPosition, payload, {
        authority: "party_follow",
        movement: {
          authority: "party_follow",
          stepAccepted: false,
          reason: "movement_party_member_locked",
          retryable: false,
          requiresSync: false,
          maxStepCells: MOVEMENT_MAX_STEP_CELLS,
        },
      });
    }
    const position = normalizePlayerPositionPayload(payload, resolved.account, now);
    if (!position.mapId) {
      return fail("position_map_missing", "位置缺少地图。");
    }
    const previousPosition = currentPosition;
    data.playerPositions[resolved.account.accountId] = position;
    applyPartyFollowForLeaderPositionChange(data, party, resolved.account.accountId, previousPosition, position, now);
    return publishPositionUpdate(data, resolved.account, position, previousPosition, payload, {
      authority: "client_snapshot",
    });
  }

  function movePlayerStep(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const currentPosition = data.playerPositions[resolved.account.accountId] || null;
    const party = partyForAccount(data, resolved.account.accountId);
    if (party && party.leaderAccountId !== resolved.account.accountId) {
      return rejectMovementStep("movement_party_member_locked", "队伍中由队长带队移动。", currentPosition, {
        movement: {
          reason: "movement_party_member_locked",
          requiresSync: false,
        },
      });
    }
    if (activeBattleRoomForAccount(data, resolved.account.accountId)) {
      return rejectMovementStep("movement_battle_locked", "切磋房间中不能移动。", currentPosition);
    }
    if (!currentPosition || !currentPosition.mapId) {
      return rejectMovementStep("movement_position_missing", "请先同步当前位置。", null);
    }
    const step = normalizeMovementStepPayload(payload, currentPosition);
    if (!step.mapId) {
      return rejectMovementStep("movement_map_missing", "移动缺少地图。", currentPosition);
    }
    if (step.mapId !== currentPosition.mapId) {
      return rejectMovementStep("movement_map_mismatch", "不能用单步移动切换地图。", currentPosition);
    }
    if (step.fromCellX !== Number(currentPosition.cellX || 0) || step.fromCellY !== Number(currentPosition.cellY || 0)) {
      return rejectMovementStep("movement_origin_mismatch", "服务器位置已变化，请重新同步。", currentPosition, {
        movement: {
          retryable: true,
          requiresSync: true,
        },
      });
    }
    const dx = Math.abs(step.toCellX - step.fromCellX);
    const dy = Math.abs(step.toCellY - step.fromCellY);
    if (dx === 0 && dy === 0) {
      return rejectMovementStep("movement_noop", "移动目标与当前位置相同。", currentPosition);
    }
    if (dx > MOVEMENT_MAX_STEP_CELLS || dy > MOVEMENT_MAX_STEP_CELLS) {
      return rejectMovementStep("movement_step_too_far", "移动距离过远，请重新同步。", currentPosition, {
        maxStepCells: MOVEMENT_MAX_STEP_CELLS,
      });
    }
    const position = normalizePlayerPositionPayload({
      mapId: currentPosition.mapId,
      cellX: step.toCellX,
      cellY: step.toCellY,
      facing: normalizeMovementFacing(payload.facing, step),
      moving: Boolean(payload.moving),
    }, resolved.account, now);
    position.movementSeq = Number(currentPosition.movementSeq || 0) + 1;
    position.authority = "server_step";
    const previousPosition = publicPlayerPosition(currentPosition);
    data.playerPositions[resolved.account.accountId] = position;
    applyPartyFollowForLeaderPositionChange(data, party, resolved.account.accountId, previousPosition, position, now);
    return publishPositionUpdate(data, resolved.account, position, previousPosition, payload, {
      authority: "server_step",
      movement: {
        authority: "server_step",
        stepAccepted: true,
        movementSeq: position.movementSeq,
        maxStepCells: MOVEMENT_MAX_STEP_CELLS,
      },
    });
  }

  function rejectMovementStep(code, message, currentPosition = null, extra = {}) {
    const extraMovement = extra.movement && typeof extra.movement === "object" && !Array.isArray(extra.movement)
      ? extra.movement
      : {};
    const payload = {...extra};
    delete payload.movement;
    return fail(code, message, {
      ...payload,
      position: currentPosition ? publicPlayerPosition(currentPosition) : null,
      movement: {
        authority: "server_step",
        stepAccepted: false,
        reason: code,
        retryable: false,
        requiresSync: Boolean(currentPosition),
        maxStepCells: MOVEMENT_MAX_STEP_CELLS,
        ...extraMovement,
      },
    });
  }

  function publishPositionUpdate(data, account, position, previousPosition, payload = {}, extra = {}) {
    const aoi = normalizeOnlineAoiPayload({
      scope: ONLINE_AOI_SCOPE,
      radius: payload.aoiRadius ?? payload.viewRadius ?? payload.radius,
    }, position);
    const players = publicOnlinePlayersForViewer(data, account, aoi, now);
    emitServiceEvent({
      type: "online.position",
      accountId: account.accountId,
      username: account.username,
      position: publicPlayerPosition(position),
      previousPosition,
      players,
      aoi: publicOnlineAoi(aoi),
      authority: extra.authority || "client_snapshot",
      movement: extra.movement || null,
    });
    return ok({
      position: publicPlayerPosition(position),
      players,
      party: publicPartyForAccount(data, account.accountId),
      aoi: publicOnlineAoi(aoi),
      authority: extra.authority || "client_snapshot",
      movement: extra.movement || null,
    });
  }

  function eventForSession(token, event = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    return eventForResolvedSession(data, resolved, event);
  }

  function listEventsForSession(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const afterSeq = normalizeEventSeq(payload.afterSeq ?? payload.lastEventSeq ?? 0);
    const throughSeq = normalizeEventSeq(payload.throughSeq ?? payload.maxEventSeq ?? Number.MAX_SAFE_INTEGER);
    const events = [];
    for (const event of data.serviceEvents) {
      const eventSeq = normalizeEventSeq(event && event.eventSeq);
      if (eventSeq <= afterSeq || eventSeq > throughSeq) {
        continue;
      }
      if (!serviceEventVisibleToAccount(event, resolved.account.accountId)) {
        continue;
      }
      const prepared = eventForResolvedSession(data, resolved, event);
      if (prepared.ok && prepared.visible !== false) {
        events.push(prepared.event || event);
      }
    }
    return ok({
      events,
      latestEventSeq: normalizeEventSeq(data.serviceEventSeq),
    });
  }

  function latestEventSeq() {
    const data = load();
    return normalizeEventSeq(data.serviceEventSeq);
  }

  function eventForResolvedSession(data, resolved, event = {}) {
    if (event && event.type === "online.position") {
      return onlinePositionEventForResolvedSession(data, resolved, event);
    }
    return ok({
      visible: true,
      event,
    });
  }

  function onlinePositionEventForResolvedSession(data, resolved, event = {}) {
    const viewerPosition = data.playerPositions[resolved.account.accountId] || null;
    const aoi = normalizeOnlineAoiPayload({scope: ONLINE_AOI_SCOPE}, viewerPosition);
    const isSelf = resolved.account.accountId === event.accountId;
    const currentVisible = isSelf || onlinePositionVisibleToAoi(event.position, aoi);
    const previousVisible = onlinePositionVisibleToAoi(event.previousPosition, aoi);
    if (aoi.enabled && !currentVisible && !previousVisible) {
      return ok({visible: false});
    }
    let players = publicOnlinePlayersForViewer(data, resolved.account, aoi, now);
    if (currentVisible) {
      players = withPinnedPublicOnlinePlayer(players, data, event.accountId);
    }
    return ok({
      visible: true,
      event: {
        ...event,
        players,
        aoi: publicOnlineAoi(aoi),
      },
    });
  }

  function getPartyState(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    return ok(partyStatePayload(data, resolved.account.accountId));
  }

  function inviteToParty(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const targetUsername = normalizeUsername(payload.username || payload.targetUsername || payload.recipientUsername || "");
    const target = data.accounts[targetUsername];
    if (!target) {
      return fail("party_target_missing", "玩家不存在。");
    }
    if (target.accountId === resolved.account.accountId) {
      return fail("party_invite_self", "不能邀请自己。");
    }
    const targetParty = partyForAccount(data, target.accountId);
    if (targetParty) {
      return fail("party_target_busy", "对方已经在队伍中。");
    }
    let party = partyForAccount(data, resolved.account.accountId);
    if (!party) {
      party = createPartyForLeader(data, resolved.account.accountId, now, randomId);
    }
    if (party.leaderAccountId !== resolved.account.accountId) {
      return fail("party_not_leader", "只有队长可以邀请。");
    }
    if (party.memberAccountIds.length >= PARTY_MAX_MEMBERS) {
      return fail("party_full", "队伍人数已满。");
    }
    const pendingInvite = Object.values(data.partyInvites).find((invite) => (
      invite &&
      invite.status === "pending" &&
      String(invite.kind || "invite") === "invite" &&
      invite.partyId === party.partyId &&
      invite.toAccountId === target.accountId
    ));
    if (pendingInvite) {
      return ok({
        invite: publicPartyInvite(pendingInvite, data),
        party: publicParty(party, data),
        message: "邀请已发送。",
      });
    }
    const invite = {
      inviteId: `invite_${randomId()}`,
      partyId: party.partyId,
      fromAccountId: resolved.account.accountId,
      toAccountId: target.accountId,
      kind: "invite",
      status: "pending",
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
      schemaVersion: 1,
    };
    data.partyInvites[invite.inviteId] = invite;
    party.updatedAt = isoNow(now);
    data.parties[party.partyId] = party;
    save(data);
    emitServiceEvent({
      type: "party.invite",
      targetAccountIds: [resolved.account.accountId, target.accountId],
      party: publicParty(party, data),
      invite: publicPartyInvite(invite, data),
    });
    return ok({
      invite: publicPartyInvite(invite, data),
      party: publicParty(party, data),
      message: "邀请已发送。",
    });
  }

  function applyToParty(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const targetUsername = normalizeUsername(payload.username || payload.targetUsername || payload.recipientUsername || "");
    const target = data.accounts[targetUsername];
    if (!target) {
      return fail("party_target_missing", "玩家不存在。");
    }
    if (target.accountId === resolved.account.accountId) {
      return fail("party_apply_self", "不能申请加入自己的队伍。");
    }
    if (partyForAccount(data, resolved.account.accountId)) {
      return fail("party_already_joined", "你已经在队伍中。");
    }
    const party = partyForAccount(data, target.accountId);
    if (!party) {
      return fail("party_target_no_party", "对方还没有队伍。");
    }
    if (party.memberAccountIds.length >= PARTY_MAX_MEMBERS) {
      return fail("party_full", "队伍人数已满。");
    }
    const leader = accountById(data, party.leaderAccountId);
    if (!leader) {
      return fail("party_missing", "队伍已经解散。");
    }
    const pendingApplication = Object.values(data.partyInvites).find((invite) => (
      invite &&
      invite.status === "pending" &&
      String(invite.kind || "invite") === "application" &&
      invite.partyId === party.partyId &&
      invite.fromAccountId === resolved.account.accountId &&
      invite.toAccountId === leader.accountId
    ));
    if (pendingApplication) {
      return ok({
        invite: publicPartyInvite(pendingApplication, data),
        party: publicParty(party, data),
        message: "入队申请已发送。",
      });
    }
    const invite = {
      inviteId: `invite_${randomId()}`,
      partyId: party.partyId,
      fromAccountId: resolved.account.accountId,
      toAccountId: leader.accountId,
      kind: "application",
      status: "pending",
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
      schemaVersion: 1,
    };
    data.partyInvites[invite.inviteId] = invite;
    party.updatedAt = isoNow(now);
    data.parties[party.partyId] = party;
    save(data);
    emitServiceEvent({
      type: "party.invite",
      targetAccountIds: [resolved.account.accountId, leader.accountId],
      party: publicParty(party, data),
      invite: publicPartyInvite(invite, data),
    });
    return ok({
      invite: publicPartyInvite(invite, data),
      party: publicParty(party, data),
      message: "入队申请已发送。",
    });
  }

  function acceptPartyInvite(token, inviteId) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const invite = data.partyInvites[String(inviteId || "").trim()];
    if (!invite || invite.status !== "pending" || invite.toAccountId !== resolved.account.accountId) {
      return fail("party_invite_missing", "邀请不存在。");
    }
    const party = data.parties[invite.partyId];
    if (!party) {
      invite.status = "expired";
      invite.updatedAt = isoNow(now);
      data.partyInvites[invite.inviteId] = invite;
      save(data);
      return fail("party_missing", "队伍已经解散。");
    }
    const inviteKind = String(invite.kind || "invite");
    const joiningAccountId = inviteKind === "application" ? invite.fromAccountId : resolved.account.accountId;
    if (inviteKind === "application" && party.leaderAccountId !== resolved.account.accountId) {
      return fail("party_not_leader", "只有队长可以同意入队申请。");
    }
    if (partyForAccount(data, joiningAccountId)) {
      return fail("party_already_joined", "玩家已经在队伍中。");
    }
    if (party.memberAccountIds.length >= PARTY_MAX_MEMBERS) {
      return fail("party_full", "队伍人数已满。");
    }
    party.memberAccountIds.push(joiningAccountId);
    party.updatedAt = isoNow(now);
    invite.status = "accepted";
    invite.updatedAt = isoNow(now);
    data.parties[party.partyId] = party;
    data.partyInvites[invite.inviteId] = invite;
    save(data);
    emitServiceEvent({
      type: "party.update",
      targetAccountIds: Array.from(new Set(party.memberAccountIds.concat([invite.fromAccountId, invite.toAccountId]))),
      party: publicParty(party, data),
      invite: publicPartyInvite(invite, data),
    });
    return ok({
      party: publicParty(party, data),
      invite: publicPartyInvite(invite, data),
      message: inviteKind === "application" ? "已同意入队申请。" : "已加入队伍。",
    });
  }

  function declinePartyInvite(token, inviteId) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const invite = data.partyInvites[String(inviteId || "").trim()];
    if (!invite || invite.status !== "pending" || invite.toAccountId !== resolved.account.accountId) {
      return fail("party_invite_missing", "邀请不存在。");
    }
    invite.status = "declined";
    invite.updatedAt = isoNow(now);
    data.partyInvites[invite.inviteId] = invite;
    save(data);
    emitServiceEvent({
      type: "party.invite_declined",
      targetAccountIds: [invite.fromAccountId, invite.toAccountId],
      invite: publicPartyInvite(invite, data),
      party: publicPartyForAccount(data, resolved.account.accountId),
    });
    return ok({
      invite: publicPartyInvite(invite, data),
      party: publicPartyForAccount(data, resolved.account.accountId),
      message: String(invite.kind || "invite") === "application" ? "已拒绝入队申请。" : "已拒绝邀请。",
    });
  }

  function leaveParty(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const party = partyForAccount(data, resolved.account.accountId);
    if (!party) {
      return fail("party_missing", "你还没有队伍。");
    }
    party.memberAccountIds = party.memberAccountIds.filter((accountId) => accountId !== resolved.account.accountId);
    if (party.memberAccountIds.length <= 0) {
      const leavingPartyId = party.partyId;
      delete data.parties[party.partyId];
      for (const invite of Object.values(data.partyInvites)) {
        if (invite && invite.partyId === party.partyId && invite.status === "pending") {
          invite.status = "expired";
          invite.updatedAt = isoNow(now);
          data.partyInvites[invite.inviteId] = invite;
        }
      }
      save(data);
      emitServiceEvent({
        type: "party.update",
        targetAccountIds: [resolved.account.accountId],
        party: null,
        partyId: leavingPartyId,
      });
      return ok({
        party: null,
        incomingInvites: publicIncomingPartyInvites(data, resolved.account.accountId),
        message: "已离开队伍。",
      });
    }
    if (party.leaderAccountId === resolved.account.accountId) {
      party.leaderAccountId = party.memberAccountIds[0];
    }
    party.updatedAt = isoNow(now);
    data.parties[party.partyId] = party;
    save(data);
    emitServiceEvent({
      type: "party.update",
      targetAccountIds: [resolved.account.accountId, ...party.memberAccountIds],
      party: publicParty(party, data),
    });
    return ok({
      party: null,
      incomingInvites: publicIncomingPartyInvites(data, resolved.account.accountId),
      message: "已离开队伍。",
    });
  }

  function listChatMessages(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const channel = normalizeChatChannel(payload.channel || CHAT_CHANNEL_NEARBY);
    if (!channel) {
      return fail("chat_channel_invalid", "聊天频道不存在。");
    }
    const party = partyForAccount(data, resolved.account.accountId);
    const limit = clampInt(payload.limit, 1, CHAT_HISTORY_LIMIT, CHAT_HISTORY_LIMIT);
    let messages = [];
    if (channel === CHAT_CHANNEL_TEAM) {
      if (!party) {
        return ok({channel, messages: [], party: null});
      }
      messages = data.chatMessages.filter((message) => message && message.channel === channel && message.partyId === party.partyId);
    } else {
      messages = data.chatMessages.filter((message) => message && message.channel === CHAT_CHANNEL_NEARBY);
    }
    messages = messages
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      .slice(-limit)
      .map(publicChatMessage);
    return ok({
      channel,
      messages,
      party: party ? publicParty(party, data) : null,
    });
  }

  function sendChatMessage(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const channel = normalizeChatChannel(payload.channel || CHAT_CHANNEL_NEARBY);
    if (!channel) {
      return fail("chat_channel_invalid", "聊天频道不存在。");
    }
    const text = normalizeChatText(payload.text);
    if (!text) {
      return fail("chat_empty", "消息不能为空。");
    }
    const party = partyForAccount(data, resolved.account.accountId);
    if (channel === CHAT_CHANNEL_TEAM && !party) {
      return fail("chat_team_missing", "需要加入队伍才能发送队伍消息。");
    }
    const message = {
      messageId: `chat_${randomId()}`,
      channel,
      partyId: channel === CHAT_CHANNEL_TEAM && party ? party.partyId : "",
      senderAccountId: resolved.account.accountId,
      senderUsername: resolved.account.username,
      senderDisplayName: resolved.account.displayName,
      text,
      createdAt: isoNow(now),
      schemaVersion: 1,
    };
    data.chatMessages.push(message);
    while (data.chatMessages.length > MAX_CHAT_MESSAGES) {
      data.chatMessages.shift();
    }
    save(data);
    emitServiceEvent({
      type: "chat.message",
      targetAccountIds: channel === CHAT_CHANNEL_TEAM && party ? party.memberAccountIds.slice() : null,
      channel,
      message: publicChatMessage(message),
      party: party ? publicParty(party, data) : null,
    });
    return ok({
      message: publicChatMessage(message),
      party: party ? publicParty(party, data) : null,
    });
  }

  function getBattleState(token) {
    let data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    expireBattleTimeoutsAndEmit(data);
    data = load();
    markBattleConnectionForAccount(data, resolved.account.accountId, true, now);
    const payload = battleStatePayload(data, resolved.account.accountId, now);
    recordBattleStateTrace(data, resolved.account.accountId, payload, now);
    return ok(payload);
  }

  function getBattleTrace(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    return ok({
      traces: publicBattleTraceRows(data, resolved.account, payload, now),
      message: "已读取战斗诊断日志。",
    });
  }

  function getBattleRecordSummary(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const targetUsername = normalizeUsername(payload.username || payload.targetUsername || payload.opponentUsername || "");
    if (!targetUsername) {
      return fail("battle_record_target_missing", "请选择要查询的玩家。");
    }
    const target = data.accounts[targetUsername] || null;
    if (!target) {
      return fail("battle_record_target_missing", "玩家不存在。");
    }
    return ok({
      summary: battleRecordSummaryAgainst(data, resolved.account, target),
      message: "已读取对战战绩。",
    });
  }

  function expireBattleTimeoutsAndEmit(data) {
    const timeoutEvents = expireBattleTimeouts(data, now);
    if (timeoutEvents.length > 0) {
      save(data);
      for (const event of timeoutEvents) {
        emitServiceEvent(event);
      }
    }
    scheduleBattleMaintenance(load());
    return timeoutEvents;
  }

  function runBattleMaintenance() {
    const data = load();
    const events = expireBattleTimeoutsAndEmit(data);
    return ok({events});
  }

  function markBattleConnection(token, connected) {
    let data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    expireBattleTimeoutsAndEmit(data);
    data = load();
    const changed = markBattleConnectionForAccount(data, resolved.account.accountId, connected, now);
    if (changed) {
      scheduleBattleMaintenance(data);
    }
    return ok({
      accountId: resolved.account.accountId,
      connected: Boolean(connected),
      room: publicBattleRoom(activeBattleRoomForAccount(data, resolved.account.accountId)),
    });
  }

  function scheduleBattleMaintenance(data = null) {
    if (battleMaintenanceTimer) {
      clearTimeout(battleMaintenanceTimer);
      battleMaintenanceTimer = null;
    }
    const nextDelay = nextBattleMaintenanceDelayMs(data || cachedData, now);
    if (nextDelay === null) {
      return;
    }
    battleMaintenanceTimer = setTimeout(() => {
      battleMaintenanceTimer = null;
      runBattleMaintenance();
    }, Math.max(10, nextDelay + 25));
    if (typeof battleMaintenanceTimer.unref === "function") {
      battleMaintenanceTimer.unref();
    }
  }

  function inviteToBattle(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const targetUsername = normalizeUsername(payload.username || payload.targetUsername || payload.recipientUsername || "");
    const target = data.accounts[targetUsername];
    if (!target) {
      return fail("battle_target_missing", "玩家不存在。");
    }
    if (target.accountId === resolved.account.accountId) {
      return fail("battle_invite_self", "不能向自己发起切磋。");
    }
    const onlineTarget = activeOnlinePlayers(data, now).some((account) => account.accountId === target.accountId);
    if (!onlineTarget) {
      return fail("battle_target_offline", "对方不在线。");
    }
    if (activeBattleRoomForAccount(data, resolved.account.accountId)) {
      return fail("battle_self_busy", "你已经在切磋房间中。");
    }
    if (activeBattleRoomForAccount(data, target.accountId)) {
      return fail("battle_target_busy", "对方已经在切磋房间中。");
    }
    const pendingInvite = Object.values(data.battleInvites).find((invite) => (
      invite &&
      invite.status === BATTLE_INVITE_PENDING &&
      invite.fromAccountId === resolved.account.accountId &&
      invite.toAccountId === target.accountId
    ));
    if (pendingInvite) {
      return ok({
        invite: publicBattleInvite(pendingInvite, data),
        room: null,
        message: "切磋邀请已发送。",
      });
    }
    const invite = {
      inviteId: `battle_invite_${randomId()}`,
      mode: BATTLE_MODE_DUEL,
      fromAccountId: resolved.account.accountId,
      toAccountId: target.accountId,
      status: BATTLE_INVITE_PENDING,
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
      expiresAt: new Date(now() + BATTLE_INVITE_TTL_MS).toISOString(),
      schemaVersion: 1,
    };
    data.battleInvites[invite.inviteId] = invite;
    save(data);
    emitServiceEvent({
      type: "battle.invite",
      targetAccountIds: [resolved.account.accountId, target.accountId],
      invite: publicBattleInvite(invite, data),
    });
    return ok({
      invite: publicBattleInvite(invite, data),
      room: null,
      message: "切磋邀请已发送。",
    });
  }

  function acceptBattleInvite(token, inviteId) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const invite = data.battleInvites[String(inviteId || "").trim()];
    if (!invite || invite.status !== BATTLE_INVITE_PENDING || invite.toAccountId !== resolved.account.accountId) {
      return fail("battle_invite_missing", "切磋邀请不存在。");
    }
    if (battleInviteIsExpired(invite, now)) {
      const event = expireBattleInvite(data, invite, now);
      save(data);
      emitServiceEvent(event);
      return fail("battle_invite_missing", "切磋邀请已过期。");
    }
    if (activeBattleRoomForAccount(data, invite.fromAccountId) || activeBattleRoomForAccount(data, invite.toAccountId)) {
      return fail("battle_room_busy", "双方已有切磋房间。");
    }
    const challenger = accountById(data, invite.fromAccountId);
    const opponent = accountById(data, invite.toAccountId);
    if (!challenger || !opponent) {
      return fail("battle_account_missing", "切磋账号不存在。");
    }
    const entryCheck = battleRoomEntryCheck(data, invite);
    if (!entryCheck.ok) {
      return entryCheck;
    }
    invite.status = BATTLE_INVITE_ACCEPTED;
    invite.updatedAt = isoNow(now);
    data.battleInvites[invite.inviteId] = invite;
    const room = {
      roomId: `battle_room_${randomId()}`,
      mode: BATTLE_MODE_DUEL,
      status: BATTLE_ROOM_READY,
      inviteId: invite.inviteId,
      seed: randomBytes(8).toString("hex"),
      participantAccountIds: [invite.fromAccountId, invite.toAccountId],
      entry: entryCheck.entry,
      participants: [
        battleParticipantSnapshot(data, challenger, "challenger"),
        battleParticipantSnapshot(data, opponent, "opponent"),
      ],
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
      schemaVersion: 1,
    };
    room.battle = createBattleRoomBattleState(room, now);
    battleRoomConnectionStateForMutation(room);
    data.battleRooms[room.roomId] = room;
    recordBattleTrace(data, room, "duel_room_created", {
      participantCount: room.participantAccountIds.length,
      actorCount: Array.isArray(room.battle.actors) ? room.battle.actors.length : 0,
    }, now);
    save(data);
    emitServiceEvent({
      type: "battle.room_ready",
      targetAccountIds: room.participantAccountIds.slice(),
      invite: publicBattleInvite(invite, data),
      room: publicBattleRoom(room),
    });
    return ok({
      invite: publicBattleInvite(invite, data),
      room: publicBattleRoom(room),
      message: "切磋房间已就绪。",
    });
  }

  function startPartyEncounter(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    expireBattleTimeoutsAndEmit(data);
    const party = partyForAccount(data, resolved.account.accountId);
    const partyLeaderAccountId = party ? String(party.leaderAccountId || "") : resolved.account.accountId;
    if (party && partyLeaderAccountId !== resolved.account.accountId) {
      return fail("party_encounter_leader_required", "队伍遇敌由队长触发。");
    }
    const memberAccountIds = (party && Array.isArray(party.memberAccountIds) ? party.memberAccountIds : [resolved.account.accountId])
      .map((accountId) => String(accountId || ""))
      .filter((accountId) => accountById(data, accountId));
    if (memberAccountIds.length < 1) {
      return fail("party_encounter_party_missing", "缺少参战账号。");
    }
    const busyAccountId = memberAccountIds.find((accountId) => activeBattleRoomForAccount(data, accountId));
    if (busyAccountId) {
      const busyAccount = accountById(data, busyAccountId);
      return fail("battle_room_busy", `${busyAccount ? busyAccount.displayName || busyAccount.username : "队员"} 已在战斗房间中。`);
    }
    const participants = memberAccountIds
      .map((accountId) => accountById(data, accountId))
      .filter(Boolean)
      .map((account) => battleParticipantSnapshot(data, account, BATTLE_SIDE_ALLY));
    const encounter = partyEncounterSnapshotFromPayload(payload, participants);
    const room = {
      roomId: `battle_room_${randomId()}`,
      mode: BATTLE_MODE_PARTY_PVE,
      status: BATTLE_ROOM_READY,
      inviteId: "",
      partyId: party ? party.partyId : "",
      leaderAccountId: partyLeaderAccountId,
      seed: randomBytes(8).toString("hex"),
      participantAccountIds: memberAccountIds,
      entry: partyEncounterEntry(data, party || {
        leaderAccountId: resolved.account.accountId,
        memberAccountIds,
      }),
      participants,
      encounter,
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
      schemaVersion: 1,
    };
    room.battle = createBattleRoomBattleState(room, now);
    battleRoomConnectionStateForMutation(room);
    data.battleRooms[room.roomId] = room;
    recordBattleTrace(data, room, "party_pve_room_created", {
      enemyCount: Number(room.encounter && room.encounter.enemyCount || 0),
      participantCount: room.participantAccountIds.length,
      actorCount: Array.isArray(room.battle.actors) ? room.battle.actors.length : 0,
    }, now);
    save(data);
    emitServiceEvent({
      type: "battle.room_ready",
      targetAccountIds: room.participantAccountIds.slice(),
      invite: null,
      room: publicBattleRoom(room),
    });
    return ok({
      room: publicBattleRoom(room),
      message: memberAccountIds.length > 1 ? "队伍遭遇了野生宠物。" : "遭遇了野生宠物。",
    });
  }

  function declineBattleInvite(token, inviteId) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const invite = data.battleInvites[String(inviteId || "").trim()];
    if (!invite || invite.status !== BATTLE_INVITE_PENDING || invite.toAccountId !== resolved.account.accountId) {
      return fail("battle_invite_missing", "切磋邀请不存在。");
    }
    invite.status = BATTLE_INVITE_DECLINED;
    invite.updatedAt = isoNow(now);
    data.battleInvites[invite.inviteId] = invite;
    save(data);
    emitServiceEvent({
      type: "battle.invite_declined",
      targetAccountIds: [invite.fromAccountId, invite.toAccountId],
      invite: publicBattleInvite(invite, data),
      room: null,
    });
    return ok({
      invite: publicBattleInvite(invite, data),
      room: null,
      message: "已拒绝切磋邀请。",
    });
  }

  function cancelBattleInvite(token, inviteId) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const invite = data.battleInvites[String(inviteId || "").trim()];
    if (!invite || invite.status !== BATTLE_INVITE_PENDING || invite.fromAccountId !== resolved.account.accountId) {
      return fail("battle_invite_missing", "切磋邀请不存在。");
    }
    invite.status = BATTLE_INVITE_CANCELLED;
    invite.updatedAt = isoNow(now);
    data.battleInvites[invite.inviteId] = invite;
    save(data);
    emitServiceEvent({
      type: "battle.invite_cancelled",
      targetAccountIds: [invite.fromAccountId, invite.toAccountId],
      invite: publicBattleInvite(invite, data),
      room: null,
    });
    return ok({
      invite: publicBattleInvite(invite, data),
      room: null,
      message: "切磋邀请已取消。",
    });
  }

  function leaveBattleRoom(token, roomId = "") {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    expireBattleTimeoutsAndEmit(data);
    const normalizedRoomId = String(roomId || "").trim();
    const room = normalizedRoomId !== "" ? data.battleRooms[normalizedRoomId] || null : activeBattleRoomForAccount(data, resolved.account.accountId);
    if (!room || room.status === BATTLE_ROOM_CLOSED) {
      return fail("battle_room_missing", "战斗房间不存在。");
    }
    if (!Array.isArray(room.participantAccountIds) || !room.participantAccountIds.includes(resolved.account.accountId)) {
      return fail("battle_room_forbidden", "你不在这个战斗房间中。");
    }
    const result = battleRoomResultForLeave(room, resolved.account.accountId, now);
    closeBattleRoomWithResult(data, room, result, now);
    data.battleRooms[room.roomId] = room;
    save(data);
    emitServiceEvent({
      type: "battle.room_closed",
      targetAccountIds: room.participantAccountIds.slice(),
      roomId: room.roomId,
      reason: result.reason,
      result: publicBattleResult(result),
      room: publicBattleRoom(room),
    });
    const isPartyPve = String(room.mode || BATTLE_MODE_DUEL) === BATTLE_MODE_PARTY_PVE;
    return ok({
      room: publicBattleRoom(room),
      result: publicBattleResult(result),
      message: isPartyPve ? "已逃离战斗。" : "已离开切磋房间。",
    });
  }

  function submitBattleCommand(token, roomId, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    expireBattleTimeoutsAndEmit(data);
    const normalizedRoomId = String(roomId || payload.roomId || "").trim();
    const room = data.battleRooms[normalizedRoomId] || null;
    if (!room || room.status === "closed") {
      return fail("battle_room_missing", "切磋房间不存在。");
    }
    if (!Array.isArray(room.participantAccountIds) || !room.participantAccountIds.includes(resolved.account.accountId)) {
      return fail("battle_room_forbidden", "你不在这个切磋房间中。");
    }
    const battle = battleRoomBattleStateForMutation(room, now);
    if (String(battle.phase || "") !== BATTLE_PHASE_COMMAND) {
      return fail("battle_command_phase_invalid", "当前不能提交回合命令。", {
        room: publicBattleRoom(room),
      });
    }
    const expectedRound = Number(battle.round || 1);
    const commandRound = clampInt(payload.round, 1, Number.MAX_SAFE_INTEGER, expectedRound);
    if (commandRound !== expectedRound) {
      return fail("battle_command_round_mismatch", "回合已变化，请重新同步。", {
        expectedRound,
        room: publicBattleRoom(room),
      });
    }
    const commandResult = normalizeBattleCommandPayload(payload, data, room, battle, resolved.account, now, randomId);
    if (!commandResult.ok) {
      return {
        ...commandResult,
        room: publicBattleRoom(room),
      };
    }
    if (battle.commands && battle.commands[commandResult.command.actorId]) {
      return fail("battle_command_duplicate", "本回合命令已经提交。", {
        room: publicBattleRoom(room),
      });
    }
    battle.commands[commandResult.command.actorId] = commandResult.command;
    battle.requiredActorIds = requiredBattleCommandActorIds(battle);
    battle.submittedActorIds = submittedBattleCommandActorIds(battle);
    battle.submittedAccountIds = submittedBattleCommandAccountIds(battle);
    battle.updatedAt = isoNow(now);
    room.updatedAt = battle.updatedAt;
    const commandSubmittedActorIds = battle.submittedActorIds.slice();
    const commandSubmittedAccountIds = battle.submittedAccountIds.slice();
    const commandSubmittedRoom = publicBattleRoom(room);
    let turn = null;
    const readyToResolve = battle.requiredActorIds.every((actorId) => battle.commands[actorId]);
    recordBattleTrace(data, room, "battle_command_submitted", {
      accountId: resolved.account.accountId,
      actorId: commandResult.command.actorId,
      actionId: commandResult.command.actionId,
      round: expectedRound,
      submittedActorCount: commandSubmittedActorIds.length,
      requiredActorCount: requiredBattleCommandActorIds(battle).length,
      readyToResolve,
    }, now);
    if (readyToResolve) {
      turn = resolveBattleRoomTurn(data, room, battle, now);
    }
    data.battleRooms[room.roomId] = room;
    save(data);
    emitServiceEvent({
      type: "battle.command_submitted",
      targetAccountIds: room.participantAccountIds.slice(),
      roomId: room.roomId,
      round: expectedRound,
      submittedAccountId: resolved.account.accountId,
      submittedUsername: resolved.account.username,
      submittedActorId: commandResult.command.actorId,
      submittedActorKind: commandResult.command.actorKind,
      submittedActorIds: commandSubmittedActorIds,
      submittedAccountIds: commandSubmittedAccountIds,
      requiredAccountIds: requiredBattleCommandAccountIds(room),
      requiredActorIds: requiredBattleCommandActorIds(battle),
      room: commandSubmittedRoom,
    });
    if (turn) {
      emitServiceEvent({
        type: "battle.turn_resolved",
        targetAccountIds: room.participantAccountIds.slice(),
        roomId: room.roomId,
        round: turn.round,
        turn,
        room: publicBattleRoom(room),
      });
      if (room.status === BATTLE_ROOM_CLOSED && room.battle && room.battle.result) {
        emitServiceEvent({
          type: "battle.room_closed",
          targetAccountIds: room.participantAccountIds.slice(),
          roomId: room.roomId,
          reason: String(room.closeReason || room.battle.result.reason || "battle_result"),
          result: publicBattleResult(room.battle.result),
          room: publicBattleRoom(room),
        });
      }
    }
    return ok({
      room: publicBattleRoom(room),
      command: publicBattleCommand(commandResult.command),
      turn,
      message: turn ? "本回合已结算。" : "回合命令已提交。",
    });
  }

  function grantGm(payload = {}) {
    const username = normalizeUsername(payload.username);
    const data = load();
    const account = data.accounts[username];
    if (!account) {
      return fail("account_missing", "账号不存在。");
    }
    account.role = ROLE_GM;
    account.updatedAt = isoNow(now);
    const commandIds = normalizeCommandIds(payload.commandIds || ["*"]);
    data.gmUserGrants[account.accountId] = {
      accountId: account.accountId,
      username,
      enabled: true,
      grantedBy: String(payload.grantedBy || "system"),
      expiresAt: payload.expiresAt || null,
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
      schemaVersion: 1,
    };
    data.gmCommandGrants[account.accountId] = commandIds.map((commandId) => ({
      accountId: account.accountId,
      commandId,
      enabled: true,
      grantedBy: String(payload.grantedBy || "system"),
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
      schemaVersion: 1,
    }));
    recordAuthEvent(data, "gm_grant", username, true, commandIds.join(","), now);
    save(data);
    return ok({
      account: publicAccount(account),
      gmGrant: data.gmUserGrants[account.accountId],
      commandGrants: data.gmCommandGrants[account.accountId],
    });
  }

  function listGmTools(token, commandCatalog = []) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    if (!effectiveRoleIsGm(data, resolved.account, now)) {
      return fail("gm_denied", "当前账号没有GM权限。");
    }
    const allowed = commandCatalog
      .map((entry) => String(entry.id || "").trim())
      .filter((commandId) => commandId && commandAllowed(data, resolved.account.accountId, commandId));
    return ok({
      account: publicAccount(resolved.account),
      effectiveRole: ROLE_GM,
      commandIds: allowed,
    });
  }

  function authorizeGmCommand(payload = {}) {
    const token = payload.token;
    const commandId = normalizeCommandId(payload.commandId);
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      const audit = recordGmAudit(data, "", commandId, false, resolved.message, now, randomId);
      save(data);
      return fail(resolved.code, resolved.message, {"auditId": audit.auditId});
    }
    if (!commandId) {
      const audit = recordGmAudit(data, resolved.account.username, commandId, false, "GM命令为空。", now, randomId);
      save(data);
      return fail("empty_command", "GM命令为空。", {"auditId": audit.auditId});
    }
    if (!effectiveRoleIsGm(data, resolved.account, now)) {
      const audit = recordGmAudit(data, resolved.account.username, commandId, false, "当前账号没有GM权限。", now, randomId);
      save(data);
      return fail("gm_denied", "当前账号没有GM权限。", {"auditId": audit.auditId});
    }
    if (!commandAllowed(data, resolved.account.accountId, commandId)) {
      const audit = recordGmAudit(data, resolved.account.username, commandId, false, "GM命令未授权。", now, randomId);
      save(data);
      return fail("command_denied", "GM命令未授权。", {"auditId": audit.auditId});
    }
    const audit = recordGmAudit(data, resolved.account.username, commandId, true, "", now, randomId);
    save(data);
    return ok({
      commandId,
      auditId: audit.auditId,
      message: "GM命令已授权。",
    });
  }

  function snapshot() {
    return clone(load());
  }

  return {
    register,
    login,
    logout,
    getSession,
    getProfile,
    saveProfile,
    profileAction,
    startHangSession,
    stopHangSession,
    playerRebirth,
    questRecord,
    questClaim,
    shopTransaction,
    equipmentEquip,
    equipmentEnhance,
    equipmentRepairAll,
    equipmentSynthesize,
    searchPlayers,
    sendMail,
    listInbox,
    markMailRead,
    claimMailAttachments,
    listOnlinePlayers,
    updatePlayerPosition,
    movePlayerStep,
    onEvent,
    eventForSession,
    listEventsForSession,
    latestEventSeq,
    markBattleConnection,
    runBattleMaintenance,
    getPartyState,
    inviteToParty,
    applyToParty,
    acceptPartyInvite,
    declinePartyInvite,
    leaveParty,
    listChatMessages,
    sendChatMessage,
    getBattleState,
    getBattleTrace,
    getBattleRecordSummary,
    inviteToBattle,
    acceptBattleInvite,
    startPartyEncounter,
    declineBattleInvite,
    cancelBattleInvite,
    leaveBattleRoom,
    submitBattleCommand,
    grantGm,
    listGmTools,
    authorizeGmCommand,
    snapshot,
  };
}

function createMemoryAuthStore(initialData = null) {
  let data = normalizeData(initialData || {});
  return {
    load() {
      return clone(data);
    },
    save(nextData) {
      data = normalizeData(clone(nextData));
    },
  };
}

function createJsonAuthStore(filePath) {
  return {
    load() {
      if (!fs.existsSync(filePath)) {
        return {};
      }
      try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
      } catch {
        return {};
      }
    },
    save(nextData) {
      fs.mkdirSync(path.dirname(filePath), {"recursive": true});
      fs.writeFileSync(filePath, JSON.stringify(normalizeData(nextData), null, 2));
    },
  };
}

function normalizeData(raw) {
  const data = raw && typeof raw === "object" ? clone(raw) : {};
  const serviceEvents = normalizeServiceEvents(data.serviceEvents);
  const serviceEventSeq = Math.max(
    normalizeEventSeq(data.serviceEventSeq),
    0,
    ...serviceEvents.map((event) => normalizeEventSeq(event.eventSeq))
  );
  return {
    schemaVersion: 1,
    accounts: objectOrEmpty(data.accounts),
    sessions: objectOrEmpty(data.sessions),
    profileBindings: objectOrEmpty(data.profileBindings),
    profiles: objectOrEmpty(data.profiles),
    mailMessages: objectOrEmpty(data.mailMessages),
    parties: objectOrEmpty(data.parties),
    partyInvites: objectOrEmpty(data.partyInvites),
    chatMessages: Array.isArray(data.chatMessages) ? data.chatMessages : [],
    playerPositions: objectOrEmpty(data.playerPositions),
    battleInvites: objectOrEmpty(data.battleInvites),
    battleRooms: objectOrEmpty(data.battleRooms),
    battleRecords: normalizeBattleRecords(data.battleRecords),
    battleTrace: normalizeBattleTrace(data.battleTrace),
    gmUserGrants: objectOrEmpty(data.gmUserGrants),
    gmCommandGrants: objectOrEmpty(data.gmCommandGrants),
    gmCommandAudit: Array.isArray(data.gmCommandAudit) ? data.gmCommandAudit : [],
    authEvents: Array.isArray(data.authEvents) ? data.authEvents : [],
    serviceEventSeq,
    serviceEvents,
  };
}

function persistentDataForStore(data) {
  const persistent = normalizeData(data);
  persistent.playerPositions = {};
  persistent.battleInvites = {};
  persistent.battleRooms = {};
  persistent.serviceEvents = persistent.serviceEvents.filter((event) => {
    const type = String(event && event.type || "");
    return !type.startsWith("battle.");
  });
  return persistent;
}

function createSessionForAccount(data, account, now, randomBytes) {
  const token = randomBytes(32).toString("base64url");
  const session = {
    sessionId: `sess_${crypto.randomUUID()}`,
    accountId: account.accountId,
    tokenHash: hashToken(token),
    createdAt: isoNow(now),
    expiresAt: new Date(now() + SESSION_TTL_MS).toISOString(),
    revokedAt: null,
    schemaVersion: 1,
  };
  data.sessions[session.sessionId] = session;
  return {session, token};
}

function resolveSession(data, token, now) {
  const tokenHash = hashToken(String(token || ""));
  const session = Object.values(data.sessions).find((value) => value && value.tokenHash === tokenHash);
  if (!session) {
    return {"ok": false, "code": "session_missing", "message": "登录会话不存在。"};
  }
  if (session.revokedAt) {
    return {"ok": false, "code": "session_revoked", "message": "登录会话已失效。"};
  }
  if (Date.parse(session.expiresAt) <= now()) {
    return {"ok": false, "code": "session_expired", "message": "登录会话已过期。"};
  }
  const account = Object.values(data.accounts).find((value) => value.accountId === session.accountId);
  if (!account) {
    return {"ok": false, "code": "account_missing", "message": "账号不存在。"};
  }
  return {"ok": true, session, account};
}

function publicAccount(account) {
  return {
    accountId: account.accountId,
    username: account.username,
    displayName: account.displayName,
    role: account.role,
    createdAt: account.createdAt,
  };
}

function publicSession(session, account, data, token = "") {
  const result = {
    sessionId: session.sessionId,
    username: account.username,
    effectiveRole: effectiveRoleIsGm(data, account, () => Date.now()) ? ROLE_GM : ROLE_PLAYER,
    expiresAt: session.expiresAt,
  };
  if (token) {
    result.token = token;
  }
  return result;
}

function publicPlayerSearchResult(account, data) {
  const summary = profileSummaryForAccount(account, data);
  return {
    accountId: account.accountId,
    username: account.username,
    displayName: account.displayName,
    playerId: summary && summary.playerId ? summary.playerId : "",
  };
}

function publicOnlinePlayer(account, data) {
  const summary = profileSummaryForAccount(account, data);
  const party = partyForAccount(data, account.accountId);
  const position = data.playerPositions[account.accountId] || null;
  return {
    accountId: account.accountId,
    username: account.username,
    displayName: account.displayName,
    playerId: summary && summary.playerId ? summary.playerId : "",
    partyId: party ? party.partyId : "",
    partyRole: party && party.leaderAccountId === account.accountId ? "leader" : (party ? "member" : ""),
    position: position ? publicPlayerPosition(position) : null,
  };
}

function publicPlayerPosition(position) {
  return {
    mapId: position.mapId,
    cellX: Number(position.cellX || 0),
    cellY: Number(position.cellY || 0),
    facing: position.facing,
    moving: Boolean(position.moving),
    movementSeq: Number(position.movementSeq || 0),
    authority: String(position.authority || "client_snapshot"),
    updatedAt: position.updatedAt,
    schemaVersion: 1,
  };
}

function publicMail(mail) {
  return {
    mailId: mail.mailId,
    senderUsername: mail.senderUsername,
    senderDisplayName: mail.senderDisplayName,
    recipientUsername: mail.recipientUsername,
    recipientDisplayName: mail.recipientDisplayName,
    title: mail.title,
    body: mail.body,
    items: normalizeMailItems(mail.items || []),
    createdAt: mail.createdAt,
    readAt: mail.readAt || null,
    schemaVersion: 1,
  };
}

function normalizeMailItems(value) {
  const entries = [];
  if (!Array.isArray(value)) {
    return entries;
  }
  for (const rawEntry of value) {
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
      continue;
    }
    const itemId = String(rawEntry.itemId || "").trim();
    const count = Math.max(0, Math.trunc(Number(rawEntry.count || 0)));
    if (!itemId || count <= 0 || !bagItemById(itemId)) {
      continue;
    }
    entries.push({itemId, count});
  }
  return mergeItemAmounts(entries);
}

function publicChatMessage(message) {
  return {
    messageId: message.messageId,
    channel: message.channel,
    partyId: message.partyId || "",
    senderUsername: message.senderUsername,
    senderDisplayName: message.senderDisplayName,
    text: message.text,
    createdAt: message.createdAt,
    schemaVersion: 1,
  };
}

function partyStatePayload(data, accountId) {
  return {
    party: publicPartyForAccount(data, accountId),
    incomingInvites: publicIncomingPartyInvites(data, accountId),
    maxMembers: PARTY_MAX_MEMBERS,
  };
}

function publicPartyForAccount(data, accountId) {
  const party = partyForAccount(data, accountId);
  return party ? publicParty(party, data) : null;
}

function publicParty(party, data) {
  if (!party) {
    return null;
  }
  const members = [];
  for (const accountId of party.memberAccountIds || []) {
    const account = accountById(data, accountId);
    if (!account) {
      continue;
    }
    const participant = battleParticipantSnapshot(data, account, "ally");
    members.push({
      accountId: account.accountId,
      username: account.username,
      displayName: account.displayName,
      role: account.accountId === party.leaderAccountId ? "leader" : "member",
      profileSummary: participant.profileSummary,
      teamSnapshot: participant.teamSnapshot,
    });
  }
  return {
    partyId: party.partyId,
    leaderAccountId: party.leaderAccountId,
    members,
    memberCount: members.length,
    maxMembers: PARTY_MAX_MEMBERS,
    createdAt: party.createdAt,
    updatedAt: party.updatedAt,
    schemaVersion: 1,
  };
}

function publicIncomingPartyInvites(data, accountId) {
  return Object.values(data.partyInvites)
    .filter((invite) => invite && invite.status === "pending" && invite.toAccountId === accountId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((invite) => publicPartyInvite(invite, data));
}

function publicPartyInvite(invite, data) {
  const from = accountById(data, invite.fromAccountId);
  const to = accountById(data, invite.toAccountId);
    return {
      inviteId: invite.inviteId,
      partyId: invite.partyId,
      kind: String(invite.kind || "invite"),
      fromUsername: from ? from.username : "",
    fromDisplayName: from ? from.displayName : "",
    toUsername: to ? to.username : "",
    toDisplayName: to ? to.displayName : "",
    status: invite.status,
    createdAt: invite.createdAt,
    updatedAt: invite.updatedAt,
    schemaVersion: 1,
  };
}

function battleStatePayload(data, accountId, now = Date.now) {
  const activeRoom = activeBattleRoomForAccount(data, accountId);
  const closedRoom = activeRoom ? null : latestClosedBattleRoomForAccount(data, accountId, now);
  return {
    room: publicBattleRoom(activeRoom || closedRoom),
    incomingInvites: publicIncomingBattleInvites(data, accountId),
    outgoingInvites: publicOutgoingBattleInvites(data, accountId),
  };
}

function publicIncomingBattleInvites(data, accountId) {
  return Object.values(data.battleInvites)
    .filter((invite) => invite && invite.status === BATTLE_INVITE_PENDING && invite.toAccountId === accountId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((invite) => publicBattleInvite(invite, data));
}

function publicOutgoingBattleInvites(data, accountId) {
  return Object.values(data.battleInvites)
    .filter((invite) => invite && invite.status === BATTLE_INVITE_PENDING && invite.fromAccountId === accountId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((invite) => publicBattleInvite(invite, data));
}

function publicBattleInvite(invite, data) {
  if (!invite) {
    return {};
  }
  const from = accountById(data, invite.fromAccountId);
  const to = accountById(data, invite.toAccountId);
  return {
    inviteId: invite.inviteId,
    mode: invite.mode || BATTLE_MODE_DUEL,
    fromUsername: from ? from.username : "",
    fromDisplayName: from ? from.displayName : "",
    toUsername: to ? to.username : "",
    toDisplayName: to ? to.displayName : "",
    status: invite.status,
    createdAt: invite.createdAt,
    updatedAt: invite.updatedAt,
    expiresAt: invite.expiresAt || "",
    schemaVersion: 1,
  };
}

function publicBattleRoom(room) {
  if (!room) {
    return null;
  }
  return {
    roomId: room.roomId,
    mode: room.mode || BATTLE_MODE_DUEL,
    status: room.status,
    seed: room.seed,
    inviteId: room.inviteId,
    partyId: String(room.partyId || ""),
    participantAccountIds: Array.isArray(room.participantAccountIds) ? room.participantAccountIds.slice() : [],
    entry: room.entry && typeof room.entry === "object" ? clone(room.entry) : null,
    participants: Array.isArray(room.participants) ? clone(room.participants) : [],
    battle: publicBattleRoomBattle(room.battle || null),
    closeReason: String(room.closeReason || ""),
    closedByAccountId: String(room.closedByAccountId || ""),
    closedAt: room.closedAt || "",
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    schemaVersion: 1,
  };
}

function publicBattleRoomBattle(battle) {
  if (!battle || typeof battle !== "object" || Array.isArray(battle)) {
    return null;
  }
  return {
    round: Number(battle.round || 1),
    phase: String(battle.phase || BATTLE_PHASE_COMMAND),
    turnSeq: Number(battle.turnSeq || 0),
    requiredAccountIds: Array.isArray(battle.requiredAccountIds) ? battle.requiredAccountIds.slice() : [],
    submittedAccountIds: Array.isArray(battle.submittedAccountIds) ? battle.submittedAccountIds.slice() : [],
    requiredActorIds: Array.isArray(battle.requiredActorIds) ? battle.requiredActorIds.slice() : [],
    submittedActorIds: Array.isArray(battle.submittedActorIds) ? battle.submittedActorIds.slice() : [],
    actors: Array.isArray(battle.actors) ? battle.actors.map(publicBattleActor) : [],
    lastEventList: battle.lastEventList && typeof battle.lastEventList === "object" ? clone(battle.lastEventList) : null,
    result: battle.result && typeof battle.result === "object" ? publicBattleResult(battle.result) : null,
    profileWriteback: publicBattleProfileWriteback(battle.profileWriteback || null),
    commandDeadlineAt: battle.commandDeadlineAt || "",
    updatedAt: battle.updatedAt || "",
    schemaVersion: 1,
  };
}

function publicBattleProfileWriteback(writeback) {
  if (!writeback || typeof writeback !== "object" || Array.isArray(writeback)) {
    return null;
  }
  return {
    kind: String(writeback.kind || "battle_profile_writeback"),
    roomId: String(writeback.roomId || ""),
    reason: String(writeback.reason || ""),
    updatedAt: String(writeback.updatedAt || ""),
    profiles: Array.isArray(writeback.profiles) ? writeback.profiles.map(publicBattleProfileWritebackEntry) : [],
    skippedProfiles: Array.isArray(writeback.skippedProfiles) ? clone(writeback.skippedProfiles) : [],
    schemaVersion: 1,
  };
}

function publicBattleProfileWritebackEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return {};
  }
  return {
    accountId: String(entry.accountId || ""),
    profileRevision: Number(entry.profileRevision || 0),
    playerHp: entry.playerHp && typeof entry.playerHp === "object" ? clone(entry.playerHp) : null,
    petHps: Array.isArray(entry.petHps) ? clone(entry.petHps) : [],
    battleItemBag: entry.battleItemBag && typeof entry.battleItemBag === "object" ? clone(entry.battleItemBag) : null,
    captureToolBag: entry.captureToolBag && typeof entry.captureToolBag === "object" ? clone(entry.captureToolBag) : null,
    capturedPets: Array.isArray(entry.capturedPets) ? clone(entry.capturedPets) : [],
    lostCapturedPets: Array.isArray(entry.lostCapturedPets) ? clone(entry.lostCapturedPets) : [],
    exp: entry.exp && typeof entry.exp === "object" && !Array.isArray(entry.exp) ? clone(entry.exp) : null,
    rewards: entry.rewards && typeof entry.rewards === "object" && !Array.isArray(entry.rewards) ? clone(entry.rewards) : null,
    quests: entry.quests && typeof entry.quests === "object" && !Array.isArray(entry.quests) ? clone(entry.quests) : null,
    special: entry.special && typeof entry.special === "object" && !Array.isArray(entry.special) ? clone(entry.special) : null,
    hang: entry.hang && typeof entry.hang === "object" && !Array.isArray(entry.hang) ? clone(entry.hang) : null,
    schemaVersion: 1,
  };
}

function publicBattleResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return null;
  }
  return {
    kind: "battle_result",
    reason: String(result.reason || ""),
    winnerAccountId: String(result.winnerAccountId || ""),
    loserAccountIds: Array.isArray(result.loserAccountIds) ? result.loserAccountIds.map((value) => String(value)) : [],
    closedByAccountId: String(result.closedByAccountId || ""),
    battleRecordId: String(result.battleRecordId || ""),
    endedAt: String(result.endedAt || ""),
    battleReturns: Array.isArray(result.battleReturns) ? result.battleReturns.map(publicBattleReturn) : [],
    schemaVersion: 1,
  };
}

function publicBattleReturn(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return {};
  }
  return {
    kind: "record_point_return",
    accountId: String(entry.accountId || ""),
    reason: String(entry.reason || ""),
    recordPoint: entry.recordPoint && typeof entry.recordPoint === "object" ? clone(entry.recordPoint) : null,
    position: entry.position && typeof entry.position === "object" ? publicPlayerPosition(entry.position) : null,
    updatedAt: String(entry.updatedAt || ""),
    schemaVersion: 1,
  };
}

function publicBattleActor(actor) {
  return {
    actorId: String(actor.actorId || ""),
    accountId: String(actor.accountId || ""),
    username: String(actor.username || ""),
    displayName: String(actor.displayName || actor.username || ""),
    side: String(actor.side || ""),
    kind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
    slotId: String(actor.slotId || ""),
    slotNumber: Number(actor.slotNumber || 0),
    level: Number(actor.level || 1),
    petId: String(actor.petId || ""),
    formId: String(actor.formId || ""),
    speciesId: String(actor.speciesId || ""),
    lineId: String(actor.lineId || ""),
    petState: String(actor.petState || ""),
    activeInBattle: Boolean(actor.activeInBattle),
    ridePetInstanceId: String(actor.ridePetInstanceId || ""),
    ridePetName: String(actor.ridePetName || ""),
    ridePetFormId: String(actor.ridePetFormId || ""),
    ridePetLevel: Number(actor.ridePetLevel || 0),
    ridePetHp: Number(actor.ridePetHp || 0),
    ridePetMaxHp: Number(actor.ridePetMaxHp || 0),
    ridePetBattleState: String(actor.ridePetBattleState || ""),
    hp: Number(actor.hp || 0),
    maxHp: Number(actor.maxHp || BATTLE_ACTOR_MAX_HP),
    speed: Number(actor.speed || 0),
    attack: Number(actor.attack || 0),
    defense: Number(actor.defense || 0),
    guarding: Boolean(actor.guarding),
    defeated: Boolean(actor.defeated),
    catchable: Boolean(actor.catchable),
    captureDifficulty: Math.max(0, Math.trunc(Number(actor.captureDifficulty || 0))),
    captured: Boolean(actor.captured),
    capturedByAccountId: String(actor.capturedByAccountId || ""),
    activeSkillIds: Array.isArray(actor.activeSkillIds) ? actor.activeSkillIds.map((value) => String(value)) : [],
    petSkillSlots: Array.isArray(actor.petSkillSlots) ? actor.petSkillSlots.map((value) => String(value)) : [],
    passiveSkillIds: Array.isArray(actor.passiveSkillIds) ? actor.passiveSkillIds.map((value) => String(value)) : [],
    spiritIds: Array.isArray(actor.spiritIds) ? actor.spiritIds.map((value) => String(value)).filter(Boolean) : [],
    statuses: actor.statuses && typeof actor.statuses === "object" && !Array.isArray(actor.statuses) ? clone(actor.statuses) : {},
    statusResist: actor.statusResist && typeof actor.statusResist === "object" && !Array.isArray(actor.statusResist) ? clone(actor.statusResist) : {},
    statusImmune: actor.statusImmune && typeof actor.statusImmune === "object" && !Array.isArray(actor.statusImmune) ? clone(actor.statusImmune) : {},
    schemaVersion: 1,
  };
}

function publicBattleCommand(command) {
  if (!command || typeof command !== "object") {
    return {};
  }
  return {
    commandId: String(command.commandId || ""),
    roomId: String(command.roomId || ""),
    round: Number(command.round || 1),
    accountId: String(command.accountId || ""),
    username: String(command.username || ""),
    actorId: String(command.actorId || ""),
    actorKind: String(command.actorKind || BATTLE_ACTOR_KIND_PLAYER),
    actionId: String(command.actionId || ""),
    actionKind: String(command.actionKind || ""),
    skillId: String(command.skillId || ""),
    spiritId: String(command.spiritId || ""),
    petId: String(command.petId || ""),
    itemId: String(command.itemId || ""),
    captureToolId: String(command.captureToolId || ""),
    targetActorId: String(command.targetActorId || ""),
    targetAccountId: String(command.targetAccountId || ""),
    targetUsername: String(command.targetUsername || ""),
    targetRule: String(command.targetRule || ""),
    targetRollIndex: Math.trunc(Number(command.targetRollIndex || 0)),
    targetCandidateCount: Math.trunc(Number(command.targetCandidateCount || 0)),
    submittedAt: String(command.submittedAt || ""),
    schemaVersion: 1,
  };
}

function battleParticipantSnapshot(data, account, side) {
  const summary = profileSummaryForAccount(account, data);
  const profileDoc = summary && summary.playerId ? data.profiles[summary.playerId] || null : null;
  const profile = profileDoc && profileDoc.profile && typeof profileDoc.profile === "object" ? profileDoc.profile : {};
  const playerSnapshot = battlePlayerSnapshotFromProfile(profile, account);
  const battlePets = battlePetSnapshotsFromProfile(profile).slice(0, BATTLE_PET_MAX_PER_PARTICIPANT);
  const trainingPartners = trainingPartnerSnapshotsFromProfile(profile).slice(0, PARTY_MAX_MEMBERS - 1);
  const position = data.playerPositions[account.accountId] || null;
  return {
    accountId: account.accountId,
    username: account.username,
    displayName: account.displayName,
    side,
    profileSummary: summary || null,
    position: position ? publicPlayerPosition(position) : null,
    teamSnapshot: {
      playerLevel: Number(playerSnapshot.level || 1),
      player: playerSnapshot,
      battlePetCount: battlePets.length,
      battlePets,
      trainingPartnerCount: trainingPartners.length,
      trainingPartners,
      battleItemBag: battleItemBagFromProfile(profile),
      captureToolBag: captureToolBagFromProfile(profile),
      schemaVersion: 1,
    },
    schemaVersion: 1,
  };
}

function battleItemBagFromProfile(profile) {
  const slots = profileBackpackSlots(profile);
  const bag = {};
  for (const itemId of BATTLE_ITEM_IDS) {
    bag[itemId] = backpackItemCount(slots, itemId);
  }
  return bag;
}

function captureToolBagFromProfile(profile) {
  const slots = profileBackpackSlots(profile);
  const fallbackBag = profile && profile.captureTools && typeof profile.captureTools === "object" && !Array.isArray(profile.captureTools)
    ? profile.captureTools
    : {};
  const bag = {};
  for (const toolId of battleCaptureToolIds()) {
    if (toolId === BATTLE_CAPTURE_TOOL_EMPTY_HAND || !battleCaptureToolIsConsumable(toolId)) {
      continue;
    }
    const slotCount = backpackItemCount(slots, toolId);
    const fallbackCount = Math.max(0, Math.trunc(Number(fallbackBag[toolId] || 0)));
    bag[toolId] = slotCount > 0 ? slotCount : fallbackCount;
  }
  return bag;
}

function profileBackpackSlots(profile) {
  return profile && Array.isArray(profile.backpackSlots) ? profile.backpackSlots : [];
}

function backpackItemCount(slots, itemId) {
  if (!Array.isArray(slots)) {
    return 0;
  }
  return slots.reduce((total, slot) => {
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
      return total;
    }
    if (String(slot.itemId || "") !== itemId) {
      return total;
    }
    const count = Math.max(0, Math.trunc(Number(slot.count || 0)));
    return total + count;
  }, 0);
}

let equipmentDocumentCache = null;
let equipmentSynthesisDocumentCache = null;
let battleActionDocumentCache = null;
let bagItemDocumentCache = null;
let shopDocumentCache = null;
let rewardEconomyDocumentCache = null;
let battleRewardDocumentCache = null;
let captureToolDocumentCache = null;
let captureFormulaDocumentCache = null;
let questDocumentCache = null;
let petTemplateDocumentCache = null;
let playerGrowthDocumentCache = null;
let rebirthTrialDocumentCache = null;
let petSkillTrainingDocumentCache = null;

function equipmentDocument() {
  if (!equipmentDocumentCache) {
    equipmentDocumentCache = loadDataDocument("equipment_items.json");
  }
  return equipmentDocumentCache;
}

function equipmentSynthesisDocument() {
  if (!equipmentSynthesisDocumentCache) {
    equipmentSynthesisDocumentCache = loadDataDocument("equipment_synthesis_recipes.json");
  }
  return equipmentSynthesisDocumentCache;
}

function battleActionDocument() {
  if (!battleActionDocumentCache) {
    battleActionDocumentCache = loadDataDocument("battle_actions.json");
  }
  return battleActionDocumentCache;
}

function bagItemDocument() {
  if (!bagItemDocumentCache) {
    bagItemDocumentCache = loadDataDocument("bag_items.json");
  }
  return bagItemDocumentCache;
}

function shopDocument() {
  if (!shopDocumentCache) {
    shopDocumentCache = loadDataDocument("item_shops.json");
  }
  return shopDocumentCache;
}

function rewardEconomyDocument() {
  if (!rewardEconomyDocumentCache) {
    rewardEconomyDocumentCache = loadDataDocument("balance/reward_economy.json");
  }
  return rewardEconomyDocumentCache;
}

function battleRewardDocument() {
  if (!battleRewardDocumentCache) {
    battleRewardDocumentCache = loadDataDocument("battle_rewards.json");
  }
  return battleRewardDocumentCache;
}

function captureToolDocument() {
  if (!captureToolDocumentCache) {
    captureToolDocumentCache = loadDataDocument("capture_tools.json");
  }
  return captureToolDocumentCache;
}

function captureFormulaDocument() {
  if (!captureFormulaDocumentCache) {
    captureFormulaDocumentCache = loadDataDocument("balance/capture_formula.json");
  }
  return captureFormulaDocumentCache;
}

function questDocument() {
  if (!questDocumentCache) {
    questDocumentCache = loadDataDocument("quests.json");
  }
  return questDocumentCache;
}

function petTemplateDocument() {
  if (!petTemplateDocumentCache) {
    petTemplateDocumentCache = loadDataDocument("pet_templates.json");
  }
  return petTemplateDocumentCache;
}

function playerGrowthDocument() {
  if (!playerGrowthDocumentCache) {
    playerGrowthDocumentCache = loadDataDocument("balance/player_growth.json");
  }
  return playerGrowthDocumentCache;
}

function rebirthTrialDocument() {
  if (!rebirthTrialDocumentCache) {
    rebirthTrialDocumentCache = loadDataDocument("rebirth_trials.json");
  }
  return rebirthTrialDocumentCache;
}

function petSkillTrainingDocument() {
  if (!petSkillTrainingDocumentCache) {
    petSkillTrainingDocumentCache = loadDataDocument("pet_skill_training.json");
  }
  return petSkillTrainingDocumentCache;
}

function executePlayerRebirthToProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return {ok: false, code: "profile_missing", message: "请先创建角色档案。"};
  }
  if (!profile.player || typeof profile.player !== "object" || Array.isArray(profile.player)) {
    profile.player = {};
  }
  if (!Array.isArray(profile.petInstances)) {
    profile.petInstances = Array.isArray(profile.pets) ? clone(profile.pets) : [];
  }
  const preview = playerRebirthPreview(profile);
  if (!preview.ok) {
    const reasons = stringArray(preview.reasons);
    return {
      ok: false,
      code: "player_rebirth_not_ready",
      message: reasons.length > 0 ? `暂时不能转生：${reasons.join(" ")}` : "暂时不能转生。",
      rebirth: preview,
    };
  }
  const targetCount = clampInt(preview.targetCount, 1, PLAYER_REBIRTH_MAX_COUNT, Math.max(1, Number(profile[PLAYER_REBIRTH_COUNT_KEY] || 0) + 1));
  const consumeResult = consumePlayerRebirthTrialRequirements(profile, targetCount);
  if (!consumeResult.ok) {
    return consumeResult;
  }
  const player = objectOrEmpty(profile.player);
  const beforeStats = playerRebirthBaseStatsFromPlayer(player);
  const afterStats = playerRebirthPreviewAfterStats(beforeStats, Number(preview.statCarryScore || 1));
  const fromCount = Math.max(0, Math.trunc(Number(profile[PLAYER_REBIRTH_COUNT_KEY] || 0)));
  const history = Array.isArray(profile[PLAYER_REBIRTH_HISTORY_KEY])
    ? clone(profile[PLAYER_REBIRTH_HISTORY_KEY].filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry)))
    : [];
  history.push({
    fromRebirth: fromCount,
    toRebirth: targetCount,
    level: Math.max(1, Math.trunc(Number(player.level || 1))),
    formulaVersion: PLAYER_REBIRTH_FORMULA_VERSION,
    questId: playerRebirthQuestIdForTarget(targetCount),
    baseStatsBefore: beforeStats,
    baseStatsAfter: afterStats,
    statCarryScore: Math.max(1, Math.trunc(Number(preview.statCarryScore || 1))),
  });
  player.level = 1;
  player.exp = 0;
  player.nextExp = battleExpToNextLevel(1);
  player.baseStats = clone(afterStats);
  player.statPoints = 0;
  player.hp = Math.max(1, Math.trunc(Number(afterStats.maxHp || PLAYER_REBIRTH_DEFAULT_BASE_STATS.maxHp)));
  player.maxHp = player.hp;
  profile.player = player;
  profile[PLAYER_REBIRTH_COUNT_KEY] = targetCount;
  profile[PLAYER_REBIRTH_HISTORY_KEY] = history;

  const rewardItems = playerRebirthRewardItemsForTarget(targetCount);
  const rewardResult = addRewardItemsToBackpack(profileBackpackSlots(profile), rewardItems);
  profile.backpackSlots = rewardResult.slots;
  profile.captureTools = captureToolBagFromProfile(profile);
  const starterResult = appendPlayerRebirthStarterPetToProfile(profile, targetCount);
  const rewardTexts = [];
  if (starterResult.starterPet && Object.keys(starterResult.starterPet).length > 0) {
    rewardTexts.push(`${starterResult.starterPet.name || "幼兽"} Lv${starterResult.starterPet.level || 1}`);
  }
  const itemText = itemAmountText(rewardResult.addedItems);
  if (itemText) {
    rewardTexts.push(itemText);
  }
  const lostText = itemAmountText(rewardResult.lostItems);
  if (lostText) {
    rewardTexts.push(`背包已满，${lostText} 未进入背包`);
  }
  const consumedPetText = consumeResult.consumedPets
    .map((pet) => `${pet.name || pet.formId || "转生兽"} Lv${Math.max(1, Math.trunc(Number(pet.level || 1)))}`)
    .join("、");
  const messageParts = [`完成${playerRebirthTargetStageLabel(targetCount)}。等级回到 Lv1，基础能力已重算。`];
  if (consumedPetText) {
    messageParts.push(`交出${consumedPetText}。`);
  }
  if (rewardTexts.length > 0) {
    messageParts.push(`获得${rewardTexts.join("、")}。`);
  }
  return {
    ok: true,
    message: messageParts.join(" "),
    rebirth: {
      fromCount,
      targetCount,
      beforeStats,
      afterStats,
      consumedRingIds: consumeResult.consumedRingIds,
      consumedPets: consumeResult.consumedPets,
      rewardItems: rewardResult.addedItems,
      lostRewardItems: rewardResult.lostItems,
      starterPet: starterResult.starterPet || {},
      schemaVersion: 1,
    },
  };
}

function playerRebirthPreview(profile) {
  const requirement = playerRebirthRequirementState(profile);
  const player = objectOrEmpty(profile && profile.player);
  const beforeStats = playerRebirthBaseStatsFromPlayer(player);
  const targetCount = clampInt(requirement.targetCount, 1, PLAYER_REBIRTH_MAX_COUNT, 1);
  const carryScore = playerRebirthStatCarryScore(
    Math.max(1, Math.trunc(Number(player.level || 1))),
    beforeStats,
    targetCount
  );
  return {
    ok: Boolean(requirement.ok),
    formulaVersion: PLAYER_REBIRTH_FORMULA_VERSION,
    fromCount: Math.max(0, Math.trunc(Number(requirement.fromCount || 0))),
    targetCount,
    currentLevel: Math.max(1, Math.trunc(Number(player.level || 1))),
    afterLevel: 1,
    questId: String(requirement.questId || playerRebirthQuestIdForTarget(targetCount)),
    questLabel: playerRebirthQuestLabelForTarget(targetCount),
    reasons: stringArray(requirement.reasons),
    trial: requirement.trial || {},
    rewardItems: playerRebirthRewardItemsForTarget(targetCount),
    starterPetPlan: playerRebirthStarterPetPlanForTarget(targetCount),
    beforeStats,
    afterStats: playerRebirthPreviewAfterStats(beforeStats, carryScore),
    statCarryScore: carryScore,
    schemaVersion: 1,
  };
}

function playerRebirthRequirementState(profile) {
  const player = objectOrEmpty(profile && profile.player);
  const count = clampInt(profile && profile[PLAYER_REBIRTH_COUNT_KEY], 0, PLAYER_REBIRTH_MAX_COUNT, 0);
  const targetCount = clampInt(count + 1, 1, PLAYER_REBIRTH_MAX_COUNT, 1);
  const level = Math.max(1, Math.trunc(Number(player.level || 1)));
  const requiredLevel = playerRebirthRequiredLevelForTarget(targetCount);
  const questId = playerRebirthQuestIdForTarget(targetCount);
  const completions = uniqueStringArray(profile && profile[PLAYER_REBIRTH_QUEST_COMPLETIONS_KEY]);
  const limitOk = count < PLAYER_REBIRTH_MAX_COUNT;
  const levelOk = level >= requiredLevel;
  const questOk = completions.includes(questId);
  const baseReasons = [];
  if (!limitOk) {
    baseReasons.push(`已达到${PLAYER_REBIRTH_MAX_COUNT}转上限。`);
  }
  if (!levelOk) {
    baseReasons.push(`人物需要 Lv${requiredLevel}。`);
  }
  if (limitOk && !questOk) {
    baseReasons.push(`${playerRebirthQuestLabelForTarget(targetCount)}未完成。`);
  }
  const trial = playerRebirthTrialRequirementState(profile, targetCount, limitOk);
  const reasons = baseReasons.slice();
  for (const reason of stringArray(trial.reasons)) {
    if (!reasons.includes(reason)) {
      reasons.push(reason);
    }
  }
  return {
    ok: limitOk && levelOk && questOk && Boolean(trial.ok),
    fromCount: count,
    targetCount,
    level,
    requiredLevel,
    levelOk,
    questOk,
    limitOk,
    questId,
    questLabel: playerRebirthQuestLabelForTarget(targetCount),
    trialOk: Boolean(trial.ok),
    trial,
    reasons,
    schemaVersion: 1,
  };
}

function playerRebirthTrialRequirementState(profile, targetCount, limitOk = true) {
  const ringIds = playerRebirthRingItemIds();
  const backpackSlots = profileBackpackSlots(profile);
  const missingRingLabels = ringIds
    .filter((itemId) => backpackItemCount(backpackSlots, itemId) <= 0)
    .map((itemId) => bagItemLabel(itemId));
  const requiredBeastFormIds = playerRebirthRequiredBeastFormIds(targetCount);
  const ownedFormCounts = {};
  for (const pet of Array.isArray(profile && profile.petInstances) ? profile.petInstances : []) {
    const formId = String(pet && (pet.formId || pet.templateId) || "").trim();
    if (!formId) {
      continue;
    }
    ownedFormCounts[formId] = Math.max(0, Math.trunc(Number(ownedFormCounts[formId] || 0))) + 1;
  }
  const missingBeastLabels = requiredBeastFormIds
    .filter((formId) => Math.max(0, Math.trunc(Number(ownedFormCounts[formId] || 0))) <= 0)
    .map((formId) => petFormNameFor(formId));
  const bossProofCount = Math.max(0, Math.trunc(Number(objectOrEmpty(profile && profile[PLAYER_REBIRTH_TRIAL_PROOFS_KEY])[PLAYER_REBIRTH_FINAL_BOSS_PROOF_ID] || 0)));
  const reasons = [];
  if (!limitOk) {
    return {
      ok: false,
      targetCount,
      ringOk: false,
      beastOk: false,
      bossOk: false,
      requiredRingIds: ringIds,
      requiredBeastFormIds,
      bossProofCount,
      reasons: [],
      schemaVersion: 1,
    };
  }
  if (missingRingLabels.length > 0) {
    reasons.push(`缺少元素戒指：${missingRingLabels.join("、")}。`);
  }
  if (missingBeastLabels.length > 0) {
    reasons.push(`缺少转生兽：${missingBeastLabels.join("、")}。`);
  }
  if (bossProofCount <= 0) {
    reasons.push("未击败玄影洞窟顶层守护。");
  }
  return {
    ok: reasons.length === 0,
    targetCount,
    ringOk: missingRingLabels.length === 0,
    beastOk: missingBeastLabels.length === 0,
    bossOk: bossProofCount > 0,
    requiredRingIds: ringIds,
    requiredBeastFormIds,
    missingRingLabels,
    missingBeastLabels,
    bossProofCount,
    reasons,
    schemaVersion: 1,
  };
}

function playerRebirthRequiredLevelForTarget(targetCount) {
  const rebirth = objectOrEmpty(playerGrowthDocument().rebirth);
  const levels = Array.isArray(rebirth.requiredLevelByTarget) ? rebirth.requiredLevelByTarget : [];
  const index = clampInt(targetCount, 1, PLAYER_REBIRTH_MAX_COUNT, 1) - 1;
  return Math.max(1, Math.trunc(Number(levels[index] || PLAYER_REBIRTH_MIN_LEVEL)));
}

function playerRebirthQuestIdForTarget(targetCount) {
  return `rebirth_${clampInt(targetCount, 1, PLAYER_REBIRTH_MAX_COUNT, 1)}`;
}

function playerRebirthTargetStageLabel(targetCount) {
  const labels = ["一转", "二转", "三转", "四转", "五转", "六转"];
  return labels[clampInt(targetCount, 1, PLAYER_REBIRTH_MAX_COUNT, 1) - 1] || `${targetCount}转`;
}

function playerRebirthQuestLabelForTarget(targetCount) {
  return `${playerRebirthTargetStageLabel(targetCount)}任务链`;
}

function playerRebirthBaseStatsFromPlayer(player) {
  const source = objectOrEmpty(player && player.baseStats);
  const result = {};
  for (const key of PLAYER_REBIRTH_STAT_KEYS) {
    result[key] = Math.max(1, Math.trunc(Number(source[key] || PLAYER_REBIRTH_DEFAULT_BASE_STATS[key] || 1)));
  }
  return result;
}

function playerRebirthStatCarryScore(level, beforeStats, targetCount) {
  const cappedLevel = clampInt(level, PLAYER_REBIRTH_MIN_LEVEL, PLAYER_REBIRTH_PREVIEW_LEVEL_CAP, PLAYER_REBIRTH_MIN_LEVEL);
  const levelScore = Math.max(0, cappedLevel - PLAYER_REBIRTH_MIN_LEVEL);
  const oldScore = (
    Math.trunc(Number(beforeStats.maxHp || 1)) / 4.0
    + Math.trunc(Number(beforeStats.attack || 1))
    + Math.trunc(Number(beforeStats.defense || 1))
    + Math.trunc(Number(beforeStats.quick || 1))
  );
  const stageScore = clampInt(targetCount, 1, PLAYER_REBIRTH_MAX_COUNT, 1) * 8.0;
  return Math.max(1, Math.round(levelScore * 0.35 + oldScore / 12.0 + stageScore));
}

function playerRebirthPreviewAfterStats(beforeStats, carryScore) {
  const after = clone(PLAYER_REBIRTH_DEFAULT_BASE_STATS);
  const weightedTotal = (
    Math.trunc(Number(beforeStats.maxHp || 1)) / 4.0
    + Math.trunc(Number(beforeStats.attack || 1))
    + Math.trunc(Number(beforeStats.defense || 1))
    + Math.trunc(Number(beforeStats.quick || 1))
  );
  if (weightedTotal <= 0) {
    return after;
  }
  const score = Math.max(1, Math.trunc(Number(carryScore || 1)));
  const hpShare = (Math.trunc(Number(beforeStats.maxHp || 1)) / 4.0) / weightedTotal;
  after.maxHp = Math.max(1, Math.trunc(Number(after.maxHp || 120)) + Math.round(score * hpShare * 4.0));
  for (const key of ["attack", "defense", "quick"]) {
    const share = Math.trunc(Number(beforeStats[key] || 1)) / weightedTotal;
    after[key] = Math.max(1, Math.trunc(Number(after[key] || 1)) + Math.round(score * share));
  }
  return after;
}

function consumePlayerRebirthTrialRequirements(profile, targetCount) {
  const requirement = playerRebirthTrialRequirementState(profile, targetCount, true);
  if (!requirement.ok) {
    const reasons = stringArray(requirement.reasons);
    return {
      ok: false,
      code: "player_rebirth_trial_not_ready",
      message: reasons.length > 0 ? `转生试炼未完成：${reasons.join(" ")}` : "转生试炼未完成。",
      rebirth: {trial: requirement, schemaVersion: 1},
    };
  }
  const consumedRingIds = [];
  let slots = normalizeBackpackSlots(profileBackpackSlots(profile));
  for (const ringId of playerRebirthRingItemIds()) {
    slots = consumeBackpackItem(slots, ringId, 1);
    consumedRingIds.push(ringId);
  }
  profile.backpackSlots = slots;
  profile.captureTools = captureToolBagFromProfile(profile);
  const petResult = consumePlayerRebirthBeasts(profile, targetCount);
  const proofs = objectOrEmpty(profile[PLAYER_REBIRTH_TRIAL_PROOFS_KEY]);
  const nextProofCount = Math.max(0, Math.trunc(Number(proofs[PLAYER_REBIRTH_FINAL_BOSS_PROOF_ID] || 0)) - 1);
  if (nextProofCount > 0) {
    proofs[PLAYER_REBIRTH_FINAL_BOSS_PROOF_ID] = nextProofCount;
  } else {
    delete proofs[PLAYER_REBIRTH_FINAL_BOSS_PROOF_ID];
  }
  profile[PLAYER_REBIRTH_TRIAL_PROOFS_KEY] = proofs;
  return {
    ok: true,
    consumedRingIds,
    consumedPets: petResult.consumedPets,
  };
}

function consumePlayerRebirthBeasts(profile, targetCount) {
  const requiredCounts = {};
  for (const formId of playerRebirthRequiredBeastFormIds(targetCount)) {
    requiredCounts[formId] = Math.max(0, Math.trunc(Number(requiredCounts[formId] || 0))) + 1;
  }
  const nextInstances = [];
  const consumedPets = [];
  for (const pet of Array.isArray(profile.petInstances) ? profile.petInstances : []) {
    const formId = String(pet && (pet.formId || pet.templateId) || "").trim();
    const remaining = Math.max(0, Math.trunc(Number(requiredCounts[formId] || 0)));
    if (formId && remaining > 0) {
      requiredCounts[formId] = remaining - 1;
      consumedPets.push({
        instanceId: String(pet.instanceId || pet.petId || ""),
        name: String(pet.name || petFormNameFor(formId)),
        formId,
        level: Math.max(1, Math.trunc(Number(pet.level || 1))),
        schemaVersion: 1,
      });
      continue;
    }
    nextInstances.push(pet);
  }
  profile.petInstances = nextInstances;
  ensureActivePetAfterInstanceRemoval(profile);
  return {consumedPets};
}

function playerRebirthRewardItemsForTarget(targetCount) {
  const itemId = String(PLAYER_REBIRTH_REWARD_ITEMS_BY_TARGET[clampInt(targetCount, 1, PLAYER_REBIRTH_MAX_COUNT, 1)] || "");
  return itemId ? [{itemId, count: 1}] : [];
}

function playerRebirthStarterPetPlanForTarget(targetCount) {
  return clone(PLAYER_REBIRTH_STARTER_PET_BY_TARGET[clampInt(targetCount, 1, PLAYER_REBIRTH_MAX_COUNT, 1)] || {});
}

function appendPlayerRebirthStarterPetToProfile(profile, targetCount) {
  const plan = playerRebirthStarterPetPlanForTarget(targetCount);
  const formId = String(plan.formId || "").trim();
  if (!formId) {
    return {starterPet: {}};
  }
  if (!Array.isArray(profile.petInstances)) {
    profile.petInstances = [];
  }
  const serial = nextProfilePetInstanceSerial(profile, profile.petInstances);
  const instanceId = `pet_rebirth_${clampInt(targetCount, 1, PLAYER_REBIRTH_MAX_COUNT, 1)}_${serial}`;
  let state = BATTLE_PET_STATE_STORAGE;
  if (profilePartyVisiblePetCount(profile) < BATTLE_PET_MAX_PER_PARTICIPANT) {
    state = BATTLE_PET_STATE_BATTLE;
    for (const pet of profile.petInstances) {
      if (pet && typeof pet === "object" && !Array.isArray(pet) && String(pet.state || BATTLE_PET_STATE_STANDBY) === BATTLE_PET_STATE_BATTLE) {
        pet.state = BATTLE_PET_STATE_STANDBY;
      }
    }
  }
  const starterPet = createPlayerRebirthStarterPet(instanceId, String(plan.name || ""), formId, state, serial);
  if (Object.keys(starterPet).length <= 0) {
    return {starterPet: {}};
  }
  profile.petInstances.push(starterPet);
  profile.nextPetInstanceSerial = serial + 1;
  if (state === BATTLE_PET_STATE_BATTLE) {
    profile.activePetInstanceId = instanceId;
  }
  recordProfilePetCodexForm(profile, formId, false);
  return {starterPet};
}

function createPlayerRebirthStarterPet(instanceId, name, formId, state, serial) {
  const template = petTemplateForFormId(formId);
  if (!template || Object.keys(template).length <= 0) {
    return {};
  }
  const baseStats = objectOrEmpty(template.baseStats);
  const maxHp = Math.max(1, Math.trunc(Number(baseStats.maxHp || DEFAULT_PET_BATTLE_STATS.maxHp)));
  return {
    instanceId,
    petId: instanceId,
    templateId: formId,
    formId,
    speciesId: formId,
    lineId: String(template.lineId || ""),
    lineName: String(template.lineName || ""),
    subtypeId: String(template.subtypeId || ""),
    subtypeName: String(template.subtypeName || ""),
    formName: String(template.formName || name || "幼兽"),
    name: name || String(template.formName || "幼兽"),
    state,
    level: 1,
    exp: 0,
    nextExp: battleExpToNextLevel(1),
    hp: maxHp,
    maxHp,
    attack: Math.max(1, Math.trunc(Number(baseStats.attack || DEFAULT_PET_BATTLE_STATS.attack))),
    defense: Math.max(1, Math.trunc(Number(baseStats.defense || DEFAULT_PET_BATTLE_STATS.defense))),
    quick: Math.max(1, Math.trunc(Number(baseStats.quick || baseStats.agility || DEFAULT_PET_BATTLE_STATS.quick))),
    elements: clone(objectOrEmpty(template.elements)),
    growthProfileId: String(template.growthProfileId || "balanced"),
    activeSkillIds: stringArray(template.activeSkillIds),
    petSkillSlots: stringArray(template.petSkillSlots),
    passiveSkillIds: stringArray(template.passiveSkillIds),
    capturedSerial: serial,
    individualSeed: `rebirth:${formId}:${serial}`,
    isNew: true,
    schemaVersion: 1,
  };
}

function ensureActivePetAfterInstanceRemoval(profile) {
  const instances = Array.isArray(profile.petInstances) ? profile.petInstances : [];
  const activePetInstanceId = String(profile.activePetInstanceId || "").trim();
  const active = activePetInstanceId
    ? instances.find((pet) => profilePetIdentityValues(pet).includes(activePetInstanceId))
    : null;
  if (active) {
    return;
  }
  const battlePet = instances.find((pet) => pet && String(pet.state || BATTLE_PET_STATE_STANDBY) === BATTLE_PET_STATE_BATTLE) || null;
  if (battlePet) {
    profile.activePetInstanceId = String(battlePet.instanceId || battlePet.petId || "");
    return;
  }
  profile.activePetInstanceId = "";
}

function playerRebirthRingItemIds() {
  const caves = Array.isArray(rebirthTrialDocument().elementCaves) ? rebirthTrialDocument().elementCaves : [];
  const result = [];
  for (const cave of caves) {
    const itemId = String(cave && cave.ringItemId || "").trim();
    if (itemId && !result.includes(itemId)) {
      result.push(itemId);
    }
  }
  return result;
}

function playerRebirthRequiredBeastFormIds(targetCount) {
  const stage = playerRebirthStageForTarget(targetCount);
  const result = [];
  for (const element of stringArray(stage.requiredCapturedBeastElements)) {
    const beast = playerRebirthBeastForElement(element);
    const formId = String(beast.formId || "").trim();
    if (formId && !result.includes(formId)) {
      result.push(formId);
    }
  }
  return result;
}

function playerRebirthStageForTarget(targetCount) {
  const stages = Array.isArray(rebirthTrialDocument().stages) ? rebirthTrialDocument().stages : [];
  return stages.find((stage) => stage && Math.trunc(Number(stage.targetRebirth || 0)) === clampInt(targetCount, 1, PLAYER_REBIRTH_MAX_COUNT, 1)) || {};
}

function playerRebirthBeastForElement(element) {
  const beasts = Array.isArray(rebirthTrialDocument().rebirthBeasts) ? rebirthTrialDocument().rebirthBeasts : [];
  return beasts.find((beast) => beast && String(beast.element || "") === String(element || "")) || {};
}

function petFormNameFor(formId) {
  const template = petTemplateForFormId(formId);
  return String(template.formName || template.name || formId || "宠物");
}

function applyPlayerRebirthReturn(data, account, now) {
  const recordPoint = recordPointForAccount(data, account.accountId);
  const spawnCell = spawnCellForRecordPoint(recordPoint);
  const previousPosition = data.playerPositions[account.accountId] || null;
  const position = normalizePlayerPositionPayload({
    mapId: recordPoint.mapId,
    cellX: spawnCell[0],
    cellY: spawnCell[1],
    facing: "south",
    moving: false,
  }, account, now);
  position.authority = "player_rebirth_return";
  position.movementSeq = Number(previousPosition && previousPosition.movementSeq || 0) + 1;
  data.playerPositions[account.accountId] = position;
  return {
    kind: "record_point_return",
    accountId: account.accountId,
    reason: "player_rebirth",
    recordPoint,
    position,
    updatedAt: position.updatedAt,
    schemaVersion: 1,
  };
}

function loadDataDocument(fileName) {
  const filePath = path.resolve(__dirname, "../../..", "client/godot/data", fileName);
  try {
    const doc = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return doc && typeof doc === "object" && !Array.isArray(doc) ? doc : {};
  } catch {
    return {};
  }
}

function equipmentSlotIds() {
  const slots = equipmentDocument().slots;
  if (!Array.isArray(slots)) {
    return [];
  }
  return slots
    .map((slot) => String(slot && slot.id || "").trim())
    .filter(Boolean);
}

function equipmentItemById(itemId) {
  const normalizedItemId = String(itemId || "").trim();
  if (!normalizedItemId) {
    return null;
  }
  const items = equipmentDocument().items;
  if (!Array.isArray(items)) {
    return null;
  }
  return items.find((item) => item && String(item.id || "").trim() === normalizedItemId) || null;
}

function battleActionById(actionId) {
  const normalizedActionId = String(actionId || "").trim();
  if (!normalizedActionId) {
    return null;
  }
  const actions = battleActionDocument().actions;
  if (!Array.isArray(actions)) {
    return null;
  }
  return actions.find((action) => action && String(action.id || "").trim() === normalizedActionId) || null;
}

function battleSpiritActionById(spiritId) {
  const action = battleActionById(spiritId);
  return action && String(action.owner || "") === "spirit" ? action : null;
}

function battleItemActionById(itemId) {
  const action = battleActionById(itemId);
  return action && String(action.owner || "") === "item" ? action : null;
}

function battlePetSkillActionById(skillId) {
  const action = battleActionById(skillId);
  return action && String(action.owner || "") === "pet_skill" ? action : null;
}

function battleActionEffect(actionId) {
  const action = battleActionById(actionId);
  return action && action.effect && typeof action.effect === "object" && !Array.isArray(action.effect) ? action.effect : {};
}

function battleActionTarget(actionId) {
  const action = battleActionById(actionId);
  return action && action.target && typeof action.target === "object" && !Array.isArray(action.target) ? action.target : {};
}

function battleActionEffectType(actionId) {
  return String(battleActionEffect(actionId).type || "");
}

function battleActionEffectAmount(actionId, fallback = 0) {
  return Math.max(0, Math.trunc(Number(battleActionEffect(actionId).amount || fallback || 0)));
}

function battleActionStatusId(actionId, fallback = "") {
  return String(battleActionEffect(actionId).statusId || fallback || "");
}

function battleActionStatusTurns(actionId, fallback = 1) {
  return Math.max(1, Math.trunc(Number(battleActionEffect(actionId).statusTurns || fallback || 1)));
}

function battleActionStatusHitRate(actionId, fallback = 1) {
  const value = Number(battleActionEffect(actionId).statusHitRate);
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : fallback));
}

function battleActionStatusPotency(actionId, amount, fallback = 0) {
  const effect = battleActionEffect(actionId);
  const explicit = Math.trunc(Number(effect.statusPotency || 0));
  if (explicit > 0) {
    return explicit;
  }
  const ratio = Number(effect.statusPotencyRatio || 0);
  if (Number.isFinite(ratio) && ratio > 0) {
    return Math.max(1, Math.round(Math.max(1, amount) * ratio));
  }
  return Math.max(0, Math.trunc(Number(fallback || 0)));
}

function battleActionStatusIds(actionId) {
  const rawIds = battleActionEffect(actionId).statusIds;
  if (!Array.isArray(rawIds)) {
    return [];
  }
  return rawIds.map((value) => String(value || "").trim()).filter(Boolean);
}

function battleActionIsAll(actionId) {
  return Boolean(battleActionTarget(actionId).isAll);
}

function battleActionCanTargetAlly(actionId) {
  return Boolean(battleActionTarget(actionId).canTargetAlly);
}

function battleActionCanTargetEnemy(actionId) {
  return Boolean(battleActionTarget(actionId).canTargetEnemy);
}

function battleSpiritEffect(spiritId) {
  const action = battleSpiritActionById(spiritId);
  return action && action.effect && typeof action.effect === "object" && !Array.isArray(action.effect) ? action.effect : {};
}

function battleSpiritTarget(spiritId) {
  const action = battleSpiritActionById(spiritId);
  return action && action.target && typeof action.target === "object" && !Array.isArray(action.target) ? action.target : {};
}

function battleSpiritLabel(spiritId) {
  const action = battleSpiritActionById(spiritId);
  return String(action && action.label || spiritId || "精灵");
}

function battleSpiritEffectType(spiritId) {
  return String(battleSpiritEffect(spiritId).type || "");
}

function battleSpiritEffectAmount(spiritId, fallback = 0) {
  return Math.max(0, Math.trunc(Number(battleSpiritEffect(spiritId).amount || fallback || 0)));
}

function battleSpiritStatusPotency(spiritId, amount) {
  const effect = battleSpiritEffect(spiritId);
  const explicit = Math.trunc(Number(effect.statusPotency || 0));
  if (explicit > 0) {
    return explicit;
  }
  const ratio = Number(effect.statusPotencyRatio || 0.5);
  return Math.max(1, Math.round(Math.max(1, amount) * (Number.isFinite(ratio) && ratio > 0 ? ratio : 0.5)));
}

function battleSpiritIsAll(spiritId) {
  return Boolean(battleSpiritTarget(spiritId).isAll);
}

function battleSpiritCanTargetAlly(spiritId) {
  return Boolean(battleSpiritTarget(spiritId).canTargetAlly);
}

function battleSpiritCanTargetEnemy(spiritId) {
  return Boolean(battleSpiritTarget(spiritId).canTargetEnemy);
}

function battleSpiritIdsForItem(itemId) {
  const item = equipmentItemById(itemId);
  const rawSpiritIds = item && Array.isArray(item.spiritIds) ? item.spiritIds : [];
  const result = [];
  for (const value of rawSpiritIds) {
    const spiritId = String(value || "").trim();
    if (!spiritId || result.includes(spiritId) || !battleSpiritActionById(spiritId)) {
      continue;
    }
    result.push(spiritId);
  }
  return result;
}

function equipmentItemLabel(itemId) {
  const item = equipmentItemById(itemId);
  if (item) {
    return String(item.label || item.menuLabel || item.id || "装备");
  }
  return bagItemLabel(itemId);
}

function equipmentItemSlotId(itemId) {
  const item = equipmentItemById(itemId);
  return String(item && item.slot || "").trim();
}

function equipmentItemMaxDurability(itemId) {
  const item = equipmentItemById(itemId);
  if (!item) {
    return 0;
  }
  if (item.usesDurability === false) {
    return 0;
  }
  return Math.max(1, Math.trunc(Number(item.durabilityMax || 30)));
}

function equipmentItemEnhanceMax(itemId) {
  const item = equipmentItemById(itemId);
  if (!item || item.expPill === true) {
    return 0;
  }
  return Math.max(0, Math.trunc(Number(item.enhanceMax || 5)));
}

function equipmentItemMeetsRequirements(item, playerLevel, playerRebirth) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return false;
  }
  const requiredLevel = Math.max(1, Math.trunc(Number(item.requiredLevel || 1)));
  const requiredRebirth = Math.max(0, Math.trunc(Number(item.requiredRebirth || 0)));
  return Math.max(1, Math.trunc(Number(playerLevel || 1))) >= requiredLevel
    && Math.max(0, Math.trunc(Number(playerRebirth || 0))) >= requiredRebirth;
}

function equipmentSlotIsBroken(slotId, itemId, durability) {
  if (!durability || typeof durability !== "object" || Array.isArray(durability)) {
    return false;
  }
  const item = equipmentItemById(itemId);
  const maxDurability = Math.trunc(Number(item && item.durabilityMax || 30));
  if (maxDurability <= 0) {
    return false;
  }
  return clampInt(durability[slotId], 0, maxDurability, maxDurability) <= 0;
}

function equipmentSpiritIdsFromProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return [];
  }
  const slots = profile.equipmentSlots && typeof profile.equipmentSlots === "object" && !Array.isArray(profile.equipmentSlots)
    ? profile.equipmentSlots
    : {};
  const durability = profile.equipmentDurability && typeof profile.equipmentDurability === "object" && !Array.isArray(profile.equipmentDurability)
    ? profile.equipmentDurability
    : {};
  const player = profile.player && typeof profile.player === "object" && !Array.isArray(profile.player) ? profile.player : {};
  const playerLevel = Math.max(1, Math.trunc(Number(player.level || 1)));
  const playerRebirth = Math.max(0, Math.trunc(Number(profile.rebirthCount || 0)));
  const result = [];
  for (const slotId of equipmentSlotIds()) {
    const itemId = String(slots[slotId] || "").trim();
    if (!itemId || equipmentSlotIsBroken(slotId, itemId, durability)) {
      continue;
    }
    const item = equipmentItemById(itemId);
    if (!equipmentItemMeetsRequirements(item, playerLevel, playerRebirth)) {
      continue;
    }
    for (const spiritId of battleSpiritIdsForItem(itemId)) {
      if (!result.includes(spiritId)) {
        result.push(spiritId);
      }
    }
  }
  return result.sort();
}

function equipItemToProfile(profile, itemId) {
  const normalizedItemId = String(itemId || "").trim();
  const item = equipmentItemById(normalizedItemId);
  const itemLabel = equipmentItemLabel(normalizedItemId);
  if (!item) {
    return {ok: false, code: "equipment_item_invalid", message: `${itemLabel} 不能装备。`};
  }
  const slotId = String(item.slot || "").trim();
  if (!equipmentSlotIds().includes(slotId)) {
    return {ok: false, code: "equipment_slot_invalid", message: `${itemLabel} 没有可用装备槽。`};
  }
  const backpackSlots = normalizeBackpackSlots(profileBackpackSlots(profile));
  if (backpackItemCount(backpackSlots, normalizedItemId) <= 0) {
    return {ok: false, code: "equipment_item_missing", message: `没有${itemLabel}。`};
  }
  const player = objectOrEmpty(profile.player);
  const playerLevel = Math.max(1, Math.trunc(Number(player.level || 1)));
  const playerRebirth = Math.max(0, Math.trunc(Number(profile.rebirthCount || 0)));
  if (!equipmentItemMeetsRequirements(item, playerLevel, playerRebirth)) {
    const requiredLevel = Math.max(1, Math.trunc(Number(item.requiredLevel || 1)));
    const requiredRebirth = Math.max(0, Math.trunc(Number(item.requiredRebirth || 0)));
    const requiredParts = [];
    if (requiredLevel > 1) {
      requiredParts.push(`Lv${requiredLevel}`);
    }
    if (requiredRebirth > 0) {
      requiredParts.push(`${requiredRebirth}转`);
    }
    return {
      ok: false,
      code: "equipment_requirement_not_met",
      message: requiredParts.length > 0 ? `${itemLabel} 需要${requiredParts.join(" / ")}。` : "暂时不能装备。",
    };
  }

  const slots = equipmentSlotsFromProfile(profile);
  const instances = equipmentInstancesFromProfile(profile);
  const slotInstanceIds = equipmentSlotInstanceIdsFromProfile(profile, instances);
  let nextSerial = nextEquipmentInstanceSerial(profile, instances);
  let backpackInstanceId = firstEquipmentInstanceIdForLocation(instances, "backpack", normalizedItemId);
  if (!backpackInstanceId) {
    const created = createEquipmentInstanceRecord(instances, nextSerial, normalizedItemId, "backpack", "", "server_equip_fallback");
    backpackInstanceId = created.instanceId;
    nextSerial = created.nextSerial;
  }

  const previousItemId = String(slots[slotId] || "").trim();
  const previousInstanceId = String(slotInstanceIds[slotId] || "").trim();
  if (previousItemId === normalizedItemId) {
    return {ok: false, code: "equipment_already_equipped", message: `${itemLabel} 已经装备。`};
  }
  if (slotId === "exp_pill" && previousItemId && equipmentExpPillChargeHasProgress(slots, profile.equipmentExpPillCharge)) {
    return {ok: false, code: "equipment_exp_pill_locked", message: "经验丹已储存经验，暂不能替换。"};
  }

  let backpackAfterTake = consumeBackpackItem(backpackSlots, normalizedItemId, 1);
  if (previousItemId) {
    const returnResult = addSingleItemToBackpack(backpackAfterTake, previousItemId, 1);
    if (returnResult.addedCount < 1) {
      return {
        ok: false,
        code: "backpack_full",
        message: `背包已满，无法换下${equipmentItemLabel(previousItemId)}。`,
      };
    }
    backpackAfterTake = returnResult.slots;
  }

  slots[slotId] = normalizedItemId;
  if (previousInstanceId && instances[previousInstanceId]) {
    instances[previousInstanceId] = {
      ...instances[previousInstanceId],
      location: "backpack",
      slotId: "",
    };
  }
  if (backpackInstanceId && instances[backpackInstanceId]) {
    instances[backpackInstanceId] = {
      ...instances[backpackInstanceId],
      location: "equipped",
      slotId,
    };
    slotInstanceIds[slotId] = backpackInstanceId;
  }

  const durability = equipmentDurabilityFromProfile(profile);
  const enhancement = equipmentEnhancementFromProfile(profile);
  const wearCounters = equipmentWearCountersFromProfile(profile);
  const maxDurability = equipmentItemMaxDurability(normalizedItemId);
  const equippedRecord = instances[backpackInstanceId] || {};
  if (maxDurability > 0) {
    durability[slotId] = clampInt(equippedRecord.durability, 0, maxDurability, maxDurability);
    wearCounters[slotId] = normalizeEquipmentWearCounter(normalizedItemId, equippedRecord.wearCounters);
    instances[backpackInstanceId].durability = durability[slotId];
    instances[backpackInstanceId].wearCounters = wearCounters[slotId];
  } else {
    delete durability[slotId];
    delete wearCounters[slotId];
  }
  if (equipmentItemEnhanceMax(normalizedItemId) > 0) {
    enhancement[slotId] = normalizeEquipmentEnhancement(normalizedItemId, equippedRecord.enhancement);
    instances[backpackInstanceId].enhancement = enhancement[slotId];
  } else {
    delete enhancement[slotId];
  }
  if (slotId === "exp_pill") {
    const charge = normalizeEquipmentExpPillCharge(normalizedItemId, equippedRecord.expPillCharge);
    profile.equipmentExpPillCharge = charge;
    instances[backpackInstanceId].expPillCharge = charge;
  }

  profile.backpackSlots = normalizeBackpackSlots(backpackAfterTake);
  profile.captureTools = captureToolBagFromProfile(profile);
  profile.equipmentInstances = instances;
  profile.equipmentSlotInstanceIds = slotInstanceIds;
  profile.nextEquipmentInstanceSerial = Math.max(1, nextSerial);
  profile.equipmentSlots = slots;
  profile.equipmentDurability = durability;
  profile.equipmentEnhancement = enhancement;
  profile.equipmentWearCounters = wearCounters;
  profile.equipmentSlotsVersion = 3;

  const message = previousItemId && previousItemId !== normalizedItemId
    ? `装备${itemLabel}，换下${equipmentItemLabel(previousItemId)}。`
    : `装备${itemLabel}。`;
  return {
    ok: true,
    message,
    itemId: normalizedItemId,
    slot: slotId,
    instanceId: backpackInstanceId,
    previousItemId,
    previousInstanceId,
  };
}

function enhanceEquipmentSlotToProfile(profile, slotId) {
  const normalizedSlotId = String(slotId || "").trim();
  if (!equipmentSlotIds().includes(normalizedSlotId)) {
    return {ok: false, code: "equipment_slot_invalid", message: "装备槽无效。"};
  }
  const slots = equipmentSlotsFromProfile(profile);
  const itemId = String(slots[normalizedSlotId] || "").trim();
  if (!itemId) {
    return {ok: false, code: "equipment_slot_empty", slotId: normalizedSlotId, message: "这个装备槽没有装备。"};
  }
  const itemLabel = equipmentItemLabel(itemId);
  const maxLevel = equipmentItemEnhanceMax(itemId);
  if (maxLevel <= 0) {
    return {ok: false, code: "equipment_enhance_not_supported", slotId: normalizedSlotId, itemId, message: `${itemLabel} 暂不能强化。`};
  }
  const enhancement = equipmentEnhancementFromProfile(profile);
  const currentRecord = normalizeEquipmentEnhancement(itemId, enhancement[normalizedSlotId]);
  const currentLevel = Math.max(0, Math.trunc(Number(currentRecord.level || 0)));
  if (currentLevel >= maxLevel) {
    return {
      ok: false,
      code: "equipment_enhance_max",
      slotId: normalizedSlotId,
      itemId,
      level: currentLevel,
      maxLevel,
      message: `${itemLabel} 已达到强化上限。`,
    };
  }
  const nextLevel = currentLevel + 1;
  const materialId = equipmentEnhanceMaterialId(itemId);
  const materialCount = equipmentEnhanceMaterialCountForLevel(nextLevel);
  const stoneCost = equipmentEnhanceStoneCostForLevel(nextLevel);
  const backpackSlots = normalizeBackpackSlots(profileBackpackSlots(profile));
  const heldMaterial = backpackItemCount(backpackSlots, materialId);
  const missingParts = [];
  if (heldMaterial < materialCount) {
    missingParts.push(`${bagItemLabel(materialId)} ${heldMaterial}/${materialCount}`);
  }
  const currentCoins = profileStoneCoins(profile);
  if (currentCoins < stoneCost) {
    missingParts.push(`石币 ${currentCoins}/${stoneCost}`);
  }
  if (missingParts.length > 0) {
    return {
      ok: false,
      code: heldMaterial < materialCount ? "equipment_enhance_material_missing" : "not_enough_stone_coins",
      slotId: normalizedSlotId,
      itemId,
      materialId,
      materialCount,
      stoneCost,
      message: `强化材料不足：${missingParts.join("、")}。`,
    };
  }

  const instances = equipmentInstancesFromProfile(profile);
  const slotInstanceIds = equipmentSlotInstanceIdsFromProfile(profile, instances);
  let nextSerial = nextEquipmentInstanceSerial(profile, instances);
  let instanceId = String(slotInstanceIds[normalizedSlotId] || "").trim();
  if (!instanceId || !instances[instanceId]) {
    const created = createEquipmentInstanceRecord(instances, nextSerial, itemId, "equipped", normalizedSlotId, "server_enhance_fallback");
    instanceId = created.instanceId;
    nextSerial = created.nextSerial;
    slotInstanceIds[normalizedSlotId] = instanceId;
  }

  const nextSlots = consumeBackpackItem(backpackSlots, materialId, materialCount);
  const history = Array.isArray(currentRecord.history) ? currentRecord.history.map(clone) : [];
  history.push({
    level: nextLevel,
    materialId,
    materialCount,
    stoneCost,
  });
  const record = {
    itemId,
    level: nextLevel,
    history,
  };
  enhancement[normalizedSlotId] = record;
  instances[instanceId] = {
    ...instances[instanceId],
    itemId,
    location: "equipped",
    slotId: normalizedSlotId,
    enhancement: record,
  };
  profile.backpackSlots = normalizeBackpackSlots(nextSlots);
  profile.captureTools = captureToolBagFromProfile(profile);
  profile.stoneCoins = currentCoins - stoneCost;
  profile.equipmentSlots = slots;
  profile.equipmentEnhancement = enhancement;
  profile.equipmentInstances = instances;
  profile.equipmentSlotInstanceIds = slotInstanceIds;
  profile.nextEquipmentInstanceSerial = Math.max(1, nextSerial);
  profile.equipmentSlotsVersion = 3;

  const bonusText = equipmentEnhanceBonusTextFor(itemId, nextLevel);
  return {
    ok: true,
    slotId: normalizedSlotId,
    itemId,
    level: nextLevel,
    materialId,
    materialCount,
    stoneCost,
    instanceId,
    message: `${itemLabel} 强化到 +${nextLevel}${bonusText ? `（${bonusText}）` : ""}。`,
  };
}

function equipmentEnhanceMaterialId(itemId) {
  const item = equipmentItemById(itemId);
  if (!item || equipmentItemEnhanceMax(itemId) <= 0) {
    return "";
  }
  const explicitId = String(item.enhanceMaterialId || "").trim();
  if (explicitId) {
    return explicitId;
  }
  const slotId = equipmentItemSlotId(itemId);
  if (["body", "head", "hands", "feet"].includes(slotId)) {
    return EQUIPMENT_ENHANCE_HIDE_MATERIAL_ID;
  }
  return EQUIPMENT_ENHANCE_WOOD_MATERIAL_ID;
}

function equipmentEnhanceMaterialCountForLevel(nextLevel) {
  return Math.max(1, Math.trunc(Number(nextLevel || 1)));
}

function equipmentEnhanceStoneCostForLevel(nextLevel) {
  return Math.max(1, Math.trunc(Number(nextLevel || 1))) * EQUIPMENT_ENHANCE_BASE_STONE_COST;
}

function equipmentEnhanceBonusTextFor(itemId, level) {
  const safeLevel = Math.max(0, Math.min(equipmentItemEnhanceMax(itemId), Math.trunc(Number(level || 0))));
  if (safeLevel <= 0) {
    return "";
  }
  const slotId = equipmentItemSlotId(itemId);
  if (["right_hand_weapon", "left_hand_weapon"].includes(slotId)) {
    return `攻击 +${safeLevel}`;
  }
  if (["body", "head", "hands", "feet"].includes(slotId)) {
    return `防御 +${safeLevel}`;
  }
  if (["accessory_left", "accessory_right"].includes(slotId)) {
    return `生命 +${safeLevel * 2}`;
  }
  return "";
}

function repairAllEquipmentToProfile(profile) {
  const slots = equipmentSlotsFromProfile(profile);
  const durability = equipmentDurabilityFromProfile(profile);
  const wearCounters = equipmentWearCountersFromProfile(profile);
  const instances = equipmentInstancesFromProfile(profile);
  const slotInstanceIds = equipmentSlotInstanceIdsFromProfile(profile, instances);
  let nextSerial = nextEquipmentInstanceSerial(profile, instances);
  let missingDurability = 0;
  const repairedSlots = [];
  for (const slotId of equipmentSlotIds()) {
    const itemId = String(slots[slotId] || "").trim();
    if (!itemId) {
      continue;
    }
    const maxDurability = equipmentItemMaxDurability(itemId);
    if (maxDurability <= 0) {
      continue;
    }
    const currentDurability = clampInt(durability[slotId], 0, maxDurability, maxDurability);
    const missing = Math.max(0, maxDurability - currentDurability);
    if (missing <= 0) {
      continue;
    }
    missingDurability += missing;
    repairedSlots.push({
      slotId,
      itemId,
      before: currentDurability,
      after: maxDurability,
      missing,
      schemaVersion: 1,
    });
  }
  if (missingDurability <= 0) {
    return {ok: false, code: "equipment_repair_not_needed", message: "装备耐久已满。"};
  }
  const cost = equipmentRepairCostForMissing(missingDurability);
  const currentCoins = profileStoneCoins(profile);
  if (currentCoins < cost) {
    return {
      ok: false,
      code: "not_enough_stone_coins",
      missingDurability,
      cost,
      message: `石币不足，修理需要${cost}石币。`,
    };
  }

  for (const repaired of repairedSlots) {
    const slotId = String(repaired.slotId || "");
    const itemId = String(repaired.itemId || "");
    const maxDurability = equipmentItemMaxDurability(itemId);
    durability[slotId] = maxDurability;
    wearCounters[slotId] = normalizeEquipmentWearCounter(itemId, {});
    let instanceId = String(slotInstanceIds[slotId] || "").trim();
    if (!instanceId || !instances[instanceId]) {
      const created = createEquipmentInstanceRecord(instances, nextSerial, itemId, "equipped", slotId, "server_repair_fallback");
      instanceId = created.instanceId;
      nextSerial = created.nextSerial;
      slotInstanceIds[slotId] = instanceId;
    }
    instances[instanceId] = {
      ...instances[instanceId],
      itemId,
      location: "equipped",
      slotId,
      durability: maxDurability,
      wearCounters: wearCounters[slotId],
    };
  }

  profile.stoneCoins = currentCoins - cost;
  profile.equipmentSlots = slots;
  profile.equipmentDurability = durability;
  profile.equipmentWearCounters = wearCounters;
  profile.equipmentInstances = instances;
  profile.equipmentSlotInstanceIds = slotInstanceIds;
  profile.nextEquipmentInstanceSerial = Math.max(1, nextSerial);
  profile.equipmentSlotsVersion = 3;
  return {
    ok: true,
    missingDurability,
    cost,
    repairedSlots,
    message: `装备修理完成，花费${cost}石币。`,
  };
}

function equipmentRepairCostForMissing(missing) {
  const repairPerCoin = equipmentRepairDurabilityPerCoin();
  return Math.ceil(Math.max(0, Math.trunc(Number(missing || 0))) / repairPerCoin);
}

function equipmentRepairDurabilityPerCoin() {
  const wear = objectOrEmpty(playerGrowthDocument().equipmentWear);
  return Math.max(1, Math.trunc(Number(wear.repairDurabilityPerCoin || 5)));
}

function synthesizeEquipmentToProfile(profile, recipeId) {
  const recipe = equipmentSynthesisRecipeForId(recipeId);
  if (!recipe) {
    return {ok: false, code: "equipment_synthesis_recipe_missing", message: "配方不存在。"};
  }
  const outputItemId = equipmentSynthesisOutputItemId(recipe);
  const outputItem = equipmentItemById(outputItemId);
  const outputLabel = equipmentItemLabel(outputItemId);
  if (!outputItem || !bagItemById(outputItemId)) {
    return {ok: false, code: "equipment_synthesis_output_invalid", message: "配方产物无效。"};
  }
  const outputCount = equipmentSynthesisOutputCount(recipe);
  const materials = equipmentSynthesisMaterialEntries(recipe);
  if (materials.length <= 0) {
    return {ok: false, code: "equipment_synthesis_material_invalid", message: "配方材料无效。"};
  }
  const backpackSlots = normalizeBackpackSlots(profileBackpackSlots(profile));
  const missingItems = [];
  for (const material of materials) {
    const itemId = String(material.itemId || "");
    const needCount = Math.max(0, Math.trunc(Number(material.count || 0)));
    const heldCount = backpackItemCount(backpackSlots, itemId);
    if (heldCount < needCount) {
      missingItems.push({itemId, count: needCount - heldCount});
    }
  }
  if (missingItems.length > 0) {
    return {
      ok: false,
      code: "equipment_synthesis_material_missing",
      message: `材料不足：${itemAmountText(missingItems)}。`,
      missingItems,
    };
  }
  const stoneCost = equipmentSynthesisStoneCost(recipe);
  const currentCoins = profileStoneCoins(profile);
  if (currentCoins < stoneCost) {
    return {
      ok: false,
      code: "not_enough_stone_coins",
      message: "石币不够。",
      missingCoins: stoneCost - currentCoins,
    };
  }
  let slotsAfterMaterials = backpackSlots;
  for (const material of materials) {
    slotsAfterMaterials = consumeBackpackItem(slotsAfterMaterials, material.itemId, material.count);
  }
  const addResult = addSingleItemToBackpack(slotsAfterMaterials, outputItemId, outputCount);
  if (addResult.addedCount < outputCount) {
    return {
      ok: false,
      code: "backpack_full",
      message: `背包空间不足，无法合成${outputLabel}。`,
    };
  }
  profile.backpackSlots = normalizeBackpackSlots(addResult.slots);
  profile.captureTools = captureToolBagFromProfile(profile);
  profile.stoneCoins = currentCoins - stoneCost;
  const instanceIds = addEquipmentBackpackInstancesToProfile(profile, outputItemId, outputCount, "synthesis");
  const costText = stoneCost > 0 ? `、${stoneCost}石币` : "";
  return {
    ok: true,
    message: `合成${outputLabel}，消耗${itemAmountText(materials)}${costText}。`,
    recipeId,
    outputItemId,
    outputCount,
    materials,
    stoneCost,
    category: String(recipe.category || ""),
    instanceIds,
  };
}

function equipmentSynthesisRecipes() {
  const raw = equipmentSynthesisDocument().recipes;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((recipe) => (
    recipe &&
    typeof recipe === "object" &&
    !Array.isArray(recipe) &&
    String(recipe.id || "").trim() !== ""
  ));
}

function equipmentSynthesisRecipeForId(recipeId) {
  const normalizedRecipeId = String(recipeId || "").trim();
  if (normalizedRecipeId === "") {
    return null;
  }
  return equipmentSynthesisRecipes().find((recipe) => String(recipe.id || "").trim() === normalizedRecipeId) || null;
}

function equipmentSynthesisOutputItemId(recipe) {
  return String(recipe && recipe.outputItemId || "").trim();
}

function equipmentSynthesisOutputCount(recipe) {
  return Math.max(1, Math.trunc(Number(recipe && recipe.outputCount || 1)));
}

function equipmentSynthesisStoneCost(recipe) {
  return Math.max(0, Math.trunc(Number(recipe && recipe.stoneCost || 0)));
}

function equipmentSynthesisMaterialEntries(recipe) {
  const raw = Array.isArray(recipe && recipe.materials) ? recipe.materials : [];
  const entries = raw
    .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
    .map((entry) => ({
      itemId: String(entry.itemId || "").trim(),
      count: Math.max(0, Math.trunc(Number(entry.count || 0))),
    }))
    .filter((entry) => entry.itemId !== "" && entry.count > 0 && bagItemById(entry.itemId));
  return mergeItemAmounts(entries);
}

function addEquipmentBackpackInstancesToProfile(profile, itemId, count, source) {
  const instanceIds = [];
  const instances = equipmentInstancesFromProfile(profile);
  let nextSerial = nextEquipmentInstanceSerial(profile, instances);
  const total = Math.max(0, Math.trunc(Number(count || 0)));
  for (let index = 0; index < total; index += 1) {
    const created = createEquipmentInstanceRecord(instances, nextSerial, itemId, "backpack", "", source);
    instanceIds.push(created.instanceId);
    nextSerial = created.nextSerial;
  }
  profile.equipmentInstances = instances;
  profile.nextEquipmentInstanceSerial = Math.max(1, nextSerial);
  return instanceIds;
}

function equipmentSlotsFromProfile(profile) {
  const raw = objectOrEmpty(profile && profile.equipmentSlots);
  const result = {};
  for (const slotId of equipmentSlotIds()) {
    const itemId = String(raw[slotId] || "").trim();
    if (itemId && equipmentItemSlotId(itemId) === slotId) {
      result[slotId] = itemId;
    }
  }
  return result;
}

function equipmentDurabilityFromProfile(profile) {
  const slots = equipmentSlotsFromProfile(profile);
  const raw = objectOrEmpty(profile && profile.equipmentDurability);
  const result = {};
  for (const slotId of equipmentSlotIds()) {
    const itemId = String(slots[slotId] || "").trim();
    const maxDurability = equipmentItemMaxDurability(itemId);
    if (itemId && maxDurability > 0) {
      result[slotId] = clampInt(raw[slotId], 0, maxDurability, maxDurability);
    }
  }
  return result;
}

function equipmentEnhancementFromProfile(profile) {
  const slots = equipmentSlotsFromProfile(profile);
  const raw = objectOrEmpty(profile && profile.equipmentEnhancement);
  const result = {};
  for (const slotId of equipmentSlotIds()) {
    const itemId = String(slots[slotId] || "").trim();
    if (itemId && equipmentItemEnhanceMax(itemId) > 0) {
      result[slotId] = normalizeEquipmentEnhancement(itemId, raw[slotId]);
    }
  }
  return result;
}

function equipmentWearCountersFromProfile(profile) {
  const slots = equipmentSlotsFromProfile(profile);
  const raw = objectOrEmpty(profile && profile.equipmentWearCounters);
  const result = {};
  for (const slotId of equipmentSlotIds()) {
    const itemId = String(slots[slotId] || "").trim();
    if (itemId && equipmentItemMaxDurability(itemId) > 0) {
      result[slotId] = normalizeEquipmentWearCounter(itemId, raw[slotId]);
    }
  }
  return result;
}

function equipmentInstancesFromProfile(profile) {
  const raw = objectOrEmpty(profile && profile.equipmentInstances);
  const result = {};
  for (const [key, value] of Object.entries(raw)) {
    const record = normalizeEquipmentInstanceRecord(value, key);
    if (record.instanceId) {
      result[record.instanceId] = record;
    }
  }
  return result;
}

function equipmentSlotInstanceIdsFromProfile(profile, instances) {
  const raw = objectOrEmpty(profile && profile.equipmentSlotInstanceIds);
  const result = {};
  for (const slotId of equipmentSlotIds()) {
    const instanceId = String(raw[slotId] || "").trim();
    const record = instances[instanceId] || null;
    if (!record || equipmentItemSlotId(record.itemId) !== slotId) {
      continue;
    }
    record.location = "equipped";
    record.slotId = slotId;
    result[slotId] = instanceId;
  }
  return result;
}

function normalizeEquipmentInstanceRecord(value, fallbackInstanceId = "") {
  const raw = objectOrEmpty(value);
  const itemId = String(raw.itemId || "").trim();
  if (!equipmentItemById(itemId)) {
    return {};
  }
  const instanceId = String(raw.instanceId || fallbackInstanceId || "").trim();
  if (!instanceId) {
    return {};
  }
  const itemSlotId = equipmentItemSlotId(itemId);
  let location = String(raw.location || "backpack").trim();
  if (location !== "equipped" && location !== "backpack") {
    location = "backpack";
  }
  let slotId = String(raw.slotId || "").trim();
  if (location !== "equipped" || itemSlotId !== slotId) {
    slotId = "";
  }
  const maxDurability = equipmentItemMaxDurability(itemId);
  return {
    schemaVersion: 1,
    instanceId,
    itemId,
    location,
    slotId,
    durability: maxDurability > 0 ? clampInt(raw.durability, 0, maxDurability, maxDurability) : 0,
    enhancement: normalizeEquipmentEnhancement(itemId, raw.enhancement),
    wearCounters: normalizeEquipmentWearCounter(itemId, raw.wearCounters),
    expPillCharge: normalizeEquipmentExpPillCharge(itemId, raw.expPillCharge),
    source: String(raw.source || ""),
  };
}

function firstEquipmentInstanceIdForLocation(instances, location, itemId) {
  const normalizedLocation = String(location || "");
  const normalizedItemId = String(itemId || "");
  return Object.keys(objectOrEmpty(instances))
    .sort()
    .find((instanceId) => {
      const record = instances[instanceId] || {};
      return String(record.location || "") === normalizedLocation && (!normalizedItemId || String(record.itemId || "") === normalizedItemId);
    }) || "";
}

function nextEquipmentInstanceSerial(profile, instances) {
  let nextSerial = Math.max(1, Math.trunc(Number(profile && profile.nextEquipmentInstanceSerial || 1)));
  for (const instanceId of Object.keys(objectOrEmpty(instances))) {
    const match = String(instanceId || "").match(/^equip_(\d+)$/);
    if (match) {
      nextSerial = Math.max(nextSerial, Math.trunc(Number(match[1] || 0)) + 1);
    }
  }
  return nextSerial;
}

function createEquipmentInstanceRecord(instances, nextSerial, itemId, location, slotId, source) {
  let serial = Math.max(1, Math.trunc(Number(nextSerial || 1)));
  let instanceId = equipmentInstanceIdForSerial(serial);
  while (instances[instanceId]) {
    serial += 1;
    instanceId = equipmentInstanceIdForSerial(serial);
  }
  const maxDurability = equipmentItemMaxDurability(itemId);
  const record = {
    schemaVersion: 1,
    instanceId,
    itemId,
    location: location === "equipped" ? "equipped" : "backpack",
    slotId: location === "equipped" && equipmentItemSlotId(itemId) === slotId ? slotId : "",
    durability: maxDurability > 0 ? maxDurability : 0,
    enhancement: normalizeEquipmentEnhancement(itemId, {}),
    wearCounters: normalizeEquipmentWearCounter(itemId, {}),
    expPillCharge: normalizeEquipmentExpPillCharge(itemId, {}),
    source: String(source || ""),
  };
  instances[instanceId] = record;
  return {instanceId, nextSerial: serial + 1};
}

function equipmentInstanceIdForSerial(serial) {
  return `equip_${String(Math.max(1, Math.trunc(Number(serial || 1)))).padStart(6, "0")}`;
}

function normalizeEquipmentEnhancement(itemId, value) {
  if (equipmentItemEnhanceMax(itemId) <= 0) {
    return {};
  }
  const raw = objectOrEmpty(value);
  const history = Array.isArray(raw.history)
    ? raw.history.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry)).map(clone)
    : [];
  return {
    itemId,
    level: clampInt(raw.level, 0, equipmentItemEnhanceMax(itemId), 0),
    history,
  };
}

function normalizeEquipmentWearCounter(itemId, value) {
  if (equipmentItemMaxDurability(itemId) <= 0) {
    return {};
  }
  const raw = objectOrEmpty(value);
  if (String(raw.itemId || itemId) !== itemId) {
    return {itemId, attackCount: 0, hitCount: 0};
  }
  return {
    itemId,
    attackCount: Math.max(0, Math.trunc(Number(raw.attackCount || 0))),
    hitCount: Math.max(0, Math.trunc(Number(raw.hitCount || 0))),
  };
}

function normalizeEquipmentExpPillCharge(itemId, value) {
  const item = bagItemById(itemId);
  if (!item || !Array.isArray(item.useContexts) || !item.useContexts.includes("world_player_exp")) {
    return {};
  }
  const raw = objectOrEmpty(value);
  const baseLevel = Math.max(1, Math.trunc(Number(item.worldExpLevel || item.level || 1)));
  return {
    itemId,
    level: Math.max(baseLevel, Math.trunc(Number(raw.level || baseLevel))),
    exp: Math.max(0, Math.trunc(Number(raw.exp || 0))),
    nextExp: Math.max(1, Math.trunc(Number(raw.nextExp || 1))),
  };
}

function equipmentExpPillChargeHasProgress(slots, value) {
  const itemId = String(objectOrEmpty(slots).exp_pill || "").trim();
  if (!itemId) {
    return false;
  }
  const charge = normalizeEquipmentExpPillCharge(itemId, value);
  if (!charge.itemId) {
    return false;
  }
  const item = bagItemById(itemId) || {};
  const baseLevel = Math.max(1, Math.trunc(Number(item.worldExpLevel || item.level || 1)));
  return Math.trunc(Number(charge.level || baseLevel)) > baseLevel || Math.trunc(Number(charge.exp || 0)) > 0;
}

function battlePlayerSnapshotFromProfile(profile, account) {
  const player = profile && profile.player && typeof profile.player === "object" ? profile.player : {};
  const baseStats = player.baseStats && typeof player.baseStats === "object" ? player.baseStats : {};
  const maxHp = positiveNumber(player.maxHp, positiveNumber(baseStats.maxHp, DEFAULT_PLAYER_BATTLE_STATS.maxHp));
  const ride = ridingPetSnapshotFromProfile(profile);
  return {
    kind: BATTLE_ACTOR_KIND_PLAYER,
    name: String(player.name || account.displayName || account.username || "猎人"),
    level: positiveNumber(player.level, 1),
    hp: clampNumber(player.hp, 1, maxHp, maxHp),
    maxHp,
    attack: positiveNumber(baseStats.attack, DEFAULT_PLAYER_BATTLE_STATS.attack),
    defense: positiveNumber(baseStats.defense, DEFAULT_PLAYER_BATTLE_STATS.defense),
    quick: positiveNumber(baseStats.quick, DEFAULT_PLAYER_BATTLE_STATS.quick),
    ...ride,
    spiritIds: equipmentSpiritIdsFromProfile(profile),
    comboRateOverride: battleComboRateOverrideValue(player.comboRateOverride),
    schemaVersion: 1,
  };
}

function ridingPetSnapshotFromProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return {};
  }
  const ridePetInstanceId = String(profile.ridePetInstanceId || "").trim();
  if (ridePetInstanceId === "") {
    return {};
  }
  const petCollections = [];
  if (Array.isArray(profile.petInstances)) {
    petCollections.push(profile.petInstances);
  }
  if (Array.isArray(profile.pets) && profile.pets !== profile.petInstances) {
    petCollections.push(profile.pets);
  }
  let pet = null;
  for (const collection of petCollections) {
    pet = collection.find((item) => profilePetIdentityValues(item).includes(ridePetInstanceId)) || null;
    if (pet) {
      break;
    }
  }
  if (!pet || typeof pet !== "object" || Array.isArray(pet)) {
    return {};
  }
  const state = String(pet.state || pet.status || pet.battleState || "").trim();
  if (state !== BATTLE_PET_STATE_RIDING) {
    return {};
  }
  const maxHp = positiveNumber(pet.maxHp, DEFAULT_PET_BATTLE_STATS.maxHp);
  const hp = clampNumber(pet.hp, 0, maxHp, maxHp);
  if (hp <= 0) {
    return {};
  }
  return {
    ridePetInstanceId,
    ridePetName: String(pet.name || pet.displayName || pet.speciesName || "骑宠"),
    ridePetFormId: String(pet.formId || pet.templateId || pet.speciesId || ""),
    ridePetLevel: positiveNumber(pet.level, 1),
    ridePetHp: hp,
    ridePetMaxHp: maxHp,
    ridePetBattleState: BATTLE_PET_STATE_RIDING,
  };
}

function battlePetSnapshotsFromProfile(profile) {
  const petInstances = Array.isArray(profile.petInstances) ? profile.petInstances : (Array.isArray(profile.pets) ? profile.pets : []);
  const activePetInstanceId = String(profile.activePetInstanceId || "").trim();
  const battlePets = petInstances
    .map((pet, index) => ({pet, index}))
    .filter((entry) => entry.pet && typeof entry.pet === "object" && !Array.isArray(entry.pet))
    .filter((entry) => petBattleStateIsAvailable(entry.pet, activePetInstanceId))
    .sort((a, b) => {
      const aActive = petIsActiveBattlePet(a.pet, activePetInstanceId) ? 0 : 1;
      const bActive = petIsActiveBattlePet(b.pet, activePetInstanceId) ? 0 : 1;
      return aActive - bActive || a.index - b.index;
    })
    .slice(0, BATTLE_PET_MAX_PER_PARTICIPANT)
    .map((entry, index) => battlePetSnapshotFromProfilePet(entry.pet, activePetInstanceId, index))
    .filter((pet) => pet.petId !== "" && pet.hp > 0);
  return battlePets;
}

function battlePetSnapshotFromProfilePet(pet, activePetInstanceId = "", partyIndex = 0) {
  const maxHp = positiveNumber(pet.maxHp, DEFAULT_PET_BATTLE_STATS.maxHp);
  const petId = String(pet.instanceId || pet.petId || pet.id || "").trim();
  const activeInBattle = petIsActiveBattlePet(pet, activePetInstanceId);
  return {
    kind: BATTLE_ACTOR_KIND_PET,
    petId,
    partyIndex: Math.max(0, Number(partyIndex || 0)),
    name: String(pet.name || pet.displayName || pet.speciesName || "宠物"),
    formId: String(pet.formId || pet.templateId || pet.speciesId || ""),
    speciesId: String(pet.speciesId || pet.templateId || pet.formId || ""),
    state: activeInBattle ? BATTLE_PET_STATE_BATTLE : BATTLE_PET_STATE_STANDBY,
    activeInBattle,
    level: positiveNumber(pet.level, 1),
    hp: clampNumber(pet.hp, 1, maxHp, maxHp),
    maxHp,
    attack: positiveNumber(pet.attack, DEFAULT_PET_BATTLE_STATS.attack),
    defense: positiveNumber(pet.defense, DEFAULT_PET_BATTLE_STATS.defense),
    quick: positiveNumber(pet.quick, DEFAULT_PET_BATTLE_STATS.quick),
    activeSkillIds: stringArray(pet.activeSkillIds),
    petSkillSlots: stringArray(pet.petSkillSlots),
    passiveSkillIds: stringArray(pet.passiveSkillIds),
    comboRateOverride: battleComboRateOverrideValue(pet.comboRateOverride),
    schemaVersion: 1,
  };
}

function trainingPartnerSnapshotsFromProfile(profile) {
  const partners = profile && Array.isArray(profile.trainingPartners) ? profile.trainingPartners : [];
  return partners
    .map((partner, index) => trainingPartnerSnapshotFromProfilePartner(partner, index))
    .filter((partner) => String(partner.partnerId || "").trim() !== "" && Number(partner.hp || 0) > 0);
}

function trainingPartnerSnapshotFromProfilePartner(partner, index = 0) {
  if (!partner || typeof partner !== "object" || Array.isArray(partner)) {
    return {};
  }
  const maxHp = positiveNumber(partner.maxHp, DEFAULT_PLAYER_BATTLE_STATS.maxHp);
  const pet = partner.pet && typeof partner.pet === "object" && !Array.isArray(partner.pet)
    ? trainingPartnerPetSnapshotFromProfilePet(partner.pet, index)
    : null;
  return {
    kind: BATTLE_ACTOR_KIND_PLAYER,
    partnerId: String(partner.partnerId || partner.id || `training_partner_${index + 1}`),
    name: String(partner.name || partner.displayName || `伙伴${index + 1}`),
    level: positiveNumber(partner.level, 1),
    hp: clampNumber(partner.hp, 1, maxHp, maxHp),
    maxHp,
    attack: positiveNumber(partner.attack, DEFAULT_PLAYER_BATTLE_STATS.attack),
    defense: positiveNumber(partner.defense, DEFAULT_PLAYER_BATTLE_STATS.defense),
    quick: positiveNumber(partner.quick, DEFAULT_PLAYER_BATTLE_STATS.quick),
    pet,
    schemaVersion: 1,
  };
}

function trainingPartnerPetSnapshotFromProfilePet(pet, index = 0) {
  const maxHp = positiveNumber(pet.maxHp, DEFAULT_PET_BATTLE_STATS.maxHp);
  return {
    kind: BATTLE_ACTOR_KIND_PET,
    petId: String(pet.petId || pet.instanceId || pet.id || `training_partner_pet_${index + 1}`),
    name: String(pet.name || pet.displayName || "伙伴宠物"),
    formId: String(pet.formId || pet.templateId || pet.speciesId || ""),
    speciesId: String(pet.speciesId || pet.templateId || pet.formId || ""),
    level: positiveNumber(pet.level, 1),
    hp: clampNumber(pet.hp, 1, maxHp, maxHp),
    maxHp,
    attack: positiveNumber(pet.attack, DEFAULT_PET_BATTLE_STATS.attack),
    defense: positiveNumber(pet.defense, DEFAULT_PET_BATTLE_STATS.defense),
    quick: positiveNumber(pet.quick, DEFAULT_PET_BATTLE_STATS.quick),
    activeSkillIds: stringArray(pet.activeSkillIds),
    petSkillSlots: stringArray(pet.petSkillSlots),
    passiveSkillIds: stringArray(pet.passiveSkillIds),
    schemaVersion: 1,
  };
}

function petBattleStateIsAvailable(pet, activePetInstanceId = "") {
  if (petIsActiveBattlePet(pet, activePetInstanceId)) {
    return true;
  }
  const state = String(pet.state || pet.status || pet.battleState || "").trim();
  return state === BATTLE_PET_STATE_STANDBY;
}

function petIsActiveBattlePet(pet, activePetInstanceId = "") {
  const petId = String(pet && (pet.instanceId || pet.petId || pet.id) || "").trim();
  if (petId !== "" && petId === String(activePetInstanceId || "").trim()) {
    return true;
  }
  const state = String(pet && (pet.state || pet.status || pet.battleState) || "").trim();
  return state === BATTLE_PET_STATE_BATTLE;
}

function stringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function uniqueStringArray(value) {
  const result = [];
  for (const item of stringArray(value)) {
    if (!result.includes(item)) {
      result.push(item);
    }
  }
  return result;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Number(fallback || 1);
  }
  return parsed;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return Math.max(min, Math.min(max, Number(fallback || max)));
  }
  return Math.max(min, Math.min(max, parsed));
}

function battleComboRateOverrideValue(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  const rate = parsed > 1 ? parsed / 100 : parsed;
  return Math.max(0, Math.min(1, rate));
}

function nonNegativeOptionalNumber(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.trunc(parsed);
}

function createPartyForLeader(data, leaderAccountId, now, randomId) {
  const party = {
    partyId: `party_${randomId()}`,
    leaderAccountId,
    memberAccountIds: [leaderAccountId],
    createdAt: isoNow(now),
    updatedAt: isoNow(now),
    schemaVersion: 1,
  };
  data.parties[party.partyId] = party;
  return party;
}

function partyForAccount(data, accountId) {
  return Object.values(data.parties).find((party) => (
    party &&
    Array.isArray(party.memberAccountIds) &&
    party.memberAccountIds.includes(accountId)
  )) || null;
}

function partyMemberFollowSnapshotPosition(data, account, payload, now) {
  const party = partyForAccount(data, account.accountId);
  if (!party || party.leaderAccountId === account.accountId) {
    return null;
  }
  const currentPosition = data.playerPositions[account.accountId] || null;
  const leaderPosition = data.playerPositions[party.leaderAccountId] || null;
  const clientPosition = normalizePlayerPositionPayload(payload, account, now);
  const basePosition = currentPosition || leaderPosition || clientPosition;
  if (!basePosition || !basePosition.mapId) {
    return null;
  }
  let facing = String(basePosition.facing || "south").trim().toLowerCase();
  const requestedFacing = String(payload.facing || "").trim().toLowerCase();
  if (POSITION_FACING_VALUES.has(requestedFacing)) {
    facing = requestedFacing;
  } else if (!POSITION_FACING_VALUES.has(facing)) {
    facing = "south";
  }
  return {
    accountId: account.accountId,
    username: account.username,
    displayName: account.displayName,
    mapId: String(basePosition.mapId || "").slice(0, POSITION_MAP_ID_MAX_LENGTH),
    cellX: clampInt(basePosition.cellX, -9999, 9999, 0),
    cellY: clampInt(basePosition.cellY, -9999, 9999, 0),
    facing,
    moving: false,
    movementSeq: Math.max(0, Math.trunc(Number(basePosition.movementSeq || 0))),
    authority: "party_follow",
    updatedAt: isoNow(now),
    schemaVersion: 1,
  };
}

function applyPartyFollowForLeaderPositionChange(data, party, leaderAccountId, previousLeaderPosition, leaderPosition, now) {
  if (!party || party.leaderAccountId !== leaderAccountId || !Array.isArray(party.memberAccountIds)) {
    return [];
  }
  if (!previousLeaderPosition || !leaderPosition || !partyPositionMoved(previousLeaderPosition, leaderPosition)) {
    return [];
  }
  const leaderChangedMap = String(previousLeaderPosition.mapId || "") !== String(leaderPosition.mapId || "");
  let trailPosition = leaderChangedMap ? leaderPosition : previousLeaderPosition;
  const updated = [];
  for (const memberAccountId of party.memberAccountIds) {
    if (memberAccountId === leaderAccountId) {
      continue;
    }
    const account = accountById(data, memberAccountId);
    if (!account || !trailPosition || !trailPosition.mapId) {
      continue;
    }
    const previousFollowerPosition = data.playerPositions[memberAccountId] || null;
    const nextPosition = partyFollowPositionFromTrail(account, trailPosition, previousFollowerPosition, now);
    if (!nextPosition) {
      continue;
    }
    data.playerPositions[memberAccountId] = nextPosition;
    updated.push(nextPosition);
    if (!leaderChangedMap) {
      trailPosition = previousFollowerPosition ? publicPlayerPosition(previousFollowerPosition) : publicPlayerPosition(nextPosition);
    }
  }
  return updated;
}

function partyFollowPositionFromTrail(account, trailPosition, previousFollowerPosition, now) {
  if (!account || !trailPosition || !trailPosition.mapId) {
    return null;
  }
  const moved = !previousFollowerPosition || partyPositionMoved(previousFollowerPosition, trailPosition);
  return {
    accountId: account.accountId,
    username: account.username,
    displayName: account.displayName,
    mapId: String(trailPosition.mapId || "").slice(0, POSITION_MAP_ID_MAX_LENGTH),
    cellX: clampInt(trailPosition.cellX, -9999, 9999, 0),
    cellY: clampInt(trailPosition.cellY, -9999, 9999, 0),
    facing: partyFollowFacing(previousFollowerPosition, trailPosition),
    moving: false,
    movementSeq: Math.max(0, Math.trunc(Number(previousFollowerPosition && previousFollowerPosition.movementSeq || 0))) + (moved ? 1 : 0),
    authority: "party_follow",
    updatedAt: isoNow(now),
    schemaVersion: 1,
  };
}

function partyPositionMoved(a, b) {
  return (
    String(a.mapId || "") !== String(b.mapId || "") ||
    Number(a.cellX || 0) !== Number(b.cellX || 0) ||
    Number(a.cellY || 0) !== Number(b.cellY || 0)
  );
}

function partyFollowFacing(previousPosition, nextPosition) {
  if (!previousPosition || String(previousPosition.mapId || "") !== String(nextPosition.mapId || "")) {
    const fallback = String(nextPosition.facing || "south").trim().toLowerCase();
    return POSITION_FACING_VALUES.has(fallback) ? fallback : "south";
  }
  const dx = Math.sign(Number(nextPosition.cellX || 0) - Number(previousPosition.cellX || 0));
  const dy = Math.sign(Number(nextPosition.cellY || 0) - Number(previousPosition.cellY || 0));
  if (dx > 0 && dy < 0) return "northeast";
  if (dx > 0 && dy > 0) return "southeast";
  if (dx < 0 && dy > 0) return "southwest";
  if (dx < 0 && dy < 0) return "northwest";
  if (dx > 0) return "east";
  if (dx < 0) return "west";
  if (dy > 0) return "south";
  if (dy < 0) return "north";
  const fallback = String(previousPosition.facing || nextPosition.facing || "south").trim().toLowerCase();
  return POSITION_FACING_VALUES.has(fallback) ? fallback : "south";
}

function activeBattleRoomForAccount(data, accountId) {
  return Object.values(data.battleRooms).find((room) => (
    room &&
    room.status !== "closed" &&
    Array.isArray(room.participantAccountIds) &&
    room.participantAccountIds.includes(accountId)
  )) || null;
}

function latestClosedBattleRoomForAccount(data, accountId, now = Date.now) {
  const normalizedAccountId = String(accountId || "");
  if (normalizedAccountId === "") {
    return null;
  }
  const nowMs = now();
  return Object.values(data.battleRooms)
    .filter((room) => {
      if (!room || room.status !== BATTLE_ROOM_CLOSED || !Array.isArray(room.participantAccountIds)) {
        return false;
      }
      if (!room.participantAccountIds.includes(normalizedAccountId)) {
        return false;
      }
      if (!battleClosedRoomHasReplayPayload(room)) {
        return false;
      }
      const closedMs = Date.parse(room.closedAt || room.updatedAt || "");
      return Number.isFinite(closedMs) && nowMs - closedMs <= BATTLE_CLOSED_ROOM_REPLAY_MS;
    })
    .sort((a, b) => Date.parse(b.closedAt || b.updatedAt || "") - Date.parse(a.closedAt || a.updatedAt || ""))[0] || null;
}

function battleClosedRoomHasReplayPayload(room) {
  const battle = room && room.battle && typeof room.battle === "object" && !Array.isArray(room.battle) ? room.battle : {};
  const lastEventList = battle.lastEventList && typeof battle.lastEventList === "object" && !Array.isArray(battle.lastEventList)
    ? battle.lastEventList
    : {};
  if (String(lastEventList.kind || "") === "battle_event_list") {
    return true;
  }
  const writeback = battle.profileWriteback && typeof battle.profileWriteback === "object" && !Array.isArray(battle.profileWriteback)
    ? battle.profileWriteback
    : {};
  return Array.isArray(writeback.profiles) && writeback.profiles.length > 0;
}

function battleRoomConnectionStateForMutation(room) {
  if (!room.connectionState || typeof room.connectionState !== "object" || Array.isArray(room.connectionState)) {
    room.connectionState = {};
  }
  for (const accountId of Array.isArray(room.participantAccountIds) ? room.participantAccountIds : []) {
    if (!room.connectionState[accountId] || typeof room.connectionState[accountId] !== "object" || Array.isArray(room.connectionState[accountId])) {
      room.connectionState[accountId] = {
        connected: true,
        lastSeenAt: room.updatedAt || room.createdAt || "",
        disconnectedAt: "",
        schemaVersion: 1,
      };
    }
  }
  return room.connectionState;
}

function markBattleConnectionForAccount(data, accountId, connected, now = () => Date.now()) {
  let changed = false;
  const timestamp = isoNow(now);
  for (const room of Object.values(data.battleRooms)) {
    if (
      !room ||
      room.status === BATTLE_ROOM_CLOSED ||
      !Array.isArray(room.participantAccountIds) ||
      !room.participantAccountIds.includes(accountId)
    ) {
      continue;
    }
    const state = battleRoomConnectionStateForMutation(room);
    const previous = state[accountId] || {};
    const next = {
      ...previous,
      connected: Boolean(connected),
      lastSeenAt: timestamp,
      disconnectedAt: connected ? "" : (previous.disconnectedAt || timestamp),
      schemaVersion: 1,
    };
    if (connected && previous.disconnectedAt) {
      const battle = battleRoomBattleStateForMutation(room, now);
      if (String(battle.phase || "") === BATTLE_PHASE_COMMAND) {
        battle.commandDeadlineAt = new Date(now() + BATTLE_COMMAND_TIMEOUT_MS).toISOString();
        battle.updatedAt = timestamp;
      }
    }
    if (
      Boolean(previous.connected) !== next.connected ||
      String(previous.disconnectedAt || "") !== String(next.disconnectedAt || "") ||
      String(previous.lastSeenAt || "") !== String(next.lastSeenAt || "")
    ) {
      state[accountId] = next;
      room.updatedAt = timestamp;
      changed = true;
    }
  }
  return changed;
}

function battleRoomReconnectExpiredAccountIds(room, now) {
  if (!room || room.status === BATTLE_ROOM_CLOSED) {
    return [];
  }
  const state = battleRoomConnectionStateForMutation(room);
  const nowMs = now();
  return (Array.isArray(room.participantAccountIds) ? room.participantAccountIds : [])
    .filter((accountId) => {
      const entry = state[accountId] || {};
      if (entry.connected || !entry.disconnectedAt) {
        return false;
      }
      const disconnectedMs = Date.parse(entry.disconnectedAt);
      return Number.isFinite(disconnectedMs) && disconnectedMs + BATTLE_RECONNECT_GRACE_MS <= nowMs;
    });
}

function battleRoomHasDisconnectedParticipant(room) {
  if (!room || room.status === BATTLE_ROOM_CLOSED) {
    return false;
  }
  const state = battleRoomConnectionStateForMutation(room);
  return (Array.isArray(room.participantAccountIds) ? room.participantAccountIds : [])
    .some((accountId) => {
      const entry = state[accountId] || {};
      return !entry.connected && Boolean(entry.disconnectedAt);
    });
}

function nextBattleMaintenanceDelayMs(data, now) {
  if (!data) {
    return null;
  }
  const nowMs = now();
  let nextAt = Number.POSITIVE_INFINITY;
  for (const invite of Object.values(data.battleInvites || {})) {
    if (!invite || invite.status !== BATTLE_INVITE_PENDING || !invite.expiresAt) {
      continue;
    }
    const expiresMs = Date.parse(invite.expiresAt);
    if (Number.isFinite(expiresMs)) {
      nextAt = Math.min(nextAt, expiresMs);
    }
  }
  for (const room of Object.values(data.battleRooms || {})) {
    if (!room || room.status === BATTLE_ROOM_CLOSED) {
      continue;
    }
    const battle = battleRoomBattleStateForMutation(room, now);
    const hasDisconnectedParticipant = battleRoomHasDisconnectedParticipant(room);
    if (!hasDisconnectedParticipant && String(battle.phase || "") === BATTLE_PHASE_COMMAND && battle.commandDeadlineAt) {
      const commandMs = Date.parse(battle.commandDeadlineAt);
      if (Number.isFinite(commandMs)) {
        nextAt = Math.min(nextAt, commandMs);
      }
    }
    const state = battleRoomConnectionStateForMutation(room);
    for (const accountId of Array.isArray(room.participantAccountIds) ? room.participantAccountIds : []) {
      const entry = state[accountId] || {};
      if (entry.connected || !entry.disconnectedAt) {
        continue;
      }
      const disconnectedMs = Date.parse(entry.disconnectedAt);
      if (Number.isFinite(disconnectedMs)) {
        nextAt = Math.min(nextAt, disconnectedMs + BATTLE_RECONNECT_GRACE_MS);
      }
    }
  }
  if (!Number.isFinite(nextAt)) {
    return null;
  }
  return Math.max(0, nextAt - nowMs);
}

function battleRoomEntryCheck(data, invite) {
  const challengerPosition = data.playerPositions[invite.fromAccountId] || null;
  const opponentPosition = data.playerPositions[invite.toAccountId] || null;
  if (!challengerPosition || !opponentPosition || !challengerPosition.mapId || !opponentPosition.mapId) {
    return fail("battle_position_missing", "切磋前需要双方同步当前位置。");
  }
  if (String(challengerPosition.mapId) !== String(opponentPosition.mapId)) {
    return fail("battle_map_mismatch", "双方不在同一张地图，无法开始切磋。");
  }
  if (challengerPosition.moving || opponentPosition.moving) {
    return fail("battle_player_moving", "双方需要停稳后才能开始切磋。");
  }
  const dx = Math.abs(Number(challengerPosition.cellX || 0) - Number(opponentPosition.cellX || 0));
  const dy = Math.abs(Number(challengerPosition.cellY || 0) - Number(opponentPosition.cellY || 0));
  const distanceCells = Math.max(dx, dy);
  if (distanceCells > BATTLE_ROOM_ENTRY_MAX_DISTANCE) {
    return fail("battle_distance_too_far", "距离太远，无法开始切磋。", {
      distanceCells,
      maxDistanceCells: BATTLE_ROOM_ENTRY_MAX_DISTANCE,
    });
  }
  return ok({
    entry: {
      mapId: String(challengerPosition.mapId),
      distanceCells,
      maxDistanceCells: BATTLE_ROOM_ENTRY_MAX_DISTANCE,
      challengerPosition: publicPlayerPosition(challengerPosition),
      opponentPosition: publicPlayerPosition(opponentPosition),
      schemaVersion: 1,
    },
  });
}

function partyEncounterEntry(data, party) {
  const leaderPosition = data.playerPositions[String(party && party.leaderAccountId || "")] || null;
  const memberPositions = {};
  for (const accountId of Array.isArray(party && party.memberAccountIds) ? party.memberAccountIds : []) {
    const position = data.playerPositions[String(accountId || "")] || null;
    if (position) {
      memberPositions[String(accountId || "")] = publicPlayerPosition(position);
    }
  }
  return {
    mapId: leaderPosition ? String(leaderPosition.mapId || "") : "",
    leaderPosition: leaderPosition ? publicPlayerPosition(leaderPosition) : null,
    memberPositions,
    schemaVersion: 1,
  };
}

function partyEncounterSnapshotFromPayload(payload = {}, participants = []) {
  const zone = payload.encounterZone && typeof payload.encounterZone === "object" && !Array.isArray(payload.encounterZone)
    ? clone(payload.encounterZone)
    : {};
  const formationTemplate = String(zone.formationTemplate || "");
  const authoritativeFallback = partyEncounterEnemyCountFallbackFromParticipants(participants);
  const selectedWildPetsSource = Array.isArray(zone.selectedWildPets)
    ? zone.selectedWildPets
    : (Array.isArray(zone.fixedWildPets) ? zone.fixedWildPets : []);
  const rawEnemyCount = clientSelectedEncounterCountNeedsServerFallback(zone)
    ? authoritativeFallback
    : payload.enemyCount || zone.enemyCount || zone.selectedEnemyCount || selectedWildPetsSource.length;
  const enemyCount = clampInt(rawEnemyCount, 1, BATTLE_PARTY_PVE_PLAYER_SLOTS.length * 2, formationTemplate === "10v10" ? 10 : authoritativeFallback);
  return {
    zoneId: String(zone.id || ""),
    groupId: String(zone.encounterGroupId || ""),
    interactionId: String(zone.interactionId || zone.sourceInteractionId || ""),
    sourceInteractionId: String(zone.sourceInteractionId || zone.interactionId || ""),
    sourceInteractionName: String(zone.sourceInteractionName || ""),
    name: String(zone.name || "野外"),
    formationTemplate: String(formationTemplate || (enemyCount > 1 ? "10v10" : "")),
    enemyCount,
    selectedWildPet: zone.selectedWildPet && typeof zone.selectedWildPet === "object" && !Array.isArray(zone.selectedWildPet) ? clone(zone.selectedWildPet) : null,
    selectedWildPets: selectedWildPetsSource.filter((item) => item && typeof item === "object" && !Array.isArray(item)).map((item) => clone(item)),
    wildPetPool: Array.isArray(zone.wildPetPool)
      ? zone.wildPetPool.filter((item) => item && typeof item === "object" && !Array.isArray(item)).map((item) => clone(item))
      : [],
    schemaVersion: 1,
  };
}

function clientSelectedEncounterCountNeedsServerFallback(zone) {
  if (!zone || typeof zone !== "object" || Array.isArray(zone)) {
    return false;
  }
  const hasSelectedEnemyCount = Object.prototype.hasOwnProperty.call(zone, "selectedEnemyCount");
  const hasConfiguredEnemyCount = Object.prototype.hasOwnProperty.call(zone, "enemyCount");
  const hasRandomEnemyRange = Object.prototype.hasOwnProperty.call(zone, "enemyCountMin")
    || Object.prototype.hasOwnProperty.call(zone, "enemyCountMax");
  const fixedWildPets = Array.isArray(zone.fixedWildPets) ? zone.fixedWildPets : [];
  return hasSelectedEnemyCount
    && !hasConfiguredEnemyCount
    && !hasRandomEnemyRange
    && fixedWildPets.length < 1
    && String(zone.formationTemplate || "") !== "10v10";
}

function partyEncounterEnemyCountFallbackFromParticipants(participants = []) {
  return partyEncounterCharacterCountFromParticipants(participants) > 1 ? 10 : 1;
}

function partyEncounterCharacterCountFromParticipants(participants = []) {
  const activeParticipants = Array.isArray(participants)
    ? participants.slice(0, BATTLE_PARTY_PVE_PLAYER_SLOTS.length).filter((participant) => participant && String(participant.accountId || "") !== "")
    : [];
  const usedSlots = new Set();
  activeParticipants.forEach((_participant, index) => {
    usedSlots.add(BATTLE_PARTY_PVE_PLAYER_SLOTS[index] || 3);
  });
  const partnerCandidates = [];
  for (const participant of activeParticipants) {
    const snapshot = participant && participant.teamSnapshot && typeof participant.teamSnapshot === "object" ? participant.teamSnapshot : {};
    const partners = Array.isArray(snapshot.trainingPartners) ? snapshot.trainingPartners : [];
    for (const partner of partners) {
      if (partner && typeof partner === "object" && !Array.isArray(partner)) {
        partnerCandidates.push(partner);
      }
    }
  }
  const availablePartnerSlots = BATTLE_PARTY_PVE_PARTNER_SLOTS.filter((slotNumber) => !usedSlots.has(slotNumber));
  return activeParticipants.length + Math.min(partnerCandidates.length, availablePartnerSlots.length);
}

function createBattleRoomBattleState(room, now) {
  const actors = battleRoomActors(room);
  return {
    round: 1,
    phase: BATTLE_PHASE_COMMAND,
    turnSeq: 0,
    requiredAccountIds: requiredBattleCommandAccountIds(room),
    submittedAccountIds: [],
    requiredActorIds: requiredBattleCommandActorIdsFromActors(actors),
    submittedActorIds: [],
    commands: {},
    actors,
    lastEventList: null,
    eventLog: [],
    result: null,
    commandDeadlineAt: new Date(now() + BATTLE_COMMAND_TIMEOUT_MS).toISOString(),
    updatedAt: isoNow(now),
    schemaVersion: 1,
  };
}

function battleRoomBattleStateForMutation(room, now) {
  if (!room.battle || typeof room.battle !== "object" || Array.isArray(room.battle)) {
    room.battle = createBattleRoomBattleState(room, now);
  }
  if (!Array.isArray(room.battle.actors) || room.battle.actors.length === 0) {
    room.battle.actors = battleRoomActors(room);
  }
  if (!room.battle.commands || typeof room.battle.commands !== "object" || Array.isArray(room.battle.commands)) {
    room.battle.commands = {};
  }
  room.battle.requiredAccountIds = requiredBattleCommandAccountIds(room);
  room.battle.requiredActorIds = requiredBattleCommandActorIds(room.battle);
  room.battle.submittedActorIds = submittedBattleCommandActorIds(room.battle);
  room.battle.submittedAccountIds = submittedBattleCommandAccountIds(room.battle);
  room.battle.phase = String(room.battle.phase || BATTLE_PHASE_COMMAND);
  room.battle.round = Math.max(1, Number(room.battle.round || 1));
  room.battle.turnSeq = Math.max(0, Number(room.battle.turnSeq || 0));
  if (!room.battle.commandDeadlineAt) {
    room.battle.commandDeadlineAt = new Date(now() + BATTLE_COMMAND_TIMEOUT_MS).toISOString();
  }
  return room.battle;
}

function battleRoomActors(room) {
  if (String(room && room.mode || BATTLE_MODE_DUEL) === BATTLE_MODE_PARTY_PVE) {
    return partyPveBattleRoomActors(room);
  }
  const participants = Array.isArray(room.participants) ? room.participants : [];
  const actors = [];
  participants.forEach((participant, index) => {
    const side = String(participant.side || (index === 0 ? "challenger" : "opponent"));
    const playerActor = battlePlayerActorFromParticipant(participant, side);
    if (playerActor.accountId !== "") {
      actors.push(playerActor);
    }
    const battlePets = participant.teamSnapshot && Array.isArray(participant.teamSnapshot.battlePets)
      ? participant.teamSnapshot.battlePets
      : [];
    battlePets
      .filter((pet) => pet && (pet.activeInBattle || String(pet.state || "") === BATTLE_PET_STATE_BATTLE))
      .slice(0, BATTLE_ACTIVE_PET_MAX_PER_PARTICIPANT)
      .forEach((pet, petIndex) => {
      const petActor = battlePetActorFromParticipant(participant, side, pet, petIndex);
      if (petActor.accountId !== "" && petActor.petId !== "") {
        actors.push(petActor);
      }
    });
  });
  return actors;
}

function battlePlayerActorFromParticipant(participant, side, options = {}) {
  const player = participant.teamSnapshot && participant.teamSnapshot.player && typeof participant.teamSnapshot.player === "object"
    ? participant.teamSnapshot.player
    : {};
  const level = positiveNumber(player.level || (participant.teamSnapshot && participant.teamSnapshot.playerLevel), 1);
  const maxHp = positiveNumber(player.maxHp, BATTLE_ACTOR_MAX_HP + Math.max(0, level - 1) * 4);
  const hp = clampNumber(player.hp, 1, maxHp, maxHp);
  const slotNumber = clampInt(options.slotNumber, 1, BATTLE_PARTY_PVE_PLAYER_SLOTS.length, 3);
  const slotId = String(options.slotId || `${side}.back.${slotNumber}`);
  return {
    actorId: String(options.actorId || `duel_${side}_player`),
    accountId: String(participant.accountId || ""),
    username: String(participant.username || ""),
    displayName: String(player.name || participant.displayName || participant.username || ""),
    side,
    kind: BATTLE_ACTOR_KIND_PLAYER,
    slotId,
    slotNumber,
    level,
    hp,
    maxHp,
    speed: positiveNumber(player.quick, side === "challenger" ? 70 : 68),
    attack: positiveNumber(player.attack, DEFAULT_PLAYER_BATTLE_STATS.attack),
    defense: positiveNumber(player.defense, DEFAULT_PLAYER_BATTLE_STATS.defense),
    guarding: false,
    defeated: hp <= 0,
    ...battleActorRideFieldsFromPlayerSnapshot(player),
    spiritIds: stringArray(player.spiritIds),
    comboRateOverride: battleComboRateOverrideValue(player.comboRateOverride),
    schemaVersion: 1,
  };
}

function battlePetActorFromParticipant(participant, side, pet, petIndex, options = {}) {
  const slotNumber = clampInt(options.slotNumber, 1, BATTLE_PARTY_PVE_PLAYER_SLOTS.length, petIndex + 3);
  const slotId = String(options.slotId || `${side}.front.${slotNumber}`);
  const maxHp = positiveNumber(pet.maxHp, DEFAULT_PET_BATTLE_STATS.maxHp);
  const hp = clampNumber(pet.hp, 1, maxHp, maxHp);
  const petId = String(pet.petId || pet.instanceId || pet.id || "").trim();
  return {
    actorId: String(options.actorId || `duel_${side}_pet_${petId || petIndex + 1}`),
    accountId: String(participant.accountId || ""),
    username: String(participant.username || ""),
    displayName: String(pet.name || "宠物"),
    side,
    kind: BATTLE_ACTOR_KIND_PET,
    petId,
    activeInBattle: true,
    formId: String(pet.formId || pet.speciesId || ""),
    speciesId: String(pet.speciesId || pet.formId || ""),
    petState: BATTLE_PET_STATE_BATTLE,
    slotId,
    slotNumber,
    level: positiveNumber(pet.level, 1),
    hp,
    maxHp,
    speed: positiveNumber(pet.quick, DEFAULT_PET_BATTLE_STATS.quick),
    attack: positiveNumber(pet.attack, DEFAULT_PET_BATTLE_STATS.attack),
    defense: positiveNumber(pet.defense, DEFAULT_PET_BATTLE_STATS.defense),
    guarding: false,
    defeated: hp <= 0,
    activeSkillIds: stringArray(pet.activeSkillIds),
    petSkillSlots: stringArray(pet.petSkillSlots),
    passiveSkillIds: stringArray(pet.passiveSkillIds),
    comboRateOverride: battleComboRateOverrideValue(pet.comboRateOverride),
    schemaVersion: 1,
  };
}

function battleActorRideFieldsFromPlayerSnapshot(player) {
  const ridePetInstanceId = String(player && player.ridePetInstanceId || "").trim();
  const ridePetMaxHp = Math.max(0, Math.trunc(Number(player && player.ridePetMaxHp || 0)));
  const ridePetHp = clampNumber(player && player.ridePetHp, 0, ridePetMaxHp, ridePetMaxHp);
  if (ridePetInstanceId === "" || ridePetMaxHp <= 0 || ridePetHp <= 0) {
    return {};
  }
  return {
    ridePetInstanceId,
    ridePetName: String(player.ridePetName || "骑宠"),
    ridePetFormId: String(player.ridePetFormId || ""),
    ridePetLevel: positiveNumber(player.ridePetLevel, 1),
    ridePetHp,
    ridePetMaxHp,
    ridePetBattleState: String(player.ridePetBattleState || BATTLE_PET_STATE_RIDING),
  };
}

function partyPveBattleRoomActors(room) {
  const participants = Array.isArray(room.participants) ? room.participants : [];
  const actors = [];
  const usedSlots = new Set();
  participants.slice(0, BATTLE_PARTY_PVE_PLAYER_SLOTS.length).forEach((participant, index) => {
    const slotNumber = BATTLE_PARTY_PVE_PLAYER_SLOTS[index] || 3;
    usedSlots.add(slotNumber);
    const playerActor = battlePlayerActorFromParticipant(participant, BATTLE_SIDE_ALLY, {
      actorId: `party_pve_player_${index + 1}`,
      slotId: `${BATTLE_SIDE_ALLY}.back.${slotNumber}`,
      slotNumber,
    });
    if (playerActor.accountId !== "") {
      actors.push(playerActor);
    }
    const battlePets = participant.teamSnapshot && Array.isArray(participant.teamSnapshot.battlePets)
      ? participant.teamSnapshot.battlePets
      : [];
    battlePets
      .filter((pet) => pet && (pet.activeInBattle || String(pet.state || "") === BATTLE_PET_STATE_BATTLE))
      .slice(0, BATTLE_ACTIVE_PET_MAX_PER_PARTICIPANT)
      .forEach((pet, petIndex) => {
        const petActor = battlePetActorFromParticipant(participant, BATTLE_SIDE_ALLY, pet, petIndex, {
          actorId: `party_pve_pet_${index + 1}_${sanitizeBattleActorIdPart(pet.petId || pet.instanceId || petIndex + 1)}`,
          slotId: `${BATTLE_SIDE_ALLY}.front.${slotNumber}`,
          slotNumber,
        });
        if (petActor.accountId !== "" && petActor.petId !== "") {
          actors.push(petActor);
        }
      });
  });
  const partnerCandidates = [];
  for (const participant of participants) {
    const snapshot = participant && participant.teamSnapshot && typeof participant.teamSnapshot === "object" ? participant.teamSnapshot : {};
    const partners = Array.isArray(snapshot.trainingPartners) ? snapshot.trainingPartners : [];
    for (const partner of partners) {
      if (partner && typeof partner === "object" && !Array.isArray(partner)) {
        partnerCandidates.push({participant, partner});
      }
    }
  }
  const availablePartnerSlots = BATTLE_PARTY_PVE_PARTNER_SLOTS.filter((slotNumber) => !usedSlots.has(slotNumber));
  for (let index = 0; index < availablePartnerSlots.length && index < partnerCandidates.length; index += 1) {
    const slotNumber = availablePartnerSlots[index];
    const candidate = partnerCandidates[index];
    const partnerActor = battleTrainingPartnerActorFromSnapshot(candidate.participant, candidate.partner, index, slotNumber);
    if (partnerActor.actorId) {
      actors.push(partnerActor);
    }
    const pet = candidate.partner && candidate.partner.pet && typeof candidate.partner.pet === "object" ? candidate.partner.pet : null;
    if (pet) {
      const petActor = battleTrainingPartnerPetActorFromSnapshot(candidate.participant, candidate.partner, pet, index, slotNumber);
      if (petActor.actorId) {
        actors.push(petActor);
      }
    }
  }
  return actors.concat(partyPveEnemyActors(room));
}

function battleTrainingPartnerActorFromSnapshot(participant, partner, index, slotNumber) {
  const maxHp = positiveNumber(partner.maxHp, DEFAULT_PLAYER_BATTLE_STATS.maxHp);
  const hp = clampNumber(partner.hp, 1, maxHp, maxHp);
  const partnerId = String(partner.partnerId || partner.id || `training_partner_${index + 1}`).trim();
  return {
    actorId: `party_pve_partner_${index + 1}_${sanitizeBattleActorIdPart(partnerId)}`,
    accountId: "",
    ownerAccountId: String(participant && participant.accountId || ""),
    partnerId,
    username: "",
    displayName: String(partner.name || `伙伴${index + 1}`),
    side: BATTLE_SIDE_ALLY,
    kind: BATTLE_ACTOR_KIND_PLAYER,
    slotId: `${BATTLE_SIDE_ALLY}.back.${slotNumber}`,
    slotNumber,
    level: positiveNumber(partner.level, 1),
    hp,
    maxHp,
    speed: positiveNumber(partner.quick, DEFAULT_PLAYER_BATTLE_STATS.quick),
    attack: positiveNumber(partner.attack, DEFAULT_PLAYER_BATTLE_STATS.attack),
    defense: positiveNumber(partner.defense, DEFAULT_PLAYER_BATTLE_STATS.defense),
    guarding: false,
    defeated: hp <= 0,
    schemaVersion: 1,
  };
}

function battleTrainingPartnerPetActorFromSnapshot(participant, partner, pet, index, slotNumber) {
  const maxHp = positiveNumber(pet.maxHp, DEFAULT_PET_BATTLE_STATS.maxHp);
  const hp = clampNumber(pet.hp, 1, maxHp, maxHp);
  const petId = String(pet.petId || pet.instanceId || pet.id || `training_partner_pet_${index + 1}`).trim();
  const partnerId = String(partner && (partner.partnerId || partner.id) || `training_partner_${index + 1}`).trim();
  return {
    actorId: `party_pve_partner_pet_${index + 1}_${sanitizeBattleActorIdPart(petId)}`,
    accountId: "",
    ownerAccountId: String(participant && participant.accountId || ""),
    partnerId,
    username: "",
    displayName: String(pet.name || "伙伴宠物"),
    side: BATTLE_SIDE_ALLY,
    kind: BATTLE_ACTOR_KIND_PET,
    petId,
    activeInBattle: true,
    formId: String(pet.formId || pet.speciesId || ""),
    speciesId: String(pet.speciesId || pet.formId || ""),
    petState: BATTLE_PET_STATE_BATTLE,
    slotId: `${BATTLE_SIDE_ALLY}.front.${slotNumber}`,
    slotNumber,
    level: positiveNumber(pet.level, 1),
    hp,
    maxHp,
    speed: positiveNumber(pet.quick, DEFAULT_PET_BATTLE_STATS.quick),
    attack: positiveNumber(pet.attack, DEFAULT_PET_BATTLE_STATS.attack),
    defense: positiveNumber(pet.defense, DEFAULT_PET_BATTLE_STATS.defense),
    guarding: false,
    defeated: hp <= 0,
    activeSkillIds: stringArray(pet.activeSkillIds),
    petSkillSlots: stringArray(pet.petSkillSlots),
    passiveSkillIds: stringArray(pet.passiveSkillIds),
    schemaVersion: 1,
  };
}

function partyPveEnemyActors(room) {
  const encounter = room && room.encounter && typeof room.encounter === "object" && !Array.isArray(room.encounter) ? room.encounter : {};
  const enemyCount = clampInt(encounter.enemyCount, 1, BATTLE_PARTY_PVE_PLAYER_SLOTS.length * 2, 1);
  const actors = [];
  for (let index = 0; index < enemyCount; index += 1) {
    const wildPet = partyPveWildPetEntry(encounter, index);
    const battleSlotNumber = index + 1;
    const frontRow = battleSlotNumber <= BATTLE_PARTY_PVE_PLAYER_SLOTS.length;
    const slotNumber = frontRow ? battleSlotNumber : battleSlotNumber - BATTLE_PARTY_PVE_PLAYER_SLOTS.length;
    const row = frontRow ? "front" : "back";
    const maxHp = positiveNumber(wildPet.maxHp, 80) + index * 4;
    const hp = maxHp;
    actors.push({
      actorId: `party_pve_enemy_${row}_${slotNumber}`,
      accountId: "",
      username: "",
      displayName: `${wildPet.name}${battleSlotNumber}`,
      side: BATTLE_SIDE_ENEMY,
      kind: BATTLE_ACTOR_KIND_WILD_PET,
      petId: "",
      activeInBattle: true,
      formId: String(wildPet.formId || "wuli_normal_orange_fire10"),
      speciesId: String(wildPet.speciesId || wildPet.formId || "wuli_normal_orange_fire10"),
      lineId: String(wildPet.lineId || ""),
      petState: BATTLE_PET_STATE_BATTLE,
      slotId: `${BATTLE_SIDE_ENEMY}.${row}.${slotNumber}`,
      slotNumber,
      level: positiveNumber(wildPet.level, 1),
      hp,
      maxHp,
      speed: positiveNumber(wildPet.quick, 48) + (slotNumber - 1) * 2,
      attack: positiveNumber(wildPet.attack, DEFAULT_PET_BATTLE_STATS.attack),
      defense: positiveNumber(wildPet.defense, DEFAULT_PET_BATTLE_STATS.defense),
      expReward: battleEnemyBaseExpFromEntry(wildPet),
      guarding: false,
      defeated: false,
      activeSkillIds: stringArray(wildPet.activeSkillIds),
      petSkillSlots: stringArray(wildPet.petSkillSlots),
      passiveSkillIds: stringArray(wildPet.passiveSkillIds),
      comboRateOverride: battleComboRateOverrideValue(wildPet.comboRateOverride),
      catchable: Boolean(wildPet.catchable),
      captureDifficulty: Math.max(1, Math.trunc(Number(wildPet.captureDifficulty || 42))),
      captureChanceOverride: battleOptionalChanceValue(wildPet.captureChanceOverride),
      captured: false,
      schemaVersion: 1,
    });
  }
  return actors;
}

function partyPveWildPetEntry(encounter, index) {
  const selectedWildPets = Array.isArray(encounter.selectedWildPets) ? encounter.selectedWildPets : [];
  if (selectedWildPets[index] && typeof selectedWildPets[index] === "object" && !Array.isArray(selectedWildPets[index])) {
    return normalizedServerWildPetEntry(selectedWildPets[index]);
  }
  if (encounter.selectedWildPet && typeof encounter.selectedWildPet === "object" && !Array.isArray(encounter.selectedWildPet)) {
    return normalizedServerWildPetEntry(encounter.selectedWildPet);
  }
  const wildPetPool = Array.isArray(encounter.wildPetPool) ? encounter.wildPetPool : [];
  for (const value of wildPetPool) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return normalizedServerWildPetEntry(value);
    }
  }
  return normalizedServerWildPetEntry({
    formId: "wuli_normal_orange_fire10",
    name: "野生乌力",
    level: 1,
    battleStats: {
      maxHp: 80,
      attack: 10,
      defense: 6,
      quick: 48,
    },
  });
}

function normalizedServerWildPetEntry(value) {
  const stats = value && value.battleStats && typeof value.battleStats === "object" && !Array.isArray(value.battleStats)
    ? value.battleStats
    : {};
  const formId = String(value && (value.formId || value.templateId) || "wuli_normal_orange_fire10");
  const template = petTemplateForFormId(formId);
  const maxHp = positiveNumber(stats.maxHp || value.maxHp || value.hp, 80);
  const explicitExpReward = nonNegativeOptionalNumber(value && (value.expReward || value.experience || value.exp));
  const capture = value && value.capture && typeof value.capture === "object" && !Array.isArray(value.capture) ? value.capture : {};
  return {
    formId,
    speciesId: String(value && (value.speciesId || value.templateId || value.formId) || formId),
    lineId: String(value && value.lineId || template.lineId || ""),
    name: String(value && value.name || "野生宠物"),
    level: positiveNumber(value && (value.level || value.levelMin), 1),
    hp: maxHp,
    maxHp,
    attack: positiveNumber(stats.attack || value.attack, DEFAULT_PET_BATTLE_STATS.attack),
    defense: positiveNumber(stats.defense || value.defense, DEFAULT_PET_BATTLE_STATS.defense),
    quick: positiveNumber(stats.quick || stats.agility || value.quick || value.agility, DEFAULT_PET_BATTLE_STATS.quick),
    ...(explicitExpReward > 0 ? {expReward: explicitExpReward} : {}),
    activeSkillIds: stringArray(value && value.activeSkillIds),
    petSkillSlots: stringArray(value && value.petSkillSlots),
    passiveSkillIds: stringArray(value && value.passiveSkillIds),
    comboRateOverride: battleComboRateOverrideValue(value && value.comboRateOverride),
    catchable: value && value.catchable === false ? false : capture.catchable !== false,
    captureDifficulty: Math.max(1, Math.trunc(Number(value && (value.captureDifficulty || value.difficulty) || capture.difficulty || 42))),
    captureChanceOverride: battleOptionalChanceValue(value && (value.captureChanceOverride || value.captureRateOverride || capture.chanceOverride)),
  };
}

function battleOptionalChanceValue(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return undefined;
  }
  return Math.max(0, Math.min(1, numberValue));
}

function battleEnemyBaseExpFromEntry(entry) {
  const explicit = Math.trunc(Number(entry && (entry.expReward || entry.experience || entry.exp) || 0));
  if (explicit > 0) {
    return explicit;
  }
  const maxHp = Math.max(1, Math.trunc(Number(entry && entry.maxHp || 1)));
  const attack = Math.max(1, Math.trunc(Number(entry && entry.attack || DEFAULT_PET_BATTLE_STATS.attack)));
  const defense = Math.max(1, Math.trunc(Number(entry && entry.defense || DEFAULT_PET_BATTLE_STATS.defense)));
  const quick = Math.max(1, Math.trunc(Number(entry && entry.quick || entry && entry.speed || DEFAULT_PET_BATTLE_STATS.quick)));
  return Math.max(1, Math.round(maxHp / 10) + attack + defense + Math.round(quick / 8));
}

function sanitizeBattleActorIdPart(value) {
  const text = String(value || "").trim().replace(/[^A-Za-z0-9_-]+/g, "_");
  return text || "actor";
}

function requiredBattleCommandAccountIds(room) {
  return Array.isArray(room.participantAccountIds) ? room.participantAccountIds.slice() : [];
}

function requiredBattleCommandActorIds(battle) {
  return requiredBattleCommandActorIdsFromActors(Array.isArray(battle.actors) ? battle.actors : [], battle.commands || {});
}

function requiredBattleCommandActorIdsFromActors(actors, commands = {}) {
  const switchPetAccountIds = battleSwitchPetCommandAccountIds(commands);
  return actors
    .filter((actor) => actor && Number(actor.hp || 0) > 0 && String(actor.accountId || "") !== "")
    .filter((actor) => {
      if (String(actor.kind || "") !== BATTLE_ACTOR_KIND_PET) {
        return true;
      }
      return !switchPetAccountIds.has(String(actor.accountId || ""));
    })
    .map((actor) => String(actor.actorId || ""))
    .filter(Boolean)
    .sort();
}

function battleSwitchPetCommandAccountIds(commands = {}) {
  const accountIds = new Set();
  for (const command of Object.values(commands || {})) {
    if (!command || typeof command !== "object") {
      continue;
    }
    if (String(command.actionKind || command.actionId || "") !== BATTLE_ACTION_SWITCH_PET) {
      continue;
    }
    const accountId = String(command.accountId || "");
    if (accountId) {
      accountIds.add(accountId);
    }
  }
  return accountIds;
}

function battleCommandValues(battle) {
  if (!battle || !battle.commands || typeof battle.commands !== "object" || Array.isArray(battle.commands)) {
    return [];
  }
  return Object.values(battle.commands).filter((command) => command && typeof command === "object");
}

function submittedBattleCommandActorIds(battle) {
  return battleCommandValues(battle)
    .map((command) => String(command.actorId || ""))
    .filter(Boolean)
    .sort();
}

function submittedBattleCommandAccountIds(battle) {
  const accountIds = new Set();
  for (const command of battleCommandValues(battle)) {
    const accountId = String(command.accountId || "");
    if (accountId) {
      accountIds.add(accountId);
    }
  }
  return Array.from(accountIds).sort();
}

function normalizeBattleCommandPayload(payload, data, room, battle, account, now, randomId) {
  const actor = battleCommandActorForPayload(payload, battle, account);
  if (!actor || Number(actor.hp || 0) <= 0) {
    return fail("battle_command_actor_missing", "当前无法提交战斗命令。");
  }
  if (!requiredBattleCommandActorIds(battle).includes(String(actor.actorId || ""))) {
    return fail("battle_command_actor_missing", "当前无法提交战斗命令。");
  }
  const action = normalizeBattleActionForActor(
    payload.actionId || payload.action || payload.command || payload.spiritId || BATTLE_ACTION_ATTACK,
    actor,
    payload.itemId || payload.item || payload.spiritId || ""
  );
  if (!action.ok) {
    return action;
  }
  let switchPet = null;
  let itemId = "";
  let captureToolId = "";
  if (action.actionKind === BATTLE_ACTION_SWITCH_PET) {
    const switchResult = battleSwitchPetForPayload(payload, room, battle, account);
    if (!switchResult.ok) {
      return switchResult;
    }
    switchPet = switchResult.pet;
  }
  if (action.actionKind === BATTLE_ACTION_ITEM) {
    itemId = String(action.itemId || action.actionId || "").trim();
    const itemResult = battleItemForCommand(room, account.accountId, itemId);
    if (!itemResult.ok) {
      return itemResult;
    }
  }
  if (action.actionKind === BATTLE_ACTION_CAPTURE) {
    captureToolId = normalizeBattleCaptureToolId(payload.captureToolId || payload.captureTool || payload.itemId || payload.item || "");
    const captureToolResult = battleCaptureToolForCommand(room, account.accountId, captureToolId);
    if (!captureToolResult.ok) {
      return captureToolResult;
    }
    captureToolId = captureToolResult.toolId;
  }
  const targetActor = battleCommandTargetActor(payload, data, room, battle, actor, action.actionId);
  if (!targetActor) {
    return fail("battle_command_target_missing", "战斗目标不存在。");
  }
  if (battleActionRequiresEnemyTarget(action.actionKind)) {
    if (targetActor.actorId === actor.actorId) {
      return fail("battle_command_target_invalid", "攻击目标不能是自己。");
    }
    if (String(targetActor.side || "") === String(actor.side || "")) {
      return fail("battle_command_target_invalid", "攻击目标必须是对方。");
    }
  }
  if (battleActionRequiresAllyTarget(action.actionKind)) {
    if (String(targetActor.side || "") !== String(actor.side || "")) {
      return fail("battle_command_target_invalid", "物品目标必须是我方。");
    }
    if (Number(targetActor.hp || 0) <= 0) {
      return fail("battle_command_target_invalid", "倒下目标暂不能使用这个物品。");
    }
  }
  if (action.actionKind === BATTLE_ACTION_ITEM) {
    const itemTargetResult = validateBattleItemTarget(action.actionId, actor, targetActor);
    if (!itemTargetResult.ok) {
      return itemTargetResult;
    }
  }
  if (action.actionKind === BATTLE_ACTION_SPIRIT) {
    const spiritTargetResult = validateBattleSpiritTarget(action.actionId, actor, targetActor);
    if (!spiritTargetResult.ok) {
      return spiritTargetResult;
    }
  }
  if (action.actionKind === BATTLE_ACTION_CAPTURE) {
    const captureTargetResult = validateBattleCaptureTarget(actor, targetActor);
    if (!captureTargetResult.ok) {
      return captureTargetResult;
    }
  }
  const targetAccountId = String(targetActor.accountId || "");
  if (targetAccountId !== "" && !requiredBattleCommandAccountIds(room).includes(targetAccountId)) {
    return fail("battle_command_target_invalid", "目标不在切磋房间中。");
  }
  return ok({
    command: {
      commandId: `battle_command_${randomId()}`,
      roomId: room.roomId,
      round: Number(battle.round || 1),
      accountId: account.accountId,
      username: account.username,
      actorId: actor.actorId,
      actorKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
      actionId: action.actionId,
      actionKind: action.actionKind,
      skillId: action.skillId || "",
      spiritId: action.spiritId || "",
      petId: switchPet ? String(switchPet.petId || "") : "",
      itemId,
      captureToolId,
      targetActorId: targetActor.actorId,
      targetAccountId: targetActor.accountId,
      targetUsername: targetActor.username,
      submittedAt: isoNow(now),
      schemaVersion: 1,
    },
  });
}

function battleCommandActorForPayload(payload, battle, account) {
  const explicitActorId = String(payload.actorId || payload.sourceActorId || "").trim();
  if (explicitActorId) {
    const actor = battleActorByActorId(battle, explicitActorId);
    return actor && String(actor.accountId || "") === account.accountId ? actor : null;
  }
  return battlePlayerActorByAccountId(battle, account.accountId);
}

function battleSwitchPetForPayload(payload, room, battle, account) {
  const petId = String(payload.petId || payload.targetPetId || payload.switchPetId || "").trim();
  if (petId === "") {
    return fail("battle_command_pet_missing", "请选择要换上的宠物。");
  }
  const participant = battleParticipantByAccountId(room, account.accountId);
  if (!participant) {
    return fail("battle_command_pet_missing", "未找到你的出战队伍。");
  }
  const battlePets = participantBattlePets(participant);
  const pet = battlePets.find((entry) => String(entry.petId || "") === petId) || null;
  if (!pet) {
    return fail("battle_command_pet_missing", "这只宠物不在当前队伍中。");
  }
  if (Number(pet.hp || 0) <= 0) {
    return fail("battle_command_pet_unavailable", "这只宠物已经无法出战。");
  }
  const activePetActor = activePetActorByAccountId(battle, account.accountId);
  if (activePetActor && String(activePetActor.petId || "") === petId) {
    return fail("battle_command_pet_invalid", "这只宠物已经在战斗中。");
  }
  return ok({pet});
}

function battleItemForCommand(room, accountId, itemId) {
  const normalizedItemId = normalizeBattleItemId(itemId);
  if (normalizedItemId === "") {
    return fail("battle_command_item_unsupported", "联网战斗暂不支持这个物品。");
  }
  const participant = battleParticipantByAccountId(room, accountId);
  if (!participant) {
    return fail("battle_command_item_missing", "未找到你的战斗物品。");
  }
  if (participantBattleItemCount(participant, normalizedItemId) <= 0) {
    return fail("battle_command_item_missing", `${battleItemLabel(normalizedItemId)} 不够了。`);
  }
  return ok({itemId: normalizedItemId});
}

function normalizeBattleActionForActor(value, actor, itemValue = "") {
  const actionId = String(value || "").trim().toLowerCase();
  const actorKind = String(actor.kind || BATTLE_ACTOR_KIND_PLAYER);
  if (actorKind === BATTLE_ACTOR_KIND_PET) {
    if (actionId === BATTLE_ACTION_ATTACK || actionId === "basic_attack" || actionId === BATTLE_ACTION_PET_ATTACK) {
      return ok({actionId: BATTLE_ACTION_PET_ATTACK, actionKind: "attack", skillId: BATTLE_ACTION_PET_ATTACK});
    }
    if (actionId === BATTLE_ACTION_DEFEND || actionId === "guard" || actionId === BATTLE_ACTION_PET_DEFEND) {
      return ok({actionId: BATTLE_ACTION_PET_DEFEND, actionKind: "defend", skillId: BATTLE_ACTION_PET_DEFEND});
    }
    const activeSkillIds = Array.isArray(actor.activeSkillIds) ? actor.activeSkillIds.map((item) => String(item || "").trim()) : [];
    if (activeSkillIds.includes(actionId)) {
      return ok({actionId, actionKind: "pet_skill", skillId: actionId});
    }
    return fail("battle_command_action_invalid", "宠物没有这个技能。");
  }
  if (actionId === BATTLE_ACTION_ATTACK || actionId === "basic_attack") {
    return ok({actionId: BATTLE_ACTION_ATTACK, actionKind: "attack", skillId: ""});
  }
  if (actionId === BATTLE_ACTION_DEFEND || actionId === "guard") {
    return ok({actionId: BATTLE_ACTION_DEFEND, actionKind: "defend", skillId: ""});
  }
  if (actionId === BATTLE_ACTION_SWITCH_PET || actionId === "change_pet") {
    return ok({actionId: BATTLE_ACTION_SWITCH_PET, actionKind: BATTLE_ACTION_SWITCH_PET, skillId: ""});
  }
  if (actionId === BATTLE_ACTION_CAPTURE) {
    return ok({actionId: BATTLE_ACTION_CAPTURE, actionKind: BATTLE_ACTION_CAPTURE, skillId: ""});
  }
  const requestedSpiritId = actionId === BATTLE_ACTION_SPIRIT ? String(itemValue || "").trim().toLowerCase() : actionId;
  const spiritAction = battleSpiritActionById(requestedSpiritId);
  if (spiritAction) {
    const effectType = battleSpiritEffectType(requestedSpiritId);
    if (effectType !== "heal" && effectType !== "poison") {
      return fail("battle_command_spirit_unsupported", "联网战斗暂不支持这个精灵。");
    }
    if (!stringArray(actor.spiritIds).includes(requestedSpiritId)) {
      return fail("battle_command_spirit_missing", `当前装备没有提供${battleSpiritLabel(requestedSpiritId)}。`);
    }
    return ok({
      actionId: requestedSpiritId,
      actionKind: BATTLE_ACTION_SPIRIT,
      skillId: requestedSpiritId,
      spiritId: requestedSpiritId,
    });
  }
  const itemId = normalizeBattleItemId(actionId === BATTLE_ACTION_ITEM ? itemValue : actionId);
  if (itemId !== "") {
    return ok({actionId: itemId, actionKind: BATTLE_ACTION_ITEM, skillId: "", itemId});
  }
  if (actionId === BATTLE_ACTION_ITEM || actionId.startsWith("item_")) {
    return fail("battle_command_item_unsupported", "联网战斗暂不支持这个物品。");
  }
  if (actionId === BATTLE_ACTION_SPIRIT || actionId.startsWith("spirit_")) {
    return fail("battle_command_spirit_unsupported", "联网战斗暂不支持这个精灵。");
  }
  return fail("battle_command_action_invalid", "暂不支持这个战斗命令。");
}

function battleActionRequiresEnemyTarget(actionKind) {
  return actionKind === "attack" || actionKind === "pet_skill" || actionKind === BATTLE_ACTION_CAPTURE;
}

function battleActionRequiresAllyTarget(actionKind) {
  return false;
}

function validateBattleItemTarget(itemId, actor, targetActor) {
  const normalizedItemId = normalizeBattleItemId(itemId);
  if (normalizedItemId === "" || !battleItemActionById(normalizedItemId)) {
    return fail("battle_command_item_unsupported", "联网战斗暂不支持这个物品。");
  }
  if (!targetActor || typeof targetActor !== "object" || Array.isArray(targetActor)) {
    return fail("battle_command_target_missing", "战斗目标不存在。");
  }
  const targetSide = String(targetActor.side || "");
  const actorSide = String(actor && actor.side || "");
  if (battleActionCanTargetAlly(normalizedItemId)) {
    if (targetSide !== actorSide) {
      return fail("battle_command_target_invalid", "物品目标必须是我方。");
    }
    if (Number(targetActor.hp || 0) <= 0) {
      return fail("battle_command_target_invalid", "倒下目标暂不能使用这个物品。");
    }
    return ok();
  }
  if (battleActionCanTargetEnemy(normalizedItemId)) {
    if (String(targetActor.actorId || "") === String(actor && actor.actorId || "")) {
      return fail("battle_command_target_invalid", "物品目标不能是自己。");
    }
    if (targetSide === actorSide) {
      return fail("battle_command_target_invalid", "物品目标必须是对方。");
    }
    if (Number(targetActor.hp || 0) <= 0) {
      return fail("battle_command_target_invalid", "倒下目标暂不能使用这个物品。");
    }
    return ok();
  }
  return fail("battle_command_item_unsupported", "联网战斗暂不支持这个物品。");
}

function validateBattleSpiritTarget(spiritId, actor, targetActor) {
  if (!battleSpiritActionById(spiritId)) {
    return fail("battle_command_spirit_unsupported", "联网战斗暂不支持这个精灵。");
  }
  if (!targetActor || typeof targetActor !== "object" || Array.isArray(targetActor)) {
    return fail("battle_command_target_missing", "战斗目标不存在。");
  }
  const targetSide = String(targetActor.side || "");
  const actorSide = String(actor && actor.side || "");
  if (battleSpiritCanTargetAlly(spiritId)) {
    if (targetSide !== actorSide) {
      return fail("battle_command_target_invalid", "精灵目标必须是我方。");
    }
    if (Number(targetActor.hp || 0) <= 0) {
      return fail("battle_command_target_invalid", "倒下目标暂不能使用这个精灵。");
    }
    return ok();
  }
  if (battleSpiritCanTargetEnemy(spiritId)) {
    if (targetActor.actorId === actor.actorId) {
      return fail("battle_command_target_invalid", "精灵目标不能是自己。");
    }
    if (targetSide === actorSide) {
      return fail("battle_command_target_invalid", "精灵目标必须是对方。");
    }
    return ok();
  }
  return fail("battle_command_spirit_unsupported", "联网战斗暂不支持这个精灵。");
}

function validateBattleCaptureTarget(actor, targetActor) {
  if (String(actor && actor.kind || BATTLE_ACTOR_KIND_PLAYER) !== BATTLE_ACTOR_KIND_PLAYER) {
    return fail("battle_command_capture_invalid", "只有人物可以捕捉。");
  }
  if (!targetActor || typeof targetActor !== "object" || Array.isArray(targetActor)) {
    return fail("battle_command_target_missing", "战斗目标不存在。");
  }
  if (Number(targetActor.hp || 0) <= 0) {
    return fail("battle_command_capture_invalid", "倒下的目标不能捕捉。");
  }
  if (String(targetActor.side || "") === String(actor && actor.side || "")) {
    return fail("battle_command_capture_invalid", "捕捉目标必须是对方。");
  }
  if (String(targetActor.kind || "") !== BATTLE_ACTOR_KIND_WILD_PET) {
    return fail("battle_command_capture_invalid", "只能捕捉野生宠物。");
  }
  if (!Boolean(targetActor.catchable)) {
    return fail("battle_command_capture_invalid", "这个目标不能捕捉。");
  }
  return ok();
}

function battleCommandTargetActor(payload, data, room, battle, actor, actionId) {
  if (actionId === BATTLE_ACTION_DEFEND || actionId === BATTLE_ACTION_SWITCH_PET) {
    return actor;
  }
  const explicitActorId = String(payload.targetActorId || "").trim();
  if (explicitActorId) {
    return battleActorByActorId(battle, explicitActorId);
  }
  const explicitAccountId = String(payload.targetAccountId || payload.targetAccount || "").trim();
  if (explicitAccountId) {
    return battlePlayerActorByAccountId(battle, explicitAccountId);
  }
  const targetUsername = normalizeUsername(payload.targetUsername || payload.username || "");
  if (targetUsername) {
    const target = data.accounts[targetUsername];
    return target ? battlePlayerActorByAccountId(battle, target.accountId) : null;
  }
  const itemId = normalizeBattleItemId(actionId);
  if (itemId !== "") {
    if (battleActionCanTargetEnemy(itemId)) {
      return firstLivingOpponentBattleActor(battle, actor);
    }
    return actor;
  }
  if (battleSpiritActionById(actionId) && battleSpiritIsAll(actionId) && battleSpiritCanTargetAlly(actionId)) {
    return actor;
  }
  if (String(room.mode || "") === BATTLE_MODE_PARTY_PVE) {
    return firstLivingBattleActorBySide(battle, battleOpponentSide(actor));
  }
  const targetAccountId = requiredBattleCommandAccountIds(room).find((accountId) => accountId !== actor.accountId) || "";
  return targetAccountId ? battlePlayerActorByAccountId(battle, targetAccountId) : null;
}

function resolveBattleRoomTurn(data, room, battle, now) {
  battle.turnSeq = Number(battle.turnSeq || 0) + 1;
  const round = Number(battle.round || 1);
  const orderedCommands = battleTurnCommandsForResolution(room, battle, round)
    .sort((a, b) => battleCommandSortValue(battle, b) - battleCommandSortValue(battle, a));
  for (const actor of battle.actors) {
    actor.guarding = false;
  }
  const events = [];
  let sequence = 1;
  let commandIndex = 0;
  while (commandIndex < orderedCommands.length) {
    const command = orderedCommands[commandIndex];
    const actor = battleActorByActorId(battle, command.actorId);
    if (!actor || Number(actor.hp || 0) <= 0) {
      commandIndex += 1;
      continue;
    }
    const statusSkipEvent = battleStatusSkipEvent(room, battle, command, actor, round, sequence);
    if (statusSkipEvent) {
      events.push(statusSkipEvent);
      sequence += 1;
      commandIndex += 1;
      continue;
    }
    if (String(command.actionKind || command.actionId || "") === "defend" || String(command.actionId || "") === BATTLE_ACTION_DEFEND || String(command.actionId || "") === BATTLE_ACTION_PET_DEFEND) {
      actor.guarding = true;
      events.push(battleDefendEvent(room, battle, command, actor, round, sequence));
      sequence += 1;
      commandIndex += 1;
      continue;
    }
    if (String(command.actionKind || command.actionId || "") === BATTLE_ACTION_SWITCH_PET) {
      events.push(battleSwitchPetEvent(room, battle, command, actor, round, sequence));
      sequence += 1;
      commandIndex += 1;
      continue;
    }
    if (String(command.actionKind || command.actionId || "") === BATTLE_ACTION_ITEM) {
      events.push(battleItemEvent(room, battle, command, actor, round, sequence));
      sequence += 1;
      commandIndex += 1;
      if (battleResultForResolvedActors(room, battle, now)) {
        break;
      }
      continue;
    }
    if (String(command.actionKind || command.actionId || "") === BATTLE_ACTION_SPIRIT) {
      events.push(battleSpiritEvent(room, battle, command, actor, round, sequence));
      sequence += 1;
      commandIndex += 1;
      if (battleResultForResolvedActors(room, battle, now)) {
        break;
      }
      continue;
    }
    if (String(command.actionKind || command.actionId || "") === BATTLE_ACTION_CAPTURE) {
      events.push(battleCaptureEvent(room, battle, command, actor, round, sequence));
      sequence += 1;
      commandIndex += 1;
      if (battleResultForResolvedActors(room, battle, now)) {
        break;
      }
      continue;
    }
    if (String(command.actionKind || command.actionId || "") === "pet_skill" && battleActionEffectType(command.actionId) === "status") {
      events.push(battlePetStatusSkillEvent(room, battle, command, actor, round, sequence));
      sequence += 1;
      commandIndex += 1;
      continue;
    }
    const attackResult = battleAttackOrComboEvent(room, battle, orderedCommands, commandIndex, round, sequence);
    commandIndex += Math.max(1, Number(attackResult.consumed || 1));
    if (attackResult.event) {
      events.push(attackResult.event);
      sequence += 1;
    }
    if (String(room.mode || BATTLE_MODE_DUEL) === BATTLE_MODE_PARTY_PVE) {
      if (battleResultForResolvedActors(room, battle, now)) {
        break;
      }
    } else if (battleDefeatedPlayerAccountIds(room, battle).length > 0) {
      break;
    }
  }
  const eventList = {
    schemaVersion: 1,
    kind: "battle_event_list",
    roomId: room.roomId,
    round,
    turnSeq: battle.turnSeq,
    phase: "resolved",
    events,
    actors: battle.actors.map(publicBattleActor),
    resolvedAt: isoNow(now),
  };
  const result = battleResultForResolvedActors(room, battle, now);
  if (result) {
    eventList.result = publicBattleResult(result);
  }
  battle.lastEventList = eventList;
  battle.eventLog = Array.isArray(battle.eventLog) ? battle.eventLog.concat([eventList]).slice(-20) : [eventList];
  battle.commands = {};
  battle.submittedActorIds = [];
  battle.submittedAccountIds = [];
  battle.requiredActorIds = requiredBattleCommandActorIds(battle);
  battle.round = round + 1;
  battle.phase = BATTLE_PHASE_COMMAND;
  battle.commandDeadlineAt = new Date(now() + BATTLE_COMMAND_TIMEOUT_MS).toISOString();
  battle.updatedAt = eventList.resolvedAt;
  room.updatedAt = eventList.resolvedAt;
  if (result) {
    closeBattleRoomWithResult(data, room, result, now);
    eventList.actors = battle.actors.map(publicBattleActor);
    eventList.result = publicBattleResult(battle.result);
  }
  recordBattleTrace(data, room, "battle_turn_resolved", {
    round,
    turnSeq: battle.turnSeq,
    eventCount: events.length,
    comboEventCount: events.filter((event) => event && event.eventType === "combo_attack").length,
    comboParticipantCount: events.reduce((count, event) => count + (
      event && event.eventType === "combo_attack" && Array.isArray(event.participantActorIds)
        ? event.participantActorIds.length
        : 0
    ), 0),
    expCreditCount: events.reduce((count, event) => count + (Array.isArray(event && event.expCredits) ? event.expCredits.length : 0), 0),
    wildAiTargetCounts: battleEventTargetCountsForRule(events, BATTLE_TARGET_RULE_WILD_RANDOM),
    wildAiTargetEvents: battleEventTargetEventsForRule(events, BATTLE_TARGET_RULE_WILD_RANDOM),
    closed: String(room.status || "") === BATTLE_ROOM_CLOSED,
    resultReason: result ? String(result.reason || "") : "",
  }, now);
  return clone(eventList);
}

function battleEventTargetCountsForRule(events, targetRule) {
  const counts = {};
  for (const event of Array.isArray(events) ? events : []) {
    if (!battleEventMatchesTargetRule(event, targetRule)) {
      continue;
    }
    const targetActorId = String(event.targetActorId || "");
    if (targetActorId === "") {
      continue;
    }
    counts[targetActorId] = Math.max(0, Math.trunc(Number(counts[targetActorId] || 0))) + 1;
  }
  return counts;
}

function battleEventTargetEventsForRule(events, targetRule) {
  return (Array.isArray(events) ? events : [])
    .filter((event) => battleEventMatchesTargetRule(event, targetRule))
    .map((event) => ({
      eventType: String(event.eventType || ""),
      actorId: String(event.actorId || ""),
      participantActorIds: Array.isArray(event.participantActorIds)
        ? event.participantActorIds.map((actorId) => String(actorId || "")).filter(Boolean)
        : [],
      targetActorId: String(event.targetActorId || ""),
      targetKind: String(event.targetKind || ""),
      targetRule: String(event.targetRule || ""),
      schemaVersion: 1,
    }));
}

function battleEventMatchesTargetRule(event, targetRule) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return false;
  }
  const rule = String(targetRule || "");
  if (String(event.targetRule || "") === rule) {
    return true;
  }
  return Array.isArray(event.targetRules) && event.targetRules.some((value) => String(value || "") === rule);
}

function battleAttackOrComboEvent(room, battle, orderedCommands, commandIndex, round, sequence) {
  const command = orderedCommands[commandIndex];
  const resolved = battleResolvedAttackForCommand(room, battle, command, round);
  if (!resolved.ok) {
    if (resolved.missing && String(room.mode || BATTLE_MODE_DUEL) !== BATTLE_MODE_PARTY_PVE) {
      return {
        consumed: 1,
        event: battleTargetMissingEvent(room, battle, command, resolved.actor || {}, round, sequence),
      };
    }
    return {consumed: 1, event: null};
  }

  const group = [resolved];
  if (battleCommandCanStartCombo(command) && battleComboRollSucceeds(room, battle, resolved, round, sequence)) {
    for (let index = commandIndex + 1; index < orderedCommands.length; index += 1) {
      const nextCommand = orderedCommands[index];
      if (!battleCommandCanStartCombo(nextCommand)) {
        break;
      }
      const nextResolved = battleResolvedAttackForCommand(room, battle, nextCommand, round);
      if (!nextResolved.ok || !battleResolvedAttackCanJoinCombo(group, nextResolved)) {
        break;
      }
      group.push(nextResolved);
    }
  }

  if (group.length >= 2) {
    return {
      consumed: group.length,
      event: battleComboAttackEvent(room, battle, group, round, sequence),
    };
  }

  const hpBefore = Number(resolved.target.hp || 0);
  const hpAfter = Math.max(0, hpBefore - resolved.damage);
  resolved.target.hp = hpAfter;
  resolved.target.defeated = hpAfter <= 0;
  syncParticipantPetSnapshotHp(room, resolved.target);
  const expCredits = battleExpCreditsForDefeat(room, battle, resolved.actor, resolved.target, hpBefore, hpAfter);
  appendBattleExpCredits(battle, expCredits);
  return {
    consumed: 1,
    event: battleAttackEvent(room, battle, resolved.command, resolved.actor, resolved.target, round, sequence, hpBefore, hpAfter, resolved.damage, expCredits),
  };
}

function battleResolvedAttackForCommand(room, battle, command, round) {
  const actor = battleActorByActorId(battle, command && command.actorId);
  if (!actor || Number(actor.hp || 0) <= 0) {
    return {ok: false, missing: false, actor: null};
  }
  if (!battleCommandDealsAttackDamage(command)) {
    return {ok: false, missing: true, actor};
  }
  let effectiveCommand = command;
  let target = battleActorByActorId(battle, command.targetActorId) || battlePlayerActorByAccountId(battle, command.targetAccountId);
  if (!target || Number(target.hp || 0) <= 0) {
    const fallbackTarget = battleRetargetActorForCommand(room, battle, actor, command, round);
    if (fallbackTarget) {
      target = fallbackTarget;
      effectiveCommand = {
        ...command,
        targetActorId: fallbackTarget.actorId,
        targetAccountId: fallbackTarget.accountId,
        targetUsername: fallbackTarget.username,
      };
    }
  }
  if (!target || Number(target.hp || 0) <= 0) {
    return {ok: false, missing: true, actor};
  }
  return {
    ok: true,
    actor,
    target,
    command: effectiveCommand,
    damage: battleAttackDamage(room, battle, effectiveCommand, actor, target),
  };
}

function battleCommandDealsAttackDamage(command) {
  const actionKind = String(command && (command.actionKind || command.actionId) || "");
  const actionId = String(command && command.actionId || "");
  return (
    actionKind === "attack" ||
    (actionKind === "pet_skill" && battleActionEffectType(actionId) !== "status") ||
    actionId === BATTLE_ACTION_ATTACK ||
    actionId === "basic_attack" ||
    actionId === BATTLE_ACTION_PET_ATTACK
  );
}

function battleCommandCanStartCombo(command) {
  const actionKind = String(command && (command.actionKind || command.actionId) || "");
  const actionId = String(command && command.actionId || "");
  return (
    actionKind === "attack" ||
    actionId === BATTLE_ACTION_ATTACK ||
    actionId === "basic_attack" ||
    actionId === BATTLE_ACTION_PET_ATTACK
  );
}

function battleComboRollSucceeds(room, battle, resolved, round, sequence) {
  const chance = battleComboChanceForActor(resolved.actor);
  if (chance <= 0) {
    return false;
  }
  if (chance >= 1) {
    return true;
  }
  const seed = [
    room.seed || room.roomId,
    battle.turnSeq,
    round,
    sequence,
    resolved.actor.actorId,
    resolved.target.actorId,
    "combo",
  ].join(":");
  const roll = Number.parseInt(crypto.createHash("sha256").update(seed).digest("hex").slice(0, 8), 16) / 0xffffffff;
  return roll < chance;
}

function battleComboChanceForActor(actor) {
  const override = battleComboRateOverrideValue(actor && actor.comboRateOverride);
  if (override !== undefined) {
    return override;
  }
  const kind = String(actor && actor.kind || "");
  const isMonster = kind === BATTLE_ACTOR_KIND_WILD_PET || battleActorIsEnemyAi(actor);
  return isMonster ? BATTLE_MONSTER_COMBO_BASE_RATE : BATTLE_PLAYER_COMBO_BASE_RATE;
}

function battleResolvedAttackCanJoinCombo(group, nextResolved) {
  if (!Array.isArray(group) || group.length <= 0 || !nextResolved || !nextResolved.ok) {
    return false;
  }
  const first = group[0];
  if (String(first.actor.side || "") !== String(nextResolved.actor.side || "")) {
    return false;
  }
  if (String(first.target.side || "") !== String(nextResolved.target.side || "")) {
    return false;
  }
  if (String(first.target.actorId || "") !== String(nextResolved.target.actorId || "")) {
    return false;
  }
  const actorId = String(nextResolved.actor.actorId || "");
  return actorId !== "" && !group.some((entry) => String(entry.actor.actorId || "") === actorId);
}

function battleComboAttackEvent(room, battle, group, round, sequence) {
  const target = group[0].target;
  const hpBefore = Number(target.hp || 0);
  const baseDamage = group.reduce((sum, entry) => sum + Math.max(0, Math.trunc(Number(entry.damage || 0))), 0);
  const comboBonus = Math.max(0, group.length - 1) * BATTLE_COMBO_BONUS_DAMAGE_PER_EXTRA_ACTOR;
  const damage = Math.max(1, baseDamage + comboBonus);
  const hpAfter = Math.max(0, hpBefore - damage);
  target.hp = hpAfter;
  target.defeated = hpAfter <= 0;
  syncParticipantPetSnapshotHp(room, target);
  const actors = group.map((entry) => entry.actor);
  const expCredits = battleExpCreditsForComboDefeat(room, battle, actors, target, hpBefore, hpAfter);
  appendBattleExpCredits(battle, expCredits);
  const actor = group[0].actor;
  const command = group[0].command;
  const participantNames = actors.map((entry) => String(entry.displayName || entry.username || "参战者"));
  const participantActorIds = actors.map((entry) => String(entry.actorId || "")).filter(Boolean);
  const targetRules = group
    .map((entry) => String(entry.command && entry.command.targetRule || ""))
    .filter(Boolean);
  const targetRule = targetRules.includes(BATTLE_TARGET_RULE_WILD_RANDOM)
    ? BATTLE_TARGET_RULE_WILD_RANDOM
    : (targetRules[0] || "");
  const event = {
    eventId: `${room.roomId}:r${round}:e${sequence}`,
    eventType: "combo_attack",
    round,
    sequence,
    actorAccountId: String(actor.accountId || ""),
    actorUsername: String(actor.username || ""),
    actorId: String(actor.actorId || ""),
    actorKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
    participantActorIds,
    participantAccountIds: actors.map((entry) => String(entry.accountId || "")).filter(Boolean),
    participants: actors.map((entry) => ({
      actorId: String(entry.actorId || ""),
      accountId: String(entry.accountId || ""),
      username: String(entry.username || ""),
      displayName: String(entry.displayName || entry.username || ""),
      kind: String(entry.kind || BATTLE_ACTOR_KIND_PLAYER),
      schemaVersion: 1,
    })),
    targetAccountId: String(target.accountId || ""),
    targetUsername: String(target.username || ""),
    targetActorId: String(target.actorId || ""),
    targetKind: String(target.kind || BATTLE_ACTOR_KIND_PLAYER),
    actionId: String(command.actionId || BATTLE_ACTION_ATTACK),
    skillId: "",
    targetRule,
    targetRules,
    damage,
    comboBonus,
    blocked: Boolean(target.guarding),
    hpBefore,
    hpAfter,
    defeated: hpAfter <= 0,
    animation: {
      actor: "combo_attack",
      targetReaction: hpAfter <= 0 ? "knockdown" : "hurt",
      observer: "watch_target",
    },
    message: `${participantNames.join("、")} 合击了 ${target.displayName || target.username || "目标"}，造成 ${damage} 点伤害。`,
    schemaVersion: 1,
  };
  if (expCredits.length > 0) {
    event.expCredits = clone(expCredits);
  }
  return event;
}

function battleExpCreditsForComboDefeat(room, battle, actors, target, hpBefore, hpAfter) {
  if (String(room && room.mode || BATTLE_MODE_DUEL) !== BATTLE_MODE_PARTY_PVE) {
    return [];
  }
  if (!target || Number(hpBefore || 0) <= 0 || Number(hpAfter || 0) > 0) {
    return [];
  }
  if (String(target.side || "") !== BATTLE_SIDE_ENEMY) {
    return [];
  }
  const recipientsByKey = new Map();
  for (const actor of Array.isArray(actors) ? actors : []) {
    for (const recipient of battleExpRecipientsForActor(room, actor, target)) {
      const key = [
        recipient.type,
        recipient.accountId,
        recipient.actorId,
        recipient.petId,
        recipient.partnerId,
      ].map((value) => String(value || "")).join(":");
      if (!recipientsByKey.has(key)) {
        recipientsByKey.set(key, recipient);
      }
    }
  }
  const recipients = Array.from(recipientsByKey.values());
  if (recipients.length <= 0) {
    return [];
  }
  return [{
    targetActorId: String(target.actorId || ""),
    targetName: String(target.displayName || target.username || "野生宠物"),
    targetKind: String(target.kind || BATTLE_ACTOR_KIND_WILD_PET),
    enemyLevel: Math.max(1, Math.trunc(Number(target.level || 1))),
    rawBaseAmount: battleEnemyBaseExpFromActor(target),
    recipients,
    comboParticipantActorIds: (Array.isArray(actors) ? actors : []).map((actor) => String(actor && actor.actorId || "")).filter(Boolean),
    schemaVersion: 1,
  }];
}

function battleTurnCommandsForResolution(room, battle, round) {
  const submittedCommands = Object.values(battle.commands)
    .filter((command) => command && typeof command === "object");
  return submittedCommands.concat(partyPveAiCommands(room, battle, round));
}

function partyPveAiCommands(room, battle, round) {
  if (String(room.mode || BATTLE_MODE_DUEL) !== BATTLE_MODE_PARTY_PVE) {
    return [];
  }
  const commands = [];
  const actors = Array.isArray(battle.actors) ? battle.actors : [];
  for (const actor of actors) {
    if (!actor || Number(actor.hp || 0) <= 0 || String(actor.accountId || "") !== "") {
      continue;
    }
    const actorSide = String(actor.side || "");
    if (actorSide !== BATTLE_SIDE_ALLY && actorSide !== BATTLE_SIDE_ENEMY) {
      continue;
    }
    const targetResult = partyPveAiTargetForActor(room, battle, actor, round);
    const target = targetResult.target;
    if (!target) {
      continue;
    }
    const isPetLike = String(actor.kind || "") === BATTLE_ACTOR_KIND_PET || String(actor.kind || "") === BATTLE_ACTOR_KIND_WILD_PET;
    commands.push({
      commandId: `battle_ai_${round}_${sanitizeBattleActorIdPart(actor.actorId)}`,
      roomId: room.roomId,
      round,
      accountId: "",
      username: "",
      actorId: actor.actorId,
      actorKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
      actionId: isPetLike ? BATTLE_ACTION_PET_ATTACK : BATTLE_ACTION_ATTACK,
      actionKind: "attack",
      skillId: isPetLike ? BATTLE_ACTION_PET_ATTACK : "",
      petId: "",
      itemId: "",
      targetActorId: target.actorId,
      targetAccountId: target.accountId,
      targetUsername: target.username,
      targetRule: targetResult.rule,
      targetRollIndex: targetResult.rollIndex,
      targetCandidateCount: targetResult.candidateCount,
      submittedAt: "",
      schemaVersion: 1,
    });
  }
  return commands;
}

function partyPveAiTargetForActor(room, battle, actor, round) {
  const targetSide = battleOpponentSide(actor);
  const livingTargets = battleLivingTargetsBySlotOrder(battle, targetSide, false);
  if (livingTargets.length === 0) {
    return {target: null, rule: "", rollIndex: -1, candidateCount: 0};
  }
  if (partyPveActorUsesRandomWildTarget(actor)) {
    const targetIndex = stableBattleIndex(room, battle, round, actor, "wild_ai_target", livingTargets.length);
    return {
      target: livingTargets[targetIndex] || livingTargets[0],
      rule: BATTLE_TARGET_RULE_WILD_RANDOM,
      rollIndex: targetIndex,
      candidateCount: livingTargets.length,
    };
  }
  return {
    target: livingTargets[0],
    rule: BATTLE_TARGET_RULE_SLOT_ORDER,
    rollIndex: 0,
    candidateCount: livingTargets.length,
  };
}

function partyPveActorUsesRandomWildTarget(actor) {
  return battleActorIsEnemyAi(actor);
}

function battleActorIsEnemyAi(actor) {
  return (
    actor &&
    String(actor.side || "") === BATTLE_SIDE_ENEMY &&
    String(actor.accountId || "").trim() === "" &&
    String(actor.ownerAccountId || "").trim() === ""
  );
}

function stableBattleIndex(room, battle, round, actor, purpose, count) {
  const size = Math.max(0, Math.trunc(Number(count || 0)));
  if (size <= 1) {
    return 0;
  }
  const seed = [
    room && (room.seed || room.roomId) || "",
    battle && battle.turnSeq || 0,
    round,
    actor && actor.actorId || "",
    purpose,
  ].join(":");
  const roll = Number.parseInt(crypto.createHash("sha256").update(seed).digest("hex").slice(0, 8), 16);
  return roll % size;
}

function battleRetargetActorForCommand(room, battle, actor, command, round) {
  if (String(room.mode || BATTLE_MODE_DUEL) !== BATTLE_MODE_PARTY_PVE) {
    return null;
  }
  const targetSide = battleOpponentSide(actor);
  const useWildRandom = String(command && command.targetRule || "") === BATTLE_TARGET_RULE_WILD_RANDOM || partyPveActorUsesRandomWildTarget(actor);
  const livingTargets = battleLivingTargetsBySlotOrder(battle, targetSide, !useWildRandom);
  if (livingTargets.length === 0) {
    return null;
  }
  if (useWildRandom) {
    const targetIndex = stableBattleIndex(
      room,
      battle,
      round,
      actor,
      `wild_ai_retarget:${String(command && command.targetActorId || "")}`,
      livingTargets.length
    );
    return livingTargets[targetIndex] || livingTargets[0];
  }
  return livingTargets[0];
}

function battleLivingTargetsBySlotOrder(battle, side, descending = false) {
  const targets = (Array.isArray(battle && battle.actors) ? battle.actors : []).filter((target) => (
    target &&
    String(target.side || "") === side &&
    Number(target.hp || 0) > 0
  ));
  targets.sort((a, b) => {
    const orderDiff = battleActorSlotOrder(a) - battleActorSlotOrder(b);
    if (orderDiff !== 0) {
      return descending ? -orderDiff : orderDiff;
    }
    return String(a.actorId || "").localeCompare(String(b.actorId || ""));
  });
  return targets;
}

function battleLivingOpponentTargetsBySlotOrder(battle, actor, descending = false) {
  const actorSide = String(actor && actor.side || "");
  const targets = (Array.isArray(battle && battle.actors) ? battle.actors : []).filter((target) => (
    target &&
    actorSide !== "" &&
    String(target.side || "") !== actorSide &&
    Number(target.hp || 0) > 0
  ));
  targets.sort((a, b) => {
    const orderDiff = battleActorSlotOrder(a) - battleActorSlotOrder(b);
    if (orderDiff !== 0) {
      return descending ? -orderDiff : orderDiff;
    }
    return String(a.actorId || "").localeCompare(String(b.actorId || ""));
  });
  return targets;
}

function firstLivingOpponentBattleActor(battle, actor) {
  const targets = battleLivingOpponentTargetsBySlotOrder(battle, actor, false);
  return targets.length > 0 ? targets[0] : null;
}

function battleActorSlotOrder(actor) {
  const slotId = String(actor && actor.slotId || "");
  const slotNumber = Math.max(0, Math.trunc(Number(actor && actor.slotNumber || 0)));
  const parts = slotId.split(".");
  const row = parts.length >= 2 ? parts[1] : "";
  const parsedRowSlot = parts.length >= 3 ? Math.trunc(Number(parts[2] || 0)) : 0;
  const rowSlot = parsedRowSlot > 0 ? parsedRowSlot : slotNumber;
  if (row === "front") {
    return rowSlot > 0 ? rowSlot : 999;
  }
  if (row === "back") {
    return rowSlot > 0 ? BATTLE_PARTY_PVE_PLAYER_SLOTS.length + rowSlot : 999;
  }
  return slotNumber > 0 ? slotNumber : 999;
}

function battleCommandSortValue(battle, command) {
  const actor = battleActorByActorId(battle, command.actorId);
  return actor ? Number(actor.speed || 0) : 0;
}

function battlePlayerActorByAccountId(battle, accountId) {
  return (Array.isArray(battle.actors) ? battle.actors : []).find((actor) => (
    actor &&
    actor.accountId === accountId &&
    String(actor.kind || BATTLE_ACTOR_KIND_PLAYER) === BATTLE_ACTOR_KIND_PLAYER
  )) || null;
}

function activePetActorByAccountId(battle, accountId) {
  return (Array.isArray(battle.actors) ? battle.actors : []).find((actor) => (
    actor &&
    actor.accountId === accountId &&
    String(actor.kind || "") === BATTLE_ACTOR_KIND_PET &&
    Number(actor.hp || 0) > 0
  )) || null;
}

function battleActorByActorId(battle, actorId) {
  const normalizedActorId = String(actorId || "").trim();
  if (!normalizedActorId) {
    return null;
  }
  return (Array.isArray(battle.actors) ? battle.actors : []).find((actor) => actor && String(actor.actorId || "") === normalizedActorId) || null;
}

function firstLivingBattleActorBySide(battle, side) {
  const targetSide = String(side || "");
  return (Array.isArray(battle.actors) ? battle.actors : []).find((actor) => (
    actor &&
    String(actor.side || "") === targetSide &&
    Number(actor.hp || 0) > 0
  )) || null;
}

function battleOpponentSide(actor) {
  return String(actor && actor.side || "") === BATTLE_SIDE_ENEMY ? BATTLE_SIDE_ALLY : BATTLE_SIDE_ENEMY;
}

function battleParticipantByAccountId(room, accountId) {
  const normalizedAccountId = String(accountId || "");
  return (Array.isArray(room.participants) ? room.participants : []).find((participant) => (
    participant && String(participant.accountId || "") === normalizedAccountId
  )) || null;
}

function participantBattlePets(participant) {
  const snapshot = participant && participant.teamSnapshot && typeof participant.teamSnapshot === "object"
    ? participant.teamSnapshot
    : {};
  return Array.isArray(snapshot.battlePets) ? snapshot.battlePets : [];
}

function participantBattleItemBag(participant) {
  if (!participant || typeof participant !== "object" || Array.isArray(participant)) {
    return {};
  }
  if (!participant.teamSnapshot || typeof participant.teamSnapshot !== "object" || Array.isArray(participant.teamSnapshot)) {
    participant.teamSnapshot = {};
  }
  if (!participant.teamSnapshot.battleItemBag || typeof participant.teamSnapshot.battleItemBag !== "object" || Array.isArray(participant.teamSnapshot.battleItemBag)) {
    participant.teamSnapshot.battleItemBag = {};
  }
  for (const itemId of BATTLE_ITEM_IDS) {
    participant.teamSnapshot.battleItemBag[itemId] = Math.max(0, Math.trunc(Number(participant.teamSnapshot.battleItemBag[itemId] || 0)));
  }
  return participant.teamSnapshot.battleItemBag;
}

function participantBattleItemCount(participant, itemId) {
  const normalizedItemId = normalizeBattleItemId(itemId);
  if (normalizedItemId === "") {
    return 0;
  }
  const bag = participantBattleItemBag(participant);
  return Math.max(0, Math.trunc(Number(bag[normalizedItemId] || 0)));
}

function setParticipantBattleItemCount(participant, itemId, count) {
  const normalizedItemId = normalizeBattleItemId(itemId);
  if (normalizedItemId === "") {
    return;
  }
  const bag = participantBattleItemBag(participant);
  bag[normalizedItemId] = Math.max(0, Math.trunc(Number(count || 0)));
}

function participantCaptureToolBag(participant) {
  if (!participant || typeof participant !== "object" || Array.isArray(participant)) {
    return {};
  }
  if (!participant.teamSnapshot || typeof participant.teamSnapshot !== "object" || Array.isArray(participant.teamSnapshot)) {
    participant.teamSnapshot = {};
  }
  if (!participant.teamSnapshot.captureToolBag || typeof participant.teamSnapshot.captureToolBag !== "object" || Array.isArray(participant.teamSnapshot.captureToolBag)) {
    participant.teamSnapshot.captureToolBag = {};
  }
  for (const toolId of battleCaptureToolIds()) {
    if (toolId === BATTLE_CAPTURE_TOOL_EMPTY_HAND || !battleCaptureToolIsConsumable(toolId)) {
      continue;
    }
    participant.teamSnapshot.captureToolBag[toolId] = Math.max(0, Math.trunc(Number(participant.teamSnapshot.captureToolBag[toolId] || 0)));
  }
  return participant.teamSnapshot.captureToolBag;
}

function participantCaptureToolCount(participant, toolId) {
  const normalizedToolId = normalizeBattleCaptureToolId(toolId);
  if (normalizedToolId === BATTLE_CAPTURE_TOOL_EMPTY_HAND || !battleCaptureToolIsConsumable(normalizedToolId)) {
    return Number.POSITIVE_INFINITY;
  }
  const bag = participantCaptureToolBag(participant);
  return Math.max(0, Math.trunc(Number(bag[normalizedToolId] || 0)));
}

function setParticipantCaptureToolCount(participant, toolId, count) {
  const normalizedToolId = normalizeBattleCaptureToolId(toolId);
  if (normalizedToolId === BATTLE_CAPTURE_TOOL_EMPTY_HAND || !battleCaptureToolIsConsumable(normalizedToolId)) {
    return;
  }
  const bag = participantCaptureToolBag(participant);
  bag[normalizedToolId] = Math.max(0, Math.trunc(Number(count || 0)));
}

function normalizeBattleItemId(value) {
  const itemId = String(value || "").trim().toLowerCase();
  return BATTLE_ITEM_IDS.includes(itemId) && battleItemActionById(itemId) ? itemId : "";
}

function battleItemLabel(itemId) {
  const normalizedItemId = normalizeBattleItemId(itemId);
  const action = battleItemActionById(normalizedItemId);
  return String(action && action.label || BATTLE_ITEM_LABELS[normalizedItemId] || "物品");
}

function battleCaptureToolEntries() {
  const rawTools = captureToolDocument().tools;
  const entries = Array.isArray(rawTools)
    ? rawTools.filter((tool) => tool && typeof tool === "object" && !Array.isArray(tool) && String(tool.id || "").trim() !== "")
    : [];
  if (!entries.some((tool) => String(tool.id || "") === BATTLE_CAPTURE_TOOL_EMPTY_HAND)) {
    entries.unshift(battleEmptyHandCaptureTool());
  }
  return entries;
}

function battleEmptyHandCaptureTool() {
  return {
    id: BATTLE_CAPTURE_TOOL_EMPTY_HAND,
    label: "空手",
    fullName: "空手捕捉",
    menuLabel: "空手",
    consumable: false,
    startingCount: 0,
    capturePower: 1,
    chanceBonus: 0,
  };
}

function battleCaptureToolIds() {
  const ids = [];
  for (const tool of battleCaptureToolEntries()) {
    const toolId = String(tool.id || "").trim();
    if (toolId !== "" && !ids.includes(toolId)) {
      ids.push(toolId);
    }
  }
  return ids;
}

function normalizeBattleCaptureToolId(value) {
  const toolId = String(value || "").trim().toLowerCase();
  if (toolId === "") {
    return BATTLE_CAPTURE_TOOL_EMPTY_HAND;
  }
  return battleCaptureToolIds().includes(toolId) ? toolId : BATTLE_CAPTURE_TOOL_EMPTY_HAND;
}

function battleCaptureToolById(toolId) {
  const normalizedToolId = normalizeBattleCaptureToolId(toolId);
  return battleCaptureToolEntries().find((tool) => String(tool.id || "") === normalizedToolId) || battleEmptyHandCaptureTool();
}

function battleCaptureToolFullName(toolId) {
  const tool = battleCaptureToolById(toolId);
  return String(tool.fullName || tool.label || "空手捕捉");
}

function battleCaptureToolIsConsumable(toolId) {
  const normalizedToolId = normalizeBattleCaptureToolId(toolId);
  if (normalizedToolId === BATTLE_CAPTURE_TOOL_EMPTY_HAND) {
    return false;
  }
  return Boolean(battleCaptureToolById(normalizedToolId).consumable !== false);
}

function battleCaptureToolChanceBonus(toolId) {
  const value = Number(battleCaptureToolById(toolId).chanceBonus || 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(0.8, value)) : 0;
}

function battleCaptureToolForCommand(room, accountId, toolId) {
  const normalizedToolId = normalizeBattleCaptureToolId(toolId);
  if (normalizedToolId === BATTLE_CAPTURE_TOOL_EMPTY_HAND || !battleCaptureToolIsConsumable(normalizedToolId)) {
    return ok({toolId: normalizedToolId});
  }
  const participant = battleParticipantByAccountId(room, accountId);
  if (!participant) {
    return fail("battle_command_capture_tool_missing", "未找到你的捕捉工具。");
  }
  if (participantCaptureToolCount(participant, normalizedToolId) <= 0) {
    return fail("battle_command_capture_tool_missing", `${battleCaptureToolFullName(normalizedToolId)} 不够了。`);
  }
  return ok({toolId: normalizedToolId});
}

function battleItemHealAmount(itemId) {
  const normalizedItemId = normalizeBattleItemId(itemId);
  return battleActionEffectAmount(normalizedItemId, BATTLE_ITEM_HEAL_AMOUNTS[normalizedItemId] || 0);
}

function battleResultForResolvedActors(room, battle, now) {
  const actors = Array.isArray(battle.actors) ? battle.actors : [];
  if (String(room.mode || BATTLE_MODE_DUEL) === BATTLE_MODE_PARTY_PVE) {
    const enemyAlive = actors.some((actor) => (
      actor &&
      String(actor.side || "") === BATTLE_SIDE_ENEMY &&
      Number(actor.hp || 0) > 0
    ));
    const livingParticipantPlayer = actors.find((actor) => (
      actor &&
      requiredBattleCommandAccountIds(room).includes(String(actor.accountId || "")) &&
      String(actor.kind || BATTLE_ACTOR_KIND_PLAYER) === BATTLE_ACTOR_KIND_PLAYER &&
      Number(actor.hp || 0) > 0
    )) || null;
    if (!enemyAlive) {
      return {
        reason: "defeat",
        winnerAccountId: livingParticipantPlayer ? String(livingParticipantPlayer.accountId || "") : String(room.leaderAccountId || ""),
        loserAccountIds: [],
        closedByAccountId: "",
        endedAt: isoNow(now),
        schemaVersion: 1,
      };
    }
    if (!livingParticipantPlayer) {
      return {
        reason: "defeat",
        winnerAccountId: "",
        loserAccountIds: requiredBattleCommandAccountIds(room),
        closedByAccountId: "",
        endedAt: isoNow(now),
        schemaVersion: 1,
      };
    }
    return null;
  }
  const defeatedPlayerAccountIds = battleDefeatedPlayerAccountIds(room, battle);
  if (defeatedPlayerAccountIds.length > 0) {
    const winner = actors.find((actor) => (
      actor &&
      requiredBattleCommandAccountIds(room).includes(String(actor.accountId || "")) &&
      String(actor.kind || BATTLE_ACTOR_KIND_PLAYER) === BATTLE_ACTOR_KIND_PLAYER &&
      Number(actor.hp || 0) > 0
    )) || null;
    return {
      reason: "defeat",
      winnerAccountId: winner ? String(winner.accountId || "") : "",
      loserAccountIds: defeatedPlayerAccountIds,
      closedByAccountId: "",
      endedAt: isoNow(now),
      schemaVersion: 1,
    };
  }
  const livingSides = new Set(actors
    .filter((actor) => actor && Number(actor.hp || 0) > 0)
    .map((actor) => String(actor.side || ""))
    .filter(Boolean));
  if (livingSides.size > 1) {
    return null;
  }
  const winnerSide = livingSides.size === 1 ? Array.from(livingSides)[0] : "";
  const winner = actors.find((actor) => actor && String(actor.side || "") === winnerSide && Number(actor.hp || 0) > 0) || null;
  const winnerAccountId = winner ? String(winner.accountId || "") : "";
  const loserAccountIds = requiredBattleCommandAccountIds(room).filter((accountId) => accountId !== winnerAccountId);
  return {
    reason: "defeat",
    winnerAccountId,
    loserAccountIds,
    closedByAccountId: "",
    endedAt: isoNow(now),
    schemaVersion: 1,
  };
}

function battleDefeatedPlayerAccountIds(room, battle) {
  const participantAccountIds = requiredBattleCommandAccountIds(room);
  const actors = Array.isArray(battle.actors) ? battle.actors : [];
  return participantAccountIds.filter((accountId) => {
    const playerActor = actors.find((actor) => (
      actor &&
      String(actor.accountId || "") === String(accountId || "") &&
      String(actor.kind || BATTLE_ACTOR_KIND_PLAYER) === BATTLE_ACTOR_KIND_PLAYER
    )) || null;
    return playerActor && Number(playerActor.hp || 0) <= 0;
  });
}

function battleRoomResultForLeave(room, leavingAccountId, now) {
  if (String(room && room.mode || BATTLE_MODE_DUEL) === BATTLE_MODE_PARTY_PVE) {
    return {
      reason: "escape",
      winnerAccountId: "",
      loserAccountIds: [],
      closedByAccountId: leavingAccountId,
      endedAt: isoNow(now),
      schemaVersion: 1,
    };
  }
  const winnerAccountId = requiredBattleCommandAccountIds(room).find((accountId) => accountId !== leavingAccountId) || "";
  return {
    reason: "leave",
    winnerAccountId,
    loserAccountIds: leavingAccountId ? [leavingAccountId] : [],
    closedByAccountId: leavingAccountId,
    endedAt: isoNow(now),
    schemaVersion: 1,
  };
}

function battleRoomResultForTimeout(room, battle, now) {
  const submittedActorIds = submittedBattleCommandActorIds(battle);
  const missingActorIds = requiredBattleCommandActorIds(battle).filter((actorId) => !submittedActorIds.includes(actorId));
  const missingAccountIds = Array.from(new Set(missingActorIds
    .map((actorId) => battleActorByActorId(battle, actorId))
    .filter(Boolean)
    .map((actor) => String(actor.accountId || ""))
    .filter(Boolean)));
  const submittedAccountIds = submittedBattleCommandAccountIds(battle);
  const participantAccountIds = requiredBattleCommandAccountIds(room);
  const winnerAccountId = submittedAccountIds.length === 1 && missingAccountIds.length > 0 ? submittedAccountIds[0] : "";
  return {
    reason: "timeout",
    winnerAccountId,
    loserAccountIds: missingAccountIds.length > 0 ? missingAccountIds : participantAccountIds.filter((accountId) => accountId !== winnerAccountId),
    closedByAccountId: missingAccountIds[0] || "",
    endedAt: isoNow(now),
    schemaVersion: 1,
  };
}

function battleRoomResultForDisconnectTimeout(room, disconnectedAccountIds, now) {
  const participantAccountIds = requiredBattleCommandAccountIds(room);
  const disconnected = Array.from(new Set((Array.isArray(disconnectedAccountIds) ? disconnectedAccountIds : [])
    .map((accountId) => String(accountId || ""))
    .filter((accountId) => participantAccountIds.includes(accountId))));
  const stillConnected = participantAccountIds.filter((accountId) => !disconnected.includes(accountId));
  const winnerAccountId = disconnected.length === 1 ? stillConnected[0] || "" : "";
  return {
    reason: "disconnect_timeout",
    winnerAccountId,
    loserAccountIds: disconnected.length > 0 ? disconnected : participantAccountIds.slice(),
    closedByAccountId: disconnected[0] || "",
    endedAt: isoNow(now),
    schemaVersion: 1,
  };
}

function closeBattleRoomWithResult(data, room, result, now) {
  const battle = battleRoomBattleStateForMutation(room, now);
  const recordId = `battle_record_${String(room.roomId || "").replace(/^battle_room_/, "")}`;
  room.status = BATTLE_ROOM_CLOSED;
  room.closeReason = String(result.reason || "closed");
  room.closedByAccountId = String(result.closedByAccountId || "");
  room.closedAt = String(result.endedAt || isoNow(now));
  room.updatedAt = room.closedAt;
  battle.phase = BATTLE_PHASE_FINISHED;
  battle.result = {...result, kind: "battle_result"};
  battle.commands = {};
  battle.submittedActorIds = [];
  battle.submittedAccountIds = [];
  battle.commandDeadlineAt = "";
  battle.updatedAt = room.closedAt;
  battle.profileWriteback = applyBattleRoomProfileWriteback(data, room, battle, battle.result, now);
  const battleReturns = applyBattleRoomResultReturns(data, room, battle.result, now);
  battle.result.battleReturns = battleReturns;
  battle.result.battleRecordId = recordId;
  result.battleReturns = battleReturns;
  result.battleRecordId = recordId;
  appendBattleRecord(data, battleRecordForClosedRoom(data, room, battle.result, recordId));
  recordBattleTrace(data, room, "battle_room_closed", {
    recordId,
    reason: String(result.reason || ""),
    battleReturnCount: battleReturns.length,
  }, now);
  return room;
}

function appendBattleRecord(data, record) {
  if (!record || typeof record !== "object" || Array.isArray(record) || String(record.recordId || "").trim() === "") {
    return;
  }
  if (!Array.isArray(data.battleRecords)) {
    data.battleRecords = [];
  }
  const recordId = String(record.recordId || "");
  const existingIndex = data.battleRecords.findIndex((value) => value && String(value.recordId || "") === recordId);
  if (existingIndex >= 0) {
    data.battleRecords[existingIndex] = record;
  } else {
    data.battleRecords.push(record);
  }
  while (data.battleRecords.length > MAX_BATTLE_RECORDS) {
    data.battleRecords.shift();
  }
}


function battleRecordForClosedRoom(data, room, result, recordId) {
  const participantAccountIds = requiredBattleCommandAccountIds(room);
  const winnerAccountId = String(result && result.winnerAccountId || "");
  const loserAccountIds = Array.isArray(result && result.loserAccountIds)
    ? result.loserAccountIds.map((value) => String(value || "")).filter(Boolean)
    : [];
  const endedAt = String(result && result.endedAt || room.closedAt || room.updatedAt || "");
  const createdAt = String(room.createdAt || "");
  const startedMs = Date.parse(createdAt);
  const endedMs = Date.parse(endedAt);
  const battle = room.battle && typeof room.battle === "object" && !Array.isArray(room.battle) ? room.battle : {};
  return {
    recordId: String(recordId || `battle_record_${room.roomId || crypto.randomUUID()}`),
    roomId: String(room.roomId || ""),
    mode: String(room.mode || BATTLE_MODE_DUEL),
    reason: String(result && result.reason || room.closeReason || "closed"),
    winnerAccountId,
    loserAccountIds,
    closedByAccountId: String(result && result.closedByAccountId || room.closedByAccountId || ""),
    participantAccountIds,
    participants: participantAccountIds.map((accountId) => battleRecordParticipant(data, room, accountId)),
    round: Math.max(0, Number(battle.round || 1) - 1),
    turnSeq: Math.max(0, Number(battle.turnSeq || 0)),
    result: battleRecordResultSummary(result),
    profileWriteback: battleRecordProfileWritebackSummary(battle.profileWriteback || null),
    expSummaries: battleRecordExpSummaries(battle.profileWriteback || null),
    startedAt: createdAt,
    endedAt,
    durationSeconds: Number.isFinite(startedMs) && Number.isFinite(endedMs) && endedMs >= startedMs ? Math.floor((endedMs - startedMs) / 1000) : 0,
    schemaVersion: 2,
  };
}


function battleRecordResultSummary(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return null;
  }
  return {
    reason: String(result.reason || ""),
    winnerAccountId: String(result.winnerAccountId || ""),
    loserAccountIds: Array.isArray(result.loserAccountIds) ? result.loserAccountIds.map((value) => String(value || "")).filter(Boolean) : [],
    closedByAccountId: String(result.closedByAccountId || ""),
    endedAt: String(result.endedAt || ""),
    battleRecordId: String(result.battleRecordId || ""),
    schemaVersion: 1,
  };
}


function battleRecordProfileWritebackSummary(writeback) {
  if (!writeback || typeof writeback !== "object" || Array.isArray(writeback)) {
    return null;
  }
  return {
    kind: String(writeback.kind || "battle_profile_writeback"),
    roomId: String(writeback.roomId || ""),
    reason: String(writeback.reason || ""),
    updatedAt: String(writeback.updatedAt || ""),
    profiles: Array.isArray(writeback.profiles) ? writeback.profiles.map((entry) => ({
      accountId: String(entry && entry.accountId || ""),
      playerId: String(entry && entry.playerId || ""),
      profileRevision: Math.max(0, Math.trunc(Number(entry && entry.profileRevision || 0))),
	      exp: entry && entry.exp && typeof entry.exp === "object" && !Array.isArray(entry.exp) ? clone(entry.exp) : null,
	      rewards: entry && entry.rewards && typeof entry.rewards === "object" && !Array.isArray(entry.rewards) ? clone(entry.rewards) : null,
	      quests: entry && entry.quests && typeof entry.quests === "object" && !Array.isArray(entry.quests) ? clone(entry.quests) : null,
	      hang: entry && entry.hang && typeof entry.hang === "object" && !Array.isArray(entry.hang) ? clone(entry.hang) : null,
	      captureToolBag: entry && entry.captureToolBag && typeof entry.captureToolBag === "object" && !Array.isArray(entry.captureToolBag) ? clone(entry.captureToolBag) : null,
	      capturedPetCount: Array.isArray(entry && entry.capturedPets) ? entry.capturedPets.length : 0,
	      lostCapturedPetCount: Array.isArray(entry && entry.lostCapturedPets) ? entry.lostCapturedPets.length : 0,
      schemaVersion: 1,
    })).filter((entry) => entry.accountId !== "") : [],
    skippedProfiles: Array.isArray(writeback.skippedProfiles) ? clone(writeback.skippedProfiles) : [],
    schemaVersion: 1,
  };
}


function battleRecordExpSummaries(writeback) {
  const profiles = Array.isArray(writeback && writeback.profiles) ? writeback.profiles : [];
  return profiles
    .map((entry) => {
      const exp = entry && entry.exp && typeof entry.exp === "object" && !Array.isArray(entry.exp) ? entry.exp : {};
      return {
        accountId: String(entry && entry.accountId || ""),
        playerId: String(entry && entry.playerId || ""),
        amount: Math.max(0, Math.trunc(Number(exp.amount || 0))),
        baseAmount: Math.max(0, Math.trunc(Number(exp.baseAmount || 0))),
        killCount: Math.max(0, Math.trunc(Number(exp.killCount || 0))),
        playerAmount: Math.max(0, Math.trunc(Number(exp.player && exp.player.amount || 0))),
        petAmount: Array.isArray(exp.pets) ? exp.pets.reduce((sum, pet) => sum + Math.max(0, Math.trunc(Number(pet && pet.amount || 0))), 0) : 0,
        ridePetAmount: Array.isArray(exp.ridePets) ? exp.ridePets.reduce((sum, pet) => sum + Math.max(0, Math.trunc(Number(pet && pet.amount || 0))), 0) : 0,
        trainingPartnerAmount: battleRecordTrainingPartnerExpAmount(exp),
        schemaVersion: 1,
      };
    })
    .filter((entry) => entry.accountId !== "");
}


function battleRecordTrainingPartnerExpAmount(exp) {
  const partners = Array.isArray(exp && exp.trainingPartners) ? exp.trainingPartners : [];
  return partners.reduce((sum, partner) => {
    const playerAmount = Math.max(0, Math.trunc(Number(partner && partner.player && partner.player.amount || 0)));
    const petAmount = Math.max(0, Math.trunc(Number(partner && partner.pet && partner.pet.amount || 0)));
    return sum + playerAmount + petAmount;
  }, 0);
}


function battleRecordParticipant(data, room, accountId) {
  const account = accountById(data, accountId);
  const participant = battleParticipantByAccountId(room, accountId);
  return {
    accountId: String(accountId || ""),
    username: String(account && account.username || participant && participant.username || ""),
    displayName: String(account && account.displayName || participant && participant.displayName || account && account.username || ""),
    role: String(participant && participant.role || ""),
    schemaVersion: 1,
  };
}


function battleRecordSummaryAgainst(data, selfAccount, targetAccount) {
  const selfAccountId = String(selfAccount && selfAccount.accountId || "");
  const targetAccountId = String(targetAccount && targetAccount.accountId || "");
  const records = normalizeBattleRecords(data.battleRecords).filter((record) => {
    const participantIds = Array.isArray(record.participantAccountIds) ? record.participantAccountIds.map((value) => String(value || "")) : [];
    return participantIds.includes(selfAccountId) && participantIds.includes(targetAccountId);
  });
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let latestEndedAt = "";
  for (const record of records) {
    const winnerAccountId = String(record.winnerAccountId || "");
    const loserAccountIds = Array.isArray(record.loserAccountIds) ? record.loserAccountIds.map((value) => String(value || "")) : [];
    if (winnerAccountId === selfAccountId) {
      wins += 1;
    } else if (loserAccountIds.includes(selfAccountId) || winnerAccountId === targetAccountId) {
      losses += 1;
    } else {
      draws += 1;
    }
    if (String(record.endedAt || "") > latestEndedAt) {
      latestEndedAt = String(record.endedAt || "");
    }
  }
  return {
    accountId: selfAccountId,
    username: String(selfAccount && selfAccount.username || ""),
    targetAccountId,
    targetUsername: String(targetAccount && targetAccount.username || ""),
    targetDisplayName: String(targetAccount && targetAccount.displayName || targetAccount && targetAccount.username || ""),
    total: records.length,
    wins,
    losses,
    draws,
    latestEndedAt,
    schemaVersion: 1,
  };
}


function applyBattleRoomProfileWriteback(data, room, battle, result, now) {
  const updatedAt = String(result && result.endedAt || room.closedAt || isoNow(now));
  const writeback = {
    kind: "battle_profile_writeback",
    roomId: String(room.roomId || ""),
    reason: String(result && result.reason || room.closeReason || ""),
    updatedAt,
    profiles: [],
    skippedProfiles: [],
    schemaVersion: 1,
  };
  if (!data || !battle || !Array.isArray(battle.actors)) {
    return writeback;
  }
  for (const accountId of requiredBattleCommandAccountIds(room)) {
    const binding = data.profileBindings[String(accountId || "")] || null;
    if (!binding || !binding.playerId) {
      writeback.skippedProfiles.push({accountId, reason: "profile_binding_missing"});
      continue;
    }
    const profileDoc = data.profiles[binding.playerId] || null;
    const profile = profileDoc && profileDoc.profile && typeof profileDoc.profile === "object" && !Array.isArray(profileDoc.profile)
      ? clone(profileDoc.profile)
      : null;
    if (!profile) {
      writeback.skippedProfiles.push({accountId, playerId: binding.playerId, reason: "profile_document_missing"});
      continue;
    }
    const accountActors = battle.actors.filter((actor) => actor && String(actor.accountId || "") === String(accountId || ""));
    const summary = {
      accountId: String(accountId || ""),
      playerId: String(binding.playerId || ""),
      profileRevision: Number(binding.profileRevision || profileDoc.profileRevision || 0),
      playerHp: null,
      petHps: [],
      battleItemBag: null,
      captureToolBag: null,
      capturedPets: [],
      lostCapturedPets: [],
      exp: null,
      rewards: null,
      quests: null,
      special: null,
      hang: null,
      schemaVersion: 1,
    };
    let changed = false;
    const playerActor = accountActors.find((actor) => String(actor.kind || BATTLE_ACTOR_KIND_PLAYER) === BATTLE_ACTOR_KIND_PLAYER) || null;
    if (playerActor) {
      const applied = applyBattleActorHpToProfilePlayer(profile, playerActor);
      changed = changed || applied.changed;
      summary.playerHp = applied.publicHp;
    }
    const petActors = accountActors.filter((actor) => String(actor.kind || "") === BATTLE_ACTOR_KIND_PET);
    const writtenPetIds = new Set();
    for (const petActor of petActors) {
      const applied = applyBattleActorHpToProfilePet(profile, petActor);
      if (!applied.found) {
        writeback.skippedProfiles.push({
          accountId: String(accountId || ""),
          playerId: String(binding.playerId || ""),
          petId: String(petActor.petId || ""),
          reason: "pet_instance_missing",
        });
        continue;
      }
      changed = changed || applied.changed;
      summary.petHps.push(applied.publicHp);
      writtenPetIds.add(String(petActor.petId || ""));
    }
    const participant = battleParticipantByAccountId(room, accountId);
    for (const petSnapshot of participantBattlePets(participant)) {
      const petId = String(petSnapshot.petId || "").trim();
      if (petId === "" || writtenPetIds.has(petId)) {
        continue;
      }
      const applied = applyBattleActorHpToProfilePet(profile, {
        actorId: `team_snapshot:${petId}`,
        petId,
        hp: petSnapshot.hp,
        maxHp: petSnapshot.maxHp,
      });
      if (!applied.found) {
        writeback.skippedProfiles.push({
          accountId: String(accountId || ""),
          playerId: String(binding.playerId || ""),
          petId,
          reason: "pet_instance_missing",
        });
        continue;
      }
      changed = changed || applied.changed;
      summary.petHps.push(applied.publicHp);
      writtenPetIds.add(petId);
    }
    const itemWriteback = participant
      ? applyBattleItemBagToProfile(profile, participantBattleItemBag(participant))
      : {changed: false, publicItemBag: battleItemBagFromProfile(profile)};
    changed = changed || itemWriteback.changed;
    summary.battleItemBag = itemWriteback.publicItemBag;
    const captureToolWriteback = participant
      ? applyCaptureToolBagToProfile(profile, participantCaptureToolBag(participant))
      : {changed: false, publicCaptureToolBag: captureToolBagFromProfile(profile)};
    changed = changed || captureToolWriteback.changed;
    summary.captureToolBag = captureToolWriteback.publicCaptureToolBag;
    const captureWriteback = applyBattleCapturedPetsToProfile(profile, battle, accountId, room);
    changed = changed || captureWriteback.changed;
    summary.capturedPets = captureWriteback.capturedPets;
    summary.lostCapturedPets = captureWriteback.lostCapturedPets;
    const expReward = battleRoomProfileExpReward(room, battle, result, profile, accountId);
    const expWriteback = applyBattleExpRewardToProfile(profile, battle, accountId, expReward);
    changed = changed || expWriteback.changed;
    summary.exp = expWriteback.publicExp;
    const rewardWriteback = applyBattleVictoryRewardsToProfile(profile, room, battle, result);
    changed = changed || rewardWriteback.changed;
    summary.rewards = rewardWriteback.publicRewards;
    const specialWriteback = applyBattleSpecialVictoryProgressToProfile(profile, room, battle, result);
    changed = changed || specialWriteback.changed;
    summary.special = specialWriteback.publicSpecial;
    const questWriteback = applyBattleQuestProgressToProfile(profile, room, battle, result, accountId, captureWriteback.capturedPets);
    changed = changed || questWriteback.changed;
    summary.quests = questWriteback.publicQuests;
    const hangWriteback = applyBattleHangSessionToProfile(profile, room, battle, result, accountId, captureWriteback.capturedPets.length);
    changed = changed || hangWriteback.changed;
    summary.hang = hangWriteback.publicHang;
    if (summary.rewards || summary.quests) {
      summary.battleItemBag = battleItemBagFromProfile(profile);
      summary.captureToolBag = captureToolBagFromProfile(profile);
    }
    if (
      !changed &&
      !summary.exp &&
      !summary.rewards &&
      !summary.quests &&
      !summary.special &&
      !summary.hang &&
      summary.capturedPets.length <= 0 &&
      summary.lostCapturedPets.length <= 0
    ) {
      continue;
    }
    if (!changed) {
      writeback.profiles.push(summary);
      continue;
    }
    const nextRevision = Number(binding.profileRevision || profileDoc.profileRevision || 0) + 1;
    binding.profileRevision = nextRevision;
    binding.updatedAt = updatedAt;
    data.profileBindings[String(accountId || "")] = binding;
    data.profiles[binding.playerId] = {
      ...profileDoc,
      playerId: binding.playerId,
      accountId: String(accountId || ""),
      profileRevision: nextRevision,
      profile,
      updatedAt,
      schemaVersion: 1,
    };
    summary.profileRevision = nextRevision;
    writeback.profiles.push(summary);
  }
  return writeback;
}

function applyBattleHangSessionToProfile(profile, room, battle, result, accountId, capturedCount) {
  if (!result || typeof result !== "object") {
    return {changed: false, publicHang: null};
  }
  const previousSession = normalizeHangSession(profile && profile.hangSession);
  if (!previousSession.enabled) {
    return {changed: false, publicHang: null};
  }
  const settings = normalizeHangSettings(profile && profile.hangSettings);
  const nextSession = {
    ...previousSession,
    battleCount: Math.max(0, Math.trunc(Number(previousSession.battleCount || 0))) + 1,
    captureSuccessCount: Math.max(0, Math.trunc(Number(previousSession.captureSuccessCount || 0))) + Math.max(0, Math.trunc(Number(capturedCount || 0))),
  };
  if (hangCaptureTargetReached(settings, nextSession)) {
    nextSession.enabled = false;
    nextSession.pendingResume = false;
    nextSession.lastStopReason = "capture_target";
  }
  const lowHpStop = hangLowHpStopForBattleAccount(settings, battle, accountId);
  if (nextSession.enabled && lowHpStop.shouldStop) {
    nextSession.enabled = false;
    nextSession.pendingResume = lowHpStop.pendingResume;
    nextSession.lastStopReason = lowHpStop.reason;
  }
  const changed = JSON.stringify(previousSession) !== JSON.stringify(nextSession);
  if (changed) {
    profile.hangSession = nextSession;
  }
  return {
    changed,
    publicHang: {
      enabled: Boolean(nextSession.enabled),
      mode: String(nextSession.mode || ""),
      battleCount: Math.max(0, Math.trunc(Number(nextSession.battleCount || 0))),
      captureSuccessCount: Math.max(0, Math.trunc(Number(nextSession.captureSuccessCount || 0))),
      lastStopReason: String(nextSession.lastStopReason || ""),
      pendingResume: Boolean(nextSession.pendingResume),
      stopped: previousSession.enabled && !nextSession.enabled,
      stopReason: lowHpStop.shouldStop ? lowHpStop.reason : "",
      schemaVersion: 1,
    },
  };
}

function hangLowHpStopForBattleAccount(settings, battle, accountId) {
  const threshold = Math.trunc(Number(settings && settings.lowHpStopPercent || 0));
  if (threshold === -1) {
    return {shouldStop: false, reason: "", pendingResume: false};
  }
  const playerActor = battlePlayerActorByAccountId(battle, String(accountId || ""));
  if (!playerActor) {
    return {shouldStop: false, reason: "", pendingResume: false};
  }
  const hp = Math.max(0, Math.trunc(Number(playerActor.hp || 0)));
  const maxHp = Math.max(1, Math.trunc(Number(playerActor.maxHp || 1)));
  let shouldStop = false;
  let reason = "";
  if (threshold === 0) {
    shouldStop = hp <= 0;
    reason = "player_defeated";
  } else {
    const hpPercent = hp / maxHp * 100;
    shouldStop = hpPercent < threshold;
    reason = "low_hp";
  }
  if (!shouldStop) {
    return {shouldStop: false, reason: "", pendingResume: false};
  }
  return {
    shouldStop: true,
    reason,
    pendingResume: String(settings && settings.lowHpAction || "stop") === "town_heal" && settings.resumeAfterHeal !== false,
  };
}

function normalizeHangSettings(value) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const percent = Math.trunc(Number(raw.lowHpStopPercent || 0));
  const lowHpStopPercent = [-1, 0, 10, 20, 30, 50].includes(percent) ? percent : 0;
  const lowHpAction = ["stop", "town_heal"].includes(String(raw.lowHpAction || "")) ? String(raw.lowHpAction || "") : "stop";
  return {
    lowHpStopPercent,
    lowHpAction,
    resumeAfterHeal: raw.resumeAfterHeal !== false,
    captureTargetCount: clampInt(raw.captureTargetCount, 0, 99, 0),
  };
}

function normalizeHangSession(value) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const rawCell = Array.isArray(raw.originCell) ? raw.originCell : [0, 0];
  return {
    enabled: Boolean(raw.enabled),
    mode: String(raw.mode || ""),
    captureSuccessCount: Math.max(0, Math.trunc(Number(raw.captureSuccessCount || 0))),
    battleCount: Math.max(0, Math.trunc(Number(raw.battleCount || 0))),
    pendingResume: Boolean(raw.pendingResume),
    lastStopReason: String(raw.lastStopReason || ""),
    originMapId: String(raw.originMapId || ""),
    originCell: [
      Math.trunc(Number(rawCell[0] || 0)),
      Math.trunc(Number(rawCell[1] || 0)),
    ],
  };
}

function normalizeHangMode(value) {
  const mode = String(value || "").trim();
  return ["walk", "encounter_stone"].includes(mode) ? mode : "";
}

function normalizeHangOriginPayload(payload = {}) {
  const rawCell = Array.isArray(payload.originCell) ? payload.originCell : [payload.cellX ?? payload.x, payload.cellY ?? payload.y];
  return {
    mapId: String(payload.originMapId || payload.mapId || "").trim().slice(0, POSITION_MAP_ID_MAX_LENGTH),
    originCell: [
      clampInt(rawCell[0], -9999, 9999, 0),
      clampInt(rawCell[1], -9999, 9999, 0),
    ],
  };
}

function normalizeHangStopReason(value) {
  return String(value || "").trim().replace(/\s+/g, "_").slice(0, 48) || "manual";
}

function publicHangSession(session) {
  const normalized = normalizeHangSession(session);
  return {
    enabled: Boolean(normalized.enabled),
    mode: String(normalized.mode || ""),
    captureSuccessCount: Math.max(0, Math.trunc(Number(normalized.captureSuccessCount || 0))),
    battleCount: Math.max(0, Math.trunc(Number(normalized.battleCount || 0))),
    pendingResume: Boolean(normalized.pendingResume),
    lastStopReason: String(normalized.lastStopReason || ""),
    originMapId: String(normalized.originMapId || ""),
    originCell: Array.isArray(normalized.originCell) ? normalized.originCell.slice(0, 2) : [0, 0],
    schemaVersion: 1,
  };
}

function hangCaptureTargetReached(settings, session) {
  const targetCount = Math.max(0, Math.trunc(Number(settings && settings.captureTargetCount || 0)));
  return targetCount > 0 && Math.max(0, Math.trunc(Number(session && session.captureSuccessCount || 0))) >= targetCount;
}

function applyBattleQuestProgressToProfile(profile, room, battle, result, accountId, capturedPets) {
  const events = battleQuestEventsForProfile(room, battle, result, accountId, capturedPets);
  if (events.length <= 0) {
    return {changed: false, publicQuests: null};
  }
  const messages = [];
  const progressEvents = [];
  const claimed = [];
  let changed = false;
  for (const event of events) {
    const progress = recordQuestEventToProfile(profile, event);
    if (!progress.changed) {
      continue;
    }
    changed = true;
    progressEvents.push({
      type: String(event.type || ""),
      questId: progress.questId,
      title: progress.title,
      ready: Boolean(progress.ready),
      message: progress.message,
      schemaVersion: 1,
    });
    if (progress.ready && activeQuestAutoClaim(profile)) {
      const claim = claimActiveQuestToProfile(profile);
      if (claim.ok) {
        changed = true;
        claimed.push({
          questId: claim.questId,
          nextQuestId: claim.nextQuestId,
          rewards: claim.rewards,
          message: claim.message,
          schemaVersion: 1,
        });
        if (claim.message) {
          messages.push(claim.message);
        }
      } else if (progress.message) {
        messages.push(progress.message);
      }
    } else if (progress.message) {
      messages.push(progress.message);
    }
  }
  if (!changed) {
    return {changed: false, publicQuests: null};
  }
  return {
    changed,
    publicQuests: {
      activeQuestId: String(profile.activeQuestId || ""),
      events: progressEvents,
      claimed,
      messages: messages.filter((message) => String(message || "").trim() !== ""),
      schemaVersion: 1,
    },
  };
}

function battleQuestEventsForProfile(room, battle, result, accountId, capturedPets) {
  const events = [];
  const encounter = room && room.encounter && typeof room.encounter === "object" && !Array.isArray(room.encounter) ? room.encounter : {};
  const encounterGroupId = String(encounter.groupId || "");
  const interactionId = String(encounter.interactionId || encounter.sourceInteractionId || "");
  for (const event of battleSpiritQuestEventsForProfile(room, battle, accountId, encounterGroupId, interactionId)) {
    events.push(event);
  }
  if (battleRoomIsPartyPveVictory(room, battle, result)) {
    events.push({
      type: "battle_victory",
      encounterGroupId,
      interactionId,
      schemaVersion: 1,
    });
    if (interactionId !== "") {
      events.push({
        type: "defeat_npc",
        encounterGroupId,
        interactionId,
        targetId: interactionId,
        schemaVersion: 1,
      });
    }
  }
  for (const pet of Array.isArray(capturedPets) ? capturedPets : []) {
    events.push({
      type: "capture_pet",
      formId: String(pet && pet.formId || ""),
      lineId: String(pet && pet.lineId || ""),
      amount: 1,
      encounterGroupId,
      schemaVersion: 1,
    });
  }
  return events;
}

function battleSpiritQuestEventsForProfile(room, battle, accountId, encounterGroupId, interactionId) {
  const eventLists = battleEventListsForQuestScan(battle);
  const result = [];
  const seenIds = new Set();
  for (const list of eventLists) {
    for (const event of Array.isArray(list.events) ? list.events : []) {
      if (!event || typeof event !== "object" || Array.isArray(event)) {
        continue;
      }
      const eventId = String(event.eventId || `${list.turnSeq || ""}:${list.round || ""}:${event.sequence || ""}:${event.actorId || ""}:${event.eventType || ""}`);
      if (seenIds.has(eventId)) {
        continue;
      }
      seenIds.add(eventId);
      if (String(event.actorAccountId || "") !== String(accountId || "")) {
        continue;
      }
      const spiritId = String(event.spiritId || event.skillId || event.actionId || "");
      if (spiritId === "" || !String(event.eventType || "").startsWith("spirit_")) {
        continue;
      }
      result.push({
        type: "use_spirit",
        spiritId,
        eventType: String(event.eventType || ""),
        encounterGroupId,
        interactionId,
        schemaVersion: 1,
      });
    }
  }
  return result;
}

function battleEventListsForQuestScan(battle) {
  const lists = [];
  for (const value of Array.isArray(battle && battle.eventLog) ? battle.eventLog : []) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      lists.push(value);
    }
  }
  const last = battle && battle.lastEventList && typeof battle.lastEventList === "object" && !Array.isArray(battle.lastEventList)
    ? battle.lastEventList
    : null;
  if (last) {
    lists.push(last);
  }
  return lists;
}

function recordQuestEventToProfile(profile, event) {
  const questId = currentProfileQuestId(profile);
  return recordQuestEventByIdToProfile(profile, questId, event);
}

function recordQuestEventByIdToProfile(profile, questId, event) {
  const quest = questById(questId);
  if (!quest) {
    return {ok: false, code: "quest_missing", changed: false, ready: false, questId: "", title: "", message: "任务不存在。"};
  }
  if (!questAvailableForProfile(profile, quest)) {
    return {ok: false, code: "quest_unavailable", changed: false, ready: false, questId, title: questTitle(quest), message: "任务暂不可接取。"};
  }
  const states = profileQuestStates(profile);
  const state = normalizeQuestState(states[questId], questId);
  if (String(state.status || "") === "claimed") {
    return {ok: false, code: "quest_already_claimed", changed: false, ready: false, questId, title: questTitle(quest), message: "任务已经完成。"};
  }
  if (String(state.status || "active") !== "active") {
    return {ok: true, changed: false, ready: String(state.status || "") === "ready", questId, title: questTitle(quest), message: ""};
  }
  const progressAmount = questProgressAmountForEvent(quest, event);
  if (progressAmount <= 0) {
    return {ok: true, changed: false, ready: false, questId, title: questTitle(quest), message: ""};
  }
  const required = questRequiredCount(quest);
  state.progress = Math.max(0, Math.min(required, Math.trunc(Number(state.progress || 0)) + progressAmount));
  const ready = state.progress >= required;
  if (ready) {
    state.status = "ready";
  }
  states[questId] = state;
  profile.questStates = states;
  return {
    ok: true,
    changed: true,
    ready,
    questId,
    title: questTitle(quest),
    message: ready ? `任务完成：${questTitle(quest)}。` : `任务更新：${questProgressText(quest, state)}。`,
  };
}

function activeQuestAutoClaim(profile) {
  const quest = questById(currentProfileQuestId(profile));
  return Boolean(quest && quest.autoClaimOnReady) && questRewardChoices(quest).length <= 0;
}

function claimActiveQuestToProfile(profile) {
  const questId = currentProfileQuestId(profile);
  return claimQuestByIdToProfile(profile, questId, "", true);
}

function claimQuestByIdToProfile(profile, questId, rewardChoiceId = "", advanceActive = true) {
  const quest = questById(questId);
  if (!quest) {
    return {ok: false, code: "quest_missing", message: "当前没有可领取的任务奖励。"};
  }
  if (!questAvailableForProfile(profile, quest)) {
    return {ok: false, code: "quest_unavailable", message: "任务暂不可领取。"};
  }
  const states = profileQuestStates(profile);
  const state = normalizeQuestState(states[questId], questId);
  if (String(state.status || "") !== "ready") {
    return {ok: false, code: "quest_not_ready", message: "任务还没有完成。"};
  }
  const choiceResult = questRewardChoiceForClaim(quest, rewardChoiceId);
  if (!choiceResult.ok) {
    return choiceResult;
  }
  const rewards = grantQuestRewardsToProfile(profile, quest, choiceResult.choice);
  state.status = "claimed";
  state.progress = questRequiredCount(quest);
  states[questId] = state;
  const nextQuestId = questNextId(quest);
  if (advanceActive && String(profile.activeQuestId || "") === questId) {
    if (nextQuestId !== "" && questById(nextQuestId)) {
      if (!states[nextQuestId]) {
        states[nextQuestId] = normalizeQuestState({}, nextQuestId);
      }
      profile.activeQuestId = nextQuestId;
    } else {
      profile.activeQuestId = "";
    }
  }
  profile.questStates = states;
  const rebirthTarget = questRebirthCompletionTarget(quest);
  if (rebirthTarget > 0) {
    profile[PLAYER_REBIRTH_QUEST_COMPLETIONS_KEY] = uniqueStringArray([
      ...uniqueStringArray(profile[PLAYER_REBIRTH_QUEST_COMPLETIONS_KEY]),
      playerRebirthQuestIdForTarget(rebirthTarget),
      `quest_rebirth_${rebirthTarget}_guidance`,
      questId,
    ]);
  }
  const rewardText = questRewardClaimText(quest, choiceResult.choice);
  return {
    ok: true,
    questId,
    nextQuestId,
    rewardChoiceId: String(choiceResult.choice && choiceResult.choice.id || ""),
    rewards,
    message: rebirthTarget > 0
      ? `完成任务「${questTitle(quest)}」，${playerRebirthTargetStageLabel(rebirthTarget)}资格已记录。`
      : (rewardText !== "" ? `完成任务「${questTitle(quest)}」，获得${rewardText}。` : `完成任务「${questTitle(quest)}」。`),
  };
}

function grantQuestRewardsToProfile(profile, quest, rewardChoice = {}) {
  const choice = rewardChoice && typeof rewardChoice === "object" && !Array.isArray(rewardChoice) ? rewardChoice : {};
  const stoneCoins = questRewardStoneCoins(quest) + Math.max(0, Math.trunc(Number(choice.stoneCoins || 0)));
  if (stoneCoins > 0) {
    profile.stoneCoins = profileStoneCoins(profile) + stoneCoins;
  }
  const itemResult = addRewardItemsToBackpack(profileBackpackSlots(profile), mergeItemAmounts([
    ...questRewardItems(quest),
    ...questRewardChoiceItems(choice),
  ]));
  profile.backpackSlots = itemResult.slots;
  profile.captureTools = captureToolBagFromProfile(profile);
  const unlockedAbilities = new Set(uniqueStringArray(profile.unlockedAbilities || []));
  const addedAbilities = [];
  for (const ability of [...questRewardAbilities(quest), ...questRewardChoiceAbilities(choice)]) {
    const abilityId = String(ability.abilityId || ability.id || "").trim();
    if (abilityId !== "" && !unlockedAbilities.has(abilityId)) {
      unlockedAbilities.add(abilityId);
      addedAbilities.push({abilityId, label: String(ability.label || abilityId)});
    }
  }
  profile.unlockedAbilities = Array.from(unlockedAbilities);
  return {
    stoneCoins,
    addedItems: itemResult.addedItems,
    lostItems: itemResult.lostItems,
    addedAbilities,
    schemaVersion: 1,
  };
}

function currentProfileQuestId(profile) {
  const explicit = String(profile && profile.activeQuestId || "").trim();
  return explicit !== "" ? explicit : firstQuestId();
}

function questAvailableForProfile(profile, quest) {
  const currentRebirthCount = Math.max(0, Math.trunc(Number(profile && profile[PLAYER_REBIRTH_COUNT_KEY] || 0)));
  const rebirthTarget = questRebirthCompletionTarget(quest);
  if (rebirthTarget > 0) {
    return rebirthTarget === currentRebirthCount + 1;
  }
  const requiredRebirth = Math.max(0, Math.trunc(Number(quest && (quest.requiredRebirthCount || quest.requiresRebirthCount) || 0)));
  if (requiredRebirth > 0 && currentRebirthCount < requiredRebirth) {
    return false;
  }
  const missingAbility = String(quest && (quest.requiredMissingAbility || quest.requiresMissingAbility) || "").trim();
  if (missingAbility !== "" && uniqueStringArray(profile && profile.unlockedAbilities).includes(missingAbility)) {
    return false;
  }
  return true;
}

function profileQuestStates(profile) {
  if (!profile.questStates || typeof profile.questStates !== "object" || Array.isArray(profile.questStates)) {
    profile.questStates = {};
  }
  return profile.questStates;
}

function questById(questId) {
  const normalizedQuestId = String(questId || "").trim();
  if (normalizedQuestId === "") {
    return null;
  }
  return quests().find((quest) => String(quest.id || "") === normalizedQuestId) || null;
}

function quests() {
  const raw = Array.isArray(questDocument().quests) ? questDocument().quests : [];
  return raw.filter((quest) => quest && typeof quest === "object" && !Array.isArray(quest) && String(quest.id || "") !== "");
}

function firstQuestId() {
  const explicit = String(questDocument().firstQuestId || "").trim();
  return questById(explicit) ? explicit : String(quests()[0] && quests()[0].id || "");
}

function questTitle(quest) {
  return String(quest && quest.title || "任务");
}

function questNextId(quest) {
  const nextId = String(quest && quest.nextQuestId || "").trim();
  return questById(nextId) ? nextId : "";
}

function questIsOptional(quest) {
  return Boolean(quest && (quest.optional || quest.isOptional));
}

function questObjectives(quest) {
  const objectives = [];
  if (Array.isArray(quest && quest.objectives)) {
    for (const value of quest.objectives) {
      if (value && typeof value === "object" && !Array.isArray(value) && String(value.type || "") !== "") {
        objectives.push(value);
      }
    }
  }
  const objective = quest && quest.objective && typeof quest.objective === "object" && !Array.isArray(quest.objective) ? quest.objective : null;
  if (objectives.length <= 0 && objective && String(objective.type || "") !== "") {
    objectives.push(objective);
  }
  return objectives;
}

function questRequiredCount(quest) {
  return Math.max(1, questObjectives(quest).reduce((sum, objective) => sum + Math.max(1, Math.trunc(Number(objective.count || 1))), 0));
}

function normalizeQuestState(value, questId) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const status = ["active", "ready", "claimed"].includes(String(raw.status || "")) ? String(raw.status || "") : "active";
  return {
    questId: String(raw.questId || questId || ""),
    status,
    progress: Math.max(0, Math.trunc(Number(raw.progress || 0))),
  };
}

function questProgressText(quest, state) {
  const required = questRequiredCount(quest);
  return `${questTitle(quest)} ${Math.max(0, Math.trunc(Number(state && state.progress || 0)))}/${required}`;
}

function questProgressAmountForEvent(quest, event) {
  let total = 0;
  for (const objective of questObjectives(quest)) {
    total += questObjectiveProgressAmountForEvent(objective, event);
  }
  return total;
}

function questObjectiveProgressAmountForEvent(objective, event) {
  const type = String(objective && objective.type || "");
  const eventType = String(event && event.type || "");
  if (type === "talk") {
    if (eventType !== "talk" || !questMatchesStringFilter(objective, event, "targetId")) {
      return 0;
    }
    return 1;
  }
  if (type === "battle_victory") {
    if (eventType !== "battle_victory" || !questMatchesStringFilter(objective, event, "encounterGroupId")) {
      return 0;
    }
    return 1;
  }
  if (type === "defeat_npc") {
    if (!["defeat_npc", "battle_victory"].includes(eventType)) {
      return 0;
    }
    if (
      !questMatchesStringFilter(objective, event, "encounterGroupId") ||
      !questMatchesStringFilter(objective, event, "interactionId") ||
      !questMatchesStringFilter(objective, event, "targetId")
    ) {
      return 0;
    }
    return 1;
  }
  if (type === "capture_pet") {
    if (eventType !== "capture_pet") {
      return 0;
    }
    const objectiveLineId = String(objective.lineId || "").trim();
    const objectiveFormId = String(objective.formId || "").trim();
    const objectiveFormPrefix = String(objective.formIdPrefix || "").trim();
    const eventLineId = String(event.lineId || "").trim();
    const eventFormId = String(event.formId || "").trim();
    if (objectiveLineId !== "" && objectiveLineId !== eventLineId) {
      return 0;
    }
    if (objectiveFormId !== "" && objectiveFormId !== eventFormId) {
      return 0;
    }
    if (objectiveFormPrefix !== "" && !eventFormId.startsWith(objectiveFormPrefix)) {
      return 0;
    }
    return Math.max(1, Math.trunc(Number(event.amount || 1)));
  }
  if (type === "deliver_pet") {
    if (eventType !== "deliver_pet") {
      return 0;
    }
    const objectiveLineId = String(objective.lineId || "").trim();
    const objectiveFormId = String(objective.formId || "").trim();
    const objectiveFormPrefix = String(objective.formIdPrefix || "").trim();
    const eventLineId = String(event.lineId || "").trim();
    const eventFormId = String(event.formId || "").trim();
    if (objectiveLineId !== "" && objectiveLineId !== eventLineId) {
      return 0;
    }
    if (objectiveFormId !== "" && objectiveFormId !== eventFormId) {
      return 0;
    }
    if (objectiveFormPrefix !== "" && !eventFormId.startsWith(objectiveFormPrefix)) {
      return 0;
    }
    const minLevel = Math.max(0, Math.trunc(Number(objective.minLevel || 0)));
    if (minLevel > 0 && Math.max(1, Math.trunc(Number(event.level || 1))) < minLevel) {
      return 0;
    }
    return Math.max(1, Math.trunc(Number(event.amount || 1)));
  }
  if (type === "buy_item") {
    if (eventType !== "buy_item") {
      return 0;
    }
    if (
      !questMatchesStringFilter(objective, event, "shopId") ||
      !questMatchesStringFilter(objective, event, "itemId")
    ) {
      return 0;
    }
    return Math.max(1, Math.trunc(Number(event.amount || 1)));
  }
  if (type === "use_world_item") {
    if (eventType !== "use_world_item") {
      return 0;
    }
    if (
      !questMatchesItemFilter(objective, event) ||
      !questMatchesStringFilter(objective, event, "targetType")
    ) {
      return 0;
    }
    return Math.max(1, Math.trunc(Number(event.amount || 1)));
  }
  if (type === "use_item") {
    if (!["use_item", "use_world_item", "battle_item"].includes(eventType)) {
      return 0;
    }
    if (
      !questMatchesItemFilter(objective, event) ||
      !questMatchesStringFilter(objective, event, "targetType")
    ) {
      return 0;
    }
    return Math.max(1, Math.trunc(Number(event.amount || 1)));
  }
  if (type === "equip_item") {
    if (eventType !== "equip_item") {
      return 0;
    }
    if (
      !questMatchesStringFilter(objective, event, "itemId") ||
      !questMatchesStringFilter(objective, event, "slot")
    ) {
      return 0;
    }
    return Math.max(1, Math.trunc(Number(event.amount || 1)));
  }
  if (type === "synthesize_equipment") {
    if (eventType !== "synthesize_equipment") {
      return 0;
    }
    if (
      !questMatchesStringFilter(objective, event, "recipeId") ||
      !questMatchesStringFilter(objective, event, "itemId") ||
      !questMatchesStringFilter(objective, event, "outputItemId") ||
      !questMatchesStringFilter(objective, event, "category")
    ) {
      return 0;
    }
    return Math.max(1, Math.trunc(Number(event.amount || 1)));
  }
  if (type === "enhance_equipment") {
    if (eventType !== "enhance_equipment") {
      return 0;
    }
    if (
      !questMatchesStringFilter(objective, event, "itemId") ||
      !questMatchesStringFilter(objective, event, "slotId") ||
      !questMatchesStringFilter(objective, event, "slot")
    ) {
      return 0;
    }
    const requiredLevel = Math.max(0, Math.trunc(Number(objective && objective.level || 0)));
    if (requiredLevel > 0 && Math.max(0, Math.trunc(Number(event && event.level || 0))) < requiredLevel) {
      return 0;
    }
    return Math.max(1, Math.trunc(Number(event.amount || 1)));
  }
  if (type === "use_spirit") {
    if (eventType !== "use_spirit") {
      return 0;
    }
    if (
      !questMatchesStringFilter(objective, event, "spiritId") ||
      !questMatchesStringFilter(objective, event, "eventType") ||
      !questMatchesStringFilter(objective, event, "encounterGroupId")
    ) {
      return 0;
    }
    return 1;
  }
  if (type === "reach_map") {
    if (!["reach_map", "enter_map"].includes(eventType)) {
      return 0;
    }
    if (
      !questMatchesStringFilter(objective, event, "mapId") ||
      !questMatchesStringFilter(objective, event, "regionId")
    ) {
      return 0;
    }
    return Math.max(1, Math.trunc(Number(event.amount || 1)));
  }
  if (type === "reach_npc") {
    if (!["reach_npc", "reach_interaction"].includes(eventType)) {
      return 0;
    }
    if (
      !questMatchesStringFilter(objective, event, "targetId") ||
      !questMatchesStringFilter(objective, event, "interactionId") ||
      !questMatchesStringFilter(objective, event, "mapId")
    ) {
      return 0;
    }
    return Math.max(1, Math.trunc(Number(event.amount || 1)));
  }
  return 0;
}

function questMatchesStringFilter(objective, event, key) {
  const expected = String(objective && objective[key] || "").trim();
  return expected === "" || String(event && event[key] || "").trim() === expected;
}

function questMatchesItemFilter(objective, event) {
  return questMatchesStringFilter(objective, event, "itemId");
}

function questRewardBundle(quest) {
  return quest && quest.rewards && typeof quest.rewards === "object" && !Array.isArray(quest.rewards) ? quest.rewards : {};
}

function questRewardStoneCoins(quest) {
  return Math.max(0, Math.trunc(Number(questRewardBundle(quest).stoneCoins || 0)));
}

function questRewardItems(quest) {
  return mergeItemAmounts(Array.isArray(questRewardBundle(quest).items) ? questRewardBundle(quest).items : []);
}

function questRewardAbilities(quest) {
  const raw = Array.isArray(questRewardBundle(quest).abilities)
    ? questRewardBundle(quest).abilities
    : (Array.isArray(questRewardBundle(quest).unlockAbilities) ? questRewardBundle(quest).unlockAbilities : []);
  return raw
    .map((value) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const abilityId = String(value.abilityId || value.id || "").trim();
        return abilityId !== "" ? {abilityId, label: String(value.label || abilityId)} : null;
      }
      const abilityId = String(value || "").trim();
      return abilityId !== "" ? {abilityId, label: abilityId} : null;
    })
    .filter(Boolean);
}

function questRewardChoices(quest) {
  const raw = questRewardBundle(quest).choices || questRewardBundle(quest).choiceRewards || [];
  return Array.isArray(raw) ? raw.filter((choice) => choice && typeof choice === "object" && !Array.isArray(choice)) : [];
}

function questRewardChoiceForClaim(quest, rewardChoiceId) {
  const choices = questRewardChoices(quest);
  if (choices.length <= 0) {
    return {ok: true, choice: {}};
  }
  const normalizedChoiceId = String(rewardChoiceId || "").trim();
  const choice = choices.find((entry) => String(entry.id || "") === normalizedChoiceId) || null;
  if (!choice) {
    return {ok: false, code: "quest_reward_choice_required", message: "请选择任务奖励。", requiresChoice: true};
  }
  return {ok: true, choice: normalizedQuestRewardChoice(choice)};
}

function normalizedQuestRewardChoice(choice) {
  const value = choice && typeof choice === "object" && !Array.isArray(choice) ? choice : {};
  return {
    id: String(value.id || ""),
    label: String(value.label || ""),
    stoneCoins: Math.max(0, Math.trunc(Number(value.stoneCoins || 0))),
    items: questRewardChoiceItems(value),
    abilities: questRewardChoiceAbilities(value),
  };
}

function questRewardChoiceItems(choice) {
  return mergeItemAmounts(Array.isArray(choice && choice.items) ? choice.items : []);
}

function questRewardChoiceAbilities(choice) {
  const raw = Array.isArray(choice && choice.abilities)
    ? choice.abilities
    : (Array.isArray(choice && choice.unlockAbilities) ? choice.unlockAbilities : []);
  return raw
    .map((value) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const abilityId = String(value.abilityId || value.id || "").trim();
        return abilityId !== "" ? {abilityId, label: String(value.label || abilityId)} : null;
      }
      const abilityId = String(value || "").trim();
      return abilityId !== "" ? {abilityId, label: abilityId} : null;
    })
    .filter(Boolean);
}

function questRewardText(quest) {
  return questRewardBundleText({
    stoneCoins: questRewardStoneCoins(quest),
    items: questRewardItems(quest),
    abilities: questRewardAbilities(quest),
  });
}

function questRewardClaimText(quest, choice = {}) {
  const parts = [];
  const fixedText = questRewardText(quest);
  if (fixedText !== "") {
    parts.push(fixedText);
  }
  const choiceText = questRewardBundleText(choice);
  if (choiceText !== "") {
    parts.push(choiceText);
  }
  return parts.filter(Boolean).join("、");
}

function questRewardBundleText(bundle) {
  const parts = [];
  const coins = Math.max(0, Math.trunc(Number(bundle && bundle.stoneCoins || 0)));
  if (coins > 0) {
    parts.push(`${coins}石币`);
  }
  const items = Array.isArray(bundle && bundle.items) ? bundle.items : [];
  for (const item of mergeItemAmounts(items)) {
    parts.push(`${bagItemLabel(String(item.itemId || ""))} x${Math.max(0, Math.trunc(Number(item.count || 0)))}`);
  }
  const abilities = Array.isArray(bundle && bundle.abilities) ? bundle.abilities : [];
  for (const ability of abilities) {
    parts.push(String(ability.label || ability.abilityId || ""));
  }
  return parts.filter(Boolean).join("、");
}

function questRebirthCompletionTarget(quest) {
  return Math.max(0, Math.trunc(Number(quest && quest.rebirthQuestTarget || quest && quest.rebirthCompletionTarget || 0)));
}

function normalizedQuestEventPayload(event) {
  const source = event && typeof event === "object" && !Array.isArray(event) ? event : {};
  const result = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) {
      continue;
    }
    result[key] = value;
  }
  result.type = String(result.type || result.eventType || "").trim();
  result.questId = String(result.questId || "").trim();
  result.targetId = String(result.targetId || result.interactionId || result.npcId || "").trim();
  result.interactionId = String(result.interactionId || "").trim();
  result.itemId = String(result.itemId || "").trim();
  result.shopId = String(result.shopId || "").trim();
  result.slot = String(result.slot || result.slotId || "").trim();
  result.slotId = String(result.slotId || result.slot || "").trim();
  result.amount = Math.max(1, Math.trunc(Number(result.amount || 1)));
  result.schemaVersion = 1;
  return result;
}

function publicQuestProgress(progress) {
  return {
    questId: String(progress && progress.questId || ""),
    title: String(progress && progress.title || ""),
    changed: Boolean(progress && progress.changed),
    ready: Boolean(progress && progress.ready),
    message: String(progress && progress.message || ""),
    schemaVersion: 1,
  };
}

function publicQuestClaim(claim) {
  return {
    questId: String(claim && claim.questId || ""),
    nextQuestId: String(claim && claim.nextQuestId || ""),
    rewardChoiceId: String(claim && claim.rewardChoiceId || ""),
    rewards: claim && claim.rewards && typeof claim.rewards === "object" && !Array.isArray(claim.rewards) ? clone(claim.rewards) : {},
    message: String(claim && claim.message || ""),
    schemaVersion: 1,
  };
}

function persistProfileForAccount(data, account, binding, profile, now) {
  const updatedAt = isoNow(now);
  const nextRevision = Number(binding.profileRevision || 0) + 1;
  binding.profileRevision = nextRevision;
  binding.updatedAt = updatedAt;
  data.profileBindings[account.accountId] = binding;
  data.profiles[binding.playerId] = {
    playerId: binding.playerId,
    accountId: account.accountId,
    profileRevision: nextRevision,
    profile,
    updatedAt,
    schemaVersion: 1,
  };
  return {binding, profileDoc: data.profiles[binding.playerId]};
}

function battleRoomProfileExpReward(room, battle, result, profile, accountId) {
  if (!battleRoomIsPartyPveVictory(room, battle, result)) {
    return null;
  }
  return battleExpRewardForProfile(room, battle, accountId);
}

function battleRoomIsPartyPveVictory(room, battle, result) {
  if (String(room && room.mode || BATTLE_MODE_DUEL) !== BATTLE_MODE_PARTY_PVE) {
    return false;
  }
  if (!result || typeof result !== "object" || String(result.winnerAccountId || "") === "") {
    return false;
  }
  return !battleHasLivingEnemy(battle);
}

function applyBattleVictoryRewardsToProfile(profile, room, battle, result) {
  if (!battleRoomIsPartyPveVictory(room, battle, result)) {
    return {changed: false, publicRewards: null};
  }
  const reward = battleVictoryRewardForRoom(room);
  if (!reward || (reward.stoneCoins <= 0 && reward.items.length <= 0)) {
    return {changed: false, publicRewards: null};
  }
  let changed = false;
  const previousCoins = profileStoneCoins(profile);
  if (reward.stoneCoins > 0) {
    profile.stoneCoins = previousCoins + reward.stoneCoins;
    changed = true;
  }
  const beforeSlots = normalizeBackpackSlots(profileBackpackSlots(profile));
  const itemResult = addRewardItemsToBackpack(beforeSlots, reward.items);
  if (itemResult.changed) {
    profile.backpackSlots = itemResult.slots;
    profile.captureTools = captureToolBagFromProfile(profile);
    changed = true;
  }
  const publicRewards = {
    tableId: reward.tableId,
    sourceZoneId: reward.sourceZoneId,
    sourceEncounterGroupId: reward.sourceEncounterGroupId,
    stoneCoins: reward.stoneCoins,
    addedItems: itemResult.addedItems,
    lostItems: itemResult.lostItems,
    schemaVersion: 1,
  };
  return {changed, publicRewards};
}

function applyBattleSpecialVictoryProgressToProfile(profile, room, battle, result) {
  if (!battleRoomIsPartyPveVictory(room, battle, result)) {
    return {changed: false, publicSpecial: null};
  }
  const encounter = room && room.encounter && typeof room.encounter === "object" && !Array.isArray(room.encounter) ? room.encounter : {};
  const groupId = String(encounter.groupId || "").trim();
  let changed = false;
  const messages = [];
  const publicSpecial = {
    sourceEncounterGroupId: groupId,
    rebirthTrialProofs: null,
    petRebirthMm: null,
    messages,
    schemaVersion: 1,
  };
  if (groupId === PLAYER_REBIRTH_FINAL_BOSS_PROOF_ID) {
    const proofs = objectOrEmpty(profile[PLAYER_REBIRTH_TRIAL_PROOFS_KEY]);
    const previousCount = Math.max(0, Math.trunc(Number(proofs[PLAYER_REBIRTH_FINAL_BOSS_PROOF_ID] || 0)));
    const nextCount = previousCount + 1;
    proofs[PLAYER_REBIRTH_FINAL_BOSS_PROOF_ID] = nextCount;
    profile[PLAYER_REBIRTH_TRIAL_PROOFS_KEY] = proofs;
    changed = true;
    publicSpecial.rebirthTrialProofs = {
      proofId: PLAYER_REBIRTH_FINAL_BOSS_PROOF_ID,
      previousCount,
      count: nextCount,
      schemaVersion: 1,
    };
    messages.push("玄影守护证明已记录。");
  }
  if (groupId === PET_REBIRTH_MM_TRIAL_GROUP_ID) {
    const grant = grantPetRebirthMm(profile, 1, groupId);
    if (grant.ok) {
      changed = true;
      publicSpecial.petRebirthMm = {
        stage: 1,
        instanceId: String(grant.instanceId || ""),
        message: String(grant.message || ""),
        schemaVersion: 1,
      };
      if (grant.message) {
        messages.push(grant.message);
      }
    } else {
      publicSpecial.petRebirthMm = {
        stage: 1,
        ok: false,
        code: String(grant.code || "pet_rebirth_mm_grant_failed"),
        message: String(grant.message || "1转小MM发放失败。"),
        schemaVersion: 1,
      };
    }
  }
  return {changed, publicSpecial: changed || publicSpecial.petRebirthMm ? publicSpecial : null};
}

function battleVictoryRewardForRoom(room) {
  const table = battleRewardTableForRoom(room);
  if (!table || Object.keys(table).length === 0) {
    return null;
  }
  const encounter = room && room.encounter && typeof room.encounter === "object" && !Array.isArray(room.encounter) ? room.encounter : {};
  const tableId = String(table.id || "");
  const seedBase = String(room && (room.seed || room.roomId) || "battle");
  return {
    tableId,
    sourceZoneId: String(encounter.zoneId || ""),
    sourceEncounterGroupId: String(encounter.groupId || ""),
    stoneCoins: battleRewardStoneCoins(seedBase, table),
    items: battleRewardItems(seedBase, table),
  };
}

function battleRewardTableForRoom(room) {
  const encounter = room && room.encounter && typeof room.encounter === "object" && !Array.isArray(room.encounter) ? room.encounter : {};
  const groupId = String(encounter.groupId || "").trim();
  if (groupId !== "") {
    const groupTable = battleRewardTableForId(groupId);
    if (Object.keys(groupTable).length > 0) {
      return groupTable;
    }
  }
  const zoneId = String(encounter.zoneId || "").trim();
  if (zoneId !== "") {
    const zoneTable = battleRewardTableForId(zoneId);
    if (Object.keys(zoneTable).length > 0) {
      return zoneTable;
    }
  }
  return battleRewardTables().find((table) => Boolean(table.fallback)) || {};
}

function battleRewardTableForId(tableId) {
  const normalizedTableId = String(tableId || "").trim();
  if (normalizedTableId === "") {
    return {};
  }
  return battleRewardTables().find((table) => String(table.id || "") === normalizedTableId) || {};
}

function battleRewardTables() {
  const tables = battleRewardDocument().rewardTables;
  if (!Array.isArray(tables)) {
    return [];
  }
  return tables.filter((table) => table && typeof table === "object" && !Array.isArray(table) && String(table.id || "") !== "");
}

function battleRewardStoneCoins(seedBase, table) {
  const coinReward = table && table.stoneCoins && typeof table.stoneCoins === "object" && !Array.isArray(table.stoneCoins)
    ? table.stoneCoins
    : {};
  if (Object.keys(coinReward).length === 0) {
    return 0;
  }
  const chance = clampNumber(coinReward.chance, 0, 1, 1);
  const tableId = String(table.id || "");
  const seedText = `${seedBase}:reward:${tableId}:stoneCoins`;
  if (chance < 1 && stableTextRoll(seedText) >= chance) {
    return 0;
  }
  const minCount = Math.max(0, Math.trunc(Number(coinReward.min || coinReward.count || 0)));
  const maxCount = Math.max(minCount, Math.trunc(Number(coinReward.max || minCount)));
  if (maxCount <= minCount) {
    return minCount;
  }
  return minCount + stableTextIndex(`${seedText}:count`, maxCount - minCount + 1);
}

function battleRewardItems(seedBase, table) {
  const rawRewards = Array.isArray(table && table.rewards) ? table.rewards : [];
  const tableId = String(table && table.id || "");
  const rewards = [];
  rawRewards.forEach((reward, index) => {
    if (!reward || typeof reward !== "object" || Array.isArray(reward)) {
      return;
    }
    const itemId = String(reward.itemId || "").trim();
    if (!bagItemById(itemId)) {
      return;
    }
    const chance = clampNumber(reward.chance, 0, 1, 1);
    const seedText = `${seedBase}:reward:${tableId}:${itemId}:${index}`;
    if (chance < 1 && stableTextRoll(seedText) >= chance) {
      return;
    }
    const minCount = Math.max(0, Math.trunc(Number(reward.min || reward.count || 1)));
    const maxCount = Math.max(minCount, Math.trunc(Number(reward.max || minCount)));
    let count = minCount;
    if (maxCount > minCount) {
      count += stableTextIndex(`${seedText}:count`, maxCount - minCount + 1);
    }
    if (count > 0) {
      rewards.push({itemId, count});
    }
  });
  return mergeItemAmounts(rewards);
}

function stableTextRoll(seedText) {
  return stableTextIndex(seedText, 10000) / 10000;
}

function stableTextIndex(seedText, count) {
  const safeCount = Math.max(0, Math.trunc(Number(count || 0)));
  if (safeCount <= 0) {
    return 0;
  }
  let value = 17;
  for (const char of String(seedText || "")) {
    value = (value * 131 + char.codePointAt(0)) % 2147483647;
  }
  return value % safeCount;
}

function profileStoneCoins(profile) {
  return Math.max(0, Math.trunc(Number(profile && profile.stoneCoins || 0)));
}

function normalizeShopTransactionMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (["buy", "purchase"].includes(mode)) {
    return SHOP_TRANSACTION_BUY;
  }
  if (["sell"].includes(mode)) {
    return SHOP_TRANSACTION_SELL;
  }
  return "";
}

function shops() {
  const raw = shopDocument().shops;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((shop) => shop && typeof shop === "object" && !Array.isArray(shop) && String(shop.id || "") !== "");
}

function shopForId(shopId) {
  const normalizedShopId = String(shopId || "").trim();
  if (normalizedShopId === "") {
    return null;
  }
  return shops().find((shop) => String(shop.id || "") === normalizedShopId) || null;
}

function shopEntries(shopId) {
  const shop = shopForId(shopId);
  const entries = shop && Array.isArray(shop.items) ? shop.items : [];
  return entries.filter((entry) => (
    entry &&
    typeof entry === "object" &&
    !Array.isArray(entry) &&
    String(entry.itemId || "") !== "" &&
    bagItemById(entry.itemId)
  ));
}

function shopEntryForItem(shopId, itemId) {
  const normalizedItemId = String(itemId || "").trim();
  if (normalizedItemId === "") {
    return null;
  }
  return shopEntries(shopId).find((entry) => String(entry.itemId || "") === normalizedItemId) || null;
}

function shopCurrencyFor(shopId) {
  const shop = shopForId(shopId);
  const rawCurrency = String(shop && shop.currency || SHOP_CURRENCY_STONE_COINS).trim();
  return rawCurrency === SHOP_CURRENCY_DIAMONDS || rawCurrency === "diamond"
    ? SHOP_CURRENCY_DIAMONDS
    : SHOP_CURRENCY_STONE_COINS;
}

function shopCurrencyLabel(currency) {
  return String(currency || "") === SHOP_CURRENCY_DIAMONDS ? "钻石" : "石币";
}

function shopBuyPrice(entry) {
  return Math.max(0, Math.trunc(Number(entry && entry.buyPrice || 0)));
}

function shopSellPrice(shopId, entry) {
  if (entry && Object.prototype.hasOwnProperty.call(entry, "sellPrice")) {
    return Math.max(0, Math.trunc(Number(entry.sellPrice || 0)));
  }
  const buyPrice = shopBuyPrice(entry);
  const sellRate = shopDefaultSellRate();
  return buyPrice > 0 ? Math.max(1, Math.floor(buyPrice * sellRate)) : 0;
}

function shopEntryIsBuyable(entry) {
  if (!entry) {
    return false;
  }
  return entry.buyable !== false && shopBuyPrice(entry) > 0;
}

function shopEntryIsSellable(shopId, entry) {
  if (!entry) {
    return false;
  }
  return entry.sellable !== false && shopSellPrice(shopId, entry) > 0;
}

function shopDefaultSellRate() {
  const shop = rewardEconomyDocument().shop;
  const rawRate = shop && typeof shop === "object" && !Array.isArray(shop) ? Number(shop.defaultSellRate || 0.5) : 0.5;
  if (!Number.isFinite(rawRate)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, rawRate));
}

function profileCurrencyAmount(profile, currency) {
  if (String(currency || "") === SHOP_CURRENCY_DIAMONDS) {
    return Math.max(0, Math.trunc(Number(profile && profile.diamonds || 0)));
  }
  return profileStoneCoins(profile);
}

function setProfileCurrencyAmount(profile, currency, amount) {
  const safeAmount = Math.max(0, Math.trunc(Number(amount || 0)));
  if (String(currency || "") === SHOP_CURRENCY_DIAMONDS) {
    profile.diamonds = safeAmount;
    return;
  }
  profile.stoneCoins = safeAmount;
}

function addRewardItemsToBackpack(slots, rewards) {
  let nextSlots = normalizeBackpackSlots(slots);
  const addedItems = [];
  const lostItems = [];
  for (const reward of mergeItemAmounts(Array.isArray(rewards) ? rewards : [])) {
    const itemId = String(reward.itemId || "").trim();
    const count = Math.max(0, Math.trunc(Number(reward.count || 0)));
    if (itemId === "" || count <= 0 || !bagItemById(itemId)) {
      continue;
    }
    const addResult = addSingleItemToBackpack(nextSlots, itemId, count);
    nextSlots = addResult.slots;
    if (addResult.addedCount > 0) {
      addedItems.push({itemId, count: addResult.addedCount});
    }
    const lostCount = Math.max(0, count - addResult.addedCount);
    if (lostCount > 0) {
      lostItems.push({itemId, count: lostCount});
    }
  }
  nextSlots = normalizeBackpackSlots(nextSlots);
  return {
    slots: nextSlots,
    addedItems: mergeItemAmounts(addedItems),
    lostItems: mergeItemAmounts(lostItems),
    changed: JSON.stringify(normalizeBackpackSlots(slots)) !== JSON.stringify(nextSlots),
  };
}

function addSingleItemToBackpack(slots, itemId, count) {
  const nextSlots = normalizeBackpackSlots(slots);
  let remaining = Math.max(0, Math.trunc(Number(count || 0)));
  const stackLimit = bagItemStackLimit(itemId);
  for (let index = 0; index < nextSlots.length && remaining > 0; index += 1) {
    const slot = nextSlots[index] && typeof nextSlots[index] === "object" && !Array.isArray(nextSlots[index]) ? nextSlots[index] : {};
    if (String(slot.itemId || "") !== itemId) {
      continue;
    }
    const currentCount = Math.max(0, Math.trunc(Number(slot.count || 0)));
    const room = Math.max(0, stackLimit - currentCount);
    if (room <= 0) {
      continue;
    }
    const moveCount = Math.min(room, remaining);
    slot.count = currentCount + moveCount;
    nextSlots[index] = slot;
    remaining -= moveCount;
  }
  for (let index = 0; index < nextSlots.length && remaining > 0; index += 1) {
    const slot = nextSlots[index] && typeof nextSlots[index] === "object" && !Array.isArray(nextSlots[index]) ? nextSlots[index] : {};
    if (String(slot.itemId || "") !== "") {
      continue;
    }
    const moveCount = Math.min(stackLimit, remaining);
    nextSlots[index] = {itemId, count: moveCount};
    remaining -= moveCount;
  }
  return {
    slots: nextSlots,
    addedCount: Math.max(0, Math.trunc(Number(count || 0))) - remaining,
  };
}

function consumeBackpackItem(slots, itemId, count) {
  const normalizedItemId = String(itemId || "").trim();
  let remaining = Math.max(0, Math.trunc(Number(count || 0)));
  const nextSlots = normalizeBackpackSlots(slots);
  for (let index = 0; index < nextSlots.length && remaining > 0; index += 1) {
    const slot = nextSlots[index] && typeof nextSlots[index] === "object" && !Array.isArray(nextSlots[index]) ? nextSlots[index] : {};
    if (String(slot.itemId || "") !== normalizedItemId) {
      continue;
    }
    const currentCount = Math.max(0, Math.trunc(Number(slot.count || 0)));
    const consumeCount = Math.min(currentCount, remaining);
    const nextCount = Math.max(0, currentCount - consumeCount);
    remaining -= consumeCount;
    nextSlots[index] = nextCount > 0 ? {itemId: normalizedItemId, count: nextCount} : {};
  }
  return normalizeBackpackSlots(nextSlots);
}

function normalizeBackpackSlots(value, explicitSlotLimit = -1) {
  const counts = {};
  if (Array.isArray(value)) {
    for (const rawSlot of value) {
      const slot = rawSlot && typeof rawSlot === "object" && !Array.isArray(rawSlot) ? rawSlot : {};
      const itemId = String(slot.itemId || "").trim();
      if (!bagItemById(itemId)) {
        continue;
      }
      const count = Math.max(0, Math.trunc(Number(slot.count || 0)));
      if (count <= 0) {
        continue;
      }
      counts[itemId] = Math.max(0, Math.trunc(Number(counts[itemId] || 0))) + count;
    }
  }
  return backpackSlotsFromCounts(counts, backpackSlotLimitFromValue(value, explicitSlotLimit));
}

function backpackSlotsFromCounts(counts, slotLimit) {
  const limit = resolvedBackpackSlotLimit(slotLimit);
  const result = [];
  for (const item of bagItems()) {
    const itemId = String(item.id || "");
    if (itemId === "") {
      continue;
    }
    let remaining = Math.max(0, Math.trunc(Number(counts[itemId] || 0)));
    const stackLimit = bagItemStackLimit(itemId);
    while (remaining > 0 && result.length < limit) {
      const stackCount = Math.min(remaining, stackLimit);
      result.push({itemId, count: stackCount});
      remaining -= stackCount;
    }
  }
  while (result.length < limit) {
    result.push({});
  }
  return result;
}

function backpackSlotLimitFromValue(value, explicitSlotLimit = -1) {
  const explicit = Math.trunc(Number(explicitSlotLimit || 0));
  if (explicit > 0) {
    return resolvedBackpackSlotLimit(explicit);
  }
  if (Array.isArray(value) && value.length > 0) {
    return resolvedBackpackSlotLimit(value.length);
  }
  return BACKPACK_BASE_SLOT_LIMIT;
}

function resolvedBackpackSlotLimit(value) {
  const limit = Math.trunc(Number(value || BACKPACK_BASE_SLOT_LIMIT));
  return Math.max(BACKPACK_BASE_SLOT_LIMIT, Math.min(BACKPACK_SLOT_LIMIT, limit));
}

function bagItems() {
  const items = bagItemDocument().items;
  if (!Array.isArray(items)) {
    return [];
  }
  return items.filter((item) => item && typeof item === "object" && !Array.isArray(item) && String(item.id || "") !== "");
}

function bagItemById(itemId) {
  const normalizedItemId = String(itemId || "").trim();
  if (normalizedItemId === "") {
    return null;
  }
  return bagItems().find((item) => String(item.id || "") === normalizedItemId) || null;
}

function bagItemLabel(itemId) {
  const item = bagItemById(itemId);
  return item ? String(item.label || item.name || item.id || "物品") : battleItemLabel(itemId);
}

function bagItemStackLimit(itemId) {
  const item = bagItemById(itemId);
  return Math.max(1, Math.trunc(Number(item && item.stackLimit || 1)));
}

function petTemplateForFormId(formId) {
  const normalizedFormId = String(formId || "").trim();
  if (normalizedFormId === "") {
    return {};
  }
  const forms = Array.isArray(petTemplateDocument().forms) ? petTemplateDocument().forms : [];
  return forms.find((form) => form && typeof form === "object" && !Array.isArray(form) && String(form.formId || "") === normalizedFormId) || {};
}

function mergeItemAmounts(entries) {
  const order = [];
  const counts = {};
  for (const entry of Array.isArray(entries) ? entries : []) {
    const itemId = String(entry && entry.itemId || "").trim();
    const count = Math.max(0, Math.trunc(Number(entry && entry.count || 0)));
    if (itemId === "" || count <= 0) {
      continue;
    }
    if (!order.includes(itemId)) {
      order.push(itemId);
    }
    counts[itemId] = Math.max(0, Math.trunc(Number(counts[itemId] || 0))) + count;
  }
  return order.map((itemId) => ({itemId, count: counts[itemId]}));
}

function itemAmountText(entries) {
  const parts = mergeItemAmounts(entries).map((entry) => {
    const itemId = String(entry.itemId || "");
    const count = Math.max(0, Math.trunc(Number(entry.count || 0)));
    return `${bagItemLabel(itemId)} x${count}`;
  });
  return parts.filter(Boolean).join("、");
}

function battleHasLivingEnemy(battle) {
  const actors = Array.isArray(battle && battle.actors) ? battle.actors : [];
  return actors.some((actor) => (
    actor &&
    String(actor.side || "") === BATTLE_SIDE_ENEMY &&
    Number(actor.hp || 0) > 0
  ));
}

function battleExpCreditsForDefeat(room, battle, actor, target, hpBefore, hpAfter) {
  if (String(room && room.mode || BATTLE_MODE_DUEL) !== BATTLE_MODE_PARTY_PVE) {
    return [];
  }
  if (!actor || !target || Number(hpBefore || 0) <= 0 || Number(hpAfter || 0) > 0) {
    return [];
  }
  if (String(target.side || "") !== BATTLE_SIDE_ENEMY) {
    return [];
  }
  const recipients = battleExpRecipientsForActor(room, actor, target);
  if (recipients.length <= 0) {
    return [];
  }
  const credit = {
    targetActorId: String(target.actorId || ""),
    targetName: String(target.displayName || target.username || "野生宠物"),
    targetKind: String(target.kind || BATTLE_ACTOR_KIND_WILD_PET),
    enemyLevel: Math.max(1, Math.trunc(Number(target.level || 1))),
    rawBaseAmount: battleEnemyBaseExpFromActor(target),
    recipients,
    schemaVersion: 1,
  };
  return [credit];
}

function appendBattleExpCredits(battle, credits) {
  if (!battle || !Array.isArray(credits) || credits.length <= 0) {
    return;
  }
  const existing = Array.isArray(battle.expCredits) ? battle.expCredits : [];
  battle.expCredits = existing.concat(credits).slice(-200);
}

function battleExpRecipientsForActor(room, actor, target) {
  const primary = battlePrimaryExpRecipientForActor(room, actor, target);
  if (!primary) {
    return [];
  }
  const recipients = [primary];
  if (
    primary.type === "player" &&
    String(actor.ridePetInstanceId || "").trim() !== "" &&
    Number(actor.ridePetMaxHp || 0) > 0
  ) {
    const rideScaledAmount = Math.max(0, Math.trunc(Number(primary.scaledAmount || 0) * BATTLE_RIDE_PET_EXP_RATE));
    if (rideScaledAmount > 0) {
      recipients.push(battleExpRecipient({
        type: "ride_pet",
        accountId: primary.accountId,
        actorId: String(actor.actorId || ""),
        actorKind: BATTLE_ACTOR_KIND_PET,
        petId: String(actor.ridePetInstanceId || ""),
        name: String(actor.ridePetName || "骑宠"),
        level: Math.max(1, Math.trunc(Number(actor.ridePetLevel || primary.recipientLevel || 1))),
        target,
        scaledAmountOverride: rideScaledAmount,
        rawBaseAmount: primary.rawBaseAmount,
        partyBonusRate: primary.partyBonusRate,
        humanPlayerCount: primary.humanPlayerCount,
      }));
    }
  }
  return recipients;
}

function battlePrimaryExpRecipientForActor(room, actor, target) {
  const actorKind = String(actor.kind || BATTLE_ACTOR_KIND_PLAYER);
  const ownerAccountId = String(actor.ownerAccountId || "").trim();
  const partnerId = String(actor.partnerId || "").trim();
  if (ownerAccountId !== "" && partnerId !== "") {
    return battleExpRecipient({
      type: actorKind === BATTLE_ACTOR_KIND_PET ? "training_partner_pet" : "training_partner_player",
      accountId: ownerAccountId,
      actorId: String(actor.actorId || ""),
      actorKind,
      petId: String(actor.petId || ""),
      partnerId,
      name: String(actor.displayName || "伙伴"),
      level: Math.max(1, Math.trunc(Number(actor.level || 1))),
      target,
      partyBonusRate: battlePartyExpBonusRate(room),
      humanPlayerCount: battlePartyHumanPlayerCount(room),
    });
  }
  const accountId = String(actor.accountId || "").trim();
  if (accountId === "") {
    return null;
  }
  return battleExpRecipient({
    type: actorKind === BATTLE_ACTOR_KIND_PET ? "pet" : "player",
    accountId,
    actorId: String(actor.actorId || ""),
    actorKind,
    petId: String(actor.petId || ""),
    name: String(actor.displayName || actor.username || ""),
    level: Math.max(1, Math.trunc(Number(actor.level || 1))),
    target,
    partyBonusRate: battlePartyExpBonusRate(room),
    humanPlayerCount: battlePartyHumanPlayerCount(room),
  });
}

function battleExpRecipient(options) {
  const target = options.target || {};
  const rawBaseAmount = Math.max(1, Math.trunc(Number(options.rawBaseAmount || battleEnemyBaseExpFromActor(target))));
  const enemyLevel = Math.max(1, Math.trunc(Number(target.level || 1)));
  const recipientLevel = Math.max(1, Math.trunc(Number(options.level || 1)));
  const scaledAmount = options.scaledAmountOverride !== undefined
    ? Math.max(0, Math.trunc(Number(options.scaledAmountOverride || 0)))
    : battleScaledExpForRecipientLevel(rawBaseAmount, recipientLevel, enemyLevel);
  const partyBonusRate = Math.max(0, Number(options.partyBonusRate || 0));
  const amount = battleExpAmountWithPartyBonus(scaledAmount, partyBonusRate);
  return {
    type: String(options.type || ""),
    accountId: String(options.accountId || ""),
    actorId: String(options.actorId || ""),
    actorKind: String(options.actorKind || ""),
    petId: String(options.petId || ""),
    partnerId: String(options.partnerId || ""),
    name: String(options.name || ""),
    recipientLevel,
    enemyLevel,
    targetActorId: String(target.actorId || ""),
    targetName: String(target.displayName || target.username || "野生宠物"),
    rawBaseAmount,
    scaledAmount,
    baseAmount: scaledAmount,
    partyBonusRate,
    partyBonusPercent: Math.round(partyBonusRate * 100),
    partyBonusAmount: Math.max(0, amount - scaledAmount),
    humanPlayerCount: Math.max(1, Math.trunc(Number(options.humanPlayerCount || 1))),
    amount,
    schemaVersion: 1,
  };
}

function battleEnemyBaseExpFromActor(actor) {
  const explicit = Math.trunc(Number(actor && (actor.expReward || actor.experience || actor.exp) || 0));
  if (explicit > 0) {
    return explicit;
  }
  return battleEnemyBaseExpFromEntry(actor || {});
}

function battleMaxEnemyLevel(battle) {
  const actors = Array.isArray(battle && battle.actors) ? battle.actors : [];
  return actors.reduce((maxLevel, actor) => {
    if (!actor || String(actor.side || "") !== BATTLE_SIDE_ENEMY) {
      return maxLevel;
    }
    return Math.max(maxLevel, Math.max(1, Math.trunc(Number(actor.level || 1))));
  }, 1);
}


function battlePartyHumanPlayerCount(room) {
  const ids = Array.isArray(room && room.participantAccountIds) ? room.participantAccountIds : [];
  const uniqueIds = new Set(ids.map((value) => String(value || "").trim()).filter(Boolean));
  return Math.max(1, Math.min(5, uniqueIds.size));
}

function battlePartyExpBonusRate(room) {
  const count = battlePartyHumanPlayerCount(room);
  return Number(BATTLE_PARTY_EXP_BONUS_RATES[count] || 0);
}

function battleExpAmountWithPartyBonus(amount, partyBonusRate) {
  const base = Math.max(0, Math.trunc(Number(amount || 0)));
  if (base <= 0) {
    return 0;
  }
  const rate = Math.max(0, Number(partyBonusRate || 0));
  return Math.max(1, Math.round(base * (1 + rate)));
}

function battleExpRewardForProfile(room, battle, accountId) {
  const normalizedAccountId = String(accountId || "");
  const credits = Array.isArray(battle && battle.expCredits) ? battle.expCredits : [];
  const partyBonusRate = battlePartyExpBonusRate(room);
  const humanPlayerCount = battlePartyHumanPlayerCount(room);
  const reward = {
    amount: 0,
    baseAmount: 0,
    rawBaseAmount: 0,
    scaledAmount: 0,
    partyBonusAmount: 0,
    partyBonusRate,
    partyBonusPercent: Math.round(partyBonusRate * 100),
    humanPlayerCount,
    enemyMaxLevel: battleMaxEnemyLevel(battle),
    killCount: 0,
    player: null,
    pets: [],
    ridePets: [],
    trainingPartners: [],
    schemaVersion: 2,
  };
  const petAwards = new Map();
  const ridePetAwards = new Map();
  const partnerAwards = new Map();
  for (const credit of credits) {
    const recipients = Array.isArray(credit && credit.recipients) ? credit.recipients : [];
    for (const recipient of recipients) {
      if (!recipient || String(recipient.accountId || "") !== normalizedAccountId) {
        continue;
      }
      reward.amount += Math.max(0, Math.trunc(Number(recipient.amount || 0)));
      reward.baseAmount += Math.max(0, Math.trunc(Number(recipient.scaledAmount || recipient.baseAmount || 0)));
      reward.scaledAmount = reward.baseAmount;
      reward.rawBaseAmount += Math.max(0, Math.trunc(Number(recipient.rawBaseAmount || 0)));
      reward.partyBonusAmount += Math.max(0, Math.trunc(Number(recipient.partyBonusAmount || 0)));
      reward.enemyMaxLevel = Math.max(reward.enemyMaxLevel, Math.max(1, Math.trunc(Number(recipient.enemyLevel || credit.enemyLevel || 1))));
      reward.killCount += 1;
      const type = String(recipient.type || "");
      if (type === "player") {
        reward.player = battleAddExpAward(reward.player, recipient);
      } else if (type === "pet") {
        const petId = String(recipient.petId || "").trim();
        if (petId !== "") {
          petAwards.set(petId, battleAddExpAward(petAwards.get(petId) || null, recipient));
        }
      } else if (type === "ride_pet") {
        const petId = String(recipient.petId || "").trim();
        if (petId !== "") {
          ridePetAwards.set(petId, battleAddExpAward(ridePetAwards.get(petId) || null, recipient));
        }
      } else if (type === "training_partner_player" || type === "training_partner_pet") {
        const partnerId = String(recipient.partnerId || "").trim();
        if (partnerId === "") {
          continue;
        }
        const partnerAward = partnerAwards.get(partnerId) || {partnerId, player: null, pet: null, schemaVersion: 2};
        if (type === "training_partner_player") {
          partnerAward.player = battleAddExpAward(partnerAward.player, recipient);
        } else {
          partnerAward.pet = battleAddExpAward(partnerAward.pet, recipient);
        }
        partnerAwards.set(partnerId, partnerAward);
      }
    }
  }
  const zeroContext = {
    partyBonusRate: reward.partyBonusRate,
    humanPlayerCount: reward.humanPlayerCount,
    enemyMaxLevel: reward.enemyMaxLevel,
  };
  const actors = Array.isArray(battle && battle.actors) ? battle.actors : [];
  const playerActor = actors.find((actor) => (
    actor &&
    String(actor.accountId || "") === normalizedAccountId &&
    String(actor.kind || BATTLE_ACTOR_KIND_PLAYER) === BATTLE_ACTOR_KIND_PLAYER
  )) || null;
  if (!reward.player && playerActor) {
    reward.player = battleZeroExpAward({
      ...zeroContext,
      name: String(playerActor.displayName || playerActor.username || "人物"),
      level: playerActor.level,
    });
  }
  for (const actor of actors) {
    if (!actor || String(actor.accountId || "") !== normalizedAccountId) {
      continue;
    }
    if (String(actor.kind || "") === BATTLE_ACTOR_KIND_PET) {
      const petId = String(actor.petId || "").trim();
      if (petId !== "" && !petAwards.has(petId)) {
        petAwards.set(petId, battleZeroExpAward({
          ...zeroContext,
          name: String(actor.displayName || "宠物"),
          level: actor.level,
        }));
      }
      continue;
    }
    if (String(actor.kind || BATTLE_ACTOR_KIND_PLAYER) === BATTLE_ACTOR_KIND_PLAYER) {
      const petId = String(actor.ridePetInstanceId || "").trim();
      if (petId !== "" && !ridePetAwards.has(petId)) {
        ridePetAwards.set(petId, battleZeroExpAward({
          ...zeroContext,
          name: String(actor.ridePetName || "骑宠"),
          level: actor.ridePetLevel || actor.level,
        }));
      }
    }
  }
  for (const actor of actors) {
    if (!actor || String(actor.ownerAccountId || "") !== normalizedAccountId) {
      continue;
    }
    const partnerId = String(actor.partnerId || "").trim();
    if (partnerId === "") {
      continue;
    }
    const partnerAward = partnerAwards.get(partnerId) || {partnerId, player: null, pet: null, schemaVersion: 2};
    if (String(actor.kind || BATTLE_ACTOR_KIND_PLAYER) === BATTLE_ACTOR_KIND_PET) {
      if (!partnerAward.pet) {
        partnerAward.pet = battleZeroExpAward({
          ...zeroContext,
          name: String(actor.displayName || "伙伴宠物"),
          level: actor.level,
        });
      }
    } else if (!partnerAward.player) {
      partnerAward.player = battleZeroExpAward({
        ...zeroContext,
        name: String(actor.displayName || "伙伴"),
        level: actor.level,
      });
    }
    partnerAwards.set(partnerId, partnerAward);
  }
  reward.pets = Array.from(petAwards.entries()).map(([petId, award]) => ({petId, ...award}));
  reward.ridePets = Array.from(ridePetAwards.entries()).map(([petId, award]) => ({petId, ...award}));
  reward.trainingPartners = Array.from(partnerAwards.values());
  return reward;
}

function battleZeroExpAward(options = {}) {
  const partyBonusRate = Math.max(0, Number(options.partyBonusRate || 0));
  return {
    amount: 0,
    baseAmount: 0,
    rawBaseAmount: 0,
    scaledAmount: 0,
    partyBonusAmount: 0,
    partyBonusRate,
    partyBonusPercent: Math.round(partyBonusRate * 100),
    humanPlayerCount: Math.max(1, Math.trunc(Number(options.humanPlayerCount || 1))),
    recipientLevel: Math.max(1, Math.trunc(Number(options.level || 1))),
    enemyMaxLevel: Math.max(1, Math.trunc(Number(options.enemyMaxLevel || 1))),
    killCount: 0,
    targetActorIds: [],
    targetNames: [],
    name: String(options.name || ""),
    schemaVersion: 2,
  };
}


function battleAddExpAward(currentAward, recipient) {
  const award = currentAward && typeof currentAward === "object" && !Array.isArray(currentAward)
    ? currentAward
    : {
      amount: 0,
      baseAmount: 0,
      rawBaseAmount: 0,
      scaledAmount: 0,
      partyBonusAmount: 0,
      partyBonusRate: Math.max(0, Number(recipient.partyBonusRate || 0)),
      partyBonusPercent: Math.round(Math.max(0, Number(recipient.partyBonusRate || 0)) * 100),
      humanPlayerCount: Math.max(1, Math.trunc(Number(recipient.humanPlayerCount || 1))),
      recipientLevel: Math.max(1, Math.trunc(Number(recipient.recipientLevel || 1))),
      enemyMaxLevel: 1,
      killCount: 0,
      targetActorIds: [],
      targetNames: [],
      name: String(recipient.name || ""),
      schemaVersion: 2,
    };
  const amount = Math.max(0, Math.trunc(Number(recipient.amount || 0)));
  const scaledAmount = Math.max(0, Math.trunc(Number(recipient.scaledAmount || recipient.baseAmount || 0)));
  award.amount += amount;
  award.baseAmount += scaledAmount;
  award.scaledAmount = award.baseAmount;
  award.rawBaseAmount += Math.max(0, Math.trunc(Number(recipient.rawBaseAmount || 0)));
  award.partyBonusAmount += Math.max(0, Math.trunc(Number(recipient.partyBonusAmount || 0)));
  award.enemyMaxLevel = Math.max(award.enemyMaxLevel, Math.max(1, Math.trunc(Number(recipient.enemyLevel || 1))));
  award.killCount += 1;
  const targetActorId = String(recipient.targetActorId || "").trim();
  if (targetActorId !== "" && !award.targetActorIds.includes(targetActorId)) {
    award.targetActorIds.push(targetActorId);
  }
  const targetName = String(recipient.targetName || "").trim();
  if (targetName !== "" && !award.targetNames.includes(targetName)) {
    award.targetNames.push(targetName);
  }
  return award;
}

function battleScaledExpForRecipientLevel(baseReward, recipientLevel, enemyLevel) {
  const base = Math.max(1, Math.trunc(Number(baseReward || 1)));
  const levelDelta = Math.trunc(Number(recipientLevel || 1)) - Math.max(1, Math.trunc(Number(enemyLevel || 1)));
  if (levelDelta <= BATTLE_EXP_FULL_LEVEL_DELTA) {
    return base;
  }
  const decayFactor = BATTLE_EXP_FULL_LEVEL_DELTA + BATTLE_EXP_DECAY_LEVEL_RANGE - levelDelta;
  if (decayFactor <= 0) {
    return 1;
  }
  return Math.max(1, Math.trunc(base * decayFactor / BATTLE_EXP_DECAY_LEVEL_RANGE));
}

function applyBattleExpRewardToProfile(profile, battle, accountId, reward) {
  if (!reward || typeof reward !== "object" || Array.isArray(reward)) {
    return {changed: false, publicExp: null};
  }
  const summary = {
    amount: Math.max(0, Math.trunc(Number(reward.amount || 0))),
    baseAmount: Math.max(0, Math.trunc(Number(reward.baseAmount || 0))),
    rawBaseAmount: Math.max(0, Math.trunc(Number(reward.rawBaseAmount || 0))),
    scaledAmount: Math.max(0, Math.trunc(Number(reward.scaledAmount || reward.baseAmount || 0))),
    partyBonusAmount: Math.max(0, Math.trunc(Number(reward.partyBonusAmount || 0))),
    partyBonusRate: Math.max(0, Number(reward.partyBonusRate || 0)),
    partyBonusPercent: Math.max(0, Math.trunc(Number(reward.partyBonusPercent || 0))),
    humanPlayerCount: Math.max(1, Math.trunc(Number(reward.humanPlayerCount || 1))),
    enemyMaxLevel: Math.max(1, Math.trunc(Number(reward.enemyMaxLevel || 1))),
    killCount: Math.max(0, Math.trunc(Number(reward.killCount || 0))),
    player: null,
    pets: [],
    ridePets: [],
    trainingPartners: [],
    schemaVersion: 2,
  };
  let changed = false;
  if (!profile.player || typeof profile.player !== "object" || Array.isArray(profile.player)) {
    profile.player = {};
  }
  if (battleExpAwardIsPresent(reward.player)) {
    const playerAward = applyBattleExpToEntry(profile.player, battleExpAwardAmount(reward.player), MAX_PLAYER_LEVEL, {
      statPointsPerLevel: PLAYER_STAT_POINTS_PER_LEVEL,
      name: String(profile.player.name || profile.player.displayName || reward.player.name || "人物"),
    });
    changed = changed || playerAward.changed;
    summary.player = {
      ...playerAward.publicExp,
      ...publicBattleExpAwardDetails(reward.player),
    };
  }

  const petRewards = Array.isArray(reward.pets) ? reward.pets : [];
  for (const petReward of petRewards) {
    const petId = String(petReward && petReward.petId || "").trim();
    if (petId === "" || !battleExpAwardIsPresent(petReward)) {
      continue;
    }
    const pet = profilePetById(profile, petId);
    if (!pet) {
      continue;
    }
    const petAward = applyBattleExpToEntry(pet, battleExpAwardAmount(petReward), MAX_PET_LEVEL, {
      name: String(pet.name || pet.displayName || petReward.name || "宠物"),
    });
    changed = changed || petAward.changed;
    summary.pets.push({
      petId,
      ...petAward.publicExp,
      ...publicBattleExpAwardDetails(petReward),
    });
  }

  const ridePetRewards = Array.isArray(reward.ridePets) ? reward.ridePets : [];
  for (const rideReward of ridePetRewards) {
    const petId = String(rideReward && rideReward.petId || "").trim();
    if (petId === "" || !battleExpAwardIsPresent(rideReward)) {
      continue;
    }
    const pet = profilePetById(profile, petId);
    if (!pet) {
      continue;
    }
    const petAward = applyBattleExpToEntry(pet, battleExpAwardAmount(rideReward), MAX_PET_LEVEL, {
      name: String(pet.name || pet.displayName || rideReward.name || "骑宠"),
    });
    changed = changed || petAward.changed;
    summary.ridePets.push({
      petId,
      ...petAward.publicExp,
      ...publicBattleExpAwardDetails(rideReward),
    });
  }

  const partnerRewards = new Map((Array.isArray(reward.trainingPartners) ? reward.trainingPartners : [])
    .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
    .map((entry) => [String(entry.partnerId || "").trim(), entry]));
  if (Array.isArray(profile.trainingPartners)) {
    for (let index = 0; index < profile.trainingPartners.length; index += 1) {
      const partner = profile.trainingPartners[index];
      if (!partner || typeof partner !== "object" || Array.isArray(partner)) {
        continue;
      }
      const partnerId = String(partner.partnerId || partner.id || `training_partner_${index + 1}`).trim();
      const partnerReward = partnerRewards.get(partnerId) || null;
      if (!partnerReward) {
        continue;
      }
      const partnerSummary = {
        partnerId,
        player: null,
        pet: null,
        schemaVersion: 2,
      };
      const playerReward = partnerReward.player && typeof partnerReward.player === "object" && !Array.isArray(partnerReward.player)
        ? partnerReward.player
        : null;
      if (battleExpAwardIsPresent(playerReward)) {
        const beforeLevel = Math.max(1, Math.trunc(Number(partner.level || 1)));
        const partnerAward = applyBattleExpToEntry(partner, battleExpAwardAmount(playerReward), MAX_PLAYER_LEVEL, {
          name: String(partner.name || playerReward.name || `伙伴${index + 1}`),
        });
        changed = changed || partnerAward.changed;
        const afterLevel = Math.max(1, Math.trunc(Number(partner.level || beforeLevel)));
        if (afterLevel > beforeLevel) {
          growTrainingPartnerStats(partner, afterLevel - beforeLevel);
          changed = true;
        }
        partnerSummary.player = {
          ...partnerAward.publicExp,
          ...publicBattleExpAwardDetails(playerReward),
        };
      }
      const petReward = partnerReward.pet && typeof partnerReward.pet === "object" && !Array.isArray(partnerReward.pet)
        ? partnerReward.pet
        : null;
      if (battleExpAwardIsPresent(petReward) && partner.pet && typeof partner.pet === "object" && !Array.isArray(partner.pet)) {
        const petBeforeLevel = Math.max(1, Math.trunc(Number(partner.pet.level || 1)));
        const petAward = applyBattleExpToEntry(partner.pet, battleExpAwardAmount(petReward), MAX_PET_LEVEL, {
          name: String(partner.pet.name || petReward.name || "伙伴宠物"),
        });
        changed = changed || petAward.changed;
        const petAfterLevel = Math.max(1, Math.trunc(Number(partner.pet.level || petBeforeLevel)));
        if (petAfterLevel > petBeforeLevel) {
          growTrainingPartnerPetStats(partner.pet, petAfterLevel - petBeforeLevel);
          changed = true;
        }
        partnerSummary.pet = {
          ...petAward.publicExp,
          ...publicBattleExpAwardDetails(petReward),
        };
      }
      if (partnerSummary.player || partnerSummary.pet) {
        summary.trainingPartners.push(partnerSummary);
      }
    }
  }

  return {
    changed,
    publicExp: summary,
  };
}

function battleExpAwardAmount(award) {
  return Math.max(0, Math.trunc(Number(award && award.amount || 0)));
}

function battleExpAwardIsPresent(award) {
  return Boolean(award && typeof award === "object" && !Array.isArray(award));
}

function publicBattleExpAwardDetails(award) {
  return {
    amount: battleExpAwardAmount(award),
    baseAmount: Math.max(0, Math.trunc(Number(award && award.baseAmount || award && award.scaledAmount || 0))),
    rawBaseAmount: Math.max(0, Math.trunc(Number(award && award.rawBaseAmount || 0))),
    scaledAmount: Math.max(0, Math.trunc(Number(award && award.scaledAmount || award && award.baseAmount || 0))),
    partyBonusAmount: Math.max(0, Math.trunc(Number(award && award.partyBonusAmount || 0))),
    partyBonusRate: Math.max(0, Number(award && award.partyBonusRate || 0)),
    partyBonusPercent: Math.max(0, Math.trunc(Number(award && award.partyBonusPercent || 0))),
    humanPlayerCount: Math.max(1, Math.trunc(Number(award && award.humanPlayerCount || 1))),
    enemyMaxLevel: Math.max(1, Math.trunc(Number(award && award.enemyMaxLevel || 1))),
    killCount: Math.max(0, Math.trunc(Number(award && award.killCount || 0))),
    targetNames: Array.isArray(award && award.targetNames) ? award.targetNames.map((value) => String(value || "")).filter(Boolean) : [],
    schemaVersion: 2,
  };
}

function activeBattlePetIdsForAccount(battle, accountId) {
  const normalizedAccountId = String(accountId || "");
  const ids = [];
  const actors = Array.isArray(battle && battle.actors) ? battle.actors : [];
  for (const actor of actors) {
    if (
      !actor ||
      String(actor.accountId || "") !== normalizedAccountId ||
      String(actor.kind || "") !== BATTLE_ACTOR_KIND_PET
    ) {
      continue;
    }
    const petId = String(actor.petId || "").trim();
    if (petId !== "" && !ids.includes(petId)) {
      ids.push(petId);
    }
  }
  return ids;
}

function activeRidingPetIdsForAccount(battle, accountId) {
  const normalizedAccountId = String(accountId || "");
  const ids = [];
  const actors = Array.isArray(battle && battle.actors) ? battle.actors : [];
  for (const actor of actors) {
    if (
      !actor ||
      String(actor.accountId || "") !== normalizedAccountId ||
      String(actor.kind || BATTLE_ACTOR_KIND_PLAYER) !== BATTLE_ACTOR_KIND_PLAYER
    ) {
      continue;
    }
    const petId = String(actor.ridePetInstanceId || "").trim();
    if (petId !== "" && !ids.includes(petId)) {
      ids.push(petId);
    }
  }
  return ids;
}

function activeTrainingPartnerIdsForAccount(battle, accountId) {
  const normalizedAccountId = String(accountId || "");
  const ids = new Set();
  const actors = Array.isArray(battle && battle.actors) ? battle.actors : [];
  for (const actor of actors) {
    if (!actor || String(actor.ownerAccountId || "") !== normalizedAccountId) {
      continue;
    }
    const partnerId = String(actor.partnerId || "").trim();
    if (partnerId !== "") {
      ids.add(partnerId);
    }
  }
  return ids;
}

function profilePetById(profile, petId) {
  const normalizedPetId = String(petId || "").trim();
  if (normalizedPetId === "") {
    return null;
  }
  const collections = [];
  if (Array.isArray(profile.petInstances)) {
    collections.push(profile.petInstances);
  }
  if (Array.isArray(profile.pets) && profile.pets !== profile.petInstances) {
    collections.push(profile.pets);
  }
  for (const collection of collections) {
    const pet = collection.find((item) => profilePetIdentityValues(item).includes(normalizedPetId)) || null;
    if (pet) {
      return pet;
    }
  }
  return null;
}

function applyBattleExpToEntry(entry, amount, maxLevel, options = {}) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return {changed: false, publicExp: null};
  }
  const beforeLevel = Math.max(1, Math.trunc(Number(entry.level || 1)));
  const beforeExp = Math.max(0, Math.trunc(Number(entry.exp || 0)));
  const beforeNextExp = Math.max(1, Math.trunc(Number(entry.nextExp || battleExpToNextLevel(beforeLevel))));
  const award = battleAwardExpEntry(entry, amount, maxLevel);
  entry.level = award.level;
  entry.exp = award.exp;
  entry.nextExp = award.nextExp;
  const statPointsPerLevel = Math.max(0, Math.trunc(Number(options.statPointsPerLevel || 0)));
  if (statPointsPerLevel > 0 && award.levelsGained > 0) {
    entry.statPoints = Math.max(0, Math.trunc(Number(entry.statPoints || 0))) + award.levelsGained * statPointsPerLevel;
  }
  const changed = (
    beforeLevel !== Number(entry.level || 1) ||
    beforeExp !== Number(entry.exp || 0) ||
    beforeNextExp !== Number(entry.nextExp || 0) ||
    (statPointsPerLevel > 0 && award.levelsGained > 0)
  );
  return {
    changed,
    publicExp: {
      name: String(options.name || entry.name || entry.displayName || ""),
      beforeLevel,
      level: Number(entry.level || 1),
      beforeExp,
      exp: Number(entry.exp || 0),
      nextExp: Number(entry.nextExp || 0),
      levelsGained: award.levelsGained,
      overflowExp: award.overflowExp,
      schemaVersion: 1,
    },
  };
}

function battleAwardExpEntry(entry, amount, maxLevel) {
  const safeMaxLevel = Math.max(1, Math.trunc(Number(maxLevel || MAX_PLAYER_LEVEL)));
  let level = Math.max(1, Math.min(safeMaxLevel, Math.trunc(Number(entry.level || 1))));
  const startLevel = level;
  let exp = Math.max(0, Math.trunc(Number(entry.exp || 0))) + Math.max(0, Math.trunc(Number(amount || 0)));
  let nextExp = battleExpToNextLevel(level);
  while (level < safeMaxLevel && exp >= nextExp) {
    exp -= nextExp;
    level += 1;
    nextExp = battleExpToNextLevel(level);
  }
  let overflowExp = 0;
  if (level >= safeMaxLevel && exp > 0) {
    overflowExp = exp;
    exp = 0;
  }
  return {
    level,
    exp,
    nextExp,
    levelsGained: Math.max(0, level - startLevel),
    overflowExp,
  };
}

function battleExpToNextLevel(level) {
  const safeLevel = Math.max(1, Math.trunc(Number(level || 1)));
  const base = (80 + safeLevel * 40) * Math.pow(1.052, safeLevel - 1);
  const highLevelShape = Math.pow(safeLevel, 2.15) * 2.0;
  return Math.max(1, Math.round(base + highLevelShape));
}

function growTrainingPartnerStats(partner, levels) {
  const levelCount = Math.max(0, Math.trunc(Number(levels || 0)));
  if (levelCount <= 0) {
    return;
  }
  const previousMaxHp = Math.max(1, Math.trunc(Number(partner.maxHp || 120)));
  const previousHp = Math.max(1, Math.trunc(Number(partner.hp || previousMaxHp)));
  partner.maxHp = previousMaxHp + levelCount * 8;
  partner.hp = previousHp + levelCount * 8;
  partner.attack = Math.max(1, Math.trunc(Number(partner.attack || 18)) + levelCount * 2);
  partner.defense = Math.max(1, Math.trunc(Number(partner.defense || 6)) + levelCount);
  partner.quick = Math.max(1, Math.trunc(Number(partner.quick || 70)) + levelCount);
}

function growTrainingPartnerPetStats(pet, levels) {
  const levelCount = Math.max(0, Math.trunc(Number(levels || 0)));
  if (levelCount <= 0) {
    return;
  }
  const previousMaxHp = Math.max(1, Math.trunc(Number(pet.maxHp || 90)));
  const previousHp = Math.max(1, Math.trunc(Number(pet.hp || previousMaxHp)));
  pet.maxHp = previousMaxHp + levelCount * 7;
  pet.hp = previousHp + levelCount * 7;
  pet.attack = Math.max(1, Math.trunc(Number(pet.attack || 14)) + levelCount * 2);
  pet.defense = Math.max(1, Math.trunc(Number(pet.defense || 8)) + levelCount);
  pet.quick = Math.max(1, Math.trunc(Number(pet.quick || 68)) + levelCount);
}

function applyBattleActorHpToProfilePlayer(profile, actor) {
  if (!profile.player || typeof profile.player !== "object" || Array.isArray(profile.player)) {
    profile.player = {};
  }
  const hp = battleActorWritebackHp(actor);
  const maxHp = battleActorWritebackMaxHp(actor);
  const previousHp = Number(profile.player.hp);
  const changed = !Number.isFinite(previousHp) || previousHp !== hp;
  if (changed) {
    profile.player.hp = hp;
  }
  return {
    changed,
    publicHp: {
      actorId: String(actor.actorId || ""),
      hp,
      maxHp,
      schemaVersion: 1,
    },
  };
}

function applyBattleActorHpToProfilePet(profile, actor) {
  const petCollections = [];
  if (Array.isArray(profile.petInstances)) {
    petCollections.push(profile.petInstances);
  }
  if (Array.isArray(profile.pets) && profile.pets !== profile.petInstances) {
    petCollections.push(profile.pets);
  }
  const actorPetId = String(actor.petId || "").trim();
  let pet = null;
  for (const collection of petCollections) {
    pet = collection.find((item) => profilePetIdentityValues(item).includes(actorPetId)) || null;
    if (pet) {
      break;
    }
  }
  if (!pet) {
    return {found: false, changed: false, publicHp: null};
  }
  const hp = battleActorWritebackHp(actor);
  const maxHp = battleActorWritebackMaxHp(actor);
  const previousHp = Number(pet.hp);
  const changed = !Number.isFinite(previousHp) || previousHp !== hp;
  if (changed) {
    pet.hp = hp;
  }
  return {
    found: true,
    changed,
    publicHp: {
      actorId: String(actor.actorId || ""),
      petId: actorPetId,
      hp,
      maxHp,
      schemaVersion: 1,
    },
  };
}

function applyBattleItemBagToProfile(profile, battleItemBag) {
  const nextBag = {};
  const sourceBag = battleItemBag && typeof battleItemBag === "object" && !Array.isArray(battleItemBag) ? battleItemBag : {};
  for (const itemId of BATTLE_ITEM_IDS) {
    nextBag[itemId] = Math.max(0, Math.trunc(Number(sourceBag[itemId] || 0)));
  }
  const previousBag = battleItemBagFromProfile(profile);
  const changed = BATTLE_ITEM_IDS.some((itemId) => Number(previousBag[itemId] || 0) !== Number(nextBag[itemId] || 0));
  if (changed) {
    profile.backpackSlots = backpackSlotsWithBattleItemCounts(profileBackpackSlots(profile), nextBag);
  }
  return {
    changed,
    publicItemBag: clone(nextBag),
  };
}

function backpackSlotsWithBattleItemCounts(slots, counts) {
  const nextSlots = Array.isArray(slots) ? clone(slots) : [];
  for (const itemId of BATTLE_ITEM_IDS) {
    setBackpackSlotItemCount(nextSlots, itemId, Math.max(0, Math.trunc(Number(counts[itemId] || 0))));
  }
  return nextSlots;
}

function applyCaptureToolBagToProfile(profile, captureToolBag) {
  const nextBag = {};
  const sourceBag = captureToolBag && typeof captureToolBag === "object" && !Array.isArray(captureToolBag) ? captureToolBag : {};
  for (const toolId of battleCaptureToolIds()) {
    if (toolId === BATTLE_CAPTURE_TOOL_EMPTY_HAND || !battleCaptureToolIsConsumable(toolId)) {
      continue;
    }
    nextBag[toolId] = Math.max(0, Math.trunc(Number(sourceBag[toolId] || 0)));
  }
  const previousBag = captureToolBagFromProfile(profile);
  const changed = Object.keys(nextBag).some((toolId) => Number(previousBag[toolId] || 0) !== Number(nextBag[toolId] || 0));
  if (changed) {
    profile.backpackSlots = backpackSlotsWithCaptureToolCounts(profileBackpackSlots(profile), nextBag);
    profile.captureTools = clone(nextBag);
  }
  return {
    changed,
    publicCaptureToolBag: clone(nextBag),
  };
}

function backpackSlotsWithCaptureToolCounts(slots, counts) {
  const nextSlots = Array.isArray(slots) ? clone(slots) : [];
  for (const toolId of battleCaptureToolIds()) {
    if (toolId === BATTLE_CAPTURE_TOOL_EMPTY_HAND || !battleCaptureToolIsConsumable(toolId)) {
      continue;
    }
    setBackpackSlotItemCount(nextSlots, toolId, Math.max(0, Math.trunc(Number(counts[toolId] || 0))));
  }
  return nextSlots;
}

function setBackpackSlotItemCount(slots, itemId, count) {
  const stackLimit = 20;
  let remaining = Math.max(0, Math.trunc(Number(count || 0)));
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index] && typeof slots[index] === "object" && !Array.isArray(slots[index]) ? slots[index] : {};
    if (String(slot.itemId || "") !== itemId) {
      slots[index] = slot;
      continue;
    }
    if (remaining > 0) {
      slot.itemId = itemId;
      slot.count = Math.min(stackLimit, remaining);
      remaining -= slot.count;
      slots[index] = slot;
    } else {
      slots[index] = {};
    }
  }
  while (remaining > 0) {
    const stackCount = Math.min(stackLimit, remaining);
    const emptyIndex = slots.findIndex((slot) => !slot || typeof slot !== "object" || Array.isArray(slot) || String(slot.itemId || "") === "");
    const nextSlot = {itemId, count: stackCount};
    if (emptyIndex >= 0) {
      slots[emptyIndex] = nextSlot;
    } else {
      slots.push(nextSlot);
    }
    remaining -= stackCount;
  }
}

function profilePetIdentityValues(pet) {
  if (!pet || typeof pet !== "object" || Array.isArray(pet)) {
    return [];
  }
  return [pet.instanceId, pet.petId, pet.id]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function applyBattleCapturedPetsToProfile(profile, battle, accountId, room) {
  const capturedActors = (Array.isArray(battle && battle.actors) ? battle.actors : []).filter((actor) => (
    actor &&
    Boolean(actor.captured) &&
    String(actor.capturedByAccountId || "") === String(accountId || "") &&
    String(actor.formId || actor.speciesId || "").trim() !== ""
  ));
  if (capturedActors.length <= 0) {
    return {changed: false, capturedPets: [], lostCapturedPets: []};
  }
  if (!Array.isArray(profile.petInstances)) {
    profile.petInstances = Array.isArray(profile.pets) ? clone(profile.pets) : [];
  }
  const instances = profile.petInstances;
  const capturedPets = [];
  const lostCapturedPets = [];
  let changed = false;
  let serial = nextProfilePetInstanceSerial(profile, instances);
  let partyCount = profilePartyVisiblePetCount(profile);
  let storageCount = profileStoragePetCount(profile);
  for (const actor of capturedActors) {
    const existing = instances.find((pet) => (
      pet &&
      String(pet.capturedBattleRoomId || "") === String(room && room.roomId || "") &&
      String(pet.capturedBattleActorId || "") === String(actor.actorId || "")
    ));
    if (existing) {
      capturedPets.push(publicCapturedPetSummary(existing));
      continue;
    }
    const formId = String(actor.formId || actor.speciesId || "").trim();
    const instanceId = `pet_captured_${serial}`;
    const canJoinParty = partyCount < BATTLE_PET_MAX_PER_PARTICIPANT;
    const canEnterStorage = storageCount < BATTLE_PET_STORAGE_LIMIT;
    const state = canJoinParty ? BATTLE_PET_STATE_STANDBY : BATTLE_PET_STATE_STORAGE;
    const captured = capturedPetInstanceFromBattleActor(actor, instanceId, state, serial, room);
    serial += 1;
    if (!canJoinParty && !canEnterStorage) {
      lostCapturedPets.push(publicCapturedPetSummary(captured));
      continue;
    }
    instances.push(captured);
    if (state === BATTLE_PET_STATE_STORAGE) {
      storageCount += 1;
    } else {
      partyCount += 1;
    }
    profile.nextPetInstanceSerial = serial;
    recordProfilePetCodexForm(profile, formId, true);
    capturedPets.push(publicCapturedPetSummary(captured));
    changed = true;
  }
  if (serial > nextProfilePetInstanceSerial(profile, instances)) {
    profile.nextPetInstanceSerial = serial;
  }
  return {
    changed,
    capturedPets,
    lostCapturedPets,
  };
}

function capturedPetInstanceFromBattleActor(actor, instanceId, state, serial, room) {
  const level = Math.max(1, Math.trunc(Number(actor.level || 1)));
  const maxHp = Math.max(1, Math.trunc(Number(actor.maxHp || actor.hp || DEFAULT_PET_BATTLE_STATS.maxHp)));
  const formId = String(actor.formId || actor.speciesId || "").trim();
  const template = petTemplateForFormId(formId);
  const lineId = String(actor.lineId || template.lineId || "").trim();
  return {
    instanceId,
    petId: instanceId,
    templateId: formId,
    formId,
    speciesId: String(actor.speciesId || formId),
    lineId,
    name: String(actor.displayName || actor.username || "宠物"),
    state,
    level,
    exp: 0,
    nextExp: battleExpToNextLevel(level),
    hp: maxHp,
    maxHp,
    attack: Math.max(1, Math.trunc(Number(actor.attack || DEFAULT_PET_BATTLE_STATS.attack))),
    defense: Math.max(1, Math.trunc(Number(actor.defense || DEFAULT_PET_BATTLE_STATS.defense))),
    quick: Math.max(1, Math.trunc(Number(actor.speed || actor.quick || DEFAULT_PET_BATTLE_STATS.quick))),
    activeSkillIds: stringArray(actor.activeSkillIds),
    petSkillSlots: stringArray(actor.petSkillSlots),
    passiveSkillIds: stringArray(actor.passiveSkillIds),
    capturedSerial: serial,
    capturedBattleRoomId: String(room && room.roomId || ""),
    capturedBattleActorId: String(actor.actorId || ""),
    captureToolId: String(actor.captureToolId || ""),
    individualSeed: `capture:${String(room && (room.seed || room.roomId) || "")}:${formId}:${level}:${serial}`,
    isNew: true,
    schemaVersion: 1,
  };
}

function nextProfilePetInstanceSerial(profile, instances) {
  let serial = Math.max(1, Math.trunc(Number(profile && profile.nextPetInstanceSerial || 1)));
  for (const pet of Array.isArray(instances) ? instances : []) {
    if (!pet || typeof pet !== "object" || Array.isArray(pet)) {
      continue;
    }
    const capturedSerial = Math.trunc(Number(pet.capturedSerial || 0));
    if (capturedSerial > 0) {
      serial = Math.max(serial, capturedSerial + 1);
    }
    for (const value of profilePetIdentityValues(pet)) {
      const match = value.match(/^pet_captured_(\d+)$/);
      if (match) {
        serial = Math.max(serial, Math.trunc(Number(match[1] || 0)) + 1);
      }
    }
  }
  return serial;
}

function profilePartyVisiblePetCount(profile) {
  const instances = Array.isArray(profile && profile.petInstances) ? profile.petInstances : [];
  return instances.filter((pet) => pet && String(pet.state || BATTLE_PET_STATE_STANDBY) !== BATTLE_PET_STATE_STORAGE).length;
}

function profileStoragePetCount(profile) {
  const instances = Array.isArray(profile && profile.petInstances) ? profile.petInstances : [];
  return instances.filter((pet) => pet && String(pet.state || BATTLE_PET_STATE_STANDBY) === BATTLE_PET_STATE_STORAGE).length;
}

function trainingPartnerSlotNumberForIndex(index) {
  const safeIndex = clampInt(index, 0, TRAINING_PARTNER_MAX_COUNT - 1, 0);
  return BATTLE_PARTY_PVE_PARTNER_SLOTS[safeIndex] || BATTLE_PARTY_PVE_PARTNER_SLOTS[0];
}

function trainingPartnerIdForIndex(index) {
  return `training_partner_${index + 1}`;
}

function trainingPartnerPetIdForIndex(index) {
  return `training_partner_pet_${index + 1}`;
}

function trainingPartnerNameForIndex(index) {
  return `陪练伙伴${index + 1}`;
}

function trainingPartnerPetNameForIndex(index, petName = "") {
  const sourceName = String(petName || "").trim() || "布伊";
  return `陪练${sourceName}${index + 1}`;
}

function normalizeTrainingPartnerProfilePet(pet, index = 0, fallbackLevel = 1) {
  const safeIndex = clampInt(index, 0, TRAINING_PARTNER_MAX_COUNT - 1, 0);
  const source = objectOrEmpty(pet);
  const entry = clone(source);
  const level = Math.max(1, Math.trunc(Number(source.level || fallbackLevel || 1)));
  const maxHp = Math.max(1, Math.trunc(Number(source.maxHp || source.hp || DEFAULT_PET_BATTLE_STATS.maxHp)));
  const formId = String(source.formId || source.templateId || source.speciesId || "bui_normal_red_fire10").trim() || "bui_normal_red_fire10";
  const petId = String(source.petId || source.instanceId || source.id || trainingPartnerPetIdForIndex(safeIndex)).trim() || trainingPartnerPetIdForIndex(safeIndex);
  entry.petId = petId;
  entry.instanceId = String(source.instanceId || petId).trim() || petId;
  entry.formId = formId;
  entry.templateId = String(source.templateId || formId).trim() || formId;
  entry.speciesId = String(source.speciesId || formId).trim() || formId;
  entry.name = String(source.name || source.displayName || trainingPartnerPetNameForIndex(safeIndex)).trim() || trainingPartnerPetNameForIndex(safeIndex);
  entry.state = String(source.state || source.status || source.battleState || BATTLE_PET_STATE_BATTLE).trim() || BATTLE_PET_STATE_BATTLE;
  entry.level = level;
  entry.exp = Math.max(0, Math.trunc(Number(source.exp || 0)));
  entry.nextExp = Math.max(1, Math.trunc(Number(source.nextExp || battleExpToNextLevel(level))));
  entry.hp = clampInt(source.hp, 1, maxHp, maxHp);
  entry.maxHp = maxHp;
  entry.attack = Math.max(1, Math.trunc(Number(source.attack || DEFAULT_PET_BATTLE_STATS.attack)));
  entry.defense = Math.max(1, Math.trunc(Number(source.defense || DEFAULT_PET_BATTLE_STATS.defense)));
  entry.quick = Math.max(1, Math.trunc(Number(source.quick || DEFAULT_PET_BATTLE_STATS.quick)));
  entry.activeSkillIds = stringArray(source.activeSkillIds);
  entry.petSkillSlots = stringArray(source.petSkillSlots);
  entry.passiveSkillIds = stringArray(source.passiveSkillIds);
  entry.schemaVersion = 1;
  return entry;
}

function normalizeTrainingPartnerProfilePartner(partner, index = 0) {
  const safeIndex = clampInt(index, 0, TRAINING_PARTNER_MAX_COUNT - 1, 0);
  const source = objectOrEmpty(partner);
  const entry = clone(source);
  const level = Math.max(1, Math.trunc(Number(source.level || 1)));
  const maxHp = Math.max(1, Math.trunc(Number(source.maxHp || source.hp || DEFAULT_PLAYER_BATTLE_STATS.maxHp)));
  entry.partnerId = String(source.partnerId || source.id || trainingPartnerIdForIndex(safeIndex)).trim() || trainingPartnerIdForIndex(safeIndex);
  entry.name = String(source.name || source.displayName || trainingPartnerNameForIndex(safeIndex)).trim() || trainingPartnerNameForIndex(safeIndex);
  entry.level = level;
  entry.exp = Math.max(0, Math.trunc(Number(source.exp || 0)));
  entry.nextExp = Math.max(1, Math.trunc(Number(source.nextExp || battleExpToNextLevel(level))));
  entry.hp = clampInt(source.hp, 1, maxHp, maxHp);
  entry.maxHp = maxHp;
  entry.attack = Math.max(1, Math.trunc(Number(source.attack || DEFAULT_PLAYER_BATTLE_STATS.attack)));
  entry.defense = Math.max(1, Math.trunc(Number(source.defense || DEFAULT_PLAYER_BATTLE_STATS.defense)));
  entry.quick = Math.max(1, Math.trunc(Number(source.quick || DEFAULT_PLAYER_BATTLE_STATS.quick)));
  entry.slotNumber = trainingPartnerSlotNumberForIndex(safeIndex);
  entry.pet = normalizeTrainingPartnerProfilePet(source.pet, safeIndex, level);
  entry.schemaVersion = 1;
  return entry;
}

function trainingPartnersFromProfile(profile) {
  const source = Array.isArray(profile && profile.trainingPartners) ? profile.trainingPartners : [];
  const partners = [];
  for (const partner of source) {
    if (!partner || typeof partner !== "object" || Array.isArray(partner)) {
      continue;
    }
    if (partners.length >= TRAINING_PARTNER_MAX_COUNT) {
      break;
    }
    partners.push(normalizeTrainingPartnerProfilePartner(partner, partners.length));
  }
  return partners;
}

function trainingPartnerSourcePetFromProfile(profile) {
  const instances = Array.isArray(profile && profile.petInstances) ? profile.petInstances : (Array.isArray(profile && profile.pets) ? profile.pets : []);
  const activePetInstanceId = String(profile && profile.activePetInstanceId || "").trim();
  const active = activePetInstanceId
    ? instances.find((pet) => pet && typeof pet === "object" && !Array.isArray(pet) && profilePetIdentityValues(pet).includes(activePetInstanceId))
    : null;
  if (active) {
    return active;
  }
  return instances.find((pet) => pet && typeof pet === "object" && !Array.isArray(pet) && petIsActiveBattlePet(pet, activePetInstanceId)) || null;
}

function playerStatsForTrainingPartner(profile) {
  const player = objectOrEmpty(profile && profile.player);
  const baseStats = playerBaseStatsFromPlayer(player);
  return {
    level: Math.max(1, Math.trunc(Number(player.level || 1))),
    maxHp: Math.max(1, Math.trunc(Number(player.maxHp || baseStats.maxHp || DEFAULT_PLAYER_BATTLE_STATS.maxHp))),
    attack: Math.max(1, Math.trunc(Number(player.attack || baseStats.attack || DEFAULT_PLAYER_BATTLE_STATS.attack))),
    defense: Math.max(1, Math.trunc(Number(player.defense || baseStats.defense || DEFAULT_PLAYER_BATTLE_STATS.defense))),
    quick: Math.max(1, Math.trunc(Number(player.quick || baseStats.quick || DEFAULT_PLAYER_BATTLE_STATS.quick))),
  };
}

function createTrainingPartnerFromProfile(profile, index = 0) {
  const stats = playerStatsForTrainingPartner(profile);
  const sourcePet = trainingPartnerSourcePetFromProfile(profile);
  const petLevel = Math.max(1, Math.trunc(Number(sourcePet && sourcePet.level || stats.level)));
  const petMaxHp = Math.max(1, Math.trunc(Number(sourcePet && (sourcePet.maxHp || sourcePet.hp) || DEFAULT_PET_BATTLE_STATS.maxHp)));
  const formId = String(sourcePet && (sourcePet.formId || sourcePet.templateId || sourcePet.speciesId) || "bui_normal_red_fire10").trim() || "bui_normal_red_fire10";
  return normalizeTrainingPartnerProfilePartner({
    partnerId: trainingPartnerIdForIndex(index),
    name: trainingPartnerNameForIndex(index),
    level: stats.level,
    exp: 0,
    nextExp: battleExpToNextLevel(stats.level),
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    attack: stats.attack,
    defense: stats.defense,
    quick: stats.quick,
    slotNumber: trainingPartnerSlotNumberForIndex(index),
    pet: {
      petId: trainingPartnerPetIdForIndex(index),
      instanceId: trainingPartnerPetIdForIndex(index),
      formId,
      templateId: String(sourcePet && sourcePet.templateId || formId).trim() || formId,
      speciesId: String(sourcePet && sourcePet.speciesId || formId).trim() || formId,
      name: trainingPartnerPetNameForIndex(index, sourcePet && sourcePet.name),
      state: BATTLE_PET_STATE_BATTLE,
      level: petLevel,
      exp: 0,
      nextExp: battleExpToNextLevel(petLevel),
      hp: petMaxHp,
      maxHp: petMaxHp,
      attack: Math.max(1, Math.trunc(Number(sourcePet && sourcePet.attack || DEFAULT_PET_BATTLE_STATS.attack))),
      defense: Math.max(1, Math.trunc(Number(sourcePet && sourcePet.defense || DEFAULT_PET_BATTLE_STATS.defense))),
      quick: Math.max(1, Math.trunc(Number(sourcePet && sourcePet.quick || DEFAULT_PET_BATTLE_STATS.quick))),
      activeSkillIds: stringArray(sourcePet && sourcePet.activeSkillIds),
      petSkillSlots: stringArray(sourcePet && sourcePet.petSkillSlots),
      passiveSkillIds: stringArray(sourcePet && sourcePet.passiveSkillIds),
    },
  }, index);
}

function applyTrainingPartnerSetCountAction(profile, params) {
  const source = objectOrEmpty(params);
  const hasCount = (
    Object.prototype.hasOwnProperty.call(source, "count") ||
    Object.prototype.hasOwnProperty.call(source, "targetCount") ||
    Object.prototype.hasOwnProperty.call(source, "trainingPartnerCount") ||
    Object.prototype.hasOwnProperty.call(source, "amount")
  );
  if (!hasCount) {
    return {ok: false, code: "training_partner_count_missing", message: "请选择伙伴数量。"};
  }
  const requestedCount = source.count ?? source.targetCount ?? source.trainingPartnerCount ?? source.amount;
  const targetCount = clampInt(requestedCount, 0, TRAINING_PARTNER_MAX_COUNT, 0);
  const partners = trainingPartnersFromProfile(profile);
  const previousCount = partners.length;
  while (partners.length > targetCount) {
    partners.pop();
  }
  while (partners.length < targetCount) {
    partners.push(createTrainingPartnerFromProfile(profile, partners.length));
  }
  profile.trainingPartners = partners;
  return {
    ok: true,
    message: `队伍伙伴 ${targetCount}/${TRAINING_PARTNER_MAX_COUNT}。`,
    count: targetCount,
    previousCount,
    availableSlots: TRAINING_PARTNER_MAX_COUNT,
    amount: targetCount,
    changedCount: Math.abs(targetCount - previousCount),
  };
}

function normalizeProfileActionId(value) {
  return String(value || "").trim().toLowerCase();
}

function applyProfileActionToProfile(profile, action, params, now) {
  switch (action) {
    case "player_stat_allocate":
      return applyPlayerStatAllocateAction(profile, params);
    case "backpack_unlock_slot":
      return applyBackpackUnlockSlotAction(profile, params);
    case "village_heal":
      return applyVillageHealAction(profile);
    case "record_point_save":
      return applyRecordPointSaveAction(profile, params);
    case "world_item_use":
      return applyWorldItemUseAction(profile, params);
    case "pet_skill_set_slot":
      return applyPetSkillSetSlotAction(profile, params);
    case "pet_skill_move_slot":
      return applyPetSkillMoveSlotAction(profile, params);
    case "pet_skill_forget":
      return applyPetSkillForgetAction(profile, params);
    case "pet_state_cycle":
      return applyPetStateCycleAction(profile, params);
    case "pet_stable_toggle":
      return applyPetStableToggleAction(profile, params);
    case "pet_party_move":
      return applyPetPartyMoveAction(profile, params);
    case "pet_lock_toggle":
      return applyPetLockToggleAction(profile, params);
    case "pet_batch_store":
      return applyPetBatchStoreAction(profile);
    case "pet_batch_state":
      return applyPetBatchStateAction(profile, params);
    case "pet_rename":
      return applyPetRenameAction(profile, params);
    case "pet_drop":
      return applyPetDropAction(profile, params, now);
    case "pet_clear_storage":
      return applyPetClearStorageAction(profile, params);
    case "pet_pickup_drop":
      return applyPetPickupDropAction(profile, params, now);
    case "pet_expire_drops":
      return applyPetExpireDropsAction(profile, params, now);
    case "pet_mark_seen":
      return applyPetMarkSeenAction(profile, params);
    case "pet_rebirth_mm_stage2_claim":
      return applyPetRebirthMmStage2ClaimAction(profile);
    case "pet_rebirth_mm_guide_start":
      return applyPetRebirthMmGuideStartAction(profile, now);
    case "pet_cultivation_apply":
      return applyPetCultivationAction(profile, params, now);
    case "training_partner_set_count":
      return applyTrainingPartnerSetCountAction(profile, params);
    default:
      return {ok: false, code: "profile_action_invalid", message: "档案操作不正确。"};
  }
}

function publicProfileActionResult(action, result) {
  const source = objectOrEmpty(result);
  return {
    action,
    ok: Boolean(source.ok),
    code: String(source.code || ""),
    message: String(source.message || ""),
    itemId: String(source.itemId || ""),
    instanceId: String(source.instanceId || source.petId || ""),
    statKey: String(source.statKey || ""),
    gain: Math.max(0, Math.trunc(Number(source.gain || 0))),
    dropId: String(source.dropId || ""),
    slot: Math.max(0, Math.trunc(Number(source.slot || 0))),
    cost: Math.max(0, Math.trunc(Number(source.cost || 0))),
    count: Math.max(0, Math.trunc(Number(source.count || 0))),
    previousCount: Math.max(0, Math.trunc(Number(source.previousCount || 0))),
    availableSlots: Math.max(0, Math.trunc(Number(source.availableSlots || 0))),
    amount: Math.max(0, Math.trunc(Number(source.amount || source.heal || source.exp || 0))),
    changedCount: Math.max(0, Math.trunc(Number(source.changedCount || 0))),
    skippedCount: Math.max(0, Math.trunc(Number(source.skippedCount || 0))),
    schemaVersion: 1,
  };
}

function profileActionLogLines(result) {
  const lines = [];
  const message = String(result && result.message || "").trim();
  if (message !== "") {
    lines.push(message);
  }
  return lines;
}

function profilePetInstances(profile) {
  if (!Array.isArray(profile.petInstances)) {
    profile.petInstances = Array.isArray(profile.pets) ? clone(profile.pets) : [];
  }
  return profile.petInstances;
}

function profilePetIndexById(profile, instanceId) {
  const normalizedId = String(instanceId || "").trim();
  if (normalizedId === "") {
    return -1;
  }
  const instances = profilePetInstances(profile);
  return instances.findIndex((pet) => profilePetIdentityValues(pet).includes(normalizedId));
}

function profilePetByInstanceId(profile, instanceId) {
  const index = profilePetIndexById(profile, instanceId);
  return index >= 0 ? profilePetInstances(profile)[index] : null;
}

function profilePetName(pet) {
  return String(pet && pet.name || "宠物");
}

function profilePetState(pet) {
  return String(pet && pet.state || BATTLE_PET_STATE_STANDBY);
}

function stateLabel(state) {
  switch (String(state || "")) {
    case BATTLE_PET_STATE_BATTLE:
      return "战斗";
    case BATTLE_PET_STATE_STANDBY:
      return "待机";
    case BATTLE_PET_STATE_REST:
      return "休息";
    case BATTLE_PET_STATE_RIDING:
      return "骑乘";
    case BATTLE_PET_STATE_STORAGE:
      return "兽栏";
    default:
      return "未知";
  }
}

function profileBackpackExtraSlots(profile) {
  return clampInt(profile && profile.backpackExtraSlots, 0, BACKPACK_EXTRA_SLOT_LIMIT, 0);
}

function normalizeProfileBackpack(profile) {
  const limit = BACKPACK_BASE_SLOT_LIMIT + profileBackpackExtraSlots(profile);
  profile.backpackSlots = normalizeBackpackSlots(profileBackpackSlots(profile), limit);
  profile.captureTools = captureToolBagFromProfile(profile);
  return profile.backpackSlots;
}

function consumeProfileBackpackItem(profile, itemId, count = 1) {
  const slots = normalizeProfileBackpack(profile);
  const normalizedItemId = String(itemId || "").trim();
  const required = Math.max(1, Math.trunc(Number(count || 1)));
  if (backpackItemCount(slots, normalizedItemId) < required) {
    return false;
  }
  profile.backpackSlots = consumeBackpackItem(slots, normalizedItemId, required);
  profile.captureTools = captureToolBagFromProfile(profile);
  return true;
}

function playerStatPointGainFor(statKey) {
  const gains = objectOrEmpty(playerGrowthDocument().pointGains);
  return Math.max(1, Math.trunc(Number(gains[statKey] || 1)));
}

function playerBaseStatsFromPlayer(player) {
  const source = objectOrEmpty(player && player.baseStats);
  const result = {};
  for (const key of PLAYER_STAT_KEYS) {
    result[key] = Math.max(1, Math.trunc(Number(source[key] || DEFAULT_PLAYER_BATTLE_STATS[key] || 1)));
  }
  return result;
}

function applyPlayerStatAllocateAction(profile, params) {
  const statKey = String(params.statKey || params.key || params.stat || "").trim();
  if (!PLAYER_STAT_KEYS.includes(statKey)) {
    return {ok: false, code: "player_stat_invalid", message: "不能分配这个属性。"};
  }
  if (!profile.player || typeof profile.player !== "object" || Array.isArray(profile.player)) {
    profile.player = {};
  }
  const player = profile.player;
  const points = Math.max(0, Math.trunc(Number(player.statPoints || 0)));
  if (points <= 0) {
    return {ok: false, code: "player_stat_points_empty", message: "没有可分配属性点。", statKey};
  }
  const baseStats = playerBaseStatsFromPlayer(player);
  const gain = playerStatPointGainFor(statKey);
  baseStats[statKey] = Math.max(1, Math.trunc(Number(baseStats[statKey] || DEFAULT_PLAYER_BATTLE_STATS[statKey] || 1)) + gain);
  player.baseStats = baseStats;
  player.statPoints = points - 1;
  if (statKey === "maxHp") {
    player.hp = Math.max(1, Math.trunc(Number(player.hp || DEFAULT_PLAYER_BATTLE_STATS.maxHp)) + gain);
    player.maxHp = Math.max(baseStats.maxHp, Math.trunc(Number(player.maxHp || DEFAULT_PLAYER_BATTLE_STATS.maxHp)) + gain);
  }
  profile.player = player;
  return {
    ok: true,
    message: `${PLAYER_STAT_LABELS[statKey] || statKey} 提升到 ${baseStats[statKey]}。`,
    statKey,
    gain,
  };
}

function applyBackpackUnlockSlotAction(profile, params) {
  const extraSlots = profileBackpackExtraSlots(profile);
  if (extraSlots >= BACKPACK_EXTRA_SLOT_LIMIT) {
    return {ok: false, code: "backpack_slots_max", message: "扩展背包位已全部解锁。"};
  }
  const requested = Math.trunc(Number(params.extraSlotIndex ?? params.slotIndex ?? -1));
  if (requested >= 0 && requested !== extraSlots) {
    return {ok: false, code: "backpack_slot_order", message: "请先解锁前一个扩展背包位。"};
  }
  const cost = Math.max(0, Math.trunc(Number(BACKPACK_UNLOCK_COSTS[extraSlots] || 0)));
  const diamonds = profileCurrencyAmount(profile, SHOP_CURRENCY_DIAMONDS);
  if (diamonds < cost) {
    return {ok: false, code: "not_enough_diamonds", message: `钻石不足，还需要 ${cost - diamonds} 钻石。`, cost};
  }
  profile.backpackExtraSlots = extraSlots + 1;
  setProfileCurrencyAmount(profile, SHOP_CURRENCY_DIAMONDS, diamonds - cost);
  normalizeProfileBackpack(profile);
  return {ok: true, message: `已消耗 ${cost} 钻石，解锁第 ${extraSlots + 1} 个扩展背包位。`, cost};
}

function applyVillageHealAction(profile) {
  const quote = villageHealerQuote(profile);
  if (quote.missingHp <= 0) {
    return {ok: false, code: "heal_not_needed", message: "队伍生命已满。", heal: 0, cost: 0};
  }
  if (profileStoneCoins(profile) < quote.cost) {
    return {ok: false, code: "not_enough_stone_coins", message: "石币不足，无法治疗。", heal: 0, cost: quote.cost};
  }
  if (!profile.player || typeof profile.player !== "object" || Array.isArray(profile.player)) {
    profile.player = {};
  }
  const playerMax = Math.max(1, Math.trunc(Number(profile.player.maxHp || DEFAULT_PLAYER_BATTLE_STATS.maxHp)));
  profile.player.hp = playerMax;
  let healedUnits = 1;
  for (const pet of profilePetInstances(profile)) {
    if (!pet || typeof pet !== "object" || Array.isArray(pet)) {
      continue;
    }
    if (profilePetState(pet) === BATTLE_PET_STATE_STORAGE) {
      continue;
    }
    const maxHp = Math.max(1, Math.trunc(Number(pet.maxHp || DEFAULT_PET_BATTLE_STATS.maxHp)));
    if (Math.max(0, Math.trunc(Number(pet.hp || maxHp))) < maxHp) {
      healedUnits += 1;
    }
    pet.hp = maxHp;
  }
  profile.stoneCoins = Math.max(0, profileStoneCoins(profile) - quote.cost);
  return {ok: true, message: `村医治疗完成，恢复${quote.missingHp}生命，花费${quote.cost}石币。`, heal: quote.missingHp, cost: quote.cost, healedUnits};
}

function villageHealerQuote(profile) {
  const player = objectOrEmpty(profile && profile.player);
  const playerMax = Math.max(1, Math.trunc(Number(player.maxHp || DEFAULT_PLAYER_BATTLE_STATS.maxHp)));
  const playerHp = clampInt(player.hp, 0, playerMax, playerMax);
  let missingHp = Math.max(0, playerMax - playerHp);
  for (const pet of profilePetInstances(profile)) {
    if (!pet || typeof pet !== "object" || Array.isArray(pet) || profilePetState(pet) === BATTLE_PET_STATE_STORAGE) {
      continue;
    }
    const maxHp = Math.max(1, Math.trunc(Number(pet.maxHp || DEFAULT_PET_BATTLE_STATS.maxHp)));
    const hp = clampInt(pet.hp, 0, maxHp, maxHp);
    missingHp += Math.max(0, maxHp - hp);
  }
  return {
    missingHp,
    cost: missingHp > 0 ? Math.max(1, Math.ceil(missingHp / villageHealHpPerCoin())) : 0,
  };
}

function villageHealHpPerCoin() {
  const growth = objectOrEmpty(playerGrowthDocument());
  const economy = objectOrEmpty(growth.economy || growth.villageHealer || growth.healer);
  return Math.max(1, Math.trunc(Number(economy.villageHealHpPerCoin || economy.hpPerCoin || 20)));
}

function applyRecordPointSaveAction(profile, params) {
  const source = objectOrEmpty(params.recordPoint || params);
  profile.recordPoint = normalizeRecordPoint({
    mapId: source.mapId,
    spawnName: source.spawnName,
    label: source.label,
  });
  return {ok: true, message: `记录点已保存：${profile.recordPoint.label}。`};
}

function applyWorldItemUseAction(profile, params) {
  const itemId = String(params.itemId || "").trim();
  const item = bagItemById(itemId);
  if (!item) {
    return {ok: false, code: "item_invalid", message: "物品不存在。"};
  }
  const useType = String(objectOrEmpty(item.worldUse).type || "").trim();
  if (useType === "pet_heal") {
    return applyWorldPetHealItemAction(profile, itemId, params);
  }
  if (useType === "player_exp" || useType === "exp") {
    return applyWorldPlayerExpItemAction(profile, itemId);
  }
  if (useType === "pet_exp") {
    return applyWorldPetExpItemAction(profile, itemId, params);
  }
  if (useType === "mm_stone") {
    return applyWorldMmStoneItemAction(profile, itemId, params);
  }
  if (useType === "pet_form_egg" || useType === "pet_rebirth_mm_egg") {
    return applyWorldPetEggItemAction(profile, itemId);
  }
  if (useType === "encounter_stone") {
    return {ok: false, code: "item_use_hang_endpoint", message: "遇敌石请通过挂机入口使用。"};
  }
  return {ok: false, code: "item_use_unsupported", message: `${bagItemLabel(itemId)} 不能这样使用。`};
}

function worldUseForItem(itemId) {
  const item = bagItemById(itemId);
  return objectOrEmpty(item && item.worldUse);
}

function applyWorldPetHealItemAction(profile, itemId, params) {
  const petId = String(params.instanceId || params.petId || "").trim();
  const pet = profilePetByInstanceId(profile, petId);
  const itemLabel = bagItemLabel(itemId);
  if (!pet) {
    return {ok: false, code: "pet_missing", message: "没有找到这只宠物。"};
  }
  if (profilePetState(pet) === BATTLE_PET_STATE_STORAGE) {
    return {ok: false, code: "pet_in_storage", message: "只能对队伍宠物使用。"};
  }
  const worldUse = worldUseForItem(itemId);
  const healAmount = Math.max(0, Math.trunc(Number(worldUse.amount || 0)));
  if (healAmount <= 0) {
    return {ok: false, code: "item_use_unsupported", message: `${itemLabel} 不能这样使用。`};
  }
  const maxHp = Math.max(1, Math.trunc(Number(pet.maxHp || DEFAULT_PET_BATTLE_STATS.maxHp)));
  const hp = clampInt(pet.hp, 0, maxHp, maxHp);
  const allowFull = Boolean(worldUse.allowFullHpUse);
  if (hp >= maxHp && !allowFull) {
    return {ok: false, code: "pet_hp_full", message: `${profilePetName(pet)} 生命已满。`};
  }
  if (!consumeProfileBackpackItem(profile, itemId, 1)) {
    return {ok: false, code: "item_not_enough", message: `${itemLabel} 不够了。`};
  }
  const healed = Math.min(healAmount, Math.max(0, maxHp - hp));
  pet.hp = hp + healed;
  return {
    ok: true,
    message: healed > 0 ? `${profilePetName(pet)} 使用${itemLabel}，恢复${healed}生命。` : `${profilePetName(pet)} 吃下${itemLabel}，生命已满。`,
    itemId,
    instanceId: petId,
    heal: healed,
  };
}

function applyWorldPlayerExpItemAction(profile, itemId) {
  const itemLabel = bagItemLabel(itemId);
  if (!consumeProfileBackpackItem(profile, itemId, 1)) {
    return {ok: false, code: "item_not_enough", message: `${itemLabel} 不够了。`};
  }
  if (!profile.player || typeof profile.player !== "object" || Array.isArray(profile.player)) {
    profile.player = {};
  }
  const exp = expGrantForWorldItem(itemId);
  const award = applyBattleExpToEntry(profile.player, exp, MAX_PLAYER_LEVEL, {
    name: String(profile.player.name || "见习猎人"),
    statPointsPerLevel: PLAYER_STAT_POINTS_PER_LEVEL,
  });
  const publicExp = award.publicExp || {};
  return {
    ok: true,
    message: Number(publicExp.levelsGained || 0) > 0
      ? `${String(profile.player.name || "见习猎人")} 使用${itemLabel}，获得${exp}经验，升到 Lv${Number(profile.player.level || 1)}。`
      : `${String(profile.player.name || "见习猎人")} 使用${itemLabel}，获得${exp}经验，当前 Lv${Number(profile.player.level || 1)}。`,
    itemId,
    exp,
  };
}

function applyWorldPetExpItemAction(profile, itemId, params) {
  const petId = String(params.instanceId || params.petId || "").trim();
  const pet = profilePetByInstanceId(profile, petId);
  const itemLabel = bagItemLabel(itemId);
  if (!pet) {
    return {ok: false, code: "pet_missing", message: "没有找到这只宠物。"};
  }
  if (Math.trunc(Number(pet.level || 1)) >= MAX_PET_LEVEL) {
    return {ok: false, code: "pet_level_max", message: `${profilePetName(pet)} 已满级。`};
  }
  if (!consumeProfileBackpackItem(profile, itemId, 1)) {
    return {ok: false, code: "item_not_enough", message: `${itemLabel} 不够了。`};
  }
  const exp = expGrantForWorldItem(itemId);
  const award = applyBattleExpToEntry(pet, exp, MAX_PET_LEVEL, {name: profilePetName(pet)});
  const publicExp = award.publicExp || {};
  return {
    ok: true,
    message: Number(publicExp.levelsGained || 0) > 0
      ? `${profilePetName(pet)} 使用${itemLabel}，获得${exp}经验，升到 Lv${Number(pet.level || 1)}。`
      : `${profilePetName(pet)} 使用${itemLabel}，获得${exp}经验，当前 Lv${Number(pet.level || 1)}。`,
    itemId,
    instanceId: petId,
    exp,
  };
}

function expGrantForWorldItem(itemId) {
  const level = Math.max(1, Math.trunc(Number(worldUseForItem(itemId).level || 1)));
  let total = 0;
  for (let current = 1; current < Math.min(level, MAX_PLAYER_LEVEL); current += 1) {
    total += battleExpToNextLevel(current);
  }
  return Math.max(1, total || battleExpToNextLevel(level));
}

function applyWorldMmStoneItemAction(profile, itemId, params) {
  const petId = String(params.instanceId || params.petId || "").trim();
  const pet = profilePetByInstanceId(profile, petId);
  const itemLabel = bagItemLabel(itemId);
  if (!pet) {
    return {ok: false, code: "pet_missing", message: "没有找到这只转生MM。"};
  }
  if (!petRebirthMmIsHelperPet(pet)) {
    return {ok: false, code: "pet_not_mm_helper", message: `${profilePetName(pet)} 不是转生MM。`};
  }
  if (profilePetState(pet) === BATTLE_PET_STATE_STORAGE) {
    return {ok: false, code: "pet_in_storage", message: `${profilePetName(pet)} 在兽栏中，不能喂石。`};
  }
  if (Math.trunc(Number(pet.level || 1)) >= 74) {
    return {ok: false, code: "mm_stone_level_limit", message: `${profilePetName(pet)} 已到 Lv74，不能继续喂石。`};
  }
  const worldUse = worldUseForItem(itemId);
  const stat = String(worldUse.stat || "").trim();
  const points = Math.max(0, Math.trunc(Number(worldUse.points || 0)));
  if (!["maxHp", "attack", "defense", "quick"].includes(stat) || points <= 0) {
    return {ok: false, code: "mm_stone_invalid", message: `${itemLabel} 没有有效石头点数。`};
  }
  const record = normalizedPetRebirthHelperRecord(pet);
  const before = Math.max(0, Math.trunc(Number(record.stonePoints[stat] || 0)));
  if (before >= PET_REBIRTH_MM_STONE_CAPACITY) {
    return {ok: false, code: "mm_stone_full", message: `${profilePetName(pet)} 的${mmStoneStatLabel(stat)}石已满。`};
  }
  if (!consumeProfileBackpackItem(profile, itemId, 1)) {
    return {ok: false, code: "item_not_enough", message: `${itemLabel} 不够了。`};
  }
  const after = Math.min(PET_REBIRTH_MM_STONE_CAPACITY, before + points);
  record.stonePoints[stat] = after;
  pet.petRebirthHelper = record;
  return {
    ok: true,
    message: `${profilePetName(pet)} 使用${itemLabel}，${mmStoneStatLabel(stat)}石 ${after}/${PET_REBIRTH_MM_STONE_CAPACITY}。`,
    itemId,
    instanceId: petId,
    amount: after - before,
  };
}

function petRebirthMmIsHelperPet(pet) {
  const helper = objectOrEmpty(pet && pet.petRebirthHelper);
  if (Math.trunc(Number(helper.stage || 0)) > 0) {
    return true;
  }
  return String(pet && (pet.formId || pet.templateId || "")).includes("pet_rebirth_mm");
}

function normalizedPetRebirthHelperRecord(pet, fallbackStage = 1) {
  const source = objectOrEmpty(pet && pet.petRebirthHelper);
  const points = objectOrEmpty(source.stonePoints);
  return {
    schemaVersion: 1,
    stage: Math.max(1, Math.trunc(Number(source.stage || fallbackStage))),
    stonePoints: {
      maxHp: clampInt(points.maxHp, 0, PET_REBIRTH_MM_STONE_CAPACITY, 0),
      attack: clampInt(points.attack, 0, PET_REBIRTH_MM_STONE_CAPACITY, 0),
      defense: clampInt(points.defense, 0, PET_REBIRTH_MM_STONE_CAPACITY, 0),
      quick: clampInt(points.quick, 0, PET_REBIRTH_MM_STONE_CAPACITY, 0),
    },
  };
}

function mmStoneStatLabel(stat) {
  return {maxHp: "生命", attack: "攻击", defense: "防御", quick: "敏捷"}[String(stat || "")] || "能力";
}

function applyWorldPetEggItemAction(profile, itemId) {
  const itemLabel = bagItemLabel(itemId);
  const grant = grantPetFromWorldEgg(profile, itemId);
  if (!grant.ok) {
    return grant;
  }
  if (!consumeProfileBackpackItem(profile, itemId, 1)) {
    return {ok: false, code: "item_not_enough", message: `${itemLabel} 不够了。`};
  }
  return {
    ok: true,
    message: `使用${itemLabel}，${grant.message}`,
    itemId,
    instanceId: grant.instanceId,
  };
}

function grantPetFromWorldEgg(profile, itemId) {
  const worldUse = worldUseForItem(itemId);
  let formId = String(worldUse.formId || "").trim();
  let name = String(worldUse.petName || "").trim();
  const useType = String(worldUse.type || "").trim();
  if (useType === "pet_rebirth_mm_egg") {
    const stage = Math.max(1, Math.trunc(Number(worldUse.stage || 1)));
    formId = stage >= 2 ? "pet_rebirth_mm_stage2" : "pet_rebirth_mm_stage1";
    name = stage >= 2 ? "2转小MM" : "1转小MM";
  }
  if (formId === "") {
    return {ok: false, code: "pet_egg_invalid", message: `${bagItemLabel(itemId)} 没有配置宠物。`};
  }
  const instances = profilePetInstances(profile);
  const state = profilePartyVisiblePetCount(profile) < BATTLE_PET_MAX_PER_PARTICIPANT
    ? BATTLE_PET_STATE_STANDBY
    : BATTLE_PET_STATE_STORAGE;
  if (state === BATTLE_PET_STATE_STORAGE && profileStoragePetCount(profile) >= BATTLE_PET_STORAGE_LIMIT) {
    return {ok: false, code: "pet_capacity_full", message: `队伍和兽栏都满了，无法孵化${name || "宠物"}。`};
  }
  const serial = nextProfilePetInstanceSerial(profile, instances);
  const instanceId = `pet_egg_${safeIdPart(formId)}_${serial}`;
  const pet = createDefaultServerPet(instanceId, name || "宠物", formId, state, 1);
  if (!pet || Object.keys(pet).length <= 0) {
    return {ok: false, code: "pet_template_missing", message: `${bagItemLabel(itemId)} 对应宠物不存在。`};
  }
  pet.capturedSerial = serial;
  pet.individualSeed = `pet_egg:${formId}:${serial}`;
  pet.isNew = true;
  if (useType === "pet_rebirth_mm_egg") {
    pet.petRebirthHelper = normalizedPetRebirthHelperRecord({petRebirthHelper: {stage: Math.max(1, Math.trunc(Number(worldUse.stage || 1))) }});
  }
  instances.push(pet);
  profile.nextPetInstanceSerial = serial + 1;
  recordProfilePetCodexForm(profile, formId, true);
  return {ok: true, message: `获得 Lv1 ${profilePetName(pet)}，已加入${state === BATTLE_PET_STATE_STORAGE ? "兽栏" : "队伍"}。`, instanceId};
}

function safeIdPart(value) {
  const text = String(value || "").toLowerCase().trim();
  const result = text.replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return result || "pet";
}

function petSkillTrainingTrainerSkillIds(trainerId) {
  const normalizedTrainerId = String(trainerId || "firebud_pet_skill_trainer").trim();
  const trainers = Array.isArray(petSkillTrainingDocument().trainers) ? petSkillTrainingDocument().trainers : [];
  const trainer = trainers.find((entry) => entry && String(entry.trainerId || "") === normalizedTrainerId) || null;
  return uniqueStringArray(trainer && trainer.skillIds);
}

function petSkillTrainingCost(skillId) {
  const skills = Array.isArray(petSkillTrainingDocument().skills) ? petSkillTrainingDocument().skills : [];
  const entry = skills.find((item) => item && String(item.skillId || "") === String(skillId || "")) || null;
  return Math.max(0, Math.trunc(Number(entry && entry.cost || 30)));
}

function battleActionLabel(actionId, fallback = "") {
  const action = battleActionById(actionId);
  return action ? String(action.label || action.name || action.id || fallback || "技能") : (fallback || String(actionId || "技能"));
}

function petSkillSlotsForPet(pet) {
  const source = Array.isArray(pet && pet.petSkillSlots) ? pet.petSkillSlots : [];
  const active = uniqueStringArray(pet && pet.activeSkillIds);
  const slots = source.slice(0, 7).map((value) => String(value || "").trim());
  while (slots.length < 7) {
    slots.push("");
  }
  for (const skillId of active) {
    if (skillId !== "" && !slots.includes(skillId)) {
      const index = slots.findIndex((value) => value === "");
      if (index >= 0) {
        slots[index] = skillId;
      }
    }
  }
  return slots.slice(0, 7);
}

function applyPetSkillSetSlotAction(profile, params) {
  const petId = String(params.instanceId || params.petId || "").trim();
  const pet = profilePetByInstanceId(profile, petId);
  if (!pet) {
    return {ok: false, code: "pet_missing", message: "没有找到这只宠物。"};
  }
  const slot = clampInt(params.slot, 1, 7, 1);
  const skillId = String(params.skillId || "").trim();
  const learningEmpty = skillId === "";
  if (!learningEmpty) {
    const trainerId = String(params.trainerId || "firebud_pet_skill_trainer").trim();
    if (!petSkillTrainingTrainerSkillIds(trainerId).includes(skillId)) {
      return {ok: false, code: "pet_skill_not_offered", message: "这个训练师不会教该技能。"};
    }
    const action = battleActionById(skillId);
    if (!action || String(action.owner || "") !== "pet_skill") {
      return {ok: false, code: "pet_skill_invalid", message: "该技能不能作为宠物技能学习。"};
    }
  }
  const slots = petSkillSlotsForPet(pet);
  const previousSkillId = String(slots[slot - 1] || "");
  if (previousSkillId === skillId) {
    return {ok: true, message: `技${slot} 已经是${learningEmpty ? "空技能" : battleActionLabel(skillId, skillId)}。`, slot, instanceId: petId};
  }
  const learned = uniqueStringArray(pet.activeSkillIds);
  const alreadyLearned = !learningEmpty && learned.includes(skillId);
  const cost = learningEmpty || alreadyLearned ? 0 : petSkillTrainingCost(skillId);
  if (cost > 0 && profileStoneCoins(profile) < cost) {
    return {ok: false, code: "not_enough_stone_coins", message: `石币不足，需要${cost}石币。`, cost};
  }
  if (previousSkillId !== "") {
    const previousIndex = learned.indexOf(previousSkillId);
    if (previousIndex >= 0) {
      learned.splice(previousIndex, 1);
    }
    pet.forgottenSkillIds = uniqueStringArray([...(Array.isArray(pet.forgottenSkillIds) ? pet.forgottenSkillIds : []), previousSkillId]);
  }
  for (let index = 0; index < slots.length; index += 1) {
    if (!learningEmpty && slots[index] === skillId) {
      slots[index] = "";
    }
  }
  if (!learningEmpty && !learned.includes(skillId)) {
    learned.push(skillId);
  }
  if (!learningEmpty) {
    pet.forgottenSkillIds = uniqueStringArray(pet.forgottenSkillIds).filter((value) => value !== skillId);
  }
  slots[slot - 1] = skillId;
  pet.activeSkillIds = learned;
  pet.petSkillSlots = slots;
  if (cost > 0) {
    profile.stoneCoins = Math.max(0, profileStoneCoins(profile) - cost);
  }
  return {
    ok: true,
    message: learningEmpty ? `${profilePetName(pet)} 的技${slot} 已设为空技能。` : `${profilePetName(pet)} 学会了${battleActionLabel(skillId, skillId)}，配置到技${slot}。`,
    slot,
    itemId: skillId,
    instanceId: petId,
    cost,
  };
}

function applyPetSkillMoveSlotAction(profile, params) {
  const petId = String(params.instanceId || params.petId || "").trim();
  const pet = profilePetByInstanceId(profile, petId);
  if (!pet) {
    return {ok: false, code: "pet_missing", message: "没有找到这只宠物。"};
  }
  const slot = clampInt(params.slot, 1, 7, 1);
  const targetSlot = clampInt(slot + clampInt(params.direction, -1, 1, 0), 1, 7, slot);
  if (targetSlot === slot) {
    return {ok: false, code: "pet_skill_same_slot", message: "已经在这个技能位。"};
  }
  const slots = petSkillSlotsForPet(pet);
  const skillId = String(slots[slot - 1] || "");
  if (skillId === "") {
    return {ok: false, code: "pet_skill_slot_empty", message: "这个技能位还没有技能。"};
  }
  const temp = slots[targetSlot - 1];
  slots[targetSlot - 1] = skillId;
  slots[slot - 1] = temp;
  pet.petSkillSlots = slots;
  return {ok: true, message: `${battleActionLabel(skillId, skillId)} 已移动到技${targetSlot}。`, slot: targetSlot, instanceId: petId};
}

function applyPetSkillForgetAction(profile, params) {
  const petId = String(params.instanceId || params.petId || "").trim();
  const skillId = String(params.skillId || "").trim();
  if (!skillId) {
    return {ok: false, code: "pet_skill_empty", message: "请选择要遗忘的技能。"};
  }
  if (skillId === BATTLE_ACTION_PET_ATTACK || skillId === BATTLE_ACTION_PET_DEFEND) {
    return {ok: false, code: "pet_skill_base", message: "攻击和防御不能遗忘。"};
  }
  const pet = profilePetByInstanceId(profile, petId);
  if (!pet) {
    return {ok: false, code: "pet_missing", message: "没有找到这只宠物。"};
  }
  pet.activeSkillIds = uniqueStringArray(pet.activeSkillIds).filter((value) => value !== skillId);
  pet.forgottenSkillIds = uniqueStringArray([...(Array.isArray(pet.forgottenSkillIds) ? pet.forgottenSkillIds : []), skillId]);
  pet.petSkillSlots = petSkillSlotsForPet(pet).map((value) => value === skillId ? "" : value);
  return {ok: true, message: `${profilePetName(pet)} 遗忘了${battleActionLabel(skillId, skillId)}。`, itemId: skillId, instanceId: petId};
}

function applyPetStateCycleAction(profile, params) {
  const petId = String(params.instanceId || params.petId || "").trim();
  const pet = profilePetByInstanceId(profile, petId);
  if (!pet) {
    return {ok: false, code: "pet_missing", message: "没有找到这只宠物。"};
  }
  if (profilePetState(pet) === BATTLE_PET_STATE_STORAGE) {
    return {ok: false, code: "pet_in_storage", message: `${profilePetName(pet)} 在兽栏里，暂时不能切换状态。`};
  }
  const current = String(profile.ridePetInstanceId || "") === petId ? BATTLE_PET_STATE_RIDING : profilePetState(pet);
  let target = "";
  if (current === BATTLE_PET_STATE_REST) {
    target = BATTLE_PET_STATE_STANDBY;
  } else if (current === BATTLE_PET_STATE_STANDBY) {
    target = BATTLE_PET_STATE_BATTLE;
  } else if (current === BATTLE_PET_STATE_RIDING) {
    target = BATTLE_PET_STATE_BATTLE;
  } else if (current === BATTLE_PET_STATE_BATTLE) {
    target = BATTLE_PET_STATE_REST;
  }
  if (target === "") {
    return {ok: false, code: "pet_state_invalid", message: `${profilePetName(pet)} 当前状态不能切换。`};
  }
  if (target === BATTLE_PET_STATE_BATTLE && Math.trunc(Number(pet.hp || 0)) <= 0) {
    return {ok: false, code: "pet_hp_zero", message: `${profilePetName(pet)} 生命为 0，不能出战。`};
  }
  if (target === BATTLE_PET_STATE_BATTLE) {
    for (const other of profilePetInstances(profile)) {
      if (other && String(other.state || "") === BATTLE_PET_STATE_BATTLE) {
        other.state = BATTLE_PET_STATE_STANDBY;
      }
    }
    profile.activePetInstanceId = petId;
  } else if (String(profile.activePetInstanceId || "") === petId) {
    profile.activePetInstanceId = "";
  }
  if (String(profile.ridePetInstanceId || "") === petId) {
    profile.ridePetInstanceId = "";
  }
  pet.state = target;
  ensureActivePetAfterInstanceRemoval(profile);
  return {ok: true, message: `${profilePetName(pet)} 已切换为${stateLabel(target)}。`, instanceId: petId};
}

function applyPetStableToggleAction(profile, params) {
  const petId = String(params.instanceId || params.petId || "").trim();
  const pet = profilePetByInstanceId(profile, petId);
  if (!pet) {
    return {ok: false, code: "pet_missing", message: "没有找到这只宠物。"};
  }
  return profilePetState(pet) === BATTLE_PET_STATE_STORAGE
    ? withdrawPetToProfile(profile, petId)
    : storePetToProfile(profile, petId);
}

function storePetToProfile(profile, petId) {
  const pet = profilePetByInstanceId(profile, petId);
  if (!pet) {
    return {ok: false, code: "pet_missing", message: "没有找到这只宠物。"};
  }
  if (String(profile.ridePetInstanceId || "") === petId) {
    return {ok: false, code: "pet_riding", message: `${profilePetName(pet)} 正在骑乘中，不能存入兽栏。`};
  }
  if (profilePetState(pet) === BATTLE_PET_STATE_STORAGE) {
    return {ok: false, code: "pet_already_storage", message: `${profilePetName(pet)} 已在兽栏。`};
  }
  if (profileStoragePetCount(profile) >= BATTLE_PET_STORAGE_LIMIT) {
    return {ok: false, code: "pet_storage_full", message: "兽栏已满。"};
  }
  pet.state = BATTLE_PET_STATE_STORAGE;
  if (String(profile.activePetInstanceId || "") === petId) {
    profile.activePetInstanceId = "";
  }
  ensureActivePetAfterInstanceRemoval(profile);
  return {ok: true, message: `${profilePetName(pet)} 已存入兽栏。`, instanceId: petId};
}

function withdrawPetToProfile(profile, petId) {
  const pet = profilePetByInstanceId(profile, petId);
  if (!pet) {
    return {ok: false, code: "pet_missing", message: "没有找到这只宠物。"};
  }
  if (profilePetState(pet) !== BATTLE_PET_STATE_STORAGE) {
    return {ok: false, code: "pet_not_storage", message: `${profilePetName(pet)} 不在兽栏。`};
  }
  if (profilePartyVisiblePetCount(profile) >= BATTLE_PET_MAX_PER_PARTICIPANT) {
    return {ok: false, code: "pet_party_full", message: "队伍已满。"};
  }
  pet.state = BATTLE_PET_STATE_STANDBY;
  return {ok: true, message: `${profilePetName(pet)} 已取出。`, instanceId: petId};
}

function applyPetPartyMoveAction(profile, params) {
  const petId = String(params.instanceId || params.petId || "").trim();
  const direction = clampInt(params.direction, -1, 1, 0);
  if (direction === 0) {
    return {ok: false, code: "pet_move_invalid", message: "移动方向不正确。"};
  }
  const instances = profilePetInstances(profile);
  const visibleIndices = instances
    .map((pet, index) => ({pet, index}))
    .filter((entry) => entry.pet && profilePetState(entry.pet) !== BATTLE_PET_STATE_STORAGE);
  const visibleIndex = visibleIndices.findIndex((entry) => profilePetIdentityValues(entry.pet).includes(petId));
  const targetVisibleIndex = visibleIndex + direction;
  if (visibleIndex < 0) {
    return {ok: false, code: "pet_missing", message: "没有找到这只宠物。"};
  }
  if (targetVisibleIndex < 0 || targetVisibleIndex >= visibleIndices.length) {
    return {ok: false, code: "pet_move_edge", message: "已经在边缘位置。"};
  }
  const a = visibleIndices[visibleIndex].index;
  const b = visibleIndices[targetVisibleIndex].index;
  const temp = instances[a];
  instances[a] = instances[b];
  instances[b] = temp;
  return {ok: true, message: `${profilePetName(instances[b])} 已调整位置。`, instanceId: petId};
}

function applyPetLockToggleAction(profile, params) {
  const petId = String(params.instanceId || params.petId || "").trim();
  const pet = profilePetByInstanceId(profile, petId);
  if (!pet) {
    return {ok: false, code: "pet_missing", message: "没有找到这只宠物。"};
  }
  pet.locked = !Boolean(pet.locked);
  return {ok: true, message: `${profilePetName(pet)} 已${pet.locked ? "锁定" : "解锁"}。`, instanceId: petId};
}

function applyPetBatchStoreAction(profile) {
  const available = Math.max(0, BATTLE_PET_STORAGE_LIMIT - profileStoragePetCount(profile));
  if (available <= 0) {
    return {ok: false, code: "pet_storage_full", message: "兽栏已满。", changedCount: 0};
  }
  let storedCount = 0;
  let skippedCount = 0;
  const rideId = String(profile.ridePetInstanceId || "");
  for (const pet of profilePetInstances(profile)) {
    if (storedCount >= available || !pet || typeof pet !== "object" || Array.isArray(pet)) {
      continue;
    }
    const state = profilePetState(pet);
    if (state === BATTLE_PET_STATE_STORAGE || state === BATTLE_PET_STATE_BATTLE) {
      continue;
    }
    const petId = String(pet.instanceId || pet.petId || "");
    if (petId === rideId || Boolean(pet.locked)) {
      skippedCount += 1;
      continue;
    }
    pet.state = BATTLE_PET_STATE_STORAGE;
    storedCount += 1;
  }
  ensureActivePetAfterInstanceRemoval(profile);
  return {ok: storedCount > 0, code: storedCount > 0 ? "" : "pet_batch_empty", message: storedCount > 0 ? `已批量存入${storedCount}只，跳过${skippedCount}只。` : "没有可批量存入的宠物。", changedCount: storedCount, skippedCount};
}

function applyPetBatchStateAction(profile, params) {
  const target = String(params.targetState || params.state || "").trim();
  if (![BATTLE_PET_STATE_STANDBY, BATTLE_PET_STATE_REST].includes(target)) {
    return {ok: false, code: "pet_state_invalid", message: "暂不支持这种批量状态。"};
  }
  let changedCount = 0;
  let skippedCount = 0;
  const rideId = String(profile.ridePetInstanceId || "");
  for (const pet of profilePetInstances(profile)) {
    if (!pet || typeof pet !== "object" || Array.isArray(pet)) {
      continue;
    }
    const petId = String(pet.instanceId || pet.petId || "");
    const state = profilePetState(pet);
    if (state === BATTLE_PET_STATE_STORAGE || state === target) {
      continue;
    }
    if (petId === rideId || Boolean(pet.locked)) {
      skippedCount += 1;
      continue;
    }
    if (target === BATTLE_PET_STATE_STANDBY && state !== BATTLE_PET_STATE_REST && state !== BATTLE_PET_STATE_BATTLE) {
      continue;
    }
    if (target === BATTLE_PET_STATE_REST && state !== BATTLE_PET_STATE_STANDBY && state !== BATTLE_PET_STATE_BATTLE) {
      continue;
    }
    pet.state = target;
    if (String(profile.activePetInstanceId || "") === petId) {
      profile.activePetInstanceId = "";
    }
    changedCount += 1;
  }
  ensureActivePetAfterInstanceRemoval(profile);
  return {ok: changedCount > 0, code: changedCount > 0 ? "" : "pet_batch_empty", message: changedCount > 0 ? `已批量切换${changedCount}只为${stateLabel(target)}，跳过${skippedCount}只。` : "没有可切换状态的宠物。", changedCount, skippedCount};
}

function applyPetRenameAction(profile, params) {
  const petId = String(params.instanceId || params.petId || "").trim();
  const pet = profilePetByInstanceId(profile, petId);
  if (!pet) {
    return {ok: false, code: "pet_missing", message: "没有找到这只宠物。"};
  }
  const nextName = cleanPetName(String(params.name || params.rawName || ""));
  if (nextName === "") {
    return {ok: false, code: "pet_name_empty", message: "名字不能为空。"};
  }
  if ([...nextName].length > PET_NAME_MAX_LENGTH) {
    return {ok: false, code: "pet_name_too_long", message: `名字最多 ${PET_NAME_MAX_LENGTH} 个字。`};
  }
  const oldName = profilePetName(pet);
  if (oldName === nextName) {
    return {ok: false, code: "pet_name_unchanged", message: "名字没有变化。"};
  }
  pet.name = nextName;
  return {ok: true, message: `${oldName} 已改名为${nextName}。`, instanceId: petId};
}

function cleanPetName(value) {
  return String(value || "").replace(/\r|\n|\t/g, " ").replace(/\s+/g, " ").trim();
}

function applyPetDropAction(profile, params, now) {
  const petId = String(params.instanceId || params.petId || "").trim();
  const index = profilePetIndexById(profile, petId);
  const instances = profilePetInstances(profile);
  const pet = index >= 0 ? instances[index] : null;
  if (!pet) {
    return {ok: false, code: "pet_missing", message: "没有找到这只宠物。"};
  }
  if (String(profile.ridePetInstanceId || "") === petId) {
    return {ok: false, code: "pet_riding", message: `${profilePetName(pet)} 正在骑乘中，不能丢弃。`};
  }
  if (profilePetState(pet) === BATTLE_PET_STATE_STORAGE) {
    return {ok: false, code: "pet_in_storage", message: "兽栏里的宠物不能直接丢弃。"};
  }
  if (Boolean(pet.locked)) {
    return {ok: false, code: "pet_locked", message: `${profilePetName(pet)} 已锁定，不能丢弃。`};
  }
  const mapId = String(params.mapId || "").trim();
  const cell = Array.isArray(params.cell) ? params.cell : [params.cellX, params.cellY];
  if (mapId === "" || !Array.isArray(cell) || cell.length < 2) {
    return {ok: false, code: "pet_drop_position_invalid", message: "当前位置不能丢弃宠物。"};
  }
  const nowSec = Math.max(0, Math.trunc(Number(params.nowSec || now() / 1000)));
  const serial = nextPetDropSerial(profile);
  const dropId = `ground_pet_${serial}`;
  const droppedPet = clone(pet);
  droppedPet.state = BATTLE_PET_STATE_STANDBY;
  profile.groundPetDrops = Array.isArray(profile.groundPetDrops) ? profile.groundPetDrops : [];
  profile.groundPetDrops.push({
    dropId,
    ownerId: "local_player",
    pickupMode: "public",
    mapId,
    cell: [Math.trunc(Number(cell[0] || 0)), Math.trunc(Number(cell[1] || 0))],
    createdAtSec: nowSec,
    expiresAtSec: nowSec + PET_DROP_TTL_SECONDS,
    pet: droppedPet,
    schemaVersion: 1,
  });
  instances.splice(index, 1);
  profile.nextPetDropSerial = serial + 1;
  if (String(profile.activePetInstanceId || "") === petId) {
    profile.activePetInstanceId = "";
  }
  ensureActivePetAfterInstanceRemoval(profile);
  return {ok: true, message: `${profilePetName(droppedPet)} 被丢在地上。`, dropId, instanceId: petId};
}

function nextPetDropSerial(profile) {
  let serial = Math.max(1, Math.trunc(Number(profile && profile.nextPetDropSerial || 1)));
  const drops = Array.isArray(profile && profile.groundPetDrops) ? profile.groundPetDrops : [];
  for (const drop of drops) {
    const match = String(drop && drop.dropId || "").match(/^ground_pet_(\d+)$/);
    if (match) {
      serial = Math.max(serial, Math.trunc(Number(match[1] || 0)) + 1);
    }
  }
  return serial;
}

function applyPetClearStorageAction(profile, params) {
  const petId = String(params.instanceId || params.petId || "").trim();
  const index = profilePetIndexById(profile, petId);
  const instances = profilePetInstances(profile);
  const pet = index >= 0 ? instances[index] : null;
  if (!pet) {
    return {ok: false, code: "pet_missing", message: "没有找到这只宠物。"};
  }
  if (profilePetState(pet) !== BATTLE_PET_STATE_STORAGE) {
    return {ok: false, code: "pet_not_storage", message: "只有兽栏里的宠物可以清理。"};
  }
  if (Boolean(pet.locked)) {
    return {ok: false, code: "pet_locked", message: `${profilePetName(pet)} 已锁定，不能清理。`};
  }
  instances.splice(index, 1);
  ensureActivePetAfterInstanceRemoval(profile);
  return {ok: true, message: `${profilePetName(pet)} 已清理。`, instanceId: petId};
}

function applyPetPickupDropAction(profile, params, now) {
  const dropId = String(params.dropId || "").trim();
  const nowSec = Math.max(0, Math.trunc(Number(params.nowSec || now() / 1000)));
  expireGroundPetDrops(profile, nowSec);
  const drops = Array.isArray(profile.groundPetDrops) ? profile.groundPetDrops : [];
  const index = drops.findIndex((drop) => drop && String(drop.dropId || "") === dropId);
  if (index < 0) {
    return {ok: false, code: "pet_drop_missing", message: "这只宠物已经离开了。"};
  }
  if (profilePartyVisiblePetCount(profile) >= BATTLE_PET_MAX_PER_PARTICIPANT) {
    return {ok: false, code: "pet_party_full", message: "队伍已满。"};
  }
  const pet = clone(objectOrEmpty(drops[index].pet));
  if (!pet || Object.keys(pet).length <= 0) {
    return {ok: false, code: "pet_drop_invalid", message: "这只宠物已经离开了。"};
  }
  const playerLevel = Math.max(1, Math.trunc(Number(profile && profile.player && profile.player.level || 1)));
  const petLevel = Math.max(1, Math.trunc(Number(pet.level || 1)));
  if (petLevel > playerLevel + PET_PICKUP_LEVEL_MARGIN) {
    return {ok: false, code: "pet_pickup_level_limit", message: "不能拾取超过自己5级以上的宠物。"};
  }
  pet.state = BATTLE_PET_STATE_STANDBY;
  drops.splice(index, 1);
  profilePetInstances(profile).push(pet);
  return {ok: true, message: `${profilePetName(pet)} 回到队伍。`, dropId, instanceId: String(pet.instanceId || pet.petId || "")};
}

function applyPetExpireDropsAction(profile, params, now) {
  const nowSec = Math.max(0, Math.trunc(Number(params.nowSec || now() / 1000)));
  const expiredCount = expireGroundPetDrops(profile, nowSec);
  return {ok: expiredCount > 0, code: expiredCount > 0 ? "" : "pet_drop_no_expired", message: expiredCount > 0 ? "地上的宠物离开了。" : "没有过期的地面宠物。", changedCount: expiredCount};
}

function expireGroundPetDrops(profile, nowSec) {
  const drops = Array.isArray(profile.groundPetDrops) ? profile.groundPetDrops : [];
  const active = drops.filter((drop) => {
    const expiresAt = Math.max(0, Math.trunc(Number(drop && drop.expiresAtSec || 0)));
    return expiresAt <= 0 || nowSec < expiresAt;
  });
  const expiredCount = Math.max(0, drops.length - active.length);
  if (expiredCount > 0) {
    profile.groundPetDrops = active;
  }
  return expiredCount;
}

function applyPetMarkSeenAction(profile, params) {
  const petId = String(params.instanceId || params.petId || "").trim();
  const pet = profilePetByInstanceId(profile, petId);
  if (!pet) {
    return {ok: false, code: "pet_missing", message: "没有找到这只宠物。"};
  }
  pet.isNew = false;
  return {ok: true, message: "", instanceId: petId};
}

function applyPetCultivationAction(profile, params, now) {
  const petId = String(params.instanceId || params.petId || "").trim();
  const mode = String(params.mode || "").trim().toLowerCase();
  const pet = profilePetByInstanceId(profile, petId);
  if (!pet) {
    return {ok: false, code: "pet_missing", message: "没有找到这只宠物。"};
  }
  if (Boolean(pet.locked)) {
    return {ok: false, code: "pet_locked", message: `${profilePetName(pet)} 已锁定，不能转强。`, instanceId: petId};
  }
  if (petRequiredByActiveQuest(profile, pet)) {
    return {ok: false, code: "pet_required_by_quest", message: `${profilePetName(pet)} 是当前任务需要的宠物，不能转强。`, instanceId: petId};
  }
  if (shouldUsePetRebirthMm(pet, mode)) {
    return applyPetRebirthMmCultivationAction(profile, pet, now);
  }
  return applyBasicPetCultivationAction(profile, pet, mode, now);
}

function shouldUsePetRebirthMm(pet, mode) {
  if (mode === PET_CULTIVATION_MODE_REBIRTH) {
    return true;
  }
  if (petRebirthMmIsHelperPet(pet)) {
    return false;
  }
  const record = normalizedPetCultivationRecord(pet.petCultivation);
  return Math.max(1, Math.trunc(Number(pet.level || 1))) >= PET_REBIRTH_MM_TARGET_REQUIRED_LEVEL ||
    Math.max(0, Math.trunc(Number(record.rebirthCount || 0))) > 0;
}

function applyBasicPetCultivationAction(profile, pet, mode, now) {
  const petId = String(pet.instanceId || pet.petId || "");
  const resolvedMode = mode === PET_CULTIVATION_MODE_REBIRTH ? PET_CULTIVATION_MODE_REBIRTH : PET_CULTIVATION_MODE_ENHANCE;
  const record = normalizedPetCultivationRecord(pet.petCultivation);
  if (resolvedMode === PET_CULTIVATION_MODE_REBIRTH) {
    return {ok: false, code: "pet_rebirth_requires_mm", message: "宠物转生需要对应阶段的转生MM。", instanceId: petId};
  }
  const current = clampInt(record.enhanceLevel, 0, PET_CULTIVATION_MAX_ENHANCE_LEVEL, 0);
  if (current >= PET_CULTIVATION_MAX_ENHANCE_LEVEL) {
    return {ok: false, code: "pet_enhance_max", message: "强化等级已到当前原型上限。", instanceId: petId};
  }
  const nextRecord = normalizedPetCultivationRecord(record);
  nextRecord.enhanceLevel = current + 1;
  const event = petCultivationResultEvent(pet, record, nextRecord, PET_CULTIVATION_MODE_ENHANCE, Math.trunc(now() / 1000));
  pushPetCultivationEvent(nextRecord, event);
  pet.petCultivation = nextRecord;
  pet.lastCultivationResult = clone(event);
  return {
    ok: true,
    message: String(event.message || "宠物培养完成。"),
    instanceId: petId,
    result: event,
  };
}

function applyPetRebirthMmCultivationAction(profile, pet, now) {
  const petId = String(pet.instanceId || pet.petId || "");
  if (petRebirthMmIsHelperPet(pet)) {
    return {ok: false, code: "pet_rebirth_target_is_helper", message: "转生MM不能作为转生目标。", instanceId: petId};
  }
  const record = normalizedPetCultivationRecord(pet.petCultivation);
  const expectedStage = clampInt(Math.max(0, Math.trunc(Number(record.rebirthCount || 0))) + 1, 1, PET_REBIRTH_MM_MAX_STAGE + 1, 1);
  if (expectedStage > PET_REBIRTH_MM_MAX_STAGE) {
    return {ok: false, code: "pet_rebirth_stage_max", message: "当前只开放到2转宠物转生。", instanceId: petId};
  }
  if (Math.max(1, Math.trunc(Number(pet.level || 1))) < PET_REBIRTH_MM_TARGET_REQUIRED_LEVEL) {
    return {ok: false, code: "pet_rebirth_level_low", message: `${profilePetName(pet)} 需要 Lv${PET_REBIRTH_MM_TARGET_REQUIRED_LEVEL} 才能进行宠物转生。`, instanceId: petId};
  }
  const helper = petRebirthMmHelperForTarget(profile, pet, expectedStage);
  if (!helper) {
    return {ok: false, code: "pet_rebirth_helper_missing", message: `${profilePetName(pet)} 需要 ${petRebirthMmHelperName(expectedStage)}。`, instanceId: petId};
  }
  const helperId = String(helper.instanceId || helper.petId || "");
  if (Boolean(helper.locked)) {
    return {ok: false, code: "pet_rebirth_helper_locked", message: `${profilePetName(helper)} 已锁定，不能作为转强材料。`, instanceId: petId};
  }
  if (petRequiredByActiveQuest(profile, helper)) {
    return {ok: false, code: "pet_rebirth_helper_required_by_quest", message: `${profilePetName(helper)} 是当前任务需要的宠物，不能作为转强材料。`, instanceId: petId};
  }
  if (Math.max(1, Math.trunc(Number(helper.level || 1))) < PET_REBIRTH_MM_HELPER_REQUIRED_LEVEL) {
    return {ok: false, code: "pet_rebirth_helper_level_low", message: `${profilePetName(helper)} 需要练到 Lv${PET_REBIRTH_MM_HELPER_REQUIRED_LEVEL}。`, instanceId: petId};
  }
  const helperRecord = normalizedPetRebirthHelperRecord(helper, expectedStage);
  const nowSec = Math.trunc(now() / 1000);
  const rollSeed = petRebirthMmRollSeed(pet, helper, nowSec);
  const bonusPackage = petRebirthMmBonusPackage(pet, helper, helperRecord, expectedStage, rollSeed);
  const cumulative = petCultivationGrowthBonus(record.rebirthGrowthBonus);
  const visibleBonus = petCultivationGrowthBonus(bonusPackage.visibleGrowthBonus);
  for (const key of PET_REBIRTH_MM_STAT_KEYS) {
    cumulative[key] = snapNumber(Number(cumulative[key] || 0) + Number(visibleBonus[key] || 0), 0.001);
  }
  const nextRecord = normalizedPetCultivationRecord(record);
  nextRecord.rebirthCount = Math.max(0, Math.trunc(Number(record.rebirthCount || 0))) + 1;
  nextRecord.rebirthGrowthBonus = cumulative;
  const event = {
    schemaVersion: 1,
    mode: PET_CULTIVATION_MODE_REBIRTH,
    timestamp: nowSec,
    petInstanceId: petId,
    petName: profilePetName(pet),
    helperInstanceId: helperId,
    helperName: profilePetName(helper),
    helperStage: expectedStage,
    helperLevel: Math.max(1, Math.trunc(Number(helper.level || 1))),
    helperStonePoints: clone(helperRecord.stonePoints),
    rebirthBonusInternalPower: bonusPackage.rebirthBonusInternalPower,
    rebirthBonusPercentile: bonusPackage.rebirthBonusPercentile,
    rebirthBonusGrade: bonusPackage.rebirthBonusGrade,
    rebirthRollSeed: rollSeed,
    helperGrowthWeights: clone(bonusPackage.helperGrowthWeights),
    visibleGrowthBonus: visibleBonus,
    beforeLevel: Math.max(1, Math.trunc(Number(pet.level || 1))),
    afterLevel: 1,
    beforeRebirthCount: Math.max(0, Math.trunc(Number(record.rebirthCount || 0))),
    afterRebirthCount: nextRecord.rebirthCount,
    summary: `${Math.max(0, Math.trunc(Number(record.rebirthCount || 0)))}转 -> ${nextRecord.rebirthCount}转，Lv${Math.max(1, Math.trunc(Number(pet.level || 1)))} -> Lv1`,
  };
  event.message = `${profilePetName(pet)}：${event.summary}，成长加成 ${petRebirthMmBonusText(visibleBonus)}。`;
  pushPetCultivationEvent(nextRecord, event);
  pet.petCultivation = nextRecord;
  pet.lastCultivationResult = clone(event);
  const levelOneStats = petLevelOneStats(pet);
  pet.level = 1;
  pet.exp = 0;
  pet.nextExp = battleExpToNextLevel(1);
  pet.maxHp = Math.max(1, Math.trunc(Number(levelOneStats.maxHp || pet.maxHp || DEFAULT_PET_BATTLE_STATS.maxHp)));
  pet.hp = pet.maxHp;
  pet.attack = Math.max(1, Math.trunc(Number(levelOneStats.attack || pet.attack || DEFAULT_PET_BATTLE_STATS.attack)));
  pet.defense = Math.max(1, Math.trunc(Number(levelOneStats.defense || pet.defense || DEFAULT_PET_BATTLE_STATS.defense)));
  pet.quick = Math.max(1, Math.trunc(Number(levelOneStats.quick || pet.quick || DEFAULT_PET_BATTLE_STATS.quick)));
  const instances = profilePetInstances(profile);
  const helperIndex = instances.findIndex((entry) => profilePetIdentityValues(entry).includes(helperId));
  if (helperIndex >= 0) {
    instances.splice(helperIndex, 1);
  }
  if (String(profile.activePetInstanceId || "") === helperId) {
    profile.activePetInstanceId = petId;
  }
  ensureActivePetAfterInstanceRemoval(profile);
  const guideCompletion = completePetRebirthMmGuideIfReady(profile, nowSec);
  let message = String(event.message || "宠物转生完成。");
  if (guideCompletion.completed) {
    message += "\n宠物转生教学完成，之后可找MM1反复领取1转小MM。";
  }
  return {
    ok: true,
    message,
    instanceId: petId,
    changedCount: 1,
    result: event,
  };
}

function normalizedPetCultivationRecord(value) {
  const source = objectOrEmpty(value);
  const history = Array.isArray(source.history) ? source.history.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry)).map(clone) : [];
  while (history.length > PET_CULTIVATION_MAX_HISTORY_RECORDS) {
    history.shift();
  }
  return {
    schemaVersion: 1,
    rebirthCount: Math.max(0, Math.trunc(Number(source.rebirthCount || 0))),
    enhanceLevel: clampInt(source.enhanceLevel, 0, PET_CULTIVATION_MAX_ENHANCE_LEVEL, 0),
    rebirthGrowthBonus: petCultivationGrowthBonus(source.rebirthGrowthBonus),
    history,
    lastPreview: clone(objectOrEmpty(source.lastPreview)),
    lastResult: clone(objectOrEmpty(source.lastResult)),
  };
}

function petCultivationGrowthBonus(value) {
  const source = objectOrEmpty(value);
  return {
    maxHp: snapNumber(source.maxHp, 0.001),
    attack: snapNumber(source.attack, 0.001),
    defense: snapNumber(source.defense, 0.001),
    quick: snapNumber(source.quick, 0.001),
  };
}

function petCultivationResultEvent(pet, beforeRecord, nextRecord, mode, nowSec) {
  const beforeRebirth = Math.max(0, Math.trunc(Number(beforeRecord.rebirthCount || 0)));
  const afterRebirth = Math.max(0, Math.trunc(Number(nextRecord.rebirthCount || 0)));
  const beforeEnhance = Math.max(0, Math.trunc(Number(beforeRecord.enhanceLevel || 0)));
  const afterEnhance = Math.max(0, Math.trunc(Number(nextRecord.enhanceLevel || 0)));
  const beforeLevel = Math.max(1, Math.trunc(Number(pet.level || 1)));
  const summary = mode === PET_CULTIVATION_MODE_REBIRTH
    ? `${beforeRebirth}转 -> ${afterRebirth}转，Lv${beforeLevel} -> Lv1`
    : `强化 +${beforeEnhance} -> +${afterEnhance}`;
  return {
    schemaVersion: 1,
    mode,
    timestamp: nowSec,
    petInstanceId: String(pet.instanceId || pet.petId || ""),
    petName: profilePetName(pet),
    formId: String(pet.formId || pet.templateId || ""),
    beforeLevel,
    afterLevel: mode === PET_CULTIVATION_MODE_REBIRTH ? 1 : beforeLevel,
    beforeRebirthCount: beforeRebirth,
    afterRebirthCount: afterRebirth,
    beforeEnhanceLevel: beforeEnhance,
    afterEnhanceLevel: afterEnhance,
    individualSeed: String(pet.individualSeed || ""),
    summary,
    message: `${profilePetName(pet)}：${summary}。`,
  };
}

function pushPetCultivationEvent(record, event) {
  const history = Array.isArray(record.history) ? record.history : [];
  history.push(clone(event));
  while (history.length > PET_CULTIVATION_MAX_HISTORY_RECORDS) {
    history.shift();
  }
  record.history = history;
  record.lastResult = clone(event);
}

function petRebirthMmHelperForTarget(profile, targetPet, expectedStage) {
  const targetId = String(targetPet && (targetPet.instanceId || targetPet.petId) || "");
  let best = null;
  let bestScore = -1;
  for (const pet of profilePetInstances(profile)) {
    if (!pet || typeof pet !== "object" || Array.isArray(pet)) {
      continue;
    }
    if (profilePetIdentityValues(pet).includes(targetId)) {
      continue;
    }
    if (profilePetState(pet) === BATTLE_PET_STATE_STORAGE) {
      continue;
    }
    if (petRebirthMmHelperStage(pet) !== expectedStage) {
      continue;
    }
    const record = normalizedPetRebirthHelperRecord(pet, expectedStage);
    const points = objectOrEmpty(record.stonePoints);
    const totalPoints = PET_REBIRTH_MM_STAT_KEYS.reduce((sum, key) => sum + Math.max(0, Math.trunc(Number(points[key] || 0))), 0);
    const score = Math.max(1, Math.trunc(Number(pet.level || 1))) * 1000 + totalPoints;
    if (score > bestScore) {
      bestScore = score;
      best = pet;
    }
  }
  return best;
}

function petRebirthMmHelperStage(pet) {
  const record = normalizedPetRebirthHelperRecord(pet, 0);
  const stage = Math.max(0, Math.trunc(Number(record.stage || 0)));
  if (stage > 0) {
    return stage;
  }
  const formId = String(pet && (pet.formId || pet.templateId || "") || "");
  if (formId === "pet_rebirth_mm_stage2") {
    return 2;
  }
  if (formId === "pet_rebirth_mm_stage1") {
    return 1;
  }
  return 0;
}

function petRebirthMmHelperName(stage) {
  return Math.max(1, Math.trunc(Number(stage || 1))) >= 2 ? "2转小MM" : "1转小MM";
}

function petRebirthMmBonusPackage(targetPet, helperPet, helperRecord, stage, rollSeed) {
  const targetGrowth = petObservedVisibleGrowth(targetPet);
  const targetInternal = {};
  for (const key of PET_REBIRTH_MM_STAT_KEYS) {
    const value = Number(targetGrowth[key] || 0);
    targetInternal[key] = key === "maxHp" ? value / PET_REBIRTH_MM_HP_INTERNAL_SCALE : value;
  }
  const stonePoints = normalizedPetRebirthHelperRecord({petRebirthHelper: helperRecord}, stage).stonePoints;
  const helperWeights = petHelperGrowthWeightDistribution(helperPet);
  const weights = {};
  let weightTotal = 0;
  for (const key of PET_REBIRTH_MM_STAT_KEYS) {
    let weight = Math.max(0.05, Number(targetInternal[key] || 0) * PET_REBIRTH_MM_TARGET_WEIGHT_SCALE);
    weight += Number(stonePoints[key] || 0) / PET_REBIRTH_MM_STONE_CAPACITY * PET_REBIRTH_MM_STONE_WEIGHT_SCALE;
    weight += Number(helperWeights[key] || 1) * PET_REBIRTH_MM_HELPER_GROWTH_WEIGHT_SCALE;
    weights[key] = weight;
    weightTotal += weight;
  }
  const poolInfo = petRebirthMmPoolInfo(helperRecord, stage, targetPet, helperPet, rollSeed);
  const pool = Number(poolInfo.pool || 0);
  const visibleBonus = {};
  const internalBonus = {};
  for (const key of PET_REBIRTH_MM_STAT_KEYS) {
    const internal = weightTotal > 0.0001 ? pool * Number(weights[key] || 0) / weightTotal : 0;
    internalBonus[key] = snapNumber(internal, 0.001);
    visibleBonus[key] = snapNumber(key === "maxHp" ? internal * PET_REBIRTH_MM_HP_INTERNAL_SCALE : internal, 0.001);
  }
  return {
    visibleGrowthBonus: petCultivationGrowthBonus(visibleBonus),
    internalGrowthBonus: internalBonus,
    rebirthBonusInternalPower: snapNumber(pool, 0.001),
    rebirthBonusPercentile: snapNumber(poolInfo.percentile, 0.1),
    rebirthBonusGrade: petRebirthMmGradeForPercentile(poolInfo.percentile),
    rebirthRollSeed: rollSeed,
    helperGrowthWeights: helperWeights,
  };
}

function petObservedVisibleGrowth(pet) {
  const result = petCultivationGrowthBonus({});
  const level = Math.max(1, Math.trunc(Number(pet && pet.level || 1)));
  if (level <= 1) {
    const record = objectOrEmpty(pet && pet.growthRecord);
    const bonus = objectOrEmpty(record.bonus);
    for (const key of PET_REBIRTH_MM_STAT_KEYS) {
      result[key] = snapNumber(bonus[key], 0.001);
    }
    return result;
  }
  const initial = objectOrEmpty(pet && (pet.initialStats || pet.growthSpeciesLevel1Stats));
  for (const key of PET_REBIRTH_MM_STAT_KEYS) {
    const currentValue = Number(pet && pet[key] || 0);
    const initialValue = Object.prototype.hasOwnProperty.call(initial, key) ? Number(initial[key]) : currentValue;
    result[key] = snapNumber((currentValue - initialValue) / (level - 1), 0.001);
  }
  return result;
}

function petHelperGrowthWeightDistribution(helperPet) {
  const equal = {};
  for (const key of PET_REBIRTH_MM_STAT_KEYS) {
    equal[key] = 1.0;
  }
  if (!helperPet || String(helperPet.growthSpeciesProfileId || "").trim() === "") {
    return equal;
  }
  const growth = petObservedVisibleGrowth(helperPet);
  const internal = {};
  let total = 0;
  for (const key of PET_REBIRTH_MM_STAT_KEYS) {
    let value = Number(growth[key] || 0);
    if (key === "maxHp") {
      value /= PET_REBIRTH_MM_HP_INTERNAL_SCALE;
    }
    value = Math.max(0.001, value);
    internal[key] = value;
    total += value;
  }
  if (total <= 0.0001) {
    return equal;
  }
  const result = {};
  for (const key of PET_REBIRTH_MM_STAT_KEYS) {
    result[key] = snapNumber(Number(internal[key] || 0.001) / total * PET_REBIRTH_MM_STAT_KEYS.length, 0.001);
  }
  return result;
}

function petRebirthMmPoolInfo(helperRecord, stage, targetPet, helperPet, rollSeed) {
  const effectiveCount = petRebirthMmEffectiveStoneCount(helperRecord);
  const range = petRebirthMmPoolRangeForEffectiveStoneCount(effectiveCount, stage);
  const percentile = petRebirthMmPercentile(targetPet, helperPet, stage, rollSeed);
  const minPool = Number(range.min || 0);
  const maxPool = Number(range.max || 0);
  return {
    pool: snapNumber(minPool + (maxPool - minPool) * percentile / 100.0, 0.001),
    percentile: snapNumber(percentile, 0.1),
  };
}

function petRebirthMmEffectiveStoneCount(helperRecord) {
  const points = normalizedPetRebirthHelperRecord({petRebirthHelper: helperRecord}).stonePoints;
  let total = 0;
  for (const key of PET_REBIRTH_MM_STAT_KEYS) {
    const ratio = Math.max(0, Math.min(1, Number(points[key] || 0) / PET_REBIRTH_MM_STONE_CAPACITY));
    total += Math.pow(ratio, PET_REBIRTH_MM_STONE_EFFECTIVE_EXPONENT);
  }
  return snapNumber(total, 0.001);
}

function petRebirthMmPoolRangeForEffectiveStoneCount(effectiveCount, stage) {
  const safeStage = clampInt(stage, 1, PET_REBIRTH_MM_MAX_STAGE, 1);
  const table = PET_REBIRTH_MM_POOL_RANGES_BY_STAGE[safeStage] || PET_REBIRTH_MM_POOL_RANGES_BY_STAGE[1];
  const safeCount = Math.max(0, Math.min(4, Number(effectiveCount || 0)));
  const lower = clampInt(Math.floor(safeCount), 0, 4, 0);
  const upper = clampInt(lower + 1, 0, 4, lower);
  const t = lower >= 4 ? 0 : Math.max(0, Math.min(1, safeCount - lower));
  const lowerRange = table[lower] || table[0] || {min: 0, max: 0};
  const upperRange = table[upper] || lowerRange;
  const upperMin = Object.prototype.hasOwnProperty.call(upperRange, "min") ? Number(upperRange.min) : Number(lowerRange.min || 0);
  const upperMax = Object.prototype.hasOwnProperty.call(upperRange, "max") ? Number(upperRange.max) : Number(lowerRange.max || 0);
  return {
    min: snapNumber(Number(lowerRange.min || 0) + (upperMin - Number(lowerRange.min || 0)) * t, 0.001),
    max: snapNumber(Number(lowerRange.max || 0) + (upperMax - Number(lowerRange.max || 0)) * t, 0.001),
  };
}

function petRebirthMmPercentile(targetPet, helperPet, stage, rollSeed) {
  const seed = String(rollSeed || "").trim();
  if (!seed) {
    return 50.0;
  }
  const key = [
    String(targetPet && (targetPet.growthSpeciesSeed || targetPet.instanceId || targetPet.petId) || ""),
    String(helperPet && (helperPet.growthSpeciesSeed || helperPet.instanceId || helperPet.petId) || ""),
    String(targetPet && (targetPet.formId || targetPet.templateId) || ""),
    String(helperPet && (helperPet.formId || helperPet.templateId) || ""),
    Math.max(1, Math.trunc(Number(stage || 1))),
    seed,
  ].join("|");
  return (stablePositiveHash(`pet_rebirth_bonus:${key}`) % 10001) / 100.0;
}

function petRebirthMmGradeForPercentile(percentile) {
  const value = Math.max(0, Math.min(100, Number(percentile || 0)));
  if (value >= 95) return "S";
  if (value >= 85) return "A";
  if (value >= 55) return "B";
  if (value >= 25) return "C";
  return "D";
}

function petRebirthMmRollSeed(targetPet, helperPet, nowSec) {
  return [
    "server",
    String(targetPet && (targetPet.instanceId || targetPet.petId) || ""),
    String(helperPet && (helperPet.instanceId || helperPet.petId) || ""),
    Math.max(0, Math.trunc(Number(nowSec || 0))),
  ].join(":");
}

function petRebirthMmBonusText(bonus) {
  const normalized = petCultivationGrowthBonus(bonus);
  return `血 ${Number(normalized.maxHp || 0).toFixed(3)}/级，攻 ${Number(normalized.attack || 0).toFixed(3)}/级，防 ${Number(normalized.defense || 0).toFixed(3)}/级，敏 ${Number(normalized.quick || 0).toFixed(3)}/级`;
}

function completePetRebirthMmGuideIfReady(profile, nowSec) {
  const guide = normalizePetRebirthMmGuide(profile[PET_REBIRTH_MM_GUIDE_KEY]);
  const alreadyCompleted = guide.status === PET_REBIRTH_MM_GUIDE_STATUS_COMPLETED;
  const hasRebirth = profilePetInstances(profile).some((pet) => {
    const record = normalizedPetCultivationRecord(pet && pet.petCultivation);
    return Math.max(0, Math.trunc(Number(record.rebirthCount || 0))) >= 1;
  });
  if (!hasRebirth) {
    return {completed: false, alreadyCompleted};
  }
  guide.status = PET_REBIRTH_MM_GUIDE_STATUS_COMPLETED;
  if (guide.startedAtSec <= 0) {
    guide.startedAtSec = Math.max(0, Math.trunc(Number(nowSec || 0)));
  }
  guide.completedAtSec = Math.max(0, Math.trunc(Number(nowSec || 0)));
  profile[PET_REBIRTH_MM_GUIDE_KEY] = guide;
  return {completed: !alreadyCompleted, alreadyCompleted};
}

function petRequiredByActiveQuest(profile, pet) {
  const questId = currentProfileQuestId(profile);
  const quest = questById(questId);
  if (!quest) {
    return false;
  }
  const state = normalizeQuestState(profileQuestStates(profile)[questId], questId);
  if (String(state.status || "active") !== "active") {
    return false;
  }
  const baseEvent = {
    instanceId: String(pet && (pet.instanceId || pet.petId) || ""),
    formId: String(pet && (pet.formId || pet.templateId) || ""),
    lineId: String(pet && pet.lineId || ""),
    level: Math.max(1, Math.trunc(Number(pet && pet.level || 1))),
    amount: 1,
  };
  return questProgressAmountForEvent(quest, {...baseEvent, type: "deliver_pet"}) > 0 ||
    questProgressAmountForEvent(quest, {...baseEvent, type: "capture_pet"}) > 0;
}

function petLevelOneStats(pet) {
  const initial = objectOrEmpty(pet && (pet.initialStats || pet.growthSpeciesLevel1Stats));
  const template = petTemplateForFormId(String(pet && (pet.formId || pet.templateId) || ""));
  const base = objectOrEmpty(template.baseStats);
  return {
    maxHp: Math.max(1, Math.trunc(Number(initial.maxHp || base.maxHp || pet && pet.maxHp || DEFAULT_PET_BATTLE_STATS.maxHp))),
    attack: Math.max(1, Math.trunc(Number(initial.attack || base.attack || pet && pet.attack || DEFAULT_PET_BATTLE_STATS.attack))),
    defense: Math.max(1, Math.trunc(Number(initial.defense || base.defense || pet && pet.defense || DEFAULT_PET_BATTLE_STATS.defense))),
    quick: Math.max(1, Math.trunc(Number(initial.quick || initial.agility || base.quick || base.agility || pet && pet.quick || DEFAULT_PET_BATTLE_STATS.quick))),
  };
}

function snapNumber(value, step) {
  const safeStep = Number(step || 1);
  if (!Number.isFinite(safeStep) || safeStep <= 0) {
    return Number(value || 0);
  }
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number / safeStep) * safeStep : 0;
}

function stablePositiveHash(text) {
  let hash = 2166136261;
  const source = String(text || "");
  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 16777619) >>> 0;
  }
  return hash;
}

function applyPetRebirthMmStage2ClaimAction(profile) {
  if (Boolean(profile[PET_REBIRTH_MM_STAGE2_CLAIMED_KEY])) {
    return {ok: false, code: "mm_stage2_claimed", message: "2转小MM任务奖励每个角色只能领取一次。"};
  }
  const grant = grantPetRebirthMm(profile, 2, "stage2_once");
  if (!grant.ok) {
    return grant;
  }
  profile[PET_REBIRTH_MM_STAGE2_CLAIMED_KEY] = true;
  return {ok: true, message: `完成2转小MM任务，${grant.message}`, instanceId: grant.instanceId};
}

function grantPetRebirthMm(profile, stage, source) {
  const safeStage = Math.max(1, Math.trunc(Number(stage || 1)));
  const formId = safeStage >= 2 ? "pet_rebirth_mm_stage2" : "pet_rebirth_mm_stage1";
  const name = safeStage >= 2 ? "2转小MM" : "1转小MM";
  const instances = profilePetInstances(profile);
  const state = profilePartyVisiblePetCount(profile) < BATTLE_PET_MAX_PER_PARTICIPANT
    ? BATTLE_PET_STATE_STANDBY
    : BATTLE_PET_STATE_STORAGE;
  if (state === BATTLE_PET_STATE_STORAGE && profileStoragePetCount(profile) >= BATTLE_PET_STORAGE_LIMIT) {
    return {ok: false, code: "pet_capacity_full", message: "队伍和兽栏都满了。"};
  }
  const serial = nextProfilePetInstanceSerial(profile, instances);
  const instanceId = `pet_rebirth_mm${safeStage}_${serial}`;
  const pet = createDefaultServerPet(instanceId, name, formId, state, 1);
  if (!pet || Object.keys(pet).length <= 0) {
    return {ok: false, code: "pet_template_missing", message: `${name} 模板不存在。`};
  }
  pet.petRebirthHelper = normalizedPetRebirthHelperRecord({petRebirthHelper: {stage: safeStage}});
  pet.capturedSerial = serial;
  pet.individualSeed = `pet_rebirth_mm:${source}:${safeStage}:${serial}`;
  pet.isNew = true;
  instances.push(pet);
  profile.nextPetInstanceSerial = serial + 1;
  recordProfilePetCodexForm(profile, formId, true);
  return {ok: true, message: `获得 Lv1 ${name}，已加入${state === BATTLE_PET_STATE_STORAGE ? "兽栏" : "队伍"}。`, instanceId};
}

function applyPetRebirthMmGuideStartAction(profile, now) {
  const guide = normalizePetRebirthMmGuide(profile[PET_REBIRTH_MM_GUIDE_KEY]);
  if (guide.status !== PET_REBIRTH_MM_GUIDE_STATUS_ACTIVE) {
    guide.status = PET_REBIRTH_MM_GUIDE_STATUS_ACTIVE;
    guide.startedAtSec = guide.startedAtSec > 0 ? guide.startedAtSec : Math.max(0, Math.trunc(now() / 1000));
  }
  profile[PET_REBIRTH_MM_GUIDE_KEY] = guide;
  return {ok: true, message: "开始任务「宠物转生教学」。目标：找 1转MM试炼师阿澄开始教学。"};
}

function normalizePetRebirthMmGuide(value) {
  const source = objectOrEmpty(value);
  let status = String(source.status || PET_REBIRTH_MM_GUIDE_STATUS_AVAILABLE);
  if (![PET_REBIRTH_MM_GUIDE_STATUS_AVAILABLE, PET_REBIRTH_MM_GUIDE_STATUS_ACTIVE, PET_REBIRTH_MM_GUIDE_STATUS_COMPLETED].includes(status)) {
    status = PET_REBIRTH_MM_GUIDE_STATUS_AVAILABLE;
  }
  return {
    schemaVersion: 1,
    status,
    startedAtSec: Math.max(0, Math.trunc(Number(source.startedAtSec || 0))),
    completedAtSec: Math.max(0, Math.trunc(Number(source.completedAtSec || 0))),
  };
}

function recordProfilePetCodexForm(profile, formId, captured) {
  const normalizedFormId = String(formId || "").trim();
  if (normalizedFormId === "") {
    return;
  }
  profile.petCodexSeenFormIds = uniqueStringArray([...(Array.isArray(profile.petCodexSeenFormIds) ? profile.petCodexSeenFormIds : []), normalizedFormId]);
  if (captured) {
    profile.petCodexCapturedFormIds = uniqueStringArray([...(Array.isArray(profile.petCodexCapturedFormIds) ? profile.petCodexCapturedFormIds : []), normalizedFormId]);
  }
}

function publicCapturedPetSummary(pet) {
  if (!pet || typeof pet !== "object" || Array.isArray(pet)) {
    return {};
  }
  return {
    instanceId: String(pet.instanceId || pet.petId || ""),
    petId: String(pet.petId || pet.instanceId || ""),
    formId: String(pet.formId || pet.templateId || ""),
    lineId: String(pet.lineId || ""),
    name: String(pet.name || "宠物"),
    state: String(pet.state || BATTLE_PET_STATE_STANDBY),
    level: Math.max(1, Math.trunc(Number(pet.level || 1))),
    hp: Math.max(0, Math.trunc(Number(pet.hp || 0))),
    maxHp: Math.max(1, Math.trunc(Number(pet.maxHp || 1))),
    attack: Math.max(0, Math.trunc(Number(pet.attack || 0))),
    defense: Math.max(0, Math.trunc(Number(pet.defense || 0))),
    quick: Math.max(0, Math.trunc(Number(pet.quick || 0))),
    capturedSerial: Math.max(0, Math.trunc(Number(pet.capturedSerial || 0))),
    schemaVersion: 1,
  };
}

function battleActorWritebackMaxHp(actor) {
  const maxHp = Number(actor && actor.maxHp);
  return Number.isFinite(maxHp) && maxHp > 0 ? maxHp : 1;
}

function battleActorWritebackHp(actor) {
  const maxHp = battleActorWritebackMaxHp(actor);
  const hp = Number(actor && actor.hp);
  if (!Number.isFinite(hp)) {
    return maxHp;
  }
  return Math.max(0, Math.min(maxHp, hp));
}

function applyBattleRoomResultReturns(data, room, result, now) {
  const returnAccountIds = battleReturnAccountIdsForResult(room, result);
  const entries = [];
  for (const accountId of returnAccountIds) {
    const account = accountById(data, accountId);
    if (!account) {
      continue;
    }
    const recordPoint = recordPointForAccount(data, accountId);
    const spawnCell = spawnCellForRecordPoint(recordPoint);
    const previousPosition = data.playerPositions[accountId] || null;
    const position = normalizePlayerPositionPayload({
      mapId: recordPoint.mapId,
      cellX: spawnCell[0],
      cellY: spawnCell[1],
      facing: "south",
      moving: false,
    }, account, now);
    position.authority = "battle_result_return";
    position.movementSeq = Number(previousPosition && previousPosition.movementSeq || 0) + 1;
    position.returnReason = String(result.reason || room.closeReason || "");
    data.playerPositions[accountId] = position;
    entries.push({
      kind: "record_point_return",
      accountId,
      reason: position.returnReason,
      recordPoint,
      position,
      updatedAt: position.updatedAt,
      schemaVersion: 1,
    });
  }
  return entries;
}

function battleReturnAccountIdsForResult(room, result) {
  const reason = String(result && result.reason || room && room.closeReason || "");
  if (reason !== "defeat" && reason !== "timeout") {
    return [];
  }
  const loserIds = Array.isArray(result && result.loserAccountIds) ? result.loserAccountIds : [];
  return loserIds
    .map((value) => String(value || "").trim())
    .filter((value, index, array) => value !== "" && array.indexOf(value) === index);
}

function recordPointForAccount(data, accountId) {
  const binding = data.profileBindings[String(accountId || "")] || null;
  const profileDoc = binding && binding.playerId ? data.profiles[binding.playerId] || null : null;
  const profile = profileDoc && profileDoc.profile && typeof profileDoc.profile === "object" && !Array.isArray(profileDoc.profile)
    ? profileDoc.profile
    : {};
  return normalizeRecordPoint(profile.recordPoint);
}

function normalizeRecordPoint(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const mapId = String(source.mapId || DEFAULT_RECORD_POINT.mapId).trim() || DEFAULT_RECORD_POINT.mapId;
  const spawnName = String(source.spawnName || DEFAULT_RECORD_POINT.spawnName).trim() || DEFAULT_RECORD_POINT.spawnName;
  const label = String(source.label || DEFAULT_RECORD_POINT.label).trim() || DEFAULT_RECORD_POINT.label;
  return {
    mapId,
    spawnName,
    label,
    schemaVersion: 1,
  };
}

function spawnCellForRecordPoint(recordPoint) {
  return spawnCellForMapSpawn(recordPoint.mapId, recordPoint.spawnName);
}

function spawnCellForMapSpawn(mapId, spawnName) {
  const mapDoc = mapDocumentById(mapId);
  const spawnPoints = mapDoc && mapDoc.spawnPoints && typeof mapDoc.spawnPoints === "object" && !Array.isArray(mapDoc.spawnPoints)
    ? mapDoc.spawnPoints
    : {};
  const explicit = spawnPoints[String(spawnName || "")];
  if (Array.isArray(explicit) && explicit.length >= 2) {
    return [clampInt(explicit[0], -9999, 9999, DEFAULT_RECORD_POINT_CELL[0]), clampInt(explicit[1], -9999, 9999, DEFAULT_RECORD_POINT_CELL[1])];
  }
  const fallback = Array.isArray(mapDoc && mapDoc.spawnCell) ? mapDoc.spawnCell : DEFAULT_RECORD_POINT_CELL;
  return [clampInt(fallback[0], -9999, 9999, DEFAULT_RECORD_POINT_CELL[0]), clampInt(fallback[1], -9999, 9999, DEFAULT_RECORD_POINT_CELL[1])];
}

let mapDocumentCache = null;

function mapDocumentById(mapId) {
  const normalizedMapId = String(mapId || "").trim();
  if (!normalizedMapId) {
    return null;
  }
  if (!mapDocumentCache) {
    mapDocumentCache = loadMapDocumentCache();
  }
  return mapDocumentCache[normalizedMapId] || null;
}

function loadMapDocumentCache() {
  const cache = {};
  const dataDir = path.resolve(__dirname, "../../..", "client/godot/data");
  try {
    for (const fileName of fs.readdirSync(dataDir)) {
      if (!fileName.endsWith("_map.json")) {
        continue;
      }
      const filePath = path.join(dataDir, fileName);
      const doc = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const mapId = String(doc && doc.id || "").trim();
      if (mapId) {
        cache[mapId] = doc;
      }
    }
  } catch {
    // Map data is a convenience for battle return cells; default record point remains usable without it.
  }
  return cache;
}

function battleInviteIsExpired(invite, now) {
  if (!invite || invite.status !== BATTLE_INVITE_PENDING) {
    return false;
  }
  const createdMs = Number.isFinite(Date.parse(invite.createdAt || "")) ? Date.parse(invite.createdAt || "") : now();
  const expiresAt = invite.expiresAt || new Date(createdMs + BATTLE_INVITE_TTL_MS).toISOString();
  return Date.parse(expiresAt) <= now();
}

function expireBattleInvite(data, invite, now) {
  invite.status = BATTLE_INVITE_EXPIRED;
  invite.updatedAt = isoNow(now);
  data.battleInvites[invite.inviteId] = invite;
  return {
    type: "battle.invite_expired",
    targetAccountIds: [invite.fromAccountId, invite.toAccountId],
    invite: publicBattleInvite(invite, data),
    room: null,
  };
}

function expireBattleTimeouts(data, now) {
  const events = [];
  for (const invite of Object.values(data.battleInvites)) {
    if (battleInviteIsExpired(invite, now)) {
      events.push(expireBattleInvite(data, invite, now));
    }
  }
  for (const room of Object.values(data.battleRooms)) {
    if (!room || room.status === BATTLE_ROOM_CLOSED) {
      continue;
    }
    const battle = battleRoomBattleStateForMutation(room, now);
    const disconnectedAccountIds = battleRoomReconnectExpiredAccountIds(room, now);
    let result = null;
    if (disconnectedAccountIds.length > 0) {
      result = battleRoomResultForDisconnectTimeout(room, disconnectedAccountIds, now);
    } else if (battleRoomHasDisconnectedParticipant(room)) {
      continue;
    } else if (
      String(battle.phase || "") === BATTLE_PHASE_COMMAND &&
      battle.commandDeadlineAt &&
      Date.parse(battle.commandDeadlineAt) <= now()
    ) {
      result = battleRoomResultForTimeout(room, battle, now);
    }
    if (!result) {
      continue;
    }
    closeBattleRoomWithResult(data, room, result, now);
    data.battleRooms[room.roomId] = room;
    events.push({
      type: "battle.room_closed",
      targetAccountIds: room.participantAccountIds.slice(),
      roomId: room.roomId,
      reason: result.reason,
      result: publicBattleResult(result),
      room: publicBattleRoom(room),
    });
  }
  return events;
}

function battleDefendEvent(room, battle, command, actor, round, sequence) {
  const actionId = String(command.actionId || BATTLE_ACTION_DEFEND);
  return {
    eventId: `${room.roomId}:r${round}:e${sequence}`,
    eventType: "defend",
    round,
    sequence,
    actorAccountId: actor.accountId,
    actorUsername: actor.username,
    actorId: actor.actorId,
    actorKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
    actionId,
    skillId: String(command.skillId || ""),
    damage: 0,
    animation: {
      actor: "defend",
      targetReaction: "none",
      observer: "watch_target",
    },
    message: `${actor.displayName || actor.username} 摆出防御姿态。`,
    schemaVersion: 1,
  };
}

function battleTargetMissingEvent(room, battle, command, actor, round, sequence) {
  return {
    eventId: `${room.roomId}:r${round}:e${sequence}`,
    eventType: "target_missing",
    round,
    sequence,
    actorAccountId: actor.accountId,
    actorUsername: actor.username,
    actorId: actor.actorId,
    actorKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
    actionId: String(command.actionId || BATTLE_ACTION_ATTACK),
    skillId: String(command.skillId || ""),
    targetActorId: String(command.targetActorId || ""),
    targetAccountId: String(command.targetAccountId || ""),
    damage: 0,
    animation: {
      actor: "watch_target",
      targetReaction: "none",
      observer: "idle",
    },
    message: `${actor.displayName || actor.username} 没有找到目标。`,
    schemaVersion: 1,
  };
}

function battleActorStatuses(actor) {
  if (!actor || typeof actor !== "object" || Array.isArray(actor)) {
    return {};
  }
  if (!actor.statuses || typeof actor.statuses !== "object" || Array.isArray(actor.statuses)) {
    actor.statuses = {};
  }
  return actor.statuses;
}

function battleActorHasStatus(actor, statusId) {
  const normalizedStatusId = String(statusId || "").trim();
  if (normalizedStatusId === "") {
    return false;
  }
  const status = battleActorStatuses(actor)[normalizedStatusId];
  return status && typeof status === "object" && !Array.isArray(status) && Number(status.turns || 0) > 0;
}

function battleStatusLabel(statusId) {
  const normalizedStatusId = String(statusId || "");
  if (normalizedStatusId === BATTLE_STATUS_POISON) {
    return "中毒";
  }
  if (normalizedStatusId === BATTLE_STATUS_SLEEP) {
    return "睡眠";
  }
  if (normalizedStatusId === BATTLE_STATUS_CONFUSION) {
    return "混乱";
  }
  if (normalizedStatusId === BATTLE_STATUS_STONE) {
    return "石化";
  }
  return normalizedStatusId || "异常";
}

function battleStatusesRemovedByApply(actor, statusId) {
  const normalizedStatusId = String(statusId || "");
  if (!BATTLE_CONTROL_STATUSES.includes(normalizedStatusId)) {
    return [];
  }
  return BATTLE_CONTROL_STATUSES.filter((otherStatusId) => otherStatusId !== normalizedStatusId && battleActorHasStatus(actor, otherStatusId));
}

function battleApplyStatus(actor, statusId, turns, potency, sourceActorId) {
  const normalizedStatusId = String(statusId || "").trim();
  if (!actor || normalizedStatusId === "") {
    return [];
  }
  const statuses = battleActorStatuses(actor);
  const removed = battleStatusesRemovedByApply(actor, normalizedStatusId);
  for (const removedStatusId of removed) {
    delete statuses[removedStatusId];
  }
  statuses[normalizedStatusId] = {
    id: normalizedStatusId,
    label: battleStatusLabel(normalizedStatusId),
    turns: Math.max(1, Math.trunc(Number(turns || 1))),
    potency: Math.max(0, Math.trunc(Number(potency || 0))),
    sourceId: String(sourceActorId || ""),
  };
  actor.statuses = statuses;
  actor.poisoned = battleActorHasStatus(actor, BATTLE_STATUS_POISON);
  return removed;
}

function battleRemoveStatuses(actor, statusIds) {
  if (!actor) {
    return [];
  }
  const statuses = battleActorStatuses(actor);
  const removed = [];
  for (const statusId of Array.isArray(statusIds) ? statusIds : []) {
    const normalizedStatusId = String(statusId || "").trim();
    if (normalizedStatusId !== "" && battleActorHasStatus(actor, normalizedStatusId)) {
      delete statuses[normalizedStatusId];
      removed.push(normalizedStatusId);
    }
  }
  actor.statuses = statuses;
  actor.poisoned = battleActorHasStatus(actor, BATTLE_STATUS_POISON);
  return removed;
}

function battleDecrementActorStatus(actor, statusId) {
  const normalizedStatusId = String(statusId || "").trim();
  if (!battleActorHasStatus(actor, normalizedStatusId)) {
    return {fromTurns: 0, toTurns: 0};
  }
  const statuses = battleActorStatuses(actor);
  const status = statuses[normalizedStatusId];
  const fromTurns = Math.max(0, Math.trunc(Number(status.turns || 0)));
  const toTurns = Math.max(0, fromTurns - 1);
  if (toTurns <= 0) {
    delete statuses[normalizedStatusId];
  } else {
    statuses[normalizedStatusId] = {
      ...status,
      turns: toTurns,
    };
  }
  actor.statuses = statuses;
  actor.poisoned = battleActorHasStatus(actor, BATTLE_STATUS_POISON);
  return {fromTurns, toTurns};
}

function battleBlockingStatusId(actor) {
  if (battleActorHasStatus(actor, BATTLE_STATUS_STONE)) {
    return BATTLE_STATUS_STONE;
  }
  if (battleActorHasStatus(actor, BATTLE_STATUS_SLEEP)) {
    return BATTLE_STATUS_SLEEP;
  }
  return "";
}

function battleStatusResistance(actor, statusId) {
  const resist = actor && actor.statusResist && typeof actor.statusResist === "object" && !Array.isArray(actor.statusResist)
    ? actor.statusResist
    : {};
  const value = Object.prototype.hasOwnProperty.call(resist, statusId) ? resist[statusId] : resist.all;
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function battleStatusImmune(actor, statusId) {
  const immune = actor && actor.statusImmune && typeof actor.statusImmune === "object" && !Array.isArray(actor.statusImmune)
    ? actor.statusImmune
    : {};
  return Boolean(immune.all || immune[statusId]);
}

function battleStatusRoll(room, battle, actor, target, actionId, statusId, round, sequence) {
  const seed = [
    room && (room.seed || room.roomId) || "",
    battle && battle.turnSeq || 0,
    round,
    sequence,
    actor && actor.actorId || "",
    target && target.actorId || "",
    actionId,
    statusId,
    "status",
  ].join(":");
  return Number.parseInt(crypto.createHash("sha256").update(seed).digest("hex").slice(0, 8), 16) / 0xffffffff;
}

function battleStatusHitCheck(room, battle, actor, target, actionId, statusId, round, sequence, baseRate = 1) {
  const normalizedStatusId = String(statusId || "").trim();
  const resistance = battleStatusResistance(target, normalizedStatusId);
  if (battleStatusImmune(target, normalizedStatusId)) {
    return {hit: false, result: "immune", chance: 0, roll: -1, resistance, immune: true};
  }
  const chance = Math.max(0, Math.min(1, Number(baseRate || 0) - resistance));
  const roll = battleStatusRoll(room, battle, actor, target, actionId, normalizedStatusId, round, sequence);
  const hit = roll < chance;
  return {
    hit,
    result: hit ? "applied" : "resisted",
    chance,
    roll,
    resistance,
    immune: false,
  };
}

function battleStatusSkipEvent(room, battle, command, actor, round, sequence) {
  const statusId = battleBlockingStatusId(actor);
  if (statusId === "") {
    return null;
  }
  const turns = battleDecrementActorStatus(actor, statusId);
  return {
    eventId: `${room.roomId}:r${round}:e${sequence}`,
    eventType: "status_skip",
    round,
    sequence,
    actorAccountId: actor.accountId,
    actorUsername: actor.username,
    actorId: actor.actorId,
    actorKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
    targetAccountId: actor.accountId,
    targetUsername: actor.username,
    targetActorId: actor.actorId,
    targetKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
    actionId: String(command.actionId || ""),
    skillId: String(command.skillId || ""),
    statusId,
    statusResult: "skip",
    statusChanges: [{
      actorId: String(actor.actorId || ""),
      statusId,
      change: "decrement",
      fromTurns: turns.fromTurns,
      toTurns: turns.toTurns,
      schemaVersion: 1,
    }],
    damage: 0,
    animation: {
      actor: "status",
      targetReaction: "none",
      observer: "watch_target",
    },
    message: `${actor.displayName || actor.username} 处于${battleStatusLabel(statusId)}状态，无法行动。`,
    schemaVersion: 1,
  };
}

function battleItemEvent(room, battle, command, actor, round, sequence) {
  const itemId = normalizeBattleItemId(command.itemId || command.actionId);
  const effectType = battleActionEffectType(itemId);
  if (effectType === "heal") {
    return battleItemHealEvent(room, battle, command, actor, round, sequence);
  }
  if (effectType === "poison") {
    return battleItemPoisonEvent(room, battle, command, actor, round, sequence);
  }
  if (effectType === "cleanse") {
    return battleItemCleanseEvent(room, battle, command, actor, round, sequence);
  }
  return battleTargetMissingEvent(room, battle, command, actor, round, sequence);
}

function battleItemHealEvent(room, battle, command, actor, round, sequence) {
  const itemId = normalizeBattleItemId(command.itemId || command.actionId);
  const participant = battleParticipantByAccountId(room, actor.accountId);
  const targets = battleActionIsAll(itemId)
    ? battleLivingTargetsBySlotOrder(battle, String(actor.side || ""), false)
    : [battleActorByActorId(battle, command.targetActorId) || battlePlayerActorByAccountId(battle, command.targetAccountId)].filter(Boolean);
  const validTargets = targets.filter((target) => (
    target &&
    Number(target.hp || 0) > 0 &&
    String(target.side || "") === String(actor.side || "")
  ));
  if (itemId === "" || !participant || participantBattleItemCount(participant, itemId) <= 0 || validTargets.length <= 0) {
    return battleTargetMissingEvent(room, battle, command, actor, round, sequence);
  }
  const heal = battleItemHealAmount(itemId);
  if (heal <= 0) {
    return battleTargetMissingEvent(room, battle, command, actor, round, sequence);
  }
  setParticipantBattleItemCount(participant, itemId, participantBattleItemCount(participant, itemId) - 1);
  const targetSummaries = [];
  const effectPerTarget = {};
  let totalHealed = 0;
  for (const target of validTargets) {
    const hpBefore = Number(target.hp || 0);
    const maxHp = battleActorWritebackMaxHp(target);
    const hpAfter = Math.min(maxHp, hpBefore + heal);
    target.hp = hpAfter;
    target.defeated = hpAfter <= 0;
    syncParticipantPetSnapshotHp(room, target);
    const healed = Math.max(0, hpAfter - hpBefore);
    totalHealed += healed;
    effectPerTarget[String(target.actorId || "")] = healed;
    targetSummaries.push({
      targetActorId: String(target.actorId || ""),
      targetAccountId: String(target.accountId || ""),
      targetUsername: String(target.username || ""),
      targetKind: String(target.kind || BATTLE_ACTOR_KIND_PLAYER),
      hpBefore,
      hpAfter,
      healed,
      schemaVersion: 1,
    });
  }
  const target = validTargets[0];
  const itemName = battleItemLabel(itemId);
  const targetName = target.displayName || target.username || "目标";
  const isAll = battleActionIsAll(itemId);
  return {
    eventId: `${room.roomId}:r${round}:e${sequence}`,
    eventType: isAll ? "item_heal_all" : "item_heal",
    round,
    sequence,
    actorAccountId: actor.accountId,
    actorUsername: actor.username,
    actorId: actor.actorId,
    actorKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
    targetAccountId: target.accountId,
    targetUsername: target.username,
    targetActorId: target.actorId,
    targetKind: String(target.kind || BATTLE_ACTOR_KIND_PLAYER),
    targetActorIds: targetSummaries.map((entry) => entry.targetActorId),
    targets: targetSummaries,
    actionId: itemId,
    itemId,
    itemName,
    heal,
    healed: totalHealed,
    hpBefore: Number(targetSummaries[0].hpBefore || 0),
    hpAfter: Number(targetSummaries[0].hpAfter || 0),
    effectPerTarget,
    remainingItemCount: participantBattleItemCount(participant, itemId),
    damage: 0,
    animation: {
      actor: "item",
      targetReaction: "heal",
      observer: "watch_target",
    },
    message: isAll
      ? `${actor.displayName || actor.username} 使用${itemName}，我方全体回复生命。`
      : totalHealed > 0
        ? `${actor.displayName || actor.username} 使用${itemName}，${targetName} 回复 ${totalHealed} 点生命。`
        : `${actor.displayName || actor.username} 使用${itemName}，${targetName} 生命已经充足。`,
    schemaVersion: 1,
  };
}

function battleItemPoisonEvent(room, battle, command, actor, round, sequence) {
  const itemId = normalizeBattleItemId(command.itemId || command.actionId);
  const participant = battleParticipantByAccountId(room, actor.accountId);
  const damage = battleActionEffectAmount(itemId, 1);
  const isAll = battleActionIsAll(itemId);
  const explicitTarget = battleActorByActorId(battle, command.targetActorId) || battlePlayerActorByAccountId(battle, command.targetAccountId);
  const targets = isAll
    ? battleLivingOpponentTargetsBySlotOrder(battle, actor, false)
    : [explicitTarget].filter(Boolean);
  const validTargets = targets.filter((target) => (
    target &&
    String(target.side || "") !== String(actor.side || "") &&
    Number(target.hp || 0) > 0
  ));
  if (itemId === "" || !participant || participantBattleItemCount(participant, itemId) <= 0 || damage <= 0 || validTargets.length <= 0) {
    return battleTargetMissingEvent(room, battle, command, actor, round, sequence);
  }
  setParticipantBattleItemCount(participant, itemId, participantBattleItemCount(participant, itemId) - 1);
  const statusId = battleActionStatusId(itemId, BATTLE_STATUS_POISON);
  const statusTurns = battleActionStatusTurns(itemId, 3);
  const statusPotency = battleActionStatusPotency(itemId, damage, Math.max(1, Math.round(damage * 0.5)));
  const statusHitRate = battleActionStatusHitRate(itemId, 1);
  const targetSummaries = [];
  const effectPerTarget = {};
  const statusResultPerTarget = {};
  const statusRollPerTarget = {};
  const statusChancePerTarget = {};
  const statusResistancePerTarget = {};
  const expCredits = [];
  const statusChanges = [];
  for (const target of validTargets) {
    const hpBefore = Number(target.hp || 0);
    const hpAfter = Math.max(0, hpBefore - damage);
    target.hp = hpAfter;
    target.defeated = hpAfter <= 0;
    let statusCheck = {hit: false, result: "target_down", chance: -1, roll: -1, resistance: battleStatusResistance(target, statusId), immune: false};
    let removedStatusIds = [];
    if (hpAfter > 0) {
      statusCheck = battleStatusHitCheck(room, battle, actor, target, itemId, statusId, round, sequence, statusHitRate);
      if (String(statusCheck.result || "") === "applied") {
        removedStatusIds = battleApplyStatus(target, statusId, statusTurns, statusPotency, actor.actorId);
      }
    }
    syncParticipantPetSnapshotHp(room, target);
    const targetExpCredits = battleExpCreditsForDefeat(room, battle, actor, target, hpBefore, hpAfter);
    expCredits.push(...targetExpCredits);
    const targetActorId = String(target.actorId || "");
    effectPerTarget[targetActorId] = damage;
    statusResultPerTarget[targetActorId] = String(statusCheck.result || "resisted");
    statusRollPerTarget[targetActorId] = Number(statusCheck.roll || -1);
    statusChancePerTarget[targetActorId] = Number(statusCheck.chance || -1);
    statusResistancePerTarget[targetActorId] = Number(statusCheck.resistance || 0);
    for (const removedStatusId of removedStatusIds) {
      statusChanges.push({actorId: targetActorId, statusId: removedStatusId, change: "remove_overwritten", schemaVersion: 1});
    }
    statusChanges.push({
      actorId: targetActorId,
      statusId,
      change: String(statusCheck.result || "resisted") === "applied" ? "apply" : String(statusCheck.result || "resisted"),
      turns: String(statusCheck.result || "") === "applied" ? statusTurns : 0,
      potency: String(statusCheck.result || "") === "applied" ? statusPotency : 0,
      chance: Number(statusCheck.chance || -1),
      roll: Number(statusCheck.roll || -1),
      resistance: Number(statusCheck.resistance || 0),
      immune: Boolean(statusCheck.immune),
      schemaVersion: 1,
    });
    targetSummaries.push({
      targetActorId,
      targetAccountId: String(target.accountId || ""),
      targetUsername: String(target.username || ""),
      targetKind: String(target.kind || BATTLE_ACTOR_KIND_PLAYER),
      hpBefore,
      hpAfter,
      damage,
      defeated: hpAfter <= 0,
      statusResult: String(statusCheck.result || "resisted"),
      schemaVersion: 1,
    });
  }
  appendBattleExpCredits(battle, expCredits);
  const target = validTargets[0];
  const itemName = battleItemLabel(itemId);
  const event = {
    eventId: `${room.roomId}:r${round}:e${sequence}`,
    eventType: isAll ? "item_poison_all" : "item_poison",
    round,
    sequence,
    actorAccountId: actor.accountId,
    actorUsername: actor.username,
    actorId: actor.actorId,
    actorKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
    targetAccountId: String(target.accountId || ""),
    targetUsername: String(target.username || ""),
    targetActorId: String(target.actorId || ""),
    targetKind: String(target.kind || BATTLE_ACTOR_KIND_PLAYER),
    targetActorIds: targetSummaries.map((entry) => entry.targetActorId),
    targets: targetSummaries,
    actionId: itemId,
    itemId,
    itemName,
    damage,
    hpBefore: Number(targetSummaries[0].hpBefore || 0),
    hpAfter: Number(targetSummaries[0].hpAfter || 0),
    defeated: Boolean(targetSummaries[0].defeated),
    effectPerTarget,
    statusId,
    statusTurns,
    statusPotency,
    statusHitRate,
    statusResult: String(targetSummaries[0].statusResult || "resisted"),
    statusResultPerTarget,
    statusRollPerTarget,
    statusChancePerTarget,
    statusResistancePerTarget,
    statusChanges,
    remainingItemCount: participantBattleItemCount(participant, itemId),
    animation: {
      actor: "item",
      targetReaction: "hurt",
      observer: "watch_target",
    },
    message: isAll
      ? `${actor.displayName || actor.username} 使用${itemName}，对方全体受到 ${damage} 点伤害。`
      : `${actor.displayName || actor.username} 使用${itemName}，${target.displayName || target.username} 受到 ${damage} 点伤害。`,
    schemaVersion: 1,
  };
  if (expCredits.length > 0) {
    event.expCredits = clone(expCredits);
  }
  return event;
}

function battleItemCleanseEvent(room, battle, command, actor, round, sequence) {
  const itemId = normalizeBattleItemId(command.itemId || command.actionId);
  const participant = battleParticipantByAccountId(room, actor.accountId);
  const target = battleActorByActorId(battle, command.targetActorId) || battlePlayerActorByAccountId(battle, command.targetAccountId);
  if (
    itemId === "" ||
    !participant ||
    participantBattleItemCount(participant, itemId) <= 0 ||
    !target ||
    Number(target.hp || 0) <= 0 ||
    String(target.side || "") !== String(actor.side || "")
  ) {
    return battleTargetMissingEvent(room, battle, command, actor, round, sequence);
  }
  setParticipantBattleItemCount(participant, itemId, participantBattleItemCount(participant, itemId) - 1);
  const statusIds = battleActionStatusIds(itemId);
  const cleanseStatusIds = statusIds.length > 0 ? statusIds : BATTLE_CLEANSE_STATUS_IDS;
  const removedStatusIds = battleRemoveStatuses(target, cleanseStatusIds);
  const itemName = battleItemLabel(itemId);
  const targetName = target.displayName || target.username || "目标";
  return {
    eventId: `${room.roomId}:r${round}:e${sequence}`,
    eventType: "item_cleanse",
    round,
    sequence,
    actorAccountId: actor.accountId,
    actorUsername: actor.username,
    actorId: actor.actorId,
    actorKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
    targetAccountId: String(target.accountId || ""),
    targetUsername: String(target.username || ""),
    targetActorId: String(target.actorId || ""),
    targetKind: String(target.kind || BATTLE_ACTOR_KIND_PLAYER),
    actionId: itemId,
    itemId,
    itemName,
    statusIds: cleanseStatusIds,
    removedStatusIds,
    statusResult: removedStatusIds.length > 0 ? "cleansed" : "no_status",
    statusChanges: removedStatusIds.map((statusId) => ({
      actorId: String(target.actorId || ""),
      statusId,
      change: "remove_cleanse",
      schemaVersion: 1,
    })),
    remainingItemCount: participantBattleItemCount(participant, itemId),
    damage: 0,
    animation: {
      actor: "item",
      targetReaction: "heal",
      observer: "watch_target",
    },
    message: removedStatusIds.length > 0
      ? `${actor.displayName || actor.username} 使用${itemName}，解除了 ${targetName} 的异常状态。`
      : `${actor.displayName || actor.username} 使用${itemName}，${targetName} 没有可解除的异常。`,
    schemaVersion: 1,
  };
}

function battlePetStatusSkillEvent(room, battle, command, actor, round, sequence) {
  const skillId = String(command.skillId || command.actionId || "").trim();
  const target = battleActorByActorId(battle, command.targetActorId) || battlePlayerActorByAccountId(battle, command.targetAccountId);
  if (
    !battlePetSkillActionById(skillId) ||
    battleActionEffectType(skillId) !== "status" ||
    !target ||
    Number(target.hp || 0) <= 0 ||
    String(target.side || "") === String(actor.side || "")
  ) {
    return battleTargetMissingEvent(room, battle, command, actor, round, sequence);
  }
  const statusId = battleActionStatusId(skillId, "");
  const statusTurns = battleActionStatusTurns(skillId, 1);
  const statusPotency = battleActionStatusPotency(skillId, 0, 0);
  const statusHitRate = battleActionStatusHitRate(skillId, 1);
  const statusCheck = battleStatusHitCheck(room, battle, actor, target, skillId, statusId, round, sequence, statusHitRate);
  const statusResult = String(statusCheck.result || "resisted");
  const removedStatusIds = statusResult === "applied"
    ? battleApplyStatus(target, statusId, statusTurns, statusPotency, actor.actorId)
    : [];
  const targetActorId = String(target.actorId || "");
  const statusChanges = [];
  for (const removedStatusId of removedStatusIds) {
    statusChanges.push({actorId: targetActorId, statusId: removedStatusId, change: "remove_overwritten", schemaVersion: 1});
  }
  statusChanges.push({
    actorId: targetActorId,
    statusId,
    change: statusResult === "applied" ? "apply" : statusResult,
    turns: statusResult === "applied" ? statusTurns : 0,
    potency: statusResult === "applied" ? statusPotency : 0,
    chance: Number(statusCheck.chance || -1),
    roll: Number(statusCheck.roll || -1),
    resistance: Number(statusCheck.resistance || 0),
    immune: Boolean(statusCheck.immune),
    schemaVersion: 1,
  });
  const skillName = String(battlePetSkillActionById(skillId).label || "宠物技能");
  const targetName = target.displayName || target.username || "目标";
  const statusLabel = battleStatusLabel(statusId);
  return {
    eventId: `${room.roomId}:r${round}:e${sequence}`,
    eventType: "skill_status",
    round,
    sequence,
    actorAccountId: actor.accountId,
    actorUsername: actor.username,
    actorId: actor.actorId,
    actorKind: String(actor.kind || BATTLE_ACTOR_KIND_PET),
    targetAccountId: String(target.accountId || ""),
    targetUsername: String(target.username || ""),
    targetActorId,
    targetKind: String(target.kind || BATTLE_ACTOR_KIND_PLAYER),
    actionId: skillId,
    skillId,
    skillName,
    statusId,
    statusTurns,
    statusPotency,
    statusHitRate,
    statusResult,
    statusRoll: Number(statusCheck.roll || -1),
    statusChance: Number(statusCheck.chance || -1),
    statusResistance: Number(statusCheck.resistance || 0),
    statusImmune: Boolean(statusCheck.immune),
    statusChanges,
    damage: 0,
    animation: {
      actor: "skill",
      targetReaction: statusResult === "applied" ? "status" : "none",
      observer: "watch_target",
    },
    message: statusResult === "applied"
      ? `${actor.displayName || actor.username} 使用${skillName}，${targetName} 陷入${statusLabel}状态。`
      : `${actor.displayName || actor.username} 使用${skillName}，${targetName} 没有受到${statusLabel}影响。`,
    schemaVersion: 1,
  };
}

function battleSpiritEvent(room, battle, command, actor, round, sequence) {
  const spiritId = String(command.spiritId || command.skillId || command.actionId || "").trim();
  const effectType = battleSpiritEffectType(spiritId);
  if (!stringArray(actor.spiritIds).includes(spiritId) || (effectType !== "heal" && effectType !== "poison")) {
    return battleTargetMissingEvent(room, battle, command, actor, round, sequence);
  }
  if (effectType === "heal") {
    return battleSpiritHealEvent(room, battle, command, actor, spiritId, round, sequence);
  }
  return battleSpiritPoisonEvent(room, battle, command, actor, spiritId, round, sequence);
}

function battleSpiritHealEvent(room, battle, command, actor, spiritId, round, sequence) {
  const heal = battleSpiritEffectAmount(spiritId, 0);
  const isAll = battleSpiritIsAll(spiritId);
  const targets = isAll
    ? battleLivingTargetsBySlotOrder(battle, String(actor.side || ""), false)
    : [battleActorByActorId(battle, command.targetActorId) || battlePlayerActorByAccountId(battle, command.targetAccountId)].filter(Boolean);
  const validTargets = targets.filter((target) => (
    target &&
    String(target.side || "") === String(actor.side || "") &&
    Number(target.hp || 0) > 0
  ));
  if (heal <= 0 || validTargets.length <= 0) {
    return battleTargetMissingEvent(room, battle, command, actor, round, sequence);
  }
  const targetSummaries = [];
  const effectPerTarget = {};
  let totalHealed = 0;
  for (const target of validTargets) {
    const hpBefore = Number(target.hp || 0);
    const maxHp = battleActorWritebackMaxHp(target);
    const hpAfter = Math.min(maxHp, hpBefore + heal);
    const healed = Math.max(0, hpAfter - hpBefore);
    target.hp = hpAfter;
    target.defeated = hpAfter <= 0;
    syncParticipantPetSnapshotHp(room, target);
    totalHealed += healed;
    effectPerTarget[String(target.actorId || "")] = healed;
    targetSummaries.push({
      targetActorId: String(target.actorId || ""),
      targetAccountId: String(target.accountId || ""),
      targetUsername: String(target.username || ""),
      targetKind: String(target.kind || BATTLE_ACTOR_KIND_PLAYER),
      hpBefore,
      hpAfter,
      healed,
      schemaVersion: 1,
    });
  }
  const target = validTargets[0];
  const spiritName = battleSpiritLabel(spiritId);
  return {
    eventId: `${room.roomId}:r${round}:e${sequence}`,
    eventType: isAll ? "spirit_heal_all" : "spirit_heal",
    round,
    sequence,
    actorAccountId: actor.accountId,
    actorUsername: actor.username,
    actorId: actor.actorId,
    actorKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
    targetAccountId: String(target.accountId || ""),
    targetUsername: String(target.username || ""),
    targetActorId: String(target.actorId || ""),
    targetKind: String(target.kind || BATTLE_ACTOR_KIND_PLAYER),
    targetActorIds: targetSummaries.map((entry) => entry.targetActorId),
    targets: targetSummaries,
    actionId: spiritId,
    skillId: spiritId,
    spiritId,
    skillName: spiritName,
    heal,
    healed: totalHealed,
    hpBefore: Number(targetSummaries[0].hpBefore || 0),
    hpAfter: Number(targetSummaries[0].hpAfter || 0),
    effectPerTarget,
    damage: 0,
    animation: {
      actor: "spirit",
      targetReaction: "heal",
      observer: "watch_target",
    },
    message: isAll
      ? `${actor.displayName || actor.username} 使用${spiritName}，我方全体回复生命。`
      : `${actor.displayName || actor.username} 使用${spiritName}，${target.displayName || target.username} 回复 ${Number(targetSummaries[0].healed || 0)} 点生命。`,
    schemaVersion: 1,
  };
}

function battleSpiritPoisonEvent(room, battle, command, actor, spiritId, round, sequence) {
  const damage = Math.max(1, battleSpiritEffectAmount(spiritId, 1));
  const isAll = battleSpiritIsAll(spiritId);
  const explicitTarget = battleActorByActorId(battle, command.targetActorId) || battlePlayerActorByAccountId(battle, command.targetAccountId);
  const targets = isAll
    ? battleLivingOpponentTargetsBySlotOrder(battle, actor, false)
    : [explicitTarget].filter(Boolean);
  const validTargets = targets.filter((target) => (
    target &&
    String(target.side || "") !== String(actor.side || "") &&
    Number(target.hp || 0) > 0
  ));
  if (validTargets.length <= 0) {
    return battleTargetMissingEvent(room, battle, command, actor, round, sequence);
  }
  const statusId = String(battleSpiritEffect(spiritId).statusId || BATTLE_STATUS_POISON);
  const statusTurns = Math.max(1, Math.trunc(Number(battleSpiritEffect(spiritId).statusTurns || 3)));
  const statusPotency = battleSpiritStatusPotency(spiritId, damage);
  const statusHitRate = battleActionStatusHitRate(spiritId, Number(battleSpiritEffect(spiritId).statusHitRate || 1));
  const targetSummaries = [];
  const effectPerTarget = {};
  const statusResultPerTarget = {};
  const statusRollPerTarget = {};
  const statusChancePerTarget = {};
  const statusResistancePerTarget = {};
  const statusChanges = [];
  const expCredits = [];
  for (const target of validTargets) {
    const hpBefore = Number(target.hp || 0);
    const hpAfter = Math.max(0, hpBefore - damage);
    target.hp = hpAfter;
    target.defeated = hpAfter <= 0;
    let statusCheck = {hit: false, result: "target_down", chance: -1, roll: -1, resistance: battleStatusResistance(target, statusId), immune: false};
    let removedStatusIds = [];
    if (hpAfter > 0) {
      statusCheck = battleStatusHitCheck(room, battle, actor, target, spiritId, statusId, round, sequence, statusHitRate);
      if (String(statusCheck.result || "") === "applied") {
        removedStatusIds = battleApplyStatus(target, statusId, statusTurns, statusPotency, actor.actorId);
      }
    }
    syncParticipantPetSnapshotHp(room, target);
    const targetExpCredits = battleExpCreditsForDefeat(room, battle, actor, target, hpBefore, hpAfter);
    expCredits.push(...targetExpCredits);
    const targetActorId = String(target.actorId || "");
    effectPerTarget[targetActorId] = damage;
    statusResultPerTarget[targetActorId] = String(statusCheck.result || "resisted");
    statusRollPerTarget[targetActorId] = Number(statusCheck.roll || -1);
    statusChancePerTarget[targetActorId] = Number(statusCheck.chance || -1);
    statusResistancePerTarget[targetActorId] = Number(statusCheck.resistance || 0);
    for (const removedStatusId of removedStatusIds) {
      statusChanges.push({actorId: targetActorId, statusId: removedStatusId, change: "remove_overwritten", schemaVersion: 1});
    }
    statusChanges.push({
      actorId: targetActorId,
      statusId,
      change: String(statusCheck.result || "resisted") === "applied" ? "apply" : String(statusCheck.result || "resisted"),
      turns: String(statusCheck.result || "") === "applied" ? statusTurns : 0,
      potency: String(statusCheck.result || "") === "applied" ? statusPotency : 0,
      chance: Number(statusCheck.chance || -1),
      roll: Number(statusCheck.roll || -1),
      resistance: Number(statusCheck.resistance || 0),
      immune: Boolean(statusCheck.immune),
      schemaVersion: 1,
    });
    targetSummaries.push({
      targetActorId,
      targetAccountId: String(target.accountId || ""),
      targetUsername: String(target.username || ""),
      targetKind: String(target.kind || BATTLE_ACTOR_KIND_PLAYER),
      hpBefore,
      hpAfter,
      damage,
      defeated: hpAfter <= 0,
      statusResult: String(statusCheck.result || "resisted"),
      schemaVersion: 1,
    });
  }
  appendBattleExpCredits(battle, expCredits);
  const target = validTargets[0];
  const spiritName = battleSpiritLabel(spiritId);
  const event = {
    eventId: `${room.roomId}:r${round}:e${sequence}`,
    eventType: isAll ? "spirit_poison_all" : "spirit_poison",
    round,
    sequence,
    actorAccountId: actor.accountId,
    actorUsername: actor.username,
    actorId: actor.actorId,
    actorKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
    targetAccountId: String(target.accountId || ""),
    targetUsername: String(target.username || ""),
    targetActorId: String(target.actorId || ""),
    targetKind: String(target.kind || BATTLE_ACTOR_KIND_PLAYER),
    targetActorIds: targetSummaries.map((entry) => entry.targetActorId),
    targets: targetSummaries,
    actionId: spiritId,
    skillId: spiritId,
    spiritId,
    skillName: spiritName,
    damage,
    hpBefore: Number(targetSummaries[0].hpBefore || 0),
    hpAfter: Number(targetSummaries[0].hpAfter || 0),
    defeated: Boolean(targetSummaries[0].defeated),
    effectPerTarget,
    statusId,
    statusTurns,
    statusPotency,
    statusHitRate,
    statusResult: String(targetSummaries[0].statusResult || "applied"),
    statusResultPerTarget,
    statusRollPerTarget,
    statusChancePerTarget,
    statusResistancePerTarget,
    statusChanges,
    animation: {
      actor: "spirit",
      targetReaction: "hurt",
      observer: "watch_target",
    },
    message: isAll
      ? `${actor.displayName || actor.username} 使用${spiritName}，对方全体受到 ${damage} 点伤害。`
      : `${actor.displayName || actor.username} 使用${spiritName}，${target.displayName || target.username} 受到 ${damage} 点伤害。`,
    schemaVersion: 1,
  };
  if (expCredits.length > 0) {
    event.expCredits = clone(expCredits);
  }
  return event;
}

function battleCaptureEvent(room, battle, command, actor, round, sequence) {
  const toolId = normalizeBattleCaptureToolId(command.captureToolId || command.itemId || command.actionId);
  const participant = battleParticipantByAccountId(room, actor.accountId);
  const target = battleActorByActorId(battle, command.targetActorId) || battlePlayerActorByAccountId(battle, command.targetAccountId);
  if (
    !participant ||
    !target ||
    validateBattleCaptureTarget(actor, target).ok !== true ||
    participantCaptureToolCount(participant, toolId) <= 0
  ) {
    return battleTargetMissingEvent(room, battle, command, actor, round, sequence);
  }
  const hpBefore = Number(target.hp || 0);
  const chance = battleCaptureChance(room, battle, actor, target, toolId);
  const roll = battleCaptureRoll(room, battle, actor, target, toolId, round, sequence);
  const success = chance > 0 && roll < chance;
  if (battleCaptureToolIsConsumable(toolId)) {
    setParticipantCaptureToolCount(participant, toolId, participantCaptureToolCount(participant, toolId) - 1);
  }
  if (success) {
    target.hp = 0;
    target.defeated = true;
    target.captured = true;
    target.capturedByAccountId = String(actor.accountId || "");
    target.capturedByActorId = String(actor.actorId || "");
    target.captureToolId = toolId;
    target.capturedAtRound = round;
  }
  const hpAfter = Number(target.hp || 0);
  const toolName = battleCaptureToolFullName(toolId);
  const actorName = actor.displayName || actor.username || "人物";
  const targetName = target.displayName || target.username || "野生宠物";
  return {
    eventId: `${room.roomId}:r${round}:e${sequence}`,
    eventType: BATTLE_ACTION_CAPTURE,
    round,
    sequence,
    actorAccountId: actor.accountId,
    actorUsername: actor.username,
    actorId: actor.actorId,
    actorKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
    targetAccountId: target.accountId,
    targetUsername: target.username,
    targetActorId: target.actorId,
    targetKind: String(target.kind || BATTLE_ACTOR_KIND_WILD_PET),
    actionId: BATTLE_ACTION_CAPTURE,
    captureToolId: toolId,
    captureToolLabel: toolName,
    captureChance: chance,
    captureRoll: roll,
    success,
    hpBefore,
    hpAfter,
    defeated: success,
    captured: success,
    remainingCaptureToolCount: Number.isFinite(participantCaptureToolCount(participant, toolId))
      ? participantCaptureToolCount(participant, toolId)
      : 0,
    damage: 0,
    animation: {
      actor: BATTLE_ACTION_CAPTURE,
      targetReaction: success ? "captured" : "hurt",
      observer: "watch_target",
    },
    message: success
      ? `${actorName} 使用${toolName}捕捉了 ${targetName}。`
      : `${actorName} 使用${toolName}尝试捕捉 ${targetName}，${targetName} 挣脱了。`,
    schemaVersion: 1,
  };
}

function battleCaptureChance(room, battle, actor, target, toolId) {
  if (!actor || !target || !Boolean(target.catchable)) {
    return 0;
  }
  if (String(actor.kind || BATTLE_ACTOR_KIND_PLAYER) !== BATTLE_ACTOR_KIND_PLAYER) {
    return 0;
  }
  const override = battleOptionalChanceValue(target.captureChanceOverride);
  if (override !== undefined) {
    return override;
  }
  const formula = activeBattleCaptureFormula();
  const maxHp = Math.max(1, Number(target.maxHp || 1));
  const hpRatio = Math.max(0, Math.min(1, Number(target.hp || 0) / maxHp));
  const difficulty = Math.max(0, Math.min(0.9, Number(target.captureDifficulty || 42) / 100));
  let chance = Number(formula.baseChance || 0.42);
  chance -= hpRatio * Number(formula.hpRatioPenalty || 0.22);
  chance -= difficulty * Number(formula.difficultyRatioPenalty || 0.12);
  chance += battleCaptureToolChanceBonus(toolId);
  chance += battleCaptureStatusBonusForActor(target);
  const minChance = Number(formula.minChance || 0.05);
  const maxChance = Number(formula.maxChance || 0.95);
  return Math.max(minChance, Math.min(maxChance, chance));
}

function battleCaptureRoll(room, battle, actor, target, toolId, round, sequence) {
  const seed = [
    room && (room.seed || room.roomId) || "",
    battle && battle.turnSeq || 0,
    round,
    sequence,
    actor && actor.actorId || "",
    target && target.actorId || "",
    normalizeBattleCaptureToolId(toolId),
    "capture",
  ].join(":");
  return Number.parseInt(crypto.createHash("sha256").update(seed).digest("hex").slice(0, 8), 16) / 0xffffffff;
}

function activeBattleCaptureFormula() {
  const document = captureFormulaDocument();
  const formulas = Array.isArray(document.formulas) ? document.formulas : [];
  const activeId = String(document.activeFormulaId || "").trim();
  const formula = formulas.find((entry) => entry && String(entry.id || "") === activeId) || formulas[0] || {};
  return formula && typeof formula === "object" && !Array.isArray(formula) ? formula : {};
}

function battleCaptureStatusBonusForActor(actor) {
  const statuses = actor && actor.statuses && typeof actor.statuses === "object" && !Array.isArray(actor.statuses)
    ? actor.statuses
    : {};
  const formula = activeBattleCaptureFormula();
  const statusBonus = formula.statusBonus && typeof formula.statusBonus === "object" && !Array.isArray(formula.statusBonus)
    ? formula.statusBonus
    : {};
  let bonus = 0;
  for (const statusId of ["sleep", "stone", "confusion", "poison"]) {
    if (statuses[statusId]) {
      bonus += Number(statusBonus[statusId] || 0);
    }
  }
  return bonus;
}

function battleSwitchPetEvent(room, battle, command, actor, round, sequence) {
  const participant = battleParticipantByAccountId(room, actor.accountId);
  const battlePets = participantBattlePets(participant);
  const nextPetId = String(command.petId || "").trim();
  const nextPet = battlePets.find((pet) => String(pet.petId || "") === nextPetId) || null;
  const previousPetActor = activePetActorByAccountId(battle, actor.accountId);
  if (!participant || !nextPet || Number(nextPet.hp || 0) <= 0 || (previousPetActor && String(previousPetActor.petId || "") === nextPetId)) {
    return battleTargetMissingEvent(room, battle, command, actor, round, sequence);
  }
  const previousPetId = previousPetActor ? String(previousPetActor.petId || "") : "";
  updateParticipantPetAfterSwitch(participant, previousPetActor, nextPetId);
  const nextPetActor = battlePetActorFromParticipant(participant, String(actor.side || ""), nextPet, 0);
  const actors = Array.isArray(battle.actors) ? battle.actors : [];
  const previousIndex = previousPetActor ? actors.findIndex((entry) => entry && String(entry.actorId || "") === String(previousPetActor.actorId || "")) : -1;
  if (previousIndex >= 0) {
    actors[previousIndex] = nextPetActor;
  } else {
    actors.push(nextPetActor);
  }
  battle.actors = actors;
  battle.requiredActorIds = requiredBattleCommandActorIds(battle);
  return {
    eventId: `${room.roomId}:r${round}:e${sequence}`,
    eventType: BATTLE_ACTION_SWITCH_PET,
    round,
    sequence,
    actorAccountId: actor.accountId,
    actorUsername: actor.username,
    actorId: actor.actorId,
    actorKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
    actionId: BATTLE_ACTION_SWITCH_PET,
    petId: nextPetId,
    previousPetId,
    previousPetActorId: previousPetActor ? String(previousPetActor.actorId || "") : "",
    nextPetActorId: String(nextPetActor.actorId || ""),
    nextPet: publicBattleActor(nextPetActor),
    targetActorId: String(nextPetActor.actorId || ""),
    targetAccountId: String(nextPetActor.accountId || ""),
    targetUsername: String(nextPetActor.username || ""),
    damage: 0,
    animation: {
      actor: "switch_pet",
      targetReaction: "switch_in",
      observer: "watch_target",
    },
    message: `${actor.displayName || actor.username} 换上了 ${nextPetActor.displayName || "宠物"}。`,
    schemaVersion: 1,
  };
}

function updateParticipantPetAfterSwitch(participant, previousPetActor, nextPetId) {
  const battlePets = participantBattlePets(participant);
  for (const pet of battlePets) {
    const petId = String(pet.petId || "");
    if (previousPetActor && petId === String(previousPetActor.petId || "")) {
      pet.hp = battleActorWritebackHp(previousPetActor);
      pet.maxHp = battleActorWritebackMaxHp(previousPetActor);
      pet.state = pet.hp > 0 ? BATTLE_PET_STATE_STANDBY : "rest";
      pet.activeInBattle = false;
    }
    if (petId === nextPetId) {
      pet.state = BATTLE_PET_STATE_BATTLE;
      pet.activeInBattle = true;
    }
  }
}

function syncParticipantPetSnapshotHp(room, actor) {
  if (!actor || String(actor.kind || "") !== BATTLE_ACTOR_KIND_PET) {
    return;
  }
  const participant = battleParticipantByAccountId(room, actor.accountId);
  for (const pet of participantBattlePets(participant)) {
    if (String(pet.petId || "") !== String(actor.petId || "")) {
      continue;
    }
    pet.hp = battleActorWritebackHp(actor);
    pet.maxHp = battleActorWritebackMaxHp(actor);
    pet.state = pet.hp > 0 ? (pet.activeInBattle ? BATTLE_PET_STATE_BATTLE : BATTLE_PET_STATE_STANDBY) : "rest";
    return;
  }
}

function battleAttackEvent(room, battle, command, actor, target, round, sequence, hpBefore, hpAfter, damage, expCredits = []) {
  const actionKind = String(command.actionKind || "attack");
  const actionId = String(command.actionId || BATTLE_ACTION_ATTACK);
  const skillId = String(command.skillId || "");
  const eventType = actionKind === "pet_skill" ? "pet_skill" : "basic_attack";
  const actionLabel = actionKind === "pet_skill" ? "使用技能" : "攻击了";
  const event = {
    eventId: `${room.roomId}:r${round}:e${sequence}`,
    eventType,
    round,
    sequence,
    actorAccountId: actor.accountId,
    actorUsername: actor.username,
    actorId: actor.actorId,
    actorKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
    targetAccountId: target.accountId,
    targetUsername: target.username,
    targetActorId: target.actorId,
    targetKind: String(target.kind || BATTLE_ACTOR_KIND_PLAYER),
    actionId,
    skillId,
    targetRule: String(command.targetRule || ""),
    targetRollIndex: Math.trunc(Number(command.targetRollIndex || 0)),
    targetCandidateCount: Math.trunc(Number(command.targetCandidateCount || 0)),
    damage,
    blocked: Boolean(target.guarding),
    hpBefore,
    hpAfter,
    defeated: hpAfter <= 0,
    animation: {
      actor: "attack",
      targetReaction: hpAfter <= 0 ? "knockdown" : "hurt",
      observer: "watch_target",
    },
    message: `${actor.displayName || actor.username} ${actionLabel} ${target.displayName || target.username}，造成 ${damage} 点伤害。`,
    schemaVersion: 1,
  };
  if (Array.isArray(expCredits) && expCredits.length > 0) {
    event.expCredits = clone(expCredits);
  }
  return event;
}

function battleAttackDamage(room, battle, command, actor, target) {
  const seed = `${room.seed || room.roomId}:${battle.turnSeq}:${battle.round}:${command.actorId}:${command.targetActorId}`;
  const roll = Number.parseInt(crypto.createHash("sha256").update(seed).digest("hex").slice(0, 4), 16) % 7;
  const reduction = target.guarding ? BATTLE_DEFEND_REDUCTION : 0;
  let baseDamage = BATTLE_BASE_ATTACK_DAMAGE;
  if (String(actor.kind || "") === BATTLE_ACTOR_KIND_PET || String(actor.kind || "") === BATTLE_ACTOR_KIND_WILD_PET) {
    baseDamage = Math.max(8, Math.round(Number(actor.attack || DEFAULT_PET_BATTLE_STATS.attack) * 0.75));
  }
  if (String(command.actionKind || "") === "pet_skill") {
    baseDamage += Math.max(0, Math.trunc(Number(battleActionEffect(command.actionId).amountBonus || 12)));
  }
  return Math.max(1, baseDamage + roll - reduction);
}

function accountById(data, accountId) {
  return Object.values(data.accounts).find((account) => account && account.accountId === accountId) || null;
}

function activeOnlinePlayers(data, now) {
  const activeSessions = Object.values(data.sessions)
    .filter((session) => session && !session.revokedAt && Date.parse(session.expiresAt) > now())
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const seenAccountIds = new Set();
  const players = [];
  for (const session of activeSessions) {
    if (seenAccountIds.has(session.accountId)) {
      continue;
    }
    const account = accountById(data, session.accountId);
    if (!account) {
      continue;
    }
    seenAccountIds.add(session.accountId);
    players.push(account);
  }
  players.sort((a, b) => String(a.username).localeCompare(String(b.username)));
  return players;
}

function onlinePlayersForViewer(data, viewerAccount, aoi, now) {
  return activeOnlinePlayers(data, now).filter((account) => (
    onlineAccountVisibleToViewer(data, viewerAccount, account, aoi)
  ));
}

function publicOnlinePlayersForViewer(data, viewerAccount, aoi, now) {
  const viewerPosition = viewerAccount ? data.playerPositions[viewerAccount.accountId] || null : null;
  const players = onlinePlayersForViewer(data, viewerAccount, aoi, now).map((account) => publicOnlinePlayer(account, data));
  players.sort((a, b) => {
    const distanceDelta = onlinePlayerDistanceRank(a, viewerPosition) - onlinePlayerDistanceRank(b, viewerPosition);
    if (distanceDelta !== 0) {
      return distanceDelta;
    }
    return String(a.username).localeCompare(String(b.username));
  });
  return players.slice(0, ONLINE_PLAYERS_RESPONSE_LIMIT);
}

function withPinnedPublicOnlinePlayer(players, data, accountId) {
  if (!accountId || players.some((player) => player.accountId === accountId)) {
    return players;
  }
  const account = accountById(data, accountId);
  if (!account) {
    return players;
  }
  const pinned = publicOnlinePlayer(account, data);
  return [pinned, ...players].slice(0, ONLINE_PLAYERS_RESPONSE_LIMIT);
}

function onlinePlayerDistanceRank(player, viewerPosition) {
  if (!viewerPosition || !player || !player.position) {
    return Number.MAX_SAFE_INTEGER;
  }
  const position = player.position;
  if (String(position.mapId || "") !== String(viewerPosition.mapId || "")) {
    return Number.MAX_SAFE_INTEGER;
  }
  const dx = Math.abs(Number(position.cellX || 0) - Number(viewerPosition.cellX || 0));
  const dy = Math.abs(Number(position.cellY || 0) - Number(viewerPosition.cellY || 0));
  return Math.max(dx, dy);
}

function onlineAccountVisibleToViewer(data, viewerAccount, account, aoi) {
  if (!aoi || !aoi.enabled) {
    return true;
  }
  if (viewerAccount && account.accountId === viewerAccount.accountId) {
    return true;
  }
  return onlinePositionVisibleToAoi(data.playerPositions[account.accountId] || null, aoi);
}

function normalizeOnlineAoiPayload(payload = {}, fallbackPosition = null) {
  const scope = String(payload.scope || payload.viewScope || "").trim().toLowerCase();
  const hasExplicitPosition = (
    String(payload.mapId || payload.map || "").trim() !== "" ||
    payload.cellX !== undefined ||
    payload.cellY !== undefined ||
    payload.x !== undefined ||
    payload.y !== undefined
  );
  if (scope !== ONLINE_AOI_SCOPE && scope !== "nearby" && !hasExplicitPosition) {
    return {
      enabled: false,
      scope: "all",
      mapId: "",
      cellX: 0,
      cellY: 0,
      radius: ONLINE_AOI_DEFAULT_RADIUS,
    };
  }
  const source = hasExplicitPosition ? payload : (fallbackPosition || {});
  const mapId = String(source.mapId || source.map || "").trim().slice(0, POSITION_MAP_ID_MAX_LENGTH);
  if (!mapId) {
    return {
      enabled: false,
      scope: "all",
      mapId: "",
      cellX: 0,
      cellY: 0,
      radius: ONLINE_AOI_DEFAULT_RADIUS,
    };
  }
  return {
    enabled: true,
    scope: ONLINE_AOI_SCOPE,
    mapId,
    cellX: clampInt(source.cellX ?? source.x, -9999, 9999, 0),
    cellY: clampInt(source.cellY ?? source.y, -9999, 9999, 0),
    radius: clampInt(payload.aoiRadius ?? payload.viewRadius ?? payload.radius, 1, ONLINE_AOI_MAX_RADIUS, ONLINE_AOI_DEFAULT_RADIUS),
  };
}

function onlinePositionVisibleToAoi(position, aoi) {
  if (!aoi || !aoi.enabled) {
    return true;
  }
  if (!position || typeof position !== "object") {
    return false;
  }
  if (String(position.mapId || "") !== aoi.mapId) {
    return false;
  }
  const dx = Math.abs(Number(position.cellX || 0) - aoi.cellX);
  const dy = Math.abs(Number(position.cellY || 0) - aoi.cellY);
  return dx <= aoi.radius && dy <= aoi.radius;
}

function publicOnlineAoi(aoi) {
  return {
    scope: aoi && aoi.enabled ? ONLINE_AOI_SCOPE : "all",
    mapId: aoi && aoi.enabled ? aoi.mapId : "",
    cellX: aoi && aoi.enabled ? aoi.cellX : 0,
    cellY: aoi && aoi.enabled ? aoi.cellY : 0,
    radius: aoi && Number.isFinite(aoi.radius) ? aoi.radius : ONLINE_AOI_DEFAULT_RADIUS,
    schemaVersion: 1,
  };
}

function ensureProfileForAccount(data, account, now) {
  const binding = profileBindingForAccount(data, account, now);
  const existingDoc = data.profiles[binding.playerId] || null;
  if (existingDoc && existingDoc.profile && typeof existingDoc.profile === "object" && !Array.isArray(existingDoc.profile)) {
    return {binding, profileDoc: existingDoc, created: false};
  }
  const updatedAt = String(binding.updatedAt || isoNow(now));
  const revision = Math.max(0, Math.trunc(Number(binding.profileRevision || 0)));
  binding.profileRevision = revision;
  binding.updatedAt = updatedAt;
  data.profileBindings[account.accountId] = binding;
  data.profiles[binding.playerId] = {
    playerId: binding.playerId,
    accountId: account.accountId,
    profileRevision: revision,
    profile: createDefaultServerProfile(account),
    updatedAt,
    schemaVersion: 1,
  };
  return {binding, profileDoc: data.profiles[binding.playerId], created: true};
}

function createDefaultServerProfile(account) {
  const displayName = String(account && (account.displayName || account.username) || "").trim() || "见习猎人";
  const starterEquipmentSlots = defaultStarterEquipmentSlots();
  const profile = {
    schemaVersion: 1,
    player: {
      name: displayName,
      level: 1,
      exp: 0,
      nextExp: battleExpToNextLevel(1),
      baseStats: clone(DEFAULT_PLAYER_BATTLE_STATS),
      statPoints: 0,
      hp: DEFAULT_PLAYER_BATTLE_STATS.maxHp,
      maxHp: DEFAULT_PLAYER_BATTLE_STATS.maxHp,
    },
    activePetInstanceId: "pet_bui_main",
    nextPetInstanceSerial: 5,
    nextPetDropSerial: 1,
    stoneCoins: DEFAULT_STONE_COINS,
    diamonds: DEFAULT_DIAMONDS,
    devDiamondsGrantVersion: DEV_DIAMONDS_GRANT_VERSION,
    petInstances: [
      createDefaultServerPet("pet_bui_main", "我的布伊", "bui_normal_red_fire10", BATTLE_PET_STATE_BATTLE, 1),
      createDefaultServerPet("pet_bui_speed", "黄色普通布伊", "bui_normal_yellow_wind10", BATTLE_PET_STATE_STANDBY, 1),
      createDefaultServerPet("pet_bui_tough", "厚皮布伊", "bui_normal_thick_earth10", BATTLE_PET_STATE_STANDBY, 1),
      createDefaultServerPet("pet_bui_rest", "休息布伊", "bui_normal_red_fire10", "rest", 1),
    ].filter((pet) => pet && Object.keys(pet).length > 0),
    groundPetDrops: [],
    ridePetInstanceId: "",
    backpackSlots: defaultStartingBackpackSlots(),
    backpackExtraSlots: 0,
    quickSlots: ["", "", ""],
    equipmentSlots: starterEquipmentSlots,
    equipmentInstances: {},
    equipmentSlotInstanceIds: {},
    nextEquipmentInstanceSerial: 1,
    equipmentDurability: fullEquipmentDurabilityForSlots(starterEquipmentSlots),
    equipmentEnhancement: zeroValueForEquipmentSlots(starterEquipmentSlots),
    equipmentWearCounters: zeroValueForEquipmentSlots(starterEquipmentSlots),
    equipmentExpPillCharge: {},
    equipmentSlotsVersion: EQUIPMENT_SLOTS_VERSION,
    equipmentStarterSetVersion: EQUIPMENT_STARTER_SET_VERSION,
    expPillStarterVersion: EXP_PILL_STARTER_VERSION,
    mailboxMessages: [],
    petRebirthMmStage2Claimed: false,
    petRebirthMmGuide: defaultPetRebirthMmGuide(),
    captureTools: defaultStartingCaptureTools(),
    activeQuestId: firstQuestId(),
    questStates: {},
    petCodexSeenFormIds: [],
    petCodexCapturedFormIds: [],
    autoBattleSettings: defaultAutoBattleSettings(),
    autoCaptureSettings: defaultAutoCaptureSettings(),
    hangSettings: defaultHangSettings(),
    hangSession: defaultHangSession(),
    trainingPartners: [],
    playerGrowth: defaultPlayerGrowth(),
    battleResultReceipts: [],
    serverSync: defaultServerSyncState(),
    recordPoint: clone(DEFAULT_RECORD_POINT),
    unlockedAbilities: [],
    rebirthCount: 0,
    rebirthHistory: [],
    rebirthQuestCompletions: [],
    rebirthTrialProofs: {},
  };
  if (profile.petInstances.length <= 0) {
    profile.activePetInstanceId = "";
  }
  return profile;
}

function createDefaultServerPet(instanceId, name, formId, state, level) {
  const template = petTemplateForFormId(formId);
  const baseStats = objectOrEmpty(template.baseStats);
  const maxHp = Math.max(1, Math.trunc(Number(baseStats.maxHp || DEFAULT_PET_BATTLE_STATS.maxHp)));
  return {
    instanceId,
    petId: instanceId,
    templateId: formId,
    formId,
    speciesId: formId,
    lineId: String(template.lineId || ""),
    lineName: String(template.lineName || ""),
    subtypeId: String(template.subtypeId || ""),
    subtypeName: String(template.subtypeName || ""),
    formName: String(template.formName || name || "宠物"),
    name: String(name || template.formName || "宠物"),
    state,
    level: Math.max(1, Math.min(MAX_PET_LEVEL, Math.trunc(Number(level || 1)))),
    exp: 0,
    nextExp: battleExpToNextLevel(level),
    hp: maxHp,
    maxHp,
    attack: Math.max(1, Math.trunc(Number(baseStats.attack || DEFAULT_PET_BATTLE_STATS.attack))),
    defense: Math.max(1, Math.trunc(Number(baseStats.defense || DEFAULT_PET_BATTLE_STATS.defense))),
    quick: Math.max(1, Math.trunc(Number(baseStats.quick || baseStats.agility || DEFAULT_PET_BATTLE_STATS.quick))),
    elements: clone(objectOrEmpty(template.elements)),
    growthProfileId: String(template.growthProfileId || "balanced"),
    activeSkillIds: stringArray(template.activeSkillIds),
    petSkillSlots: stringArray(template.petSkillSlots),
    passiveSkillIds: stringArray(template.passiveSkillIds),
    capturedSerial: Math.max(1, Math.trunc(Number(level || 1))),
    source: "server_starter",
    schemaVersion: 1,
  };
}

function defaultStartingBackpackSlots() {
  const counts = {};
  for (const item of bagItems()) {
    const itemId = String(item && item.id || "").trim();
    const count = Math.max(0, Math.trunc(Number(item && item.startingCount || 0)));
    if (itemId && count > 0) {
      counts[itemId] = count;
    }
  }
  return backpackSlotsFromCounts(counts, BACKPACK_BASE_SLOT_LIMIT);
}

function defaultStartingCaptureTools() {
  const result = {};
  for (const tool of battleCaptureToolEntries()) {
    const toolId = String(tool && tool.id || "").trim();
    if (!toolId || toolId === BATTLE_CAPTURE_TOOL_EMPTY_HAND || tool.consumable === false) {
      continue;
    }
    result[toolId] = Math.max(0, Math.trunc(Number(tool.startingCount || 0)));
  }
  return result;
}

function defaultStarterEquipmentSlots() {
  return {
    accessory_left: "accessory_firebud_charm",
    accessory_right: "accessory_wind_ring",
    head: "helm_leather_cap",
    left_hand_weapon: "weapon_training_spear",
    body: "armor_moist_cloth",
    right_hand_weapon: "weapon_stone_dagger",
    hands: "gloves_hide",
    feet: "boots_grass",
    exp_pill: "",
  };
}

function fullEquipmentDurabilityForSlots(slots) {
  const result = {};
  for (const [slotId, itemId] of Object.entries(objectOrEmpty(slots))) {
    const maxDurability = equipmentItemMaxDurability(itemId);
    if (slotId && itemId && maxDurability > 0) {
      result[slotId] = maxDurability;
    }
  }
  return result;
}

function zeroValueForEquipmentSlots(slots) {
  const result = {};
  for (const slotId of Object.keys(objectOrEmpty(slots))) {
    if (slotId) {
      result[slotId] = 0;
    }
  }
  return result;
}

function defaultPetRebirthMmGuide() {
  return {
    status: "available",
    step: "start",
    mm1InstanceId: "",
    targetInstanceId: "",
    schemaVersion: 1,
  };
}

function defaultAutoBattleSettings() {
  return {
    playerFirstRoundAction: "attack",
    playerNormalAction: "attack",
    petFirstRoundSlot: 1,
    petNormalSlot: 1,
    targetMode: "first_living",
    healingEnabled: true,
    playerHpPercent: 45,
    petHpPercent: 45,
    healPriority: ["spirit_moist_1", BATTLE_ITEM_MEAT_SMALL, BATTLE_ITEM_HEAL_SINGLE, "spirit_grace_1", BATTLE_ITEM_HEAL_ALL],
  };
}

function defaultAutoCaptureSettings() {
  return {
    enabled: false,
    targetMode: "all",
    targetFormId: "",
    targetManualText: "",
    hpPercent: 100,
    levelComparator: "=",
    levelValue: 1,
    preferredToolId: BATTLE_CAPTURE_TOOL_EMPTY_HAND,
    noTargetAction: "escape",
    capturePetSkillSlot: 2,
    autoDiscardLowPower: true,
    lowPowerThreshold: 31,
  };
}

function defaultHangSettings() {
  return {
    lowHpStopPercent: 0,
    lowHpAction: "stop",
    resumeAfterHeal: true,
    captureTargetCount: 0,
  };
}

function defaultHangSession() {
  return {
    enabled: false,
    mode: "",
    captureSuccessCount: 0,
    battleCount: 0,
    pendingResume: false,
    lastStopReason: "",
    originMapId: "",
    originCell: [0, 0],
  };
}

function defaultPlayerGrowth() {
  return {
    schemaVersion: 1,
    statPointSources: {
      level_up: 0,
      rebirth: 0,
      quest: 0,
      item: 0,
      gm: 0,
    },
    skillSources: [],
    rebirthGrowth: {
      rebirthCount: 0,
      statBonusPerRebirth: {},
      notes: [],
    },
  };
}

function defaultServerSyncState() {
  return {
    profileRevision: 0,
    lastServerRevision: 0,
    lastLocalSaveAtSec: 0,
    pending: false,
    conflict: false,
    schemaVersion: 1,
  };
}

function profileSummaryForAccount(account, data) {
  const binding = data.profileBindings[account.accountId] || null;
  if (!binding) {
    return null;
  }
  const profileDoc = data.profiles[binding.playerId] || null;
  const hasProfile = Boolean(profileDoc && profileDoc.profile);
  const revision = Number(binding.profileRevision || (profileDoc && profileDoc.profileRevision) || 0);
  return {
    accountId: account.accountId,
    username: account.username,
    displayName: account.displayName,
    playerId: binding.playerId,
    profileRevision: revision,
    storageMode: hasProfile ? "server_document" : "local_shadow",
    serverAuthority: hasProfile ? "profile_document" : "account_binding",
    hasProfile,
    updatedAt: binding.updatedAt,
    schemaVersion: 1,
  };
}

function profileBindingForAccount(data, account, now) {
  let binding = data.profileBindings[account.accountId] || null;
  if (!binding) {
    binding = {
      accountId: account.accountId,
      playerId: `player_${account.accountId.slice(4, 16)}`,
      profileRevision: 0,
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
      schemaVersion: 1,
    };
    data.profileBindings[account.accountId] = binding;
  }
  return binding;
}

function effectiveRoleIsGm(data, account, now) {
  if (!account || account.role !== ROLE_GM) {
    return false;
  }
  const grant = data.gmUserGrants[account.accountId];
  if (!grant || !grant.enabled) {
    return false;
  }
  if (grant.expiresAt && Date.parse(grant.expiresAt) <= now()) {
    return false;
  }
  return true;
}

function commandAllowed(data, accountId, commandId) {
  const grants = Array.isArray(data.gmCommandGrants[accountId]) ? data.gmCommandGrants[accountId] : [];
  return grants.some((grant) => grant.enabled && (grant.commandId === "*" || grant.commandId === commandId));
}

function recordGmAudit(data, username, commandId, okValue, message, now, randomId) {
  const audit = {
    auditId: `audit_${randomId()}`,
    username,
    commandId,
    ok: Boolean(okValue),
    message,
    createdAt: isoNow(now),
    schemaVersion: 1,
  };
  data.gmCommandAudit.push(audit);
  while (data.gmCommandAudit.length > MAX_AUDIT_ROWS) {
    data.gmCommandAudit.shift();
  }
  return audit;
}

function recordAuthEvent(data, type, username, okValue, message, now) {
  data.authEvents.push({
    eventId: `auth_${crypto.randomUUID()}`,
    type,
    username,
    ok: Boolean(okValue),
    message,
    createdAt: isoNow(now),
    schemaVersion: 1,
  });
}

function normalizeServiceEvents(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((event) => event && typeof event === "object" && !Array.isArray(event))
    .map((event) => clone(event))
    .filter((event) => normalizeEventSeq(event.eventSeq) > 0 && String(event.type || "").trim() !== "")
    .sort((a, b) => normalizeEventSeq(a.eventSeq) - normalizeEventSeq(b.eventSeq))
    .slice(-MAX_SERVICE_EVENTS);
}


function normalizeBattleRecords(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((record) => record && typeof record === "object" && !Array.isArray(record))
    .map((record) => {
      const participantAccountIds = Array.isArray(record.participantAccountIds)
        ? record.participantAccountIds.map((entry) => String(entry || "")).filter(Boolean)
        : [];
      const loserAccountIds = Array.isArray(record.loserAccountIds)
        ? record.loserAccountIds.map((entry) => String(entry || "")).filter(Boolean)
        : [];
      const participants = Array.isArray(record.participants)
        ? record.participants
          .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
          .map((entry) => ({
            accountId: String(entry.accountId || ""),
            username: String(entry.username || ""),
            displayName: String(entry.displayName || entry.username || ""),
            role: String(entry.role || ""),
            schemaVersion: 1,
          }))
        : [];
      return {
        recordId: String(record.recordId || ""),
        roomId: String(record.roomId || ""),
        mode: String(record.mode || BATTLE_MODE_DUEL),
        reason: String(record.reason || ""),
        winnerAccountId: String(record.winnerAccountId || ""),
        loserAccountIds,
        closedByAccountId: String(record.closedByAccountId || ""),
        participantAccountIds,
        participants,
        round: Math.max(0, Math.trunc(Number(record.round || 0))),
        turnSeq: Math.max(0, Math.trunc(Number(record.turnSeq || 0))),
        result: record.result && typeof record.result === "object" && !Array.isArray(record.result) ? clone(record.result) : null,
        profileWriteback: record.profileWriteback && typeof record.profileWriteback === "object" && !Array.isArray(record.profileWriteback) ? clone(record.profileWriteback) : null,
        expSummaries: Array.isArray(record.expSummaries)
          ? record.expSummaries
            .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
            .map((entry) => clone(entry))
          : [],
        startedAt: String(record.startedAt || ""),
        endedAt: String(record.endedAt || ""),
        durationSeconds: Math.max(0, Math.trunc(Number(record.durationSeconds || 0))),
        schemaVersion: Math.max(1, Math.trunc(Number(record.schemaVersion || 1))),
      };
    })
    .filter((record) => (
      record.recordId !== "" &&
      record.roomId !== "" &&
      (
        (record.mode === BATTLE_MODE_PARTY_PVE && record.participantAccountIds.length >= 1) ||
        (record.mode !== BATTLE_MODE_PARTY_PVE && record.participantAccountIds.length >= 2)
      )
    ))
    .sort((a, b) => String(a.endedAt || "").localeCompare(String(b.endedAt || "")))
    .slice(-MAX_BATTLE_RECORDS);
}

function normalizeBattleTrace(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
    .map((entry) => ({
      traceId: String(entry.traceId || `battle_trace_${crypto.randomUUID()}`),
      createdAt: String(entry.createdAt || ""),
      type: String(entry.type || ""),
      roomId: String(entry.roomId || ""),
      mode: String(entry.mode || ""),
      status: String(entry.status || ""),
      phase: String(entry.phase || ""),
      round: Math.max(0, Math.trunc(Number(entry.round || 0))),
      turnSeq: Math.max(0, Math.trunc(Number(entry.turnSeq || 0))),
      participantAccountIds: Array.isArray(entry.participantAccountIds)
        ? entry.participantAccountIds.map((accountId) => String(accountId || "")).filter(Boolean)
        : [],
      details: entry.details && typeof entry.details === "object" && !Array.isArray(entry.details) ? clone(entry.details) : {},
      schemaVersion: 1,
    }))
    .filter((entry) => entry.type !== "")
    .slice(-MAX_BATTLE_TRACE_ROWS);
}

function recordBattleStateTrace(data, accountId, payload, now) {
  const room = payload && payload.room && typeof payload.room === "object" && !Array.isArray(payload.room)
    ? payload.room
    : null;
  recordBattleTrace(data, room, "battle_state_query", {
    accountId: String(accountId || ""),
    returnedRoomId: room ? String(room.roomId || "") : "",
    returnedStatus: room ? String(room.status || "") : "",
    returnedClosedRoom: room ? String(room.status || "") === BATTLE_ROOM_CLOSED : false,
  }, now);
}

function recordBattleTrace(data, room, type, details = {}, now = Date.now) {
  if (!data || typeof data !== "object") {
    return null;
  }
  if (!Array.isArray(data.battleTrace)) {
    data.battleTrace = [];
  }
  const battle = room && room.battle && typeof room.battle === "object" && !Array.isArray(room.battle) ? room.battle : {};
  const result = battle.result && typeof battle.result === "object" && !Array.isArray(battle.result) ? battle.result : {};
  const lastEventList = battle.lastEventList && typeof battle.lastEventList === "object" && !Array.isArray(battle.lastEventList)
    ? battle.lastEventList
    : {};
  const profileWriteback = battle.profileWriteback && typeof battle.profileWriteback === "object" && !Array.isArray(battle.profileWriteback)
    ? battle.profileWriteback
    : {};
  const trace = {
    traceId: `battle_trace_${crypto.randomUUID()}`,
    createdAt: isoNow(now),
    type: String(type || ""),
    roomId: String(room && room.roomId || ""),
    mode: String(room && room.mode || ""),
    status: String(room && room.status || ""),
    phase: String(battle.phase || ""),
    round: Math.max(0, Math.trunc(Number(battle.round || 0))),
    turnSeq: Math.max(0, Math.trunc(Number(battle.turnSeq || 0))),
    participantAccountIds: Array.isArray(room && room.participantAccountIds)
      ? room.participantAccountIds.map((accountId) => String(accountId || "")).filter(Boolean)
      : [],
    details: {
      ...clone(details && typeof details === "object" && !Array.isArray(details) ? details : {}),
      resultReason: String(result.reason || room && room.closeReason || ""),
      lastEventRound: Math.max(0, Math.trunc(Number(lastEventList.round || 0))),
      lastEventTurnSeq: Math.max(0, Math.trunc(Number(lastEventList.turnSeq || 0))),
      lastEventCount: Array.isArray(lastEventList.events) ? lastEventList.events.length : 0,
      profileWritebackCount: Array.isArray(profileWriteback.profiles) ? profileWriteback.profiles.length : 0,
      profileExpAmounts: battleTraceProfileExpAmounts(profileWriteback),
    },
    schemaVersion: 1,
  };
  if (trace.type === "") {
    return null;
  }
  data.battleTrace.push(trace);
  while (data.battleTrace.length > MAX_BATTLE_TRACE_ROWS) {
    data.battleTrace.shift();
  }
  if (process.env.BEASTBOUND_BATTLE_TRACE_STDOUT === "1") {
    console.log(`[battle-trace] ${trace.type} room=${trace.roomId} status=${trace.status} round=${trace.round} turn=${trace.turnSeq} details=${JSON.stringify(trace.details)}`);
  }
  return trace;
}

function battleTraceProfileExpAmounts(writeback) {
  const profiles = Array.isArray(writeback && writeback.profiles) ? writeback.profiles : [];
  return profiles
    .map((entry) => ({
      accountId: String(entry && entry.accountId || ""),
      amount: Math.max(0, Math.trunc(Number(entry && entry.exp && entry.exp.amount || 0))),
    }))
    .filter((entry) => entry.accountId !== "");
}

function publicBattleTraceRows(data, account, payload = {}, now = Date.now) {
  const roomId = String(payload.roomId || "").trim();
  const limit = clampInt(payload.limit, 1, 200, 80);
  const accountId = String(account && account.accountId || "");
  const canViewAll = effectiveRoleIsGm(data, account, now);
  return normalizeBattleTrace(data.battleTrace)
    .filter((entry) => {
      if (roomId !== "" && entry.roomId !== roomId) {
        return false;
      }
      return canViewAll || entry.participantAccountIds.includes(accountId) || String(entry.details.accountId || "") === accountId;
    })
    .slice(-limit);
}


function nextServiceEventSeq(data) {
  return normalizeEventSeq(data.serviceEventSeq) + 1;
}

function normalizeEventSeq(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return 0;
  }
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(number));
}

function serviceEventVisibleToAccount(event, accountId) {
  const targetAccountIds = event && Array.isArray(event.targetAccountIds) ? event.targetAccountIds : null;
  if (!targetAccountIds) {
    return true;
  }
  return targetAccountIds.includes(accountId);
}

function serviceEventIsReplayable(event) {
  const type = String(event && event.type || "");
  return type === "chat.message" || type.startsWith("party.") || type.startsWith("battle.");
}

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function normalizeCommandId(commandId) {
  return String(commandId || "").trim().toLowerCase();
}

function normalizeCommandIds(commandIds) {
  const result = [];
  for (const value of commandIds) {
    const commandId = normalizeCommandId(value);
    if (commandId && !result.includes(commandId)) {
      result.push(commandId);
    }
  }
  return result.length > 0 ? result : ["*"];
}

function normalizeMailText(value, maxLength) {
  return String(value || "").trim().replace(/\s+\n/g, "\n").slice(0, maxLength);
}

function normalizeChatChannel(value) {
  const channel = String(value || "").trim().toLowerCase();
  if (channel === CHAT_CHANNEL_NEARBY || channel === CHAT_CHANNEL_TEAM) {
    return channel;
  }
  return "";
}

function normalizeChatText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, CHAT_TEXT_MAX_LENGTH);
}

function normalizePlayerPositionPayload(payload, account, now) {
  const mapId = String(payload.mapId || payload.map || "").trim().slice(0, POSITION_MAP_ID_MAX_LENGTH);
  let facing = String(payload.facing || "south").trim().toLowerCase();
  if (!POSITION_FACING_VALUES.has(facing)) {
    facing = "south";
  }
  return {
    accountId: account.accountId,
    username: account.username,
    displayName: account.displayName,
    mapId,
    cellX: clampInt(payload.cellX ?? payload.x, -9999, 9999, 0),
    cellY: clampInt(payload.cellY ?? payload.y, -9999, 9999, 0),
    facing,
    moving: Boolean(payload.moving),
    updatedAt: isoNow(now),
    schemaVersion: 1,
  };
}

function normalizeMovementStepPayload(payload = {}, currentPosition = {}) {
  const fallbackCellX = Number(currentPosition.cellX || 0);
  const fallbackCellY = Number(currentPosition.cellY || 0);
  return {
    mapId: String(payload.mapId || payload.toMapId || currentPosition.mapId || "").trim().slice(0, POSITION_MAP_ID_MAX_LENGTH),
    fromCellX: clampInt(payload.fromCellX ?? payload.fromX, -9999, 9999, fallbackCellX),
    fromCellY: clampInt(payload.fromCellY ?? payload.fromY, -9999, 9999, fallbackCellY),
    toCellX: clampInt(payload.toCellX ?? payload.targetCellX ?? payload.cellX ?? payload.x, -9999, 9999, fallbackCellX),
    toCellY: clampInt(payload.toCellY ?? payload.targetCellY ?? payload.cellY ?? payload.y, -9999, 9999, fallbackCellY),
  };
}

function normalizeMovementFacing(facing, step) {
  const explicitFacing = String(facing || "").trim().toLowerCase();
  if (POSITION_FACING_VALUES.has(explicitFacing)) {
    return explicitFacing;
  }
  const dx = Math.sign(Number(step.toCellX || 0) - Number(step.fromCellX || 0));
  const dy = Math.sign(Number(step.toCellY || 0) - Number(step.fromCellY || 0));
  if (dx > 0 && dy < 0) {
    return "northeast";
  }
  if (dx > 0 && dy > 0) {
    return "southeast";
  }
  if (dx < 0 && dy > 0) {
    return "southwest";
  }
  if (dx < 0 && dy < 0) {
    return "northwest";
  }
  if (dx > 0) {
    return "east";
  }
  if (dx < 0) {
    return "west";
  }
  if (dy < 0) {
    return "north";
  }
  return "south";
}

function clampInt(value, minValue, maxValue, fallbackValue) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallbackValue;
  }
  return Math.max(minValue, Math.min(maxValue, Math.trunc(number)));
}

function isValidUsername(username) {
  return (
    username.length >= USERNAME_MIN_LENGTH &&
    username.length <= USERNAME_MAX_LENGTH &&
    /^[a-z0-9_]+$/.test(username)
  );
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), String(salt), 32).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function isoNow(now) {
  return new Date(now()).toISOString();
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function ok(payload = {}) {
  return {"ok": true, ...payload};
}

function fail(code, message, extra = {}) {
  return {"ok": false, code, message, ...extra};
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  ROLE_PLAYER,
  ROLE_GM,
  createAuthService,
  createMemoryAuthStore,
  createJsonAuthStore,
  normalizeUsername,
  isValidUsername,
};
