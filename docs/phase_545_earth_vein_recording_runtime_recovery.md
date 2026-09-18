# Phase 545：恢复岩脉洞穴实机录片与动作取证

日期：2026-09-18。来源：统一开发目录后继续生产路线 R1.W024，实际执行此前仅做过静态验证的低打扰录制器。

## 当前结果

已在统一主目录完成一轮真实 Main 原生截图及 MovieWriter 连续录像。四层各有静止和移动两段，另有顶层双共鸣台片段；两个进程各自九项 PASS。视频为原生 1280×720、30 FPS、1× 动作速度：四层片 64.4 秒 / 1932 帧，顶层片 8.333 秒 / 250 帧。音频使用 Dummy 隔离，不把本轮静音片作为混音验收。

正式录像目录：`.run/evidence/earth_vein_cave_visual_v1_owner_review/r1-w024-unified-main-20260918-v6/`。

| 产物 | 相对上述目录的路径 | SHA-256 |
| --- | --- | --- |
| 四层连续片 | `four-floor/earth-vein-cave-v1-owner-review-1x.mp4` | `b357798025963aca9851b357f5a6aa48ecd48fc376397f48fb1de88d3ad20d1e` |
| 顶层双地标片 | `landmark/earth-vein-f4-landmarks-1x.mp4` | `e3ab5a12b4e069c896e81638fc69512bd19dd37fbd088c19dc27137ec7efd21f` |
| 总报告 | `summary.json` | `f00e5b13bad9bb306f12423398d718130be391ef1e38bc555598938845f51009` |

本地证据保持在忽略的 `.run/` 中，`SHA256SUMS` 覆盖保留的源录像、原生 PNG/JSON、过程日志、导出媒体和摘要。它们不是产品源文件，也不能因本记录存在就认定已经分发或发布。

## 实机暴露的问题与修复

1. **JSON 数字与容器比较。** Godot 解析 JSON 后将数字读为 float；与手写整数数组/字典直接比较，会拒绝合法的 1280×720 viewport 和单窗口动作计划。录片与动作入口现逐字段检查精确数值和类型，接受语义一致的 int/float，仍拒绝小数偏差、字符串、bool、未知字段及错误进程数。没有通过取整掩盖输入错误。
2. **原生主窗口初始化。** Godot 4.7 不允许隐藏 root Window。录片入口改为初始化时最小化同一个原生窗口，隔离完成后恢复；两次切换均等待 macOS 实际状态，有 8 秒上限。各阶段继续验证单窗口、单 Main、窗口身份和 Dummy 音频，失败不继续采集。
3. **跨进程绝对帧号。** 原生与录像进程的窗口/渲染准备时间不同，不能要求两者绝对开始/结束帧相同。现在分别严格校验各自范围、顺序、计数和最终边界，再比较每段时长、停留帧、地图、起终坐标和物件合同。输出同时保存两个绝对范围；裁片只使用录像进程自己的范围。原 AVI 实际帧数仍必须精确等于录像进程终点加最后一帧。
4. **旧资源导入缓存。** 主目录旧 `.godot` 缓存曾把现有 Firebud v2 atlas 读成旧尺寸。通过隔离 QA 的 Godot 编辑器导入刷新当前资源后，严格地图目录检查恢复；未改 atlas 源图或降低尺寸校验。
5. **动作回执的退出时机。** Godot 在退出前输出动作结果，无法在该行证明自己的窗口已经关闭。Python 原先要求这里出现关闭计数，导致 20 个动作全过后仍失败。现在由父进程确认正常退出、进程组回收和 QA lane 清理后派生关闭计数；任何非零退出、未回收或残留进程仍拒绝通过，未向引擎回执虚填未来结果。

测试入口只在 `main.gd` 注册 `--auto-earth-vein-review-contract-check` 并薄转发到独立 QA 模块，没有向主入口增加玩法领域。QA lane 的源码指纹随这两处注册变更更新，玩家模式启动行为不变。

## 录像验证

成功批次使用一个持续原生窗口和一个持续 MovieWriter 窗口，每个窗口只加载一次真实 Main。九段实际内容帧数两边均为 `109, 121, 109, 147, 109, 147, 109, 121, 250`。四层视频另为每段追加 120 帧静止查看，不改变动作播放速度；地标片的 120 帧停留在原进程中采集。

