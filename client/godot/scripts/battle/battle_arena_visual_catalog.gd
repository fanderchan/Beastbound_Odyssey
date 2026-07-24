extends RefCounted

const MOSS_MEADOW_ID := "moss_meadow"
const AMBER_SANDSTONE_ID := "amber_sandstone"
const MOONLIT_SLATE_ID := "moonlit_slate"
const RED_CLAY_ID := "red_clay"

const ARENAS: Array[Dictionary] = [
	{
		"id": MOSS_MEADOW_ID,
		"name": "苔光草甸",
		"path": "res://assets/battle/review_arenas_v1/runtime/moss_meadow.png",
		"readabilityOverlay": Color(0.025, 0.045, 0.025, 0.08),
	},
	{
		"id": AMBER_SANDSTONE_ID,
		"name": "琥珀砂岩",
		"path": "res://assets/battle/review_arenas_v1/runtime/amber_sandstone.png",
		"readabilityOverlay": Color(0.055, 0.030, 0.015, 0.07),
	},
	{
		"id": MOONLIT_SLATE_ID,
		"name": "月影石坪",
		"path": "res://assets/battle/review_arenas_v1/runtime/moonlit_slate.png",
		"readabilityOverlay": Color(0.015, 0.025, 0.045, 0.02),
	},
	{
		"id": RED_CLAY_ID,
		"name": "赤土高原",
		"path": "res://assets/battle/review_arenas_v1/runtime/red_clay.png",
		"readabilityOverlay": Color(0.045, 0.020, 0.018, 0.06),
	},
]

static var _texture_cache: Dictionary = {}


static func arena_ids() -> Array[String]:
	var result: Array[String] = []
	for arena in ARENAS:
		result.append(str(arena.get("id", "")))
	return result


static func arena_for_seed(seed_value: int) -> Dictionary:
	var seed := maxi(1, absi(seed_value))
	return ARENAS[(seed - 1) % ARENAS.size()].duplicate()


static func arena_id_for_seed(seed_value: int) -> String:
	return str(arena_for_seed(seed_value).get("id", MOSS_MEADOW_ID))


static func arena_name_for_id(arena_id: String) -> String:
	return str(_arena_for_id(arena_id).get("name", ""))


static func warm_state(state: Dictionary) -> bool:
	if not bool(state.get("reviewLab", false)):
		return true
	var arena := _arena_for_id(str(state.get("reviewArenaId", "")))
	return _texture_for_arena(arena, true) != null


static func texture_for_state(state: Dictionary) -> Texture2D:
	if not bool(state.get("reviewLab", false)):
		return null
	var texture = _texture_cache.get(
		str(state.get("reviewArenaId", "")),
		null
	)
	if texture is Texture2D:
		return texture as Texture2D
	return null


static func readability_overlay_for_state(state: Dictionary) -> Color:
	if not bool(state.get("reviewLab", false)):
		return Color.TRANSPARENT
	var overlay = _arena_for_id(str(state.get("reviewArenaId", ""))).get(
		"readabilityOverlay",
		Color.TRANSPARENT
	)
	return overlay as Color if overlay is Color else Color.TRANSPARENT


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	var seen := {}
	if ARENAS.size() < 4:
		errors.append("GM观战战场少于4种")
	for arena in ARENAS:
		var arena_id := str(arena.get("id", "")).strip_edges()
		if arena_id == "":
			errors.append("GM观战战场存在空ID")
		elif seen.has(arena_id):
			errors.append("GM观战战场ID重复：%s" % arena_id)
		seen[arena_id] = true
		var texture := _texture_for_arena(arena, true)
		if texture == null:
			errors.append("GM观战战场纹理缺失：%s" % arena_id)
			continue
		if texture.get_width() != 1280 or texture.get_height() != 720:
			errors.append(
				"GM观战战场不是1280x720：%s=%dx%d"
				% [arena_id, texture.get_width(), texture.get_height()]
			)
	return errors


static func _arena_for_id(arena_id: String) -> Dictionary:
	for arena in ARENAS:
		if str(arena.get("id", "")) == arena_id:
			return arena
	return {}


static func _texture_for_arena(
	arena: Dictionary,
	allow_load: bool
) -> Texture2D:
	var arena_id := str(arena.get("id", "")).strip_edges()
	if arena_id == "":
		return null
	var cached = _texture_cache.get(arena_id, null)
	if cached is Texture2D:
		return cached as Texture2D
	if not allow_load:
		return null
	var path := str(arena.get("path", "")).strip_edges()
	var loaded = load(path) if path != "" else null
	if not (loaded is Texture2D):
		return null
	_texture_cache[arena_id] = loaded
	return loaded as Texture2D
