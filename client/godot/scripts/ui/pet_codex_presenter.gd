extends RefCounted
class_name PetCodexPresenter

const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)
const BalanceCatalogModel := preload(
	"res://scripts/progression/balance_catalog_model.gd"
)
const PetTemplateCatalog := preload(
	"res://scripts/battle/pet_template_catalog.gd"
)
const BattleActionCatalog := preload(
	"res://scripts/battle/battle_action_catalog.gd"
)
const BattlePassiveCatalog := preload(
	"res://scripts/battle/battle_passive_catalog.gd"
)
const PetCodexAcquisitionRouteCatalog := preload(
	"res://scripts/ui/pet_codex_acquisition_route_catalog.gd"
)

const ELEMENT_ORDER := ["fire", "water", "earth", "wind"]
const ELEMENT_PRESENTATION := {
	"fire": {"label": "火", "color": "#ef7650"},
	"water": {"label": "水", "color": "#55bddd"},
	"earth": {"label": "地", "color": "#cfaa5a"},
	"wind": {"label": "风", "color": "#8bcf65"},
}
const PUBLIC_STAT_ROWS := [
	{"key": "maxHp", "label": "生命 4V"},
	{"key": "attack", "label": "攻击 4V"},
	{"key": "defense", "label": "防御 4V"},
	{"key": "quick", "label": "敏捷 4V"},
]
static var _template_by_form_cache: Dictionary = {}
static var _static_presentations_prepared := false
static var _growth_by_form_cache: Dictionary = {}
static var _attribute_by_form_cache: Dictionary = {}


static func prepare_static_catalog() -> Dictionary:
	if _template_by_form_cache.is_empty():
		for form in PetTemplateCatalog.forms():
			var form_id := str(form.get("formId", "")).strip_edges()
			if form_id == "":
				continue
			var template := PetTemplateCatalog.runtime_template_for_form(form_id)
			if not template.is_empty():
				_template_by_form_cache[form_id] = template
	if not _static_presentations_prepared:
		# Force all static balance/action/passive catalogs to load before the
		# player can click a family. The values are cheap to project later, but
		# their first JSON parse must never land in the selection handler.
		for template_value in _template_by_form_cache.values():
			if not (template_value is Dictionary):
				continue
			var template := template_value as Dictionary
			var form_id := str(template.get("formId", "")).strip_edges()
			if form_id == "":
				continue
			_growth_by_form_cache[form_id] = _growth_presentation(template)
			_attribute_by_form_cache[form_id] = _attribute_presentation(
				template,
				{"recordLabel": ""}
			)
		_static_presentations_prepared = true
	return {
		"templateCount": _template_by_form_cache.size(),
		"presentationsPrepared": _static_presentations_prepared,
	}


static func build_view_state(
	profile: Dictionary,
	selected_form_id: String = ""
) -> Dictionary:
	var entries := PlayerProgressModel.codex_entries(profile)
	return build_view_state_from_entries(entries, selected_form_id)


# Formal host hot path: entries are prepared once when the authoritative
# profile changes. Selection then projects only the requested form from memory;
# it performs no profile normalization, pet scan, or filesystem access.
static func build_view_state_from_entries(
	entries: Array[Dictionary],
	selected_form_id: String = ""
) -> Dictionary:
	return build_view_state_from_projection(
		prepare_profile_projection(entries),
		selected_form_id
	)


static func prepare_profile_projection(
	entries: Array[Dictionary]
) -> Dictionary:
	prepare_static_catalog()
	var entry_by_form := {}
	var seen_count := 0
	for entry in entries:
		var form_id := str(entry.get("formId", "")).strip_edges()
		if form_id == "":
			continue
		entry_by_form[form_id] = entry
		if bool(entry.get("seen", false)):
			seen_count += 1
	var families_base := _family_entries(entries, "")
	var forms_by_line := {}
	for family in families_base:
		var line_id := str(family.get("lineId", "")).strip_edges()
		if line_id != "":
			forms_by_line[line_id] = _form_entries(entries, line_id, "")
	var projection := {
		"entries": entries,
		"entryByForm": entry_by_form,
		"familiesBase": families_base,
		"formsByLine": forms_by_line,
		"seenCount": seen_count,
		"totalCount": entries.size(),
		"defaultFormId": _resolved_selected_form_id(entries, ""),
		"stateByForm": {},
	}
	var state_by_form := projection.get("stateByForm", {}) as Dictionary
	for entry in entries:
		var form_id := str(entry.get("formId", "")).strip_edges()
		if form_id != "":
			state_by_form[form_id] = _build_projection_state(
				projection,
				form_id
			)
	projection["stateByForm"] = state_by_form
	return projection


