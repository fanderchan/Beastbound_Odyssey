extends RefCounted

const BackpackModel := preload("res://scripts/progression/backpack_model.gd")
const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")
const EquipmentModel := preload("res://scripts/progression/equipment_model.gd")

const CONTAINER_BACKPACK := "backpack"
const CONTAINER_EQUIPPED := "equipped"
const CONTAINER_BANK := "bank"
const EQUIPMENT_ENVELOPES_KEY := "equipmentEnvelopes"
const PUBLIC_ENVELOPE_SCHEMA_VERSION := 1
const PUBLIC_VECTOR_PATH := "res://../../tools/fixtures/equipment_transfer_public_v1_vectors.json"
const PUBLIC_ENVELOPE_ROOT_KEYS: Array[String] = ["schemaVersion", "envelopeId", "itemId", "instanceState", "stateFingerprint"]
const PUBLIC_STATE_REQUIRED_KEYS: Array[String] = ["schemaVersion", "itemId", "durability", "enhancement", "wearCounters", "expPillCharge"]
const DEFAULT_WEAPON_ATTACKS_PER_DURABILITY := 100
const DEFAULT_ARMOR_HITS_PER_DURABILITY := 10
const DEFAULT_MAX_PLAYER_LEVEL := 140


static func backpack_rows(profile: Dictionary) -> Array[Dictionary]:
	var rows: Array[Dictionary] = []
	var raw_instances = profile.get("equipmentInstances", {})
	if not (raw_instances is Dictionary):
		return [_invalid_row(CONTAINER_BACKPACK, "", "装备实例容器异常。")]
	var instances := _instance_dictionary(raw_instances)
	var by_item := {}
	for instance_id in _sorted_keys(raw_instances as Dictionary):
		var raw_instance = (raw_instances as Dictionary).get(instance_id)
		if not (raw_instance is Dictionary):
			var invalid_instance := _invalid_row(CONTAINER_BACKPACK, "", "装备实例资料不是对象。")
			invalid_instance["instanceId"] = instance_id
			rows.append(invalid_instance)
			continue
		var instance := instances.get(instance_id, {}) as Dictionary
		var location := str(instance.get("location", "")).strip_edges()
		if location == CONTAINER_EQUIPPED:
			continue
		var item_id := str(instance.get("itemId", "")).strip_edges()
		if location != CONTAINER_BACKPACK:
			var invalid_location := row_for_instance(instance, CONTAINER_BACKPACK)
			_invalidate_row(invalid_location, "装备实例位置异常。")
			rows.append(invalid_location)
			continue
		if item_id == "" or not EquipmentModel.is_equipment(item_id):
			var invalid_item := row_for_instance(instance, CONTAINER_BACKPACK)
			_invalidate_row(invalid_item, "装备实例物品身份异常。")
			rows.append(invalid_item)
			continue
		if str(instance.get("instanceId", "")).strip_edges() != str(instance_id):
			var invalid_identity := row_for_instance(instance, CONTAINER_BACKPACK)
			_invalidate_row(invalid_identity, "装备实例索引与身份不一致。")
			rows.append(invalid_identity)
			continue
		if not by_item.has(item_id):
			by_item[item_id] = [] as Array[Dictionary]
		(by_item[item_id] as Array[Dictionary]).append(instance.duplicate(true))

	var consumed_by_item := {}
	var raw_slots = profile.get("backpackSlots", [])
	if not (raw_slots is Array):
		rows.append(_invalid_row(CONTAINER_BACKPACK, "", "背包格子容器异常。"))
		return rows
	var slot_errors: Array[Dictionary] = []
	for slot_index in range((raw_slots as Array).size()):
		var raw_slot = (raw_slots as Array)[slot_index]
		if not (raw_slot is Dictionary):
			var invalid_slot := _invalid_row(CONTAINER_BACKPACK, "", "背包格子资料不是对象。")
			invalid_slot["slotIndex"] = slot_index
			slot_errors.append(invalid_slot)
			continue
		var slot := raw_slot as Dictionary
		for slot_key_value in slot.keys():
			if not ["itemId", "count"].has(str(slot_key_value)):
				var invalid_field := _invalid_row(CONTAINER_BACKPACK, str(slot.get("itemId", "")), "背包格子含不支持的字段。")
				invalid_field["slotIndex"] = slot_index
				slot_errors.append(invalid_field)
				break
		var item_id := str(slot.get("itemId", "")).strip_edges()
		if item_id == "":
			if slot.has("count") and not _exact_integer_equals(slot.get("count"), 0):
				var invalid_empty_slot := _invalid_row(CONTAINER_BACKPACK, "", "背包空格数量异常。")
				invalid_empty_slot["slotIndex"] = slot_index
				slot_errors.append(invalid_empty_slot)
			continue
		if not _is_positive_integer(slot.get("count")):
			var invalid_count := _invalid_row(CONTAINER_BACKPACK, item_id, "背包物品数量异常。")
			invalid_count["slotIndex"] = slot_index
			slot_errors.append(invalid_count)
	if not slot_errors.is_empty():
		rows.append_array(slot_errors)
		for item_id_value in by_item.keys():
			for instance_value in by_item.get(item_id_value, []) as Array[Dictionary]:
				var blocked := row_for_instance(instance_value, CONTAINER_BACKPACK)
				_invalidate_row(blocked, "背包装备格资料异常，暂不可选择实例。")
				rows.append(blocked)
		return rows
	for slot_index in range((raw_slots as Array).size()):
		var raw_slot = (raw_slots as Array)[slot_index]
		var slot := raw_slot as Dictionary
		var item_id := str(slot.get("itemId", "")).strip_edges()
		var count := int(slot.get("count", 0))
		if item_id == "" or count <= 0 or not EquipmentModel.is_equipment(item_id):
			continue
		var candidates := by_item.get(item_id, []) as Array[Dictionary]
		var consumed := int(consumed_by_item.get(item_id, 0))
		for offset in range(count):
			if consumed + offset >= candidates.size():
				rows.append(_missing_row(CONTAINER_BACKPACK, item_id, slot_index, "背包装备缺少实例资料。"))
				continue
			var row := row_for_instance(candidates[consumed + offset], CONTAINER_BACKPACK)
			row["slotIndex"] = slot_index
			row["slotOffset"] = offset
			rows.append(row)
		consumed_by_item[item_id] = consumed + count

	for item_id_value in by_item.keys():
		var item_id := str(item_id_value)
		var candidates := by_item.get(item_id, []) as Array[Dictionary]
		var consumed := int(consumed_by_item.get(item_id, 0))
		for index in range(consumed, candidates.size()):
			var row := row_for_instance(candidates[index], CONTAINER_BACKPACK)
			_invalidate_row(row, "背包装备实例没有对应物品格。")
			row["slotIndex"] = -1
			rows.append(row)
	return rows


