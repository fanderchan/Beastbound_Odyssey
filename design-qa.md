# Phase 377 Design QA：觉醒风格背包与装备对比

## Result

- P0：无。
- P1：无。
- P2：无。最终 `1280×720` 画面中的概览、扩容、拆分、宠物目标、回血、
  五类筛选、装备对比、宠物蛋和骑宠证均没有越界、裁切、假图标或程序员字段。
- 这是基于参考层级和材质语言的 Beastbound 原创适配，不宣称像素级复制。
- 工程 Design QA 已通过；项目所有者的视觉验收仍保持 `owner_review_pending`，
  等待观看最终 1× 视频。

## Comparison target

- 概览参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-4849fe4f-2d51-410e-9f9e-6e53e48e3619.jpg`
- 装备比较参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-e63d479d-4446-4a24-bbe2-32a3c430b48a.jpg`
- 实机概览：Phase377 v5 `frame-02.png`，`4.703125s`；
- 实机红绿比较：Phase377 v5 `frame-11.png`，`32.921875s`；
- 参考和实机均归一化为 `1280×720` 后同屏判断。

## Comparison evidence

- 概览同屏：
  `.run/evidence/phase377_backpack_awakened_owner_review/design-qa-final-v5/overview-reference-vs-runtime.png`
- 装备比较同屏：
  `.run/evidence/phase377_backpack_awakened_owner_review/design-qa-final-v5/compare-reference-vs-runtime.png`
- 最终视频：
  `.run/evidence/phase377_backpack_awakened_owner_review/phase377-backpack-final-v5/backpack-awakened-owner-review-1x.mp4`
- 联系表：
  `.run/evidence/phase377_backpack_awakened_owner_review/phase377-backpack-final-v5/contact-sheet.png`

## Required fidelity surfaces

- Layout：左装备／完整人物、右背包、顶部货币与关闭入口；九装备位和五列背包
  不相互遮挡。
- Material：深色石木背景、暖金框线、木质按钮和橙色关闭按钮保持与近期宠物页
  一致。
- Icons：81/81 物品有真实纹理；货币、装备、消耗、材料、宠物蛋和许可证均无
  emoji、文字图标或截图裁片。
- Controls：筛选、详情、装备、卸下、使用、拆分、丢弃、扩容、宠物目标和取消
  都是可操作控件，并接入真实现有流程。
- Comparison：当前／候选并列，强化与耐久可见，正属性为绿色、负属性为红色，
  同模板不同强化实例不会串选。
- Safety：普通玩家界面不显示实例 ID、schema、测试标志、来源、hash 或 QA
  说明。

## Intentional differences and P3 observations

- 参考图使用蓝／紫／橙品质色块；Beastbound 当前没有权威物品品质字段，因此
  使用统一黑金物品卡。这是避免伪造玩法的合同差异，不是遗漏。
- 物品格为了容纳 `5×4` 与 `15+5` 容量，长名称会省略；点击后详情显示完整名称
  和说明。后续如建立权威品质系统，可同时重新评估卡片密度与颜色。
- 装备比较下半部和按钮列比参考图留白更多，换取 1280×720 下稳定的并排阅读，
  不影响红绿差值和主操作。
- 本轮没有宣称完整屏幕阅读器或 GPU 单帧分析；左键主流程、真实跨帧鼠标压力和
  当前性能探针均已通过。

## Interaction and visual verification

- 22 个连续章节在真实 `Main.tscn`、`1.00x` 中完成；
- 拆分弹窗最终实测 `420×246`，居中且无底部溢出；
- 宠物目标显示芽耳布伊 `281/351`，使用后显示绿色 `+70` 并成为
  `351/351`；
- 三种目标层关闭路径均恰好取消一次，不会重新弹出；
- 装备实例比较先展示同模板 `+1 → +4`，再展示攻击 `+1`、敏捷 `-2`；
- 视频为 `50.166667s / 1505` 帧、H.264/AAC、`1280×720 / 30 FPS`，完整音
  视频解码通过。

