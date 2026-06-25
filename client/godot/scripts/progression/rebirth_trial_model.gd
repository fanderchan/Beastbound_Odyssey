extends RefCounted

const DATA_PATH := "res://data/rebirth_trials.json"
const ELEMENTS: Array[String] = ["earth", "water", "fire", "wind"]
static var data_cache_loaded: bool = false
static var data_cache: Dictionary = {}


static func catalog() -> Dictionary:
	if data_cache_loaded:
		return data_cache
	data_cache_loaded = true
	if not FileAccess.file_exists(DATA_PATH):
		data_cache = {}
		return data_cache
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
	data_cache = parsed as Dictionary if parsed is Dictionary else {}
	return data_cache


static func element_caves() -> Array[Dictionary]:
	return _dict_array(catalog().get("elementCaves", []))


static func rebirth_beasts() -> Array[Dictionary]:
	return _dict_array(catalog().get("rebirthBeasts", []))


static func stages() -> Array[Dictionary]:
	return _dict_array(catalog().get("stages", []))


static func special_task_plans() -> Array[Dictionary]:
	return _dict_array(catalog().get("specialTaskPlans", []))


static func final_cave() -> Dictionary:
	var value = catalog().get("finalCave", {})
	return value as Dictionary if value is Dictionary else {}


static func floor_map_ids_for_final_cave() -> Array[String]:
	var cave := final_cave()
	var result := _string_array(cave.get("floorMapIds", []))
	if result.is_empty():
		var cave_id := str(cave.get("id", ""))
		if cave_id != "":
			result.append(cave_id)
	return result


static func capture_floor_map_ids_for_final_cave() -> Array[String]:
	return _string_array(final_cave().get("captureFloorMapIds", []))


static func boss_floor_map_id_for_final_cave() -> String:
	var explicit_id := str(final_cave().get("bossFloorMapId", "")).strip_edges()
	if explicit_id != "":
		return explicit_id
	var floor_ids := floor_map_ids_for_final_cave()
	return floor_ids[floor_ids.size() - 1] if not floor_ids.is_empty() else str(final_cave().get("id", ""))


static func remote_stable_unlock() -> Dictionary:
	var value = catalog().get("remoteStableUnlock", {})
	return value as Dictionary if value is Dictionary else {}


static func ring_item_ids() -> Array[String]:
	var result: Array[String] = []
	for cave in element_caves():
		var ring_id := str(cave.get("ringItemId", ""))
		if ring_id != "" and not result.has(ring_id):
			result.append(ring_id)
	return result


static func cave_for_element(element: String) -> Dictionary:
	for cave in element_caves():
		if str(cave.get("element", "")) == element:
			return cave
	return {}


static func floor_map_ids_for_cave(cave: Dictionary) -> Array[String]:
	var result := _string_array(cave.get("floorMapIds", []))
	if result.is_empty():
		var cave_id := str(cave.get("caveId", ""))
		if cave_id != "":
			result.append(cave_id)
	return result


static func guardian_floor_map_id_for_cave(cave: Dictionary) -> String:
	var explicit_id := str(cave.get("guardianFloorMapId", "")).strip_edges()
	if explicit_id != "":
		return explicit_id
	var floor_ids := floor_map_ids_for_cave(cave)
	return floor_ids[floor_ids.size() - 1] if not floor_ids.is_empty() else str(cave.get("caveId", ""))


static func beast_for_element(element: String) -> Dictionary:
	for beast in rebirth_beasts():
		if str(beast.get("element", "")) == element:
			return beast
	return {}


static func stage_for_target(target_rebirth: int) -> Dictionary:
	for stage in stages():
		if int(stage.get("targetRebirth", 0)) == target_rebirth:
			return stage
	return {}


static func stage_required_ring_ids(_target_rebirth: int) -> Array[String]:
	return ring_item_ids()


static func stage_required_beast_form_ids(target_rebirth: int) -> Array[String]:
	var stage := stage_for_target(target_rebirth)
	var result: Array[String] = []
	for element in _string_array(stage.get("requiredCapturedBeastElements", [])):
		var beast := beast_for_element(element)
		var form_id := str(beast.get("formId", ""))
		if form_id != "" and not result.has(form_id):
			result.append(form_id)
	return result


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	var loaded := catalog()
	if loaded.is_empty():
		return ["rebirth_trials.json 缺失或不是 JSON 对象"]
	if int(loaded.get("schemaVersion", 0)) != 1:
		errors.append("rebirth_trials.json schemaVersion 当前必须是 1")
	_validate_remote_stable(errors)
	_validate_element_caves(errors)
	_validate_final_cave(errors)
	_validate_rebirth_beasts(errors)
	_validate_stages(errors)
	_validate_special_task_plans(errors)
	return errors


