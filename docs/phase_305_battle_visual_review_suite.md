# Phase 305：战斗动作视觉评审片组

## 结论

本阶段按项目所有者要求，用真实 Godot `Main.tscn`、1280×720、20 FPS 分别录制同尺寸宠物压力 10V10、当前人物/宠物混合 10V10、反击、直线击飞、场边弹飞、防御、普通攻击、技能攻击、合击、受击恢复、倒地和闪避。视频证明当前战斗逻辑与首只正式宠物动作包能够接通，但整体画面表达尚未达到可扩产标准，P1.3e、P2.2a 和 P2.3 均保持未完成。

本轮只修复一个确定的集成错误：正式宠物处于 `launched` 时不再突然退回程序色块，而是继续使用正式 `hurt` 帧并随真实击飞轨迹旋转、移出战场。其余问题保留在评审片中，没有用剪辑或额外特效遮盖。

## StoneAge 参考与审美决策

StoneAge 8.0 仍是队列清楚、动作短直、第一眼读懂行为的参考，但不是要求 Beastbound 把高清精灵也压进同样的信息密度。当前 `stoneage9-art-director` 的身份锁、正式视角、动作清单、来源和替换路径仍然必要；本轮视频同时证明，仅有这些资产合同不足以保证战斗好看。

Beastbound 的 PC 高清战斗还需要一层动作导演合同：每个主动动作都应有可读预备、接触/命中、短停顿、目标反应和恢复；普通攻击、技能、反击、合击不能只靠日志文字区分；10V10 必须以最终绘制包围盒而不是抽象锚点判断遮挡；倒地、防御、闪避和击飞必须有独立轮廓语言。后续可以据实修订美术导演规则，不能拿既有 skill 为难看的结果辩护。

## 实现边界

新增独立 `--battle-visual-review=<scenario>` 预览入口，场景编排位于 `client/godot/scripts/qa/battle_visual_review_preview.gd`，`main.gd` 只负责参数、启动接线和正式击飞精灵连续性修复。全部场景使用本地临时档案和真实 `BattleModel.apply_battle_event`/事件账本/战斗绘制，不连接后端、共享 MySQL、GM 账号或真实玩家数据。

支持场景：

- `formation_10v10`
- `formation_10v10_mixed`
- `counter`
- `knockaway`
- `knockaway_bounce`
- `defend`
- `attack`
- `skill_attack`
- `combo`
- `hurt_recovery`
- `down_exit`
- `dodge`

10V10 同时提供两种证据：20 只同尺寸正式宠物用于最坏情况包围盒压力检查；当前混合阵型保留己方后排五个人物程序占位，用于诚实呈现“十只敌宠 + 五只己宠 + 五名人物”的现阶段完成度。动作片使用真实事件伤害、反击队列、合击参与者、击飞判定、浮字和状态恢复，不是逐帧手工摆拍。

## 逐段自评

1. **10V10：不通过。** 敌我前后排的正式精灵、名称和血条都有明显相互覆盖，敌方两排尤其容易读成一条斜线；当前锚点在数学上分开，但最终 115px 左右的宠物包围盒没有分开。
2. **反击：不通过。** 事件顺序正确，但反击复用普通攻击帧，除日志与浮字外没有独立预备或反打节拍。
3. **击飞：连续性修复通过，表现未通过。** 高清宠不再瞬间变成色块；直飞与弹飞轨迹可区分，但命中前没有蓄力，接触点没有停顿、地面反馈或残影，弹飞落点也缺少重量。
4. **防御：不通过。** 防御帧在实际战斗尺寸下轮廓变化太小，0.40 秒后直接恢复，主要仍依赖文字与守势圈。
5. **普通攻击：方向可读，节拍不通过。** 攻击者能到达目标并归位，但整体像沿正弦位移滑过去，缺少预备、命中停顿和目标后坐。
6. **技能攻击：不通过。** `芽突猛冲` 与普通攻击使用同一套动作和移动，没有技能专属轮廓、轨迹或效果层。
7. **合击：不通过。** 三名参与者确实错峰出击，但在命中点堆叠，姓名、血条、影子和角色互相遮挡，玩家难以读出先后与贡献。
8. **受击恢复：部分通过。** `hurt` 帧能表达受击，但事件结束后直接切回待机，缺少缓冲/重新站稳帧。
9. **倒地：不通过。** 当前只是 `hurt` 最后一帧加低透明度，像幽灵化，不像有重量地倒下或退场。
10. **闪避：不通过。** 当前借用 `walk`，位移和残影不足，近身接触时很难第一眼确认目标是否真正闪开。
11. **整体战场：不通过。** 灰绿色纯底、占位 HUD、弱接触反馈和高清宠物的完成度差距过大；宠物造型本身不能替战斗画面承担全部品质。

