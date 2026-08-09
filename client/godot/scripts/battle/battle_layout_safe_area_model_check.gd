extends SceneTree

const BattleLayoutSafeAreaModel := preload(
	"res://scripts/battle/battle_layout_safe_area_model.gd"
)
const BattleModel := preload("res://scripts/battle/battle_model.gd")

const REFERENCE_VIEWPORT := Vector2(1280.0, 720.0)
const LEGACY_ORIGIN := Vector2(128.0, 338.4)
const LEGACY_LANE_STEP := Vector2(152.0, 52.0)
const LEGACY_RANK_STEP := Vector2(76.0, -48.0)


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var errors: Array[String] = []
	var report := BattleLayoutSafeAreaModel.layout_report(REFERENCE_VIEWPORT)
	_expect(bool(report.get("supported", false)), "1280x720 必须启用正式安全区合同", errors)
	_expect(bool(report.get("ok", false)), "20 个正式阵位必须避开持续 HUD 和视口边界", errors)
	_expect(int(report.get("slotCount", 0)) == 20, "阵位合同必须保持双方各两排五格", errors)
	_expect(
		not bool(
			BattleLayoutSafeAreaModel.layout_report(
				Vector2(1024.0, 768.0)
			).get("supported", true)
		),
		"非 1280x720 不得套用近似缩放后伪装成正式安全区合同",
		errors
	)

	var collisions: Array = report.get("collisions", [])
	var viewport_violations: Array = report.get("viewportViolations", [])
	_expect(collisions.is_empty(), "正式阵位仍存在 HUD 覆盖", errors)
	_expect(viewport_violations.is_empty(), "正式阵位可见包络越出 1280x720", errors)
	var spacing: Dictionary = report.get("spacing", {})
	_expect(
		float(spacing.get("minimumAdjacentSlotDistance", 0.0)) >= 80.0,
		"同排相邻单位距离不足，10v10 可读性会退化",
		errors
	)
	_expect(
		float(spacing.get("minimumFrontBackDistance", 0.0)) >= 150.0,
		"前后排距离不足，人物与战宠层次会退化",
		errors
	)
	_expect(
		float(spacing.get("minimumOpponentAnchorDistance", 0.0)) >= 390.0,
		"敌我最近阵位距离不足，冲锋与大范围特效空间会退化",
		errors
	)
	_expect(
		float(spacing.get("centerChargeDistance", 0.0)) >= 470.0,
		"双方前排中央距离不足，近战冲锋和技能特效空间会退化",
		errors
	)

	var anchors: Dictionary = report.get("anchors", {})
	_expect(
		(anchors.get("enemy.front.5", Vector2.ZERO) as Vector2).is_equal_approx(
			Vector2(502.0, 200.4)
		),
		"enemy.front.5 修复锚点漂移",
		errors
	)
	_expect(
		(anchors.get("ally.back.1", Vector2.ZERO) as Vector2).is_equal_approx(
			Vector2(1110.0, 408.4)
		),
		"ally.back.1 修复锚点漂移",
		errors
	)
	_expect(
		(anchors.get("ally.front.3", Vector2.ZERO) as Vector2).x
			> (anchors.get("enemy.front.3", Vector2.ZERO) as Vector2).x,
		"敌我左右阵营语义不可翻转",
		errors
	)
	_expect(
		(anchors.get("ally.back.3", Vector2.ZERO) as Vector2).y
			> (anchors.get("ally.front.3", Vector2.ZERO) as Vector2).y,
		"我方人物后排必须继续位于战宠前排之后",
		errors
	)
	_expect(
		(anchors.get("enemy.back.3", Vector2.ZERO) as Vector2).y
			< (anchors.get("enemy.front.3", Vector2.ZERO) as Vector2).y,
		"敌方人物后排必须继续位于战宠前排之后",
		errors
	)

	_check_sparse_wild_battle(errors)
	_check_training_subsets(errors)

	var phase402_collisions := _legacy_collision_report(true)
	_expect(
		phase402_collisions.size() == 2,
		"Phase 402 负例必须精确复现旧审计的两处碰撞",
		errors
	)
	_expect(
		_collision_matches(
			phase402_collisions,
			"enemy.front.5",
			"topRoundAndTimer",
			1792
		),
		"负例未复现 enemy.front.5 与顶部计时 1792px² 碰撞",
		errors
	)
	_expect(
		_collision_matches(
			phase402_collisions,
			"ally.back.1",
			"rightBottomCommandControls",
			1736
		),
		"负例未复现 ally.back.1 与右侧指令 1736px² 碰撞",
		errors
	)
	var legacy_visible_collisions := _legacy_collision_report(false)
	_expect(
		legacy_visible_collisions.size() == 4,
		"正式可见包络负例必须识别旧布局全部四处碰撞",
		errors
	)
	_expect(
		_collision_matches(
			legacy_visible_collisions,
			"enemy.front.4",
			"topRoundAndTimer",
			96
		),
		"正式可见包络必须识别旧 enemy.front.4 的顶部碰撞",
		errors
	)
	_expect(
		_collision_matches(
			legacy_visible_collisions,
			"enemy.front.5",
			"topRoundAndTimer",
			5248
		),
		"正式可见包络必须识别旧 enemy.front.5 的更大顶部碰撞",
		errors
	)
	_expect(
		_collision_matches(
			legacy_visible_collisions,
			"ally.back.1",
			"rightBottomCommandControls",
			2240
		),
		"正式可见包络必须识别旧 ally.back.1 的更大右列碰撞",
		errors
	)
	_expect(
		_collision_matches(
			legacy_visible_collisions,
			"ally.back.2",
			"rightBottomCommandControls",
			304
		),
		"正式可见包络必须识别旧 ally.back.2 的右列碰撞",
		errors
	)

	print("BATTLE_LAYOUT_SAFE_AREA_MODEL_CHECK: %s" % JSON.stringify({
		"ok": errors.is_empty(),
		"errors": errors,
		"before": {
			"origin": LEGACY_ORIGIN,
			"laneStep": LEGACY_LANE_STEP,
			"rankStep": LEGACY_RANK_STEP,
			"phase402AuditCollisions": phase402_collisions,
			"visibleEnvelopeCollisions": legacy_visible_collisions,
		},
		"after": report,
	}))
	quit(0 if errors.is_empty() else 1)


