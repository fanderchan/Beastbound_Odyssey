extends SceneTree

const BattleOutcomeFloatOverlay := preload(
	"res://scripts/ui/battle_outcome_float_overlay.gd"
)
const BattleOutcomePresentationModel := preload(
	"res://scripts/ui/battle_outcome_presentation_model.gd"
)


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var presenter_report := BattleOutcomePresentationModel.debug_self_check()
	var root_control := Control.new()
	root_control.size = Vector2(1280, 720)
	root_control.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(root_control)
	var overlay := BattleOutcomeFloatOverlay.new()
	root_control.add_child(overlay)
	await process_frame
	overlay.size = Vector2(1280, 720)
	var view := {
		"outcomeId": "overlay-check-1",
		"title": "战斗胜利",
		"rewardRows": [
			{"text": "赤芽获得了5120经验", "kind": "exp"},
			{"text": "赤芽升到了98级！", "kind": "level_up", "isLevelUp": true},
			{"text": "黑乌力获得了3584经验", "kind": "exp"},
		],
		"warningRows": [],
	}
	var accepted := overlay.present(view, 0.08)
	var duplicate_rejected := not overlay.present(view, 0.08)
	var appeared := false
	var moved_up := false
	var first_y := 0.0
	var sampled_row := false
	for _frame in range(120):
		await process_frame
		var snapshot := overlay.snapshot()
		var rows: Array = snapshot.get("rows", []) if snapshot.get("rows", []) is Array else []
		if not rows.is_empty():
			appeared = true
			var y := float((rows[0] as Dictionary).get("positionY", 0.0))
			if not sampled_row:
				first_y = y
				sampled_row = true
			elif y < first_y - 4.0:
				moved_up = true
		if int(snapshot.get("completedCount", 0)) >= 1:
			break
	var final_snapshot := overlay.snapshot()
	var checks := {
		"presenter": bool(presenter_report.get("ok", false)),
		"accepted": accepted,
		"duplicate_rejected": duplicate_rejected,
		"appeared": appeared,
		"moved_up": moved_up,
		"completed": int(final_snapshot.get("completedCount", 0)) == 1,
		"auto_closed": not bool(final_snapshot.get("visible", true)),
		"mouse_passthrough": bool(final_snapshot.get("mouseFilterIgnore", false)),
	}
	var ok := true
	for value in checks.values():
		ok = ok and bool(value)
	print("battle outcome float overlay check: status=%s checks=%s snapshot=%s" % [
		"ok" if ok else "failed",
		JSON.stringify(checks),
		JSON.stringify(final_snapshot),
	])
	quit(0 if ok else 1)
