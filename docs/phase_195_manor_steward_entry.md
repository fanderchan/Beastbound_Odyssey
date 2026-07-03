# Phase195：庄园管事入口

本阶段把九大庄园从“地图上有道具场”推进到“地图现场可以进入庄园战流程”。

## 原版参考

- StoneAge 8.0 的庄园资料由 `saac/src/acfamily.c` 的 `FMPOINT` 保存入口、庄园所在村庄、占领家族与声望。
- `gmsv/data/npc/family/scheduleman.template` 中有 `manorsman` / `scheduleman`，都走 `ManorSman` 相关功能。
- `gmsv/data/npc/family/manorsman.arg1` 使用 `manorid` 和挑战/休战等待时间作为庄园 NPC 参数。

本项目只参考结构和命名意图，不复制原版源码或资产。

## 已完成

- 九个庄园地图的 `*_steward` NPC 改为 `actionType: family_manor`。
- 庄园管事对话主按钮为 `庄园战`，确认后打开现有“家族与庄园”面板。
- 从庄园管事进入时，客户端记录当前 `manorId`，庄园列表会把当前庄园排在最前，并显示 `当前：` 前缀。
- 家族状态同步后，如果仍聚焦当前庄园，状态文案会优先显示该庄园占领方和当前战期。
- 自动检查扩展到验证“庄园管事对话 -> 家族面板 -> 当前庄园聚焦”链路。

## 未做

- 庄园战专用准备地图、NPC 守卫队入场、观战、踢人、战前锁名单。
- 按原版时间窗实现挑战等待、休战保护和定时开战。
- 庄园地图最终美术和室内布局。

## 验证

```bash
node tools/run_godot_auto_checks.mjs --only --auto-manor-map-shop-check,--auto-panel-registry-check,--auto-map-region-contract-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2
node --test server/node/test/auth-family-manor.test.js
npm test --prefix server/node
```

证据：

- `passed=4 failed=0 total=4`
- `manor map shop check ready: status=ok count=9 village=true first_dialog=true first_shop=true first_steward_dialog=true first_steward_panel=true first_map=firebud_manor errors=`
- `panel registry check ready: status=ok`
- `map region contract check ready: status=ok`
- `godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2` exit 0
- `node --test server/node/test/auth-family-manor.test.js` 3/3 pass
- `npm test --prefix server/node` 91/91 pass
