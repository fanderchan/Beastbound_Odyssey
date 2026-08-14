# 见习猎人骑乘芽耳布伊资产来源与归属记录

- 世界资产 ID：`mounted_action_novice_hunter_v1_bui_novice_sprout_v1`；战斗资产 ID：`mounted_action_novice_hunter_v1_bui_novice_sprout_v2`。
- 资产范围：八个独立世界方向，每方向 `idle 1 + walk 4`，共 40 张 256×256 完整骑乘运行帧。
- 制作日期：2026-07-18。
- 来源类型：为 Beastbound Odyssey 原创、AI 辅助生成；使用 OpenAI 内置图像生成能力。
- 外部输入：没有使用、描摹、切取或拼接 StoneAge 8.0、石器时代私服、第三方游戏或图库资产。石器时代只用于研究成熟 2.5D 骑乘画面的方向、比例与可读性。
- 关键边界：每帧都是 AI 整体绘制的“人物+宠物+鞍具”单一主体。运行时不再组合人物层、宠物层、鞍垫层或近景遮挡层。
- 后处理：只对完整主体整体去背景、裁切、等比缩放和脚底对齐；不改变人物与宠物之间的相对比例或接触关系。
- 可替换性：按 `identity/identity-lock.md` 与 `prompts/generation-contract.md` 逐方向重新生成，然后通过 40 帧唯一性、边缘、基线、循环、Godot 真机和性能门禁。
- 发布状态：工程静态自评通过，项目所有者视觉验收仍为 `pending`；不得据此宣称用户已接受最终比例或审美。

## 历史战斗候选来源诊断（2026-08-13，已由 Phase 427 取代）

- 当前另有双斜向 12 动作／180 张 256×256 运行候选帧和 `qa/battle-v2/processing-summary.json`；它们只用于隔离实机视觉审查，不属于已闭环的正式来源包。
- processing summary 记录了 12 张动作母板的 SHA-256，但目录内没有 `source/`、原始母板、512px 源帧或 source ledger。
- 已对当前 `.run` 的 47,011 张图片和仓库资产树的 19,709 张图片逐文件计算 SHA-256；12 个记录母板哈希均为零命中。不能把母板描述成仍待去重归档。
- 禁止从 256px 运行帧反向放大、重命名或复制来冒充生成源。发布前必须重新生成完整动作源稿，按现行 full archive 合同安装 512px 源帧与 ledger，并重新执行静态、运行 parity、真实 Main 和 owner 门禁。
- 因此战斗候选当前为 `missing_rebuild_required`。即使项目所有者接受现有视频的视觉方向，也只代表方向认可，不会授权普通运行或发布。

以上结论准确描述 Phase 417 当时的旧候选，不再描述当前正式来源包。旧 `qa/battle-v2` 只作为历史证据保留；当前权威来源和运行帧均以 `source/battle`、`qa/battle`、`views` 及 Phase 427 记录为准。

## 正式战斗来源闭环（2026-08-15）

- 双斜向各覆盖 `idle / walk / attack / skill / hurt / defend / dodge / counter / stagger / knockaway / down / revive`，共 24 个视角动作记录、180 张 512×512 透明源帧和 180 张 256×256 运行帧。
- 24 个动作目录分别归档 exact prompt、无损原始生成表、确定性 pipeline 输入、处理参数和 QC；实际为 22 张唯一生成母板。每个视角的 `revive` 按合同精确倒序复用同视角完整 `down` 八帧，不镜像、不插值、不反向放大运行图。
- `source/battle/source-ledger.json` 逐项绑定原始生成图、prompt、pipeline、QC、源帧和运行帧哈希；`source/battle/install-manifest.json` 记录 578 个已验证来源文件、579 个安装文件和 bundle digest `ae0951e4f12eacef50e521746b8d36a3ae32c5da6471212936b47a98c48d1547`。
- 静态审计得到 164 个唯一 RGBA 帧；其余仅为 16 对预期的 `down/revive` 倒序对应，没有额外重复、跨视角镜像、残留洋红、脱离主体或不可接受的尺寸漂移。
- 正式来源包已通过 Godot 12 动作／180 帧、双方最终朝向、19 步导演场、真实 `Main.tscn` 14 段连续审片和原生 Metal 稳态性能检查。完整证据见 `docs/phase_427_sprout_mounted_full_source_closure.md`。
- 来源闭环只消除了“缺源不可提交”的工程阻断，不替代项目所有者审美决定。当前仍为 `ownerReviewStatus=pending`、`runtimeEnabled=false`；普通玩家路径不能读取这套战斗帧。
