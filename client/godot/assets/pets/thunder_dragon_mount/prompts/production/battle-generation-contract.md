
# 雷龙独立战宠生成合同

- 固定身份：蓝灰卵石鳞、深海军蓝四肢、浅灰喙与腹甲、单对金色后掠闪电角、低矮金色导电背甲、三枚象牙爪、闪电铲形尾端；禁止翅膀、额外角与巨刺。
- 双独立视角：`front_3quarter_sw`、`back_3quarter_ne`；十二动作：idle, walk, attack, skill, hurt, defend, dodge, counter, stagger, knockaway, down, revive。
- 每个动作按 3×2 或 4×2 的时间顺序母表生成；无运行时源图镜像、无阴影、地面、文字或烘焙 VFX。
- `down` 是战斗昏倒，不是睡觉、死亡或笑脸；眩晕圈由运行时单独叠加。`revive-1` 与 `down-8` 精确一致。
- 正式展示：敌方 `front_3quarter_sw + flipH=true`；我方 `back_3quarter_ne + flipH=true`。
- 生成背景为纯 `#FF00FF`；正式 256×256 RGBA 帧最小 alpha 安全边不少于 4px。
