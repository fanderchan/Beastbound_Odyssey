# 来源与权属

- 资产：见习猎人骑晶甲乌力的前/背三分之四整图关键姿势。
- 生成日期：2026-07-19。
- 生成方式：OpenAI 内置图像生成；输入仅使用 Beastbound 自有的晶甲乌力身份板与见习猎人身份板。
- 宠物参考：`../../../pets/wuli_evolved_crystal_earth8_water2/identity/identity-board-transparent.png`，SHA-256 `8ecf812e960c8c2dd1ba4200613cb2327495ab5d2e462b8e8be6ac39a7421ccb`。
- 人物参考：`../../../characters/novice_hunter/identity/processed/sheet-transparent.png`，SHA-256 `7223ed3f753929e35d1960766da589e49b22bc3188866ab5b3ca87493fdff0f2`。
- 每个姿势都是一次生成的完整人宠主体，没有离线或运行时人物/宠物分层粘合。
- 原始 PNG SHA-256：`e4698a20ca450cfa944d65c3a245de16dda79ef356acfd436fda4cd46a256021`；像素无损 WebP SHA-256：`a545001ceb614e50bfdce4d902ec26adea4e9cada7b7fa9a44e85563b777b31a`。
- 透明关键姿势板 SHA-256：`cb0163a2458f1762d41b6df71fb56e7a5334c9d4934b2ab12d8730896ec6f4ba`。
- 处理只包含洋红背景去除、共同比例、feet 基线与透明画布规范化；肩堡与人物接触关系来自一次生成，不是后期遮罩补缝。
- 石器时代 8.0 只用于成熟骑乘构图质量参考，不复制其人物、宠物、鞍具、贴图或动画。
- 当前为工程自评通过、项目所有者视觉验收 `pending`；不是正式、运行时或发行批准。

<!-- phase326-crystal-world:start -->
## Phase326 世界八方向候选

- 范围：安装 40 帧见习猎人骑晶甲乌力的 integrated whole-frame world true8 候选；每帧均为一次生成的人宠完整主体，不使用离线或运行时分层合成。
- 生成器：Codex 内置 `image_gen`；输入仅为 Beastbound 自有身份板、已验真方向参考和本次留存生成结果。
- 归档：`source/world/` 保存每个生成组的 raw、repacked、repack/pipeline 元数据、全部 512px 源帧、逐行取舍、参考输入与逐文件 SHA-256。
- 后处理：只做色键、切格、整体缩放、脚底锚定、透明清理和 512→256 确定性派生；没有程序重画主体。
- 审核证据：Phase326 v3 自评与独立盲审已通过；盲审报告 `.run/evidence/phase326_crystal_wuli_world/candidate/phase326-crystal-wuli-world-v3/phase326-blind-audit.json`（SHA-256 `1f320705f6e55eaaf1bb459e92cdc375a09dc78dc9243019cf0021f8d1b93549`），证据索引 `.run/evidence/phase326_crystal_wuli_world/candidate/phase326-crystal-wuli-world-v3/evidence-index.json`（SHA-256 `05e09302dbe68d19102ecd51edeca1c4327c8700b49f81391d14764a23056d29`），语义批准清单 `client/godot/data/world_semantic_direction_approval_crystal_wuli_v1.json`（SHA-256 `a2f9e80841ffa3c547691afb53220d51dd82fb6b6c5f25cdca0b2c71aad475ed`）。
- 当前状态：`self_review_passed_owner_pending`；项目所有者验收仍 pending，`runtimeEnabled=false`。
- 替换路径：从归档身份/方向参考与生成记录重生成全部独立方向，再通过运行时精确帧、盲审、Godot 与 owner gate。
<!-- phase326-crystal-world:end -->
