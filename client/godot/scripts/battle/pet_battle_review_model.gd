extends RefCounted

const BattleActionCatalog := preload("res://scripts/battle/battle_action_catalog.gd")
const BattleModel := preload("res://scripts/battle/battle_model.gd")
const BattleSpectatorAiModel := preload("res://scripts/battle/battle_spectator_ai_model.gd")
const PetActionAssetCatalog := preload("res://scripts/pet/pet_action_asset_catalog.gd")
const PetTemplateCatalog := preload("res://scripts/battle/pet_template_catalog.gd")

const MODE_BRAWL := "brawl"
const MODE_DIRECTOR := "director"

const PLACEMENT_BOTH_ALL := "both_all"
const PLACEMENT_BOTH_CENTER := "both_center"
const PLACEMENT_ALLY_ALL := "ally_all"
const PLACEMENT_ENEMY_ALL := "enemy_all"
const PLACEMENT_RANDOM_ONE_EACH := "random_one_each"
const PLACEMENT_RANDOM_ALL := "random_all"

const POOL_FORMAL := "formal"
const POOL_ALL := "all"

const ALLY_FOCUS_ID := BattleModel.PLAYER_PET_ID
const ENEMY_FOCUS_ID := "enemy_front_3"
const ALLY_COMBO_IDS: Array[String] = [BattleModel.PLAYER_PET_ID, "ally_front_2", "ally_front_4"]
const REVIEW_MOUNT_FORM_ID := "bui_novice_sprout_earth5_wind5"
const ALLY_MOUNT_FOCUS_ID := BattleModel.PLAYER_ACTOR_ID
const ENEMY_MOUNT_FOCUS_ID := "enemy_back_3"
const ALLY_MOUNT_COMBO_IDS: Array[String] = ["ally_back_2", BattleModel.PLAYER_ACTOR_ID, "ally_back_4"]
const DODGE_REVIEW_STEP_IDS: Array[String] = [
	"dodge",
	"mounted_dodge",
	"dodge_counter",
	"mounted_dodge_counter",
]
const REVIVE_REVIEW_STEP_ID := "revive"

const REQUIRED_COVERAGE: Array[String] = [
	"attack",
	"skill",
	"defend",
	"guard_hit",
	"counter",
	"counter_ko",
	"counter_launch",
	"combo",
	"dodge",
	"down",
	"knockaway_straight",
	"knockaway_bounce",
]

const OPTIONAL_COVERAGE: Array[String] = [REVIVE_REVIEW_STEP_ID]

const LEVEL_CAP := 140
const CHARACTER_NAMES: Array[String] = [
	"岚影",
	"赤牙",
	"星澜",
	"岩锋",
	"逐月",
	"霜弦",
	"青禾",
	"流火",
	"暮川",
	"白羽",
	"苍沐",
	"曜石",
]
const ROLE_STAT_RANGES := {
	BattleSpectatorAiModel.PLAYER_ROLE_ARCHER: {
		"hp": Vector2i(1500, 1900), "attack": Vector2i(330, 410),
		"defense": Vector2i(100, 150), "quick": Vector2i(210, 280),
	},
	BattleSpectatorAiModel.PLAYER_ROLE_HEALER: {
		"hp": Vector2i(1650, 2100), "attack": Vector2i(210, 280),
		"defense": Vector2i(130, 190), "quick": Vector2i(180, 240),
	},
	BattleSpectatorAiModel.PLAYER_ROLE_GUARDIAN: {
		"hp": Vector2i(2300, 3000), "attack": Vector2i(190, 260),
		"defense": Vector2i(240, 330), "quick": Vector2i(100, 160),
	},
	BattleSpectatorAiModel.PLAYER_ROLE_DUELIST: {
		"hp": Vector2i(1500, 1950), "attack": Vector2i(390, 480),
		"defense": Vector2i(95, 150), "quick": Vector2i(190, 255),
	},
	BattleSpectatorAiModel.PLAYER_ROLE_TACTICIAN: {
		"hp": Vector2i(1700, 2200), "attack": Vector2i(270, 340),
		"defense": Vector2i(145, 210), "quick": Vector2i(225, 295),
	},
	BattleSpectatorAiModel.PET_ROLE_BURST: {
		"hp": Vector2i(1550, 2050), "attack": Vector2i(410, 500),
		"defense": Vector2i(90, 150), "quick": Vector2i(215, 295),
	},
	BattleSpectatorAiModel.PET_ROLE_CONFUSION: {
		"hp": Vector2i(1700, 2200), "attack": Vector2i(260, 330),
		"defense": Vector2i(120, 180), "quick": Vector2i(235, 305),
	},
	BattleSpectatorAiModel.PET_ROLE_STONE: {
		"hp": Vector2i(2000, 2550), "attack": Vector2i(240, 310),
		"defense": Vector2i(180, 250), "quick": Vector2i(130, 190),
	},
	BattleSpectatorAiModel.PET_ROLE_SLEEP: {
		"hp": Vector2i(1600, 2100), "attack": Vector2i(260, 330),
		"defense": Vector2i(115, 180), "quick": Vector2i(250, 320),
	},
	BattleSpectatorAiModel.PET_ROLE_CHARGER: {
		"hp": Vector2i(1900, 2450), "attack": Vector2i(340, 430),
		"defense": Vector2i(140, 210), "quick": Vector2i(170, 240),
	},
}


static func default_form_id() -> String:
	var formal_ids := formal_form_ids()
	if not formal_ids.is_empty():
		return formal_ids[0]
	var options := pet_options()
	return str(options[0].get("formId", "")) if not options.is_empty() else ""


static func pet_options() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for form in PetTemplateCatalog.forms():
		var form_id := str(form.get("formId", "")).strip_edges()
		if form_id == "":
			continue
		var formal := PetActionAssetCatalog.supports_form(form_id)
		result.append({
			"formId": form_id,
			"name": str(form.get("formName", form_id)),
			"formal": formal,
			"label": "%s · %s" % [str(form.get("formName", form_id)), "正式动作" if formal else "占位造型"],
		})
	result.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
		if bool(left.get("formal", false)) != bool(right.get("formal", false)):
			return bool(left.get("formal", false))
		return str(left.get("name", "")) < str(right.get("name", ""))
	)
	return result


static func formal_form_ids() -> Array[String]:
	var result: Array[String] = []
	for option in pet_options():
		if bool(option.get("formal", false)):
			result.append(str(option.get("formId", "")))
	return result


static func placement_options() -> Array[Dictionary]:
	return [
		{"id": PLACEMENT_RANDOM_ALL, "label": "全场随机十宠"},
		{"id": PLACEMENT_BOTH_ALL, "label": "双方全部宠位"},
		{"id": PLACEMENT_BOTH_CENTER, "label": "双方中位各一只"},
		{"id": PLACEMENT_ALLY_ALL, "label": "只铺满我方五宠"},
		{"id": PLACEMENT_ENEMY_ALL, "label": "只铺满敌方五宠"},
		{"id": PLACEMENT_RANDOM_ONE_EACH, "label": "双方随机各一位"},
	]


static func pool_options() -> Array[Dictionary]:
	return [
		{"id": POOL_FORMAL, "label": "正式动作资产池"},
		{"id": POOL_ALL, "label": "全部模板（含占位）"},
	]


