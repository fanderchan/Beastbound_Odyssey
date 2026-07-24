extends RefCounted

const BattleModel := preload("res://scripts/battle/battle_model.gd")
const BattleStatusModel := preload("res://scripts/battle/battle_status_model.gd")

const PLAYER_ROLE_ARCHER := "archer"
const PLAYER_ROLE_HEALER := "healer"
const PLAYER_ROLE_GUARDIAN := "guardian"
const PLAYER_ROLE_DUELIST := "duelist"
const PLAYER_ROLE_TACTICIAN := "tactician"

const PET_ROLE_BURST := "burst"
const PET_ROLE_CONFUSION := "confusion"
const PET_ROLE_STONE := "stone"
const PET_ROLE_SLEEP := "sleep"
const PET_ROLE_CHARGER := "charger"

const PLAYER_ROLES: Array[String] = [
	PLAYER_ROLE_ARCHER,
	PLAYER_ROLE_HEALER,
	PLAYER_ROLE_GUARDIAN,
	PLAYER_ROLE_DUELIST,
	PLAYER_ROLE_TACTICIAN,
]
const PET_ROLES: Array[String] = [
	PET_ROLE_BURST,
	PET_ROLE_CONFUSION,
	PET_ROLE_STONE,
	PET_ROLE_SLEEP,
	PET_ROLE_CHARGER,
]

const ROLE_LABELS := {
	PLAYER_ROLE_ARCHER: "群攻弓手",
	PLAYER_ROLE_HEALER: "战场治疗",
	PLAYER_ROLE_GUARDIAN: "守阵前卫",
	PLAYER_ROLE_DUELIST: "残血收割",
	PLAYER_ROLE_TACTICIAN: "威胁点杀",
	PET_ROLE_BURST: "爆发猛宠",
	PET_ROLE_CONFUSION: "混乱控制",
	PET_ROLE_STONE: "石化控制",
	PET_ROLE_SLEEP: "催眠控制",
	PET_ROLE_CHARGER: "冲撞战宠",
}

const CONTROL_ROLE_SKILLS := {
	PET_ROLE_CONFUSION: BattleModel.PET_SKILL_CONFUSE_CRY,
	PET_ROLE_STONE: BattleModel.PET_SKILL_STONE_GAZE,
	PET_ROLE_SLEEP: BattleModel.PET_SKILL_SLEEP_POWDER,
}
const CONTROL_ROLE_STATUSES := {
	PET_ROLE_CONFUSION: BattleModel.STATUS_CONFUSION,
	PET_ROLE_STONE: BattleModel.STATUS_STONE,
	PET_ROLE_SLEEP: BattleModel.STATUS_SLEEP,
}


static func role_label(role_id: String) -> String:
	return str(ROLE_LABELS.get(role_id, role_id))


static func build_round_events(state: Dictionary) -> Array[Dictionary]:
	var entries: Array[Dictionary] = []
	var guarding_ids: Array[String] = []
	var planned_control_targets := {}
	var sequence := 0
	for side_value in [BattleModel.SIDE_ALLY, BattleModel.SIDE_ENEMY]:
		var side := str(side_value)
		for actor_id in BattleModel.living_actor_ids_by_battle_order(state, side):
			var event := _event_for_actor(
				state,
				actor_id,
				side,
				sequence,
				planned_control_targets
			)
			if event.is_empty():
				continue
			entries.append(event)
			if str(event.get("type", "")) == "defend":
				guarding_ids.append(actor_id)
			sequence += 1
	state["guardingActorIds"] = guarding_ids
	BattleModel._sort_events_by_speed(entries)
	return BattleModel._collapse_combo_events(state, entries)


