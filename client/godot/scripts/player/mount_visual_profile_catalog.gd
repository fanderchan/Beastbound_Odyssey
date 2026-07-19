extends RefCounted

const CharacterActionAssetCatalog := preload("res://scripts/player/character_action_asset_catalog.gd")
const MountedCharacterAssetCatalog := preload("res://scripts/player/mounted_character_asset_catalog.gd")
const PetActionAssetCatalog := preload("res://scripts/pet/pet_action_asset_catalog.gd")
const WorldVisualDirectionContract := preload("res://scripts/world/world_visual_direction_contract.gd")

const DATA_PATH := "res://data/mount_visual_profiles.json"
const PRESENTATION_MODE_INTEGRATED_MOUNTED_BODY := "integrated_mounted_body"
const PRESENTATION_MODE_ON_FOOT_CHARACTER_FALLBACK := "on_foot_character_fallback"
const QA_DEFAULT_WORLD_PRESENTATION_SCALE := 0.36
const QA_DEFAULT_BATTLE_PRESENTATION_SCALE := 0.88

static var _catalog_loaded: bool = false
static var _catalog_cache: Dictionary = {}
static var _world_plan_cache: Dictionary = {}
static var _qa_preview_forms: Dictionary = {}


static func enable_qa_preview_form(form_id: String) -> bool:
	var normalized := form_id.strip_edges()
	if not OS.is_debug_build() or normalized == "":
		return false
	var character_id := MountedCharacterAssetCatalog.DEFAULT_CHARACTER_ID
	if not MountedCharacterAssetCatalog.is_qa_preview_enabled(character_id, normalized):
		return false
	_qa_preview_forms[normalized] = true
	_clear_world_plan_cache_for_form(normalized)
	return true


static func disable_qa_preview_form(form_id: String) -> void:
	var normalized := form_id.strip_edges()
	_qa_preview_forms.erase(normalized)
	_clear_world_plan_cache_for_form(normalized)


static func is_qa_preview_enabled(form_id: String) -> bool:
	return OS.is_debug_build() and bool(_qa_preview_forms.get(form_id.strip_edges(), false))


static func catalog() -> Dictionary:
	if _catalog_loaded:
		return _catalog_cache
	_catalog_loaded = true
	if not FileAccess.file_exists(DATA_PATH):
		return _catalog_cache
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
	if parsed is Dictionary:
		_catalog_cache = parsed as Dictionary
	return _catalog_cache


static func supports_form(form_id: String) -> bool:
	return not _profile_for_form_internal(form_id).is_empty()


static func runtime_presentation_mode_for_form(form_id: String) -> String:
	var profile := _profile_for_form_internal(form_id)
	if profile.is_empty():
		return PRESENTATION_MODE_ON_FOOT_CHARACTER_FALLBACK
	var character_id := str(profile.get("characterId", "")).strip_edges()
	if not MountedCharacterAssetCatalog.supports_combination(character_id, form_id):
		return PRESENTATION_MODE_ON_FOOT_CHARACTER_FALLBACK
	return PRESENTATION_MODE_INTEGRATED_MOUNTED_BODY


static func profile_for_form(form_id: String) -> Dictionary:
	return _profile_for_form_internal(form_id).duplicate(true)


static func character_id_for_form(form_id: String) -> String:
	return str(_profile_for_form_internal(form_id).get("characterId", "")).strip_edges()


static func mounted_bundle_id_for_form(form_id: String) -> String:
	return str(_profile_for_form_internal(form_id).get("mountedBundleId", "")).strip_edges()


static func world_presentation_scale_for_form(form_id: String) -> float:
	return float(_profile_for_form_internal(form_id).get("worldPresentationScale", 1.0))


static func battle_presentation_scale_for_form(form_id: String) -> float:
	return float(_profile_for_form_internal(form_id).get("battlePresentationScale", 1.0))


static func shadow_for_form(form_id: String) -> Dictionary:
	var value = _profile_for_form_internal(form_id).get("shadow", {})
	return (value as Dictionary).duplicate(true) if value is Dictionary else {}


