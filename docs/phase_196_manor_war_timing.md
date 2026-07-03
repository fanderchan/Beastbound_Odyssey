# Phase196：庄园战准备期与休战保护

本阶段把庄园战从“可立即反复结算”推进到有节奏的战期：

- 宣战后进入准备期，成员可以先报名参战；
- 准备期结束后才允许族长 `入场` 或 `结算`；
- 庄园战结算后写入 `peaceEndsAt`，休战期内不能再次宣战；
- 客户端家族庄园面板显示 `准备至` / `休战至`，并禁用尚不可用的按钮；
- 服务器仍是最终权威，即使客户端状态过期，也会拒绝休战期宣战。

## 原版参考

StoneAge 8.0 的 `gmsv/data/npc/family/manorsman.arg1` 有 `challengewait` 和 `peacewait` 参数。本项目保留这种数据驱动结构，但当前预发配置不直接使用原版 24/48 小时：

- `challengeWaitSeconds`: 300
- `peaceWaitSeconds`: 3600

这样能形成可测试、可玩的战期节奏，后续正式服可以按运营节奏调大。

## 实现范围

- `client/godot/data/manors.json` 为九个庄园增加准备期和休战期配置。
- `server/node/src/auth/family-manor.js` 在宣战时读取配置，保存到 war，并计算 `startsAt`。
- 结算路径和 battle room 自动结算路径都写入 `war.peaceEndsAt` 与 `manor.peaceEndsAt`。
- `challengeManor` 在休战保护中返回 `manor_peace_protected` 和 `peaceEndsAt`。
- `publicManor` / `publicManorWar` 暴露 `challengeWaitSeconds`、`peaceWaitSeconds`、`peaceEndsAt`。
- 客户端面板根据 `startsAt`、`peaceEndsAt` 展示准备/休战状态并禁用按钮。

## 验证

```bash
node --test server/node/test/auth-family-manor.test.js
godot --headless --path client/godot --quit
npm test --prefix server/node
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2
node tools/run_godot_auto_checks.mjs --only --auto-manor-map-shop-check,--auto-panel-registry-check,--auto-map-region-contract-check
```

证据：

- `node --test server/node/test/auth-family-manor.test.js` 3/3 pass
- `godot --headless --path client/godot --quit` exit 0
- `npm test --prefix server/node` 91/91 pass
- `godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2` exit 0
- Godot auto-check `passed=4 failed=0 total=4`
