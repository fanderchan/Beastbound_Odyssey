# Phase92 GM/QA 自测入口整理

## 目标

把常用测试入口集中到一个地方：

- 游戏内底部操作栏新增 `GM`。
- `GM/QA` 面板提供手动测试入口。
- GM地图保留完整客户端功能，并提供专用草丛。
- 文档保留统一命令清单，减少每次翻历史阶段文档。

## 游戏内手动入口

启动完整客户端：

```sh
godot --path client/godot --scene res://scenes/Main.tscn
```

直接进入 GM 地图：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --gm-10v10-map
```

打开后点底部 `GM`，可以使用：

- `进入GM测试场`：进入完整客户端下的 GM 测试地图。
- `10V10草丛`：固定 10 只怪，适合测试练级、合击、自动战斗。
- `捉宠草丛`：随机图鉴可捕宠物，1-5 只，Lv1-10。
- `击飞草丛`：120-140 级怪，适合测试击飞回记录点。
- `背包`：打开随身包。
- `杂货铺`：打开火芽杂货铺。
- `装备铺`：打开火芽装备铺。
- `装备栏`：打开装备栏，并可进入合成。
- `任务`：打开任务详情和寻路。
- `内挂战斗`：打开自动战斗设置。
- `内挂捕捉`：打开自动捕捉设置。
- `陪练伙伴`：加伙伴测试 5 人 5 宠。
- `宠物`：队伍、兽栏、图鉴化详情。
- `图鉴`：宠物图鉴列表。

## 自动自测命令

基础解析：

```sh
godot --headless --path client/godot --quit
```

GM/QA 入口：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-qa-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-gm-10v10-map-check
```

背包：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-backpack-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-backpack-world-use-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-backpack-filter-check
```

商店：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-shop-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-equipment-shop-preview-check
```

装备：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-equipment-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-equipment-slot-detail-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-equipment-synthesis-check
```

任务：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-quest-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-quest-ui-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-task-tracker-route-check
```

自动战斗：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3600 -- --auto-battle-settings-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3000 -- --auto-battle-auto-10v10-check
```

捉宠：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-capture-settings-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-capture-feedback-check
```

地图设施：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-map-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-facility-marker-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-facility-dialog-options-check
```

## 预览

```sh
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/phase92_qa_panel.png --quit-after 90 -- --qa-panel-preview
```
