# 来源与权属

- 资产：蓝人龙身份板与四个身份关键姿势。
- 生成日期：2026-07-19。
- 生成方式：OpenAI 内置图像生成；原始提示词保存在 `../prompts/identity-board-v1.txt`。
- 输入参考只用于 Beastbound 自有的渲染质量、固定视角和身份延续；没有拼接、描摹或复制石器时代、宝可梦、数码兽或其他游戏角色素材。
- 原始 PNG SHA-256：`f23b744eae7aef4481fb47f1302e22671ab3d66f725719140ab8fbe9f2a88750`。
- 原始 PNG 已按项目政策转存为像素无损 WebP：`../source/identity-board-raw.webp`；WebP 文件 SHA-256 为 `b6af3cc10c74b872e68e503215973140aa4c6eeabade2db17f5bfc1cd46e7ea7`。
- 去色键使用项目批准的 `remove_chroma_key.py --auto-key border --soft-matte --despill`，随后由 `tools/build_pet_art_bundle.py` 统一比例、feet 基线、透明边和 512px 关键姿势。
- 透明身份板 SHA-256：`183788de3af62df09db25d41e26bcaf9f6dd9d6145445364f6c4bbf082dd9d99`。
- 可复建参数与逐帧 QC 位于 `../source/identity-board-source-meta.json` 和 `../source/identity-board-pipeline-meta.json`。
- 石器时代 8.0 只作为成熟 2.5D 宠物可读性参考，不复制其贴图、数字、动作或角色身份。
- 当前只完成工程自评，项目所有者视觉验收仍为 `pending`；不得据此宣称正式批准。
