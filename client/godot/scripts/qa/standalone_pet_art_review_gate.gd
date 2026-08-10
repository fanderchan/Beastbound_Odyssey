extends RefCounted

const BattleModel := preload("res://scripts/battle/battle_model.gd")
const PetActionAssetCatalog := preload(
	"res://scripts/pet/pet_action_asset_catalog.gd"
)
const PetBattleReviewModel := preload(
	"res://scripts/battle/pet_battle_review_model.gd"
)

const DIRECTOR_STEP_IDS: Array[String] = [
	"attack",
	"defend_hit",
	"hurt",
	"counter",
	"counter_ko",
	"counter_launch",
	"skill",
	"combo",
	"knockaway_straight",
	"knockaway_bounce",
	"dodge",
	"dodge_counter",
	"down",
	PetBattleReviewModel.REVIVE_REVIEW_STEP_ID,
]


static func request_errors(
	form_id: String,
	mode: String,
	mount_form_id: String,
	requested_step_ids: Array[String]
) -> Array[String]:
	var errors: Array[String] = []
	var normalized_form_id := form_id.strip_edges()
	if not OS.is_debug_build():
		errors.append("standalone pet art review 只允许 debug/test 构建")
	if not PetActionAssetCatalog.is_standalone_review_overlay_enabled(
		normalized_form_id
	):
		errors.append("standalone pet art review 未注册匹配的隔离资源")
	if mode != PetBattleReviewModel.MODE_DIRECTOR:
		errors.append("standalone pet art review 只允许 director 模式")
	if mount_form_id.strip_edges() != "":
		errors.append("standalone pet art review 禁止 mount-form")
	if not requested_step_ids.is_empty():
		errors.append("standalone pet art review 禁止裁剪固定 14 场")
	errors.append_array(plan_errors(normalized_form_id))
	return errors


static func director_step_ids() -> Array[String]:
	return DIRECTOR_STEP_IDS.duplicate()


static func director_steps(form_id: String) -> Array[Dictionary]:
	return PetBattleReviewModel.director_steps_for_ids(
		form_id,
		"",
		DIRECTOR_STEP_IDS
	)


static func apply_visual_isolation(state: Dictionary) -> Dictionary:
	state["reviewPetOnlyVisualIsolation"] = true
	return state


static func plan_errors(form_id: String) -> Array[String]:
	var errors: Array[String] = []
	var steps := director_steps(form_id)
	if steps.size() != DIRECTOR_STEP_IDS.size():
		errors.append("standalone pet art review 必须精确生成 14 场")
		return errors
	for index in range(DIRECTOR_STEP_IDS.size()):
		var step_id := str(steps[index].get("id", ""))
		if step_id != DIRECTOR_STEP_IDS[index]:
			errors.append(
				"standalone pet art review 第 %d 场不匹配：%s"
				% [index + 1, step_id]
			)
	errors.append_array(_state_errors(form_id, steps))
	return errors


static func _state_errors(
	form_id: String,
	steps: Array[Dictionary]
) -> Array[String]:
	var errors: Array[String] = []
	for step in steps:
		var step_id := str(step.get("id", ""))
		var state := PetBattleReviewModel.build_director_state(
			form_id,
			309001,
			step_id,
			""
		)
		state = apply_visual_isolation(state)
		if not bool(state.get("reviewPetOnlyVisualIsolation", false)):
			errors.append("standalone 第 %s 场没有启用宠物视觉隔离" % step_id)
			continue
		if (
			bool(state.get("reviewMountAllPlayers", true))
			or int(state.get("reviewExpectedMountedPlayers", -1)) != 0
			or str(state.get("reviewMountFormId", "")) != ""
			or not (state.get("reviewMountFormIds", []) as Array).is_empty()
		):
			errors.append("standalone 第 %s 场错误声明骑乘" % step_id)
			continue
		var mounted_count := 0
		var focused_pet_count := 0
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
				mounted_count += 1
			if (
				["pet", "wild_pet"].has(kind)
				and str(actor.get("formId", actor.get("templateId", ""))) == form_id
			):
				focused_pet_count += 1
		if mounted_count != 0:
			errors.append("standalone 第 %s 场 mounted 必须为 0" % step_id)
		if focused_pet_count <= 0:
			errors.append("standalone 第 %s 场没有指定 form 战宠" % step_id)
		if (state.get("actors", []) as Array).size() != 20:
			errors.append("standalone 第 %s 场没有保留 10V10 阵位" % step_id)
		if str(state.get("reviewMode", "")) != PetBattleReviewModel.MODE_DIRECTOR:
			errors.append("standalone 第 %s 场不是 director 状态" % step_id)
	return errors
