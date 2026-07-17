# Phase 298：宠物付费重置原子事务

## 结论

P1.2c-3 已把上一阶段的“全形态报价事实”接成专用服务端权威事务：

- 玩家只能提交自己的宠物实例、当前档案 revision 和已看到的价格配置 revision；货币、价格、扣款顺序、重置结果及审计内容全部由服务器决定；
- 只有资料完整的 authority-v1 一转或二转宠物可以执行；旧成长档、0转、损坏档、未知形态、锁定、骑乘、任务占用、战斗中或离线修行中的宠物均失败关闭；
- 一次候选同时完成扣款、回到 Lv1/0转、清除等级/经验/转生成长/转生历史/旧成长观察、解绑、增加永久重置次数和写入私有审计；任一校验失败都不产生部分结果；
- Lv1 4V、物种/个体身份、天生隐藏成长、强化、主动/被动/已学/遗传技能及进化血统都以重置前后深比较锁定，不能在洗转生时重抽；
- HTTP 强制有效 `Idempotency-Key`。同 key 同请求只重放已提交结果，不二次扣款；同 key 不同请求明确冲突；
- 成功只在所属存储写入真正完成后发布。确认回滚不改宠物与货币；COMMIT 结果模糊时只读取这一 operationId 的持久回执，不能凭相似档案猜成功；
- MySQL 计划使用既有 `row_local_profile_v1` / `profile_conditional_v2`，只锁目标账号 profile 与该操作回执，不读取或写入全服 `server_state`，也不修改共享 MySQL 全局或会话参数。

玩家二次确认界面、普通玩家报价读取和 GM 审计查看仍属于 P1.2c-4。本阶段已经有真实 HTTP 接口，但没有把一个缺确认的危险按钮提前接到客户端。

## StoneAge 8.0 基线与 Beastbound 差异

本地稳定参考 `/Users/fander/projects/_local_references/StoneAge/gmsv/src/npc/npc_transmigration.c` 的成熟做法是：由服务器重新确认目标宠、转生条件和骑乘状态，经过选择/确认后才执行转生。它没有可以直接照搬的“所有宠物按形态付费完整洗回 0 转 + 绑定/非绑定钱包 + 动态 GM 价格 + operationId”合同。

Beastbound 因私服式长期运营和“所有宠都可反复追求完美”的产品决定增加付费重置，但仍沿用石器的服务端复核与明确确认心智。为了避免过度设计，本阶段没有新增洗宠券、第五种货币、独立系统页或玩家可见技术收容概念；它复用已有成长周期、四钱包、价格目录、durable receipt 和 profile 条件写入，仅新增一个聚焦领域与一个 HTTP 入口。

## 权威请求合同

`POST /pets/paid-reset` 只接受：

- `instanceId`（兼容别名 `petId`，两者同时存在时必须一致）；
- `expectedProfileRevision`；
- `expectedPriceConfigRevision`；
- HTTP `Idempotency-Key`，由统一 durable 边界转换为 operationId。

请求中的 `amount`、`currencyId`、钱包选择、目标等级、转生次数或任何预制宠物结果都属于未知字段并被拒绝。服务器按当前账号归属找到宠物，再按当前形态和 GM 配置解析报价；档案或价格 revision 已变化时返回冲突，要求刷新后重新确认。

## 合法性与结果不变量

重置前依次验证：

1. 会话、角色档案、实例归属和形态身份一致；
2. 当前不在战斗或离线修行，宠物未锁定、未骑乘且不是当前任务所需；
3. 形态存在严格价格规则，客户端看到的配置 revision 仍是当前值；
4. authority-v1 成长 envelope 可完整验证，转生培养记录恰为 schema v1，且为合法 1转或2转；
5. 永久计数和既有私有审计内部一致，同一近期 operationId 没有被宠物再次使用；
6. 当前四钱包余额能按服务器钱包策略形成完整扣款计划。

成功后：

- `level=1`、`exp=0`，并使用正式等级曲线重建 `nextExp`；
- `rebirthCount=0`、四项累计转生成长清零，删除转生历史并保留强化历史，追加一条 `paid_reset` 培养记录；
- 删除旧成长观察，让玩家从新的真实升级证据重新观察；
- `binding=unbound`、`bound=false`、`bindingLocked=false`；
- `paidResetCount` 永久递增；
- 不返还强化、转生材料、宠技训练或其他历史投入。技术失败没有“扣后补偿”，而是整个候选不提交。

