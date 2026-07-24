extends RefCounted

const BattleAudioCueModel := preload("res://scripts/audio/battle_audio_cue_model.gd")
const DOWN_PROGRESS_FLOOR := 0.74
const DOWN_PROGRESS_AFTER_CONTACT := 0.28
const REACTION_PROGRESS_AFTER_CONTACT := 0.08

var _manager: Object
var _event: Dictionary = {}
var _markers: Array[Dictionary] = []
var _contact_progress := 0.0
var _reaction_progress := 0.0
var _down_progress := 0.0
var _fired_phases: Dictionary = {}
var _fired_marker_ids: Dictionary = {}


func configure(manager: Object) -> void:
	_manager = manager


func begin_event(event: Dictionary, actor_context: Dictionary = {}) -> void:
	end_event()
	_event = event.duplicate(true)
	_markers = BattleAudioCueModel.timed_markers(_event, actor_context)
	_contact_progress = BattleAudioCueModel.damage_reveal_progress(_event)
	_reaction_progress = minf(
		0.94,
		_contact_progress + REACTION_PROGRESS_AFTER_CONTACT
	)
	_down_progress = minf(
		0.96,
		maxf(DOWN_PROGRESS_FLOOR, _contact_progress + DOWN_PROGRESS_AFTER_CONTACT)
	)
	var timeline = _event.get("timeline", {})
	if timeline is Dictionary and (timeline as Dictionary).has("downSoundProgress"):
		_down_progress = clampf(
			float((timeline as Dictionary).get("downSoundProgress", _down_progress)),
			0.0,
			0.99
		)
	for marker in _markers:
		var phase := str(marker.get("phase", ""))
		var marker_progress := float(marker.get("progress", 0.0))
		if phase == BattleAudioCueModel.PHASE_CONTACT:
			_contact_progress = minf(_contact_progress, marker_progress)
		elif phase == BattleAudioCueModel.PHASE_REACTION:
			_reaction_progress = minf(_reaction_progress, marker_progress)
		elif phase == BattleAudioCueModel.PHASE_DOWN:
			_down_progress = minf(_down_progress, marker_progress)
	update_progress(0.0)


func update_progress(progress: float) -> void:
	if _event.is_empty():
		return
	var normalized := clampf(progress, 0.0, 1.0)
	for marker in _markers:
		if normalized >= float(marker.get("progress", 0.0)):
			_fire_marker(marker)


func end_event() -> void:
	_event.clear()
	_markers.clear()
	_fired_phases.clear()
	_fired_marker_ids.clear()
	_contact_progress = 0.0
	_reaction_progress = 0.0
	_down_progress = 0.0


func debug_snapshot() -> Dictionary:
	return {
		"active": not _event.is_empty(),
		"contactProgress": _contact_progress,
		"reactionProgress": _reaction_progress,
		"downProgress": _down_progress,
		"firedPhases": _fired_phases.keys(),
		"markerCount": _markers.size(),
		"firedMarkerCount": _fired_marker_ids.size(),
	}


func _fire_marker(marker: Dictionary) -> void:
	var marker_id := str(marker.get("markerId", ""))
	if marker_id == "":
		marker_id = "%s@%.4f" % [
			str(marker.get("cueId", "")),
			float(marker.get("progress", 0.0)),
		]
	if bool(_fired_marker_ids.get(marker_id, false)):
		return
	_fired_marker_ids[marker_id] = true
	var phase := str(marker.get("phase", ""))
	if phase != "":
		_fired_phases[phase] = true
	var cue_id := str(marker.get("cueId", ""))
	if cue_id == "" or _manager == null or not is_instance_valid(_manager):
		return
	if not _manager.has_method("play_cue"):
		return
	var options := {}
	var marker_options = marker.get("options", {})
	if marker_options is Dictionary:
		options = (marker_options as Dictionary).duplicate(true)
	options["priority"] = int(marker.get("priority", 0))
	_manager.call("play_cue", cue_id, options)
