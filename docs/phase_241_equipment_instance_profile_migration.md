# Phase241：装备实例档案 v2→v3 确定性迁移

## 问题复现

P0.5a 只建立了玩家根档案 `v1→v2` 的版本边界，没有迁移装备表示。固定夹具中，`v2` 档案可以同时存在一件背包木棒模板和零条 backpack instance；旧 registry 会直接把它当作当前档案返回：

```text
schemaVersion = 2
backpack weapon_wooden_club = 1
backpack equipment instance = 0
migrateProfile: ok=true, changed=false
```

反方向的 surplus 同样会被接受：背包模板为零、却保留一条强化装备实例。若继续允许这种档案进入普通 writer，旧强化装备可能在以后重买同名模板时复活；若复用客户端 normalizer，又会直接删除 surplus、移动背包候选或吞掉未知字段，破坏冲突证据。

## 原创 Beastbound 规则

### 1. 玩家根档案版本 3

- 当前玩家根版本提升为 `3`，registry 严格顺序执行 `v1→v2→v3`。
- `v1→v2` 仍只改根版本；`v2→v3` 只允许改根版本和四个装备表示字段：`equipmentInstances`、`equipmentSlotInstanceIds`、`nextEquipmentInstanceSerial`、`equipmentSlotsVersion`。
- 任一步失败都返回完整原始档案，不能留下只升到 v2 的半迁移结果。
- 新注册的服务端档案直接创建为 v3；合法 v3 每次读取仍重新审计，腐坏 v3 不能凭版本号跳过检查。

### 2. 只补可以证明的 deficit

允许的确定性修复只有三类：

1. 每个装备模板的背包数量大于合法 backpack instance 数量时，按正差创建全新默认实例。
2. 已装备槽有合法模板、但没有任何候选实例时，使用该槽的耐久、强化、磨损或经验丹兼容状态创建 equipped instance 并映射。
3. 已存在唯一的同 item、同 slot equipped instance 且只缺映射时，只补该映射。

生成顺序固定为装备目录槽位顺序，然后按 `itemId` 排序的背包 deficit；ID 从安全 serial 开始并避开已有编号。现有数字 ID、非数字 ID、实例对象、未知顶层字段和已有映射全部逐字保留，不移动、不覆盖、不删除。

背包装备使用满耐久、+0 和空磨损。已装备实例保留明确兼容状态；兼容字段缺失时只能采用与当前运行时完全相同的默认值。经验丹 `nextExp` 使用服务端权威人物等级曲线。

### 3. 歧义和冲突失败关闭

以下状态只报告，不自动修复：

- backpack instance surplus、空槽映射、孤儿 equipped、同槽多实例或同实例多槽；
- 映射目标缺失、位置错误、错物品或错槽；
- 实例与兼容耐久、强化、磨损、经验丹进度不一致；
- `equipmentSlotsVersion < 3` 且背包与装备槽存在同名模板，无法证明旧背包数量是否包含装备镜像；
- 未知物品/槽位、非法容器、非法数量、未购买的背包扩展格、serial 越界或耗尽；
- 非规范或未来的槽位、实例、银行、邮件、市场和交易版本/信封；
- 经验丹低于模板起始等级、超过 Lv140、曲线不符、EXP 越界；
- 武器攻击磨损余数达到 100、护甲受击余数达到 10，或非本类计数不为零。

银行、旧本地邮箱、服务端邮件、市场和交易仍只有模板表示。P0.5b-3 的实例信封完成前，只要这些容器存在装备，单档和整批迁移都不可应用。

## 迁移报告

纯 registry 和 userdata 导入预演现在会报告：

- `applySafe`、源/目标版本、`planDigest`；
- 迁移前后逻辑资产与表示摘要；
- 创建的 backpack/equipped instance、补充的映射和 serial 前后值；
- 冲突的稳定 code、path、slotId、itemId、instanceId 和数量事实；
- 既有实例/映射是否逐字保留，以及最终 invariant audit 摘要。

报告与实例 ID 不依赖对象插入顺序或系统 locale。单账号 CLI 在读取数据库前先审计导入档案；导入档案自身不安全的 `--apply` 会输出结构化 JSON、非零退出，并且不创建备份、不访问数据库。读取快照后若发现外部容器装备，也会在任何目标档案写入前拒绝。

## 非目标

- 本阶段没有扫描、改写或删除真实 MySQL 玩家数据。
- 没有自动处理 surplus、旧槽位背包镜像或状态冲突；它们必须由后续预演报告和人工规则解决。
- 没有给银行、市场、邮件或交易增加实例信封，也没有解除 P0.5b-1 的临时装备流转拒绝。
- 没有修改客户端 normalizer。其历史有损逻辑不能作为服务端迁移依据。
- 没有运行完整服务端 343 项或本地全 CI；本阶段不改画面、输入、移动或性能热路径。

## 验证

```text
node --check server/node/src/auth/equipment-profile-migration.js
node --check server/node/src/auth/equipment-profile-state.js
node --check server/node/src/auth/profile-migrations.js
node --check server/node/src/auth-service.js
node --check server/node/scripts/migrate-local-userdata-to-mysql.js
node --test server/node/test/equipment-profile-migration.test.js server/node/test/equipment-profile-state.test.js server/node/test/profile-migrations.test.js server/node/test/local-userdata-migration-script.test.js server/node/test/auth-auth-session.test.js
git diff --check
```

聚焦验证覆盖纯 deficit、部分实例、唯一缺映射、稳定 ID、serial 碰撞/耗尽、未知字段保留、v1 原子两步、v3 幂等复审、surplus、孤儿、错配、重复映射、兼容冲突、背包/银行/邮件/市场/交易阻断、经验丹曲线、磨损余数、未来版本、对象键重排、整批一坏全坏、只读 CLI、0600 备份与目标级回滚。

结果：上述 5 个语法检查、`git diff --check` 与 6 个聚焦测试文件共 `71/71` 通过。
