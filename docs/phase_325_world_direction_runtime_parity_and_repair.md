# Phase 325：世界真八向源图、Godot 导入与运行画面一致性修复

日期：2026-07-21

## 本阶段结论

Phase 324 的运行画面通过结论已经撤销。问题不是只有人工把东北看成西北：当时的录像还可能读取旧 Godot 导入缓存，因此“源 PNG 已改对”与“验收场实际画对”并不是同一件事。Phase 324 的最终 MP4、联系表和 `world_semantic_direction_approval_v1.json` 不能再作为当前通过证据。

本阶段先重新锁定三份必须一致的事实：仓库当前源 PNG、Godot 当前 import 记录、验收场实际加载的 `Texture2D`。七个形态已在完整重导入后分别通过 `120/120` fail-closed parity：每个形态覆盖共享人物 40 帧、独立宠物 40 帧、整体骑乘 40 帧。七份报告共记录 840 次加载检查；其中共享人物的 40 帧被每个形态重复验证，因此这不改变人工语义审批的 `15 bundles / 600 unique source frames` 范围。

普通乌力独立宠物东/东南 10 帧和新手老虎整体骑乘北向行走 4 帧已经重新制作并安装；新手老虎真北 walk 又在正式录制前按真北 idle 的尺度和落地基线重新派生，消除了约 12% 的缩小。修复后的七段新录像已在同一 `runId=phase325-final-20260721-v1` 下完成，三组独立审片者忽略 UI 文字和箭头后对 7 个形态、8 个方向、3 栏共 168 个方向栏位全部判定通过。新的 v2 语义审批清单同时冻结 600 个唯一源帧、实际运行 parity、录像、网格、联系表、媒体探测与三份盲审报告；项目所有者审美验收仍为 `pending`，所有正式运行开关继续关闭。因此这里只收口 Codex 方向语义，P2.2、P2.2b、P2.3 仍保持未完成。

## 根因与影响范围

### 1. Phase 324 录像读取旧导入缓存

Phase 324 的脚本检查了路径、尺寸、帧数和可加载性，却没有证明 `res://...png` 当前文件、`.import` 的 `source_md5` 与 `Texture2D.get_image()` 属于同一版本。对 600 个唯一源帧复查后发现 119 个 Godot import 缓存滞后：

| 形态/主体 | stale import 帧数 |
| --- | ---: |
| 蓝人龙独立宠物 | 2 |
| 普通乌力整体骑乘 | 10 |
| 赤角兽独立宠物 / 整体骑乘 | 15 / 1 |
| 地灵转生兽独立宠物 / 整体骑乘 | 24 / 17 |
| 新手老虎独立宠物 / 整体骑乘 | 20 / 30 |
| **合计** | **119** |

这解释了用户看到的矛盾：仓库里的普通乌力整体骑乘西北/北源图已经被改过，但 Phase 324 MP4 仍显示改动前的东北画面。录像只能证明当次 Godot 加载出的画面，不能在没有像素一致性报告时反推它读取了当前源文件。

### 2. 当前源 PNG 本身仍有 14 张方向错误

绕开旧 MP4 和导入缓存，对 600 个当前源 PNG 逐方向检查后，确认其余 586 张方向语义正确，以下 14 张仍错：

| 形态/主体 | 目录标签 | 实际问题 | 数量 |
| --- | --- | --- | ---: |
| 普通乌力独立宠物 | `east` 的 `idle 1 + walk 4` | 实际朝西 | 5 |
| 普通乌力独立宠物 | `southeast` 的 `idle 1 + walk 4` | 实际朝西南 | 5 |
| 新手老虎整体骑乘 | `north/walk-1..4` | 实际朝东北 | 4 |
| **合计** |  |  | **14** |

119 是“导入缓存不是当前源文件”的数量，14 是“当前源文件视觉方向仍错”的数量；两者属于不同检查维度，不能相加成 133 个互不重叠的问题帧。

## 修复

- 普通乌力独立宠物重新生成真东 `idle 1 + walk 4` 和真东南 `idle 1 + walk 4`，共 10 张 256×256 RGBA 运行帧；没有使用水平镜像造方向。
- 新手老虎整体骑乘重新生成真北 `walk-1..4`，共 4 张 256×256 RGBA 运行帧；人物与老虎仍是 AI 生成的单一整体主体，没有把人物层与宠物层离线拼接。
- 对全部世界方向资源执行 Godot 完整重导入，使 `.import` / imported MD5 与当前源 PNG 同步；生成缓存仍属于本机产物，不作为产品源文件提交。
- 为两组修复保留生成原稿、透明处理稿、逐字 prompt、源帧、manifest、联系表和循环预览；修复证据位于 `.run/evidence/phase325_world_direction_runtime_parity/semantic-repairs/`，产品来源记录位于各自的 `source/world/semantic-direction-repair-v2/`。

## Fail-closed 运行像素一致性门槛

`CharacterMountDirectionReview` 在构建联系表或开始录像之前，现在必须完成以下检查：

