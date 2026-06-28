# Phase25：异常状态技能数据化

## 目标

Phase24 已经有异常状态底层。

Phase25 把“哪些技能会造成什么异常状态”推进到 `battle_actions.json`，避免以后每加一个宠物技能、精灵或道具都改战斗结算代码。

本阶段先做本地 Godot 原型，不接 Node.js/MySQL。

## 新增数据字段

状态类效果写在行动目录里：

```json
{
  "effect": {
    "type": "status",
    "statusId": "sleep",
    "statusTurns": 2,
    "statusHitRate": 0.82
  }
}
```

中毒这种“即时伤害 + 持续状态”写成：

```json
{
  "effect": {
    "type": "poison",
    "amount": 18,
    "statusId": "poison",
    "statusTurns": 3,
    "statusPotencyRatio": 0.5,
    "statusHitRate": 0.86
  }
}
```

字段说明：

- `effect.type`
  - `status`：只挂异常状态，不造成即时伤害。
  - `poison`：先造成即时伤害，再给活着的目标挂状态。
- `statusId`：当前允许 `poison`、`sleep`、`confusion`、`stone`。
- `statusTurns`：持续回合。
- `statusPotency`：固定状态强度，当前主要给中毒跳伤使用。
- `statusPotencyRatio`：按即时伤害比例换算状态强度，例如 `0.5` 表示中毒跳伤为即时伤害的一半。
- `statusHitRate`：状态基础命中率，Phase26 开始参与命中/抗性结算。

## 新增宠物技能

当前 `PET` 面板已有：

- `技1 攻击`
- `技2 防御`
- `技3 布伊冲撞`
- `技4 催眠粉`：给敌方单体挂 `sleep`。
- `技5 迷惑吼`：给敌方单体挂 `confusion`。
- `技6 石化凝视`：给敌方单体挂 `stone`。
- `技7`：预留，当前未配置技能。

`技4/5/6` 都走同一套敌方单体点选流程。

## 结算事件

状态宠物技能生成：

```json
{
  "type": "skill_status",
  "skillId": "pet_sleep_powder",
  "statusId": "sleep",
  "statusTurns": 2
}
```

应用后进入 Phase23 事件账本：

- `type = skill_status`
- `skillId` 记录具体技能。
- `statusId` 记录状态类型。
- `statusResult = applied` 或 `resisted`
- `statusChanges` 记录状态变化。
- `statusChance`、`statusRoll`、`statusResistance` 由 Phase26 写入账本，用于工程验证和未来服务器复现。
- `targets[].statusesBefore` / `targets[].statusesAfter` 记录状态前后快照。

## 手工验证

启动：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-status-skill-test
```

验证方式：

1. 人物先随便选择一个行动，例如 `攻击` 一个敌人。
2. 进入 `PET` 面板后，测试 `技4 催眠粉`、`技5 迷惑吼`、`技6 石化凝视`。
3. 鼠标悬停敌人会出现目标圈，点击敌人后技能生效。
4. 目标头顶应出现 `眠`、`乱`、`石` 徽标。
5. 下一轮观察：
   - `眠` 会让目标跳过行动。
   - `乱` 会让目标攻击同阵营单位。
   - `石` 会让目标跳过行动，并提高受物理攻击时的防御效果。

## 自动验证

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1400 -- --auto-battle-status-skill-check
```

自动验证内容：

- PET 面板 `技4/5/6` 标签来自 `battle_actions.json`。
- `技4 催眠粉` 生成 `skill_status` 并挂 `sleep`。
- `技5 迷惑吼` 生成 `skill_status` 并挂 `confusion`。
- `技6 石化凝视` 生成 `skill_status` 并挂 `stone`。

## 当前不做

- 状态解除类技能。
- 全体状态宠物技能。
- 技7 正式技能。
- 服务端权威技能目录。

状态免疫、覆盖和单体净化已在 Phase27 继续推进。剩余内容等行动数据契约稳定后再继续扩展。
