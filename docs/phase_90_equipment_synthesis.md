# Phase90 装备合成系统

## 目标

把 Phase89 的装备碎片接成可玩的第一版装备合成链路：

- 战斗掉落装备碎片。
- 玩家在装备面板进入合成。
- 合成检查材料、石币和背包容量。
- 成功后扣除材料和石币，产出装备到随身包。
- 产出装备继续走已有装备栏、换装预览、装备属性和精灵来源系统。

## 石器 8.0 参考

本阶段参考了 8.0 源码里两类老系统的边界：

- 宠物技能中的 `精工` 会限制选择物品数量、要求一个武器或防具，并消耗其他材料。
- `Itemchange` NPC 会通过配置展示需求、检查材料/金钱，再给出兑换结果。

Beastbound 第一版不复刻旧源码实现，而是采用更适合当前 Godot 原型的数据驱动配方：

- `equipment_synthesis_recipes.json` 定义配方。
- `equipment_synthesis_model.gd` 做配方读取和校验。
- `PlayerProgressModel.synthesize_equipment()` 做扣材料、扣石币、产出装备。

## 本阶段内容

- 新增配方表 `client/godot/data/equipment_synthesis_recipes.json`。
- 新增合成模型 `client/godot/scripts/progression/equipment_synthesis_model.gd`。
- 新增两件合成装备：
  - `硬木棒`：消耗 `初级木质碎片 x3` 和 `20石币`，产出右手武器，攻击 +9。
  - `缝皮背心`：消耗 `初级皮革碎片 x3` 和 `18石币`，产出衣服，生命 +6、防御 +7。
- 装备面板底部新增 `合成` 入口。
- 合成面板显示：
  - 配方列表。
  - 材料持有/需求。
  - 石币持有/需求。
  - 成品装备详情。
  - 当前装备 vs 合成装备的换装预览。
- 合成失败会明确提示：
  - 材料不足。
  - 石币不够。
  - 背包空间不足。

## 暂不做

- 不做随机失败率，第一版成功率固定 100%。
- 不做随机品质、词条、强化等级继承。
- 不做 NPC 限定入口；当前先放在装备面板，后续可以迁到工匠或装备铺。
- 不做批量合成。

## 自测

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-equipment-synthesis-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-equipment-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-equipment-drop-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-backpack-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-shop-check
```

## 预览

```sh
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/phase90_equipment_synthesis.png --quit-after 90 -- --equipment-synthesis-preview
```
