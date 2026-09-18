extends RefCounted

const ReviewBatch := preload("res://scripts/qa/earth_vein_review_batch_capture.gd")
const ActionBatch := preload("res://scripts/qa/map_visual_action_capture_batch.gd")


static func run() -> Dictionary:
	var errors: Array[String] = []
	var valid: Array = [[1280, 720], [1280.0, 720.0], JSON.parse_string("[1280, 720]")]
	var invalid: Array = [
		null, {}, [], [1280], [1280, 720, 0], [720, 1280],
		[1280.5, 720], [1280, 720.5], ["1280", 720], [1280, "720"],
		[true, 720], [1280, false], [NAN, 720], [1280, INF],
	]
	for value in valid:
		if not ReviewBatch.review_viewport_matches(value):
			errors.append("Exact native/JSON viewport was rejected: %s" % str(value))
	for value in invalid:
		if ReviewBatch.review_viewport_matches(value):
			errors.append("Malformed viewport was accepted: %s" % str(value))
	var action_case_count := _check_action_contracts(errors)
	return {
		"result": "PASS" if errors.is_empty() else "FAIL",
		"caseCount": valid.size() + invalid.size() + action_case_count,
		"errors": errors,
	}


static func _check_action_contracts(errors: Array[String]) -> int:
	var window := {
		"godotProcessCount": 1,
		"userVisibleWindowOpenCount": 1,
		"userVisibleWindowCloseCount": 1,
		"singlePersistentWindow": true,
		"viewport": [1280, 720],
	}
	var launch := {
		"entrypoint": "standalone_scene_tree_script",
		"mainSceneLoadCount": 1,
		"audioDriver": "Dummy",
		"perMapPreviewCliFlags": false,
		"previewAuthorization": "sha256_bound_batch_plan",
	}
	var cases := 0
	for contract in [window, JSON.parse_string(JSON.stringify(window))]:
		cases += 1
		if not ActionBatch.action_window_contract_matches(contract):
			errors.append("Exact native/JSON action window contract was rejected")
	for contract in [launch, JSON.parse_string(JSON.stringify(launch))]:
		cases += 1
		if not ActionBatch.action_launch_contract_matches(contract):
			errors.append("Exact native/JSON action launch contract was rejected")
	for malformed in [null, [], {}, true]:
		cases += 2
		if ActionBatch.action_window_contract_matches(malformed):
			errors.append("Malformed action window root was accepted")
		if ActionBatch.action_launch_contract_matches(malformed):
			errors.append("Malformed action launch root was accepted")
	for key in window:
		var missing := window.duplicate(true)
		missing.erase(key)
		cases += 1
		if ActionBatch.action_window_contract_matches(missing):
			errors.append("Action window accepted missing field: %s" % key)
	for key in launch:
		var missing := launch.duplicate(true)
		missing.erase(key)
		cases += 1
		if ActionBatch.action_launch_contract_matches(missing):
			errors.append("Action launch accepted missing field: %s" % key)
	for key in ["godotProcessCount", "userVisibleWindowOpenCount", "userVisibleWindowCloseCount"]:
		for bad_count in [0, 2, 1.5, true, "1", NAN, INF]:
			var changed := window.duplicate(true)
			changed[key] = bad_count
			cases += 1
			if ActionBatch.action_window_contract_matches(changed):
				errors.append("Action window accepted invalid count: %s" % key)
	for bad_count in [0, 2, 1.5, true, "1", NAN, INF]:
		var changed := launch.duplicate(true)
		changed["mainSceneLoadCount"] = bad_count
		cases += 1
		if ActionBatch.action_launch_contract_matches(changed):
			errors.append("Action launch accepted invalid Main count")
	for bad_viewport in [[1280.5, 720], [1280, "720"], [true, 720], [1280, 720, 0]]:
		var changed := window.duplicate(true)
		changed["viewport"] = bad_viewport
		cases += 1
		if ActionBatch.action_window_contract_matches(changed):
			errors.append("Action window accepted invalid viewport")
	for bad_flag in [false, 1, "true"]:
		var changed := window.duplicate(true)
		changed["singlePersistentWindow"] = bad_flag
		cases += 1
		if ActionBatch.action_window_contract_matches(changed):
			errors.append("Action window accepted invalid persistent flag")
	for bad_flag in [true, 0, "false"]:
		var changed := launch.duplicate(true)
		changed["perMapPreviewCliFlags"] = bad_flag
		cases += 1
		if ActionBatch.action_launch_contract_matches(changed):
			errors.append("Action launch accepted invalid preview flag")
	for key in ["entrypoint", "audioDriver", "previewAuthorization"]:
		var changed := launch.duplicate(true)
		changed[key] = "unrecognized"
		cases += 1
		if ActionBatch.action_launch_contract_matches(changed):
			errors.append("Action launch accepted invalid identity: %s" % key)
	window["extra"] = true
	launch["extra"] = true
	cases += 2
	if ActionBatch.action_window_contract_matches(window) or ActionBatch.action_launch_contract_matches(launch):
		errors.append("Action contract accepted unknown fields")
	return cases
