# Phase 383：火芽 v2 世界构图、比例与最终冻结候选

## 结论

项目所有者指出 Phase 382 的实际地图仍显突兀：人物和后排 NPC 屏占比过小，村口有大面积
无层次草地，原有地表近似单色铺底，不能靠继续调整 HUD 掩盖世界美术问题。由此建立的
`firebud_region_visual_v2` 只允许显式 QA 审图，正常玩家路径与已发布 v1 不受影响。

项目所有者已明确回复“批准 Firebud v2 冻结画面”，该决定保留为地图构图方向接受。随后又
提出两项现场反馈：任务文字不得越出右侧任务卡；焰芽斗士不得呈现“单腿滑行”。任务卡现有
响应式宽度、裁切和省略号保护；人物真八向步态已按 Phase 405 重制为六帧。地图素材本身
没有因这两项反馈改写，但最终联合片和像素组合已经刷新，因此不把此前地图构图接受冒充为
对当前 v3 精确联合片的接受；候选生命周期继续严格保持：

```text
owner_review_pending / pending / false / false
```

项目所有者明确接受本次最终实机片前，不提升为 `released`，不写 owner acceptance 或
release attestation，也不让普通启动路径暗中选择该候选。

## 可见修正

- 非战斗候选审图比例为 `1.55`；普通 v1、正常世界和战斗仍使用既有比例；
- 原创、可追溯地表母材派生为 320×120 RGBA atlas，四种同源草地以 3×3 大片聚类组织，
  路面、石坪、遭遇草和传送石保持清晰语义；
- diamond 只使用有界抗接缝 bleed，不改变地图语义格、碰撞、寻路、遭遇、warp 或
  protected cells；
- 村口以古树、花草和建筑形成前后景框景；训练场以陶罐、图腾、道路、石坪和花丛建立
  视觉中心；
- 地图外纯装饰物只允许位于 `edgePaddingCells` skirt；blocking、interaction 与
  collision footprint 必须完全留在权威地图内；
- 右侧任务条目宽度跟随真实父容器，超长正文在卡片内部省略，并由自动检查锁定边界；
- 审图档案先证明 fresh default profile，再仅在内存注入正式人物和战宠；不登录、不保存、
  不启动后端、不访问 MySQL，玩家画面没有 QA 或调试文案。

## 当前冻结合同

主要输入、运行资产与权威绑定：

```text
source/raw/firebud-ground-materials-v4.png
  SHA-256 65d015eb492237b3b4b0c5e5bd01d2c32843cce9aa99612eef361a2077bed45b
runtime/ground/atlas.png
  SHA-256 991e8c2010ade24738b8475db0549fe9dadb38874afc96ae5490a344c0638265
bindings/firebud_training_yard.json
  SHA-256 d1b249a4aa923e07864358fea1bb4bc5a5fa82db4c1eaf7899378ca9312cc14b
bindings/firebud_village_gate.json
  SHA-256 b0c7335a9d40dffc24a7b0c4e7d5a86522d57b7b481cced458ca3374a1747962
evidence/catalog-contract-check.json
  SHA-256 18e0f53de2ccbcc52e89f6033efbbb41ed41b189afdf9174e1f4426840ef7b23
```

当前 1280×720 冻结静态主图：

```text
evidence/runtime-screenshots/firebud_training_yard-pointer-idle.png
  SHA-256 76c47a72c16455fc8a735490284f9203fe3daeea1814f40018b541849116051b
evidence/runtime-screenshots/firebud_village_gate-pointer-idle.png
  SHA-256 a2e81c6048d888e135e26dc37ce38f4876b2ee7f1f025caafb9b384354d57f82
```

生成提示、原始输出、确定性 atlas 处理、运行 PNG 来源／所有权／哈希与替换路径均记录在
`source/prompts/`、`source/processed/` 和 `source/provenance.json`。没有复制参考
产品的地图、UI、角色、图标、商标或源代码。

## 工程与运行验证

- bundle auditor：`PASS`，`errors=[]`，检查 101 个文件、39 张 PNG、17 个 JSON；
  未完成门只剩 lifecycle、owner acceptance 和 release attestation；
- 两张地图最新 collision audit 全部通过：阻挡格、物件 footprint、精确路径端点、出生点、
  双向 warp、NPC 接近格、遭遇区和 binding/map-data 哈希；
- 10 组最新真实 `Main.tscn` capture 全部为 1280×720，idle 或真实跨帧左键移动均
  `PASS`；无账号、无存档、无后端、12 个 HTTPRequest 全断开；
- 任务卡 standalone 与 world presentation／quest／task-route 定向回归通过；
- 焰芽斗士 48 张 source walk、48 张 runtime walk 和 Godot 56/56 import parity 通过，
  详见 `docs/phase_405_ember_spark_world_gait_repair.md`。

地图冻结时两图 × baseline/candidate × idle/moving 共 8 组固定 60 FPS 性能矩阵全部通过：

```text
训练场 baseline → candidate
idle   mean process_total 0.465ms → 0.324ms
moving mean process_total 0.377ms → 0.310ms

村口 baseline → candidate
idle   mean process_total 0.412ms → 0.441ms
moving mean process_total 0.378ms → 0.375ms
```

候选 idle/moving 均低于 0.5/0.6ms 门槛；移动组每次发送 30 次真实跨帧鼠标点击，证明
`moved/coalesced/settled/finalTargetMatched`，没有进入战斗或遭遇。正式报告：

```text
client/godot/assets/maps/firebud_region_visual_v2/evidence/performance-report.json
  SHA-256 539dedc2e9169390812d849c6c0cecd434eb34da98672148a652dd0617a3f2cf
client/godot/assets/maps/firebud_region_visual_v2/evidence/collision-audit.json
  SHA-256 c7c630381984a8a6ae9065e3a03be0335d85c18d0b13c4f8d9d91b924ebb1dd7
```

步态 v3 合入后的相邻地图热路径又重跑 8/8：两图 idle/moving 仍全程 60 FPS，候选
`process_total` mean 为村口 `0.339/0.343ms`、训练场 `0.393/0.260ms`。该矩阵只声明地图
绘制／移动热路径，无意冒充人物专属性能基准；边界见 Phase 405。

## 最终 1× 项目所有者验收片

最终视频来自真实 `res://scenes/Main.tscn`，覆盖村口／训练场的 idle 与真实跨帧鼠标移动。
媒体合同为 1280×720、30 FPS、H.264/AAC、644 帧、21.466667 秒、动作全程 `1.00×`；
每段仅在末帧静止 4 秒供审图，没有 `setpts`、`atempo` 或动作加速，完整音视频流解码
通过。

```text
.run/evidence/phase405_ember_spark_world_gait/
  phase405-ember-gait-v3-main-final/firebud-v2-owner-review-1x.mp4
```

视频 SHA-256：

```text
6ab986d2b3633abd1164259cf539566b4315b682531cb993cef3dfe31588cfe7
```

当前结论只表示候选来源、自审、运行、交互、碰撞和性能门禁通过；精确最终画面仍为
owner review pending，不据此宣称正式发布、200 人同图容量、移动端适配或完整 GPU 性能。
