# Phase 508：生产发布 R0.07 真实客户端基线与性能证据

## 目标与结论

本阶段只执行 `R0.07 AUTO｜真实客户端基线与性能证据`：从真实 `res://scenes/Main.tscn`、PC 首发 `1280×720` 路径验证登录、角色创建与进入、移动、背包、宠物、地图、NPC、战斗、返回世界和退出收尾，并为世界静止/移动与 10v10 战斗交互冻结可复核性能证据。

结论：**R0.07 通过**。本轮修复了真实 live 夹具与当前“四空槽、显式建角、显式选角”合同的漂移，补齐了服务端事件证据和共享媒体录制车道的进程所有权，最终取得：

- 本地 QA 后端连续 live 矩阵 `8 selected / 8 completed / 8 passed / 0 failed`；
- Firebud 两张地图、发布 v1 与待审 v2、静止与真实跨帧移动共 `8/8` 性能记录通过；
- 10v10 战斗静止、指令选择、目标切换共 `21/21` 性能门禁通过；
- 世界 HUD 44.3 秒视频、战斗 13.533 秒视频和首批 8 个 NPC 的真实 Main 截图包均生成并通过结构/日志/隔离门禁；
- 最终 Python `152/152`、Node `52/52`、隔离 Godot 4.7 parse-only `1/1`、QA 源合同和补丁格式检查通过；本地后端、Godot 进程与三个固定 QA 车道全部收尾。

这些证据只证明当前候选的功能基线、交互可达性和性能健康，不代表 Firebud v2、NPC、美术或战斗视觉已获项目所有者批准。所有 `owner_review_pending` 状态保持不变，生产发布结论仍为 `BLOCKED`。

## 首次失败与修复

### 真实 live 角色合同漂移

真实认证检查仍把注册后的账号当作已有活动角色，无法在当前四空槽合同下稳定进入需要角色会话的移动和战斗路径。修复遵守生产行为，不恢复隐式建角：

1. live 认证先精确验证四个空槽，再通过真实角色入口创建并选中角色；
2. startup login 夹具在空 roster 时显式创建完整槽 0 角色，已有 roster 时保持不变；
3. 移动、战斗回合和离开检查各自显式准备角色会话，不依赖前一检查的副作用；
4. live 服务地址从受控环境变量读取，所有本轮 live 检查只连接 `127.0.0.1:8787` 的本地 JSON QA 后端；
5. 服务端事件证据覆盖本轮需要事件流的 live 检查，战斗回合结果使用唯一 `room_id` 字段并序列化事件，避免重复字段掩盖证据。

生产账号、角色槽、服务端权威写入和普通玩家 UI 语义均未放宽。

### 共享录制器隔离合同

旧 NPC Main 录制器可接收任意 `--user-data-dir`，并在正式隔离车道建立前执行一次无隔离 `godot --import`。本轮将它迁移到与世界 HUD、宠物和战斗录制器相同的固定车道核心：

- 只允许仓库声明的 `automation/client1/client2` 车道，调用者不能提供任意目录；
- schema-v2 owner 记录绑定父 runner PID 与启动身份，运行前后验证源码摘要、车道证明、进程组闭合和 cleanup；
- 删除无隔离 import 预检，由真实 Main 启动完成导入，并以 `importFresh` 与严格 Godot 日志门禁判定；
- 每个 NPC capture 必须且只能产生一个成功 JSON 标记，任何错误、警告、泄漏或重复标记均 fail closed；
- 首批 8 个 NPC 的期待朝向按当前权威 Firebud v2 地图精确冻结，没有放宽为“任意方向通过”。

收尾时又确认裸跑 `godot --headless --path client/godot --quit` 也会使用普通玩家目录并改写日志/偏好。因此运行器新增互斥的 `--parse-only` 模式，只执行基础解析但仍完整使用固定 QA 车道、进程组和 cleanup；仓库验证规则也已切换到该入口。

NPC 工作仍保持 `npcId` 的名字/地图/对话职责与 `appearanceId` 的共享外观职责分离；本轮只修录制与验证路径，没有新增、替换或批准 NPC 资产。

## 功能证据

### 本地在线真实客户端矩阵

本地 QA 后端使用隔离 JSON store 和仅限 QA 的位置能力；客户端全部从 `Main.tscn` 启动。最终摘要：

