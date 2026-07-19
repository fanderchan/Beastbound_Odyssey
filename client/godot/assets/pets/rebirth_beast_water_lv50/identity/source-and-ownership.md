# 来源与权属

- 资产：水灵转生兽身份板与四个身份关键姿势。
- 生成日期：2026-07-19。
- 生成方式：OpenAI 内置图像生成；精确生成提示词保存于 `../prompts/identity-board-v1.txt`。
- 输入只使用 Beastbound 自有生产合同；没有拼接、描摹或复制石器时代、宝可梦、数码兽或其他游戏角色素材。
- 原始 PNG SHA-256：`aadd852ded9eebe75967f894cc7130d548d9ea4f85725d90bb6fb59fa952ea76`。
- 原始 PNG 已转存为像素无损 WebP：`../source/identity-board-raw.webp`；WebP 文件 SHA-256 为 `6f72d9e01241e8f3fa68d93937046628f09a75bf6f143215fa9b54d38a91d1e4`，解码 RGB 像素哈希与原 PNG 同为 `b5fd359a13928e9b520156682f559483a9c9ca5c6eff1d632228051530243d60`。
- 原始四主体先由 `tools/repack_chroma_sprite_grid.py` 做整主体重排，再使用批准色键去除和 `tools/build_pet_art_bundle.py` 统一比例、feet 基线、透明边与 512px 关键姿势；未重绘、镜像或局部拼补主体。
- 透明身份板 SHA-256：`7218f1da4912138b20ac239950486a8fbb13a1b549a411d854ceebb3ff63da40`。可复建参数与逐帧 QC 位于 `../source/identity-board-source-meta.json`、`../source/identity-board-repack-meta.json` 和 `../source/identity-board-pipeline-meta.json`。
- 石器时代 8.0 只作为成熟 2.5D 宠物可读性参考，不复制其贴图、数字、动作或角色身份。
- 当前关键姿势工程自评通过，项目所有者视觉验收为 `pending`；不得据此宣称正式批准或完整动作包。
