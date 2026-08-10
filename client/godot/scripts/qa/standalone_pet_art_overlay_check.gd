extends RefCounted

const PetActionAssetCatalog := preload(
	"res://scripts/pet/pet_action_asset_catalog.gd"
)
const PetArtCatalog := preload("res://scripts/pet/pet_art_catalog.gd")
const PetBattleReviewModel := preload(
	"res://scripts/battle/pet_battle_review_model.gd"
)
const StandalonePetArtOverlay := preload(
	"res://scripts/pet/standalone_pet_art_overlay.gd"
)
const StandalonePetArtReviewGate := preload(
	"res://scripts/qa/standalone_pet_art_review_gate.gd"
)
const WorldVisualDirectionContract := preload(
	"res://scripts/world/world_visual_direction_contract.gd"
)

const TARGET_FORM_ID := "emberhorn_fusion_solar_crown_fire7_wind3"
const FIXTURE_ROOT := (
	"user://qa/standalone_pet_art_overlay_v1/"
	+ TARGET_FORM_ID
)
const MISSING_FRAME_ROOT := (
	"user://qa/standalone_pet_art_overlay_v1_missing/"
	+ TARGET_FORM_ID
)
const PET_ART_CATALOG_PATH := "res://data/pet_art_catalog.json"
const PET_FUSION_RECIPES_PATH := "res://data/pet_fusion_recipes.json"

var host


func _init(host_node) -> void:
	host = host_node


