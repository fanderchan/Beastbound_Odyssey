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

<!-- phase340-crystal-mounted-battle:start -->
## Phase340 骑乘战斗双视角候选

- 范围：完成 `front_3quarter_sw` 与 `back_3quarter_ne` 两个独立视角的 12 组动作，共 180 帧；包含 `idle / walk / attack / skill / hurt / defend / dodge / counter / stagger / knockaway / down / revive`。
- 生成器：OpenAI 内置 `image_gen`；输入只使用 Beastbound 自有的晶甲乌力、见习猎人及其已冻结骑乘身份参考。
- 主体规则：每帧都是见习猎人与晶甲乌力的一体化完整主体，没有离线或运行时人物/宠物分层拼接，也没有用镜像冒充另一视角。
- 骑乘关系：人物保持成人比例，坐点固定在肩部晶堡之后；晶体不穿入人物躯干，人物也不缩成不合比例的小人。
- 动作连续性：`down-8` 与 `revive-1` 在源帧和运行时帧均为完全相同的 RGBA；起身序列由对应倒地姿势确定性反向派生，避免倒地瞬间换模。
- 取舍记录：生成过程中淘汰了正反视角混淆、白色网格残留、跨格/触边、反面动作退化为橙色乌力，以及击飞结尾错误回到待机等候选。
- 归档：仓库采用 lean 归档，正式运行时帧、代表性无损源文件、生成/处理元数据和逐文件账本保存在本目录；完整本地生产归档位于 `.run/art_batch_phase340/crystal_wuli_mounted/`。
- 证据：`qa/battle/contact-sheet.png`（SHA-256 `aed3935da5ccfa636c4222c59b015f9b86eb87d4eace4b3aacc834eee98272f9`）；`qa/battle/qc-summary.json`（SHA-256 `10fb881d1c0cf980d8c2e81e291dee685545850085682f7ed07f611ab528dfc8`）；`source/battle/source-ledger.json`（SHA-256 `443b011293592ba9be452111f28e1a2b908960cab231431ec85afda387c2ec26`）。
- 当前状态：工程自检候选完成，项目所有者验收仍为 `pending`，`runtimeEnabled=false`；在项目所有者确认 1× 动态证据前不进入玩家运行时。
- 替换路径：从本目录身份锁、生成合同与完整本地生产归档重新生成，再依次通过安装审计、Godot 资产检查、1× 动态复核和 owner gate。
<!-- phase340-crystal-mounted-battle:end -->

<!-- phase352-crystal-mounted-battle-semantic-review:start -->
## Phase352 骑乘战斗第二遍运行时语义复核

- 本阶段没有修改任何动作像素、玩法代码、数值、服务端、玩家档案、路线门禁或运行时开关。
- 当前双视角 12 动作、180 张运行 PNG 与 Godot 实载 canonical RGBA `180/180` 一致，也与 `source/battle/source-ledger.json` 的逐帧 RGBA `180/180` 一致。
- 24 组动作的 prompt、pipeline 与 QA 来源文件哈希 `72/72` 一致；lean 归档的 2 份代表性无损源文件及其 decoded RGBA `2/2` 一致；当前安装清单 `307/307` 一致。
- 当前 180 帧包含 164 张唯一 RGBA。16 组完全重复全部是两个视角各 8 组 `down-1..8` 与 `revive-8..1` 的既定精确反向帧；意外重复为 0，跨视角水平镜像对为 0。
- 真实 `res://scenes/Main.tscn` 以 `1.00x`、1280×720、60 FPS 连续复核 14 段：行进、攻击、技能、防御承压、受击、反击、致死反击负伤归位、三骑合击、回避、回避反击、直飞、弹飞、倒地与复起。
- 自审确认成年人物比例、肩堡后方坐点、人物/坐骑整体连续、普通攻击与技能区分、防御与受击区分、可见回避后撤、击飞与非击飞倒地边界、倒地到复起连续性；没有观察到人物掉骑、运行时分层或晶体穿入人物。
- 跟踪报告：`qa/battle/semantic-review-v2.json`（SHA-256 `6923857e32a44ed92eac4e1888dd53de7ad52b2d75168a4c1165ff44a112de0d`）。
- 1× 成片：`.run/evidence/phase352_crystal_wuli_mounted_battle/Beastbound_Phase352_Crystal_Wuli_Mounted_Semantic_1x.mp4`（SHA-256 `b195b5a3bd0ebf54967f7c00e591e2faa2cbb60b9387afd946bf14a8f1bd2f85`）。
- 当前状态只是 Codex 独立语义自审通过；项目所有者尚未观看本轮成片，`ownerReviewStatus=pending`、各动作 `owner_review_pending`、`runtimeEnabled=false` 均保持不变。
<!-- phase352-crystal-mounted-battle-semantic-review:end -->

<!-- phase353-crystal-mounted-world-semantic-review:start -->
## Phase353 完整骑乘世界真八向第二遍去标签审核

- 本阶段没有修改任何世界图片、战斗图片、玩法代码、数值、服务端、玩家档案、路线门禁或运行时开关。
- 将八个世界方向随机编码为 A–H，只展示每组 `idle + walk 1..4`；在读取映射前先冻结方向、身份、比例、坐点和步态判断，揭示后 `8/8` 命中。
- 当前 40 张世界 PNG 与 Godot 实载 canonical RGBA `40/40` 一致；当前文件/decoded RGBA 与冻结 QC、运行/源帧来源账本及 Phase326 方向清单均 `40/40` 一致。
- 40 帧 decoded RGBA 全部唯一，完全重复为 0，跨方向水平镜像对为 0，最小安全边为 14px，透明 RGB 泄漏像素为 0。
- 自审确认成人骑手比例、肩堡后方坐点、人物/坐骑同帧共同起伏、晶甲身份和八向四足步态连续；没有观察到异常小人、坐骑骤缩、坐点漂移、晶体穿人或分层滑动。
- 跟踪报告：`qa/world/independent-semantic-audit-v1.json`（SHA-256 `e22a0e23a010b6e23c18f07080dcd3ec2fc5980d7956f44514e2f7b42b0dcfde`）。
- 因 40 张当前文件逐一吻合 Phase326 冻结清单，继续复用当时同屏展示人物、独立宠物与完整骑乘三包的 1280×720 动态证据；本阶段已重新完成全片解码。
- 当前状态只是 Codex 第二遍技术盲审通过；项目所有者尚未验收，`ownerReviewStatus=pending`、世界动作 `owner_review_pending`、`runtimeEnabled=false` 均保持不变。
<!-- phase353-crystal-mounted-world-semantic-review:end -->
