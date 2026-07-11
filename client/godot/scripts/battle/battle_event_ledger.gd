extends RefCounted

const SCHEMA_VERSION := 1


static func build_from_applied_state(state: Dictionary, source_event: Dictionary, before_snapshots: Dictionary, timeline: Dictionary = {}) -> Dictionary:
	var event_type := str(state.get("lastEventType", source_event.get("type", "")))
	var sequence := int(source_event.get("sequence", 0))
	var battle_id := str(state.get("id", ""))
	var round_no := int(state.get("round", 1))
	var declared_target_id := str(source_event.get("targetId", ""))
	var resolved_target_id := str(state.get("lastTargetId", declared_target_id))
	var target_ids := _string_array(state.get("lastTargetIds", []))
	if target_ids.is_empty() and resolved_target_id != "":
		target_ids.append(resolved_target_id)
	var retargeted := declared_target_id != "" and resolved_target_id != "" and declared_target_id != resolved_target_id
	if event_type == "status_skip":
		retargeted = false
	var participant_ids := _string_array(state.get("lastParticipants", source_event.get("participantIds", [])))
	if participant_ids.is_empty():
		var attacker_id := str(source_event.get("attackerId", ""))
		if attacker_id != "":
			participant_ids.append(attacker_id)
	var effect_per_target := _effect_per_target_for_state(state, target_ids)
	var ledger := {
		"schemaVersion": SCHEMA_VERSION,
		"kind": "battle_event_ledger",
		"eventId": "%s:r%d:s%d:%s" % [battle_id, round_no, sequence, event_type],
		"battleId": battle_id,
		"round": round_no,
		"sequence": sequence,
		"type": event_type,
		"attackerId": str(source_event.get("attackerId", state.get("lastAttackerId", ""))),
		"participantIds": participant_ids,
		"declaredTargetId": declared_target_id,
		"resolvedTargetId": resolved_target_id,
		"targetIds": target_ids,
		"targetSide": str(source_event.get("targetSide", "")),
		"retargeted": retargeted,
		"speed": int(source_event.get("speed", 0)),
		"damage": int(state.get("lastDamage", 0)),
		"heal": int(state.get("lastHeal", 0)),
		"effectPerTarget": effect_per_target,
		"actorDamagePerTarget": _duplicate_dict(state.get("lastActorDamagePerTarget", {})),
		"rideDamagePerTarget": _duplicate_dict(state.get("lastRideDamagePerTarget", {})),
		"dodged": bool(state.get("lastDodged", false)),
		"critical": bool(state.get("lastCritical", false)),
		"counterTriggered": bool(state.get("lastCounterTriggered", false)),
		"reactionKind": str(state.get("lastReactionKind", "")),
		"launch": bool(state.get("lastLaunch", false)),
		"launchMode": str(state.get("lastLaunchMode", "")),
		"canLaunch": bool(source_event.get("canLaunch", false)),
		"statusId": str(state.get("lastStatusId", source_event.get("statusId", ""))),
		"statusResult": str(state.get("lastStatusResult", "")),
		"statusChanges": _duplicate_array(state.get("lastStatusChanges", [])),
		"statusRoll": float(state.get("lastStatusRoll", -1.0)),
		"statusChance": float(state.get("lastStatusChance", -1.0)),
		"statusResistance": float(state.get("lastStatusResistance", 0.0)),
		"statusResultPerTarget": _duplicate_dict(state.get("lastStatusResultPerTarget", {})),
		"statusRollPerTarget": _duplicate_dict(state.get("lastStatusRollPerTarget", {})),
		"statusChancePerTarget": _duplicate_dict(state.get("lastStatusChancePerTarget", {})),
		"statusResistancePerTarget": _duplicate_dict(state.get("lastStatusResistancePerTarget", {})),
		"dodgePerTarget": _duplicate_dict(state.get("lastDodgePerTarget", {})),
		"criticalPerTarget": _duplicate_dict(state.get("lastCriticalPerTarget", {})),
		"fieldEffectId": str(state.get("lastFieldEffectId", source_event.get("fieldEffectId", ""))),
		"timeline": timeline.duplicate(true),
		"targets": _target_results(state, before_snapshots, target_ids, effect_per_target),
		"message": str(state.get("message", "")),
	}
	if source_event.has("actionId"):
		ledger["actionId"] = str(source_event.get("actionId", ""))
	if source_event.has("skillName"):
		ledger["skillName"] = str(source_event.get("skillName", ""))
	if source_event.has("skillId"):
		ledger["skillId"] = str(source_event.get("skillId", ""))
	if source_event.has("spiritId"):
		ledger["spiritId"] = str(source_event.get("spiritId", ""))
	if source_event.has("itemId"):
		ledger["itemId"] = str(source_event.get("itemId", ""))
	if source_event.has("petId"):
		ledger["petId"] = str(source_event.get("petId", ""))
	if source_event.has("serverResolved"):
		ledger["serverResolved"] = bool(source_event.get("serverResolved", false))
	if source_event.has("serverEventId"):
		ledger["serverEventId"] = str(source_event.get("serverEventId", ""))
	if source_event.has("counterSourceEventId"):
		ledger["counterSourceEventId"] = str(source_event.get("counterSourceEventId", ""))
	return ledger


