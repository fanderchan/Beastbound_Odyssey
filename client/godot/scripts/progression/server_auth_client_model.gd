extends RefCounted

const AccountAuthModel := preload("res://scripts/progression/account_auth_model.gd")

const DEFAULT_BASE_URL := "http://127.0.0.1:8787"
const SOURCE_SERVER := "server"
const CLIENT_VERSION := "0.1.0"
const CLIENT_PROTOCOL_VERSION := 7
const RETRY_POLICY_NONE := "none"
const RETRY_POLICY_IDEMPOTENT := "idempotent"
const IDEMPOTENCY_HEADER_NAME := "Idempotency-Key"
const IDEMPOTENCY_KEY_PREFIX := "bbo_"
const IDEMPOTENCY_KEY_MIN_LENGTH := 16
const IDEMPOTENCY_KEY_MAX_LENGTH := 160
const IDEMPOTENCY_RANDOM_BYTES := 24
const DEFAULT_RETRY_ATTEMPTS := 3
const DEFAULT_RETRY_BASE_DELAY_MS := 250
const DEFAULT_RETRY_MAX_DELAY_MS := 1000
const NETWORK_FAILED_CODE := "network_failed"
const NETWORK_RETRY_FAILED_CODE := "network_retry_failed"
const SESSION_INVALID_CODES := [
	"session_expired",
	"session_refresh_expired",
	"session_revoked",
	"session_replaced",
	"session_missing",
]
const NETWORK_FAILURE_CODES := [
	NETWORK_FAILED_CODE,
	NETWORK_RETRY_FAILED_CODE,
]
const RETRYABLE_HTTP_RESPONSE_CODES := [
	408,
	425,
	429,
	500,
	502,
	503,
	504,
]
const ERROR_CODE_MESSAGES := {
	"account_exists": "账号已存在。",
	"account_missing": "账号不存在。",
	"auth_backoff": "登录尝试过于频繁，请稍后再试。",
	"auth_rate_limited": "操作太频繁，请稍后再试。",
	"bad_event_json": "服务器事件格式不正确。",
	"bad_json": "服务器返回格式不正确。",
	"client_version_missing": "客户端版本信息缺失，请更新客户端后重试。",
	"command_denied": "当前账号没有执行该操作的权限。",
	"connection_failed": "服务器连接失败，请稍后重试。",
	"empty_command": "操作命令不能为空。",
	"encounter_stone_binding_mismatch": "遇敌石位置已变化，请重新使用遇敌石。",
	"encounter_stone_expired": "遇敌石效果已经结束。",
	"encounter_stone_interval_pending": "遇敌石正在积累下一次遇敌。",
	"encounter_stone_session_invalid": "遇敌石状态不完整，请重新使用遇敌石。",
	"gm_denied": "当前账号没有 GM 权限。",
	"heal_not_needed": "队伍生命已满。",
	"invalid_body": "内容不能为空。",
	"invalid_profile": "角色档案格式不正确。",
	"invalid_shop_action": "商店操作不正确。",
	"invalid_title": "标题不能为空。",
	"invalid_username": "账号格式不正确。",
	"idempotency_key_conflict": "操作状态已变化，请刷新后重新操作。",
	"idempotency_key_invalid": "操作标识失效，请重新操作。",
	"battle_profile_mutation_locked": "战斗中暂不能整理资产或宠物，请在战斗结束后重试。",
	"battle_capture_capacity_full": "宠物栏和兽栏都满了，请先清理位置再捕捉。",
	"battle_capture_candidate_invalid": "这只野生宠物暂时无法捕捉，请重新遇敌。",
	"movement_corner_blocked": "不能从阻挡物夹角斜穿，请换个方向。",
	"movement_rate_limited": "移动过快，请稍候。",
	"missing_username": "服务器会话缺少账号。",
	"network_failed": "网络连接失败，请稍后重试。",
	"network_retry_failed": "网络不稳定，已重试，请稍后再试。",
	"not_enough_currency": "货币不足。",
	"not_enough_diamonds": "钻石不足。",
	"not_enough_stone_coins": "石币不足。",
	"not_server_session": "请先登录服务器。",
	"profile_upload_denied": "角色档案由服务器专用接口保存，不能整档上传。",
	"protocol_version_mismatch": "客户端版本与服务器协议不兼容，请更新客户端后重试。",
	"recipient_missing": "收件账号不存在。",
	"recipient_self": "不能给自己发送邮件。",
	"revision_conflict": "服务器档案已更新，请重新拉取。",
	"server_error": "服务器暂时异常，请稍后重试。",
	"storage_commit_timeout": "服务器仍在确认本次操作，正在使用原操作重试。",
	"storage_queue_full": "服务器正在保存较多操作，请稍后重试。",
	"storage_write_failed": "服务器存档暂时不可用，请稍后使用原操作重试。",
	"session_cancelled": "服务器档案同步已取消。",
	"session_expired": "登录会话已过期，请重新登录。",
	"session_missing": "登录会话不存在，请重新登录。",
	"session_replaced": "你的账号已在其他地方登录，你已被踢出游戏。",
	"session_refresh_expired": "登录已过期，请重新登录。",
	"session_revoked": "登录会话已失效，请重新登录。",
	"weak_password": "密码强度不够，请换一个更安全的密码。",
	"wrong_password": "密码不正确。",
}
const ERROR_CODE_PREFIX_MESSAGES := [
	["backpack_", "背包操作失败，请检查空间和解锁顺序。"],
	["bank_", "仓库操作失败，请检查空间和数量。"],
	["battle_command_", "战斗指令无法提交，请重新选择。"],
	["battle_record_", "战绩读取失败，请稍后再试。"],
	["battle_", "切磋操作失败，请检查双方状态。"],
	["chat_", "聊天操作失败，请稍后重试。"],
	["equipment_synthesis_", "装备合成失败，请检查配方和材料。"],
	["equipment_enhance_", "装备强化失败，请检查装备和材料。"],
	["equipment_repair_", "装备修理失败，请检查耐久和费用。"],
	["equipment_", "装备操作失败，请检查装备状态。"],
	["encounter_", "遇敌状态已变化，请继续移动。"],
	["family_", "家族操作失败，请检查家族状态。"],
	["offline_hang_", "离线挂机操作失败，请刷新累计状态后重试。"],
	["hang_", "挂机操作失败，请检查队伍和道具状态。"],
	["item_use_", "这个物品暂时不能这样使用。"],
	["item_", "物品操作失败，请检查数量和状态。"],
	["mail_", "邮件操作失败，请稍后重试。"],
	["manor_", "庄园操作失败，请检查家族和庄园状态。"],
	["market_", "交易所操作失败，请检查物品、价格和货币。"],
	["mm_stone_", "转生MM石头条件未满足。"],
	["mm_", "转生MM任务暂时无法处理。"],
	["party_encounter_", "队伍遇敌失败，请检查队伍状态。"],
	["party_", "队伍操作失败，请检查队伍状态。"],
	["pet_rebirth_", "宠物转生条件未满足。"],
	["pet_skill_", "宠物技能操作失败，请检查技能和费用。"],
	["pet_drop_", "地面宠物状态已变化。"],
	["pet_", "宠物操作失败，请检查宠物状态。"],
	["player_rebirth_", "转生条件未满足。"],
	["player_stat_", "属性点分配失败，请检查剩余点数。"],
	["position_", "位置同步失败，请重新移动。"],
	["profile_", "角色档案操作失败，请稍后重试。"],
	["quest_", "任务状态暂时无法更新。"],
	["shop_", "商店交易失败，请检查物品和货币。"],
	["trade_", "交易失败，请检查双方距离、物品和石币。"],
	["training_partner_", "队伍伙伴设置失败，请检查数量。"],
]


