# Phase 595：人工录制按真实时间限速

日期：2026-09-21。继续 R1.W024。修复专用守护战人工录制在活动／后台状态下快于实际时间推进的问题；正常玩家、未录制试玩、自动回归及正式性能矩阵不启用这层限速。没有修改玩法、素材、游戏帧预算或性能验收阈值。

## 原因与基线

[Phase 562](phase_562_runtime_probe_wall_clock.md) 已确认当前 Godot 的固定时间步长会绕过正常实时限帧，`--fixed-fps 30` 不保证实际每秒只推进 30 帧。人工录制入口仍使用这条路径，仅有 `--max-fps 30` 不足以限制它；引擎、服务器和操作人的实际时间可能分离。

Phase 594 的 6783 次状态记录跨越约 1779.572 秒，却推进 108512 个游戏帧；其录像保留固定 30 FPS 的引擎时间线，所以约半小时操作生成约一小时片长。那份录像没有被重定时，也没有被当作显示 FPS 证据。

本轮先在 `e1697a61ed5834c91c2e4a6c939821755af6efa6` 上做两段短基线：

| 条件 | 修改前实际推进速度 |
| --- | ---: |
| 静止、可绘制的短录制 | 29.824 帧／秒 |
| 鼠标打开地图后的末段 20 个采样间隔 | 中位数 59.856 帧／秒 |
| 同一段录制中不可绘制的 55 个连续条件间隔 | 中位数 167.172、最大 183.592 帧／秒 |

这证明加速具有条件性，不能把所有录制都归为加速，也不能用静止正例掩盖活动／不可绘制路径。窗口焦点并非全程有效，这些数字是**录制时钟诊断，不是正式游戏性能**。基线见 [静止记录](../.run/phase595-recording-clock/baseline.json) 与 [活动／不可绘制记录](../.run/phase595-recording-clock/baseline-map-open.json)。

基线 Computer Use 共 5 次调用／2 张图片，打开地图成功；随后最小化调用时，测试进程已按期限退出，返回 `Running application not found`。这次失败不能算最小化生效。原始调用 SHA-256 `148a07d1d2bc8d9e46a7910845a0d0a2d1ff86ded8c6af7d867b773c78c76cb5`，见 [基线操作](../.run/phase595-recording-clock/computer-use-index.json)。

## 修复范围

新增 `qa/review_realtime_frame_pacer.gd`，由官方隔离入口显式启用，范围仅为 `--record` 且未启用 `--autoplay`：

- 在实际进程帧之间至少等待 33334 微秒，从单调时钟读取真实间隔，不依赖模拟 delta 或 `Engine.max_fps`。
- 长帧后从实际完成时刻安排下一帧，不按过期截止点连续追帧。
- 从初始化持续到资源清理完成，退出时断开信号并写入 `frame-pacing.json`。
- 报告保存帧数、实际时长、最短／最长间隔及等待时间，并明确 `performanceEvidence=false`。

启动器逐次覆盖专用环境标志；未录制和自动模式为关闭。验证器要求人工录制存在有效的限速回执，并拒绝其他模式意外生成回执。低于最短间隔、空帧计数、实际时长不足、非法计数及伪称性能证据均失败。慢帧允许延长实际时间，不能通过补帧或改速把它伪装成完全同步。

这层等待只属于交互录制工具，不进入正常 Main 或正式性能采样。画面不可绘制时原有离屏补绘继续工作；限速器既不激活窗口，也不声称后台补绘已呈现到屏幕。

## 定向与原生验证

真实单调时钟的 headless 检查先用固定步长推进 60 帧，仅耗 9644 微秒；启用限速后 60 帧耗时 2351157 微秒，最短间隔 33943 微秒。插入一次 150 毫秒停顿后，最长间隔为 151469 微秒，下一帧仍保留正常间距，没有突发追帧；停止后信号已断开。该检查使用官方 QA lane，结果见 [时钟与长帧检查](../.run/phase595-recording-clock/pacer-check/report.json)。

随后以真实 Main／Metal／1280×720 做人工录制：打开地图 → 最小化 → 窗口菜单恢复 → 关闭地图。7 次原始 Computer Use 调用、4 张图、零工具错误；恢复后标题帧数继续推进，地图关闭成功。原始 SHA-256 为 `95ded5582a0a45ff6f083c0e19efc5315aba96141d603a3e1ecd7369fe845032`，见 [修复后操作](../.run/phase595-recording-clock/candidate-computer-use/computer-use-index.json)。

| 修改后的实际采样 | 连续条件间隔数 | 中位数／最大推进帧率 |
| --- | ---: | ---: |
| 可绘制 | 244 | 29.158 / 29.608 |
| 不可绘制 | 39 | 29.136 / 29.315 |

限速器整段记录 4670 帧，实际 167.334011 秒，最短间隔 33348 微秒；最长 2.954357 秒的加载／停顿没有触发追帧。操作系统等待与慢帧仍可能使实际速度低于 30，这是一项上限约束，不能保证每段都与墙钟完全等长。

[完整录像](../.run/guardian-review/20260920T171258.557342Z/guardian-1x.mp4) 保留 4670 帧、155.666667 秒、1280×720、30 FPS 的原始引擎时间线，源包、全片解码及音视频时长检查通过，SHA-256 为 `e4b411e142ac10691dab95af4f3c57c18234ce2887e964fe18dc7e43c1b620c9`。另一次未录制原生启动确认 `framePacing.enabled=false`，没有回执或额外等待。

采集期间 565 个相关源码文件未变；采集后仅补充启动器的说明和 CLI 帮助文字，限速及运行逻辑未再修改。4 个原生客户端与各自后端、时钟检查、录制／编码进程均已正常清理，官方 QA lane 不残留，真实玩家资料未变，原有 107 项候选修改及 111 项保护文件保留原字节。汇总见 [验证摘要](../.run/phase595-recording-clock/verification-summary.json)。

## 命令和剩余边界

```sh
node tools/run_godot_auto_checks.mjs --parse-only
python3 -m unittest tools/test/test_play_guardian_review.py tools/test/test_guardian_review_journey.py tools/test/test_guardian_review_media.py
python3 .run/phase595-recording-clock/pacer-check/run.py
python3 tools/play_guardian_review.py --godot '.run/phase584-native-review/Beastbound QA.app/Contents/MacOS/Godot' --cave-journey --record --timeout-seconds 180
python3 tools/play_guardian_review.py --godot '.run/phase584-native-review/Beastbound QA.app/Contents/MacOS/Godot' --cave-journey --timeout-seconds 30
python3 .run/phase595-recording-clock/validate.py
git diff --check
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
```

解析 `1/1`、Python `15/15`、实际时钟长帧检查和两个修复后原生入口通过。没有运行全量 CI 或无运行时代码变化的正式性能矩阵。

本轮修复录制时钟加速，并取得一次最小化恢复的真实操作正例；没有重跑完整守护战返村，不能据此宣布 Phase 594 长流程停画已彻底修复。下一步在该时钟条件下继续守护战后的完整鼠标返村，同时继续正式静止增量问题及精确动作证据。P2.1a／R1.W024 和所有者美术接受仍未完成。
