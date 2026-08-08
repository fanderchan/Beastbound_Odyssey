# Phase 399：觉醒式正式地图页与真实 Main 连续验收

## 参考意图与原创边界

- 本阶段回应项目所有者提供的《石器时代：觉醒》地图参考，提炼三层成熟信息架构：世界 HUD
  中可发现的地图入口、当前地图的大图与地点目录、世界地图的区域选择与楼层自动寻路。
- 参考图只用于判断入口位置、全屏层级、当前／世界切换、地点列表、区域热点和关闭恢复世界的
  交互关系。Beastbound 没有复制参考截图的像素、岛屿轮廓、地名、角色、图标、商标或地图；
  九区世界 atlas、热区、文字、图标和棕金界面均为本项目原创实现。
- 本阶段不新增地图、传送点、等级、任务、奖励、遭遇或服务端协议。跨图寻路复用 Phase 396
  冻结的 `MapRoutePlanner`、真实 warp 图与 continuation，不在界面中另造一套路线事实。

## 玩家可见合同

### 世界入口与当前地图

- 普通世界 HUD 保留正式“地图”入口；左键打开覆盖完整 `1280×720` 的正式地图页。进入战斗
  时整个世界入口层隐藏，因此玩家不能在战斗中继续打开地图。
- 地图页每次打开都复位到“当前地图”，而不是沿用上次停留的世界区域。顶部显示地图名和
  当前坐标，右上使用项目既有正式橙色 `X`；关闭或成功提交路线后恢复原 World HUD 与右下
  功能栏。
- 当前地图主画面消费真实 `map_visual_render_state` 和世界边界，以 prepared visual 显示正式
  等距地图；侧栏按真实 interaction／encounter target 生成地点目录。点击地点通过既有
  `PanelFlowCoordinator` 关闭地图并形成真实目标格与自动寻路，不使用录像专用假按钮。

### 世界地图与跨图路线

- “世界地图”显示原创彩色 atlas 和精确 `9` 个非 GM 权威区域：火芽村、火芽村外训练区、
  四大洞穴、玄影洞窟、等级草丛试验场、雾帽湿地、裂日荒原、风镜高地和九大庄园。
  `map_regions.json` 仍是区域 ID 权威来源；GM 区域不会出现在玩家 atlas。
- 选择区域后，右侧只展示该区域已有的入口、楼层和推荐等级。玄影洞窟示例可从一层继续选择
  二层到顶层；“前往区域入口”和楼层路线都是稳定真实按钮，不把列表文案伪装成可点击热点。
- 从火芽村选择“玄影洞窟二层”时，正式路由为
  `firebud_village_gate → shadow_oath_cavern → shadow_oath_cavern_f2`；首段 pending warp 保留完整
  `routeMapPath`，`routeContinuationTarget.mapId` 指向二层。路线有效时地图页立即关闭并恢复世界；
  无路线时操作 fail-closed 并保留地图页供玩家重选；战斗中则拒绝打开地图，不提交不存在的目标。

## 实现边界

- `MapAwakenedPresenter` 只把当前地图目标、九区目录、入口／楼层和等级范围整理为有界状态；
  `MapAwakenedPanel` 负责正式控件、atlas 热区、prepared local visual 与左键；
  `PanelFlowCoordinator` 只做既有地图／路线／面板生命周期接线。
- `main.gd` 的验收改动仅为与既有 owner-review capture 同型的最小 wiring：一个 preload、一个
  bool、识别录像／性能两个开发参数的 `is_flag`、deferred dispatch 和一行 runner。它没有增加
  产品状态、路线规则、每帧逻辑或网络写路径。
- 捕获脚本只在专用 `--map-awakened-owner-review-capture` 或
  `--map-awakened-owner-review-perf` 开发参数下运行；普通玩家界面不显示 QA、调试、阶段号、
  raw map ID 或 agent 文案。

## 资产来源与审计

- 世界 atlas 位于
  `client/godot/assets/ui/map_awakened_v1/runtime/world_atlas_background_v1.png`，由 OpenAI 内置
  ImageGen 为本项目原创生成；逐字提示、权属、替换流程和机器清单分别保存在同包
  `source/prompts/`、`source-and-ownership.md` 与 `asset-manifest.json`。
- atlas 为 `1568×1003`、RGB8、无 Alpha、`2,777,702` 字节，SHA-256：
  `ebae9a0e3fe14f104062080f39788278c53b87b38e1932be25b49724ca3e3470`。
