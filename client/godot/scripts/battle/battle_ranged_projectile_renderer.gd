extends RefCounted

const BattleModel := preload("res://scripts/battle/battle_model.gd")
const BattleRangedProjectileAssetCatalog := preload(
	"res://scripts/battle/battle_ranged_projectile_asset_catalog.gd"
)
const BattleRangedProjectilePresentationModel := preload(
	"res://scripts/battle/battle_ranged_projectile_presentation_model.gd"
)
const MountedBattlePresentationModel := preload(
	"res://scripts/battle/mounted_battle_presentation_model.gd"
)
const MountVisualProfileCatalog := preload(
	"res://scripts/player/mount_visual_profile_catalog.gd"
)
const PetActionAssetCatalog := preload(
	"res://scripts/pet/pet_action_asset_catalog.gd"
)


static func is_current_attacker(host, actor_id: String) -> bool:
	return (
		actor_id != ""
		and host._battle_ranged_projectile_enabled(
			host.battle_current_event
		)
		and actor_id
		== str(host.battle_current_event.get("attackerId", ""))
	)


static func draw_bow_overlay(
	host,
	actor: Dictionary,
	pos: Vector2,
	visual_scale: float,
	alpha: float
) -> void:
	var actor_id := str(actor.get("id", ""))
	if not is_current_attacker(host, actor_id):
		return
	var frame_index := (
		BattleRangedProjectilePresentationModel.bow_frame_index(
			host._battle_current_event_progress()
		)
	)
	if frame_index < 0:
		return
	var texture := BattleRangedProjectileAssetCatalog.texture_for_frame(
		BattleRangedProjectileAssetCatalog.ACTION_BOW_DRAW,
		frame_index
	)
	if texture == null:
		return
	var center := _bow_center(host, actor, pos, visual_scale)
	var direction := _average_target_direction(
		host,
		center,
		visual_scale
	)
	var orientation := (
		BattleRangedProjectilePresentationModel.draw_orientation(direction)
	)
	var effect_scale := _actor_effect_scale(
		host,
		actor,
		visual_scale
	)
	var size := 126.0 * effect_scale
	host.draw_set_transform(
		center,
		float(orientation.get("rotation", 0.0)),
		Vector2(
			-1.0 if bool(orientation.get("flipX", false)) else 1.0,
			1.0
		)
	)
	host.draw_texture_rect(
		texture,
		Rect2(
			Vector2(-size * 0.5, -size * 0.5),
			Vector2(size, size)
		),
		false,
		Color(1.0, 1.0, 1.0, alpha)
	)
	host.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


static func draw_projectiles(host) -> void:
	if (
		not host._battle_ranged_projectile_enabled(
			host.battle_current_event
		)
		or not BattleRangedProjectileAssetCatalog.is_warmed()
	):
		return
	var attacker_id := str(
		host.battle_current_event.get("attackerId", "")
	)
	var attacker := BattleModel.actor_by_id(
		host.battle_state,
		attacker_id
	)
	if attacker.is_empty():
		return
	var visual_scale: float = host._battle_actor_visual_scale()
	var attacker_pos: Vector2 = host._battle_slot_world_position(
		str(attacker.get("slotId", ""))
	)
	attacker_pos += host._battle_actor_counter_anchor_offset(
		attacker,
		attacker_pos,
		visual_scale
	)
	var start := _shot_origin(
		host,
		attacker,
		attacker_pos,
		visual_scale
	)
	var progress: float = host._battle_current_event_progress()
	var target_ids := _current_event_target_ids(host)
	var dodge_map := (
		host.battle_current_event.get(
			"dodgePerTarget",
			{}
		) as Dictionary
		if host.battle_current_event.get(
			"dodgePerTarget",
			{}
		) is Dictionary
		else {}
	)
	for target_ordinal in range(target_ids.size()):
		var target_id := target_ids[target_ordinal]
		var target := BattleModel.actor_by_id(
			host.battle_state,
			target_id
		)
		if target.is_empty():
			continue
		var dodged := bool(
			dodge_map.get(
				target_id,
				bool(
					host.battle_current_event.get(
						"dodged",
						false
					)
				)
				if target_ordinal == 0
				else false
			)
		)
		var aim := _actor_aim_position(
			host,
			target,
			visual_scale
		)
		var target_ground: Vector2 = host._battle_slot_world_position(
			str(target.get("slotId", ""))
		)
		var miss_ground := (
			BattleRangedProjectilePresentationModel.miss_ground_position(
				start,
				target_ground,
				target_ordinal,
				visual_scale
			)
		)
		if BattleRangedProjectilePresentationModel.projectile_visible(
			progress
		):
			_draw_arrow_in_flight(
				host,
				start,
				aim,
				miss_ground,
				dodged,
				progress,
				visual_scale
			)
			continue
		if dodged:
			_draw_ground_arrow(
				host,
				miss_ground,
				progress,
				visual_scale
			)
		else:
			_draw_hit_effect(
				host,
				aim,
				progress,
				visual_scale
			)


