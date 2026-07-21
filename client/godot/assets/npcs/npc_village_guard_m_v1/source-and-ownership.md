# 来源、权属与替换路径

- 本外观包于 2026-07-21 至 2026-07-22 为 Beastbound Odyssey 创建；身份板、真八向世界页和四表情人像页的创意像素均来自 OpenAI 内置 `image_gen`，没有以程序图形、SVG、Canvas 或手工占位图替代创意原稿。
- 本项目已有兽栏管理员和银行管理员素材只用于清晰轮廓、成人比例、暖色描线与受控赛璐璐明暗的画风参考；守卫的脸、编发、疤痕、轻甲、披风、石矛、盾牌与姿势均为新设计。
- 未输入、拼接、描摹或复制 StoneAge 的人物、贴图、代码、名称或数值；“石器灵感”只描述原创 2.5D 宠物 MMORPG 的可读性目标。
- 当前正式候选来自 `world-idle-2x4-v6-hard-edge-chroma-regeneration` 与 `portrait-2x2-v3-hard-edge-chroma-regeneration`。八个方向均为独立生成内容，不含离线镜像、翻转、旋转或运行时 `flipH`。
- 初版八向页曾交换两项斜后方向；后续候选曾出现侧向语义错误、超过旧 3px 轮廓合同的洋红污染，以及全不透明的伪棋盘“透明”结果。旧人像页还曾把相邻格盾牌碎片带入 `speaking` 与 `concerned`。这些原稿、拒绝原因与旧 bundle-v1/v2/v3 只保存在本地前期生产档案，且从未作为本次正式候选安装或冻结交付。
- 生成器实际输出全不透明近洋红背景而非均匀纯 `#FF00FF`。v3.1 正式去背只在同一原图冻结的边界连通区域、逐组件人工决定和逐组件 residual 修复遮罩内执行；禁止全图按色相删除。处理后 12 帧在 `alpha >= 16` 下各只有一个连通主体组件。
- 不可变生产包为 `source/formal-production/npc-bundle-v3.1-20260722-7615f286/npc-bundle.json`，manifest SHA-256 为 `19c45dae6e63d4aa6e9941818ae89b5d6de5e0119cf8f1c2bad7d5ea61333a23`。包内 8 张世界图与 4 张人像已逐字节复制到本职业外观根目录；`source/provenance.json` 也与包内 ledger 字节一致。
- 无损 raw、逐字提示词、身份板、生成 ledger、组件审片页、显式 mask、背景测量与哈希均封装在唯一正式包的 `source/`、`source/prompts/`、`identity/` 与 evidence 文件中。耐久替换必须从该冻结包出发，重新完整执行显式组件审查、不可变 bundle、只读审计、Godot 客户端证据、独立盲向审片和所有者审批门禁。
- 技术门禁、匿名八方向盲审、四人像复核和真实 Godot Main 截图均已通过；当前状态为 `owner_review_pending / ownerReviewStatus=pending / releaseApproved=false / runtimeEnabled=false`。自动结构审计、作者目检或代理复核都不能替代项目所有者审批；未生成所有者放行文件，也不会进入玩家运行时。
