# Phase 513：生产发布 R1.W002 Firebud v2 真实 Main 录片收口

日期：2026-08-21

## 目标与结论

本阶段只关闭 `R1.W002 AUTO｜Firebud v2 真实 Main 录片收口与 QA lane 恢复`，不开始 R1.W003 的道路、草地和广场过渡返工，也不批准、提升或启用 `firebud_region_visual_v2`。

Phase 511 的 600 秒失败已精确复现并闭环。旧路径在村口 moving native PNG 已写出后进入音频/渲染清理协程；该协程没有请求新 redraw，却继续等待 `RenderingServer.frame_post_draw`。移动结束后的低活动渲染路径不保证再发出该信号，因此最终 capture report 和正常退出永远到不了，只能由外层 runner 在 600 秒后终止。与此同时，地图视觉录片仍会启动普通城镇音乐与环境 Ogg，立即退出时可间歇留下 8 个播放对象和 4 个资源。

最终实现把截图阶段与退出清理阶段明确分开：截图仍使用 redraw + `frame_post_draw` 取得完整 1280×720 画面；截图后的资源 drain 不再等待渲染信号，而是显式停止并断开全部 16 个 `AudioStreamPlayer`、在释放音频管理器前后各等待 8 个 process frame 和 0.75 秒真实时间，并写入精确 cleanup 回执。地图视觉 OWNER 录片只验证画面、真实输入和隔离，不启动生产 Ogg 播放；MovieWriter 仍必须生成可完整解码的 48kHz 双声道 AAC 音轨。普通玩家及专门音频验收路径的播放行为不变。

runner 的超时分类也已修正：超时不再无条件保留 automation lane。只有 leader 已 reap、整个继承进程组已证明关闭、错误字段与 TERM/KILL 证据自洽、owner-bound lane 复验通过时，才写入 `cleaned_after_contained_timeout` 回执并执行精确 cleanup + post-clean inspect；任何进程组未关闭、leader 未 reap、lane 漂移、回执写入失败或清理失败仍保持 fail closed，不会误删车道。

结果：真实 Main 村口/训练场 idle + moving 连续两轮完整录片均通过；两轮共 8 个 owner-bound lane 生命周期和 32 个 Godot phase 进程全部有界关闭，automation lane 最终 absent，真实玩家目录 inventory hash 全程不变，没有本轮 recorder/Godot 候选孤儿进程。Firebud v2 生命周期仍为 pending，下一任务是 R1.W003。

## 实现合同

### 1. 截图完成后不再等待不受保证的渲染事件

`client/godot/scripts/qa/map_visual_review_capture.gd` 保留截图前和 `_capture_complete_image()` 内的 `RenderingServer.frame_post_draw`，因为这些位置会先 `queue_redraw()`，用于证明完整稳定画面。

`_drain_capture_runtime()` 则改为：

1. 结束 battle audio timeline 并断开 host 引用；
2. 读取音频管理器 snapshot，要求地图视觉录片的 production playback 已禁用；
3. `stop_all()`，遍历全部 `AudioStreamPlayer`，逐个 `stop()` 且 `stream=null`；
4. 证明没有 player 仍持有 stream；
5. 等待 8 个 process frame + 0.75 秒，释放 manager 并清空 host 引用；
6. 再等待 8 个 process frame + 0.75 秒，证明 manager 已释放；
7. 报告 `audioPlaybackDisabled=true`、`audioStreamsDetached=true`、`detachedAudioPlayerCount=16`、`drainFrames=16`、`drainSeconds=1.5`。

退出 drain 中没有 `RenderingServer.frame_post_draw`，因此 moving 截图后即使没有下一次绘制也能继续写报告和退出。外层进程超时仍是最终有界保护，不会让协程异常重新变成 600 秒后保留车道。

### 2. 地图视觉取证不启动生产 Ogg

`client/godot/scripts/main.gd` 在构建真实 `GameAudioManager`、但尚未把它加入 SceneTree 前，仅对 `map_visual_review_capture` 调用 `configure_playback_enabled(false)`。这仍是正常 `Main.tscn`、正常 HUD、真实地图 renderer 和真实鼠标输入；变化只限于短生命周期地图视觉证据进程不会加载/播放城镇音乐与环境 Ogg。

正式片段仍被 recorder 强制验证为：

- H.264 / yuv420p；
- 1280×720；
- 30fps、1×；
- 48kHz 双声道 AAC；
- 音视频时长一致并全流解码通过。

专门的 `--auto-audio-runtime-check` 在同一最终源码上通过，证明正常音频路径没有被静默禁用。

