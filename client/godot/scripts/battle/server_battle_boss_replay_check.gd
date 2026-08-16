extends RefCounted

const BattleModel := preload("res://scripts/battle/battle_model.gd")
const ServerBattleRoomModel := preload("res://scripts/battle/server_battle_room_model.gd")


static func run() -> Dictionary:
	var session := {"accountId": "account_ally", "username": "boss_hunter"}
	var room := _room_with_intent()
	var state := ServerBattleRoomModel.battle_state_from_room(room, session)
	var marked_actor := BattleModel.actor_by_id(state, BattleModel.PLAYER_PET_ID)
	var boss_actor := _actor_by_server_id(state, "party_pve_enemy_front_3")
	var checks := {
		"intent_message_is_player_readable": (
			str(state.get("message", "")) == "岩脉守护兽锁定苔团：防御、换宠，或令其无法行动来打断。"
			and not str(state.get("message", "")).contains("party_pve_")
		),
		"marked_actor_maps_by_server_id": (
			bool(marked_actor.get("bossThreatened", false))
			and str(marked_actor.get("bossThreatMechanicId", "")) == "guardian_targeted_charge_v1"
		),
		"empty_appearance_override_preserves_regular_pet": (
			str(marked_actor.get("formId", "")) == "bui_normal_red_fire10"
			and str(marked_actor.get("serverFormId", "")) == "bui_normal_red_fire10"
		),
		"boss_appearance_is_visual_only": (
			str(boss_actor.get("formId", "")) == "wuli_evolved_crystal_earth8_water2"
			and str(boss_actor.get("serverFormId", "")) == "bui_normal_thick_earth10"
		),
	}
	var event_list := {
		"kind": "battle_event_list",
		"roomId": "battle_room_boss_client",
		"round": 1,
		"turnSeq": 1,
		"events": [{
			"eventId": "boss_telegraph_event",
			"eventType": "boss_charge_telegraph",
			"round": 1,
			"sequence": 1,
			"actorId": "party_pve_enemy_front_3",
			"actorKind": "wild_pet",
			"targetActorId": "party_pve_pet_1_active_pet",
			"targetKind": "pet",
			"actionId": "boss_charge_telegraph",
			"message": "岩脉守护兽锁定苔团蓄力。下回合可防御、换宠，或令岩脉守护兽无法行动来打断。",
		}],
	}
	var mapped_events := ServerBattleRoomModel.battle_events_from_server_event_list(state, event_list)
	var mapped := mapped_events[0] as Dictionary if mapped_events.size() == 1 else {}
	var applied := BattleModel.apply_battle_event(state.duplicate(true), mapped) if not mapped.is_empty() else {}
	checks["telegraph_reuses_supported_presentation"] = (
		str(mapped.get("type", "")) == "defend"
		and str(mapped.get("serverEventType", "")) == "boss_charge_telegraph"
		and bool(applied.get("lastEventApplied", false))
		and str(applied.get("message", "")).contains("防御、换宠")
		and str(applied.get("message", "")).contains("无法行动")
	)

	var cleared_room := room.duplicate(true)
	var cleared_battle := (cleared_room.get("battle", {}) as Dictionary).duplicate(true)
	cleared_battle["bossIntent"] = null
	cleared_room["battle"] = cleared_battle
	var cleared_state := ServerBattleRoomModel.battle_state_from_room(cleared_room, session)
	checks["marker_clears_with_authority_intent"] = (
		not bool(BattleModel.actor_by_id(cleared_state, BattleModel.PLAYER_PET_ID).get("bossThreatened", false))
		and not str(cleared_state.get("message", "")).contains("锁定")
	)

	var tide_room := _room_with_tide_intent()
	var tide_state := ServerBattleRoomModel.battle_state_from_room(tide_room, session)
	var tide_core_actor := _actor_by_server_id(tide_state, "party_pve_enemy_front_1")
	var tide_boss_actor := _actor_by_server_id(tide_state, "party_pve_enemy_front_3")
	checks["tide_boss_appearance_survives_room_restore"] = (
		str(tide_boss_actor.get("formId", "")) == "driftfox_evolved_moon_gale_wind7_water3"
		and str(tide_boss_actor.get("serverFormId", "")) == "bui_normal_red_fire10"
		and str(tide_boss_actor.get("name", "")) == "潮回守护兽"
	)
	checks["tide_core_intent_uses_distinct_server_marker"] = (
		bool(tide_core_actor.get("bossThreatened", false))
		and str(tide_core_actor.get("bossThreatMechanicId", "")) == "guardian_tide_core_v1"
		and str(tide_core_actor.get("bossThreatStyle", "")) == "tide_core"
		and str(tide_state.get("message", "")).contains("本回合集火击破")
	)
	var tide_events := ServerBattleRoomModel.battle_events_from_server_event_list(tide_state, {
		"kind": "battle_event_list",
		"roomId": "battle_room_tide_client",
		"round": 2,
		"turnSeq": 2,
		"events": [{
			"eventId": "tide_open",
			"eventType": "boss_tide_core_open",
			"round": 2,
			"sequence": 1,
			"actorId": "party_pve_enemy_front_3",
			"actorKind": "wild_pet",
			"targetActorId": "party_pve_enemy_front_1",
			"targetKind": "wild_pet",
			"actionId": "boss_tide_core",
			"message": "潮回守护兽把潮核寄宿于潮回乌力。",
		}, {
			"eventId": "tide_heal",
			"eventType": "boss_tide_core_heal",
			"round": 2,
			"sequence": 2,
			"actorId": "party_pve_enemy_front_3",
			"actorKind": "wild_pet",
			"targetActorId": "party_pve_enemy_front_3",
			"targetKind": "wild_pet",
			"actionId": "boss_tide_core",
			"heal": 288,
			"healed": 288,
			"hpBefore": 900,
			"hpAfter": 1188,
			"message": "潮核回流，潮回守护兽回复18%生命。",
		}, {
			"eventId": "tide_broken",
			"eventType": "boss_tide_core_broken",
			"round": 2,
			"sequence": 3,
			"actorId": "party_pve_enemy_front_3",
			"actorKind": "wild_pet",
			"targetActorId": "party_pve_enemy_front_3",
			"targetKind": "wild_pet",
			"actionId": "boss_tide_core",
			"defenseBefore": 112,
			"defenseAfter": 72,
			"message": "潮核破碎，潮回守护兽进入退潮，防御暂时降低。",
		}, {
			"eventId": "tide_ebb_end",
			"eventType": "boss_tide_ebb_end",
			"round": 3,
			"sequence": 4,
			"actorId": "party_pve_enemy_front_3",
			"actorKind": "wild_pet",
			"targetActorId": "party_pve_enemy_front_3",
			"targetKind": "wild_pet",
			"actionId": "boss_tide_ebb_end",
			"defenseAfter": 112,
			"message": "潮势恢复，潮回守护兽的防御恢复。",
		}],
	})
	var applied_tide_open := BattleModel.apply_battle_event(tide_state.duplicate(true), tide_events[0]) if tide_events.size() == 4 else {}
	var applied_tide_heal := BattleModel.apply_battle_event(tide_state.duplicate(true), tide_events[1]) if tide_events.size() == 4 else {}
	var applied_tide_broken := BattleModel.apply_battle_event(tide_state.duplicate(true), tide_events[2]) if tide_events.size() == 4 else {}
	var applied_tide_ebb_end := BattleModel.apply_battle_event(tide_state.duplicate(true), tide_events[3]) if tide_events.size() == 4 else {}
	checks["tide_core_events_use_semantic_presentations"] = (
		tide_events.size() == 4
		and str((tide_events[0] as Dictionary).get("type", "")) == "boss_phase"
		and str((tide_events[0] as Dictionary).get("presentationState", "")) == "skill"
		and str((tide_events[0] as Dictionary).get("serverEventType", "")) == "boss_tide_core_open"
		and str((tide_events[1] as Dictionary).get("type", "")) == "spirit_heal"
		and int((tide_events[1] as Dictionary).get("heal", 0)) == 288
		and str((tide_events[1] as Dictionary).get("serverEventType", "")) == "boss_tide_core_heal"
		and str((tide_events[2] as Dictionary).get("type", "")) == "boss_phase"
		and str((tide_events[2] as Dictionary).get("presentationState", "")) == "hit"
		and str((tide_events[2] as Dictionary).get("serverEventType", "")) == "boss_tide_core_broken"
		and str((tide_events[3] as Dictionary).get("type", "")) == "boss_phase"
		and str((tide_events[3] as Dictionary).get("presentationState", "")) == "skill"
		and str((tide_events[3] as Dictionary).get("serverEventType", "")) == "boss_tide_ebb_end"
		and str(_actor_by_server_id(applied_tide_open, "party_pve_enemy_front_3").get("actionState", "")) == "skill"
		and str(_actor_by_server_id(applied_tide_heal, "party_pve_enemy_front_3").get("actionState", "")) == "heal"
		and str(_actor_by_server_id(applied_tide_broken, "party_pve_enemy_front_3").get("actionState", "")) == "hit"
		and str(_actor_by_server_id(applied_tide_ebb_end, "party_pve_enemy_front_3").get("actionState", "")) == "skill"
	)

	var ember_room := _room_with_ember_intent()
	var ember_state := ServerBattleRoomModel.battle_state_from_room(ember_room, session)
	var ember_boss_actor := _actor_by_server_id(ember_state, "party_pve_enemy_front_3")
	checks["ember_pressure_intent_marks_boss_with_trusted_limit"] = (
		bool(ember_boss_actor.get("bossThreatened", false))
		and str(ember_boss_actor.get("bossThreatMechanicId", "")) == "guardian_ember_pressure_v1"
		and str(ember_boss_actor.get("bossThreatStyle", "")) == "ember_pressure"
		and int(ember_boss_actor.get("bossThreatLimit", 0)) == 1
		and str(ember_boss_actor.get("formId", "")) == "emberhorn_red_fire8_earth2"
		and str(ember_boss_actor.get("serverFormId", "")) == "bui_normal_red_fire10"
		and absf(float(ember_boss_actor.get("battlePresentationScale", 1.0)) - 1.62) < 0.001
		and str(ember_state.get("message", "")).contains("锁定焰心守护兽\n命中1～1次：破甲")
		and str(ember_state.get("message", "")).contains("超过1次：强化攻击")
	)
	var ember_events := ServerBattleRoomModel.battle_events_from_server_event_list(ember_state, {
		"kind": "battle_event_list",
		"roomId": "battle_room_ember_client",
		"round": 2,
		"turnSeq": 2,
		"events": [{
			"eventId": "ember_open",
			"eventType": "boss_ember_pressure_open",
			"round": 1,
			"sequence": 1,
			"actorId": "party_pve_enemy_front_3",
			"actorKind": "wild_pet",
			"targetActorId": "party_pve_enemy_front_3",
			"targetKind": "wild_pet",
			"actionId": "boss_ember_pressure",
			"safeHitCap": 1,
			"message": "焰心守护兽展开焰压环。",
		}, {
			"eventId": "ember_exposed",
			"eventType": "boss_ember_pressure_exposed",
			"round": 2,
			"sequence": 2,
			"actorId": "party_pve_enemy_front_3",
			"actorKind": "wild_pet",
			"targetActorId": "party_pve_enemy_front_3",
			"targetKind": "wild_pet",
			"actionId": "boss_ember_pressure",
			"hitCount": 1,
			"safeHitCap": 1,
			"message": "有效命中1次，焰心守护兽焰甲破裂。",
		}, {
			"eventId": "ember_overheated",
			"eventType": "boss_ember_pressure_overheated",
			"round": 2,
			"sequence": 3,
			"actorId": "party_pve_enemy_front_3",
			"actorKind": "wild_pet",
			"targetActorId": "party_pve_enemy_front_3",
			"targetKind": "wild_pet",
			"actionId": "boss_ember_pressure",
			"hitCount": 2,
			"safeHitCap": 1,
			"message": "有效命中2次，焰心守护兽焰压失控。",
		}, {
			"eventId": "ember_quiet",
			"eventType": "boss_ember_pressure_quiet",
			"round": 2,
			"sequence": 4,
			"actorId": "party_pve_enemy_front_3",
			"actorKind": "wild_pet",
			"targetActorId": "party_pve_enemy_front_3",
			"targetKind": "wild_pet",
			"actionId": "boss_ember_pressure",
			"message": "焰心守护兽的焰压环自行熄灭。",
		}, {
			"eventId": "ember_end",
			"eventType": "boss_ember_pressure_end",
			"round": 3,
			"sequence": 5,
			"actorId": "party_pve_enemy_front_3",
			"actorKind": "wild_pet",
			"targetActorId": "party_pve_enemy_front_3",
			"targetKind": "wild_pet",
			"actionId": "boss_ember_pressure_end",
			"message": "焰心守护兽的焰压恢复平稳。",
		}],
	})
	var applied_ember_exposed := BattleModel.apply_battle_event(ember_state.duplicate(true), ember_events[1]) if ember_events.size() == 5 else {}
	var applied_ember_overheated := BattleModel.apply_battle_event(ember_state.duplicate(true), ember_events[2]) if ember_events.size() == 5 else {}
	checks["ember_pressure_events_use_semantic_presentations"] = (
		ember_events.size() == 5
		and str((ember_events[0] as Dictionary).get("type", "")) == "boss_phase"
		and str((ember_events[0] as Dictionary).get("presentationState", "")) == "skill"
		and str((ember_events[1] as Dictionary).get("type", "")) == "boss_phase"
		and str((ember_events[1] as Dictionary).get("presentationState", "")) == "hit"
		and str((ember_events[2] as Dictionary).get("presentationState", "")) == "skill"
		and str((ember_events[3] as Dictionary).get("presentationState", "")) == "skill"
		and str((ember_events[4] as Dictionary).get("presentationState", "")) == "skill"
		and str(_actor_by_server_id(applied_ember_exposed, "party_pve_enemy_front_3").get("actionState", "")) == "hit"
		and str(_actor_by_server_id(applied_ember_overheated, "party_pve_enemy_front_3").get("actionState", "")) == "skill"
	)
	var cleared_ember_room := ember_room.duplicate(true)
	var cleared_ember_battle := (cleared_ember_room.get("battle", {}) as Dictionary).duplicate(true)
	cleared_ember_battle["bossIntent"] = null
	cleared_ember_room["battle"] = cleared_ember_battle
	var cleared_ember_state := ServerBattleRoomModel.battle_state_from_room(cleared_ember_room, session)
	checks["ember_pressure_marker_clears_with_authority"] = (
		not bool(_actor_by_server_id(cleared_ember_state, "party_pve_enemy_front_3").get("bossThreatened", false))
		and not str(cleared_ember_state.get("message", "")).contains("焰压环")
	)
	return {"ok": checks.values().all(func(value): return bool(value)), "checks": checks}


