# Phase139：任务目标模板统一

本阶段把任务目标从“散落的事件匹配字段”收拢为正式模板契约。目标是后续新增主线、支线、转生任务、副本任务时，先选模板，再填必填字段，避免任务能显示但不能稳定推进。

## 正式目标模板

`QuestModel.OBJECTIVE_TEMPLATES` 是当前任务目标模板目录。每个模板包含：

- `label`：给工具、文档、GM 面板使用的中文名。
- `eventTypes`：这个目标会响应哪些事件。
- `requiredFields`：必须填写的字段。
- `requiredAnyFields`：至少填写其中一个的字段组。
- `summary`：设计说明。

当前模板：

| 模板 | 用途 |
| --- | --- |
| `talk` | 和指定 NPC / 设施对话 |
| `buy_item` | 在指定商店购买指定物品 |
| `use_world_item` | 在世界界面对目标使用指定道具 |
| `use_item` | 世界或战斗中使用指定道具 |
| `equip_item` | 装备指定装备到指定槽位 |
| `use_spirit` | 战斗中释放指定精灵 |
| `battle_victory` | 赢下指定遇敌组或试炼战斗 |
| `defeat_npc` | 击败地图上对话触发的守护兽 / NPC 战斗 |
| `capture_pet` | 捕捉指定系别、形态或形态前缀的宠物 |
| `deliver_pet` | 交付指定系别、形态或形态前缀的宠物 |
| `reach_map` | 到达指定地图 |
| `reach_npc` | 到达指定 NPC / 设施附近 |

## JSON 写法

旧的单目标写法仍兼容：

```json
"objective": {
  "type": "equip_item",
  "itemId": "weapon_wooden_club",
  "slot": "right_hand_weapon",
  "count": 1,
  "text": "在随身包里装备木棒"
}
```

多目标任务使用 `objectives`：

```json
"objectives": [
  {
    "type": "reach_map",
    "mapId": "firebud_village_gate",
    "count": 1,
    "text": "回到火芽村入口"
  },
  {
    "type": "reach_npc",
    "targetId": "firebud_rebirth_mentor",
    "mapId": "firebud_village_gate",
    "count": 1,
    "text": "找到转生导师阿岚"
  }
]
```

## 校验规则

`QuestModel.validation_errors()` 现在会检查：

- 任务 ID 重复、标题缺失。
- 目标 `type` 为空或不是正式模板。
- `count < 1`。
- 模板必填字段缺失。
- `requiredAnyFields` 一项都没填。
- 奖励物品不存在。
- `nextQuestId` 指向不存在的任务。

## 自测命令

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-quest-objective-templates-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-quest-chain-check
```

第一条验证模板目录、事件匹配、到达类目标和 `quests.json` 校验；第二条验证现有新手任务链仍能推进。
