# 来源与权属

- 资产：湿地苔背兽身份板与四个身份关键姿势。
- 生成日期：2026-07-19。
- 生成方式：OpenAI 内置图像生成；原始提示词保存在 `../prompts/identity-board-v1.txt`。
- 输入参考只用于 Beastbound 自有的渲染质量、固定视角和身份延续；没有拼接、描摹或复制石器时代、宝可梦、数码兽或其他游戏角色素材。
- 原始 PNG SHA-256：`231fe3aaff8b1209f52b136545f1c8ef7b79cdb34cebf0de37b9b07ffae93d9c`。
- 原始 PNG 已按项目政策转存为像素无损 WebP：`../source/identity-board-raw.webp`；WebP 文件 SHA-256 为 `1f88b39aa0d342b3530a8a8c70f2e56b7830458fb6e8607c23516c9a20473c17`。
- 原始四主体跨固定网格边界，先由 `tools/repack_chroma_sprite_grid.py` 仅做整主体重排，再使用批准的色键去除和 `tools/build_pet_art_bundle.py` 统一比例、feet 基线、透明边与 512px 关键姿势；未重绘主体。
- 透明身份板 SHA-256：`cb4bd3eda7ea43eb928b65605c6c74ec0467dfdb44c574953b50fab1ed915ed8`。
- 可复建参数与逐帧 QC 位于 `../source/identity-board-source-meta.json`、`../source/identity-board-repack-meta.json` 和 `../source/identity-board-pipeline-meta.json`。
- 石器时代 8.0 只作为成熟 2.5D 宠物可读性参考，不复制其贴图、数字、动作或角色身份。
- 当前关键姿势工程自评通过，项目所有者视觉验收为 `pending`；不得据此宣称正式批准或完整动作包。
