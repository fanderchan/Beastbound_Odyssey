extends RefCounted

const DEFAULT_MAX_PLAYERS := 24
const DEFAULT_MAX_REVISION_TOMBSTONES := 512
const MAX_POSITION_BATCH_DELTAS := 64
const CHANGE_UPSERT := "upsert"
const CHANGE_REMOVE := "remove"
const CHANGE_REBASE := "rebase"

var _max_players: int = DEFAULT_MAX_PLAYERS
var _max_revision_tombstones: int = DEFAULT_MAX_REVISION_TOMBSTONES
var _players_by_account_id: Dictionary = {}
var _account_order: Array[String] = []
var _active_revision_by_account_id: Dictionary = {}
var _active_revision_order: Array[String] = []
var _tombstone_revision_by_account_id: Dictionary = {}
var _tombstone_revision_order: Array[String] = []


func _init(max_players: int = DEFAULT_MAX_PLAYERS, max_revision_tombstones: int = DEFAULT_MAX_REVISION_TOMBSTONES) -> void:
	_max_players = maxi(1, max_players)
	_max_revision_tombstones = maxi(1, max_revision_tombstones)


func clear() -> void:
	_players_by_account_id.clear()
	_account_order.clear()
	_active_revision_by_account_id.clear()
	_active_revision_order.clear()
	_tombstone_revision_by_account_id.clear()
	_tombstone_revision_order.clear()


func apply_snapshot(raw_players: Variant, self_account_id: String = "", self_username: String = "") -> Dictionary:
	clear()
	if not (raw_players is Array):
		return {
			"ok": false,
			"changed": false,
			"reason": "snapshot_invalid",
			"playerCount": 0,
		}
	var players_array := raw_players as Array
	for value in players_array:
		if not (value is Dictionary):
			continue
		var player := (value as Dictionary).duplicate(true)
		var account_id := str(player.get("accountId", "")).strip_edges()
		if account_id == "":
			continue
		var revision := maxi(0, int(player.get("presenceRevision", 0)))
		if _is_self_player(account_id, player, self_account_id, self_username):
			_remember_tombstone_revision(account_id, revision)
			continue
		if not _player_is_cacheable(player):
			_remember_tombstone_revision(account_id, revision)
			continue
		if revision > 0:
			player["presenceRevision"] = revision
		if _players_by_account_id.has(account_id):
			_players_by_account_id[account_id] = player
			_remember_active_revision(account_id, revision)
			continue
		if _account_order.size() >= _max_players:
			_remember_tombstone_revision(account_id, revision)
			continue
		_players_by_account_id[account_id] = player
		_account_order.append(account_id)
		_remember_active_revision(account_id, revision)
	return {
		"ok": true,
		"changed": true,
		"reason": "snapshot",
		"playerCount": _account_order.size(),
	}


func apply_position_event(event: Dictionary, self_account_id: String = "", self_username: String = "") -> Dictionary:
	var change := str(event.get("change", "")).strip_edges().to_lower()
	var account_id := str(event.get("accountId", "")).strip_edges()
	var revision := int(event.get("presenceRevision", 0))
	if account_id == "" or not [CHANGE_UPSERT, CHANGE_REMOVE, CHANGE_REBASE].has(change) or revision <= 0:
		return _event_result(false, false, "event_invalid", account_id, revision)
	var previous_revision := revision_for(account_id)
	if revision <= previous_revision:
		_touch_tombstone_revision(account_id)
		return _event_result(true, false, "stale", account_id, previous_revision)
	if change == CHANGE_REBASE:
		return _apply_rebase_event(event, account_id, revision, self_account_id, self_username)
	if _event_is_self(account_id, event, self_account_id, self_username):
		var removed_self := _remove_cached_account(account_id, revision)
		return _event_result(true, removed_self, "self", account_id, revision)
	if change == CHANGE_REMOVE:
		var removed := _remove_cached_account(account_id, revision)
		return _event_result(true, removed, "remove", account_id, revision)
	var raw_player = event.get("player", null)
	if not (raw_player is Dictionary):
		return _event_result(false, false, "player_missing", account_id, previous_revision)
	var player := (raw_player as Dictionary).duplicate(true)
	var player_account_id := str(player.get("accountId", "")).strip_edges()
	if player_account_id != "" and player_account_id != account_id:
		return _event_result(false, false, "player_account_mismatch", account_id, previous_revision)
	player["accountId"] = account_id
	player["presenceRevision"] = revision
	if not _player_is_cacheable(player):
		var removed_uncacheable := _remove_cached_account(account_id, revision)
		return _event_result(true, removed_uncacheable, "uncacheable", account_id, revision)
	_players_by_account_id[account_id] = player
	_account_order.erase(account_id)
	_account_order.push_front(account_id)
	_remember_active_revision(account_id, revision)
	_trim_to_limit()
	return _event_result(true, true, "upsert", account_id, revision)