static func _current_event_target_ids(host) -> Array[String]:
	var target_ids: Array[String] = []
	if host.battle_current_event.is_empty():
		return target_ids
	for value in host.battle_current_event.get("targetIds", []):
		var target_id := str(value).strip_edges()
		if target_id != "" and not target_ids.has(target_id):
			target_ids.append(target_id)
	var primary_target_id := str(
		host.battle_current_event.get("targetId", "")
	).strip_edges()
	if (
		primary_target_id != ""
		and not target_ids.has(primary_target_id)
	):
		target_ids.append(primary_target_id)
	return target_ids


static func _actor_effect_scale(
	host,
	actor: Dictionary,
	visual_scale: float
) -> float:
	if (
		bool(host.battle_state.get("reviewLab", false))
		and host._battle_actor_uses_integrated_mount_visual(actor)
	):
		var form_id := str(
			actor.get("ridePetFormId", "")
		).strip_edges()
		var character_id := (
			MountVisualProfileCatalog.character_id_for_form(form_id)
		)
		return (
			visual_scale
			* MountedBattlePresentationModel.scale_multiplier_for(
				character_id,
				form_id
			)
		)
	return visual_scale


static func _actor_aim_position(
	host,
	actor: Dictionary,
	visual_scale: float
) -> Vector2:
	var ground: Vector2 = host._battle_slot_world_position(
		str(actor.get("slotId", ""))
	)
	var kind := str(actor.get("kind", ""))
	var height := 38.0
	if host._battle_actor_uses_integrated_mount_visual(actor):
		height = 96.0
	elif (
		["pet", "wild_pet"].has(kind)
		and PetActionAssetCatalog.supports_form(
			str(
				actor.get(
					"formId",
					actor.get("templateId", "")
				)
			)
		)
	):
		height = 64.0
	elif kind == "pet" or kind == "wild_pet":
		height = 30.0
	return (
		ground
		+ Vector2(
			0.0,
			-height * _actor_effect_scale(
				host,
				actor,
				visual_scale
			)
		)
	)


static func _average_target_direction(
	host,
	origin: Vector2,
	visual_scale: float
) -> Vector2:
	var target_center := Vector2.ZERO
	var target_count := 0
	for target_id in _current_event_target_ids(host):
		var target := BattleModel.actor_by_id(
			host.battle_state,
			target_id
		)
		if target.is_empty():
			continue
		target_center += _actor_aim_position(
			host,
			target,
			visual_scale
		)
		target_count += 1
	if target_count <= 0:
		return Vector2.RIGHT
	var direction := (
		target_center / float(target_count) - origin
	).normalized()
	return direction if direction.length() > 0.001 else Vector2.RIGHT


static func _bow_center(
	host,
	actor: Dictionary,
	pos: Vector2,
	visual_scale: float
) -> Vector2:
	var effect_scale := _actor_effect_scale(
		host,
		actor,
		visual_scale
	)
	var height := (
		96.0
		if host._battle_actor_uses_integrated_mount_visual(actor)
		else (
			56.0
			if ["pet", "wild_pet"].has(str(actor.get("kind", "")))
			else 39.0
		)
	)
	var base := pos + Vector2(0.0, -height * effect_scale)
	var direction := _average_target_direction(
		host,
		base,
		visual_scale
	)
	return base + direction * 10.0 * effect_scale


