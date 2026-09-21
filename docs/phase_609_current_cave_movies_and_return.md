# Phase 609：当前版本洞穴影片与完整返程复审

日期：2026-09-21。采集基线 `c621fa7e81ad0fb40a06588d7af50e2578f7c073`，运行指纹 `beastbound-map-runtime-surface-v2:e9d93013ecd418761ee177751fc727bd109c3ced8d7b81f36e5c52fc2f1a74c8`。接续 R1.W025 与 [Phase608](phase_608_current_cave_evidence_refreeze.md)。

当前代码完成四层／F4 地标录片，以及守护战、六场普通遭遇全胜后逐层返村。影片、20 项正式动作、48 组地图性能和碰撞证据现已对应同一运行内容。受委托审看未发现新的阻断缺陷，建议保留为内部试玩冻结候选；**所有者美术接受、首发采用决定与正式发布仍未完成**，R1.W025、P2.1a 不提前勾选。

本阶段只补证据与文档，没有修改客户端、服务端、测试器、地图布局、素材、难度、随机种子或生命预置。整个采集期间 26,834 个原跟踪文件逐字节未变。没有因结果不理想重复抽取随机遭遇；Phase607 的四胜一败及其原件继续保留。

## 当前四层与地标影片

使用一个持续原生 Main 和一个持续 MovieWriter Main，完成四层静止／移动八段及 F4 地标一段；原生／录制确定性合同 **9/9 PASS**，完整清单 **104 个文件 SHA-256 全部相符**。QA lane 已清理，真实玩家目录未变。

| 影片 | 原速规格 | SHA-256 |
| --- | --- | --- |
| [四层地图](../.run/evidence/earth_vein_cave_visual_v1_owner_review/phase609-current-review-20260921/four-floor/earth-vein-cave-v1-owner-review-1x.mp4) | 64.400 秒，1932 帧，1280×720，30 FPS，H.264/AAC | `ca7b41f60035e8753bf2c28e05afc7236ab4decd3c67c125c8bb65d125071a35` |
| [F4 双共鸣台](../.run/evidence/earth_vein_cave_visual_v1_owner_review/phase609-current-review-20260921/landmark/earth-vein-f4-landmarks-1x.mp4) | 8.333 秒，250 帧，同上 | `65c18b624c497072b05e9e866d407bed0f9a6fb663e67dfc95c3204c588b8445` |

两支新 MP4 与 Phase607 已审看的文件逐字节相同。因此沿用其 **896／213 个不同像素帧、56／14 页联系表**的视觉内容审看，另查看本轮原生 F1 静止、F4 移动、F4 地标三张 1280×720 PNG。没有重标旧报告的源码身份，也没有声称重新逐帧看过 70 页；本次启动身份与运行前后快照独立保留。

四层影片由 972 个源帧与 960 个明示的末帧停留组成；地标片包含 120 个控制器内停留帧，并使用专用展示视点。分段切换和展示视点不能代替实际走楼梯，实际连续换层由下面的联网返程证明。原始批次 AVI 共 1489 帧，包含一个引擎终止帧。

人物比例、入口、岩墙透明避让和两个地标名称保持清楚。地面纹理重复、布景稀疏、外围物件进入 HUD 区域仍是品质限制；本结论不宣称商业美术已完成。

## 一次完整联网返程

一个真实 `Main.tscn`、四个 HTTP 驱动测试队友、一次性内存后端，沿用五名人物初始 **10400 HP**、自然成长 Lv100 战宠的既有路线夹具。自动操作通过跨帧 viewport 输入触发正常界面与权威端点，明确 `computerUse=false`；本轮不冒充新的人工通关。

| 项目 | 实际结果 |
| --- | --- |
| 连续路线 | F4 → F3 → F2 → F1 → 火芽村入口 |
| 战果 | 守护战 8 回合；F3 普通遭遇 17 回合；F2 两场 15／25 回合；F1 三场 19／13／17 回合；七场全部胜利 |
| 权威播放 | 114 次结算、114 次 Main 开始、114 次动画完整结束，零漏播／重复 |
| 输入 | 34 次按下／释放分帧的实际 viewport 点击 |
| 洞穴画面 | 四层候选贴图、1.52× 镜头；实际动作轮廓高约 121.478–124.762 px |
| 战场 | 1823 个战斗采样正确，包含房间已结算但动画仍在播放的 39 个采样 |
| 连接 | 1961 个 ready 观察，一条健康连接，无重连或心跳故障 |
| 五份档案 | revision 均 102 → 109，各地之戒 +1、石币 +2507 |
| 绘制 | 检查范围 31,392 帧，零缺画；35 次专用保活补绘，不用于性能结论 |

