extends RefCounted

const BattleActionCatalog := preload("res://scripts/battle/battle_action_catalog.gd")
const BattleModel := preload("res://scripts/battle/battle_model.gd")
const BattleSkillFeedbackPresentationModel := preload(
	"res://scripts/battle/battle_skill_feedback_presentation_model.gd"
)
const BattleSkillFeedbackAssetCatalog := preload(
	"res://scripts/battle/battle_skill_feedback_asset_catalog.gd"
)


static func prepare_event(event: Dictionary) -> Dictionary:
	var prepared := event.duplicate(true)
	if str(prepared.get("type", "")) != "skill_attack":
		return prepared
	var action_id := str(
		prepared.get("actionId", prepared.get("skillId", ""))
	).strip_edges()
	if action_id == "":
		return prepared
	var feedback := BattleActionCatalog.feedback_for(action_id)
	var plan := BattleSkillFeedbackPresentationModel.plan_for(
		action_id,
		feedback
	)
	if not plan.is_empty():
		prepared["skillFeedbackPlan"] = plan
		prepared["skillFeedbackAssetReady"] = BattleSkillFeedbackAssetCatalog.prepare(
			str(plan.get("assetBundlePath", "")),
			action_id,
			str(plan.get("style", ""))
		)
	return prepared


static func melee_contact_distance_scale(event: Dictionary) -> float:
	var value = event.get("skillFeedbackPlan", {})
	if not (value is Dictionary):
		return 1.0
	var impact := (value as Dictionary).get("impact", {}) as Dictionary
	return clampf(
		float(impact.get("contactDistanceScale", 1.0)),
		1.0,
		4.0
	)


static func draw_actor_ground_effect(
	host,
	actor: Dictionary,
	pos: Vector2,
	visual_scale: float
) -> void:
	var plan := _current_plan(host)
	if plan.is_empty():
		return
	var actor_id := str(actor.get("id", ""))
	if actor_id != str(host.battle_current_event.get("attackerId", "")):
		return
	var progress: float = host._battle_current_event_progress()
	var strength := BattleSkillFeedbackPresentationModel.cast_strength(
		plan,
		progress
	)
	if strength <= 0.01:
		return
	_draw_leaf_earth_cast(
		host,
		actor,
		pos,
		visual_scale,
		plan,
		progress,
		strength
	)


## Returns true when the target belongs to a specialized feedback event. The
## caller uses this to suppress the generic orange melee starburst even during
## the brief frames where the specialized effect has fully faded.
static func draw_actor_overlay_effect(
	host,
	actor: Dictionary,
	pos: Vector2,
	visual_scale: float
) -> bool:
	var plan := _current_plan(host)
	if plan.is_empty():
		return false
	var actor_id := str(actor.get("id", ""))
	if actor_id == "" or actor_id != str(host.battle_current_event.get("targetId", "")):
		return false
	var progress: float = host._battle_current_event_progress()
	var contact_progress: float = host._battle_event_result_reveal_progress(
		host.battle_current_event
	)
	var strength := BattleSkillFeedbackPresentationModel.impact_strength(
		plan,
		progress,
		contact_progress,
		host.battle_current_event_duration
	)
	if strength <= 0.01:
		return true
	var result_mode := BattleSkillFeedbackPresentationModel.result_mode(
		host.battle_current_event
	)
	if result_mode == "dodge":
		var dodge_burst_progress := BattleSkillFeedbackPresentationModel.impact_burst_progress(
			plan,
			progress,
			contact_progress,
			host.battle_current_event_duration
		)
		_draw_leaf_earth_dodge(
			host,
			actor,
			visual_scale,
			plan,
			strength,
			dodge_burst_progress
		)
	else:
		var hit_burst_progress := BattleSkillFeedbackPresentationModel.impact_burst_progress(
			plan,
			progress,
			contact_progress,
			host.battle_current_event_duration
		)
		_draw_leaf_earth_hit(
			host,
			actor,
			pos,
			visual_scale,
			plan,
			strength,
			hit_burst_progress,
			result_mode == "critical"
		)
	return true


