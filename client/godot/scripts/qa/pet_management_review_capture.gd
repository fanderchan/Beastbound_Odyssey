extends RefCounted

const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)
const PetGrowthObservationModel := preload(
	"res://scripts/progression/pet_growth_observation_model.gd"
)
const PetPowerModel := preload(
	"res://scripts/progression/pet_power_model.gd"
)
const BackpackModel := preload(
	"res://scripts/progression/backpack_model.gd"
)

const REVIEW_FPS := 30
const EVOLVED_INSTANCE_ID := "owner_review_crystal_wuli"
const CULTIVATION_INSTANCE_ID := "owner_review_guard_wuli"
const BUI_INSTANCE_ID := "owner_review_sprout_bui"
const REVIEW_ITEM_IDS: Array[String] = [
	"pet_rebirth_mm1_egg",
	"pet_rebirth_mm2_egg",
	"rebirth_starter_four_spirit_cub_egg",
	"novice_battle_pet_egg",
	"novice_tiger_egg",
	"thunder_dragon_egg",
	"bui_novice_sprout_riding_certificate",
]

var host
var _started_msec: int = 0


func _init(host_node) -> void:
	host = host_node


func run() -> void:
	_started_msec = Time.get_ticks_msec()
	_configure_isolated_review_profile()
	await _hold("world", 4.0)
	await _review_pet_roster_and_management()
	await _review_growth_stages()
	await _review_skill_and_cultivation()
	await _review_codex()
	await _review_pet_items()
	await _review_ride_permit_shop()
	await _review_final_pet_page()
	var elapsed := float(Time.get_ticks_msec() - _started_msec) / 1000.0
	print(
		(
			"PET_MANAGEMENT_OWNER_REVIEW_END elapsed_wall=%.3f speed=1.00x "
			+ "profile=isolated backend=false"
		) % elapsed
	)
	host.get_tree().quit(0)


func _configure_isolated_review_profile() -> void:
	host.profile_save_enabled = false
	host.current_account_session = {}
	host.server_profile_sync_state = "off"
	host.server_profile_sync_pending_kind = ""
	host.server_profile_sync_dirty = false
	host.server_profile_sync_pull_queued = false
	host.player_profile = _review_profile()
	host.pet_selected_instance_id = EVOLVED_INSTANCE_ID
	host.pet_detail_mode = host.PET_DETAIL_MODE_INSTANCE
	host.pet_growth_stage = 2
	host.backpack_selected_slot_index = 0
	host.codex_selected_form_id = "wuli_evolved_crystal_earth8_water2"
	host._update_hud_text(true)
	host._set_world_log_message("宠物伙伴们正在火芽村休息。")


func _review_pet_roster_and_management() -> void:
	host._open_pet_panel(false)
	await _hold("pet_roster_evolved", 6.0)
	for instance_id in [
		"owner_review_emberhorn",
		"owner_review_tidefin",
		BUI_INSTANCE_ID,
	]:
		await host._select_pet_instance(instance_id)
		await _hold("pet_roster_%s" % instance_id, 3.0)
	await host._on_pet_state_cycle_pressed()
	await _hold("pet_state_cycle", 3.0)
	host._on_pet_rename_pressed()
	await _hold("pet_rename", 3.0)
	host._panel_flow()._close_pet_rename_panel()
	await host.get_tree().process_frame
	await host._select_pet_instance(EVOLVED_INSTANCE_ID)
	await _hold("pet_attributes", 4.0)

	var panel_flow = host._panel_flow()
	var toolbar_toggle = panel_flow._pet_roster_toolbar_toggle_button
	if toolbar_toggle is Button:
		(toolbar_toggle as Button).emit_signal("pressed")
		await _hold("pet_roster_toolbar", 5.0)
		(toolbar_toggle as Button).emit_signal("pressed")
		await host.get_tree().process_frame

	await host._on_pet_lock_pressed()
	await _hold("pet_lock", 2.5)
	await host._on_pet_lock_pressed()
	await host._on_pet_party_move_pressed(1)
	await _hold("pet_party_order", 2.5)


