# Phase 534：R1.04 融合候选首发延期运行时门禁

日期：2026-08-26

## 目标与结论

本阶段执行 `R1.04 AUTO｜执行融合候选验收结论` 的“首发延期”分支。依据 R1.W020 的受委托复验，
当前两张画像与完整融合结果流程停止无证据返工并作为内部候选冻结，但不提升为生产运行内容。

结论为：

- 两条正式配方继续登记在关闭目录，`runtimeEnabled=false`；
- 正常玩家宠物页的既定“融合”按钮仍只打开关闭说明页，可返回宠物页，报价／确认／网络请求全部为 `0`；
- 服务端对两条正式路线的报价和执行均返回 `pet_fusion_disabled`，不写档案、持久化、随机权威或幂等回执；
- QA-only 预览继续要求精确令牌并与正常玩家目录隔离；
- 原子 promoter 只读检查继续 `blocked / productionClosed=true`，没有生成 owner 产物或执行 promotion；
- `releaseApproved / runtimeEnabled / playerEntryOpened / portraitReleaseGate` 继续全部为 `false`。

R1.04 因此安全完成。它只证明延期候选不可执行，不代表画像已获项目所有者批准，也不代表 P1.4 或生产
发布完成；下一任务转到 `R1.05 OWNER｜村庄与洞穴环境音人耳验收`。

## 冻结字节与缺失发布产物

当前精确哈希：

| 对象 | SHA-256 |
|---|---|
| `pet_fusion_recipes.json` 完整文件 | `26a5c3b187aec194cfec8aa08b2e41527d57b53eda22091b5b12b3e3f67b90ca` |
| 历史非骑乘视觉决定 | `852f8772cfbe2223479d6af2b3b81cff2a79125b4f4ca3343c2912dfc6303d14` |
| 曜冠运行画像 | `94f268b58859fff9ff89dee21de7f611c01e279a0dd2d3c2c1c22321d60d8b59` |
| 苔垒 V4E 运行画像 | `0d4aba0c27e449dc77a161720c7c553d630e0eb0f69af8d9c19ee52738a9f124` |
| 本轮关闭 verifier 报告 | `54d1c09b315dfcc70ed8b99853d11998b98b389c0fe57db21fc3dcacf23bc82a` |

关闭 verifier 报告位于：

```text
.run/audit/r1_04_fusion_deferred_runtime/closed-verifier.json
```

报告为 `PASS / 2 forms / 1350 copied / 22 portrait / 2 QA controls`，并确认 Git index 权威、两份画像
仍为 `owner_review_pending / semanticIndependenceVerified=false / releaseGate=false`。

以下四个生产批准产物继续精确缺失：

```text
client/godot/data/pet_fusion_runtime_release_attestation_v1.json
client/godot/data/pet_fusion_runtime_release_owner_decision_v1.json
client/godot/assets/pets/emberhorn_fusion_solar_crown_fire7_wind3/portrait/owner-decision.json
client/godot/assets/pets/emberhorn_fusion_moss_rampart_fire4_earth6/portrait/owner-decision.json
```

没有用空文件、伪造 digest 或生命周期字段填补这些预期缺口。

## 原子 promoter 仍失败关闭

只读运行：

```text
python3 tools/promote_pet_fusion_runtime_release.py --check
```

按预期以退出码 `1` 返回：

```text
mode=check
status=blocked
productionClosed=true
closedBaseline.status=PASS
exportContract.status=passed
```

阻断精确为：缺少 explicit owner approval input，以及曜冠／苔垒两张画像的可信 owner digest 未固定。
这三项属于项目所有者未来亲自批准后的受绑定输入，不是本阶段可以代签或自动生成的工程产物。

## 服务端关闭与零副作用

运行：

```text
node --test \
  server/node/test/auth-pet-fusion-closed-http.test.js \
  server/node/test/pet-fusion-recipe-catalog.test.js \
  server/node/test/pet-fusion-release-attestation.test.js
```

结果为 `53/53 PASS`。关键覆盖包括：

