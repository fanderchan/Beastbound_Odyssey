# Phase74：装备耐久 / 装备铺修理

本阶段给装备加入第一版耐久系统，并在火芽装备铺提供修理入口。

## 规则

- 装备默认耐久上限为 30，可通过 `durabilityMax` 覆盖。
- 已装备物品按装备槽保存当前耐久。
- 战斗胜利或失败后，已装备物品各消耗 1 点耐久。
- 耐久为 0 的装备视为损坏：
  - 不提供属性加成。
  - 不提供装备精灵。
  - 装备栏详情显示 `已损坏`。
- 火芽装备铺显示 `修理` 按钮，有损耗时会显示本次费用，例如 `修理 6石币`。
  - 每 5 点缺失耐久收 1 石币，向上取整。
  - 石币不足或没有损耗时按钮禁用。
  - 修理会把已装备物品耐久全部补满。

## 暂不处理

- 背包内未装备物品暂不追踪独立耐久。
- 换下装备回到背包时，旧装备的损耗暂不保留到单件实例。
- 不做强化失败、最大耐久下降、装备破碎消失。

## 自测

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-equipment-durability-check
```

预览截图入口：

```bash
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/phase74_equipment_durability.png --quit-after 80 -- --equipment-durability-preview
```
