# Phase 510：生产发布 R0.09 干净候选基线门禁

## 目标与结论

本阶段只执行 `R0.09 GATE｜干净候选基线成立`：在 R0.08 已证明可复现和可回退的候选分支上，用一个固定、可审计、隔离真实玩家数据的统一门禁同时验证源码补丁、完整服务端、Godot 解析、发布目标、真实联机路径和性能基线，并追查门禁暴露的每个真实失败直到根因关闭。

结论：**R0.09 通过，R0 阶段完成**。最终统一门禁结果为 `passed=8 / failed=0 / total=8`；嵌套 Godot 发布目标 `35/35`、联机矩阵 `8/8`、性能套件 `5/5`；完整服务端为 `1981 tests / 1980 pass / 0 fail / 1 skip`。所有 Godot 进程组关闭、自动化 QA lane 删除、真实玩家目录 inventory SHA-256 前后一致，本地 QA 后端和端口均已收尾。

这不代表游戏已经可正式生产上线。R1–R10 的 OWNER 视听验收、首发玩法与内容、正式资产、社交、真实支付、生产运维与安全、200 玩家生产相似负载、签名制品、封测和最终上线门禁仍未完成，因此全局发布结论继续为 **BLOCKED**。

## 范围与非目标

本阶段覆盖：

- 冻结统一发布门禁的目标、联机、quick 和性能矩阵，避免新增实验检查或待 OWNER 批准候选让门禁含义无声漂移；
- 所有 Godot 解析、目标、联机和性能检查统一经过真实 `Main.tscn`、固定 `automation` user-data lane、精确完成标记、进程组收尾和真实玩家目录哈希核验；
- 完整联机门禁只接受一个规范的 `127.0.0.1` HTTP origin，并要求 `/health` 精确报告健康 Beastbound JSON store；
- 完整服务端和真实联机运行暴露的 HTTP、运维状态、测试调度和随机夹具根因；
- 文档中的统一门禁命令、前置条件、成功计数和清理边界。

本阶段不做：

- 不批准、提升或修改 Firebud v2、融合肖像、环境音、Bui VFX、洞穴、Boss、骑乘等 `owner_review_pending` 候选；
- 不把全部历史/实验/OWNER 检查都冒充当前发布矩阵，也不删除这些检查；它们仍可由发现型运行器单独盘点；
- 不修改战斗公式、闪避规则、成长、经济、地图权威或玩家 UI；战斗稳定性修复只冻结自动检查专属靶子的闪避夹具；
- 不对共享或正常玩家 MySQL 执行 live QA，不启用生产瞬移，不修改 MySQL 全局配置，不删除真实玩家数据；
- 不提前勾选 `stoneage_gap_plan.md` 父项。

## 统一门禁合同

### 固定矩阵

`tools/run_local_ci.mjs` 默认固定 8 个顶层步骤：

1. `git-diff-check`；
2. Godot 运行器 Node 语法；
3. 本地 CI Node 语法；
4. 完整服务端 `npm test --prefix server/node`；
5. Godot parse 加 34 个发布目标，即 `35` 项；
6. QA backend preflight；
7. Godot parse 加 7 个真实联机检查，即 `8` 项；
8. 5 项固定性能套件。

发布目标覆盖当前基线所需的世界/地图/NPC/交互、音频合同、宠物目录/管理/成长、战斗动作/反馈/时序、认证和 QA 面板。联机矩阵覆盖认证、启动登录、显式建角进入、服务端移动、服务端战斗回合、战斗返回和离场 UI。`--quick` 只选择两个固定目标并跳过联机段；普通默认门禁不再自动吸收新发现的 `--auto-*-check`。

### 隔离联机前置

完整门禁的联机部分只接受：

- `http://127.0.0.1:<明确端口>`，无账号、路径、query 或 fragment；
- `/health` 返回 HTTP 200、`ok=true`、`service=beastbound-auth`、`storage.mode=json`；
- 一次性 `.run/` JSON store；
- 仅该本地 QA 进程显式设置 `BEASTBOUND_ALLOW_POSITION_TELEPORT=1`，用于需要任意坐标的自动检查。

因此正常玩家 MySQL 服务、LAN 服务、共享测试服、生产 URL、非 Beastbound 健康页和没有显式隔离的数据源都会失败关闭。门禁不负责启动或停止后端；操作者必须明确拥有该一次性进程，并在结束后收尾。

### 性能合同

`tools/run_godot_auto_checks.mjs --performance-suite` 固定运行：

- idle：稳定样本 `process_total median <= 5ms`、`p95 <= 15ms`；
- moving：精确 `status=ok`，且稳定样本 `median <= 10ms`、`p95 <= 30ms`；
- movement spam：精确 `status=ok`、`coalesced=true`、`settled=true`、`max_input_us <= 5000`；
- shop select：精确性能检查完成标记为 `status=ok`；
- player stat spam：精确性能检查完成标记为 `status=ok`。

