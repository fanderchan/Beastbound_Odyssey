# Phase 579：当前洞穴完整性能与动作截图复核

日期：2026-09-20。继续 R1.W024。本阶段没有修改游戏源码、美术或验收阈值；补齐 Phase 577–578 后的完整原生性能矩阵，以及同一源码的 20 组自动配套截图。完整性能仍为 **FAIL**，联网守护战鼠标复核中断，未安装正式证据或改变候选生命周期。

运行基线为 `295583fb039500302114eb5c7e4bd6ab9d70036c`，运行指纹为 `beastbound-map-runtime-surface-v2:aeeb2a4c97aaebb929b136ade33df29896c1f794d0f353b1a3211be9304dbee0`。使用本机 Godot 4.7、Metal、1280×720 和官方隔离目录。

## 完整原生性能

在一个窗口内依次创建四层 × 网格／美术 × 静止／移动 × 三次重复，共 **48 个 Main**。每组观察帧与实际绘制帧相等，为 765 或 767 帧；全部零失焦、零不可绘制。48 个 Main 全部释放，进程组、预取、音频及隔离目录清理通过。24 组移动各完成 60 次跨帧点击、120 个鼠标事件，投影和最终目标检查通过。

准备页只点击一次。工具返回 `cgWindowNotFound`，但日志确认 `startRequested=true`、连续前台 1009ms 和 89 个准备绘制帧，随后成功开始采样；测量期间没有追加点击、置顶或恢复操作。这次成功不能证明窗口控制问题已彻底解决。

下表是三次运行均值的中位数，单位 ms；增量为候选减网格，括号内是同次配对增量的中位数。保持预热 180 帧、测量 480 帧、报告窗 60 帧和既有固定步长。这是全部 Node `_process` 回调区段的测量，不是整进程 CPU 或正常时钟 FPS。

| 地图 | 候选静止 / 移动 | 静止增量（配对） | 移动增量（配对） |
| --- | ---: | ---: | ---: |
| 一层 | 0.313 / 0.368 | 0.165（0.165） | 0.224（0.223） |
| 二层 | 0.325 / 0.441 | 0.174（0.177） | 0.297（0.297） |
| 三层 | 0.329 / 0.461 | 0.181（0.182） | 0.317（0.313） |
| 四层 | 0.339 / 0.432 | 0.188（0.187） | 0.278（0.278） |

绝对静止 `≤0.5ms`、绝对移动 `≤0.6ms` 和移动增量 `≤0.35ms` 全部通过；静止增量 `≤0.1ms` 全部失败。不能把不同轮次与 Phase 576 的差值归因于代码收益；本次也未取得修改前后的正常时钟 CPU 对照。

[完整回执](../.run/map-performance/phase579-current-matrix-20260919T181754Z/earth_vein_cave_visual_v1/performance-runner-receipt.jsonl) SHA-256：`8321612ed7364826cd6c935bdc2d05572054cb6460a073c9919dd1888ee189d5`。只在 scratch 中调用原有 builder 与未修改阈值，逐层结果见 [性能评估](../.run/phase579-performance-audit/evaluation.json)，采样／释放核对见 [验证摘要](../.run/phase579-performance-audit/verification-summary.json)。这份完整结果替代 Phase 576 作为当前源码的性能依据，没有覆盖正式 bundle 中的旧回执。

## 当前动作配套截图

用现有单窗口入口重新采集四层各 `pointer / movement_path / warp / collision / occlusion` 的独立 1280×720 PNG 与 capture-report，**20/20 配套采集通过**。报告中的 build identity 与本次性能回执逐项一致，截图 SHA-256 和尺寸全部复核。人物完整 alpha 高度为 `121.478–124.762px`，20 张截图的人物轮廓均在安全区内且不被固定 HUD 遮挡。

已查看四层入口图、一层遮挡图和四层碰撞配套图：当前候选显示洞穴地面、楼梯、矿石和岩墙；遮挡处物件淡化，人物保持可见。外围物件可随镜头裁切，不能将人物安全区通过解释为全场景无遮挡或守护地标已人工接受。

