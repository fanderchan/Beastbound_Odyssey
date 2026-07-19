# 岚角兽身份资产来源与归属

- 资产 ID：`pet_identity_emberhorn_gale_fire5_wind5_v1`
- 资产范围：2×2 原始/透明身份板，以及 `front_3quarter_sw`、`back_3quarter_ne`、`south`、`west` 四个 512×512 透明关键姿势。
- 制作日期：2026-07-19。
- 来源类型：项目内原创、AI 辅助生成；创意图仅使用 OpenAI 内置图像生成能力，后处理只做无损归档、色键转透明、整体同比例重排、连通域选择、统一缩放、脚底锚定与安全边检查。
- 输入参考：同项目原创赤角兽与灰烬角兽只用于血统解剖、形态差异和渲染语言；未使用、描摹或切取 StoneAge 8.0、私服、第三方游戏、图库或网络宠物素材。
- 原始 PNG SHA-256：`6cb0d812120182429eb22707c6d61ac35f6ef048d5d6ab1a2b4e0145b5458516`；解码 RGB 像素 SHA-256：`b70b18bdd35fafa70f7529f24f07a93249d9064381d7d4dd71e9b90921c428d3`。
- 像素无损 WebP：`../source/identity-board-raw.webp`，文件 SHA-256 `f1874956c4ebbb01eb0ef4531e0b380cf701d2e030b55002d1f019ce3849674e`，解码像素哈希与原始 PNG 一致。
- 透明身份板：`identity-board-transparent.png`，SHA-256 `2bc5b796e1fcc5e676c829c9fa7f746425e63e8d959f33bc85134ae5017cc917`。
- 生成证据：`../prompts/identity-board-v1.txt`；原图、参考与逐输出哈希位于 `../source/identity-board-source-meta.json`，处理参数位于 `../source/identity-board-repack-meta.json` 和 `../source/identity-board-pipeline-meta.json`。
- 处理工具：`tools/repack_chroma_sprite_grid.py`、`imagegen/remove_chroma_key.py`、`tools/build_pet_art_bundle.py`；共享缩放、feet 基线、4px 安全边，洋红残边为 0。
- 项目归属：这是在项目所有者发起的 Beastbound Odyssey 开发任务中为本仓库专门制作的原创输出，按项目资产管理；实际使用仍遵守生成服务适用条款。
- 可替换路径：从身份锁、同系参考和完整 prompt 重新生成，再按同一确定性管线处理并重新通过关键姿势、真八向、战斗、整体骑乘和 owner review 门禁。
- 发布状态：`self_review_passed_owner_pending`。没有登记为运行时素材，也不代表世界、战斗或骑乘美术完成。
