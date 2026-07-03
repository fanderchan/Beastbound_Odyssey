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

## 客户端全量自动检查

一键运行当前 `main.gd` 中注册的全部 `--auto-*-check`，并输出 `.run/godot_auto_checks/` 下的 log 与 summary JSON：

```sh
node tools/run_godot_auto_checks.mjs
```

常用缩小范围 / 续跑：

```sh
node tools/run_godot_auto_checks.mjs --list
node tools/run_godot_auto_checks.mjs --only --auto-auth-check,--auto-server-profile-sync-check
node tools/run_godot_auto_checks.mjs --from --auto-server-battle-return-check --fail-fast
```

## 本地 CI

默认运行 diff 检查、服务端测试、客户端全量自动检查，以及 idle / 移动 / 连点 / 商店 / 属性点性能基线：

```sh
node tools/run_local_ci.mjs
```

开发脚本本身时可用 quick 模式缩短 Godot 自动检查范围：

```sh
node tools/run_local_ci.mjs --quick
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
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-movement-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-click-move-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-click-move-reject-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-online-aoi-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-event-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-event-replay-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-battle-room-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-battle-turn-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-battle-reconnect-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-battle-close-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 4000 -- --auto-server-battle-return-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-battle-pet-snapshot-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 12000 -- --auto-server-battle-leave-ui-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 12000 -- --auto-server-battle-pet-command-live-check
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
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 5000 -- --auto-server-battle-turn-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 5000 -- --auto-server-battle-reconnect-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-battle-close-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 4000 -- --auto-server-battle-return-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-battle-pet-snapshot-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 12000 -- --auto-server-battle-leave-ui-live-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 12000 -- --auto-server-battle-pet-command-live-check
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

Phase167 WebSocket 事件通道自测：

- 服务端：`cd server/node && npm test`
- Godot 事件通道契约：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 7000 -- --auto-auth-server-client-check`
- Godot 真实联网事件：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-event-live-check`
- 回归：继续跑 `--auto-online-position-live-check`、`--auto-chat-live-check`、`--auto-party-live-check`、`--movement-spam-click-check` 和 `--perf-probe`，确认 WebSocket 每帧只做轻量 `poll()` 和限量包处理。

Phase168 在线 AOI 自测：

- 服务端：`cd server/node && npm test`
- Godot AOI 合同：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 7000 -- --auto-auth-server-client-check`
- Godot 真实联网 AOI：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-online-aoi-live-check`
- 回归：继续跑 `--auto-online-position-live-check`、`--auto-server-event-live-check`、`--movement-spam-click-check` 和 `--perf-probe`，确认 AOI 过滤发生在服务端和网络回包处理里，不进入每帧世界/HUD扫描。

Phase169 切磋房间自测：

- 服务端：`cd server/node && npm test`
- Godot 切磋房间合同：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 7000 -- --auto-auth-server-client-check`
- Godot 真实联网切磋房间：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-battle-room-live-check`
- 回归：继续跑 `--auto-server-event-live-check`、`--auto-online-aoi-live-check`、`--movement-spam-click-check` 和 `--perf-probe`，确认房间事件只更新轻量缓存，不启动本地战斗循环或增加 HUD/移动热路径成本。

Phase170 WebSocket 游标和断线补发自测：

- 服务端：`cd server/node && npm test`
- Godot 事件游标合同：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 7000 -- --auto-auth-server-client-check`
- Godot 真实联网断线补发：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-event-replay-live-check`
- 回归：继续跑 `--auto-server-event-live-check`、`--auto-battle-room-live-check`、`--auto-online-aoi-live-check`、`--movement-spam-click-check` 和 `--perf-probe`，确认 replay 只补关键事件，不把 `online.position` 历史插回玩家可见列表。

Phase171 服务器权威移动自测：

- 服务端：`cd server/node && npm test`
- Godot 移动合同：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 7000 -- --auto-auth-server-client-check`
- Godot 真实联网移动：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-movement-live-check`
- 回归：继续跑 `--auto-battle-room-live-check`、`--auto-server-event-replay-live-check`、`--auto-server-event-live-check`、`--auto-online-aoi-live-check`、`--movement-spam-click-check` 和 `--perf-probe`，确认服务器 step 没进入 Godot 每帧热路径，且切磋 ready 前会校验同图、近距离、停稳状态。

Phase172 房间回合命令和服务器战斗事件列表自测：

- 服务端：`cd server/node && npm test`
- Godot 回合合同：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 7000 -- --auto-auth-server-client-check`
- Godot 真实联网回合：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-battle-turn-live-check`
- 回归：继续跑 `--auto-battle-room-live-check`、`--auto-server-event-replay-live-check`、`--auto-server-event-live-check`、`--auto-server-movement-live-check`、`--movement-spam-click-check` 和 `--perf-probe`，确认回合命令通过 HTTP/WebSocket 轻量缓存流转，不启动本地战斗循环，也不进入 Godot 每帧热路径。

Phase177 切磋房间关闭和结果回写自测：

- 服务端：`cd server/node && npm test`
- Godot 关闭合同：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 7000 -- --auto-auth-server-client-check`
- Godot 真实联网关闭：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-battle-close-live-check`
- 回归：继续跑 `--auto-server-battle-turn-live-check`、`--auto-server-battle-reconnect-live-check`、`--movement-spam-click-check` 和 `--perf-probe`，确认关闭结果只退出服务器权威切磋，不触发本地 PvE 奖励、捕宠、任务或击飞结算。

Phase178 服务器人物与宠物快照自测：

- 服务端：`cd server/node && npm test`
- Godot 真实联网宠物快照：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 9000 -- --auto-server-battle-pet-snapshot-live-check`
- 回归：继续跑 `--auto-server-battle-turn-live-check`、`--auto-server-battle-reconnect-live-check`、`--auto-server-battle-close-live-check`、`--auto-battle-auto-10v10-check`、`--movement-spam-click-check` 和 `--perf-probe`，确认宠物快照进入服务器 battle actors，但不把 profile 读取或宠物列表扫描放进 Godot 热路径。