func apply_position_batch(event: Dictionary, self_account_id: String = "", self_username: String = "") -> Dictionary:
	if not event.has("deltas") or not (event.get("deltas") is Array):
		return _batch_result(false, false, "batch_invalid", 0, -1)
	var deltas := event.get("deltas") as Array
	if deltas.is_empty():
		return _batch_result(false, false, "batch_empty", 0, -1)
	if deltas.size() > MAX_POSITION_BATCH_DELTAS:
		return _batch_result(false, false, "batch_too_large", deltas.size(), -1)
	for index in range(deltas.size()):
		if not _position_batch_delta_is_structurally_valid(deltas[index]):
			return _batch_result(false, false, "batch_entry_invalid", deltas.size(), index)

	# A batch is one cache transaction. Keep shallow container snapshots because
	# apply_position_event replaces cached player dictionaries instead of
	# mutating their nested values. If a semantic error appears after earlier
	# deltas, restore the player cache and both revision indexes so no partial
	# batch leaks to the UI.
	var previous_players_by_account_id := _players_by_account_id.duplicate(false)
	var previous_account_order := _account_order.duplicate()
	var previous_active_revision_by_account_id := _active_revision_by_account_id.duplicate(false)
	var previous_active_revision_order := _active_revision_order.duplicate()
	var previous_tombstone_revision_by_account_id := _tombstone_revision_by_account_id.duplicate(false)
	var previous_tombstone_revision_order := _tombstone_revision_order.duplicate()
	var changed := false
	for index in range(deltas.size()):
		var result := apply_position_event(
			deltas[index] as Dictionary,
			self_account_id,
			self_username,
		)
		if not bool(result.get("ok", false)):
			_players_by_account_id = previous_players_by_account_id
			_account_order = previous_account_order
			_active_revision_by_account_id = previous_active_revision_by_account_id
			_active_revision_order = previous_active_revision_order
			_tombstone_revision_by_account_id = previous_tombstone_revision_by_account_id
			_tombstone_revision_order = previous_tombstone_revision_order
			return _batch_result(false, false, "batch_entry_invalid", deltas.size(), index)
		changed = bool(result.get("changed", false)) or changed
	return _batch_result(true, changed, "batch", deltas.size(), -1)


func position_batch_delta_count(event: Dictionary) -> int:
	if not event.has("deltas") or not (event.get("deltas") is Array):
		return -1
	var deltas := event.get("deltas") as Array
	if deltas.is_empty() or deltas.size() > MAX_POSITION_BATCH_DELTAS:
		return -1
	for value in deltas:
		if not _position_batch_delta_is_structurally_valid(value):
			return -1
	return deltas.size()


func players() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for account_id in _account_order:
		var value = _players_by_account_id.get(account_id, null)
		if value is Dictionary:
			result.append((value as Dictionary).duplicate(true))
	return result


func player_count() -> int:
	return _account_order.size()


func has_account(account_id: String) -> bool:
	return _players_by_account_id.has(account_id.strip_edges())


func player_for(account_id: String) -> Dictionary:
	var value = _players_by_account_id.get(account_id.strip_edges(), null)
	return (value as Dictionary).duplicate(true) if value is Dictionary else {}


