# Phase 308：前爪打击、命中冲击与致死反击负伤归位

日期：2026-07-18

## 本阶段结论

项目所有者对 Phase 307 的实机片提出了两个准确问题：芽耳布伊的攻击读成没有重量的头撞；普通致死反击缺少“拖着受伤身体回到原位，再倒下”的过程。Phase 307 把致死者永久留在接触点并不符合这次确认的战斗语言，现已明确被本阶段取代。

现行演出为：

1. 先手用前爪短扑攻击，并在真实伤害揭示时到达前爪接触帧；若触发反击，先手留在接触点等待反打。
2. 守方原地以前爪反击，接触瞬间出现短后坐、橙白冲击光和约 180ms 的衰减，而不是让两个身体无反馈地重叠。
3. 普通致死反击先播放接触受创，再进入不均匀、带停顿的负伤退行；目标回到自己的阵位后才播放可复活昏厥与眩晕光环。
4. 达到既有过量伤害门槛的反击不走负伤退行，仍从接触点立即进入完整击飞轨迹。

伤害、反击概率、反击伤害系数、击飞门槛、经验、掉落和服务端事件都没有改变。客户端只把已结算的权威事实导演成更容易读懂的连续动作。

## StoneAge 参考与 Beastbound 取舍

稳定本地 StoneAge 8.0 参考确认了成熟石器战斗的基本心智：近战交锋应在接触点连续完成，受击、归位与退场必须有清楚先后。Beastbound 沿用这个基线，但没有复制其低分辨率素材或固定帧数。由于本项目使用 256px 高清宠物，额外保留 96 单位反击接触距离，并用独立前爪帧、负伤帧和运行时冲击光避免大轮廓完全互相遮住。这些差异只解决高清资产的可读性，不新增玩法。

## 资产与导演合同

- 芽耳布伊正、背两套 `attack` 各 8 帧均已重制：后腿蹬地、抬起近侧前爪横拍、接触停顿、收爪复位；头部只随身体运动，不再作为接触点。
- 第一版头撞原稿保留为 `source/*_attack_headbutt_v1_rejected_raw.png`，用于说明被拒绝方向，不会被运行时加载。
- 新增正、背两套 `stagger` 各 8 帧：身体压低、四足不均匀拖步、两次速度停顿、回到阵位但不恢复精神。它不复用正常 `walk`，也不提前播放昏厥末帧。
- 正式动作包由 84 帧扩为 100 帧；身份锁、生成提示、来源归属、512px QA 母版、256px 运行帧和 Godot import 均同步更新。
- `battle_visual_presentation_model.gd` 统一维护接触帧、命中脉冲、负伤退行的分段曲线、归位时点与倒地进度；`main.gd` 只负责把当前事件映射为 `hit/wounded_return/down/launched` 并绘制轻量冲击光。
- 普通致死反击总演出至少 2.35 秒，伤害在 22% 处揭示；击飞分支继续使用既有直飞/弹飞时长，不被这段慢退覆盖。

## 验证与性能

- `node tools/run_godot_auto_checks.mjs --only=--auto-pet-action-asset-check,--auto-battle-feedback-check,--auto-battle-launch-check,--auto-battle-melee-motion-check,--auto-battle-visual-timing-check,--auto-battle-reaction-check --fail-fast`：parse 与 6 个定向检查共 `7/7` 通过，日志 `.run/godot_auto_checks/2026-07-18T09-32-51-494Z.log`。
- `counter_ko`、`counter_launch` 与 `formation_10v10` 均从真实 `Main.tscn` 以固定 60 FPS 跑到自行退出；普通致死反击门禁锁定接触 `hit`、中途 `wounded_return`、原阵位 `down`，并锁定反击者完成动作后恢复待机。
- 本机 10V10 探针稳定 60 FPS，`process_total=0.02..0.04ms`、`draw_battle=1.37..1.75ms`；两条反击演练稳定 60 FPS，战斗段 `process_total=0.02..0.03ms`、`draw_battle=0.11..0.17ms`。冲击光只在约 180ms 内绘制少量圆、弧和射线，没有常驻扫描、网络或存储开销。
- Apple M5 Metal 以真实 `Main.tscn`、1280×720、60 FPS 录制最终两段 H.264 MP4；Godot Movie Maker 报告 CPU 渲染平均约 `0.24ms/frame`。这只证明本机客户端演出余量，不代表服务器或 200 人同地图容量。
- `git diff --check`、JSON 解析和 Godot 资源加载通过；所有录制均使用隔离本地演练状态，没有连接共享 MySQL、后端或玩家数据。

最终评审证据：

- `.run/evidence/phase308_counter_wounded_return/final/01_counter_ko_wounded_return.mp4`
- `.run/evidence/phase308_counter_wounded_return/final/02_counter_knockaway.mp4`
- `client/godot/assets/pets/novice_sprout_bui/qa/qa-contact-sheet.png`

## 仍未完成

本阶段只解决项目所有者点名的前爪打击、普通致死反击负伤归位和高伤击飞分支。玩家仍需判断前爪接触是否够明确、拖步速度和重量是否合适、倒地时点是否自然。技能、合击、专属反击预备、正式音效、震屏、战斗背景和人物资产仍属 P2.2a/P2.3；在单宠视觉未通过前不扩产晶甲乌力、月岚风狐，也不开放进化资产门禁。
