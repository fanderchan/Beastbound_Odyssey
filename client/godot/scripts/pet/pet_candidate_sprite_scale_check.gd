extends RefCounted

const Art := preload("res://scripts/pet/pet_art_catalog.gd")
const Actions := preload("res://scripts/pet/pet_action_asset_catalog.gd")
const Scales := preload("res://scripts/pet/pet_battle_sprite_scale_catalog.gd")
const Presentation := preload("res://scripts/battle/battle_visual_presentation_model.gd")
const FORM_ID := "mossback_sunbaked_earth6_fire4"


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	var original_record := Art.form_record(FORM_ID)
	var was_preview := Actions.is_qa_preview_enabled(FORM_ID)
	Actions.disable_qa_preview_form(FORM_ID)
	Scales.warm_battle_state({})
	if Actions.supports_form(FORM_ID) or Scales.sprite_scale_for_form(FORM_ID) != 1.0:
		errors.append("candidate scale escaped the explicit preview gate")
	if not Actions.enable_qa_preview_form(FORM_ID):
		errors.append("candidate preview could not load the existing bundle")
	var actor := {"kind": "wild_pet", "formId": FORM_ID, "catchable": true}
	var original_actor := actor.duplicate(true)
	if not Scales.warm_battle_state({"actors": [actor]}):
		errors.append("candidate preview has no explicit sprite scale")
	if not is_equal_approx(Scales.sprite_scale_for_actor(actor), 1.55):
		errors.append("sunbaked preview did not apply its measured body scale")
	var report := Scales.idle_bounds_report(FORM_ID, 0.74)
	errors.append_array(report.get("errors", []) as Array)
	var bounds: Dictionary = report.get("estimatedVisibleBounds", {})
	var widths: Array = bounds.get("width", [0.0, 0.0])
	var heights: Array = bounds.get("height", [0.0, 0.0])
	if widths[0] < 88.0 or widths[1] > 106.0 or heights[0] < 57.0 or heights[1] > 80.0:
		errors.append("sunbaked idle body no longer reads as a wide low armored pet")
	if actor != original_actor or Presentation.actor_presentation_scale(actor) != 1.0:
		errors.append("preview sprite sizing changed authoritative actor facts")
	actor["catchable"] = false
	if Scales.sprite_scale_for_actor(actor) != 1.0:
		errors.append("ordinary candidate sizing leaked into a boss")
	if not is_equal_approx(Scales.sprite_scale_for_form("wuli_evolved_crystal_earth8_water2"), 1.3):
		errors.append("released crystal wuli scale changed")
	errors.append_array(Scales.validation_errors())
	Actions.disable_qa_preview_form(FORM_ID)
	if Scales.sprite_scale_for_form(FORM_ID) != 1.0 or Actions.supports_form(FORM_ID):
		errors.append("candidate scale survived disabling its preview")
	if Art.form_record(FORM_ID) != original_record:
		errors.append("candidate preview changed release metadata")
	if was_preview:
		Actions.enable_qa_preview_form(FORM_ID)
	print("candidate pet sprite scale check: " + JSON.stringify({"report": report, "errors": errors}))
	return errors
