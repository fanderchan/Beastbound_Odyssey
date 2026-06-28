extends RefCounted

var input_blockers: Array = []
var world_menu_panels: Array = []


func set_input_blockers(controls: Array) -> void:
	input_blockers = _compact_controls(controls)


func set_world_menu_panels(controls: Array) -> void:
	world_menu_panels = _compact_controls(controls)


func point_hits_visible_panel(point: Vector2) -> bool:
	for control_value in input_blockers:
		if not (control_value is Control):
			continue
		var control := control_value as Control
		if not control.visible:
			continue
		if Rect2(control.global_position, control.size).has_point(point):
			return true
	return false


func any_world_menu_visible() -> bool:
	for control_value in world_menu_panels:
		if control_value is Control and (control_value as Control).visible:
			return true
	return false


func _compact_controls(controls: Array) -> Array:
	var compacted: Array = []
	for control_value in controls:
		if control_value is Control:
			compacted.append(control_value)
	return compacted
