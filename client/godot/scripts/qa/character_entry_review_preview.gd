extends SceneTree

const CharacterEntryFlowController := preload(
	"res://scripts/ui/character_entry_flow_controller.gd"
)

const VIEWPORT_SIZE := Vector2i(1280, 720)


func _initialize() -> void:
	call_deferred("_build_preview")


func _build_preview() -> void:
	root.size = VIEWPORT_SIZE
	root.content_scale_size = VIEWPORT_SIZE
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	root.content_scale_aspect = Window.CONTENT_SCALE_ASPECT_KEEP
	var panel := CharacterEntryFlowController.new()
	root.add_child(panel)
	var visuals := _visual_sources_from_args()
	if not visuals.is_empty():
		panel.configure_visual_sources(visuals)
	panel.open_with_roster({
		"selectionRequired": true,
		"characters": [
			{
				"playerId": "preview_player_fire",
				"slotIndex": 0,
				"name": "山岚",
				"level": 80,
				"mapName": "火芽村",
				"appearanceId": "novice_hunter_v1",
				"elements": {"earth": 10, "water": 0, "fire": 0, "wind": 0},
				"needsElementAllocation": false,
			},
		],
	}, "preview_player_fire", "冒险者账号")
	if OS.get_cmdline_user_args().has("--open-create"):
		panel.open_creation_form(1)
		var appearance_button := panel.get_node_or_null(
			"CharacterCreationPanel/Appearance1"
		) as Button
		if appearance_button != null and not appearance_button.disabled:
			appearance_button.emit_signal("pressed")
		var name_input := panel.get_node_or_null(
			"CharacterCreationPanel/CreationBoard/NameInput"
		) as LineEdit
		if name_input != null:
			name_input.text = "山岚"
		var water_plus := panel.get_node_or_null(
			"CharacterCreationPanel/CreationBoard/ElementWaterPlus"
		) as Button
		if water_plus != null:
			for _index in range(10):
				water_plus.emit_signal("pressed")
	await process_frame
	await process_frame
	print("character entry review preview ready: 1280x720")


func _visual_sources_from_args() -> Dictionary:
	var result: Dictionary = {}
	var appearance: Dictionary = {}
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--background-texture="):
			result["backgroundTexturePath"] = argument.trim_prefix(
				"--background-texture="
			)
		elif argument.begins_with("--logo-texture="):
			result["logoTexturePath"] = argument.trim_prefix(
				"--logo-texture="
			)
		elif argument.begins_with("--portrait-texture="):
			appearance["portraitTexturePath"] = argument.trim_prefix(
				"--portrait-texture="
			)
		elif argument.begins_with("--showcase-texture="):
			appearance["showcaseTexturePath"] = argument.trim_prefix(
				"--showcase-texture="
			)
	if not appearance.is_empty():
		result["appearances"] = {
			"novice_hunter_v1": appearance,
		}
	return result
