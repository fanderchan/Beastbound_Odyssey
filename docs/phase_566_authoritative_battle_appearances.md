# Phase 566：战斗保留队友的权威人物外观

日期：2026-09-19。承接 Phase 563–565 的同屏人物、静止刷新和地面图层。修复五人守护战中“地图人物不同，开战后全部变成见习猎人”的实际回归；R1.W024 继续执行。

## 原因与修复

原试玩夹具的五个账号使用相同外观、相同格子，掩盖了人物投影缺陷。夹具 v3 改用现有四套人物，分开站在五个可走、可组队挑战的位置。真实 Main 显示地图外观正确，而战斗全部变成默认猎人。服务端房间本来就有正确的 `appearanceId`，客户端 `ServerBattleRoomModel` 在新建 actor 和应用回合快照时遗漏了它。

两条投影路径现在传递该字段；缺字段的增量保留已有外观。初始旧房间的本人外观和未知远端外观仍使用现有渲染器回退。房间恢复、双方视角、回放开始与结束都走同一合同。未改变服务端协议、存档、人物比例、动画源图、宠物能力、奖励或美术开放状态。行为意图沿用 Phase 563 已核对的 StoneAge 角色外观投影参考，不新增产品规则。

## 回归与完整试玩

人物检查现在从服务端房间构建真正的客户端状态，再交给 Main 的外观解析入口；覆盖四外观、两个账号视角、初始／恢复、回放前后快照、缺字段保留、旧房间回退、未知 ID 和输入对象不变。旧模型确实失败，修复后通过。试玩自动检查还验证四个远端节点的正式图、与本人相同比例、实际静止定时 HTTP 刷新后保留、五个战斗人物的外观，以及战斗地面隐藏／返回恢复。

```sh
node tools/run_godot_auto_checks.mjs --only=--auto-character-runtime-appearance-check,--auto-server-battle-target-mapping-check,--auto-server-battle-reaction-replay-check,--auto-server-battle-boss-replay-check --fail-fast --output-dir .run/godot_auto_checks/phase566-appearance-green
node --test tools/test/guardian_review_backend.test.cjs
python3 -B -m unittest discover -s tools/test -p test_play_guardian_review.py
python3 -B tools/play_guardian_review.py --record --autoplay --timeout-seconds 360
```

客户端含解析 `5/5`，Node `2/2`，Python `3/3`。客户端摘要 `2026-09-18T22-37-51-096Z_summary.json`；负向日志在 `phase566-appearance-red/`。首次命令误用不存在的 boss-intent 检查名，被工具拒绝；已改成实际 boss-replay 入口，不计作测试通过。

最终原生 Main 证据：`.run/guardian-review/20260918T224956.308973Z/`。一个真实 Main 加四个 HTTP 驱动账号，完成跨帧左键移动／遮挡、挑战、人物攻击、宠物冲撞、蓄力防御、人物倒地下宠物指令、自动战斗和胜利返回。五个账号均 `revision 102→103`、地之戒 `+1`，外观没有被结算覆盖。初始地图五人及战斗四套造型已实际审图；返回后的四个远端节点继续存在，但镜头并不保证把静止站在原地的全队始终收入画面，节点可见性断言不等于全屏构图验收。

原速片 `guardian-1x.mp4` 为 1280×720、30 FPS、4382 帧、146.066667 秒，全片解码通过；SHA-256 `83773382c83abf76517d8251cf7c72fbcb6b2eee1f36f66194fd9d27f25b4ee4`。该次 `review-sources.json` 固定模型、夹具、录制器和 QA 脚本哈希。地图运行指纹仍为 `9150c7d3…`；它不代替战斗源码哈希。录像使用真实 Metal 渲染和引擎内跨帧输入，`computerUse=false`，不等于前台鼠标、五真人、平衡或所有者验收。

## 录制中断的根因与处理

此前三次运行分别在请求失败、`ECONNRESET` 和超时后中断；失败目录 `20260918T221911.167078Z`、`20260918T223834.846377Z`、`20260918T224205.931861Z` 原样保留。最初只记录 `fetch failed`，无法判断原因。现在工具记录请求方法、路由、耗时和传输错误类型，不记录令牌、请求体或原始错误文本，也不重试结果不明的写请求。后端意外退出时，监视器结束本次客户端并保留明确失败，不再等到整场录制超时。

第三次失败的客户端采样出现 `50.966s / 16 frames` 的停顿，Node 的 10 秒请求实际过了 50.902 秒才超时。macOS 电源日志确认 06:45:10 进入 Maintenance Sleep，06:46:03 从 Deep Idle 唤醒。关闭 HTTP 连接复用没有解决问题，该试探修改已撤回。电源证据保存在 `.run/phase566-sleep-diagnosis.log`。

macOS 录制器现在仅在自身运行期间持有 `caffeinate -is -w <pid>`；不解除锁屏、不唤醒显示器、不修改系统电源设置，异常退出也释放断言。最终完整运行的半秒状态采样最大实际间隔为 `0.601s`，后端和客户端正常退出，片源转换成功。失败退出监视和电源断言的正常／异常释放均有定向测试。

## 性能与后续

二层世界静止／移动各一次前后对照，180 帧预热、480 帧采样，保存为 `.run/phase566-world-performance.json`。移动双方均接纳 60 次跨帧点击／120 个输入事件，投影差异为 0，最终格一致。

| headless 脚本区段，ms/帧 | 修改前 | 修改后 |
| --- | ---: | ---: |
| 静止 process_scope | 0.035000 | 0.034375 |
| 移动 process_scope | 0.064625 | 0.067125 |
| 移动 draw_world | 0.000875 | 0.000875 |

这是非前台脚本诊断，不宣称 FPS 提升。四套战斗人物还暴露了新性能缺口：最终完整运行首次准备 `430.989ms`，其中人物纹理 `424.329ms`；现有后台预取只覆盖本人，另外三套仍同步加载。下一步补齐有界队友人物预取，不能套用 Phase 549 全员相同外观时约 10ms 的结论。

所有本轮进程及 QA lane 清理，真实用户目录 SHA-256 仍为 `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`。107 项候选地图文件及四项历史证据逐文件未变。未运行全量 CI、共享服务或数据库操作；Mac 仍锁定，四层正式前台性能、当前源码完整鼠标证据和老板视觉接受继续待完成，不勾选 R1.W024 / P2.1a / P2.2b。
