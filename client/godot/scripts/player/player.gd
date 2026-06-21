extends CharacterBody2D

@export var walk_speed: float = 160.0
@export var sprint_speed: float = 260.0
@export var click_move_speed: float = 190.0
@export var world_margin: float = 32.0

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

var move_target: Vector2 = Vector2.ZERO
var has_move_target: bool = false
var path_points: Array[Vector2] = []
var movement_bounds: Rect2 = Rect2(Vector2.ZERO, Vector2(1280, 720))
var facing_key: String = "south"
var animation_state: String = "idle"
var animation_time: float = 0.0
var controls_enabled: bool = true


func _ready() -> void:
	face_direction(Vector2.DOWN)
	_set_animation_state("idle")


func _process(delta: float) -> void:
	animation_time += delta
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


func _physics_process(_delta: float) -> void:
	if not controls_enabled:
		velocity = Vector2.ZERO
		_set_animation_state("idle")
		return
	var keyboard_direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	var direction := keyboard_direction
	var current_speed := walk_speed

	# Keyboard movement is a developer fallback; the player-facing control is click/tap auto-move.
	if keyboard_direction.length() > 0.0:
		has_move_target = false
		current_speed = sprint_speed if Input.is_action_pressed("sprint") else walk_speed
	elif has_move_target:
		var to_target := move_target - global_position
		if to_target.length() <= 4.0:
			if not path_points.is_empty():
				path_points.pop_front()
			if path_points.is_empty():
				has_move_target = false
				direction = Vector2.ZERO
			else:
				move_target = path_points[0]
				direction = (move_target - global_position).normalized()
				current_speed = click_move_speed
		else:
			direction = to_target.normalized()
			current_speed = click_move_speed

	direction = direction.normalized()
	if direction.length() > 0.0:
		face_direction(direction)
		_set_animation_state("walk")
	else:
		_set_animation_state("idle")

	velocity = direction * current_speed
	move_and_slide()
	_clamp_to_bounds()


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


func _update_placeholder_animation() -> void:
	if body == null:
		return
	if animation_state == "walk":
		var bob := sin(animation_time * 12.0)
		body.position.y = -2.0 + bob * 2.0
		body.scale = Vector2.ONE
		body.color = Color(0.24, 0.61, 0.94, 1.0)
		_set_foot_visible(true, bob >= 0.0)
	else:
		var breathe := 1.0 + sin(animation_time * 3.0) * 0.035
		body.position.y = 0.0
		body.scale = Vector2(1.0, breathe)
		body.color = Color(0.184314, 0.521569, 0.862745, 1.0)
		_set_foot_visible(false, false)


func _set_foot_visible(show_feet: bool, left_step: bool) -> void:
	if left_foot != null:
		left_foot.visible = show_feet and left_step
	if right_foot != null:
		right_foot.visible = show_feet and not left_step
