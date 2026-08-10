extends VBoxContainer

signal slot_selected(slot: int)
signal card_selected(card_view: Dictionary)
signal learn_requested(skill_id: String)

const PetSkillPresentationModel := preload(
	"res://scripts/progression/pet_skill_presentation_model.gd"
)
const PetSkillCard := preload("res://scripts/ui/pet_skill_card.gd")
const PetSkillVisualSkin := preload("res://scripts/ui/pet_skill_visual_skin.gd")
const PetManagementVisualSkin := preload("res://scripts/ui/pet_management_visual_skin.gd")

var _title_label: Label
var _context_label: Label
var _cards_column: VBoxContainer
var _view: Dictionary = {}
var _cards: Array[Control] = []
var _selected_key := ""


func _init() -> void:
	custom_minimum_size.x = PetSkillVisualSkin.CARD_WIDTH
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation", 6)
	_build_content()


func configure(
	instance: Dictionary,
	selected_slot: int,
	training_mode: bool = false,
	training_options: Array[Dictionary] = []
) -> void:
	configure_view(
		PetSkillPresentationModel.view_for_instance(
			instance,
			selected_slot,
			training_mode,
			training_options
		)
	)


func configure_view(view: Dictionary) -> void:
	_view = view.duplicate(true)
	var safe_slot := clampi(
		int(_view.get("selectedSlot", 1)),
		1,
		PetSkillPresentationModel.MAX_ACTIVE_SLOTS
	)
	_selected_key = "active:%d" % safe_slot
	_title_label.text = "技能"
	_context_label.text = "%s · %s" % [
		str(_view.get("petName", "宠物")),
		"选择技能槽进行训练" if bool(_view.get("trainingMode", false)) else "点击技能查看详情",
	]
	_rebuild_cards()


func set_selected_slot(slot: int) -> void:
	var safe_slot := clampi(slot, 1, PetSkillPresentationModel.MAX_ACTIVE_SLOTS)
	_view["selectedSlot"] = safe_slot
	_selected_key = "active:%d" % safe_slot
	_sync_card_selection()


func selected_slot() -> int:
	return clampi(
		int(_view.get("selectedSlot", 1)),
		1,
		PetSkillPresentationModel.MAX_ACTIVE_SLOTS
	)


func selected_card_key() -> String:
	return _selected_key


func current_view() -> Dictionary:
	return _view.duplicate(true)


func snapshot() -> Dictionary:
	var card_snapshots: Array[Dictionary] = []
	for card in _cards:
		if card != null and card.has_method("snapshot"):
			var value = card.call("snapshot")
			if value is Dictionary:
				card_snapshots.append(value as Dictionary)
	var passive_count := 0
	var active_count := 0
	var empty_count := 0
	var training_candidate_count := 0
	var training_action_count := 0
	var learned_candidate_count := 0
	for card in card_snapshots:
		if bool(card.get("isTrainingCandidate", false)):
			if bool(card.get("isClearAction", false)):
				training_action_count += 1
				continue
			training_candidate_count += 1
			if bool(card.get("learned", false)):
				learned_candidate_count += 1
			continue
		match str(card.get("kind", "")):
			PetSkillPresentationModel.KIND_PASSIVE:
				passive_count += 1
			PetSkillPresentationModel.KIND_EMPTY:
				active_count += 1
				empty_count += 1
			PetSkillPresentationModel.KIND_ACTIVE:
				active_count += 1
	return {
		"titleText": _title_label.text if _title_label != null else "",
		"contextText": _context_label.text if _context_label != null else "",
		"instanceId": str(_view.get("instanceId", "")),
		"trainingMode": bool(_view.get("trainingMode", false)),
		"readOnly": bool(_view.get("readOnly", true)),
		"selectedSlot": selected_slot(),
		"selectedCardKey": _selected_key,
		"passiveCount": passive_count,
		"activeSlotCount": active_count,
		"emptySlotCount": empty_count,
		"trainingActionCount": training_action_count,
		"trainingCandidateCount": training_candidate_count,
		"learnedCandidateCount": learned_candidate_count,
		"cardCount": card_snapshots.size(),
		"cards": card_snapshots,
	}


func _build_content() -> void:
	_title_label = Label.new()
	_title_label.text = "技能"
	_title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	PetManagementVisualSkin.apply_title(_title_label, 25)
	add_child(_title_label)
	_context_label = Label.new()
	_context_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_context_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_context_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	PetSkillVisualSkin.apply_body_label(_context_label, true)
	add_child(_context_label)
	_cards_column = VBoxContainer.new()
	_cards_column.custom_minimum_size.x = PetSkillVisualSkin.CARD_WIDTH
	_cards_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_cards_column.add_theme_constant_override("separation", 6)
	_cards_column.mouse_filter = Control.MOUSE_FILTER_PASS
	add_child(_cards_column)


