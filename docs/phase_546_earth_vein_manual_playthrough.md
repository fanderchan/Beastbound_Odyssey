# Phase 546：洞穴实机往返与进化试炼提示

日期：2026-09-18。范围：老板确认继续后，完成真实鼠标操作的洞穴游玩闭环，修复实测问题，并记录成品差距。

## 已完成的游玩闭环

在原生 1280×720 的真实 `Main.tscn` 中，以 Computer Use 左键操作完成：

1. 火芽村 `(21,6)` → 点击入口 → 岩脉洞穴一层 `(4,20)`。
2. 一层实际行走触发随机遭遇；手动提交人物、宠物攻击，再开启自动战斗，胜利后回到 `(6,13)`，显示经验和掉落。
3. 点击左上小地图，在附近目标中选择上层，连续通过一层 → 二层 → 三层 → 四层。
4. 顶层分别到达岩脉共鸣守卫和岩脉守护兽；打开对话并进入守护战。原生轮验证失败返回，录像轮验证左键逃跑返回，均回到顶层 `(21,8)`，可继续行走。
5. 从小地图选择下层，四层 → 三层 → 二层 → 一层 → 返回火芽村，最终仍为村口 `(21,6)`。

角色只在隔离环境开始时设置一次；路线上没有用测试脚本传送角色，也没有用引擎合成输入冒充 Computer Use。脚本只负责初始夹具、状态读回、截图、性能观察和结束清理。路径按钮本身使用游戏的正常寻路、交互和切图代码。

试玩方法：进入洞穴后点击左上小地图，使用“附近目标”的上层／下层条目逐层探索；顶层两个“守护”目标分别对应地之戒和进化材料试炼。材料试炼的正式规则是至少两名真实玩家，岩脉与风息要求全员 Lv120，暗誓共鸣核心要求全员 Lv140。

## 测试边界

这是 **隔离本地 QA 实机验证**，不是正式服务器通关或多人平衡验收。角色与布伊使用按现有规则构造的 Lv100 夹具，保存和网络会话关闭；没有登录共享服务器、写 MySQL 或改变真实玩家档案。

候选美术预览默认关闭自然遇敌。原生轮仅在一层临时恢复自然遇敌检查，保留已加载的候选画面，之后恢复预览再继续楼梯路线。该模式切换造成一次视野变化，已与玩家路径故障区分。录像轮始终保持同一候选预览模式，守护战前后镜头比例一致。

原生轮记录了胜利、守护战失败；录像轮记录了守护战逃跑。没有宣称单人击败十名守护敌人，也没有验证多人奖励分配、正式服务端结算或完整转生资格链。

## 修复：提示跟随实际开放规则

实机发现三处进化材料交互仍显示“进化系统完成前，这场试炼不会开放”，而 Phase 362 及当前 `pet_evolution_routes.json` 已开放这些试炼。

新增 `scripts/ui/evolution_trial_dialog_presenter.gd`，由 `DialogQuestCoordinator` 在生成对话正文时调用：

- 只处理共享目录中 interaction ID 与 encounter group 同时匹配的材料试炼；普通 NPC／地之戒守护提示保持原样。
- 保留叙事台词，替换冻结地图中的历史关闭提示。
- 从现有目录读取开放状态、最低人数、等级和胜利奖励数量，从背包目录读取物品中文名。
- 以“组队要求”“胜利奖励”分行显示；关闭时显示暂未开放，资料缺失时不显示原始 ID 或未经确认的奖励。

最初尝试直接修正地图 JSON，严格审计正确拒绝了与冻结 map hash 不一致的文件。最终采用上述呈现层修复，三份地图 JSON 已恢复原始字节；没有修改地图拓扑、数值、奖励、协议、资产、冻结证明或发布开关。

这符合既定试炼规则，不增加玩法或准入条件。提示只帮助玩家理解规则，实际挑战仍由服务端的 manual encounter authority 校验。

## 实机证据与视频

| 内容 | 本机目录／文件 |
| --- | --- |
| 原生完整试玩、截图、性能日志 | `.run/earth-playthrough-20260918-v2/` |
| 录像原片及剪辑清单 | `.run/earth-playthrough-20260918-video/` |
| 原速操作回放 | `earth-journey-highlights-1x.mp4`，1280×720、30 FPS、4142 帧、138.067 秒 |
| 原速完整录像 | `earth-journey-full-1x.mp4`，14674 帧、489.133 秒 |
| 真实 Computer Use 回执 | 录像目录下 `computer-use/receipts.json`、`computer-use-final/receipts.json` 及原始截图，共 58 次调用／60 张截图 |
| 最终提示实机复查 | `.run/earth-playthrough-20260918-final-v2/` |

