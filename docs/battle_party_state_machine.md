# 战斗与组队连接状态机

## 房间状态

| 房间状态 | 入口 | 允许动作 | 退出 |
| --- | --- | --- | --- |
| `ready` | 接受切磋邀请或队伍遇敌创建房间 | 查询战斗状态、提交回合命令、离开房间、连接状态变更 | 回合超时、断线宽限到期、主动离开、战斗结算 |
| `closed` | `closeBattleRoomWithResult` 结算 | 只保留短时间回放和结果查询 | 运行态清理或服务重启后消失 |

## 连接状态

每个 `ready` 房间维护 `connectionState[accountId]`：

| 连接状态 | 触发入口 | 维护行为 |
| --- | --- | --- |
| connected | WebSocket 建连、HTTP `getBattleState` 轮询 | 清空 `disconnectedAt`，刷新 `lastSeenAt`，重新排程维护 |
| disconnected | WebSocket close/error | 保留首次 `disconnectedAt`，刷新 `lastSeenAt`，按房间模式排程维护 |

HTTP 轮询和 WebSocket 生命周期统一走 `applyBattleConnectionState`。这个入口只更新运行态 `battleRooms`，不写入 auth store；`battleRooms`、`battleInvites`、`playerPositions` 仍是运行态数据，服务重启后不从持久化恢复。

## 计时器

`scheduleBattleMaintenance` 只维护一个服务级 timer，下一次触发时间取三类最早时间：

| 计时器来源 | 生效条件 | 到期动作 |
| --- | --- | --- |
| 邀请 TTL | `battleInvites` 仍为 `pending` | 过期邀请并广播 `battle.invite_expired` |
| 回合命令 deadline | 房间 `ready`、命令阶段、无人处于断线宽限 | 超时结算房间 |
| 断线宽限 | 任一参战账号 disconnected | 切磋房间超时关闭；队伍 PVE 移除离线队员或关闭房间 |

## 已覆盖边界

| 边界 | 期望 |
| --- | --- |
| HTTP 活跃但 WebSocket 断开 | 下一次 `getBattleState` 把账号恢复为 connected，不提前关闭房间 |
| 多人同时掉线 | 维护只关闭一次房间，结果为 `disconnect_timeout`，双方都进入失败列表 |
| 队伍 PVE 队员离线 | 过宽限后移除离线队员，同步队伍状态和战斗房间更新 |
