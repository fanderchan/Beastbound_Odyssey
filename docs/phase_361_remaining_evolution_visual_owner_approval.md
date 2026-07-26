# Phase 361：剩余三项进化宠视觉单项批准

日期：2026-07-26

## 项目所有者结论

项目所有者查看 Phase360 的真实 `Main.tscn`、全程 `1.00x` 集中验收片后明确回复：

> 通过

该回复对应上一轮明确列出的全部三项，现分别登记为三个互不外溢的 visual-only owner decision：

| 对象 | 批准范围 | 决定文件 | SHA-256 |
| --- | --- | --- | --- |
| 晶甲乌力独立宠物 | `standalone_pet_world_true8_visual_only` | `client/godot/assets/pets/wuli_evolved_crystal_earth8_water2/qa/world/owner-decision.json` | `bc1febd4be2567f6b513e6d1b4614adc5240976b1db80ad6216a96439a124771` |
| 成年见习猎人骑晶甲乌力一体整图 | `integrated_mounted_world_true8_visual_only` | `client/godot/assets/mounted/novice_hunter_v1/wuli_evolved_crystal_earth8_water2/qa/world/owner-decision.json` | `3967254aafe4995b411c9c30989f1f601c09379d544b77b26e01ebebacea1d7a` |
| 月岚风狐独立宠物战斗 | `standalone_pet_battle_visual_only` | `client/godot/assets/pets/driftfox_evolved_moon_gale_wind7_water3/qa/battle/owner-decision.json` | `6d3a511fcb338a9c687e438cfa273715ab6f8b2a8650b81329a95bbda4eb4db0` |

三个决定都显式记录 `runtimeEnabled=false`，并把整宠/整套骑乘、战斗运行时和正式进化路线批准保持为 `false`。

## 接受的证据

三项共同接受 Phase360 最终成片：

```text
.run/evidence/phase360_remaining_evolution_visual_review/
  Beastbound_Phase360_Remaining_Evolution_Visuals_1x.mp4
```

- SHA-256：`cec2b87bf6e0baf5b47d81d5032e893bb06b5648192945d4c9f0834d1d64673a`；
- H.264、1280×720、60 FPS、3486 帧、58.100000 秒；
- AAC 48 kHz 双声道；
- 全程 `1.00x`，无倍速、抽帧或 `atempo`；
- 完整音视频解码通过。

世界章节为前 `1009` 帧、`16.816667` 秒，同时展示晶甲乌力独立宠物与完整人骑宠：

```text
南 → 西南 → 西 → 西北 → 北 → 东北 → 东 → 东南
```

每方向为 `0.6` 秒待机加 `1.2` 秒行走。月岚战斗章节从 `16.816667` 秒开始，共 `2477` 帧、`41.283333` 秒，连续覆盖普通攻击、防御承伤、受击恢复、三类反击、技能、合击、直飞/弹飞、回避/回避反击、倒地和复起 14 段。

月岚战斗批准同时接受 Phase357 已验证的完整正式源档封口：

- `180` 张 512px 正式源帧；
- `180` 张规范派生 256px 运行帧；
- `24` 份无损原始动作表；
- `upscaledFromRuntime=false`；
- reconciliation manifest SHA-256：`6e0eead0c22dada57c50c95d4c2c4f568643e5f50aa823519489a837e591b091`。

## 元数据落账

三个对应子项现为 `owner_approved_visual_only`，并写入精确批准范围、决定文件和决定文件 SHA。独立语义审核结果继续为 `passed`。

本阶段只新增 owner decision、同步资产元数据和文档，没有修改：

- PNG、动作帧、比例、锚点或运行时绘制；
- 宠物数值、技能、成长、进化公式；
- 客户端玩法代码、服务端、协议、数据库或玩家档案；
- `client/godot/data/pet_evolution_routes.json`。

## 不随视觉批准自动开放的边界

阶段结束时继续保持：

```text
crystalPetBundle.ownerReviewStatus=pending
crystalMountedBundle.ownerReviewStatus=pending
moonGalePetBundle.ownerReviewStatus=pending
targetBundle.runtimeEnabled=false
evolutionRoute.assetGate.status=deferred
globalEvolutionRuntimeEnabled=false
P1.3e=not_complete
```

因此，这次“通过”不能被解释为整宠 bundle、整套 mounted bundle、正式战斗运行时或两条生产进化路线已经获准开放。是否开放必须另行讨论和验收。

## 定向验证

执行并通过：

- 六份新增/更新 JSON 全部可解析，三个决定文件 SHA 与元数据引用一致；
- 晶甲乌力 `--auto-pet-action-asset-check`：世界 `8` 向、`40` 帧，战斗 `2` 视角、`12` 动作、`180` 帧，`errors=[]`；
- 晶甲乌力 mounted world-only：世界 `8` 向、`40` 帧、单一整体 body、无运行时分层，`errors=[]`；
- 月岚风狐 `--auto-pet-action-asset-check`：世界 `8` 向、`40` 帧，战斗 `2` 视角、`12` 动作、`180` 帧，`errors=[]`；
- 月岚单形态 Battle Catalog：`180` 运行帧、`180` 张 512px 正式源帧、`180/180` 规范派生，`errors=[]`；
- Pet Design Inspector：`errors=0 warnings=0`；
- Battle Action Catalog：`status=ok`；
- 路线复核：全局 `runtimeEnabled=false`，两条 `assetGate.status=deferred`；
- `git diff --check`。

未运行全量本地 CI：本阶段没有产品代码、资产像素、网络、服务端、数据库、UI 或热路径变更；JSON 解析、决定哈希、三项显式 Godot 资产门禁、两项目录审计和路线关闭复核覆盖本轮风险。
