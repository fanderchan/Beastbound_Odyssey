extends RefCounted

const BattleModel := preload("res://scripts/battle/battle_model.gd")
const MountedCharacterAssetCatalog := preload("res://scripts/player/mounted_character_asset_catalog.gd")
const MountVisualProfileCatalog := preload("res://scripts/player/mount_visual_profile_catalog.gd")
const PetActionAssetCatalog := preload("res://scripts/pet/pet_action_asset_catalog.gd")
const PetBattleReviewModel := preload("res://scripts/battle/pet_battle_review_model.gd")

var host


func _init(host_node) -> void:
	host = host_node


func run() -> void:
	var errors := PetBattleReviewModel.validation_errors()
	var form_id := PetBattleReviewModel.default_form_id()
	var lab = host._pet_battle_review()
	var audio_world_context: String = (
		host.game_audio_manager.world_context()
		if host.game_audio_manager != null
		else ""
	)
	lab.open(form_id, PetBattleReviewModel.MODE_BRAWL, 424242, false)
	await host.get_tree().process_frame
	var first_signature := PetBattleReviewModel.state_signature(host.battle_state)
	if not lab.is_active() or not lab.is_root_visible():
		errors.append("验收场控制面板没有打开")
	if not host.battle_active or not bool(host.battle_state.get("reviewLab", false)):
		errors.append("验收场没有进入隔离战斗")
	if absf(lab.current_speed_scale() - 1.0) > 0.001:
		errors.append(
			"GM随机观战默认速度不是1.0x：%.2f"
			% lab.current_speed_scale()
		)
	if lab.form_option_count() != PetBattleReviewModel.pet_options().size():
		errors.append("宠物选择目录没有完整载入")
	if (host.battle_state.get("actors", []) as Array).size() != 20:
		errors.append("实机验收场不是10V10")
	if (
		not bool(host.battle_state.get("reviewAiSpectator", false))
		or str(host.battle_state.get("reviewPlacement", ""))
		!= PetBattleReviewModel.PLACEMENT_RANDOM_ALL
	):
		errors.append("GM默认入口没有进入随机战术AI观战")
	var spectator_counts := _spectator_counts(host.battle_state)
	var random_mount_count: int = lab.random_mount_form_count()
	var mount_scale_reports: Array[Dictionary] = lab.random_mount_scale_reports()
	if int(spectator_counts.get("level140", 0)) != 20:
		errors.append("GM随机观战不是20个140级单位：%s" % str(spectator_counts))
	if (
		int(spectator_counts.get("allyPlayerRoles", 0)) != 5
		or int(spectator_counts.get("enemyPlayerRoles", 0)) != 5
		or int(spectator_counts.get("allyPetRoles", 0)) != 5
		or int(spectator_counts.get("enemyPetRoles", 0)) != 5
	):
		errors.append("GM随机观战没有覆盖双方人物/宠物战术角色：%s" % str(spectator_counts))
	if int(spectator_counts.get("petForms", 0)) < 2:
		errors.append("GM随机观战没有随机出多种宠物形态：%s" % str(spectator_counts))
	if random_mount_count < 2:
		errors.append("GM随机观战没有至少两种可用随机坐骑资产")
	if mount_scale_reports.size() != random_mount_count:
		errors.append(
			"随机坐骑没有全部完成主体缩放测量：%d/%d"
			% [mount_scale_reports.size(), random_mount_count]
		)
	var saw_small_mount_correction := false
	for report in mount_scale_reports:
		if not bool(report.get("ok", false)):
			errors.append("随机坐骑主体缩放测量失败：%s" % str(report))
			continue
		var estimated_height := float(report.get("estimatedReviewHeight", 0.0))
		if estimated_height < 80.0 or estimated_height > 110.0:
			errors.append(
				"随机坐骑10V10待机高度没有归一到可读区间：%s"
				% str(report)
			)
		if float(report.get("scaleMultiplier", 1.0)) >= 1.1:
			saw_small_mount_correction = true
	if not saw_small_mount_correction:
		errors.append("随机坐骑池没有命中任何小主体自动放大校准")
	if (
		int(spectator_counts.get("mounted", 0)) != 10
		or int(spectator_counts.get("mountForms", 0)) < 2
	):
		errors.append("GM随机观战没有形成10名随机骑手：%s" % str(spectator_counts))
	if (
		host.game_audio_manager == null
		or not host.game_audio_manager.is_battle_active()
		or host.game_audio_manager.current_music_context() != "battle_normal"
		or host.game_audio_manager.current_music_cue() != "music.battle_normal"
	):
		errors.append("GM随机观战没有切入正式战斗音乐")
	var tactical_events: Array[Dictionary] = lab.build_tactical_round_events(
		host.battle_state.duplicate(true)
	)
	if tactical_events.size() < 10:
		errors.append("战术AI没有为存活单位生成足够决策：%d" % tactical_events.size())
	for event in tactical_events:
		if str(event.get("aiIntent", "")).strip_edges() == "" and str(event.get("type", "")) != "combo_attack":
			errors.append("战术AI事件没有可解释的决策意图：%s" % str(event))
			break
	var layout_size: Vector2 = host._layout_size()
	var top_anchor_y: float = host._battle_enemy_slot_screen_position("back", 4, layout_size).y
	var bottom_anchor_y: float = host._battle_ally_slot_screen_position("back", 4, layout_size).y
	if top_anchor_y < 250.0 or bottom_anchor_y > layout_size.y - 70.0:
		errors.append("展开控制台遮挡了10V10阵位：top=%.1f bottom=%.1f" % [top_anchor_y, bottom_anchor_y])
	lab.toggle_collapsed()
	await host.get_tree().process_frame
	var spectator_top_anchor_y: float = host._battle_enemy_slot_screen_position(
		"back",
		4,
		layout_size
	).y
	if (
		lab.is_root_visible()
		or not lab.is_restore_visible()
		or float(host.battle_state.get("reviewTopInset", -1.0)) != 0.0
	):
		errors.append("纯观战没有完全隐藏顶部工具或释放顶部空间")
	if spectator_top_anchor_y >= top_anchor_y - 80.0:
		errors.append(
			"纯观战没有让10V10阵型使用完整画面：expanded=%.1f spectator=%.1f"
			% [top_anchor_y, spectator_top_anchor_y]
		)
	lab.toggle_collapsed()
	await host.get_tree().process_frame
	if (
		not lab.is_root_visible()
		or lab.is_restore_visible()
		or float(host.battle_state.get("reviewTopInset", -1.0)) != 164.0
	):
		errors.append("GM工具不能从右侧小按钮恢复")

	lab.replay()
	var replay_signature := PetBattleReviewModel.state_signature(host.battle_state)
	if first_signature != replay_signature or lab.current_seed() != 424242:
		errors.append("实机同种子重播不一致")
	lab.start_brawl(424243)
	var next_signature := PetBattleReviewModel.state_signature(host.battle_state)
	if first_signature == next_signature or lab.current_seed() != 424243:
		errors.append("实机新种子没有改变阵容或数值")
	if str(host.battle_state.get("reviewArenaId", "")) == str(
		PetBattleReviewModel.build_brawl_state(
			form_id,
			424242,
			PetBattleReviewModel.PLACEMENT_RANDOM_ALL,
			PetBattleReviewModel.POOL_FORMAL
		).get("reviewArenaId", "")
	):
		errors.append("实机换一场没有切换随机战场地面")
	var arena_before_random_button := str(
		host.battle_state.get("reviewArenaId", "")
	)
	lab.new_random_brawl()
	if str(host.battle_state.get("reviewArenaId", "")) == arena_before_random_button:
		errors.append("GM“换一场”按钮随机到了相同战场地面")

	lab.set_paused(true)
	if lab.scaled_battle_delta(0.1) != 0.0:
		errors.append("暂停没有冻结战斗时间")
	lab.step_one_frame()
	if absf(lab.scaled_battle_delta(0.1) - (1.0 / 60.0)) > 0.0001:
		errors.append("单帧没有推进固定一帧")
	lab.set_paused(false)
	var observed_ai_frames := 0
	while observed_ai_frames < 600 and host.battle_recorded_event_sequence <= 0:
		await host.get_tree().process_frame
		observed_ai_frames += 1
	if host.battle_recorded_event_sequence <= 0:
		errors.append("GM实机自动战斗没有执行战术AI事件")

	lab.close(false)
	var revive_step_ids: Array[String] = [PetBattleReviewModel.REVIVE_REVIEW_STEP_ID]
	lab.open(
		form_id,
		PetBattleReviewModel.MODE_DIRECTOR,
		424242,
		false,
		PetBattleReviewModel.REVIEW_MOUNT_FORM_ID,
		false
	)
	await host.get_tree().process_frame
	if lab.current_mode() != PetBattleReviewModel.MODE_DIRECTOR:
		errors.append("动作必现模式没有启动")
	if lab.current_mount_form_id() != PetBattleReviewModel.REVIEW_MOUNT_FORM_ID:
		errors.append("骑乘动作必现没有载入指定整体坐骑")
	if str(host.battle_state.get("reviewMode", "")) != PetBattleReviewModel.MODE_DIRECTOR:
		errors.append("动作必现没有使用真实验收战斗状态")
	if not bool(host.battle_state.get("reviewMountAllPlayers", false)):
		errors.append("骑乘动作必现没有声明10名人物全员骑乘")
	if PetBattleReviewModel.director_steps(form_id, PetBattleReviewModel.REVIEW_MOUNT_FORM_ID).size() != 21:
		errors.append("骑乘动作必现清单不是21个标准场景")
	var actor_counts := _actor_counts(host.battle_state)
	if int(actor_counts.get("ally", 0)) != 10 or int(actor_counts.get("enemy", 0)) != 10:
		errors.append("动作必现没有保留双方10人阵型")
	if int(actor_counts.get("player", 0)) != 10 or int(actor_counts.get("pet", 0)) != 10:
		errors.append("骑乘动作必现不是10人物＋10战宠")
	if (
		int(actor_counts.get("mounted", 0)) != 10
		or int(actor_counts.get("integratedMounted", 0)) != 10
		or int(actor_counts.get("uniqueRideIds", 0)) != 10
	):
		errors.append("骑乘动作必现没有形成10个唯一整体骑乘单位：%s" % str(actor_counts))
	lab.cycle_speed()
	var director_frames := 0
	while director_frames < 2400 and not lab.required_coverage_complete():
		await host.get_tree().process_frame
		director_frames += 1
	if not lab.required_coverage_complete():
		errors.append("动作必现没有覆盖完整清单：%s" % str(lab.missing_coverage_ids()))
	var director_coverage: Dictionary = lab.coverage_counts()

	lab.close(false)
	lab.open(
		form_id,
		PetBattleReviewModel.MODE_DIRECTOR,
		424242,
		false,
		PetBattleReviewModel.REVIEW_MOUNT_FORM_ID,
		false,
		revive_step_ids
	)
	await host.get_tree().process_frame
	if lab.current_director_step_ids() != revive_step_ids:
		errors.append("--pet-battle-review-steps=revive 没有保留显式复起筛选")
	var revive_frames := 0
	while revive_frames < 360 and int(lab.coverage_counts().get(PetBattleReviewModel.REVIVE_REVIEW_STEP_ID, 0)) <= 0:
		await host.get_tree().process_frame
		revive_frames += 1
	var revive_sequence: Dictionary = lab.last_revive_sequence()
	var revive_coverage: Dictionary = lab.coverage_counts()
	var expected_revive_frames := PetActionAssetCatalog.frame_count_for_action(form_id, "revive")
	var expected_frame_indices: Array[int] = []
	for frame_index in range(1, expected_revive_frames + 1):
		expected_frame_indices.append(frame_index)
	if int(revive_coverage.get(PetBattleReviewModel.REVIVE_REVIEW_STEP_ID, 0)) != 1:
		errors.append("显式复起覆盖数不是1：%s" % str(revive_coverage))
	if not bool(revive_sequence.get("ok", false)):
		errors.append("显式复起序列没有完成：%s" % str(revive_sequence))
	if revive_sequence.get("transitions", []) != ["down", "revive", "idle"]:
		errors.append("显式复起没有保持 down→revive→idle：%s" % str(revive_sequence.get("transitions", [])))
	if revive_sequence.get("frameIndices", []) != expected_frame_indices:
		errors.append("显式复起没有逐帧覆盖正式动作：%s" % str(revive_sequence.get("frameIndices", [])))
	if (
		str(revive_sequence.get("actorId", "")) != PetBattleReviewModel.ENEMY_FOCUS_ID
		or str(revive_sequence.get("catalogAction", "")) != "revive"
		or int(revive_sequence.get("frameCount", 0)) != expected_revive_frames
		or str(revive_sequence.get("finalActionState", "")) != "idle"
		or int(revive_sequence.get("finalHp", 0)) <= 0
	):
		errors.append("显式复起没有由同一战宠播放正式动作并回到待机：%s" % str(revive_sequence))
	if (
		not bool(revive_sequence.get("visualOnly", false))
		or int(revive_sequence.get("eventSequenceBefore", -1)) != int(revive_sequence.get("eventSequenceAfter", -2))
	):
		errors.append("显式复起错误冒充了正式战斗结算事件：%s" % str(revive_sequence))

	lab.close(false)
	await host.get_tree().process_frame
	if lab.is_active() or host.battle_active:
		errors.append("退出验收场后仍残留战斗或控制面板")
	if (
		host.game_audio_manager != null
		and (
			host.game_audio_manager.is_battle_active()
			or host.game_audio_manager.current_music_context()
			!= audio_world_context
		)
	):
		errors.append("退出GM观战后没有恢复原地图音乐语境")
	var status := "ok" if errors.is_empty() else "failed"
	print("pet battle review lab check ready: status=%s form=%s options=%d mounts=%d steps=%d ai_frames=%d director_frames=%d revive_frames=%d spectator=%s mount_scales=%s coverage=%s revive_coverage=%s revive=%s actors=%s errors=%s" % [
		status,
		form_id,
		PetBattleReviewModel.pet_options().size(),
		random_mount_count,
		PetBattleReviewModel.director_steps(form_id, PetBattleReviewModel.REVIEW_MOUNT_FORM_ID).size(),
		observed_ai_frames,
		director_frames,
		revive_frames,
		str(spectator_counts),
		str(mount_scale_reports),
		str(director_coverage),
		str(revive_coverage),
		str(revive_sequence),
		str(actor_counts),
		str(errors),
	])
	host.get_tree().quit(0 if errors.is_empty() else 1)


