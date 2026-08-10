extends PanelContainer
class_name QuestAwakenedPanel

const BackpackAwakenedVisualSkin := preload(
	"res://scripts/ui/backpack_awakened_visual_skin.gd"
)
const PetManagementVisualSkin := preload(
	"res://scripts/ui/pet_management_visual_skin.gd"
)
const BACKDROP_TEXTURE := preload(
	"res://assets/ui/pet_codex_awakened_v1/runtime/pet_codex_backdrop_1280x720.png"
)
const HEADER_ICON_TEXTURE := preload(
	"res://assets/ui/world_hud_awakened_v1/runtime/icons/top_classic.png"
)
const QUEST_ICON_TEXTURE := preload(
	"res://assets/ui/world_hud_awakened_v1/runtime/icons/top_quest.png"
)

signal close_requested
signal quest_selected(quest_id: String)

const CANVAS_SIZE := Vector2(1280.0, 720.0)
const COLOR_CREAM := Color(0.96, 0.91, 0.78, 1.0)
const COLOR_MUTED := Color(0.72, 0.68, 0.58, 1.0)
const COLOR_GOLD := Color(1.0, 0.72, 0.24, 1.0)
const COLOR_GREEN := Color(0.58, 0.89, 0.30, 1.0)
const COLOR_DARK := Color(0.24, 0.15, 0.08, 1.0)
const COLOR_MAIN := Color(1.0, 0.84, 0.35, 1.0)
const COLOR_CLASSIC := Color(0.50, 0.91, 0.34, 1.0)
const COLOR_EXPERIENCE := Color(0.25, 0.85, 0.94, 1.0)
const COLOR_SIDE := Color(0.77, 0.56, 0.94, 1.0)

# Stable semantic controls used by the existing host coordinator and checks.
var close_button: Button
var legacy_title_label: Label
var legacy_detail_label: Label
var reward_choice_option: OptionButton
var claim_button: Button
var route_button: Button
var catalog_container: VBoxContainer

var _built := false
var _canvas: Control
var _view_state: Dictionary = {}
var _selected_quest_id := ""
var _catalog_buttons: Dictionary = {}
var _detail_title_label: Label
var _detail_category_label: Label
var _detail_description_label: Label
var _detail_objective_label: Label
var _detail_meta_label: Label
var _reward_text_label: Label
var _reward_container: HBoxContainer
var _empty_reward_label: Label
var _help_button: Button
var _help_overlay: PanelContainer


func _ready() -> void:
	_ensure_built()


func is_awakened_quest_panel() -> bool:
	return true


func prepare_open(preferred_quest_id: String = "") -> void:
	_selected_quest_id = preferred_quest_id.strip_edges()


func selected_quest_id() -> String:
	return _selected_quest_id


func catalog_button_count() -> int:
	return _catalog_buttons.size()


func catalog_button(quest_id: String) -> Button:
	return _catalog_buttons.get(quest_id) as Button


func reward_card_count() -> int:
	return _reward_container.get_child_count() if _reward_container != null else 0


func displayed_title() -> String:
	return _detail_title_label.text if _detail_title_label != null else ""


func help_is_visible() -> bool:
	return _help_overlay != null and _help_overlay.visible


func apply_view_state(state: Dictionary) -> void:
	_ensure_built()
	_view_state = state.duplicate(true)
	var resolved_id := str(state.get("selectedQuestId", "")).strip_edges()
	if resolved_id != "":
		_selected_quest_id = resolved_id
	_populate_catalog(_dictionary_array(state.get("catalog", [])))
	var detail_value = state.get("detail", {})
	var detail := detail_value as Dictionary if detail_value is Dictionary else {}
	_apply_detail(detail)