### 3. 只有“已完整 containment 的超时”才允许清理 lane

`tools/record_pet_management_owner_review.py` 的共享 owner-review core 新增精确 bounded-timeout 判定。可清理的超时必须同时满足：

- phase 与 containment scope 精确匹配；
- `timedOut=true` 且有独立 `timeoutDiagnostic`；
- `leaderReaped=true`、exit code 为精确整数；
- `processGroupClosed=true`；
- residual 与 TERM/KILL 字段互相一致；
- 没有 setup、wait、settlement 或 signal-handler diagnostic。

满足后，runner 先 owner-bound verify，写入 timeout process 事实，再 cleanup、post-clean inspect，最后把 `qaLanePreserved` 明确置为 `false` 并以失败状态返回。证据不满足上述任一条件时仍抛出 `GodotLanePreservationError`，保持 lane 和人工检查指引。

`tools/record_firebud_v2_owner_review.py` 的失败摘要现在会嵌入所有已产生的 lane lifecycle artifact + payload，并在失败摘要之后生成 SHA256SUMS。晚期失败如果已有 summary，会显式 supersede；失败回执不会冒充成功。

## 真实成功证据

最终代码连续生成两轮完整证据：

| 项目 | 第一轮 | 第二轮 |
|---|---|---|
| runId | `r1-w002-final-head-86c92ff-20260821-a` | `r1-w002-final-head-86c92ff-20260821-b` |
| 目录 | `.run/evidence/r1_w002/final/r1-w002-final-head-86c92ff-20260821-a/` | `.run/evidence/r1_w002/final/r1-w002-final-head-86c92ff-20260821-b/` |
| 覆盖 | 村口 idle/moving + 训练场 idle/moving | 相同完整覆盖 |
| scene | `res://scenes/Main.tscn` | `res://scenes/Main.tscn` |
| video | 1280×720 / 30fps / 840 帧 / 28 秒 / H.264 + AAC | 相同 |
| video SHA-256 | `444a209ed424b0bccac76e5516c106e6f5093553ea5da3a7ead95f087aa889e4` | 相同 |
| contact sheet SHA-256 | `7cfef2eec80e772c35fea63ae57540dab8e2ce127306c124d7784ae480df980b` | 相同 |
| SHA256SUMS | 全部文件逐项 `OK` | 全部文件逐项 `OK` |

两轮的 8 个 segment 均满足：

- native 与 movie capture report 都为 `PASS`；
- moving 使用真实 `InputEventMouseButton`、`Input.parse_input_event`，press/release 跨帧且 player cell 确实改变；
- native/movie cleanup 都为 `PASS`，16 个 audio player 已 detach，manager 已释放；
- lane cleanup 为 `cleaned`、`laneAbsent=true`、`realUnchanged=true`；
- post-clean inspect 为 `laneRootState=absent`；
- owner review 状态继续为 `pending`。

两张 contact sheet 已人工检查，均显示村口和训练场的正常中文 HUD、静止与移动后构图，未出现黑帧、半渲染帧、认证/QA 面板或错误文字。本阶段只确认录片有效，不把画面质量冒充 OWNER 批准；道路、HUD 安全区和密度问题继续留给 W003–W005。

runId 中的 `head-86c92ff` 表示本轮开始时的干净候选基线；这两轮是被忽略目录内的 W002 工具可靠性证据，不冒充 W006 的最终 hash-bound OWNER 冻结。W003–W005 完成后，W006 会在其最终源码/资产 build identity 上重新生成正式材料。

## 失败与超时证据

### 有界真实超时

使用正式 Firebud recorder、真实 Godot 和 `--timeout-seconds 0.001` 触发 version preflight 超时：

- runId：`r1-w002-timeout-head-86c92ff-20260821-a`；
- 总耗时约 0.16 秒；
- leader exit `-15`，TERM 已发送，process group 已关闭，leader 已 reap；
- lifecycle 为 `cleaned_after_contained_timeout`；
- cleanup `laneAbsent=true`、`realUnchanged=true`；
- post-clean inspect 为 absent；
- failure-summary 为最终失败权威，嵌入 lifecycle，SHA256SUMS 全项通过。

### 可信产品失败

实现过程中，正式 recorder 曾在检测到真实 Ogg ObjectDB/resource leak 后走 trusted product failure：日志 validator 拒绝成功，lifecycle 为 `cleaned_after_trusted_product_failure`，owner-bound cleanup 删除 lane，post-clean inspect absent，玩家 inventory hash 不变，外层 failure-summary 与 SHA256SUMS 均生成。最终代码的 verbose 诊断又以硬件 RGB8 warning 有意触发同一失败分支，仍完成相同 lane 收尾。

