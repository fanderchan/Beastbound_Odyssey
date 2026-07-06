extends Button

var password_visible: bool = false:
	set(value):
		if password_visible == value:
			return
		password_visible = value
		queue_redraw()


func _ready() -> void:
	text = ""
	clip_text = true
	focus_mode = Control.FOCUS_NONE
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	custom_minimum_size = Vector2(48, 44)
	mouse_entered.connect(queue_redraw)
	mouse_exited.connect(queue_redraw)
	button_down.connect(queue_redraw)
	button_up.connect(queue_redraw)


func _draw() -> void:
	var color := Color(0.88, 0.86, 0.78, 0.95)
	if disabled:
		color.a = 0.36
	elif button_pressed or is_pressed():
		color = Color(1.0, 0.88, 0.48, 1.0)
	elif is_hovered():
		color = Color(0.96, 0.92, 0.78, 1.0)

	var center := size * 0.5
	var eye_width: float = minf(size.x * 0.26, 14.0)
	var eye_height: float = minf(size.y * 0.18, 8.0)
	var points := PackedVector2Array()
	for index in range(13):
		var t := float(index) / 12.0
		points.append(center + Vector2(lerpf(-eye_width, eye_width, t), -sin(t * PI) * eye_height))
	for index in range(13):
		var t := float(index) / 12.0
		points.append(center + Vector2(lerpf(eye_width, -eye_width, t), sin(t * PI) * eye_height))
	points.append(points[0])

	draw_polyline(points, color, 2.0, true)
	draw_circle(center, 3.6, color)
	if password_visible:
		draw_line(
			center + Vector2(-eye_width * 0.9, -eye_height * 1.35),
			center + Vector2(eye_width * 0.9, eye_height * 1.35),
			color,
			2.2,
			true
		)
