# Phase 615：新版洞穴接入普通客户端

日期：2026-09-22。基线 `e10cec43c5ced9e64aabf10200c3bad44318e258`。承接 Phase611 美术返工、Phase613 性能冻结与 Phase614 单包提升修复。此次只启用已展示的四层地图美术，不改变玩法拓扑、遭遇、数值或奖励。

## 所有者结论及范围

老板在收到四层影片和图片后回复：「行吧。。只能接受。。其实我自己都看不懂。」本次按**有保留地接受当前版本**执行 W029，不再重复索要批准。对应的是 Phase611 已冻结的画面，不是对后续未展示素材或整款游戏的发布批准。

接受对应的 [四层原速影片](../.run/evidence/earth_vein_cave_visual_v1_owner_review/phase611-natural-cave-review-20260922/four-floor/earth-vein-cave-v1-owner-review-1x.mp4) SHA-256 为 `90b7a293d4d6e3dd025f179a4635e5ee948e7f0aa7979fef922c33afcd64a6f1`。像素、摆放和之前的性能原件保持原身份；重复纹理、岩壁轮廓重复以及展示不够直观的意见保留。今后效果说明应直接回答普通玩家能看到、能操作什么，避免让老板解读测试材料。

决策上下文见 [本机记录](../.run/phase615-cave-release/owner-decision-context.json)。该记录与正式 owner acceptance 是本次对话结论的实现记录，不冒充老板填写或签署的文档。

## 正式启用

通过 `promote_map_visual_release.py --apply` 完成 pending → approved → released 的独立审计和原子安装。正式目录只新增岩脉四层，保留既有雾冠地图及所有待审目录；Firebud 等其他候选不随之启用。

- 洞穴状态为 `released / approved / true / true`，严格审计 `168 files / 51 PNG / 31 JSON`，`releaseReady=true`、`missingReleaseGates=[]`。
- owner acceptance SHA-256：`918cff40db57838ae366951395c4e09fb221720a01c8b575a2e35b33df74dc0b`。
- release attestation SHA-256：`1f0d5639657cf97a62ea6ce816a75c9583a560e9f85aacf54503ed80c4044e58`。
- 正式目录 SHA-256：`3375d92b8e2a2f01ecd6de716bc428b142e004bbc35e44ae4e21cef05b7153ee`；review 目录维持 `662fa235c072f295aed084f2163934cb69a41ec0f8083801649242b1c47dbc3f`。
- 最终全新进程的 [pre-export](../.run/phase615-cave-release/preexport-final.json) 对洞穴和既有雾冠均 PASS；后者仍为 `37 files / 14 PNG / 13 JSON`。

完整输出见 [提升结果](../.run/phase615-cave-release/promotion.json)。这是地图包在源码中的启用，不是桌面安装包或生产服务器发布。

## 保留旧证据的准确身份

旧 v2 摘要包含正式目录和 QA 注册清单，因而单纯把候选提升到普通模式也会改变摘要。新增 `map_visual_promotion_identity.py` 从当前运行内容重建摘要，只替换有真实 Git 祖先依据的目录登记与严格受限的 QA 对照：

1. 正式目录只能完整新增已在 review 中精确登记的整个 bundle；旧正式项不可删改，review 必须保持原字节。
2. runtime canary 只能调整三个字面量注册块；其余断言代码不变，新登记须与正式目录精确对应。
3. 地面缓存检查原先用「二层尚未启用」验证残留清理，正式启用后该前提已过时。只把这一条测试的加载目标改为仍未启用的火芽训练场；所有断言原字节保留。摘要兼容只允许旧目标本次刚被提升、新目标仍是未启用候选这一种替换。
4. 渲染、人物、HUD、权威地图、绑定、纹理和其余 QA 代码仍参与当前摘要，不能通过登记变化掩盖修改。原始截图、捕获身份、性能回执和 builder 源文件均未改写。

审计器每次完整审计前清除运行摘要缓存，防止同一提升进程安装目录后仍误用安装前的缓存结果。第一次客户端检查如实保留了旧地面测试的失败；修正测试前提后完整定向检查通过，没有放宽运行时门禁。

## 普通地图选择的实机验证

`play_guardian_review.py --cave-journey --normal-map-visuals` 不传地图预览开关，运行真实 Main、正式地图选择、独立内存后端和真实服务器移动。新入口只允许人工跨层，明确拒绝与自动输入或倒地夹具混用。

本轮 [运行目录](../.run/guardian-review/20260922T064053.089758Z/) 通过真实鼠标完成 F4 → F3 → F2 → F1，并在一层再次点击移动。1400 次状态采样覆盖约 733 秒；每层均为 `artPreview=false / active=true / status=released / catalogSource=normal / qaPreview=false`，相机均为 `1.52×`。

