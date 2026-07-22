# 来源、权属与替换路径

- 本外观包于 2026-07-23 为 Beastbound Odyssey 创建，`appearanceId=npc_welfare_clerk_f_v1`，`roleId=welfare_clerk`，显示职业为“福利员·女”。它是可跨村复用的新人登记/福利领取职业外观；具名 NPC 的姓名、地图、对话、任务与福利规则不属于本包。
- 所有创意像素均来自 OpenAI 内置 `image_gen`；没有用程序绘图、占位几何或另一职业的角色拼成正式图。保存了内置工具返回的无损 PNG、逐字提示、生成时间、来源哈希与可替换路径。
- 角色为约 33 岁、矮壮亲和的成年女性；暖奶油、低饱和珊瑚、蓝灰、浅褐配色。空白木登记牌固定于自身右臂，闭合封装远行补给袋固定于自身左髋。世界表与人像均禁止金币/银行制服、开放货篮/价签/商品展示、庄园钥匙、现代官僚制服和实际商品。
- 身份板 v1 的正面补给袋位于错误身体侧，已明确拒绝并归档；接受 v2 由内置 `image_gen` 只针对配件侧位重生成。第一张世界表因上排人物跨越 2×4 行边界被严格 builder 失败关闭，未裁切、擦除或冒充正式来源；当前世界 v2 重新生成了每格四边安全留白并保留八个独立方向。
- 世界八向均为独立创作的 `idle-1`，顺序为 `south, southwest, west, northwest, north, northeast, east, southeast`；没有运行时或离线镜像、复制、旋转、负缩放或相邻方向改名。四人像为同一人物的 `neutral / speaking / smile / concerned`。
- 原稿是全不透明、空间变化的近洋红背景，不是逐像素精确 `#FF00FF`。正式 v3.1 流程逐页审看并登记 54 个世界候选组件与 64 个人像候选组件：世界残余紫幕 3 组件/89 像素按冻结 soft-matte 修复，22 组件/32 个深棕、珊瑚、皮肤等作者色像素原样保留；人像残余紫幕 2 组件/93 像素修复，7 组件/8 像素作者色保留。所有封闭背景孔、窄边与外部背景孔也各有精确组件描述、mask、决定和审查时间；没有全图色相删除、全图 despill 或自动删除 detached foreground。
- 当前唯一正式安装源是 `source/formal-production/npc-bundle-v3.1-20260723-7615f286/npc-bundle.json`，manifest SHA-256 为 `e1eb92d8fd969c66142d40a732899e04c56d4add2fd08b5c65caffd85a4469f1`。冻结 builder SHA-256 为 `7615f2860454dd23b3d51a3974257e68cc00cdf5e801199957a3ee16cb598f4b`，独立 auditor SHA-256 为 `e7f5772dc2d3810d4854f5a60485db9cbb107cf41a48ec57e0eba027daecd38a`；只读 auditor 结果为 PASS（世界 8 帧、人像 4 帧），且重复、精确镜像、透明 RGB、changed-mask、mask 组件重放和 detached-foreground 门禁全部通过。
- 正式包的 8 张 256×256 世界图和 4 张 512×512 人像已逐字节安装到本外观根目录；`source/provenance.json` 是正式包 provenance 的逐字节副本。联系表与每张原始 runtime PNG 已按可读尺寸检查，未发现残余幕布、破碎轮廓、方向重复或人物身份漂移。
- 产物为本项目定向生成的原创 AI 辅助资产；未输入、拼接、描摹或复制 StoneAge 的人物、贴图、代码、名称或数值，也未发现第三方素材授权依赖。项目最终商业使用与权利判断仍服从仓库所有者政策和适用平台条款。
- 当前已通过正式包审计、12/12 安装一致性、真实 Godot 八方向录像与 import parity、Stage A 八方向盲审、Stage B 四人像/Main 实装审查和最终组合审计，状态推进为 `owner_review_pending / ownerReviewStatus=pending / releaseApproved=false / runtimeEnabled=false`。剩余门禁只有项目所有者对冻结视觉证据的明确验收；本目录没有也不得自行创建 `release-owner-decision.json` 或 `release-attestation.json`。
- 耐久替换路径：`/Users/fander/projects/Beastbound_Odyssey/client/godot/assets/npcs/npc_welfare_clerk_f_v1`。
