# 来源与权属

- 资产：见习猎人骑苇潮鳍兽前/背三分之四整图关键姿势。
- 生成日期：2026-07-19。
- 生成方式：OpenAI 内置图像生成；两张输入仅作为 Beastbound 自有的苇潮鳍兽与见习猎人身份参考。
- 宠物参考：`../../../pets/tidefin_reed_water6_earth4/identity/identity-board-transparent.png`；SHA-256 为 `380397c33047d3e2f993fdb9857553dc6f6a49514185f7d4937e27b57f15c816`。
- 人物参考：`../../../characters/novice_hunter/identity/processed/sheet-transparent.png`；SHA-256 为 `7223ed3f753929e35d1960766da589e49b22bc3188866ab5b3ca87493fdff0f2`。
- 每个骑乘姿势均为一次生成的完整人宠主体，没有离线或运行时人物/宠物分层拼接。
- 原始 PNG SHA-256：`48853018505c09904ec9fbe18d3a14104429aef9159a9c021aa389aa60a4b97c`。
- 原始 PNG 已转存像素无损 WebP：`source/mounted-keypose-raw.webp`；WebP 文件 SHA-256 为 `0d12321164b689b0380ff3095c8f81143e666491490c314613161fd454c3fa0d`，解码 RGB 像素哈希与原 PNG 同为 `49f4d4310f155894eaaff9754d5dda04bab49c358f67fe2b4e5988b82336d928`。
- 去色键采用 `remove_chroma_key.py --auto-key border --soft-matte --despill`，随后由 `tools/build_pet_art_bundle.py` 统一比例、feet 基线和 512px 透明关键姿势。
- 透明关键姿势板 SHA-256：`d677ee68a189a54b094c91317d99197d0d47783e508c1f9b63e769dcb937f764`。生成合同、原图 SHA、无损归档、处理参数和联系表证据均在本目录或 `.run/art_batch_phase320/tidefin/reed/` 留痕。
- 石器时代 8.0 只作为成熟骑乘构图质量参考，不复制其人物、宠物、鞍具、贴图或动画。
- 当前关键姿势工程自评通过，项目所有者视觉验收为 `pending`；不得宣称正式批准或完整骑乘包。
