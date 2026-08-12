extends RefCounted

const MOSS_MEADOW_ID := "moss_meadow"
const AMBER_SANDSTONE_ID := "amber_sandstone"
const MOONLIT_SLATE_ID := "moonlit_slate"
const RED_CLAY_ID := "red_clay"
const OWNER_REVIEW_ARENA_ID_KEY := "battleArenaOwnerReviewId"
const OWNER_REVIEW_BUNDLE_ID := "battle_review_arenas_v1"
const OWNER_REVIEW_STATUS := "pending"

const ARENAS: Array[Dictionary] = [
	{
		"id": MOSS_MEADOW_ID,
		"name": "苔光草甸",
		"path": "res://assets/battle/review_arenas_v1/runtime/moss_meadow.png",
		"sha256": "215210ead48013359fe16cf0d4043811d4ef86d160cbedcdc08c1f11c0effa69",
		"readabilityOverlay": Color(0.025, 0.045, 0.025, 0.08),
	},
	{
		"id": AMBER_SANDSTONE_ID,
		"name": "琥珀砂岩",
		"path": "res://assets/battle/review_arenas_v1/runtime/amber_sandstone.png",
		"sha256": "418a1eceaecbd8d1af89dda777eb984e16e0fd4b24aceb91287abebb0a1b0198",
		"readabilityOverlay": Color(0.055, 0.030, 0.015, 0.07),
	},
	{
		"id": MOONLIT_SLATE_ID,
		"name": "月影石坪",
		"path": "res://assets/battle/review_arenas_v1/runtime/moonlit_slate.png",
		"sha256": "19f466ad281ca5ada4a4f7f10b1f2cea62576f849d2d0be1af0f121f2c660f2f",
		"readabilityOverlay": Color(0.015, 0.025, 0.045, 0.02),
	},
	{
		"id": RED_CLAY_ID,
		"name": "赤土高原",
		"path": "res://assets/battle/review_arenas_v1/runtime/red_clay.png",
		"sha256": "a8a8fe7d760b3e4cdf61fdf5e77a9289b81273db5301014b060610a91f6b3608",
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


static func warm_state(
	state: Dictionary,
	allow_owner_review_preview: bool = false
) -> bool:
	var arena_id := _arena_id_for_state(state, allow_owner_review_preview)
	if arena_id == "":
		return true
	var arena := _arena_for_id(arena_id)
	return _texture_for_arena(arena, true) != null


static func texture_for_state(
	state: Dictionary,
	allow_owner_review_preview: bool = false
) -> Texture2D:
	var arena_id := _arena_id_for_state(state, allow_owner_review_preview)
	if arena_id == "":
		return null
	var texture = _texture_cache.get(arena_id, null)
	if texture is Texture2D:
		return texture as Texture2D
	return null


static func readability_overlay_for_state(
	state: Dictionary,
	allow_owner_review_preview: bool = false
) -> Color:
	var arena_id := _arena_id_for_state(state, allow_owner_review_preview)
	if arena_id == "":
		return Color.TRANSPARENT
	var overlay = _arena_for_id(arena_id).get(
		"readabilityOverlay",
		Color.TRANSPARENT
	)
	return overlay as Color if overlay is Color else Color.TRANSPARENT


static func evidence_for_state(
	state: Dictionary,
	allow_owner_review_preview: bool = false
) -> Dictionary:
	var arena_id := _arena_id_for_state(state, allow_owner_review_preview)
	var arena := _arena_for_id(arena_id)
	if arena.is_empty():
		return {}
	return {
		"id": arena_id,
		"name": str(arena.get("name", "")),
		"path": str(arena.get("path", "")),
		"sha256": str(arena.get("sha256", "")),
		"bundleId": OWNER_REVIEW_BUNDLE_ID,
		"ownerReviewStatus": OWNER_REVIEW_STATUS,
		"runtimeEnabled": false,
		"releaseApproved": false,
		"qaPreviewEnabled": true,
	}


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
		var path := str(arena.get("path", ""))
		var expected_sha256 := str(arena.get("sha256", ""))
		if (
			expected_sha256.length() != 64
			or FileAccess.get_sha256(path) != expected_sha256
		):
			errors.append("GM观战战场文件哈希漂移：%s" % arena_id)
	var owner_review_state := {
		OWNER_REVIEW_ARENA_ID_KEY: MOSS_MEADOW_ID,
	}
	if texture_for_state(owner_review_state, false) != null:
		errors.append("待审战场不得进入普通玩家路径")
	if readability_overlay_for_state(owner_review_state, false).a > 0.0:
		errors.append("待审战场遮罩不得进入普通玩家路径")
	if not evidence_for_state(owner_review_state, false).is_empty():
		errors.append("待审战场证据不得绕过显式审片门禁")
	if (
		texture_for_state(owner_review_state, true) == null
		or evidence_for_state(owner_review_state, true).is_empty()
	):
		errors.append("待审战场显式审片路径不可用")
	return errors


static func _arena_id_for_state(
	state: Dictionary,
	allow_owner_review_preview: bool
) -> String:
	if bool(state.get("reviewLab", false)):
		return str(state.get("reviewArenaId", ""))
	if allow_owner_review_preview:
		return str(state.get(OWNER_REVIEW_ARENA_ID_KEY, ""))
	return ""


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
