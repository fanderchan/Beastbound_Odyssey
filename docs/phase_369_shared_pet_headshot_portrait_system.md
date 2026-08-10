# Phase 369：全宠物独立大头照与共享展示合同

## 结论

本阶段为当前 36 个宠物形态补齐了按专用独立构图合同生成的大头照：

- 正式 `pet_art_catalog.json` 内 34 个形态全部安装 `portrait/default.png`；
- 尚未进入正式运行目录的曜冠角兽、苔垒角兽 2 个融合形态，在各自隔离 `pet-root` 中完成同一合同；
- 36 张画像均按专用头部／上半身独立构图合同生成，不从身份全身图、世界帧、战斗帧或骑乘图裁切；精确／缩放复用门禁通过，但自动化不能证明语义独立性；
- 同一形态只维护一张权威大头照，供宠物底栏、成长阶段、已遇见图鉴、宠物蛋和骑宠资格证共同使用；
- 宠物页左侧主舞台继续使用正式高清全身身份图，不拿大头照替代全身展示。

项目所有者已经接受 Phase 368 的宠物页布局，但这不自动批准本阶段的新画像。36 张画像当前均为 `owner_review_pending`；工程检查通过只说明文件、来源绑定、像素合同和运行接线完整，不代表审美、角色语义或正式发布已经得到项目所有者认可。

## 玩家展示合同

### 共用一张权威画像

`PetPortraitArtCatalog` 只读取每个形态在 `pet_art_catalog.json` 中显式登记的 `pet.portraitPath`。路径必须严格等于当前 `pet.root/portrait/default.png`，并满足以下约束：

- 512×512 RGBA PNG；
- 位于专用 `portrait/` 目录；
- 禁止指向 `identity/`、`world/`、`battle/`、`mounted/` 或 `showcase/`；
- 加载结果按 `formId` 缓存，面板刷新和物品格绘制不重复扫描全目录；
- 缺失、路径漂移、尺寸错误或无法加载时失败关闭，不偷偷裁切其他资产补位。

共享消费者如下：

1. 宠物页底部横向卡带显示独立大头照；
2. `0转 / 1转 / 2转·进化·融合` 阶段按钮显示对应形态大头照；
3. 已遇见的图鉴条目显示大头照，未遇见条目继续隐藏名称与形象，只显示未知身份；
4. 宠物蛋按权威 `formId` 映射叠加对应大头照；
5. 骑宠资格证按权威可骑形态映射叠加对应大头照；
6. 普通背包物品和本期未纳入的驯宠证不会误用宠物大头照。

物品格仍保留原数量、名称和交互文字；画像只是视觉叠加，不改变物品类型、获得规则、使用规则或服务端权威。

### 主舞台继续显示完整宠物

宠物页左侧主舞台继续走独立的全身展示链，绝不使用大头照：33 个形态优先由 `PetShowcaseArtCatalog` 加载按 `formId` 登记的 512px 静态全身身份图；芽耳布伊因历史展示文件名不是 `formId`，当前由 `PetActionAssetCatalog` 使用正式 world／battle idle 全身图降级展示。大头照只服务于小尺寸识别场景，避免把头像放大成主展示，也避免为了底栏缩略图把完整宠物硬塞进小框。

## 生产与审计合同

项目宠物设计 Skill、JSON Schema、正式示例、校验脚本和测试已同步加入大头照要求。以后新增或正式交付宠物时，不能只做全身图和动作包，还必须同时提供：

- 独立生成的大头／上半身源图；
- 原始生成图、无损 WebP 归档、1024px 透明主图和 512px 运行图；
- alpha mask 与同次操作的 chroma eligibility mask；
- 逐字 prompt、身份参考图、生成结果、generation id 和相互绑定的 attestation；
- 来源、所有权、SHA-256、处理参数、紧凑尺寸 QA 联系表；
- 底栏、图鉴、宠物蛋、骑宠资格证等共享用途声明；
- `owner_review_pending` 状态，直到项目所有者明确验收。

`tools/build_pet_portrait.py` 只执行可重复的去底、受限边缘处理、完整构图适配和尺寸派生，不负责从现有全身图裁头像。写入采用无覆盖、原子安装和失败回滚；已经存在的正式文件不会被后到任务静默替换。

`tools/audit_pet_portrait_catalog.py` 默认执行 34 个正式形态加 2 个显式隔离融合形态的组合审计，检查：

