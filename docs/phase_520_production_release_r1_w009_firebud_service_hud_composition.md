# Phase 520：生产发布 R1.W009 Firebud v2 服务区与 HUD 边缘构图二次收敛

日期：2026-08-23

## 目标与结论

本阶段只关闭 `R1.W009 AUTO｜Firebud v2 村口右下服务区与 HUD 边缘构图二次收敛`。不提前处理 W010 的正式动作帧 HUD 字形稳定性，也不把本轮阶段录片写成 W011 的正式冻结证据。

W007 退回时看到的拥挤不是单一 NPC 坐标问题。旧镜头只横向避让右侧任务栏，门禁又主要检查玩家脚点和 blocking／interaction 物件的 draw rect；完整 NPC alpha、透明边裁后的关键环境轮廓、顶部 HUD 和底部操作栏没有进入同一构图模型。因此局部移动角色后，仍可能把另一名 NPC 推入任务栏，把花箱压入底栏，或让画面边缘只剩半个主体。

W009 已完成三层收敛：村口六名既有服务 NPC 与两个既有物件做显式、可回归的局部重排；镜头改为对完整 alpha 与全部固定 HUD 做有界二维求解；录片门禁要求村口 `14/14` NPC 同屏完整、NPC／关键环境与 HUD 无交叠且无视口裁边。最终真实 Main 画面已复核通过，性能无热路径回退。候选仍待审、普通玩家不可达。

## 村口布局与玩法合同

### 六名 NPC 的显式位置调整

| NPC | 旧格 | 新格 | 保持不变 |
|---|---:|---:|---|
| 转生导师阿岚 `firebud_rebirth_mentor` | `[12,13]` | `[9,14]` | 身份、对白、`rebirth` 服务、appearance、朝向、阻挡与可接近 |
| MM 试炼导师阿澄 `firebud_pet_mm_trial_mentor` | `[14,11]` | `[8,12]` | 身份、对白、`pet_mm_trial` 服务、appearance、朝向、阻挡与可接近 |
| MM 二阶管理员阿岚 `firebud_pet_mm_stage2_keeper` | `[11,11]` | `[11,14]` | 身份、对白、`pet_mm_stage2` 服务、appearance、朝向、阻挡与可接近 |
| 道具商阿芸 `firebud_shopkeeper` | `[3,14]` | `[5,16]` | 身份、对白、`item_shop` 服务、appearance、朝向、阻挡与可接近 |
| 福利员阿檀 `firebud_welfare_clerk` | `[7,8]` | `[6,9]` | 身份、对白、`welfare` 服务、appearance、朝向、阻挡与可接近 |
| 说书人阿舟 `firebud_storyteller` | `[14,15]` | `[8,17]` | 身份、对白、`storyteller` 服务、appearance、朝向、阻挡与可接近 |

其余八名 NPC 的格子也未改变。对 HEAD 基线和当前地图做结构化对账时，删除 `cell` 后的全部 `interactionPoints`、`gridSize`、`spawnCell`、`spawnPoints` 和 `encounterZones` 精确一致；中央主路、遇敌区、warp、spawn、地图尺寸均未改。服务端仍按权威 NPC 身份和当前距离校验服务，不能由客户端 metadata 越权。

### 物件、碰撞与哈希同步

两个已有物件只做一格横向调整，并把 binding footprint 与权威 `blockedCells` 同步移动：

- 服务亭锚点 `[10,5]→[11,5]`，footprint `[8,4],[9,4],[10,5]→[9,4],[10,4],[11,5]`；
- 下方花箱锚点 `[12,20]→[11,20]`，footprint `[11,20],[12,20]→[10,20],[11,20]`。

没有删除服务、缩小碰撞、移动 warp/spawn 或扩大玩法地图。最终权威闭包为：

| 文件 | SHA-256 |
|---|---|
| 村口 map JSON | `0056603ae7b9b748858ec2d800a684b504af2a24c3dd9c4b7dd85436482dbc1f` |
| 村口 v2 binding | `571a65eaa75888488883c9a9b00cf2ba40ec17e1aefc408cabd06b7718f27afa` |
| catalog contract | `b997d23bca7235d487af8139d0e4593f16902fca34efd55767e439e46375e9f9` |

