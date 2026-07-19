# 1转小MM身份资产来源与归属

- 资产 ID：`pet_identity_pet_rebirth_mm_stage1_v1`
- 资产范围：2×2 原始/透明身份板，以及 `front_3quarter_sw`、`back_3quarter_ne`、`south`、`west` 四个 512×512 透明关键姿势。
- 制作日期：2026-07-19。
- 来源类型：项目内原创、AI 辅助生成；创意图仅使用 OpenAI 内置图像生成能力，后处理只做无损归档、色键转透明、多连通部件保留、统一缩放、脚底锚定与安全边检查。
- 外部输入：未使用、描摹或切取 StoneAge 8.0、私服、第三方游戏、图库或网络宠物素材。芽耳布伊只作为 Beastbound 的高清手绘完成度和镜头参考，提示明确禁止复用其解剖。
- 原始 PNG SHA-256：`b25c1e1272cb0cb0598008ec014c81f7686fbfa05253780d1d37b785a9bc80b3`；解码 RGB 像素 SHA-256：`1c808117b16c8843b9777336c801c3175d29f574bc08ceee00c18ceeff0dd3e0`。
- 像素无损 WebP：`../source/identity-board-raw.webp`，文件 SHA-256 `8c50a6035a6a64fbee8c178b4f5a23abef5f906e3505f493f927340d2797abaa`，解码像素哈希与原始 PNG 一致。
- 透明身份板：`identity-board-transparent.png`，SHA-256 `8b2f1a75604e78ca717890c4b3582bb88cbef0b4e08aadfda40b88cba54ef1b9`。
- 生成证据：`../prompts/identity-board-v1.txt`；原图、参考与逐输出哈希位于 `../source/identity-board-source-meta.json`，处理参数位于 `../source/identity-board-pipeline-meta.json`。
- 处理工具：`imagegen/remove_chroma_key.py`、`tools/build_pet_art_bundle.py`；为保留三段仪式环明确使用 `--component-mode all`，共享缩放、feet 基线、4px 安全边，洋红残边为 0。
- 项目归属：这是在项目所有者发起的 Beastbound Odyssey 开发任务中为本仓库专门制作的原创输出，按项目资产管理；实际使用仍遵守生成服务适用条款。
- 可替换路径：从身份锁和完整 prompt 重建，保持非人类、三指手和单组三段环，再按同一确定性管线处理并重新通过关键姿势、真八向、战斗、整体骑乘和 owner review 门禁。
- 发布状态：`self_review_passed_owner_pending`。没有登记为运行时素材，也不代表世界、战斗或骑乘美术完成。
