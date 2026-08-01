extends RefCounted

const POLICY_PATH := "res://data/character_name_policy.json"
const DEFAULT_PLAYER_MESSAGE := "这个名字不能使用，请换一个。"
const DEFAULT_MAXIMUM_CONSECUTIVE_DIGITS := 5
const FALLBACK_PREFIXES := ["山", "石", "潮", "风", "火", "苔", "霜", "云"]
const FALLBACK_SUFFIXES := ["岚", "芽", "歌", "铃", "羽", "叶", "角", "舟"]

static var _policy_cache: Dictionary = {}


static func policy() -> Dictionary:
	if not _policy_cache.is_empty():
		return _policy_cache.duplicate(true)
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(POLICY_PATH))
	if parsed is Dictionary:
		_policy_cache = (parsed as Dictionary).duplicate(true)
	else:
		_policy_cache = {}
	return _policy_cache.duplicate(true)


static func player_message() -> String:
	var configured := str(policy().get("playerMessage", "")).strip_edges()
	return configured if configured != "" else DEFAULT_PLAYER_MESSAGE


static func restriction_reason(value: String) -> String:
	if _contains_forbidden_character(value):
		return "forbidden_character"
	var scanned := canonical_scan(value)
	if value.strip_edges() != "" and scanned == "":
		return "empty_after_normalization"
	if _has_long_digit_run(scanned):
		return "long_digit_run"
	var active_policy := policy()
	var latin_token_terms = active_policy.get("latinTokenTerms", [])
	if latin_token_terms is Array:
		for raw_term in latin_token_terms as Array:
			var term := canonical_scan(str(raw_term))
			if term != "" and _matches_latin_token(scanned, term):
				return "latin_token_term"
	var blocked_terms = active_policy.get("blockedTerms", {})
	if blocked_terms is Dictionary:
		for category_value in (blocked_terms as Dictionary).values():
			if not (category_value is Array):
				continue
			for raw_term in category_value as Array:
				var term := canonical_scan(str(raw_term))
				if term != "" and scanned.contains(term):
					return "blocked_term"
	return ""


static func _matches_latin_token(scanned: String, term: String) -> bool:
	var search_from := 0
	while search_from <= scanned.length() - term.length():
		var match_index := scanned.find(term, search_from)
		if match_index < 0:
			return false
		var right_index := match_index + term.length()
		var left_is_ascii_letter := (
			match_index > 0
			and _is_ascii_lower_letter(scanned.unicode_at(match_index - 1))
		)
		var right_is_ascii_letter := (
			right_index < scanned.length()
			and _is_ascii_lower_letter(scanned.unicode_at(right_index))
		)
		if not (left_is_ascii_letter and right_is_ascii_letter):
			return true
		search_from = match_index + 1
	return false


static func _is_ascii_lower_letter(codepoint: int) -> bool:
	return codepoint >= 97 and codepoint <= 122


static func is_allowed(value: String) -> bool:
	return restriction_reason(value) == ""


static func canonical_scan(value: String) -> String:
	var lowered := value.to_lower()
	var result := ""
	for index in range(lowered.length()):
		var codepoint := lowered.unicode_at(index)
		if codepoint >= 0xFF01 and codepoint <= 0xFF5E:
			codepoint -= 0xFEE0
		if codepoint >= 65 and codepoint <= 90:
			codepoint += 32
		if _is_scan_character(codepoint):
			result += String.chr(codepoint)
	return result


static func generate_random_name(
	rng: RandomNumberGenerator,
	avoid_name: String = ""
) -> String:
	var prefixes := _random_name_values("prefixes", FALLBACK_PREFIXES)
	var suffixes := _random_name_values("suffixes", FALLBACK_SUFFIXES)
	if prefixes.is_empty() or suffixes.is_empty():
		return ""
	var safe_rng := rng
	if safe_rng == null:
		safe_rng = RandomNumberGenerator.new()
		safe_rng.randomize()
	var avoid := avoid_name.strip_edges()
	var candidate_count := prefixes.size() * suffixes.size()
	var start := safe_rng.randi_range(0, candidate_count - 1)
	for offset in range(candidate_count):
		var candidate_index := posmod(start + offset, candidate_count)
		var prefix_index := floori(
			float(candidate_index) / float(suffixes.size())
		)
		var suffix_index := candidate_index % suffixes.size()
		var candidate := "%s%s" % [
			prefixes[prefix_index],
			suffixes[suffix_index],
		]
		if candidate != avoid and is_allowed(candidate):
			return candidate
	return ""


static func _random_name_values(key: String, fallback: Array) -> Array[String]:
	var configured = policy().get("randomName", {})
	var raw_values = (
		(configured as Dictionary).get(key, [])
		if configured is Dictionary
		else []
	)
	var result: Array[String] = []
	if raw_values is Array:
		for raw_value in raw_values as Array:
			var value := str(raw_value).strip_edges()
			if value != "" and not result.has(value):
				result.append(value)
	if result.is_empty():
		for raw_value in fallback:
			result.append(str(raw_value))
	return result


static func _has_long_digit_run(value: String) -> bool:
	var maximum := int(
		policy().get(
			"maximumConsecutiveDigits",
			DEFAULT_MAXIMUM_CONSECUTIVE_DIGITS
		)
	)
	maximum = maxi(0, maximum)
	var consecutive := 0
	for index in range(value.length()):
		var codepoint := value.unicode_at(index)
		if codepoint >= 48 and codepoint <= 57:
			consecutive += 1
			if consecutive > maximum:
				return true
		else:
			consecutive = 0
	return false


static func _contains_forbidden_character(value: String) -> bool:
	for index in range(value.length()):
		var codepoint := value.unicode_at(index)
		if (
			codepoint < 32
			or (codepoint >= 127 and codepoint <= 159)
			or codepoint == 0x200B
			or codepoint == 0x200C
			or codepoint == 0x200D
			or codepoint == 0x200E
			or codepoint == 0x200F
			or (codepoint >= 0x202A and codepoint <= 0x202E)
			or (codepoint >= 0x2060 and codepoint <= 0x206F)
			or codepoint == 0xFEFF
		):
			return true
	return false


static func _is_scan_character(codepoint: int) -> bool:
	return (
		(codepoint >= 48 and codepoint <= 57)
		or (codepoint >= 97 and codepoint <= 122)
		or (codepoint >= 0x00C0 and codepoint <= 0x02AF)
		or (codepoint >= 0x0370 and codepoint <= 0x052F)
		or (codepoint >= 0x0590 and codepoint <= 0x06FF)
		or (codepoint >= 0x0900 and codepoint <= 0x0D7F)
		or (codepoint >= 0x3040 and codepoint <= 0x312F)
		or (codepoint >= 0x3400 and codepoint <= 0x9FFF)
		or (codepoint >= 0xAC00 and codepoint <= 0xD7AF)
		or (codepoint >= 0xF900 and codepoint <= 0xFAFF)
		or (codepoint >= 0x20000 and codepoint <= 0x3134F)
	)
