# Phase 476：当前混合工作区变更盘点与发布分流

日期：2026-08-18

## 2026-08-19 当前权威快照

本页原先的 `80` 路径属于 Phase 478 返工前历史盘点，不能继续解释 Codex／Git UI 中的当前数字。以远端 `main=d9c6374473e1932af3d3a9f39997e110a4e64d19` 的干净克隆为基线，使用远端 tracked 路径逐文件 checksum 比较，再减去标准 ignore 与本地 NPC exclude 后，当前事实为：

| 范围 | 路径数 | 分类 | 决定 |
| --- | ---: | --- | --- |
| 真实内容差异 | `108` | 当前全部可发布候选与本地记录 | 不按陈旧 `.git` 状态整批提交 |
| Firebud v2 精确候选 | `106` | `50` 个产品／工具／合同／说明路径 + `56` 个冻结证据路径 | 技术门禁已闭合，等待 Phase 486 画面 owner 决定；批准前不发布 |
| 本地审计记录 | `2` | 本页与 Phase 479 融合开放就绪复核 | 分别随对应独立批次处理，不混入 Firebud 产品范围 |
| Godot `*.uid` | `343` | `.gitignore` 已明确忽略，远端 tracked 数为 `0`；不同工作树会生成不同 UID | 纯本地生成状态，不提交，不计入真实内容差异 |
| 远端 tracked 但本地缺失 | `0` | 无删除候选 | 无需恢复 |

Firebud `106` 路径内部为 `78` 个 bundle 文件、`4` 个地图 Skill 合同／审计文件、`8` 个客户端脚本、`2` 个权威地图数据、`10` 个工具／测试、`3` 份 Firebud 阶段说明和 `1` 条路线图更新；其中 `56` 个 `evidence/` 路径是 hash-frozen 审计与交互证据，不是缓存。当前没有未忽略的骑乘、宠物或 NPC 产品差异；此前 UI 中“骑乘 30、宠物 18、NPC 207”等分组已经被远端发布、陈旧索引或忽略目录混合放大，不能继续当作待提交数量。

仅按路径和 ignore 合同复核，本机还保留 `2811` 个 NPC、`7591` 个宠物及 `836` 个角色目录下的忽略文件。它们是 raw／prompt／production／QC／rejected／provenance 等本地生产档案，不是 Git 候选；本次不读取其内容、不删除、不移动，也绝不因数量大而上传。正式运行资产已经由远端 tracked 文件和各自发布证明管理。

因此当前四类结论是：正式成品没有新的独立未发布批次；Firebud 属于“可继续完善／待 owner 决定”；其 `56` 个证据文件属于“候选冻结证据”；`*.uid`、`.import`、`.godot` 与 `.run` 属于“纯生成状态”。这次盘点把“273 项待人工合并”的旧问题收敛成一个 `106` 路径的单一 Firebud 发布候选和两个独立记录文件。

> 2026-08-18 后续更新：本页的 `80` 路径是 Phase 478 返工开始前的冻结盘点，不再代表当前动态计数。Phase 478 已新增原创生活／训练道具、待审 catalog/collision 合同和测试，且主动撤下与新构图不一致的旧正式截图、Computer Use 与性能引用。当前仍按同一发布分流原则处理：NPC 本地制作档案继续排除，已发布 Phase 475／477 不重复提交，Firebud 在新真实 Main 证据完成前不进入 `main`。详见 `docs/phase_478_firebud_lived_in_redesign_candidate.md`。

## 盘点边界

本阶段只整理当前工作树相对已发布远端基线的真实差异，不把旧 UI 快照或原工作区陈旧 Git 指针显示的数量继续当作现状，也不删除、覆盖或发布任何待审美术。权威基线为远端 `main` 已确认提交：

```bash
fb07e6baa8304f79e05da47e39c494bf9598ab3a
```

原工作区 `.git` 仍停在 `1f22eded5`，沙箱不能写 `FETCH_HEAD`，所以直接运行 `git status` 会把已经发布的 Phase 475／477 继续显示成修改或未跟踪文件。使用指向 `fb07e6baa` 的隔离 Git 索引、以原工作树作为 `--work-tree` 比较后，真正未发布的范围为 `80` 个路径：`75` 个已跟踪修改、`5` 个未跟踪文件。它们全部属于 Firebud 候选或本盘点文档。

## 分类结果

| 分组 | Git 可见路径 | 判断 | 处理决定 |
| --- | ---: | --- | --- |
| 已发布 Phase 475 正式地图环境声 | 27 | 已在 `fb07e6baa` 发布；bundle 级听感仍为 `owner_listening_pending` | 从未发布计数中剔除，不重复提交 |
| 已发布 Phase 477 任务标记层级 | 5 | 已在 `76feda9b2` 发布并包含于 `fb07e6baa` | 从未发布计数中剔除，不重复提交 |
| Firebud 候选产品源、Skill、QA、说明与工具 | 23 | 真实产品／QA／生产工具改动，但仍属于待审候选 | 继续完善，不进入 `main` |
| Firebud 冻结验收证据 | 56 | 不是缓存，也不是普通产品运行资产；是当前候选的 hash-frozen 审计、截图、Computer Use、碰撞和性能证据 | 与候选一起保留；若画面重做，按地图 Skill 归档旧证据，不直接删除 |
| 本 Phase 476 盘点文档 | 1 | 只记录分流和基线事实 | 随 Firebud 最终批次提交或在下一独立文档批次处理 |
| 本地 NPC 制作档案 | 2607 | `.git/info/exclude` 明确隔离的 raw／identity／production／prompt／QC／rejected 文件；不是 Git 候选 | 保留在本机，不加入索引、不上传 |
| Git 可见纯缓存 | 0 | `.run/`、Godot import/cache 等均在忽略边界外，不属于这 80 项 | 不提交、不用来凑“已整理”数量 |

