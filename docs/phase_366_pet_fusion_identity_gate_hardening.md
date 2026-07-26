# Phase 366：融合宠身份正式化工具与审图门禁

## 结论

P1.4d 完成的是“身份候选进入后续正式化流程前，工具必须失败关闭”的阻断修复，不是融合开放，不是正式素材交付，也不是把本阶段四姿审图候选称为正式身份源。

本阶段修复了两个会制造后续美术债务的薄弱点：

1. 旧 `finalize_pet_identity_gate.py` 主要确认文件存在，不能证明四姿互不重复、透明板确由四张姿势精确拼成、生成源与处理流水线一致，也不能防止 `--force` 覆盖已批准或已启用的素材；
2. 批量美术审计工具仍按旧版融合目录合同识别，无法与 P1.4c 已升级的严格 v2 关闭态目录结构对齐。

修复后，只有来源、透明、构图、姿势、流水线和自审证据全部通过，工具才允许写入 `in_production / owner pending / runtimeEnabled=false` 的隔离生产包。任何正式批准、目录登记、配方登记和运行开放仍必须由后续独立证明完成。

## 严格身份门禁

`tools/finalize_pet_identity_gate.py` 现在冻结以下合同：

- 原始生成源必须是真实 PNG，RGB/RGBA 且双边至少 512px，并记录文件、解码 RGBA 和含尺寸/模式域的 canonical SHA-256；
- 透明身份板必须是 1024×1024 RGBA，四姿必须分别为 512×512 RGBA；
- 四姿固定为 `front_3quarter_sw`、`back_3quarter_ne`、`south`、`west`，像素必须互不重复；
- 1024×1024 身份板必须是四张 512×512 姿势的逐像素精确 2×2 拼图；
- 透明背景必须有真实覆盖，主体不能为空，Alpha≥8 的主体必须留出安全边，Alpha=0 像素下不得残留非零 RGB；
- 流水线元数据必须来自带 `replayContractVersion` 的 `build_pet_art_bundle.py` schema 1；正式化工具会在隔离临时目录用完整参数真实重放构建器，逐像素比较四张 512 源姿势与 1024 身份板，比较四张 256 派生帧哈希，并要求重放元数据除规范化输入路径外全字段一致。手填哈希、全洋红原图配人工姿势或残缺旧 manifest 都会失败关闭；
- `qa/identity-key-pose-qc.json` 必须逐 SHA 绑定身份板、四姿和独立接触表，自审可以通过，但主人审图状态只能是 pending，运行开关只能是 false；
- 首版融合宠的不可骑合同会拒绝任何 `supportedCharacterIds` 或 mounted 声明；
- catalog 形态必须明确处于 `in_production / runtimeEnabled=false`；全部 catalog 路径和派生路径都必须留在当前宠物 root 内，拒绝 symlink、hardlink/路径别名及输入输出互指；
- `--force` 只允许覆盖同 form、同 schema/scope、明确 pending/false 的本工具产物；任意层级出现批准、formal、release 或 runtime 状态、未知结构或错误类型都会拒绝。提交时会再次验证捕获到的旧元数据，并用 no-clobber 安装阻止并发批准被覆盖；
- 三个输出先在唯一事务目录完整生成，受锁保护地安装；普通异常和已覆盖的并发写入会完整回滚，原始 PNG 只允许归档成解码像素完全一致的无损 WebP。该保证不宣称能够自动恢复 `SIGKILL` 或掉电留下的陈旧锁、事务目录或部分关闭态输出；
- `--check-only` 只重验，不写 WebP、来源账本或动作元数据。

生成工具仍不会替玩家或项目所有者做决定：它不创建动作、不批准身份、不登记融合配方，也不打开运行开关。

## 批量审计对齐

`tools/pet_art_batch_audit.py` 已改为严格要求：

```text
schemaVersion=2
catalogId=pet_fusion_recipes_v2
```

旧 v1 融合目录会失败关闭。对生产融合目录文件本体进行只读静态复核，当前内容仍为：

```text
runtimeEnabled=false
recipes=[]
```

这里必须区分两个数量：

- 玩法模板目录已有 36 个宠物模板；
- 美术目录目前只有 34 个已登记形态。

差额正是曜冠角兽、苔垒角兽两只融合目标：它们已有玩法身份和终局成长档，但尚未进入美术目录，也没有正式非骑乘素材包。因此，全目录只读美术批审计只能覆盖现有 34 个 art forms，并证明这 34 个登记形态没有因工具改动出现新的目录回归；它不能证明两只融合目标已有正式美术形态，也不能把“融合目录文件本体通过静态复核”表述成“生产 v2 融合美术链路已经过批审计验证”。

最终 34 形态只读批审计为 `errors=0 / warnings=0 / failed=0 / pending=7527`。报告同时明确 `fusionAuthorization.catalogChecked=false`、`artCatalogNonrideableFormIds=[]`：因为生产美术目录尚无不可骑融合形态，本次生产扫描没有触发融合授权目录检查；关闭零配方 v2、合法 formal v2 与畸形 v2 的接受/拒绝由隔离回归覆盖。

