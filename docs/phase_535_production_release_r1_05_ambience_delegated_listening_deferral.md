# Phase 535：R1.05 环境声受委托审查与首发延期

## 结论

项目所有者已明确表示不会亲自验证，并委托 Codex 自行验证。本阶段对 Phase 475 当前冻结候选完成了来源、字节、信号、循环、运行路由、Main 有声音轨与媒体完整性复核，但当前执行环境明确返回“不支持音频输入”，Codex 无法真正听到拆出的音频片段。音频生产合同规定机器指标不能替代人耳对底噪、疲劳感和混音审美的判断，因此本阶段不得把自动 PASS 冒充听审批准。

R1.05 作出以下受委托建议：

> 三条环境声的工程候选保持冻结，不新增无证据返工；由于没有完成可追溯的实际听审，也没有项目所有者签署接受，选择首发延期。R1.06 必须让环境声在普通玩家运行时不可达，只保留显式、隔离的审查入口。

这不是 `owner acceptance`，不修改 bundle 的 `reviewState=owner_listening_pending`，不生成 approval、decision digest 或 release attestation，也不允许把工程校验通过解释为已发布。

## 本轮精确审核对象

受审源码基线为 `67ca31bf3af516ed3a9d8dced67f1ea72fd79628`。Phase 475 的三条当前 runtime Ogg 与冻结记录逐字节一致：

- 城镇 `ambience.town`：`755dc0e18b20d9be0b0bf2ebe6b6de9dad44cf99f1b00bbace6d6fa9de6ec8e3`；
- 野外 `ambience.wilderness`：`a3388bca77d9b620d48661fd363e72d2850dfc6909ff12f1dd0086bb6bd9f3f2`；
- 洞窟 `ambience.cave`：`f30c8e32f517d0c2426aea75d569f2e943f213054212e526a31c22702208f283`。

Phase 475 的真实 Main 有声片仍为唯一对应候选的运行证据：

- SHA-256：`c4b807368d3b067e5488c1263d6a39930d6c5ca587e7d455b608ea3aebb1c087`；
- `1280x720 / 30fps / 1139 frames / 37.966667s`；
- H.264 视频、48 kHz 双声道 AAC-LC 音频；
- 录片日志按 7 步覆盖城镇、野外、洞窟独奏，三场景 BGM 混音以及战斗 duck／恢复；
- 战斗期间 `Ambience` 总线降到 `-12dB`，退出战斗后精确恢复 `0dB`，`profile_save=false`。

本轮没有用旧视频、资产清单或无声截图代替该候选。审查片来自 Phase 475 冻结证据目录，哈希和媒体参数重新核对后才进入复核。

## 已自行验证的工程事实

### 1. 来源与可重建性

三条环境录音均登记为作者明确发布的 CC0 1.0 来源；源文件、处理命令、运行文件、许可证、署名与替换路径保存在 v2 provenance／attribution 账本中。没有复制 StoneAge 或其他商业游戏音频。

音频 bundle 审计结果为 `status=pass / assetCount=34 / failures=[]`；当前结构为 `4 BGM + 3 ambience + 27 SFX`。音频流水线测试 `8/8` 通过，包括 canonical bundle、来源漂移、未使用来源、重复构建逐字节一致、三处独立循环边界与错误采样率拒绝。

### 2. 信号与循环代理指标

三条 48 kHz stereo Ogg 均非静音、无削波、无异常直流偏移，并通过三处循环边界审计：

| 场景 | 时长 | 峰值 | RMS | 最大 sample 边界差 | 首尾 20ms RMS 差 |
|---|---:|---:|---:|---:|---:|
| 城镇 | `29.188s` | `-11.080dBFS` | `-35.557dBFS` | `0.00003052` | `0.071dB` |
| 野外 | `81.281333s` | `-10.632dBFS` | `-32.004dBFS` | `0.00024414` | `0.361dB` |
| 洞窟 | `91.809333s` | `-3.478dBFS` | `-30.301dBFS` | `0.00021362` | `0.469dB` |

这些指标证明文件和接缝满足工程门槛，但不能证明玩家不会觉得鸟鸣重复、洞窟底噪刺耳或长时间混音疲劳。

### 3. 当前运行合同

当前 catalog 把三条 cue 路由到独立 `Ambience -> SFX` 总线，场景增益分别为城镇 `-5.5dB`、野外 `-4.5dB`、洞窟 `-5.0dB`；场景切换使用 `0.75s` 等功率交叉淡化，战斗使用 `-12dB / 0.40s` duck 并恢复。Phase 475 已证明 Main 路由、设置、静音、切图、战斗往返、输入与性能合同成立，本阶段确认其源码和候选字节未漂移。

## 为什么选择延期而不是批准或退回

### 不批准

本轮从冻结 Main 片拆出三段环境声独奏、三段 BGM 混音和一段战斗 duck／恢复，并尝试把音频送入当前执行环境；环境明确返回 `audio content omitted because you do not support audio input`。在无法真正听到这些片段时，任何“底噪舒服”“长期不疲劳”或“混音平衡合格”的结论都会是伪造。项目所有者也没有亲自试听或签署接受，所以不能批准。

### 不退回

哈希、来源、媒体、信号、循环、路由和自动化均没有复现具体缺陷。没有证据能把问题归因到城镇、野外或洞窟中的某一条音轨，因此不创建含糊的“再调一调”返工任务。以后若真实听审指出可复现问题，应只重做对应单轨并保留其他冻结资产。

### 选择延期

延期同时满足诚实性和发布安全：保存已经完成的工程工作，不反复重制无证据问题；又不让未完成实际听审的候选进入首发普通玩家路径。R1.06 将执行 fail-closed 运行时关闭，并验证不会留下孤儿播放器或设置副作用。

## 生命周期边界

本阶段不改任何音频资产、catalog 或运行代码。只读确认：

- `reviewState=owner_listening_pending`；
- 没有 owner acceptance；
- 没有 owner decision digest；
- 没有 release attestation；
- 没有本阶段 promotion。

R1.05 的勾选只表示“批准／退回／延期三选一已经明确为延期”，不表示听审完成或生产发布放行。整个生产发布结论继续为 `BLOCKED`。

## 验证

```text
python3 .agents/skills/design-beastbound-audio/scripts/audit_audio_bundle.py \
  --bundle client/godot/assets/audio/beastbound_audio_v2 --no-write-report
# status=pass / assetCount=34 / failures=[]

python3 .agents/skills/design-beastbound-audio/tests/test_audio_pipeline.py -v
# Ran 8 tests / OK

ffprobe Phase475 formal_map_ambience_review_1280x720_30fps.mp4
# 1280x720 / 30fps / 37.966667s / H.264 + AAC-LC 48k stereo
```

拆片只写入忽略目录 `.run/audit/r1_05_audio_review/`，不进入源码或发布制品。

## 下一任务

下一任务是 `R1.06 AUTO｜执行环境音验收结论` 的延期分支：在不删除可复核资产的前提下，让三条环境声在普通 Main 玩家路径不可达；显式隔离审查仍可启用。随后验证场景路由、音量／静音、切图、战斗恢复、无孤儿播放器、玩家资料不变和 QA lane 收尾，再继续 R1.07。
