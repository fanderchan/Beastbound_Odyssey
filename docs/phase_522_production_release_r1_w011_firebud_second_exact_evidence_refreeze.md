# Phase 522：生产发布 R1.W011 Firebud v2 二次返工精确证据重新冻结

日期：2026-08-25

## 目标与结论

本阶段只关闭 `R1.W011 AUTO｜Firebud v2 二次返工精确证据重新冻结`。在 W008 重新创作道路／广场过渡、W009 收敛村口服务区与 HUD 边缘构图、W010 建立任务 HUD 连续像素门禁后，本轮基于同一份最终候选重新冻结：

- 火芽村口与火芽训练场各 `pointer / movement_path / warp / collision / occlusion` 五种动作的独立真实 `Main.tscn` 截图／报告 pair；
- 十项真实 Computer Use 前后帧与逐动作 receipt；
- 完整 1280×720、30fps、1× 的四段审片视频；
- catalog/collision/performance 原始 runner 回执及 manifest-bound 报告。

最终 bundle 离线审计检查 `189` 个文件、`112` 张 PNG 和 `17` 个 JSON，结果为 `status=PASS / errors=[]`。`releaseReady=false` 是正确结果，`missingReleaseGates` 精确只剩：

- `lifecycle_released_and_enabled`；
- `owner_acceptance`；
- `release_attestation`。

因此 W011 的自动证据缺口已经关闭，但本阶段没有代替项目所有者做人眼批准，没有生成 release attestation，也没有执行 promotion。Firebud v2 继续保持 `owner_review_pending / pending / false / false`，普通玩家仍不可达。

## 精确候选与 W006 supersede 边界

全部正式 collision/performance 报告使用以下运行面身份：

`git:2d10a1ea4940e862d4076c98602536694741967a+beastbound-map-runtime-surface-v2:54e808197de5909227febeff931d631551c76b4ab48af7238dd11e59320b140d`

当前 catalog contract SHA-256 为 `b997d23bca7235d487af8139d0e4593f16902fca34efd55767e439e46375e9f9`，权威 binding／map data 哈希为：

| 合同 | 训练场 | 村口 |
|---|---|---|
| v2 binding | `2775987fa144e2a7f337a03d871bcd835d176e9af7a5461024997a0e3aaed073` | `571a65eaa75888488883c9a9b00cf2ba40ec17e1aefc408cabd06b7718f27afa` |
| 权威 map JSON | `37279c76ff265927ef8eb042ed0b8460e34aa91687070aff14029307adc71c51` | `0056603ae7b9b748858ec2d800a684b504af2a24c3dd9c4b7dd85436482dbc1f` |

本轮 active evidence 明确 supersede Phase 517 / W006 的正式截图、Computer Use、collision 与 performance 材料。manifest 的六类 `superseded*` 字段只保留旧 SHA 作为历史谱系；`dressedReference`、`layeredPreview`、`runtimeScreenshots`、`computerUseReport`、`collisionAudit` 和 `performanceReport` 全部指向 W011 新材料。旧 R1.01、W007 决定或 W006 哈希均不能证明本轮新像素已被项目所有者接受。

本阶段没有修改 atlas、运行时地图像素、binding、地图 JSON、NPC／服务、warp／spawn、碰撞或渲染代码。源代码变更只修正 Computer Use 安装器中随 W009 构图变化而失效的真实操作点和相应测试；这些点必须证明当前画面，不能沿用已经会打开错误对话或不再对应目标物件的旧坐标。

## 两图十动作正式 Main pair

`tools/record_map_visual_action_captures.py` 使用 runId `r1-w011-firebud-actions-20260825-a` 生成固定 `2 × 5` 矩阵。十项均为 `result=PASS`，十张 1280×720 PNG 哈希互不重复；pointer 为 idle，其余八项为 moving，并继续使用跨帧真实鼠标输入。

每份 capture report 同时验证真实 Control 文案与连续六个 viewport RGB 帧中的任务页签、标题、任务正文和自动寻路按钮。最终为 `10/10` 报告、`60/60` 连续帧通过，无缺失区域。单一预合成 runtime 审片板 SHA-256 为 `f5760fb48a9b357e1af36f54da7abb3eeaba7952fa33fdd59ccf823ca0d4d69b`，不接受增量预览帧充当像素权威。

active manifest 现在使用：

