extends Control

const BattleActionCatalog := preload(
	"res://scripts/battle/battle_action_catalog.gd"
)
const PetFusionClientModel := preload(
	"res://scripts/progression/pet_fusion_client_model.gd"
)
const PetFusionPresentationModel := preload(
	"res://scripts/progression/pet_fusion_presentation_model.gd"
)
const PetFusionRecipeCatalogModel := preload(
	"res://scripts/progression/pet_fusion_recipe_catalog_model.gd"
)
const PetFusionSelectionModel := preload(
	"res://scripts/progression/pet_fusion_selection_model.gd"
)
const PetManagementVisualSkin := preload(
	"res://scripts/ui/pet_management_visual_skin.gd"
)
const PetPortraitArtCatalog := preload(
	"res://scripts/ui/pet_portrait_art_catalog.gd"
)
const PetSkillVisualSkin := preload(
	"res://scripts/ui/pet_skill_visual_skin.gd"
)

const QA_PREVIEW_TOKEN := "pet_fusion_capture_fixture_v1"
const VIEWPORT_SIZE := Vector2(1280.0, 720.0)
const ROLE_IDS := PetFusionRecipeCatalogModel.ROLE_IDS
const CLOSED_MESSAGE := PetFusionSelectionModel.CLOSED_MESSAGE

var _catalog_document: Dictionary = {}
var _selection: Dictionary = {}
var _selection_state: Dictionary = {}
var _quote: Dictionary = {}
var _candidate_pets: Array[Dictionary] = []
var _qa_preview := false
var _preview_fixture_valid := false
var _focused_role_id := "core"
var _armed_fingerprint := ""
var _second_confirmation_count := 0

var _status_banner: Label
var _preview_badge: Label
var _target_name_label: Label
var _target_route_label: Label
var _target_portrait: TextureRect
var _target_placeholder: Label
var _target_portrait_status := "none"
var _target_portrait_frame: PanelContainer
var _confirm_button: Button
var _confirm_status_label: Label
var _authority_label: Label
var _base_skill_buttons: Array[Button] = []
var _special_source_labels: Array[Label] = []
var _special_skill_labels: Array[Label] = []
var _special_chance_labels: Array[Label] = []
var _passive_summary_label: Label
var _numeric_rule_label: Label
var _binding_rule_label: Label
var _cost_rule_label: Label
var _terminal_rule_label: Label
var _material_slots: Dictionary = {}
var _candidate_buttons: Array[Button] = []
var _candidate_formal_portrait_count := 0
var _candidate_placeholder_count := 0
var _candidate_row: HBoxContainer


func _init() -> void:
	name = "PetFusionPanel"
	custom_minimum_size = VIEWPORT_SIZE
	size = VIEWPORT_SIZE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	clip_contents = true
	_build_ui()


func configure_closed(
	catalog_document,
	candidate_pets: Array[Dictionary] = []
) -> void:
	_catalog_document = (
		(catalog_document as Dictionary).duplicate(true)
		if catalog_document is Dictionary
		else {}
	)
	_selection = {}
	_selection_state = PetFusionSelectionModel.selection_state(
		{},
		_catalog_document
	)
	_quote = {}
	_candidate_pets = _duplicate_pet_array(candidate_pets)
	_qa_preview = false
	_preview_fixture_valid = false
	_armed_fingerprint = ""
	_second_confirmation_count = 0
	_focused_role_id = "core"
	_rebuild_candidate_bar()
	_refresh()


func configure_qa_preview(
	preview_token: String,
	catalog_document,
	selected_by_role,
	quote_value,
	candidate_pets: Array[Dictionary]
) -> bool:
	if (
		preview_token != QA_PREVIEW_TOKEN
		or not (catalog_document is Dictionary)
		or not PetFusionRecipeCatalogModel.runtime_available(catalog_document)
		or not (selected_by_role is Dictionary)
	):
		configure_closed(catalog_document, candidate_pets)
		return false
	var catalog := (catalog_document as Dictionary).duplicate(true)
	var selections := (selected_by_role as Dictionary).duplicate(true)
	var selection_state := PetFusionSelectionModel.selection_state(
		selections,
		catalog
	)
	var quote := PetFusionClientModel.normalized_quote(
		quote_value,
		catalog
	)
	if (
		not bool(selection_state.get("readyForQuoteHint", false))
		or quote.is_empty()
		or not PetFusionClientModel.quote_matches_material_selection(
			quote,
			str(selection_state.get("resolvedRecipeId", "")),
			selection_state.get("materialInstanceIds", {}),
			catalog
		)
	):
		configure_closed(catalog_document, candidate_pets)
		return false
	_catalog_document = catalog
	_selection = selections
	_selection_state = selection_state
	_quote = quote
	_candidate_pets = _duplicate_pet_array(candidate_pets)
	_qa_preview = true
	_preview_fixture_valid = true
	_armed_fingerprint = ""
	_second_confirmation_count = 0
	_focused_role_id = "core"
	_rebuild_candidate_bar()
	_refresh()
	return true


