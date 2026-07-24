# Phase 333：CC0 分层战斗打击音效 v2 与集中试听

日期：2026-07-24

## 本阶段边界

本阶段只处理项目所有者否决 Phase 332 首版打击音效后提出的返工：

- 不复制《石器时代》或其他商业游戏的音频文件；
- 从作者明确以 CC0 1.0 发布的素材包中选取短促、干燥、偏暖的 Foley；
- 保留 Phase 332 已可运行的四首项目原创场景音乐、UI 与世界音效；
- 把人物、宠物、重击、暴击、防御、闪避、反击、技能、合击、击飞、撞边、倒地、复苏和胜负等声音一次性做成可编号试听的连续证据；
- 声音必须由正式战斗事件与动画可见进度驱动，不能只在 QA 片里假播放；
- 自动门禁证明来源、完整性、时序、无削波和运行稳定；最终听感仍由项目所有者决定。

本阶段没有新增伤害、复苏或击退玩法规则，也没有修改服务端战斗结算。当前权威战斗尚无“非致死击退”和“战斗复苏”结果，因此试听中的 12、16 明确标为预留，不代表玩法已实装。

## 来源与许可证

运行 bundle：

```text
client/godot/assets/audio/beastbound_audio_v2/
```

来源账本：

```text
client/godot/assets/audio/beastbound_audio_v2/source/spec.json
client/godot/assets/audio/beastbound_audio_v2/source/provenance.json
client/godot/assets/audio/beastbound_audio_v2/source/source-selection.md
client/godot/assets/audio/beastbound_audio_v2/source/third_party/licenses/
```

冻结账本共有 35 条实际使用的源记录：

- 26 条作者明确发布为 CC0 1.0 的第三方源文件；
- 9 条 Phase 332 项目自有原创音乐、UI 与世界母带的延续使用；
- 作者／发布方为 Kenney、artisticdude、rubberduck 与 Beastbound Odyssey；
- source record 保存原始页面、作者、许可证与源文件 SHA-256；31 条运行 ledger 另存运行母带 SHA-256、处理命令与替换路径；
- 没有 StoneAge 或其他商业游戏的提取音频。

使用的公开来源页：

- Kenney Impact Sounds：`https://www.kenney.nl/assets/impact-sounds`
- Kenney RPG Audio：`https://kenney.nl/assets/rpg-audio`
- artisticdude Swishes：`https://opengameart.org/content/swishes-sound-pack`
- rubberduck 80 CC0 RPG：`https://opengameart.org/content/80-cc0-rpg-sfx`
- rubberduck 75 hit：`https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx`
- rubberduck 100 metal/wood：`https://opengameart.org/content/100-cc0-metal-and-wood-sfx`
- CC0 1.0：`https://creativecommons.org/publicdomain/zero/1.0/`

下载过但过亮、过脆的刀剑／碰撞候选没有进入 runtime。选择记录保留了拒绝理由，避免“下载到什么就直接塞进游戏”。

## 可重建的 v2 音频管线

Skill 在 Phase 332 基础上继续迭代：

```text
.agents/skills/design-beastbound-audio/SKILL.md
.agents/skills/design-beastbound-audio/references/licensed-layer-bundle-contract.md
.agents/skills/design-beastbound-audio/references/production-contract.md
.agents/skills/design-beastbound-audio/references/runtime-cue-contract.md
.agents/skills/design-beastbound-audio/scripts/build_cc0_audio_bundle.py
.agents/skills/design-beastbound-audio/scripts/audit_audio_bundle.py
.agents/skills/design-beastbound-audio/tests/test_audio_pipeline.py
```

新增规则包括：

- 第三方层必须在 `sourceRecords` 中逐文件声明作者、许可证、来源页与预期 hash；
- builder 只接受锁定源，使用 FFmpeg 8 做确定性裁切、滤波、分层、边缘淡化与 48 kHz PCM16 输出；
- runtime 只认稳定语义 cue，业务代码不依赖作者文件名；
- 单个 one-shot 至少保留 3 dBFS 峰值余量；
- 合击必须是“合击起手 → 参与者轻接触 → 最终主冲击”，不能把同一个重击样本同时叠三次；
- 同 cue 的普通冷却不能误吞合击内刻意错开的多个接触，故播放选项新增 `cooldownKey`；
- 试听证据必须是一条正常客户端连续录屏，先无 BGM 隔离试听，再以低 BGM 复测实战可读性。

验证：

```bash
.run/audio-skill-validate-venv/bin/python \
  /Users/fander/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  .agents/skills/design-beastbound-audio
# Skill is valid!

PYTHONDONTWRITEBYTECODE=1 \
  .run/audio-skill-validate-venv/bin/python \
  .agents/skills/design-beastbound-audio/tests/test_audio_pipeline.py -v
# PASS 6/6
```

六项测试覆盖规范 bundle、源 hash 篡改拒绝、未使用来源拒绝、动态 catalog/provenance、重复构建逐字节一致与错误采样率拒绝。

## 运行资产

最终 catalog 有 31 个 cue：

- 4 首项目自有原创场景音乐；
- 27 个 SFX，其中 5 个是本阶段新增语义：
  - `combat.guard_ready`
  - `combat.combo_start`
  - `combat.hit_skill`
  - `combat.hit_combo`
  - `combat.bounce_edge`

其余 Phase 332 语义保持稳定 ID，但打击、动作、受击与反应声音已由 v2 母带替换。这样调用方、设置页和存档不需要追随文件名变化。

最终只读审计：

```bash
.run/audio-skill-validate-venv/bin/python \
  .agents/skills/design-beastbound-audio/scripts/audit_audio_bundle.py \
  --bundle client/godot/assets/audio/beastbound_audio_v2 \
  --no-write-report
```

