# Phase137 装备实例化

## 目标

装备从“模板道具 + 槽位外挂状态”过渡到“每一件装备都有独立实例”。这样同名装备可以拥有不同耐久、强化、经验丹充能、来源记录，后续装备转生、绑定、极品掉落、邮件兜底和服务端存档迁移才有稳定数据基础。

## 数据结构

玩家档案新增以下字段：

- `equipmentInstances`：装备实例表，按 `instanceId` 存储。
- `equipmentSlotInstanceIds`：装备槽到实例 ID 的映射。
- `nextEquipmentInstanceSerial`：下一个装备实例序号。
- `equipmentSlotsVersion = 5`：标记已进入实例化版本。

每个装备实例第一版字段：

- `instanceId`：例如 `equip_000019`。
- `itemId`：装备模板 ID，例如 `weapon_wooden_club`。
- `location`：`equipped` 或 `backpack`。
- `slotId`：装备中时所在槽位，背包中为空。
- `durability`：本件装备自己的耐久。
- `enhancement`：本件装备自己的强化等级和历史。
- `wearCounters`：本件装备自己的攻击/受击耐久计数。
- `expPillCharge`：经验丹槽装备的储存经验。
- `source`：迁移或创建来源，第一版用于排查和后续审计。

## 兼容策略

当前 UI、战斗和旧测试仍有大量代码读取：

- `equipmentSlots`
- `equipmentDurability`
- `equipmentEnhancement`
- `equipmentWearCounters`
- `equipmentExpPillCharge`

所以 Phase137 采用双层兼容：

1. `normalize_profile` 会从旧字段迁移出装备实例。
2. 真实装备状态保存在 `equipmentInstances`。
3. 每次归一化后再从实例派生旧字段，保证旧 UI 和战斗逻辑继续工作。

这让后续可以逐步把装备栏、背包、商店、掉落、邮件显示改成直接展示实例，而不需要一次性大改所有 UI。

## 已接入流转

- 默认装备：自动迁移为已装备实例。
- 背包中的装备：根据背包装备数量自动补齐背包实例。
- 购买装备：背包数量增加后会生成背包实例。
- 装备道具：从背包实例移动到装备槽。
- 换装：旧装备实例回到背包，新装备实例进入槽位。
- 卸下：已装备实例回到背包。
- 强化：强化等级写回当前装备实例。
- 耐久：耐久和攻击/受击计数写回当前装备实例。
- 经验丹槽：储存经验写回当前经验丹实例。

## 自测命令

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-equipment-instance-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-equipment-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-equipment-durability-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-equipment-growth-check
```

重点观察 `--auto-equipment-instance-check`：

- 默认装备都有实例 ID。
- 同名木棒购买两把后生成两个不同实例。
- 装备其中一把后只移动该实例。
- 强化后卸下再装备，强化仍跟随同一个实例。

## 后续

Phase137 第一版完成的是数据地基。后续阶段可以继续做：

- 背包中同名装备显示实例差异。
- 邮件附件保存装备实例。
- 装备掉落生成随机词条和来源。
- 出售时允许选择具体实例。
- 服务端存档 schema 直接存装备实例表。