static func _actor_by_server_id(state: Dictionary, server_actor_id: String) -> Dictionary:
	for actor_value in state.get("actors", []):
		var actor := actor_value as Dictionary
		if str(actor.get("serverActorId", "")) == server_actor_id:
			return actor
	return {}


static func _room_with_intent() -> Dictionary:
	return {
		"roomId": "battle_room_boss_client",
		"mode": "party_pve",
		"status": "ready",
		"seed": "boss-client-seed",
		"battle": {
			"round": 2,
			"phase": "command",
			"requiredActorIds": ["party_pve_player_1", "party_pve_pet_1_active_pet"],
			"submittedActorIds": [],
			"bossIntent": {
				"mechanicId": "guardian_targeted_charge_v1",
				"bossActorId": "party_pve_enemy_front_3",
				"bossName": "岩脉守护兽",
				"targetActorId": "party_pve_pet_1_active_pet",
				"targetName": "苔团",
				"announcedRound": 1,
				"resolveRound": 2,
				"actionId": "pet_bui_charge",
				"message": "岩脉守护兽锁定苔团：防御、换宠，或令其无法行动来打断。",
			},
			"actors": [{
				"actorId": "party_pve_player_1",
				"accountId": "account_ally",
				"username": "boss_hunter",
				"displayName": "策略猎人",
				"side": "ally",
				"kind": "player",
				"slotId": "ally.back.3",
				"hp": 500,
				"maxHp": 500,
				"speed": 120,
			}, {
				"actorId": "party_pve_pet_1_active_pet",
				"accountId": "account_ally",
				"username": "boss_hunter",
				"displayName": "苔团",
				"side": "ally",
				"kind": "pet",
				"slotId": "ally.front.3",
				"petId": "active_pet",
				"formId": "bui_normal_red_fire10",
				"battleAppearanceFormId": "",
				"hp": 420,
				"maxHp": 420,
				"speed": 110,
			}, {
				"actorId": "party_pve_enemy_front_3",
				"accountId": "",
				"username": "",
				"displayName": "岩脉守护兽",
				"side": "enemy",
				"kind": "wild_pet",
				"slotId": "enemy.front.3",
				"formId": "bui_normal_thick_earth10",
				"battleAppearanceFormId": "wuli_evolved_crystal_earth8_water2",
				"hp": 1688,
				"maxHp": 1688,
				"speed": 96,
			}],
		},
	}


