# Phase42：丢弃宠物 / 地面拾取

这一阶段把“放生”修正为石器式的 `丢弃`：宠物不是永久删除，而是从队伍落到地图地面，之后可以被拾取。

## 规则

- 宠物面板新增短按钮 `丢弃`。
- 队伍宠可以丢弃，兽栏宠不能直接丢弃。
- 丢弃出战宠后，会清空当前出战宠，不自动补另一只出战。
- 丢弃后宠物从队伍移入 `groundPetDrops`，不再占队伍栏位。
- 地面掉落对象使用独立 `dropId`，宠物本体继续保留原 `instanceId`。
- 默认 `pickupMode` 为 `public`，为后续多人拾取保留接口。
- 拾取成功后宠物回到队伍，状态统一为 `待机`。
- 队伍满时不能拾取，提示 `队伍已满。`
- 不能拾取等级超过自己 5 级以上的宠物。
- 丢在地上超过 10 分钟后，地面宠物会消失。
- 地面宠物不阻挡移动，但丢弃时会占用玩家周围 8 个方向格子的随机一格。
- 玩家周围可用邻格都已有地面宠时，丢弃失败并提示 `地面太满了`。

## 数据形状

`petInstances` 只保存队伍和兽栏里的宠物。

地面宠物保存在 `groundPetDrops`：

```json
{
  "dropId": "ground_pet_1",
  "ownerId": "local_player",
  "pickupMode": "public",
  "mapId": "firebud_training_yard",
  "cell": [14, 12],
  "createdAtSec": 123456,
  "expiresAtSec": 124056,
  "pet": {
    "instanceId": "pet_bui_main"
  }
}
```

## 自测

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-drop-pickup-check
```

覆盖内容：

- `丢弃` 按钮可用。
- 地面宠默认公开可捡。
- 丢弃后宠物 ID 保留，出战宠不会自动补位。
- 拾取后回到队伍并变成 `待机`。
- 队伍满时不能拾取。
- 等级超过玩家 5 级以上不能拾取。
- 10 分钟过期会清理地面宠。
- 8 邻格都被地面宠占用时提示 `地面太满了`。
