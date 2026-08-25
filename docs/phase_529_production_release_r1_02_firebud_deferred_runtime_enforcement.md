# Phase 529：生产发布 R1.02 Firebud v2 延期运行时门禁收口

日期：2026-08-26

## 目标与结论

本阶段执行 `R1.02 AUTO｜执行 Firebud Village v2 验收结论` 的“首发延期”分支，不修改地图、碰撞、NPC、HUD、运行时代码、bundle 字节或玩家数据。

结论为：

- Firebud v2 继续只存在于显式 review catalog，普通玩家 catalog 没有引用 v2；
- v2 生命周期继续为 `owner_review_pending / pending / false / false`，没有 owner acceptance 或 release attestation；
- 普通 `Main.tscn` 在正式视觉门禁失败时继续使用既有程序化地图回退，移动、寻路和双向切图可用；
- 只有显式 `--preview-map-visual-catalog-contract` 才能准备 v2，不能把该预览 PASS 当作发布；
- 旧 v1 发布制品及其历史证明保持逐字节不变，但它绑定的 Firebud map-data 哈希早于 W014 当前权威碰撞，因此严格运行时按设计拒绝 v1。当前有效玩家回退画面是既有程序化地图，不冒充“冻结 v1 像素仍在运行”。

延期分支由此安全完成。没有 promotion、签名、证明或运行时启用；下一任务转到 `R1.03 OWNER｜融合肖像与融合流程人眼验收`。

## 静态 catalog 与生命周期边界

只读断言确认：

- `map_visual_catalog.json` 中两张 Firebud 地图仍精确绑定 `firebud_region_visual_v1`；
- `map_visual_review_catalog.json` 中两张 Firebud 地图精确绑定 `firebud_region_visual_v2`；
- v1 为 `released / approved / true / true`；
- v2 为 `owner_review_pending / pending / false / false`；
- v2 的 `ownerAcceptance=null`、`releaseAttestation=null`，目录中也没有 `release-attestation.json` 或 `evidence/owner-acceptance.json`。

精确摘要：

| 对象 | SHA-256 |
|---|---|
| 普通玩家 catalog | `f4c4758e22e9d457b1abda1bec377070eb0098e9fdc54c9bbe96fcce62d9e09d` |
| review catalog | `662fa235c072f295aed084f2163934cb69a41ec0f8083801649242b1c47dbc3f` |
| Firebud v1 bundle manifest | `ad1cfb7a8a27e5b51cc8f883fbae2c137938f7356a96ce16b69e74d1953d7341` |
| Firebud v2 bundle manifest | `419df93a6426fe44ad032986bc464865393525edb9a36468baa18553ef73005f` |

本阶段没有把 review catalog 合并到普通 catalog，也没有改写 v1 历史 binding 来制造假绿。

## 普通运行时失败闭合

在提交 `627bdcf0a0d65f1412d6fb626f88c4ed093d7f34` 上运行默认严格地图视觉检查：

```text
godot --headless --path client/godot \
  --log-file ../../.run/evidence/r1_02/firebud-primary-strict.log \
  --script res://scripts/qa/map_visual_runtime_check.gd
```

该命令按预期退出非零，报告关键值为：

- `mode=strict_frozen_validation`；
- `qaPreviewEnabled=false`；
- `normalPendingDisabled=true`；
- `normalLifecycleAccessValid=false`；
- `result=FAIL`。

失败原因是普通 catalog 里的 v1 binding 已不匹配当前权威 Firebud map data／blockedCells，而不是 v2 泄漏。日志 SHA-256 为 `e8a347657630ac9a870a121059e51835a7cd85f9b8aed5aec5106a17f13d8a62`。

正常 `Main.tscn` 的 `--auto-camera-check` 同样精确报告：

```text
normal_lifecycle=false runtime_visual=false qa_preview=false
surface_valid=true static_signature=true moved_view_covered=true
path_overlay_static=true target_in_place=true
```

这项检查的非零退出是冻结视觉未进入运行时的预期证明，不是相机／移动回归。Godot 解析通过，摘要 SHA-256 为 `fb18e80aa6c1dd6f9b31c93939eb48800e08f8ddf08a6f638678b959e1b531d3`；QA lane 完整清理，真实玩家目录哈希保持不变。

## 玩家回退路径回归

在不传任何视觉 preview 参数的正常 Main 路径上运行：

```text
node tools/run_godot_auto_checks.mjs \
  --only --auto-movement-check,--auto-pathfinding-check,--auto-map-transfer-check \
  --fail-fast
```

结果为 `4/4`：Godot 解析、真实跨帧点击移动、阻挡寻路、训练场与村口双向切图全部通过。地图切换检查确认：

- 双向 warp 找到并重叠；
- village/training 的 spawn 和 map payload 正确；
- `real_input_ok=true`、`real_clicks=4`、`cross_frame=4`；
- `camera_limits=true/true`；
- 正式世界 HUD 可见且由 UI 拥有。

摘要 SHA-256 为 `5c06fb4971b12ce00458e846253281f8f9229178b7c981b14fcfc2c7d8dc5cce`；进程组关闭、隔离 QA lane 清理、真实玩家目录哈希不变。

## 显式 review 预览边界

仅使用显式预览参数运行：

```text
godot --headless --path client/godot \
  --log-file ../../.run/evidence/r1_02/firebud-v2-explicit-preview.log \
  --script res://scripts/qa/map_visual_runtime_check.gd -- \
  --preview-map-visual-catalog-contract
```

结果为 `mode=catalog_contract_preview / qaPreviewEnabled=true / normalPendingDisabled=true / result=PASS`。Firebud v2 只在该 review 路径准备：

- `firebud_training_yard`：`1224` ground draws、`28` objects；
- `firebud_village_gate`：`672` ground draws、`21` objects。

日志 SHA-256 为 `55ea0369d4574019a2106df8fda7506e9aeaae49817fbbb318fa805e74946538`。显式预览 PASS 只证明待审包可复现，不改变生命周期，也不允许普通玩家访问。

## 为什么不修改旧 v1

Phase 481 起已明确：待审 v2 的权威地图数据更新后，普通 catalog 中历史 v1 的 frozen binding 会失败闭合。W014 又同步调整了当前碰撞、保护格、服务簇和训练分区；把 v1 binding 直接重签到这些新字节会让旧 owner acceptance 和 release attestation 对应到从未被当时所有者验收的内容。

因此本阶段保留两条事实：

1. v1 是历史已发布制品，字节和证明不可被追认式改写；
2. 当前普通客户端在 v1 不匹配时使用既有程序化回退，直至某个当前权威正式视觉获得真实批准和 promotion。

这比篡改旧证明、绕过生命周期或让 v2 偷跑更安全，也保持了可追溯性。

## 验证范围与残余门禁

本阶段是纯文档／计划收口，未改产品源码和数据，因此没有重复运行完整服务端或完整本地 CI。W016 已覆盖 v2 的正式输入、碰撞、HUD、性能和 bundle 审计；本阶段只重跑延期分支必须证明的 catalog、生命周期、普通 Main 回退和显式预览边界。

Firebud v2 仍缺：

- 项目所有者对精确像素的 acceptance；
- release attestation；
- released/enabled 生命周期。

这些缺口是本次延期的预期状态。Firebud 不是已发布 v2，整个生产发布仍为 `BLOCKED`。
