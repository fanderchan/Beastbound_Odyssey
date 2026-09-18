# Phase 561：提前结束无法胜出的镜头候选评分

日期：2026-09-19。承接 Phase 559 的移动相机开销调查。本阶段只减少既有求解器的计算，沿用 Phase 556 的人物／交互地标优先构图，不增加玩家操作或改变 StoneAge 参考行为。

## 改动与等价条件

`WorldCameraSafeAreaModel` 仍按原顺序生成候选位置、计算九维评分并逐项比较。变化仅发生在评分中：已有优先主体时，优先主体的 HUD 重叠次数是第一项；没有优先主体时，前四项恒为零，全部主体的重叠次数是第一项可变化的分数。一旦这项非递减计数超过当前最佳分数加原有 `0.01` 容差，剩余主体不能让候选胜出，可以立即停止。

初始位置仍完整评分；被淘汰候选返回空数组，调用方明确跳过。未淘汰的候选保留原九项分数、完整精度、比较容差和同分时的先后顺序。普通物件重叠不会增加优先主体的计数。

没有修改人物大小、相机缩放、HUD、交互地标、地图拓扑、服务端协议或资产生命周期。没有新增缓存、逐帧扫描或跳过人物／地标可见性规则。

## 正确性

- 既有纯模型检查继续覆盖边界夹紧、地图角落、完整 alpha、HUD 遮挡，以及 F4 导航到达／消息窗展开后的完整人物与双地标。
- 新增两种优先级下的容差边界、普通物件不能冒充优先主体，以及固定种子 561 的 512 组评分对照。随机输入包含无主体、无 blocker、无效尺寸、无效视口、负优先数和超出主体数的优先数。57 组提前淘汰，其完整评分均不可能胜过当前分数；455 组保留，九项评分逐值相同。
- 用当前 Main 的二层候选场景记录 64 组不同的实际构图输入。60 次跨帧左键、120 个事件全部接收，屏幕投影不匹配为零，最终到达目标正确。
- 正式修改后的模型与修改前模型，对这 64 组输入和 10000 组固定随机输入逐例比较，最终 `Vector2` 完全一致，失败数为零。

修改前文件来自 `bedaa88bca76a30cb1adb9451dcd29c808c195d3`，SHA-256 为 `c2e768d34eaf74b9bf2bc9a0c95bb9f310efc98985995e1a75aa7bd3c02e12fb`。旧模型副本只移除全局类名；跟踪入口复制当前 Main 并仅更换模型引用，不冒充正式原生画面证据。

## 前后性能

64 组当前输入各运行新旧模型 40 次，按轮次交替顺序，共五轮。旧模型总用时 `57339/57939/60214/62113/62084 μs`，正式模型 `45835/46526/48102/49740/49604 μs`；中位数 `60214 → 48102 μs`，约减少 20.1%。这是局部算法耗时，不是 FPS 或整场景提升比例。

二层同一 Main 工作负载另作静止／移动前后对照：180 帧预热、480 帧测量、每 60 帧一组。移动包含相同的 60 次跨帧点击、到达及后续静止；旧版仅替换模型引用，新版使用正式 Main。下表单位为 ms/帧。

| headless 二层诊断 | 相机区段 | Main process_total | process_scope_total |
| --- | ---: | ---: | ---: |
| 修改前静止 | 0.0030 | 0.02375 | 0.03425 |
| 修改后静止 | 0.0030 | 0.02700 | 0.03925 |
| 修改前移动 | 0.0190 | 0.05113 | 0.08113 |
| 修改后移动 | 0.0176 | 0.04925 | 0.07838 |

静止已有相机缓存，本次没有收益，整场景静止数据还略有上升；不把局部算法微测量套用到其他区段。移动相机区段小幅下降。这些单次 headless 场景对照不代替原生矩阵、GPU／绘制或稳态进程 CPU 观察。

官方通用性能套件前后均 `5/5`。`process_total` 如下，单位 ms；连续点击样本少，移动 P95 略升如实保留。

| 工作负载 | 稳定样本 | 修改前中位数 / P95 | 修改后中位数 / P95 |
| --- | ---: | ---: | ---: |
| 静止 | 26 | 0.336 / 0.401 | 0.332 / 0.372 |
| 移动 | 4 | 0.328 / 0.370 | 0.275 / 0.380 |
| 连续点击 | 2 | 0.369 / 0.782 | 0.298 / 0.740 |

商店切换与连续加点也通过，不能由本次相机优化解释它们的耗时变化。

## 验证与记录

```sh
node tools/run_godot_auto_checks.mjs --only=--auto-camera-check,--auto-camera-click-check,--auto-map-visual-runtime-check --fail-fast --output-dir .run/godot_auto_checks/phase561-camera-regression --timeout-ms 180000
node tools/run_godot_auto_checks.mjs --performance-suite --output-dir .run/godot_auto_checks/phase561-camera-before-performance --timeout-ms 180000
node tools/run_godot_auto_checks.mjs --performance-suite --output-dir .run/godot_auto_checks/phase561-camera-after-performance --timeout-ms 180000
git diff --check
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
```

解析／相机／点击／地图视觉 `4/4`，摘要 `2026-09-18T19-44-34-016Z_summary.json`；前后性能摘要分别为 `2026-09-18T19-32-14-008Z` 与 `2026-09-18T19-46-58-678Z`。纯模型脚本在官方隔离 lane 内另行运行通过，记录于 `.run/phase561-camera-model-regression/`。

本机诊断索引为 `.run/phase561-performance-comparison.json`，真实输入为 `.run/phase561-current-camera-inputs-f2/cases.json`，正式模型对照为 `.run/phase561-production-model-comparison/`，四组 Main 对照为 `.run/phase561-runtime-{before,after}-{idle,moving}/`。临时诊断入口在 `client/godot/.godot/phase561_camera_trials/`，使用 `.run/phase552_run_isolated.py` 的既有官方 lane 生命周期包装；这些忽略目录是本机调查材料，不是克隆仓库即有的公共命令。

所有测试进程正常回收，官方 lane 已清理，真实玩家目录仍为 SHA-256 `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`。107 项待重冻候选证据及四项既有事务历史原字节保留。没有运行全量 CI、共享后端测试、生产导出或容量测试。

## 仍需完成

Mac 尚未收到解锁确认，本轮没有启动新的原生复核窗口。Phase 559 的完整原生性能失败结论仍有效，尤其静止增量尚未解决；不能用本轮 headless 通过替换它。后续继续调查正常窗口的静止 CPU 与原生处理开销，再复测四层矩阵及当前画面／真实操作。

运行源码指纹已变为 `beastbound-map-runtime-surface-v2:bcb17e5d45aa4645ba8e377f476648162185d6e64e38e28f4b013f8cf9205218`。R1.W024、P2.1a、老板美术接受及正式发布继续待完成，没有改写历史回执 hash 或放宽性能门槛。
