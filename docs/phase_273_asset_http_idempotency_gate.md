# Phase 273：资产 HTTP 幂等入口门槛

## 目标与结论

本阶段完成 `P0.6d-2c-10`，封住市场、邮件和银行资产写在没有 durable operation ID 时仍可执行为 legacy 写的入口。

以下 8 条玩家 `POST` 现在都必须携带合法 `Idempotency-Key`：

| 领域 | HTTP 路径 | 服务方法 |
| --- | --- | --- |
| 银行 | `/bank/deposit` | `bankDeposit` |
| 银行 | `/bank/withdraw` | `bankWithdraw` |
| 市场 | `/market/list` | `createMarketListing` |
| 市场 | `/market/buy` | `buyMarketListing` |
| 市场 | `/market/cancel` | `cancelMarketListing` |
| 邮件 | `/mail/send` | `sendMail` |
| 邮件 | `/mail/:id/read` | `markMailRead` |
| 邮件 | `/mail/:id/claim` | `claimMailAttachments` |

缺失 key 返回 HTTP 400 `idempotency_key_required`，非空但不符合既有 durable operation ID 格式的 key 返回 HTTP 400 `idempotency_key_invalid`。两类拒绝都不会调用领域方法，也不会进入共享资产读取、精确回执读取、候选构造或存储写入。

相同 key、相同账号和相同请求重试时，服务端继续使用 Phase247 已建立的 durable receipt 合同返回第一次结果；同 key 改请求、改动作或换账号仍按既有合同返回冲突，不能把一个操作标识用于第二笔资产变更。

## 两层失败关闭

### HTTP 边界

HTTP 路由在调用资产服务前统一检查上述 8 条路径。合法格式继续复用服务端既有 `DURABLE_OPERATION_ID_PATTERN`：16～160 位 ASCII 字母、数字及 `._:-`，不复制另一套正则，也不把官方客户端的 `bbo_` 生成前缀误当成服务器授权条件。

`Idempotency-Key` 本身不是权限凭证。服务器仍通过当前会话认证账号，并把第一次回执绑定到服务器计算的 request hash、HTTP action 和 account ID；客户端只能提交操作标识，不能提交或改写这些权威绑定事实。

### durable service 边界

只在 HTTP 层检查仍可能被未来漏挂路由或直接 `invokeDurable()` 绕过。因此 `executeDurableMutation()` 对同一组 8 个方法再次要求非空 operation ID，并在以下工作之前返回失败：

1. shared asset read；
2. exact durable receipt read；
3. 领域校验和候选执行；
4. store save 或 MySQL 事务。

这条 service 门槛只收紧 durable 调用。原始同步领域方法仍保留给隔离的 memory/domain fixture；正式异步持久化路径不能借此绕过 `invokeDurable()`。既有 event hub、运行态维护和其他内部无 key 调用不属于这 8 个资产方法，不受影响。

## 官方客户端重试合同

银行、市场和邮箱三个面板各自持有 focused idempotent HTTP retry state。一次玩家操作只准备一次 request spec 和一个 key，随后所有自动重试都复用该 spec，不会在重试时重新生成 key。

重试只覆盖网络失败和既有可重试 HTTP 状态，focused state 即使收到更大的配置也硬限制最多 3 次；成功、确定性业务失败、面板会话取消或重试耗尽后结束并清除当前 spec、token、请求体和 key。8 条路由对应的 9 个官方请求 builder（市场普通上架与装备上架是两个 builder）都属于 durable mutation，并由客户端验证合同逐个检查会生成一个格式合法的 key。

市场和银行不再使用永久完成回调，而是每次 attempt 绑定当前操作代次的一次性回调；邮箱同样为每次 attempt 重连绑定当前 session ticket 的一次性回调。登录 token 轮换会先递增代次、断开回调并取消请求，因此旧账号已经排队的迟到 signal 不能结束、解析或覆盖新账号刚发起的请求。

真实 HTTP 邮件回归进一步证明：同一账号用同一 key 重发完全相同的 `/mail/send`，第二次返回 durable replay，mail ID 与第一次一致，收件箱只生成一封邮件。

## 兼容性与非目标

- 客户端协议继续保持 10。幂等 key、request hash、durable receipt 和 replay 语义已由 Phase247 建立，本阶段只是让未发行项目中的关键资产入口强制执行既有合同，不是新的网络数据结构。
- 旧手工脚本或旧客户端若不发送 key，会明确收到 HTTP 400；不会为了兼容而回退成无回执写。
- 市场和邮箱读取不需要 key。
- 商店、装备、面对面交易、`profileAction` 与 GM 市场配置不在本阶段新增强制范围内；本阶段不顺带扩大产品或经济规则。
- 本阶段不调整 `DURABLE_RECEIPT_EXCLUDED_METHODS` 或 exact precheck/failure-reconcile 策略，不给健康热路径增加新的无条件 MySQL receipt read。
- 没有修改市场、邮件、银行数值，没有迁移玩家数据，没有连接真实数据库，也没有修改共享 MySQL 全局或持久参数。

## 验证

最终已确认：

- 服务端 durable、HTTP 与 shared-read 组合回归 `115/115`；
- 8 路 HTTP 缺失/非法 key 都返回 400 且没有进入 durable coordinator，service 直调缺 key 在 shared read/save 前拒绝，合法 key 才按 8 个预期方法放行；
- 邮件真实 HTTP 同 key replay 返回同一 mail ID，且只产生一封邮件。
- Godot 4.7 headless parse 与 `--auto-client-version-check` 为 `2/2`；输出确认 9 个官方资产 builder（含普通/装备上架）的 `asset_builders=true`、`retry_state=true`、`protocol=10`，并用人为配置 5 次的 spec 证明 focused state 第 3 次即结束、没有第 4 次发送，取消后敏感 spec 已清空。

本阶段没有人为制造一次真实断网或 503 来录制三个面板的完整 UI 过程；状态机、builder 与信号生命周期已自动检查和代码复审，真实网络中断仍留最终整体验收。未运行完整本地 CI，也未以 memory/fake store 结果冒充真实 MySQL 或多 Node 容量证据。

## 后续

`P0.6d-2c` 父项继续保持未完成。下一项是 `P0.6d-2c-11`：让条件 planner 在 2 万 durable receipt 稳态下认证并原子执行有界过期 DELETE 与新 receipt INSERT，避免达到上限后永久退化为 global EXCLUSIVE/legacy global CAS。