static func _room_with_tide_intent() -> Dictionary:
	return {
		"roomId": "battle_room_tide_client",
		"mode": "party_pve",
		"status": "ready",
		"seed": "tide-client-seed",
		"battle": {
			"round": 2,
			"phase": "command",
			"requiredActorIds": ["party_pve_player_1", "party_pve_pet_1_active_pet"],
			"submittedActorIds": [],
			"bossIntent": {
				"mechanicId": "guardian_tide_core_v1",
				"bossActorId": "party_pve_enemy_front_3",
				"bossName": "潮回守护兽",
				"targetActorId": "party_pve_enemy_front_1",
				"targetName": "潮回乌力",
				"announcedRound": 1,
				"resolveRound": 2,
				"actionId": "boss_tide_core",
				"intentKind": "tide_core",
				"markerStyle": "tide_core",
				"message": "潮核寄宿于潮回乌力：本回合集火击破，否则潮回守护兽回复18%生命。",
			},
			"actors": [{
				"actorId": "party_pve_player_1",
				"accountId": "account_ally",
				"username": "boss_hunter",
				"displayName": "策略猎人",
				"side": "ally",
				"kind": "player",
				"slotId": "ally.back.3",
				"hp": 500,
				"maxHp": 500,
				"speed": 120,
			}, {
				"actorId": "party_pve_pet_1_active_pet",
				"accountId": "account_ally",
				"username": "boss_hunter",
				"displayName": "苔团",
				"side": "ally",
				"kind": "pet",
				"slotId": "ally.front.3",
				"petId": "active_pet",
				"formId": "bui_normal_red_fire10",
				"hp": 420,
				"maxHp": 420,
				"speed": 110,
			}, {
				"actorId": "party_pve_enemy_front_1",
				"accountId": "",
				"username": "",
				"displayName": "潮回乌力",
				"side": "enemy",
				"kind": "wild_pet",
				"slotId": "enemy.front.1",
				"formId": "wuli_normal_orange_fire10",
				"hp": 990,
				"maxHp": 990,
				"speed": 88,
			}, {
				"actorId": "party_pve_enemy_front_3",
				"accountId": "",
				"username": "",
				"displayName": "潮回守护兽",
				"side": "enemy",
				"kind": "wild_pet",
				"slotId": "enemy.front.3",
				"formId": "bui_normal_red_fire10",
				"battleAppearanceFormId": "driftfox_evolved_moon_gale_wind7_water3",
				"hp": 900,
				"maxHp": 1600,
				"speed": 110,
			}],
		},
	}


