# Phase 590：联网战斗超时保持服务器权威

日期：2026-09-20。继续 R1.W024。修复等待出招超时后客户端自行生成防御回合、重复应用上一回合血量的问题。

## 复现与既有规则

Phase 589 后的完整返程实机 `.run/guardian-review/20260920T141242.767384Z/` 完成十回合守护战并从四层回到三层，但两次普通遭遇等待超时，未到二层、一层或村口。服务器有 15 个已完成回合，客户端却记录 32 个开始／结束边界，而正确数量为 30；严格录像检查拒绝通过。

两个额外结束信号来自 `_submit_battle_timeout_default_commands()`：它没有区分联网与本地战斗，到时生成本地防御并推进一轮，随后重复读取旧 `lastServerEventList`。服务端没有收到相应指令，仍按 99 秒期限关闭房间。客户端模拟时间还可能先于服务器截止时间耗尽。

本项恢复 [Phase 177](phase_177_battle_room_closure.md) 已确立的房间超时契约，没有新增自动防御产品规则，也没有改动服务端战斗、匹配、结算或经济规则。StoneAge 等待指令／已倒地成员的参考意图沿用 [Phase 589](phase_589_ordered_server_battle_playback.md)。

## 修复

- 联网指令倒计时读取权威截止时间；截止后转入现有等待／查询路径，由服务器裁定结束。缺少截止时间时仍使用兼容倒计时，但不得生成本地回合。
- 本地回合启动入口增加服务器权威保护。本地战斗原有超时默认防御行为保持不变。
- 播放协调器只消费自己实际开始的回合，完成后立即清空。空边界不能再次发出完成信号或恢复上一回合血量；进出战斗同时清空队列和当前回合。
- 录像检查允许服务器在第一回合结算前超时关闭房间，此时应有零个播放边界；已产生的权威回合仍须逐项完整对应。

## 测试工具修正

连续路线专用 `--cave-journey` 队伍在监听 HTTP 前设置五个人物各 `10400` 当前／最大 HP，并在回执中披露。其目的是让多场路线验证可持续，不是平衡样本；宠物创建、成长、战斗命令及奖励仍经过正常实现，运行后禁止整档写入。

双倒地测试偶发未观察到宠物倒地，进一步确认原先固定的 32 字节遭遇许可种子并未控制 NPC 直接挑战的 8 字节房间种子。该独立测试现在固定预置角色身份及实际直接挑战种子 `0494e6b2c3959de9`，并断言房间使用回执所披露的种子。该值来自已有成功复现场景，凭据和宠物私有成长仍保留正常随机性；没有修改生产随机源或注入运行时伤害。

旧实机录像中的双倒地事实仍有效，但不能把旧工具的“固定遭遇种子”描述理解为直接挑战可完全复现。

## 验证

```sh
git diff --check
node --test tools/test/guardian_review_backend.test.cjs
python3 -m unittest tools/test/test_play_guardian_review.py tools/test/test_guardian_review_media.py
node tools/run_godot_auto_checks.mjs --only=--auto-server-battle-target-mapping-check,--auto-battle-command-timer-check,--auto-server-battle-boss-replay-check,--auto-server-battle-reaction-replay-check,--auto-server-battle-status-replay-check --fail-fast --timeout-ms 180000 --output-dir .run/godot_auto_checks/phase590-server-timeout-fixed
python3 .run/phase590-world-after/run.py
```

- 空边界、服务器期限分别有旧实现失败记录；修复后 20 项播放／超时断言通过。Godot 含解析 **6/6**，Node HTTP 测试 **4/4**，Python **13/13**。连续路线测试经过两场真实 HTTP 权威战斗，并检查队伍存活、后续指令和房间独立结算。
- 失败证据保存在 `.run/godot_auto_checks/phase590-empty-boundary-red/`、`.run/godot_auto_checks/phase590-server-timeout-red/` 和 `.run/phase590-full-cave-journey/failed-run-summary.json`，没有覆盖为成功。
- 前后各三组 Main 静止／移动诊断，移动每组含 60 次跨帧点击、120 个输入事件，全部接受且零投影错误。`process_total` 均值静止 `0.020625 → 0.023250ms`，移动 `0.037250 → 0.048208ms`。这是 headless 诊断，未证明原生性能改善，也未替代 Phase 579 正式静止增量 FAIL。

## 实机限制与下一步

修复后的原生客户端启动于 `.run/guardian-review/20260920T145019.483288Z/`。窗口可读取，但 Computer Use 两次操作返回 `noWindowsAvailable`；5 次调用只有 2 张可读取截图，没有成功进入战斗或完成返程。本次只证明启动、四层显示及退出清理，不能作为超时或完整路线验收。

830 项相关源码前后哈希一致；客户端、测试后台、音频和隔离目录已清理，真实玩家数据及 111 项保护文件未变。原有 107 项地图候选修改保留。

完整 F4→F3→F2→F1→村口、普通遭遇宠物比例、正式静止性能及当前精确证据配对仍待完成。P2.1a／R1.W024 保持未完成，美术候选状态未改变。
