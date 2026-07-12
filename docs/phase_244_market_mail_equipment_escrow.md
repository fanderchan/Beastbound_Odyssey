# Phase244：交易所与邮件装备托管信封

## 问题复现

Phase240 为避免复制和状态丢失，暂时禁止装备进入交易所、邮件与面对面交易；Phase242/243 已建立严格实例信封和银行实例存取，但交易所挂单与邮件附件仍只有 `itemId/count`。直接解除限制会丢掉耐久、强化、磨损、充能、来源和未来词缀，也无法让玩家在同名装备中选择具体一件。

本阶段还复现了三类更隐蔽的资产风险：

- MySQL 邮件/挂单行若 SQL 主键与 JSON 内部 ID 不一致，旧加载器会用内部 ID 重键；删除时可能删错行，重启后让已领取资产复活。
- 同一信封 ID 同时存在于银行、邮件、市场或已实例化装备时，逐容器校验不能阻止另一个 writer 先卖店、丢弃或再次导出，进而洗掉冲突证据。
- `E1 邮件领取 → 导出 E2 → 领取 E2 → 导出 E3` 后，实例只保留最后一跳来源；若旧备份里的 E1 再出现，仅靠“读取→导入→删除”事务无法证明 E1 已消费。

## 原创 Beastbound 规则

### 1. 交易所托管具体装备实例

- 普通挂单继续使用 schema1；装备挂单使用 schema2，并且只能包含一件完整私有 `equipmentEnvelope`。
- 客户端上架只提交 `itemId/count=1/instanceId/sourceSlotIndex/unitPrice/currency`。服务端复核背包格和具体实例，导出信封、删除源模板/实例并创建挂单，只持久化一次。
- 购买与撤单只接受 `listingId`。服务端从挂牌读取可信信封，导入时分配目标档案的新实例 ID，再删除挂单；背包满、余额不足、卖家缺失、指纹/版本/身份异常时，钱包、revision、信封和挂单均不变。
- 历史 template-only 装备挂单继续返回不可迁移错误；普通物品挂单保持兼容。
- 市场书全局审计 SQL key、内部 `listingId` 和信封身份。市场成交邮件 ID 有限次数避碰，耗尽时整笔购买或教学结算失败，不覆盖旧邮件。

### 2. 邮件 schema2 支持精确附件与部分领取

- schema2 邮件固定保存普通 `items[]`、私有 `equipmentEnvelopes[]` 和 `currency`；装备汇总数量必须与信封逐物品一致。
- 发送端只能提交具体装备选择意图，不能提交完整信封、状态、指纹或 provenance。当前玩家界面不开放装备寄件入口，避免在收费与交易规则未定前形成免税赠送通道；服务端合同与测试先完整保留。
- 领取仍只提交 `mailId`。可放入背包的具体装备和普通物品会领取，装备容量不足的信封原样留信；货币按现有规则入账。任何坏/future/重复/跨邮件信封或未知附件都会使相关事务失败关闭。
- 邮件 map key、内部 `mailId` 与收件账号必须 canonical；一个玩家邮箱里的坏信不会让其他玩家邮箱全局不可读。
- 公开邮件只显示玩家需要的强化、耐久、磨损、充能和词缀摘要，不返回来源、内部实例 ID、消费账本或冲突路径。

### 3. 永久消费墓碑与全局归属隔离

- 根快照新增 append-only `consumedEquipmentEnvelopes`。每个已导入的 `envelopeId` 留下不可删除、不可改写的最小墓碑；所有新信封 ID 同时避开活动托管、已实例化来源和永久墓碑。
- 银行取出、市场购买/撤单和邮件领取在同一候选事务中记录当前信封墓碑；已领取装备再次导出时，旧来源也会前向回填，保证 E1→E2→E3 后 E1/E2 永久不可重用。
- 旧档案中顶层实例和银行/邮件/市场嵌套状态的可见历史来源会在规范化及迁移时确定性回填。userdata 导入先回填旧 MySQL 目标档案，再覆盖目标角色，不能因导入档少一件装备而抹掉最后证据。
- 全局 registry 同时审计活动银行/邮件/市场 owner、materialized trace 与墓碑。`consumed+一个 trace` 是合法当前资产；活动 owner 与 trace 并存、两个 trace 同源、活动 owner 重现已消费 ID、活动 owner 重复或坏账本都会冻结资产 writer。
- 冻结时登录、角色读取和邮箱读取仍可用；出售、丢弃、合成、银行、市场、邮件等资产写入在执行前返回固定玩家安全错误，不暴露 ID、账号或持久化路径。QA 整档写入也先在候选副本审计，失败不会污染缓存。

### 4. MySQL 行身份与只增账本

