# Phase 608：洞穴当前画面、鼠标操作与性能证据冻结

日期：2026-09-21。采集基线 `c704075a06268a73168db920a5fbd909c27eafc2`，运行指纹 `beastbound-map-runtime-surface-v2:e9d93013ecd418761ee177751fc727bd109c3ced8d7b81f36e5c52fc2f1a74c8`。继续 R1.W025。

Phase604～607 的修复后，旧动作报告已无法代表当前客户端。本阶段重新采集并安装四层 20 组正式画面、20 项真实鼠标动作、严格碰撞报告和 48 组原生性能样本。严格 bundle 审计恢复为 **PASS，errors=[]**。没有修改游戏运行代码、地图布局、素材原件、人物比例、玩法或协议；候选仍未批准或启用。

## 画面与真实鼠标操作

正式采集使用一个持续 Main 窗口，一次完成 20 对 `1280×720 PNG / capture report`；每层的点地、寻路、换层、碰撞和遮挡各有独立配套画面，20 张像素哈希互不相同。所有正式 PNG 已逐张查看，人物比例与入口表现保持一致，未出现网格回退或主控人物被 HUD 挡住。外围物件仍可能触及屏幕边缘或 HUD，地面纹理重复、细节偏稀依然是观感限制。

真实 Computer Use 另使用离线 Lv100 内存角色、真实 Main、候选预览，关闭随机遭遇与保存。第一次由一层走到四层，按用户“暂停，我先要去吃饭了”立即停止并清理；恢复后新窗口从四层默认入口开始，实际鼠标走到矿柱并逐层返回一层。**两次独立会话，不声称一次无中断的完整试玩。**

两次合计 **62 次工具调用、60 张 640×392 原始窗口图片、零工具错误**。原图逐字节保存，不放大冒充原生截图。每份动作回执包含对应会话的源码身份、夹具哈希、原始转录哈希、实际输入调用和前后原图引用；正式 1280×720 配套截图来自独立采集，不冒充同一点击瞬间。

| 楼层 | 点击与寻路 | 矿柱边缘 | 高岩墙前后 |
| --- | --- | --- | --- |
| F1 | `(4,20)→(7,21)`；练级区到 `(6,8)` | 停在 `(12,9)` | `(7,21)→(10,23)`，透明恢复 |
| F2 | `(5,20)→(8,23)`；练级区到 `(6,8)` | 停在 `(10,11)` | `(8,23)→(10,23)`，人物可见 |
| F3 | `(5,20)→(5,23)`；练级区到 `(6,8)` | 停在 `(11,13)` | `(5,23)→(7,23)`，透明恢复 |
| F4 | `(5,22)→(7,25)`；守护兽到 `(20,8)` | 续验从 `(16,9)` 点击基座后停在可走格 `(15,11)`，未进入邻近阻挡格 | `(7,25)→(9,25)`，人物可见 |

首轮同时直接点击两座共鸣台，分别打开“岩脉守护兽”和“岩脉共鸣守卫”对话，名称与人物没有重叠。续验完成 F4→F3→F2→F1，三处返回落点均为 `(21,7)`。这是无战斗地图操作，不替代联机守护战与普通遭遇返村。

原始记录保留未成功的中间点击：首轮第 4 次没有移动，第 7 次点了非操作区域条目，第 40 次没有从地图图面导航；续验第 7 次点击位于小地图区域，没有移动。F4 正式碰撞使用续验第 9～10 次的画面和输入；第 11 次地图页显示实际位置 `(15,11)`、目标“无”，没有据此编造请求格坐标。

两次绘制观察分别为 46,011 与 29,725 帧，缺失绘制均为 0；专用保活分别补绘 566 与 937 次，因此这些记录不用于前台性能或 FPS 结论。两次 Main／音频正常释放，QA lane 清理、真实玩家目录指纹不变。

## 当前原生性能与碰撞

新性能批次包含 `4 层 × 网格基线/美术候选 × 静止/移动 × 3 次重复 = 48 组`，一个原生窗口完成。每组先预热 180 帧，再按既有合同采样 480 帧，移动输入跨帧发送。36,768 个焦点／绘制观察帧中，失焦与不可绘制均为 0。全部绝对耗时、汇总增量和逐次配对增量门槛通过，未改阈值。

