# Phase 214 — 服务端权威遇敌内容、位置与教程边界

## 目标

本阶段完成 `P0.2c-3a-1`：玩家仍能在合法区域获得随机遇敌惊喜，但客户端只能表达“我想在这个区域/交互点发起遭遇”，不能指定宠物形态、数量、等级、属性、捕捉率或经验奖励。

这不是“捕捉已经全部服务端权威”。服务端遇敌资格与频率、遇敌时私有捕捉候选、捕捉成功后的原样转移，分别留在后续 `P0.2c-3a-2/3a-3`。

## 修复前复现与主要矛盾

隔离内存服务中，普通客户端可提交完整 `encounterZone`。服务端会接受客户端指定的十只敌人、商业/转生形态、Lv140、捕捉规则、EXP 和 `999999` 战斗属性：

```json
{
  "accepted": true,
  "enemyCount": 10,
  "formId": "rebirth_starter_shadow_cub",
  "level": 140,
  "maxHp": 999999,
  "attack": 999999
}
```

这会同时破坏战斗、公平掉落、练级、捕捉稀有度和经济。旧捕捉路径还会在战斗结束后才初始化捕获物身份，因此即使战斗中的怪由服务端选出，也不能证明入库宠物就是战斗中那一个体。

## 数据所有权

客户端请求只保留三个可选标识符：

- `zoneId`
- `encounterGroupId`
- `sourceInteractionId`

服务端拥有并校验：

- 当前地图、服务端位置、区域几何、交互点与队伍成员位置；
- 候选池、权重、敌人数、个体/共享抽取方式、等级与战斗属性；
- 是否可捕捉、捕捉难度/特例、EXP 及教程情景；
- 房间 CSPRNG seed 与确定性选取结果。

遇敌个体的私有成长身份仍未在本阶段生成，不能把当前房间快照直接当成最终捕获宠物。

## 服务端权威契约

新增聚焦域 `pet-encounter-authority.js`，启动时严格读取共享的 37 张 `*_map.json` 与 `pet_templates.json`：

1. 地图、区域、交互和宠物索引使用无原型对象及 own-property 查询，`__proto__`、`constructor`、`toString` 均安全拒绝。
2. 未知形态、重复 ID、越界几何、倒置等级/敌人数范围、非正战斗属性、坏捕捉配置、未知动态池和无正权重池在启动时失败关闭。
3. 房间先生成 CSPRNG seed，再由 SHA-256 派生数量、池选择和等级；48-bit 浮点抽样严格小于 1，选择条件使用 `< cursor`，零权重首项不会误中。
4. 普通区域要求队长服务端坐标位于 cells/rects 内；手动挑战必须通过已登记交互点并位于三格内。
5. 固定守卫、MM 试炼及手动挑战默认不可捕捉，只有服务端数据显式允许时才开放。
6. 参战成员必须全部有服务端位置、位于同图、停止移动，且与队长相距不超过四格；失败发生在建房、发事件和写档前。
7. 捕捉乌力教程只读取服务端内部任务档案：任务有效时强制一只乌力和难度 1；客户端提交同名教程字段不会生效。

战斗房间不再调用旧的 `partyEncounterSnapshotFromPayload()`。正式服务只保存 `authority: server_pet_encounter_v1` 的服务端快照。

## 首次位置与失败边界

修复前，账号没有运行时位置时可把第一帧直接播种到 GM 地图或高层洞窟，从而绕过传送路线。现在正式服务的首次精确位置只能从人物记录点建立：

- 错误首位置返回 `position_initial_not_record` 和安全记录点纠正位置；
- Godot 应用纠正并静默恢复，不向玩家显示内部错误码；
- 任意首位置只存在于服务构造器的测试选项，不存在环境变量、HTTP 参数或普通配置开关；
- 没有把运行时位置写入持久化快照。

## 客户端与兼容

新 Godot 客户端不再在联网建房前本地抽宠，只发送 `encounterIntent`。本地单机兼容路径没有扩大，但正式产品仍只走服务器会话。

