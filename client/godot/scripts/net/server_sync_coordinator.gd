extends RefCounted

const PlayerProgressModel := preload("res://scripts/progression/player_progress_model.gd")
const GmQaAccessPolicyModel := preload("res://scripts/progression/gm_qa_access_policy_model.gd")
const GmToolRuntimeModel := preload("res://scripts/progression/gm_tool_runtime_model.gd")
const OfflineHangClientModel := preload("res://scripts/progression/offline_hang_client_model.gd")
const ServerAuthClientModel := preload("res://scripts/progression/server_auth_client_model.gd")
const ServerPetProfileProjectionModel := preload("res://scripts/progression/server_pet_profile_projection_model.gd")
const ServerProfileCacheModel := preload("res://scripts/progression/server_profile_cache_model.gd")

const AUTH_SERVER_ONLY := true
const PROFILE_PULL_DEFER_TIMEOUT_SECONDS := 8.0

var host
var offline_hang_status_cache: Dictionary = {}
var offline_hang_request_active: bool = false
var offline_hang_notice_session_id: String = ""


func _init(main_host = null) -> void:
	host = main_host


func bind(main_host) -> void:
	host = main_host


func is_server_account_session() -> bool:
	if host == null:
		return false
	return (
		str(host.current_account_session.get("authSource", "")) == ServerAuthClientModel.SOURCE_SERVER
		and str(host.current_account_session.get("serverSessionToken", "")).strip_edges() != ""
	)


func handle_session_invalid_response(parsed: Dictionary) -> bool:
	if not ServerAuthClientModel.is_session_invalid_response(parsed):
		return false
	var message := str(parsed.get("message", "登录已过期，请重新登录。")).strip_edges()
	if message == "":
		message = "登录已过期，请重新登录。"
	host._handle_server_session_expired(message)
	return true


func local_profile_mutation_blocked_for_server_only(action_label: String, emit_message: bool = true) -> bool:
	if not AUTH_SERVER_ONLY:
		return false
	if is_server_account_session():
		return false
	if host.auth_auto_bypass or not host.profile_save_enabled:
		return false
	if emit_message:
		var label := action_label.strip_edges()
		if label == "":
			label = "该操作"
		host._set_world_log_message("%s 需要连接服务器后执行，服务器版不会本地改档。" % label)
	return true


func server_profile_base_url() -> String:
	var base_url := str(host.current_account_session.get("serverBaseUrl", "")).strip_edges()
	if base_url == "" and host.auth_server_url_input != null:
		base_url = host.auth_server_url_input.text
	return ServerAuthClientModel.normalized_base_url(base_url)


func server_profile_token() -> String:
	return str(host.current_account_session.get("serverSessionToken", "")).strip_edges()


func clear_gm_tool_access() -> void:
	if host == null:
		return
	host.gm_tool_server_access_generation += 1
	host.gm_tool_server_access_request_pending = false
	host.gm_tool_server_access_state.clear()


func request_gm_tool_access() -> void:
	if host == null:
		return
	if (
		not is_server_account_session()
		or str(host.current_account_session.get("effectiveRole", "")) != "gm"
	):
		clear_gm_tool_access()
		return
	if host.gm_tool_server_access_request_pending:
		return
	var username := str(host.current_account_session.get("username", "")).strip_edges().to_lower()
	var token := server_profile_token()
	host.gm_tool_server_access_generation += 1
	var generation := int(host.gm_tool_server_access_generation)
	host.gm_tool_server_access_request_pending = true
	host.gm_tool_server_access_state = {
		"pending": true,
		"username": username,
	}
	host._refresh_qa_panel()
	var response: Dictionary = await host._auto_http_request_spec(
		ServerAuthClientModel.gm_tools_request(server_profile_base_url(), token)
	)
	if (
		generation != int(host.gm_tool_server_access_generation)
		or username != str(host.current_account_session.get("username", "")).strip_edges().to_lower()
		or token != server_profile_token()
	):
		return
	host.gm_tool_server_access_request_pending = false
	var parsed := ServerAuthClientModel.parse_gm_tools_response(
		int(response.get("responseCode", 0)),
		response.get("body", PackedByteArray()) as PackedByteArray
	)
	if bool(parsed.get("ok", false)):
		parsed["username"] = username
		host.gm_tool_server_access_state = parsed
		_schedule_gm_tool_access_expiry(generation, username, str(parsed.get("expiresAt", "")))
	else:
		host.gm_tool_server_access_state = {
			"ok": false,
			"username": username,
			"message": "服务器授权未确认，高价值操作暂不可用。",
		}
		if handle_session_invalid_response(parsed):
			return
	host._refresh_gm_visibility()
	host._refresh_account_panel()
	host._refresh_qa_panel()