static func _current_plan(host) -> Dictionary:
	if host.battle_current_event.is_empty():
		return {}
	var value = host.battle_current_event.get("skillFeedbackPlan", {})
	return value as Dictionary if value is Dictionary else {}


static func _draw_leaf_earth_cast(
	host,
	actor: Dictionary,
	pos: Vector2,
	visual_scale: float,
	plan: Dictionary,
	progress: float,
	strength: float
) -> void:
	var cast := plan.get("cast", {}) as Dictionary
	var palette := plan.get("palette", {}) as Dictionary
	var direction := _direction_to_current_target(host, actor)
	var heading := direction.angle()
	var radius := float(cast.get("ringRadius", 36.0)) * visual_scale
	var center := pos + Vector2(0.0, 2.0 * visual_scale)
	var earth: Color = palette.get("earth", Color(0.48, 0.31, 0.16, 1.0))
	var dust: Color = palette.get("dust", Color(0.78, 0.69, 0.39, 1.0))
	var leaf: Color = palette.get("leaf", Color(0.50, 0.72, 0.28, 1.0))
	var leaf_glow: Color = palette.get("leafGlow", Color(0.75, 0.89, 0.42, 1.0))
	var convergence := BattleSkillFeedbackPresentationModel.cast_convergence(
		plan,
		progress
	)
	if _draw_leaf_earth_cast_asset(
		host,
		pos,
		visual_scale,
		plan,
		direction,
		convergence,
		strength
	):
		return
	var tangent := direction.rotated(PI * 0.5)
	var pressure_center := center - direction * radius * 0.12
	_draw_ellipse_fill(
		host,
		pressure_center,
		Vector2(radius * 0.52, radius * 0.13),
		heading,
		_with_alpha(earth, 0.22 * strength)
	)
	_draw_ellipse_fill(
		host,
		pressure_center - direction * radius * 0.10,
		Vector2(radius * 0.36, radius * 0.075),
		heading,
		_with_alpha(dust, 0.20 * strength)
	)
	var trail_length := radius * (0.46 + 0.36 * convergence)
	for trail_index in range(3):
		var ordinal := float(trail_index) - 1.0
		var lateral := tangent * ordinal * 10.0 * visual_scale
		var trail_start := (
			center
			- direction * (trail_length + absf(ordinal) * 5.0 * visual_scale)
			+ lateral
		)
		var trail_end := (
			center
			+ direction * (12.0 + convergence * 14.0) * visual_scale
			+ lateral * 0.28
		)
		_draw_tapered_streak(
			host,
			trail_start,
			trail_end,
			(7.0 - absf(ordinal) * 1.2) * visual_scale,
			1.0 * visual_scale,
			_with_alpha(leaf, (0.30 - absf(ordinal) * 0.04) * strength)
		)
		_draw_tapered_streak(
			host,
			trail_start + direction * 5.0 * visual_scale,
			trail_end,
			(2.2 - absf(ordinal) * 0.3) * visual_scale,
			0.35 * visual_scale,
			_with_alpha(leaf_glow, (0.50 - absf(ordinal) * 0.08) * strength)
		)
	var arrow_tip := center + direction * (22.0 + 10.0 * convergence) * visual_scale
	for side_sign in [-1.0, 1.0]:
		_draw_tapered_streak(
			host,
			arrow_tip - direction * 18.0 * visual_scale + tangent * side_sign * 11.0 * visual_scale,
			arrow_tip,
			4.6 * visual_scale,
			0.8 * visual_scale,
			_with_alpha(dust, 0.72 * strength)
		)
	var leaf_count := int(cast.get("leafCount", 3))
	for index in range(leaf_count):
		var ordinal := float(index) - float(leaf_count - 1) * 0.5
		var source_distance := radius * (0.66 + 0.06 * float(index % 2))
		var orbit_angle := heading + PI + ordinal * 0.36 + convergence * 0.24
		var source_offset := Vector2.RIGHT.rotated(orbit_angle) * source_distance
		var leaf_center := center + source_offset * (1.0 - 0.64 * convergence)
		leaf_center += tangent * ordinal * 2.2 * visual_scale
		var leaf_angle := heading + 0.34 * sin(float(index + 1) * 1.7) + convergence * 0.4
		_draw_leaf(
			host,
			leaf_center,
			(15.0 + 2.0 * float(index % 2)) * visual_scale,
			(6.2 + 0.8 * float(index % 2)) * visual_scale,
			leaf_angle,
			_with_alpha(leaf, (0.56 + 0.28 * convergence) * strength),
			_with_alpha(leaf_glow, 0.68 * strength)
		)