static func equipped_rows(profile: Dictionary) -> Array[Dictionary]:
	var rows: Array[Dictionary] = []
	var raw_instances = profile.get("equipmentInstances", {})
	if not (raw_instances is Dictionary):
		return [_invalid_row(CONTAINER_EQUIPPED, "", "装备实例容器异常。")]
	var instances := _instance_dictionary(raw_instances)
	var mappings = profile.get("equipmentSlotInstanceIds", {})
	if not (mappings is Dictionary):
		return [_invalid_row(CONTAINER_EQUIPPED, "", "装备槽位映射容器异常。")]
	var mapping_dict := mappings as Dictionary
	var raw_slots = profile.get("equipmentSlots", {})
	if not (raw_slots is Dictionary):
		return [_invalid_row(CONTAINER_EQUIPPED, "", "装备槽位容器异常。")]
	var slot_dict := raw_slots as Dictionary
	var referenced_instance_ids := {}
	for slot_id in EquipmentModel.slot_ids():
		var instance_id := str(mapping_dict.get(slot_id, "")).strip_edges()
		var equipped_item_id := str(slot_dict.get(slot_id, "")).strip_edges()
		if instance_id == "":
			if equipped_item_id != "":
				var missing_mapping := _missing_row(CONTAINER_EQUIPPED, equipped_item_id, -1, "装备槽有物品但缺少实例映射。")
				missing_mapping["slotId"] = slot_id
				rows.append(missing_mapping)
			continue
		referenced_instance_ids[instance_id] = true
		if not instances.has(instance_id):
			var item_id := str(slot_dict.get(slot_id, ""))
			var missing := _missing_row(CONTAINER_EQUIPPED, item_id, -1, "装备槽缺少实例资料。")
			missing["slotId"] = slot_id
			missing["instanceId"] = instance_id
			rows.append(missing)
			continue
		var row := row_for_instance(instances.get(instance_id, {}) as Dictionary, CONTAINER_EQUIPPED)
		row["slotId"] = slot_id
		row["slotLabel"] = EquipmentModel.slot_label_for(slot_id)
		var instance := instances.get(instance_id, {}) as Dictionary
		if str(instance.get("instanceId", "")).strip_edges() != instance_id:
			_invalidate_row(row, "装备实例索引与身份不一致。")
		elif str(instance.get("location", "")).strip_edges() != CONTAINER_EQUIPPED or str(instance.get("slotId", "")).strip_edges() != slot_id:
			_invalidate_row(row, "装备实例与槽位位置不一致。")
		elif equipped_item_id == "" or str(instance.get("itemId", "")).strip_edges() != equipped_item_id:
			_invalidate_row(row, "装备实例与槽位物品不一致。")
		rows.append(row)
	for mapping_key_value in _sorted_keys(mapping_dict):
		if EquipmentModel.slot_ids().has(mapping_key_value) or str(mapping_dict.get(mapping_key_value, "")).strip_edges() == "":
			continue
		var invalid_mapping := _invalid_row(CONTAINER_EQUIPPED, "", "存在未知装备槽位映射。")
		invalid_mapping["slotId"] = mapping_key_value
		invalid_mapping["instanceId"] = str(mapping_dict.get(mapping_key_value, ""))
		rows.append(invalid_mapping)
	for instance_id_value in _sorted_keys(instances):
		var instance_id := str(instance_id_value)
		var instance := instances.get(instance_id, {}) as Dictionary
		if str(instance.get("location", "")).strip_edges() != CONTAINER_EQUIPPED or referenced_instance_ids.has(instance_id):
			continue
		var orphan := row_for_instance(instance, CONTAINER_EQUIPPED)
		_invalidate_row(orphan, "已装备实例没有对应槽位映射。")
		rows.append(orphan)
	return rows


