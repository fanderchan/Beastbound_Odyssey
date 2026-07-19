# 来源与权属

- 资产：见习猎人骑赤角兽前/背三分之四整图关键姿势。
- 生成日期：2026-07-19。
- 生成方式：OpenAI 内置图像生成；两张输入仅作为 Beastbound 自有的赤角兽与见习猎人身份参考。
- 赤角兽参考：`../../../pets/emberhorn_red_fire8_earth2/identity/identity-board-transparent.png`，SHA-256 `fccc3d100508f8c5b06e9b399a55943d67fa6362a789623c6829935cb52ceaf4`。
- 见习猎人参考：`../../../characters/novice_hunter/identity/processed/sheet-transparent.png`，SHA-256 `7223ed3f753929e35d1960766da589e49b22bc3188866ab5b3ca87493fdff0f2`。
- 每个骑乘姿势均为一次生成的完整人宠主体，没有离线或运行时人物/宠物分层拼接。
- 原始 PNG SHA-256：`57e891e2ce3b9809f920ebeb8cbcd513ae78def4d575bf6978d0c6d82dbe9512`；解码 RGB 像素 SHA-256 `112728727a9ff47d155764eee4b2b9c6b295e761169bb6b756592404e3b43a1d`。
- 原始 PNG 已转存像素无损 WebP：`source/mounted-keypose-raw.webp`；WebP 文件 SHA-256 `7f019144826ed08917679ec1fcc154de1fa15aee3523db6b6dca15f73667461f`，解码像素哈希与原图一致。
- 去色键采用 `remove_chroma_key.py --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill`，随后由 `tools/build_pet_art_bundle.py` 共同比例、feet 基线和 512px 透明关键姿势。
- 透明关键姿势板 SHA-256：`cdc4d8b6dfb9f30b73975f514d9a11d7cb4cf6f5542efec5b6f55fbf8d662b3d`。
- 生成合同、原图 SHA、无损归档、处理参数和联系表证据均在本目录或 `.run/art_batch_phase320/emberhorn/` 留痕。
- StoneAge 8.0 只作为成熟骑乘构图质量参考，不复制其人物、宠物、鞍具、贴图或动画。
- 当前为工程自评通过、项目所有者视觉验收 `pending`；不得宣称正式批准或完整骑乘动作完成。
