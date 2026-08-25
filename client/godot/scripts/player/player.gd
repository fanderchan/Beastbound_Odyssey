extends CharacterBody2D

const CharacterActionAssetCatalog := preload("res://scripts/player/character_action_asset_catalog.gd")
const MountedCharacterAssetCatalog := preload("res://scripts/player/mounted_character_asset_catalog.gd")
const MountVisualProfileCatalog := preload("res://scripts/player/mount_visual_profile_catalog.gd")
const WorldVisualGrade := preload("res://scripts/world/world_visual_grade.gd")

@export var walk_speed: float = 160.0
@export var sprint_speed: float = 260.0
@export var click_move_speed: float = 190.0
@export var world_margin: float = 32.0
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

@onready var facing_mark: Polygon2D = $FacingMark
@onready var body: Polygon2D = $Body
@onready var left_foot: Polygon2D = $LeftFoot
@onready var right_foot: Polygon2D = $RightFoot
@onready var shadow: Polygon2D = $Shadow
@onready var formal_sprite: Sprite2D = $FormalSprite
@onready var mounted_character: Node2D = $MountedCharacter

const IDLE_ANIMATION_STEP_SECONDS := 0.125
const AUTO_MOVE_ARRIVE_DISTANCE := 4.0

var move_target: Vector2 = Vector2.ZERO
var has_move_target: bool = false
var path_points: Array[Vector2] = []
var movement_bounds: Rect2 = Rect2(Vector2.ZERO, Vector2(1280, 720))
var facing_key: String = "south"
var animation_state: String = "idle"
var animation_time: float = 0.0
var animation_visual_elapsed: float = IDLE_ANIMATION_STEP_SECONDS
var controls_enabled: bool = true
var keyboard_movement_enabled: bool = true
var last_body_color: Color = Color.TRANSPARENT
var last_body_position := Vector2(INF, INF)
var last_body_scale := Vector2(INF, INF)
var last_left_foot_visible: bool = false
var last_right_foot_visible: bool = false
var formal_asset_enabled: bool = false
var appearance_id: String = CharacterActionAssetCatalog.CHARACTER_ID
var riding_form_id: String = ""
var last_formal_texture: Texture2D
var last_formal_flip_h: bool = false
var visual_source_bounds_cache: Dictionary = {}
var world_visual_grade_signature: String = "disabled"


func _ready() -> void:
	formal_asset_enabled = CharacterActionAssetCatalog.warm_world(appearance_id)
	face_direction(Vector2.DOWN)
	_set_animation_state("idle")
	_set_placeholder_visible(not formal_asset_enabled)
	if formal_sprite != null:
		formal_sprite.visible = formal_asset_enabled
	_update_formal_animation()


func _process(delta: float) -> void:
	var animation_delta := delta * _effective_speed_multiplier() if animation_state == "walk" else delta
	animation_time += animation_delta
	animation_visual_elapsed += animation_delta
	if formal_asset_enabled:
		var animation_fps := (
			MountedCharacterAssetCatalog.world_action_fps(animation_state)
			if riding_form_id != ""
			else CharacterActionAssetCatalog.world_action_fps(animation_state, appearance_id)
		)
		var frame_step := 1.0 / maxf(1.0, animation_fps)
		if animation_visual_elapsed < frame_step:
			return
		animation_visual_elapsed = fmod(animation_visual_elapsed, frame_step)
		_update_formal_animation()
		return
	if animation_state == "idle" and animation_visual_elapsed < IDLE_ANIMATION_STEP_SECONDS:
		return
	animation_visual_elapsed = 0.0
	_update_placeholder_animation()


func set_move_target(target: Vector2) -> void:
	set_path([target])


func set_path(points: Array[Vector2]) -> void:
	path_points.clear()
	for point in points:
		path_points.append(_clamp_point_to_bounds(point))
	has_move_target = not path_points.is_empty()
	if has_move_target:
		move_target = path_points[0]


func clear_move_target() -> void:
	has_move_target = false
	path_points.clear()
	velocity = Vector2.ZERO


func get_move_target() -> Vector2:
	return move_target


func is_auto_moving() -> bool:
	return has_move_target and not path_points.is_empty()


func set_movement_bounds(bounds: Rect2) -> void:
	movement_bounds = bounds
	if has_move_target:
		for index in range(path_points.size()):
			path_points[index] = _clamp_point_to_bounds(path_points[index])
			move_target = _clamp_point_to_bounds(move_target)


