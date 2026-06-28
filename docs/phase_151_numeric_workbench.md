# Phase151 数值实验工作台

本阶段把已有的成长模拟、MM转宠模拟和固定战斗模拟从“命令行报告”补成可点的 GM/QA 工作台。它不是普通玩家界面，不进入宠物栏或背包栏，避免调试控件污染正式 UI。

## 入口

打开 `GM/QA` 面板，点击：

```text
数值实验
```

工作台支持：

- 选择宠物成长档。
- 选择样本数：20 / 100 / 200 / 500。
- 选择目标等级：Lv80 / Lv131 / Lv140。
- 选择 MM 阶段：1转小MM / 2转小MM。
- 选择喂石方案：四满石、三石、双石、单石、空石。
- 一键执行宠物成长模拟、MM转宠模拟、固定战斗模拟。

## 输出

成长与 MM 转宠模拟会写 CSV 到：

```text
.run/godot/
```

固定战斗模拟会写 JSON 到：

```text
.run/godot/numeric_workbench_battle_simulation_report.json
```

这些文件是给数值策划看样本分布用的，不应被提交。

## 自测命令

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-numeric-workbench-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-qa-panel-check
```

## 性能边界

- 工作台只在打开和点击按钮时计算，不放进 `_process`、HUD 刷新、移动寻路、战斗逐帧动画。
- 批量样本第一版限制在 500 以内，避免误点造成长时间卡 UI。
- 导出的 CSV/JSON 只作为本地分析证据，不进入普通玩家存档。
