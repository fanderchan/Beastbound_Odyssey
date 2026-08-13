# Phase 421：系统奖励 vault-first 与可领取兜底

## 目标与边界

本阶段完成 `P0.6d-2c-12b-3d` 的服务端闭环：市场成交、教学成交、资格奖励和普通战斗背包溢出不再依赖“必须先塞进活动邮箱”才能成立，而是先在原业务 durable 事务中写入一条具有确定来源身份的奖励仓记录；玩家通过账号范围内的分页读取和幂等领取接口，把资产与自己的档案 revision、领取状态和 durable receipt 一次性提交。

奖励仓不是第二套背包，也不是新的随机奖励规则。客户端不能提交奖励内容、来源、金额或领取结果；服务端仍从权威市场挂单、税率、战斗房间、奖励表和资格周期推导资产。奖励仓只接受普通物品与石币／钻石，任何装备物品或装备信封都失败关闭；资格奖励中的装备继续沿用既有“直接生成精确实例并要求背包空间”规则，不进入奖励仓，等待 `P0.6d-2c-12c` ownership registry 后再评估是否开放装备 vault。

本阶段没有启用真实数据库开关，没有连接或修改共享 MySQL，也没有给正常客户端增加半成品入口。正式服必须等 `3e` 的“收信／奖励／归档／写信”客户端入口与 200 活动邮件上限一起完成后，才允许在备份和停服窗口中启用奖励仓；在此之前，正常运行 store 捕获的 flag 仍为关闭，市场和资格奖励继续走既有兼容路径。

## 确定来源与资产分流

四种来源都使用服务端 SHA-256 source key，并由 `(recipientAccountId, sourceKind, sourceKey)` 再确定性派生唯一 `rewardId`。同一业务事实重放只能命中同一物理身份，不能生成第二份资产。

| 来源 | 确定 source key 事实 | 进入奖励仓的资产 | 仍直接结算的资产 |
| --- | --- | --- | --- |
| 真实玩家市场成交 | `market_sale + listingId` | 税后实收货币；实收为 0 时不制造空奖励 | 买家物品、扣款与税金 |
| 教学市场成交 | `tutorial_market_sale + listingId` | 教学成交货款 | 上架扣物与任务“完成出售”进度 |
| 一次性资格奖励 | `qualification_reward + roomId + tableId + accountId + rebirthCycle` | 全部非装备物品与石币 | 装备精确实例、资格周期已领取标记 |
| 普通战斗溢出 | `battle_overflow + roomId + tableId + accountId` | 背包确实放不下的普通物品 | 能放入背包的物品与原有直接石币 |

教学成交从奖励仓领取时继续记录既有 `claim_mail/tutorial_market_sale` 任务事件并执行原有自动交付，因此会从 `quest_claim_market_mail` 正常进入 `quest_market_buy_player`；迁移到奖励仓不能让新手交易教学卡死。

## 奖励仓记录与生命周期

每条记录固定保存 source identity、recipient、不可变资产正文、source digest、data generation、revision 与时间戳。状态只允许：

1. `available`：资产已由原业务事务安全写入，可直接领取；
2. `mail_delivered`：只表示一封空附件通知已投递，资产仍只在奖励仓；
3. `claimed`：奖励行和玩家档案已经在同一事务完成领取。

状态只能单向前进。公开投影不包含 recipient account ID、source key、source digest、内部正文或 revision；领取前重新认证完整物理行、当前账号、背包空间、货币上限和档案身份。背包满或货币接近上限只返回固定中文错误，奖励保持原状态，不做部分领取。

`GET /rewards/vault?limit=...&cursor=...` 使用独立 `v=1/k=reward_vault` opaque cursor，按 `(createdAt DESC, rewardId DESC)` 做 recipient-only、`limit+1` keyset 读取，无 OFFSET。`POST /rewards/vault/:rewardId/claim` 强制合法 `Idempotency-Key`；同 key 重试重放首笔成功结果，不再次加物或加币，新 key 对已领取记录只得到已领取失败。

## 原子写入、领取与模糊提交

正常 MySQL Node 只使用启动时捕获的 generation 1／ready／vault-enabled control fence。奖励发放使用 strict INSERT，不接受 duplicate key 当成功：

