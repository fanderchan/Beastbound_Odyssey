# 来源、权属与替换路径

- 本外观包于 2026-07-21 至 2026-07-22 为 Beastbound Odyssey 创建；身份板、真八向世界页和四表情人像页的创意像素均来自 OpenAI 内置 `image_gen`，没有以程序图形、SVG、Canvas 或手工占位图替代创意原稿。
- 本项目已有兽栏管理员和银行管理员素材只用于清晰轮廓、成人比例、暖色描线与受控赛璐璐明暗的画风参考；村医的成熟面容、银灰编发、鼠尾草绿披肩、草药筒、药瓶与服装均为新设计。
- 未输入、拼接、描摹或复制 StoneAge 的人物、贴图、代码、名称或数值；没有现代护士帽、医疗十字、听诊器或宗教/魔法符号。
- 当前正式候选来自 `world-idle-2x4-v4-grid-safe-regeneration` 与 `portrait-2x2-v2-safe-outer-edge`。八个方向均为独立生成内容，不含离线镜像、翻转、旋转或运行时 `flipH`。
- 初版人像页因 `smile` 单元外侧边缘残留背景而否决；世界页候选曾出现主体洋红键色混入和中线触边污染。原稿、拒绝原因与旧 bundle-v3 只保存在本地前期生产档案，且从未作为本次正式候选安装或冻结交付。
- 生成器实际输出全不透明近洋红背景而非均匀纯 `#FF00FF`。v3.1 正式去背只在同一原图冻结的边界连通区域、逐组件人工决定和逐组件 residual 修复遮罩内执行；禁止全图按色相删除。处理后 12 帧在 `alpha >= 16` 下各只有一个连通主体组件；低透明度发丝抗锯齿像素不属于纯键色残留。
- 不可变生产包为 `source/formal-production/npc-bundle-v3.1-20260722-7615f286/npc-bundle.json`，manifest SHA-256 为 `4672690b1a32171e8e4c1bd23d9beb8a10033a25f4f8dd3b3c7d89376eac7e6d`。包内 8 张世界图与 4 张人像已逐字节复制到本职业外观根目录；`source/provenance.json` 也与包内 ledger 字节一致。
- 无损 raw、逐字提示词、身份板、生成 ledger、组件审片页、显式 mask、背景测量与哈希均封装在唯一正式包的 `source/`、`source/prompts/`、`identity/` 与 evidence 文件中。耐久替换必须从该冻结包出发，重新完整执行显式组件审查、不可变 bundle、只读审计、Godot 客户端证据、独立盲向审片和所有者审批门禁。
- 技术门禁、匿名八方向盲审、四人像复核和真实 Godot Main 截图均已通过；项目所有者于 2026-07-22 明确要求将当前冻结形象实装，现状态为 `approved / ownerReviewStatus=approved / releaseApproved=true / runtimeEnabled=true`。根目录 owner decision 与 release attestation 精确绑定冻结证据和 12 张安装图；任一绑定哈希漂移都会失败关闭。
