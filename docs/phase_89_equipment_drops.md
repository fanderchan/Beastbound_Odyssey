# Phase89 装备材料掉落

## 目标

战斗奖励第一版加入装备相关掉落，为后续合成、强化、制造系统预留材料入口。

## 本阶段内容

- 新增两个初级装备材料：
  - `初级木质碎片`
  - `初级皮革碎片`
- 两个材料都放在随身包物品体系里，可堆叠 99 个。
- 材料暂不可直接使用，背包详情会显示 `用途: 暂不可用` 和材料说明。
- `火芽村入口` 草丛战斗奖励增加低概率装备材料掉落：
  - `初级木质碎片`: 12%
  - `初级皮革碎片`: 8%
- 战斗胜利日志会把碎片并入 `获得 ...` 文本。
- 背包已满时，碎片会进入 `背包已满，未获得 ...` 文本，不会静默丢失提示。

## 玩家可见效果

战斗胜利后，左下日志可能出现：

```text
获得 肉 x2、初级捕捉绳 x1、初级皮革碎片 x1。
```

背包里选中碎片时会显示：

```text
初级木质碎片 x1
用途: 暂不可用
堆叠: 99
说明: 初级装备合成材料，后续可用于制作或强化木质装备。
```

## 自测

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-equipment-drop-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-battle-reward-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-backpack-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-backpack-filter-check
```

## 预览

```sh
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/phase89_equipment_drop.png --quit-after 90 -- --equipment-drop-preview
```
