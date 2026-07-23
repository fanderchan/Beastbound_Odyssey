# 作者侧八向与身份复核（非盲审）

- `appearanceId`: `npc_village_civilian_f_v1`
- 接受身份板：`identity/identity-board.png`
- 接受身份板 SHA-256：`fa581d6577e8a7aead8f6c17f380b49f5094ff1762a37b9cef1529d808b16eeb`
- 接受世界 raw：`source/world-idle-2x4-raw.png`
- 接受世界 raw SHA-256：`fef6859ee24e2fb6fc08db5a62cbf8e8cca66b6658ad882fe9d1c2ba4566aa8e`
- 接受人像 raw：`source/portrait-2x2-raw.png`
- 接受人像 raw SHA-256：`8218a1656ae57fba296f3f7633417f97e09334c44a12efa5666a72ecaf867c1d`
- 拒绝身份板：`source/rejected/identity-board-v1-wrong-flask-side.png`
- 拒绝身份板 SHA-256：`61e2c404e8309e56884d1d4c4b1a9a865f937b73781be3c18d108773384a3512`
- 拒绝世界 raw：`source/rejected/world-idle-2x4-v1-cell-edge-contact.png`
- 拒绝世界 raw SHA-256：`2380039d0713459360d10fafb9fc1c803aeaa6d03fcf7c45e22dae17e4f204c3`
- 正式生产包：`source/formal-production/npc-bundle-v3.1-20260723-7615f286`
- 透明 contact sheet SHA-256：`b0ada68aa21d289605fdbb68ed5b3f831de717c8dc5224d2b31c064304921511`

本记录只确认生产者看到了实际像素并冻结当前候选；它不是打乱文件名后的独立盲审，也不能把状态提升为 `owner_review_pending` 或 `approved`。

## 角色一致性

- 八格均保持同一暖棕肤色、柔和方圆脸、深棕低位粗辫、赭黄短衣、米白内搭、蓝绿色单肩披巾、砖红围裙裙摆、深色绑腿与短靴。
- 封口陶葫芦始终挂在人物自身右髋；单肩披巾始终从人物自身左肩斜过身体。它们随身体旋转而改变屏幕侧，没有通过改名或镜像补方向。
- 八格均为同一成熟女村民；未出现第二人物、宠物、武器、职业柜台、金币、药瓶、卷轴、任务标记、现代制服、文字或水印。
- 世界页与身份板、人像页的脸型、发型、服装层次和主色一致。人像四格保持相同机位、裁切与服装，分别可读为 `neutral / speaking / smile / concerned`。

## 逐格作者检查

| 顺序 | 候选方向 | 作者侧可见事实 | 当前结论 |
| ---: | --- | --- | --- |
| 1 | `south` | 完整正面，脸、胸口与双脚朝下；人物自身右髋葫芦位于画面左侧 | 候选保留 |
| 2 | `southwest` | 正面偏左的三分之四视角，鼻尖、胸口与脚尖整体朝画面左下 | 候选保留，独立盲审复核 |
| 3 | `west` | 清楚左向侧身，脸与脚尖朝画面左侧 | 候选保留，独立盲审复核 |
| 4 | `northwest` | 背面偏左，后脑与辫子占主视图，同时露出人物左侧轮廓 | 候选保留，须与 `northeast` 对照盲审 |
| 5 | `north` | 完整背面，不露正脸，辫子居中，双脚朝上 | 候选保留 |
| 6 | `northeast` | 背面偏右，与西北格的侧面暴露和脚尖方向相反 | 候选保留，须与 `northwest` 对照盲审 |
| 7 | `east` | 清楚右向侧身，脸与脚尖朝画面右侧 | 候选保留，独立盲审复核 |
| 8 | `southeast` | 正面偏右的三分之四视角，鼻尖、胸口与脚尖整体朝画面右下 | 候选保留，独立盲审复核 |

## 透明与轮廓检查

- 世界 8 帧与头像 4 帧均含透明和可见像素，透明区的隐藏 RGB 已规范化。
- 世界页 75 个、头像页 272 个分类组件均有逐组件决定、审片者和带时区时间；未使用缺省跳过或大小豁免。
- 12 帧在 `alpha >= 16` 的静态 detached-foreground 检查中均只有一个主要主体且无阻断组件。
- contact sheet 未见洋红边框、跨格残片、第二主体或被削断的脸、辫子、披巾、手脚、裙摆和葫芦。

## 后续门禁状态

- 随机打乱展示、隐藏文件名与方向标签的独立 Stage A v2 已冻结并通过；八个匿名展示被唯一识别为规范八方向。
- 真实 Godot 三进程方向取证均为 12/12，通过同一 `sourceSetSha256`；录像为 1280×720、30fps、361 帧并完整解码。
- 独立 Stage B v2 已确认四头像身份/裁切/表情一致，以及真实 `Main.tscn` 中 `firebud_training_yard / overlap_tester` 的世界像与对话人像可见。
- producer-only 合并器已私下解盲并生成通过的 blind audit v2；旧版 `staged-review/` 因把冻结枚举误写为 `passed` 而被 fail-closed 拒绝，未覆盖或冒充正式结果。
- 项目所有者尚未接受本次冻结证据；不得创建 owner decision、release attestation，或把 catalog/runtime 标为已发布。
