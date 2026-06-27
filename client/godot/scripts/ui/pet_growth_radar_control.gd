extends Control

const STAT_KEYS: Array[String] = ["maxHp", "attack", "defense", "quick"]
const STAT_LABELS := {
	"maxHp": "血",
	"attack": "攻",
	"defense": "防",
	"quick": "敏",
}

var radar_values: Dictionary = {}
var radar_grades: Dictionary = {}


func set_growth_data(values: Dictionary, grades: Dictionary) -> void:
	radar_values = values.duplicate(true)
	radar_grades = grades.duplicate(true)
	queue_redraw()


func _draw() -> void:
	var draw_size := size
	if draw_size.x <= 4.0 or draw_size.y <= 4.0:
		return
	var center := draw_size * 0.5
	var radius := maxf(24.0, minf(draw_size.x, draw_size.y) * 0.34)
	var axis_color := Color(0.82, 0.72, 0.42, 0.48)
	var grid_color := Color(0.82, 0.72, 0.42, 0.24)
	var fill_color := Color(0.27, 0.72, 0.93, 0.22)
	var line_color := Color(0.68, 0.92, 1.0, 0.94)
	for step in [0.25, 0.5, 0.75, 1.0]:
		draw_arc(center, radius * float(step), 0.0, TAU, 64, grid_color, 1.0, true)
	var points := PackedVector2Array()
	for index in range(STAT_KEYS.size()):
		var key := STAT_KEYS[index]
		var angle := -PI * 0.5 + float(index) * TAU / float(STAT_KEYS.size())
		var direction := Vector2(cos(angle), sin(angle))
		draw_line(center, center + direction * radius, axis_color, 1.2, true)
		var value := clampf(float(radar_values.get(key, 0.0)), 0.0, 1.0)
		points.append(center + direction * radius * value)
		var label := "%s %s" % [
			str(STAT_LABELS.get(key, key)),
			str(radar_grades.get(key, "")),
		]
		_draw_axis_label(label, center + direction * (radius + 24.0))
	if points.size() >= 3:
		draw_colored_polygon(points, fill_color)
		var closed := PackedVector2Array(points)
		closed.append(points[0])
		draw_polyline(closed, line_color, 2.0, true)
		for point in points:
			draw_circle(point, 3.5, line_color)


func _draw_axis_label(text: String, position: Vector2) -> void:
	var font := get_theme_default_font()
	if font == null:
		return
	var font_size := 15
	var width := 76.0
	var origin := position - Vector2(width * 0.5, -5.0)
	draw_string(font, origin + Vector2(1, 1), text, HORIZONTAL_ALIGNMENT_CENTER, width, font_size, Color(0.02, 0.03, 0.03, 0.72))
	draw_string(font, origin, text, HORIZONTAL_ALIGNMENT_CENTER, width, font_size, Color(0.96, 0.93, 0.80, 0.96))