static func bank_envelope_rows(profile: Dictionary) -> Array[Dictionary]:
	var rows: Array[Dictionary] = []
	var bank = profile.get("bank", {})
	if not (bank is Dictionary):
		return [_invalid_row(CONTAINER_BANK, "", "银行实例容器异常。")]
	if not _exact_integer_equals((bank as Dictionary).get("schemaVersion"), 2):
		return [_invalid_row(CONTAINER_BANK, "", "银行实例版本异常。")]
	var raw_slots = (bank as Dictionary).get("slots", [])
	if not (raw_slots is Array):
		return [_invalid_row(CONTAINER_BANK, "", "银行格子容器异常。")]
	var row_indices_by_envelope_id := {}
	for bank_slot_index in range((raw_slots as Array).size()):
		var raw_slot = (raw_slots as Array)[bank_slot_index]
		if not (raw_slot is Dictionary):
			var invalid_slot := _invalid_row(CONTAINER_BANK, "", "银行格子资料不是对象。")
			invalid_slot["bankSlotIndex"] = bank_slot_index
			rows.append(invalid_slot)
			continue
		var slot := raw_slot as Dictionary
		var item_id := str(slot.get("itemId", "")).strip_edges()
		var count_is_integer := _is_nonnegative_integer(slot.get("count"))
		var count := int(slot.get("count", 0)) if count_is_integer else -1
		var has_envelopes := slot.has(EQUIPMENT_ENVELOPES_KEY)
		var raw_envelopes = slot.get(EQUIPMENT_ENVELOPES_KEY, [])
		if not (raw_envelopes is Array):
			var invalid_envelopes := _invalid_row(CONTAINER_BANK, item_id, "银行装备信封容器异常。")
			invalid_envelopes["bankSlotIndex"] = bank_slot_index
			rows.append(invalid_envelopes)
			continue
		if item_id == "":
			var empty_count_ok := not slot.has("count") or (count_is_integer and count == 0)
			if empty_count_ok and (raw_envelopes as Array).is_empty():
				continue
			var invalid_empty_slot := _invalid_row(CONTAINER_BANK, item_id, "银行空格资料异常。")
			invalid_empty_slot["bankSlotIndex"] = bank_slot_index
			rows.append(invalid_empty_slot)
			continue
		if not EquipmentModel.is_equipment(item_id):
			if not has_envelopes or (raw_envelopes as Array).is_empty():
				continue
			var unexpected := _invalid_row(CONTAINER_BANK, item_id, "非装备格不能携带装备信封。")
			unexpected["bankSlotIndex"] = bank_slot_index
			rows.append(unexpected)
			continue
		var slot_row_start := rows.size()
		var slot_error := ""
		if not count_is_integer or count < 1:
			slot_error = "银行装备数量异常。"
		elif count != (raw_envelopes as Array).size():
			slot_error = "银行装备数量与实例信封不一致。"
		for envelope_index in range((raw_envelopes as Array).size()):
			var raw_envelope = (raw_envelopes as Array)[envelope_index]
			if not (raw_envelope is Dictionary):
				var invalid_envelope := _invalid_row(CONTAINER_BANK, item_id, "银行装备信封资料不是对象。")
				invalid_envelope["bankSlotIndex"] = bank_slot_index
				invalid_envelope["envelopeIndex"] = envelope_index
				rows.append(invalid_envelope)
				if slot_error == "":
					slot_error = "银行装备格含异常信封。"
				continue
			var row := row_for_envelope(raw_envelope as Dictionary, CONTAINER_BANK)
			row["bankSlotIndex"] = bank_slot_index
			row["envelopeIndex"] = envelope_index
			if item_id != "" and str(row.get("itemId", "")) != item_id:
				_invalidate_row(row, "银行信封与物品身份不一致。")
			if not bool(row.get("valid", false)) and slot_error == "":
				slot_error = "银行装备格含异常信封。"
			var envelope_id := str(row.get("envelopeId", ""))
			rows.append(row)
			if envelope_id != "":
				var row_indices := row_indices_by_envelope_id.get(envelope_id, []) as Array
				row_indices.append(rows.size() - 1)
				row_indices_by_envelope_id[envelope_id] = row_indices
		if slot_error != "":
			if rows.size() == slot_row_start:
				var missing := _missing_row(CONTAINER_BANK, item_id, -1, slot_error)
				missing["bankSlotIndex"] = bank_slot_index
				rows.append(missing)
			else:
				for row_index in range(slot_row_start, rows.size()):
					_invalidate_row(rows[row_index], slot_error)
	for envelope_id_value in row_indices_by_envelope_id.keys():
		var envelope_id := str(envelope_id_value)
		var row_indices := row_indices_by_envelope_id.get(envelope_id, []) as Array
		if row_indices.size() < 2:
			continue
		for row_index_value in row_indices:
			var row_index := int(row_index_value)
			if row_index >= 0 and row_index < rows.size():
				_invalidate_row(rows[row_index], "银行内存在重复的装备信封身份。")
	return rows


static func row_for_instance(instance_value: Dictionary, container: String = "") -> Dictionary:
	var instance := instance_value.duplicate(true)
	instance.erase("source")
	instance.erase("transferProvenance")
	var item_id := str(instance.get("itemId", "")).strip_edges()
	var instance_id := str(instance.get("instanceId", "")).strip_edges()
	var state_summary := state_summary_for_instance(instance)
	var item_label := EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id, "装备"))
	var state_error := _instance_state_error(instance, item_id, true)
	if state_error == "" and container == CONTAINER_BACKPACK and (
		str(instance.get("location", "")).strip_edges() != CONTAINER_BACKPACK
		or str(instance.get("slotId", "")).strip_edges() != ""
	):
		state_error = "背包装备实例位置异常。"
	elif state_error == "" and container == CONTAINER_EQUIPPED and (
		str(instance.get("location", "")).strip_edges() != CONTAINER_EQUIPPED
		or str(instance.get("slotId", "")).strip_edges() == ""
	):
		state_error = "已装备实例位置异常。"
	return {
		"valid": state_error == "",
		"error": state_error,
		"container": container,
		"instanceId": instance_id,
		"itemId": item_id,
		"itemLabel": item_label,
		"stateSummary": state_summary,
		"selectionLabel": "%s｜%s" % [item_label, state_summary],
		"selectionKey": "instance:%s" % instance_id if state_error == "" else "",
		"detailLines": detail_lines_for_instance(instance) if state_error == "" else [state_error],
		"instance": instance,
	}


static func row_for_envelope(envelope_value: Dictionary, container: String = "") -> Dictionary:
	var envelope := envelope_value.duplicate(true)
	var envelope_id := str(envelope.get("envelopeId", "")).strip_edges()
	var item_id := str(envelope.get("itemId", "")).strip_edges()
	var state_value = envelope.get("instanceState", {})
	var state := (state_value as Dictionary).duplicate(true) if state_value is Dictionary else {}
	state.erase("source")
	state.erase("transferProvenance")
	var fingerprint := str(envelope.get("stateFingerprint", ""))
	var error := _public_envelope_error(envelope, state, item_id, envelope_id, fingerprint)
	var public_envelope := {
		"schemaVersion": envelope.get("schemaVersion", 0),
		"envelopeId": envelope_id,
		"itemId": item_id,
		"instanceState": state.duplicate(true),
		"stateFingerprint": fingerprint,
	}
	var item_label := EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id, "装备"))
	var summary := state_summary_for_instance(state)
	return {
		"valid": error == "",
		"error": error,
		"container": container,
		"instanceId": "",
		"envelopeId": envelope_id,
		"itemId": item_id,
		"itemLabel": item_label,
		"stateSummary": summary,
		"selectionLabel": "%s｜%s" % [item_label, summary] if error == "" else "实例信封异常",
		"selectionKey": "envelope:%s" % envelope_id if error == "" else "",
		"detailLines": detail_lines_for_instance(state) if error == "" else [error],
		"envelope": public_envelope,
		"instanceState": state,
	}


