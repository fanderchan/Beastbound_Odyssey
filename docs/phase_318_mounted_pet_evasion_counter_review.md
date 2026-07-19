# Phase 318：战宠与骑宠人物回避／回避反击定向审片

日期：2026-07-19

## 目标与边界

本阶段为项目所有者提供一条短录像，集中观察四种正式战斗表现：战宠回避、骑宠人物回避、战宠回避后反击、骑宠人物回避后反击。

这不是新增战斗规则。现行 `BattleModel` 在普通近战被判定为回避后，本来就会继续按目标的反击率生成 `counter_attack`；本阶段只给 Phase 309/313 的隔离战斗验收场补齐可稳定必现的导演场景和命令行筛选入口，没有调整命中、回避、反击、伤害或骑乘公式。

验收场继续使用正式 battle event、ledger、位移、动作目录与 `Main.tscn` 绘制链，不连接后端、MySQL 或真实玩家档案，也不结算经验、掉落和奖励。

## 实现

- 动作导演新增“战宠回避后反击”“骑宠人物回避”“骑宠人物回避后反击”，与原有“战宠回避”组成四段定向审片清单。
- `--pet-battle-review-steps=` 可按给定顺序筛选导演段落。本次录像只运行 `dodge,mounted_dodge,dodge_counter,mounted_dodge_counter`，不必重录完整 19 段长片。
- 两个“回避后反击”场景先提交强制回避的正式攻击事件，再读取 `BattleModel` 生成的真实 `lastCounterEvent` 并交回正常事件队列；没有直接伪造一段无结算依据的反击动画。
- 自动验证分别锁定战宠和骑宠人物的回避者、反击者、目标与最终 `counter_attack` 事件，防止录像只显示文字却没有真实状态链。

## 自动验证

定向 Godot 门禁共 `4/4` 通过：

- Godot parse；
- 宠物战斗动作验收场；
- 近战往返位移；
- 回避／反击事件与反应时序。

命令：

```sh
node tools/run_godot_auto_checks.mjs \
  --only=--auto-pet-battle-review-lab-check,--auto-battle-melee-motion-check,--auto-battle-reaction-check \
  --fail-fast --timeout-ms 180000
```

日志：`.run/godot_auto_checks/2026-07-19T06-18-22-576Z.log`。

提交前针对最终筛选顺序再跑 Godot parse 与宠物战斗动作验收场，`2/2` 通过；日志：`.run/godot_auto_checks/2026-07-19T06-24-49-254Z.log`。

四段筛选入口另以 headless 单轮运行复核，正常完成并自动退出。`git diff --check` 与最终 MP4 全片解码均为零错误。

## 真实 Metal 录像

录像由真实 `Main.tscn`、macOS Metal 与 Godot Movie Maker 在同一进程内连续生成，没有后期拼接：

- 画面：1280×720，60 FPS；
- 时长：10.35 秒；
- 视频：H.264 High；
- 帧数：621；
- 四段顺序：战宠回避 → 骑宠人物回避 → 战宠回避后反击 → 骑宠人物回避后反击；
- `ffprobe` 已确认分辨率、帧率、时长和帧数；`ffmpeg -v error ... -f null -` 全片解码零错误。

证据目录：`.run/evidence/phase318_evasion_counter_review/final/`。

- `mounted_pet_evasion_counter.mp4`：项目所有者审片用短片；
- `mounted_pet_evasion_counter.avi`：Godot 原始 Movie Maker 录像；
- `contact-sheet.png`：全片抽帧联系表；
- `frames/`：逐段原尺寸抽帧。

## 美术自审结论

状态为 `mechanics_passed_visual_failed_owner_review_pending`，不能把本片当作回避动画已完成：

- 当前回避主要依靠短距离斜移、通用 `walk` 动作和“回避”浮字。在 10V10 密集阵型中，不看标题或浮字时，动作更像轻微跳步，缺少明确的预备、侧闪弧线和落地回稳。
- 战宠回避后能按正确次序转入反击，但回避结束与反击起步衔接过快，缺少一帧可读的重心转换。
- 现有整体骑乘包只有 `idle/walk`。骑宠人物回避和反击都在复用步行动作，因此骑乘回避尤其弱，反击也没有专属蓄力、出手和收势整图。
- 四段的事件对象、伤害、往返与结算顺序正确；需要返工的是动作表达，不是再造一套数值规则。

后续若进入动画返工，验收线应为：关闭消息框也能一眼分辨“被攻击但闪开”，回避位移不与邻位重叠，回避后反击有清楚的重心转换，战宠和整体骑乘各自拥有适合体型的回避／反击动作，而不是继续用浮字弥补动作信息。