func snapshot() -> Dictionary:
	var material_disabled_count := 0
	for role_id in ROLE_IDS:
		var slot := _material_slots.get(role_id, {}) as Dictionary
		var button := slot.get("button") as Button
		if button != null and button.disabled:
			material_disabled_count += 1
	var candidate_disabled_count := 0
	for button in _candidate_buttons:
		if button.disabled:
			candidate_disabled_count += 1
	var special_skill_texts: Array[String] = []
	var special_chance_texts: Array[String] = []
	for index in range(_special_skill_labels.size()):
		special_skill_texts.append(_special_skill_labels[index].text)
		special_chance_texts.append(_special_chance_labels[index].text)
	return {
		"visible": visible,
		"closed": not _qa_preview,
		"previewFixtureValid": _preview_fixture_valid,
		"messageText": _status_banner.text if _status_banner != null else "",
		"materialSlotCount": _material_slots.size(),
		"materialDisabledCount": material_disabled_count,
		"candidateCount": _candidate_buttons.size(),
		"candidateDisabledCount": candidate_disabled_count,
		"candidateFormalPortraitCount": _candidate_formal_portrait_count,
		"candidatePlaceholderCount": _candidate_placeholder_count,
		"targetPortraitStatus": _target_portrait_status,
		"targetNameText": (
			_target_name_label.text
			if _target_name_label != null
			else ""
		),
		"baseSkillTexts": [
			_base_skill_buttons[0].text,
			_base_skill_buttons[1].text,
		],
		"specialSkillTexts": special_skill_texts,
		"specialChanceTexts": special_chance_texts,
		"passiveRuleText": _passive_summary_label.text,
		"numericRuleText": _numeric_rule_label.text,
		"bindingRuleText": _binding_rule_label.text,
		"costRuleText": _cost_rule_label.text,
		"terminalRuleText": _terminal_rule_label.text,
		"quoteValid": not _quote.is_empty(),
		"confirmationArmed": _confirmation_armed(),
		"confirmDisabled": (
			_confirm_button.disabled
			if _confirm_button != null
			else true
		),
		"buttonText": _confirm_button.text if _confirm_button != null else "",
		"secondConfirmationCount": _second_confirmation_count,
		"networkRequestCount": 0,
		"authorityText": (
			_authority_label.text
			if _authority_label != null
			else ""
		),
		"visibleText": visible_text(),
	}


func visible_text() -> String:
	var texts: Array[String] = []
	_collect_visible_text(self, texts)
	return "\n".join(texts)


func reset_confirmation() -> void:
	_armed_fingerprint = ""
	_second_confirmation_count = 0
	_refresh()


func _build_ui() -> void:
	PetManagementVisualSkin.add_backdrop(self)
	_build_header()
	_build_status_banner()
	_build_material_slots()
	_build_target_preview()
	_build_rules_panel()
	_build_step_rail()
	_build_candidate_bar()


func _build_header() -> void:
	var paw := TextureRect.new()
	paw.name = "HeaderPaw"
	paw.texture = PetManagementVisualSkin.HEADER_PAW_TEXTURE
	paw.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	paw.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	paw.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(paw)
	_place(paw, Rect2(34.0, 8.0, 42.0, 36.0))

	var title := _label("宠物融合", 27, PetManagementVisualSkin.CREAM_TEXT)
	title.name = "Title"
	PetManagementVisualSkin.apply_title(title, 27)
	add_child(title)
	_place(title, Rect2(78.0, 5.0, 260.0, 42.0))

	var stage := _label(
		"2转 / 进化 / 融合",
		14,
		PetManagementVisualSkin.MUTED_TEXT,
		HORIZONTAL_ALIGNMENT_CENTER
	)
	stage.name = "TerminalStage"
	stage.add_theme_stylebox_override(
		"normal",
		_pill_style(Color(0.64, 0.35, 0.18, 0.82))
	)
	add_child(stage)
	_place(stage, Rect2(302.0, 10.0, 170.0, 30.0))

	_preview_badge = _label(
		"",
		13,
		PetManagementVisualSkin.GOLD_TEXT,
		HORIZONTAL_ALIGNMENT_CENTER
	)
	_preview_badge.name = "PreviewBadge"
	_preview_badge.add_theme_stylebox_override(
		"normal",
		_pill_style(Color(0.19, 0.36, 0.25, 0.88))
	)
	add_child(_preview_badge)
	_place(_preview_badge, Rect2(980.0, 10.0, 190.0, 30.0))

	var close_button := Button.new()
	close_button.name = "CloseButton"
	PetManagementVisualSkin.apply_close_button(close_button)
	close_button.pressed.connect(func() -> void: visible = false)
	add_child(close_button)
	_place(close_button, Rect2(1190.0, 2.0, 62.0, 48.0))