static func state_summary_for_instance(instance: Dictionary) -> String:
	var item_id := str(instance.get("itemId", "")).strip_edges()
	var parts: Array[String] = []
	var enhance_max := EquipmentModel.enhance_max_for(item_id)
	if enhance_max > 0:
		var enhancement = instance.get("enhancement", {})
		var level := int((enhancement as Dictionary).get("level", 0)) if enhancement is Dictionary else 0
		parts.append("+%d" % clampi(level, 0, enhance_max))
	var durability_max := EquipmentModel.max_durability_for(item_id)
	if durability_max > 0:
		var durability := clampi(int(instance.get("durability", durability_max)), 0, durability_max)
		parts.append("已损坏" if durability <= 0 else "耐久%d/%d" % [durability, durability_max])
	var charge = instance.get("expPillCharge", {})
	if charge is Dictionary and not (charge as Dictionary).is_empty():
		var level := maxi(1, int((charge as Dictionary).get("level", EquipmentModel.exp_pill_level_for(item_id))))
		var exp := maxi(0, int((charge as Dictionary).get("exp", 0)))
		var next_exp := maxi(1, int((charge as Dictionary).get("nextExp", 1)))
		parts.append("储能Lv%d %d/%d" % [level, exp, next_exp])
	var affix_count := _collection_count(instance.get("affixes", []))
	if affix_count > 0:
		parts.append("词缀%d" % affix_count)
	var trait_count := _collection_count(instance.get("traits", []))
	if trait_count > 0:
		parts.append("特性%d" % trait_count)
	return " · ".join(parts) if not parts.is_empty() else "基础状态"


static func detail_lines_for_instance(instance: Dictionary) -> Array[String]:
	var lines: Array[String] = [state_summary_for_instance(instance)]
	var wear = instance.get("wearCounters", {})
	if wear is Dictionary and not (wear as Dictionary).is_empty():
		var attack_count := maxi(0, int((wear as Dictionary).get("attackCount", 0)))
		var hit_count := maxi(0, int((wear as Dictionary).get("hitCount", 0)))
		if attack_count > 0 or hit_count > 0:
			lines.append("磨损进度：攻击%d / 受击%d" % [attack_count, hit_count])
	return lines


static func _public_envelope_error(envelope: Dictionary, state: Dictionary, item_id: String, envelope_id: String, fingerprint: String) -> String:
	if not _dictionary_has_only_keys(envelope, PUBLIC_ENVELOPE_ROOT_KEYS):
		return "装备公开信封含不支持的字段。"
	if not _exact_integer_equals(envelope.get("schemaVersion"), PUBLIC_ENVELOPE_SCHEMA_VERSION):
		return "装备公开信封版本异常。"
	if not _valid_envelope_id(envelope_id):
		return "装备公开信封身份异常。"
	if not _valid_fingerprint(fingerprint):
		return "装备公开信封指纹格式异常。"
	var raw_state = envelope.get("instanceState")
	if not (raw_state is Dictionary):
		return "装备公开信封缺少实例状态。"
	if (raw_state as Dictionary).has("source") or (raw_state as Dictionary).has("transferProvenance"):
		return "装备公开信封包含私有来源字段。"
	return _instance_state_error(state, item_id, false)


