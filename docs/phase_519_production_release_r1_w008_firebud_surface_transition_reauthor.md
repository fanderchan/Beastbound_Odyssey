# Phase 519：生产发布 R1.W008 Firebud v2 道路／广场过渡二次美术重制

日期：2026-08-23

## 目标与结论

本阶段只关闭 `R1.W008 AUTO｜Firebud v2 道路、广场与草地过渡二次美术重制`，不提前处理 W009 的村口右下服务区／HUD 边缘构图，也不处理 W010 的任务 HUD 字形稳定性。

Phase 518 的根因判断成立：W003 的 v3 过渡虽然扩大了草地 mask 覆盖，但原稿仍以细密、近似平行于菱形边的草缘为主体。缩到运行时 `80×40` 后，局部细节折叠成等宽边框，正常 `1280×720 Main.tscn` 仍直接读出大块矩形、硬直角和阶梯拼接。继续增大 mask 或羽化数值只会把同一种几何模糊得更宽，不能解决轮廓语言。

W008 因此重新创作实际过渡原稿：道路使用大尺度、不对称草湾、圆钝凹口和不等宽红土舌；广场使用大尺度草湾、错落石地终止与少量平铺碎石。最终真实 Main 同机位前后对比已经产生肉眼明确改善，且没有引入裂缝、色键边、断路或新玩法差异。任务完成，但候选仍是待审、不可发布状态。

## 美术来源与可重复构建

### 冻结生成谱系

本轮使用内置 OpenAI `image_gen` 精确编辑工作流，共产生 `11` 个不可变原始 PNG：

- 道路 4 行全部采纳；
- 广场 4 行最终采纳；
- 广场 row 1 首轮因改动过于保守被拒绝；
- 广场 row 2 首轮因 cell 2 方向语义错误被拒绝；
- 广场 row 4 首轮因 cell 2 石地触及底点和列出的下边缘被拒绝。

完整逐次 prompt、输入父图、生成时间、generation call ID、原始 SHA-256、采纳／拒绝理由已冻结在：

`client/godot/assets/maps/firebud_region_visual_v2/source/prompts/firebud-surface-autotile-v4.md`

prompt 账本 SHA-256：`539b293f24f71d4450bb5ea87aa6d8b573f14b1603be6c499e8be27e72e5900b`。

8 个采纳原稿的核心 SHA-256：

| 原稿 | SHA-256 |
|---|---|
| path row 1 | `9fae804f8f5abc4ab1ea030b204220920a73247d507db7164920415ae9af8e6c` |
| path row 2 | `01854c30908746f7c2b3bce7e8e1dc0ec631ca54dcce15e35965a8b969ba66a1` |
| path row 3 | `d6baf8158fe242418e11f55e2b022c68606397d1b1e7a8445078cf48696fabf1` |
| path row 4 | `8cce511403ff9b3111a480400373e13acec0316d35c38da2627f628c9f7ccfd6` |
| plaza row 1 | `90ef40fbfcb982ede58529f730f6144f89c3f80f6f117c313ed9142dec687e24` |
| plaza row 2 | `7d6f9187289171621a0f53dba2c493f53ff677fe2e7d7af12ce01de87ed60739` |
| plaza row 3 | `6cb5e312e402c2093ef1a177e144efe036f6839e4b8c386d52f6bb9563a4b874` |
| plaza row 4 | `d5c6142dea2a2f40bc56b670079c4acf618f58ddcb2f181269e3601af38927c4` |

三个拒绝父图仍保留为 `acceptedForRuntime=false / lineageOnly=true`，没有参与 alpha sheet 或 atlas。

### 处理和组装

8 个采纳行均使用同一冻结色键命令：

```text
python3 source/tools/remove_chroma_key.py \
  --input <accepted-row> --out <accepted-row-alpha> \
  --auto-key border --soft-matte \
  --transparent-threshold 12 --opaque-threshold 64 \
  --edge-contract 1 --despill
```

道路和广场分别用 `assemble_surface_autotile_sheet.py` 组装为严格 `4×4` sheet：前 `15` 格逐一对应 `nw ... nw_ne_sw_se`，第 16 格必须完全透明；任何缺格、额外格或可见 alpha 触边均 fail closed。

