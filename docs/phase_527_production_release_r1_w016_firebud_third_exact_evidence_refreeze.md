# Phase 527：生产发布 R1.W016 Firebud v2 第三次返工精确证据重新冻结

日期：2026-08-26

## 目标与结论

本阶段只关闭 `R1.W016 AUTO｜Firebud v2 第三次返工精确证据重新冻结`。基于 W013 的局部 HUD 安全构图、W014 的服务簇／训练分区／地标围合和 W015 的人物完整 alpha 与视觉分级，重新冻结同一最终候选的：

- 村口／训练场各 `pointer / movement_path / warp / collision / occlusion` 五种真实 Main 动作；
- 十项真实 `@oai/sky` Computer Use 前后帧与逐动作 receipt；
- 四段真实 `Main.tscn` 合成的 1280×720、30fps、1× 完整视频；
- collision/catalog/performance 原始 runner 与 manifest-bound 报告。

最终 bundle 离线审计为 `189 files / 112 PNG / 17 JSON / status=PASS / errors=[]`。活动证据已显式 supersede W011，自动证据缺口精确归零；`releaseReady=false` 只剩三个预期门禁：

- `lifecycle_released_and_enabled`；
- `owner_acceptance`；
- `release_attestation`。

因此 W016 已完成，但本阶段没有伪造项目所有者接受、没有生成 release attestation、没有执行 promotion。候选继续保持 `owner_review_pending / pending / false / false`，普通玩家不可达。

## 正式取证发现并关闭的镜头端点缺陷

首次正式动作捕获在训练场遮挡目标 `[18,17]` 暴露了一个真实缺陷：旧求解器按理想镜头锚点避让 HUD，但地图端点会先把 Camera2D 夹到可达范围，导致最终实际人物完整 alpha 仍可能碰到顶部 HUD。仅更换目标格会掩盖问题，不能证明所有端点安全，因此本轮先修复根因再重新取证：

- `WorldCameraSafeAreaModel` 新增 `composition_anchor_avoiding_rects_in_range(...)`，候选只在地图限制允许的锚点范围内求解；
- `main.gd` 根据实际 map camera limits 计算可达锚点区间，并用夹紧后的 base camera 重新计算人物视觉矩形；
- 构图评分把第一个主体固定为完整人物 alpha 的硬优先项，NPC／环境只在人物安全后参与二级优化，并保留人物专属 fallback；
- 正式截图等待由 `10` 帧提高到 `24` 帧，确保移动结束后的镜头平滑真正收敛再冻结。

端点模型夹具得到精确可达锚点 `(456,197)` 且 `errors=[]`；正式 `[18,17]` 截图中的人物完整 alpha 为 `[194.431,157.136,66.175,135.626]`，实际锚点 `(227.842,252.805)`，safe rect、任务 HUD、固定 HUD 和视口边缘四项均通过。该修复没有放宽 HUD 门禁、缩小人物或改变地图拓扑。

旧 `--auto-camera-check` 仍会绑定已退休的 primary v1 生命周期并按设计返回 `runtime_visual=false / lifecycle_errors=8`；它不是当前 v2 镜头回归，也未被计入通过项。当前 v2 的 camera click、world presentation、正式动作和完整视频门禁均已通过。

## 两图十动作正式 Main pair

事务 runId 为 `r1-w016-firebud-actions-20260826-h-formal`。结果为：

- `10/10 PASS`，十张 1280×720 PNG 哈希互不重复；
- pointer 为 idle，其余八项为真实跨帧鼠标移动；
- 每项连续读取六个 viewport RGB 帧，任务页签、标题、正文和自动寻路按钮合计 `60/60 PASS`；
- 人物完整 alpha 均在 safe rect 内，且不与任务／固定 HUD 或视口边缘相交；
- 正式矩阵 SHA-256 为 `7a36ef2effefd403b09b52dd0459307698911ddb21bd2d279ddd3623ef0ed7fa`，单一 HUD 审片板 SHA-256 为 `ba1dc3bbe69abf6531a576375543a9a9d947409ce7962f811e417fab5b3012f1`。

