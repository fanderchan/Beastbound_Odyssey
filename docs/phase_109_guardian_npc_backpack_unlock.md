# Phase109：守护兽 NPC 与背包扩展位

## 内容

- 四大元素洞穴顶层守护兽改为 NPC 交互挑战。
- 原顶层 `encounterZones` 保留为 `manualOnly` 战斗配置，不再绘制为草丛，也不会随机遇敌触发。
- 顶层任务寻路现在指向守护兽 NPC；对话选择「挑战」后进入原 10v10 守护战。
- 胜利继续按 `battle_rewards.json` 发放对应戒指；失败不发任务物品。
- 随身包基础容量保持 15 格，最大容量变为 20 格。
- 初始 GM 档案拥有 10000 钻石。
- 背包「全部」页显示 5 个锁位；按顺序花费 50、100、200、400、1000 钻石解锁。
- 锁位未解锁前不会参与道具领取、购买、战斗奖励、邮箱领取或容量计算。

## 自测命令

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-backpack-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-rebirth-cave-guardian-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-rebirth-task-tracker-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-backpack-filter-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-map-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-player-stat-spam-perf-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-movement-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-mouse-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pathfinding-check
```

## 手测建议

```bash
godot --path client/godot --scene res://scenes/Main.tscn
```

- 打开「背包」，在「全部」页点击第一个锁位，确认消耗 50 钻石后应增加一个空格，下一个锁位显示 100 钻石。
- 完成一转资格后，用任务寻路进四大洞穴顶层，目标应指向站着的守护兽 NPC；对话「挑战」进入战斗。
