# Phase 547：岩脉守护战表现、遮挡与倒地宠物指令

日期：2026-09-18。开发目录为统一后的主目录；改动未提交、未发布。

## 范围与当前结论

本轮把洞穴守护战从占位表现推进到可审看的正式客户端候选：接入已有宠物动作、新增原创岩脉战场背景，修复守护台遮住人物，以及人物倒下后漏交宠物指令的问题。保留既有敌人、属性、技能、难度、解锁和奖励规则。

美术状态仍为待老板验收。新背景与四种普通宠物动作仅由指定隔离 QA 入口开启，不能把本次演示理解为普通玩家已经获得正式版本，也不能据此勾选 `R1.W024`。

## 参考与产品边界

核对本机 StoneAge 8.0 的战场背景选择与回合指令意图；只借鉴明确区分世界探索、战斗场地和可行动单位的成熟行为，不复制代码、数值、图像或地图。Beastbound 的权威 Boss 锁定／防御决策窗仍遵守 [Phase 413](phase_413_guardian_targeted_charge_decision_window.md)。

探索中的地标保持原有位置、碰撞和交互。当人物真正位于交互物件后面且画面相交时，只把该物件淡化到 28%；人物走到前方或离开相交范围后恢复。这能看清角色位置，不增加玩家设置或新的地图规则。

## 实现

| 改动 | 位置与合同 |
| --- | --- |
| 守护兽身份与外观分离 | `EncounterModel` 保留既有 `battleAppearanceFormId / battleDisplayName`；`BattleModel` 仅对不可捕捉且已注册外观的守护敌人应用显示覆盖，保存原始 `serverFormId`。属性、元素、技能和奖励仍取原物种，普通可捕捉宠物不被覆盖。 |
| 岩脉战场候选 | `BattleArenaVisualCatalog` 中单独的 `earth_vein_sanctum`；只有指定 CLI、官方隔离 QA lane、正确玩家目录及资源哈希同时满足才开启。守护组或服务端 F4 队伍遭遇能选中，普通轮换与其他地图保持原样。 |
| 交互地标遮挡 | `InteractionOcclusionModel` 只比较矩形与深度；`WorldDepthLayer` 在建图时缓存候选物件，玩家几何范围变化后才刷新透明度。`Player.get_occlusion_world_rect()` 使用已加载精灵范围，不在移动帧中读图像 alpha、扫描目录或归一化档案。 |
| 人物倒下后宠物继续行动 | `ServerBattleRoomModel.current_account_command_owner()` 根据权威 required/submitted actor 列表选择人物或宠物；`ServerBattleCoordinator` 在恢复、新回合和自动操作中同步指令归属。人物不再需要行动时直接显示宠物菜单，不发送死去人物的无效指令。 |
| 可重复试玩 | `tools/play_guardian_review.py`、`guardian_review_backend.cjs` 和两个独立 QA 脚本；一个真实 `Main.tscn` 窗口加四名 HTTP 测试队友，生命周期复用既有官方 QA lane，不改隔离核心工具。 |

没有新增协议字段、服务端技能、数值公式、数据库实体或玩家设置。

## 美术来源与生命周期

新背景由本会话内置 OpenAI image generation 独立生成，原始输出、完整提示词、尺寸处理及哈希保存在 [素材目录](../client/godot/assets/battle/earth_vein_guardian_v1/source-and-ownership.md) 和 [manifest](../client/godot/assets/battle/earth_vein_guardian_v1/arena-bundle.json)。画面内不烘焙战斗角色或 UI。

运行 PNG：1280×720，SHA-256 `8f18c237aa6e1ff0edfaa18d5c4ddcbe6a85950e2b6bd497b557f37e470d0f72`。只通过尺寸转换接入，没有拼接或重绘。`ownerReviewStatus=pending / runtimeEnabled=false / releaseApproved=false`。

本轮复核五种宠物共 900 帧，路径、帧数、运行 manifest 校验无误；晶岩乌力的 180 帧还与保留源档逐字节比对。其余四种普通宠物使用现有压缩运行档，不将缺少完整制作源档的检查冒称为源档验收。没有重画或改写原有宠物动画及其所有者状态。

