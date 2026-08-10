extends Control

const PetGrowthQualityModel := preload("res://scripts/progression/pet_growth_quality_model.gd")
const PetManagementVisualSkin := preload("res://scripts/ui/pet_management_visual_skin.gd")

var _row: Dictionary = {}
var _burst_label := "爆"


func _init() -> void:
	custom_minimum_size = Vector2(0.0, 64.0)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func configure(row: Dictionary, burst_label: String = "爆") -> void:
	_row = row.duplicate(true)
	_burst_label = burst_label if burst_label != "" else "爆"
	tooltip_text = _tooltip_text()
	queue_redraw()


func snapshot() -> Dictionary:
	return _row.duplicate(true)


func _draw() -> void:
	var font := PetManagementVisualSkin.display_font()
	if font == null:
		return
	var row_background := StyleBoxFlat.new()
	row_background.bg_color = Color(0.035, 0.030, 0.024, 0.66)
	row_background.corner_radius_top_left = 8
	row_background.corner_radius_top_right = 8
	row_background.corner_radius_bottom_left = 8
	row_background.corner_radius_bottom_right = 8
	draw_style_box(row_background, Rect2(Vector2.ZERO, size))
	var font_size := 18
	var label := str(_row.get("label", "成长"))
	var available := bool(_row.get("available", false))
	var grade_id := str(_row.get("gradeId", "D"))
	var tone_id := str(_row.get("toneId", "blue"))
	var accent := PetGrowthQualityModel.color_for_tone(
		tone_id,
		str(_row.get("colorHex", ""))
	)
	var label_color := Color(0.94, 0.92, 0.84, 1.0)
	draw_string(font, Vector2(12.0, 25.0), label, HORIZONTAL_ALIGNMENT_LEFT, 112.0, font_size, label_color)
	var value_text := "-"
	if available:
		value_text = "%.3f / %.3f" % [
			float(_row.get("value", 0.0)),
			float(_row.get("benchmark", 0.0)),
		]
	draw_string(
		font,
		Vector2(128.0, 25.0),
		value_text,
		HORIZONTAL_ALIGNMENT_LEFT,
		maxf(80.0, size.x - 210.0),
		font_size,
		Color(0.92, 0.87, 0.76, 1.0)
	)
	if bool(_row.get("burst", false)):
		draw_circle(Vector2(size.x - 22.0, 32.0), 17.0, Color(0.44, 0.24, 0.05, 0.92))
		draw_circle(Vector2(size.x - 22.0, 32.0), 14.0, Color(0.92, 0.54, 0.10, 0.42))
		draw_string(
			font,
			Vector2(size.x - 39.0, 37.0),
			_burst_label,
			HORIZONTAL_ALIGNMENT_CENTER,
			34.0,
			17,
			Color(1.0, 0.90, 0.45, 1.0)
		)

	var burst_space := 48.0 if bool(_row.get("burst", false)) else 14.0
	var bar_rect := Rect2(
		Vector2(12.0, 39.0),
		Vector2(maxf(0.0, size.x - 24.0 - burst_space), 15.0)
	)
	var background := StyleBoxFlat.new()
	background.bg_color = Color(0.10, 0.075, 0.035, 0.94)
	background.corner_radius_top_left = 5
	background.corner_radius_top_right = 5
	background.corner_radius_bottom_left = 5
	background.corner_radius_bottom_right = 5
	background.border_width_left = 1
	background.border_width_top = 1
	background.border_width_right = 1
	background.border_width_bottom = 1
	background.border_color = Color(0.36, 0.26, 0.13, 0.86)
	draw_style_box(background, bar_rect)
	if not available:
		return
	var ratio := clampf(float(_row.get("ratio", 0.0)), 0.0, 1.0)
	var fill_rect := bar_rect.grow(-2.0)
	fill_rect.size.x *= ratio
	if fill_rect.size.x <= 0.5:
		return
	if tone_id == "rainbow":
		var rainbow_fill := StyleBoxFlat.new()
		rainbow_fill.bg_color = Color(1.0, 0.60, 0.08, 1.0)
		rainbow_fill.corner_radius_top_left = 3
		rainbow_fill.corner_radius_top_right = 3
		rainbow_fill.corner_radius_bottom_left = 3
		rainbow_fill.corner_radius_bottom_right = 3
		draw_style_box(rainbow_fill, fill_rect)
		var colors := PetGrowthQualityModel.rainbow_colors()
		var accent_width := minf(fill_rect.size.x, 72.0)
		var segment_width := accent_width / maxf(1.0, float(colors.size()))
		for index in range(colors.size()):
			draw_rect(
				Rect2(
					fill_rect.position + Vector2(segment_width * float(index), fill_rect.size.y - 2.0),
					Vector2(segment_width + 1.0, 2.0)
				),
				colors[index].lerp(Color.WHITE, 0.16)
			)
	else:
		var fill_style := StyleBoxFlat.new()
		fill_style.bg_color = accent
		fill_style.corner_radius_top_left = 3
		fill_style.corner_radius_top_right = 3
		fill_style.corner_radius_bottom_left = 3
		fill_style.corner_radius_bottom_right = 3
		draw_style_box(fill_style, fill_rect)
	var shine := Color(1.0, 1.0, 1.0, 0.22)
	draw_line(
		fill_rect.position + Vector2(2.0, 2.0),
		fill_rect.position + Vector2(maxf(2.0, fill_rect.size.x - 2.0), 2.0),
		shine,
		1.0,
		true
	)
	var benchmark_x := bar_rect.position.x + bar_rect.size.x - 5.0
	draw_line(
		Vector2(benchmark_x, bar_rect.position.y - 2.0),
		Vector2(benchmark_x, bar_rect.end.y + 2.0),
		Color(1.0, 0.79, 0.30, 0.94),
		2.0,
		true
	)


func _tooltip_text() -> String:
	if not bool(_row.get("available", false)):
		return "%s：成长资料不足" % str(_row.get("label", "成长"))
	var text := "%s：实测 %.3f / 公开上限 %.3f" % [
		str(_row.get("label", "成长")),
		float(_row.get("value", 0.0)),
		float(_row.get("benchmark", 0.0)),
	]
	if bool(_row.get("burst", false)):
		text += "｜爆：公开实测成长超过当前上限"
	return text
