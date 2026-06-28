# Phase96：转生后装备失效处理

本阶段修补 Phase94/95 之后的规则洞：人物转生会回到 Lv1，如果原本穿着有等级或转生需求的装备，不能继续享受这些装备的属性和精灵。

## 规则

- 转生不会强制卸下装备。
- 已装备物品如果当前等级或转生次数不满足需求：
  - 仍保留在装备槽。
  - 不提供属性加成。
  - 不提供装备精灵。
  - 不进入战斗 actor 的装备加成。
  - 装备栏详情显示 `需求未满足，装备暂不生效。`
- 已损坏装备仍按原规则不生效。
- 背包、商店的装备动作仍继续走 Phase95 的需求校验。

## 设计理由

不强制卸下可以避免背包已满时产生复杂的掉落、交换或丢失问题。玩家可以保留这件装备，等等级或转生次数重新满足后自动恢复生效。

## 自测

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-equipment-inactive-after-rebirth-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-equipment-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-equipment-requirement-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-player-rebirth-execute-check
```

本阶段验证结果：

- `--auto-equipment-inactive-after-rebirth-check`：`status=ok`。
- 骨刃一转后仍在右手槽。
- 转生前装备攻击加成 `25`，转生后只保留其他有效装备的攻击加成 `9`。
- 战斗 actor 的攻击装备加成同样为 `9`。
- `--shop-select-perf-check`：`item_us=568046`，`equipment_us=884337`，装备项 17。
- `--movement-spam-click-check`：`status=ok`，120 次点击仍合并为 2 次实际寻路。

预览截图入口：

```sh
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/phase96_inactive_equipment_after_rebirth.png --quit-after 120 -- --equipment-inactive-after-rebirth-preview
```

截图证据：

`/Users/fander/projects/Beastbound_Odyssey/.run/godot/phase96_inactive_equipment_after_rebirth00000119.png`
