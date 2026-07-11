extends RefCounted

const AccountAuthModel := preload("res://scripts/progression/account_auth_model.gd")
const GmToolPluginModel := preload("res://scripts/progression/gm_tool_plugin_model.gd")
const GmToolRuntimeModel := preload("res://scripts/progression/gm_tool_runtime_model.gd")

const SCHEMA_VERSION := 1
const CONTRACT_VERSION := "auth_contract_v1"


static func contract() -> Dictionary:
	return {
		"schemaVersion": SCHEMA_VERSION,
		"contractVersion": CONTRACT_VERSION,
		"authority": {
			"current": "node_mysql_server",
			"future": "node_mysql_server",
			"productionGmSource": "server_grants_only",
			"prototypeGmSource": "local_account_plus_plugin",
		},
		"localSources": {
			"accountStorePath": AccountAuthModel.ACCOUNT_STORE_PATH,
			"gmPluginPath": GmToolPluginModel.PLUGIN_PATH,
			"gmAuditPath": GmToolRuntimeModel.AUDIT_PATH,
		},
		"tables": _table_definitions(),
		"tableIds": table_ids(),
		"endpoints": _endpoint_definitions(),
		"endpointIds": endpoint_ids(),
		"securityRules": {
			"serverAuthoritativeGm": true,
			"serverComputesEffectiveRole": true,
			"passwordHashServerOnlyAfterCutover": true,
				"gmCommandRequiresRoleGrantAndAudit": true,
				"localPluginIgnoredInProduction": true,
				"clientMayHideButNeverAuthorizeGm": true,
				"clientCannotUploadFullProfile": true,
				"clientGameplayRequiresServerSession": true,
				"gameplayWritesUseTransactionEndpoints": true,
		},
	}


static func table_ids() -> Array[String]:
	var ids: Array[String] = []
	for table in _table_definitions():
		ids.append(str(table.get("id", "")))
	return ids


static func endpoint_ids() -> Array[String]:
	var ids: Array[String] = []
	for endpoint in _endpoint_definitions():
		ids.append(str(endpoint.get("id", "")))
	return ids


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	_validate_records(errors, "table", _table_definitions(), ["id", "serverTable", "primaryKeys", "writePolicy", "description"])
	_validate_records(errors, "endpoint", _endpoint_definitions(), ["id", "method", "path", "auth", "description"])
	var security := contract().get("securityRules", {}) as Dictionary
	for key in [
		"serverAuthoritativeGm",
		"serverComputesEffectiveRole",
		"passwordHashServerOnlyAfterCutover",
			"gmCommandRequiresRoleGrantAndAudit",
			"localPluginIgnoredInProduction",
			"clientMayHideButNeverAuthorizeGm",
			"clientCannotUploadFullProfile",
			"clientGameplayRequiresServerSession",
			"gameplayWritesUseTransactionEndpoints",
		]:
		if not bool(security.get(key, false)):
			errors.append("securityRules.%s 必须为 true" % key)
	return errors


static func migration_preview() -> Dictionary:
	var account_store := AccountAuthModel.load_store()
	var accounts := account_store.get("accounts", {}) as Dictionary if account_store.get("accounts", {}) is Dictionary else {}
	var gm_accounts := 0
	var player_accounts := 0
	for account_value in accounts.values():
		var account := account_value as Dictionary if account_value is Dictionary else {}
		if str(account.get("role", AccountAuthModel.ROLE_PLAYER)) == AccountAuthModel.ROLE_GM:
			gm_accounts += 1
		else:
			player_accounts += 1
	var plugin := GmToolPluginModel.load_plugin()
	var gm_usernames = plugin.get("gmUsernames", [])
	var gm_commands = plugin.get("gmCommands", [])
	var audit_line_count := _audit_line_count()
	return {
		"schemaVersion": SCHEMA_VERSION,
		"contractVersion": CONTRACT_VERSION,
		"paths": {
			"accountStorePath": AccountAuthModel.ACCOUNT_STORE_PATH,
			"gmPluginPath": GmToolPluginModel.PLUGIN_PATH,
			"gmAuditPath": GmToolRuntimeModel.AUDIT_PATH,
		},
		"counts": {
			"accounts": accounts.size(),
			"playerAccounts": player_accounts,
			"gmAccounts": gm_accounts,
			"gmPluginUsernames": (gm_usernames as Array).size() if gm_usernames is Array else 0,
			"gmPluginCommands": (gm_commands as Array).size() if gm_commands is Array else 0,
			"gmAuditLines": audit_line_count,
			"maxLocalAuditLines": GmToolRuntimeModel.MAX_AUDIT_LINES,
		},
		"pluginInstalled": GmToolPluginModel.installed(),
		"pluginEnabled": bool(plugin.get("enabled", false)) if not plugin.is_empty() else false,
		"errors": validation_errors(),
	}


