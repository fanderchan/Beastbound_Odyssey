extends RefCounted

const PanelRegistry := preload("res://scripts/ui/panel_registry.gd")


static func run(host: Node) -> Dictionary:
	var errors: Array[String] = []
	var cases: Array[String] = []
	var registry := PanelRegistry.new()
	var fixture := Control.new()
	fixture.position = Vector2(-4000, -4000)
	fixture.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var first := Control.new()
	var second := Control.new()
	var hidden_parent := Control.new()
	hidden_parent.hide()
	fixture.add_child(first)
	fixture.add_child(second)
	fixture.add_child(hidden_parent)
	registry.set_world_menu_panels([null, 7, host.get_tree(), first, first])
	_expect(registry, false, "detached registration", cases, errors)
	host.add_child(fixture)
	_expect(registry, true, "enter tree", cases, errors)
	first.hide()
	_expect(registry, false, "hide immediately", cases, errors)
	first.show()
	_expect(registry, true, "show in same frame", cases, errors)
	fixture.hide()
	_expect(registry, false, "hidden ancestor", cases, errors)
	first.hide()
	first.show()
	_expect(registry, false, "child changed under hidden ancestor", cases, errors)
	fixture.show()
	_expect(registry, true, "ancestor restored", cases, errors)
	registry.add_world_menu_panel(second)
	registry.add_world_menu_panel(second)
	first.hide()
	_expect(registry, true, "another visible menu", cases, errors)
	second.hide()
	_expect(registry, false, "last menu hidden", cases, errors)
	first.show()
	host.remove_child(fixture)
	_expect(registry, false, "exit tree", cases, errors)
	host.add_child(fixture)
	_expect(registry, true, "reenter tree", cases, errors)
	first.reparent(hidden_parent)
	_expect(registry, false, "reparent under hidden ancestor", cases, errors)
	hidden_parent.show()
	_expect(registry, true, "new ancestor restored", cases, errors)
	first.reparent(fixture)
	_expect(registry, true, "reparent visible", cases, errors)
	first.free()
	_expect(registry, false, "free visible registered menu", cases, errors)
	registry.set_world_menu_panels([second])
	_expect(registry, false, "replace with hidden menu", cases, errors)
	second.show()
	_expect(registry, true, "replacement shown", cases, errors)
	registry.set_world_menu_panels([])
	second.hide()
	second.show()
	_expect(registry, false, "former menu no longer registered", cases, errors)

	var canvas := CanvasLayer.new()
	var canvas_menu := Control.new()
	canvas.add_child(canvas_menu)
	fixture.add_child(canvas)
	registry.set_world_menu_panels([canvas_menu])
	_expect(registry, canvas_menu.is_visible_in_tree(), "canvas layer visible", cases, errors)
	canvas.hide()
	_expect(registry, canvas_menu.is_visible_in_tree(), "canvas layer hidden", cases, errors)
	canvas.show()
	_expect(registry, canvas_menu.is_visible_in_tree(), "canvas layer restored", cases, errors)
	canvas_menu.queue_free()
	await host.get_tree().process_frame
	_expect(registry, false, "queued free", cases, errors)

	var transient = PanelRegistry.new()
	transient.set_world_menu_panels([second])
	var observer: WeakRef = weakref(transient)
	transient = null
	if observer.get_ref() != null:
		errors.append("signal connections retained released registry")
	cases.append("registry released before controls")
	second.hide()
	second.show()
	registry.set_world_menu_panels([])
	fixture.free()
	return {"status": "passed" if errors.is_empty() else "failed", "cases": cases, "errors": errors}


static func _expect(registry, expected: bool, label: String, cases: Array[String], errors: Array[String]) -> void:
	# Repeated queries must preserve the visible-tree contract between changes.
	for _repeat in range(3):
		if registry.any_world_menu_visible() != expected:
			errors.append(label)
			break
	cases.append(label)