func set_controls_enabled(enabled: bool) -> void:
	controls_enabled = enabled
	if not enabled:
		clear_move_target()
		_set_animation_state("idle")


func set_keyboard_movement_enabled(enabled: bool) -> void:
	keyboard_movement_enabled = enabled


func _physics_process(delta: float) -> void:
	if not controls_enabled:
		velocity = Vector2.ZERO
		_set_animation_state("idle")
		return
	var keyboard_direction := Vector2.ZERO
	if _can_read_keyboard_movement():
		keyboard_direction = Input.get_vector("move_left", "move_right", "move_up", "move_down")
	# Keyboard movement is a developer fallback; the player-facing control is click/tap auto-move.
	if keyboard_direction.length() > 0.0:
		has_move_target = false
		var keyboard_speed := sprint_speed if Input.is_action_pressed("sprint") else walk_speed
		var direction := keyboard_direction.normalized()
		face_direction(direction)
		_set_animation_state("walk")
		velocity = direction * keyboard_speed * _effective_speed_multiplier()
		move_and_slide()
		_clamp_to_bounds()
		return

	if has_move_target:
		var movement_delta := _advance_auto_path(click_move_speed * _effective_speed_multiplier() * delta)
		if movement_delta.length() > 0.001:
			face_direction(movement_delta.normalized())
			_set_animation_state("walk")
			velocity = movement_delta / maxf(delta, 0.0001)
		else:
			velocity = Vector2.ZERO
			_set_animation_state("idle")
		_clamp_to_bounds()
		return

	velocity = Vector2.ZERO
	_set_animation_state("idle")
	_clamp_to_bounds()


func _can_read_keyboard_movement() -> bool:
	if not keyboard_movement_enabled:
		return false
	var focus_owner := get_viewport().gui_get_focus_owner()
	if focus_owner is Control and not (focus_owner as Control).is_visible_in_tree():
		return true
	return not (focus_owner is LineEdit or focus_owner is TextEdit)


func _advance_auto_path(distance_budget: float) -> Vector2:
	var start_position := global_position
	var budget := maxf(0.0, distance_budget)
	while has_move_target and budget > 0.0:
		if path_points.is_empty():
			has_move_target = false
			break
		move_target = path_points[0]
		var to_target := move_target - global_position
		var distance := to_target.length()
		if distance <= AUTO_MOVE_ARRIVE_DISTANCE:
			global_position = move_target
			path_points.pop_front()
			if path_points.is_empty():
				has_move_target = false
				break
			continue
		if budget >= distance:
			global_position = move_target
			budget -= distance
			path_points.pop_front()
			if path_points.is_empty():
				has_move_target = false
				break
			continue
		global_position += to_target / distance * budget
		budget = 0.0
	if has_move_target and not path_points.is_empty():
		move_target = path_points[0]
	return global_position - start_position


func set_speed_multiplier(value: float) -> void:
	speed_multiplier = clampf(value, 1.0, 10.0)


func get_speed_multiplier() -> float:
	return _effective_speed_multiplier()


func _effective_speed_multiplier() -> float:
	return clampf(speed_multiplier, 1.0, 10.0)


func _clamp_to_bounds() -> void:
	global_position = _clamp_point_to_bounds(global_position)


func _clamp_point_to_bounds(point: Vector2) -> Vector2:
	var min_pos := movement_bounds.position + Vector2(world_margin, world_margin)
	var max_pos := movement_bounds.position + movement_bounds.size - Vector2(world_margin, world_margin)
	return Vector2(
		clampf(point.x, min_pos.x, max_pos.x),
		clampf(point.y, min_pos.y, max_pos.y)
	)


func is_moving() -> bool:
	return velocity.length() > 1.0


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


func get_animation_clip_key() -> String:
	return "%s_%s" % [animation_state, facing_key]


