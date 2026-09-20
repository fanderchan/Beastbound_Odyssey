# 工具导航

所有示例从仓库根目录运行。完整路径列表见 [自动代码索引](../docs/reference/code-index.md)；不要因为一个工具文件存在，就假定它适合当前工作区或生产环境。

| 目的 | 入口 | 执行边界 |
| --- | --- | --- |
| 了解工作区与发布游标 | `node tools/repository_guide.mjs status` | 只读本地 Git 和计划，不 fetch |
| 更新代码/数据/Phase 索引 | `node tools/repository_guide.mjs refresh` | 只写两份 `docs/reference/` 索引 |
| 检查导航完整性 | `node tools/repository_guide.mjs check` | 不改文件；索引过期或指南链接目标缺失时失败 |
| 列出客户端检查 | `node tools/run_godot_auto_checks.mjs --list` | 仅发现注册项；真正运行前核对 `--help` 与本地 QA 前置 |
| 定向 Godot 检查 | [run_godot_auto_checks.mjs](run_godot_auto_checks.mjs) | 使用既有隔离 QA lane，live 项只连接一次性本地 QA 后端 |
| 真正的发布/阶段门禁 | [run_local_ci.mjs](run_local_ci.mjs) | 耗时较大；使用当前主目录的固定矩阵与参数，见测试指南 |
| 战斗动作目录校验 | [battle_action_catalog_check.mjs](battle_action_catalog_check.mjs) | 共享数据检查 |
| 本地服务启停/状态/备份 | [server-ops.js](../server/node/scripts/server-ops.js) | 通过 `npm --prefix server/node run ops -- ...`；不是测试数据清理器 |
| 宠物/NPC/地图/音频资产生产 | [仓库 Skills](../.agents/skills/) | 从领域 Skill 入口开始，遵守 bundle/provenance/所有者验收 |
| 岩脉洞穴四层和终层地标审片 | [record_earth_vein_review_batch.py](record_earth_vein_review_batch.py) | 一个持续实机窗口加一个持续录像窗口；只生成待审证据，不批准或发布资产 |
| 岩脉守护战联机试玩 | [play_guardian_review.py](play_guardian_review.py) | 一个真实 Main 客户端、四个 HTTP 测试队友；一次性内存后端、隔离玩家目录，可选原速录像 |
| 地图五类动作截图矩阵 | [record_map_visual_action_captures.py](record_map_visual_action_captures.py) | 一个持续 Main 窗口；先用 `--scratch-only` 检查，自动截图不能代替 Computer Use 回执 |
| 性能、容量、事务和集群专项 | 本目录 `p0_6*`、`run_*gate*` 等 | 先读最近对应 Phase；部分会启动进程、创建账号或写数据，不批量试跑 |
| 工具回归 | [tools/test](test/) | Node 与 Python 测试按修改范围选择 |

## 导航工具维护

```sh
node --test tools/test/repository_guide.test.mjs
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
```

导航工具没有额外 npm 依赖。它使用 Git 可见路径来排除本地忽略的制作档案与缓存；不会跟随符号链接读取仓库外文件。`status` 的本机绝对目录只打印到本地终端，不写入跟踪文档。

增加新的通用工具时，在此处登记它的用途和执行边界；增加普通领域工具时，至少在对应 Phase 中说明调用方式。操作说明见 [开发流程](../docs/development.md) 和 [测试指南](../docs/testing.md)。

## 岩脉洞穴审片

在集中审片时段串行执行，`--run-id` 每次使用新值。录片会打开真实客户端窗口；不使用旧的逐地图、逐片段启动流程。

```sh
python3 -B tools/record_earth_vein_review_batch.py --print-launch-contract
python3 -B tools/record_earth_vein_review_batch.py --run-id <new-run-id>
python3 -B tools/record_map_visual_action_captures.py \
  --bundle-id earth_vein_cave_visual_v1 --scratch-only --run-id <new-run-id>
```

两次审片进程各自记录精确帧范围；异步窗口和切图准备所用帧数可以不同。核对实际片段时长、动作及地图合同，导出只使用录像进程自身的帧坐标。失败目录保留用于诊断，不能手动补写 PASS 或把旧 Computer Use 回执当作新画面的实机操作证明。

`--scratch-only` 只写新 run 目录，不读取或恢复正式安装事务。正式模式会恢复未完成事务；已发布汇总或已回滚的事务保留为历史，不要求当前截图永远等于旧版本。汇总绑定、路径检查和未完成安装的字节校验仍严格执行，历史扫描成功不能代替当前资产审计。详见 [Phase 560](../docs/phase_560_map_capture_transaction_history.md)。

## 岩脉守护战试玩

```sh
python3 tools/play_guardian_review.py
python3 tools/play_guardian_review.py --record
python3 tools/play_guardian_review.py --record --autoplay
python3 tools/play_guardian_review.py --cave-journey --timeout-seconds 1200
python3 tools/play_guardian_review.py --downed-owner-check --record
```

