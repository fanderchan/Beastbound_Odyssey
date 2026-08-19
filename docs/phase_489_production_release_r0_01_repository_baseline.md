# Phase 489：生产发布 R0.01 仓库事实冻结

日期：2026-08-20

## 目标

在不移动、不删除、不合并、不覆盖任何现有文件的前提下，冻结 R0.01 开始时的本地 HEAD、最新 origin/main、分支差异、全部 Git 可见修改/未跟踪路径和本地忽略状态。核心目的不是判断候选是否应该发布，而是把“已经发布”“仍是本地候选”“本地记录/控制文件”“仅存在于远端基线”和“用户私有或生成状态”分开，为 R0.02 的安全重放提供唯一输入。

本阶段不改玩法、客户端、服务端、资源生命周期或 owner 决定，也不尝试吸收远端提交。R0.02 才负责在独立干净工作树中安全吸收远端和隔离候选。

## 快照边界

- 捕获时间：2026-08-20T02:26:58+08:00
- 本地分支：main
- 本地 HEAD：1f22eded5a2c72191d57ac5eb2e4edfbcd75ad91
- 最新 origin/main：ddcb4ff770093d0ae1533631f6371b11e1ce4f30
- merge-base：1f22eded5a2c72191d57ac5eb2e4edfbcd75ad91
- ahead/behind：0 ahead / 4 behind
- 远端：git@github-fanderchan:fanderchan/Beastbound_Odyssey.git
- 清单：docs/release_baselines/2026-08-20_r0_01_worktree_inventory.tsv

清单范围是以下两者的路径并集：

1. git status --porcelain=v1 -z --untracked-files=all
2. git diff --name-only -z HEAD..origin/main

每个现存文件用 Git worktree blob hash 和模式与 origin/main 对应 tree entry 比较。Phase 489 文档与清单本身是在冻结输入之后创建，因此不反向写入快照，避免自引用哈希。

## Git 原始事实

| 项目 | 数量 | 解释 |
| --- | ---: | --- |
| 本地 Git 可见路径 | 203 | 116 个 tracked 修改、87 个 untracked；无 staged、rename 或本地删除 |
| HEAD..origin/main 路径 | 47 | 最新远端 4 个提交涉及的路径 |
| 两者并集 | 204 | 清单逐路径覆盖，无重复 |
| 与 origin/main 字节和模式一致 | 37 | 虽因本地 HEAD 陈旧显示修改/未跟踪，但已经发布，不得重复提交 |
| 工作树与 origin/main 不同 | 93 | 已跟踪路径上的后续本地候选或混合改动 |
| 仅工作树存在 | 73 | 本地候选、记录或 Loop 控制文件 |
| 仅 origin/main 存在 | 1 | Phase 488 文档；是分支落后造成，不是删除候选 |

远端 47 条路径可精确对账为：37 条工作树已与远端一致、9 条在远端版本之上还有本地改动、1 条只存在于远端。三者相加为 47。

## 发布分流

| 分组 | 路径数 | 状态 | R0.02 决定 |
| --- | ---: | --- | --- |
| published_origin_main | 37 | 已发布且逐 blob/mode 一致 | 不重放、不重复提交 |
| firebud_v2_owner_candidate | 129 | Firebud v2 产品、工具、合同、正式证据和本地源；仍是 owner_review_pending | 作为独立候选批次重放，绝不与 Bui 混合 |
| bui_charge_feedback_owner_candidate | 31 | Bui 冲锋反馈运行资产、源、模型、测试和 Phase 487 | 作为独立候选批次重放 |
| mixed_candidate_wiring | 2 | main.gd 与 auto_check_coordinator.gd 包含跨候选接线 | 在 R0.02 按实际 hunk 拆分后再重放 |
| mixed_shared_roadmap | 1 | stoneage_gap_plan.md 同时含融合、Firebud、Bui 与已发布记录 | 按证据行拆分，禁止整文件覆盖远端 |
| local records/control | 3 | Phase 476、Phase 479、production_release_loop_plan.md | 作为独立文档控制批次处理 |
| remote_origin_only_pending_r0_02 | 1 | Phase 488 仅在 origin/main | 随干净远端基线自然取得，不从本地伪造恢复 |

当前没有未分类路径。这里的“没有未分类”只表示每条路径已进入明确分流，不表示候选已通过测试、owner 验收或发布门禁。

## 已发布路径为什么仍显示为脏

