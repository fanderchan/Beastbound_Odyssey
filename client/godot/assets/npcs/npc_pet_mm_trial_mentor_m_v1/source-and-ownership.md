# 来源、权属与替换路径

- 本外观包于 2026-07-23 为 Beastbound Odyssey 创建，`appearanceId=npc_pet_mm_trial_mentor_m_v1`，`roleId=pet_mm_trial_mentor`，显示职业为“1转MM试炼师·男”。它是可跨村复用的 MM 转生试炼裁定者职业外观；具名 NPC 的姓名、地图、对话、任务和试炼规则不属于本包。
- 所有创意像素均来自 OpenAI 内置 `image_gen`；没有用程序绘图、占位几何或另一职业的角色拼成正式图。保存了工具返回的无损 PNG、逐字提示、生成时间、来源哈希和可替换路径。
- 角色为约 34 岁、肩宽腰收的健壮成年男性；风暴蓝灰、赭黄、骨白和深棕配色。挑战护腕固定于自身左臂，骨哨固定于颈部，计数结固定于自身右髋。世界表和人像均禁止武器、缰绳、鞭子、七格签板、宠物和魔法特效。
- 身份板 v1 通过制作方身份检查。世界表 v1 和针对东南格修正的 v2 都因东南人物仍朝画面左而明确拒绝并归档；当前世界 v3 是一次完整、全新的真八向再生成，东南格由脸、胸襟和脚尖明确朝画面右前方。
- 世界八向均为独立创作的 `idle-1`，顺序为 `south, southwest, west, northwest, north, northeast, east, southeast`；没有运行时或离线镜像、复制、旋转、负缩放或相邻方向改名。四人像为同一人物的 `neutral / speaking / smile / concerned`。
- 旧正式包在 Stage B 被拒绝：`portrait/speaking.png` 左侧 `x=36, y=342..456` 留有 73 个 alpha 1..15 的灰色细线像素，alpha≥1 时形成主主体之外的 10 个小组件。该残留回溯到旧原稿 speaking 单元内部 `x=0, y=453..624` 的 172 像素生成背景接缝（组件 SHA-256 `f252fc6ada8115cfca90c14d31eb5f2d259b893661c8b59b7664db744d1c9123`），不是角色前景；原来的 alpha≥16 detached 门禁无法发现这条低 alpha 线。
- 修复没有在成品上硬擦：v2 全表重生成因上排躯干跨越水平 50% 单元边界而拒绝；v3 清除了 speaking 细线，但其不可变 r2 包因一个 4 像素 smile 发尾/衣领背景组件在 numpy builder 与纯 Python auditor 间分类不一致而审计失败并保留。最终 v4 再次整表重生成，简化发尾/衣领拓扑，四个单元在构建前取得 4/4 分类器一致。
- 原稿是全不透明、空间变化的近洋红背景，不是逐像素精确 `#FF00FF`。最终 r3 流程逐页审看并登记 144 个世界候选组件与 67 个人像候选组件；世界残余键色为 373 像素、72 组件，人像残余键色为 299 像素、46 组件，全部按可见位置确认属于幕布、边缘溢色或发尾与衣领之间的真实背景孔后才登记为背景修复。没有全图色相删除、全图 despill 或自动删除 detached foreground。
- 当前唯一正式安装源是 `source/formal-production/npc-bundle-v3.1-20260723-4b7f8cd7-r3-speaking-fringe/npc-bundle.json`，manifest SHA-256 为 `f42a82c9866a404137fe67f63d95bf729c716813d1455433f1e52a5244b9ed10`，联系表 SHA-256 为 `327d4485f06295438b355414be23c12feab1e6f9522484971d6798f818b37214`。冻结 builder SHA-256 为 `7615f2860454dd23b3d51a3974257e68cc00cdf5e801199957a3ee16cb598f4b`，独立 auditor SHA-256 为 `e7f5772dc2d3810d4854f5a60485db9cbb107cf41a48ec57e0eba027daecd38a`；只读 auditor 结果为 PASS（世界 8 帧、人像 4 帧），且分类重放、重复、精确镜像、透明 RGB、changed-mask、mask 组件重放和 detached-foreground 门禁全部通过。
- r3 正式包的 8 张 256×256 世界图和 4 张 512×512 人像已 12/12 逐字节安装到本外观根目录；`source/provenance.json` 和 `identity/identity-board.png` 分别与正式包对应文件逐字节一致。新 speaking 成品在 alpha 1、2、4、8、12、16 六档均只有一个连通主体，未再出现细线；联系表与四张人像原始 runtime PNG 已按可读尺寸检查，未发现残余幕布、破碎轮廓或人物身份漂移。
- 制作后匿名方向预检把八帧随机化并隐藏目录名，独立代理回填与私有真值 8/8 一致；这只是非正式预检，未冒充严格的两阶段、哈希绑定盲审，也未创建任何 owner decision 或 attestation。
- 产物为本项目定向生成的原创 AI 辅助资产；未输入、拼接、描摹或复制 StoneAge 的人物、贴图、代码、名称或数值，也未发现第三方素材授权依赖。项目最终商业使用与权利判断仍服从仓库所有者政策和适用平台条款。
- r3 已通过正式包审计、12/12 安装一致性、真实 Godot 八方向录像与 import parity、Stage A 八方向盲审、Stage B 四人像/Main 实装审查和最终组合审计，状态推进为 `owner_review_pending / ownerReviewStatus=pending / releaseApproved=false / runtimeEnabled=false`。剩余门禁只有项目所有者对冻结视觉证据的明确验收；本目录没有也不得自行创建 `release-owner-decision.json` 或 `release-attestation.json`。
- 耐久替换路径：`/Users/fander/projects/Beastbound_Odyssey/client/godot/assets/npcs/npc_pet_mm_trial_mentor_m_v1`。
