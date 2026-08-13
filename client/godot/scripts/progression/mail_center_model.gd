extends RefCounted

const ACTIVE_CAPACITY := 200
const SECTION_INBOX := "inbox"
const SECTION_REWARDS := "rewards"
const SECTION_ARCHIVE := "archive"
const SECTION_COMPOSE := "compose"
const SECTIONS := [SECTION_INBOX, SECTION_REWARDS, SECTION_ARCHIVE, SECTION_COMPOSE]


static func empty_page() -> Dictionary:
	return {
		"entries": [],
		"nextCursor": "",
		"hasMore": false,
		"loaded": false,
	}


static func empty_summary() -> Dictionary:
	return {
		"schemaVersion": 1,
		"activeCount": 0,
		"activeCapacity": ACTIVE_CAPACITY,
		"unreadCount": 0,
		"availableRewardCount": 0,
		"archiveCount": 0,
		"archiveEnabled": false,
		"rewardVaultEnabled": false,
		"activeLimitEnabled": false,
	}


static func normalized_section(value: String) -> String:
	var section := value.strip_edges()
	return section if SECTIONS.has(section) else SECTION_INBOX


static func entries(state: Dictionary) -> Array[Dictionary]:
	return _normalized_entries(state.get("entries", []), "")


static func next_cursor(state: Dictionary) -> String:
	var value = state.get("nextCursor", "")
	return value if value is String else ""


static func has_more(state: Dictionary) -> bool:
	return bool(state.get("hasMore", false)) and next_cursor(state) != ""


static func is_loaded(state: Dictionary) -> bool:
	return bool(state.get("loaded", false))


static func replace_page(_state: Dictionary, page: Dictionary, rows_field: String, id_field: String) -> Dictionary:
	return _state_from_page(
		_normalized_entries(page.get(rows_field, []), id_field),
		page
	)


static func append_page(state: Dictionary, page: Dictionary, rows_field: String, id_field: String) -> Dictionary:
	var current := _normalized_page(state, id_field)
	var merged := current.get("entries", []) as Array
	var index_by_id: Dictionary = {}
	for index in range(merged.size()):
		index_by_id[str((merged[index] as Dictionary).get(id_field, ""))] = index
	for entry in _normalized_entries(page.get(rows_field, []), id_field):
		var entry_id := str(entry.get(id_field, ""))
		if index_by_id.has(entry_id):
			merged[int(index_by_id[entry_id])] = entry
			continue
		index_by_id[entry_id] = merged.size()
		merged.append(entry)
	return _state_from_page(merged, page)


static func preserve_after_failure(state: Dictionary, id_field: String) -> Dictionary:
	return _normalized_page(state, id_field)


static func apply_reward_claim(state: Dictionary, reward: Dictionary) -> Dictionary:
	var current := _normalized_page(state, "rewardId")
	var reward_id := str(reward.get("rewardId", "")).strip_edges()
	if reward_id == "":
		return current
	var rows := current.get("entries", []) as Array
	for index in range(rows.size()):
		if str((rows[index] as Dictionary).get("rewardId", "")) != reward_id:
			continue
		rows[index] = reward.duplicate(true)
		return current
	return current


static func normalized_summary(value) -> Dictionary:
	if not summary_is_valid(value):
		return empty_summary()
	var summary := value as Dictionary
	var active_count := int(summary.get("activeCount", -1))
	var capacity := int(summary.get("activeCapacity", -1))
	var unread_count := int(summary.get("unreadCount", -1))
	var reward_count := int(summary.get("availableRewardCount", -1))
	var archive_count := int(summary.get("archiveCount", -1))
	var archive_enabled = summary.get("archiveEnabled", null)
	var reward_enabled = summary.get("rewardVaultEnabled", null)
	var limit_enabled = summary.get("activeLimitEnabled", null)
	return {
		"schemaVersion": 1,
		"activeCount": active_count,
		"activeCapacity": ACTIVE_CAPACITY,
		"unreadCount": unread_count,
		"availableRewardCount": reward_count,
		"archiveCount": archive_count,
		"archiveEnabled": bool(archive_enabled),
		"rewardVaultEnabled": bool(reward_enabled),
		"activeLimitEnabled": bool(limit_enabled),
	}


