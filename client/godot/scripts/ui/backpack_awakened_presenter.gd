extends RefCounted

const BackpackModel := preload("res://scripts/progression/backpack_model.gd")
const EquipmentModel := preload("res://scripts/progression/equipment_model.gd")
const BackpackPanelPresenter := preload("res://scripts/ui/backpack_panel_presenter.gd")
const EquipmentInstancePresenter := preload("res://scripts/ui/equipment_instance_presenter.gd")

const KIND_EMPTY := "empty"
const KIND_ITEM_STACK := "item_stack"
const KIND_EQUIPMENT_INSTANCE := "equipment_instance"
const REBIRTH_COUNT_KEY := "rebirthCount"


static func view_state(
	profile: Dictionary,
	category: String = BackpackPanelPresenter.FILTER_ALL,
	candidate_selection_key: String = ""
) -> Dictionary:
	var active_category := _normalized_category(category)
	var comparison := {}
	if candidate_selection_key != "":
		comparison = comparison_for_selection(profile, candidate_selection_key)
	return {
		"categoryOptions": BackpackPanelPresenter.filter_options().duplicate(true),
		"activeCategory": active_category,
		"activeCategoryLabel": BackpackPanelPresenter.filter_label(active_category),
		"equipmentSlots": equipment_slot_rows(profile),
		"backpackRows": backpack_rows(profile, active_category),
		"comparison": comparison,
	}


static func equipment_slot_rows(profile: Dictionary) -> Array[Dictionary]:
	var source_rows := EquipmentInstancePresenter.equipped_rows(profile)
	var row_by_slot := {}
	for source_value in source_rows:
		if not (source_value is Dictionary):
			continue
		var source := source_value as Dictionary
		var slot_id := str(source.get("slotId", ""))
		if EquipmentModel.slot_ids().has(slot_id) and not row_by_slot.has(slot_id):
			row_by_slot[slot_id] = source

	var raw_slots_value = profile.get("equipmentSlots", {})
	var raw_slots := raw_slots_value as Dictionary if raw_slots_value is Dictionary else {}
	var result: Array[Dictionary] = []
	for slot_id in EquipmentModel.slot_ids():
		var source := row_by_slot.get(slot_id, {}) as Dictionary
		var item_id := str(source.get("itemId", raw_slots.get(slot_id, ""))).strip_edges()
		if item_id == "":
			result.append(_empty_equipment_slot(slot_id))
			continue
		if source.is_empty():
			source = {
				"valid": false,
				"error": "装备实例资料异常，暂不可操作。",
				"slotId": slot_id,
				"itemId": item_id,
				"itemLabel": EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id, "装备")),
				"instanceId": "",
				"selectionKey": "",
				"stateSummary": "资料异常",
				"instance": {},
			}
		result.append(_equipment_slot_row(profile, slot_id, source))
	return result


