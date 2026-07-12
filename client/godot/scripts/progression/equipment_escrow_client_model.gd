extends RefCounted

const BackpackModel := preload("res://scripts/progression/backpack_model.gd")
const EquipmentModel := preload("res://scripts/progression/equipment_model.gd")
const EquipmentInstancePresenter := preload("res://scripts/ui/equipment_instance_presenter.gd")

const CONTEXT_MARKET_SELL := "market_sell"
const CONTEXT_MARKET_LISTING := "market_listing"
const CONTEXT_MAIL_ATTACHMENT := "mail_attachment"
const CONTEXT_MAIL_MESSAGE := "mail_message"
const ROW_STACK := "stack"
const ROW_EQUIPMENT_INSTANCE := "equipment_instance"
const ROW_EQUIPMENT_ENVELOPE := "equipment_envelope"
const LISTING_ENVELOPE_KEY := "equipmentEnvelope"
const MAIL_ENVELOPES_KEY := "equipmentEnvelopes"


static func market_sell_rows(profile: Dictionary) -> Array[Dictionary]:
	var source_rows := _backpack_source_rows(profile, CONTEXT_MARKET_SELL)
	var result: Array[Dictionary] = []
	var stack_row_index_by_item_id := {}
	for source_row in source_rows:
		if bool(source_row.get("valid", false)) and str(source_row.get("rowKind", "")) == ROW_STACK:
			var item_id := str(source_row.get("itemId", "")).strip_edges()
			if stack_row_index_by_item_id.has(item_id):
				var row_index := int(stack_row_index_by_item_id.get(item_id, -1))
				var merged_count := int(result[row_index].get("count", 0)) + int(source_row.get("count", 0))
				result[row_index]["count"] = merged_count
				result[row_index]["stateSummary"] = "普通物品 x%d" % merged_count
				result[row_index]["selectionLabel"] = "%s x%d" % [str(result[row_index].get("itemLabel", "物品")), merged_count]
				result[row_index]["detailLines"] = ["数量：%d" % merged_count]
				continue
			var merged_row := source_row.duplicate(true)
			merged_row["sourceSlotIndex"] = -1
			merged_row["selectionKey"] = "%s:stack:%s" % [CONTEXT_MARKET_SELL, item_id]
			stack_row_index_by_item_id[item_id] = result.size()
			result.append(merged_row)
			continue
		result.append(source_row.duplicate(true))
	return result


static func mail_attachment_rows(profile: Dictionary) -> Array[Dictionary]:
	return _backpack_source_rows(profile, CONTEXT_MAIL_ATTACHMENT)


static func market_listing_rows(listings_value) -> Array[Dictionary]:
	if not (listings_value is Array):
		return [_invalid_row(CONTEXT_MARKET_LISTING, "交易所挂单容器异常。")]
	var rows: Array[Dictionary] = []
	var row_indices_by_listing_id := {}
	var row_indices_by_envelope_id := {}
	for listing_index in range((listings_value as Array).size()):
		var raw_listing = (listings_value as Array)[listing_index]
		if not (raw_listing is Dictionary):
			var invalid_listing := _invalid_row(CONTEXT_MARKET_LISTING, "交易所挂单资料不是对象。")
			invalid_listing["listingIndex"] = listing_index
			rows.append(invalid_listing)
			continue
		var listing := raw_listing as Dictionary
		var row := _market_listing_row(listing)
		row["listingIndex"] = listing_index
		rows.append(row)
		_track_row_index(row_indices_by_listing_id, str(row.get("listingId", "")), rows.size() - 1)
		_track_row_index(row_indices_by_envelope_id, str(row.get("envelopeId", "")), rows.size() - 1)
	_mark_duplicates(rows, row_indices_by_listing_id, "交易所存在重复的挂单身份。")
	_mark_duplicates(rows, row_indices_by_envelope_id, "交易所存在重复的装备信封身份。")
	return rows