final result: engineering_passed; owner_review_pending

---

# Phase 378 Design QA：固定四角色槽与登录后角色入口

## Result

- P0：无。
- P1：无。
- P2：无。最终 `1280×720` 画面没有槽位越界、文字裁切、假加号、程序员字段或
  输入穿透；四张角色卡、返回、创建弹窗与进入按钮均可通过左键完成。
- 本轮按参考图的信息层级重建，但背景、人物、独立头像、槽框和图标均为
  Beastbound 原创 ImageGen 美术；不复制参考角色、像素或商标。
- 工程 Design QA 已通过；正式素材 `ownerReviewStatus` 仍为
  `owner_review_pending`，等待项目所有者观看最终视频。

## Comparison target

- 参考图：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-adee60c3-7c14-489d-8417-9fa7a5c0347d.png`；
- 实机主画面：`.run/character_entry/character_entry_final_1280x720.png`；
- 创建弹窗：`.run/character_entry/character_entry_create_final.png`；
- 同屏比较：`.run/character_entry/character_entry_reference_comparison.png`；
- 视口：参考与实机均按 `1280×720` 判断；实机来自真实 `Main.tscn`。

## Required fidelity surfaces

- Layout：左侧原创完整人物，右侧固定四槽纵排，左上返回，右下进入；树冠、篝火
  和海岸背景提供与参考一致的视觉重心，但不照搬其资产。
- Material：暖砂岩、深木、金色高光和半透明暗槽与近期宠物／背包 UI 统一。
- Cards：选中卡 `420×132`，空卡 `420×132`；空槽加号为正式绘制图标，不是字符。
- Portrait：角色卡使用独立绘制大头照，不从全身像裁切。
- Controls：主角色、副角色、空槽、创建弹窗、输入、取消、恢复主角色均由真实跨帧
  鼠标／键盘事件驱动；右键不是必需输入。
- Safety：玩家界面不显示 `playerId`、slot index、epoch、raw code、QA 说明或后端状态。

## Interaction and evidence

- 角色流自动检查覆盖固定四槽、选择、创建、取消、返回与状态隔离；
- 隔离 QA 后端真实 HTTP 链路覆盖 register、entry、create、select 与 profile sync；
- 预览 CPU render 平均 `0.16ms/frame`；
- idle／真实跨帧 movement 探针均为 `60 FPS`、`process_total=0.04ms`，移动检查
  `status=ok`；
- 最终视频：
  `.run/evidence/phase378_character_entry_owner_review/phase378-character-entry-final-v2/character-entry-owner-review-1x.mp4`；
- 联系表：
  `.run/evidence/phase378_character_entry_owner_review/phase378-character-entry-final-v2/contact-sheet.png`；
- 视频为 `17.966667s / 539` 帧、`1280×720 / 30 FPS / 1.00×`、H.264/AAC，
  完整音视频解码通过；共展示主角色、切换副角色、打开创建、输入名字、取消和恢复
  主角色六个连续状态。

final result: passed

---

# Phase 381 Design QA：世界“角色”入口与角色管理三页

## Result

- P0：无。
- P1：无。
- P2：无。最终 `1280×720` 角色页完整覆盖世界并阻断点击穿透，标题、关闭键、九个
  装备槽、人物全身图、两张宠物大头照、右侧页签、加点行和骑证卡片均未越界。
- 四张参考截图与四个同状态实机帧均按等比适配后分别放入同一个比较输入中检查。实现
  保留参考的全屏木石框架、人物主视觉、右侧纵向分页、属性条、先草稿后确认的加点节奏
  以及“全部／种族”骑证筛选，同时只使用 Beastbound 原创或项目内正式资产。
- 工程 Design QA 已通过；项目所有者的主观画面验收仍以本阶段最终 `1×` 视频为准。

## Comparison targets

- 属性页：
  `.run/evidence/phase381_player_character_owner_review/phase381-20260801T100106.122089Z-8fd4568f/design-qa/attributes_reference_vs_implementation.jpg`；
- 加点页：
  `.run/evidence/phase381_player_character_owner_review/phase381-20260801T100106.122089Z-8fd4568f/design-qa/stat_points_reference_vs_implementation.jpg`；
- 骑证全部：
  `.run/evidence/phase381_player_character_owner_review/phase381-20260801T100106.122089Z-8fd4568f/design-qa/ride_all_reference_vs_implementation.jpg`；
- 骑证种族：
  `.run/evidence/phase381_player_character_owner_review/phase381-20260801T100106.122089Z-8fd4568f/design-qa/ride_species_reference_vs_implementation.jpg`；
- 四状态总览：
  `.run/evidence/phase381_player_character_owner_review/phase381-20260801T100106.122089Z-8fd4568f/design-qa/all_states_reference_vs_implementation.jpg`。

## Required fidelity surfaces

- Layout：世界右下“角色”真实入口，全屏角色页，左装备／中人物／右资料，以及右侧
  `属性 / 加点 / 骑证` 三页结构与参考一致；关闭后恢复世界和右下操作栏。
- Truth：属性页展示项目真实九装备槽，不为匹配参考的六槽外观删槽；骑证页严格只展示
  当前三种真实可骑形态，不用虚构九卡填满版面。
- Controls：四维 `+ / -`、清空本次、一次确认、全部／种族／真实族系筛选都由左键
  工作；加点请求进行中即使关闭再打开也保持禁用，避免旧响应清掉新草稿。
- Assets：加减、锁定和拥有状态使用项目原创透明位图，不再用文字符号或 emoji 冒充
  图标；人物、宠物大头照、装备图标与木质皮肤均来自项目批准目录。
- Safety：不显示虚构称号、家族、气力、怒气、战力、固定百分比或免费洗点；不显示
  raw code、资源路径、schema、接口名、QA 和 agent 文案。

## Runtime and video evidence

- 最终视频：
  `.run/evidence/phase381_player_character_owner_review/phase381-20260801T100106.122089Z-8fd4568f/player-character-owner-review-1x.mp4`；
- 联系表：
  `.run/evidence/phase381_player_character_owner_review/phase381-20260801T100106.122089Z-8fd4568f/contact-sheet.png`；
- 验证摘要：
  `.run/evidence/phase381_player_character_owner_review/phase381-20260801T100106.122089Z-8fd4568f/summary.json`；
- 视频来自真实 `Main.tscn`，为 `33.933333s / 1018` 帧、H.264/AAC、
  `1280×720 / 30 FPS / 1.00×`，完整音视频解码通过；连续展示世界入口、属性、九装备槽、
  加点草稿、减点撤回、清空本次、原子确认、三种真实骑宠、缺证锁定、种族展开、老虎系
  筛选和关闭返回世界。
- 录制使用全新隔离 user-data，未启动后端、未连接 MySQL、未写正常玩家存档。

final result: passed

---

# Phase 379 Design QA：一步到位的人物创建配置与元素配点

## Result

- P0：无。
- P1：无。
- P2：无。最终 `1280×720` 页面没有人物、头像、配点格、名字输入或创建按钮
  越界；四个形象、十点配完、非法状态拦截、随机名、键盘改名和创建回槽均可由真实
  左键／键盘连续完成。
- 参考图与实现图已归一化后放在同一个比较输入中检查。实现保留参考的左侧圆形人物
  列表、中部完整人物和右侧元素木框结构，同时使用 Beastbound 原创背景、人物与 UI
  资产，不复制参考角色、像素或商标。
- 工程 Design QA 已通过；四套人物正式美术仍保持 `owner_review_pending`，等待项目
  所有者观看本阶段最终 `1×` 视频后确认主观视觉结果。

## Comparison target

- 参考图：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-201f4819-096e-4738-80e0-036f6c76109a.jpg`；
- 同状态实现图：`.run/character_creation/character_creation_final00000009.png`；
- 同屏比较：`.run/character_creation/design_qa/reference-vs-implementation.png`；
- 比较状态均为曜石斥候、水元素 10 点、剩余 0 点、名字已填写；实现视口为
  `1280×720`。