static func _instance_state_error(instance: Dictionary, item_id: String, require_instance_id: bool) -> String:
	if item_id == "" or not EquipmentModel.is_equipment(item_id):
		return "装备实例物品身份异常。"
	for key in PUBLIC_STATE_REQUIRED_KEYS:
		if not instance.has(key):
			return "装备实例缺少%s。" % key
	if not _exact_integer_equals(instance.get("schemaVersion"), 1):
		return "装备实例版本异常。"
	if str(instance.get("itemId", "")).strip_edges() != item_id:
		return "装备实例物品身份不一致。"
	if require_instance_id and str(instance.get("instanceId", "")).strip_edges() == "":
		return "装备实例身份缺失。"
	if not _is_nonnegative_integer(instance.get("durability")):
		return "装备实例耐久异常。"
	var durability_max := EquipmentModel.max_durability_for(item_id)
	if int(instance.get("durability", 0)) > durability_max:
		return "装备实例耐久超过上限。"
	var enhancement = instance.get("enhancement")
	var wear = instance.get("wearCounters")
	var charge = instance.get("expPillCharge")
	if not (enhancement is Dictionary) or not (wear is Dictionary) or not (charge is Dictionary):
		return "装备实例状态容器异常。"
	var enhance_max := EquipmentModel.enhance_max_for(item_id)
	if enhance_max > 0 and (enhancement as Dictionary).is_empty():
		return "装备实例缺少强化状态。"
	if enhance_max <= 0 and not (enhancement as Dictionary).is_empty():
		return "不可强化装备携带了强化状态。"
	if not (enhancement as Dictionary).is_empty():
		if str((enhancement as Dictionary).get("itemId", "")) != item_id or not _is_nonnegative_integer((enhancement as Dictionary).get("level")):
			return "装备实例强化状态异常。"
		if int((enhancement as Dictionary).get("level", 0)) > enhance_max:
			return "装备实例强化超过上限。"
		var history = (enhancement as Dictionary).get("history", [])
		if not (history is Array):
			return "装备实例强化历史异常。"
		for history_entry in history as Array:
			if not (history_entry is Dictionary):
				return "装备实例强化历史异常。"
	if durability_max > 0 and (wear as Dictionary).is_empty():
		return "装备实例缺少磨损状态。"
	if durability_max <= 0 and not (wear as Dictionary).is_empty():
		return "无耐久装备携带了磨损状态。"
	if not (wear as Dictionary).is_empty():
		if str((wear as Dictionary).get("itemId", "")) != item_id:
			return "装备实例磨损物品身份异常。"
		for key in ["attackCount", "hitCount"]:
			if not _is_nonnegative_integer((wear as Dictionary).get(key)):
				return "装备实例磨损状态异常。"
		var attack_count := int((wear as Dictionary).get("attackCount", 0))
		var hit_count := int((wear as Dictionary).get("hitCount", 0))
		var slot_id := EquipmentModel.slot_for(item_id)
		var is_weapon := [EquipmentModel.SLOT_RIGHT_HAND_WEAPON, EquipmentModel.SLOT_LEFT_HAND_WEAPON].has(slot_id)
		if is_weapon:
			var attack_limit := BalanceCatalogModel.equipment_weapon_attacks_per_durability(DEFAULT_WEAPON_ATTACKS_PER_DURABILITY)
			if attack_count >= attack_limit or hit_count != 0:
				return "武器磨损余数异常。"
		else:
			var hit_limit := BalanceCatalogModel.equipment_armor_hits_per_durability(DEFAULT_ARMOR_HITS_PER_DURABILITY)
			if hit_count >= hit_limit or attack_count != 0:
				return "防具磨损余数异常。"
	var exp_pill_level := EquipmentModel.exp_pill_level_for(item_id)
	if exp_pill_level > 0 and (charge as Dictionary).is_empty():
		return "经验丹实例缺少充能状态。"
	if exp_pill_level <= 0 and not (charge as Dictionary).is_empty():
		return "普通装备携带了经验丹充能。"
	if not (charge as Dictionary).is_empty():
		if str((charge as Dictionary).get("itemId", "")) != item_id:
			return "装备实例充能物品身份异常。"
		for key in ["level", "exp", "nextExp"]:
			if not _is_nonnegative_integer((charge as Dictionary).get(key)):
				return "装备实例充能状态异常。"
		var charge_level := int((charge as Dictionary).get("level", 0))
		var charge_exp := int((charge as Dictionary).get("exp", 0))
		var charge_next_exp := int((charge as Dictionary).get("nextExp", 0))
		var max_player_level := BalanceCatalogModel.max_player_level(DEFAULT_MAX_PLAYER_LEVEL)
		if charge_level < exp_pill_level or charge_level > max_player_level or charge_next_exp < 1:
			return "装备实例充能进度异常。"
		if (charge_level < max_player_level and charge_exp >= charge_next_exp) or (charge_level >= max_player_level and charge_exp != 0):
			return "装备实例充能进度异常。"
		if charge_next_exp != BalanceCatalogModel.exp_to_next_level(charge_level, 1):
			return "装备实例充能曲线异常。"
	return ""


static func _dictionary_has_only_keys(value: Dictionary, allowed: Array[String]) -> bool:
	for key_value in value.keys():
		if not allowed.has(str(key_value)):
			return false
	return true


static func _valid_envelope_id(value: String) -> bool:
	if not value.begins_with("eqx_") or value.length() < 12 or value.length() > 160:
		return false
	for index in range(value.length()):
		var code := value.unicode_at(index)
		if not (
			(code >= 48 and code <= 57)
			or (code >= 65 and code <= 90)
			or (code >= 97 and code <= 122)
			or code == 95
			or code == 45
		):
			return false
	return true


static func _valid_fingerprint(value: String) -> bool:
	if value.length() != 64 or value == "0".repeat(64):
		return false
	for index in range(value.length()):
		var code := value.unicode_at(index)
		if not ((code >= 48 and code <= 57) or (code >= 97 and code <= 102)):
			return false
	return true


static func _exact_integer_equals(value, expected: int) -> bool:
	return _is_integer_value(value) and int(value) == expected


static func _is_nonnegative_integer(value) -> bool:
	return _is_integer_value(value) and int(value) >= 0


static func _is_positive_integer(value) -> bool:
	return _is_integer_value(value) and int(value) >= 1


static func _is_integer_value(value) -> bool:
	if not (value is int or value is float):
		return false
	var numeric := float(value)
	return is_finite(numeric) and numeric == floor(numeric)


static func _collection_count(value) -> int:
	if value is Array:
		return (value as Array).size()
	if value is Dictionary:
		return (value as Dictionary).size()
	return 0


