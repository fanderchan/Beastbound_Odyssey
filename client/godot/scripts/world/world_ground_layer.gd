extends Node2D

const MapVisualRenderer := preload("res://scripts/world/map_visual_renderer.gd")
const MapGroundMesh := preload("res://scripts/world/map_ground_mesh.gd")
const BACKGROUND_COLOR := Color(0.085, 0.13, 0.14)

var _prepared: Dictionary = {}
var _revision := -1
var _background_rect := Rect2()
var _has_ground := false
var _ground_mesh: ArrayMesh


func _init() -> void:
	# Main draws paths and other changing ground feedback above this retained
	# canvas. World actors remain above Main in the existing depth layer.
	show_behind_parent = true
	visible = false


func configure(prepared: Dictionary, revision: int, background_rect: Rect2) -> void:
	if revision != _revision:
		_revision = revision
		_has_ground = MapVisualRenderer.has_prepared_visual(prepared) and MapVisualRenderer.ground_draw_count(prepared) > 0
		_prepared = prepared if _has_ground else {}
		_ground_mesh = MapGroundMesh.build(_prepared) if _has_ground else null
		visible = _has_ground
		queue_redraw()
	set_background_rect(background_rect)


func set_background_rect(background_rect: Rect2) -> void:
	if background_rect == _background_rect:
		return
	_background_rect = background_rect
	if _has_ground:
		queue_redraw()


func has_ground() -> bool:
	return _has_ground


func _draw() -> void:
	if not _has_ground:
		return
	draw_rect(_background_rect, BACKGROUND_COLOR, true)
	if _ground_mesh != null:
		draw_mesh(_ground_mesh, _prepared.get("atlasTexture") as Texture2D)
	else:
		MapVisualRenderer.draw_ground(self, _prepared)
