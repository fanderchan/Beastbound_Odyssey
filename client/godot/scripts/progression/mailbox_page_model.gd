extends RefCounted

const DEFAULT_PAGE_LIMIT := 30


static func empty_state() -> Dictionary:
	return {
		"messages": [],
		"nextCursor": "",
		"hasMore": false,
		"unreadCount": 0,
	}


static func messages(state: Dictionary) -> Array[Dictionary]:
	return _normalized_messages(state.get("messages", []))


static func next_cursor(state: Dictionary) -> String:
	var value = state.get("nextCursor", "")
	return value if value is String else ""


static func has_more(state: Dictionary) -> bool:
	return bool(state.get("hasMore", false)) and next_cursor(state) != ""


static func unread_count(state: Dictionary) -> int:
	return maxi(0, int(state.get("unreadCount", 0)))


static func is_unread(message: Dictionary) -> bool:
	return not _is_read(message)


static func is_settled(message: Dictionary) -> bool:
	var settled_at = message.get("settledAt", null)
	return settled_at is String and (settled_at as String).strip_edges() != ""


static func replace_page(_state: Dictionary, page: Dictionary) -> Dictionary:
	var page_messages := _normalized_messages(page.get("messages", []))
	return _state_from_page(page_messages, page, _count_unread(page_messages))


static func append_page(state: Dictionary, page: Dictionary) -> Dictionary:
	var current := _normalized_state(state)
	var merged := current.get("messages", []) as Array
	var index_by_id: Dictionary = {}
	for index in range(merged.size()):
		var existing := merged[index] as Dictionary
		index_by_id[str(existing.get("mailId", ""))] = index
	for message in _normalized_messages(page.get("messages", [])):
		var mail_id := str(message.get("mailId", ""))
		if index_by_id.has(mail_id):
			merged[int(index_by_id[mail_id])] = message
			continue
		index_by_id[mail_id] = merged.size()
		merged.append(message)
	var fallback_unread := unread_count(current)
	return _state_from_page(merged, page, fallback_unread)


static func preserve_after_failure(state: Dictionary) -> Dictionary:
	return _normalized_state(state)


static func reset_for_account() -> Dictionary:
	return empty_state()


static func apply_read_mail(state: Dictionary, mail: Dictionary) -> Dictionary:
	var current := _normalized_state(state)
	var mail_id := str(mail.get("mailId", "")).strip_edges()
	if mail_id == "":
		return current
	var rows := current.get("messages", []) as Array
	for index in range(rows.size()):
		var previous := rows[index] as Dictionary
		if str(previous.get("mailId", "")) != mail_id:
			continue
		var was_unread := not _is_read(previous)
		var replacement := mail.duplicate(true)
		replacement["mailId"] = mail_id
		rows[index] = replacement
		if was_unread and _is_read(replacement):
			current["unreadCount"] = maxi(0, unread_count(current) - 1)
		return current
	return current


static func apply_claim_mail(state: Dictionary, claimed_mail, claimed_mail_id: String) -> Dictionary:
	var current := _normalized_state(state)
	var normalized_id := claimed_mail_id.strip_edges()
	if claimed_mail is Dictionary:
		var replacement := (claimed_mail as Dictionary).duplicate(true)
		var replacement_id := str(replacement.get("mailId", normalized_id)).strip_edges()
		if replacement_id == "":
			return current
		replacement["mailId"] = replacement_id
		var rows := current.get("messages", []) as Array
		for index in range(rows.size()):
			var previous := rows[index] as Dictionary
			if str(previous.get("mailId", "")) != replacement_id:
				continue
			var was_unread := not _is_read(previous)
			rows[index] = replacement
			if was_unread and _is_read(replacement):
				current["unreadCount"] = maxi(0, unread_count(current) - 1)
			return current
		rows.append(replacement)
		return current
	if normalized_id == "":
		return current
	var rows := current.get("messages", []) as Array
	for index in range(rows.size() - 1, -1, -1):
		var previous := rows[index] as Dictionary
		if str(previous.get("mailId", "")) != normalized_id:
			continue
		if not _is_read(previous):
			current["unreadCount"] = maxi(0, unread_count(current) - 1)
		rows.remove_at(index)
		break
	return current


