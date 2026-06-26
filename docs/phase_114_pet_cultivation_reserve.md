# Phase114：宠物转生 / 强化预留

## 目标

- 给宠物自己的长期培养线先留出稳定数据结构。
- 第一版只做预览、确认和结果记录，不急着敲最终数值公式。
- 旧宠物自动补默认培养字段，新捕捉/生成宠物也会带字段。

## 数据结构

- `petCultivation.schemaVersion`：培养记录结构版本。
- `petCultivation.rebirthCount`：宠物转生次数。
- `petCultivation.enhanceLevel`：宠物强化等级，当前原型上限为 `+10`。
- `petCultivation.history`：最近培养结果记录，最多保留 20 条。
- `petCultivation.lastPreview` / `lastResult`：最近一次预览和确认结果。
- `lastCultivationResult`：便于详情、战斗结算和后续日志读取的最近结果副本。

## 第一版规则

- 宠物详情显示：`培养：转生 N 次    强化 +M`。
- 宠物栏新增短按钮 `转强`。
- 未满级宠物默认预览强化，确认后 `enhanceLevel +1`，暂不改四维。
- Lv140 宠物默认预览转生，确认后等级回到 Lv1、经验清零、生命回满。
- 转生保留形态、个体种子、技能槽、强化等级，后续正式继承公式可以基于记录扩展。
- 培养字段会进入战斗 actor 元数据，战斗结算/换宠后不会丢失。

## 暂不做

- 强化材料、费用、失败率。
- 宠物转生继承成长公式。
- 宠物转生专用 NPC / 任务链。
- 强化对战力和四维的真实数值加成。

## 自测命令

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-cultivation-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-individual-growth-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-growth-check
```
