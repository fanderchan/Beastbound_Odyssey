# Phase 465：代表性 10v10 阵容纠错与宠物体量审计

> **Phase 466 收口（2026-08-17）**：普通宠物已建立独立的身体绘制比例合同；晶甲乌力只在正式宠物
> 动作帧层由 `1.00×` 调整为 `1.30×`，actor／接触／目标圈／命中区／标签继续为 `1.00×`，Boss 语义
> 不复用。真实 Main 录像、透明边界、7/7 Godot 门禁和 20 人交互性能均通过，详见
> `docs/phase_466_ordinary_pet_battle_sprite_scale.md`。本阶段末尾“下一段应做”的工作据此完成，但 P2.2
> 仍未完成。

## 结论

Phase 464 所谓“普通 10v10 两边大量复制同一人物和同一宠物”不是正式战斗数据的固有结果，而是
`battle_layout_owner_review_capture.gd` 为单一动作包和最长名字压力测试主动注入的同模阵容。真实服务端
战斗 actor 已权威携带人物 `appearanceId`、宠物 `formId`／`battleAppearanceFormId`；旧录像使用真实 Main
与真实绘制器，却不是能代表正式队伍美术构成的 fixture。

本阶段把审片夹具改为现有合法运行资产的代表性混合阵容：10 名人形精确分布在 4 套人物动作包，10 只
宠物精确分布在 3 种当前可运行宠物动作包。20 席、最长 24 字人物名、两个最长 8 字宠物名、两个相邻
精确目标、真实跨帧左键和 HUD 安全区压力全部保留。新的 1280×720、1.00× 真实 Main 录像证明：双方
仍朝向场心，队伍身份和目标轮廓明显改善；“克隆军团”阻断可以从产品美术问题中移除。

当前真正的比例问题也因此暴露：芽耳布伊符合身份锁的运行时 84–104px 体高，而成熟重甲定位的晶甲乌力
在同一战斗画布中只有约 74×59px，可见体量反而显著小于约 90×90px 的芽耳布伊，也低于约 64×84px 的
月岚风狐。这个问题不在本阶段用随手放大已批准 PNG 或复用 Boss `battlePresentationScale` 掩盖；下一段
应建立普通宠物专用、只影响表现层且可复审的体量归一化合同，并重跑动作接触、标签、命中区与 10v10
性能门。P2.2 继续未完成。

## 产品真值与夹具根因

服务端当前公开 actor 投影和正式战斗参与者快照均保留：

- 人物：`appearanceId`；
- 宠物：`formId`、`battleAppearanceFormId`；
- 正式客户端按这些字段选择人物／宠物动作包，不要求同队共享模型。

旧 Phase 403/464 录像控制器在 `BattleModel.create_formation_preview_battle()` 之后，把所有 player actor
统一写为 `ember_spark_v1`，把所有 pet actor 统一写为
`wuli_evolved_crystal_earth8_water2`，名称也统一写成最大值。这个设计能覆盖“一个最大包被同时绘制 20
次”的压力，但不能支持“普通玩家阵容就是克隆军团”的美术结论。

本阶段没有改服务端、协议、战斗规则、角色／宠物像素、owner decision 或普通玩家运行开关，只纠正审片
样本的代表性与自动门禁。

## 代表性阵容合同

人物使用 4 套当前可选择、可运行的正式战斗动作包：

- `novice_hunter_v1`；
- `obsidian_scout_v1`；
- `frost_whisper_v1`；
- `ember_spark_v1`。

宠物使用当前普通运行路径实际可取到的 3 种动作包：

- `bui_novice_sprout_earth5_wind5`；
- `driftfox_evolved_moon_gale_wind7_water3`；
- `wuli_evolved_crystal_earth8_water2`。

录像控制器新增 actor ID 到 appearance/form/name 的精确映射，并在启动前、Main 归一化后和日志验收时分别
fail closed：必须恰好 10 名人形、10 只宠物、4 套人物、3 种宠物；双方所有动作包都必须能预热并继续
满足 NW/SE 朝场心合同。日志同时固定
`character_variants=4`、`pet_variants=3`、
`representative_runtime_mix=true`、`single_asset_stress=false`，防止后续又把单包压力片误称为普通阵容。

## 真实 Main 动态证据

```text
.run/evidence/phase465_representative_battle_hierarchy/
  phase465-diverse-battle-20260817-a/
```