static func self_check() -> Dictionary:
	var errors: Array[String] = []
	var first := replace_page(empty_state(), {
		"messages": [
			{"mailId": "mail_page_a", "title": "甲", "readAt": null},
			{"mailId": "mail_page_b", "title": "乙", "readAt": "2099-01-01T00:00:00.000Z"},
		],
		"nextCursor": "opaque+/=cursor",
		"hasMore": true,
		"unreadCount": 4,
		"unreadCountProvided": true,
	})
	_expect(messages(first).size() == 2, "首屏邮件数量错误", errors)
	_expect(next_cursor(first) == "opaque+/=cursor" and has_more(first), "首屏游标没有按不透明值保存", errors)
	_expect(unread_count(first) == 4, "首屏总未读数错误", errors)

	var appended := append_page(first, {
		"messages": [
			{"mailId": "mail_page_b", "title": "乙更新", "readAt": "2099-01-01T00:00:00.000Z"},
			{"mailId": "mail_page_c", "title": "丙", "readAt": null},
		],
		"nextCursor": "opaque-next",
		"hasMore": true,
		"unreadCount": 3,
		"unreadCountProvided": true,
	})
	var appended_messages := messages(appended)
	_expect(appended_messages.size() == 3, "追加页没有按 mailId 去重", errors)
	_expect(str(appended_messages[1].get("title", "")) == "乙更新", "重复邮件没有原位更新", errors)
	_expect(str(appended_messages[2].get("mailId", "")) == "mail_page_c", "追加页顺序错误", errors)
	_expect(next_cursor(appended) == "opaque-next" and unread_count(appended) == 3, "追加页元数据错误", errors)

	var preserved := preserve_after_failure(appended)
	_expect(preserved == appended, "失败请求改变了已加载页面", errors)
	var read_once := apply_read_mail(appended, {
		"mailId": "mail_page_a",
		"title": "甲",
		"readAt": "2099-01-01T00:00:01.000Z",
	})
	_expect(unread_count(read_once) == 2, "标记已读没有减少一次总未读数", errors)
	var read_twice := apply_read_mail(read_once, {
		"mailId": "mail_page_a",
		"title": "甲",
		"readAt": "2099-01-01T00:00:02.000Z",
	})
	_expect(unread_count(read_twice) == 2, "重复已读错误扣减总未读数", errors)
	var claimed := apply_claim_mail(read_twice, null, "mail_page_c")
	_expect(messages(claimed).size() == 2 and unread_count(claimed) == 1, "删除未读邮件没有同步总未读数", errors)
	var settled := apply_claim_mail(claimed, {
		"mailId": "mail_page_a",
		"title": "甲",
		"items": [],
		"currency": {},
		"readAt": "2099-01-01T00:00:03.000Z",
		"settledAt": "2099-01-01T00:00:03.000Z",
	}, "mail_page_a")
	_expect(messages(settled).size() == 2, "结算回执被错误删除", errors)
	_expect(is_settled(messages(settled)[0]), "结算回执没有原位保留", errors)
	_expect(unread_count(settled) == 1, "结算回执重复扣减未读数", errors)
	var reset := reset_for_account()
	_expect(messages(reset).is_empty() and not has_more(reset) and unread_count(reset) == 0, "账号重置没有清空分页状态", errors)
	return {"ok": errors.is_empty(), "errors": errors}


static func _normalized_state(state: Dictionary) -> Dictionary:
	var rows := _normalized_messages(state.get("messages", []))
	var cursor := next_cursor(state)
	var more := bool(state.get("hasMore", false)) and cursor != ""
	return {
		"messages": rows,
		"nextCursor": cursor if more else "",
		"hasMore": more,
		"unreadCount": unread_count(state),
	}


static func _state_from_page(rows: Array, page: Dictionary, fallback_unread: int) -> Dictionary:
	var raw_cursor = page.get("nextCursor", "")
	var cursor: String = raw_cursor if raw_cursor is String else ""
	var more := bool(page.get("hasMore", false)) and cursor != ""
	var unread := fallback_unread
	if bool(page.get("unreadCountProvided", true)):
		unread = maxi(0, int(page.get("unreadCount", fallback_unread)))
	return {
		"messages": rows,
		"nextCursor": cursor if more else "",
		"hasMore": more,
		"unreadCount": unread,
	}


static func _normalized_messages(value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var index_by_id: Dictionary = {}
	if not (value is Array):
		return result
	for raw_message in value as Array:
		if not (raw_message is Dictionary):
			continue
		var message := (raw_message as Dictionary).duplicate(true)
		var mail_id := str(message.get("mailId", "")).strip_edges()
		if mail_id == "":
			continue
		message["mailId"] = mail_id
		if index_by_id.has(mail_id):
			result[int(index_by_id[mail_id])] = message
			continue
		index_by_id[mail_id] = result.size()
		result.append(message)
	return result


static func _count_unread(rows: Array[Dictionary]) -> int:
	var count := 0
	for row in rows:
		if not _is_read(row):
			count += 1
	return count


static func _is_read(message: Dictionary) -> bool:
	var read_at = message.get("readAt", null)
	return read_at is String and (read_at as String).strip_edges() != ""


static func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)
