extends RefCounted

const WorldOverlayLayer := preload("res://scripts/world/world_overlay_layer.gd")

class Subject extends Node2D:
	var body := Rect2(Vector2(-14, -80), Vector2(28, 80))
	func get_occlusion_world_rect() -> Rect2:
		return global_transform * body


class OverlayProbe extends WorldOverlayLayer:
	var placement_calls := 0
	func _update_facility_positions(subject_rect: Rect2) -> void:
		placement_calls += 1
		super._update_facility_positions(subject_rect)


static func run(host: Node) -> Array[String]:
	var errors: Array[String] = []
	var parent := Node2D.new()
	host.add_child(parent)
	var layer := OverlayProbe.new()
	parent.add_child(layer)
	var subject := Subject.new()
	parent.add_child(subject)
	subject.position = Vector2(100, 170)
	if layer.has_method("set_occlusion_subject"):
		layer.call("set_occlusion_subject", subject)
	var commands: Array[Dictionary] = [{
		"stableId": "facility:primary", "kind": "facility",
		"position": Vector2(100, 160), "text": "岩脉共鸣守卫",
		"width": 126.0, "fill": Color.BROWN,
	}, {
		"stableId": "target:movement", "kind": "target", "position": Vector2(200, 180),
	}]
	layer.replace_commands(commands, "one")
	_check_clear(layer, subject, "站在标记下", errors)
	var label := _label(layer)
	if label.mouse_filter != Control.MOUSE_FILTER_IGNORE:
		errors.append("设施名称截获鼠标输入")
	if layer.target_marker_position() != Vector2(200, 180):
		errors.append("避让名称改动了移动目标标记")
	var count := layer.replace_count()
	var placement_calls := layer.placement_calls
	var initial_id := label.get_instance_id()
	var position := label.global_position
	for _step in range(300): _refresh(layer)
	if layer.replace_count() != count or _label(layer).get_instance_id() != initial_id or label.global_position != position:
		errors.append("静止时名称反复重建或抖动")
	if layer.placement_calls != placement_calls:
		errors.append("静止时反复扫描设施名称")
	label.size.y = 60
	_refresh(layer)
	_check_clear(layer, subject, "实际文字控件高度变化", errors)
	label.size.y = 22
	_refresh(layer)
	subject.position.x = 400
	_refresh(layer)
	_expect_default(layer, "离开名称范围", errors)
	subject.position.x = 100
	_refresh(layer)
	_check_clear(layer, subject, "重新接近", errors)
	subject.hide()
	_refresh(layer)
	_expect_default(layer, "隐藏人物", errors)
	subject.show()
	_refresh(layer)
	_check_clear(layer, subject, "恢复人物", errors)
	# Use the larger geometry already supplied by mounted actors, without reading art.
	subject.body = Rect2(Vector2(-60, -160), Vector2(120, 160))
	_refresh(layer)
	_check_clear(layer, subject, "宽大人物轮廓", errors)
	parent.position = Vector2(35, -21)
	parent.scale = Vector2(1.5, 0.75)
	_refresh(layer)
	_check_clear(layer, subject, "父节点缩放平移", errors)
	layer.replace_commands(commands, "rebuilt", true)
	_check_clear(layer, subject, "相同地点重建覆盖层", errors)
	parent.transform = Transform2D.IDENTITY
	subject.body = Rect2(Vector2(-14, -80), Vector2(28, 80))
	for x in range(0, 221, 2):
		subject.position = Vector2(x, 170)
		_refresh(layer)
		_check_clear(layer, subject, "横穿名称 %d" % x, errors)
	subject.position = Vector2(100, 170)
	_refresh(layer)
	subject.free()
	_refresh(layer)
	_expect_default(layer, "人物释放", errors)
	layer.replace_commands([], "empty")
	_refresh(layer)
	if layer.get_child_count() != 0:
		errors.append("地图清理遗留名称节点")
	parent.free()
	print("world overlay visibility check: %s" % JSON.stringify({"result":"PASS" if errors.is_empty() else "FAIL", "errors":errors, "idleCalls":300, "crossingPositions":111}))
	return errors


static func _refresh(layer: Node) -> void:
	if layer.has_method("refresh_facility_placement"):
		layer.call("refresh_facility_placement")


static func _label(layer: Node) -> Label:
	var root := layer.get_node("Overlay_facility_primary")
	for child in root.get_children():
		if child is Label: return child as Label
	return null


static func _check_clear(layer: Node, subject: Node2D, context: String, errors: Array[String]) -> void:
	var label := _label(layer)
	var rect := label.get_global_transform() * Rect2(Vector2.ZERO, label.size)
	var body: Rect2 = subject.call("get_occlusion_world_rect")
	if rect.intersects(body):
		errors.append("%s：设施名称仍遮挡人物" % context)
	if not label.visible or label.text != "岩脉共鸣守卫" or not is_equal_approx(label.modulate.a, 1.0):
		errors.append("%s：避让时名称内容或可见性改变" % context)


static func _expect_default(layer: Node, context: String, errors: Array[String]) -> void:
	var root := layer.get_node("Overlay_facility_primary") as Node2D
	if root.position != Vector2(100, 160):
		errors.append("%s：名称未回原位" % context)
