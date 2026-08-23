# Phase 521：生产发布 R1.W010 Firebud v2 正式动作帧 HUD 字形稳定性

日期：2026-08-24

## 目标与结论

本阶段只关闭 `R1.W010 AUTO｜Firebud v2 正式动作帧 HUD 字形稳定性根因与修复`，不提前执行 W011 的正式证据重冻，也不生成 OWNER acceptance、release attestation 或候选 promotion。

复现结论不是单一的 Godot 字体故障，而是两种取证链问题叠加：

1. W009 联系表在连续展示高度相似帧时出现增量／差分式呈现，未变化的 HUD 像素在展示层看似消失；独立打开同一原始 PNG 或逐帧解码 MP4 时，页签、标题、正文和按钮仍存在。
2. W006 的旧 Computer Use `firebud_village_gate/warp/after` JPEG 本身确有缺陷：按钮区域只保留鼠标指针／不完整底图。它不能再被“区域里还有边缘”误判为字形完整。

旧 W009 视频 `840/840` 帧和 W006 runtime action PNG `10/10` 均通过独立像素复核，因此没有发现真实 runtime 字体、主题或 Canvas 重绘回归。本阶段没有替换字体、静态贴字、伪造文字或隐藏任务栏；修复集中在 viewport 取样、媒体解码、Computer Use 原图校验和单图审片板。

## 根因复现与失败样本

`tools/audit_firebud_hud_glyph_stability.py` 对每个源文件独立解码，不以聊天／工具中的连续预览作为像素权威：

- 原生截图必须是 `1280×720`；Computer Use `640×392` 先剥离 32px 窗口标题栏，再归一到 `1280×720`。
- 固定检查任务／组队页签、任务追踪标题、四条任务正文和自动寻路按钮四个区域。
- 静态图先检查 luminance edge energy；Computer Use after 帧还必须与对应 runtime action PNG 做归一化区域亮度 MAE 与相关性比较。
- 模板门槛为 `MAE <= 35.0` 且相关性 `>= 0.45`，避免鼠标轮廓、边框或噪声冒充按钮字形。

历史回放 run 为 `.run/evidence/r1_w010/r1-w010-root-cause-20260824-b/`。它按预期返回 FAIL，并保留完整报告：

- runtime PNG `10/10` 完整；旧 W009 四段视频 `840/840` 帧完整；`runtimeFontOrCanvasRegressionFound=false`。
- 旧 Computer Use after `9/10` 可接受，唯一失败是 `firebud_village_gate/warp/after` 的 `routeButton`。
- 该失败区域 `MAE=67.6698`、相关性 `-0.067872`，明确越过 `35.0 / 0.45` 门槛；同一帧的 tabs/title/body 仍通过。
- 报告 SHA-256 为 `5a46b69c4e6fecefa151f250d052a141dfd98bfdec014272b321608bb2653249`；18 张独立来源预合成的单图审片板 SHA-256 为 `f4dc48591219fd78d8640d359515bfdb1890ad76c15545a535b85d43e337f59d`。

这个预期失败证明新门禁不会再接受旧坏帧；W011 必须重新采集该 Computer Use 动作，不能复用 W006 哈希。

## 连续 viewport 与视频门禁

`MapVisualReviewCapture` 现在对 Firebud v2 在保存 PNG 前执行两层 fail-closed 检查：

1. 从真实 Control 节点核对 `任务 / 组队 / 任务追踪 / 自动寻路`，要求至少 4 个任务 Button、8 个非空 Label；这能区分“源文字不存在”和“源文字存在但像素没画出”。
2. 连续 6 个 process frame 各自等待 `RenderingServer.frame_post_draw`，独立读回完整 viewport，对四个 HUD 区域计算 edge energy，并保存 task HUD RGB SHA-256。任一帧、任一区域失败即不产出 PASS 截图。

Python recorder 同时要求报告中的 6 帧编号、process frame 单调递增、区域门槛、源文字和像素 SHA 完整。MovieWriter 转码后不再只抽样联系表，而是把每一个 MP4 帧的任务 HUD 解码为 RGB24 并逐帧检查；连续预览明确不是像素权威。

最终真实 Main run 为 `.run/evidence/r1_w010/r1-w010-hud-stability-20260824-b/`：

- `1280×720 / 30fps / 1.00× / 28.666667s / 860 frames`；视频 SHA-256 `318cd8e88576e19e2e7166cbe4fa766acff4bc3584d2bdef6e9499267b9cd2d7`。
- 村口 idle/moving 为 `206/224` 帧，训练场 idle/moving 为 `206/224` 帧；总计 `860/860` 逐帧通过。
- 每段 native 与 MovieWriter capture 各自 `6/6` 连续 viewport 帧通过，共另有 `48/48` 个原始读回样本。
- 四段最低 edge energy：tabs `137358`、title `89956`、body `1297336`、route button `48306`，均显著高于 `25000 / 15000 / 200000 / 7000` 门槛。
- 四个 QA lane 均 `cleanup.status=cleaned`、post-cleanup `inspected`，普通玩家目录未被使用；联系表 SHA-256 `df5e69e31ad100f3db443692a6ca9f7105b4d4f0ebc82255a5e74c510b2d7699`。

