# Phase 332：原创场景音乐与动作音效基础实装

日期：2026-07-24

## 本阶段边界

本阶段解决的是正常 `Main.tscn` 客户端此前完全无声的问题，并交付第一套可运行、可替换、可审计的原创音频基础：

- 城镇、野外、洞窟与普通战斗四种高层音乐语境；
- 人物／宠物动作、命中、格挡、闪避、暴击、反击、击飞、击退、倒地、复活、胜负、遇敌和传送等首批语义音效；
- 地图进入战斗、战斗结束返回地图时的音乐覆盖与恢复；
- 与战斗动画阶段绑定的音效调度；
- 玩家可见的音乐／音效音量与全部静音设置；
- 原创音频生成、来源、审计、运行绑定、录音与性能验证的项目 Skill。

这是一套“首批正式音频基础”，不代表整个 **P2.3 正式动画与音频** 已完成。通用 UI 按钮绑定、Boss 专属音乐、独立环境氛围层、全宠物差异化声音以及 P2.3 其余正式动画验收仍在本阶段范围之外。

## 零音频根因

修复前的仓库真相不是音量设置错误、系统声卡异常、Godot 设备选择错误或后端登录问题，而是产品源码里根本没有音频系统：

```bash
git ls-tree -r --name-only HEAD \
  | rg -i '(^|/)(audio|sound|music|sfx)|\.(wav|ogg|mp3|flac)$'

git grep -n -E 'AudioStream|AudioServer|play_cue|music' \
  HEAD -- client/godot
```

两项检查均没有得到产品音频资产或运行播放代码。旧客户端因此同时缺少：

- BGM／SFX 文件；
- `AudioStreamPlayer` 与音乐状态机；
- Music、SFX、Combat、Pet、UI 总线；
- 地图、战斗与动画事件到声音 cue 的绑定；
- 音量、静音与本地持久化入口。

所以“游戏没有声音”是一个尚未实现的产品能力，不是重启后端或重开客户端能够恢复的偶发故障。

## 参考边界

本阶段检查了本地 StoneAge 8.0 参考，只用于确认成熟 RPG 中通常需要哪些声音类别，以及动作声应落在起手、接触、受击／位移、倒地和结算中的哪个可见阶段。

没有复制 StoneAge 的音频文件、旋律、采样、文件名、ID、代码、数据或混音数值。当前 26 个 runtime 文件全部由 Beastbound 自有的确定性程序合成器从项目规格生成，来源账本明确声明：

```text
No recordings, samples, third-party melodies, or reference-game audio are used.
```

语义 cue 与具体音频文件也保持分离，未来可以在不改战斗权威结果和调用方的前提下替换为项目自录、委托制作或重新审听后的正式母带。

## 新增并实测迭代的音频 Skill

新增项目 Skill：

```text
.agents/skills/design-beastbound-audio/SKILL.md
.agents/skills/design-beastbound-audio/agents/openai.yaml
.agents/skills/design-beastbound-audio/references/production-contract.md
.agents/skills/design-beastbound-audio/references/runtime-cue-contract.md
.agents/skills/design-beastbound-audio/scripts/synthesize_audio_bundle.py
.agents/skills/design-beastbound-audio/scripts/audit_audio_bundle.py
.agents/skills/design-beastbound-audio/tests/test_audio_pipeline.py
```

Skill 固化了以下生产规则：

- 先冻结场景、cue 家族、事件时序、复用、混音、控制和验收合同，再生成文件；
- 只使用来源清楚且可重建的原创、录制、委托或授权音频；
- 运行调用只认稳定语义 cue，不让业务代码依赖文件名；
- 服务端／战斗账本决定“发生了什么”，动画可见阶段决定“什么时候播放”；
- 音乐按高层场景状态切换，同语境幂等，不因普通 UI 操作重复起播；
- 并发音效使用有界 voice pool、优先级、冷却和确定性抢占；
- 自动指标只能发现静音、削波、DC、断环、错绑和重复播放，不能替代人的审美试听。