严格 pending runtime 报告村口 `672 ground draws / 18 objects / 221 protected cells`，binding、mapData、manifest 声明哈希和 live catalog 字节一致。离线 auditor 最终为 `134 files / 102 PNG / 4 JSON / status=PASS / errors=[]`。

## 完整 alpha 的二维安全构图

`WorldCameraSafeAreaModel.composition_anchor_avoiding_rects` 以冻结的 40/60 基础锚点为起点，在安全区内构造 HUD 边缘、主体 alpha 边缘和视口边缘候选坐标，按以下顺序做确定性评分：

1. 固定 HUD 交叠主体数量；
2. HUD 交叠面积；
3. 可见主体的视口裁边数量；
4. 同屏可见主体数量；
5. 相对基础锚点的位移距离。

右侧高任务栏只允许向画面内侧避让，不能靠把整个村庄向上或向下推走来隐藏服务。主体集合包含玩家交互体、14 名 NPC 的真实纹理 `get_used_rect()` alpha，以及所有 blocking／interaction 关键环境物件的真实 alpha；固定 HUD 集合包含顶部、右侧任务栏、消息栏和底部操作栏。纹理 alpha rect 按资源路径缓存，场景主体按 map/render revision 缓存，最终镜头锚点按玩家格、HUD 几何、viewport、zoom 与 visual revision 缓存，避免在移动热路径做完整扫描。

独立模型回归得到二维锚点 `[325,254]`，同时清除任务栏与底栏冲突；无冲突样例保持基础锚点不漂移。

## 录片门禁与真实 Main 复核

`map_visual_review_capture.gd` 和 `record_firebud_v2_owner_review.py` 现在共同验证：

- 正常任务栏和底栏必须可见；玩家必须避开全部固定 HUD；
- 村口必须发现且同屏完整呈现 `14/14` NPC alpha；
- 冻结的 7 个关键环境主体必须全部进入审计集合；
- 可见 NPC／关键环境不得与任一固定 HUD 相交，也不得被视口边缘部分裁切；
- idle/moving 均保存 alpha screen rect、可见集合、交叠集合和裁边集合；
- moving 必须由跨帧 `InputEventMouseButton` 完成且实际改变玩家格。

普通四段 reel 的 moving 目标允许选择“目标格本身精确无碰撞／交互”的近邻格，避免仅为保留两格动作证据余量而绕行八格；移动后若打开对话、菜单、战斗或 pending interaction 仍会失败。W011 的 `movement_path / warp / collision / occlusion` 正式动作变体继续使用原两格严格余量，没有放宽。

最终通过 run 为 `.run/evidence/r1_w009/r1-w009-composition-20260823-m/`：

- `1280×720 / 30fps / 1.00× / 840 frames / 28.0s`；
- 村口／训练场 × idle／moving 四段 native 与 MovieWriter 全部 PASS；
- 村口 idle 与 moving 均为 `npcAlphaSubjectCount=14 / visibleNpcCount=14`，四个交叠／裁边数组均为空；
- 村口 moving 从 `[3,15]` 到 `[4,18]`，按下帧 `9`、释放帧 `11`，真实跨帧输入成立；
- 完整 H.264/AAC 解码、QA lane 逐段清理、普通玩家资料不变、网络请求未发生。

| scratch 材料 | SHA-256 |
|---|---|
| `summary.json` | `b52ed5635f23ea09a4cd5e2ef1e79d92188a78ac5d8613c5af0524e5d6d9b3d0` |
| 28 秒视频 | `71dae55cb43ac0510867ae7ef1c04d67c19d7d5e3167332af46c18bf2a510525` |
| 8 帧 contact sheet | `3721d600c4fc722af98e32c6b718dfe8ca6819848a91d55faada576da0fb1028` |
| `SHA256SUMS` | `5c9bb3c4a2a9fbc7307cd6e9264e9b457f710f3d067e1664a781675bead4eb67` |

人眼复核确认：14 名 NPC 分布在中央路两侧，右侧任务栏与底栏之间留白稳定；记录柱、花箱、交易台和正常 HUD 均完整可读，没有通过隐藏 HUD、删服务或裁掉角色获得通过。

