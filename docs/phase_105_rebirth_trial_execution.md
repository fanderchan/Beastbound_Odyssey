# Phase105 转生试炼接入执行

## 目标

把 Phase101-104 的地图、守护兽、戒指、玄影洞窟和转生兽捕捉，接入真正的人物转生执行条件。

## 实现

- 人物转生仍要求人物等级达到 Lv80。
- 每次转生还必须满足：
  - 四枚元素戒指：地之戒、水之戒、火之戒、风之戒。
  - 玄影洞窟顶层守护战胜利证明。
  - 对应转生兽：
    - 0转 -> 1转：地灵转生兽 Lv50。
    - 1转 -> 2转：水灵转生兽 Lv50。
    - 2转 -> 3转：火灵转生兽 Lv50。
    - 3转 -> 4转：风灵转生兽 Lv50。
    - 4转 -> 5转：地、水、火、风四只转生兽。
    - 5转 -> 6转：第一版沿用四灵全收束结构。
- 执行转生时会消耗四枚元素戒指、消耗对应转生兽、消耗一份玄影顶层胜利证明。
- 转生成功后人物回到 Lv1，生命回满，并回到当前记录点。
- 每转发放一只 Lv1 starter 战宠和一件规划奖励：
  - 一转：地纹幼兽、恩惠衣3。
  - 二转：潮纹幼兽、滋润护符3。
  - 三转：焰纹幼兽、火纹长枪。
  - 四转：岚纹幼兽、风纹轻靴。
  - 五转：四灵幼兽、四灵护符。
  - 六转：玄影幼兽、玄影群攻弓。
- `rebirth_trials.json` 增加 `specialTaskPlans`，先规划 1-6 转各一条可补做的特殊好处任务；校验要求它们都是 optional、不可错过，并且达到对应转生次数后 Lv1 即可补做。
- 远程兽栏保持为四转后可选任务，满足 `>=4转` 后可以补做，不阻断五转和六转。

## 自测

```sh
jq empty client/godot/data/rebirth_trials.json
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-rebirth-trial-contract-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-rebirth-trial-execute-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-player-rebirth-execute-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-player-rebirth-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-rebirth-cave-guardian-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-shadow-oath-cavern-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-battle-reward-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-pet-template-catalog-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-remote-stable-unlock-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-npc-quest-marker-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-quest-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-map-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --shop-select-perf-check
```

## 结果

- `--auto-rebirth-trial-contract-check`: ok，`caves=4`，`rings=4`，`beasts=4`，`stages=6`，`special_tasks=6`。
- `--auto-rebirth-trial-execute-check`: ok，缺材料会阻止转生；一转会消耗地灵转生兽并发恩惠衣3；五转会消耗四灵转生兽并发四灵护符。
- `--auto-player-rebirth-execute-check`: ok，UI 二次确认后完成一转，人物 Lv1，并回到记录点「村医旁记录点」。
- `--auto-player-rebirth-chain-check`: ok，1-6 转完整链路通过。
- `--auto-rebirth-cave-guardian-check`: ok，四洞穴 4 层链路、顶层 10 怪、中心主怪、戒指奖励均通过。
- `--auto-shadow-oath-cavern-check`: ok，玄影洞窟 5 层、四种 Lv50 转生兽捕捉层、顶层平均 Lv110 守护战均通过。
- `--auto-remote-stable-unlock-check`: ok，四转后可选学习远程兽栏，后续仍可补做。
- `--auto-npc-quest-marker-check`: ok，任务标记四态和隐藏规则通过。

## 性能基线

- Phase104 记录：`movement applied=2`，商店 `item_us=2123371`，`equipment_us=3644610`。
- Phase105 当前：`movement applied=2`，商店 `item_us=613104`，`equipment_us=1053298`。
- 结论：移动连点合并稳定；商店切换没有新增卡顿，当前结果明显低于 Phase104 记录。