当前入口截图：[一层](../.run/evidence/map_visual_action_captures/earth_vein_cave_visual_v1/phase579-current-actions-20260920/scratch-actions/earth_vein_cave/pointer.png)、[二层](../.run/evidence/map_visual_action_captures/earth_vein_cave_visual_v1/phase579-current-actions-20260920/scratch-actions/earth_vein_cave_f2/pointer.png)、[三层](../.run/evidence/map_visual_action_captures/earth_vein_cave_visual_v1/phase579-current-actions-20260920/scratch-actions/earth_vein_cave_f3/pointer.png)、[四层](../.run/evidence/map_visual_action_captures/earth_vein_cave_visual_v1/phase579-current-actions-20260920/scratch-actions/earth_vein_cave_f4/pointer.png)。

[采集矩阵](../.run/evidence/map_visual_action_captures/earth_vein_cave_visual_v1/phase579-current-actions-20260920/capture-matrix.json) SHA-256：`0245862c0e07e78a6aa4e5d5a168cbf0fe5c1b24d2f8959fef5a9b62b1c2c59b`，逐文件验证见 [动作摘要](../.run/phase579-performance-audit/action-verification-summary.json)。这些是自动输入的配套图片，不是 Computer Use 原始操作，也不替代当前真实鼠标五类动作、完整路线通关或所有者美术接受。所有输出仍在 scratch。

## 联网鼠标复核未完成

随后通过现有 `play_guardian_review.py` 启动一个真实 Main 和四个隔离 HTTP 测试队友，未启用 `--autoplay`。实际看到四套同屏人物外观，第一次左键令人物从 `(21,8)` 移动到 `(19,5)`。再次点击守护入口时出现 `noWindowsAvailable`；读取截图及一次 Raise 后仍无法继续操作，未打开挑战对话、进入战斗或结算奖励。

原始记录共 7 次工具调用、4 张原始图片、2 次错误调用，保存在 [鼠标复核目录](../.run/phase579-guardian-review/)。工具事件 SHA-256 为 `84738c2686e1cc8d20672015fea72d8be116b2af29c169c80afa03b14a90b0e4`。最后状态仍是四层、未战斗、档案 revision 102。没有把历史自动胜利或本轮清理成功写成当前鼠标通关。

已通过测试专用 stop 文件正常结束客户端，后台测试服务也写出停机回执；[原生运行与清理](../.run/guardian-review/20260919T182403.804481Z/) 完整保留。失败原因只能确定到窗口操作工具不可用，不能据此归因为锁屏、游戏逻辑或某个系统组件。

## 执行与后续

关键入口如下，Godot 参数指向本机已核对的 Review 应用；原生入口运行时由现有 `_keep_review_awake` 作用域保持测试进程唤醒，不改变系统设置。

```sh
review_godot="$PWD/.run/computer_use/BeastboundReview.app/Contents/MacOS/Godot"
python3 tools/run_map_visual_performance_evidence.py --build-identity 'git:295583fb039500302114eb5c7e4bd6ab9d70036c+beastbound-map-runtime-surface-v2:aeeb2a4c97aaebb929b136ade33df29896c1f794d0f353b1a3211be9304dbee0' --bundle-id earth_vein_cave_visual_v1 --godot "$review_godot" --run-id phase579-current-matrix-20260919T181754Z --scratch-only
python3 .run/phase579-performance-audit/evaluate.py
python3 tools/play_guardian_review.py --godot "$review_godot" --timeout-seconds 900
python3 -B tools/record_map_visual_action_captures.py --bundle-id earth_vein_cave_visual_v1 --scratch-only --run-id phase579-current-actions-20260920 --godot "$review_godot"
git diff --check
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
```

本阶段没有源码修改，未重复全量 CI。三个原生运行全部结束，官方隔离目录和所建后台均已清理，真实玩家目录哈希保持一致；原有 107 项候选修改和 111 项保护文件保持原字节。

当前完整矩阵和自动配套截图已齐，剩余为静止增量问题、当前真实鼠标／联网战斗复核、正式证据配对及所有者接受。下一步按实际耗时证据定位剩余静止处理，并在窗口可操作时补人工记录；不重复无变化的完整性能测量，也不靠新的局部微测量宣称整机改善。R1.W024、P2.1a 和发布仍未完成。
