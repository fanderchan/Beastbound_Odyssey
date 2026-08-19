# Phase 491：生产发布 R0.03 QA 自动化车道残留恢复

日期：2026-08-20
任务：`R0.03 AUTO｜修复 QA 自动化车道所有权与残留恢复`

## 结论

R0.03 已完成。固定 `automation` QA 车道现在能区分“活跃运行器”“可证明已过期的 schema-v2 运行器”“无法自动判断的旧版 schema-v1”与“不安全/歧义残留”。标准 Godot 自动检查只会自动回收精确进程身份已经消失的 schema-v2 残留；活跃、旧版或不安全状态全部 fail closed。

本机原有 schema-v1 残留已在确认没有匹配 QA 自动化运行器后，通过检查快照绑定的一次性旧版迁移路径精确移除。删除范围仅为固定 `BeastboundOdysseyQA_Automation` 目录及其外部 owner 锁，操作不可恢复；真实 Godot 玩家资料根未写入或删除，前后清单哈希均为 `0fb25d30be23ccba8294000c8aacc8fa1197317a8b98ce4b57b92b5be82be2b0`。

## 复现与根因

修复前运行：

```text
node tools/run_godot_auto_checks.mjs --only --auto-battle-action-catalog-check --fail-fast --timeout-ms 180000
QA lane is already owned, locked, or has residual data
```

只读检查确认：

- 外部锁与 lane owner canary 均为规范文件，owner 只记录哈希 `813e0f4bb88c778a44989801819893231c12b9bb611b09177ca5fc850b166078`；
- 旧锁保存的玩家资料基线为 `784e9aa3410dd50e3834d65091b8ded03591b209efd78c2709796d89f6389931`；
- 当前玩家资料清单为 `0fb25d30be23ccba8294000c8aacc8fa1197317a8b98ce4b57b92b5be82be2b0`；
- 旧恢复合同要求当前玩家资料仍等于锁创建时的基线，因此玩家资料发生正常变化后，残留会永久不可恢复；
- 没有存活的 `run_godot_auto_checks.mjs` 或 lane helper 进程。PID `67013` 是早于残留约 32 小时启动、父进程为 1、cwd 为 `/` 的既有 Godot 进程，不持有该项目或车道文件；它不属于本任务，未被终止。

## 新的所有权与恢复合同

### schema-v2 锁

- 标准 Node 运行器创建车道时传入自身 PID；helper 只接受其直接父进程。
- 锁保存 PID 与基于 `ps` 的进程启动身份 SHA-256，不保存命令行、凭据或 owner 明文证据。
- 同 PID 且启动身份相同才是 `active`；进程消失或 PID 被复用为不同启动身份才是 `stale`。
- schema-v1 没有可验证进程身份，只能标为 `legacy`，标准运行器永不自动回收。

### 读取与删除边界

- `inspect-stale` 只接受固定 lane 名称，以 no-follow、类型、权限、硬链接、规范 JSON、owner canary 与目录清单合同读取状态，对外只返回 owner 哈希。
- `recover-stale` 必须绑定上一步完整检查 SHA-256；状态、owner、锁 inode/payload、lane 清单或玩家资料清单发生变化都会拒绝。
- 自动路径只接受 `stale + schema-v2`。`active`、`legacy`、无锁目录、无效 JSON、符号链接、特殊文件与其他歧义状态均保留现场并报错。
- 旧版迁移额外要求字面确认 `I_CONFIRMED_NO_MATCHING_QA_AUTOMATION_RUNNER_PROCESS`；它使用检查时的当前玩家资料清单作前后守卫，不再错误要求等于历史锁基线。
- 正常 verify/cleanup 继续接受 schema-v1 与 schema-v2 的规范锁，现有 `client1`/`client2` 手工车道合同保持兼容。

### 标准运行器顺序

标准顺序现在是：源码合同检查 → 只读 stale 检查 → 仅在 schema-v2 stale 时精确恢复 → 创建绑定本运行器的 schema-v2 车道 → Godot preflight/目标检查 → verify → cleanup。运行日志和 summary 记录恢复状态、旧 schema 与 runner PID；owner 证据改为 SHA-256，不再打印 owner token。

## 验证

### 自动测试与源码合同

- `python3 -B -m unittest tools.test.test_godot_qa_user_data_lane`：`78/78` 通过。
- `node --test tools/test/run_godot_auto_checks.test.mjs`：`48/48` 通过。
- `python3 -B tools/godot_qa_user_data_lane.py source-check --repo-root .`：`source_contract_passed`。
- `python3 -m py_compile tools/godot_qa_user_data_lane.py`、`node --check tools/run_godot_auto_checks.mjs`、`git diff --check`：通过。
- 覆盖活跃拒绝、PID 复用、进程消失、旧版显式迁移、玩家资料历史漂移、检查后状态漂移、无锁目录、无效/链接残留、精确 payload 与 runner 输出合同。
- 自动 flag 清单按当前 `main.gd` 的 223 个唯一入口校准；没有新增玩家可见 QA 文案或协议变更。

### 真实连续运行

用一个短生命周期父进程创建 schema-v2 lane，父进程退出后只读检查得到 `status=stale`、`runnerPid=32076`，随后连续执行两次：

```text
node tools/run_godot_auto_checks.mjs --only --auto-battle-action-catalog-check --fail-fast --timeout-ms 180000
```

第一次证据：`.run/godot_auto_checks/2026-08-19T19-49-46-310Z_summary.json`

- `runnerStatus=passed`、`complete=true`、`processGroupsClosed=true`；
- `reclaimStatus=recovered`、`reclaimPriorStatus=stale`、`reclaimSchemaVersion=2`；
- Godot parse 与 battle action catalog 均通过；
- cleanup 为 `cleaned`、`laneAbsent=true`、`realUnchanged=true`。

第二次证据：`.run/godot_auto_checks/2026-08-19T19-49-58-946Z_summary.json`

- `runnerStatus=passed`、`complete=true`、`processGroupsClosed=true`；
- `reclaimStatus=absent`，证明第一次已完整收尾且没有假占用；
- Godot parse 与同一目标检查再次通过；
- cleanup 为 `cleaned`、`laneAbsent=true`、`realUnchanged=true`。

最终 `inspect-stale` 返回 `status=absent`，玩家资料清单仍为同一哈希。进程清单中没有本轮新增的 Node、Python、Godot 或 QA helper 孤儿；既有无关 PID `67013` 保持原样。

## 非目标与剩余风险

- 本任务不运行或修复完整服务端套件；失败分类进入 R0.04。
- 不修改玩家资料、服务端状态、MySQL、Godot 场景、玩法、UI 或协议版本。
- Windows 原生 no-follow/handle-relative lane 生命周期仍沿用既有 fail-closed 边界；本任务的自动恢复只在已有 POSIX 安全能力上启用。
- `.run` summary/log 是忽略的本机验证产物，不提交仓库；可复核关键字段已记录在本文。

下一任务：`R0.04 AUTO｜重跑并分类完整服务端失败`。