func _spectator_counts(state: Dictionary) -> Dictionary:
	var result := {
		"level140": 0,
		"mounted": 0,
		"petForms": 0,
		"mountForms": 0,
		"allyPlayerRoles": 0,
		"enemyPlayerRoles": 0,
		"allyPetRoles": 0,
		"enemyPetRoles": 0,
	}
	var pet_forms := {}
	var mount_forms := {}
	var roles := {
		"allyPlayerRoles": {},
		"enemyPlayerRoles": {},
		"allyPetRoles": {},
		"enemyPetRoles": {},
	}
	for value in state.get("actors", []):
		if not (value is Dictionary):
			continue
		var actor := value as Dictionary
		if int(actor.get("level", 0)) == PetBattleReviewModel.LEVEL_CAP:
			result["level140"] = int(result.get("level140", 0)) + 1
		var side := str(actor.get("side", ""))
		var kind := str(actor.get("kind", ""))
		var role_id := str(actor.get("reviewAiRole", ""))
		var role_key := (
			"%s%sRoles" % [
				"ally" if side == BattleModel.SIDE_ALLY else "enemy",
				"Player" if kind == "player" else "Pet",
			]
		)
		if roles.has(role_key) and role_id != "":
			(roles.get(role_key, {}) as Dictionary)[role_id] = true
		if kind == "pet" or kind == "wild_pet":
			pet_forms[str(actor.get("formId", ""))] = true
		if kind == "player":
			var mount_form_id := str(actor.get("ridePetFormId", "")).strip_edges()
			if mount_form_id != "":
				result["mounted"] = int(result.get("mounted", 0)) + 1
				mount_forms[mount_form_id] = true
	result["petForms"] = pet_forms.size()
	result["mountForms"] = mount_forms.size()
	for role_key in roles.keys():
		result[str(role_key)] = (roles.get(role_key, {}) as Dictionary).size()
	return result