## 两张项目所有者审图候选

为避免在主人确认造型前扩展真八向和完整战斗动作，本阶段只生成两张四姿审图候选，保存在被忽略的 `.run/evidence`，不进入 `client/godot/assets`：

| 目标 | RGBA 候选 | 尺寸 | 透明像素 | Alpha≥8 主体像素 | SHA-256 |
| --- | --- | --- | ---: | ---: | --- |
| 曜冠角兽 | `.run/evidence/p1_4d_fusion_identity_keypose_review/solar_crown/solar_crown_four_pose_candidate_v1_alpha.png` | 1254×1254 | 1,073,235 | 499,281 | `eba8b9c5483d608079d1a5990e2473a3cef047de49866bab880275d22c28410d` |
| 苔垒角兽 | `.run/evidence/p1_4d_fusion_identity_keypose_review/moss_rampart/moss_rampart_four_pose_alpha_candidate_v1.png` | 1254×1254 | 1,067,726 | 504,790 | `2a30e158a2ea842f78d56f18445c63d3e0a4ba7d62607de4433dd4f41e557870` |

两张图的四个象限都有独立主体，透明区 RGB 泄漏为 0；身份、单角、盔甲/鬃毛/石苔外壳、肢体和姿势顺序已完成候选级自审。该自审只用于判断是否值得提交项目所有者看造型，不构成正式源批准。

它们故意不通过正式门禁：正式板要求 1024×1024 且四姿各有独立 512×512 来源，而这两张仍是 1254×1254 的主人审图板。门禁对两张都返回：

```text
candidate board must be 1024x1024, got 1254x1254
```

因此当前状态严格保持 `candidate_owner_review_pending / formal=false / runtimeReady=false`。项目所有者明确批准四姿造型后，才允许进入隔离生产，制作完整非骑乘素材包；不能仅把审图板规格化为 1024 身份板与四张 512 姿势，就宣称整只融合宠已正式化。

## 后续唯一发布顺序

本阶段之后只能按以下顺序推进，不允许交换步骤或用占位素材跨过门禁：

1. 项目所有者批准本阶段四姿身份候选；
2. 在隔离生产区完成整只宠物的完整非骑乘素材包，包括规范身份源、世界真八向、双视角战斗动作、来源/权属/处理流水线和全部自动证据；
3. 项目所有者审核完整包，并生成与冻结包逐文件绑定的发布证明；
4. 同一个受控切片内同步登记 art catalog 与 formal fusion recipes，但两者均保持 `runtimeEnabled=false`；
5. 在关闭态完成融合端到端 QA，并交付真实 `1.00x` 录像；
6. 项目所有者另行作出是否开放 runtime 的明确决定；
7. 只有获得该独立决定后，才能开放玩家入口与运行开关。

在第 4 步正式配方落地以前，QA 如需验证融合流程，只能使用 test-only 注入；不得把临时、deferred、占位或候选配方写进生产目录。

## 验证与边界

- `python3 -m py_compile`：本阶段 6 个 Python 工具/测试文件通过；
- `python3 -m unittest tools.test.test_build_pet_art_bundle -v`：`30/30`；
- `python3 -m unittest tools.test.test_finalize_pet_identity_gate -v`：`23/23`，覆盖真实来源重放、透明、构图、自审精确绑定、catalog/root/symlink/alias、`--force`、并发 no-clobber、异常回滚与 `--check-only`；
- `python3 -m unittest tools.test.test_pet_art_batch_audit -v`：`32/32`，覆盖关闭零配方 v2、合法 formal v2、畸形 v2、旧 v1、身份链长期漂移和 catalog 状态绕过；
- 全目录宠物美术批审计：当前已登记的 34 个 art forms 为 `0 errors / 0 warnings / 0 failed / 7527 pending`；生产融合目录文件本体另做只读静态复核，二者不得混称；
- 两张候选 PNG 的格式、尺寸、SHA、Alpha 统计和四象限主体统计复核通过；
- 两张候选均被正式 1024 尺寸门禁按预期拒绝；
- `git diff --check` 通过。

本阶段没有修改 Godot 玩法、服务端融合事务、数据库或真实玩家数据，也没有运行完整本地 CI。带有无关未提交改动的 `tools/sprite_alpha_despill.py` 未被修改，也未被用于改写任何资产；批量审计会导入并调用其中未改动的只读 `magenta_edge_metrics` 像素度量函数，因此准确边界是“只读度量复用”，不是“完全没有调用该工具文件”。

P1.4d 的完成只代表身份正式化工具阻断已经修复；若提交前定向回归失败，本项必须撤回完成状态。P1.4 父项继续未完成。下一步先由项目所有者审核本阶段两张四姿身份候选，再严格按“完整非骑包 → 完整包批准/发布证明 → art catalog 与 formal recipes 同步关闭登记 → 关闭态 E2E/1× → 独立 runtime 决定 → 入口/运行开放”的顺序推进。
