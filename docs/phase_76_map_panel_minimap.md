# Phase76：地图面板 / 小地图原型

本阶段加入第一版地图面板，用于查看当前地图、当前位置和可寻路标记。

## 功能

- 底部行动栏新增 `地图`。
- 地图面板显示：
  - 当前地图名。
  - 当前坐标。
  - 当前目标坐标。
  - 小地图格子预览。
  - 当前地图的 NPC、商店、传送点、草丛标记。
- 点击标记会复用现有自动寻路逻辑：
  - NPC/商店/记录点：走到交互点旁边。
  - 草丛：走到草丛区域的第一个可行走格。

## 颜色约定

- 蓝色：玩家位置。
- 黄色：当前目标。
- 金色：地图标记。
- 绿色：草丛/装饰/遇敌区域。
- 深色：障碍或阻挡交互点。

## 自测

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-map-panel-check
```

预览截图入口：

```bash
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/phase76_map_panel.png --quit-after 80 -- --map-panel-preview
```
