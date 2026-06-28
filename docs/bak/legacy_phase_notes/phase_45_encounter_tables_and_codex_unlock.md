# Phase45：遭遇表 / 图鉴自然解锁

这一阶段把村外草丛从固定 `野生乌力`，推进为地图数据驱动的野外宠物池。

## 规则

- `火芽村入口` 的 `村外草丛` 新增 `wildPetPool`。
- 遭遇池第一版包含：
  - `野生乌力`，权重 70，Lv1-2。
  - `高速乌力`，权重 20，Lv1-3。
  - `高防乌力`，权重 10，Lv2-3。
- 从真实遭遇入口进入战斗时，会按权重抽取一只野生宠物。
- 直接调用 `BattleModel.create_wild_battle(zone)` 时仍默认取遭遇池第一只，避免老回归测试变成随机结果。
- 战斗结算沿用 Phase44 的图鉴记录：见到的野生宠物会变成 `已遇见`，捕捉成功会变成 `已捕捉`。

## 手动自测

打开 Phase45 遭遇表预览：

```bash
godot --path client/godot --scene res://scenes/Main.tscn -- --pet-encounter-table-preview
```

进入后会直接弹出村外草丛遭遇提示。点 `进入战斗`，应看到 `高速乌力`。

从正常入口自己走草丛：

```bash
godot --path client/godot --scene res://scenes/Main.tscn
```

从训练场走到 `村口木门`，进入 `火芽村入口`，在村外草丛中移动触发遭遇。多试几次，应能遇到普通乌力、高速乌力或高防乌力。

## 自动回归

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-encounter-table-check
```

这个检查覆盖：

- 村外草丛存在三种乌力遭遇条目。
- 默认战斗仍取普通乌力，保留旧测试稳定性。
- 强制选中高速乌力时，战斗敌人会变成高速乌力。
- 固定随机种子能从池子里抽到三种形态。
- 强制高防乌力遭遇并结束战斗后，图鉴会记录为 `已遇见`。