static func mail_equipment_rows(mail: Dictionary) -> Array[Dictionary]:
	var mail_id := str(mail.get("mailId", "")).strip_edges()
	var summary_result := _mail_equipment_summary(mail)
	var summary_counts := summary_result.get("counts", {}) as Dictionary
	if not mail.has(MAIL_ENVELOPES_KEY):
		if bool(summary_result.get("ok", false)) and summary_counts.is_empty():
			return []
		var legacy_error := str(summary_result.get("error", "")).strip_edges()
		if legacy_error == "":
			legacy_error = "历史装备附件缺少实例信封，暂不可领取。"
		var legacy_row := _invalid_row(CONTEXT_MAIL_MESSAGE, legacy_error)
		legacy_row["mailId"] = mail_id
		return [legacy_row]
	var raw_envelopes = mail.get(MAIL_ENVELOPES_KEY)
	if not (raw_envelopes is Array):
		var invalid_container := _invalid_row(CONTEXT_MAIL_MESSAGE, "邮件装备附件容器异常。")
		invalid_container["mailId"] = mail_id
		return [invalid_container]
	var rows: Array[Dictionary] = []
	var row_indices_by_envelope_id := {}
	for envelope_index in range((raw_envelopes as Array).size()):
		var raw_envelope = (raw_envelopes as Array)[envelope_index]
		if not (raw_envelope is Dictionary):
			var invalid_envelope := _invalid_row(CONTEXT_MAIL_MESSAGE, "邮件装备附件资料不是对象。")
			invalid_envelope["mailId"] = mail_id
			invalid_envelope["envelopeIndex"] = envelope_index
			rows.append(invalid_envelope)
			continue
		var presented := EquipmentInstancePresenter.row_for_envelope(raw_envelope as Dictionary, CONTEXT_MAIL_MESSAGE)
		var row := _public_equipment_row(presented, CONTEXT_MAIL_MESSAGE)
		row["mailId"] = mail_id
		row["envelopeIndex"] = envelope_index
		if mail_id == "":
			_invalidate_row(row, "邮件身份缺失，装备附件暂不可操作。")
		elif bool(row.get("valid", false)):
			row["selectionKey"] = "mail:%s" % mail_id
		rows.append(row)
		_track_row_index(row_indices_by_envelope_id, str(row.get("envelopeId", "")), rows.size() - 1)
	_mark_duplicates(rows, row_indices_by_envelope_id, "邮件内存在重复的装备信封身份。")
	if not bool(summary_result.get("ok", false)):
		if rows.is_empty():
			var summary_error := _invalid_row(CONTEXT_MAIL_MESSAGE, str(summary_result.get("error", "邮件装备附件摘要异常。")))
			summary_error["mailId"] = mail_id
			rows.append(summary_error)
		else:
			for row in rows:
				_invalidate_row(row, str(summary_result.get("error", "邮件装备附件摘要异常。")))
		return rows
	var envelope_counts := {}
	for row in rows:
		var item_id := str(row.get("itemId", "")).strip_edges()
		if item_id != "":
			envelope_counts[item_id] = int(envelope_counts.get(item_id, 0)) + 1
	var mismatch_item_ids: Array[String] = []
	for item_id_value in summary_counts.keys():
		var item_id := str(item_id_value)
		if int(summary_counts.get(item_id, 0)) != int(envelope_counts.get(item_id, 0)):
			mismatch_item_ids.append(item_id)
	for item_id_value in envelope_counts.keys():
		var item_id := str(item_id_value)
		if not summary_counts.has(item_id) and not mismatch_item_ids.has(item_id):
			mismatch_item_ids.append(item_id)
	if not mismatch_item_ids.is_empty():
		var mismatch_error := "邮件装备附件摘要与实例信封数量不一致，暂不可领取。"
		for row in rows:
			if bool(row.get("valid", false)) and mismatch_item_ids.has(str(row.get("itemId", ""))):
				_invalidate_row(row, mismatch_error)
		for item_id in mismatch_item_ids:
			if int(envelope_counts.get(item_id, 0)) > 0:
				continue
			var missing_envelope := _invalid_row(CONTEXT_MAIL_MESSAGE, "历史装备附件缺少实例信封，暂不可领取。")
			missing_envelope["mailId"] = mail_id
			missing_envelope["itemId"] = item_id
			missing_envelope["itemLabel"] = EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id, "装备"))
			rows.append(missing_envelope)
	return rows


static func market_equipment_listing_intent(row: Dictionary) -> Dictionary:
	return _equipment_source_intent(row, CONTEXT_MARKET_SELL, "该装备暂不能上架。")


