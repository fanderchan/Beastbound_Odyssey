# Phase 376：首批融合宠关闭态生产登记与验收候选

## 结论

曜冠角兽、苔垒角兽已从 Phase 372 批准的隔离非骑乘完整包迁入正式宠物资产根，并各自生成可逐文件重放的关闭态登记清单。两条正式融合配方同步进入共享目录，但全局 `runtimeEnabled=false`，正常玩家入口仍不存在。

本阶段只完成“生产位置可用、玩家功能继续关闭”的工程闭环：

- 不开放融合，不消耗玩家宠物、石币、钻石或道具；
- 不接入 `Main.tscn`、普通面板入口或网络执行按钮；
- 不创建 runtime release attestation；
- 不把两张新大头照冒充为项目所有者已批准；
- 不制作骑乘包，首批融合宠继续不可骑；
- 不改变三宠材料、遗传概率、绑定、终局、成长或技能等级规则。

玩家收益是：正式开放前已经可以完整检查三只材料、目标外观、主动／被动遗传、绑定与不可逆确认信息，不必等到高价值宠物真正可消耗后才发现表现层或资产链问题。代价是本轮保留了一套 QA-only 展示入口和较重的来源证据；它们不进入正常玩家热路径。

## 生产资产登记

正式根：

```text
client/godot/assets/pets/emberhorn_fusion_solar_crown_fire7_wind3
client/godot/assets/pets/emberhorn_fusion_moss_rampart_fire4_earth6
```

每个根的冻结产品清单为：

- `675` 个从批准隔离包登记的身份、世界、战斗及工程证据文件；
- `1` 份 `qa/release/closed-registration-manifest-v1.json`；
- `11` 个正式大头照及其来源／生成／紧凑尺寸证据文件；
- `1` 个固定 60B 的 `qa/portrait/.gdignore`，只阻止 Godot 导入 QA contact sheet；
- 合计 `688` 个非 `.import` 产品文件；
- 本机生成的 `527` 个 `.import` 不属于产品清单，也不得进入 Git。

冻结摘要：

| 形态 | 登记清单 SHA-256 | action metadata SHA-256 | 正式头像 SHA-256 |
| --- | --- | --- | --- |
| 曜冠角兽 | `329785db8d06371340a2befa21e50cc394a50bc1899103e3aa56d43b3df5781f` | `0d986b017e0ced0745d7f6e3bfc1ca9ade89de2e1c96187593bc3c547d2a61b8` | `94f268b58859fff9ff89dee21de7f611c01e279a0dd2d3c2c1c22321d60d8b59` |
| 苔垒角兽 | `449307ee506d56c82c1a4e6c005273b03f31d9df9b81b55a8a684a61ffa0458d` | `5626879e3d2a37d20f7e61783652c62a05293c858f168a75ed8e39b39a20b6c3` | `45f1d3c4f4581667aaf803807af9d5cc137a44b8e9a06a7285f90c5e9256eb4d` |

登记过程只复用 Phase 372 已明确批准的身份、世界真八向、双视角战斗与复活时序范围。机器可读 owner decision SHA-256 为：

```text
852f8772cfbe2223479d6af2b3b81cff2a79125b4f4ca3343c2912dfc6303d14
```

专用大头照是重新独立绘制并完成来源、Alpha、构图、身份引用和缩放重复检查的工程候选；两张均保持：

```text
ownerReviewStatus=owner_review_pending
semanticIndependenceVerified=false
releaseGate=false
```

36 形态全量头像审计结果为 `status=ok / audited=36 / errors=[]`。这只证明工程完整性，不能替代项目所有者的审美与角色语义验收。

## 关闭态配方与零副作用

`pet_fusion_recipes.json` 现有两条正式配方：

- 炽角核心 + 炽角共鸣一 → 曜冠角兽；
- 炽角核心 + 苔背共鸣一 → 苔垒角兽；
- 共鸣二仍只提供允许范围内的技能候选；
- 两条结果均 `rideable=false`、`paidResetAllowed=false`、`numericSource=target_profile_only_v1`；
- 全局运行开关和玩家入口继续关闭。

服务端 HTTP E2E 使用两组真实满足条件的三只一转 Lv131–140 材料宠，验证：

- 两条正式配方都在最外层关闭门拒绝；
- 恶意 recipe、角色、确认和材料输入不能越过关闭门；
- 宠物、货币、背包、revision、存储写入和 RNG 调用均为零；
- 历史已提交 receipt 仍可幂等重放，但不会产生第二次 mutation。

## QA-only 客户端展示

新增独立选择、展示和全屏融合面板，只供合同检查和录像：

- 三个材料位与五只候选宠正式大头照；
- 曜冠／苔垒两条目标路线；
- 攻击、防御固定主动；
- 三只材料的特殊主动各 50%；
- 唯一被动 40%／30%／30%；
- 数值不继承、绑定、成本、不可骑、终局与不可付费重置说明；
- 第一次点击只展开不可逆确认，第二次执行入口在本体验中永远不触发；
- 每个状态 `networkRequestCount=0`；
- 关闭态材料、候选和确认全部禁用，文案精确为“宠物融合尚未开放；当前不会消耗任何宠物。”

