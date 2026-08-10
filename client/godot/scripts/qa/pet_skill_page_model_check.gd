extends SceneTree

const BattleActionCatalog := preload(
	"res://scripts/battle/battle_action_catalog.gd"
)
const BattlePassiveCatalog := preload(
	"res://scripts/battle/battle_passive_catalog.gd"
)
const PetSkillIconCatalog := preload(
	"res://scripts/ui/pet_skill_icon_catalog.gd"
)
const PetSkillOverviewPanel := preload(
	"res://scripts/ui/pet_skill_overview_panel.gd"
)
const PetSkillPresentationModel := preload(
	"res://scripts/progression/pet_skill_presentation_model.gd"
)
const PetSkillVisualSkin := preload(
	"res://scripts/ui/pet_skill_visual_skin.gd"
)

const EXPECTED_ACTIVE_ICON_COUNT := 12
const EXPECTED_PASSIVE_ICON_COUNT := 10
const EXPECTED_TOTAL_ICON_COUNT := 22
const EMPTY_ICON_PATH := (
	"res://assets/skills/pet_skill_icons_v1/runtime/common/empty_skill_slot.png"
)
const FORBIDDEN_PRESENTATION_FRAGMENTS: Array[String] = [
	"TBD",
	"TODO",
	"待补",
	"待定",
	"占位",
	"程序员",
	"调试",
	"debug",
	"技能说明尚未补充",
	"效果说明尚未补充",
	"目标规则尚未补充",
	"物理伤害+0",
	"物理伤害 +0",
	"damage +0",
]

var _errors: Array[String] = []
var _slot_events: Array[int] = []
var _learn_events: Array[String] = []
var _card_events: Array[Dictionary] = []


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	_append_catalog_contract_errors()
	var instance := _pet_instance_fixture()
	var normal_panel := await _mount_panel(instance, false, [])
	_append_normal_page_errors(normal_panel)
	normal_panel.queue_free()
	await process_frame

	var training_panel := await _mount_panel(
		instance,
		true,
		_training_options_fixture()
	)
	_append_training_page_errors(training_panel)
	await _append_real_mouse_input_errors(training_panel)
	training_panel.queue_free()
	await process_frame

	var result := {
		"ok": _errors.is_empty(),
		"activeIconCount": BattleActionCatalog.actions_by_owner(
			BattleActionCatalog.OWNER_PET_SKILL
		).size(),
		"passiveIconCount": BattlePassiveCatalog.passives().size(),
		"totalIconCount": (
			BattleActionCatalog.actions_by_owner(
				BattleActionCatalog.OWNER_PET_SKILL
			).size()
			+ BattlePassiveCatalog.passives().size()
		),
		"slotEvents": _slot_events,
		"learnEvents": _learn_events,
		"cardEvents": _card_events.size(),
		"errors": _errors,
	}
	print("pet skill page model check: %s" % JSON.stringify(result))
	quit(0 if _errors.is_empty() else 1)


func _append_catalog_contract_errors() -> void:
	var active_skills := BattleActionCatalog.actions_by_owner(
		BattleActionCatalog.OWNER_PET_SKILL
	)
	var passives := BattlePassiveCatalog.passives()
	if active_skills.size() != EXPECTED_ACTIVE_ICON_COUNT:
		_errors.append(
			"宠物主动技能应为%d个，实际%d个"
			% [EXPECTED_ACTIVE_ICON_COUNT, active_skills.size()]
		)
	if passives.size() != EXPECTED_PASSIVE_ICON_COUNT:
		_errors.append(
			"宠物被动技能应为%d个，实际%d个"
			% [EXPECTED_PASSIVE_ICON_COUNT, passives.size()]
		)
	if active_skills.size() + passives.size() != EXPECTED_TOTAL_ICON_COUNT:
		_errors.append(
			"canonical 技能图标应为%d个，实际%d个"
			% [EXPECTED_TOTAL_ICON_COUNT, active_skills.size() + passives.size()]
		)
	var seen_paths := {}
	for action in active_skills:
		_append_entry_presentation_errors(
			action,
			PetSkillPresentationModel.KIND_ACTIVE,
			seen_paths
		)
	for passive in passives:
		_append_entry_presentation_errors(
			passive,
			PetSkillPresentationModel.KIND_PASSIVE,
			seen_paths
		)
	if seen_paths.size() != EXPECTED_TOTAL_ICON_COUNT:
		_errors.append(
			"正式技能图标路径应一技一图，共%d条，实际%d条"
			% [EXPECTED_TOTAL_ICON_COUNT, seen_paths.size()]
		)
	if not FileAccess.file_exists(EMPTY_ICON_PATH):
		_errors.append("空技能槽正式图标不存在：%s" % EMPTY_ICON_PATH)

	var quick := BattlePassiveCatalog.passive_by_id("quick_instinct")
	var quick_presentation = quick.get("presentation", {})
	if not (quick_presentation is Dictionary):
		_errors.append("quick_instinct 缺少 presentation")
		return
	var quick_view := PetSkillPresentationModel.passive_cards_for_instance({
		"passiveSkillIds": ["quick_instinct"],
	})
	if bool((quick_presentation as Dictionary).get("mechanicsImplemented", true)):
		_errors.append("quick_instinct 错误标记为已实现")
	if (
		not str((quick_presentation as Dictionary).get("description", ""))
		.contains("尚未开放")
	):
		_errors.append("quick_instinct canonical 描述没有明确标示尚未开放")
	if quick_view.size() != 1:
		_errors.append("quick_instinct 没有生成唯一被动卡")
	elif (
		str(quick_view[0].get("effectSummary", ""))
		!= "效果尚未开放"
	):
		_errors.append("quick_instinct 玩家效果摘要没有明确标示尚未开放")