- 视频：`phase403-battle-layout-owner-review-1x.mp4`；
- 13.533333 秒、406 帧、1280×720、30 FPS、H.264/AAC、`1.00×`；
- MP4 SHA-256：`0819dc9671961005cdc8721bb9632fb575624bd52eb96bd644d15a66d0425373`；
- 联系表 SHA-256：`3d99c15084a515c88a5db378953ed9af84989fb7f176007ed2e80d2bbb639a16`；
- 20 actor、4 人物变体、3 宠物变体、5 次真实跨帧左键、2 个精确相邻目标；
- HUD 碰撞 0、HUD 穿透 0、普通阵容 mounted actor 0；
- 原生与 MovieWriter 均通过，完整音视频解码通过；
- 官方 QA lane 录后已清理，正常玩家目录清单 SHA-256 前后均为
  `db9a048c65ed14c6c4779afaed1d169706ed56f77f41f9c75f02d86b20bd3906`。

美术自审：4 套人物的发色、服装块面和轮廓已经足以打散同模墙；三种宠物也能形成圆润幼兽、修长狐形、
低伏重甲三种剪影。阵型与留白无需推翻。当前短板由“有没有差异”转为“差异是否有正确的体量等级”：
晶甲乌力的盔甲细节与低伏姿态在 1280×720 被缩得过小，成熟进化体的重量感没有兑现。

## 透明边界量化

对三种宠物的正／背三分之四 `idle 1..6` 运行帧，以 alpha ≥ 16 的主体包围盒统计；正式 10v10 当前
`156 × 0.74 = 115.44px` 方形绘制区域。平均可见尺寸如下：

| 形态 | 正面源包围盒 | 背面源包围盒 | 当前实机约值 | 判断 |
| --- | --- | --- | --- | --- |
| 芽耳布伊 | 200.7×198.0 | 199.0×203.0 | 约 90×90px | 符合身份锁 84–104px 体高 |
| 月岚风狐 | 140.3×185.5 | 143.5×186.3 | 约 64×84px | 修长轮廓成立，体高可读 |
| 晶甲乌力 | 164.3×127.7 | 163.0×132.7 | 约 74×59px | 成熟重甲体量过轻，需独立归一化 |

现有 `BattleVisualPresentationModel.actor_presentation_scale()` 只允许不可捕捉野怪／Boss 使用放大值，目的
是 Boss 威胁表现与接触距离；普通玩家宠物固定为 1.0。直接把普通宠物伪装为 Boss 或修改服务端
`battlePresentationScale` 会混淆玩法语义，也会同步放大命中半径、接触距离和特效锚点，因此本阶段不采用。

## 性能证据

```text
.run/evidence/phase465_representative_battle_hierarchy/perf/
  phase465-diverse-battle-perf-20260817-a/
```

真实 `Main.tscn`、Metal、1280×720、20 actor、跨帧真实左键：

| 状态 | raw FPS | 1 秒窗最低 FPS | frame interval p95 | process_total p95 | draw_battle p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| idle | 59.73 | 59.1 | 17.338ms | 0.12ms | 4.46ms |
| command_selection | 59.45 | 58.1 | 17.277ms | 0.12ms | 4.42ms |
| target_switch | 58.06 | 52.6 | 18.418ms | 0.11ms | 4.51ms |

25 次真实跨帧左键覆盖攻击按钮和相邻目标反复切换，全部性能门通过；官方 QA lane 清理完成，正常玩家
目录哈希保持不变。

## 验证与发布边界

- `python3 -m unittest tools.test.test_record_battle_layout_owner_review`：11/11 通过；
- `python3 -m unittest tools.test.test_record_battle_layout_owner_review tools.test.test_capture_battle_layout_perf tools.test.test_record_pet_management_owner_review`：46/46 通过；
- `python3 -m py_compile tools/record_battle_layout_owner_review.py tools/test/test_record_battle_layout_owner_review.py`：通过；
- `godot --headless --path client/godot --quit`：通过；
- `git diff --check`：通过；
- 真实 Main 代表性 10v10 录像：PASS；
- 真实 Main 20 人交互性能：PASS。

本阶段不批准任何 owner-pending 资产。V4E 苔垒角兽头像、Firebud v3 精确动态、人物／宠物／骑乘候选的
既有 owner 状态和运行开关全部不变。
