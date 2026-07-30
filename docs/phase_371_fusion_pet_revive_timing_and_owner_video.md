# Phase 371：融合宠复活时序修复与项目所有者合并验收片

## 结论

曜冠角兽、苔垒角兽的首批完整非骑乘包已重新完成自审、来源链安装、Godot 实载和 `1.00x` 录像。

本阶段没有授予项目所有者批准：

- 两包继续保持 `ownerReviewStatus=pending`、`runtimeEnabled=false`；
- 不登记生产 art form，不写入正式融合配方；
- 不开放玩家融合入口，不连接共享 MySQL，不修改真实玩家档案；
- P1.4e 继续未勾选，等待项目所有者观看本阶段合并视频后明确回复。

## 发现与修复

Phase 367 的两条旧战斗片暴露出同一类视觉阻断：复活动画的原始生成格顺序被直接当作播放顺序，角色已经抬高后又短暂伏低。问题不只是交换第 4、5 帧，四组视角需要分别重排。

两次独立逐帧复审得到一致结果，规范播放顺序按原始 cell 编号为：

| 形态 | 视角 | 原始 cell 播放顺序 |
| --- | --- | --- |
| 曜冠角兽 | `front_3quarter_sw` | `1,2,5,3,4,6,7,8` |
| 曜冠角兽 | `back_3quarter_ne` | `1,5,2,6,3,7,4,8` |
| 苔垒角兽 | `front_3quarter_sw` | `1,2,5,3,6,7,4,8` |
| 苔垒角兽 | `back_3quarter_ne` | `1,2,3,5,6,4,7,8` |

修复没有重新绘制动作：

- 原始无损生成图、透明处理、统一缩放、脚底锚点和 512→256 派生参数全部不变；
- `revive-2..8` 的 512px 与 256px 像素集合在四组视角中全部与原构建精确相同，只改变帧号；
- `revive-1` 继续由同视角 `down-8` 精确覆盖，四组视角的 512px/256px 接缝均逐字节相同；
- 其他 11 个动作、世界真八向、身份、画像与不可骑乘声明均未改动。

重建后战斗包 digest：

| 形态 | bundle digest | 帧数 | owner/runtime |
| --- | --- | ---: | --- |
| 曜冠角兽 | `5a4896f64614b4eceaad220071fdd80fe85909bfa78d67ffb0637090a71da2fc` | 180 | `pending / false` |
| 苔垒角兽 | `27c3a0784ab6a2e55a3f3acc6624a722a8b4240bbb04bcd0ffbc53a52d524107` | 180 | `pending / false` |

## 新录像

两条战斗片均重新从真实 `Main.tscn`、隔离完整包、固定 14 场 director 录制；不是复用旧战斗视频。录像参数为：

- 1280×720；
- 30 FPS；
- 每条 1223 帧、40.766667 秒；
- 战斗 `speed_scale=1.0`，工具仅保留右侧小型 `1× · 工具` 按钮；
- H.264 视频、48kHz 双声道 AAC；
- 完整音视频解码零错误。

| 形态 | 新战斗视频 | SHA-256 |
| --- | --- | --- |
| 曜冠角兽 | `.run/evidence/phase371_fusion_owner_review/solar-battle-revive-fix-v1/review.mp4` | `c0ea90703062ae9172dadd9d97aa9d015f00cb9cb0e92f065124f33890f39bf8` |
| 苔垒角兽 | `.run/evidence/phase371_fusion_owner_review/moss-battle-revive-fix-v1/review.mp4` | `db12103d76d14cce6ec7a4d9490552a9a0971e834972d72d23bb5ef61f0b21cb` |

世界真八向像素没有变化，继续复用 Phase 367 已冻结并重新解码通过的两条世界视频。

最终合并验收片：

```text
.run/evidence/phase371_fusion_owner_review/fusion-pets-owner-review-1x.mp4
```

时间线：

```text
00:00.000  曜冠角兽 · 世界真八向
00:14.433  曜冠角兽 · 14 场战斗动作
00:55.200  苔垒角兽 · 世界真八向
01:09.633  苔垒角兽 · 14 场战斗动作
01:50.400  视频画面结束
```

合并片视频流为 1280×720、30 FPS、3312 帧、110.400 秒；容器因 AAC 末尾完整音频包报告 110.421029 秒，不改变视频帧数或播放速度。完整解码通过，SHA-256 为：

```text
5b18f43d1eaa0dd9ba239cbba9c1d69559285b03d6e285bc6dbf337aa94c706d
```

## 验证

- `python3 -m unittest tools.test.test_install_pet_battle_bundle tools.test.test_stage_pet_battle_bundle tools.test.test_pet_art_batch_audit`：`61/61`；
- `node tools/run_godot_auto_checks.mjs --only=--auto-standalone-pet-art-overlay-check,--auto-pet-battle-review-lab-check,--auto-battle-auto-10v10-check,--auto-battle-visual-timing-check,--auto-battle-reaction-check --fail-fast --timeout-ms 180000`：`6/6`；
- `/opt/homebrew/bin/godot --headless --path client/godot --quit`：通过；
- `node .agents/skills/design-beastbound-pets/scripts/inspect_pet_design.mjs --check`：`errors=0 warnings=0`；
- `node tools/battle_action_catalog_check.mjs`：通过；
- 两包各 180 帧 installer dry-run 与正式原子安装均通过；
- 四组 `down-8 == revive-1` 在 512px/256px 共 8 次逐字节比较全部通过；
- 新两条战斗片与最终合并片均通过 `ffprobe` 和完整音视频解码；
- `git diff --check`：通过。

没有运行完整本地 CI。当前唯一剩余门禁是项目所有者观看合并视频并决定批准或指出具体返工时间点。
