extends RefCounted

const BattleAudioCueModel := preload("res://scripts/audio/battle_audio_cue_model.gd")
const DOWN_PROGRESS_FLOOR := 0.74
const DOWN_PROGRESS_AFTER_CONTACT := 0.28
const REACTION_PROGRESS_AFTER_CONTACT := 0.08

var _manager: Object
var _event: Dictionary = {}
var _requests_by_phase: Dictionary = {}
var _contact_progress := 0.0
var _reaction_progress := 0.0
var _down_progress := 0.0
var _fired_phases: Dictionary = {}


func configure(manager: Object) -> void:
	_manager = manager


func begin_event(event: Dictionary, actor_context: Dictionary = {}) -> void:
	end_event()
	_event = event.duplicate(true)
	for phase in [
		BattleAudioCueModel.PHASE_ACTION_START,
		BattleAudioCueModel.PHASE_CONTACT,
		BattleAudioCueModel.PHASE_REACTION,
		BattleAudioCueModel.PHASE_DOWN,
	]:
		_requests_by_phase[phase] = BattleAudioCueModel.requests_for_phase(
			_event,
			phase,
			actor_context
		)
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
	_fire_phase(BattleAudioCueModel.PHASE_ACTION_START)
	update_progress(0.0)


func update_progress(progress: float) -> void:
	if _event.is_empty():
		return
	var normalized := clampf(progress, 0.0, 1.0)
	if normalized >= _contact_progress:
		_fire_phase(BattleAudioCueModel.PHASE_CONTACT)
	if normalized >= _reaction_progress:
		_fire_phase(BattleAudioCueModel.PHASE_REACTION)
	if normalized >= _down_progress:
		_fire_phase(BattleAudioCueModel.PHASE_DOWN)


func end_event() -> void:
	_event.clear()
	_requests_by_phase.clear()
	_fired_phases.clear()
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
	}


func _fire_phase(phase: String) -> void:
	if bool(_fired_phases.get(phase, false)):
		return
	_fired_phases[phase] = true
	var requests = _requests_by_phase.get(phase, [])
	if not (requests is Array):
		return
	for value in requests:
		if not (value is Dictionary):
			continue
		var request := value as Dictionary
		var cue_id := str(request.get("cueId", ""))
		if cue_id == "" or _manager == null or not is_instance_valid(_manager):
			continue
		if _manager.has_method("play_cue"):
			_manager.call("play_cue", cue_id, {
				"priority": int(request.get("priority", 0)),
			})
