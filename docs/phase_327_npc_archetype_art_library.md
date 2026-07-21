# Phase 327：NPC 职业原型候选库、真八向与人像生产门禁

日期：2026-07-21—22

## 本阶段结论

本阶段把 NPC 美术从“每个有名字的 NPC 各做一套模型”收口为“同职业复用一个外观原型”：`npcId` 继续拥有姓名、地图、位置、对话、服务、任务和碰撞，`appearanceId` 只拥有可跨村庄复用的职业人物、真八方向世界图、人像、比例与锚点。新增村庄、改名或更换台词都不能成为复制模型的理由；只有职业、等级、阵营、年龄层或经项目所有者确认的区域视觉确实不同，才允许建立新版本外观。

当前目录登记 8 类静态职业原型，男女各 4 类，并已把 26 个现有 NPC 实例映射到这些共享外观。每类目标矩阵是 8 张独立创作的 `idle-1` 世界图与 `neutral / speaking / smile / concerned` 4 张同一人物人像；任何运行时或离线镜像都被禁止。

8 类原型的工程生产与冻结证据现已全部完成：8 个 immutable production bundle、96 张安装图、真实 Godot 八方向录像、真实 `Main.tscn` 截图、两阶段独立盲审、严格目录门禁和性能检查均通过。自动流程只把它们推进到 `status=owner_review_pending`；所有条目仍保持 `ownerReviewStatus=pending`、`releaseApproved=false`、`runtimeEnabled=false`。未得到项目所有者对当前冻结像素和证据的明确接受前，不生成 owner decision / release attestation，不把资产开放给正常玩家运行，也不勾选 P2.2。

## 为什么按职业复用

成熟村庄型 MMORPG 需要玩家迅速认出“这里能存钱、买东西、治疗或管理宠物”，但并不需要每个村庄的同岗位 NPC 都拥有一套新模型。Beastbound 采用以下边界：

```text
npcId        -> 姓名、地图、位置、对话、服务、任务、日程、碰撞
appearanceId -> 职业人物、真八向世界图、四种人像、比例、锚点、导入与发布状态
facing       -> 当前实例使用的一张规范方向图
portraitState-> 当前对话使用的人像表情，默认 neutral
```

这样做的直接收益是：

- 玩家能用稳定的服装、轮廓和职业道具识别服务类型；
- 同岗位跨村庄复用，新增地图不再重复生产和审查同一种人物；
- 方向、比例、人像和发布证据只需在一个 `appearanceId` 上冻结，修复也不会散落到多个名字副本；
- 地图数据只引用 ID，不包含纹理路径，现有服务、碰撞和交互逻辑保持独立。

StoneAge 仅作为成熟职业复用思路的行为参考，不复制其代码、数据、名称或美术。

## 8 类职业原型

本批全部是不会巡逻的静态服务 NPC，因此不伪造无意义的四帧行走。若未来某岗位真正获得巡逻行为，必须在同一身份基础上制作并单独审查八方向 `walk-1..4`，不能把静态帧重复命名成行走。

| appearanceId | 玩家可读职业 | 性别呈现 | 职业识别重点 | 本批目标 |
| --- | --- | --- | --- | --- |
| `npc_stable_keeper_m_v1` | 兽栏管理员 | 男 | 饲料袋、牵引绳、耐磨工作装 | 真八向静态世界图 + 四表情人像 |
| `npc_bank_keeper_f_v1` | 银行管理员 | 女 | 账本、钱袋、整洁柜台制服 | 真八向静态世界图 + 四表情人像 |
| `npc_item_shopkeeper_f_v1` | 杂货商 / 道具场商人 | 女 | 分格货篮、腰包、取货围裙 | 真八向静态世界图 + 四表情人像 |
| `npc_manor_steward_m_v1` | 庄园管事 | 男 | 管事服、登记册、庄园职责感 | 真八向静态世界图 + 四表情人像 |
| `npc_village_guard_m_v1` | 村庄守卫 | 男 | 轻型守卫装、长矛、警戒轮廓 | 真八向静态世界图 + 四表情人像 |
| `npc_village_healer_f_v1` | 村医 | 女 | 药囊、草药、治疗职业层次 | 真八向静态世界图 + 四表情人像 |
| `npc_equipment_artisan_m_v1` | 装备工匠 | 男 | 工匠围裙、锤具、护具材料 | 真八向静态世界图 + 四表情人像 |
| `npc_riding_trainer_f_v1` | 骑宠导师 | 女 | 骑乘护具、缰绳、训练姿态 | 真八向静态世界图 + 四表情人像 |

