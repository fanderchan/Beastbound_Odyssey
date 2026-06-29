# Phase174：普通点击寻路接入服务器 step ACK

本阶段把联网移动从“客户端可以调用 `/movement/step`”推进到“服务器账号的普通点击寻路会逐格等待服务器 ACK”。它仍然保留本地路径搜索和视觉动画：客户端先用当前地图算出路径，每一格先提交服务器，服务器接受后才让角色动画走到该格，到达后再请求下一格。

## 目标

- 服务器账号点击地面移动时，逐格调用 `POST /movement/step`。
- 每个 step ACK 后只播放一格移动，避免整条路径绕过服务器。
- 移动过程中在线位置上报使用服务器确认的格子，避免 timer 把动画中间位置覆盖回服务器。
- 移动完成后发布一次 `moving=false` 的位置快照。
- 新增真实 Node 自测 `--auto-server-click-move-live-check`。

## 客户端行为

- 非服务器会话仍走原本本地点击移动，方便离线自测和本地工具。
- 服务器会话下，普通地面点击进入 `server_step_move_*` 状态机。
- 如果服务器拒绝 step，例如起点不匹配，Phase175 已补上权威位置纠偏和有限自动重试。
- 遇敌、开战、对话、传送等清理导航的流程会取消未完成的服务器步进计划。

## 实现边界

- 本阶段不把地图碰撞、NPC 碰撞、玩家碰撞服务端化。
- 不做地图切换、记录点、队长跟随、挂机路径的服务器权威。
- 不做延迟补偿、预测回滚或速度校验。
- 不改变普通玩家 UI，不显示 step seq、event seq 或调试字段。

## 验证

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-click-move-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-movement-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn -- --perf-probe
```

## 下一步

1. Phase175：已完成联网点击移动拒绝纠偏和有限重试。
2. Phase176：把服务器 `battle_event_list` 接入共享 N vs N 战斗播放模板。
3. Phase177：切磋房间离开、取消、超时和战斗结果回写。
4. Phase178：逐步把地图碰撞、玩家碰撞和移动速度校验服务端化。
