extends Node2D
class_name WorldHudMinimapRenderCanvas

const MapVisualRenderer := preload(
	"res://scripts/world/map_visual_renderer.gd"
)

var _prepared_visual: Dictionary = {}
var _world_bounds := Rect2()
var _target_size := Vector2(256.0, 256.0)


func configure(
	prepared_visual: Dictionary,
	world_bounds: Rect2,
	target_size: Vector2 = Vector2(256.0, 256.0)
) -> void:
	_prepared_visual = prepared_visual
	_world_bounds = world_bounds
	_target_size = target_size
	_apply_fit_transform()
	visible = (
		MapVisualRenderer.has_prepared_visual(_prepared_visual)
		and _world_bounds.size.x > 0.0
		and _world_bounds.size.y > 0.0
	)
	queue_redraw()


func has_visual() -> bool:
	return visible and MapVisualRenderer.has_prepared_visual(_prepared_visual)


func project_world_position(world_position: Vector2) -> Vector2:
	return world_position * scale + position


func _apply_fit_transform() -> void:
	if _world_bounds.size.x <= 0.0 or _world_bounds.size.y <= 0.0:
		position = Vector2.ZERO
		scale = Vector2.ONE
		return
	var padding := 10.0
	var available := Vector2(
		maxf(1.0, _target_size.x - padding * 2.0),
		maxf(1.0, _target_size.y - padding * 2.0)
	)
	var fit_scale := minf(
		available.x / _world_bounds.size.x,
		available.y / _world_bounds.size.y
	)
	scale = Vector2(fit_scale, fit_scale)
	position = _target_size * 0.5 - _world_bounds.get_center() * fit_scale


func _draw() -> void:
	if not visible:
		return
	MapVisualRenderer.draw_ground(self, _prepared_visual)
	MapVisualRenderer.draw_objects(self, _prepared_visual, "ground_decal")
	MapVisualRenderer.draw_objects(self, _prepared_visual, "world")
	MapVisualRenderer.draw_objects(self, _prepared_visual, "foreground")