static func _draw_leaf_earth_hit(
	host,
	actor: Dictionary,
	pos: Vector2,
	visual_scale: float,
	plan: Dictionary,
	strength: float,
	burst_progress: float,
	critical: bool
) -> void:
	var impact := plan.get("impact", {}) as Dictionary
	var palette := plan.get("palette", {}) as Dictionary
	var toward_attacker := _direction_toward_attacker(host, actor)
	var outward := -toward_attacker
	if _draw_leaf_earth_hit_asset(
		host,
		pos,
		visual_scale,
		plan,
		toward_attacker,
		strength,
		burst_progress,
		critical
	):
		return
	var center := _impact_center(host, actor, pos, visual_scale)
	center += toward_attacker * 34.0 * visual_scale
	var radius := float(impact.get("radius", 31.0)) * visual_scale
	if critical:
		radius *= 1.12
	var leaf: Color = palette.get("leaf", Color(0.50, 0.72, 0.28, 1.0))
	var leaf_glow: Color = palette.get("leafGlow", Color(0.75, 0.89, 0.42, 1.0))
	var earth: Color = palette.get("earth", Color(0.48, 0.31, 0.16, 1.0))
	var dust: Color = palette.get("dust", Color(0.78, 0.69, 0.39, 1.0))
	var core: Color = palette.get("core", Color(0.96, 0.91, 0.63, 1.0))
	var ground_center := pos + Vector2(0.0, 3.0 * visual_scale)
	var tangent := outward.rotated(PI * 0.5)
	var burst := clampf(burst_progress, 0.0, 1.0)
	var travel := sqrt(burst)
	for dust_index in range(3):
		var dust_ordinal := float(dust_index) - 1.0
		var dust_center := (
			ground_center
			+ tangent * dust_ordinal * (16.0 + 7.0 * travel) * visual_scale
			+ outward * (7.0 + travel * (18.0 + absf(dust_ordinal) * 6.0)) * visual_scale
		)
		_draw_ellipse_fill(
			host,
			dust_center,
			Vector2(
				(18.0 - absf(dust_ordinal) * 2.0) * visual_scale,
				(5.5 - absf(dust_ordinal) * 0.8) * visual_scale
			),
			outward.angle(),
			_with_alpha(dust, (0.19 - absf(dust_ordinal) * 0.02) * strength)
		)
	var ray_offsets: Array[float] = [-0.72, -0.31, 0.06, 0.45]
	if critical:
		ray_offsets = [-0.98, -0.63, -0.26, 0.08, 0.43, 0.79]
	for ray_index in range(ray_offsets.size()):
		var ray_direction := outward.rotated(ray_offsets[ray_index])
		var ray_length := radius * (
			0.55
			+ 0.36 * travel
			+ 0.06 * float(ray_index % 3)
		)
		var ray_start := center + ray_direction * 4.0 * visual_scale
		var ray_end := center + ray_direction * ray_length
		_draw_tapered_streak(
			host,
			ray_start,
			ray_end,
			(11.0 if critical else 9.0) * visual_scale,
			1.2 * visual_scale,
			_with_alpha(earth, 0.72 * strength)
		)
		_draw_tapered_streak(
			host,
			ray_start + ray_direction * 3.0 * visual_scale,
			ray_end - ray_direction * 2.0 * visual_scale,
			(4.2 if critical else 3.4) * visual_scale,
			0.45 * visual_scale,
			_with_alpha(dust, 0.88 * strength)
		)

	var leaf_count := int(impact.get("leafCount", 5)) + (2 if critical else 0)
	for index in range(leaf_count):
		var centered := (
			float(index) / maxf(1.0, float(leaf_count - 1))
			- 0.5
		)
		var spread := centered * 1.62 + sin(float(index + 1) * 2.13) * 0.10
		var shard_direction := outward.rotated(spread)
		var distance := radius * (
			0.20
			+ travel * (0.46 + 0.07 * float(index % 3))
		)
		var lift := sin(burst * PI) * (5.0 + 2.5 * float(index % 3)) * visual_scale
		var shard_center := center + shard_direction * distance - Vector2(0.0, lift)
		_draw_leaf(
			host,
			shard_center,
			(13.0 + 2.5 * float(index % 2)) * visual_scale,
			(5.5 + 0.8 * float(index % 2)) * visual_scale,
			shard_direction.angle() + burst * (0.5 + 0.12 * float(index % 2)),
			_with_alpha(leaf, 0.86 * strength),
			_with_alpha(leaf_glow, 0.68 * strength)
		)

	var chunk_count := int(impact.get("earthChunkCount", 3))
	for index in range(chunk_count):
		var centered := float(index) - float(chunk_count - 1) * 0.5
		var chunk_direction := outward.rotated(
			centered * 0.22 + sin(float(index + 2) * 1.7) * 0.06
		)
		var chunk_center := (
			ground_center
			+ tangent * centered * 7.0 * visual_scale
			+ chunk_direction * radius * travel * (0.22 + 0.04 * float(index % 3))
			- Vector2(
				0.0,
				sin(burst * PI) * (10.0 + float(index % 2) * 6.0) * visual_scale
			)
		)
		_draw_earth_chunk(
			host,
			chunk_center,
			(7.0 + float(index % 2) * 2.0) * visual_scale,
			chunk_direction.angle() + burst * (0.5 + 0.2 * float(index % 2)),
			_with_alpha(earth, 0.92 * strength),
			_with_alpha(dust, 0.70 * strength)
		)
	_draw_impact_star(
		host,
		center,
		(24.0 if critical else 19.0) * visual_scale * (1.0 - 0.22 * burst),
		(11.0 if critical else 8.0) * visual_scale * (1.0 - 0.18 * burst),
		outward.angle(),
		_with_alpha(dust, (0.72 if critical else 0.58) * strength),
		7 if critical else 6
	)
	_draw_impact_star(
		host,
		center,
		(13.0 if critical else 10.0) * visual_scale * (1.0 - 0.18 * burst),
		(5.0 if critical else 4.0) * visual_scale,
		outward.angle() + 0.18,
		_with_alpha(core, 0.94 * strength),
		6 if critical else 5
	)


