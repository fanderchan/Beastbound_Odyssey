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

<!-- phase341-crystal-evolution:start -->
## Phase341 高防乌力→晶甲乌力进化候选

- 范围：`front_3quarter_sw` 12 帧、12 FPS、单次播放的实体长甲进化演出；不参与战斗或服务端结算。
- 生成器：Codex 内置 `image_gen`；没有使用 CLI/API 降级路径。输入只使用 Beastbound 自有高防乌力、晶甲乌力身份板、晶甲乌力正式正面 idle 与纯几何 2×3 布局参考。
- 原始生成：`source/evolution/raw/phase-a-raw.png` 与 `phase-b-raw.png`；逐字提示词为 `prompts/evolution-phase-a.txt`、`prompts/evolution-phase-b.txt`。
- 确定性处理：两个 2×3 原始 sheet 仅按时间垂直拼为 4×3，再由 `tools/build_pet_art_bundle.py` 做色键、切格、共同比例、脚底锚定和统一 512→256 派生。没有程序绘制主体、跨淡化或拼贴两个宠物图层。
- 完整归档：12 张 512px 源帧、12 张 256px 运行帧、逐帧 RGBA SHA-256、原始 sheet、prompt、pipeline metadata、接触表与 GIF 均已入库；本地完整生产档位于 `.run/art_batch_phase341/crystal_wuli_evolution/`。
- 自审：同一低重心乌力血统、岩甲裂开和晶甲实体生长、额盾/肩堡/背甲、琥珀眼转水蓝眼及收光落稳均可逐帧辨认；无跨格、残留洋红或缩放泵动。
- 真实客户端证据：通过临时、未跟踪的 QA capture 脚本实例化真实 `Main.tscn`，在 Apple M5 Metal 下录制 1280×720、60 FPS、有声 MP4；两次 12 帧序列均严格按 12 FPS 播放，每张保持 5 个视频帧，日志为 `speed=1.00x`。证据位于 `.run/evidence/phase341_crystal_wuli_evolution/`，MP4 SHA-256 为 `5199e8f84d1f75ace6d26d9bfe7b9b02a45be69f41517ff5d9f4d0e1da84e276`。
- 所有者决定：项目所有者查看 Phase341 的 1280×720、1× 实机成片后确认“看起来很好”并同意继续；单项决定记录为 `qa/evolution/owner-decision.json`。
- 当前状态：进化视觉单项为 `ownerReview=approved`，但批准范围仅限这段 12 帧动画。整只宠物动作包、骑乘包和进化路线不随之批准；`evolutionVisual.runtimeEnabled=false`、宠物目录 `runtimeEnabled=false`、路线资产门禁与全局进化开关继续关闭。
<!-- phase341-crystal-evolution:end -->

<!-- phase350-crystal-wuli-standalone-battle-semantic-review:start -->
## Phase350 独立宠物战斗语义复核

- 复核对象：当前两套独立斜向、12 动作、180 张 256×256 运行帧；本阶段没有改动任何动作 PNG。
- 当前像素证明：显式重导入后逐帧比较源 PNG、Godot import `source_md5` 与 `Texture2D.get_image()`；`180/180` import 新鲜且 canonical RGBA 相同，当前 source-set SHA-256 为 `13c1b7ffd961c1e446d2c8816200fcc056b47fa3e3654df771cbc20924092485`。
- 账本校正：审计发现提交 `051efeb3b` / `574151a11` 的两次倒地/复活修复已更新运行帧、动作 QA、包 digest 与修复 manifest，却漏同步 21 条 `runtimeFrameRgbaSha256` 和 4 条 `qcSha256`。当前 12 个 KO 表情帧逐一吻合 v2 `afterSha256`，其余 9 个重排帧逐一吻合 v1 `installedSha256`；Phase350 只把运行帧账本从 `159/180` 校正到 `180/180`，并令 prompt/pipeline/QC 来源文件哈希 `72/72`，运行像素改动为 0。
- 结构结论：32/32 修复链终态文件 SHA 吻合，8 组完全重复都来自 manifest 明确记录的倒地稳定保持、倒地到复起交接或复起停留，意外重复为 0；跨视角水平镜像对为 0，两视角 `down-8 == revive-1`。初始 `install-manifest.json` 在原安装提交 `8dc6853dd` 上仍为 `307/307`，明确只作为后续 repair manifest 之前的历史快照。
- 语义结论：低重心乌力血统、冰蓝额晶、肩背晶甲和水晶尾锤在两视角全序列稳定；普通顶撞、晶甲蓄力技能、受击、防御、后撤回避、反击、受创失衡、连续翻滚击飞、失焦/螺旋眼昏厥与逐步复起可区分。
- 真实客户端证据：真实 `Main.tscn` 动作导演以 Forward Mobile、1280×720、60 FPS、有声、`1.00x` 连续覆盖 14 个场景；2477 帧、41.283333 秒，全片解码通过。证据位于 `.run/evidence/phase350_crystal_wuli_standalone_battle/`。
- 当前状态：第二遍运行时语义自审通过，但项目所有者正在休息、未观看本次成片，故 battle 仍为 `owner_pending/runtimeEnabled=false`。
- 保留债务：战斗包采用 lean archive，仓库没有完整 512px 源帧；本轮只证明当前 256px runtime、既有修复链和逐帧账本，不声称补齐完整源帧归档，也不扩大 Phase341 已批准的进化视觉范围。
<!-- phase350-crystal-wuli-standalone-battle-semantic-review:end -->

<!-- phase351-crystal-wuli-world-independent-semantic-audit:start -->
## Phase351 世界真八向去标签语义复核

- 复核对象：当前独立宠物八方向各 `idle 1 + walk 4`，共 40 张 256×256 运行帧；本阶段没有改动任何世界 PNG。
- 去标签审核：用系统随机顺序把八方向编码为 A–H，只显示五帧序列；读取映射前冻结方向与身份判断，揭示后 `8/8` 命中。
- 当前像素证明：40/40 当前 PNG 与冻结 QC、运行帧来源账本、512px 入选源帧账本和 Phase326 方向批准清单一致；40 张 decoded RGBA 全部唯一，完全重复 0、跨方向镜像 0、最小安全边 14px。
- Godot 实载：显式刷新 import 后，40/40 import 新鲜，当前 PNG 与 `Texture2D.get_image()` canonical RGBA 一致；source-set SHA-256 为 `9be353662a83f84d805ac5b5bdcfffe047b08d4658b99c2f72cc49b3ae3860a4`。
- 跟踪证据：`qa/world/independent-semantic-audit-v1.json`（SHA-256 `d134f2c73e20de1e2a7d8f4e215198a086c35e3ca187a21a26bd40d501b6b0d6`）；临时盲审与运行报告位于 `.run/evidence/phase351_crystal_wuli_world_blind/`。
- 动态证据：因当前 40 张文件逐一吻合 Phase326 冻结批准清单，继续复用当时 1280×720、30 FPS、14.433333 秒的 Godot 审片录像（SHA-256 `c42f95b68e11ffad2496373f5e53ab50d37ff1af5b2bcde43a5b4bf6a349628b`）；本轮已再次完整解码通过。
- 审批边界：这是 Codex 第二遍技术盲审，不是项目所有者批准。项目所有者尚未验收独立世界与完整骑乘世界，`ownerReview=pending`、`runtimeEnabled=false` 均保持不变。
<!-- phase351-crystal-wuli-world-independent-semantic-audit:end -->
