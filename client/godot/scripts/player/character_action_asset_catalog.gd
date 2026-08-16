extends RefCounted

const WorldVisualDirectionContract := preload("res://scripts/world/world_visual_direction_contract.gd")

const APPEARANCE_CATALOG_PATH := "res://data/player_appearances.json"
const CHARACTER_ID := "novice_hunter_v1"
const ROOT := "res://assets/characters/novice_hunter/views"
const WORLD_ROOT := "res://assets/characters/novice_hunter/world"
const VIEW_FRONT := "front_3quarter_sw"
const VIEW_BACK := "back_3quarter_ne"
const VIEWS: Array[String] = [VIEW_FRONT, VIEW_BACK]

# These constants remain public for the released novice-hunter mount review.
# New playable appearances use their own action-bundle metadata instead.
const ACTIONS: Array[String] = ["idle", "walk", "ride_idle", "ride_walk"]
const RUNTIME_ACTIONS: Array[String] = ["idle", "walk"]
const FULL_BATTLE_ACTIONS: Array[String] = [
	"idle", "walk", "attack", "skill", "hurt", "defend",
	"dodge", "counter", "stagger_return", "knockaway", "down", "revive",
]
const FULL_BATTLE_FRAME_COUNTS := {
	"idle": 6,
	"walk": 8,
	"attack": 8,
	"skill": 8,
	"hurt": 6,
	"defend": 6,
	"dodge": 8,
	"counter": 8,
	"stagger_return": 8,
	"knockaway": 8,
	"down": 8,
	"revive": 8,
}
const FRAME_COUNTS := {
	"idle": 6,
	"walk": 8,
	"ride_idle": 6,
	"ride_walk": 8,
}
const WORLD_FRAME_COUNTS := {
	"idle": 1,
	"walk": 4,
}
const ACTION_FPS := {
	"idle": 8.0,
	"walk": 11.0,
	"ride_idle": 8.0,
	"ride_walk": 11.0,
}
const WORLD_ACTION_FPS := {
	"idle": 4.0,
	"walk": 10.0,
}

static var _texture_cache: Dictionary = {}
static var _metadata_cache: Dictionary = {}
static var _world_warmed: Dictionary = {}
static var _battle_warmed: Dictionary = {}
static var _appearance_catalog_loaded: bool = false
static var _appearance_entries: Dictionary = {}
static var _appearance_order: Array[String] = []
static var _appearance_catalog_errors: Array[String] = []


static func appearance_ids() -> Array[String]:
	_ensure_appearance_catalog_loaded()
	return _appearance_order.duplicate()


static func appearance_catalog_errors() -> Array[String]:
	_ensure_appearance_catalog_loaded()
	return _appearance_catalog_errors.duplicate()


static func resolve_appearance_id(appearance_id: String) -> String:
	_ensure_appearance_catalog_loaded()
	var normalized := appearance_id.strip_edges()
	return normalized if _appearance_entries.has(normalized) else CHARACTER_ID


static func appearance_entry(appearance_id: String) -> Dictionary:
	var resolved := resolve_appearance_id(appearance_id)
	var value = _appearance_entries.get(resolved, {})
	return (value as Dictionary).duplicate(true) if value is Dictionary else {}


static func asset_root_for_appearance(appearance_id: String) -> String:
	_ensure_appearance_catalog_loaded()
	var resolved := resolve_appearance_id(appearance_id)
	var value = _appearance_entries.get(resolved, {})
	return str((value as Dictionary).get("characterAssetRoot", "")) if value is Dictionary else ""


static func appearance_supports_mounted_character(
	appearance_id: String,
	mounted_character_id: String
) -> bool:
	var required := mounted_character_id.strip_edges()
	return required != "" and resolve_appearance_id(appearance_id) == required


static func supports_world_appearance(appearance_id: String) -> bool:
	var resolved := resolve_appearance_id(appearance_id)
	var specs := _world_specs(resolved)
	return specs.has("idle") and specs.has("walk")