已安装总量为 `8 archetypes × (8 world + 4 portraits) = 96/96` 张运行图，其中世界图 64 张、人像 32 张。production source 到安装图的 byte/hash parity 全部通过；这证明工程完整性、方向语义和运行一致性，不替代项目所有者的审美验收。

## 26 个实例如何复用

当前地图数据共有 26 个 NPC interaction 引用上述外观，不按名字或地图复制素材：

| appearanceId | 实例数 | 复用范围 |
| --- | ---: | --- |
| `npc_stable_keeper_m_v1` | 1 | 火芽村兽栏管理员 |
| `npc_bank_keeper_f_v1` | 1 | 火芽村银行管理员 |
| `npc_item_shopkeeper_f_v1` | 10 | 火芽村杂货商 + 9 个庄园道具场商人 |
| `npc_manor_steward_m_v1` | 9 | 9 个庄园各自的庄园管事 |
| `npc_village_guard_m_v1` | 2 | 火芽村入口守卫 + 训练场挡路门卫 |
| `npc_village_healer_f_v1` | 1 | 火芽村村医 |
| `npc_equipment_artisan_m_v1` | 1 | 火芽村装备工匠 |
| `npc_riding_trainer_f_v1` | 1 | 火芽村骑宠导师 |
| **合计** | **26** | **8 个共享职业外观** |

9 个庄园是 `firebud`、`training`、`beast_pen`、`ember_core`、`tide_echo`、`gale_breath`、`earth_vein`、`shadow_oath` 与 `artisan`。每个庄园的 NPC 仍保留自己的 `npcId`、地图、台词和服务入口，只共享杂货商或庄园管事的职业外观。

## 真八方向与四表情合同

世界图使用固定顺序：

```text
south, southwest, west, northwest, north, northeast, east, southeast
```

八个方向必须分别创作。禁止 `flip_h`、负 X 缩放、shader UV 翻转、离线镜像、把相邻斜向改名，以及“idle 方向正确但同栏运动轴错误”。静态岗位每方向只有 `idle-1`；未来移动岗位才增加每方向 `walk-1..4`。

人像状态固定为：

- `neutral`：默认对话状态；
- `speaking`：实际发言时显示；
- `smile`：友好或完成服务时使用；
- `concerned`：提醒、拒绝或风险语境使用。

四张人像必须是同一人物、服装、镜头、裁切和光照，只允许表情变化。缺少可选状态时可明确回退到本外观的 `neutral`，绝不能回退到另一个职业或另一个人。

## 生产 Skill 与来源规则

NPC 生产规则集中在：

- `.agents/skills/design-beastbound-npcs/SKILL.md`
- `.agents/skills/design-beastbound-npcs/references/production-contract.md`
- `.agents/skills/design-beastbound-npcs/references/bundle-schema.md`
- `.agents/skills/design-beastbound-npcs/scripts/audit_npc_bundle.py`

核心规则包括：

1. 先锁一个职业身份板和职业识别，再扩四个正方向、真八方向与表情；身份通过不能替代方向通过。
2. 保存逐字 prompt、工具/模型、时间、无损原稿、来源/权属、可替换路径和所有处理参数。
3. 色键透明处理必须从未改动原稿产生可重放 mask；只允许修改被 mask 选中的背景及有明确记录的窄边缘，不得用全图色相删除伤害紫色服装、草药、半透明边缘或深色轮廓。
4. 完全透明像素的 RGB 归零；部分透明像素保留。原稿/安装使用完整 decoded RGBA 哈希，Godot import parity 另使用规范化 RGBA 哈希，避免把两个哈希域混为一谈。
5. 生产 bundle 先只读审计，随后把 byte-identical 运行图安装到目录声明的路径；运行时不得读取生产原稿或证据目录。
6. 自动检查最多推进到 `owner_review_pending`，不能替项目所有者做视觉批准。

## 运行集成边界

`client/godot/data/npc_appearances.json` 是外观目录。地图 interaction 只提交 `appearanceId`、`facing` 和可选 `portraitState`；`NpcArtCatalog` 负责一次性解析、按 `(appearanceId, action, facing, frame)` / `(appearanceId, portraitState)` 缓存纹理、比例与锚点，绘制热路径不扫描目录、不解析 JSON、不缩放源图，也不做方向镜像。

候选包只能通过 debug build 的显式 QA preview 通道预热。正常玩家路径只允许完整批准且具有仓库内轻量 release attestation 的外观；候选纹理缺失或未获权限时使用明确安全的占位行为，不借用另一个职业冒充。

