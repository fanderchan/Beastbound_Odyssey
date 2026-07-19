extends RefCounted

const PetArtCatalog := preload("res://scripts/pet/pet_art_catalog.gd")
const WorldVisualDirectionContract := preload("res://scripts/world/world_visual_direction_contract.gd")

# Legacy constants remain public because the first Bui canary and its focused QA
# checks predate the data-driven catalog. New forms read their own bundle metadata.
const FORM_ID := "bui_novice_sprout_earth5_wind5"
const ROOT := "res://assets/pets/novice_sprout_bui/views"
const WORLD_ROOT := "res://assets/pets/novice_sprout_bui/world/directions"
const VIEW_FRONT := "front_3quarter_sw"
const VIEW_BACK := "back_3quarter_ne"
const VIEWS: Array[String] = [VIEW_FRONT, VIEW_BACK]
const WORLD_ACTIONS: Array[String] = ["idle", "walk"]
const BATTLE_ACTIONS: Array[String] = ["idle", "walk", "attack", "hurt", "defend", "stagger", "down"]
const FULL_BATTLE_ACTIONS: Array[String] = [
	"idle", "walk", "attack", "skill", "hurt", "defend",
	"dodge", "counter", "stagger", "knockaway", "down", "revive",
]
const FRAME_COUNTS := {
	"idle": 6,
	"walk": 8,
	"attack": 8,
	"hurt": 6,
	"defend": 6,
	"stagger": 8,
	"down": 8,
}
const WORLD_FRAME_COUNTS := {
	"idle": 1,
	"walk": 4,
}
const ACTION_FPS := {
	"idle": 8.0,
	"walk": 11.0,
	"attack": 12.0,
	"hurt": 12.0,
	"defend": 10.0,
	"stagger": 10.0,
	"down": 10.0,
}
const WORLD_ACTION_FPS := {
	"idle": 4.0,
	"walk": 10.0,
}

static var _texture_cache: Dictionary = {}
static var _metadata_cache: Dictionary = {}
static var _world_warmed: Dictionary = {}
static var _battle_warmed: Dictionary = {}
static var _qa_preview_forms: Dictionary = {}


static func enable_qa_preview_form(form_id: String) -> bool:
	var normalized := form_id.strip_edges()
	if not OS.is_debug_build() or normalized == "":
		return false
	if PetArtCatalog.form_record(normalized).is_empty() or _bundle_metadata(normalized).is_empty():
		return false
	_qa_preview_forms[normalized] = true
	_world_warmed.erase(normalized)
	_battle_warmed.erase(normalized)
	return true


static func disable_qa_preview_form(form_id: String) -> void:
	var normalized := form_id.strip_edges()
	_qa_preview_forms.erase(normalized)
	_world_warmed.erase(normalized)
	_battle_warmed.erase(normalized)


static func is_qa_preview_enabled(form_id: String) -> bool:
	return OS.is_debug_build() and bool(_qa_preview_forms.get(form_id.strip_edges(), false))


static func supports_form(form_id: String) -> bool:
	var normalized := form_id.strip_edges()
	return _battle_access_allowed(normalized) and not battle_actions_for_form(normalized).is_empty()


static func supports_world_form(form_id: String) -> bool:
	var normalized := form_id.strip_edges()
	return _world_access_allowed(normalized) and not _world_specs(normalized).is_empty()


static func battle_actions_for_form(form_id: String) -> Array[String]:
	var normalized := form_id.strip_edges()
	if normalized == FORM_ID and not is_qa_preview_enabled(normalized):
		# Keep the currently released seven-action canary stable while its formal
		# twelve-action repaint is still owner-pending in the same asset directory.
		return BATTLE_ACTIONS.duplicate()
	var result: Array[String] = []
	var specs := _action_specs(normalized)
	for action in FULL_BATTLE_ACTIONS:
		var value = specs.get(action, {})
		if value is Dictionary and _action_is_produced(value as Dictionary):
			result.append(action)
	# The canary predates the twelve-action contract and intentionally remains a
	# seven-action compatibility bundle until its own formal repaint lands.
	if normalized == FORM_ID and result.is_empty():
		return BATTLE_ACTIONS.duplicate()
	return result


