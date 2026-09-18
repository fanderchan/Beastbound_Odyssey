# Phase 562：记录性能探针的实际时间与模拟时间

日期：2026-09-19。承接 Phase 561，调查四层静止增量及 Phase 559 的高 CPU 单次观察。此阶段补充计时证据，不改变玩法、美术、帧预算、VSync、既有采样或验收阈值。

## 调查结论

Phase 559 的完整原生回执中，候选静止状态连 `timed_profile`、轮询等相同代码区段也普遍比旧网格慢，不能只按差值认定地图遍历是根因。对当前代码核对后，两组都会由 `--perf-probe` 进入隔离开发档案，不能归因于一组未登录。

进一步核对当前 Godot `5b4e0cb0f` 的 [Main 源码](https://github.com/godotengine/godot/blob/5b4e0cb0f/main/main.cpp#L4784)：`--fixed-fps` 路径在正常 `add_frame_delay` 前返回，会绕过通常的实时限帧等待。[官方命令行说明](https://docs.godotengine.org/en/latest/tutorials/editor/command_line_tutorial.html) 也将它与 `--max-fps` 区分。原生矩阵还禁用 VSync；正常玩家路径启用 VSync，并按世界静止／活动状态设置 30／60 帧预算。因此固定步长矩阵中的瞬时进程 CPU 不能直接代替正常玩家静止占用，既有日志 `fps=60.0` 也只是按传入 delta 得出的模拟帧率。

这不证明四层原生性能已通过，也没有定位所有静止增量的具体成因。固定矩阵仍可按其原有合同评估脚本区段；正常 PC 的实际绘制帧率和进程 CPU 需要独立现场测量。

## 受控复现

当前二层真实 Main，180 帧预热、480 帧测量。仅切换旧网格／候选美术、固定步长／实时限帧四种组合；全部在官方 headless QA lane 中运行，不作为原生图形验收。

四组均为开发登录、认证面板关闭、`Engine.max_fps=30`、`time_scale=1`，档案 SHA-256 同为 `4a62a381296f2076bb5525271bddb791cc4fcb97cf09a8a7f4fb6ac6f47f68a9`。

| 修改探针前的诊断 | 480 帧实际秒数 | 按实际时间计的处理帧/秒 | process_scope 均值 ms |
| --- | ---: | ---: | ---: |
| 固定步长，旧网格 | 0.022032 | 21786.49 | 0.03875 |
| 固定步长，当前美术 | 0.024092 | 19923.63 | 0.04225 |
| 实时限帧，旧网格 | 15.970965 | 30.05 | 0.28438 |
| 实时限帧，当前美术 | 16.080555 | 29.85 | 0.32150 |

表中的两万处理帧/秒是无绘制的 headless 循环速度，绝非显示 FPS。配置的 30 帧上限仍可被固定步长模式绕过。区段计时随运行节奏明显变化；此处没有 CPU 时间、核心频率或调度证据，不能进一步武断归因为某种硬件机制。

## 探针改动

新增纯计算模块 `qa/perf_probe_runtime_timing.gd`。Main 只接线：复用现有首帧 scope 起点和末帧 scope 终点的单调时钟，汇总完整样本的帧数与 delta，结束后打印一次独立 `perf probe runtime timing:` JSON。

- `wallElapsedSeconds`、`wallProcessFramesPerSecond`：从首帧 scope 开始到末帧 scope 结束的实际间隔，包含其间的帧等待及其他引擎工作；不包括预热、报告打印和退出清理。
- `simulationElapsedSeconds`、`simulationProcessFramesPerSecond`：完整样本累计的模拟 delta，保留与实际时间的区别。
- `configuredMaxFpsAtStart/End`：仅证明首尾配置值，不声称中间从未变化，也不证明引擎实际执行该上限。
- 无效时间窗、空样本、非正帧数或非有限 delta 返回失败诊断，不捏造帧率。

普通玩家未开探针时没有新增运行操作。没有增加逐帧时钟调用；结束时的计算和日志在最后一次 scope 计时之后。原 `perf probe:` 样本、八组／480 帧边界和性能门槛不变。新行只提供诊断，不参与替换原采样；Python 回归证明添加新行前后原数值完全相同，并且新行不能补足缺失的原样本。

Godot 的 `OS.get_cmdline_args()` 在这次实测中只保留脚本入口，未返回已消费的 fixed-fps 等引擎选项；因此模块没有猜测这些选项，仍由外部 runner 的完整 argv 证明启动模式。

## 验证与结果

纯模型检查通过，覆盖实际／模拟时钟差异、起止帧预算变化、缺失／倒置时间窗、空或无效样本。解析检查 `1/1`：

```sh
node tools/run_godot_auto_checks.mjs --parse-only --output-dir .run/godot_auto_checks/phase562-runtime-timing --timeout-ms 180000
PYTHONPATH=tools/test python3 -B -m unittest test_map_visual_evidence_builder test_map_performance_batch test_run_map_visual_performance_evidence
```

解析摘要为 `2026-09-18T20-13-54-231Z_summary.json`；工具回归 `73/73`。首轮组合测试因未提供测试模块搜索路径及新断言预期了较晚的拒绝消息而失败；修正命令和断言后通过，未修改生产解析器来放宽拒绝。

增加记录后的四组 Main 各正常结束，正式日志均只有一条有效 timing，都是 480 帧，并与外层观察时钟相符：

| 修改后正式探针 | 实际秒数 | 模拟秒数 | process_scope 均值 ms |
| --- | ---: | ---: | ---: |
| 固定步长，旧网格 | 0.024088 | 8.000000 | 0.04300 |
| 固定步长，当前美术 | 0.022203 | 8.000000 | 0.03938 |
| 实时限帧，旧网格 | 16.083269 | 16.070942 | 0.56238 |
| 实时限帧，当前美术 | 15.973539 | 15.999610 | 0.44463 |

前后实时区段明显波动，连两组快慢顺序也改变，因此不将本轮记录改动称为运行优化，更不挑选较好的结果作为通过证据。下一步需用正常原生窗口、稳定运行时段和同步进程 CPU 记录定位。

另用同一二层 Main 执行 60 次跨帧左键、120 个事件，全部接收，投影不匹配为零、最终格正确。移动检查重新开始测量后只统计本次 480 帧：实际 `0.057430s`、模拟 `8s`；音频、Main、进程与隔离目录完整收口。该检查验证重置和移动时钟边界，仍不是原生 FPS。

## 证据与后续

现状手册将逐阶段重复叙述收拢为“已有证据／仍需完成”表，避免已修复问题的旧“下一步”继续干扰开发游标。所有历史 Phase 文件和索引仍保留。

本机 `.run/phase562-native-idle-attribution.json` 归因于保留的 Phase 559 原始回执；前后对照索引分别为 `.run/phase562-pacing-comparison.json`、`.run/phase562-pacing-after-comparison.json`。原始日志位于 `.run/phase562-pacing-{fixed,realtime}-{baseline,candidate}/` 和带 `after-` 的四组目录，移动为 `.run/phase562-runtime-moving/`，纯模型为 `.run/phase562-timing-model-check/`。临时观察器在 `client/godot/.godot/phase562_pacing_diagnostic/`，只是本机复现材料。

全部进程已回收，真实玩家目录 SHA-256 仍为 `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`。107 项候选文件及四项既有事务历史逐项保持原字节。运行指纹变为 `beastbound-map-runtime-surface-v2:bc21ca5fd44c70e69bb8da46db3d1aea192691ad6f245f71d24fb63166fba7d0`，没有安装或改写旧正式证据。

本轮未启动原生窗口，尚未收到解锁确认；正常 PC CPU、当前真实鼠标、四层完整性能与画面仍待复核。R1.W024、P2.1a、所有者美术接受与正式发布不打勾。未运行全量 CI、共享后端或导出；下一步依据真实运行节奏继续定位开销，不能通过更换时钟或门槛宣布性能通过。