static func normalized_base_url(base_url: String) -> String:
	var value := base_url.strip_edges()
	if value == "":
		value = DEFAULT_BASE_URL
	while value.ends_with("/"):
		value = value.substr(0, value.length() - 1)
	return value


static func protocol_query() -> String:
	return "clientVersion=%s&clientProtocolVersion=%d" % [CLIENT_VERSION.uri_encode(), CLIENT_PROTOCOL_VERSION]


static func request_headers(extra: Array[String] = []) -> Array[String]:
	var headers: Array[String] = [
		"X-Beastbound-Client-Version: %s" % CLIENT_VERSION,
		"X-Beastbound-Protocol-Version: %d" % CLIENT_PROTOCOL_VERSION,
	]
	headers.append_array(extra)
	return headers


static func new_idempotency_key() -> String:
	var random_bytes := Crypto.new().generate_random_bytes(IDEMPOTENCY_RANDOM_BYTES)
	if random_bytes.size() != IDEMPOTENCY_RANDOM_BYTES:
		return ""
	return "%s%s" % [IDEMPOTENCY_KEY_PREFIX, random_bytes.hex_encode()]


static func idempotency_key_is_valid(value: String) -> bool:
	var key := value.strip_edges()
	if not key.begins_with(IDEMPOTENCY_KEY_PREFIX) or key.length() < IDEMPOTENCY_KEY_MIN_LENGTH:
		return false
	if key.length() > IDEMPOTENCY_KEY_MAX_LENGTH:
		return false
	for index in range(IDEMPOTENCY_KEY_PREFIX.length(), key.length()):
		var codepoint := key.unicode_at(index)
		var is_digit := codepoint >= 0x30 and codepoint <= 0x39
		var is_upper := codepoint >= 0x41 and codepoint <= 0x5a
		var is_lower := codepoint >= 0x61 and codepoint <= 0x7a
		if not is_digit and not is_upper and not is_lower and not [0x2d, 0x2e, 0x3a, 0x5f].has(codepoint):
			return false
	return true


static func request_idempotency_key(spec: Dictionary) -> String:
	var declared_key := str(spec.get("idempotencyKey", "")).strip_edges()
	if idempotency_key_is_valid(declared_key):
		return declared_key
	var raw_headers = spec.get("headers", [])
	if not (raw_headers is Array or raw_headers is PackedStringArray):
		return ""
	for raw_header in raw_headers:
		var header := str(raw_header)
		var separator := header.find(":")
		if separator < 0:
			continue
		if header.substr(0, separator).strip_edges().to_lower() != IDEMPOTENCY_HEADER_NAME.to_lower():
			continue
		var header_key := header.substr(separator + 1).strip_edges()
		if idempotency_key_is_valid(header_key):
			return header_key
	return ""


# Pure preparation helper: callers may inject a deterministic key in focused tests.
# An already prepared spec always keeps its first valid key, so later retries cannot
# accidentally turn one logical mutation into multiple idempotency operations.
static func prepare_request_with_idempotency_key(spec: Dictionary, candidate_key: String) -> Dictionary:
	var prepared := spec.duplicate(true)
	if not bool(prepared.get("durableMutation", false)):
		return prepared
	var stable_key := request_idempotency_key(prepared)
	if stable_key == "":
		stable_key = candidate_key.strip_edges()
	if not idempotency_key_is_valid(stable_key):
		return prepared
	var headers: Array[String] = []
	var raw_headers = prepared.get("headers", [])
	if raw_headers is Array or raw_headers is PackedStringArray:
		for raw_header in raw_headers:
			var header := str(raw_header)
			var separator := header.find(":")
			if separator >= 0 and header.substr(0, separator).strip_edges().to_lower() == IDEMPOTENCY_HEADER_NAME.to_lower():
				continue
			headers.append(header)
	headers.append("%s: %s" % [IDEMPOTENCY_HEADER_NAME, stable_key])
	prepared["headers"] = headers
	prepared["idempotencyKey"] = stable_key
	prepared["retryPolicy"] = RETRY_POLICY_IDEMPOTENT
	return prepared


static func prepare_request_for_send(spec: Dictionary) -> Dictionary:
	if not bool(spec.get("durableMutation", false)):
		return spec.duplicate(true)
	var stable_key := request_idempotency_key(spec)
	if stable_key == "":
		stable_key = new_idempotency_key()
	return prepare_request_with_idempotency_key(spec, stable_key)


static func _durable_mutation_request(spec: Dictionary) -> Dictionary:
	var marked := spec.duplicate(true)
	marked["durableMutation"] = true
	return prepare_request_for_send(marked)


static func request_retry_policy(spec: Dictionary) -> String:
	var policy := str(spec.get("retryPolicy", "")).strip_edges()
	if policy != "":
		return policy
	if bool(spec.get("idempotent", false)):
		return RETRY_POLICY_IDEMPOTENT
	if int(spec.get("method", HTTPClient.METHOD_GET)) == HTTPClient.METHOD_GET:
		return RETRY_POLICY_IDEMPOTENT
	return RETRY_POLICY_NONE


static func request_is_idempotent(spec: Dictionary) -> bool:
	return request_retry_policy(spec) == RETRY_POLICY_IDEMPOTENT


static func request_retry_attempts(spec: Dictionary) -> int:
	if not request_is_idempotent(spec):
		return 1
	return maxi(1, int(spec.get("retryAttempts", DEFAULT_RETRY_ATTEMPTS)))


static func request_retry_delay_seconds(spec: Dictionary, completed_attempts: int) -> float:
	var base_ms := maxi(0, int(spec.get("retryBaseDelayMs", DEFAULT_RETRY_BASE_DELAY_MS)))
	var max_ms := maxi(base_ms, int(spec.get("retryMaxDelayMs", DEFAULT_RETRY_MAX_DELAY_MS)))
	var multiplier := int(pow(2.0, float(maxi(0, completed_attempts - 1))))
	var delay_ms := mini(max_ms, base_ms * multiplier)
	return float(delay_ms) / 1000.0


