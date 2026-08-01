extends RefCounted

const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)
const PlayerAppearanceCatalog := preload(
	"res://scripts/player/player_appearance_catalog.gd"
)
const EquipmentModel := preload(
	"res://scripts/progression/equipment_model.gd"
)
const PetTemplateCatalog := preload(
	"res://scripts/battle/pet_template_catalog.gd"
)
const PetRidePermitModel := preload(
	"res://scripts/progression/pet_ride_permit_model.gd"
)
const PetPortraitArtCatalog := preload(
	"res://scripts/ui/pet_portrait_art_catalog.gd"
)
const BackpackItemIconCatalog := preload(
	"res://scripts/ui/backpack_item_icon_catalog.gd"
)

const FILTER_ALL := "all"
const FILTER_SPECIES := "species"
const FILTER_LINE_PREFIX := "line:"
const PET_ROLE_BATTLE := "battle"
const PET_ROLE_RIDE := "ride"
const ELEMENT_KEYS: Array[String] = ["earth", "water", "fire", "wind"]
const ELEMENT_META := {
	"earth": {"label": "地", "color": Color(0.34, 0.72, 0.34, 1.0), "colorHex": "#57B857"},
	"water": {"label": "水", "color": Color(0.20, 0.65, 0.94, 1.0), "colorHex": "#33A6F0"},
	"fire": {"label": "火", "color": Color(0.92, 0.27, 0.17, 1.0), "colorHex": "#EB452B"},
	"wind": {"label": "风", "color": Color(0.93, 0.72, 0.23, 1.0), "colorHex": "#EDB83B"},
}


static func view_state(
	profile: Dictionary,
	pending_allocation: Dictionary = {},
	ride_filter_id: String = FILTER_ALL
) -> Dictionary:
	var snapshot := PlayerProgressModel.normalize_profile(profile)
	var available_points := PlayerProgressModel.player_stat_points(snapshot)
	var pending := normalize_pending_allocation(pending_allocation, available_points)
	var ride_entries := _ride_entries(snapshot)
	var ride_filters := _ride_filters(ride_entries)
	var active_filter := _normalize_ride_filter(ride_filter_id, ride_filters)
	var remaining_after_pending := remaining_stat_points(available_points, pending)
	return {
		"player": _player_view(snapshot),
		"equipmentSlots": _equipment_slot_rows(snapshot),
		"battlePets": _battle_pet_rows(snapshot),
		"statRows": projected_stat_rows(snapshot, pending),
		"pendingAllocation": pending,
		"availableStatPoints": available_points,
		"remainingBeforePending": available_points,
		"remainingAfterPending": remaining_after_pending,
		"remainingStatPoints": remaining_after_pending,
		"canConfirmAllocation": _pending_point_total(pending) > 0,
		"rideEntries": ride_entries,
		"rideFilters": ride_filters,
		"activeRideFilter": active_filter,
		"visibleRideEntries": _filtered_ride_entries(ride_entries, active_filter),
	}


static func normalize_pending_allocation(value, available_points: int) -> Dictionary:
	var raw := value as Dictionary if value is Dictionary else {}
	var remaining := maxi(0, available_points)
	var result := _empty_pending_allocation()
	for stat_key in PlayerProgressModel.PLAYER_STAT_KEYS:
		var requested := _nonnegative_exact_int(raw.get(stat_key, 0))
		var accepted := mini(requested, remaining)
		result[stat_key] = accepted
		remaining -= accepted
	return result


static func adjust_pending_allocation(
	value,
	stat_key: String,
	delta: int,
	available_points: int
) -> Dictionary:
	var current := normalize_pending_allocation(value, available_points)
	var normalized_key := stat_key.strip_edges()
	if not PlayerProgressModel.PLAYER_STAT_KEYS.has(normalized_key) or delta == 0:
		return current
	var current_amount := int(current.get(normalized_key, 0))
	if delta < 0:
		current[normalized_key] = maxi(0, current_amount + delta)
		return current
	var remaining := remaining_stat_points(available_points, current)
	current[normalized_key] = current_amount + mini(delta, remaining)
	return current


