# 高地风狐身份资产来源与归属

- 资产 ID：`pet_identity_driftfox_highland_wind9_earth1_v1`
- 资产范围：2×2 原始/透明身份板，以及 `front_3quarter_sw`、`back_3quarter_ne`、`south`、`west` 四个 512×512 透明关键姿势。
- 制作日期：2026-07-19。
- 来源类型：项目内原创、AI 辅助生成；创意图仅使用 OpenAI 内置图像生成能力，后处理只做色键转透明、连通域选择、整体裁切、统一缩放、锚定与安全边检查。
- 同源参考：雾风狐身份板仅提供风狐血统、项目绘制语言与相机；高地风狐由长腿、高飞节、平背、后掠双耳羽、沙金/玉青配色与单条风带尾形成独立身份，不是换色。
- 外部输入：未使用、描摹或切取 StoneAge 8.0、私服、第三方游戏、图库或网络素材。
- 首稿：`../source/identity-board-v1-edge-touch-raw.png`，SHA-256 `64b1fdf87595c772ab839a5a440f86f0dcfb5ddbfb73ea6ebaf6a373ddfbe72b`；左上尾尖越过逻辑格，只作失败证据。
- 正式 key-pose 原稿：`../source/identity-board-raw.png`，SHA-256 `dcc17b38a56b7afa290f9b4da78106f94bad5094dbb64792f553a467c3391f34`。v2 只修正主体缩放、留白与居中。
- 透明身份板：`identity-board-transparent.png`，SHA-256 `73dd9cf69f8c56e718688a7f7ca990842ee258758346f42d07123c3dcb031a0f`。
- 生成证据：`../prompts/identity-board-v1.txt`、`../prompts/identity-board-v2-containment-fix.txt`；处理参数与逐姿势哈希位于 `../source/identity-board-pipeline-meta.json`。
- 处理工具：`tools/build_pet_art_bundle.py`。最终采用 `bottom-center` 共享锚定和 4px 安全边；四个 RGBA 512×512 姿势无洋红残边，256px QA 尺度透明高度约 125–152px。
- 项目归属：这是为 Beastbound Odyssey 本仓库专门制作的原创输出，按项目资产管理；实际使用仍遵守生成服务适用条款。
- 可替换路径：以雾风狐与本目录身份锁为同源参考重建高地形态，只允许 v2 prompt 做版式收口；随后重新通过 key-pose、真八向、战斗、整体骑乘和 owner review 门禁。
- 发布状态：`identity_locked_self_review_passed_owner_review_pending`。没有登记为运行时素材，也不代表世界、战斗或骑乘美术完成。