static func request_should_retry(spec: Dictionary, result: int, response_code: int, completed_attempts: int) -> bool:
	if completed_attempts >= request_retry_attempts(spec):
		return false
	if not request_is_idempotent(spec):
		return false
	if result != HTTPRequest.RESULT_SUCCESS:
		return true
	return RETRYABLE_HTTP_RESPONSE_CODES.has(response_code)


static func network_failure_body(spec: Dictionary, _result: int, _error: int, attempts: int, exhausted_retries: bool) -> PackedByteArray:
	var retry_failed := exhausted_retries and request_is_idempotent(spec) and attempts > 1
	var code := NETWORK_RETRY_FAILED_CODE if retry_failed else NETWORK_FAILED_CODE
	return JSON.stringify({
		"ok": false,
		"code": code,
		"message": network_failure_message(spec, code),
		"attempts": maxi(1, attempts),
	}).to_utf8_buffer()


static func network_failure_message(spec: Dictionary, code: String) -> String:
	if code == NETWORK_RETRY_FAILED_CODE:
		return "网络不稳定，已重试，请稍后再试。"
	if request_is_idempotent(spec):
		return "网络连接失败，请稍后重试。"
	return "网络连接失败，请确认状态后重试。"


static func is_network_failure_response(parsed: Dictionary) -> bool:
	return NETWORK_FAILURE_CODES.has(str(parsed.get("code", "")).strip_edges())


static func player_message_for_code(code: String, fallback_message: String = "") -> String:
	var fallback := fallback_message.strip_edges()
	if message_has_cjk(fallback):
		return fallback
	var normalized_code := code.strip_edges()
	if ERROR_CODE_MESSAGES.has(normalized_code):
		return str(ERROR_CODE_MESSAGES[normalized_code])
	for entry in ERROR_CODE_PREFIX_MESSAGES:
		if entry is Array and (entry as Array).size() >= 2 and normalized_code.begins_with(str((entry as Array)[0])):
			return str((entry as Array)[1])
	return "服务器操作失败，请稍后重试。"


static func player_message_from_parsed(parsed: Dictionary, fallback_message: String = "") -> String:
	var message := str(parsed.get("message", fallback_message)).strip_edges()
	var code := str(parsed.get("code", "")).strip_edges()
	if code != "" or not bool(parsed.get("ok", false)):
		return player_message_for_code("server_error" if code == "" else code, message if message != "" else fallback_message)
	if message != "":
		return message
	return fallback_message


static func message_has_cjk(text: String) -> bool:
	for index in range(text.length()):
		var codepoint := text.unicode_at(index)
		if (codepoint >= 0x3400 and codepoint <= 0x9fff) or (codepoint >= 0xf900 and codepoint <= 0xfaff):
			return true
	return false


static func _auth_headers(session_token: String) -> Array[String]:
	return request_headers(["Authorization: Bearer %s" % session_token])


static func _json_headers() -> Array[String]:
	return request_headers(["Content-Type: application/json"])


static func _json_auth_headers(session_token: String) -> Array[String]:
	return request_headers([
		"Content-Type: application/json",
		"Authorization: Bearer %s" % session_token,
	])


static func register_request(base_url: String, username: String, password: String, display_name: String) -> Dictionary:
	return _auth_request(base_url, "/auth/register", {
		"username": username,
		"password": password,
		"displayName": display_name,
	})


static func login_request(base_url: String, username: String, password: String) -> Dictionary:
	return _auth_request(base_url, "/auth/login", {
		"username": username,
		"password": password,
	})


static func refresh_session_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/auth/refresh" % normalized_base_url(base_url),
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": "",
	}


static func logout_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/auth/logout" % normalized_base_url(base_url),
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": "",
	}


static func is_session_invalid_code(code: String) -> bool:
	return SESSION_INVALID_CODES.has(code.strip_edges())


static func is_session_invalid_response(parsed: Dictionary) -> bool:
	return is_session_invalid_code(str(parsed.get("code", "")))


static func profile_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/profiles/me" % normalized_base_url(base_url),
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func profile_upload_disabled_probe_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/profiles/me" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_PUT,
		"body": JSON.stringify({"profile": {}}),
	}


# Legacy auto checks still call this name; it intentionally sends only the disabled probe.
static func profile_upload_request(base_url: String, session_token: String, _profile: Dictionary, _expected_revision: int) -> Dictionary:
	return profile_upload_disabled_probe_request(base_url, session_token)


static func profile_action_request(base_url: String, session_token: String, action: String, payload: Dictionary = {}) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/profile/action" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({
			"action": action,
			"payload": payload,
		}),
	})


static func gm_command_request(base_url: String, session_token: String, command_id: String, payload: Dictionary = {}) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/gm/commands/%s" % [normalized_base_url(base_url), command_id.strip_edges().uri_encode()],
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify(payload),
	})


static func shop_transaction_request(base_url: String, session_token: String, mode: String, shop_id: String, item_id: String, amount: int) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/shops/transaction" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({
			"mode": mode,
			"shopId": shop_id,
			"itemId": item_id,
			"amount": maxi(1, amount),
		}),
	})


static func bank_deposit_request(base_url: String, session_token: String, items: Array[Dictionary], stone_coins: int = 0) -> Dictionary:
	return _bank_transaction_request(base_url, session_token, "/bank/deposit", items, stone_coins)


static func bank_withdraw_request(base_url: String, session_token: String, items: Array[Dictionary], stone_coins: int = 0) -> Dictionary:
	return _bank_transaction_request(base_url, session_token, "/bank/withdraw", items, stone_coins)


static func _bank_transaction_request(base_url: String, session_token: String, path: String, items: Array[Dictionary], stone_coins: int) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s%s" % [normalized_base_url(base_url), path],
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({
			"items": bank_transfer_request_items(items),
			"stoneCoins": maxi(0, stone_coins),
		}),
	})


static func bank_transfer_request_items(items: Array[Dictionary]) -> Array[Dictionary]:
	# The server re-reads the trusted equipment envelope.  The client may select
	# an instance/envelope identity, but it must never echo the envelope body or
	# instance state back as transfer authority.
	var result: Array[Dictionary] = []
	for raw_item in items:
		var item_id := str(raw_item.get("itemId", "")).strip_edges()
		var instance_id := str(raw_item.get("instanceId", "")).strip_edges()
		var envelope_id := str(raw_item.get("envelopeId", "")).strip_edges()
		if item_id == "" or (instance_id != "" and envelope_id != ""):
			continue
		var count := 1 if instance_id != "" or envelope_id != "" else maxi(0, int(raw_item.get("count", 0)))
		if count <= 0:
			continue
		var item := {
			"itemId": item_id,
			"count": count,
		}
		if instance_id != "":
			item["instanceId"] = instance_id
		if envelope_id != "":
			item["envelopeId"] = envelope_id
		for key in ["sourceSlotIndex", "targetSlotIndex", "bankSlotIndex"]:
			var index := int(raw_item.get(key, -1))
			if index >= 0:
				item[key] = index
		result.append(item)
	return result


