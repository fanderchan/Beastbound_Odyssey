# Phase85 装备栏交互增强

本阶段补强装备栏本身的查看逻辑，对应长期规划里的 Phase73。

## 已完成

- 点击已装备的装备槽时，详情会显示当前装备、耐久、基础属性、装备自带精灵。
- 如果当前装备提供人物精灵，详情会补充来源写法，例如 `来源精灵: 滋润精灵1（水纹衣）`。
- 点击已装备的装备槽时，详情会显示 `卸下影响`，按真实装备前后状态计算属性减少和失去的精灵。
- 点击空装备槽时，详情会显示背包里同槽位、当前可装备的推荐物品，并附上简短影响。
- 空槽推荐最多展示 4 件，避免装备栏详情区过长。

## 交互规则

- `卸下` 按钮只在当前槽位有装备时显示。
- 空槽不会显示 `卸下` 按钮。
- 推荐列表只显示当前等级满足装备需求的物品。
- 已损坏装备不会提供属性和精灵；详情中的来源精灵会提示精灵暂不可用。

## 自测

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-equipment-slot-detail-check
```

预览：

```sh
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/phase85_equipment_slot_detail.png --quit-after 90 -- --equipment-slot-detail-preview
```
