# 来源、权属与替换路径

- 本外观包于 2026-07-23 为 Beastbound Odyssey 创建，`appearanceId=npc_storyteller_m_v1`，`roleId=storyteller`，显示职业为“说书人·男”。它是可跨村复用的旅人说书职业外观；具名 NPC 的姓名、地图、台词、任务与摆放不属于本包。
- 所有创意像素均来自 OpenAI 内置 `image_gen`；没有用程序绘图、占位几何或另一职业角色拼成正式图。保存了内置工具返回的无损 PNG、逐字提示、生成时间、父级修订关系、来源哈希与可替换路径。
- 角色为约 62 岁、清瘦但不衰弱的成年男性旅人；褪色栗红、暖沙、烟灰、铜棕配色。宽幅折叠披肩是第一轮廓，闭合札记固定在人物自身左臂，单一旅行纪念结固定在人物自身右髋。禁止庄园钥匙、权杖、手杖、法杖、魔法、可读文字、任务图标和第二人物。
- 身份板 v1/v2 与世界表 v4/v5/v6 均因把身体左右侧误当作画面左右侧而明确拒绝并归档；当前身份板 v3 和世界表 v7 通过内置 `image_gen` 做了逐面板/逐格纠正。它们在正面、背面、侧面和斜向均按人物自身左右侧放置札记与纪念结，没有离线镜像、翻转、旋转、重标方向或程序重绘。
- 世界八向均为独立创作的 `idle-1`，顺序为 `south, southwest, west, northwest, north, northeast, east, southeast`；四人像为同一人物的 `neutral / speaking / smile / concerned`。世界 v1/v2/v3 的反向或重复语义候选也已拒绝归档，未冒充正式来源。
- 原稿是全不透明、空间变化的近洋红背景，不是逐像素精确 `#FF00FF`。正式 v3.1 流程逐页审看并登记 128 个世界候选组件与 276 个人像候选组件：世界残余键色 16 组件/324 像素按冻结 soft-matte 修复，68 组件/177 个头发、披肩、纪念物、裤腿或靴部作者色像素原样保留；人像残余键色 45 组件/178 像素修复，9 组件/16 个暖棕、栗红或中性轮廓像素保留。所有封闭背景孔、窄边与外部背景孔也都有精确组件描述、mask、决定和审查时间；没有全图色相删除、全图 despill 或自动删除 detached foreground。
- 当前唯一正式安装源是 `source/formal-production/npc-bundle-v3.1-20260723-7615f286/npc-bundle.json`，manifest SHA-256 为 `bcb09d1ca8122979a53b5f32e635d116c522a52f923c08d3553172f001e574d6`。冻结 builder SHA-256 为 `7615f2860454dd23b3d51a3974257e68cc00cdf5e801199957a3ee16cb598f4b`，独立 auditor SHA-256 为 `e7f5772dc2d3810d4854f5a60485db9cbb107cf41a48ec57e0eba027daecd38a`；只读 auditor 结果为 PASS（世界 8 帧、人像 4 帧），且重复、精确镜像、透明 RGB、changed-mask、mask 组件重放和 detached-foreground 门禁全部通过。
- 正式包的 8 张 256×256 世界图和 4 张 512×512 人像已逐字节安装到本外观根目录；`source/provenance.json` 是正式包 provenance 的逐字节副本。联系表与每张原始 runtime PNG 已按可读尺寸检查，未发现残余幕布、破碎轮廓、方向重复或人物身份漂移。
- 产物为本项目定向生成的原创 AI 辅助资产；未输入、拼接、描摹或复制 StoneAge 的人物、贴图、代码、名称或数值，也未发现第三方素材授权依赖。项目最终商业使用与权利判断仍服从仓库所有者政策和适用平台条款。
- 当前已通过正式包审计、12/12 安装一致性、真实 Godot 八方向录像与 import parity、Stage A 八方向盲审、Stage B 四人像/Main 实装审查和最终组合审计，状态推进为 `owner_review_pending / ownerReviewStatus=pending / releaseApproved=false / runtimeEnabled=false`。剩余门禁只有项目所有者对冻结视觉证据的明确验收；本目录没有也不得自行创建 `release-owner-decision.json` 或 `release-attestation.json`。
- 耐久替换路径：`/Users/fander/projects/Beastbound_Odyssey/client/godot/assets/npcs/npc_storyteller_m_v1`。
