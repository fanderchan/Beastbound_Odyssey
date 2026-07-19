extends RefCounted

const PetArtCatalog := preload("res://scripts/pet/pet_art_catalog.gd")
const PetActionAssetCatalog := preload("res://scripts/pet/pet_action_asset_catalog.gd")
const WorldVisualDirectionContract := preload("res://scripts/world/world_visual_direction_contract.gd")

const DEFAULT_CHARACTER_ID := "novice_hunter_v1"
const ROOT := "res://assets/mounted"
const WORLD_VISUAL_STRATEGY := "ai_generated_integrated_independent_8"
const RUNTIME_BODY_LAYER_COUNT := 1
const USES_LAYERED_COMPOSITION := false
const USES_RUNTIME_MIRRORING := false
const VIEW_FRONT := "front_3quarter_sw"
const VIEW_BACK := "back_3quarter_ne"
const VIEWS: Array[String] = [VIEW_FRONT, VIEW_BACK]
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
		"battleRoot": "",
		"frameSize": [256, 256],
		"groundAnchorY": 244.0,
	},
}

static var _texture_cache: Dictionary = {}
static var _metadata_cache: Dictionary = {}
static var _warmed_combinations: Dictionary = {}
static var _battle_warmed_combinations: Dictionary = {}
static var _qa_preview_combinations: Dictionary = {}


static func enable_qa_preview_combination(character_id: String, form_id: String) -> bool:
	var normalized_character := character_id.strip_edges()
	var normalized_form := form_id.strip_edges()
	if not OS.is_debug_build() or normalized_character == "" or normalized_form == "":
		return false
	var record := PetArtCatalog.form_record(normalized_form)
	if record.is_empty() or not _supported_character_ids(record).has(normalized_character):
		return false
	if _bundle_metadata(normalized_character, normalized_form).is_empty():
		return false
	var key := _combination_key(normalized_character, normalized_form)
	_qa_preview_combinations[key] = true
	_warmed_combinations.erase(key)
	_battle_warmed_combinations.erase(key)
	return true


static func disable_qa_preview_combination(character_id: String, form_id: String) -> void:
	var key := _combination_key(character_id, form_id)
	_qa_preview_combinations.erase(key)
	_warmed_combinations.erase(key)
	_battle_warmed_combinations.erase(key)


static func is_qa_preview_enabled(character_id: String, form_id: String) -> bool:
	return OS.is_debug_build() and bool(_qa_preview_combinations.get(_combination_key(character_id, form_id), false))


static func supports_combination(character_id: String, form_id: String) -> bool:
	return not bundle_for_combination(character_id, form_id).is_empty()


static func supports_battle_combination(character_id: String, form_id: String) -> bool:
	return supports_combination(character_id, form_id) and not battle_actions_for_combination(character_id, form_id).is_empty()


static func supports_form(form_id: String, character_id: String = DEFAULT_CHARACTER_ID) -> bool:
	return supports_combination(character_id, form_id)


static func bundle_for_combination(character_id: String, form_id: String) -> Dictionary:
	var normalized_character := character_id.strip_edges()
	var normalized_form := form_id.strip_edges()
	var key := _combination_key(normalized_character, normalized_form)
	var registered = REGISTERED_COMBINATIONS.get(key, {})
	if registered is Dictionary and not (registered as Dictionary).is_empty():
		return (registered as Dictionary).duplicate(true)
	var metadata := _bundle_metadata(normalized_character, normalized_form)
	if metadata.is_empty() or not _dynamic_access_allowed(normalized_character, normalized_form, metadata):
		return {}
	var root := _mounted_root(normalized_form)
	if root == "":
		return {}
	var frame_size := _vector2i(metadata.get("runtimeFrameSize", [256, 256]))
	if frame_size == Vector2i.ZERO:
		frame_size = Vector2i(256, 256)
	return {
		"bundleId": str(metadata.get("bundleId", "qa_%s_%s" % [normalized_character, normalized_form])),
		"characterId": normalized_character,
		"formId": normalized_form,
		"worldRoot": "%s/world/directions" % root,
		"battleRoot": "%s/views" % root,
		"frameSize": [frame_size.x, frame_size.y],
		"groundAnchorY": float(metadata.get("groundAnchorY", 244.0)),
	}


static func bundle_id_for_combination(character_id: String, form_id: String) -> String:
	return str(bundle_for_combination(character_id, form_id).get("bundleId", ""))