```text
.run/godot_auto_checks/r0_07_live_pass/2026-08-19T23-08-01-092Z_summary.json
runnerStatus=passed complete=true
selected=8 completed=8 passed=8 failed=0 skipped=0
processGroupsClosed=true qaLaneCleanup.status=cleaned
```

矩阵包含 Godot 解析，以及：

- `--auto-auth-server-live-check`
- `--auto-startup-login-check`
- `--auto-character-entry-live-check`
- `--auto-server-movement-live-check`
- `--auto-server-battle-turn-live-check`
- `--auto-server-battle-return-check`
- `--auto-server-battle-leave-ui-live-check`

因此登录、四空槽、建角、选角、档案/背包读取、移动接受与拒绝、战斗邀请/回合/返回/离开均由本地服务端真实往返证明，而不是同帧 helper 或离线伪响应。

### 世界 HUD、背包、宠物与地图

世界 HUD 录制证据：

```text
.run/evidence/r0_07/world_hud/r0-07-world-hud-20260820-c/summary.json
.run/evidence/r0_07/world_hud/r0-07-world-hud-20260820-c/world-hud-owner-review-1x.mp4
```

结果为 `passed`：`1280×720`、30 FPS、44.3 秒、1329 帧，包含真实跨帧左键点击和世界移动，依次覆盖完整 HUD、顶部地图、地图面板、人物、背包、宠物、任务、队伍、聊天、更多菜单、收起与恢复。12 帧 contact sheet 已人工检查，没有发现明显裁切、死区或玩家可见 QA/debug 文案；视觉所有者状态仍为 `pending`。

### NPC

首批 8 个正式 NPC archetype 在真实 Main、正常玩家 UI 中逐个打开对话并显示世界精灵与肖像：

```text
.run/evidence/r0_07/npc_main/r0-07-npc-main-20260820-c/evidence-index.json
schemaVersion=2 status=passed targetBatch=first8
captures=8 framesPerCapture=12 indexedFileCount=56
```

8 次 capture 均使用官方 `automation` 车道，逐次 `cleanup.status=cleaned`、`realUnchanged=true`。截图已逐张检查，未见 QA/debug 控件；当前普通玩家仍显示已发布 Firebud v1，待审 Firebud v2 不因录制而偷跑。NPC 造型、真八方向与地图整体风格的最终判断继续留在 R1 所有者验收。

## 性能证据

### Firebud 世界静止与移动

Phase 399 的旧发布态 runner 正确拒绝待审 Firebud v2；这不是性能失败，而是 Phase 481 生命周期门禁在所有者批准前按设计 fail closed。本轮随后使用 v2 专用候选性能 runner，同时保留 v1 对照：

```text
.run/evidence/r0_07/firebud_perf/r0-07-firebud-perf-20260820-a/summary.json
status=passed expectedRuns=8 ownerReviewStatus=pending
```

| 地图 | 状态 | 候选 v2 FPS | `process_total` min/mean/max | 真实移动点击 |
|---|---:|---:|---:|---:|
| 村口 | 静止 | 60 | `0.36 / 0.399 / 0.45 ms` | 0 |
| 村口 | 移动 | 60 | `0.36 / 0.490 / 0.63 ms` | 111 |
| 训练场 | 静止 | 60 | `0.32 / 0.390 / 0.44 ms` | 0 |
| 训练场 | 移动 | 60 | `0.21 / 0.377 / 0.55 ms` | 86 |

两个地图的 v1/v2、idle/moving 共 8 个组合全部为 60 FPS，没有发现需要在 R0.07 继续修复的世界热路径。

### 10v10 战斗

性能摘要：

```text
.run/evidence/r0_07/battle_perf/r0-07-battle-perf-20260820-a/summary.json
status=passed gates=21/21 actors=20 actualLeftClicks=25
```

| 状态 | 最低 FPS | `process_total` median/p95 | `draw_battle` median/p95 |
|---|---:|---:|---:|
| 静止 | 60.0 | `0.100 / 0.110 ms` | `4.155 / 4.280 ms` |
| 指令选择 | 59.5 | `0.105 / 0.130 ms` | `4.035 / 4.480 ms` |
| 目标切换 | 59.0 | `0.095 / 0.110 ms` | `4.155 / 4.830 ms` |

20 个 actor、完整 10v10 阵型、25 次真实跨帧点击、HUD 碰撞和 viewport 越界均通过。对应视觉视频：

```text
.run/evidence/r0_07/battle_visual/r0-07-battle-visual-20260820-a/summary.json
.run/evidence/r0_07/battle_visual/r0-07-battle-visual-20260820-a/phase403-battle-layout-owner-review-1x.mp4
```

