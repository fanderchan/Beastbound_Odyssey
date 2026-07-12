extends RefCounted

const SERVER_PROFILE_SCHEMA_VERSION := 3
const BANK_SCHEMA_VERSION := 2
const CONTEXT_BACKPACK := "bank_backpack"
const CONTEXT_STORAGE := "bank_storage"
const TRANSFER_STACK := "stack"
const TRANSFER_EQUIPMENT_INSTANCE := "equipment_instance"
const TRANSFER_EQUIPMENT_ENVELOPE := "equipment_envelope"


static func server_bank_snapshot(profile: Dictionary) -> Dictionary:
	var profile_schema = profile.get("schemaVersion")
	if not _exact_integer_equals(profile_schema, SERVER_PROFILE_SCHEMA_VERSION):
		return {
			"ok": false,
			"status": "profile_schema_invalid",
			"bank": {},
		}
	var raw_bank = profile.get("bank")
	if not (raw_bank is Dictionary):
		return {
			"ok": false,
			"status": "bank_container_invalid",
			"bank": {},
		}
	var bank := raw_bank as Dictionary
	if not _exact_integer_equals(bank.get("schemaVersion"), BANK_SCHEMA_VERSION):
		return {
			"ok": false,
			"status": "bank_schema_invalid",
			"bank": bank.duplicate(true),
		}
	return {
		"ok": true,
		"status": "current",
		"bank": bank.duplicate(true),
	}


static func server_bank_data(profile: Dictionary) -> Dictionary:
	var raw_bank = profile.get("bank")
	return (raw_bank as Dictionary).duplicate(true) if raw_bank is Dictionary else {}


static func slots(bank: Dictionary, slot_limit: int) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var raw_slots = bank.get("slots", [])
	if raw_slots is Array:
		for raw_slot in raw_slots as Array:
			if result.size() >= maxi(0, slot_limit):
				break
			result.append((raw_slot as Dictionary).duplicate(true) if raw_slot is Dictionary else {})
	while result.size() < maxi(0, slot_limit):
		result.append({})
	return result


static func item_count(bank: Dictionary, item_id: String) -> int:
	var normalized_id := item_id.strip_edges()
	if normalized_id == "":
		return 0
	var count := 0
	var raw_slots = bank.get("slots", [])
	if raw_slots is Array:
		for raw_slot in raw_slots as Array:
			if not (raw_slot is Dictionary):
				continue
			var slot := raw_slot as Dictionary
			if str(slot.get("itemId", "")).strip_edges() != normalized_id:
				continue
			if _is_nonnegative_integer(slot.get("count")):
				count += int(slot.get("count", 0))
		return count
	var raw_items = bank.get("items", [])
	if raw_items is Array:
		for raw_item in raw_items as Array:
			if not (raw_item is Dictionary):
				continue
			var item := raw_item as Dictionary
			if str(item.get("itemId", "")).strip_edges() == normalized_id and _is_nonnegative_integer(item.get("count")):
				count += int(item.get("count", 0))
	return count


static func unlocked_tabs(bank: Dictionary, default_tabs: int, tab_count: int) -> int:
	var value = bank.get("unlockedTabs", bank.get("tabs", default_tabs))
	if not _is_integer_value(value):
		return clampi(default_tabs, 0, maxi(0, tab_count))
	return clampi(int(value), default_tabs, maxi(default_tabs, tab_count))


