extends SceneTree

const BackpackModel := preload("res://scripts/progression/backpack_model.gd")
const PetRelatedItemPortraitModel := preload(
	"res://scripts/progression/pet_related_item_portrait_model.gd"
)
const PetRebirthMmModel := preload("res://scripts/progression/pet_rebirth_mm_model.gd")
const PetPortraitArtCatalogCheck := preload(
	"res://scripts/qa/pet_portrait_art_catalog_check.gd"
)
const PetCodexEntryButton := preload("res://scripts/ui/pet_codex_entry_button.gd")
const ItemSlotButton := preload("res://scripts/ui/item_slot_button.gd")

const EXPECTED_ITEM_FORMS := {
	"pet_rebirth_mm1_egg": "pet_rebirth_mm_stage1",
	"pet_rebirth_mm2_egg": "pet_rebirth_mm_stage2",
	"rebirth_starter_four_spirit_cub_egg": "rebirth_starter_four_spirit_cub",
	"novice_battle_pet_egg": "bui_novice_sprout_earth5_wind5",
	"novice_tiger_egg": "novice_tiger_mount",
	"thunder_dragon_egg": "thunder_dragon_mount",
	"bui_novice_sprout_riding_certificate": "bui_novice_sprout_earth5_wind5",
}


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var result := run()
	print(JSON.stringify(result))
	quit(0 if bool(result.get("ok", false)) else 1)


static func run() -> Dictionary:
	var errors: Array[String] = []
	var catalog_result := PetPortraitArtCatalogCheck.run()
	for error in catalog_result.get("errors", []):
		errors.append(str(error))
	PetRelatedItemPortraitModel.clear_caches_for_qa()
	errors.append_array(PetRelatedItemPortraitModel.validation_errors())
	_append_item_mapping_errors(errors)
	_append_codex_privacy_errors(errors)
	_append_item_slot_presentation_errors(errors)
	var result := {
		"ok": errors.is_empty(),
		"catalogFormCount": int(catalog_result.get("catalogFormCount", 0)),
		"formalPortraitCount": int(catalog_result.get("formalPortraitCount", 0)),
		"errors": errors,
	}
	return result


static func _append_item_mapping_errors(errors: Array[String]) -> void:
	if (
		str(EXPECTED_ITEM_FORMS.get("pet_rebirth_mm1_egg", ""))
		!= PetRebirthMmModel.helper_form_id_for_stage(1)
		or str(EXPECTED_ITEM_FORMS.get("pet_rebirth_mm2_egg", ""))
		!= PetRebirthMmModel.helper_form_id_for_stage(2)
	):
		errors.append("小MM蛋的完整头像映射合同与权威阶段 formId 不一致")
	var actual_item_ids: Array[String] = []
	actual_item_ids.append_array(
		BackpackModel.item_ids_for_context(BackpackModel.CONTEXT_WORLD_PET_EGG)
	)
	actual_item_ids.append_array(
		BackpackModel.item_ids_for_context(BackpackModel.CONTEXT_WORLD_PET_RIDE_PERMIT)
	)
	actual_item_ids.sort()
	var expected_item_ids: Array[String] = []
	for item_id_value in EXPECTED_ITEM_FORMS:
		expected_item_ids.append(str(item_id_value))
	expected_item_ids.sort()
	if actual_item_ids != expected_item_ids:
		errors.append(
			"宠物蛋/骑宠证物品集合与完整头像映射合同不一致：期望 %s，实际 %s"
			% [JSON.stringify(expected_item_ids), JSON.stringify(actual_item_ids)]
		)
	for item_id_value in EXPECTED_ITEM_FORMS:
		var item_id := str(item_id_value)
		var expected_form_id := str(EXPECTED_ITEM_FORMS.get(item_id, ""))
		var actual_form_id := PetRelatedItemPortraitModel.form_id_for_item(item_id)
		if actual_form_id != expected_form_id:
			errors.append("宠物关联物品 formId 解析错误：%s -> %s" % [
				item_id,
				actual_form_id,
			])
	if PetRelatedItemPortraitModel.form_id_for_item("item_meat_small") != "":
		errors.append("普通物品错误获得了宠物大头照 formId")
	if (
		PetRelatedItemPortraitModel.form_id_for_item(
			"bui_novice_sprout_taming_certificate"
		)
		!= ""
	):
		errors.append("本期未纳入的驯宠证错误进入骑宠证大头照展示范围")


static func _append_codex_privacy_errors(errors: Array[String]) -> void:
	var hidden_entry := {
		"formId": "bui_novice_sprout_earth5_wind5",
		"formName": "芽耳布伊",
		"seen": false,
		"captured": false,
		"recordLabel": "未遇见",
	}
	var hidden_button := PetCodexEntryButton.new()
	hidden_button.configure(hidden_entry, true)
	if hidden_button.portrait_lookup_requested():
		errors.append("未遇见图鉴条目错误请求了正式大头照")
	if not hidden_button.shows_hidden_identity_fallback():
		errors.append("未遇见图鉴条目没有只显示问号身份")
	if "芽耳布伊" in hidden_button.text:
		errors.append("未遇见图鉴条目泄露了宠物名称")
	hidden_button.free()

	var seen_entry := hidden_entry.duplicate(true)
	seen_entry["seen"] = true
	seen_entry["recordLabel"] = "已遇见"
	var seen_button := PetCodexEntryButton.new()
	seen_button.configure(seen_entry, false)
	if not seen_button.portrait_lookup_requested():
		errors.append("已遇见图鉴条目没有请求专用大头照")
	if not seen_button.uses_formal_portrait():
		errors.append("已遇见图鉴条目没有显示已登记的正式大头照")
	if "芽耳布伊" not in seen_button.text:
		errors.append("已遇见图鉴条目没有显示已解锁名称")
	seen_button.free()


static func _append_item_slot_presentation_errors(errors: Array[String]) -> void:
	for item_id_value in EXPECTED_ITEM_FORMS:
		var item_id := str(item_id_value)
		var slot_text := "原物品框文字"
		var button := ItemSlotButton.new()
		button.configure({
			"context": "backpack",
			"itemId": item_id,
			"count": 1,
		}, slot_text)
		if button.pet_portrait_form_id() == "":
			errors.append("宠物蛋或骑宠证物品框没有解析大头照 formId：%s" % item_id)
		elif (
			button.pet_portrait_form_id()
			!= str(EXPECTED_ITEM_FORMS.get(item_id, ""))
		):
			errors.append("宠物蛋或骑宠证物品框显示了错误形态的大头照：%s" % item_id)
		if button.text != slot_text:
			errors.append("叠加大头照时替换了原物品框文字：%s" % item_id)
		if not button.uses_formal_pet_portrait():
			errors.append("宠物蛋或骑宠证物品框没有显示已登记的大头照：%s" % item_id)
		button.free()

	var ordinary_button := ItemSlotButton.new()
	ordinary_button.configure({
		"context": "backpack",
		"itemId": "item_meat_small",
		"count": 1,
	}, "肉")
	if ordinary_button.pet_portrait_form_id() != "" or ordinary_button.icon != null:
		errors.append("普通物品框错误叠加了宠物大头照")
	ordinary_button.free()
