# 来源、权属与替换路径

- 本外观包于 2026-07-23 为 Beastbound Odyssey 创建；身份板、真八向世界页和四表情人像页的创意像素均来自 OpenAI 内置 `image_gen`，没有以程序图形、SVG、Canvas 或手工占位图替代创意原稿。
- 项目已有 NPC 资产仅作为成人比例、清晰轮廓、暖色描线和受控赛璐璐明暗的画风与运行尺度参考。当前人物的脸型、低位粗辫、赭黄短衣、米白内搭、蓝绿色单肩披巾、砖红围裙裙摆、陶葫芦与姿势均为新设计。
- 未输入、拼接、描摹或复制 StoneAge 的人物、贴图、代码、名称或数值；“石器灵感”只描述原创 2.5D 宠物 MMORPG 的可读性目标。
- 当前外观是普通女村民/可重叠路人，不承担银行、商店、兽栏、训练、治疗、守卫或任务导师职业。不同村庄可复用同一 `appearanceId`，具体姓名、地图、对白和服务仍由各自 `npcId` 管理。
- 八个世界方向均为独立生成内容，不含离线镜像、翻转、旋转或运行时 `flipH`。当前为静态八向包；若未来让该 NPC 实际巡逻，必须在同一身份锁下单独生产并审查每方向 `walk-1..4`。
- 身份板 v1 因正面陶葫芦出现在人物自身左侧而拒绝；文件保存在 `source/rejected/identity-board-v1-wrong-flask-side.png`，SHA-256 为 `61e2c404e8309e56884d1d4c4b1a9a865f937b73781be3c18d108773384a3512`。
- 八向页 v1 因主体接触分格安全边界而拒绝；文件保存在 `source/rejected/world-idle-2x4-v1-cell-edge-contact.png`，SHA-256 为 `2380039d0713459360d10fafb9fc1c803aeaa6d03fcf7c45e22dae17e4f204c3`。它未被安装或作为正式候选。
- 正式候选 raw 为 `source/world-idle-2x4-raw.png` 与 `source/portrait-2x2-raw.png`。生成器实际输出全不透明近洋红背景；v3.1 去背只在同一原图冻结的边界连通区域和逐组件人工决定的显式 mask 内执行，未使用全图色相删除。
- 世界页 75 个、头像页 272 个被分类组件均通过逐页可视审查。所有接受的残余组件都是背景孔、轮廓边缘或洋红溢色；本角色服装和皮肤没有需保留的洋红/紫色设计。处理后的 12 帧均通过静态 detached-foreground 门禁。
- 不可变生产包为 `source/formal-production/npc-bundle-v3.1-20260723-7615f286/npc-bundle.json`，manifest SHA-256 为 `4610b3018e8d6313b5abf1996fc5c8ca4e229751a4256a086d421b0df347a2a9`。包内 8 张世界图与 4 张人像已逐字节安装到本外观根目录；`source/provenance.json` 也与包内 ledger 字节一致。
- 无损 raw、逐字提示词、身份锁、生成 ledger、组件审片页、显式 mask、背景测量与哈希均保存在本外观目录及唯一正式包中。耐久替换必须从当前冻结源集出发，重新执行显式组件审查、不可变 bundle、只读审计、Godot 客户端证据、独立盲向审片和所有者审批门禁。
- 正式候选已通过 Godot 三进程 12 帧像素一致性、1280×720/30fps 八向录像、真实 `Main.tscn` 世界像/对话头像取证，以及生产者与审片者隔离的 Stage A/B 独立盲审。当前状态为 `owner_review_pending / ownerReviewStatus=pending / releaseApproved=false / runtimeEnabled=false`；只有项目所有者明确接受本次冻结证据后才可创建 owner decision 与 v2 release attestation。
