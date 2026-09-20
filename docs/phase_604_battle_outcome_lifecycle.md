# Phase 604：连续遇敌的奖励浮层清理与排版

日期：2026-09-21。基线 `de3b3fc559a8b4f9c68146efe0951bc359525164`。修复 R1.W025 预复查发现的旧奖励浮字进入下一场战斗，并处理同一浮层的取消竞态、残留节点和长队列叠字。R1.W025 的完整视觉复审仍未完成。

## 既定行为与根因

Phase603 的真实返村记录 `journey-battle-03.png` 显示，新战斗第 1 回合仍被上一场经验、石币和物品浮字覆盖。1280×720 的隔离 Main 对照再次复现：开战后旧浮层仍显示 5 条奖励。

[Phase393](phase_393_battle_outcome_floating_rewards.md) 已规定成功的服务端 PvE 结算返回世界后播放只读奖励，不额外要求确认。本次查看本机 StoneAge `gmsv/src/battle/battle.c` 的 `BATTLE_GetExpGold`，只参考服务端分配经验的职责；本地参考没有可核实的客户端浮层实现，不据此编造原作排版或取消规则。本次修复依据 Beastbound 既有世界结算契约。

发现并修复五个相关问题：

- Main/PFC 开战时关闭旧奖励和待播队列，保留 outcome ID 去重；已结算的奖励和世界消息记录不受影响。
- 取消后的旧计时器不能把新一轮播放标记为停止，防止后续奖励插队或完成信号重复。
- 同时清理已从可见队列移出、仍在淡出的行；杀掉 Tween 不再遗漏其原本负责释放的节点。
- 每次播放重置标题位置，避免中途取消上浮后标题逐次偏移。
- 标题为五条稳定奖励及一条退出行预留空间；新行从下一行位置同速上移，退出行沿用统一位移，消除标题碰撞和新旧文字重叠。

实现留在 `BattleOutcomeFloatOverlay`，PFC 只增加一行开战清理，原有自动检查只转发到独立的 `BattleOutcomeLifecycleCheck`。保持中文文字、配色、行宽、字号、奖励顺序、淡出时长和鼠标穿透；没有新增确认按钮、玩法规则、服务端写入、协议或地图资源改动。正常世界静止／移动热路径没有增加计算。

## 回归与实机

新增检查先红后绿。初次复现旧计时器干扰、顺序错误、残留退出行、标题偏移和开战未关闭；其余既有权威结算与回放断言通过。实机检查又发现长队列叠字，追加固定 **1280×720** 的实际控件矩形检查；修改前 96 帧有 85 次标题碰撞、37 次行间碰撞，最终均为 **0**。默认 headless 大视口不能代替该分辨率检查。

最终解析、目标映射／权威结果、普通战斗、世界表现检查 **4/4**；其中新模块 **23 项**通过，10 条奖励连续动画采样 **96 帧**。覆盖中途取消、仍在淡出的第六行、队列顺序、去重、真实开战入口、下一次胜利自动结束及档案不变。没有运行全量 CI，也没有修改服务端而重复全服务端测试。

原生 Godot 4.7 Compatibility、正常时钟、真实 `Main.tscn`、1280×720、Dummy 音频，使用官方隔离 QA lane。前后使用同一离线呈现夹具和脚本：先世界奖励，再进入下一场战斗，再返回世界播放另一份奖励。最终新战斗中浮层不可见、无活动队列、0 行；重复奖励被拒绝，下一次奖励正常完成并自动隐藏。截图已实际查看：

- [修改前新战斗](../.run/phase604-native-before/next-battle.png) 与 [最终新战斗](../.run/phase604-native-final/next-battle.png)。
- [最终下一次奖励](../.run/phase604-native-final/next-rewards.png) 与 [结束后世界](../.run/phase604-native-final/world-settled.png)。

这是 UI 生命周期对照，夹具未启用候选战场／野宠美术，也没有启动后端或伪造服务端发奖；图片里的灰底和占位野宠不能用作正式战场验收。Computer Use 仅观察原生窗口，移动由跨帧测试输入完成，不是人工通关。

## 性能与清理

修改前、最终修改后的静止、移动、跨帧连点、商店选择和属性面板性能套件均为 **5/5**。headless `process_total` 稳态中位数／p95（ms）如下；跨帧连点仅两个汇总样本，不据此估计尾部延迟分布。

| 场景 | 修改前 | 最终版本 |
| --- | --- | --- |
| 静止 | 0.483 / 0.542 | 0.491 / 0.561 |
| 移动 | 0.491 / 0.575 | 0.527 / 0.552 |
| 跨帧连点 | 0.539 / 0.778 | 0.547 / 0.792 |

前后原生每轮各发送 12 次点击／24 个跨帧输入事件，接受数均为 12，移动约 `484.72` 世界单位；静止、移动均零失焦／不可绘制帧。原生 `process_total` 中位数为静止 `0.282 → 0.393ms`、移动 `0.286 → 0.377ms`，每段仅 5～6 个汇总样本，不能宣称性能提升或据此估算尾部延迟。它与 headless 套件不是同一口径，也不替代正式地图性能矩阵或整进程 CPU／容量验证。

原生源文件在各次运行期间未变，最终另记录浮层与 PFC 精确文件 SHA-256。档案只读，所有测试进程、音频和预取资源按原有清理流程释放；QA lane 清理、真实玩家资料摘要保持 `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`。未启动或修改真实 MySQL。

保留全部失败与中间结果：最初性能输出目录被官方 runner 拒绝后改用其规定的目录；首次原生运行及清理成功，但本地摘要写入遇到 Path 序列化错误，原日志、生命周期回执和截图完整保留，后续摘要写入已修正；没有冒充该次包装脚本零错误退出。

## 复跑入口与证据边界

```sh
node tools/run_godot_auto_checks.mjs --only=--auto-server-battle-target-mapping-check,--auto-battle-check,--auto-world-presentation-profile-check --fail-fast --timeout-ms 180000 --output-dir .run/godot_auto_checks/phase604-final
node tools/run_godot_auto_checks.mjs --performance-suite --timeout-ms 180000 --output-dir .run/godot_auto_checks/phase604-final-performance
python3 .run/phase604-working/native.py phase604-native-final
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
git diff --check
```

复跑须更换唯一输出目录，不能覆盖上述原件。完整本机证据入口为 [验证摘要](../.run/phase604-working/verification-summary.json) 与 [文件摘要清单](../.run/phase604-working/artifact-sha256.json)；`.run/` 不提交为产品源码。

开战清理位于 PFC，因此地图运行指纹变为 `beastbound-map-runtime-surface-v2:7326a8502c72b717524f3e4bee04aa6cbae5b473aa53d639667a8ea9603e0dac`。Phase601～603 的 `cbef22fa…` 原件保持历史身份，不能重标为当前版本；本轮没有重跑 48 组正式矩阵或完整五人返村。R1.W024 的历史收口不重写，R1.W025 在剩余视觉问题审完后仍需按新指纹重新冻结成组证据。

地图候选继续 `owner_review_pending / pending / false / false`，本轮没有美术接受、promotion 或正式发布。
