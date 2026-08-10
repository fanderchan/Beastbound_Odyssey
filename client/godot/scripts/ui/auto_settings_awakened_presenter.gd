extends RefCounted

const AutoBattleSettingsModel := preload(
	"res://scripts/progression/auto_battle_settings_model.gd"
)
const WorldHudAwakenedPresenter := preload(
	"res://scripts/ui/world_hud_awakened_presenter.gd"
)


static func battle_state(
	normalized_profile: Dictionary,
	settings: Dictionary,
	player_action_options: Array[Dictionary],
	pet_slot_options: Array[Dictionary],
	heal_source_options: Array[Dictionary]
) -> Dictionary:
	var identity := WorldHudAwakenedPresenter.identity_state(normalized_profile)
	var player := _dictionary(identity.get("player", null))
	var pet := _dictionary(identity.get("activeBattlePet", null))
	return {
		"player": _unit_state(player, "人物", "尚未创建角色"),
		"pet": _unit_state(pet, "宠物", "尚未出战宠物"),
		"playerActionOptions": player_action_options.duplicate(true),
		"petSlotOptions": pet_slot_options.duplicate(true),
		"targetOptions": AutoBattleSettingsModel.target_mode_options(),
		"healSourceOptions": heal_source_options.duplicate(true),
		"playerFirstAction": str(settings.get(
			AutoBattleSettingsModel.PLAYER_FIRST_ROUND_ACTION_KEY,
			AutoBattleSettingsModel.ACTION_ATTACK
		)),
		"playerNormalAction": str(settings.get(
			AutoBattleSettingsModel.PLAYER_NORMAL_ACTION_KEY,
			AutoBattleSettingsModel.ACTION_ATTACK
		)),
		"petFirstSlot": str(AutoBattleSettingsModel.normalized_pet_skill_slot(
			int(settings.get(AutoBattleSettingsModel.PET_FIRST_ROUND_SLOT_KEY, 1))
		)),
		"petNormalSlot": str(AutoBattleSettingsModel.normalized_pet_skill_slot(
			int(settings.get(AutoBattleSettingsModel.PET_NORMAL_SLOT_KEY, 1))
		)),
		"targetMode": str(settings.get(
			AutoBattleSettingsModel.TARGET_MODE_KEY,
			AutoBattleSettingsModel.TARGET_FIRST_LIVING
		)),
		"healingEnabled": bool(settings.get(
			AutoBattleSettingsModel.HEALING_ENABLED_KEY,
			true
		)),
		"playerHpPercent": int(settings.get(
			AutoBattleSettingsModel.PLAYER_HP_PERCENT_KEY,
			45
		)),
		"petHpPercent": int(settings.get(
			AutoBattleSettingsModel.PET_HP_PERCENT_KEY,
			45
		)),
		"healPriority": _normalized_priority(settings),
	}


static func _unit_state(source: Dictionary, fallback_name: String, empty_name: String) -> Dictionary:
	if source.is_empty() or not bool(source.get("available", false)):
		return {
			"available": false,
			"name": empty_name,
			"levelText": "",
			"portraitTexturePath": "",
		}
	var level := maxi(0, int(source.get("level", 0)))
	return {
		"available": true,
		"name": str(source.get("name", fallback_name)).strip_edges(),
		"levelText": "Lv.%d" % level if level > 0 else "",
		"portraitTexturePath": str(source.get("portraitTexturePath", "")).strip_edges(),
	}


static func _normalized_priority(settings: Dictionary) -> Array[String]:
	var priority := AutoBattleSettingsModel.normalized_heal_priority(
		settings.get(AutoBattleSettingsModel.HEAL_PRIORITY_KEY, [])
	)
	while priority.size() < AutoBattleSettingsModel.MAX_HEAL_PRIORITY_SLOTS:
		priority.append(AutoBattleSettingsModel.HEAL_ITEM_MEAT)
	return priority.slice(0, AutoBattleSettingsModel.MAX_HEAL_PRIORITY_SLOTS)


static func _dictionary(value) -> Dictionary:
	return (value as Dictionary).duplicate(true) if value is Dictionary else {}
