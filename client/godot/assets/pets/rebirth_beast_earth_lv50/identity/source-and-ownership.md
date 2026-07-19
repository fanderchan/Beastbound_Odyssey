# 来源与权属

- 资产：地灵转生兽身份板与四个身份关键姿势。
- 生成日期：2026-07-19。
- 生成方式：OpenAI 内置图像生成；精确生成提示词保存于 `../prompts/identity-board-v1.txt`。
- 输入只使用 Beastbound 自有生产合同；没有拼接、描摹或复制石器时代、宝可梦、数码兽或其他游戏角色素材。
- 原始 PNG SHA-256：`b4168b334a17678869afa21e360f75b76231e9935c86fe4a5a3b438f6de6db3f`。
- 原始 PNG 已转存为像素无损 WebP：`../source/identity-board-raw.webp`；WebP 文件 SHA-256 为 `d8037bddbe48d860133df338648910887d7e898f99e330e1cfb6b542f79e6282`，解码 RGB 像素哈希与原 PNG 同为 `8302f876bac1d660436aa6f08ba731c7abf8ae6b095ddfb2b7922071d65f7a86`。
- 原始四主体先由 `tools/repack_chroma_sprite_grid.py` 做整主体重排，再使用批准色键去除和 `tools/build_pet_art_bundle.py` 统一比例、feet 基线、透明边与 512px 关键姿势；未重绘、镜像或局部拼补主体。
- 透明身份板 SHA-256：`059184f32a3a17f7b02fe0852f4023523b19faf96644c74b882e17555bfa02e6`。可复建参数与逐帧 QC 位于 `../source/identity-board-source-meta.json`、`../source/identity-board-repack-meta.json` 和 `../source/identity-board-pipeline-meta.json`。
- 石器时代 8.0 只作为成熟 2.5D 宠物可读性参考，不复制其贴图、数字、动作或角色身份。
- 当前关键姿势工程自评通过，项目所有者视觉验收为 `pending`；不得据此宣称正式批准或完整动作包。