func revision_for(account_id: String) -> int:
	var normalized := account_id.strip_edges()
	return maxi(
		maxi(0, int(_active_revision_by_account_id.get(normalized, 0))),
		maxi(0, int(_tombstone_revision_by_account_id.get(normalized, 0))),
	)


func active_revision_count() -> int:
	return _active_revision_by_account_id.size()


func tombstone_revision_count() -> int:
	return _tombstone_revision_by_account_id.size()


func max_revision_tombstones() -> int:
	return _max_revision_tombstones


func self_check() -> Dictionary:
	var errors: Array[String] = []
	var case_count := 0
	clear()
	var snapshot := apply_snapshot([
		_fixture_player("self", "self_user", 1, 1),
		_fixture_player("remote_a", "remote_a", 2, 2),
		_fixture_player("remote_b", "remote_b", 3, 3),
	], "self", "self_user")
	case_count += 1
	_expect(bool(snapshot.get("ok", false)), "snapshot 被拒绝", errors)
	_expect(player_count() == 2 and not has_account("self"), "snapshot 没有过滤自己", errors)

	apply_snapshot([_fixture_player("remote_c", "remote_c", 4, 4, 2)], "self", "self_user")
	case_count += 1
	_expect(player_count() == 1 and has_account("remote_c") and not has_account("remote_a"), "snapshot 没有完整替换", errors)

	var upsert := apply_position_event({
		"change": CHANGE_UPSERT,
		"accountId": "remote_c",
		"presenceRevision": 3,
		"player": _fixture_player("remote_c", "remote_c", 8, 9, 3),
	}, "self", "self_user")
	var stale := apply_position_event({
		"change": CHANGE_UPSERT,
		"accountId": "remote_c",
		"presenceRevision": 2,
		"player": _fixture_player("remote_c", "remote_c", 99, 99, 2),
	}, "self", "self_user")
	case_count += 1
	_expect(bool(upsert.get("changed", false)), "新 revision upsert 未应用", errors)
	_expect(not bool(stale.get("changed", true)) and str(stale.get("reason", "")) == "stale", "旧 revision 未拒绝", errors)
	_expect(int((player_for("remote_c").get("position", {}) as Dictionary).get("cellX", 0)) == 8, "旧 revision 覆盖了新位置", errors)
	_expect(not (player_for("remote_c").get("position", {}) as Dictionary).has("precision"), "v10 缓存仍依赖已删除的 precision", errors)

	var removed := apply_position_event({
		"change": CHANGE_REMOVE,
		"accountId": "remote_c",
		"presenceRevision": 4,
	}, "self", "self_user")
	var stale_after_remove := apply_position_event({
		"change": CHANGE_UPSERT,
		"accountId": "remote_c",
		"presenceRevision": 3,
		"player": _fixture_player("remote_c", "remote_c", 5, 5, 3),
	}, "self", "self_user")
	case_count += 1
	_expect(bool(removed.get("changed", false)) and not has_account("remote_c"), "remove 未删除角色", errors)
	_expect(not bool(stale_after_remove.get("changed", true)) and revision_for("remote_c") == 4, "remove 后旧 upsert 复活角色", errors)

	var self_delta := apply_position_event({
		"change": CHANGE_UPSERT,
		"accountId": "self",
		"presenceRevision": 5,
		"player": _fixture_player("self", "self_user", 7, 7, 5),
	}, "self", "self_user")
	case_count += 1
	_expect(str(self_delta.get("reason", "")) == "self" and not has_account("self"), "delta 没有过滤自己", errors)

	apply_snapshot([
		_fixture_player("rebase_remove", "rebase_remove", 2, 2, 1),
		_fixture_player("rebase_keep", "rebase_keep", 3, 3, 1),
	], "self", "self_user")
	apply_position_event({
		"change": CHANGE_UPSERT,
		"accountId": "rebase_remove",
		"presenceRevision": 100,
		"player": _fixture_player("rebase_remove", "rebase_remove", 4, 4, 100),
	}, "self", "self_user")
	apply_position_event({
		"change": CHANGE_REMOVE,
		"accountId": "rebase_new",
		"presenceRevision": 90,
	}, "self", "self_user")
	var rebase := apply_position_event({
		"change": CHANGE_REBASE,
		"accountId": "self",
		"presenceRevision": 6,
		"presenceRebase": {
			"removedAccountIds": ["rebase_remove"],
			"upserts": [
				_fixture_player("self", "self_user", 7, 7, 6),
				_fixture_player("rebase_new", "rebase_new", 8, 8, 90),
			],
		},
	}, "self", "self_user")
	var stale_rebase := apply_position_event({
		"change": CHANGE_REBASE,
		"accountId": "self",
		"presenceRevision": 5,
		"presenceRebase": {
			"removedAccountIds": ["rebase_keep"],
			"upserts": [_fixture_player("stale_rebase_new", "stale_rebase_new", 9, 9)],
		},
	}, "self", "self_user")
	var stale_remote_after_rebase := apply_position_event({
		"change": CHANGE_UPSERT,
		"accountId": "rebase_remove",
		"presenceRevision": 99,
		"player": _fixture_player("rebase_remove", "rebase_remove", 10, 10, 99),
	}, "self", "self_user")
	case_count += 1
	_expect(bool(rebase.get("ok", false)) and bool(rebase.get("changed", false)), "rebase 未原子应用", errors)
	_expect(not has_account("rebase_remove") and has_account("rebase_keep") and has_account("rebase_new"), "rebase remove/upsert 结果不正确", errors)
	_expect(not has_account("self") and revision_for("self") == 6, "rebase 没有过滤自己或记录 revision", errors)
	_expect(revision_for("rebase_remove") == 100 and revision_for("rebase_new") == 90, "rebase 覆盖了远端账号 revision", errors)
	_expect(not bool(stale_rebase.get("changed", true)) and not has_account("stale_rebase_new"), "旧 rebase 包覆盖了新视野", errors)
	_expect(not bool(stale_remote_after_rebase.get("changed", true)) and not has_account("rebase_remove"), "rebase 后旧远端 delta 复活角色", errors)

	var crowded: Array[Dictionary] = []
	for index in range(DEFAULT_MAX_PLAYERS + 6):
		crowded.append(_fixture_player("crowd_%02d" % index, "crowd_%02d" % index, index, 1, 1))
	apply_snapshot(crowded)
	apply_position_event({
		"change": CHANGE_UPSERT,
		"accountId": "newcomer",
		"presenceRevision": 1,
		"player": _fixture_player("newcomer", "newcomer", 1, 1, 1),
	})
	case_count += 1
	_expect(player_count() == DEFAULT_MAX_PLAYERS and has_account("newcomer"), "缓存上限或新 delta 固定失败", errors)

	clear()
	var ordered_batch := apply_position_batch({
		"deltas": [
			{
				"change": CHANGE_UPSERT,
				"accountId": "batch_order",
				"presenceRevision": 1,
				"player": _fixture_player("batch_order", "batch_order", 11, 12, 1),
			},
			{
				"change": CHANGE_REMOVE,
				"accountId": "batch_order",
				"presenceRevision": 1,
			},
		],
	})
	case_count += 1
	_expect(bool(ordered_batch.get("ok", false)) and bool(ordered_batch.get("changed", false)), "合法 batch 未应用", errors)
	_expect(has_account("batch_order"), "batch 未按数组顺序逐条应用", errors)

	clear()
	apply_snapshot([_fixture_player("batch_atomic", "batch_atomic", 4, 5, 1)])
	var invalid_entry_batch := apply_position_batch({
		"deltas": [
			{
				"change": CHANGE_UPSERT,
				"accountId": "batch_atomic",
				"presenceRevision": 2,
				"player": _fixture_player("batch_atomic", "batch_atomic", 50, 51, 2),
			},
			{
				"change": CHANGE_UPSERT,
				"accountId": "batch_invalid",
				"presenceRevision": 1,
			},
		],
	})
	case_count += 1
	_expect(not bool(invalid_entry_batch.get("ok", true)), "坏 Dictionary entry 未拒绝整包", errors)
	_expect(revision_for("batch_atomic") == 1, "坏 entry 前的 revision 没有回滚", errors)
	_expect(int((player_for("batch_atomic").get("position", {}) as Dictionary).get("cellX", 0)) == 4, "坏 entry 前的位置没有回滚", errors)
	_expect(not has_account("batch_invalid"), "坏 entry 留下了部分缓存", errors)

	var non_dictionary_batch := apply_position_batch({
		"deltas": [
			{
				"change": CHANGE_REMOVE,
				"accountId": "batch_atomic",
				"presenceRevision": 2,
			},
			"invalid",
		],
	})
	case_count += 1
	_expect(not bool(non_dictionary_batch.get("ok", true)) and has_account("batch_atomic"), "非 Dictionary entry 没有原子拒绝", errors)

	var oversized_deltas: Array[Dictionary] = []
	for index in range(MAX_POSITION_BATCH_DELTAS + 1):
		oversized_deltas.append({
			"change": CHANGE_REMOVE,
			"accountId": "oversized_%d" % index,
			"presenceRevision": 1,
		})
	var oversized_batch := apply_position_batch({"deltas": oversized_deltas})
	case_count += 1
	_expect(not bool(oversized_batch.get("ok", true)) and str(oversized_batch.get("reason", "")) == "batch_too_large", ">64 batch 未拒绝", errors)
	_expect(has_account("batch_atomic") and revision_for("batch_atomic") == 1, ">64 batch 改写了缓存", errors)

	var missing_deltas_batch := apply_position_batch({})
	var non_array_batch := apply_position_batch({"deltas": {}})
	var empty_batch := apply_position_batch({"deltas": []})
	case_count += 1
	_expect(not bool(missing_deltas_batch.get("ok", true)) and not bool(non_array_batch.get("ok", true)) and not bool(empty_batch.get("ok", true)), "空、缺失或非 Array deltas 未拒绝", errors)
	_expect(has_account("batch_atomic") and revision_for("batch_atomic") == 1, "非法 deltas 改写了缓存", errors)

	var invalid_child_type_batch := apply_position_batch({"deltas": [{"type": "online.position_batch"}]})
	var nested_batch := apply_position_batch({"deltas": [{"deltas": []}]})
	var child_event_seq_batch := apply_position_batch({"deltas": [{"eventSeq": 1}]})
	case_count += 1
	_expect(
		not bool(invalid_child_type_batch.get("ok", true))
		and not bool(nested_batch.get("ok", true))
		and not bool(child_event_seq_batch.get("ok", true)),
		"batch child 接受了嵌套 batch、独立类型或 eventSeq",
		errors,
	)

	clear()
	for index in range(_max_revision_tombstones + 8):
		apply_position_event({
			"change": CHANGE_REMOVE,
			"accountId": "bounded_tombstone_%04d" % index,
			"presenceRevision": 10,
		})
	var newest_tombstone_id := "bounded_tombstone_%04d" % (_max_revision_tombstones + 7)
	var stale_after_tombstone_churn := apply_position_event({
		"change": CHANGE_UPSERT,
		"accountId": newest_tombstone_id,
		"presenceRevision": 9,
		"player": _fixture_player(newest_tombstone_id, newest_tombstone_id, 6, 6, 9),
	})
	var touched_tombstone_id := "bounded_tombstone_%04d" % 8
	apply_position_event({
		"change": CHANGE_REMOVE,
		"accountId": touched_tombstone_id,
		"presenceRevision": 9,
	})
	apply_position_event({
		"change": CHANGE_REMOVE,
		"accountId": "bounded_tombstone_extra",
		"presenceRevision": 10,
	})
	case_count += 1
	_expect(tombstone_revision_count() == _max_revision_tombstones, "revision tombstone 未保持有界", errors)
	_expect(active_revision_count() <= _max_players, "活跃 revision 超过显示缓存上限", errors)
	_expect(not bool(stale_after_tombstone_churn.get("changed", true)) and not has_account(newest_tombstone_id), "LRU 内旧 delta 复活了已移除角色", errors)
	_expect(revision_for(touched_tombstone_id) == 10, "最近访问的 revision tombstone 未按 LRU 保留", errors)

	return {
		"ok": errors.is_empty(),
		"caseCount": case_count,
		"errors": errors,
		"playerCount": player_count(),
		"maxPlayers": _max_players,
		"maxBatchDeltas": MAX_POSITION_BATCH_DELTAS,
		"activeRevisionCount": active_revision_count(),
		"tombstoneRevisionCount": tombstone_revision_count(),
		"maxRevisionTombstones": _max_revision_tombstones,
	}


