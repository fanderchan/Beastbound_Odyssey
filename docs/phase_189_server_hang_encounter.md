# Phase189：联网挂机与遇敌石闭环

## 目标

- 服务器账号下，走动挂机和遇敌石不再只修改本地 profile。
- 遇敌石使用由服务器扣除背包道具，并开启 `encounter_stone` 挂机会话。
- 挂机停止、遇敌石自然结束、低血回村治疗后的恢复，都通过服务端专用接口同步。
- 服务端 PVE 结算会写回挂机战斗次数、捕捉次数、捕捉目标停止，以及人物低血/倒下停止。

## 服务端接口

- `POST /hang/session/start`
  - `mode=walk`：开启走动挂机。
  - `mode=encounter_stone`：扣除遇敌石并开启遇敌石挂机。
  - 同步当前挂机设置：低血停止、回村治疗、捕捉目标数量。
- `POST /hang/session/stop`
  - 停止当前挂机会话并记录停止原因。

这两个接口是专用事务接口，替代旧的整档上传路径。

## 客户端规则

- 联网账号开始挂机前，必须先等服务器确认。
- 联网账号使用遇敌石时，本地不再先扣道具；服务器返回 profile 后再启动本地倒计时。
- 服务端 PVE 房间关闭时，客户端立即读取 `profileWriteback.hang`：
  - 捕捉目标达成：停止挂机并清遇敌石。
  - 人物低血/倒下：停止挂机；如果设置为回村治疗，则自动寻路到村医。
  - 治疗后继续挂机时，重新向服务器开启 `walk` 会话。
- 自动捕宠“无目标逃跑”在服务端 PVE 中走服务器逃离房间，不再走本地逃跑。

## 自测

```sh
npm test --prefix server/node
godot --headless --path client/godot --scene res://scenes/Main.tscn -- --auto-server-auth-contract-check
godot --headless --path client/godot --scene res://scenes/Main.tscn -- --auto-encounter-check
godot --headless --path client/godot --scene res://scenes/Main.tscn -- --auto-hang-settings-check
godot --headless --path client/godot --scene res://scenes/Main.tscn -- --auto-battle-settings-check
godot --headless --path client/godot --scene res://scenes/Main.tscn -- --auto-capture-settings-check
```

另有一次内存 Node HTTP 联机验证覆盖：

- 购买遇敌石。
- `POST /hang/session/start` 扣除遇敌石并开启会话。
- `POST /hang/session/stop` 停止会话。
- 服务端 PVE 胜利后因人物低血写回 `lastStopReason=low_hp` 和 `pendingResume=true`。
