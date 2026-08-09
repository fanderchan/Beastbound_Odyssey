extends RefCounted

const BattleLayoutConstants := preload(
	"res://scripts/battle/battle_layout_constants.gd"
)

const SIDE_ENEMY := "enemy"
const SIDE_ALLY := "ally"
const ROW_FRONT := "front"
const ROW_BACK := "back"
const SLOTS_PER_ROW := 5

const REFERENCE_VIEWPORT := Vector2(1280.0, 720.0)
const HUD_SAFETY_PADDING_PX := 8.0

# Reference-pixel envelope for every home-position actor at the formal 10v10
# scale (0.74). Horizontal +/-66 covers the 130.24px compact focus label, the
# 115.44px formal body and the 120px integrated mount. The 148px headroom covers
# the integrated-mount name baseline plus its 9px compact font; 16px remains for
# the formal body, shadow and target-ring ground treatment.
const FORMAL_MAX_VISIBLE_ENVELOPE_OFFSET := Vector2(-66.0, -148.0)
const FORMAL_MAX_VISIBLE_ENVELOPE_SIZE := Vector2(132.0, 164.0)

# Historical Phase 402 audit sample. These constants exist only so the negative
# fixture can reproduce the published 1792/1736px² findings. Passing Phase 403
# layout checks must always use FORMAL_MAX_VISIBLE_ENVELOPE_* above.
const PHASE402_FROZEN_SAMPLE_ENVELOPE_OFFSET := Vector2(-48.0, -112.0)
const PHASE402_FROZEN_SAMPLE_ENVELOPE_SIZE := Vector2(96.0, 128.0)

# Phase 397 persistent player HUD geometry at the reference viewport. The
# message panel and its two footer labels are distinct runtime controls.
const ROUND_PANEL_RECT := Rect2(576.0, 18.0, 128.0, 40.0)
const TIMER_PANEL_RECT := Rect2(584.0, 62.0, 112.0, 44.0)
const MESSAGE_PANEL_RECT := Rect2(57.0, 469.0, 348.0, 233.0)
const MESSAGE_FOOTER_RECT := Rect2(57.0, 703.0, 204.0, 17.0)
const MESSAGE_EXPANDED_RECT := Rect2(24.0, 350.0, 560.0, 352.0)
const MESSAGE_EXPANDED_FOOTER_RECT := Rect2(24.0, 703.0, 204.0, 17.0)
const COMMAND_RIGHT_COLUMN_RECT := Rect2(1186.0, 402.0, 68.0, 300.0)
const COMMAND_BOTTOM_ROW_RECT := Rect2(776.0, 630.0, 478.0, 72.0)

# The submenu is intentionally transient. It may cover battlefield pixels while
# the player is choosing a skill/item, but it closes before target selection;
# therefore it is reported separately and is not allowed to compress all slots.
const COMMAND_TRANSIENT_SUBMENU_RECT := Rect2(880.0, 412.0, 374.0, 282.0)


static func all_slot_ids() -> Array[String]:
	var result: Array[String] = []
	for side in [SIDE_ENEMY, SIDE_ALLY]:
		for row in [ROW_BACK, ROW_FRONT]:
			for slot_index in range(1, SLOTS_PER_ROW + 1):
				result.append(slot_id(str(side), str(row), slot_index))
	return result


static func slot_id(side: String, row: String, slot_index: int) -> String:
	return "%s.%s.%d" % [side, row, slot_index]


static func is_valid_slot_id(value: String) -> bool:
	var parts := value.split(".")
	if parts.size() != 3:
		return false
	var side := str(parts[0])
	var row := str(parts[1])
	var slot_text := str(parts[2])
	var slot_index := int(slot_text)
	return (
		(side == SIDE_ENEMY or side == SIDE_ALLY)
		and (row == ROW_FRONT or row == ROW_BACK)
		and slot_index >= 1
		and slot_index <= SLOTS_PER_ROW
		and str(slot_index) == slot_text
	)


static func template_slot_anchor(value: String) -> Vector2:
	if not is_valid_slot_id(value):
		return Vector2.ZERO
	var parts := value.split(".")
	var side := str(parts[0])
	var row := str(parts[1])
	var slot_index := int(parts[2])
	if side == SIDE_ENEMY:
		return template_enemy_slot_anchor(row, slot_index - 1)
	return template_ally_slot_anchor(row, slot_index - 1)


# Main's draw path already owns a validated 0..4 slot offset. These focused
# helpers preserve the old allocation-free lane/rank arithmetic there; the
# string slot-id parser above remains for checks and external explicit ids.
static func template_enemy_slot_anchor(row: String, slot_offset: int) -> Vector2:
	var lane := 1 if row == ROW_FRONT else 0
	return (
		BattleLayoutConstants.GRID_TEMPLATE_ORIGIN
		+ BattleLayoutConstants.GRID_TEMPLATE_LANE_STEP * float(lane)
		+ BattleLayoutConstants.GRID_TEMPLATE_RANK_STEP * float(slot_offset)
	)


