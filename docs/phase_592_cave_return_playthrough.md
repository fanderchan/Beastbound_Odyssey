# Phase 592：守护战到火芽村的连续自动回归

日期：2026-09-20。继续 R1.W024。本阶段补齐真实 Main 的自动连续返程：守护战胜利 → 三层 → 二层 → 一层 → 火芽村，途中三场普通遭遇均正常胜利。新增代码只在专用 QA 入口执行，不修改玩法、地图、资产、运行热路径或验收阈值。

## 自动回归入口

`play_guardian_review.py --autoplay --cave-journey` 现在可以组合使用。新增 `cave_journey_playthrough.gd` 复用既有守护战检查，再用正常小地图目标、结算确认和战斗“自动”按钮完成返程。按键通过 viewport 跨帧发送，不调用传送、直接结算、补血或本地战斗推进函数。每次导航目标来自当前地图的既有 warp 数据；遭遇中断导航后重新点击原目标。

沿用 Phase 590 的隔离路线队伍：启动监听前，五个人物当前／最大生命设为 10400；战斗中照常扣血，不自动恢复。这是一次性内存后端、一个 Main 和四个 HTTP 驱动账号，不是正常难度、五真人联机或正式发布。

`guardian_review_journey.py` 独立核对自动报告、连续 Main 状态和服务器房间结果：

- 五张地图必须按顺序出现，不可跳层；洞穴四层保留候选贴图及 1.52× 镜头。
- 输入必须跨帧；必须包含守护战及至少一场不同房间的普通遭遇。
- 普通遭遇的地图必须匹配服务端 entry；逃跑、失败、超时不能冒充胜利返程。
- 继续执行已有的逐回合播放、战场纹理、单连接及完整绘制检查，结果明确 `computerUse=false / performanceEvidence=false`。

## 实际结果

原生 Godot 4.7／Metal／1280×720，运行基线 `8591bd76d7536985386fcdd7bf1f3053cc9a1edf` 加本阶段 QA 改动。运行期间冻结的 663 个客户端／服务端／工具源码文件逐字节不变。

| 项目 | 本轮结果 |
| --- | --- |
| 返回路线 | 四层 → 三层 → 二层 → 一层 → 火芽村 |
| 战斗 | 守护战及三场普通遭遇全部胜利，无逃跑／超时 |
| 回合播放 | 服务端 55 次结算，Main 55 次开始／55 次完整结束，零漏播和重复 |
| 输入 | 28 次跨帧点击 |
| 洞穴人物完整轮廓高度 | 122.573–124.762px，四层镜头均为 1.52× |
| 战场 | 1031 次战斗采样，包括 42 次关闭房间播放采样，均有正确背景及已准备纹理 |
| 连接 | 1168 次 ready 观察，单连接、零重试／拒绝／心跳失败 |
| 五份权威档案 | 各 revision 102 → 106、地之戒 +1、整条路线石币 +1528 |

已实际查看本轮守护战、普通遭遇、一层楼梯和村口截图，未见洞穴换层退回网格或人物缩小。火芽村沿用自身 1.82× 镜头和现有待审素材；完成返回不代表村口美术已接受。

原始输出：[完整运行目录](../.run/guardian-review/20260920T152939.668848Z/)、[一层](../.run/guardian-review/20260920T152939.668848Z/journey-earth_vein_cave.png)、[普通遭遇](../.run/guardian-review/20260920T152939.668848Z/journey-battle-02.png)、[返回村口](../.run/guardian-review/20260920T152939.668848Z/journey-firebud_village_gate.png)、[核对摘要](../.run/phase592-auto-journey/verification-summary.json)。

[完整原速录像](../.run/guardian-review/20260920T152939.668848Z/guardian-1x.mp4) 为 `625.533333s / 18766 frames / 1280×720 / 30 FPS`，源时间线、音视频时长和全片严格解码均通过，SHA-256 `4032f6478c37cfafa7069939e9fb2ea13295e69ed61a7b57a46b180018a8abd2`。这是自动操作录像，不是前台性能证据。

## 初次报告误判及原始证据保留

首次原生流程完成并生成 `autoplay.status=passed` 后，新增 Python 验证器因 `1.51999998092651 != 1.52` 的直接浮点比较报错。Godot Vector2 的 float32 表示没有改变目标比例。补充该真实数值的红色测试后，比较改为绝对误差 `≤0.000001`；`1.5201`、错误比例、NaN 和缺失值继续拒绝。这不是放宽性能或美术门槛。

原 `cleaned_after_trusted_product_failure` 生命周期保持原样。修正后对**同一份未改写的原始记录**重跑全部报告验证，另存核对摘要，再由既有严格编码器生成视频；没有把原失败伪装成首次启动通过。期间唯一源码差异为离线 Python 验证器，客户端、服务端和自动操作脚本未变。真实玩家目录、111 项保护文件及原有 107 项候选修改均保持原字节。

## 尚未完成的实机与性能门

本轮先尝试真实 Computer Use：6 次调用／2 张原始图片，两次点击都返回 `noWindowsAvailable`，执行窗口暴露的 Raise 后仍失败。因此没有人工点击通关，记录在 [人工尝试](../.run/phase592-cave-journey/attempt.json)，原始工具记录 SHA-256 `f0050aa9c4f20d21e6d38515c39bb3a1e3c8a31514a9cb747838b2a6a7465bcc`。测试客户端与后端均已正常清理，原有用户 Godot 进程未动。

遮挡优化的独立探针还确认：当前 Godot 的 `Sprite2D.item_rect_changed` 不覆盖翻转、region 切换和同一纹理对象尺寸变化。仅依赖该通知会使既有遮挡缓存失效不完整，故没有采用，也没有更改现有 Player／WorldDepthLayer。探针和 13 项操作结果见 [信号实测](../.run/phase592-sprite-signals/report.json)。Phase 579 静止增量 FAIL 继续有效，本阶段没有重新跑无源码变化的性能矩阵。

## 验证命令

```sh
node tools/run_godot_auto_checks.mjs --parse-only
python3 -m unittest tools/test/test_guardian_review_journey.py tools/test/test_play_guardian_review.py tools/test/test_guardian_review_media.py
python3 tools/play_guardian_review.py --godot '.run/phase584-native-review/Beastbound QA.app/Contents/MacOS/Godot' --autoplay --cave-journey --record --timeout-seconds 1800
python3 .run/phase592-auto-journey/validate.py
git diff --check
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
```

解析 1/1、Python 14/14，路线验证包含 19 种失败输入及 float32 正例。原生流程与原始证据重验证结果如上。只改 QA 代码，未运行全量服务器／本地 CI，也未把这些结果作为运行时性能收益。

后续继续正式静止性能问题、当前 Computer Use 完整返程及五类动作证据配对，再进入 R1.W025 受委托复审和所有者美术接受。P2.1a／R1.W024 保持未完成。
