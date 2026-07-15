# Phase 272：跨 Node 银行装备归属读穿

## 目标与父项审计结论

本阶段完成 `P0.6d-2c-9`，修复两个会让玩家在另一 Node 上持续看到“资产不存在”的读边界问题：

1. 市场购买/撤单的领域接口兼容 `listingId` 与旧字段 `id`，但共享读穿只识别 `listingId`；旧客户端可因此跳过 MySQL 权威市场读取，对远端新挂单持续返回 `market_listing_missing`。
2. Phase270 已覆盖装备邮件领取后的上架和转寄，却没有覆盖银行。远端领取装备邮件后，旧 Node 的 profile 仍没有新实例，`bankDeposit` 会在进入保存前返回 `equipment_instance_missing`；global revision 没有变化，同一 Node 重试也无法自愈。远端存入银行后，另一 Node 取出同样会先看到 `bank_equipment_selection_stale`。

父项审计同时确认 `P0.6d-2c` 仍不能关闭：资产 HTTP 写入口尚未强制操作标识；2 万活动回执达到上限后，回执清理会使条件 planner 退化为 `legacy_global_cas`；邮箱、装备归属 registry 与通用 diff 仍有随历史实体增长的无界扫描；复杂装备 legacy 路径还缺最终真实 MySQL 交错、strict identity 全回滚和模糊 COMMIT 门槛。这些缺口已统一回写主计划，没有用本次修复掩盖。

## 原因

装备所有权是跨容器事实，不只存在于背包：

- profile 中的物化装备与 `transferProvenance`；
- profile 银行中的私有装备信封；
- 当前账号邮箱中的活动装备信封；
- 最多 120 条市场挂单中的活动装备信封；
- 已消费装备信封的永久墓碑。

银行写仍属于 `legacy_global_cas`。该围栏可以阻止旧候选覆盖数据库，却只能在候选已经进入保存时生效；当旧 profile 在领域校验阶段找不到刚由另一 Node 物化的实例或银行信封时，请求会在保存前失败，CAS 没有机会帮助玩家刷新。

不能只刷新 actor profile。远端邮件领取、市场购买/撤单和银行存取都可能同时在上述多个容器之间移动同一件装备；只替换其中一个容器会形成“新 profile + 旧邮件/市场”的混合根，触发重复归属保护。

## `equipment_ownership` 读穿合同

仅当 `bankDeposit` 或 `bankWithdraw` 的物品列表中包含服务端装备目录识别出的装备时，服务端构造：

```json
{
  "schemaVersion": 1,
  "scope": "equipment_ownership",
  "accountId": "当前账号",
  "includeProfileMailPartitions": true
}
```

MySQL 在同一个 `REPEATABLE READ` 事务里读取并认证：

1. 当前 global revision；
2. 当前完整市场簿及其卖家账号，市场条数仍受 120 条硬上限保护；
3. 仅当前 actor 的 binding/profile；
4. 仅当前 actor 的完整邮箱分区；
5. 市场、actor 邮箱、actor 银行和物化装备所引用的装备信封 ID；
6. 仅上述 ID 对应的消费墓碑；
7. 当前 market config 文档。

view certifier 额外要求：

- `equipment_ownership` 必须同时带市场簿、market config 和 actor 邮箱；
- profile replacement 必须精确等于 actor，不能夹带市场卖家档案；
- 邮箱 replacement 必须精确等于 actor；
- 市场卖家账号、binding/profile revision、邮件收件人和墓碑引用都必须通过既有 canonical 认证；
- 返回 scope、account 和 `includeProfileMailPartitions` 必须与请求完全一致。

任何读取、认证或 revision 漂移失败都按既有 shared-read 规则失败关闭或完整 reload，不回退旧缓存。

普通石币和普通道具银行存取不创建该 scope，保持零额外共享资产读取。

## 写入边界不变

本阶段只让复杂装备银行操作在构造候选前看到同一份权威所有权切片：

- `bankDeposit` / `bankWithdraw` 仍使用 `legacy_global_cas`；
- 没有新增银行条件 planner，也没有改变数据库锁序；
- 新银行信封、消费墓碑和 durable receipt 的 strict identity 规则不变；
- 没有改变银行容量、装备状态、经济数值或客户端协议；
- 市场旧字段 `id` 只恢复既有兼容语义，不新增新的客户端字段。

因此本阶段的结论是“银行装备跨 Node 可立即操作且仍保守串行”，不是“银行装备已经按行并行”。

## 红绿验证

修复前四个定向场景稳定失败：

- 旧字段 `{id}` 购买远端新挂单：`market_listing_missing`；
- 旧字段 `{id}` 撤销远端新挂单：`market_listing_missing`；
- 远端领取装备邮件后在旧 Node 存银行：`equipment_instance_missing`；
- 远端存入银行后在旧 Node 取出：`bank_equipment_selection_stale`。

修复后验证：

- 两个市场旧字段请求都会先读取权威市场并成功；
- 远端领取后一次存入成功，旧邮件不复活、来源墓碑保留、物化实例只移除一次；
- 远端存入后一次取出成功，银行信封只消费一次、目标背包只出现一个实例；
- 两个银行装备操作的最终保存仍无 conditional consistency scope；
- 普通石币存入保持零 shared read；
- MySQL 投影只读取 actor profile/邮箱、完整有界市场及引用墓碑；
- 缺 actor 邮箱或夹带卖家 profile 的畸形 view 被 certifier 拒绝。

定向验证命令：

```text
node --test \
  server/node/test/shared-asset-read-model.test.js \
  server/node/test/mysql-shared-asset-read.test.js \
  server/node/test/auth-shared-asset-read-through.test.js
```

结果为 `55/55`。银行经济与 durable COMMIT 相邻回归为 `97/97`；改动生产/测试文件 `node --check` 与 `git diff --check` 通过。

本阶段没有运行完整本地 CI，没有连接共享玩家库，没有修改 MySQL 全局或持久参数，也没有以 fake RR 结果冒充真实多 Node MySQL 容量结论。

## 后续顺序

父项按风险和收益继续拆为：

1. 市场、邮件、银行资产写 HTTP 入口强制合法 `Idempotency-Key`，确保条件事务、断线重放和模糊 COMMIT 恢复不能被改包绕过；
2. 允许条件 planner 在 2 万回执稳态下认证并原子删除有界过期回执，避免永久退化到 global EXCLUSIVE；
3. 把邮箱读取/已读写、装备所有权 registry 和通用 diff 热路径改成有界索引或 touched-set 驱动；
4. 补复杂装备 legacy 的真实 MySQL 交错、重复 listing/envelope 整单回滚和模糊 COMMIT 精确重放门槛。

以上完成并复审后，才决定是否同时关闭 `P0.6d-2c` 与 `P0.6d-2`。