func _ensure_built() -> void:
	if _built:
		return
	_built = true
	name = "QuestAwakenedPanel"
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	custom_minimum_size = CANVAS_SIZE
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_ALL
	add_theme_stylebox_override(
		"panel",
		PetManagementVisualSkin.transparent_panel_style()
	)

	_canvas = Control.new()
	_canvas.name = "QuestCanvas"
	_canvas.anchor_left = 0.5
	_canvas.anchor_top = 0.5
	_canvas.anchor_right = 0.5
	_canvas.anchor_bottom = 0.5
	_canvas.offset_left = -640.0
	_canvas.offset_top = -360.0
	_canvas.offset_right = 640.0
	_canvas.offset_bottom = 360.0
	_canvas.custom_minimum_size = CANVAS_SIZE
	_canvas.clip_contents = true
	_canvas.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_canvas)
	_add_backdrop()
	_build_header()
	_build_catalog()
	_build_detail()
	_build_help_overlay()
	_build_legacy_compatibility_labels()


func _add_backdrop() -> void:
	var backdrop := TextureRect.new()
	backdrop.name = "QuestBackdrop"
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	backdrop.texture = BACKDROP_TEXTURE
	backdrop.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	backdrop.stretch_mode = TextureRect.STRETCH_SCALE
	backdrop.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(backdrop)


func _build_header() -> void:
	var icon := TextureRect.new()
	icon.name = "QuestHeaderIcon"
	icon.position = Vector2(27.0, 8.0)
	icon.size = Vector2(42.0, 42.0)
	icon.texture = HEADER_ICON_TEXTURE
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(icon)

	var title := Label.new()
	title.name = "PanelTitle"
	title.text = "经典任务"
	title.position = Vector2(73.0, 4.0)
	title.size = Vector2(150.0, 54.0)
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	PetManagementVisualSkin.apply_title(title, 29)
	_canvas.add_child(title)

	_help_button = Button.new()
	_help_button.name = "QuestHelpButton"
	_help_button.position = Vector2(224.0, 15.0)
	_help_button.size = Vector2(29.0, 29.0)
	_help_button.tooltip_text = "查看任务目录说明"
	PetManagementVisualSkin.apply_help_button(_help_button)
	_help_button.toggled.connect(_on_help_toggled)
	_canvas.add_child(_help_button)

	close_button = Button.new()
	close_button.name = "QuestCloseButton"
	close_button.position = Vector2(1202.0, 4.0)
	close_button.size = Vector2(58.0, 50.0)
	close_button.focus_mode = Control.FOCUS_ALL
	PetManagementVisualSkin.apply_close_button(close_button)
	close_button.pressed.connect(func() -> void:
		close_requested.emit()
	)
	_canvas.add_child(close_button)


func _build_catalog() -> void:
	var shell := PanelContainer.new()
	shell.name = "QuestCatalogShell"
	shell.position = Vector2(82.0, 96.0)
	shell.size = Vector2(282.0, 576.0)
	shell.add_theme_stylebox_override(
		"panel",
		PetManagementVisualSkin.transparent_panel_style()
	)
	_canvas.add_child(shell)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 7)
	shell.add_child(_with_margin(column, 8, 7, 8, 8))

	var heading := Label.new()
	heading.text = "任务目录"
	heading.custom_minimum_size = Vector2(0.0, 45.0)
	heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	heading.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_apply_display_label(heading, 21, COLOR_DARK)
	heading.add_theme_stylebox_override("normal", _parchment_header_style())
	column.add_child(heading)

	var scroll := ScrollContainer.new()
	scroll.name = "QuestCatalogScroll"
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	scroll.mouse_filter = Control.MOUSE_FILTER_STOP
	column.add_child(scroll)

	catalog_container = VBoxContainer.new()
	catalog_container.name = "QuestCatalog"
	catalog_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	catalog_container.add_theme_constant_override("separation", 5)
	scroll.add_child(catalog_container)

	var footer := Label.new()
	footer.text = "选择任务查看介绍与奖励"
	footer.custom_minimum_size = Vector2(0.0, 35.0)
	footer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	footer.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_apply_body_label(footer, 13, COLOR_MUTED)
	column.add_child(footer)