static func backpack_rows(
	profile: Dictionary,
	category: String = BackpackPanelPresenter.FILTER_ALL
) -> Array[Dictionary]:
	var active_category := _normalized_category(category)
	var equipment_sources := EquipmentInstancePresenter.backpack_rows(profile)
	var source_indices_by_slot := {}
	for source_index in range(equipment_sources.size()):
		var source_value = equipment_sources[source_index]
		if not (source_value is Dictionary):
			continue
		var source := source_value as Dictionary
		var slot_index := int(source.get("slotIndex", -1))
		if not source_indices_by_slot.has(slot_index):
			source_indices_by_slot[slot_index] = [] as Array[int]
		(source_indices_by_slot[slot_index] as Array[int]).append(source_index)

	var consumed_sources := {}
	var result: Array[Dictionary] = []
	var raw_slots_value = profile.get("backpackSlots", [])
	var raw_slots := raw_slots_value as Array if raw_slots_value is Array else []
	for slot_index in range(raw_slots.size()):
		var raw_slot_value = raw_slots[slot_index]
		if not (raw_slot_value is Dictionary):
			if active_category == BackpackPanelPresenter.FILTER_ALL:
				result.append(_invalid_inventory_row(slot_index, "背包格资料异常。"))
			continue
		var slot := raw_slot_value as Dictionary
		var item_id := str(slot.get("itemId", "")).strip_edges()
		var count := maxi(0, int(slot.get("count", 0)))
		if item_id == "" or count <= 0:
			if active_category == BackpackPanelPresenter.FILTER_ALL:
				result.append(_empty_inventory_row(slot_index))
			continue
		if not BackpackPanelPresenter.slot_matches_filter(slot, active_category):
			continue
		if EquipmentModel.is_equipment(item_id):
			var source_indices := source_indices_by_slot.get(slot_index, []) as Array[int]
			if source_indices.is_empty():
				result.append(_invalid_inventory_row(slot_index, "装备实例资料缺失，暂不可操作。", item_id))
				continue
			for source_index in source_indices:
				consumed_sources[source_index] = true
				var source_value = equipment_sources[source_index]
				if source_value is Dictionary:
					result.append(_equipment_inventory_row(profile, source_value as Dictionary))
			continue
		result.append(_stack_inventory_row(slot_index, slot))

	for source_index in range(equipment_sources.size()):
		if consumed_sources.has(source_index):
			continue
		var source_value = equipment_sources[source_index]
		if not (source_value is Dictionary):
			continue
		var source := source_value as Dictionary
		var item_id := str(source.get("itemId", ""))
		var filter_slot := {"itemId": item_id, "count": 1}
		if (
			active_category != BackpackPanelPresenter.FILTER_ALL
			and not BackpackPanelPresenter.slot_matches_filter(filter_slot, active_category)
		):
			continue
		result.append(_equipment_inventory_row(profile, source))
	return result


static func comparison_for_selection(profile: Dictionary, candidate_selection_key: String) -> Dictionary:
	var candidate_source := {}
	for source_value in EquipmentInstancePresenter.backpack_rows(profile):
		if not (source_value is Dictionary):
			continue
		var source := source_value as Dictionary
		if str(source.get("selectionKey", "")) == candidate_selection_key:
			candidate_source = source
			break
	if candidate_source.is_empty():
		return {}
	var candidate_item_id := str(candidate_source.get("itemId", ""))
	if not EquipmentModel.is_equipment(candidate_item_id):
		return {}
	var slot_id := EquipmentModel.slot_for(candidate_item_id)
	if slot_id == "":
		return {}

	var current_source := {}
	for source_value in EquipmentInstancePresenter.equipped_rows(profile):
		if source_value is Dictionary and str((source_value as Dictionary).get("slotId", "")) == slot_id:
			current_source = source_value as Dictionary
			break
	var current_detail := (
		_equipment_detail(profile, current_source, slot_id, true)
		if not current_source.is_empty()
		else _empty_equipment_detail(slot_id)
	)
	var candidate_detail := _equipment_detail(profile, candidate_source, slot_id, false)
	var current_effective := current_detail.get("effectiveStats", {}) as Dictionary
	var candidate_effective := candidate_detail.get("effectiveStats", {}) as Dictionary
	var stat_rows: Array[Dictionary] = []
	for key in EquipmentModel.STAT_KEYS:
		var before := int(current_effective.get(key, 0))
		var after := int(candidate_effective.get(key, 0))
		var delta := after - before
		stat_rows.append({
			"key": key,
			"label": EquipmentModel.stat_label_for(key),
			"current": before,
			"candidate": after,
			"delta": delta,
			"deltaText": "%+d" % delta if delta != 0 else "0",
			"direction": "gain" if delta > 0 else ("loss" if delta < 0 else "equal"),
		})
	var warning_text := ""
	if not bool(candidate_detail.get("valid", false)):
		warning_text = "候选装备资料异常，暂不可装备。"
	elif not bool(candidate_detail.get("requirementsMet", false)):
		warning_text = "需求未满足，候选装备的属性不会生效。"
	elif bool(candidate_detail.get("broken", false)):
		warning_text = "候选装备已损坏，装备后属性暂不生效。"
	return {
		"visible": true,
		"slotId": slot_id,
		"slotLabel": EquipmentModel.slot_label_for(slot_id),
		"current": current_detail,
		"candidate": candidate_detail,
		"statRows": stat_rows,
		"canEquip": (
			bool(candidate_detail.get("valid", false))
			and bool(candidate_detail.get("requirementsMet", false))
		),
		"willBeEffective": bool(candidate_detail.get("effective", false)),
		"warningText": warning_text,
		"candidateSelectionKey": candidate_selection_key,
		"candidateInstanceId": str(candidate_source.get("instanceId", "")),
	}