## Required fidelity surfaces

- Layout：左上返回、左侧四个独立圆形头像、中部全身展示、右侧四行减号／十格／加号、
  下部名字与创建按钮，视觉层级与参考一致。
- Material：森林海岸背景、半透明深木面板、暖金描边与木质按钮延续当前宠物／背包界面
  的统一材质语言。
- Assets：四个头像和四张全身展示图均为独立正式图片，不从全身像裁头，不使用文字、
  emoji、手绘 SVG、占位框或参考图裁片。
- Controls：四形象切换、元素加减、冲突禁配、剩余点提示、随机名字、真实键盘输入、返回
  与创建均为可操作控件；右键不是必需输入。
- Safety：玩家界面不显示 `appearanceId`、`playerId`、slot index、schema、raw code、
  后端状态、QA 或 agent 文案。

## Runtime and video evidence

- 最终视频：
  `.run/evidence/phase379_character_creation_owner_review/phase379-character-creation-main-final-v5/character-entry-owner-review-1x.mp4`；
- 联系表：
  `.run/evidence/phase379_character_creation_owner_review/phase379-character-creation-main-final-v5/contact-sheet.png`；
- 验证摘要：
  `.run/evidence/phase379_character_creation_owner_review/phase379-character-creation-main-final-v5/summary.json`；