func _build_status_banner() -> void:
	_status_banner = _label(
		CLOSED_MESSAGE,
		15,
		PetManagementVisualSkin.CREAM_TEXT,
		HORIZONTAL_ALIGNMENT_CENTER
	)
	_status_banner.name = "StatusBanner"
	_status_banner.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_status_banner.add_theme_stylebox_override(
		"normal",
		_notice_style(Color(0.60, 0.35, 0.16, 0.72))
	)
	add_child(_status_banner)
	_place(_status_banner, Rect2(46.0, 58.0, 532.0, 40.0))


func _build_material_slots() -> void:
	var heading := _label("三只一转材料宠", 20, PetManagementVisualSkin.GOLD_TEXT)
	heading.name = "MaterialHeading"
	add_child(heading)
	_place(heading, Rect2(46.0, 102.0, 300.0, 30.0))

	for index in range(ROLE_IDS.size()):
		var role_id := ROLE_IDS[index]
		var button := Button.new()
		button.name = "MaterialSlot%d" % (index + 1)
		button.focus_mode = Control.FOCUS_ALL
		button.disabled = true
		PetSkillVisualSkin.apply_card_button(
			button,
			"active",
			index == 0,
			true
		)
		button.pressed.connect(_material_slot_pressed.bind(role_id))
		add_child(button)
		_place(
			button,
			Rect2(46.0 + 178.0 * float(index), 137.0, 166.0, 110.0)
		)

		var content := VBoxContainer.new()
		content.mouse_filter = Control.MOUSE_FILTER_IGNORE
		content.add_theme_constant_override("separation", 1)
		button.add_child(content)
		content.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		content.offset_left = 7.0
		content.offset_top = 5.0
		content.offset_right = -7.0
		content.offset_bottom = -5.0

		var row := HBoxContainer.new()
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_theme_constant_override("separation", 6)
		content.add_child(row)
		var portrait_frame := PanelContainer.new()
		portrait_frame.custom_minimum_size = Vector2(62.0, 62.0)
		portrait_frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
		portrait_frame.add_theme_stylebox_override(
			"panel",
			PetSkillVisualSkin.icon_frame_style("active", index == 0, true)
		)
		row.add_child(portrait_frame)
		var portrait := TextureRect.new()
		portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		portrait.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
		portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
		portrait_frame.add_child(portrait)
		var placeholder := _label(
			"未选",
			13,
			PetManagementVisualSkin.MUTED_TEXT,
			HORIZONTAL_ALIGNMENT_CENTER
		)
		placeholder.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		placeholder.mouse_filter = Control.MOUSE_FILTER_IGNORE
		portrait_frame.add_child(placeholder)

		var identity := VBoxContainer.new()
		identity.mouse_filter = Control.MOUSE_FILTER_IGNORE
		identity.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		identity.add_theme_constant_override("separation", 1)
		row.add_child(identity)
		var role_label := _label(
			PetFusionSelectionModel.role_label(role_id),
			14,
			PetManagementVisualSkin.GOLD_TEXT
		)
		identity.add_child(role_label)
		var name_label := _label(
			"尚未选择",
			13,
			PetManagementVisualSkin.CREAM_TEXT
		)
		name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		identity.add_child(name_label)
		var level_label := _label(
			"",
			12,
			PetManagementVisualSkin.MUTED_TEXT
		)
		identity.add_child(level_label)
		var status_label := _label(
			"尚未开放",
			11,
			PetManagementVisualSkin.MUTED_TEXT,
			HORIZONTAL_ALIGNMENT_CENTER
		)
		status_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		content.add_child(status_label)
		_material_slots[role_id] = {
			"button": button,
			"portraitFrame": portrait_frame,
			"portrait": portrait,
			"placeholder": placeholder,
			"name": name_label,
			"level": level_label,
			"status": status_label,
		}


func _build_target_preview() -> void:
	var target_heading := _label(
		"融合目标",
		19,
		PetManagementVisualSkin.GOLD_TEXT,
		HORIZONTAL_ALIGNMENT_CENTER
	)
	add_child(target_heading)
	_place(target_heading, Rect2(177.0, 258.0, 270.0, 30.0))

	_target_portrait_frame = PanelContainer.new()
	_target_portrait_frame.name = "TargetPortraitFrame"
	_target_portrait_frame.add_theme_stylebox_override(
		"panel",
		_target_frame_style(false)
	)
	add_child(_target_portrait_frame)
	_place(_target_portrait_frame, Rect2(202.0, 291.0, 220.0, 220.0))
	_target_portrait = TextureRect.new()
	_target_portrait.name = "TargetPortrait"
	_target_portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_target_portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_target_portrait.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_target_portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_target_portrait_frame.add_child(_target_portrait)
	_target_placeholder = _label(
		"融合目标\n尚未开放",
		18,
		PetManagementVisualSkin.MUTED_TEXT,
		HORIZONTAL_ALIGNMENT_CENTER
	)
	_target_placeholder.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_target_placeholder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_target_portrait_frame.add_child(_target_placeholder)

	_target_name_label = _label(
		"目标待开放",
		23,
		PetManagementVisualSkin.CREAM_TEXT,
		HORIZONTAL_ALIGNMENT_CENTER
	)
	_target_name_label.name = "TargetName"
	PetManagementVisualSkin.apply_title(_target_name_label, 23)
	add_child(_target_name_label)
	_place(_target_name_label, Rect2(135.0, 518.0, 354.0, 38.0))
	_target_route_label = _label(
		"当前不会消耗宠物",
		13,
		PetManagementVisualSkin.MUTED_TEXT,
		HORIZONTAL_ALIGNMENT_CENTER
	)
	_target_route_label.name = "TargetRoute"
	add_child(_target_route_label)
	_place(_target_route_label, Rect2(135.0, 552.0, 354.0, 28.0))