本阶段没有只写一份静态说明，而是根据真实实现和测试问题继续修订 Skill：

- 补入确定性 bundle 的生成、审计和测试命令；
- 明确 DC 绝对值 `<= 0.001`、循环边界差 `<= 0.002`、首尾 20 ms RMS 差 `<= 1 dB`；
- 明确 Master 只能有一个 `AudioEffectHardLimiter`，不能把 sample-peak ceiling 冒充真峰值结论；首段实录发现 `-1.0 dB` ceiling 仍会产生 `-0.1 dBTP` 重建峰值后，规则已修订为本 Godot PCM 路径从 `-2.0 dB` 起步，并强制分析冻结混音的 sample peak 与 true peak；
- 倒地声必须读取由视觉时间轴提供的 `downSoundProgress`，不能用统一延迟猜测；
- 音量滑杆实时生效，但磁盘写入需 `0.35 s` debounce，并在拖动结束／面板退出时立即 flush；
- 普通 headless 检查关闭物理播放，但仍检查目录、路由、冷却、状态切换和池容量；
- 新音频未被 `ResourceLoader` 发现时，先执行一次 Godot editor import scan；
- MovieWriter 有声证据必须使用正常显示驱动和 `--audio-driver Dummy`，不能使用会主动关闭播放的 `--headless`；
- 即将退出的 QA／录制路径必须停止播放器、清空 stream，并等待两个 frame 让 AudioServer 排空资源。

官方 Skill 结构验证与自身回归均通过：

```bash
.run/audio-skill-validate-venv/bin/python \
  /Users/fander/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  .agents/skills/design-beastbound-audio
# PASS

python3 .agents/skills/design-beastbound-audio/tests/test_audio_pipeline.py -v
# PASS 3/3：规范 bundle 通过、重复构建逐字节一致、44.1 kHz 错误输入被拒绝
```

最终修订后的 Skill 已再次前向应用于本次 bundle；不是只让旧资产通过后再补一份未验证的规则。

## 原创音频资产

bundle 位于：

```text
client/godot/assets/audio/beastbound_audio_v1/
```

### 4 首场景 BGM

| 语境 | cue | runtime 文件 |
| --- | --- | --- |
| 城镇／村庄 | `music.town` | `runtime/music/town_loop.wav` |
| 野外／路线 | `music.wilderness` | `runtime/music/wilderness_loop.wav` |
| 洞窟／地下 | `music.cave` | `runtime/music/cave_loop.wav` |
| 普通战斗 | `music.battle_normal` | `runtime/music/battle_normal_loop.wav` |

首批音乐使用 48 kHz、双声道、PCM16 WAV，目的是让标准库生成器可以无损、确定性重建，并先锁定循环与运行状态机。来源账本已经记录后续替换路径：审听通过后可改为 Ogg Vorbis runtime，但必须重新执行解码后循环审计。

### 22 个短音效

| 类别 | 已提供语义 |
| --- | --- |
| 人物／宠物动作 | `combat.motion_character`、`combat.motion_pet` |
| 技能与接触 | `combat.cast_skill`、`combat.hit_light`、`combat.hit_heavy` |
| 防御与强调 | `combat.block`、`combat.evade`、`combat.critical` |
| 反击与位移 | `combat.counter`、`combat.launch`、`combat.knockback` |
| 状态变化 | `combat.down`、`combat.revive` |
| 宠物声音 | `creature.pet_effort`、`creature.pet_hurt` |
| 战斗结果 | `outcome.victory`、`outcome.defeat` |
| UI 预留 | `ui.confirm`、`ui.cancel`、`ui.error` |
| 世界事件 | `world.encounter`、`world.warp` |

短音效均为 48 kHz、单声道、PCM16 WAV。UI 三个 cue 已有原创资产和目录定义，但本阶段尚未把它们绑定到全游戏的通用按钮；不能把“文件存在”误报为“所有按钮已有声音”。