static func frame_count_for_action(form_id: String, action: String) -> int:
	var normalized_action := _normalized_action(form_id, action)
	var spec = _action_specs(form_id).get(normalized_action, {})
	if spec is Dictionary:
		return maxi(1, int((spec as Dictionary).get("frameCount", FRAME_COUNTS.get(normalized_action, 1))))
	return maxi(1, int(FRAME_COUNTS.get(normalized_action, 1)))


static func warm_world_form(form_id: String) -> bool:
	var normalized := form_id.strip_edges()
	if not supports_world_form(normalized):
		return false
	if bool(_world_warmed.get(normalized, false)):
		return true
	var warmed := _warm_world_actions(normalized)
	_world_warmed[normalized] = warmed
	return warmed


static func warm_battle_form(form_id: String) -> bool:
	var normalized := form_id.strip_edges()
	if not supports_form(normalized):
		return false
	if bool(_battle_warmed.get(normalized, false)):
		return true
	var warmed := _warm_actions(normalized, battle_actions_for_form(normalized))
	_battle_warmed[normalized] = warmed
	return warmed


static func warm_battle_state(state: Dictionary) -> bool:
	var found_supported_form := false
	var all_warmed := true
	for value in state.get("actors", []):
		if not (value is Dictionary):
			continue
		var actor := value as Dictionary
		var form_id := str(actor.get("formId", actor.get("templateId", ""))).strip_edges()
		if supports_form(form_id):
			found_supported_form = true
			all_warmed = warm_battle_form(form_id) and all_warmed
	return found_supported_form and all_warmed


static func world_view_for_direction(facing: String) -> String:
	return WorldVisualDirectionContract.normalize_direction(facing)


static func world_flip_h_for_direction(_facing: String) -> bool:
	return false


static func battle_view_for_side(side: String) -> String:
	return VIEW_BACK if side.strip_edges().to_lower() == "ally" else VIEW_FRONT


static func battle_flip_h_for_side(side: String, _form_id: String = FORM_ID) -> bool:
	# Sources are independently authored SW-front and NE-back views. The battle
	# board faces enemy art SE and ally art NW with a presentation flip; no view
	# is synthesized from its opposite source.
	return ["ally", "enemy"].has(side.strip_edges().to_lower())


static func action_for_battle_state(action_state: String, form_id: String = FORM_ID) -> String:
	var normalized := action_state.strip_edges().to_lower()
	var desired := "idle"
	if ["attack", "combo", "multi_attack"].has(normalized):
		desired = "attack"
	elif normalized == "skill":
		desired = "skill"
	elif normalized == "counter_attack":
		desired = "counter"
	elif normalized == "down":
		desired = "down"
	elif normalized == "revive":
		desired = "revive"
	elif normalized == "wounded_return":
		desired = "stagger"
	elif normalized == "launched":
		desired = "knockaway"
	elif normalized == "hit" or normalized == "captured" or normalized.begins_with("status_"):
		desired = "hurt"
	elif normalized == "defend" or normalized == "guard_hit":
		desired = "defend"
	elif normalized == "dodge":
		desired = "dodge"
	elif ["escape", "switch_pet", "switch_in"].has(normalized):
		desired = "walk"
	var available := battle_actions_for_form(form_id)
	if available.has(desired):
		return desired
	if ["skill", "counter"].has(desired) and available.has("attack"):
		return "attack"
	if desired == "knockaway" and available.has("hurt"):
		return "hurt"
	if desired == "dodge" and available.has("walk"):
		return "walk"
	return "idle" if available.has("idle") else (available[0] if not available.is_empty() else "idle")


