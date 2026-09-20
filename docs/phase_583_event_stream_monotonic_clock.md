# Phase 583：事件流重连改用真实时间

日期：2026-09-20。继续 R1.W024，排查 Phase 582 原生录制中的 WebSocket 429。已修复并实证一个能造成同类限流的客户端计时错误；原录制缺少服务端拒绝原因，不能据此宣布那三次 429 的完整根因已全部确认。

## 原因与合同

Phase 255 的连接截止 10 秒、等待 `events.ready` 5 秒、稳定连接 30 秒后重置退避，以及 full-jitter 指数退避，都是与真实服务端交互的时间边界。旧 `_poll_server_event_stream(delta)` 却直接累计游戏帧时间。固定帧率录制或加速模拟中，游戏时间可以远快于真实时间，导致提前中止连接、缩短重试等待，进而消耗服务端正常的连接名额和账号升级速率额度。

原 Phase 582 录制的状态记录约经过 **535.161 秒真实时间、1290.133 秒游戏帧时间**。这是排查线索，不足以单独归因三次拒绝。本阶段先增加客户端重连状态和服务端按原因分组的计数，再用独立可控延迟复现该机制。

`ServerEventReconnectModel` 现在集中读取 `Time.get_ticks_usec()`；轮询把这一真实经过时间交给原有计时逻辑。新尝试和失败重试重新建立起点，退出账号重置时钟；注入时钟用于确定性回归，时钟倒退不会重复计时。正常玩法、帧率策略、服务器限流、握手截止、退避上限、协议和玩家界面均沿用原合同。协调器仅更换计时来源，没有新增领域逻辑。

## 可失败的回归

`server_event_clock_check.gd` 接入已有 `--auto-auth-server-client-check`，实际调用协调器轮询。连续传入 120 次 `delta=0.5`，不建立网络连接：

- 旧实现真实耗时 **0.000105 秒**，却扣掉 **60 秒**等待；检查失败。
- 新实现真实耗时 **0.000138 秒**，扣掉约 **0.000135 秒**；检查通过。

另有 **14 项**注入时钟检查，覆盖首帧、相同时间、实际经过时间、倒退及恢复、重试/连接起点、10 秒连接截止、5 秒 ready 截止、30 秒稳定重置和退出账号后的旧时间清除。原有抖动序列、最大等待与游标规则继续通过。

最初一次检查因测试夹具把无类型数组赋给 `Array[Dictionary]` 而失败，已修正；真正的修复前红灯保存在 `.run/godot_auto_checks/phase583-clock-before-v2/`，不把夹具错误当作产品根因。最终定向记录在 `.run/godot_auto_checks/phase583-clock-regression/`。

## 真实 WebSocket 延迟对照

[本机核对摘要](../.run/phase583-delayed-stream/verification-summary.json) 使用随机回环端口、一次性内存后台和真实 Main 协调器，读取真实 QA 会话。只在测试服务适配层给两次 replay 读取各加入 **700ms** 延迟，仍低于服务器既定总握手截止；客户端按每次轮询 0.5 游戏秒加速驱动。这是隔离网络诊断，不是正常时钟性能或原生操作验收。

修复前采用 `b7cec2f68` 的原协调器及重连模型快照，修复后采用当前实现；两者分别使用独立后台和官方隔离客户端目录。

| 同条件 10 秒观察 | 修复前 | 修复后 |
| --- | ---: | ---: |
| 实际轮询次数 / 模拟秒数 | 1451 / 725.5 | 1451 / 725.5 |
| 收到 `events.ready` | 否 | 是 |
| 服务端接受的升级 | 3 | 1 |
| 服务端拒绝的升级 | 46 | 0 |
| 拒绝原因 | 会话连接已满 10；账号升级限流 36 | 无 |
| 最终连接数 | 0 | 0 |

这一对照证明修复了“加速帧时钟 + 正常延迟 → 提前断开与重连限流”的路径，没有放宽任何服务端限制。前后 Main 都正常退出、进程组结束、后台关闭，隔离目录清理及真实玩家目录哈希保护通过。临时会话和旧代码快照只在忽略目录，不提交。

## 诊断与性能

试玩入口的 `states.ndjson` 增加事件流状态、等待阶段、尝试次数和游标；`backend/event-stream.ndjson` 仅在连接/拒绝/心跳等计数变化时写入，并在后台排空后记录最终计数。不记录 token、不增加玩家可见诊断。已有 HTTP 守护战测试同时校验连接出现、关闭后归零及会话脱敏。

原生静止复验还发现 QA 退出协程在等待资源回收时仍让 Main 处理帧，已经主动关闭的事件流因此再连了一次。退出入口现在先停止该 Main 的 `_process`，再关闭连接并等待回收。这只调整测试入口的清理，不改变正常玩家退出行为。最终 `--timeout-seconds 45` 原生检查记录在 `.run/guardian-review/20260920T042222.284704Z/verification-summary.json`：49 次状态采样中，首次连接后的 48 次均 ready；服务端只接受一次连接、拒绝零次、最终连接归零，日志与进程收容通过，真实玩家目录未变。

Headless Main 二层前后各三次静止和移动，交替执行旧/新协调器，其他源码一致。完整脚本区段均值的中位数：静止 **0.029875→0.029625ms**，移动 **0.060375→0.059375ms**。六次移动各有 60 次跨帧点击／120 个输入事件，全部接收、投影错误 0、最终格一致。未见可辨认的世界更新退化；该世界探针没有在线会话，不能代替联网热路径或原生 FPS 结论。联网轮询另由上述真实连接对照和计时回归覆盖。

资料在 `.run/phase583-world-paired/`。早期分批测量的后半与 Node 测试并行，前后条件不一致，保留作诊断、不用于性能结论。Phase 579 的正式四层静止增量 FAIL 仍未解除。

## 验证与剩余工作

```sh
git diff --check
node --check tools/guardian_review_backend.cjs
node --test tools/test/guardian_review_backend.test.cjs
node tools/run_godot_auto_checks.mjs --only=--auto-auth-server-client-check,--auto-server-battle-target-mapping-check,--auto-server-battle-return-check --fail-fast --timeout-ms=180000 --output-dir=.run/godot_auto_checks/phase583-clock-regression
node tools/run_godot_auto_checks.mjs --parse-only --output-dir=.run/godot_auto_checks/phase583-final-qa-parse
python3 tools/play_guardian_review.py --timeout-seconds 45
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
```

Godot 含解析 **4/4**、Node **4/4** 通过。最后调整诊断写入顺序，确保观测失败不会阻止连接排空，对应 HTTP/WS 关闭检查另行通过 **1/1**；QA 退出调整后解析 **1/1** 和上述原生运行通过。未运行不相关的全量 CI。

早期原生静止录制未复现 429；随后原生自动战斗诊断等待绘制时未推进，窗口工具只能定位已有项目管理器，未取得预期游戏窗口。已主动停止并保留失败结果，后台、Main 和 QA 目录均完成清理，不把未开战的运行记作战斗通过，也未关闭用户原有 Godot 进程。

原 Phase 582 录制仍为 FAIL，下一步以当前源码完成双倒地及四层连续返回/出洞，并核对新增拒绝原因记录。正式截图配对、完整原生性能、P2.1a、R1.W024 与所有者美术接受均未关闭；原有 107 项候选修改和 111 项保护文件保持原样。
