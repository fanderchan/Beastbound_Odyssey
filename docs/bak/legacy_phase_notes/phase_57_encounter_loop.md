# Phase57：遇敌循环 / 挂机走动 / 遇敌石

本阶段把野外遇敌改成更接近石器式挂机节奏的第一版：

- 普通草丛遇敌不再弹出 `进入战斗` 确认，触发后直接进入战斗。
- 战斗回到地图后有 1 秒保护时间，避免刚落地立刻再次遇敌。
- 自然遇敌和挂机走动使用同一套走格检查；挂机只是在遇敌区内自动来回走。
- `火芽村入口` 草丛的单格遇敌率暂定为 `0.09`，用于接近平均约 6 秒一战的原型节奏。
- 火芽杂货铺新增三档遇敌石：
  - 初级遇敌石：站在遇敌区每 3 秒遇敌。
  - 中级遇敌石：站在遇敌区每 2 秒遇敌。
  - 高级遇敌石：站在遇敌区每 1 秒遇敌。

遇敌石当前是本地原型效果：使用后持续 10 分钟；战斗中暂停计时，回地图后继续受 1 秒保护影响。这个持续时间和价格后续可以按商业节奏再调。

## 手动测试

```sh
godot --path client/godot --scene res://scenes/Main.tscn
```

建议测试路径：

1. 从训练场走到 `火芽村入口`。
2. 走进草丛区域，确认不会弹出 `进入战斗` 确认框，触发后直接进战斗。
3. 战斗结束回地图后，确认不会瞬间再次进战斗。
4. 站在草丛里点动作栏 `挂机`，人物会在遇敌区内来回走；按钮变为 `停`。
5. 去火芽杂货铺购买遇敌石，站在草丛中从随身包使用，确认原地按对应间隔遇敌。

## 自测命令

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-encounter-loop-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-encounter-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3600 -- --auto-battle-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-backpack-world-use-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-shop-check
```
