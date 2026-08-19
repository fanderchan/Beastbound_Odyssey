# Phase 487：芽耳布伊冲锋技能反馈正式审片候选

日期：2026-08-19

## 结论

`pet_bui_charge` 已从程序式调试几何推进为一套项目原创的叶／土属性位图反馈，并接入真实 `Main.tscn` 战斗演出。普通命中、闪避和暴击分别具有不同的命中语义；最终 I 版有声视频、资源来源、运行加载、真实性能和 QA 隔离均已形成可复核证据。

当前生命周期只提升到：

- `deliveryStatus=owner_review_pending`；
- `ownerReviewStatus=pending`；
- 没有声明 owner approved；
- 没有把 P2.3 勾为完成；
- 没有提交或推送。

本阶段没有修改技能伤害、命中、闪避、暴击概率、目标选择、服务端结算或协议版本，只改变已经结算事件的客户端视听表达。

## 美术与反馈合同

- 施法／冲锋阶段使用四帧叶风与土尘尾迹，位于行动者身体下方，不遮住角色身份与血条。
- 普通命中在目标处播放四帧土石、叶片与暖色核心爆点；反馈由接触点出现，不用大面积光幕掩盖队形。
- 闪避只让冲锋尾迹穿过已经让开的目标格，不播放命中爆点，避免“画面说命中、结算说闪避”。
- 暴击在同一素材语言上叠加更大、更暖的底层冲击，再绘制主爆点；它比普通命中更重，但没有引入另一套不相干的颜色或粒子语言。
- 位图资源不可用时保留既有程序反馈作为降级路径；正常资源在事件准备时一次加载并缓存，绘制热路径不做文件 I/O。
- 普通玩家界面不显示 asset ready、QA 回执、性能标签或资源路径；这些只存在于自动检查与本地证据。

美术判断为“具备项目所有者审片条件”。叶片、土块、尘雾和暖芯已经形成统一的自然系冲锋质感，明显优于此前被退回的绿圈／扇形调试稿；实战尺寸下也没有喧宾夺主。它仍是单技能的生产样板，不代表其他宠物技能、人物动作、全宠动画或整套战斗特效已经商业化完成。

## 资源与来源

正式资源包：`client/godot/assets/effects/pet_bui_charge_vfx_v1/vfx-bundle.json`。

- charge、impact 各四张 `256×256` 透明运行帧；两组 edge-touch 清单均为空。
- charge 绘制缩放 `0.76`；普通命中 `0.78`；暴击 `0.94`。
- charge 锚点 `[0.5,0.5]`；impact 锚点 `[0.5,0.82]`。
- 两张原始 2×2 母表由 OpenAI 内置图像生成器为本项目原创生成；未复制第三方或商业游戏美术。
- charge 原图 SHA-256：`0a8dcd3add4d0ead958579a36ee122574e480af21868ce0fe714293c37f99bc6`。
- impact 原图 SHA-256：`dfe9251161e9756d002d7931edc0816e2d100a5895213844097b7166fe5c524b`。
- exact prompt、原图、透明处理参数、pipeline metadata、运行帧 SHA-256、权属与替换路径均写入包内 provenance；跟踪元数据只使用 `res://` 项目路径。

## 客户端接线

- `battle_actions.json` 为 `pet_bui_charge` 声明 `leaf_earth_charge` 反馈、阶段参数、调色板和正式 bundle 路径。
- `BattleSkillFeedbackPresentationModel` 从权威战斗事件构造表现计划，不重新计算战斗结果。
- `BattleSkillFeedbackAssetCatalog` 验证 schema、动作／风格、状态、来源、帧路径、阈值、比例与锚点，并在事件开始前缓存纹理。
- `BattleSkillFeedbackRenderer` 消费表现计划和资源快照，分别绘制施法、命中、闪避与暴击；资源失败时只降级视觉，不改变事件结算。
- `PetBattleReviewLab` 的自动回执记录 `planAttached`、`assetReady`、dodge／critical 语义和逐段性能快照，方便在不污染玩家 UI 的条件下阻止空资源或错误分支冒充通过。
- Node 目录检查同步校验原图／运行帧哈希、prompt 与 provenance、无触边清单以及元数据中的本机绝对路径。

## 最终真实 Main 证据

最终 I 版证据位于 `.run/evidence/phase487_bui_charge_feedback_owner_review/phase487-bui-charge-feedback-20260819-i/`，该目录为本地忽略证据，不纳入发布提交。