static func market_listings_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/market/listings" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func market_create_listing_request(base_url: String, session_token: String, item_id: String, count: int, unit_price: int, currency: String) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/market/list" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({
			"itemId": item_id,
			"count": maxi(1, count),
			"unitPrice": maxi(1, unit_price),
			"currency": currency,
		}),
	})


static func market_create_equipment_listing_request(
	base_url: String,
	session_token: String,
	item_id: String,
	instance_id: String,
	source_slot_index: int,
	unit_price: int,
	currency: String
) -> Dictionary:
	# Equipment state is display-only on the client.  The request carries only a
	# concrete selection intent; the server resolves and escrows the instance.
	return _durable_mutation_request({
		"url": "%s/market/list" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({
			"itemId": item_id,
			"count": 1,
			"instanceId": instance_id,
			"sourceSlotIndex": source_slot_index,
			"unitPrice": maxi(1, unit_price),
			"currency": currency,
		}),
	})


static func market_buy_listing_request(base_url: String, session_token: String, listing_id: String) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/market/buy" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({"listingId": listing_id}),
	})


static func market_cancel_listing_request(base_url: String, session_token: String, listing_id: String) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/market/cancel" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({"listingId": listing_id}),
	})


static func trade_propose_request(base_url: String, session_token: String, target_username: String, items: Array[Dictionary], stone_coins: int = 0) -> Dictionary:
	return {
		"url": "%s/trade/propose" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({
			"targetUsername": target_username,
			"items": trade_transfer_request_items(items),
			"stoneCoins": maxi(0, stone_coins),
		}),
	}


static func trade_accept_request(base_url: String, session_token: String, trade_id: String, items: Array[Dictionary] = [], stone_coins: int = 0) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/trade/accept" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({
			"tradeId": trade_id,
			"items": trade_transfer_request_items(items),
			"stoneCoins": maxi(0, stone_coins),
		}),
	})


static func trade_transfer_request_items(items: Array[Dictionary]) -> Array[Dictionary]:
	# Legacy direct trade stays hidden from normal UI.  Compatibility callers may
	# select a concrete backpack instance, but never send an envelope, fingerprint,
	# instance state, or provenance back to the authority server.
	var result: Array[Dictionary] = []
	for raw_item in items:
		var item_id := str(raw_item.get("itemId", "")).strip_edges()
		if item_id == "":
			continue
		var instance_id := str(raw_item.get("instanceId", "")).strip_edges()
		var count := 1 if instance_id != "" else maxi(0, int(raw_item.get("count", 0)))
		if count <= 0:
			continue
		var item := {
			"itemId": item_id,
			"count": count,
		}
		if instance_id != "":
			item["instanceId"] = instance_id
			var source_slot_index := int(raw_item.get("sourceSlotIndex", -1))
			if source_slot_index >= 0:
				item["sourceSlotIndex"] = source_slot_index
		result.append(item)
	return result


static func trade_state_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/trade/state" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func trade_cancel_request(base_url: String, session_token: String, trade_id: String) -> Dictionary:
	return {
		"url": "%s/trade/cancel" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({"tradeId": trade_id}),
	}


static func equipment_equip_request(base_url: String, session_token: String, item_id: String) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/equipment/equip" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({
			"itemId": item_id,
		}),
	})


static func equipment_unequip_request(base_url: String, session_token: String, slot_id: String) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/equipment/unequip" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({
			"slotId": slot_id,
		}),
	})


static func equipment_enhance_request(base_url: String, session_token: String, slot_id: String) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/equipment/enhance" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({
			"slotId": slot_id,
		}),
	})


static func equipment_repair_all_request(base_url: String, session_token: String) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/equipment/repair-all" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": "",
	})


static func equipment_synthesize_request(base_url: String, session_token: String, recipe_id: String) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/equipment/synthesize" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({
			"recipeId": recipe_id,
		}),
	})


static func player_rebirth_request(base_url: String, session_token: String) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/player/rebirth" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": "",
	})


static func quest_record_request(base_url: String, session_token: String, event: Dictionary, quest_id: String = "") -> Dictionary:
	var payload := {
		"event": event,
	}
	if quest_id.strip_edges() != "":
		payload["questId"] = quest_id.strip_edges()
	return _durable_mutation_request({
		"url": "%s/quests/record" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify(payload),
	})


static func quest_claim_request(base_url: String, session_token: String, quest_id: String = "", reward_choice_id: String = "") -> Dictionary:
	var payload := {}
	if quest_id.strip_edges() != "":
		payload["questId"] = quest_id.strip_edges()
	if reward_choice_id.strip_edges() != "":
		payload["rewardChoiceId"] = reward_choice_id.strip_edges()
	return _durable_mutation_request({
		"url": "%s/quests/claim" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify(payload),
	})


static func player_search_request(base_url: String, session_token: String, username: String) -> Dictionary:
	return {
		"url": "%s/players/search?username=%s" % [normalized_base_url(base_url), username.uri_encode()],
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func online_players_request(base_url: String, session_token: String, scope: String = "", aoi: Dictionary = {}) -> Dictionary:
	var url := "%s/players/online" % normalized_base_url(base_url)
	var query := PackedStringArray()
	var normalized_scope := scope.strip_edges()
	if normalized_scope != "":
		query.append("scope=%s" % normalized_scope.uri_encode())
	if aoi.has("mapId"):
		query.append("mapId=%s" % str(aoi.get("mapId", "")).uri_encode())
	if aoi.has("cellX"):
		query.append("cellX=%s" % str(aoi.get("cellX", "")).uri_encode())
	if aoi.has("cellY"):
		query.append("cellY=%s" % str(aoi.get("cellY", "")).uri_encode())
	if aoi.has("radius"):
		query.append("radius=%s" % str(aoi.get("radius", "")).uri_encode())
	if not query.is_empty():
		url += "?%s" % "&".join(query)
	return {
		"url": url,
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func player_position_update_request(base_url: String, session_token: String, position: Dictionary) -> Dictionary:
	return {
		"url": "%s/players/position" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify(position),
	}


static func movement_step_request(base_url: String, session_token: String, step: Dictionary) -> Dictionary:
	return {
		"url": "%s/movement/step" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify(step),
	}


static func event_stream_url(base_url: String, session_token: String, last_event_seq: int = 0) -> String:
	var url := normalized_base_url(base_url)
	if url.begins_with("https://"):
		url = "wss://" + url.substr("https://".length())
	elif url.begins_with("http://"):
		url = "ws://" + url.substr("http://".length())
	var query := "%s&token=%s" % [protocol_query(), session_token.uri_encode()]
	if last_event_seq > 0:
		query += "&lastEventSeq=%d" % last_event_seq
	return "%s/events?%s" % [url, query]


static func event_latest_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/events/latest" % normalized_base_url(base_url),
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func party_state_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/party/state" % normalized_base_url(base_url),
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func party_invite_request(base_url: String, session_token: String, username: String) -> Dictionary:
	return {
		"url": "%s/party/invite" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({"username": username}),
	}


static func party_apply_request(base_url: String, session_token: String, username: String) -> Dictionary:
	return {
		"url": "%s/party/apply" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({"username": username}),
	}


static func party_invite_accept_request(base_url: String, session_token: String, invite_id: String) -> Dictionary:
	return _party_invite_action_request(base_url, session_token, invite_id, "accept")


static func party_invite_decline_request(base_url: String, session_token: String, invite_id: String) -> Dictionary:
	return _party_invite_action_request(base_url, session_token, invite_id, "decline")


static func party_leave_request(base_url: String, session_token: String) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/party/leave" % normalized_base_url(base_url),
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": "",
	})


