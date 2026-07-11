# Phase 216 — 服务端遇敌许可、遇敌石时钟与资格战闭环

## 目标

本阶段完成 `P0.2c-3a-2`：客户端只能消费服务端基于真实移动、位置、队伍和时间签发的一次性遇敌资格；四戒守卫、玄影守卫和 MM1 试炼必须在创建战斗房间前完成全队资格校验；遇敌石不能靠重放、重启或客户端暂停时钟重复触发。

这仍不等于“捕捉已完全服务端权威”。野宠的私有 Lv1 候选与捕捉成功后的原样转移继续属于 `P0.2c-3a-3`。

## 修复前复现

在服务端合法草地区域直接重复调用五次 `POST /battle/party-encounter`，旧逻辑创建了五个独立房间。请求者不需要真实移动，不需要经过服务器随机频率，也没有只能消费一次的许可。

同时确认：

- `battle_rewards.json` 虽把四戒/玄影资格战标为 `repeatable:false`，旧结算没有执行该字段；
- 四戒胜利时背包已满会直接产生 `lostItems`，玩家赢了仍可能拿不到转生材料；
- MM、四戒和玄影入口只校验已登记交互与距离，不校验等级、当前转生周期、戒指/证明持有、宠物容量或队员资格；
- 客户端遇敌石在战斗中暂停倒计时，服务端却按绝对 `startedAt/expiresAt` 过期，长战后双方显示冲突。

## 普通野外遇敌许可

`pet-encounter-permit-authority.js` 维护不落盘的单进程运行时许可：

1. 只有服务端接受的相邻单步移动能进入遇敌进度；
2. 目标格必须可站立，斜向移动还与 Godot `can_step` 一致：两个侧格同时阻挡时禁止穿角；
3. 账号级移动门为每 `100ms` 恢复一格信用、最多突发 4 步；超速合法步返回 `movement_rate_limited`，不改位置、不增 `movementSeq`、不广播、不参与遇敌；
4. 遇敌资格另有每 `150ms` 一次、突发 2 次的信用门，前 2 个有效草地步为安全步；
5. 第 3 个及后续有效步才按该区域服务端 `encounterRate` 使用 CSPRNG 判断；
6. 命中后生成 24 字节不透明票据和独立 32 字节私有 encounter seed，有效期 10 秒；
7. 票据精确绑定账号、会话、地图、格子、`movementSeq`、区域、分组、队伍指纹和参战档案/位置指纹；
8. 账号只保留一张待消费票，继续移动会令旧票变成不可重放 tombstone；登录替换、刷新和退出会清理账号的移动/许可运行时状态；
9. 先构造完整权威 encounter、参战快照和 battle room，确认成功后才 CAS 消费许可；构造失败可以用同一张未消费票重试；
10. 票据只返回本次 HTTP 请求者，永不进入在线广播、服务快照或存档。

Godot 在线移动不再本地抽普通草地 RNG。移动响应带票后，客户端截断剩余路径，先把角色视觉走到票据绑定格，再清除本地 token 并发起一次战斗 POST；POST mutation 默认不自动重试。地图、账号、纠偏和战斗切换都会清票。离线本地模式保持旧行为。

## 在线挂机与遇敌石

在线走路挂机复用同一条服务端逐格移动/ACK/视觉等待状态机，不再通过客户端瞬移式路径绕过移动许可。

遇敌石配置从 `bag_items.json.worldUse` 派生，包含巡逻遇敌石；启动时服务端要求当前权威位置与请求 origin 完全一致，且恰好位于一个普通遇敌区。档案持久化：

- 激活 ID、道具、origin、zone/group；
- `startedAt/expiresAt` 与配置的绝对持续时间；
- 服务端间隔和最后已消费 slot。

每个时间 slot 只能创建一个房间。运行时 CAS 防并发，档案 `encounterConsumedSlot` 防服务重启后重放；房间构造失败不消耗 slot。客户端与服务端统一采用墙钟语义：战斗/遭遇期间持续时间仍减少；服务端返回过期、绑定变化或损坏 session 时，客户端立即清理旧效果并请求停止旧挂机状态。

## 六个手动入口的服务端资格

新增纯模块 `manual-encounter-access.js`。构造时从权威地图目录自动发现所有手动 encounter interaction，并要求它们与 `rebirth_trials.json` 派生的四戒守卫、玄影最终守卫及显式 MM1 入口精确一一对应。以后新增第七个手动入口却没有资格规则，服务启动会失败，而不是默认放行。

所有规则逐个校验实际参战成员：

- 四戒守卫：人物 Lv80、当前人物转生周期未领取、背包和银行均没有对应戒指、开战时背包能接收戒指；
- 玄影守卫：人物 Lv100、背包有四戒、当前周期未领取、没有未消费玄影证明；推荐等级保持 Lv120；
- MM1：复用正式 `petRebirthMmTrialAccess`（Lv80、教学/重复领取状态），并预检队伍或兽栏能接收小 MM；
- 任一队员不合格，房间创建前失败，队伍 presence、许可和 profile 均不改变。

资格胜利写入：

```json
{
  "qualificationBattleClaims": {
    "earth_vein_guardian_group": {
      "rebirthCycle": 0,
      "claimed": true,
      "schemaVersion": 1
    }
  }
}
```

`rebirthCycle` 是胜利时的人物转生次数。人物转生后计数增加，旧 claim 自然不再阻挡下一周期，不需要破坏性清理或迁移。

