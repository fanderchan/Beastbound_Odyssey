# Phase 217 — 遇敌时私有捕捉候选与原样转移

## 目标

本阶段完成 `P0.2c-3a-3`：每只可捕捉野宠在权威遭遇创建时就固定自己的实例身份、Lv1 4V、隐藏成长、当前等级属性和默认技能；捕捉成功只能认领并转移这个既有候选，不能在战斗结束后重新生成另一只宠物。

玩家仍只能看到 Lv1 4V、当前属性，以及 authority-v1 宠实际升级后形成的观察证据。服务端不会提前公开隐藏成长、精确 Lv140、私有种子或可重建下一次捕捉随机数的材料。

## 修复前复现

旧链路同时存在五个高价值问题：

1. 战斗房间公开 `room.seed`，捕捉 roll 只哈希公开 room/round/actor/tool 字段，客户端可在提交前精确算出成功与否；
2. 捕捉成功后才调用 `capturedPetInstanceFromBattleActor()` 创建宠物，linked 蓝人龙也会被重建为 legacy 个体，战斗中的怪与入库宠物不是同一个隐藏个体；
3. 战斗快照中的捕捉网仍可在市场、银行、交易、邮件或整档写入口被再次移动，随后战斗结算又按旧快照消费，形成重复资产；
4. 五只随队宠与二十只兽栏宠都满时，捕捉仍会掷随机数并消耗工具，成功宠物只进入不可恢复的 `lostCapturedPets` 响应；
5. 共享房间 writeback 会把队友捕获宠物摘要一并返回，客户端虽然只显示本人条目，但网络响应已越过隐私边界。

另有断线窗口：队员捕捉成功后若在房间结算前被移出参战列表，旧 writeback 不再遍历该账号，宠物与捕捉工具扣除都可能丢失。

## 私有候选契约

新增 `server/node/src/auth/pet-capture-candidate-authority.js`。权威 encounter 已决定 actor 后、一次性许可消费和房间保存前，为每个 `catchable` 野宠建立一份候选：

- `candidateId`、最终 `pet.instanceId` 和 `captureSecret` 使用三份独立 CSPRNG 身份；
- `captureSecret` 与公开 room seed 无关，HMAC 同时保护候选不可变事实并派生每次捕捉 roll；
- 同形态、同等级的十个 actor 也必须拥有十份不同候选、宠物身份、私有成长身份和捕捉秘密；
- 候选只保存在内部 `battle.captureCandidatesByActorId`，公开 room 使用正向字段投影，因此候选 map、secret、integrity tag、私有成长 envelope 和候选 ID 都不会进入 HTTP、WS、事件、trace 或战报；
- 候选损坏、形状漂移或成长验证失败时失败关闭，不静默重抽。

候选与战斗 actor 故意分层：actor 继续使用地图配置和阵位修正后的战斗数值，以保持既有战斗难度；候选保存真正可入库个体的成长属性。玩家攻击到的仍是同一个 form/level 野宠，但不能从战斗数值反推出其隐藏底板，阵位加成也不会污染捕获宠。

## linked 与 legacy 成长

两条新捕捉路径都先建立真实 Lv1 个体，再结算到野外等级：

- linked form：严格 `createNewPetFactory` 生成一次 authority-v1 私有成长 envelope，再由 `settlePetGrowthToLevel()` 逐级结算；
- unlinked legacy form：生成一次 CSPRNG legacy 身份，按共享 `pet_growth_profiles.json` 固定真实 Lv1 4V、隐藏个体浮动和当前等级属性。

因此新抓到的 Lv2+ legacy 宠也有真实的 Lv1 历史；这不迁移、不重滚历史旧宠。历史旧宠缺 Lv1 事实时仍保持“不可观察”，不能从模板或实例 ID 伪造。

这里必须区分“捕获候选已固定成长事实”和“捕后 EXP 会继续结算四维”：当前 7 个 linked form 走 authority-v1 dispatcher，捕后每次真实升级都会继续结算属性并累积观察证据；普通乌力等 24 个 unlinked legacy form 的现有 EXP 兼容路由只更新等级/经验，不更新四维。因此普通乌力目前还不能完成“抓到后练至约 Lv20 看每级成长”的正式闭环。全形态接档、万人模拟和旧宠迁移报告属于 `P0.2d`，本阶段不虚报为已完成。

## 捕捉事务顺序

合法捕捉的顺序固定为：

```text
人物/目标/工具校验
→ 私有候选完整性与未认领校验
→ 当前档案 + 本房间已认领宠物容量校验
→ 使用候选 secret 为本次有效尝试生成 roll 并推进 attemptCount
→ 成功时由服务端行动顺序唯一 claim
→ 扣除一次可消耗工具
→ 标记公共 actor 捕捉成功
→ 房间结算时 materialize 同一 frozen pet
→ 只补充归属、队伍/兽栏状态和捕捉 receipt
→ revision +1、保存一次
```

