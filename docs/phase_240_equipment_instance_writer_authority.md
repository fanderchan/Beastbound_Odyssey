# Phase240：装备实例新写入权威与跨容器安全闸

## 问题复现

隔离内存档案稳定复现了两段错误事实：

```text
购买木棒后：backpack count = 1，backpack instance = 0
装备、强化 +2、卸下并出售后：backpack count = 0，backpack instance = 1
```

残留实例仍保存 +2 强化。再次购买普通木棒并装备时，旧逻辑会优先拾取这个实例，使已经出售的强化装备“复活”。同一根因还存在于丢弃、银行、交易所、邮件和面对面交易：这些路径只改变物品模板数量，没有同步装备实例及其耐久、强化、磨损和经验丹充能。

另一个固定复现是装备槽显示木棒、映射却指向石斧实例。旧强化逻辑会把石斧实例直接改写成木棒 +1，而不是拒绝坏档。

## 本阶段规则

### 1. 一件装备对应一个服务端实例

新增 `auth/equipment-profile-state.js` 作为 focused 资产规则层：

- 商店、任务、战斗奖励、人物转生、合成和未来默认开局发放，每成功进入背包一件装备就创建一个唯一实例。
- 可堆叠经验丹仍是一粒一个实例；直接使用一粒时同步移除一个实例。
- 装备到经验丹槽时按服务端人物经验曲线校正初始等级与 `nextExp`；人物 Lv140 的溢出经验同时写入兼容字段和精确映射实例，并在操作结果与玩家文案中明确显示实际储入量。
- 出售和丢弃先验证背包模板数量与 backpack instance 数量完全一致，再精确删除实例。
- 同名装备状态不同而请求没有指定实例时失败关闭，不替玩家猜测要卖、丢、穿哪一件。
- 实例 ID 会避开已有数字 ID，并保留非数字旧 ID。

### 2. 穿戴、强化和修理不再补造或改写错误实例

- 穿戴和卸下只改变同一个实例的 `backpack/equipped` 位置。
- 已穿戴槽必须映射到同 `itemId`、同 `slotId` 的唯一实例。
- 耐久、强化、磨损和经验丹充能的兼容字段与实例冲突时拒绝操作。
- 强化和修理在验证完成前不扣石币或材料。
- 删除 `server_equip_fallback`、`server_enhance_fallback`、`server_repair_fallback`，四处错误的槽位版本 `3` 统一恢复为版本 `5`。

实例读写不再通过白名单重建记录。未来可能加入的品质、绑定、词缀等未知字段会原样保留；高于当前实例 schema 的档案拒绝改写。

联网战斗同样只承认槽位映射正确的 canonical instance：只有旧兼容字段的“影子装备”不提供属性、精灵或攻击动作；磨损会跳过坏槽并继续寻找下一件合法装备，高版本实例不会被旧服务改写。

### 3. 奖励和转生保持原子

- 任务奖励在临时档案中完整结算，装备实例创建失败时不发币、不发物品、不标记已领取，避免重复领取。
- 一至六转的装备奖励在消耗四戒、试炼宠和重置等级前预留背包空间并预演实例创建。背包满时整次转生拒绝，稀有奖励不会被当作普通 `lostItems` 丢失。
- 战斗奖励若未来配置了装备，进入背包的部分会生成实例；装备因满包或实例冲突无法安全发放时，仅本组奖励原子暂停，不发石币、不发物品，也不制造无实例附件。本场已经成立的人物/宠物 HP、EXP、任务、特殊进度和挂机结算仍会继续持久化，并记录 `skippedReason` 供 GM 排查。

### 4. 未完成实例信封前禁止跨容器搬运装备

银行、交易所、邮件和面对面交易目前只支持模板数量，不能安全承载实例状态。本阶段暂时拒绝这些渠道中的装备：