static func event_signature(events: Array[Dictionary]) -> String:
	var rows: Array[String] = []
	for event in events:
		rows.append("%s|%s|%s|%s|%s|%d|%s" % [
			str(event.get("type", "")),
			str(event.get("attackerId", "")),
			str(event.get("targetId", "")),
			",".join(_string_array(event.get("targetIds", []))),
			str(event.get("skillId", event.get("spiritId", event.get("actionId", "")))),
			int(event.get("damage", event.get("heal", 0))),
			str(event.get("aiIntent", "")),
		])
	return "\n".join(rows)


static func _event_for_actor(
	state: Dictionary,
	actor_id: String,
	side: String,
	sequence: int,
	planned_control_targets: Dictionary
) -> Dictionary:
	var actor := BattleModel.actor_by_id(state, actor_id)
	if actor.is_empty():
		return {}
	var role_id := str(actor.get("reviewAiRole", ""))
	var kind := str(actor.get("kind", ""))
	if kind == "player":
		return _player_event(state, actor, side, role_id, sequence)
	if kind == "pet" or kind == "wild_pet":
		return _pet_event(
			state,
			actor,
			side,
			role_id,
			sequence,
			planned_control_targets
		)
	return _basic_attack_event(
		state,
		actor,
		side,
		sequence,
		"寻找可击破目标"
	)


static func _player_event(
	state: Dictionary,
	actor: Dictionary,
	side: String,
	role_id: String,
	sequence: int
) -> Dictionary:
	var actor_id := str(actor.get("id", ""))
	match role_id:
		PLAYER_ROLE_HEALER:
			var heal_event := _healer_event(state, actor, side, sequence)
			if not heal_event.is_empty():
				return heal_event
			return _basic_attack_event(
				state,
				actor,
				side,
				sequence,
				"全队状态健康，协助压低敌方治疗"
			)
		PLAYER_ROLE_GUARDIAN:
			var hp_ratio := _hp_ratio(actor)
			var round_number := int(state.get("round", 1))
			if hp_ratio <= 0.68 or (round_number + _stable_index(actor_id, 3)) % 3 == 0:
				return _with_intent(
					BattleModel._make_defend_event(state, actor_id, sequence),
					actor,
					"预判集火，架起防御"
				)
			return _basic_attack_event(
				state,
				actor,
				side,
				sequence,
				"保护后排，压制敌方爆发宠",
				"burst"
			)
		PLAYER_ROLE_ARCHER:
			return _basic_attack_event(
				state,
				actor,
				side,
				sequence,
				"敌方站位密集，发动玄影连射"
			)
		PLAYER_ROLE_DUELIST:
			return _basic_attack_event(
				state,
				actor,
				side,
				sequence,
				"追击生命比例最低的目标",
				"lowest_hp"
			)
		PLAYER_ROLE_TACTICIAN:
			return _basic_attack_event(
				state,
				actor,
				side,
				sequence,
				"优先点杀敌方治疗与弓手",
				"high_threat"
			)
	return _basic_attack_event(state, actor, side, sequence, "稳健进攻")