manifest 当前活动引用为：

- 村口 pointer `dressedReference`：`426df55bac65ff593f27e34d397d3d03395f220c0353c8af99a27f61971e98ac`；
- 训练场 pointer `layeredPreview`：`0cbb4b0262a618fbbc56c1d66ae0c10cb0ab101b0f2d893397697d5ce5fc80f1`；
- `runtimeScreenshots`：两图十项截图及对应 capture report 全量绑定。

## 真实 Computer Use

最终原始目录为 `.run/evidence/r1_w016/computer-use-raw-20260826-f/`。十项均通过真实 macOS Godot 窗口与 `@oai/sky` 完成，保留 `20` 张 640×392 原始 JPEG、十份逐动作 JSONL receipt，十张 after 哈希互不重复。

W013–W015 后旧 W011 的村口遮挡点已经不再证明描述中的图腾遮挡。本轮没有沿用失效坐标，而是重新实测干净序列：先点击 `[410,270]` 到记录图腾西北侧，再点击 `[280,270]` 接近木牌任务点，最后点击 `[430,297]` 离开对话；动作后木牌牌面正确遮住人物下半身，头肩仍完整，且不侵入任务 HUD。

正式 `computer-use-review.json` SHA-256 为 `13188311632e2877f01fbc5beedc3d2d80d4a0566ea2646ca2614efc45bbca49`；八张非 pointer after 帧组成的 HUD 审片板 SHA-256 为 `c7909e4fdac5e2b90ec081c21af00a0368d42600ecbcebe22464cbf182904a85`。安装事务返回 `10 actions / 10 unique screenshots / 8 HUD images / PASS`。每次专用 QA 窗口关闭后均证明 automation lane 消失、真实玩家 inventory 在该次运行前后不变。

## catalog、collision 与性能冻结

全部正式报告绑定以下精确运行面身份：

`git:b654c3f8631a4775f1e541ab86b0b48f9696fc92+beastbound-map-runtime-surface-v2:63f1bb9ab334e9033a00eda7951226c37b13c88ce97726f45765c61683bb0fd2`

| 证据 | SHA-256 | 结论 |
|---|---|---|
| catalog contract | `ee5192125d6f20d756651c000f7b4bee4ebacbd116389161deebe0d8abe5dbdc` | current hash、normal lifecycle 与 pending preview 合同 PASS |
| collision 原始 runner | `91c79f64aaa283eb403764ddb9aa74990c745afcaafca389d555c55fe765e10f` | pending catalog preview 顶层及目标报告均严格验证 |
| collision audit | `d32e84de942d8a85e734b952823225d641ac0e6159111d0e2e7eb71627523775` | blockedCells、footprint、路径、spawn、warp、NPC approach、encounter 与哈希八类全 PASS |
| performance 原始 runner | `70eb8e4e67b354048d0d718b82f6f04724b45fed067129380f903f8841841654` | 两图 × baseline/candidate × idle/moving 共 `8/8` 真实 Main Metal 运行 |
| performance report | `251c67e139db12674be863efe8903f622e1a904c60cebc577d51ee0e25bbf493` | 候选绝对阈值与相对基线回归阈值全部 PASS |

正式性能结果：

| v2 场景 | process_total min/mean/max | 真实跨帧点击 | 相对基线均值增量 |
|---|---:|---:|---:|
| 训练场 idle | `0.290/0.376/0.430ms` | 不适用 | `+0.065ms` |
| 训练场 moving | `0.500/0.500/0.500ms` | `37` | `+0.200ms` |
| 村口 idle | `0.290/0.381/0.450ms` | 不适用 | `+0.070ms` |
| 村口 moving | `0.390/0.540/0.690ms` | `16` | `+0.230ms` |

两项 moving 均为 `moved/coalesced/settled/finalTargetMatched=true`，且没有进入战斗或遇敌；候选 idle mean 均低于 `0.5ms`，moving mean 均低于 `0.6ms`，回归增量低于 `0.1/0.35ms` 门槛。