func _apply_rebase_event(event: Dictionary, account_id: String, revision: int, self_account_id: String, self_username: String) -> Dictionary:
	var raw_rebase = event.get("presenceRebase", null)
	if not (raw_rebase is Dictionary):
		return _event_result(false, false, "rebase_missing", account_id, revision_for(account_id))
	var rebase := raw_rebase as Dictionary
	var raw_removed = rebase.get("removedAccountIds", null)
	var raw_upserts = rebase.get("upserts", null)
	if not (raw_removed is Array) or not (raw_upserts is Array):
		return _event_result(false, false, "rebase_invalid", account_id, revision_for(account_id))
	var removed_account_ids: Array[String] = []
	var removed_values := raw_removed as Array
	for value in removed_values:
		if not (value is String):
			return _event_result(false, false, "rebase_remove_invalid", account_id, revision_for(account_id))
		var removed_account_id := str(value).strip_edges()
		if removed_account_id == "":
			return _event_result(false, false, "rebase_remove_invalid", account_id, revision_for(account_id))
		if not removed_account_ids.has(removed_account_id):
			removed_account_ids.append(removed_account_id)
	var upserts: Array[Dictionary] = []
	var upsert_account_ids: Array[String] = []
	var upsert_values := raw_upserts as Array
	for value in upsert_values:
		if not (value is Dictionary):
			return _event_result(false, false, "rebase_upsert_invalid", account_id, revision_for(account_id))
		var player := (value as Dictionary).duplicate(true)
		var player_account_id := str(player.get("accountId", "")).strip_edges()
		var player_revision := int(player.get("presenceRevision", 0))
		if player_account_id == "" or player_revision <= 0 or upsert_account_ids.has(player_account_id):
			return _event_result(false, false, "rebase_upsert_invalid", account_id, revision_for(account_id))
		upserts.append(player)
		upsert_account_ids.append(player_account_id)
	# Rebase revision belongs to the moving viewer. It orders whole rebase packets,
	# but must never be compared with or written over each remote account's own
	# movement revision domain.
	_remember_tombstone_revision(account_id, revision)
	var changed := false
	for removed_account_id in removed_account_ids:
		changed = _remove_cached_account(removed_account_id) or changed
	for index in range(upserts.size() - 1, -1, -1):
		var player := upserts[index]
		var player_account_id := str(player.get("accountId", "")).strip_edges()
		var player_revision := int(player.get("presenceRevision", 0))
		if _is_self_player(player_account_id, player, self_account_id, self_username):
			changed = _remove_cached_account(player_account_id, player_revision) or changed
			continue
		# The viewer's rebase revision and each remote player's movement revision
		# are separate domains. A rebase row can restore an equal-revision player
		# after a viewport tombstone, but an older row must not overwrite a newer
		# remote movement event already applied by this client.
		if player_revision < revision_for(player_account_id):
			continue
		if not _player_is_cacheable(player):
			changed = _remove_cached_account(player_account_id, player_revision) or changed
			continue
		_players_by_account_id[player_account_id] = player
		_account_order.erase(player_account_id)
		_account_order.push_front(player_account_id)
		_remember_active_revision(player_account_id, player_revision)
		changed = true
	_trim_to_limit()
	return _event_result(true, changed, "rebase", account_id, revision)


