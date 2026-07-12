# Phase249：正式工厂生成的 GM 宠物样本档案

## 阶段目标

本阶段完成 `P0.5d-2`：让当前已授权 GM 通过一个固定 manifest，一次获得可用于 Lv1 四项比较、隐藏成长观察和角色成长对照的宠物样本。所有宠物必须由正式服务端新宠工厂生成；非 Lv1 对照样本还必须经过正式逐级 EXP dispatcher，不能由客户端或 GM 工具直接填写等级、属性、品质或成长观察。

本阶段复用现有宠物设计与数值，不新增、改弱或强化任何形态，不改变世界投放、捕捉率、技能、转生、进化、融合或商业价值。临时 Pet Design Contract 位于 `.run/pet-design/qa_blue_man_dragon_samples_v1.json`，只用于本阶段校验，不纳入提交。

## 修复前事实

现有 `gm_grant_pet` 是合法但非幂等的单只发放工具：每次调用都会生成新的 CSPRNG 个体。基线复现连续执行两次后宠物数从 1 增至 2，实例 ID 不同；服务层不存在批次方法。这适合 GM 明确领取一只宠物，却不适合“准备一个稳定测试档案”：

- 无固定十只蓝人龙样本，仍需连续点击；
- 响应丢失后再次点击会生成新 key 和新个体；
- 不能知道某个随机批次是否已经领取；
- 没有在领取前为真实捕捉验收预留容量；
- 不能一次获得经过正式成长链结算的角色对照样本。

Phase218 的历史证据显示 `auth1373` 当时已有 11 只宠，其中 4 只是合法服务器生成的蓝人龙。它们属于真实账号资产，本阶段不能删除、改名、收编为新批次或以 form 数量猜测“已经领取”。当前真实数量可能已经变化，代码不得依赖历史快照。

## 固定命令与 manifest

新增服务端命令：

```text
POST /gm/commands/gm_prepare_qa_pet_samples
Idempotency-Key: <stable operation key>
{"manifestId":"qa_pet_samples_v1"}
```

请求体必须只有 `manifestId`。禁止客户端提交目标账号、数量、形态、等级、四项、品质、种子、成长档、锁定状态或样本槽。命令只能作用于 bearer session 对应的当前 GM 自己，且必须同时通过 GM 身份与 `gm_prepare_qa_pet_samples` command grant。

固定 manifest 共 13 个不可改义的槽：

| 槽 | 数量 | 形态 / 成长档 | 目标等级 | 用途 |
| --- | ---: | --- | ---: | --- |
| `blue_l1_01..10` | 10 | `blue_man_dragon_water10` / `blue_man_dragon_v1` | 1 | 比较同物种 Lv1 当前四项代理与独立随机个体 |
| `tank_l20_01` | 1 | `wuli_normal_tough_earth10` / 同名 `_v1` 成长档 | 20 | 高生命、高防御、低速成长对照 |
| `speed_l20_01` | 1 | `driftfox_highland_wind9_earth1` / 同名 `_v1` 成长档 | 20 | 高速与攻击成长对照 |
| `balanced_l20_01` | 1 | `tidefin_mist_water8_wind2` / 同名 `_v1` 成长档 | 20 | 生命、攻防、速度较均衡的对照 |

十只蓝人龙必须各自调用正式 factory 并拥有独立 CSPRNG 私有身份。测试不能要求十只必然四项各不相同，也不能保证必出极品；重复四项组合属于合法随机结果。三只 Lv20 对照宠也先生成真正 Lv1 个体，再使用 canonical `petExpSettlement` 逐级结算 19 次，不能直接写 `level=20` 或复制预制属性。

## 容量与一次性领取

正式容量为随队 5 + 兽栏 20 = 25。本批次首次准备必须满足：

```text
现有有效宠物数 + 13 <= 24
```

即完成后至少保留 1 个位置用于真实遇敌捕捉验收。空间不足时整批失败：不创建部分样本、不挪动或删除旧宠、不改变 active/ride 引用、不增加 profile revision。

已成功准备过批次后，即使账号后来已有 25 只宠，再次调用仍允许返回幂等 no-op；它不会因为容量变化再抽样本。

## 私有 provenance 与永久幂等

同一 `Idempotency-Key` 由 Phase247 durable receipt 重放。由于随机宠物的 operation receipt 会过期，而且玩家下一次点击可能产生新 key，本阶段还必须在内部 profile 中保存一次性 manifest 账本，并为每只样本保存私有槽标记。

示意结构：

```text
profile.gmQaPetSampleManifests.qa_pet_samples_v1
  schemaVersion / manifestId / preparedAt / slots

pet.qaSample
  schemaVersion / manifestId / slotId / originFormId / initialLevel / targetLevel
```

规则：

