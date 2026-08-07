class_name HangMatchmakingWorldStatus
extends PanelContainer

signal view_requested
signal cancel_requested
signal stop_requested

const HangMatchmakingClientModel := preload(
	"res://scripts/net/hang_matchmaking_client_model.gd"
)

var _title_label: Label
var _detail_label: Label
var _view_button: Button
var _cancel_button: Button


func _ready() -> void:
	if _title_label == null:
		_build()


func prepare() -> void:
	if _title_label == null:
		_build()


func apply_state(state: Dictionary, hang_active: bool = false) -> void:
	prepare()
	var view := HangMatchmakingClientModel.world_status_view(state)
	var matching_visible := bool(view.get("visible", false))
	visible = matching_visible or hang_active
	if not visible:
		return
	_title_label.text = str(view.get("title", "")) if matching_visible else "挂机中"
	_detail_label.text = (
		str(view.get("detail", ""))
		if matching_visible
		else "当前未开启队伍匹配，可查看练级区域或停止挂机。"
	)
	_cancel_button.visible = matching_visible
	_cancel_button.disabled = not bool(view.get("canCancel", false))


func _build() -> void:
	name = "HangMatchmakingWorldStatus"
	visible = false
	z_index = 22
	mouse_filter = Control.MOUSE_FILTER_STOP
	add_theme_stylebox_override("panel", _panel_style())
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 5)
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	add_child(column)
	_title_label = Label.new()
	_title_label.add_theme_font_size_override("font_size", 16)
	_title_label.add_theme_color_override("font_color", Color("f5d47e"))
	column.add_child(_title_label)
	_detail_label = Label.new()
	_detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_detail_label.add_theme_font_size_override("font_size", 13)
	_detail_label.add_theme_color_override("font_color", Color("e7dcc2"))
	column.add_child(_detail_label)
	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", 6)
	column.add_child(buttons)
	_view_button = _action_button("查看")
	_view_button.pressed.connect(func() -> void: view_requested.emit())
	buttons.add_child(_view_button)
	_cancel_button = _action_button("取消匹配")
	_cancel_button.pressed.connect(func() -> void: cancel_requested.emit())
	buttons.add_child(_cancel_button)
	var stop_button := _action_button("停止挂机")
	stop_button.pressed.connect(func() -> void: stop_requested.emit())
	buttons.add_child(stop_button)


func _action_button(text_value: String) -> Button:
	var button := Button.new()
	button.text = text_value
	button.custom_minimum_size = Vector2(88, 34)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.add_theme_font_size_override("font_size", 14)
	return button


func _panel_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color("402d1fef")
	style.border_color = Color("b68a48")
	style.set_border_width_all(2)
	style.corner_radius_top_left = 8
	style.corner_radius_top_right = 8
	style.corner_radius_bottom_left = 8
	style.corner_radius_bottom_right = 8
	style.content_margin_left = 12
	style.content_margin_right = 12
	style.content_margin_top = 9
	style.content_margin_bottom = 9
	return style
