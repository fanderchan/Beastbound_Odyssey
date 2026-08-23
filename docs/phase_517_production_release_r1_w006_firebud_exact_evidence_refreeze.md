# Phase 517：生产发布 R1.W006 Firebud v2 精确返工证据重新冻结

日期：2026-08-23

## 目标与结论

本阶段只关闭 `R1.W006 AUTO｜Firebud v2 精确返工证据重新冻结`。在 W001–W005 已完成碰撞／哈希校正、真实 Main 录片收口、道路过渡、PC HUD 安全区和密度比例返工后，本轮基于同一份精确候选重新冻结两张地图各五种动作的正式 `Main.tscn` 截图／报告 pair、真实 Computer Use 前后帧与逐动作回执、完整 1280×720／30fps／1× 视频，以及带原始 runner 回执的 collision/catalog/performance 报告。

最终 bundle 离线审计检查 `165` 个文件、`91` 张 PNG 和 `17` 个 JSON，结果为 `status=PASS / errors=[]`。`releaseReady=false` 是正确结果，`missingReleaseGates` 精确只剩：

- `owner_acceptance`；
- `release_attestation`；
- `lifecycle_released_and_enabled`。

因此自动证据缺口已经关闭，但本阶段没有代替项目所有者做人眼批准，也没有生成 release attestation 或执行 promotion。Firebud v2 继续保持 `owner_review_pending`、`releaseApproved=false`、`runtimeEnabled=false`，普通玩家仍不可达。

## 精确候选与 supersede 边界

全部正式 runner 使用以下 build identity：

`git:dbfa838053e4da818648ac5ea19e4cbc074261ae+beastbound-map-runtime-surface-v2:113c6955df37a42f9c7765b129bc25403c25f2f9fa2b15e1b8f6430090a043e4`

权威地图与 binding 哈希继续为：

| 合同 | 训练场 | 村口 |
|---|---|---|
| v2 binding | `2775987fa144e2a7f337a03d871bcd835d176e9af7a5461024997a0e3aaed073` | `0a97650b8a8781f4831881cbf99adbc76d3a2287bdd08ef7aeaf17a15fb33252` |
| 权威 map JSON | `37279c76ff265927ef8eb042ed0b8460e34aa91687070aff14029307adc71c51` | `c27d3aff3791ececc7e0cf9ec952dd37361e23a358fa8b111d6939bc88f0fe05` |

本轮 active evidence 明确 supersede：

- Phase 481 在返工前冻结的旧 Firebud v2 动作、Computer Use、collision 和 performance 材料；
- Phase 511 项目所有者退回时展示的候选及其碰撞／录片缺口材料；
- W003–W005 为单项返工验收生成、但没有写入正式 manifest evidence slots 的阶段性图片和视频。

manifest 中的 `superseded*` 字段只保留旧哈希作为历史谱系，不再参与当前候选的 active evidence；`dressedReference`、`layeredPreview`、`runtimeScreenshots`、`computerUseReport`、`collisionAudit` 和 `performanceReport` 均已指向 W006 新材料。

本阶段没有重做或改写地图像素、atlas、binding、地图 JSON、NPC、服务、warp、spawn、碰撞、道路、HUD 或运行时渲染代码，也没有新增外部素材。来源与所有权继续沿用已冻结的 bundle provenance；变化只属于证据重新生成，以及把已随 W004/W005 构图失效的村口 Computer Use 动作点修正到当前可见物件。

## 两图十动作正式 Main pair

`tools/record_map_visual_action_captures.py` 以 runId `r1-w006-firebud-actions-20260823-a` 重新生成以下精确矩阵：

| 地图 | 动作 |
|---|---|
| `firebud_training_yard` | `pointer / movement_path / warp / collision / occlusion` |
| `firebud_village_gate` | `pointer / movement_path / warp / collision / occlusion` |

每项都有独立 1280×720 PNG 与 `beastbound_map_visual_main_review_capture` JSON；两项 pointer 为 idle，其余为 moving。moving 输入均使用跨帧真实 `InputEventMouseButton`，按下与抬起分别位于 process frame `9` 和 `11`。十张正式截图哈希互不重复，报告逐项证明正常玩家 HUD 可见、QA/debug 面板不可见、展示档案只在内存中、没有登录／网络请求／存档写入，并在退出前停止和 detached 全部音频流。