单元测试还覆盖正常 nonzero、validator failure、attestation failure、残留进程组、verify 漂移、cleanup 失败、authority 写入失败和 contained timeout；只有可信产品失败与已完整 containment 的 timeout 可以清理，其他歧义继续保留车道。

## 玩家资料、车道与进程收尾

本阶段开始、真实超时、产品失败、两轮完整录片及最终 inspect 的真实玩家目录 inventory SHA-256 始终为：

`104ee36c7c1d93e9de2b64d959bdf2b7e285e9162f553181f4278f7eabb37899`

最终 `inspect-stale --lane automation` 为：authority absent、lane absent、runner absent、entry count 0。两轮成功的 8 个 lifecycle 共检查 32 个 version/help/native/movie process，全部 leader reaped、group closed、无 residual、无 timeout、无 signal/error。

进程检查没有任何本轮 `/opt/homebrew/bin/godot` 候选进程。系统中另有一个 2026-08-17 已启动、可执行来源不同的预存 Godot.app 进程；它早于本阶段且不属于本次 owner-bound recorder，未终止、未改动，也不计入本轮候选孤儿进程。

## 验证

以下验证均在隔离候选工作树执行：

1. Python recorder、lane 和共享消费者回归：

   ```text
   python3 -B -m unittest \
     tools.test.test_godot_qa_user_data_lane \
     tools.test.test_record_pet_management_owner_review \
     tools.test.test_record_firebud_v2_owner_review \
     tools.test.test_capture_npc_main_review \
     tools.test.test_run_firebud_v2_performance_evidence \
     tools.test.test_capture_map_awakened_perf \
     tools.test.test_capture_battle_layout_perf \
     tools.test.test_record_battle_layout_owner_review \
     tools.test.test_record_map_visual_action_captures \
     tools.test.test_record_pet_codex_awakened_owner_review \
     tools.test.test_record_world_hud_owner_review \
     tools.test.test_record_commerce_awakened_owner_review \
     tools.test.test_record_hang_matchmaking_world_hud_owner_review
   ```

   结果：`205/205 PASS`。覆盖 Firebud、共享 owner-review core、QA lane、NPC、地图/战斗性能、战斗布局、地图动作、宠物图鉴、世界 HUD、商业和挂机 HUD recorder。

2. Node QA runner 合同：

   ```text
   node --test tools/test/run_godot_auto_checks.test.mjs
   ```

   结果：`56/56 PASS`。

3. 隔离 Godot 解析：

   ```text
   node tools/run_godot_auto_checks.mjs --parse-only --output-dir .run/godot_auto_checks/r1_w002_parse_silent_visual
   ```

   结果：`1/1 PASS`。

4. 目标客户端回归：

   ```text
   node tools/run_godot_auto_checks.mjs --no-parse --only=--auto-map-visual-review-showcase-profile-check,--auto-firebud-village-service-layout-check,--auto-audio-runtime-check,--auto-movement-check --fail-fast --output-dir .run/godot_auto_checks/r1_w002_targets
   ```

   结果：`4/4 PASS`，automation lane 完整收尾。

5. 两轮真实 Main 正式录片：

   ```text
   python3 -B tools/record_firebud_v2_owner_review.py --bundle-id firebud_region_visual_v2 --output-root .run/evidence/r1_w002/after --run-id <runId> --sample-count 8 --timeout-seconds 120
   ```

   结果：连续 `2/2 PASS`，每轮四状态、8 次 Godot capture phase、最终媒体全解码和 SHA256SUMS 全通过。

6. 基础门禁：QA lane source contract、Python compile、`git diff --check` 均通过。

按仓库定向验证规则，本任务不是 release/export 总门禁，未重复运行完整 `tools/run_local_ci.mjs`。地图正常玩法、像素、binding、碰撞、寻路、warp、HUD 和 renderer 热路径均未改变，因此不伪造性能提升结论；真实 moving 画面已在两轮录片中覆盖。

## 生命周期、非目标与下一任务

Firebud v2 继续保持：

- `status=owner_review_pending`；
- `ownerReviewStatus=pending`；
- `releaseApproved=false`；
- `runtimeEnabled=false`；
- `releaseAttestation=null`；
- `ownerAcceptance=null`。

本阶段没有修改 bundle 像素、atlas、binding、地图 JSON、碰撞、spawn、warp、NPC、服务格、玩家 HUD 或普通运行时音频，也没有重建/冻结 W006 的最终 OWNER 证据。

下一任务是 `R1.W003 AUTO｜Firebud v2 道路、草地与广场过渡返工`。
