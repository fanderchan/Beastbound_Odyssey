extends RefCounted

const WorldVisualDirectionContract := preload("res://scripts/world/world_visual_direction_contract.gd")

const DEFAULT_CHARACTER_ID := "novice_hunter_v1"
const ROOT := "res://assets/mounted"
const WORLD_VISUAL_STRATEGY := "ai_generated_integrated_independent_8"
const RUNTIME_BODY_LAYER_COUNT := 1
const USES_LAYERED_COMPOSITION := false
const USES_RUNTIME_MIRRORING := false
const WORLD_ACTIONS: Array[String] = ["idle", "walk"]
const WORLD_FRAME_COUNTS := {
	"idle": 1,
	"walk": 4,
}
const WORLD_ACTION_FPS := {
	"idle": 4.0,
	"walk": 10.0,
}
const REGISTERED_COMBINATIONS := {
	"novice_hunter_v1|bui_novice_sprout_earth5_wind5": {
		"bundleId": "mounted_action_novice_hunter_v1_bui_novice_sprout_v1",
		"characterId": "novice_hunter_v1",
		"formId": "bui_novice_sprout_earth5_wind5",
		"worldRoot": "res://assets/mounted/novice_hunter_v1/bui_novice_sprout_earth5_wind5/world/directions",
		"frameSize": [256, 256],
		"groundAnchorY": 244.0,
	},
}

static var _texture_cache: Dictionary = {}
static var _warmed_combinations: Dictionary = {}


static func supports_combination(character_id: String, form_id: String) -> bool:
	return REGISTERED_COMBINATIONS.has(_combination_key(character_id, form_id))


static func supports_form(form_id: String, character_id: String = DEFAULT_CHARACTER_ID) -> bool:
	return supports_combination(character_id, form_id)


static func bundle_for_combination(character_id: String, form_id: String) -> Dictionary:
	var value = REGISTERED_COMBINATIONS.get(_combination_key(character_id, form_id), {})
	return (value as Dictionary).duplicate(true) if value is Dictionary else {}


static func bundle_id_for_combination(character_id: String, form_id: String) -> String:
	var bundle := bundle_for_combination(character_id, form_id)
	return str(bundle.get("bundleId", ""))


static func warm_world_bundle(character_id: String, form_id: String) -> bool:
	var key := _combination_key(character_id, form_id)
	if not REGISTERED_COMBINATIONS.has(key):
		return false
	if bool(_warmed_combinations.get(key, false)):
		return true
	var ok := true
	for direction in WorldVisualDirectionContract.DIRECTIONS:
		for action_value in WORLD_FRAME_COUNTS.keys():
			var action := str(action_value)
			for frame_index in range(1, int(WORLD_FRAME_COUNTS[action]) + 1):
				var path := world_frame_path(character_id, form_id, direction, action, frame_index)
				var texture := _load_texture(path)
				if texture == null:
					ok = false
	if ok:
		_warmed_combinations[key] = true
	return ok


static func warm_world_form(form_id: String, character_id: String = DEFAULT_CHARACTER_ID) -> bool:
	return warm_world_bundle(character_id, form_id)


static func world_action_fps(action: String) -> float:
	var normalized_action := _normalized_action(action)
	return float(WORLD_ACTION_FPS[normalized_action])


static func world_frame_index_for_elapsed(action: String, elapsed_seconds: float) -> int:
	var normalized_action := _normalized_action(action)
	var count := int(WORLD_FRAME_COUNTS[normalized_action])
	return int(floor(maxf(0.0, elapsed_seconds) * world_action_fps(normalized_action))) % count


static func world_texture_for_elapsed(
	character_id: String,
	form_id: String,
	direction: String,
	action: String,
	elapsed_seconds: float
) -> Texture2D:
	return world_texture_for_frame(
		character_id,
		form_id,
		direction,
		action,
		world_frame_index_for_elapsed(action, elapsed_seconds) + 1
	)


static func world_texture_for_frame(
	character_id: String,
	form_id: String,
	direction: String,
	action: String,
	frame_index: int
) -> Texture2D:
	if not supports_combination(character_id, form_id):
		return null
	return _load_texture(world_frame_path(character_id, form_id, direction, action, frame_index))