static func warm_world_bundle(character_id: String, form_id: String) -> bool:
	var key := _combination_key(character_id, form_id)
	if not supports_combination(character_id, form_id):
		return false
	if bool(_warmed_combinations.get(key, false)):
		return true
	var ok := true
	for direction in WorldVisualDirectionContract.DIRECTIONS:
		for action in WORLD_ACTIONS:
			for frame_index in range(1, _world_frame_count(character_id, form_id, action) + 1):
				if _load_texture(world_frame_path(character_id, form_id, direction, action, frame_index)) == null:
					ok = false
	if ok:
		_warmed_combinations[key] = true
	return ok


static func warm_battle_bundle(character_id: String, form_id: String) -> bool:
	var key := _combination_key(character_id, form_id)
	if not supports_battle_combination(character_id, form_id):
		return false
	if bool(_battle_warmed_combinations.get(key, false)):
		return true
	var ok := true
	for view in VIEWS:
		for action in battle_actions_for_combination(character_id, form_id):
			for frame_index in range(1, battle_frame_count(character_id, form_id, action) + 1):
				if _load_texture(battle_frame_path(character_id, form_id, view, action, frame_index)) == null:
					ok = false
	if ok:
		_battle_warmed_combinations[key] = true
	return ok


static func warm_battle_state(state: Dictionary) -> bool:
	var found_supported_combination := false
	var all_warmed := true
	for value in state.get("actors", []):
		if not (value is Dictionary):
			continue
		var actor := value as Dictionary
		if str(actor.get("kind", "")) != "player":
			continue
		var form_id := str(actor.get("ridePetFormId", "")).strip_edges()
		if form_id == "":
			continue
		var character_id := DEFAULT_CHARACTER_ID
		if supports_battle_combination(character_id, form_id):
			found_supported_combination = true
			all_warmed = warm_battle_bundle(character_id, form_id) and all_warmed
	return found_supported_combination and all_warmed


static func warm_world_form(form_id: String, character_id: String = DEFAULT_CHARACTER_ID) -> bool:
	return warm_world_bundle(character_id, form_id)


static func world_action_fps(action: String, character_id: String = DEFAULT_CHARACTER_ID, form_id: String = "") -> float:
	var normalized_action := _normalized_world_action(action)
	var spec = _world_specs(character_id, form_id).get(normalized_action, {}) if form_id != "" else {}
	return maxf(1.0, float((spec as Dictionary).get("fps", WORLD_ACTION_FPS[normalized_action]))) if spec is Dictionary else float(WORLD_ACTION_FPS[normalized_action])


static func world_frame_index_for_elapsed(action: String, elapsed_seconds: float, character_id: String = DEFAULT_CHARACTER_ID, form_id: String = "") -> int:
	var normalized_action := _normalized_world_action(action)
	var count := _world_frame_count(character_id, form_id, normalized_action) if form_id != "" else int(WORLD_FRAME_COUNTS[normalized_action])
	return int(floor(maxf(0.0, elapsed_seconds) * world_action_fps(normalized_action, character_id, form_id))) % count


static func world_texture_for_elapsed(character_id: String, form_id: String, direction: String, action: String, elapsed_seconds: float) -> Texture2D:
	return world_texture_for_frame(
		character_id,
		form_id,
		direction,
		action,
		world_frame_index_for_elapsed(action, elapsed_seconds, character_id, form_id) + 1
	)


static func world_texture_for_frame(character_id: String, form_id: String, direction: String, action: String, frame_index: int) -> Texture2D:
	if not supports_combination(character_id, form_id):
		return null
	return _load_texture(world_frame_path(character_id, form_id, direction, action, frame_index))


static func world_frame_path(character_id: String, form_id: String, direction: String, action: String, frame_index: int) -> String:
	var bundle := bundle_for_combination(character_id, form_id)
	if bundle.is_empty():
		return ""
	var normalized_direction := WorldVisualDirectionContract.normalize_direction(direction)
	var normalized_action := _normalized_world_action(action)
	var count := _world_frame_count(character_id, form_id, normalized_action)
	var safe_index := clampi(frame_index, 1, count)
	return "%s/%s/%s/%s-%d.png" % [
		str(bundle.get("worldRoot", "")), normalized_direction, normalized_action, normalized_action, safe_index,
	]


