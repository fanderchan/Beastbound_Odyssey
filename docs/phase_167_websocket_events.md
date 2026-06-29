# Phase167：WebSocket 事件通道

本阶段把联网版从“客户端主动刷新”推进到“服务器主动推送关键变化”。客户端仍然通过 HTTP 完成登录、位置上报、聊天发送和队伍操作；WebSocket 只负责把这些已经授权的结果 fanout 给在线客户端。

## 目标

- Node 后端提供 `WS /events?token={sessionToken}`，用现有服务器会话鉴权。
- Godot 服务器账号登录后自动连接事件通道，断线后轻量重连。
- 事件覆盖 `events.ready`、`online.snapshot`、`online.position`、`chat.message` 和队伍邀请/更新。
- 位置上报继续沿用 Phase166 的低频 HTTP Timer，不把移动改成服务器权威。
- `_process` 中只做 WebSocket `poll()` 和每帧限量包处理，不做在线列表或队伍全量扫描。

## 服务端契约

连接：

```text
WS /events?token={sessionToken}
```

连接成功后服务端立即发送：

```json
{"type": "events.ready", "account": {"username": "player"}}
{"type": "online.snapshot", "players": [], "party": null}
```

后续 HTTP 操作触发推送：

- `POST /players/position` -> `online.position`
- `POST /chat/send` -> `chat.message`
- `POST /party/invite` -> `party.invite`
- `POST /party/invites/{inviteId}/accept` -> `party.update`
- `POST /party/invites/{inviteId}/decline` -> `party.invite_declined`
- `POST /party/leave` -> `party.update`

所有事件都带 `schemaVersion` 和 `createdAt`。队伍和队聊事件会按账号过滤；Phase168 起在线位置按地图/格子 AOI 过滤。

## 客户端边界

- 仅服务器账号会启动事件通道；切回登录或无服务器 session 时立即关闭。
- 断线后默认 3 秒重连。
- 每帧最多处理 8 个事件包，避免高频事件拖慢普通移动和 HUD。
- `online.snapshot` / `online.position` 只更新远端玩家缓存。
- `chat.message` 去重后追加到本地聊天列表。
- 队伍事件直接合并到当前队伍状态；面板打开时再刷新 UI。

## 当前未做

- 显式房间订阅和跨进程事件总线。
- 服务器权威移动、碰撞、跟随和反作弊。
- 战斗房间事件、战斗种子同步和双方确认入战。
- WebSocket 层的消息确认、重放游标和断线补偿。

## 验证

```sh
cd server/node
npm test
```

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 7000 -- --auto-auth-server-client-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-event-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-online-position-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-chat-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-party-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1600 -- --perf-probe
```

## 下一步

1. Phase168：地图/格子 AOI 过滤已完成第一轮，减少同服在线位置广播噪音。
2. Phase169：切磋房间和战斗种子，让双方同意后由服务端建立战斗上下文。
3. Phase170：WebSocket 断线补偿和事件游标已完成第一轮，短线重连可以补收关键队伍/战斗事件。
