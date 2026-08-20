# Phase 509：生产发布 R0.08 候选源码卫生与可复现报告

## 目标与结论

本阶段只执行 `R0.08 AUTO｜候选源码卫生与可复现报告`：把候选分支相对 `origin/main` 的完整提交链和最终源码树做成可重复、失败关闭且不回显敏感值的审计，并证明候选可从 Git 对象复现、可用独立索引精确回退到基线 tree，且本轮结束时没有候选后端、Godot QA 车道或测试进程残留。

结论：**R0.08 通过**。最终权威机器报告由以下命令生成，位于已忽略目录，不作为产品源码提交：

```bash
node tools/audit_release_candidate.mjs \
  --base origin/main \
  --output .run/release_candidate/r0_08/candidate-audit.json
```

报告的 `candidate.commits[]` 是精确、有序的提交集合；`candidate.changedPaths[]` 是精确路径集合；两次 `git archive --format=tar` 的字节数和 SHA-256 必须相同；隔离临时 index 反向应用 `origin/main..HEAD` 的 full-index binary patch 后，`git write-tree` 必须精确等于基线 tree。任一合同不成立，工具写出脱敏失败报告并以非零退出。

当前发布结论仍为 **BLOCKED**。R0.08 只关闭源码卫生和复现风险，不替代 R0.09 的完整候选门禁，不批准任何 `owner_review_pending` 视觉或音频候选，也不改变玩家入口。

## 范围与非目标

本阶段覆盖：

- `origin/main...HEAD` 的完整最终源码树、提交拓扑、作者身份、分支、upstream 与 SSH origin；
- 候选变更路径的显式分类、模式、生成状态、敏感文件名、密钥样式和私人绝对路径；
- Firebud v2 已版本化审片资料的 manifest/报告/receipt/截图逐层 SHA-256 引用闭包；
- 同一 HEAD 的双源码归档复现、候选整体反向补丁 tree 证明；
- `automation`、`client2` 两条固定 QA 车道、候选后端 PID 和候选目录相关 Node/Godot/Python 进程收尾；
- R0.07 发现的裸 Godot parse 风险在发布计划中的命令纠正。

本阶段不做：

- 不运行 R0.09 的完整本地 CI，不重跑 R0.05 的两轮完整服务端门禁、R0.06 的全部客户端自动矩阵或 R0.07 的真实 Main 性能矩阵；
- 不修改玩法、数值、协议、地图权威、运行资产像素或玩家 UI；
- 不清理原始脏工作树，不删除忽略目录中的历史本机证据，不触碰真实玩家资料或 MySQL 数据；
- 不重写已经推送的候选历史。审计对象是正式导出会消费的最终 `HEAD` tree 和由该 tree 生成的源码归档；基线仓库或旧 Git 对象中的历史文字不冒充最终发布内容；
- 不提前勾选 `stoneage_gap_plan.md` 父项。

## 审计合同

### 仓库与提交链

工具固定要求：

- 当前分支为 `codex/production-release-candidate`，upstream 为同名 origin 分支；
- origin 保持 `fanderchan` 的 SSH remote，Git 身份为既定 `fanderchan` 身份；
- `origin/main` 是候选祖先，候选对它 `behind=0`；
- 候选每个提交只有一个父提交，首提交父项精确等于基线，后续父项逐个相接；
- 每个候选提交作者均为既定身份；默认严格模式还要求本地 HEAD 与 upstream 一致；
- 工作树必须干净，报告自身只写入已忽略的 `.run/`。

最终交付前已有 22 个候选提交，基线为 `ddcb4ff770093d0ae1533631f6371b11e1ce4f30`；R0.08 的单一提交加入后，权威报告应得到 **23 个线性提交和 225 条最终差异路径**。报告保存每个提交的完整 SHA、父 SHA、tree SHA、作者、时间和主题，不靠手写短 SHA 猜测。

### 路径分类与生成状态

所有差异路径必须且只能落入以下显式类别：

- repository policy；
- client product source；
- client runtime assets；
- asset source and provenance；
- immutable asset evidence；
- server product and ops；
- server tests and fixtures；
- release and QA tooling；
- tool tests；
- release documentation。

