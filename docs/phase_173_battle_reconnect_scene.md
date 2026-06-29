# Phase173：战斗房间断线恢复到可见战斗场景

本阶段把联网切磋从“服务器 room/battle 状态存在”推进到“客户端断线或重启后可以恢复到玩家可见的战斗画面”。它仍然保持服务器权威：恢复出的 `battle_state` 只承载显示、目标选择和服务器命令提交，不再误走本地野怪战斗结算。

## 目标

- 将服务器 `room.battle.actors` 映射为 Godot 共享 10v10 战斗模板。
- 当前账号始终映射到我方 `ally.back.3`，对手映射到敌方 `enemy.back.3`。
- 登录服务器账号后后台拉取 `/battle/state`，如果已有 ready 房间，直接进入战斗画面。
- WebSocket 收到 `battle.room_ready` / `battle.command_submitted` / `battle.turn_resolved` 时同步同一个战斗画面。
- 联网战斗中的攻击/防御提交到 `POST /battle/rooms/{roomId}/commands`，不触发本地 PvE 回合。
- 新增真实 Node 自测 `--auto-server-battle-reconnect-live-check`。

## 客户端契约

新增模型：

```text
client/godot/scripts/battle/server_battle_room_model.gd
```

它负责：

- `is_restorable_room(room)`：判断 public room 是否足够恢复为战斗画面。
- `battle_state_from_room(room, session)`：生成 Godot 可绘制 `battle_state`。
- `target_command_payload_for_actor(actor)`：从本地 actor 取回服务器目标账号。

生成的 `battle_state` 会包含：

- `serverAuthority = true`
- `serverRoomId`
- `serverBattle`
- `serverRoom`
- `lastServerEventList`
- `formationTemplate = 10v10`

如果当前账号本回合已经提交命令，本地 phase 会变为 `server_waiting`，按钮隐藏并显示“指令已提交，等待对方。”；服务器进入下一回合后恢复为 `command`。

## 玩家可见行为

- 断线重连后直接显示切磋战斗场景。
- 恢复后仍使用同一套 PC/移动共享战斗布局。
- 普通玩家 UI 不显示 room id、event seq、调试字段或自测文本。
- 暂时只开放攻击和防御；其他联网战斗命令会显示“联网切磋暂只支持攻击和防御。”

## 当前未做

- 播放服务器 `battle_event_list` 的完整动画时间线。
- 完整 10v10 队伍/宠物 actor 锁定。
- 宠物技能、精灵、道具、换宠、逃跑、自动战斗。
- 房间离开、取消和超时。
- 战斗结果、奖励、惩罚、击飞/记录点回写。
- MySQL 归一化战斗表；当前仍随 room JSON 文档保存。

## 验证

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-battle-reconnect-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-battle-turn-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-battle-room-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1600 -- --perf-probe
```

## 下一步

1. Phase174 已完成：普通点击寻路接入服务器 step ACK。
2. Phase175：把服务器 `battle_event_list` 接入共享 10v10 战斗播放模板。
3. Phase176：切磋房间离开、取消、超时和战斗结果回写。