1. 通过目录公开接口取得人物、宠物、整体骑乘每一张源 PNG 的精确路径；
2. 读取当前源文件 SHA-256、MD5 和解码后的 RGBA；
3. 读取 Godot import 的 `source_md5`，要求它与当前源 PNG 的 MD5 完全一致；
4. 对验收场实际拿到的 `Texture2D.get_image()` 解码并计算 RGBA 哈希；
5. 因 Godot 默认 `fix_alpha_border` 允许改写半透明像素的 RGB，比较时只把 `alpha < 255` 的 RGB 归零，仍完整保留所有 alpha 和完全不透明像素 RGB；
6. 要求当前源图与实际加载图的规范化 RGBA 完全一致，并要求每个形态恰好有 120 条记录；
7. 任一源文件缺失、import 记录缺失/滞后、纹理不可读、尺寸错误、像素不一致或记录不足时，验收场非零退出，不生成可被误认成通过的录像。

验收场新增 `--mount-review-parity-only`、`--mount-review-parity-report=<path>` 和 `--mount-review-run-id=<id>`。正常联系表与录像路径也执行同一门槛，不能通过只跑一个独立检查后再更换文件来绕过。

## 已完成验证

- 负向回归：修复门槛在重导入前对普通乌力报告 `failed / 110 of 120 passed`，准确拦住整体骑乘北、西北 10 张旧加载像素；证据为 `.run/evidence/phase325_parity_regression_before_reimport/wuli_normal_orange_fire10/parity-report.json`。
- 完整重导入后，七个形态均为 `passed / 120 of 120`，七份报告的 120 条记录全部为 `loadMode=godot_import`，且每条同时满足 import freshness 与规范化 RGBA 一致：

| formId | parity | sourceSetSha256 |
| --- | --- | --- |
| `bui_novice_sprout_earth5_wind5` | 120/120 | `dd4a186fb042b9b7419aba7906c1688a8d1074bbe9722984db463b615ffbf7d4` |
| `wuli_normal_orange_fire10` | 120/120 | `dc1f8de2f737c11b6dc38b496b7c811882463c14be4d98c33f7203a8ac820feb` |
| `mossback_marsh_earth7_water3` | 120/120 | `57fe37ec2b80efc968197bf551c5ece79d97bb5da076340e959b2d758eca2a5c` |
| `emberhorn_red_fire8_earth2` | 120/120 | `fcbf4bcf19b2267541a99afdaf38a57de0e6bf26b032a0fbf36230a966699335` |
| `blue_man_dragon_water10` | 120/120 | `2e072157ecddec7a69be04516a28d8b803fccf31de9a7f874b5df7f0d7dac50e` |
| `rebirth_beast_earth_lv50` | 120/120 | `0237378e4f19d91973eefa6012da616f87a0ff3dba1c46651120b11e023dd943` |
| `novice_tiger_mount` | 120/120 | `8279e962e187705b0975c43286566c1377d2369d8e6a0e6463aae003f4a8ef20` |

对应报告位于 `.run/evidence/phase325_parity_post_import/<formId>/parity-report.json`。这些报告证明本轮重导入后的源 PNG、import 与实际加载像素一致，不自动识别或批准美术方向。

## 新录像与人工验收状态

- **已完成：修复后候选录像。**原子录制器在同一个 `runId=phase325-final-20260721-v1` 下为七个形态分别执行 parity-only、录像进程 parity 和网格进程 parity，三次均为 `120/120` 且 `sourceSetSha256` 不漂移；随后生成全新的 1280×720、30 FPS、433 帧、14.433333 秒 H.264 MP4、网格和每方向 idle/walk 双采样联系表。七段视频均完整解码零错误；113 个技术证据文件由 `.run/evidence/phase325_world_direction_runtime_parity/candidate/phase325-final-20260721-v1/evidence-index.json` 冻结。Phase 324 文件未复制或复用。
- **已完成：三组独立人工盲审。**审片者只看新 `review.mp4` 与 `review-contact-sheet.png`，明确忽略目录名、UI 文字和箭头；Group A/B/C 分别得到 `72/72`、`48/48`、`48/48` 栏位通过，合计 `168/168`、0 失败、0 模糊项。普通乌力西北/北与独立宠物东/东南均再次通过；新手老虎整体骑乘真北的 idle 与 walk 1..4 全部为居中严格后视，和东北三分之四轮廓可明确区分，尺度、基线及骑手/老虎轴线连续。报告为同 run 根目录的 `blind-audit-group-{a,b,c}.json/.md`。
- **已完成：v2 Codex 语义清单。**`client/godot/data/world_semantic_direction_approval_v2.json` 为 `15 bundles / 600 unique frames`，`verify` 返回 `checkedFrames=600`、`checkedEvidenceFiles=116`、`errors=[]`；116 包含 1 份 evidence index、112 份逐 form 技术证据和 3 份盲审 JSON。旧 v1 只能返回 `legacy_manifest_not_current`，不能恢复成当前通过结论。
- **TODO：项目所有者验收。**即使上述 Codex 盲审通过，项目所有者仍需独立确认风格、比例、骑乘接触、运动连贯性和整体审美；在用户明确批准前，`ownerReviewStatus=pending`、`runtimeEnabled=false`，不得把 P2.2/P2.2b/P2.3 勾成完成。

## 仍未完成

1. 七套仍待项目所有者确认风格、比例、骑乘接触、运动连贯性和整体审美；Codex 语义通过不能替代 owner review。
2. 其余 27 个形态仍没有完整的宠物世界真八向和人物骑宠整图；34 套 standalone battle candidate 不能填补这一缺口。
3. 七套整体骑乘专属战斗动作、正式技能/合击表现和音频仍未完成。
4. 本阶段不改变玩法、数值、服务端、玩家档案、协议或正式运行开关。