对话人像由独立 presenter 接入真实 interaction dialog。发言中的 NPC 使用 `speaking`，而不是无条件显示 `neutral`；正常玩家 UI 不出现方向箭头、哈希、路径、审计状态、QA 按钮或代理说明。

## 匿名方向复核

方向复核不能让审片者从文件名、目录、箭头、标签或安装哈希抄答案。正式流程拆成严格的 Stage A / Stage B：

- Stage A 只向独立审片者开放随机顺序、opaque 文件名的八方向图片；packet 只公开 `presentationIndex`，不含方向名、源路径、安装路径、人像或 Main 截图。审片者逐项提交 `presentationIndex -> classifiedDirection + observation`，冻结并哈希报告后才允许进入下一阶段。
- Stage B 在 Stage A 报告冻结后，才向同一审片者开放四张人像与一张真实 Main 截图；它仍不能读取方向答案或生产者 mapping，只判断同一人物、四种表情、职业识别、世界/人像一致性和正常玩家 UI。
- 生产者私有 mapping 绑定 packet、当前 12 张安装图、来源集合、shuffle seed 与真实方向。两个阶段报告都冻结后，才由生产者 combine / deblind；八方向必须一一覆盖且语义正确，任何失败或模糊都把受影响原型退回 `in_production`。

本批由 4 个新建、互相独立的审片上下文各负责 2 类原型；Stage A 的 64/64 个方向全部通过、0 fail、0 ambiguous，Stage B 的 32/32 张人像与 8/8 张 Main 截图全部通过，最终 combined audit 为 8/8。

## 真实 Godot 证据

方向评审必须来自 `res://scenes/qa/NpcDirectionReview.tscn` 的真实 Godot 纹理路径，连续展示八个方向，并在录像前、录像进程与网格进程分别验证当前源 PNG、Godot import 和实际加载纹理的一致性。MP4 必须是可完整解码的 1280×720、30 FPS 连续录像；联系表只是索引，不能代替逐张原图和视频检查。

每个原型还必须通过真实 `res://scenes/Main.tscn` 截图。取证使用无账号、不可写档的临时默认档案与显式 QA preview，把人物放到真实地图交互距离后调用正常的 NPC 对话入口。报告必须冻结：

- `mapId`、`npcId`、精确 `appearanceId` 与 `facing`；
- 8 张世界图与 4 张人像的当前来源/加载哈希；
- 1280×720 截图路径、文件哈希和 decoded RGBA 哈希；
- `worldVisible=true`、`portraitVisible=true`、真实对话框可见；
- 对话框实际显示目标 `speaking` 人像；
- 正常玩家 UI 可见，登录、GM、QA、debug 控件不可见，按钮均在对话框边界内。

## Release attestation 与 owner decision

严格外部证据只在明确 QA / promotion 阶段读取和验证。正常玩家启动不得遍历 `.run`、绝对来源归档或证据目录，不得解码整套源图，也不得启动 `ffmpeg/ffprobe`；正式运行只验证仓库内的轻量 attestation 与当前安装文件哈希。

批准顺序是 fail closed 的：

1. bundle、三次 Godot parity、录像、匿名方向/人像审查与真实 Main capture 全部通过并冻结哈希；
2. 目录最多进入 `owner_review_pending`，仍为 `releaseApproved=false`、`runtimeEnabled=false`；
3. 项目所有者明确接受当前冻结证据后，才创建该外观的 `release-owner-decision.json`；它必须绑定精确 `sourceSetSha256`、`runtimeEvidenceIndexSha256` 与完整 `acceptedEvidence`；
4. 随后生成 `release-attestation.json`，绑定 owner decision、严格证据摘要与 12 张当前安装图；目录才可以同时改为 `status=approved`、`ownerReviewStatus=approved`、`releaseApproved=true`、`runtimeEnabled=true`；
5. 任一证据、owner decision、attestation 或安装文件哈希漂移，正常运行立即拒绝加载该外观。

候选流水线不得预先创建空白、代理签名或自我批准的 owner decision。项目所有者拒绝某一原型时，只退回受影响原型并重新制作、取证和审查，不借旧决定批准新像素。

## 最终验证状态（工程通过，owner pending）

统一冻结 `runId=phase327-final-v31r2-20260722-a`。方向 evidence index 为 `.run/evidence/phase327_npc_archetype_art/candidate/phase327-final-v31r2-20260722-a/evidence-index.json`，SHA-256 为 `3613f0e939a06ed2e425b1bec76cf439ef920cb6c4a8f52e1c1e705cc20e6326`；Main evidence index 为 `.run/evidence/phase327_npc_archetype_art/main-review-candidate/phase327-final-v31r2-20260722-a/evidence-index.json`，SHA-256 为 `9564834a2de0af83a73cd9be8d7d5b52e9618d625581a1645aedd636cd7cfdb0`。

