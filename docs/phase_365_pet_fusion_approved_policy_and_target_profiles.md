# Phase 365：融合批准规则、终局目标档与技能防绕过

## 结论

P1.4c 把项目所有者批准的四项融合决定固化为双端严格合同，并把曜冠角兽、苔垒角兽从候选数值提升为生产成长目标：

1. 两条身份方向继续使用“曜冠角兽”和“苔垒角兽”；
2. 融合只消耗三只合资格的一转 Lv131–140 材料宠，不额外消耗石币、钻石、道具或现金物品；
3. 绑定材料可以参与，任一材料绑定则成品绑定；三只全部未绑定则成品未绑定，并登记为未来宠物交易系统可放行的资格；
4. 攻击、防御永久保留；遗传特殊主动只能经不可逆二次确认遗忘；出生后普通训练技能只能写入空技能位。

本阶段仍不是融合开放。生产融合目录继续保持 `runtimeEnabled=false`、`recipes=[]`，正常玩家没有融合入口，任何宠物都不会被融合系统消费。两条正式配方必须等完整透明美术包、发布证明和项目所有者最终验收后再登记，不能用假 `formal` 提前绕过素材门禁。

## 共享目录 v2

`pet_fusion_recipes.json` 升级为 `schemaVersion=2 / pet_fusion_recipes_v2`，Node 与 Godot 同时严格要求下列六项不可漂移策略：

| 字段 | 固定值 | 玩家含义 |
| --- | --- | --- |
| `additionalCostPolicy` | `materials_only` | 只消耗三只材料宠，无额外货币或道具 |
| `resultBindingPolicy` | `bound_if_any_material_bound` | 任一材料绑定则成品绑定 |
| `unboundResultTradePolicy` | `eligible_when_pet_trading_available` | 全未绑定成品只登记未来交易资格 |
| `baseActiveSkillForgetPolicy` | `forbidden` | 攻击、防御永久保留 |
| `inheritedSpecialActiveForgetPolicy` | `double_confirm_irreversible` | 遗传特殊主动二次确认后永久遗忘 |
| `postFusionTrainingPolicy` | `empty_slots_only` | 普通训练技能只能写入空槽 |

配方级绑定策略只允许 `bound_if_any_material_bound`，旧的 `always_bound` 已从双端合法值中移除。报价与最终结果都会返回：

- `additionalCostPolicy`；
- `resultBinding=bound|unbound`；
- `tradeEligibility=not_eligible|eligible_when_pet_trading_available`。

客户端会交叉检查绑定与交易资格；例如绑定成品若声称有交易资格，或响应声称需要额外石币，都会失败关闭。服务端测试同时冻结四种钱包、背包、捕捉工具和装备在融合前后逐字段不变。

这里的 `tradeEligibility` 不是“宠物已经能交易”。当前面对面交易和市场只支持货币、物品与装备，不支持宠物实例转移；实际宠物交易仍需在 P1.6 单独完成双账号原子转移、容量、出战/骑乘/任务锁、幂等、回滚和反诈骗合同。

## 两只终局目标

两条 P1.4b 冻结数值原样进入生产宠物模板、成长档和付费重置目录，没有重新调平衡：

| 目标 | 亚族 / 形态 | 元素 | Lv1 基础血/攻/防/敏 | 每级中心血/攻/防/敏 |
| --- | --- | --- | --- | --- |
| 曜冠角兽 | `emberhorn_fusion_solar_crown` / `emberhorn_fusion_solar_crown_fire7_wind3` | 火7风3 | 172 / 31 / 11 / 90 | 8.8 / 3.1 / 1.15 / 2.75 |
| 苔垒角兽 | `emberhorn_fusion_moss_rampart` / `emberhorn_fusion_moss_rampart_fire4_earth6` | 火4地6 | 205 / 27 / 25 / 52 | 12.0 / 2.7 / 2.15 / 1.45 |

两只都复用 `lineId=emberhorn`，各自拥有新亚族，模板默认主动精确为攻击与防御；出生时的 0–3 个遗传特殊主动和唯一被动只来自服务端融合实例，不从目标亚族模板回灌。

两档都保留 `weighted_center + 2% extreme`，并写入 10,000 样本的 Lv2–140 逐级观察数据。冻结候选审计已从旧的“不得进入生产”改为“生产档必须与批准候选逐字段一致”，每档检查身份、4V 基础、4V 成长、两组离散范围、分布和审计带。

付费重置策略明确为：

```text
acquisitionTier=fusion
resetAllowed=false
ineligibleReason=terminal_fusion
```

普通二转的 Node 与 Godot 评价基准统一从付费重置根合同排除 `terminal_evolution` 和 `terminal_fusion`，不会把这两只独立融合成长档误算成普通二转胚子。即使融合实例的 lineage 损坏或缺失，目标形态本身也会失败关闭为融合终局，不能重新普通二转、进化、融合或付费重置。

## 技能管理

服务端新增聚焦的融合技能策略，客户端使用同一合同：