五项都从真实 `Main.tscn` 启动，必须输出唯一 QA lane attestation；超时、输出上限、进程组残留、缺失/重复/矛盾标记、车道漂移或真实玩家目录变化都会失败。

## 门禁暴露的根因与修复

### 1. 发现型全量与发布门禁含义漂移

旧本地 CI 会运行 `main.gd` 发现的全部检查，使历史实验项和明确等待 OWNER 的候选也自动进入阶段门禁；旧性能段还直接启动 Godot，绕开 R0.03/R0.07 已建立的固定车道和收尾合同。

修复后，发布目标、联机、quick 和性能分别使用显式冻结的矩阵。性能统一委托固定车道运行器，报告中保留每项阈值、完成证据、lane attestation、进程组和清理结果。发现型全量入口仍保留用于专项盘点，不再决定 R0.09 成败。

### 2. HTTP 客户端晚到连接重置

第一次完整服务端运行捕获到客户端在路由级监听器已清理后触发的晚到 `ECONNRESET`。该网络错误原本可能成为未处理 socket error 并终止整个 Node 进程。

服务端现在为每条 HTTP 连接保留全生命周期 socket error listener：只记录脱敏 `errorCode`、销毁该 socket，不影响监听器和后续健康请求。回归测试真实建立连接、模拟晚到 reset，并证明服务继续返回健康结果。

### 3. 邮箱索引测试把进程调度误当迁移超时

邮箱索引迁移夹具把正常 fake-MySQL 进程启动和“强制挂起”两种场景都设为 `100ms`。完整套件并发调度时，正常启动偶尔超过该预算，形成环境调度抖动。

正常夹具窗口改为 `5000ms`；专门的挂起分支仍克隆选项并使用 `100ms`，继续严格证明生产迁移超时错误码和边界。生产超时实现未放宽。

### 4. 运维健康响应中途关闭会悬挂

本地门禁复现了 `/health` 已返回 header、body 尚未完成就被关闭的情况。`server-ops status` 与双击启动器内联健康探针只等待 `end`/request error，可能永不 settle。

两处现统一处理 response `aborted`、response `error`、`close && !complete`、正常 `end` 和 request error，并用单一 settlement guard 保证只结束一次。回归用截断的 HTTP body 证明 status 有界返回失败，而不是挂起。

### 5. MySQL status 空密码参数触发交互提示

运维 status 过去将 `-p${password}` 放入 argv；空密码变成裸 `-p` 后，MySQL CLI 会进入 `Enter password:` 交互，完整门禁在 PTY 下停住，同时非空密码也会暴露在进程参数中。

status 现在为两条只读计数查询共享一个精确的私有临时 `--defaults-extra-file`：目录/文件权限分别保持私有边界，文件以 `0600` 和独占创建，查询后在 `finally` 删除；密码不再出现在 argv。回归证明两次查询使用同一临时文件、argv 无密码且文件最终不存在。

### 6. 联机移动缺少显式 QA 瞬移前置

一次联机矩阵连接到没有设置 QA 瞬移开关的隔离后端，服务端正确拒绝了离记录点位置的 seed。这个失败不是移动权威回归，而是门禁环境未声明自身所需能力。

本地 CI 现把“规范回环 JSON store + 显式一次性 teleport QA 后端”写成硬前置并在 live 前精确预检。开关没有进入正式配置，也没有用于共享或玩家后端。

### 7. 战斗检查把随机闪避当作必定伤害

`--auto-battle-check` 要证明普通攻击确实扣血并结束 1HP 胜利靶，但夹具仍允许生产闪避随机数。完整门禁捕获第一击闪避；定向重复又捕获第二个 1HP 靶闪避。

检查现在只在自动化内给两个精确靶子写入 `dodgeRateOverride=0`，并严格核验 override 生效、第一击 HP 确实下降、胜利靶从 `1` 变为 `0`、战斗退出。生产战斗反应、命中/闪避公式和普通玩家状态均未改变。修复后连续 10 次独立运行均为 parse 加 battle `2/2`，合计 `20/20`。

### 8. 最终候选卫生审计发现新增入口未归类

提交后的第一次严格候选审计正确拒绝了三项最终树问题：根目录 `start-backend.command` 尚未进入显式路径分类；本轮触及的旧人工验收文档仍含本机仓库绝对路径；一个 HTTP 测试标题的自然语言被高置信认证头规则识别为疑似值。

处理方式不是关闭或放宽扫描：启动器被精确归为 `server_product_and_ops` 并新增分类回归；验收文档既已要求在仓库根目录执行，直接删除冗余绝对路径；测试标题改为不产生歧义的“authorization boundary”，测试数据和严格认证规则均保持不变。审计器定向回归 `6/6`，随后再从干净提交执行完整候选审计。

## 最终验证证据

### 完整统一门禁

隔离 QA 后端使用：

- host/port：`127.0.0.1:8787`；
- store：`json`；
- store path：`.run/local_ci/r0_09_qa_backend_gate8/auth-store.json`；
- 仅本进程设置 `BEASTBOUND_ALLOW_POSITION_TELEPORT=1`。