static func _draw_leaf_earth_dodge(
	host,
	actor: Dictionary,
	visual_scale: float,
	plan: Dictionary,
	strength: float,
	burst_progress: float
) -> void:
	var palette := plan.get("palette", {}) as Dictionary
	var impact := plan.get("impact", {}) as Dictionary
	var toward_attacker := _direction_toward_attacker(host, actor)
	var outward := -toward_attacker
	var home: Vector2 = host._battle_slot_world_position(str(actor.get("slotId", "")))
	if _draw_leaf_earth_dodge_asset(
		host,
		home,
		visual_scale,
		plan,
		outward,
		strength,
		burst_progress
	):
		return
	var center := _impact_center(host, actor, home, visual_scale)
	center += toward_attacker * 13.0 * visual_scale
	var radius := float(impact.get("radius", 31.0)) * visual_scale
	var leaf: Color = palette.get("leaf", Color(0.50, 0.72, 0.28, 1.0))
	var leaf_glow: Color = palette.get("leafGlow", Color(0.75, 0.89, 0.42, 1.0))
	var earth: Color = palette.get("earth", Color(0.48, 0.31, 0.16, 1.0))
	var burst := clampf(burst_progress, 0.0, 1.0)
	var travel := sqrt(burst)
	var tangent := outward.rotated(PI * 0.5)
	for trail_index in range(3):
		var ordinal := float(trail_index) - 1.0
		var lateral := tangent * ordinal * 7.0 * visual_scale
		var trail_start := center - outward * radius * (0.58 + 0.05 * absf(ordinal)) + lateral
		var trail_end := center + outward * radius * (0.88 + 0.30 * travel) + lateral * 0.28
		_draw_tapered_streak(
			host,
			trail_start,
			trail_end,
			(7.2 - absf(ordinal) * 1.0) * visual_scale,
			0.8 * visual_scale,
			_with_alpha(leaf, (0.54 - absf(ordinal) * 0.07) * strength)
		)
		_draw_tapered_streak(
			host,
			trail_start + outward * 5.0 * visual_scale,
			trail_end,
			(2.5 - absf(ordinal) * 0.3) * visual_scale,
			0.28 * visual_scale,
			_with_alpha(leaf_glow, (0.76 - absf(ordinal) * 0.10) * strength)
		)
	var ground_mark := home + outward * radius * (0.12 + 0.22 * travel) + Vector2(0.0, 2.0 * visual_scale)
	_draw_ellipse_fill(
		host,
		ground_mark,
		Vector2(19.0, 4.8) * visual_scale,
		outward.angle(),
		_with_alpha(earth, 0.16 * strength)
	)
	for index in range(4):
		var shard_direction := outward.rotated(
			(float(index) - 1.5) * 0.26 + sin(float(index + 1) * 1.9) * 0.06
		)
		var shard_distance := radius * (0.24 + travel * (0.40 + 0.07 * float(index)))
		_draw_leaf(
			host,
			center + shard_direction * shard_distance,
			(11.0 + float(index % 2) * 2.0) * visual_scale,
			(4.6 + float(index % 2) * 0.8) * visual_scale,
			shard_direction.angle() + burst * 0.72,
			_with_alpha(leaf, 0.76 * strength),
			_with_alpha(leaf_glow, 0.62 * strength)
		)