static func _pet_event(
	state: Dictionary,
	actor: Dictionary,
	side: String,
	role_id: String,
	sequence: int,
	planned_control_targets: Dictionary
) -> Dictionary:
	var actor_id := str(actor.get("id", ""))
	var target_side := _opposing_side(side)
	if CONTROL_ROLE_SKILLS.has(role_id):
		var status_id := str(CONTROL_ROLE_STATUSES.get(role_id, ""))
		var control_target_id := _best_control_target_id(
			state,
			target_side,
			status_id,
			planned_control_targets,
			actor_id
		)
		if control_target_id != "":
			planned_control_targets[control_target_id] = true
			var control_event := BattleModel._make_skill_event(
				state,
				actor_id,
				control_target_id,
				sequence,
				str(CONTROL_ROLE_SKILLS.get(role_id, ""))
			)
			control_event["targetSide"] = target_side
			return _with_intent(
				control_event,
				actor,
				"控制高威胁目标，避免重复覆盖已有异常"
			)
		return _basic_attack_event(
			state,
			actor,
			side,
			sequence,
			"控制窗口未到，协同压低残血",
			"lowest_hp"
		)
	if role_id == PET_ROLE_BURST:
		var burst_target_id := _best_target_id(
			state,
			target_side,
			"lowest_hp",
			actor_id
		)
		if burst_target_id == "":
			return {}
		var burst_event := BattleModel._make_skill_event(
			state,
			actor_id,
			burst_target_id,
			sequence,
			BattleModel.PET_SKILL_FOCUS_BITE
		)
		burst_event["targetSide"] = target_side
		burst_event["damage"] = maxi(
			1,
			int(round(float(burst_event.get("damage", 1)) * 1.42))
		)
		burst_event["audioImpactClass"] = "heavy"
		return _with_intent(
			burst_event,
			actor,
			"锁定残血，以集中咬击完成爆发"
		)
	if role_id == PET_ROLE_CHARGER:
		var round_number := int(state.get("round", 1))
		if (round_number + _stable_index(actor_id, 2)) % 2 == 0:
			var charge_target_id := _best_target_id(
				state,
				target_side,
				"high_threat",
				actor_id
			)
			if charge_target_id != "":
				var charge_event := BattleModel._make_skill_event(
					state,
					actor_id,
					charge_target_id,
					sequence,
					BattleModel.PET_SKILL_BUI_CHARGE
				)
				charge_event["targetSide"] = target_side
				return _with_intent(
					charge_event,
					actor,
					"冲撞敌方核心，制造击飞机会"
				)
		return _basic_attack_event(
			state,
			actor,
			side,
			sequence,
			"保存冲撞节奏，跟随队友集火",
			"high_threat"
		)
	return _basic_attack_event(
		state,
		actor,
		side,
		sequence,
		"跟随队友集火",
		"high_threat"
	)


static func _healer_event(
	state: Dictionary,
	actor: Dictionary,
	side: String,
	sequence: int
) -> Dictionary:
	var living_ids := BattleModel.living_actor_ids(state, side)
	var wounded_count := 0
	var total_missing := 0
	var lowest_ratio := 1.0
	var lowest_id := ""
	for target_id in living_ids:
		var target := BattleModel.actor_by_id(state, target_id)
		var max_hp := maxi(1, int(target.get("maxHp", 1)))
		var hp := clampi(int(target.get("hp", 0)), 0, max_hp)
		var missing := max_hp - hp
		var ratio := float(hp) / float(max_hp)
		if missing > 0:
			wounded_count += 1
			total_missing += missing
		if ratio < lowest_ratio:
			lowest_ratio = ratio
			lowest_id = target_id
	var attacker_id := str(actor.get("id", ""))
	if wounded_count >= 3 and total_missing >= 720:
		var all_event := BattleModel._make_spirit_heal_all_event(
			state,
			attacker_id,
			sequence,
			BattleModel.SPIRIT_GRACE_ALL
		)
		all_event["targetSide"] = side
		all_event["targetIds"] = living_ids
		return _with_intent(
			all_event,
			actor,
			"多人受伤，释放全体恩惠"
		)
	if lowest_id != "" and (lowest_ratio <= 0.76 or total_missing >= 550):
		var single_event := BattleModel._make_spirit_heal_event(
			state,
			attacker_id,
			lowest_id,
			sequence,
			BattleModel.SPIRIT_MOIST_SINGLE
		)
		single_event["targetSide"] = side
		return _with_intent(
			single_event,
			actor,
			"发现重伤队友，进行单体急救"
		)
	return {}


static func _basic_attack_event(
	state: Dictionary,
	actor: Dictionary,
	side: String,
	sequence: int,
	intent: String,
	target_mode: String = "high_threat"
) -> Dictionary:
	var actor_id := str(actor.get("id", ""))
	var target_side := _opposing_side(side)
	var target_id := _best_target_id(
		state,
		target_side,
		target_mode,
		actor_id
	)
	if target_id == "":
		return {}
	return _with_intent(
		BattleModel._make_attack_event(
			state,
			actor_id,
			target_id,
			target_side,
			sequence
		),
		actor,
		intent
	)


