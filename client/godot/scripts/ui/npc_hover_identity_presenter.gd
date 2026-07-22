extends RefCounted

const InteractionModel := preload("res://scripts/world/interaction_model.gd")
const NpcArtCatalog := preload("res://scripts/world/npc_art_catalog.gd")

const PANEL_MAX_WIDTH := 420.0
const PANEL_HEIGHT := 44.0
const PANEL_MARGIN := 18.0
const PANEL_TOP_GAP := 8.0

var panel: PanelContainer
var label: Label
var current_npc_id: String = ""
var current_identity_text: String = ""
var _hit_entries: Array[Dictionary] = []
var _alpha_bounds_by_texture_id: Dictionary = {}


func build(parent: Control) -> void:
	if parent == null or panel != null:
		return
	panel = PanelContainer.new()
	panel.name = "NpcHoverIdentityPanel"
	panel.visible = false
	panel.z_index = 36
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_theme_stylebox_override("panel", _panel_style())
	label = Label.new()
	label.name = "NpcHoverIdentityLabel"
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_size_override("font_size", 18)
	label.add_theme_color_override("font_color", Color(1.0, 0.94, 0.76, 0.98))
	panel.add_child(label)
	parent.add_child(panel)


func layout(viewport_size: Vector2, top_panel_rect: Rect2 = Rect2()) -> void:
	if panel == null:
		return
	var width := minf(PANEL_MAX_WIDTH, maxf(220.0, viewport_size.x - PANEL_MARGIN * 2.0))
	var y := PANEL_MARGIN
	if top_panel_rect.size.y > 0.0:
		y = top_panel_rect.end.y + PANEL_TOP_GAP
	panel.position = Vector2((viewport_size.x - width) * 0.5, y)
	panel.size = Vector2(width, PANEL_HEIGHT)


func configure_map(map_data: Dictionary) -> void:
	_hit_entries.clear()
	for value in InteractionModel.interaction_points(map_data):
		if not (value is Dictionary):
			continue
		var item := value as Dictionary
		if str(item.get("kind", "")) != "npc":
			continue
		_hit_entries.append(_world_hit_entry_for(item, map_data))
	clear()


func update_at_world_point(world_point: Vector2) -> bool:
	return show_item(npc_at_world_point(world_point))


func npc_at_world_point(world_point: Vector2) -> Dictionary:
	var best_item: Dictionary = {}
	var best_distance := INF
	for entry in _hit_entries:
		var hit_rect := entry.get("rect", Rect2()) as Rect2
		if not _entry_has_point(entry, hit_rect, world_point):
			continue
		var center := entry.get("center", hit_rect.get_center()) as Vector2
		var distance := world_point.distance_squared_to(center)
		if distance < best_distance:
			best_item = entry.get("item", {}) as Dictionary
			best_distance = distance
	return best_item


func cached_npc_count() -> int:
	return _hit_entries.size()


func show_item(item: Dictionary) -> bool:
	var next_id := str(item.get("id", "")).strip_edges()
	var next_text := identity_text_for(item)
	if next_id == "" or next_text == "":
		return clear()
	var changed := next_id != current_npc_id or next_text != current_identity_text or panel == null or not panel.visible
	current_npc_id = next_id
	current_identity_text = next_text
	if label != null and label.text != next_text:
		label.text = next_text
	if panel != null and not panel.visible:
		panel.visible = true
	return changed


func clear() -> bool:
	var changed := current_npc_id != "" or current_identity_text != "" or (panel != null and panel.visible)
	if not changed:
		return false
	current_npc_id = ""
	current_identity_text = ""
	if label != null:
		label.text = ""
	if panel != null:
		panel.visible = false
	return changed


func is_visible() -> bool:
	return panel != null and panel.visible


static func identity_text_for(item: Dictionary) -> String:
	if str(item.get("kind", "")).strip_edges() != "npc":
		return ""
	var role_label := str(item.get("roleLabel", "")).strip_edges()
	var personal_name := str(item.get("personalName", "")).strip_edges()
	if role_label != "" and personal_name != "":
		return "%s：%s" % [role_label, personal_name]
	return str(item.get("name", "")).strip_edges()


func _world_hit_entry_for(item: Dictionary, map_data: Dictionary) -> Dictionary:
	var marker := InteractionModel.marker_world_position(map_data, item)
	var texture := NpcArtCatalog.world_texture_for_instance(item)
	if texture != null:
		var draw_rect := NpcArtCatalog.world_draw_rect_for_instance(item, marker, texture)
		var alpha_bounds := _alpha_bounds_for(texture)
		if alpha_bounds.size.x <= 0 or alpha_bounds.size.y <= 0:
			return _fallback_hit_entry(item, marker)
		var scale_x := draw_rect.size.x / float(texture.get_width())
		var scale_y := draw_rect.size.y / float(texture.get_height())
		var hit_rect := Rect2(
			draw_rect.position + Vector2(
				float(alpha_bounds.position.x) * scale_x,
				float(alpha_bounds.position.y) * scale_y
			),
			Vector2(float(alpha_bounds.size.x) * scale_x, float(alpha_bounds.size.y) * scale_y)
		).grow(4.0)
		return {
			"item": item,
			"rect": hit_rect,
			"center": hit_rect.get_center(),
		}
	return _fallback_hit_entry(item, marker)


static func _fallback_hit_entry(item: Dictionary, marker: Vector2) -> Dictionary:
	var fallback_rect := Rect2(marker + Vector2(-18.0, -28.0), Vector2(36.0, 52.0)).grow(4.0)
	return {
		"item": item,
		"rect": fallback_rect,
		"center": fallback_rect.get_center(),
	}


func _alpha_bounds_for(texture: Texture2D) -> Rect2i:
	var texture_id := texture.get_instance_id()
	var cached = _alpha_bounds_by_texture_id.get(texture_id)
	if cached is Rect2i:
		return cached
	var image := texture.get_image()
	if image == null or image.is_empty():
		return Rect2i()
	var alpha_bounds := image.get_used_rect()
	_alpha_bounds_by_texture_id[texture_id] = alpha_bounds
	return alpha_bounds


static func _entry_has_point(entry: Dictionary, hit_rect: Rect2, world_point: Vector2) -> bool:
	return hit_rect.size.x > 0.0 and hit_rect.size.y > 0.0 and hit_rect.has_point(world_point)


static func _panel_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.035, 0.065, 0.06, 0.94)
	style.border_color = Color(0.82, 0.64, 0.30, 0.92)
	style.set_border_width_all(2)
	style.set_corner_radius_all(8)
	style.content_margin_left = 16
	style.content_margin_right = 16
	style.content_margin_top = 8
	style.content_margin_bottom = 8
	return style
