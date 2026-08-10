extends VBoxContainer

signal details_toggled(expanded: bool)

const PetGrowthBarControl := preload("res://scripts/ui/pet_growth_bar_control.gd")
const PetGrowthQualityBadge := preload("res://scripts/ui/pet_growth_quality_badge.gd")
const PetManagementVisualSkin := preload("res://scripts/ui/pet_management_visual_skin.gd")

var _quality_badge: Control
var _title_label: Label
var _status_label: Label
var _benchmark_label: Label
var _rows: VBoxContainer
var _view: Dictionary = {}
var _details_button: Button
var _details_expanded := false


func _init() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation", 7)
	_title_label = Label.new()
	_title_label.text = "成长"
	_title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	PetManagementVisualSkin.apply_title(_title_label, 25)
	add_child(_title_label)
	var header_row := HBoxContainer.new()
	header_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header_row.add_theme_constant_override("separation", 8)
	add_child(header_row)
	var badge_leading_space := Control.new()
	badge_leading_space.custom_minimum_size.x = 64.0
	header_row.add_child(badge_leading_space)
	_quality_badge = PetGrowthQualityBadge.new()
	_quality_badge.custom_minimum_size = Vector2(112.0, 28.0)
	header_row.add_child(_quality_badge)
	_status_label = Label.new()
	_status_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_status_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_status_label.add_theme_font_size_override("font_size", 14)
	_status_label.add_theme_color_override("font_color", PetManagementVisualSkin.CREAM_TEXT)
	header_row.add_child(_status_label)
	_details_button = Button.new()
	PetManagementVisualSkin.apply_help_button(_details_button)
	_details_button.tooltip_text = "展开成长明细"
	_details_button.pressed.connect(_on_details_pressed)
	header_row.add_child(_details_button)
	_benchmark_label = Label.new()
	_benchmark_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_benchmark_label.add_theme_font_size_override("font_size", 12)
	_benchmark_label.add_theme_color_override("font_color", PetManagementVisualSkin.MUTED_TEXT)
	_benchmark_label.visible = false
	add_child(_benchmark_label)
	_rows = VBoxContainer.new()
	_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_rows.add_theme_constant_override("separation", 5)
	add_child(_rows)


func configure(view: Dictionary) -> void:
	_view = view.duplicate(true)
	_quality_badge.call("configure", _view)
	_status_label.text = str(_view.get("statusText", "Lv1四维独立显示，升级后开始观察成长"))
	_benchmark_label.text = "%s · 爆字在Lv20且证据成熟后开放" % str(
		_view.get("benchmarkLabel", "当前形态公开上限")
	)
	_details_button.tooltip_text = "%s｜%s" % [
		"收起成长明细" if _details_expanded else "展开成长明细",
		_benchmark_label.text,
	]
	for child in _rows.get_children():
		_rows.remove_child(child)
		child.queue_free()
	for value in _view.get("rows", []):
		if not (value is Dictionary):
			continue
		var row := PetGrowthBarControl.new()
		row.configure(
			value as Dictionary,
			str(_view.get("burstLabel", "爆"))
		)
		_rows.add_child(row)


func snapshot() -> Dictionary:
	var row_snapshots: Array[Dictionary] = []
	for child in _rows.get_children():
		if child.has_method("snapshot"):
			var value = child.call("snapshot")
			if value is Dictionary:
				row_snapshots.append(value as Dictionary)
	return {
		"badge": _quality_badge.call("snapshot") if _quality_badge != null else {},
		"statusText": _status_label.text if _status_label != null else "",
		"benchmarkText": _benchmark_label.text if _benchmark_label != null else "",
		"rowCount": row_snapshots.size(),
		"rows": row_snapshots,
		"detailsExpanded": _details_expanded,
	}


func set_details_expanded(expanded: bool) -> void:
	_details_expanded = expanded
	if _details_button != null:
		_details_button.button_pressed = expanded
		_details_button.tooltip_text = "收起成长明细" if expanded else "展开成长明细"


func _on_details_pressed() -> void:
	set_details_expanded(not _details_expanded)
	details_toggled.emit(_details_expanded)
