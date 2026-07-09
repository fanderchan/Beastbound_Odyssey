extends RefCounted


static func task_prefix(task_text: String, action_text: String, reward_text: String) -> String:
	var lines: Array[String] = [
		"目标  %s" % _single_line(task_text, "当前没有任务"),
		"行动  %s" % _single_line(action_text, "探索营地，寻找新的委托"),
	]
	if reward_text.strip_edges() != "":
		lines.append("奖励  %s" % _single_line(reward_text))
	return "\n".join(lines)


static func world_hud_text(
		task_prefix_text: String,
		player_cell: Vector2i,
		partner_count: int,
		partner_limit: int
	) -> String:
	return "%s\n位置  %d,%d   伙伴 %d/%d" % [
		task_prefix_text if task_prefix_text != "" else "目标  当前没有任务\n行动  探索营地，寻找新的委托",
		player_cell.x,
		player_cell.y,
		maxi(0, partner_count),
		maxi(0, partner_limit),
	]


static func _single_line(value: String, fallback: String = "") -> String:
	var normalized := value.replace("\r", " ").replace("\n", " ").strip_edges()
	return normalized if normalized != "" else fallback