static func template_ally_slot_anchor(row: String, slot_offset: int) -> Vector2:
	var lane := 5 if row == ROW_BACK else 4
	return (
		BattleLayoutConstants.GRID_TEMPLATE_ORIGIN
		+ BattleLayoutConstants.GRID_TEMPLATE_LANE_STEP * float(lane)
		+ BattleLayoutConstants.GRID_TEMPLATE_RANK_STEP * float(4 - slot_offset)
	)


static func screen_slot_anchor(
	value: String,
	viewport_size: Vector2,
	top_inset: float = 0.0
) -> Vector2:
	var transform := template_transform(viewport_size, top_inset)
	var offset := transform.get("offset", Vector2.ZERO) as Vector2
	return offset + template_slot_anchor(value) * float(transform.get("scale", 1.0))


static func template_transform(
	viewport_size: Vector2,
	top_inset: float = 0.0
) -> Dictionary:
	var safe_viewport := Vector2(
		maxf(1.0, viewport_size.x),
		maxf(1.0, viewport_size.y)
	)
	var safe_top_inset := clampf(top_inset, 0.0, safe_viewport.y - 1.0)
	var usable_height := maxf(1.0, safe_viewport.y - safe_top_inset)
	var scale := minf(
		safe_viewport.x / BattleLayoutConstants.GRID_TEMPLATE_SIZE.x,
		usable_height / BattleLayoutConstants.GRID_TEMPLATE_SIZE.y
	)
	var scaled_size := BattleLayoutConstants.GRID_TEMPLATE_SIZE * scale
	return {
		"scale": scale,
		"offset": Vector2(
			(safe_viewport.x - scaled_size.x) * 0.5,
			safe_top_inset + (usable_height - scaled_size.y) * 0.5
		),
	}


static func supports_reference_safe_area_contract(
	viewport_size: Vector2,
	top_inset: float = 0.0
) -> bool:
	return viewport_size.is_equal_approx(REFERENCE_VIEWPORT) and is_zero_approx(top_inset)


static func reference_actor_envelope_for_slot(value: String) -> Rect2:
	return reference_actor_envelope_for_anchor(template_slot_anchor(value))


static func reference_actor_envelope_for_anchor(anchor: Vector2) -> Rect2:
	var raw_start := anchor + FORMAL_MAX_VISIBLE_ENVELOPE_OFFSET
	var raw_end := raw_start + FORMAL_MAX_VISIBLE_ENVELOPE_SIZE
	var start := Vector2(float(roundi(raw_start.x)), float(roundi(raw_start.y)))
	var end := Vector2(float(roundi(raw_end.x)), float(roundi(raw_end.y)))
	return Rect2(start, end - start)


static func reference_persistent_hud_safe_rects() -> Dictionary:
	var viewport_rect := Rect2(Vector2.ZERO, REFERENCE_VIEWPORT)
	var top_union := ROUND_PANEL_RECT.merge(TIMER_PANEL_RECT)
	return {
		"topRoundAndTimer": [
			top_union.grow(HUD_SAFETY_PADDING_PX).intersection(viewport_rect),
		],
		"lowerLeftBattleMessage": [
			MESSAGE_PANEL_RECT.grow(HUD_SAFETY_PADDING_PX).intersection(
				viewport_rect
			),
			MESSAGE_FOOTER_RECT.grow(HUD_SAFETY_PADDING_PX).intersection(
				viewport_rect
			),
		],
		"rightBottomCommandControls": [
			COMMAND_RIGHT_COLUMN_RECT.grow(HUD_SAFETY_PADDING_PX).intersection(
				viewport_rect
			),
			COMMAND_BOTTOM_ROW_RECT.grow(HUD_SAFETY_PADDING_PX).intersection(
				viewport_rect
			),
		],
	}


static func reference_transient_overlay_rects() -> Dictionary:
	return {
		"expandedBattleMessage": [
			MESSAGE_EXPANDED_RECT,
			MESSAGE_EXPANDED_FOOTER_RECT,
		],
		"commandSubmenu": [COMMAND_TRANSIENT_SUBMENU_RECT],
	}


static func reference_persistent_hud_intersections_for_slot(
	value: String
) -> Array[Dictionary]:
	if not is_valid_slot_id(value):
		var invalid_result: Array[Dictionary] = [{
			"zone": "invalidSlotId",
			"rect": Rect2(),
			"areaPixels": 0,
		}]
		return invalid_result
	return reference_persistent_hud_intersections_for_rect(
		reference_actor_envelope_for_slot(value)
	)


static func reference_persistent_hud_intersections_for_rect(
	actor_rect: Rect2
) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var safe_zones := reference_persistent_hud_safe_rects()
	for zone_name in safe_zones.keys():
		var safe_rects: Array = safe_zones.get(zone_name, [])
		for safe_rect_value in safe_rects:
			var safe_rect := safe_rect_value as Rect2
			if not actor_rect.intersects(safe_rect):
				continue
			var overlap := actor_rect.intersection(safe_rect)
			result.append({
				"zone": str(zone_name),
				"rect": overlap,
				"areaPixels": int(round(overlap.size.x * overlap.size.y)),
			})
	return result


