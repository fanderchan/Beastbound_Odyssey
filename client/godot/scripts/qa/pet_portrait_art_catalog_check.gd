extends RefCounted

const PetArtCatalog := preload("res://scripts/pet/pet_art_catalog.gd")
const PetTemplateCatalog := preload("res://scripts/battle/pet_template_catalog.gd")
const PetPortraitArtCatalog := preload("res://scripts/ui/pet_portrait_art_catalog.gd")
const PetGrowthStageButton := preload("res://scripts/ui/pet_growth_stage_button.gd")
const PetListEntryButton := preload("res://scripts/ui/pet_list_entry_button.gd")

const EXPECTED_FORMAL_ROOTS := {
	"bui_normal_red_fire10": "client/godot/assets/pets/bui_normal_red_fire10",
	"bui_normal_yellow_wind10": "client/godot/assets/pets/bui_normal_yellow_wind10",
	"bui_normal_thick_earth10": "client/godot/assets/pets/bui_normal_thick_earth10",
	"bui_novice_sprout_earth5_wind5": "client/godot/assets/pets/novice_sprout_bui",
	"wuli_normal_orange_fire10": "client/godot/assets/pets/wuli_normal_orange_fire10",
	"wuli_normal_fast_wind10": "client/godot/assets/pets/wuli_normal_fast_wind10",
	"wuli_normal_tough_earth10": "client/godot/assets/pets/wuli_normal_tough_earth10",
	"wuli_evolved_crystal_earth8_water2": "client/godot/assets/pets/wuli_evolved_crystal_earth8_water2",
	"mossback_marsh_earth7_water3": "client/godot/assets/pets/mossback_marsh_earth7_water3",
	"mossback_sunbaked_earth6_fire4": "client/godot/assets/pets/mossback_sunbaked_earth6_fire4",
	"driftfox_mist_wind7_water3": "client/godot/assets/pets/driftfox_mist_wind7_water3",
	"driftfox_highland_wind9_earth1": "client/godot/assets/pets/driftfox_highland_wind9_earth1",
	"driftfox_evolved_moon_gale_wind7_water3": "client/godot/assets/pets/driftfox_evolved_moon_gale_wind7_water3",
	"emberhorn_red_fire8_earth2": "client/godot/assets/pets/emberhorn_red_fire8_earth2",
	"emberhorn_ash_fire6_wind4": "client/godot/assets/pets/emberhorn_ash_fire6_wind4",
	"emberhorn_gale_fire5_wind5": "client/godot/assets/pets/emberhorn_gale_fire5_wind5",
	"emberhorn_fusion_solar_crown_fire7_wind3": "client/godot/assets/pets/emberhorn_fusion_solar_crown_fire7_wind3",
	"emberhorn_fusion_moss_rampart_fire4_earth6": "client/godot/assets/pets/emberhorn_fusion_moss_rampart_fire4_earth6",
	"tidefin_mist_water8_wind2": "client/godot/assets/pets/tidefin_mist_water8_wind2",
	"tidefin_sky_water5_wind5": "client/godot/assets/pets/tidefin_sky_water5_wind5",
	"tidefin_reed_water6_earth4": "client/godot/assets/pets/tidefin_reed_water6_earth4",
	"blue_man_dragon_water10": "client/godot/assets/pets/blue_man_dragon_water10",
	"pet_rebirth_mm_stage1": "client/godot/assets/pets/pet_rebirth_mm_stage1",
	"pet_rebirth_mm_stage2": "client/godot/assets/pets/pet_rebirth_mm_stage2",
	"rebirth_beast_earth_lv50": "client/godot/assets/pets/rebirth_beast_earth_lv50",
	"rebirth_beast_water_lv50": "client/godot/assets/pets/rebirth_beast_water_lv50",
	"rebirth_beast_fire_lv50": "client/godot/assets/pets/rebirth_beast_fire_lv50",
	"rebirth_beast_wind_lv50": "client/godot/assets/pets/rebirth_beast_wind_lv50",
	"rebirth_starter_earth_cub": "client/godot/assets/pets/rebirth_starter_earth_cub",
	"rebirth_starter_water_cub": "client/godot/assets/pets/rebirth_starter_water_cub",
	"rebirth_starter_fire_cub": "client/godot/assets/pets/rebirth_starter_fire_cub",
	"rebirth_starter_wind_cub": "client/godot/assets/pets/rebirth_starter_wind_cub",
	"rebirth_starter_four_spirit_cub": "client/godot/assets/pets/rebirth_starter_four_spirit_cub",
	"rebirth_starter_shadow_cub": "client/godot/assets/pets/rebirth_starter_shadow_cub",
	"novice_tiger_mount": "client/godot/assets/pets/novice_tiger_mount",
	"thunder_dragon_mount": "client/godot/assets/pets/thunder_dragon_mount",
}


