# 晶甲乌力来源与归属

- 资产性质：项目原创、AI 辅助生成的正式进化身份关键姿势候选。
- 生成器：Codex 内置 `image_gen`；没有使用 CLI/API 降级路径。
- v1 原始生成文件：`/Users/fander/.codex/generated_images/019f793a-39a2-75a0-b92d-5da72beaeba2/exec-664e4d52-d8a7-47ec-a093-c8f086294a35.png`。
- v1 项目留存：`source/identity-board-v1-edge-touch-raw.png`；逐字 prompt：`prompts/identity-board-v1.txt`；因右下格边缘不安全而保留为失败证据。
- v2 原始生成文件：`/Users/fander/.codex/generated_images/019f793a-39a2-75a0-b92d-5da72beaeba2/exec-3a03514c-c293-4e14-a1eb-18f98ede1410.png`。
- v2 项目留存：`source/identity-board-raw.png`；逐字修正 prompt：`prompts/identity-board-v2-containment-fix.txt`。
- 生成日期：2026-07-19；确定性处理报告：`source/identity-board-pipeline-meta.json`，失败报告：`source/identity-board-v1-edge-touch-pipeline-meta.json`。
- 生成输入：v1 只使用项目自有高防乌力身份板作为进化源血统、镜头与质量参考；v2 只使用 v1 晶甲乌力作为身份参考并修正留白。
- 外部资产：无。没有复制 StoneAge/SA80、知名游戏角色或第三方宠物素材。
- 所有权意图：专为 Beastbound Odyssey 生成并纳入项目资产管线。
- 允许后处理：色键清理、单元切分、整体缩放、居中、透明画布归一化和边缘清理；不允许程序重画身体、拼接不同宠物或用普通乌力换色冒充进化。
- 替换路径：从 `identity/identity-lock.md` 与保存的逐字 prompt 重新生成，再通过同一身份、色键、方向、mounted whole-frame、Godot、战斗和 owner review 门槛。
- 当前状态：`identity_locked_self_review_passed_owner_review_pending`；不是运行包，也不是 release approved。

<!-- phase326-crystal-world:start -->
## Phase326 世界八方向候选

- 范围：安装 40 帧宠物 world true8 候选；`pet-b` 只采用北/东北，错误朝西的东向和错误朝西南的东南向仅留失败证据，东/东南运行帧来自专门重生成组。
- 生成器：Codex 内置 `image_gen`；输入仅为 Beastbound 自有身份板、已验真方向参考和本次留存生成结果。
- 归档：`source/world/` 保存每个生成组的 raw、repacked、repack/pipeline 元数据、全部 512px 源帧、逐行取舍、参考输入与逐文件 SHA-256。
- 后处理：只做色键、切格、整体缩放、脚底锚定、透明清理和 512→256 确定性派生；没有程序重画主体。
- 审核证据：Phase326 v3 自评与独立盲审已通过；盲审报告 `.run/evidence/phase326_crystal_wuli_world/candidate/phase326-crystal-wuli-world-v3/phase326-blind-audit.json`（SHA-256 `1f320705f6e55eaaf1bb459e92cdc375a09dc78dc9243019cf0021f8d1b93549`），证据索引 `.run/evidence/phase326_crystal_wuli_world/candidate/phase326-crystal-wuli-world-v3/evidence-index.json`（SHA-256 `05e09302dbe68d19102ecd51edeca1c4327c8700b49f81391d14764a23056d29`），语义批准清单 `client/godot/data/world_semantic_direction_approval_crystal_wuli_v1.json`（SHA-256 `a2f9e80841ffa3c547691afb53220d51dd82fb6b6c5f25cdca0b2c71aad475ed`）。
- 当前状态：`self_review_passed_owner_pending`；项目所有者验收仍 pending，`runtimeEnabled=false`。
- 替换路径：从归档身份/方向参考与生成记录重生成全部独立方向，再通过运行时精确帧、盲审、Godot 与 owner gate。
<!-- phase326-crystal-world:end -->
