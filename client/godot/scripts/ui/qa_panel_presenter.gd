extends RefCounted

const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")
const PetPowerModel := preload("res://scripts/progression/pet_power_model.gd")
const PlayerProgressModel := preload("res://scripts/progression/player_progress_model.gd")


static func rebuild_entry_buttons(
	entry_container: VBoxContainer,
	entry_buttons: Dictionary,
	entries: Array[Dictionary],
	entry_pressed: Callable
) -> void:
	if entry_container == null:
		return
	for child in entry_container.get_children():
		child.queue_free()
	entry_buttons.clear()
	for entry in entries:
		if entry.has("section"):
			var section_label := Label.new()
			section_label.text = str(entry.get("section", ""))
			section_label.add_theme_font_size_override("font_size", 16)
			section_label.add_theme_color_override("font_color", Color(0.91, 0.80, 0.43, 0.98))
			entry_container.add_child(section_label)
			continue
		var entry_id := str(entry.get("id", ""))
		if entry_id == "":
			continue
		var button := Button.new()
		button.text = "%s\n%s" % [str(entry.get("label", "入口")), str(entry.get("description", ""))]
		button.custom_minimum_size = Vector2(0, 58)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.add_theme_font_size_override("font_size", 15)
		var captured_entry_id := entry_id
		button.pressed.connect(func() -> void:
			entry_pressed.call(captured_entry_id)
		)
		entry_container.add_child(button)
		entry_buttons[entry_id] = button


static func refresh_pet_tool_controls(
	species_option: OptionButton,
	target_option: OptionButton,
	grant_button: Button,
	level_up_button: Button,
	player_profile: Dictionary,
	previous_profile_id: String,
	previous_instance_id: String
) -> Dictionary:
	if species_option == null or target_option == null:
		return {
			"profileId": previous_profile_id,
			"instanceId": previous_instance_id,
		}
	var selected_profile_id := _refresh_species_options(species_option, previous_profile_id)
	var selected_instance_id := _refresh_target_options(target_option, player_profile, previous_instance_id)
	if grant_button != null:
		grant_button.disabled = species_option.get_item_count() <= 0
	if level_up_button != null:
		level_up_button.disabled = selected_instance_id == ""
	return {
		"profileId": selected_profile_id,
		"instanceId": selected_instance_id,
	}


static func reset_scrolls(entry_scroll: ScrollContainer, detail_scroll: ScrollContainer) -> void:
	if entry_scroll != null:
		entry_scroll.scroll_vertical = 0
	if detail_scroll != null:
		detail_scroll.scroll_vertical = 0


static func layout_is_usable(panel: Control, entry_scroll: ScrollContainer, detail_scroll: ScrollContainer) -> bool:
	if panel == null or entry_scroll == null or detail_scroll == null:
		return false
	return (
		panel.visible
		and entry_scroll.size.y >= 260.0
		and detail_scroll.size.y >= 110.0
		and entry_scroll.size.y > detail_scroll.size.y
	)


static func _refresh_species_options(species_option: OptionButton, previous_profile_id: String) -> String:
	species_option.clear()
	var selected_index := -1
	for profile in BalanceCatalogModel.pet_growth_species_profile_list():
		var profile_id := str(profile.get("profileId", "")).strip_edges()
		var form_id := str(profile.get("formId", "")).strip_edges()
		if profile_id == "" or form_id == "":
			continue
		var label := str(profile.get("formName", profile.get("displayName", profile_id)))
		species_option.add_item(label)
		var item_index := species_option.get_item_count() - 1
		species_option.set_item_metadata(item_index, profile_id)
		if profile_id == previous_profile_id or selected_index < 0:
			selected_index = item_index
	if selected_index >= 0:
		species_option.select(selected_index)
		return str(species_option.get_item_metadata(selected_index))
	return ""


static func _refresh_target_options(target_option: OptionButton, player_profile: Dictionary, previous_instance_id: String) -> String:
	target_option.clear()
	var selected_index := -1
	for instance in PlayerProgressModel.all_pet_instances(player_profile):
		var instance_id := str(instance.get("instanceId", ""))
		var label := "%s Lv%d %s 战力%d" % [
			str(instance.get("name", "宠物")),
			int(instance.get("level", 1)),
			PlayerProgressModel.state_label(str(instance.get("state", ""))),
			PetPowerModel.combat_power_for_pet(instance),
		]
		target_option.add_item(label)
		var item_index := target_option.get_item_count() - 1
		target_option.set_item_metadata(item_index, instance_id)
		if instance_id == previous_instance_id or selected_index < 0:
			selected_index = item_index
	if selected_index >= 0:
		target_option.select(selected_index)
		return str(target_option.get_item_metadata(selected_index))
	target_option.add_item("暂无宠物")
	target_option.set_item_metadata(0, "")
	target_option.select(0)
	return ""