func _schedule_gm_tool_access_expiry(generation: int, username: String, expires_at: String) -> void:
	var expires_at_unix := GmQaAccessPolicyModel.expires_at_unix(expires_at)
	var remaining := expires_at_unix - int(Time.get_unix_time_from_system())
	if remaining <= 0:
		clear_gm_tool_access()
		host._refresh_gm_visibility()
		return
	await host.get_tree().create_timer(float(remaining) + 0.05).timeout
	if (
		generation != int(host.gm_tool_server_access_generation)
		or username != str(host.current_account_session.get("username", "")).strip_edges().to_lower()
	):
		return
	clear_gm_tool_access()
	host._refresh_gm_visibility()
	host._refresh_account_panel()
	host._refresh_qa_panel()


func request_profile_pull() -> void:
	if host.profile_sync_http_request == null or not is_server_account_session():
		return
	if server_profile_pull_should_wait_for_profile_panel():
		host.server_profile_sync_pull_queued = true
		host.server_profile_sync_message = "服务器档案将在面板关闭后同步。"
		return
	host.server_profile_sync_pull_queued = false
	var spec := ServerAuthClientModel.profile_request(server_profile_base_url(), server_profile_token())
	start_server_profile_sync_request("pull", spec)


func queue_profile_pull() -> void:
	if not is_server_account_session() or host.server_profile_sync_state == "off":
		return
	if server_profile_pull_should_wait_for_profile_panel():
		host.server_profile_sync_pull_queued = true
		host.server_profile_sync_message = "服务器档案将在面板关闭后同步。"
		return
	if host.server_profile_sync_state == "loading" or host.server_profile_sync_state == "uploading":
		host.server_profile_sync_pull_queued = true
		return
	request_profile_pull()


func queue_profile_upload() -> void:
	if not is_server_account_session() or host.server_profile_sync_state == "off":
		return
	if host.server_profile_sync_state == "conflict":
		return
	host.server_profile_sync_dirty = false
	if host.server_profile_sync_state == "loading" or host.server_profile_sync_state == "uploading":
		host.server_profile_sync_pull_queued = true
		return
	host.server_profile_sync_pending_kind = ""
	host.server_profile_sync_state = "ready"
	host.server_profile_sync_message = "服务器档案由专用接口保存。"


func start_server_profile_sync_request(kind: String, spec: Dictionary) -> void:
	if host.profile_sync_http_request == null:
		return
	host.server_profile_sync_pending_kind = kind
	host.server_profile_sync_state = "loading" if kind == "pull" else "uploading"
	host.server_profile_sync_message = ""
	var err: int = host.profile_sync_http_request.request(
		str(spec.get("url", "")),
		_packed_string_array(spec.get("headers", [])),
		int(spec.get("method", HTTPClient.METHOD_GET)),
		str(spec.get("body", ""))
	)
	if err != OK:
		host.server_profile_sync_pending_kind = ""
		host.server_profile_sync_state = "ready"
		host.server_profile_sync_message = "服务器档案同步请求失败。"


func on_profile_sync_http_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var kind: String = str(host.server_profile_sync_pending_kind)
	host.server_profile_sync_pending_kind = ""
	if result != HTTPRequest.RESULT_SUCCESS:
		host.server_profile_sync_state = "ready" if is_server_account_session() else "off"
		host.server_profile_sync_message = "服务器档案连接失败。"
		return
	if kind == "pull":
		apply_server_profile_pull_result(ServerAuthClientModel.parse_profile_response(response_code, body))
	elif kind == "upload":
		apply_server_profile_upload_result(ServerAuthClientModel.parse_profile_upload_response(response_code, body))


