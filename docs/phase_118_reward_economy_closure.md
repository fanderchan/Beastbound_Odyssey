# Phase118 掉落 / 奖励 / 经济闭环

## 已统一

- 战斗掉落、任务奖励、通用奖励发放统一走 `PlayerProgressModel.grant_reward_bundle`。
- 奖励支持 `stoneCoins`、`diamonds`、`items`、`abilities`。
- 背包满时，未放入背包的道具会进入系统邮箱。
- 邮箱附件 30 天到期，领取时如果背包仍满，附件保留在邮箱。

## 当前提示

- 战斗结算会提示：`背包已满，xxx 已发送邮箱。`
- 任务领取时如果有奖励进邮箱，也会在完成提示后补充邮箱提示。

## 自测

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-reward-grant-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-battle-reward-check
```