static func _draw_leaf_earth_cast_asset(
	host,
	pos: Vector2,
	visual_scale: float,
	plan: Dictionary,
	direction: Vector2,
	convergence: float,
	strength: float
) -> bool:
	var bundle_path := str(plan.get("assetBundlePath", "")).strip_edges()
	if not _asset_bundle_ready(host, bundle_path):
		return false
	var frame_index := BattleSkillFeedbackAssetCatalog.frame_index_for(
		bundle_path,
		"charge",
		convergence
	)
	var texture := BattleSkillFeedbackAssetCatalog.texture_for(
		bundle_path,
		"charge",
		frame_index
	)
	if texture == null:
		return false
	var draw_scale := BattleSkillFeedbackAssetCatalog.draw_scale_for(
		bundle_path,
		"chargeDrawScale",
		0.76
	) * visual_scale
	var anchor := BattleSkillFeedbackAssetCatalog.anchor_for(
		bundle_path,
		"chargeAnchor",
		Vector2(0.5, 0.5)
	)
	var center := (
		pos
		- direction * 35.0 * visual_scale
		+ Vector2(0.0, 2.0 * visual_scale)
	)
	_draw_asset_texture(
		host,
		texture,
		center,
		draw_scale,
		direction.angle(),
		anchor,
		Color(1.0, 1.0, 1.0, clampf(strength, 0.0, 1.0))
	)
	return true


static func _draw_leaf_earth_hit_asset(
	host,
	pos: Vector2,
	visual_scale: float,
	plan: Dictionary,
	toward_attacker: Vector2,
	strength: float,
	burst_progress: float,
	critical: bool
) -> bool:
	var bundle_path := str(plan.get("assetBundlePath", "")).strip_edges()
	if not _asset_bundle_ready(host, bundle_path):
		return false
	var frame_index := BattleSkillFeedbackAssetCatalog.frame_index_for(
		bundle_path,
		"impact",
		burst_progress
	)
	var texture := BattleSkillFeedbackAssetCatalog.texture_for(
		bundle_path,
		"impact",
		frame_index
	)
	if texture == null:
		return false
	var scale_key := "criticalDrawScale" if critical else "impactDrawScale"
	var fallback_scale := 0.94 if critical else 0.78
	var draw_scale := BattleSkillFeedbackAssetCatalog.draw_scale_for(
		bundle_path,
		scale_key,
		fallback_scale
	) * visual_scale
	var anchor := BattleSkillFeedbackAssetCatalog.anchor_for(
		bundle_path,
		"impactAnchor",
		Vector2(0.5, 0.82)
	)
	var center := (
		pos
		+ toward_attacker * 18.0 * visual_scale
		+ Vector2(0.0, 4.0 * visual_scale)
	)
	if critical:
		_draw_asset_texture(
			host,
			texture,
			center,
			draw_scale * 1.10,
			0.0,
			anchor,
			Color(1.0, 0.82, 0.38, clampf(strength * 0.28, 0.0, 1.0))
		)
	_draw_asset_texture(
		host,
		texture,
		center,
		draw_scale,
		0.0,
		anchor,
		Color(1.0, 1.0, 1.0, clampf(strength, 0.0, 1.0))
	)
	return true


