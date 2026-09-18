# Phase 559：人物边界与世界深度排序减少重复计算

日期：2026-09-19。承接 Phase 558 的真实地图开销调查。本阶段优化已有运行路径，保持角色美术、比例、相机、遮挡淡化、输入和地图规则。没有新增玩家操作或改变 StoneAge 参考行为；遮挡规则沿用 Phase 555。

## 改动与行为边界

- `player.gd` 将四次局部点转全局点、临时数组及逐点 min/max 合并为 Godot 原生 `Transform2D * Rect2`。仍先拒绝缺失节点或非正面积。该运算取得仿射变换后矩形的轴对齐外包围盒，包含父级变换、旋转、反射、非均匀缩放和倾斜；参见 [Godot Transform2D 运算文档](https://docs.godotengine.org/en/4.6/classes/class_transform2d.html#class-transform2d-operator-mul-rect2)。没有增加可能漏失动画更新的范围缓存。
- `world_depth_layer.gd` 先比较注册人物的原始深度和可见性。静止及仅横向移动时不再分配排序用键数组、格式化和拼接签名。深度变化、动态脚点、显隐、重新注册及失效节点仍会触发后续判断；保留既有三位小数签名边界、完整精度强制排序及同深度优先级。
- 新回归检查暴露了既有的释放后引用判断错误：先做 `is Node2D` 会对已释放实例报脚本错误。深度扫描及脚点查询现先检查实例有效性，再检查类型。

未改服务器权威、协议、地图数据、宠物数值、美术来源或候选开关。

## 定向回归

`world_depth_layer_check.gd` 增加静止／水平移动不重建签名、动态脚点、三位小数边界、强制重排、显隐、同 ID 同位置换实例、释放后清理与缓存稳定性检查。另用种子 559 的 128 组父子仿射变换，各检查人物范围、坐骑范围、零宽与负宽，共 512 例，与显式四角参考算法比较，世界坐标误差不超过 0.001。

```sh
node tools/run_godot_auto_checks.mjs --only=--auto-map-visual-runtime-check,--auto-camera-check,--auto-camera-click-check --fail-fast --output-dir .run/godot_auto_checks/phase559-world-regression-fixed --timeout-ms 180000
```

最终解析、地图视觉、相机及点击定向 `4/4`，摘要 `2026-09-18T18-51-06-888Z_summary.json`。此前 `phase559-world-regression` 的失败记录保留：尽管检查打印了表面 PASS，runner 正确识别已释放实例的六条脚本错误并拒绝；修复后重测无该错误。

## 前后测量

先后执行相同的官方隔离性能套件：

```sh
node tools/run_godot_auto_checks.mjs --performance-suite --output-dir .run/godot_auto_checks/phase559-world-before-performance --timeout-ms 180000
node tools/run_godot_auto_checks.mjs --performance-suite --output-dir .run/godot_auto_checks/phase559-world-after-performance --timeout-ms 180000
```

两次均 `5/5`，分别为摘要 `2026-09-18T18-45-00-340Z` 与 `2026-09-18T18-54-28-697Z`。下表为 headless 通用世界场景 `process_total`，单位 ms；不能当作四层原生美术性能验收，也不能将全部差值归因于本次两个微小热点。

| 工作负载 | 前中位数 / P95 | 后中位数 / P95 |
| --- | ---: | ---: |
| 静止，稳定 26 个样本 | 0.498 / 0.594 | 0.326 / 0.389 |
| 跨帧移动，稳定 4 个样本 | 0.446 / 0.510 | 0.330 / 0.344 |
| 连续点击，2 个样本 | 0.621 / 0.658 | 0.542 / 1.266 |

连续点击样本少，尾部耗时上升如实保留；两轮均正确合并、结算并到达最终目标，最大输入处理为 6μs 与 2μs。商店切换与人物连续加点检查均通过。

二层真实 Main 的局部 headless 微测量保存在 `.run/phase559-hotspot-baseline/` 与 `.run/phase559-hotspot-after/`。每项五次重复、每次 10000 次调用，轮次交替正反顺序；矩形方法每次 20000 次。仅用于归因，不能代替真实跨帧移动或原生性能。

| 局部方法，中位数 μs/次 | 前 | 后 |
| --- | ---: | ---: |
| 人物遮挡范围 | 1.5936 | 0.9735 |
| 静止深度顺序刷新 | 3.2398 | 1.4094 |
| 静止遮挡刷新 | 2.3037 | 1.5781 |
| 世界范围方法，含调用与参数保护 | 0.6919 | 0.1682 |

局部测量均正常回收 Main、音频、后台贴图与官方隔离目录，没有错误或泄漏。未修改的相机／签名计时变化不列为优化成果。

## 原生验证与候选状态

`phase559-native-world-optimization-20260919` 单窗口矩阵已完成：四层 × 静止／移动 × 旧网格／当前美术 × 三次重复，共 48 个独立 Main。全部观察帧零失焦、零不可绘制，48 个 Main 全部释放；官方 lane 完整清理，真实玩家目录未变。原生 Metal、1280×720，沿用 Phase 558 的实际绘制帧要求，没有强制后台绘制、改变阈值或拼接批次。

本轮 build identity 为 `git:63285f0dad29cd7bfba18d06b487f6bc81bbb2e9+beastbound-map-runtime-surface-v2:7a218a621feba372c12748c02566466d2196fb508f39c8faa44b51247f991026`。原始回执位于 `.run/map-performance/phase559-native-world-optimization-20260919/earth_vein_cave_visual_v1/performance-runner-receipt.jsonl`，SHA-256 为 `fc69065bf8ee6f291f9abb4ed6cac57c0c21b9f213b5993281659cfb9c095b86`。

**采样有效不等于性能通过。** 将回执复制到独立 scratch 目录，仅重定向报告输入／输出目录，使用未改的官方 builder 与阈值评估；它正确拒绝第一层静止增量。四层完整聚合诊断保存在 `.run/phase559-performance-audit/evaluation.json`：

| 地图 | 当前静止 / 移动 ms | 静止增量 ms | 移动增量 ms | 配对移动增量中位数 ms |
| --- | ---: | ---: | ---: | ---: |
| 一层 | 0.341 / 0.479 | 0.199 | 0.338 | 0.317 |
| 二层 | 0.340 / 0.487 | 0.197 | 0.361 | 0.359 |
| 三层 | 0.309 / 0.492 | 0.156 | 0.362 | 0.364 |
| 四层 | 0.352 / 0.478 | 0.187 | 0.332 | 0.347 |

每格沿用三次 run 均值的中位数聚合。绝对静止 `≤0.5ms`、移动 `≤0.6ms` 全通过；四层静止增量均超过 `0.1ms`，二三层移动增量及配对中位数超过 `0.35ms`。总评仍为 FAIL，没有安装新性能文件或把旧文件重标为 PASS。Phase 558 只有首轮部分有效样本，不能将两轮数值差当作严格配对的优化收益。

矩阵期间单次 `ps` 还观察到 73.2% CPU；这个批次包含持续重建 Main、预热和固定步长运行，单次采样不能归因于稳态绘制，也不能用子毫秒脚本区段替代进程 CPU 结论。后续需在正常运行的稳定静止／移动阶段区分绘制、引擎及脚本开销。

自动动作截图入口另在启动前报 `formal transaction committed summary formal artifact 字节数不一致`，没有启动 Godot 或修改正式证据。检查发现 scratch 路径也会扫描历史正式安装事务；保留这项后续工具问题，没有删除事务或绕过正式安装验证。随后复用既有隔离 Main 手动入口作画面检查，但 Computer Use 明确返回 Mac 已锁屏，尚未执行鼠标复核。通过原有 stop 文件正常结束，音频／进程／lane 收口通过；该次启动不记为视觉或人工操作验收。

R1.W024 保持未勾选。运行源码指纹已因本次优化变化；Phase 557 的画面、动作和五人战斗仍是当时版本的有效历史观察，不能改写 hash 宣称为当前源码的精确冻结证据。

## 保留与交付

本轮开始时的 107 项候选证据已逐项对照 `.run/phase559-before/inventory.json`，SHA-256 全部一致；本阶段只提交运行优化、相关回归和文档。前后性能的摘要与微测量索引位于 `.run/phase559-performance-comparison.json`。所有本轮进程已结束，官方 QA lane 不存在，真实玩家目录 SHA-256 仍为 `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`。

未运行全量 CI、共享后端测试、生产导出或容量测试。当前改动的定向检查和原生样本已取得，后续继续处理完整数据暴露的性能差异、动作工具的事务检查边界，以及解锁后的当前版本画面复核；美术批准和发布状态保持不变。
