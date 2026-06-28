# Phase146：服务端存档迁移契约 V2

本阶段把本地 Godot 存档整理成一份更接近未来 Node.js / MySQL 的同步契约。它不是正式接入服务端，而是先明确每类本地数据将来应该迁移到哪个服务端模块、如何计数、如何校验，以及旧字段如何兼容。

## 目标

- 把 Phase137-145 新增的数据结构纳入服务端迁移视野。
- 避免后续继续把宠物、背包、装备、邮件、任务、挂机、战斗回执散落在一个不可迁移的大字典里。
- 保留本地客户端直接写存档的开发模式，同时给未来服务端权威写入预留 revision 和 dirty module。
- 明确旧装备槽字段与新装备实例字段的迁移关系。

## 契约版本

- `schemaVersion`: `2`
- `contractVersion`: `profile_contract_v2`
- `revisionKey`: `profileRevision`
- 当前权威：`local_client`
- 未来权威：`node_mysql_server`

`serverSync` 会保存：

- `profileRevision`
- `lastServerRevision`
- `dirtyModules`
- `lastLocalSaveAtSec`
- `lastClientContractVersion`

第一版仍不做联网同步，只保证本地 profile 能生成迁移清单。

## 模块

当前契约共 24 个模块：

- `player`：人物基础信息、等级、经验和当前血量。
- `wallet`：石币、钻石等货币余额。
- `playerGrowth`：人物成长来源、属性点和技能来源。
- `rebirth`：人物转生次数、历史、试炼凭证和任务完成记录。
- `abilities`：远程兽栏、骑宠术等能力解锁。
- `recordPoint`：记录点地图和出生点。
- `pets`：队伍、兽栏、骑宠、宠物个体成长、锁定、转生和 MM 状态。
- `groundPets`：丢弃在地上的宠物和 10 分钟过期规则。
- `petCodex`：图鉴已见、已捕获记录。
- `backpack`：随身包格子、物品堆叠和数量。
- `backpackExpansion`：钻石解锁背包格数。
- `quickSlots`：快捷栏绑定。
- `captureTools`：捕捉道具库存和消耗。
- `equipment`：装备实例、槽位、耐久、强化、经验丹充能和来源。
- `equipmentCompatibility`：旧装备字段派生快照，未来可从装备实例重建。
- `mail`：系统邮件、附件、30 天过期和领取状态。
- `quests`：主线、支线、循环任务状态和当前追踪任务。
- `battleResults`：战斗结果、奖励、捕捉、数值版本回执。
- `autoBattleSettings`：自动战斗策略。
- `autoCaptureSettings`：自动捉宠策略。
- `hangSettings`：挂机设置、低血停止和补给策略。
- `hangSession`：当前挂机会话、回补状态和统计。
- `trainingPartners`：陪练伙伴和其成长状态。
- `serverSync`：本地 revision、dirtyModules 和上次服务端 revision。

## 兼容策略

`equipment` 是未来主数据来源，使用 `equipmentInstances` 和 `equipmentSlotInstanceIds`。

`equipmentCompatibility` 是派生兼容层，覆盖旧字段：

- `equipmentSlots`
- `equipmentDurability`
- `equipmentEnhancement`
- `equipmentWearCounters`
- `equipmentExpPillCharge`
- `equipmentSlotsVersion`
- `equipmentStarterSetVersion`
- `expPillStarterVersion`

服务端化以后，这组字段可以逐步从存档主流程移除，改为由装备实例重建。

## 自测

阶段自测命令：

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-server-profile-contract-check
```

已验证输出：

```text
server profile contract check ready: status=ok sync=true contract=true counts=true modules=24 equipment_instances=18 equipment_slots=8 profile_errors= errors=
```

## 边界

- 本阶段不接入真实 Node.js / MySQL。
- 本阶段不改变玩家可见 UI。
- 本阶段不改变战斗、背包、宠物、装备的运行逻辑。
- 本阶段只扩展契约、自测入口和迁移预览，避免影响热路径。

## 后续

- Phase147 做旧设计文档归档与代码架构审计。
- 后续接服务端时，应先把本契约转成接口 schema，再做服务端 revision 检查和事务写入。
- 真正切服务端权威前，奖励、装备实例、邮件领取、宠物存取、任务完成必须逐项做事务一致性验证。
