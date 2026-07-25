# 来源与权属

- 资产：见习猎人骑月岚风狐前/背三分之四 AI 整图关键姿势。
- 生成日期：2026-07-19。
- 生成方式：OpenAI 内置图像生成；输入仅为 Beastbound 自有的月岚风狐与见习猎人身份参考。
- 宠物参考：`../../../pets/driftfox_evolved_moon_gale_wind7_water3/identity/identity-board-transparent.png`；SHA-256 为 `21a6b80b9ac2895e89cbd44936a8b3aab8bc7dbf29ee78940e58ba6967d6f871`。
- 人物参考：`../../../characters/novice_hunter/identity/processed/sheet-transparent.png`；SHA-256 为 `7223ed3f753929e35d1960766da589e49b22bc3188866ab5b3ca87493fdff0f2`。
- 每个姿势均为一次生成的完整人宠主体，没有离线或运行时人物/宠物分层拼接。
- 原始 PNG SHA-256：`762fc1ed4ebb6429c17ed261f728e5db6bfabe57d818b0fb6b7a2e54774cc3d6`。
- 原始 PNG 已转存像素无损 WebP：`source/mounted-keypose-raw.webp`；WebP 文件 SHA-256 为 `3f75b8d044a21cc9ed1673be4efed5b686708da55404f446e596e148d1988d5f`，解码 RGB 像素哈希与原 PNG 同为 `097016c585b157bb32c4396d3a694e33074763264a01165c940d16cbcd6386b0`。
- 去色键采用 `remove_chroma_key.py --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill`，随后由 `tools/build_pet_art_bundle.py` 统一比例、feet 基线和 512px 透明关键姿势。
- 透明关键姿势板 SHA-256：`6596f82ff5bda5e5af8b50f85a75b42b060fd5b39f2ce70eeab004e17a6db5f5`。精确提示词、原图 SHA、无损归档、处理参数和联系表证据均在本目录或 `.run/art_batch_phase320/driftfox_mounted/evolved/` 留痕。
- 石器时代 8.0 只作为成熟 2.5D 骑乘构图质量参考，不复制其人物、宠物、鞍具、贴图或动画。
- 当前关键姿势工程自评通过，项目所有者视觉验收为 `pending`；不得宣称正式批准、真八向或完整骑乘包。

<!-- phase343-moon-gale-world:start -->
## Phase343 世界八方向候选

- 范围：40 帧见习猎人骑月岚风狐 integrated whole-frame world true8 候选；每方向 1 idle + 4 walk，源帧 512×512，运行帧 256×256。
- 生成方式：Codex 内置 `image_gen`，只使用 Beastbound 自有身份参考；骑乘每帧均一次生成完整人宠主体。
- 后处理：仅色键、切格、共享缩放、底部居中锚定、透明清理与确定性 512→256 派生；不镜像、不分层拼接。
- 失败留痕：方向漂移、单尾/并尾及翼状毛鳍版本均保留在 `source/world/`，但没有进入运行候选。
- 当前状态：项目所有者已在 Phase343 连续 1× 成片后批准世界真八方向 `visual_only`；Phase349 去标签第二遍语义复核也已通过，`runtimeEnabled=false`。
- 替换路径：从归档身份板、逐组 prompt、raw、pipeline 与 512px 源帧重生成，再重过语义、运行时和 owner 门禁。
<!-- phase343-moon-gale-world:end -->

<!-- phase344-moon-gale-mounted-battle:start -->
## Phase344 骑乘战斗双视角候选

- 范围：完成 `front_3quarter_sw` 与 `back_3quarter_ne` 两个独立视角的 12 组动作，共 180 帧；包含 `idle / walk / attack / skill / hurt / defend / dodge / counter / stagger / knockaway / down / revive`。
- 生成器：OpenAI 内置 `image_gen`；输入只使用 Beastbound 自有的月岚风狐、成年见习猎人及其已冻结骑乘身份参考。
- 主体规则：每帧都是见习猎人与月岚风狐的一体化完整主体，没有离线或运行时人物/宠物分层拼接，也没有用镜像冒充另一视角。
- 身份门槛：人物保持成人比例与稳定低位落座；月岚风狐始终维持珍珠银白主色、长耳附着毛鳍、长背四足和恰好两条可分别追踪的实体尾巴。
- 动作连续性：`down-8` 与 `revive-1` 在源帧和运行帧均为完全相同的 RGBA；起身序列由最终倒地姿势确定性反向派生，避免倒地瞬间换模。
- 取舍记录：生产中淘汰了技能特效脱离主体、受击/踉跄动作过弱、主体触边，以及反面反击跨格等候选；拒绝稿与最终逐字提示词均保留在完整本地归档。
- 归档：仓库采用 lean 归档，运行帧、代表性无损源文件、逐动作提示词/处理/QC 元数据和逐文件账本保存在本目录；完整本地生产归档位于 `.run/art_batch_phase344/moon_gale_mounted/`。
- 证据：`qa/battle/contact-sheet.png`（SHA-256 `473096a570312306fa47aebb3d92025ac39f7e01d3229f0155323ce42edec0e1`）；`qa/battle/qc-summary.json`（SHA-256 `83f8a56d69ac25743cf41a377e029e140586431173e76c8b08d2b0b52d83b9f2`）；`source/battle/source-ledger.json`（SHA-256 `c9a986ef1bd1b179aefbf12648ec1b8c7cebc5275e8f812242525efec9b7cb26`）。
- 状态边界：Phase343 世界真八方向已获 `visual_only` 批准；本次战斗包仍为工程自检候选，项目所有者验收 `pending`、`runtimeEnabled=false`，不会进入普通玩家运行路径。
- 替换路径：从身份锁、逐动作生成合同与完整本地生产归档重新生成，再依次通过安装审计、Godot 180 帧加载、1× 动态复核和 owner gate。
<!-- phase344-moon-gale-mounted-battle:end -->