- 村口 pointer 作为 `dressedReference`，SHA-256 `6dd2f124c4e9c0b406692a44a0ff95242f607098460007ff433c780101eaa95e`；
- 训练场 pointer 作为 `layeredPreview`，SHA-256 `b36aee1650f272cf79738178767c6d158d81ecdec766ef2f323ec6245d712feb`；
- 两张地图共十项作为 `runtimeScreenshots`，每项同时绑定对应 capture report 哈希。

所有运行均使用官方 automation QA user-data lane；逐次 cleanup 证明 lane 消失、真实玩家 inventory SHA-256 未变，日志不含错误、警告或资源泄漏。

## 真实 Computer Use 回执

十项操作均由真实 `@oai/sky` 控制 bundle id `com.beastbound.review.firebud` 的 Godot 窗口完成。正式 evidence 保留 `20` 张原始 640×392 before/after JPEG、十份逐动作 JSONL receipt；十张 after 哈希互不重复，十项均为 `PASS`。

真实操作发现 W009 后若继续复用 W006 坐标，会出现村口 movement 打开 NPC 对话、村口 warp 最终按钮为空，以及训练场碰撞／遮挡不再对应原描述物件的问题。本轮据当前构图修正为：

| 动作 | 当前真实输入与观察 |
|---|---|
| 训练场 collision | 点击 `[102,146]` 低木栅栏左侧可行走邻格；角色停在显式 footprint 外且无穿透 |
| 训练场 occlusion | 点击 `[133,130]` 低木栅栏后侧；横杆／立柱只遮住下半身，头肩仍可辨 |
| 村口 movement | 点击 `[39,355]` 西南草地；路线避开 NPC、记录图腾与花箱，不打开对话或服务面板 |
| 村口 warp | 点击 `[550,262]` 主线自动寻路回到训练场，再点击 `[430,297]` 离开训练师对话；最终任务正文与按钮完整 |
| 村口 collision | 点击 `[132,246]` 服务簇西南侧可行走格；路线绕开 NPC、图腾与花箱 footprint |
| 村口 occlusion | 点击 `[323,250]` 记录图腾后侧；石柱与标牌形成局部下半身遮挡且不侵入 HUD |

`computer-use-review.json` SHA-256 为 `6d3134bb5fdb7264edb81670a0b548786db296ce1f5e0f78791dde6c6dab9fad`，正式 Computer Use HUD 审片板 SHA-256 为 `f77b4a967955af7ab3386e1137ed46953b3d5b029a9ade355aa2f9b4cce25843`。八张非 pointer after 帧均通过 runtime 模板 MAE／相关性与字形区域门禁；两张 pointer 证明完整地图面板，按合同不要求任务 HUD。

## catalog、collision 与性能冻结

| 证据 | SHA-256 | 结论 |
|---|---|---|
| catalog contract | `b997d23bca7235d487af8139d0e4593f16902fca34efd55767e439e46375e9f9` | 两图 current hash、normal lifecycle 与显式 pending preview 合同 `PASS / errors=[]` |
| collision/catalog 原始 runner | `b502f4e119b1b4b1862f73dc0939386c73bad99b3eab7241e6e3ceec83f22dad` | 顶层与 Firebud v2 报告 PASS；primary v1 继续只在自身报告中按设计 fail closed |
| collision audit | `0fb6b79e683cfca703267e4f2eece2bd0bd52dac39403346fa6dc4a2fc862a98` | blockedCells、footprint、路径、spawn、warp、NPC approach、encounter 与哈希全部 PASS |
| performance 原始 runner | `a1a9251ede850097efcefcdb356b3fc9f791cd09e4d213ad50172ff548dc1109` | 8 次真实 Main Metal 运行与逐次 QA lane 回执 |
| performance report | `c2b55eb24b19ec4fd02a4d344a680282c61c452ab83c648fc061ab36b8a42521` | 两图基线／候选 idle+moving 的四类阈值全部 PASS |

性能 runner 执行 `legacy_fallback / map_visual_candidate × 两图 × idle / moving = 8` 次。所有样本保持 `60/60/60fps`，候选结果为：

