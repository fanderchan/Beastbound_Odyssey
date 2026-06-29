# Phase 181 玩家互动入口

## 目标

- 地图上的在线玩家可以被点击或右键点击。
- 弹出「玩家互动」面板，提供发起切磋、加入队伍、邀请入队。
- 收到切磋邀请时弹出「切磋邀请」面板，可直接接受或拒绝。
- 组队补齐「申请加入对方队伍」语义，不再只支持队长邀请别人。

## 服务端合同

- `POST /party/apply`
  - 请求体：`{"username":"目标账号"}`
  - 申请者必须未组队。
  - 目标玩家必须已有队伍；如果目标是队员，请求会发给队长。
  - 队长接受后，申请者加入队伍。
- `partyInvites.kind`
  - `invite`：队长邀请别人入队。
  - `application`：玩家申请加入某个队伍。

## 客户端行为

- 点击或右键点击同图在线玩家，会打开「玩家互动」面板。
- 点空地仍然按原逻辑移动；右键点空地不会让角色移动。
- 「加入队伍」调用 `/party/apply`。
- 「邀请入队」保留原 `/party/invite`。
- 「发起切磋」调用 `/battle/invite`。
- 收到服务端 `battle.invite` 且当前账号是接收方时，显示可接受/拒绝的切磋面板。

## 验证

```bash
npm test
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn -- --auto-player-interaction-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn -- --auto-party-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn -- --auto-battle-room-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn -- --movement-spam-click-check
```