static func normalized_form_id(form_id: String) -> String:
	return form_id if not PetTemplateCatalog.form_by_id(form_id).is_empty() else default_form_id()


static func normalized_mount_form_id(form_id: String) -> String:
	var normalized := form_id.strip_edges()
	return normalized if normalized != "" and not PetTemplateCatalog.form_by_id(normalized).is_empty() else ""


static func normalized_seed(seed_value: int) -> int:
	var positive := absi(seed_value)
	return positive if positive > 0 else 1


static func build_brawl_state(
	focus_form_id: String,
	seed_value: int,
	placement: String = PLACEMENT_BOTH_ALL,
	pool_id: String = POOL_FORMAL,
	mount_form_id: String = "",
	random_mount_form_ids: Array[String] = []
) -> Dictionary:
	var form_id := normalized_form_id(focus_form_id)
	var resolved_mount_form_id := normalized_mount_form_id(mount_form_id)
	var random_mount_pool := _normalized_form_ids(random_mount_form_ids)
	var use_random_mounts := resolved_mount_form_id == "" and not random_mount_pool.is_empty()
	var seed := normalized_seed(seed_value)
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var state := BattleModel.create_formation_preview_battle({
		"id": "pet_battle_review_zone",
		"name": "Lv140随机10V10战术观战场",
	})
	state["id"] = "local_pet_battle_review_%d" % seed
	state["targetSeed"] = "pet_battle_review_%d" % seed
	state["forcedTargetSeed"] = state["targetSeed"]
	state["round"] = 1
	state["phase"] = "command"
	state["message"] = "Lv140随机10V10：双方战术AI已接管，随机种子 %d。" % seed
	state["reviewLab"] = true
	state["reviewMode"] = MODE_BRAWL
	state["reviewAiSpectator"] = true
	state["reviewSeed"] = seed
	state["reviewFocusFormId"] = form_id
	state["reviewPlacement"] = placement
	state["reviewPoolId"] = pool_id
	state["reviewMountAllPlayers"] = resolved_mount_form_id != "" or use_random_mounts
	state["reviewRandomMounts"] = use_random_mounts
	state["reviewMountFormId"] = resolved_mount_form_id
	state["reviewMountFormIds"] = (
		random_mount_pool.duplicate()
		if use_random_mounts
		else ([resolved_mount_form_id] if resolved_mount_form_id != "" else [])
	)
	state["reviewExpectedMountedPlayers"] = (
		10
		if resolved_mount_form_id != "" or use_random_mounts
		else 0
	)
	state["reviewMusicContext"] = "battle_normal"
	state["reviewMusicCueId"] = "music.battle_normal"
	state["reviewTopInset"] = 164.0

	var pool := _pool_form_ids(pool_id, form_id)
	var player_roles_by_side := {
		BattleModel.SIDE_ALLY: _shuffled_strings(
			BattleSpectatorAiModel.PLAYER_ROLES,
			rng
		),
		BattleModel.SIDE_ENEMY: _shuffled_strings(
			BattleSpectatorAiModel.PLAYER_ROLES,
			rng
		),
	}
	var pet_roles_by_side := {
		BattleModel.SIDE_ALLY: _shuffled_strings(
			BattleSpectatorAiModel.PET_ROLES,
			rng
		),
		BattleModel.SIDE_ENEMY: _shuffled_strings(
			BattleSpectatorAiModel.PET_ROLES,
			rng
		),
	}
	var character_names_by_side := {
		BattleModel.SIDE_ALLY: _shuffled_strings(CHARACTER_NAMES, rng),
		BattleModel.SIDE_ENEMY: _shuffled_strings(CHARACTER_NAMES, rng),
	}
	var player_role_index := {
		BattleModel.SIDE_ALLY: 0,
		BattleModel.SIDE_ENEMY: 0,
	}
	var pet_role_index := {
		BattleModel.SIDE_ALLY: 0,
		BattleModel.SIDE_ENEMY: 0,
	}
	var random_focus_slots := {
		BattleModel.SIDE_ALLY: rng.randi_range(1, BattleModel.SLOTS_PER_ROW),
		BattleModel.SIDE_ENEMY: rng.randi_range(1, BattleModel.SLOTS_PER_ROW),
	}
	var actors: Array = state.get("actors", [])
	for index in range(actors.size()):
		if not (actors[index] is Dictionary):
			continue
		var previous := actors[index] as Dictionary
		var side := str(previous.get("side", ""))
		var kind := str(previous.get("kind", ""))
		if kind == "player":
			var side_player_roles := (
				player_roles_by_side.get(side, []) as Array[String]
			)
			var role_index := int(player_role_index.get(side, 0))
			var role_id := side_player_roles[
				role_index % side_player_roles.size()
			]
			player_role_index[side] = role_index + 1
			var stats := _random_stats(rng, role_id)
			var player_actor := previous.duplicate(true)
			_apply_stats(player_actor, stats)
			player_actor["level"] = LEVEL_CAP
			player_actor["reviewAiRole"] = role_id
			player_actor["reviewAiRoleLabel"] = (
				BattleSpectatorAiModel.role_label(role_id)
			)
			var side_character_names := (
				character_names_by_side.get(side, []) as Array[String]
			)
			var character_name := side_character_names[
				role_index % side_character_names.size()
			]
			player_actor["name"] = "%s·%s" % [
				BattleSpectatorAiModel.role_label(role_id),
				character_name,
			]
			player_actor["reviewWeaponClass"] = (
				"bow" if role_id == BattleSpectatorAiModel.PLAYER_ROLE_ARCHER
				else "melee"
			)
			if role_id == BattleSpectatorAiModel.PLAYER_ROLE_ARCHER:
				player_actor["attackActionId"] = "weapon_shadow_group_shot"
			else:
				player_actor.erase("attackActionId")
			if role_id == BattleSpectatorAiModel.PLAYER_ROLE_HEALER:
				player_actor["spiritIds"] = [
					BattleModel.SPIRIT_GRACE_ALL,
					BattleModel.SPIRIT_MOIST_SINGLE,
				]
			player_actor["counterRateOverride"] = rng.randf_range(0.08, 0.26)
			player_actor["dodgeRateOverride"] = rng.randf_range(0.03, 0.13)
			player_actor["criticalRateOverride"] = rng.randf_range(0.08, 0.20)
			player_actor["comboBaseRateOverride"] = rng.randf_range(0.24, 0.52)
			if resolved_mount_form_id != "":
				_apply_review_mount(player_actor, resolved_mount_form_id)
			elif use_random_mounts:
				_apply_review_mount(
					player_actor,
					random_mount_pool[
						rng.randi_range(0, random_mount_pool.size() - 1)
					]
				)
			actors[index] = player_actor
			continue
		var side_pet_roles := pet_roles_by_side.get(side, []) as Array[String]
		var role_index := int(pet_role_index.get(side, 0))
		var role_id := side_pet_roles[role_index % side_pet_roles.size()]
		pet_role_index[side] = role_index + 1
		var stats := _random_stats(rng, role_id)
		var slot_number := _slot_number(str(previous.get("slotId", "")))
		var use_focus := _pet_slot_uses_focus(side, slot_number, placement, random_focus_slots)
		var selected_form_id := form_id if use_focus else pool[rng.randi_range(0, pool.size() - 1)]
		var pet_actor := PetTemplateCatalog.actor_from_form(
			selected_form_id,
			str(previous.get("id", "review_pet_%d" % index)),
			side,
			"pet" if side == BattleModel.SIDE_ALLY else "wild_pet",
			str(previous.get("slotId", "")),
			"%s·%s" % [
				str(PetTemplateCatalog.form_by_id(selected_form_id).get("formName", "宠物")),
				BattleSpectatorAiModel.role_label(role_id),
			],
			stats
		)
		if pet_actor.is_empty():
			pet_actor = previous.duplicate(true)
		_apply_stats(pet_actor, stats)
		pet_actor["level"] = LEVEL_CAP
		pet_actor["reviewAiRole"] = role_id
		pet_actor["reviewAiRoleLabel"] = (
			BattleSpectatorAiModel.role_label(role_id)
		)
		var skill_id := _pet_skill_for_role(role_id)
		pet_actor["activeSkillIds"] = [skill_id]
		pet_actor["petSkillSlots"] = [skill_id]
		pet_actor["catchable"] = false
		pet_actor["actionState"] = "idle"
		pet_actor["petBattleState"] = "battle"
		pet_actor["counterRateOverride"] = rng.randf_range(0.12, 0.38)
		pet_actor["dodgeRateOverride"] = rng.randf_range(0.04, 0.15)
		pet_actor["criticalRateOverride"] = rng.randf_range(0.08, 0.22)
		pet_actor["comboBaseRateOverride"] = rng.randf_range(0.28, 0.58)
		actors[index] = pet_actor
	state["actors"] = actors
	state["reviewRosterSummary"] = _roster_summary(actors)
	state["petParty"] = BattleModel.default_player_pet_party(BattleModel.actor_by_id(state, BattleModel.PLAYER_PET_ID))
	return state