### 来源与审计结果

每个资产都在 `source/provenance.json` 中记录稳定 `assetId`、cue、角色、工具版本、确定性 seed、规格片段 hash、runtime hash、所有权基础、替换路径与试听状态。bundle 共 `26` 个账本项，对应 `26` 个 cue，未发现孤儿文件。

生成与审计命令：

```bash
python3 .agents/skills/design-beastbound-audio/scripts/synthesize_audio_bundle.py \
  --spec client/godot/assets/audio/beastbound_audio_v1/source/spec.json \
  --output client/godot/assets/audio/beastbound_audio_v1

python3 .agents/skills/design-beastbound-audio/scripts/audit_audio_bundle.py \
  --bundle client/godot/assets/audio/beastbound_audio_v1

python3 .agents/skills/design-beastbound-audio/tests/test_audio_pipeline.py -v
```

最终结果：

```text
assets=26
failures=0
status=pass
sampleRate=48000 Hz
max |DC offset|=0.00000045
max loop last-to-first delta=0.000
max three-boundary delta=0.000
max first/last 20 ms RMS delta=0.041 dB
```

这些结果低于 Skill 的硬门槛；四首音乐在特征审计中也保持可区分。审计只证明信号、来源、格式和循环合同成立，不代表旋律与打击感已经得到项目所有者审美接受。

## 运行架构

### GameAudioManager

新增 focused `GameAudioManager`，`main.gd` 只负责生命周期和事件 wiring。主要合同为：

- 自动创建／复用 `Music`、`SFX`、`Combat`、`Pet`、`UI` 五条总线；
- Master 上保持唯一 `AudioEffectHardLimiter`，当前 ceiling 显式为 `-2.0 dB`，为采样点之间的重建峰值预留余量；
- 两个 BGM player 进行 `0.75 s` 交叉淡化；
- 同一语境重复同步不重启、不叠加当前音乐；
- `12` 路 SFX voice pool，有界并发、按优先级抢占最旧的最低优先级 voice；
- 每个 cue 使用 `40–500 ms` 语义冷却，抑制同帧或短时间重复触发；
- 音频资源按路径缓存，缺失文件安全静音，不阻断地图或战斗；
- 未知地图不会沿用上一张地图的错误音乐，而是停止旧地图音乐并给开发日志告警；
- 默认普通客户端开启真实播放；headless 默认只运行状态与路由检查，不创建需要异步释放的物理播放对象。

地图分类由独立 `WorldAudioContextModel` 完成，当前 `37/37` 张权威地图均有明确语境：

```text
town=11
wilderness=5
cave=21
unknown=0
```

地图加载后同步当前世界语境；进入战斗后 `music.battle_normal` 临时覆盖地图音乐；战斗结束、房间关闭或恢复世界时只恢复当前地图语境一次。

Boss 音乐没有通过地图名、敌人名或显示文本猜测。当前战斗权威合同没有明确 Boss 分类，因此 `music.battle_boss` 本阶段故意不启用。

### 战斗动作时序

新增纯 `BattleAudioCueModel` 与 `BattleAudioTimelineController`：

```text
action_start -> 人物／宠物动作、技能起手、反击起手、复活开始
contact      -> 命中／重击、格挡、闪避、暴击
reaction     -> 宠物受击、击飞或击退
down         -> 目标真正到达倒地可见阶段
outcome      -> 胜利或失败结果可见
```

权威事件决定 cue 种类，客户端已存在的动画进度决定触发时间。接触声使用 `damageRevealProgress`，位移／受击在接触之后，倒地使用显式 `downSoundProgress`：

- 普通倒地在可见接触后进入倒地阶段；
- 非击飞反击致死会先回到自身站位，再在 `counter_ko_return_end_progress + 0.02` 播放倒地声；
- 击飞／击退先播放接触，再播放位移，不能让倒地声提前盖住飞行。

闪避只保留动作与 evade，不播放实体命中；格挡用 block 取代普通实体命中；反击作为自己的完整事件序列播放，不再被当作普通攻击附注。

