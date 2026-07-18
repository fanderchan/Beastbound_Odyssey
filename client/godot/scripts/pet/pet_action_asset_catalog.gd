extends RefCounted

const FORM_ID := "bui_novice_sprout_earth5_wind5"
const ROOT := "res://assets/pets/novice_sprout_bui/views"
const VIEW_FRONT := "front_3quarter_sw"
const VIEW_BACK := "back_3quarter_ne"
const VIEWS: Array[String] = [VIEW_FRONT, VIEW_BACK]
const WORLD_ACTIONS: Array[String] = ["idle", "walk"]
const BATTLE_ACTIONS: Array[String] = ["idle", "walk", "attack", "hurt", "defend"]
const FRAME_COUNTS := {
	"idle": 6,
	"walk": 8,
	"attack": 8,
	"hurt": 6,
	"defend": 6,
}
const ACTION_FPS := {
	"idle": 8.0,
	"walk": 11.0,
	"attack": 12.0,
	"hurt": 12.0,
	"defend": 10.0,
}
const LOOPING_ACTIONS: Array[String] = ["idle", "walk"]

static var _texture_cache: Dictionary = {}
static var _world_warmed: bool = false
static var _battle_warmed: bool = false


static func supports_form(form_id: String) -> bool:
	return form_id.strip_edges() == FORM_ID


static func warm_world_form(form_id: String) -> bool:
	if not supports_form(form_id):
		return false
	if _world_warmed:
		return true
	_world_warmed = _warm_actions(WORLD_ACTIONS)
	return _world_warmed


static func warm_battle_form(form_id: String) -> bool:
	if not supports_form(form_id):
		return false
	if _battle_warmed:
		return true
	_battle_warmed = _warm_actions(BATTLE_ACTIONS)
	if _battle_warmed:
		_world_warmed = true
	return _battle_warmed


static func warm_battle_state(state: Dictionary) -> bool:
	var found_supported_form := false
	for value in state.get("actors", []):
		if not (value is Dictionary):
			continue
		var actor := value as Dictionary
		var form_id := str(actor.get("formId", actor.get("templateId", ""))).strip_edges()
		if supports_form(form_id):
			found_supported_form = true
			warm_battle_form(form_id)
	return found_supported_form and _battle_warmed


static func world_view_for_direction(facing: String) -> String:
	match facing.strip_edges().to_lower():
		"north", "northeast", "east", "northwest":
			return VIEW_BACK
	return VIEW_FRONT


static func world_flip_h_for_direction(facing: String) -> bool:
	return ["southeast", "northwest"].has(facing.strip_edges().to_lower())


static func battle_view_for_side(side: String) -> String:
	return VIEW_BACK if side.strip_edges().to_lower() == "ally" else VIEW_FRONT


static func battle_flip_h_for_side(side: String) -> bool:
	return ["ally", "enemy"].has(side.strip_edges().to_lower())


static func action_for_battle_state(action_state: String) -> String:
	var normalized := action_state.strip_edges().to_lower()
	if ["attack", "combo", "skill", "counter_attack", "multi_attack"].has(normalized):
		return "attack"
	if normalized == "hit" or normalized == "launched" or normalized == "down" or normalized == "captured" or normalized.begins_with("status_"):
		return "hurt"
	if normalized == "defend":
		return "defend"
	if ["dodge", "escape", "switch_pet", "switch_in"].has(normalized):
		return "walk"
	return "idle"


static func action_fps(action: String) -> float:
	return float(ACTION_FPS.get(_normalized_action(action), ACTION_FPS["idle"]))


static func texture_for_elapsed(form_id: String, view: String, action: String, elapsed_seconds: float) -> Texture2D:
	if not supports_form(form_id):
		return null
	var normalized_action := _normalized_action(action)
	var count := int(FRAME_COUNTS[normalized_action])
	var frame_index := int(floor(maxf(0.0, elapsed_seconds) * action_fps(normalized_action)))
	if LOOPING_ACTIONS.has(normalized_action):
		frame_index %= count
	else:
		frame_index = mini(frame_index, count - 1)
	return _cached_texture(view, normalized_action, frame_index + 1)


static func texture_for_progress(form_id: String, view: String, action: String, progress: float) -> Texture2D:
	if not supports_form(form_id):
		return null
	var normalized_action := _normalized_action(action)
	var count := int(FRAME_COUNTS[normalized_action])
	var frame_index := mini(count - 1, int(floor(clampf(progress, 0.0, 1.0) * float(count))))
	return _cached_texture(view, normalized_action, frame_index + 1)


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	var seen_count := 0
	for view in VIEWS:
		for action in BATTLE_ACTIONS:
			var count := int(FRAME_COUNTS[action])
			for frame_index in range(1, count + 1):
				var path := _frame_path(view, action, frame_index)
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
	if seen_count != 68:
		errors.append("正式动作帧应为 68，实际可读 %d" % seen_count)
	if action_for_battle_state("combo") != "attack" or action_for_battle_state("hit") != "hurt" or action_for_battle_state("defend") != "defend":
		errors.append("战斗动作映射不完整")
	if (
		battle_view_for_side("ally") != VIEW_BACK
		or battle_view_for_side("enemy") != VIEW_FRONT
		or not battle_flip_h_for_side("ally")
		or not battle_flip_h_for_side("enemy")
	):
		errors.append("战斗视角映射不正确")
	return errors


static func _warm_actions(actions: Array[String]) -> bool:
	var ok := true
	for view in VIEWS:
		for action in actions:
			for frame_index in range(1, int(FRAME_COUNTS[action]) + 1):
				var path := _frame_path(view, action, frame_index)
				if _texture_cache.has(path):
					continue
				var texture = load(path)
				if texture is Texture2D:
					_texture_cache[path] = texture
				else:
					ok = false
	return ok


static func _cached_texture(view: String, action: String, frame_index: int) -> Texture2D:
	var path := _frame_path(_normalized_view(view), action, frame_index)
	var texture = _texture_cache.get(path)
	return texture as Texture2D if texture is Texture2D else null


static func _frame_path(view: String, action: String, frame_index: int) -> String:
	return "%s/%s/%s/%s-%d.png" % [ROOT, _normalized_view(view), action, action, frame_index]


static func _normalized_view(view: String) -> String:
	return view if VIEWS.has(view) else VIEW_FRONT


static func _normalized_action(action: String) -> String:
	return action if FRAME_COUNTS.has(action) else "idle"