static func remaining_stat_points(available_points: int, pending_allocation) -> int:
	var normalized := normalize_pending_allocation(
		pending_allocation,
		available_points
	)
	return maxi(0, available_points - _pending_point_total(normalized))


static func projected_stat_rows(
	profile: Dictionary,
	pending_allocation: Dictionary = {}
) -> Array[Dictionary]:
	var available_points := PlayerProgressModel.player_stat_points(profile)
	var pending := normalize_pending_allocation(pending_allocation, available_points)
	var summary := PlayerProgressModel.player_stat_summary(profile)
	var base := _dictionary(summary.get("base", {}))
	var bonus := _dictionary(summary.get("bonus", {}))
	var current := _dictionary(summary.get("current", {}))
	var rows: Array[Dictionary] = []
	for stat_key in PlayerProgressModel.PLAYER_STAT_KEYS:
		var base_value := int(base.get(stat_key, 0))
		var bonus_value := int(bonus.get(stat_key, 0))
		var current_value := int(current.get(stat_key, base_value + bonus_value))
		var gain := PlayerProgressModel.player_stat_point_gain_for(stat_key)
		var pending_points := int(pending.get(stat_key, 0))
		rows.append({
			"key": stat_key,
			"label": EquipmentModel.stat_label_for(stat_key),
			"base": base_value,
			"bonus": bonus_value,
			"current": current_value,
			"gain": gain,
			"pendingPoints": pending_points,
			"projectedBase": base_value + gain * pending_points,
			"projectedCurrent": current_value + gain * pending_points,
		})
	return rows


static func self_check() -> Dictionary:
	var errors: Array[String] = []
	var profile := _fixture_profile()
	var before := profile.duplicate(true)
	var state := view_state(profile, {"maxHp": 2, "attack": 9}, "line:tiger")
	_expect(profile == before, "角色投影改写了输入 profile", errors)
	_expect(
		(state.get("equipmentSlots", []) as Array).size() == 9,
		"角色页没有投影完整 9 个装备槽",
		errors
	)
	_expect(
		(state.get("statRows", []) as Array).size() == 4,
		"角色页没有投影完整四维",
		errors
	)
	_expect(
		int(state.get("remainingStatPoints", -1)) == 0
		and _pending_point_total(_dictionary(state.get("pendingAllocation", {}))) == 3,
		"待分配点没有按可用点数封顶",
		errors
	)
	var adjusted := adjust_pending_allocation(
		state.get("pendingAllocation", {}),
		"attack",
		1,
		3
	)
	_expect(
		_pending_point_total(adjusted) == 3,
		"加点调整越过可用点上限",
		errors
	)
	var released := adjust_pending_allocation(adjusted, "maxHp", -1, 3)
	var moved := adjust_pending_allocation(released, "quick", 1, 3)
	_expect(
		_pending_point_total(moved) == 3 and int(moved.get("quick", 0)) == 1,
		"减点后不能把释放的点移到其他属性",
		errors
	)
	var ride_entries := state.get("rideEntries", []) as Array
	_expect(ride_entries.size() == 3, "骑证页没有严格输出当前 3 个真实可骑形态", errors)
	var species_state := view_state(profile, {}, FILTER_SPECIES)
	_expect(
		str(species_state.get("activeRideFilter", "")) == FILTER_SPECIES
		and (species_state.get("visibleRideEntries", []) as Array).size() == 3,
		"种族展开态没有保留全量骑宠并显示族系筛选",
		errors
	)
	_expect(
		(state.get("visibleRideEntries", []) as Array).size() == 1
		and str((state.get("visibleRideEntries", []) as Array)[0].get("lineId", "")) == "tiger",
		"骑证种族筛选错误",
		errors
	)
	var bui_entry := _ride_entry_for_form(ride_entries, "bui_novice_sprout_earth5_wind5")
	var tiger_entry := _ride_entry_for_form(ride_entries, "novice_tiger_mount")
	_expect(
		bool(bui_entry.get("permitRequired", false))
		and bool(bui_entry.get("permitOwned", false))
		and not bool(bui_entry.get("permitFree", true))
		and not bool(bui_entry.get("locked", true))
		and str(bui_entry.get("availabilityState", "")) == "available",
		"芽耳布伊骑证归属投影错误",
		errors
	)
	_expect(
		bool(tiger_entry.get("permitFree", false))
		and bool(tiger_entry.get("currentRiding", false))
		and int(tiger_entry.get("ownedCount", 0)) == 1
		and str(tiger_entry.get("availabilityState", "")) == "riding",
		"免证骑宠或当前骑乘状态投影错误",
		errors
	)
	var player := _dictionary(state.get("player", {}))
	_expect(
		str(player.get("name", "")) == "山岚"
		and str(player.get("appearanceTexturePath", "")) != ""
		and int(player.get("rebirthCount", -1)) == 2,
		"人物核心资料投影错误",
		errors
	)
	var battle_pets := state.get("battlePets", []) as Array
	_expect(
		battle_pets.size() == 2
		and bool((battle_pets[0] as Dictionary).get("occupied", false))
		and bool((battle_pets[1] as Dictionary).get("occupied", false)),
		"当前战宠与骑宠没有形成两张真实大头照记录",
		errors
	)
	return {
		"ok": errors.is_empty(),
		"errors": errors,
		"equipmentSlotCount": (state.get("equipmentSlots", []) as Array).size(),
		"rideableFormCount": ride_entries.size(),
		"rideFilterCount": (state.get("rideFilters", []) as Array).size(),
	}