首次最终重录 `...-l` 因磁盘可用空间仅约 `5.77GiB` 触发 Godot MovieWriter `WARNING`，录片器按规则失败关闭，没有把片段当作通过证据。清理仅限两个 Beastbound worktree 的可再生成 `.run` 原始 AVI、W009 失败中间目录和旧 `.run/tmp/phase477-publish` 缓存；源码、正式资产与 bundle evidence 未删。空间恢复后 `...-m` 无告警通过。

## 性能

最终性能 run `.run/evidence/r1_w009/performance/r1-w009-composition-perf-20260823-b/` 覆盖 `baseline_v1 / candidate_v2_review × 两图 × idle/moving`，结果 `8/8 @ 60fps`。两条 moving 均为真实跨帧鼠标输入，且 `moved/coalesced/settled/final_match/screen_roundtrip=true`。

| v2 场景 | process_total 平均／最大 | camera 平均／最大 | draw_world 平均／最大 |
|---|---:|---:|---:|
| 村口 idle | `0.166/0.190ms` | `0.031/0.040ms` | `0.013/0.120ms` |
| 村口 moving | `0.302/0.600ms` | `0.058/0.100ms` | `0.130/0.490ms` |
| 训练场 idle | `0.160/0.180ms` | `0.030/0.030ms` | `0.011/0.100ms` |
| 训练场 moving | `0.258/0.510ms` | `0.037/0.050ms` | `0.163/0.380ms` |

- performance summary SHA-256：`8696687e12d5261bf7a34ea232cbae6a7a8d8630269ed5f9259839b290d21017`；
- performance `SHA256SUMS` SHA-256：`215f6e5a826779b5ed8fb01b1a1c733875beb15fc7f6ad5a00f4d145e186be7d`。

## 生命周期与正式证据边界

W009 改变了村口 mapData 与 binding，因此刷新了 catalog contract 与 manifest 引用；W006 的正式 collision/Computer Use/performance/runtime screenshots 仍只保留在 `superseded*` 谱系，活动正式槽保持空。没有覆盖旧 collision receipt/audit，也没有用本轮 scratch 录片冒充正式冻结。

离线审计的 9 个剩余门槛精确为：

- `collisionAudit.valid_report`；
- `computer_use_report`；
- `dressed_reference`；
- `layered_preview`；
- `performanceReport.valid_report`；
- `runtime_screenshot_coverage`；
- `owner_acceptance`；
- `release_attestation`；
- `lifecycle_released_and_enabled`。

前六项由 W011 在 W010 修复后的同一最终候选重新冻结；后三项必须等待 W012 OWNER 结论与后续 promotion。当前严格保持：

- `status=owner_review_pending`；
- `ownerReviewStatus=pending`；
- `releaseApproved=false`；
- `runtimeEnabled=false`；
- `ownerAcceptance=null`；
- `releaseAttestation=null`。

## 验证

1. `git diff --check`、四个变更 JSON 的 `jq empty`、Python compile 与 HEAD/当前地图非坐标字段结构对账均通过。
2. `world_camera_safe_area_model_check.gd` PASS；Godot parse 加 movement、pathfinding、world presentation、showcase、NPC interaction、service layout、NPC collision、map transfer、encounter、NPC quest marker 为 `11/11 PASS`。
3. recorder + map evidence builder Python 回归 `27/27 PASS`；map bundle auditor 回归 `17/17 PASS`。
4. 服务端权威地图／服务权限回归 `42/42 PASS`。
5. 严格 pending runtime 与 review catalog 均 `PASS / errors=[]`；v1 因 staged v2 权威数据不同继续按设计 fail closed。
6. bundle 离线审计 `134 files / 102 PNG / 4 JSON / errors=[] / releaseReady=false`，只剩上述 9 个后续门槛。
7. 最终真实 Main 视频、媒体完整解码、四段 native/MovieWriter、14/14 NPC alpha 门禁、QA lane 清理和性能 `8/8 @ 60fps` 全部通过。

本任务不是完整 release/export gate，按定向验证规则没有运行 `node tools/run_local_ci.mjs`。`.run` 材料不进入版本控制。

## 已知剩余问题与下一任务

最终 contact sheet 仍能复现 moving 等后帧中右侧任务页签／正文／按钮字形偶发缺失；W009 没有伪造静态文字、隐藏任务栏或把它混进构图修复。

下一任务是 `R1.W010 AUTO｜Firebud v2 正式动作帧 HUD 字形稳定性根因与修复`。W009 到此结束，不在同一轮启动 W010。
