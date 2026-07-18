extends RefCounted

const WorldVisualDirectionContract := preload("res://scripts/world/world_visual_direction_contract.gd")

const CHARACTER_ID := "novice_hunter_v1"
const ROOT := "res://assets/characters/novice_hunter/views"
const WORLD_ROOT := "res://assets/characters/novice_hunter/world"
const VIEW_FRONT := "front_3quarter_sw"
const VIEW_BACK := "back_3quarter_ne"
const VIEWS: Array[String] = [VIEW_FRONT, VIEW_BACK]
const ACTIONS: Array[String] = ["idle", "walk", "ride_idle", "ride_walk"]
const RUNTIME_ACTIONS: Array[String] = ["idle", "walk"]
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
static var _warmed: bool = false
static var _world_warmed: bool = false


static func warm() -> bool:
	var legacy_ok := _warmed or _warm_runtime_actions()
	var world_ok := _world_warmed or _warm_world_actions()
	_warmed = legacy_ok
	_world_warmed = world_ok
	return legacy_ok and world_ok


static func warm_world() -> bool:
	if _world_warmed:
		return true
	_world_warmed = _warm_world_actions()
	return _world_warmed


static func world_view_for_direction(facing: String) -> String:
	return WorldVisualDirectionContract.normalize_direction(facing)


static func world_flip_h_for_direction(facing: String) -> bool:
	return false


static func battle_view_for_side(side: String) -> String:
	return VIEW_BACK if side.strip_edges().to_lower() == "ally" else VIEW_FRONT


static func battle_flip_h_for_side(side: String) -> bool:
	return ["ally", "enemy"].has(side.strip_edges().to_lower())


static func action_fps(action: String) -> float:
	return float(ACTION_FPS.get(_normalized_action(action), ACTION_FPS["idle"]))


static func world_action_fps(action: String) -> float:
	return float(WORLD_ACTION_FPS.get(_normalized_world_action(action), WORLD_ACTION_FPS["idle"]))


static func frame_index_for_elapsed(action: String, elapsed_seconds: float) -> int:
	var normalized_action := _normalized_action(action)
	var count := int(FRAME_COUNTS[normalized_action])
	return int(floor(maxf(0.0, elapsed_seconds) * action_fps(normalized_action))) % count


static func world_frame_index_for_elapsed(action: String, elapsed_seconds: float) -> int:
	var normalized_action := _normalized_world_action(action)
	var count := int(WORLD_FRAME_COUNTS[normalized_action])
	return int(floor(maxf(0.0, elapsed_seconds) * world_action_fps(normalized_action))) % count


static func texture_for_elapsed(view: String, action: String, elapsed_seconds: float) -> Texture2D:
	return texture_for_frame(view, action, frame_index_for_elapsed(action, elapsed_seconds) + 1)


static func texture_for_frame(view: String, action: String, frame_index: int) -> Texture2D:
	var normalized_action := _normalized_action(action)
	var count := int(FRAME_COUNTS[normalized_action])
	var safe_index := clampi(frame_index, 1, count)
	var path := _frame_path(_normalized_view(view), normalized_action, safe_index)
	var texture = _texture_cache.get(path)
	if texture is Texture2D:
		return texture as Texture2D
	var loaded = load(path)
	if loaded is Texture2D:
		_texture_cache[path] = loaded
		return loaded as Texture2D
	return null


static func world_texture_for_elapsed(direction: String, action: String, elapsed_seconds: float) -> Texture2D:
	return world_texture_for_frame(
		direction,
		action,
		world_frame_index_for_elapsed(action, elapsed_seconds) + 1
	)


static func world_texture_for_frame(direction: String, action: String, frame_index: int) -> Texture2D:
	var normalized_direction := WorldVisualDirectionContract.normalize_direction(direction)
	var normalized_action := _normalized_world_action(action)
	var count := int(WORLD_FRAME_COUNTS[normalized_action])
	var safe_index := clampi(frame_index, 1, count)
	var path := _world_frame_path(normalized_direction, normalized_action, safe_index)
	var texture = _texture_cache.get(path)
	return texture as Texture2D if texture is Texture2D else null


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	var seen_legacy_count := 0
	for view in VIEWS:
		for action in ACTIONS:
			var count := int(FRAME_COUNTS[action])
			for frame_index in range(1, count + 1):
				var path := _frame_path(view, action, frame_index)
				if not ResourceLoader.exists(path):
					errors.append("缺少人物帧：%s" % path)
					continue
				var texture = load(path)
				if not (texture is Texture2D):
					errors.append("人物帧不是 Texture2D：%s" % path)
					continue
				var typed_texture := texture as Texture2D
				if typed_texture.get_width() != 256 or typed_texture.get_height() != 256:
					errors.append("人物运行帧尺寸不是 256x256：%s" % path)
				seen_legacy_count += 1
	if seen_legacy_count != 56:
		errors.append("人物战斗兼容视角动作帧应为 56，实际可读 %d" % seen_legacy_count)
	var seen_world_count := 0
	for direction in WorldVisualDirectionContract.DIRECTIONS:
		for action in WORLD_FRAME_COUNTS.keys():
			var count := int(WORLD_FRAME_COUNTS[action])
			for frame_index in range(1, count + 1):
				var path := _world_frame_path(direction, str(action), frame_index)
				if not ResourceLoader.exists(path):
					errors.append("缺少人物世界八向帧：%s" % path)
					continue
				var texture = load(path)
				if not (texture is Texture2D):
					errors.append("人物世界八向帧不是 Texture2D：%s" % path)
					continue
				var typed_texture := texture as Texture2D
				if typed_texture.get_width() != 256 or typed_texture.get_height() != 256:
					errors.append("人物世界八向帧尺寸不是 256x256：%s" % path)
				seen_world_count += 1
	if seen_world_count != 40:
		errors.append("人物世界八向帧应为 40，实际可读 %d" % seen_world_count)
	return errors


static func _warm_runtime_actions() -> bool:
	var ok := true
	for view in VIEWS:
		for action in RUNTIME_ACTIONS:
			for frame_index in range(1, int(FRAME_COUNTS[action]) + 1):
				var path := _frame_path(view, action, frame_index)
				var texture = load(path)
				if texture is Texture2D:
					_texture_cache[path] = texture
				else:
					ok = false
	return ok


static func _warm_world_actions() -> bool:
	var ok := true
	for direction in WorldVisualDirectionContract.DIRECTIONS:
		for action_value in WORLD_FRAME_COUNTS.keys():
			var action := str(action_value)
			for frame_index in range(1, int(WORLD_FRAME_COUNTS[action]) + 1):
				var path := _world_frame_path(direction, action, frame_index)
				var texture = load(path)
				if texture is Texture2D:
					_texture_cache[path] = texture
				else:
					ok = false
	return ok


static func _frame_path(view: String, action: String, frame_index: int) -> String:
	return "%s/%s/%s/%s-%d.png" % [ROOT, view, action, action, frame_index]


static func _world_frame_path(direction: String, action: String, frame_index: int) -> String:
	return "%s/directions/%s/%s/%s-%d.png" % [WORLD_ROOT, direction, action, action, frame_index]


static func _normalized_view(view: String) -> String:
	return view if VIEWS.has(view) else VIEW_FRONT


static func _normalized_action(action: String) -> String:
	return action if FRAME_COUNTS.has(action) else "idle"


static func _normalized_world_action(action: String) -> String:
	return action if WORLD_FRAME_COUNTS.has(action) else "idle"