func run() -> void:
	var errors: Array[String] = []
	var pet_art_before := FileAccess.get_file_as_string(
		PET_ART_CATALOG_PATH
	)
	var fusion_recipes_before := FileAccess.get_file_as_string(
		PET_FUSION_RECIPES_PATH
	)
	PetActionAssetCatalog.disable_standalone_review_overlay()
	if PetActionAssetCatalog.is_standalone_review_overlay_enabled(
		TARGET_FORM_ID
	):
		errors.append("未传显式 CLI 时 standalone overlay 已启用")
	if PetArtCatalog.supports_form(TARGET_FORM_ID):
		errors.append("测试目标已错误进入生产 pet art runtime 目录")

	var metadata := _fixture_metadata()
	errors.append_array(_build_fixture(FIXTURE_ROOT, metadata, true))
	errors.append_array(
		_build_fixture(MISSING_FRAME_ROOT, metadata, false)
	)
	_append_negative_contract_errors(errors, metadata)

	var args := PackedStringArray([
		"--pet-battle-review-form=%s" % TARGET_FORM_ID,
		"--pet-battle-review-isolated-root=%s" % FIXTURE_ROOT,
		"--pet-battle-review-preview=director",
	])
	var report := (
		PetActionAssetCatalog
		.enable_standalone_review_overlay_for_auto_check(
			TARGET_FORM_ID,
			FIXTURE_ROOT,
			args
		)
	)
	for value in report.get("errors", []):
		errors.append("正例 overlay 注册失败：%s" % str(value))
	if bool(report.get("ok", false)):
		if not PetActionAssetCatalog.supports_form(TARGET_FORM_ID):
			errors.append("隔离 form 没有进入显式 review 资源路径")
		if PetArtCatalog.supports_form(TARGET_FORM_ID):
			errors.append("隔离 overlay 错误伪装成生产 art catalog runtime")
		if not PetActionAssetCatalog.validation_errors_for_form(
			TARGET_FORM_ID,
			true
		).is_empty():
			errors.append("隔离完整包没有通过正式帧合同")
		if (
			not PetActionAssetCatalog.warm_world_form(TARGET_FORM_ID)
			or not PetActionAssetCatalog.warm_battle_form(TARGET_FORM_ID)
		):
			errors.append("隔离完整包未能预热 40 世界帧与 180 战斗帧")
		var sibling_path := (
			StandalonePetArtOverlay.normalized_root_path(FIXTURE_ROOT)
			+ "_sibling/views/front_3quarter_sw/idle/idle-1.png"
		)
		if StandalonePetArtOverlay.load_texture(sibling_path) != null:
			errors.append("隔离 loader 接受了仅共享前缀的兄弟目录")
		errors.append_array(
			StandalonePetArtReviewGate.plan_errors(TARGET_FORM_ID)
		)
		var lab = host._pet_battle_review()
		var no_steps: Array[String] = []
		lab.open(
			TARGET_FORM_ID,
			PetBattleReviewModel.MODE_DIRECTOR,
			309001,
			false,
			"",
			false,
			no_steps,
			true
		)
		await host.get_tree().process_frame
		if not lab.is_active() or not lab.is_standalone_pet_only_review():
			errors.append("standalone director Lab 没有进入严格模式")
		if lab.current_mode() != PetBattleReviewModel.MODE_DIRECTOR:
			errors.append("standalone Lab 不是 director")
		if lab.current_mount_form_id() != "":
			errors.append("standalone Lab 错误保留 mount form")
		if lab.random_mount_form_count() != 0:
			errors.append("standalone Lab 错误注册随机坐骑池")
		if lab.current_director_step_ids() != (
			StandalonePetArtReviewGate.director_step_ids()
		):
			errors.append("standalone Lab 没有锁定精确 14 场")
		if lab.form_option_count() != 1:
			errors.append("standalone Lab 允许切换到其他 form")
		if absf(lab.current_speed_scale() - 1.0) > 0.001:
			errors.append("standalone Lab 默认速度不是 1x")
		lab.cycle_speed()
		if absf(lab.current_speed_scale() - 1.0) > 0.001:
			errors.append("standalone Lab 可绕过 1x owner review")
		errors.append_array(_live_state_errors(host.battle_state))
		lab.close(false)
		await host.get_tree().process_frame
	else:
		PetActionAssetCatalog.disable_standalone_review_overlay()

	var world_args := PackedStringArray([
		"--mount-review-form=%s" % TARGET_FORM_ID,
		"--mount-review-pet-root=%s" % FIXTURE_ROOT,
		"--mount-review-subjects=pet",
	])
	var world_report := (
		PetActionAssetCatalog
		.enable_standalone_review_overlay_for_auto_check(
			TARGET_FORM_ID,
			FIXTURE_ROOT,
			world_args,
			PetActionAssetCatalog.ISOLATED_SCOPE_WORLD_PET_ONLY
		)
	)
	for value in world_report.get("errors", []):
		errors.append("正例 world-only overlay 注册失败：%s" % str(value))
	if bool(world_report.get("ok", false)):
		if not PetActionAssetCatalog.supports_world_form(TARGET_FORM_ID):
			errors.append("world-only overlay 未开放指定宠物世界帧")
		if PetActionAssetCatalog.supports_form(TARGET_FORM_ID):
			errors.append("world-only overlay 错误开放了战斗动作")
		if not PetActionAssetCatalog.warm_world_form(TARGET_FORM_ID):
			errors.append("world-only overlay 未能预热 40 张世界帧")
		if PetActionAssetCatalog.warm_battle_form(TARGET_FORM_ID):
			errors.append("world-only overlay 错误预热了战斗帧")
	PetActionAssetCatalog.disable_standalone_review_overlay(TARGET_FORM_ID)

	if PetActionAssetCatalog.is_standalone_review_overlay_enabled(
		TARGET_FORM_ID
	):
		errors.append("standalone Lab 关闭后 overlay 未注销")
	if (
		PetArtCatalog.form_record(TARGET_FORM_ID).is_empty()
		and PetActionAssetCatalog.supports_form(TARGET_FORM_ID)
	):
		errors.append("standalone Lab 关闭后 form 泄漏到普通运行路径")
	if FileAccess.get_file_as_string(PET_ART_CATALOG_PATH) != pet_art_before:
		errors.append("focused check 改写了生产 pet_art_catalog.json")
	if (
		FileAccess.get_file_as_string(PET_FUSION_RECIPES_PATH)
		!= fusion_recipes_before
	):
		errors.append("focused check 改写了生产 pet_fusion_recipes.json")

	print(
		(
			"standalone pet art overlay check ready: status=%s form=%s "
			+ "steps=%d mounted=0 errors=%s"
		)
		% [
			"ok" if errors.is_empty() else "failed",
			TARGET_FORM_ID,
			StandalonePetArtReviewGate.director_step_ids().size(),
			str(errors),
		]
	)
	host.get_tree().quit(0 if errors.is_empty() else 1)