active manifest 现在使用：

- 村口 pointer 作为 `dressedReference`，SHA-256 `88f1411f3781a79e312315d6d1d1bde6bdcc914baa38b998aea33aa1782b5965`；
- 训练场 pointer 作为 `layeredPreview`，SHA-256 `50866c5681b585bf83229f1c287a18f84a50d81d8cec496e30a83b5ff68007cc`；
- 两张地图共十项作为 `runtimeScreenshots`，每项同时绑定对应 capture report 哈希。

## 真实 Computer Use 回执

十项动作均通过真实 `@oai/sky` 操作 bundle id `com.beastbound.review.firebud` 的 macOS Godot 窗口完成，不是脚本伪造的 Computer Use 文本。每项保留原始 640×392 窗口 before/after JPEG、点击坐标、等待时间、观察结论和逐行 JSONL 回执；安装器验证矩阵精确为 `2 × 5`、原始截图 `20` 张、十张 after 哈希全部唯一，并事务性写入正式 evidence slots。

W004/W005 改变安全构图后，旧配置仍声称点击当前镜头外的古树，已不能诚实证明村口碰撞和遮挡。本轮将其修正为当前可见的贸易柜台：

| 动作 | 当前输入 | 真实结果 |
|---|---|---|
| 村口 collision | 左键 `[425,165]`，贸易柜台基座 | 黄色路线改落到柜台右侧可行走邻格，角色不进入 `(4,10)`／`(5,10)` 两格 footprint，柜台与角色无穿透 |
| 村口 occlusion | 左键 `[390,120]`，柜台左后侧 | 角色沿真实路线到达后侧，柜台和货筐盖住下半身，头肩仍可辨，任务 HUD 不受影响 |

训练场 collision 继续证明路线从低木栅栏下端绕行，occlusion 继续证明补给陶罐的局部前景覆盖。村口与训练场的 pointer、movement、warp 则分别覆盖地图面板、主通道真实寻路和双向跨图／后续交互。

`computer-use-review.json` 结果为 `PASS`，无 blocker，正式 SHA-256 为 `5e293878cf70f121f0e6c3e694c246f9a362b1acaeaca9d30e3190f94e92c613`。

所有 Computer Use 运行都使用官方 `client1` QA user-data lane；每次退出均为 return code `0`，owner-bound verify 与 cleanup 通过，lane 和 pending/published lock 均消失，真实玩家 inventory SHA-256 保持不变。

## collision、catalog 与性能冻结

| 证据 | SHA-256 | 结论 |
|---|---|---|
| catalog contract | `3f09be532a8fd9df7c43fda803af4b2a3530fa5e8ba1e3e0eac700bd4440a6eb` | 精确冻结 v2 binding／map data 与 pending preview 合同 |
| collision/catalog 原始 runner | `59b17dde7dac2dfc3f13d2b0123929c04ea890806dc563392440686af08d9ea5` | 顶层与 v2 report `PASS / errors=[]`；primary v1 继续只在自身报告中按设计 fail closed |
| collision audit | `ec794b32b75599b00caadb48f117b0222c2442e3925f27815abe6bab2dd1a889` | blockedCells、47 个 footprint cell、path、spawn、warp、NPC approach、encounter 与哈希全部 PASS |
| performance 原始 runner | `aa36d0f86adc14932806e21b42e74b417f0dd635b1443f3badd84592381338df` | 8 次真实 Godot 运行与逐次 QA lane 回执 |
| performance report | `b9ae1c47590e5e231d2e533c85de0807b16342b07c2fb6d88ee10e2f7d5ba5b2` | 两图基线／候选 idle+moving 的四类阈值全部 PASS |

性能 runner 共执行 `legacy_fallback / map_visual_candidate × 两图 × idle / moving = 8` 次。所有样本保持 `60/60/60fps`，候选结果为：

