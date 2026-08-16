# Phase 451：宠物身份回放摘要跨 checkout 可复验

## 结论

宠物身份门的严格 builder 重放继续逐字段、逐像素失败关闭，但回放摘要不再绑定某一台机器的仓库绝对路径。新生成的身份门使用 `metadataReplayDigestContractVersion=2`，把已经验证过的绝对输入路径规范为仓库内相对路径后再计算摘要；同一份资产在不同 checkout 根中会得到同一摘要。

Phase 376 已冻结的曜冠角兽、苔垒角兽 action metadata 和关闭登记清单保持逐字不变。批量审计只在以下条件全部满足时兼容它们的历史绝对路径摘要：

- 形态 ID 和历史 source/candidate 摘要命中唯一共享兼容表；
- action metadata 不声明 v2 摘要合同；
- 当前 action 文件的 SHA-256 和字节数命中关闭登记清单；
- 清单中的 replay 字段变换同时绑定历史 source/candidate 摘要；
- 清单 `boundFile` 继续绑定当前身份流水线文件路径及 SHA-256。

任一字段、文件或登记关系漂移仍会失败，不能靠改 action metadata 和清单中的一个散列绕过门禁。本阶段不修改任何宠物像素、运行开关、项目所有者决定、正式配方或玩家入口。

## 发现经过

Phase 449 赤角兽整体骑乘动作候选在当前工作区通过精确实载门后，又被放进由暂存区构造的干净工作树复验。整体骑乘包本身通过 `12` 动作、`180` 帧、双视角、单一整图主体及无运行时镜像检查，但 36 形态全量审计误报两只既有融合宠：

- `emberhorn_fusion_solar_crown_fire7_wind3`
- `emberhorn_fusion_moss_rampart_fire4_earth6`

两棵资产目录逐文件一致，`finalize_pet_identity_gate.py --check-only` 在两个 checkout 中也都能完成严格重放。唯一差异来自旧 `metadataReplaySha256` 把 builder 重放元数据中的绝对 `input` 路径直接纳入摘要，所以目录前缀变化会改变摘要。

Phase 376 的专用关闭发布校验已经知道这是一项历史冻结事实，因此使用登记清单验证旧摘要，而不是在新 checkout 中用新绝对路径重算。通用 `pet_art_batch_audit.py` 此前没有同等兼容边界，形成了干净克隆假失败。

## v2 合同

`finalize_pet_identity_gate.py` 现在分开处理两个目的：

1. 严格等价验证仍把 pipeline metadata 的相对输入解析为当前 raw PNG 绝对路径，并要求 builder 实际重放元数据逐类型、逐字段完全一致；
2. 只有在严格重放完成后，摘要输入中的 `input` 才规范为相对当前 `REPO_ROOT` 的 POSIX 路径；
3. raw PNG 如果不在仓库根内，或重放元数据的输入不等于已解析 raw PNG，摘要计算立即失败；
4. action metadata 同时记录 `metadataReplayDigestContractVersion=2`，避免把新旧语义混为一谈。

共享兼容值迁入 `tools/pet_identity_replay_contract.py`。融合宠专用关闭发布校验与全量宠物审计读取同一份历史 source/candidate 摘要，避免两个安全门各自维护相同常量。

## 验证

已完成：

- `python3 -m py_compile`：4 个工具和 2 个测试文件通过；
- `python3 -m unittest tools.test.test_finalize_pet_identity_gate`：`24/24`；
- `python3 -m unittest tools.test.test_pet_art_batch_audit`：`42/42`；
- `python3 -m unittest tools.test.test_verify_pet_fusion_closed_release`：`28` 项通过，`1` 项真实外部环境显式跳过；
- 新增双 checkout 真实 builder 重放回归：相同资产在两个不同仓库根得到相同 v2 摘要；
- 新增 schema-2 身份门整仓复制回归：迁移 checkout 后仍为 `identityGate.status=verified`；
- 当前主工作区 36 形态全量审计：`runtime=3 / errors=0 / warnings=0`，关闭形态既有未完成项继续只记为 pending；
- 只含本阶段 7 个文件的合成提交在独立干净工作树通过 `94` 项组合回归（`1` 项真实外部环境显式跳过）、融合关闭发布校验 `PASS`，以及 36 形态全量审计 `runtime=3 / errors=0 / warnings=0`；干净基线没有 Phase 449 候选，因此其 `8406` 条 pending 高于当前脏工作区的 `7698` 条，属于诚实的未完成差异；
- `git diff --check` 通过。

隔离门已通过，可以先独立提交本阶段技术修复，再在新 HEAD 上重建并复验 Phase 449 赤角兽候选。

## 非目标

- 不迁移或重写 Phase 376 冻结 action metadata 与登记清单；
- 不把历史 path-bound 摘要重新解释为 v2；
- 不放宽 builder 元数据、四姿、透明图、来源账本或自审证据检查；
- 不批准融合宠头像、赤角兽整体骑乘候选或任何其他 owner-review-pending 美术；
- 不启用融合、骑乘或宠物运行时入口。
