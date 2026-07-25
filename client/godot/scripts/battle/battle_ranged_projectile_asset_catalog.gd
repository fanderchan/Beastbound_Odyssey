extends RefCounted

const ROOT := "res://assets/battle/ranged_bow_v1/runtime"
const ACTION_BOW_DRAW := "bow_draw"
const ACTION_ARROW_FLIGHT := "arrow_flight"
const ACTION_ARROW_HIT := "arrow_hit"
const ACTION_ARROW_GROUND := "arrow_ground"
const FRAME_SIZE := Vector2i(256, 256)

const ACTION_FRAME_COUNTS := {
	ACTION_BOW_DRAW: 4,
	ACTION_ARROW_FLIGHT: 4,
	ACTION_ARROW_HIT: 4,
	ACTION_ARROW_GROUND: 4,
}

static var _texture_cache: Dictionary = {}
static var _warm_complete: bool = false


static func warm_all() -> bool:
	if _warm_complete:
		return true
	var next_cache := {}
	for action_id_value in ACTION_FRAME_COUNTS.keys():
		var action_id := str(action_id_value)
		var frames: Array[Texture2D] = []
		for frame_number in range(
			1,
			int(ACTION_FRAME_COUNTS.get(action_id, 0)) + 1
		):
			var resource_path := _frame_path(action_id, frame_number)
			if not ResourceLoader.exists(resource_path):
				return false
			var loaded = load(resource_path)
			if not (loaded is Texture2D):
				return false
			frames.append(loaded as Texture2D)
		next_cache[action_id] = frames
	_texture_cache = next_cache
	_warm_complete = true
	return true


static func is_warmed() -> bool:
	return _warm_complete


static func texture_for_frame(
	action_id: String,
	frame_index: int
) -> Texture2D:
	# Drawing is cache-only. Asset I/O belongs to warm_all(), outside _draw.
	if not _warm_complete:
		return null
	var value = _texture_cache.get(action_id, [])
	if not (value is Array):
		return null
	var frames := value as Array
	if frames.is_empty():
		return null
	var index := clampi(frame_index, 0, frames.size() - 1)
	var texture = frames[index]
	return texture as Texture2D if texture is Texture2D else null


static func frame_count(action_id: String) -> int:
	return int(ACTION_FRAME_COUNTS.get(action_id, 0))


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	if not warm_all():
		errors.append("群攻弓演出素材未完整载入")
		return errors
	for action_id_value in ACTION_FRAME_COUNTS.keys():
		var action_id := str(action_id_value)
		var expected_count := int(ACTION_FRAME_COUNTS.get(action_id, 0))
		var frames = _texture_cache.get(action_id, [])
		if not (frames is Array) or (frames as Array).size() != expected_count:
			errors.append("群攻弓演出帧数错误：%s" % action_id)
			continue
		for frame_index in range(expected_count):
			var texture = (frames as Array)[frame_index]
			if not (texture is Texture2D):
				errors.append("群攻弓演出纹理无效：%s-%d" % [action_id, frame_index + 1])
				continue
			if (
				(texture as Texture2D).get_width() != FRAME_SIZE.x
				or (texture as Texture2D).get_height() != FRAME_SIZE.y
			):
				errors.append(
					"群攻弓演出纹理不是256x256：%s-%d"
					% [action_id, frame_index + 1]
				)
	return errors


static func _frame_path(action_id: String, frame_number: int) -> String:
	return "%s/%s/%s-%d.png" % [
		ROOT,
		action_id,
		action_id,
		frame_number,
	]
