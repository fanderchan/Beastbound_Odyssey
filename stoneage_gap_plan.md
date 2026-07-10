# Beastbound Odyssey — 相对 StoneAge 8.0 的功能差距与内容迭代计划

> **执行者说明（Codex）**
> - `tasks.md` 32 条联网 bug 已修完；`release_plan.md` A–E 开发项和用户验收确认均已完成。**不要重复做 release_plan 或 tasks 里的工作。**
> - 本计划对照本地参考源码 `/Users/fander/projects/_local_references/StoneAge`（亦见 AGENTS.md），找出 **Beastbound 仍缺、偏薄、或未联网化** 的玩法，按阶段补齐到「可发行的原创石器风 MMORPG」。
> - **只参考机制与数据契约，禁止复制 SA 源码、数值、地图、NPC 脚本或美术。**
> - 每完成一项：在本文件「进度追踪」打勾并附一行证据（测试/自动检查/走查摘要）；每完成一阶段：跑 `node tools/run_local_ci.mjs`，停下等用户确认。
> - 每次开新会话：读本文件进度追踪 + `git log` + 最新 `docs/phase_*.md`，从第一个未勾选项继续。

## 当前已具备（相对 SA 8.0 的基线，勿重复建设）

以下在 Beastbound 中**已有第一版或可玩闭环**（细节可能仍偏薄，但不算「缺失」）：

| 域 | Beastbound 现状 | SA 8.0 对照 |
| --- | --- | --- |
| 世界移动 | 等距地图、寻路、传送点、记录点 | `char_walk` / `map_warppoint` |
| 遇敌/挂机 | 草丛遇敌、遇敌石、挂机走路、内挂/自动战斗/自动捕捉 | `encount` / 遇敌石 |
| 战斗核心 | 10v10 阵型、速度序、合击、捕捉、精灵、战斗道具、状态技、换宠、训练伙伴 AI | `battle*.c` / `pet_skill.c` |
| 骑宠 | 骑乘状态、战斗内骑宠 HP/承伤/经验（Phase141） | 骑宠系统 |
| 宠物 | 捕捉、兽栏、丢弃/拾取、改名、状态、图鉴、技能学习、培养、MM 转生、成长档位 | `pet.c` / 转生 |
| 人物 | 升级加点、转生 1–6 转框架、四属性试炼洞窟 + 玄影洞窟 | `transmigration` |
| 装备 | 穿戴、强化、合成、修理、耐久、转生需求 | `item` / 装备铺 |
| 任务 | 主线/可选任务、奖励选择、任务追踪/导航 | NPC 任务链 |
| 商店 | 道具铺/装备铺、庄园占领商店 | `itemshop` / `simpleshop` |
| 社交 | 组队、切磋（duel room）、聊天频道、邮件（含附件） | `party` / 邮件 |
| 联网 | 账号、MySQL 档案、服务端权威战斗/商店/任务/转生/挂机/家族 | `saac` + `gmsv` |
| 家族庄园 | 家族 CRUD、九大庄园配置、宣战/准备/休战、参战名单、庄园战 battle room、占领商店 | `family.c` / `FMPOINT` / `manorsman` |

---

## 相对 SA 8.0 仍缺或明显偏薄（差距清单）

> 参考：SA `gmsv/src/npc/npc_*.c`、`gmsv/src/char/*.c`、`gmsv/src/battle/*.c`、`saac/src/*.c`  
> Beastbound 证据：`client/godot/data/`、`docs/phase_190`–`196`、`docs/asset_audit.md`、`docs/release_playability_walkthrough.md`

### G1 世界内容与可玩体量（SA 有数百地图/宠/道具，BB 目前偏 Demo）

- [ ] **G1.1 宠物图鉴体量**：当前 `pet_templates.json` 仅 **21 个 form**，且 **全部为 placeholderPalette**（`docs/asset_audit.md`）。SA 有大规模宠物表与捕获分布。
- [ ] **G1.2 野外分布与等级带**：除火芽村、四洞、玄影、等级试验场、九大庄园外，缺少 SA 式「多大陆、多等级段、多属性区域」的可玩地图网（`map_regions.json` 仅 ~6 个 region）。
- [x] **G1.3 道具与装备种类**：已补一批原创消耗品、宠物治疗道具、遇敌石和任务道具；后续仍可继续扩装备与特殊效果道具链。
- [x] **G1.4 任务与 NPC 密度**：已补福利/说书两类支线 NPC 与可选 talk 任务；后续仍可扩问答、日常、活动 NPC。
- [ ] **G1.5 交通网络**：SA 有 `bus` / `airplane` / 多 warp 网络；BB 仅有 map transfer 点，无大陆级巴士/航班式快捷交通。