- 真实 `Main.tscn` 依次展示四空槽、打开创建页、四人物切换、剩余 1 点禁止创建、
  地 6 水 4 合法完成、随机名、键盘改名、捕获一次性创建 payload 和权威返回后的新角色
  槽，共 12 个连续章节；
- 视频为 `19.466667s / 584` 帧、H.264/AAC、`1280×720 / 30 FPS / 1.00×`，
  完整音视频解码通过；录制使用全新隔离 user-data，未连接后端且未写玩家存档。

final result: passed

---

# Phase 380 Design QA：随机名按钮边界、名字安全与地属性绿色

## Result

- P0：无。
- P1：无。
- P2：无。最终 `1280×720` 创建页中，“换一个”按钮完整位于右侧配置板内，与姓名
  输入框保持间距且不重叠；地属性文字和六个已点亮格均为绿色。
- 用户问题截图与同状态实机帧已统一为 `1280×720` 后放在同一个比较输入中检查；对比
  状态均为焰芽斗士、地 6／水 3、剩余 1 点、名字为空。
- 玩家可连续左键随机换名；混淆敏感名只显示通用提示并禁用创建，安全随机名可恢复。

## Comparison target

- 用户问题截图：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-16d1ba64-be73-4d8d-adcf-86a79f5741b0.png`；
- 同状态实现图：
  `.run/evidence/phase380_character_name_safety_owner_review/phase380-character-name-safety-final-v1/design-qa/frame-08.png`；
- 同屏比较：
  `.run/evidence/phase380_character_name_safety_owner_review/phase380-character-name-safety-final-v1/design-qa/reference-vs-implementation.png`。

## Required fidelity surfaces

- Boundary：通用次级按钮原有 `150px` 最小宽度不再撑破当前名字行；此处独立使用
  `94×50`，右侧保留 42px 配置板内边距。
- Alignment：姓名输入为 `262×50`，与随机按钮间隔 10px，文字基线、按钮高度和输入框
  高度一致。
- Color：地属性语义统一为绿色；水、火、风继续使用蓝、红、黄，不修改元素数值规则。
- Feedback：受限名字显示“这个名字不能使用，请换一个。”；界面不显示命中词、分类、
  raw code、服务端字段或 QA 文案。

## Runtime and video evidence

- 最终视频：
  `.run/evidence/phase380_character_name_safety_owner_review/phase380-character-name-safety-final-v1/character-name-safety-owner-review-1x.mp4`；
- 联系表：
  `.run/evidence/phase380_character_name_safety_owner_review/phase380-character-name-safety-final-v1/contact-sheet.png`；
- 视频来自真实 `Main.tscn`，为 `22.900s`、`687` 帧、H.264/AAC、
  `1280×720 / 30 FPS / 1.00×`，完整音视频解码通过；
- 连续流程覆盖配置板边界、绿色地元素、三次不同安全随机名、混淆名 `Ｇ · M` 拦截、
  随机名恢复、键盘输入“林岚”和一次性创建 payload；录制使用隔离 user-data，未连接
  后端且未写玩家存档。

final result: passed

# Phase 393 Design QA：PvE 胜利后的世界奖励上漂

## Result

- P0：无。
- P1：无。
- P2：无。最终 `1280×720` 世界画面保持可见，胜利标题与最多五条奖励卡位于中央安全区；
  人物、骑宠、战宠、伙伴经验、人物／宠物升级、石币、背包物品与邮箱物品依次出现，
  没有越界、截字、程序员字段、通用“确定”弹窗或点击阻断。
- 工程 Design QA 与动态媒体门禁已通过；项目所有者尚未观看最终 `1×` 视频，因此
  `ownerReviewStatus=pending`，本结果不代替主观视觉接受。

## Comparison target

- 主要参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-8732b753-37bc-483b-a0ae-4cc94977e89c.jpg`；
- 最终视频：
  `.run/evidence/phase393_battle_outcome_owner_review/phase393-video-foundation-smoke-v2/battle-outcome-owner-review-1x.mp4`；
