extends Node2D

@export var follow_speed: float = 170.0

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

var follow_target: Vector2 = Vector2.ZERO
var has_follow_target: bool = false
var facing_key: String = "south"
var animation_state: String = "idle"
var animation_time: float = 0.0


func _ready() -> void:
	follow_target = global_position
	face_direction(Vector2.DOWN)
	_set_animation_state("idle")


func _process(delta: float) -> void:
	animation_time += delta
	var direction := Vector2.ZERO
	if has_follow_target:
		var to_target := follow_target - global_position
		if to_target.length() > 5.0:
			direction = to_target.normalized()
			global_position += direction * minf(follow_speed * delta, to_target.length())
			face_direction(direction)
			_set_animation_state("walk")
		else:
			_set_animation_state("idle")
	else:
		_set_animation_state("idle")
	_update_placeholder_animation()


func set_follow_target(target: Vector2) -> void:
	follow_target = target
	has_follow_target = true


func clear_follow_target() -> void:
	has_follow_target = false
	_set_animation_state("idle")


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
		var bob := sin(animation_time * 11.0)
		body.position.y = -1.5 + bob * 1.5
		body.scale = Vector2.ONE
		body.color = Color(0.42, 0.78, 0.43, 1.0)
		_set_foot_visible(true, bob >= 0.0)
	else:
		var breathe := 1.0 + sin(animation_time * 3.2) * 0.035
		body.position.y = 0.0
		body.scale = Vector2(1.0, breathe)
		body.color = Color(0.30, 0.68, 0.36, 1.0)
		_set_foot_visible(false, false)


func _set_foot_visible(show_feet: bool, left_step: bool) -> void:
	if left_foot != null:
		left_foot.visible = show_feet and left_step
	if right_foot != null:
		right_foot.visible = show_feet and not left_step
