# Phase116 任务目标模板增强

## 已落地模板

- `talk`：和指定 NPC 对话。
- `buy_item`：购买指定物品。
- `use_world_item` / `use_item`：使用指定道具，可限制目标类型。
- `equip_item`：装备指定装备，可限制槽位。
- `use_spirit`：释放指定精灵。
- `battle_victory`：击败指定遇敌组。
- `defeat_npc`：击败指定 NPC 怪，支持 `interactionId` 和 `encounterGroupId` 双重过滤。
- `capture_pet`：捕捉指定宠物。
- `deliver_pet`：交付指定宠物，可限制种系、形态、形态前缀、最低等级。

## 关键约定

- 四大洞穴和玄影顶楼的守护兽应走 `guardian` 交互点进入战斗。
- 守护兽战斗会把 `sourceInteractionId` 写入战斗状态，战斗胜利后任务系统可按 NPC 目标推进。
- 单任务可配置 `objectives` 数组，任务面板会把目标文本串起来展示。

## 自测

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-quest-objective-templates-check
```