static func backpack_transfer_rows(raw_slots: Array[Dictionary], equipment_rows: Array[Dictionary]) -> Array[Dictionary]:
	var equipment_by_slot := {}
	var unplaced_equipment_rows: Array[Dictionary] = []
	var global_equipment_error := ""
	for raw_row in equipment_rows:
		var row := raw_row.duplicate(true)
		var slot_index := int(row.get("slotIndex", -1))
		if slot_index < 0 or slot_index >= raw_slots.size():
			if not bool(row.get("valid", false)) and str(row.get("itemId", "")).strip_edges() == "":
				global_equipment_error = str(row.get("error", "装备实例资料异常。"))
			unplaced_equipment_rows.append(_equipment_transfer_row(row, CONTEXT_BACKPACK, false))
			continue
		if not equipment_by_slot.has(slot_index):
			equipment_by_slot[slot_index] = [] as Array[Dictionary]
		(equipment_by_slot[slot_index] as Array[Dictionary]).append(row)

	var result: Array[Dictionary] = []
	for slot_index in range(raw_slots.size()):
		var slot := raw_slots[slot_index].duplicate(true)
		if equipment_by_slot.has(slot_index):
			for equipment_row in equipment_by_slot.get(slot_index, []) as Array[Dictionary]:
				var transfer_row := _equipment_transfer_row(equipment_row, CONTEXT_BACKPACK, false)
				if global_equipment_error != "":
					_invalidate_row(transfer_row, global_equipment_error)
				result.append(transfer_row)
			continue
		var item_id := str(slot.get("itemId", "")).strip_edges()
		var count := maxi(0, int(slot.get("count", 0)))
		var stack_row := _stack_row(CONTEXT_BACKPACK, item_id, count, slot_index, -1, false)
		if global_equipment_error != "" and item_id != "":
			_invalidate_row(stack_row, global_equipment_error)
		result.append(stack_row)
	result.append_array(unplaced_equipment_rows)
	return result


static func storage_transfer_rows(
	raw_slots: Array[Dictionary],
	envelope_rows: Array[Dictionary],
	start_index: int,
	visible_count: int,
	unlocked_slot_count: int
) -> Array[Dictionary]:
	var envelopes_by_slot := {}
	var global_bank_error := ""
	for raw_row in envelope_rows:
		var row := raw_row.duplicate(true)
		var bank_slot_index := int(row.get("bankSlotIndex", -1))
		if bank_slot_index < 0:
			if not bool(row.get("valid", false)):
				global_bank_error = str(row.get("error", "银行装备资料异常。"))
			continue
		if not envelopes_by_slot.has(bank_slot_index):
			envelopes_by_slot[bank_slot_index] = [] as Array[Dictionary]
		(envelopes_by_slot[bank_slot_index] as Array[Dictionary]).append(row)

	var result: Array[Dictionary] = []
	for offset in range(maxi(0, visible_count)):
		var bank_slot_index := start_index + offset
		var locked := bank_slot_index < 0 or bank_slot_index >= unlocked_slot_count
		if envelopes_by_slot.has(bank_slot_index):
			for envelope_row in envelopes_by_slot.get(bank_slot_index, []) as Array[Dictionary]:
				var transfer_row := _equipment_transfer_row(envelope_row, CONTEXT_STORAGE, locked)
				if global_bank_error != "":
					_invalidate_row(transfer_row, global_bank_error)
				result.append(transfer_row)
			continue
		var slot := raw_slots[bank_slot_index].duplicate(true) if bank_slot_index >= 0 and bank_slot_index < raw_slots.size() else {}
		var item_id := str(slot.get("itemId", "")).strip_edges()
		var count := maxi(0, int(slot.get("count", 0)))
		var stack_row := _stack_row(CONTEXT_STORAGE, item_id, count, -1, bank_slot_index, locked)
		if global_bank_error != "":
			_invalidate_row(stack_row, global_bank_error)
		result.append(stack_row)
	return result


static func selection_key(row: Dictionary) -> String:
	if not bool(row.get("valid", false)) or bool(row.get("locked", false)):
		return ""
	var explicit_key := str(row.get("selectionKey", "")).strip_edges()
	if explicit_key != "":
		return explicit_key
	var context := str(row.get("context", ""))
	if context == CONTEXT_STORAGE:
		return "%s:slot:%d" % [context, int(row.get("bankSlotIndex", -1))]
	if context == CONTEXT_BACKPACK:
		return "%s:slot:%d" % [context, int(row.get("slotIndex", -1))]
	return ""


