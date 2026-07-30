extends SceneTree

const BackpackItemIconCatalog := preload(
	"res://scripts/ui/backpack_item_icon_catalog.gd"
)

const EXPECTED_FORMAL_PORTRAIT_ITEMS := {
	"pet_rebirth_mm1_egg": "pet_rebirth_mm_stage1",
	"pet_rebirth_mm2_egg": "pet_rebirth_mm_stage2",
	"rebirth_starter_four_spirit_cub_egg": "rebirth_starter_four_spirit_cub",
	"novice_battle_pet_egg": "bui_novice_sprout_earth5_wind5",
	"bui_novice_sprout_riding_certificate": "bui_novice_sprout_earth5_wind5",
	"novice_tiger_egg": "novice_tiger_mount",
	"thunder_dragon_egg": "thunder_dragon_mount",
}
const TAME_PERMIT_ATLAS_ITEM := "bui_novice_sprout_taming_certificate"


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	BackpackItemIconCatalog.clear_caches_for_qa()
	var result := BackpackItemIconCatalog.self_check()
	var errors: Array[String] = []
	for error_value in result.get("errors", []):
		errors.append(str(error_value))
	for item_id_value in EXPECTED_FORMAL_PORTRAIT_ITEMS:
		var item_id := str(item_id_value)
		var expected_form_id := str(EXPECTED_FORMAL_PORTRAIT_ITEMS.get(item_id, ""))
		var expected_source := "formal_pet_portrait:%s" % expected_form_id
		var actual_source := BackpackItemIconCatalog.source_for_item(item_id)
		if actual_source != expected_source:
			errors.append(
				"宠物蛋/骑宠证必须复用正式大头照：%s，期望 %s，实际 %s"
				% [item_id, expected_source, actual_source]
			)
	var tame_permit_source := BackpackItemIconCatalog.source_for_item(
		TAME_PERMIT_ATLAS_ITEM
	)
	if not tame_permit_source.begins_with("atlas:"):
		errors.append("驯宠证必须继续使用物品图集，不得误用正式宠物大头照")
	if int(result.get("formalPetPortraitCount", -1)) != EXPECTED_FORMAL_PORTRAIT_ITEMS.size():
		errors.append(
			"正式宠物大头照物品数量错误：期望 %d，实际 %d"
			% [
				EXPECTED_FORMAL_PORTRAIT_ITEMS.size(),
				int(result.get("formalPetPortraitCount", -1)),
			]
		)
	result["errors"] = errors
	result["ok"] = errors.is_empty()
	print(JSON.stringify(result))
	quit(0 if bool(result.get("ok", false)) else 1)
