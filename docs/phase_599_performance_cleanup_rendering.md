# Phase 599：性能采样结束后的连续绘制与四层复测

日期：2026-09-21。开发基线为 `bc8c83e9d20fa6e04cfe708be1b8570eb9bf1ee2`。继续 R1.W024，先修复 Phase 598 暴露的测试收尾回归，再按既有严格条件重测四层地图。

## 问题与修复

首次完整矩阵在第一个静止样本失败：765 个观察帧只完成 672 次绘制，窗口一直可绘制且没有失焦。480 帧测量已完成；随后 `_complete_perf_probe_measurement()` 关闭统计标志，音频清理还要等待约 1.5 秒，Main 在这段时间错误恢复了普通按需绘制。缺少的 93 帧使原生连续性检查拒绝整轮，失败结果没有被安装或作为性能通过。

Main 现在把尚在运行的定长探针生命周期（`perf_probe_clean_exit_frames > 0`）也视为连续绘制请求，直到该 Main 退出。采样结束依然关闭统计，音频、贴图与窗口释放顺序不变；普通玩家没有该 QA 参数，继续使用 Phase 598 的静止节能策略。没有更改 VSync、测量区段、性能阈值或逐帧可见性门。

`--auto-camera-check` 增加真实 Main 的采样结束回归：调用既有完成入口，确认统计已经停止，再观察八帧仍连续渲染，释放该生命周期要求后恢复普通静止策略。修改前八帧均误用按需绘制，唯一回归失败；修复后八帧全部正确，19 项／1050 帧相机对照、四层切换、跨帧点击、菜单与战斗往返继续通过。解析及两个定向客户端检查为 **3/3**。本轮没有运行全量 CI。

## 当前完整矩阵

一个原生窗口依次重建四层 × 网格／候选 × 静止／移动 × 三次重复，**48/48 样本有效**。全部 **36,768 个观察帧均实际绘制**，零失焦、零不可绘制；48 个 Main 全部释放。24 组移动均完成既定的 60 次跨帧点击和 120 个输入事件，共 1440 次点击／2880 个事件，原有投影、目标及清理合同通过。

沿用 180 帧预热、480 帧测量、60 帧报告窗和固定步长；下表是三次运行均值的中位数，单位 ms，括号为同次候选减网格的配对中位数。这是所有 Node `_process` 回调区段，不能解释成正常显示 FPS 或整进程 CPU。

| 地图 | 候选静止 / 移动 | 静止增量（配对中位数） | 移动增量（配对中位数） |
| --- | ---: | ---: | ---: |
| 一层 | 0.337 / 0.433 | 0.182（0.188） | 0.285（0.268） |
| 二层 | 0.326 / 0.465 | 0.162（0.161） | 0.318（0.285） |
| 三层 | 0.341 / 0.365 | 0.184（0.184） | 0.209（0.209） |
| 四层 | 0.347 / 0.420 | 0.197（0.198） | 0.253（0.277） |

绝对静止 `≤0.500ms`、绝对移动 `≤0.600ms`、移动增量 `≤0.350ms` 全部通过；四层静止增量 `0.162–0.197ms > 0.100ms` 仍 **FAIL**，配对中位数也全部超标。官方 builder 在 scratch 中按原阈值拒绝性能报告。该结果更新了当前源码的诊断依据；不把不同轮次与 Phase 579 的差值解释为优化收益，也不抵消 Phase 598 普通按需渲染场景的独立 CPU 证据。

## 来源、清理与下一步

所有结果在新建 `.run/` 目录保留。首次失败与修复后的日志分开，Computer Use 返回的窗口错误原文也保留；开始请求由 Godot 的实际接收、稳定前台和绘制计数确认，采样期间没有再置顶或点击窗口。

本轮运行指纹为 `beastbound-map-runtime-surface-v2:2bb70235ec28850363105860fec48496b586afa96129487432c98af8b83a8b0e`。[完整回执](../.run/map-performance/phase599-fixed-matrix-20260920T192616Z/earth_vein_cave_visual_v1/performance-runner-receipt.jsonl) SHA-256：`b15643297421116eaca59b13a52bf213d582beb98000dd038770482d9cf01f62`。详见 [逐层评估](../.run/phase599-performance-audit/evaluation.json)、[验证摘要](../.run/phase599-working/verification-summary.json) 和 [文件哈希清单](../.run/phase599-working/sha256-manifest.json)。

Computer Use 共 7 次调用、2 张原图，第 4／7 次开始点击返回窗口错误，但对应启动日志证明请求实际送达。原始回执 SHA-256：`acb22511e01637f83e0f6a0e4133bad8c7bf522603a42919d14982ac1fde7903`；未把工具错误删掉或计为成功截图。

测试进程及 QA lane 已清理，真实玩家资料未变；487 个运行脚本／数据／工具文件在最终采样期间保持一致，111 项保护文件和 107 项既有候选修改保持原字节。本轮只修改采样生命周期接线和回归，没有更换游戏素材、权威规则或玩家布局。

正式 bundle 的旧证据未覆盖，候选仍待所有者接受，P2.1a／R1.W024 不勾选。下一步先对当前深度层的静止回调做有控制的开销定位，再实施有证据支持的优化；期间暂缓反复重录正式截图，待运行源码稳定后补齐精确配对。

```sh
node tools/run_godot_auto_checks.mjs --only=--auto-camera-check --fail-fast --timeout-ms 180000 --output-dir .run/godot_auto_checks/phase599-before-cleanup-fix
node tools/run_godot_auto_checks.mjs --only=--auto-camera-check,--auto-camera-click-check --fail-fast --timeout-ms 180000 --output-dir .run/godot_auto_checks/phase599-after-cleanup-fix
python3 tools/map_visual_evidence_builder.py identity
python3 tools/run_map_visual_performance_evidence.py --build-identity '<本次 identity 输出>' --bundle-id earth_vein_cave_visual_v1 --godot '.run/phase584-native-review/Beastbound QA.app/Contents/MacOS/Godot' --run-id '<新的唯一目录名>' --scratch-only
python3 .run/phase599-performance-audit/evaluate.py
git diff --check
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
```

首条命令是已保存的失败复现；修复后不要覆盖原目录。性能入口在现有 `_keep_review_awake` 作用域内运行，保持测试进程唤醒，不更改系统设置；局部评估脚本位于本机忽略目录，不属于克隆仓库提供的公共工具。