static func supports_battle_appearance(appearance_id: String) -> bool:
	return _has_battle_action(appearance_id, "idle")


static func warm(appearance_id: String = CHARACTER_ID) -> bool:
	var resolved := resolve_appearance_id(appearance_id)
	return warm_world(resolved) and warm_battle(resolved)


static func warm_world(appearance_id: String = CHARACTER_ID) -> bool:
	var resolved := resolve_appearance_id(appearance_id)
	if bool(_world_warmed.get(resolved, false)):
		return true
	if not supports_world_appearance(resolved):
		return false
	var warmed := _warm_world_actions(resolved)
	if warmed:
		_world_warmed[resolved] = true
	return warmed


static func warm_battle(appearance_id: String = CHARACTER_ID) -> bool:
	var resolved := resolve_appearance_id(appearance_id)
	if bool(_battle_warmed.get(resolved, false)):
		return true
	var actions := battle_actions_for_appearance(resolved)
	if actions.is_empty():
		return false
	var warmed := _warm_battle_actions(resolved, actions)
	if warmed:
		_battle_warmed[resolved] = true
	return warmed


static func world_view_for_direction(facing: String) -> String:
	return WorldVisualDirectionContract.normalize_direction(facing)


static func world_flip_h_for_direction(_facing: String) -> bool:
	return false


static func battle_view_for_side(side: String) -> String:
	return VIEW_BACK if side.strip_edges().to_lower() == "ally" else VIEW_FRONT


static func battle_flip_h_for_side(side: String, _appearance_id: String = CHARACTER_ID) -> bool:
	# Front and back remain independently authored sources. Their canonical
	# source directions are SW-front and NE-back, so the battle presentation
	# flips both valid sides to face enemy art SE and ally art NW respectively.
	return ["ally", "enemy"].has(side.strip_edges().to_lower())


static func battle_actions_for_appearance(appearance_id: String) -> Array[String]:
	var resolved := resolve_appearance_id(appearance_id)
	var specs := _action_specs(resolved)
	var result: Array[String] = []
	for action in FULL_BATTLE_ACTIONS:
		var value = specs.get(action, {})
		if value is Dictionary and _action_is_produced(value as Dictionary):
			result.append(action)
	# The existing novice bundle remains usable while its full Phase379 repaint
	# is landing. Known new appearances never fall back to novice art.
	if resolved == CHARACTER_ID and result.is_empty():
		for action in RUNTIME_ACTIONS:
			if ResourceLoader.exists(_frame_path(resolved, VIEW_FRONT, action, 1)):
				result.append(action)
	return result


static func action_for_battle_state(
	action_state: String,
	appearance_id: String = CHARACTER_ID
) -> String:
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
		desired = "stagger_return"
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
	var available := battle_actions_for_appearance(appearance_id)
	if _has_battle_action(appearance_id, desired):
		return desired
	if ["skill", "counter"].has(desired) and _has_battle_action(appearance_id, "attack"):
		return "attack"
	if desired == "knockaway" and _has_battle_action(appearance_id, "hurt"):
		return "hurt"
	if desired == "dodge" and _has_battle_action(appearance_id, "walk"):
		return "walk"
	return "idle" if _has_battle_action(appearance_id, "idle") else (available[0] if not available.is_empty() else "idle")


static func frame_count_for_action(
	action: String,
	appearance_id: String = CHARACTER_ID
) -> int:
	var normalized := _normalized_action(appearance_id, action)
	var spec = _action_specs(appearance_id).get(normalized, {})
	if spec is Dictionary:
		return maxi(1, int((spec as Dictionary).get("frameCount", FRAME_COUNTS.get(normalized, 1))))
	return maxi(1, int(FRAME_COUNTS.get(normalized, 1)))


