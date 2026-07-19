# Phase315：联网点击移动单飞与宠物面板 JSON 类型回归

## 玩家问题

- 玩家从真实服务器登录后，点击地面或任务寻路会出现黄色路线，但人物最多只挪一格，随后不再移动。
- 同次运行日志还记录了宠物面板调用 `_pet_instance_index` 时普通 `Array` 与 `Array[Dictionary]` 不兼容。
- macOS 的 `IMKCFRunLoopWakeUpReliable` Mach Port 行是输入法框架提示，不是移动故障。

## 根因与边界

- 联网点击移动通过本地寻路拆成逐格 `POST /movement/step`，每格必须先得到服务器 ACK 才播放移动。
- 首格开始时，deferred 启动和逐帧更新都能进入 `_request_next_server_step_move()`；旧代码直到异步位置种子完成后才设置 `server_step_move_request_pending`，因此会并发提交同一步。
- 服务端正确接受第一个请求并拒绝其余过期起点；客户端陷入 `movement_origin_mismatch`。修复前真实复现为 `requests=8 / acks=1 / final=(11,17)`。
- 本阶段不放松服务端位置权威、不允许客户端跳格、不改变地图碰撞、速度、遇敌或队伍规则；这只是恢复原本应有的石器式点击行走。

## 实现

- `panel_flow_coordinator.gd` 在任何位置种子或移动 HTTP `await` 之前占用同一个 pending 门闩；同一计划只能存在一个在途请求，计划失效仍沿用既有取消边界。
- `--auto-server-click-move-live-check` 改为加载真实记录点地图，从 `(10,17)` 逐格走到 `(13,17)`，要求请求数、ACK 数、客户端终点和服务端权威终点完全一致。
- `_pet_instance_index` 接受 JSON 解码产生的普通 `Array` 并逐项验证 `Dictionary`，宠物顺序检查先做 JSON round-trip，覆盖真实联网档案类型。

## 验证

- `node tools/run_godot_auto_checks.mjs --only --auto-server-click-move-live-check,--auto-pet-order-check,--auto-movement-check --fail-fast --timeout-ms 180000`
  - Godot parse 加三项定向检查共 `4/4` 通过。
  - 联网移动为 `expected_steps=3 / requests=3 / acks=3 / final=(13,17)`。
  - 日志：`.run/godot_auto_checks/2026-07-19T04-26-42-058Z.log`。
- `godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3000 -- --movement-spam-click-check --perf-probe`
  - 317 次真实跨帧点击合并为 18 次寻路，`status=ok`、`moved=true`、`final_match=true`。
  - 稳态 60 FPS，`process_total=0.09..0.22ms`。
- Metal 实录：`.run/evidence/phase315_movement_singleflight/server_click_move.mp4`，1280×720、60 FPS、89 帧；服务器精确确认三格后正常到达。

## 玩家复验

无需修改账号或后端。关闭旧客户端后重新运行项目，登录后点击任意可通行地面；人物应逐格移动，黄色路线随进度缩短。若需要手工核对服务器权威路径，可从火芽村医旁记录点向右点击三格，最终坐标应从 `(10,17)` 到 `(13,17)`。