static func _best_control_target_id(
	state: Dictionary,
	target_side: String,
	status_id: String,
	planned_control_targets: Dictionary,
	attacker_id: String
) -> String:
	var eligible: Array[String] = []
	for target_id in BattleModel.living_actor_ids(state, target_side):
		if planned_control_targets.has(target_id):
			continue
		var target := BattleModel.actor_by_id(state, target_id)
		if BattleStatusModel.has_status(target, status_id):
			continue
		if not BattleStatusModel.active_matching_status_ids(
			target,
			BattleStatusModel.CONTROL_STATUSES
		).is_empty():
			continue
		eligible.append(target_id)
	if eligible.is_empty():
		return ""
	return _highest_scored_target_id(
		state,
		eligible,
		"control",
		attacker_id
	)


static func _best_target_id(
	state: Dictionary,
	target_side: String,
	mode: String,
	attacker_id: String
) -> String:
	return _highest_scored_target_id(
		state,
		BattleModel.living_actor_ids(state, target_side),
		mode,
		attacker_id
	)


static func _highest_scored_target_id(
	state: Dictionary,
	target_ids: Array[String],
	mode: String,
	attacker_id: String
) -> String:
	var best_id := ""
	var best_score := -INF
	for target_id in target_ids:
		var target := BattleModel.actor_by_id(state, target_id)
		if target.is_empty():
			continue
		var role_id := str(target.get("reviewAiRole", ""))
		var score := (1.0 - _hp_ratio(target)) * 1000.0
		score += float(target.get("attack", 0)) * 0.18
		match mode:
			"lowest_hp":
				score += (1.0 - _hp_ratio(target)) * 950.0
			"burst":
				if role_id == PET_ROLE_BURST:
					score += 620.0
				elif role_id == PLAYER_ROLE_ARCHER:
					score += 360.0
			"control":
				if role_id == PLAYER_ROLE_HEALER:
					score += 760.0
				elif role_id == PLAYER_ROLE_ARCHER:
					score += 680.0
				elif role_id == PET_ROLE_BURST:
					score += 620.0
			_:
				if role_id == PLAYER_ROLE_HEALER:
					score += 560.0
				elif role_id == PLAYER_ROLE_ARCHER:
					score += 500.0
				elif role_id == PET_ROLE_BURST:
					score += 460.0
		score += float(_stable_index(
			"%s:%s:%s:%d" % [
				str(state.get("reviewSeed", 1)),
				attacker_id,
				target_id,
				int(state.get("round", 1)),
			],
			997
		)) / 997.0
		if score > best_score:
			best_score = score
			best_id = target_id
	return best_id


static func _with_intent(
	event: Dictionary,
	actor: Dictionary,
	intent: String
) -> Dictionary:
	if event.is_empty():
		return event
	event["aiRole"] = str(actor.get("reviewAiRole", ""))
	event["aiRoleLabel"] = str(actor.get(
		"reviewAiRoleLabel",
		role_label(str(actor.get("reviewAiRole", "")))
	))
	event["aiIntent"] = intent
	return event


static func _hp_ratio(actor: Dictionary) -> float:
	var max_hp := maxi(1, int(actor.get("maxHp", 1)))
	return clampf(float(actor.get("hp", 0)) / float(max_hp), 0.0, 1.0)


static func _opposing_side(side: String) -> String:
	return (
		BattleModel.SIDE_ENEMY
		if side == BattleModel.SIDE_ALLY
		else BattleModel.SIDE_ALLY
	)


static func _stable_index(seed_text: String, count: int) -> int:
	if count <= 0:
		return 0
	var value := 17
	for index in range(seed_text.length()):
		value = (value * 131 + seed_text.unicode_at(index)) % 2147483647
	return value % count


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value:
			var text := str(item)
			if text != "":
				result.append(text)
	return result