static func _shot_origin(
	host,
	attacker: Dictionary,
	attacker_pos: Vector2,
	visual_scale: float
) -> Vector2:
	var bow_center := _bow_center(
		host,
		attacker,
		attacker_pos,
		visual_scale
	)
	var direction := _average_target_direction(
		host,
		bow_center,
		visual_scale
	)
	return (
		bow_center
		+ direction
		* 46.0
		* _actor_effect_scale(
			host,
			attacker,
			visual_scale
		)
	)


static func _draw_arrow_in_flight(
	host,
	start: Vector2,
	aim: Vector2,
	miss_ground: Vector2,
	dodged: bool,
	event_progress: float,
	visual_scale: float
) -> void:
	var frame_index := (
		BattleRangedProjectilePresentationModel.projectile_frame_index(
			event_progress
		)
	)
	var texture := BattleRangedProjectileAssetCatalog.texture_for_frame(
		BattleRangedProjectileAssetCatalog.ACTION_ARROW_FLIGHT,
		frame_index
	)
	if texture == null:
		return
	var flight_progress := (
		BattleRangedProjectilePresentationModel.projectile_flight_progress(
			event_progress
		)
	)
	var size := 104.0 * visual_scale
	for ghost_index in range(2, 0, -1):
		var ghost_progress := maxf(
			0.0,
			flight_progress - 0.055 * float(ghost_index)
		)
		var ghost_position := (
			BattleRangedProjectilePresentationModel.flight_position(
				start,
				aim,
				miss_ground,
				ghost_progress,
				dodged
			)
		)
		var ghost_direction := (
			BattleRangedProjectilePresentationModel.flight_direction(
				start,
				aim,
				miss_ground,
				ghost_progress,
				dodged
			)
		)
		_draw_oriented_texture(
			host,
			texture,
			ghost_position,
			ghost_direction,
			size,
			0.07 + 0.06 * float(2 - ghost_index)
		)
	var position := (
		BattleRangedProjectilePresentationModel.flight_position(
			start,
			aim,
			miss_ground,
			flight_progress,
			dodged
		)
	)
	var direction := (
		BattleRangedProjectilePresentationModel.flight_direction(
			start,
			aim,
			miss_ground,
			flight_progress,
			dodged
		)
	)
	_draw_oriented_texture(
		host,
		texture,
		position,
		direction,
		size,
		1.0
	)


static func _draw_oriented_texture(
	host,
	texture: Texture2D,
	position: Vector2,
	direction: Vector2,
	size: float,
	alpha: float
) -> void:
	var orientation := (
		BattleRangedProjectilePresentationModel.draw_orientation(direction)
	)
	host.draw_set_transform(
		position,
		float(orientation.get("rotation", 0.0)),
		Vector2(
			-1.0 if bool(orientation.get("flipX", false)) else 1.0,
			1.0
		)
	)
	host.draw_texture_rect(
		texture,
		Rect2(
			Vector2(-size * 0.5, -size * 0.5),
			Vector2(size, size)
		),
		false,
		Color(1.0, 1.0, 1.0, alpha)
	)
	host.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


static func _draw_hit_effect(
	host,
	aim: Vector2,
	event_progress: float,
	visual_scale: float
) -> void:
	var frame_index := (
		BattleRangedProjectilePresentationModel.hit_frame_index(
			event_progress
		)
	)
	if frame_index < 0:
		return
	var texture := BattleRangedProjectileAssetCatalog.texture_for_frame(
		BattleRangedProjectileAssetCatalog.ACTION_ARROW_HIT,
		frame_index
	)
	if texture == null:
		return
	var size := 100.0 * visual_scale
	host.draw_texture_rect(
		texture,
		Rect2(
			aim - Vector2(size, size) * 0.5,
			Vector2(size, size)
		),
		false
	)


static func _draw_ground_arrow(
	host,
	ground: Vector2,
	event_progress: float,
	visual_scale: float
) -> void:
	var frame_index := (
		BattleRangedProjectilePresentationModel.ground_frame_index(
			event_progress
		)
	)
	if frame_index < 0:
		return
	var texture := BattleRangedProjectileAssetCatalog.texture_for_frame(
		BattleRangedProjectileAssetCatalog.ACTION_ARROW_GROUND,
		frame_index
	)
	if texture == null:
		return
	var size := 92.0 * visual_scale
	host.draw_texture_rect(
		texture,
		Rect2(
			ground + Vector2(-size * 0.5, -size),
			Vector2(size, size)
		),
		false
	)
