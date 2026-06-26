extends CharacterBody2D

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
var last_body_color: Color = Color.TRANSPARENT
var last_body_position := Vector2(INF, INF)
var last_body_scale := Vector2(INF, INF)
var last_left_foot_visible: bool = false
var last_right_foot_visible: bool = false


func _ready() -> void:
	face_direction(Vector2.DOWN)
	_set_animation_state("idle")


func _process(delta: float) -> void:
	var animation_delta := delta * _effective_speed_multiplier() if animation_state == "walk" else delta
	animation_time += animation_delta
	animation_visual_elapsed += animation_delta
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


func _physics_process(delta: float) -> void:
	if not controls_enabled:
		velocity = Vector2.ZERO
		_set_animation_state("idle")
		return
	var keyboard_direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")
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


func get_facing_key() -> String:
	return facing_key


func get_animation_state() -> String:
	return animation_state


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