| v2 场景 | process_total min/mean/max | 真实跨帧点击 | 相对基线均值增量 |
|---|---:|---:|---:|
| 训练场 idle | `0.260/0.294/0.320ms` | 不适用 | `+0.084ms` |
| 训练场 moving | `0.330/0.400/0.470ms` | `35` | `+0.107ms` |
| 村口 idle | `0.250/0.281/0.320ms` | 不适用 | `+0.039ms` |
| 村口 moving | `0.280/0.363/0.410ms` | `22` | `+0.098ms` |

两项 moving 均为 `moved=true / coalesced=true / settled=true / finalTargetMatched=true`，输入使用 `Input.parse_input_event` 且按下／抬起跨帧。八次 runner 均 `returncode=0`、`verified=true`、`realUnchanged=true`、`laneAbsentAfterCleanup=true`。

## 完整 1280×720 验收视频

最终目录：

`.run/evidence/r1_w006/video/r1-w006-firebud-review-20260823-a/`

视频继续使用真实 `res://scenes/Main.tscn`，固定覆盖村口／训练场 × idle／moving 四段：

- 1280×720、30fps、1.00×；
- H.264 `yuv420p` + AAC；
- `840` 帧、`28.0s`；
- 视频与音频流均完成 `ffmpeg -xerror` 全流解码；
- 四段 native 与 MovieWriter 均经过官方 automation QA lane，逐段清理且真实存档未变；
- 81 项 `SHA256SUMS` 全部校验通过。

| 视频材料 | SHA-256 |
|---|---|
| `summary.json` | `465a3edad46cedda064c2ca426e508cc79097d376e8cd26a69103f146d2e4771` |
| `SHA256SUMS` | `e1ea1d7c13f1f42669a5dd2bf04725da5b16364cbb8387fe017a245886319ddc` |
| 28 秒视频 | `f745df017c43aeed1107e1f87174d2826040ad3931e80ccef09f5d9437441435` |
| 8 帧 contact sheet | `41ff16d88ede107eb480aa32d3a2ab8adc187ee8445362cf49ae17ce83ad999e` |

逐帧抽检确认：道路草边过渡连续，村口服务簇与中央通行带可同时阅读；右侧任务栏不压住关键设施，底部 HUD 没有截断路线；训练场保持较低密度并有清楚的靶、围栏、陶罐和矿石层级。该判断只说明材料已达到再次提交 OWNER 人眼复验的条件，不构成 OWNER 批准。

## 验证

以下检查均在隔离候选工作树执行：

1. 两图十动作 Main 捕获：`10/10 PASS`，安装器为 `10 actions / 20 raw JPEG / 10 unique after hash / transaction committed`。
2. Computer Use 与 evidence 工具单元测试：`37/37 PASS`。
3. bundle auditor 单元测试：`17/17 PASS`。
4. Godot parse、movement、pathfinding、showcase profile、NPC interaction/collision、Firebud service layout、map transfer、encounter、quest marker：`10/10 PASS`。
5. 服务端共享地图／服务权限回归：`42/42 PASS`。
6. collision/catalog runner、collision audit、performance runner 与 performance report：全部 `PASS`；性能 `8/8 @ 60fps`。
7. 正式视频、ffprobe、全音视频解码与 81 项 SHA-256 清单：全部 `PASS`。
8. bundle 离线审计：`165 files / 91 PNG / 17 JSON / status=PASS / errors=[]`，只剩三个预期发布门禁。
9. Python compile、JSON parse、manifest 引用哈希、`git diff --check` 和孤儿进程检查通过；`.run` 生成物未进入版本控制。

本任务不是完整 release/export gate，没有重复运行 `node tools/run_local_ci.mjs`。目标玩法、服务端和真实 Main 路径已用更窄且直接相关的检查覆盖。

## 生命周期、非目标与下一任务

Firebud v2 最终保持：

- `status=owner_review_pending`；
- `ownerReviewStatus=pending`；
- `releaseApproved=false`；
- `runtimeEnabled=false`；
- `ownerAcceptance=null`；
- `releaseAttestation=null`。

本阶段没有创建批准、签名、发布、启用或玩家可达状态。下一任务是 `R1.W007 OWNER｜Firebud v2 返工后人眼复验`：必须向项目所有者展示本轮精确冻结材料并取得明确的批准、退回或延期结论；未明确批准不得执行 R1.02 promotion。