func apply_server_profile_pull_result(parsed: Dictionary, allow_defer: bool = true) -> void:
	if not bool(parsed.get("ok", false)):
		if handle_session_invalid_response(parsed):
			return
		host.server_profile_sync_state = "ready" if is_server_account_session() else "off"
		host.server_profile_sync_message = str(parsed.get("message", "服务器档案读取失败。"))
		return
	if allow_defer and server_profile_pull_should_wait_for_profile_panel():
		defer_server_profile_pull_result(parsed)
		return
	var remote_profile = parsed.get("profile", null)
	if remote_profile is Dictionary:
		if not apply_server_profile_payload(parsed):
			host.server_profile_sync_state = "ready" if is_server_account_session() else "off"
			return
		host.server_profile_sync_state = "ready"
		host.server_profile_sync_dirty = false
		host.server_profile_sync_message = "已读取服务器档案。"
		host._refresh_account_panel()
		host._mark_progress_ui_caches_dirty()
		host._update_hud_text(true)
		host._layout_hud()
		continue_pending_server_profile_sync()
		return
	host.server_profile_sync_state = "ready"
	host.server_profile_sync_dirty = false
	host.server_profile_sync_message = "服务器未返回角色档案，请重新登录。"


func apply_server_profile_upload_result(parsed: Dictionary) -> void:
	var had_pull_queued: bool = bool(host.server_profile_sync_pull_queued)
	if handle_session_invalid_response(parsed):
		return
	host.server_profile_sync_state = "ready" if is_server_account_session() else "off"
	host.server_profile_sync_dirty = false
	var code := str(parsed.get("code", "")).strip_edges()
	if code == "profile_upload_denied" or code == "revision_conflict" or bool(parsed.get("ok", false)):
		host.server_profile_sync_message = "角色档案由服务器专用接口保存，整档上传已禁用。"
	else:
		host.server_profile_sync_message = str(parsed.get("message", "角色档案由服务器专用接口保存，整档上传已禁用。"))
	host._refresh_account_panel()
	if had_pull_queued:
		continue_pending_server_profile_sync()


func continue_pending_server_profile_sync() -> void:
	if not is_server_account_session():
		host.server_profile_sync_pull_queued = false
		host.server_profile_sync_deferred_pull_result.clear()
		host.server_profile_sync_deferred_pull_elapsed = 0.0
		return
	if host.server_profile_sync_state == "loading" or host.server_profile_sync_state == "uploading":
		return
	if server_profile_pull_should_wait_for_profile_panel():
		return
	if host.server_profile_sync_dirty:
		host.server_profile_sync_dirty = false
	if host.server_profile_sync_pull_queued:
		host.server_profile_sync_pull_queued = false
		request_profile_pull()


func server_profile_pull_should_wait_for_profile_panel() -> bool:
	return (
		(host.backpack_panel != null and host.backpack_panel.visible)
		or (host.shop_panel != null and host.shop_panel.visible)
		or host.shop_action_request_pending
		or host.equipment_action_request_pending
		or host.profile_action_request_pending
		or host.quest_action_request_pending
	)


func server_profile_pull_has_blocking_action() -> bool:
	return (
		host.shop_action_request_pending
		or host.equipment_action_request_pending
		or host.profile_action_request_pending
		or host.quest_action_request_pending
	)


func defer_server_profile_pull_result(parsed: Dictionary) -> void:
	host.server_profile_sync_deferred_pull_result = parsed.duplicate(true)
	host.server_profile_sync_deferred_pull_elapsed = 0.0
	host.server_profile_sync_state = "ready" if is_server_account_session() else "off"
	host.server_profile_sync_dirty = false
	host.server_profile_sync_message = "服务器档案已延后同步，关闭面板后刷新。"


