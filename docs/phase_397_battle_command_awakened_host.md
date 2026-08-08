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

- 合并 Phase 399 正式地图页后的最终联合 Main 回归为 `10/10 PASS`：Godot parse、focused
  `--auto-battle-command-awakened-ui-check`、自动／10v10／标签、timer、PanelRegistry、宠物 command／
  target 与 `--auto-map-panel-check` 全部通过；focused 项覆盖人物 10 指令、宠物 8 指令、自动三态
  与锁定取消、人物／宠物自动策略、功能抽屉展开／收起、图鉴内嵌页、禁止地图、简体字形、真实
  宠物路由、隐藏祖先点击墙、透明间隙、顶部布局及正式 HUD 同实例恢复。地图项另明确
  `battle_hidden=true`。
- 联合回执为 `.run/godot_auto_checks/2026-08-08T08-12-52-532Z.log`（SHA-256
  `94a7f0306493569872406339f3b1898ab307117fae8b353638cdb3454baa52a3`）与同名
  `_summary.json`（SHA-256 `b68b86f402d6ba9a45d22f8835c2c6f569eaf0291ef98305e98141c0f31f2852`），
  绑定集成运行时提交 `e590b31ba73d48af040367f33ad8304f3d6d7eb4`。standalone
  `world_hud_awakened_view_check.gd` 另为 `PASS`，日志位于
  `.run/evidence/phase397_integrated/world_hud_awakened_view_check.log`（SHA-256
  `ade8593dbd66f7e81a579ec45acad63e6674bd2a40f3df6ce65f27f05fa9c617`），29 个 mount rollback
  控件仍完整恢复。
- 性能对比在同一机器、相同预热和同一
  `node tools/run_local_ci.mjs --skip-server --skip-godot-auto` 合同下串行执行，基线
  `3c0e811aad7054c5a446eaac21be21f6b3d07af5` 与集成 after 均为 `8/8 PASS`。基线 idle／moving／
  spam 的 `process_total` median/p95 为 `0.450/0.640ms`、`0.500/0.900ms`、`0.620/0.810ms`，
  `36` 次真实跨帧点击零 mismatch、`max_input_us=6`；after 为 `0.420/0.610ms`、
  `0.790/0.800ms`、`0.530/0.670ms`，`37` 次点击零 mismatch、`max_input_us=3`，两边
  coalesced／settled 均为真。
- 基线 summary／log 位于
  `.run/evidence/phase397_integrated_perf_compare/baseline_3c0e811/2026-08-08T08-22-13-586Z_summary.json`
  与同目录 `.log`，SHA-256 分别为
  `53236c73011561c78350d899187c61988e3826f6f3a8c1ed56539648fa330fa8`、
  `7b0c0f621fd22a35066968790849136e10b258802f9aa37bab5ec782b0187846`；after summary／log 位于
  `.run/evidence/phase397_integrated_perf_compare/after_e590b31/2026-08-08T08-24-01-288Z_summary.json`
  与同目录 `.log`，SHA-256 分别为
  `5074fb32d46d6b08dc45df11aee90002d26d86b36752da82c860426e208fa215`、
  `3bdafc0d1ab846c9ab17271a863e9f825960758e1bc77d52518716bd1e4ffdaa`。moving median 相对基线
  增加 `0.290ms`，但 p95 下降 `0.100ms`，绝对值 `0.790/0.800ms` 仍远低于仓库 `10/30ms`
  moving 红线；作为 P3 测量噪声观察，不构成发布阻断。未执行不跳过 server／Godot auto 的完整
  local CI、完整 npm suite 或真实后端／MySQL 写入测试。

## 真实 Main 媒体与 Design QA

- 最终唯一引用的连续媒体 run 为
  `.run/evidence/phase397_battle_command_owner_review_integrated/phase373-20260808T083051.243960Z-63c288ec/`。
  它从真实 `Main.tscn`、隔离档案、无后端、禁档案保存路径启动；`1280×720 / 30 FPS / 1.00×`、
  `17.066667s / 512` 帧，8 次真实左键按下／抬起均跨帧，H.264 `yuv420p` 与 AAC 48kHz 双声道
  全片解码。文件名沿用通用 owner-review recorder 的 `pet-management-owner-review-1x.mp4`，语义
  以本阶段 capture flag、summary 和日志为准。
- MP4 SHA-256 为 `5511a72ff0842d1ad3294bb87ba973cb8d7ae610a1ce7a31ed569003fc67d81b`；
  12 帧联系表为 `d27ac3e6018efec626dc646541d668ccf23452bf71b3a986531912c701e9eada`；
  summary 为 `a83eb6549928b4af933cbbbdb54c74a13420300d719efa616ba48f27b8355fc7`；内层
  `SHA256SUMS` 为 `c620f3ef246764029713d6af029bdcf52c4572896e02282b237c6351de74517f`，
  `16/16 PASS`；Godot 录像日志为
  `6e915d1538f27c28600dc38751a3cb5ed6ca30140013ed0ff6348c552fb2556c`，零 ERROR／WARNING／
  leak；全视频／音频解码日志为
  `03782c0a8ac3121052626581a729b3edff70ff2a269c44237ab1b77d84d9baa2`。
- detached `runtime-source-attestation.json` 绑定运行时提交
  `e590b31ba73d48af040367f33ad8304f3d6d7eb4`，锁定 30 个玩家运行时文件（23 个非 sidecar
  bundle 文件、`main.gd`、`PanelRegistry` 与 5 个正式战斗 UI／drawer 文件）及 2 个捕获控制
  文件；全部当前字节等于该提交且 mtime 早于录像。按排序后的 `path\0file_sha256\0` 聚合
  SHA-256 为 `e22070fa4e7c3df0cf64678e1f43c9ff88612790323319dd7c4081cefce75607`；最新源码 mtime
  `2026-08-08T08:05:55.113852Z`，录像进程边界 `2026-08-08T08:30:51.245390Z`，冻结间隔
  `1496.131538s`。attestation SHA-256 为
  `18cf031811ca540074edfa0aad121ffa9b4971be2282c9288762cf709c15659c`；外层
  `OUTER-SHA256SUMS` 为 `f9a05968c3fa58dfad5e64a90259281da6fe17ada711e000654ab87923ec3e20`，
  `9/9 PASS`。
- 录像逐帧确认人物、抽屉、宠物、自动三态、人物策略、宠物策略与锁定取消均可读；顶部回合／
  计时不再遮挡左侧功能，战斗期正式世界 HUD 隐藏且地图入口不可用，正常玩家画面没有 QA、
  debug、验收或测试文字。退战后同一 HUD 实例恢复由上述集成 `10/10` 回归 summary
  `b68b86f402d6ba9a45d22f8835c2c6f569eaf0291ef98305e98141c0f31f2852` 证明，不是本次录像章节，
  不把自动检查冒充为玩家可见视频。旧基线视频 SHA-256
  `4ea54d9db0b7501c9b7b4013f5aea5fe1da2f5976c993ec24a821a84c1db6ec0` 在合并 Phase 399 后已
  永久作废，只保留为历史过程，不再作为最终证据。
- Design QA 如实保留两个范围外发布阻断：普通战斗仍是灰色默认地面，当前宠物仍出现未批准的
  圆形／占位视觉。尚在 pending review 的战场和宠物候选没有为了录像被 runtime-enabled；必须
  等独立资源 release attestation 与项目所有者验收后另行接入。
- `ownerReviewStatus=pending`。工程、交互、媒体和性能门不替代项目所有者的审美验收，也不代表
  broad P2.2 已完成。