func _rebuild_cards() -> void:
	for child in _cards_column.get_children():
		_cards_column.remove_child(child)
		child.queue_free()
	_cards.clear()

	var raw_passives = _view.get("passives", [])
	if raw_passives is Array and not (raw_passives as Array).is_empty():
		_add_section_label("被动技能")
		for value in raw_passives as Array:
			if value is Dictionary:
				_add_card(value as Dictionary)
	else:
		_add_empty_passive_hint()

	_add_section_label("主动技能槽")
	var raw_slots = _view.get("activeSlots", [])
	if raw_slots is Array:
		for value in raw_slots as Array:
			if value is Dictionary:
				_add_card(value as Dictionary)
	if bool(_view.get("trainingMode", false)):
		var raw_actions = _view.get("trainingActions", [])
		if raw_actions is Array and not (raw_actions as Array).is_empty():
			_add_section_label("当前技能槽")
			for value in raw_actions as Array:
				if value is Dictionary:
					_add_card(value as Dictionary)
		_add_section_label("训练师可教")
		var raw_candidates = _view.get("trainingCandidates", [])
		if raw_candidates is Array and not (raw_candidates as Array).is_empty():
			for value in raw_candidates as Array:
				if value is Dictionary:
					_add_card(value as Dictionary)
		else:
			_add_training_empty_hint()
	_sync_card_selection()


func _add_section_label(text_value: String) -> void:
	var label := Label.new()
	label.text = text_value
	label.custom_minimum_size = Vector2(0.0, 24.0)
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_override("font", PetManagementVisualSkin.display_font())
	label.add_theme_font_size_override("font_size", 14)
	label.add_theme_color_override("font_color", PetManagementVisualSkin.GOLD_TEXT)
	_cards_column.add_child(label)


func _add_empty_passive_hint() -> void:
	_add_section_label("被动技能")
	var hint := Label.new()
	hint.text = "当前形态暂无被动技能"
	hint.custom_minimum_size = Vector2(PetSkillVisualSkin.CARD_WIDTH, 42.0)
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	hint.mouse_filter = Control.MOUSE_FILTER_IGNORE
	PetSkillVisualSkin.apply_body_label(hint, true)
	_cards_column.add_child(hint)


func _add_training_empty_hint() -> void:
	var hint := Label.new()
	hint.text = "这位训练师当前没有可教技能"
	hint.custom_minimum_size = Vector2(PetSkillVisualSkin.CARD_WIDTH, 42.0)
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	hint.mouse_filter = Control.MOUSE_FILTER_IGNORE
	PetSkillVisualSkin.apply_body_label(hint, true)
	_cards_column.add_child(hint)


func _add_card(card_view: Dictionary) -> void:
	var card = PetSkillCard.new()
	var key := str(card_view.get("cardKey", ""))
	card.call("configure", card_view, key == _selected_key)
	card.pressed.connect(_on_card_pressed.bind(card))
	_cards_column.add_child(card)
	_cards.append(card as Control)


func _on_card_pressed(card: Control) -> void:
	if card == null or not card.has_method("card_key"):
		return
	_selected_key = str(card.call("card_key"))
	var card_slot := int(card.call("slot"))
	if card_slot > 0:
		_view["selectedSlot"] = card_slot
	_sync_card_selection()
	var selected_view := _card_view_for_key(_selected_key)
	card_selected.emit(selected_view)
	if bool(selected_view.get("isTrainingCandidate", false)):
		var skill_id := str(selected_view.get(
			"skillId",
			selected_view.get("abilityId", "")
		)).strip_edges()
		if (
			bool(selected_view.get("canLearn", false))
			and (
				skill_id != ""
				or bool(selected_view.get("isClearAction", false))
			)
		):
			learn_requested.emit(skill_id)
	if card_slot > 0:
		slot_selected.emit(card_slot)


func _sync_card_selection() -> void:
	for card in _cards:
		if card == null or not card.has_method("card_key"):
			continue
		card.call(
			"set_selected_visual",
			str(card.call("card_key")) == _selected_key
		)


func _card_view_for_key(key: String) -> Dictionary:
	for collection_key in [
		"passives",
		"activeSlots",
		"trainingActions",
		"trainingCandidates",
	]:
		var raw_collection = _view.get(collection_key, [])
		if not (raw_collection is Array):
			continue
		for value in raw_collection as Array:
			if value is Dictionary and str((value as Dictionary).get("cardKey", "")) == key:
				return (value as Dictionary).duplicate(true)
	return {}