static func _profile_for_form_internal(form_id: String) -> Dictionary:
	var normalized := form_id.strip_edges()
	var forms = catalog().get("forms", {})
	if forms is Dictionary:
		var value = (forms as Dictionary).get(normalized, {})
		if value is Dictionary and not (value as Dictionary).is_empty():
			return value as Dictionary
	if not is_qa_preview_enabled(normalized):
		return {}
	var character_id := MountedCharacterAssetCatalog.DEFAULT_CHARACTER_ID
	if not MountedCharacterAssetCatalog.supports_combination(character_id, normalized):
		return {}
	return {
		"characterId": character_id,
		"mountedBundleId": MountedCharacterAssetCatalog.bundle_id_for_combination(character_id, normalized),
		"worldVisualStrategy": MountedCharacterAssetCatalog.WORLD_VISUAL_STRATEGY,
		"worldPresentationScale": QA_DEFAULT_WORLD_PRESENTATION_SCALE,
		"battlePresentationScale": QA_DEFAULT_BATTLE_PRESENTATION_SCALE,
		"battleDirections": {
			"ally": "northwest",
			"enemy": "southeast",
		},
		"shadow": {
			"offset": [0, 4],
			"size": [170, 28],
			"alpha": 0.25,
		},
		"qaDerived": true,
	}


static func battle_direction_for_side(form_id: String, side: String) -> String:
	var profile := _profile_for_form_internal(form_id)
	var direction_key := "ally" if side.strip_edges().to_lower() == "ally" else "enemy"
	var directions = profile.get("battleDirections", {})
	var direction := str((directions as Dictionary).get(direction_key, "")) if directions is Dictionary else ""
	return WorldVisualDirectionContract.normalize_direction(direction)

static func warm_world_form(form_id: String) -> bool:
	var profile := _profile_for_form_internal(form_id)
	if profile.is_empty():
		return false
	var character_id := str(profile.get("characterId", "")).strip_edges()
	return MountedCharacterAssetCatalog.warm_world_bundle(character_id, form_id)