### `counter_attack` 状态修复

接入反击音效时复现了一个既有明确错误：`BattleModel` 在本地事件和服务器回放两条路径中，都把 `counter_attack` 攻击者的 `actionState` 写成了 `"attack"`。这会让反击的视觉状态与语义事件不一致，也会削弱反击音效和动作阶段的可靠性。

现两条路径都保留：

```text
event type = counter_attack
actor actionState = counter_attack
```

聚焦回归同时验证本地结算和服务器已结算事件，均返回 `counter_attack`。

### 玩家声音设置

在普通账号面板中加入玩家可见的“声音设置”：

- 音乐滑杆；
- 音效滑杆；
- 全部静音。

默认值为音乐 `72%`、音效 `86%`、未静音。更改后立即应用到对应总线；滑杆连续拖动只更新内存和总线，`0.35 s` 后再写入 `user://beastbound_audio_settings.json`，拖动结束或面板退出时立即 flush。静音和调音不会重建世界、重启同一首 BGM 或写入服务端权威档案。

## 自动验证

### Godot 资源导入与解析

```bash
godot --headless --editor --path client/godot --quit
# PASS：新 WAV 完成 Godot import scan

godot --headless --path client/godot --quit
# PASS：GDScript / 资源解析通过
```

### focused 模型与运行检查

```bash
godot --headless --path client/godot \
  --script res://scripts/audio/game_audio_manager_check.gd
# PASS：5 buses、唯一 -2 dB limiter、0.75 s crossfade、12 voices、缓存、冷却、
#       高优先级抢占、设置持久化、播放开关、缺失资源安全静音

godot --headless --path client/godot \
  --script res://scripts/audio/battle_audio_cue_model_check.gd
# PASS：attack / skill / dodge / block / critical / counter / launch /
#       knockback / down / revive / victory / defeat / idempotent

godot --headless --path client/godot \
  --script res://scripts/audio/battle_audio_timeline_controller_check.gd
# PASS：动作、接触、反应与显式 downSoundProgress 按序且只触发一次

godot --headless --path client/godot \
  --script res://scripts/qa/audio_world_context_check.gd
# PASS：37/37 地图；town=11、wilderness=5、cave=21

godot --headless --path client/godot \
  --script res://scripts/qa/audio_settings_panel_check.gd
# PASS：初值、实时滑杆、百分比、静音、外部刷新且刷新不反向写设置

godot --headless --path client/godot \
  --script res://scripts/qa/audio_runtime_check.gd
# PASS：catalog cues=26、Godot loaded=26、SFX dispatch=22、voice pool=12、
#       limiter=1、设置保存与重新加载成功

godot --headless --path client/godot \
  --script res://scripts/qa/battle_counter_action_state_check.gd
# PASS：localActionState=counter_attack、serverActionState=counter_attack
```

### 真实 Main wiring 与相邻战斗回归

```bash
node tools/run_godot_auto_checks.mjs \
  --only=--auto-audio-runtime-check \
  --fail-fast --timeout-ms=180000
# PASS 2/2：parse + Main audio runtime

node tools/run_godot_auto_checks.mjs \
  --only=--auto-battle-reaction-check \
  --fail-fast --timeout-ms=180000
# PASS：既有战斗反应／击飞路径保持通过
```

`--auto-audio-runtime-check` 从真实 `Main.tscn` host 验证地图音乐、战斗覆盖／恢复、22 个 SFX cue、声音设置挂载与状态。headless 运行仍按设计不打开物理声卡，避免“自动测试退出时 AudioStream 仍在使用”的假泄漏；专用 MovieWriter 路径另行验证真实混音输出。

MovieWriter 预览结束前显式停止所有播放、清空 stream 并等待两个 frame，最终日志没有：

```text
SCRIPT ERROR
ERROR:
WARNING:
ObjectDB
resources still in use
```

## 正常客户端与 Computer Use

