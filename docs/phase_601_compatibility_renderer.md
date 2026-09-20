# Phase 601：PC 2D 渲染后端与原生性能复验

日期：2026-09-21，开发基线 `18ffa702cb35e6399fe899abd33e1cbf9e8628d8`。继续 P2.1a／R1.W024。

## 选择与实现

项目默认从 Mobile 改为 Compatibility。现有世界地面、人物、界面和战斗采用 2D CanvasItem，地图调色和圆形小地图使用简单着色器；本轮未发现依赖 RenderingDevice、计算着色器或 HDR 2D 的路径。Godot 官方将 Compatibility 作为无需高级渲染功能的 2D 项目的起点；最终选择仍依据本项目实测，不能由文档推导全部场景收益。[Godot 渲染器说明](https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html)

`project.godot` 的默认方法与功能标记同时更新。macOS 验收工具固定要求实际 `gl_compatibility / opengl3`，并核对真实 OpenGL Compatibility 引擎日志；地图、战斗、地图动作、录片和融合工具一并迁移。旧 Mobile／Metal 报告继续保留为历史，但不能用于新后端的当前性能验收。没有放宽静止、移动、增量、帧数、前台或输入条件。

独立融合录片补充实际方法／驱动的运行时字段与检查；期望驱动字符串不再单独充当实际运行证明。QA 隔离检查仅更新基础 renderer feature 对应的一行与该函数哈希，三条隔离 feature、owner、进程回收、真实玩家目录保护均保留。Computer Use 截图安装器只声明可证明的 macOS 窗口，不从截图推断具体渲染驱动。

回归另复现两个旧录片入口在 HEAD 上原有的 `user_data_dir` 参数错误。地图面板／交易所录片已接入现有官方隔离执行器：原生预检、MovieWriter、实际隔离回执、清理和失败保留使用同一既有实现；不再创建未被 Godot 采用的伪隔离目录。

此为技术配置和验收链路变更，不更改地图、人物比例、相机、碰撞、玩法数值或玩家操作规则。没有新素材，也没有把候选状态改为正式接受。

## 同版后端对照

修改默认配置前，以同一份运行源码分别通过命令行选择后端。二层美术，普通时钟、生产空闲控制器、VSync=1，按静止／移动／移动／静止各采样 12 秒。每段移动用 30 次跨帧左键，按 400ms 实际时间节奏投递，行走距离均为 1204.721。两后端各 60 次点击／120 个事件，首个输入均在第 2 帧收到；活动帧无漏画，零失焦和不可绘制。

| 场景，两个样本的均值 | Mobile／Metal CPU | Compatibility／OpenGL CPU |
| --- | ---: | ---: |
| 普通静止 | 3.835% | 4.969% |
| 持续点击移动 | 12.596% | 7.887% |

移动 CPU 约减少 37%，静止约增加 1.13 个百分点，不能宣称所有状态都更省 CPU。该结果只覆盖本机二层场景，采样器亦有少量共同开销；不代表 Windows、冷启动、全游戏或 200 人容量。

引擎整体 `TIME_PROCESS` 采样均值在 Compatibility 下反而较高（静止两段约 `11.45 / 7.11ms`，Mobile 约 `2.25 / 2.15ms`），与进程 CPU 和脚本回调区段不是同一个计量范围；正常时钟的活动帧均完整绘制、相同行程和输入均完成。此处并列保留原始指标，不把较低的 CPU 或脚本耗时解释为整体帧延迟同比下降，也未据此定位驱动等待的具体来源。

另外的固定步长诊断按网格／美术／美术／网格各记录 1920 帧，7680 帧均实际绘制，零失焦。Compatibility 美术的 Node 回调区段均值约 0.079ms；相同运行指纹的 Phase600 Mobile 美术约 0.319ms。该诊断带临时分项计时，不能替代正式矩阵，也没有据此断言具体 GPU／系统调度成因。

二层跨后端 1280×720 图片的几何、构图和人物尺寸一致，RGBA 分量最大差异为 1/255；网格最大差异 2/255。并非跨后端逐像素相等。原始对照位于 `.run/phase601-compatibility-diagnostic/`、`.run/phase601-mobile-cpu/`、`.run/phase601-compatibility-cpu/`；像素统计见 `.run/phase601-working/backend-pixel-comparison.json`。

## 当前默认路径验证

### 四层原生性能