| 处理物 | SHA-256 |
|---|---|
| path v4 alpha sheet | `e982ced8079e69816081726fc0153263f57213e6ff73d1418e4d0576630213d0` |
| path v4 assembly manifest | `3093296cc2c7f7621dedeed986570c6458246e991254ab11be1e717c6e3c8699` |
| plaza v4 alpha sheet | `ebe90e6ab7eaf2d29296a30a9b4e84521c9090d3b8958b35a69c4bffb81a8b40` |
| plaza v4 assembly manifest | `6fcdfbfe28b3f6b2d872b3a8db17d41637aa4885b45728f9603dd739ff45cf62` |

最终仍由未修改的 `build_ground_atlas_v4.py` v2.1.0 构建。运行时后处理继续是 `80×40` 下的一像素 mask expansion 和 `1.4px` feather；本轮没有靠调整这两个数值冒充美术重制。

- 最终 `320×440 / 42 tiles` atlas SHA-256：`a8a0c29837da41e7267d5c1d355373227aad5ddc9625b5a5f0aa4071d1bb0ed3`；
- build manifest SHA-256：`db01365f5c8b0ce62c4a4d04ada1e5524e0bc207e7ed1008a3fef1fd54031393`；
- provenance SHA-256：`21c5f82ff678f8d04d72a807c31b1cefd1168ab0083e69e5086d56abd7f8bd82`。

## 结构与玩法事实保持

W008 只替换过渡像素和来源谱系。以下权威字节保持精确不变：

| 文件 | SHA-256 |
|---|---|
| v2 training binding | `2775987fa144e2a7f337a03d871bcd835d176e9af7a5461024997a0e3aaed073` |
| v2 village binding | `0a97650b8a8781f4831881cbf99adbc76d3a2287bdd08ef7aeaf17a15fb33252` |
| training map JSON | `37279c76ff265927ef8eb042ed0b8460e34aa91687070aff14029307adc71c51` |
| village map JSON | `c27d3aff3791ececc7e0cf9ec952dd37361e23a358fa8b111d6939bc88f0fe05` |

严格 pending catalog 仍报告：

- 训练场 `1224 ground draws / 22 objects / 148 protected cells`；
- 村口 `672 ground draws / 18 objects / 227 protected cells`；
- 15 道路组合、15 广场组合、确定性 prepare-time 选择、未知地图 fail closed；
- movement、pathfinding、NPC collision、service layout 和双向 map transfer 均通过。

量化覆盖只作为结构辅助，不替代人眼结论：道路草地覆盖 `min/median/max` 从 v3 的 `0.087/0.156/0.341` 变为 v4 的 `0.147/0.297/0.444`；广场从 `0.125/0.245/0.493` 变为 `0.139/0.304/0.557`。单测锁定的是新原稿在 `80×40` 下仍保留大尺度覆盖，不把覆盖率本身称为审美验收。

## 真实 Main 同机位复审

### 导入与失败关闭

首次 scratch recorder run `r1-w008-surface-20260823-a` 在媒体校验处失败：训练场 moving 的 MovieWriter 实际只有 98 个视频帧，但慢编码期间 AVI 音轨异常扩展到 591.6 秒，最终拼片为 616.333 秒并被 90 秒上限拒绝。进一步核对发现该轮 idle PNG 与 W006 SHA 完全相同，因为只做 parse 没有触发 atlas 的 Godot 资源重导入。

该失败 run 没有被当作证据。执行显式 headless editor import 后，`.ctex` 从旧哈希 `325e4d6e...` 更新为 `ff767165...`。失败 run 的 9 个约 2.2GB 可重建 AVI／MP4 被精确删除，failure summary、PNG、Godot 日志和 QA lane 回执继续保留在 `.run` 供审计；玩家真实资料 inventory SHA 始终未变。

### 通过材料

重录 `r1-w008-surface-20260823-b` 使用真实 `res://scenes/Main.tscn`，固定村口／训练场 × idle／moving 四段：

- `1280×720 / 30fps / 1.00×`；
- H.264 `yuv420p` + AAC；
- `840` 帧、`28.0s`；
- 四段 native／MovieWriter 全部 PASS；
- `ffmpeg -xerror` 视频与音频完整解码 PASS；
- automation QA lane 逐段清理，普通玩家资料未变。

| scratch 材料 | SHA-256 |
|---|---|
| `summary.json` | `3271b18aa2768e39f1734d08e1b3e7914dd97d1705c4ae0b9a96e6fb02a3e742` |
| 28 秒视频 | `9e684aab4a97611d87cba27313b8edd5fab8c70a291399600ccefe8426effd80` |
| 8 帧 contact sheet | `87632547c803fa959aea59305a8d21dc3cab38cd8a6da8323d86b5b495b78159` |
| 训练场 W006 before / W008 after | `f62641bed4faf6c7ad0f05b6c53a90cac9d0590bc76e3b88053f7c213abaf170` |
| 村口 W006 before / W008 after | `fe4c8d86d6de7cd8651549f7c062ae1fbc17bb70db4e90715d6faf2a60770618` |