static func build_director_state(
	focus_form_id: String,
	seed_value: int,
	step_id: String,
	mount_form_id: String = ""
) -> Dictionary:
	var resolved_mount_form_id := normalized_mount_form_id(mount_form_id)
	var state := build_brawl_state(
		focus_form_id,
		seed_value,
		PLACEMENT_BOTH_ALL,
		POOL_FORMAL,
		resolved_mount_form_id
	)
	state["id"] = "local_pet_battle_review_director_%s_%d" % [step_id, normalized_seed(seed_value)]
	state["reviewMode"] = MODE_DIRECTOR
	state["reviewAiSpectator"] = false
	state["reviewDirectorStep"] = step_id
	state["message"] = director_step_label(step_id)
	var actors: Array = state.get("actors", [])
	for index in range(actors.size()):
		if not (actors[index] is Dictionary):
			continue
		var actor := actors[index] as Dictionary
		var actor_id := str(actor.get("id", ""))
		actor["counterRateOverride"] = 0.0
		actor["dodgeRateOverride"] = 0.0
		actor["criticalRateOverride"] = 0.0
		actor["comboBaseRateOverride"] = 1.0 if (
			ALLY_COMBO_IDS.has(actor_id)
			or (resolved_mount_form_id != "" and ALLY_MOUNT_COMBO_IDS.has(actor_id))
		) else 0.0
		if [ALLY_FOCUS_ID, ENEMY_FOCUS_ID, ALLY_MOUNT_FOCUS_ID, ENEMY_MOUNT_FOCUS_ID].has(actor_id):
			actor["hp"] = 220
			actor["maxHp"] = 220
			actor["attack"] = 24
			actor["defense"] = 10
			actor["quick"] = 72 if [ALLY_FOCUS_ID, ALLY_MOUNT_FOCUS_ID].has(actor_id) else 54
		actors[index] = actor
	state["actors"] = actors
	if ["counter", "counter_ko", "counter_launch"].has(step_id):
		state = _with_actor_fields(state, ENEMY_FOCUS_ID, {"counterRateOverride": 1.0, "attack": 64, "defense": 10})
	elif step_id == "mounted_counter":
		state = _with_actor_fields(state, ENEMY_MOUNT_FOCUS_ID, {"counterRateOverride": 1.0, "attack": 54, "defense": 10})
	elif step_id == "dodge_counter":
		state = _with_actor_fields(state, ALLY_FOCUS_ID, {"counterRateOverride": 1.0})
	elif step_id == "mounted_dodge_counter":
		state = _with_actor_fields(state, ALLY_MOUNT_FOCUS_ID, {"counterRateOverride": 1.0})
	if step_id == "counter_ko":
		state = _with_counter_outcome(state, false)
	elif step_id == "counter_launch":
		state = _with_counter_outcome(state, true)
	elif ["knockaway_straight", "knockaway_bounce"].has(step_id):
		state = BattleModel.set_actor_hp(state, ENEMY_FOCUS_ID, 24)
	elif step_id == "down":
		state = BattleModel.set_actor_hp(state, ENEMY_FOCUS_ID, 26)
	elif step_id == REVIVE_REVIEW_STEP_ID:
		state = _with_actor_fields(state, ENEMY_FOCUS_ID, {
			"hp": 0,
			"actionState": "down",
			"petBattleState": "battle",
			"revivable": true,
		})
		state["reviewVisualOnly"] = true
		state["reviewVisualActorId"] = ENEMY_FOCUS_ID
		state["reviewVisualAction"] = REVIVE_REVIEW_STEP_ID
	state["petParty"] = BattleModel.default_player_pet_party(BattleModel.actor_by_id(state, BattleModel.PLAYER_PET_ID))
	return state


