# Phase 532：R1.W019 融合当前 Main 精确证据重冻

日期：2026-08-26

## 结果

R1.W019 已完成。当前代码在真实 `res://scenes/Main.tscn`、1280×720、macOS Metal、正式隔离
QA lane 中重录了首批两条融合路线的关闭态、三宠来源画像、服务器报价呈现、两段真实左键确认、
请求中、曜冠成功、苔垒成功、明确失败、重新报价恢复和最终关闭态。两条成功页均展示正式结果画像、
名称、一转 Lv1、实际主动／被动、绑定／交易、不可骑终局、三宠永久消耗和材料数值不继承；明确失败
页只在“服务器未执行”语义下显示三宠仍在和零消耗，并通过真实左键回到新报价。

录片中的第二次确认和结果回执都是 QA-only 本地呈现夹具：共 `5` 次跨帧真实左键，其中两条路线各
`1` 次第一次确认、各 `1` 次第二次确认，另有 `1` 次明确失败后的重新报价；权威变更、网络请求、
profile 写入、账号会话、后端进程和 MySQL 访问均为 `0`。生产目录与普通玩家入口从录片前到录片后
始终关闭。

第一次本地轮次 `r1-w019-fusion-main-outcomes-20260826-a` 在自动门禁和画面上通过，但逐章复核发现
请求中／成功页的下层 `confirmationArmed` 仍保留旧指纹。按钮与 outcome 层已经阻断重复提交，未形成
玩家可操作缺陷；本阶段仍拒绝冻结该残态，改为 outcome 装载时显式清空确认指纹，并把
`confirmationArmed=false` 加入 pending／success／failure 硬门禁。唯一权威轮次是后续 `-b`，`-a`
只作为被替代的本地历史，不参与本阶段结论。

## 实现与门禁

- `PetFusionPanel.configure_runtime()` 在任何规范 outcome 装载时清空旧确认指纹和本地第二确认计数，
  结果态继续由 `_confirm_pressed()` 的 outcome 边界和禁用按钮双重锁定；
- 面板快照新增结果画像 form、标题、状态、名称、等级、主动、被动、绑定、终局、消耗、详情和动作文本，
  只用于聚焦自动检查和证据报告，不进入逐帧热路径；
- 结果夹具不再硬编码曜冠材料，改为从两条当前报价的精确三角色材料、目标、绑定和交易策略构造严格
  服务端结果，因此曜冠与苔垒都经过 `normalized_fusion_result()` 和正式画像消费者；
- Main capture schema 升为 v2，固定 `13` 章、`1410` 章内帧、`5` 次真实左键、`2` 次 QA 本地第二确认、
  `1` 次 `requote` 恢复，逐章拒绝 raw ID、QA/debug 文案、占位画像、越界布局、网络计数或错误消耗语义；
- recorder 固定携带 `--perf-probe`，同时校验原生与 MovieWriter 的 FPS、`process_total`、精确章节标记、
  Godot JSON、H.264／AAC 媒体、可闻音轨、全片解码、13 张原尺寸关键帧、联系表、关闭 verifier 前后稳定、
  SHA256SUMS 和 QA lane 生命周期；
- Python 负向回归会拒绝生产 runtime 打开、权威变更非零、明确失败猜测消耗、成品画像绑错、章节状态漂移、
  缺失性能样本或 `process_total` 超限。

## 唯一权威证据

证据目录：

```text
.run/evidence/r1_w019_fusion_main_outcome_review/
  r1-w019-fusion-main-outcomes-20260826-b/
```

| 产物 | SHA-256 |
|---|---|
| `pet-fusion-main-owner-review-1x.mp4` | `66fd49b9c46098a0c0766f7c8956e158b1973a41f4f0e50e1af13951136578dc` |
| `contact-sheet.png` | `67ec34e812ae53ba55576cbf3a2dc97012ba1d4d5915888ab56ee57e341a2b39` |
| `summary.json` | `5e519daaf5f70d62d0352d5de76950163679cd67acc84e6a363ba3b1cc5f4de7` |
| `SHA256SUMS` | `04a61ef5b7f0f65c5441fbd98240a1af52f861c3028cba1ea4d9265ae2f86397` |

视频为 H.264／yuv420p、1280×720、30 FPS、`1.00x`、`1444` 帧／`48.133333` 秒，含 48 kHz
AAC 双声道可闻音频；响度为 mean `-27.7 dB`、max `-12.1 dB`。全视频与音频流完整解码，13 张
关键帧均为原始 1280×720，四列联系表也为 1280×720；`SHA256SUMS` 对全部保留证据逐项复核通过。

关键状态的当前像素哈希：

| 状态 | 取样 | SHA-256 |
|---|---:|---|
| 请求中、不猜材料消耗 | 14.5s | `9e7219a3c9cc8843440c5a552540f56975c23e806388bf095a4595f28d814181` |
| 曜冠权威成功页 | 18.5s | `38582e4cec36b0fca15849a468162e966647fb9959d432265be4c685780eb018` |
| 苔垒权威成功页 | 33.5s | `5add94403753f67d3f61e47fe701c636baed99a33cee55c243785a37f174cbdd` |
| 明确失败、零消耗 | 38.0s | `400a9432100e41f72cd9f0be7a7853f1ad2fcab39b2f824bbc857b7d33742572` |
| 重新报价恢复 | 42.0s | `ba524ae1a8e591cec97cdf93c3a969fa993c71ab239be986af2599bac1b04190` |