- 文件完整性、尺寸、RGBA、透明角、主体覆盖率和边界；
- prompt、identity reference、生成结果、attestation 与当前字节的精确绑定；
- 原始图、主图、运行图、mask、metadata 和所有权哈希；
- 小尺寸联系表可重放；
- 与现有宠物根目录美术及其他画像之间的 exact/scaled-copy 重复防护；
- owner review 状态不能被本地脚本伪造为通过。

自动相似性审计只是防误用门禁，不能证明语义上一定为独立创作，也不能替代项目所有者审美验收。因此即使 36/36 组合审计通过，结果仍固定为 `releaseGate=false`、`semanticIndependenceVerified=false`、`ownerDecisionStatus=owner_review_pending`。

## 视觉返工与导入修复

首次全量联系表复核发现水灵转生兽在统一头像框内明显偏小：旧主体覆盖率约 `0.17`，低于同组形态。没有用运行时放大参数掩盖，而是重新生成独立构图并重走 prompt、generation result、attestation、dry-run、安装和全量审计；新运行图主体覆盖率为 `0.262493`，透明边距和同组视觉重量恢复正常。旧版 11 个文件完整移动到 `.run/pet-portrait-revisions/rebirth_beast_water_lv50-v1-backup/`，可恢复但不参与运行。

Godot 首次导入还暴露 8 个历史宠物根目录缺少 QA 忽略文件，导致高分辨率联系表被编辑器当成运行资源导入。构建器现固定写入 `qa/portrait/.gdignore`；缺失的 8 个目录已补齐。运行时仍只导入 `portrait/default.png`，QA 联系表不再进入游戏资源扫描。

## 验证

- Python 语法检查：`python3 -m py_compile tools/build_pet_portrait.py tools/audit_pet_portrait_catalog.py` 通过；
- 构建器／审计器单元测试：`81/81` 通过；
- Pet Design Contract 与终局路线测试：`29/29` 通过；
- 36 图组合只读审计：正式目录 `34/34`、隔离融合 `2/2`、总计 `36/36`，`errors=[]`；
- Godot 编辑器重导入通过，34 张正式运行画像均可加载；
- 最终 Godot 组合门禁为 `7/7`：parse、portrait catalog、shared consumers、growth、pet management、codex detail、codex list；
- 背包补充门禁为 `2/2`：parse 与 `--auto-backpack-check`；
- `git diff --check` 通过；
- 1280×720 实机截图：`.run/visual-review/pet-portrait-v1/runtime/pet-growth-1280x720.png`；
- 36 张安装结果总览：`.run/evidence/pet-portrait-36-installed-contact-v2.png`；
- 最终 Godot 回执：`.run/visual-review/pet-portrait-v1/godot-checks-final/`；
- 背包回执：`.run/visual-review/pet-portrait-v1/godot-checks-final-backpack/`。
- 不固定帧率、隔离用户目录的真实输入性能回执：`.run/visual-review/pet-portrait-v1/runtime/movement-spam-final.json`。

实机截图使用隔离 QA 宠物档案，其中等级和多项“爆”只用于覆盖成长页视觉，不代表自然玩家分布，也没有写入真实玩家档案或 MySQL。

当前 1280×720 实机截图直接覆盖主舞台、成长阶段与底部宠物卡带；图鉴、宠物蛋和骑宠资格证已通过真实 Godot 控件／映射门禁，但本阶段尚未另录三类消费者的逐页实机截图。因此这些入口只能记为工程接线通过，其小尺寸观感仍包含在本阶段统一的 owner 视觉待验收范围内。

## 性能与剩余边界

画像纹理按形态缓存，物品到形态的权威映射也按物品 ID 缓存；本阶段没有把 JSON 全量扫描、图片解码、目录遍历或网络请求放入 `_process`、`_draw` 或世界 HUD 热路径。

最终可见宠物成长页采样的 `process_total` 约 `0.13–0.14ms`。最后一次不使用 `--fixed-fps` 的真实 Metal 跨帧移动／点击压力检查，首个启动样本为 54.3 FPS，后续为 59.5–60 FPS；112 次点击全部接受，`avg/max input=2/5us`，四个样本 `process_total=0.24–0.47ms`。原始摘要已持久化到 `movement-spam-final.json`。这次没有运行完整 `tools/run_local_ci.mjs`，因为本项使用了画像管线、Godot 解析、六个宠物面板定向检查、背包检查和真实输入性能检查覆盖变更范围。

当前剩余工作只有项目所有者视觉验收：重点检查 36 个头像是否保持同一宠物身份、头身构图是否适合小尺寸、不同族系视觉重量是否一致，以及是否存在需要单独返工的形态。没有这一步，不能把新画像提升为正式美术批准状态，也不能据此勾选 P2.2。