static func run() -> Dictionary:
	var errors := pure_contract_validation_errors()
	PetPortraitArtCatalog.clear_caches_for_qa()
	errors.append_array(PetPortraitArtCatalog.validation_errors())
	var records := PetArtCatalog.all_form_records()
	errors.append_array(
		authoritative_inventory_validation_errors(records, PetTemplateCatalog.forms())
	)
	var formal_count := 0
	for record in records:
		var form_id := str(record.get("formId", "")).strip_edges()
		if form_id == "":
			continue
		var first_texture := PetPortraitArtCatalog.texture_for_form(form_id)
		var second_texture := PetPortraitArtCatalog.texture_for_form(form_id)
		if first_texture != second_texture:
			errors.append("同一形态没有复用缓存 Texture2D：%s" % form_id)
		var expected_formal := first_texture != null
		if expected_formal:
			formal_count += 1
		var roster_button := PetListEntryButton.new()
		roster_button.configure({
			"formId": form_id,
			"name": str(record.get("displayName", form_id)),
			"level": 1,
			"power": 0,
			"selected": true,
		})
		if roster_button.uses_formal_art() != expected_formal:
			errors.append("底栏正式大头照状态与目录不一致：%s" % form_id)
		if roster_button.uses_formal_portrait() != expected_formal:
			errors.append("底栏 uses_formal_portrait 与目录不一致：%s" % form_id)
		if roster_button.shows_portrait_fallback() == expected_formal:
			errors.append("底栏缺图符号状态与正式大头照相反：%s" % form_id)
		if (
			expected_formal
			and roster_button.portrait_asset_path()
			!= PetPortraitArtCatalog.resource_path_for_form(form_id)
		):
			errors.append("底栏没有暴露目录登记的大头照路径：%s" % form_id)
		roster_button.free()
		var stage_button := PetGrowthStageButton.new()
		stage_button.configure_stage("阶段", form_id, true)
		if stage_button.uses_formal_art() != expected_formal:
			errors.append("成长阶段正式大头照状态与目录不一致：%s" % form_id)
		if stage_button.uses_formal_portrait() != expected_formal:
			errors.append("成长阶段 uses_formal_portrait 与目录不一致：%s" % form_id)
		if stage_button.shows_portrait_fallback() == expected_formal:
			errors.append("成长阶段缺图符号状态与正式大头照相反：%s" % form_id)
		stage_button.free()
	_append_unknown_form_errors(errors)
	return {
		"ok": errors.is_empty(),
		"catalogFormCount": records.size(),
		"formalPortraitCount": formal_count,
		"expectedFrameSize": [
			PetPortraitArtCatalog.EXPECTED_FRAME_SIZE.x,
			PetPortraitArtCatalog.EXPECTED_FRAME_SIZE.y,
		],
		"errors": errors,
	}


static func pure_contract_validation_errors() -> Array[String]:
	var errors: Array[String] = []
	_append_pure_contract_errors(errors)
	return errors


