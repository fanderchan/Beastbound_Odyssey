# Phase 582：修复战斗状态响应被丢弃

日期：2026-09-20。继续 R1.W024，优先修复 Phase 581 实机暴露的“服务器第 13 回合已战败，客户端仍停在第 8 回合等待”。本次修复已通过真实响应归属回归、原始故障数据回放及联网双倒地流程；完整原生录制检查仍因 WebSocket 429 失败，下一步处理这一独立问题。

## 根因与行为

`ServerBattleCoordinator._begin_state_request()` 把同一份 Dictionary 同时保存在协调器和异步回调中。完成请求时，旧 `_finish_state_request()` 先执行 `state_request_owner.clear()`，也清空了回调持有的 `owner`，随后读取 generation、token 校验必然失败。因此 HTTP 请求可以全部成功，客户端却丢弃有效状态。

人物和战宠失去行动资格后，不再有自己的指令响应推动状态，这个缺口便表现为一直等待。中断恢复的 `_finish_interruption_recovery()` 存在相同的共享字典问题。

两处完成函数改为给协调器赋新空字典，保留回调快照供校验。旧请求不能释放新请求的占用标记；换账号、退出登录、旧 generation、重复响应和更换恢复票据仍被拒绝。主动失效、合并后续恢复请求、协议版本、服务器结算与玩家文案均沿用原合同。延续 Phase 548 的服务器权威结束规则，没有用本地生命值强行结束战斗。

原 `request_owner_self_check()` 只比较两份手工构造的字典，未调用真实完成函数，无法发现此错误。现由独立 `server_battle_request_owner_check.gd` 驱动真实协调器的 begin／finish／invalidate／queue 路径，接入既有 `--auto-auth-server-client-check`。**24 项**覆盖有效响应、快照保留、重复／过期响应、登录与 token 变化、票据变化、两个请求通道独立性，以及跨帧仅执行一次的排队恢复。新增检查在旧代码上真实失败，修复后全部通过。

## 原故障回放

使用 Phase 581 留存的二层第 8 回合房间和服务器第 13 回合关闭房间，在真实 Main 的子类中异步返回相同 HTTP 数据。此处是隔离响应回放，不冒充实机网络：

- 旧实现：3600 帧内成功返回 `/battle/state` 60 次，仍为第 8 回合 `server_waiting`。
- 新实现：一次状态响应进入最后回合播放，在第 408 帧结束战斗，返回 `firebud_village_gate`。

原始资料位于 `.run/phase582-replay/`，修复后资料位于 `.run/phase582-replay-after/`。故障快照含临时会话，仅保存在忽略目录。一次重复使用日志路径被收容工具在启动前拒绝，已核对并清理隔离目录，随后改用新目录；不覆盖旧失败资料。

## 可重复的联网回归入口

```sh
python3 tools/play_guardian_review.py --downed-owner-check --record
```

它仍使用一个真实 `Main.tscn`、四个 HTTP 测试队友、随机回环端口和一次性内存后台。仅在监听前配置测试主控人物为当前生命 1／最大生命 10400、主控战宠当前生命 1；其他人物保持原 1040 生命，队友战宠保持满血。高生命上限使测试人物普通倒地，减少过量伤害击飞导致的提前离场。遭遇种子固定为 32 字节 `0x58`；令牌和战斗反应随机源继续使用正常实现。服务器继续决定目标、伤害、回合、胜负及奖励，没有写入预设结算。这不是正常成长数值或难度验收。

入口与普通连续试玩、自动走查分别使用，互斥 `--cave-journey`／`--autoplay`。后台元数据明确记录初始／最大生命与种子来源；真实 HTTP 测试要求实际出现“主控两名 actor 都倒下，其他人物仍存活”，并继续出现更晚的 ready 回合，不能只凭初始配置判通过。QA 状态文件新增主控 actor 生命观察，正常玩家界面没有新增诊断字段。

## 原生结果与未通过项

