# 雾风狐身份资产来源与归属

- 资产 ID：`pet_identity_driftfox_mist_wind7_water3_v1`
- 资产范围：2×2 原始/透明身份板，以及 `front_3quarter_sw`、`back_3quarter_ne`、`south`、`west` 四个 512×512 透明关键姿势。
- 制作日期：2026-07-19。
- 来源类型：项目内原创、AI 辅助生成；创意图仅使用 OpenAI 内置图像生成能力，后处理只做色键转透明、连通域选择、整体裁切、统一缩放、锚定与安全边检查。
- 外部输入：未使用、描摹或切取 StoneAge 8.0、私服、第三方游戏、图库或网络宠物素材。芽耳布伊只作为 Beastbound 的高清手绘完成度、轮廓权重、亲和感与镜头参考，提示中明确禁止复用其身体与身份标记。
- 首稿：`../source/identity-board-v1-edge-touch-raw.png`，SHA-256 `215562bff15c248a3115ff2a7a1e79c2904a45729d48c173474970d50c63c12a`。该图按项目所有者提供的原始 prompt 生成并完整留存；因右下视图侵入相邻逻辑格，只作失败证据。
- 正式 key-pose 原稿：`../source/identity-board-raw.png`，SHA-256 `6d3cc830dcb75a0b047820095e0b73b1063e028e1c99ed892a27d77b0af579bd`。v2 仅修正整体比例、间距与居中。
- 透明身份板：`identity-board-transparent.png`，SHA-256 `eb22219573c923d948b79cf9217fcd357f30c1f62562912adbfec8555529903e`。
- 生成证据：`../prompts/identity-board-v1.txt`、`../prompts/identity-board-v2-containment-fix.txt`；处理参数与逐姿势哈希位于 `../source/identity-board-pipeline-meta.json`。
- 处理工具：`tools/build_pet_art_bundle.py`。最终四姿势使用共享缩放、4px 源格/输出安全边，输出 RGBA 512×512 关键姿势和 256×256 QA 帧；洋红残边为 0。
- 项目归属：这是在项目所有者发起的 Beastbound Odyssey 开发任务中为本仓库专门制作的原创输出，按项目资产管理；实际使用仍遵守生成服务适用条款。
- 可替换路径：从本目录身份锁与 v1 prompt 重建身份板，若越格则只按 v2 containment prompt 修正版式；随后用相同处理参数切帧并重新通过 key-pose、真八向、战斗、整体骑乘和 owner review 门禁。
- 发布状态：`identity_locked_self_review_passed_owner_review_pending`。没有登记为运行时素材，也不代表世界、战斗或骑乘美术完成。