static func _player_view(profile: Dictionary) -> Dictionary:
	var player := _dictionary(profile.get("player", {}))
	var stat_summary := PlayerProgressModel.player_stat_summary(profile)
	var current := _dictionary(stat_summary.get("current", {}))
	var appearance_id := str(player.get("appearanceId", "")).strip_edges()
	var appearance := PlayerAppearanceCatalog.entry(appearance_id)
	var appearance_fallback := appearance.is_empty()
	if appearance_fallback:
		var appearance_ids := PlayerAppearanceCatalog.appearance_ids()
		if not appearance_ids.is_empty():
			appearance_id = appearance_ids[0]
			appearance = PlayerAppearanceCatalog.entry(appearance_id)
	var elements := _known_elements(player.get("elements", {}))
	var max_hp := maxi(1, int(current.get("maxHp", player.get("maxHp", 1))))
	return {
		"name": str(player.get("name", "")),
		"level": maxi(1, int(player.get("level", 1))),
		"exp": maxi(0, int(player.get("exp", 0))),
		"nextExp": maxi(0, int(player.get("nextExp", 0))),
		"hp": clampi(int(player.get("hp", max_hp)), 0, max_hp),
		"maxHp": max_hp,
		"rebirthCount": maxi(0, int(profile.get("rebirthCount", 0))),
		"appearanceId": appearance_id,
		"appearanceName": str(appearance.get("displayName", "")),
		"appearanceTexturePath": str(appearance.get("showcaseTexturePath", "")),
		"appearancePortraitTexturePath": str(appearance.get("portraitTexturePath", "")),
		"appearanceResolvedFromFallback": appearance_fallback,
		"elements": elements,
		"elementRows": _element_rows(player.get("elements", {})),
		"statPoints": PlayerProgressModel.player_stat_points(profile),
	}


static func _equipment_slot_rows(profile: Dictionary) -> Array[Dictionary]:
	var slots := PlayerProgressModel.equipment_slots(profile)
	var result: Array[Dictionary] = []
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(slots.get(slot_id, "")).strip_edges()
		var texture := (
			BackpackItemIconCatalog.texture_for_item(item_id)
			if item_id != ""
			else null
		)
		var source := (
			BackpackItemIconCatalog.source_for_item(item_id)
			if item_id != ""
			else ""
		)
		result.append({
			"slotId": slot_id,
			"slotLabel": EquipmentModel.slot_label_for(slot_id),
			"occupied": item_id != "",
			"itemId": item_id,
			"itemLabel": EquipmentModel.label_for(item_id, "未知装备") if item_id != "" else "未装备",
			"iconTexture": texture,
			"iconTexturePath": _item_icon_texture_path(texture, source),
			"iconSource": source,
		})
	return result