最终同源码运行：`.run/guardian-review/20260920T014532.990180Z/`，观察归档位于 [本机核对摘要](../.run/phase582-downed-native-v4/verification-summary.json)。基于 `0f87bf1e5ff3d24196a6f54c3ff65a60512ab25e` 加本阶段变更，前后逐文件源码哈希一致。

首场因窗口定位失败未提交指令，服务器按原规则超时，客户端正常显示结果；关闭结果后在同一进程重新挑战。第二场真实鼠标选择挑战、开启游戏内自动战斗。服务器记录主控战宠第 3 回合已倒下，人物第 6 回合已倒下，此后双方生命均为 0，队友继续至第 13 回合胜利结算。

按第二个房间的服务器开始时间隔离观察，Main 留下 **28 条双倒地状态**：第 5 回合播放结束后进入第 6 回合等待，随后收到第 11／12 回合状态，最终退出战斗并回到四层。五账号各获地之戒 `+1`；主控 revision `103→104`，其他四账号各 `102→103`。当前画面显示胜利和地之戒到账；原生背包点击未完成，不能记作背包人工验收。

**整场 native runner 为 FAIL**：日志出现三次 WebSocket 升级握手 `429` 及相应无效响应头错误，客户端依靠 HTTP 状态轮询仍完成上述结算。未放宽错误检查或改写通过回执。下一步定位事件流限流／重连原因，再取得无错误的完整联网路线。实机同步分支走通与整场无错误验收是两个不同结论。

最终 Computer Use 原始记录为 **13 次调用、11 张图片、2 次工具错误和 1 次界面变化保护拒绝**，原始记录 SHA-256 `1a6f7ed7f0365137cc36762391ee72cf19ad814a1892f15686f90efd447f3e8a`。前面的自然随机尝试分别未让战宠倒下、停在对话超时、或人物击飞提前结束，均保留为非目标分支资料，没有替代最终第二房间的证据。

失败运行的 AVI 另作诊断转码，未改写失败状态。源 AVI 与 MP4 均为 **1280×720、30 FPS、38782 帧／1292.733333 秒**，完整解码通过；MP4 SHA-256 `b32e2a3fa1c8f11d68ef538241c85b683889b7df56843d7cc9cb84372e8cecce`。它不是正式美术证据或正常时钟性能验收。

Godot 正常退出 0，进程及进程组已收容，后台正常停止；官方目录状态为 `cleaned_after_trusted_product_failure`，真实玩家数据哈希不变，QA 目录已不存在。原有 **107 项候选修改、111 项保护文件**逐字节保留。

## 定向检查与性能

```sh
git diff --check
node --check tools/guardian_review_backend.cjs
node --test tools/test/guardian_review_backend.test.cjs
python3 -m unittest tools/test/test_play_guardian_review.py
node tools/run_godot_auto_checks.mjs --only=--auto-auth-server-client-check,--auto-server-battle-target-mapping-check,--auto-server-battle-return-check,--auto-server-battle-boss-replay-check,--auto-battle-knockaway-result-check,--auto-battle-visual-timing-check --fail-fast --timeout-ms=180000 --output-dir=.run/godot_auto_checks/phase582-battle-regression
node tools/run_godot_auto_checks.mjs --parse-only --output-dir=.run/godot_auto_checks/phase582-final-qa-parse
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
```

Node **4/4**、Python **3/3**、Godot 含解析 **7/7**；最后的 QA 观察字段修改再通过独立解析 **1/1**。未运行不相关的全量 CI。

真实 Main 的 headless 前后静止／移动各三次，预热 180 帧、采样 480 帧；每次移动均有 60 次跨帧点击／120 事件，接收 60 次、投影错误 0、最终位置正确。完整脚本区段均值的中位数：静止 **0.027500→0.027750ms**，移动 **0.056625→0.057500ms**，未见本次低频回调修改造成可辨认退化。资料在 `.run/phase582-world-before/`、`.run/phase582-world-after/`，不推广为原生绘制／CPU 改善。

Phase 579 四层正式性能矩阵的静止增量 FAIL 仍有效。R1.W024、P2.1a、当前精确证据配对、完整一层／出洞路线和所有者美术接受继续待办。