static func director_steps(focus_form_id: String, mount_form_id: String = "") -> Array[Dictionary]:
	var skill_id := _director_skill_id(focus_form_id)
	var skill_name := BattleActionCatalog.label_for(skill_id, "宠物技能")
	var standard_steps: Array[Dictionary] = [
		{"id": "attack", "label": "普通攻击", "settle": 0.65, "events": [_attack_event(ALLY_FOCUS_ID, ENEMY_FOCUS_ID, BattleModel.SIDE_ENEMY, 18, false)]},
		{"id": "defend_hit", "label": "防御承压", "settle": 0.75, "events": [_defend_event(ENEMY_FOCUS_ID), _attack_event(ALLY_FOCUS_ID, ENEMY_FOCUS_ID, BattleModel.SIDE_ENEMY, 30, false)]},
		{"id": "hurt", "label": "受击恢复", "settle": 0.70, "events": [_attack_event(ENEMY_FOCUS_ID, ALLY_FOCUS_ID, BattleModel.SIDE_ALLY, 20, false)]},
		{"id": "counter", "label": "普通反击", "settle": 0.85, "events": [_attack_event(ALLY_FOCUS_ID, ENEMY_FOCUS_ID, BattleModel.SIDE_ENEMY, 16, true)]},
		{"id": "counter_ko", "label": "致死反击·负伤归位", "settle": 1.00, "events": [_attack_event(ALLY_FOCUS_ID, ENEMY_FOCUS_ID, BattleModel.SIDE_ENEMY, 16, true)]},
		{"id": "counter_launch", "label": "高伤反击·直接击飞", "settle": 0.95, "events": [_attack_event(ALLY_FOCUS_ID, ENEMY_FOCUS_ID, BattleModel.SIDE_ENEMY, 16, true)]},
		{"id": "skill", "label": "主动技能", "settle": 0.75, "events": [_skill_event(skill_id, skill_name)]},
		{"id": "combo", "label": "三宠合击", "settle": 1.05, "events": [_combo_event()]},
		{"id": "knockaway_straight", "label": "直线击飞", "settle": 0.90, "events": [_knockaway_event("straight")]},
		{"id": "knockaway_bounce", "label": "场边弹飞", "settle": 1.00, "events": [_knockaway_event("bounce")]},
		{"id": "dodge", "label": "战宠回避", "settle": 0.75, "events": [_forced_dodge_event(ENEMY_FOCUS_ID, ALLY_FOCUS_ID, BattleModel.SIDE_ALLY, false, 6)]},
		{"id": "dodge_counter", "label": "战宠回避后反击", "settle": 0.90, "events": [_forced_dodge_event(ENEMY_FOCUS_ID, ALLY_FOCUS_ID, BattleModel.SIDE_ALLY, true, 7)]},
		{"id": "down", "label": "可复活昏厥", "settle": 1.20, "events": [_down_event()]},
	]
	if normalized_mount_form_id(mount_form_id) == "":
		return standard_steps
	return [
		standard_steps[0],
		{"id": "mounted_attack", "label": "骑乘人物进攻", "settle": 0.80, "events": [_attack_event(ALLY_MOUNT_FOCUS_ID, ENEMY_FOCUS_ID, BattleModel.SIDE_ENEMY, 18, false)]},
		standard_steps[1],
		{"id": "mounted_defend_hit", "label": "骑乘人物防御承压", "settle": 0.85, "events": [_defend_event(ENEMY_MOUNT_FOCUS_ID), _attack_event(ALLY_MOUNT_FOCUS_ID, ENEMY_MOUNT_FOCUS_ID, BattleModel.SIDE_ENEMY, 30, false)]},
		standard_steps[2],
		standard_steps[3],
		{"id": "mounted_counter", "label": "骑乘人物反击", "settle": 0.95, "events": [_attack_event(ALLY_MOUNT_FOCUS_ID, ENEMY_MOUNT_FOCUS_ID, BattleModel.SIDE_ENEMY, 16, true)]},
		standard_steps[4],
		standard_steps[5],
		standard_steps[6],
		standard_steps[7],
		{"id": "mounted_combo", "label": "三骑乘人物合击", "settle": 1.15, "events": [_mounted_combo_event()]},
		standard_steps[8],
		standard_steps[9],
		standard_steps[10],
		{"id": "mounted_dodge", "label": "骑宠人物回避", "settle": 0.80, "events": [_forced_dodge_event(ENEMY_FOCUS_ID, ALLY_MOUNT_FOCUS_ID, BattleModel.SIDE_ALLY, false, 9)]},
		standard_steps[11],
		{"id": "mounted_dodge_counter", "label": "骑宠人物回避后反击", "settle": 0.95, "events": [_forced_dodge_event(ENEMY_FOCUS_ID, ALLY_MOUNT_FOCUS_ID, BattleModel.SIDE_ALLY, true, 10)]},
		standard_steps[12],
	]


static func normalized_director_step_ids(
	requested_step_ids: Array[String],
	focus_form_id: String,
	mount_form_id: String = ""
) -> Array[String]:
	if requested_step_ids.is_empty():
		return []
	var valid_ids: Array[String] = []
	for step in director_steps(focus_form_id, mount_form_id):
		valid_ids.append(str(step.get("id", "")))
	valid_ids.append(REVIVE_REVIEW_STEP_ID)
	var result: Array[String] = []
	for value in requested_step_ids:
		var step_id := value.strip_edges().to_lower()
		if step_id != "" and valid_ids.has(step_id) and not result.has(step_id):
			result.append(step_id)
	return result


static func director_steps_for_ids(
	focus_form_id: String,
	mount_form_id: String,
	requested_step_ids: Array[String]
) -> Array[Dictionary]:
	var all_steps := director_steps(focus_form_id, mount_form_id)
	if requested_step_ids.is_empty():
		return all_steps
	var normalized_ids := normalized_director_step_ids(requested_step_ids, focus_form_id, mount_form_id)
	if normalized_ids.is_empty():
		return all_steps
	var result: Array[Dictionary] = []
	for step_id in normalized_ids:
		for step in all_steps:
			if str(step.get("id", "")) == step_id:
				result.append(step)
				break
		if step_id == REVIVE_REVIEW_STEP_ID:
			result.append(_revive_review_step())
	return result


static func director_step_label(step_id: String) -> String:
	var step_name := director_step_name(step_id)
	return "动作必现：%s。" % step_name if step_name != "" else "动作必现演练。"


static func director_step_name(step_id: String) -> String:
	if step_id == REVIVE_REVIEW_STEP_ID:
		return str(_revive_review_step().get("label", step_id))
	for step in director_steps(default_form_id()):
		if str(step.get("id", "")) == step_id:
			return str(step.get("label", step_id))
	for step in director_steps(default_form_id(), REVIEW_MOUNT_FORM_ID):
		if str(step.get("id", "")) == step_id:
			return str(step.get("label", step_id))
	return ""


static func coverage_labels() -> Dictionary:
	return {
		"attack": "攻击",
		"skill": "技能",
		"defend": "防御",
		"guard_hit": "防御受击",
		"counter": "反击",
		"counter_ko": "负伤归位",
		"counter_launch": "反击击飞",
		"combo": "合击",
		"dodge": "闪避",
		"down": "昏厥",
		"knockaway_straight": "直飞",
		"knockaway_bounce": "弹飞",
		"revive": "复起",
	}


static func coverage_ids() -> Array[String]:
	var result := REQUIRED_COVERAGE.duplicate()
	for coverage_id in OPTIONAL_COVERAGE:
		result.append(coverage_id)
	return result