static func playback_event(source_event: Dictionary, ledger: Dictionary) -> Dictionary:
	var event := source_event.duplicate(true)
	var resolved_target_id := str(ledger.get("resolvedTargetId", ""))
	if resolved_target_id != "":
		event["targetId"] = resolved_target_id
	event["declaredTargetId"] = str(ledger.get("declaredTargetId", ""))
	event["resolvedTargetId"] = resolved_target_id
	event["targetIds"] = ledger.get("targetIds", [])
	event["retargeted"] = bool(ledger.get("retargeted", false))
	event["ledgerEventId"] = str(ledger.get("eventId", ""))
	event["timeline"] = ledger.get("timeline", {}).duplicate(true)
	event["damage"] = int(ledger.get("damage", event.get("damage", 0)))
	event["heal"] = int(ledger.get("heal", event.get("heal", 0)))
	event["effectPerTarget"] = ledger.get("effectPerTarget", {}).duplicate(true)
	event["actorDamagePerTarget"] = ledger.get("actorDamagePerTarget", {}).duplicate(true)
	event["rideDamagePerTarget"] = ledger.get("rideDamagePerTarget", {}).duplicate(true)
	event["dodged"] = bool(ledger.get("dodged", false))
	event["critical"] = bool(ledger.get("critical", false))
	event["counterTriggered"] = bool(ledger.get("counterTriggered", false))
	event["reactionKind"] = str(ledger.get("reactionKind", event.get("reactionKind", "")))
	event["launch"] = bool(ledger.get("launch", false))
	event["launchMode"] = str(ledger.get("launchMode", event.get("launchMode", "")))
	event["statusId"] = str(ledger.get("statusId", event.get("statusId", "")))
	event["statusResult"] = str(ledger.get("statusResult", event.get("statusResult", "")))
	event["statusChanges"] = _duplicate_array(ledger.get("statusChanges", []))
	event["statusRoll"] = float(ledger.get("statusRoll", event.get("statusRoll", -1.0)))
	event["statusChance"] = float(ledger.get("statusChance", event.get("statusChance", -1.0)))
	event["statusResistance"] = float(ledger.get("statusResistance", event.get("statusResistance", 0.0)))
	event["statusResultPerTarget"] = _duplicate_dict(ledger.get("statusResultPerTarget", event.get("statusResultPerTarget", {})))
	event["statusRollPerTarget"] = _duplicate_dict(ledger.get("statusRollPerTarget", event.get("statusRollPerTarget", {})))
	event["statusChancePerTarget"] = _duplicate_dict(ledger.get("statusChancePerTarget", event.get("statusChancePerTarget", {})))
	event["statusResistancePerTarget"] = _duplicate_dict(ledger.get("statusResistancePerTarget", event.get("statusResistancePerTarget", {})))
	event["dodgePerTarget"] = _duplicate_dict(ledger.get("dodgePerTarget", event.get("dodgePerTarget", {})))
	event["criticalPerTarget"] = _duplicate_dict(ledger.get("criticalPerTarget", event.get("criticalPerTarget", {})))
	event["fieldEffectId"] = str(ledger.get("fieldEffectId", event.get("fieldEffectId", "")))
	if ledger.has("actionId"):
		event["actionId"] = str(ledger.get("actionId", ""))
	return event