func update_deferred_server_profile_pull(delta: float) -> void:
	if host.server_profile_sync_deferred_pull_result.is_empty():
		host.server_profile_sync_deferred_pull_elapsed = 0.0
		return
	if server_profile_pull_has_blocking_action():
		return
	if server_profile_pull_should_wait_for_profile_panel():
		host.server_profile_sync_deferred_pull_elapsed += maxf(0.0, delta)
		if host.server_profile_sync_deferred_pull_elapsed < PROFILE_PULL_DEFER_TIMEOUT_SECONDS:
			return
		apply_deferred_server_profile_pull_if_idle(true)
		return
	apply_deferred_server_profile_pull_if_idle()


func apply_deferred_server_profile_pull_if_idle(force_apply: bool = false) -> void:
	if server_profile_pull_should_wait_for_profile_panel() and not force_apply:
		return
	if not host.server_profile_sync_deferred_pull_result.is_empty():
		var parsed: Dictionary = host.server_profile_sync_deferred_pull_result.duplicate(true)
		host.server_profile_sync_deferred_pull_result.clear()
		host.server_profile_sync_deferred_pull_elapsed = 0.0
		var summary := parsed.get("profileSummary", {}) as Dictionary if parsed.get("profileSummary", {}) is Dictionary else {}
		var revision := int(summary.get("profileRevision", 0))
		if revision >= host.server_profile_sync_expected_revision:
			apply_server_profile_pull_result(parsed, false)
		continue_pending_server_profile_sync()
		return
	continue_pending_server_profile_sync()


func apply_server_profile_summary(summary: Dictionary) -> void:
	if summary.is_empty():
		return
	var incoming_revision := maxi(0, int(summary.get("profileRevision", 0)))
	if incoming_revision < host.server_profile_sync_expected_revision:
		return
	var next_revision := maxi(host.server_profile_sync_expected_revision, incoming_revision)
	var accepted_summary := summary.duplicate(true)
	accepted_summary["profileRevision"] = next_revision
	host.current_account_session["serverProfileSummary"] = accepted_summary
	host.server_profile_sync_expected_revision = next_revision
	var sync_state := host.player_profile.get("serverSync", {}) as Dictionary if host.player_profile.get("serverSync", {}) is Dictionary else {}
	sync_state["profileRevision"] = host.server_profile_sync_expected_revision
	sync_state["lastServerRevision"] = host.server_profile_sync_expected_revision
	sync_state["lastLocalSaveAtSec"] = int(Time.get_unix_time_from_system())
	host.player_profile["serverSync"] = sync_state


func apply_server_profile_payload(parsed: Dictionary) -> bool:
	var server_profile = parsed.get("profile", null)
	if not (server_profile is Dictionary):
		return false
	var incoming_summary = parsed.get("profileSummary", {})
	if incoming_summary is Dictionary:
		var incoming_revision := maxi(0, int((incoming_summary as Dictionary).get("profileRevision", 0)))
		if incoming_revision < host.server_profile_sync_expected_revision:
			parsed["profile"] = host.player_profile.duplicate(true)
			return true
	var projection := ServerPetProfileProjectionModel.project_runtime_server_profile(server_profile as Dictionary)
	if not bool(projection.get("ok", false)):
		var schema_status := str(projection.get("profileSchemaStatus", "current"))
		host.server_profile_sync_message = (
			"服务器档案版本较新，请更新客户端后重试。"
			if schema_status == "future"
			else "服务器档案校验失败，正在等待重新同步。"
		)
		host.server_profile_sync_pull_queued = true
		return false
	var projected_profile := (projection.get("profile", {}) as Dictionary).duplicate(true)
	var runtime_snapshot := PlayerProgressModel.server_runtime_profile_snapshot(projected_profile)
	if not bool(runtime_snapshot.get("ok", false)):
		host.server_profile_sync_message = "服务器档案版本不受支持，请更新客户端后重试。"
		host.server_profile_sync_pull_queued = true
		return false
	host.player_profile = (runtime_snapshot.get("profile", {}) as Dictionary).duplicate(true)
	_notify_pending_offline_hang_once(host.player_profile)
	host._apply_auth_profile_metadata_fields(str(host.current_account_session.get("displayName", "")))
	var summary = parsed.get("profileSummary", {})
	if summary is Dictionary:
		apply_server_profile_summary(summary as Dictionary)
	parsed["profile"] = host.player_profile.duplicate(true)
	if is_server_account_session():
		var published := ServerProfileCacheModel.publish_fresh_server_profile(
			PlayerProgressModel.current_save_path(),
			host.player_profile
		)
		if not bool(published.get("ok", false)):
			host.server_profile_sync_message = "服务器档案已载入，但本地公开缓存写入失败。"
	host._mark_progress_ui_caches_dirty()
	host._refresh_quick_bar()
	host._refresh_backpack_panel()
	if host.pet_panel != null and host.pet_panel.visible:
		host._refresh_pet_panel()
	if host.status_label != null:
		host._update_hud_text()
	return true


