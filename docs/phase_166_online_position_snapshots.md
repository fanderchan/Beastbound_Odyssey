# Phase166：在线位置快照

本阶段把联网版从“能登录、能组队、能聊天”推进到“同服玩家可以互相看见”的最小闭环。客户端低频上报自己的地图格子，服务端保存轻量位置快照，并在在线名册里返回其他玩家的位置。

## 目标

- 服务端保存当前账号的地图、格子坐标、朝向、移动状态和更新时间。
- Godot 客户端服务器账号登录后低频同步位置，不依赖本地入口。
- 当前地图上绘制同服其他玩家的轻量影子、朝向和昵称。
- MySQL 桥接增加 `player_positions`，便于本机持久化验证。

## 服务端契约

`POST /players/position`：

```json
{
  "mapId": "firebud_training_yard",
  "cellX": 16,
  "cellY": 11,
  "facing": "west",
  "moving": false
}
```

返回当前账号的位置确认和最新在线名册：

```json
{
  "ok": true,
  "position": {
    "mapId": "firebud_training_yard",
    "cellX": 16,
    "cellY": 11,
    "facing": "west",
    "moving": false
  },
  "players": []
}
```

`GET /players/online` 同样包含每个在线账号的 `position`，没有上报过位置的账号返回 `position: null`。

## 客户端边界

- 位置同步使用独立 `Timer` 和 `HTTPRequest`，默认 1.2 秒一次。
- 请求 pending 时跳过下一次 Timer，不堆积网络请求。
- 远端玩家缓存只在网络回包时更新；世界绘制签名只读取已缓存的轻量字符串。
- 本机账号从远端列表里过滤，避免把自己画成另一个玩家。
- 远端玩家不参与碰撞、点击交互、寻路、队伍跟随或战斗入场。

## 当前未做

- 地图范围过滤、分线、房间和区域订阅。
- 服务器权威移动、碰撞和反作弊。
- 队长跟随、队伍整体入战、切磋房间。

## 验证

```sh
cd server/node
npm test
```

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 7000 -- --auto-auth-server-client-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-online-position-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-party-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-chat-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1600 -- --perf-probe
```

可见画面验证使用 `--write-movie` 输出 PNG 帧，确认远端玩家昵称和角色影子显示在地图上。

## 下一步

1. Phase167：WebSocket 事件通道已完成第一轮，聊天、位置、队伍邀请从手动刷新/低频轮询推进到轻量推送。
2. Phase168：范围订阅和同屏过滤，按地图/区域减少在线列表噪音。
3. Phase169：切磋房间和战斗种子，让双方同意后由服务端生成战斗房间。
