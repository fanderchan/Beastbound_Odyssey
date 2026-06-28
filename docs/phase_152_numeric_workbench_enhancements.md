# Phase152 数值实验工作台增强

本阶段把 Phase151 的数值实验入口补成更适合策划横向比较的工具。

## 新增能力

- `方案对比`：对当前宠物成长档和 MM 阶段，一次性跑四满石、三石、双石、单攻、单防、单敏、单血、空石。
- UI 直接展示每个喂石方案的四维等效成长、Lv140 战力范围、血攻防敏成长均值。
- 方案对比导出一份合并 CSV，避免手动跑多次后再拼表。
- 每次模拟结果底部显示 `最近输出` 路径，方便找到 CSV/JSON。
- `输出目录` 按钮可以直接打开 `.run/godot/`。

## 入口

```text
GM/QA -> 数值实验
```

## 自测命令

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-numeric-workbench-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-qa-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --perf-probe
```

## 性能边界

方案对比只在玩家点击 `方案对比` 时计算，不进入 `_process`、HUD 签名、移动寻路、战斗逐帧循环。自动检查和 perf probe 应确认它没有引入移动时 CPU 回归。