func _remember_active_revision(account_id: String, revision: int) -> void:
	var normalized := account_id.strip_edges()
	if normalized == "":
		return
	var remembered := maxi(revision_for(normalized), maxi(0, revision))
	_tombstone_revision_by_account_id.erase(normalized)
	_tombstone_revision_order.erase(normalized)
	_active_revision_by_account_id[normalized] = remembered
	_active_revision_order.erase(normalized)
	_active_revision_order.push_front(normalized)


func _remember_tombstone_revision(account_id: String, revision: int) -> void:
	var normalized := account_id.strip_edges()
	if normalized == "":
		return
	var remembered := maxi(revision_for(normalized), maxi(0, revision))
	_active_revision_by_account_id.erase(normalized)
	_active_revision_order.erase(normalized)
	if remembered <= 0:
		_tombstone_revision_by_account_id.erase(normalized)
		_tombstone_revision_order.erase(normalized)
		return
	_tombstone_revision_by_account_id[normalized] = remembered
	_tombstone_revision_order.erase(normalized)
	_tombstone_revision_order.push_front(normalized)
	while _tombstone_revision_order.size() > _max_revision_tombstones:
		var expired_account_id: String = str(_tombstone_revision_order.pop_back())
		_tombstone_revision_by_account_id.erase(expired_account_id)