原生进程终点为 1593，录像进程终点为 1488；后者原 AVI 实测 1489 帧，精确满足终帧合同。全部片段、合并视频与地标片均通过 ffprobe 帧数/分辨率/帧率校验及完整音视频解码。native/movie 的动作、地图和 build/harness identity 一致；两轮中途未修改取证来源。

启动、全部阶段和结束均完成资源身份检查。QA lane 已清理，真实玩家目录前后摘要一直为 `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`。失败尝试保留日志；Main 尚未建立时被拒绝的隔离目录，在确认对应进程退出后通过 owner 绑定的官方 cleanup 清理。没有手删玩家目录或改写玩家档案。

本轮先后有失败诊断尝试，不能把成功批次的“两次窗口生命周期”表述为整轮调试总共只开过两个窗口。

## 自动动作矩阵

修复动作计划读取与退出回执问题后，以一个持续 Main 窗口完成四层 × `pointer / movement_path / warp / collision / occlusion` 共 **20/20 PASS**。每项都有独立的原生 1280×720 PNG 和 capture JSON，窗口关闭计数由真实进程回收和隔离目录清理证明。

```sh
python3 -B tools/record_map_visual_action_captures.py --bundle-id earth_vein_cave_visual_v1 --scratch-only --run-id r1-w024-unified-main-actions-20260918-v3 --godot /Users/fander/projects/Beastbound_Odyssey/.run/computer_use/BeastboundReview.app/Contents/MacOS/Godot
```

结果：`.run/evidence/map_visual_action_captures/earth_vein_cave_visual_v1/r1-w024-unified-main-actions-20260918-v3/capture-matrix.json`。本轮使用 scratch 模式，验证新工具与实际操作行为；没有覆盖 bundle 中的旧正式动作对、Computer Use 回执或所有者证明，也没有把自动输入标记为人工操作。

## 命令与回归

```sh
python3 -B -m unittest tools/test/test_record_earth_vein_review_batch.py tools/test/test_record_map_visual_action_captures.py
python3 -B tools/godot_qa_user_data_lane.py source-check
node tools/run_godot_auto_checks.mjs --only=--auto-earth-vein-review-contract-check --fail-fast --output-dir .run/godot_auto_checks/earth-action-json-contract-20260918
python3 -B tools/record_earth_vein_review_batch.py --run-id r1-w024-unified-main-20260918-v6 --godot /Users/fander/projects/Beastbound_Odyssey/.run/computer_use/BeastboundReview.app/Contents/MacOS/Godot
```

- Python 录片/动作回归：63/63 PASS，包含进程帧偏移可不同、内容时长不可漂移、原 AVI 和输出视频帧数严格匹配。
- Godot parse 与 JSON 合同检查：2/2 PASS，实际 Godot 运行 82 个合同案例。
- 统一后的客户端定向检查：8/8 PASS，覆盖解析、录片合同、地图运行目录、移动、寻路、切图、相机点击与音频。
- Godot 自动检查 runner 回归：56/56 PASS；QA source-check PASS。

## 尚未关闭的生产门槛

R1.W024 继续进行，不能仅凭两支视频和 scratch 动作矩阵完成整项。还需要同一精确候选的正式动作证据安装、当前 Computer Use 操作回执、重复静止/真实移动性能及路线、遭遇、战斗切换证据。自动输入和截图不得冒充 Computer Use，旧回执不能重新标为本轮操作。

现有重复性能工具按四层 × baseline/candidate × idle/moving × 至少三次重复运行，会形成 48 次进程启动；本轮没有直接执行这组可见窗口。后续应先收敛为集中验证流程，不能恢复逐项弹窗，也不能把固定帧率录像当作性能证据。

R1.W025 的完整受委托美术复验尚未执行。已检查本轮四层缩略板、入口和顶层原生帧，可用于展示当前开发效果；这不是正式美术接受。候选始终保持 `owner_review_pending`、`releaseApproved=false`、`runtimeEnabled=false`，无所有者签署、无 promotion，生产发布继续 BLOCKED。
