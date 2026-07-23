# Phase 330：火芽区域城镇／野外地图视觉管线与三图试产

日期：2026-07-23

## 本阶段结论

本阶段先把地图生产规则固化为项目 Skill，再以火芽村玩家路径完成一组可运行的城镇／野外试产：

- `firebud_training_yard`：火芽训练场；
- `firebud_village_gate`：火芽村口；
- `mistcap_marsh`：雾帽湿地。

三图不是把一张完整插画铺到地面，而是继续使用现有 `80x40` 等距逻辑格：地表由可复用 atlas 绘制，环境物件为独立透明资产，碰撞、出生点、NPC、交互、遭遇和传送仍由现有地图数据决定。火芽训练场与火芽村口共用 `firebud_warm_stone_v1`；雾帽湿地因气候、地表材质和探索语义不同，使用独立的 `mistcap_marsh_v1`。

两套 bundle 当前都严格保持：

```text
status=owner_review_pending
ownerReviewStatus=pending
releaseApproved=false
runtimeEnabled=false
```

因此普通玩家不会加载这批候选像素；只有显式地图美术 QA preview 可以查看。自动检查、作者自审或本阶段文档都不能替项目所有者批准美术，也不能据此勾选 P2.1 或 P2.2。

## 可复用地图生产 Skill

新增项目 Skill：`.agents/skills/design-beastbound-maps/`。它把本阶段确认的地图生产边界固化为后续城镇、野外、洞窟、室内和路线地图的统一入口：

- `SKILL.md`：从仓库真相、地图权威数据、StoneAge 结构参考到试产、实装、证据和 owner review 的完整流程；
- `references/production-contract.md`：地图角色、视角、图层、碰撞、关键路径、来源和发布状态合同；
- `references/bundle-schema.md`：正式 bundle、binding、资源、证据和生命周期 schema；
- `scripts/build_isometric_tile_atlas.py`：只按声明拼装 `80x40` 地表格，不发明或镜像美术；
- `scripts/extract_object_sheet.py`：只把已审查的物件表确定性裁成独立透明资产；
- `scripts/audit_map_bundle.py`：只读复验来源、哈希、尺寸、绑定、证据和发布矩阵。

Skill 明确规定：地图视觉工作不能顺手移动 NPC、warp、spawn、遭遇区或奖励；同一地域应复用稳定 `mapStyleId`；新地图名、村名或任务名本身不产生一套新 tileset；完整地图生成图只能作为概念／审片参考，不能成为可玩地图的权威几何。

## 权威地图与视觉目录分离

现有玩法地图继续由以下文件拥有权威语义：

- `client/godot/data/firebud_training_map.json`；
- `client/godot/data/firebud_village_gate_map.json`；
- `client/godot/data/mistcap_marsh_map.json`；
- `client/godot/data/map_regions.json` 及 `MapDataCatalog` 的既有归一化结果。

本阶段新增的 `client/godot/data/map_visual_catalog.json` 只把 `mapId` 解析到 visual bundle 与 binding。运行合同为：

```text
mapId        -> grid / spawn / blocker / NPC / interaction / warp / encounter
mapStyleId   -> palette / terrain atlas / prop library / scale / lighting
mapBinding   -> 某个 mapId 的地表分配与独立物件摆放
sceneObject  -> asset / anchor / display size / sort point / collision role
```

视觉 binding 不反向改写玩法 JSON，也不从贴图 alpha 或画出来的道路猜碰撞。`catalog-contract-check.json` 记录 catalog、每张权威地图与对应 binding 的哈希；权威数据或 binding 任意一侧漂移，都必须重新生成，不能沿用旧 PASS。当前已跑通“显式 generate → 回填 manifest 报告哈希 → 默认 strict 复验”的闭环：火芽报告为 `3c1cccabde1c376227330e27bcdecc6a355c5a2a40a773e7f8a3cea3a2ee22b8`，湿地报告为 `fb1182f0e1935e00fd031cefbf69896f24c6d0889a52daabc944d8974d448465`，两者共同引用 catalog 哈希 `f4c4758e22e9d457b1abda1bec377070eb0098e9fdc54c9bbe96fcce62d9e09d`。已有报告默认拒绝无覆盖生成，生成入口也拒绝登录、服务器和未知参数；报告仍不能代替正式 owner packet 的整树／构建身份。

## 两套视觉 bundle

### 火芽区域 `firebud_region_visual_v1`

火芽训练场与火芽村口共享暖草地、赭石道路、蜂蜜色石地和暗根土四类地表。可独立摆放的物件包括训练靶、补给陶罐、低矮花槽、低围栏和服务亭。原始生成图、逐字 prompt、透明处理结果、atlas／物件构建记录、SHA-256 与权属都保存在同一个 bundle 中。