### G2 经济与社会（SA 核心长线玩法，BB 基本缺失）

- [x] **G2.1 玩家交易**：已按用户验收反馈改为交易所买卖入口，默认 1% 税，支持 GM 配置默认税率与单物品税率；旧面对面交易接口仅保留兼容，不在普通 UI 展示。
- [ ] **G2.2 拍卖行**：SA `auctioneer` / `pauctionman` / `saac/auction.c`；BB **无**。
- [x] **G2.3 银行/仓库**：已补仓库 NPC 与服务端权威石币/物品存取 v1；后续可扩大容量、分类和家族银行。
- [ ] **G2.4 摆摊/寄售**：SA `sellsthman` 等；BB **无**。
- [ ] **G2.5 黑市/特殊商店**：SA `blackmarket`、`poolitemshop`、`pkpetshop`；BB **无**。
- [ ] **G2.6 赌博/小游戏**：SA `gamblemaster`、`gambleroulette`、`janken`、`bigsmall`；BB **无**（numeric 实验不算玩家玩法）。
- [ ] **G2.7 物品兑换/改造**：SA `itemchange`、`exchangeman`；BB 仅有装备合成，**无**通用物品兑换 NPC。

### G3 宠物深度（SA 特色，BB 部分有、部分无）

- [ ] **G3.1 宠物融合**：SA `petfusion` / `npc_petfusion.c`；BB **无** pet fusion（装备合成 ≠ 宠融合）。
- [ ] **G3.2 宠物赛跑**：SA `petracemaster` / `petracepet`；BB **无**。
- [ ] **G3.3 宠物邮件/托运**：SA `petmail.c`；BB 邮件仅玩家邮件，**无**宠物寄送。
- [ ] **G3.4 宠物制造/特殊获取**：SA `petmaker`；BB 主要靠捕捉 + GM，**无**正式 NPC 制造链。
- [ ] **G3.5 被动技能与战斗深度对齐**：BB 有 `battle_passive_skills.json`，需审计 **服务端权威战斗** 是否完整结算被动/反击/闪避/幸运一击（对照 SA `battle_event.c` 与本地 `battle_model.gd` 差异），补齐遗漏项。

### G4 家族与庄园（BB 已有第一版，SA 仍远未追平）

> 已做：Phase190–196（家族、宣战、名单、manor_war room、休战/准备、庄园商店、管家入口等）  
> 仍缺（见 `docs/phase_190` / `phase_193` / `phase_191` 明示）：

- [ ] **G4.1 家族银行与家族资金**：SA 家族银行/留言/税收；BB **无** family bank。
- [ ] **G4.2 家族权限体系**：族长/长老/成员权限、职务代理；BB 仅基础族长操作。
- [ ] **G4.3 家族留言/公告板**：SA `fmdengon` / `fmletter`；BB **无** 家族专用公告。
- [ ] **G4.4 中立庄园 NPC 守备战**：Phase193：中立庄园仍走「结算」而非 battle room；需守备队 NPC 房间或等价 PvE。
- [ ] **G4.5 庄园战观战/锁名单/踢人/入场地图**：Phase193 边界项。
- [ ] **G4.6 跨时段赛程与运营向战期**：Phase196 已有短准备/休战；缺 SA 式长周期赛程 UI、报名截止、开战窗口提醒。
- [ ] **G4.7 家族专属设施**：SA `fmhealer`、`fmwarp`；BB **无** 家族治疗/传送点。

### G5 PK、排行与竞技（SA 有，BB 弱或没有）

- [ ] **G5.1 切磋排行榜**：SA `duelranking`；BB 有 duel room + battle record summary，**无** 持久排行榜 UI/赛季。
- [ ] **G5.2 死亡争夺/特殊 PK 活动**：SA `deathcontend`；BB **无**。
- [ ] **G5.3 野外 PK 规则**：SA 有 PK 旗/区域规则；BB 以邀请切磋为主，**无** 野外 PK 开关与惩罚。
- [ ] **G5.4 宠物 PK 店/特殊对战**：SA `pkpetshop`；BB **无**。

### G6 角色与账号（SA 多角色、称号、Charm）

- [ ] **G6.1 单账号多角色**：SA 多角色选择；BB 当前 **一账号一档案**，无选角界面。
- [ ] **G6.2 称号系统**：SA `title.c`；BB **无** 玩家称号展示与获取。
- [ ] **G6.3 魅力/幸运玩法**：SA `charm` / `luckyman`；BB **无**。
- [ ] **G6.4 通讯录/好友**：SA `addressbook`；BB 有 `players/search` 与在线列表，**无** 好友/黑名单/常联系人。

