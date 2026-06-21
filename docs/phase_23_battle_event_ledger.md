# Phase23：战斗事件事实账本与回放契约

## 本阶段目标

Phase23 不是玩家可见日志，也不是游戏窗口里的调试面板。

它要建立一份本地战斗事件事实账本，后续可以自然迁移到 Node.js 权威战斗服务端，并同时服务三件事：

- Godot 客户端按账本播放战斗动画，不再自己猜“实际打了谁”。
- `.run/battle_trace/latest.jsonl` 记录 GM、服务器管理员、运营、自动化测试可读的审计信息。
- 未来服务端可以直接输出同结构事件，客户端只负责播放。

玩家正常 UI 只显示战斗画面和简短中文战斗信息，不显示事件 ID、slotId、内部断言、调试摘要。

## 核心问题

前面阶段已经修过多次类似问题：

- 原目标死亡后，逻辑已转火，但画面还冲向旧尸体。
- 连续转火时，第二个目标死亡后仍可能打旧目标。
- 近战或合击还没命中，目标先扣血、死亡或击飞。
- 合击击飞没有等最后一个参与者进入命中窗口。

这些不是单个动画问题，而是“结算事实”和“播放事实”没有统一契约。

## 事件账本字段

每个成功应用的战斗事件生成一条 `battle_event_ledger`：

```json
{
  "schemaVersion": 1,
  "kind": "battle_event_ledger",
  "eventId": "local_stat_formula_test_battle:r1:s2:attack",
  "battleId": "local_stat_formula_test_battle",
  "round": 1,
  "sequence": 2,
  "type": "attack",
  "attackerId": "ally_speed_normal",
  "participantIds": ["ally_speed_normal"],
  "declaredTargetId": "enemy_front_3",
  "resolvedTargetId": "enemy_back_1",
  "targetIds": ["enemy_back_1"],
  "targetSide": "enemy",
  "retargeted": true,
  "speed": 90,
  "damage": 12,
  "heal": 0,
  "effectPerTarget": {
    "enemy_back_1": 12
  },
  "launch": false,
  "launchMode": "",
  "canLaunch": false,
  "timeline": {
    "durationSeconds": 0.62,
    "delaysResult": true,
    "damageRevealProgress": 0.50,
    "launchStartProgress": 0.50
  },
  "targets": [
    {
      "targetId": "enemy_back_1",
      "hpBefore": 170,
      "hpAfter": 158,
      "stateBefore": "idle",
      "stateAfter": "hit"
    }
  ]
}
```

字段说明：

- `declaredTargetId`：指令或队列原本指定的目标。
- `resolvedTargetId`：事件真正命中的目标。原目标倒下时必须改为活着的替代目标。
- `retargeted`：`declaredTargetId != resolvedTargetId` 时为 true。
- `targetIds`：全体技能或多目标事件命中的目标列表；单体事件只有一个。
- `participantIds`：合击参与者；非合击默认为行动者自己。
- `effectPerTarget`：每个目标实际受到的伤害或治疗。
- `timeline`：客户端播放用的时序契约。近战、合击、击飞都必须按这里延迟表现结果。
- `targets`：每个目标的前后状态，用于审计、自动测试、GM 排查。

## 回放规则

Godot 播放层只读账本里的 resolved 事实：

- 攻击者冲向 `resolvedTargetId`。
- 浮字出现在 `targetIds` 对应目标上。
- 近战类事件在 `damageRevealProgress` 之后才显示扣血、死亡、击飞。
- 合击的 `damageRevealProgress` 必须晚于最后一个参与者的命中点。
- 击飞从 `launchStartProgress` 开始；合击击飞不能早于最后一个参与者命中。
- 事件结束后才能进入下一条事件。

## 伤害重算规则

如果事件发生转火，最终伤害要按 `resolvedTargetId` 重新计算，不能沿用原目标的防御结果。

当前阶段先覆盖：

- 普通攻击转火。
- 宠物近战技能转火。
- 合击转火。

精灵、毒、物品这类固定数值效果暂时不需要按防御重算。

## 旁路日志

如果启用了旁路验证，日志继续写入：

```text
.run/battle_trace/latest.jsonl
```

其中每条战斗事件直接写入 `battle_event_ledger`。正常玩家 UI 不显示这些内容。

## 自动验证

新增验证命令：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1400 -- --auto-battle-event-ledger-check
```

验证内容：

- 事件账本存在，并且 `schemaVersion=1`。
- 单体攻击账本能区分 `declaredTargetId` 和 `resolvedTargetId`。
- 连续转火时，显示目标、日志目标、实际扣血目标一致。
- 转火伤害按新目标防御重新计算。
- 合击击飞账本的 `damageRevealProgress` 晚于普通击飞默认点。
- 浮字和击飞使用账本的 resolved 目标。

## 暂不做

- 不做正式 GM 后台页面。
- 不接 Node.js / MySQL。
- 不做网络战斗回放协议。
- 不做正式战斗录像存储。
- 不把账本暴露给普通玩家。

