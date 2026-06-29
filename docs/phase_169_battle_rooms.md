# Phase169：切磋房间第一版

本阶段把联网结构从“同屏在线”推进到“双方同意后进入服务器房间”。它只建立切磋邀请、房间 ready 和服务器种子，不迁移完整本地战斗结算。

## 目标

- 玩家 A 可以向在线玩家 B 发起 `duel` 切磋邀请。
- 玩家 B 通过 WebSocket 收到 `battle.invite`。
- 玩家 B 接受后，服务端创建 `battleRoom`，生成 `roomId` 和 `seed`。
- 双方收到 `battle.room_ready`。
- 房间包含双方账号、位置、档案摘要和轻量队伍快照。
- Godot 先记录服务器房间状态，不启动本地 PvP 回合结算。

## 服务端契约

状态：

```text
GET /battle/state
```

邀请：

```text
POST /battle/invite
{"username": "target"}
```

接受/拒绝：

```text
POST /battle/invites/{inviteId}/accept
POST /battle/invites/{inviteId}/decline
```

房间 ready 响应：

```json
{
  "room": {
    "roomId": "battle_room_xxx",
    "mode": "duel",
    "status": "ready",
    "seed": "server_seed",
    "participants": []
  }
}
```

事件：

- `battle.invite`
- `battle.room_ready`
- `battle.invite_declined`

## 客户端边界

- 普通玩家 UI 暂不暴露切磋按钮。
- Godot 只缓存 `incomingInvites` 和 `room`，用于后续接入切磋入口和战斗场景。
- 自检入口 `--auto-battle-room-live-check` 走真实服务器请求和 WebSocket 事件。
- 房间 ready 后不调用本地战斗开始函数，避免把 PvP 房间和野外本地战斗结算混在一起。

## 当前未做

- 战斗房间内的回合命令提交和服务器结算。
- 房间超时、取消、离开。
- 房间内 10v10 站位锁定和双方 profile 完整队伍快照。
- 移动锁、观战、战斗结果回写和奖励/惩罚。

## 验证

```sh
cd server/node
npm test
```

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 7000 -- --auto-auth-server-client-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-battle-room-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-event-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-online-aoi-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1600 -- --perf-probe
```

## 下一步

1. Phase170：WebSocket 事件游标和断线补偿已完成第一轮，房间邀请/ready 短线可恢复。
2. Phase171：服务器权威移动第一版已完成，进入切磋前会校验距离、地图和移动状态。
3. Phase172：房间内回合命令提交和服务器战斗事件列表。
