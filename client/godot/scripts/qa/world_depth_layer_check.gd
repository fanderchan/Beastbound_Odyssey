extends RefCounted

const MapVisualRenderer := preload("res://scripts/world/map_visual_renderer.gd")
const WorldDepthLayer := preload("res://scripts/world/world_depth_layer.gd")
const PET_SCENE := preload("res://scenes/pet/Pet.tscn")


static func run(
	depth_layer: Node,
	overlay_layer: Node,
	prepared: Dictionary,
	map_data: Dictionary,
	player: Node2D,
	pet: Node2D
) -> Dictionary:
	var errors: Array[String] = []
	if depth_layer == null:
		errors.append("统一世界深度层未创建")
	elif not depth_layer.has_method("debug_depth_snapshot"):
		errors.append("统一世界深度层缺少调试快照接口")
	if overlay_layer == null:
		errors.append("固定覆盖层未创建")
	elif not overlay_layer.has_method("replace_commands"):
		errors.append("固定覆盖层缺少命令替换接口")
	if not errors.is_empty():
		return _report(errors, 0, 0, 0)

	var expected_map_objects := MapVisualRenderer.world_depth_commands(prepared).size()
	var expected_npcs := 0
	var expected_interaction_props := 0
	for value in map_data.get("interactionPoints", []):
		if not (value is Dictionary):
			continue
		var kind := str((value as Dictionary).get("kind", ""))
		if kind == "npc":
			expected_npcs += 1
		elif ["gate", "record_point", "sign", "guardian"].has(kind):
			expected_interaction_props += 1
	var actual_map_objects := int(depth_layer.call("group_count", "map_objects"))
	var actual_npcs := int(depth_layer.call("group_count", "npcs"))
	var actual_interaction_props := int(depth_layer.call("group_count", "interaction_props"))
	if actual_map_objects != expected_map_objects:
		errors.append(
			"统一深度层地图物件数不一致：expected=%d actual=%d"
			% [expected_map_objects, actual_map_objects]
		)
	if actual_npcs != expected_npcs:
		errors.append(
			"统一深度层 NPC 数不一致：expected=%d actual=%d"
			% [expected_npcs, actual_npcs]
		)
	if actual_interaction_props != expected_interaction_props:
		errors.append(
			"统一深度层交互道具数不一致：expected=%d actual=%d"
			% [expected_interaction_props, actual_interaction_props]
		)
	for actor_id in ["actor:player", "actor:pet"]:
		if not bool(depth_layer.call("has_depth_member", actor_id)):
			errors.append("统一深度层缺少运行时角色：%s" % actor_id)
	var player_offset := float(depth_layer.call("registered_actor_foot_offset", "actor:player"))
	var pet_offset := float(depth_layer.call("registered_actor_foot_offset", "actor:pet"))
	var expected_pet_offset := (
		float(pet.call("get_world_depth_foot_offset_y"))
		if pet != null and pet.has_method("get_world_depth_foot_offset_y")
		else 18.0
	)
	if not is_equal_approx(player_offset, 24.0):
		errors.append("Player 脚底排序偏移错误：%.3f" % player_offset)
	if not is_equal_approx(pet_offset, expected_pet_offset):
		errors.append(
			"Pet 动态脚底排序偏移错误：expected=%.3f actual=%.3f"
			% [expected_pet_offset, pet_offset]
		)
	if (
		player == null
		or pet == null
		or depth_layer.process_priority <= player.process_priority
		or depth_layer.process_priority <= pet.process_priority
	):
		errors.append("统一深度层没有在 Player/Pet 位移后进行晚序刷新")

	var snapshot: Array = depth_layer.call("debug_depth_snapshot")
	var actual_ids: Array[String] = []
	var seen_ids: Dictionary = {}
	for value in snapshot:
		if not (value is Dictionary):
			errors.append("统一深度快照包含非对象条目")
			continue
		var entry := value as Dictionary
		var stable_id := str(entry.get("stableId", ""))
		if stable_id == "" or seen_ids.has(stable_id):
			errors.append("统一深度快照 stableId 缺失或重复：%s" % stable_id)
			continue
		seen_ids[stable_id] = true
		actual_ids.append(stable_id)
		if stable_id == "actor:player" and player != null:
			var expected_depth := player.global_position.y + 24.0
			if absf(float(entry.get("depthY", 0.0)) - expected_depth) > 0.01:
				errors.append("Player 快照没有使用真实脚底接地点")
		elif stable_id == "actor:pet" and pet != null:
			var expected_depth := pet.global_position.y + expected_pet_offset
			if absf(float(entry.get("depthY", 0.0)) - expected_depth) > 0.01:
				errors.append("Pet 快照没有使用真实脚底接地点")
	var sorted_ids := WorldDepthLayer.debug_sorted_ids(snapshot)
	if actual_ids != sorted_ids:
		errors.append("统一深度层实际子节点顺序不符合 depthY/tiePriority/stableId")

	_validate_pet_visual_offsets(errors)
	_validate_interaction_prop_visuals(errors)
	_validate_reference_orders(errors)
	return _report(
		errors,
		snapshot.size(),
		actual_map_objects,
		actual_npcs,
		actual_interaction_props
	)