- manifest 槽位、来源形态和目标等级一经发布不得改变；需要改批次时新增 manifest 版本；
- 账本与 13 只宠在同一 profile revision 和同一次 durable COMMIT 中产生；
- 账本存在且结构合法时，不再调用新宠工厂；不同 key 也只能返回 `changed=false`；
- 改名、移动到兽栏、升级、解锁或未来保留 provenance 的形态变化，都不能触发补发；
- 玩家后来明确删除、丢弃或转移样本，也不自动补抽，避免通过反复删除刷随机品质；确需新样本仍使用已有单只 GM 工具或未来独立的审计重置命令；
- 账本缺失但发现本 manifest 私有槽、同槽多宠、账本槽重复、instance ID 漂移、origin/target 不一致或 future schema 时失败关闭，不能猜测修复或删宠；
- 旧 `gm_command` 蓝人龙没有本 manifest provenance，全部保持原样且不抵扣十只新样本。

`gmQaPetSampleManifests`、`qaSample`、内部 `source`、private seed/roll/连续成长余数和理论最终品质都必须从公开 profile/pet 投影中剥离。客户端只得到安全 summary 与公开宠物事实。

## 样本保护与玩家信息

新样本初始统一：

- `locked=true`，防止误丢弃、清栏或被当作转生材料；
- `binding="bound"` 与公开 `bound=true`，不进入玩家经济；
- 锁定不阻止战斗 EXP 或 GM 单级升级；玩家需要测试转生时可主动解锁，但绑定不因此解除；
- 本阶段不声称已实现宠物交易；未来任何宠物交易仍必须服务端拒绝 bound 与 QA provenance。

玩家可见的成长信息继续沿用 Phase225：Lv1 当前四项、当前属性、实际升级形成的成长/级、评级、分位和基于实测平均的 Lv140 外推。Lv1 显示待观察，约 Lv20 才形成更有用的去留证据。界面不得读取或显示隐藏底档、真实 seed/roll 或未发生的未来成长。

## 原子执行顺序

```text
认证当前 session 与 GM command grant
→ 严格校验 payload、账号绑定、profile revision 与宠物结构
→ 校验 manifest 目录、私有账本与现有槽唯一性
→ 若已领取，返回 no-op，不调用工厂
→ 预检 13 个位置并保留 1 个捕捉位
→ 在 profile clone 中创建 13 个正式 Lv1 个体
→ 三只对照宠逐级结算到 Lv20
→ 校验 authority-v1、槽唯一性、绑定/锁定与公开投影隐私
→ 写一次 manifest 账本、一次 profile revision、一次 GM 审计
→ MySQL COMMIT
→ 发布权威公开 profile 与成功
```

任意目录、factory、EXP、容量、投影、存储或 COMMIT 失败，都不能改变共享缓存、旧宠、账本或 revision，也不能向客户端返回成功。

## 客户端合同

GM/QA 面板“核心测试档”增加“准备宠物样本档”：

- 固定构造 `{manifestId:"qa_pet_samples_v1"}`，无目标账号或可编辑数量；
- 非服务器会话或请求 pending 时禁用；
- 只有 `profileApplied=true` 且 manifest/summary/数量/等级分布完整时显示成功；
- 成功后自动选中一只本批次 Lv1 蓝人龙，复用现有“升1级”和宠物成长详情；
- 显示“13只、10只Lv1蓝人龙、3只Lv20对照、绑定并锁定、保留捕捉位”的人类可读摘要；
- 已领取但部分样本已不存在时明确提示“不会自动补发”，不能显示成重新准备成功；
- 不显示内部 slot、manifest ledger、instance ID、idempotency key、audit、seed、roll 或 raw server code。

本阶段不增加“直接升到 Lv5/Lv10/Lv20”的新服务端命令。玩家可用现有权威单级工具按实际升级路径观察选中的蓝人龙，避免把批次实现扩大为另一套升级系统。

## 非目标

- 不修改蓝人龙或三只对照宠的成长中心、分布、技能和被动；
- 不把蓝人龙无正式世界投放的问题伪装成已完成；
- 不新增素材、动画或音频；
- 不授予罕见五转奖励四灵幼兽、商业宠、进化宠或融合宠；
- 不删除 Phase218 留下的重复蓝人龙或任何真实玩家宠物；
- 不新增宠物交易、自动丢弃、转生、进化、融合或遗传；
- 不操作真实 MySQL 玩家档案；真实账号点击留到人工验收。

## 验证矩阵

完成前必须覆盖：

