extends RefCounted

const NpcArtCatalog := preload("res://scripts/world/npc_art_catalog.gd")
const NpcDialogPresenter := preload("res://scripts/ui/npc_dialog_presenter.gd")
const MapDataCatalog := preload("res://scripts/world/map_data_catalog.gd")
const WorldVisualDirectionContract := preload("res://scripts/world/world_visual_direction_contract.gd")

const REVIEW_APPEARANCE_IDS: Array[String] = [
	"npc_stable_keeper_m_v1",
	"npc_bank_keeper_f_v1",
	"npc_item_shopkeeper_f_v1",
	"npc_manor_steward_m_v1",
	"npc_village_guard_m_v1",
	"npc_village_healer_f_v1",
	"npc_equipment_artisan_m_v1",
	"npc_riding_trainer_f_v1",
]
const EXPECTED_REUSE_COUNTS := {
	"npc_stable_keeper_m_v1": 1,
	"npc_bank_keeper_f_v1": 1,
	"npc_item_shopkeeper_f_v1": 10,
	"npc_manor_steward_m_v1": 9,
	"npc_village_guard_m_v1": 2,
	"npc_village_healer_f_v1": 1,
	"npc_equipment_artisan_m_v1": 1,
	"npc_riding_trainer_f_v1": 1,
}
const EXPECTED_BATCH_CONTRACT := {
	"npc_stable_keeper_m_v1": {"roleId": "stable_keeper", "gender": "male"},
	"npc_bank_keeper_f_v1": {"roleId": "bank_keeper", "gender": "female"},
	"npc_item_shopkeeper_f_v1": {"roleId": "item_shopkeeper", "gender": "female"},
	"npc_manor_steward_m_v1": {"roleId": "manor_steward", "gender": "male"},
	"npc_village_guard_m_v1": {"roleId": "village_guard", "gender": "male"},
	"npc_village_healer_f_v1": {"roleId": "village_healer", "gender": "female"},
	"npc_equipment_artisan_m_v1": {"roleId": "equipment_artisan", "gender": "male"},
	"npc_riding_trainer_f_v1": {"roleId": "riding_trainer", "gender": "female"},
}
const FIXED_MAP_BINDINGS := {
	"firebud_stable_keeper": {
		"mapId": "firebud_village_gate",
		"appearanceId": "npc_stable_keeper_m_v1",
		"roleId": "stable_keeper",
		"facilityType": "stable",
	},
	"firebud_bank_keeper": {
		"mapId": "firebud_village_gate",
		"appearanceId": "npc_bank_keeper_f_v1",
		"roleId": "bank_keeper",
		"facilityType": "bank",
	},
	"firebud_shopkeeper": {
		"mapId": "firebud_village_gate",
		"appearanceId": "npc_item_shopkeeper_f_v1",
		"roleId": "item_shopkeeper",
		"facilityType": "item_shop",
	},
	"village_guard": {
		"mapId": "firebud_village_gate",
		"appearanceId": "npc_village_guard_m_v1",
		"roleId": "village_guard",
		"facilityType": "",
	},
	"block_tester": {
		"mapId": "firebud_training_yard",
		"appearanceId": "npc_village_guard_m_v1",
		"roleId": "village_guard",
		"facilityType": "",
	},
	"firebud_doctor": {
		"mapId": "firebud_village_gate",
		"appearanceId": "npc_village_healer_f_v1",
		"roleId": "village_healer",
		"facilityType": "healer",
	},
	"firebud_equipment_keeper": {
		"mapId": "firebud_village_gate",
		"appearanceId": "npc_equipment_artisan_m_v1",
		"roleId": "equipment_artisan",
		"facilityType": "equipment_shop",
	},
	"firebud_riding_trainer": {
		"mapId": "firebud_village_gate",
		"appearanceId": "npc_riding_trainer_f_v1",
		"roleId": "riding_trainer",
		"facilityType": "riding_trainer",
	},
}