- 新存入、上架、发送或报价在任何扣款、扣物和 revision 变化前拒绝。
- 历史银行物品、挂单和邮件附件不能取出、购买、取消或领取；原资产和同封货币保持不变，并提示联系 GM。
- 银行存取石币和解锁页也会先扫描原始银行档案；只要存在装备、当前版本未知物品或更高 schema，就在任何 normalize、扣钻和 revision 变化前整体拒绝。
- 市场购买/取消与邮件领取在 normalize 前扫描原始挂单/附件；未知物品或更高 schema 不会被过滤后连同挂单、邮件或货币一起删除。
- 所有会增减、整理或写回背包的商店、任务、转生、合成、银行、市场、邮件、交易和档案操作共用原始背包安全门：未知物品、非法数量、超堆叠、超容量、未知槽字段和旧 `captureTools` 未知资产都会在写入前整体拒绝。
- 共享安全门同时读取整份装备实例状态：未来/非法实例版本、非对象嵌套状态、非法耐久/强化/磨损/充能值、未知槽位键、未知或错槽物品及不透明兼容字段均拒绝改写；不会再把未来值归零、过滤或强制重建。声明实例权威的整档保存还会执行数量、位置与槽位映射完整审计，surplus/orphan 不能被一份干净档案覆盖删除。
- 离线挂机开始/领取/取消、在线挂机停止、任务记录与领取、GM 宠物发放/升级、装备修理也接入相同门禁。聊天本身仍可用，但坏档时不会顺带推进或自动领取任务；档案 revision 保持不变。
- 战斗入口也执行同一门禁，避免未来物品坏档下战斗道具/捕捉工具先在房间内生效、结算时却无法安全扣除而形成免费使用；若战斗期间外部状态变坏，物品与捕捉工具写回会跳过并记录原因。
- 战斗最终档案写回与遇敌石时段许可消费再次防御性校验；即使战斗期间发生外部坏档，也不会用 HP、EXP、耐久或任务结算覆盖异常资产。
- 原始银行的 `slots/items/itemAmounts` 必须聚合一致，单格、总容量和已解锁页均合法；邮件的附件/货币双表示、市场挂单版本和托管卖家也必须可解释。失败不会由买家请求删除挂单或邮件。
- 普通物品和纯货币流程保持原行为。
- 面对面交易是运行时状态，失败时不再顺带删除报价。

这是一道临时安全闸，不是最终玩法。P0.5b-3 会给四类容器增加实例信封和具体实例选择，再恢复装备流通。

## 修复后证据

同一隔离复现路径现在得到：

```text
购买木棒后：backpack count = 1，backpack instance = 1
装备、强化 +2、卸下并出售后：backpack count = 0，backpack instance = 0
再次购买：获得新 instanceId，强化等级为 +0
```

还固定覆盖了 surplus ghost、future schema、同名不同状态、背包实例被槽位引用、错物品槽位映射、未知词缀保留、影子装备无战力、坏槽磨损跳过、装备任务奖励、转生满包、Lv140 溢出经验丹、战斗装备奖励局部暂停，以及背包/银行/市场/邮件/交易的原始档案、双表示、容量和版本失败原子性。

## 非目标与下一步

- 没有连接、扫描或改写真实 MySQL 玩家档案。
- 没有删除任何历史 surplus 实例，也没有把客户端会自动删 surplus 的逻辑搬到服务端。
- 本阶段没有声称历史档案已完成迁移。P0.5b-2 将实现 v2→v3：确定性补齐 deficit；surplus、重复映射、状态冲突和未来版本输出报告并失败关闭。
- 本阶段没有新增装备选择 UI。多件同名不同状态资产在缺少明确实例 ID 时宁可拒绝。

## 验证

```text
node --check server/node/src/auth-service.js
node --check server/node/src/auth/equipment-profile-state.js
node --check server/node/src/auth/economy.js
node --check server/node/src/auth/mail-chat.js
node --check server/node/src/auth/profile-actions.js
node --check server/node/src/auth/battle-room.js
node --check server/node/src/auth/family-manor.js
node --check server/node/src/auth/gm-pets.js
node --check server/node/src/auth/offline-hang.js
node --check server/node/src/auth/quest.js
node --check server/node/src/auth/battle-equipment-rules.js
node --test server/node/test/equipment-profile-state.test.js server/node/test/battle-equipment-rules.test.js server/node/test/auth-battle-equipment-authority.test.js server/node/test/auth-profile-actions.test.js server/node/test/auth-economy.test.js server/node/test/auth-social-world.test.js server/node/test/auth-quest-hang.test.js server/node/test/auth-http-server.test.js server/node/test/auth-family-manor.test.js server/node/test/auth-offline-hang.test.js server/node/test/auth-gm-pets.test.js
node --test --test-name-pattern='party pve guardian victories|one-time qualification rewards|party pve victory writes stone coins|duel battle rooms snapshot and resolve equipment spirits|equipment reward conflicts skip only rewards|unsafe future backpack assets cannot enter battle|duel battle rooms snapshot and resolve server-authoritative battle items' server/node/test/auth-battle-room.test.js
git diff --check
```

结果：相关纯规则、服务、HTTP、社交经济、任务/转生、挂机、GM、庄园战及战斗权威聚焦回归 `169/169`，战斗房间奖励/道具/安全入口/精灵命名回归 `7/7`，全部通过；未运行完整 343 项服务端套件，也未运行 `tools/run_local_ci.mjs`，因为本阶段没有改变客户端画面、输入、移动或性能热路径。
