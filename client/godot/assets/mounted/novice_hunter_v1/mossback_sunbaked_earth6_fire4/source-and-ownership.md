# 来源与权属

- 资产：见习猎人骑晒甲苔背兽前/背三分之四整图关键姿势。
- 生成日期：2026-07-19。
- 生成方式：OpenAI 内置图像生成；两张输入仅作为 Beastbound 自有的晒甲苔背兽与见习猎人身份参考。
- 宠物参考：`../../../pets/mossback_sunbaked_earth6_fire4/identity/identity-board-transparent.png`；SHA-256 为 `b707f11b1305222693568dd3b1c886026976f50472e80fd4a52207daf145d19a`。
- 人物参考：`../../../characters/novice_hunter/identity/processed/sheet-transparent.png`；SHA-256 为 `7223ed3f753929e35d1960766da589e49b22bc3188866ab5b3ca87493fdff0f2`。
- 每个骑乘姿势均为一次生成的完整人宠主体，没有离线或运行时人物/宠物分层拼接；厚甲、粗肢、干裂和干地衣由模型整体重绘，不是湿地型调色。
- 原始 PNG SHA-256：`e12274b5f854fcd0e420243ef095f9137fd039e4f5eacbf10761b7583b7014d3`。
- 原始 PNG 已转存像素无损 WebP：`source/mounted-keypose-raw.webp`；WebP 文件 SHA-256 为 `6b5f37542a2a6ccb81e61b643c65cd0c4570cc4fdcf060306b77f1ce6edd9f9c`。
- 生成结果采用纵向两格源板且带非主体边框；只用 `tools/repack_chroma_sprite_grid.py` 整主体重排并剔除边框，再去色键和规范化，没有重绘、拼接或局部补缝。
- 透明关键姿势板 SHA-256：`701e18a7cb393718d9e726af9a44252fdfbe8d45c688fb8f3362c22a267b443e`。
- 可复建参数在 `source/mounted-keypose-source-meta.json`、`source/mounted-keypose-repack-meta.json` 和 `source/mounted-keypose-pipeline-meta.json`；联系表位于 `.run/art_batch_phase320/mossback/sunbaked/`。
- 石器时代 8.0 只作为成熟骑乘构图质量参考，不复制其人物、宠物、鞍具、贴图或动画。
- 当前关键姿势工程自评通过，项目所有者视觉验收为 `pending`；不得宣称正式批准或完整骑乘包。