- 市场购买的买家档案、挂单删除、税金、唯一奖励行和 receipt 位于同一条件事务；卖家实收为零时精确证明没有邮件、没有奖励行，仍保留原税率与成交结果；
- 教学成交、资格奖励和战斗溢出在其原 durable 候选中携带 typed reward write-set，条件计划无法证明完整写集时回退既有 global CAS，但仍在同一 COMMIT 内；
- 纯奖励行事务不推进全局 authority revision，只持共享兼容围栏并写确定性身份。COMMIT 回包丢失时使用独立 RR 事务锁 exact control 和每个 reward PK：全部行与 staged 正文逐字段一致才恢复成功，全部缺失才证明可安全重试，混合、篡改或读取失败固定 outcome unknown、不可盲重试；
- 领取事务固定锁账号 binding/profile、exact reward pre-image，再条件更新档案、奖励状态和 immutable receipt。跨 Node 或同 key 重放由 exact receipt 与 reward row CAS 共同阻止重复资产。

服务层额外禁止失败业务结果携带 staged reward write；即使本次只有奖励行而权威根正文没有变化，也必须进入 durable save，不能被 runtime/no-op 快路径跳过。

## 活动邮箱通知与归档兼容

后台通知默认每分钟运行、每批 32 封、每轮最多 4 批，硬上限分别为 64 与 16；候选先按活动计数把仍有容量的收件人排在满箱账号之前，避免一个拥有大量待通知奖励的满箱账号长期阻塞其他玩家。事务锁定 control、收件人 counter、奖励行、永久邮件身份和活动邮件：

- 活动邮件少于 200 时，原子把奖励改为 `mail_delivered`，strict INSERT 一封 `schemaVersion=2`、已结算、空附件的 `reward_vault_notice`，永久身份绑定同一 `rewardId`，再 exact 增加 counter；
- 活动邮件已经 200 时不写任何邮件、不改奖励状态，玩家仍可直接从奖励仓领取；
- 通知邮件只承担发现和跳转，不复制奖励物品或货币，因此邮件读取、重复投递、归档或客户端重放都不能形成第二份资产；
- Phase 420 归档事务现在保留永久 `rewardId` 关联，可把达到 30 天的已结算空通知迁入只读归档，普通 forward writer 只能更新既有通知且不能伪造新的 reward-linked identity。

投递 COMMIT 模糊只由独立连接同时核对奖励 next state、通知正文、永久身份和 counter；全前态才可安全重试，全后态才恢复成功，任何部分状态固定 outcome unknown。

## 停服启用门禁

package script 故意只提供 `--enable`；正式命令还必须追加停服确认：

```sh
npm --prefix server/node run reward-vault:enable -- --maintenance-confirmed
```

命令拒绝 host、端口、账号、密码、database、socket 或 env 参数，只能创建 fresh dedicated maintenance store。它先独立审计邮箱 lifecycle 物理结构，再在一个 RR 事务中按 source → identity → counter → archive → vault 全量锁定并认证当前活动邮件及既有只读归档；vault 必须为空，其他 generation 与 flag 必须精确。CAS 只把 `vault_claim_enabled` 从 0 单调切到 1，重复运行会只读回滚并明确报告已经启用。COMMIT 模糊只接受完整 control 的“精确前态／只变 vault flag 的精确后态”二分证明。

启用后所有正常 Node 必须重启并统一捕获新 flag，禁止新旧 writer 滚动混跑。由于 Phase 421 尚无正式客户端奖励入口，当前不得在真实环境执行该命令；实际启用属于 `3e` 完成后的独立运维门禁。

## 验证证据与剩余风险

新增服务／HTTP 端到端夹具把 authority 根和奖励仓物理行分开，证明真实市场成交、零实收、教学任务接力、普通战斗溢出、资格奖励、背包满保留、账号隔离、领取与同 key 重放 `4/4`。状态、分页、MySQL 读取／发放／领取／通知／开关、forward writer 和资源总序组合 `76/76`；经济、战斗与 shared read 相邻回归 `124/124`；HTTP 安全、通知和端到端组合 `20/20`。changed-JS syntax 与 `git diff --check` 在最终提交门槛再次执行。

扩展 durable／市场条件回归仍保留远端既有的 4 个红灯：一个 WebSocket 握手补档夹具，以及三个严格生产服务夹具在未选择角色时的造数据失败；本阶段新增的 vault 市场条件计划、零收益计划和其余用例均通过，没有通过放宽角色选择或绕过生产权限来消除既有红灯。

本阶段未连接共享 MySQL、未执行真实 feature enable/DML、未读取或修改真实玩家数据，也未设置 MySQL GLOBAL/PERSIST。仍需 `3e` 完成正式客户端入口、活动 200 上限、账号切换／迟到响应和 1280×720 可见验收；真实 MySQL、多 Node 竞争和长期运行只能在隔离数据库或正式运维窗口中证明，当前 recording fake pool 结果不能表述为真实库已经迁移。
