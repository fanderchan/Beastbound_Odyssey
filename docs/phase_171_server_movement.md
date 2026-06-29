# Phase171：服务器权威移动第一版

本阶段把联网移动从“客户端上报快照”推进到“服务端接受单步移动”。它只做最小权威切面：相邻格 step、位置游标、切磋入场校验；不接完整路径、碰撞、地图切换或战斗回合。

## 目标

- `/players/position` 继续作为登录/同步种子。
- 新增 `/movement/step`，服务端校验当前位置和目标格。
- 成功 step 由服务器写入位置，并返回 `authority: "server_step"`。
- 成功 step 继续广播 `online.position`。
- 切磋房间 ready 前校验双方同图、近距离、停稳。
- 进入 ready 房间后拒绝继续移动。

## 服务端契约

同步种子：

```text
POST /players/position
```

权威单步：

```text
POST /movement/step
```

```json
{
  "mapId": "firebud_training_yard",
  "fromCellX": 10,
  "fromCellY": 10,
  "toCellX": 11,
  "toCellY": 10
}
```

成功响应：

```json
{
  "authority": "server_step",
  "movement": {
    "authority": "server_step",
    "stepAccepted": true,
    "movementSeq": 1,
    "maxStepCells": 1
  }
}
```

主要拒绝码：

- `movement_position_missing`：还没有服务器位置。
- `movement_origin_mismatch`：客户端声明的起点和服务器当前位置不同。
- `movement_step_too_far`：单次移动超过 1 格。
- `movement_battle_locked`：已经在切磋房间中。
- `battle_position_missing`：切磋前双方没有同步位置。
- `battle_map_mismatch`：双方不在同一地图。
- `battle_player_moving`：有一方仍在移动中。
- `battle_distance_too_far`：双方距离超过 4 格。

## 客户端边界

- 普通玩家 UI 暂不显示移动调试状态。
- Godot 增加 `movement_step_request()` 和 `parse_movement_step_response()`，供后续真实移动接管。
- 自测入口 `--auto-server-movement-live-check` 走真实 Node 服务，验证 step、拒绝跳跃、切磋移动门禁和房间内移动锁。

## 当前未做

- 把普通点击寻路完全切到逐步服务器 ACK。
- 地图碰撞、NPC 碰撞、玩家碰撞和 `movementCollision` 服务端化。
- 移动节流、速度校验、延迟补偿和预测回滚。
- 地图传送/记录点/队长跟随的服务器权威。
- 房间内战斗回合命令。

## 验证

```sh
cd server/node
npm test
```

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 7000 -- --auto-auth-server-client-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-movement-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-battle-room-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-event-replay-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-event-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-online-aoi-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1600 -- --perf-probe
```

## 下一步

1. Phase172：房间内回合命令提交和服务器战斗事件列表已完成第一版。
2. Phase173：战斗房间断线重连恢复到玩家可见战斗场景。
3. Phase174 已完成：普通点击寻路接入服务器 step ACK。