| 候选地图 | 静止处理区间均值的中位数 | 移动处理区间均值的中位数 |
| --- | --- | --- |
| F1 | 0.160 ms | 0.159 ms |
| F2 | 0.127 ms | 0.155 ms |
| F3 | 0.169 ms | 0.190 ms |
| F4 | 0.137 ms | 0.200 ms |

上表使用 `processScopeTotalMs`，表示 QA 前后优先级边界内的 Node 处理区间；不等于整进程 CPU、显示帧率或 200 人容量。对照是同版本网格与美术候选，不是 Phase607 修改前后收益。原始回执 SHA-256：`419466682676dc9a319dccd23ce1c5ff8a5b560fb14f05ca947cadedc9ab19d1`。

首次性能启动遇到 Mac 锁屏，未开始任何样本，失败原件保留。解锁后使用新的 run ID 完成上述 48 组；没有把锁屏等待或保活画面纳入性能结果。

严格碰撞检查通过官方 QA lane 的本机适配器调用未修改的 `map_visual_runtime_check.gd`。四层地图、绑定、阻挡格、出生点、楼梯、交互接近点和遭遇区域的八类合同通过，实际 argv、适配器哈希与原始日志均保留。正式 Computer Use 汇总的渲染描述同时纠正为实际的 `macOS OpenGL Compatibility`，不沿用旧报告的 Metal 标题。

## 保存、验证与剩余工作

原候选 176 个文件先完整备份。正式截图事务仅替换 40 个画面／报告路径；之后其余 26,793 个原跟踪文件逐字节核对无变化，再安装 66 个配对报告、鼠标原图／回执和清单文件。运行指纹保持不变，历史 Phase601～603、Phase607 影片和失败记录不改标。

暂存目录中的首次审计只因不在 Godot 项目内、无法定位所属 catalog 而失败；原位安装后严格审计 **158 files / 29 JSON / 47 PNG / errors=[]**。隔离 Godot 解析 **1/1 PASS**；`git diff --check`、索引刷新和指南链接检查通过。未改测试器或运行代码，因此没有重复无关服务端套件或全量 CI。

候选保持 `owner_review_pending / pending / releaseApproved=false / runtimeEnabled=false`，`releaseReady=false`，所有者接受为空。R1.W025、P2.1a 不勾选。接着补当前精确版本的四层／F4 地标影片及守护战、普通遭遇全胜返村；Phase607 的四胜一败仍保留为失败恢复证据，不将本阶段地图验证当作完整战斗通过。

```sh
python3 -B tools/run_map_visual_performance_evidence.py --bundle-id earth_vein_cave_visual_v1 --build-identity '<current-build-identity>' --godot '<godot-path>' --run-id '<unique-run-id>' --scratch-only
python3 -B tools/record_map_visual_action_captures.py --bundle-id earth_vein_cave_visual_v1 --replace-pending-evidence --godot '<godot-path>' --run-id '<unique-run-id>'
python3 -B .agents/skills/design-beastbound-maps/scripts/audit_map_bundle.py client/godot/assets/maps/earth_vein_cave_visual_v1
node tools/run_godot_auto_checks.mjs --parse-only --output-dir .run/godot_auto_checks/phase608-evidence --timeout-ms 120000
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
git diff --check
```

性能原始采集结束后仍需运行证据构建器判定固定门槛；自动截图不能代替 Computer Use。复跑使用新目录，避免覆盖原记录。

- [正式清单](../client/godot/assets/maps/earth_vein_cave_visual_v1/map-visual-bundle.json)、[鼠标报告](../client/godot/assets/maps/earth_vein_cave_visual_v1/evidence/computer-use-review.json)、[性能报告](../client/godot/assets/maps/earth_vein_cave_visual_v1/evidence/performance-report.json)。
- 本机证据：`.run/phase608-working/`、`.run/phase608-manual-actions/`、`.run/phase608-manual-resume/`、`.run/map-performance/phase608-resumed-matrix-20260921T042157Z/`。
- 正式截图事务：`.run/evidence/map_visual_action_captures/earth_vein_cave_visual_v1/phase608-current-actions-20260921/`；所有本机辅助脚本与 QA 状态保持忽略，不作为产品源文件提交。