static func _effect_per_target_for_state(state: Dictionary, target_ids: Array[String]) -> Dictionary:
	var effects := {}
	var source_effects = state.get("lastEffectPerTarget", {})
	if source_effects is Dictionary:
		for key in (source_effects as Dictionary).keys():
			effects[str(key)] = int((source_effects as Dictionary).get(key, 0))
	if effects.is_empty() and target_ids.size() == 1:
		var value := int(state.get("lastDamage", 0))
		if value <= 0:
			value = int(state.get("lastHeal", 0))
		if value > 0:
			effects[target_ids[0]] = value
	return effects


static func _target_results(state: Dictionary, before_snapshots: Dictionary, target_ids: Array[String], effect_per_target: Dictionary) -> Array[Dictionary]:
	var results: Array[Dictionary] = []
	var actor_damage_per_target := _duplicate_dict(state.get("lastActorDamagePerTarget", {}))
	var ride_damage_per_target := _duplicate_dict(state.get("lastRideDamagePerTarget", {}))
	for target_id in target_ids:
		var before := _snapshot_for(before_snapshots, target_id)
		var after := _actor_by_id(state, target_id)
		results.append({
			"targetId": target_id,
			"hpBefore": int(before.get("hp", 0)),
			"hpAfter": int(after.get("hp", 0)),
			"stateBefore": str(before.get("actionState", "")),
			"stateAfter": str(after.get("actionState", "")),
			"statusesBefore": _duplicate_dict(before.get("statuses", {})),
			"statusesAfter": _duplicate_dict(after.get("statuses", {})),
			"effect": int(effect_per_target.get(target_id, 0)),
			"actorDamage": int(actor_damage_per_target.get(target_id, 0)),
			"rideDamage": int(ride_damage_per_target.get(target_id, 0)),
			"ridePetInstanceIdBefore": str(before.get("ridePetInstanceId", "")),
			"ridePetInstanceIdAfter": str(after.get("ridePetInstanceId", "")),
			"rideHpBefore": int(before.get("ridePetHp", 0)),
			"rideHpAfter": int(after.get("ridePetHp", 0)),
			"rideMaxHpBefore": int(before.get("ridePetMaxHp", 0)),
			"rideMaxHpAfter": int(after.get("ridePetMaxHp", 0)),
			"rideStateBefore": str(before.get("ridePetBattleState", "")),
			"rideStateAfter": str(after.get("ridePetBattleState", "")),
			"ridePetKnockedAfter": bool(after.get("ridePetKnocked", false)),
			"revivableAfter": bool(after.get("revivable", true)),
			"petBattleStateAfter": str(after.get("petBattleState", "")),
		})
	return results


static func _snapshot_for(before_snapshots: Dictionary, actor_id: String) -> Dictionary:
	var value = before_snapshots.get(actor_id, {})
	if value is Dictionary:
		return value as Dictionary
	return {}


static func _actor_by_id(state: Dictionary, actor_id: String) -> Dictionary:
	for value in state.get("actors", []):
		var actor := value as Dictionary
		if str(actor.get("id", "")) == actor_id:
			return actor
	return {}


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value:
			var text := str(item)
			if text != "":
				result.append(text)
	elif str(value) != "":
		result.append(str(value))
	return result


static func _duplicate_dict(value) -> Dictionary:
	if value is Dictionary:
		return (value as Dictionary).duplicate(true)
	return {}


static func _duplicate_array(value) -> Array:
	if value is Array:
		return (value as Array).duplicate(true)
	return []
