# 来源、权属与替换路径

- 本外观包于 2026-07-23 为 Beastbound Odyssey 创建，创意像素均来自 OpenAI 内置 `image_gen`；未使用程序图形、SVG、Canvas 或手工绘制替代创意原稿。
- 角色是约 36 岁、精瘦敏捷的男性宠技训练师；身份锚点为本人左前臂恰好七格的空白技能板、本人右髋技能石束和颈前短哨。形象不是战士、骑术教官或新手训练员；未加入武器、缰绳、鞭子、魔法、宠物或骑乘元素。
- 身份板、世界八方向和四表情人像均为本项目定向新设计。八个世界方向均独立创作；运行时与离线流程均未镜像。首张世界表的西南方向因朝向不够明确而拒绝，随后由 `image_gen` 独立重绘；后续两个版本因东南人物跨越源表分格边界而被替代，未进入正式包。
- “石器灵感”只描述原创 2.5D 宠物 MMORPG 的可读性方向，不输入、不拼接、不描摹 StoneAge 的人物、贴图、代码或名称。
- 产物为本项目定向生成的原创 AI 辅助资产；未发现第三方素材授权依赖。项目最终商业使用与权利判断仍服从仓库所有者政策和适用平台条款。
- 无损 raw、逐次实际提示词、身份锁、输入哈希、生成账本、掩码复核账本和构建工具快照均保存在本目录及唯一正式包中。耐久替换路径为：以冻结身份板和逐字提示词重新调用内置图像生成，再重新通过透明 provenance、八方向盲审、真实 Godot 和所有者视觉门禁。
- `image_gen` 实际输出的是全不透明、非均匀近洋红背景，不是纯 `#FF00FF`。正式 v3.1 流程逐项复核世界图 64 个候选组件（20 enclosed、12 fringe、15 outer、17 residual）和人像 176 个候选组件（17 enclosed、39 fringe、18 outer、102 residual）；全部确认是背景孔洞、轮廓边缘或残余键色，没有删除或改写角色本体材质，也没有全局 RGB 清理。
- 当前唯一正式构建源是 `source/formal-production/npc-bundle-v3.1-20260723-7615f286/npc-bundle.json`，manifest SHA-256 为 `ca4d9e473b1a8dac72b6e5f0373247df97b8030369205a26174211f62d04cc67`。冻结 builder SHA-256 为 `7615f2860454dd23b3d51a3974257e68cc00cdf5e801199957a3ee16cb598f4b`，独立 auditor SHA-256 为 `e7f5772dc2d3810d4854f5a60485db9cbb107cf41a48ec57e0eba027daecd38a`，auditor 结果为 PASS（世界 8 帧、人像 4 帧）。
- 正式包的 8 个世界帧与 4 张人像已逐字节安装到本外观目录；`source/provenance.json` 也与正式包副本一致。正式包联系表、QC、运行帧和账本构成后续复核链，根级临时预览不作为证据。
- 当前已通过正式包审计、12/12 安装一致性、真实 Godot 八方向录像与 import parity、Stage A 八方向盲审、Stage B 四人像/Main 实装审查和最终组合审计，状态推进为 `owner_review_pending / ownerReviewStatus=pending / releaseApproved=false / runtimeEnabled=false`。剩余门禁只有项目所有者对冻结视觉证据的明确验收；本目录没有项目所有者决定或运行时发布 attestation，普通运行时必须继续失败关闭。
