# Phase91 地图 NPC/设施标记

## 目标

把火芽村的常用设施从“普通 NPC”提升为可被 UI 和任务寻路识别的设施目标：

- 村医。
- 杂货铺。
- 装备铺。
- 记录点。
- 训练师。

## 本阶段内容

- 交互点支持 `facilityType` 和 `facilityLabel`。
- `InteractionModel` 会从 `actionType`、`shopId`、`trainerId`、`kind` 自动推断设施类型，避免新增地图漏填字段后完全失效。
- 火芽村入口和训练场的关键交互点补齐设施字段。
- 世界地图上的设施会显示短标签：
  - `村医`
  - `杂货`
  - `装备`
  - `记录`
  - `训练`
- 地图面板的目标列表显示 `【短标签】设施名 / 操作`。
- 小地图用不同颜色区分设施、草丛和普通标记。
- 任务寻路 target 统一携带设施信息：
  - 买肉任务优先指向 `【杂货】杂货商阿芸`。
  - 买武器/装备精灵任务优先指向 `【装备】装备商阿石`。
  - 训练师任务跨地图仍指向 `【训练】训练师阿土`。

## 暂不做

- 不做大型全屏地图。
- 不做建筑室内地图。
- 不做所有 NPC 头顶常驻名称，只标记设施，避免地图文字过密。

## 自测

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-facility-marker-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-map-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-task-tracker-route-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-quest-ui-check
```

## 预览

```sh
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/phase91_facility_markers.png --quit-after 90 -- --facility-marker-preview
```
