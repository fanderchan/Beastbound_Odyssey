# 来源与权属

- 用途：Beastbound Odyssey 1280×720 宠物图鉴空底板。
- 生成器：Codex 内置 ImageGen；未使用 CLI/API 降级路径。
- 来源：项目所有者提供的界面截图只作为布局、信息层级与材质方向参考。
- 原创边界：未复制、裁切、描摹或嵌入参考产品的宠物、文字、图标、商标、数值或 UI 贴图；运行时文字、宠物画像、技能图标与物品图标由 Godot 独立叠加。
- 原始结果：`source/generated/pet_codex_backdrop_raw.png`，1672×941 RGB PNG，SHA-256 `4bca05805e5f15264fcfd89487c4d7f33747c003b269a0c0ae1237e7aa3a6e86`。
- 运行结果：`runtime/pet_codex_backdrop_1280x720.png`，1280×720 RGB PNG，SHA-256 `863e7c86b5f8f8219d971a6db6bd12f537a5884c4628dc86e56a19010bc17470`。
- 派生方式：macOS `sips` 高质量缩放到正式 PC 基准尺寸；没有再次绘制或加入烘焙文字。
- 运行状态：`runtimeEnabled=true` 仅表示可由客户端加载；项目所有者明确验收前，主观视觉状态为 `owner_review_pending`。
- 替换路径：保持同一三栏安全区，重新生成 source，派生 runtime，并同步更新哈希、截图与 Design QA。