static func build_view_state_from_projection(
	projection: Dictionary,
	selected_form_id: String = ""
) -> Dictionary:
	var state_by_form_value = projection.get("stateByForm", {})
	var state_by_form := (
		state_by_form_value as Dictionary
		if state_by_form_value is Dictionary
		else {}
	)
	var selected_id := selected_form_id.strip_edges()
	if not state_by_form.has(selected_id):
		selected_id = str(projection.get("defaultFormId", ""))
	var state_value = state_by_form.get(selected_id, {})
	return state_value as Dictionary if state_value is Dictionary else {}


static func _build_projection_state(
	projection: Dictionary,
	selected_id: String
) -> Dictionary:
	var entry_by_form := projection.get("entryByForm", {}) as Dictionary
	var selected_entry_value = entry_by_form.get(selected_id, {})
	var selected_entry := (
		selected_entry_value as Dictionary
		if selected_entry_value is Dictionary
		else {}
	)
	var selected_template := _template_for_form(selected_id)
	var selected_seen := bool(selected_entry.get("seen", false))
	var selected_line_id := str(selected_template.get("lineId", ""))

	var selected_pet := {
		"formId": selected_id,
		"seen": selected_seen,
	}
	var growth: Dictionary = {}
	var attributes: Dictionary = {}
	var acquisition_routes: Array[Dictionary] = []
	if selected_seen and not selected_template.is_empty():
		selected_pet.merge({
			"name": str(selected_template.get("formName", "宠物")),
			"formName": str(selected_template.get("formName", "宠物")),
			"lineId": selected_line_id,
			"lineName": str(selected_template.get("lineName", "未知种系")),
			"subtypeName": str(selected_template.get("subtypeName", "未知亚种")),
			"recordLabel": str(selected_entry.get("recordLabel", "已遇见")),
		}, true)
		growth = _growth_for_form(selected_id)
		attributes = _attributes_for_form(selected_id, selected_entry)
		acquisition_routes = acquisition_routes_for_form(selected_id)
		selected_pet["growth"] = growth
		selected_pet["attributes"] = attributes
		selected_pet["acquisitionRoutes"] = acquisition_routes

	var families: Array[Dictionary] = []
	for family in projection.get("familiesBase", []) as Array:
		if not (family is Dictionary):
			continue
		var family_state := (family as Dictionary).duplicate(false)
		family_state["selected"] = (
			str(family_state.get("lineId", "")) == selected_line_id
		)
		families.append(family_state)
	var forms: Array[Dictionary] = []
	var forms_by_line := projection.get("formsByLine", {}) as Dictionary
	var line_forms_value = forms_by_line.get(selected_line_id, [])
	if line_forms_value is Array:
		for form in line_forms_value as Array:
			if not (form is Dictionary):
				continue
			var form_state := (form as Dictionary).duplicate(false)
			form_state["selected"] = (
				str(form_state.get("formId", "")) == selected_id
			)
			forms.append(form_state)
	var seen_count := int(projection.get("seenCount", 0))
	var total_count := int(projection.get("totalCount", 0))
	return {
		"collectionLabel": "图鉴收集 %d/%d" % [seen_count, total_count],
		"seenCount": seen_count,
		"totalCount": total_count,
		"selectedFormId": selected_id,
		"selectedLineId": selected_line_id,
		"selectedPet": selected_pet,
		"selectedSeen": selected_seen,
		"families": families,
		"forms": forms,
		"growth": growth,
		"attributes": attributes,
		"acquisitionRoutes": acquisition_routes,
		# Kept for the hidden compatibility label without re-entering the legacy
		# detail builder (which normalizes and scans the entire profile again).
		"legacyDetailText": _legacy_detail_text(
			selected_pet,
			selected_seen,
			growth
		),
	}


static func preferred_form_id_for_line(
	profile: Dictionary,
	line_id: String
) -> String:
	return preferred_form_id_for_line_from_entries(
		PlayerProgressModel.codex_entries(profile),
		line_id
	)


static func preferred_form_id_for_line_from_entries(
	entries: Array[Dictionary],
	line_id: String
) -> String:
	var normalized_line_id := line_id.strip_edges()
	if normalized_line_id == "":
		return ""
	var first_id := ""
	var first_seen_id := ""
	for entry in entries:
		var form_id := str(entry.get("formId", ""))
		if _line_id_for_entry(entry) != normalized_line_id:
			continue
		if first_id == "":
			first_id = form_id
		if bool(entry.get("captured", false)):
			return form_id
		if first_seen_id == "" and bool(entry.get("seen", false)):
			first_seen_id = form_id
	return first_seen_id if first_seen_id != "" else first_id


static func acquisition_routes_for_form(form_id: String) -> Array[Dictionary]:
	return PetCodexAcquisitionRouteCatalog.routes_for_form(form_id)


static func prepare_acquisition_routes() -> Dictionary:
	return PetCodexAcquisitionRouteCatalog.prepare()


