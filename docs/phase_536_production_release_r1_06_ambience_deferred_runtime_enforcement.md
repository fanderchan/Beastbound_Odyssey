# Phase 536：R1.06 环境声首发延期运行时收口

## 结论

R1.06 已执行 R1.05 的“首发延期”分支。城镇、野外、洞窟三条环境声及其 Phase 475 工程证据继续保留，但普通 `Main.tscn` 玩家路径现在 fail closed：不预热环境 Ogg、不挂载活动 stream、不触发战斗 duck，也不能通过直接 `play_cue()` 绕过发布门。城镇／野外／洞窟 BGM、27 条 SFX、音量设置和全局静音合同保持有效。

专用 `AudioAmbienceOwnerReview.tscn` 仍可在挂载 `GameAudioManager` 前显式开启隔离 review override，以便以后重新听审当前冻结字节。普通 Main、玩家 UI 和常规自动检查没有该调用点。

本阶段没有创建 owner acceptance、owner decision digest 或 release attestation，没有修改 bundle 的 `reviewState=owner_listening_pending`，也没有把环境声提升为生产发布资产。整个生产发布结论继续为 `BLOCKED`。

## 延期发布门

新增 `client/godot/data/audio_ambience_release_gate_v1.json`，SHA-256 为：

```text
f53ae89c277ac85b4668578e4922b45d7a617ea8717d33c4d8f8be36eb98278a
```

发布门精确绑定 `beastbound_audio_v2`，当前状态为：

```text
decision=deferred
ownerReviewStatus=owner_listening_pending
releaseApproved=false
runtimeEnabled=false
ownerAcceptance=null
ownerDecisionDigest=null
releaseAttestation=null
reviewOverride=dedicated_isolated_qa_scene_only
```

门文件同时冻结三条当前 runtime Ogg 的 SHA-256。独立运行检查逐 cue 读取 catalog 路径并重新计算文件哈希，三个结果与 Phase 475 及 R1.05 完全一致：

- `ambience.town`：`755dc0e18b20d9be0b0bf2ebe6b6de9dad44cf99f1b00bbace6d6fa9de6ec8e3`；
- `ambience.wilderness`：`a3388bca77d9b620d48661fd363e72d2850dfc6909ff12f1dd0086bb6bd9f3f2`；
- `ambience.cave`：`f30c8e32f517d0c2426aea75d569f2e943f213054212e526a31c22702208f283`。

`GameAudioManager` 对 canonical bundle 严格验证 gate ID、scope、布尔类型、关闭态组合、空发布产物、review override 类型和三条小写 SHA-256。门文件缺失、损坏、状态自相矛盾或批准态缺少 owner／attestation 时，环境层保持关闭；音乐和 SFX 不会因一个待审环境层而被一并静音。非 canonical 的专用测试 catalog 保留原有行为。

## 普通运行时行为

### 启动与切图

普通 Main 加载完整 `34` cue catalog，但 manager 只预热四首音乐：

```text
ambienceReleaseGateValid=true
ambienceReleaseDecision=deferred
ambienceRuntimeEnabled=false
ambiencePlaybackAvailable=false
warmedAmbienceStreamCount=0
activeAmbienceCue=""
```

地图上下文仍保留三条环境语义绑定，便于以后审查和准确提升；`sync_map_context()` 在环境层合法关闭时仍返回成功，城镇／野外／洞窟音乐照常切换。直接调用 `play_cue("ambience.*")` 返回 `false` 并保持所有环境播放器无 stream、无播放状态。

### 战斗往返

环境层关闭时进入战斗只切换 `music.battle_normal`，不会伪造 `ambienceDucked=true`；退出战斗恢复当前地图音乐，环境 cue 继续为空、Ambience 总线保持 `0dB`。这避免了对不存在音轨执行 tween，也避免“关闭候选仍残留后台播放器”。

### 音量与静音

音乐／SFX 滑杆及全局静音仍按既有文件合同保存和恢复。环境声继续从 `Ambience -> SFX` 路由，因此以后显式审查或经批准重新启用时仍受 SFX 音量与静音控制；当前关闭态不会额外写玩家设置。

## 显式隔离审查路径

只有以下两个 QA 位置调用 `configure_ambience_review_override_enabled(true)`：

- `game_audio_manager_check.gd`：验证关闭、开启审查、再次关闭的完整生命周期；
- `audio_ambience_owner_review.gd`：Phase 475 专用七步审查场景。

review override 只有在发布门本身有效时才可用。测试证明开启后预热恰好三条环境声，三场景路由、等功率切换与战斗 `-12dB` duck／`0dB` 恢复仍成立；关闭 override 后环境缓存回到 `0`，总 stream cache 只剩四首音乐，两个环境播放器均无 stream 且不播放。