### G7 战斗与职业（SA 魔法/职业/AI 更丰富）

- [ ] **G7.1 人物魔法/职业技能树**：SA `battle_magic.c` / `profession_skill.c`；BB 以「精灵 + 装备附带精灵」为主，**无** 独立职业技能体系。
- [ ] **G7.2 敌人 AI 与 BOSS 机制**：SA `battle_ai.c` + 复杂 NPC 战；BB 有 guardian 与 wild AI，BOSS 机制偏少（多为一波 wild/group）。
- [ ] **G7.3 战斗记录/回放**：BB 有 `battle_event_ledger` 与 server trace，**无** 玩家可见的回放/战报分享 UI。

### G8 表现与资产（发行门槛，非 SA 独有但当前最大短板）

- [ ] **G8.1 替换全部 placeholder 宠形态**（21/21）：见 `docs/asset_audit.md`。
- [ ] **G8.2 人物/宠物/地图/战斗/UI 原创美术**：当前 Polygon2D + 程序绘制。
- [ ] **G8.3 音效与 BGM**：SA 有完整音频；BB 运行时 **无** 跟踪音频资源。
- [ ] **G8.4 中文化文案统一润色**：自动走查已通过，但仍需人工验收首玩可读性（见 `release_playability_walkthrough.md`）。

### G9 运营与发布配套（release_plan 工程项收尾）

- [x] **G9.1 完成 release_plan B/C/D/E 用户验收确认**。
- [x] **G9.3 干净演示库/种子数据**：走查提到本地 MySQL 历史测试账号噪音；已补 demo seed 脚本。
- [x] **G9.4 新手 30 分钟体验曲线**：从注册到首次捕捉、首次组队、首次庄园信息可见的 pacing 文档 + 实机验收路径。

---

## 推荐执行顺序（给 Codex 的阶段）

> **原则**：先「能发行的一服闭环」，再「SA 式长线系统」。每阶段 3–8 个小项，小步提交。

| 阶段 | 目标 | 包含项 | 停止条件 |
| --- | --- | --- | --- |
| **F0** | 收尾 release_plan | G9.1、G9.3、G9.4 | 用户确认可进入内容迭代 |
| **F1** | 内容体量 MVP | G1.2 扩 2–3 个新 region + G1.1 新增 10 种可捕 wild 宠（含数据+遭遇+图鉴） | 新区域可挂机练级 20 级段，CI 绿 |
| **F2** | 经济闭环 v1 | G2.1 交易所买卖 + G2.3 银行存取（服务端权威） | 两账号可买卖/存取，防刷测试通过 |
| **F3** | 宠物深度 v1 | G3.1 宠物融合（简化公式）+ G3.5 服务端被动/反击审计补齐 | 融合 + 服务端 battle 回归绿 |
| **F4** | 家族庄园 v2 | G4.1 家族银行 + G4.4 中立守备 battle room + G4.3 家族公告 | 家族战全路径 battle room 化 |
| **F5** | 竞技与社交 v1 | G5.1 切磋排行榜 + G6.4 好友/黑名单 | 排行榜可查、好友可在线邀请 |
| **F6** | 世界便利与支线 | G1.5 巴士/快捷传送 + G1.4 2 类支线 NPC（问答/福利） | 跨 region 旅行 <2 分钟 |
| **F7** | 表现替换 v1 | G8.1–G8.2 先替换主角+3 首发宠+火芽村地面贴图 | asset_audit 占位计数下降 |
| **F8** | SA 式长线（可选） | G2.2 拍卖、G2.6 赌博、G3.2 宠物赛、G5.2 死亡争夺、G6.1 多角色 | 按用户优先级选取，不做一次性大杂烩 |

---

## 每个功能项的标准交付物（Codex 必须遵守）

1. **设计笔记**：`docs/phase_XXX_<slug>.md`，写清 SA 8.0 参考路径、Beastbound 原创规则、不做项。
2. **数据契约**：JSON 或 MySQL 迁移（DB 操作用 MCP server）。
3. **服务端权威**：联网账号不得仅本地改 profile；需 API + 测试。
4. **客户端 UI**：中文、PC 窗口优先验收；不新增移动端专属功能或移动导出阻塞，除非用户重新指定移动端优先级。
5. **自动检查**：新增或扩展 `--auto-*-check`；纳入 `tools/run_godot_auto_checks.mjs`。
6. **服务端测试**：`server/node/test/auth-*.test.js` 覆盖 happy path + 权限/作弊拒绝。
7. **性能**：改动后 idle/moving `--perf-probe` 不退化。
8. **本文件打勾 + 证据一行**。