static func _resolved_selected_form_id(
	entries: Array[Dictionary],
	requested_form_id: String
) -> String:
	var requested := requested_form_id.strip_edges()
	if requested != "" and not _entry_for_form(entries, requested).is_empty():
		return requested
	var first_id := ""
	var first_seen_id := ""
	for entry in entries:
		var form_id := str(entry.get("formId", ""))
		if first_id == "":
			first_id = form_id
		if bool(entry.get("captured", false)):
			return form_id
		if first_seen_id == "" and bool(entry.get("seen", false)):
			first_seen_id = form_id
	return first_seen_id if first_seen_id != "" else first_id


static func _entry_for_form(
	entries: Array[Dictionary],
	form_id: String
) -> Dictionary:
	for entry in entries:
		if str(entry.get("formId", "")) == form_id:
			return entry
	return {}


static func _family_entries(
	entries: Array[Dictionary],
	selected_line_id: String
) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for line in PetTemplateCatalog.lines():
		var line_id := str(line.get("lineId", ""))
		if line_id == "":
			continue
		var line_entries: Array[Dictionary] = []
		for entry in entries:
			if _line_id_for_entry(entry) == line_id:
				line_entries.append(entry)
		if line_entries.is_empty():
			continue
		var representative_id := ""
		var seen_count := 0
		var captured_count := 0
		for entry in line_entries:
			if bool(entry.get("seen", false)):
				seen_count += 1
				if representative_id == "":
					representative_id = str(entry.get("formId", ""))
			if bool(entry.get("captured", false)):
				captured_count += 1
				representative_id = str(entry.get("formId", ""))
		result.append({
			"lineId": line_id,
			"label": str(line.get("lineName", "种族")),
			"seen": seen_count > 0,
			"captured": captured_count > 0,
			"seenCount": seen_count,
			"totalCount": line_entries.size(),
			"portraitFormId": representative_id,
			"selected": line_id == selected_line_id,
		})
	return result


static func _form_entries(
	entries: Array[Dictionary],
	selected_line_id: String,
	selected_form_id: String
) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for entry in entries:
		var form_id := str(entry.get("formId", ""))
		if _line_id_for_entry(entry) != selected_line_id:
			continue
		var visible_name := (
			str(entry.get("formName", "宠物"))
			if bool(entry.get("seen", false))
			else "未遇见"
		)
		result.append({
			"formId": form_id,
			"name": visible_name,
			"formName": visible_name,
			"seen": bool(entry.get("seen", false)),
			"captured": bool(entry.get("captured", false)),
			"recordLabel": str(entry.get("recordLabel", "未遇见")),
			"selected": form_id == selected_form_id,
		})
	return result


static func _growth_for_form(form_id: String) -> Dictionary:
	var value = _growth_by_form_cache.get(form_id, {})
	return value as Dictionary if value is Dictionary else {}


static func _attributes_for_form(
	form_id: String,
	entry: Dictionary
) -> Dictionary:
	var base_value = _attribute_by_form_cache.get(form_id, {})
	if not (base_value is Dictionary):
		return {}
	var result := (base_value as Dictionary).duplicate(false)
	var rows: Array[Dictionary] = []
	var rows_value = result.get("rows", [])
	if rows_value is Array:
		for row_value in rows_value as Array:
			if not (row_value is Dictionary):
				continue
			var row := (row_value as Dictionary).duplicate(false)
			if str(row.get("label", "")) == "记录":
				row["value"] = str(entry.get("recordLabel", "已遇见"))
			rows.append(row)
	result["rows"] = rows
	return result


static func _growth_presentation(template: Dictionary) -> Dictionary:
	var profile_id := str(template.get("growthSpeciesProfileId", ""))
	var species := BalanceCatalogModel.pet_growth_species_profile(profile_id)
	var rows: Array[Dictionary] = []
	if not species.is_empty():
		var base_value = species.get("outputBase", {})
		var base := base_value as Dictionary if base_value is Dictionary else {}
		var rules_value = species.get("individualRules", {})
		var rules := rules_value as Dictionary if rules_value is Dictionary else {}
		var spreads_value = rules.get("initialOutputSpread", {})
		var spreads := (
			spreads_value as Dictionary
			if spreads_value is Dictionary
			else {}
		)
		for row in PUBLIC_STAT_ROWS:
			var stat_key := str(row.get("key", ""))
			var spread_value = spreads.get(stat_key, [])
			var spread := spread_value as Array if spread_value is Array else []
			if not base.has(stat_key) or spread.size() < 2:
				continue
			var low := int(round(float(base.get(stat_key, 0)) + float(spread[0])))
			var high := int(round(float(base.get(stat_key, 0)) + float(spread[1])))
			rows.append({
				"label": str(row.get("label", "四维")),
				"range": "%d～%d" % [mini(low, high), maxi(low, high)],
			})
	return {
		"heading": "Lv1 公开四维",
		"totalLabel": PlayerProgressModel.growth_profile_label(
			str(template.get("growthProfileId", ""))
		),
		"rows": rows,
		"note": "Lv1四维与隐藏成长相互独立；隐藏成长需升级训练后判断。",
	}