static func _battle_pet_rows(profile: Dictionary) -> Array[Dictionary]:
	return [
		_pet_role_row(PET_ROLE_BATTLE, PlayerProgressModel.active_pet(profile)),
		_pet_role_row(PET_ROLE_RIDE, PlayerProgressModel.riding_pet_instance(profile)),
	]


static func _pet_role_row(role: String, instance: Dictionary) -> Dictionary:
	var role_label := "战宠" if role == PET_ROLE_BATTLE else "骑宠"
	if instance.is_empty():
		return {
			"role": role,
			"roleLabel": role_label,
			"occupied": false,
			"instanceId": "",
			"formId": "",
			"name": "",
			"level": 0,
			"state": "",
			"stateLabel": "未设置",
			"portraitTexture": null,
			"portraitTexturePath": "",
		}
	var form_id := str(instance.get("formId", instance.get("templateId", ""))).strip_edges()
	return {
		"role": role,
		"roleLabel": role_label,
		"occupied": true,
		"instanceId": str(instance.get("instanceId", "")),
		"formId": form_id,
		"name": str(instance.get("name", "")),
		"level": maxi(1, int(instance.get("level", 1))),
		"state": str(instance.get("state", "")),
		"stateLabel": _pet_state_label(str(instance.get("state", ""))),
		"portraitTexture": PetPortraitArtCatalog.texture_for_form(form_id),
		"portraitTexturePath": PetPortraitArtCatalog.resource_path_for_form(form_id),
	}


static func _ride_entries(profile: Dictionary) -> Array[Dictionary]:
	var owned_count_by_form := {}
	for instance in PlayerProgressModel.all_pet_instances(profile):
		var form_id := str(instance.get("formId", instance.get("templateId", ""))).strip_edges()
		if form_id != "":
			owned_count_by_form[form_id] = int(owned_count_by_form.get(form_id, 0)) + 1
	var riding_form_id := ""
	var riding_pet := PlayerProgressModel.riding_pet_instance(profile)
	if not riding_pet.is_empty():
		riding_form_id = str(
			riding_pet.get("formId", riding_pet.get("templateId", ""))
		).strip_edges()
	var result: Array[Dictionary] = []
	for form in PetTemplateCatalog.forms():
		var riding := _dictionary(form.get("riding", {}))
		if not bool(riding.get("rideable", false)):
			continue
		var form_id := str(form.get("formId", "")).strip_edges()
		if form_id == "":
			continue
		var template := PetTemplateCatalog.runtime_template_for_form(form_id)
		if template.is_empty():
			continue
		var permit_id := PetRidePermitModel.permit_id_for_riding(riding)
		var permit_required := permit_id != ""
		var permit_owned := (
			PetRidePermitModel.has_required_permit(profile, riding)
			if permit_required
			else false
		)
		var permit_free := not permit_required
		var current_riding := form_id == riding_form_id
		var owned_count := int(owned_count_by_form.get(form_id, 0))
		var owned := owned_count > 0
		var available := owned and (permit_free or permit_owned)
		var availability_state := _ride_availability_state(
			current_riding,
			owned,
			permit_required,
			permit_owned
		)
		result.append({
			"formId": form_id,
			"formName": str(template.get("formName", form_id)),
			"lineId": str(template.get("lineId", "")),
			"lineName": str(template.get("lineName", "")),
			"portraitTexture": PetPortraitArtCatalog.texture_for_form(form_id),
			"portraitTexturePath": PetPortraitArtCatalog.resource_path_for_form(form_id),
			"permitRequired": permit_required,
			"permitId": permit_id,
			"permitItemId": PetRidePermitModel.permit_item_id_for_riding(riding),
			"permitOwned": permit_owned,
			"permitFree": permit_free,
			"ownedCount": owned_count,
			"owned": owned,
			"currentRiding": current_riding,
			"available": available or current_riding,
			"locked": not current_riding and not available,
			"availabilityState": availability_state,
			"cornerBadgeText": _ride_corner_badge_text(availability_state),
			"overlayText": _ride_overlay_text(availability_state),
			"lineLevelCapRequired": maxi(1, int(riding.get("levelCapRequired", 1))),
			"statusLabel": _ride_status_label(
				current_riding,
				owned,
				permit_free,
				permit_owned
			),
		})
	result.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
		var left_line := str(left.get("lineName", ""))
		var right_line := str(right.get("lineName", ""))
		if left_line == right_line:
			return str(left.get("formName", "")) < str(right.get("formName", ""))
		return left_line < right_line
	)
	return result