static func transfer_item(mode: String, source_row: Dictionary, quantity: int, target_row: Dictionary = {}) -> Dictionary:
	var expected_context := CONTEXT_BACKPACK if mode == "deposit" else CONTEXT_STORAGE
	if not ["deposit", "withdraw"].has(mode):
		return _transfer_error("银行操作方向异常。")
	if str(source_row.get("context", "")) != expected_context:
		return _transfer_error("请选择对应一侧的物品。")
	if not bool(source_row.get("valid", true)) or bool(source_row.get("locked", false)):
		return _transfer_error(str(source_row.get("error", "该物品资料异常，暂不可操作。")))
	var item_id := str(source_row.get("itemId", "")).strip_edges()
	var held_count := maxi(0, int(source_row.get("count", 0)))
	if item_id == "" or held_count <= 0:
		return _transfer_error("请选择要操作的物品。")
	var transfer_kind := str(source_row.get("transferKind", TRANSFER_STACK))
	var item := {"itemId": item_id}
	match transfer_kind:
		TRANSFER_EQUIPMENT_INSTANCE:
			var instance_id := str(source_row.get("instanceId", "")).strip_edges()
			var source_slot_index := int(source_row.get("slotIndex", -1))
			if mode != "deposit" or instance_id == "" or source_slot_index < 0:
				return _transfer_error("背包装备实例资料异常。")
			item["count"] = 1
			item["instanceId"] = instance_id
			item["sourceSlotIndex"] = source_slot_index
		TRANSFER_EQUIPMENT_ENVELOPE:
			var envelope_id := str(source_row.get("envelopeId", "")).strip_edges()
			var bank_slot_index := int(source_row.get("bankSlotIndex", -1))
			if mode != "withdraw" or envelope_id == "" or bank_slot_index < 0:
				return _transfer_error("银行装备信封资料异常。")
			item["count"] = 1
			item["envelopeId"] = envelope_id
			item["bankSlotIndex"] = bank_slot_index
		TRANSFER_STACK:
			item["count"] = clampi(quantity, 1, held_count)
			if mode == "deposit":
				var source_slot_index := int(source_row.get("slotIndex", -1))
				if source_slot_index >= 0:
					item["sourceSlotIndex"] = source_slot_index
			else:
				var bank_slot_index := int(source_row.get("bankSlotIndex", -1))
				if bank_slot_index >= 0:
					item["bankSlotIndex"] = bank_slot_index
		_:
			return _transfer_error("物品操作资料异常。")

	if mode == "deposit":
		var target_bank_slot := int(target_row.get("bankSlotIndex", -1))
		if target_bank_slot >= 0:
			item["bankSlotIndex"] = target_bank_slot
	else:
		var target_slot := int(target_row.get("slotIndex", -1))
		if target_slot >= 0:
			item["targetSlotIndex"] = target_slot
	return {"ok": true, "item": item}


