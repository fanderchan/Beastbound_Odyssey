# 来源与权属

- 资产：苇潮鳍兽身份板与四个身份关键姿势。
- 生成日期：2026-07-19。
- 生成方式：OpenAI 内置图像生成；基础提示词与三趾纠正提示词分别保存在 `../prompts/identity-board-v1.txt`、`../prompts/identity-board-toe-correction-v2.txt`。
- 首轮候选因稳定出现四趾而拒收；接受版本以首轮身份方向为参考重新生成，但没有使用图层拼接、局部贴片或手工改脚。
- 输入参考只用于 Beastbound 自有的渲染质量、固定视角和身份延续；没有拼接、描摹或复制石器时代、宝可梦、数码兽或其他游戏角色素材。
- 接受版原始 PNG SHA-256：`328ac90082eaf495ee33d0af05ab7e5c13b75e070636624512d414ee8d06ee64`。
- 原始 PNG 已转存为像素无损 WebP：`../source/identity-board-raw.webp`；WebP 文件 SHA-256 为 `453154a68d764cafec8c2157ca97a3e46ad61785bb3e9ab21e43d65fb888d9e4`，解码 RGB 像素哈希与原 PNG 同为 `90bd6473e680a341a39b0ebe6b6391bc19d23ffea2c790454d78d531e733fdc4`。
- 原始四主体先由 `tools/repack_chroma_sprite_grid.py` 做整主体重排，再使用批准色键去除和 `tools/build_pet_art_bundle.py` 统一比例、feet 基线、透明边与 512px 关键姿势；未重绘主体。
- 透明身份板 SHA-256：`380397c33047d3e2f993fdb9857553dc6f6a49514185f7d4937e27b57f15c816`。可复建参数与逐帧 QC 位于 `../source/identity-board-source-meta.json`、`../source/identity-board-repack-meta.json` 和 `../source/identity-board-pipeline-meta.json`。
- 石器时代 8.0 只作为成熟 2.5D 宠物可读性参考，不复制其贴图、数字、动作或角色身份。
- 当前关键姿势工程自评通过，项目所有者视觉验收为 `pending`；不得据此宣称正式批准或完整动作包。
