# Phase165：服务端聊天传输

本阶段把 Phase77 的本地聊天面板推进到联网版本的最小可用边界：附近和队伍频道都通过 Node.js 服务端读写，普通玩家 UI 不再把附近/队伍聊天当成本地自娱自乐入口。

## 目标

- 附近频道：当前先作为同服公开频道，服务端保存最近消息。
- 队伍频道：发送和读取都依赖服务端队伍成员关系，队伍外账号不能写入，也看不到其他队伍消息。
- Godot 聊天面板：打开、切频道、刷新、发送时请求服务端；系统频道仍保留为本地系统消息。
- MySQL 桥接：`BEASTBOUND_AUTH_STORE=mysql` 时镜像 `chat_messages`，便于本机正轨化验证。

## 服务端契约

- `GET /chat/messages?channel=nearby&limit=50`：读取当前账号可见的附近频道历史。
- `GET /chat/messages?channel=team&limit=50`：读取当前账号所在队伍的聊天历史；未入队时返回空列表。
- `POST /chat/send`：写入聊天消息。

发送体：

```json
{
  "channel": "nearby",
  "text": "大家好"
}
```

消息返回体保留玩家可见字段：

```json
{
  "messageId": "chat_...",
  "channel": "nearby",
  "partyId": null,
  "senderUsername": "player001",
  "senderDisplayName": "player001",
  "text": "大家好",
  "createdAt": "2026-06-29T00:00:00.000Z"
}
```

## 客户端边界

- 未登录服务器账号时，附近和队伍频道不可发送，面板只提示需要服务器账号登录。
- 系统频道不调用服务端，继续显示本地系统消息。
- 聊天请求不进入 `_process`、HUD、任务追踪或移动热路径。
- 面板上的刷新按钮只在服务器账号、非系统频道、无请求挂起时可用。

## 当前未做

- 地图坐标范围聊天。
- WebSocket 推送和在线状态订阅。
- 聊天审核、屏蔽、禁言和敏感词。
- 战斗房间、跟随移动或队伍入战同步。

## 验证

```sh
cd server/node
npm test
```

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 7000 -- --auto-auth-server-client-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 4000 -- --auto-chat-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-chat-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-party-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1600 -- --perf-probe
```

MySQL 桥接验证使用临时库创建 `chat_messages`、写入附近和队伍消息、查询计数后删除临时库。

## 下一步

1. Phase166：同屏玩家位置同步和在线角色快照，给附近聊天范围、跟随和切磋入口铺底。（已完成第一轮）
2. Phase167：WebSocket 事件通道，把聊天、队伍邀请、在线列表从手动刷新推进到轻量推送。
3. Phase168：服务端战斗房间种子和双方同意切磋，先做战斗开局权威，再迁移完整战斗结算。
