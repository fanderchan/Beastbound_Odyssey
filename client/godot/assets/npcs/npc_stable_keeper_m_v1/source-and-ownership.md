# 来源、权属与替换路径

- 本外观包于 2026-07-21 至 2026-07-22 为 Beastbound Odyssey 创建，创意像素均来自 OpenAI 内置 `image_gen`；未使用程序图形、SVG、Canvas 或手工绘制替代创意原稿。
- 输入的本地见习猎人身份板只用作项目画风、线条和成人比例参考；兽栏管理员的脸、发型、服装、道具和姿势均为新设计。八个世界方向均独立创作，运行时与离线流程均未镜像。
- “石器灵感”只描述原创 2.5D 宠物 MMORPG 的可读性方向，不输入、不拼接、不描摹 StoneAge 的人物、贴图、代码或名称。
- 产物为本项目定向生成的原创 AI 辅助资产；未发现第三方素材授权依赖。项目最终商业使用与权利判断仍服从仓库所有者政策和适用平台条款。
- 无损 raw、实际使用提示词、身份板、输入哈希和生成账本均封装在唯一正式包的 `source/`、`source/prompts/`、`identity/` 与 ledger 文件中。耐久替换路径为：按该冻结包重新调用内置图像生成，并重新通过方向、透明 provenance、Godot 与所有者视觉 gate。
- image_gen 实际输出的是全不透明、非均匀近洋红背景，不是纯 `#FF00FF`。正式 v3.1 流程对每个候选组件逐项记录 `repair-key-spill` 或 `retain-authored-color`；兽栏世界图为 30 修复/38 保留（121/73 像素），人像为 19 修复/19 保留（65/19 像素）。
- 旧 v3 因分类器漏掉残余紫幕被拒绝；首个无 `-r2` 的 v3.1 又因逐像素复核发现笑脸人像发梢外 `440f4098…` 紫红点而被拒绝。两者从未作为最终安装源，只保存在本地前期生产档案，不属于本次冻结交付。
- 当前唯一安装源是 `source/formal-production/npc-bundle-v3.1-20260722-7615f286-r2/npc-bundle.json`，manifest SHA-256 为 `841572b4e2b06f713ed5bbcc9274fe90de327bb61fb4601949e377d6d6b63caf`。冻结 builder SHA-256 为 `7615f2860454dd23b3d51a3974257e68cc00cdf5e801199957a3ee16cb598f4b`，独立 auditor SHA-256 为 `e7f5772dc2d3810d4854f5a60485db9cbb107cf41a48ec57e0eba027daecd38a`，auditor 结果为 PASS（世界 8 帧、人像 4 帧）。
- 最终包的 8 个世界帧与 4 张人像已逐字节安装到本外观目录；`source/provenance.json` 同样与最终包副本一致。正式包内联系表、QC、运行帧和账本构成可提交复核链，根级本地预览不作为证据。
- 技术门禁、64 项匿名方向盲审汇总中的本角色 8 项、四人像复核和真实 Godot Main 截图均已通过；项目所有者于 2026-07-22 明确要求将当前冻结形象实装，现状态为 `approved / ownerReviewStatus=approved / releaseApproved=true / runtimeEnabled=true`。根目录 owner decision 与 release attestation 精确绑定冻结证据和 12 张安装图；任一绑定哈希漂移都会失败关闭。
