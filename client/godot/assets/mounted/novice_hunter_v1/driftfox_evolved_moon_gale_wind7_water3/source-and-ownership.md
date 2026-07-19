# 来源与权属

- 资产：见习猎人骑月岚风狐前/背三分之四 AI 整图关键姿势。
- 生成日期：2026-07-19。
- 生成方式：OpenAI 内置图像生成；输入仅为 Beastbound 自有的月岚风狐与见习猎人身份参考。
- 宠物参考：`../../../pets/driftfox_evolved_moon_gale_wind7_water3/identity/identity-board-transparent.png`；SHA-256 为 `21a6b80b9ac2895e89cbd44936a8b3aab8bc7dbf29ee78940e58ba6967d6f871`。
- 人物参考：`../../../characters/novice_hunter/identity/processed/sheet-transparent.png`；SHA-256 为 `7223ed3f753929e35d1960766da589e49b22bc3188866ab5b3ca87493fdff0f2`。
- 每个姿势均为一次生成的完整人宠主体，没有离线或运行时人物/宠物分层拼接。
- 原始 PNG SHA-256：`762fc1ed4ebb6429c17ed261f728e5db6bfabe57d818b0fb6b7a2e54774cc3d6`。
- 原始 PNG 已转存像素无损 WebP：`source/mounted-keypose-raw.webp`；WebP 文件 SHA-256 为 `3f75b8d044a21cc9ed1673be4efed5b686708da55404f446e596e148d1988d5f`，解码 RGB 像素哈希与原 PNG 同为 `097016c585b157bb32c4396d3a694e33074763264a01165c940d16cbcd6386b0`。
- 去色键采用 `remove_chroma_key.py --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill`，随后由 `tools/build_pet_art_bundle.py` 统一比例、feet 基线和 512px 透明关键姿势。
- 透明关键姿势板 SHA-256：`6596f82ff5bda5e5af8b50f85a75b42b060fd5b39f2ce70eeab004e17a6db5f5`。精确提示词、原图 SHA、无损归档、处理参数和联系表证据均在本目录或 `.run/art_batch_phase320/driftfox_mounted/evolved/` 留痕。
- 石器时代 8.0 只作为成熟 2.5D 骑乘构图质量参考，不复制其人物、宠物、鞍具、贴图或动画。
- 当前关键姿势工程自评通过，项目所有者视觉验收为 `pending`；不得宣称正式批准、真八向或完整骑乘包。
