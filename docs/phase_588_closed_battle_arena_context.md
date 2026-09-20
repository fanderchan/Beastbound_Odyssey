# Phase 588：结算快照保留战场位置

日期：2026-09-20。继续 R1.W024。修复服务器已结算、客户端仍播放动作时洞穴背景变为灰底的问题。没有改动地图或宠物素材、比例、奖励、回合规则及候选发布状态。

## 根因与修复

Phase 587 旧录像的第 9 回合中，`13153～13329` 帧有连续 12 次 `arenaEvidence={}`，首次丢失比服务端 `battle.room_closed` 晚约 83ms。原先只查看该回合前两次采样得出的“素材信息一直存在”已在原阶段文档更正。

已结束房间会由 `compactBattleRoomRecovery()` 压缩保存。原实现将 `entry` 整体置空，事件投影、断线补发和 `/battle/state` 查询因而可能向仍播放动作的 Main 发送 `entry=null`。战场选择依赖权威的 `room.entry.mapId`，因此切到灰底。

现在压缩快照仅保留 `entry: {mapId}`；入场位置、参与者快照和种子仍清除，短期恢复的数量及过期上限保持。现有字段恢复必要信息，不升级协议、不增加每帧计算，也不依赖客户端猜测当前位置。

试玩工具同时记录已准备纹理是否存在，并拒绝任何已观察战斗采样中的背景或纹理丢失。无战斗的人工试玩明确为 `not_observed`。这是采样检查，实际画面仍需查看。

## 回归与原生画面

```sh
node --test --test-name-pattern='closed battle rooms' server/node/test/runtime-hot-collections-integration.test.js
node --check server/node/src/auth-service.js
node --test server/node/test/runtime-hot-collections-integration.test.js server/node/test/runtime-battle-recovery.test.js tools/test/guardian_review_backend.test.cjs
python3 -B -m unittest tools/test/test_guardian_review_media.py tools/test/test_play_guardian_review.py
node tools/run_godot_auto_checks.mjs --only=--auto-server-battle-target-mapping-check,--auto-server-battle-boss-replay-check,--auto-rebirth-cave-guardian-check --fail-fast --output-dir=.run/godot_auto_checks/phase588-arena-recovery --timeout-ms=180000
```

旧实现的定向断言真实失败；修复后 Node **13/13**、Python **12/12**、Godot 含解析 **4/4**。覆盖两个参与者的事件投影及冷补发、五账号的关闭房间 HTTP 回读、恢复条数／过期边界及缺背景拒绝。原始结果见 [.run/phase588-arena-recovery/](../.run/phase588-arena-recovery/)。

最新原生鼠标复验采用 `--downed-owner-check --record --timeout-seconds 600`，没有使用自动输入脚本。运行目录 `.run/guardian-review/20260920T133907.474681Z/`，[独立核对摘要](../.run/phase588-arena-recovery/native-resumed/verification-summary.json)。

- 真实左键打开地图、选择守护兽、挑战、开启游戏内自动战斗，返回后打开背包：**8 次 Computer Use 调用／7 张原始图片／零错误**，原始调用 SHA-256 `aa229e5fec9535cd886b1d3256e6261303b3c57a4db36696fc352ffbd658ea99`。
- 189 次战斗采样中背景及纹理全部保持，14 次观察到主控人物和战宠均倒地且未击飞。关键的 8 次压缩关闭快照采样只含 `entry.mapId`，第 `6545` 与 `6657` 帧已从验证通过的 MP4 提取查看，洞穴背景保持可见。
- 服务端结算 11 回合胜利，五账号各得地之戒 `+1`、石币 `+237`，各增加一次奖励 revision；主控背包实机核对。一次事件连接、零拒绝／重试，9152 个逻辑观察帧零缺画。
- 827 项相关源码运行前后哈希一致。MP4 **9214 帧／307.133333 秒／1280×720／30 FPS**，严格解码和源时间线通过，SHA-256 `8c244f7e3be196e4746fdee5c950e8dad23cba942667d9e3d670a5d6613ac492`。录片不作为性能证据。

仍保留此前两次失败：鼠标尝试因两次 `noWindowsAvailable` 未进入战斗；自动输入首次停在挑战按钮，原样复跑后才通过。后一次自动输入的 223 次战斗采样背景稳定，但未观察到压缩关闭快照，因此最终以本次真实鼠标复验补足该路径。

## 后续边界

本次原生复验还观察到：服务器已经完成 11 回合，主控却在第 6 回合动画后直接返回地图。这不影响奖励到账或本次背景修复结论，但不能称为完整逐回合播放；下一步优先检查双倒地后的回合追赶，再继续 F4→F3→F2→F1→村口完整路线。

测试客户端、内存后台及官方 QA 目录均正常清理，真实玩家数据和 111 项保护文件不变，原有 107 项地图候选修改保留。未修改生产输入、绘制或世界热路径；Phase 579 正式四层静止性能增量 FAIL 继续有效，没有重复无关全量 CI。R1.W024、P2.1a、正式证据冻结和所有者美术接受仍未完成。