static func run() -> Dictionary:
	var errors: Array[String] = []
	var records := NpcArtCatalog.all_appearance_records()
	var records_by_id: Dictionary = {}
	for record in records:
		var appearance_id := str(record.get("appearanceId", ""))
		records_by_id[appearance_id] = record
	_append_batch_contract_errors(records, records_by_id, errors)
	errors.append_array(NpcArtCatalog.validation_errors(false, false))
	var preview_ids: Array[String] = []
	var preview_warm_success: Dictionary = {}
	for appearance_id in REVIEW_APPEARANCE_IDS:
		if not records_by_id.has(appearance_id):
			errors.append("NPC canary 未登记：%s" % appearance_id)
			continue
		var canary := records_by_id[appearance_id] as Dictionary
		_append_review_state_errors(canary, errors)
		if str(canary.get("status", "")) != NpcArtCatalog.STATUS_APPROVED:
			if NpcArtCatalog.warm_appearance(appearance_id):
				errors.append("未批准 NPC 绕过 QA 开关进入正常运行路径：%s" % appearance_id)
		var preview_warmed := NpcArtCatalog.enable_qa_preview_appearance(appearance_id)
		preview_warm_success[appearance_id] = preview_warmed
		if NpcArtCatalog.is_qa_preview_enabled(appearance_id):
			preview_ids.append(appearance_id)
		if not preview_warmed:
			errors.append("NPC 显式 QA 候选预热失败：%s" % appearance_id)
			errors.append_array(NpcArtCatalog.warm_errors_for(appearance_id))
	for appearance_id in REVIEW_APPEARANCE_IDS:
		if bool(preview_warm_success.get(appearance_id, false)):
			errors.append_array(NpcArtCatalog.validation_errors_for_appearance(appearance_id, true, true))
	var world_frame_count := 0
	var portrait_count := 0
	for appearance_id in REVIEW_APPEARANCE_IDS:
		if not records_by_id.has(appearance_id):
			continue
		var record := records_by_id[appearance_id] as Dictionary
		if not NpcArtCatalog.is_world_ready(appearance_id):
			errors.append("NPC 世界候选未进入显式 QA 缓存：%s" % appearance_id)
		if not NpcArtCatalog.is_portrait_ready(appearance_id):
			errors.append("NPC 人像候选未进入显式 QA 缓存：%s" % appearance_id)
		var mobility := str(record.get("mobility", ""))
		var expects_walk := mobility == NpcArtCatalog.MOBILE_MOBILITY
		if NpcArtCatalog.has_world_action(appearance_id, NpcArtCatalog.WORLD_ACTION_WALK) != expects_walk:
			errors.append("NPC mobility 与 walk4 矩阵不一致：%s" % appearance_id)
		for direction in WorldVisualDirectionContract.DIRECTIONS:
			if NpcArtCatalog.world_view_for_direction(direction) != direction:
				errors.append("NPC 世界方向没有直取独立源图：%s/%s" % [appearance_id, direction])
			if NpcArtCatalog.world_flip_h_for_direction(direction):
				errors.append("NPC 真八方向禁止运行时镜像：%s/%s" % [appearance_id, direction])
			var idle_texture := NpcArtCatalog.world_texture_for_frame(
				appearance_id,
				direction,
				NpcArtCatalog.WORLD_ACTION_IDLE,
				1
			)
			if idle_texture == null:
				errors.append("NPC 八向待机帧未能从缓存读取：%s/%s" % [appearance_id, direction])
			else:
				world_frame_count += 1
			if expects_walk:
				for frame_index in range(1, 5):
					var walk_texture := NpcArtCatalog.world_texture_for_frame(
						appearance_id,
						direction,
						NpcArtCatalog.WORLD_ACTION_WALK,
						frame_index
					)
					if walk_texture == null:
						errors.append("NPC 八向行走帧未能从缓存读取：%s/%s/%d" % [appearance_id, direction, frame_index])
					else:
						world_frame_count += 1
		for state in NpcArtCatalog.PORTRAIT_STATES:
			var portrait := NpcArtCatalog.portrait_texture(appearance_id, state)
			if portrait == null:
				errors.append("NPC 对话人像未能从缓存读取：%s/%s" % [appearance_id, state])
			else:
				portrait_count += 1
		_append_instance_contract_errors(appearance_id, errors)
	var cache_count_after_warm := NpcArtCatalog.cached_texture_count()
	for appearance_id in preview_ids:
		NpcArtCatalog.world_texture_for_frame(appearance_id, "north", "idle", 1)
		NpcArtCatalog.portrait_texture(appearance_id, "speaking")
	if NpcArtCatalog.cached_texture_count() != cache_count_after_warm:
		errors.append("NPC 绘制/对话热路径触发了预热后的资产加载")
	if NpcArtCatalog.world_texture_for_frame("unknown_npc", "south", "idle", 1) != null:
		errors.append("未知 NPC 外观没有失败关闭为空纹理")
	if NpcArtCatalog.portrait_texture("unknown_npc", "neutral") != null:
		errors.append("未知 NPC 人像没有失败关闭为空纹理")
	var release_approved_count := 0
	var runtime_enabled_count := 0
	for record in records:
		if bool(record.get("releaseApproved", false)):
			release_approved_count += 1
		if bool(record.get("runtimeEnabled", false)):
			runtime_enabled_count += 1
	var runtime_mirroring_count := _runtime_mirroring_count(records)
	var map_reference_summary := _map_reference_summary(errors)
	var map_reuse_counts := map_reference_summary.get("reuseCounts", {}) as Dictionary
	for appearance_id in REVIEW_APPEARANCE_IDS:
		var actual_reuse_count := int(map_reuse_counts.get(appearance_id, 0))
		var expected_reuse_count := int(EXPECTED_REUSE_COUNTS.get(appearance_id, 0))
		if actual_reuse_count != expected_reuse_count:
			errors.append("NPC 职业外观地图复用数错误：%s=%d，期望=%d" % [appearance_id, actual_reuse_count, expected_reuse_count])
	var canary_binding_counts := map_reference_summary.get("canaryBindingCounts", {}) as Dictionary
	for npc_id_value in FIXED_MAP_BINDINGS.keys():
		var npc_id := str(npc_id_value)
		if int(canary_binding_counts.get(npc_id, 0)) != 1:
			errors.append("NPC 固定地图岗位绑定必须恰好出现一次：%s" % npc_id)
	for appearance_id in preview_ids:
		NpcArtCatalog.disable_qa_preview_appearance(appearance_id)
		var record := records_by_id.get(appearance_id, {}) as Dictionary
		if str(record.get("status", "")) != NpcArtCatalog.STATUS_APPROVED:
			if NpcArtCatalog.world_texture_for_frame(appearance_id, "south", "idle", 1) != null:
				errors.append("QA 关闭后未批准 NPC 仍可进入正常世界路径：%s" % appearance_id)
			if NpcArtCatalog.portrait_texture(appearance_id, "neutral") != null:
				errors.append("QA 关闭后未批准 NPC 仍可进入正常对话路径：%s" % appearance_id)
	return {
		"ok": errors.is_empty(),
		"appearanceCount": records.size(),
		"releaseRuntimeAppearanceCount": NpcArtCatalog.runtime_appearance_records().size(),
		"catalogRuntimeEnabledCount": runtime_enabled_count,
		"qaPreviewAppearanceCount": preview_ids.size(),
		"releaseApprovedCount": release_approved_count,
		"worldDirections": WorldVisualDirectionContract.DIRECTIONS.size(),
		"worldFrameCount": world_frame_count,
		"portraitStateCount": NpcArtCatalog.PORTRAIT_STATES.size(),
		"portraitCount": portrait_count,
		"runtimeMirroringCount": runtime_mirroring_count,
		"mapNpcArtInstanceCount": int(map_reference_summary.get("instanceCount", 0)),
		"mapAppearanceReuseCounts": map_reference_summary.get("reuseCounts", {}),
		"cachedTextureCount": NpcArtCatalog.cached_texture_count(),
		"errors": errors,
	}


