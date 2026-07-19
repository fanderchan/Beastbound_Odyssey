# 月岚风狐身份资产来源与归属

- 资产 ID：`pet_identity_driftfox_evolved_moon_gale_wind7_water3_v1`
- 资产范围：2×2 原始/透明身份板，以及 `front_3quarter_sw`、`back_3quarter_ne`、`south`、`west` 四个 512×512 透明关键姿势。
- 制作日期：2026-07-19。
- 来源类型：项目内原创、AI 辅助生成；创意图仅使用 OpenAI 内置图像生成能力，后处理只做色键转透明、连通域选择、整体裁切、统一缩放、锚定与安全边检查。
- 同源参考：雾风狐和高地风狐身份板只提供风狐血统与项目绘制语言。月岚风狐通过成年深胸长背、月白颈鬃、严格双尾月牙负形和附着身体的雾岚毛流带形成进化轮廓，不能退化为换色普通风狐。
- 外部输入：未使用、描摹或切取 StoneAge 8.0、私服、第三方游戏、图库、网络九尾狐或其他宠物素材。
- 首稿：`../source/identity-board-v1-edge-touch-raw.png`，SHA-256 `fd58f6c4957a08b5fd096a2ed0bd782991cc249a849d4613cf902d1a25075c02`；右上背视图下尾触碰逻辑格，只作失败证据。
- 正式 key-pose 原稿：`../source/identity-board-raw.png`，SHA-256 `11b5add1bd9249cb23c300e94075276f4d0eee8ffa2ad4de5fb13d9d2f4fd289`。v2 只修正整体缩放、间距与居中，保留双尾结构。
- 透明身份板：`identity-board-transparent.png`，SHA-256 `21a6b80b9ac2895e89cbd44936a8b3aab8bc7dbf29ee78940e58ba6967d6f871`。
- 生成证据：`../prompts/identity-board-v1.txt`、`../prompts/identity-board-v2-containment-fix.txt`；处理参数与逐姿势哈希位于 `../source/identity-board-pipeline-meta.json`。
- 处理工具：`tools/build_pet_art_bundle.py`。最终使用共享缩放、4px 源格/输出安全边，输出四个 RGBA 512×512 姿势；洋红残边为 0。
- 项目归属：这是为 Beastbound Odyssey 本仓库专门制作的原创输出，按项目资产管理；实际使用仍遵守生成服务适用条款。
- 可替换路径：以本目录身份锁和普通风狐同源板重建，先验证每视角严格两尾与开放月牙负形，再做版式修正；随后重新通过 key-pose、真八向、战斗、整体骑乘和 owner review 门禁。
- 发布状态：`identity_locked_self_review_passed_owner_review_pending`。没有登记为运行时素材，也不代表世界、战斗或骑乘美术完成。