## 完整 1280×720 验收视频

最终目录：

`.run/evidence/r1_w016/video/r1-w016-firebud-review-20260826-a/`

视频覆盖村口／训练场 × idle／moving 四段真实 `Main.tscn`：

- H.264 `yuv420p` + AAC、1280×720、30fps、1.00×；
- `973` 帧、`32.433333s`，`973/973` 连续 HUD 字形帧通过；
- 视频／音频全流解码 PASS，四段 QA lane 全部清理；
- `summary.json` SHA-256 `e0d0599c4eb888035fa6ea3898733239e7bc9545e1c90d7bdbab0f946ebf6701`；
- `SHA256SUMS` SHA-256 `62904ae8ac483b28f1f5ae5c73b4e05da0cb2ffc23922baee1e642b5663cbdb8`；
- 完整视频 SHA-256 `793afafda8b4a909fbdda515ddcc611e3256bcfe3b3b4e98958e2dae186f2723`；
- 八帧联系表 SHA-256 `625598e0f72b0117756dcdc920ec4631fdf09d40901e63c65240e88a55d0660b`。

联系表逐格复核确认：村口首屏不再是全图人物展板，入口民生／宠物照料／高阶成长分区有明确留白；训练场围栏、靶架、蜂蜜岩与村口亭形成分段空间层级；人物完整、道路过渡连续、任务 HUD 始终可读。

## 验证

以下检查均在隔离候选工作树执行：

1. 正式动作捕获：`10/10 PASS`、十张截图哈希唯一、HUD 连续读回 `60/60 PASS`。
2. 真实 Computer Use：`10/10 PASS`、20 张 raw JPEG、十个唯一 after 哈希、八张任务 HUD after 帧通过独立像素门禁。
3. 完整视频：四段、`973` 帧、全视频／音频解码和 SHA256SUMS 全部 PASS。
4. Python evidence／录片／HUD／性能工具单元测试：`58/58 PASS`；bundle auditor 单元测试：`17/17 PASS`。
5. Godot parse、movement、pathfinding、showcase profile、NPC interaction、服务布局、NPC collision、map transfer、encounter 与 NPC quest marker：`10/10 PASS`；新增 camera click 与 world presentation 定向检查：`2/2 PASS`。
6. 服务端共享地图与服务权限：`42/42 PASS`。
7. 独立真实 Main 性能矩阵和正式 raw runner 均为 `8/8 @ 60fps`；collision/catalog/performance 报告全部 PASS。
8. 最终 bundle 审计：`189 files / 112 PNG / 17 JSON / errors=[]`，缺口只剩三个预期生命周期／人工门禁。
9. Python compile、bundle JSON、manifest 引用哈希、`git diff --check` 通过；本轮启动的进程和 QA lane 均已收尾，未终止仓库外既有 Godot 进程。

本任务不是完整 release/export gate，因此没有重复运行 `node tools/run_local_ci.mjs`。当前改动由更窄、直接覆盖镜头、输入、HUD、地图服务、碰撞、性能和证据合同的检查验证。

## W011 supersede、生命周期与下一任务

manifest 六类 `superseded*` 字段继续保留 W011 的旧哈希作为谱系；当前 `dressedReference / layeredPreview / runtimeScreenshots / computerUseReport / collisionAudit / performanceReport` 全部指向 W016 新材料。旧 W011 哈希不能证明本轮 W013–W015 后的新像素已经被项目所有者接受。

最终生命周期保持：

- `status=owner_review_pending`；
- `ownerReviewStatus=pending`；
- `releaseApproved=false`；
- `runtimeEnabled=false`；
- `ownerAcceptance=null`；
- `releaseAttestation=null`。

下一任务是 `R1.W017 OWNER｜Firebud v2 第三次返工后发布决定`。用户继续委托 Codex 审片时，可以基于本轮材料退回或建议首发延期，但不得伪造 owner acceptance；没有可追溯的明确批准，不得执行 R1.02 promotion。
