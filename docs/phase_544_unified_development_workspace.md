# Phase 544：统一日常开发主目录并恢复可验证基线

日期：2026-09-17。来源：项目所有者明确授权开发者判断应保留的成果、继续构思与开发，老板负责产品方向和效果决定。

## 结果与边界

日常开发入口固定为 `/Users/fander/projects/Beastbound_Odyssey`。较新的候选历史、候选未提交成果和 Phase 543 的文档/代码导航已统一到原主目录；旧候选和融合专项目录保留作历史现场。未新建另一份日常开发目录，未改变玩家资料、MySQL 数据或资产批准状态。

产品仍处于开发阶段，生产发布继续 BLOCKED。详细路线图沿用 `stoneage_gap_plan.md` 与 `production_release_loop_plan.md`，当前发布任务仍为 R1.W024，不能因为目录整合或测试通过而跳过正式画面、运营和封测门槛。

## 来源判断与恢复证据

整合前执行 `git fetch origin`，核对本地/远端、三个 worktree、完整未提交路径和 staged 状态。主目录 `1f22eded5a2c72191d57ac5eb2e4edfbcd75ad91` 是候选 `0bd9ea705e27baf2915cd47cfe2684db8f7870d2` 的祖先，相差 60 个提交；融合专项补丁比对未发现候选缺少的独有实现。

本机忽略目录 `.run/workspace-unification-20260917/` 保存：

- 两个工作区 390 个 Git 可见文件的原始字节、模式、SHA-256、状态和 Git blob；其中主目录 257 个，候选 133 个。
- 两边 worktree/index 补丁、初始 HEAD、逐项分类和需复核差异。
- 原主目录完整 stash（含未跟踪文件），并逐个核对其 129 个 tracked 和 128 个 untracked blob。
- 稳定恢复引用 `refs/backup/workspace-unification-20260917/{main-head,main-wip,candidate-head}`。

主目录 257 个路径逐项分类为：125 个与候选一致，89 个为候选后续提交已经更新的历史版本，31 个属于 Phase 543 维护，12 个经复核采用后续成套实现或原始 hash 固定文本。12 项涵盖旧地图合同/校验、旧 Firebud 证据及仅末尾空行不同的特效 prompt；原字节全部保留在恢复证据中，未盲删来源不明内容。

在 stash 内容核对完成且主目录干净后执行 `git merge --ff-only 0bd9ea705e27baf2915cd47cfe2684db8f7870d2`，再把 133 个候选未提交文件从已校验快照安装到主目录并复核 SHA。维护文档按当前实现更新，AGENTS 保留候选较新的安全约束；HTTP 参数提取先核对新版函数体，再做等价拆分，没有恢复旧路由文件覆盖新修复。

旧 candidate/p14 工作区加 `git worktree lock`。此锁防止 Git 自动清理/移动，不阻止文件写入；后续工作必须读主目录状态。恢复快照和两个历史目录都不是新的活跃开发分支。

## 统一后复现的测试夹具问题

完整 Node 服务端基线共 1985 项，第一次结果为 `1977 pass / 7 fail / 1 skip`。7 个失败全部出现在 `auth-durable-commit.test.js` 的位置准备：旧坐标 `(10,10)` 已被当前村庄地图标记为不可站立，服务端返回 `position_cell_blocked`，测试尚未进入邀请/战斗/持久化断言。

把这些测试统一使用当前可站立的相邻坐标 `(10,17)` / `(11,17)`。碰撞校验保持开启，未启用 teleport，未改地图数据、战斗、随机或存储行为。该文件 `52/52 PASS`；再次完整服务端 `1984 pass / 0 fail / 1 skip`。唯一 skip 是未配置独立 Valkey 集成环境，未虚报为通过。

## 验证

- `git diff --check`：PASS。
- `node --test tools/test/repository_guide.test.mjs server/node/test/http-list-options.test.js`：10/10 PASS。
- `node --test --test-reporter=spec server/node/test/auth-durable-commit.test.js`：52/52 PASS。
- `npm --prefix server/node test`：1985 项，1984 PASS、0 FAIL、1 SKIP；完整原始输出在 `.run/workspace-unification-20260917/server-suite-fixed.tap`。
- `node tools/run_godot_auto_checks.mjs --parse-only --output-dir .run/godot_auto_checks/workspace-unification-20260917-parse`：1/1 PASS，`processGroupsClosed=true`，QA lane 已清理，玩家目录 `realUnchanged=true`。
- 候选地图工具组合：132/132 PASS；地图 bundle 审计器回归：42/42 PASS。它们不代替正式可见录制和 Computer Use。

恢复实机复验后发现的录制链问题和本轮产物见 [Phase 545](phase_545_earth_vein_recording_runtime_recovery.md)：修复 JSON 数字合同、原生窗口初始化和跨进程帧范围比较，刷新旧导入缓存，已生成四层与顶层真实录像；R1.W024 的完整证据重冻尚未完成。

未运行完整 `run_local_ci.mjs`，未执行生产发布、资产 promotion 或玩家数据库操作。恢复备份保留，旧阶段事实不重写，当前使用方式从 `docs/README.md`、`docs/project-status.md` 和 `docs/development.md` 进入。