static func _append_pure_contract_errors(errors: Array[String]) -> void:
	var valid_fixture := {
		"formId": "fixture_headshot",
		"pet": {
			"root": "client/godot/assets/pets/fixture_headshot",
			"portraitPath": "client/godot/assets/pets/fixture_headshot/portrait/default.png",
		},
	}
	if not PetPortraitArtCatalog.contract_validation_errors_for_record(valid_fixture).is_empty():
		errors.append("显式 repo-relative 专用大头照记录被错误拒绝")
	var missing_fixture := {
		"formId": "fixture_missing",
		"pet": {
			"root": "client/godot/assets/pets/fixture_missing",
		},
	}
	if PetPortraitArtCatalog.contract_validation_errors_for_record(missing_fixture).is_empty():
		errors.append("缺少 pet.portraitPath 的记录没有失败关闭")
	var cross_bound_fixture := {
		"formId": "fixture_a",
		"pet": {
			"root": "client/godot/assets/pets/fixture_a",
			"portraitPath": "client/godot/assets/pets/fixture_b/portrait/default.png",
		},
	}
	if PetPortraitArtCatalog.contract_validation_errors_for_record(
		cross_bound_fixture
	).is_empty():
		errors.append("A 形态错误接受了 B 形态资产根下的大头照")
	for forbidden_path in [
		"client/godot/assets/pets/fixture/identity/portrait/default.png",
		"client/godot/assets/pets/fixture/world/portrait/default.png",
		"client/godot/assets/pets/fixture/battle/portrait/default.png",
		"client/godot/assets/pets/fixture/showcase/portrait/default.png",
	]:
		var forbidden_fixture := {
			"formId": "fixture_forbidden",
			"pet": {
				"root": "client/godot/assets/pets/fixture",
				"portraitPath": forbidden_path,
			},
		}
		if PetPortraitArtCatalog.contract_validation_errors_for_record(
			forbidden_fixture
		).is_empty():
			errors.append("全身或动作资产路径被错误接受为正式大头照：%s" % forbidden_path)
	var authoritative_templates := _authoritative_template_fixture()
	if not authoritative_inventory_validation_errors(
		_authoritative_formal_fixture(),
		authoritative_templates
	).is_empty():
		errors.append("36 个正式形态的权威库存夹具被错误拒绝")
	var deleted_records := _authoritative_formal_fixture()
	deleted_records.remove_at(0)
	if authoritative_inventory_validation_errors(
		deleted_records,
		authoritative_templates
	).is_empty():
		errors.append("删除一个正式大头照形态没有触发权威库存门禁")
	var swapped_records := _authoritative_formal_fixture()
	var swapped_record := swapped_records[0]
	var swapped_pet := swapped_record.get("pet", {}) as Dictionary
	var swapped_form_id := str(swapped_record.get("formId", ""))
	var replacement_form_id := (
		"thunder_dragon_mount"
		if swapped_form_id != "thunder_dragon_mount"
		else "bui_normal_red_fire10"
	)
	var replacement_root := str(EXPECTED_FORMAL_ROOTS.get(replacement_form_id, ""))
	swapped_pet["root"] = replacement_root
	swapped_pet["portraitPath"] = "%s/portrait/default.png" % replacement_root
	swapped_record["pet"] = swapped_pet
	swapped_records[0] = swapped_record
	if authoritative_inventory_validation_errors(
		swapped_records,
		authoritative_templates
	).is_empty():
		errors.append("把一个正式形态整套换成另一资产根没有触发权威库存门禁")
	var replaced_templates := _authoritative_template_fixture()
	replaced_templates.remove_at(0)
	replaced_templates.append({"formId": "fixture_replacement_form"})
	if authoritative_inventory_validation_errors(
		_authoritative_formal_fixture(),
		replaced_templates
	).is_empty():
		errors.append("替换一个玩法模板没有触发 36 形态边界门禁")


static func _authoritative_formal_fixture() -> Array[Dictionary]:
	var records: Array[Dictionary] = []
	for form_id_value in EXPECTED_FORMAL_ROOTS:
		var form_id := str(form_id_value)
		var pet_root := str(EXPECTED_FORMAL_ROOTS.get(form_id, ""))
		records.append({
			"formId": form_id,
			"pet": {
				"root": pet_root,
				"portraitPath": "%s/portrait/default.png" % pet_root,
			},
		})
	return records


static func _authoritative_template_fixture() -> Array[Dictionary]:
	var templates: Array[Dictionary] = []
	for form_id_value in EXPECTED_FORMAL_ROOTS:
		templates.append({"formId": str(form_id_value)})
	return templates


