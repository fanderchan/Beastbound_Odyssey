# Phase 471：融合画像 owner 合同统一与失败关闭加固

## 结果

本阶段修复 P1.4 正式开放前的一处双端合同冲突：画像审计工具要求项目所有者决定使用
`ownerReview.evidence + ownerReview.decision` 的严格结构，但客户端和服务端发布证明仍只接受旧的
`evidencePaths` 简化结构。旧实现无法同时满足画像审计与运行发布证明，未来即使项目所有者明确批准，
也不能生成一份双端都认可的正式证明。

现在画像审计、客户端门禁和权威服务端统一绑定：

- 每只融合成品各自的专用画像 owner decision；
- 精确的 `project-owner:fander` 身份，不再接受任意 `project-owner:*`；
- 画像 master、runtime、ownership 文档的固定路径与 SHA-256；
- 非空 owner 证据数组及其逐项 SHA-256；
- owner decision 的 subject、acceptedEvidence、UTC 时间和严格字段集合；
- 画像元数据、宠物整包、运行发布证明之间的完整哈希链。

本阶段没有创建任何真实 owner decision 或运行发布证明，也没有代替项目所有者批准画像。生产事实保持：

```text
releaseApproved=false
runtimeEnabled=false
playerEntryOpened=false
portraitReleaseGate=false
```

## 双端职责

- 服务端读取仓库内全部冻结证据并逐文件校验 SHA-256，是 owner 决定与玩家开放的权威门禁。
- 客户端逐文件校验可打包到 `client/godot/` 的运行资源；对仓库外层 `docs/` owner 证据只校验安全
  相对路径、严格引用结构、SHA-256 形状，以及其与画像决定的精确一致性。证据正文继续由服务端复验。
- 画像审计在 `owner_review_pending` 时仍要求 `untrusted_claim / semantic=false / releaseGate=false`；
  只有严格可信的 owner decision 通过后，才允许
  `owner_verified / semantic=true / releaseGate=true`。审计本身不会生成批准。
- `TRUSTED_OWNER_DECISION_SHA256_BY_FORM` 继续为空；在项目所有者明确批准当前候选前，伪造一份
  外观正确的 JSON 仍不能自我批准画像。

## 回归覆盖

- 服务端正向夹具改为完整的逐宠画像决定，并新增“总发布者身份伪造”和“画像所有者身份伪造”两条
  哈希链自洽的负向用例，证明语义层仍失败关闭。
- 客户端内存发布夹具与严格结构对齐；目录、总 owner、画像、宠物整包和技术证据五类漂移继续失败关闭。
- 画像审计批准夹具同步切换 owner 生命周期字段，并保留自批准、证据漂移、subject 漂移、重复画像、
  symlink、历史迁移重放等负向门禁。

## 验证

- `git diff --check`、Node `--check`、Python `py_compile`：通过；
- 发布证明与融合目录定向测试：`47/47 PASS`；
- 画像目录审计测试：`33/33 PASS`；历史 Phase 371 迁移摘要绑定规范仓库绝对路径，因此独立工作树
  使用当前修改后的审计代码、在规范证据根上完成重放，没有改写历史证据；
- `godot --headless --path client/godot --quit`：Godot 4.7 解析通过；
- `pet_fusion_client_domain_check.gd`：`PASS`，`clientReleaseAttestationGate=true`；
- `pet_fusion_contract_check.gd`：`PASS`，`productionClosed=true`；
- `pet_fusion_panel_check.gd`：`PASS`，两路线 1280×720 边界通过、占位图为 0、生产关闭；
- `--auto-balance-catalog-check`：连同基础解析 `2/2 PASS`；最终 QA lane 与外部锁均已清理，
  `realUnchanged=true`；
- `verify_pet_fusion_closed_release.py`：`PASS`，`2 forms / 1350 copied / 22 portrait / 2 QA controls`；
- Pet Design Inspector：`36 forms / 2 fusion targets / errors=0 / warnings=0`。

首次自动检查错误地与直接 Godot 检查并行，隔离器因真实用户目录新增两份 Godot 日志而保护性中止。
只读核查确认没有账号、角色档案、配置或数据库变化；原 lane 与精确外部锁已整体移动到可恢复目录，
`.run/recovery/qa-lane-automation-real-baseline-drift-20260817T0557/`，随后串行重跑通过。没有删除、
覆盖或恢复真实玩家数据。

## 后续与非目标

- 当前曜冠角兽与苔垒角兽画像仍等待项目所有者对当前版本作明确接受或拒绝；本阶段不推定审美批准。
- 不修改融合概率、成长、技能遗传、绑定、交易、消耗或三宠权威事务。
- 不开放正常玩家入口，不把 QA、审计或发布诊断显示给玩家。
- owner 明确批准后，下一切片才生成真实逐宠决定、最终 Main 证据和原子发布证明，并验证导出包可读取
  所有客户端发布引用后再开放生产目录。