服务亭属于当前首批高物件试点；它已经有显式 anchor、sort point 和碰撞足迹，但其最终遮挡发布门槛仍未通过，详见“发布阻断与已知视觉问题”。

### 雾帽湿地 `mistcap_marsh_visual_v1`

雾帽湿地使用湿苔、泥路、浅沼和密芦四类地表，独立物件为芦苇丛、苔石、蘑菇簇和倒木。它不复用火芽暖石 palette，避免仅换名字却继续显示村庄地表；同时仍复用相同的 `80x40` 等距坐标、atlas 结构、物件锚点和审计工具。

两套资产均声明为本项目定向 AI 生成的原创输出；StoneAge 只用于世界层级、道路可读性和交互结构参考，没有复制其地图、布局、贴图、物件、名称、代码或数值。runtime 地表与物件不含人物、NPC、宠物、敌人、任务标记、UI 或可读文字，也没有运行时或离线镜像。

## Godot 接入与生命周期保护

地图视觉解析与绘制放在聚焦模块中：

- `client/godot/scripts/world/map_visual_catalog.gd` 负责目录、bundle、binding、纹理与生命周期解析；
- `client/godot/scripts/world/map_visual_renderer.gd` 负责缓存地表格和独立物件的绘制数据；
- `client/godot/scripts/qa/map_visual_runtime_check.gd` 从真实 `MapDataCatalog` 复验视觉绑定与外部权威；
- `client/godot/scripts/qa/map_visual_review_capture.gd` 从真实 `Main.tscn` 录制 1280×720 idle／moving 证据；
- `main.gd` 只保留启动参数、缓存接线和绘制分发，不承担新的地图领域规则。

正常运行只允许加载 `status=released`、`ownerReviewStatus=approved`、`releaseApproved=true` 且 `runtimeEnabled=true` 的 bundle。当前 pending bundle 在普通玩家路径中失败关闭到既有程序地图；不能用另一个 biome 代替。必须明确的是，当前 runtime 生命周期只核对上述四个字段，尚不会验证 owner decision／release attestation 的内容与哈希，因此这只是 pending 安全门禁，不是完整发布证明。显式 `--map-art-review-preview=<mapId>` 才能打开 QA 预览：未提供登录参数时使用隔离 debug 档案，若操作者另外明确传入登录参数则普通预览仍保留真实认证语义。专用 `--map-visual-review-capture` 取证入口更严格，会在认证启动前拒绝全部登录／服务器参数，并且只使用无账号、无存档的临时档案，不连接或改写玩家后端状态。

地表 atlas、binding 和物件纹理在地图准备阶段解析并缓存；第二次 prepare 不应产生新增 JSON 或纹理 I/O。正式导入／导出环境优先通过 `ResourceLoader` 读取 `Texture2D`；刚检出的源码尚无 Godot 生成型 `.import` 时，准备阶段可用 `Image.load + ImageTexture` 解码同一冻结 PNG，避免把本机旧 import cache 误当可复现前提。该回退同样缓存，`_draw`、`_process` 和输入热路径不扫描目录、不读 JSON、不加载／缩放纹理，也不根据全图内容重建大签名。build-only tile 切片与构建 manifest 已从 `runtime/` 迁出；当前每个 bundle 的运行目录只保留最终地表 atlas 和独立物件 PNG，source／evidence 继续由 `.gdignore` 隔离出 Godot 导入路径。

## 玩法合同门禁

外部运行检查不只验证“图片能打开”，还同时锁定视觉与真实玩法地图的一致性：

1. **地图与格子**：catalog、bundle 与 binding 的 `mapId` 必须一致；binding 尺寸必须等于权威地图尺寸；地表 tile ID 必须存在于声明 atlas。
2. **碰撞**：物件的 `collisionRole` 只能是 `none / decorative / blocking / interaction`；blocking footprint 必须显式声明并落在权威阻挡格，图片 alpha 不产生隐藏碰撞。
3. **关键路径**：每条 `pathLink` 的两端必须在图内、可行走且不相同；必须存在从精确起点到精确终点的可行路径，禁止用“最近可走格”伪造通过。
4. **出生与 warp**：每个 spawn 和 warp 来源格必须在图内、可达且受保护；warp 的 `targetMapId`、`toSpawn` 以及目标地图出生点必须真实存在、在图内并可行走。
5. **NPC 与交互**：NPC 来源格和至少一个可达接近格受到保护；`interaction` 物件必须引用真实权威交互，不能只画一个可点击招牌却没有玩法实体。
6. **遭遇**：`manualOnly` 不冒充踩地遭遇；cells／rects 必须在图内且落在可行走格，玩家能够从出生路径抵达至少一个真实遭遇入口。
7. **受保护格**：spawn、warp、NPC 接近格、主路和遭遇入口不能被视觉物件足迹覆盖；binding 的装饰摆放不新增玩法 topology。
8. **生命周期**：字符串或缺失字段不能被当作布尔真值；pending、approved 与 released 的字段组合必须满足严格矩阵，普通运行对 pending 像素保持禁用。