static func authoritative_inventory_validation_errors(
	records: Array[Dictionary],
	template_forms: Array[Dictionary]
) -> Array[String]:
	var errors: Array[String] = []
	if records.size() != EXPECTED_FORMAL_ROOTS.size():
		errors.append(
			"正式大头照美术目录必须恰好登记 %d 个形态，实际 %d"
			% [EXPECTED_FORMAL_ROOTS.size(), records.size()]
		)
	var actual_form_roots: Dictionary = {}
	for record in records:
		var form_id := str(record.get("formId", "")).strip_edges()
		if form_id == "":
			errors.append("正式大头照美术目录存在空 formId")
			continue
		if actual_form_roots.has(form_id):
			errors.append("正式大头照美术目录重复 formId：%s" % form_id)
			continue
		var pet_value = record.get("pet", {})
		var pet_root := (
			str((pet_value as Dictionary).get("root", "")).strip_edges()
			if pet_value is Dictionary
			else ""
		)
		actual_form_roots[form_id] = pet_root
		if not EXPECTED_FORMAL_ROOTS.has(form_id):
			errors.append("正式大头照美术目录出现未授权替换形态：%s" % form_id)
			continue
		var expected_root := str(EXPECTED_FORMAL_ROOTS.get(form_id, ""))
		if pet_root != expected_root:
			errors.append(
				"正式大头照形态资产根被替换：%s 期望 %s，实际 %s"
				% [form_id, expected_root, pet_root]
			)
	for form_id_value in EXPECTED_FORMAL_ROOTS:
		var form_id := str(form_id_value)
		if not actual_form_roots.has(form_id):
			errors.append("正式大头照美术目录删掉了权威形态：%s" % form_id)

	var expected_template_ids: Dictionary = {}
	for form_id_value in EXPECTED_FORMAL_ROOTS:
		expected_template_ids[str(form_id_value)] = true
	var actual_template_ids: Dictionary = {}
	for template in template_forms:
		var template_form_id := str(template.get("formId", "")).strip_edges()
		if template_form_id == "":
			errors.append("宠物玩法模板存在空 formId")
			continue
		if actual_template_ids.has(template_form_id):
			errors.append("宠物玩法模板重复 formId：%s" % template_form_id)
			continue
		actual_template_ids[template_form_id] = true
		if not expected_template_ids.has(template_form_id):
			errors.append("36 形态头像边界出现未授权玩法模板：%s" % template_form_id)
	for expected_id_value in expected_template_ids:
		var expected_id := str(expected_id_value)
		if not actual_template_ids.has(expected_id):
			errors.append("36 形态头像边界缺少玩法模板：%s" % expected_id)
	if actual_template_ids.size() != expected_template_ids.size():
		errors.append(
			"宠物玩法模板必须恰好为 36 个正式头像形态，实际 %d"
			% actual_template_ids.size()
		)
	var template_only_ids: Array[String] = []
	for template_id_value in actual_template_ids:
		var template_id := str(template_id_value)
		if not actual_form_roots.has(template_id):
			template_only_ids.append(template_id)
	template_only_ids.sort()
	if not template_only_ids.is_empty():
		errors.append(
			"玩法模板不得存在正式头像目录外的形态，实际 %s"
			% JSON.stringify(template_only_ids)
		)
	return errors


static func _append_unknown_form_errors(errors: Array[String]) -> void:
	const UNKNOWN_FORM_ID := "__portrait_catalog_unknown_form__"
	if PetPortraitArtCatalog.texture_for_form(UNKNOWN_FORM_ID) != null:
		errors.append("未知形态错误获得了正式大头照")
	if PetPortraitArtCatalog.declared_path_for_form(UNKNOWN_FORM_ID) != "":
		errors.append("未知形态错误获得了登记路径")
	var roster_button := PetListEntryButton.new()
	roster_button.configure({
		"formId": UNKNOWN_FORM_ID,
		"name": "未知宠物",
		"level": 1,
	})
	if roster_button.uses_formal_art() or not roster_button.shows_portrait_fallback():
		errors.append("未知形态的底栏没有安全显示缺图符号")
	roster_button.free()
	var stage_button := PetGrowthStageButton.new()
	stage_button.configure_stage("未知", UNKNOWN_FORM_ID, false)
	if stage_button.uses_formal_art() or not stage_button.shows_portrait_fallback():
		errors.append("未知形态的成长阶段没有安全显示缺图符号")
	stage_button.free()
