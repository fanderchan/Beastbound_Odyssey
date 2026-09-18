# Phase 553：战后零经验提示只解释已知事实

日期：2026-09-18。收口 Phase 549 留下的守护战零经验提示核对；不改经验归属、奖励金额、战斗结果或协议。

## 复现与既定规则

既有五人守护战记录 `.run/guardian-review/20260918T055053.497757Z/state.json` 显示胜利、人物 0 经验、布伊 17720 经验和地之戒到账。原始公开观察者房间记录不包含账号专属经验写回，不能据此补造人物的结算原因。

当前服务端 `battleExpRewardForProfile` 按实际击杀记录分别累计人物、战宠和骑宠的 `killCount`，没有该单位的经验记录时才建立明确为零的摘要。Phase 228 已固定“最后一击或实际参与该次合击”的归属规则；本次定向服务测试再次验证单独最后一击、合击参与者及等级衰减下限。同步查看本机 StoneAge `gmsv/src/battle/battle.c` 的 `BATTLE_GetExpGold` 与 `BATTLE_AddExpItem`，参考其按人物/宠物分别结算的意图；不复制源码、数值或改变 Beastbound 已定规则。

发现的显示问题是：客户端把缺失 `killCount` 默认当零，因此只有金额的旧记录也会被解释成“未击倒怪物”。新增真实 Main 回归先复现此误判：解析通过，目标映射检查只有 `zero_exp=false`，其余战斗/回放/胜利/奖励断言通过。

## 改动

- 明确收到数值 `killCount=0` 且经验为零时，显示“获得 0 点经验（未参与最后一击）”。它描述该单位的归属，不推断整队未打败怪物，也不从战后生命值推断死亡惩罚。
- 缺少、非法或非零击杀记录时，只显示“获得 0 点经验”，不猜测原因。旧金额/名字回退、正数经验、基础经验和组队加成保持原样。
- 格式化逻辑归入已有 `BattleOutcomePresentationModel`；大协调器仅保留兼容转发。没有新增界面、设置、每帧扫描或本地奖励写入，已有飘字仍只展示正数奖励。

这是对既有权威事实的文字修正，收益是减少“已经胜利却提示没打倒怪物”的歧义；没有新增经验分配规则或让客户端诊断服务端内部状态。

## 验证

```sh
node tools/run_godot_auto_checks.mjs --only=--auto-server-battle-target-mapping-check --fail-fast --timeout-ms 180000 --output-dir .run/godot_auto_checks/phase553-exp-before
node tools/run_godot_auto_checks.mjs --only=--auto-server-battle-target-mapping-check,--auto-world-presentation-profile-check,--auto-earth-vein-review-contract-check --fail-fast --timeout-ms 180000 --output-dir .run/godot_auto_checks/phase553-exp-after
node --test --test-name-pattern='party pve derives enemy exp from stats and only rewards the last-hit participant|party pve collapses adjacent same-target attacks into combo events and shared kill credit|party pve victory applies StoneAge-style high level exp decay floor' server/node/test/auth-battle-room.test.js
git diff --check
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
```

第一条为修复前失败记录，后两组分别 `4/4` 和 `3/3` 通过。原有 `battle_outcome_float_overlay_check.gd` 在官方隔离 QA lane 中单独执行，呈现模型、自动关闭、去重、上浮和鼠标穿透八项全部通过；模型同时覆盖 JSON 数值零、未知/非法击杀记录、正数组队加成和旧金额/名字回退。此逻辑只在收到结算结果时运行，不改移动、绘制、输入或 HUD 热路径，未重复全量性能套件或 CI。

记录：`.run/godot_auto_checks/phase553-exp-before/2026-09-18T15-36-02-100Z_summary.json`、`.run/godot_auto_checks/phase553-exp-after/2026-09-18T15-36-52-087Z_summary.json`、`.run/phase553-exp-model-overlay/`。所有测试进程和 lane 已清理，真实玩家目录 SHA-256 仍为 `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`。服务端使用内存测试，不接触正常 MySQL。

## 原生地图复测状态

Phase 552 已提交推送为 `137ca499ec9d4bf357d3aaacd2534de8a33d7c8f`，本地、upstream 与 GitHub main 一致。该固定版本的 `.run/map-performance/phase552-camera-foreground-20260918/` 第一组出现 765 帧失焦，以 `foreground_lost_0` 拒绝整批；进程 48082 已退出、Main 释放、lane 清理、真实资料不变。没有生成正式性能回执或覆盖旧证据。

本轮继续完成了不依赖前台的结算提示修复。当前源码的四层原生性能、正式动作/路线和战斗衔接仍需稳定前台窗口，不能用无窗口检查替代。R1.W024、P2.1a 和老板美术接受继续未完成；原有 107 项待重冻地图证据保留。