func _touch_tombstone_revision(account_id: String) -> void:
	var normalized := account_id.strip_edges()
	if not _tombstone_revision_by_account_id.has(normalized):
		return
	_tombstone_revision_order.erase(normalized)
	_tombstone_revision_order.push_front(normalized)


func _remove_cached_account(account_id: String, revision: int = -1) -> bool:
	var normalized := account_id.strip_edges()
	var remembered := maxi(revision_for(normalized), revision)
	var existed := _players_by_account_id.erase(normalized)
	_account_order.erase(normalized)
	_remember_tombstone_revision(normalized, remembered)
	return existed


func _trim_to_limit() -> void:
	while _account_order.size() > _max_players:
		var removed_account_id: String = str(_account_order.pop_back())
		_remove_cached_account(removed_account_id)


func _is_self_player(account_id: String, player: Dictionary, self_account_id: String, self_username: String) -> bool:
	if self_account_id.strip_edges() != "" and account_id == self_account_id.strip_edges():
		return true
	var username := str(player.get("username", "")).strip_edges()
	return self_username.strip_edges() != "" and username == self_username.strip_edges()


func _event_is_self(account_id: String, event: Dictionary, self_account_id: String, self_username: String) -> bool:
	var player = event.get("player", null)
	return _is_self_player(
		account_id,
		player as Dictionary if player is Dictionary else {},
		self_account_id,
		self_username,
	)


