extends SceneTree

const BattleModel := preload("res://scripts/battle/battle_model.gd")


func _initialize() -> void:
	var errors: Array[String] = []
	var local_state := BattleModel.create_stat_formula_test_battle({"name": "反击动作检查"})
	var local_event := {
		"type": "counter_attack",
		"attackerId": "enemy_front_3",
		"targetId": "ally_attack_high",
		"targetSide": BattleModel.SIDE_ALLY,
		"damage": 10,
		"speed": 120,
		"sequence": 1,
		"canLaunch": false,
		"canCounter": false,
		"forceDodge": false,
		"forceCritical": false,
	}
	local_state = BattleModel.apply_battle_event(local_state, local_event)
	var local_attacker := BattleModel.actor_by_id(local_state, "enemy_front_3")
	if str(local_attacker.get("actionState", "")) != "counter_attack":
		errors.append("本地反击者没有进入 counter_attack 动作")

	var server_state := BattleModel.create_stat_formula_test_battle({"name": "服务器反击动作检查"})
	var server_target_before := BattleModel.actor_by_id(server_state, "ally_attack_high")
	var hp_before := int(server_target_before.get("hp", 0))
	var server_event := local_event.duplicate(true)
	server_event["serverResolved"] = true
	server_event["serverHpBefore"] = hp_before
	server_event["serverHpAfter"] = maxi(0, hp_before - 10)
	server_event["serverBlocked"] = false
	server_event["serverLaunched"] = false
	server_state = BattleModel.apply_battle_event(server_state, server_event)
	var server_attacker := BattleModel.actor_by_id(server_state, "enemy_front_3")
	if str(server_attacker.get("actionState", "")) != "counter_attack":
		errors.append("服务器回放反击者没有进入 counter_attack 动作")

	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.battle_counter_action_state_check",
		"result": "PASS" if errors.is_empty() else "FAIL",
		"localActionState": str(local_attacker.get("actionState", "")),
		"serverActionState": str(server_attacker.get("actionState", "")),
		"errors": errors,
	}
	print("battle counter action state check: %s" % JSON.stringify(report))
	quit(0 if errors.is_empty() else 1)