因此下一轮不应立即扩产晶甲乌力、月岚风狐或全部宠物。应先用芽耳布伊建立 10V10 尺寸/遮挡门槛和一套动作导演原型，至少让普通攻击、防御、受击恢复、倒地、技能和三人合击在无日志时也能区分，再决定是否固化并回写美术导演 skill。

## 实机证据

所有 MP4 均由 Apple M5 的 Metal 4 Forward Mobile 实际录制，H.264、1280×720、20 FPS：

- `.run/evidence/phase305_battle_visual_review/01_10v10_formation.mp4`（6.10 秒）
- `.run/evidence/phase305_battle_visual_review/01b_10v10_mixed.mp4`（6.10 秒）
- `.run/evidence/phase305_battle_visual_review/02_counter.mp4`（6.60 秒）
- `.run/evidence/phase305_battle_visual_review/03_knockaway_straight.mp4`（3.75 秒）
- `.run/evidence/phase305_battle_visual_review/03b_knockaway_bounce.mp4`（4.25 秒）
- `.run/evidence/phase305_battle_visual_review/04_defend.mp4`（4.05 秒）
- `.run/evidence/phase305_battle_visual_review/05_attack.mp4`（4.95 秒）
- `.run/evidence/phase305_battle_visual_review/06_skill_attack.mp4`（5.15 秒）
- `.run/evidence/phase305_battle_visual_review/07_combo.mp4`（7.75 秒）
- `.run/evidence/phase305_battle_visual_review/08_hurt_recovery.mp4`（4.95 秒）
- `.run/evidence/phase305_battle_visual_review/09_down_exit.mp4`（3.75 秒）
- `.run/evidence/phase305_battle_visual_review/10_dodge.mp4`（4.95 秒）

同目录 `stills/` 是每秒三帧的只读审片联系表，便于核对动作顺序和遮挡；`raw/` 为 Godot 原始 Motion JPEG 记录，均属于忽略的本地证据，不进入产品资产包。

## 验证

- `git diff --check`：通过。
- `godot --headless --path client/godot --quit`：通过。
- 12 个 `--battle-visual-review` 场景分别以 headless 真实主场景运行至自行退出：全部 exit 0、无脚本错误。
- 12 个场景分别用 Metal 实录；视频均可由 `ffprobe` 读为 H.264、1280×720、20 FPS，并全部经 `ffmpeg -v error ... -f null -` 完整解码，零错误。
- `node tools/run_godot_auto_checks.mjs --only --auto-pet-action-asset-check,--auto-battle-formation-check,--auto-battle-launch-check,--auto-battle-melee-motion-check,--auto-battle-combo-motion-check,--auto-battle-visual-timing-check,--auto-battle-reaction-check --fail-fast`：含 Godot parse 共 `8/8` 通过。
- 10V10 headless 60 FPS 性能探针：稳定 `process_total=0.02ms`、`draw_battle=0.94..0.96ms`，20 只正式 256px 动画宠未把动作取帧或绘制推入异常热路径；该数据只证明本机渲染余量，不代表 200 人服务器容量。

没有运行完整本地 CI，也没有启动服务端或连接数据库；本阶段是客户端视觉评审与一个明确击飞连续性修复，使用窄测试即可覆盖。

## 用户核对重点

项目所有者先看 `01/01b` 判断最坏尺寸与当前混合阵型的两排/两队排列，再对比 `05` 与 `06` 判断普通攻击和技能是否看起来相同；随后看 `02` 与 `07` 判断反击、合击是否无需日志也能理解；最后看 `03/03b/04/08/09/10` 判断重量、停顿和恢复。任何一项第一眼需要读左下角文字才能理解，都视为表现未过，不扩产到其他宠物。
