# Phase101 转生洞穴合同

## 目标

把人物转生从“找导师确认资格”推进到可施工的正式结构：

- 每次转生都需要等级门槛和四个元素洞穴任务。
- 四个元素洞穴分别产出 `地之戒`、`水之戒`、`火之戒`、`风之戒`。
- 每个元素洞穴为多层迷宫，顶层守护兽战为 10 只怪，平均 Lv100，中心主怪更强并带控制/强攻技能。
- Lv80 可以尝试，Lv100+ 更合理，Lv131 更适合做极品人。
- 四戒指齐后进入最终洞窟。最终洞窟不使用原名 `漆黑洞穴`，本项目先命名为 `玄影洞窟`。
- `玄影洞窟` 前几层捕捉对应转生兽，顶层打更强的转生兽战，平均 Lv110。
- 完成后交出要求的转生兽，人物变为 Lv1 并回村。

## 数据合同

新增：

- `client/godot/data/rebirth_trials.json`
- `client/godot/scripts/progression/rebirth_trial_model.gd`

合同内容：

- `elementCaves`：四个元素洞穴、戒指、守护兽战配置。
- `rebirthBeasts`：地、水、火、风四只 Lv50 转生兽。
- `finalCave`：`玄影洞窟` 与顶层转生兽战。
- `stages`：1 到 6 转的捕捉要求、回到 Lv1 后的 starter 战宠规划、装备/道具奖励规划。
- `remoteStableUnlock`：远程兽栏在 `4转 Lv1` 后可选学习，不阻断后续转生。

## 每转捕捉要求

- `0转 -> 1转`：四戒指 + 捕捉地灵转生兽 Lv50。
- `1转 -> 2转`：四戒指 + 捕捉水灵转生兽 Lv50。
- `2转 -> 3转`：四戒指 + 捕捉火灵转生兽 Lv50。
- `3转 -> 4转`：四戒指 + 捕捉风灵转生兽 Lv50。
- `4转 -> 5转`：四戒指 + 捕捉地、水、火、风四只转生兽。
- `5转 -> 6转`：第一版沿用四灵全收束结构，后续如果你要做更特殊的六转仪式，可以只改合同数据。

## 每转奖励规划

- 一转：starter `地纹幼兽`，奖励 `恩惠3衣服`。
- 二转：starter `潮纹幼兽`，奖励 `滋润3饰品`。
- 三转：starter `焰纹幼兽`，奖励 `火纹长枪`。
- 四转：starter `岚纹幼兽`，奖励 `风纹轻靴`。
- 五转：starter `四灵幼兽`，奖励 `四灵护符`。
- 六转：starter `玄影幼兽`，奖励 `群攻弓`。

这些奖励先是合同规划，后续阶段再接入真实装备、技能、发奖和战斗表现。

## 本阶段实现范围

- 远程兽栏任务从 `六转后主线 active` 改为 `4转 Lv1 后可选任务`。
- 可选任务不会占用 `activeQuestId`，因此不会挡住五转、六转主线。
- 兽栏管理员在满足条件时可显示任务标记并完成远程兽栏。
- 已学会 `remoteStable` 后不再显示远程兽栏任务标记。
- 新增转生洞穴合同验证命令。

## 自测

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-rebirth-trial-contract-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-remote-stable-unlock-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-player-rebirth-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-npc-quest-marker-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-quest-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --shop-select-perf-check
```

## 结果

- `--auto-rebirth-trial-contract-check`: ok，`caves=4`，`rings=4`，`beasts=4`，`stages=6`，`remote_rebirth=4`，`final=玄影洞窟`。
- `--auto-remote-stable-unlock-check`: ok，四转后远程兽栏可选完成，不占用或强依赖当前主线 active。
- `--auto-player-rebirth-chain-check`: ok，六转后主线 active 为空。
- `--auto-npc-quest-marker-check`: ok。
- `--auto-quest-chain-check`: ok。
- `--auto-quest-ui-check`: ok。
- `--auto-equipment-requirement-check`: ok。
- `--auto-equipment-slot-detail-check`: ok。
- `--movement-spam-click-check`: ok，`clicks=120`，`applied=2`。

## 性能基线

- Phase99 记录：`movement applied=2`，商店 `item_us=633363`，`equipment_us=900568`。
- Phase101 当前：`movement applied=2`，商店单独重跑约 `item_us=1994033`，`equipment_us=3613408`。
- 结论：移动连点仍保持合并；商店选择微基准明显高于 Phase99，需要后续单独排查装备详情/控件刷新成本。本阶段没有把转生洞穴合同接入商店路径，因此先记录为待优化风险，不在转生合同阶段扩大改动范围。

## 后续施工顺序

1. 用合同生成或手工建立四个元素洞穴地图，先做入口、楼层、顶层守护兽。
2. 把守护兽战接入 10 只怪的固定阵型和掉戒指奖励。
3. 建立 `玄影洞窟`，接入转生兽捕捉和顶层 Lv110 转生兽战。
4. 扩展转生任务状态，让导师能检查四戒指、转生兽和最终战完成情况。
5. 把每转 starter 战宠和奖励规划转为真实物品/装备/技能。
