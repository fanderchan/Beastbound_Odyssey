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

## 联机 QA

Live 检查会创建账号或修改状态，只允许连接操作者明确创建的一次性本地 QA 后端。普通玩家的本机 MySQL 服务也不是默认的 QA 写入目标。

若相关检查需要任意坐标，仅在该一次性进程设置 `BEASTBOUND_ALLOW_POSITION_TELEPORT=1`；不用于 LAN、共享或生产。候选完整门禁还要求规范的 `127.0.0.1` origin、Beastbound 健康页与隔离 JSON store，详见 [Phase 510](phase_510_production_release_r0_09_clean_candidate_baseline.md)。

完整门禁和 QA 后端统一使用当前主目录的工具、固定矩阵与 QA lane；历史工作区的记录只用于对照。

岩脉守护战有专用的一次性全 HTTP 队伍入口：`python3 tools/play_guardian_review.py --autoplay`，可加 `--record` 留下 30 FPS 原速自动操作片。它运行真实 Main 并核对地之戒和档案版本，报告明确区分自动 viewport 输入、Computer Use 与最终美术接受。使用方式、QA 数值及数据边界见 [工具导航](../tools/README.md#岩脉守护战试玩)；不要改成连接普通玩家后端。

## 真实客户端与性能

正常玩家体验入口：

```sh
godot --path client/godot --scene res://scenes/Main.tscn
```

该命令会打开窗口并使用正常玩家数据。自动审片/录制使用主目录的专用隔离入口，集中执行并保留低打扰窗口安排。工作区整合后如源贴图与导入结果不一致，应先在隔离 QA lane 中运行 Godot editor import，核对真实玩家目录未变并清理 lane，再重跑相应地图检查。

涉及热点的变更需记录：工作区与提交、场景、是否真实 Main、稳定段 `process_total`、进程 CPU、静止与移动、相关面板或输入压力、前后差异。鼠标连点/拖动必须跨帧发送真实输入，不能用同一帧调用 helper 代替。`ps` 与游戏探针不一致时应查原因。

健康目标是启动后低个位数 CPU 和亚毫秒级常态 `process_total`；特定门禁的容忍阈值不是新的正常性能目标。更晚候选的性能矩阵和历史结果见对应 Phase，不能作为本轮重新测量的结果。

20 actor 原生固定场景使用 `python3 tools/capture_battle_layout_perf.py`，包含静止、指令选择和跨帧目标切换。此夹具会显式启用普通 PC 的 VSync；通用 `--perf-probe` 的无 VSync 设置保留给其他探针。窗口失焦应保留失败回执并标明不可作合格前后对比，不要放宽焦点门禁。首次切战的 `battle preparation probe` 只写探针日志，区分人物、宠物、剩余准备时间及后台预取队列。最新合格前台证据见 [Phase 549](phase_549_battle_texture_prefetch_and_github_sync.md)，联网结算回归见 [Phase 548](phase_548_battle_hotpaths_and_authoritative_completion.md)。

`--auto-battle-formation-check` 也覆盖贴图预取的并发/总量限制、去重、切图清理、失败和权限边界。无窗口环境明确保留同步加载，避免 Dummy 渲染器线程纹理问题；headless PASS 不能代替后台读取的原生验证。使用 `tools/play_guardian_review.py --autoplay --timeout-seconds 360` 检查真实预取完成数、首次切战时间和完整权威结算，不能给脚本额外插入等待来制造预取已完成的结果。

## 发布门禁和收尾

`node tools/run_local_ci.mjs` 只用于真实阶段/发布门禁或明确要求。当前主目录已包含 R0.09 固定矩阵，执行前仍要核对 `--help`、源代码和对应 Phase。Phase 510 的历史全绿证明候选当时通过，不证明当前脏工作区或生产环境通过。

每次验证记录精确命令、结果、skip 原因、没有覆盖的风险。结束后关闭本次创建的服务器、Godot 和子进程，核对 QA lane 和临时端口；不停止原先由用户运行的进程，不改真实玩家档案来清场。

旧性能数字和历史测试记录保留在 [整理前测试手册](bak/handbooks_20260917/testing.md)。
