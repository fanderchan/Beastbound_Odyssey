# Phase245：legacy 面对面交易装备预约与双档原子交换

## 问题复现

Phase240 为避免只移动模板、遗失耐久与强化，暂时拒绝装备进入面对面交易。Phase242–244 已建立实例信封、目标档本地 ID、永久消费墓碑和全局归属审计，但旧 `/trade/*` 协议仍只理解 `itemId/count`。

本阶段还固定复现了三项独立风险：

- 旧 `acceptTrade()` 先在权威缓存中改写双方档案并删除报价，再调用 `save()`；同步存储抛错时，持久层未改变，运行时却已交换资产且报价消失。
- `stoneCoins: "not-a-number"` 会被旧 normalizer 转成 `NaN`，绕过余额和钱包上限比较，最终把双方石币写成 `null`。
- 运行时报价和取消都会触发一次持久化写，但 `tradeOffers` 本来就会在持久快照中清空；公开接口可用无效报价放大数据库写压力。

旧 normalizer 还会先丢弃完整信封、实例状态和来源字段，再把物品列表静默截断。装备意图若沿用该入口，服务端无法区分“选择具体实例”和“客户端伪造状态”。

## 原创 Beastbound 规则

### 1. 发起交易只做运行时乐观预约

- 普通物品继续兼容 `items/offerItems`；装备每行必须恰好提交 `{itemId,count:1,instanceId,sourceSlotIndex}`。
- 根请求与物品行都使用严格白名单；`equipmentEnvelope`、`stateFingerprint`、`instanceState`、`provenance`、重复别名和其他未知字段全部在 normalize 前拒绝。
- 石币只接受 JSON safe integer，范围为 `0..随身石币上限`；字符串、`NaN` 来源、浮点、负数、超安全整数和冲突别名均失败关闭。
- 服务端在候选副本中验证具体背包装备，预约只保存物品、源实例、源格和服务端状态指纹。它不扣模板、不删实例、不生成可消费信封、不写墓碑，也不是全局信封 registry 的托管 owner。
- 同一实例不能同时支持两笔活动报价。每对玩家同向只保留一笔待确认报价，并设全局 256、单账号发出 8、单账号收到 16 的运行时上限；交易 ID 有 16 次碰撞保护。
- 报价、取消和过期只改变运行时 `tradeOffers`，不再制造无意义 MySQL/JSON 持久写。进程重启丢弃报价时，双方资产从未离开档案。

### 2. 接受时重新验证全部事实

接受方只提交报价 ID、自己的普通物品/具体装备选择和石币。服务端重新检查：

- 报价身份、schema、期限和装备汇总与预约数量；
- 双方仍存在、同图、停稳且距离不超过两格；
- 双方均不在战斗或离线挂机；
- 发起方预约实例仍在原背包选择位置，状态指纹未因强化、耐久、磨损、充能、词缀或未知字段变化；
- 接受方还价装备是当前背包中的具体实例；
- 双方绑定状态、普通物品、石币、钱包上限、背包容量和装备实例 serial 仍合法。

任一事实变化都保留报价，并保持双方档案、revision、石币、墓碑和实例逐字不变。玩家需要取消或重新发起，不会由服务端猜测“同名另一件装备”。

### 3. 双档候选根只提交一次

健康接受顺序固定为：

```text
读取权威根并验证报价
→ clone 整份候选根
→ 导出双方全部待付装备，先释放背包空间
→ 扣除/加入普通物品和石币
→ 为实际交换分配唯一 eqx_trade_* 信封
→ 交叉导入并在目标档分配新的本地 instanceId
→ 回填待付实例的旧来源墓碑
→ 追加本次全部信封墓碑
→ 删除候选报价并运行全局 registry 审计
→ 双方 revision 各加一次
→ save(candidateData) 一次
```

强化、耐久、磨损、充能、来源和未来 JSON-safe 字段完整保留；源实例 ID 不作为目标身份。同步 `save()` 抛错时，原权威缓存和待确认报价仍可重试。健康 MySQL 路径继续由一次根保存中的同一数据库事务写两份 profile、两份 binding 和全部新墓碑。

