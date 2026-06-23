# Phase55：装备系统 / 装备商店 / 买肉后使用肉教学

本阶段把装备接入现有背包、商店、战斗属性和新手任务链。

## 内容

- 新增装备目录 `equipment_items.json`。
  - 装备栏第一版包含左饰品、右饰品、头盔、左手武器、衣服、右手武器、手套、鞋子。
  - `木棒`：右手武器，攻击 +6。
  - `石斧`：右手武器，攻击 +11、敏捷 -2。
  - `兽皮背心`：衣服，防御 +5。
  - 新手全身装备会在后续阶段扩展为默认套装，装备可附带人物精灵。
- 背包道具新增 `equipment` 用途。
  - 选中装备时按钮显示 `装备`。
  - 装备详情显示装备槽和属性效果。
- 新增独立 `装备` 面板。
  - 槽位按身体部位关系摆放，不使用普通背包网格。
  - 装备从背包移入装备栏，不再占用背包格。
  - 同槽已有装备时，新装备装上，旧装备回到背包。
  - 从装备栏卸下时，装备回到背包。
  - 如果背包已满导致旧装备无法放回，交换或卸下会失败，不改状态。
- 玩家档案新增 `equipmentSlots`。
  - 进入战斗时，玩家 actor 会获得装备属性加成。
  - 商店只出售背包实际持有的物品；装备栏内物品需要先卸回背包再卖。
  - 旧存档没有装备槽时会自动补空槽，坏引用会自动清理。
- 新增 `火芽装备铺`。
  - 装备商阿石售卖木棒、石斧、兽皮背心，以及新手套装的各部位装备。
  - 继续复用现有购买/出售/数量输入 UI。
- 新手任务链扩展为：
  - 认识训练师。
  - 在火芽杂货铺购买肉。
  - 在随身包里对队伍宠物使用肉。
  - 在火芽装备铺购买木棒。
  - 在随身包里装备木棒。
  - 村外试炼。
  - 捕捉乌力。
- 肉允许在宠物满血时喂食，避免新手教学从干净新档进入死锁；药品仍保持满血不可用。

## 当前边界

- 第一版只做人类玩家装备，不做宠物装备。
- 不做耐久、词条、强化、装备等级限制。
- 装备图标和角色外观变化先不做，后续资产阶段再接。

## 自测

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-equipment-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-backpack-world-use-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-shop-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-quest-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-quest-ui-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-battle-reward-check
godot --path client/godot --scene res://scenes/Main.tscn --write-movie .run/godot/phase55_equipment_quest.png --quit-after 240 -- --equipment-quest-preview
godot --path client/godot --scene res://scenes/Main.tscn --write-movie .run/godot/phase55_equipment_swap.png --quit-after 420 -- --equipment-swap-preview
```