func _append_entry_presentation_errors(
	entry: Dictionary,
	kind: String,
	seen_paths: Dictionary
) -> void:
	var ability_id := str(entry.get("id", "")).strip_edges()
	if ability_id == "":
		_errors.append("canonical 技能存在空 id")
		return
	var raw_presentation = entry.get("presentation", {})
	if not (raw_presentation is Dictionary):
		_errors.append("%s 缺少 presentation 对象" % ability_id)
		return
	var presentation := raw_presentation as Dictionary
	for field in ["description", "role", "source", "iconPath"]:
		var text := str(presentation.get(field, "")).strip_edges()
		if text == "":
			_errors.append("%s.presentation.%s 为空" % [ability_id, field])
	var player_text := " ".join([
		str(entry.get("label", "")),
		str(presentation.get("description", "")),
		str(presentation.get("role", "")),
		str(presentation.get("source", "")),
	])
	for fragment in FORBIDDEN_PRESENTATION_FRAGMENTS:
		if player_text.to_lower().contains(fragment.to_lower()):
			_errors.append(
				"%s 玩家展示含程序员占位文本：%s" % [ability_id, fragment]
			)
	var icon_path := str(presentation.get("iconPath", "")).strip_edges()
	var expected_path := (
		"res://assets/skills/pet_skill_icons_v1/runtime/%s/%s.png"
		% [kind, ability_id]
	)
	if icon_path != expected_path:
		_errors.append(
			"%s 图标没有遵守 exact-ID canonical 路径：%s"
			% [ability_id, icon_path]
		)
	if not FileAccess.file_exists(icon_path):
		_errors.append("%s 图标文件不存在：%s" % [ability_id, icon_path])
	if not PetSkillIconCatalog.uses_formal_icon(
		ability_id,
		kind,
		icon_path
	):
		_errors.append("%s 图标不能作为正式 Texture2D 加载" % ability_id)
	if seen_paths.has(icon_path):
		_errors.append(
			"%s 与 %s 共用了同一正式图标路径"
			% [ability_id, str(seen_paths.get(icon_path, ""))]
		)
	elif icon_path != "":
		seen_paths[icon_path] = ability_id


func _append_normal_page_errors(panel: Control) -> void:
	var snapshot := panel.call("snapshot") as Dictionary
	if bool(snapshot.get("trainingMode", true)):
		_errors.append("普通技能页错误进入训练模式")
	if not bool(snapshot.get("readOnly", false)):
		_errors.append("普通技能页不是只读模式")
	if int(snapshot.get("passiveCount", 0)) != 1:
		_errors.append("普通技能页没有先展示唯一血脉被动")
	if int(snapshot.get("activeSlotCount", 0)) != 7:
		_errors.append("普通技能页没有展示恰好7个主动技能槽")
	if int(snapshot.get("emptySlotCount", 0)) != 1:
		_errors.append("普通技能页空槽夹具数量应为1")
	if int(snapshot.get("trainingCandidateCount", -1)) != 0:
		_errors.append("普通技能页错误展示训练候选")
	var cards := _dictionary_array(snapshot.get("cards", []))
	if cards.size() != 8:
		_errors.append("普通技能页应有1张被动卡+7张主动槽卡")
		return
	if str(cards[0].get("kind", "")) != PetSkillPresentationModel.KIND_PASSIVE:
		_errors.append("普通技能页首卡不是血脉被动")
	for index in range(1, cards.size()):
		var expected_slot := index
		var card := cards[index]
		if int(card.get("slot", 0)) != expected_slot:
			_errors.append(
				"主动技能槽顺序错误：卡%d实际槽%d"
				% [index, int(card.get("slot", 0))]
			)
		if (
			str(card.get("kind", ""))
			not in [
				PetSkillPresentationModel.KIND_ACTIVE,
				PetSkillPresentationModel.KIND_EMPTY,
			]
		):
			_errors.append("主动技能区混入非主动卡：%s" % str(card))
	_append_card_visual_contract_errors(cards, 4)