static func self_check() -> Dictionary:
	var errors: Array[String] = []
	var vector_document := _shared_vector_document()
	var vectors = vector_document.get("vectors", [])
	_expect(int(vector_document.get("schemaVersion", 0)) == 1 and vectors is Array and not (vectors as Array).is_empty(), "无法读取装备公开信封共享向量", errors)
	var source := _fixture_profile()
	var source_before := source.duplicate(true)
	var backpack := backpack_rows(source)
	var equipped := equipped_rows(source)
	var bank := bank_envelope_rows(source)
	_expect(_deep_equal(source, source_before), "presenter 改写了源档案", errors)
	_expect(backpack.size() == 4, "背包装备实例行数错误", errors)
	_expect(equipped.size() == 1, "已装备实例行数错误", errors)
	_expect(bank.size() == 1, "银行实例信封行数错误", errors)
	_expect(str(backpack[0].get("instanceId", "")) == "equip_000001", "背包实例排序不稳定", errors)
	_expect(str(backpack[1].get("stateSummary", "")).find("+4") >= 0, "强化摘要缺失", errors)
	_expect(str(backpack[1].get("stateSummary", "")).find("耐久12/") >= 0, "耐久摘要缺失", errors)
	_expect(str(backpack[2].get("stateSummary", "")).find("储能Lv1 45/%d" % BalanceCatalogModel.exp_to_next_level(1, 1)) >= 0, "充能摘要缺失", errors)
	var first_instance := backpack[0].get("instance", {}) as Dictionary
	_expect(_deep_equal(first_instance.get("futureAffixes", {}), {"lucky": 7}), "未来实例字段未原样保留", errors)
	var bank_state := bank[0].get("instanceState", {}) as Dictionary
	_expect(_deep_equal(bank_state.get("futureVisual", {}), {"glow": "amber"}), "银行信封未来字段未原样保留", errors)
	_expect(str(bank[0].get("selectionKey", "")) == "envelope:eqx_public_vector_0001", "银行信封选择键不稳定", errors)
	_expect(str(bank[0].get("stateSummary", "")).find("+3") >= 0, "共享向量强化摘要错误", errors)
	_expect(str(bank[0].get("stateSummary", "")).find("耐久18/") >= 0, "共享向量耐久摘要错误", errors)
	_expect(str(bank[0].get("stateSummary", "")).find("词缀1") >= 0, "共享向量词缀数量缺失", errors)
	_expect(JSON.stringify(bank[0]).find("provenance") < 0 and JSON.stringify(bank[0]).find("market_escrow") < 0, "presenter 暴露私有来源字段", errors)
	_expect(str(backpack[0].get("selectionKey", "")) == "instance:equip_000001", "背包实例选择键不稳定", errors)

	var expected_public := _shared_expected_public_envelope()
	var bad_container := source.duplicate(true)
	((bad_container.get("bank", {}) as Dictionary).get("slots", []) as Array)[0][EQUIPMENT_ENVELOPES_KEY] = {"bad": true}
	var bad_container_rows := bank_envelope_rows(bad_container)
	_expect(bad_container_rows.size() == 1 and not bool(bad_container_rows[0].get("valid", true)), "非数组信封容器被静默隐藏", errors)

	var bad_entry := source.duplicate(true)
	((bad_entry.get("bank", {}) as Dictionary).get("slots", []) as Array)[0][EQUIPMENT_ENVELOPES_KEY] = [42]
	var bad_entry_rows := bank_envelope_rows(bad_entry)
	_expect(bad_entry_rows.size() == 1 and not bool(bad_entry_rows[0].get("valid", true)), "非对象信封被静默隐藏", errors)

	var missing_field := expected_public.duplicate(true)
	missing_field.erase("stateFingerprint")
	var missing_row := row_for_envelope(missing_field, CONTAINER_BANK)
	_expect(not bool(missing_row.get("valid", true)) and str(missing_row.get("selectionKey", "")) == "", "缺字段公开信封被误判可操作", errors)

	var duplicate_profile := source.duplicate(true)
	var duplicate_slot := (((duplicate_profile.get("bank", {}) as Dictionary).get("slots", []) as Array)[0] as Dictionary)
	duplicate_slot["count"] = 2
	duplicate_slot[EQUIPMENT_ENVELOPES_KEY] = [expected_public.duplicate(true), expected_public.duplicate(true)]
	var duplicate_rows := bank_envelope_rows(duplicate_profile)
	_expect(
		duplicate_rows.size() == 2
			and not bool(duplicate_rows[0].get("valid", true))
			and not bool(duplicate_rows[1].get("valid", true))
			and str(duplicate_rows[0].get("selectionKey", "")) == ""
			and str(duplicate_rows[1].get("selectionKey", "")) == "",
		"重复信封身份没有整体失败关闭",
		errors
	)

	var mismatched_count_profile := source.duplicate(true)
	var mismatched_count_slot := (((mismatched_count_profile.get("bank", {}) as Dictionary).get("slots", []) as Array)[0] as Dictionary)
	mismatched_count_slot["count"] = 2
	var mismatched_count_rows := bank_envelope_rows(mismatched_count_profile)
	_expect(mismatched_count_rows.size() == 1 and not bool(mismatched_count_rows[0].get("valid", true)) and str(mismatched_count_rows[0].get("selectionKey", "")) == "", "数量不一致银行格仍可操作", errors)

	var missing_bank_item_profile := source.duplicate(true)
	var missing_bank_item_slot := (((missing_bank_item_profile.get("bank", {}) as Dictionary).get("slots", []) as Array)[0] as Dictionary)
	missing_bank_item_slot["itemId"] = ""
	var missing_bank_item_rows := bank_envelope_rows(missing_bank_item_profile)
	_expect(missing_bank_item_rows.size() == 1 and not bool(missing_bank_item_rows[0].get("valid", true)) and str(missing_bank_item_rows[0].get("selectionKey", "")) == "", "缺物品身份银行格仍可操作", errors)

	var legacy_bank_profile := source.duplicate(true)
	(legacy_bank_profile.get("bank", {}) as Dictionary)["schemaVersion"] = 1
	var legacy_bank_rows := bank_envelope_rows(legacy_bank_profile)
	_expect(legacy_bank_rows.size() == 1 and not bool(legacy_bank_rows[0].get("valid", true)) and str(legacy_bank_rows[0].get("selectionKey", "")) == "", "旧版银行信封被误判可操作", errors)

	var malformed_history := expected_public.duplicate(true)
	var malformed_history_state := malformed_history.get("instanceState", {}) as Dictionary
	var malformed_history_enhancement := malformed_history_state.get("enhancement", {}) as Dictionary
	malformed_history_enhancement["history"] = [42]
	malformed_history_state["enhancement"] = malformed_history_enhancement
	malformed_history["instanceState"] = malformed_history_state
	var malformed_history_row := row_for_envelope(malformed_history, CONTAINER_BANK)
	_expect(not bool(malformed_history_row.get("valid", true)) and str(malformed_history_row.get("selectionKey", "")) == "", "坏强化历史公开信封仍可操作", errors)

	var exhausted_wear := expected_public.duplicate(true)
	var exhausted_wear_state := exhausted_wear.get("instanceState", {}) as Dictionary
	var exhausted_wear_counters := exhausted_wear_state.get("wearCounters", {}) as Dictionary
	exhausted_wear_counters["attackCount"] = BalanceCatalogModel.equipment_weapon_attacks_per_durability(DEFAULT_WEAPON_ATTACKS_PER_DURABILITY)
	exhausted_wear_state["wearCounters"] = exhausted_wear_counters
	exhausted_wear["instanceState"] = exhausted_wear_state
	var exhausted_wear_row := row_for_envelope(exhausted_wear, CONTAINER_BANK)
	_expect(not bool(exhausted_wear_row.get("valid", true)) and str(exhausted_wear_row.get("selectionKey", "")) == "", "已到扣耐久阈值的磨损余数仍可操作", errors)

	var exhausted_charge_instance := (backpack[2].get("instance", {}) as Dictionary).duplicate(true)
	var exhausted_charge := exhausted_charge_instance.get("expPillCharge", {}) as Dictionary
	exhausted_charge["exp"] = int(exhausted_charge.get("nextExp", 1))
	exhausted_charge_instance["expPillCharge"] = exhausted_charge
	var exhausted_charge_row := row_for_instance(exhausted_charge_instance, CONTAINER_BACKPACK)
	_expect(not bool(exhausted_charge_row.get("valid", true)) and str(exhausted_charge_row.get("selectionKey", "")) == "", "已满但未升级的经验丹充能仍可操作", errors)

	var missing_item_profile := source.duplicate(true)
	(missing_item_profile.get("equipmentInstances", {}) as Dictionary)["equip_bad_item"] = _fixture_instance("equip_bad_item", "", CONTAINER_BACKPACK, 0, 0)
	var missing_item_rows := backpack_rows(missing_item_profile)
	_expect(missing_item_rows.size() == 5 and not bool(missing_item_rows[0].get("valid", true)) and str(missing_item_rows[0].get("selectionKey", "")) == "", "缺物品身份实例被静默隐藏或仍可操作", errors)

	var invalid_location_profile := source.duplicate(true)
	(invalid_location_profile.get("equipmentInstances", {}) as Dictionary)["equip_bad_location"] = _fixture_instance("equip_bad_location", "weapon_wooden_club", "escrow", 30, 0)
	var invalid_location_rows := backpack_rows(invalid_location_profile)
	_expect(invalid_location_rows.size() == 5 and not bool(invalid_location_rows[0].get("valid", true)) and str(invalid_location_rows[0].get("selectionKey", "")) == "", "非法位置实例被静默隐藏或仍可操作", errors)

	var string_count_profile := source.duplicate(true)
	((string_count_profile.get("backpackSlots", []) as Array)[0] as Dictionary)["count"] = "1"
	var string_count_rows := backpack_rows(string_count_profile)
	var string_count_has_selectable := false
	for string_count_row in string_count_rows:
		if str(string_count_row.get("selectionKey", "")) != "":
			string_count_has_selectable = true
	_expect(not string_count_rows.is_empty() and not string_count_has_selectable, "字符串背包装备数量被宽松转换为可操作实例", errors)

	var non_equipment_bad_count_profile := source.duplicate(true)
	(non_equipment_bad_count_profile.get("backpackSlots", []) as Array).append({"itemId": "item_meat_small", "count": "1"})
	var non_equipment_bad_count_rows := backpack_rows(non_equipment_bad_count_profile)
	var non_equipment_bad_count_selectable := false
	for bad_count_row in non_equipment_bad_count_rows:
		if str(bad_count_row.get("selectionKey", "")) != "":
			non_equipment_bad_count_selectable = true
	_expect(not non_equipment_bad_count_rows.is_empty() and not non_equipment_bad_count_selectable, "非装备坏数量未阻止实例选择", errors)

	var extra_slot_field_profile := source.duplicate(true)
	((extra_slot_field_profile.get("backpackSlots", []) as Array)[0] as Dictionary)["futureAsset"] = {"opaque": true}
	var extra_slot_field_rows := backpack_rows(extra_slot_field_profile)
	var extra_slot_field_selectable := false
	for extra_field_row in extra_slot_field_rows:
		if str(extra_field_row.get("selectionKey", "")) != "":
			extra_slot_field_selectable = true
	_expect(not extra_slot_field_rows.is_empty() and not extra_slot_field_selectable, "背包格额外字段未阻止实例选择", errors)

	var orphan_equipped_profile := source.duplicate(true)
	(orphan_equipped_profile.get("equipmentInstances", {}) as Dictionary)["equip_orphan"] = _fixture_instance("equip_orphan", "weapon_stone_axe", CONTAINER_EQUIPPED, 22, 0, {}, {"slotId": "right_hand_weapon"})
	var orphan_equipped_rows := equipped_rows(orphan_equipped_profile)
	_expect(orphan_equipped_rows.size() == 2 and not bool(orphan_equipped_rows[1].get("valid", true)) and str(orphan_equipped_rows[1].get("selectionKey", "")) == "", "无映射已装备实例被静默隐藏或仍可操作", errors)

	var missing_equipped_mapping_profile := source.duplicate(true)
	(missing_equipped_mapping_profile.get("equipmentSlotInstanceIds", {}) as Dictionary).erase("right_hand_weapon")
	var missing_equipped_mapping_rows := equipped_rows(missing_equipped_mapping_profile)
	var mapping_has_selectable := false
	for missing_mapping_row in missing_equipped_mapping_rows:
		if str(missing_mapping_row.get("selectionKey", "")) != "":
			mapping_has_selectable = true
	_expect(missing_equipped_mapping_rows.size() == 2 and not mapping_has_selectable, "有装备模板但缺实例映射时仍可操作或被静默隐藏", errors)

	var bad_backpack_container := source.duplicate(true)
	bad_backpack_container["equipmentInstances"] = []
	var bad_backpack_container_rows := backpack_rows(bad_backpack_container)
	_expect(bad_backpack_container_rows.size() == 1 and not bool(bad_backpack_container_rows[0].get("valid", true)), "背包装备实例坏容器被静默隐藏", errors)

	var bad_mapping_container := source.duplicate(true)
	bad_mapping_container["equipmentSlotInstanceIds"] = []
	var bad_mapping_rows := equipped_rows(bad_mapping_container)
	_expect(bad_mapping_rows.size() == 1 and not bool(bad_mapping_rows[0].get("valid", true)), "装备映射坏容器被静默隐藏", errors)

	if vectors is Array and not (vectors as Array).is_empty():
		var internal = ((vectors as Array)[0] as Dictionary).get("internalEnvelope", {})
		var private_row := row_for_envelope(internal as Dictionary if internal is Dictionary else {}, CONTAINER_BANK)
		_expect(not bool(private_row.get("valid", true)) and JSON.stringify(private_row).find("provenance") < 0, "私有持久化信封进入公开 presenter", errors)
	_expect(
		_deep_equal(backpack, backpack_rows(source))
			and _deep_equal(equipped, equipped_rows(source))
			and _deep_equal(bank, bank_envelope_rows(source)),
		"presenter 输出不确定",
		errors
	)
	return {"ok": errors.is_empty(), "errors": errors, "caseCount": 23}


