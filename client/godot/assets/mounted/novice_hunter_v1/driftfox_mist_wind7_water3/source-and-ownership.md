# 来源与权属

- 资产：见习猎人骑雾风狐前/背三分之四 AI 整图关键姿势。
- 生成日期：2026-07-19。
- 生成方式：OpenAI 内置图像生成；输入仅为 Beastbound 自有的雾风狐与见习猎人身份参考。
- 宠物参考：`../../../pets/driftfox_mist_wind7_water3/identity/identity-board-transparent.png`；SHA-256 为 `eb22219573c923d948b79cf9217fcd357f30c1f62562912adbfec8555529903e`。
- 人物参考：`../../../characters/novice_hunter/identity/processed/sheet-transparent.png`；SHA-256 为 `7223ed3f753929e35d1960766da589e49b22bc3188866ab5b3ca87493fdff0f2`。
- 每个姿势均为一次生成的完整人宠主体，没有离线或运行时人物/宠物分层拼接。
- 原始 PNG SHA-256：`0b97f59a33a82f0fd7570959443c309e6c61344d10201bce697a594468aa85b1`。
- 原始 PNG 已转存像素无损 WebP：`source/mounted-keypose-raw.webp`；WebP 文件 SHA-256 为 `7663b27d894e0f06ff21a6cc991cfb878a2c549f0400ed5ae8c868a6453deeb2`，解码 RGB 像素哈希与原 PNG 同为 `fde39690d5e72bbd63f56b6b2e7e2f271bdf3a2caf180fa7a057746618d1a873`。
- 去色键采用 `remove_chroma_key.py --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill`，随后由 `tools/build_pet_art_bundle.py` 统一比例、feet 基线和 512px 透明关键姿势。
- 透明关键姿势板 SHA-256：`0fe7ad11256e965e64015348a9c46d08cc429aa2f8e5613228ddd569317109a4`。精确提示词、原图 SHA、无损归档、处理参数和联系表证据均在本目录或 `.run/art_batch_phase320/driftfox_mounted/mist/` 留痕。
- 石器时代 8.0 只作为成熟 2.5D 骑乘构图质量参考，不复制其人物、宠物、鞍具、贴图或动画。
- 当前关键姿势工程自评通过，项目所有者视觉验收为 `pending`；不得宣称正式批准、真八向或完整骑乘包。