- 动态联系表：
  `.run/evidence/phase393_battle_outcome_owner_review/phase393-video-foundation-smoke-v2/contact-sheet.png`；
- 代表性满队列帧：
  `.run/evidence/phase393_battle_outcome_owner_review/phase393-video-foundation-smoke-v2/keyframes/frame-06.png`。
- 参考图的“新功能开启：世界首领”按项目所有者说明属于干扰项，不纳入 fidelity surface；
  比较只关注回到世界、奖励文字居中出现、逐条上移与自动收敛。

## Required fidelity surfaces

- Hierarchy：金色“战斗胜利”先建立结算语义，奖励行在中央下方形成稳定纵向队列；背景
  世界、任务栏和 HUD 仍可辨认，不把结算改成遮满全屏的程序式报表。
- Motion：行以固定间隔进入，已有行同步上移，队列完成后整体上漂并淡出；脚本实测
  `upwardMotionObserved=true / fadeObserved=true / queueCompleted=true`。
- Typography：经验、普通奖励、升级和警告有独立明度层级，暗褐半透明卡与描边保证在
  明亮草地上仍可读；最终帧未见中文乱码、裁切或文字碰撞。
- Truth：所有行从当前账号的权威 `profileWriteback` 投影；同一骑宠／战宠实例去重，升级
  只认 `levelsGained/level`，物品显示玩家名称而非 raw item ID。
- Controls：浮层为 `MOUSE_FILTER_IGNORE`，自动结束且不要求点击；正常世界左键与挂机流
  不因结果展示增加新的强制步骤。
- Viewport：正式目标是 PC `1280×720`；没有把移动端、竖屏或触控专属布局冒充已完成。

## Intentional differences and P3 observations

- [P3] 参考图把奖励字叠在“新功能开启”大遮罩上；Beastbound 按明确需求移除该干扰项，
  使用独立胜利标题和暗褐奖励卡，优先保证不同地图亮度下的可读性。
- [P3] 参考画面同时只露出少量细条；实机为覆盖人物、骑宠、战宠、伙伴与物品，将队列
  上限设为五行，旧行上移退出，避免十一项一次性铺满屏幕。
- [P3] 本阶段只改服务端组队 PvE 胜利；失败、逃跑、超时、切磋和庄园战仍保留既有结果
  框，因为这些流程还可能需要损失或对手信息，不能凭一张胜利参考图一并改写。

## Comparison history

