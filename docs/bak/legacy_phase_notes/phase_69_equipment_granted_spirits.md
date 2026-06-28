# Phase69：装备附带人物精灵

本阶段把人物精灵来源从测试用硬编码，调整为装备附带能力。

## 设计结论

- 人物不会通过“精灵学习 / 遗忘”获得战斗精灵。
- 人物可用精灵来自当前穿戴装备的 `spiritIds`。
- 换下装备后，对应精灵会从战斗菜单和内挂设置里消失。
- 宠物技能学习师仍只服务宠物主动技能；它不处理人物精灵。

## 默认新手套装

新档默认穿齐 8 个部位，便于第一版验证全身装备和战斗精灵来源：

- 左饰品：`火芽护符`，生命 +8，附带 `毒精灵1`。
- 右饰品：`风纹戒指`，敏捷 +3，附带 `毒雾精灵1`。
- 头盔：`皮帽`，防御 +2。
- 左手武器：`练习长枪`，攻击 +7，附带 `恩惠精灵1`。
- 衣服：`水纹衣`，防御 +4，附带 `滋润精灵1`。
- 右手武器：`石刃短刀`，攻击 +5。
- 手套：`兽皮手套`，攻击 +2。
- 鞋子：`草编靴`，敏捷 +4。

## 战斗接入

- 装备目录 `equipment_items.json` 支持 `spiritIds`。
- 进入战斗时，玩家 actor 会带上从装备汇总出的 `spiritIds`。
- 精灵菜单不再固定显示 4 个硬编码按钮，而是按当前 actor 的 `spiritIds` 填充。
- 内挂的人物动作和回血来源会过滤掉未装备的精灵。
- 火芽阶段默认只提供 Lv1 精灵；更高等级精灵保留为后续装备数值阶段使用。

## 自测

```bash
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-equipment-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-battle-settings-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 6500 -- --auto-battle-spirit-four-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-battle-action-catalog-check
node tools/battle_action_catalog_check.mjs
```

## 预览

```bash
mkdir -p .run/godot
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/phase69_equipment_spirits.png --quit-after 120 -- --equipment-spirit-preview
```