func queue_server_quest_record_event(event: Dictionary, quest_id: String = "") -> void:
	if event.is_empty():
		return
	host.server_quest_record_event_queue.append({
		"event": event.duplicate(true),
		"questId": quest_id.strip_edges(),
	})
	if host.server_quest_record_event_queue_running:
		return
	host.server_quest_record_event_queue_running = true
	host.call_deferred("_process_server_quest_record_event_queue")


func process_server_quest_record_event_queue() -> void:
	while not host.server_quest_record_event_queue.is_empty():
		var queued: Dictionary = host.server_quest_record_event_queue.pop_front()
		if not is_server_account_session() or host.auth_auto_bypass:
			continue
		var event: Dictionary = queued.get("event", {}) as Dictionary if queued.get("event", {}) is Dictionary else {}
		if event.is_empty():
			continue
		var parsed: Dictionary = await submit_server_quest_record(event, str(queued.get("questId", "")))
		var log_lines := _string_array_values(parsed.get("logLines", []))
		if not log_lines.is_empty():
			host._set_world_log_message("\n".join(log_lines))
	host.server_quest_record_event_queue_running = false


func submit_server_quest_record(event: Dictionary, quest_id: String = "") -> Dictionary:
	if not is_server_account_session():
		return {"ok": false, "message": "请先登录服务器。", "logLines": ["请先登录服务器。"]}
	host.quest_action_request_pending = true
	if host.quest_panel != null and host.quest_panel.visible:
		host._refresh_quest_panel()
	var response: Dictionary = await host._auto_http_request_spec(ServerAuthClientModel.quest_record_request(
		server_profile_base_url(),
		server_profile_token(),
		event,
		quest_id
	))
	host.quest_action_request_pending = false
	var parsed := ServerAuthClientModel.parse_quest_action_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	return apply_server_quest_action_result(parsed, "任务同步失败。")


func submit_server_quest_claim(quest_id: String = "", reward_choice_id: String = "") -> Dictionary:
	if not is_server_account_session():
		return {"ok": false, "message": "请先登录服务器。", "logLines": ["请先登录服务器。"]}
	host.quest_action_request_pending = true
	if host.quest_panel != null and host.quest_panel.visible:
		host._refresh_quest_panel()
	var response: Dictionary = await host._auto_http_request_spec(ServerAuthClientModel.quest_claim_request(
		server_profile_base_url(),
		server_profile_token(),
		quest_id,
		reward_choice_id
	))
	host.quest_action_request_pending = false
	var parsed := ServerAuthClientModel.parse_quest_action_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	return apply_server_quest_action_result(parsed, "领取任务奖励失败。")


func apply_server_quest_action_result(parsed: Dictionary, fallback_message: String) -> Dictionary:
	var log_lines: Array[String] = []
	if bool(parsed.get("ok", false)):
		if apply_server_profile_payload(parsed):
			for message in parsed.get("questMessages", []):
				var quest_message := str(message).strip_edges()
				if quest_message != "":
					log_lines.append(quest_message)
			if log_lines.is_empty():
				var success_message := str(parsed.get("message", "任务已同步。")).strip_edges()
				if success_message != "":
					log_lines.append(success_message)
		else:
			log_lines.append("任务已提交，但服务器没有返回档案，请重新拉取。")
			queue_profile_pull()
	else:
		if handle_session_invalid_response(parsed):
			parsed["logLines"] = [str(parsed.get("message", "登录已过期，请重新登录。"))]
			return parsed
		var summary = parsed.get("profileSummary", {})
		if summary is Dictionary:
			apply_server_profile_summary(summary as Dictionary)
		var error_message := str(parsed.get("message", fallback_message)).strip_edges()
		log_lines.append(error_message if error_message != "" else fallback_message)
	if log_lines.is_empty():
		log_lines.append(fallback_message)
	parsed["logLines"] = log_lines
	if host.quest_panel != null and host.quest_panel.visible:
		host._refresh_quest_panel()
	if host.status_label != null:
		host._update_hud_text()
	return parsed


