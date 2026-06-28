# Phase121 玩家成长骨架

## 已实现

- 人物新增 `playerGrowth` 数据骨架：
  - 属性点来源：升级、转生、任务、道具、GM
  - 人物技能来源：装备、角色成长、任务、转生预留
  - 转生成长记录
- 人物状态面板新增 `成长来源` 摘要。
- 人物技能来源仍以装备提供的精灵为主，不新增“人物学习精灵”的设定。
- 旧存档会自动根据人物等级补出升级属性点来源记录。

## 保留给后续

- 转生后成长公式最终化。
- 任务、道具、GM 属性点来源的真实发放流水。
- 人物技能槽、装备需求、转生需求的统一展示。

## 自测

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-player-growth-contract-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-player-status-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-player-stat-spam-perf-check
```
