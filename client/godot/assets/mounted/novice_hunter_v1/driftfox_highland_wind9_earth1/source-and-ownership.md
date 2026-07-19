# 来源与权属

- 资产：见习猎人骑高地风狐前/背三分之四 AI 整图关键姿势。
- 生成日期：2026-07-19。
- 生成方式：OpenAI 内置图像生成；输入仅为 Beastbound 自有的高地风狐与见习猎人身份参考。
- 宠物参考：`../../../pets/driftfox_highland_wind9_earth1/identity/identity-board-transparent.png`；SHA-256 为 `73dd9cf69f8c56e718688a7f7ca990842ee258758346f42d07123c3dcb031a0f`。
- 人物参考：`../../../characters/novice_hunter/identity/processed/sheet-transparent.png`；SHA-256 为 `7223ed3f753929e35d1960766da589e49b22bc3188866ab5b3ca87493fdff0f2`。
- 每个姿势均为一次生成的完整人宠主体，没有离线或运行时人物/宠物分层拼接。
- 原始 PNG SHA-256：`771d774cb0368c04ed184768eaf3c5ba84a7ccb90344e4923f5d41c77ea68a7a`。
- 原始 PNG 已转存像素无损 WebP：`source/mounted-keypose-raw.webp`；WebP 文件 SHA-256 为 `d4bad5ca561b8e85786b638c9146c0ae85876548134fe747c81a2509fd4cd3e3`，解码 RGB 像素哈希与原 PNG 同为 `888ff4ce008e6e830ccddb8a5ca9a94577302fb8c5262f36d687c26d16c79c38`。
- 去色键采用 `remove_chroma_key.py --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill`，随后由 `tools/build_pet_art_bundle.py` 统一比例、feet 基线和 512px 透明关键姿势。
- 透明关键姿势板 SHA-256：`3b08f071c638e2631330513f97c7342450190e7de3b627aeb9c1ef19a8dce134`。精确提示词、原图 SHA、无损归档、处理参数和联系表证据均在本目录或 `.run/art_batch_phase320/driftfox_mounted/highland/` 留痕。
- 石器时代 8.0 只作为成熟 2.5D 骑乘构图质量参考，不复制其人物、宠物、鞍具、贴图或动画。
- 当前关键姿势工程自评通过，项目所有者视觉验收为 `pending`；不得宣称正式批准、真八向或完整骑乘包。
