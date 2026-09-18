extends Node2D

const PLAYER_SCENE := preload("res://scenes/player/Player.tscn")
const CharacterActionAssetCatalog := preload("res://scripts/player/character_action_asset_catalog.gd")

# Same Player scene, scale, anchors, direction catalog and mounted release gates
# as the local actor. Only its presentation runs; it never owns movement/input.
static var _bounds_by_visual_state: Dictionary = {}
var _actor: CharacterBody2D
var _nameplate: Label
var _nameplate_background: ColorRect
var _command: Dictionary = {}
var _requested_mount := ""
var _visual_signature := ""
var _body_rect := Rect2()


func _init() -> void:
	_actor = PLAYER_SCENE.instantiate()
	_actor.name = "Presentation"
	add_child(_actor)
	_nameplate_background = ColorRect.new()
	_nameplate_background.color = Color(0.04, 0.07, 0.06, 0.70)
	_nameplate_background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_nameplate_background)
	_nameplate = Label.new()
	_nameplate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_nameplate.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_nameplate.clip_text = true
	_nameplate.add_theme_font_size_override("font_size", 14)
	_nameplate.add_theme_color_override("font_color", Color(0.94, 0.98, 0.90, 0.96))
	add_child(_nameplate)


func _ready() -> void:
	visibility_changed.connect(_sync_animation_visibility)
	_apply_state()


func apply_command(command: Dictionary) -> void:
	_command = command
	position = command.get("position", Vector2.ZERO)
	if is_node_ready():
		_apply_state()


func contains_world_point(world_point: Vector2) -> bool:
	if not is_visible_in_tree():
		return false
	var point := to_local(world_point)
	return _body_rect.grow(6.0).has_point(point) or (
		_nameplate.visible and _nameplate.get_rect().grow(4.0).has_point(point)
	)


func _apply_state() -> void:
	var appearance_id := CharacterActionAssetCatalog.resolve_appearance_id(str(_command.get("appearanceId", "")))
	var appearance_changed: bool = appearance_id != _actor.get_appearance_id()
	if appearance_changed:
		_actor.set_appearance_id(appearance_id)
	var mount := str(_command.get("ridingFormId", ""))
	if appearance_changed or mount != _requested_mount:
		_requested_mount = mount
		_actor.set_riding_form(mount)
	_actor.set_remote_presentation_state(str(_command.get("facing", "south")), bool(_command.get("moving", false)))
	_actor.set_world_visual_grade(_command.get("visualGrade", {}))
	var signature: String = _actor.get_visual_bounds_signature()
	if signature != _visual_signature:
		_visual_signature = signature
		if not _bounds_by_visual_state.has(signature):
			_bounds_by_visual_state[signature] = global_transform.affine_inverse() * _actor.get_visual_world_rect()
		_body_rect = _bounds_by_visual_state[signature]
	var text := str(_command.get("label", "")).strip_edges()
	_nameplate.text = text
	_nameplate.visible = text != ""
	_nameplate_background.visible = _nameplate.visible
	var width := clampf(float(text.length()) * 16.0 + 22.0, 56.0, 168.0)
	var plate_rect := Rect2(Vector2(-width * 0.5, _body_rect.position.y - 28.0), Vector2(width, 22.0))
	_nameplate.position = plate_rect.position
	_nameplate.size = plate_rect.size
	_nameplate_background.position = plate_rect.position
	_nameplate_background.size = plate_rect.size
	var font: Variant = _command.get("font")
	if font is Font:
		_nameplate.add_theme_font_override("font", font)
	_sync_animation_visibility()


func _sync_animation_visibility() -> void:
	var animate := is_visible_in_tree()
	if animate and _actor.get_riding_form_id() == "" and _actor.uses_formal_character_art():
		# A single idle frame has no time-dependent work. Resume when a network
		# update selects walk (or a future multi-frame idle), or the world returns.
		animate = CharacterActionAssetCatalog.world_frame_count_for_action(
			_actor.get_animation_state(), _actor.get_appearance_id()
		) > 1
	_actor.set_process(animate)