## 真实 Main 取证

三张地图均通过 `res://scenes/Main.tscn`、1280×720 的真实客户端路径采集 idle 与 moving 证据。moving 模式不是同一帧调用移动 helper，而是跨帧发送真实 `InputEventMouseButton`，记录按下／释放帧，并要求玩家逻辑格确实发生变化后才允许写出 PASS。捕获同时断言：地图美术已启用、普通玩家 HUD 可见、登录／QA／GM UI 不可见、没有账号会话且不保存档案。

六份 capture JSON 已在当前取证 harness 收口后于 `2026-07-22T22:54:37Z..22:54:57Z` 重录，并与 manifest 中的截图／报告哈希一致；这解决了旧证据早于 harness 的 freshness 问题。它们仍只是 `owner_review_pending` 工程证据，既没有项目所有者验收，也没有 Computer Use 操作通过，不能写成正式美术发布 PASS。

证据集合为：

- 火芽训练场 idle + moving；
- 火芽村口 idle + moving；
- 雾帽湿地 idle + moving。

六张 PNG 均按 1280×720 输出，每张对应独立 capture JSON；bundle manifest 同时记录 PNG 与 capture JSON 的 SHA-256：

| 地图／模式 | 格子与输入 | PNG SHA-256 | capture JSON SHA-256 |
| --- | --- | --- | --- |
| 训练场 idle | `[14,12] → [14,12]` | `d478e08ccdceaa2e9ab1db402d3120e8743bd3fa1bb6831fb84eebabae0114b6` | `f99db799a38032c40f944cc563d9348838d708d0f17cb1f7cb13fcff273e638d` |
| 训练场 moving | `[14,12] → [17,9]`；press/release frame `9/11` | `60fcbab67f9bdbbc4f21bad4549683e445aa5c97762496d53732b1ac245554cf` | `084c7ae716b9c9b2667d957c07cb13ed6edfd801c02222a05ba80d84f7076f3b` |
| 村口 idle | `[3,15] → [3,15]` | `a8780cf085336f1c778f55945b65fe5a1a1f7d28fea30515dd6a90e673ea9bee` | `c094f3d2c22e6fae1c38e09ee3ce5d58dac0b70c39c777f2c4628aedb19611c2` |
| 村口 moving | `[3,15] → [6,12]`；press/release frame `9/11` | `c59d3cb0777dd79ef7a7fff782d5a7cb5333d0d96520221773177500076e19fa` | `7ee4e947bfd3ab53449121817a3dffd919dcc380b4986d6b59355802f06a591e` |
| 湿地 idle | `[4,22] → [4,22]` | `7adbf5f4ae1f96ae246839291f6a7634f2f979e8ab6f1213f149d0f182203425` | `cb14c3122279fbe4d43be0aaf3fabaee7fd7d140bd4618a41fee5b8dc21c4164` |
| 湿地 moving | `[4,22] → [7,19]`；press/release frame `9/11` | `592ef453ac0a8b52d70d78c22b5dc2f557302cc8a46f8b6a3219c6439b4ffb53` | `e6837b78e53b2c9b9e4dcb7007339085f02d980b89862c2bf1528db5ae837e4c` |

bundle 级冻结引用如下；哈希均已与当前文件实算值一致：

| bundle | provenance | catalog contract | collision report | performance report |
| --- | --- | --- | --- | --- |
| 火芽 | `044eb1b6f65a793e1a5c6689da789f0f35eeade54b1311cd55c9dbb1dbbd1c33` | `3c1cccabde1c376227330e27bcdecc6a355c5a2a40a773e7f8a3cea3a2ee22b8` | `5e98974d5965c7d548a6a32d062ab67c9748e8e4652145446fe2a7f0c47c4e45` | `cfbd2d93580841d81fa6a6beaa2c04a08b4a91af376151ab09a33274831b427d` |
| 湿地 | `fd8cf81d141649069206bc4e001bc51e751e83cce8b199287e3237285d6744ed` | `fb1182f0e1935e00fd031cefbf69896f24c6d0889a52daabc944d8974d448465` | `08feaa8b8b3545d070c6e32621a67f57f6b23db05ece255bf94c47fd4751538c` | `de2192d3d3df7371729396c75d51db23e5590f25bae2e5b314724dbaeded7ccf` |

