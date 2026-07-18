extends Node2D

const MountedCharacterAssetCatalog := preload("res://scripts/player/mounted_character_asset_catalog.gd")
const MountVisualProfileCatalog := preload("res://scripts/player/mount_visual_profile_catalog.gd")

var form_id: String = ""
var character_id: String = MountedCharacterAssetCatalog.DEFAULT_CHARACTER_ID
var facing_key: String = "south"
var action: String = "idle"
var animation_time: float = 0.0
var presentation_scale: float = 1.0
var shadow_config: Dictionary = {}


func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	visible = false


func set_mount_form(next_form_id: String) -> bool:
	var normalized := next_form_id.strip_edges()
	var next_character_id := MountVisualProfileCatalog.character_id_for_form(normalized)
	var supported := MountVisualProfileCatalog.supports_form(normalized) and MountedCharacterAssetCatalog.warm_world_bundle(next_character_id, normalized)
	form_id = normalized if supported else ""
	character_id = next_character_id if supported else MountedCharacterAssetCatalog.DEFAULT_CHARACTER_ID
	shadow_config = MountVisualProfileCatalog.shadow_for_form(normalized) if supported else {}
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
	var texture := MountedCharacterAssetCatalog.world_texture_for_elapsed(
		character_id,
		form_id,
		facing_key,
		action,
		animation_time
	)
	if texture == null:
		return
	var ground_anchor_y := MountedCharacterAssetCatalog.world_ground_anchor_y(character_id, form_id)
	var texture_rect := Rect2(
		Vector2(-128.0 * presentation_scale, -ground_anchor_y * presentation_scale),
		Vector2(256.0, 256.0) * presentation_scale
	)
	_draw_shadow(shadow_config, presentation_scale)
	draw_texture_rect(texture, texture_rect, false)


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