func _build_rules_panel() -> void:
	var rules := VBoxContainer.new()
	rules.name = "RulesPanel"
	rules.add_theme_constant_override("separation", 5)
	rules.clip_contents = true
	add_child(rules)
	_place(rules, Rect2(640.0, 91.0, 421.0, 485.0))

	var title := _label(
		"遗传与终局规则",
		24,
		PetManagementVisualSkin.CREAM_TEXT,
		HORIZONTAL_ALIGNMENT_CENTER
	)
	PetManagementVisualSkin.apply_title(title, 24)
	title.custom_minimum_size.y = 36.0
	rules.add_child(title)

	var base_title := _label(
		"固定主动技能（普通/训练主动不遗传）",
		14,
		PetManagementVisualSkin.GOLD_TEXT
	)
	rules.add_child(base_title)
	var base_row := HBoxContainer.new()
	base_row.add_theme_constant_override("separation", 8)
	rules.add_child(base_row)
	for base_text in ["攻击", "防御"]:
		var button := Button.new()
		button.text = base_text
		button.disabled = true
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		PetManagementVisualSkin.apply_action_button(button, true)
		button.add_theme_color_override(
			"font_disabled_color",
			PetManagementVisualSkin.CREAM_TEXT
		)
		base_row.add_child(button)
		_base_skill_buttons.append(button)

	var active_title := _label(
		"血脉特殊主动・各50%（遗忘也可遗传）",
		14,
		PetManagementVisualSkin.GOLD_TEXT
	)
	rules.add_child(active_title)
	for index in range(3):
		var row_panel := PanelContainer.new()
		row_panel.custom_minimum_size.y = 36.0
		row_panel.add_theme_stylebox_override(
			"panel",
			PetSkillVisualSkin.detail_style("active", false)
		)
		rules.add_child(row_panel)
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 6)
		row_panel.add_child(row)
		var source := _label(
			PetFusionSelectionModel.role_label(ROLE_IDS[index]),
			12,
			PetManagementVisualSkin.MUTED_TEXT
		)
		source.custom_minimum_size.x = 82.0
		row.add_child(source)
		var skill := _label(
			"血脉特殊主动",
			13,
			PetManagementVisualSkin.CREAM_TEXT
		)
		skill.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(skill)
		var chance := _label(
			"50%",
			14,
			PetManagementVisualSkin.GOLD_TEXT,
			HORIZONTAL_ALIGNMENT_RIGHT
		)
		chance.custom_minimum_size.x = 54.0
		row.add_child(chance)
		_special_source_labels.append(source)
		_special_skill_labels.append(skill)
		_special_chance_labels.append(chance)

	var passive_title := _label(
		"唯一被动技能",
		14,
		PetManagementVisualSkin.GOLD_TEXT
	)
	rules.add_child(passive_title)
	_passive_summary_label = _rule_box(
		"最终只保留1个：主宠40% / 共鸣宠Ⅰ30% / 共鸣宠Ⅱ30%。",
		Color(0.76, 0.63, 0.91, 1.0)
	)
	rules.add_child(_passive_summary_label.get_parent())

	_numeric_rule_label = _rule_box(
		"数值不继承：成品四维与成长按自身规则独立生成。",
		Color(0.91, 0.74, 0.43, 1.0)
	)
	rules.add_child(_numeric_rule_label.get_parent())
	_binding_rule_label = _rule_box(
		"绑定规则：任一材料绑定，成品即绑定。",
		Color(0.68, 0.84, 0.72, 1.0)
	)
	rules.add_child(_binding_rule_label.get_parent())
	_cost_rule_label = _rule_box(
		"只消耗三只材料宠，不额外消耗石币、钻石或道具。",
		Color(0.80, 0.84, 0.76, 1.0)
	)
	rules.add_child(_cost_rule_label.get_parent())
	_terminal_rule_label = _rule_box(
		"不可骑乘・终局：不能普通二转、再次进化/融合或付费重置。",
		Color(0.95, 0.60, 0.47, 1.0)
	)
	rules.add_child(_terminal_rule_label.get_parent())


