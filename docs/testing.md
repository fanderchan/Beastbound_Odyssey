# Beastbound Odyssey 测试与性能基线

本文档记录当前推荐的自测入口和每阶段性能验证方式。原则是：功能通过不够，还要确认没有把移动、HUD、商店、任务寻路这些热点路径重新拖慢。

## 基础启动

正常客户端：

```sh
godot --path client/godot --scene res://scenes/Main.tscn
```

完整客户端测试入口：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --full-client-preview
```

GM 测试地图：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --full-client-preview --gm-10v10-map
```

## 基础解析检查

```sh
godot --headless --path client/godot --quit
```

## 后端检查

```sh
cd server/node
npm test
```

## 每阶段推荐回归

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --shop-select-perf-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-player-stat-spam-perf-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-panel-registry-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-auth-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-auth-server-client-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 5000 -- --auto-auth-server-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 6000 -- --auto-server-mail-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-party-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-chat-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-online-position-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-qa-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-server-profile-contract-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-server-auth-contract-check
```

如果改了宠物成长、MM、骑宠或转生，追加：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-pet-growth-observation-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-pet-rebirth-mm-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-pet-rebirth-mm-formula-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-riding-system-check
```

如果改了任务、地图、转生洞穴或寻路，追加：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-task-tracker-route-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-map-region-contract-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-rebirth-cave-guardian-check
```

如果改了战斗公式、战斗播放、自动战斗或数值表，追加：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-battle-auto-10v10-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-combat-formula-parity-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-combat-formula-driver-ab-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-numeric-workbench-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-numeric-balance-gate-check
```

## 性能探针

用于观察 `_process`、HUD、draw、移动和任务刷新成本：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1600 -- --perf-probe
```

如果 `--quit-after` 没有及时退出，应手动停止进程并确认没有残留：

```sh
pgrep -fl godot
```

记录性能时至少写清楚：

- 当前阶段 / commit。
- 是否完整客户端。
- idle `process_total`。
- 移动或连点测试结果。
- 商店/状态/任务面板压力结果。
- 是否有 Godot 残留进程。

## 最近基线

Phase148 开始前的参考结果：

- `--movement-spam-click-check`：`status=ok clicks=360 avg_input_us=15 max_input_us=122 coalesced=true settled=true`
- `--shop-select-perf-check`：`status=ok item_us=1464911 equipment_us=2252767`
- `--auto-player-stat-spam-perf-check`：`status=ok elapsed_ms=1.21 refresh_count=2 saves=1`
- `--auto-qa-panel-check`：`status=ok buttons=true layout1=true layout2=true button_count=18`
- `--perf-probe`：稳定后 `process_total` 约 1-2ms，首次 HUD 构建存在明显尖峰。

Phase149 重点观察：

- HUD / 任务追踪不应在移动帧持续全量扫描任务、背包或宠物。
- `--auto-task-tracker-route-check`、`--auto-npc-quest-marker-check` 必须继续通过。
- `--movement-spam-click-check` 需要保持 `coalesced=true`、`settled=true`。
- `--perf-probe` 中 `hud_signature`、`redraw_check` 不应出现持续高值。

Phase149 完成后的参考结果：

- `--auto-task-tracker-route-check`：`status=ok route=true disabled_after=true reenabled=true`
- `--auto-npc-quest-marker-check`：`status=ok available=true in_progress=true ready=true blocked=true rebirth=true`
- `--movement-spam-click-check`：`status=ok clicks=360 avg_input_us=25 max_input_us=2229 coalesced=true settled=true`
- `--auto-player-stat-spam-perf-check`：`status=ok elapsed_ms=3.21 refresh_count=2 saves=1`
- `--shop-select-perf-check`：`status=ok item_us=1513393 equipment_us=2145298`
- `--perf-probe`：稳定后 `hud_signature` 约 `0.03-0.06ms`，`redraw_check` 约 `0.01-0.04ms`，`process_total` 多数约 `0.19-0.37ms`。

Phase150-C 完成后的参考结果：

- `--auto-pet-rebirth-mm-formula-check`：`status=ok ranges=true interpolation=true preview=true seeded=true full_mid=1.400`
- `--auto-pet-rebirth-mm-check`：`status=ok catalog=true buy_stone=true feed=true rebirth=true stage2_claim=true`
- `--shop-select-perf-check`：输出三轮样本的 `item_us/equipment_us` 中位数、`min/max`，以及合并详情刷新的 `item_flush_us/equipment_flush_us`。详情生成与 RichText 排版已按下一帧合并，商品列表与数量上限复用缓存，当前基线约 `item_us≈40ms equipment_us≈50ms flush<1ms`。

Phase150-A 完成后的参考结果：

- `--auto-panel-registry-check`：`status=ok registry=true top_blocks=true synthesis_menu=true synthesis_blocks=true clear=true`
- `--auto-qa-panel-check`：`status=ok button_count=18`
- `--auto-equipment-synthesis-check`：`status=ok ui_ready=true ui_result=true output=weapon_hardwood_club`
- `--movement-spam-click-check`：`status=ok clicks=360 avg_input_us=12 max_input_us=391 coalesced=true settled=true`
- `--perf-probe`：稳定后 `hud_signature` 约 `0.03-0.08ms`，`redraw_check` 约 `0.01-0.03ms`，`process_total` 多数约 `0.17-0.33ms`。

Phase150-B 重点观察：

- 背包筛选 presenter 拆分后，`全部 / 世界 / 战斗 / 捕捉 / 装备` 五个筛选页签仍应保持原行为。
- 背包 UI 拆分不应改变道具使用、装备、快捷栏、扩展锁位或背包满兜底。
- 继续用 `--movement-spam-click-check` 和 `--perf-probe` 确认 UI 拆分没有带回移动卡顿。

Phase150-B 完成后的参考结果：

- `--auto-backpack-filter-check`：`status=ok all=true battle=true world=true capture=true equipment=true`
- `--auto-backpack-check`：`status=ok slots=true stack=true context=true panel=true unlock=true item_menu=true capture_menu=true meat_consumed=true`
- `--auto-backpack-world-use-check`：`status=ok context=true detail=true use_button=true targets=true world_use=true full_block=true`
- `--auto-panel-registry-check`：`status=ok registry=true top_blocks=true synthesis_menu=true synthesis_blocks=true clear=true`
- `--movement-spam-click-check`：`status=ok clicks=360 avg_input_us=28 max_input_us=150 coalesced=true settled=true`
- `--perf-probe`：启动期首次 HUD 构建仍有尖峰；稳定后 `hud_signature` 多数约 `0.03-0.06ms`，`process_total` 多数约 `0.17-0.33ms`，偶发约 `0.84ms`。

Phase150-C 重点观察：

- 背包详情和动作按钮状态迁入 presenter 后，世界可用道具、装备、快捷栏、捕捉道具隐藏规则必须保持一致。
- `--auto-backpack-world-use-check` 要覆盖肉、满血使用、世界使用弹字、捕捉道具不显示使用按钮。
- 如果本阶段引入 typed array 改动，必须先跑 `godot --headless --path client/godot --quit`，避免 UI 逻辑在运行时才报错。

Phase150-C 完成后的参考结果：

- `--auto-backpack-filter-check`：`status=ok all=true battle=true world=true capture=true equipment=true`
- `--auto-backpack-check`：`status=ok slots=true stack=true context=true panel=true unlock=true item_menu=true capture_menu=true meat_consumed=true`
- `--auto-backpack-world-use-check`：`status=ok context=true detail=true use_button=true targets=true world_popup=true full_block=true capture_hidden=true`
- `--auto-equipment-check`：`status=ok ui_detail=true ui_equip=true compare_gain=true compare_loss=true panel=true`
- `--auto-equipment-shop-preview-check`：`status=ok detail=true button=true buy_only=true direct_action=true`
- `--movement-spam-click-check`：`status=ok clicks=360 avg_input_us=27 max_input_us=697 coalesced=true settled=true`
- `--perf-probe`：启动期首次 HUD 构建约 `58.86ms`；稳定后 `hud_signature` 多数约 `0.02-0.06ms`，`process_total` 多数约 `0.12-0.33ms`。

Phase161 账号/档案同步自测：

- 服务端：`cd server/node && npm test`
- 客户端：
  - `godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-auth-server-client-check`
  - `godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 5000 -- --auto-auth-server-live-check`
  - `godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-server-profile-sync-check`
- 性能：继续跑 `--movement-spam-click-check` 和 `--perf-probe`，确认保存同步没有进入移动/HUD热路径。

Phase162 服务器-only / 多开前置自测：

- 先启动服务端：`cd server/node && npm start`
- 单客户端真实联网登录：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 5000 -- --auto-auth-server-live-check`
- 双客户端并发时，在两个终端同时运行上一条命令；两个进程应各自输出 `status=ok`，并创建不同服务器账号和档案 revision。

