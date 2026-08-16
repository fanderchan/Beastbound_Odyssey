# Phase 462：切磋换宠真联机合同修复

## 修复范围

Phase 461 的换宠策略本身已经通过确定性检查，但旧
`--auto-server-battle-switch-pet-live-check` 仍假设注册后立刻拥有角色、战宠和可任意写入的位置。
当前正式合同已经变为：账号先创建并选择角色，新角色宠物栏为空，位置写入由服务端校验。因此旧夹具在
进入切磋房间前失败，不能继续作为真实换宠链路证据。

本阶段只修复自动验收基础设施，不改变注册、角色、任务、宠物、移动、切磋、换宠或元素公式。正式后端的
位置校验默认值也没有改变；任意定位只在这次显式本地 QA 服务进程中通过
`BEASTBOUND_ALLOW_POSITION_TELEPORT=1` 临时启用，服务停止后即失效。

## 当前权威前置

真联机夹具现在按公开玩家接口依次完成：

1. 先以可重试的只读 `/health` 请求确认 Godot HTTP 传输就绪；注册 mutation 本身不自动重试。
2. 用跨进程唯一用户名注册两个一次性账号，读取角色列表；空列表时按正式外观和总计十点元素创建角色，
   再显式选择角色并使用轮换后的 session。
3. 两个账号都沿正式新手任务记录五个合法事件，领取对战宠物蛋和新手老虎蛋；通过
   `/profile/action` 由服务端孵化两只宠物，并把芽耳布伊从待机切为出战，新手老虎保留为待机。
4. 在显式本地 QA 定位开关下把双方放到相邻格，随后走真实事件流、邀请、接受、房间快照、换宠提交、
   对方双指令和下一回合推进。
5. 结束后离开房间、关闭事件流并注销双方 session。没有整档上传、客户端伪造宠物或直接改数据库。

失败状态行同时保留注册 HTTP、角色、宠物准备、位置 HTTP／错误码和接受错误码，后续不再用连续的
`false` 猜测失败阶段。

## 确定性断言修正

普通 PvE 换宠检查原来用“本回合 actor 记录里没有玩家宠物”证明换宠回合没有额外宠物指令。该口径会把
宠物被攻击后触发的自动反击也算成玩家指令，因而偶发假红。现在直接检查
`BattleModel.build_player_pet_round_events` 生成的初始命令事件：换宠回合不得存在以玩家宠物为
`attackerId` 的命令事件。反击仍可按正式规则发生，测试不再把合法反应误判为第二次下令。

## 验证证据

- 真联机：`.run/godot_auto_checks/2026-08-16T15-35-42-282Z_summary.json` 为
  `runner_status=passed / 2/2`。最终状态包含
  `character=true / roster=true/true / profile=true / positions=true / stream=true / invite=true /
  room_apply=true / ready=true / visible=true / menu=true / switch_submit=true / remote=true /
  switch_event=true / actor=true / next_required=true / round=true`。
- 确定性回归：`.run/godot_auto_checks/2026-08-16T15-42-25-340Z_summary.json` 为
  `runner_status=passed / 3/3`，覆盖 Godot parse、普通换宠和服务端战斗目标／换宠映射。
- `git diff --check` 与 `godot --headless --path client/godot --quit`：通过。
- 两次 runner 均通过隔离 `automation` QA lane 证明并完成清理；真联机批次真实玩家目录 SHA-256
  前后均为 `f0e2b356a62412e90f347b1baab122302ff8027548776c4c5b2a067b639f178b`，最终确定性批次前后
  均为 `b59bbb69513beacac48e9940e43816503be2d512b99c02578d3c84bd3afc4431`。
- 本地开发 MySQL 最终计数为 `accounts=1135 / profiles=732 / sessions=1177`；调试和最终验收创建的
  一次性 QA 账号保留为可审计记录，没有用破坏性数据库清理删除。`player_positions=0 / battle_rooms=0`
  证明注销后没有遗留运行房间或位置。
- 最终已停止本地后端，PID 为空、健康探针不可达；临时定位开关没有常驻。

## 发布边界

本阶段关闭了 Phase 461 登记的旧 live 测试债，但不扩大 P1.5 的玩法范围，也不把其他旧 live 夹具
顺带改写。P1.4 融合宠工程链仍保持关闭态：苔垒角兽 V4E 头像继续等待项目所有者明确视觉批准，
`portraitReleaseGate=false / releaseApproved=false / runtimeEnabled=false / playerEntryOpened=false`；
本阶段没有生成 owner decision、release attestation 或开放普通玩家入口。
