# GM 观战战场 v1 来源与使用边界

- 资产范围：`moss_meadow`、`amber_sandstone`、`moonlit_slate`、`red_clay` 四张固定 16:9 战斗地表。
- 生成方式：2026-07-25 使用当前 Codex 会话内置 OpenAI 图像生成工具独立生成；没有输入、临摹或复制 StoneAge、StoneAge9 或其他商业游戏素材。
- 提示词：逐字保存在 `source/prompts/`；图像工具原始输出以未改写 PNG 保存在 `source/raw/`。
- 后处理：仅用 macOS `sips -z 720 1280` 从 `1672x941` 规范为 `1280x720`，没有拼接、重绘、修补或内容替换。
- 运行范围：只在显式 GM 宠物战斗验收场中按随机种子选择；不改变战斗拓扑、碰撞、AI、结算或普通玩家战斗背景。
- 生命周期：`ownerReviewStatus=pending`、`runtimeEnabled=false`、`qaPreviewEnabled=true`。当前可以在 GM 隔离预览中审看，不据此宣称正式玩家美术已通过。
- 替换路径：保持四个 arena ID 与 `1280x720` 契约不变即可逐张替换 `runtime/*.png`；提示词、原稿和哈希需同步更新。
