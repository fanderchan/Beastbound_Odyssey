# Phase 342：晶甲乌力进化成功演出接入

日期：2026-07-26

## 用户决定与范围

项目所有者查看 Phase341 的 1× 成片后确认“看起来很好”，并同意继续接入正式成功流程。本阶段只完成通用进化演出基础设施和晶甲乌力成功演出接线，不改变：

- 服务端 P90、材料、石币、掉落、重抽或事务规则；
- `pet_evolution_routes.json` 的全局 `runtimeEnabled=false`；
- 两条路线的 `assetGate.status=deferred`；
- 晶甲乌力整宠、骑乘包或宠物美术目录的 `runtimeEnabled=false`；
- 月岚风狐资产与路线。

Phase341 的所有者结论只登记为 `evolution_visual_only` 单项批准。记录位于：

```text
client/godot/assets/pets/wuli_evolved_crystal_earth8_water2/
  qa/evolution/owner-decision.json
```

晶甲乌力整包仍为 `ownerReviewStatus=pending`，P1.3e 仍未完成。

## 成功触发合同

真实玩家成功回调现在严格按以下顺序工作：

1. `POST /pets/evolution` 返回明确 `ok=true`；
2. 客户端成功应用响应中的权威 profile；
3. 纯结果模型复核 operation ID、路线、实例、源/目标 form、Lv140→Lv1、1转状态以及响应 profile 中的目标实例；
4. 目标进化视觉已批准且其独立 `runtimeEnabled=true` 时，才播放一次演出；
5. 演出结束后刷新宠物面板并显示目标 Lv1 档案。

任何一项不成立都不播放。明确覆盖：

- P90 不足；
- 材料或石币不足；
- 网络失败或 durable outcome unknown；
- 服务端成功但权威档案没有成功应用；
- quote 与结果的路线、实例或目标 form 不一致；
- 视觉未批准、运行门禁关闭或资源缺帧；
- 同一 operation ID 已经播放过。

当前正式路线关闭，因此普通玩家仍无法发起进化，独立视觉运行门禁也保持关闭。代码接线已就位，但不会绕过服务端或资产门禁。

## 独立模块

新增三个聚焦文件，没有把新领域逻辑继续塞进 `main.gd`：

- `pet_evolution_visual_catalog.gd`
  - 从宠物动作包读取 `evolutionVisual`；
  - 校验 12 帧、12 FPS、非循环、正面视角、owner decision 与 SHA-256；
  - 正常模式只允许 `approved + runtimeEnabled=true`；
  - debug QA 可显式打开单形态预览；
  - 元数据与纹理缓存，不在 `_process` 中读取 JSON 或文件。
- `pet_evolution_presentation_model.gd`
  - 只接收公开成功结果、权威 profile 应用事实、服务端 quote 与 operation ID；
  - 失败、未知或不一致结果返回空请求；
  - 不携带 private seed、roll 或隐藏成长数据。
- `pet_evolution_sequence_player.gd`
  - 挂在既有 HUD 上方，播放玩家可见中文全屏演出；
  - 复用月夜岩台背景和正式 12 帧晶甲生长序列；
  - 使用现有 `combat.cast_skill / hit_skill / critical / outcome.victory` 音效；
  - operation ID 在客户端会话内去重；
  - 核心动画按实际渲染帧间隔计时，60 FPS 下每张严格保持 5 帧。

`panel_flow_coordinator.gd` 只增加预热、成功后的单次调用和挂载。服务端报价到达时会预热已正式开放的目标视觉，避免成功瞬间才解析资源；当前门禁关闭时预热会安全拒绝。

## 自动验证

### Godot 成功/拒绝演出门禁

```bash
node tools/run_godot_auto_checks.mjs \
  --only --auto-pet-evolution-ui-check \
  --fail-fast --timeout-ms 180000
```

结果：

```text
godot-parse: ok
pet evolution UI check: status=ok
presentation_contract=true
visual=true
presentation_runtime=true
rejected_count=0
completed_count=2
played_count=2
```

