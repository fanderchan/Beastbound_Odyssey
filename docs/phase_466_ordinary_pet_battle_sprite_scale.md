# Phase 466：普通宠物战斗身体比例归一化

## 结论

Phase 465 暴露的比例问题已经用独立表现层合同收口：普通 10v10 中的晶甲乌力由 `1.00×` 调整为
`1.30×` 身体绘制倍率，芽耳布伊与月岚风狐保持 `1.00×`。新倍率只作用于正式宠物动作帧本身，不修改
源 PNG、actor 权威位置、目标圈、点击／命中半径、近战接触距离、姓名与血条锚点，也不借用 Boss 的
`battlePresentationScale` 语义。

真实 `Main.tscn` 的 1280×720 代表性 10v10 录像与联系表显示：晶甲乌力现在形成低伏、横向宽、装甲重的
成熟轮廓，视觉重量高于圆润幼体芽耳布伊，但没有被拉成比幼体更高的“大号贴纸”；月岚风狐继续保持
修长、轻捷的体型。三种宠物的剪影层级已经有明确审美逻辑，且没有遮挡相邻单位或压住标签。

这只代表当前三个正式运行宠物的普通战斗比例合同达到发布级，不代表全部宠物美术、动画或 P2.2 已完成。

## 表现层合同

新增 `client/godot/data/pet_battle_sprite_scales.json` 与聚焦目录模型
`PetBattleSpriteScaleCatalog`。目录明确登记每个当前正式运行形态的美术角色、倍率、理由及正／背三分之四
`idle 1..6` 共 12 帧的透明主体边界：

| 形态 | 美术角色 | 身体倍率 | 归一化后 10v10 约可见宽×高 | 判断 |
| --- | --- | ---: | --- | --- |
| 芽耳布伊 | 圆润幼体伙伴 | 1.00× | 88.38–93.80 × 84.33–93.80px | 继续满足既定幼体身份锁 |
| 月岚风狐 | 修长敏捷成体 | 1.00× | 59.98–68.09 × 82.07–87.48px | 高而窄，速度型轮廓清楚 |
| 晶甲乌力 | 低伏重甲成体 | 1.30× | 92.62–104.93 × 73.86–81.48px | 比幼体更宽重，但不错误拔高 |

目录范围固定为 `ordinary_formal_pet_sprite_only`，允许倍率区间为 `0.85..1.35`。当前运行目录新增形态却
未登记比例、登记非运行形态、动作包不存在、12 帧透明边界漂移或倍率越界时，正式素材检查都会失败。

`_start_battle()` 只在战斗启动时预热目录与动作包；`_draw()` 热路径只读取内存中的倍率，禁止文件 I/O。
未预热或无效目录在绘制层安全回退 `1.0`，同时由自动门禁阻止该状态发布。

## 不污染战斗几何

实现保留两条互不混淆的比例链：

- `actor_visual_scale = formation scale × BattleVisualPresentationModel actor scale`，继续控制权威表现、Boss
  语义、接触与周边几何；
- `pet_sprite_visual_scale = actor_visual_scale × ordinary pet sprite scale`，只传给正式宠物身体动作帧绘制。

自动门禁锁定普通晶甲乌力身体倍率为 `1.30`，但普通 actor presentation、双方 contact scale 均仍为
`1.00`；同形态的不可捕捉野怪／Boss 不套普通宠物身体倍率，继续由原 Boss 表现模型独立决定。目标圈、
命中半径、标签、血条和技能锚点没有读新目录。

## 真实 Main 美术证据

```text
.run/evidence/phase466_pet_battle_scale/
  phase466-pet-scale-20260817-a/
```

- 视频：`phase403-battle-layout-owner-review-1x.mp4`；
- 13.533333 秒、406 帧、1280×720、30 FPS、H.264/AAC、`1.00×`；
- MP4 SHA-256：`e26c5acfbcebde6b5aed150a760309d65b57ffc6009e54c9c90b918eedba2eaf`；
- 联系表 SHA-256：`e278cdff9a3222737dc7ae23204a8fa678475bb0fe01c54df163cfcde9964cff`；
- 20 actor、4 套人物、3 种宠物、5 次真实跨帧左键、2 个相邻精确目标；
- 普通晶甲乌力身体 `1.30×`，actor／contact 均 `1.00×`，Boss override=false；
- HUD 碰撞 0、HUD 穿透 0，原生与 MovieWriter、完整音视频解码全部通过；
- 官方 QA lane 已清理，正常玩家目录清单在录制前后不变。

审美判断：现在的晶甲乌力不是简单“放大”，而是以横向装甲面积建立重量感。它与芽耳布伊的圆、风狐的
高窄组成可读的三角关系；同屏密度仍有呼吸空间。当前比例可以冻结，后续新增宠物应按自身形态登记，不能
复制晶甲乌力的 `1.30×` 作为全局常数。

## 性能证据

```text
.run/evidence/phase466_pet_battle_scale/perf/
  phase466-pet-scale-perf-20260817-a/
```

真实 `Main.tscn`、Metal、1280×720、20 actor、25 次真实跨帧左键：

| 状态 | raw FPS | 1 秒窗最低 FPS | frame interval p95 | process_total p95 | draw_battle p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| idle | 59.73 | 59.1 | 17.025ms | 0.06ms | 4.59ms |
| command_selection | 59.46 | 59.0 | 17.055ms | 0.06ms | 4.59ms |
| target_switch | 59.72 | 59.0 | 18.416ms | 0.06ms | 4.69ms |

所有性能门、20 席窗口前后不变量、HUD 安全区和目标切换门均通过。

## 自动门禁与旧夹具修复

扩展后的正式素材检查会审计三个运行形态、每个形态 12 张 idle 帧、预期边界与权威几何未改变。代表性
战斗录像器和 Python 解析器同时锁定三档比例、晶甲乌力 `1.30×`、普通 actor／contact `1.00×`、
`sprite_only=true` 与 `boss_sprite_override=false`。

整组回归最初暴露两个旧 QA 入口使用空宠新账号：正式 `_start_battle()` 正确按真实档案移除预览中的
`ally_pet`，使满阵型只剩 19 人；目标选择也会因为无需等待宠物指令而立刻清空 pending command。阵型与
目标检查现显式使用既有 `_qa_battle_profile()` 且关闭档案保存。该修复只改变隔离 QA fixture，不改变
新玩家档案、产品战斗逻辑或服务端数据。

## 验证与发布边界

- `python3 -m unittest tools.test.test_record_battle_layout_owner_review tools.test.test_capture_battle_layout_perf tools.test.test_record_pet_management_owner_review`：46/46 通过；
- `node tools/run_godot_auto_checks.mjs --only=--auto-pet-action-asset-check,--auto-battle-formation-check,--auto-battle-target-check,--auto-battle-melee-motion-check,--auto-battle-label-check,--auto-battle-visual-timing-check --fail-fast --timeout-ms=180000`：Godot parse 与六项定向检查共 7/7 通过；
- `godot --headless --path client/godot --quit`：通过；
- `git diff --check`：通过；
- 真实 Main 代表性 10v10 录像与交互性能：PASS。

本阶段不修改任何宠物像素、宠物数值、技能、成长、捕捉、骑乘、融合规则、owner decision 或 runtime
开关；V4E 苔垒角兽头像等既有 owner-pending 项继续保持待项目所有者明确批准。