static func _validate_reference_orders(errors: Array[String]) -> void:
	_expect_order(
		"角色位于高物件北侧",
		[
			{"stableId": "actor:player", "depthY": 480.0, "tiePriority": 10},
			{"stableId": "object:tree", "depthY": 500.0, "tiePriority": 20},
		],
		["actor:player", "object:tree"],
		errors
	)
	for sample in [
		{"label": "Player 北侧脚底阈值", "rootY": 475.98, "offset": 24.0, "expected": ["actor:player", "object:tree"]},
		{"label": "Player 同脚点阈值", "rootY": 476.0, "offset": 24.0, "expected": ["actor:player", "object:tree"]},
		{"label": "Player 南侧脚底阈值", "rootY": 476.02, "offset": 24.0, "expected": ["object:tree", "actor:player"]},
		{"label": "Pet 北侧脚底阈值", "rootY": 481.98, "offset": 18.0, "expected": ["actor:pet", "object:tree"]},
		{"label": "Pet 同脚点阈值", "rootY": 482.0, "offset": 18.0, "expected": ["actor:pet", "object:tree"]},
		{"label": "Pet 南侧脚底阈值", "rootY": 482.02, "offset": 18.0, "expected": ["object:tree", "actor:pet"]},
		{"label": "正式 Pet 北侧脚底阈值", "rootY": 497.98, "offset": 2.0, "expected": ["actor:pet", "object:tree"]},
		{"label": "正式 Pet 同脚点阈值", "rootY": 498.0, "offset": 2.0, "expected": ["actor:pet", "object:tree"]},
		{"label": "正式 Pet 南侧脚底阈值", "rootY": 498.02, "offset": 2.0, "expected": ["object:tree", "actor:pet"]},
	]:
		var actor_id := (
			"actor:pet"
			if str(sample.get("label", "")).contains("Pet")
			else "actor:player"
		)
		_expect_order(
			str(sample.get("label", "")),
			[
				{
					"stableId": actor_id,
					"depthY": float(sample.get("rootY", 0.0)) + float(sample.get("offset", 0.0)),
					"tiePriority": 10,
				},
				{"stableId": "object:tree", "depthY": 500.0, "tiePriority": 20},
			],
			sample.get("expected", []) as Array,
			errors
		)
	_expect_order(
		"角色移动到高物件南侧",
		[
			{"stableId": "object:tree", "depthY": 500.0, "tiePriority": 20},
			{"stableId": "actor:player", "depthY": 520.0, "tiePriority": 10},
		],
		["object:tree", "actor:player"],
		errors
	)
	_expect_order(
		"同脚点角色先于物件",
		[
			{"stableId": "object:tree", "depthY": 500.0, "tiePriority": 20},
			{"stableId": "actor:player", "depthY": 500.0, "tiePriority": 10},
		],
		["actor:player", "object:tree"],
		errors
	)
	_validate_epsilon_chain_order(errors)
	_expect_order(
		"玩家宠物 NPC 远端角色共用队列",
		[
			{"stableId": "remote:peer", "depthY": 470.0, "tiePriority": 10},
			{"stableId": "actor:pet", "depthY": 480.0, "tiePriority": 10},
			{"stableId": "npc:keeper", "depthY": 460.0, "tiePriority": 10},
			{"stableId": "object:tree", "depthY": 450.0, "tiePriority": 20},
		],
		["object:tree", "npc:keeper", "remote:peer", "actor:pet"],
		errors
	)


static func _validate_epsilon_chain_order(errors: Array[String]) -> void:
	# These adjacent depths differ by less than the former 0.01 epsilon while
	# the endpoints differ by more. Descending priorities made the old
	# comparator cyclic: near > middle, middle > far, yet near < far.
	var chain: Array[Dictionary] = [
		{"stableId": "chain:near", "depthY": 500.0, "tiePriority": 30},
		{"stableId": "chain:middle", "depthY": 500.009, "tiePriority": 20},
		{"stableId": "chain:far", "depthY": 500.018, "tiePriority": 10},
	]
	var expected := ["chain:near", "chain:middle", "chain:far"]
	var permutations: Array[Array] = [
		[0, 1, 2],
		[0, 2, 1],
		[1, 0, 2],
		[1, 2, 0],
		[2, 0, 1],
		[2, 1, 0],
	]
	for permutation in permutations:
		var entries: Array[Dictionary] = []
		for index_value in permutation:
			entries.append(chain[int(index_value)])
		var actual := WorldDepthLayer.debug_sorted_ids(entries)
		if actual != expected:
			errors.append(
				"epsilon-chain 严格全序错误：input=%s expected=%s actual=%s"
				% [str(permutation), str(expected), str(actual)]
			)
			return