func _build_detail() -> void:
	var frame := PanelContainer.new()
	frame.name = "QuestDetailFrame"
	frame.position = Vector2(382.0, 96.0)
	frame.size = Vector2(806.0, 576.0)
	frame.add_theme_stylebox_override(
		"panel",
		PetManagementVisualSkin.transparent_panel_style()
	)
	_canvas.add_child(frame)

	var content := Control.new()
	content.name = "QuestDetailContent"
	content.mouse_filter = Control.MOUSE_FILTER_PASS
	frame.add_child(content)

	_detail_category_label = Label.new()
	_detail_category_label.name = "SelectedQuestCategory"
	_detail_category_label.position = Vector2(26.0, 14.0)
	_detail_category_label.size = Vector2(92.0, 31.0)
	_detail_category_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_detail_category_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_apply_body_label(_detail_category_label, 15, COLOR_MAIN)
	_detail_category_label.add_theme_stylebox_override(
		"normal",
		_category_chip_style(COLOR_MAIN)
	)
	content.add_child(_detail_category_label)

	_detail_title_label = Label.new()
	_detail_title_label.name = "SelectedQuestTitle"
	_detail_title_label.position = Vector2(128.0, 8.0)
	_detail_title_label.size = Vector2(530.0, 43.0)
	_detail_title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_detail_title_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_apply_display_label(_detail_title_label, 24, COLOR_CREAM)
	content.add_child(_detail_title_label)

	var intro_panel := PanelContainer.new()
	intro_panel.name = "QuestIntroduction"
	intro_panel.position = Vector2(22.0, 62.0)
	intro_panel.size = Vector2(760.0, 204.0)
	intro_panel.add_theme_stylebox_override(
		"panel",
		PetManagementVisualSkin.dark_inset_style(0.34, 8)
	)
	content.add_child(intro_panel)

	var intro_column := VBoxContainer.new()
	intro_column.add_theme_constant_override("separation", 9)
	intro_panel.add_child(_with_margin(intro_column, 28, 22, 28, 18))

	_detail_description_label = Label.new()
	_detail_description_label.name = "QuestDescription"
	_detail_description_label.custom_minimum_size = Vector2(0.0, 76.0)
	_detail_description_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_detail_description_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_detail_description_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_detail_description_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_apply_body_label(_detail_description_label, 18, COLOR_CREAM)
	intro_column.add_child(_detail_description_label)

	_detail_objective_label = Label.new()
	_detail_objective_label.name = "QuestObjective"
	_detail_objective_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_detail_objective_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_apply_body_label(_detail_objective_label, 15, COLOR_GOLD)
	intro_column.add_child(_detail_objective_label)

	_detail_meta_label = Label.new()
	_detail_meta_label.name = "QuestMeta"
	_detail_meta_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_apply_body_label(_detail_meta_label, 13, COLOR_MUTED)
	intro_column.add_child(_detail_meta_label)

	var reward_title := Label.new()
	reward_title.text = "奖励预览"
	reward_title.position = Vector2(22.0, 280.0)
	reward_title.size = Vector2(760.0, 35.0)
	reward_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	reward_title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_apply_display_label(reward_title, 18, COLOR_CREAM)
	content.add_child(reward_title)

	var reward_scroll := ScrollContainer.new()
	reward_scroll.name = "QuestRewardScroll"
	reward_scroll.position = Vector2(62.0, 318.0)
	reward_scroll.size = Vector2(680.0, 126.0)
	reward_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	reward_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	reward_scroll.mouse_filter = Control.MOUSE_FILTER_STOP
	content.add_child(reward_scroll)

	_reward_container = HBoxContainer.new()
	_reward_container.name = "QuestRewards"
	_reward_container.custom_minimum_size = Vector2(680.0, 0.0)
	_reward_container.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_reward_container.alignment = BoxContainer.ALIGNMENT_CENTER
	_reward_container.add_theme_constant_override("separation", 12)
	reward_scroll.add_child(_reward_container)

	_empty_reward_label = Label.new()
	_empty_reward_label.text = "本任务没有额外物品奖励"
	_empty_reward_label.custom_minimum_size = Vector2(680.0, 112.0)
	_empty_reward_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_empty_reward_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_apply_body_label(_empty_reward_label, 15, COLOR_MUTED)
	_reward_container.add_child(_empty_reward_label)

	_reward_text_label = Label.new()
	_reward_text_label.name = "QuestRewardText"
	_reward_text_label.position = Vector2(30.0, 443.0)
	_reward_text_label.size = Vector2(744.0, 28.0)
	_reward_text_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_reward_text_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_apply_body_label(_reward_text_label, 13, COLOR_MUTED)
	content.add_child(_reward_text_label)

	reward_choice_option = OptionButton.new()
	reward_choice_option.name = "QuestRewardChoiceOption"
	reward_choice_option.position = Vector2(201.0, 469.0)
	reward_choice_option.size = Vector2(400.0, 34.0)
	reward_choice_option.visible = false
	PetManagementVisualSkin.apply_option_button(reward_choice_option)
	content.add_child(reward_choice_option)

	route_button = Button.new()
	route_button.name = "QuestRouteButton"
	route_button.text = "立即前往"
	route_button.position = Vector2(185.0, 508.0)
	route_button.size = Vector2(190.0, 52.0)
	PetManagementVisualSkin.apply_action_button(route_button)
	content.add_child(route_button)

	claim_button = Button.new()
	claim_button.name = "QuestClaimButton"
	claim_button.text = "领取奖励"
	claim_button.position = Vector2(430.0, 508.0)
	claim_button.size = Vector2(190.0, 52.0)
	claim_button.visible = false
	PetManagementVisualSkin.apply_action_button(claim_button)
	content.add_child(claim_button)