返村时五个人物生命分别为 `3303 / 1797 / 26 / 1317 / 2831`，五只战宠均已倒下。没有补血、注入结算、提高生命或改写胜负门槛。该结果证明当前权威流程和显示链条贯通，**不证明普通队伍难度合理、无需补给、五真人联机或 200 人同图**。

原速影片为 **1048.466667 秒、31,454 帧、1280×720、30 FPS、H.264/AAC**，全片音视频解码、源包时间线与输出帧数一致。667 个 Theora 显式重复包按原时间戳恢复，其中尾部 28 帧；没有人为加速或补造缺失画面。启动／清理帧不在绘制检查区间内，因此影片帧数较大。

- [完整返程影片](../.run/guardian-review/20260921T075948.651098Z/guardian-1x.mp4)，SHA-256 `3cb80609a75a026e72a78548417bc0653495b561c8c4a02a2b0f87b8112e6f54`。
- [返村原生截图](../.run/guardian-review/20260921T075948.651098Z/journey-firebud_village_gate.png)、[独立验证摘要](../.run/phase609-working/verification-summary.json)、[各场战果](../.run/phase609-working/battle-summary.json)。
- 上述录像／原始报告位于本机忽略目录，未将运行缓存或临时账号资料提交 Git。

## 视觉复审范围与结论

完整看完返程的 **171 张选定画面、43 页联系表**，选取每个首次观察到的世界格、战斗首尾四个采样与中段、换层边界。联系表每格 640×360；另外查看本轮守护蓄力、F3、F2、F1 和村口五张原生 1280×720 PNG。**这是明确选帧的长流程复核，不是对 17 分钟影片逐帧验收。**

这些画面中，人物与洞穴比例一致，主控角色在接近地标和返程时可见；所有新战斗均恢复正确战场，未见前一场奖励浮字串入下一场。结算行出现、淡出正常，自动指令区没有错误的捕捉容量浮字。两座共鸣台身份清楚，最终村口画面恢复正常。村口使用既有 Firebud v2 与自身 1.82× 镜头，不把它算作洞穴人物缩放变化或新的村口验收。

跟随队友聚集时名称可能拥挤，外围队友／景物仍可能进入 HUD；密集多人可读性不在本轮五人路线结论内。音频主观效果、Windows、正常难度和最终视觉接受未验证。复审记录与精确图片索引位于 `.run/phase609-working/visual-observations.json` 和 `journey-frames/index.json`。

建议把当前版本冻结为内部试玩候选，避免在没有具体新缺陷时重复取证。首发是否采用这一版洞穴、或继续增加地面与布景细节，应由项目所有者对上述具体画面给出结论；当前仍是 `owner_review_pending / pending / releaseApproved=false / runtimeEnabled=false`，不生成 owner decision、digest 或发布证明。

## 验证与清理

```sh
python3 -B tools/record_earth_vein_review_batch.py --run-id phase609-current-review-20260921 --godot '.run/phase584-native-review/Beastbound QA.app/Contents/MacOS/Godot'
python3 -B tools/play_guardian_review.py --godot '.run/phase584-native-review/Beastbound QA.app/Contents/MacOS/Godot' --autoplay --cave-journey --record --timeout-seconds 1800
python3 -B .run/phase609-working/verify.py
python3 -B .run/phase609-working/journey_frames.py
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
git diff --check
```

地图录制的精确实际 argv、前后身份和校验表在 `.run/evidence/earth_vein_cave_visual_v1_owner_review/phase609-current-review-20260921/summary.json`；上述为本次命令，复跑必须换新 run ID，不能覆盖原件。独立地图核对结果在 `.run/phase609-working/map-verification.json`。

客户端、测试后端与 QA lane 已正常清理，返回 `GUARDIAN_REVIEW_CLEAN`。真实玩家目录摘要仍为 `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`，原有 Godot 编辑器保留。运行内容未改，不重跑 Phase608 已通过的 48 组性能、解析与严格 bundle 审计，也未运行无关服务端套件或全量 CI。
