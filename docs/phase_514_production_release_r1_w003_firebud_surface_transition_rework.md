# Phase 514：生产发布 R1.W003 Firebud v2 道路、草地与广场过渡返工

日期：2026-08-21

## 目标与结论

本阶段只关闭 `R1.W003 AUTO｜Firebud v2 道路、草地与广场过渡返工`。项目所有者在 R1.01 明确退回 Firebud Village v2，要求在碰撞/哈希与录片收口之后重做道路过渡、UI 安全区和密度比例；其中碰撞/哈希与录片分别由 W001、W002 关闭，本阶段只处理第一项画面问题，不开始 W004 的 PC HUD 安全区，也不开始 W005 的密度、比例、光照和生活感统一。

返工根因不是地图拓扑或 15 组合选择器错误，而是旧 v2 道路过渡源在缩到 80×40 后几乎没有草地楔入，广场过渡也偏保守；即使运行时已经按暴露边签名选对过渡格，画面仍会呈现矩形拼块、硬直角和规则锯齿。旧源的草地 mask 覆盖率为：

| 表面 | min | median | max |
|---|---:|---:|---:|
| 道路 v2 | 0.000 | 0.000 | 0.003 |
| 广场 v2 | 0.059 | 0.131 | 0.311 |

最终 v3 以冻结的 v2 四行原稿为父级做精确视觉编辑，保留 4×4 排列、右下空白格和 15 个签名语义；新草边不改变道路/广场主体连通性，只把自然、不规则但较浅的草地羽化带带入实际 80×40 输出。最终覆盖率为：

| 表面 | min | median | max |
|---|---:|---:|---:|
| 道路 v3 | 0.087 | 0.156 | 0.341 |
| 广场 v3 | 0.125 | 0.245 | 0.493 |

真实 `Main.tscn` 同机位对照确认：村口和训练场主路连续、路口仍清楚，边缘从规则方块变成较浅且连续的草地羽化，没有新接缝或返工中出现过的深锯齿。最终 atlas、binding、地图 JSON、碰撞、寻路、warp、protected cell、NPC、服务格、物件数量和绘制拓扑均已分别验证；候选仍为 `owner_review_pending`，本阶段不构成 OWNER 批准、promotion 或发布启用。

## 视觉生产合同

### 1. 原稿、prompt 与生成谱系

本阶段按 Firebud 地图生产合同和 2D 地图生成流程生产项目自有的 AI 原创表面过渡，不复制 StoneAge、StoneAge9 或其他项目的地图、美术和数值。

- 精确 prompt ledger：`client/godot/assets/maps/firebud_region_visual_v2/source/prompts/firebud-surface-autotile-v3.md`；SHA-256 为 `18a12f449186bed24c8835d77586b08ef2827114153ac88520934a3566313428`。
- 接受的道路四行原稿 SHA-256：`2afcc2482c2b1d5afa62dfb4ade04e77aba8e4a9153608b76ae7bd4997982ae1`、`34381cfd261b4c784614eb8e15304de59d3a5cc81607bb0309850d27b01c9ccd`、`9faef1415cf5c0f34255318035d7d374ade9a75cfedbe973f5330beb5f4793c4`、`0b7ac3e0fff176512c0cfad23dfeb939ccc99543da9be783dfc149e396743ee0`。
- 接受的广场四行原稿 SHA-256：`f9aa9faa5d7ade260c01541e7fe9bc7f08fbe315b926105ac43f7a0ca3b08d3f`、`3f908c02c17ed9e616310a1619ea620922aab9cd1de80d083452de0fdc916420`、`339f0af3366c4da375c3baef2f8c552ddfb7a7a20001a74e772d0dbb1fdb93cd`、`10a1d944a8780a58d670693596af96dcb4d3dbe0eed5844a251420b10d43dbb2`。
- 第一版道路色相偏离和第一版广场变化不足的父级分别以 `bdc5123f2858d75d2f85241816950ce55e2f29e38a63418e1be95411bb1b665e`、`91ab563e81154ec9b101ee1514ec6e824d8cd340835fd148b236855003e11487` 冻结；manifest 明确标记 `acceptedForRuntime=false`、`lineageOnly=true`，不会误进入运行时。
- 旧 v2 原稿、旧 raised-slab 拒绝稿和本次所有接受/拒绝父级均保留。`map-visual-bundle.json` 最终登记 32 份 raw、42 份 build artifact、15 份 prompt，`source/provenance.json` 逐项绑定生成 ID、父级、处理命令、工具版本与哈希。

### 2. 可复现透明化与 15 组合组装