1. 空档一次生成 13 只；10 只蓝人龙均为 Lv1，三只对照为 Lv20。
2. 11 只旧宠档案完成后共 24 只，旧宠逐字段不变并保留一个位置。
3. 12 只旧宠时因无法保留捕捉位而整批失败，零宠物/账本/revision 变化。
4. 13 只宠物全部经 `newPetFactory.finalizeLevelOne()`；三只对照只经 canonical dispatcher 到 Lv20。
5. 十只蓝人龙私有 seed 唯一、authority-v1 完整、Lv1 四项在现有物种范围内；不写概率性极品断言。
6. 同 key 重放不重滚，新 key/重启/receipt 过期后依据永久账本 no-op。
7. 改名、升级、解锁后仍不补发；删除后也不自动重抽。
8. 账本/槽损坏、重复 provenance、未来 schema 与实例漂移失败关闭。
9. 普通玩家、缺 command grant、错误 manifest、额外账号/数量/等级/属性字段和缺少 key 全部拒绝。
10. 响应递归搜索不到 `privateSeed`、`privateRoll`、`qaSample`、私有账本与内部 source。
11. 样本默认 locked/bound；现有 active/ride/旧宠/unknown profile 字段保持。
12. COMMIT 失败前无成功或缓存发布；原 key 恢复后只产生一批。
13. Godot 固定 payload、严格 summary、pending 禁用、成功选中和旧服务端空响应失败关闭。
14. 1280×720 截图可见当前 GM、样本入口、宠物下拉和人类可读摘要，不裁切、不泄露 QA 内部字段。

已执行命令与结果：

```text
node --test \
  server/node/test/auth-gm-qa-pets.test.js \
  server/node/test/auth-gm-pets.test.js \
  server/node/test/auth-gm-qa-profile.test.js \
  server/node/test/new-pet-factory.test.js \
  server/node/test/pet-growth-runtime.test.js \
  server/node/test/pet-exp-settlement.test.js \
  server/node/test/auth-profile-visibility.test.js \
  server/node/test/auth-service-public-profile.test.js \
  server/node/test/auth-durable-commit.test.js \
  server/node/test/auth-http-server.test.js \
  server/node/test/auth-offline-hang.test.js
# 101/101 通过

node tools/run_godot_auto_checks.mjs --only=--auto-auth-check --fail-fast
# Godot parse + focused auth/GM 客户端合同 2/2 通过

node .agents/skills/design-beastbound-pets/scripts/validate_pet_design_spec.mjs \
  .run/pet-design/qa_blue_man_dragon_samples_v1.json
node .agents/skills/design-beastbound-pets/scripts/inspect_pet_design.mjs --check
node tools/battle_action_catalog_check.mjs
# Pet Design Contract 通过；宠物目录 errors=0，保留 2 个既有 warning；战斗目录通过

godot --headless --path client/godot --quit
git diff --check
# 通过
```

上述服务端测试使用内存及故障注入 async durable store 验证 COMMIT 门槛、重放、重启与失败恢复，没有连接或修改真实 MySQL、`auth1373` 或其他玩家档案。GM/QA 面板已生成并人工检查 1280×720 本地证据 `.run/evidence/phase249_qa_panel.png`；新增断言为 `buttons=true`、`qa_profile=true`、`screenshot=true`。完整历史 `--auto-qa-panel-check` 仍被既有 `stable=false`、`gm_tiger_level=false` 拖红，因此没有把它误记为本切片全绿。本阶段不改变移动、绘制、战斗或每帧签名，不另跑性能探针。

## 人工验收

1. 使用隔离本地 GM 登录，确认至少有 14 个空位；点击一次“准备宠物样本档”。
2. 在宠物列表找到 10 只 Lv1 蓝人龙，记录四项分布；允许随机重复，不要求必出极品。
3. 选三只不同蓝人龙，分别用现有“升1级”练到 Lv5、Lv10、Lv20，观察成长/级、评级和 Lv140 实测外推逐渐稳定。
4. 对照三只 Lv20 角色样本，确认高防、高速、均衡成长页能表达各自主轴。
5. 再次点击准备按钮，宠物数量与全部私有个体都不变化。
6. 确认样本初始锁定且绑定；需要转生测试时只手动解锁目标宠。
7. 用保留空位完成一次真实野外捕捉，确认 QA 批次没有堵死捕捉验收。

无法由自动测试判断的“十只是否有抓极品的惊喜”“Lv20 评价是否足以决定去留”，以以上步骤、四项离散度、观察等级稳定性和是否泄露隐藏底档为通过标准。

## 实际涉及文件

- `server/node/src/auth/gm-pets.js` 或新的 focused GM pet sample domain；
- `server/node/src/auth-service.js`、`http-server.js`：仅依赖注入、method/route/durable wiring；
- `server/node/src/auth/profile-visibility.js`：剥离私有 profile/pet provenance；
- `server/node/test/auth-gm-qa-pets.test.js` 及相关 GM/durable/privacy 回归；
- `client/godot/scripts/progression/gm_qa_pet_samples_client_model.gd`；
- `client/godot/scripts/ui/qa_panel_catalog.gd`、`panel_flow_coordinator.gd` 的薄 wiring；
- focused Godot checks、本文件与 `stoneage_gap_plan.md`。

本阶段不修改 `pet_templates.json`、成长档、主动/被动目录、地图或正式素材。