人眼复审确认：新图在相同 camera anchor、start cell、HUD、NPC、物件和绘制拓扑下，把旧红土／石地的整齐菱形边框、硬直角及同深台阶替换为明显的大草湾、圆钝凹口和不等宽舌形；道路核心继续连通，广场入口和主路交叉仍可读，没有发现新黑缝、洋红边、深锯齿或漂浮厚度。该结论只说明 W008 有资格进入后续 W009/W010，不代表 OWNER 已接受整个 Firebud v2。

## 性能

scratch 性能 run `r1-w008-surface-perf-20260823-a` 覆盖 `baseline_v1 / candidate_v2_review × 两图 × idle/moving`，结果 `8/8 @ 60fps`。两条 moving 均为真实跨帧鼠标输入且 `moved/coalesced/settled/final_match/screen_roundtrip=true`。

v2 关键数据：

| 场景 | process_total 平均／最大 | draw_world 平均／最大 |
|---|---:|---:|
| 村口 idle | `0.246/0.270ms` | `0.011/0.100ms` |
| 村口 moving | `0.312/0.340ms` | `0.135/0.440ms` |
| 训练场 idle | `0.250/0.280ms` | `0.007/0.060ms` |
| 训练场 moving | `0.352/0.620ms` | `0.188/0.490ms` |

- summary SHA-256：`e22b3dd981cd500d2a985fa89caa6ce93417a80620ccb7a24ebafb7ec5e048c5`；
- SHA256SUMS SHA-256：`83cf099f8c6ca37e481862bdcaaef616f566bf4b24b085ff1b614e4b255acf78`。

## W006 证据失效与生命周期

atlas 像素改变后，W006 的正式截图、Computer Use、collision audit 和 performance report 不再代表当前精确候选。W008 已立即把它们移入对应 `superseded*` 槽，并将活动槽清为 `null / []`。这不是删除历史：Phase 517 和原文件仍保留旧哈希；只是发布读取不得把旧 build 的通过证据误算到新 build。

最终离线审计为 `134 files / 102 PNG / 4 JSON / status=PASS / errors=[] / releaseReady=false`，精确缺少 9 个门槛：

- `collisionAudit.valid_report`；
- `computer_use_report`；
- `dressed_reference`；
- `layered_preview`；
- `performanceReport.valid_report`；
- `runtime_screenshot_coverage`；
- `owner_acceptance`；
- `release_attestation`；
- `lifecycle_released_and_enabled`。

前三组正式自动证据将在 W011 基于 W008–W010 的最终同一候选重新冻结；OWNER 结论只允许 W012 写入。当前严格保持：

- `status=owner_review_pending`；
- `ownerReviewStatus=pending`；
- `releaseApproved=false`；
- `runtimeEnabled=false`；
- `ownerAcceptance=null`；
- `releaseAttestation=null`。

## 验证

1. atlas assembler/build 回归：`15/15 PASS`；bundle auditor 单测：`17/17 PASS`；相关 Python compile PASS。
2. 严格 pending runtime：顶层与 Firebud v2 `PASS / errors=[]`，v1 预期 fail-closed 仍隔离；review catalog `PASS`，含 `pathTransitionsComplete`、`plazaTransitionsComplete`、`firebudVisualHierarchyFrozen` 与 `strictPendingReviewFreeze`。
3. 客户端 parse 加 movement、pathfinding、showcase profile、Firebud service layout、NPC collision、map transfer：`7/7 PASS`。
4. 服务端共享地图／服务权限：`42/42 PASS`。
5. 真实 Main 视频、完整媒体解码、四段 native/MovieWriter、QA lane 清理：PASS；性能 `8/8 @ 60fps`。
6. `jq` JSON parse、manifest／provenance／atlas 哈希闭合、`git diff --check`、玩法文件精确哈希和孤儿进程检查通过。

本任务不是完整 release/export gate，按定向验证规则没有运行 `node tools/run_local_ci.mjs`。本轮 `.run` scratch 材料不进入版本控制，也不冒充 W011 的正式证据。

## 下一任务

下一任务是 `R1.W009 AUTO｜Firebud v2 村口右下服务区与 HUD 边缘构图二次收敛`。W008 到此结束，不在同一轮开始 W009。
