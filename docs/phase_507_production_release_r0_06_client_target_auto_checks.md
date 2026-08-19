# Phase 507：生产发布 R0.06 客户端目标自动检查

## 目标与结论

本阶段只执行 `R0.06 AUTO｜恢复并跑通客户端目标自动检查`：在 R0.03 的隔离 QA 车道和 R0.05 的服务端零失败门禁之上，验证 Godot 解析，以及地图、音频、融合、宠物、战斗、世界交互、当前 Firebud/Bui 候选与 QA 入口相关的客户端自动检查。

结论：**R0.06 通过**。最终目标矩阵为：

```text
35 selected / 35 completed / 35 passed / 0 failed
```

其中包含 1 次 Godot 解析和 34 个目标自动检查；运行器状态为 `passed`，执行完整，所有进程组已关闭，自动化用户目录已清理，真实玩家目录清单哈希前后不变。

## 基线失败与根因

首次只跑 `--auto-auth-check` 时，Godot 解析通过，但认证检查以如下状态失败：

```text
gm_tools=false gm_identity_safe=false
```

其余认证、玩家隔离、QA 权限、资产状态和敏感信息隐藏布尔量均为 `true`。根因不是生产 GM 策略回退，而是该自动检查仍冻结在旧目录数量：

- 服务端 GM 命令断言仍期待 10 项；当前 `GmQaAccessPolicyModel` 的严格策略为 12 项；
- 客户端身份摘要仍期待“可用功能 29 项”；当前严格策略为 31 项；
- Phase 496 已通过策略校验、面板目录校验和服务端测试冻结 `12 / 31 / 9` 合同，因此恢复旧数量会削弱当前产品边界。

修复只调整 QA 自动检查，不修改生产命令、权限、协议或玩家 UI：

1. 服务端命令验证改为与 `GmQaAccessPolicyModel.server_command_ids()` 的完整有序列表精确相等，而不是只比较陈旧数量；
2. 身份摘要期待文本从 `GmQaAccessPolicyModel.client_command_ids().size()` 推导，仍验证正常 UI 实际展示的总数；
3. 按新 `_run_auto_auth_check` 正文更新隔离车道的固定 SHA-256 源合同，没有绕过、删除或放宽源完整性检查。

修复后 `--auto-auth-check` 独立复跑为 `2/2 passed`，并在完整矩阵中再次通过。

## 目标检查矩阵

最终矩阵从当前运行器发现的 223 个字面量自动检查中，按 R0.06 范围选择下列 34 项：

| 范围 | 检查 |
|---|---|
| 地图、世界与当前 Firebud 候选 | `--auto-world-presentation-profile-check`、`--auto-map-visual-review-showcase-profile-check`、`--auto-firebud-village-service-layout-check`、`--auto-movement-check`、`--auto-mouse-click-check`、`--auto-pathfinding-check`、`--auto-npc-interaction-check`、`--auto-npc-collision-check`、`--auto-facility-dialog-options-check`、`--auto-map-transfer-check`、`--auto-encounter-check`、`--auto-facility-marker-check`、`--auto-map-region-contract-check` |
| 音频 | `--auto-audio-runtime-check`、`--auto-audio-impact-review-model-check`、`--auto-audio-music-review-model-check` |
| 融合与共享肖像 | `--auto-pet-portrait-art-catalog-check`、`--auto-pet-shared-portrait-consumer-check`、`--auto-pet-fusion-skill-policy-check` |
| 宠物与当前 Bui 动作资产 | `--auto-pet-template-catalog-check`、`--auto-pet-management-check`、`--auto-pet-management-safety-check`、`--auto-pet-action-asset-check`、`--auto-pet-growth-authority-check` |
| 战斗 | `--auto-battle-check`、`--auto-battle-auto-10v10-check`、`--auto-battle-feedback-check`、`--auto-battle-action-catalog-check`、`--auto-battle-action-system-check`、`--auto-battle-visual-timing-check`、`--auto-battle-reaction-check`、`--auto-pet-battle-review-lab-check` |
| 当前认证与 QA 入口 | `--auto-auth-check`、`--auto-qa-panel-check` |