func submit_server_profile_action(action: String, payload: Dictionary = {}, fallback_message: String = "档案操作失败。") -> Dictionary:
	if not is_server_account_session():
		return {"ok": false, "message": "请先登录服务器。", "logLines": ["请先登录服务器。"]}
	if host.profile_action_request_pending:
		return {"ok": false, "message": "档案操作同步中，请稍候。", "logLines": ["档案操作同步中，请稍候。"]}
	host.profile_action_request_pending = true
	var response: Dictionary = await host._auto_http_request_spec(ServerAuthClientModel.profile_action_request(
		server_profile_base_url(),
		server_profile_token(),
		action,
		payload
	))
	host.profile_action_request_pending = false
	var parsed := ServerAuthClientModel.parse_profile_action_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	var log_lines := _string_array_values(parsed.get("logLines", []))
	if bool(parsed.get("ok", false)):
		if apply_server_profile_payload(parsed):
			if log_lines.is_empty():
				var success_message := str(parsed.get("message", "角色档案已更新。")).strip_edges()
				if success_message != "":
					log_lines.append(success_message)
		else:
			log_lines = ["操作已提交，但服务器没有返回档案，请重新拉取。"]
			queue_profile_pull()
	else:
		if handle_session_invalid_response(parsed):
			parsed["logLines"] = [str(parsed.get("message", "登录已过期，请重新登录。"))]
			return parsed
		var summary = parsed.get("profileSummary", {})
		if summary is Dictionary:
			apply_server_profile_summary(summary as Dictionary)
		var error_message := str(parsed.get("message", fallback_message)).strip_edges()
		log_lines.append(error_message if error_message != "" else fallback_message)
	if log_lines.is_empty():
		log_lines.append(fallback_message)
	parsed["logLines"] = log_lines
	return parsed


func submit_server_gm_command(
	command_id: String,
	payload: Dictionary = {},
	fallback_message: String = "GM宠物操作失败。",
	requires_profile: bool = true
) -> Dictionary:
	if not is_server_account_session():
		return {"ok": false, "message": "请先登录服务器。", "logLines": ["请先登录服务器。"]}
	if host.profile_action_request_pending:
		return {"ok": false, "message": "档案操作同步中，请稍候。", "logLines": ["档案操作同步中，请稍候。"]}
	host.profile_action_request_pending = true
	var response: Dictionary = await host._auto_http_request_spec(ServerAuthClientModel.gm_command_request(
		server_profile_base_url(),
		server_profile_token(),
		command_id,
		payload
	))
	host.profile_action_request_pending = false
	var parsed := ServerAuthClientModel.parse_gm_command_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	var log_lines := _string_array_values(parsed.get("logLines", []))
	if bool(parsed.get("ok", false)):
		var profile_applied := apply_server_profile_payload(parsed) if requires_profile else false
		parsed["profileApplied"] = profile_applied
		if not requires_profile:
			if log_lines.is_empty():
				var success_message := str(parsed.get("message", "GM操作已完成。")).strip_edges()
				if success_message != "":
					log_lines.append(success_message)
		elif profile_applied:
			if log_lines.is_empty():
				var success_message := str(parsed.get("message", "GM宠物操作已完成。")).strip_edges()
				if success_message != "":
					log_lines.append(success_message)
		else:
			log_lines = ["服务器已完成操作，但客户端未能载入更新后的档案；请勿重复操作，正在重新拉取。"]
			queue_profile_pull()
	else:
		if handle_session_invalid_response(parsed):
			parsed["logLines"] = [str(parsed.get("message", "登录已过期，请重新登录。"))]
			return parsed
		var summary = parsed.get("profileSummary", {})
		if summary is Dictionary:
			apply_server_profile_summary(summary as Dictionary)
		var error_message := str(parsed.get("message", fallback_message)).strip_edges()
		log_lines.append(error_message if error_message != "" else fallback_message)
	if log_lines.is_empty():
		log_lines.append(fallback_message)
	parsed["logLines"] = log_lines
	return parsed