定向检查实际执行了 P90 不足、材料不足和 profile 未应用三种拒绝，播放数仍为 0；随后两个不同 operation ID 各完成 12 帧，同一 operation ID 重放被拒绝，最终完成数与播放数均为 2。

### 服务端与目录回归

执行并通过：

- `auth-pet-evolution.test.js`、`auth-pet-evolution-http.test.js`、`auth-pet-evolution-durable.test.js`：`14/14`；
- Pet Design Contract validator：通过；
- Pet Design Inspector：`errors=0`，保留既有公开投影 warning 1 条；
- Battle Action Catalog：通过；
- 两路线 10,000 样本 audit：`errors=0`；
- JSON 解析与静态门禁检查：全局进化关闭、两路线 deferred、晶甲乌力整包关闭、只有进化视觉单项 approved。

本阶段未连接共享 MySQL、未修改真实玩家档案，也没有运行全量本地 CI；没有服务端、数据库或协议代码变化，定向服务端事务回归与客户端实机门禁覆盖本次改动风险。

## 真实 Main.tscn 1× 录像

录像脚本只存在于忽略目录，实例化真实 `res://scenes/Main.tscn`，使用真实 HUD、宠物确认面板、进化播放器和音频管理器：

```text
.run/evidence/phase342_crystal_wuli_evolution_runtime/
  Beastbound_Phase342_Crystal_Wuli_Evolution_Runtime_1x.mp4
  phase342-before-confirm.png
  phase342-confirm-armed.png
  phase342-runtime-mid-video.png
  phase342-runtime-complete-video.png
  phase342-after-lv1.png
  godot-movie.log
```

因为生产路线仍关闭，本录像在隔离 QA 档案中模拟“服务端成功结果已返回且权威目标档案已应用”，然后调用与正式回调相同的结果模型和播放器；没有伪造正式路线开放，也没有访问数据库。

成片事实：

- Apple M5（Apple9）Metal 4.0 Forward Mobile；
- 1280×720、60 FPS、436 帧、7.266667 秒；
- H.264 + AAC 48 kHz 双声道，大小 1,839,439 bytes；
- MP4 SHA-256：`1c946fc107af0c138e2d609dbe31af539bff606a993037e32a82e3360fb05737`；
- 音轨 `mean=-32.0 dB / max=-10.1 dB`；
- `ffprobe` 为 436/436 视频帧，`ffmpeg -v error ... -f null -` 全片解码零错误；
- 转码未使用 `setpts`、`atempo` 或其他变速滤镜；
- 原始 60 FPS 录像逐帧 crop hash 显示：运行帧 1–12 分别占用 `165–169`、`170–174`……`220–224`，每张恰好 5 个视频帧，合计 60 帧，即严格 1.000 秒 / 12 FPS / `1.00x`。

录像顺序为“条件页 → 第二次确认已武装 → 全屏岩甲共鸣/晶甲生长/晶核定型 → 进化完成·晶甲乌力 Lv1 → 刷新后的晶甲乌力 Lv1 档案”。

## 性能

```text
idle：60 FPS，process_total=0.04..0.05 ms
moving：60 FPS，process_total=0.04..0.08 ms，status=ok，path_len=11
Movie Maker：平均 CPU render 0.12 ms/frame
```

视觉目录没有进入逐帧热路径；正式开放后只在报价到达时预热一次，成功演出期间按 12 张已缓存纹理切换。

## 当前结论

本阶段完成的是“晶甲乌力进化成功演出基础设施与真实回调接线”，不是正式开放进化：

```text
crystalWuliEvolutionVisual=approved
crystalWuliEvolutionVisual.runtimeEnabled=false
crystalWuliPetBundle.runtimeEnabled=false
wuliRoute.assetGate=deferred
petEvolution.runtimeEnabled=false
phaseP1.3e=not_complete
```

下一个独立资产切片仍是月岚风狐；在它的造型、动作、进化演出和两拒两放开放验收完成前，不应打开任何正式进化门禁。