static func migration_manifest() -> Dictionary:
	return {
		"contract": contract(),
		"preview": migration_preview(),
	}


static func _table_definitions() -> Array[Dictionary]:
	return [
		_table("accounts", "accounts", ["accountId"], "local_accounts_json", "server_only", "账号、展示名、角色和创建时间。密码哈希迁移后只留在服务端。"),
		_table("accountSessions", "account_sessions", ["sessionId"], "runtime_session", "server_only", "登录会话、过期时间、设备信息和撤销状态。"),
		_table("profileBindings", "player_profile_bindings", ["accountId", "playerId"], "profile_save_path", "server_revision", "账号和玩家档案的绑定关系。"),
		_table("gmUserGrants", "gm_user_grants", ["accountId"], "local_plugin_usernames", "server_admin_only", "GM账号授权、有效期和授权来源。"),
		_table("gmCommandGrants", "gm_command_grants", ["accountId", "commandId"], "local_plugin_commands", "server_admin_only", "GM命令白名单，支持按账号或角色授予。"),
		_table("gmCommandAudit", "gm_command_audit", ["auditId"], "gm_tool_audit_jsonl", "append_only", "GM命令执行审计，记录账号、命令、结果和原因。"),
		_table("authEvents", "auth_events", ["eventId"], "runtime_auth_events", "append_only", "注册、登录、登出、失败登录和权限拒绝事件。"),
		_table("families", "families", ["familyId"], "none", "server_only", "家族名称、族长、成员、声望和占领庄园列表。"),
		_table("manors", "manors", ["manorId"], "data/manors.json", "server_authority", "九大庄园占领状态、地图入口、占领家族和庄园道具场权限。"),
		_table("manorWars", "manor_wars", ["warId"], "runtime_manor_wars", "append_only", "庄园战宣战、战期、参战家族和当前状态。"),
		_table("manorBattles", "manor_battles", ["battleId"], "runtime_manor_battles", "append_only", "庄园战结算胜负、双方家族和战力记录。"),
	]


