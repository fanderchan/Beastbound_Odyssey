# Phase 329：火芽村剩余七类 NPC 职业原型候选与实装证据

日期：2026-07-23

## 本阶段结论

Phase 328 留下的火芽村 7 个占位岗位现已各自完成可跨村复用的正式职业外观候选，并绑定到原有具名 NPC 实例。新增 7 类均为静态成人 NPC：每类拥有独立创作的南、西南、西、西北、北、东北、东、东南八方向 `idle-1`，以及 `neutral / speaking / smile / concerned` 四张对话人像；没有运行时或离线镜像。

本阶段新增 56 张 256×256 世界图与 28 张 512×512 人像。连同 Phase 328 已发布的首批 8 类，目录现有 15 类职业外观（男 8、女 7）、120 张世界图、60 张人像，覆盖 33 个地图 NPC 实例。

新像素的 bundle、安装、真实 Godot、两阶段匿名盲审和组合审计均已通过，因此 7 类只推进到：

```text
status=owner_review_pending
ownerReviewStatus=pending
releaseApproved=false
runtimeEnabled=false
```

普通玩家运行仍只加载已获项目所有者批准的旧 8 类；新 7 类仅能由显式 `--npc-art-review-preview` QA 路径预览。仓库没有为它们创建 `release-owner-decision.json` 或 `release-attestation.json`，剩余门禁只有项目所有者对冻结视觉证据的明确验收。

## 职业原型与地图绑定

| 具名实例 `npcId` | 实例显示 | 共享 `appearanceId` / `roleId` | 性别呈现 | 初始朝向 |
| --- | --- | --- | --- | --- |
| `firebud_rebirth_mentor` | 转生导师阿岚 | `npc_player_rebirth_mentor_f_v1` / `player_rebirth_mentor` | 女 | 西南 |
| `firebud_pet_mm_trial_mentor` | 1转MM试炼师阿澄 | `npc_pet_mm_trial_mentor_m_v1` / `pet_mm_trial_mentor` | 男 | 西南 |
| `firebud_pet_mm_stage2_keeper` | 2转MM守护员阿岚 | `npc_pet_mm_stage2_keeper_f_v1` / `pet_mm_stage2_keeper` | 女 | 西北 |
| `firebud_diamond_keeper` | 钻石商阿璨 | `npc_diamond_merchant_m_v1` / `diamond_merchant` | 男 | 东南 |
| `firebud_pet_skill_trainer` | 宠技训练师阿拓 | `npc_pet_skill_trainer_m_v1` / `pet_skill_trainer` | 男 | 东南 |
| `firebud_welfare_clerk` | 福利员阿檀 | `npc_welfare_clerk_f_v1` / `welfare_clerk` | 女 | 东南 |
| `firebud_storyteller` | 说书人阿舟 | `npc_storyteller_m_v1` / `storyteller` | 男 | 西北 |

`npcId` 继续拥有姓名、地图、对话、任务和服务；`appearanceId` 只拥有职业模型、真八方向、人像、比例与锚点。转生导师与 MM2 当前同名“阿岚”是既有内容，不足以证明同一人物，也没有据此合并外观。其他村庄未来出现相同岗位时应复用同一 `appearanceId`，村名或个人名本身不产生新模型。

## 生产与返工记录

7 套正式包都保存 image generation 来源、逐字提示、身份锁、生成账本、遮罩决定、无损原稿、正式 runtime、manifest 与独立 auditor 结果。所有创意像素均为本项目定向生成；StoneAge 只用于行为与产品意图参考，没有复制其人物、贴图、代码、名称或数值。

两处视觉问题在进入最终证据前被拒绝并重做：

1. 钻石商 r1 的西北向偏转不足、过于接近正北。旧包和拒绝记录保持不可变；r2 由图像生成独立重画为清晰后左 45°，重新通过 12/12 bundle/install、真实 Godot 和新一轮盲审。
2. MM1 试炼师旧 `speaking` 人像左侧残留 73 个 alpha 1..15 的背景细线像素。修复没有硬擦成品；完整人像表重新生成并重走遮罩、builder/auditor。最终 r3 在 alpha 1、2、4、8、12、16 六档均只有一个连通主体，并重新录制全部证据。

因此，没有把旧候选的盲审或运行证据冒充新像素证据。

## 冻结视觉证据

正式方向与 Main 证据分为三个不可混用的 run：

- 五套一次通过候选：`phase329-final-v3-20260723-a`，direction evidence index SHA-256 `3ebf15b053cc5800151e129a947c320e534574d1ad4dfed3b229791083c1e705`；
- 钻石商 r2：`phase329-diamond-r2-20260723-a`，direction evidence index SHA-256 `685fb3127d207f11d47e353371ba9a8bf8257f8b782deaa7b685d35d23b01036`；
- MM1 r3：`phase329-mm1-r3-20260723-a`，direction evidence index SHA-256 `e514277a2e2fa9d3a11f78f06b8edb87643479aea56c13baa813a5d6f6e8ffa5`。

