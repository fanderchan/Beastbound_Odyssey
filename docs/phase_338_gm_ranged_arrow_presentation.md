# Phase 338：GM 观战弓箭完整演出与真实 1×

日期：2026-07-25

## 玩家问题与根因

本阶段修正 Phase 336/337 的 GM 随机 10V10 观战弓箭表现，不改变战斗
AI、伤害公式或结算。

1. Phase 336 把 GM 观战默认速度设为 `1.25x`，Phase 337 的实录脚本又
   显式写入 `1.25`；因此旧录像确实不是玩家要求的真实 `1x`。
2. `multi_attack` 只有通用人物攻击状态。整体骑乘人物会复用近战出拳／
   前冲，没有拉弓、满弦和松弦视觉，箭伤害则直接在目标身上出现。
3. 没有独立箭矢实体或飞行阶段；回避只让目标横移并显示“回避”，看不到
   箭从身边穿过和落地。
4. 本地装备群攻原本已声明 `canLaunch=false`，但联网回放没有把这个语义
   显式映射到本地事件，客户端还会相信异常服务端目标事实中的
   `launched=true`。正常数据不会触发，但缺少“致死箭绝不击飞”的防御性
   回归。

## Beastbound 表现合同

### 真实 1×

- GM 观战每次打开和每次 `start_brawl()` 均从 `1.0` 开始。
- 速度按钮仍保留 `0.25 / 0.5 / 1.0 / 1.25 / 1.5 / 2.0`，玩家可以主动
  调整；默认不再替玩家加速。
- 最终 MovieWriter 以固定 30 FPS 写出游戏时间线，运行时
  `speed_scale=1.00`。离线渲染进程可以比现实时间更快完成，但输出帧时间
  仍是 1×；H.264 转码没有 `setpts` 或音频 `atempo` 滤镜。

### 拉弓、飞行、命中与回避落地

独立 `BattleRangedProjectilePresentationModel` 定义时间线与弹道，
`BattleRangedProjectileRenderer` 负责 CanvasItem 绘制，`main.gd` 只保留
预热、时间线和绘制调用接线。每次群箭演出固定为 `2.20s`：

| 阶段 | 归一进度 | 1× 时间 |
|---|---:|---:|
| 抬弓、搭箭、半拉、满弦 | `0.00..0.34` | `0.000..0.748s` |
| 松弦后箭矢完整飞行 | `0.34..0.77` | `0.748..1.694s` |
| 目标结果揭示 | `0.77` | `1.694s` |
| 命中爆点或插地余韵 | `0.77..1.00` | `1.694..2.200s` |

因此箭从弓手到目标约有 `0.946s` 的可见飞行，不再同帧瞬移。所有目标在
结果揭示前保留受击前快照；命中时才同步显示伤害、暴击和倒地。

回避目标从 `0.60` 开始侧闪。箭不会在“回避”文字出现时消失，而会越过
原瞄准点、下降到目标后方地面，依次播放触地尘点、轻微晃动和稳定插箭。
命中目标则播放四帧星芒爆点。箭矢绘制在所有人物／宠物之后、浮字之前，
确保密集 10V10 中既不遮掉角色，也不会被角色完全吞没。

骑乘弓手本体在该事件中保持稳定待机整图，由四帧弓、手臂和弓弦覆盖层
表现抬弓、半拉、满弦与回弹；不再复用突兀的近战拳击动作。

## 致死箭永不击飞

- 本地装备群攻事件继续强制 `movementStyle=ranged_multi` 和
  `canLaunch=false`。
- `ServerBattleRoomModel` 将服务端 `multi_attack` 映射为同一远程语义。
- `BattleModel` 的服务端群攻回放忽略目标事实中的 `launched`，始终写入
  `launched=false / revivable=true`；生命归零只进入原阵位 `down`。
- 两层回归分别注入本地 `canLaunch=true` 和服务端目标
  `launched=true`，并断言所有致死目标均为 `hp=0 / actionState=down /
  launched=false / lastLaunch=false`。