---

## 进度追踪

> 从第一项未勾选项继续。完成打 `[x]` 并附证据。

### F0 — release_plan 收尾
- [x] G9.1 release_plan B/C/D/E 用户验收确认
  - 证据：2026-07-04 用户明确确认“我认为我测完了”，并要求直接打钩；`release_plan.md` 阶段 B/C/D/E 验收项已同步打勾并保留已有自动验证证据。
- [x] G9.3 demo 种子库脚本
  - 证据：`server/node/scripts/seed-demo-data.js` + `npm run seed:demo --prefix server/node`；`node --check` exit 0；memory/json store 验证 4 accounts / 2 families / 1 manor，第二次 JSON seed 为 `reused` / `already_owned`；`npm test --prefix server/node` 92/92 pass，详见 `docs/phase_197_demo_seed_data.md`。
- [x] G9.4 新手 30 分钟体验曲线文档
  - 证据：`docs/phase_198_first_30_minutes_pacing.md` 记录 0-30 分钟注册、任务、遇敌、捕捉、组队、家族/庄园可见验收曲线；release_plan B/C/D/E 已由用户确认。
- 阶段 F0 验证（2026-07-04）：`node tools/run_local_ci.mjs` 通过 10/10，summary `.run/local_ci/2026-07-03T23-46-40-505Z_summary.json`，log `.run/local_ci/2026-07-03T23-46-40-505Z.log`；服务端 92/92，Godot 自动检查 188/188；性能基线 `perf-idle` process_total median=0.270ms p95=0.370ms，`perf-moving` median=0.210ms p95=0.240ms，`perf-movement-spam` max_input_us=192 且 coalesced=true/settled=true，`perf-shop-select` 与 `perf-player-stat-spam` 通过。

### F1 — 内容体量 MVP
- [x] G1.2 新 region ×2~3
  - 证据：新增 `mistcap_marsh`、`suncrack_badlands`、`windglass_highlands` 三个 field region、三张 map JSON、火芽村入口往返传送；`node tools/run_godot_auto_checks.mjs --only --auto-map-region-contract-check,--auto-pet-template-catalog-check,--auto-pet-codex-list-check,--auto-pet-encounter-table-check --fail-fast --timeout-ms 180000` 通过 5/5，log `.run/godot_auto_checks/2026-07-04T01-10-04-355Z.log`，其中 `f1_regions=true f1_transfers=true`。
- [x] G1.1 新可捕宠物 ×10（非 placeholder 或明确 art 计划）
  - 证据：`client/godot/data/pet_templates.json` 新增苔背兽/风狐/炽角兽/潮鳍兽 4 个种系与 10 个 `capture.catchable=true` form，每个 form 带 `visual.artPlan.replacementPath`；同一轮 `--auto-pet-template-catalog-check` 输出 `f1_forms=true f1_lines=true`，`--auto-pet-codex-list-check` 通过；`node tools/run_godot_auto_checks.mjs --only --auto-balance-catalog-check --fail-fast --timeout-ms 180000` 通过 2/2，log `.run/godot_auto_checks/2026-07-04T01-10-30-559Z.log`。
- [x] G1.3 扩展消耗品/任务道具一批
  - 证据：新增 `trail_ration_pack`、`item_pet_salve_mid`、`item_pet_salve_large`、`encounter_stone_patrol`、`quest_welfare_token`、`quest_field_note`，并接入火芽村道具铺；JSON 解析通过，`--auto-stage6-content-check` 输出 `items=true shop=true`。
- [x] G1.4 支线 NPC ×2 类
  - 证据：火芽村入口新增福利员阿檀、说书人阿舟及两条 optional talk 支线；`node tools/run_godot_auto_checks.mjs --only --auto-quest-objective-templates-check,--auto-npc-quest-marker-check,--auto-task-tracker-route-check,--auto-stage6-content-check --fail-fast --timeout-ms 180000` 覆盖任务模板、NPC 标记、追踪路线与阶段 6 内容。

### F2 — 经济闭环 v1
- [x] G2.1 玩家交易/交易所
  - 历史证据（兼容接口）：新增 `/trade/propose`、`/trade/accept`、`/trade/cancel`、`/trade/state`；`node --test server/node/test/auth-economy.test.js` 覆盖距离拒绝、状态读取和双账号原子交换。
  - 证据（2026-07-05）：按用户验收反馈改为交易所入口，底部新增“买卖”，普通 UI 不再展示面对面交易控件；新增 `/market/listings`、`/market/list`、`/market/buy`、`/market/cancel` 与 GM 税率配置 `/gm/market/config`，默认交易税 1%，支持单物品税率覆盖；`node --test server/node/test/auth-economy.test.js server/node/test/auth-storage.test.js server/node/test/auth-http-server.test.js`、`node tools/run_godot_auto_checks.mjs --only --auto-market-panel-check,--auto-stage6-content-check --fail-fast --timeout-ms 180000` 通过。
