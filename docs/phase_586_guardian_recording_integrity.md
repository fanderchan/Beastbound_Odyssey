# Phase 586：拒绝损坏录片并支持较长守护战试玩

日期：2026-09-20。继续 R1.W024。修复试玩录像可能静默丢帧却报告通过的问题，不改变游戏玩法、素材或正式验收门槛。

## 发现与原因

本轮人工双倒地复验 `.run/guardian-review/20260920T071107.557418Z/` 未进入战斗：Computer Use 5 次调用、2 张图片，其中两次窗口操作失败。客户端和连接继续正常，随后由开发者请求结束；没有把这次空转算成人工回归通过。

录制持续约 335 秒，生成 **8,364,152,608 字节 AVI**。文件实际长度与 RIFF 声明相差 `2^32 + 70` 字节；正常短片相差 70 字节，长片出现长度字段回绕。[Godot 官方说明](https://docs.godotengine.org/en/stable/tutorials/animation/creating_movies.html#avi) 明确 AVI 输出最多 4 GB。FFmpeg 输出 `dqt: invalid precision`、`Invalid data found when processing input` 等错误，但旧转码命令仍返回 0，随后重新编码出的 MP4 又能解码，入口最终错误地打印了 `GUARDIAN_REVIEW_CLEAN`。

这份旧 AVI／MP4 与失败现场保留，**不能用于完整录像验收**。源图和游戏运行是否正确，与损坏录像能否证明全过程是不同问题。

## 修复

- 试玩入口改用 Godot 4.7 内建 OGV 录制，成片仍为 1280×720、30 FPS H.264/AAC MP4。四层正式批量审片的既有 AVI 合同未更改。
- 新增小型 `guardian_review_media.py`，复用现有媒体执行、超时收容、探针和输出校验。转码与成片全解码均使用 [FFmpeg `-xerror`](https://ffmpeg.org/ffmpeg.html)，并拒绝退出码为零但仍存在 error 级日志的情况；超限旧 AVI 在解码前拒绝。
- 只有格式、全解码和帧时间线全部通过才把 `.partial.mp4` 改为最终名称。失败保留日志与 `media-validation.json`，不再打印 CLEAN，也不覆盖已有交付。
- [Theora 规范第 3.2 节](https://www.theora.org/doc/Theora.pdf) 将零长度包定义为重复前一帧。FFmpeg 解码时会省略这些包；现在逐包要求从零开始、无断点的 30 FPS 时间戳，再展开明确存在的重复帧，包括片尾。不能按文件时长猜测或补造缺失画面。

第一次 OGV 整场录制游戏检查通过，但直接使用解码帧数的导出检查正确拒绝了不完整静止时间线；失败记录保留于 `.run/guardian-review/20260920T074906.892298Z/`。原片含 4270 个连续视频包、565 个明确重复包。修正转换后，独立输出 `.run/phase586-recording-integrity/ogv-timeline-recheck/` 恢复为完整 4270 帧／142.333333 秒，未改写原失败回执。

## 最终端到端验证

最终完整运行：`.run/guardian-review/20260920T075853.948367Z/`，基于 `3f6020ed99bda1208021f069f0a8de06e8eff54d` 加本阶段补丁。运行前后的 **827 项源码／数据／工具哈希一致**；摘要见 [本机记录](../.run/phase586-recording-integrity/verification-summary.json)。

- 一个真实 Main 和四个 HTTP 测试队友完成 10 回合守护胜利，五账号各获地之戒 `+1`、石币 `+209`，档案 revision `102→103`。
- 全程一个事件连接、零拒绝／重试，退出后连接归零；4176 个观察逻辑帧零缺画，其中 131 次后台补绘。
- 原 OGV **60,602,102 字节**，包含 **4238 个连续视频包**，其中 542 个重复包、片尾 12 个重复包；MP4 仍为 **4238 帧／141.266667 秒**，1280×720、30 FPS，全音视频解码零错误。
- MP4 SHA-256：`8c011ce036764d5e3de4d849f1eb267650a318f04df7207c8e47dc7d9377a53f`。已查看起始原生截图和成片返回地图画面。录像是固定步长审片，不能充当前台性能证据。
- 客户端、后端、QA lane 均清理，真实玩家目录不变。窗口工具在自动运行退出后重新打开的测试专用空项目管理器也已关闭，原有 Godot 进程保留。

另对 Phase 585 的 `guardian.avi` 与 `guardian-1x.mp4` 分别执行严格全音视频解码，均通过；该阶段的短片结论仍有效。这不追溯接受其余旧录像。

## 检查与剩余工作

```sh
git diff --check
python3 -B -m unittest tools/test/test_guardian_review_media.py tools/test/test_play_guardian_review.py
python3 -B tools/play_guardian_review.py --godot '<本机 QA Godot 路径>' --autoplay --record --timeout-seconds 600
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
```

Python **11/11**。其中真实 MJPEG 坏帧复现旧命令退出 0，新流程失败；另覆盖超限文件、错误日志、丢帧、重复包和时间线断点。未修改 GDScript 或正式资源；本阶段使用完整原生入口验证，不运行不相关全量 CI。

当前自动通关不等于最新源码的真实鼠标双倒地／连续出洞验证，也不代表五真人联机、数值平衡、正式地图性能或美术接受。107 项候选修改和 111 项保护文件保留，P2.1a 与 R1.W024 继续未勾选。