| 轮次 | 发现 | 修复 | 复核证据 |
| --- | --- | --- | --- |
| 合同审计 | P1：原组队 PvE 胜利在清掉战斗场景后打开固定 `420×184` 通用确认框；actor 战斗漂字又随 `_end_battle` 清空，不能承担世界结算 | 在清场前冻结权威 view-state，清场回世界后交给独立鼠标穿透浮层 | `--auto-server-battle-target-mapping-check`：`pve_overlay=true` |
| Pass 1 | P1：服务器 `reason="defeat"` 也可能代表敌方被击败，按 reason 会把队友胜利误判为本人失败 | 保留敌方存活与本人 loser 判定，并增加存活队友成为 winner 的回归 | `teammate_victory=true` |
| Pass 1 | P2：关闭房间或重复事件可能重放同一组文字；同宠同时作为骑宠与战宠会重复经验 | 使用 `battleRecordId:accountId` 去重 outcome，并按宠物稳定实例 ID 去重经验 | `pve_dedupe=true`、Presenter 自检通过 |
| Final | 未发现剩余 P0、P1、P2；保留三项有产品边界依据的 P3 差异 | 无进一步改动 | 9.533333 秒真实 Main 视频、12 帧联系表、17/17 SHA |

final result: passed

---

# Phase 392 Design QA：觉醒式交易所全屏三态

## Findings

- P0：无。
- P1：无。
- P2：无。真实 `Main.tscn` 的购买、出售、我的挂单三态均完整落在 `1280×720`；标题、
  货币、关闭、页签、分类、商品／背包卡、详情、上架表单、确认层和主动作没有越界、截断、
  相互遮挡或输入穿透。商品和装备均使用正式 item icon，没有 emoji、字符画、截图裁片、
  假图标或玩家不可理解的程序字段。
- [P3] 第三页签和左侧分类少于参考图。
  - Location：顶部第三页签、购买／我的挂单左侧导航。
  - Evidence：同屏图上排是“购买／出售／公示”及装备、宠物、宠物装备、宠技等分类；
    下排实机只显示“购买／出售／我的挂单”和“全部／装备／道具”。
  - Impact：视觉密度更低，但每个入口都有真实服务合同，不会把宠物交易、公示、预购、
    竞价或收藏伪装成已实现功能。
  - Fix：本轮保留。只有服务端建立对应权威合同后才增加页签或分类。
- [P3] Beastbound 的外框比参考图更深、更具丛林集市质感。
  - Location：全屏外框、底部货车／货箱和中央羊皮纸四周。
  - Evidence：参考图为轻薄木架与大面积浅灰纸张；实机为原创竹木梁、藤叶、暗色货摊和
    暖白羊皮纸，三态结构仍保持同样的顶部页签、左导航、中央列表和右详情顺序。
  - Impact：材质对比更强但阅读区仍明亮，形成 Beastbound 自有视觉身份，不复制商业参考
    像素。
  - Fix：保留原创 `market_awakened_v1`；若所有者反馈长期阅读过暗，再只调整外框亮度，
    不更换真实控件层级。
- [P3] 出售页没有照搬“背包 + 六个挂单槽”的双栏密度。
  - Location：出售态中央和右侧。
  - Evidence：参考图用左侧物品格和右侧六个空挂单槽；实机用“可上架物品／上架预览／
    填写上架信息”三段，并在同屏显示数量、币种、单价、合计、动态预计税费和预计到手。
  - Impact：一次只编辑一个真实挂单，信息密度较低，但精确装备实例、最大 999 堆叠和
    成交邮件回款都能在提交前读清。
  - Fix：保持当前单挂单确认流；本项目没有批量挂单合同，不为填满六个槽伪造状态。

## Comparison target

