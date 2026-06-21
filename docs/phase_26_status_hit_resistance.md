# Phase26：状态命中率与抗性

## 目标

本阶段把异常状态从“必定附加”改成“按行动命中率和目标抗性结算”。

这一步仍然只做本地 Godot 战斗模型，不接后端。核心目的是先把规则形状定下来，让后续服务器权威战斗事件也能复用同一套字段。

## 数据字段

行动目录 `client/godot/data/battle_actions.json` 的 `effect` 新增：

- `statusHitRate`：状态基础命中率，范围 `0.0` 到 `1.0`。

战斗单位新增：

- `statusResist`：状态抗性字典，key 是状态 id，例如 `sleep`、`confusion`、`stone`、`poison`。
- `statusResist.all`：可选通用抗性。当前测试优先使用具体状态抗性。

当前状态 id：

- `poison`：中毒
- `sleep`：睡眠
- `confusion`：混乱
- `stone`：石化

## 结算规则

最终状态成功率：

```text
finalChance = clamp(statusHitRate - target.statusResist[statusId], 0.0, 1.0)
```

然后用战斗 `targetSeed`、行动 id、攻击者、目标、状态、回合、事件序号生成确定性 roll：

```text
success = roll < finalChance
```

这样自动测试稳定，后续服务器也可以复现同一回合的结算结果。

## 行为说明

- PET `催眠粉`、`迷惑吼`、`石化凝视` 现在会走命中率/抗性判断。
- `毒精灵5`、`毒雾精灵5`、`毒粉5`、`毒雾粉5` 会先造成即时伤害。
- 如果毒类行动的状态附加被抵抗，目标只扣即时伤害，不会获得持续中毒。
- 玩家可见反馈只显示游戏含义，例如 `抵抗` 或 `抵抗 -8`。
- `statusChance`、`statusRoll`、`statusResistance` 等工程验证字段只写入战斗账本/trace，不显示在普通 HUD。

## 手工测试

启动：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-status-hit-test
```

建议检查：

- 人物先随便选一个行动。
- 宠物阶段用 `技4 催眠粉` 点 `普通乌力`，应稳定上 `眠`。
- 宠物阶段用 `技4 催眠粉` 点 `厚皮乌力`，应显示 `抵抗`。
- 也可以用 `技5 迷惑吼`、`技6 石化凝视` 点不同敌人，观察成功和抵抗反馈。
- 普通玩家界面不会显示命中率、roll、抗性数值。

## 自动测试

```sh
node tools/battle_action_catalog_check.mjs
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1400 -- --auto-battle-status-hit-check
```

`--auto-battle-status-hit-check` 覆盖：

- 低抗目标必定成功。
- 高抗目标必定抵抗。
- 毒类行动即时伤害生效，但持续中毒被抵抗。

## 后续

下一步可以继续做：

- 状态自然解除/被技能解除。
- 宠物 `技7`。
- 捕捉后归属与宠物栏。
- 服务器权威战斗事件列表。

状态解除、覆盖和免疫已在 Phase27 继续推进。
