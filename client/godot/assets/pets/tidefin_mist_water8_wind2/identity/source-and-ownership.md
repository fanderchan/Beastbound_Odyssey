# 来源与权属

- 资产：雾潮鳍兽身份板与四个身份关键姿势。
- 生成日期：2026-07-19。
- 生成方式：OpenAI 内置图像生成；基础提示词与三趾纠正提示词分别保存在 `../prompts/identity-board-v1.txt`、`../prompts/identity-board-toe-correction-v2.txt`。
- 首轮候选因稳定出现四趾而拒收；接受版本以首轮身份方向为参考重新生成，但没有使用图层拼接、局部贴片或手工改脚。
- 输入参考只用于 Beastbound 自有的渲染质量、固定视角和身份延续；没有拼接、描摹或复制石器时代、宝可梦、数码兽或其他游戏角色素材。
- 接受版原始 PNG SHA-256：`8a5f9f7ec8c7c7fd80bbdf90e69a9239d6d6142d96a1ddd00c394f9bdd85321d`。
- 原始 PNG 已转存为像素无损 WebP：`../source/identity-board-raw.webp`；WebP 文件 SHA-256 为 `2a3c986d45bbc6586985f06f6a62dc38d5e4a92636bf322dc84850298877eca3`，解码 RGB 像素哈希与原 PNG 同为 `17382b1e60d65e615c492a50dbf7f9316b8b05275d4cb05f3575f0fa1fd2914a`。
- 原始四主体先由 `tools/repack_chroma_sprite_grid.py` 做整主体重排，再使用批准色键去除和 `tools/build_pet_art_bundle.py` 统一比例、feet 基线、透明边与 512px 关键姿势；未重绘主体。
- 透明身份板 SHA-256：`61810db6852529bf788bfae5a0a40012fc64f3af3c5e6656f248d2eb24799dc6`。可复建参数与逐帧 QC 位于 `../source/identity-board-source-meta.json`、`../source/identity-board-repack-meta.json` 和 `../source/identity-board-pipeline-meta.json`。
- 石器时代 8.0 只作为成熟 2.5D 宠物可读性参考，不复制其贴图、数字、动作或角色身份。
- 当前关键姿势工程自评通过，项目所有者视觉验收为 `pending`；不得据此宣称正式批准或完整动作包。