static func family_state_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/families/state" % normalized_base_url(base_url),
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func family_list_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/families" % normalized_base_url(base_url),
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func family_create_request(base_url: String, session_token: String, family_name: String) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/families/create" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({"name": family_name}),
	})


static func family_join_request(base_url: String, session_token: String, family_id: String) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/families/join" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({"familyId": family_id}),
	})


static func family_leave_request(base_url: String, session_token: String) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/families/leave" % normalized_base_url(base_url),
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": "",
	})


static func manor_list_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/manors" % normalized_base_url(base_url),
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func manor_challenge_request(base_url: String, session_token: String, manor_id: String) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/manors/challenge" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({"manorId": manor_id}),
	})


static func manor_enter_request(base_url: String, session_token: String, war_id: String) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/manors/enter" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({"warId": war_id}),
	})


static func manor_battle_room_request(base_url: String, session_token: String, war_id: String) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/manors/battle-room" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({"warId": war_id}),
	})


static func manor_leave_request(base_url: String, session_token: String, war_id: String) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/manors/leave" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({"warId": war_id}),
	})


static func manor_resolve_request(base_url: String, session_token: String, war_id: String) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/manors/resolve" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({"warId": war_id}),
	})


static func battle_state_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/battle/state" % normalized_base_url(base_url),
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func battle_record_summary_request(base_url: String, session_token: String, username: String) -> Dictionary:
	return {
		"url": "%s/battle/records/summary?username=%s" % [normalized_base_url(base_url), username.uri_encode()],
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func battle_invite_request(base_url: String, session_token: String, username: String) -> Dictionary:
	return {
		"url": "%s/battle/invite" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({"username": username}),
	}


static func party_battle_encounter_request(base_url: String, session_token: String, encounter_zone: Dictionary, _enemy_count: int, encounter_permit_token: String = "") -> Dictionary:
	var intent := {}
	var zone_id := str(encounter_zone.get("id", encounter_zone.get("zoneId", ""))).strip_edges()
	var group_id := str(encounter_zone.get("encounterGroupId", encounter_zone.get("groupId", ""))).strip_edges()
	var interaction_id := str(encounter_zone.get("sourceInteractionId", encounter_zone.get("interactionId", ""))).strip_edges()
	if zone_id != "":
		intent["zoneId"] = zone_id
	if group_id != "":
		intent["encounterGroupId"] = group_id
	if interaction_id != "":
		intent["sourceInteractionId"] = interaction_id
	var body := {"encounterIntent": intent}
	var permit_token := encounter_permit_token.strip_edges()
	if permit_token != "":
		body["encounterPermitToken"] = permit_token
	return {
		"url": "%s/battle/party-encounter" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify(body),
	}


static func hang_session_start_request(base_url: String, session_token: String, mode: String, map_id: String, cell: Vector2i, settings: Dictionary = {}, item_id: String = "") -> Dictionary:
	var body := {
		"mode": mode,
		"mapId": map_id,
		"originMapId": map_id,
		"originCell": [cell.x, cell.y],
		"cellX": cell.x,
		"cellY": cell.y,
		"settings": settings,
	}
	if item_id.strip_edges() != "":
		body["itemId"] = item_id.strip_edges()
	return _durable_mutation_request({
		"url": "%s/hang/session/start" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify(body),
	})


static func hang_session_stop_request(base_url: String, session_token: String, reason: String = "manual", pending_resume: bool = false) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/hang/session/stop" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({
			"reason": reason,
			"pendingResume": pending_resume,
		}),
	})


static func offline_hang_status_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/hang/offline/status" % normalized_base_url(base_url),
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func offline_hang_start_request(base_url: String, session_token: String, map_id: String, cell: Vector2i) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/hang/offline/start" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({"mapId": map_id, "cellX": cell.x, "cellY": cell.y}),
	})


static func offline_hang_claim_request(base_url: String, session_token: String, session_id: String) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/hang/offline/claim" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({"sessionId": session_id}),
	})


static func offline_hang_cancel_request(base_url: String, session_token: String) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/hang/offline/cancel" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": "{}",
	})


static func gm_offline_hang_config_request(base_url: String, session_token: String, config: Dictionary = {}) -> Dictionary:
	var read_only := config.is_empty()
	var spec := {
		"url": "%s/gm/hang/offline/config" % normalized_base_url(base_url),
		"headers": _auth_headers(session_token) if read_only else _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_GET if read_only else HTTPClient.METHOD_PUT,
		"body": "" if read_only else JSON.stringify(config),
	}
	return spec if read_only else _durable_mutation_request(spec)


static func battle_invite_accept_request(base_url: String, session_token: String, invite_id: String) -> Dictionary:
	return _battle_invite_action_request(base_url, session_token, invite_id, "accept")


static func battle_invite_decline_request(base_url: String, session_token: String, invite_id: String) -> Dictionary:
	return _battle_invite_action_request(base_url, session_token, invite_id, "decline")


static func battle_invite_cancel_request(base_url: String, session_token: String, invite_id: String) -> Dictionary:
	return _battle_invite_action_request(base_url, session_token, invite_id, "cancel")


static func battle_room_leave_request(base_url: String, session_token: String, room_id: String) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/battle/rooms/%s/leave" % [normalized_base_url(base_url), room_id.uri_encode()],
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": "",
	})


static func battle_command_submit_request(base_url: String, session_token: String, room_id: String, command: Dictionary) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/battle/rooms/%s/commands" % [normalized_base_url(base_url), room_id.uri_encode()],
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify(command),
	})


static func mail_inbox_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/mail/inbox" % normalized_base_url(base_url),
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func mail_send_request(base_url: String, session_token: String, recipient_username: String, title: String, body: String) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/mail/send" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({
			"recipientUsername": recipient_username,
			"title": title,
			"body": body,
		}),
	})