func _player_is_cacheable(player: Dictionary) -> bool:
	var position = player.get("position", null)
	if not (position is Dictionary):
		return false
	var position_dict := position as Dictionary
	if position_dict.has("hasCell"):
		return bool(position_dict.get("hasCell", false))
	if str(position_dict.get("precision", "")).strip_edges().to_lower() == "map":
		return false
	return position_dict.has("cellX") and position_dict.has("cellY")


func _event_result(ok: bool, changed: bool, reason: String, account_id: String, revision: int) -> Dictionary:
	return {
		"ok": ok,
		"changed": changed,
		"reason": reason,
		"accountId": account_id,
		"presenceRevision": revision,
		"playerCount": _account_order.size(),
	}


func _batch_result(ok: bool, changed: bool, reason: String, delta_count: int, failed_index: int) -> Dictionary:
	return {
		"ok": ok,
		"changed": changed,
		"reason": reason,
		"deltaCount": delta_count,
		"failedIndex": failed_index,
		"playerCount": _account_order.size(),
	}


func _position_batch_delta_is_structurally_valid(value: Variant) -> bool:
	if not (value is Dictionary):
		return false
	var delta := value as Dictionary
	var nested_type := str(delta.get("type", "")).strip_edges()
	if nested_type != "" and nested_type != "online.position":
		return false
	if int(delta.get("eventSeq", 0)) > 0 or delta.has("deltas"):
		return false
	return true


func _fixture_player(account_id: String, username: String, cell_x: int, cell_y: int, revision: int = 0) -> Dictionary:
	return {
		"accountId": account_id,
		"username": username,
		"displayName": username,
		"presenceRevision": revision,
		"position": {
			"mapId": "firebud_training_yard",
			"cellX": cell_x,
			"cellY": cell_y,
			"facing": "south",
			"moving": false,
			"hasCell": true,
		},
	}


func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)