static func action_fps(action: String, form_id: String = FORM_ID) -> float:
	var normalized_action := _normalized_action(form_id, action)
	var spec = _action_specs(form_id).get(normalized_action, {})
	if spec is Dictionary:
		return maxf(1.0, float((spec as Dictionary).get("fps", ACTION_FPS.get(normalized_action, 8.0))))
	return maxf(1.0, float(ACTION_FPS.get(normalized_action, 8.0)))


static func world_action_fps(action: String, form_id: String = FORM_ID) -> float:
	var normalized_action := _normalized_world_action(action)
	var spec = _world_specs(form_id).get(normalized_action, {})
	if spec is Dictionary:
		return maxf(1.0, float((spec as Dictionary).get("fps", WORLD_ACTION_FPS[normalized_action])))
	return float(WORLD_ACTION_FPS[normalized_action])


static func world_frame_index_for_elapsed(action: String, elapsed_seconds: float, form_id: String = FORM_ID) -> int:
	var normalized_action := _normalized_world_action(action)
	var count := _world_frame_count(form_id, normalized_action)
	return int(floor(maxf(0.0, elapsed_seconds) * world_action_fps(normalized_action, form_id))) % count


static func texture_for_elapsed(form_id: String, view: String, action: String, elapsed_seconds: float) -> Texture2D:
	if not supports_form(form_id):
		return null
	var normalized_action := _normalized_action(form_id, action)
	var count := frame_count_for_action(form_id, normalized_action)
	var frame_index := int(floor(maxf(0.0, elapsed_seconds) * action_fps(normalized_action, form_id)))
	if _action_loops(form_id, normalized_action):
		frame_index %= count
	else:
		frame_index = mini(frame_index, count - 1)
	return _cached_texture(form_id, view, normalized_action, frame_index + 1)


static func texture_for_progress(form_id: String, view: String, action: String, progress: float) -> Texture2D:
	if not supports_form(form_id):
		return null
	var normalized_action := _normalized_action(form_id, action)
	var count := frame_count_for_action(form_id, normalized_action)
	var frame_index := mini(count - 1, int(floor(clampf(progress, 0.0, 1.0) * float(count))))
	return _cached_texture(form_id, view, normalized_action, frame_index + 1)


static func world_texture_for_elapsed(form_id: String, direction: String, action: String, elapsed_seconds: float) -> Texture2D:
	if not supports_world_form(form_id):
		return null
	return world_texture_for_frame(
		form_id,
		direction,
		action,
		world_frame_index_for_elapsed(action, elapsed_seconds, form_id) + 1
	)


static func world_texture_for_frame(form_id: String, direction: String, action: String, frame_index: int) -> Texture2D:
	if not supports_world_form(form_id):
		return null
	var path := world_frame_path_for_form(form_id, direction, action, frame_index)
	return _load_texture(path)


static func world_frame_path(direction: String, action: String, frame_index: int) -> String:
	return world_frame_path_for_form(FORM_ID, direction, action, frame_index)


static func world_frame_path_for_form(form_id: String, direction: String, action: String, frame_index: int) -> String:
	var normalized_direction := WorldVisualDirectionContract.normalize_direction(direction)
	var normalized_action := _normalized_world_action(action)
	var count := _world_frame_count(form_id, normalized_action)
	var safe_index := clampi(frame_index, 1, count)
	return "%s/%s/%s/%s-%d.png" % [
		_world_root(form_id), normalized_direction, normalized_action, normalized_action, safe_index,
	]


static func validation_errors() -> Array[String]:
	return validation_errors_for_form(FORM_ID, false)