static func _append_batch_contract_errors(
	records: Array[Dictionary],
	records_by_id: Dictionary,
	errors: Array[String]
) -> void:
	if records.size() != REVIEW_APPEARANCE_IDS.size() or records_by_id.size() != REVIEW_APPEARANCE_IDS.size():
		errors.append("首批 NPC 目录必须恰好登记 8 个唯一职业原型")
	var male_count := 0
	var female_count := 0
	for appearance_id in REVIEW_APPEARANCE_IDS:
		var record_value = records_by_id.get(appearance_id, {})
		if not (record_value is Dictionary) or (record_value as Dictionary).is_empty():
			errors.append("首批 NPC 缺少职业原型：%s" % appearance_id)
			continue
		var record := record_value as Dictionary
		var expected := EXPECTED_BATCH_CONTRACT[appearance_id] as Dictionary
		if str(record.get("roleId", "")) != str(expected.get("roleId", "")):
			errors.append("NPC roleId 与首批职业合同不一致：%s" % appearance_id)
		var gender := str(record.get("gender", ""))
		if gender != str(expected.get("gender", "")):
			errors.append("NPC gender 与首批职业合同不一致：%s" % appearance_id)
		male_count += int(gender == "male")
		female_count += int(gender == "female")
		if str(record.get("mobility", "")) != NpcArtCatalog.STATIC_MOBILITY:
			errors.append("首批 NPC 必须全部为 static idle8：%s" % appearance_id)
	if male_count != 4 or female_count != 4:
		errors.append("首批 NPC 必须保持 4 男 4 女：male=%d female=%d" % [male_count, female_count])