因此工作树中确实保留了 NPC 制作档案，但 `2607` 个文件均由 2026-08-12 写入的本地私有 exclude 规则隔离，用于 provenance／返工历史，不是待提交内容。Firebud 权威地图中的 `14` 名服务 NPC 是运行时布局实例，不能与这些本地制作档案混为一谈。

## 已发布批次

Phase 477 先以 `76feda9b2f06ce761a0cf9e33fd1af77dc628cf9` 发布任务标记视觉层级修正；Phase 475 随后无内容漂移地 rebase，并以 `fb07e6baa8304f79e05da47e39c494bf9598ab3a` 发布。远端跟踪引用和隔离克隆 `HEAD` 均为 `fb07e6baa`。

Phase 475 精确发布范围为：

- 音频 Skill、合同、确定性 builder／auditor 和 8 项管线测试；
- 3 条 CC0 来源、3 条 48 kHz stereo Ogg 环境声和 34-cue 账本；
- `GameAudioManager` 独立 `Ambience -> SFX` 总线、等功率切换和战斗 duck／restore；
- 正常 Main 音频检查、专用审听场景和 `docs/phase_475_formal_map_ambience.md`；
- `stoneage_gap_plan.md` 中只属于 Phase 475 的一条证据。

该范围已在隔离 Git 索引中验证为精确 `27` 路径，Python 音频测试 `8/8`、bundle auditor、Godot parse、manager/runtime 检查、privacy／secret scan 均通过。已发布的 10 个、在原陈旧索引下显示为未跟踪的 Phase 475／477 文件，也已逐文件 `cmp` 证明与 `fb07e6baa` 完全一致；不得重复加入后续 Firebud 批次。

## Firebud 技术状态

当前 `firebud_region_visual_v2` 不是废稿，也不是正式成品，而是技术闭合的 `owner_review_pending` 候选：

```text
status=PASS
releaseReady=false
filesChecked=101
jsonsChecked=17
pngsChecked=39
errors=[]
missingReleaseGates=[
  lifecycle_released_and_enabled,
  owner_acceptance,
  release_attestation
]
```

当前验证：

- 地图 Skill auditor：`PASS / releaseReady=false`；
- 服务区静态布局：`PASS`，14 名 NPC、15 个布局对象、最近脚点 `72.11px`、中央通道清空、遇敌区 NPC 为 0；
- 权威地图 preview：`PASS`，Firebud v2 村口 `672 ground / 31 objects / 207 protected`，训练场 `1224 / 19 / 123`；
- Python 回归：地图 auditor `17/17`、证据 builder `14/14`、动作 capture `8/8`、Computer Use evidence installer `3/3`；
- `git diff --check`：通过。

这些证据证明候选没有结构、权威地图、碰撞证据或生产工具回归，但不能替代审美验收。

## 美术总监判断

当前 Firebud v2 服务区候选不建议签 owner approval，继续保持 pending：

- 村口比旧版队列更可接近，中央通道和石图腾方向正确；
- 但 14 名服务 NPC、多个超大感叹号与重复花丛仍形成明显的 QA 摆阵感；
- 训练场大片平绿地、硬折线土路和稀疏物件使画面像未完成编辑器关卡；
- 地表、花丛、建筑和半写实人物的材质密度与光照统一度仍不足；
- 地砖边界阶梯感强，路径与草地缺少自然过渡；
- 当前底部入口和右侧任务面板视觉重量过高，进一步放大了地图空洞与主体层级不足。

建议的下一次 Firebud 返工边界：

1. 保持权威玩法格、warp、记录点、NPC ID／服务和可达性不变；
2. 将服务 NPC 从“多行规则站位”改成围绕建筑／摊位／图腾的 3～4 个功能簇，同时保留中央通路；
3. 降低重复花毯密度，增加少量有方向性的地标和生活道具；
4. 用同语义 tile variant 或低对比过渡弱化土路阶梯边；
5. 任务标记缩小与主次分级已在 Phase 477 发布；下一版 Firebud 必须用正常 Main 路径补录新标记下的对照片。HUD 去重继续归 P2.5，不在地图包内硬改。

这次判断是“继续完善”，不是删除候选。现有 56 个冻结证据文件继续保留，用于证明当前版本为何未获批准和后续改动前后差异。

## 下一步顺序

1. Firebud 保持 pending，不生成 owner acceptance 或 release attestation；
2. 在不改变权威玩法格、NPC 身份和服务的前提下，先完成村口功能簇、训练场空间拓扑、地表过渡与生活道具返工；
3. 重跑地图 Skill 全门禁，并补录任务标记缩小后的正常 `Main.tscn` 画面和短视频；
4. 只有画面达到正式发布级别后，才把精确 `80` 路径重新收敛为新的候选批次；
5. P1.4 融合宠继续等待所有者对 solar／moss 大头照和首批两个配方作审美决定，不以默认同意代替批准。