所有接受原稿先经仓库内 `remove_chroma_key.py` 做固定参数的 soft matte、despill 和 edge contract，再由 `assemble_surface_autotile_sheet.py` 按固定四行、四列和右下空格组装。独立临时目录 `.run/r1_w003_chroma_repro/` 对全部本轮接受行和拒绝谱系行重新执行相同命令，结果与提交候选逐字节一致。

关键处理中间稿：

| 产物 | SHA-256 |
|---|---|
| 道路 v3 4×4 alpha sheet | `e743ff0d5148ad2db7e3c2c2c32a937726a3d5692a932264f1e6f1df7dd2ee46` |
| 道路 assembly manifest | `75dc8b3092096a5f31eb5683432d5b771073aac9b07a6a9d87098dd0ee766897` |
| 广场 v3 4×4 alpha sheet | `ecc920504daee6477b53dc1bbf2b8a1d454012cd3e56a26dc93db061774c09cb` |
| 广场 assembly manifest | `6c72cf130b366a330873ce881a593fab222aa6053e312c3ade179cdef41eb378` |

组装器仍要求 15 个非空签名与一个固定空白格、禁止格边 alpha 接触并拒绝覆盖已存在输出。运行时签名顺序保持：`nw`、`ne`、`nw_ne`、`sw`、`nw_sw`、`ne_sw`、`nw_ne_sw`、`se`、`nw_se`、`ne_se`、`nw_ne_se`、`sw_se`、`nw_sw_se`、`ne_sw_se`、`nw_ne_sw_se`。

### 3. 80×40 运行时羽化与 atlas

`build_ground_atlas_v4.py` 升级为 `2.1.0`，脚本 SHA-256 为 `aa24cc2b78df0573b4c1cf4dc659fedf217e1eda52fd441022a851bd1a148e94`。它继续使用既有材质、语义 overlay、tile ID、4 列 atlas 和 80×40 tile 合同，仅将草地 mask 的运行时处理固定为：

1. 从生成稿提取既有草地色带；
2. 以 3×3 MaxFilter 做一像素扩张，使细草边在 80×40 下仍可见；
3. 以 1.4px Gaussian feather 柔化颜色交界，避免较大的草地楔入形成重复深锯齿；
4. 不改变连接表面 alpha、tile 位置或暴露边签名选择。

最终 atlas：

- `client/godot/assets/maps/firebud_region_visual_v2/runtime/ground/atlas.png`；
- 320×440 RGBA，42 tiles，单 tile 80×40；
- SHA-256：`a86cb47204e6446f289d7517e623910c92228b40ff5c97dfc4c93a89765cbb85`；
- path-only 构建 SHA-256：`69483595ceacda974dccd08f541354616d9447c95b49dd08cf6e5d8f95441583`；
- build manifest SHA-256：`178840ca8aa7afe45ca0d68fb0d5a2680d7f1a5afd00bf35f243ad0d433712de`；
- provenance SHA-256：`6a3ff1d8f4d3a4ccddf8792a56b36bfe1ea8386115573df058b358024bb9a996`。

新增的量化测试会在与构建器相同的饱和度、亮度和 80×40 LANCZOS 缩放下测量全部 15 个签名，防止以后“高分辨率源看起来有草边、实际 runtime 又缩没”的回归。

## 被拒绝的实现迭代

本阶段没有把第一张看起来有变化的图直接当成完成：

1. 道路第一版的草色与 Firebud meadow 偏离；广场第一版过于保守，无法充分消除硬直角。两者只保留为 lineage，不进入最终组装。
2. 第一轮真实录片 `a` 与 W002 像素逐字节一致。根因是候选 Godot import cache 仍引用旧 atlas `.ctex`，不是新图无效；执行正式 editor import 后，缓存 MD5 与最终 atlas 同步。旧缓存录片不作为 W003 证据。
3. 第二轮录片 `b` 使用 5×5 扩张 + 0.55px 羽化，在真实 Main 中形成过深、过规则的暗色锯齿，明确退回。
4. 最终轮 `c` 使用一像素扩张 + 1.4px 羽化，保留草地入侵的自然轮廓但压浅颜色交界，才进入最终 atlas 与同机位对照。

因此，资源哈希变化之后必须先确认 Godot import cache 已实际重导入，再判断客户端画面；同时，高分辨率源图和单 tile 单测不能替代真实 1280×720 Main 审查。

## 同机位真实 Main 证据

本阶段使用正常 `res://scenes/Main.tscn`、1280×720、30fps、1×、中文 HUD 和真实跨帧鼠标输入生成 scratch 返工证据：

