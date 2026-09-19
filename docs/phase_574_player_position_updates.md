# Phase 574：减少人物位置的无效更新

日期：2026-09-19。继续 R1.W024 的性能收口，只调整人物边界校正时的重复位置赋值，不改变速度、路径、人物大小、地图或权威规则。

## 实现与验证

`Player._clamp_to_bounds()` 原先每个物理帧都会写入 `global_position`，包括人物静止和已经位于边界内的情况。现在先计算校正结果，只有坐标实际不同才赋值。使用精确比较，微小越界仍须校正。Godot 的 [Node2D 位置设置实现](https://github.com/godotengine/godot/blob/master/scene/2d/node_2d.cpp) 会更新变换并通知渲染系统；是否确实产生重复工作，另在本机 Godot 4.7 中测量，而非仅凭源码推断。

两个真实 Player 场景分别运行修改前与候选代码，记录引擎 `NOTIFICATION_LOCAL_TRANSFORM_CHANGED`。以下是每组 240 步的通知次数，包含该组显式位置设置：

| 场景 | 修改前 | 修改后 |
| --- | ---: | ---: |
| 静止 | 240 | 0 |
| 行走与反复改目标 | 472 | 232 |
| 反复移到边界外并校正 | 260 | 40 |

720 步逐步对照的位置、速度、朝向和目标状态完全一致；缩小活动边界后，静止人物仍立即回到合法坐标。诊断包装器只用于观察引擎通知，不是鼠标验收。正式 Player 文件与该候选副本逐字节一致。

另以 12 个独立 headless Main 进行交替顺序的修改前／后 × 静止／移动 × 三轮对照，预热 180 帧、测量 480 帧。六个移动样本各完成 60 次跨帧左键、120 个事件，全部接收，屏幕投影错误为零，最终目标正确。完整 `process_scope_total` 的三轮中位数为静止 `0.030000→0.030125ms`、移动 `0.065000→0.060125ms`。静止基本不变，移动存在波动；该探针覆盖 `_process`，不直接计量 `_physics_process`，不据此宣称整游戏 CPU 或 FPS 改善。

```sh
node tools/run_godot_auto_checks.mjs --only=--auto-mouse-click-check,--auto-camera-click-check,--auto-character-runtime-appearance-check --fail-fast --output-dir .run/godot_auto_checks/phase574-player-regression --timeout-ms 180000
git diff --check
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
```

解析、鼠标、镜头点击与人物运行检查 **4/4**，摘要 `2026-09-19T14-12-13-546Z_summary.json`。本机通知诊断在 `.run/phase574-transform-diagnostic/`，整场景对照在 `.run/phase574-headless-comparison/`；忽略目录中的旧 Player、候选副本及探针用于本机调查。未运行全量 CI、生产导出或联网写入。

## 原生四层诊断与剩余问题

第一次当前源码原生矩阵完成 48 组，观察到零失焦、零不可绘制，24 组移动均通过。但点击工具报 `noWindowsAvailable` 后，恢复调用取得的 AX 状态已显示第 4 组正在运行，随后仍执行了 Raise、Tab、Return。这些操作发生在测量期间，**整批只保留为诊断，不能晋升正式证据**。原始回执保留在 `.run/map-performance/phase574-current-foreground-20260919/`，旁存 `operator-interruption.json` 和禁止正式采用的 `diagnostic-evaluation.json`。

这份诊断中，四层候选的静止完整脚本均值中位数为 `0.319 / 0.210 / 0.300 / 0.322ms`，相对网格的增量为 `0.184 / 0.070 / 0.163 / 0.185ms`。它提示后续重点是候选地图静止时的额外处理，而不是继续泛化优化；这些数字不能替代无额外操作的正式矩阵，也不能与 Phase 571 直接相减宣称收益。

第二次在新的 `.run/map-performance/phase574-clean-foreground-20260919/` 重跑。工具随后明确报告 Mac 已锁屏，准备页最终以 `foreground_unavailable` 结束，创建 Main 数为零。已请求用户方便时手动解锁；没有绕过锁屏或放宽前台条件。此前系统只读检查曾显示 `IOConsoleLocked=false`，所以不能把整段窗口异常统一归因为锁屏。

本轮两个原生进程及官方隔离目录均已回收，真实玩家数据与 111 项候选／历史保护文件不变。当前运行指纹为 `beastbound-map-runtime-surface-v2:9c37eaf3eb78100bbed8560d8159ed10fe15660d2221d38c69dafc6763f6ba91`。Phase 571 的完整正式矩阵 FAIL 尚未被替换，R1.W024、P2.1a、正式动作配对和所有者接受仍待完成。下一步先比较候选与网格静止时的调用差异，在窗口恢复后再补正式矩阵。