static func state_signature(state: Dictionary) -> String:
	var rows: Array[String] = []
	for value in state.get("actors", []):
		if not (value is Dictionary):
			continue
		var actor := value as Dictionary
		rows.append("%s|%s|%s|%s|%s|%d|%d|%d|%d|%d|%.4f|%.4f|%.4f|%.4f|%s|%s|%d|%d|%s|%s|%s" % [
			str(actor.get("id", "")),
			str(actor.get("name", "")),
			str(actor.get("formId", "")),
			str(actor.get("reviewArchetype", "")),
			str(actor.get("reviewAiRole", "")),
			int(actor.get("level", 0)),
			int(actor.get("maxHp", 0)),
			int(actor.get("attack", 0)),
			int(actor.get("defense", 0)),
			int(actor.get("quick", 0)),
			float(actor.get("counterRateOverride", 0.0)),
			float(actor.get("dodgeRateOverride", 0.0)),
			float(actor.get("criticalRateOverride", 0.0)),
			float(actor.get("comboBaseRateOverride", 0.0)),
			str(actor.get("ridePetInstanceId", "")),
			str(actor.get("ridePetFormId", "")),
			int(actor.get("ridePetHp", 0)),
			int(actor.get("ridePetMaxHp", 0)),
			str(actor.get("ridePetBattleState", "")),
			str(actor.get("attackActionId", "")),
			str((actor.get("activeSkillIds", []) as Array).front()) if not (actor.get("activeSkillIds", []) as Array).is_empty() else "",
		])
	return "\n".join(rows)


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	var form_id := default_form_id()
	if form_id == "":
		errors.append("验收场没有可用宠物模板")
		return errors
	var first := build_brawl_state(form_id, 309001, PLACEMENT_BOTH_ALL, POOL_FORMAL)
	var replay := build_brawl_state(form_id, 309001, PLACEMENT_BOTH_ALL, POOL_FORMAL)
	var next := build_brawl_state(form_id, 309002, PLACEMENT_BOTH_ALL, POOL_FORMAL)
	if state_signature(first) != state_signature(replay):
		errors.append("同一随机种子不能原样重放")
	if state_signature(first) == state_signature(next):
		errors.append("不同随机种子没有产生阵容或数值差异")
	var side_kind_counts := {}
	var side_player_roles := {
		BattleModel.SIDE_ALLY: {},
		BattleModel.SIDE_ENEMY: {},
	}
	var side_pet_roles := {
		BattleModel.SIDE_ALLY: {},
		BattleModel.SIDE_ENEMY: {},
	}
	var pet_count := 0
	for value in first.get("actors", []):
		if not (value is Dictionary):
			continue
		var actor := value as Dictionary
		var side := str(actor.get("side", ""))
		var kind := str(actor.get("kind", ""))
		var key := "%s:%s" % [side, kind]
		side_kind_counts[key] = int(side_kind_counts.get(key, 0)) + 1
		var role_id := str(actor.get("reviewAiRole", ""))
		if kind == "player":
			(side_player_roles.get(side, {}) as Dictionary)[role_id] = true
		if kind == "pet" or kind == "wild_pet":
			pet_count += 1
			(side_pet_roles.get(side, {}) as Dictionary)[role_id] = true
			if str(actor.get("formId", "")) != form_id:
				errors.append("双方全部宠位没有使用指定宠物")
		if int(actor.get("level", 0)) != LEVEL_CAP:
			errors.append("随机观战单位不是140级满级")
		if int(actor.get("maxHp", 0)) < 1500 or int(actor.get("maxHp", 0)) > 3000:
			errors.append("随机生命越界")
		if int(actor.get("attack", 0)) < 190 or int(actor.get("attack", 0)) > 500:
			errors.append("随机攻击越界")
		if int(actor.get("defense", 0)) < 90 or int(actor.get("defense", 0)) > 330:
			errors.append("随机防御越界")
		if int(actor.get("quick", 0)) < 100 or int(actor.get("quick", 0)) > 320:
			errors.append("随机敏捷越界")
	if (first.get("actors", []) as Array).size() != 20:
		errors.append("验收场必须正好有20个单位")
	if pet_count != 10:
		errors.append("验收场必须正好有10只宠物")
	for key in ["ally:player", "ally:pet", "enemy:player", "enemy:wild_pet"]:
		if int(side_kind_counts.get(key, 0)) != 5:
			errors.append("阵容不是每方5人5宠：%s" % key)
	for side in [BattleModel.SIDE_ALLY, BattleModel.SIDE_ENEMY]:
		if (side_player_roles.get(side, {}) as Dictionary).size() != BattleSpectatorAiModel.PLAYER_ROLES.size():
			errors.append("%s没有覆盖五种人物战术角色" % side)
		if (side_pet_roles.get(side, {}) as Dictionary).size() != BattleSpectatorAiModel.PET_ROLES.size():
			errors.append("%s没有覆盖五种宠物战术角色" % side)
	if not bool(first.get("reviewAiSpectator", false)):
		errors.append("随机乱斗没有启用战术观战AI")
	var first_events := BattleSpectatorAiModel.build_round_events(first.duplicate(true))
	var replay_events := BattleSpectatorAiModel.build_round_events(replay.duplicate(true))
	if BattleSpectatorAiModel.event_signature(first_events) != BattleSpectatorAiModel.event_signature(replay_events):
		errors.append("同种子同回合的战术AI决策不能重放")
	var status_ids: Array[String] = []
	var event_sides := {}
	var saw_burst := false
	for event in first_events:
		var event_type := str(event.get("type", ""))
		status_ids.append(str(event.get("statusId", "")))
		if event_type == "multi_attack":
			var attacker := BattleModel.actor_by_id(
				first,
				str(event.get("attackerId", ""))
			)
			event_sides[str(attacker.get("side", ""))] = true
		if (
			str(event.get("skillId", ""))
			== BattleModel.PET_SKILL_FOCUS_BITE
			and int(event.get("damage", 0)) > 0
		):
			saw_burst = true
	for status_id in [
		BattleModel.STATUS_CONFUSION,
		BattleModel.STATUS_STONE,
		BattleModel.STATUS_SLEEP,
	]:
		if not status_ids.has(status_id):
			errors.append("战术AI首回合缺少控制技能：%s" % status_id)
	if event_sides.size() != 2:
		errors.append("双方弓手没有都生成群攻事件")
	if not saw_burst:
		errors.append("战术AI没有生成宠物高伤害爆发")
	var wounded_state := first.duplicate(true)
	var wounded_actors: Array = wounded_state.get("actors", [])
	for index in range(wounded_actors.size()):
		var wounded_actor := wounded_actors[index] as Dictionary
		wounded_actor["hp"] = maxi(
			1,
			int(round(float(wounded_actor.get("maxHp", 1)) * 0.48))
		)
		wounded_actors[index] = wounded_actor
	wounded_state["actors"] = wounded_actors
	var heal_events := BattleSpectatorAiModel.build_round_events(wounded_state)
	var heal_sides := {}
	var enemy_heal_event := {}
	for event in heal_events:
		if not ["spirit_heal", "spirit_heal_all"].has(str(event.get("type", ""))):
			continue
		var attacker := BattleModel.actor_by_id(
			wounded_state,
			str(event.get("attackerId", ""))
		)
		var side := str(attacker.get("side", ""))
		heal_sides[side] = true
		if side == BattleModel.SIDE_ENEMY:
			enemy_heal_event = event
	if heal_sides.size() != 2:
		errors.append("双方治疗没有根据伤势生成治疗决策")
	if not enemy_heal_event.is_empty():
		var enemy_target_id := str(enemy_heal_event.get("targetId", ""))
		if enemy_target_id == "":
			var enemy_target_ids := enemy_heal_event.get("targetIds", []) as Array
			if not enemy_target_ids.is_empty():
				enemy_target_id = str(enemy_target_ids.front())
		var enemy_hp_before := int(
			BattleModel.actor_by_id(wounded_state, enemy_target_id).get("hp", 0)
		)
		var healed_state := BattleModel.apply_battle_event(
			wounded_state.duplicate(true),
			enemy_heal_event
		)
		var enemy_hp_after := int(
			BattleModel.actor_by_id(healed_state, enemy_target_id).get("hp", 0)
		)
		if not bool(healed_state.get("lastEventApplied", false)) or enemy_hp_after <= enemy_hp_before:
			errors.append("敌方治疗事件不能实际治疗敌方单位")
	var mounted_first := build_brawl_state(
		form_id,
		309001,
		PLACEMENT_BOTH_ALL,
		POOL_FORMAL,
		REVIEW_MOUNT_FORM_ID
	)
	var mounted_replay := build_brawl_state(
		form_id,
		309001,
		PLACEMENT_BOTH_ALL,
		POOL_FORMAL,
		REVIEW_MOUNT_FORM_ID
	)
	if state_signature(mounted_first) != state_signature(mounted_replay):
		errors.append("10骑乘人物同一随机种子不能原样重放")
	var mounted_player_count := 0
	var mounted_instance_ids := {}
	for value in mounted_first.get("actors", []):
		if not (value is Dictionary):
			continue
		var actor := value as Dictionary
		var kind := str(actor.get("kind", ""))
		var ride_id := str(actor.get("ridePetInstanceId", "")).strip_edges()
		if kind != "player":
			if ride_id != "":
				errors.append("战宠不能被误标为骑乘人物")
			continue
		if ride_id == "":
			errors.append("10骑乘验收状态存在未骑宠的人物")
			continue
		mounted_player_count += 1
		if mounted_instance_ids.has(ride_id):
			errors.append("10名人物共用了骑宠实例：%s" % ride_id)
		mounted_instance_ids[ride_id] = true
		if str(actor.get("ridePetFormId", "")) != REVIEW_MOUNT_FORM_ID:
			errors.append("骑乘验收状态使用了错误坐骑形态")
		if int(actor.get("ridePetHp", 0)) <= 0 or int(actor.get("ridePetMaxHp", 0)) <= 0:
			errors.append("骑乘验收状态存在失去战斗资格的坐骑")
		if str(actor.get("ridePetBattleState", "")) != "riding" or bool(actor.get("ridePetKnocked", true)):
			errors.append("骑乘验收状态没有保持有效骑乘事实")
	if mounted_player_count != 10 or mounted_instance_ids.size() != 10:
		errors.append("骑乘验收场必须正好有10名骑乘人物")
	if not bool(mounted_first.get("reviewMountAllPlayers", false)):
		errors.append("骑乘验收状态缺少全员骑乘标记")
	var seen_steps: Array[String] = []
	for step in director_steps(form_id):
		var step_id := str(step.get("id", ""))
		if step_id == "" or seen_steps.has(step_id):
			errors.append("动作必现步骤ID为空或重复")
			continue
		seen_steps.append(step_id)
		if not (step.get("events", []) is Array) or (step.get("events", []) as Array).is_empty():
			errors.append("动作必现步骤没有真实事件：%s" % step_id)
	for required_id in ["attack", "defend_hit", "hurt", "counter", "counter_ko", "counter_launch", "skill", "combo", "knockaway_straight", "knockaway_bounce", "dodge", "dodge_counter", "down"]:
		if not seen_steps.has(required_id):
			errors.append("缺少动作必现步骤：%s" % required_id)
	var mounted_steps := director_steps(form_id, REVIEW_MOUNT_FORM_ID)
	if mounted_steps.size() != 19:
		errors.append("骑乘动作必现清单必须包含19个场景")
	var mounted_step_ids: Array[String] = []
	for step in mounted_steps:
		mounted_step_ids.append(str(step.get("id", "")))
	for required_id in ["mounted_attack", "mounted_defend_hit", "mounted_counter", "mounted_combo", "mounted_dodge", "mounted_dodge_counter"]:
		if not mounted_step_ids.has(required_id):
			errors.append("骑乘动作必现缺少场景：%s" % required_id)
	var revive_steps := director_steps_for_ids(form_id, REVIEW_MOUNT_FORM_ID, [REVIVE_REVIEW_STEP_ID])
	if (
		revive_steps.size() != 1
		or str(revive_steps[0].get("id", "")) != REVIVE_REVIEW_STEP_ID
		or str(revive_steps[0].get("visualSequence", "")) != REVIVE_REVIEW_STEP_ID
		or not (revive_steps[0].get("events", []) as Array).is_empty()
	):
		errors.append("显式复起步骤没有保持独立视觉序列合同：%s" % str(revive_steps))
	var revive_state := build_director_state(form_id, 309001, REVIVE_REVIEW_STEP_ID, REVIEW_MOUNT_FORM_ID)
	var revive_actor := BattleModel.actor_by_id(revive_state, ENEMY_FOCUS_ID)
	if (
		int(revive_actor.get("hp", 1)) != 0
		or str(revive_actor.get("actionState", "")) != "down"
		or not bool(revive_state.get("reviewVisualOnly", false))
		or str(revive_state.get("reviewVisualActorId", "")) != ENEMY_FOCUS_ID
	):
		errors.append("显式复起步骤没有从同一战宠的稳定昏厥保持开始")
	var dodge_review_steps := director_steps_for_ids(form_id, REVIEW_MOUNT_FORM_ID, DODGE_REVIEW_STEP_IDS)
	var dodge_review_ids: Array[String] = []
	for step in dodge_review_steps:
		dodge_review_ids.append(str(step.get("id", "")))
	if dodge_review_ids != DODGE_REVIEW_STEP_IDS:
		errors.append("回避短片清单必须依次覆盖战宠、骑宠人物及各自回避反击：%s" % str(dodge_review_ids))
	var mounted_director_state := build_director_state(form_id, 309001, "mounted_combo", REVIEW_MOUNT_FORM_ID)
	if (
		(mounted_director_state.get("actors", []) as Array).size() != 20
		or not bool(mounted_director_state.get("reviewMountAllPlayers", false))
		or str(mounted_director_state.get("reviewMountFormId", "")) != REVIEW_MOUNT_FORM_ID
	):
		errors.append("骑乘动作必现没有保留10骑手＋10战宠阵容")
	var counter_ko_state := build_director_state(form_id, 309001, "counter_ko")
	var counter_ko_result := _apply_counter_probe(counter_ko_state)
	if (
		(counter_ko_state.get("actors", []) as Array).size() != 20
		or int(BattleModel.actor_by_id(counter_ko_result, ALLY_FOCUS_ID).get("hp", 1)) != 0
		or bool(counter_ko_result.get("lastLaunch", false))
	):
		errors.append("致死反击没有按现行公式形成可复活昏厥")
	var counter_launch_state := build_director_state(form_id, 309001, "counter_launch")
	var counter_launch_result := _apply_counter_probe(counter_launch_state)
	if (
		int(BattleModel.actor_by_id(counter_launch_result, ALLY_FOCUS_ID).get("hp", 1)) != 0
		or not bool(counter_launch_result.get("lastLaunch", false))
	):
		errors.append("高伤反击没有按现行公式形成击飞")
	var pet_dodge_counter_state := build_director_state(form_id, 309001, "dodge_counter")
	var pet_dodge_counter_result := _apply_dodge_counter_probe(
		pet_dodge_counter_state,
		_forced_dodge_event(ENEMY_FOCUS_ID, ALLY_FOCUS_ID, BattleModel.SIDE_ALLY, true, 7),
		ALLY_FOCUS_ID,
		ENEMY_FOCUS_ID
	)
	if not bool(pet_dodge_counter_result.get("valid", false)):
		errors.append("战宠回避后反击链没有形成：%s" % str(pet_dodge_counter_result))
	var mounted_dodge_counter_state := build_director_state(form_id, 309001, "mounted_dodge_counter", REVIEW_MOUNT_FORM_ID)
	var mounted_dodge_counter_result := _apply_dodge_counter_probe(
		mounted_dodge_counter_state,
		_forced_dodge_event(ENEMY_FOCUS_ID, ALLY_MOUNT_FOCUS_ID, BattleModel.SIDE_ALLY, true, 10),
		ALLY_MOUNT_FOCUS_ID,
		ENEMY_FOCUS_ID
	)
	if not bool(mounted_dodge_counter_result.get("valid", false)):
		errors.append("骑宠人物回避后反击链没有形成：%s" % str(mounted_dodge_counter_result))
	return _unique_strings(errors)


