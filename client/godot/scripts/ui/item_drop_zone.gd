extends Control
class_name ItemDropZone

signal item_dropped_outside(source_data: Dictionary, screen_position: Vector2)

var accepted_contexts: Array[String] = []
var excluded_control: Control


func configure(contexts: Array[String], excluded: Control = null) -> void:
	accepted_contexts = contexts.duplicate()
	excluded_control = excluded


func _can_drop_data(_at_position: Vector2, data) -> bool:
	if not visible or not (data is Dictionary):
		return false
	var source := data as Dictionary
	if str(source.get("dragKind", "")) != "item_slot":
		return false
	if not accepted_contexts.has(str(source.get("context", ""))):
		return false
	if excluded_control != null and excluded_control.visible:
		var mouse_position := get_global_mouse_position()
		if excluded_control.get_global_rect().has_point(mouse_position):
			return false
	return true


func _drop_data(_at_position: Vector2, data) -> void:
	if not (data is Dictionary):
		return
	item_dropped_outside.emit((data as Dictionary).duplicate(true), get_global_mouse_position())