static func self_check() -> Dictionary:
	var errors: Array[String] = []
	var profile := _fixture_profile()
	var profile_before := profile.duplicate(true)
	var all_state := view_state(profile, BackpackPanelPresenter.FILTER_ALL)
	_expect(profile == profile_before, "presenter 改写了输入 profile", errors)
	_expect((all_state.get("equipmentSlots", []) as Array).size() == 9, "没有输出 9 个装备槽", errors)

	var base_compare := comparison_for_selection(profile, "instance:equip_back_0001")
	var plus_compare := comparison_for_selection(profile, "instance:equip_back_0002")
	var broken_compare := comparison_for_selection(profile, "instance:equip_back_0003")
	var requirement_compare := comparison_for_selection(profile, "instance:equip_back_0004")
	_expect(not base_compare.is_empty() and not plus_compare.is_empty(), "无法选择同模板实例", errors)
	_expect(_delta_for(plus_compare, "attack") == 4, "同模板 +4 强化没有形成攻击差值", errors)
	_expect(_delta_for(base_compare, "attack") == 0, "同模板 +0 被错误计入差值", errors)
	_expect(
		int((broken_compare.get("candidate", {}) as Dictionary).get("effectiveStats", {}).get("attack", -1)) == 0,
		"损坏候选仍计入有效属性",
		errors
	)
	_expect(_delta_for(broken_compare, "attack") == -6, "损坏候选差值没有按 0 生效值计算", errors)
	_expect(
		int((requirement_compare.get("candidate", {}) as Dictionary).get("effectiveStats", {}).get("attack", -1)) == 0,
		"未满足需求的候选仍计入有效属性",
		errors
	)

	var player_text := _player_text_blob(all_state)
	for forbidden in ["equip_current_0001", "equip_back_0001", "instanceId", "schemaVersion", "fixture_source"]:
		_expect(player_text.find(forbidden) < 0, "玩家文本暴露内部字段或身份: %s" % forbidden, errors)

	var world_rows := backpack_rows(profile, BackpackPanelPresenter.FILTER_WORLD)
	var equipment_rows := backpack_rows(profile, BackpackPanelPresenter.FILTER_EQUIPMENT)
	_expect(world_rows.size() == 1 and str(world_rows[0].get("itemId", "")) == "item_meat_small", "世界分类结果错误", errors)
	_expect(equipment_rows.size() == 4, "装备分类没有按具体实例输出", errors)
	for row in equipment_rows:
		_expect(str(row.get("kind", "")) == KIND_EQUIPMENT_INSTANCE, "装备分类混入非实例行", errors)
	return {
		"ok": errors.is_empty(),
		"errors": errors,
		"equipmentSlotCount": (all_state.get("equipmentSlots", []) as Array).size(),
		"inventoryRowCount": (all_state.get("backpackRows", []) as Array).size(),
	}