运行命令：

```bash
BEASTBOUND_AUTH_SERVER_URL=http://127.0.0.1:8787 \
node tools/run_local_ci.mjs \
  --output-dir .run/local_ci/r0_09_full_gate_pass5
```

权威摘要：

- 顶层：`.run/local_ci/r0_09_full_gate_pass5/2026-08-20T15-30-29-864Z_summary.json`；
- 顶层结果：`8/8`，`failed=[]`，约 `565.876s`；
- 完整服务端：`1981 tests / 1980 pass / 0 fail / 1 skip`，TAP 约 `83.109s`；
- 唯一 skip：未配置隔离 `BEASTBOUND_TEST_VALKEY_PORT` 的真实 Valkey stream 测试，边界与 Phase 506 相同，不冒充 R7/R9 的生产相似 Valkey 证据；
- 发布目标：`.run/godot_auto_checks/2026-08-20T15-30-29-864Z_local_ci_target/2026-08-20T15-31-54-168Z_summary.json`，`35/35`、`skipped=0`；
- 联机矩阵：`.run/godot_auto_checks/2026-08-20T15-30-29-864Z_local_ci_live/2026-08-20T15-37-12-971Z_summary.json`，`8/8`、`skipped=0`；
- 性能套件：`.run/godot_auto_checks/2026-08-20T15-30-29-864Z_local_ci_perf/2026-08-20T15-37-59-815Z_summary.json`，`5/5`、`skipped=0`。

最终性能摘要：

- idle：51 个样本、26 个稳定样本，`median=0.45ms`、`p95=0.52ms`；
- moving：8 个样本、4 个稳定样本，`median=0.38ms`、`p95=0.43ms`；
- movement spam：34 个真实鼠标事件，`max_input_us=5`、`coalesced=true`、`settled=true`、最终权威位置一致；
- shop select：`status=ok`，16 个商品、17 个装备、3 个样本，选择和刷新证据完整；
- player stat spam：`status=ok`，即时显示、debounce、刷新和点数均成立，`refresh_count=2`、`saves=1`。

### 定向回归与语法

```bash
node --test \
  tools/test/audit_release_candidate.test.mjs \
  tools/test/run_local_ci.test.mjs \
  tools/test/run_godot_auto_checks.test.mjs \
  server/node/test/http-public-security.test.js \
  server/node/test/server-ops-lifecycle.test.js \
  server/node/test/start-backend-launcher.test.js \
  server/node/test/mysql-mail-inbox-pagination.test.js
python3 -B -m unittest tools.test.test_godot_qa_user_data_lane
python3 -B tools/godot_qa_user_data_lane.py source-check
node --check tools/run_godot_auto_checks.mjs
node --check tools/run_local_ci.mjs
node --check server/node/scripts/server-ops.js
zsh -n start-backend.command
git diff --check
```

结果：

- Node 定向回归 `98/98`；
- 候选审计器定向回归 `6/6`；
- Python QA lane 回归 `78/78`；
- source contract 为 `source_contract_passed`；
- 三个 Node 脚本语法、zsh 语法和补丁空白检查均通过；
- 战斗夹具另有连续 10 轮 `20/20` 证据，位于 `.run/godot_auto_checks/r0_09_battle_fixture_repeat2/`。

## 隔离与收尾

三个最终 Godot summary 均满足：

- `runnerStatus=passed`、`complete=true`；
- `processGroupsClosed=true`；
- `qaLaneCleanup.status=cleaned`、`laneAbsent=true`；
- `qaLaneCleanup.realUnchanged=true`；
- 正常玩家目录 inventory SHA-256 始终为 `fbff2a0ac07e24126993c0183c37a5c564af15e01e83a99d3ee40fa8f708cd9d`。

门禁结束后复核：`127.0.0.1:8787` 无监听；没有绑定候选 worktree 的 Node、Godot、CI、server-ops 或 fake-MySQL 进程；`BeastboundOdysseyQA_Automation` 不存在。QA JSON store 和运行报告只位于已忽略的 `.run/`，没有进入候选源码。

## 剩余风险与下一任务

- R0 现在提供的是后续开发的可信候选基线，不是生产批准；全局状态保持 `BLOCKED`；
- Firebud v2、融合肖像、环境音、Bui VFX、Earth Vein、Boss、骑乘、NPC 和战斗表现仍需逐项 OWNER 验收或明确延期；
- Valkey 真集成、真实 TLS/LB、监控告警、异地备份、PITR、RPO/RTO、200 玩家混合负载和 SOAK 仍留 R7/R9；
- 真实支付、退款/补单/对账、macOS/Windows 签名制品、干净机器安装、封测、迁移、法务与最终上线均未开始或未完成；
- 原始工作树仍保留用户现有脏改动，本阶段交付后只向它同步 Phase 510 和生产发布计划，不同步候选代码或工具。

下一任务是 `R1.01 OWNER｜Firebud Village v2 人眼验收`。本阶段不开始该任务。
