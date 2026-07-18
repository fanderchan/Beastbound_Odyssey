extends RefCounted

const STRATEGY_INDEPENDENT_8 := "independent_8"
const STRATEGY_SYMMETRIC_5_MIRROR := "symmetric_5_mirror"
const DIRECTIONS: Array[String] = [
	"south",
	"southwest",
	"west",
	"northwest",
	"north",
	"northeast",
	"east",
	"southeast",
]


static func normalize_direction(value: String) -> String:
	var normalized := value.strip_edges().to_lower()
	return normalized if DIRECTIONS.has(normalized) else "south"


static func independent_direction_mapping() -> Dictionary:
	var mapping: Dictionary = {}
	for direction in DIRECTIONS:
		mapping[direction] = {
			"sourceDirection": direction,
			"flipH": false,
		}
	return mapping


static func validation_errors(strategy: String, mapping_value) -> Array[String]:
	var errors: Array[String] = []
	if not [STRATEGY_INDEPENDENT_8, STRATEGY_SYMMETRIC_5_MIRROR].has(strategy):
		errors.append("八方向美术策略无效：%s" % strategy)
	if not (mapping_value is Dictionary):
		errors.append("八方向美术映射不是对象")
		return errors
	var mapping := mapping_value as Dictionary
	for direction in DIRECTIONS:
		var entry_value = mapping.get(direction, {})
		if not (entry_value is Dictionary):
			errors.append("缺少世界方向映射：%s" % direction)
			continue
		var entry := entry_value as Dictionary
		var source_direction := normalize_direction(str(entry.get("sourceDirection", "")))
		if strategy == STRATEGY_INDEPENDENT_8:
			if source_direction != direction:
				errors.append("独立八向不能复用其他方向：%s -> %s" % [direction, source_direction])
			if bool(entry.get("flipH", false)):
				errors.append("独立八向禁止运行时镜像：%s" % direction)
	return errors
