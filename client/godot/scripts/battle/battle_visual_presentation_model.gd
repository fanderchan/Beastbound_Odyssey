extends RefCounted

const STATE_GUARD_HIT := "guard_hit"


static func damage_reaction_state(hp_after: int, dodged: bool, launched: bool, blocked: bool) -> String:
	if dodged:
		return "dodge"
	if launched:
		return "launched"
	if hp_after <= 0:
		return "down"
	return STATE_GUARD_HIT if blocked else "hit"


static func down_action_progress(
	is_current_target: bool,
	event_progress: float,
	result_reveal_progress: float
) -> float:
	if not is_current_target:
		return 1.0
	var reveal := clampf(result_reveal_progress, 0.0, 0.95)
	if event_progress <= reveal:
		return 0.0
	return clampf((event_progress - reveal) / maxf(0.05, 1.0 - reveal), 0.0, 1.0)


static func guard_impact_strength(is_guard_hit: bool, event_progress: float, result_reveal_progress: float) -> float:
	if not is_guard_hit:
		return 0.0
	var age := event_progress - clampf(result_reveal_progress, 0.0, 1.0)
	if age < 0.0 or age > 0.24:
		return 0.0
	var normalized := age / 0.24
	return sin(normalized * PI)


static func melee_lunge(event_progress: float, hold_for_counter: bool, result_reveal_progress: float) -> float:
	var progress := clampf(event_progress, 0.0, 1.0)
	if not hold_for_counter:
		return sin(progress * PI)
	var contact_progress := clampf(result_reveal_progress, 0.18, 0.72)
	if progress >= contact_progress:
		return 1.0
	return _smooth_unit(progress / maxf(0.01, contact_progress))


static func counter_target_anchor_factor(
	event_progress: float,
	result_reveal_progress: float,
	defeated: bool,
	launched: bool
) -> float:
	if defeated or launched:
		return 1.0
	var progress := clampf(event_progress, 0.0, 1.0)
	var return_progress := clampf(maxf(0.62, result_reveal_progress + 0.14), 0.0, 0.88)
	if progress <= return_progress:
		return 1.0
	return 1.0 - _smooth_unit((progress - return_progress) / maxf(0.01, 1.0 - return_progress))


static func ground_shadow_plan(kind: String, action_state: String, visual_scale: float, has_ride: bool = false) -> Dictionary:
	var radius := Vector2(30.0, 8.0)
	match kind:
		"player":
			radius = Vector2(23.0, 6.5)
		"wild_pet", "pet":
			radius = Vector2(32.0, 8.5)
	if has_ride:
		radius = Vector2(43.0, 10.5)
	if action_state == "down":
		radius.x *= 1.36
		radius.y *= 1.10
	elif action_state == "launched":
		radius *= 0.76
	return {
		"centerOffset": Vector2(0.0, 2.0) * visual_scale,
		"radius": radius * visual_scale,
		"outerAlpha": 0.055,
		"middleAlpha": 0.085,
		"coreAlpha": 0.115,
	}


static func should_show_actor_label(
	label: String,
	large_formation: bool,
	is_player_actor: bool,
	is_focus_actor: bool
) -> bool:
	if label == "":
		return false
	if not large_formation:
		return true
	return is_player_actor or is_focus_actor


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	if damage_reaction_state(12, false, false, true) != STATE_GUARD_HIT:
		errors.append("防御受击没有独立状态")
	if damage_reaction_state(0, false, false, true) != "down":
		errors.append("致死防御受击必须优先倒地")
	if damage_reaction_state(12, true, false, true) != "dodge":
		errors.append("回避必须优先于防御受击")
	if absf(down_action_progress(true, 0.40, 0.50)) > 0.001:
		errors.append("倒地动作不能早于命中揭示")
	if down_action_progress(true, 1.0, 0.50) < 0.999:
		errors.append("倒地动作末帧必须可保持")
	var shadow := ground_shadow_plan("pet", "idle", 1.0)
	var radius := shadow.get("radius", Vector2.ZERO) as Vector2
	if radius.x <= radius.y * 2.5 or absf(float((shadow.get("centerOffset", Vector2.ZERO) as Vector2).y)) > 4.0:
		errors.append("宠物阴影必须是贴脚软椭圆")
	if should_show_actor_label("测试 Lv1", true, false, false):
		errors.append("10V10 不应常驻显示全部名称")
	if not should_show_actor_label("测试 Lv1", true, false, true):
		errors.append("10V10 当前焦点名称必须可见")
	if melee_lunge(1.0, true, 0.48) < 0.999:
		errors.append("触发反击时，先手攻击者必须停在接触点")
	if absf(melee_lunge(1.0, false, 0.48)) > 0.001:
		errors.append("普通近战动作结束时必须返回原位")
	if counter_target_anchor_factor(1.0, 0.48, false, false) > 0.001:
		errors.append("承受非致命反击后必须完成归位")
	if counter_target_anchor_factor(1.0, 0.48, true, false) < 0.999:
		errors.append("被反击击倒后必须留在接触点")
	if counter_target_anchor_factor(1.0, 0.48, false, true) < 0.999:
		errors.append("被反击击飞时必须从接触点起飞")
	return errors


static func _smooth_unit(value: float) -> float:
	var t := clampf(value, 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)