static func battle_actions_for_combination(character_id: String, form_id: String) -> Array[String]:
	var result: Array[String] = []
	var normalized_character := character_id.strip_edges()
	var normalized_form := form_id.strip_edges()
	var metadata := _bundle_metadata(normalized_character, normalized_form)
	# Registered world canaries remain available for the released map path, but
	# a newly painted owner-pending mounted battle pack must not leak into normal
	# gameplay merely because it shares that directory. Only a runtime-approved
	# metadata record or an explicit debug QA preview may expose battle actions.
	if (
		not is_qa_preview_enabled(normalized_character, normalized_form)
		and (not PetArtCatalog.supports_form(normalized_form) or not bool(metadata.get("runtimeEnabled", false)))
	):
		return result
	var specs := _action_specs(character_id, form_id)
	for action in PetActionAssetCatalog.FULL_BATTLE_ACTIONS:
		var value = specs.get(action, {})
		if value is Dictionary and _action_is_produced(value as Dictionary):
			result.append(action)
	return result


static func battle_action_for_state(character_id: String, form_id: String, action_state: String) -> String:
	var normalized_state := action_state.strip_edges().to_lower()
	var desired := "idle"
	if ["attack", "combo", "multi_attack"].has(normalized_state):
		desired = "attack"
	elif normalized_state == "skill":
		desired = "skill"
	elif normalized_state == "counter_attack":
		desired = "counter"
	elif normalized_state == "down":
		desired = "down"
	elif normalized_state == "revive":
		desired = "revive"
	elif normalized_state == "wounded_return":
		desired = "stagger"
	elif normalized_state == "launched":
		desired = "knockaway"
	elif normalized_state == "hit" or normalized_state == "captured" or normalized_state.begins_with("status_"):
		desired = "hurt"
	elif normalized_state == "defend" or normalized_state == "guard_hit":
		desired = "defend"
	elif normalized_state == "dodge":
		desired = "dodge"
	elif ["escape", "switch_pet", "switch_in"].has(normalized_state):
		desired = "walk"
	var available := battle_actions_for_combination(character_id, form_id)
	if available.has(desired):
		return desired
	if ["skill", "counter"].has(desired) and available.has("attack"):
		return "attack"
	if desired == "knockaway" and available.has("hurt"):
		return "hurt"
	if desired == "dodge" and available.has("walk"):
		return "walk"
	return "idle" if available.has("idle") else (available[0] if not available.is_empty() else "idle")


static func battle_view_for_side(side: String) -> String:
	# Mounted whole-frame art and the pet fighting beside it share one battle
	# camera contract. Delegating here prevents the two presentation paths from
	# silently assigning opposite source views to the same team.
	return PetActionAssetCatalog.battle_view_for_side(side)


static func battle_flip_h_for_side(_character_id: String, form_id: String, side: String) -> bool:
	# Source frames remain independently authored SW-front and NE-back views.
	# Final board orientation is a shared presentation rule: both teams are
	# flipped from those source views so enemy and ally actors face the arena
	# centre. A bundle-specific override would let mounted actors disagree with
	# their same-side battle pets, so art must be normalized to this contract.
	return PetActionAssetCatalog.battle_flip_h_for_side(side, form_id)


static func battle_frame_count(character_id: String, form_id: String, action: String) -> int:
	var normalized := _normalized_battle_action(character_id, form_id, action)
	var spec = _action_specs(character_id, form_id).get(normalized, {})
	return maxi(1, int((spec as Dictionary).get("frameCount", 1))) if spec is Dictionary else 1


static func battle_action_fps(character_id: String, form_id: String, action: String) -> float:
	var normalized := _normalized_battle_action(character_id, form_id, action)
	var spec = _action_specs(character_id, form_id).get(normalized, {})
	return maxf(1.0, float((spec as Dictionary).get("fps", 8.0))) if spec is Dictionary else 8.0


static func battle_texture_for_elapsed(character_id: String, form_id: String, view: String, action: String, elapsed_seconds: float) -> Texture2D:
	if not supports_battle_combination(character_id, form_id):
		return null
	var normalized := _normalized_battle_action(character_id, form_id, action)
	var count := battle_frame_count(character_id, form_id, normalized)
	var frame_index := int(floor(maxf(0.0, elapsed_seconds) * battle_action_fps(character_id, form_id, normalized)))
	if _battle_action_loops(character_id, form_id, normalized):
		frame_index %= count
	else:
		frame_index = mini(frame_index, count - 1)
	return _load_texture(battle_frame_path(character_id, form_id, view, normalized, frame_index + 1))