### 4. 隐藏协议与玩家界面边界

- 普通玩家界面仍只显示底部“买卖”交易所；玩家互动面板没有面对面交易按钮、物品框或接受控件。
- Godot 只保留隐藏请求构造器，并重建白名单字段；客户端不能回传信封、指纹或来源链。
- `trade/state`、发起和接受响应只公开物品汇总、账号显示信息和当前玩家权威档案；运行时预约、源实例 ID、源格、状态指纹和 `transferProvenance` 不出服务边界。
- 装备实例的既有公开 `source` 是客户端档案兼容字段，不等同于私有跨账号 `transferProvenance`；本阶段不改变该既有公开合同。

四个 `/trade/*` 路由仍按既定 legacy 兼容方向对正常 session 可调用。这意味着改包客户端仍可使用零税面对面交换，普通物品早已存在该边界，本阶段把装备补齐。若正式运营要求服务端强制所有普通交易进入交易所，应在 P1.6 明确直交易开服开关、税、绑定与审计规则；本阶段不暗改既有经济规则。

## 涉及文件

- 预约与信封：`equipment-trade-reservation.js`、`equipment-transfer-envelope.js`
- 权威交易事务：`economy.js`
- 迁移审计：`equipment-profile-migration.js`
- 隐藏客户端合同：`server_auth_client_model.gd`、`auto_check_coordinator.gd`
- 服务、HTTP、迁移和纯规则测试：对应 `server/node/test/` 文件

## 验证与证据

```text
node --check <本阶段所有改动 JS>
node --test <预约/信封/经济/迁移/存储/社交/隔离/公开投影聚焦集合>
node --test --test-name-pattern='HTTP legacy trade routes' server/node/test/auth-http-server.test.js
godot --headless --path client/godot --quit
node tools/run_godot_auto_checks.mjs --only=--auto-equipment-instance-check,--auto-stage6-content-check --fail-fast --timeout-ms=180000
git diff --check
```

- 服务端最终聚焦 `160/160`；覆盖双向装备、普通物品和石币混合交换，双方同名本地实例 ID，状态/未来字段保留，预约移动或指纹变化，满包回滚，绑定/战斗/离线挂机，重复接受，同实例双报价，容量与 ID 碰撞耗尽，E1→E2 墓碑，严格币值，根/行字段注入，同步保存失败和 proposal/cancel 零持久写。
- HTTP `1/1`，覆盖鉴权、schema2 发起/state/接受和私有字段不泄漏；本阶段 9 个改动 JS 文件语法检查及 `git diff --check` 通过。
- Godot 4.7 解析加两个唯一检查 `3/3`；装备请求白名单和 Stage6 玩家入口门禁均通过，日志 `.run/godot_auto_checks/2026-07-12T02-38-08-124Z.log` 中 `request_whitelist=true`、`old_trade_removed=true`。
- 本阶段没有可见 UI、移动、绘制或每帧热路径改动，因此不新增截图或性能探针；proposal/cancel 的持久写次数从每次 1 次降为 0。
- 所有测试使用 memory/counting/fake store；未连接或改写真实 MySQL、玩家账号或 GM 档案。

## 已知残余与后续门槛

- `createAsyncWriteAuthStore` 仍可能在 MySQL 真正 COMMIT 前向调用层返回；进程崩溃或断电后的 durable ACK/幂等恢复属于 P0.5c-2。
- 单 Node 同步调用依靠先成功者删除报价防重；横向多 Node 的 CAS、行锁和容量压力属于 P0.6。
- 零税 legacy 直交易是否在正式服开放是经济产品规则，转入 P1.6，不以隐藏 UI 冒充服务端禁止。
- 真实旧档已经丢失的更早 provenance 仍无法凭当前代码重建，继续要求上线前只读备份审计。

## 玩家验收建议

当前不需要试玩。普通玩家画面不应出现任何新入口；本阶段价值是隐藏协议、资产安全和失败回滚。若后续决定正式开放面对面交易，再单独设计具体实例选择 UI、双方锁定/确认节奏、税与反诈骗提示。
