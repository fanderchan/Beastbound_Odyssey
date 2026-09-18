extends RefCounted

const Prefetch := preload("res://scripts/battle/battle_texture_prefetcher.gd")
const Plan := preload("res://scripts/battle/battle_texture_prefetch_plan.gd")
const Art := preload("res://scripts/pet/pet_action_asset_catalog.gd")
const CharacterArt := preload("res://scripts/player/character_action_asset_catalog.gd")

class FakeLoader:
	extends "res://scripts/battle/battle_texture_prefetcher.gd"
	var states: Dictionary = {}
	var gets: Array[String] = []
	var bad_get := false
	var texture := ImageTexture.new()
	func background_loading_supported() -> bool:
		return true
	func _request_texture(path: String) -> Error:
		if path.ends_with("reject.png"):
			return ERR_CANT_OPEN
		states[path] = ResourceLoader.THREAD_LOAD_IN_PROGRESS
		return OK
	func _load_status(path: String) -> int:
		return int(states.get(path, ResourceLoader.THREAD_LOAD_INVALID_RESOURCE))
	func _loaded_texture(path: String) -> Texture2D:
		bad_get = bad_get or _load_status(path) != ResourceLoader.THREAD_LOAD_LOADED
		gets.append(path)
		return texture
	func _cached_texture(_path: String) -> Texture2D:
		return null


static func run(host) -> Array[String]:
	var errors: Array[String] = []
	var fake := FakeLoader.new()
	var paths := PackedStringArray()
	for index in range(Plan.MAX_RESOURCES + 64):
		paths.append("res://assets/prefetch-check-%d.png" % index)
	paths.append(paths[0])
	fake.set_paths(paths)
	if int(fake.snapshot().resources) != Plan.MAX_RESOURCES:
		errors.append("prefetch resource cap failed")
	for frame in range(5):
		fake.pump()
		if int(fake.snapshot().inFlight) > Prefetch.MAX_IN_FLIGHT or not fake.gets.is_empty():
			errors.append("prefetch blocked on or over-admitted unfinished resources")
	var old_paths := fake.states.keys()
	fake.set_paths(PackedStringArray(["res://assets/new-map.png", "res://assets/new-map.png", "user://secret.png"]))
	for path in old_paths:
		fake.states[path] = ResourceLoader.THREAD_LOAD_LOADED
	for frame in range(5):
		fake.pump()
	if int(fake.snapshot().resources) != 1 or int(fake.snapshot().retained) != 0:
		errors.append("map change retained obsolete textures or duplicate paths")
	fake.states["res://assets/new-map.png"] = ResourceLoader.THREAD_LOAD_FAILED
	fake.pump()
	if int(fake.snapshot().failed) != 1 or fake.bad_get:
		errors.append("failed threaded load was fetched or silently accepted")
	fake.set_paths(PackedStringArray(["res://assets/reject.png"]))
	fake.pump()
	if int(fake.snapshot().failed) != 1 or fake.is_processing():
		errors.append("rejected request left the queue running")
	fake.cancel()
	fake.free()

	var pending := "bui_normal_red_fire10"
	var was_preview := Art.is_qa_preview_enabled(pending)
	Art.disable_qa_preview_form(pending)
	if not Art.battle_texture_paths(pending).is_empty():
		errors.append("prefetch enumerated unreleased pet art")
	Art.enable_qa_preview_form(pending)
	var profile := {"activePetInstanceId": "self-pet", "petInstances": [{"instanceId": "self-pet", "formId": pending}]}
	var map_data := {"encounterZones": [{"fixedWildPets": [
		{"formId": pending},
		{"formId": "bui_normal_thick_earth10", "catchable": false, "battleAppearanceFormId": "wuli_evolved_crystal_earth8_water2"},
		{"formId": "invalid-form"},
	]}]}
	var subject := Plan.subjects(map_data, profile)
	if subject.forms != [pending, "wuli_evolved_crystal_earth8_water2"]:
		errors.append("prefetch did not deduplicate actual encounter appearances")
	var all_paths := Plan.paths_for(subject)
	if all_paths.size() != CharacterArt.battle_texture_paths("").size() + 360:
		errors.append("prefetch did not enumerate existing authored frames")
	_append_nearby_character_errors(errors, map_data, profile)
	Art.disable_qa_preview_form(pending)
	if Plan.subjects(map_data, profile).forms.has(pending) or not Art.battle_texture_paths(pending).is_empty():
		errors.append("cached prefetch plan bypassed a closed pet gate")
	if was_preview:
		Art.enable_qa_preview_form(pending)

	# Also exercise the actual engine request/status/get lifecycle across frames.
	var real := Prefetch.new()
	host.add_child(real)
	var real_paths := Art.battle_texture_paths("wuli_evolved_crystal_earth8_water2").slice(0, 12)
	real.set_paths(real_paths)
	if not real.background_loading_supported():
		if real.is_processing() or int(real.snapshot().requested) != 0 or int(real.snapshot().resources) != 0:
			errors.append("headless attempted background texture loading")
		real.queue_free()
		await host.get_tree().process_frame
		print("battle texture prefetch check: headless synchronous fallback status=%s errors=%s" % ["passed" if errors.is_empty() else "failed", str(errors)])
		return errors
	var deadline := Time.get_ticks_msec() + 10000
	while real.is_processing() and Time.get_ticks_msec() < deadline:
		await host.get_tree().process_frame
	var report := real.snapshot()
	if int(report.retained) != real_paths.size() or int(report.failed) != 0 or real_paths.is_empty():
		errors.append("real threaded texture request did not complete: " + str(report))
	for path in real_paths:
		if not ResourceLoader.get_cached_ref(path) is Texture2D:
			errors.append("completed texture is not reusable by the normal catalog")
	real.cancel()
	real.queue_free()
	await host.get_tree().process_frame
	print("battle texture prefetch check: status=%s engine=%s errors=%s" % ["passed" if errors.is_empty() else "failed", str(report), str(errors)])
	return errors