需要特别区分：以上是 Godot 内真实输入事件和真实 `Main.tscn` 证据，不是 Computer Use 证据。

## Computer Use 结果

本阶段按用户要求调用了 Computer Use。本轮用 `open -na` 启动真实 Godot Metal 窗口后，`list_apps` 已能把 Godot 列为 `isRunning=true`；初次按 bundle id 和完整应用路径调用 `get_app_state` 均返回系统级 `cgWindowNotFound`。最终复核曾成功读取一次真实 Godot 地图窗口单帧，但随后操作目标切换到项目管理器，无法稳定保持对游戏窗口的控制，因此仍没有完成基于 Computer Use 的地图交互矩阵。这个结果只能记为窗口捕获／目标绑定不稳定，不能解释成某张地图或 Godot 场景通过了人工验收。

用于排查的额外 Godot 进程已经清理，项目资产没有依赖它。两个 bundle 的 `computerUseReport` 必须继续保持 `null`，不得手写或伪造 PASS。Computer Use 可用后仍需从普通 `Main.tscn` 实际完成：训练场移动、村口路径／NPC hover、进入湿地、检查遭遇地表、返回村口，以及遮挡和地图边缘观察。

## 发布阻断与已知视觉问题

当前工程候选仍有七项明确的发布阻断／证据缺口：

1. **高物件没有与人物统一 y-sort。** 环境物件目前只在自己的集合内按 y 排序，没有和玩家、宠物、NPC、远端玩家进入同一最终世界排序队列。服务亭等高物件因此尚未证明前后穿行遮挡正确；在统一 y-sort 和跨帧遮挡视频通过前，不得把 `sort.mode=y` 当作完整发布能力。
2. **火芽村口存在地图边缘黑角。** 默认出生／相机视口能看到逻辑地图 footprint 外的明显暗色三角区域。这不是贴图 hash 或碰撞错误，而是地图 footprint 与 camera framing 尚未收口；正式发布前应通过地图边界美术、相机约束或经批准的 topology 调整解决，不能用 HUD 或临时色块遮住。
3. **雾帽湿地尚缺第三张遮挡／过渡证据。** 当前只有 idle 与 moving 两张真实 Main 截图；正式 owner packet 仍需补一张能证明湿地物件遮挡或村口往返过渡的证据，并与同一冻结像素／build 绑定。
4. **Computer Use 仍被窗口捕获／目标绑定不稳定阻塞。** 初次 `get_app_state` 返回 `cgWindowNotFound`，最终复核虽读取到一次真实游戏窗口单帧，但无法稳定保持交互目标并完成矩阵；`computerUseReport=null`，不能把该单帧或脚本截图替代用户要求的 Computer Use 验收。
5. **外部 chroma helper 未纳入仓库。** provenance 已冻结外部 `remove_chroma_key.py` 的绝对路径与 SHA-256，但 `repositoryOwned=false`；正式发布前必须 vendoring 或提供同等可审计、可复现且不依赖单机绝对路径的工具链。
6. **collision／performance 报告缺原始回执与 runner／build identity。** 当前汇总值和 manifest 哈希可复验，但报告没有原始命令输出回执、runner 身份或冻结 build 身份；静态 auditor 因此只给工程 `PASS`，同时明确 `releaseReady=false`。
7. **runtime 生命周期只信四个 manifest 字段。** 当前只核对 `status / ownerReviewStatus / releaseApproved / runtimeEnabled`，没有读取并核验 owner decision 或 release attestation。pending 的失败关闭已成立，但 released 路径在增加证据绑定门禁前不能视为正式安全发布能力。

这些问题存在时，即使静态 bundle auditor、玩法合同和基础性能全部通过，也只能停在 `owner_review_pending`。

## 最终验证记录

下表区分工程门禁与正式发布门禁。capture 已在当前 harness 后重录；catalog contract 也完成生成、manifest 哈希回填与默认 strict 复验。collision／performance 报告指向当前最终 atlas 并能通过汇总审计，但仍缺原始 runner 回执与 runner／build identity，所以只能作为工程候选证据，不能作为 release-ready 证明。

