extends Button
class_name PetCodexEntryButton

const PetPortraitArtCatalog := preload("res://scripts/ui/pet_portrait_art_catalog.gd")

var _form_id: String = ""
var _seen: bool = false
var _portrait_lookup_requested: bool = false
var _uses_formal_portrait: bool = false


func configure(entry: Dictionary, selected: bool = false) -> void:
	_form_id = str(entry.get("formId", "")).strip_edges()
	_seen = bool(entry.get("seen", false))
	_portrait_lookup_requested = false
	_uses_formal_portrait = false
	icon = null
	expand_icon = false

	var marker := "▶ " if selected else ""
	var record_label := str(entry.get("recordLabel", "未遇见"))
	if not _seen:
		text = "%s？ ？？？\n%s" % [marker, record_label]
	else:
		_portrait_lookup_requested = true
		var portrait := PetPortraitArtCatalog.texture_for_form(_form_id)
		_uses_formal_portrait = portrait != null
		if _uses_formal_portrait:
			icon = portrait
			expand_icon = true
		var portrait_marker := "" if _uses_formal_portrait else "◇ "
		text = "%s%s%s\n%s" % [
			marker,
			portrait_marker,
			str(entry.get("formName", "宠物")),
			record_label,
		]

	custom_minimum_size = Vector2(214, 58)
	alignment = HORIZONTAL_ALIGNMENT_LEFT
	tooltip_text = str(entry.get("formName", "宠物")) if _seen else "尚未遇见"


func form_id() -> String:
	return _form_id


func is_seen_entry() -> bool:
	return _seen


func portrait_lookup_requested() -> bool:
	return _portrait_lookup_requested


func uses_formal_portrait() -> bool:
	return _uses_formal_portrait


func shows_hidden_identity_fallback() -> bool:
	return not _seen and icon == null and "？？？" in text
