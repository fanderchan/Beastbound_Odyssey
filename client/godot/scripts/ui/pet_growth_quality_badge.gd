extends Control

const PetGrowthQualityModel := preload("res://scripts/progression/pet_growth_quality_model.gd")
const PetManagementVisualSkin := preload("res://scripts/ui/pet_management_visual_skin.gd")
const BADGE_FRAME_TEXTURE := preload(
	"res://assets/ui/pet_management_awakened_v2/runtime/quality_badge_frame.png"
)

var _view: Dictionary = {}
var _frame: TextureRect
var _label: Label
var _wash_segments: Array[ColorRect] = []
var _accent_segments: Array[ColorRect] = []


func _init() -> void:
	custom_minimum_size = Vector2(184.0, 36.0)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_frame = TextureRect.new()
	_frame.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_frame.texture = BADGE_FRAME_TEXTURE
	_frame.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_frame.stretch_mode = TextureRect.STRETCH_SCALE
	_frame.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_frame)
	var wash_row := HBoxContainer.new()
	wash_row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	wash_row.offset_left = 18.0
	wash_row.offset_top = 6.0
	wash_row.offset_right = -18.0
	wash_row.offset_bottom = -6.0
	wash_row.add_theme_constant_override("separation", 0)
	wash_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(wash_row)
	for _index in range(5):
		var wash_segment := ColorRect.new()
		wash_segment.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		wash_segment.mouse_filter = Control.MOUSE_FILTER_IGNORE
		wash_row.add_child(wash_segment)
		_wash_segments.append(wash_segment)
	var accent_row := HBoxContainer.new()
	accent_row.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	accent_row.offset_left = 17.0
	accent_row.offset_top = -5.0
	accent_row.offset_right = -17.0
	accent_row.offset_bottom = -2.0
	accent_row.add_theme_constant_override("separation", 0)
	accent_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(accent_row)
	for _index in range(5):
		var segment := ColorRect.new()
		segment.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		segment.mouse_filter = Control.MOUSE_FILTER_IGNORE
		accent_row.add_child(segment)
		_accent_segments.append(segment)
	_label = Label.new()
	_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_label.add_theme_font_override("font", PetManagementVisualSkin.display_font())
	_label.add_theme_font_size_override("font_size", 15)
	_label.add_theme_color_override("font_color", Color(1.0, 0.98, 0.92, 1.0))
	_label.add_theme_color_override("font_outline_color", Color(0.04, 0.03, 0.06, 0.92))
	_label.add_theme_constant_override("outline_size", 2)
	_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_label)
	configure(PetGrowthQualityModel.unobserved_presentation())


func configure(view: Dictionary) -> void:
	_view = view.duplicate(true)
	_label.text = str(_view.get("badgeText", "成长未观察"))
	tooltip_text = "%s｜%s" % [
		_label.text,
		str(_view.get("statusText", "")),
	]
	_refresh_tone()


func snapshot() -> Dictionary:
	return {
		"text": _label.text,
		"toneId": str(_view.get("toneId", "unobserved")),
		"mature": bool(_view.get("mature", false)),
		"preliminary": bool(_view.get("preliminary", false)),
		"burstAny": bool(_view.get("burstAny", false)),
	}


func _refresh_tone() -> void:
	var tone_id := str(_view.get("toneId", "unobserved"))
	var accent := PetGrowthQualityModel.color_for_tone(
		tone_id,
		str(_view.get("colorHex", ""))
	)
	_frame.modulate = accent.lerp(Color.WHITE, 0.68)
	if tone_id == "rainbow":
		var colors := PetGrowthQualityModel.rainbow_colors()
		for index in range(_accent_segments.size()):
			_accent_segments[index].color = colors[index % colors.size()]
			var wash_color := colors[index % colors.size()]
			wash_color.a = 0.34
			_wash_segments[index].color = wash_color
	else:
		for index in range(_accent_segments.size()):
			_accent_segments[index].color = accent
			var wash_color := accent
			wash_color.a = 0.24
			_wash_segments[index].color = wash_color
