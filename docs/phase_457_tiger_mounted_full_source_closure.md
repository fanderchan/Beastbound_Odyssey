# Phase 457：见习猎人骑新手老虎战斗整图来源收口

## 结论

见习猎人骑新手老虎的正式战斗候选已从历史半成品收口为可重复审计的完整来源包：两个独立创作的正式视角、12 个动作、180 张 256px 运行帧，人物、老虎、鞍具与缰绳始终是一张整体插画。安装器复验为 `changed=false`，当前 bundle digest 为 `7f18dc67434cc7aa66444a3526c83468c615c9a65ce86fa778f674a27d0e0dcb`。

本阶段只完成工程与美术自审，不替代项目所有者验收。`ownerReviewStatus=pending`、`runtimeEnabled=false` 保持不变，普通玩家不会因本阶段自动获得该候选。

## 本阶段范围

- 重新生成并冻结 `front_3quarter_sw` 与 `back_3quarter_ne` 两个源视角。
- 每个视角覆盖 `idle / walk / attack / skill / hurt / defend / dodge / counter / stagger / knockaway / down / revive` 12 个动作。
- 跟踪 180 张运行帧、24 份 exact prompt、逐动作流水线与 QC、来源哈希账本、安装清单、联系表和 GIF。
- 用真实 `Main.tscn` 连续回放行进、攻击、技能、防御承压、受击、反击、致死反击、三骑合击、回避、回避后反击、直线击飞、弹边击飞、倒地与复起。

不在本阶段内：

- 不修复历史世界真八向帧或同名独立宠物包。
- 不修改战斗规则、数值、服务器、玩家档案或正常玩家入口。
- 不登记项目所有者视觉批准，不开放运行时。

## 来源与可重放性

- 内置图像生成会话：`019fe7c8-2fd7-7972-94a7-98382ddfe591`。
- 24 个动作／视角组合各自绑定 generation ID、最终无损母表 SHA-256 与 exact prompt。
- 正式重放目录：`.run/art_repair_phase457_tiger_mounted/formal-production-v1`。
- 正式重放结果：`actionViewCount=24`、`frameCount=180`、source/runtime canonical RGBA replay exact。
- 来源账本 SHA-256：`ce610b8c4230a6c693ade884efe08c6419733c98faaf0cb98070ae0d84920b50`。
- 安装清单 SHA-256：`24c8f8301b161cea617bca0594b10aec7ca8614cab6f575eea6b291e7167ef8f`。
- 正式重放摘要 SHA-256：`3c56ca4807e9ff57e2a0271bd0c9ab5671c055037d9ecd3deb0542a6a663fb22`。
- 两个源视角分别生成，未用运行时或离线镜像伪造另一侧，也未把人物与宠物分层拼装。

仓库采用 lean 归档：完整 24 张原始母表和 512px 源帧保存在忽略工作档，仓库跟踪运行帧及足以核对派生链的 prompt、QC、来源账本与每视角待机来源金丝雀。来源 attestation 保守保留 `semanticIndependenceVerified=false`，因为生成链与工程自审不能冒充版权证明或项目所有者批准。

## 朝向与动作自审

战斗映射继续遵守战场中心合同：

- 敌方左上：`front_3quarter_sw + flipH=true`，最终朝右下。
- 我方右下：`back_3quarter_ne + flipH=true`，最终朝左上。

真实 Main 逐段审片结论：

- 敌我人物、虎头与身体朝向一致，均面向战场中心，没有再次出现双方同向或背离目标。
- 行进循环中前后腿交替，躯干与骑手有同步起伏；八帧抽样未见单腿定住、滑步或骑手脱离。
- `attack / skill / counter` 的预备、发力、命中与回位可区分，`hurt / stagger / defend / dodge` 不互相冒充。
- 直线与弹边击飞均保持人骑宠整帧一体，飞行姿态与普通踉跄可区分。
- `down-8 == revive-1` 在来源层和运行层均精确成立；复起过程中骑手没有消失、换向或从虎身漂离。

审片联系表：

- `.run/evidence/phase457_tiger_mounted_full_source/phase457-tiger-v1-main-20260816-a/visual-review/contact-sheet.png`
- 同目录的 `walk-cycle-ally-back-contact.png`、`walk-cycle-enemy-front-contact.png`、`knockaway-*-sequence.png`、`down-sequence.png` 与 `revive-sequence.png`。

## 真实 Main 证据

最终有声视频：

`.run/evidence/phase457_tiger_mounted_full_source/phase457-tiger-v1-main-20260816-a/Beastbound_Phase457_Tiger_Actions_v1_Main_1x.mp4`

- `1280×720`、`60 FPS`、`39.533333s`、全程 `1.00×`。
- H.264 `yuv420p` limited range；AAC 48kHz 双声道。
- 共 2372 帧，14 个动作段全部结束；Godot 日志无 `SCRIPT ERROR / ERROR / WARNING / leak`。
- MP4 SHA-256：`638049776a9030f27c7ca414305b45c7228a359dafc9eb2be51b8aa87544bbc1`。
- `ffmpeg -v error -i <video> -f null -` 全片解码通过，零输出、退出码 0。
- MovieWriter 平均 CPU 渲染 `0.10ms/frame`，编码 `4.11ms/frame`；本阶段没有修改运行时代码，因此不把该录制数据冒充完整性能回归。

录像使用固定 QA 用户数据通道和隔离 worktree，不连接后端或 MySQL。录后安全校验发现真实 Godot 用户数据目录已从锁定基线变化，因此清理工具按设计拒绝删除 QA 通道；通道与所有者锁被原样保留，没有强制清理或覆盖真实玩家数据。隔离 worktree 在最终 MP4 同哈希复制后已删除。

## 验证

- `godot --headless --path client/godot --quit`：通过。
- `python3 tools/install_pet_battle_bundle.py ... --dry-run --json`：`status=ok`、`changed=false`、2 views、12 actions、180 frames、307 installed files。
- `python3 -m unittest tools.test.test_stage_pet_battle_bundle tools.test.test_install_pet_battle_bundle`：27/27 通过。
- 全量 `pet_art_batch_audit.py`：36 forms、`errors=0`、`warnings=0`；新手老虎名下仍有 10 条 pending，全部属于本阶段未改的独立宠物 `hurt-4` 或旧 mounted world 行走帧，新战斗帧没有新增错误或警告。
- 最终 MP4 `ffprobe`、全片解码、SHA-256 与逐段截图复核：通过。
- `git diff --check`：提交前执行。

尝试重跑 `--auto-mounted-action-asset-check` 时，启动前即被仍受旧所有者锁保护的 QA automation 通道拒绝；这是隔离通道占用，不是资产检查断言失败。为保护已变化的真实用户数据，本阶段没有绕过锁或强制清理。安装器、来源重放、全量审计与真实 Main 14 段回放构成本阶段交付证据；专用 auto check 的新鲜回执保留为通道可安全恢复后的残余复验项。

## 发布边界

当前只允许登记：`engineering_self_review_passed_owner_pending`。

项目所有者观看上述 1× 视频并明确批准前，不得把 `ownerReviewStatus` 改为 approved，不得把 `runtimeEnabled` 改为 true，也不得把本阶段表述为正式上线。
