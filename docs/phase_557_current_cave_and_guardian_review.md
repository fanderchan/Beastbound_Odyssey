# Phase 557：当前洞穴证据与五人守护战鼠标复验

日期：2026-09-19。延续唯一主目录和持续开发目标，不新增玩法、属性、资产开放范围或经济规则。R1.W024 仍未完成：本阶段补齐了当前版本的画面、地图鼠标动作和五人守护战实际操作，原生地图性能仍待有效整批数据。

## 版本与保留

本轮运行内容绑定 `git:7a67abc06e7224f7903a0f11080b345649a45d27+beastbound-map-runtime-surface-v2:e3af2bc097a68127a050d83d55f598db6f21d0a3487e2a041836d8a8d1e4bccb`。所有画面均重新运行取得，没有把 Phase 555 或更早记录改成新版本。

原有 107 项未提交候选证据全部按原字节保存在 `.run/phase557-before/files/`，清单为 `.run/phase557-before/manifest.json`，与 Phase 556 基线逐项 SHA-256 相符。当前动作、碰撞和 Computer Use 文件已更新到本地候选，旧性能文件保留；整包未通过前继续保留工作区状态，不把旧性能 PASS 当作本轮结果提交。

## 当前地图证据

| 检查 | 结果与位置 |
| --- | --- |
| 自动动作原生截图 | `20/20`，四层各自具有 pointer、movement_path、warp、collision、occlusion 的独立 1280×720 PNG 与报告；单 Main／窗口、退出清理通过。目录 `.run/evidence/map_visual_action_captures/earth_vein_cave_visual_v1/phase557-current-actions-20260919/`。 |
| 四层与地标录像 | 原生与 MovieWriter 各 `9/9`，逐项确定性一致；四层 64.4 秒／1932 帧，顶层地标 8.333333 秒／250 帧，1280×720、30 FPS、原速。目录 `.run/evidence/earth_vein_cave_visual_v1_owner_review/phase557-current-review-20260919/`。 |
| 碰撞合同 | 使用 pending catalog preview 的官方 runner 重新生成真实回执，当前构建碰撞报告 PASS；没有修改地图阻挡、出生点或楼梯坐标。 |
| Computer Use | 主路线 59 次调用／58 张原始 JPEG，第一层岩墙补测 4 次／3 张；20 项有效动作均有真实前后图和工具事件节选。动作刷新 `4 maps / 20 actions / 20 unique companion screenshots`。 |

自动截图和审片录制不是人工操作或性能数据。Computer Use 原图按工具返回原字节解码，没有重绘、缩放或合成。每个动作回执保留实际调用、原文输出与图片 SHA-256；前后图片外置为 bundle 文件，中间图片和完整原始工具 JSONL 在忽略目录保留，回执明确说明这一节选方式。

实机检查包括四层点地移动、练级区／守护兽寻路、矿柱阻挡、岩墙后方透明及前方恢复、F1→F2→F3→F4→F3→F2→F1 正常楼梯往返。F4 从 `(9,25)` 寻路到 `(20,8)` 后，守护兽对话开关及消息面板展开／收起均保持人物和交互守护台可见。第一层岩墙补测从 `(6,23)` 到 `(8,23)`，明确观察到透明恢复。

返程额外点击发生在地图切换附近：记录先回到 `firebud_village_gate (21,6)`，随后进入邻近的 `tide_echo_cave (4,20)`。出口配置与实际第一段目的地一致，不能把这次后续点击误报为岩脉出口指错。潮回洞穴仍显示网格占位，未纳入本次岩脉四层通过范围。地图面板任意地面点击未触发目标的尝试也保留，不记为有效动作。

主要原始记录：

- [地图操作索引](../.run/phase557-manual-actions/computer-use-index.json) 与 [观察说明](../.run/phase557-manual-actions/operator-observations.json)。完整原始 JSONL SHA-256：`0128b37cfc22dfcec177d1e2b7acb57a500787d5299ca007ed93485e1794fe24`。
- [第一层岩墙补测](../.run/phase557-f1-occlusion/computer-use-index.json)。原始 JSONL SHA-256：`1ac874592d400a9f6974dccd3f3215fc867687b67dffe62012923349377e28b4`。
- [四层原速片](../.run/evidence/earth_vein_cave_visual_v1_owner_review/phase557-current-review-20260919/four-floor/earth-vein-cave-v1-owner-review-1x.mp4)，SHA-256 `978e9dfa03528a6e045361de3dff06cdae282686002527cb48c2b56bc793afb4`。
- [顶层地标原速片](../.run/evidence/earth_vein_cave_visual_v1_owner_review/phase557-current-review-20260919/landmark/earth-vein-f4-landmarks-1x.mp4)，SHA-256 `efa90008e4e06a9ee416a9a9d9e5d719c129c34d97fa18ed166f35c3e3b9413c`。
- 当前 Computer Use 汇总 SHA-256 `040251efd290729ebf38e9e261b2e69105cdc112d82fc55796c51f4d84f6e65c`，碰撞报告 SHA-256 `46bd687e68daf7c928fe8bd8f89d65bbceed9d02abcf3a6a9bbdee621458ae79`。

