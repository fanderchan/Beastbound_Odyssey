# 文档导航

这里是项目文档的统一入口。面向你和后续开发者的现行说明集中在下表；几百份 Phase 文件作为可检索的历史证据保留。

## 从哪里开始

| 你要做什么 | 先读什么 |
| --- | --- |
| 久未开发，想知道游戏做到哪了 | [项目现状](project-status.md) |
| 想知道一个功能该改哪里 | [架构与功能定位](architecture.md) |
| 启动项目、开始下一轮开发 | [开发流程](development.md) |
| 判断该跑哪些检查 | [测试指南](testing.md) |
| 试玩最新守护战、查看效果和成品差距 | [当前四层／地标／五人战斗预览与试玩入口](phase_569_current_four_floor_review.md)、[当前鼠标操作与性能复核](phase_571_current_cave_input_and_performance.md)、[最近人物轮廓优化与验证](phase_575_player_visual_bounds_reuse.md)、[项目现状与剩余门槛](project-status.md) |
| 继续整理大文件和技术债 | [维护清单](maintenance.md) |
| 按文件找代码、数据、脚本 | [自动代码索引](reference/code-index.md) |
| 查某项规则为何这样设计 | [自动阶段索引](reference/phase-index.md) |
| 找工具或运维入口 | [工具导航](../tools/README.md)、[服务端说明](../server/node/README.md) |

## 各类文档分别负责什么

| 类别 | 权威入口 | 使用规则 |
| --- | --- | --- |
| 产品方向和 P0–P3 | [stoneage_gap_plan.md](../stoneage_gap_plan.md) | 决定要做什么；读进度追踪，不凭历史评估数字判断现状 |
| 生产发布执行队列 | [production_release_loop_plan.md](../production_release_loop_plan.md) | 是产品路线图的细化；当前主目录已统一到最新开发基线，按本目录游标继续 |
| 执行约束 | [根 AGENTS](../AGENTS.md)、[客户端 AGENTS](../client/godot/AGENTS.md)、[服务端 AGENTS](../server/node/AGENTS.md) | 规定代码、权限、数据与验证边界 |
| 当前使用方法 | 本页上方的现行指南 | 保持短、可执行；修改相关代码时一起更新 |
| 设计和实施证据 | `docs/phase_*.md` | 描述当时的行为、分支、测试和剩余风险；不自动代表当前代码 |
| 专项验收 | [发布验收清单](release_acceptance_checklist.md)、[试玩路径](release_playability_walkthrough.md)、[视听审计](asset_audit.md) | 与精确候选、资产生命周期及所有者结论一起读 |
| 已完成的历史计划 | [旧发布计划](../release_plan.md)、[旧质量计划](../quality_cleanup_plan.md)、[旧 Bug 台账](../tasks.md) | 历史已完成；只有复现回归才重新处理 |
| 早期档案 | [早期阶段说明](bak/legacy_phase_notes/README.md)、[旧手册快照](bak/handbooks_20260917/README.md) | 保留原始内容与回溯价值，不作为新操作指引 |

不要新建另一份“总计划”重复记进度。当前产品状态归产品路线图，发布执行状态归主目录的发布计划，某次工作的证据归 Phase。

## 如何保持整洁

- 新增或移动代码、共享数据、阶段文档后，运行 `node tools/repository_guide.mjs refresh`。
- 完成修改前运行 `node tools/repository_guide.mjs check`；它检查自动索引是否过期、现行指南的本地链接目标是否存在。
- 自动索引只说明文件存在，不证明测试通过或产品已上线；历史文章里的旧绝对路径、日志和行号不追溯改写。
- 保留历史文件位置，避免破坏既有资产证明、Phase 引用和外部书签。新的解释集中更新现行指南。

本轮整理的范围和验证见 [Phase 543](phase_543_repository_navigation_and_http_boundaries.md)。