static func battle_texture_for_progress(character_id: String, form_id: String, view: String, action: String, progress: float) -> Texture2D:
	if not supports_battle_combination(character_id, form_id):
		return null
	var normalized := _normalized_battle_action(character_id, form_id, action)
	var count := battle_frame_count(character_id, form_id, normalized)
	var frame_index := mini(count - 1, int(floor(clampf(progress, 0.0, 1.0) * float(count))))
	return _load_texture(battle_frame_path(character_id, form_id, view, normalized, frame_index + 1))


static func battle_frame_path(character_id: String, form_id: String, view: String, action: String, frame_index: int) -> String:
	var bundle := bundle_for_combination(character_id, form_id)
	if bundle.is_empty():
		return ""
	var normalized_view := view if VIEWS.has(view) else VIEW_FRONT
	var normalized_action := _normalized_battle_action(character_id, form_id, action)
	var safe_index := clampi(frame_index, 1, battle_frame_count(character_id, form_id, normalized_action))
	return "%s/%s/%s/%s-%d.png" % [
		str(bundle.get("battleRoot", "")), normalized_view, normalized_action, normalized_action, safe_index,
	]


static func world_ground_anchor_y(character_id: String, form_id: String) -> float:
	return float(bundle_for_combination(character_id, form_id).get("groundAnchorY", 244.0))


static func validation_errors(character_id: String = "", form_id: String = "", require_battle: bool = false) -> Array[String]:
	var errors: Array[String] = []
	var keys: Array[String] = []
	for key_value in REGISTERED_COMBINATIONS.keys():
		keys.append(str(key_value))
	if character_id != "" and form_id != "":
		var requested_key := _combination_key(character_id, form_id)
		if not keys.has(requested_key):
			keys.append(requested_key)
	for key in keys:
		var parts := key.split("|", false, 1)
		if parts.size() != 2:
			errors.append("骑乘整图组合 key 无效：%s" % key)
			continue
		var bundle_character_id := str(parts[0])
		var bundle_form_id := str(parts[1])
		if character_id != "" and bundle_character_id != character_id.strip_edges():
			continue
		if form_id != "" and bundle_form_id != form_id.strip_edges():
			continue
		var bundle := bundle_for_combination(bundle_character_id, bundle_form_id)
		if bundle.is_empty():
			errors.append("骑乘整图组合未获运行或 QA 授权：%s" % key)
			continue
		var frame_size := _vector2i(bundle.get("frameSize", [0, 0]))
		if frame_size != Vector2i(256, 256):
			errors.append("骑乘整图帧尺寸契约必须为 256x256：%s" % key)
		var ground_anchor_y := float(bundle.get("groundAnchorY", -1.0))
		if ground_anchor_y < 0.0 or ground_anchor_y > float(frame_size.y):
			errors.append("骑乘整图地面锚点越界：%s" % key)
		var seen_count := 0
		for direction in WorldVisualDirectionContract.DIRECTIONS:
			for action in WORLD_ACTIONS:
				for frame_index in range(1, _world_frame_count(bundle_character_id, bundle_form_id, action) + 1):
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
		if require_battle:
			var actions := battle_actions_for_combination(bundle_character_id, bundle_form_id)
			if actions != PetActionAssetCatalog.FULL_BATTLE_ACTIONS:
				errors.append("骑乘整图没有完整十二动作：%s" % key)
			for side in ["enemy", "ally"]:
				var mounted_view := battle_view_for_side(side)
				var pet_view := PetActionAssetCatalog.battle_view_for_side(side)
				var mounted_flip := battle_flip_h_for_side(bundle_character_id, bundle_form_id, side)
				var pet_flip := PetActionAssetCatalog.battle_flip_h_for_side(side, bundle_form_id)
				if mounted_view != pet_view or mounted_flip != pet_flip or not mounted_flip:
					errors.append(
					"骑乘整图与同队战宠没有共同朝向战场中心：%s/%s" % [key, side]
				)
			var battle_count := 0
			for view in VIEWS:
				for action in actions:
					for frame_index in range(1, battle_frame_count(bundle_character_id, bundle_form_id, action) + 1):
						var path := battle_frame_path(bundle_character_id, bundle_form_id, view, action, frame_index)
						if not ResourceLoader.exists(path):
							errors.append("缺少骑乘战斗整图帧：%s" % path)
							continue
						var texture = load(path)
						if not (texture is Texture2D):
							errors.append("骑乘战斗整图帧不是 Texture2D：%s" % path)
							continue
						battle_count += 1
			if battle_count != 180:
				errors.append("骑乘战斗整图帧应为 180，实际可读 %d：%s" % [battle_count, key])
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