static func validation_errors_for_form(form_id: String, require_full_battle: bool = true) -> Array[String]:
	var errors: Array[String] = []
	var normalized := form_id.strip_edges()
	if PetArtCatalog.form_record(normalized).is_empty():
		return ["宠物美术目录不存在 formId：%s" % normalized]
	var metadata := _bundle_metadata(normalized)
	if metadata.is_empty():
		return ["宠物动作 metadata 不可读：%s" % normalized]
	var expected_actions := FULL_BATTLE_ACTIONS if require_full_battle else (
		BATTLE_ACTIONS if normalized == FORM_ID else battle_actions_for_form(normalized)
	)
	var seen_count := 0
	for view in VIEWS:
		for action in expected_actions:
			if not battle_actions_for_form(normalized).has(action):
				errors.append("缺少正式战斗动作：%s/%s" % [normalized, action])
				continue
			var count := frame_count_for_action(normalized, action)
			for frame_index in range(1, count + 1):
				var path := _frame_path(normalized, view, action, frame_index)
				if not ResourceLoader.exists(path):
					errors.append("缺少帧：%s" % path)
					continue
				var texture = load(path)
				if not (texture is Texture2D):
					errors.append("不是 Texture2D：%s" % path)
					continue
				var typed_texture := texture as Texture2D
				if typed_texture.get_width() != 256 or typed_texture.get_height() != 256:
					errors.append("运行帧尺寸不是 256x256：%s" % path)
				seen_count += 1
	var expected_count := 0
	for action in expected_actions:
		if battle_actions_for_form(normalized).has(action):
			expected_count += frame_count_for_action(normalized, action) * VIEWS.size()
	if seen_count != expected_count:
		errors.append("正式动作帧应为 %d，实际可读 %d：%s" % [expected_count, seen_count, normalized])
	var seen_world_count := 0
	for direction in WorldVisualDirectionContract.DIRECTIONS:
		for action in WORLD_ACTIONS:
			for frame_index in range(1, _world_frame_count(normalized, action) + 1):
				var path := world_frame_path_for_form(normalized, direction, action, frame_index)
				if not ResourceLoader.exists(path):
					errors.append("缺少宠物世界八向帧：%s" % path)
					continue
				var texture = load(path)
				if not (texture is Texture2D):
					errors.append("宠物世界八向帧不是 Texture2D：%s" % path)
					continue
				var typed_texture := texture as Texture2D
				if typed_texture.get_width() != 256 or typed_texture.get_height() != 256:
					errors.append("宠物世界八向帧尺寸不是 256x256：%s" % path)
				seen_world_count += 1
	if seen_world_count != 40:
		errors.append("宠物世界八向帧应为 40，实际可读 %d：%s" % [seen_world_count, normalized])
	if (
		action_for_battle_state("combo", normalized) != "attack"
		or action_for_battle_state("hit", normalized) != "hurt"
		or action_for_battle_state("defend", normalized) != "defend"
		or action_for_battle_state("guard_hit", normalized) != "defend"
		or action_for_battle_state("wounded_return", normalized) != "stagger"
		or action_for_battle_state("down", normalized) != "down"
	):
		errors.append("战斗动作映射不完整：%s" % normalized)
	if require_full_battle and (
		action_for_battle_state("skill", normalized) != "skill"
		or action_for_battle_state("counter_attack", normalized) != "counter"
		or action_for_battle_state("dodge", normalized) != "dodge"
		or action_for_battle_state("launched", normalized) != "knockaway"
		or action_for_battle_state("revive", normalized) != "revive"
	):
		errors.append("十二动作状态映射不完整：%s" % normalized)
	if (
		battle_view_for_side("ally") != VIEW_BACK
		or battle_view_for_side("enemy") != VIEW_FRONT
		or not battle_flip_h_for_side("ally", normalized)
		or not battle_flip_h_for_side("enemy", normalized)
	):
		errors.append("战斗视角映射不正确：%s" % normalized)
	return errors


static func _warm_actions(form_id: String, actions: Array[String]) -> bool:
	var ok := true
	for view in VIEWS:
		for action in actions:
			for frame_index in range(1, frame_count_for_action(form_id, action) + 1):
				if _load_texture(_frame_path(form_id, view, action, frame_index)) == null:
					ok = false
	return ok


static func _warm_world_actions(form_id: String) -> bool:
	var ok := true
	for direction in WorldVisualDirectionContract.DIRECTIONS:
		for action in WORLD_ACTIONS:
			for frame_index in range(1, _world_frame_count(form_id, action) + 1):
				if _load_texture(world_frame_path_for_form(form_id, direction, action, frame_index)) == null:
					ok = false
	return ok