## 五人守护战实际操作

使用 `tools/play_guardian_review.py --timeout-seconds 600` 的既有隔离入口，**没有启用 `--autoplay`**。一个真实 Main 由 Computer Use 控制，另外四个一次性队友通过 HTTP 参与；这不是五名真人联机或平衡验收。

23 次真实调用／22 张原图覆盖地图选守护兽、挑战、人物攻击、布伊奇袭冲撞、蓄力回合人物及宠物防御、正常自动战斗、胜利返回地图、背包打开和地之戒详情。第 9 次原想选技能的点击实际撤回了人物指令，第 11 次没有可见效果；第 10 次重新提交攻击，第 12 次才真正打开技能菜单，原始失败尝试没有删去或当作成功。

服务端第一回合确认 `attack` 与 `pet_bui_charge`，第二回合确认 `defend` 与 `pet_defend`，守护兽冲撞受防御系数 `0.45` 影响，实际造成 79 点伤害。共播放 8 个回合事件包，服务端房间在下一回合边界关闭，胜方属于测试队伍；五个账号均由权威档案核对 `revision 102→103`、地之戒 `+1`、石币 `+256`。主控已回到 F4，背包实图显示地之戒 x1。

目录 `.run/guardian-review/20260918T175725.728796Z/`：[操作索引](../.run/guardian-review/20260918T175725.728796Z/computer-use-index.json)、[不含会话凭据的结果汇总](../.run/guardian-review/20260918T175725.728796Z/evidence-summary.json)。原始工具 JSONL SHA-256 为 `b808b023970d62ebf755936a063ddc6befc46f74a05b9ae49633bf8ca842b6b4`，汇总 SHA-256 为 `0df0c40abcac76a1fa396f5984261a8ccb0524d0afb0dfb835855eac15e6c64d`。

本场未声称覆盖主控人物先倒下后宠物继续指令的分支；该分支保留 Phase 549 的独立历史证据。世界里的远端队友仍采用既有简化占位，不把战斗中的正式角色画面推广为远端世界人物已完成。

## 性能启动判定与未通过结果

第一轮 `.run/map-performance/phase557-foreground-20260919/` 启动边界报 focused=true，但第一组 765 个观察帧全部失焦，整批以 `foreground_lost_0` 拒绝。没有安装失败数据。

`map_performance_batch.gd` 现先在空准备窗口等待**连续 1000ms 前台**，最多 30 秒，然后才创建第一个 Main。启动仅请求一次前台，不持续夺回焦点；测试标题明确提示点击准备窗口。采样期间逐帧零失焦要求、180 帧预热、480 帧测量、三次重复、音频及资源回收合同全部保持原样。此改动只涉及 QA 入口，不改变普通玩家或地图运行内容。

第二轮 `.run/map-performance/phase557-stable-foreground-20260919/` 准备阶段记录 `1015ms / mainCount=0`；第一组 765 帧零失焦，第二组 752 帧失焦，以 `foreground_lost_1` 拒绝整批。两个 Main 均释放，不能把第一组通过或启动改进说成整批性能通过，也不能由此排除二层已有开销超标。已向老板询问可持续保持前台的时段；等待期间继续完成其他验证。

当前整包只读审计为 **FAIL**：检查 `158 files / 29 JSON / 47 PNG`，96 项错误均为旧 48 条性能回执的 builder／runner 哈希不匹配。新的地图截图、动作与碰撞没有其他审计错误，但这不是整包 PASS。旧性能原件没有伪造新哈希或重标日期。`ownerReviewStatus=pending / runtimeEnabled=false / releaseApproved=false` 保持不变。

## 验证与收尾

```sh
python3 -B -m unittest discover -s tools/test -p test_map_performance_batch.py
python3 -B -m unittest discover -s tools/test -p test_refresh_map_visual_action_evidence.py
node tools/run_godot_auto_checks.mjs --parse-only
python3 -B .agents/skills/design-beastbound-maps/scripts/audit_map_bundle.py client/godot/assets/maps/earth_vein_cave_visual_v1
```

工具回归分别 `8/8`、`3/3`，官方隔离解析 `1/1`。解析摘要 `.run/godot_auto_checks/2026-09-18T17-52-45-780Z_summary.json`。所有本轮 Godot／临时后端均已结束，官方 QA lane 清理，真实玩家目录 SHA-256 保持 `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`。未访问共享 MySQL，未运行全量 CI、生产导出或容量测试。

下一步仍是有效的四层 48 样本性能、对可复现开销的定位和最终整包精确审计，再交老板接受当前视觉候选。源码和文档的本阶段小提交与尚未整体接受的 107 项地图证据分开；持续开发目标保持进行中。
