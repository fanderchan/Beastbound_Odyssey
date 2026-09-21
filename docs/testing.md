# 测试与验证指南

先选最窄的验证，再按风险补充真实客户端、存储或发布门禁。命令默认从日常主目录运行；历史工作区说明见 [项目现状](project-status.md)。

## 选择验证范围

| 改了什么 | 最少要验证什么 |
| --- | --- |
| 文档与导航 | `git diff --check`、`repository_guide.mjs check` |
| Node 领域规则 | `node --check`、目标 `node --test`；有事务则加对应存储/失败测试 |
| HTTP 参数或路由 | 领域/参数测试、既有 HTTP 端到端回归和协议边界 |
| GDScript/资源 | 隔离 QA 解析及相关 `--auto-*-check` |
| UI、移动、世界、战斗播放、档案同步 | 上述检查 + 真实 Main 1280×720 + 修改前后静止/移动/相应压力证据 |
| 共享 JSON / 协议 / 持久实体 | 双端消费者、数据合同、迁移/存储、相关 UI 与权威路径 |
| 宠物/NPC/地图/音频资产 | 领域 Skill 全部要求、资源审计、真实路径、人工验收及生命周期 |
| 真正发布或阶段总门禁 | 对应工作区的完整 CI、必要外部环境及长期负载；普通迭代不默认跑全量 |

## 文档和工具

```sh
git diff --check
node --check tools/repository_guide.mjs
node --test tools/test/repository_guide.test.mjs
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
```

`check` 只检查生成索引时效和现行指南本地链接目标；不声称历史文章、标题锚点、外部 URL 或代码行为都正确。

## 服务端

以本轮 HTTP 模块整理为例：

```sh
node --check server/node/src/http-server.js
node --check server/node/src/http-list-options.js
node --test server/node/test/http-list-options.test.js server/node/test/auth-http-server.test.js
```

完整套件入口为 `npm --prefix server/node test`。具体领域文件从 [代码索引](reference/code-index.md) 或 `rg --files server/node/test` 选择；服务测试优先使用 memory/隔离 store，禁止以测试清理为理由重置玩家数据库。

## Godot 检查与工作区能力

先确认当前运行器支持的参数和已注册检查：

```sh
node tools/run_godot_auto_checks.mjs --help
node tools/run_godot_auto_checks.mjs --list
```

当前主目录已包含更新的隔离运行器，只做解析时：

```sh
node tools/run_godot_auto_checks.mjs --parse-only
```

按领域选择检查，例如认证契约：

```sh
node tools/run_godot_auto_checks.mjs --only --auto-auth-check --fail-fast --timeout-ms 180000
```

检查默认先执行基础解析；自定义 `--output-dir` 必须位于 `.run/godot_auto_checks/` 下。主目录是当前测试基线，旧工作区只供回溯。

不要从历史文章照搬裸 `godot --headless --quit` 到正常玩家资料目录。候选阶段已经证明它也可能轮转玩家日志、写入偏好。隔离车道失败时，先查相关 helper、进程和所有权；不能删掉玩家资料或绕过隔离来换取通过。

同屏角色外观复用现有 `--auto-map-visual-runtime-check`，其中包含四外观、八方向、节点复用、碰撞隔离及点击范围检查；再运行 `--auto-character-runtime-appearance-check` 与 `--auto-camera-click-check`。服务端使用 `online-player-appearance.test.js` 和 `online-presence.test.js` 检查权威投影及提交后广播，完整命令和前后性能见 [Phase 563](phase_563_remote_player_appearance.md)。正式联机验收仍需真实客户端操作。

地图美术检查中的生命周期关闭只证明候选素材没有加载，不能证明玩法地图不可进入。验证首发延期的地图内容时，需独立覆盖普通客户端入口／导航、无传送捷径的服务端合法行走与切图、已有角色位置恢复及相关任务／挂机路线；显式 review preview 不替代普通启动。当前岩脉四层仍可正常传送但回退到网格，实证与复现边界见 [Phase610](phase_610_map_content_and_art_access.md)。

## 联机 QA

Live 检查会创建账号或修改状态，只允许连接操作者明确创建的一次性本地 QA 后端。普通玩家的本机 MySQL 服务也不是默认的 QA 写入目标。

若相关检查需要任意坐标，仅在该一次性进程设置 `BEASTBOUND_ALLOW_POSITION_TELEPORT=1`；不用于 LAN、共享或生产。候选完整门禁还要求规范的 `127.0.0.1` origin、Beastbound 健康页与隔离 JSON store，详见 [Phase 510](phase_510_production_release_r0_09_clean_candidate_baseline.md)。

完整门禁和 QA 后端统一使用当前主目录的工具、固定矩阵与 QA lane；历史工作区的记录只用于对照。