static func schema3_fixture_for_check() -> Dictionary:
	return _fixture_profile().duplicate(true)


static func _fixture_profile() -> Dictionary:
	var public_envelope := _shared_expected_public_envelope()
	return {
		"schemaVersion": 3,
		"backpackSlots": [
			{"itemId": "weapon_wooden_club", "count": 1},
			{"itemId": "weapon_wooden_club", "count": 1},
			{"itemId": "item_exp_pill_lv1", "count": 2},
		],
		"equipmentSlots": {"right_hand_weapon": "weapon_stone_axe"},
		"equipmentSlotInstanceIds": {"right_hand_weapon": "equip_000005"},
		"equipmentInstances": {
			"equip_000001": _fixture_instance("equip_000001", "weapon_wooden_club", CONTAINER_BACKPACK, 30, 0, {}, {"futureAffixes": {"lucky": 7}}),
			"equip_000002": _fixture_instance("equip_000002", "weapon_wooden_club", CONTAINER_BACKPACK, 12, 4),
			"equip_000003": _fixture_instance("equip_000003", "item_exp_pill_lv1", CONTAINER_BACKPACK, 0, 0, {"level": 1, "exp": 45, "nextExp": BalanceCatalogModel.exp_to_next_level(1, 1)}),
			"equip_000004": _fixture_instance("equip_000004", "item_exp_pill_lv1", CONTAINER_BACKPACK, 0, 0, {"level": 1, "exp": 0, "nextExp": BalanceCatalogModel.exp_to_next_level(1, 1)}),
			"equip_000005": _fixture_instance("equip_000005", "weapon_stone_axe", CONTAINER_EQUIPPED, 22, 2, {}, {"slotId": "right_hand_weapon"}),
		},
		"bank": {
			"schemaVersion": 2,
			"futureBankField": {"kept": true},
			"slots": [{
				"itemId": "weapon_wooden_club",
				"count": 1,
				EQUIPMENT_ENVELOPES_KEY: [public_envelope],
			}],
		},
	}


