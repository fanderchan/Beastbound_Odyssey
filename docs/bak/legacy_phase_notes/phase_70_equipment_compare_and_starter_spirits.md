# Phase70：初级精灵装备 / 背包换装预览

本阶段补齐火芽装备铺的初级精灵组合装备，并让背包选中装备时能直观看到换装差异。

## 内容

- 新增 Lv1 人物精灵动作：
  - `恩惠精灵1`：我方全体回复。
  - `滋润精灵1`：我方单体回复。
  - `毒精灵1`：敌方单体毒。
  - `毒雾精灵1`：敌方全体毒。
- 默认新手套装和火芽装备铺统一只使用 Lv1 精灵。
- 火芽装备铺新增测试装备：
  - `露草头带`：头盔，防御 +1，附带 `滋润精灵1`。
  - `祝木棒`：右手武器，攻击 +4，附带 `恩惠精灵1`。
  - `毒藤布衣`：衣服，防御 +2，附带 `毒精灵1`。
  - `雾草鞋`：鞋子，敏捷 +2，附带 `毒雾精灵1`。
- 背包选中装备时新增 `换装预览`。
  - 显示当前已装备和将装备的装备名。
  - 属性增加显示绿色，属性减少显示红色。
  - 精灵获得显示绿色，精灵失去显示红色。
  - 背包详情区固定高度并内部滚动，避免按钮被内容挤下去。
- 自动战斗设置继续按当前装备过滤可用精灵，且可识别新增 Lv1 治疗精灵。

## 当前边界

- 这里只做初级装备和 UI 预览，不做装备图标、外观换装、装备等级需求。
- Lv5/Lv6 精灵动作保留为后续数值系统和中后期装备使用，但火芽装备铺不售卖。

## 自测

```bash
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-equipment-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3000 -- --auto-battle-settings-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 6500 -- --auto-battle-spirit-four-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-battle-action-catalog-check
node tools/battle_action_catalog_check.mjs
```

## 预览

```bash
mkdir -p .run/godot
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/phase70_equipment_compare.png --quit-after 160 -- --equipment-compare-preview
```