func server_hang_session_enabled() -> bool:
	return is_server_account_session() and server_profile_token().strip_edges() != ""


func request_server_hang_session_start(mode: String, cell: Vector2i, item_id: String = "") -> bool:
	if not server_hang_session_enabled():
		return false
	if host.hang_session_request_active:
		host._set_world_log_message("挂机同步中，请稍候。")
		return false
	host.hang_session_request_active = true
	var response: Dictionary = await host._auto_http_request_spec(ServerAuthClientModel.hang_session_start_request(
		server_profile_base_url(),
		server_profile_token(),
		mode,
		host.current_map_id,
		cell,
		PlayerProgressModel.hang_settings(host.player_profile),
		item_id
	))
	host.hang_session_request_active = false
	if not server_hang_session_enabled():
		return false
	var parsed := ServerAuthClientModel.parse_hang_session_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	if bool(parsed.get("ok", false)):
		if not apply_server_profile_payload(parsed):
			queue_profile_pull()
		return true
	if handle_session_invalid_response(parsed):
		return false
	var summary = parsed.get("profileSummary", {})
	if summary is Dictionary:
		apply_server_profile_summary(summary as Dictionary)
	host._set_world_log_message(str(parsed.get("message", "挂机同步失败。")))
	return false


func request_server_hang_session_stop(reason: String = "manual", pending_resume: bool = false) -> void:
	if not server_hang_session_enabled():
		return
	if host.hang_session_request_active:
		return
	host.hang_session_request_active = true
	var response: Dictionary = await host._auto_http_request_spec(ServerAuthClientModel.hang_session_stop_request(
		server_profile_base_url(),
		server_profile_token(),
		reason,
		pending_resume
	))
	host.hang_session_request_active = false
	if not server_hang_session_enabled():
		return
	var parsed := ServerAuthClientModel.parse_hang_session_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	if bool(parsed.get("ok", false)):
		apply_server_profile_payload(parsed)
		return
	if handle_session_invalid_response(parsed):
		return
	var summary = parsed.get("profileSummary", {})
	if summary is Dictionary:
		apply_server_profile_summary(summary as Dictionary)


func cached_offline_hang_status() -> Dictionary:
	return offline_hang_status_cache.duplicate(true)


func request_offline_hang_status(emit_message: bool = false) -> Dictionary:
	await host.get_tree().process_frame
	if not server_hang_session_enabled():
		return {"ok": false, "message": "请先登录服务器。"}
	if offline_hang_request_active:
		return {"ok": false, "message": "离线挂机同步中，请稍候。"}
	offline_hang_request_active = true
	var response: Dictionary = await host._auto_http_request_spec(ServerAuthClientModel.offline_hang_status_request(
		server_profile_base_url(),
		server_profile_token()
	))
	offline_hang_request_active = false
	var parsed := ServerAuthClientModel.parse_offline_hang_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	if bool(parsed.get("ok", false)):
		offline_hang_status_cache = {
			"config": (parsed.get("config", {}) as Dictionary).duplicate(true) if parsed.get("config", {}) is Dictionary else {},
			"offlineHang": (parsed.get("offlineHang", {}) as Dictionary).duplicate(true) if parsed.get("offlineHang", {}) is Dictionary else {},
		}
	elif handle_session_invalid_response(parsed):
		return parsed
	if emit_message:
		host._set_world_log_message(ServerAuthClientModel.player_message_from_parsed(parsed, "离线挂机状态已刷新。"))
	if host.auto_settings_panel != null and host.auto_settings_panel.visible:
		host._refresh_auto_settings_panel()
	return parsed