static func _ride_filters(ride_entries: Array[Dictionary]) -> Array[Dictionary]:
	var result: Array[Dictionary] = [
		{"id": FILTER_ALL, "label": "全部", "lineId": "", "count": ride_entries.size()},
	]
	var line_names := {}
	var line_counts := {}
	for entry in ride_entries:
		var line_id := str(entry.get("lineId", "")).strip_edges()
		if line_id == "":
			continue
		line_names[line_id] = str(entry.get("lineName", line_id))
		line_counts[line_id] = int(line_counts.get(line_id, 0)) + 1
	var line_ids: Array[String] = []
	for raw_line_id in line_names.keys():
		line_ids.append(str(raw_line_id))
	line_ids.sort_custom(func(left: String, right: String) -> bool:
		return str(line_names.get(left, left)) < str(line_names.get(right, right))
	)
	for line_id in line_ids:
		result.append({
			"id": "%s%s" % [FILTER_LINE_PREFIX, line_id],
			"label": str(line_names.get(line_id, line_id)),
			"lineId": line_id,
			"count": int(line_counts.get(line_id, 0)),
		})
	return result


static func _normalize_ride_filter(value: String, options: Array[Dictionary]) -> String:
	var requested := value.strip_edges()
	if requested == FILTER_SPECIES:
		return FILTER_SPECIES
	for option in options:
		if str(option.get("id", "")) == requested:
			return requested
	return FILTER_ALL


static func _filtered_ride_entries(
	ride_entries: Array[Dictionary],
	filter_id: String
) -> Array[Dictionary]:
	if filter_id in [FILTER_ALL, FILTER_SPECIES]:
		return ride_entries.duplicate(true)
	var line_id := (
		filter_id.substr(FILTER_LINE_PREFIX.length())
		if filter_id.begins_with(FILTER_LINE_PREFIX)
		else ""
	)
	var result: Array[Dictionary] = []
	for entry in ride_entries:
		if str(entry.get("lineId", "")) == line_id:
			result.append(entry.duplicate(true))
	return result


static func _known_elements(value) -> Dictionary:
	var raw := value as Dictionary if value is Dictionary else {}
	var result := {}
	for element_key in ELEMENT_KEYS:
		if raw.has(element_key):
			result[element_key] = clampi(int(raw.get(element_key, 0)), 0, 10)
	return result


static func _element_rows(value) -> Array[Dictionary]:
	var raw := value as Dictionary if value is Dictionary else {}
	var result: Array[Dictionary] = []
	for element_key in ELEMENT_KEYS:
		var meta := _dictionary(ELEMENT_META.get(element_key, {}))
		var known := raw.has(element_key)
		var points := clampi(int(raw.get(element_key, 0)), 0, 10) if known else 0
		result.append({
			"key": element_key,
			"label": str(meta.get("label", element_key)),
			"known": known,
			"points": points,
			"displayText": str(points) if known else "未分配",
			"color": meta.get("color", Color.WHITE),
			"colorHex": str(meta.get("colorHex", "#FFFFFF")),
		})
	return result


static func _item_icon_texture_path(texture: Texture2D, source: String) -> String:
	if source.begins_with("atlas:"):
		var fields := source.split("|", false)
		if fields.size() >= 2:
			return str(fields[1])
	if texture != null and texture.resource_path != "":
		return texture.resource_path
	return ""


static func _ride_status_label(
	current_riding: bool,
	owned: bool,
	permit_free: bool,
	permit_owned: bool
) -> String:
	if current_riding:
		return "当前骑乘"
	if not owned:
		return "尚未拥有"
	if not permit_free and not permit_owned:
		return "未获骑证"
	return "可骑乘"


