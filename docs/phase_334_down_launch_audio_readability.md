# Phase 334：击倒晕眩与击飞破空可听辨性返工

日期：2026-07-25

## 本阶段边界

本阶段只修复项目所有者对 Phase 333 集中试听提出的两个明确问题：

- 击倒只有闷响，没有能读成“已经晕倒”的声音；
- 击飞听不到独立特效声。

没有新增战斗状态、伤害、击飞或复苏规则，没有增加 stable cue ID，也没有复制 StoneAge 或其他商业游戏音频。`combat.down` 与 `combat.launch` 继续使用 Phase 333 已冻结、可追溯的 CC0 来源。

## 根因

问题不是资源缺失，也不是播放链漏调用。

- 原 `combat.down` 为 `0.472 s / -9.81 dBFS`，只有皮革落地与闷撞；90% 能量在约 `175 ms` 内结束，没有晕眩、星点或失去意识语义。
- 正式普通倒地时间轴中，宠物受伤声与倒地声只相隔约 `50–64 ms`，两者会被听成一次合并撞击。
- 原 `combat.launch` 为 `0.345 s / -7.96 dBFS`，主体偏低频，第二层仍像普通 hit，没有稳定飞行尾。
- Main 曾把 `launchSoundProgress` 直接设为 `damageRevealProgress`，导致命中、受伤与击飞在同一帧触发；即使 cue 存在，也会被命中声掩蔽。
- Phase 333 的第一部分只是“无 BGM 的正式动作链”，不是单 cue 隔离。现已修正文案，并把直线击飞与倒地加入低 BGM 复测。

## 母带修正

### `combat.down`

继续保留皮革／身体落地层，并用现有 `rubberduck_item_gem_02` 增加三颗非循环、音高递降的星点：

```text
160 ms  pitch 1.08
290 ms  pitch 0.93
420 ms  pitch 0.80
```

三颗星点与胜利声的上行语义相反，只用于表达短暂昏厥确认，不代表新增状态循环。

最终运行母带：

```text
duration=0.668750 s
peak=-6.721 dBFS
rms=-23.486 dBFS
sha256=f49b66e7f81b615e48b3737adc35247440dc763fcc044b277c5db2989b72bca0
```

### `combat.launch`

删除会被听成第二次普通命中的 `bfh1_hit_06` 层，改为：

- 一层较厚的离地 swish；
- 一层较亮的高频 swish；
- 一层延续到飞行阶段的 spell-air 尾音。

最终运行母带：

```text
duration=0.574896 s
peak=-3.790 dBFS
rms=-20.358 dBFS
200–450 ms flight-tail rms=-25.429 dBFS
sha256=c91a48b6db44f43a907b83ea989c52fc32838357628aaf4736edd294f13151f9
```

这条尾音在低音量战斗 BGM 下仍有可读能量，同时保留超过 3 dBFS 的母带峰值余量。

## 正式时序修正

Main 的事件时间轴现在明确保持：

```text
命中 < 可见离地破空 < 可见撞边
```

- `launchSoundProgress` 按事件时长换算为命中后 `65 ms`，此时目标已产生可见离地位移；
- focused cue model 即使收到错误的同帧 marker，也会强制击飞至少晚于命中 `0.03` 进度；
- 撞边至少再晚于击飞 `0.03` 进度；
- 普通倒地声改为命中后 `300 ms`，与宠物受伤声拉开约 `200 ms`；
- focused cue model 额外拒绝距命中过近的显式倒地 marker；
- 普通致死反击仍按“接触受击 → 负伤退回 → 原阵位倒地”的现有视觉 marker 播放，没有套用普通攻击固定延迟。

这些计算只发生在事件时间轴构建时，没有向 `_process()`、绘制或逐帧签名增加音频扫描。

## Skill 迭代

项目 `design-beastbound-audio` Skill 新增两条正式生产规则：

- 击飞必须在可见离地阶段提供独立破空／空气位移层；即使没有落地，直线击飞也必须有可听飞行尾；
- 击倒必须同时表达身体／地面接触与短促、非循环的失去意识提示；通用闷响不再算完成。

生产证据合同也要求这两条在低 BGM 下保持可读，并与普通击退区分。

## 自动验证

音频与 Skill：

```text
Skill quick_validate: PASS
audio pipeline: 6/6 PASS
bundle audit: 31/31 PASS
failures=[]
```

Godot：

```text
parse: PASS
audio impact review model + runtime: 3/3 PASS
battle audio cue model: PASS
battle audio timeline controller: PASS
game audio manager: PASS
```

新增回归会拒绝：

- contact 与 launch 同帧；
- bounce 早于或等于 launch；
- down 紧贴 contact；
- 同一 marker 重复播放；
- launched 结果错误叠加 down。

Godot 单进程 editor import 明确只重导入了：

```text
combat_down.wav
combat_launch.wav
```

因此本阶段真实客户端不会继续读取 Phase 333 的旧导入缓存。

## 真实客户端证据

完整正常客户端 MovieWriter：

```text
.run/evidence/phase334_down_launch_audio/combat_down_launch_review_v4.mp4
1280×720
30 FPS
53.600 s
1608 frames
H.264 High + AAC-LC stereo 48 kHz
integrated=-23.3 LUFS
true peak=-4.7 dBFS
```

聚焦短片：

```text
.run/evidence/phase334_down_launch_audio/down_launch_no_bgm_v4.mp4
8.000 s
13 直线击飞 → 14 反弹撞边 → 15 倒地与晕眩尾音

.run/evidence/phase334_down_launch_audio/down_launch_low_bgm_v4.mp4
6.467 s
E 低 BGM 直线击飞 → F 低 BGM 倒地与晕眩尾音
```

三个 MP4 均完整解码、包含 48 kHz 双声道音轨。Computer Use 在 QuickTime 中确认无 BGM 短片以未静音、音量 `1.0` 播放至 `8.0 s` 结尾；完整片末帧也确认显示修正后的 `01—18 / A—F` 反馈说明。

性能：

```text
idle: 60 FPS, process_total=0.10..0.15 ms
moving: 60 FPS, process_total=0.18..0.25 ms
movement check: status=ok
```

## 试听状态

确定性的资源、时序、导入、播放、混音安全与性能门禁已经通过。项目所有者于 2026-07-25 试听后反馈“音响勉强能接受”，因此本轮击飞／击倒返工按可接受收口，不继续调整这两条 cue。整个 v2 bundle 仍含下一阶段要开发的背景音乐，故 bundle 级状态与 P2.3 暂不提前完成：

```text
impactListeningState=owner_accepted_with_reservation
bundleOwnerListeningState=owner_listening_pending
P2.3=unchecked
```