static func action_fps(action: String, appearance_id: String = CHARACTER_ID) -> float:
	var normalized := _normalized_action(appearance_id, action)
	var spec = _action_specs(appearance_id).get(normalized, {})
	if spec is Dictionary:
		return maxf(1.0, float((spec as Dictionary).get("fps", ACTION_FPS.get(normalized, 8.0))))
	return maxf(1.0, float(ACTION_FPS.get(normalized, 8.0)))


static func world_action_fps(action: String, appearance_id: String = CHARACTER_ID) -> float:
	var normalized := _normalized_world_action(action)
	var spec = _world_specs(appearance_id).get(normalized, {})
	if spec is Dictionary:
		return maxf(1.0, float((spec as Dictionary).get("fps", WORLD_ACTION_FPS[normalized])))
	return float(WORLD_ACTION_FPS[normalized])


static func world_frame_count_for_action(
	action: String,
	appearance_id: String = CHARACTER_ID
) -> int:
	return _world_frame_count(appearance_id, _normalized_world_action(action))


static func frame_index_for_elapsed(
	action: String,
	elapsed_seconds: float,
	appearance_id: String = CHARACTER_ID
) -> int:
	var normalized := _normalized_action(appearance_id, action)
	var count := frame_count_for_action(normalized, appearance_id)
	var frame_index := int(floor(maxf(0.0, elapsed_seconds) * action_fps(normalized, appearance_id)))
	if _action_loops(appearance_id, normalized):
		return frame_index % count
	return mini(frame_index, count - 1)


static func world_frame_index_for_elapsed(
	action: String,
	elapsed_seconds: float,
	appearance_id: String = CHARACTER_ID
) -> int:
	var normalized := _normalized_world_action(action)
	var count := _world_frame_count(appearance_id, normalized)
	return int(floor(maxf(0.0, elapsed_seconds) * world_action_fps(normalized, appearance_id))) % count


static func texture_for_elapsed(
	view: String,
	action: String,
	elapsed_seconds: float,
	appearance_id: String = CHARACTER_ID
) -> Texture2D:
	return texture_for_frame(
		view,
		action,
		frame_index_for_elapsed(action, elapsed_seconds, appearance_id) + 1,
		appearance_id
	)


static func texture_for_progress(
	view: String,
	action: String,
	progress: float,
	appearance_id: String = CHARACTER_ID
) -> Texture2D:
	var normalized := _normalized_action(appearance_id, action)
	var count := frame_count_for_action(normalized, appearance_id)
	var frame_index := mini(count - 1, int(floor(clampf(progress, 0.0, 1.0) * float(count))))
	return texture_for_frame(view, normalized, frame_index + 1, appearance_id)


static func texture_for_frame(
	view: String,
	action: String,
	frame_index: int,
	appearance_id: String = CHARACTER_ID
) -> Texture2D:
	if not supports_battle_appearance(appearance_id):
		return null
	var normalized := _normalized_action(appearance_id, action)
	var count := frame_count_for_action(normalized, appearance_id)
	var safe_index := clampi(frame_index, 1, count)
	return _load_texture(_frame_path(appearance_id, _normalized_view(view), normalized, safe_index))


static func world_texture_for_elapsed(
	direction: String,
	action: String,
	elapsed_seconds: float,
	appearance_id: String = CHARACTER_ID
) -> Texture2D:
	return world_texture_for_frame(
		direction,
		action,
		world_frame_index_for_elapsed(action, elapsed_seconds, appearance_id) + 1,
		appearance_id
	)


static func world_texture_for_frame(
	direction: String,
	action: String,
	frame_index: int,
	appearance_id: String = CHARACTER_ID
) -> Texture2D:
	if not supports_world_appearance(appearance_id):
		return null
	return _load_texture(world_frame_path(direction, action, frame_index, appearance_id))


