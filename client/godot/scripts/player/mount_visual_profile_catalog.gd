extends RefCounted

const CharacterActionAssetCatalog := preload("res://scripts/player/character_action_asset_catalog.gd")
const PetActionAssetCatalog := preload("res://scripts/pet/pet_action_asset_catalog.gd")

const DATA_PATH := "res://data/mount_visual_profiles.json"
const RUNTIME_RIG_CLASS := "quadruped_straddle"
const REQUIRED_VIEWS: Array[String] = ["front_3quarter_sw", "back_3quarter_ne"]
const REQUIRED_ACTIONS: Array[String] = ["idle", "walk"]

static var _catalog_loaded: bool = false
static var _catalog_cache: Dictionary = {}
static var _interface_texture_cache: Dictionary = {}


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
	return not profile_for_form(form_id).is_empty()


static func profile_for_form(form_id: String) -> Dictionary:
	var forms = catalog().get("forms", {})
	if not (forms is Dictionary):
		return {}
	var value = (forms as Dictionary).get(form_id.strip_edges(), {})
	return (value as Dictionary).duplicate(true) if value is Dictionary else {}


static func rider_action_for(mount_action: String) -> String:
	return "ride_walk" if mount_action == "walk" else "ride_idle"


static func composition_plan(form_id: String, view: String, action: String, frame_index: int) -> Dictionary:
	var profile := profile_for_form(form_id)
	if profile.is_empty():
		return {}
	var views = profile.get("views", {})
	if not (views is Dictionary):
		return {}
	var view_value = (views as Dictionary).get(view, {})
	if not (view_value is Dictionary):
		return {}
	var view_profile := view_value as Dictionary
	var actions = view_profile.get("actions", {})
	if not (actions is Dictionary):
		return {}
	var action_value = (actions as Dictionary).get(action, {})
	if not (action_value is Dictionary):
		return {}
	var anchors = (action_value as Dictionary).get("seatAnchors", [])
	if not (anchors is Array) or (anchors as Array).is_empty():
		return {}
	var anchor_values := anchors as Array
	var anchor_value = anchor_values[clampi(frame_index, 0, anchor_values.size() - 1)]
	if not (anchor_value is Array) or (anchor_value as Array).size() != 2:
		return {}
	var saddle_back_layer = view_profile.get("saddleBackLayer", {})
	var saddle_back := saddle_back_layer as Dictionary if saddle_back_layer is Dictionary else {}
	var saddle_back_path := str(saddle_back.get("texturePath", "")).strip_edges()
	return {
		"rigClass": str(profile.get("rigClass", "")),
		"riderPoseSet": str(profile.get("riderPoseSet", "")),
		"mountScale": float(profile.get("mountScale", 1.0)),
		"riderScale": float(profile.get("riderScale", 1.0)),
		"riderAnchor": _vector2(profile.get("riderAnchor", [128, 150])),
		"seatAnchor": _vector2(anchor_value),
		"groundAnchorY": float(view_profile.get("groundAnchorY", 224.0)),
		"saddleBackTexture": _interface_texture(saddle_back_path),
		"saddleBackScale": float(saddle_back.get("scale", 0.0)),
		"saddleBackAnchor": _vector2(saddle_back.get("anchor", [128, 138])),
		"frontOccluderRegions": _rect2_array(view_profile.get("frontOccluderRegions", [])),
		"shadow": (profile.get("shadow", {}) as Dictionary).duplicate(true) if profile.get("shadow", {}) is Dictionary else {},
		"worldPresentationScale": float(profile.get("worldPresentationScale", 1.0)),
		"battlePresentationScale": float(profile.get("battlePresentationScale", 1.0)),
	}


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	var loaded := catalog()
	if int(loaded.get("schemaVersion", 0)) != 1:
		errors.append("骑乘视觉配置 schemaVersion 必须为 1")
	var rig_classes = loaded.get("rigClasses", {})
	if not (rig_classes is Dictionary) or not (rig_classes as Dictionary).has(RUNTIME_RIG_CLASS):
		errors.append("缺少四足跨坐 rigClass")
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
		var rig_class := str(typed_profile.get("rigClass", ""))
		var rig_value = (rig_classes as Dictionary).get(rig_class, {}) if rig_classes is Dictionary else {}
		if not (rig_value is Dictionary) or str((rig_value as Dictionary).get("status", "")) != "runtime_ready":
			errors.append("坐骑引用了尚未落地的 rigClass：%s/%s" % [form_id, rig_class])
		if str(typed_profile.get("riderPoseSet", "")).strip_edges() == "":
			errors.append("坐骑没有声明可复用骑手姿态包：%s" % form_id)
		if not PetActionAssetCatalog.supports_form(form_id):
			errors.append("坐骑缺少正式宠物动作帧：%s" % form_id)
		if str(typed_profile.get("characterId", "")) != CharacterActionAssetCatalog.CHARACTER_ID:
			errors.append("骑手身份未绑定正式人物动作包：%s" % form_id)
		var views = typed_profile.get("views", {})
		if not (views is Dictionary):
			errors.append("坐骑缺少视角配置：%s" % form_id)
			continue
		for view in REQUIRED_VIEWS:
			var view_value = (views as Dictionary).get(view, {})
			if not (view_value is Dictionary):
				errors.append("坐骑缺少视角：%s/%s" % [form_id, view])
				continue
			var view_profile := view_value as Dictionary
			var saddle_back_layer = view_profile.get("saddleBackLayer", {})
			if not (saddle_back_layer is Dictionary):
				errors.append("坐骑鞍垫后层配置无效：%s/%s" % [form_id, view])
			else:
				var saddle_back := saddle_back_layer as Dictionary
				var saddle_back_path := str(saddle_back.get("texturePath", "")).strip_edges()
				if saddle_back_path == "" or not ResourceLoader.exists(saddle_back_path):
					errors.append("坐骑缺少鞍垫后层素材：%s/%s" % [form_id, view])
				if float(saddle_back.get("scale", 0.0)) <= 0.0:
					errors.append("坐骑鞍垫后层比例无效：%s/%s" % [form_id, view])
			var regions := _rect2_array(view_profile.get("frontOccluderRegions", []))
			if regions.is_empty():
				errors.append("坐骑没有前景遮挡区：%s/%s" % [form_id, view])
			for region_value in regions:
				var region := region_value as Rect2
				if region.size.x <= 0.0 or region.size.y <= 0.0 or not Rect2(Vector2.ZERO, Vector2(256, 256)).encloses(region):
					errors.append("前景遮挡区越界：%s/%s" % [form_id, view])
			var actions = view_profile.get("actions", {})
			for action in REQUIRED_ACTIONS:
				var action_value = (actions as Dictionary).get(action, {}) if actions is Dictionary else {}
				var anchors = (action_value as Dictionary).get("seatAnchors", []) if action_value is Dictionary else []
				var expected := int(PetActionAssetCatalog.FRAME_COUNTS[action])
				if not (anchors is Array) or (anchors as Array).size() != expected:
					errors.append("挂点帧数不匹配：%s/%s/%s" % [form_id, view, action])
					continue
				for anchor in anchors as Array:
					var point := _vector2(anchor)
					if point.x < 0.0 or point.x > 256.0 or point.y < 0.0 or point.y > 256.0:
						errors.append("挂点越界：%s/%s/%s" % [form_id, view, action])
	return errors


static func _interface_texture(path: String) -> Texture2D:
	if path == "":
		return null
	if _interface_texture_cache.has(path):
		return _interface_texture_cache[path] as Texture2D
	if not ResourceLoader.exists(path):
		return null
	var texture := load(path) as Texture2D
	_interface_texture_cache[path] = texture
	return texture


static func _vector2(value) -> Vector2:
	if value is Array and (value as Array).size() == 2:
		return Vector2(float((value as Array)[0]), float((value as Array)[1]))
	return Vector2.ZERO


static func _rect2(value) -> Rect2:
	if value is Array and (value as Array).size() == 4:
		return Rect2(
			float((value as Array)[0]),
			float((value as Array)[1]),
			float((value as Array)[2]),
			float((value as Array)[3])
		)
	return Rect2()


static func _rect2_array(value) -> Array[Rect2]:
	var regions: Array[Rect2] = []
	if not (value is Array):
		return regions
	for entry in value as Array:
		var region := _rect2(entry)
		if region.size.x > 0.0 and region.size.y > 0.0:
			regions.append(region)
	return regions