使用本地 QA 后端和用户正常启动方式打开真实 `Main.tscn`，登录凭据不写入本阶段文档：

```bash
godot --path client/godot \
  --scene res://scenes/Main.tscn \
  -- --server-url http://127.0.0.1:8787 \
  --login <本地验收账号> <已脱敏>
```

Computer Use 在真实游戏窗口中完成：

1. 登录后确认正式地图、NPC、玩家与普通 HUD 正常显示；
2. 横向滚动底部操作栏并打开“账号”；
3. 确认账号面板可见“声音设置”；
4. 确认音乐为 `72%`、音效为 `86%`、存在“全部静音”；
5. 开启再关闭全部静音，最终恢复为未静音；
6. 使用窗口关闭按钮退出，并确认没有遗留 Godot 进程。

该操作证明玩家入口已经实装，但屏幕操作本身不能证明声波内容和混音安全，所以另提供了带音轨的固定录像。

## 1280×720 有声证据

使用真实 `Main.tscn`、正常显示驱动、Godot MovieWriter 与 Dummy 音频驱动录制反击／击飞片段：

```bash
godot --path client/godot \
  --scene res://scenes/Main.tscn \
  --resolution 1280x720 \
  --fixed-fps 30 \
  --disable-vsync \
  --audio-driver Dummy \
  --write-movie \
  /Users/fander/projects/Beastbound_Odyssey/.run/evidence/phase332_audio_foundation/audio_counter_launch_main_truepeak_safe_1280x720_30fps.avi \
  -- --battle-visual-review=counter_launch
```

结果：

```text
134 frames
1280×720
30 FPS
duration=4.4667 s
AVI audio=PCM16 / 48 kHz / stereo
MP4 video=H.264
MP4 audio=AAC-LC / 48 kHz / stereo
```

最终可审片文件：

```text
.run/evidence/phase332_audio_foundation/audio_counter_launch_main_truepeak_safe_1280x720_30fps.mp4
```

冻结 SHA-256：

```text
AVI ba0a268370aff13288a62b47838b46e667201d9ef3e891863e8bbc1d4ed0aca4
MP4 9f7302114122c7ae0d2d9c8a81de25e0a66cd0373ca07a3887005bc90d3fe157
```

音频流与峰值检查：

```bash
ffprobe -v error -show_streams -show_format \
  .run/evidence/phase332_audio_foundation/audio_counter_launch_main_truepeak_safe_1280x720_30fps.mp4
# PASS：AAC-LC、48 kHz、stereo、4.466 s

ffmpeg -hide_banner \
  -i .run/evidence/phase332_audio_foundation/audio_counter_launch_main_truepeak_safe_1280x720_30fps.avi \
  -map 0:a:0 -af volumedetect -f null -
# raw PCM：mean=-13.9 dB、sample max=-2.0 dBFS

ffmpeg -hide_banner \
  -i .run/evidence/phase332_audio_foundation/audio_counter_launch_main_truepeak_safe_1280x720_30fps.avi \
  -map 0:a:0 -af ebur128=peak=true -f null -
# raw PCM：integrated=-9.8 LUFS、reconstructed true peak=-1.0 dBTP

ffmpeg -hide_banner \
  -i .run/evidence/phase332_audio_foundation/audio_counter_launch_main_truepeak_safe_1280x720_30fps.mp4 \
  -map 0:a:0 -af volumedetect -f null -
# AAC 解码后：mean=-14.1 dB、sample max=-0.9 dBFS、true peak=-0.7 dBTP
```

首段录制曾显示：Master limiter 的 sample-peak ceiling 即使为 `-1.0 dB`，raw PCM sample peak 虽是 `-1.0 dBFS`，重建 true peak 仍可达到 `-0.1 dBTP`。这不是可接受的安全余量，因而本阶段直接把 ceiling 收紧为 `-2.0 dB`、重录并将经验反写进 Skill。最终无损 MovieWriter PCM 为 `-2.0 dBFS` sample peak、`-1.0 dBTP` true peak。AAC 是有损审片转码，解码后会有小幅 overshoot，但 `-0.7 dBTP` 仍低于 `0 dBFS`、没有数字满刻度削波；母带／运行混音安全以 raw PCM 真峰值检查为准，MP4 用于方便项目所有者审片试听。

