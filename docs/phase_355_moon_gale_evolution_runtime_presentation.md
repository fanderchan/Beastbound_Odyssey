# Phase 355：月岚风狐进化成功演出接入

日期：2026-07-26

## 用户授权与边界

项目所有者在确认下一步为“接入月岚风狐成功演出、补齐两条路线各一拒一放并录制 1× 视频”后回复“好，开干”。本阶段据此实施这一窄切片。

本阶段不改变：

- 一转 Lv140、同形态 P90、材料、石币、资格任务、目标成长重抽和技能规则；
- 普通二转、进化、融合处于同一不可逆终局层级的现行合同；
- 服务端进化事务、HTTP/WS 协议、数据库结构或真实玩家档案；
- 两条路线 `assetGate=deferred`、全局进化关闭、两只目标宠整包关闭；
- 月岚风狐原始 PNG、来源账本、Phase345 QC 与 owner decision。

Phase342 已建立的“权威档案先应用，成功结果再进入播放器”是本阶段直接复用的成熟基础；没有再向 `main.gd` 或大协调器加入新的业务分支。

## 实现

### 目标形态驱动的演出文案

此前播放器会为所有进化硬编码晶甲乌力的“地脉/岩甲/晶核”字幕。现在两只目标宠的 `evolutionVisual.presentationCopy` 分别声明开场文案、三段名称和结束帧，视觉目录负责严格校验：

- 必须恰好三段；
- `endFrame` 严格递增；
- 最后一段必须结束于第 12 帧；
- pending 资产仍必须保持 `ownerReview=pending/runtimeEnabled=false`。

月岚风狐使用：

```text
岚月正在回应……
1–4  岚月风染
5–8  双尾分化
9–12 月岚定型
```

播放器按描述符驱动字幕和三段进度，并保存本次 `stageHistory` 供自动检查；画面仍是 12 帧、12 FPS、不循环。

### 权威结果与客户端合同

公开结果模型现在同时锁定：

- route、实例、源/目标 form ID；
- 源/目标中文名称必须与报价一致；
- `Lv140 · 1转 → Lv1 · 1转`；
- 权威 profile 中已经存在同一实例、目标 form、Lv1、1转；
- operation ID 合法且会话内去重。

P90 拒绝、材料失败、未知结果、profile 未应用、跨路线结果、ID 篡改或仅名称篡改都不会播放。

GM 客户端验收合同锁定四个精确槽位，而不是只看总数。合法的“样本已被玩家删除且不自动补发”仍可显示；同时 `presentCount`、`expectationMatchedCount` 和达标乌力 `primaryInstanceId` 必须与实际四样本矩阵一致。资产门禁也必须恰好包含乌力和风狐两条唯一路线，不能用重复路线伪造 2 条。

## 两拒两放

### 服务端真实事务

memory-store 定向测试用 test-only formal catalog 准备 GM 四样本，然后逐路线执行：

1. 乌力低档：报价与 durable 事务入口都返回 `pet_evolution_power_below_p90`，完整快照零变更；
2. 风狐低档：报价与 durable 事务入口都返回 `pet_evolution_power_below_p90`，完整快照零变更；
3. 乌力高档：报价成功并完成 durable 进化，同一实例成为晶甲乌力 Lv1；
4. 风狐高档：在新的 profile revision 上报价并完成 durable 进化，同一实例成为月岚风狐 Lv1。

两次成功后，两路线各有且仅有一个目标形态，两个低档样本仍保持源形态 Lv140/1转，宠物总数与实例 ID 集合不变；GM 为两次验收准备的材料与 600,000 绑定石币按既有规则恰好耗尽。该 formal catalog 只存在于测试进程，没有修改生产目录或正式开关。

### 客户端真实播放器

Godot 自动检查分别执行：

- 乌力 P90 拒绝，不播放；
- 风狐 P90 拒绝，不播放；
- 乌力成功，12 帧并显示 `晶甲乌力 · Lv1`；
- 同 operation ID 重放拒绝；
- 风狐成功，12 帧并显示 `月岚风狐 · Lv1`。

