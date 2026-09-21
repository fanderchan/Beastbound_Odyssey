# Phase612：洞穴性能补测的窗口诊断

日期：2026-09-22。承接 [Phase611 美术返工](phase_611_natural_cave_visual_revision.md)，仅补充 QA 诊断与现行文档。没有改变地图像素、玩法、普通客户端、采样条件或验收阈值，R1.W026–W028 继续未完成。

## 问题与代码变化

Phase611 两次已启动的性能批次分别在第 22、32 个样本失去可绘制状态，焦点仍为 true。原日志只有样本边界与累计计数，不能定位首次失绘的时刻。

`scripts/qa/map_performance_batch.gd` 现在只在某个样本首次失焦、不可绘制或关闭渲染循环时输出一条 `map performance visibility lost`。记录样本身份、系统时间、样本经过时间、逻辑／绘制帧、窗口可见性、模式、位置、尺寸与所在屏幕。正常路径继续使用既有逐帧状态检查；窗口几何读取和日志只发生在已经无效的样本上。不抢焦点、不补绘、不改变失败与清理行为。

本机 Godot 为 `4.7.stable.official.5b4e0cb0f`。该版本的 [macOS 窗口委托](https://github.com/godotengine/godot/blob/5b4e0cb0f/platform/macos/godot_window_delegate.mm#L360) 根据原生窗口的遮挡状态及可见状态更新引擎可见性；[DisplayServer](https://github.com/godotengine/godot/blob/5b4e0cb0f/platform/macos/display_server_macos.mm#L2500) 分别读取焦点和可绘制状态。因此有焦点不能证明正在绘制。这解释了为什么仍须拒绝这些样本，**没有证明是哪个程序或系统事件遮住了窗口**。

## 本轮实际尝试

唯一新增 run ID 为 `phase612-visibility-diagnostic-performance`，通过正式性能入口和隔离 QA 车道运行，使用临时进程范围唤醒断言。Computer Use 初次能看见准备页，但点击开始返回 `noWindowsAvailable`，随后两次状态读取超时。

原生日志在准备阶段 120,010ms 后报告 `foreground_unavailable`：`startRequested=false`、`mainCount=0`、完成样本 0；10,822 个准备观察帧中 10,785 个不可绘制，只产生 37 个实际绘制帧。**本轮根本没有进入性能样本，新增的样本内诊断分支也尚未实机触发。** 这不是性能通过或地图性能回归。

现场只读系统检查取得 `IOConsoleLocked=false`，且系统已有防止空闲显示睡眠的断言。没有改系统偏好，也没有停止其他会话的唤醒进程；这些证据不支持将失败直接归因为锁屏或休眠。窗口失绘与电脑交互服务不可用的根因仍未确认。

实际命令、原始日志、计划和清理证明保存在：

- `.run/map-performance/phase612-visibility-diagnostic-performance/earth_vein_cave_visual_v1/godot.log`
- 同目录的 `plan.json` 与 `qa-lane-lifecycle.json`。

进程退出码为 1，`leaderReaped=true / processGroupClosed=true`；官方清理证明 `realUnchanged=true / laneAbsent=true`，真实玩家目录摘要仍为 `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`。

## 身份、验证与后续

本轮基线提交 `39d088be14d3eec0e8e531fb1e2deb83f5adee5a` 的运行内容仍为 `beastbound-map-runtime-surface-v2:28dbd813cd8e1c24165fcefc1f299970dedd02a6715253b9b4446e057f54a43d`。QA 文件修改单独进入性能计划的 `sourceIdentity`，其 SHA-256 为 `2fc007388eae7686d256096191b05881474af440038803640863831738e0eae6`。没有把 Phase611 原件的旧 Git 前缀改成当前提交。

已执行：

```sh
git diff --check
python3 -B -m unittest discover -s tools/test -p test_map_performance_batch.py
python3 -B -m unittest discover -s tools/test -p test_run_map_visual_performance_evidence.py
node tools/run_godot_auto_checks.mjs --parse-only
```

两组工具回归 `10/10 + 11/11`，隔离解析 `1/1`；解析摘要为 `.run/godot_auto_checks/2026-09-21T17-25-48-826Z_summary.json`。这只验证 QA 修改的解析与现有采样合同，不替代完整原生性能矩阵。未运行全量 CI，也没有重做已有效的二十项鼠标操作或两支影片。

现行文档入口已改为 Phase611 的新版美术与本阶段的待测状态；Phase608 的 48 组通过保留为旧美术证据。当前 `performanceReport` 仍空，候选仍 `owner_review_pending / pending / false / false`。

下一次须先确认电脑交互服务可用且游戏窗口能持续保持前台，再用新 run ID 完成单轮 48 组配对。不得拼接残缺批次、借用旧画面的性能报告，或在环境没有变化时反复启动同一失败流程。完整性能通过后再进入 W029，取得老板对这批具体画面的结论；本阶段没有发布或美术接受。
