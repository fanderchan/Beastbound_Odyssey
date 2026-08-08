extends RefCounted
class_name MapRoutePlanner

const InteractionModel := preload("res://scripts/world/interaction_model.gd")

var _ready := false
var _known_map_ids: Array[String] = []
var _known_map_lookup: Dictionary = {}
var _neighbors_by_map_id: Dictionary = {}
var _warp_by_from_and_to: Dictionary = {}
var _directed_edge_count := 0
var _validation_errors: Array[String] = []


func _init(
	known_map_ids: Array[String] = [],
	map_loader: Callable = Callable()
) -> void:
	_build_graph(known_map_ids, map_loader)


func is_ready() -> bool:
	return _ready


func validation_errors() -> Array[String]:
	return _validation_errors.duplicate()


func map_count() -> int:
	return _known_map_ids.size() if _ready else 0


func directed_edge_count() -> int:
	return _directed_edge_count if _ready else 0


func shortest_path(from_map_id: String, to_map_id: String) -> Array[String]:
	if not _ready or from_map_id == "" or to_map_id == "":
		return []
	if not _known_map_lookup.has(from_map_id) or not _known_map_lookup.has(to_map_id):
		return []
	if from_map_id == to_map_id:
		return [from_map_id]

	var queue: Array[String] = [from_map_id]
	var previous: Dictionary = {from_map_id: ""}
	var cursor := 0
	while cursor < queue.size():
		var current_map_id := queue[cursor]
		cursor += 1
		for neighbor_map_id in _neighbors_for(current_map_id):
			if previous.has(neighbor_map_id):
				continue
			previous[neighbor_map_id] = current_map_id
			if neighbor_map_id == to_map_id:
				return _reconstruct_path(previous, from_map_id, to_map_id)
			queue.append(neighbor_map_id)
	return []


func next_warp(from_map_id: String, to_map_id: String) -> Dictionary:
	var path := shortest_path(from_map_id, to_map_id)
	if path.size() < 2:
		return {}
	var next_map_id := path[1]
	var targets_value = _warp_by_from_and_to.get(from_map_id, {})
	if not (targets_value is Dictionary):
		return {}
	var targets := targets_value as Dictionary
	var warp_value = targets.get(next_map_id, {})
	if not (warp_value is Dictionary) or (warp_value as Dictionary).is_empty():
		return {}
	var result := (warp_value as Dictionary).duplicate(true)
	result["routeMapPath"] = path.duplicate()
	return result


func _build_graph(known_map_ids: Array[String], map_loader: Callable) -> void:
	_clear_graph()
	if not map_loader.is_valid():
		_validation_errors.append("地图加载器不可用")
		return
	if known_map_ids.is_empty():
		_validation_errors.append("登记地图不能为空")
		return

	for map_id_value in known_map_ids:
		var map_id := str(map_id_value).strip_edges()
		if map_id == "":
			_validation_errors.append("登记地图 ID 不能为空")
			continue
		if _known_map_lookup.has(map_id):
			_validation_errors.append("登记地图 ID 重复：%s" % map_id)
			continue
		_known_map_lookup[map_id] = true
		_known_map_ids.append(map_id)
	_known_map_ids.sort()
	if not _validation_errors.is_empty():
		_fail_closed()
		return

	var map_data_by_id: Dictionary = {}
	for map_id in _known_map_ids:
		var loaded_value = map_loader.call(map_id)
		if not (loaded_value is Dictionary):
			_validation_errors.append("地图无法加载为 Dictionary：%s" % map_id)
			continue
		var map_data := loaded_value as Dictionary
		if str(map_data.get("id", "")).strip_edges() != map_id:
			_validation_errors.append("地图 ID 与登记项不一致：%s" % map_id)
			continue
		if not (map_data.get("interactionPoints", null) is Array):
			_validation_errors.append("地图 interactionPoints 合同无效：%s" % map_id)
			continue
		map_data_by_id[map_id] = map_data.duplicate(true)
	if map_data_by_id.size() != _known_map_ids.size():
		_fail_closed()
		return

	for map_id in _known_map_ids:
		var map_data := map_data_by_id.get(map_id, {}) as Dictionary
		var neighbors: Array[String] = []
		var warp_by_target: Dictionary = {}
		var interaction_index := 0
		for interaction_value in InteractionModel.interaction_points(map_data):
			interaction_index += 1
			if not (interaction_value is Dictionary):
				_validation_errors.append(
					"地图交互点不是 Dictionary：%s#%d" % [map_id, interaction_index]
				)
				continue
			var interaction := interaction_value as Dictionary
			if not InteractionModel.is_warp(interaction):
				continue
			var warp_error := _warp_validation_error(map_id, interaction)
			if warp_error != "":
				_validation_errors.append(warp_error)
				continue
			var target_map_id := str(interaction.get("toMap", "")).strip_edges()
			if not _known_map_lookup.has(target_map_id):
				_validation_errors.append(
					"传送目标未登记：%s -> %s" % [map_id, target_map_id]
				)
				continue
			if not warp_by_target.has(target_map_id):
				neighbors.append(target_map_id)
				warp_by_target[target_map_id] = interaction.duplicate(true)
				continue
			var current_warp := warp_by_target.get(target_map_id, {}) as Dictionary
			if _warp_sort_key(interaction) < _warp_sort_key(current_warp):
				warp_by_target[target_map_id] = interaction.duplicate(true)
		neighbors.sort()
		_neighbors_by_map_id[map_id] = neighbors
		_warp_by_from_and_to[map_id] = warp_by_target
		_directed_edge_count += neighbors.size()

	if not _validation_errors.is_empty():
		_fail_closed()
		return
	_ready = true