static func world_frame_path(
	direction: String,
	action: String,
	frame_index: int,
	appearance_id: String = CHARACTER_ID
) -> String:
	var normalized_direction := WorldVisualDirectionContract.normalize_direction(direction)
	var normalized_action := _normalized_world_action(action)
	var count := _world_frame_count(appearance_id, normalized_action)
	var safe_index := clampi(frame_index, 1, count)
	return "%s/%s/%s/%s-%d.png" % [
		_world_root(appearance_id), normalized_direction, normalized_action, normalized_action, safe_index,
	]


# Historical novice-hunter validation stays narrow so the released mount review
# remains reproducible while Phase379 owns the new four-appearance hard gate.
static func validation_errors() -> Array[String]:
	var errors := appearance_catalog_errors()
	var seen_legacy_count := 0
	for view in VIEWS:
		for action in ACTIONS:
			for frame_index in range(1, int(FRAME_COUNTS[action]) + 1):
				var path := "%s/%s/%s/%s-%d.png" % [ROOT, view, action, action, frame_index]
				var texture := _load_texture(path)
				if texture == null:
					errors.append("缺少人物帧：%s" % path)
					continue
				if texture.get_width() != 256 or texture.get_height() != 256:
					errors.append("人物运行帧尺寸不是 256x256：%s" % path)
				seen_legacy_count += 1
	if seen_legacy_count != 56:
		errors.append("人物战斗兼容视角动作帧应为 56，实际可读 %d" % seen_legacy_count)
	var seen_world_count := _append_world_validation_errors(errors, CHARACTER_ID)
	if seen_world_count != 40:
		errors.append("人物世界八向帧应为 40，实际可读 %d" % seen_world_count)
	return errors


