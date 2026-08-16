# Phase 448：岩脉洞穴四层 v1 可玩与视觉冻结候选

## 当前结论

岩脉洞穴现已形成一条完整但尚未发布的四层洞穴切片：从火芽村进入，逐层遭遇 Lv65～120
野怪，低概率遇到 Lv1 苔背兽，最终在四层挑战岩脉守护兽并取得人物转生所需的地之戒。
地图目的、入口、出口、遭遇、奖励与停留理由均已存在，人物转生任务可从世界任务追踪、完整任务页、
跨层寻路一路指向顶层守护兽。

严格地图审计为 `158 files / 29 JSON / 47 PNG / errors=[]`。当前生命周期仍是
`owner_review_pending / pending / false / false`，没有生成 owner decision、release attestation，
没有启用普通运行视觉，也没有据此勾选 P2.1。

## 四层玩法职责

| 楼层 | 等级带与遭遇 | 路线职责 |
|---|---|---|
| 一层 | Lv65～80；普通苔背兽为主，保留 1% Lv1 点 | 火芽村入口、返回村庄、通往二层 |
| 二层 | Lv80～100 | 承接上下层，扩大岔路与阻挡密度 |
| 三层 | Lv100～120 | 高等级过渡，继续通往顶层 |
| 四层 | 人工触发 10v10 岩脉守护兽与进化谱系守护 | 地之戒目标、两座共鸣台与最终目的地 |

这里沿用 StoneAge 成熟洞窟“连续楼层、明确终点、稀有 Lv1 与任务奖励叠加”的行为意图，地图、
美术、数字与角色均为 Beastbound 原创规则和素材。

## 证据缺陷与修正

第一次冻结候选虽然通过旧审计，但复核发现二层 `warp.png` 与 `collision.png` 是同一张截图，
文件名不同却没有证明两种动作真的发生。旧 Computer Use 原始操作回执彼此独立，问题出在配套的
Main 截图录制器对所有移动动作选择了同一终点。

本轮没有放宽门槛，而是完成以下修正：

- 地图动作录制入口新增关闭枚举 `pointer / movement_path / warp / collision / occlusion`，拒绝任意值、
  重复参数和未登记动作；
- 移动类动作按地图与动作种类确定性选择不同安全终点，并把 `captureVariant` 写入回执；
- bundle auditor 与 Computer Use 聚合器新增同一地图五张动作图 SHA-256 必须全部不同的硬门；
- 旧 40 个配套动作文件整体移入 `.run/evidence/earth_vein_cave_visual_v1_action_capture_archive/`
  留作可恢复历史证据；
- 重新录制四图 × 五动作，得到 `20/20` 张唯一截图、`20/20` 个匹配动作变体、零重复组；
- `freeze15` 因旧 `computer-use-review.json` 和 manifest 哈希失效而永久保留为过时记录；`freeze16`
  绑定了动作变体证据，`freeze17` 再绑定隔离候选性能、纳入版本控制的碰撞原始回执与最终来源哈希，
  全部保留为不可覆盖的历史文件。

动作矩阵：
`.run/evidence/map_visual_action_captures/earth_vein_cave_visual_v1/earth-vein-actions-variant-v2-20260816/capture-matrix.json`
（SHA-256 `490660464ba0613907ca0d0273b78ebb3cd89e8117e603a2d2184ca0fc3db21b`）。

20 动作联系表：
`.run/worktree-triage/2026-08-16/earth-vein-runtime-actions-contact-sheet-variant-v2.png`
（SHA-256 `1eff589dac258b0e263d5f07fc0f1ed52b241c6ef96db54f2698e000f6b2e8fb`）。

## 任务页可玩闭环修正

定向回归还复现出一个玩家可见问题：世界追踪已经显示“取得地之戒”，寻路目标也正确，但觉醒式
任务目录只认识 `quests.json` 普通任务，会默认选中第一条可接支线，导致面板标题与当前试炼不一致。

现由 `QuestAwakenedPresenter` 把宠物转生教学和人物转生试炼投影为正式的“转生”目录行；
`DialogQuestCoordinator` 继续掌握权威目标和寻路，不把业务规则塞进视图。打开任务页时，当前阶段任务的
目录高亮、标题、详情与“立即前往”保持一致；玩家仍可手动查看其他普通任务。普通任务目录、奖励领取、
五层多跳寻路与宠物转生教学均通过相邻回归。

## 美术总监判断

