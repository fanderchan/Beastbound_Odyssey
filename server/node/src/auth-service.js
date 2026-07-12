"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {isDeepStrictEqual} = require("node:util");
const {createDurableMutationCoordinator} = require("./auth/durable-mutation-coordinator");
const {
  RUNTIME_ROOT_FIELDS,
  DURABLE_RECEIPT_TTL_MS,
  DURABLE_OPERATION_ID_PATTERN,
  DURABLE_REQUEST_HASH_PATTERN,
  DURABLE_RECEIPT_EXCLUDED_METHODS,
  durableBusinessChanged,
  restorePublishedPersistentData,
  mergeRuntimeObject,
  normalizeDurableMutationReceipts,
  activeDurableReceipt,
  pruneDurableMutationReceipts,
  durableCommitResult,
  durableReceiptReplayResult,
  durableMutationAccountId,
  durableMutationToken,
} = require("./auth/durable-mutation-state");
const {createProfileActionsDomain} = require("./auth/profile-actions");
const {createQuestDomain} = require("./auth/quest");
const {createMailChatDomain} = require("./auth/mail-chat");
const {createPartyDomain} = require("./auth/party");
const {createBattleRoomDomain} = require("./auth/battle-room");
const {createEconomyDomain} = require("./auth/economy");
const {
  BANK_PROFILE_SCHEMA_VERSION,
  readBankProfileState,
} = require("./auth/bank-profile-state");
const {createGmPetsDomain} = require("./auth/gm-pets");
const {createOfflineHangDomain} = require("./auth/offline-hang");
const {CURRENT_PROFILE_SCHEMA_VERSION} = require("./auth/profile-migrations");
const {
  generatePetCultivationRollSeed,
} = require("./auth/pet-private-state");
const {loadPetGrowthCatalog} = require("./auth/pet-growth-catalog");
const {loadPlayerLevelRuntime} = require("./auth/player-level-runtime");
const {quantize: quantizePetGrowth} = require("./auth/pet-growth-authority");
const {createNewPetFactory} = require("./auth/new-pet-factory");
const {createPetCaptureCandidateAuthority} = require("./auth/pet-capture-candidate-authority");
const {scaledForRecipientLevel: authoritativeScaledBattleExpForRecipientLevel} = require("./auth/battle-exp-catalog");
const {createPetEncounterAuthority, zoneContainsCell} = require("./auth/pet-encounter-authority");
const {createPetEncounterPermitAuthority} = require("./auth/pet-encounter-permit-authority");
const {createManualEncounterAccess} = require("./auth/manual-encounter-access");
const {loadBattlePassiveCatalog} = require("./auth/battle-passive-catalog");
const {createBattleActorRules} = require("./auth/battle-actor-rules");
const {createBattleRandomAuthority} = require("./auth/battle-random-authority");
const {
  resolveCounterTrigger,
  resolveDamageReaction,
} = require("./auth/battle-reaction-resolver");
const {counterDamageFor} = require("./auth/battle-reaction-rules");
const {
  freezeStatusSourceCredit,
  publicBattleStatus,
  publicBattleStatuses,
  resolveStatusHit,
  statusSourceActor,
} = require("./auth/battle-status-rules");
const {
  activeRideFacts,
  resolveRideDamageShare,
  resolveRidingBattleStats,
} = require("./auth/battle-riding-rules");
const {
  resolveConfusionTarget,
} = require("./auth/battle-control-rules");
const {
  applyEquipmentWearUsageToProfile,
  equipmentWearRulesFromDocument,
  loadBattleEquipmentCatalog,
  resolveEquipmentBattleStats,
} = require("./auth/battle-equipment-rules");
const {
  EQUIPMENT_SLOTS_VERSION,
  auditEquipmentProfileState,
  consumeBackpackEquipmentInstances,
  firstEquipmentTransferEntry,
  grantFreshBackpackEquipmentInstances,
  isEquipmentItemId: catalogHasEquipmentItemId,
  moveBackpackEquipmentInstanceToSlot,
  moveEquippedEquipmentInstanceToBackpack,
  readEquipmentInstanceState,
  requireEquippedEquipmentInstance,
} = require("./auth/equipment-profile-state");
const {publicEquipmentTransferSummary} = require("./auth/equipment-transfer-envelope");
const {
  createEquipmentEnvelopeOwnershipRegistry,
} = require("./auth/equipment-envelope-registry");
const {
  backfillConsumedEquipmentEnvelopeLedger,
} = require("./auth/equipment-envelope-consumed-ledger");
const {
  comboDamageFor,
  loadBattleCombatFormula,
  resolvePhysicalDamage,
} = require("./auth/battle-combat-formula");
const {
  equippedPetSkillIds,
  normalizePetSkillSlots,
} = require("./auth/pet-skill-loadout");
const {
  createPetExpSettlement,
  publicPetExpSettlementFailure,
} = require("./auth/pet-exp-settlement");
const {
  createPetRebirthGrowthCycle,
  publicPetRebirthGrowthCycleFailure,
} = require("./auth/pet-rebirth-growth-cycle");
const {publicPet, publicProfile} = require("./auth/profile-visibility");
const {
  createFamilyManorDomain,
  familyOwnsManor,
  settleManorWarFromBattleRoomResult,
} = require("./auth/family-manor");

const playerLevelRuntime = loadPlayerLevelRuntime();
const battleEquipmentCatalog = loadBattleEquipmentCatalog();
const authoritativeBattleCombatFormula = loadBattleCombatFormula();

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 20;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_POLICY_VERSION = 2;
const ROLE_PLAYER = "player";
const ROLE_GM = "gm";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_REFRESH_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_REPLACED_CODE = "session_replaced";
const SESSION_REPLACED_MESSAGE = "你的账号已在其他地方登录，你已被踢出游戏。";
const AUTH_RATE_WINDOW_MS = 60 * 1000;
const AUTH_RATE_MAX_ATTEMPTS = 12;
const AUTH_FAILURE_WINDOW_MS = 10 * 60 * 1000;
const AUTH_FAILURE_BACKOFF_START = 5;
const AUTH_FAILURE_BACKOFF_BASE_MS = 30 * 1000;
const AUTH_FAILURE_BACKOFF_MAX_MS = 5 * 60 * 1000;
const MAX_AUDIT_ROWS = 500;
const MAX_PLAYER_SEARCH_RESULTS = 12;
const MAX_SERVICE_EVENTS = 500;
const MAX_BATTLE_RECORDS = 10000;
const MAX_BATTLE_TRACE_ROWS = 1200;
const MAIL_TITLE_MAX_LENGTH = 40;
const MAIL_BODY_MAX_LENGTH = 500;
const PROFILE_STONE_COIN_LIMIT = 10000000;
const BANK_STONE_COIN_LIMIT = 100000000;
const BANK_TAB_COUNT = 6;
const BANK_SLOTS_PER_TAB = 15;
const BANK_SLOT_LIMIT = BANK_TAB_COUNT * BANK_SLOTS_PER_TAB;
const BANK_DEFAULT_UNLOCKED_TABS = 1;
const BANK_UNLOCK_COSTS = [100, 200, 400, 800, 1600];
const PARTY_MAX_MEMBERS = 5;
const CHAT_CHANNEL_NEARBY = "nearby";
const CHAT_CHANNEL_TEAM = "team";
const CHAT_TEXT_MAX_LENGTH = 120;
const CHAT_HISTORY_LIMIT = 50;
const MAX_CHAT_MESSAGES = 500;
const ONLINE_SESSION_IDLE_TTL_MS = 25 * 1000;
const POSITION_MAP_ID_MAX_LENGTH = 64;
const POSITION_FACING_VALUES = new Set(["east", "southeast", "south", "southwest", "west", "northwest", "north", "northeast"]);
const ONLINE_AOI_SCOPE = "aoi";
const ONLINE_MAP_SCOPE = "map";
const ONLINE_AOI_DEFAULT_RADIUS = 18;
const ONLINE_AOI_MAX_RADIUS = 48;
const ONLINE_PLAYERS_RESPONSE_LIMIT = 64;
const MOVEMENT_MAX_STEP_CELLS = 1;
const MOVEMENT_STEP_RATE_INTERVAL_MS = 100;
const MOVEMENT_STEP_RATE_BURST = 4;
const POSITION_SPAWN_TOLERANCE_CELLS = 1;
const POSITION_WARP_PROXIMITY_CELLS = 4;
const QUEST_TALK_PROXIMITY_CELLS = 3;
const QUEST_EVENT_CLIENT_REPORTABLE_TYPES = new Set(["talk", "open_feature"]);
const QUEST_TUTORIAL_FEATURE_IDS = new Set(["status", "equipment", "codex", "quest", "map", "family", "auto_settings", "account"]);
const QUEST_SET_BATTLE_PET_ID = "quest_set_battle_pet";
const BATTLE_PET_TUTORIAL_FORM_ID = "bui_novice_sprout_earth5_wind5";
const BATTLE_PET_TUTORIAL_COMPATIBLE_FORM_IDS = new Set([
  BATTLE_PET_TUTORIAL_FORM_ID,
  "rebirth_starter_four_spirit_cub",
]);
const QUEST_OPEN_STATUS_PANEL_ID = "quest_open_status_panel";
const ITEM_BINDING_UNBOUND = "unbound";
const ITEM_BINDING_BOUND = "bound";
const PARTY_OFFLINE_AUTO_KICK_MS = 10 * 60 * 1000;
const BATTLE_ROOM_ENTRY_MAX_DISTANCE = 4;
const BATTLE_MODE_DUEL = "duel";
const BATTLE_MODE_PARTY_PVE = "party_pve";
const BATTLE_MODE_MANOR_WAR = "manor_war";
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
const BATTLE_ACTION_RUN = "run";
const BATTLE_ACTION_TRAINING_PARTNER_HEAL = "training_partner_heal";
const TRAINING_PARTNER_HEAL_SPIRIT_ID = "spirit_moist_1";
const TRAINING_PARTNER_HEAL_LOW_HP_RATIO = 0.40;
const TRAINING_PARTNER_HEAL_AMOUNT_RATIO = 0.25;
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
const BATTLE_PLAYER_COMBO_BASE_RATE = 0.50;
const BATTLE_MONSTER_COMBO_BASE_RATE = 0.20;
const BATTLE_EVENT_CONTRACT_VERSION = 3;
const BATTLE_TARGET_RULE_SLOT_ORDER = "slot_order";
const BATTLE_TARGET_RULE_REVERSE_SLOT_ORDER = "reverse_slot_order";
const BATTLE_TARGET_RULE_WILD_RANDOM = "wild_random";
const BATTLE_TARGET_RULE_CONFUSION_SAME_SIDE = "confusion_same_side";
const BATTLE_INVITE_TTL_MS = 2 * 60 * 1000;
const BATTLE_COMMAND_TIMEOUT_MS = 99 * 1000;
const BATTLE_TURN_PLAYBACK_GRACE_MS = 30 * 1000;
const BATTLE_PARTY_PVE_OFFLINE_ESCAPE_MS = 30 * 1000;
const BATTLE_RECONNECT_GRACE_MS = 300 * 1000;
const BATTLE_RECONNECT_COMMAND_GRACE_MS = 15 * 1000;
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
const ABILITY_RIDING = "riding";
const RIDE_SKILL_LEVEL_CAP = 200;
const BATTLE_PET_STORAGE_LIMIT = 20;
const BATTLE_CAPTURE_TOOL_EMPTY_HAND = "empty_hand";
const BATTLE_CAPTURE_TOOL_POISON_WULI_NET = "capture_poison_wuli_net";
const TAME_ELIGIBLE_EGG_ITEM_IDS = new Set(["novice_battle_pet_egg", "novice_tiger_egg"]);
const BATTLE_PARTY_PVE_PLAYER_SLOTS = [3, 4, 2, 5, 1];
const BATTLE_PARTY_PVE_PARTNER_SLOTS = [1, 2, 4, 5];
const TRAINING_PARTNER_MAX_COUNT = BATTLE_PARTY_PVE_PARTNER_SLOTS.length;
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
const DEFAULT_DIAMONDS = 0;
const DEV_DIAMONDS_GRANT_VERSION = 0;
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
const PET_REBIRTH_MM_GUIDE_REQUIRED_LEVEL = 80;
const PET_REBIRTH_MM_GUIDE_RECOMMENDED_LEVEL = 130;
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
  "bank_unlock_tab",
  "backpack_move_stack",
  "backpack_split_stack",
  "backpack_discard_item",
  "battle_pet_tutorial_egg_reclaim",
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
const BATTLE_LOCKED_SERVICE_MUTATIONS = new Set([
  "saveProfile",
  "profileAction",
  "startHangSession",
  "startOfflineHang",
  "playerRebirth",
  "questRecord",
  "questClaim",
  "shopTransaction",
  "equipmentEquip",
  "equipmentUnequip",
  "equipmentEnhance",
  "equipmentRepairAll",
  "equipmentSynthesize",
  "bankDeposit",
  "bankWithdraw",
  "createMarketListing",
  "buyMarketListing",
  "cancelMarketListing",
  "proposeTrade",
  "acceptTrade",
  "cancelTrade",
  "sendMail",
  "claimMailAttachments",
  "grantGmPet",
  "levelUpGmPet",
]);
const OFFLINE_HANG_LOCKED_SERVICE_MUTATIONS = new Set([
  ...BATTLE_LOCKED_SERVICE_MUTATIONS,
  "stopHangSession",
  "updatePlayerPosition",
  "movePlayerStep",
  "inviteToParty",
  "applyToParty",
  "acceptPartyInvite",
  "declinePartyInvite",
  "leaveParty",
  "createFamily",
  "joinFamily",
  "leaveFamily",
  "challengeManor",
  "startManorWarBattleRoom",
  "enterManorWar",
  "leaveManorWar",
  "resolveManorWar",
  "sendChatMessage",
  "markMailRead",
  "inviteToBattle",
  "acceptBattleInvite",
  "startPartyEncounter",
  "declineBattleInvite",
  "cancelBattleInvite",
  "leaveBattleRoom",
  "submitBattleCommand",
]);
const PLAYER_REBIRTH_COUNT_KEY = "rebirthCount";
const PLAYER_REBIRTH_HISTORY_KEY = "rebirthHistory";
const PLAYER_REBIRTH_QUEST_COMPLETIONS_KEY = "rebirthQuestCompletions";
const PLAYER_REBIRTH_TRIAL_PROOFS_KEY = "rebirthTrialProofs";
const QUALIFICATION_BATTLE_CLAIMS_KEY = "qualificationBattleClaims";
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
  // QA/联调专用逃生口：只允许在本地测试服务器上放开位置校验，正式运行必须保持严格。
  const allowPositionTeleport = Boolean(
    options.allowPositionTeleport ?? (process.env.BEASTBOUND_ALLOW_POSITION_TELEPORT === "1")
  );
  // 整档写入闸门：saveProfile 只留给测试/seed/运维脚本显式开启，生产服务默认拒绝整档覆盖。
  const allowFullProfileSave = Boolean(
    options.allowFullProfileSave ?? (process.env.BEASTBOUND_ALLOW_PROFILE_SAVE === "1")
  );
  // 仅测试夹具可跳过首次记录点播种；没有环境变量或 HTTP 开关，正式服务始终从角色记录点恢复。
  const allowInitialPositionSeedForTests = Boolean(options.allowInitialPositionSeedForTests);
  const allowHangOriginWithoutPositionForTests = Boolean(options.allowHangOriginWithoutPositionForTests);
  const petGrowthCatalog = options.petGrowthCatalog || loadPetGrowthCatalog();
  // P0.4 以严格目录启动，并在 actor 进入房间时一次性派生被动事实；缺档禁止静默退化。
  const battlePassiveCatalog = options.battlePassiveCatalog || loadBattlePassiveCatalog();
  const battleActorRules = options.battleActorRules || createBattleActorRules({
    passiveCatalog: battlePassiveCatalog,
    templateResolver: petTemplateForFormId,
  });
  const battleRandomAuthority = options.battleRandomAuthority || createBattleRandomAuthority();
  const newPetFactory = createNewPetFactory({growthCatalog: petGrowthCatalog});
  const petCaptureCandidateAuthority = options.petCaptureCandidateAuthority || createPetCaptureCandidateAuthority({
    growthCatalog: petGrowthCatalog,
    newPetFactory,
    templateResolver: petTemplateForFormId,
    expToNextLevel: battleExpToNextLevel,
    randomBytes,
  });
  const petEncounterAuthority = options.petEncounterAuthority || createPetEncounterAuthority();
  const petEncounterPermitAuthority = options.petEncounterPermitAuthority || createPetEncounterPermitAuthority({
    catalog: petEncounterAuthority.catalog,
    now,
    randomBytes,
  });
  const manualEncounterAccess = options.manualEncounterAccess || createManualEncounterAccess({
    catalog: petEncounterAuthority.catalog,
    rebirthTrials: rebirthTrialDocument(),
    qualificationClaimsKey: QUALIFICATION_BATTLE_CLAIMS_KEY,
    finalProofId: PLAYER_REBIRTH_FINAL_BOSS_PROOF_ID,
    mmTrialInteractionId: "firebud_pet_mm_trial_mentor",
    profileLevel: (profile) => questPlayerLevel(profile),
    profileRebirthCycle: (profile) => Math.max(0, Math.trunc(Number(profile && profile[PLAYER_REBIRTH_COUNT_KEY] || 0))),
    backpackItemCount: (profile, itemId) => backpackItemCount(profileBackpackSlots(profile), itemId),
    storageItemCount: (profile, itemId) => profileBankItemCount(profile, itemId),
    canReceiveItem: (profile, itemId, count) => addRewardItemsToBackpack(
      profileBackpackSlots(profile),
      [{itemId, count}],
    ).lostItems.length === 0,
    canReceivePet: (profile) => (
      profilePartyVisiblePetCount(profile) < BATTLE_PET_MAX_PER_PARTICIPANT ||
      profileStoragePetCount(profile) < BATTLE_PET_STORAGE_LIMIT
    ),
    mmTrialAccess: (profile) => petRebirthMmTrialAccess(profile),
  });
  const petRebirthGrowthCycle = options.petRebirthGrowthCycle || createPetRebirthGrowthCycle({
    growthCatalog: petGrowthCatalog,
  });
  // 协议 v2 只公开安全成长投影；所有宠物经验入口在同一原子切换中启用权威成长。
  const petExpSettlement = createPetExpSettlement({
    growthCatalog: petGrowthCatalog,
    calculateAward: battleAwardExpEntry,
    enableAuthorityV1: true,
  });
  const battleVictoryRewardResolver = typeof options.battleVictoryRewardResolver === "function"
    ? options.battleVictoryRewardResolver
    : battleVictoryRewardForRoom;
  const serviceEventListeners = new Set();
  const authAttemptState = new Map();
  const movementStepRateByAccountId = new Map();
  const runtimeActiveSessionIds = new Map();
  const serverStartedAtMs = now();
  const asyncWriteStore = Boolean(store && (store.asyncWrites === true || String(store.mode || "").startsWith("async:")));
  const durableMutationCoordinator = options.durableMutationCoordinator || createDurableMutationCoordinator({
    maxPending: options.durableMutationMaxPending,
    responseTimeoutMs: options.durableCommitTimeoutMs,
  });
  let cachedData = null;
  let lastPublishedPersistentData = null;
  let activeDurableMutation = null;
  let battleMaintenanceTimer = null;
  let durableAdmissionsStopped = false;
  let durableDrainPromise = null;

  function load() {
    if (activeDurableMutation) {
      return activeDurableMutation.data;
    }
    if (!cachedData) {
      cachedData = normalizeData(store.load());
      cachedData.playerPositions = {};
      cachedData.battleInvites = {};
      cachedData.battleRooms = {};
      cachedData.tradeOffers = {};
      lastPublishedPersistentData = persistentDataForStore(cachedData);
    }
    return cachedData;
  }

  function save(data) {
    const normalized = normalizeData(data);
    if (activeDurableMutation) {
      activeDurableMutation.data = normalized;
      activeDurableMutation.saveRequested = true;
      return null;
    }
    if (asyncWriteStore) {
      // Production async stores may only be mutated through invokeDurable().
      // Most domains edit load()'s object in place, so rebuild the published
      // root before throwing to prevent an uncovered caller from leaking an
      // uncommitted asset mutation into later requests.
      cachedData = restorePublishedPersistentData(normalized, lastPublishedPersistentData, {normalizeData});
      const error = new Error("异步持久化写入缺少 durable 请求边界。");
      error.code = "durable_context_required";
      throw error;
    }
    const pendingSaveError = typeof store.lastSaveError === "function" ? store.lastSaveError() : null;
    if (pendingSaveError) {
      if (typeof store.clearSaveError === "function") {
        store.clearSaveError();
      }
      // 用最新内存快照重试持久化：后端恢复后自动补齐整份状态；本次请求以 503 拒绝，禁止继续静默丢写。
      store.save(persistentDataForStore(normalized));
      const error = new Error("服务器存档暂时不可用，请稍后再试。");
      error.code = "storage_write_failed";
      error.cause = pendingSaveError;
      throw error;
    }
    store.save(persistentDataForStore(normalized));
    cachedData = normalized;
    lastPublishedPersistentData = persistentDataForStore(cachedData);
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
    if (activeDurableMutation) {
      activeDurableMutation.events.push(clone(payload));
    } else {
      publishServiceEvent(payload);
    }
  }

  function publishServiceEvent(payload) {
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

  function markRuntimeSession(session) {
    if (session && session.sessionId) {
      markRuntimeSessionActive(runtimeActiveSessionIds, session.sessionId, now());
    }
  }

  function resolveServiceSession(data, token, options = {}) {
    return resolveSession(data, token, now, {
      ...options,
      runtimeActiveSessionIds,
      serverStartedAtMs,
    });
  }

  function partyPresenceUpdateEventForAccount(data, accountId) {
    const accountParty = partyForAccount(data, accountId);
    if (!accountParty) {
      return null;
    }
    const partyId = accountParty.partyId;
    const refreshed = refreshPartyPresence(data, accountParty, now, runtimeActiveSessionIds);
    if (!refreshed.changed) {
      return null;
    }
    return {
      type: "party.update",
      targetAccountIds: refreshed.targetAccountIds,
      party: refreshed.party ? publicParty(refreshed.party, data, {now, runtimeActiveSessionIds}) : null,
      partyId,
      removedAccountIds: refreshed.removedAccountIds,
    };
  }

  function register(payload = {}) {
    const username = normalizeUsername(payload.username);
    const password = String(payload.password || "");
    const displayName = String(payload.displayName || "").trim() || username;
    const authGate = checkAuthAttemptGate(authAttemptState, "register", username, payload, now);
    if (!authGate.ok) {
      return authGate;
    }
    if (!isValidUsername(username)) {
      recordAuthAttemptResult(authAttemptState, authGate.authAttemptKey, false, now);
      return fail("invalid_username", "账号只能使用3-20位小写字母、数字或下划线。");
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      recordAuthAttemptResult(authAttemptState, authGate.authAttemptKey, false, now);
      return fail("weak_password", "密码至少需要8位。");
    }
    const data = load();
    if (data.accounts[username]) {
      recordAuthEvent(data, "register_denied", username, false, "账号已存在。", now);
      save(data);
      recordAuthAttemptResult(authAttemptState, authGate.authAttemptKey, false, now);
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
      passwordPolicyVersion: PASSWORD_POLICY_VERSION,
      passwordUpdatedAt: isoNow(now),
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
    markRuntimeSession(sessionResult.session);
    save(data);
    recordAuthAttemptResult(authAttemptState, authGate.authAttemptKey, true, now);
    return ok({
      account: publicAccount(account),
      session: publicSession(sessionResult.session, account, data, sessionResult.token),
      profileBinding: data.profileBindings[accountId],
      profileSummary: profileSummaryForAccount(account, data),
      runtimePosition: publicRuntimePositionForAccount(data, accountId),
    });
  }

  function login(payload = {}) {
    const username = normalizeUsername(payload.username);
    const password = String(payload.password || "");
    const authGate = checkAuthAttemptGate(authAttemptState, "login", username, payload, now);
    if (!authGate.ok) {
      return authGate;
    }
    const data = load();
    const account = data.accounts[username];
    if (!account) {
      recordAuthEvent(data, "login_denied", username, false, "账号不存在。", now);
      save(data);
      recordAuthAttemptResult(authAttemptState, authGate.authAttemptKey, false, now);
      return fail("account_missing", "账号不存在。");
    }
    if (hashPassword(password, account.passwordSalt) !== account.passwordHash) {
      recordAuthEvent(data, "login_denied", username, false, "密码不正确。", now);
      save(data);
      recordAuthAttemptResult(authAttemptState, authGate.authAttemptKey, false, now);
      return fail("wrong_password", "密码不正确。");
    }
    const ensured = ensureProfileForAccount(data, account, now);
    const sessionResult = createSessionForAccount(data, account, now, randomBytes);
    const replacement = revokeOtherSessionsForAccount(data, account.accountId, sessionResult.session.sessionId, now, runtimeActiveSessionIds);
    movementStepRateByAccountId.delete(account.accountId);
    invalidateEncounterPermitForAccount(account.accountId, "session_replaced");
    markRuntimeSession(sessionResult.session);
    recordAuthEvent(data, "login", username, true, "", now);
    if (replacement.revokedSessions.length > 0) {
      recordAuthEvent(data, "session_replaced", username, true, `${replacement.revokedSessions.length} old session(s) revoked.`, now);
    }
    const partyPresenceEvent = partyPresenceUpdateEventForAccount(data, account.accountId);
    const replacementEvent = sessionReplacementEvent(account, sessionResult.session, replacement.revokedSessions);
    save(data);
    if (replacementEvent) {
      emitServiceEvent(replacementEvent);
    }
    if (partyPresenceEvent) {
      emitServiceEvent(partyPresenceEvent);
    }
    recordAuthAttemptResult(authAttemptState, authGate.authAttemptKey, true, now);
    return ok({
      account: publicAccount(account),
      session: publicSession(sessionResult.session, account, data, sessionResult.token),
      profileBinding: ensured.binding,
      profileSummary: profileSummaryForAccount(account, data),
      runtimePosition: publicRuntimePositionForAccount(data, account.accountId),
    });
  }

  function refreshSession(token) {
    const data = load();
    const resolved = resolveServiceSession(data, token, {
      allowExpired: true,
      refreshGraceMs: SESSION_REFRESH_GRACE_MS,
    });
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const sessionResult = createSessionForAccount(data, resolved.account, now, randomBytes);
    resolved.session.revokedAt = isoNow(now);
    const replacement = revokeOtherSessionsForAccount(data, resolved.account.accountId, sessionResult.session.sessionId, now, runtimeActiveSessionIds);
    movementStepRateByAccountId.delete(resolved.account.accountId);
    invalidateEncounterPermitForAccount(resolved.account.accountId, "session_refreshed");
    markRuntimeSession(sessionResult.session);
    const ensured = ensureProfileForAccount(data, resolved.account, now);
    recordAuthEvent(data, "session_refresh", resolved.account.username, true, "", now);
    if (replacement.revokedSessions.length > 0) {
      recordAuthEvent(data, "session_replaced", resolved.account.username, true, `${replacement.revokedSessions.length} old session(s) revoked.`, now);
    }
    const partyPresenceEvent = partyPresenceUpdateEventForAccount(data, resolved.account.accountId);
    const replacementEvent = sessionReplacementEvent(resolved.account, sessionResult.session, replacement.revokedSessions);
    save(data);
    if (replacementEvent) {
      emitServiceEvent(replacementEvent);
    }
    if (partyPresenceEvent) {
      emitServiceEvent(partyPresenceEvent);
    }
    return ok({
      account: publicAccount(resolved.account),
      session: publicSession(sessionResult.session, resolved.account, data, sessionResult.token),
      profileBinding: ensured.binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      runtimePosition: publicRuntimePositionForAccount(data, resolved.account.accountId),
    });
  }

  function logout(token) {
    const data = load();
    const resolved = resolveServiceSession(data, token);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const partyRemoval = removeAccountFromParty(data, resolved.account.accountId, now);
    clearRuntimeSessionsForAccount(data, resolved.account.accountId, runtimeActiveSessionIds);
    movementStepRateByAccountId.delete(resolved.account.accountId);
    invalidateEncounterPermitForAccount(resolved.account.accountId, "logout");
    resolved.session.revokedAt = isoNow(now);
    recordAuthEvent(data, "logout", resolved.account.username, true, "", now);
    save(data);
    if (partyRemoval.changed) {
      emitServiceEvent({
        type: "party.update",
        targetAccountIds: partyRemoval.targetAccountIds,
        party: partyRemoval.party ? publicParty(partyRemoval.party, data, {now, runtimeActiveSessionIds}) : null,
        partyId: partyRemoval.partyId,
        removedAccountIds: partyRemoval.removedAccountIds,
      });
    }
    return ok({"message": "已退出登录。"});
  }

  function getSession(token) {
    const data = load();
    const resolved = resolveServiceSession(data, token);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const ensured = ensureProfileForAccount(data, resolved.account, now);
    const partyPresenceEvent = partyPresenceUpdateEventForAccount(data, resolved.account.accountId);
    if (ensured.created || partyPresenceEvent) {
      save(data);
    }
    if (partyPresenceEvent) {
      emitServiceEvent(partyPresenceEvent);
    }
    return ok({
      account: publicAccount(resolved.account),
      session: publicSession(resolved.session, resolved.account, data, "", {"recovered": resolved.recovered}),
      profileBinding: ensured.binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      recovery: sessionRecoveryPayload(data, resolved.account, resolved.recovered),
      runtimePosition: publicRuntimePositionForAccount(data, resolved.account.accountId),
    });
  }

  function getProfile(token) {
    const data = load();
    const resolved = resolveServiceSession(data, token);
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
    if (!allowFullProfileSave) {
      return fail("profile_upload_denied", "角色档案由服务器专用接口写入，禁止整档上传。");
    }
    const data = load();
    const resolved = resolveServiceSession(data, token);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const profile = payload.profile;
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      return fail("invalid_profile", "角色档案必须是对象。");
    }
    const backpackConflict = rawBackpackAssetConflict(profile);
    if (backpackConflict) {
      return fail(backpackConflict.code, backpackConflict.message);
    }
    const bankConflict = rawProfileBankAssetConflict(profile.bank);
    if (bankConflict) {
      return fail(bankConflict.code, bankConflict.message);
    }
    const equipmentAudit = fullSaveEquipmentAuditConflict(profile);
    if (equipmentAudit) {
      return fail(equipmentAudit.code, equipmentAudit.message);
    }
    // 整档写入只用于 QA/运维，但仍必须先在候选快照中完成全局托管归属审计。
    // 避免先改 cachedData 再发现冲突，导致失败请求污染后续权威状态。
    const candidateData = clone(data);
    const binding = profileBindingForAccount(candidateData, resolved.account, now);
    const currentProfileDoc = candidateData.profiles[binding.playerId] || null;
    if (currentProfileDoc && currentProfileDoc.profile) {
      const currentBackpackConflict = rawBackpackAssetConflict(currentProfileDoc.profile);
      if (currentBackpackConflict) {
        return fail(currentBackpackConflict.code, currentBackpackConflict.message, {
          profileBinding: binding,
          profileSummary: profileSummaryForAccount(resolved.account, candidateData),
        });
      }
      const currentBankConflict = rawProfileBankAssetConflict(currentProfileDoc.profile.bank);
      if (currentBankConflict) {
        return fail(currentBankConflict.code, currentBankConflict.message, {
          profileBinding: binding,
          profileSummary: profileSummaryForAccount(resolved.account, candidateData),
        });
      }
      const currentEquipmentAudit = fullSaveEquipmentAuditConflict(currentProfileDoc.profile);
      if (currentEquipmentAudit) {
        return fail(currentEquipmentAudit.code, currentEquipmentAudit.message, {
          profileBinding: binding,
          profileSummary: profileSummaryForAccount(resolved.account, candidateData),
        });
      }
    }
    const currentRevision = Number(binding.profileRevision || 0);
    const expectedRevision = Number(payload.expectedRevision || 0);
    if (expectedRevision !== currentRevision) {
      return fail("revision_conflict", "服务器档案已更新，请重新登录或重新拉取档案。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, candidateData),
      });
    }
    const nextRevision = currentRevision + 1;
    binding.profileRevision = nextRevision;
    binding.updatedAt = isoNow(now);
    candidateData.profileBindings[resolved.account.accountId] = binding;
    const storedProfile = clone(profile);
    synchronizeProfileEquipmentStats(storedProfile);
    candidateData.profiles[binding.playerId] = {
      playerId: binding.playerId,
      accountId: resolved.account.accountId,
      profileRevision: nextRevision,
      profile: storedProfile,
      updatedAt: binding.updatedAt,
      schemaVersion: 1,
    };
    const candidateEnvelopeRegistry = createEquipmentEnvelopeOwnershipRegistry(candidateData);
    if (candidateEnvelopeRegistry.conflicts.length > 0) {
      return equipmentEnvelopeRegistryMutationFailure(candidateEnvelopeRegistry.conflicts[0]);
    }
    save(candidateData);
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: binding,
      profileSummary: profileSummaryForAccount(resolved.account, candidateData),
      message: "角色档案已同步。",
    });
  }

  function shopTransaction(token, payload = {}) {
    const data = load();
    const resolved = resolveServiceSession(data, token);
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
    const access = shopAccessFor(shopId);
    const accessCheck = shopAccessCheck(data, resolved.account, access);
    if (!accessCheck.ok) {
      return fail(accessCheck.code, accessCheck.message, accessCheck.extra || {});
    }
    const binding = profileBindingForAccount(data, resolved.account, now);
    const profileDoc = data.profiles[binding.playerId] || null;
    if (!profileDoc || !profileDoc.profile || typeof profileDoc.profile !== "object" || Array.isArray(profileDoc.profile)) {
      return fail("profile_missing", "请先创建角色档案。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const backpackConflict = rawBackpackAssetConflict(profileDoc.profile);
    if (backpackConflict) {
      return fail(backpackConflict.code, backpackConflict.message, {
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
      const instanceGrant = grantFreshBackpackEquipmentInstances(
        profile,
        battleEquipmentCatalog,
        [{itemId, count: amount}],
        "shop",
        {expToNextLevel: battleExpToNextLevel},
      );
      if (!instanceGrant.ok) {
        return fail(instanceGrant.code, instanceGrant.message);
      }
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
      if (currency === SHOP_CURRENCY_STONE_COINS && profileCurrencyAmount(profile, currency) + totalPrice > PROFILE_STONE_COIN_LIMIT) {
        return fail("wallet_stone_coin_limit", "身上石币已达上限，请先存入银行。");
      }
      const instanceConsume = consumeBackpackEquipmentInstances(
        profile,
        battleEquipmentCatalog,
        itemId,
        amount,
        {instanceIds: payload.equipmentInstanceIds},
      );
      if (!instanceConsume.ok && isEquipmentAssetItemId(itemId)) {
        return fail(instanceConsume.code, instanceConsume.message);
      }
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
      const questProgress = recordQuestEventToProfile(profile, {
        type: "sell_item",
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
    const resolved = resolveServiceSession(data, token);
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
    const equipResult = equipItemToProfile(profile, itemId, {
      instanceId: payload.equipmentInstanceId || payload.instanceId,
    });
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

  function equipmentUnequip(token, payload = {}) {
    const data = load();
    const resolved = resolveServiceSession(data, token);
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
    const unequipResult = unequipEquipmentSlotFromProfile(profile, slotId);
    if (!unequipResult.ok) {
      return fail(unequipResult.code || "equipment_unequip_failed", unequipResult.message || "卸下失败。", {
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
      equipment: {
        itemId: unequipResult.itemId,
        slot: unequipResult.slotId,
        instanceId: unequipResult.instanceId,
        schemaVersion: 1,
      },
      message: unequipResult.message,
    });
  }

  function equipmentEnhance(token, payload = {}) {
    const data = load();
    const resolved = resolveServiceSession(data, token);
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
    const resolved = resolveServiceSession(data, token);
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
    const resolved = resolveServiceSession(data, token);
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
    const resolved = resolveServiceSession(data, token);
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

  function listOnlinePlayers(token, payload = {}) {
    const data = load();
    const resolved = resolveServiceSession(data, token);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const partyPresenceEvent = partyPresenceUpdateEventForAccount(data, resolved.account.accountId);
    if (partyPresenceEvent) {
      save(data);
      emitServiceEvent(partyPresenceEvent);
    }
    const viewerPosition = data.playerPositions[resolved.account.accountId] || null;
    const aoi = normalizeOnlineAoiPayload(payload, viewerPosition);
    const players = publicOnlinePlayersForViewer(data, resolved.account, aoi, now, runtimeActiveSessionIds);
    return ok({
      players,
      party: publicPartyForAccount(data, resolved.account.accountId, {now, runtimeActiveSessionIds}),
      aoi: publicOnlineAoi(aoi),
    });
  }

  function updatePlayerPosition(token, payload = {}) {
    const data = load();
    const resolved = resolveServiceSession(data, token);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const party = partyForAccount(data, resolved.account.accountId);
    const currentPosition = data.playerPositions[resolved.account.accountId] || null;
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
      const partyPresenceEvent = partyPresenceUpdateEventForAccount(data, resolved.account.accountId);
      if (partyPresenceEvent) {
        save(data);
        emitServiceEvent(partyPresenceEvent);
      }
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
    const previousPosition = currentPosition ? {...currentPosition} : null;
    const position = normalizePlayerPositionPayload(payload, resolved.account, now, previousPosition);
    if (!position.mapId) {
      return fail("position_map_missing", "位置缺少地图。");
    }
    if (!allowPositionTeleport) {
      const validation = validateClientPositionSnapshot(data, resolved.account, previousPosition, position, {
        allowInitialPositionSeedForTests,
      });
      if (!validation.ok) {
        const correctionPosition = validation.code === "position_initial_not_record"
          ? recordPointPositionForAccount(data, resolved.account, now)
          : previousPosition;
        return rejectMovementStep(validation.code, validation.message, correctionPosition, {
          movement: {
            retryable: false,
            requiresSync: Boolean(correctionPosition),
          },
        });
      }
    }
    position.authority = "client_snapshot";
    data.playerPositions[resolved.account.accountId] = position;
    applyPartyFollowForLeaderPositionChange(data, party, resolved.account.accountId, previousPosition, position, now);
    const previousPublicPosition = previousPosition ? publicPlayerPosition(previousPosition) : null;
    const partyPresenceEvent = partyPresenceUpdateEventForAccount(data, resolved.account.accountId);
    if (partyPresenceEvent) {
      save(data);
      emitServiceEvent(partyPresenceEvent);
    }
    return publishPositionUpdate(data, resolved.account, position, previousPublicPosition, payload, {
      authority: "client_snapshot",
    });
  }

  function movePlayerStep(token, payload = {}) {
    const data = load();
    const resolved = resolveServiceSession(data, token);
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
    if (!currentPosition || !currentPosition.mapId || !playerPositionHasCell(currentPosition)) {
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
    if (!allowPositionTeleport) {
      const stepMapDoc = mapDocumentById(step.mapId);
      if (stepMapDoc && !positionCellStandable(stepMapDoc, step.toCellX, step.toCellY)) {
        return rejectMovementStep("movement_cell_blocked", "目标格不可通行。", currentPosition);
      }
      if (stepMapDoc && !positionStepCanTraverse(stepMapDoc, step)) {
        return rejectMovementStep("movement_corner_blocked", "不能从阻挡物夹角斜穿。", currentPosition);
      }
    }
    const rate = consumeMovementStepRateCredit(
      movementStepRateByAccountId,
      resolved.account.accountId,
      resolved.session.sessionId,
      now(),
    );
    if (!rate.ok) {
      return rejectMovementStep("movement_rate_limited", "移动过快，请稍候。", currentPosition, {
        retryAfterMs: rate.retryAfterMs,
        movement: {retryable: false, requiresSync: false},
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
    const permitBinding = partyEncounterPermitBinding(
      data,
      resolved.account.accountId,
      resolved.session.sessionId,
    );
    let permitObservation = null;
    try {
      permitObservation = petEncounterPermitAuthority.observeAcceptedStep({
        accountId: resolved.account.accountId,
        sessionId: resolved.session.sessionId,
        mapId: position.mapId,
        cellX: position.cellX,
        cellY: position.cellY,
        movementSeq: position.movementSeq,
        partyFingerprint: permitBinding.partyFingerprint,
        rosterFingerprint: permitBinding.rosterFingerprint,
      });
    } catch {
      permitObservation = null;
    }
    return publishPositionUpdate(data, resolved.account, position, previousPosition, payload, {
      authority: "server_step",
      encounterPermit: permitObservation && permitObservation.ok ? permitObservation.permit : null,
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
      scope: payload.scope || payload.viewScope || ONLINE_AOI_SCOPE,
      mapId: payload.mapId || payload.map,
      cellX: payload.cellX ?? payload.x,
      cellY: payload.cellY ?? payload.y,
      radius: payload.aoiRadius ?? payload.viewRadius ?? payload.radius,
    }, position);
    const players = publicOnlinePlayersForViewer(data, account, aoi, now, runtimeActiveSessionIds);
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
    const response = {
      position: publicPlayerPosition(position),
      players,
      party: publicPartyForAccount(data, account.accountId, {now, runtimeActiveSessionIds}),
      aoi: publicOnlineAoi(aoi),
      authority: extra.authority || "client_snapshot",
      movement: extra.movement || null,
    };
    // 一次性许可只返回给本次 HTTP 请求者，绝不广播到 online.position 事件。
    if (extra.encounterPermit && typeof extra.encounterPermit === "object") {
      response.encounterPermit = clone(extra.encounterPermit);
    }
    return ok(response);
  }

  function resolveHangOrigin(data, accountId, payload = {}) {
    const currentPosition = data.playerPositions[String(accountId || "")] || null;
    const requested = normalizeHangOriginPayload(payload);
    if (!currentPosition || !playerPositionHasCell(currentPosition)) {
      if (allowHangOriginWithoutPositionForTests) {
        return {
          ok: true,
          mapId: requested.mapId,
          originCell: requested.originCell,
          zoneId: "",
          encounterGroupId: "",
        };
      }
      return fail("hang_position_missing", "开始挂机前需要先同步当前位置。");
    }
    const mapId = String(currentPosition.mapId || "");
    const currentCell = [Math.trunc(Number(currentPosition.cellX || 0)), Math.trunc(Number(currentPosition.cellY || 0))];
    if (
      requested.mapId !== mapId ||
      requested.originCell[0] !== currentCell[0] ||
      requested.originCell[1] !== currentCell[1]
    ) {
      return fail("hang_position_mismatch", "挂机位置与服务器记录不一致，请重新移动后再试。");
    }
    const catalog = petEncounterAuthority && petEncounterAuthority.catalog;
    const map = catalog && catalog.mapsById && Object.hasOwn(catalog.mapsById, mapId)
      ? catalog.mapsById[mapId]
      : null;
    const zones = Object.values(map && map.zonesById || {}).filter((zone) => (
      zone && !Boolean(zone.manualOnly) && zoneContainsCell(zone, currentCell[0], currentCell[1])
    ));
    if (zones.length !== 1) {
      return fail("hang_zone_invalid", "当前位置不是可挂机的遇敌区域。");
    }
    return {
      ok: true,
      mapId,
      originCell: currentCell,
      zoneId: String(zones[0].id || ""),
      encounterGroupId: String(zones[0].encounterGroupId || ""),
    };
  }

  function partyEncounterPermitBinding(data, leaderAccountId, sessionId, participantAccountIds = null) {
    const normalizedLeaderAccountId = String(leaderAccountId || "");
    const party = partyForAccount(data, normalizedLeaderAccountId);
    const memberAccountIds = party
      ? partyMemberAccountIds(party)
      : [normalizedLeaderAccountId];
    const onlineAccountIds = new Set(
      activeOnlinePlayers(data, now, runtimeActiveSessionIds)
        .map((account) => String(account && account.accountId || ""))
        .filter(Boolean),
    );
    const battleAccountIds = (Array.isArray(participantAccountIds)
      ? participantAccountIds
      : memberAccountIds.filter((accountId) => onlineAccountIds.has(accountId)))
      .map((accountId) => String(accountId || ""))
      .filter(Boolean);
    const partyFingerprint = crypto.createHash("sha256").update(JSON.stringify({
      partyId: String(party && party.partyId || ""),
      leaderAccountId: String(party && party.leaderAccountId || normalizedLeaderAccountId),
      memberAccountIds,
    })).digest("hex");
    const rosterFingerprint = crypto.createHash("sha256").update(JSON.stringify({
      sessionId: String(sessionId || ""),
      participants: battleAccountIds.map((accountId) => {
        const position = data.playerPositions[accountId] || null;
        const binding = data.profileBindings[accountId] || null;
        return {
          accountId,
          profileRevision: Math.max(0, Math.trunc(Number(binding && binding.profileRevision || 0))),
          mapId: String(position && position.mapId || ""),
          cellX: Math.trunc(Number(position && position.cellX || 0)),
          cellY: Math.trunc(Number(position && position.cellY || 0)),
          movementSeq: Math.max(0, Math.trunc(Number(position && position.movementSeq || 0))),
        };
      }),
    })).digest("hex");
    return {
      party,
      memberAccountIds,
      battleAccountIds,
      partyFingerprint,
      rosterFingerprint,
    };
  }

  function authorizePartyEncounter(data, resolved, payload, participantAccountIds) {
    const binding = partyEncounterPermitBinding(
      data,
      resolved.account.accountId,
      resolved.session.sessionId,
      participantAccountIds,
    );
    try {
      const leaderPosition = data.playerPositions[resolved.account.accountId] || null;
      const manualAccess = manualEncounterAccess.authorize({
        mapId: String(leaderPosition && leaderPosition.mapId || ""),
        request: payload,
        participants: binding.battleAccountIds.map((accountId) => {
          const account = accountById(data, accountId);
          const profileBinding = data.profileBindings[accountId] || null;
          const profileDoc = profileBinding && profileBinding.playerId
            ? data.profiles[profileBinding.playerId] || null
            : null;
          return {
            accountId,
            displayName: String(account && (account.displayName || account.username) || ""),
            profile: profileDoc && profileDoc.profile && typeof profileDoc.profile === "object" && !Array.isArray(profileDoc.profile)
              ? profileDoc.profile
              : null,
          };
        }),
      });
      if (!manualAccess.ok) {
        return fail(manualAccess.code, manualAccess.message);
      }
      if (manualAccess.manual) {
        return petEncounterPermitAuthority.authorizeEncounter({
          accountId: resolved.account.accountId,
          sessionId: resolved.session.sessionId,
          request: payload,
          position: leaderPosition,
          partyFingerprint: binding.partyFingerprint,
          rosterFingerprint: binding.rosterFingerprint,
        });
      }
      if (typeof petEncounterPermitAuthority.authorizeTimedEncounter === "function") {
        const profileBinding = data.profileBindings[resolved.account.accountId] || null;
        const profileDoc = profileBinding && profileBinding.playerId
          ? data.profiles[profileBinding.playerId] || null
          : null;
        const profile = profileDoc && profileDoc.profile && typeof profileDoc.profile === "object" && !Array.isArray(profileDoc.profile)
          ? profileDoc.profile
          : null;
        const hangSession = normalizeHangSession(profile && profile.hangSession);
        if (hangSession.enabled && hangSession.mode === "encounter_stone") {
          const stoneConfig = encounterStoneConfigForItem(hangSession.encounterStoneItemId);
          const startedAtMs = Date.parse(hangSession.startedAt);
          const expiresAtMs = Date.parse(hangSession.expiresAt);
          if (
            !stoneConfig ||
            hangSession.encounterIntervalMs !== stoneConfig.intervalMs ||
            !Number.isFinite(startedAtMs) ||
            !Number.isFinite(expiresAtMs) ||
            expiresAtMs - startedAtMs !== stoneConfig.durationMs ||
            !hangSession.encounterActivationId ||
            !hangSession.encounterZoneId ||
            !hangSession.encounterGroupId
          ) {
            return fail("encounter_stone_session_invalid", "遇敌石状态不完整，请重新使用遇敌石。");
          }
          return petEncounterPermitAuthority.authorizeTimedEncounter({
            accountId: resolved.account.accountId,
            sessionId: resolved.session.sessionId,
            request: payload,
            position: data.playerPositions[resolved.account.accountId] || null,
            partyFingerprint: binding.partyFingerprint,
            rosterFingerprint: binding.rosterFingerprint,
            sourceId: hangSession.encounterActivationId,
            lastConsumedSlot: hangSession.encounterConsumedSlot,
            startedAtMs,
            expiresAtMs,
            intervalMs: stoneConfig.intervalMs,
            originMapId: hangSession.originMapId,
            originCell: hangSession.originCell,
            zoneId: hangSession.encounterZoneId,
            encounterGroupId: hangSession.encounterGroupId,
          });
        }
      }
      return petEncounterPermitAuthority.authorizeEncounter({
        accountId: resolved.account.accountId,
        sessionId: resolved.session.sessionId,
        request: payload,
        position: leaderPosition,
        partyFingerprint: binding.partyFingerprint,
        rosterFingerprint: binding.rosterFingerprint,
      });
    } catch {
      return fail("encounter_permit_unavailable", "服务端遇敌许可暂不可用，请继续移动后重试。");
    }
  }

  function consumePartyEncounterAuthorization(data, authorization) {
    try {
      if (authorization && String(authorization.mode || "") === "timed") {
        const accountId = String(authorization.accountId || "");
        const account = accountById(data, accountId);
        const binding = data.profileBindings[accountId] || null;
        const profileDoc = binding && binding.playerId ? data.profiles[binding.playerId] || null : null;
        const profile = profileDoc && profileDoc.profile && typeof profileDoc.profile === "object" && !Array.isArray(profileDoc.profile)
          ? clone(profileDoc.profile)
          : null;
        const assetConflict = profile ? rawBackpackAssetConflict(profile) : null;
        if (assetConflict) {
          return fail(assetConflict.code, assetConflict.message);
        }
        const hangSession = normalizeHangSession(profile && profile.hangSession);
        const expectedSlot = Math.max(0, Math.trunc(Number(authorization.previousConsumedSlot || 0)));
        const nextSlot = Math.max(0, Math.trunc(Number(authorization.slot || 0)));
        if (
          !account || !binding || !profile ||
          !hangSession.enabled || hangSession.mode !== "encounter_stone" ||
          hangSession.encounterActivationId !== String(authorization.sourceId || "") ||
          hangSession.encounterConsumedSlot !== expectedSlot ||
          nextSlot <= expectedSlot
        ) {
          return fail("encounter_stone_binding_mismatch", "遇敌石状态已经变化，请重新使用遇敌石。");
        }
        const consumed = petEncounterPermitAuthority.consume(authorization);
        if (!consumed.ok) {
          return consumed;
        }
        profile.hangSession = {
          ...objectOrEmpty(profile.hangSession),
          ...hangSession,
          encounterConsumedSlot: nextSlot,
        };
        persistProfileForAccount(data, account, binding, profile, now);
        return {ok: true};
      }
      return petEncounterPermitAuthority.consume(authorization);
    } catch {
      return fail("encounter_permit_unavailable", "服务端遇敌许可暂不可用，请继续移动后重试。");
    }
  }

  function invalidateEncounterPermitForAccount(accountId, reason = "state_changed") {
    if (typeof petEncounterPermitAuthority.invalidateAccount !== "function") {
      return;
    }
    try {
      petEncounterPermitAuthority.invalidateAccount(accountId, reason);
    } catch {
      // 运行时许可失效失败不能把已持久化的挂机事务回滚成半状态；后续绑定校验仍会失败关闭。
    }
  }

  function settlePartyEncounterPositions(data, participantAccountIds, authorization) {
    if (!authorization || String(authorization.mode || "") !== "permit") {
      return;
    }
    for (const accountId of participantAccountIds) {
      const normalizedAccountId = String(accountId || "");
      const position = data.playerPositions[normalizedAccountId] || null;
      if (!position) {
        continue;
      }
      position.moving = false;
      position.authority = "server_encounter_permit";
      position.updatedAt = isoNow(now);
      data.playerPositions[normalizedAccountId] = position;
    }
  }

  function eventForSession(token, event = {}) {
    const data = load();
    const replacementEvent = sessionReplacementEventForToken(data, token, event);
    if (replacementEvent.handled) {
      return replacementEvent.result;
    }
    const resolved = resolveServiceSession(data, token);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    return eventForResolvedSession(data, resolved, event);
  }

  function listEventsForSession(token, payload = {}) {
    const data = load();
    const resolved = resolveServiceSession(data, token);
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
    if (event && event.type === "session.replaced") {
      const targetSessionIds = Array.isArray(event.targetSessionIds) ? event.targetSessionIds.map((value) => String(value || "")) : [];
      return ok({
        visible: targetSessionIds.includes(String(resolved.session.sessionId || "")),
        event,
      });
    }
    if (event && event.type === "online.position") {
      return onlinePositionEventForResolvedSession(data, resolved, event);
    }
    if (event && String(event.type || "").startsWith("battle.")) {
      return battleEventForResolvedSession(data, resolved, event);
    }
    return ok({
      visible: true,
      event,
    });
  }

  function battleEventForResolvedSession(data, resolved, event = {}) {
    const roomId = String(event.roomId || event.room && event.room.roomId || "");
    const room = roomId !== "" ? data.battleRooms[roomId] || null : null;
    if (!room) {
      return ok({visible: true, event});
    }
    return ok({
      visible: true,
      event: {
        ...event,
        room: publicBattleRoom(room, resolved.account.accountId),
      },
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
    let players = publicOnlinePlayersForViewer(data, resolved.account, aoi, now, runtimeActiveSessionIds);
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

  function expireBattleTimeoutsAndEmit(data) {
    const timeoutEvents = expireBattleTimeouts(data, now, {
      runtimeActiveSessionIds,
      newPetFactory,
      petExpSettlement,
      petCaptureCandidateAuthority,
      randomId,
      battleActorRules,
      battleRandomAuthority,
      battleVictoryRewardResolver,
    });
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
    const resolved = resolveServiceSession(data, token);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    expireBattleTimeoutsAndEmit(data);
    data = load();
    return ok(applyBattleConnectionState(data, resolved.account.accountId, connected, connected ? "ws_open" : "ws_close"));
  }

  function applyBattleConnectionState(data, accountId, connected, source = "") {
    const normalizedAccountId = String(accountId || "");
    const changed = markBattleConnectionForAccount(data, normalizedAccountId, connected, now);
    if (changed) {
      scheduleBattleMaintenance(data);
    }
    return {
      accountId: normalizedAccountId,
      connected: Boolean(connected),
      changed,
      source,
      room: publicBattleRoom(activeBattleRoomForAccount(data, normalizedAccountId), normalizedAccountId),
    };
  }

  function scheduleBattleMaintenance(data = null) {
    if (battleMaintenanceTimer) {
      clearTimeout(battleMaintenanceTimer);
      battleMaintenanceTimer = null;
    }
    if (durableAdmissionsStopped) {
      return;
    }
    const nextDelay = nextBattleMaintenanceDelayMs(data || cachedData, now);
    if (nextDelay === null) {
      return;
    }
    battleMaintenanceTimer = setTimeout(() => {
      battleMaintenanceTimer = null;
      invokeDurable("runBattleMaintenance", [], {
        actionId: "battle_maintenance",
      }).catch((error) => {
        // 定时结算与玩家请求共用 durable 边界；失败不得发布结算事件。
        console.error(`Beastbound battle maintenance save failed: ${error.message}`);
      });
    }, Math.max(10, nextDelay + 25));
    if (typeof battleMaintenanceTimer.unref === "function") {
      battleMaintenanceTimer.unref();
    }
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
    const resolved = resolveServiceSession(data, token);
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
    const data = load();
    const access = gmCommandAccess(data, payload.token, payload.commandId);
    const audit = recordGmCommandAudit(data, access, access.ok, access.ok ? "" : access.message);
    save(data);
    if (!access.ok) {
      return fail(access.code, access.message, {"auditId": audit.auditId});
    }
    return ok({
      commandId: access.commandId,
      auditId: audit.auditId,
      message: "GM命令已授权。",
    });
  }

  function gmCommandAccess(data, token, commandIdValue) {
    const commandId = normalizeCommandId(commandIdValue);
    const resolved = resolveServiceSession(data, token);
    if (!resolved.ok) {
      return {ok: false, code: resolved.code, message: resolved.message, commandId, username: "", resolved: null};
    }
    if (!commandId) {
      return {ok: false, code: "empty_command", message: "GM命令为空。", commandId, username: resolved.account.username, resolved};
    }
    if (!effectiveRoleIsGm(data, resolved.account, now)) {
      return {ok: false, code: "gm_denied", message: "当前账号没有GM权限。", commandId, username: resolved.account.username, resolved};
    }
    if (!commandAllowed(data, resolved.account.accountId, commandId)) {
      return {ok: false, code: "command_denied", message: "GM命令未授权。", commandId, username: resolved.account.username, resolved};
    }
    return {ok: true, commandId, username: resolved.account.username, resolved};
  }

  function recordGmCommandAudit(data, access, okValue, message) {
    return recordGmAudit(
      data,
      String(access && access.username || ""),
      String(access && access.commandId || ""),
      okValue,
      String(message || ""),
      now,
      randomId,
    );
  }

  function snapshot() {
    return clone(load());
  }

  function invokeDurable(methodName, args = [], operation = {}) {
    const normalizedMethodName = String(methodName || "");
    const normalizedArgs = Array.isArray(args) ? args : [];
    return durableMutationCoordinator.run(
      () => executeDurableMutation(normalizedMethodName, normalizedArgs, operation),
      operation && operation.timeoutMs !== undefined ? {timeoutMs: operation.timeoutMs} : {},
    );
  }

  async function executeDurableMutation(methodName, args, operation) {
    const method = serviceApi && serviceApi[methodName];
    if (typeof method !== "function" || methodName === "invokeDurable") {
      return fail("durable_method_invalid", "服务器持久化操作不存在。");
    }
    const operationId = String(operation && operation.operationId || "").trim();
    const requestHash = String(operation && operation.requestHash || "").trim().toLowerCase();
    const actionId = String(operation && operation.actionId || methodName).trim().slice(0, 160) || methodName;
    if (operationId !== "" && !DURABLE_OPERATION_ID_PATTERN.test(operationId)) {
      return fail("idempotency_key_invalid", "操作标识格式不正确，请重新发起操作。");
    }
    if (operationId !== "" && !DURABLE_REQUEST_HASH_PATTERN.test(requestHash)) {
      return fail("idempotency_request_invalid", "操作校验信息不完整，请重新发起操作。");
    }

    refreshPublishedDataAfterStorageFailure();

    const receiptOperationId = DURABLE_RECEIPT_EXCLUDED_METHODS.has(methodName) ? "" : operationId;
    const before = clone(load());
    const existingReceipt = receiptOperationId === "" ? null : activeDurableReceipt(before, receiptOperationId, now());
    if (existingReceipt) {
      const currentSession = resolveServiceSession(before, durableMutationToken(args));
      if (!currentSession.ok) {
        return fail(currentSession.code, currentSession.message);
      }
      if (
        String(existingReceipt.accountId || "") === ""
        || String(existingReceipt.accountId) !== String(currentSession.account.accountId || "")
      ) {
        return fail("idempotency_key_conflict", "这个操作标识已经用于另一项请求，请重新发起操作。");
      }
      if (existingReceipt.requestHash !== requestHash || existingReceipt.actionId !== actionId) {
        return fail("idempotency_key_conflict", "这个操作标识已经用于另一项请求，请重新发起操作。");
      }
      return durableReceiptReplayResult(existingReceipt);
    }

    const transaction = {
      before,
      data: clone(before),
      events: [],
      saveRequested: false,
    };
    activeDurableMutation = transaction;
    let result;
    try {
      result = method(...args);
      if (result && typeof result.then === "function") {
        throw new Error("durable service methods must remain synchronous");
      }
    } finally {
      activeDurableMutation = null;
    }

    let candidate = normalizeData(transaction.data);
    const beforePersistent = persistentDataForStore(before);
    let candidatePersistent = persistentDataForStore(candidate);
    const businessPersistentChanged = durableBusinessChanged(beforePersistent, candidatePersistent, {
      persistentDataForStore,
      normalizeEventSeq,
    });
    let response = result;
    if (businessPersistentChanged && result && result.ok && receiptOperationId !== "") {
      const committedAt = isoNow(now);
      response = durableCommitResult(result, {
        operationId: receiptOperationId,
        actionId,
        committedAt,
        replayed: false,
      });
      candidate.mutationReceipts = pruneDurableMutationReceipts(candidate.mutationReceipts, now());
      candidate.mutationReceipts[receiptOperationId] = {
        schemaVersion: 1,
        operationId: receiptOperationId,
        requestHash,
        actionId,
        accountId: durableMutationAccountId(before, args, hashToken),
        committedAt,
        expiresAt: new Date(now() + DURABLE_RECEIPT_TTL_MS).toISOString(),
        response: clone(response),
      };
      candidate = normalizeData(candidate);
      candidatePersistent = persistentDataForStore(candidate);
    }

    if (!businessPersistentChanged) {
      publishDurableCandidate(before, candidate, transaction.events);
      return response;
    }

    try {
      await Promise.resolve(store.save(candidatePersistent));
    } catch (cause) {
      const error = new Error("服务器存档暂时不可用，请稍后使用同一操作重试。");
      error.code = "storage_write_failed";
      error.cause = cause;
      throw error;
    }
    lastPublishedPersistentData = clone(candidatePersistent);
    publishDurableCandidate(before, candidate, transaction.events);
    return response;
  }

  function refreshPublishedDataAfterStorageFailure() {
    const priorError = typeof store.lastSaveError === "function" ? store.lastSaveError() : null;
    if (!priorError) {
      return;
    }
    try {
      const current = cachedData ? clone(cachedData) : normalizeData({});
      const reloaded = normalizeData(store.load());
      for (const field of RUNTIME_ROOT_FIELDS) {
        reloaded[field] = clone(current[field]);
      }
      cachedData = reloaded;
      lastPublishedPersistentData = persistentDataForStore(reloaded);
      if (typeof store.clearSaveError === "function") {
        store.clearSaveError();
      }
      scheduleBattleMaintenance(cachedData);
    } catch (cause) {
      const error = new Error("上一次操作结果仍在确认中，请使用原操作标识稍后重试。");
      error.code = "storage_outcome_unknown";
      error.cause = cause;
      throw error;
    }
  }

  function publishDurableCandidate(before, candidate, events) {
    const current = cachedData ? clone(cachedData) : clone(before);
    const next = normalizeData(candidate);
    for (const field of RUNTIME_ROOT_FIELDS) {
      next[field] = mergeRuntimeObject(before[field], candidate[field], current[field]);
    }
    cachedData = next;
    lastPublishedPersistentData = persistentDataForStore(cachedData);
    scheduleBattleMaintenance(cachedData);
    for (const event of events) {
      publishServiceEvent(event);
    }
  }

  function durableMutationMetrics() {
    return durableMutationCoordinator.metrics();
  }

  function waitForDurableIdle() {
    return durableMutationCoordinator.waitForIdle();
  }

  function stopDurableAdmissionsAndDrain() {
    if (durableDrainPromise !== null) {
      return durableDrainPromise;
    }
    durableAdmissionsStopped = true;
    if (battleMaintenanceTimer) {
      clearTimeout(battleMaintenanceTimer);
      battleMaintenanceTimer = null;
    }
    durableDrainPromise = typeof durableMutationCoordinator.stopAdmissionAndDrain === "function"
      ? durableMutationCoordinator.stopAdmissionAndDrain()
      : durableMutationCoordinator.waitForIdle();
    return durableDrainPromise;
  }

  function equipmentEnvelopeDuplicateMutationResult(methodName, args) {
    if (!BATTLE_LOCKED_SERVICE_MUTATIONS.has(String(methodName || ""))) {
      return null;
    }
    const token = Array.isArray(args) ? args[0] : "";
    const data = load();
    const resolved = resolveServiceSession(data, token);
    if (!resolved.ok) {
      return null;
    }
    const registry = createEquipmentEnvelopeOwnershipRegistry(data);
    return registry.conflicts.length > 0
      ? equipmentEnvelopeRegistryMutationFailure(registry.conflicts[0])
      : null;
  }

  function battleLockedMutationResult(methodName, args) {
    if (!BATTLE_LOCKED_SERVICE_MUTATIONS.has(String(methodName || ""))) {
      return null;
    }
    const token = Array.isArray(args) ? args[0] : "";
    const data = load();
    const resolved = resolveServiceSession(data, token);
    if (!resolved.ok || !activeBattleRoomForAccount(data, resolved.account.accountId)) {
      return null;
    }
    return fail(
      "battle_profile_mutation_locked",
      "战斗中暂不能操作背包、银行、市场、交易、邮件或宠物，请在战斗结束后重试。",
    );
  }

  function offlineHangLockedMutationResult(methodName, args) {
    if (!OFFLINE_HANG_LOCKED_SERVICE_MUTATIONS.has(String(methodName || ""))) {
      return null;
    }
    const token = Array.isArray(args) ? args[0] : "";
    const data = load();
    const resolved = resolveServiceSession(data, token);
    if (!resolved.ok) {
      return null;
    }
    const binding = data.profileBindings[resolved.account.accountId] || null;
    const profileDoc = binding && binding.playerId ? data.profiles[binding.playerId] || null : null;
    const session = profileDoc && profileDoc.profile && profileDoc.profile.offlineHang
      && profileDoc.profile.offlineHang.session;
    if (String(session && session.status || "") !== "active") {
      return null;
    }
    return fail("offline_hang_active", "正在离线挂机；请先领取或取消离线收益，再继续游戏。", {
      offlineHang: clone(profileDoc.profile.offlineHang),
    });
  }

  function validateClientQuestEvent(data, account, event) {
    const type = String(event && event.type || "");
    if (!QUEST_EVENT_CLIENT_REPORTABLE_TYPES.has(type)) {
      return {ok: false, code: "quest_event_not_client_reportable", message: "该任务进度由服务器结算，不能由客户端上报。"};
    }
    if (type === "open_feature") {
      if (!QUEST_TUTORIAL_FEATURE_IDS.has(String(event && event.featureId || "").trim())) {
        return {ok: false, code: "quest_feature_invalid", message: "这个功能入口不存在。"};
      }
      const binding = data.profileBindings && data.profileBindings[account.accountId];
      const profileDoc = binding && data.profiles && data.profiles[binding.playerId];
      const profile = profileDoc && profileDoc.profile;
      const quest = profile && questById(currentProfileQuestId(profile));
      return quest && questProgressAmountForEvent(quest, event) > 0
        ? {ok: true}
        : {ok: false, code: "quest_feature_not_expected", message: "当前任务不需要打开这个功能。"};
    }
    if (allowPositionTeleport) {
      return {ok: true};
    }
    const locations = questTalkNpcLocations(event.targetId);
    if (locations.length <= 0) {
      return {ok: false, code: "quest_talk_target_invalid", message: "没有找到这个NPC。"};
    }
    const position = data.playerPositions[account.accountId] || null;
    if (!position || !position.mapId || !playerPositionHasCell(position)) {
      return {ok: false, code: "movement_position_missing", message: "请先同步当前位置。"};
    }
    const near = locations.some((location) =>
      location.mapId === String(position.mapId || "") &&
      cellChebyshevDistance(position.cellX, position.cellY, location.cellX, location.cellY) <= QUEST_TALK_PROXIMITY_CELLS);
    if (!near) {
      return {ok: false, code: "quest_talk_too_far", message: "距离NPC太远，请走近后再对话。"};
    }
    return {ok: true};
  }

  const domainContext = {
    BATTLE_INVITE_ACCEPTED,
    BATTLE_INVITE_CANCELLED,
    BATTLE_INVITE_DECLINED,
    BATTLE_INVITE_PENDING,
    BATTLE_INVITE_TTL_MS,
    BATTLE_MODE_DUEL,
    BATTLE_MODE_MANOR_WAR,
    BATTLE_MODE_PARTY_PVE,
    BATTLE_PET_MAX_PER_PARTICIPANT,
    BATTLE_PET_STATE_STANDBY,
    BATTLE_PET_STATE_STORAGE,
    BATTLE_PET_STORAGE_LIMIT,
    BATTLE_PHASE_COMMAND,
    BATTLE_ROOM_CLOSED,
    BATTLE_ROOM_READY,
    BATTLE_SIDE_ALLY,
    CHAT_CHANNEL_NEARBY,
    CHAT_CHANNEL_TEAM,
    CHAT_HISTORY_LIMIT,
    MAIL_BODY_MAX_LENGTH,
    MAIL_TITLE_MAX_LENGTH,
    MAX_CHAT_MESSAGES,
    MAX_PET_LEVEL,
    PARTY_MAX_MEMBERS,
    PROFILE_ACTION_IDS,
    accountById,
    accountRuntimeActivity: (serviceData, accountId) => accountRuntimeActivity(serviceData, accountId, now, runtimeActiveSessionIds),
    activeBattleRoomForAccount,
    activeOnlinePlayers: (serviceData, nowFn = now) => activeOnlinePlayers(serviceData, nowFn, runtimeActiveSessionIds),
    activeQuestAutoClaim,
    authorizeGmCommand,
    claimActiveQuestToProfile,
    addClaimedMailItemsToActiveBattleRoom: (serviceData, accountId, items) => addClaimedMailItemsToActiveBattleRoom(serviceData, accountId, items, now),
    addRewardItemsToBackpack,
    applyPlayerRebirthReturn,
    applyOfflineTrainingExpToProfile: (profile, accountId, playerExp, petExp, petInstanceId) => {
      const reward = {
        amount: Math.max(0, Math.trunc(Number(playerExp || 0))) + Math.max(0, Math.trunc(Number(petExp || 0))),
        player: {amount: Math.max(0, Math.trunc(Number(playerExp || 0))), name: "人物"},
        pets: petInstanceId ? [{
          amount: Math.max(0, Math.trunc(Number(petExp || 0))),
          petId: String(petInstanceId),
          name: "离线修行宠物",
        }] : [],
        schemaVersion: 2,
      };
      const result = applyBattleExpRewardToProfile(profile, null, accountId, reward, petExpSettlement);
      if (result.publicExp && result.publicExp.failed) {
        return {ok: false, code: result.publicExp.code, message: result.publicExp.message};
      }
      return {ok: true, changed: result.changed, publicExp: result.publicExp};
    },
    applyProfileActionToProfile: (profile, action, params, nowFn) => applyProfileActionToProfile(
      profile,
      action,
      params,
      nowFn,
      {newPetFactory, petExpSettlement, petRebirthGrowthCycle},
    ),
    bagItemById,
    bagItemIsBound,
    bagItemLabel,
    bagItemStackLimit,
    backpackItemCount,
    battleEquipmentCatalog,
    battleInviteIsExpired,
    battleBackpackEntryCheck,
    battleParticipantSnapshot,
    battleRecordSummaryAgainst,
    battleRoomBattleStateForMutation: (roomValue, nowFn) => battleRoomBattleStateForMutation(
      roomValue,
      nowFn,
      {battleActorRules},
    ),
    battleRoomConnectionStateForMutation,
    battleRoomEntryCheck,
    battleRoomResultForLeave,
    battleStatePayload,
    captureToolBagFromProfile,
    claimQuestByIdToProfile,
    clampInt,
    clone,
    createDefaultServerPet,
    closeBattleRoomWithResult: (serviceData, roomValue, result, nowFn) => closeBattleRoomWithResult(
      serviceData,
      roomValue,
      result,
      nowFn,
      {newPetFactory, petExpSettlement, petCaptureCandidateAuthority, randomId, battleActorRules, battleRandomAuthority, battleVictoryRewardResolver},
    ),
    authorizePartyEncounter,
    consumePartyEncounterAuthorization,
    consumeBackpackItem,
    createBattleRoomBattleState: (roomValue, nowFn) => createBattleRoomBattleState(
      roomValue,
      nowFn,
      {battleActorRules},
    ),
    createPartyForLeader,
    currentProfileQuestId,
    emitServiceEvent,
    ensureProfileForAccount,
    expToNextLevel: battleExpToNextLevel,
    equipmentTransferOptions: {
      ...equipmentWearRulesFromDocument(playerGrowthDocument()),
      expToNextLevel: battleExpToNextLevel,
      maxPlayerLevel: MAX_PLAYER_LEVEL,
    },
    encounterStoneConfigForItem,
    executePlayerRebirthToProfile: (profile) => executePlayerRebirthToProfile(profile, {newPetFactory}),
    expireBattleInvite,
    expireBattleTimeoutsAndEmit,
    invalidateEncounterPermitForAccount,
    fail,
    gmCommandAccess,
    isoNow,
    itemAmountText,
    isEquipmentItemId: isEquipmentAssetItemId,
    load,
    applyBattleConnectionState,
    markBattleConnectionForAccount,
    normalizeBackpackSlots,
    normalizeBattleCommandPayload: (payload, serviceData, roomValue, battleValue, account, nowFn, randomIdFn) => normalizeBattleCommandPayload(
      payload,
      serviceData,
      roomValue,
      battleValue,
      account,
      nowFn,
      randomIdFn,
      {petCaptureCandidateAuthority},
    ),
    normalizeChatChannel,
    normalizeChatText,
    normalizeHangMode,
    normalizeHangOriginPayload,
    normalizeHangSession,
    normalizeHangSettings,
    normalizeHangStopReason,
    normalizeMailCurrency,
    normalizeMailItems,
    normalizeMailText,
    normalizeProfileActionId,
    normalizeUsername,
    normalizedQuestEventPayload,
    now,
    newPetFactory,
    objectOrEmpty,
    ok,
    offlinePartyPveBattleParticipantAccountIds: (serviceData, roomValue) => offlinePartyPveBattleParticipantAccountIds(serviceData, roomValue, {now, runtimeActiveSessionIds}),
    partyEncounterEntry,
    preparePartyEncounterCaptureCandidates: (roomValue) => petCaptureCandidateAuthority.prepareRoom(roomValue),
    resolvePartyEncounter: (serviceData, leaderAccountId, payload, participants, seed, authorization = null) => {
      const normalizedLeaderAccountId = String(leaderAccountId || "");
      const position = serviceData.playerPositions[normalizedLeaderAccountId] || null;
      const binding = serviceData.profileBindings[normalizedLeaderAccountId] || null;
      const profileDoc = binding && binding.playerId ? serviceData.profiles[binding.playerId] || null : null;
      const profile = profileDoc && profileDoc.profile && typeof profileDoc.profile === "object" && !Array.isArray(profileDoc.profile)
        ? profileDoc.profile
        : null;
      const permitStopsMovement = Boolean(authorization && String(authorization.mode || "") === "permit");
      const encounterPosition = permitStopsMovement && position ? {...position, moving: false} : position;
      return petEncounterAuthority.resolve({
        mapId: String(encounterPosition && encounterPosition.mapId || ""),
        position: encounterPosition,
        profile,
        request: payload,
        participants,
        participantPositions: participants.map((participant) => {
          const accountId = String(participant && participant.accountId || "");
          const participantPosition = serviceData.playerPositions[accountId] || null;
          return {
            accountId,
            position: permitStopsMovement && participantPosition
              ? {...participantPosition, moving: false}
              : participantPosition,
          };
        }),
        seed,
      });
    },
    resolveHangOrigin,
    partyForAccount,
    partyStatePayload: (serviceData, accountId) => partyStatePayload(serviceData, accountId, {now, runtimeActiveSessionIds}),
    bankStoneCoinLimit: BANK_STONE_COIN_LIMIT,
    battleActorRules,
    battlePassiveCatalog,
    battleRandomAuthority,
    manorEntries,
    persistProfileForAccount,
    petExpSettlement,
    petEncounterAuthority,
    petGrowthCatalog,
    playerLevelRuntime,
    playerPositionHasCell,
    profileActionLogLines,
    profileBackpackSlots,
    rawBackpackAssetConflict,
    profileBindingForAccount,
    profilePartyVisiblePetCount,
    profilePetIndexById,
    profilePetInstances,
    profilePetName,
    profileCurrencyAmount,
    profileStoneCoinLimit: PROFILE_STONE_COIN_LIMIT,
    profileStoneCoins,
    profileSummaryForAccount,
    profileStoragePetCount,
    publicAccount,
    publicBattleCommand,
    publicBattleInvite,
    publicBattleResult,
    publicBattleRoom,
    publicBattleTraceRows,
    publicChatMessage,
    publicHangSession,
    publicIncomingPartyInvites,
    publicMail,
    publicParty: (partyValue, serviceData) => publicParty(partyValue, serviceData, {now, runtimeActiveSessionIds}),
    publicPartyForAccount: (serviceData, accountId) => publicPartyForAccount(serviceData, accountId, {now, runtimeActiveSessionIds}),
    publicPartyInvite,
    publicPlayerPosition,
    publicProfileActionResult,
    publicQuestClaim,
    publicQuestProgress,
    questById,
    questIsOptional,
    questRewardChoices,
    randomBytes,
    randomId,
    recordGmCommandAudit,
    recordProfilePetCodexForm,
    recordBattleStateTrace,
    recordBattleTrace,
    recordQuestEventByIdToProfile,
    recordQuestEventToProfile,
    removeAccountFromParty,
    removeOfflinePartyPveParticipantsFromRoom: (serviceData, roomValue, accountIds) => removeOfflinePartyPveParticipantsFromRoom(
      serviceData,
      roomValue,
      accountIds,
      {now, runtimeActiveSessionIds, newPetFactory, petExpSettlement, petCaptureCandidateAuthority, battleActorRules, battleRandomAuthority, battleVictoryRewardResolver},
    ),
    refreshPartyPresence: (serviceData, partyValue, options = {}) => refreshPartyPresence(serviceData, partyValue, now, runtimeActiveSessionIds, options),
    requiredBattleCommandAccountIds,
    requiredBattleCommandActorIds,
    resolveBattleRoomTurn: (serviceData, roomValue, battleValue, nowFn) => resolveBattleRoomTurn(
      serviceData,
      roomValue,
      battleValue,
      nowFn,
      {newPetFactory, petExpSettlement, petCaptureCandidateAuthority, battleActorRules, battleRandomAuthority, battleVictoryRewardResolver},
    ),
    resolveSession: (sessionData, token, nowFn, options = {}) => resolveSession(sessionData, token, nowFn, {
      ...options,
      runtimeActiveSessionIds,
      serverStartedAtMs,
    }),
    save,
    nextProfilePetInstanceSerial,
    settlePartyEncounterPositions,
    setProfileCurrencyAmount,
    shopCurrencyLabel,
    submittedBattleCommandAccountIds,
    submittedBattleCommandActorIds,
    validateClientQuestEvent,
  };
  const profileActions = createProfileActionsDomain(domainContext);
  const quest = createQuestDomain(domainContext);
  const mailChat = createMailChatDomain(domainContext);
  const party = createPartyDomain(domainContext);
  const battleRoom = createBattleRoomDomain(domainContext);
  const economy = createEconomyDomain(domainContext);
  const familyManor = createFamilyManorDomain(domainContext);
  const gmPets = createGmPetsDomain(domainContext);
  const offlineHang = createOfflineHangDomain(domainContext);

  const serviceApi = {
    register,
    login,
    refreshSession,
    logout,
    getSession,
    getProfile,
    saveProfile,
    profileAction: profileActions.profileAction,
    startHangSession: profileActions.startHangSession,
    stopHangSession: profileActions.stopHangSession,
    offlineHangStatus: offlineHang.status,
    startOfflineHang: offlineHang.start,
    claimOfflineHang: offlineHang.claim,
    cancelOfflineHang: offlineHang.cancel,
    getOfflineHangConfig: offlineHang.getConfig,
    updateOfflineHangConfig: offlineHang.updateConfig,
    playerRebirth: profileActions.playerRebirth,
    questRecord: quest.questRecord,
    questClaim: quest.questClaim,
    shopTransaction,
    equipmentEquip,
    equipmentUnequip,
    equipmentEnhance,
    equipmentRepairAll,
    equipmentSynthesize,
    bankDeposit: economy.bankDeposit,
    bankWithdraw: economy.bankWithdraw,
    marketListings: economy.marketListings,
    getMarketConfig: economy.getMarketConfig,
    updateMarketConfig: economy.updateMarketConfig,
    createMarketListing: economy.createMarketListing,
    buyMarketListing: economy.buyMarketListing,
    cancelMarketListing: economy.cancelMarketListing,
    proposeTrade: economy.proposeTrade,
    acceptTrade: economy.acceptTrade,
    tradeState: economy.tradeState,
    cancelTrade: economy.cancelTrade,
    searchPlayers,
    sendMail: mailChat.sendMail,
    listInbox: mailChat.listInbox,
    markMailRead: mailChat.markMailRead,
    claimMailAttachments: mailChat.claimMailAttachments,
    listOnlinePlayers,
    updatePlayerPosition,
    movePlayerStep,
    onEvent,
    eventForSession,
    listEventsForSession,
    latestEventSeq,
    markBattleConnection,
    runBattleMaintenance,
    getPartyState: party.getPartyState,
    inviteToParty: party.inviteToParty,
    applyToParty: party.applyToParty,
    acceptPartyInvite: party.acceptPartyInvite,
    declinePartyInvite: party.declinePartyInvite,
    leaveParty: party.leaveParty,
    getFamilyState: familyManor.getFamilyState,
    listFamilies: familyManor.listFamilies,
    createFamily: familyManor.createFamily,
    joinFamily: familyManor.joinFamily,
    leaveFamily: familyManor.leaveFamily,
    listManors: familyManor.listManors,
    challengeManor: familyManor.challengeManor,
    startManorWarBattleRoom: familyManor.startManorWarBattleRoom,
    enterManorWar: familyManor.enterManorWar,
    leaveManorWar: familyManor.leaveManorWar,
    resolveManorWar: familyManor.resolveManorWar,
    listChatMessages: mailChat.listChatMessages,
    sendChatMessage: mailChat.sendChatMessage,
    getBattleState: battleRoom.getBattleState,
    getBattleTrace: battleRoom.getBattleTrace,
    getBattleRecordSummary: battleRoom.getBattleRecordSummary,
    inviteToBattle: battleRoom.inviteToBattle,
    acceptBattleInvite: battleRoom.acceptBattleInvite,
    startPartyEncounter: battleRoom.startPartyEncounter,
    declineBattleInvite: battleRoom.declineBattleInvite,
    cancelBattleInvite: battleRoom.cancelBattleInvite,
    leaveBattleRoom: battleRoom.leaveBattleRoom,
    submitBattleCommand: battleRoom.submitBattleCommand,
    grantGm,
    listGmTools,
    authorizeGmCommand,
    grantGmPet: gmPets.grantGmPet,
    levelUpGmPet: gmPets.levelUpGmPet,
    snapshot,
  };
  for (const [name, method] of Object.entries(serviceApi)) {
    if (name === "snapshot" || typeof method !== "function") {
      continue;
    }
    serviceApi[name] = (...args) => {
      const locked = equipmentEnvelopeDuplicateMutationResult(name, args)
        || battleLockedMutationResult(name, args)
        || offlineHangLockedMutationResult(name, args);
      return projectPublicServiceResult(locked || method(...args));
    };
  }
  // HTTP/WS production transports use this facade so synchronous domain code
  // can run against an isolated candidate and only publish after durability.
  // Direct memory-store tests and offline tools keep the existing sync API.
  serviceApi.invokeDurable = invokeDurable;
  serviceApi.waitForDurableIdle = waitForDurableIdle;
  serviceApi.stopDurableAdmissionsAndDrain = stopDurableAdmissionsAndDrain;
  serviceApi.durableMutationMetrics = durableMutationMetrics;
  return serviceApi;
}

function projectPublicServiceResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const result = {...value};
  const profileProjectionOptions = {
    equipmentCatalog: battleEquipmentCatalog,
    equipmentOptions: {
      ...equipmentWearRulesFromDocument(playerGrowthDocument()),
      expToNextLevel: battleExpToNextLevel,
      maxPlayerLevel: MAX_PLAYER_LEVEL,
    },
  };
  if (result.profile && typeof result.profile === "object" && !Array.isArray(result.profile)) {
    result.profile = publicProfile(result.profile, profileProjectionOptions);
  }
  if (result.bank && typeof result.bank === "object" && !Array.isArray(result.bank)) {
    result.bank = publicProfile({bank: result.bank}, profileProjectionOptions).bank || {};
  }
  if (result.rebirth && typeof result.rebirth === "object" && !Array.isArray(result.rebirth)) {
    result.rebirth = {...result.rebirth};
    if (
      result.rebirth.starterPet
      && typeof result.rebirth.starterPet === "object"
      && !Array.isArray(result.rebirth.starterPet)
    ) {
      result.rebirth.starterPet = publicPet(result.rebirth.starterPet);
    }
  }
  return result;
}

function createMemoryAuthStore(initialData = null) {
  let data = normalizeData(initialData || {});
  return {
    mode: "memory",
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
    mode: "json",
    load() {
      if (!fs.existsSync(filePath)) {
        return {};
      }
      // 解析失败必须显式失败：静默返回空档会在下一次写入时把损坏文件覆盖成空库。
      try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
      } catch (error) {
        const loadError = new Error(`JSON存档文件损坏，拒绝以空档启动：${filePath}`);
        loadError.code = "storage_load_corrupted";
        loadError.cause = error;
        throw loadError;
      }
    },
    save(nextData) {
      fs.mkdirSync(path.dirname(filePath), {"recursive": true});
      fs.writeFileSync(filePath, JSON.stringify(normalizeData(nextData), null, 2));
    },
    async saveAsync(nextData) {
      await fs.promises.mkdir(path.dirname(filePath), {"recursive": true});
      await fs.promises.writeFile(filePath, JSON.stringify(normalizeData(nextData), null, 2));
    },
  };
}

function createAsyncWriteAuthStore(store, options = {}) {
  let writeQueue = Promise.resolve();
  let lastSaveError = null;
  let ambiguousCommitRecoveries = 0;
  const onError = typeof options.onError === "function" ? options.onError : defaultAsyncStoreErrorHandler;
  return {
    mode: store.mode ? `async:${store.mode}` : "async",
    asyncWrites: true,
    load() {
      return store.load();
    },
    save(nextData) {
      const snapshot = clone(nextData);
      const writeJob = writeQueue.then(async () => {
        try {
          return await saveStoreSnapshot(store, snapshot);
        } catch (error) {
          if (durableStoreSnapshotMatches(store, snapshot)) {
            ambiguousCommitRecoveries += 1;
            return {committed: true, ambiguousCommitRecovered: true};
          }
          throw error;
        }
      });
      // Keep the FIFO alive after failure, but return the original writeJob so
      // the request that owns this exact write observes its own rejection.
      writeQueue = writeJob.then(
        (value) => {
          lastSaveError = null;
          return value;
        },
        (error) => {
          lastSaveError = error;
          onError(error);
        },
      );
      return writeJob;
    },
    async flush() {
      await writeQueue;
      if (lastSaveError) {
        throw lastSaveError;
      }
    },
    lastSaveError() {
      return lastSaveError;
    },
    clearSaveError() {
      lastSaveError = null;
    },
    metrics() {
      return {
        ambiguousCommitRecoveries,
        failed: lastSaveError !== null,
        underlying: typeof store.metrics === "function" ? store.metrics() : null,
      };
    },
    async close() {
      await writeQueue;
      if (typeof store.close === "function") {
        await store.close();
      }
    },
  };
}

function durableStoreSnapshotMatches(store, snapshot) {
  if (!store || typeof store.load !== "function") {
    return false;
  }
  try {
    return isDeepStrictEqual(
      persistentDataForStore(normalizeData(store.load())),
      persistentDataForStore(normalizeData(snapshot)),
    );
  } catch {
    return false;
  }
}

function saveStoreSnapshot(store, snapshot) {
  if (typeof store.saveAsync === "function") {
    return store.saveAsync(snapshot);
  }
  return new Promise((resolve, reject) => {
    setImmediate(() => {
      try {
        store.save(snapshot);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

function defaultAsyncStoreErrorHandler(error) {
  console.error(`Beastbound auth store async save failed: ${error.message}`);
}

function normalizeData(raw) {
  const data = raw && typeof raw === "object" ? clone(raw) : {};
  const serviceEvents = normalizeServiceEvents(data.serviceEvents);
  const serviceEventSeq = Math.max(
    normalizeEventSeq(data.serviceEventSeq),
    0,
    ...serviceEvents.map((event) => normalizeEventSeq(event.eventSeq))
  );
  const normalized = {
    schemaVersion: 1,
    accounts: objectOrEmpty(data.accounts),
    sessions: objectOrEmpty(data.sessions),
    profileBindings: objectOrEmpty(data.profileBindings),
    profiles: objectOrEmpty(data.profiles),
    mailMessages: objectOrEmpty(data.mailMessages),
    tradeOffers: objectOrEmpty(data.tradeOffers),
    marketListings: objectOrEmpty(data.marketListings),
    mutationReceipts: normalizeDurableMutationReceipts(data.mutationReceipts),
    consumedEquipmentEnvelopes: Object.hasOwn(data, "consumedEquipmentEnvelopes")
      ? (data.consumedEquipmentEnvelopes === undefined
        ? undefined
        : clone(data.consumedEquipmentEnvelopes))
      : {},
    marketConfig: objectOrEmpty(data.marketConfig),
    offlineHangConfig: objectOrEmpty(data.offlineHangConfig),
    parties: objectOrEmpty(data.parties),
    partyInvites: objectOrEmpty(data.partyInvites),
    families: normalizeFamilies(data.families),
    manors: objectOrEmpty(data.manors),
    manorWars: normalizeManorWars(data.manorWars),
    manorBattles: normalizeManorBattles(data.manorBattles),
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
  const ledger = backfillConsumedEquipmentEnvelopeLedger(
    normalized,
    normalized.consumedEquipmentEnvelopes,
  );
  if (ledger.ok) {
    normalized.consumedEquipmentEnvelopes = ledger.ledger;
  }
  return normalized;
}

function normalizeFamilies(value) {
  const families = objectOrEmpty(value);
  const result = {};
  for (const [familyId, rawFamily] of Object.entries(families)) {
    if (!rawFamily || typeof rawFamily !== "object" || Array.isArray(rawFamily)) {
      continue;
    }
    const normalizedId = String(rawFamily.familyId || familyId || "").trim();
    const name = String(rawFamily.name || "").trim();
    if (!normalizedId || !name) {
      continue;
    }
    result[normalizedId] = {
      ...rawFamily,
      familyId: normalizedId,
      name,
      leaderAccountId: String(rawFamily.leaderAccountId || ""),
      memberAccountIds: uniqueStringArray(rawFamily.memberAccountIds),
      notice: String(rawFamily.notice || ""),
      fame: Math.max(0, Math.trunc(Number(rawFamily.fame || 0))),
      manorIds: uniqueStringArray(rawFamily.manorIds),
      schemaVersion: 1,
    };
  }
  return result;
}

function normalizeManorBattles(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((battle) => battle && typeof battle === "object" && !Array.isArray(battle) && String(battle.battleId || "") !== "")
    .slice(-200);
}

function normalizeManorWars(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((war) => war && typeof war === "object" && !Array.isArray(war) && String(war.warId || "") !== "")
    .slice(-120);
}

function persistentDataForStore(data) {
  // createAuthService.save() passes the already-normalized authoritative root.
  // Cloning here keeps runtime buckets isolated without repeating the global
  // equipment-ledger audit and sort a second time for every successful write.
  const persistent = clone(data);
  persistent.playerPositions = {};
  persistent.battleInvites = {};
  persistent.battleRooms = {};
  persistent.tradeOffers = {};
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

function markRuntimeSessionActive(runtimeActiveSessionIds, sessionId, nowMs) {
  if (!runtimeActiveSessionIds || !sessionId) {
    return;
  }
  if (typeof runtimeActiveSessionIds.set === "function") {
    runtimeActiveSessionIds.set(sessionId, nowMs);
    return;
  }
  if (typeof runtimeActiveSessionIds.add === "function") {
    runtimeActiveSessionIds.add(sessionId);
  }
}

function clearRuntimeSessionsForAccount(data, accountId, runtimeActiveSessionIds) {
  if (!runtimeActiveSessionIds) {
    return;
  }
  const normalizedAccountId = String(accountId || "");
  if (!normalizedAccountId || typeof runtimeActiveSessionIds.delete !== "function") {
    return;
  }
  for (const session of Object.values(data.sessions)) {
    if (session && String(session.accountId || "") === normalizedAccountId && session.sessionId) {
      runtimeActiveSessionIds.delete(session.sessionId);
    }
  }
}

function revokeOtherSessionsForAccount(data, accountId, keepSessionId, now, runtimeActiveSessionIds) {
  const normalizedAccountId = String(accountId || "");
  const normalizedKeepSessionId = String(keepSessionId || "");
  const revokedSessions = [];
  if (!normalizedAccountId) {
    return {revokedSessions};
  }
  const timestamp = isoNow(now);
  for (const session of Object.values(data.sessions)) {
    if (
      !session ||
      String(session.accountId || "") !== normalizedAccountId ||
      String(session.sessionId || "") === normalizedKeepSessionId ||
      session.revokedAt
    ) {
      continue;
    }
    session.revokedAt = timestamp;
    session.revokedCode = SESSION_REPLACED_CODE;
    session.revokedReason = "replaced_by_login";
    session.revokedMessage = SESSION_REPLACED_MESSAGE;
    if (runtimeActiveSessionIds && typeof runtimeActiveSessionIds.delete === "function" && session.sessionId) {
      runtimeActiveSessionIds.delete(session.sessionId);
    }
    revokedSessions.push({
      sessionId: String(session.sessionId || ""),
      accountId: normalizedAccountId,
      createdAt: String(session.createdAt || ""),
      expiresAt: String(session.expiresAt || ""),
      revokedAt: timestamp,
      schemaVersion: 1,
    });
  }
  return {revokedSessions};
}

function sessionReplacementEvent(account, replacementSession, revokedSessions) {
  const sessions = Array.isArray(revokedSessions) ? revokedSessions.filter((session) => session && session.sessionId) : [];
  if (sessions.length <= 0) {
    return null;
  }
  return {
    type: "session.replaced",
    code: SESSION_REPLACED_CODE,
    reason: "replaced_by_login",
    message: SESSION_REPLACED_MESSAGE,
    accountId: String(account && account.accountId || ""),
    username: String(account && account.username || ""),
    displayName: String(account && (account.displayName || account.username) || ""),
    targetAccountIds: [String(account && account.accountId || "")].filter(Boolean),
    targetSessionIds: sessions.map((session) => session.sessionId),
    replacementSessionId: String(replacementSession && replacementSession.sessionId || ""),
  };
}

function sessionReplacementEventForToken(data, token, event = {}) {
  if (!event || event.type !== "session.replaced") {
    return {handled: false, result: null};
  }
  const session = sessionByToken(data, token);
  if (!session) {
    return {handled: true, result: fail("session_missing", "登录会话不存在。")};
  }
  const targetSessionIds = Array.isArray(event.targetSessionIds)
    ? event.targetSessionIds.map((value) => String(value || ""))
    : [];
  return {
    handled: true,
    result: ok({
      visible: targetSessionIds.includes(String(session.sessionId || "")),
      event,
    }),
  };
}

function sessionByToken(data, token) {
  const tokenHash = hashToken(String(token || ""));
  return Object.values(data.sessions).find((value) => value && value.tokenHash === tokenHash) || null;
}

function runtimeSessionWasRecorded(runtimeActiveSessionIds, sessionId) {
  return Boolean(runtimeActiveSessionIds && sessionId && runtimeActiveSessionIds.has(sessionId));
}

function runtimeSessionIsActive(runtimeActiveSessionIds, sessionId, nowMs) {
  if (!runtimeActiveSessionIds) {
    return true;
  }
  if (!sessionId || !runtimeActiveSessionIds.has(sessionId)) {
    return false;
  }
  if (typeof runtimeActiveSessionIds.get !== "function") {
    return true;
  }
  const lastSeenMs = Number(runtimeActiveSessionIds.get(sessionId));
  return Number.isFinite(lastSeenMs) && nowMs - lastSeenMs <= ONLINE_SESSION_IDLE_TTL_MS;
}

function resolveSession(data, token, now, options = {}) {
  const session = sessionByToken(data, token);
  if (!session) {
    return {"ok": false, "code": "session_missing", "message": "登录会话不存在。"};
  }
  if (session.revokedAt) {
    const revokedCode = String(session.revokedCode || "").trim() || "session_revoked";
    const revokedMessage = String(session.revokedMessage || "").trim() || "登录会话已失效。";
    return {"ok": false, "code": revokedCode, "message": revokedMessage};
  }
  const expiresMs = Date.parse(session.expiresAt);
  const nowMs = now();
  if (expiresMs <= nowMs) {
    if (!options.allowExpired) {
      return {"ok": false, "code": "session_expired", "message": "登录会话已过期。"};
    }
    const graceMs = Math.max(0, Number(options.refreshGraceMs || 0));
    if (expiresMs + graceMs <= nowMs) {
      return {"ok": false, "code": "session_refresh_expired", "message": "登录已过期，请重新登录。"};
    }
  }
  const account = Object.values(data.accounts).find((value) => value.accountId === session.accountId);
  if (!account) {
    return {"ok": false, "code": "account_missing", "message": "账号不存在。"};
  }
  const runtimeActiveSessionIds = options.runtimeActiveSessionIds || null;
  const hadRuntimeRecord = runtimeSessionWasRecorded(runtimeActiveSessionIds, session.sessionId);
  if (runtimeActiveSessionIds) {
    markRuntimeSessionActive(runtimeActiveSessionIds, session.sessionId, nowMs);
  }
  const serverStartedAtMs = Number(options.serverStartedAtMs || 0);
  const createdAtMs = Date.parse(session.createdAt);
  const recovered = Boolean(runtimeActiveSessionIds && !hadRuntimeRecord && Number.isFinite(createdAtMs) && createdAtMs < serverStartedAtMs);
  return {"ok": true, session, account, recovered};
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

function publicSession(session, account, data, token = "", options = {}) {
  const result = {
    sessionId: session.sessionId,
    username: account.username,
    effectiveRole: effectiveRoleIsGm(data, account, () => Date.now()) ? ROLE_GM : ROLE_PLAYER,
    expiresAt: session.expiresAt,
  };
  if (options.recovered) {
    result.recovered = true;
    result.requiresPositionResync = true;
    result.recoveryMessage = "已恢复登录，请重新同步当前位置。";
  }
  const upgrade = passwordUpgradePolicyForAccount(account);
  if (upgrade.required) {
    result.passwordUpgradeRequired = true;
    result.passwordPolicyMessage = upgrade.message;
  }
  if (token) {
    result.token = token;
  }
  return result;
}

function sessionRecoveryPayload(data, account, recovered) {
  return {
    recovered: Boolean(recovered),
    requiresPositionResync: Boolean(recovered),
    hasRuntimePosition: Boolean(data.playerPositions[account.accountId]),
    message: recovered ? "已恢复登录，请重新同步当前位置。" : "",
  };
}

function publicRuntimePositionForAccount(data, accountId) {
  const position = data && data.playerPositions ? data.playerPositions[String(accountId || "")] || null : null;
  return position ? publicPlayerPosition(position) : null;
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
  const hasPublicCell = playerPositionPublicPrecision(position) === "cell";
  return {
    mapId: position.mapId,
    cellX: hasPublicCell ? Number(position.cellX || 0) : 0,
    cellY: hasPublicCell ? Number(position.cellY || 0) : 0,
    facing: hasPublicCell ? position.facing : "south",
    moving: hasPublicCell ? Boolean(position.moving) : false,
    movementSeq: Number(position.movementSeq || 0),
    authority: String(position.authority || "client_snapshot"),
    hasCell: hasPublicCell,
    precision: hasPublicCell ? "cell" : "map",
    updatedAt: position.updatedAt,
    schemaVersion: 1,
  };
}

function playerPositionHasCell(position) {
  if (!position || typeof position !== "object") {
    return false;
  }
  if (position.hasCell === false) {
    return false;
  }
  const cellX = Number(position.cellX);
  const cellY = Number(position.cellY);
  return Number.isFinite(cellX) && Number.isFinite(cellY);
}

function playerPositionPublicPrecision(position) {
  if (!position || typeof position !== "object") {
    return "map";
  }
  const precision = String(position.publicPrecision || position.precision || "").trim().toLowerCase();
  if (precision === "map") {
    return "map";
  }
  return playerPositionHasCell(position) ? "cell" : "map";
}

function publicMail(mail) {
  const result = {
    mailId: mail.mailId,
    mailKind: String(mail.mailKind || ""),
    senderUsername: mail.senderUsername,
    senderDisplayName: mail.senderDisplayName,
    recipientUsername: mail.recipientUsername,
    recipientDisplayName: mail.recipientDisplayName,
    title: mail.title,
    body: mail.body,
    items: normalizeMailItems(mail.items || []),
    currency: normalizeMailCurrency(mail.currency || mail.currencies || {}),
    createdAt: mail.createdAt,
    readAt: mail.readAt || null,
    schemaVersion: Number(mail.schemaVersion) === 2 ? 2 : 1,
  };
  if (result.schemaVersion === 2 || Object.hasOwn(mail, "equipmentEnvelopes")) {
    const equipmentOptions = {
      ...equipmentWearRulesFromDocument(playerGrowthDocument()),
      expToNextLevel: battleExpToNextLevel,
      maxPlayerLevel: MAX_PLAYER_LEVEL,
    };
    result.equipmentEnvelopes = (Array.isArray(mail.equipmentEnvelopes) ? mail.equipmentEnvelopes : []).map((envelope) => (
      publicEquipmentTransferSummary(envelope, battleEquipmentCatalog, equipmentOptions)
    ));
  }
  return result;
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

function normalizeMailCurrency(value) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const result = {};
  const stoneCoins = Math.max(0, Math.trunc(Number(raw.stoneCoins || raw.coins || 0)));
  const diamonds = Math.max(0, Math.trunc(Number(raw.diamonds || raw.diamond || 0)));
  if (stoneCoins > 0) {
    result[SHOP_CURRENCY_STONE_COINS] = stoneCoins;
  }
  if (diamonds > 0) {
    result[SHOP_CURRENCY_DIAMONDS] = diamonds;
  }
  return result;
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

function partyStatePayload(data, accountId, options = {}) {
  return {
    party: publicPartyForAccount(data, accountId, options),
    incomingInvites: publicIncomingPartyInvites(data, accountId),
    maxMembers: PARTY_MAX_MEMBERS,
  };
}

function publicPartyForAccount(data, accountId, options = {}) {
  const party = partyForAccount(data, accountId);
  return party ? publicParty(party, data, options) : null;
}

function publicParty(party, data, options = {}) {
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
      ...publicPartyMemberPresence(data, party, account.accountId, options),
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
    room: publicBattleRoom(activeRoom || closedRoom, accountId),
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

function publicBattleRoom(room, viewerAccountId = "") {
  if (!room) {
    return null;
  }
  const normalizedViewerAccountId = String(viewerAccountId || "");
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
    battle: publicBattleRoomBattle(room.battle || null, normalizedViewerAccountId),
    closeReason: String(room.closeReason || ""),
    closedByAccountId: String(room.closedByAccountId || ""),
    closedAt: room.closedAt || "",
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    schemaVersion: 1,
  };
}

function publicBattleRoomBattle(battle, viewerAccountId = "") {
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
    profileWriteback: publicBattleProfileWriteback(battle.profileWriteback || null, viewerAccountId),
    commandDeadlineAt: battle.commandDeadlineAt || "",
    updatedAt: battle.updatedAt || "",
    schemaVersion: 1,
  };
}

function publicBattleProfileWriteback(writeback, viewerAccountId = "") {
  if (!writeback || typeof writeback !== "object" || Array.isArray(writeback)) {
    return null;
  }
  const normalizedViewerAccountId = String(viewerAccountId || "");
  const visibleProfiles = normalizedViewerAccountId === ""
    ? []
    : (Array.isArray(writeback.profiles) ? writeback.profiles : [])
      .filter((entry) => String(entry && entry.accountId || "") === normalizedViewerAccountId);
  const visibleSkips = normalizedViewerAccountId === ""
    ? []
    : (Array.isArray(writeback.skippedProfiles) ? writeback.skippedProfiles : [])
      .filter((entry) => String(entry && entry.accountId || "") === normalizedViewerAccountId);
  return {
    kind: String(writeback.kind || "battle_profile_writeback"),
    roomId: String(writeback.roomId || ""),
    reason: String(writeback.reason || ""),
    updatedAt: String(writeback.updatedAt || ""),
    profiles: visibleProfiles.map(publicBattleProfileWritebackEntry),
    skippedProfiles: clone(visibleSkips),
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
    ridePetHp: entry.ridePetHp && typeof entry.ridePetHp === "object" ? clone(entry.ridePetHp) : null,
    petHps: Array.isArray(entry.petHps) ? clone(entry.petHps) : [],
    equipmentWear: entry.equipmentWear && typeof entry.equipmentWear === "object" && !Array.isArray(entry.equipmentWear)
      ? clone(entry.equipmentWear)
      : null,
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
    manorWarId: String(result.manorWarId || ""),
    manorBattleId: String(result.manorBattleId || ""),
    manorId: String(result.manorId || ""),
    winnerFamilyId: String(result.winnerFamilyId || ""),
    winnerFamilyName: String(result.winnerFamilyName || ""),
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
    kind: String(entry.kind || "record_point_return"),
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
    ridePetKnocked: Boolean(actor.ridePetKnocked),
    rideBaseStats: actor.rideBaseStats && typeof actor.rideBaseStats === "object" && !Array.isArray(actor.rideBaseStats)
      ? clone(actor.rideBaseStats)
      : {},
    rideAttackStyle: String(actor.rideAttackStyle || ""),
    hp: Number(actor.hp || 0),
    maxHp: Number(actor.maxHp || BATTLE_ACTOR_MAX_HP),
    speed: Number(actor.speed || 0),
    attack: Number(actor.attack || 0),
    defense: Number(actor.defense || 0),
    guarding: Boolean(actor.guarding),
    defeated: Boolean(actor.defeated),
    escaped: Boolean(actor.escaped),
    catchable: Boolean(actor.catchable),
    captureDifficulty: Math.max(0, Math.trunc(Number(actor.captureDifficulty || 0))),
    captured: Boolean(actor.captured),
    capturedByAccountId: String(actor.capturedByAccountId || ""),
    actionState: String(actor.actionState || (Number(actor.hp || 0) <= 0 ? "down" : "idle")),
    launched: Boolean(actor.launched),
    revivable: Object.prototype.hasOwnProperty.call(actor, "revivable") ? Boolean(actor.revivable) : true,
    launchHpBefore: Math.max(0, Math.trunc(Number(actor.launchHpBefore || 0))),
    activeSkillIds: Array.isArray(actor.activeSkillIds) ? actor.activeSkillIds.map((value) => String(value)) : [],
    petSkillSlots: Array.isArray(actor.petSkillSlots) ? actor.petSkillSlots.map((value) => String(value)) : [],
    forgottenSkillIds: Array.isArray(actor.forgottenSkillIds) ? actor.forgottenSkillIds.map((value) => String(value)) : [],
    passiveSkillIds: Array.isArray(actor.passiveSkillIds) ? actor.passiveSkillIds.map((value) => String(value)) : [],
    spiritIds: Array.isArray(actor.spiritIds) ? actor.spiritIds.map((value) => String(value)).filter(Boolean) : [],
    battleActionIds: Array.isArray(actor.battleActionIds) ? actor.battleActionIds.map((value) => String(value)).filter(Boolean) : [],
    attackActionId: String(actor.attackActionId || ""),
    equipmentStatBonus: actor.equipmentStatBonus && typeof actor.equipmentStatBonus === "object" && !Array.isArray(actor.equipmentStatBonus)
      ? clone(actor.equipmentStatBonus)
      : {},
    equipmentStatSummary: actor.equipmentStatSummary && typeof actor.equipmentStatSummary === "object" && !Array.isArray(actor.equipmentStatSummary)
      ? clone(actor.equipmentStatSummary)
      : {},
    statuses: publicBattleStatuses(actor.statuses),
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
  const hasCanonicalBackpack = Boolean(profile && Array.isArray(profile.backpackSlots));
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
    bag[toolId] = hasCanonicalBackpack ? slotCount : fallbackCount;
  }
  return bag;
}

function profileBackpackSlots(profile) {
  if (profile && Array.isArray(profile.backpackSlots)) {
    return profile.backpackSlots;
  }
  const legacyCaptureTools = profile && profile.captureTools && typeof profile.captureTools === "object" && !Array.isArray(profile.captureTools)
    ? profile.captureTools
    : {};
  const counts = {};
  for (const toolId of battleCaptureToolIds()) {
    if (toolId === BATTLE_CAPTURE_TOOL_EMPTY_HAND || !battleCaptureToolIsConsumable(toolId)) {
      continue;
    }
    const count = Math.max(0, Math.trunc(Number(legacyCaptureTools[toolId] || 0)));
    if (count > 0) {
      counts[toolId] = count;
    }
  }
  return backpackSlotsFromCounts(counts, BACKPACK_BASE_SLOT_LIMIT);
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
let manorDocumentCache = null;
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

function manorDocument() {
  if (!manorDocumentCache) {
    manorDocumentCache = loadDataDocument("manors.json");
  }
  return manorDocumentCache;
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

function executePlayerRebirthToProfile(profile, options = {}) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return {ok: false, code: "profile_missing", message: "请先创建角色档案。"};
  }
  const backpackConflict = rawBackpackAssetConflict(profile);
  if (backpackConflict) {
    return backpackConflict;
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
  const rewardItems = playerRebirthRewardItemsForTarget(targetCount);
  const rewardProfilePreflight = clone(profile);
  const consumePreflight = consumePlayerRebirthTrialRequirements(rewardProfilePreflight, targetCount);
  if (!consumePreflight.ok) {
    return consumePreflight;
  }
  const rewardPreflight = addRewardItemsToBackpack(profileBackpackSlots(rewardProfilePreflight), rewardItems);
  if (rewardPreflight.lostItems.length > 0) {
    return {
      ok: false,
      code: "player_rebirth_backpack_full",
      message: "请先留出背包空位，再进行转生；转生奖励不会通过丢失处理。",
    };
  }
  rewardProfilePreflight.backpackSlots = rewardPreflight.slots;
  const instancePreflight = grantFreshBackpackEquipmentInstances(
    rewardProfilePreflight,
    battleEquipmentCatalog,
    rewardPreflight.addedItems,
    `player_rebirth_${targetCount}`,
    {expToNextLevel: battleExpToNextLevel},
  );
  if (!instancePreflight.ok) {
    return instancePreflight;
  }
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

  const rewardResult = addRewardItemsToBackpack(profileBackpackSlots(profile), rewardItems);
  profile.backpackSlots = rewardResult.slots;
  const instanceGrant = grantFreshBackpackEquipmentInstances(
    profile,
    battleEquipmentCatalog,
    rewardResult.addedItems,
    `player_rebirth_${targetCount}`,
    {expToNextLevel: battleExpToNextLevel},
  );
  if (!instanceGrant.ok) {
    return instanceGrant;
  }
  profile.captureTools = captureToolBagFromProfile(profile);
  const starterResult = appendPlayerRebirthStarterPetToProfile(profile, targetCount, options.newPetFactory);
  if (!starterResult.ok) {
    return starterResult;
  }
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
  synchronizeProfileEquipmentStats(profile);
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

function appendPlayerRebirthStarterPetToProfile(profile, targetCount, newPetFactory) {
  const plan = playerRebirthStarterPetPlanForTarget(targetCount);
  const formId = String(plan.formId || "").trim();
  if (!formId) {
    return {ok: true, starterPet: {}};
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
  let starterPet;
  try {
    starterPet = createPlayerRebirthStarterPet(
      instanceId,
      String(plan.name || ""),
      formId,
      state,
      serial,
      newPetFactory,
    );
  } catch (_error) {
    return {ok: false, code: "pet_creation_failed", message: "转生赠宠创建失败，本次转生未结算。"};
  }
  if (Object.keys(starterPet).length <= 0) {
    return {ok: false, code: "pet_template_missing", message: "转生赠宠模板不存在，本次转生未结算。"};
  }
  profile.petInstances.push(starterPet);
  profile.nextPetInstanceSerial = serial + 1;
  if (state === BATTLE_PET_STATE_BATTLE) {
    profile.activePetInstanceId = instanceId;
  }
  recordProfilePetCodexForm(profile, formId, false);
  return {ok: true, starterPet};
}

function createPlayerRebirthStarterPet(instanceId, name, formId, state, serial, newPetFactory) {
  const template = petTemplateForFormId(formId);
  if (!template || Object.keys(template).length <= 0) {
    return {};
  }
  const baseStats = objectOrEmpty(template.baseStats);
  const maxHp = Math.max(1, Math.trunc(Number(baseStats.maxHp || DEFAULT_PET_BATTLE_STATS.maxHp)));
  const candidate = {
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
    isNew: true,
    schemaVersion: 1,
  };
  return newPetFactory.finalizeLevelOne(candidate, {
    purpose: "player_rebirth_reward_growth",
  }).pet;
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

function isEquipmentAssetItemId(itemId) {
  const normalizedItemId = String(itemId || "").trim();
  if (catalogHasEquipmentItemId(battleEquipmentCatalog, normalizedItemId)) {
    return true;
  }
  const bagItem = bagItemById(normalizedItemId);
  return Boolean(bagItem && Array.isArray(bagItem.useContexts) && bagItem.useContexts.includes("equipment"));
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

function validateEquipmentSlotInstanceCompatibility(profile, equipped) {
  if (!equipped || !equipped.ok) {
    return equipped || {ok: false, code: "equipment_slot_instance_conflict", message: "装备实例档案异常，请联系GM处理。"};
  }
  const slotId = String(equipped.slotId || "").trim();
  const itemId = String(equipped.itemId || "").trim();
  const instance = objectOrEmpty(equipped.instance);
  const maxDurability = equipmentItemMaxDurability(itemId);
  if (maxDurability > 0) {
    const slotDurability = clampInt(objectOrEmpty(profile.equipmentDurability)[slotId], 0, maxDurability, maxDurability);
    const instanceDurability = clampInt(instance.durability, 0, maxDurability, maxDurability);
    if (slotDurability !== instanceDurability) {
      return {ok: false, code: "equipment_slot_instance_conflict", message: "装备耐久与实例档案不一致，请联系GM处理。"};
    }
    const slotWear = normalizeEquipmentWearCounter(itemId, objectOrEmpty(profile.equipmentWearCounters)[slotId]);
    const instanceWear = normalizeEquipmentWearCounter(itemId, instance.wearCounters);
    if (JSON.stringify(slotWear) !== JSON.stringify(instanceWear)) {
      return {ok: false, code: "equipment_slot_instance_conflict", message: "装备磨损与实例档案不一致，请联系GM处理。"};
    }
  }
  if (equipmentItemEnhanceMax(itemId) > 0) {
    const slotEnhancement = normalizeEquipmentEnhancement(itemId, objectOrEmpty(profile.equipmentEnhancement)[slotId]);
    const instanceEnhancement = normalizeEquipmentEnhancement(itemId, instance.enhancement);
    if (JSON.stringify(slotEnhancement) !== JSON.stringify(instanceEnhancement)) {
      return {ok: false, code: "equipment_slot_instance_conflict", message: "装备强化与实例档案不一致，请联系GM处理。"};
    }
  }
  if (slotId === "exp_pill") {
    const slotCharge = normalizeEquipmentExpPillCharge(itemId, profile.equipmentExpPillCharge);
    const instanceCharge = normalizeEquipmentExpPillCharge(itemId, instance.expPillCharge);
    if (JSON.stringify(slotCharge) !== JSON.stringify(instanceCharge)) {
      return {ok: false, code: "equipment_slot_instance_conflict", message: "经验丹储存进度与实例档案不一致，请联系GM处理。"};
    }
  }
  return {ok: true};
}

function equipItemToProfile(profile, itemId, options = {}) {
  const backpackConflict = rawBackpackAssetConflict(profile);
  if (backpackConflict) {
    return backpackConflict;
  }
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
  const previousItemId = String(slots[slotId] || "").trim();
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

  if (previousItemId) {
    const previousEquipped = requireEquippedEquipmentInstance(profile, battleEquipmentCatalog, slotId);
    if (!previousEquipped.ok) {
      return previousEquipped;
    }
    const previousCompatibility = validateEquipmentSlotInstanceCompatibility(profile, previousEquipped);
    if (!previousCompatibility.ok) {
      return previousCompatibility;
    }
  }
  const instanceMove = moveBackpackEquipmentInstanceToSlot(
    profile,
    battleEquipmentCatalog,
    normalizedItemId,
    slotId,
    {instanceId: options.instanceId},
  );
  if (!instanceMove.ok) {
    return instanceMove;
  }
  const backpackInstanceId = instanceMove.instanceId;
  const previousInstanceId = instanceMove.previousInstanceId;
  const instances = profile.equipmentInstances;
  const slotInstanceIds = profile.equipmentSlotInstanceIds;

  slots[slotId] = normalizedItemId;

  const durability = equipmentDurabilityFromProfile(profile);
  const enhancement = equipmentEnhancementFromProfile(profile);
  const wearCounters = equipmentWearCountersFromProfile(profile);
  const maxDurability = equipmentItemMaxDurability(normalizedItemId);
  const equippedRecord = instances[backpackInstanceId] || {};
  if (maxDurability > 0) {
    durability[slotId] = clampInt(equippedRecord.durability, 0, maxDurability, maxDurability);
    wearCounters[slotId] = normalizeEquipmentWearCounter(normalizedItemId, equippedRecord.wearCounters);
    instances[backpackInstanceId].durability = durability[slotId];
    instances[backpackInstanceId].wearCounters = {
      ...objectOrEmpty(instances[backpackInstanceId].wearCounters),
      ...wearCounters[slotId],
    };
  } else {
    delete durability[slotId];
    delete wearCounters[slotId];
  }
  if (equipmentItemEnhanceMax(normalizedItemId) > 0) {
    enhancement[slotId] = normalizeEquipmentEnhancement(normalizedItemId, equippedRecord.enhancement);
    instances[backpackInstanceId].enhancement = {
      ...objectOrEmpty(instances[backpackInstanceId].enhancement),
      ...enhancement[slotId],
    };
  } else {
    delete enhancement[slotId];
  }
  if (slotId === "exp_pill") {
    const charge = normalizeEquipmentExpPillCharge(normalizedItemId, equippedRecord.expPillCharge);
    profile.equipmentExpPillCharge = charge;
    instances[backpackInstanceId].expPillCharge = {
      ...objectOrEmpty(instances[backpackInstanceId].expPillCharge),
      ...charge,
    };
  }

  profile.backpackSlots = normalizeBackpackSlots(backpackAfterTake);
  profile.captureTools = captureToolBagFromProfile(profile);
  profile.equipmentInstances = instances;
  profile.equipmentSlotInstanceIds = slotInstanceIds;
  profile.equipmentSlots = slots;
  profile.equipmentDurability = durability;
  profile.equipmentEnhancement = enhancement;
  profile.equipmentWearCounters = wearCounters;
  profile.equipmentSlotsVersion = EQUIPMENT_SLOTS_VERSION;
  synchronizeProfileEquipmentStats(profile);

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

function unequipEquipmentSlotFromProfile(profile, slotId) {
  const backpackConflict = rawBackpackAssetConflict(profile);
  if (backpackConflict) {
    return backpackConflict;
  }
  const normalizedSlotId = String(slotId || "").trim();
  if (!equipmentSlotIds().includes(normalizedSlotId)) {
    return {ok: false, code: "equipment_slot_invalid", message: "装备槽无效。"};
  }
  const slots = equipmentSlotsFromProfile(profile);
  const itemId = String(slots[normalizedSlotId] || "").trim();
  if (!itemId) {
    return {ok: false, code: "equipment_slot_empty", slotId: normalizedSlotId, message: "这个装备槽没有装备。"};
  }
  if (normalizedSlotId === "exp_pill" && equipmentExpPillChargeHasProgress(slots, profile.equipmentExpPillCharge)) {
    return {ok: false, code: "equipment_exp_pill_locked", message: "经验丹已储存经验，暂不能卸下。"};
  }

  const backpackSlots = normalizeBackpackSlots(profileBackpackSlots(profile));
  const returnResult = addSingleItemToBackpack(backpackSlots, itemId, 1);
  if (returnResult.addedCount < 1) {
    return {ok: false, code: "backpack_full", message: `背包已满，无法卸下${equipmentItemLabel(itemId)}。`};
  }

  const durability = equipmentDurabilityFromProfile(profile);
  const enhancement = equipmentEnhancementFromProfile(profile);
  const wearCounters = equipmentWearCountersFromProfile(profile);
  const equipped = requireEquippedEquipmentInstance(profile, battleEquipmentCatalog, normalizedSlotId);
  if (!equipped.ok) {
    return equipped;
  }
  const compatibility = validateEquipmentSlotInstanceCompatibility(profile, equipped);
  if (!compatibility.ok) {
    return compatibility;
  }
  const instanceMove = moveEquippedEquipmentInstanceToBackpack(profile, battleEquipmentCatalog, normalizedSlotId);
  if (!instanceMove.ok) {
    return instanceMove;
  }
  const instanceId = instanceMove.instanceId;
  const instances = profile.equipmentInstances;
  const record = {...instances[instanceId]};
  if (equipmentItemMaxDurability(itemId) > 0) {
    record.durability = durability[normalizedSlotId];
    record.wearCounters = {...objectOrEmpty(record.wearCounters), ...wearCounters[normalizedSlotId]};
  }
  if (equipmentItemEnhanceMax(itemId) > 0) {
    record.enhancement = {...objectOrEmpty(record.enhancement), ...enhancement[normalizedSlotId]};
  }
  if (normalizedSlotId === "exp_pill") {
    record.expPillCharge = {
      ...objectOrEmpty(record.expPillCharge),
      ...normalizeEquipmentExpPillCharge(itemId, profile.equipmentExpPillCharge),
    };
  }
  instances[instanceId] = record;

  delete slots[normalizedSlotId];
  delete durability[normalizedSlotId];
  delete enhancement[normalizedSlotId];
  delete wearCounters[normalizedSlotId];
  if (normalizedSlotId === "exp_pill") {
    profile.equipmentExpPillCharge = {};
  }

  profile.backpackSlots = normalizeBackpackSlots(returnResult.slots);
  profile.captureTools = captureToolBagFromProfile(profile);
  profile.equipmentInstances = instances;
  profile.equipmentSlots = slots;
  profile.equipmentDurability = durability;
  profile.equipmentEnhancement = enhancement;
  profile.equipmentWearCounters = wearCounters;
  profile.equipmentSlotsVersion = EQUIPMENT_SLOTS_VERSION;
  synchronizeProfileEquipmentStats(profile);

  return {
    ok: true,
    message: `卸下${equipmentItemLabel(itemId)}。`,
    itemId,
    slotId: normalizedSlotId,
    instanceId,
  };
}

function enhanceEquipmentSlotToProfile(profile, slotId) {
  const backpackConflict = rawBackpackAssetConflict(profile);
  if (backpackConflict) {
    return backpackConflict;
  }
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

  const equipped = requireEquippedEquipmentInstance(profile, battleEquipmentCatalog, normalizedSlotId);
  if (!equipped.ok) {
    return equipped;
  }
  const compatibility = validateEquipmentSlotInstanceCompatibility(profile, equipped);
  if (!compatibility.ok) {
    return compatibility;
  }
  const instances = equipped.state.instances;
  const instanceId = equipped.instanceId;

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
    enhancement: {...objectOrEmpty(instances[instanceId].enhancement), ...record},
  };
  profile.backpackSlots = normalizeBackpackSlots(nextSlots);
  profile.captureTools = captureToolBagFromProfile(profile);
  profile.stoneCoins = currentCoins - stoneCost;
  profile.equipmentSlots = slots;
  profile.equipmentEnhancement = enhancement;
  profile.equipmentInstances = instances;
  profile.equipmentSlotsVersion = EQUIPMENT_SLOTS_VERSION;
  synchronizeProfileEquipmentStats(profile);

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
  const backpackConflict = rawBackpackAssetConflict(profile);
  if (backpackConflict) {
    return backpackConflict;
  }
  const slots = equipmentSlotsFromProfile(profile);
  const durability = equipmentDurabilityFromProfile(profile);
  const wearCounters = equipmentWearCountersFromProfile(profile);
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

  const equippedBySlot = new Map();
  let instances = null;
  for (const repaired of repairedSlots) {
    const equipped = requireEquippedEquipmentInstance(profile, battleEquipmentCatalog, repaired.slotId);
    if (!equipped.ok) {
      return equipped;
    }
    const compatibility = validateEquipmentSlotInstanceCompatibility(profile, equipped);
    if (!compatibility.ok) {
      return compatibility;
    }
    equippedBySlot.set(repaired.slotId, equipped);
    instances = equipped.state.instances;
  }

  for (const repaired of repairedSlots) {
    const slotId = String(repaired.slotId || "");
    const itemId = String(repaired.itemId || "");
    const maxDurability = equipmentItemMaxDurability(itemId);
    durability[slotId] = maxDurability;
    wearCounters[slotId] = normalizeEquipmentWearCounter(itemId, {});
    const instanceId = equippedBySlot.get(slotId).instanceId;
    instances[instanceId] = {
      ...instances[instanceId],
      itemId,
      location: "equipped",
      slotId,
      durability: maxDurability,
      wearCounters: {...objectOrEmpty(instances[instanceId].wearCounters), ...wearCounters[slotId]},
    };
  }

  profile.stoneCoins = currentCoins - cost;
  profile.equipmentSlots = slots;
  profile.equipmentDurability = durability;
  profile.equipmentWearCounters = wearCounters;
  profile.equipmentInstances = instances;
  profile.equipmentSlotsVersion = EQUIPMENT_SLOTS_VERSION;
  synchronizeProfileEquipmentStats(profile);
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
  const backpackConflict = rawBackpackAssetConflict(profile);
  if (backpackConflict) {
    return backpackConflict;
  }
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
  for (const material of materials) {
    if (!isEquipmentAssetItemId(material.itemId)) {
      continue;
    }
    const instanceConsume = consumeBackpackEquipmentInstances(
      profile,
      battleEquipmentCatalog,
      material.itemId,
      material.count,
    );
    if (!instanceConsume.ok) {
      return instanceConsume;
    }
  }
  profile.backpackSlots = normalizeBackpackSlots(addResult.slots);
  const instanceGrant = grantFreshBackpackEquipmentInstances(
    profile,
    battleEquipmentCatalog,
    [{itemId: outputItemId, count: outputCount}],
    "synthesis",
    {expToNextLevel: battleExpToNextLevel},
  );
  if (!instanceGrant.ok) {
    return instanceGrant;
  }
  profile.captureTools = captureToolBagFromProfile(profile);
  profile.stoneCoins = currentCoins - stoneCost;
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
    instanceIds: instanceGrant.instanceIds,
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
  const equipmentItem = equipmentItemById(itemId) || {};
  if (!item || equipmentItem.expPill !== true || String(equipmentItem.slot || "") !== "exp_pill") {
    return {};
  }
  const raw = objectOrEmpty(value);
  const worldUse = objectOrEmpty(item.worldUse);
  const baseLevel = Math.max(1, Math.trunc(Number(
    equipmentItem.expPillLevel || item.worldExpLevel || worldUse.level || item.level || 1,
  )));
  const award = playerLevelRuntime.awardEntry({
    level: Math.max(baseLevel, clampInt(raw.level, 1, MAX_PLAYER_LEVEL, baseLevel)),
    exp: Math.max(0, Math.trunc(Number(raw.exp || 0))),
  }, 0, MAX_PLAYER_LEVEL);
  return {
    itemId,
    level: Math.max(baseLevel, award.level),
    exp: award.level >= MAX_PLAYER_LEVEL ? 0 : award.exp,
    nextExp: battleExpToNextLevel(Math.max(baseLevel, award.level)),
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
  const equipmentItem = equipmentItemById(itemId) || {};
  const worldUse = objectOrEmpty(item.worldUse);
  const baseLevel = Math.max(1, Math.trunc(Number(
    equipmentItem.expPillLevel || item.worldExpLevel || worldUse.level || item.level || 1,
  )));
  return Math.trunc(Number(charge.level || baseLevel)) > baseLevel || Math.trunc(Number(charge.exp || 0)) > 0;
}

function battlePlayerSnapshotFromProfile(profile, account) {
  const player = profile && profile.player && typeof profile.player === "object" ? profile.player : {};
  const equipmentStats = resolveEquipmentBattleStats(profile, battleEquipmentCatalog, {requireInstances: true});
  const baseStats = equipmentStats.effectiveStats;
  const maxHp = positiveNumber(baseStats.maxHp, DEFAULT_PLAYER_BATTLE_STATS.maxHp);
  const ride = ridingPetSnapshotFromProfile(profile);
  const rideBaseStats = {
    attack: positiveNumber(baseStats.attack, DEFAULT_PLAYER_BATTLE_STATS.attack),
    defense: positiveNumber(baseStats.defense, DEFAULT_PLAYER_BATTLE_STATS.defense),
    quick: positiveNumber(baseStats.quick, DEFAULT_PLAYER_BATTLE_STATS.quick),
  };
  const rideAttackStyle = equipmentStats.attackStyle;
  const ridingStats = String(ride.ridePetInstanceId || "") !== ""
    ? resolveRidingBattleStats(rideBaseStats, {
      attack: ride.ridePetAttack,
      defense: ride.ridePetDefense,
      quick: ride.ridePetQuick,
    }, rideAttackStyle)
    : {...rideBaseStats, speed: rideBaseStats.quick};
  return {
    kind: BATTLE_ACTOR_KIND_PLAYER,
    name: String(player.name || account.displayName || account.username || "猎人"),
    level: positiveNumber(player.level, 1),
    hp: clampNumber(equipmentStats.currentHp, 1, maxHp, maxHp),
    maxHp,
    attack: ridingStats.attack,
    defense: ridingStats.defense,
    quick: ridingStats.quick,
    rideBaseStats,
    rideAttackStyle: String(ride.ridePetInstanceId || "") !== "" ? rideAttackStyle : "",
    ...ride,
    spiritIds: equipmentStats.spiritIds.filter((spiritId) => Boolean(battleSpiritActionById(spiritId))),
    battleActionIds: equipmentStats.battleActionIds.filter((actionId) => Boolean(battleActionById(actionId))),
    attackActionId: battleActionById(equipmentStats.attackActionId) ? equipmentStats.attackActionId : "",
    equipmentStatBonus: clone(equipmentStats.equipmentBonus),
    equipmentStatSummary: {
      base: clone(equipmentStats.baseStats),
      bonus: clone(equipmentStats.equipmentBonus),
      current: clone(equipmentStats.effectiveStats),
      schemaVersion: 1,
    },
    equipmentWearUsage: {weaponAttacks: 0, armorHits: 0},
    comboRateOverride: battleComboRateOverrideValue(player.comboRateOverride),
    schemaVersion: 1,
  };
}

function synchronizeProfileEquipmentStats(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return {changed: false, stats: null};
  }
  if (!profile.player || typeof profile.player !== "object" || Array.isArray(profile.player)) {
    profile.player = {};
  }
  const stats = resolveEquipmentBattleStats(profile, battleEquipmentCatalog, {requireInstances: true});
  const player = profile.player;
  const previousHp = Number(player.hp);
  const previousMaxHp = Number(player.maxHp);
  const previousBaseStats = JSON.stringify(objectOrEmpty(player.baseStats));
  player.baseStats = clone(stats.baseStats);
  player.maxHp = stats.effectiveStats.maxHp;
  player.hp = clampNumber(player.hp, 1, player.maxHp, player.maxHp);
  return {
    changed: (
      !Number.isFinite(previousHp) || previousHp !== player.hp
      || !Number.isFinite(previousMaxHp) || previousMaxHp !== player.maxHp
      || previousBaseStats !== JSON.stringify(player.baseStats)
    ),
    stats,
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
    ridePetAttack: positiveNumber(pet.attack, DEFAULT_PET_BATTLE_STATS.attack),
    ridePetDefense: positiveNumber(pet.defense, DEFAULT_PET_BATTLE_STATS.defense),
    ridePetQuick: positiveNumber(pet.quick, DEFAULT_PET_BATTLE_STATS.quick),
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
  const activeSkillIds = petActiveSkillIdsForSource(pet);
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
    activeSkillIds,
    petSkillSlots: petSkillSlotsForSkillIds(activeSkillIds, pet.petSkillSlots),
    forgottenSkillIds: uniqueStringArray(pet.forgottenSkillIds),
    passiveSkillIds: petPassiveSkillIdsForSource(pet),
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
  const activeSkillIds = petActiveSkillIdsForSource(pet);
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
    activeSkillIds,
    petSkillSlots: petSkillSlotsForSkillIds(activeSkillIds, pet.petSkillSlots),
    forgottenSkillIds: uniqueStringArray(pet.forgottenSkillIds),
    passiveSkillIds: petPassiveSkillIdsForSource(pet),
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
  const timestamp = isoNow(now);
  const party = {
    partyId: `party_${randomId()}`,
    leaderAccountId,
    memberAccountIds: [leaderAccountId],
    memberPresence: {
      [leaderAccountId]: {
        accountId: leaderAccountId,
        online: true,
        connectionState: "online",
        offlineSince: null,
        autoKickAt: null,
        updatedAt: timestamp,
        schemaVersion: 1,
      },
    },
    createdAt: timestamp,
    updatedAt: timestamp,
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

function removeAccountFromParty(data, accountId, now) {
  const normalizedAccountId = String(accountId || "");
  const party = partyForAccount(data, normalizedAccountId);
  const result = {
    changed: false,
    party: null,
    partyDeleted: false,
    partyId: "",
    removedAccountIds: [],
    targetAccountIds: normalizedAccountId ? [normalizedAccountId] : [],
  };
  if (!party || !party.partyId || !normalizedAccountId) {
    return result;
  }
  const beforeMemberIds = partyMemberAccountIds(party);
  const nextMemberIds = beforeMemberIds.filter((memberAccountId) => memberAccountId !== normalizedAccountId);
  const targetAccountIds = Array.from(new Set(beforeMemberIds.concat([normalizedAccountId]).filter(Boolean)));
  const partyId = party.partyId;
  const presence = partyPresenceForMutation(party);
  delete presence[normalizedAccountId];
  result.changed = true;
  result.partyId = partyId;
  result.removedAccountIds = [normalizedAccountId];
  result.targetAccountIds = targetAccountIds;
  if (nextMemberIds.length <= 0) {
    delete data.parties[partyId];
    expirePendingPartyInvites(data, partyId, now);
    result.partyDeleted = true;
    return result;
  }
  party.memberAccountIds = nextMemberIds;
  if (!nextMemberIds.includes(String(party.leaderAccountId || ""))) {
    party.leaderAccountId = nextMemberIds[0];
  }
  party.updatedAt = isoNow(now);
  data.parties[partyId] = party;
  result.party = party;
  return result;
}

function partyMemberAccountIds(party) {
  if (!party || !Array.isArray(party.memberAccountIds)) {
    return [];
  }
  const seen = new Set();
  const result = [];
  for (const rawAccountId of party.memberAccountIds) {
    const accountId = String(rawAccountId || "");
    if (!accountId || seen.has(accountId)) {
      continue;
    }
    seen.add(accountId);
    result.push(accountId);
  }
  return result;
}

function partyPresenceForMutation(party) {
  if (!party.memberPresence || typeof party.memberPresence !== "object" || Array.isArray(party.memberPresence)) {
    party.memberPresence = {};
  }
  return party.memberPresence;
}

function partyPresenceRecord(party, accountId) {
  const presence = party && party.memberPresence && typeof party.memberPresence === "object" && !Array.isArray(party.memberPresence)
    ? party.memberPresence[String(accountId || "")]
    : null;
  return presence && typeof presence === "object" && !Array.isArray(presence) ? presence : {};
}

function samePartyPresence(previous, next) {
  return (
    previous &&
    String(previous.accountId || "") === String(next.accountId || "") &&
    Boolean(previous.online) === Boolean(next.online) &&
    String(previous.connectionState || "") === String(next.connectionState || "") &&
    String(previous.offlineSince || "") === String(next.offlineSince || "") &&
    String(previous.autoKickAt || "") === String(next.autoKickAt || "")
  );
}

function refreshPartyPresence(data, party, now, runtimeActiveSessionIds = null, options = {}) {
  const result = {
    party: party || null,
    changed: false,
    partyDeleted: false,
    removedAccountIds: [],
    targetAccountIds: [],
  };
  if (!party || !party.partyId) {
    return result;
  }
  const timestamp = isoNow(now);
  const nowMs = now();
  const beforeMemberIds = partyMemberAccountIds(party);
  result.targetAccountIds = beforeMemberIds.slice();
  const presence = partyPresenceForMutation(party);
  const nextMemberIds = [];
  const removedAccountIds = [];
  for (const accountId of beforeMemberIds) {
    const account = accountById(data, accountId);
    if (!account) {
      removedAccountIds.push(accountId);
      delete presence[accountId];
      result.changed = true;
      continue;
    }
    const activity = accountRuntimeActivity(data, accountId, now, runtimeActiveSessionIds);
    const online = activity.online;
    const previous = partyPresenceRecord(party, accountId);
    if (online) {
      const next = {
        accountId,
        online: true,
        connectionState: "online",
        offlineSince: null,
        autoKickAt: null,
        updatedAt: previous.updatedAt || timestamp,
        schemaVersion: 1,
      };
      if (!samePartyPresence(previous, next)) {
        next.updatedAt = timestamp;
        presence[accountId] = next;
        result.changed = true;
      }
      nextMemberIds.push(accountId);
      continue;
    }
    let offlineSinceMs = Date.parse(previous.offlineSince);
    if (!Number.isFinite(offlineSinceMs)) {
      offlineSinceMs = Number.isFinite(activity.lastSeenMs)
        ? Math.min(nowMs, activity.lastSeenMs + ONLINE_SESSION_IDLE_TTL_MS)
        : nowMs;
    }
    const offlineSince = new Date(offlineSinceMs).toISOString();
    const autoKickAt = new Date(offlineSinceMs + PARTY_OFFLINE_AUTO_KICK_MS).toISOString();
    if (options.kickExpired !== false && Date.parse(autoKickAt) <= nowMs) {
      removedAccountIds.push(accountId);
      delete presence[accountId];
      result.changed = true;
      continue;
    }
    const next = {
      accountId,
      online: false,
      connectionState: "offline",
      offlineSince,
      autoKickAt,
      updatedAt: previous.updatedAt || timestamp,
      schemaVersion: 1,
    };
    if (!samePartyPresence(previous, next)) {
      next.updatedAt = timestamp;
      presence[accountId] = next;
      result.changed = true;
    }
    nextMemberIds.push(accountId);
  }
  for (const accountId of Object.keys(presence)) {
    if (!nextMemberIds.includes(accountId)) {
      delete presence[accountId];
      result.changed = true;
    }
  }
  if (removedAccountIds.length > 0 || beforeMemberIds.length !== nextMemberIds.length || beforeMemberIds.some((accountId, index) => accountId !== nextMemberIds[index])) {
    party.memberAccountIds = nextMemberIds;
    result.changed = true;
  }
  result.removedAccountIds = removedAccountIds;
  if (nextMemberIds.length <= 0) {
    delete data.parties[party.partyId];
    expirePendingPartyInvites(data, party.partyId, now);
    result.party = null;
    result.partyDeleted = true;
    result.changed = true;
    return result;
  }
  if (!nextMemberIds.includes(String(party.leaderAccountId || ""))) {
    party.leaderAccountId = nextMemberIds[0];
    result.changed = true;
  }
  if (result.changed) {
    party.updatedAt = timestamp;
    data.parties[party.partyId] = party;
  }
  result.party = party;
  return result;
}

function expirePendingPartyInvites(data, partyId, now) {
  for (const invite of Object.values(data.partyInvites)) {
    if (invite && invite.partyId === partyId && invite.status === "pending") {
      invite.status = "expired";
      invite.updatedAt = isoNow(now);
      data.partyInvites[invite.inviteId] = invite;
    }
  }
}

function publicPartyMemberPresence(data, party, accountId, options = {}) {
  const presence = partyPresenceRecord(party, accountId);
  const canCheckRuntime = typeof options.now === "function";
  const online = canCheckRuntime
    ? accountHasActiveRuntimeSession(data, accountId, options.now, options.runtimeActiveSessionIds || null)
    : presence.online !== false;
  const offlineSince = online ? null : (presence.offlineSince || null);
  const autoKickAt = online ? null : (presence.autoKickAt || null);
  let offlineForMs = 0;
  if (!online && typeof options.now === "function") {
    const offlineSinceMs = Date.parse(offlineSince);
    if (Number.isFinite(offlineSinceMs)) {
      offlineForMs = Math.max(0, options.now() - offlineSinceMs);
    }
  }
  return {
    online,
    connectionState: online ? "online" : "offline",
    offlineSince,
    offlineForMs,
    autoKickAt,
    schemaVersion: 1,
  };
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
  const normalizedAccountId = String(accountId || "");
  return Object.values(data.battleRooms).find((room) => (
    room &&
    room.status !== "closed" &&
    (
      (Array.isArray(room.participantAccountIds) && room.participantAccountIds.includes(normalizedAccountId)) ||
      battleRoomHasDepartedParticipantForAccount(room, normalizedAccountId) ||
      battleRoomHasCapturedClaimForAccount(room, normalizedAccountId)
    )
  )) || null;
}

function battleRoomHasDepartedParticipantForAccount(room, accountId) {
  const normalizedAccountId = String(accountId || "");
  if (!room || normalizedAccountId === "") {
    return false;
  }
  const departed = room.departedParticipantsByAccountId;
  return Boolean(
    departed &&
    typeof departed === "object" &&
    !Array.isArray(departed) &&
    departed[normalizedAccountId]
  );
}

function battleRoomHasCapturedClaimForAccount(room, accountId) {
  const normalizedAccountId = String(accountId || "");
  if (!room || normalizedAccountId === "") {
    return false;
  }
  const battle = room.battle && typeof room.battle === "object" && !Array.isArray(room.battle) ? room.battle : {};
  if ((Array.isArray(battle.actors) ? battle.actors : []).some((actor) => (
    actor && Boolean(actor.captured) && String(actor.capturedByAccountId || "") === normalizedAccountId
  ))) {
    return true;
  }
  const candidates = battle.captureCandidatesByActorId && typeof battle.captureCandidatesByActorId === "object"
    ? battle.captureCandidatesByActorId
    : {};
  return Object.values(candidates).some((candidate) => (
    candidate && String(candidate.claimedByAccountId || candidate.claimantAccountId || candidate.ownerAccountId || "") === normalizedAccountId
  ));
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
      if (
        !room.participantAccountIds.includes(normalizedAccountId) &&
        !battleRoomHasCapturedClaimForAccount(room, normalizedAccountId) &&
        !(room.departedParticipantsByAccountId && room.departedParticipantsByAccountId[normalizedAccountId])
      ) {
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

function battleRoomAccountDisconnectedForMs(room, accountId, graceMs, now = () => Date.now()) {
  const state = battleRoomConnectionStateForMutation(room);
  const entry = state[String(accountId || "")] || {};
  if (entry.connected || !entry.disconnectedAt) {
    return false;
  }
  const disconnectedMs = Date.parse(entry.disconnectedAt);
  return Number.isFinite(disconnectedMs) && disconnectedMs + Math.max(0, Number(graceMs || 0)) <= now();
}

function offlinePartyPveBattleParticipantAccountIds(data, room, options = {}) {
  const nowFn = typeof options.now === "function" ? options.now : () => Date.now();
  const runtimeActiveSessionIds = options.runtimeActiveSessionIds || null;
  if (!room || room.status === BATTLE_ROOM_CLOSED || String(room.mode || BATTLE_MODE_DUEL) !== BATTLE_MODE_PARTY_PVE) {
    return [];
  }
  return (Array.isArray(room.participantAccountIds) ? room.participantAccountIds : [])
    .map((accountId) => String(accountId || ""))
    .filter((accountId) => {
      if (!accountId) {
        return false;
      }
      if (battleRoomAccountDisconnectedForMs(room, accountId, BATTLE_PARTY_PVE_OFFLINE_ESCAPE_MS, nowFn)) {
        return true;
      }
      return !accountHasActiveRuntimeSession(data, accountId, nowFn, runtimeActiveSessionIds);
    });
}

function battleActorBelongsToAnyAccount(actor, accountIdSet) {
  if (!actor || !accountIdSet || accountIdSet.size <= 0) {
    return false;
  }
  const accountId = String(actor.accountId || "");
  if (accountId && accountIdSet.has(accountId)) {
    return true;
  }
  const ownerAccountId = String(actor.ownerAccountId || "");
  return ownerAccountId !== "" && accountIdSet.has(ownerAccountId);
}

function removeOfflinePartyPveParticipantsFromRoom(data, room, accountIds, options = {}) {
  const nowFn = typeof options.now === "function" ? options.now : () => Date.now();
  const runtimeActiveSessionIds = options.runtimeActiveSessionIds || null;
  const removedAccountIds = Array.from(new Set((Array.isArray(accountIds) ? accountIds : [])
    .map((accountId) => String(accountId || ""))
    .filter(Boolean)));
  const beforeParticipantAccountIds = Array.isArray(room.participantAccountIds)
    ? room.participantAccountIds.map((accountId) => String(accountId || "")).filter(Boolean)
    : [];
  const removedSet = new Set(removedAccountIds.filter((accountId) => beforeParticipantAccountIds.includes(accountId)));
  const result = {
    changed: false,
    targetAccountIds: beforeParticipantAccountIds.slice(),
    removedAccountIds: Array.from(removedSet),
    escapedActorIds: [],
    battleReturns: [],
    partyEvents: [],
    turn: null,
  };
  if (removedSet.size <= 0) {
    return result;
  }
  const timestamp = isoNow(nowFn);
  const battle = battleRoomBattleStateForMutation(room, nowFn, options);
  const actors = Array.isArray(battle.actors) ? battle.actors : [];
  result.escapedActorIds = actors
    .filter((actor) => battleActorBelongsToAnyAccount(actor, removedSet))
    .map((actor) => String(actor.actorId || ""))
    .filter(Boolean);
  result.battleReturns = restoreBattleParticipantPositions(data, room, {
    accountIds: result.removedAccountIds,
    reason: "offline_escape",
    now: nowFn,
  });
  if (!room.departedParticipantsByAccountId || typeof room.departedParticipantsByAccountId !== "object" || Array.isArray(room.departedParticipantsByAccountId)) {
    room.departedParticipantsByAccountId = {};
  }
  for (const actor of actors) {
    if (battleActorBelongsToAnyAccount(actor, removedSet)) {
      syncParticipantBattleActorSnapshot(room, actor);
    }
  }
  for (const participant of Array.isArray(room.participants) ? room.participants : []) {
    const participantAccountId = String(participant && participant.accountId || "");
    if (removedSet.has(participantAccountId)) {
      room.departedParticipantsByAccountId[participantAccountId] = clone(participant);
    }
  }
  room.participantAccountIds = beforeParticipantAccountIds.filter((accountId) => !removedSet.has(accountId));
  room.participants = (Array.isArray(room.participants) ? room.participants : [])
    .filter((participant) => !removedSet.has(String(participant && participant.accountId || "")));
  const connectionState = battleRoomConnectionStateForMutation(room);
  for (const accountId of removedSet) {
    delete connectionState[accountId];
  }
  battle.actors = actors.filter((actor) => !battleActorBelongsToAnyAccount(actor, removedSet));
  if (!battle.commands || typeof battle.commands !== "object" || Array.isArray(battle.commands)) {
    battle.commands = {};
  }
  for (const actorId of result.escapedActorIds) {
    delete battle.commands[actorId];
  }
  let replacementLeaderAccountId = "";
  battle.requiredAccountIds = requiredBattleCommandAccountIds(room);
  battle.requiredActorIds = requiredBattleCommandActorIds(battle);
  battle.submittedActorIds = submittedBattleCommandActorIds(battle);
  battle.submittedAccountIds = submittedBattleCommandAccountIds(battle);
  battle.updatedAt = timestamp;
  room.updatedAt = timestamp;
  for (const accountId of removedSet) {
    const partyRemoval = removeAccountFromParty(data, accountId, nowFn);
    if (partyRemoval && partyRemoval.changed) {
      result.partyEvents.push({
        type: "party.update",
        targetAccountIds: partyRemoval.targetAccountIds,
        party: partyRemoval.party ? publicParty(partyRemoval.party, data, {now: nowFn, runtimeActiveSessionIds}) : null,
        partyId: partyRemoval.partyId,
        removedAccountIds: partyRemoval.removedAccountIds,
      });
      if (partyRemoval.party && !replacementLeaderAccountId) {
        replacementLeaderAccountId = String(partyRemoval.party.leaderAccountId || "");
      }
    }
  }
  const currentLeaderAccountId = String(room.leaderAccountId || "");
  if (removedSet.has(currentLeaderAccountId)) {
    if (!replacementLeaderAccountId) {
      for (const accountId of room.participantAccountIds) {
        const party = partyForAccount(data, accountId);
        if (party && party.memberAccountIds && party.memberAccountIds.includes(accountId)) {
          replacementLeaderAccountId = String(party.leaderAccountId || accountId);
          break;
        }
      }
    }
    room.leaderAccountId = replacementLeaderAccountId || String(room.participantAccountIds[0] || "");
  }
  if (room.participantAccountIds.length <= 0) {
    const closeResult = battleRoomResultForLeave(room, result.removedAccountIds[0] || "", nowFn);
    closeBattleRoomWithResult(data, room, closeResult, nowFn, options);
  } else if (
    String(battle.phase || "") === BATTLE_PHASE_COMMAND &&
    battle.requiredActorIds.length > 0 &&
    battle.requiredActorIds.every((actorId) => battle.commands && battle.commands[actorId])
  ) {
    result.turn = resolveBattleRoomTurn(data, room, battle, nowFn, options);
  }
  data.battleRooms[room.roomId] = room;
  recordBattleTrace(data, room, "party_pve_offline_participants_removed", {
    removedAccountIds: result.removedAccountIds,
    escapedActorIds: result.escapedActorIds,
    battleReturnCount: result.battleReturns.length,
    remainingParticipantCount: room.participantAccountIds.length,
    turnResolved: Boolean(result.turn),
  }, nowFn);
  result.changed = true;
  return result;
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
      if (shouldRefreshExpiredReconnectCommandDeadline(battle, accountId, now)) {
        battle.commandDeadlineAt = new Date(now() + BATTLE_RECONNECT_COMMAND_GRACE_MS).toISOString();
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

function shouldRefreshExpiredReconnectCommandDeadline(battle, accountId, now = () => Date.now()) {
  if (!battle || String(battle.phase || "") !== BATTLE_PHASE_COMMAND) {
    return false;
  }
  if (!battleAccountNeedsCommand(battle, accountId)) {
    return false;
  }
  const deadlineMs = Date.parse(String(battle.commandDeadlineAt || ""));
  return !Number.isFinite(deadlineMs) || deadlineMs <= now();
}

function battleAccountNeedsCommand(battle, accountId) {
  const normalizedAccountId = String(accountId || "");
  if (!normalizedAccountId) {
    return false;
  }
  const commands = battle && battle.commands && typeof battle.commands === "object" && !Array.isArray(battle.commands)
    ? battle.commands
    : {};
  const requiredActorIds = new Set(requiredBattleCommandActorIds(battle || {}));
  return (Array.isArray(battle && battle.actors) ? battle.actors : [])
    .filter((actor) => actor && String(actor.accountId || "") === normalizedAccountId)
    .map((actor) => String(actor.actorId || ""))
    .filter((actorId) => actorId && requiredActorIds.has(actorId))
    .some((actorId) => !commands[actorId]);
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
        const reconnectGraceMs = (
          String(room.mode || BATTLE_MODE_DUEL) === BATTLE_MODE_PARTY_PVE
        )
          ? BATTLE_PARTY_PVE_OFFLINE_ESCAPE_MS
          : BATTLE_RECONNECT_GRACE_MS;
        nextAt = Math.min(nextAt, disconnectedMs + reconnectGraceMs);
      }
    }
  }
  if (!Number.isFinite(nextAt)) {
    return null;
  }
  return Math.max(0, nextAt - nowMs);
}

function battleRoomEntryCheck(data, invite) {
  const backpackEntry = battleBackpackEntryCheck(data, [invite.fromAccountId, invite.toAccountId]);
  if (!backpackEntry.ok) {
    return backpackEntry;
  }
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

function battleBackpackEntryCheck(data, accountIds) {
  for (const accountIdValue of Array.isArray(accountIds) ? accountIds : []) {
    const accountId = String(accountIdValue || "").trim();
    const binding = data && data.profileBindings && data.profileBindings[accountId];
    const profileDoc = binding && binding.playerId && data.profiles ? data.profiles[binding.playerId] : null;
    if (!profileDoc || !profileDoc.profile || typeof profileDoc.profile !== "object" || Array.isArray(profileDoc.profile)) {
      return fail("profile_missing", "参战角色档案不存在，暂不能进入战斗。");
    }
    const backpackConflict = rawBackpackAssetConflict(profileDoc.profile);
    if (backpackConflict) {
      return fail(backpackConflict.code, `${backpackConflict.message} 修复前暂不能进入战斗。`);
    }
  }
  return ok({});
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

function battleCommandDeadlineAt(now, extraMs = 0) {
  return new Date(now() + BATTLE_COMMAND_TIMEOUT_MS + Math.max(0, Number(extraMs || 0))).toISOString();
}

function createBattleRoomBattleState(room, now, options = {}) {
  const rawActors = battleRoomActors(room);
  const actors = options.battleActorRules && typeof options.battleActorRules.materializeActors === "function"
    ? options.battleActorRules.materializeActors(rawActors).actors
    : rawActors;
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
    commandDeadlineAt: battleCommandDeadlineAt(now),
    updatedAt: isoNow(now),
    schemaVersion: 1,
  };
}

function battleRoomBattleStateForMutation(room, now, options = {}) {
  if (!room.battle || typeof room.battle !== "object" || Array.isArray(room.battle)) {
    room.battle = createBattleRoomBattleState(room, now, options);
  }
  if (!Array.isArray(room.battle.actors) || room.battle.actors.length === 0) {
    const rawActors = battleRoomActors(room);
    room.battle.actors = options.battleActorRules && typeof options.battleActorRules.materializeActors === "function"
      ? options.battleActorRules.materializeActors(rawActors).actors
      : rawActors;
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
    room.battle.commandDeadlineAt = battleCommandDeadlineAt(now);
  }
  return room.battle;
}

function battleRoomActors(room) {
  if (String(room && room.mode || BATTLE_MODE_DUEL) === BATTLE_MODE_PARTY_PVE) {
    return partyPveBattleRoomActors(room);
  }
  if (String(room && room.mode || BATTLE_MODE_DUEL) === BATTLE_MODE_MANOR_WAR) {
    return manorWarBattleRoomActors(room);
  }
  const participants = Array.isArray(room.participants) ? room.participants : [];
  const actors = [];
  participants.forEach((participant, index) => {
    const side = String(participant.side || (index === 0 ? "challenger" : "opponent"));
    const playerActor = battlePlayerActorFromParticipant(participant, side);
    if (playerActor.accountId !== "") {
      actors.push(playerActor);
    }
    const battlePets = participant && participant.teamSnapshot && Array.isArray(participant.teamSnapshot.battlePets)
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

function manorWarBattleRoomActors(room) {
  const participants = Array.isArray(room.participants) ? room.participants : [];
  const sideCounts = {};
  const actors = [];
  participants.forEach((participant) => {
    const rawSide = String(participant && participant.side || "challenger");
    const side = rawSide === "opponent" || rawSide === "defender" ? "opponent" : "challenger";
    sideCounts[side] = Math.max(0, Number(sideCounts[side] || 0)) + 1;
    const slotNumber = BATTLE_PARTY_PVE_PLAYER_SLOTS[Math.min(sideCounts[side] - 1, BATTLE_PARTY_PVE_PLAYER_SLOTS.length - 1)] || sideCounts[side];
    const accountId = String(participant && participant.accountId || "").replace(/[^A-Za-z0-9_:-]/g, "_");
    const playerActor = battlePlayerActorFromParticipant(participant, side, {
      actorId: `manor_${side}_${accountId || sideCounts[side]}_player`,
      slotId: `${side}.back.${slotNumber}`,
      slotNumber,
    });
    if (playerActor.accountId !== "") {
      actors.push(playerActor);
    }
    const battlePets = participant && participant.teamSnapshot && Array.isArray(participant.teamSnapshot.battlePets)
      ? participant.teamSnapshot.battlePets
      : [];
    battlePets
      .filter((pet) => pet && (pet.activeInBattle || String(pet.state || "") === BATTLE_PET_STATE_BATTLE))
      .slice(0, BATTLE_ACTIVE_PET_MAX_PER_PARTICIPANT)
      .forEach((pet, petIndex) => {
        const petId = String(pet.petId || pet.instanceId || pet.id || petIndex + 1).replace(/[^A-Za-z0-9_:-]/g, "_");
        const petActor = battlePetActorFromParticipant(participant, side, pet, petIndex, {
          actorId: `manor_${side}_${accountId || sideCounts[side]}_pet_${petId || petIndex + 1}`,
          slotId: `${side}.front.${slotNumber}`,
          slotNumber,
        });
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
    actionState: hp <= 0 ? "down" : "idle",
    launched: false,
    revivable: true,
    ...battleActorRideFieldsFromPlayerSnapshot(player),
    spiritIds: stringArray(player.spiritIds),
    battleActionIds: stringArray(player.battleActionIds),
    attackActionId: String(player.attackActionId || ""),
    equipmentStatBonus: clone(objectOrEmpty(player.equipmentStatBonus)),
    equipmentStatSummary: clone(objectOrEmpty(player.equipmentStatSummary)),
    equipmentWearUsage: {
      weaponAttacks: Math.max(0, Math.trunc(Number(objectOrEmpty(player.equipmentWearUsage).weaponAttacks || 0))),
      armorHits: Math.max(0, Math.trunc(Number(objectOrEmpty(player.equipmentWearUsage).armorHits || 0))),
    },
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
  const activeSkillIds = petActiveSkillIdsForSource(pet);
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
    actionState: hp <= 0 ? "down" : "idle",
    launched: false,
    revivable: true,
    activeSkillIds,
    petSkillSlots: petSkillSlotsForSkillIds(activeSkillIds, pet.petSkillSlots),
    forgottenSkillIds: uniqueStringArray(pet.forgottenSkillIds),
    passiveSkillIds: petPassiveSkillIdsForSource(pet),
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
    ridePetKnocked: false,
    ridePetAttack: positiveNumber(player.ridePetAttack, DEFAULT_PET_BATTLE_STATS.attack),
    ridePetDefense: positiveNumber(player.ridePetDefense, DEFAULT_PET_BATTLE_STATS.defense),
    ridePetQuick: positiveNumber(player.ridePetQuick, DEFAULT_PET_BATTLE_STATS.quick),
    rideBaseStats: player.rideBaseStats && typeof player.rideBaseStats === "object" && !Array.isArray(player.rideBaseStats)
      ? clone(player.rideBaseStats)
      : {
        attack: positiveNumber(player.attack, DEFAULT_PLAYER_BATTLE_STATS.attack),
        defense: positiveNumber(player.defense, DEFAULT_PLAYER_BATTLE_STATS.defense),
        quick: positiveNumber(player.quick, DEFAULT_PLAYER_BATTLE_STATS.quick),
      },
    rideAttackStyle: String(player.rideAttackStyle || "melee"),
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
    actionState: hp <= 0 ? "down" : "idle",
    launched: false,
    revivable: true,
    schemaVersion: 1,
  };
}

function battleTrainingPartnerPetActorFromSnapshot(participant, partner, pet, index, slotNumber) {
  const maxHp = positiveNumber(pet.maxHp, DEFAULT_PET_BATTLE_STATS.maxHp);
  const hp = clampNumber(pet.hp, 1, maxHp, maxHp);
  const petId = String(pet.petId || pet.instanceId || pet.id || `training_partner_pet_${index + 1}`).trim();
  const partnerId = String(partner && (partner.partnerId || partner.id) || `training_partner_${index + 1}`).trim();
  const activeSkillIds = petActiveSkillIdsForSource(pet);
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
    actionState: hp <= 0 ? "down" : "idle",
    launched: false,
    revivable: true,
    activeSkillIds,
    petSkillSlots: petSkillSlotsForSkillIds(activeSkillIds, pet.petSkillSlots),
    forgottenSkillIds: uniqueStringArray(pet.forgottenSkillIds),
    passiveSkillIds: petPassiveSkillIdsForSource(pet),
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
      actionState: "idle",
      launched: false,
      revivable: true,
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
  const captureChanceOverride = value && value.captureChanceOverride != null
    ? value.captureChanceOverride
    : value && value.captureRateOverride != null
      ? value.captureRateOverride
      : capture.chanceOverride;
  const activeSkillIds = petActiveSkillIdsForSource({...value, formId});
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
    activeSkillIds,
    petSkillSlots: petSkillSlotsForSkillIds(activeSkillIds, value && value.petSkillSlots),
    passiveSkillIds: petPassiveSkillIdsForSource({...value, formId}),
    comboRateOverride: battleComboRateOverrideValue(value && value.comboRateOverride),
    catchable: value && value.catchable === false ? false : capture.catchable !== false,
    captureDifficulty: Math.max(1, Math.trunc(Number(value && (value.captureDifficulty || value.difficulty) || capture.difficulty || 42))),
    captureChanceOverride: battleOptionalChanceValue(captureChanceOverride),
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
  const runAccountIds = battleRunCommandAccountIds(commands);
  return actors
    .filter((actor) => actor && Number(actor.hp || 0) > 0 && String(actor.accountId || "") !== "")
    .filter((actor) => !Boolean(actor.escaped))
    .filter((actor) => {
      if (String(actor.kind || "") !== BATTLE_ACTOR_KIND_PET) {
        return true;
      }
      if (!battleActorHasUsablePetSkill(actor)) {
        return false;
      }
      const accountId = String(actor.accountId || "");
      return !switchPetAccountIds.has(accountId) && !runAccountIds.has(accountId);
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

function battleRunCommandAccountIds(commands = {}) {
  const accountIds = new Set();
  for (const command of Object.values(commands || {})) {
    if (!command || typeof command !== "object") {
      continue;
    }
    if (String(command.actionKind || command.actionId || "") !== BATTLE_ACTION_RUN) {
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

function normalizeBattleCommandPayload(payload, data, room, battle, account, now, randomId, options = {}) {
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
    const captureTargetResult = validateBattleCaptureTarget(actor, targetActor, captureToolId);
    if (!captureTargetResult.ok) {
      return captureTargetResult;
    }
    const candidateResult = validateBattleCaptureCandidateAttempt(
      options.petCaptureCandidateAuthority,
      room,
      targetActor,
      account.accountId,
      captureToolId,
    );
    if (!candidateResult.ok) {
      return candidateResult;
    }
    const capacityResult = battleCaptureCapacityCheck(data, room, battle, account.accountId);
    if (!capacityResult.ok) {
      return capacityResult;
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
    const activeSkillIds = battleActorPetSkillIds(actor);
    if (actionId === BATTLE_ACTION_ATTACK || actionId === "basic_attack" || actionId === BATTLE_ACTION_PET_ATTACK) {
      return activeSkillIds.includes(BATTLE_ACTION_PET_ATTACK)
        ? ok({actionId: BATTLE_ACTION_PET_ATTACK, actionKind: "attack", skillId: BATTLE_ACTION_PET_ATTACK})
        : fail("battle_command_action_invalid", "宠物没有可用的攻击技能。");
    }
    if (actionId === BATTLE_ACTION_DEFEND || actionId === "guard" || actionId === BATTLE_ACTION_PET_DEFEND) {
      return activeSkillIds.includes(BATTLE_ACTION_PET_DEFEND)
        ? ok({actionId: BATTLE_ACTION_PET_DEFEND, actionKind: "defend", skillId: BATTLE_ACTION_PET_DEFEND})
        : fail("battle_command_action_invalid", "宠物没有可用的防御技能。");
    }
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
  if (actionId === BATTLE_ACTION_RUN || actionId === "escape" || actionId === "flee") {
    return ok({actionId: BATTLE_ACTION_RUN, actionKind: BATTLE_ACTION_RUN, skillId: ""});
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

function validateBattleCaptureTarget(actor, targetActor, captureToolId = "") {
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
  const normalizedToolId = normalizeBattleCaptureToolId(captureToolId);
  if (normalizedToolId === BATTLE_CAPTURE_TOOL_POISON_WULI_NET && !battlePoisonWuliCaptureConditionMet(targetActor)) {
    return fail("battle_command_capture_invalid", "缚毒捕捉网只能捕捉中毒的乌力。");
  }
  return ok();
}

function validateBattleCaptureCandidateAttempt(authority, room, targetActor, accountId, captureToolId = "") {
  if (!authority || typeof authority.validateAttempt !== "function") {
    return fail("battle_capture_candidate_invalid", "这只野生宠物暂时无法捕捉，请重新遇敌。");
  }
  const result = authority.validateAttempt(room, {
    actorId: String(targetActor && targetActor.actorId || ""),
    accountId: String(accountId || ""),
    captureToolId: normalizeBattleCaptureToolId(captureToolId),
  });
  if (!result || result.ok !== true) {
    return fail("battle_capture_candidate_invalid", "这只野生宠物暂时无法捕捉，请重新遇敌。");
  }
  return ok();
}

function battleCaptureCapacityCheck(data, room, battle, accountId) {
  const normalizedAccountId = String(accountId || "");
  const binding = data && data.profileBindings ? data.profileBindings[normalizedAccountId] || null : null;
  const profileDoc = binding && binding.playerId && data && data.profiles
    ? data.profiles[binding.playerId] || null
    : null;
  const profile = profileDoc && profileDoc.profile && typeof profileDoc.profile === "object" && !Array.isArray(profileDoc.profile)
    ? profileDoc.profile
    : null;
  if (!profile) {
    return fail("battle_capture_candidate_invalid", "角色宠物资料暂时不可用，请重新登录后再试。");
  }
  const claimedInRoom = (Array.isArray(battle && battle.actors) ? battle.actors : []).filter((entry) => (
    entry &&
    Boolean(entry.captured) &&
    String(entry.capturedByAccountId || "") === normalizedAccountId
  )).length;
  const used = profilePartyVisiblePetCount(profile) + profileStoragePetCount(profile) + claimedInRoom;
  if (used >= BATTLE_PET_MAX_PER_PARTICIPANT + BATTLE_PET_STORAGE_LIMIT) {
    return fail("battle_capture_capacity_full", "宠物栏和兽栏都满了，请先清理位置再捕捉。");
  }
  return ok({
    used,
    available: BATTLE_PET_MAX_PER_PARTICIPANT + BATTLE_PET_STORAGE_LIMIT - used,
  });
}

function battleCommandTargetActor(payload, data, room, battle, actor, actionId) {
  if (actionId === BATTLE_ACTION_DEFEND || actionId === BATTLE_ACTION_SWITCH_PET || actionId === BATTLE_ACTION_RUN) {
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
  if (String(room.mode || "") === BATTLE_MODE_PARTY_PVE || String(room.mode || "") === BATTLE_MODE_MANOR_WAR) {
    return firstLivingBattleActorBySide(battle, battleOpponentSide(actor));
  }
  const targetAccountId = requiredBattleCommandAccountIds(room).find((accountId) => accountId !== actor.accountId) || "";
  return targetAccountId ? battlePlayerActorByAccountId(battle, targetAccountId) : null;
}

function resolveBattleRoomTurn(data, room, battle, now, options = {}) {
  battle.turnSeq = Number(battle.turnSeq || 0) + 1;
  const round = Number(battle.round || 1);
  const orderedCommands = battleTurnCommandsForResolution(room, battle, round)
    .sort((a, b) => battleCommandSortValue(battle, b) - battleCommandSortValue(battle, a));
  for (const actor of battle.actors) {
    actor.guarding = false;
  }
  const actorsBefore = battle.actors.map(publicBattleActor);
  const events = [];
  let sequence = 1;
  let commandIndex = 0;
  while (commandIndex < orderedCommands.length) {
    const command = orderedCommands[commandIndex];
    const actor = battleActorByActorId(battle, command.actorId);
    if (!actor || Number(actor.hp || 0) <= 0 || Boolean(actor.escaped)) {
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
    if (String(command.actionKind || command.actionId || "") === BATTLE_ACTION_RUN) {
      events.push(battleEscapeEvent(room, battle, command, actor, round, sequence));
      sequence += 1;
      commandIndex += 1;
      if (battleResultForResolvedActors(room, battle, now)) {
        break;
      }
      continue;
    }
    if (String(command.actionKind || command.actionId || "") === BATTLE_ACTION_SWITCH_PET) {
      events.push(battleSwitchPetEvent(room, battle, command, actor, round, sequence, options));
      sequence += 1;
      commandIndex += 1;
      continue;
    }
    if (String(command.actionKind || command.actionId || "") === BATTLE_ACTION_ITEM) {
      events.push(battleItemEvent(room, battle, command, actor, round, sequence, options));
      sequence += 1;
      commandIndex += 1;
      if (battleResultForResolvedActors(room, battle, now)) {
        break;
      }
      continue;
    }
    if (String(command.actionKind || command.actionId || "") === BATTLE_ACTION_TRAINING_PARTNER_HEAL) {
      events.push(battleTrainingPartnerHealEvent(room, battle, command, actor, round, sequence));
      sequence += 1;
      commandIndex += 1;
      if (battleResultForResolvedActors(room, battle, now)) {
        break;
      }
      continue;
    }
    if (String(command.actionKind || command.actionId || "") === BATTLE_ACTION_SPIRIT) {
      events.push(battleSpiritEvent(room, battle, command, actor, round, sequence, options));
      sequence += 1;
      commandIndex += 1;
      if (battleResultForResolvedActors(room, battle, now)) {
        break;
      }
      continue;
    }
    if (String(command.actionKind || command.actionId || "") === BATTLE_ACTION_CAPTURE) {
      events.push(battleCaptureEvent(data, room, battle, command, actor, round, sequence, options));
      sequence += 1;
      commandIndex += 1;
      if (battleResultForResolvedActors(room, battle, now)) {
        break;
      }
      continue;
    }
    if (String(command.actionKind || command.actionId || "") === "pet_skill" && battleActionEffectType(command.actionId) === "status") {
      events.push(battlePetStatusSkillEvent(room, battle, command, actor, round, sequence, options));
      sequence += 1;
      commandIndex += 1;
      continue;
    }
    const attackResult = battleAttackOrComboEvent(room, battle, orderedCommands, commandIndex, round, sequence, options);
    commandIndex += Math.max(1, Number(attackResult.consumed || 1));
    for (const event of Array.isArray(attackResult.events) ? attackResult.events : []) {
      events.push(event);
      sequence += 1;
    }
    if (String(room.mode || BATTLE_MODE_DUEL) === BATTLE_MODE_PARTY_PVE || String(room.mode || BATTLE_MODE_DUEL) === BATTLE_MODE_MANOR_WAR) {
      if (battleResultForResolvedActors(room, battle, now)) {
        break;
      }
    } else if (battleDefeatedPlayerAccountIds(room, battle).length > 0) {
      break;
    }
  }
  if (!battleResultForResolvedActors(room, battle, now)) {
    const poisonEvents = battleRoundEndPoisonEvents(room, battle, round, sequence, now);
    events.push(...poisonEvents);
    sequence += poisonEvents.length;
  }
  const eventList = {
    schemaVersion: BATTLE_EVENT_CONTRACT_VERSION,
    kind: "battle_event_list",
    roomId: room.roomId,
    round,
    turnSeq: battle.turnSeq,
    phase: "resolved",
    events,
    actorsBefore,
    actors: battle.actors.map(publicBattleActor),
    resolvedAt: isoNow(now),
  };
  const result = battleResultForResolvedActors(room, battle, now);
  if (result) {
    eventList.result = publicBattleResult(result);
  }
  battle.lastEventList = eventList;
  const historyEventList = battleHistoricalEventList(eventList);
  battle.eventLog = Array.isArray(battle.eventLog) ? battle.eventLog.concat([historyEventList]).slice(-20) : [historyEventList];
  battle.commands = {};
  battle.submittedActorIds = [];
  battle.submittedAccountIds = [];
  battle.requiredActorIds = requiredBattleCommandActorIds(battle);
  battle.round = round + 1;
  battle.phase = BATTLE_PHASE_COMMAND;
  battle.commandDeadlineAt = battleCommandDeadlineAt(now, BATTLE_TURN_PLAYBACK_GRACE_MS);
  battle.updatedAt = eventList.resolvedAt;
  room.updatedAt = eventList.resolvedAt;
  if (result) {
    closeBattleRoomWithResult(data, room, result, now, options);
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

function battleHistoricalEventList(eventList) {
  return {
    schemaVersion: Math.max(1, Math.trunc(Number(eventList && eventList.schemaVersion || 1))),
    kind: String(eventList && eventList.kind || "battle_event_list"),
    roomId: String(eventList && eventList.roomId || ""),
    round: Math.max(1, Math.trunc(Number(eventList && eventList.round || 1))),
    turnSeq: Math.max(0, Math.trunc(Number(eventList && eventList.turnSeq || 0))),
    phase: String(eventList && eventList.phase || "resolved"),
    events: clone(Array.isArray(eventList && eventList.events) ? eventList.events : []),
    resolvedAt: String(eventList && eventList.resolvedAt || ""),
    ...(eventList && eventList.result ? {result: clone(eventList.result)} : {}),
  };
}

function battleRoundEndPoisonEvents(room, battle, round, sequence, now) {
  const events = [];
  const actors = Array.isArray(battle && battle.actors) ? battle.actors : [];
  for (const target of actors) {
    if (!target || Number(target.hp || 0) <= 0 || !battleActorHasStatus(target, BATTLE_STATUS_POISON)) {
      continue;
    }
    const status = battleActorStatuses(target)[BATTLE_STATUS_POISON];
    const statusBefore = publicBattleStatus(BATTLE_STATUS_POISON, status);
    if (!statusBefore) {
      continue;
    }
    const sourceActor = statusSourceActor(status);
    const hpBefore = Math.max(0, Math.trunc(Number(target.hp || 0)));
    const damage = Math.max(1, Math.trunc(Number(statusBefore.potency || 0)));
    const damageResult = applyBattleActorResolvedDamage(room, target, hpBefore, damage, {
      shareWithRide: false,
      canLaunch: false,
    });
    const hpAfter = damageResult.hpAfter;
    const turns = battleDecrementActorStatus(target, BATTLE_STATUS_POISON);
    syncParticipantBattleActorSnapshot(room, target);
    const expCredits = sourceActor
      ? battleExpCreditsForDefeat(room, battle, sourceActor, target, hpBefore, hpAfter)
      : [];
    appendBattleExpCredits(battle, expCredits);
    const event = {
      eventId: `${room.roomId}:r${round}:e${sequence + events.length}`,
      eventType: "status_tick",
      round,
      sequence: sequence + events.length,
      actorAccountId: String(target.accountId || ""),
      actorUsername: String(target.username || ""),
      actorId: String(target.actorId || ""),
      actorKind: String(target.kind || BATTLE_ACTOR_KIND_PLAYER),
      sourceActorId: String(statusBefore.sourceId || ""),
      targetAccountId: String(target.accountId || ""),
      targetUsername: String(target.username || ""),
      targetActorId: String(target.actorId || ""),
      targetKind: String(target.kind || BATTLE_ACTOR_KIND_PLAYER),
      actionId: BATTLE_STATUS_POISON,
      skillId: "",
      statusId: BATTLE_STATUS_POISON,
      statusResult: "tick",
      statusBefore: turns.statusBefore,
      statusAfter: turns.statusAfter,
      fromTurns: turns.fromTurns,
      toTurns: turns.toTurns,
      statusChanges: [{
        actorId: String(target.actorId || ""),
        statusId: BATTLE_STATUS_POISON,
        change: "decrement",
        fromTurns: turns.fromTurns,
        toTurns: turns.toTurns,
        schemaVersion: 1,
      }],
      damage,
      ...battleDamageEventFields(damageResult),
      hpBefore,
      hpAfter,
      defeated: hpAfter <= 0,
      launched: false,
      dodged: false,
      critical: false,
      counterTriggered: false,
      animation: {
        actor: "status",
        targetReaction: hpAfter <= 0 ? "knockdown" : "hurt",
        observer: "watch_target",
      },
      message: battleDamageMessage(`${target.displayName || target.username || "目标"} 因中毒受到 ${damage} 点伤害。`, target, hpAfter, false),
      schemaVersion: BATTLE_EVENT_CONTRACT_VERSION,
    };
    if (expCredits.length > 0) {
      event.expCredits = clone(expCredits);
    }
    events.push(event);
    if (battleResultForResolvedActors(room, battle, now)) {
      break;
    }
  }
  return events;
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
  if (Boolean(event.confusionRetargeted)) {
    return false;
  }
  return Array.isArray(event.targetRules) && event.targetRules.some((value) => String(value || "") === rule);
}

function battleAttackOrComboEvent(room, battle, orderedCommands, commandIndex, round, sequence, options = {}) {
  const command = orderedCommands[commandIndex];
  const resolved = battleResolvedAttackForCommand(room, battle, command, round);
  if (!resolved.ok) {
    if (resolved.missing && String(room.mode || BATTLE_MODE_DUEL) !== BATTLE_MODE_PARTY_PVE) {
      return {
        consumed: 1,
        events: [battleTargetMissingEvent(room, battle, command, resolved.actor || {}, round, sequence)],
      };
    }
    return {consumed: 1, events: []};
  }

  const equipmentAttackActionId = battleEquipmentMultiAttackActionId(resolved.actor);
  if (equipmentAttackActionId !== "") {
    if (battleActorHasStatus(resolved.actor, BATTLE_STATUS_CONFUSION)) {
      return {
        consumed: 1,
        events: battleSingleAttackEvents(room, battle, {
          ...resolved,
          command: {...resolved.command, actionId: equipmentAttackActionId},
        }, round, sequence, options),
      };
    }
    return {
      consumed: 1,
      events: [battleEquipmentMultiAttackEvent(
        room,
        battle,
        resolved,
        equipmentAttackActionId,
        round,
        sequence,
        options,
      )],
    };
  }

  const group = [resolved];
  if (battleCommandCanStartCombo(command) && battleComboRollSucceeds(room, battle, resolved, round, sequence)) {
    for (let index = commandIndex + 1; index < orderedCommands.length; index += 1) {
      const nextCommand = orderedCommands[index];
      if (!battleCommandCanStartCombo(nextCommand)) {
        break;
      }
      const nextActor = battleActorByActorId(battle, nextCommand && nextCommand.actorId);
      if (
        !nextActor ||
        Number(nextActor.hp || 0) <= 0 ||
        Boolean(nextActor.escaped) ||
        battleBlockingStatusId(nextActor) !== "" ||
        battleEquipmentMultiAttackActionId(nextActor) !== ""
      ) {
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
      events: [battleComboAttackEvent(room, battle, group, round, sequence, options)],
    };
  }
  return {
    consumed: 1,
    events: battleSingleAttackEvents(room, battle, resolved, round, sequence, options),
  };
}

function battleEquipmentMultiAttackActionId(actor) {
  if (!actor || String(actor.kind || "") !== BATTLE_ACTOR_KIND_PLAYER) {
    return "";
  }
  const actionId = String(actor.attackActionId || "").trim();
  const action = battleActionById(actionId);
  const target = action && action.target && typeof action.target === "object" && !Array.isArray(action.target)
    ? action.target
    : {};
  const effect = action && action.effect && typeof action.effect === "object" && !Array.isArray(action.effect)
    ? action.effect
    : {};
  if (
    !action
    || String(action.owner || "") !== "equipment_action"
    || String(action.command || "") !== BATTLE_ACTION_ATTACK
    || String(target.targetMode || "") !== "enemy_random_range"
    || String(effect.type || "") !== "damage"
  ) {
    return "";
  }
  return actionId;
}

function battleEquipmentMultiAttackTargets(room, battle, actor, actionId, round, sequence, options = {}) {
  const authority = options.battleRandomAuthority;
  if (!authority || typeof authority.index !== "function") {
    throw new TypeError("equipment multi attack requires private random authority");
  }
  const targetRule = battleActionTarget(actionId);
  const minTargets = Math.max(1, Math.trunc(Number(targetRule.minTargets || 1)));
  const maxTargets = Math.max(minTargets, Math.trunc(Number(targetRule.maxTargets || minTargets)));
  const desiredCount = minTargets + authority.index(room.roomId, {
    purpose: "equipment_multi_target_count.v1",
    turnSeq: battle.turnSeq,
    round,
    sequence,
    actorId: String(actor.actorId || ""),
    actionId,
  }, maxTargets - minTargets + 1);
  const candidates = (Array.isArray(battle.actors) ? battle.actors : []).filter((entry) => (
    entry
    && String(entry.side || "") !== String(actor.side || "")
    && Number(entry.hp || 0) > 0
    && !Boolean(entry.escaped)
    && !Boolean(entry.captured)
  ));
  const candidateCount = candidates.length;
  const selectionCount = Math.min(desiredCount, candidateCount);
  const selected = [];
  while (selected.length < selectionCount) {
    const index = authority.index(room.roomId, {
      purpose: "equipment_multi_target_pick.v1",
      turnSeq: battle.turnSeq,
      round,
      sequence,
      ordinal: selected.length,
      actorId: String(actor.actorId || ""),
      actionId,
    }, candidates.length);
    selected.push(candidates.splice(index, 1)[0]);
  }
  return {targets: selected, desiredCount, candidateCount};
}

function battleEquipmentMultiAttackEvent(room, battle, resolved, actionId, round, sequence, options = {}) {
  const actor = resolved.actor;
  const effect = battleActionEffect(actionId);
  const configuredPowerMultiplier = Number(effect.powerMultiplier);
  const powerMultiplier = Number.isFinite(configuredPowerMultiplier)
    ? Math.max(0, configuredPowerMultiplier)
    : 1;
  const targetSelection = battleEquipmentMultiAttackTargets(room, battle, actor, actionId, round, sequence, options);
  const targets = targetSelection.targets;
  const targetResults = [];
  const expCredits = [];
  const allStatusChanges = [];
  let totalDamage = 0;
  for (let ordinal = 0; ordinal < targets.length; ordinal += 1) {
    const target = targets[ordinal];
    const attackDamageResult = resolvePhysicalDamage({
      formula: authoritativeBattleCombatFormula,
      actor,
      target,
      eventType: "multi_attack",
      actionPowerMultiplier: powerMultiplier,
    });
    const reaction = resolveDamageReaction({
      randomAuthority: options.battleRandomAuthority,
      roomId: room.roomId,
      turnSeq: battle.turnSeq,
      round,
      sequence,
      ordinal,
      eventType: "multi_attack",
      actionId,
      effect,
      actor,
      target,
      baseDamage: attackDamageResult.damage,
    });
    if (reaction.critical && Number.isFinite(Number(effect.criticalDamageMultiplier))) {
      reaction.damage = Math.max(1, Math.round(attackDamageResult.damage * Math.max(0, Number(effect.criticalDamageMultiplier))));
    }
    const hpBefore = Math.max(0, Math.trunc(Number(target.hp || 0)));
    const damageResult = applyBattleActorResolvedDamage(room, target, hpBefore, reaction.damage, {
      dodged: reaction.dodged,
      shareWithRide: true,
      canLaunch: false,
    });
    const hpAfter = damageResult.hpAfter;
    const statusChanges = battleWakeFromDirectDamage(target, reaction.damage, reaction.dodged);
    allStatusChanges.push(...statusChanges);
    syncParticipantPetSnapshotHp(room, target);
    if (!reaction.dodged && reaction.damage > 0) {
      addBattleEquipmentWearUsage(room, target, "armorHits", 1);
    }
    const targetExpCredits = battleExpCreditsForDefeat(room, battle, actor, target, hpBefore, hpAfter);
    expCredits.push(...targetExpCredits);
    appendBattleExpCredits(battle, targetExpCredits);
    totalDamage += Math.max(0, Math.trunc(Number(reaction.damage || 0)));
    targetResults.push({
      targetActorId: String(target.actorId || ""),
      targetAccountId: String(target.accountId || ""),
      targetUsername: String(target.username || ""),
      targetKind: String(target.kind || BATTLE_ACTOR_KIND_PLAYER),
      damage: Math.max(0, Math.trunc(Number(reaction.damage || 0))),
      hpBefore,
      hpAfter,
      defeated: hpAfter <= 0,
      dodged: Boolean(reaction.dodged),
      critical: Boolean(reaction.critical),
      blocked: Boolean(target.guarding),
      ...battleDamageEventFields(damageResult),
      ...battleStoneDefenseEventFields(attackDamageResult),
      ...battleCombatFormulaEventFields(attackDamageResult),
      statusesAfter: publicBattleStatuses(target.statuses),
      statusChanges: clone(statusChanges),
      schemaVersion: 1,
    });
  }
  addBattleEquipmentWearUsage(room, actor, "weaponAttacks", 1);
  const targetActorIds = targetResults.map((entry) => entry.targetActorId);
  const first = targetResults[0] || {};
  const action = battleActionById(actionId);
  const actionLabel = String(action && action.label || "群体攻击");
  const event = {
    eventId: `${room.roomId}:r${round}:e${sequence}`,
    eventType: "multi_attack",
    round,
    sequence,
    actorAccountId: String(actor.accountId || ""),
    actorUsername: String(actor.username || ""),
    actorId: String(actor.actorId || ""),
    actorKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
    targetActorId: String(first.targetActorId || ""),
    targetAccountId: String(first.targetAccountId || ""),
    targetUsername: String(first.targetUsername || ""),
    targetKind: String(first.targetKind || ""),
    targetActorIds,
    targets: targetResults,
    targetRule: "equipment_random_range",
    targetCount: targetResults.length,
    requestedTargetCount: targetSelection.desiredCount,
    candidateTargetCount: targetSelection.candidateCount,
    actionId,
    skillId: "",
    damage: totalDamage,
    blocked: targetResults.length > 0 && targetResults.every((entry) => entry.blocked),
    dodged: targetResults.length > 0 && targetResults.every((entry) => entry.dodged),
    critical: targetResults.some((entry) => entry.critical),
    counterTriggered: false,
    combatFormulaId: String(authoritativeBattleCombatFormula.id || ""),
    statusChanges: clone(allStatusChanges),
    animation: {
      actor: "multi_attack",
      targetReaction: "multi_target",
      observer: "watch_target",
    },
    message: `${actor.displayName || actor.username || "猎人"} 使用${actionLabel}，攻击${targetResults.length}个目标，造成${totalDamage}点伤害。`,
    schemaVersion: BATTLE_EVENT_CONTRACT_VERSION,
  };
  if (expCredits.length > 0) {
    event.expCredits = clone(expCredits);
  }
  return event;
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
  const declaredTargetActorId = String(target && target.actorId || command.targetActorId || "");
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
    declaredTargetActorId,
    command: effectiveCommand,
    damage: battleAttackDamage(room, battle, effectiveCommand, actor, target),
  };
}

function battleSingleAttackEvents(room, battle, resolved, round, sequence, options = {}) {
  const confusion = battleConfusionAttackResolution(
    room,
    battle,
    resolved.actor,
    resolved.target,
    round,
    sequence,
    resolved.command.actionId,
    options,
    resolved.declaredTargetActorId,
  );
  const target = confusion.target;
  const command = confusion.triggered
    ? {
      ...resolved.command,
      targetActorId: String(target.actorId || ""),
      targetAccountId: String(target.accountId || ""),
      targetUsername: String(target.username || ""),
    }
    : resolved.command;
  const eventType = battleAttackEventTypeForCommand(command);
  const attackDamageResult = battleAttackDamageResult(room, battle, command, resolved.actor, target);
  const baseDamage = attackDamageResult.damage;
  const reaction = resolveDamageReaction({
    randomAuthority: options.battleRandomAuthority,
    roomId: room.roomId,
    turnSeq: battle.turnSeq,
    round,
    sequence,
    eventType,
    actionId: command.actionId,
    effect: battleActionEffect(command.actionId),
    actor: resolved.actor,
    target,
    baseDamage,
  });
  const hpBefore = Number(target.hp || 0);
  const damageResult = applyBattleActorResolvedDamage(room, target, hpBefore, reaction.damage, {
    dodged: reaction.dodged,
    shareWithRide: true,
    canLaunch: String(room.mode || BATTLE_MODE_DUEL) === BATTLE_MODE_PARTY_PVE,
  });
  const hpAfter = damageResult.hpAfter;
  const launched = damageResult.launched;
  const statusChanges = confusion.statusChanges.concat(battleWakeFromDirectDamage(target, reaction.damage, reaction.dodged));
  syncParticipantPetSnapshotHp(room, target);
  addBattleEquipmentWearUsage(room, resolved.actor, "weaponAttacks", 1);
  if (!reaction.dodged && reaction.damage > 0) {
    addBattleEquipmentWearUsage(room, target, "armorHits", 1);
  }
  const expCredits = battleExpCreditsForDefeat(room, battle, resolved.actor, target, hpBefore, hpAfter);
  appendBattleExpCredits(battle, expCredits);
  const attackEvent = battleAttackEvent(
    room,
    battle,
    command,
    resolved.actor,
    target,
    round,
    sequence,
    hpBefore,
    hpAfter,
    reaction.damage,
    expCredits,
    launched,
    {...reaction, statusChanges, damageResult, confusion, attackDamageResult},
  );
  const events = [attackEvent];
  const counterTriggered = resolveCounterTrigger({
    randomAuthority: options.battleRandomAuthority,
    roomId: room.roomId,
    turnSeq: battle.turnSeq,
    round,
    sequence,
    eventType,
    actionId: command.actionId,
    effect: battleActionEffect(command.actionId),
    attacker: resolved.actor,
    target,
    hpBefore,
    hpAfter,
  });
  attackEvent.counterTriggered = counterTriggered;
  if (counterTriggered) {
    events.push(battleCounterAttackEvent(
      room,
      battle,
      target,
      resolved.actor,
      round,
      sequence + 1,
      sequence,
      attackEvent.eventId,
      options,
    ));
  }
  return events;
}

function battleCounterAttackEvent(room, battle, actor, target, round, sequence, sourceSequence, counterSourceEventId, options = {}) {
  const actionId = String(actor.kind || BATTLE_ACTOR_KIND_PLAYER) === BATTLE_ACTOR_KIND_PLAYER
    ? BATTLE_ACTION_ATTACK
    : BATTLE_ACTION_PET_ATTACK;
  const confusion = battleConfusionAttackResolution(
    room,
    battle,
    actor,
    target,
    round,
    sequence,
    actionId,
    options,
    "",
  );
  const actualTarget = confusion.target;
  const command = {
    actorId: String(actor.actorId || ""),
    actorKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
    targetActorId: String(actualTarget.actorId || ""),
    targetAccountId: String(actualTarget.accountId || ""),
    actionId,
    actionKind: "counter_attack",
    skillId: actionId === BATTLE_ACTION_PET_ATTACK ? actionId : "",
  };
  const attackDamageResult = battleAttackDamageResult(room, battle, command, actor, actualTarget);
  const normalAttackDamage = attackDamageResult.damage;
  const reaction = resolveDamageReaction({
    randomAuthority: options.battleRandomAuthority,
    roomId: room.roomId,
    turnSeq: battle.turnSeq,
    round,
    sequence,
    rollSequence: Math.trunc(Number(sourceSequence || 0)) + 500,
    eventType: "counter_attack",
    actionId,
    effect: battleActionEffect(actionId),
    actor,
    target: actualTarget,
    baseDamage: counterDamageFor(normalAttackDamage),
  });
  const hpBefore = Number(actualTarget.hp || 0);
  const damageResult = applyBattleActorResolvedDamage(room, actualTarget, hpBefore, reaction.damage, {
    dodged: reaction.dodged,
    shareWithRide: true,
    canLaunch: String(room.mode || BATTLE_MODE_DUEL) === BATTLE_MODE_PARTY_PVE,
  });
  const hpAfter = damageResult.hpAfter;
  const launched = damageResult.launched;
  const statusChanges = confusion.statusChanges.concat(battleWakeFromDirectDamage(actualTarget, reaction.damage, reaction.dodged));
  syncParticipantPetSnapshotHp(room, actualTarget);
  addBattleEquipmentWearUsage(room, actor, "weaponAttacks", 1);
  if (!reaction.dodged && reaction.damage > 0) {
    addBattleEquipmentWearUsage(room, actualTarget, "armorHits", 1);
  }
  const expCredits = battleExpCreditsForDefeat(room, battle, actor, actualTarget, hpBefore, hpAfter);
  appendBattleExpCredits(battle, expCredits);
  return battleAttackEvent(
    room,
    battle,
    command,
    actor,
    actualTarget,
    round,
    sequence,
    hpBefore,
    hpAfter,
    reaction.damage,
    expCredits,
    launched,
    {...reaction, eventType: "counter_attack", counterSourceEventId, statusChanges, damageResult, confusion, attackDamageResult},
  );
}

function battleAttackEventTypeForCommand(command) {
  return String(command && command.actionKind || "attack") === "pet_skill" ? "pet_skill" : "basic_attack";
}

function applyBattleActorDodgeResult(room, target) {
  target.actionState = "dodge";
  target.launched = false;
  target.revivable = true;
  delete target.launchHpBefore;
  syncParticipantPetSnapshotHp(room, target);
  return false;
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

function battleComboAttackEvent(room, battle, group, round, sequence, options = {}) {
  const actor = group[0].actor;
  const command = group[0].command;
  const confusion = battleConfusionAttackResolution(
    room,
    battle,
    actor,
    group[0].target,
    round,
    sequence,
    command.actionId,
    options,
    group[0].declaredTargetActorId,
  );
  const target = confusion.target;
  const hpBefore = Number(target.hp || 0);
  const attackDamageResults = group.map((entry) => battleAttackDamageResult(
    room,
    battle,
    {
      ...entry.command,
      targetActorId: String(target.actorId || ""),
      targetAccountId: String(target.accountId || ""),
      targetUsername: String(target.username || ""),
    },
    entry.actor,
    target,
  ));
  const comboDamage = comboDamageFor(authoritativeBattleCombatFormula, attackDamageResults.map((entry) => entry.damage));
  const baseDamage = comboDamage.baseDamage;
  const comboBonus = comboDamage.comboBonus;
  const damage = comboDamage.damage;
  const damageResult = applyBattleActorResolvedDamage(room, target, hpBefore, damage, {
    shareWithRide: true,
    canLaunch: String(room.mode || BATTLE_MODE_DUEL) === BATTLE_MODE_PARTY_PVE,
  });
  const hpAfter = damageResult.hpAfter;
  const launched = damageResult.launched;
  const statusChanges = confusion.statusChanges.concat(battleWakeFromDirectDamage(target, damage, false));
  const actors = group.map((entry) => entry.actor);
  syncParticipantPetSnapshotHp(room, target);
  for (const participantActor of actors) {
    addBattleEquipmentWearUsage(room, participantActor, "weaponAttacks", 1);
  }
  if (damage > 0) {
    addBattleEquipmentWearUsage(room, target, "armorHits", 1);
  }
  const expCredits = battleExpCreditsForComboDefeat(room, battle, actors, target, hpBefore, hpAfter);
  appendBattleExpCredits(battle, expCredits);
  const participantNames = actors.map((entry) => String(entry.displayName || entry.username || "参战者"));
  const participantActorIds = actors.map((entry) => String(entry.actorId || "")).filter(Boolean);
  const targetRules = group
    .map((entry) => String(entry.command && entry.command.targetRule || ""))
    .filter(Boolean);
  const declaredTargetRule = targetRules.includes(BATTLE_TARGET_RULE_WILD_RANDOM)
    ? BATTLE_TARGET_RULE_WILD_RANDOM
    : (targetRules[0] || "");
  const targetRule = confusion.triggered ? BATTLE_TARGET_RULE_CONFUSION_SAME_SIDE : declaredTargetRule;
  const confusionFields = battleConfusionEventFields(confusion);
  const stoneDefenseFacts = {
    stoneDefenseApplied: attackDamageResults.some((entry) => Boolean(entry.stoneDefenseApplied)),
    stoneDefenseExtraReduction: attackDamageResults.reduce((sum, entry) => (
      sum + Math.max(0, Math.trunc(Number(entry.stoneDefenseExtraReduction || 0)))
    ), 0),
  };
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
    ...(confusion.triggered ? {declaredTargetRule} : {}),
    ...confusionFields,
    damage,
    comboBonus,
    blocked: Boolean(target.guarding),
    dodged: false,
    critical: false,
    counterTriggered: false,
    hpBefore,
    hpAfter,
    defeated: hpAfter <= 0,
    launched,
    ...battleDamageEventFields(damageResult),
    ...battleStoneDefenseEventFields(stoneDefenseFacts),
    combatFormulaId: String(comboDamage.formulaId || authoritativeBattleCombatFormula.id || ""),
    participantDamageFacts: attackDamageResults.map((entry, index) => ({
      actorId: String(actors[index] && actors[index].actorId || ""),
      damage: Math.max(1, Math.trunc(Number(entry.damage || 1))),
      ...battleCombatFormulaEventFields(entry),
      ...battleStoneDefenseEventFields(entry),
      schemaVersion: 1,
    })),
    statusChanges,
    animation: {
      actor: "combo_attack",
      targetReaction: launched ? "launched" : (hpAfter <= 0 ? "knockdown" : "hurt"),
      observer: "watch_target",
    },
    message: battleDamageMessage(`${confusion.triggered ? `${actor.displayName || actor.username || "参战者"} 因混乱改变了合击目标，` : ""}${participantNames.join("、")} 合击了 ${target.displayName || target.username || "目标"}，造成 ${damage} 点伤害${battleRideDamageMessageSuffix(damageResult)}。`, target, hpAfter, launched),
    schemaVersion: BATTLE_EVENT_CONTRACT_VERSION,
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
    const healTargetResult = trainingPartnerHealTargetForActor(battle, actor);
    const healTarget = healTargetResult.target;
    if (healTarget) {
      commands.push({
        commandId: `battle_ai_${round}_${sanitizeBattleActorIdPart(actor.actorId)}_heal`,
        roomId: room.roomId,
        round,
        accountId: "",
        username: "",
        actorId: actor.actorId,
        actorKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
        actionId: TRAINING_PARTNER_HEAL_SPIRIT_ID,
        actionKind: BATTLE_ACTION_TRAINING_PARTNER_HEAL,
        skillId: TRAINING_PARTNER_HEAL_SPIRIT_ID,
        spiritId: TRAINING_PARTNER_HEAL_SPIRIT_ID,
        petId: "",
        itemId: "",
        targetActorId: healTarget.actorId,
        targetAccountId: healTarget.accountId,
        targetUsername: healTarget.username,
        targetRule: healTargetResult.rule,
        targetRollIndex: healTargetResult.rollIndex,
        targetCandidateCount: healTargetResult.candidateCount,
        submittedAt: "",
        schemaVersion: 1,
      });
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

function trainingPartnerHealTargetForActor(battle, actor) {
  if (!battleActorIsTrainingPartnerHealer(actor)) {
    return {target: null, rule: "", rollIndex: -1, candidateCount: 0};
  }
  const ownerAccountId = String(actor.ownerAccountId || "").trim();
  const partnerId = String(actor.partnerId || "").trim();
  const candidates = (Array.isArray(battle && battle.actors) ? battle.actors : [])
    .filter((target) => trainingPartnerHealCandidate(target, actor, ownerAccountId, partnerId));
  candidates.sort((a, b) => {
    const ratioDiff = trainingPartnerHpRatio(a) - trainingPartnerHpRatio(b);
    if (Math.abs(ratioDiff) > 0.000001) {
      return ratioDiff;
    }
    const kindDiff = trainingPartnerHealKindOrder(a) - trainingPartnerHealKindOrder(b);
    if (kindDiff !== 0) {
      return kindDiff;
    }
    const orderDiff = battleActorSlotOrder(a) - battleActorSlotOrder(b);
    if (orderDiff !== 0) {
      return orderDiff;
    }
    return String(a.actorId || "").localeCompare(String(b.actorId || ""));
  });
  return {
    target: candidates[0] || null,
    rule: candidates.length > 0 ? "training_partner_low_hp" : "",
    rollIndex: candidates.length > 0 ? 0 : -1,
    candidateCount: candidates.length,
  };
}

function battleActorIsTrainingPartnerHealer(actor) {
  return Boolean(
    actor &&
    String(actor.side || "") === BATTLE_SIDE_ALLY &&
    String(actor.kind || BATTLE_ACTOR_KIND_PLAYER) === BATTLE_ACTOR_KIND_PLAYER &&
    String(actor.accountId || "").trim() === "" &&
    String(actor.ownerAccountId || "").trim() !== "" &&
    String(actor.partnerId || "").trim() !== "" &&
    Number(actor.hp || 0) > 0
  );
}

function trainingPartnerHealCandidate(target, actor, ownerAccountId, partnerId) {
  if (!target || Number(target.hp || 0) <= 0) {
    return false;
  }
  const targetKind = String(target.kind || BATTLE_ACTOR_KIND_PLAYER);
  if (targetKind !== BATTLE_ACTOR_KIND_PLAYER && targetKind !== BATTLE_ACTOR_KIND_PET) {
    return false;
  }
  if (String(target.side || "") !== String(actor.side || "")) {
    return false;
  }
  if (String(target.accountId || "").trim() !== "") {
    return false;
  }
  if (String(target.ownerAccountId || "").trim() !== ownerAccountId) {
    return false;
  }
  if (String(target.partnerId || "").trim() !== partnerId) {
    return false;
  }
  const maxHp = battleActorWritebackMaxHp(target);
  const hp = Math.max(0, Math.trunc(Number(target.hp || 0)));
  return maxHp > 0 && hp < maxHp && (hp / maxHp) < TRAINING_PARTNER_HEAL_LOW_HP_RATIO;
}

function trainingPartnerHpRatio(actor) {
  const maxHp = Math.max(1, battleActorWritebackMaxHp(actor));
  return Math.max(0, Number(actor && actor.hp || 0)) / maxHp;
}

function trainingPartnerHealKindOrder(actor) {
  return String(actor && actor.kind || BATTLE_ACTOR_KIND_PLAYER) === BATTLE_ACTOR_KIND_PLAYER ? 0 : 1;
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
  const side = String(actor && actor.side || "");
  if (side === BATTLE_SIDE_ENEMY) {
    return BATTLE_SIDE_ALLY;
  }
  if (side === BATTLE_SIDE_ALLY) {
    return BATTLE_SIDE_ENEMY;
  }
  if (side === "opponent" || side === "defender") {
    return "challenger";
  }
  return "opponent";
}

function battleParticipantByAccountId(room, accountId) {
  const normalizedAccountId = String(accountId || "");
  return (Array.isArray(room.participants) ? room.participants : []).find((participant) => (
    participant && String(participant.accountId || "") === normalizedAccountId
  )) || null;
}

function battleSettlementParticipantByAccountId(room, accountId) {
  const active = battleParticipantByAccountId(room, accountId);
  if (active) {
    return active;
  }
  const normalizedAccountId = String(accountId || "");
  const departed = room && room.departedParticipantsByAccountId && typeof room.departedParticipantsByAccountId === "object"
    ? room.departedParticipantsByAccountId[normalizedAccountId] || null
    : null;
  return departed && typeof departed === "object" && !Array.isArray(departed) ? departed : null;
}

function battleParticipantSideForAccount(room, accountId) {
  const participant = battleParticipantByAccountId(room, accountId);
  const side = String(participant && participant.side || "");
  if (side === "defender") {
    return "opponent";
  }
  return side;
}

function battleParticipantAccountIdsForSide(room, side) {
  const normalizedSide = String(side || "") === "defender" ? "opponent" : String(side || "");
  return (Array.isArray(room.participants) ? room.participants : [])
    .filter((participant) => {
      const participantSide = String(participant && participant.side || "") === "defender"
        ? "opponent"
        : String(participant && participant.side || "");
      return participantSide === normalizedSide;
    })
    .map((participant) => String(participant && participant.accountId || ""))
    .filter(Boolean);
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

function addClaimedMailItemsToActiveBattleRoom(data, accountId, items, nowFn = Date.now) {
  const room = activeBattleRoomForAccount(data, String(accountId || ""));
  if (!room || room.status === BATTLE_ROOM_CLOSED) {
    return null;
  }
  const participant = battleParticipantByAccountId(room, accountId);
  if (!participant) {
    return null;
  }
  let changed = false;
  for (const item of Array.isArray(items) ? items : []) {
    const itemId = normalizeBattleItemId(item && item.itemId);
    const count = Math.max(0, Math.trunc(Number(item && item.count || 0)));
    if (itemId === "" || count <= 0) {
      continue;
    }
    setParticipantBattleItemCount(participant, itemId, participantBattleItemCount(participant, itemId) + count);
    changed = true;
  }
  if (!changed) {
    return null;
  }
  const timestamp = isoNow(nowFn);
  room.updatedAt = timestamp;
  if (room.battle && typeof room.battle === "object" && !Array.isArray(room.battle)) {
    room.battle.updatedAt = timestamp;
  }
  data.battleRooms[room.roomId] = room;
  return room;
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
  const escapedAccountIds = battleEscapedPlayerAccountIds(room, battle);
  if (escapedAccountIds.length > 0) {
    return battleResultForEscapedAccount(room, escapedAccountIds[0], now);
  }
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
    if (!enemyAlive) {
      return {
        reason: "defeat",
        winnerAccountId: String(livingParticipantPlayer.accountId || ""),
        loserAccountIds: [],
        closedByAccountId: "",
        endedAt: isoNow(now),
        schemaVersion: 1,
      };
    }
    return null;
  }
  if (String(room.mode || BATTLE_MODE_DUEL) === BATTLE_MODE_MANOR_WAR) {
    const playerActors = actors.filter((actor) => (
      actor &&
      requiredBattleCommandAccountIds(room).includes(String(actor.accountId || "")) &&
      String(actor.kind || BATTLE_ACTOR_KIND_PLAYER) === BATTLE_ACTOR_KIND_PLAYER
    ));
    const livingSides = new Set(playerActors
      .filter((actor) => Number(actor.hp || 0) > 0)
      .map((actor) => String(actor.side || ""))
      .filter(Boolean));
    if (livingSides.has("challenger") && livingSides.has("opponent")) {
      return null;
    }
    const winnerSide = livingSides.has("challenger") ? "challenger" : (livingSides.has("opponent") ? "opponent" : "");
    const winner = winnerSide
      ? playerActors.find((actor) => String(actor.side || "") === winnerSide && Number(actor.hp || 0) > 0) || null
      : null;
    const loserSide = winnerSide === "challenger" ? "opponent" : (winnerSide === "opponent" ? "challenger" : "");
    return {
      reason: "defeat",
      winnerAccountId: winner ? String(winner.accountId || "") : "",
      loserAccountIds: loserSide ? battleParticipantAccountIdsForSide(room, loserSide) : requiredBattleCommandAccountIds(room),
      closedByAccountId: "",
      endedAt: isoNow(now),
      schemaVersion: 1,
    };
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

function battleEscapedPlayerAccountIds(room, battle) {
  const participantAccountIds = requiredBattleCommandAccountIds(room);
  const actors = Array.isArray(battle.actors) ? battle.actors : [];
  return participantAccountIds.filter((accountId) => actors.some((actor) => (
    actor &&
    String(actor.accountId || "") === String(accountId || "") &&
    String(actor.kind || BATTLE_ACTOR_KIND_PLAYER) === BATTLE_ACTOR_KIND_PLAYER &&
    Boolean(actor.escaped)
  )));
}

function battleResultForEscapedAccount(room, escapingAccountId, now) {
  const accountId = String(escapingAccountId || "");
  if (String(room.mode || BATTLE_MODE_DUEL) === BATTLE_MODE_PARTY_PVE) {
    return {
      reason: "escape",
      winnerAccountId: "",
      loserAccountIds: [],
      closedByAccountId: accountId,
      endedAt: isoNow(now),
      schemaVersion: 1,
    };
  }
  if (String(room.mode || BATTLE_MODE_DUEL) === BATTLE_MODE_MANOR_WAR) {
    const leavingSide = battleParticipantSideForAccount(room, accountId);
    const winnerSide = leavingSide === "challenger" ? "opponent" : "challenger";
    return {
      reason: "forfeit",
      winnerAccountId: battleParticipantAccountIdsForSide(room, winnerSide)[0] || "",
      loserAccountIds: leavingSide ? battleParticipantAccountIdsForSide(room, leavingSide) : (accountId ? [accountId] : []),
      closedByAccountId: accountId,
      endedAt: isoNow(now),
      schemaVersion: 1,
    };
  }
  return {
    reason: "forfeit",
    winnerAccountId: requiredBattleCommandAccountIds(room).find((entry) => entry !== accountId) || "",
    loserAccountIds: accountId ? [accountId] : [],
    closedByAccountId: accountId,
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
  if (String(room && room.mode || BATTLE_MODE_DUEL) === BATTLE_MODE_MANOR_WAR) {
    const leavingSide = battleParticipantSideForAccount(room, leavingAccountId);
    const winnerSide = leavingSide === "challenger" ? "opponent" : "challenger";
    const winnerAccountId = battleParticipantAccountIdsForSide(room, winnerSide)[0] || "";
    return {
      reason: "forfeit",
      winnerAccountId,
      loserAccountIds: leavingSide ? battleParticipantAccountIdsForSide(room, leavingSide) : (leavingAccountId ? [leavingAccountId] : []),
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

function closeBattleRoomWithResult(data, room, result, now, options = {}) {
  const battle = battleRoomBattleStateForMutation(room, now, options);
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
  battle.profileWriteback = applyBattleRoomProfileWriteback(data, room, battle, battle.result, now, options);
  const recordPointReturns = applyBattleRoomResultReturns(data, room, battle, battle.result, now);
  const recordPointReturnAccountIds = new Set(recordPointReturns.map((entry) => String(entry.accountId || "")).filter(Boolean));
  const positionRestores = restoreBattleParticipantPositions(data, room, {
    skipAccountIds: Array.from(recordPointReturnAccountIds),
    reason: String(result.reason || room.closeReason || "closed"),
    now,
  });
  const battleReturns = recordPointReturns.concat(positionRestores);
  battle.result.battleReturns = battleReturns;
  battle.result.battleRecordId = recordId;
  result.battleReturns = battleReturns;
  result.battleRecordId = recordId;
  const manorSettlement = settleManorWarFromBattleRoomResult(data, room, battle.result, {
    manorEntries,
    now,
    randomId: () => crypto.randomUUID().replace(/-/g, "").slice(0, 16),
  });
  if (manorSettlement && manorSettlement.settled) {
    battle.result.manorWarId = String(manorSettlement.warId || "");
    battle.result.manorBattleId = String(manorSettlement.battleId || "");
    battle.result.manorId = String(manorSettlement.manorId || "");
    battle.result.winnerFamilyId = String(manorSettlement.winnerFamilyId || "");
    battle.result.winnerFamilyName = String(manorSettlement.winnerFamilyName || "");
    result.manorWarId = battle.result.manorWarId;
    result.manorBattleId = battle.result.manorBattleId;
    result.manorId = battle.result.manorId;
    result.winnerFamilyId = battle.result.winnerFamilyId;
    result.winnerFamilyName = battle.result.winnerFamilyName;
  }
  appendBattleRecord(data, battleRecordForClosedRoom(data, room, battle.result, recordId));
  recordBattleTrace(data, room, "battle_room_closed", {
    recordId,
    reason: String(result.reason || ""),
    battleReturnCount: battleReturns.length,
  }, now);
  if (options.battleRandomAuthority && typeof options.battleRandomAuthority.closeRoom === "function") {
    options.battleRandomAuthority.closeRoom(room.roomId);
  }
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
    manorWarId: String(result.manorWarId || ""),
    manorBattleId: String(result.manorBattleId || ""),
    manorId: String(result.manorId || ""),
    winnerFamilyId: String(result.winnerFamilyId || ""),
    winnerFamilyName: String(result.winnerFamilyName || ""),
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
	      playerHp: entry && entry.playerHp && typeof entry.playerHp === "object" && !Array.isArray(entry.playerHp) ? clone(entry.playerHp) : null,
	      ridePetHp: entry && entry.ridePetHp && typeof entry.ridePetHp === "object" && !Array.isArray(entry.ridePetHp) ? clone(entry.ridePetHp) : null,
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
        failed: Boolean(exp.failed),
        code: String(exp.code || ""),
        attemptedAmount: Math.max(0, Math.trunc(Number(exp.attemptedAmount || 0))),
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


function applyBattleRoomProfileWriteback(data, room, battle, result, now, options = {}) {
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
  const expPreflight = preflightBattleRoomPetExpSettlements(
    data,
    room,
    battle,
    result,
    options.petExpSettlement,
  );
  const activeParticipantAccountIds = new Set(requiredBattleCommandAccountIds(room));
  for (const accountId of battleProfileWritebackAccountIds(room, battle)) {
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
    const assetConflict = rawBackpackAssetConflict(profile);
    if (assetConflict) {
      writeback.skippedProfiles.push({
        accountId: String(accountId || ""),
        playerId: String(binding.playerId || ""),
        reason: String(assetConflict.code || "profile_asset_state_conflict"),
      });
      continue;
    }
    const accountActors = battle.actors.filter((actor) => actor && String(actor.accountId || "") === String(accountId || ""));
    const summary = {
      accountId: String(accountId || ""),
      playerId: String(binding.playerId || ""),
      profileRevision: Number(binding.profileRevision || profileDoc.profileRevision || 0),
      playerHp: null,
      ridePetHp: null,
      petHps: [],
      equipmentWear: null,
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
    const participant = battleSettlementParticipantByAccountId(room, accountId);
    const participantPlayer = participant && participant.teamSnapshot && participant.teamSnapshot.player && typeof participant.teamSnapshot.player === "object" && !Array.isArray(participant.teamSnapshot.player)
      ? participant.teamSnapshot.player
      : null;
    const livePlayerActor = accountActors.find((actor) => String(actor.kind || BATTLE_ACTOR_KIND_PLAYER) === BATTLE_ACTOR_KIND_PLAYER) || null;
    const playerActor = livePlayerActor || (participantPlayer ? {
      ...participantPlayer,
      actorId: `team_snapshot:player:${String(accountId || "")}`,
      accountId: String(accountId || ""),
      kind: BATTLE_ACTOR_KIND_PLAYER,
    } : null);
    if (playerActor) {
      const applied = applyBattleActorHpToProfilePlayer(profile, playerActor);
      changed = changed || applied.changed;
      summary.playerHp = applied.publicHp;
      const rideApplied = applyBattleActorRideHpToProfile(profile, playerActor);
      if (String(playerActor.ridePetInstanceId || "").trim() !== "" && !rideApplied.found) {
        writeback.skippedProfiles.push({
          accountId: String(accountId || ""),
          playerId: String(binding.playerId || ""),
          petId: String(playerActor.ridePetInstanceId || ""),
          reason: "ride_pet_instance_missing",
        });
      }
      changed = changed || rideApplied.changed;
      summary.ridePetHp = rideApplied.publicHp;
      const equipmentWear = applyEquipmentWearUsageToProfile(
        profile,
        objectOrEmpty(playerActor.equipmentWearUsage),
        battleEquipmentCatalog,
        equipmentWearRulesFromDocument(playerGrowthDocument()),
      );
      if (!equipmentWear.ok) {
        writeback.skippedProfiles.push({
          accountId: String(accountId || ""),
          playerId: String(binding.playerId || ""),
          reason: String(equipmentWear.code || "equipment_wear_state_conflict"),
        });
      }
      changed = changed || equipmentWear.changed;
      summary.equipmentWear = {
        usage: clone(equipmentWear.usage),
        durabilityDrops: clone(equipmentWear.durabilityDrops),
        brokenLabels: clone(equipmentWear.brokenLabels),
        ...(equipmentWear.ok ? {} : {skippedReason: String(equipmentWear.code || "equipment_wear_state_conflict")}),
        schemaVersion: 1,
      };
      const synchronizedStats = synchronizeProfileEquipmentStats(profile);
      changed = changed || synchronizedStats.changed;
      if (summary.playerHp && synchronizedStats.stats) {
        summary.playerHp.hp = Math.max(1, Math.trunc(Number(profile.player.hp || 1)));
        summary.playerHp.maxHp = Math.max(1, Math.trunc(Number(profile.player.maxHp || 1)));
      }
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
    if (itemWriteback.skippedReason) {
      writeback.skippedProfiles.push({
        accountId: String(accountId || ""),
        playerId: String(binding.playerId || ""),
        reason: String(itemWriteback.skippedReason),
      });
    }
    changed = changed || itemWriteback.changed;
    summary.battleItemBag = itemWriteback.publicItemBag;
    const captureToolWriteback = participant
      ? applyCaptureToolBagToProfile(profile, participantCaptureToolBag(participant))
      : {changed: false, publicCaptureToolBag: captureToolBagFromProfile(profile)};
    if (captureToolWriteback.skippedReason) {
      writeback.skippedProfiles.push({
        accountId: String(accountId || ""),
        playerId: String(binding.playerId || ""),
        reason: String(captureToolWriteback.skippedReason),
      });
    }
    changed = changed || captureToolWriteback.changed;
    summary.captureToolBag = captureToolWriteback.publicCaptureToolBag;
    const captureWriteback = applyBattleCapturedPetsToProfile(profile, battle, accountId, room, options);
    changed = changed || captureWriteback.changed;
    summary.capturedPets = captureWriteback.capturedPets;
    summary.lostCapturedPets = captureWriteback.lostCapturedPets;
    if (activeParticipantAccountIds.has(String(accountId || ""))) {
      const expReward = battleRoomProfileExpReward(room, battle, result, profile, accountId);
      const expWriteback = applyBattleExpRewardToProfile(
        profile,
        battle,
        accountId,
        expReward,
        options.petExpSettlement,
        expPreflight.ok ? null : expPreflight,
      );
      changed = changed || expWriteback.changed;
      summary.exp = expWriteback.publicExp;
      const rewardWriteback = applyBattleVictoryRewardsToProfile(profile, room, battle, result, {
        data,
        accountId,
        roomId: String(room && room.roomId || ""),
        now,
        randomId: options.randomId,
        battleVictoryRewardResolver: options.battleVictoryRewardResolver,
      });
      if (!rewardWriteback.ok) {
        const skippedReason = String(rewardWriteback.code || "battle_reward_equipment_state_conflict");
        writeback.skippedProfiles.push({
          accountId: String(accountId || ""),
          playerId: String(binding.playerId || ""),
          reason: skippedReason,
        });
        summary.rewards = {
          skippedReason,
          message: String(rewardWriteback.message || "战斗奖励结算已安全暂停，请联系GM处理。"),
          schemaVersion: 1,
        };
      } else {
        changed = changed || rewardWriteback.changed;
        summary.rewards = rewardWriteback.publicRewards;
      }
      const specialWriteback = applyBattleSpecialVictoryProgressToProfile(
        profile,
        room,
        battle,
        result,
        options.newPetFactory,
      );
      changed = changed || specialWriteback.changed;
      summary.special = specialWriteback.publicSpecial;
      const questWriteback = applyBattleQuestProgressToProfile(profile, room, battle, result, accountId, captureWriteback.capturedPets);
      changed = changed || questWriteback.changed;
      summary.quests = questWriteback.publicQuests;
      const hangWriteback = applyBattleHangSessionToProfile(profile, room, battle, result, accountId, captureWriteback.capturedPets.length);
      changed = changed || hangWriteback.changed;
      summary.hang = hangWriteback.publicHang;
    }
    if (summary.rewards || summary.quests) {
      summary.battleItemBag = battleItemBagFromProfile(profile);
      summary.captureToolBag = captureToolBagFromProfile(profile);
    }
    if (playerActor) {
      const finalSynchronizedStats = synchronizeProfileEquipmentStats(profile);
      changed = changed || finalSynchronizedStats.changed;
      if (summary.playerHp && finalSynchronizedStats.stats) {
        summary.playerHp.hp = Math.max(1, Math.trunc(Number(profile.player.hp || 1)));
        summary.playerHp.maxHp = Math.max(1, Math.trunc(Number(profile.player.maxHp || 1)));
      }
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

function battleProfileWritebackAccountIds(room, battle) {
  const accountIds = new Set(requiredBattleCommandAccountIds(room).map((entry) => String(entry || "")).filter(Boolean));
  const departed = room && room.departedParticipantsByAccountId && typeof room.departedParticipantsByAccountId === "object"
    ? room.departedParticipantsByAccountId
    : {};
  for (const accountId of Object.keys(departed)) {
    if (accountId) {
      accountIds.add(accountId);
    }
  }
  for (const actor of Array.isArray(battle && battle.actors) ? battle.actors : []) {
    const claimantAccountId = String(actor && actor.capturedByAccountId || "");
    if (claimantAccountId) {
      accountIds.add(claimantAccountId);
    }
  }
  const candidates = battle && battle.captureCandidatesByActorId && typeof battle.captureCandidatesByActorId === "object"
    ? battle.captureCandidatesByActorId
    : {};
  for (const candidate of Object.values(candidates)) {
    const claimantAccountId = String(candidate && (
      candidate.claimantAccountId || candidate.claimedByAccountId || candidate.ownerAccountId
    ) || "");
    if (claimantAccountId) {
      accountIds.add(claimantAccountId);
    }
  }
  return Array.from(accountIds);
}

function preflightBattleRoomPetExpSettlements(data, room, battle, result, petExpSettlement) {
  for (const accountId of requiredBattleCommandAccountIds(room)) {
    const binding = data.profileBindings[String(accountId || "")] || null;
    const profileDoc = binding && binding.playerId ? data.profiles[binding.playerId] || null : null;
    const profile = profileDoc && profileDoc.profile && typeof profileDoc.profile === "object" && !Array.isArray(profileDoc.profile)
      ? clone(profileDoc.profile)
      : null;
    if (!profile) {
      continue;
    }
    const reward = battleRoomProfileExpReward(room, battle, result, profile, accountId);
    if (!reward || typeof reward !== "object" || Array.isArray(reward)) {
      continue;
    }
    const prepared = prepareBattlePetExpSettlements(profile, reward, petExpSettlement);
    if (!prepared.ok) {
      return prepared;
    }
  }
  return {ok: true};
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
    encounterZoneId: String(raw.encounterZoneId || ""),
    encounterGroupId: String(raw.encounterGroupId || ""),
    encounterStoneItemId: String(raw.encounterStoneItemId || ""),
    encounterIntervalMs: Math.max(0, Math.trunc(Number(raw.encounterIntervalMs || 0))),
    startedAt: String(raw.startedAt || ""),
    expiresAt: String(raw.expiresAt || ""),
    encounterActivationId: String(raw.encounterActivationId || ""),
    encounterConsumedSlot: Math.max(0, Math.trunc(Number(raw.encounterConsumedSlot || 0))),
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
    encounterZoneId: normalized.encounterZoneId,
    encounterGroupId: normalized.encounterGroupId,
    encounterStoneItemId: normalized.encounterStoneItemId,
    encounterIntervalMs: normalized.encounterIntervalMs,
    startedAt: normalized.startedAt,
    expiresAt: normalized.expiresAt,
    encounterActivationId: normalized.encounterActivationId,
    encounterConsumedSlot: normalized.encounterConsumedSlot,
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
  const partyMemberCount = battleQuestPartyMemberCountForAccount(room, accountId);
  for (const event of battleSpiritQuestEventsForProfile(room, battle, accountId, encounterGroupId, interactionId)) {
    events.push(event);
  }
  if (battleRoomIsPartyPveVictory(room, battle, result)) {
    events.push({
      type: "battle_victory",
      encounterGroupId,
      interactionId,
      partyMemberCount,
      schemaVersion: 1,
    });
    if (interactionId !== "") {
      events.push({
        type: "defeat_npc",
        encounterGroupId,
        interactionId,
        targetId: interactionId,
        partyMemberCount,
        schemaVersion: 1,
      });
    }
  }
  for (const pet of Array.isArray(capturedPets) ? capturedPets : []) {
    events.push({
      type: "capture_pet",
      formId: String(pet && pet.formId || ""),
      lineId: String(pet && pet.lineId || ""),
      captureToolId: String(pet && pet.captureToolId || ""),
      targetStatusIds: uniqueStringArray(pet && pet.captureStatusIds),
      amount: 1,
      encounterGroupId,
      partyMemberCount,
      schemaVersion: 1,
    });
  }
  return events;
}

function battleQuestPartyMemberCountForAccount(room, accountId) {
  if (String(room && room.mode || BATTLE_MODE_DUEL) !== BATTLE_MODE_PARTY_PVE) {
    return 0;
  }
  const participants = Array.isArray(room.participants) ? room.participants : [];
  const humanMemberCount = participants
    .filter((participant) => participant && String(participant.accountId || "") !== "")
    .filter((participant) => String(participant.accountId || "") !== String(accountId || ""))
    .length;
  const selfParticipant = participants.find((participant) => participant && String(participant.accountId || "") === String(accountId || "")) || null;
  const snapshot = selfParticipant && selfParticipant.teamSnapshot && typeof selfParticipant.teamSnapshot === "object" && !Array.isArray(selfParticipant.teamSnapshot)
    ? selfParticipant.teamSnapshot
    : {};
  const trainingPartners = Array.isArray(snapshot.trainingPartners)
    ? snapshot.trainingPartners.filter((partner) => partner && typeof partner === "object" && !Array.isArray(partner))
    : [];
  return Math.max(0, humanMemberCount + trainingPartners.length);
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
  const questId = ensureActiveQuestForProfile(profile);
  return recordQuestEventByIdToProfile(profile, questId, event);
}

function recordQuestEventByIdToProfile(profile, questId, event) {
  const quest = questById(questId);
  if (!quest) {
    return {ok: false, code: "quest_missing", changed: false, ready: false, questId: "", title: "", message: "任务不存在。"};
  }
  const states = profileQuestStates(profile);
  const state = normalizeQuestState(states[questId], questId);
  const accepted = Boolean(states[questId]) || String(profile && profile.activeQuestId || "") === questId;
  const prerequisitesOk = accepted ? questProgressAvailableForProfile(profile, quest) : questAvailableForProfile(profile, quest);
  if (!prerequisitesOk) {
    return {ok: false, code: "quest_unavailable", changed: false, ready: false, questId, title: questTitle(quest), message: "任务暂不可接取。"};
  }
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
  const quest = questById(ensureActiveQuestForProfile(profile));
  return Boolean(quest && quest.autoClaimOnReady) && questRewardChoices(quest).length <= 0;
}

function claimActiveQuestToProfile(profile) {
  const questId = ensureActiveQuestForProfile(profile);
  return claimQuestByIdToProfile(profile, questId, "", true);
}

function claimQuestByIdToProfile(profile, questId, rewardChoiceId = "", advanceActive = true) {
  const backpackConflict = rawBackpackAssetConflict(profile);
  if (backpackConflict) {
    return backpackConflict;
  }
  const activeQuestIdBeforeClaim = advanceActive ? ensureActiveQuestForProfile(profile) : currentProfileQuestId(profile);
  const quest = questById(questId);
  if (!quest) {
    return {ok: false, code: "quest_missing", message: "当前没有可领取的任务奖励。"};
  }
  if (!questProgressAvailableForProfile(profile, quest)) {
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
  if (!rewards.ok) {
    return rewards;
  }
  state.status = "claimed";
  state.progress = questRequiredCount(quest);
  states[questId] = state;
  const nextQuestId = questNextId(quest);
  if (advanceActive && activeQuestIdBeforeClaim === questId) {
    const nextQuest = questById(nextQuestId);
    if (nextQuestId !== "" && nextQuest && questAvailableForProfile(profile, nextQuest)) {
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
  const backpackConflict = rawBackpackAssetConflict(profile);
  if (backpackConflict) {
    return backpackConflict;
  }
  const staged = clone(profile);
  const choice = rewardChoice && typeof rewardChoice === "object" && !Array.isArray(rewardChoice) ? rewardChoice : {};
  const stoneCoins = questRewardStoneCoins(quest) + Math.max(0, Math.trunc(Number(choice.stoneCoins || 0)));
  if (stoneCoins > 0) {
    setProfileCurrencyAmount(staged, SHOP_CURRENCY_STONE_COINS, profileStoneCoins(staged) + stoneCoins);
  }
  const itemResult = addRewardItemsToBackpack(profileBackpackSlots(staged), mergeItemAmounts([
    ...questRewardItems(quest),
    ...questRewardChoiceItems(choice),
  ]));
  if (itemResult.lostItems.length > 0) {
    return fail("quest_reward_backpack_full", "请先整理背包再领取任务奖励；奖励不会因背包已满而丢失。", {
      lostItems: itemResult.lostItems,
    });
  }
  staged.backpackSlots = itemResult.slots;
  const instanceGrant = grantFreshBackpackEquipmentInstances(
    staged,
    battleEquipmentCatalog,
    itemResult.addedItems,
    `quest:${String(quest && quest.id || "reward")}`,
    {expToNextLevel: battleExpToNextLevel},
  );
  if (!instanceGrant.ok) {
    return instanceGrant;
  }
  staged.captureTools = captureToolBagFromProfile(staged);
  const unlockedAbilities = new Set(uniqueStringArray(staged.unlockedAbilities || []));
  const addedAbilities = [];
  for (const ability of [...questRewardAbilities(quest), ...questRewardChoiceAbilities(choice)]) {
    const abilityId = String(ability.abilityId || ability.id || "").trim();
    if (abilityId !== "" && !unlockedAbilities.has(abilityId)) {
      unlockedAbilities.add(abilityId);
      addedAbilities.push({abilityId, label: String(ability.label || abilityId)});
    }
  }
  staged.unlockedAbilities = Array.from(unlockedAbilities);
  replaceObjectContents(profile, staged);
  return {
    ok: true,
    stoneCoins,
    addedItems: itemResult.addedItems,
    lostItems: itemResult.lostItems,
    addedAbilities,
    schemaVersion: 1,
  };
}

function currentProfileQuestId(profile) {
  const explicit = String(profile && profile.activeQuestId || "").trim();
  if (explicit !== "") {
    const quest = questById(explicit);
    const states = profileQuestStates(profile || {});
    const state = normalizeQuestState(states[explicit], explicit);
    if (quest && !questIsOptional(quest) && String(state.status || "active") !== "claimed" && questProgressAvailableForProfile(profile, quest)) {
      return explicit;
    }
  }
  return firstAvailableUnfinishedQuestIdForProfile(profile);
}

function questAvailableForProfile(profile, quest, checkLevel = true) {
  if (checkLevel && questPlayerLevel(profile) < questRequiredLevel(quest)) {
    return false;
  }
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

function questProgressAvailableForProfile(profile, quest) {
  return questAvailableForProfile(profile, quest, false);
}

function ensureActiveQuestForProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return "";
  }
  const states = profileQuestStates(profile);
  let questId = currentProfileQuestId(profile);
  const quest = questById(questId);
  if (!quest || questIsOptional(quest) || !questProgressAvailableForProfile(profile, quest)) {
    questId = firstAvailableUnfinishedQuestIdForProfile(profile);
  }
  if (questId !== "") {
    states[questId] = normalizeQuestState(states[questId], questId);
    profile.activeQuestId = questId;
  } else {
    profile.activeQuestId = "";
  }
  profile.questStates = states;
  return questId;
}

function firstAvailableUnfinishedQuestIdForProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return "";
  }
  const states = profileQuestStates(profile);
  for (const quest of quests()) {
    if (questIsOptional(quest)) {
      continue;
    }
    const questId = String(quest.id || "").trim();
    if (questId === "") {
      continue;
    }
    const state = normalizeQuestState(states[questId], questId);
    if (states[questId] && String(state.status || "active") === "claimed") {
      continue;
    }
    if (!questAvailableForProfile(profile, quest)) {
      if (questPlayerLevel(profile) < questRequiredLevel(quest)) {
        return "";
      }
      continue;
    }
    return questId;
  }
  return "";
}

function profileQuestStates(profile) {
  if (!profile.questStates || typeof profile.questStates !== "object" || Array.isArray(profile.questStates)) {
    profile.questStates = {};
  }
  if (!profile.questStates[QUEST_SET_BATTLE_PET_ID]) {
    const statusPanelState = normalizeQuestState(profile.questStates[QUEST_OPEN_STATUS_PANEL_ID], QUEST_OPEN_STATUS_PANEL_ID);
    if (profile.questStates[QUEST_OPEN_STATUS_PANEL_ID] && String(statusPanelState.status || "") === "claimed") {
      profile.questStates[QUEST_SET_BATTLE_PET_ID] = {
        questId: QUEST_SET_BATTLE_PET_ID,
        status: "claimed",
        progress: 1,
      };
    }
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
  const title = String(quest && quest.title || "任务");
  const requiredLevel = questRequiredLevel(quest);
  return `[${requiredLevel}] ${title}`;
}

function questRequiredLevel(quest) {
  return Math.max(1, Math.trunc(Number(quest && quest.requiredLevel || 1)));
}

function questRecommendedLevel(quest) {
  return Math.max(0, Math.trunc(Number(quest && quest.recommendedLevel || 0)));
}

function questPlayerLevel(profile) {
  return Math.max(1, Math.trunc(Number(profile && profile.player && profile.player.level || 1)));
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
    if (!questMatchesMinimumNumberFilter(objective, event, "partyMemberCount", "minPartyMemberCount")) {
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
    if (!questMatchesStringFilter(objective, event, "captureToolId")) {
      return 0;
    }
    const requiredStatusId = String(objective.requiredStatusId || objective.statusId || "").trim();
    if (requiredStatusId !== "" && !questEventStatusIds(event).includes(requiredStatusId)) {
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
  if (type === "sell_item") {
    if (eventType !== "sell_item") {
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
  if (type === "open_feature") {
    return eventType === "open_feature" && questMatchesStringFilter(objective, event, "featureId") ? 1 : 0;
  }
  if (type === "start_hang") {
    if (
      eventType !== "start_hang" ||
      !questMatchesStringFilter(objective, event, "mode")
    ) {
      return 0;
    }
    return 1;
  }
  if (type === "market_list") {
    if (
      eventType !== "market_list" ||
      !questMatchesStringFilter(objective, event, "itemId") ||
      !questMatchesStringFilter(objective, event, "currency") ||
      !questMatchesMaximumNumberFilter(objective, event, "unitPrice", "maxUnitPrice") ||
      !questMatchesMaximumNumberFilter(objective, event, "amount", "maxCount")
    ) {
      return 0;
    }
    return Math.max(1, Math.trunc(Number(event.amount || 1)));
  }
  if (type === "market_buy") {
    if (
      eventType !== "market_buy" ||
      !questMatchesStringFilter(objective, event, "itemId") ||
      !questMatchesStringFilter(objective, event, "sellerKind")
    ) {
      return 0;
    }
    return Math.max(1, Math.trunc(Number(event.amount || 1)));
  }
  if (type === "claim_mail") {
    return eventType === "claim_mail" && questMatchesStringFilter(objective, event, "mailKind") ? 1 : 0;
  }
  if (type === "send_chat") {
    return eventType === "send_chat" && questMatchesStringFilter(objective, event, "channel") ? 1 : 0;
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
  if (type === "training_partner_count") {
    if (eventType !== "training_partner_set_count") {
      return 0;
    }
    const requiredCount = Math.max(1, Math.trunc(Number(objective.count || 1)));
    const currentCount = Math.max(0, Math.trunc(Number(event.count || event.amount || 0)));
    return currentCount >= requiredCount ? requiredCount : 0;
  }
  if (type === "ride_pet") {
    if (eventType !== "ride_pet") {
      return 0;
    }
    if (
      !questMatchesStringFilter(objective, event, "lineId") ||
      !questMatchesStringFilter(objective, event, "formId")
    ) {
      return 0;
    }
    return Math.max(1, Math.trunc(Number(event.amount || 1)));
  }
  if (type === "battle_pet") {
    if (eventType !== "battle_pet") {
      return 0;
    }
    if (
      !questMatchesStringFilter(objective, event, "lineId") ||
      !questMatchesStringFilter(objective, event, "formId")
    ) {
      return 0;
    }
    if (Boolean(objective.excludeRidePet)) {
      const instanceId = String(event.instanceId || "").trim();
      const ridePetInstanceId = String(event.ridePetInstanceId || "").trim();
      if (instanceId === "" || (ridePetInstanceId !== "" && instanceId === ridePetInstanceId)) {
        return 0;
      }
    }
    return Math.max(1, Math.trunc(Number(event.amount || 1)));
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
  const actual = String(event && event[key] || "").trim();
  if (expected === "" || actual === expected) {
    return true;
  }
  return key === "formId"
    && uniqueStringArray(objective && objective.legacyFormIds).includes(actual);
}

function questMatchesMinimumNumberFilter(objective, event, eventKey, objectiveKey) {
  const minimum = Math.max(0, Math.trunc(Number(objective && (objective[objectiveKey] ?? objective[eventKey]) || 0)));
  if (minimum <= 0) {
    return true;
  }
  return Math.trunc(Number(event && event[eventKey] || 0)) >= minimum;
}

function questMatchesMaximumNumberFilter(objective, event, eventKey, objectiveKey) {
  const maximum = Math.max(0, Math.trunc(Number(objective && (objective[objectiveKey] ?? objective[eventKey]) || 0)));
  if (maximum <= 0) {
    return true;
  }
  return Math.trunc(Number(event && event[eventKey] || 0)) <= maximum;
}

function questMatchesItemFilter(objective, event) {
  return questMatchesStringFilter(objective, event, "itemId");
}

function questEventStatusIds(event) {
  const result = uniqueStringArray([
    ...stringArray(event && event.targetStatusIds),
    ...stringArray(event && event.statusIds),
  ]);
  const targetStatusId = String(event && event.targetStatusId || "").trim();
  const statusId = String(event && event.statusId || "").trim();
  if (targetStatusId !== "" && !result.includes(targetStatusId)) {
    result.push(targetStatusId);
  }
  if (statusId !== "" && !result.includes(statusId)) {
    result.push(statusId);
  }
  return result;
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
  result.featureId = String(result.featureId || "").trim();
  result.mode = String(result.mode || "").trim();
  result.encounterGroupId = String(result.encounterGroupId || "").trim();
  result.currency = String(result.currency || "").trim();
  result.mailKind = String(result.mailKind || "").trim();
  result.sellerKind = String(result.sellerKind || "").trim();
  result.channel = String(result.channel || "").trim();
  result.unitPrice = Math.max(0, Math.trunc(Number(result.unitPrice || 0)));
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

function applyBattleVictoryRewardsToProfile(profile, room, battle, result, options = {}) {
  if (!battleRoomIsPartyPveVictory(room, battle, result)) {
    return {ok: true, changed: false, publicRewards: null};
  }
  const backpackConflict = rawBackpackAssetConflict(profile);
  if (backpackConflict) {
    return backpackConflict;
  }
  const rewardResolver = typeof options.battleVictoryRewardResolver === "function"
    ? options.battleVictoryRewardResolver
    : battleVictoryRewardForRoom;
  const reward = rewardResolver(room);
  if (!reward || (reward.stoneCoins <= 0 && reward.items.length <= 0)) {
    return {ok: true, changed: false, publicRewards: null};
  }
  const staged = clone(profile);
  let changed = false;
  const previousCoins = profileStoneCoins(staged);
  if (reward.stoneCoins > 0) {
    setProfileCurrencyAmount(staged, SHOP_CURRENCY_STONE_COINS, previousCoins + reward.stoneCoins);
    changed = true;
  }
  const beforeSlots = normalizeBackpackSlots(profileBackpackSlots(staged));
  const itemResult = addRewardItemsToBackpack(beforeSlots, reward.items);
  if (itemResult.changed) {
    staged.backpackSlots = itemResult.slots;
    const instanceGrant = grantFreshBackpackEquipmentInstances(
      staged,
      battleEquipmentCatalog,
      itemResult.addedItems,
      `battle_reward:${String(reward.tableId || "unknown")}`,
      {expToNextLevel: battleExpToNextLevel},
    );
    if (!instanceGrant.ok) {
      return instanceGrant;
    }
    staged.captureTools = captureToolBagFromProfile(staged);
    changed = true;
  }
  const lostEquipment = firstEquipmentTransferEntry(battleEquipmentCatalog, itemResult.lostItems);
  if (lostEquipment) {
    return fail("battle_reward_equipment_backpack_full", "背包空间不足，装备奖励结算已安全暂停，请联系GM处理。", {
      itemId: lostEquipment.itemId,
    });
  }
  const qualificationClaim = markQualificationBattleClaim(staged, reward);
  changed = changed || qualificationClaim.changed;
  const mailedItems = qualificationClaim.qualification
    ? createQualificationRewardMail(options, reward, itemResult.lostItems)
    : {items: [], mail: null};
  const publicRewards = {
    tableId: reward.tableId,
    rewardRole: reward.rewardRole,
    repeatable: reward.repeatable,
    sourceZoneId: reward.sourceZoneId,
    sourceEncounterGroupId: reward.sourceEncounterGroupId,
    stoneCoins: reward.stoneCoins,
    addedItems: itemResult.addedItems,
    mailedItems: mailedItems.items,
    lostItems: mailedItems.items.length > 0 ? [] : itemResult.lostItems,
    qualificationClaimCycle: qualificationClaim.claimCycle,
    rewardMail: mailedItems.mail ? publicMail(mailedItems.mail) : null,
    schemaVersion: 1,
  };
  replaceObjectContents(profile, staged);
  return {ok: true, changed, publicRewards};
}

function markQualificationBattleClaim(profile, reward) {
  const qualification = (
    String(reward && reward.rewardRole || "") === "qualification_battle" &&
    reward && reward.repeatable === false
  );
  const groupId = String(reward && reward.sourceEncounterGroupId || "").trim();
  if (!qualification || groupId === "") {
    return {changed: false, qualification: false, claimCycle: 0};
  }
  const claimCycle = Math.max(0, Math.trunc(Number(profile && profile[PLAYER_REBIRTH_COUNT_KEY] || 0)));
  const claims = objectOrEmpty(profile[QUALIFICATION_BATTLE_CLAIMS_KEY]);
  const previousClaim = objectOrEmpty(claims[groupId]);
  const previousCycle = Number(previousClaim.rebirthCycle ?? previousClaim.cycle);
  if (previousClaim.claimed !== false && Number.isInteger(previousCycle) && previousCycle === claimCycle) {
    return {changed: false, qualification: true, claimCycle};
  }
  claims[groupId] = {rebirthCycle: claimCycle, claimed: true, schemaVersion: 1};
  profile[QUALIFICATION_BATTLE_CLAIMS_KEY] = claims;
  return {changed: true, qualification: true, claimCycle};
}

function createQualificationRewardMail(options, reward, items) {
  const attachments = mergeItemAmounts(items);
  if (attachments.length <= 0) {
    return {items: [], mail: null};
  }
  const data = options && options.data;
  const accountId = String(options && options.accountId || "").trim();
  const account = data && accountById(data, accountId);
  if (!data || !account) {
    return {items: [], mail: null};
  }
  const nowFn = typeof options.now === "function" ? options.now : () => Date.now();
  const randomId = typeof options.randomId === "function" ? options.randomId : () => crypto.randomUUID();
  data.mailMessages = objectOrEmpty(data.mailMessages);
  let mailId = "";
  const roomId = String(options && options.roomId || "").trim();
  if (roomId !== "") {
    const digest = crypto.createHash("sha256").update([
      accountId,
      roomId,
      String(reward && reward.tableId || ""),
    ].join(":"), "utf8").digest("hex").slice(0, 32);
    const candidate = `mail_qualification_${digest}`;
    if (!Object.hasOwn(data.mailMessages, candidate)) {
      mailId = candidate;
    }
  }
  for (let attempt = 0; attempt < 8 && mailId === ""; attempt += 1) {
    const candidate = `mail_qualification_${String(randomId() || "").trim()}`;
    if (candidate !== "mail_qualification_" && !Object.hasOwn(data.mailMessages, candidate)) {
      mailId = candidate;
    }
  }
  if (mailId === "") {
    throw new Error("qualification reward mail id unavailable");
  }
  const rewardText = itemAmountText(attachments);
  const mail = {
    mailId,
    mailKind: "qualification_reward",
    senderAccountId: "system_qualification",
    senderUsername: "trial_guardian",
    senderDisplayName: "试炼守护",
    recipientAccountId: account.accountId,
    recipientUsername: account.username,
    recipientDisplayName: account.displayName,
    title: "试炼资格奖励",
    body: `背包空间不足，${rewardText} 已放入本邮件附件，请及时领取。`,
    items: attachments,
    createdAt: isoNow(nowFn),
    readAt: null,
    schemaVersion: 1,
  };
  data.mailMessages[mail.mailId] = mail;
  return {items: attachments, mail};
}

function applyBattleSpecialVictoryProgressToProfile(profile, room, battle, result, newPetFactory) {
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
    const access = petRebirthMmTrialAccess(profile);
    const grant = access.ok ? grantPetRebirthMm(profile, 1, newPetFactory) : access;
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
    rewardRole: String(table.rewardRole || ""),
    repeatable: table.repeatable !== false,
    sourceZoneId: String(encounter.zoneId || ""),
    sourceEncounterGroupId: String(encounter.groupId || ""),
    stoneCoins: battleRewardStoneCoins(seedBase, table),
    items: battleRewardItems(seedBase, table),
  };
}

function battleRewardTableForRoom(room) {
  const encounter = room && room.encounter && typeof room.encounter === "object" && !Array.isArray(room.encounter) ? room.encounter : {};
  const rewardTableId = String(encounter.rewardTableId || "").trim();
  if (rewardTableId !== "") {
    const explicitTable = battleRewardTableForId(rewardTableId);
    if (Object.keys(explicitTable).length > 0) {
      return explicitTable;
    }
  }
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
  return Math.max(0, Math.min(PROFILE_STONE_COIN_LIMIT, Math.trunc(Number(profile && profile.stoneCoins || 0))));
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

function manorEntries() {
  const raw = manorDocument().manors;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((manor) => manor && typeof manor === "object" && !Array.isArray(manor) && String(manor.id || "") !== "");
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

function shopAccessFor(shopId) {
  const shop = shopForId(shopId);
  return shop && shop.access && typeof shop.access === "object" && !Array.isArray(shop.access) ? shop.access : {};
}

function shopAccessCheck(data, account, access) {
  const manorId = String(access && access.familyManorId || "").trim();
  if (manorId && !familyOwnsManor(data, account.accountId, manorId)) {
    return {
      ok: false,
      code: "shop_family_manor_required",
      message: "需要家族占领对应庄园后才能购买。",
      extra: {manorId},
    };
  }
  return {ok: true};
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
  profile.stoneCoins = Math.min(PROFILE_STONE_COIN_LIMIT, safeAmount);
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
  const limit = backpackSlotLimitFromValue(value, explicitSlotLimit);
  const result = [];
  if (Array.isArray(value)) {
    for (const rawSlot of value) {
      if (result.length >= limit) {
        break;
      }
      const slot = rawSlot && typeof rawSlot === "object" && !Array.isArray(rawSlot) ? rawSlot : {};
      const itemId = String(slot.itemId || "").trim();
      if (!bagItemById(itemId)) {
        result.push({});
        continue;
      }
      const count = Math.max(0, Math.trunc(Number(slot.count || 0)));
      if (count <= 0) {
        result.push({});
        continue;
      }
      let remaining = count;
      const stackLimit = bagItemStackLimit(itemId);
      while (remaining > 0 && result.length < limit) {
        const stackCount = Math.min(remaining, stackLimit);
        result.push({itemId, count: stackCount});
        remaining -= stackCount;
      }
    }
  }
  while (result.length < limit) {
    result.push({});
  }
  return result;
}

function moveBackpackStack(slots, sourceIndex, targetIndex, amount = -1) {
  const nextSlots = normalizeBackpackSlots(slots);
  const sourceSlotIndex = Math.trunc(Number(sourceIndex));
  const targetSlotIndex = Math.trunc(Number(targetIndex));
  if (sourceSlotIndex < 0 || targetSlotIndex < 0 || sourceSlotIndex >= nextSlots.length || targetSlotIndex >= nextSlots.length) {
    return {ok: false, code: "backpack_slot_invalid", message: "背包格子无效。"};
  }
  if (sourceSlotIndex === targetSlotIndex) {
    return {ok: false, code: "backpack_slot_same", message: "物品已在这个格子。"};
  }
  const source = objectOrEmpty(nextSlots[sourceSlotIndex]);
  const itemId = String(source.itemId || "").trim();
  const sourceCount = Math.max(0, Math.trunc(Number(source.count || 0)));
  if (!bagItemById(itemId) || sourceCount <= 0) {
    return {ok: false, code: "backpack_source_empty", message: "这个格子没有物品。"};
  }
  const target = objectOrEmpty(nextSlots[targetSlotIndex]);
  const targetItemId = String(target.itemId || "").trim();
  const targetCount = Math.max(0, Math.trunc(Number(target.count || 0)));
  const moveCount = Math.trunc(Number(amount || 0)) <= 0 ? sourceCount : Math.max(1, Math.min(sourceCount, Math.trunc(Number(amount || 0))));
  const itemLabel = bagItemLabel(itemId);
  if (targetItemId === "") {
    nextSlots[targetSlotIndex] = {itemId, count: moveCount};
    const remaining = sourceCount - moveCount;
    nextSlots[sourceSlotIndex] = remaining > 0 ? {itemId, count: remaining} : {};
    return {ok: true, slots: normalizeBackpackSlots(nextSlots), itemId, count: moveCount, sourceSlotIndex, targetSlotIndex, message: `已移动${itemLabel} x${moveCount}。`};
  }
  if (targetItemId === itemId) {
    const room = Math.max(0, bagItemStackLimit(itemId) - targetCount);
    if (room <= 0) {
      return {ok: false, code: "backpack_stack_full", message: `${itemLabel} 已达到堆叠上限。`};
    }
    const mergedCount = Math.min(moveCount, room);
    nextSlots[targetSlotIndex] = {itemId, count: targetCount + mergedCount};
    const remaining = sourceCount - mergedCount;
    nextSlots[sourceSlotIndex] = remaining > 0 ? {itemId, count: remaining} : {};
    return {ok: true, slots: normalizeBackpackSlots(nextSlots), itemId, count: mergedCount, sourceSlotIndex, targetSlotIndex, message: `已合并${itemLabel} x${mergedCount}。`};
  }
  if (moveCount < sourceCount) {
    return {ok: false, code: "backpack_partial_swap_blocked", message: "拆分到空格，或整组交换。"};
  }
  nextSlots[sourceSlotIndex] = clone(target);
  nextSlots[targetSlotIndex] = clone(source);
  return {ok: true, slots: normalizeBackpackSlots(nextSlots), itemId, count: moveCount, sourceSlotIndex, targetSlotIndex, message: "已交换物品。"};
}

function splitBackpackStack(slots, sourceIndex, quantity, targetIndex = -1) {
  const nextSlots = normalizeBackpackSlots(slots);
  const sourceSlotIndex = Math.trunc(Number(sourceIndex));
  if (sourceSlotIndex < 0 || sourceSlotIndex >= nextSlots.length) {
    return {ok: false, code: "backpack_slot_invalid", message: "背包格子无效。"};
  }
  const source = objectOrEmpty(nextSlots[sourceSlotIndex]);
  const itemId = String(source.itemId || "").trim();
  const sourceCount = Math.max(0, Math.trunc(Number(source.count || 0)));
  if (!bagItemById(itemId) || sourceCount <= 1) {
    return {ok: false, code: "backpack_split_unavailable", message: "这个物品不能拆分。"};
  }
  const splitCount = Math.max(1, Math.min(sourceCount - 1, Math.trunc(Number(quantity || 1))));
  let targetSlotIndex = Math.trunc(Number(targetIndex || -1));
  if (targetSlotIndex < 0) {
    targetSlotIndex = nextSlots.findIndex((slot, index) => index !== sourceSlotIndex && String(slot && slot.itemId || "") === "");
  }
  if (targetSlotIndex < 0 || targetSlotIndex >= nextSlots.length || targetSlotIndex === sourceSlotIndex) {
    return {ok: false, code: "backpack_no_empty_slot", message: "没有空格可以拆分。"};
  }
  if (String(objectOrEmpty(nextSlots[targetSlotIndex]).itemId || "") !== "") {
    return {ok: false, code: "backpack_target_not_empty", message: "请选择一个空格拆分。"};
  }
  nextSlots[sourceSlotIndex] = {itemId, count: sourceCount - splitCount};
  nextSlots[targetSlotIndex] = {itemId, count: splitCount};
  return {ok: true, slots: normalizeBackpackSlots(nextSlots), itemId, count: splitCount, sourceSlotIndex, targetSlotIndex, message: `已拆分${bagItemLabel(itemId)} x${splitCount}。`};
}

function discardBackpackStack(slots, sourceIndex, quantity = -1) {
  const nextSlots = normalizeBackpackSlots(slots);
  const sourceSlotIndex = Math.trunc(Number(sourceIndex));
  if (sourceSlotIndex < 0 || sourceSlotIndex >= nextSlots.length) {
    return {ok: false, code: "backpack_slot_invalid", message: "背包格子无效。"};
  }
  const source = objectOrEmpty(nextSlots[sourceSlotIndex]);
  const itemId = String(source.itemId || "").trim();
  const sourceCount = Math.max(0, Math.trunc(Number(source.count || 0)));
  if (!bagItemById(itemId) || sourceCount <= 0) {
    return {ok: false, code: "backpack_source_empty", message: "这个格子没有物品。"};
  }
  const discardCount = Math.trunc(Number(quantity || 0)) <= 0 ? sourceCount : Math.max(1, Math.min(sourceCount, Math.trunc(Number(quantity || 0))));
  const remaining = sourceCount - discardCount;
  nextSlots[sourceSlotIndex] = remaining > 0 ? {itemId, count: remaining} : {};
  return {ok: true, slots: normalizeBackpackSlots(nextSlots), itemId, count: discardCount, sourceSlotIndex, message: `已丢弃${bagItemLabel(itemId)} x${discardCount}。`};
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

function emptyItemSlots(slotCount) {
  return Array.from({length: Math.max(0, Math.trunc(Number(slotCount || 0)))}, () => ({}));
}

function profileBankStateOptions() {
  return {
    tabCount: BANK_TAB_COUNT,
    slotsPerTab: BANK_SLOTS_PER_TAB,
    defaultUnlockedTabs: BANK_DEFAULT_UNLOCKED_TABS,
    stoneCoinLimit: BANK_STONE_COIN_LIMIT,
    itemById: bagItemById,
    isEquipmentItemId: isEquipmentAssetItemId,
    itemStackLimit: bagItemStackLimit,
    equipmentTransferOptions: {
      ...equipmentWearRulesFromDocument(playerGrowthDocument()),
      expToNextLevel: battleExpToNextLevel,
      maxPlayerLevel: MAX_PLAYER_LEVEL,
    },
  };
}

function readProfileBankState(value) {
  return readBankProfileState(value, battleEquipmentCatalog, profileBankStateOptions());
}

function normalizeProfileBankData(value) {
  const state = readProfileBankState(value);
  return state.ok ? state.bank : null;
}

function rawProfileBankAssetConflict(value) {
  const state = readProfileBankState(value);
  if (state.ok) {
    return null;
  }
  return {
    ok: false,
    code: String(state.code || "bank_schema_invalid"),
    message: String(state.message || "银行数据版本无法识别，本次操作已取消；石币和物品会原样保留，请联系GM处理。"),
    ...Object.fromEntries(Object.entries(state).filter(([key]) => (
      !["ok", "code", "message", "bank"].includes(key)
    ))),
  };
}

function profileBankItemCount(profile, itemId) {
  const normalizedItemId = String(itemId || "").trim();
  if (normalizedItemId === "") {
    return 0;
  }
  const bank = normalizeProfileBankData(profile && profile.bank);
  return (bank && Array.isArray(bank.items) ? bank.items : []).reduce((sum, item) => (
    String(item && item.itemId || "") === normalizedItemId
      ? sum + Math.max(0, Math.trunc(Number(item.count || 0)))
      : sum
  ), 0);
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

function bagItemBinding(itemId) {
  const item = bagItemById(itemId);
  return String(item && item.binding || ITEM_BINDING_UNBOUND) === ITEM_BINDING_BOUND
    ? ITEM_BINDING_BOUND
    : ITEM_BINDING_UNBOUND;
}

function bagItemIsBound(itemId) {
  return bagItemBinding(itemId) === ITEM_BINDING_BOUND;
}

function petTemplateForFormId(formId) {
  const normalizedFormId = String(formId || "").trim();
  if (normalizedFormId === "") {
    return {};
  }
  const form = petTemplateFormById(normalizedFormId);
  if (!form || Object.keys(form).length <= 0) {
    return {};
  }
  const line = petTemplateLineById(form.lineId);
  const subtype = petTemplateSubtypeById(form.subtypeId);
  if (!line || Object.keys(line).length <= 0 || !subtype || Object.keys(subtype).length <= 0) {
    return {};
  }
  const activeSkillIds = petTemplateActiveSkillIdsForSubtype(subtype);
  return {
    ...clone(form),
    lineName: String(line.lineName || ""),
    subtypeName: String(subtype.subtypeName || ""),
    activeSkillIds,
    passiveSkillIds: petTemplatePassiveSkillIdsForLine(line),
    petSkillSlots: petSkillSlotsForSkillIds(activeSkillIds, []),
  };
}

function petTemplateFormById(formId) {
  const normalizedFormId = String(formId || "").trim();
  const forms = Array.isArray(petTemplateDocument().forms) ? petTemplateDocument().forms : [];
  return forms.find((form) => form && typeof form === "object" && !Array.isArray(form) && String(form.formId || "") === normalizedFormId) || {};
}

function petTemplateLineById(lineId) {
  const normalizedLineId = String(lineId || "").trim();
  const lines = Array.isArray(petTemplateDocument().lines) ? petTemplateDocument().lines : [];
  return lines.find((line) => line && typeof line === "object" && !Array.isArray(line) && String(line.lineId || "") === normalizedLineId) || {};
}

function petTemplateSubtypeById(subtypeId) {
  const normalizedSubtypeId = String(subtypeId || "").trim();
  const subtypes = Array.isArray(petTemplateDocument().subtypes) ? petTemplateDocument().subtypes : [];
  return subtypes.find((subtype) => subtype && typeof subtype === "object" && !Array.isArray(subtype) && String(subtype.subtypeId || "") === normalizedSubtypeId) || {};
}

function petTemplateActiveSkillIdsForSubtype(subtype) {
  return uniqueStringArray(subtype && subtype.activeSkillIds).filter((skillId) => battlePetSkillActionById(skillId));
}

function petTemplatePassiveSkillIdsForLine(line) {
  const passiveIds = uniqueStringArray(line && line.passiveSkillIds);
  const passiveId = String(line && line.passiveSkillId || "").trim();
  if (passiveId !== "" && !passiveIds.includes(passiveId)) {
    passiveIds.push(passiveId);
  }
  return passiveIds;
}

function petActiveSkillIdsForSource(source) {
  const formId = String(source && (source.formId || source.templateId || source.speciesId) || "").trim();
  const template = petTemplateForFormId(formId);
  const forgotten = uniqueStringArray(source && source.forgottenSkillIds);
  const explicitSkillIds = uniqueStringArray(source && source.activeSkillIds).filter((skillId) => battlePetSkillActionById(skillId));
  const templateSkillIds = uniqueStringArray(template.activeSkillIds).filter((skillId) => battlePetSkillActionById(skillId));
  const configuredSkillIds = explicitSkillIds.length > 0 ? explicitSkillIds : templateSkillIds;
  const result = [];
  for (const skillId of [BATTLE_ACTION_PET_ATTACK, BATTLE_ACTION_PET_DEFEND, ...configuredSkillIds]) {
    if (!forgotten.includes(skillId) && battlePetSkillActionById(skillId) && !result.includes(skillId)) {
      result.push(skillId);
    }
  }
  return result;
}

function petPassiveSkillIdsForSource(source) {
  const formId = String(source && (source.formId || source.templateId || source.speciesId) || "").trim();
  const template = petTemplateForFormId(formId);
  return uniqueStringArray([
    ...uniqueStringArray(template.passiveSkillIds),
    ...uniqueStringArray(source && source.passiveSkillIds),
  ]);
}

function petSkillSlotsForSkillIds(skillIds, rawSlots) {
  return normalizePetSkillSlots(skillIds, rawSlots, battlePetSkillActionById);
}

function battleActorPetSkillIds(actor) {
  const source = actor || {};
  return equippedPetSkillIds(
    petActiveSkillIdsForSource(source),
    source.petSkillSlots,
    battlePetSkillActionById,
  );
}

function battleActorHasUsablePetSkill(actor) {
  return battleActorPetSkillIds(actor).length > 0;
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
    battleActorRideEligibleForExp(actor)
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

function battleActorRideEligibleForExp(actor) {
  if (!actor || typeof actor !== "object" || Array.isArray(actor)) {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(actor, "rideActiveAtApply")) {
    return Boolean(actor.rideActiveAtApply);
  }
  return activeRideFacts(actor).active;
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
      if (petId !== "" && battleActorRideEligibleForExp(actor) && !ridePetAwards.has(petId)) {
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
  return authoritativeScaledBattleExpForRecipientLevel(baseReward, recipientLevel, enemyLevel);
}

function applyBattleExpRewardToProfile(
  profile,
  battle,
  accountId,
  reward,
  petExpSettlement,
  preflightFailure = null,
) {
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
  if (preflightFailure) {
    return failedBattleExpWriteback(summary, preflightFailure);
  }
  const preparedPets = prepareBattlePetExpSettlements(profile, reward, petExpSettlement);
  if (!preparedPets.ok) {
    return failedBattleExpWriteback(summary, preparedPets);
  }

  let changed = false;
  if (!profile.player || typeof profile.player !== "object" || Array.isArray(profile.player)) {
    profile.player = {};
  }
  if (battleExpAwardIsPresent(reward.player)) {
    const playerAward = applyPlayerExpToProfile(profile, battleExpAwardAmount(reward.player), {
      statPointsPerLevel: PLAYER_STAT_POINTS_PER_LEVEL,
      name: String(profile.player.name || profile.player.displayName || reward.player.name || "人物"),
    });
    if (!playerAward.ok) {
      return failedBattleExpWriteback(summary, playerAward);
    }
    changed = changed || playerAward.changed;
    summary.player = {
      ...playerAward.publicExp,
      ...publicBattleExpAwardDetails(reward.player),
    };
  }

  for (const prepared of preparedPets.pets) {
    replaceObjectContents(prepared.target, prepared.pet);
  }
  changed = changed || preparedPets.changed;
  summary.pets = preparedPets.publicPets;
  summary.ridePets = preparedPets.publicRidePets;

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

function failedBattleExpWriteback(summary, failure) {
  return {
    changed: false,
    publicExp: {
      ...summary,
      amount: 0,
      baseAmount: 0,
      rawBaseAmount: 0,
      scaledAmount: 0,
      partyBonusAmount: 0,
      killCount: 0,
      attemptedAmount: summary.amount,
      attemptedBaseAmount: summary.baseAmount,
      attemptedRawBaseAmount: summary.rawBaseAmount,
      attemptedScaledAmount: summary.scaledAmount,
      attemptedPartyBonusAmount: summary.partyBonusAmount,
      attemptedKillCount: summary.killCount,
      failed: true,
      code: String(failure && failure.code || "pet_growth_state_invalid"),
      message: String(failure && failure.message || "宠物成长数据异常，本次经验未结算。"),
    },
  };
}

function prepareBattlePetExpSettlements(profile, reward, petExpSettlement) {
  const candidates = new Map();
  const publicPets = [];
  const publicRidePets = [];
  let changed = false;

  function prepare(rewardEntry, targetSummaries, fallbackName) {
    const petId = String(rewardEntry && rewardEntry.petId || "").trim();
    if (petId === "" || !battleExpAwardIsPresent(rewardEntry)) {
      return null;
    }
    const target = profilePetById(profile, petId);
    if (!target) {
      return null;
    }
    const current = candidates.has(target) ? candidates.get(target).pet : target;
    const result = petExpSettlement.settle(
      current,
      battleExpAwardAmount(rewardEntry),
      MAX_PET_LEVEL,
      {name: String(current.name || current.displayName || rewardEntry.name || fallbackName)},
    );
    candidates.set(target, {target, pet: result.pet});
    changed = changed || result.changed;
    targetSummaries.push({
      petId,
      ...result.publicExp,
      ...publicBattleExpAwardDetails(rewardEntry),
    });
    return result;
  }

  try {
    for (const petReward of Array.isArray(reward.pets) ? reward.pets : []) {
      prepare(petReward, publicPets, "宠物");
    }
    for (const rideReward of Array.isArray(reward.ridePets) ? reward.ridePets : []) {
      prepare(rideReward, publicRidePets, "骑宠");
    }
  } catch (error) {
    return publicPetExpSettlementFailure(error);
  }

  return {
    ok: true,
    changed,
    pets: Array.from(candidates.values()),
    publicPets,
    publicRidePets,
  };
}

function replaceObjectContents(target, source) {
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  Object.assign(target, clone(source));
  return target;
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
    if (petId !== "" && battleActorRideEligibleForExp(actor) && !ids.includes(petId)) {
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

function chargeEquippedPlayerExpPill(profile, amount) {
  const overflowExp = Math.max(0, Math.trunc(Number(amount || 0)));
  if (overflowExp <= 0) {
    return {ok: true, changed: false, chargedExp: 0, unchargedExp: 0, pillLevelsGained: 0, itemId: ""};
  }
  const itemId = String(objectOrEmpty(profile && profile.equipmentSlots).exp_pill || "").trim();
  if (itemId === "") {
    return {ok: true, changed: false, chargedExp: 0, unchargedExp: overflowExp, pillLevelsGained: 0, itemId: ""};
  }
  const item = equipmentItemById(itemId);
  if (!item || item.expPill !== true || String(item.slot || "") !== "exp_pill") {
    return {ok: false, code: "equipment_exp_pill_invalid", message: "经验丹槽档案异常，请联系GM处理。"};
  }
  const equipped = requireEquippedEquipmentInstance(profile, battleEquipmentCatalog, "exp_pill");
  if (!equipped.ok) {
    return equipped;
  }
  const compatibility = validateEquipmentSlotInstanceCompatibility(profile, equipped);
  if (!compatibility.ok) {
    return compatibility;
  }
  const beforeCharge = normalizeEquipmentExpPillCharge(itemId, profile.equipmentExpPillCharge);
  const award = playerLevelRuntime.awardEntry(beforeCharge, overflowExp, MAX_PLAYER_LEVEL);
  const nextCharge = {
    itemId,
    level: award.level,
    exp: award.exp,
    nextExp: award.nextExp,
  };
  const chargedExp = Math.max(0, overflowExp - Math.max(0, Number(award.overflowExp || 0)));
  const instances = equipped.state.instances;
  instances[equipped.instanceId] = {
    ...instances[equipped.instanceId],
    expPillCharge: {
      ...objectOrEmpty(instances[equipped.instanceId].expPillCharge),
      ...nextCharge,
    },
  };
  profile.equipmentExpPillCharge = nextCharge;
  profile.equipmentInstances = instances;
  profile.equipmentSlotsVersion = EQUIPMENT_SLOTS_VERSION;
  return {
    ok: true,
    changed: chargedExp > 0,
    chargedExp,
    unchargedExp: Math.max(0, Number(award.overflowExp || 0)),
    pillLevelsGained: Math.max(0, award.level - beforeCharge.level),
    itemId,
    instanceId: equipped.instanceId,
    charge: nextCharge,
  };
}

function applyPlayerExpToProfile(profile, amount, options = {}) {
  if (!profile.player || typeof profile.player !== "object" || Array.isArray(profile.player)) {
    profile.player = {};
  }
  const nextPlayer = clone(profile.player);
  const award = applyBattleExpToEntry(nextPlayer, amount, MAX_PLAYER_LEVEL, options);
  const charge = chargeEquippedPlayerExpPill(profile, Number(award.publicExp && award.publicExp.overflowExp || 0));
  if (!charge.ok) {
    return charge;
  }
  profile.player = nextPlayer;
  return {
    ok: true,
    changed: award.changed || charge.changed,
    publicExp: {
      ...award.publicExp,
      chargedExp: charge.chargedExp,
      unchargedExp: charge.unchargedExp,
      pillLevelsGained: charge.pillLevelsGained,
      expPillItemId: charge.itemId,
      expPillInstanceId: charge.instanceId || "",
      expPillCharge: clone(charge.charge || {}),
    },
  };
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
  return playerLevelRuntime.awardEntry(entry, amount, maxLevel);
}

function battleExpToNextLevel(level) {
  return playerLevelRuntime.expToNextLevel(level);
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
  const hp = Math.max(1, battleActorWritebackHp(actor));
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

function applyBattleActorRideHpToProfile(profile, actor) {
  const petId = String(actor && actor.ridePetInstanceId || "").trim();
  if (petId === "") {
    return {found: false, changed: false, publicHp: null};
  }
  const pet = profilePetById(profile, petId);
  if (!pet) {
    return {found: false, changed: false, publicHp: null};
  }
  const maxHp = Math.max(1, Math.trunc(Number(actor.ridePetMaxHp || pet.maxHp || 1)));
  const hp = clampInt(actor.ridePetHp, 0, maxHp, maxHp);
  const knocked = Boolean(actor.ridePetKnocked) || hp <= 0 || String(actor.ridePetBattleState || "") === "rest";
  const state = knocked ? "rest" : BATTLE_PET_STATE_RIDING;
  let changed = false;
  if (Number(pet.hp) !== hp) {
    pet.hp = hp;
    changed = true;
  }
  if (String(pet.state || pet.status || pet.battleState || "") !== state) {
    pet.state = state;
    changed = true;
  }
  if (knocked && String(profile.ridePetInstanceId || "") === petId) {
    profile.ridePetInstanceId = "";
    changed = true;
  }
  return {
    found: true,
    changed,
    publicHp: {
      actorId: String(actor.actorId || ""),
      petId,
      hp,
      maxHp,
      state,
      knocked,
      schemaVersion: 1,
    },
  };
}

function applyBattleItemBagToProfile(profile, battleItemBag) {
  const backpackConflict = rawBackpackAssetConflict(profile);
  if (backpackConflict) {
    return {
      changed: false,
      publicItemBag: battleItemBagFromProfile(profile),
      skippedReason: backpackConflict.code,
    };
  }
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
  const backpackConflict = rawBackpackAssetConflict(profile);
  if (backpackConflict) {
    return {
      changed: false,
      publicCaptureToolBag: captureToolBagFromProfile(profile),
      skippedReason: backpackConflict.code,
    };
  }
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
  const stackLimit = bagItemStackLimit(itemId);
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

function applyBattleCapturedPetsToProfile(profile, battle, accountId, room, options = {}) {
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
    const canJoinParty = partyCount < BATTLE_PET_MAX_PER_PARTICIPANT;
    const canEnterStorage = storageCount < BATTLE_PET_STORAGE_LIMIT;
    const state = canJoinParty ? BATTLE_PET_STATE_STANDBY : BATTLE_PET_STATE_STORAGE;
    const materialized = options.petCaptureCandidateAuthority && typeof options.petCaptureCandidateAuthority.materialize === "function"
      ? options.petCaptureCandidateAuthority.materialize(room, {
        actorId: String(actor.actorId || ""),
        accountId: String(accountId || ""),
        state,
        capturedSerial: serial,
        captureStatusIds: uniqueStringArray(actor.captureStatusIds || battleActorActiveStatusIds(actor)),
      })
      : null;
    if (!materialized || materialized.ok !== true || !materialized.pet) {
      continue;
    }
    const captured = clone(materialized.pet);
    serial += 1;
    if (!canJoinParty && !canEnterStorage) {
      // 正常路径会在投掷捕捉随机数前拒绝满容量；若内部运维在战斗中改档，宁可临时超额收容也绝不吞掉已认领宠物。
      captured.state = BATTLE_PET_STATE_STORAGE;
      captured.captureOverflowPending = true;
    }
    instances.push(captured);
    if (String(captured.state || state) === BATTLE_PET_STATE_STORAGE) {
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
  const instances = Array.isArray(profile && profile.petInstances)
    ? profile.petInstances
    : (Array.isArray(profile && profile.pets) ? profile.pets : []);
  return instances.filter((pet) => pet && String(pet.state || BATTLE_PET_STATE_STANDBY) !== BATTLE_PET_STATE_STORAGE).length;
}

function profileStoragePetCount(profile) {
  const instances = Array.isArray(profile && profile.petInstances)
    ? profile.petInstances
    : (Array.isArray(profile && profile.pets) ? profile.pets : []);
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

function applyProfileActionToProfile(profile, action, params, now, options = {}) {
  const backpackConflict = rawBackpackAssetConflict(profile);
  if (backpackConflict) {
    return backpackConflict;
  }
  switch (action) {
    case "player_stat_allocate":
      return applyPlayerStatAllocateAction(profile, params);
    case "backpack_unlock_slot":
      return applyBackpackUnlockSlotAction(profile, params);
    case "bank_unlock_tab":
      return applyBankUnlockTabAction(profile, params);
    case "backpack_move_stack":
      return applyBackpackMoveStackAction(profile, params);
    case "backpack_split_stack":
      return applyBackpackSplitStackAction(profile, params);
    case "backpack_discard_item":
      return applyBackpackDiscardItemAction(profile, params);
    case "battle_pet_tutorial_egg_reclaim":
      return applyBattlePetTutorialEggReclaimAction(profile);
    case "village_heal":
      return applyVillageHealAction(profile);
    case "record_point_save":
      return applyRecordPointSaveAction(profile, params);
    case "world_item_use":
      return applyWorldItemUseAction(profile, params, options);
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
      return applyPetRebirthMmStage2ClaimAction(profile, options.newPetFactory);
    case "pet_rebirth_mm_guide_start":
      return applyPetRebirthMmGuideStartAction(profile, now);
    case "pet_cultivation_apply":
      return applyPetCultivationAction(profile, params, now, options.petRebirthGrowthCycle);
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
    formId: String(source.formId || ""),
    lineId: String(source.lineId || ""),
    state: String(source.state || ""),
    statKey: String(source.statKey || ""),
    gain: Math.max(0, Math.trunc(Number(source.gain || 0))),
    dropId: String(source.dropId || ""),
    slot: Math.max(0, Math.trunc(Number(source.slot || 0))),
    sourceSlotIndex: Math.max(0, Math.trunc(Number(source.sourceSlotIndex || 0))),
    targetSlotIndex: Math.max(0, Math.trunc(Number(source.targetSlotIndex || 0))),
    cost: Math.max(0, Math.trunc(Number(source.cost || 0))),
    count: Math.max(0, Math.trunc(Number(source.count || 0))),
    previousCount: Math.max(0, Math.trunc(Number(source.previousCount || 0))),
    availableSlots: Math.max(0, Math.trunc(Number(source.availableSlots || 0))),
    amount: Math.max(0, Math.trunc(Number(source.amount || source.heal || source.exp || 0))),
    changedCount: Math.max(0, Math.trunc(Number(source.changedCount || 0))),
    skippedCount: Math.max(0, Math.trunc(Number(source.skippedCount || 0))),
    chargedExp: Math.max(0, Math.trunc(Number(source.chargedExp || 0))),
    unchargedExp: Math.max(0, Math.trunc(Number(source.unchargedExp || 0))),
    pillLevelsGained: Math.max(0, Math.trunc(Number(source.pillLevelsGained || 0))),
    expPillItemId: String(source.expPillItemId || ""),
    expPillInstanceId: String(source.expPillInstanceId || ""),
    expPillLevel: Math.max(0, Math.trunc(Number(source.expPillLevel || 0))),
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

function profilePetBinding(pet) {
  return String(pet && pet.binding || ITEM_BINDING_UNBOUND) === ITEM_BINDING_BOUND
    ? ITEM_BINDING_BOUND
    : ITEM_BINDING_UNBOUND;
}

function profilePetIsBound(pet) {
  return profilePetBinding(pet) === ITEM_BINDING_BOUND;
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

function profileHasUnlockedAbility(profile, abilityId) {
  const normalizedAbilityId = String(abilityId || "").trim();
  return normalizedAbilityId !== "" && uniqueStringArray(profile && profile.unlockedAbilities).includes(normalizedAbilityId);
}

function profilePetFormId(pet) {
  return String(pet && (pet.formId || pet.templateId || pet.speciesId) || "").trim();
}

function canRideProfilePet(profile, pet) {
  if (!profileHasUnlockedAbility(profile, ABILITY_RIDING)) {
    return false;
  }
  const template = petTemplateForFormId(profilePetFormId(pet));
  const riding = objectOrEmpty(template.riding);
  if (!Boolean(riding.rideable)) {
    return false;
  }
  if (profilePetState(pet) === BATTLE_PET_STATE_STORAGE || Math.trunc(Number(pet.hp || 0)) <= 0) {
    return false;
  }
  const level = Math.max(1, Math.trunc(Number(pet.level || 1)));
  return level <= RIDE_SKILL_LEVEL_CAP;
}

function profileBackpackExtraSlots(profile) {
  return clampInt(profile && profile.backpackExtraSlots, 0, BACKPACK_EXTRA_SLOT_LIMIT, 0);
}

function profileBackpackSlotLimit(profile) {
  return resolvedBackpackSlotLimit(BACKPACK_BASE_SLOT_LIMIT + profileBackpackExtraSlots(profile));
}

function rawBackpackAssetConflict(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return {
      ok: false,
      code: "backpack_asset_state_invalid",
      message: "背包档案异常，本次操作已取消；全部物品会原样保留，请联系GM处理。",
    };
  }
  if (!Object.hasOwn(profile, "backpackSlots")) {
    const captureToolConflict = rawCaptureToolMirrorConflict(profile, null);
    return captureToolConflict || rawEquipmentInstanceConflict(profile);
  }
  const slots = profile.backpackSlots;
  if (!Array.isArray(slots) || slots.length > profileBackpackSlotLimit(profile)) {
    return {
      ok: false,
      code: "backpack_asset_state_invalid",
      message: "背包档案异常，本次操作已取消；全部物品会原样保留，请联系GM处理。",
    };
  }
  for (const slot of slots) {
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
      return {
        ok: false,
        code: "backpack_asset_state_invalid",
        message: "背包档案异常，本次操作已取消；全部物品会原样保留，请联系GM处理。",
      };
    }
    const itemId = String(slot.itemId || "").trim();
    const keys = Object.keys(slot);
    if (itemId === "") {
      const emptyCount = Number(slot.count ?? 0);
      if (
        !Number.isSafeInteger(emptyCount)
        || emptyCount !== 0
        || keys.some((key) => !["itemId", "count"].includes(key))
      ) {
        return {
          ok: false,
          code: "backpack_asset_state_invalid",
          message: "背包空格含当前版本无法识别的数据，本次操作已取消；全部物品会原样保留，请联系GM处理。",
        };
      }
      continue;
    }
    if (!bagItemById(itemId)) {
      return {
        ok: false,
        code: "backpack_item_unknown",
        message: "背包内有当前版本无法识别的物品，本次操作已取消；全部物品会原样保留，请联系GM处理。",
      };
    }
    const count = Number(slot.count);
    if (
      !Number.isSafeInteger(count)
      || count < 1
      || count > bagItemStackLimit(itemId)
      || keys.some((key) => !["itemId", "count"].includes(key))
    ) {
      return {
        ok: false,
        code: "backpack_asset_state_invalid",
        message: "背包物品档案异常，本次操作已取消；全部物品会原样保留，请联系GM处理。",
      };
    }
  }
  const captureToolConflict = rawCaptureToolMirrorConflict(profile, slots);
  return captureToolConflict || rawEquipmentInstanceConflict(profile);
}

function rawEquipmentInstanceConflict(profile) {
  const state = readEquipmentInstanceState(profile, battleEquipmentCatalog);
  return state.ok ? null : state;
}

function fullSaveEquipmentAuditConflict(profile) {
  const raw = profile && typeof profile === "object" && !Array.isArray(profile) ? profile : {};
  const declaresInstanceAuthority = Object.hasOwn(raw, "equipmentInstances")
    || Object.hasOwn(raw, "equipmentSlotInstanceIds")
    || Number(raw.equipmentSlotsVersion || 0) >= EQUIPMENT_SLOTS_VERSION;
  if (!declaresInstanceAuthority) {
    return null;
  }
  const audit = auditEquipmentProfileState(raw, battleEquipmentCatalog);
  return audit.ok ? null : audit;
}

function rawCaptureToolMirrorConflict(profile, canonicalSlots) {
  if (!Object.hasOwn(profile, "captureTools")) {
    return null;
  }
  const tools = profile.captureTools;
  if (!tools || typeof tools !== "object" || Array.isArray(tools)) {
    return {
      ok: false,
      code: "backpack_asset_state_invalid",
      message: "捕捉工具档案异常，本次操作已取消；全部物品会原样保留，请联系GM处理。",
    };
  }
  const knownToolIds = new Set(battleCaptureToolIds().filter((toolId) => (
    toolId !== BATTLE_CAPTURE_TOOL_EMPTY_HAND && battleCaptureToolIsConsumable(toolId)
  )));
  for (const [toolId, countValue] of Object.entries(tools)) {
    const count = Number(countValue);
    if (!knownToolIds.has(toolId) || !Number.isSafeInteger(count) || count < 0) {
      return {
        ok: false,
        code: knownToolIds.has(toolId) ? "backpack_asset_state_invalid" : "backpack_item_unknown",
        message: "捕捉工具档案含当前版本无法识别的数据，本次操作已取消；全部物品会原样保留，请联系GM处理。",
      };
    }
  }
  if (!Array.isArray(canonicalSlots)) {
    let requiredSlots = 0;
    for (const toolId of knownToolIds) {
      requiredSlots += Math.ceil(Number(tools[toolId] ?? 0) / bagItemStackLimit(toolId));
    }
    if (requiredSlots > profileBackpackSlotLimit(profile)) {
      return {
        ok: false,
        code: "backpack_asset_state_invalid",
        message: "旧背包物品超过当前容量，本次操作已取消；全部物品会原样保留，请联系GM处理。",
      };
    }
  }
  return null;
}

function normalizeProfileBackpack(profile) {
  const limit = profileBackpackSlotLimit(profile);
  profile.backpackSlots = normalizeBackpackSlots(profileBackpackSlots(profile), limit);
  profile.captureTools = captureToolBagFromProfile(profile);
  return profile.backpackSlots;
}

function consumeProfileBackpackItem(profile, itemId, count = 1, options = {}) {
  const backpackConflict = rawBackpackAssetConflict(profile);
  if (backpackConflict) {
    return backpackConflict;
  }
  const slots = normalizeProfileBackpack(profile);
  const normalizedItemId = String(itemId || "").trim();
  const required = Math.max(1, Math.trunc(Number(count || 1)));
  if (backpackItemCount(slots, normalizedItemId) < required) {
    return {ok: false, code: "item_not_enough", message: `${bagItemLabel(normalizedItemId)} 不够了。`};
  }
  if (isEquipmentAssetItemId(normalizedItemId)) {
    const instanceConsume = consumeBackpackEquipmentInstances(
      profile,
      battleEquipmentCatalog,
      normalizedItemId,
      required,
      {instanceIds: options.equipmentInstanceIds},
    );
    if (!instanceConsume.ok) {
      return instanceConsume;
    }
  }
  profile.backpackSlots = consumeBackpackItem(slots, normalizedItemId, required);
  profile.captureTools = captureToolBagFromProfile(profile);
  return {ok: true};
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

function applyBankUnlockTabAction(profile, params) {
  const rawBankConflict = rawProfileBankAssetConflict(profile && profile.bank);
  if (rawBankConflict) {
    return rawBankConflict;
  }
  const bank = normalizeProfileBankData(profile && profile.bank);
  const unlockedTabs = Math.max(BANK_DEFAULT_UNLOCKED_TABS, Math.min(BANK_TAB_COUNT, Math.trunc(Number(bank.unlockedTabs || BANK_DEFAULT_UNLOCKED_TABS))));
  if (unlockedTabs >= BANK_TAB_COUNT) {
    return {ok: false, code: "bank_tabs_max", message: "银行页已全部解锁。"};
  }
  const requested = Math.trunc(Number(params.tabIndex ?? params.tab ?? -1));
  if (requested >= 0 && requested !== unlockedTabs) {
    return {ok: false, code: "bank_tab_order", message: "请先解锁前一个银行页。"};
  }
  const costIndex = Math.max(0, Math.min(BANK_UNLOCK_COSTS.length - 1, unlockedTabs - BANK_DEFAULT_UNLOCKED_TABS));
  const cost = Math.max(0, Math.trunc(Number(BANK_UNLOCK_COSTS[costIndex] || 0)));
  const diamonds = profileCurrencyAmount(profile, SHOP_CURRENCY_DIAMONDS);
  if (diamonds < cost) {
    return {ok: false, code: "not_enough_diamonds", message: `钻石不足，还需要 ${cost - diamonds} 钻石。`, cost};
  }
  bank.unlockedTabs = unlockedTabs + 1;
  profile.bank = bank;
  setProfileCurrencyAmount(profile, SHOP_CURRENCY_DIAMONDS, diamonds - cost);
  return {ok: true, message: `已消耗 ${cost} 钻石，解锁银行第 ${unlockedTabs + 1} 页。`, cost, availableSlots: bank.unlockedTabs * BANK_SLOTS_PER_TAB};
}

function applyBackpackMoveStackAction(profile, params) {
  const slotLimit = profileBackpackSlotLimit(profile);
  const sourceSlotIndex = Math.trunc(Number(params.sourceSlotIndex ?? params.sourceIndex ?? -1));
  const targetSlotIndex = Math.trunc(Number(params.targetSlotIndex ?? params.targetIndex ?? -1));
  if (sourceSlotIndex < 0 || targetSlotIndex < 0 || sourceSlotIndex >= slotLimit || targetSlotIndex >= slotLimit) {
    return {ok: false, code: "backpack_slot_locked", message: "这个背包格子还不能使用。"};
  }
  const result = moveBackpackStack(normalizeBackpackSlots(profileBackpackSlots(profile), slotLimit), sourceSlotIndex, targetSlotIndex, params.amount ?? -1);
  if (!result.ok) {
    return result;
  }
  profile.backpackSlots = result.slots;
  profile.captureTools = captureToolBagFromProfile(profile);
  return result;
}

function applyBackpackSplitStackAction(profile, params) {
  const slotLimit = profileBackpackSlotLimit(profile);
  const sourceSlotIndex = Math.trunc(Number(params.sourceSlotIndex ?? params.sourceIndex ?? -1));
  const targetSlotIndex = Math.trunc(Number(params.targetSlotIndex ?? params.targetIndex ?? -1));
  if (sourceSlotIndex < 0 || sourceSlotIndex >= slotLimit || targetSlotIndex >= slotLimit) {
    return {ok: false, code: "backpack_slot_locked", message: "这个背包格子还不能使用。"};
  }
  const result = splitBackpackStack(normalizeBackpackSlots(profileBackpackSlots(profile), slotLimit), sourceSlotIndex, params.quantity ?? params.count ?? 1, targetSlotIndex);
  if (!result.ok) {
    return result;
  }
  profile.backpackSlots = result.slots;
  profile.captureTools = captureToolBagFromProfile(profile);
  return result;
}

function applyBackpackDiscardItemAction(profile, params) {
  const slotLimit = profileBackpackSlotLimit(profile);
  const sourceSlotIndex = Math.trunc(Number(params.sourceSlotIndex ?? params.sourceIndex ?? -1));
  if (sourceSlotIndex < 0 || sourceSlotIndex >= slotLimit) {
    return {ok: false, code: "backpack_slot_locked", message: "这个背包格子还不能使用。"};
  }
  const result = discardBackpackStack(normalizeBackpackSlots(profileBackpackSlots(profile), slotLimit), sourceSlotIndex, params.quantity ?? params.count ?? -1);
  if (!result.ok) {
    return result;
  }
  if (isEquipmentAssetItemId(result.itemId)) {
    const instanceConsume = consumeBackpackEquipmentInstances(
      profile,
      battleEquipmentCatalog,
      result.itemId,
      result.count,
      {instanceIds: params.equipmentInstanceIds},
    );
    if (!instanceConsume.ok) {
      return instanceConsume;
    }
  }
  profile.backpackSlots = result.slots;
  profile.captureTools = captureToolBagFromProfile(profile);
  return result;
}

function applyBattlePetTutorialEggReclaimAction(profile) {
  const questId = currentProfileQuestId(profile);
  const state = normalizeQuestState(profileQuestStates(profile)[QUEST_SET_BATTLE_PET_ID], QUEST_SET_BATTLE_PET_ID);
  if (questId !== QUEST_SET_BATTLE_PET_ID || String(state.status || "active") !== "active") {
    return {ok: false, code: "battle_pet_tutorial_reclaim_unavailable", message: "当前不需要补领对战宠物蛋。"};
  }
  if (backpackItemCount(profileBackpackSlots(profile), "novice_battle_pet_egg") > 0) {
    return {ok: false, code: "battle_pet_tutorial_egg_owned", message: "对战宠物蛋还在随身包里。"};
  }
  if (profileBankItemCount(profile, "novice_battle_pet_egg") > 0) {
    return {ok: false, code: "battle_pet_tutorial_egg_banked", message: "对战宠物蛋还在银行里，请先取回。"};
  }
  if (profilePetInstances(profile).some((pet) => BATTLE_PET_TUTORIAL_COMPATIBLE_FORM_IDS.has(
    String(pet && (pet.formId || pet.templateId) || ""),
  ))) {
    return {ok: false, code: "battle_pet_tutorial_pet_owned", message: "教学战斗宠物已经在你的队伍或兽栏里。"};
  }
  const addResult = addSingleItemToBackpack(profileBackpackSlots(profile), "novice_battle_pet_egg", 1);
  if (addResult.addedCount < 1) {
    return {ok: false, code: "backpack_full", message: "背包已满，请先整理后再来领取。"};
  }
  profile.backpackSlots = normalizeBackpackSlots(addResult.slots);
  profile.captureTools = captureToolBagFromProfile(profile);
  return {
    ok: true,
    message: "已重新领取对战宠物蛋。",
    itemId: "novice_battle_pet_egg",
    amount: 1,
  };
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

function applyWorldItemUseAction(profile, params, options = {}) {
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
    return applyWorldPlayerExpItemAction(profile, itemId, params);
  }
  if (useType === "pet_exp") {
    return applyWorldPetExpItemAction(profile, itemId, params, options.petExpSettlement);
  }
  if (useType === "mm_stone") {
    return applyWorldMmStoneItemAction(profile, itemId, params);
  }
  if (useType === "pet_form_egg" || useType === "pet_rebirth_mm_egg") {
    return applyWorldPetEggItemAction(profile, itemId, options.newPetFactory);
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

function encounterStoneConfigForItem(itemId) {
  const normalizedItemId = String(itemId || "").trim();
  const worldUse = worldUseForItem(normalizedItemId);
  const intervalSeconds = Number(worldUse.intervalSeconds);
  const durationSeconds = Number(worldUse.durationSeconds);
  if (
    String(worldUse.type || "") !== "encounter_stone" ||
    !Number.isFinite(intervalSeconds) || intervalSeconds < 1 || intervalSeconds > 3600 ||
    !Number.isFinite(durationSeconds) || durationSeconds < intervalSeconds || durationSeconds > 24 * 60 * 60
  ) {
    return null;
  }
  return Object.freeze({
    itemId: normalizedItemId,
    intervalMs: Math.round(intervalSeconds * 1000),
    durationMs: Math.round(durationSeconds * 1000),
  });
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
  const consumeResult = consumeProfileBackpackItem(profile, itemId, 1);
  if (!consumeResult.ok) {
    return consumeResult;
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

function applyWorldPlayerExpItemAction(profile, itemId, params = {}) {
  const itemLabel = bagItemLabel(itemId);
  const consumeResult = consumeProfileBackpackItem(profile, itemId, 1, {
    equipmentInstanceIds: params.equipmentInstanceIds,
  });
  if (!consumeResult.ok) {
    return consumeResult;
  }
  const exp = expGrantForWorldItem(itemId);
  const award = applyPlayerExpToProfile(profile, exp, {
    name: String(objectOrEmpty(profile.player).name || "见习猎人"),
    statPointsPerLevel: PLAYER_STAT_POINTS_PER_LEVEL,
  });
  if (!award.ok) {
    return award;
  }
  const publicExp = award.publicExp || {};
  const chargedExp = Math.max(0, Math.trunc(Number(publicExp.chargedExp || 0)));
  const unchargedExp = Math.max(0, Math.trunc(Number(publicExp.unchargedExp || 0)));
  const expPillItemId = String(publicExp.expPillItemId || "").trim();
  const charge = objectOrEmpty(publicExp.expPillCharge);
  let message;
  if (chargedExp > 0) {
    message = `${String(profile.player.name || "见习猎人")} 使用${itemLabel}，获得${exp}经验，其中${chargedExp}经验已储入${bagItemLabel(expPillItemId)}（Lv${Math.max(1, Math.trunc(Number(charge.level || 1)))}）。`;
    if (unchargedExp > 0) {
      message += ` 另有${unchargedExp}溢出经验未能储存。`;
    }
  } else {
    message = Number(publicExp.levelsGained || 0) > 0
      ? `${String(profile.player.name || "见习猎人")} 使用${itemLabel}，获得${exp}经验，升到 Lv${Number(profile.player.level || 1)}。`
      : `${String(profile.player.name || "见习猎人")} 使用${itemLabel}，获得${exp}经验，当前 Lv${Number(profile.player.level || 1)}。`;
  }
  return {
    ok: true,
    message,
    itemId,
    exp,
    chargedExp,
    unchargedExp,
    pillLevelsGained: Math.max(0, Math.trunc(Number(publicExp.pillLevelsGained || 0))),
    expPillItemId,
    expPillInstanceId: String(publicExp.expPillInstanceId || ""),
    expPillLevel: Math.max(0, Math.trunc(Number(charge.level || 0))),
  };
}

function applyWorldPetExpItemAction(profile, itemId, params, petExpSettlement) {
  const petId = String(params.instanceId || params.petId || "").trim();
  const pet = profilePetByInstanceId(profile, petId);
  const itemLabel = bagItemLabel(itemId);
  if (!pet) {
    return {ok: false, code: "pet_missing", message: "没有找到这只宠物。"};
  }
  if (Math.trunc(Number(pet.level || 1)) >= MAX_PET_LEVEL) {
    return {ok: false, code: "pet_level_max", message: `${profilePetName(pet)} 已满级。`};
  }
  if (backpackItemCount(profileBackpackSlots(profile), itemId) <= 0) {
    return {ok: false, code: "item_not_enough", message: `${itemLabel} 不够了。`};
  }
  const exp = expGrantForWorldItem(itemId);
  let settlement;
  try {
    settlement = petExpSettlement.settle(pet, exp, MAX_PET_LEVEL, {name: profilePetName(pet)});
  } catch (error) {
    return publicPetExpSettlementFailure(error);
  }
  const consumeResult = consumeProfileBackpackItem(profile, itemId, 1);
  if (!consumeResult.ok) {
    return consumeResult;
  }
  replaceObjectContents(pet, settlement.pet);
  const publicExp = settlement.publicExp || {};
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
  const consumeResult = consumeProfileBackpackItem(profile, itemId, 1);
  if (!consumeResult.ok) {
    return consumeResult;
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

function applyWorldPetEggItemAction(profile, itemId, newPetFactory) {
  const itemLabel = bagItemLabel(itemId);
  const grant = grantPetFromWorldEgg(profile, itemId, newPetFactory);
  if (!grant.ok) {
    return grant;
  }
  const consumeResult = consumeProfileBackpackItem(profile, itemId, 1);
  if (!consumeResult.ok) {
    return consumeResult;
  }
  return {
    ok: true,
    message: `使用${itemLabel}，${grant.message}`,
    itemId,
    instanceId: grant.instanceId,
  };
}

function grantPetFromWorldEgg(profile, itemId, newPetFactory) {
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
  let pet = createDefaultServerPet(instanceId, name || "宠物", formId, state, 1);
  pet.capturedSerial = serial;
  pet.isNew = true;
  pet.binding = bagItemBinding(itemId);
  if (TAME_ELIGIBLE_EGG_ITEM_IDS.has(itemId)) {
    pet.tameEligible = true;
  }
  if (useType === "pet_rebirth_mm_egg") {
    pet.petRebirthHelper = normalizedPetRebirthHelperRecord({petRebirthHelper: {stage: Math.max(1, Math.trunc(Number(worldUse.stage || 1))) }});
  }
  try {
    pet = newPetFactory.finalizeLevelOne(pet, {purpose: "world_egg_growth"}).pet;
  } catch (_error) {
    return {ok: false, code: "pet_creation_failed", message: `${bagItemLabel(itemId)} 对应宠物创建失败。`};
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
  return petSkillSlotsForSkillIds(petActiveSkillIdsForSource(pet), pet && pet.petSkillSlots);
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
    target = canRideProfilePet(profile, pet) ? BATTLE_PET_STATE_RIDING : BATTLE_PET_STATE_BATTLE;
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
  } else if (target === BATTLE_PET_STATE_RIDING) {
    for (const other of profilePetInstances(profile)) {
      if (other && String(other.state || "") === BATTLE_PET_STATE_RIDING) {
        other.state = BATTLE_PET_STATE_STANDBY;
      }
    }
    if (String(profile.activePetInstanceId || "") === petId) {
      profile.activePetInstanceId = "";
    }
    profile.ridePetInstanceId = petId;
  } else if (String(profile.activePetInstanceId || "") === petId) {
    profile.activePetInstanceId = "";
  }
  if (target !== BATTLE_PET_STATE_RIDING && String(profile.ridePetInstanceId || "") === petId) {
    profile.ridePetInstanceId = "";
  }
  pet.state = target;
  ensureActivePetAfterInstanceRemoval(profile);
  return {
    ok: true,
    message: target === BATTLE_PET_STATE_RIDING ? `${profilePetName(pet)} 已设为骑宠。` : `${profilePetName(pet)} 已切换为${stateLabel(target)}。`,
    instanceId: petId,
    formId: profilePetFormId(pet),
    lineId: String(pet.lineId || ""),
    state: target,
  };
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
  if (profilePetIsBound(pet)) {
    return {ok: false, code: "pet_bound", message: `${profilePetName(pet)} 已绑定，不能丢到公共区域。`};
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

function applyPetCultivationAction(profile, params, now, petRebirthGrowthCycle) {
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
    return applyPetRebirthMmCultivationAction(profile, pet, params, now, petRebirthGrowthCycle);
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

function applyPetRebirthMmCultivationAction(profile, pet, params, now, petRebirthGrowthCycle) {
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
  if (!petRebirthGrowthCycle || typeof petRebirthGrowthCycle.preflight !== "function" || typeof petRebirthGrowthCycle.restart !== "function") {
    return petRebirthGrowthFailure(petId);
  }
  try {
    petRebirthGrowthCycle.preflight(pet);
  } catch (error) {
    return petRebirthGrowthFailure(petId, error);
  }
  const requestedHelperId = String(params && (params.helperInstanceId || params.helperPetId) || "").trim();
  const helperSelection = petRebirthMmHelperSelection(profile, pet, expectedStage, requestedHelperId);
  const helper = helperSelection.helper;
  if (!helper) {
    if (helperSelection.selectionRequired) {
      return {ok: false, code: "pet_rebirth_helper_selection_required", message: "有多只可用的转生MM，请重新确认本次要消耗的那一只。", instanceId: petId};
    }
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
  try {
    petRebirthGrowthCycle.preflight(helper);
  } catch (error) {
    return petRebirthGrowthFailure(petId, error);
  }
  const helperRecord = normalizedPetRebirthHelperRecord(helper, expectedStage);
  const nowSec = Math.trunc(now() / 1000);
  const rollSeed = generatePetCultivationRollSeed();
  const bonusPackage = petRebirthMmBonusPackage(pet, helper, helperRecord, expectedStage, rollSeed);
  const cumulative = petCultivationGrowthBonus(record.rebirthGrowthBonus);
  const visibleBonus = petCultivationGrowthBonus(bonusPackage.visibleGrowthBonus);
  for (const key of PET_REBIRTH_MM_STAT_KEYS) {
    cumulative[key] = quantizePetGrowth(
      snapNumber(Number(cumulative[key] || 0) + Number(visibleBonus[key] || 0), 0.001),
    );
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
  let growthCycleResult;
  try {
    growthCycleResult = petRebirthGrowthCycle.restart(pet, nextRecord);
  } catch (error) {
    return petRebirthGrowthFailure(petId, error);
  }
  const nextPet = growthCycleResult.pet;
  if (!growthCycleResult.restarted) {
    const levelOneStats = petLevelOneStats(nextPet);
    nextPet.level = 1;
    nextPet.maxHp = Math.max(1, Math.trunc(Number(levelOneStats.maxHp || nextPet.maxHp || DEFAULT_PET_BATTLE_STATS.maxHp)));
    nextPet.hp = nextPet.maxHp;
    nextPet.attack = Math.max(1, Math.trunc(Number(levelOneStats.attack || nextPet.attack || DEFAULT_PET_BATTLE_STATS.attack)));
    nextPet.defense = Math.max(1, Math.trunc(Number(levelOneStats.defense || nextPet.defense || DEFAULT_PET_BATTLE_STATS.defense)));
    nextPet.quick = Math.max(1, Math.trunc(Number(levelOneStats.quick || nextPet.quick || DEFAULT_PET_BATTLE_STATS.quick)));
  }
  nextPet.petCultivation = nextRecord;
  nextPet.lastCultivationResult = clone(event);
  nextPet.exp = 0;
  nextPet.nextExp = battleExpToNextLevel(1);
  delete nextPet.growthObservation;
  delete nextPet.growthObservationUnavailableReason;
  const instances = profilePetInstances(profile);
  const targetIndex = instances.findIndex((entry) => profilePetIdentityValues(entry).includes(petId));
  const helperIndex = instances.findIndex((entry) => profilePetIdentityValues(entry).includes(helperId));
  if (targetIndex < 0 || helperIndex < 0 || targetIndex === helperIndex) {
    return petRebirthGrowthFailure(petId);
  }
  instances[targetIndex] = nextPet;
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

function petRebirthGrowthFailure(petId, error = null) {
  const failure = publicPetRebirthGrowthCycleFailure(error);
  return {...failure, instanceId: String(petId || "")};
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
    maxHp: quantizePetGrowth(snapNumber(source.maxHp, 0.001)),
    attack: quantizePetGrowth(snapNumber(source.attack, 0.001)),
    defense: quantizePetGrowth(snapNumber(source.defense, 0.001)),
    quick: quantizePetGrowth(snapNumber(source.quick, 0.001)),
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

function petRebirthMmHelperSelection(profile, targetPet, expectedStage, requestedHelperId = "") {
  const targetId = String(targetPet && (targetPet.instanceId || targetPet.petId) || "");
  const candidates = [];
  for (const pet of profilePetInstances(profile)) {
    if (!pet || typeof pet !== "object" || Array.isArray(pet)) {
      continue;
    }
    if (!petRebirthMmIsHelperPet(pet)) {
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
    candidates.push(pet);
  }
  const normalizedRequestedHelperId = String(requestedHelperId || "").trim();
  if (normalizedRequestedHelperId) {
    return {
      helper: candidates.find((pet) => profilePetIdentityValues(pet).includes(normalizedRequestedHelperId)) || null,
      selectionRequired: false,
    };
  }
  return {
    helper: candidates.length === 1 ? candidates[0] : null,
    selectionRequired: candidates.length > 1,
  };
}

function petRebirthMmHelperStage(pet) {
  const helper = objectOrEmpty(pet && pet.petRebirthHelper);
  const stage = Math.max(0, Math.trunc(Number(helper.stage || 0)));
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

function applyPetRebirthMmStage2ClaimAction(profile, newPetFactory) {
  if (Boolean(profile[PET_REBIRTH_MM_STAGE2_CLAIMED_KEY])) {
    return {ok: false, code: "mm_stage2_claimed", message: "2转小MM任务奖励每个角色只能领取一次。"};
  }
  const grant = grantPetRebirthMm(profile, 2, newPetFactory);
  if (!grant.ok) {
    return grant;
  }
  profile[PET_REBIRTH_MM_STAGE2_CLAIMED_KEY] = true;
  return {ok: true, message: `完成2转小MM任务，${grant.message}`, instanceId: grant.instanceId};
}

function grantPetRebirthMm(profile, stage, newPetFactory) {
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
  let pet = createDefaultServerPet(instanceId, name, formId, state, 1);
  pet.petRebirthHelper = normalizedPetRebirthHelperRecord({petRebirthHelper: {stage: safeStage}});
  pet.capturedSerial = serial;
  pet.isNew = true;
  try {
    pet = newPetFactory.finalizeLevelOne(pet, {purpose: "rebirth_mm_reward_growth"}).pet;
  } catch (_error) {
    return {ok: false, code: "pet_creation_failed", message: `${name} 创建失败。`};
  }
  instances.push(pet);
  profile.nextPetInstanceSerial = serial + 1;
  recordProfilePetCodexForm(profile, formId, true);
  return {ok: true, message: `获得 Lv1 ${name}，已加入${state === BATTLE_PET_STATE_STORAGE ? "兽栏" : "队伍"}。`, instanceId};
}

function applyPetRebirthMmGuideStartAction(profile, now) {
  const guide = normalizePetRebirthMmGuide(profile[PET_REBIRTH_MM_GUIDE_KEY]);
  if (guide.status === PET_REBIRTH_MM_GUIDE_STATUS_COMPLETED || profileHasPetRebirthCountAtLeast(profile, 1)) {
    return {
      ok: false,
      code: "pet_rebirth_mm_guide_completed",
      message: "宠物转生教学已完成。人物达到 Lv80 后，可反复挑战1转MM试炼领取1转小MM。",
    };
  }
  const playerLevel = questPlayerLevel(profile);
  if (guide.status !== PET_REBIRTH_MM_GUIDE_STATUS_ACTIVE && playerLevel < PET_REBIRTH_MM_GUIDE_REQUIRED_LEVEL) {
    return {
      ok: false,
      code: "pet_rebirth_mm_guide_level_required",
      message: `需要人物达到 Lv${PET_REBIRTH_MM_GUIDE_REQUIRED_LEVEL} 才能接取宠物转生教学。`,
    };
  }
  if (guide.status !== PET_REBIRTH_MM_GUIDE_STATUS_ACTIVE) {
    guide.status = PET_REBIRTH_MM_GUIDE_STATUS_ACTIVE;
    guide.startedAtSec = guide.startedAtSec > 0 ? guide.startedAtSec : Math.max(0, Math.trunc(now() / 1000));
  }
  profile[PET_REBIRTH_MM_GUIDE_KEY] = guide;
  return {
    ok: true,
    message: `开始任务「[${PET_REBIRTH_MM_GUIDE_REQUIRED_LEVEL}] 宠物转生教学」。推荐等级：Lv${PET_REBIRTH_MM_GUIDE_RECOMMENDED_LEVEL}。`,
  };
}

function petRebirthMmTrialAccess(profile) {
  const playerLevel = questPlayerLevel(profile);
  if (playerLevel < PET_REBIRTH_MM_GUIDE_REQUIRED_LEVEL) {
    return {
      ok: false,
      code: "pet_rebirth_mm_trial_level_required",
      message: `需要人物达到 Lv${PET_REBIRTH_MM_GUIDE_REQUIRED_LEVEL} 才能挑战1转MM试炼。`,
    };
  }
  const guide = normalizePetRebirthMmGuide(profile && profile[PET_REBIRTH_MM_GUIDE_KEY]);
  if (guide.status === PET_REBIRTH_MM_GUIDE_STATUS_COMPLETED || profileHasPetRebirthCountAtLeast(profile, 1)) {
    return {ok: true};
  }
  if (guide.status === PET_REBIRTH_MM_GUIDE_STATUS_ACTIVE) {
    if (profilePetInstances(profile).some((pet) => petRebirthMmIsHelperPet(pet) && petRebirthMmHelperStage(pet) === 1)) {
      return {
        ok: false,
        code: "pet_rebirth_mm_helper_owned",
        message: "你已持有1转小MM，请继续喂石、练级并完成转生。",
      };
    }
    return {ok: true};
  }
  if (guide.status !== PET_REBIRTH_MM_GUIDE_STATUS_ACTIVE) {
    return {
      ok: false,
      code: "pet_rebirth_mm_guide_required",
      message: "请先向1转MM试炼师阿澄接取宠物转生教学。",
    };
  }
  return {ok: false, code: "pet_rebirth_mm_trial_unavailable", message: "暂时不能挑战1转MM试炼。"};
}

function profileHasPetRebirthCountAtLeast(profile, minimum) {
  const required = Math.max(1, Math.trunc(Number(minimum || 1)));
  return profilePetInstances(profile).some((pet) => {
    const record = normalizedPetCultivationRecord(pet && pet.petCultivation);
    return Math.max(0, Math.trunc(Number(record.rebirthCount || 0))) >= required;
  });
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
  const projected = publicPet(pet);
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
    captureToolId: String(pet.captureToolId || ""),
    captureStatusIds: uniqueStringArray(pet.captureStatusIds),
    growthModelVersion: String(projected.growthModelVersion || ""),
    growthSpeciesProfileId: String(projected.growthSpeciesProfileId || ""),
    growthAuthority: projected.growthAuthority && typeof projected.growthAuthority === "object"
      ? clone(projected.growthAuthority)
      : null,
    initialStats: projected.initialStats && typeof projected.initialStats === "object"
      ? clone(projected.initialStats)
      : {},
    growthSpeciesLevel1Stats: projected.growthSpeciesLevel1Stats && typeof projected.growthSpeciesLevel1Stats === "object"
      ? clone(projected.growthSpeciesLevel1Stats)
      : {},
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

function applyBattleRoomResultReturns(data, room, battle, result, now) {
  const returnAccountIds = battleReturnAccountIdsForResult(room, battle, result);
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

function restoreBattleParticipantPositions(data, room, options = {}) {
  const nowFn = typeof options.now === "function" ? options.now : () => Date.now();
  const reason = String(options.reason || room && room.closeReason || "");
  const accountIdFilter = new Set((Array.isArray(options.accountIds) ? options.accountIds : [])
    .map((accountId) => String(accountId || ""))
    .filter(Boolean));
  const skipAccountIds = new Set((Array.isArray(options.skipAccountIds) ? options.skipAccountIds : [])
    .map((accountId) => String(accountId || ""))
    .filter(Boolean));
  const participants = Array.isArray(room && room.participants) ? room.participants : [];
  const entries = [];
  for (const participant of participants) {
    const accountId = String(participant && participant.accountId || "");
    if (accountId === "" || skipAccountIds.has(accountId)) {
      continue;
    }
    if (accountIdFilter.size > 0 && !accountIdFilter.has(accountId)) {
      continue;
    }
    const snapshotPosition = participant && participant.position && typeof participant.position === "object" && !Array.isArray(participant.position)
      ? participant.position
      : null;
    if (!snapshotPosition || String(snapshotPosition.mapId || "").trim() === "") {
      continue;
    }
    if (!shouldRestoreBattleParticipantPosition(data, accountId, snapshotPosition)) {
      continue;
    }
    const account = accountById(data, accountId);
    if (!account) {
      continue;
    }
    const previousPosition = data.playerPositions[accountId] || null;
    const position = normalizePlayerPositionPayload({
      mapId: snapshotPosition.mapId,
      cellX: snapshotPosition.cellX,
      cellY: snapshotPosition.cellY,
      facing: snapshotPosition.facing || "south",
      moving: false,
    }, account, nowFn);
    position.authority = "battle_position_restore";
    position.movementSeq = Number(previousPosition && previousPosition.movementSeq || 0) + 1;
    position.returnReason = reason;
    data.playerPositions[accountId] = position;
    entries.push({
      kind: "battle_position_restore",
      accountId,
      reason,
      recordPoint: null,
      position,
      updatedAt: position.updatedAt,
      schemaVersion: 1,
    });
  }
  return entries;
}

function shouldRestoreBattleParticipantPosition(data, accountId, snapshotPosition) {
  const currentPosition = data && data.playerPositions ? data.playerPositions[String(accountId || "")] || null : null;
  if (!currentPosition) {
    return true;
  }
  const snapshotMs = Date.parse(String(snapshotPosition && snapshotPosition.updatedAt || ""));
  const currentMs = Date.parse(String(currentPosition.updatedAt || ""));
  if (
    Number.isFinite(snapshotMs) &&
    Number.isFinite(currentMs) &&
    currentMs > snapshotMs &&
    String(currentPosition.authority || "") !== "battle_position_restore"
  ) {
    return false;
  }
  return true;
}

function battleReturnAccountIdsForResult(room, battle, result) {
  const reason = String(result && result.reason || room && room.closeReason || "");
  if (reason !== "defeat") {
    return [];
  }
  const loserAccountIds = Array.isArray(result && result.loserAccountIds) ? result.loserAccountIds : [];
  const loserLookup = new Set(loserAccountIds.map((value) => String(value || "").trim()).filter(Boolean));
  const actors = Array.isArray(battle && battle.actors) ? battle.actors : [];
  return actors
    .filter((actor) => (
      actor &&
      String(actor.kind || BATTLE_ACTOR_KIND_PLAYER) === BATTLE_ACTOR_KIND_PLAYER &&
      loserLookup.has(String(actor.accountId || "").trim()) &&
      battleActorKnockedAwayForReturn(actor)
    ))
    .map((actor) => String(actor.accountId || "").trim())
    .filter((value, index, array) => value !== "" && array.indexOf(value) === index);
}

function battleActorKnockedAwayForReturn(actor) {
  return Boolean(actor && actor.launched) ||
    String(actor && actor.actionState || "") === "launched" ||
    Boolean(actor && Object.prototype.hasOwnProperty.call(actor, "revivable") && !actor.revivable);
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

function cellChebyshevDistance(ax, ay, bx, by) {
  return Math.max(Math.abs(Math.trunc(Number(ax || 0)) - Math.trunc(Number(bx || 0))), Math.abs(Math.trunc(Number(ay || 0)) - Math.trunc(Number(by || 0))));
}

function interactionPointBlocksMovement(point) {
  if (point && Object.prototype.hasOwnProperty.call(point, "blocksMovement")) {
    return Boolean(point.blocksMovement);
  }
  return String(point && point.movementCollision || "overlap").trim().toLowerCase() === "block";
}

function mapInteractionPoints(mapDoc) {
  return mapDoc && Array.isArray(mapDoc.interactionPoints) ? mapDoc.interactionPoints : [];
}

function positionCellStandable(mapDoc, cellX, cellY) {
  const grid = Array.isArray(mapDoc && mapDoc.gridSize) ? mapDoc.gridSize : [];
  const width = Math.trunc(Number(grid[0] || 0));
  const height = Math.trunc(Number(grid[1] || 0));
  if (width > 0 && height > 0 && (cellX < 0 || cellY < 0 || cellX >= width || cellY >= height)) {
    return false;
  }
  const blockedCells = Array.isArray(mapDoc && mapDoc.blockedCells) ? mapDoc.blockedCells : [];
  for (const cell of blockedCells) {
    if (Array.isArray(cell) && Math.trunc(Number(cell[0])) === cellX && Math.trunc(Number(cell[1])) === cellY) {
      return false;
    }
  }
  for (const point of mapInteractionPoints(mapDoc)) {
    if (!point || !Array.isArray(point.cell)) {
      continue;
    }
    if (Math.trunc(Number(point.cell[0])) === cellX && Math.trunc(Number(point.cell[1])) === cellY && interactionPointBlocksMovement(point)) {
      return false;
    }
  }
  return true;
}

function positionStepCanTraverse(mapDoc, step) {
  const dx = Math.trunc(Number(step && step.toCellX || 0)) - Math.trunc(Number(step && step.fromCellX || 0));
  const dy = Math.trunc(Number(step && step.toCellY || 0)) - Math.trunc(Number(step && step.fromCellY || 0));
  if (Math.abs(dx) !== 1 || Math.abs(dy) !== 1) {
    return true;
  }
  const sideAStandable = positionCellStandable(
    mapDoc,
    Math.trunc(Number(step.fromCellX || 0)) + dx,
    Math.trunc(Number(step.fromCellY || 0)),
  );
  const sideBStandable = positionCellStandable(
    mapDoc,
    Math.trunc(Number(step.fromCellX || 0)),
    Math.trunc(Number(step.fromCellY || 0)) + dy,
  );
  return sideAStandable || sideBStandable;
}

function consumeMovementStepRateCredit(states, accountId, sessionId, nowMs) {
  const key = String(accountId || "").trim();
  const sessionKey = String(sessionId || "").trim();
  const currentMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const previous = states.get(key) || null;
  let credits = MOVEMENT_STEP_RATE_BURST;
  if (previous && previous.sessionId === sessionKey) {
    const elapsedMs = Math.max(0, currentMs - Number(previous.updatedAtMs || currentMs));
    credits = Math.min(
      MOVEMENT_STEP_RATE_BURST,
      Number(previous.credits || 0) + elapsedMs / MOVEMENT_STEP_RATE_INTERVAL_MS,
    );
  }
  if (credits < 1) {
    states.set(key, {sessionId: sessionKey, credits, updatedAtMs: currentMs});
    return {
      ok: false,
      retryAfterMs: Math.max(1, Math.ceil((1 - credits) * MOVEMENT_STEP_RATE_INTERVAL_MS)),
    };
  }
  states.set(key, {sessionId: sessionKey, credits: credits - 1, updatedAtMs: currentMs});
  return {ok: true, retryAfterMs: 0};
}

function questTalkNpcLocations(targetId) {
  const normalized = String(targetId || "").trim();
  if (normalized === "") {
    return [];
  }
  if (!mapDocumentCache) {
    mapDocumentCache = loadMapDocumentCache();
  }
  const locations = [];
  for (const [mapId, mapDoc] of Object.entries(mapDocumentCache)) {
    for (const point of mapInteractionPoints(mapDoc)) {
      if (!point || String(point.id || "").trim() !== normalized) {
        continue;
      }
      const cell = Array.isArray(point.cell) ? point.cell : null;
      if (!cell || cell.length < 2) {
        continue;
      }
      locations.push({
        mapId,
        cellX: Math.trunc(Number(cell[0] || 0)),
        cellY: Math.trunc(Number(cell[1] || 0)),
      });
    }
  }
  return locations;
}

function mapSpawnCellsForDoc(mapDoc) {
  const cells = [];
  const spawnPoints = mapDoc && mapDoc.spawnPoints && typeof mapDoc.spawnPoints === "object" && !Array.isArray(mapDoc.spawnPoints)
    ? mapDoc.spawnPoints
    : {};
  for (const value of Object.values(spawnPoints)) {
    if (Array.isArray(value) && value.length >= 2) {
      cells.push([Math.trunc(Number(value[0] || 0)), Math.trunc(Number(value[1] || 0))]);
    }
  }
  if (Array.isArray(mapDoc && mapDoc.spawnCell) && mapDoc.spawnCell.length >= 2) {
    cells.push([Math.trunc(Number(mapDoc.spawnCell[0] || 0)), Math.trunc(Number(mapDoc.spawnCell[1] || 0))]);
  }
  return cells;
}

function positionNearMapSpawn(mapDoc, cellX, cellY, tolerance = POSITION_SPAWN_TOLERANCE_CELLS) {
  return mapSpawnCellsForDoc(mapDoc).some((cell) => cellChebyshevDistance(cellX, cellY, cell[0], cell[1]) <= tolerance);
}

function mapWarpToMapAllowed(previousMapDoc, previousPosition, targetMapId) {
  for (const point of mapInteractionPoints(previousMapDoc)) {
    if (!point || String(point.kind || "") !== "warp") {
      continue;
    }
    if (String(point.toMap || "").trim() !== targetMapId) {
      continue;
    }
    if (!playerPositionHasCell(previousPosition)) {
      return true;
    }
    const warpCell = Array.isArray(point.cell) ? point.cell : [0, 0];
    if (cellChebyshevDistance(previousPosition.cellX, previousPosition.cellY, warpCell[0], warpCell[1]) <= POSITION_WARP_PROXIMITY_CELLS) {
      return true;
    }
  }
  return false;
}

function validateClientPositionSnapshot(data, account, previousPosition, position, options = {}) {
  const okResult = {ok: true};
  const mapDoc = mapDocumentById(position.mapId);
  if (position.hasCell && mapDoc && !positionCellStandable(mapDoc, position.cellX, position.cellY)) {
    return {ok: false, code: "position_cell_blocked", message: "该位置无法站立，请重新同步位置。"};
  }
  if (!previousPosition || !previousPosition.mapId) {
    if (options.allowInitialPositionSeedForTests) {
      return okResult;
    }
    return validateInitialPositionAtRecordPoint(data, account, position);
  }
  const sameMap = String(previousPosition.mapId || "") === String(position.mapId || "");
  if (sameMap) {
    if (!position.hasCell) {
      return okResult;
    }
    if (!playerPositionHasCell(previousPosition)) {
      if (options.allowInitialPositionSeedForTests) {
        return okResult;
      }
      return validateInitialPositionAtRecordPoint(data, account, position);
    }
    const drift = cellChebyshevDistance(previousPosition.cellX, previousPosition.cellY, position.cellX, position.cellY);
    // 精确位置一旦由服务端建立，同图换格只能通过 /movement/step。
    // 快照仍可在原格更新朝向/移动状态，避免它成为重置 movementSeq 或跳格刷遇敌的旁路。
    if (drift === 0) {
      return okResult;
    }
    return {ok: false, code: "position_desync", message: "位置与服务器不一致，已按服务器位置纠正。"};
  }
  const previousMapDoc = mapDocumentById(previousPosition.mapId);
  const targetMapId = String(position.mapId || "").trim();
  let transitionAllowed = false;
  if (!previousMapDoc) {
    transitionAllowed = true;
  } else if (mapWarpToMapAllowed(previousMapDoc, previousPosition, targetMapId)) {
    transitionAllowed = true;
  } else {
    const recordPoint = recordPointForAccount(data, account.accountId);
    if (String(recordPoint.mapId || "") === targetMapId) {
      transitionAllowed = true;
    }
  }
  if (!transitionAllowed) {
    return {ok: false, code: "position_transition_invalid", message: "只能通过传送点或记录点前往其他地图。"};
  }
  if (position.hasCell && mapDoc && !positionNearMapSpawn(mapDoc, position.cellX, position.cellY)) {
    return {ok: false, code: "position_seed_not_spawn", message: "位置校验失败，请从地图入口重新进入。"};
  }
  return okResult;
}

function validateInitialPositionAtRecordPoint(data, account, position) {
  const recordPoint = recordPointForAccount(data, account.accountId);
  if (String(position.mapId || "") !== String(recordPoint.mapId || "")) {
    return {ok: false, code: "position_initial_not_record", message: "登录后需要先从角色记录点恢复位置。"};
  }
  if (!position.hasCell) {
    return {ok: true};
  }
  const recordCell = spawnCellForRecordPoint(recordPoint);
  if (cellChebyshevDistance(position.cellX, position.cellY, recordCell[0], recordCell[1]) > POSITION_SPAWN_TOLERANCE_CELLS) {
    return {ok: false, code: "position_initial_not_record", message: "登录后需要先从角色记录点恢复位置。"};
  }
  return {ok: true};
}

function recordPointPositionForAccount(data, account, now) {
  const recordPoint = recordPointForAccount(data, account.accountId);
  const spawnCell = spawnCellForRecordPoint(recordPoint);
  const position = normalizePlayerPositionPayload({
    mapId: recordPoint.mapId,
    cellX: spawnCell[0],
    cellY: spawnCell[1],
    facing: "south",
    moving: false,
  }, account, now);
  position.authority = "record_point_restore";
  return position;
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

function expireBattleTimeouts(data, now, options = {}) {
  const runtimeActiveSessionIds = options.runtimeActiveSessionIds || null;
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
    const battle = battleRoomBattleStateForMutation(room, now, options);
    const partyPveOfflineAccountIds = offlinePartyPveBattleParticipantAccountIds(data, room, {now, runtimeActiveSessionIds});
    if (partyPveOfflineAccountIds.length > 0) {
      const update = removeOfflinePartyPveParticipantsFromRoom(data, room, partyPveOfflineAccountIds, {
        ...options,
        now,
        runtimeActiveSessionIds,
      });
      if (update.changed) {
        for (const partyEvent of update.partyEvents) {
          events.push(partyEvent);
        }
        events.push({
          type: "battle.room_updated",
          targetAccountIds: update.targetAccountIds,
          roomId: room.roomId,
          reason: "party_member_offline",
          removedAccountIds: update.removedAccountIds,
          escapedActorIds: update.escapedActorIds,
          turn: update.turn,
          room: publicBattleRoom(room),
        });
        continue;
      }
    }
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
    closeBattleRoomWithResult(data, room, result, now, options);
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

function battleEscapeEvent(room, battle, command, actor, round, sequence) {
  actor.escaped = true;
  actor.guarding = false;
  return {
    eventId: `${room.roomId}:r${round}:e${sequence}`,
    eventType: "escape",
    round,
    sequence,
    actorAccountId: actor.accountId,
    actorUsername: actor.username,
    actorId: actor.actorId,
    actorKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
    actionId: BATTLE_ACTION_RUN,
    skillId: String(command.skillId || ""),
    targetActorId: actor.actorId,
    targetAccountId: actor.accountId,
    targetUsername: actor.username,
    damage: 0,
    animation: {
      actor: "escape",
      targetReaction: "none",
      observer: "watch_actor",
    },
    message: `${actor.displayName || actor.username} 成功逃跑。`,
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

function battleActorActiveStatusIds(actor) {
  const statuses = battleActorStatuses(actor);
  return Object.keys(statuses).filter((statusId) => battleActorHasStatus(actor, statusId)).sort();
}

function battleActorIsWuli(actor) {
  const lineId = String(actor && actor.lineId || "").trim();
  if (lineId === "wuli") {
    return true;
  }
  return String(actor && (actor.formId || actor.templateId || actor.speciesId) || "").trim().startsWith("wuli_");
}

function battlePoisonWuliCaptureConditionMet(target) {
  return battleActorIsWuli(target) && battleActorHasStatus(target, BATTLE_STATUS_POISON);
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

function battleApplyStatus(actor, statusId, turns, potency, sourceActor) {
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
    sourceId: String(sourceActor && sourceActor.actorId || ""),
    sourceCredit: freezeStatusSourceCredit(sourceActor),
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

function battleWakeFromDirectDamage(actor, damage, dodged = false) {
  if (!actor || Boolean(dodged) || Number(damage || 0) <= 0 || !battleActorHasStatus(actor, BATTLE_STATUS_SLEEP)) {
    return [];
  }
  const statusBefore = publicBattleStatus(BATTLE_STATUS_SLEEP, battleActorStatuses(actor)[BATTLE_STATUS_SLEEP]);
  battleRemoveStatuses(actor, [BATTLE_STATUS_SLEEP]);
  return [{
    actorId: String(actor.actorId || ""),
    statusId: BATTLE_STATUS_SLEEP,
    change: "remove_on_damage",
    statusBefore,
    statusAfter: null,
    fromTurns: Math.max(0, Math.trunc(Number(statusBefore && statusBefore.turns || 0))),
    toTurns: 0,
    schemaVersion: 1,
  }];
}

function battleDecrementActorStatus(actor, statusId) {
  const normalizedStatusId = String(statusId || "").trim();
  if (!battleActorHasStatus(actor, normalizedStatusId)) {
    return {fromTurns: 0, toTurns: 0, statusBefore: null, statusAfter: null};
  }
  const statuses = battleActorStatuses(actor);
  const status = statuses[normalizedStatusId];
  const statusBefore = publicBattleStatus(normalizedStatusId, status);
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
  return {
    fromTurns,
    toTurns,
    statusBefore,
    statusAfter: toTurns > 0 ? publicBattleStatus(normalizedStatusId, statuses[normalizedStatusId]) : null,
  };
}

function battleConfusionAttackResolution(
  room,
  battle,
  actor,
  declaredTarget,
  round,
  sequence,
  actionId,
  options = {},
  originalDeclaredTargetActorId = "",
) {
  const declaredTargetActorId = String(originalDeclaredTargetActorId || declaredTarget && declaredTarget.actorId || "");
  const resolution = resolveConfusionTarget({
    randomAuthority: options.battleRandomAuthority,
    roomId: String(room && room.roomId || ""),
    turnSeq: Math.trunc(Number(battle && battle.turnSeq || 0)),
    round,
    sequence,
    actionId,
    actor,
    declaredTargetActorId,
    actors: Array.isArray(battle && battle.actors) ? battle.actors : [],
  });
  if (!resolution.triggered) {
    return {
      triggered: false,
      declaredTargetActorId,
      target: declaredTarget,
      statusChanges: [],
    };
  }
  const target = battleActorByActorId(battle, resolution.targetActorId);
  if (!target || Number(target.hp || 0) <= 0) {
    return {
      triggered: false,
      declaredTargetActorId,
      target: declaredTarget,
      statusChanges: [],
    };
  }
  const turns = battleDecrementActorStatus(actor, BATTLE_STATUS_CONFUSION);
  return {
    triggered: true,
    declaredTargetActorId,
    target,
    statusChanges: [{
      actorId: String(actor && actor.actorId || ""),
      statusId: BATTLE_STATUS_CONFUSION,
      change: "decrement",
      statusBefore: turns.statusBefore,
      statusAfter: turns.statusAfter,
      fromTurns: turns.fromTurns,
      toTurns: turns.toTurns,
      schemaVersion: 1,
    }],
  };
}

function battleConfusionEventFields(resolution) {
  const value = resolution && typeof resolution === "object" && !Array.isArray(resolution) ? resolution : {};
  if (!value.triggered) {
    return {};
  }
  return {
    declaredTargetActorId: String(value.declaredTargetActorId || ""),
    confusionRetargeted: true,
    targetRule: BATTLE_TARGET_RULE_CONFUSION_SAME_SIDE,
    statusId: BATTLE_STATUS_CONFUSION,
    statusResult: "confused_retarget",
  };
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

function battleStatusHitCheck(room, battle, actor, target, actionId, statusId, round, sequence, baseRate = 1, options = {}) {
  const normalizedStatusId = String(statusId || "").trim();
  const resistance = battleStatusResistance(target, normalizedStatusId);
  return resolveStatusHit({
    randomAuthority: options.battleRandomAuthority,
    roomId: String(room && room.roomId || ""),
    turnSeq: Math.trunc(Number(battle && battle.turnSeq || 0)),
    round,
    sequence,
    actorId: String(actor && actor.actorId || ""),
    targetId: String(target && target.actorId || ""),
    actionId,
    statusId: normalizedStatusId,
    baseRate,
    resistance,
    immune: battleStatusImmune(target, normalizedStatusId),
  });
}

function battleStatusSkipEvent(room, battle, command, actor, round, sequence) {
  const statusId = battleBlockingStatusId(actor);
  if (statusId === "") {
    return null;
  }
  const turns = battleDecrementActorStatus(actor, statusId);
  const hp = Math.max(0, Math.trunc(Number(actor.hp || 0)));
  return {
    eventId: `${room.roomId}:r${round}:e${sequence}`,
    eventType: "status_skip",
    round,
    sequence,
    actorAccountId: actor.accountId,
    actorUsername: actor.username,
    actorId: actor.actorId,
    actorKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
    sourceActorId: String(turns.statusBefore && turns.statusBefore.sourceId || ""),
    targetAccountId: actor.accountId,
    targetUsername: actor.username,
    targetActorId: actor.actorId,
    targetKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
    actionId: String(command.actionId || ""),
    skillId: String(command.skillId || ""),
    statusId,
    statusResult: "skip",
    statusBefore: turns.statusBefore,
    statusAfter: turns.statusAfter,
    fromTurns: turns.fromTurns,
    toTurns: turns.toTurns,
    statusChanges: [{
      actorId: String(actor.actorId || ""),
      statusId,
      change: "decrement",
      fromTurns: turns.fromTurns,
      toTurns: turns.toTurns,
      schemaVersion: 1,
    }],
    damage: 0,
    hpBefore: hp,
    hpAfter: hp,
    defeated: hp <= 0,
    launched: false,
    dodged: false,
    critical: false,
    counterTriggered: false,
    animation: {
      actor: "status",
      targetReaction: "none",
      observer: "watch_target",
    },
    message: `${actor.displayName || actor.username} 处于${battleStatusLabel(statusId)}状态，无法行动。`,
    schemaVersion: BATTLE_EVENT_CONTRACT_VERSION,
  };
}

function battleItemEvent(room, battle, command, actor, round, sequence, options = {}) {
  const itemId = normalizeBattleItemId(command.itemId || command.actionId);
  const effectType = battleActionEffectType(itemId);
  if (effectType === "heal") {
    return battleItemHealEvent(room, battle, command, actor, round, sequence);
  }
  if (effectType === "poison") {
    return battleItemPoisonEvent(room, battle, command, actor, round, sequence, options);
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

function battleItemPoisonEvent(room, battle, command, actor, round, sequence, options = {}) {
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
    const damageResult = applyBattleActorResolvedDamage(room, target, hpBefore, damage, {
      shareWithRide: false,
      canLaunch: false,
    });
    const hpAfter = damageResult.hpAfter;
    let statusCheck = {hit: false, result: "target_down", chance: -1, roll: -1, resistance: battleStatusResistance(target, statusId), immune: false};
    let removedStatusIds = [];
    if (hpAfter > 0) {
      statusCheck = battleStatusHitCheck(room, battle, actor, target, itemId, statusId, round, sequence, statusHitRate, options);
      if (String(statusCheck.result || "") === "applied") {
        removedStatusIds = battleApplyStatus(target, statusId, statusTurns, statusPotency, actor);
      }
    }
    syncParticipantBattleActorSnapshot(room, target);
    const targetExpCredits = battleExpCreditsForDefeat(room, battle, actor, target, hpBefore, hpAfter);
    expCredits.push(...targetExpCredits);
    const targetActorId = String(target.actorId || "");
    effectPerTarget[targetActorId] = damage;
    statusResultPerTarget[targetActorId] = String(statusCheck.result || "resisted");
    statusRollPerTarget[targetActorId] = Number.isFinite(statusCheck.roll) ? Number(statusCheck.roll) : -1;
    statusChancePerTarget[targetActorId] = Number.isFinite(statusCheck.chance) ? Number(statusCheck.chance) : -1;
    statusResistancePerTarget[targetActorId] = Number(statusCheck.resistance || 0);
    for (const removedStatusId of removedStatusIds) {
      statusChanges.push({actorId: targetActorId, statusId: removedStatusId, change: "remove_overwritten", schemaVersion: 1});
    }
    statusChanges.push({
      actorId: targetActorId,
      statusId,
      change: String(statusCheck.result || "resisted") === "applied" ? "apply" : String(statusCheck.result || "resisted"),
      sourceId: String(statusCheck.result || "") === "applied" ? String(actor.actorId || "") : "",
      turns: String(statusCheck.result || "") === "applied" ? statusTurns : 0,
      potency: String(statusCheck.result || "") === "applied" ? statusPotency : 0,
      chance: Number.isFinite(statusCheck.chance) ? Number(statusCheck.chance) : -1,
      roll: Number.isFinite(statusCheck.roll) ? Number(statusCheck.roll) : -1,
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
      ...battleDamageEventFields(damageResult),
      defeated: hpAfter <= 0,
      statusResult: String(statusCheck.result || "resisted"),
      schemaVersion: 2,
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
    sourceActorId: String(actor.actorId || ""),
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
    ...battleDamageEventFields(targetSummaries[0]),
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
    schemaVersion: BATTLE_EVENT_CONTRACT_VERSION,
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

function battlePetStatusSkillEvent(room, battle, command, actor, round, sequence, options = {}) {
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
  const statusCheck = battleStatusHitCheck(room, battle, actor, target, skillId, statusId, round, sequence, statusHitRate, options);
  const statusResult = String(statusCheck.result || "resisted");
  const removedStatusIds = statusResult === "applied"
    ? battleApplyStatus(target, statusId, statusTurns, statusPotency, actor)
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
    sourceId: statusResult === "applied" ? String(actor.actorId || "") : "",
    turns: statusResult === "applied" ? statusTurns : 0,
    potency: statusResult === "applied" ? statusPotency : 0,
    chance: Number.isFinite(statusCheck.chance) ? Number(statusCheck.chance) : -1,
    roll: Number.isFinite(statusCheck.roll) ? Number(statusCheck.roll) : -1,
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
    sourceActorId: String(actor.actorId || ""),
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
    statusRoll: Number.isFinite(statusCheck.roll) ? Number(statusCheck.roll) : -1,
    statusChance: Number.isFinite(statusCheck.chance) ? Number(statusCheck.chance) : -1,
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

function battleSpiritEvent(room, battle, command, actor, round, sequence, options = {}) {
  const spiritId = String(command.spiritId || command.skillId || command.actionId || "").trim();
  const effectType = battleSpiritEffectType(spiritId);
  if (!stringArray(actor.spiritIds).includes(spiritId) || (effectType !== "heal" && effectType !== "poison")) {
    return battleTargetMissingEvent(room, battle, command, actor, round, sequence);
  }
  if (effectType === "heal") {
    return battleSpiritHealEvent(room, battle, command, actor, spiritId, round, sequence);
  }
  return battleSpiritPoisonEvent(room, battle, command, actor, spiritId, round, sequence, options);
}

function battleTrainingPartnerHealEvent(room, battle, command, actor, round, sequence) {
  const target = battleActorByActorId(battle, command.targetActorId);
  if (
    !battleActorIsTrainingPartnerHealer(actor) ||
    !trainingPartnerHealCandidate(
      target,
      actor,
      String(actor.ownerAccountId || "").trim(),
      String(actor.partnerId || "").trim()
    )
  ) {
    return battleTargetMissingEvent(room, battle, command, actor, round, sequence);
  }
  const spiritId = TRAINING_PARTNER_HEAL_SPIRIT_ID;
  const spiritName = battleSpiritLabel(spiritId);
  const hpBefore = Math.max(0, Math.trunc(Number(target.hp || 0)));
  const maxHp = battleActorWritebackMaxHp(target);
  const heal = Math.max(1, Math.ceil(maxHp * TRAINING_PARTNER_HEAL_AMOUNT_RATIO));
  const hpAfter = Math.min(maxHp, hpBefore + heal);
  const healed = Math.max(0, hpAfter - hpBefore);
  target.hp = hpAfter;
  target.defeated = hpAfter <= 0;
  syncParticipantPetSnapshotHp(room, target);
  return {
    eventId: `${room.roomId}:r${round}:e${sequence}`,
    eventType: "spirit_heal",
    round,
    sequence,
    actorAccountId: actor.accountId,
    actorUsername: actor.username,
    actorId: actor.actorId,
    actorKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
    actorOwnerAccountId: String(actor.ownerAccountId || ""),
    partnerId: String(actor.partnerId || ""),
    targetAccountId: String(target.accountId || ""),
    targetUsername: String(target.username || ""),
    targetActorId: String(target.actorId || ""),
    targetKind: String(target.kind || BATTLE_ACTOR_KIND_PLAYER),
    targetActorIds: [String(target.actorId || "")],
    targets: [{
      targetActorId: String(target.actorId || ""),
      targetAccountId: String(target.accountId || ""),
      targetUsername: String(target.username || ""),
      targetKind: String(target.kind || BATTLE_ACTOR_KIND_PLAYER),
      hpBefore,
      hpAfter,
      healed,
      schemaVersion: 1,
    }],
    actionId: spiritId,
    actionKind: BATTLE_ACTION_TRAINING_PARTNER_HEAL,
    skillId: spiritId,
    spiritId,
    skillName: spiritName,
    heal,
    healRatio: TRAINING_PARTNER_HEAL_AMOUNT_RATIO,
    lowHpRatio: TRAINING_PARTNER_HEAL_LOW_HP_RATIO,
    healed,
    hpBefore,
    hpAfter,
    effectPerTarget: {[String(target.actorId || "")]: healed},
    damage: 0,
    animation: {
      actor: "spirit",
      targetReaction: "heal",
      observer: "watch_target",
    },
    message: `${actor.displayName || "陪练伙伴"} 使用${spiritName}，${target.displayName || "伙伴"} 回复 ${healed} 点生命。`,
    schemaVersion: 1,
  };
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

function battleSpiritPoisonEvent(room, battle, command, actor, spiritId, round, sequence, options = {}) {
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
    const damageResult = applyBattleActorResolvedDamage(room, target, hpBefore, damage, {
      shareWithRide: false,
      canLaunch: false,
    });
    const hpAfter = damageResult.hpAfter;
    let statusCheck = {hit: false, result: "target_down", chance: -1, roll: -1, resistance: battleStatusResistance(target, statusId), immune: false};
    let removedStatusIds = [];
    if (hpAfter > 0) {
      statusCheck = battleStatusHitCheck(room, battle, actor, target, spiritId, statusId, round, sequence, statusHitRate, options);
      if (String(statusCheck.result || "") === "applied") {
        removedStatusIds = battleApplyStatus(target, statusId, statusTurns, statusPotency, actor);
      }
    }
    syncParticipantBattleActorSnapshot(room, target);
    const targetExpCredits = battleExpCreditsForDefeat(room, battle, actor, target, hpBefore, hpAfter);
    expCredits.push(...targetExpCredits);
    const targetActorId = String(target.actorId || "");
    effectPerTarget[targetActorId] = damage;
    statusResultPerTarget[targetActorId] = String(statusCheck.result || "resisted");
    statusRollPerTarget[targetActorId] = Number.isFinite(statusCheck.roll) ? Number(statusCheck.roll) : -1;
    statusChancePerTarget[targetActorId] = Number.isFinite(statusCheck.chance) ? Number(statusCheck.chance) : -1;
    statusResistancePerTarget[targetActorId] = Number(statusCheck.resistance || 0);
    for (const removedStatusId of removedStatusIds) {
      statusChanges.push({actorId: targetActorId, statusId: removedStatusId, change: "remove_overwritten", schemaVersion: 1});
    }
    statusChanges.push({
      actorId: targetActorId,
      statusId,
      change: String(statusCheck.result || "resisted") === "applied" ? "apply" : String(statusCheck.result || "resisted"),
      sourceId: String(statusCheck.result || "") === "applied" ? String(actor.actorId || "") : "",
      turns: String(statusCheck.result || "") === "applied" ? statusTurns : 0,
      potency: String(statusCheck.result || "") === "applied" ? statusPotency : 0,
      chance: Number.isFinite(statusCheck.chance) ? Number(statusCheck.chance) : -1,
      roll: Number.isFinite(statusCheck.roll) ? Number(statusCheck.roll) : -1,
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
      ...battleDamageEventFields(damageResult),
      defeated: hpAfter <= 0,
      statusResult: String(statusCheck.result || "resisted"),
      schemaVersion: 2,
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
    sourceActorId: String(actor.actorId || ""),
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
    ...battleDamageEventFields(targetSummaries[0]),
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
    schemaVersion: BATTLE_EVENT_CONTRACT_VERSION,
  };
  if (expCredits.length > 0) {
    event.expCredits = clone(expCredits);
  }
  return event;
}

function battleCaptureEvent(data, room, battle, command, actor, round, sequence, options = {}) {
  const toolId = normalizeBattleCaptureToolId(command.captureToolId || command.itemId || command.actionId);
  const participant = battleParticipantByAccountId(room, actor.accountId);
  const target = battleActorByActorId(battle, command.targetActorId) || battlePlayerActorByAccountId(battle, command.targetAccountId);
  if (
    !participant ||
    !target ||
    validateBattleCaptureTarget(actor, target, toolId).ok !== true ||
    participantCaptureToolCount(participant, toolId) <= 0
  ) {
    return battleTargetMissingEvent(room, battle, command, actor, round, sequence);
  }
  const candidateResult = validateBattleCaptureCandidateAttempt(
    options.petCaptureCandidateAuthority,
    room,
    target,
    actor.accountId,
    toolId,
  );
  if (!candidateResult.ok) {
    return battleCaptureUnavailableEvent(room, command, actor, target, round, sequence, candidateResult.message);
  }
  const capacityResult = battleCaptureCapacityCheck(data, room, battle, actor.accountId);
  if (!capacityResult.ok) {
    return battleCaptureUnavailableEvent(room, command, actor, target, round, sequence, capacityResult.message);
  }
  const hpBefore = Number(target.hp || 0);
  const targetStatusIds = battleActorActiveStatusIds(target);
  const chance = battleCaptureChance(room, battle, actor, target, toolId);
  const rollResult = options.petCaptureCandidateAuthority.captureRoll(room, {
    actorId: String(target.actorId || ""),
    accountId: String(actor.accountId || ""),
    captureToolId: toolId,
  });
  if (!rollResult || rollResult.ok !== true || !Number.isFinite(Number(rollResult.roll))) {
    return battleCaptureUnavailableEvent(room, command, actor, target, round, sequence, "捕捉机会暂时失效，请重新遇敌。");
  }
  applyBattleCaptureCandidateRoomState(room, battle, rollResult.room);
  const roll = Number(rollResult.roll);
  const success = chance > 0 && roll < chance;
  if (success) {
    const claimResult = options.petCaptureCandidateAuthority.claim(room, {
      actorId: String(target.actorId || ""),
      accountId: String(actor.accountId || ""),
    });
    if (!claimResult || claimResult.ok !== true) {
      return battleCaptureUnavailableEvent(room, command, actor, target, round, sequence, "这只野生宠物已经被其他队员捕获。");
    }
    applyBattleCaptureCandidateRoomState(room, battle, claimResult.room);
  }
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
    target.captureStatusIds = targetStatusIds;
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
    targetFormId: String(target.formId || target.speciesId || ""),
    targetLineId: String(target.lineId || ""),
    targetStatusIds,
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

function applyBattleCaptureCandidateRoomState(room, battle, authorityRoom) {
  const authorityBattle = authorityRoom && authorityRoom.battle && typeof authorityRoom.battle === "object"
    ? authorityRoom.battle
    : null;
  if (!authorityBattle || !authorityBattle.captureCandidatesByActorId || typeof authorityBattle.captureCandidatesByActorId !== "object") {
    return;
  }
  battle.captureCandidatesByActorId = clone(authorityBattle.captureCandidatesByActorId);
  room.battle = battle;
}

function battleCaptureUnavailableEvent(room, command, actor, target, round, sequence, message) {
  return {
    eventId: `${room.roomId}:r${round}:e${sequence}`,
    eventType: "capture_unavailable",
    round,
    sequence,
    actorAccountId: String(actor && actor.accountId || ""),
    actorUsername: String(actor && actor.username || ""),
    actorId: String(actor && actor.actorId || ""),
    actorKind: String(actor && actor.kind || BATTLE_ACTOR_KIND_PLAYER),
    targetActorId: String(target && target.actorId || command && command.targetActorId || ""),
    targetAccountId: String(target && target.accountId || ""),
    targetUsername: String(target && target.username || ""),
    targetKind: String(target && target.kind || BATTLE_ACTOR_KIND_WILD_PET),
    actionId: BATTLE_ACTION_CAPTURE,
    captureToolId: normalizeBattleCaptureToolId(command && (command.captureToolId || command.itemId || command.actionId)),
    success: false,
    captured: false,
    damage: 0,
    animation: {
      actor: "watch_target",
      targetReaction: "none",
      observer: "idle",
    },
    message: String(message || "当前不能捕捉这只野生宠物。"),
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
  const normalizedToolId = normalizeBattleCaptureToolId(toolId);
  if (normalizedToolId === BATTLE_CAPTURE_TOOL_POISON_WULI_NET) {
    return battlePoisonWuliCaptureConditionMet(target) ? 1 : 0;
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
  chance += battleCaptureToolChanceBonus(normalizedToolId);
  chance += battleCaptureStatusBonusForActor(target);
  const minChance = Number(formula.minChance || 0.05);
  const maxChance = Number(formula.maxChance || 0.95);
  return Math.max(minChance, Math.min(maxChance, chance));
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

function battleSwitchPetEvent(room, battle, command, actor, round, sequence, options = {}) {
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
  const rawNextPetActor = battlePetActorFromParticipant(participant, String(actor.side || ""), nextPet, 0);
  const nextPetActor = options.battleActorRules && typeof options.battleActorRules.materializeActor === "function"
    ? options.battleActorRules.materializeActor(rawNextPetActor).actor
    : rawNextPetActor;
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

function syncParticipantBattleActorSnapshot(room, actor) {
  if (!actor) {
    return;
  }
  const participant = battleParticipantByAccountId(room, actor.accountId);
  if (!participant || !participant.teamSnapshot || typeof participant.teamSnapshot !== "object" || Array.isArray(participant.teamSnapshot)) {
    return;
  }
  if (String(actor.kind || BATTLE_ACTOR_KIND_PLAYER) === BATTLE_ACTOR_KIND_PLAYER) {
    const player = participant.teamSnapshot.player && typeof participant.teamSnapshot.player === "object" && !Array.isArray(participant.teamSnapshot.player)
      ? participant.teamSnapshot.player
      : {};
    player.hp = battleActorWritebackHp(actor);
    player.maxHp = battleActorWritebackMaxHp(actor);
    player.attack = positiveNumber(actor.attack, player.attack);
    player.defense = positiveNumber(actor.defense, player.defense);
    player.quick = positiveNumber(actor.speed, player.quick);
    for (const key of [
      "ridePetInstanceId",
      "ridePetName",
      "ridePetFormId",
      "ridePetLevel",
      "ridePetHp",
      "ridePetMaxHp",
      "ridePetBattleState",
      "ridePetKnocked",
      "ridePetAttack",
      "ridePetDefense",
      "ridePetQuick",
      "rideBaseStats",
      "rideAttackStyle",
      "battleActionIds",
      "attackActionId",
      "equipmentStatBonus",
      "equipmentStatSummary",
      "equipmentWearUsage",
    ]) {
      if (Object.prototype.hasOwnProperty.call(actor, key)) {
        player[key] = clone(actor[key]);
      }
    }
    participant.teamSnapshot.player = player;
    return;
  }
  if (String(actor.kind || "") !== BATTLE_ACTOR_KIND_PET) {
    return;
  }
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

function syncParticipantPetSnapshotHp(room, actor) {
  syncParticipantBattleActorSnapshot(room, actor);
}

function addBattleEquipmentWearUsage(room, actor, key, amount = 1) {
  if (
    !actor
    || String(actor.kind || BATTLE_ACTOR_KIND_PLAYER) !== BATTLE_ACTOR_KIND_PLAYER
    || String(actor.accountId || "") === ""
    || String(actor.partnerId || "") !== ""
  ) {
    return;
  }
  const usage = actor.equipmentWearUsage && typeof actor.equipmentWearUsage === "object" && !Array.isArray(actor.equipmentWearUsage)
    ? actor.equipmentWearUsage
    : {weaponAttacks: 0, armorHits: 0};
  if (key !== "weaponAttacks" && key !== "armorHits") {
    return;
  }
  usage[key] = Math.max(0, Math.trunc(Number(usage[key] || 0))) + Math.max(0, Math.trunc(Number(amount || 0)));
  actor.equipmentWearUsage = usage;
  syncParticipantBattleActorSnapshot(room, actor);
}

function battleActorOnlyDamageFacts(target, damageValue) {
  const damage = Math.max(0, Math.trunc(Number(damageValue || 0)));
  const ride = activeRideFacts(target);
  const ridePetInstanceId = String(target && target.ridePetInstanceId || "").trim();
  const ridePetMaxHp = Math.max(0, Math.trunc(Number(target && target.ridePetMaxHp || 0)));
  const rideHpBefore = clampNumber(target && target.ridePetHp, 0, ridePetMaxHp, ridePetMaxHp);
  return {
    damage,
    actorDamage: damage,
    rideDamage: 0,
    ridePetInstanceId,
    rideHpBefore,
    rideHpAfter: rideHpBefore,
    ridePetKnocked: Boolean(target && target.ridePetKnocked) || Boolean(ridePetInstanceId && ridePetMaxHp > 0 && rideHpBefore <= 0),
    ridePetBattleStateAfter: String(target && target.ridePetBattleState || ""),
    rideActiveBefore: ride.active,
    rideActiveAfter: ride.active,
  };
}

function applyBattleActorResolvedDamage(room, target, hpBeforeValue, damageValue, options = {}) {
  const hpBefore = Math.max(0, Math.trunc(Number(hpBeforeValue || 0)));
  const dodged = Boolean(options.dodged);
  const totalDamage = dodged ? 0 : Math.max(0, Math.trunc(Number(damageValue || 0)));
  const damageFacts = options.shareWithRide === false
    ? battleActorOnlyDamageFacts(target, totalDamage)
    : resolveRideDamageShare(target, totalDamage);
  if (String(damageFacts.ridePetInstanceId || "") !== "") {
    target.ridePetHp = Math.max(0, Math.trunc(Number(damageFacts.rideHpAfter || 0)));
    target.ridePetBattleState = String(damageFacts.ridePetBattleStateAfter || target.ridePetBattleState || BATTLE_PET_STATE_RIDING);
    target.ridePetKnocked = Boolean(damageFacts.ridePetKnocked);
  }
  if (Boolean(damageFacts.ridePetKnocked)) {
    const baseStats = target.rideBaseStats && typeof target.rideBaseStats === "object" && !Array.isArray(target.rideBaseStats)
      ? target.rideBaseStats
      : {};
    target.attack = positiveNumber(baseStats.attack, target.attack);
    target.defense = positiveNumber(baseStats.defense, target.defense);
    target.speed = positiveNumber(baseStats.quick ?? baseStats.speed, target.speed);
  }
  const actorDamage = Math.max(0, Math.trunc(Number(damageFacts.actorDamage || 0)));
  const hpAfter = Math.max(0, hpBefore - actorDamage);
  const launched = dodged
    ? applyBattleActorDodgeResult(room, target)
    : applyBattleActorDamageResult(room, target, hpBefore, hpAfter, actorDamage, {
      canLaunch: Boolean(options.canLaunch),
    });
  syncParticipantBattleActorSnapshot(room, target);
  return {
    ...damageFacts,
    ridePetName: String(target && target.ridePetName || ""),
    ridePetFormId: String(target && target.ridePetFormId || ""),
    ridePetLevel: Math.max(0, Math.trunc(Number(target && target.ridePetLevel || 0))),
    ridePetMaxHp: Math.max(0, Math.trunc(Number(target && target.ridePetMaxHp || 0))),
    hpBefore,
    hpAfter,
    launched,
    attackAfter: Math.max(0, Math.trunc(Number(target.attack || 0))),
    defenseAfter: Math.max(0, Math.trunc(Number(target.defense || 0))),
    speedAfter: Math.max(0, Math.trunc(Number(target.speed || 0))),
  };
}

function battleDamageEventFields(damageResult) {
  const result = damageResult && typeof damageResult === "object" && !Array.isArray(damageResult) ? damageResult : {};
  return {
    actorDamage: Math.max(0, Math.trunc(Number(result.actorDamage || 0))),
    rideDamage: Math.max(0, Math.trunc(Number(result.rideDamage || 0))),
    ridePetInstanceId: String(result.ridePetInstanceId || ""),
    ridePetName: String(result.ridePetName || ""),
    ridePetFormId: String(result.ridePetFormId || ""),
    ridePetLevel: Math.max(0, Math.trunc(Number(result.ridePetLevel || 0))),
    ridePetMaxHp: Math.max(0, Math.trunc(Number(result.ridePetMaxHp || 0))),
    rideHpBefore: Math.max(0, Math.trunc(Number(result.rideHpBefore || 0))),
    rideHpAfter: Math.max(0, Math.trunc(Number(result.rideHpAfter || 0))),
    ridePetKnocked: Boolean(result.ridePetKnocked),
    ridePetBattleStateAfter: String(result.ridePetBattleStateAfter || ""),
    rideActiveBefore: Boolean(result.rideActiveBefore),
    rideActiveAfter: Boolean(result.rideActiveAfter),
    attackAfter: Math.max(0, Math.trunc(Number(result.attackAfter || 0))),
    defenseAfter: Math.max(0, Math.trunc(Number(result.defenseAfter || 0))),
    speedAfter: Math.max(0, Math.trunc(Number(result.speedAfter || 0))),
  };
}

function applyBattleActorDamageResult(room, target, hpBefore, hpAfter, damage, options = {}) {
  const canLaunch = Boolean(options.canLaunch);
  const maxHp = Math.max(1, Math.trunc(Number(target && target.maxHp || hpBefore || 1)));
  const overkill = Math.max(0, Math.trunc(Number(damage || 0)) - Math.max(0, Math.trunc(Number(hpBefore || 0))));
  const launchThreshold = Math.max(12, Math.round(maxHp * 0.18));
  const launched = Boolean(target) && canLaunch && Number(hpBefore || 0) > 0 && Number(hpAfter || 0) <= 0 && overkill >= launchThreshold;
  target.hp = Math.max(0, Math.trunc(Number(hpAfter || 0)));
  target.defeated = target.hp <= 0;
  target.actionState = launched ? "launched" : (target.hp <= 0 ? "down" : "hit");
  target.launched = launched;
  target.revivable = !launched;
  if (launched) {
    target.launchHpBefore = Math.max(0, Math.trunc(Number(hpBefore || 0)));
    if (String(target.kind || "") === BATTLE_ACTOR_KIND_PET || String(target.kind || "") === BATTLE_ACTOR_KIND_WILD_PET) {
      target.petState = "rest";
    }
  } else {
    delete target.launchHpBefore;
  }
  syncParticipantBattleActorSnapshot(room, target);
  return launched;
}

function battleDamageMessage(baseMessage, target, hpAfter, launched) {
  const targetName = String(target && (target.displayName || target.username) || "目标");
  if (launched) {
    if (String(target && target.kind || "") === BATTLE_ACTOR_KIND_PET || String(target && target.kind || "") === BATTLE_ACTOR_KIND_WILD_PET) {
      return `${baseMessage} ${targetName} 被击飞，进入休息状态。`;
    }
    return `${baseMessage} ${targetName} 被击飞。`;
  }
  if (Number(hpAfter || 0) <= 0) {
    return `${baseMessage} ${targetName} 倒下了。`;
  }
  return baseMessage;
}

function battleRideDamageMessageSuffix(damageResult) {
  const result = damageResult && typeof damageResult === "object" && !Array.isArray(damageResult) ? damageResult : {};
  const rideDamage = Math.max(0, Math.trunc(Number(result.rideDamage || 0)));
  if (rideDamage <= 0) {
    return "";
  }
  const actorDamage = Math.max(0, Math.trunc(Number(result.actorDamage || 0)));
  const ridePetName = String(result.ridePetName || "骑宠").trim() || "骑宠";
  const knockedNow = Boolean(result.rideActiveBefore) && Boolean(result.ridePetKnocked);
  return `，其中${ridePetName}承受${rideDamage}，人物承受${actorDamage}${knockedNow ? `，${ridePetName}倒下并解除骑乘` : ""}`;
}

function battleStoneDefenseEventFields(damageResult) {
  const result = damageResult && typeof damageResult === "object" && !Array.isArray(damageResult) ? damageResult : {};
  return {
    stoneDefenseApplied: Boolean(result.stoneDefenseApplied),
    stoneDefenseMultiplier: Boolean(result.stoneDefenseApplied) ? 2 : 1,
    stoneDefenseExtraReduction: Math.max(0, Math.trunc(Number(result.stoneDefenseExtraReduction || 0))),
  };
}

function battleCombatFormulaEventFields(damageResult) {
  const result = damageResult && typeof damageResult === "object" && !Array.isArray(damageResult) ? damageResult : {};
  const configuredGuardMultiplier = Number(result.guardMultiplier);
  return {
    combatFormulaId: String(result.formulaId || authoritativeBattleCombatFormula.id || ""),
    attackStat: Math.max(0, Math.trunc(Number(result.actorAttack || 0))),
    defenseStat: Math.max(0, Math.trunc(Number(result.targetDefense || 0))),
    effectiveDefenseStat: Math.max(0, Math.trunc(Number(result.effectiveDefense || result.targetDefense || 0))),
    defenseFactor: Math.max(0, Number(result.defenseFactor || 0)),
    defenseReduction: Math.max(0, Math.trunc(Number(result.defenseReduction || 0))),
    guardMultiplier: Number.isFinite(configuredGuardMultiplier) ? Math.max(0, configuredGuardMultiplier) : 1,
    minimumDamage: Math.max(1, Math.trunc(Number(result.minimumDamage || 1))),
  };
}

function battleAttackEvent(room, battle, command, actor, target, round, sequence, hpBefore, hpAfter, damage, expCredits = [], launched = false, reaction = {}) {
  const actionKind = String(command.actionKind || "attack");
  const actionId = String(command.actionId || BATTLE_ACTION_ATTACK);
  const skillId = String(command.skillId || "");
  const eventType = String(reaction.eventType || battleAttackEventTypeForCommand(command));
  const dodged = Boolean(reaction.dodged);
  const critical = Boolean(reaction.critical);
  const confusion = reaction.confusion && typeof reaction.confusion === "object" && !Array.isArray(reaction.confusion)
    ? reaction.confusion
    : {};
  const confusionFields = battleConfusionEventFields(confusion);
  const actorName = String(actor.displayName || actor.username || "参战者");
  const targetName = String(target.displayName || target.username || "目标");
  let message;
  if (dodged) {
    if (eventType === "counter_attack") {
      message = `${actorName} 发起反击，${targetName} 闪避了。`;
    } else if (actionKind === "pet_skill") {
      message = `${actorName} 对 ${targetName} 使用技能，但被闪避了。`;
    } else {
      message = `${actorName} 攻击 ${targetName}，但被闪避了。`;
    }
  } else {
    const actionLabel = eventType === "counter_attack" ? "反击了" : (actionKind === "pet_skill" ? "使用技能攻击了" : "攻击了");
    const criticalMessage = critical ? " 触发幸运一击。" : "";
    message = battleDamageMessage(`${actorName} ${actionLabel} ${targetName}，造成 ${damage} 点伤害${battleRideDamageMessageSuffix(reaction.damageResult)}。${criticalMessage}`, target, hpAfter, launched);
  }
  if (confusion.triggered) {
    message = `${actorName} 因混乱改变了目标。${message}`;
  }
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
    targetRule: confusion.triggered ? BATTLE_TARGET_RULE_CONFUSION_SAME_SIDE : String(command.targetRule || ""),
    ...(confusion.triggered ? {declaredTargetRule: String(command.targetRule || "")} : {}),
    ...confusionFields,
    targetRollIndex: Math.trunc(Number(command.targetRollIndex || 0)),
    targetCandidateCount: Math.trunc(Number(command.targetCandidateCount || 0)),
    damage,
    blocked: Boolean(target.guarding),
    dodged,
    critical,
    counterTriggered: false,
    hpBefore,
    hpAfter,
    defeated: hpAfter <= 0,
    launched,
    ...battleDamageEventFields(reaction.damageResult),
    ...battleStoneDefenseEventFields(reaction.attackDamageResult),
    ...battleCombatFormulaEventFields(reaction.attackDamageResult),
    statusChanges: Array.isArray(reaction.statusChanges) ? clone(reaction.statusChanges) : [],
    animation: {
      actor: eventType === "counter_attack" ? "counter_attack" : "attack",
      targetReaction: dodged ? "dodge" : (launched ? "launched" : (hpAfter <= 0 ? "knockdown" : "hurt")),
      observer: "watch_target",
    },
    message,
    schemaVersion: BATTLE_EVENT_CONTRACT_VERSION,
  };
  if (eventType === "counter_attack") {
    event.counterSourceEventId = String(reaction.counterSourceEventId || "");
  }
  if (Array.isArray(expCredits) && expCredits.length > 0) {
    event.expCredits = clone(expCredits);
  }
  return event;
}

function battleAttackDamageResult(room, battle, command, actor, target) {
  const effect = battleActionEffect(command.actionId);
  const action = battleActionById(command.actionId);
  const eventType = String(command.actionKind || "") === "pet_skill"
    ? "pet_skill"
    : (action && String(action.owner || "") === "equipment_action" ? "multi_attack" : "attack");
  const configuredAmountBonus = Number(effect.amountBonus);
  const amountBonus = Object.prototype.hasOwnProperty.call(effect, "amountBonus") && Number.isFinite(configuredAmountBonus)
    ? Math.max(0, Math.trunc(configuredAmountBonus))
    : 12;
  const configuredPowerMultiplier = Number(effect.powerMultiplier);
  const powerMultiplier = Number.isFinite(configuredPowerMultiplier)
    ? Math.max(0, configuredPowerMultiplier)
    : 1;
  return resolvePhysicalDamage({
    formula: authoritativeBattleCombatFormula,
    actor,
    target,
    eventType,
    amountBonus: eventType === "pet_skill" ? amountBonus : 0,
    actionPowerMultiplier: eventType === "multi_attack" ? powerMultiplier : 1,
  });
}

function battleAttackDamage(room, battle, command, actor, target) {
  return battleAttackDamageResult(room, battle, command, actor, target).damage;
}

function accountById(data, accountId) {
  return Object.values(data.accounts).find((account) => account && account.accountId === accountId) || null;
}

function accountRuntimeActivity(data, accountId, now, runtimeActiveSessionIds = null) {
  const nowMs = now();
  let online = false;
  let lastSeenMs = NaN;
  for (const session of Object.values(data.sessions)) {
    if (!session || session.accountId !== accountId || session.revokedAt || Date.parse(session.expiresAt) <= nowMs) {
      continue;
    }
    if (!runtimeActiveSessionIds) {
      online = true;
      continue;
    }
    if (!runtimeActiveSessionIds.has(session.sessionId)) {
      continue;
    }
    const seenMs = typeof runtimeActiveSessionIds.get === "function"
      ? Number(runtimeActiveSessionIds.get(session.sessionId))
      : nowMs;
    if (Number.isFinite(seenMs)) {
      lastSeenMs = Math.max(Number.isFinite(lastSeenMs) ? lastSeenMs : 0, seenMs);
    }
    if (runtimeSessionIsActive(runtimeActiveSessionIds, session.sessionId, nowMs)) {
      online = true;
    }
  }
  return {
    online,
    lastSeenMs: Number.isFinite(lastSeenMs) ? lastSeenMs : null,
  };
}

function accountHasActiveRuntimeSession(data, accountId, now, runtimeActiveSessionIds = null) {
  return accountRuntimeActivity(data, accountId, now, runtimeActiveSessionIds).online;
}

function activeOnlinePlayers(data, now, runtimeActiveSessionIds = null) {
  const nowMs = now();
  const activeSessions = Object.values(data.sessions)
    .filter((session) => (
      session &&
      !session.revokedAt &&
      Date.parse(session.expiresAt) > nowMs &&
      runtimeSessionIsActive(runtimeActiveSessionIds, session.sessionId, nowMs)
    ))
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

function onlinePlayersForViewer(data, viewerAccount, aoi, now, runtimeActiveSessionIds = null) {
  return activeOnlinePlayers(data, now, runtimeActiveSessionIds).filter((account) => (
    onlineAccountVisibleToViewer(data, viewerAccount, account, aoi)
  ));
}

function publicOnlinePlayersForViewer(data, viewerAccount, aoi, now, runtimeActiveSessionIds = null) {
  const viewerPosition = viewerAccount ? data.playerPositions[viewerAccount.accountId] || null : null;
  const players = onlinePlayersForViewer(data, viewerAccount, aoi, now, runtimeActiveSessionIds).map((account) => publicOnlinePlayer(account, data));
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
  if (playerPositionPublicPrecision(position) !== "cell" || playerPositionPublicPrecision(viewerPosition) !== "cell") {
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
  const sameMapScope = scope === ONLINE_MAP_SCOPE || scope === "same_map" || scope === "same-map";
  const hasExplicitPosition = (
    String(payload.mapId || payload.map || "").trim() !== "" ||
    payload.cellX !== undefined ||
    payload.cellY !== undefined ||
    payload.x !== undefined ||
    payload.y !== undefined
  );
  if (!sameMapScope && scope !== ONLINE_AOI_SCOPE && scope !== "nearby" && !hasExplicitPosition) {
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
  const sourceHasCell = playerPositionPublicPrecision(source) === "cell";
  if (!sameMapScope && !sourceHasCell) {
    return {
      enabled: true,
      scope: ONLINE_MAP_SCOPE,
      mapId,
      cellX: 0,
      cellY: 0,
      radius: 0,
      sameMapOnly: true,
    };
  }
  return {
    enabled: true,
    scope: sameMapScope ? ONLINE_MAP_SCOPE : ONLINE_AOI_SCOPE,
    mapId,
    cellX: clampInt(source.cellX ?? source.x, -9999, 9999, 0),
    cellY: clampInt(source.cellY ?? source.y, -9999, 9999, 0),
    radius: sameMapScope ? 0 : clampInt(payload.aoiRadius ?? payload.viewRadius ?? payload.radius, 1, ONLINE_AOI_MAX_RADIUS, ONLINE_AOI_DEFAULT_RADIUS),
    sameMapOnly: sameMapScope,
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
  if (aoi.scope === ONLINE_MAP_SCOPE || aoi.sameMapOnly) {
    return true;
  }
  if (playerPositionPublicPrecision(position) !== "cell") {
    return false;
  }
  const dx = Math.abs(Number(position.cellX || 0) - aoi.cellX);
  const dy = Math.abs(Number(position.cellY || 0) - aoi.cellY);
  return dx <= aoi.radius && dy <= aoi.radius;
}

function publicOnlineAoi(aoi) {
  return {
    scope: aoi && aoi.enabled ? String(aoi.scope || ONLINE_AOI_SCOPE) : "all",
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
  const startingEquipmentSlots = {};
  const profile = {
    schemaVersion: CURRENT_PROFILE_SCHEMA_VERSION,
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
    activePetInstanceId: "",
    nextPetInstanceSerial: 1,
    nextPetDropSerial: 1,
    stoneCoins: DEFAULT_STONE_COINS,
    bank: {
      stoneCoins: 0,
      items: [],
      slots: emptyItemSlots(BANK_SLOT_LIMIT),
      unlockedTabs: BANK_DEFAULT_UNLOCKED_TABS,
      schemaVersion: BANK_PROFILE_SCHEMA_VERSION,
    },
    diamonds: DEFAULT_DIAMONDS,
    devDiamondsGrantVersion: DEV_DIAMONDS_GRANT_VERSION,
    petInstances: [],
    groundPetDrops: [],
    ridePetInstanceId: "",
    backpackSlots: defaultStartingBackpackSlots(),
    backpackExtraSlots: 0,
    quickSlots: ["", "", ""],
    equipmentSlots: startingEquipmentSlots,
    equipmentInstances: {},
    equipmentSlotInstanceIds: {},
    nextEquipmentInstanceSerial: 1,
    equipmentDurability: {},
    equipmentEnhancement: {},
    equipmentWearCounters: {},
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
    offlineHang: {session: {status: "idle", schemaVersion: 1}, ledger: [], schemaVersion: 1},
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
    qualificationBattleClaims: {},
  };
  if (profile.petInstances.length <= 0) {
    profile.activePetInstanceId = "";
  }
  const startingEquipmentCounts = new Map();
  for (const slot of profile.backpackSlots) {
    const itemId = String(slot && slot.itemId || "").trim();
    const count = Math.max(0, Math.trunc(Number(slot && slot.count || 0)));
    if (count > 0 && catalogHasEquipmentItemId(battleEquipmentCatalog, itemId)) {
      startingEquipmentCounts.set(itemId, Math.max(0, Number(startingEquipmentCounts.get(itemId) || 0)) + count);
    }
  }
  const startingEquipmentGrant = grantFreshBackpackEquipmentInstances(
    profile,
    battleEquipmentCatalog,
    Array.from(startingEquipmentCounts, ([itemId, count]) => ({itemId, count})),
    "server_starter",
    {expToNextLevel: battleExpToNextLevel},
  );
  if (!startingEquipmentGrant.ok) {
    throw new Error(`default equipment instance initialization failed: ${startingEquipmentGrant.code}`);
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
    autoDiscardLowPower: false,
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
  return type === "chat.message" || type === "session.replaced" || type.startsWith("party.") || type.startsWith("battle.");
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

function normalizePlayerPositionPayload(payload, account, now, previousPosition = null) {
  const mapId = String(payload.mapId || payload.map || "").trim().slice(0, POSITION_MAP_ID_MAX_LENGTH);
  const hasPayloadCellX = payload.cellX !== undefined || payload.x !== undefined;
  const hasPayloadCellY = payload.cellY !== undefined || payload.y !== undefined;
  const hasPayloadCell = hasPayloadCellX && hasPayloadCellY;
  const canReusePreviousCell = (
    !hasPayloadCell &&
    previousPosition &&
    playerPositionHasCell(previousPosition) &&
    String(previousPosition.mapId || "") === mapId
  );
  const canReusePreviousMovementSeq = Boolean(
    previousPosition &&
    playerPositionHasCell(previousPosition) &&
    String(previousPosition.mapId || "") === mapId
  );
  let facing = String(payload.facing || "south").trim().toLowerCase();
  if (!hasPayloadCell && canReusePreviousCell) {
    facing = String(previousPosition.facing || facing).trim().toLowerCase();
  }
  if (!POSITION_FACING_VALUES.has(facing)) {
    facing = "south";
  }
  return {
    accountId: account.accountId,
    username: account.username,
    displayName: account.displayName,
    mapId,
    cellX: hasPayloadCell
      ? clampInt(payload.cellX ?? payload.x, -9999, 9999, 0)
      : (canReusePreviousCell ? clampInt(previousPosition.cellX, -9999, 9999, 0) : 0),
    cellY: hasPayloadCell
      ? clampInt(payload.cellY ?? payload.y, -9999, 9999, 0)
      : (canReusePreviousCell ? clampInt(previousPosition.cellY, -9999, 9999, 0) : 0),
    facing,
    moving: hasPayloadCell ? Boolean(payload.moving) : false,
    movementSeq: canReusePreviousMovementSeq ? Math.max(0, Math.trunc(Number(previousPosition.movementSeq || 0))) : 0,
    hasCell: hasPayloadCell || canReusePreviousCell,
    publicPrecision: hasPayloadCell ? "cell" : "map",
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

function checkAuthAttemptGate(state, action, username, payload, now) {
  const nowMs = now();
  const key = authAttemptKey(action, username, payload);
  const entry = normalizeAuthAttemptEntry(state.get(key), nowMs);
  if (entry.backoffUntil > nowMs) {
    state.set(key, entry);
    const retryAfterMs = Math.max(1, entry.backoffUntil - nowMs);
    return fail(
      "auth_backoff",
      "认证失败次数过多，请稍后再试。",
      {"retryAfterMs": retryAfterMs}
    );
  }
  if (entry.attempts.length >= AUTH_RATE_MAX_ATTEMPTS) {
    state.set(key, entry);
    const oldest = Math.min(...entry.attempts);
    const retryAfterMs = Math.max(1, AUTH_RATE_WINDOW_MS - (nowMs - oldest));
    return fail(
      "auth_rate_limited",
      "请求太频繁，请稍后再试。",
      {"retryAfterMs": retryAfterMs}
    );
  }
  entry.attempts.push(nowMs);
  state.set(key, entry);
  return ok({"authAttemptKey": key});
}

function recordAuthAttemptResult(state, key, success, now) {
  if (!key) {
    return;
  }
  const nowMs = now();
  const entry = normalizeAuthAttemptEntry(state.get(key), nowMs);
  if (success) {
    entry.failures = [];
    entry.backoffUntil = 0;
    state.set(key, entry);
    return;
  }
  entry.failures.push(nowMs);
  if (entry.failures.length >= AUTH_FAILURE_BACKOFF_START) {
    const exponent = Math.max(0, entry.failures.length - AUTH_FAILURE_BACKOFF_START);
    const backoffMs = Math.min(AUTH_FAILURE_BACKOFF_MAX_MS, AUTH_FAILURE_BACKOFF_BASE_MS * (2 ** exponent));
    entry.backoffUntil = nowMs + backoffMs;
  }
  state.set(key, entry);
}

function normalizeAuthAttemptEntry(value, nowMs) {
  const entry = value && typeof value === "object" ? value : {};
  return {
    attempts: authAttemptTimes(entry.attempts, nowMs, AUTH_RATE_WINDOW_MS),
    failures: authAttemptTimes(entry.failures, nowMs, AUTH_FAILURE_WINDOW_MS),
    backoffUntil: Math.max(0, Number(entry.backoffUntil || 0)),
  };
}

function authAttemptTimes(values, nowMs, windowMs) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0 && nowMs - value < windowMs);
}

function authAttemptKey(action, username, payload) {
  const ip = normalizeAuthClientIp(payload && typeof payload === "object" ? payload.clientIp || payload.ipAddress || payload.ip || "" : "");
  const account = normalizeUsername(username || (payload && typeof payload === "object" ? payload.username : ""));
  return `${String(action || "auth")}:${ip}:${account || "_"}`;
}

function normalizeAuthClientIp(value) {
  let ip = String(value || "").trim();
  if (ip.startsWith("::ffff:")) {
    ip = ip.slice("::ffff:".length);
  }
  return ip || "local";
}

function passwordUpgradePolicyForAccount(account) {
  const policyVersion = Math.max(0, Math.trunc(Number(account && account.passwordPolicyVersion || 0)));
  if (policyVersion >= PASSWORD_POLICY_VERSION) {
    return {"required": false, "message": ""};
  }
  return {
    "required": true,
    "message": "当前密码策略已升级，请在账号设置中改为至少8位密码。",
  };
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

function equipmentEnvelopeRegistryMutationFailure(conflict = null) {
  void conflict;
  return fail(
    "equipment_transfer_envelope_duplicate",
    "装备托管档案存在重复归属，相关资产操作已暂停，请联系GM处理。",
  );
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
  createAsyncWriteAuthStore,
  normalizeUsername,
  isValidUsername,
};