static func _validate_pet_visual_offsets(errors: Array[String]) -> void:
	var probe_pet := PET_SCENE.instantiate() as Node2D
	if probe_pet == null or not probe_pet.has_method("get_world_depth_foot_offset_y"):
		errors.append("Pet 没有暴露动态世界脚底接口")
		return
	var placeholder_offset := float(probe_pet.call("get_world_depth_foot_offset_y"))
	probe_pet.set("formal_asset_enabled", true)
	var formal_offset := float(probe_pet.call("get_world_depth_foot_offset_y"))
	if not is_equal_approx(placeholder_offset, 18.0):
		errors.append("占位 Pet 脚底应为 +18：%.3f" % placeholder_offset)
	if not is_equal_approx(formal_offset, 2.0):
		errors.append("正式 Pet 脚底应为约 +2：%.3f" % formal_offset)
	probe_pet.free()


static func _validate_interaction_prop_visuals(errors: Array[String]) -> void:
	var probe_layer := WorldDepthLayer.new()
	var commands: Array[Dictionary] = []
	for index in range(3):
		var kind: String = ["gate", "record_point", "sign"][index]
		var contact := Vector2(100.0, 498.0 + float(index) * 2.0)
		commands.append({
			"stableId": "interaction:%s" % kind,
			"kind": kind,
			"position": contact,
			"depthY": contact.y,
			"tiePriority": 20,
			"marker": contact + Vector2(0, -18),
		})
	var guardian_contact := Vector2(100, 504)
	commands.append({
		"stableId": "interaction:guardian",
		"kind": "npc_placeholder",
		"position": guardian_contact,
		"depthY": guardian_contact.y,
		"tiePriority": 10,
		"marker": guardian_contact + Vector2(0, -18),
		"blocksMovement": true,
	})
	var drop_contact := Vector2(100, 506)
	commands.append({
		"stableId": "ground_drop:probe",
		"kind": "ground_pet_drop",
		"position": drop_contact,
		"depthY": drop_contact.y,
		"tiePriority": 10,
		"marker": drop_contact + Vector2(0, -16),
		"bodyColor": Color(0.62, 0.50, 0.28, 0.98),
		"name": "测试宠物",
	})
	var built_count := probe_layer.replace_group("interaction_props", commands)
	if built_count != 5 or probe_layer.group_count("interaction_props") != 5:
		errors.append("gate/record_point/sign/guardian/ground drop 没有全部进入统一深度层")
	var front_to_back := probe_layer.stable_ids_front_to_back("interaction_props")
	if front_to_back != [
		"ground_drop:probe",
		"interaction:guardian",
		"interaction:sign",
		"interaction:record_point",
		"interaction:gate",
	]:
		errors.append("交互道具前后顺序没有使用接地点")
	probe_layer.free()


static func _expect_order(
	label: String,
	entries: Array[Dictionary],
	expected: Array,
	errors: Array[String]
) -> void:
	var actual := WorldDepthLayer.debug_sorted_ids(entries)
	if actual != expected:
		errors.append("%s 排序错误：expected=%s actual=%s" % [label, str(expected), str(actual)])


static func _report(
	errors: Array[String],
	member_count: int,
	map_object_count: int,
	npc_count: int,
	interaction_prop_count: int = 0
) -> Dictionary:
	var player_pet_registered := true
	var common_queue_ordered := true
	var overlay_separated := true
	for error in errors:
		if error.contains("缺少运行时角色"):
			player_pet_registered = false
		if error.contains("排序") or error.contains("子节点顺序"):
			common_queue_ordered = false
		if error.contains("覆盖层"):
			overlay_separated = false
	return {
		"result": "PASS" if errors.is_empty() else "FAIL",
		"memberCount": member_count,
		"mapObjectCount": map_object_count,
		"npcCount": npc_count,
		"interactionPropCount": interaction_prop_count,
		"checks": {
			"playerPetRegistered": player_pet_registered,
			"commonQueueOrdered": common_queue_ordered,
			"overlaySeparated": overlay_separated,
		},
		"errors": errors,
	}
