# 来源与权属

- 资产：见习猎人骑雾潮鳍兽前/背三分之四整图关键姿势。
- 生成日期：2026-07-19。
- 生成方式：OpenAI 内置图像生成；两张输入仅作为 Beastbound 自有的雾潮鳍兽与见习猎人身份参考。
- 宠物参考：`../../../pets/tidefin_mist_water8_wind2/identity/identity-board-transparent.png`；SHA-256 为 `61810db6852529bf788bfae5a0a40012fc64f3af3c5e6656f248d2eb24799dc6`。
- 人物参考：`../../../characters/novice_hunter/identity/processed/sheet-transparent.png`；SHA-256 为 `7223ed3f753929e35d1960766da589e49b22bc3188866ab5b3ca87493fdff0f2`。
- 每个骑乘姿势均为一次生成的完整人宠主体，没有离线或运行时人物/宠物分层拼接。
- 原始 PNG SHA-256：`a88a5863ba6616dc06ef7d6ee720804b6b0c1c81940b747f2536121860b395d5`。
- 原始 PNG 已转存像素无损 WebP：`source/mounted-keypose-raw.webp`；WebP 文件 SHA-256 为 `8474546bfee81562472d17d1bac062c731e6a352c42d250eadb6fd2da8eb9ce4`，解码 RGB 像素哈希与原 PNG 同为 `9b47fcd46c520d16d587bc50af31d820b433d52e3f51545e1a2cb456909759bb`。
- 去色键采用 `remove_chroma_key.py --auto-key border --soft-matte --despill`，随后由 `tools/build_pet_art_bundle.py` 统一比例、feet 基线和 512px 透明关键姿势。
- 透明关键姿势板 SHA-256：`f66b1caf11334727e451bc5106a225584b61485df3dad5f28cfb0853f4665b73`。生成合同、原图 SHA、无损归档、处理参数和联系表证据均在本目录或 `.run/art_batch_phase320/tidefin/mist/` 留痕。
- 石器时代 8.0 只作为成熟骑乘构图质量参考，不复制其人物、宠物、鞍具、贴图或动画。
- 当前关键姿势工程自评通过，项目所有者视觉验收为 `pending`；不得宣称正式批准或完整骑乘包。