func _build_step_rail() -> void:
	var rail_title := _label(
		"融合流程",
		16,
		PetManagementVisualSkin.GOLD_TEXT,
		HORIZONTAL_ALIGNMENT_CENTER
	)
	add_child(rail_title)
	_place(rail_title, Rect2(1092.0, 95.0, 148.0, 28.0))
	for index in range(3):
		var step_button := Button.new()
		step_button.text = ["1  选择三宠", "2  核对报价", "3  双重确认"][index]
		step_button.disabled = true
		PetManagementVisualSkin.apply_tab_button(step_button)
		add_child(step_button)
		_place(
			step_button,
			Rect2(1095.0, 130.0 + 61.0 * float(index), 140.0, 50.0)
		)

	var warning := _label(
		"融合成功后\n三只材料宠将永久消耗",
		13,
		Color(0.96, 0.67, 0.47, 1.0),
		HORIZONTAL_ALIGNMENT_CENTER
	)
	warning.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	warning.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	warning.add_theme_stylebox_override(
		"normal",
		_notice_style(Color(0.48, 0.16, 0.08, 0.74))
	)
	add_child(warning)
	_place(warning, Rect2(1092.0, 332.0, 148.0, 76.0))

	_confirm_status_label = _label(
		CLOSED_MESSAGE,
		12,
		PetManagementVisualSkin.MUTED_TEXT,
		HORIZONTAL_ALIGNMENT_CENTER
	)
	_confirm_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_confirm_status_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	add_child(_confirm_status_label)
	_place(_confirm_status_label, Rect2(1092.0, 417.0, 148.0, 72.0))

	_confirm_button = Button.new()
	_confirm_button.name = "ConfirmButton"
	_confirm_button.text = "融合尚未开放"
	_confirm_button.disabled = true
	_confirm_button.pressed.connect(_confirm_pressed)
	PetManagementVisualSkin.apply_action_button(_confirm_button, false)
	_confirm_button.add_theme_color_override(
		"font_disabled_color",
		Color(0.84, 0.74, 0.56, 0.92)
	)
	add_child(_confirm_button)
	_place(_confirm_button, Rect2(1092.0, 500.0, 148.0, 48.0))

	_authority_label = _label(
		"功能尚未开放；当前不会向服务器提交。",
		11,
		PetManagementVisualSkin.MUTED_TEXT,
		HORIZONTAL_ALIGNMENT_CENTER
	)
	_authority_label.name = "AuthorityText"
	_authority_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_authority_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	add_child(_authority_label)
	_place(_authority_label, Rect2(1092.0, 552.0, 148.0, 56.0))


func _build_candidate_bar() -> void:
	var title := _label(
		"候选宠",
		17,
		PetManagementVisualSkin.GOLD_TEXT,
		HORIZONTAL_ALIGNMENT_CENTER
	)
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	add_child(title)
	_place(title, Rect2(42.0, 621.0, 82.0, 66.0))

	var scroll := ScrollContainer.new()
	scroll.name = "CandidateScroll"
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(scroll)
	_place(scroll, Rect2(128.0, 619.0, 1098.0, 72.0))
	_candidate_row = HBoxContainer.new()
	_candidate_row.add_theme_constant_override("separation", 7)
	_candidate_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_candidate_row)


func _refresh() -> void:
	_preview_badge.text = (
		"体验预览・不会消耗宠物"
		if _qa_preview
		else "功能尚未开放"
	)
	_status_banner.text = (
		"体验预览：本页只演示两段确认，不会执行融合或消耗宠物。"
		if _qa_preview
		else CLOSED_MESSAGE
	)
	_status_banner.add_theme_stylebox_override(
		"normal",
		_notice_style(
			Color(0.18, 0.48, 0.30, 0.76)
			if _qa_preview
			else Color(0.60, 0.35, 0.16, 0.72)
		)
	)
	_selection_state = PetFusionSelectionModel.selection_state(
		_selection,
		_catalog_document
	)
	_refresh_material_slots()
	_refresh_candidate_buttons()
	_refresh_quote_and_target()
	queue_redraw()