static func _attribute_presentation(
	template: Dictionary,
	entry: Dictionary
) -> Dictionary:
	var elements: Array[Dictionary] = []
	var element_value = template.get("elements", {})
	var element_map := (
		element_value as Dictionary
		if element_value is Dictionary
		else {}
	)
	for element_id in ELEMENT_ORDER:
		var amount := int(element_map.get(element_id, 0))
		if amount <= 0:
			continue
		var presentation := ELEMENT_PRESENTATION.get(element_id, {}) as Dictionary
		elements.append({
			"id": element_id,
			"label": str(presentation.get("label", "元素")),
			"value": amount,
			"max": 10,
			"display": str(amount),
			"color": str(presentation.get("color", "#e5b85b")),
		})
	var capture_value = template.get("capture", {})
	var capture := (
		capture_value as Dictionary
		if capture_value is Dictionary
		else {}
	)
	var capture_label := "特殊途径"
	if bool(capture.get("catchable", false)):
		capture_label = "可捕捉 · 难度 %d" % int(capture.get("difficulty", 0))
	return {
		"heading": "形态资料",
		"elements": elements,
		"rows": [
			{
				"label": "亚种",
				"value": str(template.get("subtypeName", "未知亚种")),
			},
			{
				"label": "记录",
				"value": str(entry.get("recordLabel", "已遇见")),
			},
			{"label": "获得", "value": capture_label},
		],
		"skills": _skill_entries(template),
	}


static func _skill_entries(template: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for passive_id in _string_array(template.get("passiveSkillIds", [])):
		var passive := BattlePassiveCatalog.passive_by_id(passive_id)
		var passive_presentation_value = passive.get("presentation", {})
		var passive_presentation := (
			passive_presentation_value as Dictionary
			if passive_presentation_value is Dictionary
			else {}
		)
		result.append({
			"abilityId": passive_id,
			"kind": "passive",
			"name": str(passive.get("label", "被动技能")),
			"description": str(passive.get("description", "被动技能")),
			"iconPath": str(passive_presentation.get("iconPath", "")),
		})
	for action_id in _string_array(template.get("activeSkillIds", [])):
		if result.size() >= 3:
			break
		var action := BattleActionCatalog.action_by_id(action_id)
		var action_presentation_value = action.get("presentation", {})
		var action_presentation := (
			action_presentation_value as Dictionary
			if action_presentation_value is Dictionary
			else {}
		)
		var action_label := BattleActionCatalog.label_for(action_id, "主动技能")
		result.append({
			"abilityId": action_id,
			"kind": "active",
			"name": action_label,
			"description": str(action.get("description", action_label)),
			"iconPath": str(action_presentation.get("iconPath", "")),
		})
	return result


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if not (value is Array):
		return result
	for item in value:
		var text := str(item).strip_edges()
		if text != "" and not result.has(text):
			result.append(text)
	return result


static func _line_id_for_entry(entry: Dictionary) -> String:
	var line_id := str(entry.get("lineId", "")).strip_edges()
	if line_id != "":
		return line_id
	# Compatibility for focused callers that still provide the older entry
	# shape. Authoritative PlayerProgressModel entries always carry lineId.
	var template := _template_for_form(str(entry.get("formId", "")))
	return str(template.get("lineId", "")).strip_edges()


static func _template_for_form(form_id: String) -> Dictionary:
	var normalized_form_id := form_id.strip_edges()
	if normalized_form_id == "":
		return {}
	if _template_by_form_cache.is_empty():
		prepare_static_catalog()
	var value = _template_by_form_cache.get(normalized_form_id, {})
	return value as Dictionary if value is Dictionary else {}


static func _legacy_detail_text(
	selected_pet: Dictionary,
	selected_seen: bool,
	growth: Dictionary
) -> String:
	if not selected_seen:
		return "图鉴：？？？\n记录：未遇见"
	var lines: Array[String] = [
		"图鉴：%s" % str(
			selected_pet.get("name", selected_pet.get("formName", "宠物"))
		),
		"记录：%s" % str(selected_pet.get("recordLabel", "已遇见")),
	]
	var growth_label := str(growth.get("totalLabel", "")).strip_edges()
	if growth_label != "":
		lines.append("成长倾向：%s" % growth_label)
	return "\n".join(lines)


static func _dictionary_array(value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if not (value is Array):
		return result
	for item in value:
		if item is Dictionary:
			result.append((item as Dictionary).duplicate(true))
	return result