func set_appearance_id(value: String) -> bool:
	var normalized := CharacterActionAssetCatalog.resolve_appearance_id(value)
	var changed := normalized != appearance_id
	appearance_id = normalized
	formal_asset_enabled = CharacterActionAssetCatalog.warm_world(appearance_id)
	if changed:
		last_formal_texture = null
		if formal_sprite != null:
			formal_sprite.texture = null
	if riding_form_id != "":
		var required_character_id := MountVisualProfileCatalog.character_id_for_form(riding_form_id)
		if not CharacterActionAssetCatalog.appearance_supports_mounted_character(
			appearance_id,
			required_character_id
		):
			set_riding_form("")
	if formal_sprite != null:
		formal_sprite.visible = formal_asset_enabled and riding_form_id == ""
	_set_placeholder_visible(not formal_asset_enabled and riding_form_id == "")
	_update_formal_animation()
	return formal_asset_enabled


func get_appearance_id() -> String:
	return appearance_id


func set_riding_form(form_id: String) -> bool:
	var normalized := form_id.strip_edges()
	if normalized != "":
		var required_character_id := MountVisualProfileCatalog.character_id_for_form(normalized)
		if not CharacterActionAssetCatalog.appearance_supports_mounted_character(
			appearance_id,
			required_character_id
		):
			normalized = ""
	var mounted := false
	if mounted_character != null and mounted_character.has_method("set_mount_form"):
		mounted = bool(mounted_character.call("set_mount_form", normalized))
	riding_form_id = normalized if mounted else ""
	if mounted:
		if mounted_character.has_method("set_presentation_scale"):
			mounted_character.call("set_presentation_scale", MountVisualProfileCatalog.world_presentation_scale_for_form(riding_form_id))
	if formal_sprite != null:
		formal_sprite.visible = formal_asset_enabled and not mounted
	if shadow != null:
		shadow.visible = not mounted
	_set_placeholder_visible(not formal_asset_enabled and not mounted)
	_update_formal_animation()
	return mounted


func get_riding_form_id() -> String:
	return riding_form_id


func uses_formal_character_art() -> bool:
	return formal_asset_enabled


func set_world_visual_grade(grade: Dictionary) -> void:
	var next_signature := WorldVisualGrade.grade_signature(grade)
	if next_signature == world_visual_grade_signature:
		return
	world_visual_grade_signature = next_signature
	var material: ShaderMaterial = WorldVisualGrade.material_for_grade(grade)
	if formal_sprite != null:
		formal_sprite.material = material
		formal_sprite.texture_filter = (
			CanvasItem.TEXTURE_FILTER_LINEAR
			if WorldVisualGrade.uses_linear_filter(grade)
			else CanvasItem.TEXTURE_FILTER_NEAREST
		)
	if mounted_character != null:
		mounted_character.material = material
		mounted_character.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR


func get_visual_bounds_signature() -> String:
	return "%s|%s|%s|%s" % [
		appearance_id,
		riding_form_id,
		facing_key,
		animation_state,
	]


func get_visual_bounds_source() -> String:
	if riding_form_id != "":
		return "mounted_frame_envelope"
	if formal_asset_enabled and formal_sprite != null and formal_sprite.texture != null:
		return "formal_action_alpha_union"
	return "placeholder_geometry"


func get_visual_world_rect() -> Rect2:
	if riding_form_id != "" and mounted_character != null:
		var mounted_scale := clampf(
			float(mounted_character.get("presentation_scale")),
			0.1,
			3.0
		)
		var ground_anchor_y := MountedCharacterAssetCatalog.world_ground_anchor_y(
			MountVisualProfileCatalog.character_id_for_form(riding_form_id),
			riding_form_id
		)
		return _node_local_rect_to_world(
			mounted_character,
			Rect2(
				Vector2(-128.0 * mounted_scale, -ground_anchor_y * mounted_scale),
				Vector2(256.0, 256.0) * mounted_scale
			)
		)
	if formal_asset_enabled and formal_sprite != null and formal_sprite.texture != null:
		return _sprite_source_rect_to_world(
			formal_sprite,
			_formal_action_source_bounds()
		)
	return _node_local_rect_to_world(
		self,
		Rect2(Vector2(-22.0, -21.0), Vector2(44.0, 54.0))
	)