关闭 verifier 前后文件字节一致，canonical SHA-256 为
`d8ffbcae388ca6bcbadf987a5fb2c7b89b2fc97fafd4974fda18b29eed4bd5e6`。当前精确轮次的真实玩家
目录 inventory SHA-256 在 initial、native 后、movie 后和 cleanup 后均为
`f62ce46d25d7d73bf8a19c7dd91900a7a732e34972bacf88796c778a5efa8d19`；QA lane 最终 absent，
两个 Godot 进程组均 `exitCode=0 / leaderReaped=true / processGroupClosed=true / residual=false`。

## 原尺寸视觉复核

逐张查看 13 张原始关键帧和 4×4 联系表后的判断：

- 关闭态首尾一致，融合目标为空、三宠和确认控件不可操作；
- 两条报价页的三只来源宠、候选栏和目标圆框全部使用正式画像，零占位；曜冠的紫金攻击轮廓与苔垒的
  岩甲防御轮廓在同一布局中仍能快速区分；
- 请求中页明确“请勿关闭页面或重复提交”和“结果确认前，不判断材料是否已消耗”，动作按钮禁用；
- 两张成功卡均完整落在安全区，画像、名称、技能、绑定、不可骑、消耗和查看按钮无裁切或重叠；
- 失败卡以红框、感叹号、三宠仍在和精确零消耗形成清楚层级，恢复按钮可读，点击后回到苔垒新报价；
- 玩家可见画面没有 raw form／recipe／instance／skill ID，没有 QA、debug、验收、GM 或服务器错误 code。

当前画面达到 R1.W020 委托复验条件；这仍只是内部冻结候选，不是项目所有者签署。

## 验证

- `python3 -m unittest tools.test.test_record_pet_fusion_main_owner_review`：`18/18 PASS`；
- `python3 -m unittest tools.test.test_godot_qa_user_data_lane tools.test.test_record_pet_fusion_main_owner_review`：
  `96/96 PASS`；
- `node tools/run_godot_auto_checks.mjs --only --auto-pet-fusion-outcome-check --fail-fast`：`2/2 PASS`；
  log SHA-256 `7764c7a85dfe1799d8461bc7ac9797734f6435f7b168ed25711e3e17bb44a923`，summary
  SHA-256 `e2078c5e971de53a5bc0f2560fb075ba0c525749dc9b0a74dcc194761498f9b2`；
- `godot --headless --path client/godot --script res://scripts/qa/pet_fusion_panel_check.gd`：两路线、运行交互、
  success/failure/pending 与 1280×720 布局 `PASS / errors=[]`；
- `pet_fusion_client_domain_check.gd`、`pet_fusion_contract_check.gd`：均 `PASS / errors=[]`；
- `node --test server/node/test/pet-fusion*.test.js`：`89/89 PASS`；
- 战斗动作目录：`34 actions / 10 passives / 36 forms / status=ok`；Pet Design Inspector：
  `36 forms / 2 fusion targets / errors=0 / warnings=0`；
- `python3 tools/verify_pet_fusion_closed_release.py`：`PASS / 2 forms / 1350 copied / 22 portrait /
  2 QA controls`，四个生产／画像门继续全 false；
- `node tools/run_godot_auto_checks.mjs --performance-suite --fail-fast`：`5/5 PASS`；idle 60 FPS
  `process_total median=0.38ms / p95=0.42ms`，真实移动 `0.32/0.34ms`，35 次跨帧点击
  `avg_input_us=1 / max_input_us=3`。log SHA-256
  `6c5aee6c4a82f6cddbaec4aa460b48db330545ece0cd23c071163c90a8e17f73`，summary SHA-256
  `5f894f365d757a114dad81073d08b6ddb2c73566f14eb1a21a664345f23c06bd`；
- 正式录片原生／MovieWriter 各 `46` 份性能样本：30 FPS；`process_total` 原生
  `median=0.20ms / p95=0.228ms / max=0.24ms`，MovieWriter `0.13/0.15/0.17ms`；
- `godot --headless --path client/godot --quit`、Python compile、完整媒体 decode、清单复核和
  `git diff --check`：通过。

## 诚实边界与下一步

本阶段没有修改配方、概率、成长、经济、事务、协议或宠物像素；没有创建 owner decision、可信画像
digest、approval input 或 release attestation，也没有执行 promotion。当前仍为：

```text
semanticIndependenceVerified=false
portraitReleaseGate=false
releaseApproved=false
runtimeEnabled=false
playerEntryOpened=false
ownerReviewStatus=owner_review_pending
```

下一任务是 R1.W020：只审本阶段当前精确视频、13 张原尺寸关键帧和现有画像候选，给出冻结、退回或延期
建议。项目所有者未亲自签署时，受委托复验仍不得冒充 owner acceptance 或打开生产入口。
