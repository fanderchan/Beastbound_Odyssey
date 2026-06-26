extends RefCounted

const BattleActionCatalog := preload("res://scripts/battle/battle_action_catalog.gd")
const BattlePassiveCatalog := preload("res://scripts/battle/battle_passive_catalog.gd")
const BattleStatusModel := preload("res://scripts/battle/battle_status_model.gd")
const AutoBattleSettingsModel := preload("res://scripts/progression/auto_battle_settings_model.gd")
const AutoCaptureSettingsModel := preload("res://scripts/progression/auto_capture_settings_model.gd")
const BackpackModel := preload("res://scripts/progression/backpack_model.gd")
const BattleRewardCatalog := preload("res://scripts/progression/battle_reward_catalog.gd")
const CaptureToolCatalog := preload("res://scripts/battle/capture_tool_catalog.gd")
const EquipmentModel := preload("res://scripts/progression/equipment_model.gd")
const EquipmentSynthesisModel := preload("res://scripts/progression/equipment_synthesis_model.gd")
const HangSettingsModel := preload("res://scripts/progression/hang_settings_model.gd")
const PetCultivationModel := preload("res://scripts/progression/pet_cultivation_model.gd")
const PetIndividualGrowthModel := preload("res://scripts/progression/pet_individual_growth_model.gd")
const PetPowerModel := preload("res://scripts/progression/pet_power_model.gd")
const PetSkillTrainingModel := preload("res://scripts/progression/pet_skill_training_model.gd")
const PetTemplateCatalog := preload("res://scripts/battle/pet_template_catalog.gd")
const QuestModel := preload("res://scripts/progression/quest_model.gd")
const RebirthModel := preload("res://scripts/progression/rebirth_model.gd")
const RebirthTrialModel := preload("res://scripts/progression/rebirth_trial_model.gd")
const ShopCatalogModel := preload("res://scripts/progression/shop_catalog_model.gd")
const TrainingPartnerModel := preload("res://scripts/progression/training_partner_model.gd")

const SAVE_PATH := "user://player_profile.json"
const PROFILE_SCHEMA_VERSION := 1
const PET_STATE_BATTLE := "battle"
const PET_STATE_STANDBY := "standby"
const PET_STATE_REST := "rest"
const PET_STATE_STORAGE := "storage"
const BATTLE_PLAYER_ACTOR_ID := "ally_player"
const BATTLE_PET_ACTOR_ID := "ally_pet"
const PET_BASE_SKILL_IDS: Array[String] = ["pet_attack", "pet_defend"]
const PET_INDIVIDUAL_FIELD_KEYS: Array[String] = [
	"growthTierId",
	"growthTierLabel",
	"individualSeed",
	"individualVariance",
	"individualQualityScore",
	"individualQualityLabel",
	"initialStats",
	"growthRecord",
	"combatPower",
	"combatPowerBreakdown",
]
const PET_CULTIVATION_FIELD_KEYS: Array[String] = [
	"petCultivation",
	"lastCultivationResult",
]
const PARTY_LIMIT := 5
const STORAGE_LIMIT := 20
const PET_NAME_MAX_LENGTH := 8
const MAX_PLAYER_LEVEL := 140
const MAX_PET_LEVEL := 140
const ITEM_PLAYER_EXP_PILL_LV131 := "item_player_exp_pill_lv131"
const ITEM_PET_EXP_PILL_LV131 := "item_pet_exp_pill_lv131"
const PET_REST_RECOVERY_RATIO := 0.05
const PET_DROP_TTL_SECONDS := 600
const PET_PICKUP_LEVEL_MARGIN := 5
const PET_DROP_PICKUP_PUBLIC := "public"
const PET_GROWTH_PROFILES := {
	"balanced": {"maxHp": 8.0, "attack": 1.6, "defense": 1.3, "quick": 1.4},
	"attack_high": {"maxHp": 8.0, "attack": 2.2, "defense": 1.1, "quick": 1.2},
	"agility_high": {"maxHp": 7.5, "attack": 1.45, "defense": 1.0, "quick": 2.2},
	"defense_high": {"maxHp": 10.0, "attack": 1.25, "defense": 2.0, "quick": 0.9},
	"hp_high": {"maxHp": 12.0, "attack": 1.35, "defense": 1.45, "quick": 1.0},
}
const LOCAL_PLAYER_ID := "local_player"
const DEFAULT_STONE_COINS := 120
const DEFAULT_DIAMONDS := 10000
const VILLAGE_HEAL_HP_PER_COIN := 20
const PLAYER_STAT_KEYS: Array[String] = ["maxHp", "attack", "defense", "quick"]
const DEFAULT_PLAYER_BATTLE_STATS := {
	"maxHp": 120,
	"attack": 18,
	"defense": 6,
	"quick": 70,
}
const PLAYER_STAT_POINTS_PER_LEVEL := 3
const PLAYER_STAT_POINT_GAINS := {
	"maxHp": 4,
	"attack": 1,
	"defense": 1,
	"quick": 1,
}
const STONE_COINS_KEY := "stoneCoins"
const DIAMONDS_KEY := "diamonds"
const BACKPACK_SLOTS_KEY := "backpackSlots"
const BACKPACK_EXTRA_SLOTS_KEY := "backpackExtraSlots"
const QUICK_SLOTS_KEY := "quickSlots"
const QUICK_SLOT_COUNT := 3
const EQUIPMENT_SLOTS_KEY := "equipmentSlots"
const EQUIPMENT_SLOTS_VERSION_KEY := "equipmentSlotsVersion"
const EQUIPMENT_SLOTS_VERSION := 4
const EQUIPMENT_STARTER_SET_VERSION_KEY := "equipmentStarterSetVersion"
const EQUIPMENT_STARTER_SET_VERSION := 1
const EQUIPMENT_DURABILITY_KEY := "equipmentDurability"
const EQUIPMENT_ENHANCEMENT_KEY := "equipmentEnhancement"
const EQUIPMENT_WEAR_COUNTERS_KEY := "equipmentWearCounters"
const EQUIPMENT_EXP_PILL_CHARGE_KEY := "equipmentExpPillCharge"
const EQUIPMENT_REPAIR_DURABILITY_PER_COIN := 5
const EQUIPMENT_WEAPON_ATTACKS_PER_DURABILITY := 100
const EQUIPMENT_ARMOR_HITS_PER_DURABILITY := 10
const EXP_PILL_STARTER_VERSION_KEY := "expPillStarterVersion"
const EXP_PILL_STARTER_VERSION := 1
const MAILBOX_MESSAGES_KEY := "mailboxMessages"
const MAILBOX_EXPIRY_SECONDS := 30 * 24 * 60 * 60
const MAIL_EXP_PILL_STARTER_ID := "system_exp_pill_starter_v1"
const MAIL_REWARD_FALLBACK_PREFIX := "system_reward_fallback"
const CAPTURE_TOOLS_KEY := "captureTools"
const ACTIVE_QUEST_ID_KEY := "activeQuestId"
const QUEST_STATES_KEY := "questStates"
const PET_CODEX_SEEN_FORM_IDS_KEY := "petCodexSeenFormIds"
const PET_CODEX_CAPTURED_FORM_IDS_KEY := "petCodexCapturedFormIds"
const AUTO_BATTLE_SETTINGS_KEY := AutoBattleSettingsModel.SETTINGS_KEY
const AUTO_CAPTURE_SETTINGS_KEY := AutoCaptureSettingsModel.SETTINGS_KEY
const HANG_SETTINGS_KEY := HangSettingsModel.SETTINGS_KEY
const TRAINING_PARTNERS_KEY := TrainingPartnerModel.PROFILE_KEY
const RECORD_POINT_KEY := "recordPoint"
const UNLOCKED_ABILITIES_KEY := "unlockedAbilities"
const ABILITY_REMOTE_STABLE := "remoteStable"
const REBIRTH_COUNT_KEY := RebirthModel.REBIRTH_COUNT_KEY
const REBIRTH_HISTORY_KEY := RebirthModel.REBIRTH_HISTORY_KEY
const REBIRTH_QUEST_COMPLETIONS_KEY := RebirthModel.REBIRTH_QUEST_COMPLETIONS_KEY
const REBIRTH_TRIAL_PROOFS_KEY := "rebirthTrialProofs"
const REBIRTH_FINAL_BOSS_PROOF_ID := "shadow_oath_rebirth_guardian"
const REBIRTH_REWARD_ITEMS_BY_TARGET := {
	1: "armor_grace_cloth_3",
	2: "accessory_moist_charm_3",
	3: "weapon_flame_trial_spear",
	4: "boots_gale_trial",
	5: "accessory_four_spirit_charm",
	6: "weapon_shadow_group_bow",
}
const REBIRTH_STARTER_PET_BY_TARGET := {
	1: {"formId": "rebirth_starter_earth_cub", "name": "地纹幼兽"},
	2: {"formId": "rebirth_starter_water_cub", "name": "潮纹幼兽"},
	3: {"formId": "rebirth_starter_fire_cub", "name": "焰纹幼兽"},
	4: {"formId": "rebirth_starter_wind_cub", "name": "岚纹幼兽"},
	5: {"formId": "rebirth_starter_four_spirit_cub", "name": "四灵幼兽"},
	6: {"formId": "rebirth_starter_shadow_cub", "name": "玄影幼兽"},
}
const DEFAULT_RECORD_POINT_MAP_ID := "firebud_village_gate"
const DEFAULT_RECORD_POINT_SPAWN_NAME := "default"
const DEFAULT_RECORD_POINT_LABEL := "火芽村出生点"


static func default_profile() -> Dictionary:
	return {
		"schemaVersion": PROFILE_SCHEMA_VERSION,
		"player": {
			"name": "见习猎人",
			"level": 1,
			"exp": 0,
			"nextExp": exp_to_next_level(1),
			"baseStats": DEFAULT_PLAYER_BATTLE_STATS.duplicate(true),
			"statPoints": 0,
			"hp": DEFAULT_PLAYER_BATTLE_STATS.get("maxHp", 120),
			"maxHp": DEFAULT_PLAYER_BATTLE_STATS.get("maxHp", 120),
		},
		"activePetInstanceId": "pet_bui_main",
		"nextPetInstanceSerial": 5,
		"nextPetDropSerial": 1,
		"stoneCoins": DEFAULT_STONE_COINS,
		"diamonds": DEFAULT_DIAMONDS,
		"petInstances": [
			_pet_instance_from_form("pet_bui_main", "我的布伊", "bui_normal_red_fire10", PET_STATE_BATTLE, 1),
			_pet_instance_from_form("pet_bui_speed", "黄色普通布伊", "bui_normal_yellow_wind10", PET_STATE_STANDBY, 1),
			_pet_instance_from_form("pet_bui_tough", "厚皮布伊", "bui_normal_thick_earth10", PET_STATE_STANDBY, 1),
			_pet_instance_from_form("pet_bui_rest", "休息布伊", "bui_normal_red_fire10", PET_STATE_REST, 1),
		],
		"groundPetDrops": [],
		"backpackSlots": BackpackModel.starting_slots(),
		"backpackExtraSlots": 0,
		"quickSlots": ["", "", ""],
		"equipmentSlots": starter_equipment_slots(),
		"equipmentDurability": _full_equipment_durability_for_slots(starter_equipment_slots()),
		"equipmentEnhancement": _fresh_equipment_enhancement_for_slots(starter_equipment_slots()),
		"equipmentWearCounters": _fresh_equipment_wear_counters_for_slots(starter_equipment_slots()),
		"equipmentExpPillCharge": {},
		"equipmentSlotsVersion": EQUIPMENT_SLOTS_VERSION,
		"equipmentStarterSetVersion": EQUIPMENT_STARTER_SET_VERSION,
		"expPillStarterVersion": EXP_PILL_STARTER_VERSION,
		"mailboxMessages": [],
		"captureTools": CaptureToolCatalog.starting_inventory(),
		"activeQuestId": QuestModel.first_quest_id(),
		"questStates": {},
		"petCodexSeenFormIds": [],
		"petCodexCapturedFormIds": [],
		"autoBattleSettings": AutoBattleSettingsModel.default_settings(),
		"autoCaptureSettings": AutoCaptureSettingsModel.default_settings(),
		"hangSettings": HangSettingsModel.default_settings(),
		"trainingPartners": [],
		"recordPoint": default_record_point(),
			"unlockedAbilities": [],
			"rebirthCount": 0,
			"rebirthHistory": [],
			"rebirthQuestCompletions": [],
			"rebirthTrialProofs": {},
		}


static func load_profile() -> Dictionary:
	if not FileAccess.file_exists(SAVE_PATH):
		return default_profile()
	var text := FileAccess.get_file_as_string(SAVE_PATH)
	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return default_profile()
	return normalize_profile(parsed as Dictionary)


static func save_profile(profile: Dictionary) -> bool:
	var normalized := normalize_profile(profile)
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(normalized, "\t"))
	file.close()
	return true


static func default_record_point() -> Dictionary:
	return {
		"mapId": DEFAULT_RECORD_POINT_MAP_ID,
		"spawnName": DEFAULT_RECORD_POINT_SPAWN_NAME,
		"label": DEFAULT_RECORD_POINT_LABEL,
	}


static func record_point(profile: Dictionary) -> Dictionary:
	return _normalize_record_point(normalize_profile(profile).get(RECORD_POINT_KEY, {}))


static func with_record_point(profile: Dictionary, map_id: String, spawn_name: String, label: String = "") -> Dictionary:
	var normalized := normalize_profile(profile)
	normalized[RECORD_POINT_KEY] = _normalize_record_point({
		"mapId": map_id,
		"spawnName": spawn_name,
		"label": label,
	})
	return normalize_profile(normalized)


static func unlocked_abilities(profile: Dictionary) -> Array[String]:
	return _valid_unique_ability_ids(normalize_profile(profile).get(UNLOCKED_ABILITIES_KEY, []))


static func has_unlocked_ability(profile: Dictionary, ability_id: String) -> bool:
	var normalized_id := str(ability_id).strip_edges()
	return normalized_id != "" and unlocked_abilities(profile).has(normalized_id)


static func has_remote_stable(profile: Dictionary) -> bool:
	return has_unlocked_ability(profile, ABILITY_REMOTE_STABLE)


static func with_unlocked_ability(profile: Dictionary, ability_id: String) -> Dictionary:
	var normalized_id := str(ability_id).strip_edges()
	var normalized := normalize_profile(profile)
	if normalized_id == "":
		return normalized
	var abilities := _valid_unique_ability_ids(normalized.get(UNLOCKED_ABILITIES_KEY, []))
	if not abilities.has(normalized_id):
		abilities.append(normalized_id)
	normalized[UNLOCKED_ABILITIES_KEY] = abilities
	return normalize_profile(normalized)


static func rebirth_count(profile: Dictionary) -> int:
	return RebirthModel.rebirth_count(normalize_profile(profile))


static func rebirth_requirement_state(profile: Dictionary) -> Dictionary:
	return _rebirth_requirement_state_with_trials(normalize_profile(profile))


static func rebirth_preview(profile: Dictionary) -> Dictionary:
	return _rebirth_preview_with_trials(normalize_profile(profile))


static func rebirth_preview_lines(profile: Dictionary) -> Array[String]:
	return _rebirth_preview_lines_with_trials(normalize_profile(profile))


static func with_rebirth_count(profile: Dictionary, count: int) -> Dictionary:
	return normalize_profile(RebirthModel.with_rebirth_count(profile, count))


static func with_rebirth_quest_completed(profile: Dictionary, target_count: int, completed: bool = true) -> Dictionary:
	return normalize_profile(RebirthModel.with_rebirth_quest_completed(profile, target_count, completed))


static func rebirth_trial_proof_count(profile: Dictionary, proof_id: String = REBIRTH_FINAL_BOSS_PROOF_ID) -> int:
	var normalized_id := str(proof_id).strip_edges()
	if normalized_id == "":
		return 0
	return maxi(0, int(_normalize_rebirth_trial_proofs(normalize_profile(profile).get(REBIRTH_TRIAL_PROOFS_KEY, {})).get(normalized_id, 0)))


static func with_rebirth_trial_proof_count(profile: Dictionary, proof_id: String, count: int) -> Dictionary:
	var normalized_id := str(proof_id).strip_edges()
	var normalized := normalize_profile(profile)
	if normalized_id == "":
		return normalized
	var proofs := _normalize_rebirth_trial_proofs(normalized.get(REBIRTH_TRIAL_PROOFS_KEY, {}))
	var next_count := maxi(0, count)
	if next_count > 0:
		proofs[normalized_id] = next_count
	else:
		proofs.erase(normalized_id)
	normalized[REBIRTH_TRIAL_PROOFS_KEY] = proofs
	return normalize_profile(normalized)


