extends RefCounted

const CharacterRosterModel := preload(
	"res://scripts/progression/character_roster_model.gd"
)


static func run() -> Dictionary:
	var errors: Array[String] = []
	var empty := CharacterRosterModel.normalize_roster({})
	_expect(
		(empty.get("slots", []) as Array).size()
			== CharacterRosterModel.SLOT_COUNT,
		"空列表没有生成固定四槽",
		errors
	)
	_expect(
		int(empty.get("occupiedCount", -1)) == 0
			and str(empty.get("selectedPlayerId", "")) == ""
			and bool(empty.get("canCreate", false)),
		"空列表状态不正确",
		errors
	)

	var roster := CharacterRosterModel.normalize_roster({
		"characters": [
			{
				"playerId": "character_stone",
				"slotIndex": 2,
				"name": "石芽",
				"level": 18,
				"mapName": "火芽村",
			},
			{
				"id": "character_moss",
				"slot": 0,
				"displayName": "苔岚",
				"playerLevel": 7,
				"currentMapName": "苔冠沼泽",
			},
			{
				"slotIndex": 1,
				"occupied": false,
			},
			{
				"slotIndex": 3,
				"occupied": false,
			},
		],
		"selectedCharacter": {
			"playerId": "character_stone",
		},
	})
	var slots := roster.get("slots", []) as Array
	_expect(
		int(roster.get("occupiedCount", 0)) == 2
			and str(roster.get("selectedPlayerId", ""))
				== "character_stone",
		"角色数量或选中角色归一化错误",
		errors
	)
	_expect(
		str((slots[0] as Dictionary).get("name", "")) == "苔岚"
			and str((slots[2] as Dictionary).get("name", "")) == "石芽",
		"显式槽位或字段别名归一化错误",
		errors
	)
	_expect(
		str(
			CharacterRosterModel.selected_character(roster).get(
				"mapName",
				""
			)
		) == "火芽村",
		"选中角色摘要解析错误",
		errors
	)
	_expect(
		(roster.get("contractErrors", []) as Array).is_empty(),
		"服务端显式空槽被误判为合同错误",
		errors
	)

	var fallback := CharacterRosterModel.normalize_roster({
		"data": {
			"roster": [
				{
					"playerId": "character_one",
					"slotIndex": 0,
					"playerName": "火羽",
				},
				{
					"playerId": "character_two",
					"slotIndex": 0,
					"playerName": "水芽",
				},
			],
		},
	})
	var fallback_slots := fallback.get("slots", []) as Array
	_expect(
		bool((fallback_slots[0] as Dictionary).get("occupied", false))
			and bool((fallback_slots[1] as Dictionary).get("occupied", false)),
		"冲突槽位没有顺延到首个空槽",
		errors
	)

	var valid_create := CharacterRosterModel.build_create_request(1, "  山岚  ")
	_expect(
		bool(valid_create.get("valid", false))
			and (
				(valid_create.get("payload", {}) as Dictionary).get(
					"displayName",
					""
				) == "山岚"
			)
			and int(
				(valid_create.get("payload", {}) as Dictionary).get(
					"slotIndex",
					-1
				)
			) == 1,
		"有效建角请求没有去除首尾空白或保留槽位",
		errors
	)
	for invalid_name in [
		"",
		"非法\n名字",
		"一二三四五六七八九十十一十二十三十四十五十六十七十八十九二十二一二二二三二四二五",
	]:
		_expect(
			not bool(
				CharacterRosterModel.build_create_request(
					1,
					invalid_name
				).get("valid", true)
			),
			"非法角色名未被拒绝：%s" % invalid_name,
			errors
		)

	var valid_select := CharacterRosterModel.build_select_request(
		roster,
		"character_moss"
	)
	var invalid_select := CharacterRosterModel.build_select_request(
		roster,
		"missing_character"
	)
	_expect(
		bool(valid_select.get("valid", false))
			and (
				(valid_select.get("payload", {}) as Dictionary).get(
					"playerId",
					""
				) == "character_moss"
			)
			and not bool(invalid_select.get("valid", true)),
		"选角请求没有校验角色归属",
		errors
	)
	for contract_error in CharacterRosterModel.roster_contract_errors(roster):
		errors.append("列表合同：%s" % contract_error)

	return {
		"schemaVersion": 1,
		"reportType": "beastbound.character_roster_model_check",
		"result": "PASS" if errors.is_empty() else "FAIL",
		"slotCount": (slots as Array).size(),
		"occupiedCount": int(roster.get("occupiedCount", 0)),
		"errors": errors,
	}


static func _expect(
	condition: bool,
	message: String,
	errors: Array[String]
) -> void:
	if not condition:
		errors.append(message)