- 曜冠、苔垒两条正式生产路线各使用三只真实合格的一转 Lv131–140 材料；
- 报价、首次执行和同 operation ID 重试均失败关闭；
- 关闭态不打开随机权威，不改变 profile revision、三只宠物、服务 snapshot、store 或 durable receipts；
- 畸形／额外字段、重复材料、未知配方、陈旧 revision／catalog 和未认证请求保持既定校验优先级；
- 历史已提交回执只做幂等重放，不会因当前关闭态再次执行融合；
- 开启目录必须同时通过正式资源、owner、画像和 release attestation 门，测试绕过仅允许显式 `test://`。

## 客户端关闭与正常 Main 路径

定向检查全部通过：

- Godot 4.7 headless parse；
- `pet_fusion_panel_check.gd`：两路线 1280×720 布局、正式画像、无占位、关闭态、无效 QA token、
  pending／success／failure 均 `PASS / errors=[]`；
- `pet_fusion_client_domain_check.gd`：`productionClosedExact / closedZeroRequest / closedStaleQuoteRejected /
  clientReleaseAttestationGate` 等全部为 `true`；
- `pet_fusion_contract_check.gd`：目录、商业策略、请求构造、权威结果和持久化合同全部 `PASS`。

正常 `Main.tscn` 运行：

```text
node tools/run_godot_auto_checks.mjs \
  --only --auto-pet-management-check \
  --fail-fast \
  --output-dir .run/godot_auto_checks/r1_04_fusion_deferred_runtime
```

结果为 `2/2 PASS`。玩家路径精确报告：

```text
fusion_entry=true
fusion_return=true
fusion_requests=0
```

这里的 `fusion_entry=true` 只表示玩家可以打开“尚未开放、当前不会消耗任何宠物”的关闭说明页，不表示
`playerEntryOpened=true`。关闭页三材料位、候选宠、报价和确认全部禁用，不能构造客户端请求；返回后恢复宠物页。

日志 SHA-256 为 `b3f5a92b83fa751303658ab2bd2b45e645a4f7f8b2ad845273057d13444cee52`，摘要 SHA-256
为 `1b5c971fbadbe02c7e525a35e92bc79682f46c6a0f490fb32b1bed0f79ca2327`。两个 Godot 进程组均
`exit=0 / process_group_closed=true / residual=false`；QA lane 清理为 `lane_absent=true`，真实玩家目录 inventory
SHA-256 在运行前后均为 `76e0d316265fa2f404dd878da9521184e49aed9cfe8392c286067783848eb803`。

## 工具路径门禁与收口

本轮第一次把 verifier 输出请求到 `.run/evidence/`，工具按合同拒绝，要求只能写入 `.run/audit/`；第一次把
Godot runner 输出请求到 `.run/audit/`，runner 也按合同拒绝，要求只能写入 `.run/godot_auto_checks/`。
两次都在任何产品修改前失败，随后使用合法固定根重跑通过。错误轮次的 automation lane 已由 runner finally
清理；独立 `inspect-stale` 确认 `authorityState=absent / laneRootState=absent / laneEntryCount=0`。

这些是输出路径防逃逸门禁生效，不是产品测试失败；没有遗留进程、锁、QA lane 或玩家资料变化。

## 验证汇总与残余边界

- verifier／promoter Python 单元：`34` 项，`33 PASS / 1` 个按设计外部环境 skip；
- 服务端关闭、目录与证明：`53/53 PASS`；
- Godot parse、面板、客户端域、共享合同：全部 PASS；
- 正常 Main 玩家关闭入口：`2/2 PASS`；
- `git diff --check`：通过。

本阶段没有修改产品源码、配方、画像、概率、经济、事务、协议或玩家数据，因此不重复运行完整本地 CI；
W019 同一产品代码已经提供独立性能 `5/5` 和录片内 `46+46` 性能样本。本阶段剩余状态是延期分支的预期：

```text
semanticIndependenceVerified=false
portraitReleaseGate=false
releaseApproved=false
runtimeEnabled=false
playerEntryOpened=false
ownerReviewStatus=owner_review_pending
```

融合候选不是已发布内容，整个生产发布结论继续为 `BLOCKED`。