最终矩阵 `phase601-compatibility-matrix-20260920T203036Z`：四层 × 网格／美术 × 静止／移动 × 3 次，共 48/48 有效样本；36,768 帧全部连续绘制，零失焦、不可绘制和漏画，48 个 Main 完整回收。由正式报告构建器在忽略目录评估，绝对静止 ≤0.500ms、绝对移动 ≤0.600ms、静止增量 ≤0.100ms、移动增量 ≤0.350ms **全部通过**；门槛和配对中位数检查未改。表中是每格三次样本均值的中位数，增量为美术减网格。

| 楼层 | 美术静止 ms | 静止增量 ms | 美术移动 ms | 移动增量 ms |
| --- | ---: | ---: | ---: | ---: |
| F1 | 0.194 | -0.079 | 0.220 | -0.056 |
| F2 | 0.205 | -0.074 | 0.200 | -0.083 |
| F3 | 0.146 | -0.140 | 0.266 | -0.022 |
| F4 | 0.202 | -0.090 | 0.256 | -0.041 |

这是固定 60 FPS 模拟步长、关闭 VSync、实际前台连续绘制的脚本回调区段测量，不是普通显示帧率或整进程 CPU。当前结果替代 Phase599 作为新后端的最新性能结论，保留其原始失败记录。正式候选目录尚未安装这些证据；需先补齐同一运行内容的动作与截图配对。

回执 SHA-256：`0ed4050972c3391329c1a83757270bc49915d043aab3ada12f0b02204e606990`。原始回执位于 `.run/map-performance/phase601-compatibility-matrix-20260920T203036Z/earth_vein_cave_visual_v1/performance-runner-receipt.jsonl`，报告和逐次明细位于 `.run/phase601-performance-audit/evaluation.json`；构建器只将输出目录改到临时证据区，没有改阈值或候选 manifest。

首轮 `phase601-compatibility-matrix-20260920T201303Z` 的 48 个样本和未放宽门槛的评估均通过。随后战斗录制入口正确拒绝了陈旧工具指纹；核对变更后，仅更新三个渲染日志校验函数和一个模块说明的精确哈希。共享录制模块参与批次来源绑定，因此首轮保留为历史，最终结果使用修正工具指纹后整轮重测的数据。两轮的游戏运行内容指纹均为 `cbef22fa…`。

### 战斗、画面与工具

- 原生 10v10 战斗在 VSync=1 下完成 25 次跨帧左键和 8 次精确切换目标，21 个门槛全部通过。静止／指令／目标切换约为 `60.006 / 59.998 / 60.002 FPS`，`processTotal` 中位数为 `0.0585 / 0.096 / 0.0835ms`，战斗绘制中位数为 `1.544 / 2.4425 / 2.382ms`。无 HUD 重叠或点击穿透；起止焦点均有效。这是隔离的 20 单位战斗场景，不是五真人联机或五账号守护战。
- 四层完整片 `64.4s / 1932` 帧、F4 地标片 `8.333333s / 250` 帧通过原生／MovieWriter 九段配对，分辨率均为 `1280×720 / 30fps`。检查联系表和 F4 原始截图，四层美术、人物尺寸、遮挡和 HUD 保持。此为离线录制与截图证据，不替代前台性能或完整人工试玩。
- 10v10 画面片 `13.533333s / 406` 帧通过，检查完整战斗截图与联系表，20 个单位、场景和指令界面正常。
- 交易所原生预检、MovieWriter、转码、完整解码及摘要通过；最后复核修正了原生摘要误标为 MovieWriter 的字段并完整重跑，原生明确为 `disabled`、录片为 `1280x720@30fps`；`23.133333s / 694` 帧，原生 9 次点击，隔离档案、未连接后端。
- 旧地图面板录制器已修复隔离 API，但真实预检仍因 Firebud prepared visual 不存在而失败：它固定使用 `firebud_village_gate`，当前正常地图目录只有 Mistcap。这是旧验收场景的适配缺口，不能通过启用未接受的 Firebud 候选绕过。本次保留失败回执，状态为 `cleaned_after_trusted_product_failure`，不宣称地图面板整条录制通过。

客户端解析、地图、相机、点击寻路、外观、战斗计时与反馈 `7/7`。最终定向 Python 工具测试 **396/396**（43.721 秒）通过。初次组合调用因未把 `tools/test` 加入导入路径，漏载了批次测试模块；该调用保留为失败记录，使用完整 `PYTHONPATH=tools:tools/test` 后整组重跑通过。所有上述原生／录制进程均使用官方隔离通道；成功和失败退出均回收进程并清理通道，真实玩家目录摘要保持 `0f5c509b…`。无全量服务端／CI；没有服务端逻辑、协议或数据库修改。