本地 HEAD 停在 2026-08-17 的 1f22eded5a，而 origin/main 已包含后续 4 个提交：任务标记层级、正式地图环境声、画像 identity evidence 对账和地表完整过渡合同。37 条工作树文件已逐 blob/mode 等同 origin/main；它们出现在普通 git status 中只是因为本地索引仍基于旧 HEAD。

因此 R0.02 不得把普通 status 的 203 条路径整批 add，也不得把 37 条已发布文件重新包装成新提交。

## 本地私有与生成状态

git ls-files --others --ignored --exclude-standard 只按路径统计到 143035 个 ignored 文件。本阶段没有读取其内容，也没有逐文件写入可发布清单。

| 忽略分组 | 数量 | 处理 |
| --- | ---: | --- |
| .run | 105360 | 本地运行、截图、报告和生产过程状态；保留，不发布 |
| client/godot/.godot | 23064 | Godot import/cache；可再生，不发布 |
| 宠物本地生产档案 | 7591 | raw/prompt/production/QC/provenance 等本地档案；保留，不自动上传 |
| NPC 本地生产档案 | 2811 | 同上；保留，不自动上传 |
| 其他 Godot 客户端忽略状态 | 2244 | 本地生成或工具状态；保留 |
| 角色本地生产档案 | 836 | 本地生产档案；保留，不自动上传 |
| server/node/node_modules | 547 | 依赖安装状态；不发布 |
| Godot .uid | 346 | 本地生成 UID；远端是否跟踪由正式合同决定，本批不上传 |
| 音频本地生产档案 | 90 | 本地源/处理中间状态；保留 |
| 其他仓库忽略状态 | 72 | 保留，R0.02 不触碰 |
| 地图本地生产档案 | 50 | 本地源/处理中间状态；保留 |
| server/node/.local | 24 | 本地运行配置与潜在凭据；绝不提交 |

## R0.02 的安全输入

R0.02 必须从最新 origin/main 的独立干净 worktree 开始，并按以下顺序处理：

1. 自动继承远端 4 个提交和 Phase 488，不从当前工作树整文件覆盖。
2. 完全排除清单中的 37 条 published_origin_main。
3. 分别重放 Firebud 129 条与 Bui 31 条候选；一个批次一次验证。
4. 对 main.gd、auto_check_coordinator.gd 和 stoneage_gap_plan.md 做 hunk 级拆分，不能把共享文件归给任一批次后整体覆盖。
5. Phase 476、Phase 479 和 Loop 计划作为独立记录/控制批次处理。
6. 不进入、不读取、不删除 143035 个 ignored 文件；尤其不触碰 .run、Godot 用户目录、server/node/.local 与本地资产生产档案。

## 可复核命令

- git fetch origin --prune
- git rev-list --left-right --count HEAD...origin/main
- git status --porcelain=v1 -z --untracked-files=all
- git diff --name-only -z HEAD..origin/main
- git ls-tree -rz origin/main
- git hash-object --no-filters -- PATH
- git ls-files --others --ignored --exclude-standard -z

## 验证结果

- origin/main 已刷新为 ddcb4ff770093d0ae1533631f6371b11e1ce4f30。
- 清单校验 PASS：204 条数据行、204 个唯一仓库相对路径。
- 分组校验 PASS：37 已发布、129 Firebud、31 Bui、2 共享接线、1 共享路线图、3 本地记录/控制、1 仅远端；合计 204。
- relation 校验 PASS：37 published_identical、93 differs_from_origin、73 local_only、1 missing_vs_origin；合计 204。
- 远端路径对账 PASS：37 + 9 + 1 = 47；已发布行的 origin/worktree blob 与 mode 不一致数为 0。
- 格式校验 PASS：两个新增文件无行尾空白，清单无 unknown 分组。
- 本阶段只新增文档和清单，不需要 Godot、服务端或 Main.tscn 运行验证。

## 剩余风险

- 当前主工作树仍落后 4 个提交且混有两个产品候选；R0.01 只建立事实，不解决合并风险。
- main.gd、auto_check_coordinator.gd 与 stoneage_gap_plan.md 仍是共享文件，必须在 R0.02 做 hunk 级拆分。
- Firebud 与 Bui 的技术测试和 owner 验收状态没有因本次分类而改变。
- 143035 个 ignored 文件只做路径级聚合；任何未来提升都必须走对应资产合同，不能把 ignored 状态整批加入 Git。