func _build_help_overlay() -> void:
	_help_overlay = PanelContainer.new()
	_help_overlay.name = "QuestHelpOverlay"
	_help_overlay.position = Vector2(374.0, 180.0)
	_help_overlay.size = Vector2(532.0, 318.0)
	_help_overlay.visible = false
	_help_overlay.z_index = 8
	_help_overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	_help_overlay.add_theme_stylebox_override(
		"panel",
		BackpackAwakenedVisualSkin.detail_panel_style(COLOR_GOLD)
	)
	_canvas.add_child(_help_overlay)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 14)
	_help_overlay.add_child(_with_margin(column, 30, 24, 30, 24))

	var title := Label.new()
	title.text = "任务目录说明"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_apply_display_label(title, 23, COLOR_CREAM)
	column.add_child(title)

	var body := Label.new()
	body.text = (
		"左侧目录会同时列出主线、经典、经验和支线任务。\n\n"
		+ "选择任意任务可查看背景、目标、进度与奖励；“立即前往”会按当前地图自动寻路。\n\n"
		+ "只有服务器确认任务完成后，才会出现“领取奖励”。"
	)
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_apply_body_label(body, 16, COLOR_CREAM)
	column.add_child(body)

	var confirm := Button.new()
	confirm.text = "我知道了"
	confirm.custom_minimum_size = Vector2(0.0, 48.0)
	PetManagementVisualSkin.apply_action_button(confirm)
	confirm.pressed.connect(func() -> void:
		_help_button.set_pressed_no_signal(false)
		_help_overlay.visible = false
	)
	column.add_child(confirm)


func _build_legacy_compatibility_labels() -> void:
	legacy_title_label = Label.new()
	legacy_title_label.name = "QuestLegacyTitleLabel"
	legacy_title_label.visible = false
	legacy_title_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(legacy_title_label)

	legacy_detail_label = Label.new()
	legacy_detail_label.name = "QuestLegacyDetailLabel"
	legacy_detail_label.visible = false
	legacy_detail_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(legacy_detail_label)