### 复现入口与证据

以下命令在仓库根目录执行，原生工具使用唯一 `--run-id` 和本机已配置的 Godot 路径。396 项工具回归的完整选择器为：

```sh
PYTHONPATH=tools:tools/test python3 -m unittest \
  tools.test.test_record_pet_codex_awakened_owner_review \
  tools.test.test_record_earth_vein_review_batch \
  tools.test.test_capture_map_awakened_perf \
  tools.test.test_record_pet_fusion_main_owner_review \
  tools.test.test_map_visual_evidence_builder \
  tools.test.test_record_battle_outcome_owner_review \
  tools.test.test_record_hang_matchmaking_owner_review \
  tools.test.test_godot_qa_user_data_lane \
  tools.test.test_record_firebud_v2_owner_review \
  tools.test.test_capture_battle_layout_perf \
  tools.test.test_record_map_visual_action_captures \
  tools.test.test_run_map_visual_performance_evidence \
  tools.test.test_record_pet_fusion_closed_review \
  tools.test.test_record_map_awakened_owner_review \
  tools.test.test_record_market_awakened_owner_review \
  tools.test.test_record_hang_matchmaking_world_hud_owner_review \
  tools.test.test_run_firebud_v2_performance_evidence \
  tools.test.test_record_commerce_awakened_owner_review \
  tools.test.test_record_battle_layout_owner_review \
  tools.test.test_record_pet_management_owner_review \
  tools.test.test_install_firebud_computer_use_evidence \
  tools.test.test_map_performance_batch
```

原生与客户端检查入口：

```sh
node tools/run_godot_auto_checks.mjs --only=--auto-map-visual-runtime-check,--auto-camera-check,--auto-camera-click-check,--auto-character-runtime-appearance-check,--auto-battle-visual-timing-check,--auto-battle-feedback-check --fail-fast --output-dir .run/godot_auto_checks/phase601-compatibility --timeout-ms 180000
python3 tools/capture_battle_layout_perf.py --run-id <unique-run-id> --godot <godot-path>
python3 tools/record_earth_vein_review_batch.py --run-id <unique-run-id> --godot <godot-path>
python3 tools/record_battle_layout_owner_review.py --run-id <unique-run-id> --godot <godot-path>
python3 tools/record_market_awakened_owner_review.py --run-id <unique-run-id> --godot <godot-path>
```

本机证据入口：

| 内容 | 忽略目录下的证据 |
| --- | --- |
| 战斗性能 | `.run/evidence/phase403_battle_layout_perf/phase601-battle-perf-20260920T202134Z/summary.json` |
| 四层与 F4 画面 | `.run/evidence/earth_vein_cave_visual_v1_owner_review/phase601-cave-visual-20260920T202214Z/summary.json` |
| 战斗画面 | `.run/evidence/phase403_battle_layout_owner_review/phase601-battle-visual-20260920T202407Z/summary.json` |
| 旧地图场景失败 | `.run/evidence/phase399_map_owner_review/phase601-map-recorder-20260920T202537Z/failure-summary.json` |
| 交易所录制 | `.run/evidence/market_awakened_owner_review/phase601-market-recorder-20260920T204148Z/summary.json` |
| 来源、清理和字节复核 | `.run/phase601-working/verification-summary.json` 与 `sha256-manifest.json` |

Computer Use 的有界原始转录为 18 次调用、6 张图、零工具错误，SHA-256 为 `b85e9e673e7dbc8859aa4e50f0d64b1b10f56422da5c9fbc740a7df0b6782e8e`。这些操作用于启动可见测试窗口和观察画面，不能称为人工走完洞穴。原始转录及索引保存在 `.run/phase601-working/`。

## 交付边界

当前运行指纹 `beastbound-map-runtime-surface-v2:cbef22faa06579f683a8a9778395442b61057f0f0744584f86da44a55cf5cf09`。正式源码配对动作证据和所有者接受仍待完成；P2.1a／R1.W024 保持未勾选，107 项已有地图候选修改原字节保留。本轮数据保存在忽略目录，没有覆盖旧失败回执或旧正式证据。

`.run/` 下的诊断脚本是本机证据，不是克隆仓库自带工具；重测使用新的唯一目录。
