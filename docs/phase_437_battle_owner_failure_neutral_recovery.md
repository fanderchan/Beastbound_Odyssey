# Phase 437：战斗 owner 故障票据与中性终止

## 结果与范围

本阶段完成 `P0.6d-3b-2f` 的服务端合同：每次正式创建切磋、队伍 PVE 或庄园战房间时，为每个真人参战账号在
持久 session 文档中写入一张轻量故障票据。房间正常胜负、离开、逃跑、超时或离线成员退出时，票据与对应结算
在同一 durable candidate 中清除；如果进程或 owner Node 消失，活动房间仍按既有规则不持久化，但新进程可以从
票据明确判断“有一场战斗因服务器切换丢失”，并按中性规则终止：不记胜负、不伪造结算、不覆盖玩家后来资产。

这不是无缝续战。战斗演员、当前 HP、回合命令、事件列表和私有随机密钥仍只存在于创建房间的进程。客户端自动
展示／确认流程、真实双 Node owner 接管门禁、跨 Node 正常战斗命令路由和共享 MySQL 竞争仍是后续切片，宽口径
`battleRuntimeReconnectHydrationProven` 与 `reconnectHydrationProven` 继续保持 `false`。

## 为什么不持久化半场快照

当前 `BattleRandomAuthority` 为每个房间持有进程私有 HMAC 密钥，公开 `room.seed` 不是该密钥。只保存房间 JSON
而丢失私钥，会在重启后改变闪避、暴击、合击、状态命中和野怪目标等结果；把私钥直接放进普通战斗文档又会扩大
泄露、重放和回滚刷结果风险。同时，账号粘性路由尚未证明不同 owner 上的双方命令能统一进入同一房间。

因此本阶段选择可证明的保守合同：节点故障只产生一张中性终止票据，不尝试从不完整状态猜出“应继续的下一随机
结果”。这牺牲一次战斗进度，但不牺牲胜负公平和资产正确性。

## 持久票据合同

票据保存在现有 session `document_json` 的私有 `battleFailureTicket` 字段，不新增 MySQL 表或全局热点：

```json
{
  "kind": "battle_owner_failure_ticket",
  "ticketId": "battle_failure_<sha256-prefix>",
  "roomId": "battle_room_...",
  "mode": "duel",
  "accountId": "acc_...",
  "participantAccountIds": ["acc_..."],
  "startedAt": "2026-08-15T04:00:00.000Z",
  "encounterRecovery": null,
  "schemaVersion": 1
}
```

- `ticketId` 由 `roomId + accountId` 确定性生成；同账号多个当前 session 保存同一票据副本。
- 读取会合并相同副本；任意畸形、账号错绑或多个不同票据同时存在都失败关闭，不猜哪张有效。
- 新登录可以撤销旧 session，但带票据的历史 session 不受每账号 8 条普通历史裁剪影响；恢复会扫描该账号全部
  session，因此换 token 后仍能处理故障。
- 公共 `/battle/state.interruption` 只返回票据 ID、房间 ID、模式、开始时间、是否有遇敌次数可返还和中文提示，
  不返回其他参与者账号或内部恢复细节。
- 有未确认票据的账号不能再次邀请、接受、遇敌或进入庄园战，避免两场未结状态叠加。

## 生命周期与 durable 边界

1. 开战前验证所有真人参战者都有当前未撤销、未过期 session，且没有旧票据。
2. 创建运行态房间时把参战者票据写进同一个候选根；生产异步存储在 COMMIT 成功前不发布房间、事件或成功响应。
3. 私有随机房间通过 `applyAfterDurableCommit` 打开；开战 COMMIT 失败时既不发布票据，也不遗留随机密钥。
4. 非终局回合继续只改运行态房间，持久 planner 看不到 ticket delta，因此不增加存储写。
5. 正常终局在写回档案、战绩和返回位置后清除全部匹配票据；部分 PVE 离线退出只清除被移除成员的票据。
6. owner 丢失后，新进程没有 room 但能读取 ticket；`POST /battle/interruption/recover` 要求
   `Idempotency-Key`，只清除当前账号的匹配票据，不生成 `battleRecord`、赢家或输家。

普通邀请和位置同步仍为零持久写；接受战斗／普通遇敌从原来的纯运行态改为一次开场票据事务。之后每个非终局命令
仍为零新增持久写，终局继续使用原有单次资产结算事务。

## 遇敌石精确返还

定时遇敌房间的队长票据额外保存：

- 当前角色 `playerId`；
- 遇敌石 `encounterActivationId`；
- 开战前 `previousConsumedSlot`；
- 本次已消耗 `consumedSlot`。

恢复时只有四项仍完全一致，且当前 `encounterConsumedSlot == consumedSlot`，才回退到
`previousConsumedSlot`。角色切换、重新使用遇敌石、挂机已改变或计数已经继续前进时只清票、不覆盖新状态。该规则
保证一次安全返还，同时阻止旧票据回滚后来合法进度。

## 验证

- `node --test server/node/test/battle-failure-ticket.test.js`：`4/4 PASS`；
- `node --test server/node/test/auth-battle-room.test.js`：`68/68 PASS`，覆盖正常清票、重启中性中断、换 token
  后恢复、无战绩与精确遇敌次数返还；
- `node --test server/node/test/auth-durable-commit.test.js`：`52/52 PASS`，覆盖开场恰好一次持久写、非终局零
  新增写、开场 COMMIT 失败不发布 ticket／room／随机密钥，以及终局 COMMIT 后才清理；
- `node --test server/node/test/auth-http-server.test.js server/node/test/auth-auth-session.test.js`：`49/49 PASS`，
  覆盖认证、必需 idempotency key、同 key 重放和带票据历史 session 防裁剪；
- `node --test server/node/test/auth-family-manor.test.js server/node/test/auth-auth-session.test.js server/node/test/auth-storage.test.js`：
  `63/63 PASS`；现有 session JSON 增量持久化无需 DDL；
- changed JavaScript syntax 与 `git diff --check`：`PASS`。

所有验证均使用隔离内存／假 MySQL CLI／现有存储 harness；没有连接共享 MySQL、没有改玩家数据、没有执行
DDL/DML 或 MySQL `GLOBAL/PERSIST`。

## 后续边界

下一切片应把 `interruption` 接入 Godot 正式 reset／战斗状态恢复路径，以简短中文系统提示自动提交一次稳定
operation ID，并证明玩家回到可操作世界而不是卡在空战斗场。随后扩展真实双 Node Valkey 门禁：A 创建房间并写
ticket、强杀 A、B generation 2 rebase、`GET /battle/state` 取得中断、恢复后 ticket 消失且双方无战绩；再继续
真实共享 MySQL、网络分区和 200 连接双 Node soak。