static func _shared_vector_document() -> Dictionary:
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(PUBLIC_VECTOR_PATH))
	return parsed as Dictionary if parsed is Dictionary else {}


static func _shared_expected_public_envelope() -> Dictionary:
	var vectors = _shared_vector_document().get("vectors", [])
	if not (vectors is Array) or (vectors as Array).is_empty() or not ((vectors as Array)[0] is Dictionary):
		return {}
	var expected = ((vectors as Array)[0] as Dictionary).get("expectedPublic", {})
	return (expected as Dictionary).duplicate(true) if expected is Dictionary else {}


static func _fixture_instance(instance_id: String, item_id: String, location: String, durability: int, enhancement_level: int, charge: Dictionary = {}, extra: Dictionary = {}) -> Dictionary:
	var result := _fixture_instance_state(item_id, durability, enhancement_level, charge, extra)
	result["instanceId"] = instance_id
	result["location"] = location
	result["slotId"] = ""
	return result


static func _fixture_instance_state(item_id: String, durability: int, enhancement_level: int, charge: Dictionary = {}, extra: Dictionary = {}) -> Dictionary:
	var charge_state := charge.duplicate(true)
	if EquipmentModel.exp_pill_level_for(item_id) > 0 and not charge_state.is_empty():
		charge_state["itemId"] = item_id
	var result := {
		"schemaVersion": 1,
		"itemId": item_id,
		"durability": durability,
		"enhancement": {"itemId": item_id, "level": enhancement_level, "history": []} if EquipmentModel.enhance_max_for(item_id) > 0 else {},
		"wearCounters": {"itemId": item_id, "attackCount": 0, "hitCount": 0} if EquipmentModel.max_durability_for(item_id) > 0 else {},
		"expPillCharge": charge_state,
		"source": "presenter_check",
	}
	for key in extra.keys():
		result[key] = extra.get(key)
	return result


static func _instance_dictionary(value) -> Dictionary:
	var source := value as Dictionary if value is Dictionary else {}
	var result := {}
	for key in source.keys():
		var entry = source.get(key)
		if entry is Dictionary:
			result[str(key)] = (entry as Dictionary).duplicate(true)
	return result


static func _sorted_keys(value: Dictionary) -> Array[String]:
	var result: Array[String] = []
	for key in value.keys():
		result.append(str(key))
	result.sort()
	return result


static func _missing_row(container: String, item_id: String, slot_index: int, error: String) -> Dictionary:
	return {
		"valid": false,
		"error": error,
		"container": container,
		"instanceId": "",
		"envelopeId": "",
		"itemId": item_id,
		"itemLabel": EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id, "装备")),
		"stateSummary": "实例资料异常",
		"selectionLabel": "实例资料异常",
		"detailLines": [error],
		"instance": {},
		"instanceState": {},
		"selectionKey": "",
		"slotIndex": slot_index,
	}


static func _invalid_row(container: String, item_id: String, error: String) -> Dictionary:
	return _missing_row(container, item_id, -1, error)


static func _invalidate_row(row: Dictionary, error: String) -> void:
	row["valid"] = false
	row["error"] = error
	row["stateSummary"] = "实例资料异常"
	row["selectionLabel"] = "实例资料异常"
	row["detailLines"] = [error]
	row["selectionKey"] = ""


static func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)


static func _deep_equal(left, right) -> bool:
	return JSON.stringify(left) == JSON.stringify(right)
