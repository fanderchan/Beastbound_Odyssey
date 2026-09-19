# Phase 581：连续洞穴试玩与战斗结算点击修复

日期：2026-09-20。继续 R1.W024。修复真实鼠标确认战斗结算时的地图点击穿透，以及专用试玩入口换层后退回网格／默认人物比例的问题；复用现有普通遭遇候选素材，让后续房间的 HTTP 测试队友继续提交指令。未修改正式素材发布状态、怪物数值、遇敌概率、奖励或生产服务器。

## 真实输入修复

录制中两次点击逃离结算的“确定”，都额外触发世界移动，一次还再次遭遇敌人。`Main._input()` 在 GUI 按钮处理前检查 `PanelRegistry`；结算面板已经创建，却漏在 `set_input_blockers()` 的注册列表之外。

修复仅将现有 `battle_result_panel` 加入同一份拦截清单。沿用 Phase 201 的左键／右键边界，不改面板文案、布局或关闭规则。隐藏后的面板继续不拦地图，未增加每帧状态计算。

独立的 `battle_result_input_check.gd` 接入既有 `--auto-panel-registry-check`。对胜利、失败、逃离三种结算各注入内容区左键、确认按钮右键、确认左键和关闭后的地图左键，合计 **12 次跨帧按下／松开**。检查位置、朝向、移动接收数、寻路解析／应用数、待处理目标和自动移动状态，而非直接调用按钮回调。旧代码实际失败，登记面板后通过；测试自身也清理每次“关闭后地图点击”产生的移动目标，避免污染下一种结算。

原生复验先在三层 `(13,14)` 确认结算，人物位置保持不变；后续保留美术的连续试玩又在 `(11,15)`、`(7,18)` 重复确认，均只关闭弹窗。修复前的连续录制保留在 `.run/guardian-review/20260919T193227.647942Z/`，1280×720、30 FPS、452.2 秒，已完整转码和解码校验；不是修复后的验收视频。

## 换层美术与普通遭遇

核查一至三层的普通遭遇组均使用 `mossback_sunbaked_earth6_fire4`。该形态已有两视角、12 动作、180 帧候选战斗素材，仍为 `in_production / runtimeEnabled=false`；世界／骑乘方向素材未产出。原守护战专用入口只启用四种队友素材和守护背景，因此普通遭遇仍显示占位画面。

新增显式 `--cave-journey`：在官方 QA 数据隔离目录内启用这套现有战斗素材，并仅根据服务器房间 `party_pve` 和四个确切洞穴地图 ID 选择已有洞穴背景。普通启动、其他地图、PvP、非法房间结构以及只有客户端地图字段的状态均不能获得该资格。没有替换形态、改怪物池或将候选标记为正式发布。

真实换层还复现了与用户截图相同的网格和人物变小：试玩入口旧的 `encounters-on` 文件控制将 `map_art_review_preview` 置为 false，新楼层便重新加载网格并使用默认缩放。联网移动本来就会接收服务器遇敌票据，完全不需要这个切换。现已删除错误的 `encounters-on/off` 控制，持续保留候选地图和相机策略；普通离线视觉检查仍按原规则避免随机遇敌。原生连续试玩已确认四层、三层、二层世界场景均为 `earth_vein_cave_visual_v1 / active=true`，相机保持 `1.52×`，同时正常触发服务器普通遭遇。

```sh
python3 tools/play_guardian_review.py --cave-journey --timeout-seconds 1200
python3 tools/play_guardian_review.py --cave-journey --record --timeout-seconds 1200
```

入口仍从四层开始，一个真实 Main 加四个 HTTP 测试队友；可先挑战守护兽或直接选楼梯。`--autoplay` 会在守护战后退出，故不能与连续人工试玩模式同用。生命值持续按真实结算消耗，不自动回血或强制胜利。该夹具故意保留主角 520 HP、队友 1040 HP 的既有倒地测试配置，不构成平衡验收。

## 连续房间修复

测试后台原来在第一次房间关闭后永久停止提交后续指令。现在按房间 ID 跳过已经关闭的房间；一次指令刚好结束当前房间时，也不会继续向该房间的旧角色提交。`closed-rooms.ndjson` 保留所有关闭事件，原 `closed-room.json` 继续表示最后一场。

新增真实 HTTP 回归：完成守护战，接受三步权威移动并领取服务器遇敌票据，再进入三层普通遭遇。第二场必须收到队友指令、正常结算，并保留两份独立关闭记录。用旧实现能复现停止出招，修复后通过。该单元测试注入确定性遇敌随机源；原生试玩仍使用服务器默认随机源，没有固定结果。重复挑战同周期守护兽会正确拒绝重复奖励，因此回归没有用重复守护挑战代替普通遭遇。

## 验证与性能

