extends RefCounted

const Budget := preload("res://scripts/qa/cave_journey_wait_budget.gd")


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	var budget := Budget.new(0, 1800000)
	_expect(budget.sample(10000, "ordinary-1", 1), "", "enter combat", errors)
	# A moving fight must survive the old 240-second encounter limit and the
	# old 420-second floor limit without repeatedly resetting navigation time.
	for round_number in range(2, 13):
		_expect(budget.sample(10000 + (round_number - 1) * 50000, "ordinary-1", round_number), "", "active long fight", errors)
	_expect(budget.sample(570000), "", "settled fight", errors)
	if budget.navigation_elapsed_ms != 10000 or budget.combat_elapsed_ms != 560000:
		errors.append("combat consumed the navigation allowance")
	_expect(budget.sample(670000, "ordinary-2", 1), "", "next encounter", errors)
	_expect(budget.sample(680000), "", "second settlement", errors)
	_expect(budget.sample(989999), "", "navigation just inside allowance", errors)
	_expect(budget.sample(990000), "return navigation timed out", "cumulative navigation bound", errors)
	budget = Budget.new(0, 1800000)
	_expect(budget.sample(0, "stalled", 7), "", "stall start", errors)
	for time_ms in [1000, 30000, 60000, 89999]:
		_expect(budget.sample(time_ms, "stalled", 7), "", "duplicate round does not renew timeout", errors)
	_expect(budget.sample(90000, "stalled", 7), "route encounter stopped advancing", "bounded stall", errors)
	budget = Budget.new(0, 250000)
	for round_number in range(1, 6):
		_expect(budget.sample((round_number - 1) * 50000, "active", round_number), "", "progress before overall deadline", errors)
	_expect(budget.sample(250000, "active", 6), "whole review timed out", "progress cannot extend whole run", errors)
	budget = Budget.new(0, 1800000)
	budget.sample(0, "room-a", 5)
	_expect(budget.sample(1, "room-b", 6), "route encounter changed before playback completed", "unexpected room replacement", errors)
	budget = Budget.new(0, 1800000)
	budget.sample(0, "room-a", 5)
	_expect(budget.sample(1, "room-a", 4), "route encounter round moved backwards", "round rollback", errors)
	budget = Budget.new(10, 1800000)
	_expect(budget.sample(9), "review clock moved backwards", "clock rollback", errors)
	print("cave journey wait budget check: %s" % JSON.stringify({"status": "passed" if errors.is_empty() else "failed", "errors": errors}))
	return errors


static func _expect(actual: String, expected: String, label: String, errors: Array[String]) -> void:
	if actual != expected:
		errors.append("%s: expected '%s', got '%s'" % [label, expected, actual])
