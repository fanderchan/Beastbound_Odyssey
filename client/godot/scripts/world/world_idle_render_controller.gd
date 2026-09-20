extends RefCounted

# Camera2D submits the canvas transform on every internal process tick, even
# after smoothing has stopped. Keep its normal update order while moving;
# suspend only a settled, supported world camera. SceneTree and input keep
# processing at the normal frame budget when unchanged draws are skipped.
const SETTLED_FRAMES := 3
const MAX_SETTLED_DISTANCE := 0.01

var enabled: bool = true
var _camera: Camera2D
var _sleeping := false
var _valid := false
var _last_transform := Transform2D.IDENTITY
var _last_canvas := Transform2D.IDENTITY
var _last_zoom := Vector2.ONE
var _last_size := Vector2.ZERO
var _last_center := Vector2.ZERO
var _stable_frames := 0
var _runtime_owned := false
var _continuous_draws_requested := false
var _previous_low_processor_mode := false


func configure_runtime(continuous_draws_requested: bool = false) -> void:
	if _runtime_owned:
		return
	_continuous_draws_requested = continuous_draws_requested
	_previous_low_processor_mode = OS.low_processor_usage_mode
	_runtime_owned = true
	OS.low_processor_usage_mode = false


func apply_runtime_budget(active: bool, continuous_draws_requested: bool = false) -> void:
	if not _runtime_owned:
		return
	var use_on_demand := (
		enabled and _sleeping and not active
		and not _continuous_draws_requested and not continuous_draws_requested
	)
	if OS.low_processor_usage_mode != use_on_demand:
		OS.low_processor_usage_mode = use_on_demand


func is_sleeping() -> bool:
	return _sleeping


func observe(camera: Camera2D, force: bool = false) -> void:
	if camera != _camera:
		_wake_camera()
		_camera = camera
		_valid = false
	if not is_instance_valid(_camera):
		_sleeping = false
		_valid = false
		return
	var transform := camera.global_transform
	var zoom := camera.zoom
	var viewport := camera.get_viewport()
	var size := viewport.get_visible_rect().size
	var canvas := viewport.canvas_transform
	var center := camera.get_screen_center_position()
	var changed := (
		force or not _valid
		or transform != _last_transform or zoom != _last_zoom
		or size != _last_size or canvas != _last_canvas
	)
	# Settings such as smoothing speed can re-enable Camera2D's callback.
	# Observe that transition too, rather than claiming it is still suspended.
	if changed or not enabled or not _supports_suspension(camera) \
			or (_sleeping and camera.is_processing_internal()):
		_wake_camera()
		_stable_frames = 0
	elif not _sleeping:
		if center == _last_center and center.distance_to(camera.get_target_position()) <= MAX_SETTLED_DISTANCE:
			_stable_frames += 1
		else:
			_stable_frames = 0
		if _stable_frames >= SETTLED_FRAMES:
			camera.set_process_internal(false)
			_sleeping = true
	_last_transform = transform
	_last_canvas = canvas
	_last_zoom = zoom
	_last_size = size
	_last_center = center
	_valid = true


func release() -> void:
	_wake_camera()
	_camera = null
	_valid = false
	_stable_frames = 0
	if _runtime_owned:
		OS.low_processor_usage_mode = _previous_low_processor_mode
		_runtime_owned = false


func _wake_camera() -> void:
	if _sleeping and is_instance_valid(_camera):
		var interpolated := _camera.is_physics_interpolated_and_enabled()
		_camera.set_process_internal(
			_camera.process_callback == Camera2D.CAMERA2D_PROCESS_IDLE or interpolated
		)
		_camera.set_physics_process_internal(
			_camera.process_callback == Camera2D.CAMERA2D_PROCESS_PHYSICS or interpolated
		)
	_sleeping = false


static func _supports_suspension(camera: Camera2D) -> bool:
	# Other camera modes remain on the engine path. Add one only with a paired
	# camera regression, including parameter changes after it has fallen asleep.
	return (
		camera.is_current() and camera.enabled
		and camera.process_callback == Camera2D.CAMERA2D_PROCESS_IDLE
		and not camera.is_physics_interpolated_and_enabled()
		and camera.custom_viewport == null
		and camera.ignore_rotation and not camera.rotation_smoothing_enabled
		and not camera.drag_horizontal_enabled and not camera.drag_vertical_enabled
		and camera.drag_horizontal_offset == 0.0 and camera.drag_vertical_offset == 0.0
		and camera.anchor_mode == Camera2D.ANCHOR_MODE_DRAG_CENTER
		and camera.offset == Vector2.ZERO and not camera.limit_smoothed
	)