最终日志为：

```text
visuals=2/2
rejected_routes=2/2
completed_routes=2/2
played_routes=2/2
final_target=月岚风狐 · Lv1
```

## 真实 Main.tscn 1× 录像

忽略目录中的临时 QA 脚本实例化真实 `res://scenes/Main.tscn`，依次展示：

```text
高地风狐 · 1转 Lv140 条件页
→ 第二次确认已武装
→ 权威月岚风狐 Lv1 档案已应用
→ 与正式回调相同的结果模型和播放器
→ 岚月风染 / 双尾分化 / 月岚定型
→ 进化完成 · 月岚风狐 Lv1
→ 刷新档案并选中“2转/进化/融合”
```

录像使用隔离 QA profile，不连接后端或 MySQL。先额外验证一次 P90 拒绝不会播放，再以 `profileApplied=true`、`timingScale=1.0` 播放成功结果。

证据目录：

```text
.run/evidence/phase355_moon_gale_evolution_runtime/
  Beastbound_Phase355_Moon_Gale_Evolution_Runtime_1x.mp4
  phase355-before-confirm.png
  phase355-confirm-armed.png
  phase355-after-lv1.png
  godot-movie.log
  runtime-crop.framemd5
```

成片事实：

- Apple M5（Apple9）Metal 4.0 Forward Mobile；
- H.264 + AAC 48 kHz 双声道；
- 1280×720、60 FPS、436 帧、7.266667 秒、1,759,074 bytes；
- MP4 SHA-256：`8aed5d5e89ee0429eee306ac295d45d3e599ed7270605c444074b07f7fcb7139`；
- 音轨 `mean=-32.0 dB / max=-10.3 dB`；
- `ffprobe` 为 436/436 视频帧，全片解码零错误；
- 转码未使用 `setpts`、`atempo` 或其他变速滤镜；
- 原始 60 FPS 逐帧 crop hash 显示，动画帧 1–12 分别占 `165–169`、`170–174`……`220–224`，每张恰好 5 个视频帧，合计 60 帧，即 1.000 秒 / 12 FPS / `1.00x`。

画面自审确认：开始为沙金单尾高地风狐，第 5 帧起同一尾根形成上下双尾，后段稳定为银白月蓝月岚风狐；阶段字幕、进度、目标名和 Lv1 结果一致，没有第三尾、双宠重影、画布裁切或跳帧。

## 验证

执行并通过：

- Node 进化/GM/HTTP/durable/目录/平衡定向测试：`27/27`；
- Godot parse + `--auto-pet-evolution-ui-check`：`2/2`；
- Pet Design Inspector：`errors=0 warnings=0`；
- Battle Action Catalog：通过；
- 两路线各 10,000 样本 audit：`errors=0`；
- JSON 解析、`git diff --check`、视频探测、音量探测、全片解码和逐帧 hash：通过。

性能：

```text
idle：60 FPS，process_total=0.03..0.04 ms
moving：60 FPS，process_total=0.04..0.05 ms，status=ok，path_len=11
Movie Maker：平均 CPU render 0.23 ms/frame
```

没有运行全量本地 CI：本阶段没有服务端运行代码、协议、数据库或大范围客户端结构变化；定向事务、客户端实跑、目录和性能门禁覆盖本轮风险。

## 当前结论

本阶段完成的是月岚风狐正式成功链的隔离接入与双路线技术证明，不是项目所有者视觉批准或正式开放：

```text
moonGaleEvolution.runtimeIntegrationReview=self_review_passed_owner_pending
moonGaleEvolution.ownerReview=pending
moonGaleEvolution.runtimeEnabled=false
moonGalePetBundle.runtimeEnabled=false
wuliRoute.assetGate=deferred
moonGaleRoute.assetGate=deferred
petEvolution.runtimeEnabled=false
P1.3e=not_complete
```

项目所有者需要先观看本阶段 1× 成片；只有明确认可后，才能另开切片处理 owner decision 与后续整包/路线开放验收。
