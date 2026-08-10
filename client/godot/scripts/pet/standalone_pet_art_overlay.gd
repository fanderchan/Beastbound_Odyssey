extends RefCounted

const PetTemplateCatalog := preload("res://scripts/battle/pet_template_catalog.gd")
const WorldVisualDirectionContract := preload(
	"res://scripts/world/world_visual_direction_contract.gd"
)

const SCOPE_WORLD_PET_ONLY := "world_pet_only"
const SCOPE_BATTLE_STANDALONE := "battle_standalone"
const SCOPES: Array[String] = [
	SCOPE_WORLD_PET_ONLY,
	SCOPE_BATTLE_STANDALONE,
]
const CLI_BATTLE_ROOT_PREFIX := "--pet-battle-review-isolated-root="
const CLI_BATTLE_FORM_PREFIX := "--pet-battle-review-form="
const CLI_PREVIEW_PREFIX := "--pet-battle-review-preview="
const CLI_MOUNT_PREFIX := "--pet-battle-review-mount-form="
const CLI_STEPS_PREFIX := "--pet-battle-review-steps="
const CLI_WORLD_ROOT_PREFIX := "--mount-review-pet-root="
const CLI_WORLD_FORM_PREFIX := "--mount-review-form="
const CLI_WORLD_SUBJECTS_PREFIX := "--mount-review-subjects="
const METADATA_FILE := "action-bundle-meta.json"
const IDENTITY_POSES: Array[String] = [
	"front_3quarter_sw",
	"back_3quarter_ne",
	"south",
	"west",
]
const VIEWS: Array[String] = ["front_3quarter_sw", "back_3quarter_ne"]
const BATTLE_ACTIONS: Array[String] = [
	"idle", "walk", "attack", "skill", "hurt", "defend",
	"dodge", "counter", "stagger", "knockaway", "down", "revive",
]
const BATTLE_FRAME_COUNTS := {
	"idle": 6,
	"walk": 8,
	"attack": 8,
	"skill": 8,
	"hurt": 6,
	"defend": 6,
	"dodge": 8,
	"counter": 8,
	"stagger": 8,
	"knockaway": 8,
	"down": 8,
	"revive": 8,
}
const WORLD_ACTIONS: Array[String] = ["idle", "walk"]
const WORLD_FRAME_COUNTS := {
	"idle": 1,
	"walk": 4,
}
const PROTECTED_TRUE_KEYS: Array[String] = [
	"runtimeenabled",
	"runtimeready",
	"releaseenabled",
	"released",
	"releaseready",
	"productionready",
]

static var _active_form_id: String = ""
static var _active_root: String = ""
static var _active_metadata: Dictionary = {}
static var _active_scope: String = ""


static func enable_from_cli(
	form_id: String,
	root_value: String,
	args: PackedStringArray,
	scope: String = SCOPE_BATTLE_STANDALONE
) -> Dictionary:
	disable()
	var errors := validation_errors_for_request(
		form_id,
		root_value,
		args,
		scope,
		true
	)
	var normalized_root := normalized_root_path(root_value)
	if errors.is_empty():
		_active_form_id = form_id.strip_edges()
		_active_root = normalized_root
		_active_metadata = _read_metadata(normalized_root)
		_active_scope = scope
	return {
		"ok": errors.is_empty(),
		"formId": form_id.strip_edges(),
		"root": normalized_root,
		"scope": scope,
		"errors": errors,
	}


static func disable() -> void:
	_active_form_id = ""
	_active_root = ""
	_active_metadata = {}
	_active_scope = ""


static func is_enabled_for(form_id: String) -> bool:
	return (
		OS.is_debug_build()
		and _active_form_id != ""
		and form_id.strip_edges() == _active_form_id
		and _active_root != ""
		and not _active_metadata.is_empty()
	)


static func active_form_id() -> String:
	return _active_form_id if OS.is_debug_build() else ""


static func active_scope() -> String:
	return _active_scope if OS.is_debug_build() else ""