static func mail_equipment_attachment_intent(row: Dictionary) -> Dictionary:
	return _equipment_source_intent(row, CONTEXT_MAIL_ATTACHMENT, "该装备暂不能作为邮件附件。")


static func self_check() -> Dictionary:
	var errors: Array[String] = []
	var profile := EquipmentInstancePresenter.schema3_fixture_for_check()
	(profile.get("backpackSlots", []) as Array).append({"itemId": "item_meat_small", "count": 5})
	(profile.get("backpackSlots", []) as Array).append({"itemId": "item_meat_small", "count": 3})
	var profile_before := profile.duplicate(true)
	var market_sources := market_sell_rows(profile)
	_expect(JSON.stringify(profile) == JSON.stringify(profile_before), "构建出售选项改写了档案", errors)
	_expect(market_sources.size() == 5, "普通堆叠与具体装备实例没有正确拆行", errors)
	var equipment_b := _row_by_instance_id(market_sources, "equip_000002")
	var meat := _row_by_item_and_kind(market_sources, "item_meat_small", ROW_STACK)
	_expect(not equipment_b.is_empty() and str(equipment_b.get("stateSummary", "")).find("+4") >= 0, "同名装备状态没有进入出售选项", errors)
	_expect(int(equipment_b.get("count", 0)) == 1 and int(meat.get("count", 0)) == 8, "装备固定一件或普通堆叠聚合数量错误", errors)

	var hostile_row := equipment_b.duplicate(true)
	hostile_row["count"] = 99
	hostile_row["envelope"] = {"provenance": {"sourceInstanceId": "forged"}}
	hostile_row["instanceState"] = {"enhancement": {"level": 99}}
	hostile_row["provenance"] = {"sourceInstanceId": "forged"}
	var market_intent := market_equipment_listing_intent(hostile_row)
	var expected_intent := {
		"itemId": "weapon_wooden_club",
		"count": 1,
		"instanceId": "equip_000002",
		"sourceSlotIndex": 1,
	}
	_expect(bool(market_intent.get("ok", false)) and market_intent.get("intent", {}) == expected_intent, "上架意图没有严格白名单投影", errors)
	var mail_source := _row_by_instance_id(mail_attachment_rows(profile), "equip_000002")
	mail_source["stateFingerprint"] = "forged"
	var mail_intent := mail_equipment_attachment_intent(mail_source)
	_expect(bool(mail_intent.get("ok", false)) and mail_intent.get("intent", {}) == expected_intent, "邮件装备意图没有严格白名单投影", errors)
	var invalid_source := equipment_b.duplicate(true)
	invalid_source["valid"] = false
	_expect(not bool(market_equipment_listing_intent(invalid_source).get("ok", true)), "坏装备行仍能生成上架意图", errors)

	var envelope := _fixture_public_envelope(profile)
	var listing := {
		"listingId": "market_equipment_check_1",
		"itemId": "weapon_wooden_club",
		"count": 1,
		LISTING_ENVELOPE_KEY: envelope,
	}
	var listing_rows := market_listing_rows([listing])
	_expect(
		listing_rows.size() == 1
			and bool(listing_rows[0].get("valid", false))
			and str(listing_rows[0].get("stateSummary", "")).find("+3") >= 0
			and str(listing_rows[0].get("stateSummary", "")).find("耐久18/") >= 0,
		"公开挂单没有生成安全装备状态行",
		errors
	)
	var serialized_listing_rows := JSON.stringify(listing_rows)
	_expect(
		serialized_listing_rows.find("instanceState") < 0
			and serialized_listing_rows.find("stateFingerprint") < 0
			and serialized_listing_rows.find("provenance") < 0,
		"公开挂单展示行泄露了信封内部字段",
		errors
	)
	var duplicate_listing_a := listing.duplicate(true)
	var duplicate_listing_b := listing.duplicate(true)
	duplicate_listing_b["listingId"] = "market_equipment_check_2"
	var duplicate_listing_rows := market_listing_rows([duplicate_listing_a, duplicate_listing_b])
	_expect(_all_rows_invalid(duplicate_listing_rows), "重复挂单装备信封没有整体失败关闭", errors)
	var malformed_listing := listing.duplicate(true)
	malformed_listing[LISTING_ENVELOPE_KEY] = 42
	_expect(_all_rows_invalid(market_listing_rows([malformed_listing])), "坏挂单装备信封仍可操作", errors)
	_expect(
		_all_rows_invalid(market_listing_rows([{"listingId": "legacy_equipment", "itemId": "weapon_wooden_club", "count": 1}])),
		"历史 template-only 装备挂单仍可操作",
		errors
	)
	var ordinary_listing_rows := market_listing_rows([{"listingId": "market_meat", "itemId": "item_meat_small", "count": 3}])
	_expect(ordinary_listing_rows.size() == 1 and bool(ordinary_listing_rows[0].get("valid", false)), "普通物品挂单兼容性丢失", errors)

	var mail_rows := mail_equipment_rows({"mailId": "mail_equipment_check", "items": [{"itemId": "weapon_wooden_club", "count": 1}], MAIL_ENVELOPES_KEY: [envelope]})
	_expect(mail_rows.size() == 1 and bool(mail_rows[0].get("valid", false)) and str(mail_rows[0].get("stateSummary", "")).find("词缀1") >= 0, "邮件装备附件状态展示错误", errors)
	var duplicate_mail_rows := mail_equipment_rows({"mailId": "mail_equipment_duplicate", "items": [{"itemId": "weapon_wooden_club", "count": 2}], MAIL_ENVELOPES_KEY: [envelope, envelope.duplicate(true)]})
	_expect(_all_rows_invalid(duplicate_mail_rows), "邮件重复装备信封没有整体失败关闭", errors)
	var malformed_mail_rows := mail_equipment_rows({"mailId": "mail_equipment_bad", "items": [{"itemId": "weapon_wooden_club", "count": 1}], MAIL_ENVELOPES_KEY: [42]})
	_expect(_all_rows_invalid(malformed_mail_rows), "邮件坏装备信封被静默隐藏或仍可操作", errors)
	var legacy_mail_rows := mail_equipment_rows({"mailId": "mail_equipment_legacy", "items": [{"itemId": "weapon_wooden_club", "count": 1}]})
	_expect(_all_rows_invalid(legacy_mail_rows) and str(legacy_mail_rows[0].get("error", "")).find("缺少实例信封") >= 0, "历史 template-only 装备邮件仍可领取", errors)
	var drifted_mail_rows := mail_equipment_rows({"mailId": "mail_equipment_drift", "items": [{"itemId": "weapon_wooden_club", "count": 2}], MAIL_ENVELOPES_KEY: [envelope]})
	_expect(_all_rows_invalid(drifted_mail_rows) and str(drifted_mail_rows[0].get("error", "")).find("数量不一致") >= 0, "邮件装备摘要漂移仍可领取", errors)
	return {"ok": errors.is_empty(), "errors": errors, "caseCount": 16}


