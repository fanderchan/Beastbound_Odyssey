# Beastbound 地图正式生产合同

本合同适用于所有准备进入 Beastbound Odyssey 客户端的城镇、村庄、室内、野外与过渡地图。技术接入完成不等于美术获准发布。

## 1. 原生运行时结构

- 地图固定遵循项目原生 `80x40` 菱形等距格；格坐标、世界坐标、寻路与点击落点必须共用同一换算合同。
- 正式地图使用 `tile_mode` / `layered_tilemap`。图像只表现地表与物件，不得成为玩法状态的唯一来源。
- 每张地图必须把以下职责独立保存并独立校验：
  - `groundTileArt`：草、土、石、沙、水边、道路等可平铺地表；不得含建筑、树木、NPC、玩家、宠物、任务图标或文字。
  - `sceneObjects`：建筑、围栏、树、岩石、路牌、桥梁等可定位物件及其视觉资源。
  - `collision`：阻挡格、占地格或碰撞多边形；不得从贴图透明度或肉眼外形推断。
  - `warps`：出口、入口、目标地图、目标落点与朝向。
  - `encounters`：野外遭遇区域、表或规则引用；不得烘焙进地表图。
- 允许制作一张完整的 `dressed_reference` 供构图和审美评审，但禁止把单张 baked 大图作为正式运行时地图。
- 允许 binding 用可选 `ground.edgePaddingCells`（整数 0..32，正式 1280x720 默认建议 20）在权威网格外绘制纯视觉 edge skirt，避免摄像机边缘露黑。skirt 只能复用 `defaultTileId`，其格坐标必须全部在权威 grid 外，且不得进入 tileIds、blocked/protected、碰撞、寻路、交互、遭遇、spawn 或 warp；它不是地图扩容。
- 禁止把 NPC、玩家角色、坐骑、宠物、可拾取物、交互标识或动态效果烘焙到任何正式地表或场景物件贴图中。

## 2. 城镇与野外职责

- 城镇地图优先保证服务区、主路、广场、出入口和地标一眼可辨；建筑占地不得截断主通路，NPC 位置与职业形象由运行时数据独立放置。
- 野外地图优先保证主探索路线、支路、地形边界、危险区域和返回出口可读；遭遇规则与资源刷新必须独立于视觉装饰。
- 相邻城镇与野外可以共享区域色彩、材质和小型道具，但必须通过道路密度、建筑层级、植被密度和地形节奏形成明确场景差异。
- 出入口两侧的道路方向、可行走宽度、warp 落点和玩家朝向必须相互对应；不得用贴图掩盖不可达或错误连接。

## 3. 图像生成与来源记录

- 可见地图美术默认使用项目批准的图像生成流程生产；StoneAge 仅用于研究成熟地图的可读性和行为意图，严禁复制其地图布局、建筑、贴图、道具、角色或其他美术资产。
- 每次生成都必须保留：完整 prompt、生成时间、工具/模型标识、原始未处理文件、原始文件 SHA-256、处理步骤或脚本、处理后文件及其 SHA-256。
- 每个运行时资源还必须记录来源、所有权、替换路径、许可证/使用声明和对应生成记录。无法追溯的资源只能作为占位物，不得进入发布门禁。
- 裁切、去底、缩放、色彩调整和 atlas 打包必须可重复；不得覆盖原始生成文件。
- 地表只生成稳定基础材质；建筑、树木和其他高物件应生成透明背景的独立资源。带完整摆放效果的参考图只能用于评审。
- manifest `source.rawFiles` 与 provenance `rawFiles` 必须以相同 path/SHA 精确冻结所有原稿；manifest `source.buildArtifacts` 与 provenance `buildArtifacts` 也必须以相同 path/SHA 精确冻结所有进入运行时构建链的处理中间文件。两组不得互相重复，PNG 声明尺寸时必须以实际解码尺寸为准。
- provenance 的 `origin`、`owner`、`licenseBasis` 必须与 manifest 完全一致，并记录非空 `toolchain`、可直接复现的完整 `processing` 命令列表及 `reproducibility`。后者至少包括 `rawToProcessedByteExact: true`、`processedToRuntimeByteExact: true`、非空 `outputPrecondition`、布尔 `externalToolVendored` 和 `releaseBlocker: null | 非空说明`。
- 外部工具即使已冻结绝对路径和 SHA，也不等于仓库可复现。`externalToolVendored=false`、`externalChromaKeyTool.repositoryOwned=false`、`releaseBlocker` 非空，或任一 `processing` 命令含 `/Users/`、`/home/`、Windows drive-letter 绝对路径，均是独立正式发布 blocker：pending 包可如实保留，但不得进入 `approved` 或 `released`。若声明 `repositoryOwned=true` 或 `externalToolVendored=true`，tool 的 `path` 必须是 bundle 内可读的相对路径，其实际字节必须匹配所报 SHA，并纳入 owner frozen files；不能仅把布尔字段翻成 true。

### 3.1 两个确定性 helper 的可运行示例

