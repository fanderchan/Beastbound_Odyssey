# Phase 584：守护战后台录制连续绘制

日期：2026-09-20。继续 R1.W024。修复隔离守护战试玩的后台截图等待与缺少绘制验证，完整自动战斗、结算和资源清理通过；实际鼠标双倒地与连续出洞尚未完成，联网稳定性仍有新发现待修复。

## 录制入口

Phase 554 已解决地图审片窗口被系统遮挡时跳过绘制、截图等待不推进的问题，但守护战入口尚未复用。Phase 583 的自动诊断曾停在 `frame_post_draw`；当前鼠标复验也出现窗口定位失败，不能把过期窗口图片或单纯运行结束当作有效路线证据。

`guardian_battle_review.gd` 现在复用现有 `ReviewCaptureRenderPump`，在完成隔离初始化后开始，在退出清理前停止并保存 `render-continuity.json`。它仅在不可绘制时更新真实 viewport，不抢焦点、不恢复系统窗口，不进入普通玩家或性能采样路径。

原 Earth Vein 录像器的连续绘制校验抽到一个共享 Python 模块；原异常类型、逐帧范围与拒绝条件保持不变，依赖纳入原录像器的 harness 哈希。守护战入口也必须提供完整回执，否则即使日志没有 ERROR 也不能通过。已有缺帧、错类型、截短及冒充性能证据检查继续通过，另补守护战文件读取／缺失／无效根节点回归。

## 实际结果

基线为 `9b3511d0d4759a8bb7c1d4f3ec01b78bc0453d2b` 加本阶段变更。最终运行前后核对 **824 个源码／数据文件哈希一致**。为区分用户原有项目管理器，使用官方 Godot 4.7 应用的本机 QA 副本，只调整 bundle 名称／标识并作本地签名；原始应用未改，来源摘要保存在 `.run/phase584-native-review/qa-app-provenance.json`。

```sh
python3 tools/play_guardian_review.py --godot '<本机 QA Godot 路径>' --autoplay --record --timeout-seconds 600
```

结果见 [本机核对摘要](../.run/phase584-native-review/verification-summary.json)，原生资料在 `.run/guardian-review/20260920T044252.475771Z/`：

- 真实 Main、四个 HTTP 测试队友及正式权威结算完成 **10 回合胜利**；五账号均 `revision 102→103`、地之戒 `+1`、石币 `+210`。
- 自动输入覆盖走路遮挡、地图寻路、挑战、人物攻击／防御、宠物技能／防御、人物倒地后宠物指令、自动战斗与回图。`computerUse=false`，不替代人工鼠标或主控双方均倒地回归。
- **4224 个完成的逻辑帧，3029 次后台补绘，缺帧 0**。世界地面在战斗隐藏、结算后恢复；已审看开战与胜利截图，洞穴背景、角色／战宠和回图奖励可见。
- MP4 **1280×720、30 FPS、4286 帧／142.866667 秒**，完整解码通过。SHA-256 `a5a82a99ba5fcad987f212dc1197104a8b28eeaab046393a07898dccfa09fba0`。录像时长是固定步长审片时间，不能代表正常时钟操作耗时或前台性能。
- 无脚本／引擎错误，客户端退出及进程组回收通过，后端关闭，隔离目录清理，真实玩家目录不变。

## 新发现与保留边界

虽然未出现 429，服务器仍接受了 **8 次连接**，战斗开始后事件流游标停在 19，客户端反复重连；服务端拒绝、心跳超时、协议违规及慢客户端计数均为 0。战斗依靠 HTTP 状态同步完成，因此该次 runner 和自动流程通过不等于事件流健康。留存回合事件实际约 **56–81KB**，结束事件约 **115KB**；下一步检查客户端接收上限与断开原因，不放宽服务端限流或将缺少 ERROR 当作完整验收。

前一轮实际鼠标运行 `.run/guardian-review/20260920T042948.572309Z/` 只完成四层移动与队友菜单，未开战，保留为未完成证据。原始工具记录 15 次调用、9 张图片、5 次错误；独立 bundle 能区分应用，但未解决所有窗口工具故障。原始记录 SHA-256 `49c147a963d2e551e28058a97713cdfa61e4e74fedcf56e17517aad3f476e952`。本轮没有关闭用户原有 Godot 项目管理器。

## 验证

```sh
git diff --check
python3 -B -m unittest tools/test/test_play_guardian_review.py tools/test/test_record_earth_vein_review_batch.py
node tools/run_godot_auto_checks.mjs --parse-only --output-dir=.run/godot_auto_checks/phase584-render-parse
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
```

Python **32/32**、Godot 解析 **1/1** 和上述完整原生自动运行通过。没有修改普通游戏逻辑、美术或性能门槛，未重复全量 CI。111 项保护文件未变，原有 107 项候选改动保留；正式静止增量、当前真实操作与配对、P2.1a、R1.W024 和所有者美术接受继续待办。
