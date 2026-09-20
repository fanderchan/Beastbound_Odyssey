# Phase 589：服务器回合连续播放

日期：2026-09-20。继续 R1.W024。修复人物和战宠倒地、队友继续出招时，客户端漏播后续回合并提前返回地图的问题。服务器出招、奖励、死亡和复活规则保持不变。

## 根因与范围

Phase 588 实机中服务器完成 11 回合，主控在第 6 回合后直接结算。旧回放入口在动画忙碌时直接拒绝新回合，同时房间同步把未来回合写进当前 `lastServerEventList`；当前动作结束后据此应用未来血量和关闭房间。

本地 StoneAge 8.0 参考 `gmsv/src/battle/battle.c` 的指令等待阶段跳过已倒下角色，存活队友继续推进。Beastbound 沿用该行为意图，只修复权威事件的显示顺序，没有复制参考实现或为倒地玩家增加确认操作。

- 新增 `ServerBattlePlaybackQueue`，按房间、回合和序号排队、排序、去重，拒绝其他房间及已经播放的旧回合。当前动画不中断。
- 当前回合结束时先应用该回合的权威终态，再继续下一份已收事件。队列排空后才处理结算或恢复指令界面。
- `serverRoom`／`serverBattle` 保留最新权威状态；`lastServerEventList` 仅属于实际正在播放的回合。迟到的 HTTP／WebSocket 快照不能把关闭房间恢复成旧的可出招状态。
- 断线历史中没有重复房间数据的精简回合也可进入队列。进入、离开战斗清空队列，避免串场。

这是有界恢复窗口：最多保留 128 个待播回合。极端暂停导致超过窗口时，保留最近 128 回合并累计跳过计数；不承诺无限离线回放。当前试玩验收要求跳过计数为零，超限不会被记录为完整播放成功。队列仅在收到回合及动画边界处理，不增加世界逐帧扫描。

## 自动检查与性能诊断

旧实现定向检查实际失败，记录只播放 `[1]`；修复后在真实 Main 的跨帧动画中播放 `[1,2,3,4]`，16 项检查通过。覆盖乱序补发、重复回合、未来血量隔离、关闭快照防回退、关闭延迟、跨房间和清理，以及有界积压。

试玩入口记录真实回合开始／动画完成信号，并与服务器每个已结束房间的事件逐项比较。漏播、提前完成、重复、乱序、帧号回退或窗口丢弃均拒绝；没有完成战斗时不能报告完整播放通过。

```sh
git diff --check
python3 -m unittest tools/test/test_play_guardian_review.py tools/test/test_guardian_review_media.py
node tools/run_godot_auto_checks.mjs --only=--auto-server-battle-target-mapping-check,--auto-server-battle-boss-replay-check,--auto-server-battle-reaction-replay-check,--auto-server-battle-status-replay-check --fail-fast --timeout-ms 180000 --output-dir .run/godot_auto_checks/phase589-backlog-final
python3 .run/phase589-world-before/run.py
python3 .run/phase589-world-after/run.py
```

Python **13/13**、Godot 含解析 **5/5**。前后各三组静止／移动 Main 均通过隔离与清理检查；每组移动含 60 次跨帧真实输入、120 个鼠标事件，投影错误为零。`process_total` 三组均值：静止 `0.020000 → 0.020625ms`，移动 `0.035750 → 0.037250ms`。这是 headless 世界路径诊断，不代表原生 FPS 改善或正式地图性能门通过；Phase 579 静止增量 FAIL 仍有效。

证据：`.run/godot_auto_checks/phase589-backlog-red/`、`.run/godot_auto_checks/phase589-backlog-final/`、`.run/phase589-battle-backlog/world-comparison.json`。

## 原生复验

使用 `--downed-owner-check --record --timeout-seconds 600`，未启用自动输入脚本。一名真实 Main 加四个 HTTP 测试队友，真实左键完成地图寻路、挑战、开启游戏内自动战斗及背包核对。运行目录 `.run/guardian-review/20260920T140337.637466Z/`；[独立验证摘要](../.run/phase589-battle-backlog/native/verification-summary.json)。

- **11 回合逐项一致**：实际开始 11 次、完成 11 次，顺序和服务端一致，零重复、零遗漏、零窗口丢弃；250 次战斗采样覆盖全部 1—11 回合。
- **双倒地仍播放**：119 次采样观察到主控人物和战宠均倒地且未击飞，覆盖第 3—11 回合。110 次压缩关闭快照的 `entry` 仅含地图 ID，背景和纹理全部正常；已实际查看导出视频第 7739／8525 帧，分别显示第 7／11 回合。
- 五账号各得地之戒 **+1**、石币 **+186**，各增加一次奖励 revision；实机背包显示地之戒和总计 306 石币。事件流单连接、零拒绝／重试。范围不代表五真人或平衡接受。
- Computer Use **8 次调用／7 张原始图片／零错误**，原始调用 SHA-256 `cd1196a7ed352aa19b0d6538b3f602d446ac0183915716666f7f78a6a18c83e9`。830 项相关源码运行前后哈希一致。
- 11248 个逻辑观察帧零缺画。MP4 **11310 帧／377 秒／1280×720／30 FPS**，严格解码及源时间线通过，SHA-256 `4cd74a5e3e6266ac6323cc940f0f8e8ce1757d2c64a1fe47a3377ad6f8159865`。录片不作为性能证据。

客户端、测试后台、音频及官方隔离目录正常清理，真实玩家数据与 111 项保护文件保持不变。原有 107 项地图候选修改保留，未安装正式素材证据、改变批准状态或放宽性能阈值。

下一步继续 F4→F3→F2→F1→村口的完整路线，再处理正式静止性能增量和当前精确证据配对。R1.W024 与 P2.1a 仍未完成。
