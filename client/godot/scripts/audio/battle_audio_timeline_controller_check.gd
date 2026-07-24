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
		},
		"targets": [{
			"id": "target",
			"stateBefore": "idle",
			"stateAfter": "launched",
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
	if _cue_ids(manager.calls).has("combat.launch"):
		errors.append("击飞声仍与命中声同帧触发")
	controller.update_progress(0.50)
	if manager.calls.size() != contact_count:
		errors.append("同一命中阈值重复触发")
	controller.update_progress(0.52)
	if _cue_ids(manager.calls).has("combat.launch"):
		errors.append("击飞声早于首个离地保护间隔")
	var before_launch_count := manager.calls.size()
	controller.update_progress(0.53)
	var launch_delta := _cue_ids(
		manager.calls.slice(before_launch_count)
	)
	if launch_delta != ["combat.launch", "creature.pet_hurt"]:
		errors.append(
			"离地帧没有独立播放击飞与宠物受伤声：%s"
			% JSON.stringify(launch_delta)
		)
	var final_count := manager.calls.size()
	controller.update_progress(1.0)
	if manager.calls.size() != final_count:
		errors.append("事件末帧重复触发")
	if _cue_ids(manager.calls).has("combat.down"):
		errors.append("直线击飞的 launched 结果错误叠加了 down cue")
	controller.end_event()
	if bool(controller.debug_snapshot().get("active", true)):
		errors.append("事件结束后调度状态未清空")

	manager.calls.clear()
	controller.begin_event({
		"type": "attack",
		"damage": 40,
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
	})
	controller.update_progress(0.78)
	if _cue_ids(manager.calls).has("combat.down"):
		errors.append("普通倒地声早于显式视觉倒地标记")
	controller.update_progress(0.82)
	if not _cue_ids(manager.calls).has("combat.down"):
		errors.append("普通倒地声没有在显式视觉标记触发")
	controller.end_event()

	manager.calls.clear()
	controller.begin_event({
		"type": "combo_attack",
		"attackerId": "ally_a",
		"participantIds": ["ally_a", "ally_b", "ally_c"],
		"damage": 54,
		"timeline": {
			"damageRevealProgress": 0.60,
			"comboContactProgresses": [0.20, 0.40, 0.60],
		},
	})
	if _cue_ids(manager.calls) != ["combat.combo_start"]:
		errors.append("合击起点没有只播放共同蓄势声")
	controller.update_progress(0.20)
	controller.update_progress(0.40)
	controller.update_progress(0.60)
	var combo_ids := _cue_ids(manager.calls)
	if combo_ids.count("combat.hit_light") != 3:
		errors.append("三人合击没有逐人触发三次轻接触：%s" % JSON.stringify(combo_ids))
	if combo_ids.count("combat.hit_combo") != 1:
		errors.append("三人合击没有只触发一次主冲击：%s" % JSON.stringify(combo_ids))
	var first_contact_options := {}
	for call in manager.calls:
		if str(call.get("cueId", "")) == "combat.hit_light":
			first_contact_options = call.get("options", {}) as Dictionary
			break
	if (
		not first_contact_options.has("cooldownKey")
		or not first_contact_options.has("gainDbOffset")
		or not first_contact_options.has("pitchScale")
	):
		errors.append("合击轻接触的增益／音高选项没有传给 manager")

	manager.calls.clear()
	controller.begin_event({
		"type": "attack",
		"damage": 90,
		"launch": true,
		"launchMode": "bounce",
		"timeline": {
			"damageRevealProgress": 0.30,
			"launchSoundProgress": 0.30,
			"bounceImpactProgress": 0.31,
		},
	})
	controller.update_progress(0.30)
	if _cue_ids(manager.calls).has("combat.launch"):
		errors.append("反弹击飞声仍与命中声同帧")
	controller.update_progress(0.32)
	if _cue_ids(manager.calls).has("combat.launch"):
		errors.append("反弹击飞声早于首个可见离地帧")
	controller.update_progress(0.33)
	if _cue_ids(manager.calls).count("combat.launch") != 1:
		errors.append("反弹击飞没有在受保护的离地点播放一次 launch")
	if _cue_ids(manager.calls).has("combat.bounce_edge"):
		errors.append("反弹撞边声早于显式撞边点")
	controller.update_progress(0.35)
	if _cue_ids(manager.calls).has("combat.bounce_edge"):
		errors.append("反弹撞边声没有晚于 launch")
	controller.update_progress(0.36)
	if _cue_ids(manager.calls).count("combat.bounce_edge") != 1:
		errors.append("反弹撞边声没有在受保护的撞边点播放一次")

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