func _populate_catalog(rows: Array[Dictionary]) -> void:
	for child in catalog_container.get_children():
		catalog_container.remove_child(child)
		child.queue_free()
	_catalog_buttons.clear()
	for row in rows:
		var quest_id := str(row.get("questId", ""))
		if quest_id == "":
			continue
		var selected := quest_id == _selected_quest_id
		var button := Button.new()
		button.name = "QuestCatalog_%s" % quest_id
		button.text = ""
		button.toggle_mode = true
		button.action_mode = BaseButton.ACTION_MODE_BUTTON_RELEASE
		button.custom_minimum_size = Vector2(244.0, 68.0)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		PetManagementVisualSkin.apply_tab_button(button)
		button.custom_minimum_size = Vector2(244.0, 68.0)
		button.set_pressed_no_signal(selected)
		button.pressed.connect(func() -> void:
			_select_catalog_quest(quest_id)
		)
		catalog_container.add_child(button)
		_catalog_buttons[quest_id] = button

		var labels := VBoxContainer.new()
		labels.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		labels.offset_left = 14.0
		labels.offset_top = 8.0
		labels.offset_right = -14.0
		labels.offset_bottom = -7.0
		labels.mouse_filter = Control.MOUSE_FILTER_IGNORE
		labels.add_theme_constant_override("separation", 1)
		button.add_child(labels)

		var title := Label.new()
		title.text = "[%s] %s" % [
			str(row.get("categoryLabel", "主线")),
			str(row.get("title", "任务")),
		]
		title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		_apply_display_label(title, 16, COLOR_DARK)
		labels.add_child(title)

		var status := Label.new()
		status.text = str(row.get("statusText", ""))
		status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		status.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		_apply_body_label(status, 13, _catalog_status_color(row))
		labels.add_child(status)


func _apply_detail(detail: Dictionary) -> void:
	var category_id := str(detail.get("categoryId", "main"))
	var category_color := _category_color(category_id)
	_detail_category_label.text = str(detail.get("categoryLabel", "主线"))
	_detail_category_label.add_theme_color_override("font_color", category_color)
	_detail_category_label.add_theme_stylebox_override(
		"normal",
		_category_chip_style(category_color)
	)
	_detail_title_label.text = str(detail.get("title", "暂无任务"))
	_detail_description_label.text = str(detail.get("description", ""))
	_detail_objective_label.text = "目标：%s" % str(
		detail.get("objectiveText", "继续探索世界")
	)
	var meta_parts: Array[String] = []
	var status_text := str(detail.get("statusText", ""))
	if status_text != "":
		meta_parts.append(status_text)
	var progress_text := str(detail.get("progressText", ""))
	if progress_text != "":
		meta_parts.append(progress_text)
	var level_text := str(detail.get("levelText", ""))
	if level_text != "":
		meta_parts.append(level_text)
	_detail_meta_label.text = "  ·  ".join(meta_parts)
	_reward_text_label.text = str(detail.get("rewardText", ""))
	_populate_rewards(_dictionary_array(detail.get("rewardEntries", [])))
	route_button.text = str(detail.get("routeButtonText", "立即前往"))
	route_button.disabled = not bool(
		detail.get("routeEnabled", detail.get("routeAllowedByState", false))
	)
	claim_button.visible = bool(detail.get("claimVisible", false))
	legacy_title_label.text = str(detail.get("legacyTitle", "任务"))
	legacy_detail_label.text = str(detail.get("legacyDetail", ""))


func _populate_rewards(entries: Array[Dictionary]) -> void:
	for child in _reward_container.get_children():
		_reward_container.remove_child(child)
		child.queue_free()
	if entries.is_empty():
		_empty_reward_label = Label.new()
		_empty_reward_label.text = "本任务没有额外物品奖励"
		_empty_reward_label.custom_minimum_size = Vector2(680.0, 112.0)
		_empty_reward_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_empty_reward_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		_apply_body_label(_empty_reward_label, 15, COLOR_MUTED)
		_reward_container.add_child(_empty_reward_label)
		return
	for entry in entries:
		_reward_container.add_child(_reward_card(entry))