func _append_card_visual_contract_errors(
	cards: Array[Dictionary],
	selected_slot: int
) -> void:
	for card in cards:
		var is_candidate := bool(card.get("isTrainingCandidate", false))
		var is_empty := bool(card.get("isEmpty", false))
		var slot := int(card.get("slot", 0))
		if (
			absf(
				float(card.get("minimumWidth", 0.0))
				- PetSkillVisualSkin.CARD_WIDTH
			)
			> 0.01
		):
			_errors.append("技能卡宽度不是正式尺寸：%s" % str(card))
		var expected_height := PetSkillVisualSkin.CARD_COLLAPSED_HEIGHT
		if slot == selected_slot and not is_candidate:
			expected_height = PetSkillVisualSkin.CARD_EXPANDED_HEIGHT
		if (
			absf(float(card.get("minimumHeight", 0.0)) - expected_height)
			> 0.01
		):
			_errors.append("技能卡展开/收起高度错误：%s" % str(card))
		if (
			absf(
				float(card.get("iconFrameSize", 0.0))
				- PetSkillVisualSkin.ICON_FRAME_SIZE
			)
			> 0.01
		):
			_errors.append("技能图标框尺寸错误：%s" % str(card))
		if (
			absf(
				float(card.get("iconDisplaySize", 0.0))
				- PetSkillVisualSkin.ICON_SIZE
			)
			> 0.01
		):
			_errors.append("技能图标显示尺寸错误：%s" % str(card))
		if is_empty:
			if not bool(card.get("usesFormalEmptyIcon", false)):
				_errors.append("空技能槽没有使用正式加号图标")
			if str(card.get("emptyIconPath", "")) != EMPTY_ICON_PATH:
				_errors.append("空技能槽图标路径错误")
		elif not bool(card.get("usesFormalIcon", false)):
			_errors.append(
				"非空技能卡没有使用正式图标：%s"
				% str(card.get("abilityId", ""))
			)
		if (
			not is_empty
			and str(card.get("iconPath", "")).strip_edges() == ""
		):
			_errors.append(
				"非空技能卡没有暴露正式图标路径：%s"
				% str(card.get("abilityId", ""))
			)


func _append_training_page_errors(panel: Control) -> void:
	var snapshot := panel.call("snapshot") as Dictionary
	if not bool(snapshot.get("trainingMode", false)):
		_errors.append("训练技能页没有进入训练模式")
	if bool(snapshot.get("readOnly", true)):
		_errors.append("训练技能页错误保留只读标记")
	if int(snapshot.get("activeSlotCount", 0)) != 7:
		_errors.append("训练技能页没有保留7个主动技能槽")
	if int(snapshot.get("trainingCandidateCount", 0)) != 2:
		_errors.append("训练技能页没有展示2张训练候选卡")
	if int(snapshot.get("learnedCandidateCount", 0)) != 1:
		_errors.append("训练技能页没有标记已学候选卡")
	var cards := _dictionary_array(snapshot.get("cards", []))
	var candidates: Array[Dictionary] = []
	for card in cards:
		if bool(card.get("isTrainingCandidate", false)):
			candidates.append(card)
	if candidates.size() != 2:
		return
	if str(candidates[0].get("sourceText", "")) != "需120石币":
		_errors.append("可学候选卡没有展示训练价格")
	if not bool(candidates[0].get("canLearn", false)):
		_errors.append("可学候选卡错误禁用")
	if str(candidates[1].get("sourceText", "")) != "已学":
		_errors.append("已学候选卡没有展示已学状态")
	if bool(candidates[1].get("canLearn", true)):
		_errors.append("已学候选卡仍可重复学习")
	_append_card_visual_contract_errors(cards, 4)