static func allows_battle_for(form_id: String) -> bool:
	return (
		is_enabled_for(form_id)
		and _active_scope == SCOPE_BATTLE_STANDALONE
	)


static func root_for_form(form_id: String) -> String:
	return _active_root if is_enabled_for(form_id) else ""


static func metadata_for_form(form_id: String) -> Dictionary:
	return _active_metadata.duplicate(true) if is_enabled_for(form_id) else {}


static func load_texture(path: String) -> Texture2D:
	if not OS.is_debug_build() or _active_root == "" or not path.ends_with(".png"):
		return null
	var normalized_path := _normalized_absolute_path(path)
	if not _path_is_inside(normalized_path, _active_root):
		return null
	if _path_has_link_from_root(normalized_path, _active_root):
		return null
	var image = Image.load_from_file(normalized_path)
	if image == null or image.is_empty():
		return null
	return ImageTexture.create_from_image(image)


static func validation_errors_for_request(
	form_id: String,
	root_value: String,
	args: PackedStringArray,
	scope: String = SCOPE_BATTLE_STANDALONE,
	validate_frames: bool = true
) -> Array[String]:
	var errors: Array[String] = []
	var normalized_form_id := form_id.strip_edges()
	if not OS.is_debug_build():
		errors.append("隔离宠物美术 overlay 只允许 debug/test 构建")
	if normalized_form_id == "":
		errors.append("隔离宠物美术 overlay 必须显式指定 formId")
	elif PetTemplateCatalog.form_by_id(normalized_form_id).is_empty():
		errors.append("隔离宠物美术 overlay formId 不在玩法模板目录：%s" % normalized_form_id)
	if not SCOPES.has(scope):
		errors.append("隔离宠物美术 overlay scope 无效：%s" % scope)
	_append_cli_errors(
		errors,
		normalized_form_id,
		root_value,
		args,
		scope
	)
	var root_errors := root_validation_errors(root_value)
	errors.append_array(root_errors)
	var normalized_root := normalized_root_path(root_value)
	if not root_errors.is_empty() or normalized_root == "":
		return errors
	var metadata_path := normalized_root.path_join(METADATA_FILE)
	if not FileAccess.file_exists(metadata_path):
		errors.append("隔离宠物美术包缺少 %s" % metadata_path)
		return errors
	if _path_has_link_from_root(metadata_path, normalized_root):
		errors.append("隔离宠物美术 metadata 不能通过软链接越界")
		return errors
	var metadata := _read_metadata(normalized_root)
	if metadata.is_empty():
		errors.append("隔离宠物美术 metadata 不是有效 JSON 对象")
		return errors
	errors.append_array(
		metadata_validation_errors(
			metadata,
			normalized_form_id,
			scope
		)
	)
	if validate_frames and errors.is_empty():
		errors.append_array(
			frame_validation_errors(metadata, normalized_root, scope)
		)
	return errors


static func root_validation_errors(root_value: String) -> Array[String]:
	var errors: Array[String] = []
	var raw_root := root_value.strip_edges().replace("\\", "/")
	if raw_root == "":
		return ["隔离宠物美术 root 不能为空"]
	for component in raw_root.split("/", false):
		if component == "..":
			errors.append("隔离宠物美术 root 禁止包含 ..")
			break
	if raw_root.begins_with("res://"):
		errors.append("隔离宠物美术 root 禁止指向 res:// 正式资源")
	var normalized_root := normalized_root_path(raw_root)
	if normalized_root == "":
		errors.append("隔离宠物美术 root 必须是绝对路径或 user:// 路径")
		return errors
	var user_root := _normalized_absolute_path(ProjectSettings.globalize_path("user://"))
	var repository_root := _repository_root()
	var qa_run_root := repository_root.path_join(".run").simplify_path()
	var allowed_base := ""
	if _path_is_inside(normalized_root, user_root):
		allowed_base = user_root
	elif _path_is_inside(normalized_root, qa_run_root):
		allowed_base = qa_run_root
	else:
		errors.append("隔离宠物美术 root 只允许位于 user:// 或仓库 .run/")
	if not DirAccess.dir_exists_absolute(normalized_root):
		errors.append("隔离宠物美术 root 不存在：%s" % normalized_root)
	elif (
		allowed_base != ""
		and _path_has_link_from_root(normalized_root, allowed_base)
	):
		errors.append("隔离宠物美术 root 路径不能包含软链接")
	for forbidden_name in ["mounted", "character", "characters"]:
		if DirAccess.dir_exists_absolute(normalized_root.path_join(forbidden_name)):
			errors.append("pet-only 隔离包禁止 %s 目录" % forbidden_name)
	return errors