以下命令从仓库根目录运行，输入文件是本包已经人工检查的透明处理中间稿。示例输出目录必须在运行前不存在；如已存在，请改用一个新的 `.run/` 路径，不得为了“清空”而删除不明目录，也不得直接写入 `runtime/`：

```bash
python3 .agents/skills/design-beastbound-maps/scripts/build_isometric_tile_atlas.py \
  client/godot/assets/maps/firebud_region_visual_v1/source/processed/firebud-ground-sheet-v2-alpha.png \
  --rows 2 --columns 2 \
  --labels firebud_meadow firebud_ochre_path firebud_honey_stone firebud_dark_root_soil \
  --output-dir "$PWD/.run/map-build/firebud-ground-fresh" \
  --atlas-columns 2 --alpha-threshold 0 \
  --atlas-name atlas.png --manifest-name build-manifest.json

python3 .agents/skills/design-beastbound-maps/scripts/extract_object_sheet.py \
  client/godot/assets/maps/firebud_region_visual_v1/source/processed/firebud-low-props-sheet-v2-alpha.png \
  --rows 2 --columns 2 \
  --labels firebud_training_target firebud_supply_pots firebud_low_planter firebud_low_fence \
  --output-dir "$PWD/.run/map-build/firebud-low-props-fresh" \
  --padding 8 --max-dimension 256 --alpha-threshold 0 \
  --anchor 0.5 1.0 --manifest-name objects-manifest.json
```

共同前置条件：输入必须是可解码 PNG，尺寸能被 `rows × columns` 整除，标签按行优先排列且数量精确、唯一、符合稳定 ID 规则，每格都有可见 alpha；输出根与目标不得是软链接，不得逃出该根，也不得覆盖源文件。地表 helper 要求显式 alpha，并只规范成 `80x40`；首次构建不使用 `--overwrite`。只有已明确复核的重建才允许 atlas helper 使用 `--overwrite`，且现有 `tiles/` 必须为空或恰好只含本次预期文件名。物件 helper 要求源图解码模式恰为 RGBA，永不覆盖已有目标；可见像素触碰 cell 边界默认失败，只有确知不是串格时才可传 `--allow-cell-edge-touch`，且该 override 会写入 manifest 并必须进入评审。

helper 先写临时目录、最后发布 manifest；成功输出仍只是构建产物，必须核对生成 manifest/hash，再把明确选择的文件安装到 bundle，并把处理中间稿登记为 `buildArtifacts`。不得把 helper 的成功状态误写成美术验收、碰撞验收或发布许可。

## 4. 物件锚点、排序与碰撞

- 每个 `sceneObject` 必须显式记录资源 ID、格坐标、世界偏移、缩放、底部接地点锚点、排序基线和稳定对象 ID。
- 锚点以物件与地面接触处为准，不以画布中心或透明边界为准；预览、碰撞、点击和运行时绘制必须使用同一锚点。
- 高物件按接地点的项目 Y-sort 键排序，并以稳定对象 ID 处理同键次序；玩家在物件前后移动时必须产生正确遮挡。
- 阻挡范围使用独立占地格或碰撞多边形，并与视觉脚底对齐。装饰层不得无意阻挡，建筑和大型物件不得允许角色穿入可见实体。
- 任何缩放、重裁或资源替换后，都必须重新验证锚点、排序基线与碰撞；不得沿用未经复核的旧数值。

## 5. 真实客户端验收

- 先通过清单/JSON 解析、资源尺寸与哈希检查、Godot headless 解析及相关定向自动检查。
- 再从真实入口以 `1280x720` 启动 `res://scenes/Main.tscn`，不得只依赖孤立预览场景或 headless 截图。
- 必须用 Computer Use 在真实客户端至少检查一张城镇和一张野外：点击移动、主路与支路、warp 往返、物件前后遮挡、碰撞边缘、HUD/NPC/玩家可读性，以及画面中没有生成文字或调试残留。
- 保存玩家可见的城镇与野外截图；涉及移动或切图时同时保存短视频或等价连续证据。
- 使用 `--perf-probe` 和相关移动压力探针记录 idle 与 moving 数据。替换既有地图时必须保留可比较的改动前后基线；全新地图没有同口径视觉基线时，必须明确标记为“候选门槛、无改前基线”，不得把单次 PASS 写成回归提升。地图接入不得在热路径进行全图扫描、同步磁盘读取或每帧重建图层；性能结果异常时不得择优忽略另一组测量。
- collision 与 performance 正式报告必须带精确三键 `runnerIdentity: {runner: "godot", runnerVersion, buildIdentity}`，后两项必须非空；并以 `rawRunnerReceipt: {path, sha256}` 冻结非空 `.log`、`.txt` 或 `.jsonl` 原始 runner 输出。pending 阶段可暂缺，但缺少任一项就是正式 release blocker；摘要 JSON、终端转述或人工改写数值不能代替原始 receipt。地图 runtime build identity 必须能从将要发布的提交复现：`project.godot` 以完整的 section/key/value 语义参与摘要，忽略注释、空白、分行及 section/key 排序等 Godot 编辑器格式化差异，但任何真实设置值变化仍必须改变身份；不得把未提交且仅为编辑器重排的文件字节误冻进报告。
- Computer Use 报告必须属于本 bundle，不能拿普通截图或 Godot 自动输入冒充。对 manifest 中每个 mapId，`actions` 必须恰好覆盖 `pointer`、`movement_path`、`warp`、`collision`、`occlusion` 五种 `actionKind`，同 map 不得重复类型。每项都必须 PASS，并精确匹配该 map 在 `runtimeScreenshots` 中冻结的恰好一组 `1280x720` PNG／配对 capture report；一组 pair 不得跨 action 复用。动作与 capture mode 固定对应：`pointer=idle`、`movement_path=moving`、`warp=moving|transition`、`collision=moving`、`occlusion=moving`，因此正式证据每 map 至少需要五组互不相同的冻结 pair。同一 map/mode 可有多条独立 entry（movement、collision 与 occlusion 都是 moving），但 image ref、captureReport ref 和具体 pair 都必须各自唯一。遮挡结论必须由 Computer Use action 及其 receipt 描述并证明角色实际穿越高物件前后层级，不得手写当前 capture harness 不支持的 `occlusion` capture。每项还必须带唯一 `actionReceipt: {path, sha256}`，指向 bundle 内非空 `.log`、`.txt` 或 `.jsonl` 原始 Computer Use receipt，并纳入 owner `acceptedFiles`。任何 map 少一种动作、复用／错 mode／跨包证据、receipt 缺失、窗口捕获失败或 Computer Use 不可用，均必须保持 blocker，不得手写 PASS。

