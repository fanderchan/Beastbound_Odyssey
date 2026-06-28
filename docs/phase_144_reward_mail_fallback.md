# Phase144：经济 / 邮件 / 背包满统一兜底

## 目标

把“奖励进背包失败怎么办”统一收口，避免战斗、任务、转生奖励或 GM/系统补发各自处理，导致某些奖励静默丢失。

## 当前规则

- `PlayerProgressModel.grant_reward_bundle()` 是系统奖励道具的统一入口。
- 支持奖励字段：
  - `stoneCoins`
  - `diamonds`
  - `items`
  - `abilities`
- 石币、钻石和能力直接写入角色档案。
- 道具优先进入随身包。
- 随身包空间不足时，未放入的道具转入系统邮箱。
- 邮件附件默认 30 天过期。
- 领取邮件时如果背包仍满，已能放入的部分进入背包，剩余附件保留在邮件里。

## 已接入入口

- 战斗胜利掉落。
- 任务奖励和自选奖励。
- 通用 GM/系统奖励。
- 人物转生试炼奖励物品。

## 不混入的场景

- 商店购买仍然是交易行为：背包空间不足时阻止购买，不自动邮寄，避免扣费后玩家忘记去邮箱找。
- 宠物实例不是背包道具：队伍和兽栏都满时，宠物领取仍然阻止，不在本阶段改成宠物邮件。
- 装备穿脱的“换下旧装备”仍然要求背包有空间，否则阻止操作，避免玩家换装后找不到装备。

## 玩家提示

- 战斗日志：`背包已满，xxx 已发送邮箱。`
- 任务完成：`背包已满，xxx 已发送邮箱。`
- 邮箱领取：背包空间不足时提示附件仍留在邮箱。

## 自测

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-reward-mail-fallback-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-reward-grant-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-battle-reward-check
```

`--auto-reward-mail-fallback-check` 覆盖：

- 通用奖励满包进邮箱。
- 战斗掉落满包进邮箱，回执记录 `mailedItems`。
- 任务奖励满包进邮箱。
- 转生试炼奖励物品满包进邮箱。
