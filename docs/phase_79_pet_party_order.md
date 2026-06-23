# Phase79：宠物队伍顺序调整

本阶段给宠物面板加入第一版队伍编成顺序调整。

## 内容

- 宠物详情区新增 `上移`、`下移`。
- 只调整队伍宠物，不调整兽栏宠物。
- 调整方式直接交换 `petInstances` 中的队伍宠物位置，不新增第二套排序字段。
- 保持当前选中宠物不变，移动后列表会刷新到新的顺序。
- 当宠物已经在队伍最前或最后时，对应按钮禁用。
- 当宠物面板处于排序视图时，`上移 / 下移` 禁用，避免“显示顺序”和“实际队伍顺序”产生歧义。
- `--auto-battle-switch-pet-check` 改为使用默认 profile，避免本地存档里捕获宠物顺序影响自测结果。

## 暂不做

- 不做拖拽编队。
- 不做兽栏排序。
- 不做战斗中直接调整队伍顺序。

## 自测

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-pet-order-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-battle-switch-pet-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-pet-management-check
```

## 手动预览

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --pet-order-preview
```