- [x] G2.3 银行/仓库 NPC
  - 证据：新增仓库员阿衡、`/bank/deposit`、`/bank/withdraw` 与仓库面板；`node --test server/node/test/auth-economy.test.js server/node/test/auth-storage.test.js` 通过 12/12，`--auto-stage6-content-check` 覆盖仓库 NPC、地图标记与仓库面板。
- 体验加固（Phase202，不改变 G2.7 状态）：完成 PC 玩家流程审计，强化世界任务目标/行动/奖励层级，修正背包与交易所空状态，并将战斗 `help` 显示统一为“帮助”；Godot 针对性检查 6/6，idle/moving/移动连点性能门禁通过，详见 `docs/phase_202_player_guidance_polish.md`。
- [x] 体验加固（Phase203，不改变 G2.7 状态）：把底栏未教学功能拆成渐进式主线任务，完成挂机、商店出售、玩家挂单、教学机器人购买、成交邮件领取、教学机器人售卖与附近聊天的服务端闭环；战斗内预约停止后按钮由“停”恢复“挂机”。原阶段 Node 针对性测试 58/58 + 38/38、Godot 针对性检查 14/14、idle/moving/移动连点/商店选择性能通过。2026-07-10 补入“骑宠之外设置四灵幼兽为战斗宠”的缺失教学，骑宠误切战斗不计完成；详见 `docs/phase_203_bottom_bar_tutorial.md`。
- [x] 体验加固（Phase204，不改变 G2.7 状态）：建立物品和宠物的 `bound/unbound` 所有权契约；绑定只阻止跨玩家转移，银行、使用和销毁保持可用。对战宠物蛋设为绑定，孵化四灵幼兽继承绑定，并补齐任务缺蛋时向阿牧重新领取的服务端权威闭环；补充 Node 47/47、Godot 8/8 窄回归通过，详见 `docs/phase_204_bound_assets_and_battle_pet_tutorial.md`。
- [x] 体验加固（Phase205，不改变 G2.7 状态）：44 个正式任务全部显式配置 `requiredLevel` / `recommendedLevel`，Lv1 也统一显示 `[1]`；38 个当前新手/功能任务为 Lv1/推荐 Lv1，六个转生资格任务为 Lv80/推荐 Lv100。等级只限制新接取，已接任务降级后仍可完成；宠物转生 MM 教学保持最低 Lv80、推荐 Lv130，详见 `docs/phase_205_task_level_requirements.md`。
- [ ] G2.7 物品兑换 NPC（可选简化版）

### F3 — 宠物深度 v1
- [ ] G3.1 宠物融合
- [ ] G3.5 服务端战斗被动/反击/闪避对齐审计

### F4 — 家族庄园 v2
- [ ] G4.1 家族银行
- [ ] G4.3 家族公告/留言
- [ ] G4.4 中立庄园守备 battle room
- [ ] G4.5 观战/锁名单/踢人（子集）

### F5 — 竞技与社交 v1
- [ ] G5.1 切磋排行榜
- [ ] G6.4 好友/黑名单

### F6 — 世界便利
- [ ] G1.5 巴士/快捷交通
- [ ] G2.4 摆摊（简化）

### F7 — 表现替换 v1
- [ ] G8.1 替换 21 占位宠（或分批完成并记录）
- [ ] G8.2 主角/村/map 贴图首包
- [ ] G8.3 BGM/SFX 最小集

### F8 — 长线可选
- [ ] G2.2 拍卖行
- [ ] G2.6 赌博/小游戏
- [ ] G3.2 宠物赛
- [ ] G6.1 多角色
- [ ] G7.1 职业技能树

---

## 红线（与 AGENTS.md / release_plan 一致）

- 不复制 StoneAge 8.0 / StoneAge9 / SA80 的代码、数值表、地图、NPC 脚本、美术。
- 不改动 `tasks.md` 已修复行为，除非回归测试证明失败。
- 不把新域塞回 `main.gd`；用 `scripts/net/`、`scripts/battle/`、`scripts/ui/`、`scripts/progression/`、`scripts/world/`。
- 产品决策（融合公式、拍卖税、PK 惩罚、多角色上限）先问用户。
- 每阶段结束跑 `node tools/run_local_ci.mjs`，汇报 CPU/perf 证据。