static func metadata_validation_errors(
	metadata: Dictionary,
	expected_form_id: String,
	scope: String = SCOPE_BATTLE_STANDALONE
) -> Array[String]:
	var errors: Array[String] = []
	if str(metadata.get("formId", "")).strip_edges() != expected_form_id:
		errors.append("隔离宠物美术 metadata.formId 与 CLI 指定不一致")
	if typeof(metadata.get("runtimeEnabled", null)) != TYPE_BOOL:
		errors.append("隔离宠物美术 metadata.runtimeEnabled 必须是布尔值")
	elif bool(metadata.get("runtimeEnabled", false)):
		errors.append("owner 审核 overlay 禁止 runtimeEnabled=true")
	if typeof(metadata.get("rideableTarget", null)) != TYPE_BOOL:
		errors.append("pet-only 隔离包必须显式声明 rideableTarget=false")
	elif bool(metadata.get("rideableTarget", true)):
		errors.append("pet-only 隔离包禁止 rideableTarget=true")
	if metadata.has("supportedCharacterIds"):
		errors.append("pet-only 隔离包禁止 supportedCharacterIds 字段")
	var mounted_ids = metadata.get("supportedMountedCharacterIds", [])
	if not (mounted_ids is Array) or not (mounted_ids as Array).is_empty():
		errors.append("pet-only 隔离包 supportedMountedCharacterIds 必须为空数组")
	for forbidden_key in ["mounted", "character", "characters", "characterId"]:
		if metadata.has(forbidden_key):
			errors.append("pet-only 隔离包禁止 metadata.%s" % forbidden_key)
	var frame_size = metadata.get("runtimeFrameSize", [])
	if (
		not (frame_size is Array)
		or (frame_size as Array).size() != 2
		or int((frame_size as Array)[0]) != 256
		or int((frame_size as Array)[1]) != 256
	):
		errors.append("隔离宠物美术运行帧必须为 256x256")
	var views = metadata.get("views", [])
	if not (views is Array) or views != VIEWS:
		errors.append("隔离宠物美术必须精确提供两个正式战斗视角")
	var owner_status := str(metadata.get("ownerReviewStatus", "")).strip_edges().to_lower()
	if not ["pending", "owner_review_pending"].has(owner_status):
		errors.append("隔离宠物美术必须保持 owner review pending")
	_append_protected_state_errors(metadata, "metadata", errors)
	_append_identity_contract_errors(metadata, errors)
	if scope == SCOPE_BATTLE_STANDALONE:
		_append_battle_contract_errors(metadata, errors)
	_append_world_contract_errors(metadata, errors)
	return errors


