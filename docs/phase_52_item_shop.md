# Phase52：道具店 / 石币 / 买卖道具

本阶段补上最小经济闭环：

- 玩家档案增加 `stoneCoins`，显示为「石币」。
- 火芽村入口新增一个道具店 NPC。
- 道具店面板有「购买」和「出售」两个页签。
- 购买消耗石币，并把道具加入 Phase49 的 15 格随身包。
- 出售从随身包扣 1 个道具，并获得石币。
- 买卖支持输入数量，也可以用 `-` / `+` / `最大` 调整数量。
- 战斗胜利可以获得少量石币。

本阶段不做装备、不做多商店、不做讨价还价、不做服务器权威经济。

批量规则：

- 购买和出售都是整笔成交。
- 钱不够、背包容量不够、持有数量不够时，不做部分成交。
- 购买页列表显示单价，例如 `8石币`，不额外写「买」。
- 出售页列表显示 `可卖 4石币`。
- 主按钮显示总价，例如 `购买 x99（792石币）`。

## 数据契约

`client/godot/data/item_shops.json`

- `id`: 商店唯一 ID。
- `label`: 商店显示名。
- `items`: 该商店可购买列表。
  - `itemId`: 背包道具 ID，必须存在于 `bag_items.json`。
  - `buyPrice`: 买入价格。
  - `sellPrice`: 可选；不填时使用买价 50%，向下取整，最低 1。
  - `buyable`: 可选；默认为 `true`。
  - `sellable`: 可选；默认为 `true`。

`client/godot/data/battle_rewards.json`

- 奖励表可以增加 `stoneCoins`：

```json
{
  "min": 12,
  "max": 24,
  "chance": 1.0
}
```

## 当前火芽杂货铺

- 肉：8 石币，卖出 4 石币。
- 回复药5：18 石币，卖出 9 石币。
- 群体草药5：28 石币，卖出 14 石币。
- 毒粉5：22 石币，卖出 11 石币。
- 毒雾粉5：36 石币，卖出 18 石币。
- 净化草5：16 石币，卖出 8 石币。
- 初级捕捉绳：14 石币，卖出 7 石币。
- 捕捉网：32 石币，卖出 16 石币。
- 强化网：68 石币，卖出 34 石币。

## 自测入口

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-shop-check
godot --path client/godot --scene res://scenes/Main.tscn -- --shop-preview
```