static func _backpack_source_rows(profile: Dictionary, context: String) -> Array[Dictionary]:
	var raw_slots = profile.get("backpackSlots")
	if not (raw_slots is Array):
		return [_invalid_row(context, "背包格子容器异常。")]
	var equipment_by_slot := {}
	var unplaced_equipment: Array[Dictionary] = []
	for presenter_row in EquipmentInstancePresenter.backpack_rows(profile):
		var row := presenter_row.duplicate(true)
		var slot_index := int(row.get("slotIndex", -1))
		if slot_index < 0 or slot_index >= (raw_slots as Array).size():
			unplaced_equipment.append(_equipment_source_row(row, context))
			continue
		if not equipment_by_slot.has(slot_index):
			equipment_by_slot[slot_index] = [] as Array[Dictionary]
		(equipment_by_slot[slot_index] as Array[Dictionary]).append(row)

	var rows: Array[Dictionary] = []
	for slot_index in range((raw_slots as Array).size()):
		var raw_slot = (raw_slots as Array)[slot_index]
		if not (raw_slot is Dictionary):
			var invalid_slot := _invalid_row(context, "背包格子资料不是对象。")
			invalid_slot["sourceSlotIndex"] = slot_index
			rows.append(invalid_slot)
			continue
		var slot := raw_slot as Dictionary
		var item_id := str(slot.get("itemId", "")).strip_edges()
		if item_id == "" and slot.is_empty():
			continue
		if item_id == "" or not _is_positive_integer(slot.get("count")):
			var invalid_slot := _invalid_row(context, "背包物品格资料异常。")
			invalid_slot["itemId"] = item_id
			invalid_slot["sourceSlotIndex"] = slot_index
			rows.append(invalid_slot)
			continue
		if BackpackModel.item_for_id(item_id).is_empty() and not EquipmentModel.is_equipment(item_id):
			var unknown_item := _invalid_row(context, "背包物品身份异常。")
			unknown_item["itemId"] = item_id
			unknown_item["sourceSlotIndex"] = slot_index
			rows.append(unknown_item)
			continue
		if BackpackModel.item_is_bound(item_id):
			continue
		if EquipmentModel.is_equipment(item_id):
			var candidates := equipment_by_slot.get(slot_index, []) as Array[Dictionary]
			if candidates.is_empty():
				var missing_instance := _invalid_row(context, "背包装备缺少具体实例资料。")
				missing_instance["itemId"] = item_id
				missing_instance["sourceSlotIndex"] = slot_index
				rows.append(missing_instance)
				continue
			for candidate in candidates:
				var source_row := _equipment_source_row(candidate, context)
				if str(source_row.get("itemId", "")) != item_id:
					_invalidate_row(source_row, "装备实例与背包物品格不一致。")
				rows.append(source_row)
			continue
		rows.append(_stack_source_row(context, item_id, int(slot.get("count", 0)), slot_index))
	rows.append_array(unplaced_equipment)
	return rows


