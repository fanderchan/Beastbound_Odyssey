# Phase 602：当前洞穴画面、鼠标操作与性能证据配对

日期：2026-09-21，基线 `614ff4a4f048b0608dea7cd9b8d85287c778e4de`。继续 P2.1a／R1.W024。

四层当前 Compatibility 路径的 20 组独立实景截图、20 项真实鼠标动作、严格碰撞检查及 Phase601 的 48 组性能样本已安装到同一候选包。修复独立审计器遗漏的旧后端判断。没有修改地图美术原件、人物比例、玩法、碰撞数据、客户端或服务端运行代码；没有批准或启用候选。

## 当前画面与鼠标操作

先在单个持续 Main 中完成 scratch 20 组截图，再由正式事务流程采集并替换 20 对 `1280×720 PNG / capture report`。20 张图的像素哈希互不相同，每张绑定当前运行内容、实际窗口、来源及隔离回执。独立截图用来证明实景和静止／移动状态；具体点击、阻挡和上下楼行为由另一轮真实 Computer Use 验证，二者不混称。

真实鼠标轮次采用一个 Main、离线 Lv100 内存测试角色、候选预览，关闭随机遭遇和保存。55 次原始工具调用、53 张 `640×392` 窗口图片、零工具错误；原始图片解码后按字节保存，没有重绘或放大冒充原生截图。每层分别配对点地、寻路、换层、碰撞和遮挡五类动作。

| 楼层 | 点击与寻路 | 阻挡实测 | 岩墙前后 |
| --- | --- | --- | --- |
| F1 | `(4,20)→(7,21)`；练级区到 `(6,8)` | 点击矿柱后停在 `(12,9)` | `(6,23)→(8,23)`，透明恢复为完整墙体 |
| F2 | `(5,20)→(8,23)`；练级区到 `(6,8)` | 停在 `(10,11)` | `(8,23)→(10,23)`，人物持续可见 |
| F3 | `(5,20)→(5,23)`；练级区到 `(6,8)` | 停在 `(11,13)` | `(5,23)→(7,23)`，透明恢复 |
| F4 | `(5,22)→(7,25)`；守护兽到 `(20,8)` | 点击 `(16,12)` 后停在 `(17,11)`；随后地图再次显示实际坐标与目标 | `(7,25)→(9,25)`，透明恢复 |

真实走完 F1→F2→F3→F4→F3→F2→F1。四层守护台在对话打开、关闭、消息区隐藏后均可见，人物未被上边缘裁切。完整操作轮次记录 32,780 个连续绘制帧、零漏画；该专用绘制保活模式不用于性能验收。最后正常释放 Main／音频，隔离目录清理，真实玩家目录摘要不变。

第 14 次工具调用的意图是收起消息，实际打开聊天，随后第 15 次关闭；第 40 次实际隐藏消息。保留原始工具标题，观察摘要按真实结果记录。这些中间操作未伪装成所选的通过动作。

## 同一运行内容的报告

运行指纹始终为 `beastbound-map-runtime-surface-v2:cbef22faa06579f683a8a9778395442b61057f0f0744584f86da44a55cf5cf09`。

- 性能原始回执直接取自 Phase601 最终批次，48/48 样本、36,768 帧，SHA-256 `0ed4050972c3391329c1a83757270bc49915d043aab3ada12f0b02204e606990`。保留实际采集提交 `18ffa702…`，核对其为当前祖先且运行内容相同；不改写成当前 HEAD，不重写 stdout，也不将本轮称为新的性能测量。由当前构建器重新生成报告，原有绝对耗时与配对增量阈值全部保留。
- Phase601 四层片 `64.4s / 1932 frames` 与 F4 地标片 `8.333333s / 250 frames` 的摘要、媒体字节和相同运行指纹再次核对，供后续受委托复审。四层主片 SHA-256 `ca7b41f60035e8753bf2c28e05afc7236ab4decd3c67c125c8bb65d125071a35`。
- 碰撞审计在新隔离进程中执行原有 `map_visual_runtime_check.gd` 的严格预览验证，冻结 catalog、四层 bindings、权威地图与保护格全部匹配。旧入口不接受 QA lane 参数，首次调用被拒且已清理；本机适配器先调用 Main 的实际隔离证明，仅消费自身 lane 参数，再执行未改动的碰撞 CLI 检查和 `run()`。原始日志保留实际 argv，报告说明逻辑检查入口与适配器的区别。失败回执保留，未用正常玩家目录运行检查。

