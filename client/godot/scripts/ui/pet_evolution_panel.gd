extends RefCounted

const PetEvolutionClientModel := preload("res://scripts/progression/pet_evolution_client_model.gd")

var root: VBoxContainer
var _title_label: Label
var _refresh_button: Button
var _summary_label: Label
var _condition_label: Label
var _items_label: Label
var _coins_label: Label
var _changes_label: Label
var _preserves_label: Label
var _terminal_label: Label
var _safety_label: Label
var _status_label: Label
var _confirm_button: Button
var _quote: Dictionary = {}
var _quote_fingerprint: String = ""
var _armed_fingerprint: String = ""
var _on_refresh: Callable
var _on_confirm: Callable
var _quote_pending: bool = false
var _action_pending: bool = false


func mount(parent: VBoxContainer, on_refresh: Callable, on_confirm: Callable) -> void:
	_on_refresh = on_refresh
	_on_confirm = on_confirm
	root = VBoxContainer.new()
	root.name = "PetEvolutionPanel"
	root.visible = false
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", 5)
	parent.add_child(root)

	var divider := HSeparator.new()
	divider.modulate = Color(0.35, 0.72, 0.76, 0.56)
	root.add_child(divider)
	var header := HBoxContainer.new()
	header.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_theme_constant_override("separation", 8)
	root.add_child(header)
	_title_label = Label.new()
	_title_label.text = "宠物进化"
	_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_title_label.add_theme_font_size_override("font_size", 17)
	_title_label.add_theme_color_override("font_color", Color(0.56, 0.92, 0.93, 1.0))
	header.add_child(_title_label)
	_refresh_button = Button.new()
	_refresh_button.text = "刷新条件"
	_refresh_button.custom_minimum_size = Vector2(92, 30)
	_refresh_button.pressed.connect(_refresh_pressed)
	header.add_child(_refresh_button)

	_summary_label = _body_label(Color(0.94, 0.95, 0.91, 1.0), 15)
	root.add_child(_summary_label)
	_condition_label = _body_label(Color(0.60, 0.96, 0.70, 1.0), 14)
	root.add_child(_condition_label)
	_items_label = _body_label(Color(0.96, 0.83, 0.43, 1.0), 13)
	root.add_child(_items_label)
	_coins_label = _body_label(Color(0.96, 0.83, 0.43, 1.0), 13)
	root.add_child(_coins_label)

	_changes_label = _body_label(Color(1.0, 0.66, 0.50, 1.0), 13)
	root.add_child(_changes_label)
	_preserves_label = _body_label(Color(0.61, 0.94, 0.72, 1.0), 13)
	root.add_child(_preserves_label)
	_terminal_label = _body_label(Color(0.84, 0.88, 0.83, 1.0), 13)
	root.add_child(_terminal_label)
	_safety_label = _body_label(Color(0.72, 0.84, 0.89, 1.0), 13)
	root.add_child(_safety_label)

	_status_label = _body_label(Color(0.94, 0.79, 0.46, 1.0), 13)
	root.add_child(_status_label)
	_confirm_button = Button.new()
	_confirm_button.text = "确认进化"
	_confirm_button.custom_minimum_size = Vector2(0, 40)
	_confirm_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_confirm_button.pressed.connect(_confirm_pressed)
	root.add_child(_confirm_button)


