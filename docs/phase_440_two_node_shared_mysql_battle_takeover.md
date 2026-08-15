# Phase 440：双 Node 共享隔离 MySQL 战斗接管

## 结果与范围

本阶段完成 `P0.6d-3b-2i`：在 Phase 439 的真实 Valkey／双 Node／owner 强杀序列上，把串行共享 JSON
权威夹具替换为两个 Node 同时连接的同一个真实 MySQL `9.7.0-er2` 业务库。Node A 完成切磋开场 COMMIT 后
被真实 `SIGKILL`；Node B 在租约到期后以第 2 代 owner 从 MySQL 重载双方 failure ticket，逐账号稳定幂等
中性恢复，并证明票据已从数据库清除、双方零胜负且可重新开战。

这关闭了战斗中性恢复的“真实共享 MySQL”证据缺口，但没有恢复丢失的运行态房间。网络分区／rebase、
跨 Node 正常战斗命令路由、半场无缝续战和 200 连接长时 soak 仍为 false，`P0.6d-3b` 与横向部署总门槛
继续保持未完成。

## 一次性 MySQL 安全边界

新增 `tools/lib/isolated-mysql-runtime.mjs`，只为隔离门槛启动 Codex 拥有的临时 MySQL：

- 从操作系统分配随机 loopback 端口并明确拒绝 `3306`；
- 使用新建临时 datadir 与 `--initialize-insecure`，root 空密码只存在于这个短命、仅回环监听的进程；
- `mysql` wrapper 与 `mysqladmin` 均强制 `--no-defaults --no-login-paths`，并清除继承的 `MYSQL_PWD`；门槛进程
  同时将 `BEASTBOUND_MYSQL_PASSWORD` 与 `MYSQL_PWD` 置空，不读取本机玩家服凭据；
- 关闭顺序固定为停止业务 Node、确认事务／锁等待归零、删除随机业务库、关闭 admin、停止 Valkey、通过
  mysqladmin／有界信号确认 mysqld 退出，最后才删除 datadir；不能确认退出时拒绝删除；
- 启动参数只作用于隔离实例，不执行共享 MySQL 的 `SET GLOBAL/PERSIST/PERSIST_ONLY`，不重启系统 MySQL。

门槛最终确认版本为 `9.7.0-er2`、端口非 3306、临时库不存在、mysqld 已退出且 runtime 目录不存在。

## 真实生产存储路径

`tools/run_valkey_two_node_event_gate.mjs --mysql-battle-only` 使用正式存储组件，而不是内存模拟：

1. bootstrap `createMysqlAuthStore(usePool=true)` 在随机数据库安装当前 schema，并通过真实事务写入五个隔离账号、
   session、角色绑定和合法十点元素战斗档案；
2. 两个独立 worker 各自创建 `createMysqlAuthStore(usePool=true)` 与 `createAsyncWriteAuthStore`，同时预加载同一
   MySQL 根；B 因此在 A 开战前持有真实陈旧 baseline；
3. A 为双方取得第 1 代账号 owner、建立相邻位置、邀请并接受切磋；开场 COMMIT 在 MySQL session 行写入两张
   failure ticket，数据库仍没有运行态 `battleRooms` 或战绩；
4. 强杀 A 后，B 在租约到期前返回 `503 account_node_switching`。到期后 generation 2 admission 先执行正式
   async cluster authority read，再向公共 `/battle/state` 返回双方 interruption；
5. 每个账号以 `bbo_battle_recover_<ticket hex>` 恢复并重放。独立 MySQL verifier 在重新开战前确认双方所有
   session 均无 failure ticket 且 `battleRecords=0`；公开战绩也双向为零；
6. 双方 presence revision 均进入 `2,000,000,001+`，随后在 B 建立不同 roomId 的 ready 切磋。

## 关键回执

```json
{
  "status": "PASS",
  "engine": "real_loopback_valkey_and_isolated_mysql",
  "mysqlVersion": "9.7.0-er2",
  "isolatedMysql": true,
  "sharedPlayerDatabaseTouched": false,
  "mysqlPortIsNot3306": true,
  "independentGameNodeProcesses": 2,
  "sharedMysqlBattleTakeoverProven": true,
  "battleOwnerFailureGenerationTwoTakeoverProven": true,
  "battleOwnerFailureTicketTakeoverProven": true,
  "battleOwnerFailureNeutralRecoveryProven": true,
  "battleOwnerFailureStableRecoveryReplayProven": true,
  "battleOwnerFailureWinLossUnaffected": true,
  "battleParticipantsCanRematchAfterRecovery": true,
  "mysqlGlobalValuesUnchanged": true,
  "mysqlDeadlockDelta": 0,
  "mysqlResidualTransactions": 0,
  "mysqlResidualLockWaits": 0,
  "networkPartitionRecoveryProven": false,
  "twoHundredConnectionSoakProven": false,
  "temporaryDatabaseDropped": true,
  "mysqlCleanupVerified": true,
  "temporaryStateRemoved": true
}
```

## 验证

- `node --check tools/lib/isolated-mysql-runtime.mjs`：通过；
- `node --check tools/run_valkey_two_node_event_gate.mjs`：通过；
- `node tools/run_valkey_two_node_event_gate.mjs`：默认 JSON／事件／聊天／队伍／战斗门槛继续 `PASS`；
- `node tools/run_valkey_two_node_event_gate.mjs --mysql-battle-only`：真实共享隔离 MySQL 门槛 `PASS`；
- owner-failure service 与 HTTP 幂等恢复聚焦回归通过；
- `git diff --check`：通过；
- 运行后无专用 Node worker、Valkey、mysqld 或 `beastbound-*-mysql-*` 临时目录残留。

本阶段没有连接共享玩家库、读取本机数据库凭据、修改真实玩家数据、启动持久服务、改变公共协议、玩家 UI、
战斗数值或数据库 schema 合同。

## 后续边界

下一切片应验证 Valkey／MySQL 可达性分区时 owner 节点能失败关闭、旧写者不会在租约丢失后继续提交、新 owner
只在权威存储恢复后 rebase；之后执行 200 连接双 Node 长时 soak。跨 Node 正常回合路由和半场续战仍保持独立
决策，不由本阶段的中性终止路径代替。
