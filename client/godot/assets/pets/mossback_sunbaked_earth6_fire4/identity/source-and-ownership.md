# 来源与权属

- 资产：晒甲苔背兽身份板与四个身份关键姿势。
- 生成日期：2026-07-19。
- 生成方式：OpenAI 内置图像生成；原始提示词保存在 `../prompts/identity-board-v1.txt`。
- 输入参考只用于同系 Mossback 骨架延续和 Beastbound 自有渲染质量；晒甲型重新生成了矮壮体型、厚裂背甲、干地衣和晒纹，不是对湿地型 PNG 调色。
- 没有拼接、描摹或复制石器时代、宝可梦、数码兽或其他游戏角色素材。
- 原始 PNG SHA-256：`f1a76817cd061ce0e52e043b10b7b8d08cd40c0b9b74949034d9354d0bf657c0`。
- 原始 PNG 已按项目政策转存为像素无损 WebP：`../source/identity-board-raw.webp`；WebP 文件 SHA-256 为 `84b2d4347abe9e404461a48abf55acc8b0616dedd9293a1c0417b57e8e72b946`。
- 原始四主体跨固定网格边界，先由 `tools/repack_chroma_sprite_grid.py` 仅做整主体重排，再使用批准的色键去除和 `tools/build_pet_art_bundle.py` 统一比例、feet 基线、透明边与 512px 关键姿势；未重绘主体。
- 透明身份板 SHA-256：`b707f11b1305222693568dd3b1c886026976f50472e80fd4a52207daf145d19a`。
- 可复建参数与逐帧 QC 位于 `../source/identity-board-source-meta.json`、`../source/identity-board-repack-meta.json` 和 `../source/identity-board-pipeline-meta.json`。
- 石器时代 8.0 只作为成熟 2.5D 宠物可读性参考，不复制其贴图、数字、动作或角色身份。
- 当前关键姿势工程自评通过，项目所有者视觉验收为 `pending`；不得据此宣称正式批准或完整动作包。