static func _market_listing_row(listing: Dictionary) -> Dictionary:
	var listing_id := str(listing.get("listingId", "")).strip_edges()
	var listing_item_id := str(listing.get("itemId", "")).strip_edges()
	var count_valid := _is_positive_integer(listing.get("count"))
	var count := int(listing.get("count", 0)) if count_valid else 0
	if listing.has(LISTING_ENVELOPE_KEY):
		var raw_envelope = listing.get(LISTING_ENVELOPE_KEY)
		if not (raw_envelope is Dictionary):
			var invalid_envelope := _invalid_row(CONTEXT_MARKET_LISTING, "交易所装备信封资料不是对象。")
			invalid_envelope["listingId"] = listing_id
			invalid_envelope["itemId"] = listing_item_id
			return invalid_envelope
		var presented := EquipmentInstancePresenter.row_for_envelope(raw_envelope as Dictionary, CONTEXT_MARKET_LISTING)
		var row := _public_equipment_row(presented, CONTEXT_MARKET_LISTING)
		row["listingId"] = listing_id
		row["count"] = count
		if listing_id == "":
			_invalidate_row(row, "交易所挂单身份缺失。")
		elif not count_valid or count != 1:
			_invalidate_row(row, "装备挂单数量必须为一件。")
		elif listing_item_id == "" or listing_item_id != str(row.get("itemId", "")):
			_invalidate_row(row, "装备挂单与信封物品身份不一致。")
		elif bool(row.get("valid", false)):
			row["selectionKey"] = "listing:%s" % listing_id
		return row
	var label := BackpackModel.label_for(listing_item_id, "物品")
	var row := {
		"valid": listing_id != "" and count_valid and not BackpackModel.item_for_id(listing_item_id).is_empty(),
		"error": "",
		"context": CONTEXT_MARKET_LISTING,
		"rowKind": ROW_STACK,
		"listingId": listing_id,
		"envelopeId": "",
		"itemId": listing_item_id,
		"count": count,
		"itemLabel": label,
		"stateSummary": "普通物品 x%d" % count,
		"selectionLabel": "%s x%d" % [label, count],
		"detailLines": ["%s x%d" % [label, count]],
		"selectionKey": "listing:%s" % listing_id,
	}
	if EquipmentModel.is_equipment(listing_item_id):
		_invalidate_row(row, "历史装备挂单缺少实例信封，暂不可操作。")
	elif not bool(row.get("valid", false)):
		_invalidate_row(row, "交易所普通物品挂单资料异常。")
	return row