- 攻击和防御不能通过遗忘、清空或覆盖移除；
- 融合宠已有技能槽不能被训练接口覆盖，普通训练技能只能进入空槽；
- 服务端内部 `fusionLineage.activeInheritance` 永远保留三角色完整判定记录；公开档案只保留 0–3 条成功遗传记录，客户端严格校验角色唯一、`inherited=true`、技能合法且不得伪装成攻击/防御；
- 遗忘遗传特殊主动必须提交 `double_confirm_irreversible_v1`；
- 遗忘后写入 `forgottenSkillIds`，且特殊主动不在训练目录，不能重新学回；
- 被动技能没有遗忘入口，本阶段没有顺带增加被动遗忘；
- 服务端内部缺角色、重复角色、未知角色或损坏 lineage 的所有技能变更全部失败关闭，包含空槽训练，避免把已永久遗忘的遗传主动伪装成普通训练技能学回；客户端公开稀疏记录允许合法的 0–3 条成功结果，但拒绝失败记录、重复/未知角色、超量记录和基础技能伪装。

普通玩家尚无融合宠和融合面板，因此当前只完成服务端权威确认和客户端本地策略；未来正式融合面板接入时，第一次点击只显示不可逆警告，第二次相同宠物/技能/revision 指纹才携带 acknowledgement 提交。切换宠物、技能或档案版本必须解除确认。

宠物页继续使用既有三个成长 Tab，不新增第四个顶层 Tab。融合宠只启用第三个“2转/进化/融合”Tab，内容标题与雷达标题显示“融合成长”；0转、1转页禁用，也不会把三只材料的成长履历伪装成成品历史。

## 透明关键姿势门禁

P1.4b 的两张批准身份板是烘入棋盘格的 RGB，只能作为身份方向参考。本阶段使用内置图像生成器，以批准身份板为参考分别生成纯色键背景的单只 `front_3quarter_sw` 姿势，再用安装技能自带的确定性 chroma-key 工具抠出 Alpha：

| 目标 | RGBA 候选 | 尺寸 | Alpha SHA-256 |
| --- | --- | --- | --- |
| 曜冠角兽 | `.run/evidence/p1_4c_fusion_identity_formal_gate/solar_crown/front_3quarter_sw_alpha_v1.png` | 1254×1254 | `722e063229e9744bcba91987f1ee96404d14d6b303736bf498c9e654cb90e374` |
| 苔垒角兽 | `.run/evidence/p1_4c_fusion_identity_formal_gate/moss_rampart/front_3quarter_sw_alpha_v1.png` | 1254×1254 | `4220779bd4d36385b54083cae9c55833e88cf35b0e5913b5603015cb5aee031a` |

两张输出都确认为 PNG、`hasAlpha=yes`，透明像素分别为 `1,164,450 / 1,572,516` 与 `1,114,639 / 1,572,516`。它们只代表“透明关键姿势技术门通过”，仍是 `in_production / owner pending`，没有进入 `client/godot/assets`。

正式素材仍缺：

- 统一到生产尺寸、脚底锚点和身份锁；
- 其余身份方向与真八方向世界动作；
- 双视角完整战斗动作包；
- 来源账本、逐帧哈希、运行实载和发布证明；
- 项目所有者对新透明关键姿势与完整动作包的明确验收。

本轮没有调用存在无关未提交改动的 `tools/sprite_alpha_despill.py`，也没有把关键姿势冒充完整素材或登记假正式配方。

## 验证与边界

最终跨层审查先发现并修复了四个组合缝隙：公开稀疏血脉曾被客户端误判损坏；缺 lineage 的融合终局曾可能在服务端战斗回灌普通模板被动；融合成长第三页属性表曾因重复分类返回空；历史 `forgottenSkillIds` 曾可能在服务端战斗移除攻击/防御。修复后：

- 7 个相关 Node 产品文件语法检查通过；融合、目录、事务、技能、公开投影、战斗房间与相邻档案回归 `247/247`；
- 独立 Godot 融合合同 12 项断言全部通过；headless parse 与 7 项相关自动检查合计 `8/8`，融合技能公开合同 `37` 个案例、成长第三页 6 行属性断言均通过；
- 8 份相关 JSON 解析通过；候选提升审计 `2/2`，两档各 10,000 样本；Lv1 分位 `36/36`，普通转生平衡 30 档/900,000 样本，转生评价 30 档/300,000 样本；
- Pet Inspector 为 36 形态/36 成长档、`errors=0 warnings=0`；两份 Pet Design 合同、战斗动作目录与两张 Alpha 的尺寸、透明像素和 SHA 均通过；
- 真实 `Main.tscn` 性能门通过：空闲稳定段 `process_total p95=0.51ms`，跨帧移动 `p95=0.33ms/status=ok`，无遗留 Godot 或测试进程。

本阶段没有连接共享 MySQL、修改真实玩家数据或运行完整本地 CI。

P1.4 父项继续未完成。下一阶段是两只宠物的完整正式非骑乘美术包、两条关闭态正式配方、QA 融合确认流程和 1× 实机端到端验收；只有这些门禁全部通过并经项目所有者明确批准，才讨论打开玩家入口。