失败捕捉会消耗工具并推进私有尝试号，但不会替换候选。多人同回合捕同一 actor 时，首个成功行动者拥有唯一 claim；后续行动不能复制宠物。重复房间 writeback 通过 room/actor receipt 返回既有实例，不新增第二只。

容量达到 25 时在 roll 和扣工具前返回中文 `battle_capture_capacity_full`。正常服务入口在战斗期间锁定背包、银行、市场、交易、邮件附件、宠物和整档写入，避免快照资产被重复移动；停止挂机仍允许。掉线队员被移出公开参战列表后，其 `departedParticipantsByAccountId` 快照仍保持资产锁，直到房间关闭，失败捕捉和战斗道具消耗也不能趁断线窗口双花。若运维绕过服务入口造成极小概率容量竞态，服务端宁可写入带内部 overflow 标记的临时兽栏项，也不删除已认领宠物。

捕捉工具的标准背包数组现在是唯一数量真相：只要档案存在 `backpackSlots`，其中的 0 就不能再被旧 `captureTools` 字段复活。只有真正缺少标准背包字段的旧档会从 `captureTools` 构造一次兼容背包；首次资产写入即落成标准数组。先挂牌、存银行或发送掉最后一张网，再开战时房间快照必须为 0。

## 断线与隐私

离线移除会保留内部参战快照。最终 writeback 遍历“当前参战账号 + 已离开快照账号 + 已认领账号”，因此捕捉者随后逃跑、战败、断线或被移出队伍，已经成功认领的宠物和工具扣除仍只结算一次。待结算 claim 期间该账号仍被视为占用战斗资产，不能开启另一场战斗或移动相关资产。

公开 room/writeback 改为按 viewer account 投影：

- HTTP state、命令响应和 WS/event replay 只返回查看者自己的 profile writeback；
- 共享 service event 中的 `profiles/skippedProfiles` 固定为空；
- 队友仍能看到公共“谁捕捉成功”的战斗动画，但看不到实例 ID、Lv1 4V、成长 marker 或收容详情；
- 捕捉者自己的安全摘要才包含 Lv1 4V、当前属性、成长公开 marker和队伍/兽栏去向。

## 客户端安全与反馈

- 手动捕捉按钮、悬停和点击现在只接受存活、可捕捉且未被捕获的敌方 actor；不可捕捉 Boss 不再等到服务器拒绝后才反馈；
- 捕捉结算显示宠物名称、等级、收容去向和初始四维；authority-v1 只提示“从 Lv2 开始记录实际成长，建议训练到约 Lv20 再决定去留”，不显示 seed、最终品质或精确 Lv140；
- 联网低战力自动丢弃没有恢复、保护和审计能力，因此默认关闭并从联网设置页隐藏；本地兼容模式仍可显式开启；
- 自动捕捉的容量判断同时计算档案现有宠物和本房间本人已认领、尚未 writeback 的宠物；最后一个空位在同场被占用后不会继续提交第二次捕捉；
- 自动捕捉首选缚毒网时会逐个检查目标要求：未中毒乌力降级普通网，仅有缚毒网则使用空手，中毒乌力才使用缚毒网；
- 自动捕捉发现宠物栏和兽栏都满时停止在线挂机；即使客户端快照竞态收到 `battle_capture_capacity_full`，也会关闭自动战斗并停止挂机，避免无限重试。
- 服务端若返回捕捉目标非法、工具缺失或候选损坏，自动捕捉同样停止自动战斗/挂机并显示安全中文原因，不在异常状态无限提交。

这保留了 authority-v1 宠的判断节奏：捕获时知道 Lv1 4V，隐藏每级成长仍必须靠真实练级观察，现有成长观察机制没有被删除或改成“直接给最终答案”。unlinked legacy 宠的后续逐级四维结算缺口已明确留给 `P0.2d`。

## 协议、旧档与存储

- 客户端捕捉 DTO 仍只发送 actor 与 tool 意图，没有新增候选 token/seed，协议继续使用 v3；
- 候选和战斗房间仍是运行时状态，不写入 MySQL/JSON 持久化快照；成功宠物通过既有 profile 增量保存；
- 旧宠、旧存档和现有玩家数据不迁移、不重滚；
- 自动验证只使用 memory/隔离客户端状态，没有连接 MySQL 或真实玩家账号。

## 验证

服务端聚焦验证覆盖：linked/unlinked、十只同形态唯一候选、失败尝试不换宠、公开 seed 不影响 roll、唯一 owner、原样 materialize、候选损坏失败关闭、普通/linked 捕捉、显式 0%/非 0% 捕捉率、旧格式满容量前置拒绝、挂牌网不复活、旧网袋一次迁移、战中市场阻断、失败捕捉后掉线仍锁、双账号 HTTP/事件隐私和捕捉者断线后结算。

Godot 聚焦验证覆盖：捕捉、工具、设置、捕捉反馈、兽栏、成长观察和手动目标选择的 parse/自动检查。候选创建只发生在 encounter 请求路径，不进入 `_process/_input/_draw`；手动目标过滤是最多十个 battle actor 的按钮/指针事件扫描。