- 邮件和挂单加载以 SQL 主键为 map key，保留内部 ID 漂移供 domain audit 失败关闭，避免删错行后重启复活。
- 墓碑使用独立 `consumed_equipment_envelopes` 表；`envelope_id` 为 `VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY`，无可变 JSON payload。
- MySQL diff 只允许追加墓碑，删除或改写在开启事务前拒绝；重复 INSERT 是同 key 的幂等 no-op，可承受“事务可能已提交但响应丢失”的重试。
- 新墓碑、角色导入、邮件/挂单删除都进入同一个 MySQL `START TRANSACTION … COMMIT`。只读迁移连接会先检查表是否存在，旧库没有新表时仍可 dry-run，且不会执行 DDL。

## 客户端与玩家表现

- 交易所出售列表把同名装备展开成具体实例，数量锁定为 1；普通物品仍聚合数量。
- 挂单、我的挂单和邮箱详情显示公开装备状态；重复、损坏、摘要漂移和历史 template-only 行保持可见但按钮禁用。
- 买入、撤单和领取请求只带服务端身份键；客户端展示模型不保留 `instanceState/stateFingerprint/provenance` 等内部字段。
- 本阶段不新增面对面交易 UI，也不实现 P0.5b-3d 的隐藏 legacy 交易实例预约。

## 涉及文件

- 服务端状态与归属：`equipment-envelope-consumed-ledger.js`、`equipment-envelope-registry.js`、`market-listing-state.js`、`mail-attachment-state.js`
- 服务事务与迁移：`economy.js`、`mail-chat.js`、`auth-service.js`、`equipment-profile-migration.js`、`profile-migrations.js`、`migrate-local-userdata-to-mysql.js`
- MySQL：`mysql-store.js`
- 客户端：`equipment_escrow_client_model.gd`、`server_auth_client_model.gd`、`panel_flow_coordinator.gd`、`auto_check_coordinator.gd`

## 验证与证据

```text
node --check <20 个本阶段相关 JS 文件>
node --test <账本/registry/市场/邮件/隔离/经济/社交/迁移/存储/公开投影聚焦集合>
node --test --test-name-pattern='HTTP server exposes player search and mail endpoints' server/node/test/auth-http-server.test.js
godot --headless --path client/godot --quit
node tools/run_godot_auto_checks.mjs --only=--auto-equipment-instance-check,--auto-market-panel-check,--auto-mailbox-check --fail-fast --timeout-ms=180000
git diff --check
```

- 服务端最终聚焦 `147/147`，HTTP 邮件路由 `1/1`；覆盖 E1→E2→E3、多容器/双账号同源、旧目标迁移、部分领取、容量回滚、MySQL row key、append-only、旧库无表和模糊提交重试。
- Godot 4.7 解析加三个唯一聚焦检查 `4/4`。
- 1280×720 可见证据：`.run/evidence/phase244/market_equipment_escrow.png`、`.run/evidence/phase244/mail_equipment_escrow.png`。
- Phase243 基线 idle `process_total≈0.10–0.44ms`、moving `≈0.16–0.29ms`；本阶段最终客户端 idle `≈0.20–0.49ms`，同一 UI 工作树的 moving `≈0.23–0.29ms` 且 `status=ok`。新展示模型未进入 `_process/_draw` 热路径。
- 未运行无关完整 343 项或 `tools/run_local_ci.mjs`，未连接或改写真实 MySQL/玩家档案。

## 已知残余与后续门槛

- 现有 `createAsyncWriteAuthStore` 会先排队再让服务请求返回；健康路径的 SQL 内部事务原子，但“玩家收到成功”尚不等于 durable commit。进程崩溃或断电仍可能回滚玩家已看到的成交/领取，已列入 P0.5c，Phase244 不宣称请求级 durable。
- 墓碑和全服归属当前仍在线性扫描；已移除一次重复规范化和多余完整 ID 投影，但长期 5万/10万墓碑需要增量索引、dirty cache 和压力门槛，列入 P0.6。
- exactly-once 目前建立在单 Node 权威进程上；横向多进程前需要数据库 CAS/行锁。
- 代码只能回填当前存档仍可见的历史来源；上线前若真实旧档已经丢失更早祖先链，需用只读备份审计确认，不能凭空重建。

## 玩家验收建议

无需当前立即试玩。后续人工验收可用两个 GM 测试号准备两件同名不同强化/耐久木棒：分别上架、撤单、购买和邮件领取，确认状态保持且接收方得到新本地实例 ID；背包塞满时确认挂单/信件不丢；历史 template-only 行应显示异常且不可点击。自动检查和截图已覆盖本阶段提交门槛。
