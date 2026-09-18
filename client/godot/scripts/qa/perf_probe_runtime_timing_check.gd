extends SceneTree

const Timing := preload("res://scripts/qa/perf_probe_runtime_timing.gd")


func _initialize() -> void:
	var errors: Array[String] = []
	var samples: Array[Dictionary] = []
	for index in range(8):
		samples.append({"frames": 60, "elapsed": 1.0})
	var unthrottled := Timing.report(samples, 1000000, 1020000, 30, 30)
	var paced := Timing.report(samples, 1000000, 17000000, 30, 30)
	_expect(unthrottled.get("status") == "passed", "固定步长窗口应有有效计时", errors)
	_expect(unthrottled.get("frames") == 480, "应累计所有完整样本的帧数", errors)
	_expect(unthrottled.get("wallElapsedSeconds") == 0.02, "实际时间必须来自单调时钟", errors)
	_expect(unthrottled.get("simulationElapsedSeconds") == 8.0, "模拟时间应保留独立来源", errors)
	_expect(unthrottled.get("wallProcessFramesPerSecond") == 24000.0, "不可把配置限帧伪装成实际执行帧率", errors)
	_expect(unthrottled.get("simulationProcessFramesPerSecond") == 60.0, "模拟帧率不随墙钟变动", errors)
	_expect(paced.get("wallProcessFramesPerSecond") == 30.0, "同帧数在实时窗口应使用实际秒数", errors)
	var changing_budget := Timing.report(samples, 1000000, 9000000, 60, 30)
	_expect(
		changing_budget.get("configuredMaxFpsAtStart") == 60
		and changing_budget.get("configuredMaxFpsAtEnd") == 30,
		"移动结束前后的帧预算必须分别保留",
		errors
	)
	for window in [Vector2i(0, 1000000), Vector2i(1000000, 1000000), Vector2i(2000000, 1000000)]:
		_expect(Timing.report(samples, window.x, window.y, 30, 30).get("status") == "failed", "无效时钟区间不得给出帧率", errors)
	var invalid_samples: Array[Array] = [
		[], [{"frames": 0, "elapsed": 1.0}], [{"frames": 60.5, "elapsed": 1.0}],
		[{"frames": 60, "elapsed": 0.0}], [{"frames": 60, "elapsed": -1.0}],
		[{"frames": 60, "elapsed": INF}], [{"frames": 60, "elapsed": NAN}],
	]
	for invalid in invalid_samples:
		var typed: Array[Dictionary] = []
		typed.assign(invalid)
		_expect(Timing.report(typed, 1000000, 2000000, 30, 30).get("status") == "failed", "无效样本不得生成通过的计时报告", errors)
	print("PERF_PROBE_RUNTIME_TIMING_CHECK: %s" % JSON.stringify({"ok": errors.is_empty(), "errors": errors}))
	quit(0 if errors.is_empty() else 1)


func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)
