# Phase 410：融合正式配方隔离事务验收

## 结论

首批两条正式融合配方现在拥有可重复、失败关闭的事务验收器。它读取生产
`pet_fusion_recipes_v2`、正式成长／技能／被动／重置目录和两条 formal recipe，但只允许在固定
`test://pet_fusion_runtime_transaction_audit/production_recipes.json` 目录内临时开启。生产
`pet_fusion_recipes.json` 在运行前后均保持 `runtimeEnabled=false`，文件 SHA-256 均为
`26a5c3b187aec194cfec8aa08b2e41527d57b53eda22091b5b12b3e3f67b90ca`。

本阶段没有连接共享 MySQL，没有读取或写入真实玩家档案，没有创建 owner runtime decision／正式
release attestation，也没有打开玩家融合运行态。P1.4 继续等待项目所有者对专用大头照、融合信息
布局、正常玩家入口和正式运行开放四个范围的明确批准。

## 验收范围

验收器逐条运行：

1. `emberhorn_solar_crown_fusion_v1` → 曜冠角兽；
2. `emberhorn_moss_rampart_fusion_v1` → 苔垒角兽。

每条路线均使用正式血脉基因档和三只资料完整的 `authority-v1` 一转 Lv136 材料宠，覆盖：

- 报价只读，权威档案和持久层快照零变化；
- 同一事务恰好三消一生，成品为新实例、Lv1／一转、目标独立成长档；
- 任一材料绑定时结果绑定；档案 revision 恰好增加一次；
- 随机权威恰好打开一次，公开响应不泄露材料或成品的私有成长／融合 seed；
- 模拟成功响应丢失后，以同一 operation ID 在新服务实例重试，只重放 durable receipt，不重新抽随机；
- 旧 profile revision 与旧 catalog ID 都在新变更和新回执产生前拒绝；
- 注入已确认 MySQL rollback 时，内存权威根与持久层快照都保留原三只材料，零发布、零落盘。

## 隔离边界

工具位于：

```text
server/node/scripts/pet-fusion-runtime-transaction-audit.js
```

只有同时满足以下条件才能临时运行两条正式配方：

- 显式 `allowUnattestedRuntimeForTests=true`；
- 显式 `allowTestOnlyRecipes=true`；
- catalog path 以 `test://` 开头；
- 磁盘生产目录在运行前仍为关闭态；
- 两条配方 ID、目标形态和 formal asset gate 与冻结合同一致。

已开启或目标漂移的生产目录会在构造隔离 catalog 前失败；该工具不是环境变量后门，也不会被生产
服务启动路径调用。

## 证据

忽略目录：

```text
.run/evidence/phase410_pet_fusion_runtime_transaction_audit/final/
```

| 证据 | SHA-256 |
| --- | --- |
| `authoritative-three-pet-atomic-transaction.json` | `309720c1c853e2731f942ea019199026062c1f3f049f9024adcc250fec8e0131` |
| `idempotency-disconnect-conflict-rollback.json` | `fedec9b4f7ecfda3e4c184cea3a42f0066e5eef1d4e95cb31775a51666e0d2ae` |
| `summary.json` | `116cb7939a2c2bcef92c128182494e06c226072c6171259fc577ea576694a4ec` |

三份报告已扫描，不含 session token、密码、私有 seed 或其他凭据。

## 验证

- `node --check server/node/scripts/pet-fusion-runtime-transaction-audit.js`：通过；
- `node --check server/node/test/pet-fusion-runtime-transaction-audit.test.js`：通过；
- 新工具定向回归：`5/5`；
- 融合事务、关闭态 HTTP、durable、配方、release attestation 与新工具组合回归：`82/82`；
- 正式验收器执行：两条路线全部通过，生产目录 SHA 前后相同；
- `git diff --check`：提交前执行。

## 后续门禁

Phase 408 的四类 release validation 现已有：

- `closed_asset_replay`：Phase 376／407 已完成；
- `authoritative_three_pet_atomic_transaction`：本阶段完成；
- `idempotency_disconnect_conflict_rollback`：本阶段完成；
- `real_main_entry_and_performance`：Phase 409 只证明关闭态入口与普通移动性能；正式开放态仍须在 owner
  决定和 attestation 生成后复验。

因此下一步不是直接改 `runtimeEnabled=true`，而是让项目所有者观看 Phase 407 的真实 Main 成片并
明确批准或拒绝四个冻结范围；批准后才能生成正式 decision／attestation、原子切换目录和生命周期，
再录最终开放态 Main 交互与性能证据。
