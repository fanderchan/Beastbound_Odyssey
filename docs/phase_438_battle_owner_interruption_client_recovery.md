# Phase 438：战斗 owner 中断的客户端自动恢复

## 结果与范围

本阶段完成 `P0.6d-3b-2g`，把 Phase 437 的公共 `battle/state.interruption` 与恢复接口接入 Godot 正式
登录、epoch reset、队伍房间恢复和战中轮询路径。客户端发现服务端仍有中断票据、但运行态房间已经不存在时，
立即结束本地空战斗并恢复地图、人物和操作栏，再自动确认本场中性终止；玩家不会继续卡在没有服务端房间的战斗
界面，也不会被记胜负。

这仍不是半场无缝续战。服务端如果返回活动房间，客户端继续按原正式房间恢复；只有房间确实丢失且存在合法
中断票据时，才走安全中性终止。真实双 Node owner 强杀、共享 MySQL、网络分区和 200 连接长时门槛属于后续
阶段，本阶段不据此宣称已经可横向部署。

## 客户端合同

新增 focused `ServerBattleInterruptionModel`，只接收 schema 1 的公共字段：

- `kind=battle_owner_interruption`；
- `ticketId=battle_failure_` 加 32 位小写十六进制；
- 非空 `roomId`、`mode`、`startedAt`；
- 布尔 `encounterReturnAvailable`。

模型重新投影白名单字段，不采纳或保存 `accountId`、`participantAccountIds` 等身份字段。合法票据确定性派生
`bbo_battle_recover_<32 hex>`；同一票据在网络重试、重新登录或客户端重启后仍使用同一个
`Idempotency-Key`，不会因为客户端临时序号变化而重复补偿。

`ServerAuthClientModel` 新增 durable `POST /battle/interruption/recover` 请求和严格响应解析。接口成功后只读取
`encounterReturned` 与公共 interruption；遇敌次数确实返还时才重新拉取权威档案。全部已知故障票据错误码均
映射为玩家可读中文，普通界面不会显示服务端代码、账号 ID 或内部票据正文。

## 状态转换与竞态

1. 正常登录和事件 epoch reset 仍先发起一次正式 `GET /battle/state`；因此没有队伍的单人玩家也能发现中断。
2. 返回活动 room 时继续恢复该房间，不把仍在进行的战斗误判为中断。
3. 无 room 且有合法 interruption 时，先清理本地 server-authority 战斗，恢复人物、操作栏和世界 HUD，再发恢复请求。
4. 恢复请求使用独立 generation、serial、token 与 ticket owner；账号切换、token 旋转或新票据会使迟到响应失效。
5. 网络、存储或暂时性服务失败不清票；客户端保留 interruption，并在无活动请求时按既有 1 秒房间恢复节拍单飞
   重试。正常无票据、非队伍、非战斗状态不新增轮询。
6. 服务端报告房间仍活动时，客户端不强行终止，重新排队读取正式房间状态。
7. 畸形公共合同失败关闭：本地先回到安全地图，提示重新登录，不猜测票据或生成随机 operation ID。

## 玩家界面

中断过程只使用简短中文系统提示：

- `重连时战斗中断，本场不计胜负；正在返回地图。`
- `战斗已安全结束，本场不计胜负；本次遇敌次数已返还。`
- `战斗已安全结束，本场不计胜负，可以重新发起。`
- 暂时无法确认时只说明后续会继续确认，不显示 QA、错误码、票据或参与者身份。

1280×720 Metal 可视证据位于
`.run/evidence/phase438_battle_interruption_client/final_lane/interruption00000001.png`。画面已经返回火芽训练场，
人物和世界操作均可见，中断提示完整位于左下消息框内，没有越界或技术字段。

## 验证

- `godot --headless --path client/godot --quit`：Godot 4.7 parse 通过，无 `SCRIPT ERROR` 或 `Parse Error`；
- `node tools/run_godot_auto_checks.mjs --only --auto-auth-server-client-check --fail-fast --timeout-ms 180000`：
  `2/2 PASS`，覆盖请求 URL／方法／空 body、durable 重试策略、稳定幂等键、公共投影、身份隐藏、单人轮询和
  recovery single-flight；
- `node tools/run_godot_auto_checks.mjs --only --auto-server-battle-stale-room-check --fail-fast --timeout-ms 180000`：
  `2/2 PASS`，最终报告 `interruption_ui=true`、`battle_active=false`、世界人物／操作栏可见且战斗命令面板隐藏；
- 隔离 `automation` QA lane 的真实 Main／Metal／MovieWriter 以 1280×720 取证；attestation 为 `passed`。
  正式玩家目录 inventory SHA-256 在取证前后均为
  `bcd34c25fdf67ae1c3f24a803df3ba852ffcd11f0ef528e4aaaacba08f124d3b`，受保护工具确认
  `realUnchanged=true`，随后清理 70 个 QA lane 条目并确认目录 absent；
- `git diff --check`：通过。

性能对照在同一台 Apple M5、同一份完整 Godot 导入缓存和两个新建后清理的 `automation` QA lane 上串行执行；
基线为干净 `d7e34a19a` detached worktree，候选只应用本阶段暂存补丁。空闲各取 52 个一秒样本，移动使用
真实跨帧输入并各取 8 个样本：

| 场景 | 干净基线 `process_total` | 本阶段候选 `process_total` | 结果 |
| --- | --- | --- | --- |
| 空闲 30 FPS | mean `0.411ms` / median `0.410ms` / p95 `0.480ms` / max `0.540ms` | mean `0.412ms` / median `0.420ms` / p95 `0.470ms` / max `0.470ms` | 均值 `+0.001ms`，p95 与 max 未回归 |
| 真实移动 60 FPS | mean `0.297ms` / median `0.290ms` / p95 `0.370ms` / max `0.370ms` | mean `0.329ms` / median `0.320ms` / p95 `0.410ms` / max `0.410ms` | `+0.032ms`，绝对值仍远低于帧预算，双方均 `status=ok / path_len=11` |

四份原始日志位于 `.run/evidence/phase438_battle_interruption_client/perf/`，均无 `SCRIPT ERROR`、parse error 或
失败状态。恢复判断只在权威状态响应与既有 1 秒恢复计时器上执行；正常逐帧路径只多一个小字典存在性判断，
不执行档案 normalize、容器扫描、阻塞 I/O 或网络请求。

## 后续边界

下一切片应扩展真实双 Node 门槛：A 创建战斗并持久化 ticket，强杀 A，B 取得 generation 2 owner 后由真实
Godot 或等价公共客户端读取 interruption、提交稳定 operation ID，并证明双方票据清除、无胜负战绩且可再次
开战。之后再推进共享 MySQL、分区恢复与 200 连接长时双 Node soak；跨 Node 正常战斗命令路由和半场无缝续战
仍是独立产品／架构决策，不能由本阶段自动恢复代替。