未知顶层或无法分类的路径直接失败。`.run`、Godot cache、本地服务状态、依赖目录、覆盖率、临时目录、PID、socket、swap、临时文件、import/uid、TAP 和普通日志/报告等路径直接失败；敏感扩展、环境文件和凭据命名直接失败；最终 tree 只允许普通 blob 模式 `100644/100755`，不允许候选偷偷带入 symlink 或 submodule。

Firebud v2 目录中的 PNG/JPEG、JSON/JSONL、性能报告和 collision receipt 是已经由地图 bundle 冻结的**不可变资产验收证据**，不是 `.run` 截图缓存。审计器从 `map-visual-bundle.json` 递归读取所有 `{path, sha256}` 引用：

- 当前引用必须存在且字节哈希完全一致；
- `superseded*` 账本允许保留旧哈希，但只有当前 tree 字节仍与历史引用一致、或同一路径另有有效当前引用时，文件才算被闭包绑定；
- 每个候选变更的 evidence 文件都必须出现在已验证闭包中，否则即使目录名叫 evidence 也按未分类生成状态失败。

这条边界保留可审计的资产来源，同时阻止普通日志、临时报告和截图缓存借 evidence 名义进入候选。

### 密钥与私人路径

内置扫描只读取最终候选 Git blob，不读取本地凭据文件。它覆盖私钥头、常见云厂商/API token 前缀、带凭据 URL、Bearer 值和密码/secret/token 赋值，并检查 macOS、Linux、Windows 用户目录及 macOS 私有临时目录形式。

命中时报告只写：规则 ID、仓库路径、行号、匹配长度和匹配文本 SHA-256；**绝不回显命中原文**。测试和 QA 源码里明确带 `test`、`fixture`、`demo`、`qa` 等标记的合成凭据，以及测试/参考文档里的合成用户路径，会单独记为 `syntheticFixtures`，不与真实秘密混为一谈；高置信 token 格式即使出现在测试中仍失败。

本轮移除了候选最终 tree 新增的真实本机绝对路径：仓库规则改用“仓库根目录”和相对参考目录，Phase 506 改用分支/专用 worktree 描述。测试夹具和 bundle schema 中的合成用户路径保留并被审计器明确分类。`gitleaks` 与 `trufflehog` 当前机器均未安装，因此结论来自可复核的仓库内置规则；后续 R7 安全门禁仍需更完整的依赖、历史和凭据扫描，R0.08 不把当前结果夸大为生产安全审计。

### 运行收尾

严格报告调用既有 fail-closed QA lane inspector，仅保留脱敏状态字段。`automation` 与 `client2` 必须同时为 `status=absent / laneAbsent=true / runnerPid=0`；候选 `.local/server.pid` 必须不存在；macOS/Linux 上会结合进程表和进程 cwd 查找仍绑定候选目录的 Node、Godot 与 Python 进程，只输出 PID、进程类别和命令摘要。

## 可复现路径

最终机器报告内嵌精确 HEAD/基线后的命令集合。人工复核顺序为：

```bash
git fetch --prune origin
node tools/audit_release_candidate.mjs \
  --base origin/main \
  --output .run/release_candidate/r0_08/candidate-audit.json
git worktree add --detach <fresh-worktree> <R0.08_HEAD>
git -C <fresh-worktree> diff --check <BASE>...<R0.08_HEAD>
(cd <fresh-worktree> && node --test \
  tools/test/audit_release_candidate.test.mjs \
  tools/test/run_godot_auto_checks.test.mjs)
(cd <fresh-worktree> && python3 tools/godot_qa_user_data_lane.py source-check)
(cd <fresh-worktree> && node tools/run_godot_auto_checks.mjs \
  --parse-only \
  --output-dir .run/godot_auto_checks/r0_08_parse)
```

`<BASE>` 与 `<R0.08_HEAD>` 不需要人工抄写：最终 JSON 的 `repository.baseCommit/headCommit` 和每条展开命令均保存完整值。独立 worktree 只用于复核，不取代发布分支自身的分支/upstream/身份门禁。

## 失败回退路径

工具先在隔离临时 index 中自动证明以下内容，不修改当前 index 或 worktree：

1. 用 `git read-tree HEAD` 初始化临时 index；
2. 将 `git diff --binary --full-index BASE HEAD` 流式反向应用到临时 index；
3. 比较临时 `git write-tree` 与 `BASE^{tree}`；
4. 无论成功失败都删除该精确临时 index 目录。