这套地图适合作为 Beastbound 第一座正式洞穴 v1 的 owner-review 候选，但不是项目美术天花板。

- 优点：低饱和琥珀、炭黑板岩和克制晶体高光统一；阻挡石、可走石地、楼梯与前景遮挡易读；四层两座
  共鸣台形成明确终点，密度递增却没有堆成视觉噪声。
- 保留意见：一至三层有意复用同一地域 kit，长时间刷楼会感到重复；正式运营后应通过局部地貌、环境
  动画或稀有事件继续拉开楼层记忆点。正常 PC HUD 也会占据部分画面，但这正是实际 Main 使用条件，
  不应拿无 UI 概念图替代。
- 边界：本轮推荐的是“首座洞穴 v1 的风格、比例、层次与顶层构图”，不代表所有洞穴、世界内容或
  P2.1 已完成。

## 精确审图候选

- 四层连续 Main 视频：
  `.run/evidence/earth_vein_cave_visual_v1_owner_review/earth-vein-v1-20260816-freeze7/earth-vein-cave-v1-owner-review-1x.mp4`
  （1280×720，30 FPS，42.866 秒，SHA-256 `d878bcb25abc91b6cda8cec5bd2986ba32d57efc47187ffe624de5ba34c06959`）；
- 四层联系表：同目录 `contact-sheet.png`，SHA-256
  `ece694bc2069b301650226a835dc986735f6624608c28397843200ac0685dec6`；
- 四层顶层共鸣台 Main 视频：
  `.run/evidence/earth_vein_cave_visual_v1_owner_review/earth-vein-v1-freeze14-landmarks/earth-vein-f4-landmarks-1x.mp4`
  （SHA-256 `1a15383ede3877782e287aa4db31fa1bb733e16dca2edbc9fe5e209e2d17026e`）；
- 顶层原生静帧：同目录 `earth-vein-f4-landmarks-native.png`，SHA-256
  `6a107a09a4da20aaf80cd6291adf901c36f24412e9e133adf0645f5a1fbdca21`；
- 精确冻结证明：
  `.run/evidence/earth_vein_cave_visual_v1_owner_review/earth-vein-v1-owner-freeze17/owner-freeze.json`
  （16 个绑定制品全部复验，SHA-256
  `b2abbe3d3163fdef518b912d58273da6898cb6079214a7c051e18a5bf5460e57`）。

## 验证

```text
python3 -B .agents/skills/design-beastbound-maps/scripts/audit_map_bundle.py \
  client/godot/assets/maps/earth_vein_cave_visual_v1
PASS: 158 files / 29 JSON / 47 PNG / errors=[]
releaseReady=false: lifecycle + owner acceptance + release attestation remain missing

Python focused suites
50/50 PASS

node --test server/node/test/pet-encounter-authority.test.js \
  server/node/test/progression-route-catalog.test.js \
  server/node/test/manual-encounter-access.test.js
21/21 PASS

Godot isolated candidate: parse, map visual, world presentation, rebirth task,
pet-rebirth guide, quest UI, task routing, pathfinding, direct-line,
true-eight-direction, click movement, map transfer, encounter, and panel registry
15/15 PASS
.run/godot_auto_checks/2026-08-16T00-06-03-329Z_summary.json

Firebud v2 strict regression audit
PASS: 101 files / 17 JSON / 39 PNG / errors=[]
```

隔离候选 Godot runner 确认 QA lane 已清理、进程组关闭、真实用户数据未改变。

寻路热路径将字符串坐标查表、`pop_front()` 队列与逐候选字典分配替换为缓存的 `Vector2i`
查表、索引队列和并行标量排序；规则、对角防穿角与最终 tie-break 均保持不变。新回归的直线路径和
八方向逐格输出与历史记录完全一致。四层 `performance-report.json` 仍为 PASS：真实输入事件跨帧发送，
候选移动 `process_total` 均值为 `0.285～0.375 ms`，60 FPS，全部移动、合并与最终目标门通过；
报告的 runtime-surface 摘要 `4ba5aceade20…` 与隔离后的 P2.1a 候选运行面一致。

## 发布边界

项目所有者明确接受 `freeze17` 前，继续保持 `ownerReviewStatus=pending`、`releaseApproved=false`、
`runtimeEnabled=false`。接受后仍需单独生成 owner decision 与 release attestation、提升 manifest 生命周期、
在普通玩家入口重录当前 Main 证据，并将这些状态变化作为一次可回滚发布事务提交；不能把视觉候选的通过
自动解释为 runtime 发布授权。
