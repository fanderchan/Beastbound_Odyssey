# Phase252：P0.6a-1 永久装备墓碑在线热路径隔离

## 问题复现

P0.5b/5c 建立了永久装备信封墓碑和 durable COMMIT，但权威根仍把历史墓碑当作每次请求都要重新复制、排序和审计的普通 JSON。隔离内存基准固定 200 份最小档案后得到：

| 永久墓碑 | registry 中位 | 普通银行写 | 无落库战斗邀请 |
| ---: | ---: | ---: | ---: |
| 0 | 0.16ms | 6.43ms | — |
| 50,000 | 48.78ms | 716.17ms | — |
| 100,000 | 94.84ms | 1,614.57ms | 834.88ms |

银行写只存入 1 石币；战斗邀请只查询不存在的目标且不执行 SQL。退化来自 registry、durable candidate、normalizer、async store 和 MySQL diff 之间反复深拷贝/全扫同一份历史账本，不是本次业务本身。

## 本阶段规则

### 1. 启动审计与在线查询分离

- MySQL/JSON/迁移输入第一次进入服务时，仍逐条校验墓碑 ID、schema 和 map-key 身份，并确定性回填仍可见的 materialized origin；坏账本继续失败关闭。
- 通过审计的账本与记录被冻结，并建立仅服务端持有的 membership index。之后 `has/count` 不再重新 `Object.keys().sort()` 或克隆全部记录。
- 只有这个已验证、不可变的 canonical ledger 可以跨请求 candidate 共享；未验证、损坏或外部传入的对象仍执行完整深拷贝，不能借缓存绕过审计。

### 2. 请求私有 candidate 保持回滚安全

- 普通战斗、商店、银行、邮件等没有新增墓碑时，共享同一个不可变账本引用；档案、钱包、房间和其他可变状态仍为请求私有深拷贝。
- 真正新增墓碑继续 copy-on-write，得到新的冻结账本；明确失败不会污染已发布根，COMMIT 前也不会把新增 ID 暴露给后续请求。
- `snapshot()`、备份、迁移和显式导出仍物化完整账本。它们是低频管理路径，不用在线热路径优化冒充无审计。

### 3. MySQL warm path 不重复规划历史墓碑

- MySQL load 后保留 canonical ledger 身份；普通保存前后的账本引用相同，diff 直接跳过永久墓碑集合。
- `/health` 使用不重载权威根的存储探针；健康检查不会替换 MySQL writer 的 diff baseline，也不会让下一笔普通保存重新全扫历史墓碑。
- 账本 count 使用已验证 index 的常数时间读取；账本引用真正变化时仍执行 append-only 差异校验，删除和改写继续在事务前拒绝。Phase257 起这些诊断计数不再写入共享 `server_state`，运维统计按实体表或有效账本读取。
- 本阶段没有改变 SQL schema、档案 schema、客户端协议或玩家文案。

## 非目标与剩余风险

- 新增墓碑本身当前仍需 copy-on-write 全量对象；20,000 条 durable receipt 也仍会 normalize/prune。P0.6a-2 将改为 touched-row/append delta dirty journal，并先补 production planner + recording fake pool 门槛；真实 MySQL 引擎证据另行验证。
- 200 人同 AOI 的单次位置 fanout 只读复测仍约 451–457ms、约 4.78MB JSON；AOI 桶、位置增量、慢消费者背压和真实 200 WS 连接属于 P0.6b。
- 两个 Node 仍可从各自旧快照无条件 upsert，出现 last-writer-wins、重复购买或重复领取。数据库 revision/CAS、`FOR UPDATE` 和资源行锁属于 P0.6d；本阶段不宣称多 Node 安全。
- 本阶段未连接真实 MySQL、未修改真实账号/玩家档案，也不宣称已支持 200 人同地图。

## 涉及文件

- `server/node/src/auth/equipment-envelope-consumed-ledger.js`
- `server/node/src/auth/equipment-envelope-registry.js`
- `server/node/src/auth/authority-root-clone.js`
- `server/node/src/auth-service.js`
- `server/node/src/auth/economy.js`
- `server/node/src/auth/gm-qa-assets.js`
- `server/node/src/mysql-store.js`
- `server/node/src/http-server.js`
- 聚焦测试与 `tools/p0_6_tombstone_capacity_gate.mjs`

## 验证与证据

容量门槛为每档独立子进程，固定 200 档案、0/5万/10万墓碑，先预热 5 组，再采集 20 组原始样本。银行写 p95 上限 75ms、战斗邀请 50ms；10 万相对 0 的历史增量不超过 30ms，且不得超过 `max(0档×4, 0档+10ms)`；测量区间 GC 后 heap 增长不超过 32MiB。工具还断言档案/墓碑数量、银行 revision、25 次精确保存、失败战斗 0 保存和墓碑数量不变，并输出 Node/CPU/HEAD/dirty 状态与全部原始样本：

```text
node --expose-gc tools/p0_6_tombstone_capacity_gate.mjs

0:      bank p95 32.30ms, battle p95 20.04ms
50,000: bank p95 34.85ms, battle p95 21.84ms
100,000:bank p95 17.61ms, battle p95 11.28ms
heap growth: each 0.9MiB
status: ok
```

正确性定向回归：

```text
node --test \
  server/node/test/authority-root-clone.test.js \
  server/node/test/equipment-envelope-consumed-ledger.test.js \
  server/node/test/equipment-envelope-registry.test.js \
  server/node/test/auth-durable-commit.test.js \
  server/node/test/auth-storage.test.js

node --test --test-name-pattern='health uses the non-mutating storage probe' \
  server/node/test/auth-http-server.test.js

node --test \
  server/node/test/auth-economy.test.js \
  server/node/test/auth-social-world.test.js \
  server/node/test/auth-gm-qa-assets.test.js

node --test \
  server/node/test/profile-migrations.test.js \
  server/node/test/profile-migration-batch-ops.test.js \
  server/node/test/local-userdata-migration-script.test.js \
  server/node/test/mysql-profile-migration-script.test.js \
  server/node/test/auth-equipment-envelope-quarantine.test.js
```

- 已验证核心聚焦 `43/43`、HTTP health `1/1`、资产/社交/GM `83/83`、迁移/隔离 `47/47`（最终命令复跑结果为准）。
- 本阶段没有玩家画面变化，不需要截图或视频；人工可见行为应完全不变。
