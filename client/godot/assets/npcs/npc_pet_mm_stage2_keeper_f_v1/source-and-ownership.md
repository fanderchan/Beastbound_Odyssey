# 来源、权属与替换路径

- 本外观包于 2026-07-22 为 Beastbound Odyssey 创建，`appearanceId=npc_pet_mm_stage2_keeper_f_v1`，`roleId=pet_mm_stage2_keeper`，显示职业为“2转MM守护员·女”。它是可跨村复用的二转 MM 奖励保管职业外观；具名 NPC 的姓名、地图、对话、任务与服务规则不属于本包。
- 所有创意像素均来自 OpenAI 内置 `image_gen`；没有用程序绘图、占位几何或另一职业角色拼成正式图。保存了内置工具返回的无损 PNG、逐字提示、生成时间、来源哈希、拒稿和可替换路径。
- 角色为约 40 岁、成熟结实、肩背宽阔的成年女性，使用陶土红、浅沙、低饱和钴蓝、深棕配色。闭合双环封印蛋匣固定于自身左髋，监管束带固定于自身右腰。世界表与人像均禁止真实宠物、可见或破裂的蛋、光效、兽栏/饲料暗示、钻石商人和仓库管理员外观。
- 身份板先于世界和人像冻结。世界 v1 因西北/东北语义互换拒绝，v2 因西北仍朝画面右侧拒绝；接受 v3 是内置 `image_gen` 对错误西北格的独立重绘，没有离线镜像、旋转、换格或相邻方向冒充。人像 v1 的 `speaking` 存在 168 像素脱离主体的头发岛，严格 builder 失败关闭；接受 v2 是无飞散头发的完整轮廓重生成，没有像素删除、重连或蒙版绕过。
- 世界八向均为独立创作的 `idle-1`，顺序为 `south, southwest, west, northwest, north, northeast, east, southeast`；没有运行时或离线镜像、复制、旋转、负缩放或相邻方向改名。四人像为同一人物的 `neutral / speaking / smile / concerned`。
- 原稿是全不透明、空间变化的近洋红背景，不是逐像素精确 `#FF00FF`。正式 v3.1 流程逐页审看并登记 107 个世界候选组件与 54 个人像候选组件：世界 10 个残余幕布组件/265 像素按冻结 soft-matte 修复，55 个作者色组件/83 像素原样保留；人像 48 个残余组件/68 像素全部判定为钴蓝肩部或服饰边缘作者色并保留。封闭背景孔、窄边和外部背景孔均有精确组件描述、mask、决定和审查时间；没有全图色相删除、全图 despill 或自动删除 detached foreground。
- 当前唯一正式安装源是 `source/formal-production/npc-bundle-v3.1-20260722-7615f286/npc-bundle.json`，manifest SHA-256 为 `0e4aa9125863da4f5484c2ce68e90b92d75ad56bddfb00153a2a1ecf2dc7510e`。冻结 builder SHA-256 为 `7615f2860454dd23b3d51a3974257e68cc00cdf5e801199957a3ee16cb598f4b`，独立 auditor SHA-256 为 `e7f5772dc2d3810d4854f5a60485db9cbb107cf41a48ec57e0eba027daecd38a`；只读 auditor 结果为 PASS（世界 8 帧、人像 4 帧），且重复、精确镜像、透明 RGB、changed-mask、mask 组件重放和 detached-foreground 门禁全部通过。
- 正式包的 8 张 256×256 世界图和 4 张 512×512 人像已逐字节安装到本外观根目录；`source/provenance.json` 是正式包 provenance 的逐字节副本。联系表与每张原始 runtime PNG 已按可读尺寸检查，未发现残余幕布、破碎轮廓、方向重复、配件换侧或人物身份漂移。
- 产物为本项目定向生成的原创 AI 辅助资产；未输入、拼接、描摹或复制 StoneAge 的人物、贴图、代码、名称或数值，也未发现第三方素材授权依赖。项目最终商业使用与权利判断仍服从仓库所有者政策和适用平台条款。
- 当前已通过正式包审计、12/12 安装一致性、真实 Godot 八方向录像与 import parity、Stage A 八方向盲审、Stage B 四人像/Main 实装审查和最终组合审计，状态推进为 `owner_review_pending / ownerReviewStatus=pending / releaseApproved=false / runtimeEnabled=false`。剩余门禁只有项目所有者对冻结视觉证据的明确验收；本目录没有也不得自行创建 `release-owner-decision.json` 或 `release-attestation.json`。
- 耐久替换路径：`/Users/fander/projects/Beastbound_Odyssey/client/godot/assets/npcs/npc_pet_mm_stage2_keeper_f_v1`。
