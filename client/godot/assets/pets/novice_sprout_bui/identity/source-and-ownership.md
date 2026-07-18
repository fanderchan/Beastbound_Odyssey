# 芽耳布伊资产来源与归属记录

- 资产 ID：`pet_action_novice_sprout_bui_v1`
- 资产范围：身份板、正/背三分之四视角，以及 `idle/walk/attack/hurt/defend/stagger/down` 两视角动作帧。
- 制作日期：2026-07-18。
- 来源类型：项目内原创、AI 辅助生成；使用 OpenAI 内置图像生成能力按本目录身份锁和动作节拍生成。
- 外部输入：没有使用、描摹或切取 StoneAge 8.0、石器时代私服、第三方游戏、图库或网络图片；StoneAge 8.0 只作为 2.5D 视角、轮廓清晰度和轻松冒险气质的行为参考。
- 项目归属：这是在项目所有者发起的 Beastbound Odyssey 开发任务中为本仓库专门制作的输出，按项目资产管理；实际使用仍遵守生成服务适用条款。
- 生成与修订证据：`../prompts/identity-board-v1.txt`、`../prompts/action-generation-log.md`、`identity-board-pipeline-meta.json`、各动作 `pipeline-meta.json`。
- 可替换性：先按 `identity-lock.md` 重建身份板，再按动作节拍生成色键母版，使用项目切帧/归一化工具输出 512px QA 母版与 256px 运行帧；随后必须重新通过 100 帧资产门禁、Godot 实机截图、MP4 连贯性和性能验收。
- 发布状态：工程与 Phase 308 实机自评通过；Phase 306 的昏厥基础和 Phase 308 的前爪攻击/负伤退行证据分别位于 `.run/evidence/phase306_stoneage_battle_foundation/`、`.run/evidence/phase308_counter_wounded_return/`。项目所有者视觉验收待定；在确认风格、比例、昏厥语义和动作语言前，不据此批量生产其他宠物。
