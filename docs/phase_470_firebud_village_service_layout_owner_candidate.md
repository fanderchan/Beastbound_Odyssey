# Phase 470：火芽村服务区站位与记录图腾验收候选

## 问题与目标

火芽村入口原有 14 名服务 NPC 与记录点柱集中在相邻两三排，最近脚点仅约 40px，15 组角色低于 72.1px，且 3 名服务 NPC 站进遇敌区。实际 `1280×720` 画面因此像测试队列：人物互相遮挡、上下两侧朝向不统一、中央通路不清楚，程序绘制的灰色记录柱也明显低于 Firebud v2 地图品质。

本阶段只重排既有服务区并完善记录点视觉，不新增或改名 NPC，不改 `appearanceId`、服务、任务、对话、商店、碰撞语义、服务端 ID 或记录点出生位置。StoneAge 8.0 只用于确认成熟村落应把服务角色分散成可接近的功能点，不复制其地图、坐标、角色或素材。

## 原创布局规则

- 上侧角色统一朝南、下侧角色统一朝北，视线朝向中央步行带。
- `y=15, x=3..10` 保持完整可行走；每名 NPC 从默认出生点至少有一个可达的八邻接交互格。
- 14 名 NPC 与记录点共 15 个布局对象无重格，全部服务 NPC 离开遇敌区。
- 最近投影脚点距离提高到 `72.11px`，避免 1280×720 下贴身排队。
- `doctor_record` 继续位于 `[10,17]`，记录点 `firebud_record_pillar` 继续位于 `[10,16]`。

## 记录点正式视觉

复用项目自有、来源已冻结的 `firebud_stone_totem.png`，不复制文件、不伪造第二份来源。训练场原来的普通障碍实例改用既有蜜石簇，从而让石图腾的唯一 manifest 定义真实承担 `interaction` 角色。

村口 binding 将图腾精确绑定 `firebud_record_pillar` 和 `[10,16]` 权威碰撞格。`MapVisualRenderer` 将合法 `interactionLink` 送入统一深度层；Main 只在正式地图物件存在时抑制程序占位柱，v1／旧 renderer 仍保留安全回退。深度检查同时锁定“地图物件存在、程序占位物不存在”，防止叠画。

移动压力探针也改为复用正式 alpha 命中与设施命中规则，主动跳过 NPC、设施和地面掉落；它现在只把真实点地事件计入移动性能，避免将“点击 NPC 后走到交互格”误判成移动失败。

## 验证

- `firebud_village_service_layout_check.gd`：`PASS`；`npcCount=14`、`layoutObjectCount=15`、`minFootpointSpacingPx=72.11`、主路清空、遇敌区 NPC 为 0、全部 NPC approach 可达。
- Map visual generation 模式独立检查：Firebud v2 两图 `PASS`；村口 `672` 个 ground draws、`31` 个对象、`207` 个保护格，训练场 `1224 / 19 / 123`。
- 真实 review candidate 的统一深度集成：`PASS`；14 名 NPC、8 个当前视口世界对象、1 个非美术回退交互物，记录图腾无重复程序柱。
- Godot 定向回归：parse、NPC hover／appearance／collision、facility dialog／marker、quest marker、map panel、record point、pathfinding、movement 共 `11/11 PASS`。
- 当前 bundle 正式动作矩阵：两图 × `pointer/movement_path/warp/collision/occlusion` 共 `10/10`，每图五张 `1280×720` PNG 均为不同像素；另以 `@oai/sky` 在真实 `Main.tscn` 完成 10 组点击，冻结 `20` 张 `640×392` 原始窗口前后图和 10 份动作回执。动作刷新器只允许 pending lifecycle，旧证据先归档，任一步失败会恢复全部旧字节。
- 当前 Firebud v1/v2 × 村口/训练场 × idle/moving 八格正式性能矩阵：`PASS`，全部 `60 FPS`、真实跨帧点地、`screen_roundtrip/final_match/settled=true`。v2 村口 idle／moving `process_total` 平均 `0.351/0.400ms`，训练场为 `0.350/0.253ms`；四项候选绝对值与相对回归门均为 `PASS`。
- 当前构建身份为 `git:a4d2cab…+beastbound-map-runtime-surface-v2:b6890d16…`；pending catalog preview 的独立碰撞回执与报告均 `PASS`。bundle 只读审计检查 `101 files / 17 JSON / 39 PNG`，`errors=[]`；未满足项精确为 `owner_acceptance / release_attestation / lifecycle_released_and_enabled`。
- `git diff --check`、JSON 解析与 Godot 4.7 headless parse 通过。

性能回执：`.run/evidence/phase470_firebud_service_layout/performance/phase470-firebud-service-layout-20260817-c/summary.json`，SHA-256 `334cf52d365f9ea9a9ab9f5e9b94a26745bb87200d874d02ae2a00ffc9ab8f8e`，构建身份 `33cd852e7bd10a0bed1b38d5d9a2398f92e2f2897d982bb114da8663f514859d`。

当前正式证据另冻结在 bundle 内：动作矩阵摘要 SHA-256 `2b5df1401181cf7ba1eca72b45aeaf2c16f7b7bedd7d2504fcb372b319937581`，Computer Use 聚合报告 `4e463eeb02f162d53fa07474eb932974a02494b840c5b42e1573f57a77a19003`，性能报告 `ccbac2876378f38d8b4ebd3e4464c43d00f55f3b239410dd69dca6e257fe7620`，碰撞报告 `58c95f0d6f602d184823300e411e9f228404920915f3551c9648531863a1ad04`。

## 冻结画面与发布边界

真实 `Main.tscn` 验收片覆盖村口／训练场的待机与跨帧移动，共 `20.7s / 621` 帧、`1280×720 / 30 FPS / 1.00×`：

- MP4：`.run/evidence/phase470_firebud_service_layout/phase470-firebud-service-layout-20260817-d/firebud-v2-owner-review-1x.mp4`
- MP4 SHA-256：`e0acb0495319a80cc44a5efc8be6617f1aa8eb9b20927bdf348598fcc79e26b6`
- 联系表 SHA-256：`f5d167ce6aa932b26fb143b6879be3708c32368d89185e190f9523e8ae5fad4f`
- 村口 idle 截图 SHA-256：`526ba48df25ac09c730af9222088934a35d72807244d7047d3f497b770506b27`

当前仍保持 `owner_review_pending / releaseApproved=false / runtimeEnabled=false`。本次站位和交互图腾改变了上一次 Firebud v2 冻结画面，也使 released v1 的旧权威地图哈希自然过期；不得沿用旧 owner acceptance 冒充本次批准。现有 preview 碰撞证据只证明 pending 候选自身闭合，不能代替 promotion 后必须重跑的严格 runtime／pre-export 门禁。项目所有者明确批准本页冻结画面后，才执行 owner／release attestation、v2 promotion、严格碰撞与最终审计、定向提交和推送。P2.2 全量正式美术仍不因此完成。