func _formal_action_source_bounds() -> Rect2i:
	var cache_key := "%s|%s|%s" % [appearance_id, facing_key, animation_state]
	if visual_source_bounds_cache.has(cache_key):
		return visual_source_bounds_cache.get(cache_key, Rect2i()) as Rect2i
	var combined := Rect2i()
	var has_opaque_pixels := false
	var frame_count := CharacterActionAssetCatalog.world_frame_count_for_action(
		animation_state,
		appearance_id
	)
	for frame_index in range(1, frame_count + 1):
		var texture := CharacterActionAssetCatalog.world_texture_for_frame(
			facing_key,
			animation_state,
			frame_index,
			appearance_id
		)
		if texture == null:
			continue
		var image := texture.get_image()
		if image == null or image.is_empty():
			continue
		var used_rect := image.get_used_rect()
		if used_rect.size.x <= 0 or used_rect.size.y <= 0:
			continue
		combined = used_rect if not has_opaque_pixels else combined.merge(used_rect)
		has_opaque_pixels = true
	if not has_opaque_pixels:
		combined = Rect2i(Vector2i.ZERO, Vector2i(formal_sprite.texture.get_size()))
	visual_source_bounds_cache[cache_key] = combined
	return combined


static func _sprite_source_rect_to_world(
	sprite: Sprite2D,
	source_rect: Rect2i
) -> Rect2:
	if sprite == null or sprite.texture == null:
		return Rect2()
	var texture_size := Vector2(sprite.texture.get_size())
	if texture_size.x <= 0.0 or texture_size.y <= 0.0:
		return Rect2()
	var draw_rect := sprite.get_rect()
	var normalized_source_position := Vector2(source_rect.position) / texture_size
	if sprite.flip_h:
		normalized_source_position.x = (
			texture_size.x - float(source_rect.end.x)
		) / texture_size.x
	if sprite.flip_v:
		normalized_source_position.y = (
			texture_size.y - float(source_rect.end.y)
		) / texture_size.y
	var local_rect := Rect2(
		draw_rect.position + normalized_source_position * draw_rect.size,
		Vector2(source_rect.size) / texture_size * draw_rect.size
	)
	return _node_local_rect_to_world(sprite, local_rect)


static func _node_local_rect_to_world(node: Node2D, local_rect: Rect2) -> Rect2:
	if node == null or local_rect.size.x <= 0.0 or local_rect.size.y <= 0.0:
		return Rect2()
	var corners: Array[Vector2] = [
		node.to_global(local_rect.position),
		node.to_global(local_rect.position + Vector2(local_rect.size.x, 0.0)),
		node.to_global(local_rect.end),
		node.to_global(local_rect.position + Vector2(0.0, local_rect.size.y)),
	]
	var min_point := corners[0]
	var max_point := corners[0]
	for corner in corners:
		min_point.x = minf(min_point.x, corner.x)
		min_point.y = minf(min_point.y, corner.y)
		max_point.x = maxf(max_point.x, corner.x)
		max_point.y = maxf(max_point.y, corner.y)
	return Rect2(min_point, max_point - min_point)


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
	if formal_asset_enabled:
		_update_formal_animation()


func _update_formal_animation() -> void:
	if not formal_asset_enabled:
		return
	if riding_form_id != "":
		if mounted_character != null and mounted_character.has_method("set_visual_state"):
			mounted_character.call("set_visual_state", facing_key, animation_state, animation_time)
		return
	if formal_sprite == null:
		return
	var texture := CharacterActionAssetCatalog.world_texture_for_elapsed(
		facing_key,
		animation_state,
		animation_time,
		appearance_id
	)
	if texture != null and texture != last_formal_texture:
		formal_sprite.texture = texture
		last_formal_texture = texture
	if last_formal_flip_h:
		formal_sprite.flip_h = false
		last_formal_flip_h = false


func _set_placeholder_visible(value: bool) -> void:
	if body != null:
		body.visible = value
	if facing_mark != null:
		facing_mark.visible = value
	if left_foot != null:
		left_foot.visible = value and last_left_foot_visible
	if right_foot != null:
		right_foot.visible = value and last_right_foot_visible


func _update_placeholder_animation() -> void:
	if body == null:
		return
	if animation_state == "walk":
		var bob := sin(animation_time * 12.0)
		_set_body_transform(Vector2(0.0, -2.0 + bob * 2.0), Vector2.ONE)
		_set_body_color(Color(0.24, 0.61, 0.94, 1.0))
		_set_foot_visible(true, bob >= 0.0)
	else:
		var breathe := 1.0 + sin(animation_time * 3.0) * 0.035
		_set_body_transform(Vector2.ZERO, Vector2(1.0, breathe))
		_set_body_color(Color(0.184314, 0.521569, 0.862745, 1.0))
		_set_foot_visible(false, false)


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