static func _draw_leaf_earth_dodge_asset(
	host,
	home: Vector2,
	visual_scale: float,
	plan: Dictionary,
	outward: Vector2,
	strength: float,
	burst_progress: float
) -> bool:
	var bundle_path := str(plan.get("assetBundlePath", "")).strip_edges()
	if not _asset_bundle_ready(host, bundle_path):
		return false
	# Dodge shows the charge wake passing through the now-empty target slot;
	# deliberately do not draw the contact explosion used by hit/critical.
	var sample_progress := 0.58 + 0.38 * clampf(burst_progress, 0.0, 1.0)
	var frame_index := BattleSkillFeedbackAssetCatalog.frame_index_for(
		bundle_path,
		"charge",
		sample_progress
	)
	var texture := BattleSkillFeedbackAssetCatalog.texture_for(
		bundle_path,
		"charge",
		frame_index
	)
	if texture == null:
		return false
	var draw_scale := BattleSkillFeedbackAssetCatalog.draw_scale_for(
		bundle_path,
		"chargeDrawScale",
		0.76
	) * visual_scale * 1.08
	var anchor := BattleSkillFeedbackAssetCatalog.anchor_for(
		bundle_path,
		"chargeAnchor",
		Vector2(0.5, 0.5)
	)
	var center := (
		home
		+ Vector2(0.0, -44.0 * visual_scale)
		+ outward * 10.0 * visual_scale
	)
	_draw_asset_texture(
		host,
		texture,
		center,
		draw_scale,
		outward.angle(),
		anchor,
		Color(1.0, 1.0, 1.0, clampf(strength, 0.0, 1.0))
	)
	return true


static func _asset_bundle_ready(host, bundle_path: String) -> bool:
	return (
		bundle_path != ""
		and bool(host.battle_current_event.get("skillFeedbackAssetReady", false))
	)


static func _draw_asset_texture(
	host,
	texture: Texture2D,
	center: Vector2,
	draw_scale: float,
	rotation: float,
	anchor: Vector2,
	modulate: Color
) -> void:
	var frame_size := texture.get_size() * maxf(draw_scale, 0.01)
	var top_left := Vector2(
		-frame_size.x * anchor.x,
		-frame_size.y * anchor.y
	)
	host.draw_set_transform(center, rotation, Vector2.ONE)
	host.draw_texture_rect(
		texture,
		Rect2(top_left, frame_size),
		false,
		modulate
	)
	host.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


static func _direction_to_current_target(host, actor: Dictionary) -> Vector2:
	var target := BattleModel.actor_by_id(
		host.battle_state,
		str(host.battle_current_event.get("targetId", ""))
	)
	if target.is_empty():
		return Vector2.RIGHT
	var actor_home: Vector2 = host._battle_slot_world_position(str(actor.get("slotId", "")))
	var target_home: Vector2 = host._battle_slot_world_position(str(target.get("slotId", "")))
	var direction: Vector2 = (target_home - actor_home).normalized()
	return direction if direction.length() > 0.001 else Vector2.RIGHT


static func _direction_toward_attacker(host, actor: Dictionary) -> Vector2:
	var attacker := BattleModel.actor_by_id(
		host.battle_state,
		str(host.battle_current_event.get("attackerId", ""))
	)
	if attacker.is_empty():
		return Vector2(-1.0, -0.2).normalized()
	var target_home: Vector2 = host._battle_slot_world_position(str(actor.get("slotId", "")))
	var attacker_home: Vector2 = host._battle_slot_world_position(str(attacker.get("slotId", "")))
	var direction: Vector2 = (attacker_home - target_home).normalized()
	return direction if direction.length() > 0.001 else Vector2(-1.0, -0.2).normalized()