static func execute_rebirth(profile: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var preview := rebirth_preview(normalized)
	if not bool(preview.get("ok", false)):
		var reasons: Array = preview.get("reasons", [])
		var reason_texts: Array[String] = []
		for reason in reasons:
			reason_texts.append(str(reason))
		var message := "暂时不能转生。"
		if not reason_texts.is_empty():
			message = "暂时不能转生：%s" % " ".join(reason_texts)
		return {
			"ok": false,
			"profile": normalized,
			"message": message,
			"reasons": reason_texts,
		}
	var target_count := clampi(int(preview.get("targetCount", RebirthModel.rebirth_count(normalized) + 1)), 1, RebirthModel.MAX_REBIRTH_COUNT)
	var consume_result := _consume_rebirth_trial_requirements(normalized, target_count)
	if not bool(consume_result.get("ok", false)):
		return {
			"ok": false,
			"profile": normalized,
			"message": str(consume_result.get("message", "转生试炼材料不足。")),
		}
	var prepared_profile := consume_result.get("profile", normalized) as Dictionary
	var result := RebirthModel.execute_rebirth(prepared_profile, exp_to_next_level(1))
	var next_profile := result.get("profile", profile) as Dictionary
	next_profile = normalize_profile(next_profile)
	if bool(result.get("ok", false)):
		var player := next_profile.get("player", {}) as Dictionary
		player["hp"] = maxi(1, int(player.get("maxHp", player.get("hp", 1))))
		next_profile["player"] = player
		var reward_result := _grant_rebirth_trial_rewards(next_profile, target_count)
		next_profile = reward_result.get("profile", next_profile) as Dictionary
		result["consumedRingIds"] = consume_result.get("consumedRingIds", [])
		result["consumedPets"] = consume_result.get("consumedPets", [])
		result["rewardItems"] = reward_result.get("rewardItems", [])
		result["lostRewardItems"] = reward_result.get("lostRewardItems", [])
		result["starterPet"] = reward_result.get("starterPet", {})
		var consumed_pet_text := _rebirth_consumed_pet_text(result.get("consumedPets", []))
		if consumed_pet_text != "":
			result["message"] = "%s 交出%s。" % [str(result.get("message", "")), consumed_pet_text]
		var reward_text := _rebirth_reward_text(reward_result)
		if reward_text != "":
			result["message"] = "%s 获得%s。" % [str(result.get("message", "")), reward_text]
		next_profile = normalize_profile(next_profile)
	result["profile"] = next_profile
	return result


static func _rebirth_requirement_state_with_trials(profile: Dictionary) -> Dictionary:
	var base := RebirthModel.requirement_state(profile)
	var trial := _rebirth_trial_requirement_state(profile, base)
	var reasons := _string_array(base.get("reasons", []))
	for reason in _string_array(trial.get("reasons", [])):
		if not reasons.has(reason):
			reasons.append(reason)
	var result := base.duplicate(true)
	result["ok"] = bool(base.get("ok", false)) and bool(trial.get("ok", false))
	result["trialOk"] = bool(trial.get("ok", false))
	result["trial"] = trial
	result["reasons"] = reasons
	return result


static func _rebirth_preview_with_trials(profile: Dictionary) -> Dictionary:
	var base_preview := RebirthModel.preview(profile)
	var requirement := _rebirth_requirement_state_with_trials(profile)
	var target_count := clampi(int(base_preview.get("targetCount", requirement.get("targetCount", 1))), 1, RebirthModel.MAX_REBIRTH_COUNT)
	var result := base_preview.duplicate(true)
	result["ok"] = bool(requirement.get("ok", false))
	result["reasons"] = requirement.get("reasons", [])
	result["trial"] = requirement.get("trial", {})
	result["rewardItems"] = _rebirth_reward_items_for_target(target_count)
	result["starterPetPlan"] = _rebirth_starter_pet_plan_for_target(target_count)
	return result


static func _rebirth_preview_lines_with_trials(profile: Dictionary) -> Array[String]:
	var data := _rebirth_preview_with_trials(profile)
	var lines: Array[String] = []
	for raw_line in RebirthModel.preview_lines(profile):
		var line := str(raw_line)
		if line.begins_with("资格:"):
			lines.append("资格: %s" % ("可转生" if bool(data.get("ok", false)) else "未满足"))
		elif line.begins_with("未满足:"):
			continue
		else:
			lines.append(line)
	lines.append("试炼: %s" % _rebirth_trial_requirement_text(int(data.get("targetCount", 1))))
	lines.append("奖励: %s" % _rebirth_reward_plan_text(int(data.get("targetCount", 1))))
	var reasons := _string_array(data.get("reasons", []))
	if not reasons.is_empty():
		lines.append("未满足: %s" % " ".join(reasons))
	return lines


static func _rebirth_trial_requirement_state(profile: Dictionary, base_requirement: Dictionary = {}) -> Dictionary:
	var requirement := base_requirement if not base_requirement.is_empty() else RebirthModel.requirement_state(profile)
	var target_count := clampi(int(requirement.get("targetCount", RebirthModel.rebirth_count(profile) + 1)), 1, RebirthModel.MAX_REBIRTH_COUNT)
	var reasons: Array[String] = []
	var ring_ids := RebirthTrialModel.stage_required_ring_ids(target_count)
	var missing_ring_labels: Array[String] = []
	for ring_id in ring_ids:
		if BackpackModel.item_count(backpack_slots(profile), ring_id) <= 0:
			missing_ring_labels.append(BackpackModel.label_for(ring_id, ring_id))
	var required_beast_form_ids := RebirthTrialModel.stage_required_beast_form_ids(target_count)
	var owned_form_counts := _owned_pet_form_counts(profile)
	var missing_beast_labels: Array[String] = []
	for form_id in required_beast_form_ids:
		if int(owned_form_counts.get(form_id, 0)) <= 0:
			missing_beast_labels.append(_pet_form_name_for(form_id))
	var boss_proof_count := rebirth_trial_proof_count(profile, REBIRTH_FINAL_BOSS_PROOF_ID)
	if not bool(requirement.get("limitOk", true)):
		return {
			"ok": false,
			"targetCount": target_count,
			"ringOk": false,
			"beastOk": false,
			"bossOk": false,
			"requiredRingIds": ring_ids,
			"requiredBeastFormIds": required_beast_form_ids,
			"bossProofCount": boss_proof_count,
			"reasons": [],
		}
	if not missing_ring_labels.is_empty():
		reasons.append("缺少元素戒指：%s。" % "、".join(missing_ring_labels))
	if not missing_beast_labels.is_empty():
		reasons.append("缺少转生兽：%s。" % "、".join(missing_beast_labels))
	if boss_proof_count <= 0:
		reasons.append("未击败玄影洞窟顶层守护。")
	return {
		"ok": reasons.is_empty(),
		"targetCount": target_count,
		"ringOk": missing_ring_labels.is_empty(),
		"beastOk": missing_beast_labels.is_empty(),
		"bossOk": boss_proof_count > 0,
		"requiredRingIds": ring_ids,
		"requiredBeastFormIds": required_beast_form_ids,
		"missingRingLabels": missing_ring_labels,
		"missingBeastLabels": missing_beast_labels,
		"bossProofCount": boss_proof_count,
		"reasons": reasons,
	}


static func _rebirth_trial_requirement_text(target_count: int) -> String:
	var beast_labels: Array[String] = []
	for form_id in RebirthTrialModel.stage_required_beast_form_ids(target_count):
		beast_labels.append(_pet_form_name_for(form_id))
	return "四枚元素戒指；玄影顶层胜利；交付%s" % ("、".join(beast_labels) if not beast_labels.is_empty() else "转生兽")


static func _rebirth_reward_plan_text(target_count: int) -> String:
	var reward_text := BackpackModel.item_amounts_text(_rebirth_reward_items_for_target(target_count))
	var starter := _rebirth_starter_pet_plan_for_target(target_count)
	var starter_name := str(starter.get("name", "幼兽"))
	if reward_text == "":
		return "%s Lv1" % starter_name
	return "%s Lv1；%s" % [starter_name, reward_text]


static func _rebirth_reward_items_for_target(target_count: int) -> Array[Dictionary]:
	var item_id := str(REBIRTH_REWARD_ITEMS_BY_TARGET.get(clampi(target_count, 1, RebirthModel.MAX_REBIRTH_COUNT), ""))
	if item_id == "":
		return []
	return [{
		"itemId": item_id,
		"count": 1,
	}]


static func _rebirth_starter_pet_plan_for_target(target_count: int) -> Dictionary:
	var plan = REBIRTH_STARTER_PET_BY_TARGET.get(clampi(target_count, 1, RebirthModel.MAX_REBIRTH_COUNT), {})
	return plan as Dictionary if plan is Dictionary else {}


static func _consume_rebirth_trial_requirements(profile: Dictionary, target_count: int) -> Dictionary:
	var normalized := normalize_profile(profile)
	var requirement := _rebirth_trial_requirement_state(normalized, RebirthModel.requirement_state(normalized))
	if not bool(requirement.get("ok", false)):
		var reasons := _string_array(requirement.get("reasons", []))
		return {
			"ok": false,
			"profile": normalized,
			"message": "转生试炼未完成：%s" % " ".join(reasons),
		}
	var consumed_ring_ids: Array[String] = []
	var slots := BackpackModel.normalize_slots(normalized.get(BACKPACK_SLOTS_KEY, []))
	for ring_id in RebirthTrialModel.stage_required_ring_ids(target_count):
		slots = BackpackModel.consume(slots, ring_id, 1)
		consumed_ring_ids.append(ring_id)
	normalized[BACKPACK_SLOTS_KEY] = slots
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(slots)
	var consume_pet_result := _consume_rebirth_beasts(normalized, target_count)
	normalized = consume_pet_result.get("profile", normalized) as Dictionary
	var proofs := _normalize_rebirth_trial_proofs(normalized.get(REBIRTH_TRIAL_PROOFS_KEY, {}))
	proofs[REBIRTH_FINAL_BOSS_PROOF_ID] = maxi(0, int(proofs.get(REBIRTH_FINAL_BOSS_PROOF_ID, 0)) - 1)
	if int(proofs.get(REBIRTH_FINAL_BOSS_PROOF_ID, 0)) <= 0:
		proofs.erase(REBIRTH_FINAL_BOSS_PROOF_ID)
	normalized[REBIRTH_TRIAL_PROOFS_KEY] = proofs
	return {
		"ok": true,
		"profile": normalize_profile(normalized),
		"consumedRingIds": consumed_ring_ids,
		"consumedPets": consume_pet_result.get("consumedPets", []),
	}


static func _consume_rebirth_beasts(profile: Dictionary, target_count: int) -> Dictionary:
	var normalized := profile.duplicate(true)
	var required_counts := {}
	for form_id in RebirthTrialModel.stage_required_beast_form_ids(target_count):
		required_counts[form_id] = int(required_counts.get(form_id, 0)) + 1
	var next_instances: Array[Dictionary] = []
	var consumed_pets: Array[Dictionary] = []
	for instance in _pet_instances(normalized):
		var form_id := str(instance.get("formId", instance.get("templateId", "")))
		var remaining_required := int(required_counts.get(form_id, 0))
		if remaining_required > 0:
			required_counts[form_id] = remaining_required - 1
			consumed_pets.append({
				"instanceId": str(instance.get("instanceId", "")),
				"name": str(instance.get("name", _pet_form_name_for(form_id))),
				"formId": form_id,
				"level": maxi(1, int(instance.get("level", 1))),
			})
			continue
		next_instances.append(instance)
	normalized["petInstances"] = next_instances
	return {
		"profile": normalize_profile(normalized),
		"consumedPets": consumed_pets,
	}


static func _rebirth_consumed_pet_text(consumed_pets) -> String:
	if not (consumed_pets is Array):
		return ""
	var parts: Array[String] = []
	for value in consumed_pets:
		if not (value is Dictionary):
			continue
		var pet := value as Dictionary
		var label := str(pet.get("name", _pet_form_name_for(str(pet.get("formId", ""))))).strip_edges()
		if label == "":
			label = "转生兽"
		var level := maxi(1, int(pet.get("level", 1)))
		parts.append("%s Lv%d" % [label, level])
	return "、".join(parts)


static func _grant_rebirth_trial_rewards(profile: Dictionary, target_count: int) -> Dictionary:
	var normalized := normalize_profile(profile)
	var reward_result := BackpackModel.add_items(backpack_slots(normalized), _rebirth_reward_items_for_target(target_count))
	normalized = with_backpack_slots(normalized, reward_result.get("slots", []))
	var starter_result := _append_rebirth_starter_pet(normalized, target_count)
	normalized = starter_result.get("profile", normalized) as Dictionary
	return {
		"profile": normalize_profile(normalized),
		"rewardItems": _item_amount_array(reward_result.get("added", [])),
		"lostRewardItems": _item_amount_array(reward_result.get("lost", [])),
		"starterPet": starter_result.get("starterPet", {}),
	}


static func _append_rebirth_starter_pet(profile: Dictionary, target_count: int) -> Dictionary:
	var normalized := normalize_profile(profile)
	var plan := _rebirth_starter_pet_plan_for_target(target_count)
	var form_id := str(plan.get("formId", ""))
	if form_id == "":
		return {"profile": normalized, "starterPet": {}}
	var serial := maxi(int(normalized.get("nextPetInstanceSerial", 1)), _next_serial_from_instances(_pet_instances(normalized)))
	var instance_id := "pet_rebirth_%d_%d" % [target_count, serial]
	var state_name := PET_STATE_STORAGE
	var instances: Array = normalized.get("petInstances", [])
	if _party_visible_instance_count(normalized) < PARTY_LIMIT:
		state_name = PET_STATE_BATTLE
		for index in range(instances.size()):
			if not (instances[index] is Dictionary):
				continue
			var instance := instances[index] as Dictionary
			if str(instance.get("state", PET_STATE_STANDBY)) == PET_STATE_BATTLE:
				instance["state"] = PET_STATE_STANDBY
				instances[index] = instance
	var starter := _pet_instance_from_form(instance_id, str(plan.get("name", "")), form_id, state_name, 1)
	if starter.is_empty():
		return {"profile": normalized, "starterPet": {}}
	instances.append(starter)
	normalized["petInstances"] = instances
	normalized["nextPetInstanceSerial"] = serial + 1
	if state_name == PET_STATE_BATTLE:
		normalized["activePetInstanceId"] = instance_id
	return {
		"profile": normalize_profile(normalized),
		"starterPet": starter,
	}


static func _rebirth_reward_text(reward_result: Dictionary) -> String:
	var parts: Array[String] = []
	var starter := reward_result.get("starterPet", {}) as Dictionary
	if not starter.is_empty():
		parts.append("%s Lv%d" % [str(starter.get("name", "幼兽")), int(starter.get("level", 1))])
	var item_text := BackpackModel.item_amounts_text(_item_amount_array(reward_result.get("rewardItems", [])))
	if item_text != "":
		parts.append(item_text)
	var lost_text := BackpackModel.item_amounts_text(_item_amount_array(reward_result.get("lostRewardItems", [])))
	if lost_text != "":
		parts.append("背包已满，未获得%s" % lost_text)
	return "、".join(parts)


static func _pet_form_name_for(form_id: String) -> String:
	var template := PetTemplateCatalog.runtime_template_for_form(form_id)
	return str(template.get("formName", form_id)) if not template.is_empty() else form_id


static func battle_actor_knocked_away(state: Dictionary, actor_id: String) -> bool:
	for actor in _actors(state):
		if str(actor.get("id", "")) != actor_id:
			continue
		return _actor_knocked_away(actor)
	return false


static func battle_knocked_away_actor_ids(state: Dictionary) -> Array[String]:
	var result: Array[String] = []
	for actor in _actors(state):
		var actor_id := str(actor.get("id", ""))
		if actor_id != "" and _actor_knocked_away(actor):
			result.append(actor_id)
	return result


static func active_pet(profile: Dictionary) -> Dictionary:
	return _active_profile_pet(normalize_profile(profile))


static func pet_instance_by_id(profile: Dictionary, instance_id: String) -> Dictionary:
	for instance in _pet_instances(normalize_profile(profile)):
		if str(instance.get("instanceId", "")) == instance_id:
			return instance
	return {}


static func party_pet_instances(profile: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for instance in _pet_instances(normalize_profile(profile)):
		if str(instance.get("state", PET_STATE_STANDBY)) != PET_STATE_STORAGE:
			result.append(instance)
	return result


static func storage_pet_instances(profile: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for instance in _pet_instances(normalize_profile(profile)):
		if str(instance.get("state", PET_STATE_STANDBY)) == PET_STATE_STORAGE:
			result.append(instance)
	return result


static func mark_pet_seen(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var instances: Array = normalized.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("instanceId", "")) != instance_id:
			instances[index] = instance
			continue
		instance["isNew"] = false
		instances[index] = instance
		break
	normalized["petInstances"] = instances
	return normalize_profile(normalized)


static func can_move_party_pet(profile: Dictionary, instance_id: String, direction: int) -> Dictionary:
	var normalized := normalize_profile(profile)
	var step := -1 if direction < 0 else 1 if direction > 0 else 0
	if step == 0:
		return {"ok": false, "message": "没有可调整的方向。"}
	var instances: Array = normalized.get("petInstances", [])
	var selected_index := _pet_instance_index(instances, instance_id)
	if selected_index < 0:
		return {"ok": false, "message": "宠物不存在。"}
	var selected := instances[selected_index] as Dictionary
	if str(selected.get("state", PET_STATE_STANDBY)) == PET_STATE_STORAGE:
		return {"ok": false, "message": "兽栏宠物不能调整队伍顺序。"}
	var party_positions: Array[int] = []
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := instances[index] as Dictionary
		if str(instance.get("state", PET_STATE_STANDBY)) != PET_STATE_STORAGE:
			party_positions.append(index)
	var party_order_index := party_positions.find(selected_index)
	if party_order_index < 0:
		return {"ok": false, "message": "宠物不在队伍中。"}
	var target_order_index := party_order_index + step
	if target_order_index < 0:
		return {"ok": false, "message": "%s 已在队伍最前。" % str(selected.get("name", "宠物"))}
	if target_order_index >= party_positions.size():
		return {"ok": false, "message": "%s 已在队伍最后。" % str(selected.get("name", "宠物"))}
	return {
		"ok": true,
		"selectedIndex": selected_index,
		"targetIndex": party_positions[target_order_index],
	}


static func move_party_pet(profile: Dictionary, instance_id: String, direction: int) -> Dictionary:
	var normalized := normalize_profile(profile)
	var check := can_move_party_pet(normalized, instance_id, direction)
	if not bool(check.get("ok", false)):
		return {
			"ok": false,
			"profile": normalized,
			"message": str(check.get("message", "暂时不能调整。")),
		}
	var instances: Array = normalized.get("petInstances", [])
	var selected_index := int(check.get("selectedIndex", -1))
	var target_index := int(check.get("targetIndex", -1))
	var selected := (instances[selected_index] as Dictionary).duplicate(true)
	var target := (instances[target_index] as Dictionary).duplicate(true)
	instances[selected_index] = target
	instances[target_index] = selected
	normalized["petInstances"] = instances
	var direction_text := "上移" if direction < 0 else "下移"
	return {
		"ok": true,
		"profile": normalize_profile(normalized),
		"message": "%s 已%s。" % [str(selected.get("name", "宠物")), direction_text],
	}


static func capture_tool_inventory(profile: Dictionary) -> Dictionary:
	return _capture_tool_inventory_from_slots(backpack_slots(profile))


static func capture_tool_count(profile: Dictionary, tool_id: String) -> int:
	return CaptureToolCatalog.count_for(capture_tool_inventory(profile), tool_id)


static func with_capture_tool_inventory(profile: Dictionary, inventory: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var slots := BackpackModel.set_counts_for_context(
		BackpackModel.normalize_slots(normalized.get(BACKPACK_SLOTS_KEY, [])),
		BackpackModel.CONTEXT_CAPTURE,
		CaptureToolCatalog.normalize_inventory(inventory)
	)
	normalized[BACKPACK_SLOTS_KEY] = slots
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(slots)
	return normalized


static func backpack_slots(profile: Dictionary) -> Array[Dictionary]:
	var normalized := normalize_profile(profile)
	return BackpackModel.normalize_slots(
		normalized.get(BACKPACK_SLOTS_KEY, []),
		BackpackModel.unlocked_slot_count(int(normalized.get(BACKPACK_EXTRA_SLOTS_KEY, 0)))
	)


static func backpack_item_count(profile: Dictionary, item_id: String) -> int:
	return BackpackModel.item_count(backpack_slots(profile), item_id)


static func mailbox_messages(profile: Dictionary, now_sec: int = -1) -> Array[Dictionary]:
	var normalized := normalize_profile(profile)
	return _normalize_mailbox_messages(normalized.get(MAILBOX_MESSAGES_KEY, []), now_sec)


static func mailbox_unclaimed_count(profile: Dictionary, now_sec: int = -1) -> int:
	return mailbox_messages(profile, now_sec).size()


static func mailbox_message_by_id(profile: Dictionary, mail_id: String, now_sec: int = -1) -> Dictionary:
	var normalized_id := str(mail_id).strip_edges()
	for message in mailbox_messages(profile, now_sec):
		if str(message.get("mailId", "")) == normalized_id:
			return message
	return {}


static func mailbox_claim_message(profile: Dictionary, mail_id: String, now_sec: int = -1) -> Dictionary:
	var now := _safe_now_sec(now_sec)
	var normalized := normalize_profile(profile)
	var normalized_id := str(mail_id).strip_edges()
	var messages := _normalize_mailbox_messages(normalized.get(MAILBOX_MESSAGES_KEY, []), now)
	var target_index := -1
	for index in range(messages.size()):
		if str(messages[index].get("mailId", "")) == normalized_id:
			target_index = index
			break
	if target_index < 0:
		normalized[MAILBOX_MESSAGES_KEY] = messages
		return {"ok": false, "profile": normalized, "message": "邮件不存在或已过期。"}
	var message := messages[target_index] as Dictionary
	var attachments: Array[Dictionary] = _normalize_mailbox_items(message.get("items", []))
	if attachments.is_empty():
		messages.remove_at(target_index)
		normalized[MAILBOX_MESSAGES_KEY] = messages
		return {"ok": false, "profile": normalized, "message": "邮件没有可领取附件。"}
	var add_result := BackpackModel.add_items(backpack_slots(normalized), attachments)
	var added: Array = add_result.get("added", [])
	var lost: Array = add_result.get("lost", [])
	if added.is_empty():
		normalized[MAILBOX_MESSAGES_KEY] = messages
		return {"ok": false, "profile": normalized, "message": "背包已满，无法领取邮件附件。"}
	var remaining := _subtract_item_amounts(attachments, added)
	if remaining.is_empty():
		messages.remove_at(target_index)
	else:
		message["items"] = remaining
		messages[target_index] = message
	normalized[BACKPACK_SLOTS_KEY] = add_result.get("slots", normalized.get(BACKPACK_SLOTS_KEY, []))
	normalized[MAILBOX_MESSAGES_KEY] = messages
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(BackpackModel.normalize_slots(normalized.get(BACKPACK_SLOTS_KEY, [])))
	normalized = normalize_profile(normalized)
	var added_text := BackpackModel.item_amounts_text(added)
	var message_text := "领取邮件附件：%s。" % added_text
	if not lost.is_empty():
		message_text += " 背包空间不足，剩余附件留在邮箱。"
	return {
		"ok": remaining.is_empty(),
		"profile": normalized,
		"message": message_text,
		"added": added,
		"remaining": remaining,
	}


static func exp_pill_starter_notice(profile: Dictionary) -> String:
	var normalized := normalize_profile(profile)
	if not mailbox_message_by_id(normalized, MAIL_EXP_PILL_STARTER_ID).is_empty():
		return "经验丹已通过系统邮件发放，请打开邮箱领取。"
	if int(normalized.get(EXP_PILL_STARTER_VERSION_KEY, 0)) < EXP_PILL_STARTER_VERSION:
		return "经验丹待补发。重新打开背包或重进游戏后会进入背包或邮箱。"
	return ""


static func mailbox_expiry_text(message: Dictionary, now_sec: int = -1) -> String:
	var now := _safe_now_sec(now_sec)
	var expires_at := int(message.get("expiresAtSec", 0))
	if expires_at <= 0:
		return "不会过期"
	var remaining := expires_at - now
	if remaining <= 0:
		return "已过期"
	var days := int(ceil(float(remaining) / 86400.0))
	return "%d天后过期" % maxi(1, days)


static func mailbox_message_button_text(message: Dictionary, now_sec: int = -1) -> String:
	var title := str(message.get("title", "邮件"))
	var items := _normalize_mailbox_items(message.get("items", []))
	var item_text := "无附件" if items.is_empty() else "附件%d种" % items.size()
	return "%s\n%s  %s" % [title, item_text, mailbox_expiry_text(message, now_sec)]


static func backpack_counts_for_context(profile: Dictionary, context: String) -> Dictionary:
	var normalized_slots := backpack_slots(profile)
	if context == BackpackModel.CONTEXT_CAPTURE:
		return _capture_tool_inventory_from_slots(normalized_slots)
	if context == BackpackModel.CONTEXT_BATTLE_ITEM:
		return _battle_item_inventory_from_slots(normalized_slots)
	return BackpackModel.counts_for_context(normalized_slots, context)


static func backpack_extra_slots(profile: Dictionary) -> int:
	return clampi(int(normalize_profile(profile).get(BACKPACK_EXTRA_SLOTS_KEY, 0)), 0, BackpackModel.EXTRA_SLOT_LIMIT)


static func backpack_unlocked_slot_count(profile: Dictionary) -> int:
	return BackpackModel.unlocked_slot_count(backpack_extra_slots(profile))


static func backpack_max_slot_count() -> int:
	return BackpackModel.SLOT_LIMIT


static func with_backpack_slots(profile: Dictionary, slots: Array[Dictionary]) -> Dictionary:
	var normalized := normalize_profile(profile)
	var normalized_slots := BackpackModel.normalize_slots(
		slots,
		BackpackModel.unlocked_slot_count(int(normalized.get(BACKPACK_EXTRA_SLOTS_KEY, 0)))
	)
	normalized[BACKPACK_SLOTS_KEY] = normalized_slots
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(normalized_slots)
	return normalize_profile(normalized)


static func quick_slots(profile: Dictionary) -> Array[String]:
	return _normalize_quick_slots(normalize_profile(profile).get(QUICK_SLOTS_KEY, []))


static func item_can_quick_use(item_id: String) -> bool:
	return BackpackModel.item_can_world_pet_heal(item_id) or BackpackModel.item_can_world_encounter_stone(item_id)


static func with_quick_slot_item(profile: Dictionary, slot_index: int, item_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	if slot_index < 0 or slot_index >= QUICK_SLOT_COUNT:
		return normalized
	var slots := quick_slots(normalized)
	slots[slot_index] = item_id if item_can_quick_use(item_id) else ""
	normalized[QUICK_SLOTS_KEY] = slots
	return normalize_profile(normalized)


static func clear_quick_slot(profile: Dictionary, slot_index: int) -> Dictionary:
	return with_quick_slot_item(profile, slot_index, "")


static func equipment_slots(profile: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var slots = normalized.get(EQUIPMENT_SLOTS_KEY, {})
	return (slots as Dictionary).duplicate(true) if slots is Dictionary else {}


static func equipment_durability(profile: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var durability = normalized.get(EQUIPMENT_DURABILITY_KEY, {})
	return (durability as Dictionary).duplicate(true) if durability is Dictionary else {}


static func equipment_enhancement(profile: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var enhancement = normalized.get(EQUIPMENT_ENHANCEMENT_KEY, {})
	return (enhancement as Dictionary).duplicate(true) if enhancement is Dictionary else {}


static func equipment_wear_counters(profile: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var counters = normalized.get(EQUIPMENT_WEAR_COUNTERS_KEY, {})
	return (counters as Dictionary).duplicate(true) if counters is Dictionary else {}


static func equipment_enhance_level(profile: Dictionary, slot_id: String) -> int:
	var slots := equipment_slots(profile)
	var item_id := str(slots.get(slot_id, ""))
	if item_id == "":
		return 0
	return _equipment_enhance_level_for_slot(equipment_enhancement(profile), slot_id, item_id)


static func equipment_enhance_text(profile: Dictionary, slot_id: String) -> String:
	var slots := equipment_slots(profile)
	var item_id := str(slots.get(slot_id, ""))
	if item_id == "":
		return ""
	var level := equipment_enhance_level(profile, slot_id)
	if level <= 0:
		return "强化: +0/%d" % EquipmentModel.enhance_max_for(item_id) if EquipmentModel.enhance_max_for(item_id) > 0 else ""
	var bonus_text := EquipmentModel.enhance_bonus_text_for(item_id, level)
	return "强化: +%d/%d%s" % [
		level,
		EquipmentModel.enhance_max_for(item_id),
		"（%s）" % bonus_text if bonus_text != "" else "",
	]


static func equipped_exp_pill_charge(profile: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var charge = normalized.get(EQUIPMENT_EXP_PILL_CHARGE_KEY, {})
	return (charge as Dictionary).duplicate(true) if charge is Dictionary else {}


static func equipped_item_id(profile: Dictionary, slot_id: String) -> String:
	return str(equipment_slots(profile).get(slot_id, ""))


static func equipped_slot_for_item(profile: Dictionary, item_id: String) -> String:
	for slot_id in EquipmentModel.slot_ids():
		if str(equipment_slots(profile).get(slot_id, "")) == item_id:
			return slot_id
	return ""


static func starter_equipment_slots() -> Dictionary:
	return {
		EquipmentModel.SLOT_ACCESSORY_LEFT: "accessory_firebud_charm",
		EquipmentModel.SLOT_ACCESSORY_RIGHT: "accessory_wind_ring",
		EquipmentModel.SLOT_HEAD: "helm_leather_cap",
		EquipmentModel.SLOT_LEFT_HAND_WEAPON: "weapon_training_spear",
		EquipmentModel.SLOT_BODY: "armor_moist_cloth",
		EquipmentModel.SLOT_RIGHT_HAND_WEAPON: "weapon_stone_dagger",
		EquipmentModel.SLOT_HANDS: "gloves_hide",
		EquipmentModel.SLOT_FEET: "boots_grass",
		EquipmentModel.SLOT_EXP_PILL: "",
	}


static func without_equipment(profile: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	normalized[EQUIPMENT_SLOTS_KEY] = {}
	normalized[EQUIPMENT_STARTER_SET_VERSION_KEY] = EQUIPMENT_STARTER_SET_VERSION
	return normalize_profile(normalized)


static func equipment_stat_bonus(profile: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var player := normalized.get("player", {}) as Dictionary
	var player_level := maxi(1, int(player.get("level", 1)))
	return _equipment_stat_bonus_from_slots(
		equipment_slots(normalized),
		equipment_durability(normalized),
		player_level,
		RebirthModel.rebirth_count(normalized),
		equipment_enhancement(normalized)
	)


static func equipment_spirit_ids(profile: Dictionary) -> Array[String]:
	var normalized := normalize_profile(profile)
	var player := normalized.get("player", {}) as Dictionary
	var player_level := maxi(1, int(player.get("level", 1)))
	return _equipment_spirit_ids_from_slots(
		equipment_slots(normalized),
		equipment_durability(normalized),
		player_level,
		RebirthModel.rebirth_count(normalized)
	)


static func equipment_battle_action_ids(profile: Dictionary) -> Array[String]:
	var normalized := normalize_profile(profile)
	var player := normalized.get("player", {}) as Dictionary
	var player_level := maxi(1, int(player.get("level", 1)))
	return _equipment_battle_action_ids_from_slots(
		equipment_slots(normalized),
		equipment_durability(normalized),
		player_level,
		RebirthModel.rebirth_count(normalized)
	)


static func equipment_attack_action_id(profile: Dictionary) -> String:
	var normalized := normalize_profile(profile)
	var player := normalized.get("player", {}) as Dictionary
	var player_level := maxi(1, int(player.get("level", 1)))
	return _equipment_attack_action_id_from_slots(
		equipment_slots(normalized),
		equipment_durability(normalized),
		player_level,
		RebirthModel.rebirth_count(normalized)
	)


static func equipment_spirit_source_entries(profile: Dictionary) -> Array[Dictionary]:
	var normalized := normalize_profile(profile)
	var player := normalized.get("player", {}) as Dictionary
	var player_level := maxi(1, int(player.get("level", 1)))
	return _equipment_spirit_source_entries_from_slots(
		equipment_slots(normalized),
		equipment_durability(normalized),
		player_level,
		RebirthModel.rebirth_count(normalized)
	)


static func equipment_item_requirement_state(profile: Dictionary, item_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var player := normalized.get("player", {}) as Dictionary
	var player_level := maxi(1, int(player.get("level", 1)))
	var player_rebirth := RebirthModel.rebirth_count(normalized)
	return _equipment_requirement_state_for_values(item_id, player_level, player_rebirth)


static func equipment_slot_active_state(profile: Dictionary, slot_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var slots := equipment_slots(normalized)
	var item_id := str(slots.get(slot_id, ""))
	if item_id == "":
		return {
			"itemId": "",
			"active": false,
			"broken": false,
			"requirementOk": true,
			"message": "",
		}
	var durability := equipment_durability(normalized)
	var broken := _equipment_slot_is_broken(slot_id, item_id, durability)
	var requirement := equipment_item_requirement_state(normalized, item_id)
	var requirement_ok := bool(requirement.get("ok", false))
	var message := ""
	if broken:
		message = "装备已损坏，暂不生效。"
	elif not requirement_ok:
		message = "需求未满足，装备暂不生效。"
	return {
		"itemId": item_id,
		"active": not broken and requirement_ok,
		"broken": broken,
		"requirementOk": requirement_ok,
		"requirement": requirement,
		"message": message,
	}


static func equipment_slot_durability_text(profile: Dictionary, slot_id: String) -> String:
	var slots := equipment_slots(profile)
	var item_id := str(slots.get(slot_id, ""))
	if item_id == "":
		return ""
	var max_durability := EquipmentModel.max_durability_for(item_id)
	if max_durability <= 0:
		return ""
	var current := clampi(int(equipment_durability(profile).get(slot_id, max_durability)), 0, max_durability)
	return "耐久: %d/%d%s" % [current, max_durability, "（已损坏）" if current <= 0 else ""]


static func apply_equipment_wear(profile: Dictionary, amount: int = 1) -> Dictionary:
	var normalized := normalize_profile(profile)
	var wear := maxi(0, amount)
	if wear <= 0:
		return {"profile": normalized, "changed": false, "brokenLabels": []}
	var slots := equipment_slots(normalized)
	var durability := equipment_durability(normalized)
	var broken_labels: Array[String] = []
	var changed := false
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(slots.get(slot_id, ""))
		if item_id == "":
			continue
		var max_durability := EquipmentModel.max_durability_for(item_id)
		if max_durability <= 0:
			continue
		var before := clampi(int(durability.get(slot_id, max_durability)), 0, max_durability)
		var after := maxi(0, before - wear)
		if after != before:
			changed = true
			durability[slot_id] = after
			if before > 0 and after <= 0:
				broken_labels.append(EquipmentModel.label_for(item_id, item_id))
	normalized[EQUIPMENT_DURABILITY_KEY] = durability
	normalized = normalize_profile(normalized)
	return {
		"profile": normalized,
		"changed": changed,
		"brokenLabels": broken_labels,
	}


static func apply_equipment_wear_from_battle_usage(profile: Dictionary, usage: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var weapon_attacks := maxi(0, int(usage.get("weaponAttacks", 0)))
	var armor_hits := maxi(0, int(usage.get("armorHits", 0)))
	if weapon_attacks <= 0 and armor_hits <= 0:
		return {
			"profile": normalized,
			"changed": false,
			"brokenLabels": [],
			"durabilityDrops": [],
		}
	var slots := equipment_slots(normalized)
	var durability := equipment_durability(normalized)
	var counters := equipment_wear_counters(normalized)
	var broken_labels: Array[String] = []
	var durability_drops: Array[Dictionary] = []
	if weapon_attacks > 0:
		_apply_equipment_counter_wear(
			slots,
			durability,
			counters,
			_active_weapon_slot_for_wear(slots, durability),
			"attackCount",
			weapon_attacks,
			EQUIPMENT_WEAPON_ATTACKS_PER_DURABILITY,
			broken_labels,
			durability_drops
		)
	if armor_hits > 0:
		_apply_equipment_counter_wear(
			slots,
			durability,
			counters,
			_active_armor_slot_for_wear(slots, durability),
			"hitCount",
			armor_hits,
			EQUIPMENT_ARMOR_HITS_PER_DURABILITY,
			broken_labels,
			durability_drops
		)
	normalized[EQUIPMENT_DURABILITY_KEY] = durability
	normalized[EQUIPMENT_WEAR_COUNTERS_KEY] = counters
	normalized = normalize_profile(normalized)
	return {
		"profile": normalized,
		"changed": not durability_drops.is_empty(),
		"brokenLabels": broken_labels,
		"durabilityDrops": durability_drops,
	}


static func _active_weapon_slot_for_wear(slots: Dictionary, durability: Dictionary) -> String:
	for slot_id in [EquipmentModel.SLOT_RIGHT_HAND_WEAPON, EquipmentModel.SLOT_LEFT_HAND_WEAPON]:
		var item_id := str(slots.get(slot_id, ""))
		if item_id != "" and EquipmentModel.max_durability_for(item_id) > 0 and not _equipment_slot_is_broken(slot_id, item_id, durability):
			return slot_id
	return ""


static func _active_armor_slot_for_wear(slots: Dictionary, durability: Dictionary) -> String:
	for slot_id in [EquipmentModel.SLOT_BODY, EquipmentModel.SLOT_HEAD, EquipmentModel.SLOT_HANDS, EquipmentModel.SLOT_FEET, EquipmentModel.SLOT_ACCESSORY_LEFT, EquipmentModel.SLOT_ACCESSORY_RIGHT]:
		var item_id := str(slots.get(slot_id, ""))
		if item_id != "" and EquipmentModel.max_durability_for(item_id) > 0 and not _equipment_slot_is_broken(slot_id, item_id, durability):
			return slot_id
	return ""


static func _apply_equipment_counter_wear(slots: Dictionary, durability: Dictionary, counters: Dictionary, slot_id: String, counter_key: String, amount: int, per_durability: int, broken_labels: Array[String], durability_drops: Array[Dictionary]) -> void:
	if slot_id == "" or amount <= 0 or per_durability <= 0:
		return
	var item_id := str(slots.get(slot_id, ""))
	if item_id == "":
		return
	var max_durability := EquipmentModel.max_durability_for(item_id)
	if max_durability <= 0:
		return
	var current := clampi(int(durability.get(slot_id, max_durability)), 0, max_durability)
	if current <= 0:
		return
	var counter = counters.get(slot_id, _fresh_equipment_wear_counter_record(item_id))
	var record := counter as Dictionary if counter is Dictionary else _fresh_equipment_wear_counter_record(item_id)
	if str(record.get("itemId", "")) != item_id:
		record = _fresh_equipment_wear_counter_record(item_id)
	var total := maxi(0, int(record.get(counter_key, 0))) + amount
	var drop := int(total / per_durability)
	record[counter_key] = total % per_durability
	if drop > 0:
		var next_durability := maxi(0, current - drop)
		durability[slot_id] = next_durability
		durability_drops.append({
			"slotId": slot_id,
			"itemId": item_id,
			"label": EquipmentModel.label_for(item_id, item_id),
			"amount": current - next_durability,
			"current": next_durability,
			"max": max_durability,
		})
		if next_durability <= 0:
			broken_labels.append(EquipmentModel.label_for(item_id, item_id))
	counters[slot_id] = record


static func equipment_repair_missing(profile: Dictionary) -> int:
	var normalized := normalize_profile(profile)
	var slots := equipment_slots(normalized)
	var durability := equipment_durability(normalized)
	var missing := 0
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(slots.get(slot_id, ""))
		if item_id == "":
			continue
		var max_durability := EquipmentModel.max_durability_for(item_id)
		if max_durability <= 0:
			continue
		var current := clampi(int(durability.get(slot_id, max_durability)), 0, max_durability)
		missing += maxi(0, max_durability - current)
	return missing


static func equipment_repair_cost_for_missing(missing: int) -> int:
	return int(ceil(float(maxi(0, missing)) / float(EQUIPMENT_REPAIR_DURABILITY_PER_COIN)))


static func equipment_repair_quote(profile: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var missing := equipment_repair_missing(normalized)
	var cost := equipment_repair_cost_for_missing(missing)
	return {
		"missingDurability": missing,
		"cost": cost,
		"stoneCoins": stone_coins(normalized),
	}


static func repair_all_equipment(profile: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var quote := equipment_repair_quote(normalized)
	var missing := int(quote.get("missingDurability", 0))
	var cost := int(quote.get("cost", 0))
	if missing <= 0:
		return {"ok": false, "profile": normalized, "message": "装备耐久已满。"}
	if stone_coins(normalized) < cost:
		return {"ok": false, "profile": normalized, "message": "石币不足，修理需要%d石币。" % cost}
	var slots := equipment_slots(normalized)
	var durability := equipment_durability(normalized)
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(slots.get(slot_id, ""))
		if item_id == "":
			continue
		var max_durability := EquipmentModel.max_durability_for(item_id)
		if max_durability > 0:
			durability[slot_id] = max_durability
	normalized[EQUIPMENT_DURABILITY_KEY] = durability
	normalized[EQUIPMENT_WEAR_COUNTERS_KEY] = _fresh_equipment_wear_counters_for_slots(slots)
	normalized[STONE_COINS_KEY] = stone_coins(normalized) - cost
	normalized = normalize_profile(normalized)
	return {
		"ok": true,
		"profile": normalized,
		"message": "装备修理完成，花费%d石币。" % cost,
		"cost": cost,
	}


static func equipment_enhance_quote(profile: Dictionary, slot_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var slots := equipment_slots(normalized)
	var item_id := str(slots.get(slot_id, ""))
	if item_id == "":
		return {
			"ok": false,
			"slotId": slot_id,
			"message": "这个装备槽没有装备。",
		}
	var max_level := EquipmentModel.enhance_max_for(item_id)
	if max_level <= 0:
		return {
			"ok": false,
			"slotId": slot_id,
			"itemId": item_id,
			"message": "%s 暂不能强化。" % EquipmentModel.label_for(item_id, item_id),
		}
	var current_level := equipment_enhance_level(normalized, slot_id)
	if current_level >= max_level:
		return {
			"ok": false,
			"slotId": slot_id,
			"itemId": item_id,
			"level": current_level,
			"maxLevel": max_level,
			"message": "%s 已达到强化上限。" % EquipmentModel.label_for(item_id, item_id),
		}
	var next_level := current_level + 1
	var material_id := EquipmentModel.enhance_material_id_for(item_id)
	var material_count := EquipmentModel.enhance_material_count_for_level(next_level)
	var held_material := BackpackModel.item_count(backpack_slots(normalized), material_id)
	var stone_cost := EquipmentModel.enhance_stone_cost_for_level(next_level)
	var ok := held_material >= material_count and stone_coins(normalized) >= stone_cost
	var missing_parts: Array[String] = []
	if held_material < material_count:
		missing_parts.append("%s %d/%d" % [BackpackModel.label_for(material_id, material_id), held_material, material_count])
	if stone_coins(normalized) < stone_cost:
		missing_parts.append("石币 %d/%d" % [stone_coins(normalized), stone_cost])
	return {
		"ok": ok,
		"slotId": slot_id,
		"itemId": item_id,
		"level": current_level,
		"nextLevel": next_level,
		"maxLevel": max_level,
		"materialId": material_id,
		"materialCount": material_count,
		"heldMaterialCount": held_material,
		"stoneCost": stone_cost,
		"stoneCoins": stone_coins(normalized),
		"message": "可强化到 +%d。" % next_level if ok else "强化材料不足：%s。" % "、".join(missing_parts),
	}


static func enhance_equipment_slot(profile: Dictionary, slot_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var quote := equipment_enhance_quote(normalized, slot_id)
	if not bool(quote.get("ok", false)):
		quote["profile"] = normalized
		return quote
	var item_id := str(quote.get("itemId", ""))
	var material_id := str(quote.get("materialId", ""))
	var material_count := maxi(1, int(quote.get("materialCount", 1)))
	var stone_cost := maxi(0, int(quote.get("stoneCost", 0)))
	var slots := BackpackModel.consume(backpack_slots(normalized), material_id, material_count)
	normalized[BACKPACK_SLOTS_KEY] = slots
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(slots)
	normalized[STONE_COINS_KEY] = stone_coins(normalized) - stone_cost
	var enhancement := equipment_enhancement(normalized)
	var record := _equipment_enhancement_record_for_item(enhancement, slot_id, item_id)
	var next_level := maxi(1, int(quote.get("nextLevel", 1)))
	record["level"] = next_level
	var history: Array = record.get("history", [])
	history.append({
		"level": next_level,
		"materialId": material_id,
		"materialCount": material_count,
		"stoneCost": stone_cost,
	})
	record["history"] = history
	enhancement[slot_id] = record
	normalized[EQUIPMENT_ENHANCEMENT_KEY] = enhancement
	normalized = normalize_profile(normalized)
	var bonus_text := EquipmentModel.enhance_bonus_text_for(item_id, next_level)
	return {
		"ok": true,
		"profile": normalized,
		"slotId": slot_id,
		"itemId": item_id,
		"level": next_level,
		"message": "%s 强化到 +%d%s。" % [
			EquipmentModel.label_for(item_id, item_id),
			next_level,
			"（%s）" % bonus_text if bonus_text != "" else "",
		],
	}


static func can_synthesize_equipment(profile: Dictionary, recipe_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var recipe := EquipmentSynthesisModel.recipe_for_id(recipe_id)
	if recipe.is_empty():
		return {
			"ok": false,
			"profile": normalized,
			"message": "配方不存在。",
		}
	var output_item_id := EquipmentSynthesisModel.output_item_id(recipe)
	var output_count := EquipmentSynthesisModel.output_count(recipe)
	if output_item_id == "" or not EquipmentModel.is_equipment(output_item_id):
		return {
			"ok": false,
			"profile": normalized,
			"message": "配方产物无效。",
		}
	var slots := backpack_slots(normalized)
	var missing: Array[Dictionary] = []
	for material in EquipmentSynthesisModel.material_entries(recipe):
		var item_id := str(material.get("itemId", ""))
		var need_count := maxi(0, int(material.get("count", 0)))
		var held_count := BackpackModel.item_count(slots, item_id)
		if held_count < need_count:
			missing.append({
				"itemId": item_id,
				"count": need_count - held_count,
			})
	if not missing.is_empty():
		return {
			"ok": false,
			"profile": normalized,
			"message": "材料不足：%s。" % BackpackModel.item_amounts_text(missing),
			"missingItems": missing,
		}
	var cost := EquipmentSynthesisModel.stone_cost(recipe)
	if stone_coins(normalized) < cost:
		return {
			"ok": false,
			"profile": normalized,
			"message": "石币不够。",
			"missingCoins": cost - stone_coins(normalized),
		}
	var slots_after_materials := _consume_item_amounts(slots, EquipmentSynthesisModel.material_entries(recipe))
	var add_result := BackpackModel.add_items(slots_after_materials, [{
		"itemId": output_item_id,
		"count": output_count,
	}])
	if _item_amount_count(add_result.get("added", []), output_item_id) < output_count:
		return {
			"ok": false,
			"profile": normalized,
			"message": "背包空间不足，无法合成%s。" % EquipmentModel.label_for(output_item_id, BackpackModel.label_for(output_item_id)),
		}
	return {
		"ok": true,
		"profile": normalized,
		"message": "%s 可以合成。" % EquipmentSynthesisModel.output_label_for_recipe(recipe),
		"recipeId": recipe_id,
		"outputItemId": output_item_id,
		"outputCount": output_count,
		"materials": EquipmentSynthesisModel.material_entries(recipe),
		"stoneCost": cost,
	}


static func synthesize_equipment(profile: Dictionary, recipe_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var check := can_synthesize_equipment(normalized, recipe_id)
	if not bool(check.get("ok", false)):
		return check
	var recipe := EquipmentSynthesisModel.recipe_for_id(recipe_id)
	var output_item_id := EquipmentSynthesisModel.output_item_id(recipe)
	var output_count := EquipmentSynthesisModel.output_count(recipe)
	var materials := EquipmentSynthesisModel.material_entries(recipe)
	var next_slots := _consume_item_amounts(backpack_slots(normalized), materials)
	var add_result := BackpackModel.add_items(next_slots, [{
		"itemId": output_item_id,
		"count": output_count,
	}])
	next_slots = add_result.get("slots", next_slots)
	var cost := EquipmentSynthesisModel.stone_cost(recipe)
	normalized[BACKPACK_SLOTS_KEY] = next_slots
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(next_slots)
	normalized[STONE_COINS_KEY] = stone_coins(normalized) - cost
	normalized = normalize_profile(normalized)
	var cost_text := "、%d石币" % cost if cost > 0 else ""
	return {
		"ok": true,
		"profile": normalized,
		"message": "合成%s，消耗%s%s。" % [
			EquipmentModel.label_for(output_item_id, BackpackModel.label_for(output_item_id)),
			BackpackModel.item_amounts_text(materials),
			cost_text,
		],
		"recipeId": recipe_id,
		"outputItemId": output_item_id,
		"outputCount": output_count,
		"materials": materials,
		"stoneCost": cost,
	}


static func equipment_change_preview(profile: Dictionary, item_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	if not EquipmentModel.is_equipment(item_id):
		return {}
	var slot_id := EquipmentModel.slot_for(item_id)
	if slot_id == "":
		return {}
	var before_slots := equipment_slots(normalized)
	var current_item_id := str(before_slots.get(slot_id, ""))
	var after_slots := before_slots.duplicate(true)
	after_slots[slot_id] = item_id
	var player := normalized.get("player", {}) as Dictionary
	var player_level := maxi(1, int(player.get("level", 1)))
	var player_rebirth := RebirthModel.rebirth_count(normalized)
	var enhancement := equipment_enhancement(normalized)
	var before_bonus := _equipment_stat_bonus_from_slots(before_slots, equipment_durability(normalized), player_level, player_rebirth, enhancement)
	var after_bonus := _equipment_stat_bonus_from_slots(after_slots, equipment_durability(normalized), player_level, player_rebirth, enhancement)
	var stat_changes: Array[Dictionary] = []
	for key in EquipmentModel.STAT_KEYS:
		var before_value := int(before_bonus.get(key, 0))
		var after_value := int(after_bonus.get(key, 0))
		var delta := after_value - before_value
		if delta == 0:
			continue
		stat_changes.append({
			"key": key,
			"label": EquipmentModel.stat_label_for(key),
			"before": before_value,
			"after": after_value,
			"delta": delta,
		})
	var before_spirits := _equipment_spirit_ids_from_slots(before_slots, equipment_durability(normalized), player_level, player_rebirth)
	var after_spirits := _equipment_spirit_ids_from_slots(after_slots, equipment_durability(normalized), player_level, player_rebirth)
	var gained_spirits: Array[String] = []
	for spirit_id in after_spirits:
		if not before_spirits.has(spirit_id):
			gained_spirits.append(spirit_id)
	var lost_spirits: Array[String] = []
	for spirit_id in before_spirits:
		if not after_spirits.has(spirit_id):
			lost_spirits.append(spirit_id)
	return {
		"slot": slot_id,
		"slotLabel": EquipmentModel.slot_label_for(slot_id),
		"currentItemId": current_item_id,
		"currentItemLabel": EquipmentModel.label_for(current_item_id, "无") if current_item_id != "" else "无",
		"newItemId": item_id,
		"newItemLabel": EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id)),
		"statChanges": stat_changes,
		"gainedSpiritIds": gained_spirits,
		"lostSpiritIds": lost_spirits,
		"unchanged": current_item_id == item_id and stat_changes.is_empty() and gained_spirits.is_empty() and lost_spirits.is_empty(),
	}


static func player_base_stats(profile: Dictionary = {}) -> Dictionary:
	if profile.is_empty():
		return DEFAULT_PLAYER_BATTLE_STATS.duplicate(true)
	var player = profile.get("player", {})
	return _player_base_stats_from_player(player as Dictionary if player is Dictionary else {})


static func player_stat_points(profile: Dictionary) -> int:
	var normalized := normalize_profile(profile)
	var player = normalized.get("player", {})
	var player_dict := player as Dictionary if player is Dictionary else {}
	return maxi(0, int(player_dict.get("statPoints", 0)))


static func player_stat_point_gain_for(stat_key: String) -> int:
	return maxi(1, int(PLAYER_STAT_POINT_GAINS.get(stat_key, 1)))


static func allocate_player_stat_point(profile: Dictionary, stat_key: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var key := stat_key.strip_edges()
	if not PLAYER_STAT_KEYS.has(key):
		return {
			"ok": false,
			"profile": normalized,
			"message": "不能分配这个属性。",
		}
	var player := normalized.get("player", {}) as Dictionary
	var points := maxi(0, int(player.get("statPoints", 0)))
	if points <= 0:
		return {
			"ok": false,
			"profile": normalized,
			"message": "没有可分配属性点。",
		}
	var base_stats := _player_base_stats_from_player(player)
	var gain := player_stat_point_gain_for(key)
	base_stats[key] = maxi(1, int(base_stats.get(key, DEFAULT_PLAYER_BATTLE_STATS.get(key, 1))) + gain)
	player["baseStats"] = base_stats
	player["statPoints"] = points - 1
	if key == "maxHp":
		player["hp"] = maxi(1, int(player.get("hp", DEFAULT_PLAYER_BATTLE_STATS.get("maxHp", 120))) + gain)
	normalized["player"] = player
	normalized = normalize_profile(normalized)
	var label := EquipmentModel.stat_label_for(key)
	var normalized_player := normalized.get("player", {}) as Dictionary
	var normalized_base := normalized_player.get("baseStats", {}) as Dictionary
	var current_base := int(normalized_base.get(key, base_stats.get(key, 0)))
	return {
		"ok": true,
		"profile": normalized,
		"message": "%s 提升到 %d。" % [label, current_base],
		"statKey": key,
		"gain": gain,
	}


static func allocate_player_stat_point_fast(profile: Dictionary, stat_key: String) -> Dictionary:
	var next := profile.duplicate(false)
	var key := stat_key.strip_edges()
	if not PLAYER_STAT_KEYS.has(key):
		return {
			"ok": false,
			"profile": next,
			"message": "不能分配这个属性。",
		}
	var player_value = next.get("player", {})
	var player := (player_value as Dictionary).duplicate(true) if player_value is Dictionary else {}
	var points := maxi(0, int(player.get("statPoints", 0)))
	if points <= 0:
		return {
			"ok": false,
			"profile": next,
			"message": "没有可分配属性点。",
		}
	var base_stats := _player_base_stats_from_player(player)
	var gain := player_stat_point_gain_for(key)
	base_stats[key] = maxi(1, int(base_stats.get(key, DEFAULT_PLAYER_BATTLE_STATS.get(key, 1))) + gain)
	player["baseStats"] = base_stats
	player["statPoints"] = points - 1
	if key == "maxHp":
		player["hp"] = maxi(1, int(player.get("hp", DEFAULT_PLAYER_BATTLE_STATS.get("maxHp", 120))) + gain)
		player["maxHp"] = maxi(1, int(player.get("maxHp", DEFAULT_PLAYER_BATTLE_STATS.get("maxHp", 120))) + gain)
	next["player"] = player
	var label := EquipmentModel.stat_label_for(key)
	return {
		"ok": true,
		"profile": next,
		"message": "%s 提升到 %d。" % [label, int(base_stats.get(key, 0))],
		"statKey": key,
		"gain": gain,
	}


static func player_stat_summary(profile: Dictionary, base_stats: Dictionary = {}) -> Dictionary:
	var normalized_base := _normalize_player_stat_values(base_stats if not base_stats.is_empty() else player_base_stats(profile))
	var raw_bonus := equipment_stat_bonus(profile)
	var normalized_bonus := {}
	var current := {}
	for key in PLAYER_STAT_KEYS:
		var base_value := int(normalized_base.get(key, DEFAULT_PLAYER_BATTLE_STATS.get(key, 1)))
		var bonus_value := int(raw_bonus.get(key, 0))
		normalized_bonus[key] = bonus_value
		current[key] = maxi(1, base_value + bonus_value)
	return {
		"base": normalized_base,
		"bonus": normalized_bonus,
		"current": current,
	}


static func can_equip_item(profile: Dictionary, item_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var item_label := EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id))
	if not EquipmentModel.is_equipment(item_id):
		return {
			"ok": false,
			"message": "%s 不能装备。" % item_label,
		}
	var player := normalized.get("player", {}) as Dictionary
	var player_level := maxi(1, int(player.get("level", 1)))
	var required_level := EquipmentModel.required_level_for(item_id)
	var player_rebirth := RebirthModel.rebirth_count(normalized)
	var required_rebirth := EquipmentModel.required_rebirth_for(item_id)
	if player_level < required_level:
		return {
			"ok": false,
			"message": "%s 需要 Lv%d 才能装备。" % [item_label, required_level],
			"requiredLevel": required_level,
			"playerLevel": player_level,
			"requiredRebirth": required_rebirth,
			"playerRebirth": player_rebirth,
		}
	if player_rebirth < required_rebirth:
		return {
			"ok": false,
			"message": "%s 需要 %s 才能装备。" % [item_label, EquipmentModel.rebirth_label_for(required_rebirth)],
			"requiredLevel": required_level,
			"playerLevel": player_level,
			"requiredRebirth": required_rebirth,
			"playerRebirth": player_rebirth,
		}
	return {
		"ok": true,
		"message": "%s 可以装备。" % item_label,
		"requiredLevel": required_level,
		"playerLevel": player_level,
		"requiredRebirth": required_rebirth,
		"playerRebirth": player_rebirth,
	}


static func equip_item(profile: Dictionary, item_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var item_label := EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id))
	if not EquipmentModel.is_equipment(item_id):
		return {
			"ok": false,
			"profile": normalized,
			"message": "%s 不能装备。" % item_label,
		}
	if BackpackModel.item_count(backpack_slots(normalized), item_id) <= 0:
		return {
			"ok": false,
			"profile": normalized,
			"message": "没有%s。" % item_label,
		}
	var equip_check := can_equip_item(normalized, item_id)
	if not bool(equip_check.get("ok", false)):
		return {
			"ok": false,
			"profile": normalized,
			"message": str(equip_check.get("message", "暂时不能装备。")),
		}
	var slot_id := EquipmentModel.slot_for(item_id)
	if slot_id == "":
		return {
			"ok": false,
			"profile": normalized,
			"message": "%s 没有可用装备槽。" % item_label,
		}
	var slots := equipment_slots(normalized)
	var previous_item_id := str(slots.get(slot_id, ""))
	if previous_item_id == item_id:
		return {
			"ok": false,
			"profile": normalized,
			"message": "%s 已经装备。" % item_label,
		}
	if slot_id == EquipmentModel.SLOT_EXP_PILL and previous_item_id != "" and _exp_pill_charge_has_progress(slots, normalized.get(EQUIPMENT_EXP_PILL_CHARGE_KEY, {})):
		return {
			"ok": false,
			"profile": normalized,
			"message": "经验丹已储存经验，暂不能替换。",
		}
	var backpack_after_take := BackpackModel.consume(BackpackModel.normalize_slots(normalized.get(BACKPACK_SLOTS_KEY, [])), item_id, 1)
	if previous_item_id != "":
		var return_result := BackpackModel.add_items(backpack_after_take, [{
			"itemId": previous_item_id,
			"count": 1,
		}])
		var lost: Array = return_result.get("lost", [])
		if lost is Array and not (lost as Array).is_empty():
			return {
				"ok": false,
				"profile": normalized,
				"message": "背包已满，无法换下%s。" % EquipmentModel.label_for(previous_item_id, BackpackModel.label_for(previous_item_id)),
			}
		backpack_after_take = return_result.get("slots", backpack_after_take)
	slots[slot_id] = item_id
	var durability := equipment_durability(normalized)
	var max_durability := EquipmentModel.max_durability_for(item_id)
	if max_durability > 0:
		durability[slot_id] = max_durability
	else:
		durability.erase(slot_id)
	var enhancement := equipment_enhancement(normalized)
	if EquipmentModel.enhance_max_for(item_id) > 0:
		enhancement[slot_id] = _fresh_equipment_enhancement_record(item_id)
	else:
		enhancement.erase(slot_id)
	var wear_counters := equipment_wear_counters(normalized)
	if max_durability > 0:
		wear_counters[slot_id] = _fresh_equipment_wear_counter_record(item_id)
	else:
		wear_counters.erase(slot_id)
	if slot_id == EquipmentModel.SLOT_EXP_PILL:
		normalized[EQUIPMENT_EXP_PILL_CHARGE_KEY] = _fresh_exp_pill_charge_for_item(item_id)
	normalized[BACKPACK_SLOTS_KEY] = backpack_after_take
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(backpack_after_take)
	normalized[EQUIPMENT_SLOTS_KEY] = slots
	normalized[EQUIPMENT_DURABILITY_KEY] = durability
	normalized[EQUIPMENT_ENHANCEMENT_KEY] = enhancement
	normalized[EQUIPMENT_WEAR_COUNTERS_KEY] = wear_counters
	normalized[EQUIPMENT_SLOTS_VERSION_KEY] = EQUIPMENT_SLOTS_VERSION
	normalized = normalize_profile(normalized)
	var message := "装备%s。" % item_label
	if previous_item_id != "" and previous_item_id != item_id:
		message = "装备%s，换下%s。" % [item_label, EquipmentModel.label_for(previous_item_id, BackpackModel.label_for(previous_item_id))]
	return {
		"ok": true,
		"profile": normalized,
		"message": message,
		"itemId": item_id,
		"slot": slot_id,
		"previousItemId": previous_item_id,
	}


static func unequip_slot(profile: Dictionary, slot_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var slots := equipment_slots(normalized)
	var item_id := str(slots.get(slot_id, ""))
	if item_id == "":
		return {
			"ok": false,
			"profile": normalized,
			"message": "%s 没有装备。" % EquipmentModel.slot_label_for(slot_id),
		}
	if slot_id == EquipmentModel.SLOT_EXP_PILL and _exp_pill_charge_has_progress(slots, normalized.get(EQUIPMENT_EXP_PILL_CHARGE_KEY, {})):
		return {
			"ok": false,
			"profile": normalized,
			"message": "经验丹已储存经验，暂不能卸下。",
		}
	var add_result := BackpackModel.add_items(BackpackModel.normalize_slots(normalized.get(BACKPACK_SLOTS_KEY, [])), [{
		"itemId": item_id,
		"count": 1,
	}])
	var lost: Array = add_result.get("lost", [])
	if lost is Array and not (lost as Array).is_empty():
		return {
			"ok": false,
			"profile": normalized,
			"message": "背包已满，无法卸下%s。" % EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id)),
		}
	slots.erase(slot_id)
	var durability := equipment_durability(normalized)
	durability.erase(slot_id)
	var enhancement := equipment_enhancement(normalized)
	enhancement.erase(slot_id)
	var wear_counters := equipment_wear_counters(normalized)
	wear_counters.erase(slot_id)
	if slot_id == EquipmentModel.SLOT_EXP_PILL:
		normalized[EQUIPMENT_EXP_PILL_CHARGE_KEY] = {}
	normalized[BACKPACK_SLOTS_KEY] = add_result.get("slots", normalized.get(BACKPACK_SLOTS_KEY, []))
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(BackpackModel.normalize_slots(normalized.get(BACKPACK_SLOTS_KEY, [])))
	normalized[EQUIPMENT_SLOTS_KEY] = slots
	normalized[EQUIPMENT_DURABILITY_KEY] = durability
	normalized[EQUIPMENT_ENHANCEMENT_KEY] = enhancement
	normalized[EQUIPMENT_WEAR_COUNTERS_KEY] = wear_counters
	normalized[EQUIPMENT_SLOTS_VERSION_KEY] = EQUIPMENT_SLOTS_VERSION
	normalized = normalize_profile(normalized)
	return {
		"ok": true,
		"profile": normalized,
		"message": "卸下%s。" % EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id)),
		"itemId": item_id,
		"slot": slot_id,
	}


static func battle_item_inventory(profile: Dictionary) -> Dictionary:
	return _battle_item_inventory_from_slots(backpack_slots(profile))


static func with_battle_item_inventory(profile: Dictionary, inventory: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var slots := BackpackModel.set_counts_for_context(
		BackpackModel.normalize_slots(normalized.get(BACKPACK_SLOTS_KEY, [])),
		BackpackModel.CONTEXT_BATTLE_ITEM,
		inventory
	)
	normalized[BACKPACK_SLOTS_KEY] = slots
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(slots)
	return normalized


static func auto_battle_settings(profile: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var slots := normalized.get(EQUIPMENT_SLOTS_KEY, {}) as Dictionary
	var durability := normalized.get(EQUIPMENT_DURABILITY_KEY, {}) as Dictionary
	return AutoBattleSettingsModel.normalize_settings_for_available_spirits(
		normalized.get(AUTO_BATTLE_SETTINGS_KEY, {}),
		_equipment_spirit_ids_from_slots(slots, durability)
	)


static func with_auto_battle_settings(profile: Dictionary, settings: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	normalized[AUTO_BATTLE_SETTINGS_KEY] = AutoBattleSettingsModel.normalize_settings(settings)
	return normalize_profile(normalized)


static func auto_capture_settings(profile: Dictionary) -> Dictionary:
	return AutoCaptureSettingsModel.normalize_settings(normalize_profile(profile).get(AUTO_CAPTURE_SETTINGS_KEY, {}))


static func with_auto_capture_settings(profile: Dictionary, settings: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	normalized[AUTO_CAPTURE_SETTINGS_KEY] = AutoCaptureSettingsModel.normalize_settings(settings)
	return normalize_profile(normalized)


static func pet_skill_slots_for_instance(instance: Dictionary) -> Array[String]:
	return PetTemplateCatalog.normalized_skill_slots(instance.get("activeSkillIds", []), instance.get("petSkillSlots", []))


static func pet_skill_slot_label_for_instance(instance: Dictionary, slot: int, fallback: String = "未配置") -> String:
	var safe_slot := clampi(slot, 1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS)
	var slots := pet_skill_slots_for_instance(instance)
	if safe_slot - 1 < 0 or safe_slot - 1 >= slots.size():
		return fallback
	var skill_id := str(slots[safe_slot - 1])
	return BattleActionCatalog.label_for(skill_id, fallback) if skill_id != "" else fallback


static func pet_skill_slot_options_for_instance(instance: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var slots := pet_skill_slots_for_instance(instance)
	for slot in range(1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS + 1):
		var skill_id := str(slots[slot - 1]) if slot - 1 < slots.size() else ""
		result.append({
			"slot": slot,
			"skillId": skill_id,
			"label": BattleActionCatalog.label_for(skill_id, "未配置") if skill_id != "" else "未配置",
		})
	return result


static func learnable_pet_skill_options(profile: Dictionary, instance_id: String, trainer_id: String = PetSkillTrainingModel.DEFAULT_TRAINER_ID) -> Array[Dictionary]:
	var instance := pet_instance_by_id(profile, instance_id)
	if instance.is_empty():
		return []
	var learned := _valid_unique_pet_skill_ids(instance.get("activeSkillIds", []))
	var result: Array[Dictionary] = []
	for option in PetSkillTrainingModel.skill_options_for_trainer(trainer_id):
		var skill_id := str(option.get("id", ""))
		var next_option := option.duplicate(true)
		next_option["learned"] = learned.has(skill_id)
		next_option["canLearn"] = skill_id != "" and not learned.has(skill_id)
		result.append(next_option)
	return result


static func learn_pet_skill(profile: Dictionary, instance_id: String, skill_id: String, trainer_id: String = PetSkillTrainingModel.DEFAULT_TRAINER_ID) -> Dictionary:
	var normalized := normalize_profile(profile)
	var normalized_skill_id := skill_id.strip_edges()
	var offered := PetSkillTrainingModel.trainer_skill_ids(trainer_id)
	if not offered.has(normalized_skill_id):
		return {"ok": false, "profile": normalized, "message": "这个训练师不会教该技能。"}
	var action := BattleActionCatalog.action_by_id(normalized_skill_id)
	if action.is_empty() or str(action.get("owner", "")) != BattleActionCatalog.OWNER_PET_SKILL:
		return {"ok": false, "profile": normalized, "message": "该技能不能作为宠物技能学习。"}
	var cost := PetSkillTrainingModel.skill_cost(normalized_skill_id)
	if stone_coins(normalized) < cost:
		return {
			"ok": false,
			"profile": normalized,
			"message": "石币不足，需要%d石币。" % cost,
		}
	var instances: Array = normalized.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("instanceId", "")) != instance_id:
			instances[index] = instance
			continue
		var learned := _valid_unique_pet_skill_ids(instance.get("activeSkillIds", []))
		if learned.has(normalized_skill_id):
			return {
				"ok": false,
				"profile": normalized,
				"message": "%s 已经学会%s。" % [str(instance.get("name", "宠物")), BattleActionCatalog.label_for(normalized_skill_id, normalized_skill_id)],
			}
		var slots := pet_skill_slots_for_instance(instance)
		var empty_slot := _first_empty_pet_skill_slot(slots)
		if empty_slot <= 0:
			return {"ok": false, "profile": normalized, "message": "技能栏满，请先调整。"}
		learned.append(normalized_skill_id)
		slots[empty_slot - 1] = normalized_skill_id
		var forgotten := _valid_unique_pet_skill_ids(instance.get("forgottenSkillIds", []))
		forgotten.erase(normalized_skill_id)
		instance["activeSkillIds"] = learned
		instance["forgottenSkillIds"] = forgotten
		instance["petSkillSlots"] = PetTemplateCatalog.normalized_skill_slots(learned, slots)
		instances[index] = instance
		normalized["petInstances"] = instances
		normalized[STONE_COINS_KEY] = maxi(0, stone_coins(normalized) - cost)
		normalized = normalize_profile(normalized)
		return {
			"ok": true,
			"profile": normalized,
			"message": "%s 学会了%s。" % [str(instance.get("name", "宠物")), BattleActionCatalog.label_for(normalized_skill_id, normalized_skill_id)],
			"skillId": normalized_skill_id,
			"slot": empty_slot,
		}
	return {"ok": false, "profile": normalized, "message": "没有找到这只宠物。"}


static func can_forget_pet_skill(profile: Dictionary, instance_id: String, skill_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var normalized_skill_id := skill_id.strip_edges()
	if normalized_skill_id == "":
		return {"ok": false, "profile": normalized, "message": "请选择要遗忘的技能。"}
	if PET_BASE_SKILL_IDS.has(normalized_skill_id):
		return {"ok": false, "profile": normalized, "message": "攻击和防御不能遗忘。"}
	var action := BattleActionCatalog.action_by_id(normalized_skill_id)
	if action.is_empty() or str(action.get("owner", "")) != BattleActionCatalog.OWNER_PET_SKILL:
		return {"ok": false, "profile": normalized, "message": "该技能不能遗忘。"}
	var instance := pet_instance_by_id(normalized, instance_id)
	if instance.is_empty():
		return {"ok": false, "profile": normalized, "message": "没有找到这只宠物。"}
	var learned := _valid_unique_pet_skill_ids(instance.get("activeSkillIds", []))
	if not learned.has(normalized_skill_id):
		return {
			"ok": false,
			"profile": normalized,
			"message": "%s 没有学会%s。" % [
				str(instance.get("name", "宠物")),
				BattleActionCatalog.label_for(normalized_skill_id, normalized_skill_id),
			],
		}
	return {
		"ok": true,
		"profile": normalized,
		"message": "%s 可以遗忘%s。" % [
			str(instance.get("name", "宠物")),
			BattleActionCatalog.label_for(normalized_skill_id, normalized_skill_id),
		],
	}


static func forget_pet_skill(profile: Dictionary, instance_id: String, skill_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var check := can_forget_pet_skill(normalized, instance_id, skill_id)
	if not bool(check.get("ok", false)):
		return check
	var normalized_skill_id := skill_id.strip_edges()
	var instances: Array = normalized.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("instanceId", "")) != instance_id:
			instances[index] = instance
			continue
		var learned := _valid_unique_pet_skill_ids(instance.get("activeSkillIds", []))
		learned.erase(normalized_skill_id)
		var forgotten := _valid_unique_pet_skill_ids(instance.get("forgottenSkillIds", []))
		if not forgotten.has(normalized_skill_id):
			forgotten.append(normalized_skill_id)
		var slots := pet_skill_slots_for_instance(instance)
		for slot_index in range(slots.size()):
			if str(slots[slot_index]) == normalized_skill_id:
				slots[slot_index] = ""
		instance["activeSkillIds"] = learned
		instance["forgottenSkillIds"] = forgotten
		instance["petSkillSlots"] = PetTemplateCatalog.normalized_skill_slots(learned, slots)
		instances[index] = instance
		normalized["petInstances"] = instances
		normalized = normalize_profile(normalized)
		return {
			"ok": true,
			"profile": normalized,
			"message": "%s 遗忘了%s。" % [
				str(instance.get("name", "宠物")),
				BattleActionCatalog.label_for(normalized_skill_id, normalized_skill_id),
			],
			"skillId": normalized_skill_id,
		}
	return {"ok": false, "profile": normalized, "message": "没有找到这只宠物。"}


static func move_pet_skill_slot(profile: Dictionary, instance_id: String, slot: int, direction: int) -> Dictionary:
	var target_slot := clampi(slot + direction, 1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS)
	return swap_pet_skill_slots(profile, instance_id, slot, target_slot)


static func swap_pet_skill_slots(profile: Dictionary, instance_id: String, slot_a: int, slot_b: int) -> Dictionary:
	var normalized := normalize_profile(profile)
	var safe_a := clampi(slot_a, 1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS)
	var safe_b := clampi(slot_b, 1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS)
	if safe_a == safe_b:
		return {"ok": false, "profile": normalized, "message": "已经在这个技能位。"}
	var instances: Array = normalized.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("instanceId", "")) != instance_id:
			instances[index] = instance
			continue
		var slots := pet_skill_slots_for_instance(instance)
		if safe_a - 1 >= slots.size() or str(slots[safe_a - 1]) == "":
			return {"ok": false, "profile": normalized, "message": "这个技能位还没有技能。"}
		var skill_id := str(slots[safe_a - 1])
		var temp := str(slots[safe_b - 1]) if safe_b - 1 < slots.size() else ""
		slots[safe_b - 1] = skill_id
		slots[safe_a - 1] = temp
		instance["petSkillSlots"] = PetTemplateCatalog.normalized_skill_slots(instance.get("activeSkillIds", []), slots)
		instances[index] = instance
		normalized["petInstances"] = instances
		normalized = normalize_profile(normalized)
		return {
			"ok": true,
			"profile": normalized,
			"message": "%s 已移动到技%d。" % [BattleActionCatalog.label_for(skill_id, skill_id), safe_b],
			"slot": safe_b,
		}
	return {"ok": false, "profile": normalized, "message": "没有找到这只宠物。"}


static func hang_settings(profile: Dictionary) -> Dictionary:
	return HangSettingsModel.normalize_settings(normalize_profile(profile).get(HANG_SETTINGS_KEY, {}))


static func with_hang_settings(profile: Dictionary, settings: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	normalized[HANG_SETTINGS_KEY] = HangSettingsModel.normalize_settings(settings)
	return normalize_profile(normalized)


static func player_hp(profile: Dictionary) -> int:
	var normalized := normalize_profile(profile)
	var player = normalized.get("player", {})
	var player_dict := player as Dictionary if player is Dictionary else {}
	return clampi(int(player_dict.get("hp", player_max_hp(normalized))), 1, player_max_hp(normalized))


static func player_max_hp(profile: Dictionary) -> int:
	var normalized := normalize_profile(profile)
	var player = normalized.get("player", {})
	var player_dict := player as Dictionary if player is Dictionary else {}
	return maxi(1, int(player_dict.get("maxHp", DEFAULT_PLAYER_BATTLE_STATS.get("maxHp", 120))))


static func with_player_hp(profile: Dictionary, hp: int) -> Dictionary:
	var normalized := normalize_profile(profile)
	var player = normalized.get("player", {}) as Dictionary
	player["hp"] = clampi(hp, 1, player_max_hp(normalized))
	normalized["player"] = player
	return normalize_profile(normalized)


static func training_partners(profile: Dictionary) -> Array[Dictionary]:
	return TrainingPartnerModel.normalize_partners(normalize_profile(profile).get(TRAINING_PARTNERS_KEY, []))


static func training_partner_count(profile: Dictionary) -> int:
	return training_partners(profile).size()


static func with_training_partner_count(profile: Dictionary, count: int) -> Dictionary:
	var normalized := normalize_profile(profile)
	var target_count := TrainingPartnerModel.clamp_partner_count(count)
	var partners := TrainingPartnerModel.normalize_partners(normalized.get(TRAINING_PARTNERS_KEY, []))
	while partners.size() > target_count:
		partners.pop_back()
	while partners.size() < target_count:
		partners.append(_create_training_partner_from_profile(normalized, partners.size()))
	normalized[TRAINING_PARTNERS_KEY] = partners
	return normalize_profile(normalized)


static func training_partner_summary_lines(profile: Dictionary) -> Array[String]:
	return TrainingPartnerModel.summary_lines(training_partners(profile))


static func _create_training_partner_from_profile(profile: Dictionary, index: int) -> Dictionary:
	var normalized := normalize_profile(profile)
	var player = normalized.get("player", {}) as Dictionary
	var summary := player_stat_summary(normalized)
	var current = summary.get("current", {}) as Dictionary
	var partner := {
		"partnerId": TrainingPartnerModel.partner_id_for_index(index),
		"name": TrainingPartnerModel.partner_name_for_index(index),
		"level": maxi(1, int(player.get("level", 1))),
		"exp": 0,
		"nextExp": exp_to_next_level(maxi(1, int(player.get("level", 1)))),
		"hp": maxi(1, int(current.get("maxHp", DEFAULT_PLAYER_BATTLE_STATS.get("maxHp", 120)))),
		"maxHp": maxi(1, int(current.get("maxHp", DEFAULT_PLAYER_BATTLE_STATS.get("maxHp", 120)))),
		"attack": maxi(1, int(current.get("attack", DEFAULT_PLAYER_BATTLE_STATS.get("attack", 18)))),
		"defense": maxi(1, int(current.get("defense", DEFAULT_PLAYER_BATTLE_STATS.get("defense", 6)))),
		"quick": maxi(1, int(current.get("quick", DEFAULT_PLAYER_BATTLE_STATS.get("quick", 70)))),
		"slotNumber": TrainingPartnerModel.slot_number_for_index(index),
	}
	var active := _active_profile_pet(normalized)
	if active.is_empty():
		active = _pet_instance_from_form(
			"training_partner_source_pet",
			"布伊",
			"bui_normal_red_fire10",
			PET_STATE_BATTLE,
			maxi(1, int(player.get("level", 1)))
		)
	var pet := active.duplicate(true)
	pet["name"] = TrainingPartnerModel.partner_pet_name_for_index(index, str(active.get("name", "布伊")))
	pet["level"] = maxi(1, int(active.get("level", partner.get("level", 1))))
	pet["exp"] = 0
	pet["nextExp"] = exp_to_next_level(int(pet.get("level", 1)))
	pet["hp"] = maxi(1, int(active.get("maxHp", active.get("hp", 90))))
	pet["maxHp"] = maxi(1, int(active.get("maxHp", active.get("hp", 90))))
	for key in ["attack", "defense", "quick"]:
		pet[key] = maxi(1, int(active.get(key, 1)))
	partner["pet"] = pet
	return TrainingPartnerModel.normalize_partner(partner, index)


static func stone_coins(profile: Dictionary) -> int:
	return maxi(0, int(normalize_profile(profile).get(STONE_COINS_KEY, DEFAULT_STONE_COINS)))


static func with_stone_coins(profile: Dictionary, amount: int) -> Dictionary:
	var normalized := normalize_profile(profile)
	normalized[STONE_COINS_KEY] = maxi(0, amount)
	return normalized


static func diamonds(profile: Dictionary) -> int:
	return maxi(0, int(normalize_profile(profile).get(DIAMONDS_KEY, DEFAULT_DIAMONDS)))


static func with_diamonds(profile: Dictionary, amount: int) -> Dictionary:
	var normalized := normalize_profile(profile)
	normalized[DIAMONDS_KEY] = maxi(0, amount)
	return normalized


static func grant_reward_bundle(profile: Dictionary, reward_bundle: Dictionary, source_id: String = "", mail_title: String = "系统奖励") -> Dictionary:
	var normalized := normalize_profile(profile)
	var items := _item_amount_array(reward_bundle.get("items", []))
	var coins := maxi(0, int(reward_bundle.get("stoneCoins", 0)))
	var diamond_reward := maxi(0, int(reward_bundle.get("diamonds", 0)))
	if coins > 0:
		normalized[STONE_COINS_KEY] = stone_coins(normalized) + coins
	if diamond_reward > 0:
		normalized[DIAMONDS_KEY] = diamonds(normalized) + diamond_reward
	var reward_result := BackpackModel.add_items(BackpackModel.normalize_slots(normalized.get(BACKPACK_SLOTS_KEY, [])), items)
	var added_items := _item_amount_array(reward_result.get("added", []))
	var mailed_items := _item_amount_array(reward_result.get("lost", []))
	normalized[BACKPACK_SLOTS_KEY] = reward_result.get("slots", normalized.get(BACKPACK_SLOTS_KEY, []))
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(BackpackModel.normalize_slots(normalized.get(BACKPACK_SLOTS_KEY, [])))
	if not mailed_items.is_empty():
		var mail_id := "%s:%s" % [MAIL_REWARD_FALLBACK_PREFIX, _safe_mail_id_source(source_id)]
		var title := mail_title if mail_title.strip_edges() != "" else "系统奖励"
		var body := "背包空间不足，未放入背包的奖励已转入邮箱。请在30天内领取附件。"
		normalized[MAILBOX_MESSAGES_KEY] = _upsert_mailbox_message(_normalize_mailbox_messages(normalized.get(MAILBOX_MESSAGES_KEY, [])), mail_id, title, body, mailed_items)
	var raw_abilities = reward_bundle.get("abilities", reward_bundle.get("unlockAbilities", []))
	if raw_abilities is Array:
		var abilities := _valid_unique_ability_ids(normalized.get(UNLOCKED_ABILITIES_KEY, []))
		for ability in raw_abilities:
			var ability_id := ""
			if ability is Dictionary:
				ability_id = str((ability as Dictionary).get("abilityId", (ability as Dictionary).get("id", ""))).strip_edges()
			else:
				ability_id = str(ability).strip_edges()
			if ability_id != "" and not abilities.has(ability_id):
				abilities.append(ability_id)
		normalized[UNLOCKED_ABILITIES_KEY] = abilities
	normalized = normalize_profile(normalized)
	return {
		"profile": normalized,
		"stoneCoins": coins,
		"diamonds": diamond_reward,
		"addedItems": added_items,
		"mailedItems": mailed_items,
		"mailSent": not mailed_items.is_empty(),
	}


static func unlock_backpack_slot(profile: Dictionary, requested_extra_slot_index: int = -1) -> Dictionary:
	var normalized := normalize_profile(profile)
	var extra_slots := clampi(int(normalized.get(BACKPACK_EXTRA_SLOTS_KEY, 0)), 0, BackpackModel.EXTRA_SLOT_LIMIT)
	if extra_slots >= BackpackModel.EXTRA_SLOT_LIMIT:
		return {"ok": false, "profile": normalized, "message": "扩展背包位已全部解锁。"}
	if requested_extra_slot_index >= 0 and requested_extra_slot_index != extra_slots:
		return {"ok": false, "profile": normalized, "message": "请先解锁前一个扩展背包位。"}
	var cost := BackpackModel.unlock_cost_for_extra_slot(extra_slots)
	var current_diamonds := diamonds(normalized)
	if current_diamonds < cost:
		return {
			"ok": false,
			"profile": normalized,
			"message": "钻石不足，还需要 %d 钻石。" % maxi(0, cost - current_diamonds),
			"cost": cost,
		}
	var next_extra_slots := extra_slots + 1
	normalized[DIAMONDS_KEY] = current_diamonds - cost
	normalized[BACKPACK_EXTRA_SLOTS_KEY] = next_extra_slots
	normalized[BACKPACK_SLOTS_KEY] = BackpackModel.normalize_slots(
		normalized.get(BACKPACK_SLOTS_KEY, []),
		BackpackModel.unlocked_slot_count(next_extra_slots)
	)
	normalized = normalize_profile(normalized)
	return {
		"ok": true,
		"profile": normalized,
		"message": "已消耗 %d 钻石，解锁第 %d 个扩展背包位。" % [cost, next_extra_slots],
		"cost": cost,
	}


static func village_healer_missing_hp(profile: Dictionary) -> int:
	var normalized := normalize_profile(profile)
	var missing := maxi(0, player_max_hp(normalized) - player_hp(normalized))
	for instance in party_pet_instances(normalized):
		missing += _missing_hp_for_pet_instance(instance)
	return missing


static func village_healer_cost_for_missing_hp(missing_hp: int) -> int:
	var missing := maxi(0, missing_hp)
	if missing <= 0:
		return 0
	return maxi(1, int(ceil(float(missing) / float(VILLAGE_HEAL_HP_PER_COIN))))


static func village_healer_quote(profile: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var missing := village_healer_missing_hp(normalized)
	var cost := village_healer_cost_for_missing_hp(missing)
	var coins := stone_coins(normalized)
	var message := "队伍生命已满。"
	if missing > 0 and coins < cost:
		message = "石币不足，无法治疗。"
	elif missing > 0:
		message = "预计费用 %d 石币。" % cost
	return {
		"missingHp": missing,
		"cost": cost,
		"stoneCoins": coins,
		"canHeal": missing > 0 and coins >= cost,
		"message": message,
	}


static func apply_village_healer(profile: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var quote := village_healer_quote(normalized)
	var missing := int(quote.get("missingHp", 0))
	var cost := int(quote.get("cost", 0))
	if missing <= 0:
		return {
			"ok": false,
			"profile": normalized,
			"message": "队伍生命已满。",
			"heal": 0,
			"cost": 0,
		}
	if stone_coins(normalized) < cost:
		return {
			"ok": false,
			"profile": normalized,
			"message": "石币不足，无法治疗。",
			"heal": 0,
			"cost": cost,
		}

	var healed_units := 0
	var player = normalized.get("player", {}) as Dictionary
	var player_max := player_max_hp(normalized)
	if player_hp(normalized) < player_max:
		player["hp"] = player_max
		healed_units += 1
	normalized["player"] = player

	var instances: Array = normalized.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("state", PET_STATE_STANDBY)) == PET_STATE_STORAGE:
			instances[index] = instance
			continue
		var max_hp := maxi(1, int(instance.get("maxHp", 1)))
		var hp := clampi(int(instance.get("hp", max_hp)), 0, max_hp)
		if hp < max_hp:
			instance["hp"] = max_hp
			healed_units += 1
		instances[index] = instance
	normalized["petInstances"] = instances
	normalized[STONE_COINS_KEY] = stone_coins(normalized) - cost
	normalized = normalize_profile(normalized)
	return {
		"ok": true,
		"profile": normalized,
		"message": "村医治疗完成，恢复%d生命，花费%d石币。" % [missing, cost],
		"heal": missing,
		"cost": cost,
		"healedUnits": healed_units,
	}


static func active_quest_id(profile: Dictionary) -> String:
	return str(normalize_profile(profile).get(ACTIVE_QUEST_ID_KEY, ""))


static func active_quest(profile: Dictionary) -> Dictionary:
	return QuestModel.quest_for_id(active_quest_id(profile))


static func active_quest_state(profile: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var quest_id := str(normalized.get(ACTIVE_QUEST_ID_KEY, ""))
	var states := _quest_states(normalized)
	return QuestModel.normalize_state(states.get(quest_id, {}), quest_id)


static func active_quest_auto_claim(profile: Dictionary) -> bool:
	var quest := active_quest(profile)
	return QuestModel.auto_claim_on_ready(quest) and not QuestModel.has_reward_choices(quest)


static func active_quest_has_reward_choices(profile: Dictionary) -> bool:
	return QuestModel.has_reward_choices(active_quest(profile))


static func active_quest_turn_in_id(profile: Dictionary) -> String:
	return QuestModel.turn_in_id_for(active_quest(profile))


static func can_claim_active_quest(profile: Dictionary) -> bool:
	var quest := active_quest(profile)
	if quest.is_empty():
		return false
	return str(active_quest_state(profile).get("status", QuestModel.STATUS_ACTIVE)) == QuestModel.STATUS_READY


static func quest_progress_text(profile: Dictionary) -> String:
	var normalized := normalize_profile(profile)
	var quest_id := str(normalized.get(ACTIVE_QUEST_ID_KEY, ""))
	var quest := QuestModel.quest_for_id(quest_id)
	if quest.is_empty():
		return "当前没有任务"
	return QuestModel.progress_text_for_state(quest, _quest_states(normalized).get(quest_id, {}))


static func quest_reward_text(profile: Dictionary) -> String:
	var quest := active_quest(profile)
	if quest.is_empty():
		return ""
	return QuestModel.reward_text(quest)


static func quest_available_for_profile(profile: Dictionary, quest: Dictionary) -> bool:
	return _quest_available_for_profile(quest, normalize_profile(profile))


static func optional_quest_for_interaction(profile: Dictionary, interaction_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var item_id := str(interaction_id).strip_edges()
	if item_id == "":
		return {}
	var states := _quest_states(normalized)
	for quest in QuestModel.quests():
		if not QuestModel.is_optional(quest):
			continue
		var quest_id := str(quest.get("id", ""))
		if quest_id == "":
			continue
		var state := QuestModel.normalize_state(states.get(quest_id, {}), quest_id)
		if states.has(quest_id) and str(state.get("status", QuestModel.STATUS_ACTIVE)) == QuestModel.STATUS_CLAIMED:
			continue
		if not _quest_interaction_matches(quest, item_id):
			continue
		if _quest_available_for_profile(quest, normalized):
			return quest
	return {}


static func blocked_optional_quest_for_interaction(profile: Dictionary, interaction_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var item_id := str(interaction_id).strip_edges()
	if item_id == "":
		return {}
	var states := _quest_states(normalized)
	for quest in QuestModel.quests():
		if not QuestModel.is_optional(quest):
			continue
		var quest_id := str(quest.get("id", ""))
		if quest_id == "":
			continue
		var state := QuestModel.normalize_state(states.get(quest_id, {}), quest_id)
		if states.has(quest_id) and str(state.get("status", QuestModel.STATUS_ACTIVE)) == QuestModel.STATUS_CLAIMED:
			continue
		if not _quest_interaction_matches(quest, item_id):
			continue
		var required_missing_ability := str(quest.get("requiredMissingAbility", quest.get("requiresMissingAbility", ""))).strip_edges()
		if required_missing_ability != "" and _valid_unique_ability_ids(normalized.get(UNLOCKED_ABILITIES_KEY, [])).has(required_missing_ability):
			continue
		if not _quest_available_for_profile(quest, normalized):
			return quest
	return {}


static func can_claim_optional_quest(profile: Dictionary, quest_id: String) -> bool:
	var normalized := normalize_profile(profile)
	var quest := QuestModel.quest_for_id(quest_id)
	if quest.is_empty() or not QuestModel.is_optional(quest):
		return false
	var states := _quest_states(normalized)
	var state := QuestModel.normalize_state(states.get(quest_id, {}), quest_id)
	return str(state.get("status", QuestModel.STATUS_ACTIVE)) == QuestModel.STATUS_READY


static func record_optional_quest_event(profile: Dictionary, quest_id: String, event: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var quest := QuestModel.quest_for_id(quest_id)
	if quest.is_empty() or not QuestModel.is_optional(quest) or not _quest_available_for_profile(quest, normalized):
		return {
			"profile": normalized,
			"changed": false,
			"ready": false,
			"questId": "",
			"message": "",
		}
	var states := _quest_states(normalized)
	var state := QuestModel.normalize_state(states.get(quest_id, {}), quest_id)
	if str(state.get("status", QuestModel.STATUS_ACTIVE)) != QuestModel.STATUS_ACTIVE:
		return {
			"profile": normalized,
			"changed": false,
			"ready": str(state.get("status", "")) == QuestModel.STATUS_READY,
			"questId": quest_id,
			"message": "",
		}
	var progress_amount := QuestModel.progress_amount_for_event(quest, event)
	if progress_amount <= 0:
		return {
			"profile": normalized,
			"changed": false,
			"ready": false,
			"questId": quest_id,
			"message": "",
		}
	var required := QuestModel.objective_required_count(quest)
	var next_progress := clampi(int(state.get("progress", 0)) + progress_amount, 0, required)
	state["progress"] = next_progress
	var ready := next_progress >= required
	if ready:
		state["status"] = QuestModel.STATUS_READY
	states[quest_id] = state
	normalized[QUEST_STATES_KEY] = states
	normalized = normalize_profile(normalized)
	var message := "任务完成：%s。" % QuestModel.title_for(quest) if ready else "任务更新：%s。" % QuestModel.progress_text_for_state(quest, state)
	return {
		"profile": normalized,
		"changed": true,
		"ready": ready,
		"questId": quest_id,
		"title": QuestModel.title_for(quest),
		"message": message,
	}


static func claim_optional_quest(profile: Dictionary, quest_id: String, reward_choice_id: String = "") -> Dictionary:
	var quest := QuestModel.quest_for_id(quest_id)
	if quest.is_empty() or not QuestModel.is_optional(quest):
		return {
			"ok": false,
			"profile": normalize_profile(profile),
			"message": "当前没有可领取的任务奖励。",
		}
	return _claim_quest_by_id(profile, quest_id, reward_choice_id, false)


static func quest_state_for_id(profile: Dictionary, quest_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	return QuestModel.normalize_state(_quest_states(normalized).get(quest_id, {}), quest_id)


static func record_quest_event(profile: Dictionary, event: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var quest_id := str(normalized.get(ACTIVE_QUEST_ID_KEY, ""))
	var quest := QuestModel.quest_for_id(quest_id)
	if quest.is_empty():
		return {
			"profile": normalized,
			"changed": false,
			"ready": false,
			"questId": "",
			"message": "",
		}
	var states := _quest_states(normalized)
	var state := QuestModel.normalize_state(states.get(quest_id, {}), quest_id)
	if str(state.get("status", QuestModel.STATUS_ACTIVE)) != QuestModel.STATUS_ACTIVE:
		return {
			"profile": normalized,
			"changed": false,
			"ready": str(state.get("status", "")) == QuestModel.STATUS_READY,
			"questId": quest_id,
			"message": "",
		}
	var progress_amount := QuestModel.progress_amount_for_event(quest, event)
	if progress_amount <= 0:
		return {
			"profile": normalized,
			"changed": false,
			"ready": false,
			"questId": quest_id,
			"message": "",
		}
	var required := QuestModel.objective_required_count(quest)
	var next_progress := clampi(int(state.get("progress", 0)) + progress_amount, 0, required)
	state["progress"] = next_progress
	var ready := next_progress >= required
	if ready:
		state["status"] = QuestModel.STATUS_READY
	states[quest_id] = state
	normalized[QUEST_STATES_KEY] = states
	normalized = normalize_profile(normalized)
	var message := "任务完成：%s。" % QuestModel.title_for(quest) if ready else "任务更新：%s。" % QuestModel.progress_text_for_state(quest, state)
	return {
		"profile": normalized,
		"changed": true,
		"ready": ready,
		"questId": quest_id,
		"title": QuestModel.title_for(quest),
		"message": message,
	}


static func deliver_pet_for_quest(profile: Dictionary, quest_id: String, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var quest := QuestModel.quest_for_id(quest_id)
	if quest.is_empty():
		return {
			"ok": false,
			"profile": normalized,
			"message": "任务不存在。",
		}
	var instance := pet_instance_by_id(normalized, instance_id)
	if instance.is_empty():
		return {
			"ok": false,
			"profile": normalized,
			"message": "没有找到这只宠物。",
		}
	var event := {
		"type": "deliver_pet",
		"instanceId": instance_id,
		"formId": str(instance.get("formId", instance.get("templateId", ""))),
		"lineId": str(instance.get("lineId", "")),
		"level": maxi(1, int(instance.get("level", 1))),
		"amount": 1,
	}
	if QuestModel.progress_amount_for_event(quest, event) <= 0:
		return {
			"ok": false,
			"profile": normalized,
			"message": "%s 不符合任务要求。" % str(instance.get("name", "宠物")),
		}
	var instances: Array = normalized.get("petInstances", [])
	var next_instances: Array = []
	for value in instances:
		if value is Dictionary and str((value as Dictionary).get("instanceId", "")) == instance_id:
			continue
		next_instances.append(value)
	normalized["petInstances"] = next_instances
	if str(normalized.get("activePetInstanceId", "")) == instance_id:
		normalized["activePetInstanceId"] = _first_battle_pet_id(normalized)
	var states := _quest_states(normalized)
	var state := QuestModel.normalize_state(states.get(quest_id, {}), quest_id)
	if str(state.get("status", QuestModel.STATUS_ACTIVE)) == QuestModel.STATUS_ACTIVE:
		var required := QuestModel.objective_required_count(quest)
		state["progress"] = clampi(int(state.get("progress", 0)) + 1, 0, required)
		if int(state.get("progress", 0)) >= required:
			state["status"] = QuestModel.STATUS_READY
		states[quest_id] = state
		normalized[QUEST_STATES_KEY] = states
	normalized = normalize_profile(normalized)
	return {
		"ok": true,
		"profile": normalized,
		"ready": str(state.get("status", "")) == QuestModel.STATUS_READY,
		"questId": quest_id,
		"message": "交付%s。" % str(instance.get("name", "宠物")),
	}


static func claim_active_quest(profile: Dictionary, reward_choice_id: String = "") -> Dictionary:
	var normalized := normalize_profile(profile)
	var quest_id := str(normalized.get(ACTIVE_QUEST_ID_KEY, ""))
	return _claim_quest_by_id(normalized, quest_id, reward_choice_id, true)


static func _claim_quest_by_id(profile: Dictionary, quest_id: String, reward_choice_id: String = "", advance_active: bool = true) -> Dictionary:
	var normalized := normalize_profile(profile)
	var quest := QuestModel.quest_for_id(quest_id)
	if quest.is_empty():
		return {
			"ok": false,
			"profile": normalized,
			"message": "当前没有可领取的任务奖励。",
		}
	var states := _quest_states(normalized)
	var state := QuestModel.normalize_state(states.get(quest_id, {}), quest_id)
	if str(state.get("status", QuestModel.STATUS_ACTIVE)) != QuestModel.STATUS_READY:
		return {
			"ok": false,
			"profile": normalized,
			"message": "任务还没有完成。",
		}
	var reward_items := QuestModel.reward_items(quest)
	var reward_abilities := QuestModel.reward_abilities(quest)
	var choice := {}
	var choices := QuestModel.reward_choices(quest)
	if not choices.is_empty():
		choice = QuestModel.reward_choice_for_id(quest, reward_choice_id)
		if choice.is_empty():
			return {
				"ok": false,
				"profile": normalized,
				"message": "请选择任务奖励。",
				"requiresChoice": true,
			}
		var choice_items = choice.get("items", [])
		if choice_items is Array:
			for item in choice_items:
				if item is Dictionary:
					reward_items.append((item as Dictionary).duplicate(true))
		var choice_abilities = choice.get("abilities", [])
		if choice_abilities is Array:
			for ability in choice_abilities:
				if ability is Dictionary:
					reward_abilities.append((ability as Dictionary).duplicate(true))
	var coins := QuestModel.reward_stone_coins(quest) + maxi(0, int(choice.get("stoneCoins", 0)))
	var grant_result := grant_reward_bundle(normalized, {
		"stoneCoins": coins,
		"items": reward_items,
		"abilities": reward_abilities,
	}, "quest_%s" % quest_id, "任务奖励：%s" % QuestModel.title_for(quest))
	normalized = grant_result.get("profile", normalized)
	state["status"] = QuestModel.STATUS_CLAIMED
	state["progress"] = QuestModel.objective_required_count(quest)
	states[quest_id] = state
	var next_id := QuestModel.next_quest_id(quest)
	if advance_active and str(normalized.get(ACTIVE_QUEST_ID_KEY, "")) == quest_id:
		if next_id != "":
			if not states.has(next_id):
				states[next_id] = QuestModel.normalize_state({}, next_id)
			normalized[ACTIVE_QUEST_ID_KEY] = next_id
		else:
			normalized[ACTIVE_QUEST_ID_KEY] = ""
	normalized[QUEST_STATES_KEY] = states
	var rebirth_target := QuestModel.rebirth_completion_target(quest)
	if rebirth_target > 0:
		normalized = RebirthModel.with_rebirth_quest_completed(normalized, rebirth_target, true)
	normalized = normalize_profile(normalized)
	var reward_text := QuestModel.reward_claim_text(quest, choice)
	var message := "完成任务「%s」。" % QuestModel.title_for(quest)
	if reward_text != "":
		message = "完成任务「%s」，获得%s。" % [QuestModel.title_for(quest), reward_text]
	var mailed_items := _item_amount_array(grant_result.get("mailedItems", []))
	if not mailed_items.is_empty():
		message += " 背包已满，%s 已发送邮箱。" % BackpackModel.item_amounts_text(mailed_items)
	if rebirth_target > 0:
		var stage_text := RebirthModel.target_stage_label(rebirth_target)
		message = "完成任务「%s」，%s资格已记录。" % [QuestModel.title_for(quest), stage_text]
	return {
		"ok": true,
		"profile": normalized,
		"message": message,
		"questId": quest_id,
		"nextQuestId": next_id,
		"rewardChoiceId": str(choice.get("id", "")),
		"mailedItems": mailed_items,
	}


static func buy_shop_item(profile: Dictionary, shop_id: String, item_id: String, amount: int = 1) -> Dictionary:
	var normalized := normalize_profile(profile)
	var item_label := BackpackModel.label_for(item_id)
	var buy_amount := maxi(1, amount)
	if not ShopCatalogModel.is_buyable(shop_id, item_id):
		return {
			"ok": false,
			"profile": normalized,
			"message": "%s 暂时不能购买。" % item_label,
		}
	var price := ShopCatalogModel.buy_price_for(shop_id, item_id)
	var total_price := price * buy_amount
	if stone_coins(normalized) < total_price:
		return {
			"ok": false,
			"profile": normalized,
			"message": "石币不够。",
		}
	var add_result := BackpackModel.add_items(BackpackModel.normalize_slots(normalized.get(BACKPACK_SLOTS_KEY, [])), [{
		"itemId": item_id,
		"count": buy_amount,
	}])
	if _item_amount_count(add_result.get("added", []), item_id) < buy_amount:
		return {
			"ok": false,
			"profile": normalized,
			"message": "背包已满。",
		}
	var next_slots: Array[Dictionary] = add_result.get("slots", [])
	normalized[BACKPACK_SLOTS_KEY] = next_slots
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(next_slots)
	normalized[STONE_COINS_KEY] = stone_coins(normalized) - total_price
	normalized = normalize_profile(normalized)
	return {
		"ok": true,
		"profile": normalized,
		"message": "购买%s x%d，花费%d石币。" % [item_label, buy_amount, total_price],
		"itemId": item_id,
		"amount": buy_amount,
		"price": total_price,
	}


static func sell_shop_item(profile: Dictionary, shop_id: String, item_id: String, amount: int = 1) -> Dictionary:
	var normalized := normalize_profile(profile)
	var item_label := BackpackModel.label_for(item_id)
	var sell_amount := maxi(1, amount)
	if not ShopCatalogModel.is_sellable(shop_id, item_id):
		return {
			"ok": false,
			"profile": normalized,
			"message": "%s 不能出售。" % item_label,
		}
	var held_count := BackpackModel.item_count(backpack_slots(normalized), item_id)
	if held_count < sell_amount:
		return {
			"ok": false,
			"profile": normalized,
			"message": "%s 数量不够。" % item_label,
		}
	var price := ShopCatalogModel.sell_price_for(shop_id, item_id)
	var total_price := price * sell_amount
	var next_slots := BackpackModel.consume(BackpackModel.normalize_slots(normalized.get(BACKPACK_SLOTS_KEY, [])), item_id, sell_amount)
	normalized[BACKPACK_SLOTS_KEY] = next_slots
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(next_slots)
	normalized[STONE_COINS_KEY] = stone_coins(normalized) + total_price
	normalized = normalize_profile(normalized)
	return {
		"ok": true,
		"profile": normalized,
		"message": "出售%s x%d，获得%d石币。" % [item_label, sell_amount, total_price],
		"itemId": item_id,
		"amount": sell_amount,
		"price": total_price,
	}


static func _capture_tool_inventory_from_slots(slots: Array[Dictionary]) -> Dictionary:
	var result := CaptureToolCatalog.starting_inventory()
	for key in result.keys():
		var tool_id := str(key)
		result[tool_id] = BackpackModel.item_count(slots, tool_id)
	return CaptureToolCatalog.normalize_inventory(result)


static func _consume_item_amounts(slots: Array[Dictionary], entries: Array[Dictionary]) -> Array[Dictionary]:
	var next_slots := BackpackModel.normalize_slots(slots)
	for entry in entries:
		var item_id := str(entry.get("itemId", ""))
		var count := maxi(0, int(entry.get("count", 0)))
		if item_id != "" and count > 0:
			next_slots = BackpackModel.consume(next_slots, item_id, count)
	return BackpackModel.normalize_slots(next_slots)


static func _battle_item_inventory_from_slots(slots: Array[Dictionary]) -> Dictionary:
	var result := {}
	for item_id in BackpackModel.item_ids_for_context(BackpackModel.CONTEXT_BATTLE_ITEM):
		result[item_id] = BackpackModel.item_count(slots, item_id)
	return result


static func _quest_states(profile: Dictionary) -> Dictionary:
	return QuestModel.normalize_states(profile.get(QUEST_STATES_KEY, {}))


static func _quest_available_for_profile(quest: Dictionary, profile: Dictionary) -> bool:
	var current_rebirth_count := RebirthModel.rebirth_count(profile)
	var target := QuestModel.rebirth_completion_target(quest)
	if target > 0:
		return target == current_rebirth_count + 1
	var required_rebirth := maxi(0, int(quest.get("requiredRebirthCount", quest.get("requiresRebirthCount", 0))))
	if required_rebirth > 0 and current_rebirth_count < required_rebirth:
		return false
	var required_missing_ability := str(quest.get("requiredMissingAbility", quest.get("requiresMissingAbility", ""))).strip_edges()
	if required_missing_ability != "":
		var abilities := _valid_unique_ability_ids(profile.get(UNLOCKED_ABILITIES_KEY, []))
		if abilities.has(required_missing_ability):
			return false
	return true


static func _first_available_unfinished_quest_id(states: Dictionary, profile: Dictionary) -> String:
	for quest in QuestModel.quests():
		if QuestModel.is_optional(quest):
			continue
		if not _quest_available_for_profile(quest, profile):
			continue
		var quest_id := str(quest.get("id", ""))
		if quest_id == "":
			continue
		var state := QuestModel.normalize_state(states.get(quest_id, {}), quest_id)
		if not states.has(quest_id) or str(state.get("status", QuestModel.STATUS_ACTIVE)) != QuestModel.STATUS_CLAIMED:
			return quest_id
	return ""


static func _quest_interaction_matches(quest: Dictionary, interaction_id: String) -> bool:
	var item_id := str(interaction_id).strip_edges()
	if item_id == "":
		return false
	if item_id == QuestModel.giver_id_for(quest) or item_id == QuestModel.turn_in_id_for(quest):
		return true
	for objective in QuestModel.objectives_for(quest):
		if str(objective.get("targetId", "")) == item_id or str(objective.get("interactionId", "")) == item_id:
			return true
	return false


static func _normalize_mailbox_messages(value, now_sec: int = -1) -> Array[Dictionary]:
	var now := _safe_now_sec(now_sec)
	var result: Array[Dictionary] = []
	if not (value is Array):
		return result
	for raw_message in value:
		if not (raw_message is Dictionary):
			continue
		var message := raw_message as Dictionary
		var mail_id := str(message.get("mailId", "")).strip_edges()
		if mail_id == "":
			continue
		var created_at := int(message.get("createdAtSec", now))
		if created_at <= 0:
			created_at = now
		var expires_at := int(message.get("expiresAtSec", created_at + MAILBOX_EXPIRY_SECONDS))
		if expires_at <= 0:
			expires_at = created_at + MAILBOX_EXPIRY_SECONDS
		if now >= expires_at:
			continue
		var items := _normalize_mailbox_items(message.get("items", []))
		if items.is_empty():
			continue
		result.append({
			"mailId": mail_id,
			"sender": str(message.get("sender", "系统")).strip_edges(),
			"title": str(message.get("title", "系统邮件")).strip_edges(),
			"body": str(message.get("body", "")).strip_edges(),
			"createdAtSec": created_at,
			"expiresAtSec": expires_at,
			"items": items,
		})
	return result


static func _normalize_mailbox_items(value) -> Array[Dictionary]:
	var entries: Array[Dictionary] = []
	if value is Array:
		for raw_entry in value:
			if not (raw_entry is Dictionary):
				continue
			var entry := raw_entry as Dictionary
			var item_id := str(entry.get("itemId", ""))
			var count := maxi(0, int(entry.get("count", 0)))
			if item_id == "" or count <= 0 or BackpackModel.item_for_id(item_id).is_empty():
				continue
			entries.append({"itemId": item_id, "count": count})
	return BackpackModel.merge_item_amounts(entries)


static func _upsert_mailbox_message(messages: Array[Dictionary], mail_id: String, title: String, body: String, items: Array, now_sec: int = -1) -> Array[Dictionary]:
	var now := _safe_now_sec(now_sec)
	var normalized_items := _normalize_mailbox_items(items)
	if normalized_items.is_empty():
		return messages
	var normalized_id := str(mail_id).strip_edges()
	var result := _normalize_mailbox_messages(messages, now)
	for index in range(result.size()):
		var message := result[index] as Dictionary
		if str(message.get("mailId", "")) != normalized_id:
			continue
		var merged_items: Array[Dictionary] = []
		var existing_items: Array[Dictionary] = _normalize_mailbox_items(message.get("items", []))
		merged_items.append_array(existing_items)
		merged_items.append_array(normalized_items)
		message["items"] = BackpackModel.merge_item_amounts(merged_items)
		message["title"] = title
		message["body"] = body
		message["expiresAtSec"] = maxi(int(message.get("expiresAtSec", now + MAILBOX_EXPIRY_SECONDS)), now + MAILBOX_EXPIRY_SECONDS)
		result[index] = message
		return result
	result.append({
		"mailId": normalized_id,
		"sender": "系统",
		"title": title,
		"body": body,
		"createdAtSec": now,
		"expiresAtSec": now + MAILBOX_EXPIRY_SECONDS,
		"items": normalized_items,
	})
	return result


static func _mailbox_item_count(messages: Array[Dictionary], item_id: String, mail_id: String = "") -> int:
	var total := 0
	for message in messages:
		if mail_id != "" and str(message.get("mailId", "")) != mail_id:
			continue
		for entry in _normalize_mailbox_items(message.get("items", [])):
			if str(entry.get("itemId", "")) == item_id:
				total += maxi(0, int(entry.get("count", 0)))
	return total


static func _subtract_item_amounts(items: Array, subtract_entries: Array) -> Array[Dictionary]:
	var counts := {}
	for entry in _normalize_mailbox_items(items):
		var item_id := str(entry.get("itemId", ""))
		counts[item_id] = int(counts.get(item_id, 0)) + maxi(0, int(entry.get("count", 0)))
	for entry in BackpackModel.merge_item_amounts(subtract_entries):
		var item_id := str(entry.get("itemId", ""))
		if item_id == "":
			continue
		counts[item_id] = maxi(0, int(counts.get(item_id, 0)) - maxi(0, int(entry.get("count", 0))))
	var remaining: Array[Dictionary] = []
	for item_id in counts.keys():
		var count := maxi(0, int(counts.get(item_id, 0)))
		if count > 0:
			remaining.append({"itemId": str(item_id), "count": count})
	return BackpackModel.merge_item_amounts(remaining)


static func _normalize_equipment_slots(value) -> Dictionary:
	var result := {}
	var raw := value as Dictionary if value is Dictionary else {}
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(raw.get(slot_id, ""))
		if item_id == "":
			continue
		if EquipmentModel.slot_for(item_id) != slot_id:
			continue
		result[slot_id] = item_id
	return result


static func _full_equipment_durability_for_slots(slots: Dictionary) -> Dictionary:
	var result := {}
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(slots.get(slot_id, ""))
		var max_durability := EquipmentModel.max_durability_for(item_id)
		if item_id != "" and max_durability > 0:
			result[slot_id] = max_durability
	return result


static func _fresh_equipment_enhancement_for_slots(slots: Dictionary) -> Dictionary:
	var result := {}
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(slots.get(slot_id, ""))
		if item_id != "" and EquipmentModel.enhance_max_for(item_id) > 0:
			result[slot_id] = _fresh_equipment_enhancement_record(item_id)
	return result


static func _fresh_equipment_enhancement_record(item_id: String) -> Dictionary:
	return {
		"itemId": item_id,
		"level": 0,
		"history": [],
	}


static func _fresh_equipment_wear_counters_for_slots(slots: Dictionary) -> Dictionary:
	var result := {}
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(slots.get(slot_id, ""))
		if item_id != "" and EquipmentModel.max_durability_for(item_id) > 0:
			result[slot_id] = _fresh_equipment_wear_counter_record(item_id)
	return result


static func _fresh_equipment_wear_counter_record(item_id: String) -> Dictionary:
	return {
		"itemId": item_id,
		"attackCount": 0,
		"hitCount": 0,
	}


static func _normalize_equipment_durability(slots: Dictionary, value) -> Dictionary:
	var raw := value as Dictionary if value is Dictionary else {}
	var result := {}
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(slots.get(slot_id, ""))
		if item_id == "":
			continue
		var max_durability := EquipmentModel.max_durability_for(item_id)
		if max_durability <= 0:
			continue
		result[slot_id] = clampi(int(raw.get(slot_id, max_durability)), 0, max_durability)
	return result


static func _normalize_equipment_enhancement(slots: Dictionary, value) -> Dictionary:
	var raw := value as Dictionary if value is Dictionary else {}
	var result := {}
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(slots.get(slot_id, ""))
		if item_id == "" or EquipmentModel.enhance_max_for(item_id) <= 0:
			continue
		var raw_record = raw.get(slot_id, {})
		var record := raw_record as Dictionary if raw_record is Dictionary else {}
		var record_item_id := str(record.get("itemId", item_id))
		var level := 0
		var history: Array = []
		if record_item_id == item_id:
			level = clampi(int(record.get("level", 0)), 0, EquipmentModel.enhance_max_for(item_id))
			var raw_history = record.get("history", [])
			if raw_history is Array:
				for value_entry in raw_history:
					if value_entry is Dictionary:
						history.append((value_entry as Dictionary).duplicate(true))
		result[slot_id] = {
			"itemId": item_id,
			"level": level,
			"history": history,
		}
	return result


static func _normalize_equipment_wear_counters(slots: Dictionary, value) -> Dictionary:
	var raw := value as Dictionary if value is Dictionary else {}
	var result := {}
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(slots.get(slot_id, ""))
		if item_id == "" or EquipmentModel.max_durability_for(item_id) <= 0:
			continue
		var raw_record = raw.get(slot_id, {})
		var record := raw_record as Dictionary if raw_record is Dictionary else {}
		if str(record.get("itemId", item_id)) != item_id:
			result[slot_id] = _fresh_equipment_wear_counter_record(item_id)
		else:
			result[slot_id] = {
				"itemId": item_id,
				"attackCount": maxi(0, int(record.get("attackCount", 0))),
				"hitCount": maxi(0, int(record.get("hitCount", 0))),
			}
	return result


static func _equipment_enhancement_record_for_item(enhancement: Dictionary, slot_id: String, item_id: String) -> Dictionary:
	var raw_record = enhancement.get(slot_id, {})
	if raw_record is Dictionary:
		var record := (raw_record as Dictionary).duplicate(true)
		if str(record.get("itemId", "")) == item_id:
			return record
	return _fresh_equipment_enhancement_record(item_id)


static func _equipment_enhance_level_for_slot(enhancement: Dictionary, slot_id: String, item_id: String) -> int:
	if item_id == "":
		return 0
	var record := _equipment_enhancement_record_for_item(enhancement, slot_id, item_id)
	return clampi(int(record.get("level", 0)), 0, EquipmentModel.enhance_max_for(item_id))


static func _fresh_exp_pill_charge_for_item(item_id: String) -> Dictionary:
	if not BackpackModel.item_can_world_player_exp(item_id):
		return {}
	var level := BackpackModel.world_exp_level_for(item_id)
	return {
		"itemId": item_id,
		"level": clampi(level, 1, MAX_PLAYER_LEVEL),
		"exp": 0,
		"nextExp": exp_to_next_level(clampi(level, 1, MAX_PLAYER_LEVEL)),
	}


static func _normalize_equipped_exp_pill_charge(slots: Dictionary, value) -> Dictionary:
	var item_id := str(slots.get(EquipmentModel.SLOT_EXP_PILL, ""))
	if item_id == "" or not BackpackModel.item_can_world_player_exp(item_id):
		return {}
	var raw := value as Dictionary if value is Dictionary else {}
	var base_level := BackpackModel.world_exp_level_for(item_id)
	var level := clampi(int(raw.get("level", base_level)), base_level, MAX_PLAYER_LEVEL)
	var exp := maxi(0, int(raw.get("exp", 0)))
	var next_exp := exp_to_next_level(level)
	if level >= MAX_PLAYER_LEVEL:
		exp = 0
	while level < MAX_PLAYER_LEVEL and exp >= next_exp:
		exp -= next_exp
		level += 1
		next_exp = exp_to_next_level(level)
	return {
		"itemId": item_id,
		"level": level,
		"exp": exp,
		"nextExp": next_exp,
	}


static func _exp_pill_charge_has_progress(slots: Dictionary, value) -> bool:
	var item_id := str(slots.get(EquipmentModel.SLOT_EXP_PILL, ""))
	if item_id == "":
		return false
	var charge := _normalize_equipped_exp_pill_charge(slots, value)
	if charge.is_empty():
		return false
	var base_level := BackpackModel.world_exp_level_for(item_id)
	return int(charge.get("level", base_level)) > base_level or int(charge.get("exp", 0)) > 0


static func _equipment_stat_bonus_from_slots(slots: Dictionary, durability: Dictionary = {}, player_level: int = 999999, player_rebirth: int = 99, enhancement: Dictionary = {}) -> Dictionary:
	var result := {}
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(slots.get(slot_id, ""))
		if item_id == "":
			continue
		if _equipment_slot_is_broken(slot_id, item_id, durability):
			continue
		if not _equipment_slot_meets_requirements(item_id, player_level, player_rebirth):
			continue
		var stats := EquipmentModel.stats_for(item_id)
		for key in EquipmentModel.STAT_KEYS:
			result[key] = int(result.get(key, 0)) + int(stats.get(key, 0))
		var enhance_level := _equipment_enhance_level_for_slot(enhancement, slot_id, item_id)
		var enhance_stats := EquipmentModel.enhance_stat_bonus_for(item_id, enhance_level)
		for key in EquipmentModel.STAT_KEYS:
			result[key] = int(result.get(key, 0)) + int(enhance_stats.get(key, 0))
	return result


static func _equipment_spirit_ids_from_slots(slots: Dictionary, durability: Dictionary = {}, player_level: int = 999999, player_rebirth: int = 99) -> Array[String]:
	var result: Array[String] = []
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(slots.get(slot_id, ""))
		if item_id == "":
			continue
		if _equipment_slot_is_broken(slot_id, item_id, durability):
			continue
		if not _equipment_slot_meets_requirements(item_id, player_level, player_rebirth):
			continue
		for spirit_id in EquipmentModel.spirit_ids_for(item_id):
			if not result.has(spirit_id):
				result.append(spirit_id)
	return _sorted_player_spirit_ids(result)


static func _equipment_battle_action_ids_from_slots(slots: Dictionary, durability: Dictionary = {}, player_level: int = 999999, player_rebirth: int = 99) -> Array[String]:
	var result: Array[String] = []
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(slots.get(slot_id, ""))
		if item_id == "":
			continue
		if _equipment_slot_is_broken(slot_id, item_id, durability):
			continue
		if not _equipment_slot_meets_requirements(item_id, player_level, player_rebirth):
			continue
		for action_id in EquipmentModel.battle_action_ids_for(item_id):
			if action_id != "" and not result.has(action_id):
				result.append(action_id)
	result.sort()
	return result


static func _equipment_attack_action_id_from_slots(slots: Dictionary, durability: Dictionary = {}, player_level: int = 999999, player_rebirth: int = 99) -> String:
	for slot_id in [EquipmentModel.SLOT_RIGHT_HAND_WEAPON, EquipmentModel.SLOT_LEFT_HAND_WEAPON]:
		var item_id := str(slots.get(slot_id, ""))
		if item_id == "":
			continue
		if _equipment_slot_is_broken(slot_id, item_id, durability):
			continue
		if not _equipment_slot_meets_requirements(item_id, player_level, player_rebirth):
			continue
		var action_id := EquipmentModel.attack_action_id_for(item_id)
		if action_id != "":
			return action_id
	return ""


static func _equipment_spirit_source_entries_from_slots(slots: Dictionary, durability: Dictionary = {}, player_level: int = 999999, player_rebirth: int = 99) -> Array[Dictionary]:
	var source_lookup := {}
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(slots.get(slot_id, ""))
		if item_id == "":
			continue
		if _equipment_slot_is_broken(slot_id, item_id, durability):
			continue
		if not _equipment_slot_meets_requirements(item_id, player_level, player_rebirth):
			continue
		for spirit_id in EquipmentModel.spirit_ids_for(item_id):
			if spirit_id == "":
				continue
			if not source_lookup.has(spirit_id):
				source_lookup[spirit_id] = []
			var sources := source_lookup[spirit_id] as Array
			sources.append({
				"slotId": slot_id,
				"slotLabel": EquipmentModel.slot_label_for(slot_id),
				"itemId": item_id,
				"itemLabel": EquipmentModel.label_for(item_id, item_id),
			})
			source_lookup[spirit_id] = sources
	var result: Array[Dictionary] = []
	for spirit_id in _sorted_player_spirit_ids(_string_array(source_lookup.keys())):
		result.append({
			"spiritId": spirit_id,
			"spiritLabel": BattleActionCatalog.label_for(spirit_id, spirit_id),
			"sources": source_lookup.get(spirit_id, []),
		})
	return result


static func _equipment_slot_is_broken(slot_id: String, item_id: String, durability: Dictionary) -> bool:
	if durability.is_empty():
		return false
	var max_durability := EquipmentModel.max_durability_for(item_id)
	if max_durability <= 0:
		return false
	return clampi(int(durability.get(slot_id, max_durability)), 0, max_durability) <= 0


static func _equipment_slot_meets_requirements(item_id: String, player_level: int, player_rebirth: int) -> bool:
	return bool(_equipment_requirement_state_for_values(item_id, player_level, player_rebirth).get("ok", false))


static func _equipment_requirement_state_for_values(item_id: String, player_level: int, player_rebirth: int) -> Dictionary:
	if not EquipmentModel.is_equipment(item_id):
		return {
			"ok": false,
			"requiredLevel": 1,
			"playerLevel": maxi(1, player_level),
			"requiredRebirth": 0,
			"playerRebirth": maxi(0, player_rebirth),
			"message": "不是装备。",
		}
	var required_level := EquipmentModel.required_level_for(item_id)
	var required_rebirth := EquipmentModel.required_rebirth_for(item_id)
	var normalized_level := maxi(1, player_level)
	var normalized_rebirth := maxi(0, player_rebirth)
	var missing: Array[String] = []
	if normalized_level < required_level:
		missing.append("Lv%d" % required_level)
	if normalized_rebirth < required_rebirth:
		missing.append(EquipmentModel.rebirth_label_for(required_rebirth))
	return {
		"ok": missing.is_empty(),
		"requiredLevel": required_level,
		"playerLevel": normalized_level,
		"requiredRebirth": required_rebirth,
		"playerRebirth": normalized_rebirth,
		"message": "" if missing.is_empty() else "需要%s。" % " / ".join(missing),
	}


static func _sorted_player_spirit_ids(spirit_ids: Array[String]) -> Array[String]:
	var preferred_order: Array[String] = [
		"spirit_grace_1",
		"spirit_moist_1",
		"spirit_grace_3",
		"spirit_moist_3",
		"spirit_poison_1",
		"spirit_poison_mist_1",
		"spirit_grace_5",
		"spirit_moist_6",
		"spirit_moist_5",
		"spirit_poison_5",
		"spirit_poison_mist_5",
	]
	var result: Array[String] = []
	for spirit_id in preferred_order:
		if spirit_ids.has(spirit_id):
			result.append(spirit_id)
	for spirit_id in spirit_ids:
		if not result.has(spirit_id):
			result.append(spirit_id)
	return result


static func _normalize_player_stat_values(value: Dictionary) -> Dictionary:
	var result := {}
	for key in PLAYER_STAT_KEYS:
		result[key] = maxi(1, int(value.get(key, DEFAULT_PLAYER_BATTLE_STATS.get(key, 1))))
	return result


static func _player_base_stats_from_player(player: Dictionary) -> Dictionary:
	var raw_base = player.get("baseStats", {})
	if raw_base is Dictionary:
		return _normalize_player_stat_values(raw_base as Dictionary)
	return DEFAULT_PLAYER_BATTLE_STATS.duplicate(true)


static func _player_base_stats_from_actor(actor: Dictionary) -> Dictionary:
	var result := {}
	for key in PLAYER_STAT_KEYS:
		result[key] = maxi(1, int(actor.get(key, DEFAULT_PLAYER_BATTLE_STATS.get(key, 1))))
	return result


static func all_pet_instances(profile: Dictionary) -> Array[Dictionary]:
	return _pet_instances(normalize_profile(profile))


static func ground_pet_drops(profile: Dictionary) -> Array[Dictionary]:
	return _ground_pet_drops(normalize_profile(profile))


static func ground_pet_drops_on_map(profile: Dictionary, map_id: String) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for drop in ground_pet_drops(profile):
		if str(drop.get("mapId", "")) == map_id:
			result.append(drop)
	return result


static func ground_pet_drop_by_id(profile: Dictionary, drop_id: String) -> Dictionary:
	for drop in ground_pet_drops(profile):
		if str(drop.get("dropId", "")) == drop_id:
			return drop
	return {}


static func ground_pet_drop_cell(drop: Dictionary) -> Vector2i:
	return _drop_cell(drop)


static func ground_pet_drop_pet(drop: Dictionary) -> Dictionary:
	var pet_value = drop.get("pet", {})
	if pet_value is Dictionary:
		return _normalize_pet_instance(pet_value as Dictionary)
	return {}


static func codex_entries(profile: Dictionary) -> Array[Dictionary]:
	var normalized := normalize_profile(profile)
	var seen_ids := _string_array(normalized.get(PET_CODEX_SEEN_FORM_IDS_KEY, []))
	var captured_ids := _string_array(normalized.get(PET_CODEX_CAPTURED_FORM_IDS_KEY, []))
	var owned_counts := _owned_pet_form_counts(normalized)
	var result: Array[Dictionary] = []
	for form in PetTemplateCatalog.forms():
		var form_id := str(form.get("formId", ""))
		if form_id == "":
			continue
		var template := PetTemplateCatalog.runtime_template_for_form(form_id)
		if template.is_empty():
			continue
		var owned_count := int(owned_counts.get(form_id, 0))
		var captured := captured_ids.has(form_id) or owned_count > 0
		var seen := captured or seen_ids.has(form_id)
		result.append({
			"formId": form_id,
			"formName": str(template.get("formName", "宠物")),
			"lineName": str(template.get("lineName", "未知种系")),
			"subtypeName": str(template.get("subtypeName", "未知亚种")),
			"seen": seen,
			"captured": captured,
			"ownedCount": owned_count,
			"recordLabel": codex_record_label(seen, captured, owned_count),
		})
	return result


static func codex_entry_for_form(profile: Dictionary, form_id: String) -> Dictionary:
	for entry in codex_entries(profile):
		if str(entry.get("formId", "")) == form_id:
			return entry
	return {}


static func codex_record_label(seen: bool, captured: bool, owned_count: int = 0) -> String:
	if captured:
		return "已捕捉    持有 %d" % maxi(0, owned_count)
	if seen:
		return "已遇见"
	return "未遇见"


static func pet_codex_detail_lines_for_form(profile: Dictionary, form_id: String) -> Array[String]:
	var entry := codex_entry_for_form(profile, form_id)
	if entry.is_empty():
		return ["暂无图鉴资料。"]
	if not bool(entry.get("seen", false)):
		return [
			"图鉴：？？？",
			"记录：未遇见",
		]
	var instance := create_pet_instance_from_form(
		"pet_codex_preview",
		str(entry.get("formName", "宠物")),
		form_id,
		PET_STATE_STANDBY,
		1
	)
	var lines := pet_codex_detail_lines(instance)
	lines.insert(1, "记录：%s" % str(entry.get("recordLabel", "未遇见")))
	return lines


static func record_codex_seen(profile: Dictionary, form_id: String) -> Dictionary:
	return normalize_profile(_with_codex_form_recorded(profile, form_id, false))


static func record_codex_captured(profile: Dictionary, form_id: String) -> Dictionary:
	return normalize_profile(_with_codex_form_recorded(profile, form_id, true))


static func can_set_active_pet(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var instance := pet_instance_by_id(normalized, instance_id)
	if instance.is_empty():
		return {"ok": false, "message": "没有找到这只宠物。"}
	if str(normalized.get("activePetInstanceId", "")) == instance_id:
		return {"ok": false, "message": "%s 已经是主宠。" % str(instance.get("name", "宠物"))}
	var state := str(instance.get("state", PET_STATE_STANDBY))
	if state == PET_STATE_REST:
		return {"ok": false, "message": "%s 正在休息，不能出战。" % str(instance.get("name", "宠物"))}
	if state == PET_STATE_STORAGE:
		return {"ok": false, "message": "%s 在兽栏里，暂时不能直接出战。" % str(instance.get("name", "宠物"))}
	if int(instance.get("hp", 0)) <= 0:
		return {"ok": false, "message": "%s 生命为 0，不能出战。" % str(instance.get("name", "宠物"))}
	return {"ok": true, "message": "%s 可以设为主宠。" % str(instance.get("name", "宠物"))}


static func set_active_pet(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var check := can_set_active_pet(normalized, instance_id)
	if not bool(check.get("ok", false)):
		return {
			"ok": false,
			"profile": normalized,
			"message": str(check.get("message", "不能设为主宠。")),
		}
	var instances: Array = normalized.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		var state := str(instance.get("state", PET_STATE_STANDBY))
		if str(instance.get("instanceId", "")) == instance_id:
			instance["state"] = PET_STATE_BATTLE
		elif state == PET_STATE_BATTLE:
			instance["state"] = PET_STATE_STANDBY
		instances[index] = instance
	normalized["petInstances"] = instances
	normalized["activePetInstanceId"] = instance_id
	normalized = normalize_profile(normalized)
	var active := pet_instance_by_id(normalized, instance_id)
	return {
		"ok": true,
		"profile": normalized,
		"message": "%s 已设为主宠。" % str(active.get("name", "宠物")),
	}


static func cycled_pet_state(state: String) -> String:
	match state:
		PET_STATE_REST:
			return PET_STATE_BATTLE
		PET_STATE_BATTLE:
			return PET_STATE_STANDBY
		PET_STATE_STANDBY:
			return PET_STATE_REST
		_:
			return ""


static func can_cycle_pet_state(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var instance := pet_instance_by_id(normalized, instance_id)
	if instance.is_empty():
		return {"ok": false, "message": "没有找到这只宠物。"}
	var state := str(instance.get("state", PET_STATE_STANDBY))
	var target_state := cycled_pet_state(state)
	if target_state == "":
		return {"ok": false, "message": "%s 当前状态不能切换。" % str(instance.get("name", "宠物"))}
	if state == PET_STATE_STORAGE:
		return {"ok": false, "message": "%s 在兽栏里，暂时不能切换状态。" % str(instance.get("name", "宠物"))}
	if target_state == PET_STATE_BATTLE and int(instance.get("hp", 0)) <= 0:
		return {"ok": false, "message": "%s 生命为 0，不能出战。" % str(instance.get("name", "宠物"))}
	return {"ok": true, "message": "%s 将切换为%s。" % [str(instance.get("name", "宠物")), state_label(target_state)]}


static func cycle_pet_state(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var check := can_cycle_pet_state(normalized, instance_id)
	if not bool(check.get("ok", false)):
		return {
			"ok": false,
			"profile": normalized,
			"message": str(check.get("message", "不能切换宠物状态。")),
		}
	var selected := pet_instance_by_id(normalized, instance_id)
	var current_state := str(selected.get("state", PET_STATE_STANDBY))
	var target_state := cycled_pet_state(current_state)
	var instances: Array = normalized.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		var current_id := str(instance.get("instanceId", ""))
		if current_id == instance_id:
			instance["state"] = target_state
		elif target_state == PET_STATE_BATTLE and str(instance.get("state", PET_STATE_STANDBY)) == PET_STATE_BATTLE:
			instance["state"] = PET_STATE_STANDBY
		instances[index] = instance
	normalized["petInstances"] = instances
	if target_state == PET_STATE_BATTLE:
		normalized["activePetInstanceId"] = instance_id
	elif current_state == PET_STATE_BATTLE:
		normalized["activePetInstanceId"] = ""
	normalized = normalize_profile(normalized)
	var changed := pet_instance_by_id(normalized, instance_id)
	return {
		"ok": true,
		"profile": normalized,
		"message": "%s 已切换为%s。" % [str(changed.get("name", "宠物")), state_label(str(changed.get("state", target_state)))],
	}


static func can_store_pet(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var instance := pet_instance_by_id(normalized, instance_id)
	if instance.is_empty():
		return {"ok": false, "message": "没有找到这只宠物。"}
	if str(instance.get("state", PET_STATE_STANDBY)) == PET_STATE_STORAGE:
		return {"ok": false, "message": "%s 已在兽栏。" % str(instance.get("name", "宠物"))}
	if _storage_instance_count(normalized) >= STORAGE_LIMIT:
		return {"ok": false, "message": "兽栏已满。"}
	return {"ok": true, "message": "%s 可以存入兽栏。" % str(instance.get("name", "宠物"))}


static func store_pet(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var check := can_store_pet(normalized, instance_id)
	if not bool(check.get("ok", false)):
		return {
			"ok": false,
			"profile": normalized,
			"message": str(check.get("message", "不能存入。")),
		}
	var instances: Array = normalized.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("instanceId", "")) != instance_id:
			instances[index] = instance
			continue
		instance["state"] = PET_STATE_STORAGE
		instances[index] = instance
		break
	normalized["petInstances"] = instances
	if str(normalized.get("activePetInstanceId", "")) == instance_id:
		normalized["activePetInstanceId"] = ""
	normalized = normalize_profile(normalized)
	var changed := pet_instance_by_id(normalized, instance_id)
	return {
		"ok": true,
		"profile": normalized,
		"message": "%s 已存入兽栏。" % str(changed.get("name", "宠物")),
	}


static func clean_pet_name(raw_name: String) -> String:
	var pet_name := raw_name.replace("\r", "").replace("\n", "").replace("\t", " ").strip_edges()
	while pet_name.find("  ") >= 0:
		pet_name = pet_name.replace("  ", " ")
	return pet_name


static func can_rename_pet(profile: Dictionary, instance_id: String, raw_name: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var instance := pet_instance_by_id(normalized, instance_id)
	if instance.is_empty():
		return {"ok": false, "message": "没有找到这只宠物。", "name": ""}
	var pet_name := clean_pet_name(raw_name)
	if pet_name == "":
		return {"ok": false, "message": "名字不能为空。", "name": pet_name}
	if pet_name.length() > PET_NAME_MAX_LENGTH:
		return {"ok": false, "message": "名字最多 %d 个字。" % PET_NAME_MAX_LENGTH, "name": pet_name}
	if pet_name == str(instance.get("name", "")):
		return {"ok": false, "message": "名字没有变化。", "name": pet_name}
	return {"ok": true, "message": "%s 可以改名。" % str(instance.get("name", "宠物")), "name": pet_name}


static func rename_pet(profile: Dictionary, instance_id: String, raw_name: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var check := can_rename_pet(normalized, instance_id, raw_name)
	if not bool(check.get("ok", false)):
		return {
			"ok": false,
			"profile": normalized,
			"message": str(check.get("message", "不能改名。")),
			"name": str(check.get("name", "")),
		}
	var pet_name := str(check.get("name", ""))
	var old_name := "宠物"
	var instances: Array = normalized.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("instanceId", "")) != instance_id:
			instances[index] = instance
			continue
		old_name = str(instance.get("name", "宠物"))
		instance["name"] = pet_name
		instances[index] = instance
		break
	normalized["petInstances"] = instances
	normalized = normalize_profile(normalized)
	return {
		"ok": true,
		"profile": normalized,
		"message": "%s 已改名为%s。" % [old_name, pet_name],
		"name": pet_name,
	}


static func use_world_pet_heal_item(profile: Dictionary, item_id: String, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var item_label := BackpackModel.label_for(item_id)
	if not BackpackModel.item_can_world_pet_heal(item_id):
		return {
			"ok": false,
			"profile": normalized,
			"message": "%s 不能这样使用。" % item_label,
		}
	if BackpackModel.item_count(backpack_slots(normalized), item_id) <= 0:
		return {
			"ok": false,
			"profile": normalized,
			"message": "%s 不够了。" % item_label,
		}

	var instances: Array = normalized.get("petInstances", [])
	var found := false
	var healed_name := "宠物"
	var healed_amount := 0
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("instanceId", "")) != instance_id:
			instances[index] = instance
			continue
		found = true
		healed_name = str(instance.get("name", "宠物"))
		if str(instance.get("state", PET_STATE_STANDBY)) == PET_STATE_STORAGE:
			return {
				"ok": false,
				"profile": normalized,
				"message": "只能对队伍宠物使用。",
			}
		var max_hp := maxi(1, int(instance.get("maxHp", 1)))
		var hp := clampi(int(instance.get("hp", max_hp)), 0, max_hp)
		var allow_full_hp_use := BackpackModel.world_pet_heal_allows_full_hp_use(item_id)
		if hp >= max_hp and not allow_full_hp_use:
			return {
				"ok": false,
				"profile": normalized,
				"message": "%s 生命已满。" % healed_name,
			}
		healed_amount = mini(BackpackModel.world_heal_amount_for(item_id), max_hp - hp)
		instance["hp"] = hp + healed_amount
		instances[index] = instance
		break
	if not found:
		return {
			"ok": false,
			"profile": normalized,
			"message": "没有找到这只宠物。",
		}
	var allow_full_hp_use_after := BackpackModel.world_pet_heal_allows_full_hp_use(item_id)
	if healed_amount <= 0 and not allow_full_hp_use_after:
		return {
			"ok": false,
			"profile": normalized,
			"message": "%s 不能这样使用。" % item_label,
		}

	normalized["petInstances"] = instances
	var next_slots := BackpackModel.consume(BackpackModel.normalize_slots(normalized.get(BACKPACK_SLOTS_KEY, [])), item_id, 1)
	normalized[BACKPACK_SLOTS_KEY] = next_slots
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(next_slots)
	normalized = normalize_profile(normalized)
	var message := "%s 使用%s，恢复%d生命。" % [healed_name, item_label, healed_amount]
	if healed_amount <= 0:
		message = "%s 吃下%s，生命已满。" % [healed_name, item_label]
	return {
		"ok": true,
		"profile": normalized,
		"message": message,
		"heal": healed_amount,
		"itemId": item_id,
		"petId": instance_id,
	}


static func rest_recovery_amount_for_instance(instance: Dictionary) -> int:
	var max_hp := maxi(1, int(instance.get("maxHp", 1)))
	return maxi(1, int(ceil(float(max_hp) * PET_REST_RECOVERY_RATIO)))


static func _missing_hp_for_pet_instance(instance: Dictionary) -> int:
	var max_hp := maxi(1, int(instance.get("maxHp", 1)))
	var hp := clampi(int(instance.get("hp", max_hp)), 0, max_hp)
	return maxi(0, max_hp - hp)


static func apply_rest_recovery_tick(profile: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var instances: Array = normalized.get("petInstances", [])
	var healed_count := 0
	var total_heal := 0
	var recovered_ids: Array[String] = []
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("state", PET_STATE_STANDBY)) != PET_STATE_REST:
			instances[index] = instance
			continue
		var max_hp := maxi(1, int(instance.get("maxHp", 1)))
		var hp := clampi(int(instance.get("hp", max_hp)), 0, max_hp)
		if hp >= max_hp:
			instances[index] = instance
			continue
		var healed := mini(rest_recovery_amount_for_instance(instance), max_hp - hp)
		instance["hp"] = hp + healed
		instances[index] = instance
		healed_count += 1
		total_heal += healed
		recovered_ids.append(str(instance.get("instanceId", "")))
	normalized["petInstances"] = instances
	normalized = normalize_profile(normalized)
	return {
		"ok": healed_count > 0,
		"profile": normalized,
		"healedCount": healed_count,
		"totalHeal": total_heal,
		"petIds": recovered_ids,
	}


static func can_withdraw_pet(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var instance := pet_instance_by_id(normalized, instance_id)
	if instance.is_empty():
		return {"ok": false, "message": "没有找到这只宠物。"}
	if str(instance.get("state", PET_STATE_STANDBY)) != PET_STATE_STORAGE:
		return {"ok": false, "message": "%s 不在兽栏。" % str(instance.get("name", "宠物"))}
	if _party_visible_instance_count(normalized) >= PARTY_LIMIT:
		return {"ok": false, "message": "队伍已满。"}
	return {"ok": true, "message": "%s 可以取出。" % str(instance.get("name", "宠物"))}


static func withdraw_pet(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var check := can_withdraw_pet(normalized, instance_id)
	if not bool(check.get("ok", false)):
		return {
			"ok": false,
			"profile": normalized,
			"message": str(check.get("message", "不能取出。")),
		}
	var instances: Array = normalized.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("instanceId", "")) != instance_id:
			instances[index] = instance
			continue
		instance["state"] = PET_STATE_STANDBY
		instances[index] = instance
		break
	normalized["petInstances"] = instances
	normalized = normalize_profile(normalized)
	var changed := pet_instance_by_id(normalized, instance_id)
	return {
		"ok": true,
		"profile": normalized,
		"message": "%s 已取出。" % str(changed.get("name", "宠物")),
	}


static func can_drop_pet(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var instance := pet_instance_by_id(normalized, instance_id)
	if instance.is_empty():
		return {"ok": false, "message": "没有找到这只宠物。"}
	if str(instance.get("state", PET_STATE_STANDBY)) == PET_STATE_STORAGE:
		return {"ok": false, "message": "兽栏里的宠物不能直接丢弃。"}
	return {"ok": true, "message": "%s 可以丢弃。" % str(instance.get("name", "宠物"))}


static func drop_pet(profile: Dictionary, instance_id: String, map_id: String, cell: Vector2i, now_sec: int = -1) -> Dictionary:
	var normalized := normalize_profile(profile)
	var check := can_drop_pet(normalized, instance_id)
	if not bool(check.get("ok", false)):
		return {
			"ok": false,
			"profile": normalized,
			"message": str(check.get("message", "不能丢弃。")),
		}
	if map_id == "":
		return {
			"ok": false,
			"profile": normalized,
			"message": "当前位置不能丢弃宠物。",
		}

	var instances: Array = normalized.get("petInstances", [])
	var next_instances: Array = []
	var dropped_pet: Dictionary = {}
	for value in instances:
		if not (value is Dictionary):
			continue
		var instance := (value as Dictionary).duplicate(true)
		if str(instance.get("instanceId", "")) == instance_id:
			dropped_pet = instance
			continue
		next_instances.append(instance)
	if dropped_pet.is_empty():
		return {
			"ok": false,
			"profile": normalized,
			"message": "没有找到这只宠物。",
		}

	dropped_pet["state"] = PET_STATE_STANDBY
	var created_at := _safe_now_sec(now_sec)
	var serial := maxi(1, int(normalized.get("nextPetDropSerial", 1)))
	var drops: Array = normalized.get("groundPetDrops", [])
	var drop_id := "ground_pet_%d" % serial
	while _ground_pet_drop_index(drops, drop_id) >= 0:
		serial += 1
		drop_id = "ground_pet_%d" % serial
	var drop := _normalize_ground_pet_drop({
		"dropId": drop_id,
		"ownerId": LOCAL_PLAYER_ID,
		"pickupMode": PET_DROP_PICKUP_PUBLIC,
		"mapId": map_id,
		"cell": [cell.x, cell.y],
		"createdAtSec": created_at,
		"expiresAtSec": created_at + PET_DROP_TTL_SECONDS,
		"pet": dropped_pet,
	})
	drops.append(drop)

	normalized["petInstances"] = next_instances
	normalized["groundPetDrops"] = drops
	normalized["nextPetDropSerial"] = serial + 1
	if str(normalized.get("activePetInstanceId", "")) == instance_id:
		normalized["activePetInstanceId"] = ""
	normalized = normalize_profile(normalized)
	return {
		"ok": true,
		"profile": normalized,
		"message": "%s 被丢在地上。" % str(dropped_pet.get("name", "宠物")),
		"dropId": drop_id,
	}


static func can_clear_storage_pet(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var instance := pet_instance_by_id(normalized, instance_id)
	if instance.is_empty():
		return {"ok": false, "message": "没有找到这只宠物。"}
	if str(instance.get("state", PET_STATE_STANDBY)) != PET_STATE_STORAGE:
		return {"ok": false, "message": "只有兽栏里的宠物可以清理。"}
	return {"ok": true, "message": "%s 可以清理。" % str(instance.get("name", "宠物"))}


static func clear_storage_pet(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var check := can_clear_storage_pet(normalized, instance_id)
	if not bool(check.get("ok", false)):
		return {
			"ok": false,
			"profile": normalized,
			"message": str(check.get("message", "不能清理。")),
		}
	var instances: Array = normalized.get("petInstances", [])
	var next_instances: Array = []
	var removed_pet: Dictionary = {}
	for value in instances:
		if not (value is Dictionary):
			continue
		var instance := (value as Dictionary).duplicate(true)
		if str(instance.get("instanceId", "")) == instance_id:
			removed_pet = instance
			continue
		next_instances.append(instance)
	normalized["petInstances"] = next_instances
	if str(normalized.get("activePetInstanceId", "")) == instance_id:
		normalized["activePetInstanceId"] = ""
	normalized = normalize_profile(normalized)
	return {
		"ok": not removed_pet.is_empty(),
		"profile": normalized,
		"message": "%s 已清理。" % str(removed_pet.get("name", "宠物")) if not removed_pet.is_empty() else "没有找到这只宠物。",
		"removedCount": 1 if not removed_pet.is_empty() else 0,
	}


static func can_pickup_ground_pet(profile: Dictionary, drop_id: String, now_sec: int = -1) -> Dictionary:
	var normalized := normalize_profile(profile)
	var now := _safe_now_sec(now_sec)
	var drop := ground_pet_drop_by_id(normalized, drop_id)
	if drop.is_empty():
		return {"ok": false, "message": "这只宠物已经离开了。"}
	if _ground_pet_drop_expired(drop, now):
		return {"ok": false, "message": "这只宠物已经离开了。"}
	if _party_visible_instance_count(normalized) >= PARTY_LIMIT:
		return {"ok": false, "message": "队伍已满。"}
	var pet := ground_pet_drop_pet(drop)
	var player = normalized.get("player", {})
	var player_dict := player as Dictionary if player is Dictionary else {}
	var player_level := maxi(1, int(player_dict.get("level", 1)))
	var pet_level := maxi(1, int(pet.get("level", 1)))
	if pet_level > player_level + PET_PICKUP_LEVEL_MARGIN:
		return {"ok": false, "message": "不能拾取超过自己5级以上的宠物。"}
	return {"ok": true, "message": "%s 可以拾取。" % str(pet.get("name", "宠物"))}


static func pickup_ground_pet(profile: Dictionary, drop_id: String, now_sec: int = -1) -> Dictionary:
	var normalized := normalize_profile(profile)
	var expired := expire_ground_pet_drops(normalized, now_sec)
	normalized = expired.get("profile", normalized)
	if bool(expired.get("ok", false)) and ground_pet_drop_by_id(normalized, drop_id).is_empty():
		return {
			"ok": false,
			"changed": true,
			"profile": normalized,
			"message": "这只宠物已经离开了。",
		}
	var check := can_pickup_ground_pet(normalized, drop_id, now_sec)
	if not bool(check.get("ok", false)):
		return {
			"ok": false,
			"changed": bool(expired.get("ok", false)),
			"profile": normalized,
			"message": str(check.get("message", "不能拾取。")),
		}

	var drops: Array = normalized.get("groundPetDrops", [])
	var picked_pet: Dictionary = {}
	for index in range(drops.size()):
		if not (drops[index] is Dictionary):
			continue
		var drop := drops[index] as Dictionary
		if str(drop.get("dropId", "")) != drop_id:
			continue
		picked_pet = ground_pet_drop_pet(drop)
		drops.remove_at(index)
		break
	if picked_pet.is_empty():
		return {
			"ok": false,
			"changed": bool(expired.get("ok", false)),
			"profile": normalized,
			"message": "这只宠物已经离开了。",
		}

	picked_pet["state"] = PET_STATE_STANDBY
	var instances: Array = normalized.get("petInstances", [])
	instances.append(picked_pet)
	normalized["petInstances"] = instances
	normalized["groundPetDrops"] = drops
	normalized = normalize_profile(normalized)
	return {
		"ok": true,
		"changed": true,
		"profile": normalized,
		"message": "%s 回到队伍。" % str(picked_pet.get("name", "宠物")),
		"instanceId": str(picked_pet.get("instanceId", "")),
	}


static func expire_ground_pet_drops(profile: Dictionary, now_sec: int = -1) -> Dictionary:
	var normalized := normalize_profile(profile)
	var now := _safe_now_sec(now_sec)
	var active_drops: Array = []
	var expired_count := 0
	for drop in _ground_pet_drops(normalized):
		if _ground_pet_drop_expired(drop, now):
			expired_count += 1
			continue
		active_drops.append(drop)
	if expired_count <= 0:
		return {
			"ok": false,
			"profile": normalized,
			"expiredCount": 0,
		}
	normalized["groundPetDrops"] = active_drops
	normalized = normalize_profile(normalized)
	return {
		"ok": true,
		"profile": normalized,
		"expiredCount": expired_count,
	}


static func state_label(state: String) -> String:
	match state:
		PET_STATE_BATTLE:
			return "出战"
		PET_STATE_STANDBY:
			return "待机"
		PET_STATE_REST:
			return "休息"
		PET_STATE_STORAGE:
			return "兽栏"
		_:
			return "未知"


static func element_summary_for_instance(instance: Dictionary) -> String:
	var elements = instance.get("elements", {})
	if not (elements is Dictionary):
		return "未知属性"
	var labels := {
		"fire": "火",
		"water": "水",
		"earth": "地",
		"wind": "风",
	}
	var parts: Array[String] = []
	for key in ["fire", "water", "earth", "wind"]:
		var value := int((elements as Dictionary).get(key, 0))
		if value > 0:
			parts.append("%d%s" % [value, str(labels.get(key, key))])
	return " ".join(parts) if not parts.is_empty() else "无属性"

static func active_skill_labels_for_instance(instance: Dictionary) -> Array[String]:
	var labels: Array[String] = []
	for skill_id in _valid_unique_pet_skill_ids(instance.get("activeSkillIds", [])):
		var label := BattleActionCatalog.label_for(skill_id, skill_id)
		if label != "":
			labels.append(label)
	return labels


static func pet_skill_slot_labels_for_instance(instance: Dictionary) -> Array[String]:
	var labels: Array[String] = []
	for option in pet_skill_slot_options_for_instance(instance):
		var skill_id := str(option.get("skillId", ""))
		if skill_id == "":
			continue
		labels.append("技%d %s" % [int(option.get("slot", 1)), str(option.get("label", skill_id))])
	return labels


static func passive_lines_for_instance(instance: Dictionary) -> Array[String]:
	return BattlePassiveCatalog.display_lines_for_actor(instance)


static func pet_detail_lines(instance: Dictionary) -> Array[String]:
	if instance.is_empty():
		return ["请选择宠物。"]
	var lines: Array[String] = []
	lines.append("%s  Lv%d  %s" % [
		str(instance.get("name", "宠物")),
		int(instance.get("level", 1)),
		state_label(str(instance.get("state", PET_STATE_STANDBY))),
	])
	lines.append("%s / %s / %s" % [
		str(instance.get("lineName", "未知种系")),
		str(instance.get("subtypeName", "未知亚种")),
		str(instance.get("formName", "未知形态")),
	])
	lines.append("属性：%s" % element_summary_for_instance(instance))
	lines.append("生命：%d/%d    攻击：%d    防御：%d    敏捷：%d" % [
		int(instance.get("hp", 0)),
		int(instance.get("maxHp", 0)),
		int(instance.get("attack", 0)),
		int(instance.get("defense", 0)),
		int(instance.get("quick", 0)),
	])
	lines.append(PetPowerModel.combat_power_label_for_pet(instance))
	lines.append("成长档：%s    个体：%s" % [
		str(instance.get("growthTierLabel", growth_profile_label(str(instance.get("growthProfileId", ""))))),
		str(instance.get("individualQualityLabel", "普通")),
	])
	lines.append_array(PetCultivationModel.detail_lines_for_pet(instance))
	var initial_stats = instance.get("initialStats", {})
	if initial_stats is Dictionary:
		var initial := initial_stats as Dictionary
		lines.append("初始四维：生命 %d    攻击 %d    防御 %d    敏捷 %d" % [
			int(initial.get("maxHp", 0)),
			int(initial.get("attack", 0)),
			int(initial.get("defense", 0)),
			int(initial.get("quick", 0)),
		])
	lines.append(PetPowerModel.combat_power_source_label_for_pet(instance))
	lines.append("经验：%d/%d" % [
		int(instance.get("exp", 0)),
		int(instance.get("nextExp", exp_to_next_level(int(instance.get("level", 1))))),
	])
	var slot_labels := pet_skill_slot_labels_for_instance(instance)
	lines.append("技能槽：%s" % ("、".join(slot_labels) if not slot_labels.is_empty() else "无"))
	var passive_lines := passive_lines_for_instance(instance)
	if passive_lines.is_empty():
		lines.append("被动技能: 无")
	else:
		for passive_line in passive_lines:
			lines.append(passive_line)
	var state := str(instance.get("state", PET_STATE_STANDBY))
	if state == PET_STATE_STORAGE:
		lines.append("在兽栏中，暂时不能直接出战。")
	elif int(instance.get("hp", 0)) <= 0:
		lines.append("%s 生命为 0，不能出战。" % str(instance.get("name", "宠物")))
	return lines


static func pet_cultivation_preview(profile: Dictionary, instance_id: String, mode: String = "") -> Dictionary:
	var normalized := normalize_profile(profile)
	var instance := pet_instance_by_id(normalized, instance_id)
	if instance.is_empty():
		return PetCultivationModel.preview_for_pet({}, mode)
	return PetCultivationModel.preview_for_pet(instance, mode)


static func apply_pet_cultivation(profile: Dictionary, instance_id: String, mode: String = "", now_sec: int = -1) -> Dictionary:
	var normalized := normalize_profile(profile)
	var instance := pet_instance_by_id(normalized, instance_id)
	if instance.is_empty():
		return {
			"ok": false,
			"profile": normalized,
			"message": "没有找到这只宠物。",
		}
	var result := PetCultivationModel.apply_to_pet(instance, mode, now_sec)
	if not bool(result.get("ok", false)):
		return {
			"ok": false,
			"profile": normalized,
			"preview": result.get("preview", {}),
			"message": str(result.get("message", "不能培养这只宠物。")),
		}
	var next_profile := normalized.duplicate(true)
	var instances: Array = next_profile.get("petInstances", [])
	var found := false
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var current := instances[index] as Dictionary
		if str(current.get("instanceId", "")) != instance_id:
			continue
		instances[index] = result.get("pet", current)
		found = true
		break
	if not found:
		return {
			"ok": false,
			"profile": normalized,
			"message": "没有找到这只宠物。",
		}
	next_profile["petInstances"] = instances
	next_profile = normalize_profile(next_profile)
	var updated := pet_instance_by_id(next_profile, instance_id)
	var preview_value = result.get("preview", {})
	var preview_mode := ""
	if preview_value is Dictionary:
		preview_mode = str((preview_value as Dictionary).get("mode", ""))
	if preview_mode == PetCultivationModel.MODE_REBIRTH and not updated.is_empty():
		updated["hp"] = int(updated.get("maxHp", updated.get("hp", 1)))
		var normalized_instances: Array = next_profile.get("petInstances", [])
		for index in range(normalized_instances.size()):
			if not (normalized_instances[index] is Dictionary):
				continue
			if str((normalized_instances[index] as Dictionary).get("instanceId", "")) == instance_id:
				normalized_instances[index] = updated
				break
		next_profile["petInstances"] = normalized_instances
	return {
		"ok": true,
		"profile": next_profile,
		"pet": pet_instance_by_id(next_profile, instance_id),
		"preview": result.get("preview", {}),
		"result": result.get("result", {}),
		"message": str(result.get("message", "宠物培养完成。")),
	}


static func pet_codex_detail_lines(instance: Dictionary) -> Array[String]:
	if instance.is_empty():
		return ["请选择宠物。"]
	var form_id := str(instance.get("formId", instance.get("templateId", "")))
	var template := PetTemplateCatalog.runtime_template_for_form(form_id)
	if template.is_empty():
		return ["暂无图鉴资料。"]
	var lines: Array[String] = []
	lines.append("图鉴：%s" % str(template.get("formName", "宠物")))
	lines.append("种系：%s    亚种：%s" % [
		str(template.get("lineName", "未知种系")),
		str(template.get("subtypeName", "未知亚种")),
	])
	lines.append("形态：%s" % str(template.get("formName", "未知形态")))
	lines.append("属性：%s" % element_summary_for_instance(template))
	lines.append("成长倾向：%s" % growth_profile_label(str(template.get("growthProfileId", ""))))
	var stats = template.get("baseStats", {})
	if stats is Dictionary:
		var stats_dict := stats as Dictionary
		lines.append("基础能力：生命 %d    攻击 %d    防御 %d    敏捷 %d" % [
			int(stats_dict.get("maxHp", 0)),
			int(stats_dict.get("attack", 0)),
			int(stats_dict.get("defense", 0)),
			int(stats_dict.get("agility", 0)),
		])
	var capture = template.get("capture", {})
	if capture is Dictionary:
		var capture_dict := capture as Dictionary
		var capture_label := "可捕捉" if bool(capture_dict.get("catchable", false)) else "不可捕捉"
		if capture_dict.has("difficulty"):
			capture_label += "    难度 %d" % int(capture_dict.get("difficulty", 0))
		lines.append("捕捉：%s" % capture_label)
	var line := PetTemplateCatalog.line_by_id(str(template.get("lineId", "")))
	var description := str(line.get("description", "")).strip_edges()
	if description != "":
		lines.append("种系说明：%s" % description)
	var skill_labels := active_skill_labels_for_instance(template)
	lines.append("可用技能：%s" % ("、".join(skill_labels) if not skill_labels.is_empty() else "无"))
	var passive_lines := passive_lines_for_instance(template)
	if passive_lines.is_empty():
		lines.append("被动技能: 无")
	else:
		for passive_line in passive_lines:
			lines.append(passive_line)
	return lines


static func growth_profile_label(profile_id: String) -> String:
	return PetIndividualGrowthModel.growth_tier_label(profile_id)


static func pet_stats_for_form_level(form_id: String, level: int) -> Dictionary:
	var template := PetTemplateCatalog.runtime_template_for_form(form_id)
	if template.is_empty():
		return {
			"maxHp": 1,
			"attack": 1,
			"defense": 1,
			"quick": 1,
		}
	return _pet_stats_for_template_level(template, level)


static func _pet_stats_for_template_level(template: Dictionary, level: int) -> Dictionary:
	var rates := _pet_growth_rates(str(template.get("growthProfileId", "balanced")))
	var snapshot := PetIndividualGrowthModel.growth_snapshot(template, {}, level, rates, str(template.get("formId", template.get("id", ""))))
	return snapshot.get("finalStats", {})


static func _pet_growth_rates(profile_id: String) -> Dictionary:
	var normalized := profile_id.to_lower().strip_edges()
	if PET_GROWTH_PROFILES.has(normalized):
		return (PET_GROWTH_PROFILES.get(normalized, {}) as Dictionary).duplicate(true)
	if normalized.find("attack") >= 0:
		return (PET_GROWTH_PROFILES.get("attack_high", {}) as Dictionary).duplicate(true)
	if normalized.find("agility") >= 0 or normalized.find("quick") >= 0 or normalized.find("speed") >= 0:
		return (PET_GROWTH_PROFILES.get("agility_high", {}) as Dictionary).duplicate(true)
	if normalized.find("defense") >= 0:
		return (PET_GROWTH_PROFILES.get("defense_high", {}) as Dictionary).duplicate(true)
	if normalized.find("hp") >= 0 or normalized.find("health") >= 0 or normalized.find("stamina") >= 0 or normalized.find("survival") >= 0:
		return (PET_GROWTH_PROFILES.get("hp_high", {}) as Dictionary).duplicate(true)
	return (PET_GROWTH_PROFILES.get("balanced", {}) as Dictionary).duplicate(true)


static func create_pet_instance_from_form(instance_id: String, pet_name: String, form_id: String, state: String, level: int, stat_overrides: Dictionary = {}) -> Dictionary:
	return _pet_instance_from_form(instance_id, pet_name, form_id, state, level, stat_overrides)


static func normalize_profile(profile: Dictionary) -> Dictionary:
	var normalized := profile.duplicate(true)
	normalized["schemaVersion"] = PROFILE_SCHEMA_VERSION
	var player = normalized.get("player", {})
	var player_dict := player as Dictionary if player is Dictionary else {}
	player_dict["name"] = str(player_dict.get("name", "见习猎人"))
	player_dict["level"] = clampi(int(player_dict.get("level", 1)), 1, MAX_PLAYER_LEVEL)
	player_dict["exp"] = maxi(0, int(player_dict.get("exp", 0)))
	player_dict["nextExp"] = exp_to_next_level(int(player_dict.get("level", 1)))
	player_dict["baseStats"] = _player_base_stats_from_player(player_dict)
	player_dict["statPoints"] = maxi(0, int(player_dict.get("statPoints", 0)))
	normalized["player"] = player_dict

	var raw_instances = normalized.get("petInstances", [])
	var has_instance_array := raw_instances is Array
	var instances: Array[Dictionary] = []
	if raw_instances is Array:
		for value in raw_instances:
			if value is Dictionary:
				var instance := _normalize_pet_instance(value as Dictionary)
				if not instance.is_empty():
					instances.append(instance)
	if instances.is_empty() and not has_instance_array:
		instances = default_profile().get("petInstances", [])
	normalized["petInstances"] = instances

	var drops: Array[Dictionary] = []
	var raw_drops = normalized.get("groundPetDrops", [])
	if raw_drops is Array:
		for value in raw_drops:
			if value is Dictionary:
				var drop := _normalize_ground_pet_drop(value as Dictionary)
				if not drop.is_empty():
					drops.append(drop)
	normalized["groundPetDrops"] = drops
	var has_backpack_slots := normalized.has(BACKPACK_SLOTS_KEY) and normalized.get(BACKPACK_SLOTS_KEY) is Array
	var backpack_extra_slots_value := clampi(int(normalized.get(BACKPACK_EXTRA_SLOTS_KEY, 0)), 0, BackpackModel.EXTRA_SLOT_LIMIT)
	normalized[BACKPACK_EXTRA_SLOTS_KEY] = backpack_extra_slots_value
	var backpack_slots_value := BackpackModel.normalize_slots(
		normalized.get(BACKPACK_SLOTS_KEY, []),
		BackpackModel.unlocked_slot_count(backpack_extra_slots_value)
	)
	if not has_backpack_slots:
		backpack_slots_value = BackpackModel.normalize_slots(
			BackpackModel.starting_slots(),
			BackpackModel.unlocked_slot_count(backpack_extra_slots_value)
		)
		var legacy_capture_tools = normalized.get(CAPTURE_TOOLS_KEY, null)
		if legacy_capture_tools is Dictionary:
			backpack_slots_value = BackpackModel.set_counts_for_context(
				backpack_slots_value,
				BackpackModel.CONTEXT_CAPTURE,
				CaptureToolCatalog.normalize_inventory(legacy_capture_tools as Dictionary)
			)
	var mailbox_messages_value := _normalize_mailbox_messages(normalized.get(MAILBOX_MESSAGES_KEY, []))
	var exp_pill_starter_version := int(normalized.get(EXP_PILL_STARTER_VERSION_KEY, 0))
	if exp_pill_starter_version < EXP_PILL_STARTER_VERSION:
		var missing_player_pills := maxi(0, 5 - BackpackModel.item_count(backpack_slots_value, ITEM_PLAYER_EXP_PILL_LV131) - _mailbox_item_count(mailbox_messages_value, ITEM_PLAYER_EXP_PILL_LV131, MAIL_EXP_PILL_STARTER_ID))
		var missing_pet_pills := maxi(0, 5 - BackpackModel.item_count(backpack_slots_value, ITEM_PET_EXP_PILL_LV131) - _mailbox_item_count(mailbox_messages_value, ITEM_PET_EXP_PILL_LV131, MAIL_EXP_PILL_STARTER_ID))
		var exp_pill_rewards: Array[Dictionary] = []
		if missing_player_pills > 0:
			exp_pill_rewards.append({"itemId": ITEM_PLAYER_EXP_PILL_LV131, "count": missing_player_pills})
		if missing_pet_pills > 0:
			exp_pill_rewards.append({"itemId": ITEM_PET_EXP_PILL_LV131, "count": missing_pet_pills})
		if not exp_pill_rewards.is_empty():
			var exp_pill_result := BackpackModel.add_items(backpack_slots_value, exp_pill_rewards)
			backpack_slots_value = exp_pill_result.get("slots", backpack_slots_value)
			var lost_exp_pills: Array = exp_pill_result.get("lost", [])
			if not lost_exp_pills.is_empty():
				mailbox_messages_value = _upsert_mailbox_message(mailbox_messages_value, MAIL_EXP_PILL_STARTER_ID, "系统补发：经验丹", "背包已满，经验丹已转入邮箱。请在30天内领取附件。", lost_exp_pills)
		if (
			BackpackModel.item_count(backpack_slots_value, ITEM_PLAYER_EXP_PILL_LV131) + _mailbox_item_count(mailbox_messages_value, ITEM_PLAYER_EXP_PILL_LV131, MAIL_EXP_PILL_STARTER_ID) >= 5
			and BackpackModel.item_count(backpack_slots_value, ITEM_PET_EXP_PILL_LV131) + _mailbox_item_count(mailbox_messages_value, ITEM_PET_EXP_PILL_LV131, MAIL_EXP_PILL_STARTER_ID) >= 5
		):
			exp_pill_starter_version = EXP_PILL_STARTER_VERSION
	normalized[EXP_PILL_STARTER_VERSION_KEY] = exp_pill_starter_version
	normalized[BACKPACK_SLOTS_KEY] = backpack_slots_value
	normalized[MAILBOX_MESSAGES_KEY] = mailbox_messages_value
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(backpack_slots_value)
	normalized[QUICK_SLOTS_KEY] = _normalize_quick_slots(normalized.get(QUICK_SLOTS_KEY, []))
	var equipment_slots_version := int(normalized.get(EQUIPMENT_SLOTS_VERSION_KEY, 1))
	var equipment_slots_value := _normalize_equipment_slots(normalized.get(EQUIPMENT_SLOTS_KEY, {}))
	var equipment_starter_set_version := int(normalized.get(EQUIPMENT_STARTER_SET_VERSION_KEY, 0))
	if equipment_starter_set_version < EQUIPMENT_STARTER_SET_VERSION and equipment_slots_value.is_empty():
		equipment_slots_value = starter_equipment_slots()
		equipment_starter_set_version = EQUIPMENT_STARTER_SET_VERSION
	if equipment_slots_version < 3:
		for slot_id in EquipmentModel.slot_ids():
			var equipped_item_id_value := str(equipment_slots_value.get(slot_id, ""))
			if equipped_item_id_value != "" and BackpackModel.item_count(backpack_slots_value, equipped_item_id_value) > 0:
				backpack_slots_value = BackpackModel.consume(backpack_slots_value, equipped_item_id_value, 1)
	normalized[BACKPACK_SLOTS_KEY] = backpack_slots_value
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(backpack_slots_value)
	normalized[EQUIPMENT_SLOTS_KEY] = equipment_slots_value
	var equipment_durability_value := _normalize_equipment_durability(equipment_slots_value, normalized.get(EQUIPMENT_DURABILITY_KEY, {}))
	normalized[EQUIPMENT_DURABILITY_KEY] = equipment_durability_value
	var equipment_enhancement_value := _normalize_equipment_enhancement(equipment_slots_value, normalized.get(EQUIPMENT_ENHANCEMENT_KEY, {}))
	normalized[EQUIPMENT_ENHANCEMENT_KEY] = equipment_enhancement_value
	normalized[EQUIPMENT_WEAR_COUNTERS_KEY] = _normalize_equipment_wear_counters(equipment_slots_value, normalized.get(EQUIPMENT_WEAR_COUNTERS_KEY, {}))
	normalized[EQUIPMENT_EXP_PILL_CHARGE_KEY] = _normalize_equipped_exp_pill_charge(equipment_slots_value, normalized.get(EQUIPMENT_EXP_PILL_CHARGE_KEY, {}))
	normalized[EQUIPMENT_SLOTS_VERSION_KEY] = EQUIPMENT_SLOTS_VERSION
	normalized[EQUIPMENT_STARTER_SET_VERSION_KEY] = equipment_starter_set_version
	normalized[STONE_COINS_KEY] = maxi(0, int(normalized.get(STONE_COINS_KEY, DEFAULT_STONE_COINS)))
	normalized[DIAMONDS_KEY] = maxi(0, int(normalized.get(DIAMONDS_KEY, DEFAULT_DIAMONDS)))
	player_dict = normalized.get("player", {}) as Dictionary
	var player_base_stats := _player_base_stats_from_player(player_dict)
	var player_level_for_equipment := maxi(1, int(player_dict.get("level", 1)))
	var player_rebirth_for_equipment := maxi(0, int(normalized.get(REBIRTH_COUNT_KEY, 0)))
	var player_bonus := _equipment_stat_bonus_from_slots(equipment_slots_value, equipment_durability_value, player_level_for_equipment, player_rebirth_for_equipment, equipment_enhancement_value)
	var player_max_hp := maxi(1, int(player_base_stats.get("maxHp", DEFAULT_PLAYER_BATTLE_STATS.get("maxHp", 120))) + int(player_bonus.get("maxHp", 0)))
	player_dict["maxHp"] = player_max_hp
	player_dict["hp"] = clampi(int(player_dict.get("hp", player_max_hp)), 1, player_max_hp)
	player_dict["baseStats"] = player_base_stats
	normalized["player"] = player_dict

	var had_quest_data := normalized.has(QUEST_STATES_KEY) or normalized.has(ACTIVE_QUEST_ID_KEY)
	var quest_states := QuestModel.normalize_states(normalized.get(QUEST_STATES_KEY, {}))
	var active_quest_id_value := str(normalized.get(ACTIVE_QUEST_ID_KEY, ""))
	if active_quest_id_value != "":
		var active_quest := QuestModel.quest_for_id(active_quest_id_value)
		var active_state := QuestModel.normalize_state(quest_states.get(active_quest_id_value, {}), active_quest_id_value)
		if active_quest.is_empty() or QuestModel.is_optional(active_quest) or str(active_state.get("status", QuestModel.STATUS_ACTIVE)) == QuestModel.STATUS_CLAIMED or not _quest_available_for_profile(active_quest, normalized):
			active_quest_id_value = ""
		else:
			quest_states[active_quest_id_value] = active_state
	if active_quest_id_value == "":
		active_quest_id_value = _first_available_unfinished_quest_id(quest_states, normalized)
		if active_quest_id_value == "" and not had_quest_data:
			active_quest_id_value = QuestModel.first_quest_id()
	if active_quest_id_value != "" and not quest_states.has(active_quest_id_value):
		quest_states[active_quest_id_value] = QuestModel.normalize_state({}, active_quest_id_value)
	normalized[ACTIVE_QUEST_ID_KEY] = active_quest_id_value
	normalized[QUEST_STATES_KEY] = quest_states

	var seen_form_ids := _valid_unique_form_id_array(normalized.get(PET_CODEX_SEEN_FORM_IDS_KEY, []))
	var captured_form_ids := _valid_unique_form_id_array(normalized.get(PET_CODEX_CAPTURED_FORM_IDS_KEY, []))
	for form_id in captured_form_ids:
		if not seen_form_ids.has(form_id):
			seen_form_ids.append(form_id)
	normalized[PET_CODEX_SEEN_FORM_IDS_KEY] = seen_form_ids
	normalized[PET_CODEX_CAPTURED_FORM_IDS_KEY] = captured_form_ids
	normalized[AUTO_BATTLE_SETTINGS_KEY] = AutoBattleSettingsModel.normalize_settings_for_available_spirits(
		normalized.get(AUTO_BATTLE_SETTINGS_KEY, {}),
		_equipment_spirit_ids_from_slots(equipment_slots_value, equipment_durability_value, player_level_for_equipment, player_rebirth_for_equipment)
	)
	normalized[AUTO_CAPTURE_SETTINGS_KEY] = AutoCaptureSettingsModel.normalize_settings(normalized.get(AUTO_CAPTURE_SETTINGS_KEY, {}))
	normalized[HANG_SETTINGS_KEY] = HangSettingsModel.normalize_settings(normalized.get(HANG_SETTINGS_KEY, {}))
	normalized[TRAINING_PARTNERS_KEY] = TrainingPartnerModel.normalize_partners(normalized.get(TRAINING_PARTNERS_KEY, []))
	normalized[RECORD_POINT_KEY] = _normalize_record_point(normalized.get(RECORD_POINT_KEY, {}))
	normalized[UNLOCKED_ABILITIES_KEY] = _valid_unique_ability_ids(normalized.get(UNLOCKED_ABILITIES_KEY, []))
	normalized[REBIRTH_TRIAL_PROOFS_KEY] = _normalize_rebirth_trial_proofs(normalized.get(REBIRTH_TRIAL_PROOFS_KEY, {}))
	normalized = RebirthModel.normalize_profile(normalized)

	var active_id := str(normalized.get("activePetInstanceId", ""))
	if active_id != "":
		var active_index := _pet_instance_index(instances, active_id)
		if active_index < 0 or str(instances[active_index].get("state", PET_STATE_STANDBY)) != PET_STATE_BATTLE:
			active_id = ""
	if active_id == "":
		active_id = _first_battle_pet_id({"petInstances": instances})
	normalized["activePetInstanceId"] = active_id
	normalized["nextPetInstanceSerial"] = maxi(int(normalized.get("nextPetInstanceSerial", instances.size() + 1)), _next_serial_from_instances(instances))
	normalized["nextPetDropSerial"] = maxi(int(normalized.get("nextPetDropSerial", 1)), _next_drop_serial_from_drops(drops))
	return normalized


static func _normalize_record_point(value) -> Dictionary:
	var source := value as Dictionary if value is Dictionary else {}
	var map_id := str(source.get("mapId", DEFAULT_RECORD_POINT_MAP_ID)).strip_edges()
	var spawn_name := str(source.get("spawnName", DEFAULT_RECORD_POINT_SPAWN_NAME)).strip_edges()
	var label := str(source.get("label", "")).strip_edges()
	if map_id == "":
		map_id = DEFAULT_RECORD_POINT_MAP_ID
	if spawn_name == "":
		spawn_name = DEFAULT_RECORD_POINT_SPAWN_NAME
	if label == "":
		label = DEFAULT_RECORD_POINT_LABEL
	return {
		"mapId": map_id,
		"spawnName": spawn_name,
		"label": label,
	}


static func _normalize_rebirth_trial_proofs(value) -> Dictionary:
	var source := value as Dictionary if value is Dictionary else {}
	var result := {}
	for raw_key in source.keys():
		var key := str(raw_key).strip_edges()
		var count := maxi(0, int(source.get(raw_key, 0)))
		if key != "" and count > 0:
			result[key] = count
	return result


static func _normalize_quick_slots(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for raw_item_id in value:
			var item_id := str(raw_item_id).strip_edges()
			result.append(item_id if item_can_quick_use(item_id) else "")
			if result.size() >= QUICK_SLOT_COUNT:
				break
	while result.size() < QUICK_SLOT_COUNT:
		result.append("")
	return result


static func apply_profile_to_battle_state(profile: Dictionary, state: Dictionary) -> Dictionary:
	var next_state := state.duplicate(true)
	var normalized := normalize_profile(profile)
	next_state["itemBag"] = battle_item_inventory(normalized)
	next_state["captureToolBag"] = capture_tool_inventory(normalized)
	next_state = _apply_profile_player_to_battle_state(normalized, next_state)
	var party := pet_party_for_battle(normalized)
	next_state["petParty"] = party
	var active_entry := _active_party_entry(party)
	if active_entry.is_empty():
		next_state["actors"] = _actors_without_id(next_state, "ally_pet")
	else:
		var active_actor := actor_from_pet_instance(active_entry, "ally_pet", "ally", "ally.front.3")
		if not active_actor.is_empty():
			next_state["actors"] = _actors_with_replaced_actor(next_state, active_actor)
	next_state = _apply_training_partners_to_battle_state(normalized, next_state)
	return next_state


static func _apply_profile_player_to_battle_state(profile: Dictionary, state: Dictionary) -> Dictionary:
	var next_state := state.duplicate(true)
	var player = profile.get("player", {})
	var player_dict := player as Dictionary if player is Dictionary else {}
	var actors: Array = next_state.get("actors", [])
	for index in range(actors.size()):
		if not (actors[index] is Dictionary):
			continue
		var actor := (actors[index] as Dictionary).duplicate(true)
		if str(actor.get("id", "")) != "ally_player":
			continue
		actor["name"] = str(player_dict.get("name", actor.get("name", "见习猎人")))
		actor["level"] = maxi(1, int(player_dict.get("level", actor.get("level", 1))))
		actor["exp"] = maxi(0, int(player_dict.get("exp", 0)))
		actor["nextExp"] = maxi(1, int(player_dict.get("nextExp", exp_to_next_level(int(actor.get("level", 1))))))
		var previous_max_hp := maxi(1, int(actor.get("maxHp", 1)))
		var previous_hp := clampi(int(actor.get("hp", previous_max_hp)), 0, previous_max_hp)
		var summary := player_stat_summary(profile)
		var current := summary.get("current", {}) as Dictionary
		var current_max_hp := maxi(1, int(current.get("maxHp", previous_max_hp)))
		actor["maxHp"] = current_max_hp
		actor["hp"] = clampi(int(player_dict.get("hp", previous_hp + current_max_hp - previous_max_hp)), 1, current_max_hp)
		for key in ["attack", "defense", "quick"]:
			actor[key] = maxi(1, int(current.get(key, actor.get(key, 1))))
		actor["equipmentSlots"] = equipment_slots(profile)
		actor["equipmentStatBonus"] = summary.get("bonus", {})
		actor["equipmentStatSummary"] = summary
		actor["spiritIds"] = equipment_spirit_ids(profile)
		actor["battleActionIds"] = equipment_battle_action_ids(profile)
		actor["attackActionId"] = equipment_attack_action_id(profile)
		actors[index] = actor
		break
	next_state["actors"] = actors
	return next_state


static func pet_party_for_battle(profile: Dictionary) -> Array[Dictionary]:
	var normalized := normalize_profile(profile)
	var active_id := str(normalized.get("activePetInstanceId", ""))
	var party: Array[Dictionary] = []
	if active_id != "":
		for instance in _pet_instances(normalized):
			if str(instance.get("instanceId", "")) == active_id and str(instance.get("state", PET_STATE_STANDBY)) == PET_STATE_BATTLE:
				var active_entry := instance.duplicate(true)
				active_entry["state"] = PET_STATE_BATTLE
				active_entry["actorId"] = "ally_pet"
				party.append(active_entry)
				break
	for instance in _pet_instances(normalized):
		if party.size() >= PARTY_LIMIT:
			break
		var instance_id := str(instance.get("instanceId", ""))
		if instance_id == "" or instance_id == active_id:
			continue
		var state := str(instance.get("state", PET_STATE_STANDBY))
		if state == PET_STATE_STORAGE:
			continue
		var entry := instance.duplicate(true)
		if state != PET_STATE_REST:
			entry["state"] = PET_STATE_STANDBY
		entry["actorId"] = ""
		party.append(entry)
	return party


static func actor_from_pet_instance(instance: Dictionary, actor_id: String, side: String, slot_id: String) -> Dictionary:
	var form_id := str(instance.get("formId", instance.get("templateId", "")))
	var actor := PetTemplateCatalog.actor_from_form(form_id, actor_id, side, "pet", slot_id, str(instance.get("name", "宠物")), {
		"hp": int(instance.get("hp", instance.get("maxHp", 1))),
		"maxHp": int(instance.get("maxHp", 1)),
		"quick": int(instance.get("quick", 50)),
		"attack": int(instance.get("attack", 12)),
		"defense": int(instance.get("defense", 6)),
	})
	if actor.is_empty():
		return {}
	actor["instanceId"] = str(instance.get("instanceId", ""))
	actor["petId"] = str(instance.get("instanceId", ""))
	actor["level"] = int(instance.get("level", 1))
	actor["exp"] = int(instance.get("exp", 0))
	actor["nextExp"] = int(instance.get("nextExp", exp_to_next_level(int(instance.get("level", 1)))))
	actor["activeSkillIds"] = _valid_unique_pet_skill_ids(instance.get("activeSkillIds", []))
	actor["petSkillSlots"] = pet_skill_slots_for_instance(instance)
	actor["petBattleState"] = PET_STATE_BATTLE
	for key in PET_INDIVIDUAL_FIELD_KEYS:
		if instance.has(key):
			actor[key] = instance.get(key)
	for key in PET_CULTIVATION_FIELD_KEYS:
		if instance.has(key):
			actor[key] = instance.get(key)
	return BattlePassiveCatalog.apply_actor_passive_effects(actor)


static func _apply_training_partners_to_battle_state(profile: Dictionary, state: Dictionary) -> Dictionary:
	var next_state := state.duplicate(true)
	var partners := training_partners(profile)
	for index in range(partners.size()):
		var partner := partners[index]
		var slot_number := TrainingPartnerModel.slot_number_for_index(index)
		var partner_actor := _training_partner_actor(partner, index, slot_number)
		if not partner_actor.is_empty():
			next_state["actors"] = _actors_with_replaced_actor(next_state, partner_actor)
		var pet_actor := _training_partner_pet_actor(partner, index, slot_number)
		if not pet_actor.is_empty():
			next_state["actors"] = _actors_with_replaced_actor(next_state, pet_actor)
	return next_state


static func _training_partner_actor(partner: Dictionary, index: int, slot_number: int) -> Dictionary:
	var max_hp := maxi(1, int(partner.get("maxHp", 120)))
	return {
		"id": "ally_training_partner_%d" % [index + 1],
		"trainingPartnerId": str(partner.get("partnerId", TrainingPartnerModel.partner_id_for_index(index))),
		"name": str(partner.get("name", TrainingPartnerModel.partner_name_for_index(index))),
		"side": "ally",
		"kind": "player",
		"slotId": "ally.back.%d" % slot_number,
		"level": maxi(1, int(partner.get("level", 1))),
		"exp": maxi(0, int(partner.get("exp", 0))),
		"nextExp": maxi(1, int(partner.get("nextExp", exp_to_next_level(int(partner.get("level", 1)))))),
		"hp": clampi(int(partner.get("hp", max_hp)), 1, max_hp),
		"maxHp": max_hp,
		"attack": maxi(1, int(partner.get("attack", 18))),
		"defense": maxi(1, int(partner.get("defense", 6))),
		"quick": maxi(1, int(partner.get("quick", 70))),
		"actionState": "idle",
		"statuses": BattleStatusModel.empty_statuses(),
		"statusResist": {},
		"statusImmune": {},
	}


static func _training_partner_pet_actor(partner: Dictionary, index: int, slot_number: int) -> Dictionary:
	var pet = partner.get("pet", {})
	if not (pet is Dictionary):
		return {}
	var pet_dict := (pet as Dictionary).duplicate(true)
	pet_dict["instanceId"] = "training_partner_pet_%d" % [index + 1]
	pet_dict["state"] = PET_STATE_BATTLE
	var actor := actor_from_pet_instance(
		pet_dict,
		"ally_training_partner_pet_%d" % [index + 1],
		"ally",
		"ally.front.%d" % slot_number
	)
	if actor.is_empty():
		return {}
	actor["trainingPartnerId"] = str(partner.get("partnerId", TrainingPartnerModel.partner_id_for_index(index)))
	return actor


static func battle_result_for_state(state: Dictionary) -> String:
	if battle_actor_knocked_away(state, BATTLE_PLAYER_ACTOR_ID):
		return "defeat"
	var living_enemies := 0
	var living_allies := 0
	for actor in _actors(state):
		if int(actor.get("hp", 0)) <= 0:
			continue
		match str(actor.get("side", "")):
			"enemy":
				living_enemies += 1
			"ally":
				living_allies += 1
	if living_enemies <= 0:
		return "victory"
	if living_allies <= 0:
		return "defeat"
	return "running"


static func apply_battle_result(profile: Dictionary, state: Dictionary, result_override: String = "") -> Dictionary:
	var next_profile := normalize_profile(profile)
	var knocked_away_actor_ids := battle_knocked_away_actor_ids(state)
	var player_knocked_away := knocked_away_actor_ids.has(BATTLE_PLAYER_ACTOR_ID)
	var active_pet_knocked_away := knocked_away_actor_ids.has(BATTLE_PET_ACTOR_ID)
	var ally_knocked_away_actor_ids := _battle_knocked_away_actor_ids_for_side(state, "ally")
	var enemy_knocked_away_actor_ids := _battle_knocked_away_actor_ids_for_side(state, "enemy")
	var state_item_bag = state.get("itemBag", _battle_item_inventory_from_slots(backpack_slots(next_profile)))
	if state_item_bag is Dictionary:
		next_profile = with_battle_item_inventory(next_profile, state_item_bag as Dictionary)
	var state_capture_tool_bag = state.get("captureToolBag", _capture_tool_inventory_from_slots(backpack_slots(next_profile)))
	if state_capture_tool_bag is Dictionary:
		next_profile = with_capture_tool_inventory(next_profile, state_capture_tool_bag as Dictionary)
	next_profile = _merge_battle_player(next_profile, state)
	next_profile = _merge_battle_pet_party(next_profile, state)
	next_profile = _with_codex_forms_seen_from_battle(next_profile, state)
	var result := result_override if result_override != "" else battle_result_for_state(state)
	var exp_reward := battle_exp_reward(state) if result == "victory" else 0
	var stone_coins_reward := BattleRewardCatalog.stone_coins_for_state(state) if result == "victory" else 0
	var level_up_lines: Array[String] = []
	var item_rewards: Array[Dictionary] = []
	var lost_item_rewards: Array[Dictionary] = []
	var mailed_item_rewards: Array[Dictionary] = []
	if exp_reward > 0:
		var player = next_profile.get("player", {}) as Dictionary
		var player_award := _grant_player_exp(next_profile, exp_reward)
		next_profile = player_award.get("profile", next_profile)
		var awarded_player := next_profile.get("player", player) as Dictionary
		var player_levels_gained := maxi(0, int(player_award.get("levelsGained", 0)))
		if bool(player_award.get("leveled", false)):
			level_up_lines.append("%s 升到 Lv%d，获得%d属性点。" % [
				str(player.get("name", "见习猎人")),
				int(awarded_player.get("level", 1)),
				player_levels_gained * PLAYER_STAT_POINTS_PER_LEVEL,
			])
		if int(player_award.get("chargedExp", 0)) > 0:
			level_up_lines.append("满级溢出%d经验存入经验丹。" % int(player_award.get("chargedExp", 0)))
		var active_id := str(next_profile.get("activePetInstanceId", ""))
		var instances: Array = next_profile.get("petInstances", [])
		for index in range(instances.size()):
			if not (instances[index] is Dictionary):
				continue
			var instance := instances[index] as Dictionary
			if str(instance.get("instanceId", "")) != active_id:
				continue
			var pet_award := _award_exp(instance, exp_reward, MAX_PET_LEVEL)
			instances[index] = pet_award.get("entry", instance)
			if bool(pet_award.get("leveled", false)):
				level_up_lines.append("%s 升到 Lv%d。" % [str(instance.get("name", "宠物")), int((pet_award.get("entry", {}) as Dictionary).get("level", 1))])
			break
		next_profile["petInstances"] = instances
		var partner_award := _award_training_partner_exp(next_profile, exp_reward)
		next_profile = partner_award.get("profile", next_profile)
		for line in partner_award.get("levelUpLines", []):
			level_up_lines.append(str(line))
	if result == "victory":
		var grant_result := grant_reward_bundle(next_profile, {
			"stoneCoins": stone_coins_reward,
			"items": BattleRewardCatalog.rewards_for_state(state),
		}, "battle_%s" % str(state.get("targetSeed", state.get("id", "wild"))), "战斗掉落")
		next_profile = grant_result.get("profile", next_profile)
		item_rewards = _item_amount_array(grant_result.get("addedItems", []))
		mailed_item_rewards = _item_amount_array(grant_result.get("mailedItems", []))
		next_profile = _record_rebirth_trial_battle_victory(next_profile, state)
	if result == "victory" or result == "defeat":
		var wear_result := apply_equipment_wear_from_battle_usage(next_profile, state.get("equipmentWearUsage", {}))
		next_profile = wear_result.get("profile", next_profile)
		for drop in wear_result.get("durabilityDrops", []):
			if not (drop is Dictionary):
				continue
			var drop_dict := drop as Dictionary
			level_up_lines.append("%s 耐久 -%d。" % [
				str(drop_dict.get("label", "装备")),
				maxi(1, int(drop_dict.get("amount", 1))),
			])
		for label in wear_result.get("brokenLabels", []):
			level_up_lines.append("%s 耐久耗尽，已失去效果。" % str(label))

	var capture_result := _captured_pet_result_from_state(next_profile, state)
	var captured_instances: Array[Dictionary] = capture_result.get("capturedPets", [])
	var lost_captured_instances: Array[Dictionary] = capture_result.get("lostCapturedPets", [])
	var auto_discarded_instances: Array[Dictionary] = capture_result.get("autoDiscardedPets", [])
	if not captured_instances.is_empty():
		var instances: Array = next_profile.get("petInstances", [])
		for captured in captured_instances:
			instances.append(captured)
			next_profile = _with_codex_form_recorded(next_profile, str(captured.get("formId", "")), true)
		next_profile["petInstances"] = instances
		next_profile["nextPetInstanceSerial"] = _next_serial_from_instances(_pet_instances(next_profile))
	next_profile = normalize_profile(next_profile)
	var log_lines := battle_result_log_lines(result, exp_reward, captured_instances, level_up_lines, next_profile, item_rewards, lost_item_rewards, stone_coins_reward, lost_captured_instances, auto_discarded_instances, mailed_item_rewards)
	for line in _battle_knockaway_log_lines(state, active_pet_knocked_away):
		if not log_lines.has(line):
			log_lines.append(line)

	return {
		"profile": next_profile,
		"result": result,
		"playerKnockedAway": player_knocked_away,
		"activePetKnockedAway": active_pet_knocked_away,
		"knockedAwayActorIds": knocked_away_actor_ids,
		"allyKnockedAwayActorIds": ally_knocked_away_actor_ids,
		"enemyKnockedAwayActorIds": enemy_knocked_away_actor_ids,
		"returnToRecordPoint": player_knocked_away,
		"expReward": exp_reward,
		"stoneCoinsReward": stone_coins_reward,
		"itemRewards": item_rewards,
		"lostItemRewards": lost_item_rewards,
		"mailedItemRewards": mailed_item_rewards,
		"capturedPets": captured_instances,
		"lostCapturedPets": lost_captured_instances,
		"autoDiscardedPets": auto_discarded_instances,
		"logLines": log_lines,
	}


static func battle_result_log_lines(result: String, exp_reward: int, captured_instances: Array[Dictionary], level_up_lines: Array[String], profile: Dictionary, item_rewards: Array[Dictionary] = [], lost_item_rewards: Array[Dictionary] = [], stone_coins_reward: int = 0, lost_captured_instances: Array[Dictionary] = [], auto_discarded_instances: Array[Dictionary] = [], mailed_item_rewards: Array[Dictionary] = []) -> Array[String]:
	var lines: Array[String] = []
	match result:
		"victory":
			if stone_coins_reward > 0:
				lines.append("战斗胜利，获得 %d 经验、%d 石币。" % [exp_reward, stone_coins_reward])
			else:
				lines.append("战斗胜利，获得 %d 经验。" % exp_reward)
			var second_parts: Array[String] = []
			var active_pet := _active_profile_pet(profile)
			if not active_pet.is_empty() and exp_reward > 0:
				second_parts.append("%s获得经验" % str(active_pet.get("name", "宠物")))
			if not captured_instances.is_empty():
				var captured_parts: Array[String] = []
				for captured in captured_instances:
					captured_parts.append(_captured_pet_log_part(captured))
				second_parts.append("；".join(captured_parts))
			if not second_parts.is_empty():
				lines.append("。".join(second_parts) + "。")
			if not auto_discarded_instances.is_empty():
				var discard_parts: Array[String] = []
				for discarded in auto_discarded_instances:
					discard_parts.append(_auto_discarded_pet_log_part(discarded))
				lines.append("；".join(discard_parts) + "。")
			if not lost_captured_instances.is_empty():
				var lost_parts: Array[String] = []
				for lost in lost_captured_instances:
					lost_parts.append(_lost_captured_pet_log_part(lost))
				lines.append("；".join(lost_parts) + "。")
			var item_reward_text := BackpackModel.item_amounts_text(item_rewards)
			if item_reward_text != "":
				lines.append("获得 %s。" % item_reward_text)
			var lost_item_reward_text := BackpackModel.item_amounts_text(lost_item_rewards)
			if lost_item_reward_text != "":
				lines.append("背包已满，未获得 %s。" % lost_item_reward_text)
			var mailed_item_reward_text := BackpackModel.item_amounts_text(mailed_item_rewards)
			if mailed_item_reward_text != "":
				lines.append("背包已满，%s 已发送邮箱。" % mailed_item_reward_text)
		"defeat":
			lines.append("战斗失败。")
			_append_capture_result_lines(lines, captured_instances, lost_captured_instances, auto_discarded_instances)
		"escape":
			lines.append("成功逃跑。")
			_append_capture_result_lines(lines, captured_instances, lost_captured_instances, auto_discarded_instances)
		_:
			lines.append("战斗结束。")
			_append_capture_result_lines(lines, captured_instances, lost_captured_instances, auto_discarded_instances)
	for line in level_up_lines:
		if lines.size() >= 4:
			break
		lines.append(line)
	return lines


static func _append_capture_result_lines(lines: Array[String], captured_instances: Array[Dictionary], lost_captured_instances: Array[Dictionary], auto_discarded_instances: Array[Dictionary]) -> void:
	if not captured_instances.is_empty():
		var captured_parts: Array[String] = []
		for captured in captured_instances:
			captured_parts.append(_captured_pet_log_part(captured))
		lines.append("；".join(captured_parts) + "。")
	if not auto_discarded_instances.is_empty():
		var discard_parts: Array[String] = []
		for discarded in auto_discarded_instances:
			discard_parts.append(_auto_discarded_pet_log_part(discarded))
		lines.append("；".join(discard_parts) + "。")
	if not lost_captured_instances.is_empty():
		var lost_parts: Array[String] = []
		for lost in lost_captured_instances:
			lost_parts.append(_lost_captured_pet_log_part(lost))
		lines.append("；".join(lost_parts) + "。")


static func _item_amount_array(value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if value is Array:
		for entry_value in value:
			if not (entry_value is Dictionary):
				continue
			var entry := entry_value as Dictionary
			var item_id := str(entry.get("itemId", ""))
			var count := maxi(0, int(entry.get("count", 0)))
			if item_id != "" and count > 0:
				result.append({
					"itemId": item_id,
					"count": count,
				})
	return result


static func _item_amount_count(value, item_id: String) -> int:
	var total := 0
	if value is Array:
		for entry_value in value:
			if not (entry_value is Dictionary):
				continue
			var entry := entry_value as Dictionary
			if str(entry.get("itemId", "")) == item_id:
				total += maxi(0, int(entry.get("count", 0)))
	return total


static func _captured_pet_log_part(captured: Dictionary) -> String:
	var pet_name := str(captured.get("name", "宠物"))
	var level := maxi(1, int(captured.get("level", 1)))
	var power := _captured_pet_power(captured)
	var destination := "队伍已满，已送入兽栏" if str(captured.get("state", PET_STATE_STANDBY)) == PET_STATE_STORAGE else "已加入队伍"
	return "捕获%s Lv%d，战力%d，%s" % [pet_name, level, power, destination]


static func _lost_captured_pet_log_part(captured: Dictionary) -> String:
	var pet_name := str(captured.get("name", "宠物"))
	var level := maxi(1, int(captured.get("level", 1)))
	var power := _captured_pet_power(captured)
	return "捕获%s Lv%d，战力%d，但兽栏和宠物栏满，请清理" % [pet_name, level, power]


static func _auto_discarded_pet_log_part(captured: Dictionary) -> String:
	var pet_name := str(captured.get("name", "宠物"))
	var level := maxi(1, int(captured.get("level", 1)))
	var power := _captured_pet_power(captured)
	var threshold := maxi(0, int(captured.get("discardThreshold", AutoCaptureSettingsModel.DEFAULT_LOW_POWER_THRESHOLD)))
	return "捕获%s Lv%d，战力%d，低于%d，已自动丢弃" % [pet_name, level, power, threshold]


static func _captured_pet_power(captured: Dictionary) -> int:
	return maxi(0, int(captured.get("combatPower", PetPowerModel.combat_power_for_pet(captured))))


static func battle_exp_reward(state: Dictionary) -> int:
	var total := 0
	for actor in _actors(state):
		if str(actor.get("side", "")) != "enemy":
			continue
		if int(actor.get("hp", 0)) > 0 and not bool(actor.get("captured", false)):
			continue
		var max_hp := int(actor.get("maxHp", 1))
		var attack := int(actor.get("attack", 8))
		var defense := int(actor.get("defense", 6))
		var quick := int(actor.get("quick", 40))
		total += maxi(8, int(round(float(max_hp) / 10.0)) + attack + defense + int(round(float(quick) / 8.0)))
	return maxi(0, total)


static func exp_to_next_level(level: int) -> int:
	var safe_level := maxi(1, level)
	var base := float(80 + safe_level * 40) * pow(1.052, float(safe_level - 1))
	var high_level_shape := pow(float(safe_level), 2.15) * 2.0
	return maxi(1, int(roundf(base + high_level_shape)))


static func exp_grant_for_level(target_level: int) -> int:
	var safe_target := clampi(target_level, 1, MAX_PLAYER_LEVEL)
	var total := 0
	for level in range(1, safe_target):
		total += exp_to_next_level(level)
	return total


static func use_world_player_exp_item(profile: Dictionary, item_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var item_label := BackpackModel.label_for(item_id, "人物经验丹")
	if not BackpackModel.item_can_world_player_exp(item_id):
		return {"ok": false, "profile": normalized, "message": "%s 不能给人物使用。" % item_label}
	if backpack_item_count(normalized, item_id) <= 0:
		return {"ok": false, "profile": normalized, "message": "%s 不够了。" % item_label}
	var item_level := BackpackModel.world_exp_level_for(item_id)
	var grant_exp := exp_grant_for_level(item_level)
	var grant := _grant_player_exp(normalized, grant_exp)
	normalized = grant.get("profile", normalized)
	normalized[BACKPACK_SLOTS_KEY] = BackpackModel.consume(backpack_slots(normalized), item_id, 1)
	normalized = normalize_profile(normalized)
	var after_player := normalized.get("player", {}) as Dictionary
	var message := "%s 使用%s，获得%d经验，当前 Lv%d。" % [
		str(after_player.get("name", "见习猎人")),
		item_label,
		grant_exp,
		int(after_player.get("level", 1)),
	]
	if int(grant.get("levelsGained", 0)) > 0:
		message = "%s 使用%s，获得%d经验，升到 Lv%d。" % [
			str(after_player.get("name", "见习猎人")),
			item_label,
			grant_exp,
			int(after_player.get("level", 1)),
		]
	if int(grant.get("chargedExp", 0)) > 0:
		message += " 溢出%d经验存入经验丹。" % int(grant.get("chargedExp", 0))
	elif int(grant.get("overflowExp", 0)) > 0:
		message += " 人物已满级，多余经验未保存。"
	return {
		"ok": true,
		"profile": normalized,
		"message": message,
		"itemId": item_id,
		"exp": grant_exp,
		"levelsGained": int(grant.get("levelsGained", 0)),
		"chargedExp": int(grant.get("chargedExp", 0)),
	}


static func use_world_pet_exp_item(profile: Dictionary, item_id: String, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var item_label := BackpackModel.label_for(item_id, "宠物经验丹")
	if not BackpackModel.item_can_world_pet_exp(item_id):
		return {"ok": false, "profile": normalized, "message": "%s 不能给宠物使用。" % item_label}
	if backpack_item_count(normalized, item_id) <= 0:
		return {"ok": false, "profile": normalized, "message": "%s 不够了。" % item_label}
	var instances: Array = normalized.get("petInstances", [])
	var item_level := BackpackModel.world_exp_level_for(item_id)
	var grant_exp := exp_grant_for_level(item_level)
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("instanceId", "")) != instance_id:
			instances[index] = instance
			continue
		if int(instance.get("level", 1)) >= MAX_PET_LEVEL:
			return {"ok": false, "profile": normalized, "message": "%s 已满级。" % str(instance.get("name", "宠物"))}
		var award := _award_exp(instance, grant_exp, MAX_PET_LEVEL)
		var next_instance := award.get("entry", instance) as Dictionary
		instances[index] = next_instance
		normalized["petInstances"] = instances
		normalized[BACKPACK_SLOTS_KEY] = BackpackModel.consume(backpack_slots(normalized), item_id, 1)
		normalized = normalize_profile(normalized)
		var message := "%s 使用%s，获得%d经验，当前 Lv%d。" % [
			str(next_instance.get("name", "宠物")),
			item_label,
			grant_exp,
			int(next_instance.get("level", 1)),
		]
		if int(award.get("levelsGained", 0)) > 0:
			message = "%s 使用%s，获得%d经验，升到 Lv%d。" % [
				str(next_instance.get("name", "宠物")),
				item_label,
				grant_exp,
				int(next_instance.get("level", 1)),
			]
		return {
			"ok": true,
			"profile": normalized,
			"message": message,
			"itemId": item_id,
			"instanceId": instance_id,
			"exp": grant_exp,
			"levelsGained": int(award.get("levelsGained", 0)),
		}
	return {"ok": false, "profile": normalized, "message": "没有找到这只宠物。"}


static func _grant_player_exp(profile: Dictionary, amount: int) -> Dictionary:
	var normalized := normalize_profile(profile)
	var player := normalized.get("player", {}) as Dictionary
	var player_award := _award_exp(player, amount, MAX_PLAYER_LEVEL)
	var awarded_player := player_award.get("entry", player) as Dictionary
	var player_levels_gained := maxi(0, int(player_award.get("levelsGained", 0)))
	if player_levels_gained > 0:
		awarded_player["statPoints"] = maxi(0, int(awarded_player.get("statPoints", 0))) + player_levels_gained * PLAYER_STAT_POINTS_PER_LEVEL
	normalized["player"] = awarded_player
	var charge := _charge_equipped_player_exp_pill(normalized, int(player_award.get("overflowExp", 0)))
	normalized = charge.get("profile", normalized)
	return {
		"profile": normalize_profile(normalized),
		"leveled": bool(player_award.get("leveled", false)),
		"levelsGained": player_levels_gained,
		"overflowExp": int(player_award.get("overflowExp", 0)),
		"chargedExp": int(charge.get("chargedExp", 0)),
		"pillLevelsGained": int(charge.get("pillLevelsGained", 0)),
	}


static func _charge_equipped_player_exp_pill(profile: Dictionary, amount: int) -> Dictionary:
	var normalized := normalize_profile(profile)
	var overflow := maxi(0, amount)
	if overflow <= 0:
		return {"profile": normalized, "chargedExp": 0, "pillLevelsGained": 0}
	var slots := equipment_slots(normalized)
	var item_id := str(slots.get(EquipmentModel.SLOT_EXP_PILL, ""))
	if item_id == "" or not BackpackModel.item_can_world_player_exp(item_id):
		return {"profile": normalized, "chargedExp": 0, "pillLevelsGained": 0}
	var charge := _normalize_equipped_exp_pill_charge(slots, normalized.get(EQUIPMENT_EXP_PILL_CHARGE_KEY, {}))
	var before_level := maxi(1, int(charge.get("level", BackpackModel.world_exp_level_for(item_id))))
	var charge_award := _award_exp(charge, overflow, MAX_PLAYER_LEVEL)
	var next_charge := charge_award.get("entry", charge) as Dictionary
	next_charge["itemId"] = item_id
	normalized[EQUIPMENT_EXP_PILL_CHARGE_KEY] = next_charge
	return {
		"profile": normalize_profile(normalized),
		"chargedExp": overflow,
		"pillLevelsGained": maxi(0, int(next_charge.get("level", before_level)) - before_level),
	}


static func _award_exp(entry: Dictionary, amount: int, max_level: int = MAX_PLAYER_LEVEL) -> Dictionary:
	var next_entry := entry.duplicate(true)
	var safe_max_level := maxi(1, max_level)
	var level := clampi(int(next_entry.get("level", 1)), 1, safe_max_level)
	var start_level := level
	var exp := maxi(0, int(next_entry.get("exp", 0))) + maxi(0, amount)
	var next_exp := exp_to_next_level(level)
	var leveled := false
	while level < safe_max_level and exp >= next_exp:
		exp -= next_exp
		level += 1
		next_exp = exp_to_next_level(level)
		leveled = true
	var overflow_exp := 0
	if level >= safe_max_level and exp > 0:
		overflow_exp = exp
		exp = 0
	next_entry["level"] = level
	next_entry["exp"] = exp
	next_entry["nextExp"] = next_exp
	return {
		"entry": next_entry,
		"leveled": leveled,
		"levelsGained": maxi(0, level - start_level),
		"overflowExp": overflow_exp,
	}


static func _award_training_partner_exp(profile: Dictionary, amount: int) -> Dictionary:
	var next_profile := profile.duplicate(true)
	var partners := training_partners(next_profile)
	var lines: Array[String] = []
	for index in range(partners.size()):
		var partner := partners[index]
		var before_level := maxi(1, int(partner.get("level", 1)))
		var partner_award := _award_exp(partner, amount)
		partner = partner_award.get("entry", partner)
		var after_level := maxi(1, int(partner.get("level", before_level)))
		if after_level > before_level:
			partner = _grow_training_partner_stats(partner, after_level - before_level)
			lines.append("%s 升到 Lv%d。" % [str(partner.get("name", TrainingPartnerModel.partner_name_for_index(index))), after_level])
		var pet = partner.get("pet", {})
		if pet is Dictionary:
			var pet_dict := (pet as Dictionary).duplicate(true)
			var pet_before_level := maxi(1, int(pet_dict.get("level", 1)))
			var pet_award := _award_exp(pet_dict, amount)
			pet_dict = pet_award.get("entry", pet_dict)
			var pet_after_level := maxi(1, int(pet_dict.get("level", pet_before_level)))
			if pet_after_level > pet_before_level:
				pet_dict = _normalize_pet_instance(pet_dict)
				lines.append("%s 升到 Lv%d。" % [str(pet_dict.get("name", "陪练宠物")), pet_after_level])
			partner["pet"] = pet_dict
		partners[index] = TrainingPartnerModel.normalize_partner(partner, index)
	next_profile[TRAINING_PARTNERS_KEY] = partners
	return {
		"profile": normalize_profile(next_profile),
		"levelUpLines": lines,
	}


static func _grow_training_partner_stats(partner: Dictionary, levels: int) -> Dictionary:
	var next_partner := partner.duplicate(true)
	var level_count := maxi(0, levels)
	next_partner["maxHp"] = maxi(1, int(next_partner.get("maxHp", 120)) + level_count * 8)
	next_partner["hp"] = maxi(1, int(next_partner.get("hp", next_partner.get("maxHp", 120))) + level_count * 8)
	next_partner["attack"] = maxi(1, int(next_partner.get("attack", 18)) + level_count * 2)
	next_partner["defense"] = maxi(1, int(next_partner.get("defense", 6)) + level_count)
	next_partner["quick"] = maxi(1, int(next_partner.get("quick", 70)) + level_count)
	return next_partner


static func _grow_training_partner_pet_stats(pet: Dictionary, levels: int) -> Dictionary:
	var next_pet := pet.duplicate(true)
	var level_count := maxi(0, levels)
	next_pet["maxHp"] = maxi(1, int(next_pet.get("maxHp", 90)) + level_count * 7)
	next_pet["hp"] = maxi(1, int(next_pet.get("hp", next_pet.get("maxHp", 90))) + level_count * 7)
	next_pet["attack"] = maxi(1, int(next_pet.get("attack", 14)) + level_count * 2)
	next_pet["defense"] = maxi(1, int(next_pet.get("defense", 8)) + level_count)
	next_pet["quick"] = maxi(1, int(next_pet.get("quick", 68)) + level_count)
	return next_pet


static func _merge_battle_pet_party(profile: Dictionary, state: Dictionary) -> Dictionary:
	var next_profile := profile.duplicate(true)
	var instances: Array = next_profile.get("petInstances", [])
	for entry_value in state.get("petParty", []):
		if not (entry_value is Dictionary):
			continue
		var entry := entry_value as Dictionary
		var instance_id := str(entry.get("instanceId", entry.get("petId", "")))
		if instance_id == "":
			continue
		for index in range(instances.size()):
			var instance := instances[index] as Dictionary
			if str(instance.get("instanceId", "")) != instance_id:
				continue
			var copy_keys: Array[String] = ["name", "state", "hp", "maxHp", "quick", "attack", "defense", "formId", "templateId", "lineId", "lineName", "subtypeId", "subtypeName", "formName", "growthProfileId", "elements", "activeSkillIds", "petSkillSlots", "forgottenSkillIds", "passiveSkillIds"]
			copy_keys.append_array(PET_INDIVIDUAL_FIELD_KEYS)
			copy_keys.append_array(PET_CULTIVATION_FIELD_KEYS)
			for key in copy_keys:
				if entry.has(key):
					instance[key] = entry.get(key)
			instances[index] = instance
			break
	next_profile["petInstances"] = instances
	if battle_actor_knocked_away(state, BATTLE_PET_ACTOR_ID):
		next_profile = _with_active_battle_pet_rest(next_profile, state)
	return next_profile


static func _merge_battle_player(profile: Dictionary, state: Dictionary) -> Dictionary:
	var next_profile := profile.duplicate(true)
	for actor in _actors(state):
		if str(actor.get("id", "")) != "ally_player":
			continue
		var player = next_profile.get("player", {}) as Dictionary
		var max_hp := maxi(1, int(actor.get("maxHp", player.get("maxHp", DEFAULT_PLAYER_BATTLE_STATS.get("maxHp", 120)))))
		player["maxHp"] = max_hp
		player["hp"] = clampi(maxi(1, int(actor.get("hp", player.get("hp", max_hp)))), 1, max_hp)
		next_profile["player"] = player
		return next_profile
	return next_profile


static func _with_active_battle_pet_rest(profile: Dictionary, state: Dictionary) -> Dictionary:
	var next_profile := profile.duplicate(true)
	var active_id := str(next_profile.get("activePetInstanceId", ""))
	var pet_actor := _battle_actor_by_id(state, BATTLE_PET_ACTOR_ID)
	if active_id == "" and not pet_actor.is_empty():
		active_id = str(pet_actor.get("instanceId", pet_actor.get("petId", "")))
	if active_id == "":
		return next_profile
	var instances: Array = next_profile.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("instanceId", "")) != active_id:
			instances[index] = instance
			continue
		instance["state"] = PET_STATE_REST
		instance["hp"] = 0
		instances[index] = instance
		break
	next_profile["petInstances"] = instances
	if str(next_profile.get("activePetInstanceId", "")) == active_id:
		next_profile["activePetInstanceId"] = ""
	return next_profile


static func _with_codex_forms_seen_from_battle(profile: Dictionary, state: Dictionary) -> Dictionary:
	var next_profile := profile.duplicate(true)
	for actor in _actors(state):
		if str(actor.get("side", "")) != "enemy":
			continue
		var form_id := str(actor.get("formId", actor.get("templateId", "")))
		if form_id == "":
			continue
		next_profile = _with_codex_form_recorded(next_profile, form_id, bool(actor.get("captured", false)))
	return next_profile


static func _battle_knocked_away_actor_ids_for_side(state: Dictionary, side: String) -> Array[String]:
	var result: Array[String] = []
	for actor in _actors(state):
		var actor_id := str(actor.get("id", ""))
		if actor_id != "" and str(actor.get("side", "")) == side and _actor_knocked_away(actor):
			result.append(actor_id)
	return result


static func _battle_knockaway_log_lines(state: Dictionary, active_pet_knocked_away: bool) -> Array[String]:
	var lines: Array[String] = []
	if active_pet_knocked_away:
		var pet_name := _battle_actor_name(state, BATTLE_PET_ACTOR_ID, "宠物")
		lines.append("%s被击飞，进入休息状态。" % pet_name)
	return lines


static func _battle_actor_name(state: Dictionary, actor_id: String, fallback: String) -> String:
	var actor := _battle_actor_by_id(state, actor_id)
	return str(actor.get("name", fallback)) if not actor.is_empty() else fallback


static func _battle_actor_by_id(state: Dictionary, actor_id: String) -> Dictionary:
	for actor in _actors(state):
		if str(actor.get("id", "")) == actor_id:
			return actor
	return {}


static func _actor_knocked_away(actor: Dictionary) -> bool:
	return bool(actor.get("launched", false)) or str(actor.get("actionState", "")) == "launched" or not bool(actor.get("revivable", true))


static func _with_codex_form_recorded(profile: Dictionary, form_id: String, captured: bool) -> Dictionary:
	var normalized_form_id := form_id.strip_edges()
	if normalized_form_id == "" or PetTemplateCatalog.runtime_template_for_form(normalized_form_id).is_empty():
		return profile.duplicate(true)
	var next_profile := profile.duplicate(true)
	var seen_ids := _valid_unique_form_id_array(next_profile.get(PET_CODEX_SEEN_FORM_IDS_KEY, []))
	if not seen_ids.has(normalized_form_id):
		seen_ids.append(normalized_form_id)
	next_profile[PET_CODEX_SEEN_FORM_IDS_KEY] = seen_ids
	if captured:
		var captured_ids := _valid_unique_form_id_array(next_profile.get(PET_CODEX_CAPTURED_FORM_IDS_KEY, []))
		if not captured_ids.has(normalized_form_id):
			captured_ids.append(normalized_form_id)
		next_profile[PET_CODEX_CAPTURED_FORM_IDS_KEY] = captured_ids
	return next_profile


static func _record_rebirth_trial_battle_victory(profile: Dictionary, state: Dictionary) -> Dictionary:
	var group_id := str(state.get("sourceEncounterGroupId", state.get("encounterGroupId", "")))
	if group_id != REBIRTH_FINAL_BOSS_PROOF_ID:
		return profile
	return with_rebirth_trial_proof_count(profile, REBIRTH_FINAL_BOSS_PROOF_ID, rebirth_trial_proof_count(profile, REBIRTH_FINAL_BOSS_PROOF_ID) + 1)


static func _owned_pet_form_counts(profile: Dictionary) -> Dictionary:
	var counts := {}
	for instance in _pet_instances(profile):
		var form_id := str(instance.get("formId", instance.get("templateId", "")))
		if form_id == "":
			continue
		counts[form_id] = int(counts.get(form_id, 0)) + 1
	return counts


static func _captured_pet_instances_from_state(profile: Dictionary, state: Dictionary) -> Array[Dictionary]:
	return _captured_pet_result_from_state(profile, state).get("capturedPets", [])


static func _captured_pet_result_from_state(profile: Dictionary, state: Dictionary) -> Dictionary:
	var captured_instances: Array[Dictionary] = []
	var lost_captured_instances: Array[Dictionary] = []
	var auto_discarded_instances: Array[Dictionary] = []
	var serial := maxi(int(profile.get("nextPetInstanceSerial", 1)), _next_serial_from_instances(_pet_instances(profile)))
	var occupied_party_count := _party_visible_instance_count(profile)
	var occupied_storage_count := _storage_instance_count(profile)
	var capture_settings := auto_capture_settings(profile)
	var auto_discard_enabled := (
		bool(capture_settings.get(AutoCaptureSettingsModel.ENABLED_KEY, false))
		and bool(capture_settings.get(AutoCaptureSettingsModel.AUTO_DISCARD_LOW_POWER_KEY, true))
	)
	var auto_discard_threshold := maxi(0, int(capture_settings.get(AutoCaptureSettingsModel.LOW_POWER_THRESHOLD_KEY, AutoCaptureSettingsModel.DEFAULT_LOW_POWER_THRESHOLD)))
	for actor in _actors(state):
		if not bool(actor.get("captured", false)):
			continue
		var form_id := str(actor.get("formId", actor.get("templateId", "")))
		if form_id == "":
			continue
		var instance_id := "pet_captured_%d" % serial
		serial += 1
		var state_name := PET_STATE_STANDBY
		var can_keep := true
		if occupied_party_count < PARTY_LIMIT:
			state_name = PET_STATE_STANDBY
		elif occupied_storage_count < STORAGE_LIMIT:
			state_name = PET_STATE_STORAGE
		else:
			can_keep = false
		var capture_serial := serial - 1
		var captured := _pet_instance_from_form(instance_id, str(actor.get("name", actor.get("formName", "宠物"))), form_id, state_name, maxi(1, int(actor.get("level", 1))), {
			"hp": maxi(1, int(actor.get("maxHp", actor.get("hp", 1)))),
			"maxHp": int(actor.get("maxHp", 1)),
			"quick": int(actor.get("quick", 50)),
			"attack": int(actor.get("attack", 12)),
			"defense": int(actor.get("defense", 6)),
			"individualSeed": _capture_individual_seed(state, actor, capture_serial),
		})
		if captured.is_empty():
			continue
		var combat_power := PetPowerModel.combat_power_for_pet(captured)
		captured["combatPower"] = combat_power
		captured["capturedSerial"] = serial - 1
		captured["isNew"] = true
		if auto_discard_enabled and combat_power < auto_discard_threshold:
			captured["discardThreshold"] = auto_discard_threshold
			auto_discarded_instances.append(captured)
			continue
		if not can_keep:
			lost_captured_instances.append(captured)
			continue
		captured_instances.append(captured)
		if state_name == PET_STATE_STORAGE:
			occupied_storage_count += 1
		else:
			occupied_party_count += 1
	return {
		"capturedPets": captured_instances,
		"lostCapturedPets": lost_captured_instances,
		"autoDiscardedPets": auto_discarded_instances,
	}


static func _capture_individual_seed(state: Dictionary, actor: Dictionary, capture_serial: int) -> String:
	return "capture:%s:%s:%s:%d:%d" % [
		str(state.get("id", "battle")),
		str(state.get("sourceZoneId", state.get("sourceEncounterGroupId", ""))),
		str(actor.get("formId", actor.get("templateId", ""))),
		maxi(1, int(actor.get("level", 1))),
		maxi(1, capture_serial),
	]


static func _pet_instance_from_form(instance_id: String, pet_name: String, form_id: String, state: String, level: int, stat_overrides: Dictionary = {}) -> Dictionary:
	var template := PetTemplateCatalog.runtime_template_for_form(form_id)
	if template.is_empty():
		return {}
	var level_value := clampi(level, 1, MAX_PET_LEVEL)
	var seed := str(stat_overrides.get("individualSeed", instance_id)).strip_edges()
	var growth_rates := _pet_growth_rates(str(template.get("growthProfileId", "balanced")))
	var growth_snapshot := PetIndividualGrowthModel.growth_snapshot(template, {
		"instanceId": instance_id,
		"formId": form_id,
		"individualSeed": seed,
		"individualVariance": stat_overrides.get("individualVariance", {}),
	}, level_value, growth_rates, seed)
	var grown_stats: Dictionary = growth_snapshot.get("finalStats", {})
	var max_hp := maxi(1, int(grown_stats.get("maxHp", 1)))
	var hp := int(stat_overrides.get("hp", max_hp))
	if stat_overrides.has("maxHp") and hp >= maxi(1, int(stat_overrides.get("maxHp", max_hp))):
		hp = max_hp
	var instance := {
		"instanceId": instance_id,
		"petId": instance_id,
		"templateId": form_id,
		"formId": form_id,
		"name": pet_name if pet_name != "" else str(template.get("formName", "宠物")),
		"state": state,
		"level": level_value,
		"exp": 0,
		"nextExp": exp_to_next_level(level_value),
		"hp": clampi(hp, 0, max_hp),
		"maxHp": max_hp,
		"quick": int(grown_stats.get("quick", 1)),
		"attack": int(grown_stats.get("attack", 1)),
		"defense": int(grown_stats.get("defense", 1)),
		"growthTierId": str(growth_snapshot.get("growthTierId", template.get("growthProfileId", "balanced"))),
		"growthTierLabel": str(growth_snapshot.get("growthTierLabel", growth_profile_label(str(template.get("growthProfileId", ""))))),
		"individualSeed": seed,
		"individualVariance": growth_snapshot.get("individualVariance", {}),
		"individualQualityScore": int(growth_snapshot.get("individualQualityScore", 5000)),
		"individualQualityLabel": str(growth_snapshot.get("individualQualityLabel", "普通")),
		"initialStats": growth_snapshot.get("initialStats", {}),
		"growthRecord": growth_snapshot.get("growthRecord", {}),
	}
	for key in ["lineId", "lineName", "subtypeId", "subtypeName", "formName", "growthProfileId", "elements", "activeSkillIds", "petSkillSlots", "passiveSkillIds"]:
		if template.has(key):
			instance[key] = template.get(key)
	return _normalize_pet_instance(instance)


static func _normalize_pet_instance(value: Dictionary) -> Dictionary:
	var instance := value.duplicate(true)
	var instance_id := str(instance.get("instanceId", instance.get("petId", "")))
	var form_id := str(instance.get("formId", instance.get("templateId", "")))
	if instance_id == "" or form_id == "":
		return {}
	var template := PetTemplateCatalog.runtime_template_for_form(form_id)
	instance["instanceId"] = instance_id
	instance["petId"] = instance_id
	instance["formId"] = form_id
	instance["templateId"] = form_id
	instance["name"] = str(instance.get("name", template.get("formName", "宠物")))
	instance["state"] = str(instance.get("state", PET_STATE_STANDBY))
	instance["level"] = clampi(int(instance.get("level", 1)), 1, MAX_PET_LEVEL)
	instance["exp"] = maxi(0, int(instance.get("exp", 0)))
	instance["nextExp"] = exp_to_next_level(int(instance.get("level", 1)))
	var old_max_hp := maxi(1, int(instance.get("maxHp", 1)))
	var old_hp := clampi(int(instance.get("hp", old_max_hp)), 0, old_max_hp)
	var missing_hp := maxi(0, old_max_hp - old_hp)
	var growth_rates := _pet_growth_rates(str(template.get("growthProfileId", "balanced")))
	var growth_snapshot := PetIndividualGrowthModel.growth_snapshot(template, instance, int(instance.get("level", 1)), growth_rates, instance_id)
	var grown_stats: Dictionary = growth_snapshot.get("finalStats", {})
	var grown_max_hp := maxi(1, int(grown_stats.get("maxHp", old_max_hp)))
	instance["maxHp"] = grown_max_hp
	instance["hp"] = clampi(grown_max_hp - missing_hp, 0, grown_max_hp)
	instance["quick"] = int(grown_stats.get("quick", instance.get("quick", 50)))
	instance["attack"] = int(grown_stats.get("attack", instance.get("attack", 12)))
	instance["defense"] = int(grown_stats.get("defense", instance.get("defense", 6)))
	instance["growthTierId"] = str(growth_snapshot.get("growthTierId", template.get("growthProfileId", "balanced")))
	instance["growthTierLabel"] = str(growth_snapshot.get("growthTierLabel", growth_profile_label(str(template.get("growthProfileId", "")))))
	instance["individualSeed"] = str(growth_snapshot.get("individualSeed", instance_id))
	instance["individualVariance"] = growth_snapshot.get("individualVariance", {})
	instance["individualQualityScore"] = int(growth_snapshot.get("individualQualityScore", 5000))
	instance["individualQualityLabel"] = str(growth_snapshot.get("individualQualityLabel", "普通"))
	instance["initialStats"] = growth_snapshot.get("initialStats", {})
	instance["growthRecord"] = growth_snapshot.get("growthRecord", {})
	var cultivation := PetCultivationModel.normalized_record(instance.get("petCultivation", {}))
	instance["petCultivation"] = cultivation
	var last_cultivation_result = instance.get("lastCultivationResult", cultivation.get("lastResult", {}))
	if last_cultivation_result is Dictionary:
		instance["lastCultivationResult"] = (last_cultivation_result as Dictionary).duplicate(true)
	instance["capturedSerial"] = maxi(0, int(instance.get("capturedSerial", 0)))
	instance["isNew"] = bool(instance.get("isNew", false))
	for key in ["lineId", "lineName", "subtypeId", "subtypeName", "formName", "growthProfileId", "elements", "passiveSkillIds"]:
		if template.has(key):
			instance[key] = template.get(key)
	var forgotten := _valid_unique_pet_skill_ids(instance.get("forgottenSkillIds", []))
	for base_skill_id in PET_BASE_SKILL_IDS:
		forgotten.erase(base_skill_id)
	var learned: Array[String] = []
	for skill_id in _valid_unique_pet_skill_ids(template.get("activeSkillIds", [])):
		if PET_BASE_SKILL_IDS.has(skill_id) or not forgotten.has(skill_id):
			learned.append(skill_id)
	for skill_id in _valid_unique_pet_skill_ids(instance.get("activeSkillIds", [])):
		if forgotten.has(skill_id):
			continue
		if not learned.has(skill_id):
			learned.append(skill_id)
	instance["activeSkillIds"] = learned
	instance["forgottenSkillIds"] = forgotten
	instance["petSkillSlots"] = PetTemplateCatalog.normalized_skill_slots(learned, instance.get("petSkillSlots", template.get("petSkillSlots", [])))
	instance["combatPower"] = PetPowerModel.combat_power_for_pet(instance)
	instance["combatPowerBreakdown"] = PetPowerModel.combat_power_breakdown_for_pet(instance)
	return instance


static func _pet_instances(profile: Dictionary) -> Array[Dictionary]:
	var instances: Array[Dictionary] = []
	var raw_instances = profile.get("petInstances", [])
	if raw_instances is Array:
		for value in raw_instances:
			if value is Dictionary:
				instances.append(value as Dictionary)
	return instances


static func _ground_pet_drops(profile: Dictionary) -> Array[Dictionary]:
	var drops: Array[Dictionary] = []
	var raw_drops = profile.get("groundPetDrops", [])
	if raw_drops is Array:
		for value in raw_drops:
			if value is Dictionary:
				drops.append(value as Dictionary)
	return drops


static func _normalize_ground_pet_drop(value: Dictionary) -> Dictionary:
	var drop := value.duplicate(true)
	var pet_value = drop.get("pet", {})
	if not (pet_value is Dictionary):
		return {}
	var pet := _normalize_pet_instance(pet_value as Dictionary)
	if pet.is_empty():
		return {}
	pet["state"] = PET_STATE_STANDBY

	var drop_id := str(drop.get("dropId", ""))
	if drop_id == "":
		drop_id = "ground_%s" % str(pet.get("instanceId", "pet"))
	var map_id := str(drop.get("mapId", ""))
	if map_id == "":
		return {}
	var cell := _drop_cell(drop)
	var created_at := maxi(0, int(drop.get("createdAtSec", 0)))
	var expires_at := int(drop.get("expiresAtSec", created_at + PET_DROP_TTL_SECONDS))
	if expires_at <= 0:
		expires_at = created_at + PET_DROP_TTL_SECONDS
	return {
		"dropId": drop_id,
		"ownerId": str(drop.get("ownerId", LOCAL_PLAYER_ID)),
		"pickupMode": str(drop.get("pickupMode", PET_DROP_PICKUP_PUBLIC)),
		"mapId": map_id,
		"cell": [cell.x, cell.y],
		"createdAtSec": created_at,
		"expiresAtSec": expires_at,
		"pet": pet,
	}


static func _drop_cell(drop: Dictionary) -> Vector2i:
	var cell_value = drop.get("cell", [0, 0])
	if cell_value is Array:
		var cell_array := cell_value as Array
		if cell_array.size() >= 2:
			return Vector2i(int(cell_array[0]), int(cell_array[1]))
	return Vector2i.ZERO


static func _ground_pet_drop_index(drops: Array, drop_id: String) -> int:
	for index in range(drops.size()):
		if not (drops[index] is Dictionary):
			continue
		if str((drops[index] as Dictionary).get("dropId", "")) == drop_id:
			return index
	return -1


static func _ground_pet_drop_expired(drop: Dictionary, now_sec: int) -> bool:
	var expires_at := int(drop.get("expiresAtSec", 0))
	return expires_at > 0 and now_sec >= expires_at


static func _actors(state: Dictionary) -> Array[Dictionary]:
	var actors: Array[Dictionary] = []
	var raw_actors = state.get("actors", [])
	if raw_actors is Array:
		for value in raw_actors:
			if value is Dictionary:
				actors.append(value as Dictionary)
	return actors


static func _actors_without_id(state: Dictionary, actor_id: String) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for actor in _actors(state):
		if str(actor.get("id", "")) != actor_id:
			result.append(actor)
	return result


static func _actors_with_replaced_actor(state: Dictionary, next_actor: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var next_id := str(next_actor.get("id", ""))
	var next_slot := str(next_actor.get("slotId", ""))
	for actor in _actors(state):
		var actor_id := str(actor.get("id", ""))
		var actor_slot := str(actor.get("slotId", ""))
		if actor_id == next_id or (next_slot != "" and actor_slot == next_slot):
			continue
		result.append(actor)
	result.append(next_actor)
	return result


static func _active_party_entry(party: Array[Dictionary]) -> Dictionary:
	for entry in party:
		if str(entry.get("state", "")) == PET_STATE_BATTLE:
			return entry
	return {}


static func _active_profile_pet(profile: Dictionary) -> Dictionary:
	var active_id := str(profile.get("activePetInstanceId", ""))
	for instance in _pet_instances(profile):
		if str(instance.get("instanceId", "")) == active_id:
			return instance
	return {}


static func _pet_instance_index(instances: Array[Dictionary], instance_id: String) -> int:
	for index in range(instances.size()):
		if str(instances[index].get("instanceId", "")) == instance_id:
			return index
	return -1


static func _party_visible_instance_count(profile: Dictionary) -> int:
	var count := 0
	for instance in _pet_instances(profile):
		if str(instance.get("state", PET_STATE_STANDBY)) != PET_STATE_STORAGE:
			count += 1
	return count


static func _storage_instance_count(profile: Dictionary) -> int:
	var count := 0
	for instance in _pet_instances(profile):
		if str(instance.get("state", PET_STATE_STANDBY)) == PET_STATE_STORAGE:
			count += 1
	return count


static func _first_battle_pet_id(profile: Dictionary) -> String:
	for instance in _pet_instances(profile):
		var instance_id := str(instance.get("instanceId", ""))
		if instance_id != "" and str(instance.get("state", PET_STATE_STANDBY)) == PET_STATE_BATTLE:
			return instance_id
	return ""


static func _next_serial_from_instances(instances: Array[Dictionary]) -> int:
	var max_serial := 0
	for instance in instances:
		var instance_id := str(instance.get("instanceId", ""))
		var parts := instance_id.split("_")
		if parts.is_empty():
			continue
		var maybe_number := int(parts[parts.size() - 1])
		max_serial = maxi(max_serial, maybe_number)
	return max_serial + 1


static func _next_drop_serial_from_drops(drops: Array[Dictionary]) -> int:
	var max_serial := 0
	for drop in drops:
		var drop_id := str(drop.get("dropId", ""))
		var parts := drop_id.split("_")
		if parts.is_empty():
			continue
		var maybe_number := int(parts[parts.size() - 1])
		max_serial = maxi(max_serial, maybe_number)
	return max_serial + 1


static func _safe_now_sec(now_sec: int) -> int:
	if now_sec >= 0:
		return now_sec
	return int(Time.get_unix_time_from_system())


static func _safe_mail_id_source(source_id: String) -> String:
	var source := source_id.strip_edges()
	if source == "":
		source = "reward"
	var result := ""
	for index in range(source.length()):
		var character := source.substr(index, 1)
		if character.is_valid_identifier() or character.is_valid_int() or character == "-" or character == "_":
			result += character
		else:
			result += "_"
	return result if result != "" else "reward"


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value:
			var text := str(item)
			if text != "":
				result.append(text)
	return result


static func _valid_unique_ability_ids(value) -> Array[String]:
	var result: Array[String] = []
	for ability_id in _string_array(value):
		var normalized_id := ability_id.strip_edges()
		if normalized_id == "" or result.has(normalized_id):
			continue
		result.append(normalized_id)
	return result


static func _valid_unique_pet_skill_ids(value) -> Array[String]:
	var result: Array[String] = []
	for skill_id in _string_array(value):
		if result.has(skill_id):
			continue
		var action := BattleActionCatalog.action_by_id(skill_id)
		if action.is_empty() or str(action.get("owner", "")) != BattleActionCatalog.OWNER_PET_SKILL:
			continue
		result.append(skill_id)
	return result


static func _first_empty_pet_skill_slot(slots: Array[String]) -> int:
	for index in range(PetTemplateCatalog.MAX_PET_SKILL_SLOTS):
		if index >= slots.size() or str(slots[index]) == "":
			return index + 1
	return 0


static func _valid_unique_form_id_array(value) -> Array[String]:
	var result: Array[String] = []
	for form_id in _string_array(value):
		if result.has(form_id):
			continue
		if PetTemplateCatalog.runtime_template_for_form(form_id).is_empty():
			continue
		result.append(form_id)
	return result