static func _validate_remote_stable(errors: Array[String]) -> void:
	var unlock := remote_stable_unlock()
	if int(unlock.get("requiredRebirthCount", 0)) != 4:
		errors.append("远程兽栏必须在 4转 开放")
	if int(unlock.get("requiredLevel", 0)) > 1:
		errors.append("远程兽栏不能要求 4转1级之后的额外等级")
	if not bool(unlock.get("optional", false)):
		errors.append("远程兽栏必须是可选任务，不能阻断后续转生")


static func _validate_element_caves(errors: Array[String]) -> void:
	if element_caves().size() != ELEMENTS.size():
		errors.append("元素洞穴必须正好 4 个")
	var seen_elements := {}
	var seen_rings := {}
	for cave in element_caves():
		var element := str(cave.get("element", ""))
		if not ELEMENTS.has(element):
			errors.append("未知元素洞穴: %s" % element)
			continue
		if seen_elements.has(element):
			errors.append("元素洞穴重复: %s" % element)
		seen_elements[element] = true
		var ring_id := str(cave.get("ringItemId", ""))
		if ring_id == "":
			errors.append("%s 缺少戒指 itemId" % element)
		elif seen_rings.has(ring_id):
			errors.append("戒指 itemId 重复: %s" % ring_id)
		seen_rings[ring_id] = true
		var floor_count := int(cave.get("floors", 0))
		var floor_ids := floor_map_ids_for_cave(cave)
		if floor_count < 3:
			errors.append("%s 至少需要多层迷宫" % str(cave.get("caveName", element)))
		if floor_ids.size() != floor_count:
			errors.append("%s floorMapIds 数量必须等于 floors" % str(cave.get("caveName", element)))
		if not floor_ids.is_empty() and str(cave.get("caveId", "")) != floor_ids[0]:
			errors.append("%s 第一层地图必须等于 caveId" % str(cave.get("caveName", element)))
		if floor_ids.size() >= 2 and guardian_floor_map_id_for_cave(cave) != floor_ids[floor_ids.size() - 1]:
			errors.append("%s 守护兽必须在最后一层地图" % str(cave.get("caveName", element)))
		if int(cave.get("minAttemptLevel", 0)) > 80:
			errors.append("%s Lv80 应该可以尝试" % str(cave.get("caveName", element)))
		if int(cave.get("recommendedLevel", 0)) < 100:
			errors.append("%s 推荐等级至少应是 Lv100" % str(cave.get("caveName", element)))
		_validate_guardian_group(errors, cave.get("guardianGroup", {}), "%s 守护兽" % str(cave.get("caveName", element)), 100)
	for element in ELEMENTS:
		if not seen_elements.has(element):
			errors.append("缺少元素洞穴: %s" % element)


static func _validate_final_cave(errors: Array[String]) -> void:
	var cave := final_cave()
	if str(cave.get("name", "")) == "漆黑洞穴":
		errors.append("最终洞窟不能直接使用原名 漆黑洞穴")
	if str(cave.get("name", "")) == "":
		errors.append("最终洞窟必须命名")
	var floor_count := int(cave.get("floors", 0))
	var floor_ids := floor_map_ids_for_final_cave()
	var capture_floor_ids := capture_floor_map_ids_for_final_cave()
	if floor_count < 3:
		errors.append("最终洞窟至少需要多层迷宫")
	if floor_ids.size() != floor_count:
		errors.append("最终洞窟 floorMapIds 数量必须等于 floors")
	if not floor_ids.is_empty() and str(cave.get("id", "")) != floor_ids[0]:
		errors.append("最终洞窟第一层地图必须等于 id")
	if floor_ids.size() >= 2 and boss_floor_map_id_for_final_cave() != floor_ids[floor_ids.size() - 1]:
		errors.append("最终洞窟 boss 必须在最后一层地图")
	if capture_floor_ids.size() < 3:
		errors.append("最终洞窟至少前三层应可捕捉转生兽")
	for map_id in capture_floor_ids:
		if not floor_ids.has(map_id):
			errors.append("最终洞窟捕捉层不在 floorMapIds 中: %s" % map_id)
	_validate_guardian_group(errors, cave.get("rebirthBossGroup", {}), "最终转生战", 110)