static func layout_report(
	viewport_size: Vector2 = REFERENCE_VIEWPORT,
	top_inset: float = 0.0
) -> Dictionary:
	if not supports_reference_safe_area_contract(viewport_size, top_inset):
		return {
			"ok": false,
			"supported": false,
			"viewport": viewport_size,
			"topInset": top_inset,
			"reason": "Phase 403 safe areas are authoritative only at 1280x720 without a top inset.",
		}
	var collisions: Array[Dictionary] = []
	var viewport_violations: Array[Dictionary] = []
	var anchors := {}
	var envelopes := {}
	var viewport_rect := Rect2(Vector2.ZERO, REFERENCE_VIEWPORT)
	for value in all_slot_ids():
		var anchor := template_slot_anchor(value)
		var envelope := reference_actor_envelope_for_anchor(anchor)
		anchors[value] = anchor
		envelopes[value] = envelope
		if not viewport_rect.encloses(envelope):
			viewport_violations.append({
				"slotId": value,
				"rect": envelope,
			})
		for collision in reference_persistent_hud_intersections_for_rect(envelope):
			var record := (collision as Dictionary).duplicate(true)
			record["slotId"] = value
			collisions.append(record)
	var metrics := spacing_metrics(anchors)
	return {
		"ok": collisions.is_empty() and viewport_violations.is_empty(),
		"supported": true,
		"viewport": viewport_size,
		"slotCount": anchors.size(),
		"anchors": anchors,
		"actorVisibleEnvelopes": envelopes,
		"persistentHudSafeRects": reference_persistent_hud_safe_rects(),
		"transientOverlayRects": reference_transient_overlay_rects(),
		"collisions": collisions,
		"viewportViolations": viewport_violations,
		"spacing": metrics,
	}


static func spacing_metrics(anchors: Dictionary) -> Dictionary:
	var minimum_adjacent := INF
	var minimum_front_back := INF
	var minimum_opposing_front := INF
	var minimum_opponent := INF
	for side in [SIDE_ENEMY, SIDE_ALLY]:
		for row in [ROW_FRONT, ROW_BACK]:
			for slot_index in range(1, SLOTS_PER_ROW):
				var first := anchors.get(
					slot_id(str(side), str(row), slot_index),
					Vector2.ZERO
				) as Vector2
				var second := anchors.get(
					slot_id(str(side), str(row), slot_index + 1),
					Vector2.ZERO
				) as Vector2
				minimum_adjacent = minf(minimum_adjacent, first.distance_to(second))
		for slot_index in range(1, SLOTS_PER_ROW + 1):
			var front := anchors.get(
				slot_id(str(side), ROW_FRONT, slot_index),
				Vector2.ZERO
			) as Vector2
			var back := anchors.get(
				slot_id(str(side), ROW_BACK, slot_index),
				Vector2.ZERO
			) as Vector2
			minimum_front_back = minf(minimum_front_back, front.distance_to(back))
	for enemy_slot_index in range(1, SLOTS_PER_ROW + 1):
		var enemy_front := anchors.get(
			slot_id(SIDE_ENEMY, ROW_FRONT, enemy_slot_index),
			Vector2.ZERO
		) as Vector2
		for ally_slot_index in range(1, SLOTS_PER_ROW + 1):
			var ally_front := anchors.get(
				slot_id(SIDE_ALLY, ROW_FRONT, ally_slot_index),
				Vector2.ZERO
			) as Vector2
			minimum_opposing_front = minf(
				minimum_opposing_front,
				enemy_front.distance_to(ally_front)
			)
	for enemy_value in all_slot_ids():
		if not enemy_value.begins_with("enemy."):
			continue
		var enemy_anchor := anchors.get(enemy_value, Vector2.ZERO) as Vector2
		for ally_value in all_slot_ids():
			if not ally_value.begins_with("ally."):
				continue
			var ally_anchor := anchors.get(ally_value, Vector2.ZERO) as Vector2
			minimum_opponent = minf(
				minimum_opponent,
				enemy_anchor.distance_to(ally_anchor)
			)
	var enemy_center := anchors.get("enemy.front.3", Vector2.ZERO) as Vector2
	var ally_center := anchors.get("ally.front.3", Vector2.ZERO) as Vector2
	return {
		"minimumAdjacentSlotDistance": minimum_adjacent,
		"minimumFrontBackDistance": minimum_front_back,
		"minimumOpposingFrontDistance": minimum_opposing_front,
		"minimumOpponentAnchorDistance": minimum_opponent,
		"centerChargeDistance": enemy_center.distance_to(ally_center),
		"centerChargeVector": ally_center - enemy_center,
	}
