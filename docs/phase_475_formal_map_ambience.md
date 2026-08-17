# Phase 475：城镇、野外、洞窟正式环境声层

日期：2026-08-17

## 本阶段边界与结论

本阶段只补齐地图环境声层，不改战斗数值、服务端协议、地图规则或玩家存档：

- 为城镇、野外、洞窟各冻结一条可追溯的 CC0 环境录音；
- 生成 48 kHz 双声道 Ogg 循环母带，保留稳定语义 cue；
- 在 `GameAudioManager` 中建立独立 `Ambience -> SFX` 总线、双播放器等功率淡化和战斗压低／精确恢复；
- 用真实 `Main.tscn` 录制一条带声音的 1280×720 连续审听片，并完成 idle、移动、连续点击性能探针；
- 保留 `ownerListeningState=owner_listening_pending`，不把自动信号审计冒充项目所有者的听感批准。

本阶段令 v2 音频目录从 `4 BGM + 27 SFX = 31` 个 cue 扩展为 `4 BGM + 3 ambience + 27 SFX = 34` 个 cue。既有 31 条运行资产没有被替换。P2.3 还包含全量正式动画、Boss 音乐、全宠差异化音色及整体听审，因此继续保持未完成。

## 来源、许可证与冻结哈希

三条来源均由作者在 OpenGameArt 以 CC0 1.0 发布；没有使用 StoneAge 或其他商业游戏的提取音频。完整作者、页面、许可证、源文件、处理命令和替换路径已冻结在 `source/spec.json`、`source/provenance.json`、`source/source-selection.md` 与 `ATTRIBUTION.md`。

| 语境 | 作者／来源 | 源文件 SHA-256 | runtime SHA-256 |
| --- | --- | --- | --- |
| 城镇 `ambience.town` | isaiah658 / Ambient Bird Sounds / CC0 1.0 | `359e4e3f9da9d75aac64cede511c7e3ef8b461f9d9f8c230f8f80e44c4b3e35f` | `755dc0e18b20d9be0b0bf2ebe6b6de9dad44cf99f1b00bbace6d6fa9de6ec8e3` |
| 野外 `ambience.wilderness` | Spring Spring / Birds and Wind Ambient / CC0 1.0 | `28f99f536a0772d80052f03bcb22c9ed8fd7c6e4db7f2e8356efcf26a8e24f01` | `a3388bca77d9b620d48661fd363e72d2850dfc6909ff12f1dd0086bb6bd9f3f2` |
| 洞窟 `ambience.cave` | JaggedStone / Loopable Dungeon Ambience / CC0 1.0 | `df491823e4877371c34dbda4e9321cd83a4a14fa7573cee0ebca1ae423b70e6e` | `f30c8e32f517d0c2426aea75d569f2e943f213054212e526a31c22702208f283` |

公开来源页：

- `https://opengameart.org/content/ambient-bird-sounds`
- `https://opengameart.org/content/birds-and-wind-ambient-birds-wind-and-synth`
- `https://opengameart.org/content/loopable-dungeon-ambience`

## 确定性生产与信号门禁

`build_cc0_audio_bundle.py` 现对环境长音频执行确定性裁切、采样率／声道归一、增益与必要高通、循环交叉淡化、边界搜索旋转，再以固定 FFmpeg 8 Vorbis 参数编码。三次连续完整重建的运行树哈希清单逐项相同；builder 每轮均报告 `fileCount=34 / sourceCount=38`。只读审计为 `assetCount=34 / status=pass / failures=[]`，并对每条循环连续检查三个独立边界。

| cue | 时长 | 峰值 | RMS | 最大边界 sample delta | 首尾 20 ms RMS 差 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `ambience.town` | 29.188 s | -11.080 dBFS | -35.557 dBFS | 0.00003052 | 0.071 dB |
| `ambience.wilderness` | 81.281333 s | -10.632 dBFS | -32.004 dBFS | 0.00024414 | 0.361 dB |
| `ambience.cave` | 91.809333 s | -3.478 dBFS | -30.301 dBFS | 0.00021362 | 0.469 dB |

这些指标证明格式、余量和循环边界满足项目硬门槛，不代表环境内容本身已经得到审美批准。

## 正常客户端运行合同

`GameAudioManager` 继续作为 focused 音频控制器，`Main` 只负责地图／战斗生命周期 wiring：