- 购买参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-c9ab28e4-e0fd-4d92-823f-a0e44307915d.jpg`；
- 出售参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-e3eaa49f-8604-4f7e-8d09-83756b7d1c2f.jpg`；
- 公示参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-7d80efd8-7b88-43c8-9d2b-a2557d42b0a6.jpg`；
- 三张源图均为 `2622×1206`，按宽等比缩放为约 `640×294` 后置于 `640×360` 比较格，
  没有拉伸成 `16:9`；下排三张实现均来自真实 `Main.tscn`、Metal、原生
  `1280×720 / 1.00×` 内容像素，再等比缩到 `640×360` 组成同屏图。
- 比较范围是页面层级、阅读顺序、控件密度、材质与三态一致性；不要求复制参考资产、
  商标、宠物交易、公示机制、数值或货币系统。

## Comparison evidence

- 三参考／三实机状态同屏：
  `.run/evidence/phase392_market_design_qa/reference-vs-real-main-3state.png`；
- 同屏图为 `1920×720`，上排依次是购买／出售／公示参考，下排依次是购买／出售／我的
  挂单实机；SHA-256：
  `8484d1cceb633a3097d2011397ec003623b67b75547acabd2e0b0804b041c3f7`。
- 最终视频：
  `.run/evidence/phase392_market_awakened_owner_review/phase392-market-awakened-final/market-awakened-owner-review-1x.mp4`；
- 联系表：
  `.run/evidence/phase392_market_awakened_owner_review/phase392-market-awakened-final/contact-sheet.png`。

## Required fidelity surfaces

- Layout：顶部标题／货币／关闭，纸面内三页签，左侧分类，中部卡片列表，右侧详情或表单，
  底部状态与主动作形成稳定阅读顺序；三态切换不移动整个页面框架。
- Typography：中文页签、分类、商品名称、价格、税费、数量和玩家提示清楚可读；没有乱码、
  系统内部字段或过量调试说明。
- Materials：原创竹木、藤叶、羊皮纸、货车与货箱保持统一；底板无烘焙文字、商品、按钮或
  商标，全部交互由 Godot 真控件渲染。
- Icons：商品卡和详情使用仓库正式 item icon；装备实例仍显示精确强化、耐久和属性摘要，
  不按同 `itemId` 折叠为假同一件。
- Truth：只显示购买、出售、我的挂单、全部、装备和道具；石币／钻石、动态税费、预计到手
  与邮件回款均来自既有真实合同，不硬编码参考图的固定 15% 或三种货币。
- Controls：分类、搜索、排序、页签、商品／背包卡、数量、币种、单价、购买、上架、下架、
  确认、取消和关闭均可左键完成；确认层在同一页面内，背景状态不会误触。
- Safety：正常玩家界面不显示 `listingId`、`itemId`、`instanceId`、schema、接口名、测试标志
  或 agent／QA 文案；客户端不在权威成功回执前乐观改钱包、背包或挂单。

## Interaction and evidence

- 聚焦面板检查 `PASS`；三态、分类／搜索／排序、正式图标、税费预览、确认层、空状态、
  全视口边界和真实左键事件均通过。
- Godot 最终定向组合 `4/4`：解析、装备实例、市场和 PanelRegistry；市场回归继续覆盖普通
  物与精确装备上架、公开装备安全投影、重复／旧版信封拦截及 buy/cancel 只提交
  `listingId`。
- 真实 `Main.tscn` 九章视频为 `23.133333s / 694` 帧、`1280×720 / 30 FPS / 1.00×`、
  H.264 `yuv420p`、AAC 48kHz 双声道，完整音视频解码通过；MP4 SHA-256：
  `8e670e9d3f0777ad74c57c000ade0efd5ecad9a817a1eb19d7c9410b6d586654`。
- 录像使用隔离档案，不连接后端／MySQL、不提交资产写入；它证明页面和交互，不冒充生产
  成交。
- 同一九章流程的 22 个性能样本为 `process_total=0.06..0.11ms`；独立跨帧移动和 37 次鼠标
  连点检查均为 `status=ok`，移动热身后保持 `60 FPS`，未出现 UI 穿透或目标不收敛。

项目所有者观看本轮视频后反馈“勉强还可以吧”，本阶段记为
`ownerReviewStatus=owner_accepted_with_reservation`；当前工程比较无 P0、P1、P2。

final result: passed

---