static func self_check() -> Dictionary:
	var errors: Array[String] = []
	var profile := {
		"schemaVersion": 3,
		"bank": {
			"schemaVersion": 2,
			"stoneCoins": 12,
			"unlockedTabs": 1,
			"slots": [{"itemId": "weapon_wooden_club", "count": 1, "equipmentEnvelopes": [{"future": true}]}],
			"futureBankField": {"keep": [1, 2, 3]},
		},
	}
	var before := profile.duplicate(true)
	var snapshot := server_bank_snapshot(profile)
	_expect(bool(snapshot.get("ok", false)), "schema3/bank2 未被识别", errors)
	_expect(JSON.stringify(profile) == JSON.stringify(before), "读取银行时修改了服务器档案", errors)
	_expect(JSON.stringify(snapshot.get("bank", {})) == JSON.stringify(profile.get("bank", {})), "银行未知字段未无损保留", errors)

	var backpack_rows := backpack_transfer_rows(
		[{"itemId": "weapon_wooden_club", "count": 2}, {"itemId": "item_meat_small", "count": 5}],
		[
			{"valid": true, "itemId": "weapon_wooden_club", "instanceId": "equip_a", "slotIndex": 0, "selectionKey": "instance:equip_a"},
			{"valid": true, "itemId": "weapon_wooden_club", "instanceId": "equip_b", "slotIndex": 0, "selectionKey": "instance:equip_b"},
		]
	)
	_expect(backpack_rows.size() == 3, "同名背包装备未展开为实例行", errors)
	_expect(selection_key(backpack_rows[0]) == "instance:equip_a" and selection_key(backpack_rows[1]) == "instance:equip_b", "背包装备选择键不稳定", errors)
	var deposit := transfer_item("deposit", backpack_rows[1], 99, {"bankSlotIndex": 7})
	_expect(bool(deposit.get("ok", false)), "装备存入请求构建失败", errors)
	_expect(deposit.get("item", {}) == {"itemId": "weapon_wooden_club", "count": 1, "instanceId": "equip_b", "sourceSlotIndex": 0, "bankSlotIndex": 7}, "装备存入请求字段错误", errors)

	var storage_rows := storage_transfer_rows(
		[{"itemId": "weapon_wooden_club", "count": 1, "equipmentEnvelopes": [{}]}],
		[{"valid": true, "itemId": "weapon_wooden_club", "envelopeId": "eqx_bank_a_0001", "bankSlotIndex": 0, "selectionKey": "envelope:eqx_bank_a_0001"}],
		0,
		1,
		15
	)
	_expect(storage_rows.size() == 1 and selection_key(storage_rows[0]) == "envelope:eqx_bank_a_0001", "银行信封选择键不稳定", errors)
	var withdraw := transfer_item("withdraw", storage_rows[0], 42, {"slotIndex": 4})
	_expect(bool(withdraw.get("ok", false)), "装备取出请求构建失败", errors)
	_expect(withdraw.get("item", {}) == {"itemId": "weapon_wooden_club", "count": 1, "envelopeId": "eqx_bank_a_0001", "bankSlotIndex": 0, "targetSlotIndex": 4}, "装备取出请求字段错误", errors)

	var invalid_row := backpack_rows[0].duplicate(true)
	invalid_row["valid"] = false
	invalid_row["error"] = "实例损坏。"
	_expect(not bool(transfer_item("deposit", invalid_row, 1).get("ok", true)), "无效实例仍可操作", errors)
	var stack_transfer := transfer_item("deposit", backpack_rows[2], 3)
	_expect(stack_transfer.get("item", {}) == {"itemId": "item_meat_small", "count": 3, "sourceSlotIndex": 1}, "普通堆叠物请求不兼容", errors)
	return {"ok": errors.is_empty(), "errors": errors, "caseCount": 9}


static func _equipment_transfer_row(row_value: Dictionary, context: String, locked: bool) -> Dictionary:
	var row := row_value.duplicate(true)
	row["context"] = context
	row["count"] = 1
	row["locked"] = locked
	row["transferKind"] = TRANSFER_EQUIPMENT_INSTANCE if context == CONTEXT_BACKPACK else TRANSFER_EQUIPMENT_ENVELOPE
	if locked:
		row["selectionKey"] = ""
	return row


static func _stack_row(context: String, item_id: String, count: int, slot_index: int, bank_slot_index: int, locked: bool) -> Dictionary:
	var has_item := item_id != "" and count > 0
	var row := {
		"context": context,
		"itemId": item_id,
		"count": count,
		"valid": true,
		"error": "",
		"locked": locked,
		"transferKind": TRANSFER_STACK,
		"selectionKey": "",
	}
	if slot_index >= 0:
		row["slotIndex"] = slot_index
	if bank_slot_index >= 0:
		row["bankSlotIndex"] = bank_slot_index
	if has_item and not locked:
		row["selectionKey"] = "%s:slot:%d" % [context, bank_slot_index if context == CONTEXT_STORAGE else slot_index]
	return row


static func _transfer_error(message: String) -> Dictionary:
	return {"ok": false, "error": message if message.strip_edges() != "" else "银行物品资料异常。", "item": {}}


static func _invalidate_row(row: Dictionary, error: String) -> void:
	row["valid"] = false
	row["error"] = error if error.strip_edges() != "" else "银行物品资料异常。"
	row["selectionKey"] = ""


static func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)


static func _exact_integer_equals(value, expected: int) -> bool:
	return _is_integer_value(value) and int(value) == expected


static func _is_nonnegative_integer(value) -> bool:
	return _is_integer_value(value) and int(value) >= 0


static func _is_integer_value(value) -> bool:
	if value is int:
		return true
	if value is float:
		var number := float(value)
		return is_finite(number) and number == floor(number)
	return false
