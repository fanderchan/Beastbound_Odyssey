# Phase 605：顶层双共鸣台的交互名称

日期：2026-09-21。基线 `e8e9aaea9e64c6dae47283fb27cda1bbb9e21f3e`。继续 R1.W025 受委托视觉复审，修复岩脉顶层两座共鸣台均显示“守护”、靠近前无法分辨的问题。

## 现象与实现

已查看 Phase602 四层的全部 20 张动作静帧及 Phase601 顶层地标原图。入口人物比例一致，前景遮挡时人物仍可辨认；二、三层分别用菌簇、晶簇区别。静帧不能代替完整移动、过图和战斗衔接的原速片审看，R1.W025 不提前完成。

顶层截图中两座台的标记均为“守护”。本次在当前源码的原生 1280×720 `Main.tscn` 再次复现；实际左键点击分别到达 `(20,8)`、`(25,12)` 并打开“岩脉守护兽”“岩脉共鸣守卫”对话，说明目标没有串错，是 `facilityType=guardian` 共用的默认短标签丢失了身份。

本机 StoneAge 参考 `gmsv/src/char/char_base.c` 将角色名称与 NPC 参数分开存储；本次只参考身份与功能分离的职责，未找到可核实的原作同类双台排版，不据此编造原作 UI。Beastbound 已有 `name`、`facilityType` 和 `facilityLabel` 契约：只为这两条交互补显式 `facilityLabel`，直接使用既有名称，不新增命名规则或显示组件。

- `earth_vein_guardian_npc` 显示“岩脉守护兽”。
- `earth_vein_evolution_lineage_npc` 显示“岩脉共鸣守卫”。

现有标记按字数计算宽度；实测字宽／标签宽分别为 `70/108`、`84/126` 世界像素，最终截图无裁字。名称与对话一致，代价是两条标记稍宽；没有增加图标、说明面板或确认步骤。

地图 JSON 去掉本次新增的两个字段后与基线解析结果完全相同。坐标、碰撞、路线、遭遇、奖励、试炼开放条件及服务器协议均未改；不修改 NPC 形象、宠物或素材，不调用后端写入。

## 验证

在已有 `GuardianBattlePresentationCheck` 扩展双台身份断言，旧数据明确失败于两条重复标签；修复后客户端解析、洞穴守护、地图视觉合同、世界比例检查 **4/4**。服务端遭遇权威与手动遭遇访问测试 **17/17**。没有运行全量 CI。

前后原生使用同一隔离脚本、正常时钟、Compatibility、Dummy 音频。每轮 12 次跨帧移动点击全部接受，移动 `484.72` 世界单位；另两次跨帧左键分别打开正确对话，标题与目标 ID 一致。没有点击挑战按钮，不将此 UI 检查写成联网战斗通关。Computer Use 置前并观察窗口，游戏内点击由跨帧测试事件产生。

- [修改前双台](../.run/phase605-native-before/dual-landmarks.png)、[修改后双台](../.run/phase605-native-after/dual-landmarks.png) 已实际查看。
- [守护兽对话](../.run/phase605-native-after/earth_vein_guardian_npc.png)、[共鸣守卫对话](../.run/phase605-native-after/earth_vein_evolution_lineage_npc.png) 保留各自点击结果。
- [前后比较](../.run/phase605-working/native-comparison.json) 与 [权威数据未变检查](../.run/phase605-working/authority-preserved.json) 保留结构化证据。

初次短测静止中位数 `0.188→0.432ms`、移动 `0.280→0.455ms`，每段仅 6 个汇总样本，不能据此确定回归。追加同一 Main 进程、同一地点的新旧标签 ABBA 对照，仅在 QA 内存中的地图副本切换显示文字，每条件两次静止／移动，结果如下。

| 条件 | 静止 process_total 中位数 | 移动 process_total 中位数 | 静止／移动进程 CPU 中位数 |
| --- | --- | --- | --- |
| 旧“守护”标签 | 0.413 ms，11 个样本 | 0.599 ms，11 个样本 | 11.0% / 17.45% |
| 两条完整名称 | 0.409 ms，12 个样本 | 0.624 ms，12 个样本 | 12.1% / 17.4% |

新旧条件开销接近，没有足以归因于标签的稳定差异，不声称性能提升。整进程 CPU 包含绘制、引擎和测试控制器，不等于脚本 `process_total`；当前计时夹具中的静止 CPU 高于正常运行的目标，不能以子毫秒脚本数据宣称整进程达标。此对照只隔离名称改变的影响，不替代正式地图性能矩阵、无探针日常 CPU 或容量验证。[原始样本及 CPU 对照](../.run/phase605-working/controlled-comparison.json) 保留全部四段，四段各 12 次跨帧点击均接受，零失焦／不可绘制帧。

所有运行均由官方 QA lane 管理，源码在每次运行期间未变、玩家档案不变、音频与 Main 释放、所属进程和 QA lane 清理。未启动后端或操作真实 MySQL。首次定向命令误写不存在的 `--auto-world-presentation-check`，runner 在启动前拒绝；更正为已注册的 `--auto-world-presentation-profile-check` 后通过，不改门槛。

## 合同与证据状态

修改 map JSON 前保存原 manifest、catalog、collision 报告和原日志到 `.run/phase605-working/bundle-before/`，并记录 SHA-256。使用隔离 Main 身份验证包装调用现有 `MapVisualRuntimeCheck`，只重新生成 Earth Vein catalog；随后严格校验当前路径／地图／碰撞合同，生产构建器从真实日志更新 collision 报告，未手写 PASS。

新运行指纹为 `beastbound-map-runtime-surface-v2:d4493cf00321ccbb60c9f261c051963b068ef34ac4883df42a21cbefd30adb3a`。本轮没有覆盖旧动作／性能／整段录片。严格离线 bundle 审计为 **FAIL / releaseReady=false**：158 个文件、29 个 JSON、47 个 PNG 中，20 份旧动作报告各有运行指纹、捕获面内容、摘要、授权绑定四项过期，共 80 项；这与 Phase604 后待统一重冻的边界一致。当前 catalog／collision 已更新，不能把其通过说成整套候选通过。

靠近共鸣守卫的前后对话截图还显示既有标记压住人物上半身；旧短标签也会遮挡，扩大名称后仍存在。它是下一项具体返工，不能因文字不裁切就认定人物与标记构图全部通过。

候选保持 `owner_review_pending / pending / false / false`，未生成所有者接受或发布。下一步先处理交互标记遮挡人物，再继续完整影片及路线中段的视觉复审，按最终源码统一重冻；本阶段仅关闭双台显示身份问题。

## 复跑入口

```sh
node tools/run_godot_auto_checks.mjs --only=--auto-rebirth-cave-guardian-check,--auto-map-visual-runtime-check,--auto-world-presentation-profile-check --fail-fast --timeout-ms 180000 --output-dir .run/godot_auto_checks/phase605-final
node --test server/node/test/pet-encounter-authority.test.js server/node/test/manual-encounter-access.test.js
python3 .run/phase605-working/native.py phase605-native-after
python3 .run/phase605-working/perf.py phase605-native-controlled
python3 .agents/skills/design-beastbound-maps/scripts/audit_map_bundle.py client/godot/assets/maps/earth_vein_cave_visual_v1/map-visual-bundle.json
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
git diff --check
```

复跑须另取唯一输出目录；`.run/` 原件不提交为产品源码。汇总入口为 [验证清单](../.run/phase605-working/verification-summary.json) 与 [证据 SHA-256 清单](../.run/phase605-working/artifact-sha256.json)。
