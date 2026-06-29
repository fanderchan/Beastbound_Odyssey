# Phase170：WebSocket 游标和断线补发

本阶段把联网事件通道从“在线即收”推进到“短线可恢复”。它不改变普通玩家 UI，也不把战斗房间推进到回合结算，只补足关键事件的游标和 replay 边界。

## 目标

- 服务器给关键事件分配递增 `eventSeq`。
- 客户端保存最近处理过的 `eventSeq`。
- 重连 `WS /events` 时可带 `lastEventSeq`。
- 服务端只补发该账号可见、且序号更大的关键事件。
- 战斗邀请和 `battle.room_ready` 在短线重连后可以恢复。

## 服务端契约

连接：

```text
WS /events?token={sessionToken}&lastEventSeq={eventSeq}
```

可补发事件：

- `chat.message`
- `party.invite`
- `party.update`
- `party.invite_declined`
- `battle.invite`
- `battle.room_ready`
- `battle.invite_declined`

不补发事件：

- `events.ready`：每次连接即时发送。
- `online.snapshot`：每次连接即时生成当前 AOI 状态。
- `online.position`：瞬态移动事件不进历史，重连以后以 `online.snapshot` 为准。

## 实现边界

- 历史只保留短窗口，当前为 500 条。
- replay 期间新 live 事件先进入连接内队列，replay 完再按 `eventSeq` 发送，避免乱序。
- 客户端丢弃 `eventSeq <= server_event_last_seq` 的重复事件。
- MySQL store 增加 `service_events` 镜像表；完整状态仍写入 `server_state`。

## 当前未做

- 事件 ACK 上报和持久离线补偿。
- 每账号独立消费游标存档。
- 房间离开、取消、超时、重连恢复到战斗场景。
- 服务器权威移动或战斗回合命令。

## 验证

```sh
cd server/node
npm test
```

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 7000 -- --auto-auth-server-client-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-event-replay-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-event-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-battle-room-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-online-aoi-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1600 -- --perf-probe
```

## 下一步

1. Phase171：服务器权威移动第一版，进入切磋前校验距离、地图和移动状态。
2. Phase172：房间内回合命令提交和服务器战斗事件列表。
3. Phase173：战斗房间断线重连恢复到玩家可见战斗场景。