## 6. 评审状态与发布门禁

- 所有新地图美术初始状态必须为 `owner_review_pending`。该状态允许本地接入、自动测试和冻结证据制作，但不得视为正式美术验收或发布许可。
- 冻结评审包至少包含：城镇/野外 `1280x720` 真实客户端截图、必要的移动视频、运行时资源清单、prompt、原稿与处理后哈希、collision/warp/encounter 摘要，以及测试和性能结果。
- 只有项目所有者明确接受该冻结证据，且代码检查、来源追踪、锚点/排序/碰撞、warp、功能测试和性能检查全部通过后，才可把对应精确哈希改为可发布状态。
- 任何可见资源、摆放、锚点、碰撞或 prompt 派生结果变更都会使既有美术接受失效；必须恢复 `owner_review_pending` 并重新冻结证据。
- `owner_review_pending` 固定为 `ownerReviewStatus=pending`、`releaseApproved=false`、`runtimeEnabled=false`。离线 audit 可以结构 PASS，但 `releaseReady=false` 是预期且仍不可发布。
- `approved` 表示所有者已经接受完整 hash-frozen review subject；它必须使用 `ownerReviewStatus=approved`，但两项发布开关仍保持 false，普通玩家运行时仍不得启用。
- 只有 `released` 才允许并要求 `ownerReviewStatus=approved`、`releaseApproved=true`、`runtimeEnabled=true`。这不是人工直接改四个字段的捷径；所有 provenance、runner receipt、Computer Use、碰撞、性能与 owner acceptance gate 必须同时闭合。
- `source/` 与 `evidence/` 由 `.gdignore` 排除，正常运行时不会也不应读取它们。因此正式状态只能由仓库外线/CI 的离线 auditor 与 pre-export gate 强制：对即将导出的精确 bundle 运行 `audit_map_bundle.py`，同时解析输出 `status == "PASS"`、`releaseReady == true`、`missingReleaseGates == []`。仅凭进程退出 0 或结构 PASS 不足以发布。
- 导出态另需 bundle 根目录 `release-attestation.json`，并由 manifest 顶层 `releaseAttestation: {path, sha256}` 精确引用。它必须使用 `beastbound_map_runtime_release_attestation` v1 合同，冻结 bundle/style/map 身份、目标 released 生命周期、离线 PASS 声明，以及无环的 manifest/evidence/asset/bundle 四组 canonical 摘要。正常 runtime 必须核 attestation 文件 SHA、摘要和当前 atlas/object/binding 字节；任一漂移失败关闭到旧地图。具体字段和摘要算法以 `bundle-schema.md` 为唯一合同。
- attestation 不得嵌入 owner acceptance SHA 或 owner manifest-review digest，否则会与 manifest 内的 attestation 引用形成哈希环。顺序固定为：先冻结非 owner 证据并生成 attestation；manifest 引用 attestation；再生成 owner acceptance，使 owner canonical subject 包含 attestation path/SHA；最后在 released 候选上重跑 auditor/pre-export gate。attestation 本身必须进入 owner `acceptedFiles`。
- lifecycle 候选变更必须先在未分发的工作树/构建候选中完成，再运行上述门禁；任一检查失败就恢复 `approved` 或 pending 且保持两项运行时开关 false。禁止让四个运行时字段或 attestation 的自述单独宣称证据有效，禁止在 pre-export 门禁之外手工把包翻成 `released`。
