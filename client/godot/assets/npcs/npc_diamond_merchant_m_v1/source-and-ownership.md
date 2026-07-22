# 来源、权属与替换路径

- 本外观于 2026-07-23 为 Beastbound Odyssey 定向生产，创意像素来自 OpenAI 内置 `image_gen`；工具未暴露具体模型标识，因此账本不作臆测。
- `npc_diamond_merchant_m_v1` 是约 38 岁、清瘦整洁的男性钻石商职业原型：左前臂闭合矿石样品盒，右腰骨制量规和贵重商品腰带；主色为深祖母绿、象牙白、黄铜和炭灰。
- 现有项目 NPC 仅作为成人比例、软赛璐璐明暗与完成度参考；未复制 StoneAge 或第三方人物、服装、道具、姿势或美术像素。
- 逐字提示词、身份锁、内置生成归档路径、生成时间、文件哈希、正式源图、拒绝候选和遮罩审阅证据均保存在本目录。稳定账本为 `source/generation-ledger.json`、`source/ownership-ledger.json` 与 `source/provenance.json`。
- 初始身份板因左右职业道具漂移被拒绝；首张世界图因东南格仅余 2 px 边距且后侧方向错位被拒绝；两次后侧方向编辑仍错位；首张人像因贴右外边界被拒绝。拒绝项不参与正式构建。
- 世界源图早期生产过程中，模型独立绘制的 `northwest` 与 `northeast` 被放错格位。`source/raw/world-idle-2x4-v5-canonicalization-ledger.json` 记录了两张完整格位的无损字节搬移；未镜像、未旋转、未缩放、未插值。随后通过内置 `image_gen` 对 v5 做西向样品盒语义修复，产出 v6。
- v6 的首个正式包 `source/formal-production/npc-bundle-v3.1-20260723-7615f286/` 已通过技术审计，但正式匿名 Stage A 判定其 `northwest` 整体偏转不足、与 `north` 过近。该包与源图保持不可变并登记为拒绝历史，不能为新像素复用旧审片证据。
- r2 使用内置 `image_gen` 对完整 2x4 源图做生成式编辑，独立重画左后约 45° 的西北语义；正式输出为 `source/raw/world-idle-2x4-r2-northwest-v1.png`。没有本地裁块拼贴、镜像、旋转、方向改名、形变或运行时翻转。
- r2 正式透明处理只使用 v3.1 显式审阅遮罩；没有全图色距删除、全局色相清理或隐藏式后处理。世界 78 个候选组件已重新逐项复核；人像源图未变化，沿用其与同一源哈希绑定且可由审计器完整重放的 9 个候选组件决定。
- 已从 `source/formal-production/npc-bundle-v3.1-20260723-7615f286-r2/` 按字节安装 8 张世界待机帧和 4 张表情人像。此安装仅建立可验证 r2 候选，不代表运行时获准启用。
- 耐久替换路径为：重新生成/修订 `identity/identity-board.png` 和 `source/raw/` 源图，保留对应提示词与生成账本，再通过 v3.1 遮罩、构建器、独立审计器、真实 Godot、匿名盲方向及项目所有者视觉门禁。
- r2 已通过正式包审计、12/12 安装一致性、真实 Godot 八方向录像与 import parity、Stage A 八方向盲审、Stage B 四人像/Main 实装审查和最终组合审计，状态推进为 `artStatus=owner_review_pending`、`ownerReviewStatus=pending`、`releaseApproved=false`、`runtimeEnabled=false`。剩余门禁只有项目所有者对冻结视觉证据的明确验收；本目录没有项目所有者决定或发布证明，普通运行时必须继续失败关闭。