static func _bundle_metadata(character_id: String, form_id: String) -> Dictionary:
	var key := _combination_key(character_id, form_id)
	var cached = _metadata_cache.get(key, null)
	if cached is Dictionary:
		return cached as Dictionary
	var path := PetArtCatalog.mounted_bundle_metadata_path(form_id)
	var metadata: Dictionary = {}
	if path != "" and FileAccess.file_exists(path):
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
		if (
			parsed is Dictionary
			and str((parsed as Dictionary).get("mountFormId", "")).strip_edges() == form_id.strip_edges()
			and str((parsed as Dictionary).get("characterId", "")).strip_edges() == character_id.strip_edges()
		):
			metadata = parsed as Dictionary
	_metadata_cache[key] = metadata
	return metadata


static func _mounted_root(form_id: String) -> String:
	var mounted_value = PetArtCatalog.form_record(form_id).get("mounted", {})
	return _resource_path(str((mounted_value as Dictionary).get("root", ""))) if mounted_value is Dictionary else ""


static func _dynamic_access_allowed(character_id: String, form_id: String, metadata: Dictionary) -> bool:
	if is_qa_preview_enabled(character_id, form_id):
		return true
	return PetArtCatalog.supports_form(form_id) and bool(metadata.get("runtimeEnabled", false))


static func _action_specs(character_id: String, form_id: String) -> Dictionary:
	var value = _bundle_metadata(character_id, form_id).get("actions", {})
	return value as Dictionary if value is Dictionary else {}


static func _world_specs(character_id: String, form_id: String) -> Dictionary:
	var world_value = _bundle_metadata(character_id, form_id).get("worldVisual", {})
	if not (world_value is Dictionary):
		return {}
	var actions = (world_value as Dictionary).get("actions", {})
	return actions as Dictionary if actions is Dictionary else {}


static func _action_is_produced(spec: Dictionary) -> bool:
	if int(spec.get("frameCount", 0)) <= 0:
		return false
	var status := str(spec.get("status", "produced")).strip_edges().to_lower()
	return status != "not_produced" and status != "planned" and status != "missing"


static func _battle_action_loops(character_id: String, form_id: String, action: String) -> bool:
	var spec = _action_specs(character_id, form_id).get(action, {})
	return bool((spec as Dictionary).get("loop", ["idle", "walk"].has(action))) if spec is Dictionary else ["idle", "walk"].has(action)


static func _world_frame_count(character_id: String, form_id: String, action: String) -> int:
	var normalized := _normalized_world_action(action)
	var spec = _world_specs(character_id, form_id).get(normalized, {})
	return maxi(1, int((spec as Dictionary).get("frameCount", WORLD_FRAME_COUNTS[normalized]))) if spec is Dictionary else int(WORLD_FRAME_COUNTS[normalized])


static func _normalized_battle_action(character_id: String, form_id: String, action: String) -> String:
	var available := battle_actions_for_combination(character_id, form_id)
	return action if available.has(action) else ("idle" if available.has("idle") else (available[0] if not available.is_empty() else "idle"))


static func _normalized_world_action(action: String) -> String:
	return action if WORLD_FRAME_COUNTS.has(action) else "idle"


static func _combination_key(character_id: String, form_id: String) -> String:
	return "%s|%s" % [character_id.strip_edges(), form_id.strip_edges()]


static func _supported_character_ids(record: Dictionary) -> Array[String]:
	var result: Array[String] = []
	var value = record.get("supportedCharacterIds", [])
	if value is Array:
		for item in value as Array:
			result.append(str(item).strip_edges())
	return result


static func _vector2i(value) -> Vector2i:
	if value is Array and (value as Array).size() == 2:
		return Vector2i(int((value as Array)[0]), int((value as Array)[1]))
	return Vector2i.ZERO


static func _resource_path(repo_relative_path: String) -> String:
	var normalized := repo_relative_path.strip_edges().replace("\\", "/")
	var prefix := "client/godot/"
	if normalized.begins_with(prefix):
		return "res://%s" % normalized.substr(prefix.length())
	return ""
