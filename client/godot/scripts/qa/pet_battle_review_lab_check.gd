extends RefCounted

const BattleModel := preload("res://scripts/battle/battle_model.gd")
const PetBattleReviewModel := preload("res://scripts/battle/pet_battle_review_model.gd")

var host


func _init(host_node) -> void:
	host = host_node


func run() -> void:
	var errors := PetBattleReviewModel.validation_errors()
	var form_id := PetBattleReviewModel.default_form_id()
	var lab = host._pet_battle_review()
	lab.open(form_id, PetBattleReviewModel.MODE_BRAWL, 424242, false)
	await host.get_tree().process_frame
	var first_signature := PetBattleReviewModel.state_signature(host.battle_state)
	if not lab.is_active() or not lab.is_root_visible():
		errors.append("验收场控制面板没有打开")
	if not host.battle_active or not bool(host.battle_state.get("reviewLab", false)):
		errors.append("验收场没有进入隔离战斗")
	if lab.form_option_count() != PetBattleReviewModel.pet_options().size():
		errors.append("宠物选择目录没有完整载入")
	if (host.battle_state.get("actors", []) as Array).size() != 20:
		errors.append("实机验收场不是10V10")
	var layout_size: Vector2 = host._layout_size()
	var top_anchor_y: float = host._battle_enemy_slot_screen_position("back", 4, layout_size).y
	var bottom_anchor_y: float = host._battle_ally_slot_screen_position("back", 4, layout_size).y
	if top_anchor_y < 250.0 or bottom_anchor_y > layout_size.y - 70.0:
		errors.append("展开控制台遮挡了10V10阵位：top=%.1f bottom=%.1f" % [top_anchor_y, bottom_anchor_y])

	lab.replay()
	var replay_signature := PetBattleReviewModel.state_signature(host.battle_state)
	if first_signature != replay_signature or lab.current_seed() != 424242:
		errors.append("实机同种子重播不一致")
	lab.start_brawl(424243)
	var next_signature := PetBattleReviewModel.state_signature(host.battle_state)
	if first_signature == next_signature or lab.current_seed() != 424243:
		errors.append("实机新种子没有改变阵容或数值")

	lab.set_paused(true)
	if lab.scaled_battle_delta(0.1) != 0.0:
		errors.append("暂停没有冻结战斗时间")
	lab.step_one_frame()
	if absf(lab.scaled_battle_delta(0.1) - (1.0 / 60.0)) > 0.0001:
		errors.append("单帧没有推进固定一帧")
	lab.set_paused(false)

	lab.start_director()
	await host.get_tree().process_frame
	if lab.current_mode() != PetBattleReviewModel.MODE_DIRECTOR:
		errors.append("动作必现模式没有启动")
	if str(host.battle_state.get("reviewMode", "")) != PetBattleReviewModel.MODE_DIRECTOR:
		errors.append("动作必现没有使用真实验收战斗状态")
	if PetBattleReviewModel.director_steps(form_id).size() != 12:
		errors.append("动作必现清单不是12个标准场景")
	var actor_counts := _actor_counts(host.battle_state)
	if int(actor_counts.get("ally", 0)) != 10 or int(actor_counts.get("enemy", 0)) != 10:
		errors.append("动作必现没有保留双方10人阵型")
	lab.cycle_speed()
	var director_frames := 0
	while director_frames < 2400 and not lab.required_coverage_complete():
		await host.get_tree().process_frame
		director_frames += 1
	if not lab.required_coverage_complete():
		errors.append("动作必现没有覆盖完整清单：%s" % str(lab.missing_coverage_ids()))

	lab.close(false)
	await host.get_tree().process_frame
	if lab.is_active() or host.battle_active:
		errors.append("退出验收场后仍残留战斗或控制面板")
	var status := "ok" if errors.is_empty() else "failed"
	print("pet battle review lab check ready: status=%s form=%s options=%d steps=%d director_frames=%d coverage=%s actors=%s errors=%s" % [
		status,
		form_id,
		PetBattleReviewModel.pet_options().size(),
		PetBattleReviewModel.director_steps(form_id).size(),
		director_frames,
		str(lab.coverage_counts()),
		str(actor_counts),
		str(errors),
	])
	host.get_tree().quit(0 if errors.is_empty() else 1)


func _actor_counts(state: Dictionary) -> Dictionary:
	var result := {"ally": 0, "enemy": 0, "pet": 0, "player": 0}
	for value in state.get("actors", []):
		if not (value is Dictionary):
			continue
		var actor := value as Dictionary
		var side := str(actor.get("side", ""))
		if result.has(side):
			result[side] = int(result.get(side, 0)) + 1
		var kind := str(actor.get("kind", ""))
		if kind == "player":
			result["player"] = int(result.get("player", 0)) + 1
		elif kind == "pet" or kind == "wild_pet":
			result["pet"] = int(result.get("pet", 0)) + 1
	return result
