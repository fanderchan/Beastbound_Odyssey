extends RefCounted

const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)

const PROFILE_ID := "phase383_firebud_v2_owner_review"
const EXPECTED_BUNDLE_ID := "firebud_region_visual_v2"
const ALLOWED_MAP_IDS: Array[String] = [
	"firebud_village_gate",
	"firebud_training_yard",
]
const PLAYER_NAME := "焰芽斗士"
const PLAYER_APPEARANCE_ID := "ember_spark_v1"
const ACTIVE_PET_INSTANCE_ID := "phase383_firebud_showcase_pet"
const ACTIVE_PET_FORM_ID := "bui_novice_sprout_earth5_wind5"


static func context_allowed(map_id: String, bundle_id: String) -> bool:
	return ALLOWED_MAP_IDS.has(map_id) and bundle_id == EXPECTED_BUNDLE_ID


static func build() -> Dictionary:
	var profile := PlayerProgressModel.default_profile()
	var player_value = profile.get("player", {})
	var player := (
		(player_value as Dictionary).duplicate(true)
		if player_value is Dictionary
		else {}
	)
	player["name"] = PLAYER_NAME
	player["level"] = 80
	player["exp"] = 91703
	player["nextExp"] = 119635
	player["appearanceId"] = PLAYER_APPEARANCE_ID
	player["elements"] = {"earth": 6, "water": 3, "fire": 0, "wind": 1}
	profile["player"] = player
	var battle_pet := PlayerProgressModel.create_pet_instance_from_form(
		ACTIVE_PET_INSTANCE_ID,
		"芽耳布伊",
		ACTIVE_PET_FORM_ID,
		PlayerProgressModel.PET_STATE_BATTLE,
		40
	)
	profile["petInstances"] = [battle_pet]
	profile["activePetInstanceId"] = ACTIVE_PET_INSTANCE_ID
	# Map-art review needs an unmounted formal player silhouette.  The battle pet
	# exists for the real HUD identity card, but no ride state is fabricated.
	profile["ridePetInstanceId"] = ""
	return PlayerProgressModel.normalize_profile(profile)


static func errors_for(profile: Dictionary) -> Array[String]:
	var errors: Array[String] = []
	if profile == PlayerProgressModel.default_profile():
		errors.append("Phase383 展示档案仍等于默认空档案")
	var player_value = profile.get("player", {})
	var player := player_value as Dictionary if player_value is Dictionary else {}
	if str(player.get("name", "")) != PLAYER_NAME:
		errors.append("Phase383 展示人物名称不一致")
	if str(player.get("appearanceId", "")) != PLAYER_APPEARANCE_ID:
		errors.append("Phase383 展示人物没有使用正式形象")
	if str(profile.get("activePetInstanceId", "")) != ACTIVE_PET_INSTANCE_ID:
		errors.append("Phase383 展示档案没有精确选中出战宠")
	if str(profile.get("ridePetInstanceId", "")) != "":
		errors.append("Phase383 地图审图档案不得伪造骑乘状态")
	var active_pet := PlayerProgressModel.pet_instance_by_id(
		profile,
		ACTIVE_PET_INSTANCE_ID
	)
	if active_pet.is_empty():
		errors.append("Phase383 展示出战宠实例不存在")
	else:
		if str(active_pet.get("state", "")) != PlayerProgressModel.PET_STATE_BATTLE:
			errors.append("Phase383 展示宠物不是出战状态")
		if str(active_pet.get("formId", active_pet.get("templateId", ""))) != ACTIVE_PET_FORM_ID:
			errors.append("Phase383 展示出战宠形态不一致")
	return errors