- MP4：`pet-management-owner-review-1x.mp4`；
- `1280×720 / 30 FPS / 1.00× / 223 frames / 7.433333s`；
- H.264 `yuv420p` + AAC，音视频完整解码；
- MP4 SHA-256：`ccbf6e0ea260ad0650e8ede100414b7a5b6f9783459d1acf2a5e3b1ca298b3b8`；
- 联系表 SHA-256：`092551c27158cb9595a64455105cb3f41be847876398ea575bfa675867a42745`；
- 三段依次为普通技能、闪避、暴击；三段均 `actionId=pet_bui_charge / style=leaf_earth_charge / planAttached=true / assetReady=true`；
- 普通段 `dodged=false / critical=false`，闪避段 `dodged=true / critical=false`，暴击段 `dodged=false / critical=true`。

录制使用正式 Main、真实战斗绘制路径和隔离 QA lane；工具未启动后端、未访问 MySQL、未启用正常玩家档案写入。结束时 QA lane 已清理为 absent，正常玩家目录清单 SHA-256 前后相同。

## 音频

本阶段没有新增或替换声音资产，也没有新增 cue ID。演出复用现有：

- `combat.cast_skill`；
- `combat.hit_skill`；
- `combat.evade`；
- `combat.critical`。

最终 I 版整片为 `-25.6 LUFS`，重建 true peak 为 `-10.3 dBFS`，没有削波或突然的响度峰值。这里只证明当前 cue 与新画面的时序和技术电平可用；项目所有者对整套战斗音频的 `owner_listening_pending` 状态没有被本阶段覆盖。

## 性能证据

真实 20 actor、1280×720 Main 性能包位于 `.run/evidence/phase487_bui_charge_feedback_owner_review/perf/phase487-bui-charge-feedback-perf-20260819-a/`，状态 PASS：

- idle：最低 60 FPS，frame interval p95 `17.745ms`，`process_total p95=0.08ms`，`draw_battle p95=4.63ms`；
- command selection：最低 60 FPS，frame interval p95 `17.882ms`，`process_total p95=0.08ms`，`draw_battle p95=4.62ms`；
- target switch：最低 60 FPS，frame interval p95 `22.131ms`，`process_total p95=0.09ms`，`draw_battle p95=4.57ms`；
- 25 次真实跨帧左键，20 名 actor，正常玩家目录未改变。

target switch 的 frame interval p95 距 `22.222ms` 门槛只有 `0.091ms`，因此记录为窄余量，不夸大为宽裕。该场景本身不播放新特效；最终原生审片中三段特效各自重置逐帧峰值后，`process_total` 最大值分别为 `2.735ms / 1.414ms / 2.576ms`，均低于单帧 `16.67ms` 预算。

## 回归与相邻修正

截至送审候选冻结，已通过：

- `git diff --check`；
- `node tools/battle_action_catalog_check.mjs`；
- Godot 4.7 headless parse；
- action catalog 自动检查 `2/2`；
- pet battle review lab 自动检查 `2/2`；
- 音频 bundle `34/34` 与音频管线 `8/8`；
- 音频 Godot 自动检查 `4/4`；
- `server/node/test/auth-battle-room.test.js` `68/68`。

Firebud v2 正式地图把旧服务端测试夹具使用的 y=10 走廊变成阻挡格。测试夹具已改走同地图的 y=9 畅通走廊，并继续通过权威逐格移动验证；没有放宽地图碰撞、距离或服务端权威规则。

## 发布与隐私边界

最终视频、日志和 summary 中包含本机执行路径，只保存在被忽略的 `.run` 目录，不进入提交。对本次新增行、新文本文件和图片完成的发布前扫描结果为：

- 未发现真实个人目录、临时生成目录、邮箱、私钥、常见访问 token 或 webhook；唯一包含 `.codex/generated_images` 的新增行是目录检查器主动拒绝该路径的失败门，不是被记录的本机路径；
- VFX 目录共有 20 个可跟踪候选文件、`3,775,504` bytes，候选文件名中 `.import / .uid / .DS_Store / AVI / summary / contact-sheet / log` 命中为 0；
- Godot 生成的 12 个 `.import` 文件处于忽略范围，不属于候选；`.godot`、原始 AVI、联系表、视频和日志也不属于本次跟踪范围；
- 14 个 PNG／GIF 经文件类型、系统图片属性和专用 embedded-string 扫描，只出现预期尺寸、格式以及两项标准 sRGB profile；未发现个人路径、用户名、作者、GPS、评论、凭据或可疑来源文本；
- 两份生成 prompt 没有第三方作品、商业游戏角色或在世艺术家风格指令，provenance 明确记录为项目原创生成、未复制第三方或商业游戏美术。

这些结果支持“当前扫描未发现隐私或来源风险”，不表述为无法证明的绝对零风险。正式暂存后还必须对 staged blob 再做一次同类扫描，防止精确范围重放时混入其他工作树内容。

只有项目所有者明确批准最终 I 版后，才允许把 `ownerReviewStatus` 提升为 approved，并在基于真实远端 `main` 的干净克隆中重放精确补丁、重跑发布门禁、显式暂存目标路径、提交和推送。在批准之前，本页只证明候选已经能审，不证明它已发布。
