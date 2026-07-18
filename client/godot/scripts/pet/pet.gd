extends Node2D

const PetActionAssetCatalog := preload("res://scripts/pet/pet_action_asset_catalog.gd")

@export var follow_speed: float = 170.0
@export var speed_multiplier: float = 1.0

const FACING_KEYS := [
	"east",
	"southeast",
	"south",
	"southwest",
	"west",
	"northwest",
	"north",
	"northeast",
]

@onready var body: Polygon2D = $Body
@onready var facing_mark: Polygon2D = $FacingMark
@onready var left_foot: Polygon2D = $LeftFoot
@onready var right_foot: Polygon2D = $RightFoot
@onready var formal_sprite: Sprite2D = $FormalSprite

const IDLE_ANIMATION_STEP_SECONDS := 0.125

var follow_target: Vector2 = Vector2.ZERO
var has_follow_target: bool = false
var facing_key: String = "south"
var animation_state: String = "idle"
var animation_time: float = 0.0
var animation_visual_elapsed: float = IDLE_ANIMATION_STEP_SECONDS
var last_body_color: Color = Color.TRANSPARENT
var last_body_position := Vector2(INF, INF)
var last_body_scale := Vector2(INF, INF)
var last_left_foot_visible: bool = false
var last_right_foot_visible: bool = false
var current_form_id: String = ""
var formal_asset_enabled: bool = false
var last_formal_texture: Texture2D
var last_formal_flip_h: bool = false


func _ready() -> void:
	follow_target = global_position
	face_direction(Vector2.DOWN)
	_set_animation_state("idle")


func _process(delta: float) -> void:
	var animation_delta := delta * _effective_speed_multiplier() if animation_state == "walk" else delta
	animation_time += animation_delta
	var was_moving := animation_state == "walk"
	var direction := Vector2.ZERO
	if has_follow_target:
		var to_target := follow_target - global_position
		if to_target.length() > 5.0:
			direction = to_target.normalized()
			global_position += direction * minf(follow_speed * delta * _effective_speed_multiplier(), to_target.length())
			face_direction(direction)
			_set_animation_state("walk")
		else:
			_set_animation_state("idle")
	else:
		_set_animation_state("idle")
	animation_visual_elapsed += animation_delta
	if formal_asset_enabled:
		var frame_step := 1.0 / maxf(1.0, PetActionAssetCatalog.action_fps(animation_state))
		if animation_visual_elapsed < frame_step:
			return
		animation_visual_elapsed = fmod(animation_visual_elapsed, frame_step)
		_update_formal_animation()
		return
	if animation_state == "idle" and not was_moving and animation_visual_elapsed < IDLE_ANIMATION_STEP_SECONDS:
		return
	animation_visual_elapsed = 0.0
	_update_placeholder_animation()


func set_speed_multiplier(value: float) -> void:
	speed_multiplier = clampf(value, 1.0, 10.0)


func get_speed_multiplier() -> float:
	return _effective_speed_multiplier()


func _effective_speed_multiplier() -> float:
	return clampf(speed_multiplier, 1.0, 10.0)


func set_follow_target(target: Vector2) -> void:
	follow_target = target
	has_follow_target = true


func clear_follow_target() -> void:
	has_follow_target = false
	_set_animation_state("idle")


func set_pet_form(form_id: String) -> void:
	current_form_id = form_id.strip_edges()
	formal_asset_enabled = PetActionAssetCatalog.warm_world_form(current_form_id)
	_set_placeholder_visible(not formal_asset_enabled)
	if formal_sprite != null:
		formal_sprite.visible = formal_asset_enabled
	last_formal_texture = null
	last_formal_flip_h = not PetActionAssetCatalog.world_flip_h_for_direction(facing_key)
	_update_formal_animation()


func face_direction(direction: Vector2) -> void:
	if direction.length() <= 0.001:
		return
	var index := _facing_index_for_direction(direction)
	facing_key = str(FACING_KEYS[index])
	if facing_mark != null:
		facing_mark.rotation = float(index) * PI / 4.0 + PI / 2.0
	if formal_asset_enabled:
		_update_formal_animation()


func get_facing_key() -> String:
	return facing_key


func get_animation_state() -> String:
	return animation_state


func is_moving() -> bool:
	return animation_state == "walk"


func get_animation_clip_key() -> String:
	return "%s_%s" % [animation_state, facing_key]


func _facing_index_for_direction(direction: Vector2) -> int:
	var normalized_angle := direction.angle()
	var index := int(roundf(normalized_angle / (PI / 4.0))) % 8
	if index < 0:
		index += 8
	return index


func _set_animation_state(next_state: String) -> void:
	if animation_state == next_state:
		return
	animation_state = next_state
	animation_time = 0.0
	animation_visual_elapsed = IDLE_ANIMATION_STEP_SECONDS


func _update_placeholder_animation() -> void:
	if body == null:
		return
	if animation_state == "walk":
		var bob := sin(animation_time * 11.0)
		_set_body_transform(Vector2(0.0, -1.5 + bob * 1.5), Vector2.ONE)
		_set_body_color(Color(0.42, 0.78, 0.43, 1.0))
		_set_foot_visible(true, bob >= 0.0)
	else:
		var breathe := 1.0 + sin(animation_time * 3.2) * 0.035
		_set_body_transform(Vector2.ZERO, Vector2(1.0, breathe))
		_set_body_color(Color(0.30, 0.68, 0.36, 1.0))
		_set_foot_visible(false, false)


func _update_formal_animation() -> void:
	if not formal_asset_enabled or formal_sprite == null:
		return
	var view := PetActionAssetCatalog.world_view_for_direction(facing_key)
	var texture := PetActionAssetCatalog.texture_for_elapsed(current_form_id, view, animation_state, animation_time)
	if texture != null and texture != last_formal_texture:
		formal_sprite.texture = texture
		last_formal_texture = texture
	var flip_h := PetActionAssetCatalog.world_flip_h_for_direction(facing_key)
	if flip_h != last_formal_flip_h:
		formal_sprite.flip_h = flip_h
		last_formal_flip_h = flip_h


func _set_placeholder_visible(value: bool) -> void:
	if body != null:
		body.visible = value
	if facing_mark != null:
		facing_mark.visible = value
	if left_foot != null:
		left_foot.visible = value and last_left_foot_visible
	if right_foot != null:
		right_foot.visible = value and last_right_foot_visible


func _set_body_transform(next_position: Vector2, next_scale: Vector2) -> void:
	if body == null:
		return
	if last_body_position.distance_to(next_position) > 0.001:
		body.position = next_position
		last_body_position = next_position
	if last_body_scale.distance_to(next_scale) > 0.001:
		body.scale = next_scale
		last_body_scale = next_scale


func _set_body_color(next_color: Color) -> void:
	if body != null and last_body_color != next_color:
		body.color = next_color
		last_body_color = next_color


func _set_foot_visible(show_feet: bool, left_step: bool) -> void:
	var next_left := show_feet and left_step
	var next_right := show_feet and not left_step
	if left_foot != null:
		if last_left_foot_visible != next_left:
			left_foot.visible = next_left
			last_left_foot_visible = next_left
	if right_foot != null:
		if last_right_foot_visible != next_right:
			right_foot.visible = next_right
			last_right_foot_visible = next_right