static func summary_is_valid(value) -> bool:
	if not (value is Dictionary):
		return false
	var summary := value as Dictionary
	var fields := [
		"schemaVersion",
		"activeCount",
		"activeCapacity",
		"unreadCount",
		"availableRewardCount",
		"archiveCount",
		"archiveEnabled",
		"rewardVaultEnabled",
		"activeLimitEnabled",
	]
	if summary.size() != fields.size():
		return false
	for field in fields:
		if not summary.has(field):
			return false
	var active_count_value = summary.get("activeCount")
	var capacity_value = summary.get("activeCapacity")
	var unread_count_value = summary.get("unreadCount")
	var reward_count_value = summary.get("availableRewardCount")
	var archive_count_value = summary.get("archiveCount")
	var archive_enabled = summary.get("archiveEnabled")
	var reward_enabled = summary.get("rewardVaultEnabled")
	var limit_enabled = summary.get("activeLimitEnabled")
	if (
		not _integer_value_is(summary.get("schemaVersion"), 1)
		or not _integer_value_is(capacity_value, ACTIVE_CAPACITY)
		or not _non_negative_integer(active_count_value)
		or not _non_negative_integer(unread_count_value)
		or not _non_negative_integer(reward_count_value)
		or not _non_negative_integer(archive_count_value)
		or not (archive_enabled is bool)
		or not (reward_enabled is bool)
		or not (limit_enabled is bool)
	):
		return false
	var active_count := int(active_count_value)
	var unread_count := int(unread_count_value)
	var reward_count := int(reward_count_value)
	var archive_count := int(archive_count_value)
	return (
		unread_count <= active_count
		and (not bool(limit_enabled) or (bool(reward_enabled) and active_count <= ACTIVE_CAPACITY))
		and (bool(reward_enabled) or reward_count == 0)
		and (bool(archive_enabled) or archive_count == 0)
	)


static func summary_after_read(value: Dictionary, became_read: bool) -> Dictionary:
	var summary := normalized_summary(value)
	if became_read:
		summary["unreadCount"] = maxi(0, int(summary.get("unreadCount", 0)) - 1)
	return summary


static func summary_after_reward_claim(value: Dictionary, was_claimable: bool) -> Dictionary:
	var summary := normalized_summary(value)
	if was_claimable:
		summary["availableRewardCount"] = maxi(
			0,
			int(summary.get("availableRewardCount", 0)) - 1
		)
	return summary


static func section_available(section: String, summary_value: Dictionary) -> bool:
	var summary := normalized_summary(summary_value)
	match normalized_section(section):
		SECTION_REWARDS:
			return bool(summary.get("rewardVaultEnabled", false))
		SECTION_ARCHIVE:
			return bool(summary.get("archiveEnabled", false))
		_:
			return true


static func capacity_text(summary_value: Dictionary) -> String:
	var summary := normalized_summary(summary_value)
	var count := int(summary.get("activeCount", 0))
	if bool(summary.get("activeLimitEnabled", false)):
		return "容量 %d/%d" % [count, ACTIVE_CAPACITY]
	return "邮件 %d" % count


static func tab_text(section: String, summary_value: Dictionary) -> String:
	var summary := normalized_summary(summary_value)
	match normalized_section(section):
		SECTION_INBOX:
			return _badge("收件箱", int(summary.get("unreadCount", 0)))
		SECTION_REWARDS:
			return _badge("奖励", int(summary.get("availableRewardCount", 0)))
		SECTION_ARCHIVE:
			return "归档"
		SECTION_COMPOSE:
			return "写信"
	return "收件箱"


