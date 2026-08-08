extends RefCounted

const DESIGN_SIZE := Vector2(494.0, 300.0)
const TOUCH_SIZE := Vector2(68.0, 72.0)

const PLAYER_LAYOUT := {
	"spirit": Rect2(418, 0, 68, 72),
	"attack": Rect2(418, 74, 68, 72),
	"item": Rect2(418, 148, 68, 72),
	"managed": Rect2(8, 228, 68, 72),
	"run": Rect2(76, 228, 68, 72),
	"help": Rect2(144, 228, 68, 72),
	"capture": Rect2(212, 228, 68, 72),
	"switch_pet": Rect2(280, 228, 68, 72),
	"defend": Rect2(348, 228, 68, 72),
	"auto": Rect2(418, 228, 68, 72),
}

const PET_LAYOUT := {
	"skill": Rect2(418, 72, 68, 72),
	"attack": Rect2(418, 146, 68, 72),
	"recall": Rect2(76, 228, 68, 72),
	"run": Rect2(144, 228, 68, 72),
	"assist": Rect2(212, 228, 68, 72),
	"return": Rect2(280, 228, 68, 72),
	"defend": Rect2(348, 228, 68, 72),
	"auto": Rect2(418, 228, 68, 72),
}

const AUTO_LAYOUT := {
	"pet": Rect2(280, 228, 68, 72),
	"player": Rect2(348, 228, 68, 72),
	"cancel": Rect2(418, 228, 68, 72),
}


static func recommended_size(viewport_size: Vector2) -> Vector2:
	var available := Vector2(
		maxf(300.0, viewport_size.x - 24.0),
		maxf(220.0, viewport_size.y - 24.0)
	)
	var scale_factor := minf(1.0, minf(available.x / DESIGN_SIZE.x, available.y / DESIGN_SIZE.y))
	return DESIGN_SIZE * maxf(0.78, scale_factor)


static func scaled_rect(rect: Rect2, actual_size: Vector2) -> Rect2:
	var scale_factor := minf(actual_size.x / DESIGN_SIZE.x, actual_size.y / DESIGN_SIZE.y)
	var used_size := DESIGN_SIZE * scale_factor
	var origin := Vector2(actual_size.x - used_size.x, actual_size.y - used_size.y)
	return Rect2(origin + rect.position * scale_factor, rect.size * scale_factor)


static func selftest() -> Array[String]:
	var errors: Array[String] = []
	for layout_name in ["player", "pet", "auto"]:
		var layout: Dictionary = (
			PLAYER_LAYOUT
			if layout_name == "player"
			else PET_LAYOUT
			if layout_name == "pet"
			else AUTO_LAYOUT
		)
		for entry_id in layout.keys():
			var rect := layout[entry_id] as Rect2
			if rect.size.x < 60.0 or rect.size.y < 60.0:
				errors.append("%s.%s 触控尺寸不足" % [layout_name, entry_id])
			if not Rect2(Vector2.ZERO, DESIGN_SIZE).encloses(rect):
				errors.append("%s.%s 超出设计画布" % [layout_name, entry_id])
	if PLAYER_LAYOUT.size() != 10:
		errors.append("人物回合入口必须为 10 个")
	if PET_LAYOUT.size() != 8:
		errors.append("宠物回合入口必须为 8 个")
	if AUTO_LAYOUT.keys().size() != 3:
		errors.append("自动战斗必须固定为宠、主、取消三入口")
	for row_contract in [
		[PLAYER_LAYOUT, ["managed", "run", "help", "capture", "switch_pet", "defend", "auto"]],
		[PET_LAYOUT, ["recall", "run", "assist", "return", "defend", "auto"]],
		[AUTO_LAYOUT, ["pet", "player", "cancel"]],
	]:
		var row_layout := row_contract[0] as Dictionary
		var row_ids := row_contract[1] as Array
		var expected_y := float((row_layout[row_ids[0]] as Rect2).position.y)
		for row_id in row_ids:
			if not is_equal_approx(float((row_layout[row_id] as Rect2).position.y), expected_y):
				errors.append("%s 底部指令必须保持同一横排基线" % str(row_id))
	return errors