static func validation_errors_for_appearance(
	appearance_id: String,
	require_full_battle: bool = true
) -> Array[String]:
	_ensure_appearance_catalog_loaded()
	var requested := appearance_id.strip_edges()
	if not _appearance_entries.has(requested):
		return ["人物形象目录不存在 appearanceId：%s" % requested]
	var errors: Array[String] = []
	var metadata := _bundle_metadata(requested)
	if metadata.is_empty():
		return ["人物动作 metadata 不可读：%s" % requested]
	if str(metadata.get("characterId", "")).strip_edges() != requested:
		errors.append("人物动作 metadata characterId 不一致：%s" % requested)
	var frame_size := _vector2i(metadata.get("runtimeFrameSize", [256, 256]))
	if frame_size != Vector2i(256, 256):
		errors.append("人物运行帧尺寸合同必须为 256x256：%s" % requested)
	var metadata_views := _string_array(metadata.get("views", []))
	if metadata_views != VIEWS:
		errors.append("人物战斗必须恰好声明两个独立正式视角：%s" % requested)
	var world_visual = metadata.get("worldVisual", {})
	if not (world_visual is Dictionary):
		errors.append("人物动作 metadata 缺少 worldVisual：%s" % requested)
	else:
		var world := world_visual as Dictionary
		if bool(world.get("runtimeMirroring", true)):
			errors.append("人物世界动作禁止运行时镜像：%s" % requested)
		var directions := _string_array(world.get("directions", []))
		if directions.size() != WorldVisualDirectionContract.DIRECTIONS.size():
			errors.append("人物世界动作必须声明八个独立方向：%s" % requested)
	var idle_world_count := _world_frame_count(requested, "idle")
	var walk_world_count := _world_frame_count(requested, "walk")
	if idle_world_count != 1:
		errors.append("人物世界待机必须恰好为 1 帧：%s/%d" % [requested, idle_world_count])
	if walk_world_count < 4 or walk_world_count > 12 or walk_world_count % 2 != 0:
		errors.append(
			"人物世界行走必须为 4 到 12 之间的偶数帧：%s/%d" % [requested, walk_world_count]
		)
	var seen_world_count := _append_world_validation_errors(errors, requested)
	var expected_world_count := (
		WorldVisualDirectionContract.DIRECTIONS.size()
		* (idle_world_count + walk_world_count)
	)
	if seen_world_count != expected_world_count:
		errors.append("人物世界八向帧应为 %d，实际可读 %d：%s" % [
			expected_world_count,
			seen_world_count,
			requested,
		])
	var actions := battle_actions_for_appearance(requested)
	var expected_actions := FULL_BATTLE_ACTIONS if require_full_battle else actions
	if require_full_battle and actions != FULL_BATTLE_ACTIONS:
		errors.append("人物战斗没有完整十二动作：%s" % requested)
	if require_full_battle:
		for action in FULL_BATTLE_ACTIONS:
			if (
				actions.has(action)
				and frame_count_for_action(action, requested)
				!= int(FULL_BATTLE_FRAME_COUNTS[action])
			):
				errors.append("人物正式战斗动作帧数不正确：%s/%s" % [requested, action])
	var seen_battle_count := 0
	for view in VIEWS:
		for action in expected_actions:
			if not actions.has(action):
				errors.append("缺少人物正式战斗动作：%s/%s" % [requested, action])
				continue
			for frame_index in range(1, frame_count_for_action(action, requested) + 1):
				var path := _frame_path(requested, view, action, frame_index)
				var texture := _load_texture(path)
				if texture == null:
					errors.append("人物战斗帧不是 Texture2D：%s" % path)
					continue
				if texture.get_width() != frame_size.x or texture.get_height() != frame_size.y:
					errors.append("人物战斗帧尺寸错误：%s" % path)
				seen_battle_count += 1
	var expected_battle_count := 0
	for action in expected_actions:
		if actions.has(action):
			expected_battle_count += frame_count_for_action(action, requested) * VIEWS.size()
	if seen_battle_count != expected_battle_count:
		errors.append("人物战斗动作帧应为 %d，实际可读 %d：%s" % [
			expected_battle_count, seen_battle_count, requested,
		])
	if require_full_battle and expected_battle_count != 180:
		errors.append("人物十二动作必须为 180 帧：%s/%d" % [requested, expected_battle_count])
	if require_full_battle:
		_append_down_revive_continuity_errors(errors, requested)
		if (
			action_for_battle_state("combo", requested) != "attack"
			or action_for_battle_state("skill", requested) != "skill"
			or action_for_battle_state("hit", requested) != "hurt"
			or action_for_battle_state("defend", requested) != "defend"
			or action_for_battle_state("dodge", requested) != "dodge"
			or action_for_battle_state("counter_attack", requested) != "counter"
			or action_for_battle_state("wounded_return", requested) != "stagger_return"
			or action_for_battle_state("launched", requested) != "knockaway"
			or action_for_battle_state("down", requested) != "down"
			or action_for_battle_state("revive", requested) != "revive"
		):
			errors.append("人物十二动作状态映射不完整：%s" % requested)
	return errors


static func _append_world_validation_errors(errors: Array[String], appearance_id: String) -> int:
	var seen := 0
	for direction in WorldVisualDirectionContract.DIRECTIONS:
		for action in WORLD_FRAME_COUNTS.keys():
			var action_id := str(action)
			for frame_index in range(1, _world_frame_count(appearance_id, action_id) + 1):
				var path := world_frame_path(direction, action_id, frame_index, appearance_id)
				var texture := _load_texture(path)
				if texture == null:
					errors.append("人物世界八向帧不是 Texture2D：%s" % path)
					continue
				if texture.get_width() != 256 or texture.get_height() != 256:
					errors.append("人物世界八向帧尺寸不是 256x256：%s" % path)
				seen += 1
	return seen


static func _append_down_revive_continuity_errors(
	errors: Array[String],
	appearance_id: String
) -> void:
	var actions := battle_actions_for_appearance(appearance_id)
	if not actions.has("down") or not actions.has("revive"):
		return
	for view in VIEWS:
		var down := texture_for_frame(view, "down", 8, appearance_id)
		var revive := texture_for_frame(view, "revive", 1, appearance_id)
		if down == null or revive == null:
			continue
		var down_image := down.get_image()
		var revive_image := revive.get_image()
		if down_image.get_data() != revive_image.get_data():
			errors.append("人物 down-8 与 revive-1 不连续：%s/%s" % [appearance_id, view])