static func world_frame_plan(form_id: String, direction: String, action: String, frame_index: int) -> Dictionary:
	var normalized_action := "walk" if action == "walk" else "idle"
	var count := int(MountedCharacterAssetCatalog.WORLD_FRAME_COUNTS[normalized_action])
	var safe_index := clampi(frame_index, 0, count - 1)
	var cache_key := "%s|%s|%s|%d" % [form_id.strip_edges(), direction, normalized_action, safe_index]
	var cached = _world_plan_cache.get(cache_key, {})
	if cached is Dictionary and not (cached as Dictionary).is_empty():
		return cached as Dictionary
	var profile := _profile_for_form_internal(form_id)
	if profile.is_empty():
		return {}
	var character_id := str(profile.get("characterId", "")).strip_edges()
	var texture_path := MountedCharacterAssetCatalog.world_frame_path(
		character_id,
		form_id,
		direction,
		normalized_action,
		safe_index + 1
	)
	var texture := MountedCharacterAssetCatalog.world_texture_for_frame(
		character_id,
		form_id,
		direction,
		normalized_action,
		safe_index + 1
	)
	if texture == null:
		return {}
	var plan := {
		"characterId": character_id,
		"texturePath": texture_path,
		"texture": texture,
		"groundAnchorY": MountedCharacterAssetCatalog.world_ground_anchor_y(character_id, form_id),
		"shadow": shadow_for_form(form_id),
		"worldPresentationScale": world_presentation_scale_for_form(form_id),
		"runtimeBodyLayers": MountedCharacterAssetCatalog.RUNTIME_BODY_LAYER_COUNT,
		"runtimeLayeredComposition": MountedCharacterAssetCatalog.USES_LAYERED_COMPOSITION,
		"runtimeMirroring": MountedCharacterAssetCatalog.USES_RUNTIME_MIRRORING,
	}
	_world_plan_cache[cache_key] = plan
	return plan


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	var loaded := catalog()
	if int(loaded.get("schemaVersion", 0)) != 3:
		errors.append("骑乘视觉配置 schemaVersion 必须为 3")
	var forms = loaded.get("forms", {})
	if not (forms is Dictionary) or (forms as Dictionary).is_empty():
		errors.append("没有可用的骑乘视觉档案")
		return errors
	for form_id_value in (forms as Dictionary).keys():
		var form_id := str(form_id_value)
		var profile = (forms as Dictionary).get(form_id_value, {})
		if not (profile is Dictionary):
			errors.append("骑乘视觉档案不是对象：%s" % form_id)
			continue
		var typed_profile := profile as Dictionary
		if not PetActionAssetCatalog.supports_form(form_id):
			errors.append("坐骑缺少正式宠物动作帧：%s" % form_id)
		var character_id := str(typed_profile.get("characterId", "")).strip_edges()
		if character_id != CharacterActionAssetCatalog.CHARACTER_ID:
			errors.append("骑手身份未绑定正式人物动作包：%s" % form_id)
		if str(typed_profile.get("worldVisualStrategy", "")) != MountedCharacterAssetCatalog.WORLD_VISUAL_STRATEGY:
			errors.append("世界骑乘必须使用 AI 整体烘焙独立八向：%s" % form_id)
		if float(typed_profile.get("worldPresentationScale", 0.0)) <= 0.0:
			errors.append("世界骑乘展示比例无效：%s" % form_id)
		if float(typed_profile.get("battlePresentationScale", 0.0)) <= 0.0:
			errors.append("战斗骑乘展示比例无效：%s" % form_id)
		if not MountedCharacterAssetCatalog.supports_combination(character_id, form_id):
			errors.append("缺少人物与宠物的整体骑乘资产登记：%s/%s" % [character_id, form_id])
		else:
			var mounted_bundle_id := str(typed_profile.get("mountedBundleId", "")).strip_edges()
			var registered_bundle_id := MountedCharacterAssetCatalog.bundle_id_for_combination(character_id, form_id)
			if mounted_bundle_id == "" or mounted_bundle_id != registered_bundle_id:
				errors.append("骑乘视觉档案引用了错误的整体动作包：%s/%s" % [form_id, mounted_bundle_id])
			errors.append_array(MountedCharacterAssetCatalog.validation_errors(character_id, form_id))
		var battle_directions = typed_profile.get("battleDirections", {})
		if not (battle_directions is Dictionary):
			errors.append("骑乘视觉档案缺少战场朝向：%s" % form_id)
		else:
			var ally_direction := str((battle_directions as Dictionary).get("ally", "")).strip_edges().to_lower()
			var enemy_direction := str((battle_directions as Dictionary).get("enemy", "")).strip_edges().to_lower()
			if not WorldVisualDirectionContract.DIRECTIONS.has(ally_direction):
				errors.append("己方骑乘战场朝向无效：%s/%s" % [form_id, ally_direction])
			if not WorldVisualDirectionContract.DIRECTIONS.has(enemy_direction):
				errors.append("敌方骑乘战场朝向无效：%s/%s" % [form_id, enemy_direction])
			if ally_direction == enemy_direction:
				errors.append("骑乘战场双方不能读取同一朝向：%s" % form_id)
		var shadow_value = typed_profile.get("shadow", {})
		if not (shadow_value is Dictionary):
			errors.append("骑乘视觉档案阴影配置无效：%s" % form_id)
		else:
			var shadow := shadow_value as Dictionary
			var shadow_size := _vector2(shadow.get("size", [0, 0]))
			var shadow_alpha := float(shadow.get("alpha", -1.0))
			if shadow_size.x <= 0.0 or shadow_size.y <= 0.0:
				errors.append("骑乘阴影尺寸无效：%s" % form_id)
			if shadow_alpha < 0.0 or shadow_alpha > 0.6:
				errors.append("骑乘阴影透明度无效：%s" % form_id)
	return errors


static func _vector2(value) -> Vector2:
	if value is Array and (value as Array).size() == 2:
		return Vector2(float((value as Array)[0]), float((value as Array)[1]))
	return Vector2.ZERO


static func _clear_world_plan_cache_for_form(form_id: String) -> void:
	var prefix := "%s|" % form_id.strip_edges()
	for key_value in _world_plan_cache.keys():
		if str(key_value).begins_with(prefix):
			_world_plan_cache.erase(key_value)