该面板没有接入 `main.gd`、`panel_flow_coordinator.gd`、正常菜单、HTTP 或 WebSocket。技能等级遗传规则仍未决定，因此界面和数据均不擅自加入等级继承。

## 最终 1× 视觉证据

第一次合片在自审时发现关闭态确认按钮的禁用文字过暗，已提亮后作废旧片并完整重录。最终片：

```text
.run/evidence/phase376_pet_fusion_closed_owner_review/
  phase376-fusion-closed-final-v2/pet-fusion-closed-review-1x.mp4
```

视频 SHA-256：

```text
f6cc98dbb455f7afcda6fa5a48979645e17334af74ae22f0e4ddaaa9f1e38e29
```

证据合同：

- H.264 / yuv420p / 1280×720 / 30 FPS / `1.00x`；
- 900 帧、30.000 秒、无加速、无变速滤镜、无音频；
- `关闭 → 曜冠预览 → 曜冠首次确认 → 苔垒预览 → 苔垒首次确认 → 关闭`；
- 原始捕获精确验证 5 个视觉状态、12 个边界帧及第 899 帧关闭态；
- 最终 H.264 与原始帧逐索引比对，PSNR 最低 `50.2dB`、平均 `50.647778dB`；
- 15 次连续合格窗口采样均完整位于主屏；
- 17 轮 Godot 主进程及全部后代 socket 采样，另由 macOS `deny network*` 沙箱约束；未观察到 Internet、后端或 MySQL；
- 使用隔离 HOME 与一次性 Godot clone，未使用正常玩家存档，结束后无孤儿进程；
- `PASS.json`、`summary.json`、`SHA256SUMS` 与视频哈希相互绑定并全部复算通过。

这仍是待项目所有者观看的验收候选，`ownerReviewStatus=pending`。

## Git 交付边界

本阶段的窄提交只收录两只正式宠物根、两条关闭态配方、视觉批准依据、客户端关闭契约、服务端零副作用回归、登记／发布校验工具及本阶段文档。录制所用的 QA-only 面板、录制器和 `.run` 证据继续保留在本机验收工作区，不作为生产运行依赖，也不随本次窄提交进入玩家客户端；待项目所有者完成本轮视觉验收后，再决定是否保留为长期 QA 工具。

## 验证

已通过：

- Python 登记、头像构建、关闭发布校验：`112/112`，另有 `1` 个显式真实集成环境跳过；
- 头像审计器 formal relocation 正反回归：`32/32`；
- 头像全目录：`36/36`，`errors=[]`；
- 服务端融合关闭态／目录／技能相邻回归：`49/49`；
- Godot 融合合同脚本在独立干净工作树中完成解析并执行 `PASS`；
- Godot 头像目录与共享消费者：`3/3`，`catalog=36 formal=36 errors=[]`；
- Godot 融合 client domain 与 panel：两条路线均正式头像、五候选零占位、布局在 1280×720 内；
- 录像工具：`31/31`；
- 独立关闭发布校验：`PASS`，`2 forms / 1350 copied files / 22 portrait files / 2 QA controls`；
- `pet_art_batch_audit.py`：`errors=0 / warnings=0`。

提交前另把暂存区写成一次性 detached clean worktree，完全排除主工作区其他未提交文件后重跑：独立关闭发布校验 `PASS`、登记／发布校验 `45` 项通过（其中 `1` 项真实外部集成环境显式跳过）、候选成长 `8/8`、服务端 `49/49`、Godot 融合合同 `PASS`。该复验同时修复了发布校验器误把身份流水线历史绝对路径摘要按当前 checkout 路径重算的问题，并增加“整仓换目录后仍可验证冻结证据”及“清单与候选 action 协同改写 replay 摘要仍拒绝”的回归。

普通 `Main.tscn` 的 clean-worktree 最小启动仍会命中本阶段之外、尚未进入本窄提交的宠物栏视觉依赖错误；当前脏工作区的正式 Main 已由此前玩家界面录像覆盖。本阶段没有借机吞入那批 owner-review-pending UI，也不把 Godot 返回码 `0` 冒充普通 Main 干净启动通过。融合专用合同、数据和服务端闭环不依赖那些 UI 文件。

生产批审计仍报告 6 个仅对关闭形态记为 pending 的世界 walk 中心漂移，范围为 `13.0–15.5px`、门槛 `12px`。这些帧属于 Phase 372 已批准的视觉包；本阶段没有偷偷改像素或伪造新批准。它们必须在未来 runtime 开放前选择“修帧并重新验收”或由项目所有者明确接受，不能在本阶段消失。

## 后续门禁

以下事项仍未完成：

1. 项目所有者观看本阶段最终视频并单独验收两张新大头照与融合信息布局；
2. 处理或明确接受 6 个世界 walk 中心漂移 pending；
3. 另做 runtime 决定与 release attestation；
4. 再接入正常玩家入口、服务端执行按钮与真实事务；
5. P1.4 父项在以上工作完成前继续不勾选。
