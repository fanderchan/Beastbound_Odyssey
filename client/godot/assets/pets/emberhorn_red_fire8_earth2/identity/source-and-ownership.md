# 赤角兽身份资产来源与归属

- 资产 ID：`pet_identity_emberhorn_red_fire8_earth2_v1`
- 资产范围：2×2 原始/透明身份板，以及 `front_3quarter_sw`、`back_3quarter_ne`、`south`、`west` 四个 512×512 透明关键姿势。
- 制作日期：2026-07-19。
- 来源类型：项目内原创、AI 辅助生成；创意图仅使用 OpenAI 内置图像生成能力，后处理只做无损归档、色键转透明、整体同比例重排、连通域选择、统一缩放、脚底锚定与安全边检查。
- 外部输入：未使用、描摹或切取 StoneAge 8.0、私服、第三方游戏、图库或网络宠物素材。芽耳布伊只作为 Beastbound 的高清手绘完成度和镜头参考，提示中明确禁止复用其解剖与身份标记。
- 原始 PNG SHA-256：`740f3a7041660c1458f525d7b0d18b83ee4f96327cfa4e74ab91369f3fec8e1d`；解码 RGB 像素 SHA-256：`83870dbfdccfa1f53cfba0467c4abf22d3d5f63295716319dc4640f64cbe9292`。
- 像素无损 WebP：`../source/identity-board-raw.webp`，文件 SHA-256 `d77241b994070fa5f9f0b4948403e95d236b77439ca34b008fb1e4386001aa0e`，解码像素哈希与原始 PNG 一致。
- 透明身份板：`identity-board-transparent.png`，SHA-256 `fccc3d100508f8c5b06e9b399a55943d67fa6362a789623c6829935cb52ceaf4`。
- 生成证据：`../prompts/identity-board-v1.txt`；原图、参考与逐输出哈希位于 `../source/identity-board-source-meta.json`，处理参数位于 `../source/identity-board-repack-meta.json` 和 `../source/identity-board-pipeline-meta.json`。
- 处理工具：`tools/repack_chroma_sprite_grid.py`、`imagegen/remove_chroma_key.py`、`tools/build_pet_art_bundle.py`。最终四姿势使用共享缩放、feet 基线、4px 源格/输出安全边，洋红残边为 0。
- 项目归属：这是在项目所有者发起的 Beastbound Odyssey 开发任务中为本仓库专门制作的原创输出，按项目资产管理；实际使用仍遵守生成服务适用条款。
- 可替换路径：从身份锁和完整 prompt 重新生成 2×2 身份板，按同一确定性管线重排、去色键和切帧，并重新通过关键姿势、真八向、战斗、整体骑乘和 owner review 门禁。
- 发布状态：`self_review_passed_owner_pending`。没有登记为运行时素材，也不代表世界、战斗或骑乘美术完成。