static func _warm_battle_actions(appearance_id: String, actions: Array[String]) -> bool:
	var ok := true
	for view in VIEWS:
		for action in actions:
			for frame_index in range(1, frame_count_for_action(action, appearance_id) + 1):
				if _load_texture(_frame_path(appearance_id, view, action, frame_index)) == null:
					ok = false
	return ok


static func _warm_world_actions(appearance_id: String) -> bool:
	var ok := true
	for direction in WorldVisualDirectionContract.DIRECTIONS:
		for action in WORLD_FRAME_COUNTS.keys():
			var action_id := str(action)
			for frame_index in range(1, _world_frame_count(appearance_id, action_id) + 1):
				if _load_texture(world_frame_path(direction, action_id, frame_index, appearance_id)) == null:
					ok = false
	return ok


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


static func _frame_path(
	appearance_id: String,
	view: String,
	action: String,
	frame_index: int
) -> String:
	return "%s/%s/%s/%s-%d.png" % [
		_battle_root(appearance_id), view, action, action, frame_index,
	]


static func _battle_root(appearance_id: String) -> String:
	return "%s/views" % asset_root_for_appearance(appearance_id)


static func _world_root(appearance_id: String) -> String:
	return "%s/world/directions" % asset_root_for_appearance(appearance_id)


static func _bundle_metadata(appearance_id: String) -> Dictionary:
	var resolved := resolve_appearance_id(appearance_id)
	var cached = _metadata_cache.get(resolved, null)
	if cached is Dictionary:
		return cached as Dictionary
	var metadata: Dictionary = {}
	var path := "%s/action-bundle-meta.json" % asset_root_for_appearance(resolved)
	if FileAccess.file_exists(path):
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
		if (
			parsed is Dictionary
			and str((parsed as Dictionary).get("characterId", "")).strip_edges() == resolved
		):
			metadata = parsed as Dictionary
	_metadata_cache[resolved] = metadata
	return metadata


static func _action_specs(appearance_id: String) -> Dictionary:
	var value = _bundle_metadata(appearance_id).get("actions", {})
	return value as Dictionary if value is Dictionary else {}


static func _world_specs(appearance_id: String) -> Dictionary:
	var world_value = _bundle_metadata(appearance_id).get("worldVisual", {})
	if not (world_value is Dictionary):
		return {}
	var world := world_value as Dictionary
	var action_value = world.get("actions", {})
	if action_value is Dictionary and not (action_value as Dictionary).is_empty():
		return action_value as Dictionary
	var on_foot_value = world.get("onFoot", {})
	if on_foot_value is Dictionary:
		var nested_actions = (on_foot_value as Dictionary).get("actions", {})
		if nested_actions is Dictionary:
			return nested_actions as Dictionary
	return {}


static func _action_is_produced(spec: Dictionary) -> bool:
	if int(spec.get("frameCount", 0)) <= 0:
		return false
	var status := str(spec.get("status", "produced")).strip_edges().to_lower()
	return status != "not_produced" and status != "planned" and status != "missing"


static func _has_battle_action(appearance_id: String, action: String) -> bool:
	var resolved := resolve_appearance_id(appearance_id)
	var value = _action_specs(resolved).get(action, {})
	if value is Dictionary and _action_is_produced(value as Dictionary):
		return true
	return (
		resolved == CHARACTER_ID
		and RUNTIME_ACTIONS.has(action)
		and ResourceLoader.exists(_frame_path(resolved, VIEW_FRONT, action, 1))
	)


static func _action_loops(appearance_id: String, action: String) -> bool:
	var spec = _action_specs(appearance_id).get(action, {})
	return bool((spec as Dictionary).get("loop", ["idle", "walk"].has(action))) if spec is Dictionary else ["idle", "walk"].has(action)


