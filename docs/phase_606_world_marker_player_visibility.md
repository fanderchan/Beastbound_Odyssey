# Phase 606：设施名称避让玩家

日期：2026-09-21。基线 `faec102450ebdb01aa0401256b83cc35c1e19658`。继续 R1.W025 受委托复审，关闭 Phase605 已复现的共鸣台名称遮挡人物问题。

## 问题与处理

设施名称在固定覆盖层绘制，原有物件透明处理不会影响它。原生 `Main.tscn / 1280×720` 中，走近岩脉共鸣守卫的 55 个实际绘制帧有 21 帧发生名称与人物轮廓重叠，停下打开对话后仍挡住上半身。不是人物比例或设施碰撞错误。

本机 StoneAge 参考 `gmsv/src/char/char_base.c` 只有可核实的角色名称等服务端字段，未据此推断原作客户端的名称避让方式。本次依据实际可见性缺陷，延续 Beastbound Phase555 的人物可辨认目标：相交时把名称移到人物轮廓上方，离开后恢复原锚点。名称继续完整显示，不增加设置、提示或操作步骤；代价是靠近时标签会偏离设施原锚点。

- `WorldOverlayLayer` 保留设施标签节点及原锚点，读取已缓存的人物轮廓，在演员与深度层更新之后检查几何。只有轮廓或标签布局变化才遍历已有设施标签，静止不重复扫描或重建。
- 保护范围使用背景与实际 `Label` 控件的并集，保留 6 世界像素间距。中文回退字体实际最小高度为 24，而请求高度为 22；不能只用请求尺寸。文字控件尺寸改变会使布局缓存失效。
- `Main._spawn_player()` 只增加两行绑定。地图切换重建、隐藏或释放人物均恢复正确锚点；不扫描贴图、地图目录或档案，不执行 I/O。
- 移动目标圈、设施点击位置和 `MOUSE_FILTER_IGNORE` 不变。没有修改地图数据、NPC／宠物形象、素材、相机比例、服务器、奖励或协议。

## 定向与实机验证

`WorldDepthLayerCheck` 接入独立 `WorldOverlayVisibilityCheck`。初始旧代码回归出现 83 项重叠错误，修复后为零；覆盖横穿名称的 111 个位置、静止 300 次查询不重排、实际文字高度变化、宽大轮廓、父节点缩放平移、原地重建、显隐、释放和清图。300 次是直接查询调用，不能冒充跨帧移动测试。

首轮解析、地图视觉、相机、相机点击、洞穴守护 **5/5**；补齐实际文字控件尺寸后，最终解析、地图视觉、相机点击、洞穴守护 **4/4**。之后仅将回归输出字段 `idleFrames` 更正为 `idleCalls`，未改测试行为。前后性能套件各 **5/5**，包含跨帧移动、移动点击压力、商店选择和属性按钮压力。没有运行无关服务器套件或全量 CI。

最终原生正常时钟、Compatibility、Dummy 音频路径中：

- 12 次跨帧移动点击全部接受，累计移动 `484.721` 世界单位；另两次左键分别打开正确设施对话。
- 守护兽接近过程 27 个实际绘制帧、共鸣守卫 56 个实际绘制帧，以及两张对话截图，名称与人物轮廓重叠均为零；最终截图已实际查看。
- [修改前](../.run/phase606-native-before-verified/earth_vein_evolution_lineage_npc.png) 与 [修改后](../.run/phase606-native-after-final/earth_vein_evolution_lineage_npc.png) 保留同一停格对照；[结构化比较](../.run/phase606-working/native-comparison.json) 保留全部检查。

游戏点击来自跨帧输入事件，Computer Use 负责置前及观察窗口，不冒充人工完整试玩。没有点击挑战按钮或创建联机战斗。首个原生观察器误用标签节点名前缀，得到空标签数组；该轮不作几何通过证据，随后修正前缀并要求每次恰好找到两条名称，重新取得有效基线。一次窗口退出后的旧 Computer Use 置前调用失败也保留，未当作成功操作。

所有原生运行使用官方 QA lane，运行期间源码未变、档案未变，Main、音频、所属进程和 lane 已清理。未启动后端或操作真实 MySQL。

## 性能口径