- `tools/audit_map_awakened_assets.py` 审计结果为 `status=passed`：`1` 个运行资产、`9` 个 manifest
  热区与 `9` 个非 GM 权威区域精确一致，跟踪的 `.import`／`.uid` 为 `0`。
- `runtimeEnabled=true` 只表示当前正式运行可加载；视觉仍为
  `ownerReviewStatus=owner_review_pending`，自动审计和本轮截图不能替代项目所有者观看后的主观
  接受。

## 自动验证

- `/usr/bin/python3 -m py_compile tools/record_map_awakened_owner_review.py
  tools/capture_map_awakened_perf.py tools/test/test_record_map_awakened_owner_review.py
  tools/test/test_capture_map_awakened_perf.py`：通过。
- `/usr/bin/python3 -m unittest tools.test.test_audit_map_awakened_assets
  tools.test.test_record_map_awakened_owner_review
  tools.test.test_capture_map_awakened_perf`：`17/17 PASS`；覆盖真实 Main 命令、拒绝 SceneTree
  旁路、A/V 合同、严格八章日志、6 次跨帧左键、9 区、prepared visual、跨图续行、battle
  隐藏、参考输入复制、对照板、性能状态顺序、样本／帧率／process 门限、同帧左键拒绝与摘要
  硬门。
- `godot --headless --path client/godot --quit`：解析通过。
- `node tools/run_godot_auto_checks.mjs --only --auto-map-panel-check --fail-fast
  --timeout-ms 180000`：`2/2 PASS`；最终回执
  `.run/godot_auto_checks/2026-08-08T06-49-27-894Z.log`。正式 Main check 另覆盖每次开页复位本地、
  prepared visual、atlas、精确 9 区、区域／楼层 getter、完整 route path、跨图 continuation、
  关闭恢复 HUD 和战斗隐藏入口。
- `git diff --check`：通过。未运行完整 local CI、真实联机多人路线或 MySQL fault injection；
  本阶段没有修改地图热路径、移动算法、服务端或数据库合同。

### 真实 Main 专项性能

- 独立性能包位于
  `.run/evidence/phase399_map_awakened_perf/phase399-final-perf-20260808-b/`；由真实
  `res://scenes/Main.tscn`、Metal Forward Mobile、`1280×720` 正常窗口路径运行，不使用
  MovieWriter、headless、SceneTree 脚本或同帧 helper。
- 最终命令为
  `/usr/bin/python3 tools/capture_map_awakened_perf.py --run-id
  phase399-final-perf-20260808-b --timeout-seconds 120`；runner 内部强制 `--scene
  res://scenes/Main.tscn --windowed --resolution 1280x720 --single-window` 与
  `--perf-probe --map-awakened-owner-review-perf`。
- 三个状态均先清空探针窗口再连续采样，统计采用后半稳态：idle `7` 个样本，稳态
  `28.5..30.0 FPS`、`process_total median/p95=0.170/0.180ms`；真实跨帧移动 `7` 个样本，稳态
  `45.8..52.8 FPS`、`3.575/7.720ms`；地图页压力 `11` 个样本，稳态 `29.5..31.5 FPS`、
  `0.255/0.280ms`。移动窗口包含持续改路和碰撞／遭遇检查，因此如实保留个别路径计算样本，
  不以 idle 数值替代 moving。
- 压力流程重复 `12` 轮“世界 HUD 地图入口 → 世界地图 → 玄影洞窟区域 → 当前地图 → 正式
  橙色 X 关闭”，每轮 `5` 次真实左键；与移动窗口合计 `69` 次
  `InputEventMouseButton`，`69/69` 按下／释放跨帧、移动接受 `9/9`、累计位移
  `583.40px`、UI 穿透到世界 `0`。每轮均复核 `prepared_visual=true`、精确 `9` 区与关闭后
  HUD 恢复。
- `summary.json` 的 `12/12` 性能／样本门禁全部通过；`godot-perf.log` 与 `summary.json` 的
  `SHA256SUMS` 为 `2/2 PASS`。日志／摘要／清单 SHA-256 分别为
  `5074ed79fbac850a59b3846bfc4a873b427c6f2f47a86e79fbd381634eef3e6f`、
  `ff122a1a697508eeab34e3840a582414c8fc94d6f00ba95178d59586cf05abc3`、
  `5deba7a116e098b72aae114f935ef67c76cc72adb9b2d040fda7f6914ccd1597`；最终日志无
  WARNING、ERROR、SCRIPT ERROR 或退出泄漏。

## 真实 Main 连续视频与设计 QA

