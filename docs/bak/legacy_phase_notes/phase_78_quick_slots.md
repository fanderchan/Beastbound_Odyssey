# Phase78：快捷槽 / 世界道具快捷使用

本阶段加入第一版地图快捷槽，减少常用道具从背包里层层打开的操作。

## 内容

- 底部行动栏新增 3 个快捷槽。
- 背包选中世界可用道具时，显示 `快捷1`、`快捷2`、`快捷3` 绑定按钮。
- 可绑定的第一版道具：
  - 宠物恢复类：肉、回复药5。
  - 原地遇敌类：初级/中级/高级遇敌石。
- 快捷使用规则：
  - 恢复道具会优先给出战宠使用，其次找第一只受伤的队伍宠物。
  - 队伍宠物都满血时，不消耗恢复道具。
  - 遇敌石沿用原规则：需要站在遇敌区域内才会消耗并生效。
  - 道具数量为 0 时，快捷槽不可用；通过快捷槽消耗到 0 后会清空该快捷槽。
- 快捷槽保存在玩家 profile 的 `quickSlots` 字段里，旧存档会自动补齐空槽。

## 暂不做

- 不做拖拽换位。
- 不做战斗内快捷槽，战斗物品仍走战斗指令。
- 不绑定装备、捕捉专用道具和不可在世界使用的物品。

## 自测

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-quick-slot-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-backpack-world-use-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-shop-check
```

## 手动预览

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --quick-slot-preview
```
