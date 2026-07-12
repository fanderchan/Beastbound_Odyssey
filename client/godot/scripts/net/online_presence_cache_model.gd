extends RefCounted

const DEFAULT_MAX_PLAYERS := 24
const CHANGE_UPSERT := "upsert"
const CHANGE_REMOVE := "remove"
const CHANGE_REBASE := "rebase"

var _max_players: int = DEFAULT_MAX_PLAYERS
var _players_by_account_id: Dictionary = {}
var _account_order: Array[String] = []
var _revision_by_account_id: Dictionary = {}


func _init(max_players: int = DEFAULT_MAX_PLAYERS) -> void:
	_max_players = maxi(1, max_players)


func clear() -> void:
	_players_by_account_id.clear()
	_account_order.clear()
	_revision_by_account_id.clear()


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
		_remember_revision(account_id, revision)
		if _is_self_player(account_id, player, self_account_id, self_username):
			continue
		if not _player_is_cacheable(player):
			continue
		if revision > 0:
			player["presenceRevision"] = revision
		if _players_by_account_id.has(account_id):
			_players_by_account_id[account_id] = player
			continue
		if _account_order.size() >= _max_players:
			continue
		_players_by_account_id[account_id] = player
		_account_order.append(account_id)
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
	var previous_revision := int(_revision_by_account_id.get(account_id, 0))
	if revision <= previous_revision:
		return _event_result(true, false, "stale", account_id, previous_revision)
	if change == CHANGE_REBASE:
		return _apply_rebase_event(event, account_id, revision, self_account_id, self_username)
	if _event_is_self(account_id, event, self_account_id, self_username):
		_remember_revision(account_id, revision)
		var removed_self := _remove_cached_account(account_id)
		return _event_result(true, removed_self, "self", account_id, revision)
	if change == CHANGE_REMOVE:
		_remember_revision(account_id, revision)
		var removed := _remove_cached_account(account_id)
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
	_remember_revision(account_id, revision)
	if not _player_is_cacheable(player):
		var removed_uncacheable := _remove_cached_account(account_id)
		return _event_result(true, removed_uncacheable, "uncacheable", account_id, revision)
	_players_by_account_id[account_id] = player
	_account_order.erase(account_id)
	_account_order.push_front(account_id)
	_trim_to_limit()
	return _event_result(true, true, "upsert", account_id, revision)


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
	return maxi(0, int(_revision_by_account_id.get(account_id.strip_edges(), 0)))


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

	return {
		"ok": errors.is_empty(),
		"caseCount": case_count,
		"errors": errors,
		"playerCount": player_count(),
		"maxPlayers": _max_players,
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
	_remember_revision(account_id, revision)
	var changed := false
	for removed_account_id in removed_account_ids:
		changed = _remove_cached_account(removed_account_id) or changed
	for index in range(upserts.size() - 1, -1, -1):
		var player := upserts[index]
		var player_account_id := str(player.get("accountId", "")).strip_edges()
		var player_revision := int(player.get("presenceRevision", 0))
		if _is_self_player(player_account_id, player, self_account_id, self_username):
			changed = _remove_cached_account(player_account_id) or changed
			continue
		# The viewer's rebase revision and each remote player's movement revision
		# are separate domains. A rebase row can restore an equal-revision player
		# after a viewport tombstone, but an older row must not overwrite a newer
		# remote movement event already applied by this client.
		if player_revision < revision_for(player_account_id):
			continue
		_remember_revision(player_account_id, player_revision)
		if not _player_is_cacheable(player):
			changed = _remove_cached_account(player_account_id) or changed
			continue
		_players_by_account_id[player_account_id] = player
		_account_order.erase(player_account_id)
		_account_order.push_front(player_account_id)
		changed = true
	_trim_to_limit()
	return _event_result(true, changed, "rebase", account_id, revision)


func _remember_revision(account_id: String, revision: int) -> void:
	_revision_by_account_id[account_id] = maxi(0, revision)


func _remove_cached_account(account_id: String) -> bool:
	var existed := _players_by_account_id.erase(account_id)
	_account_order.erase(account_id)
	return existed


func _trim_to_limit() -> void:
	while _account_order.size() > _max_players:
		var removed_account_id: String = str(_account_order.pop_back())
		_players_by_account_id.erase(removed_account_id)


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
			"hasCell": true,
			"precision": "cell",
		},
	}


func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)