func _review_growth_stages() -> void:
	await host._select_pet_instance(EVOLVED_INSTANCE_ID)
	host._set_pet_detail_mode(host.PET_DETAIL_MODE_GROWTH)
	host._panel_flow()._set_pet_growth_details_expanded(false)
	for stage in [0, 1, 2]:
		host._set_pet_growth_stage(stage)
		await _hold("pet_growth_stage_%d" % stage, 5.0)
	host._panel_flow()._set_pet_growth_details_expanded(true)
	await _hold("pet_growth_details", 7.0)


func _review_skill_and_cultivation() -> void:
	host._open_pet_skill_panel(false)
	await _hold("pet_skills_attack", 4.0)
	host._select_pet_skill_slot(6)
	await _hold("pet_skills_special", 4.0)
	host._close_pet_skill_panel()
	await host.get_tree().process_frame

	host._open_pet_panel(false)
	await host._select_pet_instance(CULTIVATION_INSTANCE_ID)
	host._on_pet_cultivation_pressed()
	await _hold("pet_cultivation", 7.0)
	host._close_pet_cultivation_panel()
	await host.get_tree().process_frame


func _review_codex() -> void:
	host._close_pet_panel()
	host._open_codex_panel()
	await _hold("pet_codex_top", 6.0)
	for form_id in [
		"bui_novice_sprout_earth5_wind5",
		"novice_tiger_mount",
		"thunder_dragon_mount",
	]:
		host._select_codex_form(form_id)
		await _hold("pet_codex_%s" % form_id, 3.0)
	var codex_scroll := host.codex_list_container.get_parent() as ScrollContainer
	if codex_scroll != null:
		var scroll_bar := codex_scroll.get_v_scroll_bar()
		codex_scroll.scroll_vertical = int(scroll_bar.max_value * 0.5)
		await _hold("pet_codex_middle", 4.0)
		codex_scroll.scroll_vertical = int(scroll_bar.max_value)
		await _hold("pet_codex_bottom", 4.0)
	host._close_codex_panel()
	await host.get_tree().process_frame


func _review_pet_items() -> void:
	host._open_backpack_panel()
	host._set_backpack_filter(host.BACKPACK_FILTER_WORLD)
	await _hold("pet_items_overview", 5.0)
	for item_id in [
		"novice_tiger_egg",
		"thunder_dragon_egg",
		"pet_rebirth_mm1_egg",
		"bui_novice_sprout_riding_certificate",
	]:
		var slot_index := _backpack_slot_index(item_id)
		if slot_index >= 0:
			host._select_backpack_slot(slot_index)
			await _hold("pet_item_%s" % item_id, 5.0)
			if item_id in [
				"novice_tiger_egg",
				"bui_novice_sprout_riding_certificate",
			]:
				host._panel_flow()._open_item_slot_detail_panel({
					"context": "backpack",
					"itemId": item_id,
					"count": 1,
					"slotIndex": slot_index,
				})
				await _hold("pet_item_detail_%s" % item_id, 4.0)
				host._panel_flow()._close_item_slot_detail_panel(false)
	host._close_backpack_panel()
	await host.get_tree().process_frame


func _review_ride_permit_shop() -> void:
	host._open_shop_panel("firebud_diamond_shop")
	host._select_shop_item(
		"bui_novice_sprout_riding_certificate",
		false
	)
	await _hold("ride_permit_shop", 7.0)
	host._close_shop_panel()
	await host.get_tree().process_frame


func _review_final_pet_page() -> void:
	host._open_pet_panel(false)
	await host._select_pet_instance(BUI_INSTANCE_ID)
	host._set_pet_detail_mode(host.PET_DETAIL_MODE_INSTANCE)
	await _hold("pet_final_bui", 6.0)


func _hold(chapter: String, seconds: float) -> void:
	print(
		(
			"PET_MANAGEMENT_OWNER_REVIEW_CHAPTER chapter=%s frame=%d "
			+ "seconds=%.3f speed=1.00x"
		) % [chapter, int(round(seconds * REVIEW_FPS)), seconds]
	)
	await host.get_tree().create_timer(seconds).timeout


