class_name WorldVisualGrade
extends RefCounted

const ROLE_PLAYER := "player"
const ROLE_NPC := "npc"
const ROLE_MAP_OBJECT := "mapObject"
const ROLES: Array[String] = [ROLE_PLAYER, ROLE_NPC, ROLE_MAP_OBJECT]
const FILTER_LINEAR := "linear"
const GROUND_ROLE_AUTHORED_ANCHOR := "authored_low_contrast_anchor"

const SHADER_SOURCE := """
shader_type canvas_item;

uniform float grade_saturation : hint_range(0.0, 2.0) = 1.0;
uniform float grade_contrast : hint_range(0.0, 2.0) = 1.0;
uniform float grade_brightness : hint_range(0.0, 2.0) = 1.0;
uniform vec3 grade_tint = vec3(1.0);

void fragment() {
	// CanvasItem COLOR already contains the sampled texture multiplied by the
	// node's modulate.  Grade that value directly so the texture is not sampled
	// and multiplied a second time, which would square alpha and create dark
	// fringes around character silhouettes.
	vec4 sampled = COLOR;
	float luminance = dot(sampled.rgb, vec3(0.2126, 0.7152, 0.0722));
	vec3 graded = mix(vec3(luminance), sampled.rgb, grade_saturation);
	graded = (graded - vec3(0.5)) * grade_contrast + vec3(0.5);
	graded = clamp(graded * grade_brightness * grade_tint, vec3(0.0), vec3(1.0));
	COLOR = vec4(graded, sampled.a);
}
"""

static var _grade_shader: Shader
static var _material_cache: Dictionary = {}


static func profile_errors(value: Variant) -> Array[String]:
	var errors: Array[String] = []
	if not (value is Dictionary):
		return ["visualGrade 必须是对象"]
	var profile := value as Dictionary
	if str(profile.get("profileId", "")).strip_edges() == "":
		errors.append("visualGrade.profileId 不能为空")
	if str(profile.get("textureFilter", "")) != FILTER_LINEAR:
		errors.append("visualGrade.textureFilter 必须为 linear")
	if str(profile.get("groundRole", "")) != GROUND_ROLE_AUTHORED_ANCHOR:
		errors.append("visualGrade.groundRole 必须保留低对比手绘地表锚点")
	for role in ROLES:
		var grade_value: Variant = profile.get(role)
		if not (grade_value is Dictionary):
			errors.append("visualGrade.%s 必须是对象" % role)
			continue
		var grade := grade_value as Dictionary
		for key in ["saturation", "contrast", "brightness"]:
			var number_value: Variant = grade.get(key)
			if not (number_value is float or number_value is int):
				errors.append("visualGrade.%s.%s 必须是数值" % [role, key])
				continue
			var number := float(number_value)
			if not is_finite(number) or number < 0.5 or number > 1.2:
				errors.append("visualGrade.%s.%s 必须位于 0.5..1.2" % [role, key])
		var tint_value: Variant = grade.get("tint")
		if not (tint_value is Array) or (tint_value as Array).size() != 3:
			errors.append("visualGrade.%s.tint 必须是 RGB 三元组" % role)
			continue
		for component_value in tint_value as Array:
			if not (component_value is float or component_value is int):
				errors.append("visualGrade.%s.tint 分量必须是数值" % role)
				break
			var component := float(component_value)
			if not is_finite(component) or component < 0.5 or component > 1.2:
				errors.append("visualGrade.%s.tint 分量必须位于 0.5..1.2" % role)
				break
	return errors


static func role_grade(prepared_visual: Dictionary, role: String) -> Dictionary:
	if not ROLES.has(role):
		return {}
	var profile_value: Variant = prepared_visual.get("visualGrade", {})
	if not (profile_value is Dictionary):
		return {}
	var profile := profile_value as Dictionary
	var grade_value: Variant = profile.get(role)
	if not (grade_value is Dictionary):
		return {}
	var grade := (grade_value as Dictionary).duplicate(true)
	grade["profileId"] = str(profile.get("profileId", ""))
	grade["textureFilter"] = str(profile.get("textureFilter", ""))
	grade["role"] = role
	return grade


static func grade_signature(grade: Dictionary) -> String:
	if grade.is_empty():
		return "disabled"
	var tint := _tint_from_value(grade.get("tint", [1.0, 1.0, 1.0]))
	return "%s|%s|%s|%.4f|%.4f|%.4f|%.4f,%.4f,%.4f" % [
		str(grade.get("profileId", "")),
		str(grade.get("role", "")),
		str(grade.get("textureFilter", "")),
		float(grade.get("saturation", 1.0)),
		float(grade.get("contrast", 1.0)),
		float(grade.get("brightness", 1.0)),
		tint.x,
		tint.y,
		tint.z,
	]


static func uses_linear_filter(grade: Dictionary) -> bool:
	return not grade.is_empty() and str(grade.get("textureFilter", "")) == FILTER_LINEAR


static func material_for_grade(grade: Dictionary) -> ShaderMaterial:
	if grade.is_empty():
		return null
	var signature := grade_signature(grade)
	if _material_cache.has(signature):
		return _material_cache.get(signature) as ShaderMaterial
	if _grade_shader == null:
		_grade_shader = Shader.new()
		_grade_shader.code = SHADER_SOURCE
	var material := ShaderMaterial.new()
	material.shader = _grade_shader
	material.set_shader_parameter(
		"grade_saturation",
		float(grade.get("saturation", 1.0))
	)
	material.set_shader_parameter(
		"grade_contrast",
		float(grade.get("contrast", 1.0))
	)
	material.set_shader_parameter(
		"grade_brightness",
		float(grade.get("brightness", 1.0))
	)
	material.set_shader_parameter(
		"grade_tint",
		_tint_from_value(grade.get("tint", [1.0, 1.0, 1.0]))
	)
	_material_cache[signature] = material
	return material


static func _tint_from_value(value: Variant) -> Vector3:
	if value is Array and (value as Array).size() == 3:
		return Vector3(
			float((value as Array)[0]),
			float((value as Array)[1]),
			float((value as Array)[2])
		)
	return Vector3.ONE
