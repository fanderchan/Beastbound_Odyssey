# GM 群攻弓箭表现 v1 来源与使用边界

- 资产范围：骑乘弓手的四帧拉弓覆盖层、四帧飞行箭、四帧命中爆点、四帧回避落地插箭。
- 生成方式：2026-07-25 使用当前 Codex 会话内置 OpenAI 图像生成工具独立生成；没有输入、临摹或复制 StoneAge、StoneAge9 或其他商业游戏素材。
- 提示词：逐字保存在 `source/prompts/`；图像工具原始 2x2 输出以未改写 PNG 保存在 `source/raw/`。
- 后处理：使用仓库外 Codex `generate2dsprite` 技能脚本切分、按记录阈值去除洋红键色背景、共享缩放并规范为四张 `256x256` 透明 PNG。逐帧参数与裁切证据保存在 `source/processed/*/pipeline-meta.json`。
- 运行范围：只在显式 GM 宠物战斗验收场的装备群攻弓箭事件中启用；不改变伤害、命中、回避、AI、结算或普通玩家战斗表现。
- 生命周期：`ownerReviewStatus=pending`、`runtimeEnabled=false`、`qaPreviewEnabled=true`。当前可在 GM 隔离预览中审看，不据此宣称正式玩家美术已通过。
- 替换路径：保持四个动作 ID、每个动作四帧、`256x256`、透明背景及脚底/武器锚点契约不变，即可逐组替换 `runtime/`；提示词、原稿、处理参数和哈希需同步更新。
