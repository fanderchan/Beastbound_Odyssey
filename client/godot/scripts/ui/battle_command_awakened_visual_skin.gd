extends RefCounted

const ICONS := {
	"assist": preload("res://assets/ui/battle_command_awakened_v1/runtime/icons/assist.png"),
	"attack": preload("res://assets/ui/battle_command_awakened_v1/runtime/icons/attack.png"),
	"auto": preload("res://assets/ui/battle_command_awakened_v1/runtime/icons/auto.png"),
	"cancel": preload("res://assets/ui/battle_command_awakened_v1/runtime/icons/cancel.png"),
	"capture": preload("res://assets/ui/battle_command_awakened_v1/runtime/icons/capture.png"),
	"defend": preload("res://assets/ui/battle_command_awakened_v1/runtime/icons/defend.png"),
	"escape": preload("res://assets/ui/battle_command_awakened_v1/runtime/icons/escape.png"),
	"item": preload("res://assets/ui/battle_command_awakened_v1/runtime/icons/item.png"),
	"managed": preload("res://assets/ui/battle_command_awakened_v1/runtime/icons/managed.png"),
	"pet": preload("res://assets/ui/battle_command_awakened_v1/runtime/icons/pet.png"),
	"player": preload("res://assets/ui/battle_command_awakened_v1/runtime/icons/player.png"),
	"recall": preload("res://assets/ui/battle_command_awakened_v1/runtime/icons/recall.png"),
	"return": preload("res://assets/ui/battle_command_awakened_v1/runtime/icons/return.png"),
	"skill": preload("res://assets/ui/battle_command_awakened_v1/runtime/icons/skill.png"),
	"spirit": preload("res://assets/ui/battle_command_awakened_v1/runtime/icons/spirit.png"),
	"summon": preload("res://assets/ui/battle_command_awakened_v1/runtime/icons/summon.png"),
}


static func icon(icon_id: String) -> Texture2D:
	var normalized_id := icon_id.strip_edges()
	if normalized_id == "" or not ICONS.has(normalized_id):
		return null
	return ICONS[normalized_id] as Texture2D


static func transparent_panel_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0, 0, 0, 0)
	style.border_color = Color(0, 0, 0, 0)
	style.set_border_width_all(0)
	style.content_margin_left = 0
	style.content_margin_top = 0
	style.content_margin_right = 0
	style.content_margin_bottom = 0
	return style


static func medallion_style(kind: String = "normal") -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	match kind:
		"selected":
			style.bg_color = Color("594520e8")
			style.border_color = Color("f2c45fff")
		"disabled":
			style.bg_color = Color("201d19a6")
			style.border_color = Color("766d5ea6")
		"danger":
			style.bg_color = Color("5a2119e8")
			style.border_color = Color("f07c54ff")
		_:
			style.bg_color = Color("29231ddc")
			style.border_color = Color("b79353ef")
	style.set_border_width_all(3)
	style.set_corner_radius_all(30)
	style.shadow_color = Color(0, 0, 0, 0.54)
	style.shadow_size = 5
	style.shadow_offset = Vector2(0, 2)
	return style


static func button_overlay_style(color: Color = Color(0, 0, 0, 0)) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = Color(0, 0, 0, 0)
	style.set_border_width_all(0)
	style.set_corner_radius_all(30)
	return style


static func popover_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color("211b15f2")
	style.border_color = Color("c69a4cf2")
	style.set_border_width_all(2)
	style.set_corner_radius_all(12)
	style.content_margin_left = 14
	style.content_margin_top = 12
	style.content_margin_right = 14
	style.content_margin_bottom = 12
	style.shadow_color = Color(0, 0, 0, 0.6)
	style.shadow_size = 10
	style.shadow_offset = Vector2(0, 4)
	return style


static func submenu_style() -> StyleBoxFlat:
	var style := popover_style()
	style.bg_color = Color("18140fcc")
	style.border_color = Color("9e7e46d9")
	return style


static func strategy_control_style(kind: String = "normal") -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	match kind:
		"hover":
			style.bg_color = Color("4a3825f2")
			style.border_color = Color("edc36cff")
		"pressed":
			style.bg_color = Color("5a4325fa")
			style.border_color = Color("f6cf78ff")
		_:
			style.bg_color = Color("30271ff0")
			style.border_color = Color("9d7a43ef")
	style.set_border_width_all(2)
	style.set_corner_radius_all(8)
	style.content_margin_left = 12
	style.content_margin_right = 10
	return style
