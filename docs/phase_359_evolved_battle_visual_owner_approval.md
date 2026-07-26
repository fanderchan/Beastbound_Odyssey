# Phase 359：两只进化宠三套战斗视觉单项批准

日期：2026-07-26

## 用户决定

项目所有者观看 Phase358 的 1280×720、60 FPS、有声、全程 `1.00x` 合并实机成片后回复“没问题啊。”。

本阶段据此登记三项彼此独立、范围明确的批准：

| 对象 | 批准范围 | 运行状态 |
| --- | --- | --- |
| 晶甲乌力独立宠物战斗包 | `standalone_pet_battle_visual_only` | `runtimeEnabled=false` |
| 成年见习猎人骑晶甲乌力战斗包 | `integrated_mounted_battle_visual_only` | `runtimeEnabled=false` |
| 成年见习猎人骑月岚风狐战斗包 | `integrated_mounted_battle_visual_only` | `runtimeEnabled=false` |

每项批准同时接受该对象在 Phase358 中完成的完整高清源档封口：每套均为 180 张原生 512px 母版、24 份无损原始动作表和 180 张规范派生 256px 运行帧，没有把运行图放大冒充母版。

## 明确不批准的范围

这句“没问题啊。”没有被扩大解释为以下任何决定：

- 月岚风狐独立宠物战斗包批准；该对象不在 Phase358 合并成片的三章内；
- 晶甲乌力独立或骑乘世界真八向批准；
- 任一整宠 bundle、mounted bundle 或普通玩家运行路径批准；
- 晶甲乌力或月岚风狐的生产进化路线开放；
- 宠物数值、技能、二转、融合、重置规则或服务端行为变更；
- P1.3e 完成。

因此三个目标的战斗视觉子项已变为 `owner_approved_visual_only`，但顶层 `ownerReviewStatus` 仍为 `pending`，所有目录、战斗视觉、路线和全局 `runtimeEnabled` 继续为 `false`。

## 接受证据

三项决定共同绑定 Phase358 的真实 `Main.tscn` 成片：

```text
.run/evidence/phase358_evolved_battle_full_source_closure/
  Beastbound_Phase358_Evolved_Full_Source_Closure_1x.mp4
```

- SHA-256：`8810a2ec5a3c771bb4634e3c72b483be50dae0f0aaab5df222810fd30aad8b25`；
- 1280×720、60 FPS、2269 帧、37.816667 秒；
- H.264 + AAC 48 kHz 双声道；
- 全程 `speedScale=1.00`，没有倍速滤镜；
- 三章分别覆盖攻击、技能、可见后撤回避、倒地和逐帧复起；
- 全片完整解码通过。

不可变的所有者决定分别记录于：

```text
client/godot/assets/pets/wuli_evolved_crystal_earth8_water2/
  qa/battle/owner-decision.json

client/godot/assets/mounted/novice_hunter_v1/wuli_evolved_crystal_earth8_water2/
  qa/battle/owner-decision.json

client/godot/assets/mounted/novice_hunter_v1/driftfox_evolved_moon_gale_wind7_water3/
  qa/battle/owner-decision.json
```

Phase358 的 `full-source-closure-v1.json` 和更早的语义自审报告继续保留其生成当时 `owner pending` 的历史事实；当前批准状态由新增 owner decision 与各自 `action-bundle-meta.json` 汇总，不反写历史快照。

## 验证

本阶段只修改批准元数据与项目记录，不修改任何 PNG、动作像素、玩法代码、数值、服务端、协议、数据库或玩家档案，也不需要重录视觉完全相同的成片。

执行并通过：

- 三份 owner decision 与三份 action bundle JSON 解析；
- owner decision 文件 SHA-256 引用；
- 三套批准范围、对象身份、证据视频与源档封口 manifest 交叉核对；
- 全仓目标对象 `runtimeEnabled` 反向断言，未出现 `true`；
- Pet Battle Catalog 定向完整源档审计；
- Godot Pet Action、Mounted Action 与 Character Mount Art 定向检查；
- `git diff --check`。

## 当前结论

```text
crystalStandaloneBattle.ownerReview=approved_visual_only
crystalMountedBattle.ownerReview=approved_visual_only
moonGaleMountedBattle.ownerReview=approved_visual_only
moonGaleStandaloneBattle.ownerReview=pending
targetBattleRuntimeEnabled=false
petBundleRuntimeEnabled=false
evolutionRouteRuntimeEnabled=false
P1.3e=not_complete
```
