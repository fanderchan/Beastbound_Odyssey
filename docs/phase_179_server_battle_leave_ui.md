# Phase179：联网切磋离开按钮

本阶段把 Phase177/178 已有的服务端房间关闭能力接到玩家战斗 UI。联网切磋中，原本本地 PvE 的“逃跑”按钮会显示为“离开”，点击后请求服务器关闭当前切磋房间，并按服务端返回的关闭结果退出战斗。

## 目标

- 联网切磋中玩家按钮显示“离开”，不再显示本地战斗语义的“逃跑”。
- 点击“离开”走 `POST /battle/rooms/:roomId/leave`，不绕过服务器结算。
- 离开请求处理中锁定战斗指令，避免重复提交。
- 服务端返回或推送 `battle.room_closed` 后，客户端退出战斗并显示“你已离开切磋。”。
- 本地 PvE 战斗仍保留原来的“逃跑”结算。

## 客户端行为

`main.gd` 现在在服务器权威战斗中把 `run` 指令重定向到 `_leave_server_battle_room()`：

- 请求前：`battle_state.phase = server_waiting`，按钮进入锁定状态。
- 请求成功：复用 `_apply_server_battle_room_closed()` / `_finish_server_battle_from_closed_room()`。
- 请求失败：回到 `command` phase，重置回合倒计时并显示错误。

服务器战斗暂时只开放攻击、防御、离开和 help。捕捉、物品、换宠等按钮会禁用，等后续服务器命令合同补齐后再开放。

## 服务端合同

本阶段没有新增服务端接口，复用已有合同：

```http
POST /battle/rooms/:roomId/leave
Authorization: Bearer <serverSessionToken>
```

成功后房间进入 `closed`，关闭原因是 `leave`，并广播 `battle.room_closed`。客户端用返回的 `room.battle.result` 判断自己离开还是对方离开。

## 验证

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 12000 -- --auto-server-battle-leave-ui-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-battle-close-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-battle-pet-snapshot-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1600 -- --perf-probe
```

`--auto-server-battle-leave-ui-live-check` 走真实 Node 服务：

1. 注册两个服务器账号。
2. 双方同步位置并建立切磋房间。
3. Godot 进入服务器权威战斗。
4. 校验 `run` 按钮显示为“离开”且可点击。
5. 通过 `_on_battle_command_pressed("run")` 触发玩家 UI 入口。
6. 收到 `battle.room_closed` 后退出战斗，世界日志显示“你已离开切磋。”。

## 下一步

1. Phase180：服务端宠物命令和基础宠物技能事件。
2. Phase181：逐步把地图碰撞、玩家碰撞和移动速度校验服务端化。
