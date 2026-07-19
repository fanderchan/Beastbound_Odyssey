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
- 当前关键姿势工程自评通过，项目所有者视觉验收为 `pending`；不得据此宣称正式批准。

## 真八向世界动作与正式战斗动作（2026-07-19）

- 宠物本体新增世界 `south / southwest / west / northwest / north / northeast / east / southeast` 八个独立方向；每方向 `idle 1 + walk 4`，共 40 张 256×256 运行帧。八向均为独立生成与拆帧，不以镜像补方向。
- 正式战斗新增 `front_3quarter_sw` 与 `back_3quarter_ne` 两个独立视角；每视角包含 `idle / walk / attack / skill / hurt / defend / dodge / counter / stagger / knockaway / down / revive` 十二动作，共 180 张 256×256 运行帧。
- 战斗源视角不是彼此镜像生成；运行展示合同统一为 `enemy=front_3quarter_sw+flipH=true`、`ally=back_3quarter_ne+flipH=true`，使双方最终朝战场中心，并与同队骑乘整图使用完全相同的视角及水平翻转规则。
- `down` 表达可复活的昏厥而非死亡或睡觉；两个视角的 `down-8` 与 `revive-1` 均为完全相同 RGBA 帧，避免倒地切到复活动作时跳帧。
- 正式仓库采用 lean 归档：仅跟踪 256px 运行帧、提示词/生产合同、联系表、GIF、QC 与哈希账本。512px 拆帧、原始生成表和去背/归一中间件留在 `.run/art_full_g11_g12/earth_sample/pet/`，避免重复源图膨胀仓库。
- 逐动作 GIF 位于 `../qa/battle/actions/`，双视角十二动作总表位于 `../qa/battle/contact-sheet.png`，真八向总表及循环 GIF 位于 `../qa/world/`。机器 QC 确认战斗 180 帧、世界 40 帧、统一 256×256、最小透明安全边 13px，且所有检查通过。
- 原始生成图、处理参数与 SHA-256 的完整账本位于 `../source/formal-production/source-ledger.json`；一份可独立核对的代表性原始生成表、提示合同、处理元数据与哈希清单位于 `.run/art_full_g11_g12/earth_sample/archive-handoff/`。
- 当前仍为 `ownerReviewStatus=pending`、`runtimeEnabled=false`。静态工程自评不等于项目所有者批准；真实 Godot 战斗播放和 10v10 混合动作仍由主集成流程验收。