func _review_profile() -> Dictionary:
	var evolved := _evolved_crystal_wuli()
	var rebirth_helper := _review_pet(
		"pet_rebirth_mm_stage1_v1",
		"owner_review_rebirth_mm1",
		"pet_rebirth_mm_stage1",
		"满石1转小MM",
		PlayerProgressModel.PET_STATE_STANDBY,
		79
	)
	rebirth_helper["petRebirthHelper"] = {
		"schemaVersion": 1,
		"stage": 1,
		"stoneCapacity": 50,
		"stonePoints": {
			"maxHp": 50,
			"attack": 50,
			"defense": 50,
			"quick": 50,
		},
	}
	var instances: Array = [
		evolved,
		_review_pet(
			"wuli_normal_tough_earth10_v1",
			CULTIVATION_INSTANCE_ID,
			"wuli_normal_tough_earth10",
			"高防乌力",
			PlayerProgressModel.PET_STATE_STANDBY,
			140
		),
		_review_pet(
			"emberhorn_red_fire8_earth2_v1",
			"owner_review_emberhorn",
			"emberhorn_red_fire8_earth2",
			"赤角兽",
			PlayerProgressModel.PET_STATE_REST,
			82
		),
		_review_pet(
			"tidefin_mist_water8_wind2_v1",
			"owner_review_tidefin",
			"tidefin_mist_water8_wind2",
			"雾潮鳍兽",
			PlayerProgressModel.PET_STATE_STANDBY,
			56
		),
		_review_pet(
			"bui_novice_sprout_earth5_wind5_v1",
			BUI_INSTANCE_ID,
			"bui_novice_sprout_earth5_wind5",
			"芽耳布伊",
			PlayerProgressModel.PET_STATE_BATTLE,
			40
		),
		_review_pet(
			"driftfox_mist_wind7_water3_v1",
			"owner_review_driftfox",
			"driftfox_mist_wind7_water3",
			"雾风狐",
			PlayerProgressModel.PET_STATE_STORAGE,
			26
		),
		rebirth_helper,
	]
	var profile := PlayerProgressModel.default_profile()
	profile["petInstances"] = instances
	profile["activePetInstanceId"] = BUI_INSTANCE_ID
	profile["nextPetInstanceSerial"] = 8
	profile = PlayerProgressModel.with_diamonds(profile, 5000)
	var slots := PlayerProgressModel.backpack_slots(profile)
	for item_id in REVIEW_ITEM_IDS:
		slots = BackpackModel.set_item_count(slots, item_id, 1)
	profile = PlayerProgressModel.with_backpack_slots(profile, slots)
	var seen_forms: Array[String] = [
		"wuli_evolved_crystal_earth8_water2",
		"wuli_normal_tough_earth10",
		"wuli_normal_orange_fire10",
		"bui_normal_red_fire10",
		"bui_normal_yellow_wind10",
		"bui_normal_thick_earth10",
		"bui_novice_sprout_earth5_wind5",
		"emberhorn_red_fire8_earth2",
		"tidefin_mist_water8_wind2",
		"driftfox_mist_wind7_water3",
		"novice_tiger_mount",
		"thunder_dragon_mount",
		"pet_rebirth_mm_stage1",
		"pet_rebirth_mm_stage2",
		"rebirth_starter_four_spirit_cub",
	]
	for form_id in seen_forms:
		profile = PlayerProgressModel.record_codex_captured(profile, form_id)
	return PlayerProgressModel.normalize_profile(profile)


func review_profile_fixture() -> Dictionary:
	return _review_profile()


func _review_pet(
	profile_id: String,
	instance_id: String,
	form_id: String,
	display_name: String,
	state: String,
	level: int
) -> Dictionary:
	return PetGrowthObservationModel.create_pet_instance(
		profile_id,
		instance_id,
		form_id,
		display_name,
		state,
		level,
		"pet-management-owner-review-%s" % instance_id,
		1
	)