本矩阵没有选择 `--auto-map-visual-runtime-check` 和 `--auto-map-panel-check`。Phase 481 明确冻结了它们的生命周期语义：普通运行时仍绑定已发布 Firebud v1，而权威地图数据已经进入待审 v2，v1 frozen hash 因而有意失效并 fail closed。把这两项在所有者批准前强行改绿，会让未批准 v2 偷跑到普通玩家路径。它们必须在 R1.01 所有者批准并 promotion 后，与严格碰撞和最终发布审计一起重新执行。

## 验证命令与结果

### QA 源合同与运行器

```bash
python3 -B tools/godot_qa_user_data_lane.py source-check --repo-root .
python3 -B -m unittest tools.test.test_godot_qa_user_data_lane
node --test tools/test/run_godot_auto_checks.test.mjs
```

结果：

- 源合同：`source_contract_passed`；
- 隔离车道：`78 tests / OK`；
- Godot 自动检查运行器：`48 tests / 48 pass / 0 fail`。

### 认证检查独立复跑

```bash
node tools/run_godot_auto_checks.mjs \
  --only=--auto-auth-check \
  --fail-fast --timeout-ms 180000 \
  --output-dir .run/godot_auto_checks/r0_06
```

结果：`2 selected / 2 passed / 0 failed`，包含 Godot 解析和认证检查。摘要：

```text
.run/godot_auto_checks/r0_06/2026-08-19T22-39-31-371Z_summary.json
```

### 完整目标矩阵

使用同一运行器、同一 `--fail-fast` 与 `180000 ms` 单项超时，向 `--only` 传入上表 34 个标志。结果：

```text
runner_status=passed
complete=true
completed=35 selected=35 skipped=0 passed=35 failed=0
elapsed_ms=244885
processGroupsClosed=true
```

摘要：

```text
.run/godot_auto_checks/r0_06/2026-08-19T22-40-02-354Z_summary.json
```

运行器实际 Godot 版本为 `4.7.stable.official.5b4e0cb0f`。两次成功运行都先执行真实 Godot 无头解析；没有用日志文本或同帧 helper 代替解析与输入检查。

## 隔离车道与数据安全

- 所有 Godot 解析和目标检查均运行在 `beastbound_qa_automation` 固定隔离车道；
- 完整矩阵结束时 `qaLaneCleanup.status=cleaned`、`laneAbsent=true`；
- `processGroupsClosed=true`，收尾后没有候选运行器、Godot 或车道 helper 孤儿进程；
- 真实玩家目录包含 696 个清单项，运行前、预检后、清理后 SHA-256 均为：

```text
313debc60d2641f8aaa70e34c34f637949c622a30f7c8e54ca0b953d73bf719c
```

- 本阶段没有启动服务端、没有运行 live 检查、没有访问数据库，也没有创建或修改真实玩家账号。R0.06 的所选检查均可离线完成，因此“live 只能连接本地 QA 后端”的条件没有被触发。

## 非目标与剩余风险

- 本阶段没有修改玩家可见代码或资源，因此不以新的截图、人眼验收或性能数据作为完成条件；真实 `Main.tscn`、1280×720 主路径与静止/移动性能属于下一项 R0.07；
- 本阶段没有运行完整服务端套件或 `tools/run_local_ci.mjs`；服务端完整零失败证据已由紧邻的 R0.05 给出，本轮使用客户端最窄门禁；
- 自动检查通过不等于 Firebud、融合肖像、音频或 Bui 战斗表现获得项目所有者批准；这些 `owner_review_pending` 候选仍必须在 R1 分项人眼/人耳验收；
- 本阶段不提前完成 R0.07–R0.09，也不更新 `stoneage_gap_plan.md`；当前生产发布结论仍为 `BLOCKED`。

下一任务：`R0.07 AUTO｜真实客户端基线与性能证据`。
