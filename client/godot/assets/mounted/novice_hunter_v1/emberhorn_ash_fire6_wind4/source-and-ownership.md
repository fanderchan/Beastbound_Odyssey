# 来源与权属

- 资产：见习猎人骑灰烬角兽前/背三分之四整图关键姿势。
- 生成日期：2026-07-19。
- 生成方式：OpenAI 内置图像生成；两张输入仅作为 Beastbound 自有的灰烬角兽与见习猎人身份参考。
- 灰烬角兽参考：`../../../pets/emberhorn_ash_fire6_wind4/identity/identity-board-transparent.png`，SHA-256 `943d7ca9623d1ae4e54f13bfd6bba37918775d2b15b676f6f9a9a64bb05e3013`。
- 见习猎人参考：`../../../characters/novice_hunter/identity/processed/sheet-transparent.png`，SHA-256 `7223ed3f753929e35d1960766da589e49b22bc3188866ab5b3ca87493fdff0f2`。
- 每个骑乘姿势均为一次生成的完整人宠主体，没有离线或运行时人物/宠物分层拼接。
- 原始 PNG SHA-256：`f4671ec111259238448c3d0546f4fd68552d7ea65863f17b68ec225c0da3dba8`；解码 RGB 像素 SHA-256 `b1d14d849f24cf8198fae0a8c638b772c482c8a6920627400efb768233b10f18`。
- 原始 PNG 已转存像素无损 WebP：`source/mounted-keypose-raw.webp`；WebP 文件 SHA-256 `d0133a4d15e62c78986a8e4e78c9bc632577fe27c78400d4da083055eca3e530`，解码像素哈希与原图一致。
- 去色键采用 `remove_chroma_key.py --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill`，随后由 `tools/build_pet_art_bundle.py` 共同比例、feet 基线和 512px 透明关键姿势。
- 透明关键姿势板 SHA-256：`52ad74e352fc9809a5778589318c1ed521aa57858edbd8bb113d9435faf0a769`。
- 生成合同、原图 SHA、无损归档、处理参数和联系表证据均在本目录或 `.run/art_batch_phase320/emberhorn/` 留痕。
- StoneAge 8.0 只作为成熟骑乘构图质量参考，不复制其人物、宠物、鞍具、贴图或动画。
- 当前为工程自评通过、项目所有者视觉验收 `pending`；不得宣称正式批准或完整骑乘动作完成。