static func frame_validation_errors(
	metadata: Dictionary,
	root_path: String,
	scope: String = SCOPE_BATTLE_STANDALONE
) -> Array[String]:
	var errors: Array[String] = []
	_append_identity_frame_errors(root_path, errors)
	if scope == SCOPE_BATTLE_STANDALONE:
		var actions := metadata.get("actions", {}) as Dictionary
		for view in VIEWS:
			for action in BATTLE_ACTIONS:
				var spec := actions.get(action, {}) as Dictionary
				var frame_count := int(spec.get("frameCount", 0))
				for frame_index in range(1, frame_count + 1):
					var frame_path := root_path.path_join(
						"views/%s/%s/%s-%d.png" % [
							view, action, action, frame_index,
						]
					).simplify_path()
					_append_frame_errors(
						frame_path,
						root_path,
						"战斗",
						errors
					)
	var world_visual := metadata.get("worldVisual", {}) as Dictionary
	var world_actions := world_visual.get("actions", {}) as Dictionary
	for direction in WorldVisualDirectionContract.DIRECTIONS:
		for action in WORLD_ACTIONS:
			var spec := world_actions.get(action, {}) as Dictionary
			var frame_count := int(spec.get("frameCount", 0))
			for frame_index in range(1, frame_count + 1):
				var frame_path := root_path.path_join(
					"world/directions/%s/%s/%s-%d.png" % [
						direction, action, action, frame_index,
					]
				).simplify_path()
				_append_frame_errors(frame_path, root_path, "世界", errors)
	return errors


static func normalized_root_path(root_value: String) -> String:
	var raw_root := root_value.strip_edges()
	if raw_root == "":
		return ""
	var absolute_root := raw_root
	if raw_root.begins_with("user://"):
		absolute_root = ProjectSettings.globalize_path(raw_root)
	elif raw_root.begins_with("res://"):
		absolute_root = ProjectSettings.globalize_path(raw_root)
	elif not raw_root.is_absolute_path():
		return ""
	return _normalized_absolute_path(absolute_root)


static func path_is_inside_active_root(path: String) -> bool:
	return (
		_active_root != ""
		and _path_is_inside(_normalized_absolute_path(path), _active_root)
	)


static func _append_cli_errors(
	errors: Array[String],
	form_id: String,
	root_value: String,
	args: PackedStringArray,
	scope: String
) -> void:
	var form_args: Array[String] = []
	var root_args: Array[String] = []
	var subject_args: Array[String] = []
	var form_prefix := (
		CLI_WORLD_FORM_PREFIX
		if scope == SCOPE_WORLD_PET_ONLY
		else CLI_BATTLE_FORM_PREFIX
	)
	var root_prefix := (
		CLI_WORLD_ROOT_PREFIX
		if scope == SCOPE_WORLD_PET_ONLY
		else CLI_BATTLE_ROOT_PREFIX
	)
	for value in args:
		var arg := str(value).strip_edges()
		if arg.begins_with(form_prefix):
			form_args.append(arg.trim_prefix(form_prefix).strip_edges())
		elif arg.begins_with(root_prefix):
			root_args.append(arg.trim_prefix(root_prefix).strip_edges())
		elif arg.begins_with(CLI_WORLD_SUBJECTS_PREFIX):
			subject_args.append(
				arg.trim_prefix(CLI_WORLD_SUBJECTS_PREFIX).strip_edges()
			)
		elif (
			scope == SCOPE_BATTLE_STANDALONE
			and arg == "--pet-battle-review-preview"
		):
			errors.append("隔离宠物美术 overlay 禁止 brawl 预览")
		elif (
			scope == SCOPE_BATTLE_STANDALONE
			and arg.begins_with(CLI_PREVIEW_PREFIX)
		):
			if arg.trim_prefix(CLI_PREVIEW_PREFIX).strip_edges().to_lower() != "director":
				errors.append("隔离宠物美术 overlay 只允许 director 模式")
		elif (
			scope == SCOPE_BATTLE_STANDALONE
			and arg.begins_with(CLI_MOUNT_PREFIX)
		):
			errors.append("隔离宠物美术 overlay 禁止 mount-form")
		elif (
			scope == SCOPE_BATTLE_STANDALONE
			and arg.begins_with(CLI_STEPS_PREFIX)
		):
			errors.append("隔离宠物美术 overlay 的 14 场清单不可由 CLI 裁剪")
	if form_args.size() != 1 or form_args[0] != form_id:
		errors.append("隔离宠物美术 overlay 必须且只能显式指定一次匹配的 formId")
	if root_args.size() != 1 or root_args[0] != root_value.strip_edges():
		errors.append("隔离宠物美术 overlay 必须且只能显式指定一次匹配的 root")
	if (
		scope == SCOPE_WORLD_PET_ONLY
		and (subject_args.size() != 1 or subject_args[0] != "pet")
	):
		errors.append("世界隔离 overlay 必须且只能显式指定 subjects=pet")


