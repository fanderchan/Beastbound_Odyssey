extends RefCounted

const PetPaidResetClientModel := preload("res://scripts/progression/pet_paid_reset_client_model.gd")

var root: VBoxContainer
var _title_label: Label
var _refresh_button: Button
var _summary_label: Label
var _price_label: Label
var _wallet_label: Label
var _clear_label: Label
var _preserve_label: Label
var _non_refund_label: Label
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
	root.name = "PetPaidResetPanel"
	root.visible = false
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", 5)
	parent.add_child(root)

	var divider := HSeparator.new()
	divider.modulate = Color(0.72, 0.58, 0.25, 0.52)
	root.add_child(divider)
	var header := HBoxContainer.new()
	header.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_theme_constant_override("separation", 8)
	root.add_child(header)
	_title_label = Label.new()
	_title_label.text = "重置转生"
	_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_title_label.add_theme_font_size_override("font_size", 16)
	_title_label.add_theme_color_override("font_color", Color(0.96, 0.79, 0.35, 1.0))
	header.add_child(_title_label)
	_refresh_button = Button.new()
	_refresh_button.text = "刷新报价"
	_refresh_button.custom_minimum_size = Vector2(92, 30)
	_refresh_button.pressed.connect(_refresh_pressed)
	header.add_child(_refresh_button)

	_summary_label = _body_label(Color(0.92, 0.94, 0.89, 1.0), 14)
	root.add_child(_summary_label)
	var price_row := HBoxContainer.new()
	price_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	price_row.add_theme_constant_override("separation", 10)
	root.add_child(price_row)
	_price_label = _body_label(Color(1.0, 0.84, 0.38, 1.0), 15)
	_price_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	price_row.add_child(_price_label)
	_wallet_label = _body_label(Color(0.78, 0.86, 0.80, 1.0), 13)
	_wallet_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	price_row.add_child(_wallet_label)

	_clear_label = _body_label(Color(1.0, 0.64, 0.55, 1.0), 13)
	root.add_child(_clear_label)
	_preserve_label = _body_label(Color(0.58, 0.95, 0.70, 1.0), 13)
	root.add_child(_preserve_label)
	_non_refund_label = _body_label(Color(0.94, 0.77, 0.46, 1.0), 13)
	root.add_child(_non_refund_label)

	_status_label = _body_label(Color(0.78, 0.80, 0.76, 1.0), 13)
	root.add_child(_status_label)
	_confirm_button = Button.new()
	_confirm_button.text = "重置回 Lv1・0转"
	_confirm_button.custom_minimum_size = Vector2(0, 38)
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
	var normalized := PetPaidResetClientModel.normalized_quote(quote_value)
	if normalized.is_empty() or not PetPaidResetClientModel.quote_matches_instance(normalized, instance):
		_quote = {}
		_quote_fingerprint = ""
		_armed_fingerprint = ""
		_summary_label.text = "正在向服务器确认重置资格与价格……" if quote_pending else "当前没有可用的服务端报价。"
		_price_label.text = ""
		_wallet_label.text = ""
		_clear_label.text = ""
		_preserve_label.text = ""
		_non_refund_label.text = ""
		_status_label.text = status_message
		_refresh_button.disabled = quote_pending or action_pending
		_confirm_button.visible = false
		return
	_quote = normalized
	var next_fingerprint := PetPaidResetClientModel.confirmation_fingerprint(_quote)
	if next_fingerprint != _quote_fingerprint:
		_armed_fingerprint = ""
	_quote_fingerprint = next_fingerprint
	var view := PetPaidResetClientModel.view_model(_quote)
	_summary_label.text = str(view.get("summary", ""))
	_price_label.text = "费用：%s｜已重置 %d 次" % [
		str(view.get("price", "")),
		int(view.get("paidResetCount", 0)),
	]
	_wallet_label.text = str(view.get("wallet", ""))
	_clear_label.text = "清除：%s" % str(view.get("clears", ""))
	_preserve_label.text = "保留：%s" % str(view.get("preserves", ""))
	_non_refund_label.text = "不返还：%s；成功后自动解绑。" % str(view.get("nonRefunded", ""))
	_refresh_button.disabled = quote_pending or action_pending
	_confirm_button.visible = true
	_confirm_button.disabled = quote_pending or action_pending or not bool(view.get("affordable", false))
	if action_pending:
		_confirm_button.text = "服务器正在确认……"
	elif _armed_fingerprint == _quote_fingerprint:
		_confirm_button.text = str(view.get("confirmText", "再次确认支付"))
	else:
		_confirm_button.text = "重置回 Lv1・0转"
	if status_message != "":
		_status_label.text = status_message
	elif not bool(view.get("affordable", false)):
		_status_label.text = "货币不足，还差 %s。" % str(view.get("shortfall", ""))
	elif _armed_fingerprint == _quote_fingerprint:
		_status_label.text = "再次点击将立即扣款；本操作不会返还既有投入。"
	else:
		_status_label.text = "第一次点击只展开确认；第二次点击才会提交。"


func reset_confirmation() -> void:
	_armed_fingerprint = ""


func set_status(message: String, success: bool = false) -> void:
	if _status_label == null:
		return
	_status_label.text = message
	_status_label.add_theme_color_override(
		"font_color",
		Color(0.58, 0.95, 0.70, 1.0) if success else Color(0.94, 0.77, 0.46, 1.0)
	)


func snapshot() -> Dictionary:
	return {
		"visible": root != null and root.visible,
		"quoteValid": not _quote.is_empty(),
		"armed": _armed_fingerprint != "" and _armed_fingerprint == _quote_fingerprint,
		"summary": _summary_label.text if _summary_label != null else "",
		"price": _price_label.text if _price_label != null else "",
		"wallet": _wallet_label.text if _wallet_label != null else "",
		"clears": _clear_label.text if _clear_label != null else "",
		"preserves": _preserve_label.text if _preserve_label != null else "",
		"nonRefunded": _non_refund_label.text if _non_refund_label != null else "",
		"status": _status_label.text if _status_label != null else "",
		"buttonText": _confirm_button.text if _confirm_button != null else "",
		"buttonDisabled": _confirm_button.disabled if _confirm_button != null else true,
	}


static func contract_check() -> Dictionary:
	return PetPaidResetClientModel.contract_check()


func _refresh_pressed() -> void:
	_armed_fingerprint = ""
	if _on_refresh.is_valid():
		await _on_refresh.call()


func _confirm_pressed() -> void:
	if _quote.is_empty() or _quote_pending or _action_pending:
		return
	if _armed_fingerprint != _quote_fingerprint:
		_armed_fingerprint = _quote_fingerprint
		var view := PetPaidResetClientModel.view_model(_quote)
		_confirm_button.text = str(view.get("confirmText", "再次确认支付"))
		_status_label.text = "再次点击将立即扣款；本操作不会返还既有投入。"
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
