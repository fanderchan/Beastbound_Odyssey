# Phase168：在线 AOI 过滤

本阶段把在线可见玩家从“同服广播”推进到“按地图和格子半径过滤”。目标不是服务器权威移动，而是先建立 MMO 必需的可见范围边界，减少客户端收到的在线玩家噪音。

## 目标

- `/players/online` 默认继续返回全量在线名册，保留队伍邀请和运营检查入口。
- `/players/online?scope=aoi&mapId={mapId}&cellX={x}&cellY={y}&radius={cells}` 返回当前账号和同地图半径内玩家。
- `POST /players/position` 保存位置后返回 AOI 名册，默认半径 18 格。
- WebSocket `online.snapshot` 和 `online.position` 按每个连接自己的当前位置生成可见列表。
- 玩家从视野外移动到视野内时推送；视野外继续移动时不推送。

## 服务端契约

默认在线名册：

```text
GET /players/online
```

AOI 名册：

```text
GET /players/online?scope=aoi&mapId=firebud_training_yard&cellX=10&cellY=10&radius=18
```

AOI 响应包含：

```json
{
  "ok": true,
  "players": [],
  "aoi": {
    "scope": "aoi",
    "mapId": "firebud_training_yard",
    "cellX": 10,
    "cellY": 10,
    "radius": 18
  }
}
```

当前 AOI 使用同地图方形格子半径：`abs(dx) <= radius && abs(dy) <= radius`。这是第一版范围过滤，后续可替换为分区桶或地图房间订阅。

## 客户端边界

- Godot 位置心跳在原有低频 Timer 里附带 `aoiRadius`。
- 远端玩家缓存仍只在 HTTP 回包或 WebSocket 事件里替换。
- `_process` 不扫描地图玩家，也不做 AOI 计算，只保留 WebSocket `poll()`。
- 普通玩家 UI 不显示 AOI 半径、事件 id 或测试状态。

## 当前未做

- 服务器权威移动、速度校验和碰撞。
- 地图分线、房间订阅、格子桶索引。
- 附近聊天的坐标范围过滤。
- 断线游标、事件重放和跨进程事件总线。

## 验证

```sh
cd server/node
npm test
```

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 7000 -- --auto-auth-server-client-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-online-aoi-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-online-position-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-event-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1600 -- --perf-probe
```

## 下一步

1. Phase169：切磋房间和战斗种子，让双方同意后由服务端建立战斗上下文。
2. Phase170：WebSocket 事件游标和断线补偿，避免短线重连丢关键状态。
3. Phase171：服务器权威移动第一版，先做格子级速度/碰撞验证。