- 目录：`.run/evidence/r1_w003/after/r1-w003-transition-20260821-c/`；
- 四状态：村口 idle/moving、训练场 idle/moving；
- H.264/yuv420p + 48kHz 双声道 AAC，840 帧、28 秒，全音视频流完整解码；
- 视频 SHA-256：`ac37aaf174e0530cbde2b36fda88a063b35a96baa1f59513051ea6583c6d6cbc`；
- contact sheet SHA-256：`ed94a551cecd7507faed80393aa2a2f87cee89915619efb52c3de38c0127a4ae`；
- 同机位前后合图：`.run/evidence/r1_w003/comparisons/firebud-w003-before-after.png`，SHA-256 为 `f48ccdf90d6a58d14013cb3f0cb61beaa68efd449e50931019595d811ba8e41e`。

| 地图 | W002 before | W003 after | start cell | viewport | ground draws | objects |
|---|---|---|---|---|---:|---:|
| 村口 | `3280aae36b78fc05bef7d0f67d9c8db797c5593f15b23077b7d544f551ad03e7` | `0f176470b65b03b1fc51706e7d4b38f6c647eaad0e8edbb757f11378236dab10` | `[3,15]` | 1280×720 | 672 | 18 |
| 训练场 | `08fa46dab23b6fdda8efba64650505115bf3f3ab17f542acc97b0543f1f4e5b0` | `16c65d8b9e08b1c1c9d673400ebf54df2caf655249145ec035eb5ba906c5b665` | `[14,12]` | 1280×720 | 1224 | 22 |

before/after 的 start cell、viewport、完整 tileCounts、groundDrawCount 和 objectCount 逐项相同；变化只来自 ground atlas 像素。人工审查只确认本阶段目标：主路更连续、路口仍可读、硬方块减弱且无新接缝。右侧 HUD 安全区、边缘裁切、密度比例和整体生活感仍是 W004/W005 的待办，本证据也不是 W006 的最终 hash-bound Computer Use 材料或 W007 的 OWNER 接受。

## 录片与性能收口

返工后的性能矩阵最初暴露出既有 runner 的证据退出缺口：引擎级 `--quit-after` 会在游戏内音频清理之前直接终止，严格日志门禁因此正确拒绝 8 个 ObjectDB 与 4 个 resource 泄漏警告。尝试改用 Dummy audio driver 不能证明真实 PC 路径，已撤销。

最终新增共享 `runtime_exit_cleanup.gd` 和轻量 `perf_probe_exit_controller.gd`：

- recorder 与 perf probe 共用 8 frame + 0.75 秒、释放 manager、再 8 frame + 0.75 秒的有界清理；
- 逐一 stop 并断开 16 个 `AudioStreamPlayer.stream`，证明 manager 已释放；
- Main 只在地图录片或显式 `--perf-probe-clean-exit-frames=` 的开发证据入口启动前禁用 production playback；共享清理器不会在检查前补写该状态，因此回执继续 fail closed；
- performance runner 不再使用引擎级 `--quit-after`，必须读到唯一、合法且 `status=passed` 的 `perf probe clean exit` JSON；
- 普通玩家、专门音频验收和非证据运行路径不受影响。

最终真实 Main 8 组性能证据位于 `.run/evidence/r1_w003/performance/r1-w003-transition-perf-20260821-f/`：

- summary SHA-256：`ce29958cbef4dfafc7a62e4fdbab85e54231c84d40587f7a0630b4512b7ea175`；
- SHA256SUMS SHA-256：`fba793e127cbe42609339196bc036103651f63c6f0f0b0a134144308caa5fbe1`；
- build identity：`033c56f30dfe62c7fdcc873e990ab48089bfe8d9fb8cc5cf94954d75e02ea78e`；
- v1/v2 × 两图 × idle/moving 全部 60fps；moving 均为真实跨帧鼠标移动；8 次 strict log gate、audio cleanup、QA lane cleanup 和真实玩家目录不变检查全部通过。

候选 v2 的 `process_total` min/mean/max：

| 地图 | idle ms | moving ms |
|---|---|---|
| 村口 | `0.160 / 0.240 / 0.330` | `0.150 / 0.283 / 0.410` |
| 训练场 | `0.150 / 0.232 / 0.300` | `0.120 / 0.246 / 0.350` |

这份性能材料用于证明 W003 没有把新过渡变成热路径回归；正式 bundle 的 `performanceReport` 仍不在本阶段重冻，留给依赖 W004/W005 最终画面的 W006。

## 玩法与权威不变量

本阶段没有修改两份 binding、两份权威地图 JSON、catalog/collision 证据或对象/NPC 数据。最终复验哈希仍为：