func _reward_card(entry: Dictionary) -> Control:
	var card := PanelContainer.new()
	card.custom_minimum_size = Vector2(94.0, 116.0)
	card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.add_theme_stylebox_override(
		"panel",
		BackpackAwakenedVisualSkin.detail_panel_style(COLOR_GOLD)
	)
	var content := Control.new()
	card.add_child(content)

	var icon := TextureRect.new()
	icon.position = Vector2(16.0, 8.0)
	icon.size = Vector2(62.0, 62.0)
	icon.texture = _reward_texture(entry)
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	content.add_child(icon)

	var count := Label.new()
	count.position = Vector2(7.0, 52.0)
	count.size = Vector2(78.0, 23.0)
	count.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	count.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
	count.text = (
		str(maxi(1, int(entry.get("count", 1))))
		if str(entry.get("kind", "")) == "currency"
		else "x%d" % maxi(1, int(entry.get("count", 1)))
	)
	_apply_display_label(count, 13, COLOR_CREAM)
	content.add_child(count)

	var label := Label.new()
	label.position = Vector2(6.0, 78.0)
	label.size = Vector2(82.0, 30.0)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	label.text = str(entry.get("label", "奖励"))
	_apply_body_label(label, 12, COLOR_CREAM)
	content.add_child(label)
	card.tooltip_text = "%s x%d" % [
		str(entry.get("label", "奖励")),
		maxi(1, int(entry.get("count", 1))),
	]
	return card


func _reward_texture(entry: Dictionary) -> Texture2D:
	match str(entry.get("kind", "")):
		"currency":
			return BackpackAwakenedVisualSkin.currency_texture_for(
				str(entry.get("id", "stoneCoins"))
			)
		"item":
			var texture := BackpackAwakenedVisualSkin.item_texture_for(
				str(entry.get("id", ""))
			)
			return texture if texture != null else QUEST_ICON_TEXTURE
	return QUEST_ICON_TEXTURE


func _select_catalog_quest(quest_id: String) -> void:
	if quest_id == "" or quest_id == _selected_quest_id:
		return
	_selected_quest_id = quest_id
	quest_selected.emit(quest_id)


func _on_help_toggled(pressed: bool) -> void:
	_help_overlay.visible = pressed
	if pressed:
		_help_overlay.move_to_front()


func _catalog_status_color(row: Dictionary) -> Color:
	var status_id := str(row.get("displayStatusId", "locked"))
	if ["active", "accepted"].has(status_id):
		return COLOR_GREEN
	if status_id == "ready":
		return COLOR_GOLD
	if status_id == "available":
		return COLOR_CLASSIC
	return COLOR_MUTED


func _category_color(category_id: String) -> Color:
	match category_id:
		"classic":
			return COLOR_CLASSIC
		"experience":
			return COLOR_EXPERIENCE
		"side":
			return COLOR_SIDE
	return COLOR_MAIN


func _parchment_header_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.82, 0.63, 0.37, 0.96)
	style.border_color = Color(0.45, 0.27, 0.13, 0.95)
	style.set_border_width_all(2)
	style.set_corner_radius_all(5)
	return style


func _category_chip_style(accent: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.07, 0.052, 0.035, 0.92)
	style.border_color = accent.darkened(0.18)
	style.set_border_width_all(1)
	style.set_corner_radius_all(12)
	return style


func _apply_display_label(label: Label, size: int, color: Color) -> void:
	label.add_theme_font_override("font", PetManagementVisualSkin.display_font())
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	label.add_theme_color_override(
		"font_outline_color",
		Color(0.06, 0.03, 0.015, 0.86)
	)
	label.add_theme_constant_override("outline_size", 2)


func _apply_body_label(label: Label, size: int, color: Color) -> void:
	label.add_theme_font_override("font", PetManagementVisualSkin.body_font())
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	label.add_theme_color_override(
		"font_outline_color",
		Color(0.04, 0.025, 0.012, 0.80)
	)
	label.add_theme_constant_override("outline_size", 1)


func _with_margin(
	control: Control,
	left: int,
	top: int,
	right: int,
	bottom: int
) -> MarginContainer:
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", left)
	margin.add_theme_constant_override("margin_top", top)
	margin.add_theme_constant_override("margin_right", right)
	margin.add_theme_constant_override("margin_bottom", bottom)
	margin.add_child(control)
	return margin


func _dictionary_array(value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if value is Array:
		for entry in value as Array:
			if entry is Dictionary:
				result.append((entry as Dictionary).duplicate(true))
	return result