static func _equipment_slot_row(profile: Dictionary, slot_id: String, source: Dictionary) -> Dictionary:
	var item_id := str(source.get("itemId", ""))
	var valid := bool(source.get("valid", false))
	var instance_id := str(source.get("instanceId", ""))
	return {
		"kind": KIND_EQUIPMENT_INSTANCE,
		"slotId": slot_id,
		"slotLabel": EquipmentModel.slot_label_for(slot_id),
		"occupied": item_id != "",
		"itemId": item_id,
		"itemLabel": EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id, "装备")),
		"instanceId": instance_id,
		"selectionKey": str(source.get("selectionKey", "")),
		"valid": valid,
		"canSelect": valid,
		"stateSummary": str(source.get("stateSummary", "资料异常" if not valid else "")),
		"detail": _equipment_detail(profile, source, slot_id, true),
		"actionRef": {
			"slotId": slot_id,
			"instanceId": instance_id,
		},
	}


static func _empty_equipment_slot(slot_id: String) -> Dictionary:
	return {
		"kind": KIND_EMPTY,
		"slotId": slot_id,
		"slotLabel": EquipmentModel.slot_label_for(slot_id),
		"occupied": false,
		"itemId": "",
		"itemLabel": "未装备",
		"instanceId": "",
		"selectionKey": "",
		"valid": true,
		"canSelect": true,
		"stateSummary": "",
		"detail": _empty_equipment_detail(slot_id),
		"actionRef": {"slotId": slot_id, "instanceId": ""},
	}


static func _equipment_inventory_row(profile: Dictionary, source: Dictionary) -> Dictionary:
	var item_id := str(source.get("itemId", ""))
	var slot_id := EquipmentModel.slot_for(item_id)
	var valid := bool(source.get("valid", false))
	var instance_id := str(source.get("instanceId", ""))
	var slot_index := int(source.get("slotIndex", -1))
	var slot_offset := int(source.get("slotOffset", 0))
	return {
		"kind": KIND_EQUIPMENT_INSTANCE,
		"slotIndex": slot_index,
		"slotOffset": slot_offset,
		"itemId": item_id,
		"itemLabel": EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id, "装备")),
		"count": 1,
		"isEquipment": true,
		"instanceId": instance_id,
		"selectionKey": str(source.get("selectionKey", "")),
		"valid": valid,
		"canSelect": valid,
		"stateSummary": str(source.get("stateSummary", "资料异常" if not valid else "")),
		"detail": _equipment_detail(profile, source, slot_id, false),
		"actionRef": {
			"slotIndex": slot_index,
			"slotOffset": slot_offset,
			"instanceId": instance_id,
			"itemId": item_id,
		},
	}


static func _stack_inventory_row(slot_index: int, slot: Dictionary) -> Dictionary:
	var item_id := str(slot.get("itemId", ""))
	var count := maxi(0, int(slot.get("count", 0)))
	return {
		"kind": KIND_ITEM_STACK,
		"slotIndex": slot_index,
		"slotOffset": 0,
		"itemId": item_id,
		"itemLabel": BackpackModel.label_for(item_id, "物品"),
		"count": count,
		"isEquipment": false,
		"instanceId": "",
		"selectionKey": "slot:%d" % slot_index,
		"valid": true,
		"canSelect": true,
		"stateSummary": "x%d" % count,
		"detail": {
			"isEquipment": false,
			"itemId": item_id,
			"itemLabel": BackpackModel.label_for(item_id, "物品"),
			"count": count,
			"detailLines": BackpackModel.detail_lines_for_slot(slot),
		},
		"actionRef": {
			"slotIndex": slot_index,
			"itemId": item_id,
		},
	}


static func _empty_inventory_row(slot_index: int) -> Dictionary:
	return {
		"kind": KIND_EMPTY,
		"slotIndex": slot_index,
		"slotOffset": 0,
		"itemId": "",
		"itemLabel": "空格",
		"count": 0,
		"isEquipment": false,
		"instanceId": "",
		"selectionKey": "",
		"valid": true,
		"canSelect": false,
		"stateSummary": "",
		"detail": {"isEquipment": false, "itemLabel": "空格", "detailLines": ["空格"]},
		"actionRef": {"slotIndex": slot_index},
	}