快速七步审查场景仍输出：

```text
result=PASS / steps=7 / profile_save=false
town -> wilderness -> cave
battle ambience.wilderness -12dB
restore ambience.wilderness 0dB result=exact
```

这只证明隔离审查入口没有被延期门破坏，不改变 R1.05“尚无真实听审批准”的结论。

## 验证结果

### 音频与客户端定向门

- `audit_audio_bundle.py --no-write-report`：`assetCount=34 / status=pass / failures=[] / ownerListeningState=owner_listening_pending`；
- `game_audio_manager_check.gd`：普通关闭态零环境预热／零孤儿播放器，显式 review override 三轨预热、切图、duck／restore、再次关闭全部通过；`--verbose` 无 ObjectDB leak；
- `audio_runtime_check.gd`：`loadedAudioCount=34 / playedSfxCueCount=27 / ambienceReleaseGateValid=true / ambienceRuntimeEnabled=false / warmedAmbienceStreamCount=0 / errors=[]`；
- `audio_world_context_check.gd`：`37` 张地图，`town=11 / wilderness=5 / cave=21 / errors=[]`；
- `audio_settings_panel_check.gd`：音乐、SFX、静音、恢复及无回写环通过；
- 隔离 Main 自动门：Godot parse + `--auto-audio-runtime-check` 为 `2/2 PASS`，Main 报告 `restoredMusicCue=music.town / restoredAmbienceCue="" / ambienceDucked=false`。

最终隔离 Main summary：

```text
.run/godot_auto_checks/r1_06_final_isolated/2026-08-25T20-38-26-386Z_summary.json
SHA-256 691cc305c677257d69aadd2b11f0272bb034e53153a88000062f91634771e839
```

### 性能与真实输入

固定 QA lane 的完整五项性能套件 `5/5 PASS`：

| 探针 | 当前结果 |
|---|---|
| idle | `process_total median=0.34ms / p95=0.40ms / max=0.63ms` |
| moving | 真实跨帧移动完成，`median=0.47ms / p95=0.50ms / max=0.50ms` |
| movement spam | `36` 个跨帧真实鼠标事件，`screen_matches=36 / mismatches=0 / avg_input=2us / max_input=6us / settled=true` |
| shop select | `status=ok` |
| player stat spam | `status=ok / elapsed=3.21ms / refresh_count=2 / saves=1`，仅隔离 QA 档 |

summary SHA-256 为 `1f71eb7d259ab9975297477d3fc5be3f16b9e88334608aa123d1233123e81afe`。idle／moving 继续处于亚毫秒量级；本阶段不把不同运行时刻之间的细小波动解释为性能提升。

### 数据隔离与过程偏差

需要如实保留一个验证过程偏差：提交前的第一轮组合命令直接执行了旧式 `godot --headless --path client/godot --quit` 和 Phase 475 快速审查场景，没有套固定 QA custom feature。Godot 因而轮转了普通项目 `logs/godot*.log`，并在 `2026-08-26 04:36:49` 更新了 `beastbound_audio_settings.json` 的时间戳／文件写入；只按路径、大小和时间戳确认了这些变化，没有打开内容、删除文件或回写恢复，也没有发现玩家档案、账号或服务端状态路径出现在该时间窗。

随后停止所有未隔离直跑，最终只使用固定 `automation` lane 复证。当前真实玩家目录摘要在最终 `2/2` 门执行前后均为：

```text
d6b1961ed53be04c8b8f1c398e5f5daec4d361a3c69033aee66dbb306e1310f0
```

最终 `realUnchanged=true / qaLaneCleanup.status=cleaned / laneAbsent=true`，没有 Godot 残留进程。后续 Godot 解析和 Main 自动检查必须继续走固定 QA runner，不再使用会刷新普通日志／偏好的裸命令。

## 生命周期边界

本阶段没有修改三条 Ogg、`audio-cues.json`、source spec、provenance 或 Phase 475 证据。bundle 审计继续报告 `owner_listening_pending`。R1.06 的完成只表示：

- R1.05 的延期决定已被运行时强制执行；
- 普通玩家不可达未听审环境声；
- 冻结候选仍可在显式隔离 QA 场景中复核；
- 不存在伪造的 owner／发布产物。

## 下一任务

下一任务是 `R1.07 OWNER｜Bui 蓄力 VFX 人眼验收`：使用 Phase 487 当前真实战斗速度证据，检查不同背景、多目标、闪避／普通命中／暴击语义与窄性能余量，明确批准、退回或延期；没有项目所有者亲签时继续区分受委托建议与 owner acceptance。