static func self_check() -> Dictionary:
	var errors: Array[String] = []
	var rewards := replace_page(empty_page(), {
		"rewards": [
			{"rewardId": "reward_a", "claimable": true},
			{"rewardId": "reward_b", "claimable": true},
		],
		"nextCursor": "reward-next",
		"hasMore": true,
	}, "rewards", "rewardId")
	var archive := replace_page(empty_page(), {
		"messages": [{"mailId": "mail_archive_a"}],
		"nextCursor": "archive-next",
		"hasMore": true,
	}, "messages", "mailId")
	_expect(next_cursor(rewards) == "reward-next", "奖励游标错误", errors)
	_expect(next_cursor(archive) == "archive-next", "归档游标错误", errors)
	var appended := append_page(rewards, {
		"rewards": [
			{"rewardId": "reward_b", "claimable": false},
			{"rewardId": "reward_c", "claimable": true},
		],
		"nextCursor": "",
		"hasMore": false,
	}, "rewards", "rewardId")
	_expect(entries(appended).size() == 3, "奖励追加页没有去重", errors)
	_expect(not bool(entries(appended)[1].get("claimable", true)), "奖励回执没有原位更新", errors)
	var summary := normalized_summary({
		"schemaVersion": 1,
		"activeCount": 200,
		"activeCapacity": 200,
		"unreadCount": 7,
		"availableRewardCount": 2,
		"archiveCount": 18,
		"archiveEnabled": true,
		"rewardVaultEnabled": true,
		"activeLimitEnabled": true,
	})
	_expect(capacity_text(summary) == "容量 200/200", "容量文案错误", errors)
	_expect(tab_text(SECTION_INBOX, summary) == "收件箱 7", "收件徽标错误", errors)
	_expect(tab_text(SECTION_REWARDS, summary) == "奖励 2", "奖励徽标错误", errors)
	_expect(int(summary_after_reward_claim(summary, true).get("availableRewardCount", -1)) == 1, "领奖徽标没有扣减", errors)
	_expect(normalized_section("bad") == SECTION_INBOX, "未知页签没有安全回退", errors)
	_expect(entries(empty_page()).is_empty() and not has_more(empty_page()), "账号重置页不为空", errors)
	return {"ok": errors.is_empty(), "errors": errors}


static func _normalized_page(state: Dictionary, id_field: String) -> Dictionary:
	return _state_from_page(_normalized_entries(state.get("entries", []), id_field), state)


static func _state_from_page(rows: Array, page: Dictionary) -> Dictionary:
	var raw_cursor = page.get("nextCursor", "")
	var cursor: String = raw_cursor if raw_cursor is String else ""
	var more := bool(page.get("hasMore", false)) and cursor != ""
	return {
		"entries": rows,
		"nextCursor": cursor if more else "",
		"hasMore": more,
		"loaded": true,
	}


static func _normalized_entries(value, id_field: String) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var index_by_id: Dictionary = {}
	if not (value is Array):
		return result
	for raw_entry in value as Array:
		if not (raw_entry is Dictionary):
			continue
		var entry := (raw_entry as Dictionary).duplicate(true)
		var entry_id := str(entry.get(id_field, "")).strip_edges() if id_field != "" else ""
		if id_field != "" and entry_id == "":
			continue
		if id_field != "":
			entry[id_field] = entry_id
			if index_by_id.has(entry_id):
				result[int(index_by_id[entry_id])] = entry
				continue
			index_by_id[entry_id] = result.size()
		result.append(entry)
	return result


static func _badge(label: String, count: int) -> String:
	return label if count <= 0 else "%s %d" % [label, count]


static func _non_negative_integer(value) -> bool:
	return (value is int and int(value) >= 0) or (
		value is float and is_finite(float(value)) and float(value) >= 0.0 and floorf(float(value)) == float(value)
	)


static func _integer_value_is(value, expected: int) -> bool:
	return _non_negative_integer(value) and int(value) == expected


static func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)