func _check_sparse_wild_battle(errors: Array[String]) -> void:
	var state := BattleModel.create_wild_battle({
		"id": "phase403_sparse_contract",
		"name": "Phase403 稀疏阵位",
	})
	_expect(
		not state.has("formationTemplate")
		and not BattleModel.uses_10v10_formation(state),
		"普通单敌战斗必须继续走 legacy 稀疏布局",
		errors
	)
	var expected_slots := {
		"ally_player": "ally.back.3",
		"ally_pet": "ally.front.3",
		"enemy_0": "enemy.front.3",
	}
	for value in state.get("actors", []):
		var actor := value as Dictionary
		var actor_id := str(actor.get("id", ""))
		_expect(
			expected_slots.has(actor_id)
			and str(actor.get("slotId", "")) == str(expected_slots.get(actor_id, "")),
			"普通单敌 actor 的 slotId 漂移：%s" % actor_id,
			errors
		)
	var sparse_anchors := {
		"enemy.front.3": Vector2(409.6, 302.4),
		"ally.front.3": Vector2(896.0, 417.6),
		"ally.back.3": Vector2(1049.6, 504.0),
	}
	for sparse_slot_id in sparse_anchors.keys():
		var envelope := BattleLayoutSafeAreaModel.reference_actor_envelope_for_anchor(
			sparse_anchors.get(sparse_slot_id, Vector2.ZERO) as Vector2
		)
		_expect(
			BattleLayoutSafeAreaModel.reference_persistent_hud_intersections_for_rect(
				envelope
			).is_empty(),
			"legacy 稀疏 1v1 锚点 %s 被持续 HUD 覆盖" % sparse_slot_id,
			errors
		)