func _evolved_crystal_wuli() -> Dictionary:
	var evolved := _review_pet(
		"wuli_evolved_crystal_earth8_water2_v1",
		EVOLVED_INSTANCE_ID,
		"wuli_evolved_crystal_earth8_water2",
		"晶甲乌力",
		PlayerProgressModel.PET_STATE_STANDBY,
		140
	)
	var source := _review_pet(
		"wuli_normal_tough_earth10_v1",
		"owner_review_crystal_source",
		"wuli_normal_tough_earth10",
		"高防乌力",
		PlayerProgressModel.PET_STATE_STANDBY,
		140
	)
	var level_one := source.get("growthSpeciesLevel1Stats", {}) as Dictionary
	var stage_zero_stats := _pet_stats(source)
	var stage_one_bonus := {
		"maxHp": 4.0,
		"attack": 1.2,
		"defense": 1.4,
		"quick": 1.0,
	}
	var stage_one_stats := {}
	for key in ["maxHp", "attack", "defense", "quick"]:
		stage_one_stats[key] = int(round(
			float(stage_zero_stats.get(key, 1))
			+ float(stage_one_bonus.get(key, 0.0)) * 139.0
		))
	var evolved_level_one := (
		evolved.get("growthSpeciesLevel1Stats", {}) as Dictionary
	)
	var review_growth := {
		"maxHp": 14.273,
		"attack": 2.388,
		"defense": 3.424,
		"quick": 1.978,
	}
	for key in ["maxHp", "attack", "defense", "quick"]:
		evolved[key] = int(round(
			float(evolved_level_one.get(key, 1))
			+ float(review_growth.get(key, 0.0)) * 139.0
		))
	evolved["growthAuthority"] = {
		"schemaVersion": 1,
		"source": "server",
		"modelVersion": "legacy_species_linear_v1",
		"settledLevel": 140,
	}
	evolved["growthModelVersion"] = "legacy_species_linear_v1"
	evolved["petCultivation"] = {
		"schemaVersion": 1,
		"rebirthCount": 1,
		"enhanceLevel": 3,
		"rebirthGrowthBonus": stage_one_bonus,
		"history": [],
	}
	evolved["evolutionLineage"] = {
		"schemaVersion": 1,
		"mode": "evolution",
		"routeId": "wuli_crystal_evolution_v1",
		"sourceFormId": "wuli_normal_tough_earth10",
		"sourceFormName": "高防乌力",
		"targetFormId": "wuli_evolved_crystal_earth8_water2",
		"targetFormName": "晶甲乌力",
		"terminalStage": 2,
		"stageSnapshots": [
			{
				"schemaVersion": 1,
				"stage": 0,
				"formId": "wuli_normal_tough_earth10",
				"formName": "高防乌力",
				"growthSpeciesProfileId": "wuli_normal_tough_earth10_v1",
				"level": 140,
				"levelOneFourV": level_one,
				"stats": stage_zero_stats,
				"intrinsicCombatPower": (
					PetPowerModel.combat_power_for_stats(stage_zero_stats)
				),
				"growthObservation": {},
			},
			{
				"schemaVersion": 1,
				"stage": 1,
				"formId": "wuli_normal_tough_earth10",
				"formName": "高防乌力",
				"growthSpeciesProfileId": "wuli_normal_tough_earth10_v1",
				"level": 140,
				"levelOneFourV": level_one,
				"stats": stage_one_stats,
				"intrinsicCombatPower": (
					PetPowerModel.combat_power_for_stats(stage_one_stats)
				),
				"growthObservation": {},
			},
		],
	}
	return evolved


func _pet_stats(instance: Dictionary) -> Dictionary:
	return {
		"maxHp": int(instance.get("maxHp", 1)),
		"attack": int(instance.get("attack", 1)),
		"defense": int(instance.get("defense", 1)),
		"quick": int(instance.get("quick", 1)),
	}


func _backpack_slot_index(item_id: String) -> int:
	var slots := PlayerProgressModel.backpack_slots(host.player_profile)
	for index in range(slots.size()):
		if str((slots[index] as Dictionary).get("itemId", "")) == item_id:
			return index
	return -1
