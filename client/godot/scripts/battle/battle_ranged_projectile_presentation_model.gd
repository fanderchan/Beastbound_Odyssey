extends RefCounted

const EVENT_TYPE := "multi_attack"
const MOVEMENT_STYLE := "ranged_multi"

# The whole action is authored in real-time seconds. At the GM review default
# of 1.0x this gives the bow about 0.75 s to draw, the arrow about 0.95 s of
# readable flight, and the hit/ground result more than 0.5 s to settle.
const EVENT_DURATION_SECONDS := 2.20
const RELEASE_PROGRESS := 0.34
const DODGE_START_PROGRESS := 0.55
const DODGE_FULL_RETREAT_PROGRESS := 0.67
const DODGE_RETURN_START_PROGRESS := 0.90
const FLIGHT_END_PROGRESS := 0.77
const RESULT_REVEAL_PROGRESS := FLIGHT_END_PROGRESS
const BOW_END_PROGRESS := 0.56
const HIT_END_PROGRESS := 0.94
const GROUND_ANIMATION_END_PROGRESS := 0.94

const BOW_FRAME_COUNT := 4
const PROJECTILE_FRAME_COUNT := 4
const HIT_FRAME_COUNT := 4
const GROUND_FRAME_COUNT := 4

const MISS_AIM_PROGRESS := 0.78
const FLIGHT_ARC_HEIGHT := 16.0
const DODGE_RETREAT_DISTANCE := 58.0
const MISS_GROUND_DISTANCE := 8.0


static func is_ranged_arrow_event(event: Dictionary) -> bool:
	if str(event.get("type", "")) != EVENT_TYPE:
		return false
	var movement_style := str(event.get("movementStyle", "")).strip_edges()
	return movement_style == "" or movement_style == MOVEMENT_STYLE


static func is_review_ranged_arrow_event(
	event: Dictionary,
	battle_state: Dictionary
) -> bool:
	return bool(battle_state.get("reviewLab", false)) and is_ranged_arrow_event(event)


static func event_duration_seconds() -> float:
	return EVENT_DURATION_SECONDS


static func event_allows_launch(_event: Dictionary = {}) -> bool:
	# Ranged arrows can defeat a target, but never use the melee overkill launch
	# contract. The target falls in its own slot.
	return false


static func bow_frame_index(event_progress: float) -> int:
	var progress := clampf(event_progress, 0.0, 1.0)
	if progress >= BOW_END_PROGRESS:
		return -1
	if progress < 0.11:
		return 0
	if progress < 0.23:
		return 1
	if progress < RELEASE_PROGRESS:
		return 2
	return 3


static func projectile_visible(event_progress: float) -> bool:
	var progress := clampf(event_progress, 0.0, 1.0)
	return progress >= RELEASE_PROGRESS and progress < FLIGHT_END_PROGRESS


static func projectile_flight_progress(event_progress: float) -> float:
	return clampf(
		(event_progress - RELEASE_PROGRESS)
		/ maxf(0.001, FLIGHT_END_PROGRESS - RELEASE_PROGRESS),
		0.0,
		1.0
	)


static func projectile_frame_index(event_progress: float) -> int:
	if not projectile_visible(event_progress):
		return -1
	var flight_progress := projectile_flight_progress(event_progress)
	return int(floor(flight_progress * 8.0)) % PROJECTILE_FRAME_COUNT


static func hit_frame_index(event_progress: float) -> int:
	var progress := clampf(event_progress, 0.0, 1.0)
	if progress < FLIGHT_END_PROGRESS or progress >= HIT_END_PROGRESS:
		return -1
	var local_progress := (
		(progress - FLIGHT_END_PROGRESS)
		/ maxf(0.001, HIT_END_PROGRESS - FLIGHT_END_PROGRESS)
	)
	return mini(
		HIT_FRAME_COUNT - 1,
		int(floor(local_progress * float(HIT_FRAME_COUNT)))
	)


