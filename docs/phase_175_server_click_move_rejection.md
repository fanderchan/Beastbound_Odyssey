# Phase175：联网点击移动拒绝纠偏

本阶段把 174 的服务器逐步 ACK 移动补上拒绝处理合同：服务器拒绝 `/movement/step` 时，会返回可机读的 `movement` 元信息和可用的权威 `position`；客户端据此决定是否自动纠偏重试，或停止路径并同步到服务器位置。

## 目标

- `/movement/step` 失败响应带 `movement.stepAccepted=false`、`reason`、`retryable`、`requiresSync` 和 `maxStepCells`。
- 起点错位 `movement_origin_mismatch` 返回服务器权威位置，并标记可重试。
- 客户端收到可重试错位后，最多自动纠偏重试 2 次。
- 客户端收到不可重试拒绝时，若服务器带位置则先同步玩家位置，再清理路径和目标标记。
- 新增真实 Node 自测 `--auto-server-click-move-reject-live-check`。

## 客户端行为

- 普通服务器账号点击移动仍由本地寻路生成路径，但每一步继续等待服务器 ACK。
- 如果服务器认为玩家已经在另一格，客户端会立刻以服务器位置为准，重算剩余路径并继续移动。
- 如果服务器拒绝不可恢复的 step，例如切磋房间中、地图不一致或单步过远，客户端停止当前路径并给玩家一句简短中文提示。
- 正常 UI 不显示 step seq、retry count 或调试字段。

## 服务端合同

- 成功响应保持 174 的 `authority=server_step` 和 `movement.stepAccepted=true`。
- 失败响应保持 `ok=false/code/message`，并新增：
  - `position`：服务器当前权威位置，可能为 `null`。
  - `movement.authority=server_step`。
  - `movement.stepAccepted=false`。
  - `movement.retryable`：客户端是否可以基于返回位置自动重试。
  - `movement.requiresSync`：客户端是否应同步到服务器位置。

## 验证

```sh
cd server/node && npm test
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-click-move-reject-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-click-move-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-movement-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn -- --perf-probe
```

## 下一步

1. Phase176：把服务器 `battle_event_list` 接入共享 N vs N 战斗播放模板。
2. Phase177：切磋房间离开、取消、超时和战斗结果回写。
3. Phase178：逐步把地图碰撞、玩家碰撞和移动速度校验服务端化。
