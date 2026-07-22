# 来源、权属与替换路径

- 本外观包于 2026-07-23 为 Beastbound Odyssey 创建，`appearanceId=npc_player_rebirth_mentor_f_v1`，`roleId=player_rebirth_mentor`，显示职业为“玩家转生导师·女”。它是可跨村复用的玩家角色转生资格导师外观；具名 NPC 的姓名、地图、对话、任务与转生规则不属于本包。
- 所有创意像素均来自 OpenAI 内置 `image_gen`；没有用程序绘图、占位几何或另一职业角色拼成正式图。仓库保存了工具返回的无损 PNG、逐字提示、生成时间、原始哈希、拒绝原因和耐久替换路径。
- 角色为约 38 岁、中高挑且精瘦的成年女性；固定身份特征为黑色高位编发环、银白额发、骨白短袍、矿物靛蓝短肩披、低饱和珊瑚织带、人物自身右手叉形资格标杆、人物自身左侧资格登记板与螺旋化石牌。宠物转生、MM 试炼、村医和宗教祭司不得复用这套外观。
- 首个身份板错误写成宠物转生岗位，已拒绝并纠正为玩家角色转生导师。早期世界表分别因背景不安全、跨格缝、对齐不安全或人物过小而归档；冻结 v6 在不移动格中心的前提下由 `image_gen` 重新生成运行尺寸，原始 SHA-256 为 `7a8e9de1c15ecb150030afaccc6565673db3f81c77856af8c031d8c5bbaec220`。首张人像表因单格出现登记板而拒绝，下一张因背景门禁不安全而归档；冻结人像 v3 为无手持道具的四表情版本。
- 世界八向均为独立创作的 `idle-1`，顺序为 `south, southwest, west, northwest, north, northeast, east, southeast`；没有运行时或离线镜像、复制、旋转、负缩放或相邻方向改名。四人像为同一人物的 `neutral / speaking / smile / concerned`。
- 原稿是全不透明、空间变化的洋红背景，不是逐像素精确 `#FF00FF`。正式 v3.1 流程逐页审看并登记 98 个世界候选组件与 191 个人像候选组件：世界 48 个背景孔组件/1156 像素和 8 个窄边组件/14937 像素进入背景 mask，仅 1 个明确位于双腿负空间的残余幕布像素按冻结 soft-matte 修复，41 个组件/109 个标杆、发辫、衣纹和阴影作者色像素原样保留；人像 118 个背景孔组件/3144 像素和 5 个窄边组件/11232 像素进入背景 mask，68 个组件/306 个发辫、耳饰、披肩纹样与轮廓阴影作者色像素全部保留。没有全图色相删除、全图 despill 或自动删除 detached foreground。
- 当前唯一正式安装源是 `source/formal-production/npc-bundle-v3.1-20260723-7615f286/npc-bundle.json`，manifest SHA-256 为 `05d88acb091c342962b9204a9f5adaa81af4a8d04061cdb9017946f9dde32d81`。冻结 builder SHA-256 为 `7615f2860454dd23b3d51a3974257e68cc00cdf5e801199957a3ee16cb598f4b`，独立 auditor SHA-256 为 `e7f5772dc2d3810d4854f5a60485db9cbb107cf41a48ec57e0eba027daecd38a`；只读 auditor 结果为 PASS（世界 8 帧、人像 4 帧），且重复、精确镜像、透明 RGB、changed-mask、mask 组件重放和 detached-foreground 门禁全部通过。
- 正式包的 8 张 256×256 世界图和 4 张 512×512 人像已逐字节安装到本外观根目录；`source/provenance.json` 是正式包 provenance 的逐字节副本。联系表与每张原始 runtime PNG 已按原始尺寸检查，未发现残余幕布、破碎轮廓、方向重复、身份漂移或手持道具混入人像。
- 产物为本项目定向生成的原创 AI 辅助资产；未输入、拼接、描摹或复制 StoneAge 的人物、贴图、代码、名称或数值，也未发现第三方素材授权依赖。项目最终商业使用与权利判断仍服从仓库所有者政策和适用平台条款。
- 当前已通过正式包审计、12/12 安装一致性、真实 Godot 八方向录像与 import parity、Stage A 八方向盲审、Stage B 四人像/Main 实装审查和最终组合审计，状态推进为 `owner_review_pending / ownerReviewStatus=pending / releaseApproved=false / runtimeEnabled=false`。剩余门禁只有项目所有者对冻结视觉证据的明确验收；本目录没有也不得自行创建 `release-owner-decision.json` 或 `release-attestation.json`。
- 耐久替换路径：`/Users/fander/projects/Beastbound_Odyssey/client/godot/assets/npcs/npc_player_rebirth_mentor_f_v1`。