static func _equipment_source_row(presenter_row: Dictionary, context: String) -> Dictionary:
	var valid := bool(presenter_row.get("valid", false))
	var error := str(presenter_row.get("error", "")).strip_edges()
	var item_id := str(presenter_row.get("itemId", "")).strip_edges()
	var instance_id := str(presenter_row.get("instanceId", "")).strip_edges()
	var source_slot_index := int(presenter_row.get("slotIndex", -1))
	if item_id == "" or instance_id == "" or source_slot_index < 0:
		valid = false
		if error == "":
			error = "装备实例选择资料异常。"
	if valid and BackpackModel.item_is_bound(item_id):
		valid = false
		error = "绑定装备不能转移。"
	return {
		"valid": valid,
		"error": error,
		"context": context,
		"rowKind": ROW_EQUIPMENT_INSTANCE,
		"itemId": item_id,
		"count": 1,
		"instanceId": instance_id,
		"sourceSlotIndex": source_slot_index,
		"itemLabel": str(presenter_row.get("itemLabel", "装备")),
		"stateSummary": str(presenter_row.get("stateSummary", "实例资料异常")),
		"selectionLabel": str(presenter_row.get("selectionLabel", "实例资料异常")),
		"detailLines": _string_lines(presenter_row.get("detailLines", [])),
		"selectionKey": "%s:instance:%s" % [context, instance_id] if valid else "",
	}


static func _stack_source_row(context: String, item_id: String, count: int, source_slot_index: int) -> Dictionary:
	var label := BackpackModel.menu_label_for(item_id, BackpackModel.label_for(item_id, "物品"))
	return {
		"valid": true,
		"error": "",
		"context": context,
		"rowKind": ROW_STACK,
		"itemId": item_id,
		"count": count,
		"instanceId": "",
		"sourceSlotIndex": source_slot_index,
		"itemLabel": label,
		"stateSummary": "普通物品 x%d" % count,
		"selectionLabel": "%s x%d" % [label, count],
		"detailLines": ["数量：%d" % count],
		"selectionKey": "%s:slot:%d" % [context, source_slot_index],
	}


static func _public_equipment_row(presenter_row: Dictionary, context: String) -> Dictionary:
	var valid := bool(presenter_row.get("valid", false))
	var error := str(presenter_row.get("error", "")).strip_edges()
	return {
		"valid": valid,
		"error": error,
		"context": context,
		"rowKind": ROW_EQUIPMENT_ENVELOPE,
		"envelopeId": str(presenter_row.get("envelopeId", "")).strip_edges(),
		"itemId": str(presenter_row.get("itemId", "")).strip_edges(),
		"count": 1,
		"itemLabel": str(presenter_row.get("itemLabel", "装备")),
		"stateSummary": str(presenter_row.get("stateSummary", "实例资料异常")),
		"selectionLabel": str(presenter_row.get("selectionLabel", "实例资料异常")),
		"detailLines": _string_lines(presenter_row.get("detailLines", [])),
		"selectionKey": "",
	}


static func _equipment_source_intent(row: Dictionary, expected_context: String, fallback_error: String) -> Dictionary:
	if not bool(row.get("valid", false)) or str(row.get("context", "")) != expected_context or str(row.get("rowKind", "")) != ROW_EQUIPMENT_INSTANCE:
		return _intent_error(str(row.get("error", fallback_error)))
	var item_id := str(row.get("itemId", "")).strip_edges()
	var instance_id := str(row.get("instanceId", "")).strip_edges()
	if item_id == "" or instance_id == "" or not EquipmentModel.is_equipment(item_id) or BackpackModel.item_is_bound(item_id):
		return _intent_error(fallback_error)
	if not _is_nonnegative_integer(row.get("sourceSlotIndex")):
		return _intent_error(fallback_error)
	return {
		"ok": true,
		"error": "",
		"intent": {
			"itemId": item_id,
			"count": 1,
			"instanceId": instance_id,
			"sourceSlotIndex": int(row.get("sourceSlotIndex", -1)),
		},
	}