static func _invalid_inventory_row(slot_index: int, message: String, item_id: String = "") -> Dictionary:
	return {
		"kind": KIND_EQUIPMENT_INSTANCE if EquipmentModel.is_equipment(item_id) else KIND_ITEM_STACK,
		"slotIndex": slot_index,
		"slotOffset": 0,
		"itemId": item_id,
		"itemLabel": EquipmentModel.label_for(item_id, "装备") if EquipmentModel.is_equipment(item_id) else "物品资料异常",
		"count": 1 if item_id != "" else 0,
		"isEquipment": EquipmentModel.is_equipment(item_id),
		"instanceId": "",
		"selectionKey": "",
		"valid": false,
		"canSelect": false,
		"stateSummary": "资料异常",
		"detail": {"itemLabel": "资料异常", "detailLines": [message]},
		"actionRef": {"slotIndex": slot_index},
	}


static func _equipment_detail(
	profile: Dictionary,
	source: Dictionary,
	slot_id: String,
	equipped: bool
) -> Dictionary:
	var item_id := str(source.get("itemId", "")).strip_edges()
	if item_id == "":
		return _empty_equipment_detail(slot_id)
	var instance_value = source.get("instance", {})
	var instance := instance_value as Dictionary if instance_value is Dictionary else {}
	var valid := bool(source.get("valid", false))
	var enhancement_value = instance.get("enhancement", {})
	var enhancement := enhancement_value as Dictionary if enhancement_value is Dictionary else {}
	var enhancement_level := clampi(
		int(enhancement.get("level", 0)),
		0,
		EquipmentModel.enhance_max_for(item_id)
	)
	var template_stats := _all_stats(EquipmentModel.stats_for(item_id))
	var enhancement_stats := _all_stats(EquipmentModel.enhance_stat_bonus_for(item_id, enhancement_level))
	var displayed_stats := _sum_stats(template_stats, enhancement_stats)
	var durability_max := EquipmentModel.max_durability_for(item_id)
	var durability_current := (
		clampi(int(instance.get("durability", durability_max)), 0, durability_max)
		if durability_max > 0
		else 0
	)
	var broken := durability_max > 0 and durability_current <= 0
	var requirements := _requirement_state(profile, item_id)
	var requirements_met := bool(requirements.get("met", false))
	var effective := valid and not broken and requirements_met
	var effective_stats := displayed_stats.duplicate(true) if effective else _zero_stats()
	var stat_rows: Array[Dictionary] = []
	for key in EquipmentModel.STAT_KEYS:
		stat_rows.append({
			"key": key,
			"label": EquipmentModel.stat_label_for(key),
			"template": int(template_stats.get(key, 0)),
			"enhancement": int(enhancement_stats.get(key, 0)),
			"total": int(displayed_stats.get(key, 0)),
			"effective": int(effective_stats.get(key, 0)),
		})
	var durability_text := ""
	if durability_max > 0:
		durability_text = "耐久：%d/%d%s" % [
			durability_current,
			durability_max,
			"（已损坏）" if broken else "",
		]
	var status_text := "属性生效"
	if not valid:
		status_text = str(source.get("error", "装备资料异常，暂不可操作。"))
	elif not requirements_met:
		status_text = "需求未满足，属性暂不生效"
	elif broken:
		status_text = "装备已损坏，属性暂不生效"
	var detail_lines: Array[String] = [
		EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id, "装备")),
		"类型：%s" % EquipmentModel.slot_label_for(slot_id),
	]
	if EquipmentModel.enhance_max_for(item_id) > 0:
		detail_lines.append("强化：+%d" % enhancement_level)
	if durability_text != "":
		detail_lines.append(durability_text)
	detail_lines.append(str(requirements.get("text", "需求：无")))
	var description := str(EquipmentModel.item_for_id(item_id).get("description", "")).strip_edges()
	if description != "":
		detail_lines.append(description)
	var spirit_text := EquipmentModel.spirit_text_for(item_id).strip_edges()
	if spirit_text != "":
		detail_lines.append("精灵技能：%s" % spirit_text)
	var battle_action_text := EquipmentModel.battle_action_text_for(item_id).strip_edges()
	if battle_action_text != "":
		detail_lines.append("战斗招式：%s" % battle_action_text)
	detail_lines.append(status_text)
	return {
		"empty": false,
		"valid": valid,
		"equipped": equipped,
		"itemId": item_id,
		"itemLabel": EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id, "装备")),
		"slotId": slot_id,
		"slotLabel": EquipmentModel.slot_label_for(slot_id),
		"enhancementLevel": enhancement_level,
		"enhancementText": "+%d" % enhancement_level,
		"templateStats": template_stats,
		"enhancementStats": enhancement_stats,
		"displayedStats": displayed_stats,
		"effectiveStats": effective_stats,
		"statRows": stat_rows,
		"durability": {
			"usesDurability": durability_max > 0,
			"current": durability_current,
			"maximum": durability_max,
			"text": durability_text,
		},
		"requirements": requirements,
		"requirementsMet": requirements_met,
		"broken": broken,
		"effective": effective,
		"statusText": status_text,
		"spiritText": spirit_text,
		"battleActionText": battle_action_text,
		"detailLines": detail_lines,
	}


