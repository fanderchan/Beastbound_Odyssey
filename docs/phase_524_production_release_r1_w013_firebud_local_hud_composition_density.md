# Phase 524：生产发布 R1.W013 Firebud v2 局部 HUD 安全构图与首屏密度纠偏

日期：2026-08-26

## 目标与结论

本阶段只关闭 `R1.W013 AUTO｜Firebud v2 局部 HUD 安全构图与首屏密度纠偏`。W012 的受委托审片确认，W009 为了让全图 `14/14` NPC 同屏完整，把尚未自然进入玩家附近画幅的主体也拉入同一个镜头求解，最终虽然自动门禁无 HUD 交叠，却把村口压成了角色展板。

本轮把 HUD 避让改回局部相机构图：只有在基础无遮挡世界带内、与其相交或距其一个视觉余量的完整 alpha 主体才参与镜头求解。所有主体仍进入审计报告，但不再要求把全图 14 名 NPC 塞进同一安全画幅。正常 1280×720 候选镜头从 `1.55×` 调整为 `1.82×`，让角色和可交互物件恢复可读体量，而不是通过缩小人物掩盖密度问题。

最终真实 `Main.tscn` 四段录片、媒体解码、局部完整 alpha 门禁、真实跨帧移动和性能矩阵全部通过。村口安全世界带在 idle/moving 分别完整容纳 `5/7` 名 NPC，邻近训练场 warp 在两段中均完整可读；全图主体、HUD 交叠和视口裁边数组继续保留为诊断事实。候选仍保持 `owner_review_pending / pending / false / false`，本阶段没有批准、签名、提升或启用 Firebud v2。

## 根因与实现

### 局部主体选择

新增 `WorldCameraSafeAreaModel.nearby_composition_subject_rects`，输入为基础镜头下的完整 alpha 屏幕矩形、无遮挡世界带和默认 `12px` 视觉余量。它只保留：

- 已与基础无遮挡世界带相交的主体；
- 即将从世界带边缘进入的主体；
- 尺寸有效的完整 alpha 矩形。

远离玩家当前画幅的 NPC 和地标不再把镜头拉向全图。进入局部集合的主体仍使用完整不透明 alpha 矩形参与 `composition_anchor_avoiding_rects`，因此没有退回脚点、中心点或缩略包围盒的宽松检查。独立模型回归同时锁定：画幅内主体和贴近边缘主体保留，远处主体排除，原有二维 HUD 避让锚点不变。

### 可读密度与 fail-closed 边界

录片报告新增：

- `safeNpcCount / safeNpcIds`；
- `safeKeyEnvironmentCount / safeKeyEnvironmentIds`；
- 原有全图 `npcAlphaSubjectCount`、可见集合、HUD 交叠集合和视口裁边集合继续输出。

`safe*` 的严格定义是“完整 alpha 被无遮挡世界带完全包围”，不是脚点进入、部分像素进入或被 HUD 盖住也算。村口 default/pointer 的首屏密度冻结为 `4..7` 名完整 NPC；任何安全带 NPC／关键环境与固定 HUD 交叠，或同时出现在视口裁边集合中，录片器和 Godot capture 都失败关闭。邻近 `warp_to_training_yard` 仍必须在安全带内且完整不贴边。

全视口中被固定 HUD 遮住或只露出边缘的远处主体继续进入诊断数组，但不再反向要求把它们全部拉进当前玩家画幅。它们不是本轮“已解决”的视觉对象：W014 必须通过服务簇和训练分区的实际场景重排，让剩余远处角色／物件自然分布到后续路线，而不是继续用镜头算法隐藏布局问题。

### 角色体量

Firebud v2 显式 QA review candidate 的镜头由 `1.55×` 调为 `1.82×`：

- 普通 v1、非候选地图和战斗镜头仍为 `1.0×`；
- 只在 `active + qaPreview + reviewCandidate + bundleId=firebud_region_visual_v2` 的精确 canary 生效；
- world/screen 往返、viewport world rect、进出战斗恢复和服务布局检查均同步冻结 `1.82×`；
- 没有缩小 NPC、修改纹理、隐藏 HUD 或改变玩家玩法地图。

## 真实 Main 证据

最终 scratch run：

`.run/evidence/r1_w013/r1-w013-local-composition-20260826-b/`

录片使用真实 `res://scenes/Main.tscn`，覆盖村口／训练场 × idle／moving：

- `1280×720 / 30fps / 1.00× / 860 frames / 28.666667s`；
- H.264 `yuv420p` + AAC；
- 视频与音频全流解码 `passed`；
- `81/81` 项 `SHA256SUMS`；
- 四段官方 automation QA lane 均完成 owner-bound 清理，未使用普通玩家存档。

| 材料 | SHA-256 |
|---|---|
| 完整视频 | `7d30d7e5d55208de7449c19066b69010e26c91be2fe1d72ea3f6f08bd176ee01` |
| 八帧联系表 | `285997c4dcba1612576907a801eb682fa1e4fa8b829a9dbe36569a5074f0e90a` |