## 试玩与录像

```sh
python3 tools/play_guardian_review.py
python3 tools/play_guardian_review.py --record
python3 tools/play_guardian_review.py --record --autoplay
```

详情见 [工具导航](../tools/README.md#岩脉守护战试玩)。可用 `--godot` 指定已有 Godot 4.7 程序。角色从 F4 守护台附近开始：左键小地图 → 岩脉守护兽 → 挑战；分别提交人物与宠物指令，也可开启自动。

测试队伍为五个一次性账号，人物／宠物 Lv100。fixture v2 的主控人物生命保持 520，四名测试队友各为 1040，攻击／防御／敏捷均为 168／41／82；此配置用于观察主控倒下而队友仍在场的分支，不是平衡结论。宠物由既有 GM 发放和逐级升级接口准备；开战前移除 GM 权限，并关闭全档上传。四个队友通过 HTTP 保持在线和提交指令，战斗使用真实遭遇、原技能与服务端结算。它验证接入和运行闭环，不代表五名真人合作、正常升级成本或难度平衡。

`--autoplay` 使用跨帧的 viewport 鼠标按下／释放事件，报告明确为 `automated_viewport_input_playthrough / computerUse=false`，不会伪造 Computer Use 回执。自动路线检查走到地标后方的淡化、挑战、人物攻击、布伊冲撞、Boss 蓄力回合防御、自动战斗、结束返回、档案版本和地之戒到账。

最终原速录像已完成：[2 分 4 秒自动操作回放](../.run/guardian-review/20260917T203452.269337Z/guardian-1x.mp4)。1280×720、30 FPS、3742 帧、124.733333 秒，完整解码和关键帧复核通过，未改变播放速度；为保护隔离审片资源，音频关闭。视频 SHA-256 为 `3c88ea33d6e2b936099924da83dc31cf857af648579659b7e9b47296badae6e9`。

本次录像成功复现并通过修复分支：主控人物第 8 回合开始时生命为 0，宠物菜单仍可操作；其布伊参加五宠合击，贡献 210 伤害，合击合计 902，战斗随后胜利。五账号 revision 全部 `102 → 103`、地之戒各 `+1`；真实 Main 同步更新并返回 F4。原始回合事件和不含会话的汇总保存在 [本次证据目录](../.run/guardian-review/20260917T203452.269337Z/evidence-summary.json)。客户端无脚本错误或退出泄漏，WebSocket 与内存服务完整排空，`backend/stopped.json` 存在，官方 QA lane 已移除、真实玩家目录未变。

较早的全 HTTP 真实 Main 自动路线 `.run/guardian-review/20260917T202959.892990Z/` 已完成 10 回合胜利、revision `102 → 103`、地之戒 `+1` 与返回 F4，`autoplay.json` 为 passed；主控本次未倒下，不冒称覆盖了原生倒地分支。本次后端退出缺少 stopped 回执，不能当作最终完整收口证据。2026-09-18 04:05 后 Mac 锁屏，最终版本的原生鼠标复核需解锁后补充。锁屏前 Computer Use 已完成五人／20 actor 的人物攻击、宠物冲撞、防御和返回地图；当时 QA 队友驱动混用直接 service 调用，其档案结算证据不合格，不能引用为新版全 HTTP 结算通过。

## 已完成验证

```sh
node --test server/node/test/auth-battle-boss-mechanics.test.js \
  server/node/test/manual-encounter-access.test.js \
  server/node/test/pet-encounter-authority.test.js
node --test tools/test/guardian_review_backend.test.cjs
node tools/run_godot_auto_checks.mjs \
  --only=--auto-map-visual-runtime-check,--auto-server-battle-target-mapping-check,--auto-server-battle-boss-replay-check,--auto-rebirth-cave-guardian-check \
  --fail-fast --output-dir=.run/godot_auto_checks/guardian-final-v2-20260918
```

- 服务端权威目标套件 `29/29`；一次性全 HTTP 后端端到端 `1/1`，五个账号都完成档案结算并各获得一枚地之戒，持有升级 WebSocket 的退出测试也通过，测试后端端口关闭。工具日志为 `.run/guardian-review-backend-tests-v3-20260918.log`。
- 最终 Godot 解析、地图视觉／遮挡、目标映射、Boss 回放、洞穴守护合计 `5/5`，记录于 `.run/godot_auto_checks/guardian-final-v2-20260918/2026-09-17T20-37-22-701Z_summary.json`。新的指令归属检查覆盖人物先行、人物提交后宠物行动、人物倒下后宠物行动、无需额外点击的新回合菜单、宠物已提交、全员倒下、非指令阶段；实际宿主和模型都检查。
- 此前地图视觉／遮挡、Boss、守护验证合计 `4/4`。素材审计 `.run/guardian-battle-art-audit-20260918.json` 为五种／900 帧、无错误。
- QA 后端退出改为复用服务端 `drainServerForShutdown`，先停止 HTTP 接入并排空 WebSocket／持久任务；端到端回归持有真实升级连接直到关闭，必须收到 socket close 与 stopped 回执。启动器不会仅凭退出码 0 宣称完整收口。
- 全 HTTP 服务端独立实战 `.run/guardian-http-settlement-20260918/` 中五账号 revision 均为 `102 → 103`、每账号地之戒 `+1`；这是服务端证据，需与真实 Main 结果分别陈述。
- 所有运行采用一次性内存后端，未访问共享 MySQL。每次官方 lane 生命周期都核对真实玩家目录，698 个条目 SHA-256 保持 `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`。

失败运行保留原记录，不补写 PASS：全 HTTP Main 的 `.run/guardian-review/20260917T202539.940915Z/` 实际战败并返回 F4，档案版本 `102 → 103`、地之戒 `+0`，自动脚本因为期望胜利明确报告 failed，保留为战败路径证据。全 HTTP Main 自动实战在 `.run/guardian-review/20260917T201230.686926Z/` 复现人物 HP0、宠物存活而漏交指令；后续 QA 脚本编译／等待参数错误也保留在对应失败目录，修正后重新跑整条路线。

## 性能证据与限制

交互物件淡化改动前后均运行隔离 headless 的 `--performance-suite`，各 `5/5`；以下为稳定 `process_total` 毫秒，并非完整 GPU 或 native CPU 成本：

| 场景 | 改前中位 / p95 | 改后中位 / p95 |
| --- | --- | --- |
| 静止 | 0.509 / 0.548 | 0.550 / 0.620 |
| 移动 | 0.645 / 0.744 | 0.694 / 0.753 |
| 跨帧连续点击移动 | 0.570 / 0.741 | 0.618 / 0.817 |

目录：`.run/godot_auto_checks/guardian-world-before-20260918/` 与 `guardian-world-after-20260918/`。移动与连点稳定样本较少，不当作长时间负载结论。

原生 Metal 窗口另测到待审素材加载后的静止 CPU 11.3%、20 actor 战斗 CPU 35.5%；战斗 `process_total` 常见 0.1～0.2ms，但独立 `draw_battle` 约 3.3～4.7ms。`sample` 记录主线程、Godot 未符号化调用栈及渲染等待，说明 `process_total` 没有包括全部绘制／引擎成本，不能据此声称已达低个位数 CPU。首次战斗预览装载还出现约 1 秒尖峰。保留 `.run/guardian-review/20260917T201230.686926Z/native-cpu-stack.txt` 和抽样记录，后续须单独处理启动装载与原生绘制开销。

## 尚未接受的范围

- 新背景、普通宠物正式动作和 Earth Vein 地图仍待精确所有者接受；普通发布开关保持原状态。
- 地图上的远端玩家仍是原有简化占位；本轮正式主体交付范围是守护战，不把远端世界人物宣称为完成。
- 最终鼠标复核、分场景重复原生性能、完整地图动作安装／证据重冻、五真人联机、难度与长期经济、收费和生产容量不在本轮通过结论内。
- 没有运行全量 local CI 或生产发布门禁，没有提交、推送、部署或清理历史工作区。
