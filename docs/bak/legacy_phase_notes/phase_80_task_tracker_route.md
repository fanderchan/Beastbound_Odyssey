# Phase80：任务追踪快捷寻路

本阶段把当前任务的自动寻路入口从任务面板延伸到右上 HUD。

## 内容

- 右上信息框新增 `寻路` 按钮。
- 按钮直接复用当前任务目标解析：
  - 对话任务：前往 NPC。
  - 商店任务：前往对应商店。
  - 背包使用 / 装备任务：打开背包并提示完成方式。
  - 战斗 / 捕捉任务：前往对应遇敌区。
- 正在战斗、遭遇、对话、已有移动目标、打开菜单时，按钮会禁用。
- 任务面板里的 `自动寻路` 保留，两个入口共享同一套逻辑。

## 暂不做

- 不做跨多地图全局路径搜索，仍沿用当前相邻地图寻路规则。
- 不做任务列表多目标选择；这里只追踪当前任务。

## 自测

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-task-tracker-route-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-quest-ui-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-map-panel-check
```

## 手动预览

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --task-tracker-route-preview
```
