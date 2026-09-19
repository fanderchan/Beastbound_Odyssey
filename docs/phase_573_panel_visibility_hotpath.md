# Phase 573：按显隐事件缓存世界菜单状态

日期：2026-09-19。继续 R1.W024 的性能调查。本次优化菜单状态查询，不改变界面布局、人物比例、地图美术或玩法规则。

## 定位与实现

正常时钟原生二层候选的一段有效前台静止样本为 24.29 秒、719 个绘制帧，进程 CPU 约 8.60%；未启用性能探针。这只是单个离线隔离夹具，不能推广为正常联网客户端基线。原生调用栈中的大量睡眠和 Metal 等待是墙钟采样，不能解释为这些函数消耗了同等比例的 CPU。

随后使用 Godot [EngineDebugger](https://docs.godotengine.org/en/stable/classes/class_enginedebugger.html) 与[本地脚本分析器](https://github.com/godotengine/godot/blob/master/core/debugger/local_debugger.cpp)，在 Main 预热后采样约 20 秒。`PanelRegistry.any_world_menu_visible()` 查询 684 次，自耗时合计 17.386ms，是该次采样自耗时最高的业务函数。它每次遍历注册的几十个面板，即使显隐状态完全不变。此诊断窗口失焦，分析器也有额外开销，只用于定位；异步诊断协程包含等待时间，已从业务函数汇总中剔除，不用其原始累积总时间推算 CPU。

`PanelRegistry` 现在监听注册面板的 `visibility_changed`、`tree_entered` 和 `tree_exited`。显隐或场景归属变化后，下次查询仍按原来的 `is_visible_in_tree()` 规则计算；未变化时直接返回结果。重新注册会解除旧监听，追加面板会使结果失效，已释放的面板不再参与查询。注册入口仍为 `set_world_menu_panels()` / `add_world_menu_panel()`；已有公开数组供菜单枚举读取，不应直接修改以绕过监听。

点击命中继续使用原来的递归面板检测。没有加入玩家可见的新功能，也没有新的 StoneAge 产品差异。

## 验证与收益

新增独立 `PanelRegistryVisibilityCheck`，接入原 `--auto-panel-registry-check`。23 个场景覆盖同帧开关、父控件显隐、多个菜单、重复注册、移出／重进场景、重挂父节点、立即／延迟释放、CanvasLayer、替换注册列表，以及注册表先于控件释放。每次状态转换后连续查询三次；原有 Main 市集、装备合成和点击遮挡检查继续通过。

修改前后的二层候选各运行静止／移动三轮，共 12 个独立 headless Main，交替版本顺序。只切换注册表实现，其余运行代码相同；每次预热 180 帧、测量 480 帧。六个移动样本均完成 60 次跨帧点击、120 个鼠标事件，全部接收，屏幕投影错误为零，最终目标正确。

以下为三轮运行均值的中位数，单位 **ms/帧**。

| 范围 | 修改前静止 | 修改后静止 | 修改前移动 | 修改后移动 |
| --- | ---: | ---: | ---: | ---: |
| Main process_total | 0.024375 | 0.021750 | 0.042125 | 0.039250 |
| 完整 process_scope_total | 0.033125 | 0.030000 | 0.064375 | 0.061000 |

完整脚本范围分别减少约 **9.4% / 5.2%**。这是固定步长、无原生绘制的对照；不能说整游戏 CPU 或 FPS 改善同样比例。

```sh
node tools/run_godot_auto_checks.mjs --only=--auto-panel-registry-check --fail-fast --output-dir .run/godot_auto_checks/phase573-panel-registry --timeout-ms 180000
node tools/run_godot_auto_checks.mjs --only=--auto-map-panel-check,--auto-battle-command-awakened-ui-check,--auto-mouse-click-check --fail-fast --output-dir .run/godot_auto_checks/phase573-adjacent-regression --timeout-ms 180000
git diff --check
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
```

两组最终结果 **2/2、4/4**，分别为 `2026-09-19T13-52-31-520Z_summary.json` 和 `2026-09-19T13-58-54-748Z_summary.json`。首次解析发现测试辅助类 WeakRef 的类型推断警告，修正后上述两组均通过。没有运行全量 CI、联网写入或生产导出。

## 原生边界与后续

单窗口原生前后对照进入首个 Main 后失焦且不再绘制，首样本 765 个观察帧均不可绘制，批次正确失败。另一次正常时钟单窗口 ABBA 静止对照也持续失焦／停止绘制，已中止并明确判为无效。没有安装这些失败数据，也没有修改正式工具的前台要求。当前运行源码指纹为 `beastbound-map-runtime-surface-v2:24071f6178ca8ec80852db8e5b2696183536a63550733676c5624ae1cadeb80b`，仍需有效原生复验；Phase 571 完整矩阵 FAIL 继续有效。

本机诊断材料分别位于 `.run/phase573-native-stack/`、`.run/phase573-script-profile/`、`.run/phase573-headless-comparison/`、`.run/phase573-native-comparison/` 和 `.run/phase573-normal-cpu/`。旧注册表及诊断入口保存在忽略的 `client/godot/.godot/phase573_*_trials/`。这些是本机调查材料，不是正式可发布证据。

本轮进程、进程组与官方 QA 隔离目录均已回收；真实用户数据未变，111 项候选／历史保护文件逐项哈希一致。R1.W024、P2.1a 及所有者接受继续待完成。后续先取得有效原生静止／移动对照，再判断完整四层门槛；菜单优化的局部收益不足以宣布洞窟整体验收完成。