static func _cached_texture(form_id: String, view: String, action: String, frame_index: int) -> Texture2D:
	return _load_texture(_frame_path(form_id, _normalized_view(view), action, frame_index))


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


static func _frame_path(form_id: String, view: String, action: String, frame_index: int) -> String:
	return "%s/%s/%s/%s-%d.png" % [_battle_root(form_id), _normalized_view(view), action, action, frame_index]


static func _battle_root(form_id: String) -> String:
	return "%s/views" % _pet_root(form_id)


static func _world_root(form_id: String) -> String:
	return "%s/world/directions" % _pet_root(form_id)


static func _pet_root(form_id: String) -> String:
	var record := PetArtCatalog.form_record(form_id)
	var value = record.get("pet", {})
	if not (value is Dictionary):
		return ""
	return _resource_path(str((value as Dictionary).get("root", "")))


static func _bundle_metadata(form_id: String) -> Dictionary:
	var normalized := form_id.strip_edges()
	var cached = _metadata_cache.get(normalized, null)
	if cached is Dictionary:
		return cached as Dictionary
	var path := PetArtCatalog.pet_bundle_metadata_path(normalized)
	var metadata: Dictionary = {}
	if path != "" and FileAccess.file_exists(path):
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
		if parsed is Dictionary and str((parsed as Dictionary).get("formId", "")).strip_edges() == normalized:
			metadata = parsed as Dictionary
	_metadata_cache[normalized] = metadata
	return metadata


static func _action_specs(form_id: String) -> Dictionary:
	var value = _bundle_metadata(form_id).get("actions", {})
	return value as Dictionary if value is Dictionary else {}


static func _world_specs(form_id: String) -> Dictionary:
	var world_value = _bundle_metadata(form_id).get("worldVisual", {})
	if not (world_value is Dictionary):
		return {}
	var action_value = (world_value as Dictionary).get("actions", {})
	return action_value as Dictionary if action_value is Dictionary else {}


static func _action_is_produced(spec: Dictionary) -> bool:
	if int(spec.get("frameCount", 0)) <= 0:
		return false
	var status := str(spec.get("status", "produced")).strip_edges().to_lower()
	return status != "not_produced" and status != "planned" and status != "missing"


static func _action_loops(form_id: String, action: String) -> bool:
	var spec = _action_specs(form_id).get(action, {})
	return bool((spec as Dictionary).get("loop", ["idle", "walk"].has(action))) if spec is Dictionary else ["idle", "walk"].has(action)


static func _world_frame_count(form_id: String, action: String) -> int:
	var normalized := _normalized_world_action(action)
	var spec = _world_specs(form_id).get(normalized, {})
	return maxi(1, int((spec as Dictionary).get("frameCount", WORLD_FRAME_COUNTS[normalized]))) if spec is Dictionary else int(WORLD_FRAME_COUNTS[normalized])


static func _world_access_allowed(form_id: String) -> bool:
	return PetArtCatalog.supports_form(form_id) or is_qa_preview_enabled(form_id)


static func _battle_access_allowed(form_id: String) -> bool:
	return _world_access_allowed(form_id)


static func _normalized_view(view: String) -> String:
	return view if VIEWS.has(view) else VIEW_FRONT


static func _normalized_action(form_id: String, action: String) -> String:
	var available := battle_actions_for_form(form_id)
	return action if available.has(action) else ("idle" if available.has("idle") else (available[0] if not available.is_empty() else "idle"))


static func _normalized_world_action(action: String) -> String:
	return action if WORLD_FRAME_COUNTS.has(action) else "idle"


static func _resource_path(repo_relative_path: String) -> String:
	var normalized := repo_relative_path.strip_edges().replace("\\", "/")
	var prefix := "client/godot/"
	if normalized.begins_with(prefix):
		return "res://%s" % normalized.substr(prefix.length())
	return ""
