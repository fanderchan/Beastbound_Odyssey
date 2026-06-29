# Phase172：房间回合命令和服务器战斗事件列表

本阶段把联网切磋从“房间 ready”推进到“双方提交回合命令后由服务器产出事件列表”。它只做最小回合切面：`attack` / `defend`、两人命令凑齐、轻量 HP、`battle_event_list`；不接完整 10v10 队伍、道具、宠物技能、战斗结果回写或断线恢复到可见战斗场景。

## 目标

- 新增 `POST /battle/rooms/{roomId}/commands`。
- 房间创建时带轻量 `battle` 状态：回合、阶段、演员、已提交账号、最后事件列表。
- 单方提交命令后广播 `battle.command_submitted`，但不提前暴露命令细节。
- 双方命令凑齐后服务端结算当前回合，生成 `battle_event_list`。
- 回合结算后广播 `battle.turn_resolved`，房间进入下一回合命令阶段。
- Godot 增加请求/解析模型和真实联网自测入口，不改普通玩家 UI。

## 服务端契约

提交命令：

```text
POST /battle/rooms/{roomId}/commands
```

```json
{
  "round": 1,
  "actionId": "attack",
  "targetUsername": "target_player"
}
```

支持的第一版命令：

- `attack`：攻击房间内另一名参与者。
- `defend`：本回合防御，降低受到的第一版攻击伤害。

第一名玩家提交成功：

```json
{
  "ok": true,
  "room": {
    "battle": {
      "round": 1,
      "phase": "command",
      "submittedAccountIds": ["acc_xxx"]
    }
  },
  "turn": null
}
```

双方提交后：

```json
{
  "ok": true,
  "turn": {
    "kind": "battle_event_list",
    "round": 1,
    "events": [
      {
        "eventType": "basic_attack",
        "actionId": "attack",
        "damage": 20,
        "hpBefore": 120,
        "hpAfter": 100
      }
    ]
  },
  "room": {
    "battle": {
      "round": 2,
      "lastEventList": {}
    }
  }
}
```

主要拒绝码：

- `battle_room_missing`：房间不存在或已关闭。
- `battle_room_forbidden`：当前账号不在房间中。
- `battle_command_round_mismatch`：客户端提交的回合已经过期。
- `battle_command_duplicate`：本回合已经提交过命令。
- `battle_command_action_invalid`：暂不支持该命令。
- `battle_command_target_missing` / `battle_command_target_invalid`：目标不存在或不在房间内。

## 事件

新增可 replay 的战斗事件：

- `battle.command_submitted`
- `battle.turn_resolved`

`battle.command_submitted` 只包含提交者、房间、回合、已提交账号，不包含未结算命令内容。

`battle.turn_resolved` 包含：

- `roomId`
- `round`
- `turn.kind = "battle_event_list"`
- `turn.events`
- 最新 public room battle state

## 客户端边界

- `ServerAuthClientModel` 增加 `battle_command_submit_request()`。
- `ServerAuthClientModel` 增加 `parse_battle_command_response()`。
- `main.gd` 的服务器事件缓存识别 `battle.command_submitted` 和 `battle.turn_resolved`。
- 自测入口 `--auto-server-battle-turn-live-check` 走真实 Node 服务完成一轮 attack/defend。
- 普通玩家 UI 暂不显示联网回合调试内容，也不启动本地 PvP 战斗循环。

## 当前未做

- 完整 10v10 队伍/宠物 actor 锁定。
- 宠物技能、精灵、道具、换宠、逃跑、自动战斗。
- 本地战斗播放接管服务器事件列表。
- 房间离开、取消、超时和断线恢复到可见战斗场景。
- 战斗结果、奖励、惩罚、击飞/记录点回写。
- MySQL 归一化战斗表；当前仍随 room JSON 文档保存。

## 验证

```sh
cd server/node
npm test
```

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 7000 -- --auto-auth-server-client-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-battle-turn-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-battle-room-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-event-replay-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-event-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-movement-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1600 -- --perf-probe
```

## 下一步

1. Phase173：战斗房间断线重连恢复到玩家可见战斗场景。
2. Phase174：逐步把普通点击寻路接入服务器 step ACK。
3. Phase175：把服务器 `battle_event_list` 接入共享 10v10 战斗播放模板。
