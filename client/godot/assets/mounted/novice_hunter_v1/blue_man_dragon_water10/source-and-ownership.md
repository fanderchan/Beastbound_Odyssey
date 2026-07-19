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