视频为 `1280×720`、30 FPS、13.533 秒、406 帧，含音频与 5 次真实点击；contact sheet 已检查，阵型和交互清楚，所有者状态仍为 `pending`。

## 玩家数据与进程边界

本阶段开始时真实 Godot 用户目录清单为 696 项，SHA-256 为：

```text
313debc60d2641f8aaa70e34c34f637949c622a30f7c8e54ca0b953d73bf719c
```

旧 NPC 录制器第一次尝试在隔离门禁拒绝任意 user-data 参数前执行了无隔离 import，真实目录哈希因此变化。只做路径、时间和大小的元数据核验后，第一次变化定位为两个 Godot 日志文件的轮转：`logs/godot.log` 与一个带时间戳的 Godot log；最近窗口内没有观察到账号或档案路径变化。本轮没有读取、删除或回滚这些日志，也没有把旧哈希伪装为未变化。

修复录制器后，8 次官方 NPC capture 保持 696 项和下列 SHA-256 不变：

```text
cfb37ab00ac3edfd952f090daa5658425ce44d8177bf832d1a8a8d28390bcdaf
```

随后按旧仓库规则直接执行一次裸 Godot 无头解析，清单再次变化。纯元数据核验显示这次发生了 Godot 日志轮转，并更新了 `beastbound_audio_settings.json`；这说明裸 parse 并非对普通玩家目录只读。本轮仍未读取或擅自回滚该偏好文件，也没有观察到账号、角色、进度或其他档案路径变化。为避免复发，本轮增加并实跑固定 QA 车道的 `--parse-only`，最终真实目录仍为 696 项，稳定 SHA-256 为：

```text
fbff2a0ac07e24126993c0183c37a5c564af15e01e83a99d3ee40fa8f708cd9d
```

安全 parse-only 的摘要为 `.run/godot_auto_checks/r0_07_parse_only/2026-08-19T23-36-11-411Z_summary.json`：`1/1 passed`、`processGroupsClosed=true`、`qaLaneCleanup.status=cleaned`、`realUnchanged=true`。最终收尾时：

- `127.0.0.1:8787` 无监听；
- 无候选后端或 Godot 进程；
- `automation`、`client1`、`client2` 三个固定 QA 车道均为 absent；
- 未访问 MySQL，未触碰正式服务器或共享/LAN 后端。

## 最终验证

```bash
python3 -B -m unittest \
  tools.test.test_godot_qa_user_data_lane \
  tools.test.test_record_pet_management_owner_review \
  tools.test.test_capture_npc_main_review \
  tools.test.test_run_firebud_v2_performance_evidence \
  tools.test.test_capture_battle_layout_perf \
  tools.test.test_record_battle_layout_owner_review
node --test tools/test/run_godot_auto_checks.test.mjs
python3 -B tools/godot_qa_user_data_lane.py source-check
node tools/run_godot_auto_checks.mjs \
  --parse-only \
  --output-dir .run/godot_auto_checks/r0_07_parse_only
git diff --check
```

结果：

- Python：`152 tests / OK`；
- Node：`52 tests / 52 pass / 0 fail`；
- QA 源合同：`source_contract_passed`；
- Godot：`4.7.stable.official.5b4e0cb0f`，隔离 parse-only `1/1 passed`，真实目录哈希不变；
- `git diff --check`：通过。

没有重复运行完整服务端套件或 `tools/run_local_ci.mjs`：紧邻 R0.05 已冻结完整服务端零失败门禁，本阶段改动集中于客户端 live QA、运行器和证据录制，以上目标套件是更窄且直接的回归集合。

## 非目标与剩余风险

- 本轮没有批准或 promotion Firebud v2、NPC、战斗背景、宠物、融合、音频或其他视觉候选；它们继续进入 R1 分项所有者验收；
- 当前已发布 Firebud v1 与待审 v2 的生命周期差异仍存在，严格普通运行时/地图面板检查要等 R1.01 明确批准后转绿；
- 性能数据来自当前 Apple M5、macOS Metal、`1280×720`、60 Hz 环境，不能替代 R8 的正式构建机门禁和 R9 的目标低端机/长时间 SOAK；
- 本轮不提前完成 R0.08–R0.09，不更新 `stoneage_gap_plan.md`，也不改变生产发布结论。

下一任务：`R0.08 AUTO｜候选源码卫生与可复现报告`。