static func _append_review_state_errors(record: Dictionary, errors: Array[String]) -> void:
	var appearance_id := str(record.get("appearanceId", ""))
	var status := str(record.get("status", ""))
	if not [
		NpcArtCatalog.STATUS_IN_PRODUCTION,
		NpcArtCatalog.STATUS_OWNER_REVIEW_PENDING,
		NpcArtCatalog.STATUS_APPROVED,
	].has(status):
		errors.append("NPC canary 状态不可评审：%s/%s" % [appearance_id, status])
		return
	if status == NpcArtCatalog.STATUS_APPROVED:
		if (
			str(record.get("ownerReviewStatus", "")) != "approved"
			or not bool(record.get("releaseApproved", false))
			or not bool(record.get("runtimeEnabled", false))
		):
			errors.append("已批准 NPC 的 owner/release/runtime 状态不一致：%s" % appearance_id)
	else:
		if (
			str(record.get("ownerReviewStatus", "")) != "pending"
			or bool(record.get("releaseApproved", false))
			or bool(record.get("runtimeEnabled", false))
		):
			errors.append("未批准 NPC 必须隔离于普通运行路径：%s" % appearance_id)


static func _append_instance_contract_errors(appearance_id: String, errors: Array[String]) -> void:
	var instance := {
		"appearanceId": appearance_id,
		"facing": "northwest",
	}
	if NpcArtCatalog.appearance_id_for_instance(instance) != appearance_id:
		errors.append("NPC 地图实例没有保留共享 appearanceId：%s" % appearance_id)
	if not NpcArtCatalog.instance_has_valid_facing(instance) or NpcArtCatalog.facing_for_instance(instance) != "northwest":
		errors.append("NPC 地图实例没有保留独立 facing：%s" % appearance_id)
	var instance_texture := NpcArtCatalog.world_texture_for_instance(instance)
	var direct_texture := NpcArtCatalog.world_texture_for_frame(appearance_id, "northwest", "idle", 1)
	if instance_texture == null or instance_texture != direct_texture:
		errors.append("NPC 地图实例没有解析到对应职业八向帧：%s" % appearance_id)
	var invalid_instance := {"appearanceId": appearance_id, "facing": "north_east"}
	for invalid_facing in ["north_east", "NORTH", " north "]:
		invalid_instance["facing"] = invalid_facing
		if NpcArtCatalog.instance_has_valid_facing(invalid_instance):
			errors.append("NPC 非 canonical facing 被误判为合法：%s/%s" % [appearance_id, invalid_facing])
		if NpcArtCatalog.world_texture_for_instance(invalid_instance) != null:
			errors.append("NPC 非法 facing 没有失败关闭为空纹理：%s/%s" % [appearance_id, invalid_facing])
	invalid_instance["facing"] = 4
	if NpcArtCatalog.instance_has_valid_facing(invalid_instance):
		errors.append("NPC 非字符串 facing 被误判为合法：%s" % appearance_id)
	var dialog_presentation := NpcDialogPresenter.presentation_for(instance, true)
	if (
		str(dialog_presentation.get("appearanceId", "")) != appearance_id
		or str(dialog_presentation.get("state", "")) != NpcArtCatalog.PORTRAIT_SPEAKING
		or not bool(dialog_presentation.get("visible", false))
	):
		errors.append("NPC 对话 presenter 没有解析 speaking 人像：%s" % appearance_id)


static func _runtime_mirroring_count(records: Array[Dictionary]) -> int:
	var count := 0
	for record in records:
		var world_value = record.get("world", {})
		if not (world_value is Dictionary):
			continue
		var mapping_value = (world_value as Dictionary).get("directionMapping", {})
		if not (mapping_value is Dictionary):
			continue
		for direction in WorldVisualDirectionContract.DIRECTIONS:
			var entry_value = (mapping_value as Dictionary).get(direction, {})
			if entry_value is Dictionary and bool((entry_value as Dictionary).get("flipH", false)):
				count += 1
	return count