static func _world_frame_count(appearance_id: String, action: String) -> int:
	var normalized := _normalized_world_action(action)
	var spec = _world_specs(appearance_id).get(normalized, {})
	return maxi(1, int((spec as Dictionary).get("frameCount", WORLD_FRAME_COUNTS[normalized]))) if spec is Dictionary else int(WORLD_FRAME_COUNTS[normalized])


static func _normalized_view(view: String) -> String:
	return view if VIEWS.has(view) else VIEW_FRONT


static func _normalized_action(appearance_id: String, action: String) -> String:
	if _has_battle_action(appearance_id, action):
		return action
	if _has_battle_action(appearance_id, "idle"):
		return "idle"
	var available := battle_actions_for_appearance(appearance_id)
	return available[0] if not available.is_empty() else "idle"


static func _normalized_world_action(action: String) -> String:
	return action if WORLD_FRAME_COUNTS.has(action) else "idle"


static func _ensure_appearance_catalog_loaded() -> void:
	if _appearance_catalog_loaded:
		return
	_appearance_catalog_loaded = true
	_appearance_entries.clear()
	_appearance_order.clear()
	_appearance_catalog_errors.clear()
	if FileAccess.file_exists(APPEARANCE_CATALOG_PATH):
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(APPEARANCE_CATALOG_PATH))
		if parsed is Dictionary:
			var values = (parsed as Dictionary).get("appearances", [])
			if values is Array:
				for value in values as Array:
					if not (value is Dictionary):
						_appearance_catalog_errors.append("人物形象目录条目格式无效")
						continue
					var raw := value as Dictionary
					if not bool(raw.get("selectable", false)):
						continue
					var appearance_id := str(raw.get("appearanceId", "")).strip_edges()
					var root := _resource_path(str(raw.get("characterAssetRoot", "")))
					if appearance_id == "" or _appearance_entries.has(appearance_id):
						_appearance_catalog_errors.append("人物形象 ID 缺失或重复")
						continue
					if root == "":
						_appearance_catalog_errors.append("人物形象缺少合法素材根：%s" % appearance_id)
						continue
					var entry := raw.duplicate(true)
					entry["appearanceId"] = appearance_id
					entry["characterAssetRoot"] = root
					_appearance_entries[appearance_id] = entry
					_appearance_order.append(appearance_id)
			else:
				_appearance_catalog_errors.append("人物形象目录 appearances 格式无效")
		else:
			_appearance_catalog_errors.append("人物形象目录 JSON 格式无效")
	else:
		_appearance_catalog_errors.append("缺少人物形象目录")
	if not _appearance_entries.has(CHARACTER_ID):
		# Runtime-only compatibility for old profiles. The focused Phase379 check
		# still reports the catalog error and cannot pass through this fallback.
		_appearance_catalog_errors.append("人物形象目录缺少旧档案回退：%s" % CHARACTER_ID)
		_appearance_entries[CHARACTER_ID] = {
			"appearanceId": CHARACTER_ID,
			"characterAssetRoot": "res://assets/characters/novice_hunter",
		}
		_appearance_order.push_front(CHARACTER_ID)


static func _resource_path(path_value: String) -> String:
	var normalized := path_value.strip_edges().replace("\\", "/").trim_suffix("/")
	if normalized.begins_with("res://") and not normalized.contains(".."):
		return normalized
	var prefix := "client/godot/"
	if normalized.begins_with(prefix) and not normalized.contains(".."):
		return "res://%s" % normalized.substr(prefix.length())
	return ""


static func _string_array(value: Variant) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value as Array:
			result.append(str(item))
	return result


static func _vector2i(value: Variant) -> Vector2i:
	if value is Array and (value as Array).size() >= 2:
		return Vector2i(int((value as Array)[0]), int((value as Array)[1]))
	return Vector2i.ZERO
