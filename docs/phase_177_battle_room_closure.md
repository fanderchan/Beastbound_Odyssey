# Phase177：切磋房间关闭、取消和结果回写

本阶段把联网切磋从“能进入并播放回合”推进到“能由服务器关闭并让客户端正确退出”。房间关闭仍属于 N vs N 战斗模型：1v1 只是最小烟测，后续 2v1、2v2、10v10 都沿用同一套房间、actor 和结果合同。

## 目标

- 邀请方可以取消未接受的切磋邀请。
- 待接受邀请会在服务端过期，过期事件从客户端邀请列表移除。
- 房间参与者可以离开切磋房间，服务器关闭 room 并广播 `battle.room_closed`。
- 回合命令长时间未提交时，服务端按超时关闭房间。
- 一方全部倒下时，服务端在 `battle_event_list` 里带 `result`，并关闭 room。
- Godot 收到关闭房间后退出服务器权威战斗，不执行本地 PvE 经验、掉落、捕宠或击飞结算。

## 服务端合同

新增/扩展 Node 服务：

- `POST /battle/invites/{inviteId}/cancel`
- `POST /battle/rooms/{roomId}/leave`
- `battle.invite_cancelled`
- `battle.invite_expired`
- `battle.room_closed`

`publicBattleRoom` 现在会暴露：

- `status=closed`
- `closeReason`
- `closedByAccountId`
- `closedAt`
- `battle.result`
- `battle.commandDeadlineAt`

`result` 当前只表达切磋胜负和关闭原因，不发放奖励，也不修改角色成长：

- `reason=leave`
- `reason=timeout`
- `reason=defeat`
- `winnerAccountId`
- `loserAccountIds`
- `closedByAccountId`

## 客户端行为

Godot 新增请求：

- `ServerAuthClientModel.battle_invite_cancel_request`
- `ServerAuthClientModel.battle_room_leave_request`

主场景新增关闭处理：

- `battle.invite_cancelled` / `battle.invite_expired` 会移除待处理邀请。
- `battle.room_closed` 会缓存或立即消费关闭房间。
- 如果回合动画正在播放，先播完服务器事件列表，再按服务器结果退出战斗。
- 如果没有动画可播，立即退出战斗并显示简短玩家提示。

玩家可见提示只保留人类可理解的结果，例如：

- `你已离开切磋。`
- `对方已离开切磋，你获胜。`
- `对方超时，切磋获胜。`
- `切磋胜利。`
- `切磋落败。`

普通 UI 不显示 room id、account id、event seq 或原始 result JSON。

## 当前边界

- 关闭结果只结束房间，不做经验、道具、任务、捕宠或惩罚。
- 客户端已有 leave 请求模型和自动验证，正式玩家 UI 的“离开切磋”按钮可在后续阶段接入。
- 服务端 actor 仍是轻量人物 actor；宠物/队伍快照还未服务器权威化。
- MySQL 归一化战斗表仍未落地；当前继续随服务端 JSON 存储。

## 验证

```sh
cd server/node && npm test
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 5000 -- --auto-auth-server-client-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-battle-close-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-battle-turn-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-battle-reconnect-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1600 -- --perf-probe
```

`--auto-server-battle-close-live-check` 走真实 Node 服务完成：

1. 两个账号注册并停在同图相邻格。
2. A 邀请 B，B 通过 WebSocket 收到邀请。
3. A 取消邀请，B 的邀请缓存移除。
4. A 再次邀请 B，B 接受并进入服务器权威战斗场景。
5. B 离开房间，B 收到 `battle.room_closed` 并退出战斗。

## 下一步

1. Phase178 已完成：服务端战斗 actor 扩展到人物 + 当前战斗宠快照，继续沿用 N vs N 模型。
2. Phase179：正式玩家 UI 接入“离开切磋”，同时保留服务端权威关闭。
3. Phase180：服务端宠物命令和基础宠物技能事件。
4. Phase181：逐步把地图碰撞、玩家碰撞和移动速度校验服务端化。
