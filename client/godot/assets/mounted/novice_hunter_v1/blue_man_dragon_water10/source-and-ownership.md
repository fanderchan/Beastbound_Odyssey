# 来源与权属

- 资产：见习猎人骑蓝人龙前/背三分之四整图关键姿势。
- 生成日期：2026-07-19。
- 生成方式：OpenAI 内置图像生成；两张输入仅作为 Beastbound 自有的蓝人龙与见习猎人身份参考。
- 蓝人龙参考：`../../../pets/blue_man_dragon_water10/identity/identity-board-transparent.png`。
- 见习猎人参考：`../../../characters/novice_hunter/identity/processed/sheet-transparent.png`；其 SHA-256 为 `7223ed3f753929e35d1960766da589e49b22bc3188866ab5b3ca87493fdff0f2`。
- 每个骑乘姿势均为一次生成的完整人宠主体，没有离线或运行时人物/宠物分层拼接。
- 原始 PNG SHA-256：`528543e08c94f4e100b4a8adee0265306f67711da42c6df065f4a747cd89457e`。
- 原始 PNG 已转存像素无损 WebP：`source/mounted-keypose-raw.webp`；WebP 文件 SHA-256 为 `57a0e9749c2820b3d41b3bde28dade8d63b8057197577cf748399b6ebab2dea7`。
- 去色键采用 `remove_chroma_key.py --auto-key border --soft-matte --despill`，随后由 `tools/build_pet_art_bundle.py` 共同比例、feet 基线和 512px 透明关键姿势。
- 透明关键姿势板 SHA-256：`3f1679164c4953c42d2c10df3014427d8e6c818a395f748296e59c047dfcee43`。
- 生成合同、原图 SHA、无损归档、处理参数和联系表证据均在本目录或 `.run/art_batch_phase320/blue_man_dragon/` 留痕。
- 石器时代 8.0 只作为成熟骑乘构图质量参考，不复制其人物、宠物、鞍具、贴图或动画。
- 当前为工程自评通过、项目所有者视觉验收 `pending`；不得宣称正式批准。

## 世界真八向补充（2026-07-19）

- 世界资产新增南、西南、西、西北、北、东北、东、东南八份独立 AI 整图原稿；每方向 `idle 1 + walk 4`，合计 40 张 512×512 透明源帧和 40 张 256×256 运行帧。
- 每份原稿是同一名见习猎人与同一只蓝人龙、低鞍和缰绳的一体化完整绘制；没有拼接人物层、宠物层、鞍具层，也没有以水平镜像补另一方向。
- 八份原始 PNG 均以 `cwebp -lossless -exact` 归档到 `source/world-raw/`，解码 RGB 像素哈希逐份一致；精确提示词位于 `prompts/world-{direction}-v1.txt`。
- 48 个生成格子用同一全局比例与 feet 基线一次规范化，发布其中 40 个正式格子；额外 8 个回环待机只作原稿一致性检查，不进入运行资产。
- 地图比例证据以徒步人物 160px 画布为基线，测得本组合建议使用相对徒步画布 `1.22252x` 的单一展示比例；该数值只进入 QA 证据，未写入共享运行目录或骑乘配置。
- 世界方向、比例和步态为工程自评通过、项目所有者审核 `pending`；`runtimeEnabled=false`，不得宣称已获批准或已对玩家启用。

## 正式战斗动作补充（2026-07-19）

- 新增前下左与背上右两份独立正式战斗视角；每视角包含 `idle 6 / walk 8 / attack 8 / skill 8 / hurt 6 / defend 6 / dodge 8 / counter 8 / stagger 8 / knockaway 8 / down 8 / revive 8`，合计 180 张 256×256 运行帧。
- 每格均由 OpenAI 内置图像生成完整绘制人物、蓝人龙、低鞍和缰绳的一体化主体；不在运行时拼接人物层与宠物层，也不以镜像代替背视角。
- 完整 512px 拆帧、24 份原始生成表和去背/归一中间件保留在 `.run/art_batch_phase322/blue_mounted_battle/`；正式目录采用 `lean` 归档，仅跟踪 180 张运行帧、24 份提示词/处理/QC、两份代表原图及完整哈希账本。
- 逐动作联系表与 GIF 位于 `qa/battle/actions/{view}/`，总联系表和机器 QC 位于 `qa/battle/`。当前工程自评通过、项目所有者审核仍为 `pending`，`runtimeEnabled=false`。
- 世界 40 张发布源帧统一上移 2px 后重新确定性派生运行帧，八方向使用同一偏移，不改变姿势、颜色或相对地面锚点；运行图最小安全边为 4px，最大可见底边（exclusive）为 252。

## 战斗边缘与倒地／复起来源修复（2026-08-16）

- 历史 `.run/art_batch_phase322/blue_mounted_battle/` 工作档在本次恢复搜索中已不可用，因此没有把现有 256px 运行帧放大后冒充 512px 正式源帧，也没有伪造旧生成提示词。
- 使用同一套蓝人龙与见习猎人身份参考重新生成并安装五组完整人骑宠动作：`front_3quarter_sw/stagger`、`front_3quarter_sw/down`、`front_3quarter_sw/revive`、`back_3quarter_ne/down`、`back_3quarter_ne/revive`，共 40 张运行帧。
- 五组动作均保留 exact prompt、ImageGen 原始 PNG、实际色键输入、预处理参数、512px 源帧、256px 运行帧、逐帧哈希和规范流水线重放证据；生成缓存与仓库原始归档逐字节一致，规范重放与安装结果逐文件、逐 RGBA 一致。
- 前／背两视角均强制 `down-8 == revive-1`，在 512px 来源层和 256px 运行层同时逐字节、逐 RGBA 精确相等；没有以跨帧相似度替代硬连续性门禁。
- 40 张修复运行帧的宽松洋红疑似边、强洋红边和全透明 RGB 泄漏均为 `0`；没有对整图执行启发式去洋红，只处理具备精确色键来源合同的重新生成动作。
- 当前 180 帧统一 digest 为 `b644f3bd7b5fe20c00b855ad937bdd8587147ae99858ac27c74f4b186fb67045`；正式来源证明位于 `source/battle/repairs/phase456-blue-mounted-edge-source-repair-v1/`。
- 真实 `Main.tscn` 14 段连续审片为 1280×720、60 FPS、1.00×、2372 帧、39.533333 秒；视频 SHA-256 为 `43a8a7e10a2381f48b38fddf72db50cfa8c2f85ca7aff1d64c58d7ce4e10dcc6`。双方最终仍按敌方 `front_3quarter_sw + flipH=true`、我方 `back_3quarter_ne + flipH=true` 面向战场中心。
- 本次只完成工程自评和真实运行取证；项目所有者视觉审核仍为 `pending`，`runtimeEnabled=false`，不得解释为已经批准或已向普通玩家开放。