| 地图 | 观察到的不同世界格 | 正常地图画面 |
| --- | ---: | --- |
| 四层 | 16 | [四层](../.run/phase615-cave-release/images/f4-normal.png) |
| 三层 | 21 | [三层](../.run/phase615-cave-release/images/f3-normal.png) |
| 二层 | 15 | [二层](../.run/phase615-cave-release/images/f2-normal.png) |
| 一层 | 3 | [一层](../.run/phase615-cave-release/images/f1-normal.png) |

途中三层有一次人工操作超时和一次正常逃跑，二层一次正常逃跑，结算后贴图正常恢复；没有直接传送、强制胜利或中途补血。此次不挑战守护兽，也不把该流程称为全胜路线。早先一轮在四层超时结束，验证器正确拒绝未完成跨层，不纳入通过结果。

该验证使用一个真实 Main 和四个 HTTP 测试队友、10400 HP 路线夹具，战斗艺术仍使用原有专用预览。因此它证明普通地图选择、比例和移动恢复，不证明正常难度、五真人联机或其他战斗素材已接受。连续绘制保护不能作为性能证据。客户端和临时后端已正常清理，真实玩家资料哈希仍为 `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`。见 [正常运行摘要](../.run/phase615-cave-release/normal-runtime-summary.json)。

## 性能与最终检查

启用后在单个原生窗口完成 48/48 组，36,768 个观察帧零失焦／失绘。原始矩阵、聚合门槛和独立报告审计全部 PASS。所有样本均加载正式地图，比较类型为 `released_primary_vs_same_primary_qa_preview`；窗口沿用的「旧网格」标签不是本轮实际状态。

| 地图 | 普通静止 ms | 普通移动 ms | 同图 QA 开关静止 ms | 同图 QA 开关移动 ms |
| --- | ---: | ---: | ---: | ---: |
| 一层 | 0.151 | 0.176 | 0.148 | 0.193 |
| 二层 | 0.136 | 0.201 | 0.151 | 0.194 |
| 三层 | 0.151 | 0.195 | 0.150 | 0.198 |
| 四层 | 0.166 | 0.198 | 0.160 | 0.189 |

以上为三次独立运行的处理区间均值中位数。绝对门槛及两种配对增量均通过，不是显示 FPS、整进程 CPU、Windows 或 200 人容量证据。启用前同像素结果保留在 Phase613：候选静止 0.153–0.181ms、移动 0.208–0.226ms；不把不同时段数字之差声称为本次代码优化收益。

新证据仅保存在忽略目录，不覆盖所有者接受的正式报告。原始回执 SHA-256 为 `32221ff1d02bedc031e1b1836dbd5064645c449d1c735e1b177f9e24f26b85cd`；新报告 SHA-256 为 `fe37f638b5266d53e40bcf798c3360f6d1ac88c7871bb36d9d3784a3baf24efd`；当前运行摘要为 `a69fda2bd7cd0073acc30ca8560d561db71f131a9ffa90a802f31a700cfd23b2`。报告在独立副本中生成，以正式审计器独立验证原始采样及门槛，`errors=[]`。见 [性能汇总](../.run/phase615-cave-release/performance-summary.json) 和 [原始运行](../.run/map-performance/phase615-released-cave-performance-native/earth_vein_cave_visual_v1/)。

已完成 Python 身份／提升／人工入口检查 `29/29`，审计器检查 `51/51`；最终 Godot 解析与地图运行、相机表现、洞穴审查合同 `4/4`。未改热路径或玩法数据；未重复完整服务端测试和全量 local CI。真实玩家资料保持原哈希，原生窗口、临时后端与本轮防休眠进程均已退出。

```sh
python3 -B -m unittest tools.test.test_map_visual_promotion_identity tools.test.test_map_visual_release_tools tools.test.test_play_guardian_review
python3 -B .agents/skills/design-beastbound-maps/tests/test_audit_map_bundle.py
node tools/run_godot_auto_checks.mjs --only=--auto-map-visual-runtime-check,--auto-world-presentation-profile-check,--auto-earth-vein-review-contract-check --fail-fast --timeout-ms 120000
python3 -B tools/run_map_visual_preexport_gate.py client/godot/assets/maps/earth_vein_cave_visual_v1 client/godot/assets/maps/mistcap_marsh_visual_v1
python3 -B tools/play_guardian_review.py --cave-journey --normal-map-visuals --timeout-seconds 1800
git diff --check
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
```

R1.W029、R1.10 与 P2.1a 当前地图可玩／视觉候选收口完成。发布队列下一项为 R1.11 Ember pressure Boss 表现验收，需先准备可直接理解的实际效果。全游戏发布仍受其余素材、正常难度、运营与人工验收项约束；此次接受不延伸到其他素材。