func _append_negative_contract_errors(
	errors: Array[String],
	metadata: Dictionary
) -> void:
	if not StandalonePetArtOverlay.metadata_validation_errors(
		metadata,
		TARGET_FORM_ID
	).is_empty():
		errors.append("正例 metadata 被 standalone 合同拒绝")
	var mutations: Array[Dictionary] = [
		{"label": "runtime=true", "path": ["runtimeEnabled"], "value": true},
		{
			"label": "nested runtime=true",
			"path": ["battleVisual", "runtimeEnabled"],
			"value": true,
		},
		{"label": "mounted", "path": ["mounted"], "value": {}},
		{"label": "character", "path": ["character"], "value": {}},
		{
			"label": "supportedCharacterIds",
			"path": ["supportedCharacterIds"],
			"value": [],
		},
		{
			"label": "supportedMountedCharacterIds nonempty",
			"path": ["supportedMountedCharacterIds"],
			"value": ["novice_hunter_v1"],
		},
		{
			"label": "supportedMountedCharacterIds wrong type",
			"path": ["supportedMountedCharacterIds"],
			"value": "novice_hunter_v1",
		},
		{"label": "rideable", "path": ["rideableTarget"], "value": true},
	]
	for mutation in mutations:
		var candidate := metadata.duplicate(true)
		_set_nested_value(
			candidate,
			mutation.get("path", []) as Array,
			mutation.get("value")
		)
		if StandalonePetArtOverlay.metadata_validation_errors(
			candidate,
			TARGET_FORM_ID
		).is_empty():
			errors.append(
				"standalone 合同未拒绝 %s"
				% str(mutation.get("label", "负例"))
			)
	var traversal_errors := StandalonePetArtOverlay.root_validation_errors(
		"%s/../escape" % FIXTURE_ROOT
	)
	if traversal_errors.is_empty():
		errors.append("standalone root 未拒绝 .. 越界")
	var production_errors := StandalonePetArtOverlay.root_validation_errors(
		"res://assets/pets/novice_sprout_bui"
	)
	if production_errors.is_empty():
		errors.append("standalone root 未拒绝正式 res:// 资源")
	var bad_cli_cases: Array[PackedStringArray] = [
		PackedStringArray([
			"--pet-battle-review-form=%s" % TARGET_FORM_ID,
			"--pet-battle-review-isolated-root=%s" % FIXTURE_ROOT,
			"--pet-battle-review-preview=brawl",
		]),
		PackedStringArray([
			"--pet-battle-review-form=%s" % TARGET_FORM_ID,
			"--pet-battle-review-isolated-root=%s" % FIXTURE_ROOT,
			"--pet-battle-review-mount-form=bui_novice_sprout_earth5_wind5",
		]),
		PackedStringArray([
			"--pet-battle-review-form=%s" % TARGET_FORM_ID,
			"--pet-battle-review-isolated-root=%s" % FIXTURE_ROOT,
			"--pet-battle-review-steps=attack",
		]),
		PackedStringArray([
			"--pet-battle-review-isolated-root=%s" % FIXTURE_ROOT,
		]),
	]
	for bad_args in bad_cli_cases:
		if StandalonePetArtOverlay.validation_errors_for_request(
			TARGET_FORM_ID,
			FIXTURE_ROOT,
			bad_args,
			StandalonePetArtOverlay.SCOPE_BATTLE_STANDALONE,
			false
		).is_empty():
			errors.append("standalone overlay 接受了非法 CLI：%s" % str(bad_args))
	var missing_args := PackedStringArray([
		"--pet-battle-review-form=%s" % TARGET_FORM_ID,
		"--pet-battle-review-isolated-root=%s" % MISSING_FRAME_ROOT,
	])
	if StandalonePetArtOverlay.validation_errors_for_request(
		TARGET_FORM_ID,
		MISSING_FRAME_ROOT,
		missing_args,
		StandalonePetArtOverlay.SCOPE_BATTLE_STANDALONE,
		true
	).is_empty():
		errors.append("standalone overlay 接受了缺帧完整包")