func submit_offline_hang_action(action: String) -> Dictionary:
	await host.get_tree().process_frame
	if not server_hang_session_enabled():
		return {"ok": false, "message": "请先登录服务器。"}
	if offline_hang_request_active:
		return {"ok": false, "message": "离线挂机同步中，请稍候。"}
	var normalized_action := action.strip_edges()
	var spec := {}
	match normalized_action:
		"start":
			spec = ServerAuthClientModel.offline_hang_start_request(server_profile_base_url(), server_profile_token(), host.current_map_id, host.last_checked_player_cell)
		"claim":
			spec = ServerAuthClientModel.offline_hang_claim_request(
				server_profile_base_url(),
				server_profile_token(),
				OfflineHangClientModel.active_session_id(host.player_profile)
			)
		"cancel":
			spec = ServerAuthClientModel.offline_hang_cancel_request(server_profile_base_url(), server_profile_token())
		_:
			return {"ok": false, "message": "离线挂机操作不正确。"}
	offline_hang_request_active = true
	var response: Dictionary = await host._auto_http_request_spec(spec)
	offline_hang_request_active = false
	var parsed := ServerAuthClientModel.parse_offline_hang_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	if bool(parsed.get("ok", false)):
		apply_server_profile_payload(parsed)
		offline_hang_status_cache = {
			"config": (parsed.get("config", {}) as Dictionary).duplicate(true) if parsed.get("config", {}) is Dictionary else offline_hang_status_cache.get("config", {}),
			"offlineHang": (parsed.get("offlineHang", {}) as Dictionary).duplicate(true) if parsed.get("offlineHang", {}) is Dictionary else {},
		}
		if normalized_action == "start":
			host._stop_hang_activity("", true, false)
	elif handle_session_invalid_response(parsed):
		return parsed
	host._set_world_log_message(ServerAuthClientModel.player_message_from_parsed(parsed, "离线挂机操作已完成。"))
	if host.auto_settings_panel != null and host.auto_settings_panel.visible:
		host._refresh_auto_settings_panel()
	return parsed


func update_offline_hang_gm_config(config: Dictionary) -> Dictionary:
	await host.get_tree().process_frame
	if not GmToolRuntimeModel.command_available(
		host.current_account_session,
		"gm_offline_hang_config",
		GmQaAccessPolicyModel.client_command_ids(),
		host.gm_tool_server_access_state
	):
		var denied := {"ok": false, "message": "当前测试授权不包含本服参数调整。"}
		host._set_world_log_message(str(denied.get("message", "")))
		return denied
	if not server_hang_session_enabled():
		return {"ok": false, "message": "请先登录服务器。"}
	if offline_hang_request_active:
		return {"ok": false, "message": "离线挂机同步中，请稍候。"}
	offline_hang_request_active = true
	var response: Dictionary = await host._auto_http_request_spec(ServerAuthClientModel.gm_offline_hang_config_request(
		server_profile_base_url(),
		server_profile_token(),
		config
	))
	offline_hang_request_active = false
	var parsed := ServerAuthClientModel.parse_offline_hang_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	if bool(parsed.get("ok", false)):
		offline_hang_status_cache["config"] = (parsed.get("config", {}) as Dictionary).duplicate(true) if parsed.get("config", {}) is Dictionary else {}
	elif handle_session_invalid_response(parsed):
		return parsed
	host._set_world_log_message(ServerAuthClientModel.player_message_from_parsed(parsed, "离线挂机参数已更新。"))
	if host.auto_settings_panel != null and host.auto_settings_panel.visible:
		host._refresh_auto_settings_panel()
	return parsed


func _notify_pending_offline_hang_once(profile: Dictionary) -> void:
	var session_id := OfflineHangClientModel.active_session_id(profile)
	if session_id == "":
		offline_hang_notice_session_id = ""
		return
	if session_id == offline_hang_notice_session_id:
		return
	offline_hang_notice_session_id = session_id
	host._set_world_log_message(OfflineHangClientModel.login_notice(profile))


func _packed_string_array(value) -> PackedStringArray:
	var result := PackedStringArray()
	if value is PackedStringArray:
		return value as PackedStringArray
	if value is Array:
		for item in value as Array:
			result.append(str(item))
	return result


func _string_array_values(value) -> Array[String]:
	var result: Array[String] = []
	if not (value is Array):
		return result
	for item in value:
		var text := str(item).strip_edges()
		if text != "":
			result.append(text)
	return result
