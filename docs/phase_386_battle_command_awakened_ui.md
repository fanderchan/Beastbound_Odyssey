# Phase 386：觉醒风格战斗指令与功能收纳

## 目标

把旧的右上矩形战斗按钮列表替换为 PC `1280×720` 右侧纵列加底部整齐横排，并保持同一套布局
合同可继续适配更窄视口。本阶段覆盖人物回合、宠物回合和自动战斗三种核心状态：

- 人物回合：`咒术 / 攻击 / 道具 / 托管 / 逃跑 / 援助 / 抓捕 / 召唤 / 防御 / 自动`；
- 宠物回合：`技能 / 攻击 / 撤回 / 逃跑 / 援助 / 折返 / 防御 / 自动`；
- 自动战斗：常驻 `宠 / 主 / 取消`，可分别调整宠物和人物的首回合、一般回合策略，
  并可在当前动作锁定期间立即取消自动。

项目所有者随后补充战斗 HUD 规则：进入战斗必须隐藏世界顶部两排功能和小地图，只保留
左侧 `功能` 入口；真实左键展开后再显示功能抽屉。战斗地图入口不进入抽屉，也不能从
其他旧入口打开。

## 参考意图与原创边界

项目所有者提供的三张《石器时代：觉醒》截图用于确认右侧纵向主动作、底部同基线横排、自动
战斗三按钮和人物／宠物状态差异。补充查阅的公开攻略确认自动战斗可以分别设置人物与
宠物技能，普通、咒术、道具和换宠属于不同指令类别，攻击、技能与抓捕还需要目标选择：

- <https://game.xiaomi.com/viewpoint/1516842670_1692282967539_13>
- <https://game.xiaomi.com/viewpoint/1516842670_1689176090923_13>
- <https://www.taptap.cn/moment/606296996243833269>

项目所有者补充的收起态与展开态截图进一步锁定了战斗 HUD 的层级：世界功能从顶部移除、
回合／倒计时居中、左侧 `功能` 负责开关深色网格抽屉，地图不在战斗功能里。本阶段只
复用这些成熟交互意图。圆章、图标、配色和按钮皮肤均为 Beastbound 原创资产；没有裁切、
复制或运行时引用参考游戏截图、角色、场景和商标。

## 客户端结构

- `battle_command_awakened_presenter.gd`：集中保存 `494×300` 设计坐标和三种状态的
  精确按钮合同；
- `battle_command_awakened_visual_skin.gd`：加载 16 张原创透明位图并提供深石／暖金
  圆章、危险态和内嵌策略页皮肤；
- `battle_command_awakened_view.gd`：只负责布局、状态切换、宠物技能内嵌页、人物／宠物
  自动策略页与可交互区域命中；
- `battle_function_drawer.gd`：独立管理战斗左侧 `功能`、四列网格、禁用态、真实入口代理
  与地图排除合同；不把功能抽屉继续塞进 `main.gd`；
- `main.gd`：保留现有权威战斗指令、目标选择和自动战斗模型，只做宿主接线与兼容引用；
- `battle_command_awakened_view_check.gd`：通过跨帧真实鼠标按下／释放验证三态和策略写回。

旧逻辑按钮被重新挂入新的聚焦 View，没有再复制一份战斗结算规则。透明 `494×300` 画布
本身不阻断战场点击，只有实际可见按钮和内嵌页参与 UI 命中。`PanelRegistry` 只把
`is_visible_in_tree()` 为真的子控件视为阻断区，隐藏子项不会残留不可见点击墙。

## 行为、权威与安全合同

- 人物与宠物自动策略继续写入既有 `AutoBattleSettingsModel` 字段，并通过
  `PlayerProgressModel.with_auto_battle_settings` 更新同一份档案；没有新增第二套配置；
- 自动战斗开启后不隐藏控制区，当前执行动作锁定时仍能左键 `取消`；
- 人物攻击、咒术、道具、抓捕、召唤与宠物技能仍走既有目标选择和服务器权威提交；
- `折返` 复用现有换宠入口，`撤回` 回到人物指令；
- `图鉴 / 任务 / 内挂 / 设置` 继续代理到既有真实页面；当前战斗安全合同不允许的背包、
  角色、宠物、装备、家族、队伍、信箱和买卖保持明确禁用，地图则完全不出现在抽屉中；
- 当前版本尚无可结算的援助技与托管位，因此点击只显示玩家可读的不可用提示，不虚构
  技能、结算或服务端写入；
- 玩家界面不显示 raw code、技能 ID、档案字段、测试状态、QA 文案或 agent 说明；
- 全部核心流程可由左键完成，右键不是必需输入。

## 原创资产

目录：`client/godot/assets/ui/battle_command_awakened_v1/`。

- `runtime/icons/`：16 张 `96×96` 透明 PNG；
- `source/generated/`：生成原图与透明化中间稿；
- `generation-prompt.md`：完整生成提示；
- `source-and-ownership.md`：来源、所有权、禁止复制边界和替换路径；
- `asset-manifest.json`：运行时文件、尺寸和 SHA-256 清单；
- `source/build_icons.py`：可重复裁切、去色键和生成清单。

## 验证

- `python3 client/godot/assets/ui/battle_command_awakened_v1/source/build_icons.py`：通过；
- `godot --headless --path client/godot -- --auto-battle-command-awakened-ui-check`：
  `status=ok`，人物 10 项、宠物 8 项、自动 3 项均为 `60px+` 触控目标且加载真实位图；
