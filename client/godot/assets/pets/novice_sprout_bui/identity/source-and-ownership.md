# 芽耳布伊资产来源与归属记录

- 资产 ID：`pet_action_novice_sprout_bui_v1`
- 资产范围：身份板、正/背三分之四战斗视角，以及 `idle/walk/attack/skill/hurt/defend/dodge/counter/stagger/knockaway/down/revive` 两视角动作帧；另含世界 `independent_8` 方向的 `idle/walk` 动作帧。
- 制作日期：2026-07-18。
- 来源类型：项目内原创、AI 辅助生成；使用 OpenAI 内置图像生成能力按本目录身份锁和动作节拍生成。
- 外部输入：没有使用、描摹或切取 StoneAge 8.0、石器时代私服、第三方游戏、图库或网络图片；StoneAge 8.0 只作为 2.5D 视角、轮廓清晰度和轻松冒险气质的行为参考。
- 世界方向合同：南、西南、西、西北、北、东北、东、东南均使用独立源图，每方向 `idle 1 + walk 4`，共 40 帧；运行时禁止以水平镜像替代缺失方向。
- 战斗兼容合同：原 100 张核心战斗帧保持不变；2026-07-19 追加 48 张 `skill/dodge/counter/knockaway/revive` 正式双视角帧，共 148 张。世界真八方向不会改变己方/敌方的战斗朝向映射。
- 骑乘边界：本宠物包的世界/战斗帧不会再与人物帧运行时拼接；人物骑乘芽耳布伊由独立 mounted bundle 的完整人宠整图负责。
- 项目归属：这是在项目所有者发起的 Beastbound Odyssey 开发任务中为本仓库专门制作的输出，按项目资产管理；实际使用仍遵守生成服务适用条款。
- 生成与修订证据：`../prompts/identity-board-v1.txt`、`../prompts/action-generation-log.md`、`../prompts/formal-v2-battle-generation.md`、`identity-board-pipeline-meta.json`、`../source/formal-v2/<action>/raw-sheet-lossless.webp`、`repack-meta.json`、`pipeline-meta.json` 及 512px 源帧。
- 可替换性：先按 `identity-lock.md` 重建身份板，再按动作节拍生成色键母版，使用项目切帧/归一化工具输出 512px QA 母版与 256px 运行帧；随后必须重新通过 100 帧资产门禁、Godot 实机截图、MP4 连贯性和性能验收。
- 发布状态：原核心动作已通过既有实机自评；2026-07-19 追加动作只完成静态双视角联系表自评，真实 Godot 10V10 连续录像和项目所有者视觉验收仍为 `pending`。元数据中的正式 v2 运行开关保持关闭，不能据自动门禁声称 `approved`。