| 门禁 | 最终记录 |
| --- | --- |
| 8 个 immutable production bundle 及只读审计 | 8/8 通过；每包只读 auditor 与 source→installed byte/hash parity 均通过，不引用旧候选或 rejected 包 |
| 安装矩阵 | 8 类各 `8 world + 4 portraits`，合计 `96/96` |
| Python 工具 | builder suite `48/48`；录像、Main、blind/evidence 工具 `39/39`；auditor self-test PASS；Skill quick validate PASS |
| Godot 最终回归 | `godot-parse` 加 7 个 NPC/facility 定向 flags，`8/8` 通过，43.391 秒；日志 `.run/godot_auto_checks/2026-07-21T19-53-23-141Z.log` |
| 三进程 source/import/loaded parity | preflight `96/96` + recording `96/96` + grid `96/96` = `288/288` |
| 八段方向 MP4 | 8/8 均为 1280×720、H.264、30 FPS、361 帧、12.033333 秒，完整解码通过 |
| 真实 `Main.tscn` | 8/8 capture；每份 `12/12` frame parity；`worldVisible/portraitVisible/normalPlayerUi=true`、`debugUiVisible=false` |
| Stage A 独立方向盲审 | `64/64` 方向通过，0 fail、0 ambiguous；报告先冻结再开放 Stage B |
| Stage B 人像与 Main 盲审 | `32/32` 人像 + `8/8` Main 通过；combined audits `8/8` |
| idle / moving / 真实输入性能 | idle 稳态样本中位 `0.34ms`、p95 `0.52ms`；移动中位 `0.17ms`、p95 `0.30ms`、`status=ok`；321 次连续点击中位 `0.31ms`、p95 `0.35ms`，`moved/coalesced/settled/final_match=true` |
| 项目所有者视觉决定 | `pending`；8/8 均 `releaseApproved=false`、`runtimeEnabled=false`，仓库中不存在 owner decision 或 release attestation |

冻结包路径与关键哈希如下。除兽栏管理员使用修订包 `-r2` 外，其余 7 类包名均为 `npc-bundle-v3.1-20260722-7615f286`；路径前缀统一为 `client/godot/assets/npcs/<appearanceId>/source/formal-production/`。

