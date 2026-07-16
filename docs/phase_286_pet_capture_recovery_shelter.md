# Phase 286：捕捉私有快照收容与幂等取回

## 玩家问题与本阶段目标

本阶段完成 `P1.1c-2`，解决的不是普通“满栏提示”，而是一个真实丢宠窗口：多敌人战斗中，第一只宠物捕捉成功后战斗仍会继续；旧实现只在运行期房间里标记 claim，直到房间关闭才 materialize 并写回档案。运行期战斗房间不会持久化，因此服务重启、进程故障或 materialize 异常都可能让玩家已经看到成功、却永远拿不到那一只冻结个体。

目标是把“捕捉成功”重新定义为：同一个持久化提交已经保存该冻结个体的完整私有快照、扣除捕捉工具并更新图鉴。没有完成这一步就不得产生成功事件或把目标标记为已捕获。

## 权威收容合同

- 档案私有字段 `petRecoveryShelter` 保存 schema 1 的 `pending`、有界完成墓碑和有界最近完成顺序。
- pending 保存冻结候选 materialize 后的完整宠物对象，包括原始 Lv1 4V、当前等级属性、隐藏成长 seed/roll、技能、捕捉来源和身份；不会在取回时重抽品质或成长。
- 收容 ID 由服务端根据战斗房间和野怪 actor 稳定派生。同一来源重复 stage 必须得到同一结果；同一 ID 或宠物 ID 对应不同快照时失败关闭。
- 只有服务端冻结候选盖章的 `source="wild_capture"` 能进入该收容；含候选 secret/integrity tag、身份不一致、未来 schema 或损坏结构一律拒绝。
- pending 不因展示上限被裁剪；完成墓碑保留 7 天且最多 256 条，覆盖 72 小时 durable receipt 窗口及运行期房间回收余量，避免长期挂机账号的 `profile_json` 和捕捉检查随终身捕捉次数增长。玩家只看到有界安全摘要，不看到墓碑或原始私有容器。

## 捕捉与结算顺序

成功 roll 后，服务器先在事务候选中 claim 并 materialize 同一只宠物，然后在同一档案 revision 内：

1. 写入完整 pending 快照；
2. 扣除捕捉网；
3. 更新已捕捉图鉴；
4. 等待持久化 COMMIT；
5. COMMIT 成功后才发布捕捉成功；需要收容时，玩家通过账号私有列表取得收容 ID。

materialize、收容、背包写回或持久化任一步失败时，不发布成功、不扣网、不把野怪置为 captured，也不留下半认领状态。战斗关闭前还会复核每个已认领 actor 必须能在 live 宠物、pending 或完成墓碑中找到同一实例，否则安全中止结算。

正常有空位时，战斗关闭会把 pending 原样移动到队伍或兽栏；容量在战斗期间发生漂移时，pending 保持不变，结算只返回“待取回”安全摘要，不再产生不可恢复的 `lostCapturedPets`。

## 重启、容量与幂等取回

- 运行期战斗房间仍按既有设计不持久化；档案内 pending 会随 memory、JSON 和 MySQL `profiles.profile_json` 保存，因此进程重启后仍存在。
- `GET /pets/recovery` 返回当前账号的安全待取回列表和 `recoveryId`，列表里的宠物经过 `publicPet` 投影。战斗广播不携带别人的收容 ID。
- `POST /pets/recovery/:id/claim` 必须携带 `Idempotency-Key`。只有队伍加兽栏存在真实空位时才移动宠物；满 `5+20` 返回失败且 pending、宠物、revision 都不变化。
- 取回成功只移动一次并写有界完成墓碑；同 key 在 72 小时回执窗口内精确回放，不同 key 的近期再次请求或服务重启后重放都不增加第二只宠物，也不再次递增 revision。墓碑窗口之外的旧请求最多返回记录不存在，不能重新生成宠物。
- 取回使用既有 `row_local_profile_v1` 条件写，只锁当前账号档案和对应 durable receipt，不扩大到其他玩家或数据库全局锁。

## 战斗指令幂等边界

捕捉现在可能在非终局回合写入玩家资产，因此 HTTP 战斗指令统一要求已有 Godot 客户端正在发送的 `Idempotency-Key`。`submitBattleCommand` 加入“失败后精确回执核对”，但不加入每次请求都查库的 precheck：健康回合仍走零额外回执读取路径；只有重试落到缺失运行期房间的旧节点、准备返回 `battle_room_missing` 时，才读取一次精确 durable receipt，并回放已 COMMIT 的成功结果。

## 隐私、存储与迁移

- `publicProfile` 整体移除 `petRecoveryShelter`；待取回列表、取回响应、战斗事件和 durable receipt 均不含 private seed/roll、候选 secret 或完整内部容器。
- QA 整档保存不能上传或覆盖收容字段；允许的 QA 保存会原样保留服务器现有私有收容。
- MySQL 继续使用完整 `profile_json`，不新增表、不改 DDL、不改数据库全局或会话参数。JSON 往返和 MySQL 实体加载测试证明私有快照原样保留。
- profile migration 的宠物资产审计现在把 `petRecoveryShelter.pending[*].pet` 计入引用、身份和 digest，防止未来迁移在资产守恒检查里漏看收容宠。
- 动态取回路径在 HTTP 指标中归一为 `/pets/recovery/:id/claim`，避免收容 ID 制造高基数指标。

## 非目标与后续边界

- 本阶段仍不开放联网自动删除或按隐藏成长自动处理。
- `P1.1c-3` 才制作 1280×720 玩家收容面板、最近处理说明和授权 GM 按账号/收容 ID/宠物 ID 查询恢复工具；本阶段只提供可验证的权威 API 与安全摘要。
- 历史版本已经丢失且没有完整私有快照的宠物不能伪造恢复。
- 没有修改宠物成长公式、捕捉概率、1级4V 分布、技能、造型或旧存档 schema 版本。

## 验证证据

- 收容纯规则 `5/5`：完整私有快照、stage/recover 双重幂等、满栏零变更、损坏/未来结构失败关闭、pending 不裁剪、7 天/256 条完成墓碑与 100 条最近顺序边界。
- 服务端收容集成 `4/4`：多敌人中途成功、重启后房间消失仍可取回、满栏后腾位、私有整档注入拒绝、materialize 故障不成功不扣网、row-local scope、跨节点房间缺失时精确回执重放。
- HTTP 收容 `1/1`：安全列表、缺失/非法 key、跨账号拒绝、同 key 和新 key 重放、零复制、响应与 receipt 零私有泄漏。
- 自动筛选集成 `3/3`、既有战斗捕捉定向 `9/9`、迁移 `13/13`、公开投影 `6/6`、相关 JSON/MySQL 存储 `2/2`、战斗 durable 定向 `3/3`、既有 HTTP/WebSocket 战斗流 `1/1` 均通过。
- Node 语法、`git diff --check` 通过；Pet Design Inspector 无 error。该阶段没有客户端每帧改动，不需要重复移动/面板性能探针。

全部验证使用隔离 memory/JSON/fake-MySQL/回环服务器；未连接共享 MySQL，未读取或修改真实玩家数据。