入场预检后玩家仍可能在战斗中领取邮件把最后一个背包格塞满。资格结算因此保留第二道可靠性边界：无法进入背包的绑定戒指会原子创建 `qualification_reward` 系统邮件，mail ID 由账号、room 和奖励表稳定派生；claim 仍会落账，既不丢材料，也不能靠满包反复刷石币。

## 协议与兼容

- 这次修复必须拒绝没有票据的旧普通遇敌请求，因此客户端/服务端协议原子切到 v3，最小/最大均为 3；v2 客户端必须更新，不能兼容放行漏洞。
- 新 profile 字段是可选增量字段；旧档缺少 `qualificationBattleClaims` 等价于空对象，不重写旧宠、不迁移真实玩家数据。
- `rebirth_trials.json` 把玄影守卫最低尝试等级补齐为 Lv100、推荐 Lv120，与既有 100–140 终段定位一致。
- 项目宠物设计 inspector 已从“协议必须恰好 v2”升级为校验客户端/服务端锁定同一份 v2+ 协议，协议 v3 下仍能正确验收。

## 验证

服务端：

```text
许可 + 手动资格 + 社交移动 + 战斗 + 挂机定向：93/93
HTTP：22/22
npm --prefix server/node test：251/251
宠物设计 inspector：errors=0，成长/EXP/v1/factory/转生/公开档/协议v2+/客户端不重掷均为 true
```

Godot 4.7：

```text
parse + auth-server-client + client-version + movement + encounter
+ encounter-loop + hang-settings + pet-encounter-table：8/8
日志：.run/godot_auto_checks/2026-07-11T05-42-34-127Z.log
```

隔离 JSON 本地服务（协议 v3，显式 QA teleport，仅测试账号）：

- 服务端 movement live：注册、播种、合法步、跳步拒绝、移动中战斗拒绝、房间和战斗锁全部通过；
- 服务端 click-move 纠偏：`expected_acks=3 requests=4 acks=3 retries=1`，最终视觉格、权威格和目标格完全一致；
- 单人 PVE：真实逐格许可、权威房间、2 个 actor 和退出闭环通过；
- 测试后 8787、Godot 和本地服务无残留；没有连接 MySQL 或真实玩家账号。

性能抽样：

- idle `process_total` 稳定约 `0.23–0.34ms`；
- moving 60 FPS，稳定约 `0.37–0.43ms`，`status=ok`；
- 317 次真实移动连点：`avg_input_us=16`、`max_input_us=168`、`coalesced/settled/final_match=true`；
- 联网逐格/纠偏约 `0.25–0.32ms`；
- shop `84.974/70.440ms`、flush `1.487/0.245ms`；人物加点 spam `0.67ms`，均未超过既有回归门。

## 玩家手动验收

1. 普通草地连续移动：前两步不遇敌；命中时角色必须先走到最终格再入战，不能原地连点“刷房间”。
2. 开启遇敌石后进入一场持续较久的战斗：战斗时间应计入石头持续时间；到期后不再显示仍有效。
3. Lv79/Lv80 两人组队挑战四戒：应明确指出低级队员不满足 Lv80，不能创建房间。
4. 背包满、有同戒在背包/银行、同周期已领取三种情况分别尝试四戒守卫：均应在开战前给中文原因。
5. 背包留一格开战，战中用邮件把最后一格塞满再获胜：戒指应进入“试炼资格奖励”系统邮件，同周期不能二刷；人物完成转生后下一周期可再次挑战。
6. 玄影守卫分别用缺戒、已有证明和合格四戒档尝试；MM1 分别用未接教学与队伍/兽栏全满档尝试。

## 非目标与剩余风险

1. 普通许可与 timed slot 仍是单 Node 进程内 Map。多 worker 部署必须采用账号粘滞路由或共享原子存储，否则票据可能跨 worker 失效，遇敌石 slot 可能双消费。
2. 移动频率门阻断单账号高速 DoS，但在线位置事件仍会按观看者重建 AOI 列表；“200 人同图”尚未经过 WebSocket 混合业务压力与长时 soak，不能据此宣称容量达标，继续由 `P0.6/P3.2` 验证和优化。
3. 当前没有专门的长时在线挂机性能探针；静态 encounter-loop 与真实 click-move 覆盖同一逐格状态机，但不能代替数小时 soak。
4. 服务重启后的遇敌石 slot 已安全恢复；客户端重新登录后自动恢复剩余时长的展示仍需专门 UX 闭环，目前不会因此多发房间或多消费 slot。
5. 异步 MySQL store 的全局崩溃窗口和跨进程事务不是本切片新增问题，需在存储/运营阶段独立解决。
6. 野宠私有捕捉候选与成功捕捉原样转移仍未完成，下一项是 `P0.2c-3a-3`。

## 涉及文件

- `server/node/src/auth/pet-encounter-permit-authority.js`
- `server/node/src/auth/manual-encounter-access.js`
- `server/node/src/auth/pet-encounter-authority.js`
- `server/node/src/auth-service.js`
- `server/node/src/auth/battle-room.js`
- `server/node/src/auth/profile-actions.js`
- `server/node/src/protocol.js`
- `server/node/test/` 与 `server/node/test-support/`
- `client/godot/data/rebirth_trials.json`
- `client/godot/scripts/world/server_encounter_permit_model.gd`
- `client/godot/scripts/main.gd`
- `client/godot/scripts/progression/server_auth_client_model.gd`
- `client/godot/scripts/ui/panel_flow_coordinator.gd`
- `client/godot/scripts/qa/auto_check_coordinator.gd`
- `.agents/skills/design-beastbound-pets/scripts/inspect_pet_design.mjs`
- `stoneage_gap_plan.md`
