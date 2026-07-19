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

## 世界真八向本体动作

- 范围：蓝人龙宠物本体的世界 `idle × 1 + walk × 4`，严格按 `south / southwest / west / northwest / north / northeast / east / southeast` 八个独立方向生产，共 40 张运行帧；不包含骑乘组合图，也不包含战斗动作。
- 生成方式：OpenAI 内置图像生成。八向待机板的完整提示词在 `../prompts/world-idle-8-direction-v1.txt`；每个方向的四帧步行提示词分别保存在 `../prompts/world-<direction>-walk-v1.txt`。
- 身份延续：所有动作均锁定本文件夹 `identity-lock.md` 的蓝人龙轮廓、单尾、主冠鳍、颊鳍、腹甲、两臂两腿和爪数，不使用运行时镜像。
- 原始生成图全部以像素无损 WebP 归档在 `../source/world/raw/`。原始 PNG 文件哈希、原始解码像素哈希、WebP 文件哈希及解码像素一致性验证位于 `../source/world/world-source-meta.json`。
- 透明 512px 源帧保存在 `../source/world/frames-512/`；256px 运行帧保存在 `../world/directions/`；逐方向重排与标准化参数位于 `../source/world/pipeline/`。
- 步态采用明确的 `接触 / 经过 / 接触 / 经过` 四相循环，左右脚交替；不是仅做上下浮动。标准化后四帧逐方向均唯一，八向待机也不存在镜像哈希复用。
- 工程自评证据位于 `.run/art_batch_phase320/blue_man_dragon/world-production/evidence-v1/`，包含 512px 原始比例总表、160px 地图比例总表、八方向同步 GIF 和机器 QC 摘要。
- 当前 `ownerReviewStatus=pending` 且 `runtimeEnabled=false`。这些文件不得被描述为项目所有者已批准，也不得在未完成战斗动作与整体验收前启用为正式运行资产。