static func _mail_equipment_summary(mail: Dictionary) -> Dictionary:
	var raw_items = mail.get("items", [])
	if not (raw_items is Array):
		return {"ok": false, "error": "邮件附件摘要容器异常，暂不可领取。", "counts": {}}
	var counts := {}
	for raw_item in raw_items as Array:
		if not (raw_item is Dictionary):
			return {"ok": false, "error": "邮件附件摘要资料异常，暂不可领取。", "counts": counts}
		var item := raw_item as Dictionary
		var item_id := str(item.get("itemId", "")).strip_edges()
		if not EquipmentModel.is_equipment(item_id):
			continue
		if not _is_positive_integer(item.get("count")):
			return {"ok": false, "error": "邮件装备附件数量异常，暂不可领取。", "counts": counts}
		counts[item_id] = int(counts.get(item_id, 0)) + int(item.get("count", 0))
	return {"ok": true, "error": "", "counts": counts}


static func _fixture_public_envelope(profile: Dictionary) -> Dictionary:
	var bank = profile.get("bank", {})
	if not (bank is Dictionary):
		return {}
	var slots = (bank as Dictionary).get("slots", [])
	if not (slots is Array) or (slots as Array).is_empty() or not ((slots as Array)[0] is Dictionary):
		return {}
	var envelopes = ((slots as Array)[0] as Dictionary).get(MAIL_ENVELOPES_KEY, [])
	if not (envelopes is Array) or (envelopes as Array).is_empty() or not ((envelopes as Array)[0] is Dictionary):
		return {}
	return ((envelopes as Array)[0] as Dictionary).duplicate(true)


static func _row_by_instance_id(rows: Array[Dictionary], instance_id: String) -> Dictionary:
	for row in rows:
		if str(row.get("instanceId", "")) == instance_id:
			return row.duplicate(true)
	return {}


static func _row_by_item_and_kind(rows: Array[Dictionary], item_id: String, row_kind: String) -> Dictionary:
	for row in rows:
		if str(row.get("itemId", "")) == item_id and str(row.get("rowKind", "")) == row_kind:
			return row.duplicate(true)
	return {}


static func _track_row_index(indices_by_id: Dictionary, id_value: String, row_index: int) -> void:
	var normalized_id := id_value.strip_edges()
	if normalized_id == "":
		return
	var indices := indices_by_id.get(normalized_id, []) as Array
	indices.append(row_index)
	indices_by_id[normalized_id] = indices


static func _mark_duplicates(rows: Array[Dictionary], indices_by_id: Dictionary, error: String) -> void:
	for id_value in indices_by_id.keys():
		var indices := indices_by_id.get(id_value, []) as Array
		if indices.size() < 2:
			continue
		for row_index_value in indices:
			var row_index := int(row_index_value)
			if row_index >= 0 and row_index < rows.size():
				_invalidate_row(rows[row_index], error)


static func _all_rows_invalid(rows: Array[Dictionary]) -> bool:
	if rows.is_empty():
		return false
	for row in rows:
		if bool(row.get("valid", true)) or str(row.get("selectionKey", "")) != "":
			return false
	return true


static func _invalid_row(context: String, error: String) -> Dictionary:
	var message := error if error.strip_edges() != "" else "装备托管资料异常。"
	return {
		"valid": false,
		"error": message,
		"context": context,
		"rowKind": "invalid",
		"listingId": "",
		"mailId": "",
		"envelopeId": "",
		"itemId": "",
		"count": 0,
		"instanceId": "",
		"sourceSlotIndex": -1,
		"itemLabel": "资料异常",
		"stateSummary": "资料异常",
		"selectionLabel": "资料异常",
		"detailLines": [message],
		"selectionKey": "",
	}


static func _invalidate_row(row: Dictionary, error: String) -> void:
	var message := error if error.strip_edges() != "" else "装备托管资料异常。"
	row["valid"] = false
	row["error"] = message
	row["detailLines"] = [message]
	row["selectionKey"] = ""


static func _intent_error(error: String) -> Dictionary:
	return {"ok": false, "error": error if error.strip_edges() != "" else "装备选择资料异常。", "intent": {}}


static func _string_lines(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for entry in value as Array:
			result.append(str(entry))
	return result


static func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)


static func _is_nonnegative_integer(value) -> bool:
	return _is_integer_value(value) and int(value) >= 0


static func _is_positive_integer(value) -> bool:
	return _is_integer_value(value) and int(value) >= 1


static func _is_integer_value(value) -> bool:
	if value is int:
		return true
	if value is float:
		var number := float(value)
		return is_finite(number) and number == floor(number)
	return false