static func world_frame_path(
	character_id: String,
	form_id: String,
	direction: String,
	action: String,
	frame_index: int
) -> String:
	var bundle = REGISTERED_COMBINATIONS.get(_combination_key(character_id, form_id), {})
	if not (bundle is Dictionary):
		return ""
	var normalized_direction := WorldVisualDirectionContract.normalize_direction(direction)
	var normalized_action := _normalized_action(action)
	var count := int(WORLD_FRAME_COUNTS[normalized_action])
	var safe_index := clampi(frame_index, 1, count)
	return "%s/%s/%s/%s-%d.png" % [
		str((bundle as Dictionary).get("worldRoot", "")),
		normalized_direction,
		normalized_action,
		normalized_action,
		safe_index,
	]


static func world_ground_anchor_y(character_id: String, form_id: String) -> float:
	var bundle = REGISTERED_COMBINATIONS.get(_combination_key(character_id, form_id), {})
	return float((bundle as Dictionary).get("groundAnchorY", 244.0)) if bundle is Dictionary else 244.0


static func validation_errors(character_id: String = "", form_id: String = "") -> Array[String]:
	var errors: Array[String] = []
	for key_value in REGISTERED_COMBINATIONS.keys():
		var key := str(key_value)
		var bundle_value = REGISTERED_COMBINATIONS.get(key_value, {})
		if not (bundle_value is Dictionary):
			errors.append("骑乘整图组合配置不是对象：%s" % key)
			continue
		var bundle := bundle_value as Dictionary
		var bundle_character_id := str(bundle.get("characterId", ""))
		var bundle_form_id := str(bundle.get("formId", ""))
		if character_id != "" and bundle_character_id != character_id.strip_edges():
			continue
		if form_id != "" and bundle_form_id != form_id.strip_edges():
			continue
		var frame_size := _vector2i(bundle.get("frameSize", [0, 0]))
		if frame_size != Vector2i(256, 256):
			errors.append("骑乘整图帧尺寸契约必须为 256x256：%s" % key)
		var ground_anchor_y := float(bundle.get("groundAnchorY", -1.0))
		if ground_anchor_y < 0.0 or ground_anchor_y > float(frame_size.y):
			errors.append("骑乘整图地面锚点越界：%s" % key)
		var seen_count := 0
		for direction in WorldVisualDirectionContract.DIRECTIONS:
			for action_value in WORLD_FRAME_COUNTS.keys():
				var action := str(action_value)
				for frame_index in range(1, int(WORLD_FRAME_COUNTS[action]) + 1):
					var path := world_frame_path(bundle_character_id, bundle_form_id, direction, action, frame_index)
					if not ResourceLoader.exists(path):
						errors.append("缺少骑乘整图世界帧：%s" % path)
						continue
					var texture = load(path)
					if not (texture is Texture2D):
						errors.append("骑乘整图世界帧不是 Texture2D：%s" % path)
						continue
					var typed_texture := texture as Texture2D
					if typed_texture.get_width() != frame_size.x or typed_texture.get_height() != frame_size.y:
						errors.append("骑乘整图世界帧尺寸错误：%s" % path)
					seen_count += 1
		if seen_count != 40:
			errors.append("骑乘整图世界八向帧应为 40，实际可读 %d：%s" % [seen_count, key])
	return errors


static func _load_texture(path: String) -> Texture2D:
	if path == "":
		return null
	var cached = _texture_cache.get(path)
	if cached is Texture2D:
		return cached as Texture2D
	if not ResourceLoader.exists(path):
		return null
	var loaded = load(path)
	if loaded is Texture2D:
		_texture_cache[path] = loaded
		return loaded as Texture2D
	return null


static func _combination_key(character_id: String, form_id: String) -> String:
	return "%s|%s" % [character_id.strip_edges(), form_id.strip_edges()]


static func _normalized_action(action: String) -> String:
	return action if WORLD_FRAME_COUNTS.has(action) else "idle"


static func _vector2i(value) -> Vector2i:
	if value is Array and (value as Array).size() == 2:
		return Vector2i(int((value as Array)[0]), int((value as Array)[1]))
	return Vector2i.ZERO