需要本机 Godot 4.7；可用 `--godot /absolute/path/to/godot` 指定已有程序，录像额外需要 `ffmpeg` 和 `ffprobe`。入口固定使用官方隔离 QA lane、真实 `Main.tscn`、1280×720，以及仅监听随机回环端口的一次性内存后端，不连接正常 MySQL 或真实账号。四名测试队友通过正式 HTTP 接口保持在线并提交攻击／应对蓄力；这不等于五名真人联机或难度验收。

角色从四层守护台附近开始。左键小地图，选择「岩脉守护兽」，在对话中选择「挑战」；人物和宠物分别选择指令，也可点「自动」。测试角色及宠物为 Lv100，角色数值是明确的 QA 档案：主控人物生命 520，四名测试队友生命各 1040，用来观察主控倒下后宠物仍能作战的分支；这不是正常角色成长或难度结论。宠物由既有 GM 发放及逐级升级接口产生。场景、敌人、技能、奖励和结算使用现有正式规则。

关闭窗口会排空客户端资源并停止该后端；默认最长 15 分钟。启动时打印的 `.run/guardian-review/<timestamp>/` 保存生命周期、真实回合事件、结算前后档案和截图；`--record` 另生成 `guardian-1x.mp4`，不改变播放速度。`backend/fixture.json` 含临时会话，权限为 `600`，输出目录为 `700`；不提交或对外分享原始 fixture。

本入口显示指定待审宠物与战场素材，普通玩家开关保持关闭。录像和测试通过只形成待审候选，不代表老板已经接受这些精确美术文件。

`--cave-journey` 供连续人工试玩：在原有守护战预览之外，为岩脉四层的服务器权威 PvE 战斗启用现有洞穴背景，并为一至三层普通遭遇启用晒甲苔背兽的现有候选战斗动作。它仍从四层开始，可先挑战或直接选择楼梯下楼；不改变野怪种类、等级、遇敌率、奖励或素材发布状态，也不声明宠物世界／骑乘素材已经完成。此模式不能和会在守护战后退出的 `--autoplay` 同用。

联网移动本身会领取服务器遇敌票据，无需切换美术模式。试玩入口在换层时持续保留候选地图与相机比例；旧的 `encounters-on/off` 文件控制已移除，避免下层退回网格与默认缩放。

测试队友在每场结束后继续参与后续房间。`backend/closed-rooms.ndjson` 保留每场原始结算，`backend/closed-room.json` 保留最后一场；验证特定守护奖励时应按房间与遭遇来源选择记录，不能把最后一场普通遭遇当作守护战。测试角色的生命会按真实战斗消耗，连续试玩不自动补满或伪造胜利。

`--downed-owner-check` 是单独的人工回归夹具：在后端开始监听前，将主控人物设为当前生命 1／最大生命 10400，主控战宠当前生命设为 1，四名队友及其战宠保持满血。较高的人物生命上限用于避免低生命测试号因过量伤害被击飞、提前离场；遭遇种子固定为 32 字节的 `0x58`，使遭遇与敌人目标顺序可复现。令牌和战斗反应随机源保持原样，伤害、指令、结算仍走正式实现，不注入胜负。它不能与 `--cave-journey` 或 `--autoplay` 混用。须实际观察主控人物和战宠都倒下、其他队友继续推进回合，最终客户端收到结算；初始配置或战斗结束本身不代表覆盖该分支，也不构成正常角色成长／平衡验收。相关修复与证据见 [Phase 582](../docs/phase_582_battle_response_ownership.md)。

试玩的 `states.ndjson` 保存事件流状态及重连计时，`backend/event-stream.ndjson` 按计数变化记录连接、拒绝原因和心跳失败，关闭后记录连接归零；均不包含会话 token。这些是本机诊断记录，不能单独替代整场客户端检查。计时修复见 [Phase 583](../docs/phase_583_event_stream_monotonic_clock.md)。

试玩始终启用离线审片的连续绘制保护；窗口被系统遮挡时也更新真实 viewport，`render-continuity.json` 必须证明观察帧没有缺少绘制。该入口明确不提供性能验收，不能用录片 FPS 或补绘区段代替正常前台测量。见 [Phase 584](../docs/phase_584_guardian_review_render_continuity.md)。

`--autoplay` 自动走一次遮挡、挑战、攻击、宠物冲撞、蓄力防御、自动战斗及胜利返回路线，并核对档案版本和地之戒到账。输入通过真实 Main 的 viewport 跨帧发送，报告明确 `computerUse=false`；这是自动操作回放，不代替原生鼠标或所有者验收。提前结束时，在该次输出目录创建 `stop` 文件；协程退出后再清理客户端和后端。实现与验证边界见 [Phase 547](../docs/phase_547_earth_guardian_battle_presentation.md)。

夹具现含四套人物、五个独立站位；自动检查还覆盖静止定时刷新、世界／战斗外观和地面显隐。macOS 录制期间临时防止系统休眠，结束时释放，屏幕保持原状态。测试后端若意外退出，当前客户端会自动结束并保存失败原因；不会自动重发写请求。详见 [Phase 566](../docs/phase_566_authoritative_battle_appearances.md)。