func _append_real_mouse_input_errors(panel: Control) -> void:
	_slot_events.clear()
	_learn_events.clear()
	_card_events.clear()
	panel.slot_selected.connect(_on_slot_selected)
	panel.learn_requested.connect(_on_learn_requested)
	panel.card_selected.connect(_on_card_selected)

	var slot_card := _find_card(panel, "active:6")
	if slot_card == null:
		_errors.append("没有找到用于真实点击的技能槽6")
		return
	await _real_left_click(slot_card)
	if _slot_events != [6]:
		_errors.append(
			"真实槽位点击没有只发出 slot_selected(6)：%s"
			% str(_slot_events)
		)
	if not _learn_events.is_empty():
		_errors.append(
			"真实槽位点击错误触发 learn_requested：%s"
			% str(_learn_events)
		)
	if _card_events.size() != 1:
		_errors.append("真实槽位点击没有只发出一次 card_selected")

	await process_frame
	var candidate := _find_card(panel, "training:pet_focus_bite")
	if candidate == null:
		_errors.append("没有找到用于真实点击的训练候选卡")
		return
	var slots_before := _slot_events.size()
	var cards_before := _card_events.size()
	await _real_left_click(candidate)
	if _slot_events.size() != slots_before:
		_errors.append(
			"训练候选点击错误触发 slot_selected：%s"
			% str(_slot_events)
		)
	if _learn_events != ["pet_focus_bite"]:
		_errors.append(
			"训练候选点击没有只发出对应 learn_requested：%s"
			% str(_learn_events)
		)
	if _card_events.size() != cards_before + 1:
		_errors.append("训练候选点击没有只发出一次 card_selected")


func _mount_panel(
	instance: Dictionary,
	training_mode: bool,
	training_options: Array[Dictionary]
) -> Control:
	root.size = Vector2i(900, 1500)
	var stage := Control.new()
	stage.name = "PetSkillPageQaStage"
	stage.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	stage.mouse_filter = Control.MOUSE_FILTER_PASS
	root.add_child(stage)
	var panel = PetSkillOverviewPanel.new()
	panel.name = "PetSkillOverviewPanel"
	panel.position = Vector2(32.0, 24.0)
	panel.size = Vector2(420.0, 1400.0)
	stage.add_child(panel)
	panel.call("configure", instance, 4, training_mode, training_options)
	await process_frame
	await process_frame
	return panel as Control


func _real_left_click(control: Control) -> void:
	var click_position := control.get_global_rect().get_center()
	var motion := InputEventMouseMotion.new()
	motion.position = click_position
	motion.global_position = click_position
	root.push_input(motion, true)
	await process_frame
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.position = click_position
	press.global_position = click_position
	press.pressed = true
	root.push_input(press, true)
	await process_frame
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.position = click_position
	release.global_position = click_position
	release.pressed = false
	root.push_input(release, true)
	await process_frame


func _find_card(node: Node, key: String) -> Control:
	if node is Control and node.has_method("card_key"):
		if str(node.call("card_key")) == key:
			return node as Control
	for child in node.get_children():
		var found := _find_card(child, key)
		if found != null:
			return found
	return null


func _on_slot_selected(slot: int) -> void:
	_slot_events.append(slot)


func _on_learn_requested(skill_id: String) -> void:
	_learn_events.append(skill_id)


func _on_card_selected(card_view: Dictionary) -> void:
	_card_events.append(card_view.duplicate(true))


func _pet_instance_fixture() -> Dictionary:
	return {
		"instanceId": "qa_skill_page_crystal_wuli",
		"formId": "wuli_evolved_crystal_earth8_water2",
		"name": "晶甲乌力",
		"passiveSkillIds": ["wuli_hard_shell"],
		"activeSkillIds": [
			"pet_attack",
			"pet_defend",
			"pet_bui_charge",
			"pet_sleep_powder",
			"pet_confuse_cry",
			"pet_stone_gaze",
		],
		"petSkillSlots": [
			"pet_attack",
			"pet_defend",
			"pet_bui_charge",
			"pet_sleep_powder",
			"pet_confuse_cry",
			"pet_stone_gaze",
			"",
		],
	}


func _training_options_fixture() -> Array[Dictionary]:
	return [
		{
			"id": "pet_focus_bite",
			"cost": 120,
			"learned": false,
			"canLearn": true,
		},
		{
			"id": "pet_sleep_powder",
			"cost": 80,
			"learned": true,
			"canLearn": false,
		},
	]


func _dictionary_array(raw_value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if raw_value is Array:
		for value in raw_value as Array:
			if value is Dictionary:
				result.append(value as Dictionary)
	return result