static func _append_battle_contract_errors(
	metadata: Dictionary,
	errors: Array[String]
) -> void:
	var actions_value = metadata.get("actions", {})
	if not (actions_value is Dictionary):
		errors.append("隔离宠物美术 actions 必须是对象")
		return
	var actions := actions_value as Dictionary
	if _sorted_string_keys(actions) != _sorted_strings(BATTLE_ACTIONS):
		errors.append("隔离宠物美术必须精确提供 12 个 standalone 战斗动作")
	for action in BATTLE_ACTIONS:
		var spec_value = actions.get(action, {})
		if not (spec_value is Dictionary):
			errors.append("隔离宠物美术动作规格缺失：%s" % action)
			continue
		var spec := spec_value as Dictionary
		if int(spec.get("frameCount", 0)) != int(BATTLE_FRAME_COUNTS[action]):
			errors.append("隔离宠物美术动作帧数错误：%s" % action)
		if float(spec.get("fps", 0.0)) <= 0.0:
			errors.append("隔离宠物美术动作 fps 无效：%s" % action)
		var status := str(spec.get("status", "")).strip_edges().to_lower()
		if ["", "planned", "missing", "not_produced"].has(status):
			errors.append("隔离宠物美术动作尚未生产：%s" % action)
	var mapping_value = metadata.get("battleViewMapping", {})
	var battle_visual_value = metadata.get("battleVisual", {})
	if battle_visual_value is Dictionary:
		var battle_visual := battle_visual_value as Dictionary
		if str(battle_visual.get("kind", "pet")).strip_edges().to_lower() != "pet":
			errors.append("隔离宠物美术 battleVisual.kind 只能是 pet")
		if bool(battle_visual.get("integratedWholeFrame", false)):
			errors.append("pet-only 隔离包禁止 integratedWholeFrame")
		if bool(battle_visual.get("runtimeLayeredComposition", false)):
			errors.append("pet-only 隔离包禁止 runtimeLayeredComposition")
		if bool(battle_visual.get("runtimeEnabled", false)):
			errors.append("owner 审核 overlay 禁止 battleVisual.runtimeEnabled=true")
		var battle_actions = battle_visual.get("actions", BATTLE_ACTIONS)
		if not (battle_actions is Array) or battle_actions != BATTLE_ACTIONS:
			errors.append("隔离宠物美术 battleVisual.actions 不完整")
		if battle_visual.has("battleViewMapping"):
			mapping_value = battle_visual.get("battleViewMapping", {})
	if not _battle_mapping_is_exact(mapping_value):
		errors.append("隔离宠物美术双方战斗视角映射不正确")


static func _append_world_contract_errors(
	metadata: Dictionary,
	errors: Array[String]
) -> void:
	var world_value = metadata.get("worldVisual", {})
	if not (world_value is Dictionary):
		errors.append("隔离宠物美术 worldVisual 必须是对象")
		return
	var world := world_value as Dictionary
	if str(world.get("strategy", "")) != WorldVisualDirectionContract.STRATEGY_INDEPENDENT_8:
		errors.append("隔离宠物美术世界图必须是真八向独立绘制")
	if bool(world.get("runtimeMirroring", true)):
		errors.append("隔离宠物美术世界图禁止运行时镜像")
	if bool(world.get("runtimeMountedComposition", false)):
		errors.append("pet-only 隔离包禁止 runtimeMountedComposition")
	var directions = world.get("directions", [])
	if not (directions is Array) or directions != WorldVisualDirectionContract.DIRECTIONS:
		errors.append("隔离宠物美术世界方向顺序不完整")
	var actions_value = world.get("actions", {})
	if not (actions_value is Dictionary):
		errors.append("隔离宠物美术 worldVisual.actions 必须是对象")
		return
	var actions := actions_value as Dictionary
	if _sorted_string_keys(actions) != _sorted_strings(WORLD_ACTIONS):
		errors.append("隔离宠物美术世界动作必须精确为 idle + walk")
	for action in WORLD_ACTIONS:
		var spec_value = actions.get(action, {})
		if not (spec_value is Dictionary):
			errors.append("隔离宠物美术世界动作规格缺失：%s" % action)
			continue
		var spec := spec_value as Dictionary
		if int(spec.get("frameCount", 0)) != int(WORLD_FRAME_COUNTS[action]):
			errors.append("隔离宠物美术世界动作帧数错误：%s" % action)
		if float(spec.get("fps", 0.0)) <= 0.0:
			errors.append("隔离宠物美术世界动作 fps 无效：%s" % action)
		var status := str(spec.get("status", "")).strip_edges().to_lower()
		if ["", "planned", "missing", "not_produced"].has(status):
			errors.append("隔离宠物美术世界动作尚未生产：%s" % action)


