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