func _refresh_material_slots() -> void:
	for role_id in ROLE_IDS:
		var slot := _material_slots.get(role_id, {}) as Dictionary
		var button := slot.get("button") as Button
		var portrait_frame := slot.get("portraitFrame") as PanelContainer
		var portrait := slot.get("portrait") as TextureRect
		var placeholder := slot.get("placeholder") as Label
		var name_label := slot.get("name") as Label
		var level_label := slot.get("level") as Label
		var status_label := slot.get("status") as Label
		if button == null:
			continue
		var selected := _selection.has(role_id)
		var instance := (
			_selection.get(role_id) as Dictionary
			if selected and _selection.get(role_id) is Dictionary
			else {}
		)
		button.disabled = not _qa_preview
		PetSkillVisualSkin.apply_card_button(
			button,
			"active",
			role_id == _focused_role_id,
			not selected
		)
		portrait_frame.add_theme_stylebox_override(
			"panel",
			PetSkillVisualSkin.icon_frame_style(
				"active",
				role_id == _focused_role_id,
				not selected
			)
		)
		if selected:
			var texture := PetPortraitArtCatalog.texture_for_form(
				str(instance.get("formId", ""))
			)
			portrait.texture = texture
			placeholder.visible = texture == null
			placeholder.text = "◇\n预览占位" if texture == null else ""
			name_label.text = str(instance.get("name", "宠物"))
			level_label.text = "一转 Lv%d" % int(instance.get("level", 0))
			var hint := PetFusionSelectionModel.candidate_hint(
				instance,
				role_id,
				_selection,
				_catalog_document
			)
			status_label.text = (
				"血脉条件符合"
				if bool(hint.get("eligible", false))
				else str(hint.get("reasonText", "条件不符"))
			)
		else:
			portrait.texture = null
			placeholder.visible = true
			placeholder.text = "未选"
			name_label.text = "尚未选择"
			level_label.text = ""
			status_label.text = "尚未开放" if not _qa_preview else "点击此位置后选择候选宠"


func _refresh_candidate_buttons() -> void:
	for button in _candidate_buttons:
		button.disabled = not _qa_preview or _second_confirmation_count > 0


func _refresh_quote_and_target() -> void:
	var quote_matches := (
		_qa_preview
		and not _quote.is_empty()
		and bool(_selection_state.get("readyForQuoteHint", false))
		and PetFusionClientModel.quote_matches_material_selection(
			_quote,
			str(_selection_state.get("resolvedRecipeId", "")),
			_selection_state.get("materialInstanceIds", {}),
			_catalog_document
		)
	)
	if not quote_matches:
		_set_closed_or_unquoted_target()
		_set_generic_rules()
		_confirm_button.disabled = true
		_confirm_button.text = (
			"融合尚未开放"
			if not _qa_preview
			else "当前组合没有报价"
		)
		_confirm_status_label.text = (
			CLOSED_MESSAGE
			if not _qa_preview
			else "本体验页不会为新组合获取报价。"
		)
		return

	var quote_view := PetFusionPresentationModel.quote_view(
		_quote,
		_catalog_document
	)
	var confirmation_view := PetFusionPresentationModel.confirmation_view(
		_quote,
		_catalog_document,
		_armed_fingerprint
	)
	_set_target_from_quote(_quote)
	_set_quote_rules(quote_view)
	_confirm_button.disabled = _second_confirmation_count > 0
	_confirm_button.text = (
		"体验完成"
		if _second_confirmation_count > 0
		else str(confirmation_view.get("buttonText", "查看不可逆确认"))
	)
	if _second_confirmation_count > 0:
		_confirm_status_label.text = "体验预览已完成；没有消耗任何宠物。"
	elif _confirmation_armed():
		_confirm_status_label.text = "再次点击仅演示确认完成，仍不会消耗宠物。"
	else:
		_confirm_status_label.text = "第一次点击只展开确认，本体验页不会执行融合。"


func _set_closed_or_unquoted_target() -> void:
	_target_portrait.texture = null
	_target_placeholder.visible = true
	_target_placeholder.text = (
		"融合目标\n尚未开放"
		if not _qa_preview
		else "组合已变化\n等待新报价"
	)
	_target_portrait_status = "none"
	_target_name_label.text = "目标待开放" if not _qa_preview else "尚无目标报价"
	_target_route_label.text = (
		"当前不会消耗宠物"
		if not _qa_preview
		else "体验页不会自动获取新报价"
	)
	_target_portrait_frame.add_theme_stylebox_override(
		"panel",
		_target_frame_style(false)
	)


func _set_target_from_quote(quote: Dictionary) -> void:
	var result := quote.get("result", {}) as Dictionary
	var target_form_id := str(result.get("targetFormId", ""))
	var target_name := str(result.get("targetFormName", "融合宠"))
	var texture := PetPortraitArtCatalog.texture_for_form(target_form_id)
	_target_portrait.texture = texture
	_target_placeholder.visible = texture == null
	_target_placeholder.text = (
		"◇\n预览占位・正式画像待补"
		if texture == null
		else ""
	)
	_target_portrait_status = "formal" if texture != null else "qa_placeholder"
	_target_name_label.text = target_name
	_target_route_label.text = "%s・一转 Lv1" % _safe_route_text(target_name)
	_target_portrait_frame.add_theme_stylebox_override(
		"panel",
		_target_frame_style(true)
	)


func _set_generic_rules() -> void:
	for index in range(3):
		_special_source_labels[index].text = (
			PetFusionSelectionModel.role_label(ROLE_IDS[index])
		)
		_special_skill_labels[index].text = "血脉特殊主动"
		_special_chance_labels[index].text = "50%"
	_passive_summary_label.text = (
		"最终只保留1个：主宠40% / 共鸣宠Ⅰ30% / 共鸣宠Ⅱ30%。"
	)
	_numeric_rule_label.text = "数值不继承：成品四维与成长按自身规则独立生成。"
	_binding_rule_label.text = "绑定规则：任一材料绑定，成品即绑定。"
	_cost_rule_label.text = "只消耗三只材料宠，不额外消耗石币、钻石或道具。"
	_terminal_rule_label.text = (
		"不可骑乘・终局：不能普通二转、再次进化/融合或付费重置。"
	)
	_authority_label.text = (
		"正式执行时，最终结果以服务器确认为准。"
		if _qa_preview
		else "功能尚未开放；当前不会向服务器提交。"
	)