最终验证结果：

- 捕捉候选模块 8/8；完整 battle-room 57/57；完整 Node 服务端 267/267；
- Godot 4.7 直接 parse 无 `SCRIPT ERROR`，捕捉/工具/设置/反馈/兽栏/成长观察/联网选敌组合 8/8，日志 `.run/godot_auto_checks/2026-07-11T07-36-18-811Z.log`；
- 宠物设计 skill inspector `errors=0`、`warnings=26`，24 个未接成长档形态和 2 个既有内容/被动警告均保持显式；
- 空闲 `process_total=0.20–0.35ms`，持续移动稳定段 `0.10–0.31ms @ 60FPS`；独立跨帧连点 317 次，`avg/max=13/176us`，18 次解析/寻路合并且最终目标正确。与 Phase216 基线同量级；
- `git diff --check` 通过；所有服务端测试使用 memory/fake store，未连接 MySQL 或真实玩家账号。

## 玩家手动验收

1. 同一场战斗连续两次失败捕捉同一只宠：目标外观、等级与公开战斗状态不变；第二次不能表现成“刷新了一只”。
2. 捕获 Lv1 与约 Lv20 宠物：详情应立即显示真实初始四维；Lv1 显示未观察，实际升级后才增加成长观察，不能出现“预测140”。
3. 双人组队由甲捕获：甲结算显示四维和收容位置；乙只看到公共捕捉动画，不显示甲的宠物详情。
4. 战前只剩一个空位、同场有两只匹配宠时捕获第一只：第二只不再提交捕捉，自动挂机停止；队伍 5 只、兽栏 20 只时应在 roll 前提示满栏，捕捉网数量不变。
5. 进入战斗后尝试把捕捉网挂市场、存银行、交易或通过邮件附件移动：都应明确提示战斗结束后再操作。
6. 选择不可捕捉 Boss：捕捉按钮禁用或点击后保持目标选择，不提交无效命令。

## 非目标与剩余风险

1. P1.1 仍需设计服务端权威自动丢弃：观察等级门槛、商业/绑定/任务/收藏/锁定宠保护、可恢复操作日志和 GM 找回。本阶段绝不读取隐藏成长替玩家删宠。
2. 历史 `lostCapturedPets` 没有自动恢复工具；正式运营前要在 P0.5/P1.1 做只读报告与 GM 恢复流程。
3. 候选随运行时房间存在；服务器进程在战斗中崩溃仍会失去整场运行时战斗，这不是新增问题，需由战斗恢复/运维阶段解决。
4. 十只 Lv140 authority-v1 候选同步生成约为几十毫秒级，只发生在建房时；200 人混合遇敌、战斗和 WS 压力仍需 P0.6/P3.2 实测，不能据此宣称容量达标。
5. 当前仅 7/31 个形态接入 species growth profile，24 个 unlinked legacy 形态（包括普通乌力）捕后升级只涨等级/经验、不涨四维；蓝人龙仍缺正式世界投放。`P0.2d` 完成前，不能把 GM/测试捕获成功当成完整养成闭环或内容规模。
6. 商业付费宠正式进入野外、蛋或活动捕捉前，仍需明确丢失补偿、退款、绑定与客服审计规则。
7. 正常公开入口无法污染候选，但若运维或内存损坏导致最终 `materialize()` 校验失败，当前 writeback 会跳过该宠；P0.5/P1.1 恢复审计需补 settlement failure 与 GM recovery receipt，不能只依赖日志。
8. 当前权威内容没有 `catchable + 0%` 形态。服务端已正确保留显式 0%，但公开 actor 不投影该 override；未来内容若需要 0% 目标，应在设计检查中禁止该组合，或只公开安全概率档位，避免客户端显示普通公式估算并浪费工具。

## 涉及文件

- `server/node/src/auth/pet-capture-candidate-authority.js`
- `server/node/src/auth-service.js`
- `server/node/src/auth/battle-room.js`
- `server/node/src/auth/economy.js`
- `server/node/src/auth/mail-chat.js`
- `server/node/test/pet-capture-candidate-authority.test.js`
- `server/node/test/auth-battle-room.test.js`
- `client/godot/scripts/main.gd`
- `client/godot/scripts/battle/server_battle_coordinator.gd`
- `client/godot/scripts/battle/server_battle_room_model.gd`
- `client/godot/scripts/progression/auto_capture_settings_model.gd`
- `client/godot/scripts/progression/player_progress_model.gd`
- `client/godot/scripts/progression/server_auth_client_model.gd`
- `client/godot/scripts/progression/server_capture_feedback_model.gd`
- `client/godot/scripts/ui/panel_flow_coordinator.gd`
- `client/godot/scripts/qa/auto_check_coordinator.gd`
- `.agents/skills/design-beastbound-pets/`
- `stoneage_gap_plan.md`