static func _map_reference_summary(errors: Array[String]) -> Dictionary:
	var instance_count := 0
	var reuse_counts: Dictionary = {}
	var canary_binding_counts: Dictionary = {}
	for map_id_value in MapDataCatalog.MAP_DATA_PATHS.keys():
		var map_id := str(map_id_value)
		var path := str(MapDataCatalog.MAP_DATA_PATHS[map_id_value])
		if not FileAccess.file_exists(path):
			errors.append("NPC 美术引用检查缺少地图：%s/%s" % [map_id, path])
			continue
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
		if not (parsed is Dictionary):
			errors.append("NPC 美术引用检查地图 JSON 无效：%s/%s" % [map_id, path])
			continue
		for item_value in (parsed as Dictionary).get("interactionPoints", []):
			if not (item_value is Dictionary):
				continue
			var item := item_value as Dictionary
			if not item.has("appearanceId"):
				continue
			if str(item.get("kind", "")) != "npc":
				errors.append("只有 kind=npc 可登记 appearanceId：%s/%s" % [map_id, str(item.get("id", ""))])
				continue
			instance_count += 1
			var npc_id := str(item.get("id", ""))
			var appearance_id_value = item.get("appearanceId")
			var appearance_id := appearance_id_value as String if appearance_id_value is String else ""
			if appearance_id == "" or appearance_id != appearance_id.strip_edges():
				errors.append("地图 NPC appearanceId 必须为非空 canonical 字符串：%s/%s" % [map_id, str(item.get("id", ""))])
			elif NpcArtCatalog.appearance_record(appearance_id).is_empty():
				errors.append("地图 NPC 引用了未知 appearanceId：%s/%s/%s" % [map_id, str(item.get("id", "")), appearance_id])
			if FIXED_MAP_BINDINGS.has(npc_id):
				var expected := FIXED_MAP_BINDINGS[npc_id] as Dictionary
				canary_binding_counts[npc_id] = int(canary_binding_counts.get(npc_id, 0)) + 1
				if (
					map_id != str(expected.get("mapId", ""))
					or appearance_id != str(expected.get("appearanceId", ""))
					or str(item.get("facilityType", "")) != str(expected.get("facilityType", ""))
				):
					errors.append("NPC 固定地图岗位与职业外观绑定错误：%s/%s" % [map_id, npc_id])
				var catalog_record := NpcArtCatalog.appearance_record(appearance_id)
				if str(catalog_record.get("roleId", "")) != str(expected.get("roleId", "")):
					errors.append("NPC 固定岗位 roleId 与地图岗位不一致：%s/%s" % [map_id, npc_id])
			elif npc_id.ends_with("_manor_shopkeeper"):
				_append_manor_binding_error(
					map_id,
					npc_id,
					appearance_id,
					str(item.get("facilityType", "")),
					"npc_item_shopkeeper_f_v1",
					"item_shopkeeper",
					"item_shop",
					errors
				)
			elif npc_id.ends_with("_manor_steward"):
				_append_manor_binding_error(
					map_id,
					npc_id,
					appearance_id,
					str(item.get("facilityType", "")),
					"npc_manor_steward_m_v1",
					"manor_steward",
					"",
					errors
				)
			var facing_value = item.get("facing")
			var raw_facing := facing_value as String if facing_value is String else ""
			if not WorldVisualDirectionContract.DIRECTIONS.has(raw_facing):
				errors.append("地图 NPC facing 不是 canonical 真八向：%s/%s/%s" % [map_id, str(item.get("id", "")), raw_facing])
			for key_value in item.keys():
				var key := str(key_value).to_lower()
				if key.contains("texture") or key.ends_with("path") or key.begins_with("flip"):
					errors.append("地图 NPC 不得内嵌纹理/路径/镜像字段：%s/%s/%s" % [map_id, str(item.get("id", "")), str(key_value)])
			reuse_counts[appearance_id] = int(reuse_counts.get(appearance_id, 0)) + 1
	return {
		"instanceCount": instance_count,
		"reuseCounts": reuse_counts,
		"canaryBindingCounts": canary_binding_counts,
	}


static func _append_manor_binding_error(
	map_id: String,
	npc_id: String,
	appearance_id: String,
	facility_type: String,
	expected_appearance_id: String,
	expected_role_id: String,
	expected_facility_type: String,
	errors: Array[String]
) -> void:
	var expected_npc_prefix := map_id
	if (
		npc_id.get_slice("_shopkeeper", 0).get_slice("_steward", 0) != expected_npc_prefix
		or appearance_id != expected_appearance_id
		or facility_type != expected_facility_type
	):
		errors.append("庄园 NPC 岗位与共享职业外观绑定错误：%s/%s" % [map_id, npc_id])
	var catalog_record := NpcArtCatalog.appearance_record(appearance_id)
	if str(catalog_record.get("roleId", "")) != expected_role_id:
		errors.append("庄园 NPC roleId 与岗位不一致：%s/%s" % [map_id, npc_id])