- 最终视频：
  `.run/evidence/phase399_map_awakened_owner_review/phase399-final-20260808-c/map-awakened-owner-review-1x.mp4`；
- 联系表：
  `.run/evidence/phase399_map_awakened_owner_review/phase399-final-20260808-c/contact-sheet.png`；
- 三行参考／实机同屏：
  `.run/evidence/phase399_map_awakened_owner_review/phase399-final-20260808-c/reference-vs-implementation.png`；
- 结构化摘要：
  `.run/evidence/phase399_map_awakened_owner_review/phase399-final-20260808-c/summary.json`；
- 内层完整性清单：
  `.run/evidence/phase399_map_awakened_owner_review/phase399-final-20260808-c/SHA256SUMS`。

成片由真实 `res://scenes/Main.tscn` 与 Metal Forward Mobile 启动，共八章：世界 HUD 地图入口、
当前地图概览、当前目标寻路、世界九区概览、玄影区域详情、二层跨图路线、关闭恢复 HUD、战斗
隐藏地图。六次主操作全部由真实 `InputEventMouseButton` 左键完成，按下与释放跨帧，录像脚本未
直接 emit 按钮。

最终规格为 `22.933333s / 688` 帧、`1280×720 / 30 FPS / 1.00×`、H.264 `yuv420p`、AAC
48kHz 双声道；ffprobe 与 `ffmpeg -xerror` 音视频双流全片解码通过。MP4 SHA-256：
`b1b56f8fe3eafb2ed3cc9af46a40ef31a7a73af03042872eb62970a2572417ac`；联系表 SHA-256：
`cb91fbe999a3aa49fdcc822f18032236a06dd416dc10d071ff0b7aede57e1426`；参考同屏 SHA-256：
`707e3dac82cefca498ca5c953daf1235eb960709686ca491ab5f6774f1dc73f1`。

录制日志 SHA-256 为
`d65383a48d82ce0c457350ed3c7e507fa8973d7072f9a9d7602dfefc3968c87b`，没有 WARNING、ERROR、
SCRIPT ERROR 或退出泄漏；`SHA256SUMS` 的 `45/45` 条目复核通过，清单 SHA-256 为
`bde925fb059916e33c4fc21a6a4066b45b7249fcd7e780301dd9b7dec0157fca`。清单不包含完成验证后才写入
的 `summary.json`，因此摘要另以 SHA-256
`f33caf9aaf95c30c4c1bacf5ba6abd3eba73909fdeca9a03f343d466c2c6b11c` 单列锁定。

最终人工查看了 12 帧联系表、三张独立实机帧和三行参考同屏：本地 prepared 地图、右上正式
橙色 `X`、原创世界 atlas 的精确 9 区、玄影五层列表、关闭后的完整 HUD 和战斗中地图入口隐藏
均清楚可见；本阶段范围内 Design QA 为 `P0=0 / P1=0 / P2=0`。工程检查通过不等于所有者视觉
接受，最终摘要继续保持 `ownerReviewStatus=pending`。

## 证据诚实边界与残余风险

- 录像使用新鲜 `--user-data-dir`、`profile_save=false`、隔离 session；工具未启动后端、未访问
  MySQL，并在结束前确认所有捕获进程内 HTTPRequest 为断开态。摘要中的
  `httpRequests=false / serverWrites=0` 是隔离配置声明，不是传输计数器或服务端写入实测，不能
  据此声称生产网络零请求或数据库零写入。
- 独立性能包采用同样的新鲜 user data、禁档案保存和结束态 HTTP 断开，并明确记录
  `backendStarted=false`；这些仍只是隔离配置／结束态声明，没有安装请求计数器或服务端写入
  计数器，不能把性能摘要冒充真实网络零请求证明。
- 录像证明的是正式 Main、真实控件、真实跨帧左键、真实本地路线状态和战斗 UI 生命周期；它不
  冒充真人联网跨图、服务端位置 ACK、断线续行或多人同图容量验证。
- 联系表末段仍能看见 Phase396 已记录的灰色战斗地面与简化战斗角色；它不影响“战斗隐藏地图”
  合同，但仍是独立战场／角色／宠物美术发布阻断，不能借本阶段地图通过而关闭。
- 前两个试运行目录分别因 Main wiring 检查与章节边界校验失败而被 wrapper 拒绝；最终证据只认
  `phase399-final-20260808-c`。失败目录保留在 ignored `.run` 中作为 fail-closed 调试痕迹，不进入
  产品提交。
- `ownerReviewStatus=pending`：项目所有者尚未观看最终视频；本阶段不勾选 broad P2.1/P2.2。

final result: passed