| 合同 | 训练场 | 村口 |
|---|---|---|
| v2 binding | `2775987fa144e2a7f337a03d871bcd835d176e9af7a5461024997a0e3aaed073` | `0a97650b8a8781f4831881cbf99adbc76d3a2287bdd08ef7aeaf17a15fb33252` |
| 权威 map JSON | `37279c76ff265927ef8eb042ed0b8460e34aa91687070aff14029307adc71c51` | `19bbdcbb7856f47f57d80883cf06bb83efab8abc05315eadf41e23fb2a409eac` |

- catalog contract evidence：`092a9ba229efab36ff03888cd164f1d55972c052371684733adcb3e08239e90c`；
- collision audit evidence：`df20cd944c4b72717ec06ccbb129f9892fae3bd8c349736aa616a4b1ae786e76`；
- 18 个 blocking placement、47 个 footprint cell、spawn、warp、protected cell、寻路和服务交互继续使用 W001 冻结事实；
- 15/15 道路签名与 15/15 广场签名由 prepare-time 暴露边选择，没有 draw-time 随机或缺失回退。

## 验证

以下检查均在隔离候选工作树执行：

1. 资源组装、atlas 重建与 80×40 覆盖率合同：

   ```text
   python3 -B -m unittest \
     tools.test.test_assemble_firebud_surface_autotile_sheet \
     tools.test.test_build_firebud_ground_atlas_v4
   ```

   结果：`15/15 PASS`，包括冻结源逐字节重建最终 atlas、15 组合完整性、旧四单边源 fail closed 和 v2/v3 downsample 覆盖率差异。

2. QA lane、真实 recorder 与性能 runner 合同：

   ```text
   python3 -B -m unittest \
     tools.test.test_godot_qa_user_data_lane \
     tools.test.test_run_firebud_v2_performance_evidence \
     tools.test.test_record_firebud_v2_owner_review
   ```

   结果：`94/94 PASS`。共享清理器不得在检查前改写 playback disabled，Main 入口和唯一 clean-exit JSON 均有负例保护。

3. Godot QA runner 合同：

   ```text
   node --test tools/test/run_godot_auto_checks.test.mjs
   ```

   结果：`56/56 PASS`。

4. 严格 pending runtime 与 review catalog：

   ```text
   godot --headless --path client/godot --script res://scripts/qa/map_visual_runtime_check.gd -- --preview-map-visual-catalog-contract
   godot --headless --path client/godot --script res://scripts/qa/map_visual_review_catalog_check.gd
   ```

   结果：顶层与 v2 报告均 `PASS`、`errors=[]`、两层 frozen validation 均未跳过；v1 的预期 fail-closed 隔离在 v1 报告。review catalog 为 `PASS`，道路/广场完整、确定性选择及 `strictPendingReviewFreeze=true`。

5. 目标客户端回归：

   ```text
   node tools/run_godot_auto_checks.mjs \
     --only --auto-movement-check,--auto-pathfinding-check,--auto-map-visual-review-showcase-profile-check,--auto-firebud-village-service-layout-check,--auto-npc-collision-check,--auto-map-transfer-check \
     --fail-fast --timeout-ms 180000 \
     --output-dir .run/godot_auto_checks/r1_w003_final
   ```

   结果：Godot parse 加六个目标检查 `7/7 PASS`，覆盖移动、寻路、展示档案、服务布局、NPC 碰撞和 warp/切图。

6. 真实 Main 返工证据与性能：录片 `4/4` 状态、媒体全流解码、清理和 SHA256SUMS 通过；v1/v2 性能矩阵 `8/8 PASS`，全部 60fps，moving 均有真实跨帧鼠标输入，16 个 stream 与 manager 均正常释放。

7. bundle 离线审计：112 个文件、81 张 PNG、5 个 JSON，`errors=[]`、结构 `PASS`。`releaseReady=false` 只保留 W004–W007 所属的 Computer Use、dressed/layered preview、正式 runtime screenshot/performance、OWNER 接受、release attestation 和 released/enabled 生命周期门禁。

8. Python compile、JSON 解析、manifest 哈希闭合、`git diff --check`、精确玩法文件无 diff、QA lane/候选进程收尾均通过。

本任务不是 release/export 总门禁，按仓库定向验证规则没有重复运行完整 `node tools/run_local_ci.mjs`。

## 生命周期、非目标与下一任务

Firebud v2 继续保持：

- `status=owner_review_pending`；
- `ownerReviewStatus=pending`；
- `releaseApproved=false`；
- `runtimeEnabled=false`；
- `releaseAttestation=null`。

本阶段没有修改 HUD 布局、镜头安全区、物件/NPC 密度、比例、光照、warp/spawn、地图拓扑、碰撞或服务位置，也没有写入正式 W006 证据、OWNER acceptance 或发布启用。下一任务是 `R1.W004 AUTO｜Firebud v2 PC HUD 安全区与边缘构图返工`。
