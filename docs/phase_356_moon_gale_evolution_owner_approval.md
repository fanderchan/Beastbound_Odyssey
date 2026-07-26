# Phase 356：月岚风狐进化演出单项批准与门禁复验

日期：2026-07-26

## 用户决定与批准范围

项目所有者观看 Phase355 的 1280×720、全程 `1.00x` 权威成功演出成片后回复“没啥问题，继续”。本阶段据此把月岚风狐的当前进化视觉及该成片中的成功演出呈现登记为：

```text
scope=evolution_visual_only
ownerReview=approved
runtimeEnabled=false
```

批准范围只包含高地风狐到月岚风狐的 12 帧视觉，以及权威档案已应用后由正式结果模型触发的演出呈现。它不批准：

- 月岚风狐独立宠物战斗包；
- 月岚风狐人物骑乘战斗包；
- 月岚风狐整宠 bundle 或 mounted bundle；
- 高地风狐到月岚风狐的生产进化路线；
- 晶甲乌力路线或全局进化运行开关。

因此两条路线继续 `assetGate=deferred`，宠物视觉、整包、路线及全局 `runtimeEnabled` 全部保持关闭，P1.3e 不勾选。

## 审批证据

所有者接受的证据是 Phase355 真实 `Main.tscn` 成片：

```text
.run/evidence/phase355_moon_gale_evolution_runtime/
  Beastbound_Phase355_Moon_Gale_Evolution_Runtime_1x.mp4
```

- SHA-256：`8aed5d5e89ee0429eee306ac295d45d3e599ed7270605c444074b07f7fcb7139`；
- 1280×720、60 FPS、436 帧、7.266667 秒；
- H.264 + AAC 48 kHz 双声道；
- 核心 12 张进化帧各保持 5 个视频帧，即 12 FPS、严格 `1.00x`；
- 全片完整解码通过。

审批记录固定在：

```text
client/godot/assets/pets/driftfox_evolved_moon_gale_wind7_water3/
  qa/evolution/owner-decision.json
```

`petBundleReleaseApproved=false`、`evolutionRouteReleaseApproved=false` 和 `routeRuntimeEnabled=false` 继续作为显式边界。

## 四项客户端门禁复验

开始本阶段前，一份辅助只读审核曾报告四项客户端门禁可能缺失。对当前 HEAD 逐项追溯后确认，这四项已在 Phase355 提交中实现并有反例测试；本阶段没有重复修改正确代码：

1. 四样本矩阵允许合法的 `sample_missing`，缺失样本必须为 `present=false`、`eligible=false`、`matchesExpectation=false`，不会被误判成同步失败；
2. `presentCount`、`expectationMatchedCount` 与 `primaryInstanceId` 必须由实际四样本矩阵严格推导，摘要篡改或主宠错配会失败关闭；
3. 公开成功结果同时校验源/目标 form ID 与中文名称，名称篡改和跨路线结果都不会播放；
4. 资产门禁必须恰好包含乌力与风狐两个唯一 route ID，重复路线不能伪造两条完整门禁。

`gm_pet_evolution_qa_client_model.gd` 的 contract check 已覆盖样本删除、摘要错误、主宠错配、异常战力和重复路线；`pet_evolution_presentation_model.gd` 已覆盖目标 ID、目标名称和跨路线篡改。

## 验证

执行并通过：

- Node 进化、GM、HTTP、durable、目录与平衡定向测试：`27/27`；
- Godot parse 与 `--auto-pet-evolution-ui-check`：`2/2`；
- Pet Design Inspector：`errors=0 warnings=0`；
- Battle Action Catalog：通过；
- 月岚 owner decision、QC、动作元数据和路线 JSON 解析：通过；
- owner decision/QC SHA-256 引用：一致；
- `git diff --check`：通过。

本阶段没有改变客户端玩法代码、服务端、协议、数据库、宠物数值、消耗或真实玩家档案；没有连接共享后端/MySQL，也不需要重录视觉完全相同的 Phase355 成片。未运行全量本地 CI，定向门禁覆盖本轮审批元数据风险。

## 当前结论

```text
moonGaleEvolution.ownerReview=approved
moonGaleEvolution.approvalScope=evolution_visual_only
moonGaleEvolution.runtimeIntegrationReview=owner_review_approved
moonGaleEvolution.runtimeEnabled=false
moonGalePetBundle.ownerReviewStatus=pending
moonGalePetBundle.runtimeEnabled=false
wuliRoute.assetGate=deferred
moonGaleRoute.assetGate=deferred
petEvolution.runtimeEnabled=false
P1.3e=not_complete
```

下一步先处理月岚独立战斗包的历史 512px canonical 来源债务，再把两只进化宠的独立/骑乘战斗动作整理为一条正常 `1.00x` 集中验收片。只有对应范围经项目所有者明确认可后，才讨论整宠和生产路线开放。