最终真实录像种子 `424214` 在第 2 回合自然由敌方弓手击杀
`ally_front_4`；目标在原阵位倒下，画面没有飞行轨迹、出界或撞边反馈。

## 原创资产与热路径

新增 `client/godot/assets/battle/ranged_bow_v1/`：

- `bow_draw`、`arrow_flight`、`arrow_hit`、`arrow_ground` 各四帧；
- 四组素材均由当前会话内置 OpenAI 图像生成工具独立生成；
- 逐字提示词、原始 2x2 PNG、处理产物、参数、调用 ID 和 SHA-256 均随包
  归档；
- 生命周期为 `ownerReviewStatus=pending / runtimeEnabled=false /
  qaPreviewEnabled=true`，只供显式 GM 验收场使用。

进入 GM 战斗时一次性预热 16 张纹理。`_draw()` 只查询已缓存纹理和纯
数学时间线，不读文件、不解析 JSON、不扫描图像。

## 验证

基础、观战、回放、视觉和音频时序：

```text
node tools/run_godot_auto_checks.mjs \
  --only --auto-pet-battle-review-lab-check,\
--auto-server-battle-reaction-replay-check,\
--auto-battle-visual-timing-check,\
--auto-audio-impact-review-model-check \
  --fail-fast

Godot parse + 4 checks = 5/5 PASS
.run/godot_auto_checks/2026-07-25T05-05-34-944Z.log
```

观战门禁同时确认：

```text
speedScale=1.0
level140=20
mounted=10
ranged projectile assets=4 actions / 16 frames
lethal ranged multi=down in slot / launched=false
errors=[]
```

真实 `Main.tscn`、1280×720、600 帧 Apple M5 Metal 探针：

```text
fps=60.0
process_total=0.04..0.22ms
battle_process=0.04..0.21ms
draw_battle=6.22..7.60ms
```

Phase 337 的同机地面基线为 `draw_battle=6.20..6.41ms`。密集群箭帧的
最差绘制增加约 `1.19ms`，仍低于 60 FPS 的 `16.67ms` 帧预算。该结果
只证明本机 GM 观战客户端，不代表服务器负载或 200 人同图容量。

## 1× 有声实录

最终实录：

```text
.run/evidence/phase338_ranged_projectile/Beastbound_Phase338_10v10_1x_ranged_showcase.mp4
1280×720 / 30 FPS / 918 frames
video=h264
audio=aac / 48 kHz / stereo
duration=30.600s
size=13,190,154 bytes
sha256=db5c0a32da3b332ba13775289e56ed1bfad73ad683697d167cda69b63e0d4a92
audio mean=-25.2dB / max=-2.3dB
full decode=PASS
```

可直接复核的时间点：

- `00:00..00:02`：展开工具明确显示 `1.00x`，随后进入纯观战；
- `00:04.77`：第一轮完整敌方群箭；
- `00:09.77..00:11.70`：我方拉弓、箭路、目标回避、箭插地；
- `00:22.50..00:24.65`：敌方拉弓、箭路、命中爆点和自然致死，目标原地
  倒下且没有击飞；
- `00:27.53`：再一轮群箭后结束。

精确 1280×720 复核帧：

```text
.run/evidence/phase338_ranged_projectile/dodge_11.70.png
.run/evidence/phase338_ranged_projectile/kill_down_24.65.png
```

## 非目标与验收状态

- 没有改变战术 AI 的职责、目标选择、伤害、命中、回避或奖励结算。
- 没有把候选弓箭资产发布到普通玩家战斗；正式人物专属射箭整图仍属于
  P2.3 后续生产范围。
- 工程门禁、自审和短片通过，但箭速、尺寸、爆点强度及长时间观战爽快感
  仍由项目所有者看本阶段 1× 实录验收，因此 P2.3 保持未勾选。
