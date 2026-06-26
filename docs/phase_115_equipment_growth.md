# Phase115 装备成长线

## 已落地

- 装备栏新增 `强化` 按钮。
- 装备详情显示强化等级与当前强化加成。
- 装备格显示 `+N` 强化等级。
- 强化消耗初级木质碎片或初级皮革碎片，以及石币。
- 第一版强化上限默认 `+5`。

## 当前规则

- 右手/左手武器强化：每级 `攻击 +1`。
- 衣服/头盔/手套/鞋子强化：每级 `防御 +1`。
- 左右饰品强化：每级 `生命 +2`。
- 经验丹槽不能强化。
- 第一版强化记录绑定装备槽与装备 ID；换下再换同 ID 保留同槽记录，换成别的装备会重置该槽强化记录。后续如要做极品装备实例，需要把背包装备从堆叠物品升级为实例物品。

## 耐久规则

- 武器：实际攻击动作累计 100 次，耐久扣 1。
- 防具：人物被实际命中并造成伤害累计 10 次，耐久扣 1。
- 精灵、物品、防御、逃跑不计武器攻击次数。
- 回避不计防具被命中次数。
- 修理会恢复耐久，并清空累计磨损计数。

## 自测

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-equipment-growth-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-equipment-durability-check
```