static func _append_identity_contract_errors(
	metadata: Dictionary,
	errors: Array[String]
) -> void:
	var identity_value = metadata.get("identity", {})
	if not (identity_value is Dictionary):
		errors.append("隔离宠物美术 identity 必须是对象")
		return
	var identity := identity_value as Dictionary
	var status := str(identity.get("status", "")).strip_edges().to_lower()
	if ["", "planned", "missing", "not_produced"].has(status):
		errors.append("隔离宠物美术 identity 尚未生产")
	var source_size = identity.get("sourceFrameSize", [])
	if (
		not (source_size is Array)
		or (source_size as Array).size() != 2
		or int((source_size as Array)[0]) != 512
		or int((source_size as Array)[1]) != 512
	):
		errors.append("隔离宠物美术 identity.sourceFrameSize 必须为 512x512")
	if (
		str(identity.get("board", ""))
		!= "identity/identity-board-transparent.png"
	):
		errors.append("隔离宠物美术 identity.board 路径不规范")
	var poses_value = identity.get("poses", {})
	if not (poses_value is Dictionary):
		errors.append("隔离宠物美术 identity.poses 必须是对象")
		return
	var poses := poses_value as Dictionary
	if _sorted_string_keys(poses) != _sorted_strings(IDENTITY_POSES):
		errors.append("隔离宠物美术 identity 必须精确提供四张独立姿势")
	for pose in IDENTITY_POSES:
		if str(poses.get(pose, "")) != "identity/%s.png" % pose:
			errors.append("隔离宠物美术 identity 姿势路径不规范：%s" % pose)


static func _append_identity_frame_errors(
	root_path: String,
	errors: Array[String]
) -> void:
	_append_sized_image_errors(
		root_path.path_join("identity/identity-board-transparent.png"),
		root_path,
		"身份四姿板",
		Vector2i(1024, 1024),
		errors
	)
	for pose in IDENTITY_POSES:
		_append_sized_image_errors(
			root_path.path_join("identity/%s.png" % pose),
			root_path,
			"身份姿势 %s" % pose,
			Vector2i(512, 512),
			errors
		)


static func _append_sized_image_errors(
	image_path: String,
	root_path: String,
	label: String,
	expected_size: Vector2i,
	errors: Array[String]
) -> void:
	if not _path_is_inside(image_path, root_path):
		errors.append("%s路径越界：%s" % [label, image_path])
		return
	if _path_has_link_from_root(image_path, root_path):
		errors.append("%s路径包含软链接：%s" % [label, image_path])
		return
	if not FileAccess.file_exists(image_path):
		errors.append("缺少%s：%s" % [label, image_path])
		return
	var image = Image.load_from_file(image_path)
	if image == null or image.is_empty():
		errors.append("%s不可读：%s" % [label, image_path])
	elif image.get_size() != expected_size:
		errors.append(
			"%s尺寸不是 %dx%d：%s"
			% [label, expected_size.x, expected_size.y, image_path]
		)