static func _validate_rebirth_beasts(errors: Array[String]) -> void:
	if rebirth_beasts().size() != ELEMENTS.size():
		errors.append("转生兽必须正好 4 只")
	var seen := {}
	for beast in rebirth_beasts():
		var element := str(beast.get("element", ""))
		if not ELEMENTS.has(element):
			errors.append("未知转生兽元素: %s" % element)
			continue
		if seen.has(element):
			errors.append("转生兽元素重复: %s" % element)
		seen[element] = true
		if str(beast.get("formId", "")) == "":
			errors.append("%s 缺少 formId" % str(beast.get("name", element)))
		if int(beast.get("captureLevel", 0)) != 50:
			errors.append("%s 第一版捕捉等级必须是 Lv50" % str(beast.get("name", element)))


static func _validate_stages(errors: Array[String]) -> void:
	if stages().size() != 6:
		errors.append("当前人物转生链必须保留 1 到 6 转")
	for target in range(1, 7):
		var stage := stage_for_target(target)
		if stage.is_empty():
			errors.append("缺少 %d转 阶段" % target)
			continue
		if stage_required_ring_ids(target).size() != ELEMENTS.size():
			errors.append("%d转 必须要求四枚元素戒指" % target)
		var required_elements := _string_array(stage.get("requiredCapturedBeastElements", []))
		var expected := [ELEMENTS[target - 1]] if target <= 4 else ELEMENTS
		if not _same_string_set(required_elements, expected):
			errors.append("%d转 转生兽要求不正确" % target)
		if str(stage.get("starterPetPlan", "")) == "":
			errors.append("%d转 缺少新手战宠奖励规划" % target)
		if str(stage.get("rewardPlan", "")) == "":
			errors.append("%d转 缺少道具/装备奖励规划" % target)
		if stage_required_beast_form_ids(target).is_empty():
			errors.append("%d转 没有解析到转生兽 formId" % target)


static func _validate_special_task_plans(errors: Array[String]) -> void:
	var tasks := special_task_plans()
	if tasks.size() < 6:
		errors.append("每转至少需要一条特殊任务规划")
	var seen_targets := {}
	var seen_ids := {}
	for task in tasks:
		var task_id := str(task.get("id", "")).strip_edges()
		if task_id == "":
			errors.append("特殊任务规划缺少 id")
		elif seen_ids.has(task_id):
			errors.append("特殊任务规划 id 重复: %s" % task_id)
		seen_ids[task_id] = true
		var target := int(task.get("requiredRebirthCount", 0))
		if target < 1 or target > 6:
			errors.append("%s requiredRebirthCount 必须在 1 到 6 之间" % task_id)
			continue
		seen_targets[target] = true
		if int(task.get("requiredLevel", 0)) > 1:
			errors.append("%s 特殊任务应在该转 Lv1 后即可补做" % task_id)
		if not bool(task.get("optional", false)):
			errors.append("%s 特殊任务必须是可选任务" % task_id)
		if bool(task.get("missable", true)):
			errors.append("%s 特殊任务不能错过，必须允许后续补做" % task_id)
		if str(task.get("title", "")).strip_edges() == "":
			errors.append("%s 特殊任务缺少标题" % task_id)
		if str(task.get("benefitPlan", "")).strip_edges() == "":
			errors.append("%s 特殊任务缺少好处规划" % task_id)
	for target in range(1, 7):
		if not seen_targets.has(target):
			errors.append("%d转 缺少特殊任务规划" % target)


static func _validate_guardian_group(errors: Array[String], value, label: String, expected_average_level: int) -> void:
	var group := value as Dictionary if value is Dictionary else {}
	if group.is_empty():
		errors.append("%s 缺少守护战配置" % label)
		return
	if int(group.get("enemyCount", 0)) != 10:
		errors.append("%s 必须是 10 只怪" % label)
	if int(group.get("averageLevel", 0)) < expected_average_level:
		errors.append("%s 平均等级至少 Lv%d" % [label, expected_average_level])
	if int(group.get("centerLevel", 0)) <= int(group.get("averageLevel", 0)):
		errors.append("%s 中心主怪等级必须高于平均等级" % label)
	if _string_array(group.get("strongSkillIds", [])).is_empty():
		errors.append("%s 中心主怪必须配置强技能" % label)


static func _dict_array(value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if value is Array:
		for item in value:
			if item is Dictionary:
				result.append(item as Dictionary)
	return result


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value:
			var text := str(item)
			if text != "" and not result.has(text):
				result.append(text)
	return result


static func _same_string_set(left: Array[String], right: Array) -> bool:
	if left.size() != right.size():
		return false
	for value in right:
		if not left.has(str(value)):
			return false
	return true
