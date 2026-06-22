# Phase51：随身包世界使用

本阶段把背包道具的用途从单一列表拆成明确场景：

- `battle_item`: 战斗「物品」菜单可用。
- `capture`: 捕捉菜单可用。
- `world_pet_heal`: 世界界面的随身包可用，可对队伍宠物恢复生命。

当前规则：

- 肉：战斗可用、世界可用。世界中对一只队伍宠物恢复 28 生命。
- 回复药5：战斗可用、世界可用。世界中对一只队伍宠物恢复 42 生命。
- 捕捉绳、捕捉网、强化网：只在捕捉菜单出现，不在普通「使用」里出现。
- 群体草药5暂时只保留战斗用法，避免本阶段引入世界全队治疗 UI。

世界使用限制：

- 只能对队伍宠物使用，兽栏里的宠物不参与世界恢复。
- 生命已满时不消耗道具。
- 使用成功后消耗 1 个道具，只恢复生命，不改变出战 / 待机 / 休息状态。

自测命令：

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-backpack-world-use-check
```

可视预览：

```bash
godot --path client/godot --scene res://scenes/Main.tscn --write-movie .run/godot/phase51_backpack_world_use_preview.png --quit-after 12 -- --backpack-world-use-preview
```