剪辑只删静止等待，保留移动、切图、对话和完整守护战；`edit-decision.json` 保留源帧区间。影片使用 MovieWriter 固定 30 FPS，不加速动作，不作为性能证据；本轮音频为 Dummy，未验收音效。路线影片录于提示最初修复后，最终动态提示及分行格式以末轮实机 `003.png` 和 UI 检查为准，不能把路线影片当成最终代码的精确发布冻结。

回放 SHA-256：`e51ea465681b4a41d047666d4bbe97441431e03ba7fbc2ad4c3e7beae8a30bce`；完整片：`9fa57f2c5b14508bd2db3449e3fd1345f092680f5b3770863f17d6847b7ca8c2`。

当前任务中的 Computer Use 工具调用、返回文本和原始截图直接从任务日志提取，保留 call ID、时间和图片 SHA-256；没有伪造收据或复用以前任务的截图。这些资料证明本次操作，不替代正式的四层五类动作矩阵安装。

官方 QA lane 生命周期记录证明 Godot 子进程退出码 0、进程组关闭和隔离目录清理；真实玩家目录摘要持续为 `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`。前两次临时试玩退出日志有音频资源残留警告，不能称为正式录片资源收口通过；最终复查改用现有 `RuntimeExitCleanup.drain_audio()`，不修改生产音频逻辑。最初脚本路径错误的失败尝试及原生包装器在清理后遇到 Path JSON 序列化错误的日志均保留。

## 验证

```sh
git diff --check
node --test server/node/test/manual-encounter-access.test.js server/node/test/pet-evolution-route-catalog.test.js server/node/test/pet-encounter-authority.test.js server/node/test/pet-encounter-permit-authority.test.js
node tools/run_godot_auto_checks.mjs --only=--auto-rebirth-trial-contract-check,--auto-rebirth-cave-guardian-check,--auto-world-presentation-profile-check --fail-fast --output-dir .run/godot_auto_checks/earth-manual-journey-20260918
node tools/run_godot_auto_checks.mjs --only=--auto-pet-evolution-ui-check,--auto-npc-interaction-check --fail-fast --output-dir .run/godot_auto_checks/earth-trial-dialog-20260918
node tools/run_godot_auto_checks.mjs --only=--auto-pet-evolution-ui-check --fail-fast --output-dir .run/godot_auto_checks/earth-trial-dialog-final-20260918
python3 -B .agents/skills/design-beastbound-maps/scripts/audit_map_bundle.py client/godot/assets/maps/earth_vein_cave_visual_v1
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
```

- 服务端针对性检查 28/28 通过；洞穴／守护／相机及解析 4/4 通过。
- 进化 UI、NPC 交互及解析 3/3 通过；新增提示检查覆盖三个实际地图交互、关闭状态、目录人数／等级／数量变化、错误 group 不覆盖及输入不变。
- 最终分行后进化 UI 和解析 2/2 通过；地图严格结构审计 `158 files / 29 JSON / 47 PNG / errors=[]`。两部视频的 ffprobe 帧数／尺寸校验及完整解码通过，另存 SHA-256 清单。
- 未运行全量本地 CI、真实多人在线闭环或 48 次地图性能矩阵。

原生试玩收集 573 个混合场景样本，`process_total` 中位数 0.318 ms，P95 1.223 ms，最大单秒均值 15.866 ms；其中包含战斗、切图与启动。进程 CPU 快照为 8.5%／8.6%，后者取得时已经到达目标，不能冒称移动专属样本。观察脚本每 0.5 秒写状态文件。这些是诊断数据，不能代替分地图、预热后、重复的 idle/moving 性能验收。

最终提示复查的 118 个原生样本包含静止、真实左键移动、对话打开／关闭；中位数 0.337 ms，P95 0.611 ms。因场景分布不同，不能把两轮差值解释为性能提升。末轮 16 个音频播放器解绑、16 帧／1.5 秒退出排空均通过，日志无资源残留警告；没有遗留试玩进程或 QA lane。

## 成品判断与下一步

路线和交互具备完整闭环，尚未达到成品观感。当前测试形态仍出现圆形占位宠物和大面积空战斗背景，顶层挑战缺少明确的 Boss 主体与动作表现。洞穴四层已有入口、菌缝、晶脉与共鸣台的差别，但地面较平、道具重复明显；带导航／日志面板的顶层镜头还应继续审看地标裁切与遮挡。靠近共鸣台时角色可被台身遮住，移至前方空地后正常出现，后续应改善交互时主体可辨识度。

后续优先做一场完整洞穴守护战的成品表现：确认实际形态资源是否缺失或未接线，补齐敌我主体与战斗背景，再打磨进入战斗、招式、受击和返回反馈，同时继续收口 R1.W024 正式证据。沿既有 Boss 范围推进，不自行改经济、难度或解锁规则。

R1.W024 仍未完成正式动作安装、重复性能和同一精确候选全部证据重冻；R1.W025／最终所有者接受未完成。Earth Vein 保持待审，不生成 owner decision，不提升运行时开关，也不把本轮试玩称为发布。