static func mail_read_request(base_url: String, session_token: String, mail_id: String) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/mail/%s/read" % [normalized_base_url(base_url), mail_id.uri_encode()],
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": "",
	})


static func mail_claim_request(base_url: String, session_token: String, mail_id: String) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/mail/%s/claim" % [normalized_base_url(base_url), mail_id.uri_encode()],
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": "",
	})


static func chat_messages_request(base_url: String, session_token: String, channel: String, limit: int = 50) -> Dictionary:
	return {
		"url": "%s/chat/messages?channel=%s&limit=%d" % [normalized_base_url(base_url), channel.uri_encode(), clampi(limit, 1, 50)],
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func chat_send_request(base_url: String, session_token: String, channel: String, text: String) -> Dictionary:
	return _durable_mutation_request({
		"url": "%s/chat/send" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({
			"channel": channel,
			"text": text,
		}),
	})


static func parse_auth_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var text := body.get_string_from_utf8()
	if text.strip_edges() == "":
		return {"ok": false, "message": player_message_for_code("bad_json", "服务器返回为空。"), "code": "bad_json"}
	var parsed = JSON.parse_string(text)
	if not (parsed is Dictionary):
		return {"ok": false, "message": player_message_for_code("bad_json", "服务器返回格式不正确。"), "code": "bad_json"}
	var data := parsed as Dictionary
	if response_code < 200 or response_code >= 300 or not bool(data.get("ok", false)):
		var code := str(data.get("code", "server_error"))
		return {
			"ok": false,
			"message": player_message_for_code(code, str(data.get("message", "服务器登录失败。"))),
			"code": code,
			"response": data,
		}
	var account := data.get("account", {}) as Dictionary if data.get("account", {}) is Dictionary else {}
	var session := data.get("session", {}) as Dictionary if data.get("session", {}) is Dictionary else {}
	var username := AccountAuthModel.normalized_username(str(account.get("username", session.get("username", ""))))
	var display_name := str(account.get("displayName", username))
	var role := str(account.get("role", AccountAuthModel.ROLE_PLAYER))
	var effective_role := str(session.get("effectiveRole", AccountAuthModel.EFFECTIVE_ROLE_PLAYER))
	if username == "":
		return {"ok": false, "message": player_message_for_code("missing_username", "服务器会话缺少账号。"), "code": "missing_username"}
	var runtime_position := data.get("runtimePosition", {}) as Dictionary if data.get("runtimePosition", {}) is Dictionary else {}
	var local_session := {
		"accountId": str(account.get("accountId", "")),
		"username": username,
		"displayName": display_name,
		"role": role,
		"effectiveRole": effective_role,
		"gmPluginInstalled": false,
		"profileSavePath": profile_save_path_for_username(username),
		"authSource": SOURCE_SERVER,
		"serverSessionId": str(session.get("sessionId", "")),
		"serverSessionToken": str(session.get("token", "")),
		"serverExpiresAt": str(session.get("expiresAt", "")),
		"passwordUpgradeRequired": bool(session.get("passwordUpgradeRequired", false)),
		"passwordPolicyMessage": str(session.get("passwordPolicyMessage", "")),
		"serverProfileBinding": data.get("profileBinding", {}),
		"serverProfileSummary": data.get("profileSummary", {}),
		"serverRuntimePosition": runtime_position,
	}
	return {
		"ok": true,
		"message": str(data.get("message", "已连接服务器。")),
		"session": local_session,
		"account": account,
		"response": data,
	}


static func parse_logout_response(response_code: int, body: PackedByteArray) -> Dictionary:
	return _parse_server_json(response_code, body, "退出登录失败。")


static func parse_player_search_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "玩家搜索失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var players: Array[Dictionary] = []
	var raw_players = (parsed.get("response", {}) as Dictionary).get("players", [])
	if raw_players is Array:
		for value in raw_players:
			if value is Dictionary:
				players.append((value as Dictionary).duplicate(true))
	parsed["players"] = players
	return parsed


static func parse_online_players_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "在线玩家读取失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["players"] = _dictionary_array(response.get("players", []))
	parsed["party"] = response.get("party", null)
	parsed["aoi"] = response.get("aoi", {}) if response.get("aoi", {}) is Dictionary else {}
	return parsed


static func parse_player_position_update_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "位置同步失败。")
	var response := parsed.get("response", {}) as Dictionary
	parsed["position"] = response.get("position", {}) if response.get("position", {}) is Dictionary else {}
	parsed["players"] = _dictionary_array(response.get("players", []))
	parsed["party"] = response.get("party", null)
	parsed["aoi"] = response.get("aoi", {}) if response.get("aoi", {}) is Dictionary else {}
	parsed["movement"] = response.get("movement", {}) if response.get("movement", {}) is Dictionary else {}
	return parsed


static func parse_movement_step_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "移动提交失败。")
	var response := parsed.get("response", {}) as Dictionary
	parsed["position"] = response.get("position", {}) if response.get("position", {}) is Dictionary else {}
	parsed["players"] = _dictionary_array(response.get("players", []))
	parsed["party"] = response.get("party", null)
	parsed["aoi"] = response.get("aoi", {}) if response.get("aoi", {}) is Dictionary else {}
	parsed["authority"] = str(response.get("authority", ""))
	parsed["movement"] = response.get("movement", {}) if response.get("movement", {}) is Dictionary else {}
	parsed["encounterPermit"] = response.get("encounterPermit", {}) if response.get("encounterPermit", {}) is Dictionary else {}
	return parsed


static func parse_event_stream_message(packet: PackedByteArray) -> Dictionary:
	var text := packet.get_string_from_utf8()
	var parsed = JSON.parse_string(text)
	if not (parsed is Dictionary):
		return {"ok": false, "message": "服务器事件格式不正确。", "code": "bad_event_json"}
	var event := parsed as Dictionary
	return {
		"ok": true,
		"event": event,
		"type": str(event.get("type", "")),
	}


static func parse_event_latest_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "事件游标读取失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["latestEventSeq"] = int(response.get("latestEventSeq", 0))
	return parsed


static func parse_party_state_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "队伍状态读取失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["party"] = response.get("party", null)
	parsed["incomingInvites"] = _dictionary_array(response.get("incomingInvites", []))
	parsed["maxMembers"] = int(response.get("maxMembers", 5))
	return parsed


static func parse_party_action_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "队伍操作失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["party"] = response.get("party", null)
	parsed["invite"] = response.get("invite", {}) if response.get("invite", {}) is Dictionary else {}
	parsed["incomingInvites"] = _dictionary_array(response.get("incomingInvites", []))
	return parsed


static func parse_family_state_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "家族状态读取失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["family"] = response.get("family", null)
	parsed["manors"] = _dictionary_array(response.get("manors", []))
	parsed["wars"] = _dictionary_array(response.get("wars", []))
	return parsed


static func parse_family_list_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "家族列表读取失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["families"] = _dictionary_array(response.get("families", []))
	return parsed


