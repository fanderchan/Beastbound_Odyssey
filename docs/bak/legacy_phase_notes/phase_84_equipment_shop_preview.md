# Phase84：装备商店购买预览

本阶段对应长期目标里的 `Phase72：装备商店购买预览`。

## 内容

- 装备商店选中装备时，详情区显示当前装备和将要装备的对比。
- 复用背包换装预览的红绿规则：
  - 增加属性或获得精灵用绿色。
  - 减少属性或失去精灵用红色。
- 购买装备时默认仍然只放入背包。
- 购买装备时可勾选 `购买后装备`：
  - 购买成功后自动装备 1 件。
  - 数量大于 1 时，只装备 1 件，其余保留在背包。
  - 原装备会按已有装备交换规则回到背包。
- 未满足装备等级需求时，`购买后装备` 会禁用，但仍允许只购买放入背包。

## 暂不做

- 不做购买确认弹窗，先保持商店操作轻量。
- 不做批量逐件装备，批量购买后只自动装备 1 件。

## 自测

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-equipment-shop-preview-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-shop-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-equipment-check
```

## 手动预览

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --equipment-shop-preview
```