func _live_state_errors(state: Dictionary) -> Array[String]:
	var errors: Array[String] = []
	var mounted := 0
	var focused_pets := 0
	for value in state.get("actors", []):
		if not (value is Dictionary):
			continue
		var actor := value as Dictionary
		var kind := str(actor.get("kind", ""))
		if kind == "player" and (
			str(actor.get("ridePetFormId", "")).strip_edges() != ""
			or str(actor.get("ridePetInstanceId", "")).strip_edges() != ""
			or int(actor.get("ridePetHp", 0)) > 0
			or int(actor.get("ridePetMaxHp", 0)) > 0
		):
			mounted += 1
		if (
			["pet", "wild_pet"].has(kind)
			and str(actor.get("formId", actor.get("templateId", "")))
			== TARGET_FORM_ID
		):
			focused_pets += 1
	if mounted != 0:
		errors.append("standalone 实机首场 mounted=%d，不是0" % mounted)
	if focused_pets <= 0:
		errors.append("standalone 实机首场没有指定 form 战宠")
	if bool(state.get("reviewMountAllPlayers", true)):
		errors.append("standalone 实机首场声明 reviewMountAllPlayers")
	if int(state.get("reviewExpectedMountedPlayers", -1)) != 0:
		errors.append("standalone 实机首场 expected mounted 不是0")
	if not bool(state.get("reviewPetOnlyVisualIsolation", false)):
		errors.append("standalone 实机首场没有隐藏无关人物占位")
	return errors


func _build_fixture(
	root_value: String,
	metadata: Dictionary,
	include_frames: bool
) -> Array[String]:
	var errors: Array[String] = []
	var root_path := StandalonePetArtOverlay.normalized_root_path(root_value)
	if DirAccess.make_dir_recursive_absolute(root_path) != OK:
		return ["无法创建 standalone QA fixture：%s" % root_path]
	var metadata_path := root_path.path_join("action-bundle-meta.json")
	var metadata_file := FileAccess.open(metadata_path, FileAccess.WRITE)
	if metadata_file == null:
		return ["无法写入 standalone QA metadata：%s" % metadata_path]
	metadata_file.store_string(JSON.stringify(metadata, "\t") + "\n")
	metadata_file.close()
	if not include_frames:
		return errors
	var image := Image.create(256, 256, false, Image.FORMAT_RGBA8)
	image.fill(Color(0.18, 0.64, 0.42, 1.0))
	var identity_root := root_path.path_join("identity")
	DirAccess.make_dir_recursive_absolute(identity_root)
	var identity_pose := Image.create(
		512,
		512,
		false,
		Image.FORMAT_RGBA8
	)
	identity_pose.fill(Color(0.72, 0.34, 0.12, 1.0))
	for pose in StandalonePetArtOverlay.IDENTITY_POSES:
		var pose_path := identity_root.path_join("%s.png" % pose)
		if identity_pose.save_png(pose_path) != OK:
			errors.append("无法写入测试身份姿势：%s" % pose_path)
	var identity_board := Image.create(
		1024,
		1024,
		false,
		Image.FORMAT_RGBA8
	)
	identity_board.fill(Color(0.72, 0.34, 0.12, 1.0))
	var board_path := identity_root.path_join(
		"identity-board-transparent.png"
	)
	if identity_board.save_png(board_path) != OK:
		errors.append("无法写入测试身份四姿板：%s" % board_path)
	for view in StandalonePetArtOverlay.VIEWS:
		for action in StandalonePetArtOverlay.BATTLE_ACTIONS:
			var frame_count := int(
				StandalonePetArtOverlay.BATTLE_FRAME_COUNTS[action]
			)
			var action_root := root_path.path_join(
				"views/%s/%s" % [view, action]
			)
			DirAccess.make_dir_recursive_absolute(action_root)
			for frame_index in range(1, frame_count + 1):
				var frame_path := action_root.path_join(
					"%s-%d.png" % [action, frame_index]
				)
				if image.save_png(frame_path) != OK:
					errors.append("无法写入测试战斗帧：%s" % frame_path)
	for direction in WorldVisualDirectionContract.DIRECTIONS:
		for action in StandalonePetArtOverlay.WORLD_ACTIONS:
			var frame_count := int(
				StandalonePetArtOverlay.WORLD_FRAME_COUNTS[action]
			)
			var action_root := root_path.path_join(
				"world/directions/%s/%s" % [direction, action]
			)
			DirAccess.make_dir_recursive_absolute(action_root)
			for frame_index in range(1, frame_count + 1):
				var frame_path := action_root.path_join(
					"%s-%d.png" % [action, frame_index]
				)
				if image.save_png(frame_path) != OK:
					errors.append("无法写入测试世界帧：%s" % frame_path)
	return errors


