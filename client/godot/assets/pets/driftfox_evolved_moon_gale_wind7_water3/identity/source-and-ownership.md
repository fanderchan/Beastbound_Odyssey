# 月岚风狐身份资产来源与归属

- 资产 ID：`pet_identity_driftfox_evolved_moon_gale_wind7_water3_v1`
- 资产范围：2×2 原始/透明身份板，以及 `front_3quarter_sw`、`back_3quarter_ne`、`south`、`west` 四个 512×512 透明关键姿势。
- 制作日期：2026-07-19。
- 来源类型：项目内原创、AI 辅助生成；创意图仅使用 OpenAI 内置图像生成能力，后处理只做色键转透明、连通域选择、整体裁切、统一缩放、锚定与安全边检查。
- 同源参考：雾风狐和高地风狐身份板只提供风狐血统与项目绘制语言。月岚风狐通过成年深胸长背、月白颈鬃、严格双尾月牙负形和附着身体的雾岚毛流带形成进化轮廓，不能退化为换色普通风狐。
- 外部输入：未使用、描摹或切取 StoneAge 8.0、私服、第三方游戏、图库、网络九尾狐或其他宠物素材。
- 首稿：`../source/identity-board-v1-edge-touch-raw.png`，SHA-256 `fd58f6c4957a08b5fd096a2ed0bd782991cc249a849d4613cf902d1a25075c02`；右上背视图下尾触碰逻辑格，只作失败证据。
- 正式 key-pose 原稿：`../source/identity-board-raw.png`，SHA-256 `11b5add1bd9249cb23c300e94075276f4d0eee8ffa2ad4de5fb13d9d2f4fd289`。v2 只修正整体缩放、间距与居中，保留双尾结构。
- 透明身份板：`identity-board-transparent.png`，SHA-256 `21a6b80b9ac2895e89cbd44936a8b3aab8bc7dbf29ee78940e58ba6967d6f871`。
- 生成证据：`../prompts/identity-board-v1.txt`、`../prompts/identity-board-v2-containment-fix.txt`；处理参数与逐姿势哈希位于 `../source/identity-board-pipeline-meta.json`。
- 处理工具：`tools/build_pet_art_bundle.py`。最终使用共享缩放、4px 源格/输出安全边，输出四个 RGBA 512×512 姿势；洋红残边为 0。
- 项目归属：这是为 Beastbound Odyssey 本仓库专门制作的原创输出，按项目资产管理；实际使用仍遵守生成服务适用条款。
- 可替换路径：以本目录身份锁和普通风狐同源板重建，先验证每视角严格两尾与开放月牙负形，再做版式修正；随后重新通过 key-pose、真八向、战斗、整体骑乘和 owner review 门禁。
- 发布状态：`identity_locked_self_review_passed_owner_review_pending`。没有登记为运行时素材，也不代表世界、战斗或骑乘美术完成。

<!-- phase343-moon-gale-world:start -->
## Phase343 世界八方向候选

- 范围：40 帧月岚风狐独立 world true8 候选；每方向 1 idle + 4 walk，源帧 512×512，运行帧 256×256。
- 生成方式：Codex 内置 `image_gen`，只使用 Beastbound 自有身份参考；宠物每帧均为独立完整主体。
- 后处理：仅色键、切格、共享缩放、底部居中锚定、透明清理与确定性 512→256 派生；不镜像、不分层拼接。
- 失败留痕：方向漂移、单尾/并尾及翼状毛鳍版本均保留在 `source/world/`，但没有进入运行候选。
- 当前状态：`self_review_passed_owner_pending`；独立语义复核与 owner 连续视频验收 pending，`runtimeEnabled=false`。
- 替换路径：从归档身份板、逐组 prompt、raw、pipeline 与 512px 源帧重生成，再重过语义、运行时和 owner 门禁。
<!-- phase343-moon-gale-world:end -->

<!-- phase345-moon-gale-evolution:start -->
## Phase345 高地风狐→月岚风狐进化候选

- 范围：固定 `front_3quarter_sw` 的 12 帧进化演出；12 FPS、1.000 秒、不循环，源帧 512×512、运行帧 256×256。
- 生成方式：Codex 内置 `image_gen` 分两张 2×3 sheet 原创生成，输入只包含 Beastbound 自有的高地风狐/月岚风狐身份板、正式正面 idle 与纯几何排版参考。
- 连续语义：前四帧保持高地风狐单尾，随后从同一尾根形成上下两条实体尾；成年深胸长背、月白颈鬃、银白月蓝毛色、深青眼和新月纹逐步定型。没有用双宠交叉淡化、浓雾或巨型光效跳过变化。
- 后处理：只做色键、切格、共同比例、脚底锚定、透明清理和确定性 512→256 派生；两张生成图相差 1px 的画布规格仅在远离主体的色键边界做裁补，没有程序重画主体。
- 硬门禁：12/12 源帧与运行帧归档；最大尺寸漂移 0.085308，运行帧最小安全边 6px，脱体组件、源帧残余洋红和运行帧残余洋红均为 0。
- 真实客户端证据：临时、未跟踪的 QA capture 脚本实例化真实 `Main.tscn`，在 Apple M5 Metal 下录制 1280×720、60 FPS、有声 MP4；每张进化帧固定显示 5 个视频帧，两轮均为 12 FPS / `1.00x`。证据位于 `.run/evidence/phase345_moon_gale_evolution/`。
- 当前状态：`self_review_passed_owner_pending`。项目所有者已说明正在休息、无法验收，因此没有代替所有者批准；`runtimeEnabled=false`，也没有修改正式成功回调、进化消耗或路线门禁。
- 替换路径：从本目录逐字 prompt、两张 raw、pipeline、512px 源帧和身份锁重建，再复跑接触表、Godot 加载、真实 1× 成片与 owner review。
<!-- phase345-moon-gale-evolution:end -->

<!-- phase346-moon-gale-standalone-battle-semantic-review:start -->
## Phase346 独立宠物战斗语义复核

- 复核对象：当前两套独立斜向、12 动作、180 张 256×256 运行帧；本阶段没有改动任何动作像素。
- 当前像素证明：显式重导入后逐帧比较源 PNG、Godot import `source_md5` 与 `Texture2D.get_image()`；`180/180` import 新鲜且 canonical RGBA 相同，当前 source-set SHA-256 为 `44c6d77803ea700036fb88028cd893089a67513efc59ffaa1e8203233b19b015`。
- 语义结论：两视角全序列均保持同一只成年银白月蓝风狐和上下双尾；普通攻击、贴体月牙风技能、受击、防御、后撤回避、反击、受创失衡、连续翻滚击飞、螺旋眼昏厥与逐步复起可区分，`down-8 == revive-1` 两视角继续逐 RGBA 相同。
- 真实客户端证据：真实 `Main.tscn` 动作导演以 1280×720、60 FPS、有声、`1.00x` 连续覆盖 14 个场景；2477 帧、41.283333 秒，全片解码通过。证据位于 `.run/evidence/phase346_moon_gale_standalone_battle/`。
- 当前状态：第二遍运行时语义自审通过，但项目所有者正在休息，未观看本次成片，故 battle 仍为 `owner_pending/runtimeEnabled=false`。
- 保留债务：历史 48 帧的 512px canonical 与当前 lean ledger RGBA 不一致没有被本轮消除；Phase346 只证明当前 256px runtime 的真实加载与语义，不能声称重新建立了新鲜 512px canonical。
<!-- phase346-moon-gale-standalone-battle-semantic-review:end -->