机器证明通过只说明候选整体可精确还原，不授权 reset、force-push 或覆盖用户改动。真实失败回退采用报告中展开的非破坏路径：从候选 HEAD 新建 `codex/revert-<head>`，在已忽略目录生成审阅过的 full-index binary patch，`git apply --reverse --index`，确认 staged tree 精确等于基线后创建正常 revert 提交。候选尚未合并时最安全的处置仍是停止合并/部署，不移动生产分支。

## 验证结果

### 隔离审计预演

为避免在工具未经自证前提交，本轮使用临时 Git index 写入当前精确文件、创建一个无引用的临时提交，再放入独立临时 worktree；退出处理器只删除本轮创建的 worktree、精确临时 ref 和 index。

最终预演结果：

- `status=passed`；
- `23` 个线性提交（22 个既有候选 + 1 个临时 R0.08 提交）；
- `224` 条当时差异路径全部分类（正式 Phase 509 加入后最终应为 225）；
- 两次 tar 归档 SHA-256 和字节数完全一致；
- reverse full-index binary patch 重建基线 tree，`rollbackTreeMatches=true`；
- 密钥、私人路径、生成状态、证据闭包、QA 车道和候选进程错误均为 `[]`。

预演曾准确拦下两类工具设计缺口，均未靠放宽门禁处理：

1. macOS 临时目录的逻辑路径与真实路径不同，CLI 入口改为比较 `realpath`；stdin/import 场景也改为不存在入口路径时安全跳过 main。
2. Firebud manifest 同一路径同时保留当前和 `superseded*` 哈希；审计器现区分当前字节合同与历史账本，并继续要求候选里的实际 evidence 文件有可验证当前字节闭包。

### 定向测试与 Godot 安全解析

```bash
git diff --check
node --test \
  tools/test/audit_release_candidate.test.mjs \
  tools/test/run_godot_auto_checks.test.mjs
python3 tools/godot_qa_user_data_lane.py source-check
node tools/run_godot_auto_checks.mjs \
  --parse-only \
  --output-dir .run/godot_auto_checks/r0_08_parse
```

结果：

- `git diff --check`：通过；
- Node：`58 tests / 58 pass / 0 fail`，其中审计器新回归 `6/6`，既有 Godot 运行器合同 `52/52`；
- QA lane source contract：`source_contract_passed`；
- 隔离 Godot：`1/1 godot-parse ok`，Godot 子进程约 `4686ms`，运行器总耗时约 `5419ms`；
- 解析前后 `automation/client2` 均 absent，正常玩家资料 inventory SHA-256 前后保持 `fbff2a0ac07e24126993c0183c37a5c564af15e01e83a99d3ee40fa8f708cd9d`；
- 解析后没有候选 Godot、Node 测试或 backend 孤儿进程。

第一次人为指定的输出目录不在运行器固定 `.run/godot_auto_checks/` 根下，运行器在创建 QA lane 和启动 Godot 前以非零退出安全拒绝；命令已改为合法固定根并通过。这个被拒命令不计作产品失败，但作为复现命令合同修正保留在阶段证据中。

本阶段没有玩家可见改动，因此不重复录制 Main.tscn 或性能视频；R0.07 的真实 Main/性能证据未被修改。最终提交推送后必须在干净分支上再运行一次默认严格审计，只有报告 `status=passed`、本地 HEAD/upstream/远端 SHA 一致时，R0.08 才算交付完成。

## 剩余风险与下一任务

- `gitleaks`、`trufflehog` 和完整历史扫描未在本机执行；R7 的正式安全门禁仍不可跳过；
- R0.08 没有重新运行完整服务端、全部 Godot 自动矩阵或真实 Main；这些已经分阶段通过，但仍需 R0.09 从同一最终 HEAD 做完整候选门禁；
- Firebud v2、NPC、融合、环境音和战斗特效等 owner review 状态没有改变；证据可复现不等于美术/音频获批；
- 原始工作树仍保留用户现有脏改动，本阶段只向它同步 Phase 509 与生产发布计划，不同步审计工具或候选源码；
- 发布结论保持 `BLOCKED`。

下一任务：`R0.09 GATE｜干净候选基线成立`。
