extends RefCounted

const AUTHORITY_V1 := "pet_growth_authority_v1"
const STAT_KEYS: Array[String] = ["maxHp", "attack", "defense", "quick"]


static func lines_for_writeback(profile_writeback: Dictionary) -> Array[String]:
	var lines: Array[String] = []
	var captured_values = profile_writeback.get("capturedPets", [])
	if captured_values is Array:
		for value in captured_values:
			if value is Dictionary:
				lines.append_array(_captured_pet_lines(value as Dictionary))
	var lost_values = profile_writeback.get("lostCapturedPets", [])
	if lost_values is Array:
		for value in lost_values:
			if value is Dictionary:
				lines.append(_lost_pet_line(value as Dictionary))
	return lines


static func contract_check() -> Dictionary:
	var authority := {
		"modelVersion": AUTHORITY_V1,
		"source": "server",
		"schemaVersion": 1,
		"settledLevel": 1,
	}
	var entry := {
		"capturedPets": [{
			"name": "普通乌力",
			"level": 1,
			"state": "standby",
			"maxHp": 83,
			"attack": 11,
			"defense": 7,
			"quick": 49,
			"initialStats": {"maxHp": 83, "attack": 11, "defense": 7, "quick": 49},
			"growthAuthority": authority,
		}],
	}
	var lines := lines_for_writeback(entry)
	var text := "\n".join(lines)
	return {
		"ok": (
			text.find("捕获普通乌力 Lv1，已加入队伍。") >= 0
			and text.find("初始四维：生命83 攻击11 防御7 敏捷49。") >= 0
			and text.find("约 Lv20 再决定去留") >= 0
			and text.find("private") < 0
			and text.find("seed") < 0
			and text.find("预测140") < 0
		),
		"lines": lines,
	}


static func _captured_pet_lines(pet: Dictionary) -> Array[String]:
	var lines: Array[String] = []
	var name := str(pet.get("name", "宠物")).strip_edges()
	if name == "":
		name = "宠物"
	var level := maxi(1, int(pet.get("level", 1)))
	var state := str(pet.get("state", "standby"))
	var destination := "已加入队伍"
	if state == "storage":
		destination = "队伍已满，已送入兽栏"
	lines.append("捕获%s Lv%d，%s。" % [name, level, destination])
	var initial := _four_stats(pet.get("initialStats", pet.get("growthSpeciesLevel1Stats", {})))
	if not initial.is_empty():
		lines.append("初始四维：生命%d 攻击%d 防御%d 敏捷%d。" % [
			int(initial.get("maxHp", 0)),
			int(initial.get("attack", 0)),
			int(initial.get("defense", 0)),
			int(initial.get("quick", 0)),
		])
	var authority_value = pet.get("growthAuthority", {})
	var authority := authority_value as Dictionary if authority_value is Dictionary else {}
	if str(authority.get("modelVersion", pet.get("growthModelVersion", ""))) == AUTHORITY_V1:
		lines.append("从 Lv2 开始记录实际成长，建议训练到约 Lv20 再决定去留。")
	return lines


static func _lost_pet_line(pet: Dictionary) -> String:
	var name := str(pet.get("name", "宠物")).strip_edges()
	if name == "":
		name = "宠物"
	return "捕获%s后没有可用收容位置，请立即清理宠物栏并联系管理员。" % name


static func _four_stats(value) -> Dictionary:
	if not (value is Dictionary):
		return {}
	var source := value as Dictionary
	var result := {}
	for key in STAT_KEYS:
		var amount := int(source.get(key, 0))
		if amount <= 0:
			return {}
		result[key] = amount
	return result