Stage A 在隐藏目录名并随机化 56 张世界图后得到 `56/56` 方向唯一匹配；Stage B 独立检查四状态人像 `28/28` 与真实 `Main.tscn` 世界/对话场景 `7/7`；最终 combined blind audit `7/7` 通过。各 appearance 的最终 audit SHA-256 为：

| `appearanceId` | combined audit SHA-256 |
| --- | --- |
| `npc_player_rebirth_mentor_f_v1` | `0ab33d2ae0fbc01f542f270bc9cc5b00e038a8a95b98bb4bde84bba74483e56f` |
| `npc_pet_mm_trial_mentor_m_v1` | `79d2ca025d85397f4aaffda55a76909ef8c63f941ae85cf54865b92971aa713c` |
| `npc_pet_mm_stage2_keeper_f_v1` | `389f0da03288bf944e92f7390f4c6cd76702d408a952d569e4c4996bb09b53c5` |
| `npc_diamond_merchant_m_v1` | `0264f4bdf2e7f2b624ddef9da1e3c4478bbb8898dceba28178c90c4bef2c0437` |
| `npc_pet_skill_trainer_m_v1` | `a7f36abb4e9900111bd208c3c940226b6750fc2bb5839aeb08a8d503387c5d58` |
| `npc_welfare_clerk_f_v1` | `0ef22fad64ee619b7aa876c9b05341c016024858bed033442a7af3055c30aa72` |
| `npc_storyteller_m_v1` | `42b52b77b4c6ed2c0355276c4b3eb4629a1ce096dc0c8888884040c0f3331773` |

方便所有者审阅的合并图保存在：

- `.run/evidence/phase329_remaining_npc_archetypes/final/remaining-seven-contact-sheet.png`：上排依次为转生导师、MM1、MM2、钻石商；下排依次为宠技训练师、福利员、说书人；
- `.run/evidence/phase329_remaining_npc_archetypes/final/remaining-seven-main-implementation.png`：同顺序的真实 Main 对话实装画面。

## 证据 sourceSet 与兼容边界修复

本阶段在重新冻结 evidence 时发现旧工具把 full decoded RGBA 重复写进 sourceSet 的两列，导致“canonical RGBA”实际上没有独立绑定。新录制链已统一为：

```text
file SHA-256 + full decoded RGBA SHA-256 + Godot canonical RGBA SHA-256
```

方向、Main、blind packet 和 release-evidence 现在使用同一 v2 `file/full/canonical` sourceSet。v2 release attestation 还必须与冻结 runtime evidence index 的 sourceSet 交叉绑定；仅在 appearance、catalog 声明 SHA 和实际 attestation SHA 同时命中 Phase 328 精确 allowlist 时，旧 8 套批准资产才允许用历史 v1 `full/full` 算法复验。换像素、换证明或新增候选都不能继承该兼容窗口。

Main capture 同时恢复两条清晰路径：首批 8 类从普通发布资源捕获，不依赖 QA candidate registry；后 7 类必须显式开启 QA preview，否则失败关闭。捕获 index/report 分别锁定 `normalPlayerRuntimeEnabled=true/qaPreview=false` 与 `normalPlayerRuntimeEnabled=false/qaPreview=true`。

## 验证

| 验证 | 结果 |
| --- | --- |
| 7 套 production bundle 独立 auditor | `7/7 PASS`；世界 56、人像 28，安装图 84/84 与正式 runtime 源一致 |
| Python staged/capture 回归 | `51/51 PASS`；packet、Stage A/B combine、方向录制与 first8/remaining7 Main capture 均覆盖 |
| Release evidence 自检 | PASS；v1 exact compatibility、replacement/new candidate 拒绝、v2 frozen sourceSet 漂移拒绝均覆盖 |
| Godot parse + NPC/设施定向回归 | `6/6 PASS`；parse、hover identity、appearance、interaction、facility marker、facility dialog；日志 `.run/godot_auto_checks/phase329_remaining7/2026-07-22T18-48-55-014Z.log` |
| 正式目录汇总 | `appearanceCount=15`、`released=8`、`pendingReview=7`、`worldFrameCount=120`、`portraitCount=60`、`cachedTextureCount=180`、`mapNpcArtInstanceCount=33`、`runtimeMirroringCount=0`、`errors=[]` |
| QA preview 空闲性能 | 60 FPS，稳定 `process_total=0.03ms` |
| QA preview 真实跨帧移动 | `status=ok`，60 FPS，稳定 `process_total=0.03..0.04ms` |
| QA preview 321 次连续真实点击 | `status=ok`，`avg/max=3/228us`，移动、合并和最终目标均正确 |

验证进程结束后没有残留 Godot 或录制进程。

## 未改变与仍未完成

- 未改变 NPC 服务、对话、任务、碰撞、经济、服务端、协议或玩家档案。
- 未给新 7 类创建 owner decision/attestation，也未开放普通运行；项目所有者验收后才可走独立发布步骤。
- 其他正式人物、宠物、地图和 UI 美术仍未覆盖完整首发路径，因此 `P2.2 原创高清 2.5D 正式美术` 总项继续保持未勾选。
