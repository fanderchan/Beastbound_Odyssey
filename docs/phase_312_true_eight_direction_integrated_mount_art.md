# Phase 312：真八方向 AI 整图骑乘美术

日期：2026-07-18

## 现行结论

Phase 310 的通用挂点分层和 Phase 311 的骑手/鞍垫/近景遮挡返工均已被项目所有者否决，不再是 Beastbound 的现行骑乘美术方案。现行路线不再试图在运行时把独立人物图和独立宠物图粘合成骑乘画面，而是让生成模型按已锁定的人物和宠物身份直接绘制完整的“人物骑着宠物”单一主体帧。

本阶段以“见习猎人 + 芽耳布伊”为首个正式样板，但三套世界视觉是相互独立的资产：

- 见习猎人：真八方向 `idle 1 + walk 4`，共 40 帧；
- 芽耳布伊：真八方向 `idle 1 + walk 4`，共 40 帧；
- 见习猎人骑乘芽耳布伊：AI 整图真八方向 `idle 1 + walk 4`，共 40 帧。

南、西南、西、西北、北、东北、东、东南都必须有各自的正式源图，运行时不得用水平镜像代替缺失方向。八个输入方向必须对应八个真实可区分的视觉方向，不再把两套母版和镜像称为“真八向”。

## 生成与后处理边界

每张骑乘帧都必须在生成阶段作为一张完整画面重绘，人物、宠物、骑具、握持、腿部遮挡、身体重心和前后穿插必须在同一张图里成立。后处理可以做去背景、去色键溅色、裁切、统一画布、整体缩放、落地线对齐和边缘安全检查，但不得把人物 PNG、宠物 PNG、鞍垫层或局部遮挡层拼成正式骑乘帧。

原始图、使用的提示词、身份参考来源、去背景图、规范化帧、联系表、动画预览和处理参数都必须保留可追溯证据。联系表只用于评审，不能反向成为运行时分层素材。

## 运行时合同

已完成专属动作包的骑乘组合，在世界移动和战斗中均读取同一类完整 mounted body texture。每个单位的骑乘本体在任一帧只允许绘制一张完整图；可以在本体之前绘制通用贴地软阴影，也可以在之后绘制伤害、异常、晕厥、盾面等状态特效，但这些都不得恢复人物与坐骑本体分层。

尚未制作专属 AI 整图的合法可骑宠不得猜测成老虎、雷龙或其他占位坐骑，也不得恢复“人物 + 宠物”双绘。当前世界与战斗都只安全降级显示徒步人物，真实骑乘资格、移动/战斗数值、骑宠 HP 与结算保持不变；等对应人物×宠物动作包登记后，再自动切换到完整骑乘视觉。当前受此边界保护的是新手老虎和雷龙。

世界与战斗运行时均必须满足：

- `runtimeMirroring=false`；
- `runtimeLayeredComposition=false`；
- `runtimeMountedBodyLayers=1`；
- 不读取世界或战斗用 `seatAnchors/riderAnchors/saddleBackLayer/nearForegroundTextures/frontOccluderRegions`；
- 不读取独立骑手 `ride_idle/ride_walk` 帧来拼骑乘画面。

Phase 310/311 的正背骑手帧、鞍垫和挂点可保留为历史复现资产，但必须从运行时 manifest、预热、目录选择和世界/战斗绘制链中移除。它们不得继续标记为 runtime compatible 或正式骑乘方案。

## 方向、比例与动画验收

八向帧不只需要文件名不同，还要在实际透明包围盒和画面语义上成立。每个方向都要核对人物头、胸、骨盆、手、腿与宠物头、躯干和行进轴是否一致。人物不得读成玩偶或粘上去的小人，骑乘与徒步人物的身份、服饰和身高感必须连续。

`walk` 的四帧必须存在可读的步态交替，同时保持骑手臀部落在稳定骑位。不允许四帧只做整体上下平移，也不允许人物与宠物各自使用不相干的动画节拍。

## 验证与证据状态

资产与运行时门禁已完成：

- `tools/build_mounted_sprite_qa.py` 检查 32 张整图行走帧，八方向各 4 帧均唯一，脚底基线漂移 `0px`、方向内横向中心漂移不超过 `1px`、洋红残边 `0`、warnings `0`。四相联系表为 `.run/directional_v4/mounted_baked/qa_baked_v1/mounted-walk-8x4-contact.png`，同步循环为同目录 `mounted-walk-8-direction-cycle.gif`。
- `node tools/run_godot_auto_checks.mjs --only --auto-character-mount-art-check,--auto-pet-action-asset-check,--auto-riding-system-check,--auto-animation-state-check,--auto-movement-check,--auto-battle-check --fail-fast`：Godot parse 加 6 个定向检查共 `7/7` 通过；最终日志 `.run/godot_auto_checks/2026-07-18T18-28-40-370Z.log`。
- 自动门禁确认人物、宠物、整图骑乘各 40 帧，八方向均唯一且不存在另一方向的像素镜像；芽耳布伊骑乘世界与战斗均为 `runtimeBodyLayerCount=1`、`runtimeLayeredComposition=false`、`runtimeMirroring=false`。源码门禁禁止旧骑手/老虎/雷龙双绘入口，并验证新手老虎、雷龙在专属整图完成前都走徒步人物安全降级，不会伪装成其他坐骑。
- 真实 Metal 八向同屏截图：`.run/evidence/phase312_integrated_mount/true8-integrated-grid.png`；较大比例正背对照：同目录 `integrated-mount-front-back.png`。
- 真实 Metal 八向行走录像：同目录 `true8-integrated-cycle.mp4`，1280×720、30 FPS、433 帧、14.43 秒；Godot 报告平均 CPU 渲染 `0.04ms/frame`。八方向抽帧为 `true8-integrated-cycle-contact.png`。
- `godot --headless --path client/godot --scene res://scenes/Main.tscn --fixed-fps 60 -- --movement-perf-check --perf-probe`：最终真实跨帧移动 `status=ok`、稳定 60 FPS、`process_total=0.03..0.06ms`；启动世界重绘 `0.79ms`，后续重绘样本 `0.14..0.17ms`。这不是 200 人同图容量证明。

当前发布状态为 `self_review_passed_owner_review_pending`。自动门禁与自评通过不等于项目所有者已认可风格、比例、方向和动画连贯性，P2.2b 在所有者视觉验收前保持未完成。

## 不改变的玩法边界

本阶段只修正美术资产、目录合同和绘制路径，不改变骑乘资格、移动速度、碰撞、骑宠战斗属性、伤害分摊、骑宠倒下解除骑乘或玩家存档。不操作真实玩家数据，不连接或改动共享 MySQL。
