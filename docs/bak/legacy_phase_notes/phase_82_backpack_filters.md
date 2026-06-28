# Phase82：随身包用途筛选

本阶段给随身包增加轻量筛选，方便测试和实际使用时快速找到不同用途的道具。

## 内容

- 随身包顶部新增 `全部 / 世界 / 战斗 / 捕捉 / 装备` 筛选按钮。
- `全部` 仍显示完整 15 格容量视图。
- 其他筛选只显示符合用途的道具，不改变真实背包容量和槽位数据。
- 筛选后点击道具仍映射回原始背包槽位，使用、装备、快捷绑定逻辑保持不变。
- 没有符合筛选的道具时显示空提示，不显示误导性的使用按钮。

## 筛选规则

- `世界`：世界回血道具、原地遇敌石。
- `战斗`：战斗中可用道具。
- `捕捉`：捕捉绳、捕捉网等捕捉工具。
- `装备`：武器、防具、饰品等装备。

## 自测

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-backpack-filter-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-backpack-world-use-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-quick-slot-check
```

## 手动预览

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --backpack-filter-preview
```