static func parse_family_action_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "家族操作失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["family"] = response.get("family", null)
	parsed["manors"] = _dictionary_array(response.get("manors", []))
	parsed["wars"] = _dictionary_array(response.get("wars", []))
	return parsed


static func parse_manor_list_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "庄园列表读取失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["family"] = response.get("family", null)
	parsed["manors"] = _dictionary_array(response.get("manors", []))
	parsed["wars"] = _dictionary_array(response.get("wars", []))
	return parsed


static func parse_manor_challenge_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "庄园战失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["war"] = response.get("war", {}) if response.get("war", {}) is Dictionary else {}
	parsed["battle"] = response.get("battle", {}) if response.get("battle", {}) is Dictionary else {}
	parsed["family"] = response.get("family", null)
	parsed["manor"] = response.get("manor", {}) if response.get("manor", {}) is Dictionary else {}
	parsed["manors"] = _dictionary_array(response.get("manors", []))
	parsed["wars"] = _dictionary_array(response.get("wars", []))
	return parsed


static func parse_manor_war_action_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "庄园战参战失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["war"] = response.get("war", {}) if response.get("war", {}) is Dictionary else {}
	parsed["family"] = response.get("family", null)
	parsed["manor"] = response.get("manor", {}) if response.get("manor", {}) is Dictionary else {}
	parsed["manors"] = _dictionary_array(response.get("manors", []))
	parsed["wars"] = _dictionary_array(response.get("wars", []))
	return parsed


static func parse_manor_battle_room_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "庄园战入场失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["room"] = response.get("room", null)
	parsed["war"] = response.get("war", {}) if response.get("war", {}) is Dictionary else {}
	parsed["manor"] = response.get("manor", {}) if response.get("manor", {}) is Dictionary else {}
	parsed["manors"] = _dictionary_array(response.get("manors", []))
	parsed["wars"] = _dictionary_array(response.get("wars", []))
	return parsed


static func parse_manor_resolve_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "庄园战结算失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["war"] = response.get("war", {}) if response.get("war", {}) is Dictionary else {}
	parsed["battle"] = response.get("battle", {}) if response.get("battle", {}) is Dictionary else {}
	parsed["family"] = response.get("family", null)
	parsed["manor"] = response.get("manor", {}) if response.get("manor", {}) is Dictionary else {}
	parsed["manors"] = _dictionary_array(response.get("manors", []))
	parsed["wars"] = _dictionary_array(response.get("wars", []))
	return parsed


static func parse_battle_state_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "切磋状态读取失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["room"] = response.get("room", null)
	parsed["incomingInvites"] = _dictionary_array(response.get("incomingInvites", []))
	parsed["outgoingInvites"] = _dictionary_array(response.get("outgoingInvites", []))
	return parsed


static func parse_battle_record_summary_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "对战战绩读取失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["summary"] = response.get("summary", {}) if response.get("summary", {}) is Dictionary else {}
	return parsed


static func parse_battle_action_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "切磋操作失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["room"] = response.get("room", null)
	parsed["invite"] = response.get("invite", {}) if response.get("invite", {}) is Dictionary else {}
	parsed["result"] = response.get("result", {}) if response.get("result", {}) is Dictionary else {}
	return parsed


static func parse_battle_command_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "回合命令提交失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["room"] = response.get("room", null)
	parsed["command"] = response.get("command", {}) if response.get("command", {}) is Dictionary else {}
	parsed["turn"] = response.get("turn", null)
	parsed["result"] = response.get("result", {}) if response.get("result", {}) is Dictionary else {}
	if not bool(parsed.get("ok", false)):
		return parsed
	return parsed


static func parse_mail_inbox_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "邮箱读取失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var messages: Array[Dictionary] = []
	var raw_messages = (parsed.get("response", {}) as Dictionary).get("messages", [])
	if raw_messages is Array:
		for value in raw_messages:
			if value is Dictionary:
				messages.append((value as Dictionary).duplicate(true))
	parsed["messages"] = messages
	parsed["unreadCount"] = int((parsed.get("response", {}) as Dictionary).get("unreadCount", 0))
	return parsed


static func parse_mail_send_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "邮件发送失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["mail"] = response.get("mail", {}) if response.get("mail", {}) is Dictionary else {}
	return parsed


static func parse_mail_read_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "邮件标记失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["mail"] = response.get("mail", {}) if response.get("mail", {}) is Dictionary else {}
	return parsed


static func parse_mail_claim_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "邮件附件领取失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["mail"] = response.get("mail", null)
	parsed["claim"] = response.get("claim", {}) if response.get("claim", {}) is Dictionary else {}
	parsed["battleRoom"] = response.get("battleRoom", null)
	parsed["questMessages"] = _string_array(response.get("questMessages", []))
	return parsed


static func parse_chat_messages_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "聊天读取失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["channel"] = str(response.get("channel", "nearby"))
	parsed["messages"] = _dictionary_array(response.get("messages", []))
	parsed["party"] = response.get("party", null)
	return parsed


static func parse_chat_send_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "消息发送失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["message"] = response.get("message", {}) if response.get("message", {}) is Dictionary else {}
	parsed["party"] = response.get("party", null)
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["questMessages"] = _string_array(response.get("questMessages", []))
	return parsed


static func parse_profile_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var text := body.get_string_from_utf8()
	var parsed = JSON.parse_string(text)
	if not (parsed is Dictionary):
		return {"ok": false, "message": player_message_for_code("bad_json", "服务器档案返回格式不正确。"), "code": "bad_json"}
	var data := parsed as Dictionary
	if response_code < 200 or response_code >= 300 or not bool(data.get("ok", false)):
		var code := str(data.get("code", "server_error"))
		return {
			"ok": false,
			"message": player_message_for_code(code, str(data.get("message", "服务器档案读取失败。"))),
			"code": code,
			"response": data,
		}
	return {
		"ok": true,
		"profile": data.get("profile", null),
		"profileBinding": data.get("profileBinding", {}),
		"profileSummary": data.get("profileSummary", {}),
		"message": str(data.get("message", "已读取服务器档案摘要。")),
		"response": data,
	}


static func parse_profile_upload_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var text := body.get_string_from_utf8()
	var parsed = JSON.parse_string(text)
	if not (parsed is Dictionary):
		return {"ok": false, "message": player_message_for_code("bad_json", "服务器保存返回格式不正确。"), "code": "bad_json"}
	var data := parsed as Dictionary
	if response_code < 200 or response_code >= 300 or not bool(data.get("ok", false)):
		var code := str(data.get("code", "server_error"))
		return {
			"ok": false,
			"message": player_message_for_code(code, str(data.get("message", "服务器档案保存失败。"))),
			"code": code,
			"profileSummary": data.get("profileSummary", {}),
			"profileBinding": data.get("profileBinding", {}),
			"response": data,
		}
	return {
		"ok": true,
		"profileBinding": data.get("profileBinding", {}),
		"profileSummary": data.get("profileSummary", {}),
		"message": str(data.get("message", "角色档案已同步。")),
		"response": data,
	}