最终 MovieWriter 命令以 `exit 0` 正常完成，控制台没有脚本错误、警告、`ObjectDB` 或资源仍在使用信息；命令结束后的进程检查没有发现遗留 Godot、MovieWriter 或 ffmpeg 进程。旧版持久化日志不作为这份 `truepeak_safe` 文件的证明。

## 性能

音频管理器没有在 `_process` 中扫描目录、解析 JSON、做文件 I/O 或重算地图目录；音乐只在地图／战斗高层状态变化时切换，战斗音效只消费当前动画事件进度。

### idle

```bash
godot --headless --path client/godot \
  --fixed-fps 60 --quit-after 900 \
  -- --perf-probe
```

结果：

```text
fps=60.0
初次冻结日志 process_total=0.03..0.04 ms、draw_world=0.05 ms
真峰值余量调整后复跑 process_total=0.05..0.06 ms、draw_world=0.07 ms
```

### moving

```bash
godot --headless --path client/godot \
  --fixed-fps 60 --quit-after 1800 \
  -- --movement-perf-check --perf-probe
```

结果：

```text
status=ok
fps=60.0
path_len=11
初次冻结日志 process_total=0.04 ms、draw_world=0.04..0.05 ms
真峰值余量调整后复跑 process_total=0.06..0.07 ms、draw_world=0.07 ms
```

两轮均稳定 `60 FPS`，观察总范围为 `process_total=0.03..0.07 ms`、`draw_world=0.04..0.07 ms`，没有看到持续热路径回归。这里证明的是本阶段 wiring 没有把音频目录、设置写入或大对象分配塞入逐帧热路径，不是全服负载或所有战斗并发的性能结论。

## 试听状态与未完成项

当前 bundle 明确保持：

```text
reviewState=owner_listening_pending
ownerListeningState=owner_listening_pending
```

原因是自动检查和有声录像能够证明“有声音、时序正确、没有断环和数字削波、运行稳定”，但不能替项目所有者决定旋律是否喜欢、打击感是否足够、宠物声音是否符合世界观。用户已明确要求实装，因此当前 runtime 可以正常启用；这不等于创意混音已冻结接受。

本阶段明确没有完成：

- `ui.confirm`、`ui.cancel`、`ui.error` 到全游戏通用按钮的统一绑定；
- Boss 权威分类与 `music.battle_boss`；
- 独立环境氛围／天气／区域细节层；
- 每只宠物、每种武器或每个技能一套独占声音；
- 全 34 宠物正式战斗动画及其项目所有者验收；
- P2.3 的完整交付与勾选。

因此路线图 P2.3 应继续保持未勾选。本阶段可作为其“原创音频运行基础”证据，后续应先由项目所有者试听冻结 MP4，再针对明确的音乐气质、打击重量、宠物声线或音量层级反馈做小范围迭代。

## 提交边界

本阶段窄提交应只包含：

- `design-beastbound-audio` Skill、参考合同、生成器、审计器与测试；
- `beastbound_audio_v1` 的规格、来源账本、目录、审计报告和 26 个 runtime WAV；
- focused 音频 manager、地图语境、战斗 cue／timeline 模型与检查；
- 声音设置面板及其检查；
- `main.gd`、`panel_flow_coordinator.gd`、`battle_model.gd` 和 MovieWriter 退出路径的最小 wiring／明确修复；
- 本阶段文档与 P2.3 下的一行证据。

不应纳入 `.import`、`.uid`、`__pycache__`、`.godot/`、`.run/`，也不应带入同时存在的宠物／坐骑、地图缓存、服务端 MySQL、`project.godot` 或其他历史工作区改动。