| 片段 | 生效锚点 | 全图 NPC / 当前视口 / 安全带 | 安全带关键环境 | 邻近 warp |
|---|---:|---:|---:|---|
| 村口 idle | `[341.74,341.24]` | `14 / 14 / 5` | `1` | `warp_to_training_yard / edgeClear=true` |
| 村口 moving | `[236.25,360]` | `14 / 14 / 7` | `0` | `warp_to_training_yard / edgeClear=true` |
| 训练场 idle | `[390,330.34]` | `3 / 2 / 2` | `1` | 诊断保留，W014 重做围合 |
| 训练场 moving | `[155.04,205]` | `3 / 2 / 0` | `1` | 诊断保留，W014 重做围合 |

最终代码增加视口裁边 fail-closed 后，四份既有 native capture report 又由最终 recorder 实现逐份重新读取，结果全部 `PASS`；渲染代码与上述通过 run 一致。此前 `...-a` 因村口安全带实际为 `9` 名 NPC 被新密度门禁正确拒绝；试验性的 enclosure-only 局部筛选没有采用，最终代码与 `...-b` 的 intersect+lookahead 逻辑一致。

## 性能

最终性能 run：

`.run/evidence/r1_w013/performance/r1-w013-local-composition-perf-20260826-a/`

`baseline_v1 / candidate_v2_review × 两图 × idle/moving = 8` 次真实 Main 均通过，所有样本保持 `60/60/60fps`。两条 moving 均为真实跨帧鼠标输入，且 `moved/coalesced/settled/final_match/screen_roundtrip=true`。

| v2 场景 | process_total min/mean/max | 真实跨帧输入 |
|---|---:|---|
| 村口 idle | `0.270/0.322/0.360ms` | 不适用 |
| 村口 moving | `0.330/0.396/0.490ms` | `true` |
| 训练场 idle | `0.220/0.282/0.340ms` | 不适用 |
| 训练场 moving | `0.270/0.343/0.430ms` | `true` |

- performance summary SHA-256：`8f050e0c5d5448cb4b80c9d332daf032d4395913e3858a6f2c8f1b392a47f26d`；
- performance `SHA256SUMS` SHA-256：`efd68d38e1b00e3708e27e2c716499a333c26cfe86ad78e2f71c2ebeebcdcd23`；
- `49/49` 项清单通过，八次运行均清理 QA lane，未连接 MySQL、未启动后端、未接受登录／服务器参数。

## 正式证据与生命周期边界

镜头、运行时构图和录片门禁已改变，因此 W011 的截图、Computer Use、collision 和 performance 正式材料不能继续代表当前候选。manifest 已将 W011 的六类活动证据移入 `superseded*`：

- dressed reference：`6dd2f124c4e9...`；
- layered preview：`b36aee1650f2...`；
- runtime screenshots：`10` 项；
- Computer Use：`6d3134bb5fdb...`；
- collision：`0fb6b79e683c...`；
- performance：`c2b55eb24b19...`。

活动 `dressedReference / layeredPreview / runtimeScreenshots / computerUseReport / collisionAudit / performanceReport` 均已清空。离线 bundle 审计为 `134 files / 102 PNG / 4 JSON / status=PASS / errors=[] / releaseReady=false`，九个缺口精确为上述六类新证据加：

- `owner_acceptance`；
- `release_attestation`；
- `lifecycle_released_and_enabled`。

W016 才会基于 W013–W015 同一个最终视觉候选重新冻结正式材料。本轮 scratch 视频与性能只证明 W013 当前实现，没有写入正式证据槽，也没有冒充发布材料。

## 验证与下一任务

1. `git diff --check`、bundle JSON parse 和最终 capture report 重读通过。
2. `world_camera_safe_area_model_check.gd`：`PASS`，局部主体数精确为 `2`。
3. recorder Python compile 与单元测试：`13/13 PASS`。
4. map bundle auditor 单元测试：`17/17 PASS`。
5. Godot parse、movement、pathfinding、world presentation、showcase、NPC interaction、Firebud service layout、NPC collision、map transfer、encounter、NPC quest marker：`11/11 PASS`；最终裁边门禁补丁后的 parse/world presentation/service layout 再跑 `3/3 PASS`。
6. bundle 离线审计：`status=PASS / errors=[]`，九个预期门禁准确缺失。
7. 真实 Main 四段录片、媒体全流解码、最终 recorder 重读和性能 `8/8 @ 60fps` 全部通过。
8. 本任务不是完整 release/export gate，没有运行昂贵的全量 `run_local_ci.mjs`；`.run` 材料不进入版本控制。

下一任务为 `R1.W014 AUTO｜Firebud v2 服务簇、训练分区与地标围合重做`。W013 只关闭镜头把全图拉成展板的根因和安全带密度合同；联系表仍明确显示村口服务关系缺少分区、训练场缺少围合与路线终点层级。这些是 W014 的场景布局任务，不能用继续调镜头、隐藏 HUD 或放宽门禁来代替。