- 三条环境流在目录加载后预热，地图切换不重复同步加载；
- 两个 `AmbiencePlayer` 以 `0.75 s` 等功率包络切换，避免硬切和中途音量塌陷；
- 同一地图语境幂等，不会因 UI 或重复状态同步重新起播；
- 进入战斗时地图环境声保留，但 `Ambience` 总线在 `0.40 s` 内压低到 `-12 dB`；
- 退出战斗时根据最新地图语境切换环境声，并精确恢复到 `0 dB`；
- 音乐、环境声和 12 路有界 SFX 分工不变；缺失环境资产时安全静音，不阻断玩法。

开发检查产生的 catalog／设置临时文件现只写入已忽略的 `res://.run/qa/`，运行后删除文件，不再依赖或改写真实玩家的 `user://`。

## 连续有声审听证据

正式项目所有者审听片：

```text
.run/evidence/phase475_formal_map_ambience/formal_map_ambience_review_1280x720_30fps.mp4
```

媒体合同：

```text
1280x720 / 30 FPS / H.264 + AAC-LC stereo 48 kHz
37.966667 s / 2,367,909 bytes
SHA-256 c4b807368d3b067e5488c1263d6a39930d6c5ca587e7d455b608ea3aebb1c087
integrated -28.9 LUFS / LRA 11.4 LU / true peak -13.8 dBFS
```

Godot Movie Maker 原生录制日志与画面顺序均通过，连续覆盖七步：

1. 城镇环境声独听；
2. 野外环境声独听；
3. 洞窟环境声独听；
4. 城镇 BGM + 环境声；
5. 野外 BGM + 环境声；
6. 洞窟 BGM + 环境声；
7. 进入普通战斗压低环境声，再退出战斗精确恢复。

录制控制器在 `Main._ready()` 前关闭档案写入，并为音频设置注入 `.run/evidence/phase475_formal_map_ambience/` 下的隔离路径；正式七步报告为 `result=PASS / steps=7 / profile_save=false`。

## 性能与数据安全

真实 `Main` 性能探针保持正式音频播放：

- idle：480 帧，`process_total=0.30..0.41 ms`；该次运行位于编辑器嵌入窗口／约 30 FPS 录制节奏，不能作为 60 FPS 结论；
- moving：真实跨帧移动完成，稳定段约 `56.0..60.5 FPS`，`process_total=0.22..0.37 ms`；
- spam：112 次真实鼠标事件全部命中输入合同，`accepted=112 / screen_matches=112 / mismatches=0 / avg_input=2 us / max_input=8 us`，稳定段约 60 FPS、`process_total=0.30..0.34 ms`。

移动与连续点击使用隔离 Godot 项目身份；执行前后正常玩家目录的 695 项元数据摘要保持 `2efeb289dde2b773c0098174d74b1309045efcdea1f2506ea296355b8e74c062`。没有登录后端、创建账号、修改档案或写服务端状态。

需要如实保留的过程记录：最初一次正常编辑器／MovieWriter 试跑曾让 Godot 重写正常项目日志，并把真实音频设置文件按语义相同的值重新序列化；随后偏好已确认语义不变，后续审听和性能运行改用隔离设置路径。没有擅自删除或恢复这些真实用户文件。

## 最终验证

本阶段最终门禁：

- `python3 .agents/skills/design-beastbound-audio/tests/test_audio_pipeline.py -v`：`8/8 PASS`，含三次逐字节一致重建测试；
- `audit_audio_bundle.py --no-write-report`：`34/34 PASS / failures=[]`；
- 官方 `quick_validate.py`：`Skill is valid!`；
- `godot --headless --path client/godot --quit`：解析通过；沙箱字体加载噪声不影响退出码和脚本解析；
- `game_audio_manager_check.gd`：6 总线、环境预热、等功率切换、战斗 duck／restore、缓存和设置持久化通过；
- `audio_runtime_check.gd`：`result=PASS / loadedAudioCount=34 / ambienceContextCount=3 / playedSfxCueCount=27`；
- `node tools/run_godot_auto_checks.mjs --only --auto-audio-runtime-check --fail-fast`：Godot parse 与真实 Main 音频检查 `2/2 PASS`；
- `BEASTBOUND_AUDIO_AMBIENCE_REVIEW_FAST=1` 审听场景：`result=PASS / steps=7`；
- MP4 完整解码、规格和音轨检查通过。

## 未完成项

- 项目所有者仍需用耳机或常用音箱完整听完上述 MP4，并明确接受、保留意见接受或退回某个环境语境；
- 三条环境声的 `ownerListeningState` 在得到明确反馈前继续为 `owner_listening_pending`；
- Boss 音乐、全宠专属音色和 P2.3 全量正式动画仍未完成；
- 因此 `stoneage_gap_plan.md` 的 **P2.3 正式动画与音频** 继续保持未勾选。
