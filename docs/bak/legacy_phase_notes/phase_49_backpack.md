# Phase49：随身包与战斗物品过滤

## 目标

- 玩家有一个随身包，固定 15 个格子。
- 相同道具可以堆叠，按钮和背包格子显示数量。
- 战斗中的「物品」和「捕捉」都从同一个随身包读取数量。
- 战斗物品菜单只显示当前上下文可用的道具，例如「肉」在「物品」里显示，「强化网」只在「捕捉」里显示。
- 本阶段不做商店、金钱、装备栏、丢弃道具，也不做多页背包整理。

## 数据契约

`client/godot/data/bag_items.json`

- `id`: 道具唯一 ID。
- `label`: 背包和完整显示名。
- `menuLabel`: 战斗按钮短名。
- `stackLimit`: 单格最大堆叠数。
- `startingCount`: 新角色初始数量。
- `useContexts`: 可用场景。
  - `battle_item`: 战斗「物品」菜单。
  - `capture`: 战斗「捕捉」菜单。
- `battleActionId`: 战斗物品对应的动作 ID。
- `captureToolId`: 捕捉道具对应的捕捉工具 ID。

随身包保存为 15 个槽位：

```json
{
  "itemId": "item_meat_small",
  "count": 6
}
```

空槽使用空对象 `{}`。同一道具数量超过单格堆叠上限时，自动占用后续空格。

## 当前默认道具

- 肉：战斗「物品」可用，单体回复。
- 群体草药5、回复药5、毒粉5、毒雾粉5、净化草5：沿用原有战斗物品。
- 初级捕捉绳、捕捉网、强化网：只在捕捉菜单可用。
- 空手捕捉不是背包物品，不占格子、不消耗数量。

## 自测入口

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-backpack-check
godot --path client/godot --scene res://scenes/Main.tscn -- --backpack-preview
```