func _set_quote_rules(view: Dictionary) -> void:
	var active_rows = view.get("specialActiveRows", [])
	for index in range(3):
		if active_rows is Array and index < (active_rows as Array).size():
			var row := (active_rows as Array)[index] as Dictionary
			_special_source_labels[index].text = str(
				row.get("sourceText", PetFusionSelectionModel.role_label(ROLE_IDS[index]))
			)
			_special_skill_labels[index].text = str(
				row.get("skillNameText", "血脉特殊主动")
			)
			_special_chance_labels[index].text = str(
				row.get("ruleText", "50%独立遗传")
			).replace("独立遗传", "")
		else:
			_special_source_labels[index].text = (
				PetFusionSelectionModel.role_label(ROLE_IDS[index])
			)
			_special_skill_labels[index].text = "血脉特殊主动"
			_special_chance_labels[index].text = "50%"
	var passive_rows = view.get("passiveSourceRows", [])
	var passive_parts: Array[String] = []
	if passive_rows is Array:
		for raw_row in passive_rows as Array:
			if not (raw_row is Dictionary):
				continue
			var passive_row := raw_row as Dictionary
			passive_parts.append("%s・%s %s" % [
				str(passive_row.get("sourceText", "材料宠")),
				str(passive_row.get("skillNameText", "血脉被动")),
				str(passive_row.get("ruleText", "")),
			])
	_passive_summary_label.text = (
		"%s；最终只保留1个。" % " / ".join(passive_parts)
		if passive_parts.size() == 3
		else str(
			view.get(
				"passiveSummaryText",
				"最终只保留1个：主宠40% / 共鸣宠Ⅰ30% / 共鸣宠Ⅱ30%。"
			)
		)
	)
	_numeric_rule_label.text = str(view.get("numericRuleText", ""))
	_binding_rule_label.text = str(view.get("bindingRuleText", ""))
	_cost_rule_label.text = str(view.get("costRuleText", ""))
	_terminal_rule_label.text = str(view.get("terminalRuleText", ""))
	_authority_label.text = str(
		view.get(
			"authorityText",
			"执行前服务器会再次校验，最终结果以服务器确认为准。"
		)
	)


func _rebuild_candidate_bar() -> void:
	if _candidate_row == null:
		return
	for child in _candidate_row.get_children():
		_candidate_row.remove_child(child)
		child.queue_free()
	_candidate_buttons.clear()
	_candidate_formal_portrait_count = 0
	_candidate_placeholder_count = 0
	for raw_instance in _candidate_pets:
		var instance := raw_instance.duplicate(true)
		var button := Button.new()
		button.custom_minimum_size = Vector2(162.0, 66.0)
		button.text = "%s\n一转 Lv%d" % [
			str(instance.get("name", "宠物")),
			int(instance.get("level", 0)),
		]
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.icon_alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.vertical_icon_alignment = VERTICAL_ALIGNMENT_CENTER
		button.expand_icon = true
		button.add_theme_font_override("font", PetManagementVisualSkin.body_font())
		button.add_theme_font_size_override("font_size", 12)
		button.add_theme_color_override("font_color", PetManagementVisualSkin.CREAM_TEXT)
		button.add_theme_color_override("font_disabled_color", Color(0.58, 0.55, 0.49, 0.78))
		var texture := PetPortraitArtCatalog.texture_for_form(
			str(instance.get("formId", ""))
		)
		if texture != null:
			button.icon = texture
			_candidate_formal_portrait_count += 1
		else:
			button.text = "◇ 预览占位\n%s・Lv%d" % [
				str(instance.get("name", "宠物")),
				int(instance.get("level", 0)),
			]
			_candidate_placeholder_count += 1
		var accent := Color(0.84, 0.56, 0.22, 1.0)
		button.add_theme_stylebox_override(
			"normal",
			PetManagementVisualSkin.roster_style(false, accent)
		)
		button.add_theme_stylebox_override(
			"hover",
			PetManagementVisualSkin.roster_style(false, accent, true)
		)
		button.add_theme_stylebox_override(
			"pressed",
			PetManagementVisualSkin.roster_style(true, accent)
		)
		button.add_theme_stylebox_override(
			"focus",
			PetManagementVisualSkin.roster_style(true, accent)
		)
		button.add_theme_stylebox_override(
			"disabled",
			PetManagementVisualSkin.roster_style(false, accent)
		)
		button.disabled = not _qa_preview
		button.pressed.connect(_candidate_pressed.bind(instance))
		_candidate_row.add_child(button)
		_candidate_buttons.append(button)