func _warp_validation_error(map_id: String, interaction: Dictionary) -> String:
	var interaction_id := str(interaction.get("id", "")).strip_edges()
	if interaction_id == "":
		return "传送点缺少 ID：%s" % map_id
	var target_map_id := str(interaction.get("toMap", "")).strip_edges()
	if target_map_id == "":
		return "传送点缺少目标地图：%s/%s" % [map_id, interaction_id]
	var cell_value = interaction.get("cell", null)
	if not (cell_value is Array) or (cell_value as Array).size() < 2:
		return "传送点缺少有效格子：%s/%s" % [map_id, interaction_id]
	var cell := cell_value as Array
	if not ((cell[0] is int or cell[0] is float) and (cell[1] is int or cell[1] is float)):
		return "传送点格子不是数字：%s/%s" % [map_id, interaction_id]
	return ""


func _neighbors_for(map_id: String) -> Array[String]:
	var result: Array[String] = []
	var neighbors_value = _neighbors_by_map_id.get(map_id, [])
	if not (neighbors_value is Array):
		return result
	for neighbor_value in neighbors_value as Array:
		result.append(str(neighbor_value))
	return result


func _reconstruct_path(
	previous: Dictionary,
	from_map_id: String,
	to_map_id: String
) -> Array[String]:
	var reverse_path: Array[String] = []
	var current_map_id := to_map_id
	while current_map_id != "":
		reverse_path.append(current_map_id)
		if current_map_id == from_map_id:
			break
		current_map_id = str(previous.get(current_map_id, ""))
	if reverse_path.is_empty() or reverse_path[-1] != from_map_id:
		return []
	reverse_path.reverse()
	return reverse_path


func _warp_sort_key(interaction: Dictionary) -> String:
	var cell_value = interaction.get("cell", [0, 0])
	var cell := cell_value as Array
	return "%s|%010d|%010d" % [
		str(interaction.get("id", "")),
		int(cell[0]),
		int(cell[1]),
	]


func _fail_closed() -> void:
	_ready = false
	_known_map_ids.clear()
	_known_map_lookup.clear()
	_neighbors_by_map_id.clear()
	_warp_by_from_and_to.clear()
	_directed_edge_count = 0


func _clear_graph() -> void:
	_ready = false
	_known_map_ids.clear()
	_known_map_lookup.clear()
	_neighbors_by_map_id.clear()
	_warp_by_from_and_to.clear()
	_directed_edge_count = 0
	_validation_errors.clear()