static func _pool_form_ids(pool_id: String, fallback_form_id: String) -> Array[String]:
	var result := formal_form_ids() if pool_id == POOL_FORMAL else _all_form_ids()
	if result.is_empty():
		result.append(fallback_form_id)
	return result


static func _normalized_form_ids(values: Array[String]) -> Array[String]:
	var result: Array[String] = []
	for value in values:
		var form_id := normalized_mount_form_id(value)
		if form_id != "" and not result.has(form_id):
			result.append(form_id)
	return result


static func _shuffled_strings(
	values: Array[String],
	rng: RandomNumberGenerator
) -> Array[String]:
	var result: Array[String] = values.duplicate()
	for index in range(result.size() - 1, 0, -1):
		var swap_index := rng.randi_range(0, index)
		var previous: String = result[index]
		result[index] = result[swap_index]
		result[swap_index] = previous
	return result


static func _revive_review_step() -> Dictionary:
	return {
		"id": REVIVE_REVIEW_STEP_ID,
		"label": "战宠昏厥后复起",
		"settle": 0.65,
		"events": [],
		"visualSequence": REVIVE_REVIEW_STEP_ID,
		"actorId": ENEMY_FOCUS_ID,
	}


static func _all_form_ids() -> Array[String]:
	var result: Array[String] = []
	for form in PetTemplateCatalog.forms():
		var form_id := str(form.get("formId", "")).strip_edges()
		if form_id != "":
			result.append(form_id)
	return result