static func _impact_center(
	host,
	actor: Dictionary,
	pos: Vector2,
	visual_scale: float
) -> Vector2:
	var height := 61.0
	if host._battle_actor_uses_integrated_mount_visual(actor):
		height = 92.0
	elif str(actor.get("kind", "")) == "player":
		height = 68.0
	return pos + Vector2(0.0, -height * visual_scale)


static func _draw_ellipse_fill(
	host,
	center: Vector2,
	radius: Vector2,
	rotation: float,
	color: Color,
	segments: int = 20
) -> void:
	var points := PackedVector2Array()
	var count := maxi(8, segments)
	for index in range(count):
		var angle := TAU * float(index) / float(count)
		var local := Vector2(cos(angle) * radius.x, sin(angle) * radius.y)
		points.append(center + local.rotated(rotation))
	host.draw_colored_polygon(points, color)


static func _draw_tapered_streak(
	host,
	start: Vector2,
	finish: Vector2,
	start_width: float,
	finish_width: float,
	color: Color
) -> void:
	var offset := finish - start
	if offset.length_squared() <= 0.001:
		return
	var direction := offset.normalized()
	var side := direction.rotated(PI * 0.5)
	var start_half := maxf(0.2, start_width * 0.5)
	var finish_half := maxf(0.1, finish_width * 0.5)
	var points := PackedVector2Array([
		start + side * start_half,
		finish + side * finish_half,
		finish - side * finish_half,
		start - side * start_half,
	])
	host.draw_colored_polygon(points, color)


static func _draw_impact_star(
	host,
	center: Vector2,
	outer_radius: float,
	inner_radius: float,
	rotation: float,
	color: Color,
	point_count: int
) -> void:
	var spikes := maxi(4, point_count)
	var points := PackedVector2Array()
	for index in range(spikes * 2):
		var is_outer := index % 2 == 0
		var radius := outer_radius if is_outer else inner_radius
		var wobble := 1.0 + 0.07 * sin(float(index + 1) * 2.17)
		var angle := rotation + TAU * float(index) / float(spikes * 2)
		points.append(center + Vector2.RIGHT.rotated(angle) * radius * wobble)
	host.draw_colored_polygon(points, color)


static func _draw_leaf(
	host,
	center: Vector2,
	length: float,
	width: float,
	rotation: float,
	fill: Color,
	vein: Color
) -> void:
	var forward := Vector2.RIGHT.rotated(rotation)
	var side := forward.rotated(PI * 0.5)
	var points := PackedVector2Array([
		center + forward * length * 0.52,
		center + side * width * 0.50,
		center - forward * length * 0.48,
		center - side * width * 0.50,
	])
	host.draw_colored_polygon(points, fill)
	var outline := PackedVector2Array(points)
	outline.append(points[0])
	host.draw_polyline(
		outline,
		vein,
		maxf(0.8, width * 0.16),
		true
	)
	host.draw_line(
		center - forward * length * 0.34,
		center + forward * length * 0.34,
		vein,
		maxf(0.8, width * 0.14),
		true
	)


static func _draw_earth_chunk(
	host,
	center: Vector2,
	size: float,
	rotation: float,
	fill: Color,
	edge: Color
) -> void:
	var points := PackedVector2Array([
		Vector2(-0.72, 0.18),
		Vector2(-0.18, -0.72),
		Vector2(0.70, -0.30),
		Vector2(0.54, 0.64),
	])
	for index in range(points.size()):
		points[index] = center + (points[index] * size).rotated(rotation)
	host.draw_colored_polygon(points, fill)
	var outline := PackedVector2Array(points)
	outline.append(points[0])
	host.draw_polyline(outline, edge, maxf(0.8, size * 0.16), true)


static func _with_alpha(color: Color, alpha: float) -> Color:
	return Color(color.r, color.g, color.b, clampf(color.a * alpha, 0.0, 1.0))