static func _append_nearby_character_errors(errors: Array[String], source_map: Dictionary, profile: Dictionary) -> void:
	var map_data := source_map.duplicate(true)
	map_data["id"] = "prefetch_map"
	var nearby: Array = []
	for appearance in CharacterArt.appearance_ids():
		nearby.append({"appearanceId": appearance, "position": {"mapId": "prefetch_map", "cellX": 5}})
	nearby.append(nearby[1].duplicate(true))
	nearby.append({"appearanceId": "invalid", "position": {"mapId": "elsewhere"}})
	nearby.append({"position": "malformed"})
	var planned := Plan.subjects(map_data, profile, nearby)
	var expected_paths := PackedStringArray()
	for appearance in CharacterArt.appearance_ids():
		expected_paths.append_array(CharacterArt.battle_texture_paths(appearance))
	var paths := Plan.paths_for(planned)
	if planned.appearances.size() != 4 or paths.size() != expected_paths.size() + 360:
		errors.append("nearby character prefetch lost or duplicated authored frames")
	for path in expected_paths:
		if not paths.has(path):
			errors.append("nearby character frame omitted: " + path)
			break
	var fake := FakeLoader.new()
	fake.configure(map_data, profile, nearby)
	fake.pump()
	var loading := fake.snapshot()
	nearby.reverse()
	for value in nearby:
		if value.get("position") is Dictionary:
			value.position["cellX"] = 9
	fake.configure(map_data, profile, nearby)
	if fake.snapshot() != loading:
		errors.append("nearby movement or roster ordering restarted the prefetch queue")
	var only_elsewhere := [{"appearanceId": "frost_whisper_v1", "position": {"mapId": "elsewhere"}}]
	var alone := Plan.subjects(map_data, profile, only_elsewhere)
	if alone.appearances != [CharacterArt.CHARACTER_ID]:
		errors.append("prefetch included characters from another map")
	fake.configure(map_data, profile, only_elsewhere)
	if fake.snapshot().resources != Plan.paths_for(alone).size():
		errors.append("departed character textures remained in the prefetch plan")
	fake.cancel()
	fake.free()