| 验证 | 当前证据状态 |
| --- | --- |
| Skill 结构与三个脚本编译 | 官方 `quick_validate.py` 因本机 Python 缺少 `PyYAML` 未能运行；回退验证为 Ruby Psych 成功解析 `agents/openai.yaml`、Markdown fence 配对 PASS，3 个脚本 `py_compile` 通过 |
| `audit_map_bundle.py`：火芽 bundle | 工程 PASS；31 files／10 JSON／18 PNG，0 error／1 release-readiness warning，`releaseReady=false` |
| `audit_map_bundle.py`：雾帽 bundle | 工程 PASS；20 files／7 JSON／11 PNG，0 error／1 release-readiness warning，`releaseReady=false` |
| catalog contract 生成闭环 | PASS；显式 generate → manifest 报告哈希回填 → 默认 strict 重跑；火芽 `3c1cccab...`、湿地 `fb1182f0...`，无覆盖／非法参数／登录参数负例均失败关闭 |
| JSON 解析、SHA／尺寸复验、`git diff --check` | PASS；map JSON 全量解析通过，bundle auditor 复验 SHA／PNG 尺寸，提交范围 diff check 通过 |
| `godot --headless --path client/godot --scene res://scenes/Main.tscn -- --auto-map-visual-runtime-check` | PASS；3 图 `errors=[]`、`imageFallbackLoads=11`，全部命名 spawn、warp 来源、非手动 encounter 入口均通过精确可达性门禁，普通 pending 禁用、QA preview 启用 |
| 取证命令携带登录参数负例 | PASS；命令以 exit `2` 拒绝 `--login`，报告为 `accountAuthenticated=false`、`networkRequestAttempted=false`，未进入认证启动路径 |
| `godot --headless --path client/godot --quit` | PASS |
| parse / movement / mouse / camera / map visual / NPC collision / transfer / encounter / map panel / facility / region 定向回归 | PASS `12/12`；日志 `.run/phase330_map_visual_final_auto_checks/2026-07-22T23-43-10-264Z.log` |
| `Main.tscn` 三图 idle／moving 1280×720 捕获 | 当前 harness 后重录 PASS `6/6`；moving 均为跨帧 `Input.parse_input_event` 且格子精确变化，截图与 capture JSON 双哈希已回填 manifest |
| idle A/B 性能候选门槛 | PASS；legacy fallback → candidate：训练场 `.410→.302 ms`、村口 `.408→.288 ms`、湿地 `.342→.250 ms` |
| 真实跨帧 moving A/B 性能候选门槛 | PASS；legacy fallback → candidate：训练场 `.092→.292 ms`、村口 `.180→.472 ms`、湿地 `.116→.362 ms`；三图均低于 `.600 ms` 候选上限且增量低于 `.350 ms` |
| Godot、录制与临时 QA 进程清理 | PASS；最终 `ps` 进程名检查无 Godot／ffmpeg／录制进程 |
| Computer Use 窗口交互 | `BLOCKED`；初次 `get_app_state` 为 `cgWindowNotFound`，最终复核读取到一次真实游戏窗口单帧，但无法稳定保持交互目标或完成操作矩阵；`computerUseReport=null`，未声称 PASS |

没有运行完整本地 CI；这批地图应以资产只读审计、外部地图权威检查、Godot parse、定向地图／交互回归、真实 Main 截图和冻结构建性能组成当前最窄充分门禁。

## 项目所有者验收边界

发布前，项目所有者至少需要查看同一冻结 build 的训练场、村口和湿地证据，并确认：

- 火芽与湿地的地域身份、色彩和材质明显不同，但人物、NPC、宠物和物件比例属于同一个世界；
- 道路、广场、warp 和遭遇地表不看调试文字也能读懂；
- 地表无明显 atlas 接缝、生成噪点、脏边或 baked actor；
- 村口黑角已消除，高物件前后遮挡可信，湿地第三张过渡／遮挡证据已补齐；
- capture、collision、performance 与 catalog contract 均在同一冻结 Git tree／build 上重录，并冻结相关代码、catalog 与资产哈希；
- 正常玩家运行只在 owner decision 与 release attestation 生成后才启用当前冻结像素。

用户明确批准前，不创建 owner acceptance／release attestation，不把 `runtimeEnabled` 改为 true，也不把本阶段工程通过写成美术发布通过。

## 未改变与仍未完成

- 未改变三张权威地图的 grid、spawn、blocker、NPC、interaction、warp、encounter、任务、奖励或服务端数据。
- 未修改协议、数据库、玩家档案、经济或战斗规则；QA 捕获不登录账号也不写真实存档。
- 这只是首个城镇／野外连通试产，不代表其他村庄、路线、洞窟、庄园和战斗背景已完成。
- P2.1 世界图、碰撞与寻路可玩化，以及 P2.2 原创高清 2.5D 正式美术均继续保持未完成。