## 审计、公开边界与兼容

- 玩家公开宠物只新增数值型 `paidResetCount`；私有 `paidResetAudit` 不进入 profile、HTTP 响应或 durable receipt；
- 每条审计记录 operationId、规范时间、形态、重置序号、重置前后等级/转生/强化/绑定、服务端价格版本与实际绑定/非绑定扣款；不记录密码、会话 token、private seed 或 private roll；
- 审计保留最近 50 条完整记录，同时以 `totalCount + archivedCount` 永久保存总次数和已归档数量。记录数量、顺序、嵌套字段、总扣款和序号任一损坏都会阻止下一次重置，不静默修复；
- 旧档没有这两个字段时按从未重置读取，不批量写回；只有首次成功时随该宠物落档；
- 历史 legacy 宠保持原样且不能被本接口暗中升级或重抽。它们需要未来显式、可审计的兼容处理，不以付费重置代替数据迁移。

## COMMIT、幂等与并发

扣款和宠物修改先发生在隔离候选中。候选连同成功响应的 durable receipt 一次写入；在存储 Promise 完成前：

- 请求 Promise 保持 pending；
- 服务已发布 profile 仍是重置前内容；
- 底层持久快照仍是重置前内容；
- 不会提前广播成功或改变玩家可读余额。

确认回滚转换为 `storage_write_failed`，候选被丢弃。对于“可能已经 COMMIT、但确认包丢失”的 typed ambiguity，服务只以该 operationId、requestHash、actionId 的精确持久回执判定；命中后重载权威档案并以 `replayed=true` 返回，未命中则保持 `storage_outcome_unknown`，禁止重新扣款。

正常 MySQL 写入走目标 profile `r -> r+1` 条件更新和同事务回执插入，不使用全局 revision fence。复杂度只与该账号最多 25 只宠物和该宠最多 50 条重置审计有关，不进入帧循环、绘制、移动、战斗回合或在线轮询热路径。

## 验证与证据

- 纯重置规则验证合法二转、身份/成长/技能保留、legacy/0转/损坏/重复 operation 失败关闭、50 条审计边界与永久计数；
- 服务集成验证绑定优先拆款、公开隐私、档案 revision、同 key 重放/冲突，以及陈旧档案、陈旧报价、余额不足、锁定和骑乘零变更；
- HTTP 验证缺失/非法 key、客户端伪造价格字段、409 报价冲突、成功与重放；
- durable 边界验证 COMMIT 前零发布、确认回滚零变化、COMMIT 模糊后精确回执恢复；
- MySQL 纯计划与隔离执行文件验证真实重置选择 `profile_conditional_v2`，仅写 `profile_binding + profile + mutation_receipt_capacity + mutation_receipt`，没有 `server_state`；
- Pet Design Contract 与全形态目录检查、既有报价/四钱包/转生成长/公开投影回归、Godot headless parse 和 `git diff --check` 作为收尾门禁；
- 没有运行完整本地 CI、长时容量或真实 MySQL，因为本项不改变客户端、战斗/移动热路径或共享数据库配置，窄范围门禁能更直接覆盖风险。

1280×720 事务证据图位于 `.run/evidence/phase298/pet_paid_reset_transaction_evidence.png`。它展示隔离样本从 Lv88/2转/绑定、绑定250+非绑定100钻石，按服务端300钻石报价重置到 Lv1/0转/解绑、余额0+50和永久次数1；同 operationId 重放不再扣款。该图不展示玩家 UI，P1.2c-4 才需要真实 Godot 二次确认截图或短录屏。

## 下一步

P1.2c-4 接玩家与 GM 验收入口：

1. 在宠物成长页只对合法已转生宠请求安全公开报价，明确列出“会清除 / 会保留 / 不返还”；
2. 使用二次确认并在提交时携带最新 profile/config revision 与新的 operationId；冲突后只刷新报价，不自动重试危险动作；
3. GM/QA 可查看形态报价、永久次数和安全审计摘要，并为 `auth1373` 准备绑定/非绑定余额及代表性 1转、2转、legacy/损坏样本；
4. 用 1280×720 截图验收静态信息，用短录屏验收确认、等待、成功刷新和同 key 恢复流程；任何私有 seed/roll、原始审计或技术错误码都不能进入玩家界面。