static func _append_protected_state_errors(
	value,
	path: String,
	errors: Array[String]
) -> void:
	if value is Dictionary:
		for key_value in (value as Dictionary).keys():
			var key := str(key_value)
			var child = (value as Dictionary)[key_value]
			var normalized_key := key.replace("_", "").replace("-", "").to_lower()
			if PROTECTED_TRUE_KEYS.has(normalized_key) and child is bool and bool(child):
				errors.append("owner 审核 overlay 禁止 %s.%s=true" % [path, key])
			_append_protected_state_errors(child, "%s.%s" % [path, key], errors)
	elif value is Array:
		for index in range((value as Array).size()):
			_append_protected_state_errors(
				(value as Array)[index],
				"%s[%d]" % [path, index],
				errors
			)


static func _append_frame_errors(
	frame_path: String,
	root_path: String,
	label: String,
	errors: Array[String]
) -> void:
	if not _path_is_inside(frame_path, root_path):
		errors.append("%s帧路径越界：%s" % [label, frame_path])
		return
	if _path_has_link_from_root(frame_path, root_path):
		errors.append("%s帧路径包含软链接：%s" % [label, frame_path])
		return
	if not FileAccess.file_exists(frame_path):
		errors.append("缺少%s帧：%s" % [label, frame_path])
		return
	var image = Image.load_from_file(frame_path)
	if image == null or image.is_empty():
		errors.append("%s帧不可读：%s" % [label, frame_path])
	elif image.get_width() != 256 or image.get_height() != 256:
		errors.append("%s帧尺寸不是 256x256：%s" % [label, frame_path])


static func _battle_mapping_is_exact(mapping_value) -> bool:
	if not (mapping_value is Dictionary):
		return false
	var mapping := mapping_value as Dictionary
	var ally_value = mapping.get("ally", {})
	var enemy_value = mapping.get("enemy", {})
	if not (ally_value is Dictionary) or not (enemy_value is Dictionary):
		return false
	var ally := ally_value as Dictionary
	var enemy := enemy_value as Dictionary
	return (
		str(ally.get("view", "")) == "back_3quarter_ne"
		and bool(ally.get("flipH", false))
		and str(ally.get("facing", "")) == "northwest"
		and str(enemy.get("view", "")) == "front_3quarter_sw"
		and bool(enemy.get("flipH", false))
		and str(enemy.get("facing", "")) == "southeast"
	)


static func _read_metadata(root_path: String) -> Dictionary:
	var metadata_path := root_path.path_join(METADATA_FILE)
	if not FileAccess.file_exists(metadata_path):
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(metadata_path))
	return parsed as Dictionary if parsed is Dictionary else {}


static func _repository_root() -> String:
	var project_root := _normalized_absolute_path(ProjectSettings.globalize_path("res://"))
	return project_root.get_base_dir().get_base_dir().simplify_path()


static func _normalized_absolute_path(path: String) -> String:
	return path.replace("\\", "/").simplify_path().trim_suffix("/")


static func _path_is_inside(path: String, root_path: String) -> bool:
	if path == "" or root_path == "":
		return false
	return path == root_path or path.begins_with("%s/" % root_path)


static func _path_has_link_from_root(path: String, root_path: String) -> bool:
	if not _path_is_inside(path, root_path):
		return true
	var current := root_path
	if _entry_is_link(current):
		return true
	var relative := path.trim_prefix(root_path).trim_prefix("/")
	if relative == "":
		return false
	for component in relative.split("/", false):
		current = current.path_join(component)
		if _entry_is_link(current):
			return true
	return false


static func _entry_is_link(path: String) -> bool:
	var parent := DirAccess.open(path.get_base_dir())
	return parent != null and parent.is_link(path.get_file())


static func _sorted_string_keys(value: Dictionary) -> Array[String]:
	var result: Array[String] = []
	for key in value.keys():
		result.append(str(key))
	result.sort()
	return result


static func _sorted_strings(values: Array[String]) -> Array[String]:
	var result := values.duplicate()
	result.sort()
	return result
