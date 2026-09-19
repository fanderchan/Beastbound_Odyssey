extends RefCounted

var input_blockers: Array = []
var world_menu_panels: Array = []
var _world_menu_visibility_dirty: bool = true
var _world_menu_visible: bool = false


func set_input_blockers(controls: Array) -> void:
	input_blockers = _compact_controls(controls)


func set_world_menu_panels(controls: Array) -> void:
	for control_value in world_menu_panels:
		if typeof(control_value) == TYPE_OBJECT and is_instance_valid(control_value) and control_value is Control:
			_watch_world_menu_panel(control_value, false)
	world_menu_panels = _compact_controls(controls)
	for control_value in world_menu_panels:
		_watch_world_menu_panel(control_value, true)
	_invalidate_world_menu_visibility()


func add_input_blocker(control: Control) -> void:
	if control != null and not input_blockers.has(control):
		input_blockers.append(control)


func add_world_menu_panel(control: Control) -> void:
	if is_instance_valid(control) and not world_menu_panels.has(control):
		world_menu_panels.append(control)
		_watch_world_menu_panel(control, true)
		_invalidate_world_menu_visibility()


func remove_input_blocker(control: Control) -> void:
	if control != null:
		input_blockers.erase(control)


func point_hits_visible_panel(point: Vector2) -> bool:
	for control_value in input_blockers:
		if not (control_value is Control):
			continue
		var control := control_value as Control
		if _control_or_visible_child_contains(control, point):
			return true
	return false


func any_world_menu_visible() -> bool:
	if _world_menu_visibility_dirty:
		_world_menu_visibility_dirty = false
		_world_menu_visible = false
		for control_value in world_menu_panels:
			if is_instance_valid(control_value) and (control_value as Control).is_visible_in_tree():
				_world_menu_visible = true
				break
	return _world_menu_visible


func _watch_world_menu_panel(control: Control, watch: bool) -> void:
	# Visibility changes propagate from CanvasItem ancestors. Tree changes also
	# invalidate detached, reparented and freed panels before the next query.
	for changed: Signal in [control.visibility_changed, control.tree_entered, control.tree_exited]:
		if watch and not changed.is_connected(_invalidate_world_menu_visibility):
			changed.connect(_invalidate_world_menu_visibility)
		elif not watch and changed.is_connected(_invalidate_world_menu_visibility):
			changed.disconnect(_invalidate_world_menu_visibility)


func _invalidate_world_menu_visibility() -> void:
	_world_menu_visibility_dirty = true


func _compact_controls(controls: Array) -> Array:
	var compacted: Array = []
	for control_value in controls:
		if typeof(control_value) == TYPE_OBJECT and is_instance_valid(control_value) and control_value is Control:
			compacted.append(control_value)
	return compacted


func _control_or_visible_child_contains(control: Control, point: Vector2) -> bool:
	if control == null or not control.is_visible_in_tree():
		return false
	if control.get_global_rect().has_point(point):
		return true
	for child in control.get_children():
		if child is Control and _control_or_visible_child_contains(child as Control, point):
			return true
	return false