func _fixture_metadata() -> Dictionary:
	var actions := {}
	for action in StandalonePetArtOverlay.BATTLE_ACTIONS:
		actions[action] = {
			"frameCount": int(
				StandalonePetArtOverlay.BATTLE_FRAME_COUNTS[action]
			),
			"fps": (
				10
				if ["idle", "defend", "stagger", "down", "revive"].has(
					action
				)
				else 12
			),
			"loop": ["idle", "walk"].has(action),
			"status": "owner_review_pending",
		}
	var world_actions := {}
	for action in StandalonePetArtOverlay.WORLD_ACTIONS:
		world_actions[action] = {
			"frameCount": int(
				StandalonePetArtOverlay.WORLD_FRAME_COUNTS[action]
			),
			"fps": 4 if action == "idle" else 10,
			"loop": true,
			"status": "owner_review_pending",
		}
	var mapping := {
		"ally": {
			"view": "back_3quarter_ne",
			"flipH": true,
			"facing": "northwest",
		},
		"enemy": {
			"view": "front_3quarter_sw",
			"flipH": true,
			"facing": "southeast",
		},
	}
	return {
		"schemaVersion": 1,
		"formId": TARGET_FORM_ID,
		"displayName": "曜冠角兽 QA fixture",
		"artStatus": "in_production",
		"productionScope": "standalone_pet_full_bundle_owner_review",
		"ownerReviewStatus": "pending",
		"runtimeEnabled": false,
		"rideableTarget": false,
		"supportedMountedCharacterIds": [],
		"runtimeFrameSize": [256, 256],
		"views": StandalonePetArtOverlay.VIEWS.duplicate(),
		"identity": {
			"status": "self_review_passed_owner_pending",
			"sourceFrameSize": [512, 512],
			"board": "identity/identity-board-transparent.png",
			"poses": {
				"front_3quarter_sw": "identity/front_3quarter_sw.png",
				"back_3quarter_ne": "identity/back_3quarter_ne.png",
				"south": "identity/south.png",
				"west": "identity/west.png",
			},
		},
		"battleViewMapping": mapping,
		"actions": actions,
		"battleVisual": {
			"status": "owner_review_pending",
			"kind": "pet",
			"views": StandalonePetArtOverlay.VIEWS.duplicate(),
			"battleViewMapping": mapping.duplicate(true),
			"actions": StandalonePetArtOverlay.BATTLE_ACTIONS.duplicate(),
			"runtimeFrameSize": [256, 256],
			"totalFrameCount": 180,
			"runtimeMirroring": false,
			"integratedWholeFrame": false,
			"runtimeLayeredComposition": false,
			"runtimeEnabled": false,
			"runtimeRoot": "views",
		},
		"worldVisual": {
			"status": "owner_review_pending",
			"strategy": "independent_8",
			"runtimeMirroring": false,
			"runtimeMountedComposition": false,
			"directions": (
				WorldVisualDirectionContract.DIRECTIONS.duplicate()
			),
			"actions": world_actions,
			"totalFrameCount": 40,
		},
	}


func _set_nested_value(
	target: Dictionary,
	path: Array,
	value
) -> void:
	if path.is_empty():
		return
	var cursor := target
	for index in range(path.size() - 1):
		var key := str(path[index])
		var child = cursor.get(key, {})
		if not (child is Dictionary):
			child = {}
			cursor[key] = child
		cursor = child as Dictionary
	cursor[str(path[path.size() - 1])] = value