- 同一检查通过真实跨帧左键验证 `功能` 默认收起、点击展开、抽屉阻止战场穿透、地图缺席、
  `图鉴` 走既有内嵌页，以及关闭内嵌页后恢复收起态；顶部与小地图在战斗中保持隐藏；
- Presenter 自检锁定三态底部按钮使用同一 `y=228` 基线，防止再次退化成明显起伏的圆弧；
- 同一检查通过 `Viewport.push_input` 跨帧验证：开自动、打开人物／宠物策略、写回设置、
  动作锁定时可见并取消、宠物技能页、透明间隙穿透和旧操作栏不重叠；
- `node tools/run_godot_auto_checks.mjs --only=--auto-battle-pet-command-check,--auto-battle-formation-check --fail-fast --timeout-ms=180000`：
  Godot parse、宠物指令、阵型 3/3 通过；
- 最终组合回归：Godot parse、觉醒战斗 UI、10V10 阵型 `3/3` 通过，日志
  `.run/godot_auto_checks/2026-08-02T04-37-13-979Z.log`；
- 所有者反馈的“鉴”缺字已按根因修复：macOS 上首选 `PingFang SC` 的 Godot 字形集不含
  简体“鉴”，正文字体链现改为 `Hiragino Sans GB` 等完整简体字库优先；觉醒战斗 UI
  会直接断言真实图鉴标签所用字体包含该字形，定向检查 2/2 通过，日志
  `.run/godot_auto_checks/2026-08-02T04-56-02-295Z.log`；
- 扩展 `--auto-battle-label-check` 的新功能收纳条件为 `battle_menu=true`；该检查整体仍由
  独立的 10V10 `large_visible=false` 标签可见性断言退出 1，本阶段没有顺带修改其标签策略；
- 既有更宽的自动战斗回归中，按钮合同已恢复通过；剩余 `default_profile` 无出战宠、首个
  精灵目录状态和胜利退出三项失败属于当前测试夹具／既有流程，不由本 UI 变更伪修复；
- Design QA：三张指令参考和两张 HUD 收纳参考均与对应实机状态放入单一比较输入；字号、
  基线、收起／展开层级和禁用态复核通过，见根目录 `design-qa.md` Phase 386。

## 性能与运行证据

- 世界静置 1600 帧：稳定 `process_total=0.39–0.62ms`，`hud_signature=0.05–0.08ms`；
- 真实跨帧移动 `--movement-perf-check --perf-probe`：`status=ok`，固定 60 FPS 采样的
  `process_total=0.05ms`；
- 鼠标移动压力 `--movement-spam-click-check --perf-probe`：`status=ok`，36 次真实输入、
  `screen_roundtrip=true`、`coalesced=true`、`settled=true`，`max_input_us=1`，
  `process_total=0.06–0.08ms`；
- 功能抽屉接入后复测：37 次真实鼠标输入全部命中预期格，`screen_roundtrip=true`、
  `coalesced=true`、`settled=true`、`final_match=true`，`max_input_us=5`；稳定世界帧
  `process_total=0.43–0.50ms`；
- 战斗静置 240 帧探针在启动后稳定 `60 FPS`，`process_total=0.15–0.20ms`，新增抽屉没有
  把菜单扫描或全量档案处理放进每帧热路径；
- 四张正常 `Main.tscn`、Metal、`1280×720` 录帧的 CPU render 约
  `0.08–0.19ms/frame`；短录帧退出仍报告仓库当前的 ObjectDB／resource 残留警告，定向
  解析和自动检查没有脚本错误。

## 视觉证据与非目标

- 人物：`.run/evidence/phase386_battle_command_ui/final_v3_aligned/player/frame00000034.png`；
- 宠物：`.run/evidence/phase386_battle_command_ui/final_v3_aligned/pet/frame00000034.png`；
- 自动：`.run/evidence/phase386_battle_command_ui/final_v3_aligned/auto/frame00000034.png`；
- 人物自动策略：`.run/evidence/phase386_battle_command_ui/final_v3_aligned/auto_player/frame00000034.png`；
- 战斗功能收起：`.run/evidence/phase386_battle_command_ui/final_v4_battle_functions/player/frame00000041.png`；
- 战斗功能展开：`.run/evidence/phase386_battle_command_ui/final_v4_battle_functions/functions/frame00000041.png`；
- “鉴”字形修复后展开：`.run/evidence/phase386_battle_command_ui/glyph_fix/after_runtime/frame00000041.png`；
- 收起／展开参考与实机四宫格：
  `.run/evidence/phase386_battle_command_ui/final_v4_battle_functions/design-qa/reference-vs-implementation-v4.png`；
- 三态全屏同屏对照：`.run/evidence/phase386_battle_command_ui/design_qa_comparison_v3_aligned.png`；
- 三态右下聚焦对照：`.run/evidence/phase386_battle_command_ui/design_qa_focused_v3_aligned.png`。

本阶段不复制参考战场、不新增托管／援助的服务端规则，也不把当前战斗不安全的世界页面
伪装成可用功能；移动端竖屏或触屏发布仍不列为 PC 版本完成条件。工程和 Design QA 已
通过；图标主观美术仍等待项目所有者观看最终实机图后确认。
