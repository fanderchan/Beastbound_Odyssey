# Phase198：新手 30 分钟体验曲线

本阶段补齐 `stoneage_gap_plan.md` 的 G9.4：把“注册到首次捕捉、首次组队、首次庄园信息可见”的首玩路径整理成可验收的 30 分钟曲线。它不是新功能开发，而是给发版前人工走查一个明确节奏。

## 原版参考

只参考机制，不复制 StoneAge 8.0 的内容：

- `/Users/fander/projects/_local_references/StoneAge/gmsv/src/char/char.c`：移动、队伍跟随、角色状态是首玩底座。
- `/Users/fander/projects/_local_references/StoneAge/gmsv/src/char/encount.c` 与 `gmsv/data/encount.txt`：野外移动触发遇敌。
- `/Users/fander/projects/_local_references/StoneAge/gmsv/src/npc/npc_healer.c`、`npc_petshop.c`、`npc_petskillshop.c`：新手村 NPC 应覆盖恢复、宠物和教学。
- `/Users/fander/projects/_local_references/StoneAge/gmsv/src/char/family.c`、`saac/src/acfamily.c`、`gmsv/src/npc/npc_manorsman.c`：家族/庄园是早期可见的长线目标。

## 30 分钟目标

| 时间 | 玩家目标 | Beastbound 验收点 |
| --- | --- | --- |
| 0-3 分钟 | 注册、登录、进入火芽村 | 中文登录/错误提示；无 GM/QA/debug 入口；HUD 和当前任务可读 |
| 3-8 分钟 | 跟随新手任务认识 NPC、背包、商店 | NPC 对话、任务追踪、购买/使用肉、装备操作不卡顿 |
| 8-13 分钟 | 第一次野外遇敌并打完一场 | 草丛可寻路；战斗可开始/结束；结算奖励写回服务器 |
| 13-18 分钟 | 第一次捕捉宠物 | 捕捉工具可用；捕获成功提示中文；满队时送入兽栏 |
| 18-23 分钟 | 第一次组队或看到队伍邀请闭环 | 在线玩家可见；邀请、接受、离队均有中文反馈 |
| 23-27 分钟 | 第一次看到家族/庄园长期目标 | 家族面板能打开；庄园列表、占领状态、准备/休战信息可读 |
| 27-30 分钟 | 明确下一步 | 玩家知道可继续练级、捕捉、组队、挑战转生/庄园，而不是卡在空白状态 |

## Demo 账号建议

如果使用 Phase197 的 seed：

- `demo_guest`：普通新手视角，适合 0-18 分钟体验。
- `demo_member`：家族成员视角，适合看家族/庄园列表。
- `demo_leader`：族长视角，适合演示庄园占领和族长按钮。
- `demo_rival`：对手视角，适合后续 PVP/庄园战扩展。

外部演示前建议使用干净库执行：

```sh
BEASTBOUND_MYSQL_DATABASE=beastbound_odyssey_demo \
npm run seed:demo --prefix server/node -- --store mysql
```

## 人工验收脚本

1. 启动服务端并确认 MySQL：

```sh
npm run ops --prefix server/node -- status
```

期望：`ok=true`，`health.ok=true`，数据库名是本次演示目标库。

2. 启动 PC 客户端：

```sh
godot --path client/godot --scene res://scenes/Main.tscn
```

期望：窗口可玩，鼠标点击移动顺畅；界面没有手机预览说明或自动检查字样。

3. 用新账号或 `demo_guest` 登录，按时间表走到首次捕捉。

期望：任务、背包、商店、战斗、捕捉反馈全是中文；文字不遮挡关键按钮。

4. 用第二个客户端或 demo 账号检查组队/家族。

期望：队伍邀请闭环能走完；家族/庄园面板能看到长期目标，不需要玩家理解技术术语。

5. 记录问题时保留：

- 当前 commit。
- 账号名。
- 具体分钟段。
- 屏幕提示原文。
- 是否稳定复现。

## 自动证据

现有 headless 检查已覆盖这条曲线的关键节点：

- `--auto-auth-server-live-check`
- `--auto-startup-login-check`
- `--auto-quest-chain-check`
- `--auto-encounter-check`
- `--auto-battle-capture-check`
- `--auto-pet-capture-feedback-check`
- `--auto-party-live-check`
- `--auto-manor-map-shop-check`
- `--auto-family-manor-live-check`

最近一次完整首玩自动走查见 `docs/release_playability_walkthrough.md`。人工验收仍要看 PC 视觉节奏、文字可读性和是否有“下一步不知道干嘛”的断点。

## 不做项

- 不把移动端作为当前 PC 发版阻塞项。
- 不新增任务、地图、宠物或庄园功能。
- 不替换占位美术；美术属于 G8。
- 不把 release_plan B/C/D/E 视为已验收，仍等用户确认。
