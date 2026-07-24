# Phase 335：正式四场景背景音乐与转场试听

日期：2026-07-25

## 本阶段边界

本阶段把 Phase 332 中用于打通运行链路的 7–13 秒程序化音乐 canary，
替换为四首长篇、来源可追溯、许可可用于项目发行的正式背景音乐候选：

- 城镇／村庄；
- 野外／路线；
- 洞窟／地下；
- 普通战斗。

稳定 cue ID、地图分类与战斗覆盖合同保持不变：

```text
music.town
music.wilderness
music.cave
music.battle_normal
```

本阶段同时收口解码后循环审计、运行时无空洞转场、快速连续切换、
战斗结束准确恢复原地图音乐、发行包署名文件和一条编号连续试听证据。
没有修改服务端、战斗结算、地图分类、玩家档案或 Phase 334 已接受的打击
音效。项目所有者对 Phase 334 的结论仍是：

```text
impactListeningState=owner_accepted_with_reservation
```

这不等于四首背景音乐已通过所有者听感验收，也不代表
**P2.3 正式动画与音频** 已完成。

## 来源、许可与冻结原件

四首音乐均来自作者在 OpenGameArt 发布的独立页面；没有从 StoneAge
或其他商业游戏提取、复制或改名使用音频。

| 语境 | 作品与作者 | 许可 | 冻结源文件 | 源 SHA-256 |
| --- | --- | --- | --- | --- |
| 城镇 | [Town Theme RPG](https://opengameart.org/content/town-theme-rpg-0)，ComposerBeck | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | `source/third_party/composerbeck_town_theme/town_theme.wav` | `cdd0b06d587475fc69634e27f3c351c3c874585f137063a3b0500ac0abd82918` |
| 野外 | [The Field Of Dreams](https://opengameart.org/content/the-field-of-dreams)，pauliuw | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `source/third_party/pauliuw_field_of_dreams/the_field_of_dreams.mp3` | `103a7032a49be7e8399c5cb771f7759eac9ac1a0d2bf227f41fff42ad8d78194` |
| 洞窟 | [Cave Theme](https://opengameart.org/content/cave-theme)，Brandon Morris（Brandon75689，由 HaelDB 提交） | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `source/third_party/brandon_morris_cave_theme/cave_theme.ogg` | `1ddf7a0845c808136edfda7ea829e48fa2b7c57793e008d706dadbb5917dff9c` |
| 普通战斗 | [A Regular Battle](https://opengameart.org/content/a-regular-battle)，Telaron | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | `source/third_party/telaron_regular_battle/regular_battle.mp3` | `fd7b2d4658628cff2aaf1a6596a0126ad1557fb8fc3bcab440843889dfbb135c` |

冻结文件、作者、许可证、来源页与预期 hash 位于：

```text
client/godot/assets/audio/beastbound_audio_v2/source/provenance.json
client/godot/assets/audio/beastbound_audio_v2/source/third_party/licenses/OpenGameArt-BGM-sources.md
```

构建器只读取 hash 匹配的冻结原件。源文件保持逐字节不变；裁切、循环交叉
淡化、静态增益、重采样和 Ogg 编码只写入 runtime 母带。

## 48 kHz Ogg runtime 母带

四首运行音乐均为 48 kHz、双声道、Ogg Vorbis quality 5。审计读取的是
最终 runtime Ogg 的完整解码结果，不用编码前 WAV 代替发行资产结论。

| cue | runtime 文件 | 时长 | Peak / RMS | LUFS-I | DC | 三边界最大 sample delta / 20 ms RMS 差 | runtime SHA-256 |
| --- | --- | ---: | --- | ---: | ---: | --- | --- |
| `music.town` | `runtime/music/town_loop.ogg` | `62.276 s` | `-5.696 / -20.725 dBFS` | `-18.3` | `-0.00006576` | `0.00064087 / 0.195 dB` | `61fb2b709df53c5cb2c709169261cb30fad01661de5bd6ebb938cf612759c3b2` |
| `music.wilderness` | `runtime/music/wilderness_loop.ogg` | `80.454667 s` | `-3.226 / -21.340 dBFS` | `-18.6` | `-0.00065386` | `0.00030518 / 0.142 dB` | `383e3bb4b06307de8ca014334df8deac967a72a621b2830e8650216b1f5bf015` |
| `music.cave` | `runtime/music/cave_loop.ogg` | `276.356 s` | `-3.343 / -19.656 dBFS` | `-18.8` | `0.00003750` | `0.00109863 / 0.178 dB` | `8af10e3d28e294056ba9d2adf1482b4aea38b906d5f90b589c487382ce3644d7` |
| `music.battle_normal` | `runtime/music/battle_normal_loop.ogg` | `91.852 s` | `-2.824 / -20.889 dBFS` | `-18.5` | `0.00003051` | `0.00061035 / 0.292 dB` | `22b09adc8548b0f8c59f6a0dd8ae0123604415a801a79e5d255cb4431d138b3b` |

最终 bundle 审计结论：

```text
status=pass
assetCount=31
failures=[]
music checkedBoundaryCount=3/3/3/3
```

31 项包含 4 首背景音乐和 Phase 334 已冻结的 27 个 SFX。音乐替换期间，
27 个已接受音效的 runtime hash 保持不变。

## 循环制作与洞窟返工

一般音乐处理合同为：

```text
冻结源
→ 去除选定首尾
→ 2–3 秒 tail-to-head crossfade
→ 48 kHz stereo lossless intermediate
→ 确定性 circular rotation
→ Ogg Vorbis quality 5
→ 解码并连续重复四份，检查其中三个独立边界
```

审计门槛没有因为改用有损 Ogg 而放宽：

```text
abs(DC) <= 0.001
decoded boundary sample delta <= 0.002
decoded first/last 20 ms RMS delta <= 1.0 dB
```

首轮洞窟 Ogg 未通过同一严格边界门槛。修复没有降低阈值、在播放端加
静音孔或用编码前数据替代，而是：

- 对冻结源应用有记录的 `10 Hz` 高通，仅清理不可听次声／直流成分；
- 在无损循环中采用人工复核的 `275.008604 s` circular cut；
- 保留 `3 s` 首尾交叉淡化；
- 对最终编码 Ogg 重新做三个独立循环边界审计。

最终洞窟母带与另外三首使用同一门槛通过。`10 Hz` 与 reviewed rotation
均写入 `source/spec.json` 和 `source/provenance.json`，不是构建器中的
隐式补丁。

为避免 FFmpeg 多输入 SFX 在不同调度下产生尾帧差异，管线还固定了
filter/output threads 与每层 frame cadence；至少三次完整重复构建
逐字节一致，且没有改变 Phase 334 的 `combat.down`、`combat.launch`
或其他已接受 SFX。

## GameAudioManager 运行合同

本阶段继续使用两个 `AudioStreamPlayer`，但把旧线性交叉淡化改为
`0.75 s` 等功率包络：

```text
incoming = sin(progress * PI / 2)
outgoing = cos(progress * PI / 2)
```

在中点两路各约 `-3 dB`，避免线性淡化中点突然变薄。运行行为还包括：

- 正常客户端预热四首音乐流，切换时不把 Ogg 首次加载延迟暴露成静音；
- headless 或显式禁播状态不预热、不创建实际播放负担；
- 先同步场景、后开启 playback 的 deferred 路径会重新预热并真正起播，
  不会因为 cue 状态已写入而误判为“正在播放”；
- 同一 cue 的幂等同步不会重启或叠播；
- 第三次快速切换到来时，以当前较响播放器为 outgoing，复用较静音槽，
  并从两路当前合成能量继续等功率转场，不先归零；
- 进入普通战斗只临时覆盖世界音乐；结束后准确恢复同一个野外或洞窟
  cue，且只恢复一次。

focused manager 检查同时验证了预热 4 首、禁播后启播、等功率中点、
快速三连切的中间总功率与最终收敛。

## 发行包署名证明

需要署名的 CC BY 作品与两首 CC0 courtesy credit 均写入：

```text
client/godot/assets/audio/beastbound_audio_v2/ATTRIBUTION.md
```

macOS、Windows 与 Android 三个 export preset 都显式包含该文件。另用
真实 `macOS` preset 导出临时 PCK，并从 PCK 字符串中确认：

```text
# Beastbound Odyssey audio attribution
Town Theme RPG
ComposerBeck
A Regular Battle
Telaron
```

因此证明的不只是“仓库里有署名文件”，而是发行 pack 会实际携带所需
署名。临时 PCK 验证后已删除，没有作为产品资产提交。

## 01—07 连续所有者试听

新增 owner-facing 纯模型与正常客户端预览：

```text
client/godot/scripts/audio/audio_music_review_model.gd
client/godot/scripts/audio/audio_music_review_model_check.gd
client/godot/scripts/qa/audio_music_review_preview.gd
```

约 64 秒连续片按以下顺序调用真实 `GameAudioManager` 与正式 catalog：

1. `01` 城镇独立试听；
2. `02` 野外独立试听；
3. `03` 洞窟独立试听；
4. `04` 普通战斗独立试听；
5. `05` 野外 → 战斗 → 准确恢复同一野外；
6. `06` 洞窟 → 战斗 → 准确恢复同一洞窟；
7. `07` 默认音乐 `72%`、音效 `86%` 下，复测命中、击飞、击倒与胜利
   的遮蔽关系。

最终所有者试听 MP4：

```text
.run/evidence/phase335_formal_background_music/formal_bgm_review_1280x720_30fps.mp4
1280×720
30 FPS
duration=64.066667 s
video=h264
audio=aac / 48 kHz / stereo
size=3,839,526 bytes
sha256=737459f97f31924c82cdd73c96edf1f75e883b4593395aea4adfdcd46b9a5a5a
```

最终片完整解码无错误；整片为 `-27.6 LUFS-I`、`8.7 LU LRA`、
`-4.5 dBFS true peak`，没有削波或非有限采样。Computer Use 已在
QuickTime 中以未静音、系统播放器音量 `1.0` 从 `00:00` 播放至
`64.067 s`；末帧保持 `试听完成 / 07 / 07`，没有在退出前闪回底层游戏
地图。编号和机器检查只证明试听范围完整；旋律、耐听性、场景贴合和
长时间循环仍必须由项目所有者判断。

## 验证清单

已经成立的门禁：

```text
四个第三方源 hash 与 sourceRecords：PASS
确定性 builder 多次重复构建：PASS
bundle decoded audit：31/31 PASS
四首 Ogg 三独立边界循环审计：PASS
Godot parse：PASS
audio music review model：PASS
audio runtime resource load：PASS
GameAudioManager equal-power/prewarm/deferred/rapid-switch：PASS
真实 macOS PCK attribution：PASS
audio Skill quick_validate：PASS
Python audio pipeline：8/8 PASS
idle perf：60 FPS，process_total=0.04–0.05 ms
moving perf：60 FPS，process_total=0.04–0.05 ms，movement status=ok
最终 MP4 全量音视频解码：PASS
Computer Use QuickTime 全片播放与末帧：PASS
```

这些检查不允许把 `owner_listening_pending` 自动升级为通过。

## 明确不在本阶段范围内

- Boss／世界 Boss／PvP／活动专属音乐；
- 每张村庄、路线、洞窟各自一首独有 BGM；
- 独立风雨、水流、火堆、虫鸣、室内空间等 ambience 层；
- 全宠物、全职业或全技能的差异化音色；
- 通用 UI 按钮音效的全客户端覆盖；
- 新战斗结果、复苏、击退或服务端协议；
- P2.3 中尚未验收的正式人物、宠物与整体骑乘动画。

## 所有者状态

当前机器门禁与运行接入通过不代表审美验收。状态保持：

```text
reviewState=owner_listening_pending
ownerListeningState=owner_listening_pending
impactListeningState=owner_accepted_with_reservation
P2.3=unchecked
```

项目所有者可直接按 `01—07` 反馈具体场景、转场或遮蔽问题；在明确接受
四首音乐前，不生成 owner-accepted 结论，也不勾选 P2.3。