结果：

```text
status=pass
assetCount=31
failures=[]
sampleRate=48000
maxAbsDc=0.00078185
combat.hit_combo peak=-3.409 dBFS
```

四首循环音乐的边界 sample delta 均为 `0`，首尾 20 ms RMS 差为 `0.011..0.041 dB`。所有 one-shot 均不高于 `-3 dBFS`；运行时仍经过 Phase 332 已验证的单一 Master limiter。

## 正式战斗时序

`BattleAudioCueModel.timed_markers()` 现在为每个事件生成按动画进度排序的 marker，而不是在收到网络事件时一起播放：

- 动作／施法声落在动作开始；
- 防御准备声落在防御姿态建立；
- 命中、格挡、闪避、暴击与技能主冲击落在接触帧；
- 宠物受伤声只在真正被命中的宠物目标上播放，混合群攻中的人类命中不再误触发宠物叫声；
- 合击依参与者顺序错开轻接触，最终只播放一个合击主冲击；
- 直线击飞在离地可见阶段播放；
- 反弹撞边在撞到边缘的可见阶段追加独立尾音；
- 倒地声继续读取正式视觉时间轴提供的 `downSoundProgress`；
- marker ID 在同一事件中去重，`GameAudioManager` 的 voice pool、优先级和冷却继续有界。

Main 只负责把参与者种类、目标种类与正式视觉进度交给 focused audio model；没有把声音判定重新堆入 `_process()`。

## 集中试听合同

新增纯模型与正常客户端预览：

```text
client/godot/scripts/audio/audio_impact_review_model.gd
client/godot/scripts/audio/audio_impact_review_model_check.gd
client/godot/scripts/qa/audio_impact_review_preview.gd
```

第一部分无背景音乐，共 18 段：

1. 人物普通命中
2. 宠物普通命中
3. 重击
4. 暴击
5. 防御姿态
6. 格挡受击
7. 闪避
8. 反击
9. 技能起手与命中
10. 三宠合击
11. 多目标混合命中
12. 非致死击退（预留）
13. 直线击飞
14. 反弹撞边
15. 倒地
16. 复苏（预留）
17. 胜利
18. 失败

第二部分低音量战斗音乐，共 4 段：

- A：人物普通命中
- B：技能起手与命中
- C：三宠合击
- D：反弹撞边

真实战斗段都进入 Main 的正式战斗事件队列、ledger、动画时间轴与音频控制器。预览脚本不直接伪造这些段落的命中声音；只对权威玩法尚未提供的 12、16 使用明确标注的 cue-only／视觉试听。

MovieWriter 的固定 FPS 会比真实时间更快地推进画面，但声音冷却原本读取墙钟，可能导致后续 cue 被错误抑制。预览因此注入只在审片期间生效的确定性模拟时钟，结束时恢复原设置、存档开关和 QA 美术状态。

## 连续有声证据

原始 MovieWriter：

```text
.run/evidence/phase333_combat_audio_v2/combat_audio_all_impacts_v2.avi
```

项目所有者试听 MP4：

```text
.run/evidence/phase333_combat_audio_v2/combat_audio_all_impacts_v2.mp4
```

规格：

```text
1280x720
30 FPS
48.733 s
1462 frames
H.264 High + AAC-LC stereo 48 kHz
```

录制控制台按顺序输出 01—18、A—D 全部 22 段并 `exit 0`。QuickTime Computer Use 复核确认文件以未静音、音量 100% 正常播放，隔离段与低 BGM 段的编号／动作可连续推进。

整片 AAC 解码指标：

```text
mean volume=-30.2 dB
sample max=-4.7 dBFS
integrated=-24.5 LUFS
LRA=7.6 LU
true peak=-4.7 dBTP
```

没有数字削波。这里的低综合响度包含编号间静默，不能当成单个打击音的母带响度。

## 自动与运行回归

```bash
node tools/run_godot_auto_checks.mjs \
  --only=--auto-audio-impact-review-model-check,--auto-audio-runtime-check \
  --fail-fast --timeout-ms=180000
# PASS 3/3（含 parse）

godot --headless --path client/godot \
  --script res://scripts/audio/battle_audio_cue_model_check.gd
# PASS

godot --headless --path client/godot \
  --script res://scripts/audio/battle_audio_timeline_controller_check.gd
# PASS

godot --headless --path client/godot \
  --script res://scripts/audio/game_audio_manager_check.gd
# PASS
```

覆盖内容包括 31/31 资源加载、27 个 SFX 可播放、12 路 voice pool、单一 limiter、所有动作／接触／反应／结果 cue、合击错峰、撞边时序、marker 选项、幂等，以及相同／不同 `cooldownKey` 行为。

性能：

```bash
godot --headless --path client/godot \
  --fixed-fps 60 --quit-after 900 -- --perf-probe
# 60 FPS，process_total=0.08..0.19 ms

godot --headless --path client/godot \
  --fixed-fps 60 --quit-after 1800 \
  -- --movement-perf-check --perf-probe
# status=ok，60 FPS，process_total=0.04..0.05 ms
```

没有发现逐帧读取音频目录、解析 JSON、写设置或无限创建播放器的回归。

## 试听状态

bundle 保持：

```text
reviewState=owner_listening_pending
ownerListeningState=owner_listening_pending
```

自动检查已经证明来源可追溯、构建可重现、资源完整、时序由正式动画驱动、视频有声、没有削波且性能正常；它不能替项目所有者判断打击重量、材质、宠物声线和 BGM 下的主次是否喜欢。

因此 `P2.3 正式动画与音频` 继续保持未勾选。项目所有者可以直接按视频中的 `01—18 / A—D` 编号一次性反馈需要返工的段落。