| headless Main `process_total` | 修改前中位数 / P95 | 修改后中位数 / P95 |
| --- | --- | --- |
| 静止 | 0.635 / 0.736 ms | 0.505 / 0.542 ms |
| 移动 | 0.643 / 0.700 ms | 0.516 / 0.555 ms |

前后移动压力均发送 35 次点击、70 个跨帧事件，最终目标匹配、点击合并与停步通过，最大输入耗时 `4→3µs`。以上不宣称本修复加速了游戏：新增处理在独立覆盖层回调中，Main 的分段计时没有包含它。

为覆盖整进程成本，追加两轮同进程对照：当前二进制与同一地点不变，只在 QA 内存中绑定／解除人物轮廓；第一轮顺序为关／开／开／关，第二轮反转。每个条件两段 6 秒静止及两段 6 秒移动，每段移动 12 次跨帧点击，八段移动共 96 次全部接受且零失焦／不可绘制帧。

| 顺序 / 条件 | 引擎处理时间中位数：静止 / 移动 | 进程 CPU 中位数：静止 / 移动 |
| --- | --- | --- |
| 第一轮，解除轮廓 | 8.192 / 10.323 ms | 11.25% / 16.60% |
| 第一轮，绑定轮廓 | 8.143 / 10.392 ms | 11.80% / 18.80% |
| 反序，解除轮廓 | 12.801 / 14.214 ms | 9.85% / 15.25% |
| 反序，绑定轮廓 | 12.247 / 12.320 ms | 9.45% / 12.95% |

首轮移动 CPU 增加 2.2 个百分点，反序减少 2.3 个百分点，没有复现可归因于避让的稳定退化，不据此宣称零开销或性能改善。引擎监视器在刷新间隔内会重复值，不能把逐帧读取数视作独立统计样本。连续绘制和探针下 CPU 高于日常空闲目标；这些短测不替代无探针日常运行、正式四层矩阵或多人容量。完整数据见 [两轮全部样本](../.run/phase606-working/controlled-order-comparison.json) 和 [headless 比较](../.run/phase606-working/headless-comparison.json)。

## 当前边界与下一步

运行指纹为 `beastbound-map-runtime-surface-v2:b6ff8fda20d63c6397c731e26d272df0808c1d0742a5448d1798c42390a21ca8`。严格 bundle 审计仍为 **FAIL / releaseReady=false**：20 份历史动作证据各有运行指纹、捕获面、捕获面摘要、Main 源码与预览授权五项绑定过期，共 100 项。当前地图／碰撞合同没有更改；未重写旧报告的身份或覆盖旧冻结影片。

本阶段只关闭设施名称挡人问题。接着审看完整四层、地标和返村影片，补齐路线中段的视觉判断，再按最终源码统一重冻必要证据。候选仍为 `owner_review_pending / pending / releaseApproved=false / runtimeEnabled=false`；R1.W025、P2.1a 不提前勾选，内部修复通过不等于所有者接受或正式发布。

## 复跑与证据入口

```sh
node tools/run_godot_auto_checks.mjs --only=--auto-map-visual-runtime-check,--auto-camera-check,--auto-camera-click-check,--auto-rebirth-cave-guardian-check --fail-fast --timeout-ms 180000 --output-dir .run/godot_auto_checks/phase606-targeted
node tools/run_godot_auto_checks.mjs --only=--auto-map-visual-runtime-check,--auto-camera-click-check,--auto-rebirth-cave-guardian-check --fail-fast --timeout-ms 180000 --output-dir .run/godot_auto_checks/phase606-final
node tools/run_godot_auto_checks.mjs --performance-suite --timeout-ms 180000 --output-dir .run/godot_auto_checks/phase606-after-performance
python3 .run/phase606-working/native.py phase606-native-after-final
python3 .run/phase606-working/perf.py phase606-native-controlled
python3 .run/phase606-working/perf_reverse.py phase606-native-controlled-reverse
python3 .agents/skills/design-beastbound-maps/scripts/audit_map_bundle.py client/godot/assets/maps/earth_vein_cave_visual_v1/map-visual-bundle.json
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
git diff --check
```

复跑使用新的唯一输出目录。原始失败、有效基线与最终运行均保留；[验证汇总](../.run/phase606-working/verification-summary.json) 和 [证据 SHA-256](../.run/phase606-working/artifact-sha256.json) 为本阶段本地入口，`.run/` 不提交为产品源码。