static func _room_with_ember_intent() -> Dictionary:
	return {
		"roomId": "battle_room_ember_client",
		"mode": "party_pve",
		"status": "ready",
		"seed": "ember-client-seed",
		"battle": {
			"round": 2,
			"phase": "command",
			"requiredActorIds": ["party_pve_player_1", "party_pve_pet_1_active_pet"],
			"submittedActorIds": [],
			"bossIntent": {
				"mechanicId": "guardian_ember_pressure_v1",
				"bossActorId": "party_pve_enemy_front_3",
				"bossName": "焰心守护兽",
				"targetActorId": "party_pve_enemy_front_3",
				"targetName": "焰心守护兽",
				"announcedRound": 1,
				"resolveRound": 2,
				"actionId": "boss_ember_pressure",
				"intentKind": "ember_pressure",
				"markerStyle": "ember_pressure",
				"safeHitCap": 1,
				"message": "焰压：锁定焰心守护兽\n命中1～1次：破甲\n超过1次：强化攻击",
			},
			"actors": [{
				"actorId": "party_pve_player_1",
				"accountId": "account_ally",
				"username": "boss_hunter",
				"displayName": "策略猎人",
				"side": "ally",
				"kind": "player",
				"slotId": "ally.back.3",
				"hp": 500,
				"maxHp": 500,
				"speed": 120,
			}, {
				"actorId": "party_pve_pet_1_active_pet",
				"accountId": "account_ally",
				"username": "boss_hunter",
				"displayName": "苔团",
				"side": "ally",
				"kind": "pet",
				"slotId": "ally.front.3",
				"petId": "active_pet",
				"formId": "bui_normal_red_fire10",
				"hp": 420,
				"maxHp": 420,
				"speed": 110,
			}, {
				"actorId": "party_pve_enemy_front_3",
				"accountId": "",
				"username": "",
				"displayName": "焰心守护兽",
				"side": "enemy",
				"kind": "wild_pet",
				"slotId": "enemy.front.3",
				"formId": "bui_normal_red_fire10",
				"battleAppearanceFormId": "emberhorn_red_fire8_earth2",
				"catchable": false,
				"battlePresentationScale": 1.62,
				"hp": 900,
				"maxHp": 1580,
				"speed": 108,
			}],
		},
	}