static func _pet_slot_uses_focus(side: String, slot_number: int, placement: String, random_focus_slots: Dictionary) -> bool:
	match placement:
		PLACEMENT_RANDOM_ALL:
			return false
		PLACEMENT_BOTH_CENTER:
			return slot_number == 3
		PLACEMENT_ALLY_ALL:
			return side == BattleModel.SIDE_ALLY
		PLACEMENT_ENEMY_ALL:
			return side == BattleModel.SIDE_ENEMY
		PLACEMENT_RANDOM_ONE_EACH:
			return slot_number == int(random_focus_slots.get(side, 3))
	return true


static func _slot_number(slot_id: String) -> int:
	var parts := slot_id.split(".", false)
	return clampi(int(parts[parts.size() - 1]), 1, BattleModel.SLOTS_PER_ROW) if not parts.is_empty() else 3


static func _random_stats(
	rng: RandomNumberGenerator,
	role_id: String
) -> Dictionary:
	var profile_value = ROLE_STAT_RANGES.get(role_id, {})
	var profile := (
		profile_value as Dictionary
		if profile_value is Dictionary
		else {}
	)
	var hp_range := profile.get("hp", Vector2i(1500, 2100)) as Vector2i
	var attack_range := profile.get("attack", Vector2i(250, 360)) as Vector2i
	var defense_range := profile.get("defense", Vector2i(110, 190)) as Vector2i
	var quick_range := profile.get("quick", Vector2i(150, 250)) as Vector2i
	var max_hp := rng.randi_range(hp_range.x, hp_range.y)
	return {
		"hp": max_hp,
		"maxHp": max_hp,
		"attack": rng.randi_range(attack_range.x, attack_range.y),
		"defense": rng.randi_range(defense_range.x, defense_range.y),
		"quick": rng.randi_range(quick_range.x, quick_range.y),
		"reviewArchetype": role_id,
	}


static func _pet_skill_for_role(role_id: String) -> String:
	match role_id:
		BattleSpectatorAiModel.PET_ROLE_BURST:
			return BattleModel.PET_SKILL_FOCUS_BITE
		BattleSpectatorAiModel.PET_ROLE_CONFUSION:
			return BattleModel.PET_SKILL_CONFUSE_CRY
		BattleSpectatorAiModel.PET_ROLE_STONE:
			return BattleModel.PET_SKILL_STONE_GAZE
		BattleSpectatorAiModel.PET_ROLE_SLEEP:
			return BattleModel.PET_SKILL_SLEEP_POWDER
	return BattleModel.PET_SKILL_BUI_CHARGE


static func _roster_summary(actors: Array) -> String:
	var ally_roles: Array[String] = []
	var enemy_roles: Array[String] = []
	for value in actors:
		if not (value is Dictionary):
			continue
		var actor := value as Dictionary
		var label := str(actor.get("reviewAiRoleLabel", ""))
		if label == "":
			continue
		var target := (
			ally_roles
			if str(actor.get("side", "")) == BattleModel.SIDE_ALLY
			else enemy_roles
		)
		if not target.has(label):
			target.append(label)
	return "我方：%s｜敌方：%s" % [
		"、".join(ally_roles),
		"、".join(enemy_roles),
	]


static func _apply_stats(actor: Dictionary, stats: Dictionary) -> void:
	actor["hp"] = int(stats.get("hp", 200))
	actor["maxHp"] = int(stats.get("maxHp", actor.get("hp", 200)))
	actor["attack"] = int(stats.get("attack", 24))
	actor["defense"] = int(stats.get("defense", 10))
	actor["quick"] = int(stats.get("quick", 60))
	actor["reviewArchetype"] = str(stats.get("reviewArchetype", "balanced"))


static func _apply_review_mount(actor: Dictionary, mount_form_id: String) -> void:
	var form := PetTemplateCatalog.form_by_id(mount_form_id)
	var mount_name := str(form.get("formName", "芽耳布伊")).strip_edges()
	var mount_max_hp := maxi(320, int(actor.get("maxHp", 200)) + 120)
	actor["ridePetInstanceId"] = "review_mount_%s" % str(actor.get("id", "player"))
	actor["ridePetName"] = mount_name if mount_name != "" else "芽耳布伊"
	actor["ridePetFormId"] = mount_form_id
	actor["ridePetLevel"] = maxi(1, int(actor.get("level", 1)))
	actor["ridePetHp"] = mount_max_hp
	actor["ridePetMaxHp"] = mount_max_hp
	actor["ridePetBattleState"] = "riding"
	actor["ridePetKnocked"] = false


static func _with_actor_fields(state: Dictionary, actor_id: String, fields: Dictionary) -> Dictionary:
	var actors: Array = state.get("actors", [])
	var index := BattleModel.actor_index(state, actor_id)
	if index < 0:
		return state
	var actor := actors[index] as Dictionary
	for key in fields.keys():
		actor[str(key)] = fields[key]
	actors[index] = actor
	state["actors"] = actors
	return state


