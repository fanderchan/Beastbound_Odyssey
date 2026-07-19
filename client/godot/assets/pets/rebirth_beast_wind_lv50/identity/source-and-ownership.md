# 来源与权属

- 资产：风灵转生兽身份板与四个身份关键姿势。
- 生成日期：2026-07-19。
- 生成方式：OpenAI 内置图像生成；精确生成提示词保存于 `../prompts/identity-board-v1.txt`。
- 输入只使用 Beastbound 自有生产合同；没有拼接、描摹或复制石器时代、宝可梦、数码兽或其他游戏角色素材。
- 原始 PNG SHA-256：`49343cb7a65c801616ab248c426361529fda2b8f7551f575a743e8474c1dc224`。
- 原始 PNG 已转存为像素无损 WebP：`../source/identity-board-raw.webp`；WebP 文件 SHA-256 为 `33bcb89adf08b5f0042eda9b91168f91cef6871356cda99ec6c1496689122baf`，解码 RGB 像素哈希与原 PNG 同为 `38cc00e0fb1c3a777073c005f842bdc42a1e683cb83c3f3598a4a25877236862`。
- 原始四主体先由 `tools/repack_chroma_sprite_grid.py` 做整主体重排，再使用批准色键去除和 `tools/build_pet_art_bundle.py` 统一比例、feet 基线、透明边与 512px 关键姿势；未重绘、镜像或局部拼补主体。
- 透明身份板 SHA-256：`9e6b6d4e56ca3e05d523a635d2392ec1d8cc96fae46fdd8facc46cfd0f820ad6`。可复建参数与逐帧 QC 位于 `../source/identity-board-source-meta.json`、`../source/identity-board-repack-meta.json` 和 `../source/identity-board-pipeline-meta.json`。
- 石器时代 8.0 只作为成熟 2.5D 宠物可读性参考，不复制其贴图、数字、动作或角色身份。
- 当前关键姿势工程自评通过，项目所有者视觉验收为 `pending`；不得据此宣称正式批准或完整动作包。
