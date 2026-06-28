# Phase145：宠物管理安全与批量操作

## 目标

把宠物管理从“能操作”推进到“不会误操作”。这一阶段重点不是新增复杂管理界面，而是先把危险动作的保护边界收口，避免锁定宠、任务宠、骑宠在批量操作、转强、交任务或清理时被误处理。

## 当前规则

- 锁定宠物不能丢弃。
- 锁定宠物不能交付任务。
- 锁定宠物不能作为转强 / 转生目标。
- 锁定的转生 MM 不能作为转强 / 转生材料。
- 当前任务需要的宠物不能清理、丢弃、交付给非目标流程，也不能作为转强 / 转生目标或材料。
- 骑乘宠物不会被批量存入兽栏，也不会被批量切成待机或休息。

## 批量操作

宠物面板新增两个轻量批量按钮：

- `批待`：把队伍内可操作宠物批量切为待机。
- `批休`：把队伍内可操作宠物批量切为休息。

批量状态只处理队伍宠物，不处理兽栏宠物。遇到锁定宠、任务宠、骑宠会跳过。若批量操作影响当前出战宠，会清空 `activePetInstanceId`，不会自动把下一只宠物改成出战。

`批存` 仍然调用模型层批量存入规则，但 UI 层现在要求：

- 已学会远程兽栏；或
- 当前是由兽栏 NPC / 兽栏入口打开的宠物面板。

没有兽栏访问权时，按钮会禁用，并提示 `需要学会远程兽栏，或前往村内兽栏。`

## 自测命令

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-pet-management-safety-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-pet-management-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-pet-stable-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-riding-system-check
```

`--auto-pet-management-safety-check` 覆盖：

- 锁定宠丢弃拦截。
- 锁定宠交任务拦截。
- 任务宠清理拦截。
- 批量存入跳过锁定宠。
- 批量待机 / 批量休息跳过锁定宠、任务宠和骑宠。
- 批量处理出战宠时不会自动补另一只出战宠。
- 锁定宠和任务宠不能转强。
- 锁定转生 MM 不能作为转强材料。
- 宠物面板 `批存` 的远程兽栏 / 兽栏访问限制。

## 本阶段验证记录

- `--auto-pet-management-safety-check`：通过，锁定、任务宠、骑宠、批量状态、转强材料保护均覆盖。
- `--auto-pet-management-check`：通过，休息 / 待机 / 战斗轮转、无出战宠战斗、排序筛选未回归。
- `--auto-pet-stable-check`：通过，队伍满时仍阻止取出，不引入交换逻辑。
- `--auto-riding-system-check`：通过，骑乘状态、骑宠保护、战斗承伤回写未回归。
- `--auto-pet-cultivation-check`：通过，原有宠物强化 / 转生流程未回归。
- `--auto-remote-stable-unlock-check`：通过，远程兽栏能力仍能解锁并远程存宠。
- `--auto-qa-panel-check`：通过，GM 宠物工具读取真实宠物列表，MM / 新手虎等普通宠都能作为升级目标。
- `--movement-spam-click-check`：通过，360 次快速点击合并为 18 次实际寻路，输入平均约 15 微秒。
- 可见完整客户端空站 CPU 抽样：启动后约 `31.7% -> 2.8%`，没有持续空站打满。
- 可见 `--perf-probe`：启动首帧有 HUD 初始化尖峰，稳定后 `process_total` 大多约 `0.8-2.4ms`。

## 后续

- 多选批量界面。
- 批量解锁、批量丢弃的二次确认。
- 任务需要宠物的醒目标记。
- 转生 / 交付任务前的宠物锁定建议。
