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

## 正式双视角战斗动作

- 范围：蓝人龙宠物本体的 `front_3quarter_sw` 与 `back_3quarter_ne` 两个正式战斗视角；每个视角包含 `idle / walk / attack / skill / hurt / defend / dodge / counter / stagger / knockaway / down / revive` 十二个动作，共 180 张 512px 源帧和 180 张 256px 运行帧。
- 生成方式：OpenAI 内置图像生成；逐动作实际提示词保存在 `../prompts/battle/<view>/<action>/`。所有原始生成图均以像素无损 WebP 归档在 `../source/battle/<view>/raw/`，管线输入、逐帧标准化参数和原始/归档像素哈希分别位于相邻的 `input/`、`pipeline/` 与 `source-meta.json`。
- 身份延续：全部动作锁定 `identity-lock.md` 的钴蓝幼年直立人龙、青色冠鳍与颊鳍、奶油色分节腹甲、海军蓝背脊、两臂两腿、单一不分叉尾巴和稳定三爪结构；没有翅膀、角、武器或额外肢体。
- 确定性修复：背视角 `attack`、`down`、`revive` 曾存在明显比例偏小；仅使用同一张原始生成图按统一基线重排到 `fitScale=1.0`，没有重新抽取角色。背视角 `down-8` 与 `revive-1` 现在为完全相同的 RGBA 帧，保证倒地到复活连续。
- 透明边处理：安装时仅清除色键残留与 `alpha<=8` 的缩放尘点，确保 512px 源帧至少 28px、256px 运行帧至少 14px 安全边；没有改变角色轮廓、姿势或内部颜色。
- 每个动作均附带 GIF、接触表和机器 QC：`../qa/battle/<view>/<action>/`。两视角十二动作总表与汇总 QC 位于 `../qa/battle/combined/`。
- 当前只完成静态工程自评；真实 Godot 战斗播放、10v10 混合动作和项目所有者审美验收仍为 `pending`。因此 `artStatus=in_production`、`ownerReviewStatus=pending`、`runtimeEnabled=false`，不得宣称已正式批准或直接启用。
