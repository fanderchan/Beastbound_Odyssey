extends Node

const Plan := preload("res://scripts/battle/battle_texture_prefetch_plan.gd")
const MAX_IN_FLIGHT := 4
const MAX_OPERATIONS_PER_FRAME := 8
const STEP_BUDGET_USEC := 1500

var _signature := ""
var _paths := PackedStringArray()
var _cursor := 0
var _wanted: Dictionary = {}
var _in_flight: Dictionary = {}
var _resident: Dictionary = {}
var _requested := 0
var _failed := 0
var _max_step_usec := 0


func _init() -> void:
	set_process(false)


func _exit_tree() -> void:
	cancel()
	var pending := _in_flight.keys()
	_in_flight.clear()
	set_process(false)
	# Each accepted request owns a loader token until get() claims it, even
	# after failure. Only teardown may wait for these at most four local loads;
	# normal map changes keep draining asynchronously through pump().
	for path in pending:
		if _load_status(path) != ResourceLoader.THREAD_LOAD_INVALID_RESOURCE:
			_loaded_texture(path)


func configure(map_data: Dictionary, profile: Dictionary, nearby_players: Array = []) -> void:
	if not background_loading_supported():
		cancel()
		return
	var subject := Plan.subjects(map_data, profile, nearby_players)
	var signature := JSON.stringify(subject)
	if signature == _signature:
		return
	_signature = signature
	set_paths(Plan.paths_for(subject))


func cancel() -> void:
	_signature = ""
	set_paths(PackedStringArray())


func set_paths(paths: PackedStringArray) -> void:
	_paths.clear()
	_wanted.clear()
	_cursor = 0
	_requested = 0
	_failed = 0
	_max_step_usec = 0
	for path in paths:
		if not background_loading_supported():
			break
		if _paths.size() >= Plan.MAX_RESOURCES:
			break
		if _wanted.has(path) or not path.begins_with("res://") or not path.ends_with(".png"):
			continue
		_wanted[path] = true
		_paths.append(path)
	for path in _resident.keys():
		if not _wanted.has(path):
			_resident.erase(path)
	# Godot cannot cancel a submitted resource request. Keep at most four old
	# requests until complete, then release results no longer wanted by this map.
	set_process(not _paths.is_empty() or not _in_flight.is_empty())


func _process(_delta: float) -> void:
	pump()


func pump() -> void:
	var started := Time.get_ticks_usec()
	var operations := 0
	for path in _in_flight.keys():
		var status := _load_status(path)
		if status == ResourceLoader.THREAD_LOAD_IN_PROGRESS:
			continue
		_in_flight.erase(path)
		if status == ResourceLoader.THREAD_LOAD_LOADED:
			# Calling get before LOADED would block the game thread.
			var texture := _loaded_texture(path)
			if _wanted.has(path) and texture != null:
				_resident[path] = texture
		else:
			if status == ResourceLoader.THREAD_LOAD_FAILED:
				_loaded_texture(path)
			_failed += 1
		operations += 1
		if Time.get_ticks_usec() - started >= STEP_BUDGET_USEC:
			break
	while _cursor < _paths.size() and _in_flight.size() < MAX_IN_FLIGHT:
		if operations >= MAX_OPERATIONS_PER_FRAME or Time.get_ticks_usec() - started >= STEP_BUDGET_USEC:
			break
		var path := _paths[_cursor]
		_cursor += 1
		operations += 1
		if _resident.has(path) or _in_flight.has(path):
			continue
		var cached := _cached_texture(path)
		if cached != null:
			_resident[path] = cached
		elif _request_texture(path) == OK:
			_in_flight[path] = true
			_requested += 1
		else:
			_failed += 1
	_max_step_usec = maxi(_max_step_usec, Time.get_ticks_usec() - started)
	set_process(_cursor < _paths.size() or not _in_flight.is_empty())


func snapshot() -> Dictionary:
	return {"resources": _paths.size(), "retained": _resident.size(),
		"queued": _paths.size() - _cursor, "inFlight": _in_flight.size(),
		"requested": _requested, "failed": _failed, "maxStepUsec": _max_step_usec}


func background_loading_supported() -> bool:
	# Headless has no presentation to prepare. Godot 4.7's Dummy texture
	# storage can also race RID creation during parallel texture loads; keep
	# its existing synchronous path instead of hiding renderer errors in QA.
	return DisplayServer.get_name() != "headless"


func _request_texture(path: String) -> Error:
	return ResourceLoader.load_threaded_request(path, "Texture2D", false, ResourceLoader.CACHE_MODE_REUSE)


func _load_status(path: String) -> int:
	return ResourceLoader.load_threaded_get_status(path)


func _loaded_texture(path: String) -> Texture2D:
	return ResourceLoader.load_threaded_get(path) as Texture2D


func _cached_texture(path: String) -> Texture2D:
	return ResourceLoader.get_cached_ref(path) as Texture2D