static func parse_profile_action_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "档案操作失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["result"] = response.get("result", {}) if response.get("result", {}) is Dictionary else {}
	parsed["logLines"] = _string_array(response.get("logLines", []))
	parsed["questMessages"] = _string_array(response.get("questMessages", []))
	return parsed


static func parse_gm_command_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "GM宠物操作失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["result"] = response.get("result", {}) if response.get("result", {}) is Dictionary else {}
	parsed["logLines"] = _string_array(response.get("logLines", []))
	parsed["auditId"] = str(response.get("auditId", ""))
	parsed.erase("response")
	return parsed


static func parse_hang_session_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "挂机同步失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["hang"] = response.get("hang", {}) if response.get("hang", {}) is Dictionary else {}
	parsed["questMessages"] = _string_array(response.get("questMessages", []))
	return parsed


static func parse_offline_hang_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "离线挂机同步失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["config"] = response.get("config", {}) if response.get("config", {}) is Dictionary else {}
	parsed["offlineHang"] = response.get("offlineHang", {}) if response.get("offlineHang", {}) is Dictionary else {}
	parsed["claim"] = response.get("claim", {}) if response.get("claim", {}) is Dictionary else {}
	parsed["idempotent"] = bool(response.get("idempotent", false))
	parsed["auditId"] = str(response.get("auditId", ""))
	return parsed


static func parse_shop_transaction_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "商店交易失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["transaction"] = response.get("transaction", {}) if response.get("transaction", {}) is Dictionary else {}
	parsed["questMessages"] = _string_array(response.get("questMessages", []))
	return parsed


static func parse_bank_transaction_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "仓库操作失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["bank"] = response.get("bank", {}) if response.get("bank", {}) is Dictionary else {}
	parsed["transaction"] = response.get("transaction", {}) if response.get("transaction", {}) is Dictionary else {}
	return parsed


static func parse_market_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "交易所操作失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["market"] = response.get("market", {}) if response.get("market", {}) is Dictionary else {}
	parsed["listing"] = response.get("listing", {}) if response.get("listing", {}) is Dictionary else {}
	parsed["receipt"] = response.get("receipt", {}) if response.get("receipt", {}) is Dictionary else {}
	parsed["saleMail"] = response.get("saleMail", null)
	parsed["questMessages"] = _string_array(response.get("questMessages", []))
	return parsed


static func parse_trade_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "交易失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["trade"] = response.get("trade", {}) if response.get("trade", {}) is Dictionary else {}
	parsed["trades"] = response.get("trades", {}) if response.get("trades", {}) is Dictionary else {}
	parsed["otherProfileSummary"] = response.get("otherProfileSummary", {}) if response.get("otherProfileSummary", {}) is Dictionary else {}
	return parsed


static func parse_equipment_equip_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "装备失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["equipment"] = response.get("equipment", {}) if response.get("equipment", {}) is Dictionary else {}
	parsed["questMessages"] = _string_array(response.get("questMessages", []))
	return parsed


static func parse_equipment_unequip_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "卸下失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["equipment"] = response.get("equipment", {}) if response.get("equipment", {}) is Dictionary else {}
	return parsed


static func parse_equipment_enhance_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "强化失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["enhancement"] = response.get("enhancement", {}) if response.get("enhancement", {}) is Dictionary else {}
	parsed["questMessages"] = _string_array(response.get("questMessages", []))
	return parsed


static func parse_equipment_repair_all_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "修理失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["repair"] = response.get("repair", {}) if response.get("repair", {}) is Dictionary else {}
	return parsed


static func parse_equipment_synthesize_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "合成失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["synthesis"] = response.get("synthesis", {}) if response.get("synthesis", {}) is Dictionary else {}
	parsed["questMessages"] = _string_array(response.get("questMessages", []))
	return parsed


static func parse_player_rebirth_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "转生失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["rebirth"] = response.get("rebirth", {}) if response.get("rebirth", {}) is Dictionary else {}
	parsed["returnEntry"] = response.get("returnEntry", {}) if response.get("returnEntry", {}) is Dictionary else {}
	return parsed


static func parse_quest_action_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "任务同步失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["progress"] = response.get("progress", {}) if response.get("progress", {}) is Dictionary else {}
	parsed["claim"] = response.get("claim", {}) if response.get("claim", {}) is Dictionary else {}
	parsed["questMessages"] = _string_array(response.get("questMessages", []))
	return parsed


static func _parse_server_json(response_code: int, body: PackedByteArray, fallback_message: String) -> Dictionary:
	var text := body.get_string_from_utf8()
	if text.strip_edges() == "":
		return {"ok": false, "message": player_message_for_code("bad_json", "服务器返回为空。"), "code": "bad_json", "response": {}}
	var parsed = JSON.parse_string(text)
	if not (parsed is Dictionary):
		return {"ok": false, "message": player_message_for_code("bad_json", "服务器返回格式不正确。"), "code": "bad_json"}
	var data := parsed as Dictionary
	if response_code < 200 or response_code >= 300 or not bool(data.get("ok", false)):
		var code := str(data.get("code", "server_error"))
		return {
			"ok": false,
			"message": player_message_for_code(code, str(data.get("message", fallback_message))),
			"code": code,
			"response": data,
		}
	return {
		"ok": true,
		"message": str(data.get("message", "")),
		"response": data,
	}


static func _dictionary_array(value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if value is Array:
		for entry in value:
			if entry is Dictionary:
				result.append((entry as Dictionary).duplicate(true))
	return result


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for entry in value:
			var text := str(entry)
			if text != "":
				result.append(text)
	return result


static func profile_save_path_for_username(username: String) -> String:
	var normalized := AccountAuthModel.normalized_username(username)
	if normalized == "":
		normalized = "player"
	return "user://server_accounts/%s/player_profile.json" % normalized


static func _auth_request(base_url: String, endpoint: String, payload: Dictionary) -> Dictionary:
	return {
		"url": "%s%s" % [normalized_base_url(base_url), endpoint],
		"headers": _json_headers(),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify(payload),
	}


static func _party_invite_action_request(base_url: String, session_token: String, invite_id: String, action: String) -> Dictionary:
	var spec := {
		"url": "%s/party/invites/%s/%s" % [normalized_base_url(base_url), invite_id.uri_encode(), action],
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": "",
	}
	return _durable_mutation_request(spec) if action == "accept" else spec


static func _battle_invite_action_request(base_url: String, session_token: String, invite_id: String, action: String) -> Dictionary:
	return {
		"url": "%s/battle/invites/%s/%s" % [normalized_base_url(base_url), invite_id.uri_encode(), action],
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": "",
	}
