# 来源与权属

- 资产：见习猎人骑岚角兽前/背三分之四整图关键姿势。
- 生成日期：2026-07-19。
- 生成方式：OpenAI 内置图像生成；两张输入仅作为 Beastbound 自有的岚角兽与见习猎人身份参考。
- 岚角兽参考：`../../../pets/emberhorn_gale_fire5_wind5/identity/identity-board-transparent.png`，SHA-256 `2bc5b796e1fcc5e676c829c9fa7f746425e63e8d959f33bc85134ae5017cc917`。
- 见习猎人参考：`../../../characters/novice_hunter/identity/processed/sheet-transparent.png`，SHA-256 `7223ed3f753929e35d1960766da589e49b22bc3188866ab5b3ca87493fdff0f2`。
- 每个骑乘姿势均为一次生成的完整人宠主体，没有离线或运行时人物/宠物分层拼接。
- 原始 PNG SHA-256：`c901c9e7a41db179b52d10156383e9509b6b0e351e3909e9197370119f44f79c`；解码 RGB 像素 SHA-256 `3e58df6d38eba90ee8062d898dbbf68ef56566322ab3487cadf48205dcc7dd19`。
- 原始 PNG 已转存像素无损 WebP：`source/mounted-keypose-raw.webp`；WebP 文件 SHA-256 `1319761da7b56bb710f62174abde7a4dee2674849f8d8fad7f99167f73852514`，解码像素哈希与原图一致。
- 去色键采用 `remove_chroma_key.py --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill`，随后由 `tools/build_pet_art_bundle.py` 共同比例、feet 基线和 512px 透明关键姿势。
- 透明关键姿势板 SHA-256：`80548073c820ef20f362e000c76f77051d9953284bae9a5034372a984d8cdbf2`。
- 生成合同、原图 SHA、无损归档、处理参数和联系表证据均在本目录或 `.run/art_batch_phase320/emberhorn/` 留痕。
- StoneAge 8.0 只作为成熟骑乘构图质量参考，不复制其人物、宠物、鞍具、贴图或动画。
- 当前为工程自评通过、项目所有者视觉验收 `pending`；不得宣称正式批准或完整骑乘动作完成。