static func _with_counter_outcome(state: Dictionary, should_launch: bool) -> Dictionary:
	var calibrated := state.duplicate(true)
	var counter_damage := _counter_probe_damage(calibrated)
	var attack_value := int(BattleModel.actor_by_id(calibrated, ENEMY_FOCUS_ID).get("attack", 64))
	var attempts := 0
	while should_launch and counter_damage <= 12 and attempts < 5:
		attack_value *= 2
		calibrated = _with_actor_fields(calibrated, ENEMY_FOCUS_ID, {"attack": attack_value})
		counter_damage = _counter_probe_damage(calibrated)
		attempts += 1
	if should_launch:
		var launch_max_hp := 40
		var launch_threshold := maxi(12, int(round(float(launch_max_hp) * 0.18)))
		var launch_hp := clampi(counter_damage - launch_threshold, 1, launch_max_hp)
		calibrated = _with_actor_fields(calibrated, ALLY_FOCUS_ID, {
			"hp": launch_hp,
			"maxHp": launch_max_hp,
			"reviewExpectedCounterDamage": counter_damage,
		})
	else:
		var down_max_hp := maxi(40, counter_damage)
		calibrated = _with_actor_fields(calibrated, ALLY_FOCUS_ID, {
			"hp": mini(counter_damage, down_max_hp),
			"maxHp": down_max_hp,
			"reviewExpectedCounterDamage": counter_damage,
		})
	return calibrated


static func _counter_probe_damage(state: Dictionary) -> int:
	var after_attack := BattleModel.apply_battle_event(
		state.duplicate(true),
		_attack_event(ALLY_FOCUS_ID, ENEMY_FOCUS_ID, BattleModel.SIDE_ENEMY, 16, true)
	)
	var counter_event = after_attack.get("lastCounterEvent", {})
	if counter_event is Dictionary and not (counter_event as Dictionary).is_empty():
		return maxi(1, int((counter_event as Dictionary).get("damage", 1)))
	return 1


static func _apply_counter_probe(state: Dictionary) -> Dictionary:
	var after_attack := BattleModel.apply_battle_event(
		state.duplicate(true),
		_attack_event(ALLY_FOCUS_ID, ENEMY_FOCUS_ID, BattleModel.SIDE_ENEMY, 16, true)
	)
	var counter_event = after_attack.get("lastCounterEvent", {})
	if not (counter_event is Dictionary) or (counter_event as Dictionary).is_empty():
		return after_attack
	return BattleModel.apply_battle_event(after_attack, (counter_event as Dictionary).duplicate(true))


static func _apply_dodge_counter_probe(
	state: Dictionary,
	dodge_event: Dictionary,
	expected_counter_actor_id: String,
	expected_counter_target_id: String
) -> Dictionary:
	var after_dodge := BattleModel.apply_battle_event(state.duplicate(true), dodge_event)
	var counter_event = after_dodge.get("lastCounterEvent", {})
	var valid_counter_event := (
		counter_event is Dictionary
		and not (counter_event as Dictionary).is_empty()
		and str((counter_event as Dictionary).get("type", "")) == "counter_attack"
		and str((counter_event as Dictionary).get("attackerId", "")) == expected_counter_actor_id
		and str((counter_event as Dictionary).get("targetId", "")) == expected_counter_target_id
	)
	if not bool(after_dodge.get("lastDodged", false)) or not valid_counter_event:
		return {
			"valid": false,
			"dodged": bool(after_dodge.get("lastDodged", false)),
			"counterEvent": counter_event,
		}
	var after_counter := BattleModel.apply_battle_event(after_dodge, (counter_event as Dictionary).duplicate(true))
	return {
		"valid": (
			str(after_counter.get("lastEventType", "")) == "counter_attack"
			and str(after_counter.get("lastAttackerId", "")) == expected_counter_actor_id
			and str(after_counter.get("lastTargetId", "")) == expected_counter_target_id
		),
		"dodged": true,
		"counterEvent": counter_event,
		"counterApplied": str(after_counter.get("lastEventType", "")),
	}


static func _director_skill_id(form_id: String) -> String:
	var skill_ids := PetTemplateCatalog.active_skill_ids_for_form(normalized_form_id(form_id))
	if not skill_ids.is_empty():
		return skill_ids[0]
	return BattleModel.PET_SKILL_BUI_CHARGE


static func _attack_event(attacker_id: String, target_id: String, target_side: String, damage: int, can_counter: bool) -> Dictionary:
	return {
		"type": "attack",
		"attackerId": attacker_id,
		"targetId": target_id,
		"targetSide": target_side,
		"damage": damage,
		"speed": 90,
		"sequence": 1,
		"movementStyle": "melee",
		"canLaunch": false,
		"canCounter": can_counter,
		"forceDodge": false,
		"forceCritical": false,
	}


static func _defend_event(actor_id: String) -> Dictionary:
	return {"type": "defend", "attackerId": actor_id, "speed": 90, "sequence": 2}


static func _skill_event(skill_id: String, skill_name: String) -> Dictionary:
	return {
		"type": "skill_attack",
		"attackerId": ALLY_FOCUS_ID,
		"targetId": ENEMY_FOCUS_ID,
		"targetSide": BattleModel.SIDE_ENEMY,
		"damage": 24,
		"speed": 92,
		"sequence": 3,
		"skillId": skill_id,
		"skillName": skill_name,
		"movementStyle": "melee",
		"canLaunch": false,
		"canCounter": false,
		"forceDodge": false,
		"forceCritical": false,
	}


static func _combo_event() -> Dictionary:
	return {
		"type": "combo_attack",
		"attackerId": ALLY_FOCUS_ID,
		"participantIds": ALLY_COMBO_IDS.duplicate(),
		"targetId": ENEMY_FOCUS_ID,
		"targetSide": BattleModel.SIDE_ENEMY,
		"damage": 42,
		"speed": 94,
		"sequence": 4,
		"movementStyle": "melee_combo",
		"canLaunch": false,
		"canCounter": false,
	}


static func _mounted_combo_event() -> Dictionary:
	return {
		"type": "combo_attack",
		"attackerId": ALLY_MOUNT_FOCUS_ID,
		"participantIds": ALLY_MOUNT_COMBO_IDS.duplicate(),
		"targetId": ENEMY_FOCUS_ID,
		"targetSide": BattleModel.SIDE_ENEMY,
		"damage": 42,
		"speed": 94,
		"sequence": 8,
		"movementStyle": "melee_combo",
		"canLaunch": false,
		"canCounter": false,
	}


static func _knockaway_event(mode: String) -> Dictionary:
	return {
		"type": "attack",
		"attackerId": ALLY_FOCUS_ID,
		"targetId": ENEMY_FOCUS_ID,
		"targetSide": BattleModel.SIDE_ENEMY,
		"damage": 96,
		"speed": 96,
		"sequence": 5,
		"movementStyle": "melee",
		"canLaunch": true,
		"launchMode": mode,
		"forceDodge": false,
		"forceCritical": false,
	}


static func _forced_dodge_event(
	attacker_id: String,
	target_id: String,
	target_side: String,
	can_counter: bool,
	sequence: int
) -> Dictionary:
	var event := _attack_event(attacker_id, target_id, target_side, 18, can_counter)
	event["sequence"] = sequence
	event["forceDodge"] = true
	return event


static func _down_event() -> Dictionary:
	var event := _attack_event(ALLY_FOCUS_ID, ENEMY_FOCUS_ID, BattleModel.SIDE_ENEMY, 42, false)
	event["sequence"] = 7
	event["canLaunch"] = false
	return event


static func _unique_strings(values: Array[String]) -> Array[String]:
	var result: Array[String] = []
	for value in values:
		if value != "" and not result.has(value):
			result.append(value)
	return result
