# Phase106：人物 / 宠物经验丹

## 目标

- 提供测试转生链路用的快速升级道具：
  - `人物经验丹(LV131)`
  - `宠物经验丹(LV131)`
- 经验丹不是直接设置等级，而是发放“到达对应等级所需的累计经验”。
- 人物经验丹可装备到专属“经验丹”槽；人物满级后的溢出经验会存入已装备的人物经验丹。

## 经验曲线

参考本地 8.0 源码 `/Users/fander/projects/_local_references/StoneAge/gmsv/data/exp.txt` 的语义：

- 8.0 使用“到达等级所需累计经验”进行升级判断。
- 本项目当前仍保存“当前等级内经验 + nextExp”，因此用统一函数换算本级升下级经验。
- 第一版使用原型公式曲线，保留早期原型节奏，同时让 100 级以后经验需求明显抬升。

## 背包与装备

- 老存档首次进入会一次性补发 5 个 `人物经验丹(LV131)` 和 5 个 `宠物经验丹(LV131)`。
- 如果背包已满，补发物品会进入系统邮箱，邮件 30 天后过期；腾出背包格子后可从底部 `邮箱` 入口领取附件。
- 人物经验丹在背包里同时属于“世界可用”和“装备”。
- 宠物经验丹只属于“世界可用”，使用时需要选择队伍宠物。
- 装备面板新增第 9 个格子：`经验丹`，放在面板左下角。
- 经验丹槽不提供属性、不消耗耐久、不参与修理。
- 背包当前仍是堆叠物品模型；为避免丢失储存进度，已储存经验的经验丹暂不能卸下或替换。

## 系统邮箱

- 邮箱第一版保存在本地角色存档里，后续服务端化时可迁移为 GM 发物品和活动补偿的通用邮件表。
- 邮件包含 `mailId`、发件人、标题、正文、创建时间、过期时间和附件列表。
- 领取附件时如果背包仍然没有空间，附件会继续留在邮箱，不会丢失。

## 验证

```bash
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3000 -- --auto-exp-pill-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3000 -- --auto-mailbox-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3000 -- --auto-backpack-world-use-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3000 -- --auto-equipment-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3000 -- --auto-player-rebirth-preview-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3000 -- --auto-player-rebirth-execute-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 4000 -- --auto-player-rebirth-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3000 -- --movement-perf-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3000 -- --movement-spam-click-check
```

手动测试：

```bash
godot --path client/godot --scene res://scenes/Main.tscn
```