static func _endpoint_definitions() -> Array[Dictionary]:
	return [
		_endpoint("register", "POST", "/auth/register", "public", "注册普通玩家账号。"),
		_endpoint("login", "POST", "/auth/login", "public", "登录并换取服务端会话。"),
		_endpoint("refresh", "POST", "/auth/refresh", "session_refresh", "会话过期宽限期内换取新的服务端 token。"),
		_endpoint("logout", "POST", "/auth/logout", "session", "注销当前会话。"),
		_endpoint("session", "GET", "/auth/session", "session", "查询服务端计算后的账号和 effectiveRole。"),
		_endpoint("profileMe", "GET", "/profiles/me", "session", "读取当前账号绑定的玩家档案。"),
		_endpoint("profileUploadDisabled", "PUT", "/profiles/me", "disabled", "整档上传已退役，普通玩法必须走服务端专用事务接口。"),
		_endpoint("profileAction", "POST", "/profile/action", "session", "服务端白名单校验背包、宠物、记录点、村医和世界道具等玩法动作并回写档案。"),
		_endpoint("shopTransaction", "POST", "/shops/transaction", "session", "服务端校验商店购买/出售并回写档案。"),
		_endpoint("equipmentEquip", "POST", "/equipment/equip", "session", "服务端校验背包装备并回写档案。"),
		_endpoint("equipmentEnhance", "POST", "/equipment/enhance", "session", "服务端校验材料、石币和强化上限后强化已装备物品。"),
		_endpoint("equipmentRepairAll", "POST", "/equipment/repair-all", "session", "服务端校验耐久缺口和石币后修理已装备物品。"),
		_endpoint("equipmentSynthesize", "POST", "/equipment/synthesize", "session", "服务端校验材料、石币和背包空间后合成装备。"),
		_endpoint("playerRebirth", "POST", "/player/rebirth", "session", "服务端校验人物转生条件、试炼材料、奖励和回记录点。"),
		_endpoint("questRecord", "POST", "/quests/record", "session", "服务端记录任务事件并回写任务进度。"),
		_endpoint("questClaim", "POST", "/quests/claim", "session", "服务端领取主线/可选任务奖励并回写档案。"),
		_endpoint("hangSessionStart", "POST", "/hang/session/start", "session", "服务端开启走动挂机或遇敌石挂机，并在遇敌石模式扣除道具。"),
		_endpoint("hangSessionStop", "POST", "/hang/session/stop", "session", "服务端停止挂机会话并回写停止原因。"),
		_endpoint("offlineHangStatus", "GET", "/hang/offline/status", "session", "读取离线修行累计状态、当前配置和最近领取账本。"),
		_endpoint("offlineHangStart", "POST", "/hang/offline/start", "session", "在当前正式练级区开启服务器离线修行并停止在线挂机。"),
		_endpoint("offlineHangClaim", "POST", "/hang/offline/claim", "session", "按服务器唯一会话原子领取离线经验与石币。"),
		_endpoint("offlineHangCancel", "POST", "/hang/offline/cancel", "session", "取消当前离线修行且不产生收益。"),
		_endpoint("familyState", "GET", "/families/state", "session", "读取当前账号的家族和庄园视图。"),
		_endpoint("familyList", "GET", "/families", "session", "读取可加入的家族列表。"),
		_endpoint("familyCreate", "POST", "/families/create", "session", "成立家族并把当前账号设为族长。"),
		_endpoint("familyJoin", "POST", "/families/join", "session", "加入开放家族。"),
		_endpoint("familyLeave", "POST", "/families/leave", "session", "离开家族，最后成员离开时释放庄园。"),
		_endpoint("manorList", "GET", "/manors", "session", "读取九大庄园占领和道具场信息。"),
		_endpoint("manorChallenge", "POST", "/manors/challenge", "family_leader", "族长宣战并登记庄园战期。"),
		_endpoint("manorEnter", "POST", "/manors/enter", "family_member", "参战家族成员加入庄园战名单。"),
		_endpoint("manorLeave", "POST", "/manors/leave", "family_member", "参战成员退出庄园战名单。"),
		_endpoint("manorBattleRoom", "POST", "/manors/battle-room", "family_leader", "参战族长开启庄园战战斗房间，战斗结束后自动结算占领。"),
		_endpoint("manorResolve", "POST", "/manors/resolve", "family_leader", "参战族长开战结算，胜利后占领庄园。"),
		_endpoint("gmTools", "GET", "/gm/tools", "gm_session", "读取当前账号可见的GM工具入口。"),
		_endpoint("gmCommand", "POST", "/gm/commands/{commandId}", "gm_command_grant", "执行GM命令，服务端必须重新鉴权并写审计。"),
		_endpoint("gmOfflineHangConfig", "PUT", "/gm/hang/offline/config", "gm_command_grant", "读取或更新离线收益比例、时长封顶和折算节奏，并写GM审计。"),
	]


static func _table(id: String, server_table: String, primary_keys: Array, local_source: String, write_policy: String, description: String) -> Dictionary:
	return {
		"id": id,
		"serverTable": server_table,
		"primaryKeys": _unique_strings(primary_keys),
		"localSource": local_source,
		"writePolicy": write_policy,
		"description": description,
	}


static func _endpoint(id: String, method: String, path: String, auth: String, description: String) -> Dictionary:
	return {
		"id": id,
		"method": method,
		"path": path,
		"auth": auth,
		"description": description,
	}


static func _validate_records(errors: Array[String], label: String, records: Array[Dictionary], required_keys: Array[String]) -> void:
	var seen := {}
	for record in records:
		var id := str(record.get("id", "")).strip_edges()
		if id == "":
			errors.append("%s.id 不能为空" % label)
		elif seen.has(id):
			errors.append("%s.id 重复: %s" % [label, id])
		seen[id] = true
		for key in required_keys:
			if key == "primaryKeys":
				var primary_keys = record.get("primaryKeys", [])
				if not (primary_keys is Array) or (primary_keys as Array).is_empty():
					errors.append("%s.%s.primaryKeys 不能为空" % [label, id])
			elif str(record.get(key, "")).strip_edges() == "":
				errors.append("%s.%s.%s 不能为空" % [label, id, key])


static func _unique_strings(values: Array) -> Array[String]:
	var result: Array[String] = []
	for value in values:
		var text := str(value).strip_edges()
		if text != "" and not result.has(text):
			result.append(text)
	return result


static func _audit_line_count() -> int:
	if not FileAccess.file_exists(GmToolRuntimeModel.AUDIT_PATH):
		return 0
	var count := 0
	for line in FileAccess.get_file_as_string(GmToolRuntimeModel.AUDIT_PATH).split("\n", false):
		if str(line).strip_edges() != "":
			count += 1
	return count
