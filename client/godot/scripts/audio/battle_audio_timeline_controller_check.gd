extends SceneTree

const BattleAudioTimelineController := preload(
	"res://scripts/audio/battle_audio_timeline_controller.gd"
)


class FakeAudioManager:
	extends Node
	var calls: Array[Dictionary] = []

	func play_cue(cue_id: String, options: Dictionary = {}) -> bool:
		calls.append({"cueId": cue_id, "options": options.duplicate(true)})
		return true


func _initialize() -> void:
	var errors: Array[String] = []
	var manager := FakeAudioManager.new()
	get_root().add_child(manager)
	var controller := BattleAudioTimelineController.new()
	controller.configure(manager)
	controller.begin_event({
		"type": "counter_attack",
		"damage": 40,
		"critical": true,
		"launch": true,
		"launchMode": "straight",
		"timeline": {
			"damageRevealProgress": 0.50,
			"downSoundProgress": 0.82,
		},
		"targets": [{
			"id": "target",
			"stateBefore": "idle",
			"stateAfter": "down",
			"hpBefore": 40,
			"hpAfter": 0,
		}],
	}, {
		"attackerKind": "pet",
		"targetKind": "pet",
	})
	var start_ids := _cue_ids(manager.calls)
	if start_ids != [
		"combat.counter",
		"combat.motion_pet",
		"creature.pet_effort",
	]:
		errors.append("动作起点 cue 顺序错误：%s" % JSON.stringify(start_ids))
	controller.update_progress(0.49)
	if manager.calls.size() != 3:
		errors.append("命中帧前提前播放了接触声")
	controller.update_progress(0.50)
	var contact_count := manager.calls.size()
	if not _cue_ids(manager.calls).has("combat.hit_heavy"):
		errors.append("命中帧没有重击声")
	if not _cue_ids(manager.calls).has("combat.critical"):
		errors.append("命中帧没有暴击强调")
	controller.update_progress(0.50)
	if manager.calls.size() != contact_count:
		errors.append("同一命中阈值重复触发")
	controller.update_progress(0.58)
	if not _cue_ids(manager.calls).has("combat.launch"):
		errors.append("击飞反应没有在命中后触发")
	if not _cue_ids(manager.calls).has("creature.pet_hurt"):
		errors.append("宠物受击声没有在反应阶段触发")
	controller.update_progress(0.78)
	if _cue_ids(manager.calls).has("combat.down"):
		errors.append("倒地声早于显式视觉倒地标记")
	controller.update_progress(0.82)
	if not _cue_ids(manager.calls).has("combat.down"):
		errors.append("倒地声没有在显式视觉标记触发")
	var final_count := manager.calls.size()
	controller.update_progress(1.0)
	if manager.calls.size() != final_count:
		errors.append("事件末帧重复触发")
	controller.end_event()
	if bool(controller.debug_snapshot().get("active", true)):
		errors.append("事件结束后调度状态未清空")

	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.battle_audio_timeline_controller_check",
		"result": "PASS" if errors.is_empty() else "FAIL",
		"cueIds": _cue_ids(manager.calls),
		"cueCount": manager.calls.size(),
		"errors": errors,
	}
	print("battle audio timeline controller check: %s" % JSON.stringify(report))
	manager.queue_free()
	quit(0 if errors.is_empty() else 1)


func _cue_ids(calls: Array[Dictionary]) -> Array[String]:
	var result: Array[String] = []
	for call in calls:
		result.append(str(call.get("cueId", "")))
	return result