```sh
node --test tools/test/guardian_review_backend.test.cjs
python3 -m unittest tools/test/test_play_guardian_review.py
node --check tools/guardian_review_backend.cjs
node tools/battle_action_catalog_check.mjs
node tools/run_godot_auto_checks.mjs --only=--auto-map-visual-runtime-check,--auto-server-battle-target-mapping-check,--auto-server-battle-boss-replay-check,--auto-rebirth-cave-guardian-check --fail-fast --output-dir=.run/godot_auto_checks/phase581-cave-journey
node tools/run_godot_auto_checks.mjs --only=--auto-panel-registry-check,--auto-mouse-click-check,--auto-map-panel-check,--auto-battle-command-awakened-ui-check --fail-fast --output-dir=.run/godot_auto_checks/phase581-result-fixed --timeout-ms=180000
node tools/run_godot_auto_checks.mjs --only=--auto-encounter-check,--auto-map-visual-runtime-check --fail-fast --output-dir=.run/godot_auto_checks/phase581-visual-continuity --timeout-ms=180000
```

Node **3/3**、Python **3/3**；三组 Godot 含解析分别 **5/5、5/5、3/3**。宠物设计目录审计无错误／警告，战斗目录 34 个主动动作、10 个被动、36 形态通过。首次输入回归真实失败，后续修复及夹具清理后通过；一次误写的检查名称被 runner 在启动前拒绝，不计通过。

变更前与结算修复后的二层真实 Main 分别运行静止／移动各三次，均使用官方隔离目录；每次预热 180 帧、采样 480 帧。六个移动样本各有 60 次跨帧点击、120 个事件，60 次被接收、投影错误为零、最终位置一致。完整脚本区段均值的中位数为静止 **0.028250→0.027875ms**、移动 **0.057625→0.056625ms**，未见此次登记变更造成可辨认退化；这是顺序执行的 headless 对照，不宣称原生绘制或 CPU 获得同等改善。

这次没有更改地图绘制与正式性能阈值，Phase 579 的完整原生矩阵 FAIL 继续有效；没有用上述小范围回归覆盖它，也未运行不相关的全量 CI。

## 原生证据与剩余范围

运行代码基于 `46daf538427accde49429137dae4af1bc1933653`，结算修复后的地图运行指纹为 `beastbound-map-runtime-surface-v2:23ad38ddd5d6e079f6d0f7bd5960e3e24e30e75d552a54b1d5ca1f5be271033c`。实际 QA 入口和工具的逐文件源码哈希另存于每次原生观察目录，不以地图指纹代替整个录制脚本身份。

确认按钮的第一次原生复验为 **9 次调用、8 张图片、零工具错误**，原始记录 SHA-256 `7baab7ea6b44ea0859eb7a75fc71a0510994890faadd94895c093abe7dee29de`。保持美术的连续试玩为 **24 次调用、23 张图片、零工具错误**，原始记录 SHA-256 `31f693e29d11fe7536dcd0bae8f1bc51dd7ca47dadc5285903401b582492c456`。两次均核对运行前后相关源码哈希一致。

连续试玩确切完成 **F4→F3→F2**，三层两次普通遭遇均真实逃离，服务器各在第二回合关闭房间。二层第三场中，低生命主角倒下，改用游戏内自动战斗后，服务器在第 13 回合结算战败；但客户端停留在第 8 回合 `server_waiting`，没有显示最终结算或返回记录点。再次以同一账号只读请求 `/battle/state` 仍返回该房间 `closed / defeat / round=13`。这是真实客户端同步缺口，尚未定位根因，不能描述为动画仍在播放或完整返回通过。一层与步行出洞未完成；失败状态保留后才正常结束测试进程。

本机录制和原始鼠标材料分别位于 [确认复验](../.run/phase581-result-native/) 与 [连续试玩](../.run/phase581-continuous-native/)。后者的 [核对摘要](../.run/phase581-continuous-native/verification-summary.json)、[最终客户端状态](../.run/phase581-continuous-native/final-client-state.json) 和 [服务器回读](../.run/phase581-continuous-native/server-state-readback.json) 共同保留上述不一致；原生运行在 `.run/guardian-review/20260919T195324.687706Z/`。headless 前后对照在 `.run/phase581-world-before/` 与 `.run/phase581-result-world-after/`。这些是开发诊断／试玩材料，未安装到正式美术 bundle。

连续试玩的原速 MP4 为 **1280×720、30 FPS、1173.266667 秒／35198 帧**，完整解码通过，SHA-256 `466c64994cc67ffe995ce052a2d72f1197c90590f6199913ee160841dd91bab1`。所有本轮客户端、内存后台和官方 QA 隔离目录均已正常结束；真实玩家目录哈希不变，原有 107 项候选修改、111 项保护文件逐字节保留。用户原先打开的 Godot 进程未动。

R1.W024、P2.1a 和所有者接受仍待完成。下一步优先复现并修复主角／战宠失去行动资格后的结算同步，再继续完整返回路线、当前精确截图配对、正式性能和成品门槛。守护战成功、普通遭遇素材可预览、输入回归通过是不同范围的结果，不互相替代。