static func ground_frame_index(event_progress: float) -> int:
	var progress := clampf(event_progress, 0.0, 1.0)
	if progress < FLIGHT_END_PROGRESS:
		return -1
	if progress >= GROUND_ANIMATION_END_PROGRESS:
		return GROUND_FRAME_COUNT - 1
	var local_progress := (
		(progress - FLIGHT_END_PROGRESS)
		/ maxf(0.001, GROUND_ANIMATION_END_PROGRESS - FLIGHT_END_PROGRESS)
	)
	return mini(
		GROUND_FRAME_COUNT - 1,
		int(floor(local_progress * float(GROUND_FRAME_COUNT)))
	)


static func dodge_motion_started(event_progress: float) -> bool:
	return event_progress >= DODGE_START_PROGRESS


static func dodge_retreat_factor(event_progress: float) -> float:
	var progress := clampf(event_progress, 0.0, 1.0)
	if progress < DODGE_START_PROGRESS:
		return 0.0
	if progress < DODGE_FULL_RETREAT_PROGRESS:
		return _smooth_unit(
			(progress - DODGE_START_PROGRESS)
			/ maxf(
				0.001,
				DODGE_FULL_RETREAT_PROGRESS - DODGE_START_PROGRESS
			)
		)
	if progress <= DODGE_RETURN_START_PROGRESS:
		return 1.0
	return 1.0 - _smooth_unit(
		(progress - DODGE_RETURN_START_PROGRESS)
		/ maxf(0.001, 1.0 - DODGE_RETURN_START_PROGRESS)
	)


static func dodge_retreat_offset(
	start: Vector2,
	target_ground: Vector2,
	event_progress: float,
	visual_scale: float
) -> Vector2:
	var direction := (target_ground - start).normalized()
	if direction.length() <= 0.001:
		direction = Vector2.RIGHT
	return (
		direction
		* DODGE_RETREAT_DISTANCE
		* visual_scale
		* dodge_retreat_factor(event_progress)
	)


static func miss_ground_position(
	start: Vector2,
	target_ground: Vector2,
	target_ordinal: int,
	visual_scale: float
) -> Vector2:
	var direction := (target_ground - start).normalized()
	if direction.length() <= 0.001:
		direction = Vector2.RIGHT
	var tangent := Vector2(-direction.y, direction.x)
	var lane_offset := float((target_ordinal % 3) - 1) * 7.0 * visual_scale
	return (
		target_ground
		+ direction * MISS_GROUND_DISTANCE * visual_scale
		+ tangent * lane_offset
		+ Vector2(0.0, 2.0 * visual_scale)
	)


static func flight_position(
	start: Vector2,
	aim: Vector2,
	ground: Vector2,
	flight_progress: float,
	dodged: bool
) -> Vector2:
	var progress := clampf(flight_progress, 0.0, 1.0)
	if not dodged:
		var position := start.lerp(aim, progress)
		position.y -= sin(progress * PI) * FLIGHT_ARC_HEIGHT
		return position
	if progress <= MISS_AIM_PROGRESS:
		var aim_progress := progress / MISS_AIM_PROGRESS
		var position := start.lerp(aim, aim_progress)
		position.y -= sin(aim_progress * PI) * FLIGHT_ARC_HEIGHT
		return position
	var fall_progress := (
		(progress - MISS_AIM_PROGRESS)
		/ maxf(0.001, 1.0 - MISS_AIM_PROGRESS)
	)
	var position := aim.lerp(ground, _smooth_unit(fall_progress))
	position.y -= sin(fall_progress * PI) * 5.0
	return position


static func flight_direction(
	start: Vector2,
	aim: Vector2,
	ground: Vector2,
	flight_progress: float,
	dodged: bool
) -> Vector2:
	var before := flight_position(
		start,
		aim,
		ground,
		maxf(0.0, flight_progress - 0.012),
		dodged
	)
	var after := flight_position(
		start,
		aim,
		ground,
		minf(1.0, flight_progress + 0.012),
		dodged
	)
	var direction := (after - before).normalized()
	return direction if direction.length() > 0.001 else Vector2.RIGHT


