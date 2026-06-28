# Phase81：装备栏耐久可视化

本阶段把装备耐久从详情文字延伸到装备格本身，让玩家不用点开每件装备也能看到耐久状态。

## 内容

- 装备栏每个已装备格显示当前耐久，例如 `石刀 30/30`。
- 耐久为 0 时显示 `损0/30`，并把该装备格文字标红。
- 耐久低于上限但未损坏时，该装备格文字标黄。
- 右侧详情里的耐久、损坏提示、属性扣除逻辑保持沿用 Phase74。

## 暂不做

- 不做耐久图标和进度条，等正式 UI 美术确定后再替换。
- 不做单件修理入口，仍通过装备铺统一修理。

## 自测

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-equipment-durability-visual-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-equipment-durability-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-equipment-check
```

## 手动预览

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --equipment-durability-visual-preview
```