static func _ride_availability_state(
	current_riding: bool,
	owned: bool,
	permit_required: bool,
	permit_owned: bool
) -> String:
	if current_riding:
		return "riding"
	if not owned:
		return "pet_missing"
	if permit_required and not permit_owned:
		return "permit_missing"
	return "available"


static func _ride_corner_badge_text(availability_state: String) -> String:
	match availability_state:
		"riding":
			return "骑乘中"
		"available":
			return "可骑乘"
	return ""


static func _ride_overlay_text(availability_state: String) -> String:
	match availability_state:
		"pet_missing":
			return "未拥有"
		"permit_missing":
			return "缺少骑证"
	return ""


static func _pet_state_label(state: String) -> String:
	match state:
		PlayerProgressModel.PET_STATE_BATTLE:
			return "战斗"
		PlayerProgressModel.PET_STATE_RIDING:
			return "骑乘"
		PlayerProgressModel.PET_STATE_REST:
			return "休息"
		PlayerProgressModel.PET_STATE_STORAGE:
			return "兽栏"
		_:
			return "待机"


static func _empty_pending_allocation() -> Dictionary:
	var result := {}
	for stat_key in PlayerProgressModel.PLAYER_STAT_KEYS:
		result[stat_key] = 0
	return result


static func _pending_point_total(value: Dictionary) -> int:
	var total := 0
	for stat_key in PlayerProgressModel.PLAYER_STAT_KEYS:
		total += maxi(0, int(value.get(stat_key, 0)))
	return total


static func _nonnegative_exact_int(value) -> int:
	if value is int:
		return maxi(0, value as int)
	if value is float:
		var numeric := value as float
		if is_finite(numeric) and floor(numeric) == numeric:
			return maxi(0, int(numeric))
	return 0


static func _dictionary(value) -> Dictionary:
	return value as Dictionary if value is Dictionary else {}


static func _ride_entry_for_form(entries: Array, form_id: String) -> Dictionary:
	for value in entries:
		if value is Dictionary and str((value as Dictionary).get("formId", "")) == form_id:
			return value as Dictionary
	return {}


static func _fixture_profile() -> Dictionary:
	var profile := PlayerProgressModel.with_starter_equipment(
		PlayerProgressModel.default_profile()
	)
	var player := _dictionary(profile.get("player", {})).duplicate(true)
	player["name"] = "山岚"
	player["level"] = 80
	player["exp"] = 91703
	player["nextExp"] = 119635
	player["statPoints"] = 3
	player["appearanceId"] = "ember_spark_v1"
	player["elements"] = {"earth": 6, "water": 3, "fire": 0, "wind": 1}
	profile["player"] = player
	profile["rebirthCount"] = 2
	profile[PetRidePermitModel.PROFILE_KEY] = {
		"schemaVersion": PetRidePermitModel.SCHEMA_VERSION,
		"permitIds": ["ride_bui_novice_sprout"],
	}
	var battle_pet := PlayerProgressModel.create_pet_instance_from_form(
		"pet_battle_fixture",
		"芽耳布伊",
		"bui_novice_sprout_earth5_wind5",
		PlayerProgressModel.PET_STATE_BATTLE,
		40
	)
	var ride_pet := PlayerProgressModel.create_pet_instance_from_form(
		"pet_ride_fixture",
		"新手老虎",
		"novice_tiger_mount",
		PlayerProgressModel.PET_STATE_RIDING,
		40
	)
	var reserve_pet := PlayerProgressModel.create_pet_instance_from_form(
		"pet_reserve_fixture",
		"雷龙",
		"thunder_dragon_mount",
		PlayerProgressModel.PET_STATE_STORAGE,
		120
	)
	profile["petInstances"] = [battle_pet, ride_pet, reserve_pet]
	profile["activePetInstanceId"] = "pet_battle_fixture"
	profile["ridePetInstanceId"] = "pet_ride_fixture"
	profile["unlockedAbilities"] = [PlayerProgressModel.ABILITY_RIDING]
	return PlayerProgressModel.normalize_profile(profile)


static func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)