func _actor_counts(state: Dictionary) -> Dictionary:
	var result := {
		"ally": 0,
		"enemy": 0,
		"pet": 0,
		"player": 0,
		"mounted": 0,
		"integratedMounted": 0,
		"uniqueRideIds": 0,
	}
	var ride_ids := {}
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
			var ride_id := str(actor.get("ridePetInstanceId", "")).strip_edges()
			var ride_form_id := str(actor.get("ridePetFormId", "")).strip_edges()
			if ride_id != "" and int(actor.get("ridePetHp", 0)) > 0 and int(actor.get("ridePetMaxHp", 0)) > 0:
				result["mounted"] = int(result.get("mounted", 0)) + 1
				ride_ids[ride_id] = true
				var character_id := MountVisualProfileCatalog.character_id_for_form(ride_form_id)
				if (
					MountVisualProfileCatalog.runtime_presentation_mode_for_form(ride_form_id)
					== MountVisualProfileCatalog.PRESENTATION_MODE_INTEGRATED_MOUNTED_BODY
					and MountedCharacterAssetCatalog.supports_combination(character_id, ride_form_id)
				):
					result["integratedMounted"] = int(result.get("integratedMounted", 0)) + 1
		elif kind == "pet" or kind == "wild_pet":
			result["pet"] = int(result.get("pet", 0)) + 1
	result["uniqueRideIds"] = ride_ids.size()
	return result