## 独立审计器修复

首次整包审计的 65 项错误都来自独立审计器仍要求 `mobile / metal / macOS Metal`，与 Phase601 已切换的默认后端不一致。两个回归测试先复现：当前构建器生成的 Compatibility 报告被拒；内部自洽的旧 Metal 数据仍被接受。

审计器现明确要求 `gl_compatibility / opengl3 / macOS OpenGL Compatibility`，同时核对原始回执和各组摘要。测试夹具补齐既有前台可绘制及连续 draw-frame 契约；增加混合驱动／方法、不可绘制、渲染循环关闭和缺失绘制拒绝案例。没有接受多个后端的宽松分支，也没有放宽耗时、焦点、帧数、输入、来源或清理条件。

完整独立审计器测试 **49/49 PASS**，Godot 隔离解析 **1/1 PASS**。采集器、游戏运行及服务端的 487 个已冻结源文件均逐字节未变，因此未重复 48 组性能测量或全量 CI。此次仅修改独立审计代码、相应测试、证据和文档。

最终整包审计 **PASS：158 files / 29 JSON / 47 PNG / errors=[]**。`releaseReady=false`，剩余门仅为正式启用、所有者接受和发布证明；不把结构通过解释为批准。仓库索引和手册链接检查、`git diff --check` 均通过。

## 复现与取证位置

```sh
python3 -B tools/record_map_visual_action_captures.py --bundle-id earth_vein_cave_visual_v1 --scratch-only --run-id <unique-run-id> --godot <godot-path>
python3 -B tools/record_map_visual_action_captures.py --bundle-id earth_vein_cave_visual_v1 --replace-pending-evidence --run-id <another-unique-run-id> --godot <godot-path>
python3 .agents/skills/design-beastbound-maps/tests/test_audit_map_bundle.py
python3 -B .agents/skills/design-beastbound-maps/scripts/audit_map_bundle.py client/godot/assets/maps/earth_vein_cave_visual_v1
node tools/run_godot_auto_checks.mjs --parse-only --output-dir .run/godot_auto_checks/phase602-evidence --timeout-ms 120000
git diff --check
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
```

| 内容 | 位置 |
| --- | --- |
| 仓库内正式证据入口 | `client/godot/assets/maps/earth_vein_cave_visual_v1/map-visual-bundle.json` |
| 正式动作采集、事务和回收 | `.run/evidence/map_visual_action_captures/earth_vein_cave_visual_v1/phase602-formal-actions-20260921/` |
| 真实鼠标原始回执、逐次图片、观察和回收 | `.run/phase602-manual-actions/` |
| 原始鼠标转录 SHA-256 | `14417c3195f1e2dff93e882c4ebf90a11feca5e90e15b7b89713cd732a8c6c59` |
| 隔离碰撞适配器及成功回执 | `.run/phase602-collision-owned/`；首次拒绝保留在 `.run/phase602-collision/` |
| 安装、来源、媒体配对及最终核对 | `.run/phase602-working/` |
| 四层与地标原片 | `.run/evidence/earth_vein_cave_visual_v1_owner_review/phase601-cave-visual-20260920T202214Z/` |

之前的 107 项本地候选证据先完整备份到 `.run/phase602-working/before/` 并验证全部摘要，再在原路径更新；没有丢弃历史现场。仓库内 JSONL 只外置图片载荷，保留真实工具输入、输出和图片 SHA-256；完整原始转录仍在本机。`.run/` 下的适配器及安装脚本是本机复验证据，不是克隆仓库自带工具。

## 后续边界

候选仍为 `owner_review_pending / pending / false / false`，`ownerAcceptance=null`。本轮完成画面、输入和正式证据配对，不代表联网通关、正常战斗难度、Windows、200 人容量或老板美术接受。

R1.W024 还需把守护战、途中普通遭遇、出洞返村的完整流程与当前渲染内容配对；Phase592／596 是旧后端的历史证明。本轮随机遭遇关闭，不能替代该项。P2.1a／R1.W024 保持未勾选，完成后进入 R1.W025 受委托复审。
