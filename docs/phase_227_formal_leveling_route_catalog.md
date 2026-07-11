# Phase 227：正式 Lv1–140 练级路线目录与中高阶生态

日期：2026-07-11

## 初始复现

`progression_zones.json` 声称存在 Lv1–140 路线，但运行时事实只连续到 Lv65：

- `riverbank_growth`、`forest_rebirth_prep`、`post_rebirth_plateau` 使用空 `mapIds`；
- `growth_training_01`、`rebirth_prep_training_01` 等只存在于数值/奖励表，没有对应地图遇敌区；
- Lv100–140 引用了不存在的练级分组与错误地图 ID `shadow_oath_cave_f5`；
- 四洞只有一次性守护战，玄影洞只有转生资格兽，不能承担重复挂机；
- 雾帽、裂日、风镜虽能遇敌，却没有对应奖励表，真实联网结算会退回 `default_wild` 新手掉落。

因此旧数值报告只能证明虚构的 `typicalBattle`，不能证明玩家能在正式世界中走完路线。

## 玩家承诺与设计边界

本阶段先保证“有真实地图、有真实服务端遇敌、有合理阶段奖励，并且升级途中仍可能遇到 Lv1 培育惊喜”。不新增宠物 ID，不改既有物种成长、捕捉难度、技能、转生或商业价值。

宠物设计 skill 的临时合同位于 `.run/pet-design/p0_3_existing_route_ecology.json`，只用于本地验证，不提交。它锁定：

- 正常等级怪承担练级，独立低权重 Lv1 条目承担极品培育惊喜；
- 每个新增练级池的单敌 Lv1 总概率为 1%，玄影四系混合池合计仍为 1% 而不是 4%；
- 满 5 只战宠与 20 只兽栏时继续沿用服务端捕捉前拒绝，不静默丢失稀有宠；
- 玩家继续只看到 Lv1 四项、实测成长和 Lv140 外推，不泄漏私有成长值。

## 正式路线

| 等级 | 地图 | 权威遇敌分组 | 作用 |
| --- | --- | --- | --- |
| 1–10 | 火芽村入口 | `firebud_grass_01` | 教学与第一只宠 |
| 10–24 | 雾帽湿地 | `mistcap_reeds_01` | 湿地角色宠与成长 |
| 25–45 | 裂日荒原 | `suncrack_ridge_02` | 火地生态中段 |
| 45–65 | 风镜高地 | `windglass_cliff_02` | 高速生态与一转准备 |
| 65–80 | 四洞一层 | `rebirth_prep_training_01` | 四元素任选的单人/组队练级 |
| 80–100 | 四洞二层 | `post_rebirth_training_01` | 转生后练级 |
| 100–120 | 四洞三层 | `high_cave_training_01` | 高阶洞穴练级，和顶层守护分离 |
| 120–131 | 玄影四层 | `shadow_chase_training_01` | 追赶段 |
| 132–140 | 玄影顶层回廊 | `shadow_capstone_training_01` | 满级冲刺，和守护 NPC 区域分离 |

四洞的岩、水、火、风地图复用既有晒甲苔背兽、云潮鳍兽、岚角兽、高地风狐，保持各自元素选择。单人遇敌继续是一只怪；多人队伍沿用现有 10v10 扩展规则，没有新增固定高怪数压迫单人挂机。

## 稳定分组与奖励档分离

新增 `rewardTableId`，不再为了复用奖励而重命名稳定的 `encounterGroupId`：

- 雾帽和裂日保留自己的生态分组，奖励使用 `growth_training_01`；
- 风镜保留自己的生态分组，奖励使用 `rebirth_prep_training_01`；
- 新增四洞/玄影练级分组本身已有同名奖励表。

Node 权威遇敌结果携带服务端选定的 `rewardTableId`；胜利结算优先读取它，但任务、图鉴、资格与战报来源仍使用原始 `encounterGroupId`。Godot 本地数值工具和兼容战斗也采用同一字段。真实服务集成测试证明雾帽战斗来源仍为 `mistcap_reeds_01`，奖励表为 `growth_training_01`，石币为 45–90。

## 严格启动目录

新增 `progression-route-catalog.js`，服务端创建权威遇敌域时即验证：

- active progression、zone ID、等级范围和 Lv1–140 无断层；
- 所有 map/group 均真实存在、属于非 GM 正式区域并在 `map_regions.json` 登记；
- repeatable 路线不能指向 manual-only 守护区；
- 每段至少有一个与推荐等级重叠的实际野怪条目；
- `rewardTableId` 必须存在且与路线配置一致。

`node tools/progression_route_audit.mjs` 当前输出：9 个练级带、20 条路线引用、19 张地图、9 个可重复分组，覆盖 Lv1–140；14 个新增四洞/玄影练级区的 Lv1 单敌率均为 1.00%。

## 验证

- 临时 Pet Design Contract：通过；
- `progression_route_audit.mjs`：通过；
- 宠物设计 inspector：`errors=0`，139 个显式遇敌条目；
- battle action catalog：通过；
- 完整 Node：283/283；
- Godot parse + 战斗奖励、balance 目录、区域目录、宠物遇敌表、地图传送、遇敌循环、数值报告：8/8；
- 捕捉工具、自动捕捉设置与战斗捕捉补充门禁：3/3；
- 数值报告：所有 9 个经济样本均有奖励表，7/7 可重复样本净收入非负；
- idle `process_total` 约 0.22–0.27ms；moving 60 FPS、约 0.17–0.25ms，movement check `status=ok`。

未运行真实玩家数据迁移，也未连接或改写 MySQL。

## 明确保留给 P0.3b/P0.3c

`numeric balance gate` 仍诚实报告 `progression_targets=fail`：当前 11 个区域中经验目标 5 个命中，9 个可重复区中估算战数 4 个命中。原因是正式 Node 战斗经验与 Godot 数值目录尚未共享同一权威公式，且尚未用隔离新号跑 Lv1→140 真实耗时。下一阶段必须先统一服务端经验，再调整目标，不能只放宽门禁。

离线挂机尚未实现；在线/离线比例、封顶、补领、防重放、GM 配置与审计属于 P0.3c。服务端被动技能仍留在 P0.4，本阶段没有借练级路线提前宣称被动已执行。