| v2 场景 | process_total min/mean/max | 真实跨帧点击 | 相对基线均值增量 |
|---|---:|---:|---:|
| 训练场 idle | `0.210/0.269/0.310ms` | 不适用 | `+0.073ms` |
| 训练场 moving | `0.340/0.405/0.470ms` | `48` | `+0.115ms` |
| 村口 idle | `0.210/0.244/0.280ms` | 不适用 | `+0.024ms` |
| 村口 moving | `0.340/0.420/0.500ms` | `24` | `+0.193ms` |

两项 moving 均为 `moved=true / coalesced=true / settled=true / finalTargetMatched=true / battle=false / encounter=false`。候选 idle/moving 绝对门槛与相对基线回归门槛全部 PASS。

## 完整 1280×720 验收视频

最终目录：

`.run/evidence/r1_w011/video/r1-w011-firebud-review-20260825-a/`

视频使用真实 `res://scenes/Main.tscn`，固定覆盖村口／训练场 × idle／moving 四段：

- 1280×720、30fps、1.00×；
- H.264 `yuv420p` + AAC；
- `860` 帧、`28.666667s`；
- 视频与音频流均通过 `ffmpeg -xerror` 全流解码；
- `860/860` 帧任务 HUD 区域门禁通过；
- 四段均使用官方 automation QA lane，逐段清理且真实存档未变；
- `81/81` 项 `SHA256SUMS` 校验通过。

| 视频材料 | SHA-256 |
|---|---|
| `summary.json` | `0e8ffe496c1d07786bfdf687a2035e537b5d03baaa931fade0ec91be85e13258` |
| `SHA256SUMS` | `7dfd052e5aefe89b0ec60712165ba214b80ce344780b86fa55985141db545d00` |
| 28.67 秒视频 | `318cd8e88576e19e2e7166cbe4fa766acff4bc3584d2bdef6e9499267b9cd2d7` |
| 8 帧 contact sheet | `df5e69e31ad100f3db443692a6ca9f7105b4d4f0ebc82255a5e74c510b2d7699` |

联系表可清楚复核 W008 的道路／广场过渡、W009 的服务区与 HUD 安全构图、训练场较低密度以及两图完整任务栏。该结论只说明新材料已经具备提交 W012 人眼复验的条件，不构成项目所有者批准。

## 验证

以下检查均在隔离候选工作树执行：

1. 两图十动作 Main 捕获：`10/10 PASS`、十张截图哈希互异、任务 HUD 连续读回 `60/60 PASS`。
2. 真实 Computer Use：`10/10 PASS`、`20` 张 raw JPEG、`10` 个唯一 after 哈希，正式报告和审片板绑定 manifest。
3. evidence／录片／HUD／性能工具单元测试：`64/64 PASS`。
4. bundle auditor 单元测试：`17/17 PASS`。
5. Godot parse、movement、pathfinding、showcase profile、NPC interaction、Firebud service layout、NPC collision、map transfer、encounter 与 NPC quest marker：`10/10 PASS`。
6. 服务端共享地图／服务权限回归：`42/42 PASS`。
7. collision/catalog runner、collision audit、performance runner 与 performance report：全部 `PASS`；性能 `8/8 @ 60fps`。
8. 正式视频、ffprobe、全音视频解码与 `81/81` 项 SHA-256 清单：全部 `PASS`。
9. bundle 离线审计：`189 files / 112 PNG / 17 JSON / status=PASS / errors=[]`，只剩三个预期发布门禁。
10. Python compile、bundle JSON parse、manifest 引用哈希、`git diff --check` 和本轮孤儿进程检查通过；`.run` 生成物未进入版本控制。

本任务不是完整 release/export gate，没有重复运行 `node tools/run_local_ci.mjs`。目标地图、真实 Main、输入、服务、证据和性能合同已由更窄且直接相关的检查覆盖。

## 生命周期、非目标与下一任务

Firebud v2 最终保持：

- `status=owner_review_pending`；
- `ownerReviewStatus=pending`；
- `releaseApproved=false`；
- `runtimeEnabled=false`；
- `ownerAcceptance=null`；
- `releaseAttestation=null`。

本阶段没有创建批准、签名、发布、启用或玩家可达状态。下一任务是 `R1.W012 OWNER｜Firebud v2 二次返工后人眼复验`：必须向项目所有者展示本轮新冻结哈希的静止、移动、道路／广场、服务区、完整任务 HUD、warp、碰撞、遮挡与性能材料，并取得明确的批准、退回或首发延期结论；未明确批准不得执行 R1.02 promotion。
