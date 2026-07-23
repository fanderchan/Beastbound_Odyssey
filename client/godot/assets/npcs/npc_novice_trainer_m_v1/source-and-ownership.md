# 来源、权属与替换路径

- 本外观包于 2026-07-23 为 Beastbound Odyssey 创建，创意像素均来自 OpenAI 内置 `image_gen`，未使用程序图形或其他游戏美术充当创意原稿。
- 角色为约 43 岁、结实亲和的男性新手训练师；自身右髋卷起的新手手册、自身左腰三枚圆木训练筹码和胸前太阳形徽记构成职业识别。
- 八个世界方向均为独立创作；首张表的四个邻向轴语义未通过生产者检查，随后经独立重画收敛。真西向使用单独生成的左侧面原稿，等比装入固定单元格；没有运行时或离线镜像。
- 对话人像为同一人物、同一服装、同一裁切与光照的中性、说话、微笑、担忧四状态。
- “石器灵感”只描述原创 2.5D 宠物 MMORPG 的可读性方向；未输入、拼接或描摹 StoneAge 的人物、贴图、代码、名称或数值。
- 项目定向生成输出按 Beastbound Odyssey 项目资产管理；最终商业使用与权利判断仍服从仓库所有者政策和适用平台条款。
- 无损原稿、逐字提示、身份锁、生成账本、装配回执、掩码复核账本和正式 builder 快照均保存于本目录或 `.run/evidence/phase331_npc_novice_trainer_m_v1`。耐久替换方式是从冻结身份板与提示重新生成，并重新走 provenance、八方向盲审、真实 Godot 与 owner release 门禁。

## 当前生产状态

- 正式 v3.1 bundle 已通过确定性审计：八张独立世界方向、四张对话人像、零错误；审计回执为 `.run/evidence/phase331_npc_novice_trainer_m_v1/bundle-audit.json`。
- 真实 Godot 八方向视频、三进程 source-set 一致性、1280×720 `Main.tscn` 世界角色与说话人像均已冻结。
- 独立 reviewer 的 Stage A 八方向分类和 Stage B 四人像/Main 观察均为 `pass`；producer 合并后的 schema-v2 blind audit SHA-256 为 `b008679d8db87d6ae606bea0ed03cfe655817a1d65d4600449ab537bc219d80f`。
- 当前生命周期为 `owner_review_pending`：运行时仍关闭，唯一剩余门禁是项目所有者明确接受冻结证据。
