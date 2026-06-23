# Phase71：人物状态总览

本阶段新增独立的 `状态` 面板，用来承接人物等级、生命、装备加成、可用精灵来源和记录点信息。

## 设计范围

- 世界底部操作栏新增 `状态` 按钮。
- `状态` 面板与背包、装备、宠物、图鉴、任务、内挂设置等面板互斥打开，不挤占地图常驻空间。
- 面板内容包含：
  - 人物名称、等级、生命、经验。
  - 四维基础值、装备加成、最终值。
  - 当前装备提供的精灵，并显示精灵来自哪件装备。
  - 当前记录点。
- 面板底部提供 `装备` 按钮，可直接跳到装备栏查看和调整装备。

## 暂不处理

- 不做正式人物头像、人物外观换装、称号、声望、部落、PVP 战绩等长期资料。
- 不把人物精灵做成可学习技能；人物可用精灵仍然来自装备。
- 不新增独立 PC 版密集布局，继续复用移动端友好的面板尺寸。

## 自测

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-player-status-check
```

预览截图入口：

```bash
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/phase71_player_status.png --quit-after 160 -- --player-status-preview
```
