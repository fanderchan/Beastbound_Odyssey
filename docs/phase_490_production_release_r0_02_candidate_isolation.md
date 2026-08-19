# Phase 490：生产发布 R0.02 候选隔离与安全重放

日期：2026-08-20
任务：`R0.02 AUTO｜安全吸收远端基线并隔离候选批次`

## 结论

R0.02 已完成。没有在原始脏工作树上执行 merge、reset、checkout 或覆盖式同步，而是从最新 `origin/main` 建立独立候选工作树和分支，再把冻结清单中的 Firebud v2 与芽耳布伊冲锋反馈分成两个窄提交重放。

候选提交链：

- 基线：`ddcb4ff770093d0ae1533631f6371b11e1ce4f30`；
- Firebud v2：`406bb5f1ea1335b27341a6464dc6b00de0acd1f9`；
- 芽耳布伊冲锋反馈：`06becae711d488d5e878a39ff00d27f69f318c4e`；
- 候选分支：`codex/production-release-candidate`。

两个候选仍分别是 `owner_review_pending`，本任务只建立可审查、可测试、可回退的候选基线，没有伪造 OWNER 批准，也没有把待审资产提升为正式发布状态。

## 隔离与重放边界

### Firebud v2

- 以 R0.01 清单中的 129 个 Firebud 路径和 `main.gd` 的 Firebud 专属补丁为输入。
- 发现六个旧候选文件会把 Phase 488 已发布的 15 组合地表过渡合同退回旧四边合同，因此没有机械覆盖远端。
- 保留 Phase 488 的 `SURFACE_TRANSITION_KEYS`、含 `nw_ne_sw_se` 的 15 组合运行合同，同时只合入候选新增的 pending-catalog preview 合同与审计测试。
- 两个已被远端正式合同取代的旧 GDScript 路径不进入候选，最终 Firebud 提交精确包含 128 个路径。

### 芽耳布伊冲锋反馈

- R0.01 清单中的 31 个路径均先按冻结 blob 哈希核对，再复制到 Firebud 提交之上。
- `main.gd` 与 `auto_check_coordinator.gd` 只应用各自的 Bui 专属补丁，没有复制混合工作树整文件。
- 精确暂存时发现两份生成提示词各有一个 EOF 空行；只删除这两个空行后，Bui 提交精确包含 33 个路径。
- 没有修改技能伤害、目标、命中、暴击、服务端结算或协议版本，只重放已结算事件的客户端位图反馈及对应测试。

### 记录与路线图

- R0.01 的工作树审计、融合发布审计、事实基线、路径清单和本发布计划作为记录批次单独吸收。
- `stoneage_gap_plan.md` 使用基于 `origin/main` 的补丁合并原有本地路线图记录，没有复制整文件，也没有因 R0.02 提前勾选尚未满足的产品父项。

## 验证

### Firebud v2

- `git diff --check`：通过。
- 地图 bundle 审计器及构建、组装、证据安装、证据生成、动作录制、性能证据 Python 测试：`63/63` 通过。
- 提交后地图 bundle 离线复审：`status=PASS`、`errors=[]`、`filesChecked=86`、`jsonsChecked=5`、`pngsChecked=59`。
- Godot 4.7 headless 解析：通过。
- 隔离 `client2` QA lane：服务布局、地图审片 profile、寻路和移动检查均通过；每次运行前后正常玩家数据根哈希不变，结束后 lane 已清理。
- 离线审计仍诚实返回 `releaseReady=false`。剩余门槛是 computer-use report、dressed reference、layered preview、正式 lifecycle、OWNER 接受、有效性能报告、release attestation 和运行截图覆盖，留给后续 OWNER 与正式发布任务。

### 芽耳布伊冲锋反馈

- `node .agents/skills/design-beastbound-skills/scripts/inspect_skill_catalog.mjs`：`errors=[]`；仅保留既有 `quick_instinct` 展示型 no-op 警告。
- `node tools/battle_action_catalog_check.mjs`：`status=ok`。
- Godot 4.7 headless 解析：通过。
- `node --test server/node/test/auth-battle-room.test.js`：`68/68` 通过。
- 隔离 `client2` QA lane：battle action catalog 与 pet battle review lab 均通过；正常玩家数据根哈希不变，结束后 lane 已清理。
- staged 文本扫描未发现绝对个人路径、邮箱或常见凭据模式；20 个 VFX 文件共 `3,775,502` bytes，14 个 PNG/GIF 类型正确，未发现可疑嵌入字符串或 `.import`、`.uid`、日志、视频、联系表、`.run`、`.godot` 等忽略产物。

## 独立回退证明

对两个候选分别从提交 tree 建立临时索引，反向应用该提交的完整 binary patch，再执行 `git write-tree`：

- Firebud 反向结果 tree 为 `3fb94c5e4690572ff69cf1721ccf5dc0cca5244e`，与基线父提交 tree 完全一致；
- Bui 反向结果 tree 为 `673b8995ef7796bfc334bfcbfa6be12dca0755f2`，与 Firebud 父提交 tree 完全一致。

用于证明的临时 detached worktree 和临时索引均已收尾。两个候选可以分别审查、测试和回退；它们只在宿主接线文件 `client/godot/scripts/main.gd` 上有预期交叉，未被压成一个不可拆提交。

## 剩余风险与下一步

- 固定 automation QA lane 存在旧 owner 残留，标准自动检查包装器会 fail closed；本任务没有擅自清理，R0.03 将专门修复安全过期判定和恢复合同。
- Firebud v2 与芽耳布伊冲锋反馈均等待后续 OWNER 明确审批。
- 完整服务端套件尚未在该候选上分类重跑，依赖 R0.04；R0.02 不用窄测试冒充完整发布门禁。