Phase163 玩家文本邮件自测：

- 服务端：`cd server/node && npm test`
- Godot 服务器邮件：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 6000 -- --auto-server-mail-live-check`
- Godot 系统附件邮箱：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3200 -- --auto-mailbox-check`

Phase164 在线队伍自测：

- 服务端：`cd server/node && npm test`
- Godot 服务器队伍：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-party-live-check`
- 性能：继续跑 `--movement-spam-click-check` 和 `--perf-probe`，确认在线队伍请求只发生在打开面板或点击按钮时。

Phase165 服务端聊天自测：

- 服务端：`cd server/node && npm test`
- Godot 聊天面板本地状态：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 4000 -- --auto-chat-panel-check`
- Godot 真实联网聊天：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-chat-live-check`
- 回归：继续跑 `--auto-auth-server-client-check`、`--auto-party-live-check`、`--movement-spam-click-check` 和 `--perf-probe`，确认聊天请求只发生在打开面板、切换频道、刷新或发送消息时。

Phase166 在线位置快照自测：

- 服务端：`cd server/node && npm test`
- Godot 真实联网位置：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-online-position-live-check`
- 回归：继续跑 `--auto-auth-server-client-check`、`--auto-party-live-check`、`--auto-chat-live-check`、`--movement-spam-click-check` 和 `--perf-probe`，确认位置同步走低频 Timer，不进入 HUD/移动每帧重计算。

## 验收口径

可以接受：

- 单次打开面板有轻微构建成本。
- `main.gd` 临时编排新模块，但不继续承载大段静态数据。
- 兼容层保留，但必须有淘汰说明。

不可接受：

- 移动、HUD、任务寻路每帧全量扫描。
- 玩家普通 UI 暴露工程命令或 debug 字段。
- 只跑功能自测，不记录性能变化。
- 数值表静默改变旧版本语义。