<!-- phase348-moon-gale-mounted-battle-semantic-review:start -->
## Phase348 骑乘战斗整图第二遍语义自审

- 本轮没有重生成、重采样或修改任何动作像素；只复核 Phase344 已冻结的双视角、12 动作、180 帧候选。
- 当前 180 张 PNG、Godot import 与实际 `Texture2D` canonical RGBA `180/180` 一致；source-set SHA-256 为 `34b22b2f2818ea26bf6e51064a54545c97edc6561e718895abd5950c5e0a7e63`。
- 当前帧与 `source/battle/source-ledger.json` 的 decoded RGBA `180/180` 一致；16 组完全重复仅来自两视角 `down` 与 `revive` 的确定性反向配对，意外重复为 0、跨视角水平镜像为 0、最小安全边为 4px。
- 真实 `Main.tscn` 以正式 `BattleModel`、骑乘动作目录和整图渲染连续覆盖行进、攻击、技能、防御承压、受击、反击、致死反击负伤归位、三人合击、回避、回避反击、直线击飞、场边弹飞、倒地和复起共 14 段。
- 39.533333 秒成片为 1280×720、60 FPS、有声、全程 `1.00x`；MP4 SHA-256 为 `edfb2e1975b6b97091600327d2aea6db4048018aa53e730691ff3ebf8963a390`。录制脚本只为审片隐藏顶部状态、指令和计时面板，没有修改普通玩家运行时代码。
- 自审未观察到人物/坐骑分离、异常缩放、骑手幼体化、明显穿模、单尾/多尾漂移或动作中途换视角；直飞与弹飞均由真实事件状态 `launched` 驱动，普通致死反击和可复起倒地继续保持非击飞。
- 跟踪报告：`qa/battle/semantic-review-v2.json`，SHA-256 为 `d73a3e3ad987b50bed5afc65032dceef5936475deeee36ca14feecb6a5df7fc2`。
- 当前状态仅提升为 `independent_semantic_self_review_passed_owner_pending`；项目所有者尚未观看本次成片，`ownerReviewStatus=pending`、`runtimeEnabled=false` 均保持不变。
<!-- phase348-moon-gale-mounted-battle-semantic-review:end -->

<!-- phase349-moon-gale-mounted-world-independent-semantic-audit:start -->
## Phase349 人物骑乘世界真八向去标签语义复核

- 复核对象：Phase343 已获 `visual_only` 批准的见习猎人骑月岚风狐完整整图 world true8，共 40 张 256×256 运行帧；本阶段没有修改任何世界帧像素。
- 盲审方法：随机打乱八个方向，只显示 A–H 与每条 `idle + walk 1..4`；在读取编码映射前冻结方向、比例、坐点和身份观察，揭示后 `8/8` 全部命中。
- 当前像素证明：显式重导入后，源 PNG、import `source_md5` 与 Godot 实载 canonical RGBA `40/40` 一致；与 Phase343 冻结 QC 和源账本的文件/像素哈希也均为 `40/40` 一致。
- 结构证明：40 张 decoded RGBA 全部唯一，完全重复 `0`、跨方向水平镜像对 `0`、最小安全边 `14px`；所有帧均为完整人物骑乘单层整图。
- 语义结论：成人骑手比例、低位坐点、人物/坐骑共同起伏、月岚风狐两条实体尾巴及八向步态连续性均通过；未见异常小人、坐骑骤缩、人物滑层或方向错配。
- 审批边界：这是 Codex 第二遍去标签技术盲审，不是新的项目所有者决定；已有 owner 决定仍只批准完整人物骑乘 world true8 视觉，骑乘战斗、进化、整宠与路线没有新增批准，`runtimeEnabled=false`。
<!-- phase349-moon-gale-mounted-world-independent-semantic-audit:end -->
