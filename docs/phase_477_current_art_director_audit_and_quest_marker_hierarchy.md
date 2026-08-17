# Phase 477：当前美术总监复核与任务标记层级收口

日期：2026-08-17

## 结论

本轮按当前 `main`、最新真实 `1280×720 Main.tscn` 证据和实际待审资产重新做美术总监判断，结论不是
“全部继续打磨”，而是明确分流：

- 世界 HUD 已在 Phase 469 收口到可保留水平，不再重复返工；
- 普通 10v10 的代表性阵容和宠物体量已由 Phase 465/466 纠正，当前比例层级可保留；
- Firebud v2 的技术门禁完整，但村口和训练场仍不具备正式地图的构图、材质与生活感，继续退回完善；
- 新手老虎、地灵转生兽两套整体骑乘战斗候选可以进入项目所有者审片，但不能据此暗开运行；
- 曜冠角兽与苔垒角兽的完整非骑乘包已有既往视觉批准，当前只剩专用画像和首批不可骑运行范围的独立
  owner 决定，未收到明确决定前继续失败关闭。

本阶段只收小任务标记的视觉抢占，不生成任何 owner approval、release attestation，不改变任务状态、路线、
服务端数据、融合配方或运行开关，也不代表 P2.2/P2.3 完成。

## 对旧证据的纠正

Phase 464 的画面已经被后续阶段部分取代，不能继续拿旧片当当前结论：

- 世界 HUD 以 Phase 469 的最新 C 片为准：左上地图／更多、左下聊天、右侧任务／队伍、底部固定成长入口，
  已经形成稳定空间语法；
- Phase 464 的普通 10v10 “同模复制”来自录像压力夹具，Phase 465 已用 4 套人物与 3 种宠物的合法混编
  纠正；
- Phase 466 又把低伏重甲型晶甲乌力的正式宠物动作帧调整到 `1.30×`，普通战斗中已经形成圆润幼体、
  修长敏捷、低伏重甲三档清楚的轮廓重量。

因此，当前真正阻断商业观感的重点不是继续搬 HUD，也不是再次放大战宠，而是地图构图、地图材质统一、
技能冲击与音画反馈。

## 分系统美术裁决

| 子系统 | 当前证据 | 美术判断 | 决定 |
| --- | --- | --- | --- |
| 世界 HUD | `.run/evidence/phase469_world_hud_hierarchy/phase469-world-hud-hierarchy-20260817-c/` | 功能层级、视觉重量和世界可视面积已经平衡；继续改动只会重新制造入口漂移 | 保留，不返工 |
| 普通 10v10 | `.run/evidence/phase466_pet_battle_scale/phase466-pet-scale-20260817-a/contact-sheet.png` | 三种宠物的体量身份已经可读，双方阵型和面向场心稳定；真正欠缺的是攻击冲击、技能特效和声音，而非再改身体比例 | 保留表现层比例，转 P2.3 |
| Firebud v2 村口 | `.run/evidence/phase470_firebud_service_layout/phase470-firebud-service-layout-20260817-d/screenshots/frame-01.png` | 比旧队列更可接近，但 14 名服务 NPC、抢眼任务标记和花毯重复仍产生“功能测试场”感；建筑、花丛、人物的材质密度与光照归属尚未统一 | 继续退回完善，不签 owner approval |
| Firebud v2 训练场 | 同证据目录 `frame-05.png` | 大片均匀草地、阶梯式土路、单一训练靶和零散重复花丛使空间像未完成编辑器关卡，缺少训练行为、围合关系和视觉焦点 | 重做空间拓扑与地表过渡，不发布 |
| 新手老虎整体骑乘 | `.run/evidence/phase457_tiger_mounted_full_source/phase457-tiger-v1-main-20260816-a/visual-review/contact-sheet.png` | 人骑宠一体、动作来源和步态已闭合，轮廓有商业可读性；综合色相偏橙且明度层次较单一，但不是阻断项 | 可送 owner 审片，继续 pending |
| 地灵转生兽整体骑乘 | `.run/evidence/phase458_rebirth_mounted_full_source/phase458-rebirth-v1-main-20260816-a/visual-review/contact-sheet.png` | 体块重量、土色与冷色甲片层次优于老虎候选，八帧步态也已收口；尚不能代替 owner 视觉决定 | 可送 owner 审片，继续 pending |
| 蓝人龙整体骑乘 | Phase 456 当前片 | 结构修复通过，但动作节奏仍显两拍，现阶段不宜排在老虎／地灵之前开放 | 继续返工／后排 |
| 首批融合宠 | Phase 407/445 当前 Main 画像证据与 Phase 406 锚点审计 | 曜冠的攻击型轮廓强；苔垒的低重心、防御体块可接受，V4E 已比旧稿更接近同一商业语言。6 个旧 walk 漂移是外接框极值误报，不再是技术阻断 | 只等待当前画像与首批不可骑范围的 owner 明确决定；未批准前不开放 |

