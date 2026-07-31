extends SceneTree

const CharacterCreationModel := preload(
	"res://scripts/progression/character_creation_model.gd"
)
const PlayerAppearanceCatalog := preload(
	"res://scripts/player/player_appearance_catalog.gd"
)


func _initialize() -> void:
	call_deferred("_execute")


func _execute() -> void:
	var report := run()
	print("character creation model check: %s" % JSON.stringify(report))
	quit(0 if str(report.get("result", "FAIL")) == "PASS" else 1)


static func run() -> Dictionary:
	var errors: Array[String] = []
	for error_value in PlayerAppearanceCatalog.contract_errors():
		errors.append("人物目录：%s" % error_value)
	var appearance_ids := PlayerAppearanceCatalog.appearance_ids()
	_expect(
		appearance_ids == [
			"novice_hunter_v1",
			"obsidian_scout_v1",
			"frost_whisper_v1",
			"ember_spark_v1",
		],
		"人物目录没有提供固定四个创建形象或顺序错误",
		errors
	)

	var split := CharacterCreationModel.normalize_elements({
		"earth": 6,
		"water": 4,
	})
	_expect(
		CharacterCreationModel.element_total(split) == 10
		and CharacterCreationModel.element_errors(split).is_empty(),
		"合法双元素分配被拒绝",
		errors
	)
	for invalid in [
		{"earth": 5, "fire": 5},
		{"water": 5, "wind": 5},
		{"earth": 4, "water": 3, "wind": 3},
		{"earth": 9},
	]:
		_expect(
			not CharacterCreationModel.element_errors(invalid).is_empty(),
			"非法元素组合未被拒绝：%s" % JSON.stringify(invalid),
			errors
		)

	var adjusted := CharacterCreationModel.empty_elements()
	for _index in range(6):
		adjusted = CharacterCreationModel.adjust_element(adjusted, "earth", 1)
	for _index in range(4):
		adjusted = CharacterCreationModel.adjust_element(adjusted, "water", 1)
	var blocked := CharacterCreationModel.adjust_element(adjusted, "fire", 1)
	_expect(
		adjusted == {"earth": 6, "water": 4, "fire": 0, "wind": 0}
		and blocked == adjusted,
		"加点助手没有执行总点数或冲突限制",
		errors
	)

	var valid_create := CharacterCreationModel.build_create_request(
		2,
		"  山岚  ",
		"obsidian_scout_v1",
		{"earth": 6, "water": 4},
		appearance_ids
	)
	_expect(
		bool(valid_create.get("valid", false))
		and (valid_create.get("payload", {}) as Dictionary) == {
			"slotIndex": 2,
			"displayName": "山岚",
			"appearanceId": "obsidian_scout_v1",
			"elements": {
				"earth": 6,
				"water": 4,
				"fire": 0,
				"wind": 0,
			},
		},
		"创建请求没有输出完整姓名、形象与元素合同",
		errors
	)

	var legacy := CharacterCreationModel.build_legacy_allocation_request(
		{
			"playerId": "legacy_player",
			"needsElementAllocation": true,
		},
		{"fire": 10}
	)
	_expect(
		bool(legacy.get("valid", false))
		and (legacy.get("payload", {}) as Dictionary) == {
			"playerId": "legacy_player",
			"elements": {
				"earth": 0,
				"water": 0,
				"fire": 10,
				"wind": 0,
			},
		},
		"旧角色补元素请求合同错误",
		errors
	)

	return {
		"schemaVersion": 1,
		"reportType": "beastbound.character_creation_model_check",
		"result": "PASS" if errors.is_empty() else "FAIL",
		"appearanceCount": appearance_ids.size(),
		"errors": errors,
	}


static func _expect(
	condition: bool,
	message: String,
	errors: Array[String]
) -> void:
	if not condition:
		errors.append(message)