func refresh(
	instance: Dictionary,
	quote_value,
	visible: bool,
	quote_pending: bool,
	action_pending: bool,
	status_message: String = ""
) -> void:
	_quote_pending = quote_pending
	_action_pending = action_pending
	if root == null:
		return
	root.visible = visible
	if not visible:
		_quote = {}
		_quote_fingerprint = ""
		_armed_fingerprint = ""
		return
	var normalized := PetEvolutionClientModel.normalized_quote(quote_value)
	if normalized.is_empty() or not PetEvolutionClientModel.quote_matches_instance(normalized, instance):
		_quote = {}
		_quote_fingerprint = ""
		_armed_fingerprint = ""
		_summary_label.text = "正在向服务器确认进化资格与消耗……" if quote_pending else "当前没有可用的服务端进化条件。"
		_condition_label.text = ""
		_items_label.text = ""
		_coins_label.text = ""
		_changes_label.text = ""
		_preserves_label.text = ""
		_terminal_label.text = ""
		_safety_label.text = ""
		_status_label.text = status_message
		_refresh_button.disabled = quote_pending or action_pending
		_confirm_button.visible = false
		return
	_quote = normalized
	var next_fingerprint := PetEvolutionClientModel.confirmation_fingerprint(_quote)
	if next_fingerprint != _quote_fingerprint:
		_armed_fingerprint = ""
	_quote_fingerprint = next_fingerprint
	var view := PetEvolutionClientModel.view_model(_quote)
	_title_label.text = str(view.get("title", "宠物进化"))
	_summary_label.text = str(view.get("summary", ""))
	_condition_label.text = "达标：%s" % str(view.get("condition", ""))
	_items_label.text = str(view.get("items", ""))
	_coins_label.text = str(view.get("stoneCoins", ""))
	_changes_label.text = str(view.get("changes", ""))
	_preserves_label.text = str(view.get("preserves", ""))
	_terminal_label.text = str(view.get("terminal", ""))
	_safety_label.text = str(view.get("safety", ""))
	_refresh_button.disabled = quote_pending or action_pending
	_confirm_button.visible = true
	_confirm_button.disabled = quote_pending or action_pending or not bool(view.get("affordable", false))
	if action_pending:
		_confirm_button.text = "服务器正在确认……"
	elif _armed_fingerprint == _quote_fingerprint:
		_confirm_button.text = str(view.get("confirmText", "再次确认进化"))
	else:
		_confirm_button.text = str(view.get("buttonText", "确认进化"))
	if status_message != "":
		_status_label.text = status_message
	elif not bool(view.get("affordable", false)):
		var shortfall := str(view.get("shortfall", ""))
		_status_label.text = "尚缺：%s。" % (shortfall if shortfall != "" else "进化材料或石币")
	elif _armed_fingerprint == _quote_fingerprint:
		_status_label.text = "再次点击将立即扣除材料；二代4V与天生成长无法预知。"
	else:
		_status_label.text = "第一次点击只展开确认；第二次点击才会提交。"


func reset_confirmation() -> void:
	_armed_fingerprint = ""


func snapshot() -> Dictionary:
	return {
		"visible": root != null and root.visible,
		"quoteValid": not _quote.is_empty(),
		"armed": _armed_fingerprint != "" and _armed_fingerprint == _quote_fingerprint,
		"summary": _summary_label.text if _summary_label != null else "",
		"condition": _condition_label.text if _condition_label != null else "",
		"items": _items_label.text if _items_label != null else "",
		"stoneCoins": _coins_label.text if _coins_label != null else "",
		"changes": _changes_label.text if _changes_label != null else "",
		"preserves": _preserves_label.text if _preserves_label != null else "",
		"terminal": _terminal_label.text if _terminal_label != null else "",
		"safety": _safety_label.text if _safety_label != null else "",
		"status": _status_label.text if _status_label != null else "",
		"buttonText": _confirm_button.text if _confirm_button != null else "",
		"buttonDisabled": _confirm_button.disabled if _confirm_button != null else true,
	}


static func contract_check() -> Dictionary:
	return PetEvolutionClientModel.contract_check()


func _refresh_pressed() -> void:
	_armed_fingerprint = ""
	if _on_refresh.is_valid():
		await _on_refresh.call()


func _confirm_pressed() -> void:
	if _quote.is_empty() or _quote_pending or _action_pending:
		return
	if _armed_fingerprint != _quote_fingerprint:
		_armed_fingerprint = _quote_fingerprint
		var view := PetEvolutionClientModel.view_model(_quote)
		_confirm_button.text = str(view.get("confirmText", "再次确认进化"))
		_status_label.text = "再次点击将立即扣除材料；二代4V与天生成长无法预知。"
		return
	if _on_confirm.is_valid():
		await _on_confirm.call(_quote.duplicate(true))


func _body_label(color: Color, font_size: int) -> Label:
	var label := Label.new()
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	return label