func _material_slot_pressed(role_id: String) -> void:
	if not _qa_preview or not ROLE_IDS.has(role_id):
		return
	_focused_role_id = role_id
	_armed_fingerprint = ""
	_second_confirmation_count = 0
	_refresh()


func _candidate_pressed(instance: Dictionary) -> void:
	if not _qa_preview:
		return
	var hint := PetFusionSelectionModel.candidate_hint(
		instance,
		_focused_role_id,
		_selection,
		_catalog_document
	)
	if not bool(hint.get("eligible", false)):
		_confirm_status_label.text = str(
			hint.get("reasonText", "该候选宠不符合当前位置要求。")
		)
		return
	_selection[_focused_role_id] = instance.duplicate(true)
	_armed_fingerprint = ""
	_second_confirmation_count = 0
	_refresh()


func _confirm_pressed() -> void:
	if (
		not _qa_preview
		or _quote.is_empty()
		or _confirm_button == null
		or _confirm_button.disabled
	):
		return
	var fingerprint := PetFusionPresentationModel.confirmation_fingerprint(
		_quote,
		_catalog_document
	)
	if fingerprint == "":
		return
	if _armed_fingerprint != fingerprint:
		_armed_fingerprint = fingerprint
		_refresh()
		return
	_second_confirmation_count += 1
	_refresh()


func _confirmation_armed() -> bool:
	var fingerprint := PetFusionPresentationModel.confirmation_fingerprint(
		_quote,
		_catalog_document
	)
	return (
		fingerprint != ""
		and _armed_fingerprint == fingerprint
		and _second_confirmation_count == 0
	)


func _safe_route_text(target_name: String) -> String:
	if target_name == "曜冠角兽":
		return "同族共鸣路线・终局融合形态"
	if target_name == "苔垒角兽":
		return "苔背共鸣路线・终局融合形态"
	return "终局融合形态"


func _rule_box(text: String, color: Color) -> Label:
	var panel := PanelContainer.new()
	panel.custom_minimum_size.y = 40.0
	panel.add_theme_stylebox_override(
		"panel",
		PetManagementVisualSkin.dark_inset_style(0.64, 6)
	)
	var label := _label(text, 12, color)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	panel.add_child(label)
	return label


func _label(
	text: String,
	font_size: int,
	color: Color,
	horizontal_alignment: HorizontalAlignment = HORIZONTAL_ALIGNMENT_LEFT
) -> Label:
	var label := Label.new()
	label.text = text
	label.horizontal_alignment = horizontal_alignment
	label.add_theme_font_override("font", PetManagementVisualSkin.body_font())
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.add_theme_color_override(
		"font_outline_color",
		Color(0.03, 0.02, 0.01, 0.86)
	)
	label.add_theme_constant_override("outline_size", 1)
	return label


func _place(control: Control, rect: Rect2) -> void:
	control.set_anchors_preset(Control.PRESET_TOP_LEFT)
	control.position = rect.position
	control.size = rect.size
	control.custom_minimum_size = rect.size


func _notice_style(color: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = color.lightened(0.28)
	style.border_width_left = 1
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	style.corner_radius_top_left = 8
	style.corner_radius_top_right = 8
	style.corner_radius_bottom_left = 8
	style.corner_radius_bottom_right = 8
	style.content_margin_left = 10.0
	style.content_margin_right = 10.0
	return style


func _pill_style(color: Color) -> StyleBoxFlat:
	var style := _notice_style(color)
	style.corner_radius_top_left = 14
	style.corner_radius_top_right = 14
	style.corner_radius_bottom_left = 14
	style.corner_radius_bottom_right = 14
	return style


func _target_frame_style(active: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.045, 0.036, 0.028, 0.84)
	style.border_color = (
		Color(1.0, 0.72, 0.24, 0.94)
		if active
		else Color(0.38, 0.31, 0.24, 0.72)
	)
	var width := 3 if active else 2
	style.border_width_left = width
	style.border_width_top = width
	style.border_width_right = width
	style.border_width_bottom = width
	style.corner_radius_top_left = 110
	style.corner_radius_top_right = 110
	style.corner_radius_bottom_left = 110
	style.corner_radius_bottom_right = 110
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.72)
	style.shadow_size = 9
	return style


func _duplicate_pet_array(value: Array[Dictionary]) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for instance in value:
		result.append(instance.duplicate(true))
	return result


func _collect_visible_text(node: Node, texts: Array[String]) -> void:
	if node is CanvasItem and not (node as CanvasItem).visible:
		return
	if node is Label:
		var label_text := (node as Label).text.strip_edges()
		if label_text != "":
			texts.append(label_text)
	elif node is Button:
		var button_text := (node as Button).text.strip_edges()
		if button_text != "":
			texts.append(button_text)
	for child in node.get_children():
		_collect_visible_text(child, texts)
