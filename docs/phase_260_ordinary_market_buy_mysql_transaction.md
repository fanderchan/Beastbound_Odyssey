# Phase 260：普通市场购买的 MySQL 原子结算

## 问题与玩家风险

普通玩家购买市场挂单会同时改变买家货币与背包、目标挂单、卖家成交邮件、累计税金和幂等回执。旧的全根快照写法在多 Node 竞争下可能出现两类发行级问题：两个买家重复成交同一挂单，或只完成扣款、删单、邮件、税金中的一部分。

本阶段只把真实玩家购买 `schemaVersion=1` 的普通物品挂单纳入细粒度事务。装备挂单、教学挂单、旧/异常市场配置和未来 schema 继续走带全局围栏的 legacy 事务，不在本切片中改变玩家经济规则。

## Beastbound 结算合同

一次成功购买必须在同一个 MySQL 事务中完成：

1. 买家 binding/profile 从 `r` 条件更新为 `r+1`，扣除全价并加入物品。
2. 精确删除一个仍与读取快照一致的普通挂单。
3. 用严格 `INSERT` 创建一封卖家成交邮件，附件为成交价减税后的货币。
4. 按服务器税率重新计算税额，只对固定币种 JSON 路径做相对原子增量。
5. 用严格 `INSERT` 写入本次 durable mutation receipt。

任一锁定资源漂移、`affectedRows != 1`、邮件/回执主键重复、税金路径非法或提交失败，整笔事务回滚。客户端提交的税额、卖家、邮件或资源结果不作为权威事实。

## Scope 与失败关闭

服务层只为成功的 `buyMarketListing` 签发 `row_local_market_buy_v1`，绑定买家、卖家、双方 player、listing、sale mail、币种、税额及 operation/request/action 身份。MySQL planner 会再次独立证明：

- 只有买家一个档案发生 `r -> r+1`；卖家档案完全不写。
- 只删除一个字段集合精确的 schema1 普通挂单。
- 只新增一封结构、收件人和货币附件精确的成交邮件。
- 税率配置、另一币种税金、离线挂机配置和 service event 状态均未夹带变化。
- 本次税额由旧的 canonical `marketConfig` 和挂单重新计算，且没有安全整数溢出。
- 只新增一个与 scope 完全一致的 durable receipt。

任何额外字段或额外持久化变化都会回退 legacy，不会被新快路径静默忽略。

## Canonical 锁序

事务锁序固定为：

```text
global revision FOR SHARE + expected revision
→ 两个 binding 按 accountId 排序
  - 买家 FOR UPDATE
  - 卖家 FOR SHARE
→ 两个 profile 按 playerId 排序
  - 买家 FOR UPDATE
  - 卖家 FOR SHARE
→ target listing FOR UPDATE
→ buyer binding/profile UPDATE
→ listing DELETE
→ sale mail INSERT
→ tax JSON atomic increment（税额大于 0 时）
→ mutation receipt INSERT
→ COMMIT
```

邮件尚不存在，不预先做 gap lock；随机 mail ID 碰撞由唯一键严格失败并回滚。按 ID 而不是“买家优先”排序，避免两个账号互相购买时形成相反锁序。

## 税金热点与 legacy 兼容

本阶段没有引入新税金表或结算账本。税额使用白名单路径对 `server_state/auth` 做 `JSON_SET + relative increment`，不会把旧 candidate 的整个 JSON 覆盖回数据库。MySQL 首次增量后可能把 JSON 类型标为 `UNSIGNED INTEGER`，谓词同时接受 `INTEGER` 与 `UNSIGNED INTEGER`，并继续校验非负和 JavaScript 安全整数上限。

正税购买仍会在事务尾部短暂竞争同一 `server_state/auth` 行，所以本阶段只证明正确性，不宣称已经消除物理热点或达到 200 人容量。市场购买不是战斗热路径；是否迁移到 append-only settlement ledger，留给真实容量数据决定。

条件购买不推进全局 revision。为防止同 revision 的旧 Node 随后整块覆盖新税额，所有实际替换 `server_state/auth` 的 legacy 计划现在会先 `FOR UPDATE` 并精确比较完整旧文档；不一致即失败重载。首次创建 entity-state marker 时该行可能尚不存在，因此 `forceServerState` 初始化仍由全局 exclusive CAS 保护，不要求既有行锁。

## COMMIT 后发布与模糊恢复

Node-local baseline 只合并本事务已证明的买家 binding/profile、挂单删除、成交邮件、receipt lineage 和本地已知税额加本次增量，不把整个 candidate 冒充为数据库最新全根。

COMMIT 响应丢失时，恢复检查 exact receipt、买家档案、挂单已删除和 exact sale mail。累计税金不能要求等于 candidate 的绝对值，因为别的购买可能已经继续增加；receipt 位于同一事务最后，存在即证明之前的税金和资产写共同提交。恢复成功后发布完整 reload 以吸收其他 Node 的赢家状态。

## 验证证据

- planner、失败关闭、真实 durable scope、零税路径和模糊 COMMIT：`server/node/test/mysql-market-buy-conditional-save.test.js`。
- 经济、profile/cancel 条件写和共享事务定向回归 `133/133`；存储单文件回归 `36/36`。
- 一次性隔离 MySQL 9.7.0-er2、REPEATABLE-READ、随机非 3306 端口、128 MiB buffer pool：
  - 两个买家购买不同挂单均成功，税金最终为两笔之和，并观察到税金尾部行锁等待。
  - 两个买家抢同一挂单严格一胜一败。
  - 购买后的 stale legacy 全局文档被拒绝，不能覆盖累计税金。
  - 重复 receipt 发生在扣款、删单、邮件和税金写入之后，仍整笔回滚。
  - `deadlockDelta=0`、`activeTransactions=0`、`activeLockWaits=0`、`cleanupVerified=true`。

测试只使用一次性 mysqld 和非玩家 schema，不连接或修改玩家数据库。

## 明确未完成

- 装备市场购买及 equipment envelope tombstone 仍走 legacy。
- 邮件部分领取、邮件删除和装备信封跨资源事务属于 P0.6d-2c-3。
- 其他 Node 的内存市场列表、邮件列表和累计税金仍可能短暂陈旧；跨 Node 失效/read-through 与统一容量门槛属于 P0.6d-2c-4。
- buy-vs-cancel、重复 mail ID 和双向互买的更多真实锁序矩阵可在 2c-4 统一门槛补齐。