| appearanceId | immutable bundle | manifest SHA-256 | sourceSet SHA-256 | MP4 SHA-256 | Main screenshot SHA-256 | final audit SHA-256 |
| --- | --- | --- | --- | --- | --- | --- |
| `npc_stable_keeper_m_v1` | `npc-bundle-v3.1-20260722-7615f286-r2` | `841572b4e2b06f713ed5bbcc9274fe90de327bb61fb4601949e377d6d6b63caf` | `63118c63421d114541ff7901338bc2d6f322db04e1eabb5d0803e3b527e74d80` | `6c0af3018c01913424fd5ae7bea282ab9851c214383481ca18410d9c9c2eeb31` | `55b194e284f46e103dc7c46f875b689340466a9682987e64fa9259a47678dd09` | `c880ff67aa9e671716d450580cd59fba5f9910df675882e0ff41e6515cda6734` |
| `npc_bank_keeper_f_v1` | `npc-bundle-v3.1-20260722-7615f286` | `3881a790122891499d53c2d8f6955c08afe3fabb68b7c723688570fcc7d9346d` | `88a59bac6b34948fbff3fb003d6574a88c9918c808949bb3e00304e11719ac21` | `d12e2907b398f130f74d2ab0d24aed422ce3b7d18db0540128de0748f83460f2` | `d0fc6a8203f61db71d95bba55e6f6f6bf3af12bb8ad22f49ab5c3a7bc9df4c68` | `6b0f42b8f9b42d1003207d8e48d257cd80fcd0df703db90c39115d4a08195d77` |
| `npc_item_shopkeeper_f_v1` | `npc-bundle-v3.1-20260722-7615f286` | `4aca28aabda588c19dda3c4d53b4490e2596d5cf5f900f972ce1fa48e972a7e1` | `a2e46765c06fb21c71a2fcba1707eecd57c3d808a1a92bb751d6912431eaa1fd` | `929e8d395538edcb0abb48f32642f6a4a7ed5fdab26f9b1266e944bbf466bdd4` | `ddd6babcaeff305961b2b4049c1534c1d5894a61e83cdc97b873663e6a351743` | `d2a945955a56eacf17ebb27986fdf02d6d22316ee29f54c39f390ebd4ffee003` |
| `npc_manor_steward_m_v1` | `npc-bundle-v3.1-20260722-7615f286` | `4a0dd9a148486d158089349ffff721d0f3502277eceb619a7eb85d3ed1b7acd7` | `7e1942dbcf4c0c48ce4eaece1cc23ddaa88f3f0119d8ac8d3e6e0984cc81750e` | `3d4ee162e7d2490ef12bed8b3b29142715a50065e9a3b46dda1577eb0122b760` | `54f16907b038e86feef5d242cce22124537c0dbe76cd9b611e0fa8b3c944fb4d` | `90d04e744e7d7e9d24acf0b62ed4976b9ceefd55aa27e212b8e83d9e9fa989e9` |
| `npc_village_guard_m_v1` | `npc-bundle-v3.1-20260722-7615f286` | `19c45dae6e63d4aa6e9941818ae89b5d6de5e0119cf8f1c2bad7d5ea61333a23` | `c8aea00a898dc117dbd261188c8d64c72245d26474fe88c9b6c81695b5b6847c` | `386a7ac71ab3f8bd51f9d6ac112436d9170a6cfb5062845cb81df00b8ac1dc02` | `4e732e2491aaa9c0181c435c74f5374f4675d051c7b949c8fe8a1db0e95129f2` | `1bee6ad7a4abbcd91075d9e8902ea5b3b0a75c315461ac5b0a5f7892b344cc38` |
| `npc_village_healer_f_v1` | `npc-bundle-v3.1-20260722-7615f286` | `4672690b1a32171e8e4c1bd23d9beb8a10033a25f4f8dd3b3c7d89376eac7e6d` | `c354c6e48112027ab0ad8384a7d4d1e34bbfcb02fb36e0949f5dfdea4d5f33ee` | `64bd17d65365bda28894262e71c888574330a106125db069d29ba924965097b0` | `95966f737c3513dbe2355bd564b1c5b3d5c9ac3274153bcb916a4af93edaee71` | `c92b5cff38ee6245ec3298d39761712c247c9df9fcb29a987c358f2a774a0213` |
| `npc_equipment_artisan_m_v1` | `npc-bundle-v3.1-20260722-7615f286` | `ab94b0f4e72ee98870e93ce0fa7e3f816982c4137a397d1e924ecc965b8b78b4` | `0555fe26630d27bbfbfafe6bb7c2ed0ce24cee3750b8518d553e4780fd5ef243` | `508c0edb5b98cb97400b29bdc30ddedc3d7813edf9ec3f77aa42d62eff73bf23` | `3146486b2996529f592faeddfb0272bbaf06ee613d5878e342c8199aa8e07f12` | `f16e4f6ef975dffae50987c4a597da2917b35d76beffebe0e3e2aed34646fdd5` |
| `npc_riding_trainer_f_v1` | `npc-bundle-v3.1-20260722-7615f286` | `ac9ee726ec1c62af0a3b2b0b57dd030c747723f82bbf95bae862f8f81d8aec60` | `4664b2d00c13ebb0a4a5261339887be61d45714fd50879f686acccf8dc1a56c0` | `1ad06ffbd4773a5713d308ad83cd2723a22a70a8480087e14d71ac4bcf18a1b3` | `06b499f8244088023b78d2cd46513c5705d7f9670888a7e4596dcf5f402481fa` | `5503f92b59fc97712aa2f650a33c444b5312e2254db23f6b875c1fe59feb0e74` |

真实 Main 接入还发现并修复了一处玩家可见布局问题：四人像接入 `DialogPanel` 后，autowrap 对话文本把面板最小高度向上传播到约 1840px。现把正文放入高度受限的 `ScrollContainer`；8 张 1280×720 Main 截图确认世界人物、人像、对话、按钮均在正常窗口内，长文本可滚动，且没有 QA/debug UI。

## 仍未完成

1. 项目所有者仍需确认人物风格、职业识别、男女角色比例、世界比例、方向语义、人像一致性和整体审美，并明确接受当前冻结证据。
2. owner 接受后仍需生成并校验绑定当前 source set / evidence 的 owner decision 与 release attestation，才能把对应条目改为 approved/runtime enabled；当前二者均不存在。
3. 当前所有外观保持 `releaseApproved=false`、`runtimeEnabled=false`；本阶段不把候选美术开放给普通玩家，P2.2 继续未勾选。
4. 本阶段不改变 NPC 服务、任务、碰撞、经济数值、服务端、协议或玩家档案。
5. 巡逻/移动 NPC、昼夜换装、地区变体与额外工作动作不在本批范围；以后按真实玩法需求单独立项，不能用运行时随机换色制造“新模型”。
