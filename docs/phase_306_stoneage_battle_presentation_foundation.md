# Phase 306：石器式战斗表达基础——防御受击、昏厥、阵型与贴地阴影

日期：2026-07-18

## 本阶段结论

本阶段没有继续批量生产宠物，也没有把 Phase 305 自评未通过的画面误标为完成。先按用户反馈重新核对 StoneAge 8.0 的战斗表达，再只收口四个可复用基础问题：

1. 双方 10V10 固定为前排宠物、后排人物，移除评审画面中的调试阵型网格，并在大阵型中只常显玩家本人或当前焦点的名字。
2. 防御中的目标受击必须进入独立 `guard_hit` 表达：保留防御身体动作、显示盾面接触/承压和“防御 -伤害”，不再与普通 `hit` 混用。
3. 宠物 `down` 定义为可复活的战斗昏厥，不是死亡或睡觉；本体动作与头顶眩晕光环分层。
4. 原来远离脚点的黑色实心圆改为贴脚的三层软椭圆阴影；移动时的原位标记也改为贴地椭圆。

这些调整改善的是 StoneAge 玩家熟悉的战场读位和状态识别，没有新增玩家需要操作的系统。

## StoneAge 8.0 参考与 Beastbound 取舍

稳定本地参考 `/Users/fander/projects/_local_references/StoneAge` 中：

- `gmsv/src/include/anim_tbl.h` 分别定义防御身体动作 `SPR_difence` 与镜面/护罩效果 `SPR_mirror`、`SPR_barrior`；
- `gmsv/src/battle/battle_event.h` 把 `BCF_GUARD` 与 `BCF_DEATH` 作为独立事件事实；
- `gmsv/src/battle/battle_event.c` 在防御时先减伤再发布 guard 事实，生命归零才发布倒下事实。

公开战斗录像与[战斗界面说明](https://wiki2.gamer.com.tw/wiki.php?n=2198%3A%E6%88%B0%E9%AC%A5%E4%BB%8B%E9%9D%A2%E8%AA%AA%E6%98%8E&ss=5326)用于交叉确认斜向阵列、人物在宠物后方、近身前冲后归位等玩家心智。Beastbound 不复制原素材、数值、界面拥挤度或永久标签；只采用状态分层和阵型读位。

## 昏厥动作与分层特效

芽耳布伊新增正、背三分之四视角各 8 帧 `down`，动作节拍为惊愕失衡、四足失力、侧倒、二次沉降、末帧长期保持。第一版因闭眼微笑、四肢收拢而读成“安心睡觉”，已整套退回，没有进入运行时；重做版使用螺旋失焦眼、张口、松散摊开的四肢，禁止血迹、尸体淡出和重新站起。

眩晕光环没有画进身体帧。运行时按角色头部位置单独绘制金色椭圆与三颗绕行星点，因此它可以持续旋转，并在复活、移除或结算时立即消失。即使关闭特效，本体末帧也必须独立读成昏厥，而不能靠光环掩盖睡觉表情。

动作包从正背共 68 帧增至 84 帧。色键母版、生成提示、重排记录、透明 QA 帧、256×256 运行帧、GIF、联络表和来源/归属记录均保留在 `client/godot/assets/pets/novice_sprout_bui/`。

## 代码边界

- `client/godot/scripts/battle/battle_visual_presentation_model.gd`：集中维护 `guard_hit`、倒地播放时序、阴影几何、标签显隐和纯数据验证，避免继续把规则散进 `main.gd`。
- `client/godot/scripts/battle/battle_model.gd`、`battle_event_ledger.gd`：本地/服务端单体与多体伤害保留 `blocked` 事实，回放不丢防御受击语义。
- `client/godot/scripts/main.gd`：只负责运行时绘制与接线；昏厥使用正式 `down` 帧，光环、盾面、阴影和选择环分别绘制。
- `client/godot/scripts/qa/battle_visual_review_preview.gd`：新增真实“防御后受击”序列，并让评审入口和正式回合一样先登记 guarding actor；评审入口同时纳入开发入口门禁，不会在发行构建中绕过登录。

## 自动与实机验证

- `git diff --check`：通过。
- `godot --headless --path client/godot --quit`：通过。
- 宠物动作资产、10V10 阵型、受击反应、视觉时序：`5/5` 通过，日志 `.run/godot_auto_checks/2026-07-18T07-16-07-895Z.log`。
- 防御公式与 `guard_hit/lastBlocked/lastBlockedPerTarget` 定向断言：`2/2` 通过，日志 `.run/godot_auto_checks/2026-07-18T07-17-19-436Z.log`。
- 服务端权威 `blocked=true` 映射、`guard_hit` 回放与 ledger 单体事实：`2/2` 通过，日志 `.run/godot_auto_checks/2026-07-18T07-43-12-547Z.log`。
- 最终合并门禁（parse、资产、阵型、反应、防御、反馈、时序、服务端回放）：`8/8` 通过，日志 `.run/godot_auto_checks/2026-07-18T07-44-33-035Z.log`。
- `formation_10v10`、`defend_hit`、`down_exit`、`attack` 四条完整演练在 headless 路径均正常退出。
- 真实 Metal 10V10 性能探针稳定约 60 FPS；启动后 `process_total=0.05ms`，`draw_battle=3.33..3.57ms`。首秒 46.8 FPS 是窗口/纹理预热，不作为稳定帧结论。
- 真实 `Main.tscn` 1280×720 Metal 证据：
  - `.run/evidence/phase306_stoneage_battle_foundation/01_10v10_front_pets_back_players.mp4`
  - `.run/evidence/phase306_stoneage_battle_foundation/02_defend_hit.mp4`
  - `.run/evidence/phase306_stoneage_battle_foundation/03_down_ko_halo.mp4`
  - `.run/evidence/phase306_stoneage_battle_foundation/04_attack_grounding.mp4`

## 当前仍未通过的范围

- 人物仍是程序占位体，战斗背景也未达到正式美术标准。
- 10V10 只完成阵型、阴影和标签基础，尚未完成大体型宠物、多人同时位移、技能特效遮挡和焦点切换的最终调度。
- 防御盾面目前是可替换的程序特效，用来验证分层和命中时序；正式材质、音效和震屏仍待后续美术/音频阶段。
- Phase 305 已暴露的普通攻击、技能、合击、反击和击飞整体冲击感仍需继续导演，不因本阶段通过基础门槛而自动通过。
- 晶甲乌力与月岚风狐没有开始扩产，进化资产门禁和运行开关继续关闭。

## 用户验收建议

若只看一次，依次打开以上 `02` 与 `03`：

1. `02`：确认攻击接触时防守宠没有切成普通受击，而是缩身承压、盾面亮起并显示“防御 -伤害”。
2. `03`：确认倒地前有明确失衡过程，末帧是昏厥而不是微笑睡觉；头顶光环与身体动作独立旋转。
3. 再看 `01`：只判断双方是否都是前排宠物、后排人物，以及阴影是否真正贴在脚下；不以占位人物造型作为本阶段验收项。
