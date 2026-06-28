# Phase117 地图 / 副本骨架

## 新增区域索引

`client/godot/data/map_regions.json` 定义稳定的区域目录：

- `firebud_village`：火芽村，包含村医、杂货、装备、兽栏、记录点、转生导师。
- `firebud_training_field`：村外训练区和早期草丛。
- `element_trial_caves`：四大洞穴，守护兽采用 NPC 交互战。
- `shadow_oath_cavern`：玄影洞窟，前三层捕捉转生兽，顶层 NPC 守护兽。
- `gm_training_ground`：GM 练级测试场。

## 用途

- 后续数值策划可以按区域维护怪物等级、掉落、商店、任务入口。
- 自动寻路、任务目标、掉落来源可以引用同一批区域 ID，减少散落规则。
- 先保留轻量索引，不重做地图加载。

## 自测

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-map-region-contract-check
```