岩脉守护战有专用的一次性全 HTTP 队伍入口：`python3 tools/play_guardian_review.py --autoplay`，可加 `--record` 留下 30 FPS 原速自动操作片。它运行真实 Main 并核对地之戒和档案版本，报告明确区分自动 viewport 输入、Computer Use 与最终美术接受。使用方式、QA 数值及数据边界见 [工具导航](../tools/README.md#岩脉守护战试玩)；不要改成连接普通玩家后端。

加 `--cave-journey --timeout-seconds 1800` 可继续自动走完三层、二层、一层和村口，处理途中普通遭遇；核对每层贴图／镜头、实际输入、权威胜利及逐回合完整播放。该模式使用明确的高生命路线队伍，不是难度或原生鼠标验收，见 [Phase 592](phase_592_cave_return_playthrough.md)。

手动操作省略 `--autoplay`。入口准备完成时只请求一次窗口激活；`state.json`／`states.ndjson` 的 `nativeWindow` 分别记录焦点、可绘制状态、渲染循环和绘制帧数。后台补绘也会增加帧数，不能据此判定窗口可操作；遇到旧截图，先核对状态时间与这些字段，不把录制成功当作鼠标通过。[Phase 594](phase_594_manual_cave_return_review.md) 保留了未完成返村和停画记录；[Phase 596](phase_596_manual_cave_return_completed.md) 已在新录制时钟下完成真实鼠标返村，实际结果含超时和逃跑，不冒充全胜，也不套用要求全胜的自动路线验证器。

人工 `--record` 会额外校验真实帧间距，避免固定步长在活动／不可绘制状态下快于操作人与服务器时间。自动回归及未录制入口不启用该限速；限速报告不得用于正式性能接受。实际前后对照与最小化恢复操作见 [Phase 595](phase_595_manual_recording_clock.md)。

## 真实客户端与性能

正常玩家体验入口：

```sh
godot --path client/godot --scene res://scenes/Main.tscn
```

该命令会打开窗口并使用正常玩家数据。自动审片/录制使用主目录的专用隔离入口，集中执行并保留低打扰窗口安排。工作区整合后如源贴图与导入结果不一致，应先在隔离 QA lane 中运行 Godot editor import，核对真实玩家目录未变并清理 lane，再重跑相应地图检查。

涉及热点的变更需记录：工作区与提交、场景、是否真实 Main、稳定段 `process_total`、进程 CPU、静止与移动、相关面板或输入压力、前后差异。鼠标连点/拖动必须跨帧发送真实输入，不能用同一帧调用 helper 代替。`ps` 与游戏探针不一致时应查原因。

健康目标是启动后低个位数 CPU 和亚毫秒级常态 `process_total`；特定门禁的容忍阈值不是新的正常性能目标。更晚候选的性能矩阵和历史结果见对应 Phase，不能作为本轮重新测量的结果。

地图表现对比使用 `python3 tools/run_map_visual_performance_evidence.py --help` 所列入口：每个 bundle 一个原生窗口，按矩阵重建 Main，窗口标题区分旧网格基线和当前美术候选。首次诊断使用 `--scratch-only` 和新 `--run-id`，避免覆盖正式证据；`--build-identity` 必须等于 `python3 tools/map_visual_evidence_builder.py identity` 输出的当前标识。在准备页点击“开始性能测试”后，保持窗口前台可见约 12 分钟。采样同时检查焦点、可绘制状态与实际绘制帧进度；失败后停止并清理，不继续抢焦点或强制绘制。原始采样完成与性能门槛通过是两件事：CLI 的 `raw_capture_and_cleanup` 结果还必须经过报告生成器和独立 bundle 审计器。固定步长 60 不能作为真实显示 FPS。当前可见性合同及真实拒绝记录见 [Phase 558](phase_558_native_performance_visibility.md)，矩阵与资源隔离设计见 [Phase 550](phase_550_single_window_map_performance.md)。

Computer Use 点击报错后，先分别读取最新 UI 状态和当前进程日志，确认动作是否已生效，再决定恢复操作；不要把 `noWindowsAvailable` 当作“点击没有发送”。一旦样本开始，停止追加 Raise、按键或点击。若已在测量期间加入额外操作，该批只作诊断，另开新批次取正式证据。明确检测到锁屏时等待用户手动解锁，不反复激活窗口。实际案例见 [Phase 574](phase_574_player_position_updates.md)。

准备页超时会输出 `map performance foreground unavailable:`，分别记录未收到开始请求、失焦、不可绘制及渲染循环关闭的观察次数，同时保留最后状态与实际绘制进度。先据此区分缺少点击与可见性问题，不把通用失败码直接解释为锁屏。该日志不改变开始门槛或提供自动开始方式，实际负例见 [Phase 593](phase_593_native_performance_diagnostics.md)。

正常时钟的进程 CPU、脚本区段耗时和实际绘制次数分别记录。[Phase 597](phase_597_idle_camera_render_diagnosis.md) 的静止相机消融在按需渲染下减少了绘制，属于独立诊断，未修改正式矩阵的逐帧绘制要求；不能将其样本导入正式性能回执，也不能把不可绘制或失焦当作收益。原型检查同时要求无脚本错误、预期用例数和非零实际帧数，不能只认 Godot 零退出码或 PASS 字符串。

分项回调计时用于定位，不能代替正式矩阵。临时包装节点必须保持原优先级和调用逻辑，记录实际帧数、焦点、可绘制状态、位置／排序及跨版本像素对照；它自身仍带测量开销。完整区段波动不应全部归因于某个查询，见 [Phase 600](phase_600_retained_actor_depth_state.md)。

Phase 601 起，当前 macOS 原生验收固定要求默认 `gl_compatibility / opengl3`，并核对引擎 OpenGL Compatibility 日志。旧 Mobile／Metal 回执仅作历史；显式切换后端的比较必须单独标为诊断，不能混入默认路径的正式矩阵。地图／战斗的性能阈值、VSync、连续绘制、真实跨帧输入与前台条件不变。后端变更须同步 QA feature 隔离合同、地图／战斗／录片工具及负例；融合录片还核对实际方法和驱动。普通静止与移动 CPU 分别记录，包含退步项；截图容差必须报告实际差异，不能把近似图片称为逐像素一致。详见 [渲染迁移与验证](phase_601_compatibility_renderer.md)。

世界按需渲染的生产回归纳入 `--auto-camera-check`：双视口相机对照之外，还检查真实 Main 的四层切换、首次跨帧鼠标移动、菜单及战斗往返。`Input.parse_input_event` 入队不等于宿主已收到输入；断言必须核对接收计数和首个已投递帧。普通运行允许静止时省略无变化的绘制；性能探针和审查捕获即使在启动后启用，也必须保持连续绘制，MovieWriter 则在启动时固定该要求。定长采样关闭统计不等于结束测试生命周期：从测量完成、音频清理到 Main 退出仍要连续绘制，见 [Phase 599](phase_599_performance_cleanup_rendering.md)。原有 VSync 策略分别保留，因此探针区段耗时不代表普通模式的整体节能收益。两种模式分别验证，不修改正式矩阵阈值，实测和复验见 [Phase 598](phase_598_world_idle_rendering.md)。

固定帧窗口结束后的 `perf probe runtime timing:` 将模拟 delta 与单调时钟实际间隔分开，详见 [Phase 562](phase_562_runtime_probe_wall_clock.md)。`wallProcessFramesPerSecond` 是处理帧率，不是显示 FPS 或 CPU 百分比；配置 `Engine.max_fps=30` 也不证明限帧有效，`--fixed-fps` 会跳过通常的等待。外部 runner 的 argv 才是引擎启动选项的依据。正常运行的 CPU/FPS 检查必须保留正常帧预算、VSync 和前台绘制条件，单独记录稳态进程占用；不能用固定步长压力运行的瞬时 CPU 替代。新增 timing 不改变既有性能门槛。

截图审计保留录制时的原始提交号；后续仅提交文档/证据时，只要运行内容指纹相同且原提交是当前 HEAD 的祖先，就不要求无意义地重录。运行内容、工具源码、素材或录制表面真的变化时仍必须重证，不能手改旧回执的提交号。该边界及真实 Git 回归见 [Phase 551](phase_551_map_evidence_commit_provenance.md)。

20 actor 原生固定场景使用 `python3 tools/capture_battle_layout_perf.py`，包含静止、指令选择和跨帧目标切换。此夹具会显式启用普通 PC 的 VSync；通用 `--perf-probe` 的无 VSync 设置保留给其他探针。窗口失焦应保留失败回执并标明不可作合格前后对比，不要放宽焦点门禁。首次切战的 `battle preparation probe` 只写探针日志，区分人物、宠物、剩余准备时间及后台预取队列。最新合格前台证据见 [Phase 549](phase_549_battle_texture_prefetch_and_github_sync.md)，联网结算回归见 [Phase 548](phase_548_battle_hotpaths_and_authoritative_completion.md)。

`--auto-battle-formation-check` 也覆盖贴图预取的并发/总量限制、去重、切图清理、失败和权限边界。无窗口环境明确保留同步加载，避免 Dummy 渲染器线程纹理问题；headless PASS 不能代替后台读取的原生验证。使用 `tools/play_guardian_review.py --autoplay --timeout-seconds 360` 检查真实预取完成数、首次切战时间和完整权威结算，不能给脚本额外插入等待来制造预取已完成的结果。

## 发布门禁和收尾

`node tools/run_local_ci.mjs` 只用于真实阶段/发布门禁或明确要求。当前主目录已包含 R0.09 固定矩阵，执行前仍要核对 `--help`、源代码和对应 Phase。Phase 510 的历史全绿证明候选当时通过，不证明当前脏工作区或生产环境通过。

每次验证记录精确命令、结果、skip 原因、没有覆盖的风险。结束后关闭本次创建的服务器、Godot 和子进程，核对 QA lane 和临时端口；不停止原先由用户运行的进程，不改真实玩家档案来清场。

旧性能数字和历史测试记录保留在 [整理前测试手册](bak/handbooks_20260917/testing.md)。