## 正式动作取证链收口

`record_map_visual_action_captures.py` 新增显式 `--scratch-only`：提交前可在 `.run` 运行完整动作矩阵，但不能与 resume 或正式 pending replacement 同用，也不会读取、覆盖或刷新 bundle 正式 evidence。每张 runtime PNG 都必须独立通过 HUD 像素门禁，最终只生成一张预合成 bitmap 供审片。

W009 的服务区重排同时暴露了旧取证器的职责冲突：村口正式移动动作会把镜头移向目标，不能继续要求远处的 14 名 NPC 在每个 action frame 中全员同屏。现在：

- default reel 与 pointer 继续承担村口 `14/14`、无 HUD 交叠、无视口裁边和邻近 warp 完整的静态构图门禁；
- movement/warp/collision/occlusion 继续要求玩家在安全区、玩家不与固定 HUD 相交、任务 HUD 可见、真实跨帧鼠标移动、目标精确到达和 HUD 连续字形稳定；
- 动作目标先用两格 collision/interaction 净空候选；W009 高密村口不足四个不同候选时，才补入“目标格自身无碰撞／交互”的不同可达格，并把 `targetClearance=exact_cell` 写入报告。地图 JSON、blockedCells、寻路和正常玩家规则没有变化。

最终 scratch matrix 为 `.run/evidence/map_visual_action_captures/firebud_region_visual_v2/r1-w010-action-matrix-20260824-d/`：

- 两图各 `pointer / movement_path / warp / collision / occlusion`，`10/10 PASS`；matrix SHA-256 `868c5c638bf3b621cc12831cf35c604001661dc5502e37113e5934091c087795`。
- 每个动作 `6/6` 连续 viewport 帧，共 `60/60`；单图板显示 10 份任务 HUD 标题、正文和按钮完整，SHA-256 `81498a3616976f2d41ede594d8c1e224adec0ef62ee453179dc8779eda630b02`。
- 训练场四个移动动作全部 `two_cell`；村口 movement 为 `two_cell`，warp/collision/occlusion 明确记录为 `exact_cell`。
- 10 个 QA lane 均清理，`scratchOnly=true / replacedPendingEvidence=false`；正式 runtime action、Computer Use、manifest 和 lifecycle 未改。

`install_firebud_computer_use_evidence.py` 已为 W011 接好事务门禁：非 pointer after JPEG 必须通过独立像素检查并与同动作 runtime PNG 模板相似；pointer 因打开全地图面板明确为 not applicable。8 张任务 HUD after 帧会预合成一张 `computer-use-hud-glyph-board.png`，其哈希进入报告和 receipt；任一失败时整个 pending evidence 事务回滚。

## 验证与性能

1. Python compile 与聚焦回归 `32/32 PASS`，覆盖空白 HUD、错误模板、连续视频逐帧、capture 报告、scratch-only 和 Computer Use installer 合同。
2. Godot headless parse PASS；movement、pathfinding、world presentation、showcase profile、NPC interaction、service layout、NPC collision、map transfer、encounter、NPC quest marker 共 10 个目标 flag PASS。
3. 通用 `--auto-map-visual-runtime-check` 仍按设计复现候选工作树既有的 v1 frozen report 与 staged v2 权威 mapData/footprint/hash 冲突；本轮未改 map、binding 或 catalog，失败日志保留在 `.run/godot_auto_checks/r1_w010_targeted_20260824_a/`，没有把它误报为 W010 回归或放宽检查。
4. 独立性能套件 `5/5 PASS`：idle `process_total median/p95/max=0.35/0.38/0.41ms`，moving `0.50/0.52/0.52ms`；真实 movement spam `35` 次输入、`max_input_us=6`、moved/coalesced/settled/final_match/screen_roundtrip 全为 true。QA lane 清理且普通玩家目录哈希不变。
5. `git diff --check` 通过；所有录片、动作和性能进程均已退出，没有遗留 Godot、recorder 或 QA lane 进程。

本任务不是完整 release/export gate，未运行 `node tools/run_local_ci.mjs`，也没有连接后端、MySQL 或真实玩家资料。

## 生命周期与下一任务

Firebud v2 继续严格保持：

- `status=owner_review_pending`；
- `ownerReviewStatus=pending`；
- `releaseApproved=false`；
- `runtimeEnabled=false`；
- `ownerAcceptance=null`；
- `releaseAttestation=null`。

W006/W009 的历史材料仍是根因与 superseded 证据，不能当作当前正式冻结。下一任务是 `R1.W011 AUTO｜Firebud v2 二次返工精确证据重新冻结`：必须用本阶段新增的 HUD 门禁重新生成两图十动作、真实 Computer Use、视频、collision/catalog/performance 和 manifest-bound 报告；本阶段没有提前执行它。