static func draw_orientation(direction: Vector2) -> Dictionary:
	var normalized := direction.normalized()
	if normalized.length() <= 0.001:
		normalized = Vector2.RIGHT
	var flip_x := normalized.x < 0.0
	var rotation := normalized.angle() - (PI if flip_x else 0.0)
	return {
		"flipX": flip_x,
		"rotation": rotation,
	}


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	var example := {
		"type": EVENT_TYPE,
		"movementStyle": MOVEMENT_STYLE,
		"canLaunch": true,
	}
	if not is_ranged_arrow_event(example):
		errors.append("群攻弓事件没有进入箭矢演出")
	if event_allows_launch(example):
		errors.append("箭矢事件错误允许击飞")
	if absf(EVENT_DURATION_SECONDS - 2.20) > 0.001:
		errors.append("箭矢事件不是1倍速2.20秒时间轴")
	var flight_seconds := (
		FLIGHT_END_PROGRESS - RELEASE_PROGRESS
	) * EVENT_DURATION_SECONDS
	if flight_seconds < 0.90:
		errors.append("箭矢可见飞行时间不足0.90秒")
	if (
		bow_frame_index(0.05) != 0
		or bow_frame_index(0.16) != 1
		or bow_frame_index(0.28) != 2
		or bow_frame_index(0.40) != 3
	):
		errors.append("举弓、半拉、满弓、松弦四段没有按序播放")
	if projectile_visible(RELEASE_PROGRESS - 0.01):
		errors.append("箭矢在松弦前提前出现")
	if not projectile_visible(
		(RELEASE_PROGRESS + FLIGHT_END_PROGRESS) * 0.5
	):
		errors.append("箭矢没有覆盖飞行中段")
	if hit_frame_index(FLIGHT_END_PROGRESS + 0.01) < 0:
		errors.append("命中后没有进入箭矢冲击帧")
	if ground_frame_index(1.0) != GROUND_FRAME_COUNT - 1:
		errors.append("回避箭没有保持钉地末帧")
	var start := Vector2(100.0, 100.0)
	var aim := Vector2(400.0, 100.0)
	var target_ground := Vector2(400.0, 170.0)
	var ground := miss_ground_position(start, target_ground, 0, 1.0)
	var miss_at_aim := flight_position(
		start,
		aim,
		ground,
		MISS_AIM_PROGRESS,
		true
	)
	var miss_at_end := flight_position(start, aim, ground, 1.0, true)
	if miss_at_aim.distance_to(aim) > 0.01 or miss_at_end.distance_to(ground) > 0.01:
		errors.append("回避箭没有先穿过原目标位再落到地面")
	if not dodge_motion_started(DODGE_START_PROGRESS):
		errors.append("目标回避动作没有早于箭矢落地")
	var aim_event_progress := (
		RELEASE_PROGRESS
		+ MISS_AIM_PROGRESS
		* (FLIGHT_END_PROGRESS - RELEASE_PROGRESS)
	)
	var retreat_at_aim := dodge_retreat_offset(
		start,
		target_ground,
		aim_event_progress,
		1.0
	)
	var retreat_at_land := dodge_retreat_offset(
		start,
		target_ground,
		RESULT_REVEAL_PROGRESS,
		1.0
	)
	var retreated_ground := target_ground + retreat_at_land
	var incoming_direction := (target_ground - start).normalized()
	var landing_projection := (
		ground - target_ground
	).dot(incoming_direction)
	if retreat_at_aim.length() < DODGE_RETREAT_DISTANCE * 0.98:
		errors.append("箭穿过原站位前目标还没有完成后撤半步")
	if retreat_at_land.length() < 50.0:
		errors.append("回避后撤距离不足，密集10V10中无法辨认")
	if (
		landing_projection <= 0.0
		or landing_projection >= retreat_at_land.length()
		or ground.distance_to(retreated_ground) < 40.0
	):
		errors.append("回避箭没有落在后撤目标前方的原站位附近")
	if dodge_retreat_offset(start, target_ground, 1.0, 1.0).length() > 0.01:
		errors.append("回避动作结束后没有平滑回到阵位")
	return errors


static func _smooth_unit(value: float) -> float:
	var progress := clampf(value, 0.0, 1.0)
	return progress * progress * (3.0 - 2.0 * progress)