static func _empty_equipment_detail(slot_id: String) -> Dictionary:
	var zero := _zero_stats()
	return {
		"empty": true,
		"valid": true,
		"equipped": true,
		"itemId": "",
		"itemLabel": "未装备",
		"slotId": slot_id,
		"slotLabel": EquipmentModel.slot_label_for(slot_id),
		"enhancementLevel": 0,
		"enhancementText": "",
		"templateStats": zero.duplicate(true),
		"enhancementStats": zero.duplicate(true),
		"displayedStats": zero.duplicate(true),
		"effectiveStats": zero.duplicate(true),
		"statRows": _stat_rows_for_zero(),
		"durability": {"usesDurability": false, "current": 0, "maximum": 0, "text": ""},
		"requirements": {"met": true, "text": "需求：无"},
		"requirementsMet": true,
		"broken": false,
		"effective": true,
		"statusText": "当前槽位未装备",
		"detailLines": ["%s：未装备" % EquipmentModel.slot_label_for(slot_id)],
	}


static func _requirement_state(profile: Dictionary, item_id: String) -> Dictionary:
	var player_value = profile.get("player", {})
	var player := player_value as Dictionary if player_value is Dictionary else {}
	var player_level := maxi(1, int(player.get("level", 1)))
	var player_rebirth := maxi(0, int(profile.get(REBIRTH_COUNT_KEY, 0)))
	var required_level := EquipmentModel.required_level_for(item_id)
	var required_rebirth := EquipmentModel.required_rebirth_for(item_id)
	var met := player_level >= required_level and player_rebirth >= required_rebirth
	var required_parts: Array[String] = []
	if required_level > 1:
		required_parts.append("Lv%d" % required_level)
	if required_rebirth > 0:
		required_parts.append(EquipmentModel.rebirth_label_for(required_rebirth))
	var requirement_label := "无" if required_parts.is_empty() else " / ".join(required_parts)
	return {
		"met": met,
		"playerLevel": player_level,
		"playerRebirth": player_rebirth,
		"requiredLevel": required_level,
		"requiredRebirth": required_rebirth,
		"text": "需求：%s（%s）" % [requirement_label, "已满足" if met else "未满足"],
	}


static func _all_stats(source: Dictionary) -> Dictionary:
	var result := {}
	for key in EquipmentModel.STAT_KEYS:
		result[key] = int(source.get(key, 0))
	return result


static func _sum_stats(left: Dictionary, right: Dictionary) -> Dictionary:
	var result := {}
	for key in EquipmentModel.STAT_KEYS:
		result[key] = int(left.get(key, 0)) + int(right.get(key, 0))
	return result


static func _zero_stats() -> Dictionary:
	var result := {}
	for key in EquipmentModel.STAT_KEYS:
		result[key] = 0
	return result