协议继续为 v2：旧 v2 请求中的 `encounterZone` 仅作为标识符兼容载体，所有宠物、数量、等级、属性、捕捉和 EXP 字段都被忽略；因此本阶段没有不兼容的 HTTP/WS 变化，不提升协议版本，也不迁移存档。

## 验证

服务端：

```text
node --check server/node/src/auth-service.js
node --check server/node/src/auth/pet-encounter-authority.js
  passed

pet-encounter-authority + auth-battle-room + auth-social-world
  67/67 passed

npm --prefix server/node test
  221/221 passed
```

严格测试覆盖真实 HTTP 载荷、恶意形态/属性/数量 canary、原型链键、未知区域、越区、守卫交互、队伍位置、共享/独立池、教程服务端覆盖、MM 守卫与 GM 动态图鉴池。

Godot：

```text
godot parse
--auto-auth-server-client-check
--auto-pet-encounter-table-check
--auto-rebirth-cave-guardian-check
  4/4 passed
```

隔离 JSON 服务的真实单人联网流程已从人物记录点移动到 `village_grass` 并成功建房：

- `.run/godot_auto_checks/2026-07-11T03-44-24-767Z.log`

宠物设计 inspector 为 `errors=0, warnings=26`；服务端成长目录、EXP、authority-v1、新宠 factory、公开投影、协议 v2 和客户端不重抽均保持接线。战斗动作目录为 `status=ok`。`git diff --check` 通过。

性能抽样没有新增每帧目录扫描或网络轮询：idle `process_total` 约 `0.19–0.44ms`；moving 60 FPS、约 `0.19–0.29ms`；317 次真实输入连点 `avg_input_us=12`、`max_input_us=364`、`coalesced=true`、`settled=true`。目录只在服务启动时加载，遭遇只在显式请求时解析。

所有服务端验证均使用 memory/隔离 JSON 存储，没有连接 MySQL、没有读取或修改真实玩家档案；验证后的本地服务已停止。

## 非目标与剩余风险

1. `P0.2c-3a-2`：合法区域内仍可高频请求遭遇；缺少基于服务端移动序列/时间/RNG 颁发的一次性许可与频率限制。手动挑战也仍需统一的任务/等级/转生/重复领取资格 guard，以及服务端认可的相邻可达格，当前三格切比雪夫邻近校验不能替代完整入口资格。
2. `P0.2c-3a-3`：战斗开始时尚未生成私有捕捉候选，成功捕捉仍可能战后重抽；Lv2+ 也不能伪造从未存在的真实 Lv1 历史。
3. `P0.2c-3b`：authority-v1 宠物转生还可能破坏成长周期并错误消费 MM，是下一项数据完整性修复。
4. `P0.2c-3c`：GM 宠物创建/升级仍有客户端幽灵状态，尚未成为服务端权威入口。
5. 有宠物的真实双人联网 QA 夹具尚未建立，本阶段只有单人 live 证据和服务端组队测试。
6. `capture-settings` 与 `pet-capture-feedback` 的既有离线夹具仍分别受伙伴/仓库前置假设影响；没有把它们误报为本阶段回归或已解决。
7. 队伍/兽栏满后的 `lostCapturedPets` 属于 P1.1；24 个形态仍未接成长档，蓝人龙仍缺正式世界投放，被动技能目录尚未由 Node 执行。
8. 技能通用 `quick_validate.py` 因本机 Python 缺少 PyYAML 未执行；仓库专用 inspector 与脚本语法/运行测试已通过。

## 涉及文件

- `server/node/src/auth/pet-encounter-authority.js`
- `server/node/src/auth-service.js`
- `server/node/src/auth/battle-room.js`
- `server/node/test/pet-encounter-authority.test.js`
- `server/node/test/auth-battle-room.test.js`
- `server/node/test/auth-http-server.test.js`
- `server/node/test-support/auth-service-test-context.js`
- `client/godot/scripts/progression/server_auth_client_model.gd`
- `client/godot/scripts/ui/panel_flow_coordinator.gd`
- `client/godot/scripts/qa/auto_check_coordinator.gd`
- `.agents/skills/design-beastbound-pets/`
- `stoneage_gap_plan.md`