func _check_training_subsets(errors: Array[String]) -> void:
	var expected_enemy_slots: Array[String] = []
	for row in ["front", "back"]:
		for slot_index in range(1, 6):
			expected_enemy_slots.append("enemy.%s.%d" % [row, slot_index])
	var zone := {
		"id": "phase403_training_contract",
		"name": "Phase403 训练阵位",
	}
	for actor_count in range(1, 11):
		var state := BattleModel.create_training_partner_battle(zone, actor_count)
		_expect(
			BattleModel.uses_10v10_formation(state),
			"训练战斗 %d 敌必须显式使用 10v10 模板" % actor_count,
			errors
		)
		var enemy_slots: Array[String] = []
		for value in state.get("actors", []):
			var actor := value as Dictionary
			if str(actor.get("side", "")) != BattleModel.SIDE_ENEMY:
				continue
			var value_slot_id := str(actor.get("slotId", ""))
			enemy_slots.append(value_slot_id)
			_expect(
				BattleLayoutSafeAreaModel.is_valid_slot_id(value_slot_id),
				"训练战斗生成非法 slotId：%s" % value_slot_id,
				errors
			)
			_expect(
				BattleLayoutSafeAreaModel.reference_persistent_hud_intersections_for_slot(
					value_slot_id
				).is_empty(),
				"训练战斗 %d 敌的 %s 被持续 HUD 覆盖" % [actor_count, value_slot_id],
				errors
			)
		_expect(
			enemy_slots.size() == actor_count,
			"训练战斗敌人数与请求不一致：%d" % actor_count,
			errors
		)
		for index in range(enemy_slots.size()):
			_expect(
				enemy_slots[index] == expected_enemy_slots[index],
				"训练战斗 %d 敌的 slot 顺序被重排" % actor_count,
				errors
			)
	var full_state := BattleModel.create_formation_preview_battle(zone)
	_expect(
		BattleModel.fills_full_formation(full_state),
		"正式预览必须继续生成双方完整 20 位",
		errors
	)


func _legacy_collision_report(use_phase402_sample: bool) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for value in BattleLayoutSafeAreaModel.all_slot_ids():
		var anchor := _legacy_template_anchor(value)
		var envelope := (
			_phase402_audit_rect_for_anchor(anchor)
			if use_phase402_sample
			else BattleLayoutSafeAreaModel.reference_actor_envelope_for_anchor(anchor)
		)
		for collision in (
			BattleLayoutSafeAreaModel.reference_persistent_hud_intersections_for_rect(
				envelope
			)
		):
			var record := (collision as Dictionary).duplicate(true)
			record["slotId"] = value
			result.append(record)
	return result


func _phase402_audit_rect_for_anchor(anchor: Vector2) -> Rect2:
	var raw_start := (
		anchor + BattleLayoutSafeAreaModel.PHASE402_FROZEN_SAMPLE_ENVELOPE_OFFSET
	)
	var raw_end := (
		raw_start + BattleLayoutSafeAreaModel.PHASE402_FROZEN_SAMPLE_ENVELOPE_SIZE
	)
	var start := Vector2(float(roundi(raw_start.x)), float(roundi(raw_start.y)))
	var end := Vector2(float(roundi(raw_end.x)), float(roundi(raw_end.y)))
	return Rect2(start, end - start).intersection(
		Rect2(Vector2.ZERO, REFERENCE_VIEWPORT)
	)


func _legacy_template_anchor(value: String) -> Vector2:
	var parts := value.split(".")
	var side := str(parts[0])
	var row := str(parts[1])
	var slot_index := int(parts[2])
	var lane := 0
	var rank := slot_index - 1
	if side == "enemy":
		lane = 1 if row == "front" else 0
	else:
		lane = 5 if row == "back" else 4
		rank = 5 - slot_index
	return (
		LEGACY_ORIGIN
		+ LEGACY_LANE_STEP * float(lane)
		+ LEGACY_RANK_STEP * float(rank)
	)


func _collision_matches(
	collisions: Array[Dictionary],
	slot_id: String,
	zone: String,
	area_pixels: int
) -> bool:
	for collision in collisions:
		if (
			str(collision.get("slotId", "")) == slot_id
			and str(collision.get("zone", "")) == zone
			and int(collision.get("areaPixels", -1)) == area_pixels
		):
			return true
	return false


func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)
