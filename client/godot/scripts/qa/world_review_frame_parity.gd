class_name WorldReviewFrameParity
extends RefCounted


static func compare_source_and_loaded(source_res_path: String, texture: Texture2D) -> Dictionary:
	var result := {
		"path": source_res_path,
		"status": "failed",
		"errors": [],
		"sourceFileSha256": "",
		"sourceFileMd5": "",
		"importSourceMd5": "",
		"importFresh": false,
		"loadMode": "",
		"sourceFullDecodedRgbaSha256": "",
		"sourceDecodedRgbaSha256": "",
		"loadedDecodedRgbaSha256": "",
		"canonicalRgbaMatch": false,
	}
	var errors := result["errors"] as Array
	if source_res_path == "" or not source_res_path.begins_with("res://"):
		errors.append("源路径不是 res:// 资源")
		return result
	if texture == null:
		errors.append("ResourceLoader 纹理为空")
		return result
	var source_absolute := ProjectSettings.globalize_path(source_res_path)
	var source := Image.load_from_file(source_absolute)
	if source == null or source.is_empty():
		errors.append("当前源 PNG 无法解码")
		return result
	var loaded := texture.get_image()
	if loaded == null or loaded.is_empty():
		errors.append("Godot 已加载纹理无法解码")
		return result
	result["sourceFileSha256"] = FileAccess.get_sha256(source_res_path)
	result["sourceFileMd5"] = FileAccess.get_md5(source_res_path)
	var import_record := _import_record(source_res_path)
	result["importSourceMd5"] = str(import_record.get("sourceMd5", ""))
	result["importFresh"] = bool(import_record.get("fresh", false))
	result["loadMode"] = str(import_record.get("loadMode", ""))
	for error_value in import_record.get("errors", []):
		errors.append(str(error_value))
	if source.get_size() != loaded.get_size():
		errors.append("源 PNG 与 Godot 纹理尺寸不一致：%s != %s" % [source.get_size(), loaded.get_size()])
		return result
	var source_full_bytes := _full_rgba_bytes(source)
	var source_bytes := _canonical_rgba_bytes(source)
	var loaded_bytes := _canonical_rgba_bytes(loaded)
	result["sourceFullDecodedRgbaSha256"] = _rgba_sha256(source.get_size(), source_full_bytes)
	result["sourceDecodedRgbaSha256"] = _rgba_sha256(source.get_size(), source_bytes)
	result["loadedDecodedRgbaSha256"] = _rgba_sha256(loaded.get_size(), loaded_bytes)
	result["canonicalRgbaMatch"] = source_bytes == loaded_bytes
	if not bool(result["canonicalRgbaMatch"]):
		var difference := _first_difference(source_bytes, loaded_bytes, source.get_width())
		errors.append("当前源 PNG 与 Godot 实际加载像素不一致，首差异=%s" % JSON.stringify(difference))
	if not bool(result["importFresh"]):
		errors.append("Godot import source_md5 不是当前源 PNG；必须重导入后再录制")
	result["status"] = "passed" if errors.is_empty() else "failed"
	return result


static func source_set_sha256(records: Array[Dictionary]) -> String:
	var lines: Array[String] = []
	for record in records:
		lines.append("%s\t%s\t%s\t%s\t%s\n" % [
			str(record.get("kind", "")),
			str(record.get("path", "")),
			str(record.get("sourceFileSha256", "")),
			str(record.get("sourceDecodedRgbaSha256", "")),
			str(record.get("loadedDecodedRgbaSha256", "")),
		])
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	context.update("".join(lines).to_utf8_buffer())
	return context.finish().hex_encode()


static func _import_record(source_res_path: String) -> Dictionary:
	var result := {"sourceMd5": "", "fresh": false, "loadMode": "godot_import", "errors": []}
	var errors := result["errors"] as Array
	var sidecar_path := "%s.import" % source_res_path
	if not FileAccess.file_exists(sidecar_path):
		if not ResourceLoader.exists(source_res_path):
			result["sourceMd5"] = FileAccess.get_md5(source_res_path).to_lower()
			result["fresh"] = true
			result["loadMode"] = "qa_direct_file"
			return result
		errors.append("ResourceLoader 声称资源存在但缺少 import sidecar：%s" % sidecar_path)
		return result
	var sidecar := ConfigFile.new()
	var load_error := sidecar.load(sidecar_path)
	if load_error != OK:
		errors.append("无法读取 Godot import sidecar：%s error=%d" % [sidecar_path, load_error])
		return result
	var imported_res_path := str(sidecar.get_value("remap", "path", ""))
	if not imported_res_path.begins_with("res://.godot/imported/"):
		errors.append("import sidecar 缺少规范 remap.path：%s" % sidecar_path)
		return result
	var md5_path := "%s.md5" % imported_res_path.get_basename()
	if not FileAccess.file_exists(md5_path):
		errors.append("缺少 Godot imported MD5：%s" % md5_path)
		return result
	var text := FileAccess.get_file_as_string(md5_path)
	var matcher := RegEx.new()
	if matcher.compile("source_md5=\\\"([0-9a-fA-F]+)\\\"") != OK:
		errors.append("内部 source_md5 正则编译失败")
		return result
	var matched := matcher.search(text)
	if matched == null:
		errors.append("Godot imported MD5 不含 source_md5：%s" % md5_path)
		return result
	var imported_source_md5 := matched.get_string(1).to_lower()
	result["sourceMd5"] = imported_source_md5
	result["fresh"] = imported_source_md5 == FileAccess.get_md5(source_res_path).to_lower()
	return result


static func _canonical_rgba_bytes(image: Image) -> PackedByteArray:
	var canonical := image.duplicate()
	if canonical.is_compressed():
		canonical.decompress()
	canonical.convert(Image.FORMAT_RGBA8)
	var bytes: PackedByteArray = canonical.get_data()
	for offset in range(0, bytes.size(), 4):
		# Godot's default fix_alpha_border is allowed to rewrite RGB on
		# antialiased pixels.  Preserve every alpha value and every fully opaque
		# RGB value, but normalize partial/transparent RGB before comparison.
		# Fresh source_md5 separately proves that the imported texture came from
		# the current PNG, while this canonical form still catches stale shapes,
		# directions and opaque-color substitutions.
		if bytes[offset + 3] < 255:
			bytes[offset] = 0
			bytes[offset + 1] = 0
			bytes[offset + 2] = 0
	return bytes


static func _full_rgba_bytes(image: Image) -> PackedByteArray:
	var rgba := image.duplicate()
	if rgba.is_compressed():
		rgba.decompress()
	rgba.convert(Image.FORMAT_RGBA8)
	return rgba.get_data()


static func _rgba_sha256(size: Vector2i, bytes: PackedByteArray) -> String:
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	context.update(("%dx%d:RGBA\n" % [size.x, size.y]).to_utf8_buffer())
	context.update(bytes)
	return context.finish().hex_encode()


static func _first_difference(source: PackedByteArray, loaded: PackedByteArray, width: int) -> Dictionary:
	var limit := mini(source.size(), loaded.size())
	for offset in range(limit):
		if source[offset] == loaded[offset]:
			continue
		var pixel_index := int(offset / 4)
		return {
			"x": pixel_index % width,
			"y": int(pixel_index / width),
			"channel": offset % 4,
			"source": source[offset],
			"loaded": loaded[offset],
		}
	return {"byteLengthSource": source.size(), "byteLengthLoaded": loaded.size()}
