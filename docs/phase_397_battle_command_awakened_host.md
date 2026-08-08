# Phase 397：觉醒式战斗指令正式宿主接线

## 参考意图与阶段边界

- 本阶段落实项目所有者已经确认的战斗交互：人物和宠物回合都在右下角使用整齐的直排／横排
  指令，不使用圆弧；自动战斗切换为“宠／主／取消”三态，动作锁定时也能随时取消；世界功能
  收进左侧“功能”抽屉，战斗中不能打开地图。
- 项目所有者提供的《石器时代：觉醒》截图只用于确认信息层级、按钮种类和战斗期 HUD 收纳意图。
  本轮没有复制参考游戏的图标、纹理、布局像素、角色、宠物、地图、数值或源代码。
- 这是既有权威战斗指令和 Phase 395 正式世界 HUD 的窄宿主接线，不新增服务端 battle command、
  HTTP／WS 字段、协议版本、战斗公式或客户端绕过写入，也不把本阶段冒充 broad P2.2 完成。

## 正式指令与权威路由

- 人物回合固定显示 `10` 个入口：咒术、攻击、道具、托管、逃跑、援助、抓捕、召唤、防御、
  自动；宠物回合固定显示 `8` 个入口：技能、攻击、撤回、逃跑、援助、折返、防御、自动。
- 画面新词只做展示适配，真实命令仍由既有 `main.gd` 状态机处理。宠物快捷入口的合同为：

| 玩家看到的入口 | 既有宿主行为 |
| --- | --- |
| 技能 | 展开既有宠物技能栏位 |
| 攻击 | 从真实栏位解析 `action.command=attack`，进入既有 `pet_enemy_attack` 选敌链 |
| 防御 | 从真实栏位解析 `action.command=defend`，走既有宠物提交链 |
| 撤回 | 走既有宠物 `help` 返回人物指令，并清空宠物 pending／选敌态 |
| 逃跑 | 先返回人物指令，再走既有人物 `run` |
| 折返 | 先返回人物指令，再打开既有换宠页 |
| 援助 | 没有权威援助命令时明确禁用，不伪造客户端或服务端 ID |
| 自动 | 复用既有自动战斗状态与 `AutoBattleSettingsModel` |

- focused 检查使用固定 `bui_normal_red_fire10`、名称“验收布伊”的独立战宠夹具，断言实际
  `controlledPetFormId`／名称；同时精确检查 attack／defend 栏位 action、真实点击攻击进入
  `pet_enemy_attack`、真实点击撤回回到人物态及援助 disabled。录像使用正常玩家名“赤焰布伊”，
  QA 身份不会出现在玩家画面。
- 原 `--auto-battle-auto-attack-check` 也改为注入固定战宠，不再依赖默认档案偶然带宠；人物和
  宠物各至少一次真实自动提交后才通过。旧独立“停止”按钮合同已退役，自动与 10v10 回归都
  改查正式“取消”按钮可见且可用。

## 布局、世界 HUD 与功能抽屉

- `BattleCommandAwakenedHost` 只负责挂载、布局、旧按钮引用迁移与事件转接；状态机和权威提交
  继续留在既有宿主。人物／宠物按钮在右下角按 `60px` 以上触控目标整齐排列，没有圆弧。
- 回合牌与计时牌改为顶部中央纵向组合；真实 Main 检查同时断言它们彼此不相交，也不与左侧
  功能按钮、展开抽屉或右下指令区相交，修复首录中回合文字被“功能”圆钮遮住的问题。
- 战斗开始后继续保留同一 Phase 395 `WorldHudAwakenedView` 实例和 mounted 合同，但隐藏世界
  顶栏、右侧任务／组队栏和底部世界工具栏；结束战斗后同一实例恢复顶栏与底栏，不回退旧 HUD。
- 左侧“功能”默认收起，展开后只投影既有真实入口；图鉴、任务、内挂和设置可用，其余战斗期
  不安全入口 disabled。抽屉从数据和画面都不含地图，底层 `map_menu_button` 在战斗中也禁用。
  “图鉴”的简体“鉴”字用正式 CJK 字体并有字形门禁。

## 输入、点击墙与兼容门禁

- `PanelRegistry` 的递归命中从局部 `visible` 改为 `is_visible_in_tree()`；隐藏祖先下即使子控件
  自身 `visible=true` 也不能形成点击墙，focused fixture 有明确反例断言。
- 觉醒式指令区只拦截实际按钮和内嵌页。真实战斗 `_battle_point_overlaps_panel()` 在新 host
  存在时不再回退到整块 `494×300` legacy panel 矩形；按钮中心必须拦截，透明间隙必须允许
  战场选敌穿透。
- 旧 `--auto-battle-label-check` 已删除“新建 4 个旧陪练并造 20 actor”的退役产品假设，改为
  检查当前野外战斗人物／战宠／敌人标签、长名字适配、正式 HUD／功能抽屉和
  `legacy_training_absent=true`。旧 frozen 战报的兼容读取没有因此删除。

## 资源来源与可替换性

- `battle_command_awakened_v1` 含 `16` 个 96×96 运行图标、生成提示、alpha/chroma 源图、确定性
  拆图脚本、manifest 和 ownership 记录。资源是项目原创 ImageGen 候选，不包含参考游戏像素；
  manifest 对 alpha 源和 16 个运行 PNG 的 SHA-256 复核为 `errors=[]`。
- bundle 自带 `.gitignore`，只忽略 Godot 生成的 `*.import`／`*.uid`；这些 sidecar 不属于
  产品源码，也不进入本阶段闭包。

## 自动验证与性能证据

