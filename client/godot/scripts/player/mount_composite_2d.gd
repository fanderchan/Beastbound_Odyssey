extends Node2D

const CharacterActionAssetCatalog := preload("res://scripts/player/character_action_asset_catalog.gd")
const MountVisualProfileCatalog := preload("res://scripts/player/mount_visual_profile_catalog.gd")
const PetActionAssetCatalog := preload("res://scripts/pet/pet_action_asset_catalog.gd")

var form_id: String = ""
var facing_key: String = "south"
var action: String = "idle"
var animation_time: float = 0.0
var presentation_scale: float = 1.0


func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	visible = false


func set_mount_form(next_form_id: String) -> bool:
	var normalized := next_form_id.strip_edges()
	var supported := (
		MountVisualProfileCatalog.supports_form(normalized)
		and PetActionAssetCatalog.warm_world_form(normalized)
		and CharacterActionAssetCatalog.warm()
	)
	form_id = normalized if supported else ""
	visible = supported
	queue_redraw()
	return supported


func set_visual_state(next_facing: String, next_action: String, elapsed_seconds: float) -> void:
	facing_key = next_facing.strip_edges().to_lower()
	action = "walk" if next_action == "walk" else "idle"
	animation_time = maxf(0.0, elapsed_seconds)
	queue_redraw()


func set_presentation_scale(value: float) -> void:
	presentation_scale = clampf(value, 0.1, 3.0)
	queue_redraw()


func _draw() -> void:
	if form_id == "":
		return
	var view := PetActionAssetCatalog.world_view_for_direction(facing_key)
	var flip_h := PetActionAssetCatalog.world_flip_h_for_direction(facing_key)
	var frame_index := CharacterActionAssetCatalog.frame_index_for_elapsed(action, animation_time)
	var mount_texture := PetActionAssetCatalog.texture_for_elapsed(form_id, view, action, animation_time)
	var rider_action := MountVisualProfileCatalog.rider_action_for(action)
	var rider_texture := CharacterActionAssetCatalog.texture_for_frame(view, rider_action, frame_index + 1)
	var plan := MountVisualProfileCatalog.composition_plan(form_id, view, action, frame_index)
	if mount_texture == null or rider_texture == null or plan.is_empty():
		return
	var scale_factor := presentation_scale
	var mount_scale := float(plan.get("mountScale", 1.0)) * scale_factor
	var rider_scale := float(plan.get("riderScale", 1.0)) * scale_factor
	var ground_anchor_y := float(plan.get("groundAnchorY", 224.0))
	var mount_rect := Rect2(
		Vector2(-128.0 * mount_scale, -ground_anchor_y * mount_scale),
		Vector2(256.0, 256.0) * mount_scale
	)
	var seat_anchor := plan.get("seatAnchor", Vector2(128, 110)) as Vector2
	var rider_anchor := plan.get("riderAnchor", Vector2(128, 150)) as Vector2
	var seat_position := mount_rect.position + seat_anchor * mount_scale
	var rider_rect := Rect2(
		seat_position - rider_anchor * rider_scale,
		Vector2(256.0, 256.0) * rider_scale
	)
	var horizontal_scale := -1.0 if flip_h else 1.0
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(horizontal_scale, 1.0))
	_draw_shadow(plan.get("shadow", {}) as Dictionary, scale_factor)
	draw_texture_rect(mount_texture, mount_rect, false)
	draw_texture_rect(rider_texture, rider_rect, false)
	var occluder_regions = plan.get("frontOccluderRegions", [])
	for source_region_value in occluder_regions as Array:
		var source_region := source_region_value as Rect2
		var destination_region := Rect2(
			mount_rect.position + source_region.position * mount_scale,
			source_region.size * mount_scale
		)
		draw_texture_rect_region(mount_texture, destination_region, source_region)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _draw_shadow(config: Dictionary, scale_factor: float) -> void:
	var offset := _vector2(config.get("offset", [0, 4])) * scale_factor
	var size := _vector2(config.get("size", [180, 32])) * scale_factor
	var alpha := clampf(float(config.get("alpha", 0.25)), 0.0, 0.6)
	var points := PackedVector2Array()
	for index in range(24):
		var angle := TAU * float(index) / 24.0
		points.append(offset + Vector2(cos(angle) * size.x * 0.5, sin(angle) * size.y * 0.5))
	draw_polygon(points, PackedColorArray([Color(0.02, 0.04, 0.035, alpha)]))


func _vector2(value) -> Vector2:
	if value is Vector2:
		return value as Vector2
	if value is Array and (value as Array).size() == 2:
		return Vector2(float((value as Array)[0]), float((value as Array)[1]))
	return Vector2.ZERO