Firebud 的重复度不是主观印象：村口 `31` 个摆件中有 `23` 个
`firebud_flower_meadow_decal`，训练场 `19` 个摆件中有 `11` 个。后续返工应保留权威玩法格、NPC ID、服务、
记录点、warp 和可达性，只改变视觉簇、地表过渡、生活道具与场景节奏；不得用删除玩法对象换取空旷画面。

## 任务标记层级修正

最新 Firebud 实机画面中的任务标记相对人物头部过大，多个标记同时出现时会先于 NPC 和建筑成为视觉主体。
本阶段把“任务可接／可交／可重复／转生可交”保留为一级提示，把“条件不足／进行中／转生可接”降为二级提示：

| 层级 | scale | 圆体半径 | 字号 |
| --- | ---: | ---: | ---: |
| 一级提示 | `0.72` | `8.64px` | `16px` |
| 二级提示 | `0.62` | `7.44px` | `14px` |

统一几何由 `WorldOverlayLayer.quest_marker_geometry()` 计算，正式 overlay 与旧 canvas 回退绘制消费同一 scale 语义；
现有颜色、`!/?` 字形、任务状态映射、世界坐标和点击合同保持不变。自动检查同时锁定状态分级与最终几何，避免
以后只改一条绘制路径而重新出现大小漂移。

## 验证与证据边界

- `git diff --check`：PASS；
- `godot --headless --path client/godot --log-file /private/tmp/beastbound-quest-marker-parse.log --quit`：
  退出码 `0`，无 GDScript parse/script error；日志中的系统字体与 CA 访问噪声来自受限沙箱，不冒充产品错误；
- 忽略目录下的真实类加载／节点组合合同检查：`PASS`，`errors=[]`、`overlayMarkers=2`，一级
  `scale=0.72 / radius=8.64 / font=16`，二级 `scale=0.62 / radius=7.44 / font=14`；
- 正式 `--auto-npc-quest-marker-check` 与修改后的真实 Main 录片仍受本机 QA user-data lane 的沙箱写权限阻断，
  尚未通过，不能用上述合同检查冒充最终实机视觉证据。

因此这批改动属于“工程与美术总监自审通过、真实 Main 终验待补”的窄小候选。Firebud 继续
`owner_review_pending / releaseApproved=false / runtimeEnabled=false`；融合宠也继续
`portraitReleaseGate=false / releaseApproved=false / runtimeEnabled=false / playerEntryOpened=false`。

## 下一步

1. 在可写 QA lane 中补录任务标记缩小后的 Firebud 村口／训练场真实 `1280×720 Main.tscn` 对照片；
2. Firebud 下一版减少花毯重复，训练场重做地表过渡和训练活动簇，再重跑碰撞、动作矩阵与性能证据；
3. 项目所有者若明确接受当前曜冠／苔垒画像与首批不可骑开放范围，再生成最小 owner decision 并走原子
   release promoter；
4. 老虎、地灵按当前 1× 片集中送审，蓝人龙继续放在返工队列；
5. 战斗侧下一项进入 P2.3 的技能冲击、受击反馈、环境声与音乐，不再反复改已经稳定的 HUD 和普通宠物体量。
