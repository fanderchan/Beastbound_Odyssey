extends RefCounted

const Art := preload("res://scripts/pet/pet_action_asset_catalog.gd")
const Catalog := preload("res://scripts/pet/pet_art_catalog.gd")
const FORMS := [
	"wuli_evolved_crystal_earth8_water2", "bui_normal_red_fire10",
	"wuli_normal_tough_earth10", "wuli_normal_orange_fire10", "wuli_normal_fast_wind10",
]


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	var frames := 0
	for form_id in FORMS:
		var preview_before := Art.is_qa_preview_enabled(form_id)
		var supported_before := Art.supports_form(form_id)
		if not Art.enable_qa_preview_form(form_id):
			errors.append("could not enable exact-form QA preview: " + form_id)
			continue
		var metadata := JSON.parse_string(FileAccess.get_file_as_string(Catalog.pet_bundle_metadata_path(form_id))) as Dictionary
		var root := str((Catalog.form_record(form_id).pet as Dictionary).root).replace("client/godot/", "res://")
		if not Art.warm_battle_state({"actors": [{"formId": form_id}, {"formId": form_id}]}):
			errors.append("duplicate-form warm failed: " + form_id)
		var actions := Art.battle_actions_for_form(form_id)
		var returned_actions := Art.battle_actions_for_form(form_id)
		returned_actions.clear()
		if Art.battle_actions_for_form(form_id) != actions:
			errors.append("public action list can poison the cache: " + form_id)
		for action in actions:
			var spec: Dictionary = metadata.actions[action]
			var count := int(spec.frameCount)
			var fps := float(spec.fps)
			var loops := bool(spec.get("loop", action in ["idle", "walk"]))
			for view in Art.VIEWS:
				for index in range(count):
					# Check every frame through the public progress API against its source path.
					var expected: Texture2D = load("%s/views/%s/%s/%s-%d.png" % [root, view, action, action, index + 1])
					if expected == null or Art.texture_for_progress(form_id, view, action, (index + 0.25) / count) != expected:
						errors.append("progress resolved a different frame: %s/%s/%s/%d" % [form_id, view, action, index + 1])
					frames += 1
				for elapsed in [-1.0, 0.0, 1.25 / fps, (count + 1.25) / fps]:
					var index := int(floor(maxf(0, elapsed) * fps))
					index = index % count if loops else mini(index, count - 1)
					var expected: Texture2D = load("%s/views/%s/%s/%s-%d.png" % [root, view, action, action, index + 1])
					if Art.texture_for_elapsed(form_id, view, action, elapsed) != expected:
						errors.append("elapsed loop/clamp changed: %s/%s/%s" % [form_id, view, action])
				if Art.texture_for_progress(form_id, view, action, -1.0) != Art.texture_for_progress(form_id, view, action, 0.0) or Art.texture_for_progress(form_id, view, action, 2.0) != Art.texture_for_progress(form_id, view, action, 1.0):
					errors.append("progress boundary clamp changed: " + form_id)
		if Art.texture_for_elapsed(form_id, "invalid-view", "invalid-action", 0) != Art.texture_for_elapsed(form_id, Art.VIEW_FRONT, "idle", 0):
			errors.append("invalid action/view fallback changed: " + form_id)
		if not preview_before:
			Art.disable_qa_preview_form(form_id)
		if Art.supports_form(form_id) != supported_before:
			errors.append("preview altered the release decision: " + form_id)
		if not supported_before and (Art.warm_battle_form(form_id) or Art.texture_for_progress(form_id, Art.VIEW_FRONT, "idle", 0.5) != null):
			errors.append("warmed cache bypassed the disabled preview: " + form_id)
	_check_legacy_toggle(errors)
	if frames != 900:
		errors.append("expected the five existing 180-frame guardian forms")
	print("pet animation cache check: frames=%d status=%s errors=%s" % [frames, "passed" if errors.is_empty() else "failed", str(errors)])
	return errors


static func _check_legacy_toggle(errors: Array[String]) -> void:
	var preview_before := Art.is_qa_preview_enabled(Art.FORM_ID)
	Art.disable_qa_preview_form(Art.FORM_ID)
	if Art.battle_actions_for_form(Art.FORM_ID) != Art.BATTLE_ACTIONS or Art.action_for_battle_state("skill") != "attack":
		errors.append("legacy seven-action canary changed")
	if not Art.enable_qa_preview_form(Art.FORM_ID) or Art.battle_actions_for_form(Art.FORM_ID) != Art.FULL_BATTLE_ACTIONS or Art.action_for_battle_state("skill") != "skill":
		errors.append("legacy-to-preview action cache was not invalidated")
	Art.disable_qa_preview_form(Art.FORM_ID)
	if Art.battle_actions_for_form(Art.FORM_ID) != Art.BATTLE_ACTIONS or Art.action_for_battle_state("skill") != "attack":
		errors.append("preview-to-legacy action cache was not invalidated")
	if preview_before:
		Art.enable_qa_preview_form(Art.FORM_ID)