- 最终冻结后的联合 Main 回归为 `9/9 PASS`：Godot parse、focused
  `--auto-battle-command-awakened-ui-check`、自动／10v10／标签、timer、PanelRegistry、宠物 command／
  target 全部通过；focused 项覆盖人物 10 指令、宠物 8 指令、自动三态与锁定取消、
  人物／宠物自动策略、功能抽屉展开／收起、图鉴内嵌页、禁止地图、简体字形、真实宠物路由、
  隐藏祖先点击墙、透明间隙、顶部布局及正式 HUD 同实例恢复。
- 统一回执为 `.run/godot_auto_checks/2026-08-08T07-26-27-149Z.log`（SHA-256
  `6050de41303fac40e02e6946b2f329fffd73f4ced6bc35341f4a7ee8ca6a2ee1`）与同名
  `_summary.json`（SHA-256 `f1afd6ec7a97679474a15753a50949d3d1c60c196d93fa0ad9b01883ab0c65ef`）。
  standalone `world_hud_awakened_view_check.gd` 另为 `PASS`，29 个 mount rollback 控件仍完整恢复。
- 性能门使用 `run_local_ci.mjs --skip-server --skip-godot-auto`，只执行 diff／runner syntax 与
  idle、真实移动、37 次跨帧连续点击和两项既有 UI 压力门，`8/8 PASS`。Phase 397 after 的
  `process_total` 为 idle median/p95 `0.320/0.550ms`、moving `0.640/0.740ms`、spam
  `0.780/1.030ms`；37 次点击 `screen_mismatches=0`、`max_input_us=4`、coalesced／settled 为真。
  证据位于 `.run/evidence/phase397_battle_command_perf/2026-08-08T07-24-32-810Z.log`
  （SHA-256 `6ad7231733c2377319dbf185da2defb8109d146a5422741c854da27c6c8d037c`）及同名
  `_summary.json`（SHA-256 `137be8ab8a5b8e4a527a9b143633b2faf5feef568d9c83bc15bc72574e241183`）。
- 同一基线 `origin/main=5302406ab5bcc3ea3f2aee4a8670acb3dff05a8a` 在独立 clean worktree 预热后
  同命令 `8/8 PASS`：idle `0.160/0.280ms`、moving `0.290/0.340ms`、spam `0.340/0.340ms`，
  `max_input_us=2`。基线 summary SHA-256 为
  `ca6ed96e11193ef11faaf5fbc1e11f43ac53027e903678338aa0c751d7bebb34`。本阶段随后去掉了非战斗
  世界 HUD 刷新中的 overlay panel 扫描与重复战斗布局；最终 after 仍高于这次独立基线，但保持
  60 FPS、亚毫秒中位数并远低于仓库 `5/10ms` idle／moving median 红线。未执行完整 local CI、
  完整 npm suite 或真实后端／MySQL 写入测试。

## 真实 Main 媒体与 Design QA

- 最终唯一引用的连续媒体 run 为
  `.run/evidence/phase397_battle_command_owner_review/phase373-20260808T074323.857268Z-b26f7552/`。
  它从真实 `Main.tscn`、隔离档案、无后端、禁档案保存路径启动；`1280×720 / 30 FPS / 1.00×`、
  `17.066667s / 512` 帧，8 次真实左键按下／抬起均跨帧，H.264 `yuv420p` 与 AAC 双流完整解码。
  文件名沿用通用 owner-review recorder 的 `pet-management-owner-review-1x.mp4`，语义以本阶段
  capture flag、summary 和日志为准。
- MP4 SHA-256 为 `4ea54d9db0b7501c9b7b4013f5aea5fe1da2f5976c993ec24a821a84c1db6ec0`；
  联系表为 `3da0d1d4461202866d628e670dd8e3b426de2efbbfd1407c6fefe39332dd523f`；
  summary 为 `6313e6d8d5b03efba74431775e4c54e436e27e213626a64d73cb57aeef74e686`；
  内层 `SHA256SUMS` 为 `54f8f8d20b181c6e1274d5a27ee2c8e6f362f6b9de6ee70247940e463759c249`。
- 录像对应的玩家运行时范围为 30 个文件（`main.gd`、`PanelRegistry`、5 个正式战斗 UI 脚本和
  整个非 sidecar 资源 bundle），按排序后的 `path\0file_sha256\0` 聚合 SHA-256 为
  `23f11f1ee0261e41650185f5a8692578c8ab18e03dc3ce89bc637a7cae6ff263`；该范围最后修改时间不晚于
  `2026-08-08T15:35:47+08:00`，早于录像启动 `2026-08-08T07:43:23.857268Z`。录像控制器
  SHA-256 为 `e7f150b6c2255a102358e3b81ad651a766485f1986ab6ba21d409c566046d137`。本阶段遵守父任务
  “不得提交／推送”约束，因此绑定基线提交 `5302406ab5bcc3ea3f2aee4a8670acb3dff05a8a` 加上述
  scoped content hash，而不虚构一个不存在的最终 commit。
- 联系表逐帧确认人物、抽屉、宠物、自动三态、人物策略、宠物策略与锁定取消均可读；顶部回合／
  计时不再遮挡左侧功能。正常玩家画面没有 QA、debug、验收或测试文字。
- Design QA 如实保留两个范围外发布阻断：普通战斗仍是灰色默认地面，当前宠物仍出现未批准的
  圆形／占位视觉。尚在 pending review 的战场和宠物候选没有为了录像被 runtime-enabled；必须
  等独立资源 release attestation 与项目所有者验收后另行接入。
- `ownerReviewStatus=pending`。工程、交互、媒体和性能门不替代项目所有者的审美验收，也不代表
  broad P2.2 已完成。