static func _stat_rows_for_zero() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for key in EquipmentModel.STAT_KEYS:
		result.append({
			"key": key,
			"label": EquipmentModel.stat_label_for(key),
			"template": 0,
			"enhancement": 0,
			"total": 0,
			"effective": 0,
		})
	return result


static func _normalized_category(category: String) -> String:
	return category if BackpackPanelPresenter.filter_ids().has(category) else BackpackPanelPresenter.FILTER_ALL


static func _delta_for(comparison: Dictionary, stat_key: String) -> int:
	for row_value in comparison.get("statRows", []):
		if row_value is Dictionary and str((row_value as Dictionary).get("key", "")) == stat_key:
			return int((row_value as Dictionary).get("delta", 0))
	return 0


static func _player_text_blob(value) -> String:
	var parts: Array[String] = []
	_collect_player_text(value, "", parts)
	return "\n".join(parts)


static func _collect_player_text(value, key: String, parts: Array[String]) -> void:
	if value is Dictionary:
		for child_key_value in (value as Dictionary).keys():
			var child_key := str(child_key_value)
			_collect_player_text((value as Dictionary).get(child_key_value), child_key, parts)
		return
	if value is Array:
		for child in value as Array:
			_collect_player_text(child, key, parts)
		return
	if value is String and (
		key.ends_with("Label")
		or key.ends_with("Text")
		or key == "detailLines"
		or key == "stateSummary"
		or key == "warningText"
	):
		parts.append(str(value))


static func _fixture_profile() -> Dictionary:
	return {
		"player": {"level": 1},
		REBIRTH_COUNT_KEY: 0,
		"backpackSlots": [
			{"itemId": "weapon_wooden_club", "count": 1},
			{"itemId": "weapon_wooden_club", "count": 1},
			{"itemId": "weapon_wooden_club", "count": 1},
			{"itemId": "weapon_bone_blade", "count": 1},
			{"itemId": "item_meat_small", "count": 3},
		],
		"equipmentSlots": {"right_hand_weapon": "weapon_wooden_club"},
		"equipmentSlotInstanceIds": {"right_hand_weapon": "equip_current_0001"},
		"equipmentInstances": {
			"equip_current_0001": _fixture_instance(
				"equip_current_0001",
				"weapon_wooden_club",
				EquipmentInstancePresenter.CONTAINER_EQUIPPED,
				30,
				0,
				"right_hand_weapon"
			),
			"equip_back_0001": _fixture_instance(
				"equip_back_0001",
				"weapon_wooden_club",
				EquipmentInstancePresenter.CONTAINER_BACKPACK,
				30,
				0
			),
			"equip_back_0002": _fixture_instance(
				"equip_back_0002",
				"weapon_wooden_club",
				EquipmentInstancePresenter.CONTAINER_BACKPACK,
				30,
				4
			),
			"equip_back_0003": _fixture_instance(
				"equip_back_0003",
				"weapon_wooden_club",
				EquipmentInstancePresenter.CONTAINER_BACKPACK,
				0,
				4
			),
			"equip_back_0004": _fixture_instance(
				"equip_back_0004",
				"weapon_bone_blade",
				EquipmentInstancePresenter.CONTAINER_BACKPACK,
				30,
				0
			),
		},
	}


static func _fixture_instance(
	instance_id: String,
	item_id: String,
	location: String,
	durability: int,
	enhancement_level: int,
	slot_id: String = ""
) -> Dictionary:
	return {
		"schemaVersion": 1,
		"instanceId": instance_id,
		"itemId": item_id,
		"location": location,
		"slotId": slot_id,
		"durability": durability,
		"enhancement": {
			"itemId": item_id,
			"level": enhancement_level,
			"history": [],
		} if EquipmentModel.enhance_max_for(item_id) > 0 else {},
		"wearCounters": {
			"itemId": item_id,
			"attackCount": 0,
			"hitCount": 0,
		} if EquipmentModel.max_durability_for(item_id) > 0 else {},
		"expPillCharge": {},
		"source": "fixture_source",
	}


static func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)
