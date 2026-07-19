# Phase 320：全宠物美术目录与身份/骑乘关键姿势门槛

日期：2026-07-19

## 本阶段结论

项目现有 34 个宠物形态已全部进入同一份数据驱动美术目录，并按 15 个生产骨架组登记。除既有芽耳布伊外，其余 33 个形态现各自具备：

- 宠物本体前 3/4、背 3/4、正面、侧面四张 512px 身份关键姿势；
- 见习猎人骑乘该形态的前 3/4、背 3/4 两张 512px AI 整图关键姿势；
- 身份锁、逐字生成提示、来源/归属、原稿哈希、处理参数和 owner review 状态；
- 明确的完整生产缺口：世界真八向 `idle 1 + walk 4`，以及双战斗视角的 12 类逐帧动作。

本阶段只是正式扩产前的身份与比例门槛，不把关键姿势冒充完整动画。33 个新形态均保持 `runtimeEnabled=false`、`ownerReviewStatus=pending`；P2.2/P2.3 和两条进化路线的正式资产门禁仍未开放。

## 统一目录与生产合同

`client/godot/data/pet_art_catalog.json` 是当前唯一总目录，登记 34 个 form、15 个 `artSkeletonId`、宠物/整图骑乘根目录、权属和 prompt 路径，并统一使用 Godot 运行时方向名：

`south / southwest / west / northwest / north / northeast / east / southeast`

不再引入带下划线的第二套别名，也不把水平镜像称为真八向。正式战斗动作合同固定为：

`idle / walk / attack / skill / hurt / defend / dodge / counter / stagger / knockaway / down / revive`

整图骑乘继续遵守 Phase 312/319：人物和宠物在生成阶段就是一个完整主体，禁止运行时或离线拼贴人物层与宠物层。

## 工具与失败关闭

- `tools/build_pet_art_bundle.py` 只负责透明化、连通域隔离、共享缩放、锚定、512/256 输出和边缘/残色/尺寸 QC，不创造或修改姿势。
- `tools/pet_art_batch_audit.py` 只读审计目录、metadata、真八向、动作帧数、唯一性、镜像和 mounted 单本体合同；未完成但未启用的包记为 pending，已启用包缺正式动作则阻断。
- `tools/finalize_pet_identity_gate.py` 把已有身份原稿归档为无损 WebP、验证解码像素哈希并生成标准 incomplete manifest；它不能生成姿势、启用运行时或代替 owner approval。
- 七个早期并行包（四个乌力、三个风狐）在总审计中暴露“图片存在但缺标准 metadata”，现已通过同一打包器收口；乌力权属路径按实际文件登记，没有复制或伪造来源说明。

批量并行中明确拒收并保留的错误候选包括黄色普通布伊狐化稿、红色普通布伊骑乘背姿方向错误稿、乌力/风狐越格稿；拒收稿不会进入运行目录。

## 工程自审与视觉证据

代表性总览：

- 普通布伊三形态：`client/godot/assets/pets/bui_normal_red_fire10/qa/bui-normal-three-form-pet-mounted-160px.png`
- 乌力四形态：`client/godot/assets/pets/wuli_normal_orange_fire10/qa/wuli-four-form-pet-mounted-contact-sheet.png`
- 风狐三形态：`.run/art_batch_phase320/driftfox_mounted/contact-sheet-160px.png`
- 六只转生幼兽：`.run/art_batch_phase320/rebirth_cubs/comparison-160px.png`
- 苔背兽、炽角兽、潮鳍兽、蓝人龙、转生 MM、四只成年转生兽、新手老虎和雷龙的分组联系表均保存在 `.run/art_batch_phase320/`。

视觉自审只确认身份、结构、骑手朝向、成人比例、跨骑接触和 160px 轮廓可读，没有宣称用户已认可风格。所有关键姿势仍等待项目所有者后续集中点评。

## 验证

- 目录登记：34 个 form、34 个宠物 metadata、34 个整图骑乘 metadata；登记的 identity/ownership/prompt/metadata 路径全部存在。
- 33 个新形态的批量审计为 `0 errors / 0 warnings`；缺少的世界与战斗逐帧资产全部明确记为 pending。
- 现有芽耳布伊是唯一 `runtimeEnabled=true` 的旧包；新严格合同如实报告其缺少 `skill/dodge/counter/knockaway/revive` 以及 mounted 战斗动作，共 7 个 release-blocking errors。本阶段没有降级规则、伪造空帧或关闭既有运行表现来掩盖这些缺口。
- Python 管线/审计/归档测试：`18/18` 通过。
- Godot parse 与 `--auto-pet-action-asset-check`：`2/2` 通过，确认 34-form catalog 可被真实客户端加载。
- JSON 解析、路径检查与 `git diff --check` 通过；本阶段不连接后端/MySQL，不修改玩家档案或玩法数值。

## 后续扩产门槛

下一步以蓝人龙作为第二只完整样板，因为它是直立双足体型，能验证管线不是只适用于芽耳布伊式四足小兽：

1. 宠物本体真八向世界行走；
2. 见习猎人骑蓝人龙真八向整图行走；
3. 宠物和整图骑乘各自的双视角 12 动作逐帧包；
4. 三方独立方向盲审、自动 QC、真实 Godot 10V10 动作导演和 MP4；
5. 样板通过后再按 15 个生产骨架组扩到其余形态，不能仅靠改色或复制帧冒充完成。

用户明确要求继续全量生产，因此该后续已经并行启动；Phase 320 的提交只封存目录、方法和身份关键姿势，不代表“所有宠物动画完成”。
