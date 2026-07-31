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