Phase179 联网切磋离开按钮自测：

- 服务端：`cd server/node && npm test`
- Godot 真实联网离开：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 12000 -- --auto-server-battle-leave-ui-live-check`
- 回归：继续跑 `--auto-server-battle-close-live-check`、`--auto-server-battle-pet-snapshot-live-check`、`--movement-spam-click-check` 和 `--perf-probe`，确认“离开”走服务端关闭房间，不走本地 PvE 逃跑结算。

Phase180 联网切磋宠物指令自测：

- 服务端：`cd server/node && npm test`
- Godot 真实联网宠物指令：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 12000 -- --auto-server-battle-pet-command-live-check`
- 回归：继续跑 `--auto-server-battle-pet-snapshot-live-check`、`--auto-server-battle-turn-live-check`、`--auto-server-battle-reconnect-live-check`、`--auto-server-battle-close-live-check`、`--auto-server-battle-leave-ui-live-check`、`--auto-battle-auto-10v10-check`、`--movement-spam-click-check` 和 `--perf-probe`，确认人物和宠物 actor 指令不会把 profile 读取、宠物列表扫描或战斗 UI 刷新放进 Godot 热路径。

Phase181 玩家互动入口自测：

- 服务端：`cd server/node && npm test`
- Godot 合同：`godot --headless --path client/godot --scene res://scenes/Main.tscn -- --auto-auth-server-client-check`
- Godot 真实联网玩家互动：`godot --headless --path client/godot --scene res://scenes/Main.tscn -- --auto-player-interaction-live-check`
- 回归：继续跑 `--auto-party-live-check`、`--auto-online-position-live-check`、`--auto-battle-room-live-check`、`--movement-spam-click-check` 和 `--perf-probe`，确认点人菜单、入队申请和切磋邀请弹窗不进入移动/HUD热路径。

Phase186 MySQL stdin 保存和宠物指令稳定性自测：

- 服务端：`cd server/node && npm test`
- MySQL store 语法：`node --check server/node/src/mysql-store.js && node --check server/node/test/auth-service.test.js`
- Godot 真实联网宠物指令：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 12000 -- --auto-server-battle-pet-command-live-check`
- Godot 真实联网宠物快照：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 12000 -- --auto-server-battle-pet-snapshot-live-check`
- 回归：确认 MySQL 保存走 stdin 而不是 `mysql -e` 超长参数；宠物 live check 接受切磋后可直接应用 HTTP 返回的房间状态，结束后不残留 open battle room。

Phase187 联网切磋换宠自测：

- 服务端：`cd server/node && npm test`
- Godot 本地换宠回归：`godot --headless --path client/godot --scene res://scenes/Main.tscn -- --auto-battle-switch-pet-check`
- Godot 真实联网换宠：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 12000 -- --auto-server-battle-switch-pet-live-check`
- 回归：继续跑 `--auto-server-battle-pet-command-live-check`、`--auto-server-battle-target-mapping-check`、`--auto-server-battle-turn-live-check` 和 `--perf-probe`，确认换宠不会提前套用服务器最终 actor 快照，也不会让旧出战宠继续要求下达宠物指令。

Phase188 联网切磋物品自测：

- 服务端：`node --check server/node/src/auth-service.js && cd server/node && npm test`
- Godot 脚本检查：`godot --headless --path client/godot --check-only --quit`
- Godot 真实联网物品：`godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 12000 -- --auto-server-battle-item-live-check`
- 回归：继续跑 `--auto-server-battle-switch-pet-live-check` 和 `--perf-probe`，确认联网物品事件按服务器目标 actor 播放，不影响主动换宠规则；宠物倒下仍不自动换宠。

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
